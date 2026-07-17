from routes.auth import auth_bp
from routes.dashboard import dashboard_bp
from routes.leaderboard import leaderboard_bp
from routes.admin import admin_bp
from routes.test_management import test_management_bp
from routes.test_session import test_session_bp

ALL_BLUEPRINTS = [
    auth_bp,
    dashboard_bp,
    leaderboard_bp,
    admin_bp,
    test_management_bp,
    test_session_bp,
]
