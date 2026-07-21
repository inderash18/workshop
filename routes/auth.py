import json
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, session, redirect, url_for, render_template
from core.config.settings import Config
from core.database.models import (
    load_db, save_db, get_candidate_by_email,
    generate_candidate_id, audit_log,
)
from core.middleware.security import (
    hash_password, verify_password, sanitize_input, validate_email, validate_phone,
)
from core.middleware.rate_limiter import is_rate_limited, record_login_attempt
from core.middleware.auth import login_required

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/signup")
def signup_page():
    if "user_email" in session:
        return redirect(url_for("dashboard.dashboard_page"))
    return render_template("signup.html")


@auth_bp.route("/login")
def login_page():
    if "user_email" in session:
        return redirect(url_for("dashboard.dashboard_page"))
    return render_template("login.html")


@auth_bp.route("/api/signup", methods=["POST"])
@auth_bp.route("/api/auth/register", methods=["POST"])
@auth_bp.route("/api/auth/signup", methods=["POST"])
def api_signup():
    from models.database import get_setting
    from datetime import datetime

    ip_key = f"signup_{request.remote_addr}"
    if is_rate_limited(ip_key, Config.SIGNUP_MAX_ATTEMPTS, Config.SIGNUP_LOCKOUT_MINUTES):
        return jsonify({"error": "Too many signup attempts. Please try again later."}), 429

    reg_status = get_setting("registration_status", "open")
    if reg_status != "open":
        return jsonify({"error": "Registration is currently closed by admin."}), 403

    now = datetime.now()
    start_str = get_setting("registration_start_date")
    end_str = get_setting("registration_end_date")

    if start_str:
        try:
            start_dt = datetime.fromisoformat(start_str)
            if now < start_dt:
                return jsonify({"error": f"Registration opens at {start_dt.strftime('%Y-%m-%d %H:%M:%S')}"}), 403
        except Exception:
            pass

    if end_str:
        try:
            end_dt = datetime.fromisoformat(end_str)
            if now > end_dt:
                return jsonify({"error": "Registration period has ended."}), 403
        except Exception:
            pass

    data = request.json or {}

    name = sanitize_input(data.get("name", ""))
    college = sanitize_input(data.get("college", ""))
    department = sanitize_input(data.get("department", ""))
    year = data.get("year")
    email = sanitize_input(data.get("email", "")).lower()
    phone = sanitize_input(data.get("phone", ""))
    password = data.get("password", "")
    linkedin = sanitize_input(data.get("linkedin", ""))
    github = sanitize_input(data.get("github", ""))

    if not all([name, college, department, year, email, phone, password]):
        record_login_attempt(ip_key, success=False)
        return jsonify({"error": "Missing required fields"}), 400
    if not validate_email(email):
        record_login_attempt(ip_key, success=False)
        return jsonify({"error": "Invalid email format"}), 400
    if not validate_phone(phone):
        record_login_attempt(ip_key, success=False)
        return jsonify({"error": "Invalid phone number format"}), 400
    if len(password) < 8:
        record_login_attempt(ip_key, success=False)
        return jsonify({"error": "Password must be at least 8 characters"}), 400
    if linkedin and not linkedin.startswith(("https://", "http://")):
        return jsonify({"error": "Invalid LinkedIn URL"}), 400
    if github and not github.startswith(("https://", "http://")):
        return jsonify({"error": "Invalid GitHub URL"}), 400

    db = load_db()
    if get_candidate_by_email(email):
        return jsonify({"error": "An account with this email already exists"}), 400

    c_id = generate_candidate_id(db)
    import uuid
    s_id = str(uuid.uuid4())

    new_candidate = {
        "id": len(db["candidates"]) + 1,
        "candidate_id": c_id,
        "session_id": s_id,
        "name": name,
        "college": college,
        "department": department,
        "year": int(year) if str(year).isdigit() else str(year),
        "email": email,
        "phone": phone,
        "password_hash": hash_password(password),
        "linkedin": linkedin,
        "github": github,
        "verified": False,
        "started": False,
        "completed": False,
        "level1_ans": "",
        "level2_ans": "",
        "level3_ans": "",
        "level4_ans": "",
        "level5_ans": "",
        "level6_ans": "",
        "level7_ans": "",
        "time_taken": 0,
        "tab_switches": 0,
        "violation_count": 0,
        "violation_logs": "[]",
        "backspace_count": 0,
        "typing_speed_avg": 0.0,
        "typing_pattern_variance": 0.0,
        "mouse_moves_count": 0,
        "idle_duration": 0,
        "webcam_status": "Active",
        "location_data": "",
        "score_logic": 0.0,
        "score_creativity": 0.0,
        "score_ai_knowledge": 0.0,
        "score_problem_solving": 0.0,
        "score_research": 0.0,
        "score_ai_potential": 0.0,
        "score_workshop_compat": 0.0,
        "score_selection_prob": 0.0,
        "score_time": 0.0,
        "score_final": 0.0,
        "badges": "[]",
        "selected": 0,
        "created_at": datetime.now().isoformat(),
        "last_login": None,
    }

    db["candidates"].append(new_candidate)
    save_db(db)

    # Assign all currently published tests to this new student
    from models.database import get_all_tests, create_assignment
    try:
        tests = get_all_tests()
        for test in tests:
            if test.get("status") == "published":
                create_assignment(str(test["_id"]), c_id)
    except Exception:
        pass

    session["user_email"] = email
    session["candidate_id"] = c_id
    session.permanent = True

    audit_log("user_signup", email, {"candidate_id": c_id}, ip=request.remote_addr)

    return jsonify({"success": True, "candidate_id": c_id, "message": "Account created successfully"})


@auth_bp.route("/api/login", methods=["POST"])
@auth_bp.route("/api/auth/login", methods=["POST"])
def api_login():
    data = request.json or {}
    email = sanitize_input(data.get("email", "")).lower()
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400
    if not validate_email(email):
        return jsonify({"error": "Invalid email format"}), 400

    ip_key = f"ip_{request.remote_addr}"
    email_key = f"email_{email}"
    if is_rate_limited(ip_key) or is_rate_limited(email_key):
        return jsonify({"error": "Too many attempts. Please try again later."}), 429

    db = load_db()
    candidate = get_candidate_by_email(email)

    if not candidate or not verify_password(password, candidate.get("password_hash", "")):
        record_login_attempt(ip_key, success=False)
        record_login_attempt(email_key, success=False)
        audit_log("login_failed", email, {"ip": request.remote_addr}, ip=request.remote_addr)
        return jsonify({"error": "Invalid email or password"}), 401

    record_login_attempt(ip_key, success=True)
    record_login_attempt(email_key, success=True)

    session["user_email"] = email
    session["candidate_id"] = candidate["candidate_id"]
    session.permanent = True

    candidate["last_login"] = datetime.now().isoformat()
    save_db(db)

    audit_log("login_success", email, {"candidate_id": candidate["candidate_id"]}, ip=request.remote_addr)

    return jsonify({"success": True, "candidate_id": candidate["candidate_id"], "redirect": "/dashboard"})


@auth_bp.route("/api/logout", methods=["POST"])
def api_logout():
    email = session.get("user_email")
    if email:
        audit_log("logout", email, ip=request.remote_addr)
    session.pop("user_email", None)
    session.pop("candidate_id", None)
    return jsonify({"success": True})


@auth_bp.route("/api/session", methods=["GET"])
def get_session():
    if "user_email" not in session:
        if "admin_logged_in" in session:
            return jsonify({
                "logged_in": True,
                "candidate": {
                    "name": "Administrator",
                    "email": "admin@platform.com",
                    "role": "admin",
                    "is_admin": True
                }
            })
        return jsonify({"logged_in": False})

    candidate = get_candidate_by_email(session["user_email"])
    if not candidate:
        session.pop("user_email", None)
        return jsonify({"logged_in": False})

    c_data = dict(candidate)
    c_data.pop("password_hash", None)
    c_data.pop("_id", None)

    for field in ["badges", "violation_logs"]:
        try:
            if field in c_data and c_data[field]:
                c_data[field] = json.loads(c_data[field])
            else:
                c_data[field] = []
        except Exception:
            c_data[field] = []

    from services.achievement_engine import get_badge_details
    c_data["badge_details"] = get_badge_details(c_data.get("badges", []))

    c_data["session_expires"] = (
        datetime.now() + timedelta(hours=Config.SESSION_LIFETIME_HOURS)
    ).isoformat()

    return jsonify({"logged_in": True, "candidate": c_data})


@auth_bp.route("/api/profile/update", methods=["POST"])
@login_required
def update_profile():
    data = request.json or {}

    name = sanitize_input(data.get("name", ""))
    phone = sanitize_input(data.get("phone", ""))
    college = sanitize_input(data.get("college", ""))
    department = sanitize_input(data.get("department", ""))
    year = data.get("year")
    linkedin = sanitize_input(data.get("linkedin", ""))
    github = sanitize_input(data.get("github", ""))
    bio = sanitize_input(data.get("bio", ""))

    if not all([name, phone, college, department, year]):
        return jsonify({"error": "Missing required fields"}), 400
    if not validate_phone(phone):
        return jsonify({"error": "Invalid phone number format"}), 400
    if linkedin and not linkedin.startswith(("https://", "http://")):
        return jsonify({"error": "Invalid LinkedIn URL"}), 400
    if github and not github.startswith(("https://", "http://")):
        return jsonify({"error": "Invalid GitHub URL"}), 400

    db = load_db()
    candidate = next((c for c in db["candidates"] if c.get("email") == session["user_email"]), None)
    if not candidate:
        return jsonify({"error": "Candidate not found"}), 404

    candidate["name"] = name
    candidate["phone"] = phone
    candidate["college"] = college
    candidate["department"] = department
    candidate["year"] = int(year) if str(year).isdigit() else str(year)
    candidate["linkedin"] = linkedin
    candidate["github"] = github
    candidate["bio"] = bio
    candidate["updated_at"] = datetime.now().isoformat()

    save_db(db)
    audit_log("profile_update", session["user_email"], {"fields": list(data.keys())}, ip=request.remote_addr)

    return jsonify({"success": True, "message": "Profile updated successfully"})


@auth_bp.route("/api/profile/avatar", methods=["POST"])
@login_required
def update_avatar():
    data = request.json or {}
    avatar_data = data.get("avatar", "")

    if not avatar_data:
        return jsonify({"error": "No avatar data provided"}), 400

    db = load_db()
    candidate = next((c for c in db["candidates"] if c.get("email") == session["user_email"]), None)
    if not candidate:
        return jsonify({"error": "Candidate not found"}), 404

    candidate["avatar"] = avatar_data
    save_db(db)

    audit_log("avatar_update", session["user_email"], ip=request.remote_addr)
    return jsonify({"success": True, "avatar": avatar_data})

