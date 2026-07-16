let activeCandidate = null;
let dashboardRadarChart = null;

// DOM Elements
const welcomeMsg = document.getElementById('welcome-message');
const topId = document.getElementById('top-candidate-id');
const statusLight = document.getElementById('status-light');
const statusText = document.getElementById('status-text');
const profileProgressPercent = document.getElementById('profile-progress-percent');
const profileProgressFill = document.getElementById('profile-progress-fill');

const scoreLogicEl = document.getElementById('score-logic');
const scoreCreativityEl = document.getElementById('score-creativity');
const scoreAiEl = document.getElementById('score-ai');
const scoreFinalEl = document.getElementById('score-final');

const actionTitle = document.getElementById('action-title');
const actionDesc = document.getElementById('action-description');
const actionBtn = document.getElementById('btn-action-challenge');
const actionCard = document.getElementById('action-vector-card');

const invitationBox = document.getElementById('selected-invitation');
const invitationText = document.getElementById('invitation-text-content');

const badgesListEl = document.getElementById('dashboard-badges-list');

// Event Listeners
document.getElementById('btn-user-logout').addEventListener('click', handleLogout);
if (actionBtn) {
    actionBtn.addEventListener('click', handleUnlockChallenge);
}

// Session Loader
async function initDashboard() {
    try {
        const response = await fetch('/api/session');
        const data = await response.json();
        
        if (response.ok && data.logged_in) {
            activeCandidate = data.candidate;
            renderDashboardData();
        } else {
            window.location.href = '/login';
        }
    } catch (e) {
        // Local Sandbox Fallback Mode
        loadLocalSession();
    }
}
initDashboard();

function loadLocalSession() {
    const email = localStorage.getItem('active_session_email');
    if (!email) {
        window.location.href = '/login';
        return;
    }

    const raw = localStorage.getItem('candidates');
    const list = raw ? JSON.parse(raw) : [];
    activeCandidate = list.find(c => c.email.toLowerCase() === email.toLowerCase());

    if (!activeCandidate) {
        window.location.href = '/login';
        return;
    }

    // Safely parse JSON properties locally
    try {
        activeCandidate.badges = typeof activeCandidate.badges === 'string' ? JSON.parse(activeCandidate.badges) : activeCandidate.badges;
    } catch(e) {
        activeCandidate.badges = [];
    }

    renderDashboardData();
}

function renderDashboardData() {
    // 1. Populate Candidate Info
    welcomeMsg.textContent = `Welcome Back, ${activeCandidate.name}.`;
    topId.textContent = `CANDIDATE ID: ${activeCandidate.candidate_id}`;

    // 2. Process Selection Status
    let statusClass = 'status-color-pending';
    let statusString = 'PENDING SELECTION REVIEW';
    
    if (activeCandidate.selected === 1) {
        statusClass = 'status-color-selected';
        statusString = 'SELECTED CANDIDATE // INVITATION ISSUED';
        renderInvitationLetter();
    } else if (activeCandidate.selected === 2) {
        statusClass = 'status-color-rejected';
        statusString = 'APPLICATION ARCHIVED // NON-SHORTLISTED';
    } else if (activeCandidate.selected === 3) {
        statusClass = 'status-color-disqualified';
        statusString = 'DISQUALIFIED // SECURITY POLICY BREACHED';
    }

    statusLight.className = `status-dot ${statusClass}`;
    statusText.textContent = statusString;
    statusText.style.color = activeCandidate.selected === 1 ? 'var(--accent-green)' : (activeCandidate.selected === 3 || activeCandidate.selected === 2 ? 'var(--accent-red)' : 'var(--accent-yellow)');

    // 3. Process Progress States
    if (activeCandidate.completed) {
        profileProgressPercent.textContent = '100%';
        profileProgressFill.style.width = '100%';

        scoreLogicEl.textContent = Math.round(activeCandidate.score_logic);
        scoreCreativityEl.textContent = Math.round(activeCandidate.score_creativity);
        scoreAiEl.textContent = Math.round(activeCandidate.score_ai_knowledge);
        scoreFinalEl.textContent = activeCandidate.score_final.toFixed(1);

        // Hide action box, show completed
        actionCard.style.display = 'none';
        
        // Render badges
        renderBadges(activeCandidate.badges);
        
        // Draw Radar chart
        drawRadarChart();
    } else if (activeCandidate.started) {
        profileProgressPercent.textContent = '50%';
        profileProgressFill.style.width = '50%';
        
        actionTitle.textContent = 'AI Research Challenge In Progress';
        actionDesc.textContent = 'You have a challenge session initialized. Click below to resume your assessment missions.';
        actionBtn.textContent = 'Resume Assessment';
    } else {
        profileProgressPercent.textContent = '40%';
        profileProgressFill.style.width = '40%';
    }

    if (activeCandidate.selected === 3) {
        actionCard.style.display = 'block';
        actionTitle.textContent = 'Assessment Locked (Disqualified)';
        actionDesc.textContent = 'Your security warnings threshold (3/3) has been exceeded. You are locked out of the assessment arena.';
        actionBtn.style.display = 'none';
        
        scoreLogicEl.textContent = '0';
        scoreCreativityEl.textContent = '0';
        scoreAiEl.textContent = '0';
        scoreFinalEl.textContent = '0.0';
    }
}

function renderInvitationLetter() {
    invitationBox.style.display = 'block';
    const rawTemplate = `
Subject: Official Selection Letter - AI NEXT GEN RESEARCH WORKSHOP 2026

Dear ${activeCandidate.name},

Congratulations.

Our selection vector has completed processing. Based on your Logic and AI Knowledge profile score (${activeCandidate.score_final.toFixed(1)}%), we are pleased to confirm that you have been SELECTED as one of the 30 minds for the AI Next Gen Research Workshop 2026 on August 15-16.

This is a premium hands-on workshop covering LLMs, custom Agent design, RAG databases, and semantic tool building.

Details:
Venue: AI Research Hub, MIT Media Lab Sandbox
Date: August 15-16, 2026

Welcome to the Next Gen cohort.

Best regards,
Selection Board,
AI NEXT GEN Research Labs
    `;
    invitationText.textContent = rawTemplate.trim();
}

function renderBadges(badges) {
    badgesListEl.innerHTML = '';
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

            badgesListEl.innerHTML += `
                <div class="badge-item" style="box-shadow: 0 0 10px rgba(99, 102, 241, 0.1); margin-bottom: 5px;">${icon} ${badge}</div>
            `;
        });
    } else {
        badgesListEl.innerHTML = `<span style="color: var(--text-muted); font-size: 0.8rem;">No badges earned.</span>`;
    }
}

async function handleUnlockChallenge(e) {
    e.preventDefault();
    try {
        const response = await fetch('/api/challenge/start', { method: 'POST' });
        if (response.ok) {
            window.location.href = '/challenge';
        }
    } catch(err) {
        // Fallback Local Storage start session
        const raw = localStorage.getItem('candidates');
        const list = raw ? JSON.parse(raw) : [];
        let candidate = list.find(c => c.email.toLowerCase() === activeCandidate.email.toLowerCase());
        if (candidate) {
            candidate.started = true;
            localStorage.setItem('candidates', JSON.stringify(list));
            window.location.href = '/challenge';
        }
    }
}

async function handleLogout() {
    try {
        const response = await fetch('/api/logout', { method: 'POST' });
        if (response.ok) {
            window.location.href = '/login';
        }
    } catch(err) {
        // Fallback local logout
        localStorage.removeItem('active_session_email');
        localStorage.removeItem('active_session_candidate_id');
        window.location.href = '/login';
    }
}

function drawRadarChart() {
    const placeholder = document.getElementById('radar-placeholder');
    if (placeholder) placeholder.style.display = 'none';

    const ctx = document.getElementById('dashboardRadar').getContext('2d');
    
    const radarData = [
        (activeCandidate.score_logic / 40) * 100,
        (activeCandidate.score_creativity / 20) * 100,
        (activeCandidate.score_ai_knowledge / 20) * 100,
        (activeCandidate.score_problem_solving / 10) * 100,
        (activeCandidate.score_time / 10) * 100
    ];

    if (dashboardRadarChart) {
        dashboardRadarChart.destroy();
    }

    dashboardRadarChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['Logic', 'Creativity', 'AI Literacy', 'Problem Solving', 'Time Management'],
            datasets: [{
                data: radarData,
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
