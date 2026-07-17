from datetime import datetime
from services.test_engine import compute_scores_from_answers


def compute_scores(candidate, submission, test=None):
    answers = submission.get("answers", {})
    time_taken = int(submission.get("time_taken", 0))
    violation_count = int(submission.get("violation_count", 0))
    violation_logs = list(submission.get("violation_logs", []))
    telemetry = submission.get("telemetry", {})

    if test:
        result = compute_scores_from_answers(test, answers, time_taken, violation_count)
        scores = result["scores"]
        selected_status = result["selected_status"]

        typing_speed_avg = float(telemetry.get("typing_speed_avg", 0.0))
        if typing_speed_avg > 1500:
            violation_logs.append({
                "timestamp": datetime.now().isoformat(),
                "type": "Typing Anomaly Detected",
                "detail": f"Absurd typing velocity: {typing_speed_avg} CPM",
            })
    else:
        from services.challenge_engine import get_challenge_data, get_total_time
        levels = get_challenge_data(candidate["candidate_id"])
        scores, selected_status = _compute_legacy_scores(levels, answers, time_taken, violation_count, telemetry)
        if typing_speed_avg > 1500:
            violation_logs.append({
                "timestamp": datetime.now().isoformat(),
                "type": "Typing Anomaly Detected",
                "detail": f"Absurd typing velocity: {typing_speed_avg} CPM",
            })

    from services.achievement_engine import compute_badges
    badges = compute_badges(scores, selected_status)

    return {
        "scores": scores,
        "badges": badges,
        "selected_status": selected_status,
        "violation_logs": violation_logs,
    }


def _compute_legacy_scores(levels, answers, time_taken, violation_count, telemetry):
    typing_speed_avg = float(telemetry.get("typing_speed_avg", 0.0))
    answers_by_level = answers
    correct_by_level = {}
    text_answers_by_level = {}
    for level in levels:
        lid = level["id"]
        correct_by_level[lid] = []
        text_answers_by_level[lid] = []
        level_answers = answers_by_level.get(str(lid), {})
        for q in level["questions"]:
            user_answer = str(level_answers.get(q["id"], "")).strip()
            if q["type"] in ("mcq", "text"):
                correct_answer = str(q.get("correct", "")).strip()
                is_correct = user_answer.lower() == correct_answer.lower()
                correct_by_level[lid].append(is_correct)
            text_answers_by_level[lid].append(user_answer)

    score_logic = _score_logic(correct_by_level, text_answers_by_level)
    score_creativity = _score_creativity(text_answers_by_level)
    score_ai = _score_ai_knowledge(correct_by_level, text_answers_by_level)
    score_ps = _score_problem_solving(text_answers_by_level)
    score_research = _score_research(text_answers_by_level)
    score_time = _score_time(time_taken, levels)

    score_ai_potential = round(min(10.0, (score_creativity + score_ai + score_research) / 3), 2)
    score_workshop_compat = round(min(10.0, score_logic * 0.2 + score_creativity * 0.15 + score_ai * 0.25 + score_ps * 0.2 + score_research * 0.2), 2)

    raw_total = score_logic + score_creativity + score_ai + score_ps + score_research + score_time
    max_possible = 40 + 20 + 20 + 10 + 10 + 10
    score_selection_prob = round(min(100.0, (raw_total / max_possible) * 100), 2)
    score_final = round(min(100.0, (raw_total / max_possible) * 100), 2)

    if violation_count >= 3:
        selected_status = 3
        score_final = 0.0
        score_selection_prob = 0.0
    else:
        deduction = min(15.0, violation_count * 3.0)
        score_final = round(max(0.0, score_final - deduction), 2)
        selected_status = 0

    scores = {
        "score_logic": round(score_logic, 2),
        "score_creativity": round(score_creativity, 2),
        "score_ai_knowledge": round(score_ai, 2),
        "score_problem_solving": round(score_ps, 2),
        "score_research": round(score_research, 2),
        "score_ai_potential": score_ai_potential,
        "score_workshop_compat": score_workshop_compat,
        "score_selection_prob": score_selection_prob,
        "score_time": round(score_time, 2),
        "score_final": score_final,
    }
    return scores, selected_status


def _score_logic(correct_by_level, text_answers):
    score = 0.0
    max_per_q = 40.0 / 5.0
    for lid in (1, 2, 6):
        for is_correct in correct_by_level.get(lid, []):
            if is_correct:
                score += max_per_q
    return min(40.0, round(score, 2))


def _score_creativity(text_answers):
    score = 0.0
    for lid in (3, 4, 7):
        for answer in text_answers.get(lid, []):
            answer_lower = answer.lower()
            if len(answer_lower) < 30:
                continue
            words = answer_lower.split()
            word_count = len(words)
            ai_keywords = [
                "collaborate", "pipeline", "consensus", "cross-check", "refine",
                "strength", "critique", "agents", "compare", "verify",
                "persona", "context", "constraint", "template", "output",
                "budget", "solution", "approach", "methodology", "framework",
                "model", "data", "training", "evaluation", "deploy",
            ]
            kw_matches = sum(1 for kw in ai_keywords if kw in answer_lower)
            kw_score = min(3.0, kw_matches * 0.5)
            length_score = min(2.0, word_count / 50.0 * 2.0) if word_count <= 150 else max(1.0, 2.0 - (word_count - 150) / 200.0)
            has_structure = 1.0 if any(marker in answer_lower for marker in ["1.", "2.", "3.", "-", "first", "second", "third", "also", "additionally"]) else 0.0
            structure_score = has_structure * 1.0
            q_score = min(6.0, kw_score + length_score + structure_score)
            score += q_score
    return min(20.0, round(score, 2))


def _score_ai_knowledge(correct_by_level, text_answers):
    score = 0.0
    mcq_max = 10.0
    l5_correct = correct_by_level.get(5, [])
    l5_total = len(l5_correct)
    if l5_total > 0:
        score += (sum(1 for c in l5_correct if c) / l5_total) * mcq_max
    ai_keywords = [
        "retrieve", "retrieval", "fine-tuning", "fine tune", "vector", "embeddings",
        "embedding", "database", "context", "hallucination", "factual", "weights",
        "external", "transformer", "attention", "token", "prompt", "inference",
        "training", "dataset", "model", "architecture", "parameter",
    ]
    for answer in text_answers.get(5, []):
        answer_lower = answer.lower()
        if len(answer_lower) < 20:
            continue
        matches = sum(1 for kw in ai_keywords if kw in answer_lower)
        kw_score = min(10.0, matches * 1.5)
        length_bonus = min(2.0, len(answer_lower) / 200.0 * 2.0)
        score += min(10.0, kw_score + length_bonus)
    return min(20.0, round(score, 2))


def _score_problem_solving(text_answers):
    score = 0.0
    for answer in text_answers.get(4, []):
        answer_lower = answer.lower()
        if len(answer_lower) < 30:
            continue
        has_tags = 1.0 if ("<" in answer and ">" in answer) or ("[" in answer and "]" in answer) else 0.0
        has_structure = 1.0 if any(kw in answer_lower for kw in ["role:", "act as", "instructions", "output", "format", "persona", "you are"]) else 0.0
        prompt_keywords = ["persona", "context", "constraint", "variable", "template", "layout", "design", "role", "task", "example"]
        kw_matches = sum(1 for kw in prompt_keywords if kw in answer_lower)
        kw_score = min(3.0, kw_matches * 0.75)
        length_score = min(2.0, len(answer_lower) / 200.0 * 2.0)
        q_score = min(10.0, length_score + has_tags * 2.0 + has_structure * 2.0 + kw_score)
        score += q_score
    return min(10.0, round(score, 2))


def _score_research(text_answers):
    score = 0.0
    research_keywords = [
        "research", "methodology", "experiment", "hypothesis", "data",
        "analysis", "findings", "approach", "framework", "evaluate",
        "novel", "innovative", "solution", "problem", "impact",
        "constraint", "budget", "scalable", "deploy", "real-world",
    ]
    for answer in text_answers.get(7, []):
        answer_lower = answer.lower()
        if len(answer_lower) < 30:
            continue
        matches = sum(1 for kw in research_keywords if kw in answer_lower)
        word_count = len(answer_lower.split())
        kw_score = min(6.0, matches * 1.0)
        length_score = min(4.0, word_count / 60.0 * 4.0) if word_count <= 200 else max(2.0, 4.0 - (word_count - 200) / 100.0)
        score += min(10.0, kw_score + length_score)
    return min(10.0, round(score, 2))


def _score_time(time_taken, levels):
    total_time = sum(lv["time_limit"] for lv in levels)
    if time_taken <= 0:
        return 0.0
    ratio = time_taken / total_time
    if ratio <= 0.3:
        return 10.0
    if ratio >= 1.0:
        return 2.0
    return round(10.0 - (ratio - 0.3) / 0.7 * 8.0, 2)
