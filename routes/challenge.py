import json
from datetime import datetime
from flask import Blueprint, request, jsonify, session, render_template

from models.database import load_db, save_db, get_candidate_by_email, audit_log
from middleware.auth import login_required

challenge_bp = Blueprint("challenge", __name__)


@challenge_bp.route("/challenge")
def challenge_page():
    if "user_email" not in session:
        from flask import redirect, url_for
        return redirect(url_for("auth.login_page"))

    candidate = get_candidate_by_email(session["user_email"])
    if not candidate:
        session.pop("user_email", None)
        from flask import redirect, url_for
        return redirect(url_for("auth.login_page"))
    if candidate.get("completed"):
        from flask import redirect, url_for
        return redirect(url_for("dashboard.profile_page"))

    return render_template("challenge.html")


@challenge_bp.route("/api/challenge/questions", methods=["GET"])
@login_required
def get_questions():
    candidate = get_candidate_by_email(session["user_email"])
    if not candidate:
        return jsonify({"error": "Candidate not found"}), 404
    if candidate.get("completed"):
        return jsonify({"error": "Challenge already completed"}), 400

    from services.challenge_engine import get_challenge_data, get_total_time
    levels = get_challenge_data(candidate["candidate_id"])
    return jsonify({
        "levels": levels,
        "total_time": get_total_time(),
        "candidate_id": candidate["candidate_id"],
    })


@challenge_bp.route("/api/challenge/start", methods=["POST"])
@login_required
def start_challenge():
    db = load_db()
    candidate = get_candidate_by_email(session["user_email"])

    if not candidate:
        return jsonify({"error": "Candidate not found"}), 404
    if candidate.get("completed"):
        return jsonify({"error": "Challenge already completed"}), 400

    candidate["started"] = True
    candidate["started_at"] = datetime.now().isoformat()
    save_db(db)

    audit_log("challenge_started", session["user_email"], ip=request.remote_addr)

    return jsonify({"success": True})


@challenge_bp.route("/api/submit_challenge", methods=["POST"])
@login_required
def submit_challenge():
    data = request.json or {}
    db = load_db()
    candidate = get_candidate_by_email(session["user_email"])

    if not candidate:
        return jsonify({"error": "Candidate not found"}), 404
    if candidate.get("completed"):
        return jsonify({"error": "Challenge already submitted"}), 400

    from services.scoring_engine import compute_scores
    result = compute_scores(candidate, data)

    candidate["completed"] = True
    candidate["completed_at"] = datetime.now().isoformat()
    candidate["answers"] = json.dumps(data.get("answers", {}))
    candidate["time_taken"] = int(data.get("time_taken", 0))
    candidate["tab_switches"] = int(data.get("tab_switches", 0))
    candidate["violation_count"] = int(data.get("violation_count", 0))
    candidate["violation_logs"] = json.dumps(result["violation_logs"])

    telemetry = data.get("telemetry", {})
    candidate["backspace_count"] = int(telemetry.get("backspace_count", 0))
    candidate["typing_speed_avg"] = round(float(telemetry.get("typing_speed_avg", 0.0)), 2)
    candidate["typing_pattern_variance"] = round(float(telemetry.get("typing_pattern_variance", 0.0)), 2)
    candidate["mouse_moves_count"] = int(telemetry.get("mouse_moves_count", 0))
    candidate["idle_duration"] = int(telemetry.get("idle_duration", 0))
    candidate["webcam_status"] = data.get("webcam_status", "Active")
    candidate["location_data"] = data.get("location_data", "")

    for key, val in result["scores"].items():
        candidate[key] = val

    candidate["score_final"] = result["scores"]["score_final"]
    candidate["badges"] = json.dumps(result["badges"])
    candidate["selected"] = result["selected_status"]

    save_db(db)
    audit_log("challenge_submitted", session["user_email"], {"score": result["scores"]["score_final"]}, ip=request.remote_addr)

    return jsonify({
        "message": "Challenge submitted successfully",
        "status": "Disqualified" if result["selected_status"] == 3 else "Success",
        "scores": result["scores"],
        "badges": result["badges"],
        "violation_count": candidate["violation_count"],
        "selected": result["selected_status"],
    })
