from routes.auth import auth_bp
from routes.challenge import challenge_bp
from routes.dashboard import dashboard_bp
from routes.leaderboard import leaderboard_bp
from routes.admin import admin_bp

ALL_BLUEPRINTS = [auth_bp, challenge_bp, dashboard_bp, leaderboard_bp, admin_bp]
