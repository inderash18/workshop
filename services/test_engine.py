import random
from datetime import datetime
from bson import ObjectId


def get_test_questions(test, candidate_id=None):
    if not test:
        return []

    questions = test.get("questions", [])
    if not questions:
        return []

    if candidate_id:
        seed = hash(candidate_id) % (2**32)
        rng = random.Random(seed)
        questions = list(questions)
        rng.shuffle(questions)

    return questions


def get_test_security_rules(test):
    defaults = {
        "fullscreen_mandatory": True,
        "tab_switch_limit": 3,
        "copy_detection": True,
        "paste_detection": True,
        "right_click_detection": True,
        "refresh_detection": True,
        "devtools_detection": True,
        "multiple_tabs_detection": True,
        "screen_resize_action": "warning",
        "idle_detection": True,
        "idle_timeout_seconds": 300,
        "webcam_required": False,
        "microphone_required": False,
    }
    if test:
        rules = test.get("security_rules", {})
        defaults.update(rules)
    return defaults


def compute_scores_from_answers(test, answers, time_taken=0, violation_count=0):
    questions = test.get("questions", [])
    if not questions:
        return {"score_final": 0.0, "scores": {}, "correct_count": 0, "total_questions": 0}

    total_questions = len(questions)
    correct_count = 0
    score_by_category = {}

    for q in questions:
        q_id = q.get("id", "")
        q_type = q.get("type", "mcq")
        category = q.get("category", "general")
        xp_points = q.get("xp_points", 1)
        user_answer = str(answers.get(q_id, "")).strip()

        if q_type in ("mcq", "text"):
            correct_answer = str(q.get("correct", "")).strip()
            is_correct = user_answer.lower() == correct_answer.lower()
            if is_correct:
                correct_count += 1
                score_by_category[category] = score_by_category.get(category, 0) + xp_points
        elif q_type == "textarea":
            min_words = q.get("min_words", 0)
            word_count = len(user_answer.split()) if user_answer else 0
            if word_count >= min_words:
                score_by_category[category] = score_by_category.get(category, 0) + xp_points * 0.5

    max_possible = sum(q.get("xp_points", 1) for q in questions)
    if max_possible == 0:
        max_possible = total_questions

    raw_score = sum(score_by_category.values())
    score_final = round(min(100.0, (raw_score / max_possible) * 100), 2) if max_possible > 0 else 0.0

    if violation_count >= 3:
        score_final = 0.0
        selected_status = 3
    else:
        deduction = min(15.0, violation_count * 3.0)
        score_final = round(max(0.0, score_final - deduction), 2)
        selected_status = 0

    time_limit = test.get("duration_minutes", 60) * 60
    if time_limit > 0 and time_taken > 0:
        ratio = time_taken / time_limit
        if ratio <= 0.3:
            time_bonus = 5.0
        elif ratio >= 1.0:
            time_bonus = 0.0
        else:
            time_bonus = round(5.0 - (ratio - 0.3) / 0.7 * 5.0, 2)
        score_final = round(min(100.0, score_final + time_bonus), 2)

    selection_count = test.get("selection_count", 30)
    if selection_count > 0 and score_final > 0:
        selection_pct = round(min(100.0, score_final), 2)
    else:
        selection_pct = 0.0

    scores = {
        "score_final": score_final,
        "score_correct": correct_count,
        "score_total": total_questions,
        "score_selection_prob": selection_pct,
        "score_time_bonus": round(time_bonus if time_limit > 0 and time_taken > 0 else 0, 2),
    }
    scores.update({f"category_{k}": round(v, 2) for k, v in score_by_category.items()})

    return {
        "scores": scores,
        "selected_status": selected_status,
        "correct_count": correct_count,
        "total_questions": total_questions,
    }


def format_test_for_display(test):
    if not test:
        return None
    result = dict(test)
    if "_id" in result:
        result["_id"] = str(result["_id"])
    questions = result.get("questions", [])
    for q in questions:
        if q.get("type") in ("mcq", "text"):
            pass
    result["question_count"] = len(questions)
    return result
