import json
import random
from datetime import datetime, timedelta
from pymongo import MongoClient, ASCENDING, DESCENDING
from config.settings import Config

_client = None
_db = None

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
        _client = MongoClient(Config.MONGODB_URI)
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
