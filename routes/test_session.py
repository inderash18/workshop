import json
from datetime import datetime
from flask import Blueprint, request, jsonify, session, render_template, redirect, url_for

from core.database.models import (
    load_db, save_db, get_candidate_by_email, get_test_by_id_str,
    get_assignment, update_assignment, get_assignments_for_candidate,
    audit_log, get_setting,
)
from core.middleware.auth import login_required
from core.middleware.security import sanitize_input
from core.services.security_engine import (
    process_security_event, is_test_window_active,
    can_student_access_test, DISCONNECT_GRACE_SECONDS,
)
from core.services.test_engine import get_test_questions, get_test_security_rules, compute_scores_from_answers
from core.services.scoring_engine import compute_scores

test_session_bp = Blueprint("test_session", __name__)


@test_session_bp.route("/test/<test_id>")
def test_page(test_id):
    # Simply render the template. The frontend client-side code will handle
    # authentication check and assignment state/denials via the secure API endpoints.
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

    selected_questions = assignment.get("questions") or get_test_questions(test, candidate_id)
    scores_result = compute_scores_from_answers(
        {"questions": selected_questions},
        answers, time_taken, assignment.get("violation_count", 0)
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

    # Allow resuming the test session if it's already in progress
    is_resuming = assignment.get("status") in ("in-progress", "in_progress", "started")

    if not is_resuming:
        # Otherwise, initialize the test session
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
    
    # Dynamically retrieve test duration from database configuration settings
    db_duration = get_setting("test_duration_minutes")
    test_duration = int(db_duration) if db_duration is not None else int(test.get("duration_minutes", 15))

    # Calculate remaining time
    started_at_str = assignment.get("started_at")
    if started_at_str:
        try:
            started_at = datetime.fromisoformat(started_at_str)
            elapsed = (datetime.now() - started_at).total_seconds()
            time_remaining = max(0, int(test_duration * 60 - elapsed))
        except Exception:
            time_remaining = test_duration * 60
    else:
        time_remaining = test_duration * 60
    
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
        "name": test.get("name", "AI Selection Challenge"),
        "duration": test_duration,
        "questions": safe_questions,
        "security_rules": security_rules,
        "status": assignment.get("status", "in-progress"),
        "started_at": assignment.get("started_at"),
        "time_remaining": time_remaining,
        "answers": assignment.get("answers", {}),
        "current_question_index": assignment.get("current_question_index", 0)
    })


@test_session_bp.route("/api/student/tests/<test_id>/violation", methods=["POST"])
@login_required
def api_student_log_violation(test_id):
    data = request.json or {}
    event_type = sanitize_input(data.get("type", "unknown"))
    detail = sanitize_input(data.get("detail", ""))
    question_number = data.get("question_number")
    time_remaining = data.get("time_remaining")

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

    if assignment.get("status") in ("completed",):
        return jsonify({"error": "Test already finalized"}), 400

    ip_address = request.remote_addr
    user_agent = request.headers.get("User-Agent", "")

    result = process_security_event(
        assignment=assignment,
        test=test,
        event_type=event_type,
        ip_address=ip_address,
        user_agent=user_agent,
        detail=detail or f"Browser security event: {event_type}",
        question_number=question_number,
        time_remaining=time_remaining,
        session_id=request.cookies.get("session", ""),
    )

    audit_log("security_event", session["user_email"], {
        "test_id": test_id,
        "event_type": event_type,
        "level": result.get("level", "UNKNOWN"),
        "action": result.get("action", "none"),
    }, ip=ip_address)

    response = {
        "success": True,
        "action": result.get("action", "none"),
        "level": result.get("level", ""),
        "message": result.get("message", ""),
    }

    if result.get("action") in ("auto_submit_disqualify",):
        response["status"] = "disqualified"
        response["reason"] = result.get("reason", event_type)
    elif result.get("action") == "warn":
        response["tab_count"] = result.get("tab_count")
        response["blur_count"] = result.get("blur_count")
        response["remaining"] = result.get("remaining")
        response["limit"] = result.get("limit")
    elif result.get("action") == "advance_question":
        response["advance"] = True
    elif result.get("action") == "pause_timer":
        response["pause_seconds"] = result.get("pause_seconds", DISCONNECT_GRACE_SECONDS)
    elif result.get("action") == "resume_timer":
        response["resume"] = True

    return jsonify(response)


@test_session_bp.route("/api/admin/candidate-security/<candidate_id>/<test_id>", methods=["GET"])
def api_admin_candidate_security(candidate_id, test_id):
    """Admin endpoint: full security analytics for a specific candidate's test attempt."""
    if not session.get("admin_logged_in"):
        return jsonify({"error": "Admin access required"}), 403

    from models.database import get_candidate_by_id, get_security_events_for_candidate
    from services.security_engine import get_security_analytics_for_assignment

    assignment = get_assignment(test_id, candidate_id)
    if not assignment:
        return jsonify({"error": "Assignment not found"}), 404

    test = get_test_by_id_str(test_id)
    candidate = get_candidate_by_id(candidate_id)

    analytics = get_security_analytics_for_assignment(assignment)

    # Get all security events from MongoDB for this candidate+test
    from models.database import _col
    from bson import ObjectId
    events = list(_col("security_events").find(
        {"test_id": test_id, "candidate_id": candidate_id}
    ).sort("timestamp", -1).limit(200))
    for e in events:
        e["_id"] = str(e["_id"])

    scores = assignment.get("scores", {})
    score_final = float(scores.get("score_final") or scores.get("final") or 0)

    # Question analytics
    questions = assignment.get("questions", [])
    answers = assignment.get("answers", {})
    question_analytics = []
    for i, q in enumerate(questions):
        qid = q.get("id") or q.get("_id")
        answer = answers.get(qid, "")
        correct = q.get("correct_answer") or q.get("correct", "")
        is_correct = str(answer).strip().lower() == str(correct).strip().lower() if answer else False
        question_analytics.append({
            "number": i + 1,
            "title": q.get("title") or q.get("text", "")[:80],
            "type": q.get("type") or q.get("question_type", ""),
            "answer_submitted": bool(answer),
            "answer": answer,
            "correct": is_correct,
            "marks": q.get("marks", 10),
            "marks_obtained": q.get("marks", 10) if is_correct else 0,
        })

    return jsonify({
        "candidate": {
            "name": candidate.get("name", "") if candidate else "",
            "candidate_id": candidate_id,
            "email": candidate.get("email", "") if candidate else "",
            "college": candidate.get("college", "") if candidate else "",
            "department": candidate.get("department", "") if candidate else "",
        },
        "test": {
            "name": test.get("name", "") if test else "",
            "test_id": test_id,
            "status": assignment.get("status", ""),
            "assigned_at": assignment.get("created_at", ""),
            "started_at": assignment.get("started_at", ""),
            "completed_at": assignment.get("completed_at", ""),
            "score": round(score_final, 1),
            "score_percentage": round(score_final, 1),
            "violation_count": assignment.get("violation_count", 0),
            "tab_switch_count": assignment.get("tab_switch_count", 0),
            "time_taken": assignment.get("time_taken", 0),
            "disqualification_reason": assignment.get("disqualification_reason", ""),
        },
        "security": analytics,
        "question_analytics": question_analytics,
        "ai_scores": {
            "logic": scores.get("score_logic", 0),
            "creativity": scores.get("score_creativity", 0),
            "innovation": scores.get("score_creativity", 0),
            "problem_solving": scores.get("score_problem_solving", 0),
            "human_intelligence": scores.get("score_ai_knowledge", 0),
            "security_score": analytics.get("security_score", 100),
            "ai_recommendation": _get_ai_recommendation(score_final, analytics.get("security_score", 100)),
        },
        "final_status": _get_final_status(assignment),
        "events": events,
    })


def _get_ai_recommendation(score, security_score):
    if security_score == 0:
        return "Disqualified"
    combined = score * 0.7 + security_score * 0.3
    if combined >= 80:
        return "Highly Recommended"
    if combined >= 65:
        return "Recommended"
    if combined >= 50:
        return "Borderline"
    return "Not Recommended"


def _get_final_status(assignment):
    status = assignment.get("status", "assigned")
    selected = assignment.get("selected", 0)
    if status == "disqualified":
        return "disqualified"
    if status == "completed":
        labels = {1: "selected", 2: "rejected", 3: "disqualified", 4: "waitlisted"}
        return labels.get(selected, "completed")
    return status


def generate_ai_recommendation(scores, violations_count):
    if violations_count >= 3:
        return "ELITE REVIEW BLOCK: High proctoring flags logged. Potential breach of challenge protocol."
    score = scores.get("score_final", scores.get("final", 0))
    if score >= 90:
        return "ELITE LEVEL: Candidate exhibits exceptional cognitive parsing, advanced logical agility, and master-level creative resolution. Strongly prioritized for direct fellowship allocation."
    elif score >= 80:
        return "HIGHLY RECOMMENDED: Strong problem solving and logical agility demonstrated. Consistent score metrics qualify candidate for cohort workshops."
    elif score >= 65:
        return "RECOMMENDED: Balanced capability shown across cognitive benchmarks. Standard recommendation status for fellowship review."
    elif score >= 50:
        return "WAITLISTED: Candidate meets basic logic constraints but lacks depth in creativity and prompt intelligence domains."
    else:
        return "NOT RECOMMENDED: Cognitive metrics fall below cohort threshold values."


def build_test_report_data(test_id, candidate_id):
    from models.database import get_candidate_by_id, get_assignment, get_test_by_id_str, get_candidate_by_email
    from services.security_engine import get_security_analytics_for_assignment
    
    test = get_test_by_id_str(test_id)
    if not test:
        return None
        
    assignment = get_assignment(test_id, candidate_id)
    if not assignment:
        return None
        
    candidate = get_candidate_by_id(candidate_id)
    if not candidate:
        return None
        
    questions = test.get("questions", [])
    answers = assignment.get("answers", {})
    scores = assignment.get("scores", {})
    
    # Calculate correct/wrong/skipped questions
    correct_count = 0
    wrong_count = 0
    skipped_count = 0
    questions_list = []
    category_scores = {}
    
    for i, q in enumerate(questions):
        q_id = q.get("id") or str(i)
        user_ans = answers.get(q_id, "")
        correct_ans = q.get("correct_answer", q.get("correct", ""))
        
        answered = bool(user_ans)
        is_correct = False
        
        if answered:
            is_correct = str(user_ans).strip().lower() == str(correct_ans).strip().lower()
            if is_correct:
                correct_count += 1
            else:
                wrong_count += 1
        else:
            skipped_count += 1
            
        cat = q.get("category", "General")
        if cat not in category_scores:
            category_scores[cat] = {"correct": 0, "total": 0}
        category_scores[cat]["total"] += 1
        if is_correct:
            category_scores[cat]["correct"] += 1
            
        questions_list.append({
            "number": i + 1,
            "text": q.get("text", ""),
            "category": cat,
            "difficulty": q.get("difficulty_level", q.get("difficulty", "medium")),
            "marks": q.get("marks", q.get("xp_points", 10)),
            "user_answer": user_ans,
            "correct_answer": correct_ans,
            "correct": is_correct,
            "answered": answered,
            "xp": int(q.get("marks", 10)) * 2 if is_correct else 0
        })
        
    breakdown = []
    for cat, stat in category_scores.items():
        cat_pct = int((stat["correct"] / stat["total"]) * 100) if stat["total"] > 0 else 0
        breakdown.append({
            "category": cat,
            "score": cat_pct
        })
        
    score_pct = int(scores.get("score_final", scores.get("final", 0)))
    
    achievements = []
    if score_pct >= 85:
        achievements.append("Elite Performer (85%+)")
    elif score_pct >= 50:
        achievements.append("Passed Challenge")
        
    violation_cnt = assignment.get("violation_count", 0)
    if violation_cnt == 0:
        achievements.append("Honor Code Verified (0 Violations)")
        
    # Get security analytics
    sec_analytics = get_security_analytics_for_assignment(assignment)
    security_score = int(sec_analytics.get("security_score", 100))
    
    # Calculate AI recommendations and subscores
    logic_score = int(scores.get("logic", score_pct))
    creativity_score = int(scores.get("creativity", score_pct))
    problem_solving_score = int(scores.get("problem_solving", score_pct))
    innovation_score = int(scores.get("innovation", score_pct))
    human_intel_score = int(scores.get("ai_knowledge", score_pct))
    
    # Time taken formatting
    started_at = assignment.get("started_at")
    completed_at = assignment.get("completed_at")
    time_taken_secs = 0
    if started_at and completed_at:
        try:
            from datetime import datetime
            t1 = datetime.fromisoformat(started_at)
            t2 = datetime.fromisoformat(completed_at)
            time_taken_secs = int((t2 - t1).total_seconds())
        except Exception:
            pass
    if time_taken_secs <= 0:
        time_taken_secs = assignment.get("time_taken", 0)
        
    minutes = time_taken_secs // 60
    seconds = time_taken_secs % 60
    time_taken_str = f"{minutes}m {seconds}s"
    
    # AI recommendation
    ai_reco = generate_ai_recommendation(scores, violation_cnt)
    
    # Final Selection Status Mapping
    status_map = {1: "Selected", 2: "Rejected", 3: "Disqualified", 4: "Waitlisted"}
    final_selection_status = status_map.get(candidate.get("selected", 0), "Waitlisted")
    if assignment.get("status") == "disqualified":
        final_selection_status = "Disqualified"
        
    ai_reco_badge = "RECOMMENDED"
    if violation_cnt >= 3 or assignment.get("status") == "disqualified":
        ai_reco_badge = "DISQUALIFIED"
    else:
        if score_pct >= 90:
            ai_reco_badge = "ELITE CANDIDATE"
        elif score_pct >= 80:
            ai_reco_badge = "HIGHLY RECOMMENDED"
        elif score_pct >= 65:
            ai_reco_badge = "RECOMMENDED"
        elif score_pct >= 50:
            ai_reco_badge = "WAITLISTED"
        else:
            ai_reco_badge = "NOT RECOMMENDED"
            
    report_data = {
        "candidate_name": candidate.get("name", "Unknown"),
        "candidate_id": candidate_id,
        "email": candidate.get("email", ""),
        "college": candidate.get("college", ""),
        "department": candidate.get("department", ""),
        "test_name": test.get("name", "Untitled Test"),
        "date": test.get("date", ""),
        "score_final": score_pct,
        "security_score": security_score,
        "total_questions": len(questions),
        "correct_answers": correct_count,
        "wrong_answers": wrong_count,
        "skipped_answers": skipped_count,
        "attempted_questions": correct_count + wrong_count,
        "time_taken_str": time_taken_str,
        "violations": {
            "fullscreen": sec_analytics.get("fullscreen_violations", 0),
            "tab_switch": sec_analytics.get("tab_switch_count", 0),
            "copy": sec_analytics.get("copy_attempts", 0),
            "paste": sec_analytics.get("paste_attempts", 0),
            "devtools": sec_analytics.get("devtools_attempts", 0),
            "disconnect": sec_analytics.get("disconnect_events", 0),
            "suspicious": sec_analytics.get("suspicious_activities", 0),
        },
        "ai_report": {
            "critical_thinking": logic_score,
            "creativity": creativity_score,
            "problem_solving": problem_solving_score,
            "innovation": innovation_score,
            "human_intelligence": human_intel_score,
            "security": security_score,
            "future_leader": score_pct,
            "ai_thinking": human_intel_score,
        },
        "ai_recommendation": ai_reco,
        "ai_recommendation_badge": ai_reco_badge,
        "final_selection_status": final_selection_status,
        "achievements": achievements,
        "breakdown": breakdown,
        "questions": questions_list
    }
    return report_data


@test_session_bp.route("/report/<test_id>")
@test_session_bp.route("/report/<test_id>/<candidate_id>")
def show_test_report(test_id, candidate_id=None):
    if "user_email" not in session and "admin_logged_in" not in session:
        from flask import redirect, url_for
        return redirect(url_for("auth.login_page"))
        
    is_admin = session.get("admin_logged_in", False)
    student_email = session.get("user_email")
    
    from models.database import get_candidate_by_email
    if not is_admin:
        candidate = get_candidate_by_email(student_email)
        if not candidate:
            return "Candidate not found", 404
        candidate_id = candidate["candidate_id"]
    else:
        if not candidate_id:
            if student_email:
                candidate = get_candidate_by_email(student_email)
                candidate_id = candidate["candidate_id"] if candidate else None
            if not candidate_id:
                return "Candidate ID is required for administrator views", 400
                
    report = build_test_report_data(test_id, candidate_id)
    if not report:
        return "Report data not found", 404
        
    return render_template("report.html", report=report)


@test_session_bp.route("/api/report/<test_id>", methods=["GET"])
@test_session_bp.route("/api/report/<test_id>/<candidate_id>", methods=["GET"])
def api_get_test_report(test_id, candidate_id=None):
    is_admin = session.get("admin_logged_in", False)
    student_email = session.get("user_email")
    
    if not is_admin and not student_email:
        return jsonify({"error": "Authentication required"}), 401
        
    from models.database import get_candidate_by_email
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

    report = build_test_report_data(test_id, candidate_id)
    if not report:
        return jsonify({"error": "Report data not found"}), 404
        
    return jsonify(report)


@test_session_bp.route("/api/student/tests/<test_id>/answer", methods=["POST"])
@login_required
def api_student_save_answer(test_id):
    candidate = get_candidate_by_email(session["user_email"])
    if not candidate:
        return jsonify({"error": "Candidate not found"}), 404
    
    assignment = get_assignment(test_id, candidate["candidate_id"])
    if not assignment:
        return jsonify({"error": "Not assigned to this test"}), 403
        
    if assignment.get("status") in ("completed", "disqualified"):
        return jsonify({"error": "Test session already finalized"}), 400
        
    data = request.json or {}
    q_id = data.get("question_id")
    answer_val = data.get("answer")
    current_index = data.get("current_question_index")
    
    # Update answers dictionary in assignment
    answers = assignment.get("answers", {})
    answers[q_id] = answer_val
    
    update_fields = {"answers": answers}
    if current_index is not None:
        try:
            update_fields["current_question_index"] = int(current_index)
        except ValueError:
            pass

    update_assignment(test_id, candidate["candidate_id"], update_fields)
    
    return jsonify({"success": True})
