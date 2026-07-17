from datetime import datetime, timedelta
from models.database import load_db, save_db
from config.settings import Config


def is_rate_limited(key, max_attempts=None, lockout_minutes=None):
    max_attempts = max_attempts or Config.MAX_LOGIN_ATTEMPTS
    lockout_minutes = lockout_minutes or Config.LOGIN_LOCKOUT_MINUTES

    db = load_db()
    attempts = db.get("login_attempts", {})
    if key not in attempts:
        return False

    data = attempts[key]
    if data["count"] >= max_attempts:
        lockout_until = data.get("lockout_until")
        if lockout_until:
            until = (
                datetime.fromisoformat(lockout_until)
                if isinstance(lockout_until, str)
                else lockout_until
            )
            if datetime.now() < until:
                return True
        data["count"] = 0
        data["lockout_until"] = None
        save_db(db)
    return False


def record_login_attempt(key, success=False):
    db = load_db()
    attempts = db.setdefault("login_attempts", {})

    if key not in attempts:
        attempts[key] = {"count": 0, "lockout_until": None}

    if success:
        attempts[key]["count"] = 0
        attempts[key]["lockout_until"] = None
    else:
        attempts[key]["count"] = attempts[key].get("count", 0) + 1
        if attempts[key]["count"] >= Config.MAX_LOGIN_ATTEMPTS:
            until = datetime.now() + timedelta(minutes=Config.LOGIN_LOCKOUT_MINUTES)
            attempts[key]["lockout_until"] = until.isoformat()

    db["login_attempts"] = attempts
    save_db(db)
