import os
import json
import random
import uuid
from flask import Flask, request, jsonify, render_template, redirect, url_for, session

app = Flask(__name__)
app.secret_key = 'ai_next_gen_secret_key_2026'
DATABASE_FILE = 'database.json'

def load_db():
    if not os.path.exists(DATABASE_FILE):
        # Initialize default structure
        db = {
            "candidates": [],
            "admins": [
                {"username": "admin", "password": "admin2026"}
            ]
        }
        save_db(db)
        return db
    try:
        with open(DATABASE_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        # Fallback if file is corrupted
        db = {
            "candidates": [],
            "admins": [
                {"username": "admin", "password": "admin2026"}
            ]
        }
        save_db(db)
        return db

def save_db(db):
    with open(DATABASE_FILE, 'w', encoding='utf-8') as f:
        json.dump(db, f, indent=4)

# Initialize database file on startup
load_db()

def generate_candidate_id(db):
    while True:
        num = random.randint(1000, 9999)
        c_id = f"AI26-{num}"
        # Check uniqueness
        exists = any(c.get('candidate_id') == c_id for c in db['candidates'])
        if not exists:
            return c_id

@app.route('/')
def index():
    return render_template('index.html')

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

# --- API Endpoints ---

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json or {}
    name = data.get('name', '').strip()
    college = data.get('college', '').strip()
    department = data.get('department', '').strip()
    year = data.get('year')
    roll_number = data.get('roll_number', '').strip()
    email = data.get('email', '').strip().lower()
    phone = data.get('phone', '').strip()
    linkedin = data.get('linkedin', '').strip()
    github = data.get('github', '').strip()

    if not (name and college and department and year and roll_number and email and phone):
        return jsonify({'error': 'Missing required fields'}), 400

    db = load_db()
    
    # Check duplicate email
    if any(c.get('email') == email for c in db['candidates']):
        return jsonify({'error': 'Candidate with this email already exists'}), 400

    c_id = generate_candidate_id(db)
    s_id = str(uuid.uuid4())

    new_candidate = {
        "id": len(db['candidates']) + 1,
        "candidate_id": c_id,
        "session_id": s_id,
        "name": name,
        "college": college,
        "department": department,
        "year": year,
        "roll_number": roll_number,
        "email": email,
        "phone": phone,
        "linkedin": linkedin,
        "github": github,
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
        "created_at": str(uuid.uuid4()) # simple identifier for timestamp/order
    }

    db['candidates'].append(new_candidate)
    save_db(db)

    return jsonify({
        'message': 'Registration successful',
        'candidate_id': c_id,
        'session_id': s_id,
        'db_id': new_candidate['id']
    })

@app.route('/api/submit_challenge', methods=['POST'])
def submit_challenge():
    data = request.json or {}
    candidate_id = data.get('candidate_id')
    
    if not candidate_id:
        return jsonify({'error': 'Candidate ID is required'}), 400

    db = load_db()
    candidate = next((c for c in db['candidates'] if c.get('candidate_id') == candidate_id), None)
    
    if not candidate:
        return jsonify({'error': 'Candidate not found'}), 404

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

    # --- SCORING HEURISTICS ---
    score_logic = 0.0
    
    l1_q1 = str(level1.get('q1', '')).strip()
    if l1_q1 == '63' or l1_q1 == '▽':
        score_logic += 10.0
        
    l1_q2 = str(level1.get('q2', '')).strip().upper()
    if l1_q2 == 'ML' or l1_q2 == '63':
        score_logic += 10.0
        
    l2_ans = str(level2).strip().lower()
    if 'electric' in l2_ans or 'no smoke' in l2_ans or 'nowhere' in l2_ans or '17' in l2_ans:
        score_logic += 10.0
        
    l6_q1 = str(level6.get('q1', '')).strip()
    if l6_q1 == '3':
        score_logic += 10.0

    # Creativity
    score_creativity = 0.0
    l3_text = str(level3).strip().lower()
    l3_len = len(l3_text)
    if l3_len > 30:
        keywords_l3 = ['collaborate', 'pipeline', 'consensus', 'cross-check', 'refine', 
                       'strength', 'critique', 'agents', 'compare', 'prompt', 'verify', 'cursor']
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
        has_structure = 1 if 'role:' in l4_text or 'act as' in l4_text or 'instructions' in l4_text or 'output' in l4_text or 'format' in l4_text else 0
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

    score_final = score_logic + score_creativity + score_ai + score_ps + score_time
    
    selected_status = 0
    if violation_count >= 3:
        selected_status = 3
        score_final = 0.0
    else:
        deduction = min(15.0, violation_count * 3.0)
        score_final = max(0.0, score_final - deduction)

    # Anomaly Typing Check
    if typing_speed_avg > 1500 and (len(l3_text) > 100 or len(l4_text) > 100):
        violation_logs.append({
            'timestamp': 'Submission Audit',
            'type': 'Typing Anomaly Detected',
            'detail': f'Absurd typing velocity: {typing_speed_avg} CPM.'
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

    # Update candidate fields
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

    return jsonify({
        'message': 'Challenge metrics stored successfully',
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
        'violation_count': violation_count
    })

@app.route('/api/leaderboard', methods=['GET'])
def leaderboard():
    db = load_db()
    # Filter non-disqualified candidates
    valid_list = [c for c in db['candidates'] if c.get('selected') != 3]
    # Sort
    valid_list.sort(key=lambda c: (-c.get('score_final', 0), c.get('time_taken', 9999)))
    
    leaderboard_data = []
    for c in valid_list[:10]:
        leaderboard_data.append({
            "name": c.get('name'),
            "college": c.get('college'),
            "score_final": c.get('score_final'),
            "created_at": c.get('created_at')
        })
    return jsonify(leaderboard_data)

# --- Admin API ---

@app.route('/api/admin/login', methods=['POST'])
def admin_login():
    data = request.json or {}
    username = data.get('username')
    password = data.get('password')

    db = load_db()
    admin_user = next((a for a in db['admins'] if a.get('username') == username and a.get('password') == password), None)
    if admin_user:
        session['admin_logged_in'] = True
        return jsonify({'success': True})
    return jsonify({'error': 'Invalid username or password'}), 401

@app.route('/api/admin/logout', methods=['POST'])
def admin_logout():
    session.pop('admin_logged_in', None)
    return jsonify({'success': True})

@app.route('/api/admin/candidates', methods=['GET'])
def get_candidates():
    if 'admin_logged_in' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    sort_by = request.args.get('sort_by', 'score')
    college_filter = request.args.get('college', '').strip()

    db = load_db()
    candidates = db['candidates']

    # Filter
    if college_filter:
        candidates = [c for c in candidates if college_filter.lower() in c.get('college', '').lower()]

    # Sort
    if sort_by == 'time':
        candidates.sort(key=lambda c: (c.get('time_taken', 99999), -c.get('score_final', 0)))
    elif sort_by == 'creativity':
        candidates.sort(key=lambda c: (-c.get('score_creativity', 0), -c.get('score_final', 0)))
    else:
        candidates.sort(key=lambda c: (-c.get('score_final', 0), c.get('time_taken', 99999)))

    # Process badges & violation_logs
    candidates_processed = []
    for candidate in candidates:
        c = dict(candidate)
        try:
            c['badges'] = json.loads(c['badges']) if c['badges'] else []
        except:
            c['badges'] = []
        try:
            c['violation_logs'] = json.loads(c['violation_logs']) if c['violation_logs'] else []
        except:
            c['violation_logs'] = []
        candidates_processed.append(c)

    return jsonify(candidates_processed)

@app.route('/api/admin/auto_shortlist', methods=['POST'])
def auto_shortlist():
    if 'admin_logged_in' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    db = load_db()
    
    # Reset selection status (except disqualified)
    for c in db['candidates']:
        if c.get('selected') != 3:
            c['selected'] = 0

    # Sort non-disqualified candidates
    non_disq = [c for c in db['candidates'] if c.get('selected') != 3]
    non_disq.sort(key=lambda c: (-c.get('score_final', 0), c.get('time_taken', 99999)))

    # Shortlist top 30
    for c in non_disq[:30]:
        c['selected'] = 1

    save_db(db)
    return jsonify({'success': True, 'message': 'Top 30 candidates successfully shortlisted.'})

@app.route('/api/admin/toggle_selection', methods=['POST'])
def toggle_selection():
    if 'admin_logged_in' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.json or {}
    candidate_id = data.get('candidate_id')
    selected = data.get('selected')

    if candidate_id is None or selected is None:
        return jsonify({'error': 'Missing parameters'}), 400

    db = load_db()
    candidate = next((c for c in db['candidates'] if c.get('candidate_id') == candidate_id), None)
    
    if not candidate:
        return jsonify({'error': 'Candidate not found'}), 404

    candidate['selected'] = selected
    save_db(db)
    
    return jsonify({'success': True})

if __name__ == '__main__':
    app.run(debug=True, port=5000)
