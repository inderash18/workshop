import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "ai_next_gen_secret_key_2026")
    MONGODB_URI = os.environ.get(
        "MONGODB_URI",
        "mongodb+srv://inderashaiworkspace_db_user:"
        "fPZJ6C3DeezVr4n4@cluster0.fw4opds.mongodb.net/",
    )
    MONGODB_DB = "ai_next_gen"
    MONGODB_COLLECTION = "state"

    SESSION_LIFETIME_HOURS = 24
    SESSION_COOKIE_SECURE = os.environ.get("SESSION_COOKIE_SECURE", "False") == "True"
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"

    MAX_LOGIN_ATTEMPTS = 5
    LOGIN_LOCKOUT_MINUTES = 30
    ADMIN_MAX_LOGIN_ATTEMPTS = 3
    ADMIN_LOCKOUT_MINUTES = 15

    PASSWORD_SALT = os.environ.get("PASSWORD_SALT", "ai_next_gen_salt")

    CHALLENGE_TIME_LIMIT_SECONDS = 1800
    MAX_AUDIT_LOG_ENTRIES = 1000

    SHORTLIST_TOP_N = 30
