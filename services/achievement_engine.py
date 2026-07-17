ACHIEVEMENTS = [
    {
        "id": "logic_master",
        "name": "Logic Master",
        "icon": "&#x1F9E0;",
        "color": "#6366f1",
        "description": "Scored 35+ on Logic across Pattern Intelligence, Logic Engine, and Brain Challenge.",
        "condition": lambda s, sel: s["score_logic"] >= 35 and sel != 3,
    },
    {
        "id": "creative_genius",
        "name": "Creative Genius",
        "icon": "&#x1F3A8;",
        "color": "#ec4899",
        "description": "Top-tier creativity in open-ended responses.",
        "condition": lambda s, sel: s["score_creativity"] >= 16 and sel != 3,
    },
    {
        "id": "ai_expert",
        "name": "AI Expert",
        "icon": "&#x1F916;",
        "color": "#3b82f6",
        "description": "Deep understanding of modern AI concepts.",
        "condition": lambda s, sel: s["score_ai_knowledge"] >= 16 and sel != 3,
    },
    {
        "id": "problem_solver",
        "name": "Problem Solver",
        "icon": "&#x1F9E9;",
        "color": "#22c55e",
        "description": "Excellent prompt engineering and structured thinking.",
        "condition": lambda s, sel: s["score_problem_solving"] >= 8 and sel != 3,
    },
    {
        "id": "research_mind",
        "name": "Research Mind",
        "icon": "&#x1F52C;",
        "color": "#a855f7",
        "description": "Strong research methodology and analytical thinking.",
        "condition": lambda s, sel: s["score_research"] >= 8 and sel != 3,
    },
    {
        "id": "prompt_engineer",
        "name": "Prompt Engineer",
        "icon": "&#x2728;",
        "color": "#eab308",
        "description": "Combines problem solving with creative prompt design.",
        "condition": lambda s, sel: s["score_problem_solving"] >= 9 and s["score_creativity"] >= 15 and sel != 3,
    },
    {
        "id": "innovation_champion",
        "name": "Innovation Champion",
        "icon": "&#x1F31F;",
        "color": "#f97316",
        "description": "Elite creativity paired with strong problem solving.",
        "condition": lambda s, sel: s["score_creativity"] >= 17 and s["score_problem_solving"] >= 9 and sel != 3,
    },
    {
        "id": "ai_potential_star",
        "name": "AI Potential Star",
        "icon": "&#x2B50;",
        "color": "#818cf8",
        "description": "Exceptional AI potential across multiple dimensions.",
        "condition": lambda s, sel: s["score_ai_potential"] >= 8 and sel != 3,
    },
    {
        "id": "workshop_ready",
        "name": "Workshop Ready",
        "icon": "&#x1F4AA;",
        "color": "#22d3ee",
        "description": "Highly compatible with the workshop curriculum.",
        "condition": lambda s, sel: s["score_workshop_compat"] >= 8 and sel != 3,
    },
    {
        "id": "speed_demon",
        "name": "Speed Demon",
        "icon": "&#x26A1;",
        "color": "#facc15",
        "description": "Completed the challenge in the top 10% by time.",
        "condition": lambda s, sel: s["score_time"] >= 9 and sel != 3,
    },
    {
        "id": "future_researcher",
        "name": "Future Researcher",
        "icon": "&#x1F52E;",
        "color": "#6366f1",
        "description": "Outstanding overall performance.",
        "condition": lambda s, sel: s["score_final"] >= 80 and sel != 3,
    },
    {
        "id": "elite_candidate",
        "name": "Elite Candidate",
        "icon": "&#x1F451;",
        "color": "#fbbf24",
        "description": "Top 1% of all candidates.",
        "condition": lambda s, sel: s["score_final"] >= 90 and sel != 3,
    },
    {
        "id": "ai_aspirant",
        "name": "AI Aspirant",
        "icon": "&#x1F680;",
        "color": "#94a3b8",
        "description": "Solid performance across the board.",
        "condition": lambda s, sel: s["score_final"] >= 65 and sel != 3,
    },
]


def compute_badges(scores, selected_status):
    if selected_status == 3:
        return []

    earned = []
    for ach in ACHIEVEMENTS:
        try:
            if ach["condition"](scores, selected_status):
                earned.append(ach["id"])
        except Exception:
            continue
    return earned


def get_badge_details(badge_ids):
    result = []
    id_set = set(badge_ids) if badge_ids else set()
    for ach in ACHIEVEMENTS:
        result.append({
            "id": ach["id"],
            "name": ach["name"],
            "icon": ach["icon"],
            "color": ach["color"],
            "description": ach["description"],
            "earned": ach["id"] in id_set,
        })
    return result
