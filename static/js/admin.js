let candidatesList = [];

// DOM elements
const tableBody = document.getElementById('admin-table-body');
const searchInput = document.getElementById('admin-search-input');
const collegeFilter = document.getElementById('admin-filter-college');
const sortSelect = document.getElementById('admin-sort-select');
const statTotal = document.getElementById('stat-total-applicants');
const statAvg = document.getElementById('stat-avg-score');
const statHigh = document.getElementById('stat-high-score');
const statShortlisted = document.getElementById('stat-shortlisted');

// Event Listeners
searchInput.addEventListener('input', renderCandidates);
collegeFilter.addEventListener('change', renderCandidates);
sortSelect.addEventListener('change', renderCandidates);
document.getElementById('btn-admin-logout').addEventListener('click', handleLogout);
document.getElementById('btn-auto-shortlist').addEventListener('click', handleAutoShortlist);
document.getElementById('btn-export-csv').addEventListener('click', exportCSV);
document.getElementById('btn-print-pdf').addEventListener('click', () => window.print());
document.getElementById('btn-email-templates').addEventListener('click', openEmailsModal);

// Close Modals
document.getElementById('btn-close-detail').addEventListener('click', () => {
    document.getElementById('detail-modal').classList.remove('active');
});
document.getElementById('btn-close-emails').addEventListener('click', () => {
    document.getElementById('emails-modal').classList.remove('active');
});

function loadCandidatesLocally() {
    const raw = localStorage.getItem('candidates');
    let list = raw ? JSON.parse(raw) : [];
    if (list.length === 0) {
        list = [
            { 
                id: 1, 
                candidate_id: "AI26-4821", 
                session_id: "s1-uuid-4821",
                name: "Pranav Raman", 
                email: "pranav@iitm.ac.in", 
                phone: "+91 9444455555", 
                college: "IIT Madras", 
                department: "Computer Science", 
                year: 3, 
                roll_number: "CS23B045", 
                time_taken: 360, 
                tab_switches: 0, 
                violation_count: 0,
                violation_logs: '[]',
                backspace_count: 8,
                typing_speed_avg: 210,
                typing_pattern_variance: 45.2,
                mouse_moves_count: 1420,
                idle_duration: 12,
                webcam_status: "Active",
                location_data: "13.0827, 80.2707",
                score_logic: 38.0, 
                score_creativity: 19.0, 
                score_ai_knowledge: 19.0, 
                score_problem_solving: 9.5, 
                score_time: 8.7, 
                score_final: 94.2, 
                badges: '["Logic Master", "AI Explorer", "Future Researcher"]', 
                selected: 1, 
                level1_ans: '{"q1":"▽","q2":"63"}', 
                level2_ans: "17 minutes", 
                level3_ans: "I will establish a critique loop where Claude models structural layout, ChatGPT constructs code, and Gemini evaluates logic and API constraints.", 
                level4_ans: "<context>Create startup website</context><rules>Use modern layout</rules>", 
                level5_ans: '{"q1":"Fine-Tuning Model Weights","q2":"RAG injects verified external context into LLM context windows to eliminate general factual logic guesses."}', 
                level6_ans: '{"q1":"3","q2":"Divide 9 balls into three groups of three. Weigh A and B. Weigh remainder."}', 
                level7_ans: "Healthcare: AI anomaly diagnostics for remote clinics using satellite telecommunications." 
            },
            { 
                id: 2, 
                candidate_id: "AI26-1029", 
                session_id: "s2-uuid-1029",
                name: "Sanya Sen", 
                email: "sanya@bits-pilani.ac.in", 
                phone: "+91 9111122222", 
                college: "BITS Pilani", 
                department: "Information Systems", 
                year: 4, 
                roll_number: "2022A7PS001G", 
                time_taken: 290, 
                tab_switches: 0, 
                violation_count: 0,
                violation_logs: '[]',
                backspace_count: 14,
                typing_speed_avg: 180,
                typing_pattern_variance: 55.4,
                mouse_moves_count: 980,
                idle_duration: 5,
                webcam_status: "Active",
                location_data: "15.9129, 79.7400",
                score_logic: 36.0, 
                score_creativity: 18.0, 
                score_ai_knowledge: 18.0, 
                score_problem_solving: 9.5, 
                score_time: 10.0, 
                score_final: 91.5, 
                badges: '["Logic Master", "AI Explorer", "Future Researcher"]', 
                selected: 1, 
                level1_ans: '{"q1":"▽","q2":"63"}', 
                level2_ans: "17 minutes", 
                level3_ans: "Deploy Claude for structural writing, ChatGPT for API integration drafts, and Gemini for cross-checking fact and schema details.", 
                level4_ans: "Act as front-end expert and write index.html with futuristic CSS.", 
                level5_ans: '{"q1":"Fine-Tuning Model Weights","q2":"Injecting real-time database queries directly into prompt contexts ensures ground truths."}', 
                level6_ans: '{"q1":"3","q2":"Divide into three groups of three. Compare weights."}', 
                level7_ans: "Farming: IoT sensor feeds processed via tinyML on-device models to optimize localized drip irrigation." 
            },
            { 
                id: 3, 
                candidate_id: "AI26-3021", 
                session_id: "s3-uuid-3021",
                name: "Aditya Nair", 
                email: "aditya@nitt.edu", 
                phone: "+91 9888877777", 
                college: "NIT Trichy", 
                department: "Electronics & Communication", 
                year: 3, 
                roll_number: "108123008", 
                time_taken: 330, 
                tab_switches: 1, 
                violation_count: 1,
                violation_logs: '[{"timestamp":"14:05:22","type":"Tab Switch","detail":"Candidate switched to another window."}]',
                backspace_count: 22,
                typing_speed_avg: 240,
                typing_pattern_variance: 30.1,
                mouse_moves_count: 1560,
                idle_duration: 18,
                webcam_status: "Active",
                location_data: "10.7905, 78.7047",
                score_logic: 35.0, 
                score_creativity: 17.5, 
                score_ai_knowledge: 17.0, 
                score_problem_solving: 9.0, 
                score_time: 9.5, 
                score_final: 85.0, // Capped/Penalized for 1 violation
                badges: '["Logic Master", "AI Explorer"]', 
                selected: 1, 
                level1_ans: '{"q1":"▽","q2":"63"}', 
                level2_ans: "17 minutes", 
                level3_ans: "ChatGPT plans architecture, Claude translates concepts to clean modules, and Gemini reviews security vectors.", 
                level4_ans: "Construct single page layout inside XML instructions.", 
                level5_ans: '{"q1":"Fine-Tuning Model Weights","q2":"It augments standard generative completions with deterministic text databases."}', 
                level6_ans: '{"q1":"3","q2":"Divide balls: 3, 3, 3. Weigh group A vs group B."}', 
                level7_ans: "Traffic: Smart traffic routing by deploying AI cameras scanning vehicles." 
            },
            {
                id: 4,
                candidate_id: "AI26-9281",
                session_id: "s4-uuid-9281",
                name: "Vikram Seth",
                email: "vikram@stan.edu",
                phone: "+91 9999988888",
                college: "Stanford",
                department: "AI Research Lab",
                year: 4,
                roll_number: "ST2026-09",
                time_taken: 110,
                tab_switches: 3,
                violation_count: 3,
                violation_logs: '[{"timestamp":"11:10:15","type":"Tab Switch","detail":"Tab switch detected."},{"timestamp":"11:10:45","type":"Copy Attempt","detail":"Copy paste intercepted."},{"timestamp":"11:11:12","type":"Fullscreen Exit","detail":"Leaving assessment full screen."}]',
                backspace_count: 0,
                typing_speed_avg: 1800, // suspicious high speed
                typing_pattern_variance: 2.1,
                mouse_moves_count: 45,
                idle_duration: 3,
                webcam_status: "Denied",
                location_data: "37.4275, -122.1697",
                score_logic: 0,
                score_creativity: 0,
                score_ai_knowledge: 0,
                score_problem_solving: 0,
                score_time: 0,
                score_final: 0.0,
                badges: '[]',
                selected: 3, // Disqualified
                level1_ans: '{"q1":"","q2":""}',
                level2_ans: "",
                level3_ans: "AI automation script copy...",
                level4_ans: "",
                level5_ans: '{"q1":"","q2":""}',
                level6_ans: '{"q1":"","q2":""}',
                level7_ans: ""
            }
        ];
        localStorage.setItem('candidates', JSON.stringify(list));
    }
    candidatesList = list;
}

// Init load
async function loadCandidates() {
    try {
        const response = await fetch('/api/admin/candidates');
        if (response.status === 401) {
            window.location.href = '/admin-login';
            return;
        }
        if (response.ok) {
            candidatesList = await response.json();
        } else {
            loadCandidatesLocally();
        }
    } catch (err) {
        loadCandidatesLocally();
    }
    
    populateCollegeFilterOptions();
    updateStats();
    renderCandidates();
}
loadCandidates();

function populateCollegeFilterOptions() {
    const colleges = [...new Set(candidatesList.map(c => c.college.trim()))];
    collegeFilter.innerHTML = '<option value="">All Colleges</option>';
    colleges.forEach(col => {
        if (col) {
            collegeFilter.innerHTML += `<option value="${escapeHTML(col)}">${escapeHTML(col)}</option>`;
        }
    });
}

function updateStats() {
    if (candidatesList.length === 0) {
        statTotal.textContent = '0';
        statAvg.textContent = '0.0';
        statHigh.textContent = '0.0';
        statShortlisted.textContent = '0 / 30';
        return;
    }

    const validCandidates = candidatesList.filter(c => c.selected !== 3); // exclude disqualified from avg statistics
    const total = candidatesList.length;
    
    const scores = validCandidates.map(c => c.score_final);
    const avg = scores.length > 0 ? (scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0.0;
    const high = scores.length > 0 ? Math.max(...scores) : 0.0;
    const shortlistedCount = candidatesList.filter(c => c.selected === 1).length;

    statTotal.textContent = total;
    statAvg.textContent = avg.toFixed(1);
    statHigh.textContent = high.toFixed(1);
    statShortlisted.textContent = `${shortlistedCount} / 30`;
}

function renderCandidates() {
    const searchVal = searchInput.value.toLowerCase().trim();
    const collegeVal = collegeFilter.value.toLowerCase();
    const sortVal = sortSelect.value;

    let filtered = candidatesList.filter(c => {
        const matchesSearch = c.name.toLowerCase().includes(searchVal) || 
                              c.candidate_id.toLowerCase().includes(searchVal) ||
                              c.email.toLowerCase().includes(searchVal);
        const matchesCollege = collegeVal === '' || c.college.toLowerCase() === collegeVal;
        return matchesSearch && matchesCollege;
    });

    // Apply Sorting
    filtered.sort((a, b) => {
        if (sortVal === 'time') {
            return a.time_taken - b.time_taken;
        } else if (sortVal === 'creativity') {
            return b.score_creativity - a.score_creativity;
        } else {
            return b.score_final - a.score_final; // top scores desc
        }
    });

    tableBody.innerHTML = '';
    if (filtered.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: var(--text-muted); padding: 3rem;">No candidates match criteria.</td></tr>`;
        return;
    }

    filtered.forEach((candidate, index) => {
        const rank = index + 1;
        const timeFormatted = formatTime(candidate.time_taken);
        
        // Webcam label
        const webcamLabel = candidate.webcam_status === 'Active'
            ? `<span style="color: var(--accent-green); font-family: var(--font-mono);">● ACTIVE</span>`
            : `<span style="color: var(--accent-red); font-family: var(--font-mono);">⚠ DENIED</span>`;

        // Violations count status tag
        const violationBadge = candidate.violation_count >= 3
            ? `<span class="badge-cheated" style="font-weight:bold;">3/3 DISQ</span>`
            : candidate.violation_count > 0
                ? `<span class="badge-cheated" style="background:rgba(234,179,8,0.15); border-color:rgba(234,179,8,0.3); color:var(--accent-yellow);">${candidate.violation_count}/3 WARN</span>`
                : `<span class="badge-safe">0/3 SAFE</span>`;
                
        // Selection status badge
        let statusBadge = '';
        if (candidate.selected === 1) {
            statusBadge = `<span class="status-badge status-shortlisted">SELECTED</span>`;
        } else if (candidate.selected === 2) {
            statusBadge = `<span class="status-badge status-pending" style="background:rgba(239,68,68,0.15); border-color:rgba(239,68,68,0.3); color:var(--accent-red)">REJECTED</span>`;
        } else if (candidate.selected === 3) {
            statusBadge = `<span class="status-badge status-pending" style="background:rgba(239,68,68,0.25); border-color:var(--accent-red); color:var(--accent-red); font-weight:bold;">DISQUALIFIED</span>`;
        } else {
            statusBadge = `<span class="status-badge status-pending">WAITLISTED</span>`;
        }

        const actionText = candidate.selected === 1 ? 'Unmark' : 'Shortlist';
        const actionBtnClass = candidate.selected === 1 ? 'btn-secondary' : '';
        const isDisq = candidate.selected === 3;

        tableBody.innerHTML += `
            <tr id="row-${candidate.candidate_id}" style="${isDisq ? 'opacity: 0.65; background: rgba(239,68,68,0.01);' : ''}">
                <td class="leaderboard-rank">${rank}</td>
                <td>
                    <strong>${escapeHTML(candidate.name)}</strong> ${isDisq ? '💀' : ''}<br>
                    <small style="color: var(--text-muted); font-family:var(--font-mono); font-size:0.75rem;">${candidate.candidate_id}</small>
                </td>
                <td>${escapeHTML(candidate.college)}</td>
                <td style="font-family: var(--font-mono);">${timeFormatted}</td>
                <td>${webcamLabel}</td>
                <td>${violationBadge}</td>
                <td style="font-family: var(--font-mono); font-size:0.8rem;">${candidate.typing_speed_avg} CPM</td>
                <td style="font-family: var(--font-mono);">${candidate.score_logic.toFixed(1)}</td>
                <td style="font-family: var(--font-mono); color: var(--accent-cyan); font-weight: 700;">${candidate.score_final.toFixed(1)}</td>
                <td>${statusBadge}</td>
                <td style="text-align: right;">
                    <div style="display: flex; gap: 8px; justify-content: flex-end; align-items: center;">
                        <button class="btn-futuristic action-icon-btn" onclick="openDetailsModal('${candidate.candidate_id}')" title="Review Details">👁 Review</button>
                        <button class="btn-futuristic ${actionBtnClass}" style="padding: 4px 10px; font-size: 0.75rem;" ${isDisq ? 'disabled' : ''} onclick="toggleSelection('${candidate.candidate_id}', ${candidate.selected})">
                            ${actionText}
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
}

function formatTime(seconds) {
    if (!seconds) return '0s';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// API functions

async function handleLogout() {
    try {
        const response = await fetch('/api/admin/logout', { method: 'POST' });
        if (response.ok) {
            window.location.href = '/admin-login';
            return;
        }
    } catch(err) {}
    window.location.href = '/admin-login';
}

async function toggleSelection(candidateId, currentStatus) {
    const nextStatus = currentStatus === 1 ? 0 : 1;
    try {
        const response = await fetch('/api/admin/toggle_selection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ candidate_id: candidateId, selected: nextStatus })
        });
        if (response.ok) {
            updateSelectionState(candidateId, nextStatus);
        } else {
            fallbackLocalToggle(candidateId, nextStatus);
        }
    } catch (e) {
        fallbackLocalToggle(candidateId, nextStatus);
    }
}

function updateSelectionState(candidateId, nextStatus) {
    const candidate = candidatesList.find(c => c.candidate_id === candidateId);
    if (candidate) {
        candidate.selected = nextStatus;
    }
    updateStats();
    renderCandidates();
}

function fallbackLocalToggle(candidateId, nextStatus) {
    updateSelectionState(candidateId, nextStatus);
    localStorage.setItem('candidates', JSON.stringify(candidatesList));
}

async function handleAutoShortlist() {
    if (!confirm("Are you sure you want to auto-shortlist the top 30 performers? This resets manual shortlists.")) return;
    try {
        const response = await fetch('/api/admin/auto_shortlist', { method: 'POST' });
        if (response.ok) {
            const result = await response.json();
            alert(result.message);
            loadCandidates();
        } else {
            fallbackLocalAutoShortlist();
        }
    } catch (e) {
        fallbackLocalAutoShortlist();
    }
}

function fallbackLocalAutoShortlist() {
    // Reset all selection states (except disqualified)
    candidatesList.forEach(c => {
        if (c.selected !== 3) c.selected = 0;
    });
    
    // Sort and shortlist top 30 that aren't disqualified
    const valid = candidatesList
        .filter(c => c.selected !== 3)
        .sort((a, b) => b.score_final - a.score_final || a.time_taken - b.time_taken);
        
    for (let i = 0; i < Math.min(30, valid.length); i++) {
        valid[i].selected = 1;
    }
    
    localStorage.setItem('candidates', JSON.stringify(candidatesList));
    alert("Top performing candidates shortlisted locally.");
    updateStats();
    renderCandidates();
}

// Render candidate details view modal
function openDetailsModal(candId) {
    const candidate = candidatesList.find(c => c.candidate_id === candId);
    if (!candidate) return;

    document.getElementById('modal-candidate-name').textContent = candidate.name;
    document.getElementById('modal-candidate-meta').textContent = `${candidate.department} // Year ${candidate.year} // ${candidate.college}`;
    document.getElementById('modal-val-id').textContent = candidate.candidate_id;
    document.getElementById('modal-val-email').textContent = candidate.email;
    document.getElementById('modal-val-roll').textContent = candidate.roll_number;
    document.getElementById('modal-val-location').textContent = candidate.location_data || 'Not provided';
    document.getElementById('modal-val-webcam').textContent = candidate.webcam_status || 'Active';

    // Contact hyperlinks
    const linkedinLink = document.getElementById('modal-val-linkedin');
    if (candidate.linkedin) {
        linkedinLink.href = candidate.linkedin;
        linkedinLink.style.display = 'inline-block';
    } else {
        linkedinLink.style.display = 'none';
    }

    const githubLink = document.getElementById('modal-val-github');
    if (candidate.github) {
        githubLink.href = candidate.github;
        githubLink.style.display = 'inline-block';
    } else {
        githubLink.style.display = 'none';
    }

    // Telemetry displays
    document.getElementById('telemetry-speed').textContent = `${candidate.typing_speed_avg || 0} CPM`;
    document.getElementById('telemetry-variance').textContent = `${(candidate.typing_pattern_variance || 0.0).toFixed(1)}ms`;
    document.getElementById('telemetry-backspaces').textContent = candidate.backspace_count || 0;
    document.getElementById('telemetry-idle').textContent = `${candidate.idle_duration || 0}s`;

    // Security timeline table rows
    const logsBody = document.getElementById('violation-logs-body');
    logsBody.innerHTML = '';
    
    let logs = [];
    if (candidate.violation_logs) {
        try {
            logs = typeof candidate.violation_logs === 'string' ? JSON.parse(candidate.violation_logs) : candidate.violation_logs;
        } catch(e) {
            logs = [];
        }
    }
    
    if (logs && logs.length > 0) {
        logs.forEach(log => {
            logsBody.innerHTML += `
                <tr>
                    <td style="padding: 6px 0; font-family: var(--font-mono); color: var(--accent-yellow);">${log.timestamp}</td>
                    <td style="font-weight:bold; color: var(--accent-red);">${escapeHTML(log.type)}</td>
                    <td style="color: var(--text-secondary);">${escapeHTML(log.detail)}</td>
                </tr>
            `;
        });
    } else {
        logsBody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--accent-green); padding: 10px 0;">✔ Zero security violation alerts logged for this session.</td></tr>`;
    }

    // Load Answers
    const answersContainer = document.getElementById('modal-answers-area');
    answersContainer.innerHTML = '';

    function parseJSON(str) {
        try {
            return typeof str === 'string' ? JSON.parse(str) : str;
        } catch(e) {
            return {};
        }
    }

    const l1 = parseJSON(candidate.level1_ans) || {};
    const l5 = parseJSON(candidate.level5_ans) || {};
    const l6 = parseJSON(candidate.level6_ans) || {};

    const levels = [
        { name: "Level 1: Pattern Recognition", ans: `Visual shape selected: ${l1.q1 || 'N/A'}\nQ2 (Numerical: 1,3,7,15,31,?): Answer = ${l1.q2 || 'N/A'}` },
        { name: "Level 2: Scientist Crossing Bridge Riddle", ans: `Selected Answer: ${candidate.level2_ans || 'No response'}` },
        { name: "Level 3: Multi-LLM Strategy", ans: candidate.level3_ans || 'No response' },
        { name: "Level 4: Zero-Shot prompt design", ans: candidate.level4_ans || 'No response' },
        { name: "Level 5: Modern AI (RAG vs Fine-tuning)", ans: `MCQ (MEMORIZE WEIGHTS): Answer = ${l5.q1 || 'N/A'}\nScenario Comparison: ${l5.q2 || 'No response'}` },
        { name: "Level 6: 9-Ball Weighings puzzle", ans: `MCQ (Balls to balance): Answer = ${l6.q1 || 'N/A'}\nLogistics logic: ${l6.q2 || 'No response'}` },
        { name: "Level 7: Secret Sector Zero-GPU Startup Idea (₹1000)", ans: candidate.level7_ans || 'Locked / No response' }
    ];

    levels.forEach(lvl => {
        answersContainer.innerHTML += `
            <div class="answer-card">
                <div class="answer-header">${lvl.name}</div>
                <pre class="answer-body">${escapeHTML(lvl.ans)}</pre>
            </div>
        `;
    });

    document.getElementById('detail-modal').classList.add('active');
}

// Emails Modal
function openEmailsModal() {
    document.getElementById('emails-modal').classList.add('active');
}

function copyTemplate(elementId) {
    const pre = document.getElementById(elementId);
    navigator.clipboard.writeText(pre.textContent.trim())
        .then(() => alert("Template copied to clipboard!"))
        .catch(err => alert("Failed to copy template: " + err));
}

// Export CSV
function exportCSV() {
    if (candidatesList.length === 0) {
        alert("No records available to export.");
        return;
    }

    const headers = ['Candidate ID', 'Name', 'Email', 'College', 'Department', 'Year', 'Roll Number', 'Webcam Status', 'Geolocation', 'Violations Count', 'Avg Typing CPM', 'Backspace Count', 'Logic Score', 'Creativity Score', 'AI Score', 'Problem Solving Score', 'Time Score', 'Final Score', 'Time Taken (s)', 'Status'];
    const rows = candidatesList.map(c => {
        let statusStr = 'Waitlisted';
        if (c.selected === 1) statusStr = 'Selected';
        else if (c.selected === 2) statusStr = 'Rejected';
        else if (c.selected === 3) statusStr = 'Disqualified';
        
        return [
            `"${c.candidate_id}"`,
            `"${c.name}"`,
            `"${c.email}"`,
            `"${c.college}"`,
            `"${c.department}"`,
            c.year,
            `"${c.roll_number}"`,
            `"${c.webcam_status}"`,
            `"${c.location_data || 'None'}"`,
            c.violation_count,
            c.typing_speed_avg,
            c.backspace_count,
            c.score_logic,
            c.score_creativity,
            c.score_ai_knowledge,
            c.score_problem_solving,
            c.score_time,
            c.score_final,
            c.time_taken,
            `"${statusStr}"`
        ];
    });

    const csvContent = "data:text/csv;charset=utf-8," 
        + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `AI_Workshop_Selection_List_2026.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}
