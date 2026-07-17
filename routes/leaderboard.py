import json
from flask import Blueprint, jsonify, render_template

from models.database import load_db

leaderboard_bp = Blueprint("leaderboard", __name__)


@leaderboard_bp.route("/leaderboard")
def leaderboard_page():
    return render_template("leaderboard.html")


@leaderboard_bp.route("/api/leaderboard")
def api_leaderboard():
    db = load_db()
    valid = [
        c for c in db["candidates"]
        if c.get("selected") != 3 and c.get("completed")
    ]
    valid.sort(key=lambda c: (-c.get("score_final", 0), c.get("time_taken", 99999)))

    return jsonify([
        {
            "name": c.get("name"),
            "college": c.get("college"),
            "score_final": c.get("score_final"),
            "badges": json.loads(c.get("badges", "[]")) if c.get("badges") else [],
            "created_at": c.get("created_at"),
        }
        for c in valid[:10]
    ])
