let appState = {
    candidateId: null,
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
        keyTimes: []
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

let activeStream = null;
let wordCountInterval = null;
let lastUserActivity = Date.now();
let telemetryInterval = null;

// UI elements
const questionArea = document.getElementById('question-render-area');
const btnNext = document.getElementById('btn-next-level');
const progressFill = document.getElementById('challenge-progress-fill');
const xpCounter = document.getElementById('challenge-xp');
const timerVal = document.getElementById('challenge-timer');
const violationDisplay = document.getElementById('violation-display');

// Initialize Challenge Room
async function initChallengeRoom() {
    try {
        const response = await fetch('/api/session');
        const data = await response.json();
        
        if (response.ok && data.logged_in) {
            appState.candidateId = data.candidate.candidate_id;
            appState.locationData = data.candidate.location_data || 'Pending';
            // Start setup checking
            loadSecurityChecksScreen();
        } else {
            window.location.href = '/login';
        }
    } catch(err) {
        // Fallback local session checking
        const email = localStorage.getItem('active_session_email');
        if (!email) {
            window.location.href = '/login';
            return;
        }
        
        const raw = localStorage.getItem('candidates');
        const list = raw ? JSON.parse(raw) : [];
        const candidate = list.find(c => c.email.toLowerCase() === email.toLowerCase());
        
        if (candidate) {
            appState.candidateId = candidate.candidate_id;
            appState.locationData = candidate.location_data || 'Pending';
            loadSecurityChecksScreen();
        } else {
            window.location.href = '/login';
        }
    }
}
initChallengeRoom();

// Render Pre-Assessment Device Check inside question-render-area
function loadSecurityChecksScreen() {
    // Hide standard next buttons
    btnNext.style.display = 'none';
    progressFill.style.width = '0%';
    
    questionArea.innerHTML = `
        <h2 class="form-title" style="color: var(--accent-cyan); font-size:1.4rem; text-align:left; margin-bottom: 0.5rem;">PRE-ASSESSMENT SETUP</h2>
        <p class="form-subtitle" style="text-align:left; margin-bottom: 1.5rem;">Verify candidate coordinates and camera authorization before starting missions.</p>
        
        <div class="camera-preview-container">
            <video id="webcam-setup-feed" style="width:100%; height:100%; object-fit:cover;" autoplay muted playsinline></video>
            <div class="setup-status-overlay" id="setup-camera-label">Webcam preview offline</div>
        </div>

        <div class="security-check-grid" style="margin-top: 1.5rem;">
            <div class="security-check-card"><span class="check-name">Webcam Monitor</span><span class="check-status status-checking" id="chk-webcam">Checking...</span></div>
            <div class="security-check-card"><span class="check-name">Audio Feed</span><span class="check-status status-checking" id="chk-mic">Checking...</span></div>
            <div class="security-check-card"><span class="check-name">Location Verification</span><span class="check-status status-checking" id="chk-location">Checking...</span></div>
            <div class="security-check-card"><span class="check-name">Cookie Authorization</span><span class="check-status status-checking" id="chk-cookies">Checking...</span></div>
            <div class="security-check-card"><span class="check-name">Resolution size</span><span class="check-status status-checking" id="chk-resolution">Checking...</span></div>
            <div class="security-check-card"><span class="check-name">Network Latency</span><span class="check-status status-checking" id="chk-latency">Checking...</span></div>
        </div>

        <div class="warning-box" style="margin-top: 2rem; border-color: rgba(239, 68, 68, 0.25);">
            <div>
                <div class="warning-title" style="color: var(--accent-red)">ASSESSMENT MONITORED ENVIRONMENT</div>
                Tab switching, screenshot commands, copy-paste, and keyboard triggers are monitored. Exceeding 3 alerts triggers auto-disqualification.
            </div>
        </div>

        <div style="text-align:center; margin-top:2rem;">
            <button class="btn-futuristic" id="btn-begin-assessment-missions" disabled>Begin Assessment Missions</button>
        </div>
    `;

    runSecurityValidations();
}

async function runSecurityValidations() {
    let webcamOk = false;
    let micOk = false;
    let locationOk = false;
    let resolutionOk = false;
    let cookiesOk = false;
    let latencyOk = false;

    // 1. Camera & Mic request
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        activeStream = stream;
        
        const video = document.getElementById('webcam-setup-feed');
        if (video) {
            video.srcObject = stream;
            document.getElementById('setup-camera-label').textContent = 'Webcam stream active';
        }
        
        setCheckStatus('chk-webcam', 'PASSED', 'status-passed');
        webcamOk = true;
        setCheckStatus('chk-mic', 'PASSED', 'status-passed');
        micOk = true;
    } catch(err) {
        setCheckStatus('chk-webcam', 'DENIED', 'status-failed');
        setCheckStatus('chk-mic', 'DENIED', 'status-failed');
        appState.webcamStatus = 'Denied';
    }

    // 2. Geolocation coordinates
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                appState.locationData = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
                setCheckStatus('chk-location', 'VERIFIED', 'status-passed');
                locationOk = true;
            },
            () => {
                appState.locationData = 'Denied/Blocked';
                setCheckStatus('chk-location', 'BLOCKED', 'status-failed');
                locationOk = false;
            }
        );
    } else {
        appState.locationData = 'Unsupported';
        setCheckStatus('chk-location', 'UNSUPPORTED', 'status-failed');
    }

    // 3. Cookies check
    if (navigator.cookieEnabled) {
        setCheckStatus('chk-cookies', 'SUPPORTED', 'status-passed');
        cookiesOk = true;
    } else {
        setCheckStatus('chk-cookies', 'DISABLED', 'status-failed');
    }

    // 4. Resolution check (Desktop hackathon dimensions)
    const w = window.innerWidth;
    if (w >= 1024) {
        setCheckStatus('chk-resolution', 'OPTIMAL', 'status-passed');
        resolutionOk = true;
    } else {
        setCheckStatus('chk-resolution', `MIN 1024px (${w}px)`, 'status-failed');
    }

    // 5. Latency mock
    setTimeout(() => {
        setCheckStatus('chk-latency', '18ms (Optimal)', 'status-passed');
        latencyOk = true;
        
        // Check if critical items passed
        if (webcamOk && micOk && resolutionOk && cookiesOk) {
            const startBtn = document.getElementById('btn-begin-assessment-missions');
            if (startBtn) {
                startBtn.disabled = false;
                startBtn.addEventListener('click', startMissionsChallenge);
            }
        } else {
            showToast("Critical checks failed. Ensure webcam and microphone permissions are enabled.");
        }
    }, 1500);
}

function setCheckStatus(id, text, className) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = text;
        el.className = `check-status ${className}`;
    }
}

// Start Challenge Arena Missions
function startMissionsChallenge() {
    requestFullscreen();
    
    // Watermark Candidate ID
    document.getElementById('watermark-content').textContent = `${appState.candidateId} // ${appState.locationData} // ASSESSMENT IN PROGRESS`;
    document.getElementById('dynamic-watermark').style.display = 'block';
    
    // Floating webcam stream
    const floatingVideo = document.getElementById('floating-webcam-feed');
    floatingVideo.srcObject = activeStream;
    floatingVideo.style.display = 'block';

    // Rework standard UI
    btnNext.style.display = 'inline-flex';
    
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
}

function requestFullscreen() {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(()=>{});
}

// Timer
function startChallengeTimer() {
    appState.timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - appState.startTime) / 1000);
        const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const secs = (elapsed % 60).toString().padStart(2, '0');
        timerVal.textContent = `${mins}:${secs}`;
        appState.totalTimeTaken = elapsed;
    }, 1000);
}

// Anti Cheating Viewport Monitor
function setupAntiCheating() {
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlurFocus);
    window.addEventListener('focus', handleFocusRestore);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('contextmenu', preventAction);
    document.addEventListener('copy', preventAction);
    document.addEventListener('paste', preventAction);
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
    logViolation("Security Action Denied", "Copy/paste or context menu trigger blocked.");
}

function handleVisibility() {
    if (document.hidden) {
        logViolation("Tab Switch", "Candidate minimized window or switched viewport tabs.");
        document.getElementById('main-content-wrapper').classList.add('blur-overlay');
    }
}

function handleBlurFocus() {
    logViolation("Window focus lost", "Window context changed.");
    document.getElementById('main-content-wrapper').classList.add('blur-overlay');
}

function handleFocusRestore() {
    document.getElementById('main-content-wrapper').classList.remove('blur-overlay');
}

function handleFullscreenChange() {
    if (!document.fullscreenElement) {
        logViolation("Fullscreen Exited", "Exited full-screen assessment view.");
    }
}

function handleKeyRestrictions(e) {
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
        showToast("Shortcut disabled under security policy.");
    }
}

function logViolation(type, detail) {
    appState.violationCount++;
    const timestamp = new Date().toLocaleTimeString();
    appState.violationLogs.push({ timestamp, type, detail });
    
    violationDisplay.textContent = `Violations: ${appState.violationCount}/3`;
    showToast(`WARNING: ${type} logged (${appState.violationCount}/3).`);
    
    if (appState.violationCount >= 3) {
        disqualifyCandidate();
    }
}

// Disqualification submit
async function disqualifyCandidate() {
    clearInterval(appState.timerInterval);
    clearInterval(telemetryInterval);
    removeAntiCheating();
    
    if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
    }
    
    document.getElementById('floating-webcam-feed').style.display = 'none';
    document.getElementById('dynamic-watermark').style.display = 'none';
    if (document.exitFullscreen) document.exitFullscreen().catch(()=>{});

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
        tab_switches: appState.violationCount,
        violation_count: appState.violationCount,
        violation_logs: appState.violationLogs,
        telemetry: {
            backspace_count: appState.telemetry.backspaceCount,
            typing_speed_avg: 0.0,
            typing_pattern_variance: 0.0,
            mouse_moves_count: appState.telemetry.mouseMovesCount,
            idle_duration: appState.telemetry.idleDuration
        },
        webcam_status: appState.webcamStatus,
        location_data: appState.locationData
    };

    try {
        await fetch('/api/submit_challenge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        // Save local disqualified
        saveLocalCandidateDisqualified();
    } catch(err) {
        saveLocalCandidateDisqualified();
    }

    // Redirect to dashboard where disqualified layout will be displayed
    alert("Assessment terminated. Violation threshold exceeded (3/3). Redirecting to Dashboard.");
    window.location.href = '/dashboard';
}

function saveLocalCandidateDisqualified() {
    const raw = localStorage.getItem('candidates');
    const list = raw ? JSON.parse(raw) : [];
    let candidate = list.find(c => c.candidate_id === appState.candidateId);
    if (candidate) {
        candidate.completed = true;
        candidate.selected = 3; // Disqualified
        candidate.violation_count = appState.violationCount;
        candidate.violation_logs = JSON.stringify(appState.violationLogs);
        candidate.score_final = 0.0;
        localStorage.setItem('candidates', JSON.stringify(list));
    }
}

// Telemetry Heuristics
function startBehaviorTelemetry() {
    document.addEventListener('mousemove', () => {
        appState.telemetry.mouseMovesCount++;
        lastUserActivity = Date.now();
    });

    document.addEventListener('keydown', (e) => {
        lastUserActivity = Date.now();
        if (e.keyCode === 8) {
            appState.telemetry.backspaceCount++;
        }
        appState.telemetry.keyTimes.push(Date.now());
        if (appState.telemetry.keyTimes.length > 50) {
            appState.telemetry.keyTimes.shift();
        }
    });

    telemetryInterval = setInterval(() => {
        const secSinceActive = Math.floor((Date.now() - lastUserActivity) / 1000);
        if (secSinceActive >= 10) {
            appState.telemetry.idleDuration++;
        }
        
        if (appState.telemetry.keyTimes.length > 5) {
            const first = appState.telemetry.keyTimes[0];
            const last = appState.telemetry.keyTimes[appState.telemetry.keyTimes.length - 1];
            const deltaMs = last - first;
            if (deltaMs > 1000) {
                const minutes = deltaMs / 60000;
                const cpm = appState.telemetry.keyTimes.length / minutes;
                appState.telemetry.typingSpeedAvg = Math.round(cpm);
                
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

// Missions layout configuration matching game names
const levelsData = {
    1: {
        name: "AI Logic Detective",
        xp: 50,
        render: () => `
            <h4 style="font-family:var(--font-futuristic); letter-spacing:1px; margin-bottom:1rem; color:var(--accent-cyan);">MISSION 01: AI LOGIC DETECTIVE</h4>
            <p class="challenge-question">
                <strong>Task 1:</strong> Solve the visual symbol matrix pattern puzzle: <br>
                <code style="font-family: var(--font-mono); color: var(--accent-purple); font-size: 1.2rem; display: block; margin: 1rem 0;">[▲] [●] [■]  -->  [▼] [◌] [▧]  <br>  [◆] [★] [▲]  -->  [◇] [☆] [?]</code>
                <div class="shape-match-grid">
                    <div class="shape-card-grid" onclick="selectOption(this, 'l1-q1', '▲')">
                        <span style="font-size:1.5rem;">[▲]</span>
                    </div>
                    <div class="shape-card-grid" onclick="selectOption(this, 'l1-q1', '▼')">
                        <span style="font-size:1.5rem;">[▼]</span>
                    </div>
                    <div class="shape-card-grid" onclick="selectOption(this, 'l1-q1', '▽')">
                        <span style="font-size:1.5rem;">[▽]</span>
                    </div>
                </div>
            </p>
            
            <p class="challenge-question" style="margin-top: 2rem;">
                <strong>Task 2:</strong> Solve the logical numerical sequence series: <br>
                <code style="font-family: var(--font-mono); color: var(--accent-purple); font-size: 1.2rem; display: block; margin: 1rem 0;">1, 3, 7, 15, 31, ___</code>
                <input type="text" id="l1-q2" class="text-answer-area" style="min-height: 45px; font-family: var(--font-mono);" placeholder="Enter numerical output...">
            </p>
        `,
        save: () => {
            appState.answers.level1.q2 = document.getElementById('l1-q2').value.trim();
        }
    },
    2: {
        name: "The Future Thinker",
        xp: 100,
        render: () => `
            <h4 style="font-family:var(--font-futuristic); letter-spacing:1px; margin-bottom:1rem; color:var(--accent-cyan);">MISSION 02: THE FUTURE THINKER</h4>
            <p class="challenge-question">
                Four scientists need to cross a bridge at night. They have only one flashlight. 
                The bridge is structurally compromised and supports only two people at a time. 
                Walk velocities: 
                <br>• Scientist A: 1 minute
                <br>• Scientist B: 2 minutes
                <br>• Scientist C: 5 minutes
                <br>• Scientist D: 10 minutes
                <br>When walking together, they pace at the slower person's velocity. What is the absolute minimum time required for all four scientists to cross the bridge?
            </p>
            <div class="option-list">
                <div class="option-card" onclick="selectOption(this, 'level2', '19')">
                    <div class="option-dot"></div>
                    <div class="option-text">19 minutes</div>
                </div>
                <div class="option-card" onclick="selectOption(this, 'level2', '17')">
                    <div class="option-dot"></div>
                    <div class="option-text">17 minutes (Optimal bridge permutation path)</div>
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
        name: "The AI Architect",
        xp: 150,
        render: () => `
            <h4 style="font-family:var(--font-futuristic); letter-spacing:1px; margin-bottom:1rem; color:var(--accent-cyan);">MISSION 03: THE AI ARCHITECT</h4>
            <p class="challenge-question">
                Detail a coordination strategy mapping roles to ChatGPT (reasoning API), Claude (structural code), Gemini (search lookup), and Cursor (IDE builder) in an autonomous developer agent network.
            </p>
            <textarea id="l3-ans" class="text-answer-area prompt-textarea" placeholder="Detail agent planning, roles, and consensus loops..."></textarea>
        `,
        save: () => {
            appState.answers.level3 = document.getElementById('l3-ans').value.trim();
        }
    },
    4: {
        name: "Prompt Engineer",
        xp: 200,
        render: () => `
            <h4 style="font-family:var(--font-futuristic); letter-spacing:1px; margin-bottom:1rem; color:var(--accent-cyan);">MISSION 04: PROMPT ENGINEER</h4>
            <p class="challenge-question">
                Write a zero-shot prompt instructing an LLM to parse raw clinical textbooks into a structured JSON dataset matching context embeddings requirements. Use custom XML wrapping blocks.
            </p>
            <textarea id="l4-ans" class="text-answer-area prompt-textarea" style="min-height: 180px;" placeholder="&lt;system_instructions&gt;&#10;Act as a clinical parser..."></textarea>
        `,
        save: () => {
            appState.answers.level4 = document.getElementById('l4-ans').value.trim();
        }
    },
    5: {
        name: "The RAG Analyst",
        xp: 250,
        render: () => `
            <h4 style="font-family:var(--font-futuristic); letter-spacing:1px; margin-bottom:1rem; color:var(--accent-cyan);">MISSION 05: THE RAG ANALYST</h4>
            <p class="challenge-question">
                <strong>Task 1:</strong> Which framework relies on updating model parameters to memorize patterns?
            </p>
            <div class="option-list">
                <div class="option-card" onclick="selectOption(this, 'l5-q1', 'RAG retrieval')">
                    <div class="option-dot"></div>
                    <div class="option-text">RAG (Retrieval-Augmented Generation)</div>
                </div>
                <div class="option-card" onclick="selectOption(this, 'l5-q1', 'Fine-Tuning')">
                    <div class="option-dot"></div>
                    <div class="option-text">Fine-Tuning Model Weights</div>
                </div>
            </div>
            
            <p class="challenge-question" style="margin-top: 2rem;">
                <strong>Task 2:</strong> A hospital needs an AI to search medical charts. Explain when to deploy Fine-Tuning and when to deploy RAG.
            </p>
            <textarea id="l5-q2" class="text-answer-area prompt-textarea" placeholder="RAG is suited because..."></textarea>
        `,
        save: () => {
            appState.answers.level5.q2 = document.getElementById('l5-q2').value.trim();
        }
    },
    6: {
        name: "The Balance Master",
        xp: 300,
        render: () => `
            <h4 style="font-family:var(--font-futuristic); letter-spacing:1px; margin-bottom:1rem; color:var(--accent-cyan);">MISSION 06: THE BALANCE MASTER</h4>
            <p class="challenge-question">
                <strong>Task 1:</strong> You have 9 identical-looking balls. One is heavier. What is the maximum number of balls you must place on EACH side of a balance scale in the first weighing to guarantee finding the heavy ball in exactly two measurements?
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
                <strong>Task 2:</strong> Explain the logic process of isolating the heavy ball in two weighings.
            </p>
            <textarea id="l6-q2" class="text-answer-area prompt-textarea" placeholder="Divide the 9 balls into groups..."></textarea>
        `,
        save: () => {
            appState.answers.level6.q2 = document.getElementById('l6-q2').value.trim();
        }
    },
    7: {
        name: "Future Builder",
        xp: 350,
        render: () => `
            <h4 style="font-family:var(--font-futuristic); letter-spacing:1px; margin-bottom:1rem; color:var(--accent-cyan);">MISSION 07: FUTURE BUILDER</h4>
            <p class="challenge-question">
                Formulate an AI solution concept solving a real-world problem in Healthcare, Education, Traffic, or Cybersecurity with a budget of ₹1000 and NO GPU hosting capabilities.
                <br><span style="color: var(--accent-magenta); font-weight: bold;">Constraints: Max 150 words.</span>
            </p>
            <textarea id="l7-ans" class="text-answer-area prompt-textarea" placeholder="Describe how edge logic or free credits are leveraged..."></textarea>
        `,
        save: () => {
            appState.answers.level7 = document.getElementById('l7-ans').value.trim();
        }
    }
};

function selectOption(element, levelKey, value) {
    const cardContainer = element.parentElement;
    cardContainer.querySelectorAll('.option-card, .shape-card-grid').forEach(card => {
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

// Load level and update padlocks
function loadLevel(level) {
    document.getElementById('challenge-level-indicator').textContent = `MISSION 0${level} OF 07`;
    
    let levelData = levelsData[level];
    document.getElementById('challenge-level-name').textContent = levelData.name;
    document.getElementById('challenge-xp').textContent = appState.xp;
    
    const progressPercent = ((level - 1) / appState.totalLevels) * 100;
    progressFill.style.width = `${progressPercent}%`;

    const container = document.getElementById('question-render-area');
    container.innerHTML = levelData.render();

    // Update Sidebar locks and colors
    for (let i = 1; i <= 7; i++) {
        const item = document.getElementById(`m-item-${i}`);
        const icon = document.getElementById(`m-status-${i}`);
        
        if (i === level) {
            item.className = "mission-item active";
            icon.textContent = "⚡";
        } else if (i < level) {
            item.className = "mission-item completed";
            icon.textContent = "✔";
        } else {
            item.className = "mission-item locked";
            icon.textContent = "🔒";
        }
    }

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

// Next Mission click
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

// Submit results
async function submitAllResults() {
    clearInterval(appState.timerInterval);
    clearInterval(telemetryInterval);
    removeAntiCheating();

    if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
    }
    document.getElementById('floating-webcam-feed').style.display = 'none';
    document.getElementById('dynamic-watermark').style.display = 'none';
    if (document.exitFullscreen) document.exitFullscreen().catch(()=>{});
    
    questionArea.innerHTML = `
        <div style="text-align: center; padding: 4rem;">
            <div class="logo-icon" style="margin: 0 auto 2rem auto; width: 50px; height: 50px;"></div>
            <h3 style="font-family: var(--font-futuristic); letter-spacing: 2px;">LOGGING AND ANALYZING VECTORS...</h3>
            <p style="color: var(--text-muted); margin-top: 1rem;">Calculating Logic, Creativity, and AI scores. Applying anti-cheat audit logs.</p>
        </div>
    `;
    btnNext.style.display = 'none';

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
        tab_switches: appState.violationCount,
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
        
        if (response.ok) {
            alert("Missions submitted successfully. Loading Dashboard.");
            window.location.href = '/dashboard';
        } else {
            runLocalScoringFallback(payload);
        }
    } catch (e) {
        runLocalScoringFallback(payload);
    }
}

// Local Fallback scoring
function runLocalScoringFallback(payload) {
    let score_logic = 0.0;
    
    // Level 1
    const l1_q1 = String(payload.level1.q1 || '').trim();
    if (l1_q1 === '▽') score_logic += 10.0;
    
    const l1_q2 = String(payload.level1.q2 || '').trim();
    if (l1_q2 === '63') score_logic += 10.0;
    
    // Level 2
    const l2_ans = String(payload.level2 || '').toLowerCase();
    if (l2_ans === '17') score_logic += 10.0;
    
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

    let score_final = score_logic + score_creativity + score_ai + score_ps + score_time;
    
    let selected_status = 0;
    const deduction = Math.min(15.0, payload.violation_count * 3.0);
    score_final = Math.max(0.0, score_final - deduction);

    // Badges
    const badges = [];
    if (score_logic >= 35) badges.push('Logic Master');
    if (score_ps >= 8) badges.push('Problem Solver');
    if (score_creativity >= 16) badges.push('AI Thinker');
    if (score_ai >= 16) badges.push('AI Explorer');
    if (score_ps >= 9 && score_creativity >= 15) badges.push('Prompt Engineer');
    if (score_creativity >= 17 && score_ps >= 9) badges.push('Innovation Champion');
    if (score_final >= 80) badges.push('Future Researcher');

    // Save locally
    const raw = localStorage.getItem('candidates');
    const list = raw ? JSON.parse(raw) : [];
    let candidate = list.find(c => c.candidate_id === payload.candidate_id);
    if (candidate) {
        candidate.completed = true;
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
    }

    alert("Missions complete locally. Loading Dashboard.");
    window.location.href = '/dashboard';
}

function showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}
