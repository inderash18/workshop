from datetime import datetime
from models.database import (
    update_assignment, log_security_event, get_assignment, get_test_by_id_str,
)


IMMEDIATE_SUBMIT_EVENTS = [
    "fullscreen_exit",
    "copy_attempt",
    "paste_attempt",
    "right_click",
    "refresh_attempt",
    "devtools_opened",
    "multiple_tabs",
    "window_closed",
]

TAB_SWITCH_LIMIT = 3


def process_security_event(assignment, test, event_type, ip_address=None, user_agent=None, detail=None):
    if not assignment or not test:
        return {"action": "none"}

    test_id = assignment["test_id"]
    candidate_id = assignment["candidate_id"]
    security_rules = test.get("security_rules", {})

    event_record = {
        "test_id": test_id,
        "test_assignment_id": str(assignment.get("_id", "")),
        "candidate_id": candidate_id,
        "event_type": event_type,
        "violation_type": event_type,
        "ip_address": ip_address or "unknown",
        "user_agent": user_agent or "",
        "detail": detail or "",
        "timestamp": datetime.now().isoformat(),
        "question_number": assignment.get("current_question_index", 0) + 1,
        "time_remaining": test.get("duration_minutes", 60) * 60 - (assignment.get("time_taken", 0) or 0),
        "candidate_ip_address": ip_address or "unknown",
        "device_info": {"os": "unknown", "device": "unknown", "browser": (user_agent or "").split('/')[0] if user_agent else "unknown"},
        "processed": False,
        "action_taken": "",
        "reason": "",
        "processed_at": None,
    }

    log_security_event(event_record)

    new_violation_count = assignment.get("violation_count", 0) + 1
    new_tab_switch_count = assignment.get("tab_switch_count", 0)

    update_fields = {}

    if event_type == "tab_switch":
        new_tab_switch_count += 1
        tab_limit = security_rules.get("tab_switch_limit", TAB_SWITCH_LIMIT)
        update_fields["tab_switch_count"] = new_tab_switch_count

        if new_tab_switch_count > tab_limit:
            _terminate_assignment(test_id, candidate_id, assignment, {
                "violation_count": new_violation_count,
                "status": "disqualified",
                "is_locked": True,
                "locked_reason": f"Tab switch limit exceeded ({tab_limit})",
                "completed_at": datetime.now().isoformat(),
                "violations": [],
                "scores": {"score_final": 0.0},
                "selected": 3,
            }, "tab_switch_limit_exceeded", new_violation_count, [])
            return {"action": "auto_submit_disqualify", "reason": "tab_switch_limit_exceeded"}

        update_fields["violation_count"] = new_violation_count
        update_fields["violations"] = assignment.get("violations", []) + [{
            "type": event_type,
            "timestamp": datetime.now().isoformat(),
            "detail": detail or f"Tab switch #{new_tab_switch_count}",
        }]
        update_assignment(test_id, candidate_id, update_fields)
        return {"action": "warn", "tab_count": new_tab_switch_count, "limit": tab_limit}

    if event_type in IMMEDIATE_SUBMIT_EVENTS:
        if event_type == "fullscreen_exit" and not security_rules.get("fullscreen_mandatory", True):
            return {"action": "none"}

        if event_type in ("copy_attempt",) and not security_rules.get("copy_detection", True):
            return {"action": "none"}
        if event_type in ("paste_attempt",) and not security_rules.get("paste_detection", True):
            return {"action": "none"}
        if event_type in ("right_click",) and not security_rules.get("right_click_detection", True):
            return {"action": "none"}
        if event_type in ("refresh_attempt",) and not security_rules.get("refresh_detection", True):
            return {"action": "none"}

        new_violation_count += 1
        _terminate_assignment(test_id, candidate_id, assignment, {
            "violation_count": new_violation_count,
            "status": "disqualified",
            "is_locked": True,
            "locked_reason": f"Security violation: {event_type}",
            "completed_at": datetime.now().isoformat(),
            "violations": [],
            "scores": {"score_final": 0.0},
            "selected": 3,
        }, event_type, new_violation_count, [])
        return {"action": "auto_submit_disqualify", "reason": event_type}

    if event_type == "screen_resize":
        resize_action = security_rules.get("screen_resize_action", "warning")
        new_violation_count += 1
        update_fields["violation_count"] = new_violation_count
        update_fields["violations"] = assignment.get("violations", []) + [{
            "type": event_type,
            "timestamp": datetime.now().isoformat(),
            "detail": detail or "Screen resize detected",
        }]

        if resize_action == "auto_submit":
            _terminate_assignment(test_id, candidate_id, assignment, {
                "violation_count": new_violation_count,
                "status": "disqualified",
                "is_locked": True,
                "locked_reason": "Screen resize (auto-submit configured)",
                "completed_at": datetime.now().isoformat(),
                "violations": [],
                "scores": {"score_final": 0.0},
                "selected": 3,
            }, "screen_resize_auto_submit", new_violation_count, [])
            return {"action": "auto_submit_disqualify", "reason": "screen_resize_auto_submit"}

        update_assignment(test_id, candidate_id, update_fields)
        return {"action": "warn", "detail": "Screen resize detected"}

    if event_type == "idle_timeout":
        new_violation_count += 1
        _terminate_assignment(test_id, candidate_id, assignment, {
            "violation_count": new_violation_count,
            "status": "disqualified",
            "is_locked": True,
            "locked_reason": "Idle timeout exceeded",
            "completed_at": datetime.now().isoformat(),
            "violations": [],
            "scores": {"score_final": 0.0},
            "selected": 3,
        }, "idle_timeout", new_violation_count, [])
        return {"action": "auto_submit_disqualify", "reason": "idle_timeout"}

    if event_type == "timer_expired":
        update_fields["status"] = "completed"
        update_fields["completed_at"] = datetime.now().isoformat()
        update_fields["violations"] = assignment.get("violations", []) + [{
            "type": event_type,
            "timestamp": datetime.now().isoformat(),
            "detail": detail or "Timer expired",
        }]
        update_assignment(test_id, candidate_id, update_fields)
        return {"action": "auto_submit", "reason": "timer_expired"}

    if event_type == "internet_disconnect":
        return {"action": "pause_timer", "pause_seconds": 30}

    if event_type == "internet_reconnect":
        return {"action": "resume_timer"}

    update_fields["violation_count"] = new_violation_count
    update_fields["violations"] = assignment.get("violations", []) + [{
        "type": event_type,
        "timestamp": datetime.now().isoformat(),
        "detail": detail or event_type,
    }]
    update_assignment(test_id, candidate_id, update_fields)
    return {"action": "logged"}


def _terminate_assignment(test_id, candidate_id, old_assignment, update_fields, action_taken, violation_count, violations):
    from models.database import update_assignment, audit_log, request, log_security_event
    
    update_assignment(test_id, candidate_id, update_fields)
    
    if request and hasattr(request, 'remote_addr'):
        audit_log("security_violation_termination", "system", {
            "test_id": test_id,
            "candidate_id": candidate_id,
            "action_taken": action_taken,
            "violation_count": violation_count,
            "reason": update_fields.get("locked_reason", ""),
        }, ip=request.remote_addr)
    
    if old_assignment:
        from datetime import datetime
        event_record = {
            "test_id": test_id,
            "assignment_id": old_assignment.get("_id", ""),
            "candidate_id": candidate_id,
            "event_type": "termination",
            "violation_type": action_taken,
            "timestamp": datetime.now().isoformat(),
            "question_number": old_assignment.get("current_question_index", 0) + 1,
            "browser_details": {"name": "", "version": ""},
            "session_details": {"session_id": "", "ip": ""},
            "time_remaining": 0,
            "candidate_ip_address": request.remote_addr if request and hasattr(request, 'remote_addr') else "",
            "device_info": {"os": "", "device": "", "browser": ""},
            "processed": True,
            "action_taken": action_taken,
            "reason": update_fields.get("locked_reason", ""),
            "processed_at": datetime.now().isoformat(),
        }
        try:
            log_security_event(event_record)
        except Exception as e:
            print(f"[SecurityEngine] Failed to log termination event: {e}")


def is_test_window_active(test):
    now = datetime.now()
    status = test.get("status", "draft")
    if status not in ("published",):
        return False

    test_date = test.get("date", "")
    start_time = test.get("start_time", "00:00")
    end_time = test.get("end_time", "23:59")

    try:
        test_datetime_str = f"{test_date} {start_time}"
        test_start = datetime.strptime(test_datetime_str, "%Y-%m-%d %H:%M")

        end_datetime_str = f"{test_date} {end_time}"
        test_end = datetime.strptime(end_datetime_str, "%Y-%m-%d %H:%M")

        if test_end <= test_start:
            from datetime import timedelta
            test_end = test_start + timedelta(hours=2)

        return test_start <= now <= test_end
    except (ValueError, TypeError):
        return False


def can_student_access_test(candidate_id, test_id):
    assignment = get_assignment(test_id, candidate_id)
    if not assignment:
        return False, "Not assigned to this test"

    if assignment.get("is_locked"):
        return False, "Test is locked"

    status = assignment.get("status", "assigned")
    if status == "completed":
        return False, "Test already completed"
    if status == "disqualified":
        return False, "Disqualified from this test"
    if status == "locked":
        return False, "Test session locked"

    test = get_test_by_id_str(test_id)
    if not test:
        return False, "Test not found"

    if test.get("status") == "locked":
        return False, "Test has been locked by admin"
    if test.get("status") == "completed":
        return False, "Test has ended"

    if not is_test_window_active(test):
        return False, "Test is not currently active"

    return True, "OK"
