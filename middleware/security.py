import hashlib
import re
import uuid

from config.settings import Config


def hash_password(password):
    salt = Config.PASSWORD_SALT
    return hashlib.sha256(f"{password}{salt}".encode()).hexdigest()


def verify_password(password, password_hash):
    return hash_password(password) == password_hash


def generate_csrf_token():
    return str(uuid.uuid4())


def sanitize_input(text):
    if not text:
        return ""
    text = re.sub(r"<script.*?>.*?</script>", "", text, flags=re.DOTALL)
    text = re.sub(r"<.*?>", "", text)
    return text.strip()


def validate_email(email):
    pattern = r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$"
    return re.match(pattern, email) is not None


def validate_phone(phone):
    pattern = r"^[\+\d\s\-\(\)]{10,15}$"
    return re.match(pattern, phone) is not None
