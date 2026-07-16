import os
import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')
import json
import random
import uuid
import re
import hashlib
import hmac
import time
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, request, jsonify, render_template, redirect, url_for, session, g
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.middleware.proxy_fix import ProxyFix

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'ai_next_gen_secret_key_2026')
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=24)
app.config['SESSION_COOKIE_SECURE'] = os.environ.get('SESSION_COOKIE_SECURE', 'False') == 'True'
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.wsgi_app = ProxyFix(app.wsgi_app)

# Load .env file manually to populate os.environ
def load_env_file():
    env_file = os.path.join(os.path.dirname(__file__), '.env')
    if os.path.exists(env_file):
        with open(env_file, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                if '=' in line:
                    key, val = line.split('=', 1)
                    key = key.strip()
                    val = val.strip().strip('"').strip("'")
                    os.environ[key] = val

load_env_file()

from pymongo import MongoClient
import dns.resolver

# ===== MONGODB ATLAS CONNECTION =====
MONGO_URI = os.environ.get('MONGODB_URI', "mongodb+srv://inderashaiworkspace_db_user:fPZJ6C3DeezVr4n4@cluster0.fw4opds.mongodb.net/")
mongo_client = MongoClient(MONGO_URI)
mongo_db = mongo_client["ai_next_gen"]
state_collection = mongo_db["state"]

SESSION_EXPIRY_HOURS = 24
MAX_LOGIN_ATTEMPTS = 5
LOGIN_LOCKOUT_MINUTES = 30

# ===== DATABASE HELPERS =====

def load_db():
    """Load database from MongoDB Atlas with proper error handling and initialization"""
    try:
        db = state_collection.find_one({"_id": "global_state"})
        if not db:
            db = {
                "_id": "global_state",
                "candidates": [],
                "admins": [
                    {"username": "admin", "password_hash": hash_password("admin2026")}
                ],
                "login_attempts": {},
                "audit_log": []
            }
            state_collection.insert_one(db)
            return db
            
        # Ensure default keys are present in loaded dictionary
        updated = False
        if not isinstance(db, dict):
            db = {"_id": "global_state"}
        if "candidates" not in db:
            db["candidates"] = []
            updated = True
        if "admins" not in db:
            db["admins"] = [{"username": "admin", "password_hash": hash_password("admin2026")}]
            updated = True
        if "login_attempts" not in db:
            db["login_attempts"] = {}
            updated = True
        if "audit_log" not in db:
            db["audit_log"] = []
            updated = True
            
        if updated:
            save_db(db)
        return db
    except Exception as e:
        print(f"⚠️ MongoDB read error: {e}, falling back to dynamic in-memory database...")
        db = {
            "_id": "global_state",
            "candidates": [],
            "admins": [
                {"username": "admin", "password_hash": hash_password("admin2026")}
            ],
            "login_attempts": {},
            "audit_log": []
        }
        return db

def save_db(db):
    """Save database to MongoDB Atlas"""
    try:
        db["_id"] = "global_state"
        state_collection.replace_one({"_id": "global_state"}, db, upsert=True)
    except Exception as e:
        print(f"❌ Failed to save database to MongoDB: {e}")
        raise

# ===== SECURITY HELPERS =====

def hash_password(password):
    """Hash password using SHA-256 with salt"""
    salt = os.environ.get('PASSWORD_SALT', 'ai_next_gen_salt')
    return hashlib.sha256(f"{password}{salt}".encode()).hexdigest()

def verify_password(password, password_hash):
    """Verify password against hash"""
    return hash_password(password) == password_hash

def generate_csrf_token():
    """Generate CSRF token for forms"""
    return str(uuid.uuid4())

def is_rate_limited(key, max_attempts=MAX_LOGIN_ATTEMPTS, lockout_minutes=LOGIN_LOCKOUT_MINUTES):
    """Check if a key is rate limited"""
    db = load_db()
    attempts = db.get('login_attempts', {})
    
    if key not in attempts:
        return False
    
    data = attempts[key]
    if data['count'] >= max_attempts:
        lockout_until = datetime.fromisoformat(data['lockout_until']) if data.get('lockout_until') else None
        if lockout_until and datetime.now() < lockout_until:
            return True
        else:
            # Reset attempts after lockout expires
            data['count'] = 0
            data['lockout_until'] = None
            save_db(db)
            return False
    
    return False

def record_login_attempt(key, success=False):
    """Record login attempt for rate limiting"""
    db = load_db()
    attempts = db.get('login_attempts', {})
    
    if key not in attempts:
        attempts[key] = {'count': 0, 'lockout_until': None}
    
    if success:
        attempts[key]['count'] = 0
        attempts[key]['lockout_until'] = None
    else:
        attempts[key]['count'] = attempts[key].get('count', 0) + 1
        if attempts[key]['count'] >= MAX_LOGIN_ATTEMPTS:
            lockout_time = datetime.now() + timedelta(minutes=LOGIN_LOCKOUT_MINUTES)
            attempts[key]['lockout_until'] = lockout_time.isoformat()
    
    db['login_attempts'] = attempts
    save_db(db)

def audit_log(action, user=None, details=None):
    """Log administrative actions"""
    db = load_db()
    log_entry = {
        'timestamp': datetime.now().isoformat(),
        'action': action,
        'user': user or 'system',
        'details': details or {},
        'ip': request.remote_addr if request else 'unknown'
    }
    db['audit_log'].append(log_entry)
    # Keep only last 1000 entries
    if len(db['audit_log']) > 1000:
        db['audit_log'] = db['audit_log'][-1000:]
    save_db(db)

# ===== DECORATORS =====

def login_required(f):
    """Decorator to require user login"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_email' not in session:
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    """Decorator to require admin login"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'admin_logged_in' not in session:
            return jsonify({'error': 'Admin authentication required'}), 401
        return f(*args, **kwargs)
    return decorated_function

def rate_limit(key_func):
    """Decorator for rate limiting"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        key = key_func()
        if is_rate_limited(key):
            return jsonify({'error': 'Too many attempts. Please try again later.'}), 429
        return f(*args, **kwargs)
    return decorated_function

# ===== CANDIDATE HELPERS =====

def generate_candidate_id(db):
    """Generate unique candidate ID"""
    existing_ids = {c.get('candidate_id') for c in db['candidates']}
    for _ in range(100):
        num = random.randint(1000, 9999)
        c_id = f"AINEXT2026-{num}"
        if c_id not in existing_ids:
            return c_id
    raise Exception("Unable to generate unique candidate ID")

def get_candidate_by_email(email):
    """Get candidate by email"""
    db = load_db()
    return next((c for c in db['candidates'] if c.get('email') == email), None)

def get_candidate_by_id(candidate_id):
    """Get candidate by ID"""
    db = load_db()
    return next((c for c in db['candidates'] if c.get('candidate_id') == candidate_id), None)

def sanitize_input(text):
    """Sanitize user input to prevent XSS"""
    if not text:
        return ''
    # Remove potential script tags and dangerous characters
    text = re.sub(r'<script.*?>.*?</script>', '', text, flags=re.DOTALL)
    text = re.sub(r'<.*?>', '', text)
    return text.strip()

def validate_email(email):
    """Validate email format"""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

def validate_phone(phone):
    """Validate phone number format"""
    pattern = r'^[\+\d\s\-\(\)]{10,15}$'
    return re.match(pattern, phone) is not None

# ===== PAGE ROUTES =====

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/signup')
def signup_page():
    if 'user_email' in session:
        return redirect(url_for('dashboard_page'))
    return render_template('signup.html')

@app.route('/login')
def login_page():
    if 'user_email' in session:
        return redirect(url_for('dashboard_page'))
    return render_template('login.html')

@app.route('/dashboard')
def dashboard_page():
    if 'user_email' not in session:
        return redirect(url_for('login_page'))
    return redirect(url_for('profile_page'))

@app.route('/profile')
def profile_page():
    if 'user_email' not in session:
        return redirect(url_for('login_page'))
    return render_template('profile.html')

@app.route('/challenge')
def challenge_page():
    if 'user_email' not in session:
        return redirect(url_for('login_page'))
    
    db = load_db()
    candidate = get_candidate_by_email(session['user_email'])
    if not candidate:
        session.pop('user_email', None)
        return redirect(url_for('login_page'))
    
    if candidate.get('completed'):
        return redirect(url_for('dashboard_page'))
    
    return render_template('challenge.html')

@app.route('/admin')
def admin():
    if 'admin_logged_in' in session:
        return render_template('admin.html')
    return redirect(url_for('admin_login_page'))

@app.route('/admin-login')
def admin_login_page():
    if 'admin_logged_in' in session:
        return redirect(url_for('admin'))
    return render_template('admin_login.html')

# ===== USER ACCOUNT & AUTH APIs =====

@app.route('/api/signup', methods=['POST'])
def api_signup():
    """Enhanced signup with validation and security"""
    data = request.json or {}
    
    # Extract and sanitize
    name = sanitize_input(data.get('name', ''))
    college = sanitize_input(data.get('college', ''))
    department = sanitize_input(data.get('department', ''))
    year = data.get('year')
    email = sanitize_input(data.get('email', '')).lower()
    phone = sanitize_input(data.get('phone', ''))
    password = data.get('password', '')
    linkedin = sanitize_input(data.get('linkedin', ''))
    github = sanitize_input(data.get('github', ''))

    # Validation
    if not all([name, college, department, year, email, phone, password]):
        return jsonify({'error': 'Missing required fields'}), 400
    
    if not validate_email(email):
        return jsonify({'error': 'Invalid email format'}), 400
    
    if not validate_phone(phone):
        return jsonify({'error': 'Invalid phone number format'}), 400
    
    if len(password) < 8:
        return jsonify({'error': 'Password must be at least 8 characters'}), 400
    
    if linkedin and not linkedin.startswith(('https://', 'http://')):
        return jsonify({'error': 'Invalid LinkedIn URL'}), 400
    
    if github and not github.startswith(('https://', 'http://')):
        return jsonify({'error': 'Invalid GitHub URL'}), 400

    db = load_db()
    
    # Check existing email
    if get_candidate_by_email(email):
        return jsonify({'error': 'An account with this email already exists'}), 400

    # Generate IDs
    c_id = generate_candidate_id(db)
    s_id = str(uuid.uuid4())

    # Create candidate
    new_candidate = {
        "id": len(db['candidates']) + 1,
        "candidate_id": c_id,
        "session_id": s_id,
        "name": name,
        "college": college,
        "department": department,
        "year": int(year),
        "email": email,
        "phone": phone,
        "password_hash": hash_password(password),
        "linkedin": linkedin,
        "github": github,
        "verified": False,
        "started": False,
        "completed": False,
        "level1_ans": "",
        "level2_ans": "",
        "level3_ans": "",
        "level4_ans": "",
        "level5_ans": "",
        "level6_ans": "",
        "level7_ans": "",
        "time_taken": 0,
        "tab_switches": 0,
        "violation_count": 0,
        "violation_logs": "[]",
        "backspace_count": 0,
        "typing_speed_avg": 0.0,
        "typing_pattern_variance": 0.0,
        "mouse_moves_count": 0,
        "idle_duration": 0,
        "webcam_status": "Active",
        "location_data": "",
        "score_logic": 0.0,
        "score_creativity": 0.0,
        "score_ai_knowledge": 0.0,
        "score_problem_solving": 0.0,
        "score_time": 0.0,
        "score_final": 0.0,
        "badges": "[]",
        "selected": 0,
        "created_at": datetime.now().isoformat(),
        "last_login": None
    }

    db['candidates'].append(new_candidate)
    save_db(db)

    # Auto-login
    session['user_email'] = email
    session['candidate_id'] = c_id
    session.permanent = True

    audit_log('user_signup', email, {'candidate_id': c_id})

    return jsonify({
        'success': True, 
        'candidate_id': c_id,
        'message': 'Account created successfully'
    })

@app.route('/api/login', methods=['POST'])
def api_login():
    """Enhanced login with rate limiting and security"""
    data = request.json or {}
    email = sanitize_input(data.get('email', '')).lower()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    if not validate_email(email):
        return jsonify({'error': 'Invalid email format'}), 400

    # Rate limiting by IP and email
    ip_key = f"ip_{request.remote_addr}"
    email_key = f"email_{email}"
    
    if is_rate_limited(ip_key) or is_rate_limited(email_key):
        return jsonify({'error': 'Too many attempts. Please try again later.'}), 429

    db = load_db()
    candidate = get_candidate_by_email(email)
    
    if not candidate or not verify_password(password, candidate.get('password_hash', '')):
        # Record failed attempt
        record_login_attempt(ip_key, success=False)
        record_login_attempt(email_key, success=False)
        audit_log('login_failed', email, {'ip': request.remote_addr})
        return jsonify({'error': 'Invalid email or password'}), 401

    # Success
    record_login_attempt(ip_key, success=True)
    record_login_attempt(email_key, success=True)
    
    session['user_email'] = email
    session['candidate_id'] = candidate['candidate_id']
    session.permanent = True
    
    # Update last login
    candidate['last_login'] = datetime.now().isoformat()
    save_db(db)
    
    audit_log('login_success', email, {'candidate_id': candidate['candidate_id']})

    return jsonify({
        'success': True, 
        'candidate_id': candidate['candidate_id'],
        'redirect': '/profile'
    })

@app.route('/api/logout', methods=['POST'])
def api_logout():
    """Logout user"""
    email = session.get('user_email')
    if email:
        audit_log('logout', email)
    session.pop('user_email', None)
    session.pop('candidate_id', None)
    return jsonify({'success': True})

@app.route('/api/session', methods=['GET'])
def get_session():
    """Get current session data"""
    if 'user_email' not in session:
        return jsonify({'logged_in': False}), 401
    
    candidate = get_candidate_by_email(session['user_email'])
    if not candidate:
        session.pop('user_email', None)
        return jsonify({'logged_in': False}), 401

    # Prepare response data (exclude sensitive info)
    c_data = dict(candidate)
    c_data.pop('password_hash', None)
    
    # Parse JSON fields
    for field in ['badges', 'violation_logs']:
        try:
            if field in c_data and c_data[field]:
                c_data[field] = json.loads(c_data[field])
            else:
                c_data[field] = [] if field == 'badges' else []
        except:
            c_data[field] = [] if field == 'badges' else []
    
    # Add session expiry info
    c_data['session_expires'] = (datetime.now() + timedelta(hours=SESSION_EXPIRY_HOURS)).isoformat()
    
    return jsonify({
        'logged_in': True,
        'candidate': c_data
    })

@app.route('/api/profile/update', methods=['POST'])
@login_required
def update_profile():
    """Update user profile"""
    data = request.json or {}
    
    # Extract and sanitize
    name = sanitize_input(data.get('name', ''))
    phone = sanitize_input(data.get('phone', ''))
    college = sanitize_input(data.get('college', ''))
    department = sanitize_input(data.get('department', ''))
    year = data.get('year')
    linkedin = sanitize_input(data.get('linkedin', ''))
    github = sanitize_input(data.get('github', ''))
    bio = sanitize_input(data.get('bio', ''))

    # Validate
    if not all([name, phone, college, department, year]):
        return jsonify({'error': 'Missing required fields'}), 400
    
    if not validate_phone(phone):
        return jsonify({'error': 'Invalid phone number format'}), 400
    
    if linkedin and not linkedin.startswith(('https://', 'http://')):
        return jsonify({'error': 'Invalid LinkedIn URL'}), 400
    
    if github and not github.startswith(('https://', 'http://')):
        return jsonify({'error': 'Invalid GitHub URL'}), 400

    db = load_db()
    candidate = get_candidate_by_email(session['user_email'])
    
    if not candidate:
        return jsonify({'error': 'Candidate not found'}), 404

    # Update fields
    candidate['name'] = name
    candidate['phone'] = phone
    candidate['college'] = college
    candidate['department'] = department
    candidate['year'] = int(year)
    candidate['linkedin'] = linkedin
    candidate['github'] = github
    candidate['bio'] = bio
    candidate['updated_at'] = datetime.now().isoformat()

    save_db(db)
    audit_log('profile_update', session['user_email'], {'fields': list(data.keys())})

    return jsonify({'success': True, 'message': 'Profile updated successfully'})

# ===== CHALLENGE APIs =====

@app.route('/api/challenge/start', methods=['POST'])
@login_required
def start_challenge():
    """Start the challenge for a user"""
    db = load_db()
    candidate = get_candidate_by_email(session['user_email'])
    
    if not candidate:
        return jsonify({'error': 'Candidate not found'}), 404
    
    if candidate.get('completed'):
        return jsonify({'error': 'Challenge already completed'}), 400
    
    candidate['started'] = True
    candidate['started_at'] = datetime.now().isoformat()
    save_db(db)
    
    audit_log('challenge_started', session['user_email'])
    
    return jsonify({'success': True})

@app.route('/api/submit_challenge', methods=['POST'])
@login_required
def submit_challenge():
    """Submit challenge answers with scoring"""
    data = request.json or {}
    db = load_db()
    candidate = get_candidate_by_email(session['user_email'])
    
    if not candidate:
        return jsonify({'error': 'Candidate not found'}), 404
    
    if candidate.get('completed'):
        return jsonify({'error': 'Challenge already submitted'}), 400

    # Extract data
    level1 = data.get('level1', {})
    level2 = data.get('level2', '')
    level3 = data.get('level3', '')
    level4 = data.get('level4', '')
    level5 = data.get('level5', {})
    level6 = data.get('level6', {})
    level7 = data.get('level7', '')
    
    time_taken = int(data.get('time_taken', 0))
    tab_switches = int(data.get('tab_switches', 0))
    violation_count = int(data.get('violation_count', 0))
    violation_logs = data.get('violation_logs', [])
    
    telemetry = data.get('telemetry', {})
    backspace_count = int(telemetry.get('backspace_count', 0))
    typing_speed_avg = float(telemetry.get('typing_speed_avg', 0.0))
    typing_pattern_variance = float(telemetry.get('typing_pattern_variance', 0.0))
    mouse_moves_count = int(telemetry.get('mouse_moves_count', 0))
    idle_duration = int(telemetry.get('idle_duration', 0))
    
    webcam_status = data.get('webcam_status', 'Active')
    location_data = data.get('location_data', '')

    # --- SCORING ---
    score_logic = 0.0
    
    # Level 1 - Logic Detective
    l1_q1 = str(level1.get('q1', '')).strip()
    if l1_q1 == '▽':
        score_logic += 10.0
        
    l1_q2 = str(level1.get('q2', '')).strip().upper()
    if l1_q2 == 'ML' or l1_q2 == '63':
        score_logic += 10.0
        
    # Level 2 - Future Thinker  
    l2_ans = str(level2).strip().lower()
    if 'electric' in l2_ans or 'no smoke' in l2_ans or 'nowhere' in l2_ans or '17' in l2_ans:
        score_logic += 10.0
        
    # Level 6 - Balance Master
    l6_q1 = str(level6.get('q1', '')).strip()
    if l6_q1 == '3':
        score_logic += 10.0

    # Creativity Score
    score_creativity = 0.0
    l3_text = str(level3).strip().lower()
    l3_len = len(l3_text)
    if l3_len > 30:
        keywords_l3 = ['collaborate', 'pipeline', 'consensus', 'cross-check', 'refine', 
                       'strength', 'critique', 'agents', 'compare', 'prompt', 'verify']
        match_count = sum(1 for kw in keywords_l3 if kw in l3_text)
        len_score = min(4.0, (l3_len / 150) * 4)
        kw_score = min(6.0, match_count * 1.5)
        score_creativity += (len_score + kw_score)

    l7_text = str(level7).strip().lower()
    l7_len = len(l7_text)
    if l7_len > 30:
        keywords_l7 = ['budget', '₹1000', 'no gpu', 'low cost', 'real-world', 'solution', 
                       'education', 'traffic', 'healthcare', 'farming', 'cybersecurity']
        match_count_l7 = sum(1 for kw in keywords_l7 if kw in l7_text)
        words = l7_text.split()
        word_penalty = 1.0
        if len(words) > 150:
            word_penalty = max(0.5, 1.0 - ((len(words) - 150) / 100))
        len_score_l7 = min(4.0, (l7_len / 200) * 4)
        kw_score_l7 = min(6.0, match_count_l7 * 1.5)
        score_creativity += (len_score_l7 + kw_score_l7) * word_penalty

    score_creativity = min(20.0, score_creativity)

    # AI Knowledge
    score_ai = 0.0
    l5_q1 = str(level5.get('q1', '')).strip().upper()
    if 'GPU' in l5_q1 or 'FINE-TUNING' in l5_q1:
        score_ai += 10.0
        
    l5_q2 = str(level5.get('q2', '')).strip().lower()
    l5_q2_len = len(l5_q2)
    if l5_q2_len > 30:
        keywords_rag = ['retrieve', 'fine-tuning', 'vector', 'embeddings', 'database', 
                        'context', 'hallucination', 'factual', 'weights', 'external']
        match_rag = sum(1 for kw in keywords_rag if kw in l5_q2)
        len_score_rag = min(4.0, (l5_q2_len / 150) * 4)
        kw_score_rag = min(6.0, match_rag * 1.5)
        score_ai += min(10.0, len_score_rag + kw_score_rag)

    score_ai = min(20.0, score_ai)

    # Problem Solving
    score_ps = 0.0
    l4_text = str(level4).strip().lower()
    l4_len = len(l4_text)
    if l4_len > 40:
        has_tags = 1 if ('<' in l4_text and '>' in l4_text) or ('[' in l4_text and ']' in l4_text) else 0
        has_structure = 1 if any(kw in l4_text for kw in ['role:', 'act as', 'instructions', 'output', 'format']) else 0
        keywords_prompt = ['persona', 'context', 'constraint', 'variable', 'template', 'layout', 'design']
        match_prompt = sum(1 for kw in keywords_prompt if kw in l4_text)
        
        len_score_p = min(3.0, (l4_len / 200) * 3)
        struct_score = (has_tags * 2.0) + (has_structure * 2.0)
        kw_score_p = min(3.0, match_prompt * 0.75)
        score_ps += (len_score_p + struct_score + kw_score_p)

    score_ps = min(10.0, score_ps)

    # Time Score
    if time_taken <= 400:
        score_time = 10.0
    elif time_taken >= 1200:
        score_time = 2.0
    else:
        score_time = 10.0 - ((time_taken - 400) / 800) * 8.0

    # Final Score
    score_final = score_logic + score_creativity + score_ai + score_ps + score_time
    
    # Violation penalties
    selected_status = 0
    if violation_count >= 3:
        selected_status = 3
        score_final = 0.0
    else:
        deduction = min(15.0, violation_count * 3.0)
        score_final = max(0.0, score_final - deduction)

    # Anomaly detection
    if typing_speed_avg > 1500 and (len(l3_text) > 100 or len(l4_text) > 100):
        violation_logs.append({
            'timestamp': datetime.now().isoformat(),
            'type': 'Typing Anomaly Detected',
            'detail': f'Absurd typing velocity: {typing_speed_avg} CPM'
        })

    # Badges
    badges = []
    if selected_status != 3:
        if score_logic >= 35:
            badges.append('Logic Master')
        if score_ps >= 8:
            badges.append('Problem Solver')
        if score_creativity >= 16:
            badges.append('AI Thinker')
        if score_ai >= 16:
            badges.append('AI Explorer')
        if score_ps >= 9 and score_creativity >= 15:
            badges.append('Prompt Engineer')
        if score_creativity >= 17 and score_ps >= 9:
            badges.append('Innovation Champion')
        if score_final >= 80:
            badges.append('Future Researcher')
        if len(badges) == 0 and score_final >= 65:
            badges.append('AI Aspirant')

    # Update candidate
    candidate["completed"] = True
    candidate["completed_at"] = datetime.now().isoformat()
    candidate["level1_ans"] = json.dumps(level1)
    candidate["level2_ans"] = level2
    candidate["level3_ans"] = level3
    candidate["level4_ans"] = level4
    candidate["level5_ans"] = json.dumps(level5)
    candidate["level6_ans"] = json.dumps(level6)
    candidate["level7_ans"] = level7
    candidate["time_taken"] = time_taken
    candidate["tab_switches"] = tab_switches
    candidate["violation_count"] = violation_count
    candidate["violation_logs"] = json.dumps(violation_logs)
    candidate["backspace_count"] = backspace_count
    candidate["typing_speed_avg"] = round(typing_speed_avg, 2)
    candidate["typing_pattern_variance"] = round(typing_pattern_variance, 2)
    candidate["mouse_moves_count"] = mouse_moves_count
    candidate["idle_duration"] = idle_duration
    candidate["webcam_status"] = webcam_status
    candidate["location_data"] = location_data
    candidate["score_logic"] = round(score_logic, 2)
    candidate["score_creativity"] = round(score_creativity, 2)
    candidate["score_ai_knowledge"] = round(score_ai, 2)
    candidate["score_problem_solving"] = round(score_ps, 2)
    candidate["score_time"] = round(score_time, 2)
    candidate["score_final"] = round(score_final, 2)
    candidate["badges"] = json.dumps(badges)
    candidate["selected"] = selected_status

    save_db(db)
    audit_log('challenge_submitted', session['user_email'], {'score': score_final})

    return jsonify({
        'message': 'Challenge submitted successfully',
        'status': 'Disqualified' if selected_status == 3 else 'Success',
        'scores': {
            'logic': round(score_logic, 2),
            'creativity': round(score_creativity, 2),
            'ai_knowledge': round(score_ai, 2),
            'problem_solving': round(score_ps, 2),
            'time': round(score_time, 2),
            'final': round(score_final, 2)
        },
        'badges': badges,
        'violation_count': violation_count,
        'selected': selected_status
    })

@app.route('/api/leaderboard', methods=['GET'])
def leaderboard():
    """Get top 10 leaderboard entries"""
    db = load_db()
    valid = [c for c in db['candidates'] if c.get('selected') != 3 and c.get('completed')]
    valid.sort(key=lambda c: (-c.get('score_final', 0), c.get('time_taken', 99999)))
    
    return jsonify([{
        "name": c.get('name'),
        "college": c.get('college'),
        "score_final": c.get('score_final'),
        "badges": json.loads(c.get('badges', '[]')) if c.get('badges') else [],
        "created_at": c.get('created_at')
    } for c in valid[:10]])

# ===== ADMIN APIs =====

@app.route('/api/admin/login', methods=['POST'])
def admin_login():
    """Admin login with rate limiting"""
    data = request.json or {}
    username = sanitize_input(data.get('username', ''))
    password = data.get('password', '')

    if not username or not password:
        return jsonify({'error': 'Username and password required'}), 400

    # Rate limiting for admin
    ip_key = f"admin_{request.remote_addr}"
    if is_rate_limited(ip_key, max_attempts=3, lockout_minutes=15):
        return jsonify({'error': 'Too many attempts. Try again later.'}), 429

    db = load_db()
    admin = next((a for a in db['admins'] if a.get('username') == username), None)
    
    if not admin or not verify_password(password, admin.get('password_hash', '')):
        record_login_attempt(ip_key, success=False)
        audit_log('admin_login_failed', username, {'ip': request.remote_addr})
        return jsonify({'error': 'Invalid credentials'}), 401

    record_login_attempt(ip_key, success=True)
    session['admin_logged_in'] = True
    session['admin_username'] = username
    session.permanent = True
    
    audit_log('admin_login', username)
    return jsonify({'success': True})

@app.route('/api/admin/logout', methods=['POST'])
@admin_required
def admin_logout():
    """Admin logout"""
    username = session.get('admin_username')
    audit_log('admin_logout', username)
    session.pop('admin_logged_in', None)
    session.pop('admin_username', None)
    return jsonify({'success': True})

@app.route('/api/admin/publish_status', methods=['GET'])
def get_publish_status():
    """Get current results publishing status"""
    db = load_db()
    return jsonify({'results_published': db.get('results_published', False)})

@app.route('/api/admin/toggle_publish', methods=['POST'])
@admin_required
def toggle_publish():
    """Toggle results publishing status"""
    db = load_db()
    current = db.get('results_published', False)
    db['results_published'] = not current
    save_db(db)
    audit_log('toggle_publish', session.get('admin_username'), {'published': not current})
    return jsonify({'success': True, 'results_published': not current})

@app.route('/api/admin/candidates', methods=['GET'])
@admin_required
def get_candidates():
    """Get all candidates with filtering"""
    sort_by = request.args.get('sort_by', 'score')
    college_filter = sanitize_input(request.args.get('college', ''))
    status_filter = request.args.get('status', '')

    db = load_db()
    candidates = db['candidates']

    # Apply filters
    if college_filter:
        candidates = [c for c in candidates if college_filter.lower() in c.get('college', '').lower()]
    
    if status_filter:
        status_map = {
            'shortlisted': 1,
            'waitlisted': 0,
            'rejected': 2,
            'disqualified': 3,
            'pending': 0
        }
        if status_filter in status_map:
            candidates = [c for c in candidates if c.get('selected') == status_map[status_filter]]

    # Sort
    sort_map = {
        'score': lambda c: (-c.get('score_final', 0), c.get('time_taken', 99999)),
        'time': lambda c: (c.get('time_taken', 99999), -c.get('score_final', 0)),
        'creativity': lambda c: (-c.get('score_creativity', 0), -c.get('score_final', 0)),
        'name': lambda c: (c.get('name', '').lower(), -c.get('score_final', 0))
    }
    candidates.sort(key=sort_map.get(sort_by, sort_map['score']))

    # Process response
    result = []
    for c in candidates:
        c_data = dict(c)
        c_data.pop('password_hash', None)
        
        # Parse JSON fields
        for field in ['badges', 'violation_logs']:
            try:
                if field in c_data and c_data[field]:
                    c_data[field] = json.loads(c_data[field])
                else:
                    c_data[field] = [] if field == 'badges' else []
            except:
                c_data[field] = [] if field == 'badges' else []
        
        result.append(c_data)

    return jsonify(result)

@app.route('/api/admin/auto_shortlist', methods=['POST'])
@admin_required
def auto_shortlist():
    """Auto-shortlist top 30 candidates"""
    db = load_db()
    
    # Reset all selections (keep disqualified)
    for c in db['candidates']:
        if c.get('selected') != 3:
            c['selected'] = 0

    # Sort by score
    eligible = [c for c in db['candidates'] if c.get('selected') != 3 and c.get('completed')]
    eligible.sort(key=lambda c: (-c.get('score_final', 0), c.get('time_taken', 99999)))

    # Shortlist top 30
    for c in eligible[:30]:
        c['selected'] = 1

    save_db(db)
    audit_log('auto_shortlist', session.get('admin_username'), {'count': min(30, len(eligible))})

    return jsonify({
        'success': True,
        'message': f'Top {min(30, len(eligible))} candidates shortlisted'
    })

@app.route('/api/admin/toggle_selection', methods=['POST'])
@admin_required
def toggle_selection():
    """Toggle selection status for a candidate"""
    data = request.json or {}
    candidate_id = data.get('candidate_id')
    selected = data.get('selected')

    if candidate_id is None or selected is None:
        return jsonify({'error': 'Missing parameters'}), 400

    if selected not in [0, 1, 2, 3]:
        return jsonify({'error': 'Invalid selection status'}), 400

    db = load_db()
    candidate = get_candidate_by_id(candidate_id)
    
    if not candidate:
        return jsonify({'error': 'Candidate not found'}), 404

    candidate['selected'] = selected
    save_db(db)
    
    audit_log('toggle_selection', session.get('admin_username'), {
        'candidate': candidate_id,
        'status': selected
    })

    return jsonify({'success': True})

@app.route('/api/admin/stats', methods=['GET'])
@admin_required
def admin_stats():
    """Get admin dashboard statistics"""
    db = load_db()
    candidates = db['candidates']
    
    total = len(candidates)
    completed = sum(1 for c in candidates if c.get('completed'))
    shortlisted = sum(1 for c in candidates if c.get('selected') == 1)
    disqualified = sum(1 for c in candidates if c.get('selected') == 3)
    
    avg_score = 0
    if completed > 0:
        avg_score = sum(c.get('score_final', 0) for c in candidates if c.get('completed')) / completed
    
    # College distribution
    college_dist = {}
    for c in candidates:
        college = c.get('college', 'Unknown')
        college_dist[college] = college_dist.get(college, 0) + 1
    
    return jsonify({
        'total': total,
        'completed': completed,
        'shortlisted': shortlisted,
        'disqualified': disqualified,
        'avg_score': round(avg_score, 2),
        'college_distribution': college_dist
    })

# ===== ERROR HANDLERS =====

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Resource not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

# ===== MAIN =====

if __name__ == '__main__':
    # Create initial admin if needed
    db = load_db()
    if not db.get('admins'):
        db['admins'] = [
            {"username": "admin", "password_hash": hash_password("admin2026")}
        ]
        save_db(db)
    
    # Generate secret key if not set
    if not os.environ.get('SECRET_KEY'):
        print("⚠️ Warning: SECRET_KEY not set. Using default. Set it for production!")
    
    print("🚀 AI Next Gen Backend Server")
    print("📁 Database: MongoDB Atlas")
    print("🔑 Default Admin: admin / admin2026")
    print(f"🌐 Server running on http://localhost:5000")
    
    app.run(debug=True, host='0.0.0.0', port=5000)