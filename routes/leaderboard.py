import json
from flask import Blueprint, jsonify, render_template, abort

from core.database.models import load_db, get_assignments_for_test, get_test_by_id_str, get_setting

leaderboard_bp = Blueprint("leaderboard", __name__)


@leaderboard_bp.route("/leaderboard")
def leaderboard_page():
    enabled = get_setting("leaderboard_enabled", False)
    if not enabled:
        abort(404)
    return render_template("leaderboard.html")


@leaderboard_bp.route("/api/leaderboard")
def api_leaderboard():
    enabled = get_setting("leaderboard_enabled", False)
    if not enabled:
        return jsonify({"leaderboard_enabled": False, "results": []})

    db = load_db()
    valid = [
        c for c in db["candidates"]
        if c.get("selected") != 3 and c.get("completed")
    ]
    valid.sort(key=lambda c: (-c.get("score_final", 0), c.get("time_taken", 99999)))

    limit = int(get_setting("leaderboard_limit", 10))
    results = []
    for c in valid[:limit]:
        entry = {
            "name": c.get("name"),
            "college": c.get("college"),
            "score_final": c.get("score_final"),
            "created_at": c.get("created_at"),
        }
        try:
            entry["badges"] = json.loads(c.get("badges", "[]")) if c.get("badges") else []
        except Exception:
            entry["badges"] = []
        results.append(entry)

    return jsonify({"leaderboard_enabled": True, "results": results})
