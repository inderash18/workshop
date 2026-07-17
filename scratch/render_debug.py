import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from flask import session

app = create_app()

print("Simulating requests using Flask test client...")
with app.test_client() as client:
    # Set up session directly
    with client.session_transaction() as sess:
        sess["admin_logged_in"] = True
        sess["admin_username"] = "admin"
    
    print("\n--- GET /admin ---")
    try:
        r = client.get("/admin")
        print(f"Status: {r.status_code}")
        if r.status_code == 500:
            # Re-raise error to see traceback by disabling custom error handler
            # We can request it under testing mode to see full exception
            app.config['TESTING'] = True
            client.get("/admin")
    except Exception as e:
        import traceback
        traceback.print_exc()

    print("\n--- GET /admin/analytics ---")
    try:
        r = client.get("/admin/analytics")
        print(f"Status: {r.status_code}")
        if r.status_code == 500:
            app.config['TESTING'] = True
            client.get("/admin/analytics")
    except Exception as e:
        import traceback
        traceback.print_exc()
