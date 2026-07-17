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

    SESSION_LIFETIME_HOURS = 24
    SESSION_COOKIE_SECURE = os.environ.get("SESSION_COOKIE_SECURE", "False") == "True"
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"

    MAX_LOGIN_ATTEMPTS = 5
    LOGIN_LOCKOUT_MINUTES = 30
    ADMIN_MAX_LOGIN_ATTEMPTS = 3
    ADMIN_LOCKOUT_MINUTES = 15

    PASSWORD_SALT = os.environ.get("PASSWORD_SALT", "ai_next_gen_salt")

    MAX_AUDIT_LOG_ENTRIES = 2000

    DEFAULT_TAB_SWITCH_LIMIT = 3
    DEFAULT_IDLE_TIMEOUT_SECONDS = 300
    INTERNET_DISCONNECT_PAUSE_SECONDS = 30
    MAX_RETAKE_ATTEMPTS = 0
    SHORTLIST_TOP_N = 30

    TEST_STATUSES = ["draft", "published", "locked", "completed"]
    ASSIGNMENT_STATUSES = ["assigned", "in_progress", "completed", "disqualified", "locked"]
    DIFFICULTY_LEVELS = ["easy", "medium", "hard", "expert"]
    QUESTION_TYPES = ["mcq", "text", "textarea"]
