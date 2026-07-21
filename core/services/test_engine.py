import random
from datetime import datetime
from bson import ObjectId


def get_test_questions(test, candidate_id=None):
    if not test:
        return []

    questions_list = []
    if candidate_id:
        from core.database.models import get_assignment, update_assignment, _col, get_setting
        assignment = get_assignment(str(test["_id"]), candidate_id)
        if assignment and assignment.get("questions"):
            questions_list = assignment["questions"]
        else:
            total_limit = int(get_setting("total_questions", test.get("total_questions", test.get("question_count", 15))))
            question_timer = int(get_setting("question_timer", test.get("question_timer", 60)))
            all_q = list(_col("question_bank").find({"is_active": {"$ne": False}}))
            if not all_q:
                all_q = [q for q in test.get("questions", []) if q.get("is_active", True)]

            if len(all_q) > total_limit:
                selected_q = random.sample(all_q, total_limit)
            else:
                selected_q = list(all_q)

            questions_list = []
            for i, q in enumerate(selected_q):
                q_copy = dict(q)
                if "_id" in q_copy:
                    q_copy["_id"] = str(q_copy["_id"])
                if "id" not in q_copy:
                    q_copy["id"] = q_copy.get("_id") or str(i)
                q_copy.setdefault("time_limit", question_timer)
                questions_list.append(q_copy)

            if assignment:
                update_assignment(str(test["_id"]), candidate_id, {"questions": questions_list})
    else:
        questions_list = test.get("questions", [])

    normalized = []
    for q in questions_list:
        q_copy = dict(q)
        if "_id" in q_copy:
            q_copy["_id"] = str(q_copy["_id"])
        if "id" not in q_copy:
            q_copy["id"] = q_copy.get("_id")
        
        if "type" not in q_copy:
            q_copy["type"] = q_copy.get("question_type") or "mcq"
        if "text" not in q_copy:
            q_copy["text"] = q_copy.get("description") or q_copy.get("question_description") or ""
            
        normalized.append(q_copy)

    return normalized


def get_test_security_rules(test):
    from core.database.models import get_setting

    defaults = {
        "fullscreen_mandatory": bool(get_setting("sec_fullscreen_enabled", True)),
        "tab_switch_limit": int(get_setting("sec_tab_switch_limit", 3)),
        "copy_detection": bool(get_setting("sec_copy_enabled", True)),
        "paste_detection": bool(get_setting("sec_paste_enabled", True)),
        "right_click_detection": bool(get_setting("sec_right_click_enabled", True)),
        "refresh_detection": bool(get_setting("sec_refresh_enabled", True)),
        "devtools_detection": bool(get_setting("sec_devtools_enabled", True)),
        "multiple_tabs_detection": bool(get_setting("sec_multiple_login_enabled", True)),
        "screen_resize_action": "warning",
        "idle_detection": bool(get_setting("sec_idle_enabled", True)),
        "idle_timeout_seconds": int(get_setting("sec_idle_timeout_seconds", 60)),
        "webcam_required": False,
        "microphone_required": False,
        "browser_resize_limit": int(get_setting("sec_browser_resize_limit", 2)),
        "window_blur_limit": int(get_setting("sec_window_blur_limit", 3)),
        "disconnect_grace_seconds": int(get_setting("sec_disconnect_grace_seconds", 30)),
    }
    if test:
        rules = test.get("security_rules", {})
        defaults.update(rules)
    return defaults


def compute_scores_from_answers(test, answers, time_taken=0, violation_count=0):
    from core.database.models import get_setting
    questions = test.get("questions", [])
    if not questions:
        return {"score_final": 0.0, "scores": {}, "correct_count": 0, "total_questions": 0}

    total_questions = len(questions)
    correct_count = 0
    
    dimension_max = {"logic": 0, "creativity": 0, "innovation": 0, "problem_solving": 0, "human_intelligence": 0}
    dimension_obtained = {"logic": 0, "creativity": 0, "innovation": 0, "problem_solving": 0, "human_intelligence": 0}

    category_mapping = {
        "logic": ["logic", "pattern recognition", "critical thinking"],
        "creativity": ["creativity", "future thinking", "startup thinking"],
        "innovation": ["innovation", "research"],
        "problem_solving": ["problem solving"],
        "human_intelligence": ["ai thinking", "prompt engineering", "ai knowledge", "human intelligence"]
    }

    def get_dimension(cat):
        cat_lower = str(cat).lower()
        for dim, cats in category_mapping.items():
            if any(c in cat_lower for c in cats):
                return dim
        return "logic"

    for q in questions:
        q_id = q.get("id", "")
        q_type = q.get("type", "mcq")
        category = q.get("category", "Logic")
        xp_points = q.get("xp_points") or q.get("marks") or 10
        dim = get_dimension(category)
        
        dimension_max[dim] += xp_points
        user_answer = str(answers.get(q_id, "")).strip()

        if q_type in ("mcq", "text"):
            correct_answer = str(q.get("correct") or q.get("correct_answer") or "").strip()
            is_correct = user_answer.lower() == correct_answer.lower()
            if is_correct:
                correct_count += 1
                dimension_obtained[dim] += xp_points
        elif q_type == "textarea":
            min_words = q.get("min_words", 0)
            word_count = len(user_answer.split()) if user_answer else 0
            if word_count >= min_words:
                dimension_obtained[dim] += xp_points * 0.5

    dim_scores = {}
    for dim in dimension_max:
        if dimension_max[dim] > 0:
            dim_scores[dim] = (dimension_obtained[dim] / dimension_max[dim]) * 100.0
        else:
            dim_scores[dim] = 80.0

    security_score = max(0.0, 100.0 - (violation_count * 15.0))

    w_logic = float(get_setting("weight_logic", 40)) / 100.0
    w_creativity = float(get_setting("weight_creativity", 20)) / 100.0
    w_innovation = float(get_setting("weight_innovation", 10)) / 100.0
    w_problem_solving = float(get_setting("weight_problem_solving", 10)) / 100.0
    w_human_intel = float(get_setting("weight_human_intelligence", 10)) / 100.0
    w_security = float(get_setting("weight_security", 10)) / 100.0

    raw_final = (
        dim_scores["logic"] * w_logic +
        dim_scores["creativity"] * w_creativity +
        dim_scores["innovation"] * w_innovation +
        dim_scores["problem_solving"] * w_problem_solving +
        dim_scores["human_intelligence"] * w_human_intel +
        security_score * w_security
    )
    score_final = round(min(100.0, raw_final), 2)

    max_violations = int(get_setting("sec_tab_switch_limit", 3))
    if violation_count >= max_violations:
        score_final = 0.0
        selected_status = 3
    else:
        selected_status = 0

    time_bonus = 0.0
    time_limit = test.get("duration_minutes", 15) * 60
    if time_limit > 0 and time_taken > 0:
        ratio = time_taken / time_limit
        if ratio <= 0.3:
            time_bonus = 5.0
        elif ratio >= 1.0:
            time_bonus = 0.0
        else:
            time_bonus = round(5.0 - (ratio - 0.3) / 0.7 * 5.0, 2)
        score_final = round(min(100.0, score_final + time_bonus), 2)

    scores = {
        "logic": dim_scores["logic"],
        "creativity": dim_scores["creativity"],
        "innovation": dim_scores["innovation"],
        "problem_solving": dim_scores["problem_solving"],
        "security": security_score,
        "ai_knowledge": dim_scores["human_intelligence"],
        "final": score_final,
        "score_final": score_final,
        "score_correct": correct_count,
        "score_total": total_questions,
        "score_time_bonus": time_bonus,
    }

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
