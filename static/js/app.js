// State management
let appState = {
    candidateId: null,
    sessionId: null,
    currentLevel: 1,
    totalLevels: 7,
    xp: 0,
    startTime: null,
    totalTimeTaken: 0,
    timerInterval: null,
    tabSwitches: 0,
    violationCount: 0,
    violationLogs: [],
    telemetry: {
        backspaceCount: 0,
        typingSpeedAvg: 0.0,
        typingPatternVariance: 0.0,
        mouseMovesCount: 0,
        idleDuration: 0,
        keyTimes: [] // Track timestamp of keystrokes to compute typing speed/variance
    },
    webcamStatus: 'Active',
    locationData: 'Pending',
    answers: {
        level1: { q1: '', q2: '' },
        level2: '',
        level3: '',
        level4: '',
        level5: { q1: '', q2: '' },
        level6: { q1: '', q2: '' },
        level7: ''
    },
    secretLevelUnlocked: false
};

// UI Panels
const views = {
    landing: document.getElementById('landing-view'),
    register: document.getElementById('register-view'),
    security: document.getElementById('security-view'),
    challenge: document.getElementById('challenge-view'),
    results: document.getElementById('results-view'),
    disqualified: document.getElementById('disqualified-view')
};

// Controls
let activeStream = null;
let wordCountInterval = null;
let lastUserActivity = Date.now();
let telemetryInterval = null;

// Countdown Timer on Hero
function initCountdown() {
    const countdownElement = document.getElementById('days-countdown');
    let totalMinutes = 120;
    let secondsLeft = totalMinutes * 60;
    
    setInterval(() => {
        if (secondsLeft <= 0) {
            countdownElement.textContent = "00h:00m:00s";
            return;
        }
        secondsLeft--;
        const h = Math.floor(secondsLeft / 3600);
        const m = Math.floor((secondsLeft % 3600) / 60);
        const s = secondsLeft % 60;
        countdownElement.textContent = `${h.toString().padStart(2, '0')}h:${m.toString().padStart(2, '0')}m:${s.toString().padStart(2, '0')}s`;
    }, 1000);
}
initCountdown();

// Load Leaderboard on Init
async function loadLeaderboard() {
    const tbody = document.getElementById('leaderboard-body');
    let data = [];
    try {
        const response = await fetch('/api/leaderboard');
        if (response.ok) {
            data = await response.json();
        } else {
            data = getLocalLeaderboard();
        }
    } catch (e) {
        data = getLocalLeaderboard();
    }
    
    if (data && data.length > 0) {
        tbody.innerHTML = '';
        data.forEach((candidate, idx) => {
            const rank = idx + 1;
            let rankClass = `rank-${rank}`;
            if (rank > 3) rankClass = 'rank-other';
            tbody.innerHTML += `
                <tr>
                    <td class="leaderboard-rank ${rankClass}">${rank}</td>
                    <td>${escapeHTML(candidate.name)}</td>
                    <td>${escapeHTML(candidate.college)}</td>
                    <td class="leaderboard-score">${candidate.score_final.toFixed(1)}</td>
                </tr>
            `;
        });
    } else {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No submissions indexed yet. Be the first to apply!</td></tr>`;
    }
}
loadLeaderboard();

function getMockCandidates() {
    return [
        { name: "Pranav Raman", college: "IIT Madras", score_final: 94.2, score_logic: 38.0, score_creativity: 19.0, score_ai_knowledge: 19.0, score_problem_solving: 9.5, score_time: 8.7, time_taken: 360, tab_switches: 0, selected: 1, created_at: new Date().toISOString() },
        { name: "Sanya Sen", college: "BITS Pilani", score_final: 91.5, score_logic: 36.0, score_creativity: 18.0, score_ai_knowledge: 18.0, score_problem_solving: 9.5, score_time: 10.0, time_taken: 290, tab_switches: 0, selected: 1, created_at: new Date().toISOString() },
        { name: "Aditya Nair", college: "NIT Trichy", score_final: 88.0, score_logic: 35.0, score_creativity: 17.5, score_ai_knowledge: 17.0, score_problem_solving: 9.0, score_time: 9.5, time_taken: 330, tab_switches: 0, selected: 1, created_at: new Date().toISOString() },
        { name: "Mira Chatterjee", college: "Delhi Technological University", score_final: 85.4, score_logic: 33.0, score_creativity: 18.0, score_ai_knowledge: 16.5, score_problem_solving: 9.0, score_time: 8.9, time_taken: 385, tab_switches: 1, selected: 1, created_at: new Date().toISOString() },
        { name: "Rohan Das", college: "RV College of Engineering", score_final: 82.1, score_logic: 32.0, score_creativity: 16.0, score_ai_knowledge: 16.0, score_problem_solving: 8.5, score_time: 9.6, time_taken: 310, tab_switches: 1, selected: 0, created_at: new Date().toISOString() }
    ];
}

function getLocalLeaderboard() {
    const raw = localStorage.getItem('candidates');
    let candidates = raw ? JSON.parse(raw) : [];
    if (candidates.length === 0) {
        candidates = getMockCandidates();
        localStorage.setItem('candidates', JSON.stringify(candidates));
    }
    return candidates
        .filter(c => c.selected !== 3) // Exclude disqualified
        .sort((a, b) => b.score_final - a.score_final || a.time_taken - b.time_taken)
        .slice(0, 10);
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

// Switch view helper
function switchView(viewName) {
    Object.keys(views).forEach(key => {
        views[key].classList.remove('active');
    });
    views[viewName].classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Button binds
document.getElementById('btn-landing-apply').addEventListener('click', () => switchView('register'));
document.getElementById('btn-register-back').addEventListener('click', () => switchView('landing'));
document.getElementById('btn-disq-return').addEventListener('click', returnToLanding);

function returnToLanding() {
    // Stop feeds
    if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
    }
    document.getElementById('floating-webcam-feed').style.display = 'none';
    document.getElementById('dynamic-watermark').style.display = 'none';
    
    // Reset state
    appState.violationCount = 0;
    appState.tabSwitches = 0;
    appState.violationLogs = [];
    document.getElementById('violation-display').textContent = `Violations: 0/3`;
    
    switchView('landing');
    loadLeaderboard();
}

// Registration Local Fallback
function registerCandidateLocally(data) {
    const raw = localStorage.getItem('candidates');
    let candidates = raw ? JSON.parse(raw) : [];
    
    if (candidates.some(c => c.email.toLowerCase() === data.email.toLowerCase())) {
        return null;
    }
    
    const candidate_id = `AI26-${Math.floor(1000 + Math.random() * 9000)}`;
    const session_id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
    
    const candidateObj = {
        candidate_id: candidate_id,
        session_id: session_id,
        name: data.name,
        email: data.email,
        phone: data.phone,
        college: data.college,
        department: data.department,
        year: data.year,
        roll_number: data.roll_number,
        linkedin: data.linkedin,
        github: data.github,
        level1_ans: '', level2_ans: '', level3_ans: '', level4_ans: '', level5_ans: '', level6_ans: '', level7_ans: '',
        time_taken: 0,
        tab_switches: 0,
        violation_count: 0,
        violation_logs: '[]',
        backspace_count: 0,
        typing_speed_avg: 0.0,
        typing_pattern_variance: 0.0,
        mouse_moves_count: 0,
        idle_duration: 0,
        webcam_status: 'Active',
        location_data: 'Pending',
        score_logic: 0,
        score_creativity: 0,
        score_ai_knowledge: 0,
        score_problem_solving: 0,
        score_time: 0,
        score_final: 0,
        badges: '[]',
        selected: 0,
        created_at: new Date().toISOString()
    };
    
    candidates.push(candidateObj);
    localStorage.setItem('candidates', JSON.stringify(candidates));
    
    return { candidate_id, session_id };
}

// Registration handler
document.getElementById('registration-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const registrationData = {
        name: document.getElementById('name').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        college: document.getElementById('college').value,
        department: document.getElementById('department').value,
        year: parseInt(document.getElementById('year').value),
        roll_number: document.getElementById('roll_number').value,
        linkedin: document.getElementById('linkedin').value,
        github: document.getElementById('github').value
    };

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(registrationData)
        });
        const result = await response.json();
        
        if (response.ok) {
            appState.candidateId = result.candidate_id;
            appState.sessionId = result.session_id;
            triggerPreTestChecks();
        } else {
            showToast(result.error || 'Registration failed');
        }
    } catch (err) {
        const res = registerCandidateLocally(registrationData);
        if (res) {
            appState.candidateId = res.candidate_id;
            appState.sessionId = res.session_id;
            showToast("Server offline. Initialized local credentials.");
            triggerPreTestChecks();
        } else {
            showToast("Email address is already registered.");
        }
    }
});

// --- Pre-Test Security Screen Checking Logic ---
async function triggerPreTestChecks() {
    switchView('security');
    
    // Reset check styling
    const checkIds = ['chk-webcam', 'chk-mic', 'chk-location', 'chk-cookies', 'chk-resolution', 'chk-latency', 'chk-browser', 'chk-session'];
    checkIds.forEach(id => {
        const el = document.getElementById(id);
        el.textContent = 'Checking...';
        el.className = 'check-status status-checking';
    });

    let webcamOk = false;
    let micOk = false;
    let locationOk = false;
    let resolutionOk = false;
    let cookiesOk = false;
    let latencyOk = false;
    let browserOk = false;
    let sessionOk = false;

    // 1. Webcam & Audio checks
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        activeStream = stream;
        
        // Render to preview video
        const video = document.getElementById('webcam-setup-feed');
        video.srcObject = stream;
        document.getElementById('setup-camera-label').textContent = 'Camera active (Secure Assessment Mode)';
        
        setCheckStatus('chk-webcam', 'PASSED', 'status-passed');
        webcamOk = true;
        setCheckStatus('chk-mic', 'PASSED', 'status-passed');
        micOk = true;
    } catch (err) {
        setCheckStatus('chk-webcam', 'DENIED', 'status-failed');
        setCheckStatus('chk-mic', 'DENIED', 'status-failed');
        appState.webcamStatus = 'Denied';
    }

    // 2. Location Geolocation Check
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                appState.locationData = `${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`;
                setCheckStatus('chk-location', 'VERIFIED', 'status-passed');
                locationOk = true;
            },
            (err) => {
                appState.locationData = 'Denied/Blocked';
                setCheckStatus('chk-location', 'BLOCKED', 'status-failed');
                locationOk = false;
            }
        );
    } else {
        appState.locationData = 'Unsupported';
        setCheckStatus('chk-location', 'UNSUPPORTED', 'status-failed');
    }

    // 3. Cookie check
    if (navigator.cookieEnabled) {
        setCheckStatus('chk-cookies', 'SUPPORTED', 'status-passed');
        cookiesOk = true;
    } else {
        setCheckStatus('chk-cookies', 'DISABLED', 'status-failed');
    }

    // 4. Screen resolution check (hackathon mode layout requires width >= 1024px)
    const w = window.innerWidth || document.documentElement.clientWidth;
    if (w >= 1024) {
        setCheckStatus('chk-resolution', 'OPTIMAL', 'status-passed');
        resolutionOk = true;
    } else {
        setCheckStatus('chk-resolution', `MIN 1024px (Current: ${w}px)`, 'status-failed');
    }

    // 5. Network Speed Check (Mock Simulation)
    setTimeout(() => {
        setCheckStatus('chk-latency', '14ms (Optimal)', 'status-passed');
        latencyOk = true;
        checkAllSecurityStatus();
    }, 1500);

    // 6. Browser compatibility
    const agent = navigator.userAgent;
    if (agent.includes('Chrome') || agent.includes('Safari') || agent.includes('Firefox') || agent.includes('Edge')) {
        setCheckStatus('chk-browser', 'COMPATIBLE', 'status-passed');
        browserOk = true;
    } else {
        setCheckStatus('chk-browser', 'LEGACY BROWSER', 'status-failed');
    }

    // 7. Session Validation check
    if (appState.candidateId && appState.sessionId) {
        setCheckStatus('chk-session', 'AUTHORIZED', 'status-passed');
        sessionOk = true;
    } else {
        setCheckStatus('chk-session', 'UNAUTHORIZED', 'status-failed');
    }

    function checkAllSecurityStatus() {
        // Webcam, mic, and resolution checks are critical block stoppers
        if (webcamOk && micOk && resolutionOk && cookiesOk && sessionOk) {
            document.getElementById('btn-begin-assess').disabled = false;
        } else {
            showToast("Critical pre-test validations failed. Ensure camera and microphone permissions are enabled.");
        }
    }
}

function setCheckStatus(elementId, text, className) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = text;
        el.className = `check-status ${className}`;
    }
}

// Begin Assessment click
document.getElementById('btn-begin-assess').addEventListener('click', () => {
    requestFullscreen();
    switchView('challenge');
    
    // Initiate Watermark text with Candidate ID
    document.getElementById('watermark-content').textContent = `${appState.candidateId} // ${appState.locationData} // ASSESSMENT ACTIVE`;
    document.getElementById('dynamic-watermark').style.display = 'block';
    
    // Start Webcam Feed floating preview
    const floatingVideo = document.getElementById('floating-webcam-feed');
    floatingVideo.srcObject = activeStream;
    floatingVideo.style.display = 'block';
    
    // Setup challenges logic
    appState.currentLevel = 1;
    appState.xp = 0;
    appState.startTime = Date.now();
    appState.violationCount = 0;
    appState.violationLogs = [];
    appState.secretLevelUnlocked = Math.random() < 0.90; // 90% unlock chance
    
    startChallengeTimer();
    loadLevel(1);
    setupAntiCheating();
    startBehaviorTelemetry();
});

// Fullscreen request
function requestFullscreen() {
    const docEl = document.documentElement;
    if (docEl.requestFullscreen) docEl.requestFullscreen().catch(()=>{});
    else if (docEl.webkitRequestFullscreen) docEl.webkitRequestFullscreen().catch(()=>{});
}

// Challenge Timers
function startChallengeTimer() {
    const timerElement = document.getElementById('challenge-timer');
    appState.timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - appState.startTime) / 1000);
        const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const secs = (elapsed % 60).toString().padStart(2, '0');
        timerElement.textContent = `${mins}:${secs}`;
        appState.totalTimeTaken = elapsed;
    }, 1000);
}

// Anti Cheating System Monitoring
function setupAntiCheating() {
    // 1. Visibility Blurring focus tracker
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlurFocus);
    window.addEventListener('focus', handleFocusRestore);
    
    // 2. Fullscreen escape tracker
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    
    // 3. Block Right click
    document.addEventListener('contextmenu', preventAction);
    
    // 4. Block Copy & Paste
    document.addEventListener('copy', preventAction);
    document.addEventListener('paste', preventAction);

    // 5. Block standard diagnostic keys and shortcuts
    document.addEventListener('keydown', handleKeyRestrictions);
}

function removeAntiCheating() {
    document.removeEventListener('visibilitychange', handleVisibility);
    window.removeEventListener('blur', handleBlurFocus);
    window.removeEventListener('focus', handleFocusRestore);
    document.removeEventListener('fullscreenchange', handleFullscreenChange);
    document.removeEventListener('contextmenu', preventAction);
    document.removeEventListener('copy', preventAction);
    document.removeEventListener('paste', preventAction);
    document.removeEventListener('keydown', handleKeyRestrictions);
}

function preventAction(e) {
    e.preventDefault();
    logViolation("Copy/Paste/ContextMenu Attempted", "Attempted context action or text alteration.");
    showToast("Action restricted by Lab Anti-Cheat Protocol.");
}

function handleVisibility() {
    if (document.hidden) {
        logViolation("Tab Switch", "Document hidden visibility change.");
        document.getElementById('main-content-wrapper').classList.add('blur-overlay');
    }
}

function handleBlurFocus() {
    logViolation("Window Focus Lost", "Candidate clicked outside assess window.");
    document.getElementById('main-content-wrapper').classList.add('blur-overlay');
}

function handleFocusRestore() {
    document.getElementById('main-content-wrapper').classList.remove('blur-overlay');
}

function handleFullscreenChange() {
    if (!document.fullscreenElement) {
        logViolation("Fullscreen Exited", "Candidate left fullscreen assessment window.");
    }
}

function handleKeyRestrictions(e) {
    // Block F12 (123)
    // Block Ctrl+Shift+I (73 with ctrl and shift)
    // Block Ctrl+U (85)
    // Block Ctrl+R / F5 (refreshes)
    const key = e.keyCode || e.which;
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    
    if (key === 123 || 
        (ctrl && shift && key === 73) || 
        (ctrl && key === 85) || 
        (ctrl && key === 82) || 
        key === 116) {
        
        e.preventDefault();
        logViolation("Shortcut Denied", `Attempted keycode: ${key}`);
        showToast("Keyboard shortcut disabled under lab security policy.");
    }
}

function logViolation(type, detail) {
    appState.violationCount++;
    appState.tabSwitches = appState.violationCount; // mapping tab switch count to display
    
    const timestamp = new Date().toLocaleTimeString();
    appState.violationLogs.push({ timestamp, type, detail });
    
    document.getElementById('violation-display').textContent = `Violations: ${appState.violationCount}/3`;
    showToast(`WARNING: ${type} logged. Security state warning count: ${appState.violationCount}/3.`);
    
    if (appState.violationCount >= 3) {
        disqualifyCandidate();
    }
}

// Disqualification trigger
async function disqualifyCandidate() {
    clearInterval(appState.timerInterval);
    clearInterval(telemetryInterval);
    removeAntiCheating();
    
    // Stop media tracks
    if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
    }
    
    // Hide previews
    document.getElementById('floating-webcam-feed').style.display = 'none';
    document.getElementById('dynamic-watermark').style.display = 'none';
    
    if (document.exitFullscreen) document.exitFullscreen().catch(()=>{});

    // Save disqualified payload (Scores capped at 0)
    const payload = {
        candidate_id: appState.candidateId,
        level1: appState.answers.level1,
        level2: appState.answers.level2,
        level3: appState.answers.level3,
        level4: appState.answers.level4,
        level5: appState.answers.level5,
        level6: appState.answers.level6,
        level7: appState.answers.level7,
        time_taken: appState.totalTimeTaken,
        tab_switches: appState.tabSwitches,
        violation_count: appState.violationCount,
        violation_logs: appState.violationLogs,
        telemetry: {
            backspace_count: appState.telemetry.backspaceCount,
            typing_speed_avg: 0.0, // Capped/Disqualified
            typing_pattern_variance: 0.0,
            mouse_moves_count: appState.telemetry.mouseMovesCount,
            idle_duration: appState.telemetry.idleDuration
        },
        webcam_status: appState.webcamStatus,
        location_data: appState.locationData
    };

    try {
        const response = await fetch('/api/submit_challenge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        // Save locally as disqualified as well
        const raw = localStorage.getItem('candidates');
        const list = raw ? JSON.parse(raw) : [];
        let candidate = list.find(c => c.candidate_id === appState.candidateId);
        if (candidate) {
            candidate.selected = 3; // Disqualified
            candidate.violation_count = appState.violationCount;
            candidate.violation_logs = JSON.stringify(appState.violationLogs);
            candidate.score_final = 0.0;
            localStorage.setItem('candidates', JSON.stringify(list));
        }
    } catch(err) {
        // Fallback local save
        const raw = localStorage.getItem('candidates');
        const list = raw ? JSON.parse(raw) : [];
        let candidate = list.find(c => c.candidate_id === appState.candidateId);
        if (candidate) {
            candidate.selected = 3;
            candidate.violation_count = appState.violationCount;
            candidate.violation_logs = JSON.stringify(appState.violationLogs);
            candidate.score_final = 0.0;
            localStorage.setItem('candidates', JSON.stringify(list));
        }
    }

    switchView('disqualified');
}

// --- Telemetry AI Monitoring Functions ---
function startBehaviorTelemetry() {
    // 1. Mouse movements tracking density
    document.addEventListener('mousemove', () => {
        appState.telemetry.mouseMovesCount++;
        lastUserActivity = Date.now();
    });

    // 2. Key events tracking pattern
    document.addEventListener('keydown', (e) => {
        lastUserActivity = Date.now();
        
        // Backspaces count check
        if (e.keyCode === 8) {
            appState.telemetry.backspaceCount++;
        }
        
        // Track keystroke interval
        appState.telemetry.keyTimes.push(Date.now());
        if (appState.telemetry.keyTimes.length > 50) {
            appState.telemetry.keyTimes.shift(); // keep sliding buffer of last 50 keystrokes
        }
    });

    // 3. Idle duration monitor (runs background interval every 1 second)
    telemetryInterval = setInterval(() => {
        const secSinceActive = Math.floor((Date.now() - lastUserActivity) / 1000);
        if (secSinceActive >= 10) {
            appState.telemetry.idleDuration++;
        }
        
        // Compute active sliding averages of typing velocity (CPM)
        if (appState.telemetry.keyTimes.length > 5) {
            const first = appState.telemetry.keyTimes[0];
            const last = appState.telemetry.keyTimes[appState.telemetry.keyTimes.length - 1];
            const deltaMs = last - first;
            if (deltaMs > 1000) {
                // Keystrokes per minute
                const minutes = deltaMs / 60000;
                const cpm = appState.telemetry.keyTimes.length / minutes;
                appState.telemetry.typingSpeedAvg = Math.round(cpm);
                
                // Typing pattern variance: standard deviation of milliseconds between keystrokes
                let deltas = [];
                for(let i=1; i < appState.telemetry.keyTimes.length; i++) {
                    deltas.push(appState.telemetry.keyTimes[i] - appState.telemetry.keyTimes[i-1]);
                }
                const mean = deltas.reduce((s,v)=>s+v, 0) / deltas.length;
                const variance = deltas.reduce((s,v)=> s + Math.pow(v - mean, 2), 0) / deltas.length;
                appState.telemetry.typingPatternVariance = Math.sqrt(variance);
            }
        }
    }, 1000);
}

// --- Challenges Questions Configurations ---
const levelsData = {
    1: {
        name: "Pattern Recognition",
        xp: 50,
        render: () => `
            <p class="challenge-question">
                <strong>Question 1:</strong> Symbol Matrix reasoning. Solve the visual logic: <br>
                <code style="font-family: var(--font-mono); color: var(--accent-cyan); font-size: 1.2rem; display: block; margin: 1rem 0;">[▲]  [●]  [■]  -->  [▼]  [◌]  [▧]  <br>  [◆]  [★]  [▲]  -->  [◇]  [☆]  [?]</code>
                <div class="option-list">
                    <div class="option-card" onclick="selectOption(this, 'l1-q1', '▼')">
                        <div class="option-dot"></div>
                        <div class="option-text">[▼] (Inverted Solid Triangle)</div>
                    </div>
                    <div class="option-card" onclick="selectOption(this, 'l1-q1', '▽')">
                        <div class="option-dot"></div>
                        <div class="option-text">[▽] (Inverted Outlined Triangle)</div>
                    </div>
                    <div class="option-card" onclick="selectOption(this, 'l1-q1', '▲')">
                        <div class="option-dot"></div>
                        <div class="option-text">[▲] (Standard Triangle)</div>
                    </div>
                </div>
            </p>
            
            <p class="challenge-question" style="margin-top: 2rem;">
                <strong>Question 2:</strong> Complex numerical pattern series. Fill in the blank: <br>
                <code style="font-family: var(--font-mono); color: var(--accent-cyan); font-size: 1.2rem; display: block; margin: 1rem 0;">1, 3, 7, 15, 31, ___</code>
                <input type="text" id="l1-q2" class="text-answer-area" style="min-height: 45px; font-family: var(--font-mono);" placeholder="Enter numerical output...">
            </p>
        `,
        save: () => {
            appState.answers.level1.q2 = document.getElementById('l1-q2').value.trim();
        }
    },
    2: {
        name: "Logical Thinking Riddle",
        xp: 100,
        render: () => `
            <p class="challenge-question">
                Four scientists need to cross a suspension bridge at night back to the MIT Media Lab. 
                They have only one flashlight, and the bridge is structurally damaged and can support only two people at a time. 
                Each scientist walks at a different speed: 
                <br>• Scientist A: 1 minute
                <br>• Scientist B: 2 minutes
                <br>• Scientist C: 5 minutes
                <br>• Scientist D: 10 minutes
                <br>When two walk together, they proceed at the slower person's pace. What is the absolute minimum time (in minutes) required for all four scientists to reach the other side?
            </p>
            <div class="option-list">
                <div class="option-card" onclick="selectOption(this, 'level2', '19')">
                    <div class="option-dot"></div>
                    <div class="option-text">19 minutes</div>
                </div>
                <div class="option-card" onclick="selectOption(this, 'level2', '17')">
                    <div class="option-dot"></div>
                    <div class="option-text">17 minutes (Correct bridge optimization route)</div>
                </div>
                <div class="option-card" onclick="selectOption(this, 'level2', '21')">
                    <div class="option-dot"></div>
                    <div class="option-text">21 minutes</div>
                </div>
                <div class="option-card" onclick="selectOption(this, 'level2', '15')">
                    <div class="option-dot"></div>
                    <div class="option-text">15 minutes</div>
                </div>
            </div>
        `,
        save: () => {}
    },
    3: {
        name: "AI Thinking Challenge",
        xp: 150,
        render: () => `
            <p class="challenge-question">
                You have active API accesses to ChatGPT (large context reasoning), Claude (structural coding), Gemini (web-grounded search), and Cursor (IDE compiler). 
                Describe how you would configure a multi-agent system coordinating these four systems to write, document, test, and automatically host a production-ready application.
            </p>
            <textarea id="l3-ans" class="text-answer-area prompt-textarea" placeholder="Detail your pipeline. Specify roles and verification loops..."></textarea>
        `,
        save: () => {
            appState.answers.level3 = document.getElementById('l3-ans').value.trim();
        }
    },
    4: {
        name: "Prompt Engineering Challenge",
        xp: 200,
        render: () => `
            <p class="challenge-question">
                Write an advanced zero-shot prompt that converts any generic textbook chapter into a structured JSON dataset suitable for training a RAG retrieval system. Incorporate clear constraints, custom XML wrappers, metadata parameters, and formatting constraints.
            </p>
            <textarea id="l4-ans" class="text-answer-area prompt-textarea" style="min-height: 200px;" placeholder="&lt;instructions&gt;&#10;Act as a parser..."></textarea>
        `,
        save: () => {
            appState.answers.level4 = document.getElementById('l4-ans').value.trim();
        }
    },
    5: {
        name: "Modern AI: Fine-Tuning vs RAG",
        xp: 250,
        render: () => `
            <p class="challenge-question">
                <strong>Question 1:</strong> Which architecture relies on updating actual model weights to memorize patterns?
            </p>
            <div class="option-list">
                <div class="option-card" onclick="selectOption(this, 'l5-q1', 'RAG Retrieval')">
                    <div class="option-dot"></div>
                    <div class="option-text">RAG (Retrieval-Augmented Generation)</div>
                </div>
                <div class="option-card" onclick="selectOption(this, 'l5-q1', 'Fine-Tuning')">
                    <div class="option-dot"></div>
                    <div class="option-text">Fine-Tuning Model Weights</div>
                </div>
            </div>
            
            <p class="challenge-question" style="margin-top: 2rem;">
                <strong>Question 2:</strong> A hospital wants an AI system to query proprietary medical records. Explain when they should use Fine-Tuning and when they should use RAG. Use real-world validation criteria.
            </p>
            <textarea id="l5-q2" class="text-answer-area prompt-textarea" placeholder="For private clinical data query, RAG is suited because..."></textarea>
        `,
        save: () => {
            appState.answers.level5.q2 = document.getElementById('l5-q2').value.trim();
        }
    },
    6: {
        name: "Brain puzzle (9-Ball Weighings)",
        xp: 300,
        render: () => `
            <p class="challenge-question">
                <strong>Question 1:</strong> You have 9 identical-looking balls. One is heavier. What is the maximum number of balls you must place on EACH side of a balance scale in the first weighing to guarantee finding the heavy ball in exactly two measurements?
            </p>
            <div class="option-list">
                <div class="option-card" onclick="selectOption(this, 'l6-q1', '3')">
                    <div class="option-dot"></div>
                    <div class="option-text">3 balls per side</div>
                </div>
                <div class="option-card" onclick="selectOption(this, 'l6-q1', '4')">
                    <div class="option-dot"></div>
                    <div class="option-text">4 balls per side</div>
                </div>
            </div>
            
            <p class="challenge-question" style="margin-top: 2rem;">
                <strong>Question 2:</strong> Detail the step-by-step logic demonstrating how the balance scale is used to find the heavier ball in two weighings.
            </p>
            <textarea id="l6-q2" class="text-answer-area prompt-textarea" placeholder="We divide the 9 balls into groups..."></textarea>
        `,
        save: () => {
            appState.answers.level6.q2 = document.getElementById('l6-q2').value.trim();
        }
    },
    7: {
        name: "Secret Vector: Zero-GPU Startup Idea",
        xp: 350,
        render: () => `
            <p class="challenge-question">
                Develop an AI-powered solution concept solving a domain problem with a budget of ₹1000 and NO GPU hosting capabilities. 
                Specify how you leverage existing serverless APIs, free credits, or edge logic.
                <br><span style="color: var(--accent-magenta); font-weight: bold;">Constraints: Max 150 words. Word counter is active.</span>
            </p>
            <textarea id="l7-ans" class="text-answer-area prompt-textarea" placeholder="Our edge startup leverages..."></textarea>
        `,
        save: () => {
            appState.answers.level7 = document.getElementById('l7-ans').value.trim();
        }
    }
};

// Select options binder
function selectOption(element, levelKey, value) {
    const cardContainer = element.parentElement;
    cardContainer.querySelectorAll('.option-card').forEach(card => {
        card.classList.remove('selected');
    });
    element.classList.add('selected');

    if (levelKey === 'l1-q1') {
        appState.answers.level1.q1 = value;
    } else if (levelKey === 'level2') {
        appState.answers.level2 = value;
    } else if (levelKey === 'l5-q1') {
        appState.answers.level5.q1 = value;
    } else if (levelKey === 'l6-q1') {
        appState.answers.level6.q1 = value;
    }
}

// Load current level
function loadLevel(level) {
    document.getElementById('challenge-level-indicator').textContent = `LEVEL ${level} OF ${appState.totalLevels}`;
    
    let levelData = levelsData[level];
    document.getElementById('challenge-level-name').textContent = levelData.name;
    document.getElementById('challenge-xp').textContent = appState.xp;
    
    const progressPercent = ((level - 1) / appState.totalLevels) * 100;
    document.getElementById('challenge-progress-fill').style.width = `${progressPercent}%`;

    const container = document.getElementById('question-render-area');
    container.innerHTML = levelData.render();

    const secretBanner = document.getElementById('secret-level-indicator');
    const wordCounterDisp = document.getElementById('word-counter-display');
    
    if (level === 7) {
        secretBanner.style.display = 'block';
        wordCounterDisp.style.display = 'inline-block';
        initWordCounter();
    } else {
        secretBanner.style.display = 'none';
        wordCounterDisp.style.display = 'none';
        if (wordCountInterval) clearInterval(wordCountInterval);
    }

    const ta = container.querySelector('textarea');
    if (ta) ta.focus();
}

function initWordCounter() {
    const ta = document.getElementById('l7-ans');
    const wordCountNum = document.getElementById('word-count-num');
    
    function countWords() {
        const text = ta.value.trim();
        const words = text ? text.split(/\s+/).length : 0;
        wordCountNum.textContent = words;
        if (words > 150) {
            wordCountNum.style.color = 'var(--accent-red)';
        } else {
            wordCountNum.style.color = 'var(--accent-cyan)';
        }
    }

    ta.addEventListener('input', countWords);
    countWords();
}

// Next level click
document.getElementById('btn-next-level').addEventListener('click', async () => {
    levelsData[appState.currentLevel].save();
    appState.xp += levelsData[appState.currentLevel].xp;
    
    if (appState.currentLevel < appState.totalLevels) {
        if (appState.currentLevel === 6 && !appState.secretLevelUnlocked) {
            submitAllResults();
        } else {
            appState.currentLevel++;
            loadLevel(appState.currentLevel);
        }
    } else {
        submitAllResults();
    }
});

// Final scores submit
async function submitAllResults() {
    clearInterval(appState.timerInterval);
    clearInterval(telemetryInterval);
    removeAntiCheating();

    // Stop streams
    if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
    }
    document.getElementById('floating-webcam-feed').style.display = 'none';
    document.getElementById('dynamic-watermark').style.display = 'none';

    if (document.exitFullscreen) document.exitFullscreen().catch(()=>{});
    
    document.getElementById('question-render-area').innerHTML = `
        <div style="text-align: center; padding: 4rem;">
            <div class="logo-icon" style="margin: 0 auto 2rem auto; width: 50px; height: 50px;"></div>
            <h3 style="font-family: var(--font-futuristic); letter-spacing: 2px;">LOGGING AND ANALYZING VECTORS...</h3>
            <p style="color: var(--text-muted); margin-top: 1rem;">Calculating Logic, Creativity, and AI scores. Applying anti-cheat audit logs.</p>
        </div>
    `;
    document.getElementById('btn-next-level').style.display = 'none';

    const payload = {
        candidate_id: appState.candidateId,
        level1: appState.answers.level1,
        level2: appState.answers.level2,
        level3: appState.answers.level3,
        level4: appState.answers.level4,
        level5: appState.answers.level5,
        level6: appState.answers.level6,
        level7: appState.answers.level7,
        time_taken: appState.totalTimeTaken,
        tab_switches: appState.tabSwitches,
        violation_count: appState.violationCount,
        violation_logs: appState.violationLogs,
        telemetry: {
            backspace_count: appState.telemetry.backspaceCount,
            typing_speed_avg: appState.telemetry.typingSpeedAvg,
            typing_pattern_variance: appState.telemetry.typingPatternVariance,
            mouse_moves_count: appState.telemetry.mouseMovesCount,
            idle_duration: appState.telemetry.idleDuration
        },
        webcam_status: appState.webcamStatus,
        location_data: appState.locationData
    };

    try {
        const response = await fetch('/api/submit_challenge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        
        if (response.ok) {
            renderResults(result);
            switchView('results');
        } else {
            showToast("Failed to compile score profile. Running local calculator...");
            runLocalScoringFallback(payload);
        }
    } catch (e) {
        showToast("Server offline. Running local calculator...");
        runLocalScoringFallback(payload);
    }
}

// Local scoring logic
function runLocalScoringFallback(payload) {
    let score_logic = 0.0;
    
    // Level 1
    const l1_q1 = String(payload.level1.q1 || '').trim();
    if (l1_q1 === '▽') score_logic += 10.0;
    
    const l1_q2 = String(payload.level1.q2 || '').trim();
    if (l1_q2 === '63') score_logic += 10.0;
    
    // Level 2
    const l2_ans = String(payload.level2 || '').toLowerCase();
    if (l2_ans === '17') {
        score_logic += 10.0;
    }
    
    // Level 6 Q1
    const l6_q1 = String(payload.level6.q1 || '').trim();
    if (l6_q1 === '3') score_logic += 10.0;

    // Creativity
    let score_creativity = 0.0;
    
    const l3_text = String(payload.level3 || '').trim().toLowerCase();
    const l3_len = l3_text.length;
    if (l3_len > 30) {
        const keywords_l3 = ['collaborate', 'pipeline', 'consensus', 'cross-check', 'refine', 'strength', 'critique', 'agents', 'compare', 'prompt', 'verify', 'cursor'];
        const match_count = keywords_l3.reduce((sum, kw) => sum + (l3_text.includes(kw) ? 1 : 0), 0);
        const len_score = Math.min(4.0, (l3_len / 150) * 4);
        const kw_score = Math.min(6.0, match_count * 1.5);
        score_creativity += (len_score + kw_score);
    }

    const l7_text = String(payload.level7 || '').trim().toLowerCase();
    const l7_len = l7_text.length;
    if (l7_len > 30) {
        const keywords_l7 = ['smart', 'sensor', 'detection', 'automation', 'real-time', 'predictive', 'efficiency', 'improve', 'healthcare', 'farming', 'traffic', 'education', 'cybersecurity', 'optimize', 'solution', '₹1000', 'no gpu'];
        const match_count_l7 = keywords_l7.reduce((sum, kw) => sum + (l7_text.includes(kw) ? 1 : 0), 0);
        
        const words = l7_text.split(/\s+/);
        let word_penalty = 1.0;
        if (words.length > 150) {
            word_penalty = Math.max(0.5, 1.0 - ((words.length - 150) / 100));
        }
        
        const len_score_l7 = Math.min(4.0, (l7_len / 200) * 4);
        const kw_score_l7 = Math.min(6.0, match_count_l7 * 1.5);
        score_creativity += (len_score_l7 + kw_score_l7) * word_penalty;
    }
    score_creativity = Math.min(20.0, score_creativity);

    // AI Knowledge
    let score_ai = 0.0;
    
    // Level 5 MCQ
    const l5_q1 = String(payload.level5.q1 || '').trim().toLowerCase();
    if (l5_q1.includes('fine-tuning')) score_ai += 10.0;
    
    const l5_q2 = String(payload.level5.q2 || '').trim().toLowerCase();
    const l5_q2_len = l5_q2.length;
    if (l5_q2_len > 30) {
        const keywords_rag = ['retrieve', 'retrieval', 'augmented', 'generation', 'database', 'vector', 'embeddings', 'context', 'similarity', 'external', 'source', 'prompt', 'fine-tuning', 'weights'];
        const match_rag = keywords_rag.reduce((sum, kw) => sum + (l5_q2.includes(kw) ? 1 : 0), 0);
        const len_score_rag = Math.min(4.0, (l5_q2_len / 150) * 4);
        const kw_score_rag = Math.min(6.0, match_rag * 1.5);
        score_ai += Math.min(10.0, len_score_rag + kw_score_rag);
    }
    score_ai = Math.min(20.0, score_ai);

    // Problem Solving
    let score_ps = 0.0;
    
    const l4_text = String(payload.level4 || '').trim().toLowerCase();
    const l4_len = l4_text.length;
    if (l4_len > 40) {
        const has_tags = (l4_text.includes('<') && l4_text.includes('>')) || (l4_text.includes('[') && l4_text.includes(']')) ? 1.0 : 0.0;
        const has_structure = l4_text.includes('role:') || l4_text.includes('act as') || l4_text.includes('instructions') || l4_text.includes('output') || l4_text.includes('format') ? 1.0 : 0.0;
        const keywords_prompt = ['persona', 'context', 'constraint', 'variable', 'template', 'layout', 'design', 'bootstrap', 'css', 'javascript', 'section'];
        const match_prompt = keywords_prompt.reduce((sum, kw) => sum + (l4_text.includes(kw) ? 1 : 0), 0);
        
        const len_score_p = Math.min(3.0, (l4_len / 200) * 3);
        const struct_score = (has_tags * 2.0) + (has_structure * 2.0);
        const kw_score_p = Math.min(3.0, match_prompt * 0.75);
        score_ps += (len_score_p + struct_score + kw_score_p);
    }
    score_ps = Math.min(10.0, score_ps);

    // Time
    let score_time = 0.0;
    if (payload.time_taken <= 400) {
        score_time = 10.0;
    } else if (payload.time_taken >= 1200) {
        score_time = 2.0;
    } else {
        score_time = 10.0 - ((payload.time_taken - 400) / 800) * 8.0;
    }

    // Final Calculations
    let score_final = score_logic + score_creativity + score_ai + score_ps + score_time;
    
    // Deduct switches
    const cheated = payload.violation_count >= 3;
    let selected_status = 0;
    if (cheated) {
        selected_status = 3;
        score_final = 0.0;
    } else {
        const deduction = Math.min(15.0, payload.violation_count * 3.0);
        score_final = Math.max(0.0, score_final - deduction);
    }

    // Badges
    const badges = [];
    if (selected_status !== 3) {
        if (score_logic >= 35) badges.push('Logic Master');
        if (score_ps >= 8) badges.push('Problem Solver');
        if (score_creativity >= 16) badges.push('AI Thinker');
        if (score_ai >= 16) badges.push('AI Explorer');
        if (score_ps >= 9 && score_creativity >= 15) badges.push('Prompt Engineer');
        if (score_creativity >= 17 && score_ps >= 9) badges.push('Innovation Champion');
        if (score_final >= 80) badges.push('Future Researcher');
    }

    // Save candidate status locally
    const raw = localStorage.getItem('candidates');
    const list = raw ? JSON.parse(raw) : [];
    let candidate = list.find(c => c.candidate_id === payload.candidate_id);
    if (!candidate) {
        candidate = { candidate_id: payload.candidate_id, name: 'Local User', email: 'local@user.com', college: 'Lab Sandbox', department: 'R&D', year: 1, roll_number: 'LOCAL' };
        list.push(candidate);
    }
    
    candidate.level1_ans = JSON.stringify(payload.level1);
    candidate.level2_ans = payload.level2;
    candidate.level3_ans = payload.level3;
    candidate.level4_ans = payload.level4;
    candidate.level5_ans = JSON.stringify(payload.level5);
    candidate.level6_ans = JSON.stringify(payload.level6);
    candidate.level7_ans = payload.level7;
    candidate.time_taken = payload.time_taken;
    candidate.tab_switches = payload.tab_switches;
    candidate.violation_count = payload.violation_count;
    candidate.violation_logs = JSON.stringify(payload.violation_logs);
    candidate.backspace_count = payload.telemetry.backspace_count;
    candidate.typing_speed_avg = payload.telemetry.typing_speed_avg;
    candidate.typing_pattern_variance = payload.telemetry.typing_pattern_variance;
    candidate.mouse_moves_count = payload.telemetry.mouse_moves_count;
    candidate.idle_duration = payload.telemetry.idle_duration;
    candidate.webcam_status = payload.webcam_status;
    candidate.location_data = payload.location_data;
    candidate.score_logic = score_logic;
    candidate.score_creativity = score_creativity;
    candidate.score_ai_knowledge = score_ai;
    candidate.score_problem_solving = score_ps;
    candidate.score_time = score_time;
    candidate.score_final = score_final;
    candidate.badges = JSON.stringify(badges);
    candidate.selected = selected_status;
    
    localStorage.setItem('candidates', JSON.stringify(list));

    if (selected_status === 3) {
        switchView('disqualified');
    } else {
        const result = {
            scores: {
                logic: score_logic,
                creativity: score_creativity,
                ai_knowledge: score_ai,
                problem_solving: score_ps,
                time: score_time,
                final: score_final
            },
            badges: badges,
            violation_count: payload.violation_count
        };
        renderResults(result);
        switchView('results');
    }
}

// Render Results Panel
let radarChartInstance = null;

function renderResults(result) {
    const scores = result.scores;
    const badges = result.badges;
    
    document.getElementById('res-final-score').textContent = scores.final.toFixed(1);
    
    const badgesContainer = document.getElementById('unlocked-badges');
    badgesContainer.innerHTML = '';
    if (badges && badges.length > 0) {
        badges.forEach(badge => {
            let icon = '🏆';
            if (badge === 'Logic Master') icon = '🧠';
            else if (badge === 'Problem Solver') icon = '⚡';
            else if (badge === 'AI Explorer') icon = '🔍';
            else if (badge === 'Future Researcher') icon = '📡';
            else if (badge === 'Prompt Engineer') icon = '💻';
            else if (badge === 'AI Thinker') icon = '💡';
            else if (badge === 'Innovation Champion') icon = '🚀';
            
            badgesContainer.innerHTML += `
                <div class="badge-item">${icon} ${badge}</div>
            `;
        });
    } else {
        badgesContainer.innerHTML = `<span style="color: var(--text-muted); font-size: 0.85rem;">No badges earned. Review queue criteria pending.</span>`;
    }

    const computedIQ = Math.min(160, Math.round(90 + (scores.final * 0.7)));
    document.getElementById('res-iq-val').textContent = computedIQ;
    setTimeout(() => {
        const percent = ((computedIQ - 70) / (160 - 70)) * 100;
        document.getElementById('res-iq-fill').style.width = `${percent}%`;
    }, 500);

    updateBreakdownRow('logic', scores.logic, 40);
    updateBreakdownRow('creativity', scores.creativity, 20);
    updateBreakdownRow('ai', scores.ai_knowledge, 20);
    updateBreakdownRow('ps', scores.problem_solving, 10);
    updateBreakdownRow('time', scores.time, 10);

    // Radar mapping Chart.js config
    const ctx = document.getElementById('radarChart').getContext('2d');
    if (radarChartInstance) {
        radarChartInstance.destroy();
    }

    const radarData = [
        (scores.logic / 40) * 100,
        (scores.creativity / 20) * 100,
        (scores.ai_knowledge / 20) * 100,
        (scores.problem_solving / 10) * 100,
        (scores.time / 10) * 100
    ];

    radarChartInstance = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['Logic', 'Creativity', 'AI Literacy', 'Problem Solving', 'Time Management'],
            datasets: [{
                label: 'Cognitive Vector Profile',
                data: radarData,
                backgroundColor: 'rgba(0, 240, 255, 0.15)',
                borderColor: '#00f0ff',
                pointBackgroundColor: '#6366f1',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: '#00f0ff',
                borderWidth: 2
            }]
        },
        options: {
            scales: {
                r: {
                    angleLines: { color: 'rgba(255, 255, 255, 0.1)' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    pointLabels: {
                        color: '#94a3b8',
                        font: { family: 'Orbitron', size: 9 }
                    },
                    ticks: { display: false, maxTicksLimit: 5 },
                    min: 0,
                    max: 100
                }
            },
            plugins: { legend: { display: false } },
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function updateBreakdownRow(idKey, score, maxScore) {
    const percent = (score / maxScore) * 100;
    document.getElementById(`bar-${idKey}`).style.width = `${percent}%`;
    document.getElementById(`val-${idKey}`).textContent = `${score.toFixed(1)} / ${maxScore}`;
}

// Restart click
document.getElementById('btn-restart').addEventListener('click', () => {
    document.getElementById('btn-next-level').style.display = 'inline-flex';
    switchView('landing');
    loadLeaderboard();
});

// Toast alert
function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}
