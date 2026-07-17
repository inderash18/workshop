import json
from datetime import datetime
from flask import Blueprint, request, jsonify, session, redirect, url_for, render_template

from models.database import (
    get_candidate_by_email, get_assignments_for_candidate,
    get_test_by_id_str, get_setting, load_db,
)
from middleware.auth import login_required

dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.route("/")
def index():
    return render_template("landing.html")


@dashboard_bp.route("/dashboard")
def dashboard_page():
    if "user_email" not in session:
        return redirect(url_for("auth.login_page"))
    return render_template("dashboard.html")


@dashboard_bp.route("/profile")
def profile_page():
    if "user_email" not in session:
        return redirect(url_for("auth.login_page"))
    return render_template("profile.html")


@dashboard_bp.route("/api/dashboard")
@login_required
def api_dashboard():
    candidate = get_candidate_by_email(session["user_email"])
    if not candidate:
        return jsonify({"error": "Not found"}), 404

    c_data = dict(candidate)
    c_data.pop("password_hash", None)
    for field in ["badges", "violation_logs"]:
        try:
            c_data[field] = json.loads(c_data[field]) if c_data.get(field) else []
        except Exception:
            c_data[field] = []

    return jsonify({"candidate": c_data})


@dashboard_bp.route("/api/student/tests")
@login_required
def student_tests():
    candidate = get_candidate_by_email(session["user_email"])
    if not candidate:
        return jsonify({"error": "Candidate not found"}), 404

    candidate_id = candidate["candidate_id"]
    assignments = get_assignments_for_candidate(candidate_id)

    tests = []
    for assignment in assignments:
        test = get_test_by_id_str(assignment["test_id"])
        if not test:
            continue

        from services.security_engine import is_test_window_active
        test_status = test.get("status", "draft")
        is_active = is_test_window_active(test) if test_status == "published" else False

        from bson import ObjectId
        assignment_data = dict(assignment)
        if "_id" in assignment_data:
            assignment_data["_id"] = str(assignment_data["_id"])

        assignment_status = assignment.get("status", "assigned")
        js_status = "pending"
        if assignment_status == "completed":
            js_status = "completed"
        elif assignment_status == "disqualified":
            js_status = "locked"
        elif assignment_status == "started":
            js_status = "in-progress"
        elif assignment_status == "assigned":
            if is_active:
                js_status = "in-progress"
            elif test_status == "published":
                js_status = "upcoming"
            else:
                js_status = "locked"

        tests.append({
            "id": assignment["test_id"],
            "_id": assignment["test_id"],
            "title": test.get("name", "Untitled Test"),
            "name": test.get("name", "Untitled Test"),
            "description": test.get("description", ""),
            "duration": test.get("duration_minutes", 60),
            "total_marks": sum(int(q.get("marks", 5)) for q in test.get("questions", [])) or 100,
            "status": js_status,
            "can_view_results": load_db().get("results_published", False),
            "score": assignment.get("scores", {}).get("final"),
            "test_date": test.get("date", ""),
        })

    tests.sort(key=lambda t: t.get("test_date", ""), reverse=True)

    return jsonify({
        "candidate_id": candidate_id,
        "name": candidate.get("name", ""),
        "tests": tests,
    })
