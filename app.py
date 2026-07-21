import os
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def _load_env():
    env_file = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_file):
        with open(env_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, val = line.split("=", 1)
                    key = key.strip()
                    val = val.strip().strip('"').strip("'")
                    os.environ.setdefault(key, val)


_load_env()

from flask import Flask, jsonify, request
from flask_cors import CORS
from core.config.settings import Config
from werkzeug.middleware.proxy_fix import ProxyFix


def _csrf_check():
    if request.method in {"POST", "PUT", "DELETE", "PATCH"}:
        is_api = request.path.startswith("/api/")
        if is_api:
            header = request.headers.get("X-Requested-With", "")
            token = request.headers.get("X-CSRF-Token", "")
            if header != "XMLHttpRequest" and not token:
                if Config.ENFORCE_CSRF:
                    from flask import abort
                    import logging
                    logging.getLogger(__name__).warning(
                        f"CSRF blocked: {request.method} {request.path} from {request.remote_addr}"
                    )
                    return abort(403, description="CSRF validation failed")
                import logging
                logging.getLogger(__name__).warning(
                    f"CSRF check (not enforced): {request.method} {request.path} "
                    f"from {request.remote_addr}"
                )


def create_app():
    app = Flask(__name__,
                template_folder='frontend/templates',
                static_folder='frontend/static',
                static_url_path='/static')
    
    # Load allowed origins dynamically from env, or default to known endpoints
    allowed_origins = os.environ.get("ALLOWED_ORIGINS")
    if allowed_origins:
        origins = [o.strip() for o in allowed_origins.split(",") if o.strip()]
    else:
        origins = [
            "https://workshop-eight-iota.vercel.app",
            "http://localhost:5000",
            "http://127.0.0.1:5000",
            "http://localhost:3000",
            "http://127.0.0.1:3000"
        ]
        
    CORS(app, supports_credentials=True, origins=origins)
    app.secret_key = Config.SECRET_KEY
    app.config["PERMANENT_SESSION_LIFETIME"] = __import__("datetime").timedelta(
        hours=Config.SESSION_LIFETIME_HOURS
    )
    app.config["SESSION_COOKIE_SECURE"] = Config.SESSION_COOKIE_SECURE
    app.config["SESSION_COOKIE_HTTPONLY"] = Config.SESSION_COOKIE_HTTPONLY
    app.config["SESSION_COOKIE_SAMESITE"] = Config.SESSION_COOKIE_SAMESITE
    app.wsgi_app = ProxyFix(app.wsgi_app)

    app.before_request(_csrf_check)

    @app.after_request
    def add_security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        if request.is_secure:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response

    from routes import ALL_BLUEPRINTS
    for bp in ALL_BLUEPRINTS:
        app.register_blueprint(bp)

    @app.route("/health")
    @app.route("/api/health")
    def health():
        return jsonify({"status": "ok"})

    @app.errorhandler(404)
    def not_found(error):
        return jsonify({"error": "Resource not found"}), 404

    @app.errorhandler(500)
    def internal_error(error):
        return jsonify({"error": "Internal server error"}), 500

    return app


# Top-level app instance for Vercel and other WSGI hosts
app = create_app()


if __name__ == "__main__":

    app = create_app()

    from core.database.models import load_db, save_db
    from core.middleware.security import hash_password

    db = load_db()
    if not db.get("admins"):
        db["admins"] = [{"username": "admin", "password_hash": hash_password("admin2026")}]
        save_db(db)

    print("[AI Next Gen] Server running on http://localhost:5000")
    print("[AI Next Gen] Default Admin: admin / admin2026")
    app.run(debug=True, host="0.0.0.0", port=5000)
