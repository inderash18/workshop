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
@admin_bp.route("/admin/candidates")
@admin_bp.route("/admin/settings")
@admin_bp.route("/admin/questions")
@admin_bp.route("/admin/logs")
@admin_bp.route("/admin/security")
@admin_bp.route("/admin/analytics")
@admin_bp.route("/admin/shortlisting")
@admin_bp.route("/admin/security-monitoring")
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
    from models.database import _col

    sort_by = request.args.get("sort_by", "score")
    college_filter = sanitize_input(request.args.get("college", ""))
    status_filter = request.args.get("status", "")

    db = load_db()
    candidates = list(db["candidates"])

    # Pull AI evaluations for enrichment
    ai_evals = {}
    try:
        for ev in _col("ai_evaluations").find():
            ai_evals[ev.get("candidate_id", "")] = ev
    except Exception:
        pass

    # Pull test attempt scores for enrichment
    attempt_scores = {}
    try:
        for at in _col("test_assignments").find({"status": {"$in": ["completed", "disqualified"]}}):
            cid = at.get("candidate_id", "")
            if cid not in attempt_scores:
                scores = at.get("scores", {})
                attempt_scores[cid] = {
                    "score_final": float(scores.get("score_final") or scores.get("final") or 0),
                    "violation_count": at.get("violation_count", 0),
                    "time_taken": at.get("time_taken", 0),
                    "status": at.get("status", "pending"),
                    "test_id": str(at.get("test_id", "")),
                    "security_score": float(at.get("security_score", 100.0)),
                }
    except Exception:
        pass

    if college_filter:
        candidates = [c for c in candidates if college_filter.lower() in c.get("college", "").lower()]

    STATUS_LABELS = {0: "pending", 1: "selected", 2: "rejected", 3: "disqualified", 4: "waitlisted"}
    STATUS_REVERSE = {v: k for k, v in STATUS_LABELS.items()}

    if status_filter and status_filter in STATUS_REVERSE:
        target_val = STATUS_REVERSE[status_filter]
        candidates = [c for c in candidates if c.get("selected") == target_val]

    sort_map = {
        "score": lambda c: (-c.get("score_final", attempt_scores.get(c.get("candidate_id", ""), {}).get("score_final", 0)), c.get("time_taken", 99999)),
        "name": lambda c: (c.get("name", "").lower(),),
    }
    candidates.sort(key=sort_map.get(sort_by, sort_map["score"]))

    result = []
    for c in candidates:
        c_data = dict(c)
        c_data.pop("password_hash", None)
        c_data.pop("_id", None)

        cid = c.get("candidate_id", "")
        attempt = attempt_scores.get(cid, {})
        ai_eval = ai_evals.get(cid, {})

        # Merge attempt scores into candidate data
        final_score = attempt.get("score_final") or c.get("score_final", 0)
        c_data["id"] = cid or c.get("email") or str(c.get("_id", ""))
        c_data["score"] = round(final_score, 1)
        c_data["total_marks"] = 100
        c_data["violation_count"] = attempt.get("violation_count", c.get("violation_count", 0))
        c_data["time_taken"] = attempt.get("time_taken", c.get("time_taken", 0))
        c_data["attempt_status"] = attempt.get("status", "not_started")
        c_data["selection_status"] = STATUS_LABELS.get(c.get("selected", 0), "pending")
        c_data["test_id"] = attempt.get("test_id", "")
        c_data["security_score"] = attempt.get("security_score", c.get("security_score", 100.0))

        # AI recommendation enrichment
        if attempt.get("status") == "disqualified":
            ai_rec = "DISQUALIFIED"
        else:
            if final_score >= 90:
                ai_rec = "ELITE CANDIDATE"
            elif final_score >= 80:
                ai_rec = "HIGHLY RECOMMENDED"
            elif final_score >= 65:
                ai_rec = "RECOMMENDED"
            elif final_score >= 50:
                ai_rec = "WAITLISTED"
            else:
                ai_rec = "NOT RECOMMENDED"
        c_data["ai_recommendation"] = ai_rec
        c_data["ai_scores"] = {
            "logic": ai_eval.get("logic_score", 0),
            "creativity": ai_eval.get("creativity_score", 0),
            "innovation": ai_eval.get("innovation_score", 0),
            "problem_solving": ai_eval.get("problem_solving_score", 0),
        }

        for field in ["badges", "violation_logs"]:
            try:
                c_data[field] = json.loads(c_data[field]) if isinstance(c_data.get(field), str) else (c_data.get(field) or [])
            except Exception:
                c_data[field] = []
        result.append(c_data)

    return jsonify(result)


@admin_bp.route("/api/admin/auto_shortlist", methods=["POST"])
@admin_bp.route("/api/admin/auto-shortlist", methods=["POST"])
@admin_required
def auto_shortlist():
    """AI-driven auto-shortlisting based on test scores and security behavior.
    
    Score tiers:
      >= 80% => Selected (1)
      >= 60% => Waitlisted (4)
      < 60%  => Rejected (2)
      Disqualified stays 3
    """
    from models.database import _col

    db = load_db()

    # Load attempt scores from MongoDB
    attempt_scores = {}
    try:
        for at in _col("test_assignments").find({"status": {"$in": ["completed", "disqualified"]}}):
            cid = at.get("candidate_id", "")
            if cid and cid not in attempt_scores:
                scores = at.get("scores", {})
                attempt_scores[cid] = {
                    "score_final": float(scores.get("score_final") or scores.get("final") or 0),
                    "violation_count": at.get("violation_count", 0),
                    "status": at.get("status", "pending"),
                }
    except Exception as e:
        print(f"[AutoShortlist] Error loading attempts: {e}")

    selected_count = 0
    waitlisted_count = 0
    rejected_count = 0

    for c in db["candidates"]:
        cid = c.get("candidate_id", "")
        current = c.get("selected", 0)

        # Never override disqualified status
        if current == 3:
            continue

        attempt = attempt_scores.get(cid, {})
        score = attempt.get("score_final") or c.get("score_final", 0)
        attempt_status = attempt.get("status", "")

        # Disqualify if attempt was disqualified
        if attempt_status == "disqualified":
            c["selected"] = 3
            continue

        if not c.get("completed") and attempt_status != "completed":
            # Not yet attempted — leave as pending
            continue

        # Dynamically retrieve selection criteria from MongoDB settings
        min_score = int(get_setting("min_score_required", 80))
        waitlist_score = int(get_setting("waitlist_score_required", 60))
        sec_score_req = int(get_setting("sec_score_required", 70))

        # Get candidate's security score
        cand_sec_score = attempt.get("security_score")
        if cand_sec_score is None:
            cand_sec_score = c.get("security_score")
        if cand_sec_score is None:
            cand_sec_score = 100.0

        if score >= min_score and cand_sec_score >= sec_score_req:
            c["selected"] = 1  # Selected
            selected_count += 1
        elif score >= waitlist_score:
            c["selected"] = 4  # Waitlisted
            waitlisted_count += 1
        else:
            c["selected"] = 2  # Rejected
            rejected_count += 1

    save_db(db)
    audit_log("ai_auto_shortlist", session.get("admin_username"), {
        "selected": selected_count,
        "waitlisted": waitlisted_count,
        "rejected": rejected_count,
    }, ip=request.remote_addr)

    return jsonify({
        "success": True,
        "message": f"AI shortlisting complete: {selected_count} Selected, {waitlisted_count} Waitlisted, {rejected_count} Rejected",
        "selected": selected_count,
        "waitlisted": waitlisted_count,
        "rejected": rejected_count,
    })


@admin_bp.route("/api/admin/toggle_selection", methods=["POST"])
@admin_required
def toggle_selection():
    data = request.json or {}
    candidate_id = data.get("candidate_id")
    selected = data.get("selected")

    if candidate_id is None or selected is None:
        return jsonify({"error": "Missing parameters"}), 400
    if selected not in [0, 1, 2, 3, 4]:
        return jsonify({"error": "Invalid selection status"}), 400

    candidate = get_candidate_by_id(candidate_id)
    if not candidate:
        return jsonify({"error": "Candidate not found"}), 404

    candidate["selected"] = selected
    save_db(load_db())

    audit_log("toggle_selection", session.get("admin_username"), {"candidate": candidate_id, "status": selected}, ip=request.remote_addr)

    return jsonify({"success": True})





@admin_bp.route("/api/admin/analytics-data", methods=["GET"])
@admin_required
def api_admin_analytics_data():
    from models.database import _col
    db = load_db()
    candidates = list(db["candidates"])
    
    # 1. Score Distribution
    score_ranges = {"0-49": 0, "50-59": 0, "60-69": 0, "70-79": 0, "80-89": 0, "90-100": 0}
    for c in candidates:
        if c.get("completed") or c.get("attempt_status") in ["completed", "disqualified"]:
            score = c.get("score_final") or c.get("score", 0)
            if score >= 90:
                score_ranges["90-100"] += 1
            elif score >= 80:
                score_ranges["80-89"] += 1
            elif score >= 70:
                score_ranges["70-79"] += 1
            elif score >= 60:
                score_ranges["60-69"] += 1
            elif score >= 50:
                score_ranges["50-59"] += 1
            else:
                score_ranges["0-49"] += 1

    # 2. Selection Status Distribution
    STATUS_LABELS = {0: "pending", 1: "selected", 2: "rejected", 3: "disqualified", 4: "waitlisted"}
    status_counts = {"selected": 0, "waitlisted": 0, "rejected": 0, "disqualified": 0, "pending": 0}
    for c in candidates:
        sel_val = c.get("selected", 0)
        status = STATUS_LABELS.get(sel_val, "pending").lower()
        if status in status_counts:
            status_counts[status] += 1

    # 3. AI Recommendation Distribution
    ai_recs = {
        "ELITE CANDIDATE": 0,
        "HIGHLY RECOMMENDED": 0,
        "RECOMMENDED": 0,
        "WAITLISTED": 0,
        "NOT RECOMMENDED": 0,
        "DISQUALIFIED": 0
    }
    for c in candidates:
        rec = c.get("ai_recommendation") or "—"
        if rec in ai_recs:
            ai_recs[rec] += 1
        elif rec == "—":
            pass

    # 4. Security Violations Breakdown
    violation_types = {
        "tab_switch": 0,
        "fullscreen_exit": 0,
        "window_blur": 0,
        "copy_attempt": 0,
        "paste_attempt": 0,
        "right_click": 0,
        "refresh_attempt": 0,
        "devtools_opened": 0,
        "idle_timeout": 0
    }
    
    try:
        assignments = list(_col("test_assignments").find())
        for a in assignments:
            violations = a.get("violations", [])
            for v in violations:
                vtype = v.get("type")
                if vtype in violation_types:
                    violation_types[vtype] += 1
            
            if not violations:
                if a.get("tab_switch_count", 0) > 0:
                    violation_types["tab_switch"] += a["tab_switch_count"]
                if a.get("window_blur_count", 0) > 0:
                    violation_types["window_blur"] += a["window_blur_count"]
    except Exception:
        pass

    return jsonify({
        "score_distribution": score_ranges,
        "selection_status": status_counts,
        "ai_recommendations": ai_recs,
        "violations_breakdown": violation_types
    })


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

    from models.database import get_all_tests, _col
    tests = get_all_tests()
    total_tests = len(tests)
    published_tests = sum(1 for t in tests if t.get("status") == "published")
    active_tests = published_tests

    # Pull completed/assigned counts from test_attempts
    completed_assignments = 0
    assigned_total = 0
    try:
        completed_assignments = _col("test_assignments").count_documents({"status": "completed"})
        assigned_total = _col("test_assignments").count_documents({})
    except Exception:
        pass

    completion_rate = round((completed_assignments / total * 100) if total > 0 else 0, 1)

    return jsonify({
        "total": total,
        "total_candidates": total,
        "completed": completed,
        "completed_tests": completed_assignments,
        "shortlisted": shortlisted,
        "selected": shortlisted,
        "disqualified": disqualified,
        "avg_score": round(avg_score, 2),
        "college_distribution": college_dist,
        "total_tests": total_tests,
        "published_tests": published_tests,
        "active_tests": active_tests,
        "assigned_total": assigned_total,
        "completion_rate": completion_rate,
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


@admin_bp.route("/api/admin/settings", methods=["GET", "POST"])
@admin_required
def get_or_update_platform_settings():
    from models.database import get_setting, update_setting
    if request.method == "GET":
        settings = {
            # Cohort
            "leaderboard_enabled": bool(get_setting("leaderboard_enabled", False)),
            "leaderboard_limit": int(get_setting("leaderboard_limit", 10)),
            "results_published": bool(get_setting("results_published", False)),
            
            # Test Config
            "total_questions": int(get_setting("total_questions", 15)),
            "question_timer": int(get_setting("question_timer", 60)),
            "test_duration_minutes": int(get_setting("test_duration_minutes", 15)),
            "test_start_date": get_setting("test_start_date", "2026-07-01T00:00:00"),
            "test_end_date": get_setting("test_end_date", "2026-07-31T23:59:59"),
            "registration_start_date": get_setting("registration_start_date", "2026-07-01T00:00:00"),
            "registration_end_date": get_setting("registration_end_date", "2026-07-31T23:59:59"),
            "test_status": get_setting("test_status", "published"),
            "registration_status": get_setting("registration_status", "open"),
            "test_availability": get_setting("test_availability", "open"),
            
            # Security rules
            "sec_fullscreen_enabled": bool(get_setting("sec_fullscreen_enabled", True)),
            "sec_tab_switch_enabled": bool(get_setting("sec_tab_switch_enabled", True)),
            "sec_copy_enabled": bool(get_setting("sec_copy_enabled", True)),
            "sec_paste_enabled": bool(get_setting("sec_paste_enabled", True)),
            "sec_right_click_enabled": bool(get_setting("sec_right_click_enabled", True)),
            "sec_devtools_enabled": bool(get_setting("sec_devtools_enabled", True)),
            "sec_refresh_enabled": bool(get_setting("sec_refresh_enabled", True)),
            "sec_multiple_login_enabled": bool(get_setting("sec_multiple_login_enabled", True)),
            "sec_idle_enabled": bool(get_setting("sec_idle_enabled", True)),
            "sec_internet_disconnect_enabled": bool(get_setting("sec_internet_disconnect_enabled", True)),
            "sec_auto_disqualify_enabled": bool(get_setting("sec_auto_disqualify_enabled", True)),
            "sec_tab_switch_limit": int(get_setting("sec_tab_switch_limit", 3)),
            "sec_window_blur_limit": int(get_setting("sec_window_blur_limit", 3)),
            "sec_browser_resize_limit": int(get_setting("sec_browser_resize_limit", 2)),
            "sec_idle_timeout_seconds": int(get_setting("sec_idle_timeout_seconds", 60)),
            "sec_disconnect_grace_seconds": int(get_setting("sec_disconnect_grace_seconds", 30)),
            
            # AI weightages
            "weight_logic": int(get_setting("weight_logic", 40)),
            "weight_creativity": int(get_setting("weight_creativity", 20)),
            "weight_innovation": int(get_setting("weight_innovation", 10)),
            "weight_problem_solving": int(get_setting("weight_problem_solving", 10)),
            "weight_human_intelligence": int(get_setting("weight_human_intelligence", 10)),
            "weight_security": int(get_setting("weight_security", 10)),
            
            # Shortlisting rules
            "shortlist_top_n": int(get_setting("shortlist_top_n", 30)),
            "min_score_required": int(get_setting("min_score_required", 80)),
            "waitlist_score_required": int(get_setting("waitlist_score_required", 60)),
            "sec_score_required": int(get_setting("sec_score_required", 70)),
            "pct_ai_shortlist": int(get_setting("pct_ai_shortlist", 50)),
            "pct_manual_shortlist": int(get_setting("pct_manual_shortlist", 50)),
            "pct_selection": int(get_setting("pct_selection", 10)),
        }
        return jsonify(settings)

    data = request.json or {}
    updated = {}
    
    # Process inputs and update database configurations
    for key, val in data.items():
        if key in ("leaderboard_enabled", "results_published", "sec_fullscreen_enabled", "sec_tab_switch_enabled",
                   "sec_copy_enabled", "sec_paste_enabled", "sec_right_click_enabled",
                   "sec_devtools_enabled", "sec_refresh_enabled", "sec_multiple_login_enabled",
                   "sec_idle_enabled", "sec_internet_disconnect_enabled", "sec_auto_disqualify_enabled"):
            val = bool(val)
        elif key in ("total_questions", "question_timer", "test_duration_minutes", "sec_tab_switch_limit",
                     "sec_window_blur_limit", "sec_browser_resize_limit", "sec_idle_timeout_seconds",
                     "sec_disconnect_grace_seconds", "weight_logic", "weight_creativity", "weight_innovation",
                     "weight_problem_solving", "weight_human_intelligence", "weight_security",
                     "shortlist_top_n", "min_score_required", "waitlist_score_required", "sec_score_required", 
                     "pct_ai_shortlist", "pct_manual_shortlist", "pct_selection", "leaderboard_limit"):
            val = int(val)
        else:
            val = str(val).strip()

        update_setting(key, val)
        updated[key] = val

    audit_log("settings_update", session.get("admin_username"), {"updated": updated}, ip=request.remote_addr)
    return jsonify({"success": True, "updated": updated})


@admin_bp.route("/api/admin/audit-logs", methods=["GET"])
@admin_required
def get_audit_logs():
    db = load_db()
    logs = []
    for log in db.get("audit_log", []):
        log_data = dict(log)
        log_data.pop("_id", None)
        logs.append(log_data)
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

    candidate["selected"] = 1  # Selected
    save_db(db)

    audit_log("shortlist_candidate", session.get("admin_username"), {"candidate": candidate_id}, ip=request.remote_addr)
    return jsonify({"success": True})


@admin_bp.route("/api/admin/candidates/<candidate_id>/status", methods=["POST"])
@admin_required
def set_candidate_status(candidate_id):
    """Set a candidate's selection status. Valid values: selected, waitlisted, rejected, disqualified."""
    data = request.json or {}
    new_status = data.get("status", "").lower()

    STATUS_MAP = {
        "selected": 1,
        "waitlisted": 4,
        "rejected": 2,
        "disqualified": 3,
        "pending": 0,
    }

    if new_status not in STATUS_MAP:
        return jsonify({"error": f"Invalid status '{new_status}'. Valid: selected, waitlisted, rejected, disqualified, pending"}), 400

    db = load_db()
    candidate = None
    for c in db["candidates"]:
        if c.get("candidate_id") == candidate_id or c.get("email") == candidate_id:
            candidate = c
            break

    if not candidate:
        return jsonify({"error": "Candidate not found"}), 404

    old_status = candidate.get("selected", 0)
    candidate["selected"] = STATUS_MAP[new_status]
    save_db(db)

    audit_log("set_candidate_status", session.get("admin_username"), {
        "candidate": candidate_id,
        "old_status": old_status,
        "new_status": new_status,
    }, ip=request.remote_addr)
    return jsonify({"success": True, "status": new_status})


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


@admin_bp.route("/api/admin/test-access", methods=["GET"])
@admin_required
def get_test_access():
    """Get current test open/close state."""
    from models.database import get_setting
    is_open = get_setting("test_open", False)
    return jsonify({"test_open": bool(is_open)})


@admin_bp.route("/api/admin/test-access/toggle", methods=["POST"])
@admin_required
def toggle_test_access():
    """Admin toggle: open or close the test for all students."""
    from models.database import get_setting, update_setting
    current = get_setting("test_open", False)
    new_state = not bool(current)
    update_setting("test_open", new_state)

    audit_log(
        "test_access_toggled",
        session.get("admin_username"),
        {"test_open": new_state},
        ip=request.remote_addr,
    )
    return jsonify({
        "success": True,
        "test_open": new_state,
        "message": "Test is now OPEN for students ✅" if new_state else "Test is now CLOSED for students 🔒",
    })

@admin_bp.route("/api/admin/assign-all", methods=["POST"])
@admin_required
def assign_test_to_all():
    """Assign the active published test to ALL existing candidates who don't already have an assignment."""
    from models.database import _col, create_assignment

    # Find the published test
    test = _col("tests").find_one({"status": "published"})
    if not test:
        return jsonify({"error": "No published test found. Please publish a test first."}), 404

    test_id = str(test["_id"])
    db = load_db()
    candidates = list(db.get("candidates", []))

    assigned_count = 0
    skipped_count = 0

    for c in candidates:
        c_id = c.get("candidate_id") or c.get("email")
        if not c_id:
            continue
        # Check if already assigned
        existing = _col("test_attempts").find_one({"test_id": test_id, "candidate_id": c_id})
        if existing:
            skipped_count += 1
        else:
            create_assignment(test_id, c_id)
            assigned_count += 1

    audit_log("assign_test_to_all", session.get("admin_username"), {
        "test_id": test_id,
        "test_name": test.get("name", ""),
        "assigned": assigned_count,
        "skipped": skipped_count,
    }, ip=request.remote_addr)

    return jsonify({
        "success": True,
        "message": f"Assigned test to {assigned_count} new candidate(s). {skipped_count} already had an assignment.",
        "assigned": assigned_count,
        "skipped": skipped_count,
        "test_name": test.get("name", ""),
    })

