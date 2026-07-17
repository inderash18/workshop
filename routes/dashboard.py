import json
from flask import Blueprint, jsonify, session, redirect, url_for, render_template

from models.database import get_candidate_by_email
from middleware.auth import login_required

dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.route("/")
def index():
    return render_template("landing.html")


@dashboard_bp.route("/dashboard")
def dashboard_page():
    if "user_email" not in session:
        return redirect(url_for("auth.login_page"))
    return render_template("dashboard.html")


@dashboard_bp.route("/profile")
def profile_page():
    if "user_email" not in session:
        return redirect(url_for("auth.login_page"))
    return render_template("profile.html")


@dashboard_bp.route("/api/dashboard")
@login_required
def api_dashboard():
    candidate = get_candidate_by_email(session["user_email"])
    if not candidate:
        return jsonify({"error": "Not found"}), 404

    c_data = dict(candidate)
    c_data.pop("password_hash", None)
    for field in ["badges", "violation_logs"]:
        try:
            c_data[field] = json.loads(c_data[field]) if c_data.get(field) else []
        except Exception:
            c_data[field] = []

    return jsonify({"candidate": c_data})
