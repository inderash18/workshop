import os
import json
import random
from datetime import datetime, timedelta
from pymongo import MongoClient, ASCENDING, DESCENDING
from bson import ObjectId
from config.settings import Config

_client = None
_db = None

class MockCursor:
    def __init__(self, docs, projection=None):
        self._docs = docs
        self._projection = projection
        self._index = 0

    def sort(self, key, direction=1):
        reverse = (direction == -1)
        def get_sort_key(doc):
            val = doc.get(key)
            if val is None:
                return ""
            return val
        try:
            self._docs = sorted(self._docs, key=get_sort_key, reverse=reverse)
        except Exception:
            pass
        return self

    def limit(self, n):
        self._docs = self._docs[:n]
        return self

    def skip(self, n):
        self._docs = self._docs[n:]
        return self

    def __iter__(self):
        for doc in self._docs:
            yield self._apply_projection(doc)

    def __getitem__(self, index):
        if isinstance(index, slice):
            sliced = self._docs[index]
            return [self._apply_projection(d) for d in sliced]
        return self._apply_projection(self._docs[index])

    def _apply_projection(self, doc):
        if not self._projection:
            return dict(doc)
        projected = {}
        for k, v in self._projection.items():
            if v:
                if k in doc:
                    projected[k] = doc[k]
        if "_id" in doc and self._projection.get("_id", 1):
            projected["_id"] = doc["_id"]
        return projected

class LocalJSONClient:
    def __init__(self, filename):
        self.filename = os.path.abspath(filename)
        self._data = {}
        self._load()

    def _load(self):
        if os.path.exists(self.filename):
            try:
                with open(self.filename, 'r', encoding='utf-8') as f:
                    self._data = json.load(f)
            except Exception as e:
                print(f"[LocalDB] Error loading file: {e}")
                self._data = {}
        else:
            self._data = {}

    def _save(self):
        try:
            with open(self.filename, 'w', encoding='utf-8') as f:
                json.dump(self._data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[LocalDB] Error saving file: {e}")

    def __getitem__(self, db_name):
        return LocalJSONDatabase(self, db_name)

class LocalJSONDatabase:
    def __init__(self, client, db_name):
        self.client = client
        self.db_name = db_name

    def __getitem__(self, col_name):
        return LocalJSONCollection(self.client, self.db_name, col_name)

class LocalJSONCollection:
    def __init__(self, client, db_name, col_name):
        self.client = client
        self.db_name = db_name
        self.col_name = col_name
        
        if self.db_name not in self.client._data:
            self.client._data[self.db_name] = {}
        if self.col_name not in self.client._data[self.db_name]:
            self.client._data[self.db_name][self.col_name] = []
            
        self._docs = self.client._data[self.db_name][self.col_name]

    def _save(self):
        self.client._save()

    def _match(self, doc, filter_dict):
        if not filter_dict:
            return True
        for k, v in filter_dict.items():
            doc_val = doc.get(k)
            if isinstance(v, dict):
                if "$in" in v:
                    if doc_val not in v["$in"] and not any(str(doc_val) == str(item) for item in v["$in"]):
                        return False
                elif "$ne" in v:
                    if doc_val == v["$ne"] or str(doc_val) == str(v["$ne"]):
                        return False
                else:
                    return False
            else:
                if doc_val == v:
                    continue
                if str(doc_val) == str(v):
                    continue
                return False
        return True

    def create_index(self, keys, unique=False):
        return f"{self.col_name}_index"

    def count_documents(self, filter_dict):
        count = 0
        for doc in self._docs:
            if self._match(doc, filter_dict):
                count += 1
        return count

    def find_one(self, filter_dict=None):
        filter_dict = filter_dict or {}
        for doc in self._docs:
            if self._match(doc, filter_dict):
                return dict(doc)
        return None

    def find(self, filter_dict=None, projection=None):
        filter_dict = filter_dict or {}
        matching_docs = []
        for doc in self._docs:
            if self._match(doc, filter_dict):
                matching_docs.append(dict(doc))
        return MockCursor(matching_docs, projection)

    def insert_one(self, document):
        doc_copy = dict(document)
        if "_id" not in doc_copy:
            doc_copy["_id"] = str(ObjectId())
        elif isinstance(doc_copy["_id"], ObjectId):
            doc_copy["_id"] = str(doc_copy["_id"])
        self._docs.append(doc_copy)
        self._save()
        class InsertOneResult:
            def __init__(self, inserted_id):
                self.inserted_id = inserted_id
        return InsertOneResult(doc_copy["_id"])

    def insert_many(self, documents):
        inserted_ids = []
        for doc in documents:
            doc_copy = dict(doc)
            if "_id" not in doc_copy:
                doc_copy["_id"] = str(ObjectId())
            elif isinstance(doc_copy["_id"], ObjectId):
                doc_copy["_id"] = str(doc_copy["_id"])
            self._docs.append(doc_copy)
            inserted_ids.append(doc_copy["_id"])
        self._save()
        class InsertManyResult:
            def __init__(self, inserted_ids):
                self.inserted_ids = inserted_ids
        return InsertManyResult(inserted_ids)

    def replace_one(self, filter_dict, replacement, upsert=False):
        matched = False
        replacement_copy = dict(replacement)
        if "_id" in replacement_copy and isinstance(replacement_copy["_id"], ObjectId):
            replacement_copy["_id"] = str(replacement_copy["_id"])
            
        for idx, doc in enumerate(self._docs):
            if self._match(doc, filter_dict):
                if "_id" not in replacement_copy and "_id" in doc:
                    replacement_copy["_id"] = doc["_id"]
                self._docs[idx] = replacement_copy
                matched = True
                break
        if not matched and upsert:
            if "_id" not in replacement_copy:
                if "_id" in filter_dict:
                    replacement_copy["_id"] = str(filter_dict["_id"])
                else:
                    replacement_copy["_id"] = str(ObjectId())
            self._docs.append(replacement_copy)
        self._save()
        
        class ReplaceOneResult:
            def __init__(self, matched_count, modified_count):
                self.matched_count = matched_count
                self.modified_count = modified_count
        return ReplaceOneResult(1 if matched else 0, 1 if matched else 0)

    def update_one(self, filter_dict, update, upsert=False):
        set_data = update.get("$set", {})
        matched = False
        for idx, doc in enumerate(self._docs):
            if self._match(doc, filter_dict):
                for k, v in set_data.items():
                    if isinstance(v, ObjectId):
                        v = str(v)
                    doc[k] = v
                matched = True
                break
        if not matched and upsert:
            new_doc = {}
            for k, v in filter_dict.items():
                new_doc[k] = v
            for k, v in set_data.items():
                if isinstance(v, ObjectId):
                    v = str(v)
                new_doc[k] = v
            if "_id" not in new_doc:
                new_doc["_id"] = str(ObjectId())
            self._docs.append(new_doc)
        self._save()
        
        class UpdateOneResult:
            def __init__(self, matched_count, modified_count):
                self.matched_count = matched_count
                self.modified_count = modified_count
        return UpdateOneResult(1 if matched else 0, 1 if matched else 0)

    def delete_one(self, filter_dict):
        matched = False
        for idx, doc in enumerate(self._docs):
            if self._match(doc, filter_dict):
                self._docs.pop(idx)
                matched = True
                break
        if matched:
            self._save()
        class DeleteResult:
            def __init__(self, deleted_count):
                self.deleted_count = deleted_count
        return DeleteResult(1 if matched else 0)

    def delete_many(self, filter_dict):
        initial_len = len(self._docs)
        self.client._data[self.db_name][self.col_name] = [
            doc for doc in self._docs if not self._match(doc, filter_dict)
        ]
        self._docs = self.client._data[self.db_name][self.col_name]
        deleted_count = initial_len - len(self._docs)
        if deleted_count > 0:
            self._save()
        class DeleteResult:
            def __init__(self, deleted_count):
                self.deleted_count = deleted_count
        return DeleteResult(deleted_count)

COLLECTIONS = {
    "state": "state",
    "tests": "tests",
    "test_assignments": "test_attempts",
    "security_events": "security_logs",
    "candidates": "candidates",
    "activity_logs": "activity_logs",
    "question_bank": "question_bank",
    "answers": "answers",
    "scores": "scores",
    "ai_evaluations": "ai_evaluations",
    "admin_shortlist": "admin_shortlist",
    "final_results": "final_results",
    "sessions": "sessions",
    "test_configuration": "test_configuration",
    "analytics": "analytics"
}


def _get_db():
    global _client, _db
    if _db is None:
        try:
            _client = MongoClient(Config.MONGODB_URI, serverSelectionTimeoutMS=2000)
            _client.admin.command('ping')
            _db = _client[Config.MONGODB_DB]
            _ensure_indexes(_db)
            print("[DB] Connected successfully to MongoDB Atlas")
        except Exception as e:
            print(f"[DB] MongoDB Atlas connection failed: {e}")
            print("[DB] Falling back to local persistent JSON database: db.json")
            _client = LocalJSONClient("db.json")
            _db = _client[Config.MONGODB_DB]
            _ensure_indexes(_db)
    return _db


def _col(name):
    return _get_db()[COLLECTIONS.get(name, name)]


class TrackedDict(dict):
    def __init__(self, data, proxy):
        super().__init__(data)
        self._proxy = proxy

    def __setitem__(self, key, value):
        super().__setitem__(key, value)
        col = self._proxy._col()
        ukey = self._proxy.unique_key
        uval = self.get(ukey)
        if uval:
            col.update_one({ukey: uval}, {"$set": {key: value}})

    def update(self, other_dict):
        super().update(other_dict)
        col = self._proxy._col()
        ukey = self._proxy.unique_key
        uval = self.get(ukey)
        if uval:
            col.update_one({ukey: uval}, {"$set": other_dict})


class MongoCollectionProxy:
    def __init__(self, col_name, unique_key="candidate_id"):
        self.col_name = col_name
        self.unique_key = unique_key

    def _col(self):
        return _col(self.col_name)

    def append(self, item):
        self._col().insert_one(item)

    def __iter__(self):
        for doc in self._col().find():
            yield TrackedDict(doc, self)

    def __len__(self):
        return self._col().count_documents({})

    def __getitem__(self, index):
        if isinstance(index, slice):
            start = index.start or 0
            stop = index.stop
            step = index.step or 1
            cursor = self._col().find()
            if stop is not None:
                cursor = cursor.skip(start).limit(stop - start)
            else:
                cursor = cursor.skip(start)
            results = [TrackedDict(doc, self) for doc in cursor]
            return results[::step]
        
        docs = list(self._col().find())
        return docs[index]


class VirtualStateDict(dict):
    def __init__(self, data):
        super().__init__(data)
        self._proxies = {
            "candidates": MongoCollectionProxy("candidates", unique_key="candidate_id"),
            "audit_log": MongoCollectionProxy("activity_logs", unique_key="_id")
        }

    def __getitem__(self, key):
        if key in self._proxies:
            return self._proxies[key]
        return super().__getitem__(key)

    def get(self, key, default=None):
        if key in self._proxies:
            return self._proxies[key]
        return super().get(key, default)

    def setdefault(self, key, default=None):
        if key in self._proxies:
            return self._proxies[key]
        return super().setdefault(key, default)


def seed_questions(db):
    try:
        puzzles = [
            {
                "id": "puzzle_01",
                "title": "Hat Logic Puzzle",
                "description": "Three students (A, B, C) sit in a line. C sits in the back and can see B and A. B sits in the middle and can see A. A sits in the front and can see no one. They are shown 3 red hats and 2 white hats. They close their eyes, and one hat is placed on each student. The remaining hats are hidden. When asked their hat color, C says: 'I do not know.' B then says: 'I do not know.' Finally, A says: 'I know my hat color!' What color is A's hat?",
                "category": "Logic",
                "difficulty_level": "medium",
                "correct_answer": "Red",
                "explanation": "If A and B both had white hats, C would immediately know they had red. Since C doesn't know, A and B are not both white. If A had a white hat, B would know A had white, and since A and B are not both white, B would deduce they had a red hat. Since B doesn't know, A must have a red hat.",
                "marks": 10,
                "time_limit": 60,
                "question_type": "mcq",
                "options": ["Red", "White", "Undetermined"],
                "is_active": True,
                "created_at": datetime.now().isoformat()
            },
            {
                "id": "puzzle_02",
                "title": "Look and Say Sequence",
                "description": "Observe the following sequence of numbers: 1, 11, 21, 1211, 111221. What is the next number in this sequence?",
                "category": "Pattern Recognition",
                "difficulty_level": "medium",
                "correct_answer": "312211",
                "explanation": "Each term describes the previous term. 11 is 'one 1'. 21 is 'two 1s'. 1211 is 'one 2, one 1'. 111221 is 'one 1, one 2, two 1s'. The next term is 'three 1s, two 2s, one 1', which is 312211.",
                "marks": 10,
                "time_limit": 60,
                "question_type": "text",
                "is_active": True,
                "created_at": datetime.now().isoformat()
            },
            {
                "id": "puzzle_03",
                "title": "Duncker's Candle Problem",
                "description": "You are given a candle, a box of thumbtacks, and a book of matches. How can you mount the candle on a cork bulletin board so that it burns cleanly without dripping wax onto the table below?",
                "category": "Innovation",
                "difficulty_level": "hard",
                "correct_answer": "Empty the box of thumbtacks, pin the box to the board, and place the candle inside it.",
                "explanation": "To solve this, you must overcome functional fixedness and see the box of tacks as a candle holder rather than just a container.",
                "marks": 10,
                "time_limit": 60,
                "question_type": "mcq",
                "options": [
                    "Tack the candle directly to the board.",
                    "Melt the candle back to stick it to the board.",
                    "Empty the box of thumbtacks, pin the box to the board, and place the candle inside it.",
                    "Hold the candle against the board until it sticks."
                ],
                "is_active": True,
                "created_at": datetime.now().isoformat()
            },
            {
                "id": "puzzle_04",
                "title": "River Crossing Puzzle",
                "description": "A farmer needs to cross a river with a wolf, a goat, and a cabbage. His boat can only hold himself and one of the three. If left alone, the wolf will eat the goat, or the goat will eat the cabbage. How many total river trips must the farmer make to safely cross everyone?",
                "category": "Problem Solving",
                "difficulty_level": "medium",
                "correct_answer": "7",
                "explanation": "Trip 1: Take goat across. Trip 2: Return alone. Trip 3: Take wolf across. Trip 4: Return with goat. Trip 5: Take cabbage across. Trip 6: Return alone. Trip 7: Take goat across. Total = 7 trips.",
                "marks": 10,
                "time_limit": 60,
                "question_type": "mcq",
                "options": ["5", "7", "9", "11"],
                "is_active": True,
                "created_at": datetime.now().isoformat()
            },
            {
                "id": "puzzle_05",
                "title": "The False Coin Problem",
                "description": "You have 9 identical-looking coins. One is counterfeit and slightly lighter than the others. Using a balance scale, what is the minimum number of weighings needed to guarantee finding the fake coin?",
                "category": "Critical Thinking",
                "difficulty_level": "hard",
                "correct_answer": "2",
                "explanation": "Divide coins into three groups of 3. Weigh group A against B. If they balance, fake is in C. If A is lighter, fake is in A. Take the lighter group, choose 2 coins, and weigh them. If they balance, the third coin is fake. Otherwise, the lighter one is fake. Total = 2 weighings.",
                "marks": 10,
                "time_limit": 60,
                "question_type": "text",
                "is_active": True,
                "created_at": datetime.now().isoformat()
            },
            {
                "id": "puzzle_06",
                "title": "No-Letter Prompting",
                "description": "You need an LLM to generate a text about a sudden downpour, but you cannot use the letters 'e' or 'a' in your prompt. Write a simple prompt that forces the LLM to output a description of rain.",
                "category": "Prompt Engineering",
                "difficulty_level": "hard",
                "correct_answer": "Describe drops from sky.",
                "explanation": "This requires prompt design using strict constraint programming without default words.",
                "marks": 10,
                "time_limit": 60,
                "question_type": "text",
                "is_active": True,
                "created_at": datetime.now().isoformat()
            },
            {
                "id": "puzzle_07",
                "title": "The Two Hourglasses",
                "description": "You need to measure exactly 9 minutes of time using only a 4-minute hourglass and a 7-minute hourglass. What is the minimum number of times you must flip any hourglass to complete this measurement?",
                "category": "Logic",
                "difficulty_level": "hard",
                "correct_answer": "6",
                "explanation": "Start both. When 4 min expires (flip 1), 3 min remains in 7. When 7 min expires (flip 2), start measuring. Flip 4-min again (flip 3). When it expires, 1 min has passed. Start 4-min again (flip 4). When it expires, 5 mins have passed. Start 4-min again (flip 5). Total 9 minutes measured with 6 total flips.",
                "marks": 10,
                "time_limit": 60,
                "question_type": "mcq",
                "options": ["4", "5", "6", "8"],
                "is_active": True,
                "created_at": datetime.now().isoformat()
            },
            {
                "id": "puzzle_08",
                "title": "AI Self-Reference Paradox",
                "description": "If an AI system is trained to output the phrase 'I am lying' whenever it detects a contradiction, what does it output when it evaluates its own training rule?",
                "category": "AI Thinking",
                "difficulty_level": "expert",
                "correct_answer": "Infinite loop or paradox",
                "explanation": "This is a classic self-referential paradox that breaks binary logic checks.",
                "marks": 10,
                "time_limit": 60,
                "question_type": "mcq",
                "options": ["True", "False", "I am lying", "Infinite loop or paradox"],
                "is_active": True,
                "created_at": datetime.now().isoformat()
            },
            {
                "id": "puzzle_09",
                "title": "Startup Resource Constraints",
                "description": "A startup has a prototype that fails 50% of the time, and they only have budget to test it 3 times. What is the probability that they will get at least one successful run?",
                "category": "Startup Thinking",
                "difficulty_level": "medium",
                "correct_answer": "87.5%",
                "explanation": "The probability of failing all 3 times is (0.5)^3 = 12.5%. The probability of at least one success is 1 - 0.125 = 87.5%.",
                "marks": 10,
                "time_limit": 60,
                "question_type": "mcq",
                "options": ["50%", "75%", "87.5%", "93.75%"],
                "is_active": True,
                "created_at": datetime.now().isoformat()
            },
            {
                "id": "puzzle_10",
                "title": "Future Resource Scarcity",
                "description": "In a future smart city, electricity is allocated using a priority queue. If hospital systems have weight 10, public transit has weight 8, and residential has weight 5, which system will experience power shedding first under a 30% load deficit?",
                "category": "Future Thinking",
                "difficulty_level": "medium",
                "correct_answer": "Residential",
                "explanation": "Priority queues allocate resources to higher weights first, meaning lower weight systems (Residential) shed first.",
                "marks": 10,
                "time_limit": 60,
                "question_type": "mcq",
                "options": ["Hospitals", "Public Transit", "Residential", "Equally shared"],
                "is_active": True,
                "created_at": datetime.now().isoformat()
            }
        ]
        extra_puzzles = []
        for p in puzzles:
            p_copy = dict(p)
            p_copy["id"] = p_copy["id"] + "_alt"
            p_copy["title"] = p_copy["title"] + " (Variant B)"
            p_copy["created_at"] = datetime.now().isoformat()
            extra_puzzles.append(p_copy)
        db["question_bank"].insert_many(puzzles + extra_puzzles)
    except Exception as e:
        print(f"[DB Seed] Error seeding question bank: {e}")


def _ensure_indexes(db):
    try:
        db["candidates"].create_index([("candidate_id", ASCENDING)], unique=True)
        db["candidates"].create_index([("email", ASCENDING)], unique=True)
        
        db["question_bank"].create_index([("id", ASCENDING)], unique=True)
        db["question_bank"].create_index([("category", ASCENDING)])
        
        db["test_attempts"].create_index([("test_id", ASCENDING), ("candidate_id", ASCENDING)], unique=True)
        db["test_attempts"].create_index([("candidate_id", ASCENDING)])
        db["test_attempts"].create_index([("status", ASCENDING)])
        
        db["answers"].create_index([("candidate_id", ASCENDING), ("question_id", ASCENDING)], unique=True)
        
        db["scores"].create_index([("candidate_id", ASCENDING)], unique=True)
        
        db["security_logs"].create_index([("candidate_id", ASCENDING)])
        db["security_logs"].create_index([("test_id", ASCENDING)])
        db["security_logs"].create_index([("timestamp", DESCENDING)])
        
        db["final_results"].create_index([("candidate_id", ASCENDING)], unique=True)
        
        db["activity_logs"].create_index([("timestamp", DESCENDING)])
        db["activity_logs"].create_index([("action", ASCENDING)])
        
        db["tests"].create_index([("status", ASCENDING)])
        db["tests"].create_index([("created_at", DESCENDING)])
        
        db["test_configuration"].create_index([("key", ASCENDING)], unique=True)
        
        if db["question_bank"].count_documents({}) == 0:
            seed_questions(db)
    except Exception as e:
        print(f"[DB] Index creation error: {e}")


def load_db():
    col = _col("state")
    try:
        doc = col.find_one({"_id": "global_state"})
        if doc:
            return VirtualStateDict(doc)
    except Exception as e:
        print(f"[DB] Read error: {e}")

    from middleware.security import hash_password
    doc = {
        "_id": "global_state",
        "admins": [{"username": "admin", "password_hash": hash_password("admin2026")}],
        "login_attempts": {},
        "results_published": False,
        "settings": {
            "leaderboard_enabled": False,
        },
    }
    try:
        col.insert_one(doc)
    except Exception:
        pass
    return VirtualStateDict(doc)


def save_db(db_dict):
    col_state = _col("state")
    candidates_proxy = db_dict.pop("candidates", None)
    audit_log_proxy = db_dict.pop("audit_log", None)
    
    db_dict["_id"] = "global_state"
    try:
        col_state.replace_one({"_id": "global_state"}, dict(db_dict), upsert=True)
    except Exception as e:
        print(f"[DB] Write error: {e}")
        
    if candidates_proxy:
        db_dict["candidates"] = candidates_proxy
    if audit_log_proxy:
        db_dict["audit_log"] = audit_log_proxy


def get_candidate_by_email(email):
    col = _col("candidates")
    doc = col.find_one({"email": email})
    if doc:
        proxy = MongoCollectionProxy("candidates", unique_key="candidate_id")
        return TrackedDict(doc, proxy)
    return None


def get_candidate_by_id(candidate_id):
    col = _col("candidates")
    doc = col.find_one({"candidate_id": candidate_id})
    if doc:
        proxy = MongoCollectionProxy("candidates", unique_key="candidate_id")
        return TrackedDict(doc, proxy)
    return None


def generate_candidate_id(db=None):
    col = _col("candidates")
    existing = {c.get("candidate_id") for c in col.find({}, {"candidate_id": 1})}
    for _ in range(100):
        cid = f"AINEXT2026-{random.randint(1000, 9999)}"
        if cid not in existing:
            return cid
    raise RuntimeError("Cannot generate unique candidate ID")


def audit_log(action, user=None, details=None, ip=None):
    col = _col("activity_logs")
    entry = {
        "timestamp": datetime.now().isoformat(),
        "action": action,
        "user": user or "system",
        "details": details or {},
        "ip": ip or "unknown",
    }
    col.insert_one(entry)


# ─── TEST OPERATIONS ───

def create_test(test_data):
    col = _col("tests")
    test_data["created_at"] = datetime.now().isoformat()
    test_data["updated_at"] = datetime.now().isoformat()
    result = col.insert_one(test_data)
    test_data["_id"] = result.inserted_id
    
    sync_test_questions_to_bank(test_data)
    return test_data


def get_test_by_id(test_id):
    col = _col("tests")
    from bson import ObjectId
    try:
        return col.find_one({"_id": ObjectId(test_id)})
    except Exception:
        return col.find_one({"_id": test_id})


def get_test_by_id_str(test_id_str):
    col = _col("tests")
    from bson import ObjectId
    try:
        return col.find_one({"_id": ObjectId(test_id_str)})
    except Exception:
        return None


def update_test(test_id, update_data):
    col = _col("tests")
    from bson import ObjectId
    update_data["updated_at"] = datetime.now().isoformat()
    col.update_one({"_id": ObjectId(test_id)}, {"$set": update_data})
    
    test = get_test_by_id_str(test_id)
    if test:
        sync_test_questions_to_bank(test)


def delete_test(test_id):
    col = _col("tests")
    assign_col = _col("test_assignments")
    event_col = _col("security_events")
    from bson import ObjectId
    oid = ObjectId(test_id)
    assign_col.delete_many({"test_id": test_id})
    event_col.delete_many({"test_id": test_id})
    col.delete_one({"_id": oid})


def get_all_tests():
    col = _col("tests")
    return list(col.find().sort("created_at", DESCENDING))


def get_tests_by_status(status):
    col = _col("tests")
    return list(col.find({"status": status}).sort("created_at", DESCENDING))


# ─── TEST ATTEMPT / ASSIGNMENT OPERATIONS ───

def create_assignment(test_id, candidate_id):
    col = _col("test_assignments")
    existing = col.find_one({"test_id": test_id, "candidate_id": candidate_id})
    if existing:
        return existing
    assignment = {
        "test_id": test_id,
        "candidate_id": candidate_id,
        "status": "assigned",
        "started_at": None,
        "completed_at": None,
        "time_remaining": None,
        "current_question_index": 0,
        "answers": {},
        "violations": [],
        "violation_count": 0,
        "tab_switch_count": 0,
        "is_locked": False,
        "locked_reason": None,
        "ip_address": None,
        "created_at": datetime.now().isoformat(),
    }
    result = col.insert_one(assignment)
    assignment["_id"] = result.inserted_id
    return assignment


def get_assignment(test_id, candidate_id):
    col = _col("test_assignments")
    return col.find_one({"test_id": test_id, "candidate_id": candidate_id})


def get_assignment_by_id(assignment_id):
    col = _col("test_assignments")
    from bson import ObjectId
    try:
        return col.find_one({"_id": ObjectId(assignment_id)})
    except Exception:
        return None


def update_assignment(test_id, candidate_id, update_data):
    col = _col("test_assignments")
    col.update_one(
        {"test_id": test_id, "candidate_id": candidate_id},
        {"$set": update_data}
    )
    
    sync_attempt_data(test_id, candidate_id, update_data)


def get_assignments_for_test(test_id):
    col = _col("test_assignments")
    return list(col.find({"test_id": test_id}))


def get_assignments_for_candidate(candidate_id):
    col = _col("test_assignments")
    return list(col.find({"candidate_id": candidate_id}))


def get_assignments_for_test_by_status(test_id, status):
    col = _col("test_assignments")
    return list(col.find({"test_id": test_id, "status": status}))


# ─── SECURITY LOGS / EVENTS ───

def log_security_event(event_data):
    col = _col("security_events")
    event_data["timestamp"] = datetime.now().isoformat()
    
    event_data["violation_type"] = event_data.get("event_type", "unknown")
    event_data["browser_details"] = event_data.get("user_agent", "")
    event_data["session_details"] = event_data.get("test_assignment_id", "")
    event_data["time_remaining"] = event_data.get("time_remaining", 0)
    
    col.insert_one(event_data)
    return event_data


def get_security_events_for_assignment(assignment_id):
    col = _col("security_events")
    return list(col.find({"test_assignment_id": assignment_id}).sort("timestamp", DESCENDING))


def get_security_events_for_test(test_id):
    col = _col("security_events")
    return list(col.find({"test_id": test_id}).sort("timestamp", DESCENDING))


def get_security_events_for_candidate(candidate_id):
    col = _col("security_events")
    return list(col.find({"candidate_id": candidate_id}).sort("timestamp", DESCENDING))


# ─── CONFIGURATION SETTINGS ───

def get_setting(key, default=None):
    col = _col("test_configuration")
    doc = col.find_one({"key": key})
    if doc:
        return doc.get("value", default)
    db = load_db()
    return db.get("settings", {}).get(key, default)


def update_setting(key, value):
    col = _col("test_configuration")
    col.replace_one({"key": key}, {"key": key, "value": value}, upsert=True)
    
    db = load_db()
    db.setdefault("settings", {})[key] = value
    save_db(db)


# ─── SYNCHRONIZATION HELPERS ───

def sync_test_questions_to_bank(test_data):
    try:
        col = _col("question_bank")
        questions = test_data.get("questions", [])
        for i, q in enumerate(questions):
            q_id = q.get("id") or f"{test_data.get('_id')}_{i}"
            col.replace_one(
                {"id": q_id},
                {
                    "id": q_id,
                    "title": q.get("title") or q.get("text", "")[:50],
                    "description": q.get("text", ""),
                    "category": q.get("category", "General"),
                    "difficulty_level": q.get("difficulty", "medium"),
                    "correct_answer": q.get("correct_answer", ""),
                    "explanation": q.get("explanation", ""),
                    "marks": int(q.get("marks", 5)),
                    "time_limit": int(q.get("time_limit", 60)),
                    "question_type": q.get("type", "mcq"),
                    "is_active": True,
                    "created_at": datetime.now().isoformat()
                },
                upsert=True
            )
    except Exception as e:
        print(f"[DB Sync] Question bank sync error: {e}")


def sync_attempt_data(test_id, candidate_id, update_data):
    try:
        if "answers" in update_data:
            answers_col = _col("answers")
            for q_id, ans in update_data["answers"].items():
                answers_col.replace_one(
                    {"candidate_id": candidate_id, "question_id": q_id},
                    {
                        "candidate_id": candidate_id,
                        "question_id": q_id,
                        "answer": ans,
                        "submitted_time": datetime.now().isoformat(),
                        "time_taken": 0,
                        "marks_obtained": 0
                    },
                    upsert=True
                )
        
        if "scores" in update_data:
            scores_col = _col("scores")
            scores = update_data["scores"]
            scores_col.replace_one(
                {"candidate_id": candidate_id},
                {
                    "candidate_id": candidate_id,
                    "logic_score": float(scores.get("logic", 0.0)),
                    "creativity_score": float(scores.get("creativity", 0.0)),
                    "innovation_score": float(scores.get("innovation", 0.0)),
                    "problem_solving_score": float(scores.get("problem_solving", 0.0)),
                    "security_score": float(scores.get("security", 0.0)),
                    "ai_intelligence_score": float(scores.get("ai_knowledge", 0.0)),
                    "final_score": float(scores.get("final", 0.0))
                },
                upsert=True
            )
            
            results_col = _col("final_results")
            results_col.replace_one(
                {"candidate_id": candidate_id},
                {
                    "candidate_id": candidate_id,
                    "final_score": float(scores.get("final", 0.0)),
                    "ai_recommendation": "Recommended" if float(scores.get("final", 0.0)) >= 50 else "Not Recommended",
                    "admin_recommendation": "",
                    "final_selection_status": "Selected" if float(scores.get("final", 0.0)) >= 80 else "Rejected"
                },
                upsert=True
            )
            
            ai_col = _col("ai_evaluations")
            ai_col.replace_one(
                {"candidate_id": candidate_id},
                {
                    "candidate_id": candidate_id,
                    "logic_score": float(scores.get("logic", 0.0)),
                    "creativity_score": float(scores.get("creativity", 0.0)),
                    "innovation_score": float(scores.get("innovation", 0.0)),
                    "critical_thinking_score": float(scores.get("problem_solving", 0.0)),
                    "problem_solving_score": float(scores.get("problem_solving", 0.0)),
                    "human_intelligence_score": float(scores.get("ai_knowledge", 0.0)),
                    "security_score": float(scores.get("security", 0.0)),
                    "final_recommendation": "Highly Recommended" if float(scores.get("final", 0.0)) >= 80 else "Recommended" if float(scores.get("final", 0.0)) >= 50 else "Not Recommended"
                },
                upsert=True
            )
    except Exception as e:
        print(f"[DB Sync] Attempt/answers sync error: {e}")
