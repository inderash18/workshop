import functools
from datetime import datetime, timedelta

from flask import request, jsonify

from core.config.settings import Config
from core.database.models import load_db, save_db


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


def record_login_attempt(key, success=False, max_attempts=None, lockout_minutes=None):
    max_attempts = max_attempts or Config.MAX_LOGIN_ATTEMPTS
    lockout_minutes = lockout_minutes or Config.LOGIN_LOCKOUT_MINUTES

    db = load_db()
    attempts = db.setdefault("login_attempts", {})

    if key not in attempts:
        attempts[key] = {"count": 0, "lockout_until": None}

    if success:
        attempts[key]["count"] = 0
        attempts[key]["lockout_until"] = None
    else:
        attempts[key]["count"] = attempts[key].get("count", 0) + 1
        if attempts[key]["count"] >= max_attempts:
            until = datetime.now() + timedelta(minutes=lockout_minutes)
            attempts[key]["lockout_until"] = until.isoformat()

    db["login_attempts"] = attempts
    save_db(db)


def rate_limit(key_prefix, max_attempts, lockout_minutes):
    def decorator(f):
        @functools.wraps(f)
        def wrapper(*args, **kwargs):
            if request.method in {"POST", "PUT", "DELETE", "PATCH"}:
                ip = request.remote_addr or "unknown"
                key = f"{key_prefix}_{ip}"
                if is_rate_limited(key, max_attempts, lockout_minutes):
                    return jsonify({
                        "error": "Too many requests. Please try again later."
                    }), 429
            return f(*args, **kwargs)
        return wrapper
    return decorator
