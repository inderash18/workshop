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

from flask import Flask, jsonify
from config.settings import Config
from werkzeug.middleware.proxy_fix import ProxyFix


def create_app():
    app = Flask(__name__)
    app.secret_key = Config.SECRET_KEY
    app.config["PERMANENT_SESSION_LIFETIME"] = __import__("datetime").timedelta(
        hours=Config.SESSION_LIFETIME_HOURS
    )
    app.config["SESSION_COOKIE_SECURE"] = Config.SESSION_COOKIE_SECURE
    app.config["SESSION_COOKIE_HTTPONLY"] = Config.SESSION_COOKIE_HTTPONLY
    app.config["SESSION_COOKIE_SAMESITE"] = Config.SESSION_COOKIE_SAMESITE
    app.wsgi_app = ProxyFix(app.wsgi_app)

    from routes import ALL_BLUEPRINTS
    for bp in ALL_BLUEPRINTS:
        app.register_blueprint(bp)

    @app.errorhandler(404)
    def not_found(error):
        return jsonify({"error": "Resource not found"}), 404

    @app.errorhandler(500)
    def internal_error(error):
        return jsonify({"error": "Internal server error"}), 500

    return app


if __name__ == "__main__":
    app = create_app()

    from models.database import load_db, save_db
    from middleware.security import hash_password

    db = load_db()
    if not db.get("admins"):
        db["admins"] = [{"username": "admin", "password_hash": hash_password("admin2026")}]
        save_db(db)

    print("[AI Next Gen] Server running on http://localhost:5000")
    print("[AI Next Gen] Default Admin: admin / admin2026")
    app.run(debug=True, host="0.0.0.0", port=5000)
