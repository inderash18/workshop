from functools import wraps
from flask import session, jsonify, request

from middleware.rate_limiter import is_rate_limited


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user_email" not in session:
            if request.path.startswith("/api/"):
                return jsonify({"error": "Authentication required"}), 401
            from flask import redirect, url_for
            return redirect(url_for("auth.login_page"))
        return f(*args, **kwargs)
    return decorated


def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "admin_logged_in" not in session:
            if request.path.startswith("/api/"):
                return jsonify({"error": "Admin authentication required"}), 401
            from flask import redirect, url_for
            return redirect(url_for("admin.admin_login_page"))
        return f(*args, **kwargs)
    return decorated


def rate_limit(key_func, max_attempts=None, lockout_minutes=None):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            key = key_func()
            if is_rate_limited(key, max_attempts, lockout_minutes):
                return jsonify({"error": "Too many attempts. Try again later."}), 429
            return f(*args, **kwargs)
        return decorated
    return decorator
