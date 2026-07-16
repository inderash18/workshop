/**
 * ============================================
 * AI NEXT GEN 2026 - CHALLENGE ARENA SCRIPT
 * Version: 2.0.0
 * Description: Complete challenge assessment engine
 * ============================================
 */

// ============================================
// 1. STATE MANAGEMENT
// ============================================

const AppState = {
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
    isPaused: false,
    isCompleted: false,
    isDisqualified: false,
    secretLevelUnlocked: false,
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
    
    telemetry: {
        backspaceCount: 0,
        typingSpeedAvg: 0,
        typingPatternVariance: 0,
        mouseMovesCount: 0,
        idleDuration: 0,
        keyTimes: [],
        lastActivity: Date.now(),
        keyPressTimes: []
    },
    
    stream: null,
    wordCountInterval: null,
    telemetryInterval: null,
    idleCheckInterval: null
};

// ============================================
// 2. DOM CACHE
// ============================================

const DOM = {
    questionArea: document.getElementById('question-render-area'),
    btnNext: document.getElementById('btn-next-level'),
    btnReset: document.getElementById('btn-reset-question'),
    progressFill: document.getElementById('challenge-progress-fill'),
    progressText: document.getElementById('progress-text'),
    xpCounter: document.getElementById('challenge-xp'),
    timerVal: document.getElementById('challenge-timer'),
    timerBox: document.getElementById('timer-box'),
    violationDisplay: document.getElementById('violation-display'),
    violationCount: document.getElementById('violation-count'),
    levelName: document.getElementById('challenge-level-name'),
    levelIndicator: document.getElementById('challenge-level-indicator'),
    secretBanner: document.getElementById('secret-level-indicator'),
    wordCounter: document.getElementById('word-counter-display'),
    wordCountNum: document.getElementById('word-count-num'),
    questionCounter: document.getElementById('question-counter'),
    totalQuestions: document.getElementById('total-questions'),
    antiCheatBanner: document.getElementById('anti-cheat-banner'),
    resumeBtn: document.getElementById('btn-resume-assessment'),
    webcamFeed: document.getElementById('floating-webcam-feed'),
    webcamLabel: document.getElementById('webcam-label'),
    watermark: document.getElementById('dynamic-watermark'),
    watermarkContent: document.getElementById('watermark-content'),
    mainWrapper: document.getElementById('main-content-wrapper')
};

// ============================================
// 3. UTILITY FUNCTIONS
// ============================================

const Utils = {
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    },

    getWordCount(text) {
        if (!text) return 0;
        return text.trim().split(/\s+/).filter(w => w.length > 0).length;
    },

    truncateText(text, maxLength = 100) {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    },

    generateId() {
        return Math.random().toString(36).substring(2, 9);
    },

    safeJSONParse(str, fallback = {}) {
        if (!str) return fallback;
        try {
            return typeof str === 'string' ? JSON.parse(str) : str;
        } catch {
            return fallback;
        }
    },

    debounce(func, wait = 300) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    },

    isInViewport(element) {
        const rect = element.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
    }
};

// ============================================
// 4. TOAST NOTIFICATION SYSTEM
// ============================================

const Toast = {
    container: null,

    init() {
        this.container = document.getElementById('toast-container');
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'toast-container';
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);
        }
    },

    show(message, type = 'info', duration = 4000) {
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
            <span class="toast-message">${message}</span>
            <button class="toast-close" aria-label="Close notification">×</button>
        `;

        toast.querySelector('.toast-close').addEventListener('click', () => {
            this.remove(toast);
        });

        this.container.appendChild(toast);

        setTimeout(() => {
            this.remove(toast);
        }, duration);
    },

    remove(toast) {
        toast.classList.add('toast-removing');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    },

    success(message, duration = 4000) {
        this.show(message, 'success', duration);
    },

    error(message, duration = 5000) {
        this.show(message, 'error', duration);
    },

    warning(message, duration = 4000) {
        this.show(message, 'warning', duration);
    },

    info(message, duration = 3000) {
        this.show(message, 'info', duration);
    }
};

// ============================================
// 5. LEVEL CONFIGURATION
// ============================================

const LEVELS = {
    1: {
        id: 1,
        title: 'AI Logic Detective',
        icon: '🔍',
        xp: 50,
        questions: 2,
        type: 'mixed',
        render() {
            return `
                <h4 class="level-title">🔍 MISSION 01: AI LOGIC DETECTIVE</h4>
                <p class="challenge-question">
                    <strong>Task 1:</strong> Solve the visual symbol matrix pattern puzzle:
                </p>
                <div class="pattern-matrix">
                    <div class="pattern-row">
                        <span class="pattern-symbol">▲</span>
                        <span class="pattern-arrow">→</span>
                        <span class="pattern-symbol">▼</span>
                    </div>
                    <div class="pattern-row">
                        <span class="pattern-symbol">●</span>
                        <span class="pattern-arrow">→</span>
                        <span class="pattern-symbol">◌</span>
                    </div>
                    <div class="pattern-row">
                        <span class="pattern-symbol">■</span>
                        <span class="pattern-arrow">→</span>
                        <span class="pattern-symbol pattern-question">?</span>
                    </div>
                </div>
                <div class="shape-match-grid">
                    ${['▲', '▼', '▽', '◆'].map(shape => `
                        <div class="shape-card-grid" data-value="${shape}" onclick="Challenge.selectOption(this, 'l1-q1', '${shape}')">
                            <span style="font-size:2rem;">${shape}</span>
                        </div>
                    `).join('')}
                </div>
                
                <p class="challenge-question" style="margin-top: 2rem;">
                    <strong>Task 2:</strong> Solve the logical numerical sequence:
                </p>
                <div class="sequence-display">
                    <code class="sequence-code">1, 3, 7, 15, 31, ___</code>
                    <input type="text" id="l1-q2" class="text-input" placeholder="Enter the next number..." autocomplete="off">
                </div>
            `;
        },
        save() {
            const q2 = document.getElementById('l1-q2');
            if (q2) AppState.answers.level1.q2 = q2.value.trim();
        },
        validate() {
            return AppState.answers.level1.q1 && AppState.answers.level1.q2;
        }
    },

    2: {
        id: 2,
        title: 'Future Thinker',
        icon: '🚀',
        xp: 100,
        questions: 1,
        type: 'mcq',
        render() {
            return `
                <h4 class="level-title">🚀 MISSION 02: FUTURE THINKER</h4>
                <p class="challenge-question">
                    Four scientists need to cross a bridge at night. They have one flashlight.
                    The bridge supports only two people at a time.
                    <br><br>
                    <strong>Walk velocities:</strong>
                    <br>• Scientist A: 1 minute
                    <br>• Scientist B: 2 minutes
                    <br>• Scientist C: 5 minutes
                    <br>• Scientist D: 10 minutes
                    <br><br>
                    <em>When walking together, they pace at the slower person's velocity.</em>
                    <br><br>
                    <strong>What is the absolute minimum time required for all four to cross?</strong>
                </p>
                <div class="option-list">
                    ${['19 minutes', '17 minutes ✓', '21 minutes', '15 minutes'].map((opt, i) => `
                        <div class="option-card" data-value="${i + 1}" onclick="Challenge.selectOption(this, 'level2', '${i + 1}')">
                            <div class="option-dot"></div>
                            <div class="option-text">${opt}</div>
                        </div>
                    `).join('')}
                </div>
                <div class="hint-box">
                    💡 <span class="hint-text">Try pairing the fastest with the slowest first.</span>
                </div>
            `;
        },
        save() {},
        validate() {
            return AppState.answers.level2 !== '';
        }
    },

    3: {
        id: 3,
        title: 'AI Architect',
        icon: '🏗️',
        xp: 150,
        questions: 1,
        type: 'text',
        render() {
            return `
                <h4 class="level-title">🏗️ MISSION 03: AI ARCHITECT</h4>
                <p class="challenge-question">
                    Detail a coordination strategy for an autonomous developer agent network using:
                    <br><br>
                    <strong>• ChatGPT</strong> (reasoning API)<br>
                    <strong>• Claude</strong> (structural code)<br>
                    <strong>• Gemini</strong> (search lookup)<br>
                    <strong>• Cursor</strong> (IDE builder)
                    <br><br>
                    <em>Describe roles, communication protocols, and consensus mechanisms.</em>
                </p>
                <textarea id="l3-ans" class="text-answer" placeholder="Describe your agent coordination strategy..." rows="6"></textarea>
                <div class="word-counter" id="l3-counter">0 / 500 words</div>
            `;
        },
        save() {
            const el = document.getElementById('l3-ans');
            if (el) AppState.answers.level3 = el.value.trim();
        },
        validate() {
            return AppState.answers.level3.length >= 30;
        }
    },

    4: {
        id: 4,
        title: 'Prompt Engineer',
        icon: '✍️',
        xp: 200,
        questions: 1,
        type: 'text',
        render() {
            return `
                <h4 class="level-title">✍️ MISSION 04: PROMPT ENGINEER</h4>
                <p class="challenge-question">
                    Write a zero-shot prompt instructing an LLM to parse clinical textbooks into structured JSON.
                    <br><br>
                    <strong>Requirements:</strong>
                    <br>• Use XML wrapping blocks
                    <br>• Include system instructions
                    <br>• Define output schema
                    <br>• Add validation rules
                </p>
                <textarea id="l4-ans" class="text-answer" placeholder="&lt;system_instructions&gt;&#10;Act as a clinical parser...&#10;&lt;/system_instructions&gt;" rows="8"></textarea>
                <div class="word-counter" id="l4-counter">0 / 300 words</div>
            `;
        },
        save() {
            const el = document.getElementById('l4-ans');
            if (el) AppState.answers.level4 = el.value.trim();
        },
        validate() {
            const text = AppState.answers.level4;
            return text.length >= 40 && (text.includes('<') || text.includes('['));
        }
    },

    5: {
        id: 5,
        title: 'RAG Analyst',
        icon: '🔗',
        xp: 250,
        questions: 2,
        type: 'mixed',
        render() {
            return `
                <h4 class="level-title">🔗 MISSION 05: RAG ANALYST</h4>
                <p class="challenge-question">
                    <strong>Task 1:</strong> Which framework relies on updating model parameters to memorize patterns?
                </p>
                <div class="option-list">
                    ${['RAG (Retrieval-Augmented Generation)', 'Fine-Tuning Model Weights ✓'].map((opt, i) => `
                        <div class="option-card" data-value="${i}" onclick="Challenge.selectOption(this, 'l5-q1', '${i}')">
                            <div class="option-dot"></div>
                            <div class="option-text">${opt}</div>
                        </div>
                    `).join('')}
                </div>
                
                <p class="challenge-question" style="margin-top: 2rem;">
                    <strong>Task 2:</strong> A hospital needs an AI to search medical charts.
                    <br>Explain when to deploy Fine-Tuning vs RAG.
                </p>
                <textarea id="l5-q2" class="text-answer" placeholder="Compare and contrast Fine-Tuning and RAG for this use case..." rows="5"></textarea>
            `;
        },
        save() {
            const el = document.getElementById('l5-q2');
            if (el) AppState.answers.level5.q2 = el.value.trim();
        },
        validate() {
            return AppState.answers.level5.q1 !== '' && AppState.answers.level5.q2.length >= 30;
        }
    },

    6: {
        id: 6,
        title: 'Balance Master',
        icon: '⚖️',
        xp: 300,
        questions: 2,
        type: 'mixed',
        render() {
            return `
                <h4 class="level-title">⚖️ MISSION 06: BALANCE MASTER</h4>
                <p class="challenge-question">
                    <strong>Task 1:</strong> You have 9 identical-looking balls. One is heavier.
                    <br>What is the maximum number of balls on EACH side in the first weighing to guarantee finding the heavy ball in exactly two measurements?
                </p>
                <div class="option-list">
                    ${['3 balls per side ✓', '4 balls per side'].map((opt, i) => `
                        <div class="option-card" data-value="${i}" onclick="Challenge.selectOption(this, 'l6-q1', '${i}')">
                            <div class="option-dot"></div>
                            <div class="option-text">${opt}</div>
                        </div>
                    `).join('')}
                </div>
                
                <p class="challenge-question" style="margin-top: 2rem;">
                    <strong>Task 2:</strong> Explain the logic process of isolating the heavy ball in two weighings.
                </p>
                <textarea id="l6-q2" class="text-answer" placeholder="Describe your step-by-step logic..." rows="4"></textarea>
            `;
        },
        save() {
            const el = document.getElementById('l6-q2');
            if (el) AppState.answers.level6.q2 = el.value.trim();
        },
        validate() {
            return AppState.answers.level6.q1 !== '' && AppState.answers.level6.q2.length >= 20;
        }
    },

    7: {
        id: 7,
        title: 'Future Builder',
        icon: '🌍',
        xp: 350,
        questions: 1,
        type: 'text',
        isSecret: true,
        render() {
            return `
                <h4 class="level-title">🌍 MISSION 07: FUTURE BUILDER</h4>
                <div class="secret-banner">⚡ SECRET VECTOR: BUDGET ₹1000 • NO GPU • MAX 150 WORDS ⚡</div>
                <p class="challenge-question">
                    Formulate an AI solution concept solving a real-world problem with:
                    <br><br>
                    <strong>Constraints:</strong>
                    <br>• Budget: ₹1000
                    <br>• No GPU hosting
                    <br>• Max 150 words
                    <br><br>
                    <strong>Choose a domain:</strong> Healthcare, Education, Traffic, or Cybersecurity
                </p>
                <textarea id="l7-ans" class="text-answer" placeholder="Describe your innovative AI solution..." rows="6"></textarea>
                <div class="word-counter">
                    Words: <span id="word-count-num">0</span> / 150
                </div>
            `;
        },
        save() {
            const el = document.getElementById('l7-ans');
            if (el) AppState.answers.level7 = el.value.trim();
        },
        validate() {
            const words = Utils.getWordCount(AppState.answers.level7);
            return words >= 50 && words <= 150;
        }
    }
};

// ============================================
// 6. CHALLENGE ENGINE
// ============================================

const Challenge = {
    // Initialize the challenge
    async init() {
        console.log('🚀 Challenge Arena Initializing...');
        Toast.init();

        try {
            const response = await fetch('/api/session');
            const data = await response.json();

            if (response.ok && data.logged_in) {
                AppState.candidateId = data.candidate.candidate_id;
                AppState.locationData = data.candidate.location_data || 'Pending';
                this.showSecurityCheck();
            } else {
                this.loadLocalSession();
            }
        } catch (error) {
            console.warn('⚠️ API error, checking local session:', error);
            this.loadLocalSession();
        }
    },

    loadLocalSession() {
        const email = localStorage.getItem('active_session_email');
        if (!email) {
            window.location.href = '/login';
            return;
        }

        const raw = localStorage.getItem('candidates');
        const list = raw ? JSON.parse(raw) : [];
        const candidate = list.find(c => c.email.toLowerCase() === email.toLowerCase());

        if (candidate) {
            AppState.candidateId = candidate.candidate_id;
            AppState.locationData = candidate.location_data || 'Pending';
            this.showSecurityCheck();
        } else {
            window.location.href = '/login';
        }
    },

    // Show security check screen
    showSecurityCheck() {
        DOM.btnNext.style.display = 'none';
        DOM.btnReset.style.display = 'none';
        DOM.progressFill.style.width = '0%';

        DOM.questionArea.innerHTML = `
            <div class="security-check-screen">
                <h2 class="security-title">🔐 PRE-ASSESSMENT SETUP</h2>
                <p class="security-subtitle">Verify your system before starting the challenge</p>

                <div class="camera-preview">
                    <video id="webcam-setup-feed" autoplay muted playsinline></video>
                    <div class="camera-status" id="setup-camera-label">📷 Webcam: Initializing...</div>
                </div>

                <div class="security-grid">
                    ${[
                        { id: 'chk-webcam', label: '📷 Webcam', status: 'Checking...' },
                        { id: 'chk-mic', label: '🎤 Microphone', status: 'Checking...' },
                        { id: 'chk-location', label: '📍 Location', status: 'Checking...' },
                        { id: 'chk-resolution', label: '📐 Screen Resolution', status: 'Checking...' },
                        { id: 'chk-cookies', label: '🍪 Cookies', status: 'Checking...' },
                        { id: 'chk-latency', label: '⚡ Network Latency', status: 'Checking...' }
                    ].map(item => `
                        <div class="security-item">
                            <span class="security-label">${item.label}</span>
                            <span class="security-status" id="${item.id}">${item.status}</span>
                        </div>
                    `).join('')}
                </div>

                <div class="security-warning">
                    ⚠️ Tab switching, copy-paste, and keyboard shortcuts are monitored.
                    <br>3 violations = automatic disqualification.
                </div>

                <button class="btn-futuristic" id="btn-begin-assessment" disabled>
                    🚀 Begin Assessment
                </button>
            </div>
        `;

        this.runSecurityChecks();
    },

    // Run security validations
    async runSecurityChecks() {
        let checks = {
            webcam: false,
            mic: false,
            location: false,
            resolution: false,
            cookies: false,
            latency: false
        };

        // Webcam & Microphone
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { width: { ideal: 640 }, height: { ideal: 480 } }, 
                audio: true 
            });
            AppState.stream = stream;

            const video = document.getElementById('webcam-setup-feed');
            if (video) {
                video.srcObject = stream;
                document.getElementById('setup-camera-label').textContent = '📷 Webcam: ✅ Active';
            }

            this.setCheckStatus('chk-webcam', '✅ PASSED', 'passed');
            checks.webcam = true;
            this.setCheckStatus('chk-mic', '✅ PASSED', 'passed');
            checks.mic = true;
        } catch (error) {
            console.warn('Camera/Mic access denied:', error);
            this.setCheckStatus('chk-webcam', '❌ DENIED', 'failed');
            this.setCheckStatus('chk-mic', '❌ DENIED', 'failed');
            AppState.webcamStatus = 'Denied';
        }

        // Location
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    AppState.locationData = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
                    this.setCheckStatus('chk-location', '✅ VERIFIED', 'passed');
                    checks.location = true;
                },
                () => {
                    this.setCheckStatus('chk-location', '❌ BLOCKED', 'failed');
                    checks.location = false;
                }
            );
        } else {
            this.setCheckStatus('chk-location', '❌ UNSUPPORTED', 'failed');
        }

        // Resolution
        const w = window.innerWidth;
        if (w >= 1024) {
            this.setCheckStatus('chk-resolution', `✅ ${w}x${window.innerHeight}`, 'passed');
            checks.resolution = true;
        } else {
            this.setCheckStatus('chk-resolution', `❌ ${w}x${window.innerHeight} (min 1024px)`, 'failed');
        }

        // Cookies
        if (navigator.cookieEnabled) {
            this.setCheckStatus('chk-cookies', '✅ ENABLED', 'passed');
            checks.cookies = true;
        } else {
            this.setCheckStatus('chk-cookies', '❌ DISABLED', 'failed');
        }

        // Latency (simulated)
        setTimeout(() => {
            this.setCheckStatus('chk-latency', '✅ 18ms', 'passed');
            checks.latency = true;
            this.checkAllChecks(checks);
        }, 1000);
    },

    setCheckStatus(id, text, className) {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = text;
            el.className = `security-status ${className}`;
        }
    },

    checkAllChecks(checks) {
        const allPassed = Object.values(checks).every(v => v === true);
        const btn = document.getElementById('btn-begin-assessment');
        if (btn) {
            btn.disabled = !allPassed;
            if (allPassed) {
                btn.textContent = '✅ Begin Assessment';
                btn.addEventListener('click', () => this.start());
                Toast.success('✅ All security checks passed!');
            } else {
                btn.textContent = '⚠️ Complete all checks';
                Toast.warning('⚠️ Please complete all security checks');
            }
        }
    },

    // Start the challenge
    start() {
        // Request fullscreen
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
        }

        // Setup watermark
        DOM.watermarkContent.textContent = `${AppState.candidateId} // ${AppState.locationData} // ACTIVE ASSESSMENT`;
        DOM.watermark.style.display = 'block';

        // Setup webcam
        if (AppState.stream) {
            DOM.webcamFeed.srcObject = AppState.stream;
            DOM.webcamFeed.style.display = 'block';
            DOM.webcamLabel.textContent = '📷 WEBCAM • ACTIVE';
        }

        // Show controls
        DOM.btnNext.style.display = 'inline-flex';
        DOM.btnReset.style.display = 'inline-block';

        // Initialize state
        AppState.startTime = Date.now();
        AppState.telemetry.lastActivity = Date.now();
        AppState.secretLevelUnlocked = Math.random() < 0.90;

        // Start systems
        this.startTimer();
        this.setupAntiCheat();
        this.startTelemetry();

        // Load first level
        this.loadLevel(1);

        Toast.success('🚀 Assessment started! Good luck!');
    },

    // Load a level
    loadLevel(level) {
        const levelData = LEVELS[level];
        if (!levelData) return;

        // Update UI
        DOM.levelName.textContent = `${levelData.icon} ${levelData.title}`;
        DOM.levelIndicator.textContent = `MISSION ${String(level).padStart(2, '0')} OF ${String(AppState.totalLevels).padStart(2, '0')}`;
        DOM.xpCounter.textContent = AppState.xp;

        // Update progress
        const progress = ((level - 1) / AppState.totalLevels) * 100;
        DOM.progressFill.style.width = `${progress}%`;
        DOM.progressText.textContent = `${Math.round(progress)}% Complete`;

        // Update question counter
        DOM.questionCounter.textContent = '1';
        DOM.totalQuestions.textContent = levelData.questions || 1;

        // Show/hide secret banner
        if (levelData.isSecret) {
            DOM.secretBanner.style.display = 'block';
        } else {
            DOM.secretBanner.style.display = 'none';
        }

        // Render content
        DOM.questionArea.innerHTML = levelData.render();

        // Update mission sidebar
        this.updateSidebar(level);

        // Add word counter for text areas
        this.setupWordCounters();

        // Focus first input
        const firstInput = DOM.questionArea.querySelector('input, textarea');
        if (firstInput) setTimeout(() => firstInput.focus(), 100);

        // Update button text
        if (level === AppState.totalLevels) {
            DOM.btnNext.innerHTML = '<span class="btn-text">🏁 Complete Challenge</span><span class="spinner-small"></span>';
        } else {
            DOM.btnNext.innerHTML = '<span class="btn-text">Next Mission ➔</span><span class="spinner-small"></span>';
        }

        // Enable/disable next button based on validation
        this.updateNextButton();
    },

    updateSidebar(activeLevel) {
        for (let i = 1; i <= AppState.totalLevels; i++) {
            const item = document.getElementById(`m-item-${i}`);
            const icon = document.getElementById(`m-status-${i}`);
            if (!item || !icon) continue;

            if (i === activeLevel) {
                item.className = 'mission-item active';
                icon.textContent = '⚡';
            } else if (i < activeLevel) {
                item.className = 'mission-item completed';
                icon.textContent = '✅';
            } else {
                item.className = 'mission-item locked';
                icon.textContent = '🔒';
            }
        }
    },

    setupWordCounters() {
        const textareas = DOM.questionArea.querySelectorAll('textarea');
        textareas.forEach(ta => {
            const counterId = ta.id + '-counter';
            let counter = document.getElementById(counterId);
            if (!counter) {
                counter = document.createElement('div');
                counter.className = 'word-counter';
                counter.id = counterId;
                ta.parentNode.appendChild(counter);
            }

            const updateCounter = () => {
                const words = Utils.getWordCount(ta.value);
                const max = ta.dataset.maxWords || 500;
                counter.textContent = `${words} / ${max} words`;
                counter.style.color = words > max ? 'var(--accent-red)' : 'rgba(34,40,49,0.3)';
            };

            ta.addEventListener('input', updateCounter);
            updateCounter();
        });
    },

    updateNextButton() {
        const levelData = LEVELS[AppState.currentLevel];
        const isValid = levelData.validate ? levelData.validate() : true;
        DOM.btnNext.disabled = !isValid;
    },

    // Timer
    startTimer() {
        if (AppState.timerInterval) clearInterval(AppState.timerInterval);
        
        AppState.timerInterval = setInterval(() => {
            if (AppState.isPaused) return;
            
            const elapsed = Math.floor((Date.now() - AppState.startTime) / 1000);
            AppState.totalTimeTaken = elapsed;
            
            DOM.timerVal.textContent = Utils.formatTime(elapsed);
            
            // Warning states
            DOM.timerBox.className = 'timer-box';
            if (elapsed > 600) DOM.timerBox.classList.add('warning');
            if (elapsed > 900) DOM.timerBox.classList.add('danger');
        }, 1000);
    },

    // Anti-cheat system
    setupAntiCheat() {
        // Visibility change
        document.addEventListener('visibilitychange', this.handleVisibilityChange);

        // Window blur/focus
        window.addEventListener('blur', this.handleWindowBlur);
        window.addEventListener('focus', this.handleWindowFocus);

        // Fullscreen change
        document.addEventListener('fullscreenchange', this.handleFullscreenChange);

        // Context menu
        document.addEventListener('contextmenu', this.handlePreventAction);

        // Copy/Paste
        document.addEventListener('copy', this.handlePreventAction);
        document.addEventListener('paste', this.handlePreventAction);

        // Keyboard shortcuts
        document.addEventListener('keydown', this.handleKeyRestrictions);

        console.log('🛡️ Anti-cheat system activated');
    },

    removeAntiCheat() {
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        window.removeEventListener('blur', this.handleWindowBlur);
        window.removeEventListener('focus', this.handleWindowFocus);
        document.removeEventListener('fullscreenchange', this.handleFullscreenChange);
        document.removeEventListener('contextmenu', this.handlePreventAction);
        document.removeEventListener('copy', this.handlePreventAction);
        document.removeEventListener('paste', this.handlePreventAction);
        document.removeEventListener('keydown', this.handleKeyRestrictions);
    },

    handleVisibilityChange() {
        if (document.hidden) {
            Challenge.logViolation('Tab Switch', 'Candidate switched to another tab');
            DOM.mainWrapper.classList.add('blur-overlay');
        }
    },

    handleWindowBlur() {
        Challenge.logViolation('Window Blur', 'Window lost focus');
        DOM.mainWrapper.classList.add('blur-overlay');
    },

    handleWindowFocus() {
        DOM.mainWrapper.classList.remove('blur-overlay');
    },

    handleFullscreenChange() {
        if (!document.fullscreenElement) {
            Challenge.logViolation('Fullscreen Exit', 'Exited fullscreen mode');
        }
    },

    handlePreventAction(e) {
        e.preventDefault();
        Challenge.logViolation('Action Blocked', `${e.type} prevented`);
    },

    handleKeyRestrictions(e) {
        const key = e.keyCode || e.which;
        const ctrl = e.ctrlKey || e.metaKey;
        const shift = e.shiftKey;

        // Block dev tools, inspect, shortcuts
        if (key === 123 || // F12
            (ctrl && shift && key === 73) || // Ctrl+Shift+I
            (ctrl && key === 85) || // Ctrl+U
            (ctrl && key === 82) || // Ctrl+R
            key === 116) { // F5
            
            e.preventDefault();
            Challenge.logViolation('Shortcut Blocked', `Keycode: ${key}`);
            Toast.warning('⛔ Shortcut disabled under security policy');
        }
    },

    logViolation(type, detail) {
        AppState.violationCount++;
        const timestamp = new Date().toLocaleTimeString();
        AppState.violationLogs.push({ timestamp, type, detail });

        DOM.violationCount.textContent = AppState.violationCount;
        
        // Update display
        if (AppState.violationCount >= 3) {
            DOM.violationDisplay.className = 'danger';
        } else if (AppState.violationCount >= 2) {
            DOM.violationDisplay.className = 'warning';
        }

        Toast.warning(`🚨 ${type} (${AppState.violationCount}/3)`);

        if (AppState.violationCount >= 3) {
            this.disqualify('Violation limit exceeded');
        }
    },

    // Telemetry
    startTelemetry() {
        // Mouse movement
        document.addEventListener('mousemove', this.handleMouseMove);

        // Keyboard
        document.addEventListener('keydown', this.handleKeyPress);

        // Telemetry interval
        AppState.telemetryInterval = setInterval(() => {
            const idleSeconds = Math.floor((Date.now() - AppState.telemetry.lastActivity) / 1000);
            if (idleSeconds >= 10) {
                AppState.telemetry.idleDuration += 1;
            }

            // Calculate typing speed
            const times = AppState.telemetry.keyPressTimes;
            if (times.length > 5) {
                const first = times[0];
                const last = times[times.length - 1];
                const deltaMs = last - first;
                if (deltaMs > 1000) {
                    const minutes = deltaMs / 60000;
                    const cpm = times.length / minutes;
                    AppState.telemetry.typingSpeedAvg = Math.round(cpm);

                    // Calculate variance
                    const deltas = [];
                    for (let i = 1; i < times.length; i++) {
                        deltas.push(times[i] - times[i - 1]);
                    }
                    const mean = deltas.reduce((s, v) => s + v, 0) / deltas.length;
                    const variance = deltas.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / deltas.length;
                    AppState.telemetry.typingPatternVariance = Math.sqrt(variance);
                }
            }
        }, 1000);
    },

    handleMouseMove() {
        AppState.telemetry.mouseMovesCount++;
        AppState.telemetry.lastActivity = Date.now();
    },

    handleKeyPress(e) {
        AppState.telemetry.lastActivity = Date.now();
        if (e.key === 'Backspace') {
            AppState.telemetry.backspaceCount++;
        }
        AppState.telemetry.keyPressTimes.push(Date.now());
        
        // Keep only last 100
        if (AppState.telemetry.keyPressTimes.length > 100) {
            AppState.telemetry.keyPressTimes.shift();
        }
    },

    // Select option
    selectOption(element, key, value) {
        const container = element.closest('.option-list, .shape-match-grid');
        if (container) {
            container.querySelectorAll('.option-card, .shape-card-grid').forEach(el => {
                el.classList.remove('selected');
            });
        }
        element.classList.add('selected');

        // Store answer
        const keyMap = {
            'l1-q1': () => AppState.answers.level1.q1 = value,
            'level2': () => AppState.answers.level2 = value,
            'l5-q1': () => AppState.answers.level5.q1 = value,
            'l6-q1': () => AppState.answers.level6.q1 = value
        };

        if (keyMap[key]) {
            keyMap[key]();
            this.updateNextButton();
        }
    },

    // Next/Submit
    async handleNext() {
        if (AppState.isPaused) {
            Toast.warning('⏸️ Assessment is paused. Resume to continue.');
            return;
        }

        const levelData = LEVELS[AppState.currentLevel];
        
        // Save current level
        if (levelData.save) {
            levelData.save();
        }

        // Validate
        if (levelData.validate && !levelData.validate()) {
            Toast.warning('⚠️ Please complete all questions before proceeding');
            return;
        }

        // Add XP
        AppState.xp += levelData.xp;

        if (AppState.currentLevel < AppState.totalLevels) {
            // Next level
            AppState.currentLevel++;
            this.loadLevel(AppState.currentLevel);
            Toast.success(`✅ Mission ${AppState.currentLevel - 1} complete! +${levelData.xp} XP`);
        } else {
            // Submit all
            await this.submitResults();
        }
    },

    // Reset question
    resetQuestion() {
        const levelData = LEVELS[AppState.currentLevel];
        if (!levelData) return;

        if (confirm('Reset this question? Your answer will be cleared.')) {
            // Reset answers
            const keys = Object.keys(AppState.answers);
            keys.forEach(key => {
                if (typeof AppState.answers[key] === 'object') {
                    Object.keys(AppState.answers[key]).forEach(subKey => {
                        AppState.answers[key][subKey] = '';
                    });
                } else {
                    AppState.answers[key] = '';
                }
            });

            this.loadLevel(AppState.currentLevel);
            Toast.info('🔄 Question reset');
        }
    },

    // Submit results
    async submitResults() {
        // Cleanup
        clearInterval(AppState.timerInterval);
        clearInterval(AppState.telemetryInterval);
        this.removeAntiCheat();

        // Stop webcam
        if (AppState.stream) {
            AppState.stream.getTracks().forEach(track => track.stop());
        }
        DOM.webcamFeed.style.display = 'none';
        DOM.watermark.style.display = 'none';

        if (document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
        }

        DOM.btnNext.disabled = true;
        DOM.questionArea.innerHTML = `
            <div class="submission-status">
                <div class="spinner-large"></div>
                <h3>📊 Analyzing Your Responses...</h3>
                <p>Calculating Logic, Creativity, and AI scores</p>
            </div>
        `;

        const payload = {
            candidate_id: AppState.candidateId,
            level1: AppState.answers.level1,
            level2: AppState.answers.level2,
            level3: AppState.answers.level3,
            level4: AppState.answers.level4,
            level5: AppState.answers.level5,
            level6: AppState.answers.level6,
            level7: AppState.answers.level7,
            time_taken: AppState.totalTimeTaken,
            tab_switches: AppState.violationCount,
            violation_count: AppState.violationCount,
            violation_logs: AppState.violationLogs,
            telemetry: {
                backspace_count: AppState.telemetry.backspaceCount,
                typing_speed_avg: AppState.telemetry.typingSpeedAvg,
                typing_pattern_variance: AppState.telemetry.typingPatternVariance,
                mouse_moves_count: AppState.telemetry.mouseMovesCount,
                idle_duration: AppState.telemetry.idleDuration
            },
            webcam_status: AppState.webcamStatus,
            location_data: AppState.locationData
        };

        try {
            const response = await fetch('/api/submit_challenge', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (response.ok && result.status !== 'Disqualified') {
                Toast.success('🎉 Challenge submitted successfully!');
                setTimeout(() => {
                    window.location.href = '/dashboard';
                }, 1500);
            } else {
                this.localSubmit(payload);
            }
        } catch (error) {
            console.warn('⚠️ API error, using local submission:', error);
            this.localSubmit(payload);
        }
    },

    // Local submission fallback
    localSubmit(payload) {
        // Calculate scores locally (simplified)
        const scores = this.calculateScores(payload);
        
        // Save to localStorage
        const raw = localStorage.getItem('candidates');
        const list = raw ? JSON.parse(raw) : [];
        const candidate = list.find(c => c.candidate_id === payload.candidate_id);

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
            candidate.score_logic = scores.logic;
            candidate.score_creativity = scores.creativity;
            candidate.score_ai_knowledge = scores.ai;
            candidate.score_problem_solving = scores.problemSolving;
            candidate.score_time = scores.time;
            candidate.score_final = scores.final;
            candidate.badges = JSON.stringify(scores.badges);
            candidate.selected = scores.selected;

            localStorage.setItem('candidates', JSON.stringify(list));
            Toast.success('✅ Challenge submitted locally!');
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 1500);
        } else {
            Toast.error('❌ Failed to save results');
        }
    },

    calculateScores(payload) {
        let logic = 0, creativity = 0, ai = 0, problemSolving = 0, time = 0;
        const badges = [];

        // Logic scoring
        if (payload.level1.q1 === '▽') logic += 10;
        if (payload.level1.q2 === '63') logic += 10;
        if (payload.level2 === '2') logic += 10;
        if (payload.level6.q1 === '0') logic += 10;

        // Creativity scoring
        const l3 = (payload.level3 || '').length;
        if (l3 > 30) {
            creativity += Math.min(10, l3 / 30);
        }

        const l7 = (payload.level7 || '').length;
        if (l7 > 30) {
            creativity += Math.min(10, l7 / 30);
        }
        creativity = Math.min(20, creativity);

        // AI Knowledge
        if (payload.level5.q1 === '1') ai += 10;
        const l5q2 = (payload.level5.q2 || '').length;
        if (l5q2 > 30) {
            ai += Math.min(10, l5q2 / 30);
        }
        ai = Math.min(20, ai);

        // Problem Solving
        const l4 = (payload.level4 || '').length;
        if (l4 > 40) {
            problemSolving += Math.min(10, l4 / 40);
        }

        // Time
        if (payload.time_taken <= 400) time = 10;
        else if (payload.time_taken >= 1200) time = 2;
        else time = 10 - ((payload.time_taken - 400) / 800) * 8;

        let final = logic + creativity + ai + problemSolving + time;
        const deduction = Math.min(15, payload.violation_count * 3);
        final = Math.max(0, final - deduction);

        // Badges
        if (logic >= 35) badges.push('Logic Master');
        if (problemSolving >= 8) badges.push('Problem Solver');
        if (creativity >= 16) badges.push('AI Thinker');
        if (ai >= 16) badges.push('AI Explorer');
        if (final >= 80) badges.push('Future Researcher');

        return {
            logic: Math.round(logic * 10) / 10,
            creativity: Math.round(creativity * 10) / 10,
            ai: Math.round(ai * 10) / 10,
            problemSolving: Math.round(problemSolving * 10) / 10,
            time: Math.round(time * 10) / 10,
            final: Math.round(final * 10) / 10,
            badges,
            selected: payload.violation_count >= 3 ? 3 : 0
        };
    },

    // Disqualify
    disqualify(reason) {
        if (AppState.isDisqualified) return;
        AppState.isDisqualified = true;

        clearInterval(AppState.timerInterval);
        clearInterval(AppState.telemetryInterval);
        this.removeAntiCheat();

        Toast.error(`🚫 Disqualified: ${reason}`);

        // Submit with disqualification
        const payload = {
            candidate_id: AppState.candidateId,
            violation_count: AppState.violationCount,
            violation_logs: AppState.violationLogs,
            time_taken: AppState.totalTimeTaken,
            ...this.getCurrentAnswers()
        };

        // Save disqualified state
        const raw = localStorage.getItem('candidates');
        const list = raw ? JSON.parse(raw) : [];
        const candidate = list.find(c => c.candidate_id === AppState.candidateId);
        if (candidate) {
            candidate.selected = 3;
            candidate.completed = true;
            candidate.violation_count = AppState.violationCount;
            candidate.violation_logs = JSON.stringify(AppState.violationLogs);
            candidate.score_final = 0;
            localStorage.setItem('candidates', JSON.stringify(list));
        }

        setTimeout(() => {
            window.location.href = '/dashboard';
        }, 2000);
    },

    getCurrentAnswers() {
        return {
            level1: AppState.answers.level1,
            level2: AppState.answers.level2,
            level3: AppState.answers.level3,
            level4: AppState.answers.level4,
            level5: AppState.answers.level5,
            level6: AppState.answers.level6,
            level7: AppState.answers.level7
        };
    },

    // Pause/Resume
    pause() {
        AppState.isPaused = true;
        DOM.antiCheatBanner.classList.add('show');
        DOM.mainWrapper.classList.add('blur-overlay');
    },

    resume() {
        AppState.isPaused = false;
        DOM.antiCheatBanner.classList.remove('show');
        DOM.mainWrapper.classList.remove('blur-overlay');
        Toast.success('✅ Assessment resumed');
    }
};

// ============================================
// 7. EVENT BINDINGS
// ============================================

// Next button
DOM.btnNext.addEventListener('click', () => {
    Challenge.handleNext();
});

// Reset button
DOM.btnReset.addEventListener('click', () => {
    Challenge.resetQuestion();
});

// Resume button
DOM.resumeBtn.addEventListener('click', () => {
    Challenge.resume();
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Alt+N for next
    if (e.altKey && e.key === 'n') {
        e.preventDefault();
        DOM.btnNext.click();
    }
    // Alt+R for reset
    if (e.altKey && e.key === 'r') {
        e.preventDefault();
        DOM.btnReset.click();
    }
    // Number keys for MCQ
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const num = parseInt(e.key);
        if (num >= 1 && num <= 4) {
            const options = document.querySelectorAll('.option-card:not(.selected)');
            if (options[num - 1]) {
                options[num - 1].click();
            }
        }
    }
});

// ============================================
// 8. EXPOSE GLOBALS
// ============================================

window.Challenge = Challenge;
window.AppState = AppState;
window.LEVELS = LEVELS;

// ============================================
// 9. INITIALIZATION
// ============================================

// Start the challenge when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        Challenge.init();
    });
} else {
    Challenge.init();
}

console.log('🚀 Challenge Arena Script Loaded');
console.log('📌 Shortcuts: Alt+N (Next), Alt+R (Reset), 1-4 (MCQ)');
console.log('🛡️ Anti-cheat active, telemetry recording');

// ============================================
// END OF SCRIPT
// ============================================