/**
 * ============================================
 * AI NEXT GEN 2026 - DASHBOARD SCRIPT
 * Version: 2.0.0
 * Description: Complete user dashboard functionality
 * ============================================
 */

// ============================================
// 1. STATE MANAGEMENT
// ============================================

const DashboardState = {
    candidate: null,
    charts: {
        radar: null
    },
    stats: {
        completedMissions: 0,
        totalMissions: 7,
        overallProgress: 0,
        xp: 0,
        hoursInvested: 0
    },
    session: {
        isActive: false,
        startTime: null,
        duration: 0
    },
    isLoaded: false
};

// ============================================
// 2. DOM CACHE
// ============================================

const DOM = {
    // Header
    welcomeMsg: document.getElementById('welcome-message'),
    topId: document.getElementById('top-candidate-id'),
    userName: document.getElementById('user-name'),
    
    // Status
    statusLight: document.getElementById('status-light'),
    statusText: document.getElementById('status-text'),
    
    // Progress
    profileProgressPercent: document.getElementById('profile-progress-percent'),
    profileProgressFill: document.getElementById('profile-progress-fill'),
    
    // Scores
    scoreLogic: document.getElementById('score-logic'),
    scoreCreativity: document.getElementById('score-creativity'),
    scoreAi: document.getElementById('score-ai'),
    scoreTech: document.getElementById('score-tech'),
    scoreOverall: document.getElementById('score-overall'),
    scoreFinal: document.getElementById('score-final'),
    scoreFinalDial: document.getElementById('score-final-dial'),
    
    // Actions
    actionTitle: document.getElementById('action-title'),
    actionDesc: document.getElementById('action-description'),
    actionBtn: document.getElementById('btn-action-challenge'),
    actionIcon: document.getElementById('action-icon'),
    actionCard: document.getElementById('action-vector-card'),
    
    // Invitation
    invitationBox: document.getElementById('selected-invitation'),
    invitationText: document.getElementById('invitation-text-content'),
    
    // Badges
    badgesList: document.getElementById('dashboard-badges-list'),
    
    // Metrics
    metricHours: document.getElementById('metric-hours'),
    metricXp: document.getElementById('metric-xp'),
    metricProgress: document.getElementById('metric-progress'),
    
    // Quick Stats
    quickQuestions: document.getElementById('quick-questions'),
    quickCorrect: document.getElementById('quick-correct'),
    quickAccuracy: document.getElementById('quick-accuracy'),
    
    // Rank
    rankBadge: document.getElementById('rank-badge'),
    
    // Charts
    radarPlaceholder: document.getElementById('radar-placeholder'),
    radarCanvas: document.getElementById('dashboardRadar'),
    
    // Webcam
    cameraDot: document.getElementById('right-camera-dot'),
    cameraCircle: document.getElementById('camera-circle'),
    webcamStatus: document.getElementById('webcam-status-text'),
    
    // Missions
    missionIndicators: {
        m1: document.getElementById('ind-m1'),
        m2: document.getElementById('ind-m2'),
        m3: document.getElementById('ind-m3'),
        m4: document.getElementById('ind-m4'),
        m5: document.getElementById('ind-m5'),
        m6: document.getElementById('ind-m6'),
        m7: document.getElementById('ind-m7')
    },
    missionCount: document.getElementById('mission-count'),
    
    // Buttons
    logoutBtn: document.getElementById('btn-user-logout'),
    shareBtn: document.getElementById('btn-share-invite'),
    
    // Timers
    sessionTime: document.getElementById('session-time'),
    updateTime: document.getElementById('update-time')
};

// ============================================
// 3. UTILITY FUNCTIONS
// ============================================

const Utils = {
    formatTime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        
        if (h > 0) {
            return `${h}h ${m}m ${s}s`;
        } else if (m > 0) {
            return `${m}m ${s}s`;
        }
        return `${s}s`;
    },

    getStatusInfo(selected) {
        const map = {
            0: { class: 'status-color-pending', text: 'PENDING SELECTION', color: 'var(--accent-yellow)', icon: '⏳' },
            1: { class: 'status-color-selected', text: 'SELECTED ✅', color: 'var(--accent-green)', icon: '🎉' },
            2: { class: 'status-color-rejected', text: 'ARCHIVED', color: 'var(--accent-red)', icon: '📄' },
            3: { class: 'status-color-disqualified', text: 'DISQUALIFIED', color: '#6B7280', icon: '🚫' }
        };
        return map[selected] || map[0];
    },

    getRankInfo(score) {
        if (score >= 85) {
            return { text: '🏅 Platinum', color: '#16A34A', bg: 'rgba(16,185,129,0.2)' };
        } else if (score >= 70) {
            return { text: '🥇 Gold', color: '#F59E0B', bg: 'rgba(245,158,11,0.2)' };
        } else if (score >= 55) {
            return { text: '🥈 Silver', color: '#9CA3AF', bg: 'rgba(156,163,175,0.2)' };
        } else if (score >= 40) {
            return { text: '🥉 Bronze', color: '#B45309', bg: 'rgba(180,83,9,0.2)' };
        }
        return { text: '🏅 Not Ranked', color: '#6B7280', bg: 'rgba(107,114,128,0.1)' };
    },

    getBadgeIcon(badge) {
        const map = {
            'Logic Master': '🧠',
            'Problem Solver': '⚡',
            'AI Explorer': '🔍',
            'Future Researcher': '📡',
            'Prompt Engineer': '💻',
            'AI Thinker': '💡',
            'Innovation Champion': '🚀',
            'AI Aspirant': '🌟'
        };
        return map[badge] || '🏆';
    },

    parseJSON(str, fallback = []) {
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

    getProgress(candidate) {
        if (candidate.completed) return 100;
        if (candidate.started) return 50;
        return 0;
    },

    getCompletedMissions(candidate) {
        const levels = ['level1_ans', 'level2_ans', 'level3_ans', 'level4_ans', 'level5_ans', 'level6_ans', 'level7_ans'];
        let completed = 0;
        
        levels.forEach(key => {
            const val = candidate[key];
            if (val) {
                try {
                    const parsed = typeof val === 'string' ? JSON.parse(val) : val;
                    if (typeof parsed === 'object' && parsed !== null) {
                        const values = Object.values(parsed);
                        if (values.some(v => v && v.length > 0)) {
                            completed++;
                        }
                    } else if (val && val.length > 0) {
                        completed++;
                    }
                } catch {
                    if (val && val.length > 0) {
                        completed++;
                    }
                }
            }
        });
        
        return completed;
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
// 5. DASHBOARD ENGINE
// ============================================

const Dashboard = {
    // Initialize dashboard
    async init() {
        console.log('🚀 Dashboard Initializing...');
        Toast.init();

        try {
            const response = await fetch('/api/session');
            const data = await response.json();

            if (response.ok && data.logged_in) {
                DashboardState.candidate = data.candidate;
                this.render();
                this.startSessionTimer();
            } else {
                this.loadLocalSession();
            }
        } catch (error) {
            console.warn('⚠️ API error, loading local session:', error);
            this.loadLocalSession();
        }

        this.bindEvents();
    },

    // Load local session (fallback)
    loadLocalSession() {
        const email = localStorage.getItem('active_session_email');
        if (!email) {
            window.location.href = '/login';
            return;
        }

        const raw = localStorage.getItem('candidates');
        const list = raw ? JSON.parse(raw) : [];
        const candidate = list.find(c => c.email.toLowerCase() === email.toLowerCase());

        if (!candidate) {
            window.location.href = '/login';
            return;
        }

        DashboardState.candidate = candidate;
        this.render();
        this.startSessionTimer();

        Toast.info('📂 Using local data (offline mode)');
    },

    // Render dashboard
    render() {
        const c = DashboardState.candidate;
        if (!c) return;

        // Header
        DOM.welcomeMsg.textContent = `Welcome Back, ${c.name}.`;
        DOM.topId.textContent = `CANDIDATE ID: ${c.candidate_id}`;
        if (DOM.userName) DOM.userName.textContent = c.name;

        // Status
        const status = Utils.getStatusInfo(c.selected);
        DOM.statusLight.className = `status-dot ${status.class}`;
        DOM.statusText.textContent = status.text;
        DOM.statusText.style.color = status.color;

        // Progress
        const progress = Utils.getProgress(c);
        DOM.profileProgressPercent.textContent = `${progress}%`;
        DOM.profileProgressFill.style.width = `${progress}%`;

        // Metrics
        const missionsCompleted = Utils.getCompletedMissions(c);
        const totalMissions = 7;
        const xp = c.xp || (c.score_final ? Math.round(c.score_final * 10) : (missionsCompleted * 50));
        const hours = c.hours_invested || Math.max(1, Math.round((c.time_taken || 1800) / 3600));

        DOM.metricHours.textContent = hours;
        DOM.metricXp.textContent = xp;
        DOM.metricProgress.textContent = `${Math.round((missionsCompleted / totalMissions) * 100)}%`;

        // Scores
        if (c.completed) {
            DOM.scoreLogic.textContent = Math.round(c.score_logic || 0);
            DOM.scoreCreativity.textContent = Math.round(c.score_creativity || 0);
            DOM.scoreAi.textContent = Math.round(c.score_ai_knowledge || 0);
            DOM.scoreTech.textContent = Math.round(c.score_problem_solving || 0);
            
            const overall = (c.score_logic || 0) + (c.score_creativity || 0) + 
                           (c.score_ai_knowledge || 0) + (c.score_problem_solving || 0);
            DOM.scoreOverall.textContent = Math.round(overall);
            DOM.scoreFinal.textContent = (c.score_final || 0).toFixed(1);
            DOM.scoreFinalDial.textContent = (c.score_final || 0).toFixed(1);

            // Quick stats
            const totalQ = c.total_questions || 35;
            const correct = c.correct_answers || Math.round((c.score_final / 100) * totalQ);
            DOM.quickQuestions.textContent = totalQ;
            DOM.quickCorrect.textContent = correct;
            DOM.quickAccuracy.textContent = totalQ > 0 ? `${Math.round((correct / totalQ) * 100)}%` : '0%';

            // Rank
            const rank = Utils.getRankInfo(c.score_final || 0);
            DOM.rankBadge.textContent = rank.text;
            DOM.rankBadge.style.background = rank.bg;
            DOM.rankBadge.style.color = rank.color;

            // Badges
            this.renderBadges(c);

            // Radar chart
            this.renderRadarChart(c);

            // Hide action card
            DOM.actionCard.style.display = 'none';
        } else if (c.started) {
            DOM.actionTitle.textContent = '⏳ Challenge In Progress';
            DOM.actionDesc.textContent = 'You have an active assessment session. Resume to continue.';
            DOM.actionBtn.textContent = 'Resume Assessment';
            DOM.actionIcon.textContent = '⚔️';
            DOM.actionBtn.style.display = 'block';
            DOM.actionBtn.href = '/challenge';
        } else {
            DOM.actionTitle.textContent = '🔒 Assessment Locked';
            DOM.actionDesc.textContent = 'Complete your profile to unlock the challenge arena.';
            DOM.actionBtn.textContent = 'Start Assessment';
            DOM.actionIcon.textContent = '🔒';
            DOM.actionBtn.style.display = 'block';
            DOM.actionBtn.href = '/challenge';
        }

        // Disqualified state
        if (c.selected === 3) {
            DOM.actionCard.style.display = 'block';
            DOM.actionTitle.textContent = '🚫 Assessment Locked (Disqualified)';
            DOM.actionDesc.textContent = 'Security policy violation (3/3). You are locked out.';
            DOM.actionBtn.style.display = 'none';
            DOM.actionIcon.textContent = '🚫';
            
            DOM.scoreLogic.textContent = '0';
            DOM.scoreCreativity.textContent = '0';
            DOM.scoreAi.textContent = '0';
            DOM.scoreTech.textContent = '0';
            DOM.scoreOverall.textContent = '0';
            DOM.scoreFinal.textContent = '0.0';
            DOM.scoreFinalDial.textContent = '0.0';
        }

        // Webcam status
        this.renderWebcamStatus(c);

        // Mission indicators
        this.renderMissions(c);

        // Invitation
        if (c.selected === 1) {
            this.renderInvitation(c);
        }

        // Update last updated time
        if (DOM.updateTime) {
            DOM.updateTime.textContent = new Date().toLocaleTimeString();
        }

        DashboardState.isLoaded = true;
    },

    // Render badges
    renderBadges(candidate) {
        let badges = Utils.parseJSON(candidate.badges, []);
        
        if (!DOM.badgesList) return;

        if (badges && badges.length > 0) {
            DOM.badgesList.innerHTML = badges.map(badge => `
                <div class="badge-item">
                    ${Utils.getBadgeIcon(badge)} ${badge}
                </div>
            `).join('');
        } else {
            DOM.badgesList.innerHTML = `
                <div style="color: var(--text-muted); font-size: 0.8rem; padding: 8px 0;">
                    No badges earned yet. Complete missions to unlock achievements!
                </div>
            `;
        }
    },

    // Render radar chart
    renderRadarChart(candidate) {
        const ctx = DOM.radarCanvas;
        if (!ctx) return;

        if (DOM.radarPlaceholder) {
            DOM.radarPlaceholder.style.display = 'none';
        }

        const data = [
            Math.min((candidate.score_logic || 0) / 40 * 100, 100),
            Math.min((candidate.score_creativity || 0) / 20 * 100, 100),
            Math.min((candidate.score_ai_knowledge || 0) / 20 * 100, 100),
            Math.min((candidate.score_problem_solving || 0) / 10 * 100, 100),
            Math.min((candidate.score_time || 0) / 10 * 100, 100)
        ];

        if (DashboardState.charts.radar) {
            DashboardState.charts.radar.destroy();
        }

        DashboardState.charts.radar = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: ['Logic', 'Creativity', 'AI Literacy', 'Problem Solving', 'Time Management'],
                datasets: [{
                    data: data,
                    backgroundColor: 'rgba(0, 166, 192, 0.15)',
                    borderColor: '#00A6C0',
                    pointBackgroundColor: '#00A6C0',
                    pointBorderColor: '#D8D7CE',
                    borderWidth: 2
                }]
            },
            options: {
                scales: {
                    r: {
                        angleLines: { color: 'rgba(34, 40, 49, 0.08)' },
                        grid: { color: 'rgba(34, 40, 49, 0.08)' },
                        pointLabels: {
                            color: '#222831',
                            font: { family: 'Inter', size: 9 }
                        },
                        ticks: { 
                            display: false, 
                            maxTicksLimit: 5,
                            backdropColor: 'transparent'
                        },
                        min: 0,
                        max: 100
                    }
                },
                plugins: { 
                    legend: { display: false }
                },
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 1000,
                    easing: 'easeOutQuart'
                }
            }
        });
    },

    // Render webcam status
    renderWebcamStatus(candidate) {
        const isActive = candidate.webcam_status === 'Active';
        
        if (DOM.cameraDot) {
            DOM.cameraDot.className = `webcam-indicator-dot ${isActive ? 'active' : 'inactive'}`;
        }
        
        if (DOM.cameraCircle) {
            DOM.cameraCircle.className = `camera-circle ${isActive ? 'active' : ''}`;
        }
        
        if (DOM.webcamStatus) {
            DOM.webcamStatus.textContent = isActive ? '✅ Viewport tracking active' : '❌ Camera offline';
        }
    },

    // Render mission indicators
    renderMissions(candidate) {
        const missions = [
            { key: 'level1_ans', id: 'm1' },
            { key: 'level2_ans', id: 'm2' },
            { key: 'level3_ans', id: 'm3' },
            { key: 'level4_ans', id: 'm4' },
            { key: 'level5_ans', id: 'm5' },
            { key: 'level6_ans', id: 'm6' },
            { key: 'level7_ans', id: 'm7' }
        ];

        let completed = 0;

        missions.forEach(({ key, id }) => {
            const indicator = DOM.missionIndicators[id];
            if (!indicator) return;

            const val = candidate[key];
            const isCompleted = this.isMissionCompleted(val);

            if (isCompleted) {
                indicator.textContent = '✅';
                indicator.className = 'mission-toggle-indicator completed';
                completed++;
            } else if (val && val.length > 0) {
                indicator.textContent = '⏳';
                indicator.className = 'mission-toggle-indicator in-progress';
            } else {
                indicator.textContent = '⚪';
                indicator.className = 'mission-toggle-indicator locked';
            }
        });

        if (DOM.missionCount) {
            DOM.missionCount.textContent = `${completed}/7`;
        }

        DashboardState.stats.completedMissions = completed;
    },

    isMissionCompleted(val) {
        if (!val) return false;
        try {
            const parsed = typeof val === 'string' ? JSON.parse(val) : val;
            if (typeof parsed === 'object' && parsed !== null) {
                const values = Object.values(parsed);
                return values.some(v => v && v.length > 0);
            }
            return val && val.length > 0;
        } catch {
            return val && val.length > 0;
        }
    },

    // Render invitation
    renderInvitation(candidate) {
        if (!DOM.invitationBox) return;

        DOM.invitationBox.style.display = 'block';
        DOM.invitationBox.classList.add('show');

        const template = `
🎉 OFFICIAL INVITATION - AI NEXT GEN WORKSHOP 2026

Dear ${candidate.name},

Congratulations! Based on your outstanding performance (${(candidate.score_final || 0).toFixed(1)}/100), you have been SELECTED for the AI Next Gen Research Workshop 2026.

📅 Date: August 15-16, 2026
📍 Location: AI NEXT GEN Research Labs
👥 Seats: 30 selected candidates

Topics covered:
• LLMs and Transformer Architecture
• Custom AI Agent Design
• RAG Database Systems
• Semantic Tool Building
• Production AI Deployment

Your Candidate ID: ${candidate.candidate_id}

Please confirm your attendance within 24 hours.

Welcome to the future of AI!

Best regards,
Selection Board
AI NEXT GEN Research Labs
        `;

        DOM.invitationText.textContent = template.trim();
    },

    // Session timer
    startSessionTimer() {
        let startTime = Date.now();
        
        setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            if (DOM.sessionTime) {
                DOM.sessionTime.textContent = `⏱️ ${Utils.formatTime(elapsed)}`;
            }
        }, 1000);
    },

    // Bind events
    bindEvents() {
        // Logout
        DOM.logoutBtn.addEventListener('click', this.handleLogout);

        // Action button
        if (DOM.actionBtn) {
            DOM.actionBtn.addEventListener('click', this.handleAction);
        }

        // Share invitation
        if (DOM.shareBtn) {
            DOM.shareBtn.addEventListener('click', this.handleShare);
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', this.handleKeyboardShortcuts);

        // Auto-refresh every 60 seconds
        setInterval(() => {
            if (DashboardState.isLoaded) {
                this.refresh();
            }
        }, 60000);
    },

    // Handle logout
    async handleLogout() {
        if (!confirm('Are you sure you want to logout?')) return;

        try {
            await fetch('/api/logout', { method: 'POST' });
            localStorage.removeItem('active_session_email');
            localStorage.removeItem('active_session_candidate_id');
            window.location.href = '/login';
        } catch (error) {
            localStorage.removeItem('active_session_email');
            localStorage.removeItem('active_session_candidate_id');
            window.location.href = '/login';
        }
    },

    // Handle action button
    handleAction(e) {
        e.preventDefault();
        
        const candidate = DashboardState.candidate;
        if (!candidate) return;

        if (candidate.selected === 3) {
            Toast.error('🚫 Assessment locked. Contact support.');
            return;
        }

        if (candidate.started || candidate.completed) {
            window.location.href = '/challenge';
        } else {
            // Start challenge
            Dashboard.startChallenge();
        }
    },

    // Start challenge
    async startChallenge() {
        try {
            const response = await fetch('/api/challenge/start', { method: 'POST' });
            if (response.ok) {
                Toast.success('🚀 Assessment starting...');
                window.location.href = '/challenge';
            } else {
                this.localStartChallenge();
            }
        } catch (error) {
            this.localStartChallenge();
        }
    },

    localStartChallenge() {
        const raw = localStorage.getItem('candidates');
        const list = raw ? JSON.parse(raw) : [];
        const candidate = list.find(c => c.candidate_id === DashboardState.candidate.candidate_id);
        
        if (candidate) {
            candidate.started = true;
            localStorage.setItem('candidates', JSON.stringify(list));
            Toast.success('🚀 Assessment starting locally...');
            window.location.href = '/challenge';
        } else {
            Toast.error('❌ Failed to start assessment');
        }
    },

    // Share invitation
    async handleShare() {
        const content = DOM.invitationText?.textContent || '';
        
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'AI Next Gen Workshop Invitation',
                    text: content
                });
                Toast.success('📤 Shared successfully!');
            } catch (error) {
                if (error.name !== 'AbortError') {
                    Toast.warning('Share cancelled or unavailable');
                }
            }
        } else {
            try {
                await navigator.clipboard.writeText(content);
                Toast.success('📋 Invitation copied to clipboard!');
            } catch {
                Toast.warning('📋 Please copy the invitation manually');
            }
        }
    },

    // Keyboard shortcuts
    handleKeyboardShortcuts(e) {
        // Ctrl+D for dashboard
        if (e.ctrlKey && e.key === 'd') {
            e.preventDefault();
            Toast.info('📊 Dashboard', 1000);
        }
        
        // Ctrl+C for challenge
        if (e.ctrlKey && e.key === 'c') {
            e.preventDefault();
            window.location.href = '/challenge';
        }
        
        // Ctrl+R for refresh
        if (e.ctrlKey && e.key === 'r') {
            e.preventDefault();
            Dashboard.refresh();
        }
    },

    // Refresh dashboard
    refresh() {
        if (DashboardState.isLoading) return;
        DashboardState.isLoading = true;

        fetch('/api/session')
            .then(response => response.json())
            .then(data => {
                if (data.logged_in) {
                    DashboardState.candidate = data.candidate;
                    Dashboard.render();
                    Toast.success('🔄 Dashboard refreshed', 1500);
                }
            })
            .catch(() => {
                // Keep existing data
            })
            .finally(() => {
                DashboardState.isLoading = false;
            });
    }
};

// ============================================
// 6. EXPOSE GLOBALS
// ============================================

window.Dashboard = Dashboard;
window.DashboardState = DashboardState;

// ============================================
// 7. INITIALIZATION
// ============================================

// Start dashboard when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        Dashboard.init();
    });
} else {
    Dashboard.init();
}

console.log('🚀 Dashboard Script Loaded');
console.log('📌 Shortcuts: Ctrl+D (Dashboard), Ctrl+C (Challenge), Ctrl+R (Refresh)');

// ============================================
// END OF SCRIPT
// ============================================