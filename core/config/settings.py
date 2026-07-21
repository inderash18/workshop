import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "ai_next_gen_secret_key_2026")
    MONGODB_URI = os.environ.get(
        "MONGODB_URI",
        "mongodb+srv://<username>:<password>@<cluster>.mongodb.net/",
    )
    MONGODB_MAX_POOL_SIZE = int(os.environ.get("MONGODB_MAX_POOL_SIZE", "10"))
    MONGODB_SERVER_SELECTION_TIMEOUT_MS = int(os.environ.get("MONGODB_SERVER_SELECTION_TIMEOUT_MS", "2000"))
    ENFORCE_CSRF = os.environ.get("ENFORCE_CSRF", "False") == "True"
    MONGODB_DB = "ai_next_gen"

    SESSION_LIFETIME_HOURS = 24
    SESSION_COOKIE_SECURE = os.environ.get("SESSION_COOKIE_SECURE", "True") == "True"
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = os.environ.get("SESSION_COOKIE_SAMESITE", "Lax")

    MAX_LOGIN_ATTEMPTS = 5
    LOGIN_LOCKOUT_MINUTES = 30
    ADMIN_MAX_LOGIN_ATTEMPTS = 3
    ADMIN_LOCKOUT_MINUTES = 15

    SIGNUP_MAX_ATTEMPTS = int(os.environ.get("SIGNUP_MAX_ATTEMPTS", "3"))
    SIGNUP_LOCKOUT_MINUTES = int(os.environ.get("SIGNUP_LOCKOUT_MINUTES", "60"))
    ADMIN_ACTION_MAX_ATTEMPTS = int(os.environ.get("ADMIN_ACTION_MAX_ATTEMPTS", "20"))
    ADMIN_ACTION_LOCKOUT_MINUTES = int(os.environ.get("ADMIN_ACTION_LOCKOUT_MINUTES", "15"))

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
