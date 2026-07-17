import json
from datetime import datetime
from models.database import get_candidate_by_id
from services.achievement_engine import get_badge_details


def generate_report_data(candidate_id, test_id=None):
    candidate = get_candidate_by_id(candidate_id)
    if not candidate:
        return None

    answers = {}
    raw_answers = candidate.get("answers", {})
    if isinstance(raw_answers, str):
        try:
            answers = json.loads(raw_answers)
        except Exception:
            answers = {}
    elif isinstance(raw_answers, dict):
        answers = raw_answers

    badges_raw = candidate.get("badges", [])
    if isinstance(badges_raw, str):
        try:
            badges_raw = json.loads(badges_raw)
        except Exception:
            badges_raw = []
    badge_details = get_badge_details(badges_raw)

    score_fields = [
        "score_logic", "score_creativity", "score_ai_knowledge",
        "score_problem_solving", "score_research", "score_ai_potential",
        "score_workshop_compat", "score_selection_prob", "score_final",
    ]
    for field in score_fields:
        candidate.setdefault(field, 0.0)
    candidate.setdefault("tab_switches", 0)
    candidate.setdefault("violation_count", 0)
    candidate.setdefault("typing_speed_avg", 0)
    candidate.setdefault("time_taken", 0)
    candidate.setdefault("selected", 0)
    candidate.setdefault("name", "Unknown")
    candidate.setdefault("email", "")
    candidate.setdefault("phone", "")
    candidate.setdefault("college", "")
    candidate.setdefault("department", "")
    candidate.setdefault("year", 0)
    candidate.setdefault("candidate_id", candidate_id)
    candidate.setdefault("completed_at", None)
    candidate.setdefault("linkedin", "")
    candidate.setdefault("github", "")

    level_results = []
    from services.challenge_engine import LEVELS
    for level in LEVELS:
        lid = level["id"]
        level_answers = answers.get(str(lid), {})
        questions_detail = []
        for q in level["questions"]:
            user_answer = str(level_answers.get(q["id"], "")).strip()
            correct = None
            is_correct = None
            if q["type"] in ("mcq", "text"):
                correct = str(q.get("correct", ""))
                is_correct = user_answer.lower() == correct.lower()
            questions_detail.append({
                "text": q["text"],
                "type": q["type"],
                "user_answer": user_answer or "(no answer)",
                "correct_answer": correct,
                "is_correct": is_correct,
            })
        answered = sum(1 for qd in questions_detail if qd["user_answer"] != "(no answer)")
        level_results.append({
            "id": lid,
            "name": level["name"],
            "icon": level["icon"],
            "total": len(questions_detail),
            "answered": answered,
            "questions": questions_detail,
        })

    return {
        "candidate": candidate,
        "levels": level_results,
        "badge_details": badge_details,
        "generated_at": datetime.now().isoformat(),
    }


def generate_test_report(candidate_id, test_id):
    from models.database import get_assignment, get_test_by_id_str
    candidate = get_candidate_by_id(candidate_id)
    if not candidate:
        return None

    test = get_test_by_id_str(test_id)
    if not test:
        return None

    assignment = get_assignment(test_id, candidate_id)
    if not assignment:
        return None

    answers = assignment.get("answers", {})
    questions = test.get("questions", [])
    violations = assignment.get("violations", [])

    questions_detail = []
    for q in questions:
        q_id = q.get("id", "")
        user_answer = str(answers.get(q_id, "")).strip()
        correct = None
        is_correct = None
        if q.get("type") in ("mcq", "text"):
            correct = str(q.get("correct", ""))
            is_correct = user_answer.lower() == correct.lower()
        questions_detail.append({
            "text": q.get("text", ""),
            "type": q.get("type", "mcq"),
            "user_answer": user_answer or "(no answer)",
            "correct_answer": correct,
            "is_correct": is_correct,
            "category": q.get("category", "general"),
        })

    answered = sum(1 for qd in questions_detail if qd["user_answer"] != "(no answer)")

    return {
        "candidate": {
            "name": candidate.get("name", ""),
            "email": candidate.get("email", ""),
            "phone": candidate.get("phone", ""),
            "college": candidate.get("college", ""),
            "department": candidate.get("department", ""),
            "year": candidate.get("year", 0),
            "candidate_id": candidate.get("candidate_id", ""),
            "linkedin": candidate.get("linkedin", ""),
            "github": candidate.get("github", ""),
        },
        "test": {
            "name": test.get("name", ""),
            "date": test.get("date", ""),
            "difficulty": test.get("difficulty", "medium"),
        },
        "assignment": {
            "status": assignment.get("status", ""),
            "time_taken": assignment.get("time_taken", 0),
            "violation_count": assignment.get("violation_count", 0),
            "tab_switch_count": assignment.get("tab_switch_count", 0),
            "started_at": assignment.get("started_at"),
            "completed_at": assignment.get("completed_at"),
            "scores": assignment.get("scores", {}),
        },
        "questions": questions_detail,
        "answered": answered,
        "total_questions": len(questions_detail),
        "violations": violations,
        "generated_at": datetime.now().isoformat(),
    }


def get_all_candidates_summary():
    from models.database import load_db
    db = load_db()
    candidates = [
        dict(c) for c in db["candidates"]
        if c.get("completed") and c.get("selected") != 3
    ]
    candidates.sort(key=lambda c: (-c.get("score_final", 0), c.get("time_taken", 99999)))
    return candidates
