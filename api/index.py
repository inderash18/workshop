import sys
import os

# Add the project root to path so all modules are accessible
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app

# Create the Flask app instance (Vercel looks for a variable named `app`)
app = create_app()
