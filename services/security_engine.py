"""
Enterprise-Grade Security & Violation Management Engine
AI NEXT GEN 2026 Workshop Selection Platform

Violation Hierarchy:
  CRITICAL  → Immediate disqualification
  MAJOR     → Limited attempts before disqualification
  SUSPICIOUS → Logged, not disqualifying
  POLICY    → Policy violations, logged
"""

from datetime import datetime
from models.database import (
    update_assignment, log_security_event, get_assignment,
    get_test_by_id_str, _col,
)

# ─── VIOLATION REGISTRY ─────────────────────────────────────────────────────

CRITICAL_VIOLATIONS = {
    "fullscreen_exit",
    "copy_attempt",
    "paste_attempt",
    "right_click",
    "devtools_opened",
    "refresh_attempt",
    "multiple_tabs",
    "window_closed",
    "multiple_login_sessions",
    "multiple_device_login",
    "script_manipulation",
    "storage_manipulation",
    "unauthorized_api_request",
    "unauthorized_route_access",
    "console_manipulation",
    "session_hijack_attempt",
    "network_manipulation",
    "security_bypass_attempt",
    "test_data_manipulation",
}

MAJOR_VIOLATIONS = {
    "tab_switch",
    "window_blur",
    "browser_resize",
    "internet_disconnect",
    "idle_timeout",
    "focus_change",
    "suspicious_keyboard",
}

SUSPICIOUS_ACTIVITIES = {
    "fast_answer",
    "slow_answer",
    "suspicious_typing",
    "no_mouse_movement",
    "random_clicking",
    "excessive_backspace",
    "suspicious_navigation",
    "excessive_focus_change",
    "unrealistic_completion_time",
    "excessive_keyboard",
    "frequent_browser_events",
    "suspicious_behaviour",
}

POLICY_VIOLATIONS = {
    "multiple_attempts",
    "attempt_after_completion",
    "attempt_after_disqualification",
    "attempt_outside_window",
    "locked_question_access",
    "future_question_access",
    "security_verification_skip",
    "unauthenticated_attempt",
}

# ─── LIMITS ─────────────────────────────────────────────────────────────────

TAB_SWITCH_LIMIT = 3
WINDOW_BLUR_LIMIT = 3
BROWSER_RESIZE_LIMIT = 2
FOCUS_CHANGE_LIMIT = 3
SUSPICIOUS_KEYBOARD_LIMIT = 3
IDLE_TIMEOUT_SECONDS = 60
DISCONNECT_GRACE_SECONDS = 30

# ─── SECURITY SCORE WEIGHTS ─────────────────────────────────────────────────

VIOLATION_SCORE_PENALTIES = {
    # Critical — maximum penalty
    "fullscreen_exit": 100,
    "copy_attempt": 100,
    "paste_attempt": 100,
    "right_click": 50,
    "devtools_opened": 100,
    "refresh_attempt": 100,
    "multiple_tabs": 100,
    "window_closed": 100,
    "multiple_login_sessions": 100,
    "multiple_device_login": 100,
    "script_manipulation": 100,
    "storage_manipulation": 100,
    "unauthorized_api_request": 100,
    "session_hijack_attempt": 100,
    "network_manipulation": 100,
    "security_bypass_attempt": 100,
    "test_data_manipulation": 100,
    # Major
    "tab_switch": 15,
    "window_blur": 10,
    "browser_resize": 8,
    "idle_timeout": 20,
    "focus_change": 5,
    "suspicious_keyboard": 5,
    # Suspicious
    "fast_answer": 3,
    "slow_answer": 2,
    "suspicious_typing": 5,
    "no_mouse_movement": 3,
    "random_clicking": 4,
    "excessive_backspace": 2,
    "suspicious_navigation": 5,
    "excessive_keyboard": 3,
    "frequent_browser_events": 3,
}


def get_violation_level(event_type):
    if event_type in CRITICAL_VIOLATIONS:
        return "CRITICAL"
    if event_type in MAJOR_VIOLATIONS:
        return "MAJOR"
    if event_type in SUSPICIOUS_ACTIVITIES:
        return "SUSPICIOUS"
    if event_type in POLICY_VIOLATIONS:
        return "POLICY"
    return "UNKNOWN"


def compute_security_score(assignment):
    """Compute 0–100 security score based on violation history."""
    if assignment.get("status") == "disqualified":
        return 0

    violations = assignment.get("violations", [])
    total_penalty = 0
    for v in violations:
        vtype = v.get("type", "")
        penalty = VIOLATION_SCORE_PENALTIES.get(vtype, 5)
        total_penalty += penalty

    score = max(0, 100 - total_penalty)
    return round(score, 1)


# ─── CORE SECURITY EVENT PROCESSOR ─────────────────────────────────────────

def process_security_event(assignment, test, event_type,
                           ip_address=None, user_agent=None, detail=None,
                           question_number=None, time_remaining=None, session_id=None):
    """
    Process every security event. Validates, logs, updates assignment.
    Never trusts the frontend — all enforcement is server-side.
    Returns action dict for frontend to act on.
    """
    if not assignment or not test:
        return {"action": "none"}

    test_id = assignment["test_id"]
    candidate_id = assignment["candidate_id"]
    security_rules = test.get("security_rules", {})
    level = get_violation_level(event_type)

    # Enrich event record with full context
    event_record = _build_event_record(
        assignment=assignment,
        test=test,
        event_type=event_type,
        level=level,
        ip_address=ip_address,
        user_agent=user_agent,
        detail=detail,
        question_number=question_number,
        time_remaining=time_remaining,
        session_id=session_id,
    )

    # Always persist to MongoDB Atlas — no event is ever lost
    log_security_event(event_record)

    # Route to appropriate handler
    if level == "CRITICAL":
        return _handle_critical(test_id, candidate_id, assignment, event_type, event_record, security_rules)
    elif level == "MAJOR":
        return _handle_major(test_id, candidate_id, assignment, event_type, event_record, security_rules)
    elif level == "SUSPICIOUS":
        return _handle_suspicious(test_id, candidate_id, assignment, event_type, event_record)
    elif level == "POLICY":
        return _handle_policy(test_id, candidate_id, assignment, event_type, event_record)

    # Fallback: log and warn
    _append_violation(test_id, candidate_id, assignment, event_type, detail)
    return {"action": "logged", "level": "UNKNOWN", "event": event_type}


# ─── HANDLERS ───────────────────────────────────────────────────────────────

def _handle_critical(test_id, candidate_id, assignment, event_type, event_record, security_rules):
    """Immediately terminate the test and disqualify the candidate."""
    new_violation_count = assignment.get("violation_count", 0) + 1
    violations = assignment.get("violations", []) + [{
        "type": event_type,
        "level": "CRITICAL",
        "timestamp": datetime.now().isoformat(),
        "detail": event_record.get("detail", ""),
    }]

    security_score = max(0, 100 - VIOLATION_SCORE_PENALTIES.get(event_type, 100))

    update_fields = {
        "status": "disqualified",
        "is_locked": True,
        "locked_reason": f"CRITICAL violation: {event_type}",
        "completed_at": datetime.now().isoformat(),
        "violation_count": new_violation_count,
        "violations": violations,
        "security_score": security_score,
        "scores": {"score_final": 0.0, "final": 0.0},
        "selected": 3,
        "disqualified_at": datetime.now().isoformat(),
        "disqualification_reason": event_type,
    }

    update_assignment(test_id, candidate_id, update_fields)
    _notify_admin_realtime(test_id, candidate_id, event_type, "CRITICAL", event_record)

    return {
        "action": "auto_submit_disqualify",
        "level": "CRITICAL",
        "reason": event_type,
        "message": f"Test terminated: {_violation_message(event_type)}",
    }


def _handle_major(test_id, candidate_id, assignment, event_type, event_record, security_rules):
    """Handle major violations with configurable limits."""
    new_violation_count = assignment.get("violation_count", 0) + 1

    # Internet disconnect — special grace period handling
    if event_type == "internet_disconnect":
        _append_violation(test_id, candidate_id, assignment, event_type, event_record.get("detail"))
        return {"action": "pause_timer", "pause_seconds": DISCONNECT_GRACE_SECONDS}

    if event_type == "internet_reconnect":
        return {"action": "resume_timer"}

    # Tab switch — limited attempts
    if event_type == "tab_switch":
        new_tab_count = assignment.get("tab_switch_count", 0) + 1
        tab_limit = security_rules.get("tab_switch_limit", TAB_SWITCH_LIMIT)
        _append_violation(test_id, candidate_id, assignment, event_type,
                          event_record.get("detail") or f"Tab switch #{new_tab_count}")
        update_assignment(test_id, candidate_id, {
            "tab_switch_count": new_tab_count,
            "violation_count": new_violation_count,
        })

        if new_tab_count >= tab_limit:
            return _disqualify_major(test_id, candidate_id, assignment, event_type,
                                     f"Tab switch limit exceeded ({tab_limit})")

        remaining = tab_limit - new_tab_count
        _notify_admin_realtime(test_id, candidate_id, event_type, "MAJOR", event_record)
        return {
            "action": "warn",
            "level": "MAJOR",
            "tab_count": new_tab_count,
            "limit": tab_limit,
            "remaining": remaining,
            "message": f"Warning: {remaining} tab switch(es) remaining before disqualification.",
        }

    # Window blur
    if event_type == "window_blur":
        new_blur_count = assignment.get("window_blur_count", 0) + 1
        blur_limit = security_rules.get("window_blur_limit", WINDOW_BLUR_LIMIT)
        _append_violation(test_id, candidate_id, assignment, event_type,
                          event_record.get("detail") or f"Window blur #{new_blur_count}")
        update_assignment(test_id, candidate_id, {
            "window_blur_count": new_blur_count,
            "violation_count": new_violation_count,
        })

        if new_blur_count >= blur_limit:
            return _disqualify_major(test_id, candidate_id, assignment, event_type,
                                     f"Window left limit exceeded ({blur_limit})")

        remaining = blur_limit - new_blur_count
        _notify_admin_realtime(test_id, candidate_id, event_type, "MAJOR", event_record)
        return {
            "action": "warn",
            "level": "MAJOR",
            "blur_count": new_blur_count,
            "limit": blur_limit,
            "remaining": remaining,
            "message": f"Warning: {remaining} window leave(s) remaining before disqualification.",
        }

    # Browser resize
    if event_type == "browser_resize":
        new_resize_count = assignment.get("resize_count", 0) + 1
        resize_limit = security_rules.get("browser_resize_limit", BROWSER_RESIZE_LIMIT)
        _append_violation(test_id, candidate_id, assignment, event_type,
                          event_record.get("detail") or f"Resize #{new_resize_count}")
        update_assignment(test_id, candidate_id, {
            "resize_count": new_resize_count,
            "violation_count": new_violation_count,
        })

        if new_resize_count >= resize_limit:
            return _disqualify_major(test_id, candidate_id, assignment, event_type,
                                     f"Browser resize limit exceeded ({resize_limit})")

        _notify_admin_realtime(test_id, candidate_id, event_type, "MAJOR", event_record)
        return {
            "action": "warn",
            "level": "MAJOR",
            "resize_count": new_resize_count,
            "limit": resize_limit,
            "message": f"Warning: excessive browser resizing detected.",
        }

    # Idle timeout — auto advance question
    if event_type == "idle_timeout":
        _append_violation(test_id, candidate_id, assignment, event_type, "Idle timeout exceeded")
        update_assignment(test_id, candidate_id, {"violation_count": new_violation_count})
        return {"action": "advance_question", "level": "MAJOR", "message": "Idle timeout: moving to next question."}

    # Focus change / suspicious keyboard
    if event_type in ("focus_change", "suspicious_keyboard"):
        count_key = "focus_change_count" if event_type == "focus_change" else "suspicious_keyboard_count"
        limit = FOCUS_CHANGE_LIMIT if event_type == "focus_change" else SUSPICIOUS_KEYBOARD_LIMIT
        new_count = assignment.get(count_key, 0) + 1
        _append_violation(test_id, candidate_id, assignment, event_type, event_record.get("detail"))
        update_assignment(test_id, candidate_id, {
            count_key: new_count,
            "violation_count": new_violation_count,
        })

        if new_count >= limit:
            return _disqualify_major(test_id, candidate_id, assignment, event_type,
                                     f"{event_type} limit exceeded ({limit})")
        return {"action": "warn", "level": "MAJOR", "count": new_count, "limit": limit}

    # Generic major
    _append_violation(test_id, candidate_id, assignment, event_type, event_record.get("detail"))
    update_assignment(test_id, candidate_id, {"violation_count": new_violation_count})
    _notify_admin_realtime(test_id, candidate_id, event_type, "MAJOR", event_record)
    return {"action": "warn", "level": "MAJOR", "event": event_type}


def _handle_suspicious(test_id, candidate_id, assignment, event_type, event_record):
    """Log suspicious activity — does NOT terminate test."""
    _append_violation(test_id, candidate_id, assignment, event_type, event_record.get("detail"), level="SUSPICIOUS")
    new_count = assignment.get("suspicious_activity_count", 0) + 1
    update_assignment(test_id, candidate_id, {
        "suspicious_activity_count": new_count,
        "violation_count": assignment.get("violation_count", 0) + 1,
    })
    return {"action": "logged", "level": "SUSPICIOUS", "event": event_type}


def _handle_policy(test_id, candidate_id, assignment, event_type, event_record):
    """Log policy violation."""
    _append_violation(test_id, candidate_id, assignment, event_type, event_record.get("detail"), level="POLICY")
    update_assignment(test_id, candidate_id, {
        "violation_count": assignment.get("violation_count", 0) + 1,
    })
    return {"action": "logged", "level": "POLICY", "event": event_type}


def _disqualify_major(test_id, candidate_id, assignment, event_type, reason):
    """Disqualify after major violation limit exceeded."""
    new_violation_count = assignment.get("violation_count", 0) + 1
    violations = assignment.get("violations", []) + [{
        "type": event_type,
        "level": "MAJOR_LIMIT_EXCEEDED",
        "timestamp": datetime.now().isoformat(),
        "detail": reason,
    }]
    update_assignment(test_id, candidate_id, {
        "status": "disqualified",
        "is_locked": True,
        "locked_reason": reason,
        "completed_at": datetime.now().isoformat(),
        "violation_count": new_violation_count,
        "violations": violations,
        "security_score": 0,
        "scores": {"score_final": 0.0, "final": 0.0},
        "selected": 3,
        "disqualified_at": datetime.now().isoformat(),
        "disqualification_reason": event_type,
    })
    return {
        "action": "auto_submit_disqualify",
        "level": "MAJOR",
        "reason": reason,
        "message": reason,
    }


# ─── HELPERS ─────────────────────────────────────────────────────────────────

def _build_event_record(assignment, test, event_type, level,
                         ip_address, user_agent, detail,
                         question_number, time_remaining, session_id):
    """Build complete, enriched event record for MongoDB storage."""
    candidate_id = assignment.get("candidate_id", "")
    test_id = assignment.get("test_id", "")

    # Enrich with candidate data
    candidate_name = ""
    candidate_email = ""
    college_name = ""
    try:
        cand = _col("candidates").find_one({"candidate_id": candidate_id})
        if cand:
            candidate_name = cand.get("name", "")
            candidate_email = cand.get("email", "")
            college_name = cand.get("college", "")
    except Exception:
        pass

    # Parse browser/device info from user agent
    browser_info = _parse_user_agent(user_agent or "")

    return {
        # Identity
        "candidate_id": candidate_id,
        "candidate_name": candidate_name,
        "candidate_email": candidate_email,
        "college": college_name,
        "test_id": test_id,
        "test_name": test.get("name", ""),
        "session_id": session_id or str(assignment.get("_id", "")),
        "test_assignment_id": str(assignment.get("_id", "")),
        # Event
        "event_type": event_type,
        "violation_type": event_type,
        "violation_level": level,
        "detail": detail or "",
        # Context
        "question_number": question_number or (assignment.get("current_question_index", 0) + 1),
        "time_remaining": time_remaining or max(0,
            test.get("duration_minutes", 15) * 60 - (assignment.get("time_taken", 0) or 0)),
        "test_status": assignment.get("status", ""),
        # Device
        "ip_address": ip_address or "unknown",
        "user_agent": user_agent or "",
        "browser": browser_info.get("browser", ""),
        "browser_version": browser_info.get("version", ""),
        "os": browser_info.get("os", ""),
        "device_type": browser_info.get("device", "desktop"),
        "device_info": browser_info,
        # Meta
        "timestamp": datetime.now().isoformat(),
        "processed": True,
        "action_taken": "",
        "processed_at": datetime.now().isoformat(),
    }


def _parse_user_agent(ua):
    """Lightweight UA parser."""
    result = {"browser": "Unknown", "version": "", "os": "Unknown", "device": "desktop"}
    if not ua:
        return result

    ua_lower = ua.lower()

    # Browser
    if "chrome" in ua_lower and "edg" not in ua_lower:
        result["browser"] = "Chrome"
    elif "firefox" in ua_lower:
        result["browser"] = "Firefox"
    elif "safari" in ua_lower and "chrome" not in ua_lower:
        result["browser"] = "Safari"
    elif "edg" in ua_lower:
        result["browser"] = "Edge"
    elif "opera" in ua_lower or "opr" in ua_lower:
        result["browser"] = "Opera"

    # OS
    if "windows" in ua_lower:
        result["os"] = "Windows"
    elif "mac os" in ua_lower or "macos" in ua_lower:
        result["os"] = "macOS"
    elif "linux" in ua_lower:
        result["os"] = "Linux"
    elif "android" in ua_lower:
        result["os"] = "Android"
        result["device"] = "mobile"
    elif "iphone" in ua_lower or "ipad" in ua_lower:
        result["os"] = "iOS"
        result["device"] = "mobile"

    return result


def _append_violation(test_id, candidate_id, assignment, event_type, detail=None, level=None):
    """Append a violation record to the assignment's violation list."""
    if level is None:
        level = get_violation_level(event_type)
    violations = list(assignment.get("violations", []))
    violations.append({
        "type": event_type,
        "level": level,
        "timestamp": datetime.now().isoformat(),
        "detail": detail or event_type,
    })
    security_score = compute_security_score({**assignment, "violations": violations})
    update_assignment(test_id, candidate_id, {
        "violations": violations,
        "security_score": security_score,
    })


def _notify_admin_realtime(test_id, candidate_id, event_type, level, event_record):
    """Store a real-time admin notification in the activity_logs collection."""
    try:
        from models.database import audit_log
        audit_log(
            action=f"security_{level.lower()}_{event_type}",
            user=candidate_id,
            details={
                "test_id": test_id,
                "candidate_id": candidate_id,
                "candidate_name": event_record.get("candidate_name", ""),
                "event": event_type,
                "level": level,
                "detail": event_record.get("detail", ""),
                "question_number": event_record.get("question_number"),
            },
            ip=event_record.get("ip_address"),
        )
    except Exception:
        pass


def _violation_message(event_type):
    messages = {
        "fullscreen_exit": "Exiting fullscreen mode is not allowed.",
        "copy_attempt": "Copying content is strictly prohibited.",
        "paste_attempt": "Pasting content is strictly prohibited.",
        "right_click": "Right-clicking is not allowed during the test.",
        "devtools_opened": "Opening developer tools is not allowed.",
        "refresh_attempt": "Refreshing the page is not allowed.",
        "multiple_tabs": "Multiple browser tabs detected.",
        "window_closed": "Test window was closed.",
        "multiple_login_sessions": "Multiple active sessions detected.",
        "script_manipulation": "JavaScript manipulation detected.",
        "storage_manipulation": "Browser storage tampering detected.",
    }
    return messages.get(event_type, f"Security violation: {event_type}")


# ─── SECURITY ANALYTICS ──────────────────────────────────────────────────────

def get_security_analytics_for_assignment(assignment):
    """Return comprehensive security analytics for a given assignment."""
    violations = assignment.get("violations", [])

    by_type = {}
    by_level = {"CRITICAL": 0, "MAJOR": 0, "SUSPICIOUS": 0, "POLICY": 0}

    for v in violations:
        vtype = v.get("type", "unknown")
        level = v.get("level", get_violation_level(vtype))
        by_type[vtype] = by_type.get(vtype, 0) + 1
        if level in by_level:
            by_level[level] += 1

    security_score = compute_security_score(assignment)

    # Build detailed analytics
    analytics = {
        "security_score": security_score,
        "total_violations": len(violations),
        "by_level": by_level,
        "by_type": by_type,
        # Specific counters for dashboard display
        "fullscreen_violations": by_type.get("fullscreen_exit", 0),
        "tab_switch_count": assignment.get("tab_switch_count", 0),
        "copy_attempts": by_type.get("copy_attempt", 0),
        "paste_attempts": by_type.get("paste_attempt", 0),
        "right_click_attempts": by_type.get("right_click", 0),
        "refresh_attempts": by_type.get("refresh_attempt", 0),
        "devtools_attempts": by_type.get("devtools_opened", 0),
        "multiple_login_attempts": by_type.get("multiple_login_sessions", 0),
        "multiple_device_attempts": by_type.get("multiple_device_login", 0),
        "browser_manipulation_attempts": (
            by_type.get("script_manipulation", 0) +
            by_type.get("storage_manipulation", 0) +
            by_type.get("console_manipulation", 0)
        ),
        "api_manipulation_attempts": (
            by_type.get("unauthorized_api_request", 0) +
            by_type.get("network_manipulation", 0)
        ),
        "idle_violations": by_type.get("idle_timeout", 0),
        "disconnect_events": by_type.get("internet_disconnect", 0),
        "window_blur_count": assignment.get("window_blur_count", 0),
        "resize_count": assignment.get("resize_count", 0),
        "suspicious_activities": assignment.get("suspicious_activity_count", 0),
        "is_disqualified": assignment.get("status") == "disqualified",
        "disqualification_reason": assignment.get("disqualification_reason", ""),
        "disqualified_at": assignment.get("disqualified_at", ""),
        "violation_timeline": [
            {
                "type": v.get("type"),
                "level": v.get("level", get_violation_level(v.get("type", ""))),
                "timestamp": v.get("timestamp"),
                "detail": v.get("detail", ""),
            }
            for v in violations
        ],
    }

    return analytics


# ─── TEST WINDOW ─────────────────────────────────────────────────────────────

def is_test_window_active(test):
    """
    Check if the test window is currently open for students.
    Controlled by admin via the test_open global setting.
    """
    status = test.get("status", "draft")
    if status not in ("published",):
        return False
    from models.database import get_setting
    test_open = get_setting("test_open", False)
    return bool(test_open)


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
        reason = assignment.get("disqualification_reason", assignment.get("locked_reason", "disqualified"))
        return False, f"Disqualified: {_violation_message(reason)}"
    if status == "locked":
        return False, "Test session locked"

    test = get_test_by_id_str(test_id)
    if not test:
        return False, "Test not found"

    from models.database import get_setting
    from datetime import datetime

    # Check global test availability settings
    test_availability = get_setting("test_availability", "open")
    test_open = get_setting("test_open", False)
    if test_availability != "open" or not test_open:
        return False, "Test is not currently open. Please wait for admin to open the test."

    test_status = get_setting("test_status", "published")
    if test_status != "published":
        return False, "Test is not in active/published state."

    # Validate test window dates
    now = datetime.now()
    start_str = get_setting("test_start_date")
    end_str = get_setting("test_end_date")

    if start_str:
        try:
            start_dt = datetime.fromisoformat(start_str)
            if now < start_dt:
                return False, f"Test window opens at {start_dt.strftime('%Y-%m-%d %H:%M:%S')}"
        except Exception:
            pass

    if end_str:
        try:
            end_dt = datetime.fromisoformat(end_str)
            if now > end_dt:
                return False, "Test window has closed."
        except Exception:
            pass

    return True, "OK"
