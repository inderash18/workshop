import json
from datetime import datetime
from flask import Blueprint, request, jsonify, session, render_template, redirect, url_for

from models.database import (
    load_db, save_db, get_candidate_by_email,
    get_test_by_id_str, get_assignment, update_assignment,
    get_assignments_for_candidate, audit_log,
)
from middleware.auth import login_required
from middleware.security import sanitize_input
from services.security_engine import process_security_event, is_test_window_active, can_student_access_test
from services.test_engine import get_test_questions, get_test_security_rules, compute_scores_from_answers
from services.scoring_engine import compute_scores

test_session_bp = Blueprint("test_session", __name__)


@test_session_bp.route("/test/<test_id>")
@login_required
def test_page(test_id):
    candidate = get_candidate_by_email(session["user_email"])
    if not candidate:
        return redirect(url_for("auth.login_page"))

    test = get_test_by_id_str(test_id)
    if not test:
        return "Test not found", 404

    can_access, reason = can_student_access_test(candidate["candidate_id"], test_id)
    if not can_access:
        return render_template("test_session.html", test_id=test_id, denied=True, reason=reason)

    return render_template("test_session.html", test_id=test_id, denied=False)


@test_session_bp.route("/api/test/<test_id>/questions", methods=["GET"])
@login_required
def get_test_questions_api(test_id):
    candidate = get_candidate_by_email(session["user_email"])
    if not candidate:
        return jsonify({"error": "Candidate not found"}), 404

    test = get_test_by_id_str(test_id)
    if not test:
        return jsonify({"error": "Test not found"}), 404

    candidate_id = candidate["candidate_id"]
    can_access, reason = can_student_access_test(candidate_id, test_id)
    if not can_access:
        return jsonify({"error": reason}), 403

    assignment = get_assignment(test_id, candidate_id)
    if not assignment:
        return jsonify({"error": "Not assigned to this test"}), 403

    questions = get_test_questions(test, candidate_id)
    security_rules = get_test_security_rules(test)

    safe_questions = []
    for q in questions:
        safe_q = dict(q)
        if "correct" in safe_q:
            del safe_q["correct"]
        safe_questions.append(safe_q)

    return jsonify({
        "test_id": test_id,
        "test_name": test.get("name", ""),
        "questions": safe_questions,
        "duration_minutes": test.get("duration_minutes", 60),
        "total_questions": len(safe_questions),
        "security_rules": security_rules,
        "started_at": assignment.get("started_at"),
        "status": assignment.get("status", "assigned"),
    })


@test_session_bp.route("/api/test/<test_id>/start", methods=["POST"])
@login_required
def start_test(test_id):
    candidate = get_candidate_by_email(session["user_email"])
    if not candidate:
        return jsonify({"error": "Candidate not found"}), 404

    test = get_test_by_id_str(test_id)
    if not test:
        return jsonify({"error": "Test not found"}), 404

    candidate_id = candidate["candidate_id"]
    assignment = get_assignment(test_id, candidate_id)
    if not assignment:
        return jsonify({"error": "Not assigned to this test"}), 403

    if assignment.get("status") == "completed":
        return jsonify({"error": "Test already completed"}), 400
    if assignment.get("status") == "disqualified":
        return jsonify({"error": "Disqualified from this test"}), 403
    if assignment.get("is_locked"):
        return jsonify({"error": "Test session is locked"}), 403

    if not is_test_window_active(test):
        return jsonify({"error": "Test is not currently active"}), 400

    if assignment.get("status") not in ("assigned", "in_progress", "in-progress"):
        if assignment.get("status") == "in_progress" or assignment.get("status") == "in-progress":
            return jsonify({
                "success": True,
                "message": "Test session active",
                "started_at": assignment.get("started_at"),
                "status": "in_progress",
                "time_remaining": test.get("duration_minutes", 60) * 60 - (assignment.get("time_taken", 0) or 0),
            })

    ip_address = request.remote_addr
    user_agent = request.headers.get("User-Agent", "")

    update_fields = {
        "status": "in_progress",
        "started_at": datetime.now().isoformat(),
        "ip_address": ip_address,
        "violation_count": 0,
        "tab_switch_count": 0,
    }
    update_assignment(test_id, candidate_id, update_fields)

    audit_log("test_started", session["user_email"], {
        "test_id": test_id,
        "ip_address": ip_address,
        "user_agent": user_agent,
    }, ip=ip_address)

    return jsonify({
        "success": True,
        "message": "Test started",
        "started_at": datetime.now().isoformat(),
        "status": "in_progress",
        "time_remaining": test.get("duration_minutes", 60) * 60,
    })


@test_session_bp.route("/api/test/<test_id>/submit", methods=["POST"])
@test_session_bp.route("/api/student/tests/<test_id>/submit", methods=["POST"])
@login_required
def submit_test(test_id):
    candidate = get_candidate_by_email(session["user_email"])
    if not candidate:
        return jsonify({"error": "Candidate not found"}), 404

    test = get_test_by_id_str(test_id)
    if not test:
        return jsonify({"error": "Test not found"}), 404

    candidate_id = candidate["candidate_id"]
    assignment = get_assignment(test_id, candidate_id)
    if not assignment:
        return jsonify({"error": "Not assigned to this test"}), 403

    if assignment.get("status") in ("completed", "disqualified"):
        return jsonify({"error": "Test already finalized"}), 400

    if assignment.get("is_locked") and assignment.get("status") == "disqualified":
        return jsonify({"error": "Test session is locked due to disqualification"}), 403

    data = request.json or {}
    answers = data.get("answers", {})
    time_taken = int(data.get("time_taken", 0))
    telemetry = data.get("telemetry", {})
    webcam_status = data.get("webcam_status", "Active")

    if assignment.get("status") not in ("in_progress", "in-progress"):
        update_assignment(test_id, candidate_id, {
            "status": "in-progress",
            "started_at": assignment.get("started_at") or datetime.now().isoformat(),
        })

    scores_result = compute_scores_from_answers(
        test, answers, time_taken, assignment.get("violation_count", 0)
    )
    scores = scores_result["scores"]
    selected_status = scores_result["selected_status"]

    update_fields = {
        "status": "completed",
        "completed_at": datetime.now().isoformat(),
        "answers": answers,
        "time_taken": time_taken,
        "scores": scores,
        "selected": selected_status,
        "is_locked": False,
    }

    if assignment.get("status") == "disqualified":
        update_fields["status"] = "disqualified"
        update_fields["scores"] = {"score_final": 0.0}
        update_fields["selected"] = 3

    from models.database import save_db
    db = load_db()
    candidate_data = next((c for c in db["candidates"] if c.get("candidate_id") == candidate_id), None)
    if candidate_data:
        candidate_data.update({
            "score_logic": scores.get("score_logic", 0),
            "score_creativity": scores.get("score_creativity", 0),
            "score_ai_knowledge": scores.get("score_ai_knowledge", 0),
            "score_problem_solving": scores.get("score_problem_solving", 0),
            "score_research": scores.get("score_research", 0),
            "score_ai_potential": scores.get("score_ai_potential", 0),
            "score_workshop_compat": scores.get("score_workshop_compat", 0),
            "score_selection_prob": scores.get("score_selection_prob", 0),
            "score_time": scores.get("score_time", 0),
            "score_final": scores.get("score_final", 0),
            "selected": selected_status,
            "completed": True,
            "completed_at": datetime.now().isoformat(),
        })
        save_db(db)

    update_assignment(test_id, candidate_id, update_fields)

    from services.achievement_engine import compute_badges
    badges = compute_badges(scores, selected_status)

    audit_log("test_submitted", session["user_email"], {
        "test_id": test_id,
        "score": scores.get("score_final", 0),
        "time_taken": time_taken,
        "violations": assignment.get("violation_count", 0),
    }, ip=request.remote_addr)

    return jsonify({
        "success": True,
        "message": "Test submitted successfully",
        "scores": scores,
        "badges": badges,
        "selected_status": selected_status,
        "violation_count": assignment.get("violation_count", 0),
        "status": "Disqualified" if selected_status == 3 else "Completed",
    })


@test_session_bp.route("/api/test/<test_id>/security-event", methods=["POST"])
@login_required
def report_security_event(test_id):
    candidate = get_candidate_by_email(session["user_email"])
    if not candidate:
        return jsonify({"error": "Candidate not found"}), 404

    test = get_test_by_id_str(test_id)
    if not test:
        return jsonify({"error": "Test not found"}), 404

    candidate_id = candidate["candidate_id"]
    assignment = get_assignment(test_id, candidate_id)
    if not assignment:
        return jsonify({"error": "Not assigned to this test"}), 403

    if assignment.get("status") in ("completed", "disqualified"):
        return jsonify({"error": "Test already finalized"}), 400

    data = request.json or {}
    event_type = sanitize_input(data.get("event_type", ""))
    detail = sanitize_input(data.get("detail", ""))

    if not event_type:
        return jsonify({"error": "event_type is required"}), 400

    ip_address = request.remote_addr
    user_agent = request.headers.get("User-Agent", "")

    result = process_security_event(
        assignment, test, event_type,
        ip_address=ip_address, user_agent=user_agent, detail=detail,
    )

    audit_log("security_event", session["user_email"], {
        "test_id": test_id,
        "event_type": event_type,
        "action": result.get("action", "none"),
    }, ip=ip_address)

    response = {"success": True, "action": result.get("action", "none")}

    if result.get("action") == "auto_submit_disqualify":
        response["message"] = "Test auto-submitted due to security violation"
        response["reason"] = result.get("reason", "")
    elif result.get("action") == "warn":
        response["message"] = result.get("detail", "Warning recorded")
        response["tab_count"] = result.get("tab_count")
        response["limit"] = result.get("limit")
    elif result.get("action") == "auto_submit":
        response["message"] = "Test auto-submitted"
        response["reason"] = result.get("reason", "")
    elif result.get("action") == "pause_timer":
        response["message"] = "Timer paused"
        response["pause_seconds"] = result.get("pause_seconds", 30)
    elif result.get("action") == "resume_timer":
        response["message"] = "Timer resumed"

    return jsonify(response)


@test_session_bp.route("/api/test/<test_id>/heartbeat", methods=["POST"])
@login_required
def test_heartbeat(test_id):
    candidate = get_candidate_by_email(session["user_email"])
    if not candidate:
        return jsonify({"error": "Candidate not found"}), 404

    test = get_test_by_id_str(test_id)
    if not test:
        return jsonify({"error": "Test not found"}), 404

    candidate_id = candidate["candidate_id"]
    assignment = get_assignment(test_id, candidate_id)
    if not assignment:
        return jsonify({"error": "Not assigned"}), 403

    if assignment.get("status") in ("completed", "disqualified", "locked"):
        return jsonify({"active": False, "status": assignment.get("status")})

    if assignment.get("is_locked"):
        return jsonify({"active": False, "status": "locked", "reason": assignment.get("locked_reason", "")})

    data = request.json or {}
    current_answers = data.get("answers", {})
    time_taken = data.get("time_taken", 0)
    current_index = data.get("current_question_index", 0)

    if current_answers or time_taken:
        update_fields = {}
        if current_answers:
            update_fields["answers"] = current_answers
        if time_taken:
            update_fields["time_taken"] = int(time_taken)
        update_fields["current_question_index"] = current_index
        update_assignment(test_id, candidate_id, update_fields)

    if not is_test_window_active(test):
        return jsonify({"active": False, "reason": "test_window_closed"})

    security_rules = get_test_security_rules(test)

    return jsonify({
        "active": True,
        "time_remaining": max(0, test.get("duration_minutes", 60) * 60 - (assignment.get("time_taken", 0) or 0)),
        "is_locked": False,
        "security_rules": security_rules,
    })


@test_session_bp.route("/api/student/tests", methods=["GET"])
@login_required
def student_tests_api():
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

        is_active = is_test_window_active(test) if test.get("status") == "published" else False

        from bson import ObjectId
        assignment_data = dict(assignment)
        if "_id" in assignment_data:
            assignment_data["_id"] = str(assignment_data["_id"])

        tests.append({
            "test_id": assignment["test_id"],
            "test_name": test.get("name", "Untitled Test"),
            "test_description": test.get("description", ""),
            "test_date": test.get("date", ""),
            "test_start_time": test.get("start_time", ""),
            "test_end_time": test.get("end_time", ""),
            "test_duration_minutes": test.get("duration_minutes", 60),
            "test_difficulty": test.get("difficulty", "medium"),
            "test_status": test.get("status", "draft"),
            "test_is_active": is_active,
            "question_count": len(test.get("questions", [])),
            "assignment_status": assignment.get("status", "assigned"),
            "started_at": assignment.get("started_at"),
            "completed_at": assignment.get("completed_at"),
            "scores": assignment.get("scores", {}),
            "time_taken": assignment.get("time_taken", 0),
            "violation_count": assignment.get("violation_count", 0),
        })

    tests.sort(key=lambda t: t.get("test_date", ""), reverse=True)

    return jsonify({
        "candidate_id": candidate_id,
        "name": candidate.get("name", ""),
        "tests": tests,
    })


@test_session_bp.route("/api/student/tests/<test_id>/start", methods=["GET", "POST"])
@login_required
def api_student_start_test(test_id):
    candidate = get_candidate_by_email(session["user_email"])
    if not candidate:
        return jsonify({"error": "Candidate not found"}), 404

    test = get_test_by_id_str(test_id)
    if not test:
        return jsonify({"error": "Test not found"}), 404

    candidate_id = candidate["candidate_id"]
    assignment = get_assignment(test_id, candidate_id)
    if not assignment:
        return jsonify({"error": "Not assigned to this test"}), 403

    if assignment.get("status") in ("completed", "disqualified"):
        return jsonify({"error": "Test already finalized"}), 400
    if assignment.get("is_locked"):
        return jsonify({"error": "Test session is locked"}), 403

    if assignment.get("status") not in ("in-progress", "in_progress"):
        if not is_test_window_active(test):
            return jsonify({"error": "Test is not currently active"}), 400

        ip_address = request.remote_addr
        update_assignment(test_id, candidate_id, {
            "status": "in-progress",
            "started_at": datetime.now().isoformat(),
            "ip_address": ip_address,
        })
        audit_log("test_started", session["user_email"], {
            "test_id": test_id,
        }, ip=ip_address)
        assignment = get_assignment(test_id, candidate_id)

    questions = get_test_questions(test, candidate_id)
    security_rules = get_test_security_rules(test)
    safe_questions = []
    for q in questions:
        safe_q = dict(q)
        if "correct" in safe_q:
            del safe_q["correct"]
        safe_questions.append(safe_q)

    return jsonify({
        "success": True,
        "test_id": test_id,
        "id": test_id,
        "name": test.get("name", "Untitled Test"),
        "duration": test.get("duration_minutes", 60),
        "questions": safe_questions,
        "security_rules": security_rules,
        "status": assignment.get("status", "in-progress"),
        "started_at": assignment.get("started_at"),
        "time_remaining": assignment.get("time_remaining")
    })


@test_session_bp.route("/api/student/tests/<test_id>/violation", methods=["POST"])
@login_required
def api_student_log_violation(test_id):
    data = request.json or {}
    event_type = data.get("type", "unknown")
    
    # Rewrite request JSON to match standard reporter parameters
    request.json = {
        "event_type": event_type,
        "detail": f"Browser triggered event: {event_type}"
    }
    return report_security_event(test_id)


@test_session_bp.route("/report/<test_id>")
@test_session_bp.route("/report/<test_id>/<candidate_id>")
def show_test_report(test_id, candidate_id=None):
    if "user_email" not in session and "admin_logged_in" not in session:
        from flask import redirect, url_for
        return redirect(url_for("auth.login_page"))
    return render_template("report.html")


@test_session_bp.route("/api/report/<test_id>", methods=["GET"])
@test_session_bp.route("/api/report/<test_id>/<candidate_id>", methods=["GET"])
def api_get_test_report(test_id, candidate_id=None):
    is_admin = session.get("admin_logged_in", False)
    student_email = session.get("user_email")
    
    if not is_admin and not student_email:
        return jsonify({"error": "Authentication required"}), 401
        
    from models.database import get_candidate_by_id
    if not is_admin:
        candidate = get_candidate_by_email(student_email)
        if not candidate:
            return jsonify({"error": "Candidate not found"}), 404
        candidate_id = candidate["candidate_id"]
    else:
        if not candidate_id:
            if student_email:
                candidate = get_candidate_by_email(student_email)
                candidate_id = candidate["candidate_id"] if candidate else None
            if not candidate_id:
                return jsonify({"error": "Candidate ID is required for administrator views"}), 400

    test = get_test_by_id_str(test_id)
    if not test:
        return jsonify({"error": "Test not found"}), 404

    assignment = get_assignment(test_id, candidate_id)
    if not assignment:
        return jsonify({"error": "Not assigned to this test"}), 404

    candidate = get_candidate_by_id(candidate_id)
    if not candidate:
        return jsonify({"error": "Candidate not found"}), 404

    questions = test.get("questions", [])
    answers = assignment.get("answers", {})
    scores = assignment.get("scores", {})
    
    score_pct = int(scores.get("score_final", scores.get("final", 0)))
    
    questions_list = []
    category_scores = {}
    
    for i, q in enumerate(questions):
        q_id = q.get("id") or str(i)
        user_ans = answers.get(q_id, "")
        correct_ans = q.get("correct_answer", q.get("correct", ""))
        
        answered = bool(user_ans)
        is_correct = False
        is_partial = False
        
        if answered:
            if q.get("type") == "mcq":
                is_correct = str(user_ans).strip().lower() == str(correct_ans).strip().lower()
            else:
                is_correct = str(user_ans).strip().lower() == str(correct_ans).strip().lower()
        
        cat = q.get("category", "General")
        if cat not in category_scores:
            category_scores[cat] = {"correct": 0, "total": 0}
        category_scores[cat]["total"] += 1
        if is_correct:
            category_scores[cat]["correct"] += 1
            
        questions_list.append({
            "text": q.get("text", ""),
            "user_answer": user_ans,
            "correct_answer": correct_ans,
            "correct": is_correct,
            "partial": is_partial,
            "answered": answered,
            "xp": int(q.get("marks", 5)) * 2 if is_correct else 0
        })
        
    breakdown = []
    for cat, stat in category_scores.items():
        cat_pct = int((stat["correct"] / stat["total"]) * 100) if stat["total"] > 0 else 0
        breakdown.append({
            "category": cat,
            "score": cat_pct
        })
        
    achievements = []
    if score_pct >= 85:
        achievements.append("Elite Performer (85%+)")
    elif score_pct >= 50:
        achievements.append("Passed Challenge")
    
    violation_cnt = assignment.get("violation_count", 0)
    if violation_cnt == 0:
        achievements.append("Honor Code Verified (0 Violations)")

    return jsonify({
        "candidate_name": candidate.get("name", "Unknown"),
        "candidate_id": candidate_id,
        "email": candidate.get("email", ""),
        "college": candidate.get("college", ""),
        "department": candidate.get("department", ""),
        "test_name": test.get("name", "Untitled Test"),
        "date": test.get("date", ""),
        "score": score_pct,
        "breakdown": breakdown,
        "achievements": achievements,
        "questions": questions_list
    })
