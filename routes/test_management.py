import json
import csv
import io
from datetime import datetime
from flask import Blueprint, request, jsonify, session, redirect, url_for, render_template, Response
from bson import ObjectId
from core.database.models import (
    load_db, save_db, get_candidate_by_email, get_candidate_by_id,
    create_test, get_test_by_id, get_test_by_id_str, update_test,
    delete_test, get_all_tests, create_assignment, get_assignment,
    update_assignment, get_assignments_for_test,
    get_assignments_for_test_by_status, get_security_events_for_test,
    audit_log, get_setting,
)
from core.middleware.security import sanitize_input
from core.middleware.auth import admin_required
from core.services.test_engine import (
    get_test_questions, get_test_security_rules,
    compute_scores_from_answers, format_test_for_display,
)

test_management_bp = Blueprint("test_management", __name__)


def _serialize_test(test):
    if not test:
        return None
    data = dict(test)
    if "_id" in data:
        data["_id"] = str(data["_id"])
    data["id"] = data.get("_id", "")
    data["title"] = data.get("name", "Untitled Test")
    data["duration"] = data.get("duration_minutes", 60)
    data["total_marks"] = data.get("total_marks") or sum(int(q.get("marks", 5)) for q in data.get("questions", [])) or 100
    data["question_count"] = len(data.get("questions", []))
    data["questions_count"] = len(data.get("questions", []))
    return data


@test_management_bp.route("/admin/tests")
@test_management_bp.route("/admin/tests/create")
@test_management_bp.route("/admin/tests/<test_id>/manage")
def redirect_to_admin(*args, **kwargs):
    return redirect("/admin")


@test_management_bp.route("/api/admin/tests/create", methods=["POST"])
@test_management_bp.route("/api/admin/tests", methods=["POST"])
@admin_required
def api_create_test():
    data = request.json or {}
    name = sanitize_input(data.get("name", ""))
    description = sanitize_input(data.get("description", ""))
    date = sanitize_input(data.get("date", ""))
    start_time = sanitize_input(data.get("start_time", ""))
    end_time = sanitize_input(data.get("end_time", ""))
    duration_minutes = data.get("duration_minutes", 60)
    difficulty = data.get("difficulty", "medium")
    selection_count = data.get("selection_count", 30)
    questions = data.get("questions", [])
    security_rules = data.get("security_rules", {})

    if not name:
        return jsonify({"error": "Test name is required"}), 400
    if not date:
        return jsonify({"error": "Test date is required"}), 400
    if difficulty not in ["easy", "medium", "hard", "expert"]:
        return jsonify({"error": "Invalid difficulty level"}), 400

    if duration_minutes < 1 or duration_minutes > 480:
        return jsonify({"error": "Duration must be between 1 and 480 minutes"}), 400

    for i, q in enumerate(questions):
        if not q.get("text"):
            return jsonify({"error": f"Question {i+1} is missing text"}), 400
        if q.get("type", "mcq") not in ("mcq", "text", "textarea"):
            return jsonify({"error": f"Question {i+1} has invalid type"}), 400

    test_data = {
        "name": name,
        "description": description,
        "date": date,
        "start_time": start_time,
        "end_time": end_time,
        "duration_minutes": int(duration_minutes),
        "difficulty": difficulty,
        "selection_count": int(selection_count),
        "questions": questions,
        "security_rules": security_rules or get_test_security_rules(None),
        "status": "draft",
        "created_by": session.get("admin_username", "admin"),
    }

    test = create_test(test_data)
    test_id = str(test["_id"])

    audit_log("test_created", session.get("admin_username"), {
        "test_id": test_id, "name": name, "question_count": len(questions),
    }, ip=request.remote_addr)

    return jsonify({"success": True, "test_id": test_id, "message": "Test created successfully"})


@test_management_bp.route("/api/admin/tests/<test_id>/update", methods=["PUT"])
@test_management_bp.route("/api/admin/tests/<test_id>", methods=["PUT"])
@admin_required
def api_update_test(test_id):
    test = get_test_by_id_str(test_id)
    if not test:
        return jsonify({"error": "Test not found"}), 404

    if test.get("status") in ("completed", "locked"):
        return jsonify({"error": f"Cannot update test in '{test.get('status')}' status"}), 400

    data = request.json or {}
    update_data = {}
    allowed_fields = [
        "name", "description", "date", "start_time", "end_time",
        "duration_minutes", "difficulty", "selection_count",
        "questions", "security_rules",
    ]

    for field in allowed_fields:
        if field in data:
            value = data[field]
            if field in ("name", "description", "date", "start_time", "end_time", "difficulty"):
                value = sanitize_input(str(value))
            update_data[field] = value

    if not update_data:
        return jsonify({"error": "No valid fields to update"}), 400

    update_test(test_id, update_data)
    audit_log("test_updated", session.get("admin_username"), {
        "test_id": test_id, "fields": list(update_data.keys()),
    }, ip=request.remote_addr)

    return jsonify({"success": True, "message": "Test updated successfully"})


@test_management_bp.route("/api/admin/tests/<test_id>/delete", methods=["DELETE"])
@test_management_bp.route("/api/admin/tests/<test_id>", methods=["DELETE"])
@admin_required
def api_delete_test(test_id):
    test = get_test_by_id_str(test_id)
    if not test:
        return jsonify({"error": "Test not found"}), 404

    delete_test(test_id)
    audit_log("test_deleted", session.get("admin_username"), {
        "test_id": test_id, "name": test.get("name", ""),
    }, ip=request.remote_addr)

    return jsonify({"success": True, "message": "Test deleted successfully"})


@test_management_bp.route("/api/admin/tests", methods=["GET"])
@admin_required
def api_list_tests():
    status_filter = request.args.get("status", "")
    if status_filter:
        if status_filter == "all":
            tests = get_all_tests()
        else:
            from models.database import get_tests_by_status
            tests = get_tests_by_status(status_filter)
    else:
        tests = get_all_tests()

    results = [_serialize_test(t) for t in tests]
    return jsonify({"tests": results, "total": len(results)})


@test_management_bp.route("/api/admin/tests/<test_id>", methods=["GET"])
@admin_required
def api_get_test(test_id):
    test = get_test_by_id_str(test_id)
    if not test:
        return jsonify({"error": "Test not found"}), 404

    assignments = get_assignments_for_test(test_id)
    status_counts = {}
    for a in assignments:
        s = a.get("status", "assigned")
        status_counts[s] = status_counts.get(s, 0) + 1

    data = _serialize_test(test)
    data["assignment_stats"] = {
        "total": len(assignments),
        "by_status": status_counts,
    }

    return jsonify(data)


@test_management_bp.route("/api/admin/tests/<test_id>/publish", methods=["POST", "PUT"])
@admin_required
def api_publish_test(test_id):
    test = get_test_by_id_str(test_id)
    if not test:
        return jsonify({"error": "Test not found"}), 404

    target_status = "published"
    if request.method == "PUT":
        data = request.json or {}
        published = data.get("published", True)
        target_status = "published" if published else "draft"

    if target_status == "published":
        if test.get("status") not in ("draft",):
            return jsonify({"error": f"Cannot publish test in '{test.get('status')}' status"}), 400

        questions = test.get("questions", [])
        if not questions:
            return jsonify({"error": "Cannot publish test without questions"}), 400

        update_test(test_id, {"status": "published"})
        
        # Assign to all existing candidates automatically
        from models.database import create_assignment
        try:
            db = load_db()
            candidates = db.get("candidates", [])
            for c in candidates:
                c_id = c.get("candidate_id") or c.get("email")
                if c_id:
                    create_assignment(test_id, c_id)
        except Exception:
            pass

        audit_log("test_published", session.get("admin_username"), {
            "test_id": test_id, "name": test.get("name", ""),
        }, ip=request.remote_addr)

        return jsonify({"success": True, "message": "Test published successfully"})
    else:
        update_test(test_id, {"status": "draft"})
        audit_log("test_unpublished", session.get("admin_username"), {
            "test_id": test_id, "name": test.get("name", ""),
        }, ip=request.remote_addr)

        return jsonify({"success": True, "message": "Test unpublished to draft successfully"})


@test_management_bp.route("/api/admin/tests/<test_id>/lock", methods=["POST", "PUT"])
@admin_required
def api_lock_test(test_id):
    test = get_test_by_id_str(test_id)
    if not test:
        return jsonify({"error": "Test not found"}), 404

    target_lock = True
    if request.method == "PUT":
        data = request.json or {}
        target_lock = data.get("locked", True)

    if target_lock:
        if test.get("status") not in ("published",):
            return jsonify({"error": f"Cannot lock test in '{test.get('status')}' status"}), 400

        update_test(test_id, {"status": "locked"})
        audit_log("test_locked", session.get("admin_username"), {
            "test_id": test_id, "name": test.get("name", ""),
        }, ip=request.remote_addr)

        return jsonify({"success": True, "message": "Test locked successfully"})
    else:
        if test.get("status") not in ("locked",):
            return jsonify({"error": f"Cannot unlock test in '{test.get('status')}' status"}), 400

        update_test(test_id, {"status": "published"})
        audit_log("test_unlocked", session.get("admin_username"), {
            "test_id": test_id, "name": test.get("name", ""),
        }, ip=request.remote_addr)

        return jsonify({"success": True, "message": "Test unlocked successfully"})


@test_management_bp.route("/api/admin/tests/<test_id>/unlock", methods=["POST"])
@admin_required
def api_unlock_test(test_id):
    test = get_test_by_id_str(test_id)
    if not test:
        return jsonify({"error": "Test not found"}), 404

    if test.get("status") not in ("locked",):
        return jsonify({"error": f"Cannot unlock test in '{test.get('status')}' status"}), 400

    update_test(test_id, {"status": "published"})
    audit_log("test_unlocked", session.get("admin_username"), {
        "test_id": test_id, "name": test.get("name", ""),
    }, ip=request.remote_addr)

    return jsonify({"success": True, "message": "Test unlocked and re-published"})


@test_management_bp.route("/api/admin/tests/<test_id>/assign", methods=["POST"])
@admin_required
def api_assign_test(test_id):
    test = get_test_by_id_str(test_id)
    if not test:
        return jsonify({"error": "Test not found"}), 404

    data = request.json or {}
    candidate_ids = data.get("candidate_ids", [])
    if not candidate_ids:
        return jsonify({"error": "No candidate IDs provided"}), 400

    assigned = 0
    skipped = 0
    skipped_reasons = []

    for cid in candidate_ids:
        try:
            cid = sanitize_input(str(cid))
            
            if not cid:
                skipped += 1
                skipped_reasons.append("Invalid candidate ID format")
                continue

            candidate = get_candidate_by_id(cid)
            if not candidate:
                skipped += 1
                skipped_reasons.append(f"Candidate {cid} not found")
                continue

            existing = get_assignment(test_id, cid)
            if existing:
                skipped += 1
                if existing.get("status") == "completed":
                    skipped_reasons.append(f"Candidate {cid} already completed test")
                elif existing.get("status") == "disqualified":
                    skipped_reasons.append(f"Candidate {cid} disqualified from this test")
                elif existing.get("is_locked"):
                    skipped_reasons.append(f"Candidate {cid} test session locked")
                else:
                    skipped_reasons.append(f"Candidate {cid} already assigned")
                continue

            try:
                create_assignment(test_id, cid)
                assigned += 1
                audit_log("assignment_created", session.get("admin_username"), {
                    "test_id": test_id,
                    "candidate_id": cid,
                    "candidate_name": candidate.get("name", ""),
                }, ip=request.remote_addr)
            except Exception as e:
                skipped += 1
                skipped_reasons.append(f"Failed to create assignment for candidate {cid}: {str(e)}")
                continue

        except Exception as e:
            skipped += 1
            skipped_reasons.append(f"Error processing candidate {cid}: {str(e)}")
            continue

    audit_log("test_assigned_bulk", session.get("admin_username"), {
        "test_id": test_id,
        "assigned": assigned,
        "skipped": skipped,
        "skipped_reasons": skipped_reasons[:5],  # Limit to first 5 reasons to avoid large log
        "test_status": test.get("status", "draft"),
    }, ip=request.remote_addr)

    response = {"success": True, "assigned": assigned, "skipped": skipped}
    if skipped_reasons:
        response["skipped_reasons_samples"] = skipped_reasons[:5]
    if skipped > 10:
        response["note"] = f"Skipped {skipped - 10} candidates due to various validation failures. See skipped_reasons_samples for details."

    return jsonify(response)


@test_management_bp.route("/api/admin/tests/<test_id>/assign-all", methods=["POST"])
@admin_required
def api_assign_test_all(test_id):
    test = get_test_by_id_str(test_id)
    if not test:
        return jsonify({"error": "Test not found"}), 404

    db = load_db()
    all_candidates = db.get("candidates", [])

    assigned = 0
    skipped = 0
    for candidate in all_candidates:
        cid = candidate.get("candidate_id", "")
        if not cid:
            skipped += 1
            continue
        existing = get_assignment(test_id, cid)
        if existing:
            skipped += 1
            continue
        create_assignment(test_id, cid)
        assigned += 1

    audit_log("test_assigned_all", session.get("admin_username"), {
        "test_id": test_id, "assigned": assigned, "skipped": skipped,
    }, ip=request.remote_addr)

    return jsonify({"success": True, "assigned": assigned, "skipped": skipped, "total_candidates": len(all_candidates)})


@test_management_bp.route("/api/admin/tests/<test_id>/candidates", methods=["GET"])
@admin_required
def api_test_candidates(test_id):
    test = get_test_by_id_str(test_id)
    if not test:
        return jsonify({"error": "Test not found"}), 404

    assignments = get_assignments_for_test(test_id)
    results = []
    for a in assignments:
        candidate = get_candidate_by_id(a.get("candidate_id", ""))
        a_data = dict(a)
        if "_id" in a_data:
            a_data["_id"] = str(a_data["_id"])
        a_data["id"] = a.get("candidate_id", "")
        a_data["name"] = candidate.get("name", "Unknown") if candidate else "Unknown"
        a_data["email"] = candidate.get("email", "") if candidate else ""
        a_data["status"] = a.get("status", "assigned")
        a_data["score"] = a.get("scores", {}).get("final")
        a_data["started_at"] = a.get("started_at", "")
        results.append(a_data)

    return jsonify(results)


@test_management_bp.route("/api/admin/tests/<test_id>/security", methods=["POST"])
@admin_required
def api_update_security_rules(test_id):
    test = get_test_by_id_str(test_id)
    if not test:
        return jsonify({"error": "Test not found"}), 404

    data = request.json or {}
    security_rules = get_test_security_rules(test)
    security_rules.update(data)

    update_test(test_id, {"security_rules": security_rules})
    audit_log("security_rules_updated", session.get("admin_username"), {
        "test_id": test_id, "rules": list(data.keys()),
    }, ip=request.remote_addr)

    return jsonify({"success": True, "security_rules": security_rules})


@test_management_bp.route("/api/admin/tests/<test_id>/questions/add", methods=["POST"])
@admin_required
def api_add_questions(test_id):
    test = get_test_by_id_str(test_id)
    if not test:
        return jsonify({"error": "Test not found"}), 404

    if test.get("status") not in ("draft",):
        return jsonify({"error": "Can only add questions to draft tests"}), 400

    data = request.json or {}
    new_questions = data.get("questions", [])
    if not new_questions:
        return jsonify({"error": "No questions provided"}), 400

    for i, q in enumerate(new_questions):
        if not q.get("text"):
            return jsonify({"error": f"Question {i+1} is missing text"}), 400
        if q.get("type", "mcq") not in ("mcq", "text", "textarea"):
            return jsonify({"error": f"Question {i+1} has invalid type"}), 400

    existing_questions = test.get("questions", [])
    existing_questions.extend(new_questions)
    update_test(test_id, {"questions": existing_questions})

    audit_log("questions_added", session.get("admin_username"), {
        "test_id": test_id, "count": len(new_questions),
    }, ip=request.remote_addr)

    return jsonify({"success": True, "total_questions": len(existing_questions)})


@test_management_bp.route("/api/admin/tests/<test_id>/questions/remove", methods=["POST"])
@admin_required
def api_remove_question(test_id):
    test = get_test_by_id_str(test_id)
    if not test:
        return jsonify({"error": "Test not found"}), 404

    if test.get("status") not in ("draft",):
        return jsonify({"error": "Can only remove questions from draft tests"}), 400

    data = request.json or {}
    question_id = data.get("question_id")
    if not question_id:
        return jsonify({"error": "question_id is required"}), 400

    questions = test.get("questions", [])
    new_questions = [q for q in questions if q.get("id") != question_id]

    if len(new_questions) == len(questions):
        return jsonify({"error": "Question not found"}), 404

    update_test(test_id, {"questions": new_questions})

    audit_log("question_removed", session.get("admin_username"), {
        "test_id": test_id, "question_id": question_id,
    }, ip=request.remote_addr)

    return jsonify({"success": True, "total_questions": len(new_questions)})


@test_management_bp.route("/api/admin/tests/<test_id>/disqualify", methods=["POST"])
@admin_required
def api_disqualify_candidate(test_id):
    test = get_test_by_id_str(test_id)
    if not test:
        return jsonify({"error": "Test not found"}), 404

    data = request.json or {}
    candidate_id = sanitize_input(data.get("candidate_id", ""))
    reason = sanitize_input(data.get("reason", "Manual disqualification"))

    if not candidate_id:
        return jsonify({"error": "candidate_id is required"}), 400

    assignment = get_assignment(test_id, candidate_id)
    if not assignment:
        return jsonify({"error": "Assignment not found"}), 404

    update_assignment(test_id, candidate_id, {
        "status": "disqualified",
        "is_locked": True,
        "locked_reason": reason,
        "completed_at": datetime.now().isoformat(),
        "scores": {"score_final": 0.0},
        "violations": assignment.get("violations", []) + [{
            "type": "manual_disqualification",
            "timestamp": datetime.now().isoformat(),
            "detail": reason,
        }],
        "violation_count": assignment.get("violation_count", 0) + 1,
    })

    audit_log("candidate_disqualified", session.get("admin_username"), {
        "test_id": test_id, "candidate_id": candidate_id, "reason": reason,
    }, ip=request.remote_addr)

    return jsonify({"success": True, "message": f"Candidate {candidate_id} disqualified"})
@test_management_bp.route("/api/admin/tests/<test_id>/reset-candidate", methods=["POST"])
@admin_required
def api_reset_candidate_attempt(test_id):
    test = get_test_by_id_str(test_id)
    if not test:
        return jsonify({"error": "Test not found"}), 404

    data = request.json or {}
    candidate_id = sanitize_input(data.get("candidate_id", ""))

    if not candidate_id:
        return jsonify({"error": "candidate_id is required"}), 400

    assignment = get_assignment(test_id, candidate_id)
    if not assignment:
        return jsonify({"error": "Assignment not found"}), 404

    update_fields = {
        "status": "assigned",
        "started_at": None,
        "completed_at": None,
        "time_remaining": None,
        "current_question_index": 0,
        "answers": {},
        "violations": [],
        "violation_count": 0,
        "tab_switch_count": 0,
        "window_blur_count": 0,
        "resize_count": 0,
        "idle_timeout_count": 0,
        "suspicious_keyboard_count": 0,
        "focus_change_count": 0,
        "suspicious_activity_count": 0,
        "is_locked": False,
        "locked_reason": None,
        "disqualified_at": None,
        "disqualification_reason": None,
        "security_score": 100,
        "scores": {},
    }

    update_assignment(test_id, candidate_id, update_fields)

    # Reset candidate collection status back to pending, incomplete, and clear score metrics
    try:
        db = load_db()
        for c in db.get("candidates", []):
            if c.get("candidate_id") == candidate_id:
                c["selected"] = 0
                c["completed"] = False
                c["score_final"] = 0
                break
        save_db(db)
    except Exception:
        pass

    audit_log("candidate_test_reset", session.get("admin_username"), {
        "test_id": test_id, "candidate_id": candidate_id
    }, ip=request.remote_addr)

    return jsonify({"success": True, "message": f"Candidate {candidate_id} test attempt reset successfully."})


@test_management_bp.route("/api/admin/tests/<test_id>/reset-all-candidates", methods=["POST"])
@admin_required
def api_reset_all_candidates(test_id):
    test = get_test_by_id_str(test_id)
    if not test:
        return jsonify({"error": "Test not found"}), 404

    assignments = get_assignments_for_test(test_id)
    
    update_fields = {
        "status": "assigned",
        "started_at": None,
        "completed_at": None,
        "time_remaining": None,
        "current_question_index": 0,
        "answers": {},
        "violations": [],
        "violation_count": 0,
        "tab_switch_count": 0,
        "window_blur_count": 0,
        "resize_count": 0,
        "idle_timeout_count": 0,
        "suspicious_keyboard_count": 0,
        "focus_change_count": 0,
        "suspicious_activity_count": 0,
        "is_locked": False,
        "locked_reason": None,
        "disqualified_at": None,
        "disqualification_reason": None,
        "security_score": 100,
        "scores": {},
    }

    for assignment in assignments:
        c_id = str(assignment.get("candidate_id", ""))
        if c_id:
            update_assignment(test_id, c_id, update_fields)

    audit_log("test_reset_all_candidates", session.get("admin_username"), {
        "test_id": test_id, "count": len(assignments)
    }, ip=request.remote_addr)

    return jsonify({"success": True, "message": f"Successfully reset attempts for all {len(assignments)} candidates."})



@test_management_bp.route("/api/admin/tests/<test_id>/shortlist", methods=["POST"])
@admin_required
def api_shortlist_test(test_id):
    test = get_test_by_id_str(test_id)
    if not test:
        return jsonify({"error": "Test not found"}), 404

    data = request.json or {}
    selection_count = data.get("count", test.get("selection_count", 30))

    completed_assignments = get_assignments_for_test_by_status(test_id, "completed")
    completed_assignments.sort(
        key=lambda a: (
            -(a.get("scores", {}).get("score_final", 0)),
            a.get("time_taken", 99999),
        )
    )

    shortlisted = 0
    for i, assignment in enumerate(completed_assignments):
        if i < selection_count and assignment.get("status") != "disqualified":
            update_assignment(test_id, assignment["candidate_id"], {
                "selected": 1,
            })
            shortlisted += 1
        else:
            update_assignment(test_id, assignment["candidate_id"], {
                "selected": 0,
            })

    audit_log("test_shortlist", session.get("admin_username"), {
        "test_id": test_id, "selection_count": selection_count, "shortlisted": shortlisted,
    }, ip=request.remote_addr)

    return jsonify({"success": True, "shortlisted": shortlisted, "total_completed": len(completed_assignments)})


@test_management_bp.route("/api/admin/tests/<test_id>/security-logs", methods=["GET"])
@admin_required
def api_test_security_logs(test_id):
    test = get_test_by_id_str(test_id)
    if not test:
        return jsonify({"error": "Test not found"}), 404

    limit = request.args.get("limit", 200, type=int)
    events = get_security_events_for_test(test_id)

    results = []
    for event in events[:limit]:
        ev = dict(event)
        if "_id" in ev:
            ev["_id"] = str(ev["_id"])
        results.append(ev)

    return jsonify({"events": results, "total": len(events)})


@test_management_bp.route("/api/admin/tests/<test_id>/behavior-logs", methods=["GET"])
@test_management_bp.route("/api/admin/tests/<test_id>/logs", methods=["GET"])
@admin_required
def api_test_behavior_logs(test_id):
    test = get_test_by_id_str(test_id)
    if not test:
        return jsonify({"error": "Test not found"}), 404

    candidate_id = sanitize_input(request.args.get("candidate_id", ""))
    events = get_security_events_for_test(test_id)

    if candidate_id:
        events = [e for e in events if e.get("candidate_id") == candidate_id]

    results = []
    for event in events:
        ev = dict(event)
        if "_id" in ev:
            ev["_id"] = str(ev["_id"])
        
        # Look up candidate details
        candidate = get_candidate_by_id(ev.get("candidate_id", ""))
        candidate_name = candidate.get("name", "Unknown") if candidate else "Unknown"
        
        e_type = ev.get("event_type", "info")
        if e_type in ("tab_switch", "tabswitch", "devtools", "rightclick", "copy", "paste", "violation"):
            l_type = "violation"
        else:
            l_type = "info"
            
        results.append({
            "id": ev["_id"],
            "type": l_type,
            "candidate": candidate_name,
            "event": ev.get("detail") or f"Triggered event: {e_type}",
            "time": ev.get("timestamp", ""),
        })

    return jsonify(results)


@test_management_bp.route("/api/admin/tests/<test_id>/export-results", methods=["POST"])
@admin_required
def api_export_test_results(test_id):
    test = get_test_by_id_str(test_id)
    if not test:
        return jsonify({"error": "Test not found"}), 404

    assignments = get_assignments_for_test(test_id)
    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow([
        "Candidate ID", "Name", "Email", "College", "Department", "Year",
        "Status", "Score Final", "Correct Count", "Total Questions",
        "Time Taken (s)", "Tab Switches", "Violation Count",
        "Started At", "Completed At", "Locked Reason",
    ])

    for a in assignments:
        candidate = get_candidate_by_id(a.get("candidate_id", ""))
        scores = a.get("scores", {})
        writer.writerow([
            a.get("candidate_id", ""),
            candidate.get("name", "") if candidate else "",
            candidate.get("email", "") if candidate else "",
            candidate.get("college", "") if candidate else "",
            candidate.get("department", "") if candidate else "",
            candidate.get("year", "") if candidate else "",
            a.get("status", ""),
            scores.get("score_final", 0),
            scores.get("score_correct", 0),
            scores.get("score_total", 0),
            a.get("time_taken", 0),
            a.get("tab_switch_count", 0),
            a.get("violation_count", 0),
            a.get("started_at", ""),
            a.get("completed_at", ""),
            a.get("locked_reason", ""),
        ])

    audit_log("test_results_exported", session.get("admin_username"), {
        "test_id": test_id, "count": len(assignments),
    }, ip=request.remote_addr)

    test_name = test.get("name", "test").replace(" ", "_")
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment;filename={test_name}_results.csv"},
    )


# ─── QUESTION BANK API ENDPOINTS ───

@test_management_bp.route("/api/admin/questions", methods=["GET"])
@admin_required
def api_get_questions():
    from models.database import _col
    questions = list(_col("question_bank").find())
    results = []
    for q in questions:
        q_data = dict(q)
        if "_id" in q_data:
            q_data["_id"] = str(q_data["_id"])
        results.append(q_data)
    return jsonify(results)


@test_management_bp.route("/api/admin/questions", methods=["POST"])
@admin_required
def api_add_question():
    from models.database import _col
    data = request.json or {}
    
    title = sanitize_input(data.get("title", ""))
    description = sanitize_input(data.get("description", ""))
    category = sanitize_input(data.get("category", "Logic"))
    difficulty_level = sanitize_input(data.get("difficulty_level", "medium"))
    correct_answer = sanitize_input(data.get("correct_answer", ""))
    explanation = sanitize_input(data.get("explanation", ""))
    marks = int(data.get("marks", 10))
    time_limit = int(data.get("time_limit", 60))
    question_type = sanitize_input(data.get("question_type", "mcq"))
    options = data.get("options", [])
    is_active = bool(data.get("is_active", True))

    if not description:
        return jsonify({"error": "Question description/text is required"}), 400

    import uuid
    q_id = data.get("id") or f"q_{str(uuid.uuid4())[:8]}"
    
    question_doc = {
        "id": q_id,
        "title": title or description[:30],
        "description": description,
        "text": description,
        "category": category,
        "difficulty_level": difficulty_level,
        "correct_answer": correct_answer,
        "correct": correct_answer,
        "explanation": explanation,
        "marks": marks,
        "xp_points": marks,
        "time_limit": time_limit,
        "question_type": question_type,
        "type": question_type,
        "options": options,
        "is_active": is_active,
        "created_at": datetime.now().isoformat()
    }

    _col("question_bank").replace_one({"id": q_id}, question_doc, upsert=True)
    audit_log("question_created", session.get("admin_username"), {"question_id": q_id}, ip=request.remote_addr)
    return jsonify({"success": True, "question": question_doc})


@test_management_bp.route("/api/admin/questions/<q_id>", methods=["PUT", "PATCH"])
@admin_required
def api_edit_question(q_id):
    from models.database import _col
    question = _col("question_bank").find_one({"id": q_id})
    if not question:
        return jsonify({"error": "Question not found"}), 404

    data = request.json or {}
    
    update_doc = dict(question)
    if "title" in data: update_doc["title"] = sanitize_input(data["title"])
    if "description" in data:
        update_doc["description"] = sanitize_input(data["description"])
        update_doc["text"] = sanitize_input(data["description"])
    if "category" in data: update_doc["category"] = sanitize_input(data["category"])
    if "difficulty_level" in data: update_doc["difficulty_level"] = sanitize_input(data["difficulty_level"])
    if "correct_answer" in data:
        update_doc["correct_answer"] = sanitize_input(data["correct_answer"])
        update_doc["correct"] = sanitize_input(data["correct_answer"])
    if "explanation" in data: update_doc["explanation"] = sanitize_input(data["explanation"])
    if "marks" in data:
        update_doc["marks"] = int(data["marks"])
        update_doc["xp_points"] = int(data["marks"])
    if "time_limit" in data: update_doc["time_limit"] = int(data["time_limit"])
    if "question_type" in data:
        update_doc["question_type"] = sanitize_input(data["question_type"])
        update_doc["type"] = sanitize_input(data["question_type"])
    if "options" in data: update_doc["options"] = data["options"]
    if "is_active" in data: update_doc["is_active"] = bool(data["is_active"])

    _col("question_bank").replace_one({"id": q_id}, update_doc)
    audit_log("question_updated", session.get("admin_username"), {"question_id": q_id}, ip=request.remote_addr)
    return jsonify({"success": True, "question": update_doc})


@test_management_bp.route("/api/admin/questions/<q_id>", methods=["DELETE"])
@admin_required
def api_delete_question(q_id):
    from models.database import _col
    res = _col("question_bank").delete_one({"id": q_id})
    if res.deleted_count == 0:
        return jsonify({"error": "Question not found"}), 404
        
    audit_log("question_deleted", session.get("admin_username"), {"question_id": q_id}, ip=request.remote_addr)
    return jsonify({"success": True})
