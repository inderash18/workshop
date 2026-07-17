from datetime import datetime
from pymongo import MongoClient
from config.settings import Config

_client = None
_db = None
_collection = None


def _get_collection():
    global _client, _db, _collection
    if _collection is None:
        _client = MongoClient(Config.MONGODB_URI)
        _db = _client[Config.MONGODB_DB]
        _collection = _db[Config.MONGODB_COLLECTION]
    return _collection


def load_db():
    col = _get_collection()
    try:
        doc = col.find_one({"_id": "global_state"})
        if doc:
            _ensure_keys(doc)
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
    col = _get_collection()
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
    }


def _ensure_keys(doc):
    defaults = {
        "candidates": [],
        "admins": [{"username": "admin", "password_hash": ""}],
        "login_attempts": {},
        "audit_log": [],
        "results_published": False,
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
