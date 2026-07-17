from datetime import datetime
from pymongo import MongoClient, ASCENDING, DESCENDING
from config.settings import Config

_client = None
_db = None

COLLECTIONS = {
    "state": "state",
    "tests": "tests",
    "test_assignments": "test_assignments",
    "security_events": "security_events",
}


def _get_db():
    global _client, _db
    if _db is None:
        _client = MongoClient(Config.MONGODB_URI)
        _db = _client[Config.MONGODB_DB]
        _ensure_indexes(_db)
    return _db


def _ensure_indexes(db):
    try:
        db["tests"].create_index([("status", ASCENDING)])
        db["tests"].create_index([("created_at", DESCENDING)])
        db["test_assignments"].create_index([("test_id", ASCENDING), ("candidate_id", ASCENDING)], unique=True)
        db["test_assignments"].create_index([("candidate_id", ASCENDING)])
        db["test_assignments"].create_index([("test_id", ASCENDING), ("status", ASCENDING)])
        db["security_events"].create_index([("test_assignment_id", ASCENDING)])
        db["security_events"].create_index([("candidate_id", ASCENDING)])
        db["security_events"].create_index([("timestamp", DESCENDING)])
    except Exception:
        pass


def _col(name):
    return _get_db()[COLLECTIONS.get(name, name)]


def load_db():
    col = _col("state")
    try:
        doc = col.find_one({"_id": "global_state"})
        if doc:
            _ensure_state_keys(doc)
            return doc
    except Exception as e:
        print(f"[DB] Read error: {e}, using in-memory fallback")

    doc = _empty_state()
    try:
        col.insert_one(doc)
    except Exception:
        pass
    return doc


def save_db(db):
    col = _col("state")
    db["_id"] = "global_state"
    try:
        col.replace_one({"_id": "global_state"}, db, upsert=True)
    except Exception as e:
        print(f"[DB] Write error: {e}")
        raise


def _empty_state():
    from middleware.security import hash_password
    return {
        "_id": "global_state",
        "candidates": [],
        "admins": [{"username": "admin", "password_hash": hash_password("admin2026")}],
        "login_attempts": {},
        "audit_log": [],
        "results_published": False,
        "settings": {
            "leaderboard_enabled": False,
        },
    }


def _ensure_state_keys(doc):
    defaults = {
        "candidates": [],
        "admins": [{"username": "admin", "password_hash": ""}],
        "login_attempts": {},
        "audit_log": [],
        "results_published": False,
        "settings": {"leaderboard_enabled": False},
    }
    changed = False
    for key, val in defaults.items():
        if key not in doc:
            doc[key] = val
            changed = True
    if changed:
        save_db(doc)


def get_candidate_by_email(email):
    db = load_db()
    return next((c for c in db["candidates"] if c.get("email") == email), None)


def get_candidate_by_id(candidate_id):
    db = load_db()
    return next(
        (c for c in db["candidates"] if c.get("candidate_id") == candidate_id), None
    )


def generate_candidate_id(db):
    existing = {c.get("candidate_id") for c in db["candidates"]}
    import random
    for _ in range(100):
        cid = f"AINEXT2026-{random.randint(1000, 9999)}"
        if cid not in existing:
            return cid
    raise RuntimeError("Cannot generate unique candidate ID")


def audit_log(action, user=None, details=None, ip=None):
    db = load_db()
    entry = {
        "timestamp": datetime.now().isoformat(),
        "action": action,
        "user": user or "system",
        "details": details or {},
        "ip": ip or "unknown",
    }
    db.setdefault("audit_log", []).append(entry)
    if len(db["audit_log"]) > Config.MAX_AUDIT_LOG_ENTRIES:
        db["audit_log"] = db["audit_log"][-Config.MAX_AUDIT_LOG_ENTRIES:]
    save_db(db)


# ─── TEST OPERATIONS ───

def create_test(test_data):
    col = _col("tests")
    test_data["created_at"] = datetime.now().isoformat()
    test_data["updated_at"] = datetime.now().isoformat()
    result = col.insert_one(test_data)
    test_data["_id"] = result.inserted_id
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


# ─── TEST ASSIGNMENT OPERATIONS ───

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


def get_assignments_for_test(test_id):
    col = _col("test_assignments")
    return list(col.find({"test_id": test_id}))


def get_assignments_for_candidate(candidate_id):
    col = _col("test_assignments")
    return list(col.find({"candidate_id": candidate_id}))


def get_assignments_for_test_by_status(test_id, status):
    col = _col("test_assignments")
    return list(col.find({"test_id": test_id, "status": status}))


# ─── SECURITY EVENT OPERATIONS ───

def log_security_event(event_data):
    col = _col("security_events")
    event_data["timestamp"] = datetime.now().isoformat()
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


# ─── SETTINGS ───

def get_setting(key, default=None):
    db = load_db()
    return db.get("settings", {}).get(key, default)


def update_setting(key, value):
    db = load_db()
    db.setdefault("settings", {})[key] = value
    save_db(db)
