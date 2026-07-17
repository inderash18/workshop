import json
import csv
import io
from datetime import datetime
from flask import Blueprint, request, jsonify, session, redirect, url_for, render_template, Response

from config.settings import Config
from models.database import (
    load_db, save_db, get_candidate_by_id, get_candidate_by_email, audit_log,
    get_setting, update_setting, get_security_events_for_test, get_all_tests,
)
from middleware.security import sanitize_input, verify_password
from middleware.rate_limiter import is_rate_limited, record_login_attempt
from middleware.auth import admin_required

admin_bp = Blueprint("admin", __name__)


@admin_bp.route("/admin")
def admin():
    if "admin_logged_in" in session:
        return render_template("admin.html")
    return redirect(url_for("admin.admin_login_page"))


@admin_bp.route("/admin-login")
@admin_bp.route("/admin/login")
def admin_login_page():
    if "admin_logged_in" in session:
        return redirect(url_for("admin.admin"))
    return render_template("admin_login.html")


@admin_bp.route("/admin/candidates")
@admin_required
def admin_candidates_page():
    return render_template("admin_candidates.html")


@admin_bp.route("/admin/settings")
@admin_required
def admin_settings_page():
    return render_template("admin_settings.html")


@admin_bp.route("/admin/logs")
@admin_required
def admin_logs_page():
    return render_template("admin_logs.html")


@admin_bp.route("/api/admin/login", methods=["POST"])
def admin_login():
    data = request.json or {}
    username = sanitize_input(data.get("username", ""))
    password = data.get("password", "")

    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400

    ip_key = f"admin_{request.remote_addr}"
    if is_rate_limited(ip_key, Config.ADMIN_MAX_LOGIN_ATTEMPTS, Config.ADMIN_LOCKOUT_MINUTES):
        return jsonify({"error": "Too many attempts. Try again later."}), 429

    db = load_db()
    admin_user = next((a for a in db["admins"] if a.get("username") == username), None)

    if not admin_user or not verify_password(password, admin_user.get("password_hash", "")):
        record_login_attempt(ip_key, success=False)
        audit_log("admin_login_failed", username, {"ip": request.remote_addr}, ip=request.remote_addr)
        return jsonify({"error": "Invalid credentials"}), 401

    record_login_attempt(ip_key, success=True)
    session["admin_logged_in"] = True
    session["admin_username"] = username
    session.permanent = True

    audit_log("admin_login", username, ip=request.remote_addr)
    return jsonify({"success": True})


@admin_bp.route("/api/admin/logout", methods=["POST"])
@admin_required
def admin_logout():
    username = session.get("admin_username")
    audit_log("admin_logout", username, ip=request.remote_addr)
    session.pop("admin_logged_in", None)
    session.pop("admin_username", None)
    return jsonify({"success": True})


@admin_bp.route("/api/admin/publish_status", methods=["GET"])
@admin_required
def get_publish_status():
    db = load_db()
    return jsonify({"results_published": db.get("results_published", False)})


@admin_bp.route("/api/admin/toggle_publish", methods=["POST"])
@admin_required
def toggle_publish():
    db = load_db()
    current = db.get("results_published", False)
    db["results_published"] = not current
    save_db(db)
    audit_log("toggle_publish", session.get("admin_username"), {"published": not current}, ip=request.remote_addr)
    return jsonify({"success": True, "results_published": not current})


@admin_bp.route("/api/admin/candidates", methods=["GET"])
@admin_required
def get_candidates():
    sort_by = request.args.get("sort_by", "score")
    college_filter = sanitize_input(request.args.get("college", ""))
    status_filter = request.args.get("status", "")

    db = load_db()
    candidates = list(db["candidates"])

    if college_filter:
        candidates = [c for c in candidates if college_filter.lower() in c.get("college", "").lower()]

    if status_filter:
        status_map = {"shortlisted": 1, "waitlisted": 0, "rejected": 2, "disqualified": 3, "pending": 0}
        if status_filter in status_map:
            candidates = [c for c in candidates if c.get("selected") == status_map[status_filter]]

    sort_map = {
        "score": lambda c: (-c.get("score_final", 0), c.get("time_taken", 99999)),
        "time": lambda c: (c.get("time_taken", 99999), -c.get("score_final", 0)),
        "creativity": lambda c: (-c.get("score_creativity", 0), -c.get("score_final", 0)),
        "name": lambda c: (c.get("name", "").lower(), -c.get("score_final", 0)),
    }
    candidates.sort(key=sort_map.get(sort_by, sort_map["score"]))

    status_map_rev = {0: "pending", 1: "shortlisted", 2: "rejected", 3: "disqualified"}
    result = []
    for c in candidates:
        c_data = dict(c)
        c_data.pop("password_hash", None)
        
        # Map fields to match static/js/pages/admin.js expectations
        c_data["id"] = c.get("candidate_id") or c.get("email") or str(c.get("_id", ""))
        c_data["score"] = c.get("score_final", 0)
        c_data["total_marks"] = 100
        c_data["selection_status"] = status_map_rev.get(c.get("selected", 0), "pending")
        
        for field in ["badges", "violation_logs"]:
            try:
                c_data[field] = json.loads(c_data[field]) if c_data.get(field) else []
            except Exception:
                c_data[field] = []
        result.append(c_data)

    return jsonify(result)


@admin_bp.route("/api/admin/auto_shortlist", methods=["POST"])
@admin_bp.route("/api/admin/auto-shortlist", methods=["POST"])
@admin_required
def auto_shortlist():
    db = load_db()

    for c in db["candidates"]:
        if c.get("selected") != 3:
            c["selected"] = 0

    eligible = [c for c in db["candidates"] if c.get("selected") != 3 and c.get("completed")]
    eligible.sort(key=lambda c: (-c.get("score_final", 0), c.get("time_taken", 99999)))

    for c in eligible[: Config.SHORTLIST_TOP_N]:
        c["selected"] = 1

    save_db(db)
    audit_log("auto_shortlist", session.get("admin_username"), {"count": min(Config.SHORTLIST_TOP_N, len(eligible))}, ip=request.remote_addr)

    return jsonify({"success": True, "message": f"Top {min(Config.SHORTLIST_TOP_N, len(eligible))} candidates shortlisted"})


@admin_bp.route("/api/admin/toggle_selection", methods=["POST"])
@admin_required
def toggle_selection():
    data = request.json or {}
    candidate_id = data.get("candidate_id")
    selected = data.get("selected")

    if candidate_id is None or selected is None:
        return jsonify({"error": "Missing parameters"}), 400
    if selected not in [0, 1, 2, 3]:
        return jsonify({"error": "Invalid selection status"}), 400

    candidate = get_candidate_by_id(candidate_id)
    if not candidate:
        return jsonify({"error": "Candidate not found"}), 404

    candidate["selected"] = selected
    save_db(load_db())

    audit_log("toggle_selection", session.get("admin_username"), {"candidate": candidate_id, "status": selected}, ip=request.remote_addr)

    return jsonify({"success": True})


@admin_bp.route("/api/admin/stats", methods=["GET"])
@admin_required
def admin_stats():
    db = load_db()
    candidates = db["candidates"]

    total = len(candidates)
    completed = sum(1 for c in candidates if c.get("completed"))
    shortlisted = sum(1 for c in candidates if c.get("selected") == 1)
    disqualified = sum(1 for c in candidates if c.get("selected") == 3)

    avg_score = 0.0
    if completed > 0:
        avg_score = sum(c.get("score_final", 0) for c in candidates if c.get("completed")) / completed

    college_dist = {}
    for c in candidates:
        college = c.get("college", "Unknown")
        college_dist[college] = college_dist.get(college, 0) + 1

    from models.database import get_all_tests
    tests = get_all_tests()
    total_tests = len(tests)
    published_tests = sum(1 for t in tests if t.get("status") == "published")

    return jsonify({
        "total": total,
        "completed": completed,
        "shortlisted": shortlisted,
        "disqualified": disqualified,
        "avg_score": round(avg_score, 2),
        "college_distribution": college_dist,
        "total_tests": total_tests,
        "published_tests": published_tests,
    })


@admin_bp.route("/api/admin/export_csv", methods=["GET"])
@admin_required
def export_csv():
    db = load_db()
    candidates = db["candidates"]

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Candidate ID", "Name", "Email", "College", "Department", "Year",
        "Logic", "Creativity", "AI Knowledge", "Problem Solving",
        "Research", "AI Potential", "Workshop Compat", "Selection Prob",
        "Time", "Final Score", "Badges", "Status", "Completed At",
    ])

    status_labels = {0: "Pending", 1: "Shortlisted", 2: "Rejected", 3: "Disqualified"}

    for c in candidates:
        if not c.get("completed"):
            continue
        writer.writerow([
            c.get("candidate_id", ""),
            c.get("name", ""),
            c.get("email", ""),
            c.get("college", ""),
            c.get("department", ""),
            c.get("year", ""),
            c.get("score_logic", 0),
            c.get("score_creativity", 0),
            c.get("score_ai_knowledge", 0),
            c.get("score_problem_solving", 0),
            c.get("score_research", 0),
            c.get("score_ai_potential", 0),
            c.get("score_workshop_compat", 0),
            c.get("score_selection_prob", 0),
            c.get("time_taken", 0),
            c.get("score_final", 0),
            c.get("badges", "[]"),
            status_labels.get(c.get("selected", 0), "Unknown"),
            c.get("completed_at", ""),
        ])

    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment;filename=candidates_export.csv"},
    )


@admin_bp.route("/admin/report/<candidate_id>")
@admin_required
def candidate_report(candidate_id):
    from services.report_generator import generate_report_data
    candidate_id = sanitize_input(candidate_id)
    data = generate_report_data(candidate_id)
    if not data:
        return "Candidate not found", 404
    return render_template("report.html", data=data)


@admin_bp.route("/api/admin/report/<candidate_id>")
@admin_required
def candidate_report_api(candidate_id):
    from services.report_generator import generate_report_data
    candidate_id = sanitize_input(candidate_id)
    data = generate_report_data(candidate_id)
    if not data:
        return jsonify({"error": "Not found"}), 404

    c = data["candidate"]
    c.pop("password_hash", None)
    return jsonify({
        "candidate": c,
        "levels": data["levels"],
        "badge_details": data["badge_details"],
        "generated_at": data["generated_at"],
    })


@admin_bp.route("/api/admin/security-logs", methods=["GET"])
@admin_required
def admin_security_logs():
    from models.database import get_security_events_for_candidate
    candidate_id = sanitize_input(request.args.get("candidate_id", ""))
    limit = request.args.get("limit", 100, type=int)

    events = get_security_events_for_candidate(candidate_id)
    results = []
    for event in events[:limit]:
        ev = dict(event)
        if "_id" in ev:
            ev["_id"] = str(ev["_id"])
        results.append(ev)

    return jsonify({"events": results, "total": len(events)})


@admin_bp.route("/api/admin/settings", methods=["POST"])
@admin_required
def update_platform_settings():
    data = request.json or {}
    allowed_keys = ["leaderboard_enabled", "results_published", "shortlist_top_n"]

    updated = {}
    for key in allowed_keys:
        if key in data:
            update_setting(key, data[key])
            updated[key] = data[key]

    audit_log("settings_update", session.get("admin_username"), {"updated": updated}, ip=request.remote_addr)

    return jsonify({"success": True, "updated": updated})


@admin_bp.route("/api/admin/audit-logs", methods=["GET"])
@admin_required
def get_audit_logs():
    db = load_db()
    logs = list(db.get("audit_log", []))
    logs.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return jsonify({"logs": logs})


@admin_bp.route("/api/admin/candidates/<candidate_id>/shortlist", methods=["POST"])
@admin_required
def shortlist_candidate_direct(candidate_id):
    db = load_db()
    candidate = None
    for c in db["candidates"]:
        if c.get("candidate_id") == candidate_id or c.get("email") == candidate_id:
            candidate = c
            break

    if not candidate:
        return jsonify({"error": "Candidate not found"}), 404

    candidate["selected"] = 1 # 1 is shortlisted
    save_db(db)

    audit_log("shortlist_candidate", session.get("admin_username"), {"candidate": candidate_id}, ip=request.remote_addr)
    return jsonify({"success": True})


@admin_bp.route("/api/admin/activity", methods=["GET"])
@admin_required
def get_admin_activity():
    db = load_db()
    logs = list(db.get("audit_log", []))
    logs.sort(key=lambda x: x.get("timestamp", ""), reverse=True)

    activity = []
    for log in logs[:10]:
        action = log.get("action", "action")
        user = log.get("user", "System")
        timestamp = log.get("timestamp", "")

        color = "blue"
        if "login" in action:
            color = "green"
        elif "delete" in action or "disqualify" in action:
            color = "red"
        elif "update" in action or "settings" in action:
            color = "yellow"

        time_str = "Recent"
        if timestamp:
            try:
                dt = datetime.fromisoformat(timestamp)
                time_str = dt.strftime("%b %d, %H:%M")
            except Exception:
                time_str = timestamp

        activity.append({
            "text": f"<strong>{user}</strong> completed <code>{action}</code>",
            "time": time_str,
            "color": color
        })

    return jsonify(activity)


