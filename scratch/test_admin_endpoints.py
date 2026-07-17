import urllib.request
import urllib.parse
import json
import http.cookiejar

def test_routes():
    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    urllib.request.install_opener(opener)

    print("Logging in to admin...")
    login_data = json.dumps({"username": "admin", "password": "admin2026"}).encode("utf-8")
    req = urllib.request.Request(
        "http://localhost:5000/api/admin/login",
        data=login_data,
        headers={"Content-Type": "application/json"}
    )
    res = urllib.request.urlopen(req)
    
    if res.status == 200:
        print("\nTesting /admin...")
        r = urllib.request.urlopen("http://localhost:5000/admin")
        print(f"Status: {r.status}")
        if r.status == 200:
            print("Success! /admin page rendered successfully.")
    else:
        print("Login failed.")

if __name__ == "__main__":
    try:
        test_routes()
    except Exception as e:
        print(f"Error testing: {e}")
