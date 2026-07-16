/**
 * ============================================
 * AI NEXT GEN 2026 - ADMIN DASHBOARD SCRIPT
 * Version: 2.0.0
 * Description: Complete admin panel functionality
 * ============================================
 */

// ============================================
// 1. STATE MANAGEMENT
// ============================================

const AdminState = {
    candidates: [],
    filtered: [],
    charts: {
        score: null,
        college: null,
        status: null
    },
    stats: {
        total: 0,
        avgScore: 0,
        highScore: 0,
        shortlisted: 0,
        completed: 0,
        violations: 0
    },
    isLoading: false,
    lastUpdate: null
};

// ============================================
// 2. DOM CACHE
// ============================================

const DOM = {
    tableBody: document.getElementById('admin-table-body'),
    searchInput: document.getElementById('admin-search-input'),
    collegeFilter: document.getElementById('admin-filter-college'),
    statusFilter: document.getElementById('admin-filter-status'),
    sortSelect: document.getElementById('admin-sort-select'),
    
    // Stats
    statTotal: document.getElementById('stat-total-applicants'),
    statAvg: document.getElementById('stat-avg-score'),
    statHigh: document.getElementById('stat-high-score'),
    statShortlisted: document.getElementById('stat-shortlisted'),
    
    // Feed
    feedWebcam: document.getElementById('feed-webcam-active'),
    feedViolations: document.getElementById('feed-violations-count'),
    feedCompletions: document.getElementById('feed-completions'),
    rightDial: document.getElementById('right-shortlist-dial'),
    seatFill: document.getElementById('seat-progress-fill'),
    
    // Buttons
    logoutBtn: document.getElementById('btn-admin-logout'),
    shortlistBtn: document.getElementById('btn-auto-shortlist'),
    exportBtn: document.getElementById('btn-export-csv'),
    emailBtn: document.getElementById('btn-email-templates'),
    refreshBtn: document.getElementById('btn-refresh-data'),
    
    // Modals
    detailModal: document.getElementById('detail-modal'),
    emailsModal: document.getElementById('emails-modal'),
    closeDetail: document.getElementById('btn-close-detail'),
    closeEmails: document.getElementById('btn-close-emails'),
    
    // Charts
    scoreCanvas: document.getElementById('scoreDistChart'),
    collegeCanvas: document.getElementById('collegeChart'),
    statusCanvas: document.getElementById('statusChart'),
    
    // Search
    searchCount: document.getElementById('search-count'),
    updateTime: document.getElementById('update-time')
};

// ============================================
// 3. UTILITY FUNCTIONS
// ============================================

const Utils = {
    escapeHTML(str) {
        if (!str) return '';
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };
        return str.replace(/[&<>"']/g, m => map[m]);
    },

    formatTime(seconds) {
        if (!seconds || seconds < 0) return '0s';
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return m > 0 ? `${m}m ${s}s` : `${s}s`;
    },

    formatDate(isoString) {
        if (!isoString) return 'N/A';
        try {
            const date = new Date(isoString);
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return isoString;
        }
    },

    truncate(str, length = 50) {
        if (!str) return '';
        return str.length > length ? str.substring(0, length) + '...' : str;
    },

    debounce(func, wait = 300) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    throttle(func, limit = 300) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func(...args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    parseJSON(str, fallback = {}) {
        if (!str) return fallback;
        try {
            return typeof str === 'string' ? JSON.parse(str) : str;
        } catch {
            return fallback;
        }
    },

    getStatusText(selected) {
        const map = {
            0: { text: 'Waitlisted', class: 'status-pending', color: '#F59E0B' },
            1: { text: 'Selected ✓', class: 'status-shortlisted', color: '#16A34A' },
            2: { text: 'Rejected', class: 'status-rejected', color: '#DC2626' },
            3: { text: 'Disqualified', class: 'status-disqualified', color: '#6B7280' }
        };
        return map[selected] || map[0];
    },

    getViolationBadge(count) {
        if (count >= 3) {
            return `<span class="badge badge-error">🚫 ${count}/3 DISQ</span>`;
        } else if (count > 0) {
            return `<span class="badge badge-warning">⚠️ ${count}/3 WARN</span>`;
        }
        return `<span class="badge badge-success">✅ 0/3 SAFE</span>`;
    },

    getWebcamStatus(status) {
        if (status === 'Active') {
            return `<span class="badge badge-success">● ACTIVE</span>`;
        }
        return `<span class="badge badge-error">● OFFLINE</span>`;
    },

    generateCSV(data, headers) {
        const rows = data.map(row => 
            headers.map(h => {
                const val = row[h] !== undefined ? row[h] : '';
                return typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : val;
            }).join(',')
        );
        return [headers.join(','), ...rows].join('\n');
    },

    downloadFile(content, filename, mimeType = 'text/csv') {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
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

        // Auto-remove
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
// 5. DATA MANAGEMENT
// ============================================

const DataManager = {
    async loadCandidates() {
        if (AdminState.isLoading) return;
        AdminState.isLoading = true;

        try {
            const response = await fetch('/api/admin/candidates');
            
            if (response.status === 401) {
                window.location.href = '/admin-login';
                return;
            }

            if (response.ok) {
                AdminState.candidates = await response.json();
                this.updateLastUpdate();
                Toast.success('📊 Data loaded successfully');
            } else {
                this.loadLocalData();
            }
        } catch (error) {
            console.warn('⚠️ API error, falling back to local data:', error);
            this.loadLocalData();
        } finally {
            AdminState.isLoading = false;
        }
    },

    loadLocalData() {
        try {
            const raw = localStorage.getItem('candidates');
            if (raw) {
                AdminState.candidates = JSON.parse(raw);
                Toast.info('📂 Using local data (offline mode)');
            } else {
                AdminState.candidates = [];
                Toast.info('📂 No candidates registered');
            }
        } catch (error) {
            console.error('❌ Failed to load local data:', error);
            AdminState.candidates = [];
        }
        this.updateLastUpdate();
    },

    updateLastUpdate() {
        const now = new Date();
        const timeEl = DOM.updateTime;
        if (timeEl) {
            timeEl.textContent = now.toLocaleTimeString();
        }
        AdminState.lastUpdate = now;
    },

    async saveChanges() {
        try {
            // In production, save to API
            localStorage.setItem('candidates', JSON.stringify(AdminState.candidates));
            return true;
        } catch (error) {
            console.error('❌ Failed to save:', error);
            return false;
        }
    },

    refreshData() {
        this.loadCandidates();
        Toast.info('🔄 Refreshing data...');
    }
};

// ============================================
// 6. FILTER & SORT ENGINE
// ============================================

const FilterEngine = {
    getFilters() {
        return {
            search: DOM.searchInput?.value?.toLowerCase().trim() || '',
            college: DOM.collegeFilter?.value || '',
            status: DOM.statusFilter?.value || '',
            sort: DOM.sortSelect?.value || 'score'
        };
    },

    applyFilters(candidates) {
        const filters = this.getFilters();
        
        let filtered = [...candidates];

        // Search filter
        if (filters.search) {
            const search = filters.search;
            filtered = filtered.filter(c => 
                c.name?.toLowerCase().includes(search) ||
                c.candidate_id?.toLowerCase().includes(search) ||
                c.email?.toLowerCase().includes(search) ||
                c.college?.toLowerCase().includes(search)
            );
        }

        // College filter
        if (filters.college) {
            filtered = filtered.filter(c => 
                c.college?.toLowerCase() === filters.college.toLowerCase()
            );
        }

        // Status filter
        if (filters.status) {
            const statusMap = {
                'shortlisted': 1,
                'waitlisted': 0,
                'rejected': 2,
                'disqualified': 3
            };
            const statusValue = statusMap[filters.status];
            if (statusValue !== undefined) {
                filtered = filtered.filter(c => c.selected === statusValue);
            }
        }

        // Sorting
        const sortMap = {
            'score': (a, b) => b.score_final - a.score_final || a.time_taken - b.time_taken,
            'time': (a, b) => a.time_taken - b.time_taken || b.score_final - a.score_final,
            'creativity': (a, b) => b.score_creativity - a.score_creativity || b.score_final - a.score_final,
            'name': (a, b) => (a.name || '').localeCompare(b.name || '')
        };

        filtered.sort(sortMap[filters.sort] || sortMap.score);

        return filtered;
    }
};

// ============================================
// 7. RENDER ENGINE
// ============================================

const RenderEngine = {
    renderAll() {
        this.updateStats();
        this.renderTable();
        this.updateFeed();
        this.updateCharts();
        this.updateSearchCount();
    },

    updateStats() {
        const candidates = AdminState.candidates;
        const total = candidates.length;
        
        const valid = candidates.filter(c => c.selected !== 3);
        const scores = valid.map(c => c.score_final || 0);
        const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
        const high = scores.length > 0 ? Math.max(...scores) : 0;
        const shortlisted = candidates.filter(c => c.selected === 1).length;
        const completed = candidates.filter(c => c.completed).length;
        const violations = candidates.reduce((sum, c) => sum + (c.violation_count || 0), 0);

        AdminState.stats = { total, avgScore: avg, highScore: high, shortlisted, completed, violations };

        // Update DOM
        if (DOM.statTotal) DOM.statTotal.textContent = total;
        if (DOM.statAvg) DOM.statAvg.textContent = avg.toFixed(1);
        if (DOM.statHigh) DOM.statHigh.textContent = high.toFixed(1);
        if (DOM.statShortlisted) DOM.statShortlisted.textContent = `${shortlisted} / 30`;
        if (DOM.rightDial) DOM.rightDial.textContent = `${shortlisted} / 30`;
        
        // Update progress bar
        const progress = Math.min((shortlisted / 30) * 100, 100);
        if (DOM.seatFill) DOM.seatFill.style.width = `${progress}%`;
    },

    updateFeed() {
        const candidates = AdminState.candidates;
        const webcamCount = candidates.filter(c => c.webcam_status === 'Active').length;
        const violations = candidates.reduce((sum, c) => sum + (c.violation_count || 0), 0);
        const completed = candidates.filter(c => c.completed).length;

        if (DOM.feedWebcam) DOM.feedWebcam.textContent = webcamCount;
        if (DOM.feedViolations) DOM.feedViolations.textContent = violations;
        if (DOM.feedCompletions) DOM.feedCompletions.textContent = completed;
    },

    renderTable() {
        const filtered = FilterEngine.applyFilters(AdminState.candidates);
        AdminState.filtered = filtered;

        if (!DOM.tableBody) return;

        if (filtered.length === 0) {
            DOM.tableBody.innerHTML = `
                <tr>
                    <td colspan="11" style="text-align: center; padding: 4rem; color: var(--text-muted);">
                        <div style="font-size: 3rem; margin-bottom: 1rem;">🔍</div>
                        <p>No candidates match your criteria</p>
                        <p style="font-size: 0.8rem; margin-top: 0.5rem;">Try adjusting your filters</p>
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        filtered.forEach((candidate, index) => {
            const rank = index + 1;
            const isDisq = candidate.selected === 3;
            const status = Utils.getStatusText(candidate.selected);
            
            html += `
                <tr class="${isDisq ? 'row-disqualified' : ''}" data-id="${candidate.candidate_id}">
                    <td>
                        <span class="rank-number ${rank <= 3 ? `rank-top-${rank}` : ''}">${rank}</span>
                    </td>
                    <td>
                        <div class="candidate-name">${Utils.escapeHTML(candidate.name)}</div>
                        <div class="candidate-id">${Utils.escapeHTML(candidate.candidate_id)}</div>
                    </td>
                    <td>${Utils.escapeHTML(candidate.college)}</td>
                    <td class="mono-text">${Utils.formatTime(candidate.time_taken)}</td>
                    <td>${Utils.getWebcamStatus(candidate.webcam_status)}</td>
                    <td>${Utils.getViolationBadge(candidate.violation_count)}</td>
                    <td class="mono-text">${candidate.typing_speed_avg || 0} CPM</td>
                    <td class="mono-text">${(candidate.score_logic || 0).toFixed(1)}</td>
                    <td class="score-value ${candidate.score_final >= 80 ? 'score-high' : candidate.score_final >= 60 ? 'score-medium' : 'score-low'}">
                        ${(candidate.score_final || 0).toFixed(1)}
                    </td>
                    <td><span class="status-badge ${status.class}">${status.text}</span></td>
                    <td class="actions-cell">
                        <button class="btn-icon" onclick="AdminActions.viewDetails('${candidate.candidate_id}')" title="View Details">
                            👁️
                        </button>
                        ${!isDisq ? `
                            <button class="btn-icon ${candidate.selected === 1 ? 'btn-icon-active' : ''}" 
                                    onclick="AdminActions.toggleSelection('${candidate.candidate_id}')" 
                                    title="${candidate.selected === 1 ? 'Unshortlist' : 'Shortlist'}">
                                ${candidate.selected === 1 ? '⭐' : '☆'}
                            </button>
                        ` : ''}
                        <button class="btn-icon" onclick="AdminActions.flagCandidate('${candidate.candidate_id}')" title="Flag">
                            🚩
                        </button>
                    </td>
                </tr>
            `;
        });

        DOM.tableBody.innerHTML = html;
        this.updateSearchCount(filtered.length);
    },

    updateSearchCount(filteredCount) {
        if (!DOM.searchCount) return;
        const total = AdminState.candidates.length;
        if (filteredCount < total) {
            DOM.searchCount.textContent = `${filteredCount} of ${total}`;
            DOM.searchCount.style.display = 'inline';
        } else {
            DOM.searchCount.style.display = 'none';
        }
    },

    updateCharts() {
        this.renderScoreChart();
        this.renderCollegeChart();
        this.renderStatusChart();
    },

    renderScoreChart() {
        const canvas = DOM.scoreCanvas;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const ranges = ['0-20', '21-40', '41-60', '61-80', '81-100'];
        const counts = ranges.map(() => 0);
        
        AdminState.candidates.forEach(c => {
            const score = c.score_final || 0;
            if (score <= 20) counts[0]++;
            else if (score <= 40) counts[1]++;
            else if (score <= 60) counts[2]++;
            else if (score <= 80) counts[3]++;
            else counts[4]++;
        });

        if (AdminState.charts.score) {
            AdminState.charts.score.destroy();
        }

        AdminState.charts.score = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ranges,
                datasets: [{
                    label: 'Candidates',
                    data: counts,
                    backgroundColor: 'rgba(0, 166, 192, 0.7)',
                    borderColor: '#00A6C0',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 }
                    }
                }
            }
        });
    },

    renderCollegeChart() {
        const canvas = DOM.collegeCanvas;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const counts = {};
        
        AdminState.candidates.forEach(c => {
            const college = c.college || 'Unknown';
            counts[college] = (counts[college] || 0) + 1;
        });

        const labels = Object.keys(counts);
        const data = Object.values(counts);
        const colors = ['#00A6C0', '#7b2ffc', '#16A34A', '#F59E0B', '#DC2626', '#EC4899', '#8B5CF6'];

        if (AdminState.charts.college) {
            AdminState.charts.college.destroy();
        }

        AdminState.charts.college = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors.slice(0, labels.length),
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            font: { size: 10 },
                            boxWidth: 12
                        }
                    }
                }
            }
        });
    },

    renderStatusChart() {
        const canvas = DOM.statusCanvas;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const counts = {
            shortlisted: 0,
            waitlisted: 0,
            rejected: 0,
            disqualified: 0
        };

        AdminState.candidates.forEach(c => {
            if (c.selected === 1) counts.shortlisted++;
            else if (c.selected === 2) counts.rejected++;
            else if (c.selected === 3) counts.disqualified++;
            else counts.waitlisted++;
        });

        if (AdminState.charts.status) {
            AdminState.charts.status.destroy();
        }

        AdminState.charts.status = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Shortlisted', 'Waitlisted', 'Rejected', 'Disqualified'],
                datasets: [{
                    data: [counts.shortlisted, counts.waitlisted, counts.rejected, counts.disqualified],
                    backgroundColor: ['#16A34A', '#F59E0B', '#DC2626', '#6B7280'],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            font: { size: 10 },
                            boxWidth: 12
                        }
                    }
                }
            }
        });
    }
};

// ============================================
// 8. ADMIN ACTIONS
// ============================================

const AdminActions = {
    async toggleSelection(candidateId) {
        const candidate = AdminState.candidates.find(c => c.candidate_id === candidateId);
        if (!candidate) return;

        const newStatus = candidate.selected === 1 ? 0 : 1;

        try {
            const response = await fetch('/api/admin/toggle_selection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    candidate_id: candidateId, 
                    selected: newStatus 
                })
            });

            if (response.ok) {
                candidate.selected = newStatus;
                Toast.success(`✅ ${candidate.name} ${newStatus === 1 ? 'shortlisted' : 'unshortlisted'}`);
                RenderEngine.renderAll();
                DataManager.saveChanges();
            } else {
                throw new Error('API request failed');
            }
        } catch (error) {
            // Fallback to local
            candidate.selected = newStatus;
            Toast.info(`📂 ${candidate.name} ${newStatus === 1 ? 'shortlisted' : 'unshortlisted'} (local mode)`);
            RenderEngine.renderAll();
            DataManager.saveChanges();
        }
    },

    async autoShortlist() {
        if (!confirm('⚠️ This will automatically shortlist the top 30 candidates. Continue?')) {
            return;
        }

        try {
            const response = await fetch('/api/admin/auto_shortlist', {
                method: 'POST'
            });

            if (response.ok) {
                Toast.success('✅ Top 30 candidates shortlisted successfully!');
                await DataManager.loadCandidates();
                RenderEngine.renderAll();
            } else {
                this.localAutoShortlist();
            }
        } catch (error) {
            this.localAutoShortlist();
        }
    },

    localAutoShortlist() {
        // Reset selections (keep disqualified)
        AdminState.candidates.forEach(c => {
            if (c.selected !== 3) c.selected = 0;
        });

        // Sort and shortlist top 30
        const eligible = AdminState.candidates
            .filter(c => c.selected !== 3)
            .sort((a, b) => b.score_final - a.score_final || a.time_taken - b.time_taken);

        const topCount = Math.min(30, eligible.length);
        for (let i = 0; i < topCount; i++) {
            eligible[i].selected = 1;
        }

        Toast.success(`✅ ${topCount} candidates shortlisted locally`);
        RenderEngine.renderAll();
        DataManager.saveChanges();
    },

    viewDetails(candidateId) {
        const candidate = AdminState.candidates.find(c => c.candidate_id === candidateId);
        if (!candidate) {
            Toast.error('Candidate not found');
            return;
        }

        // Populate modal
        document.getElementById('modal-candidate-name').textContent = candidate.name;
        document.getElementById('modal-candidate-meta').textContent = 
            `${candidate.department || 'N/A'} • ${candidate.college || 'N/A'}`;
        
        document.getElementById('modal-val-id').textContent = candidate.candidate_id;
        document.getElementById('modal-val-email').textContent = candidate.email || 'N/A';
        document.getElementById('modal-val-roll').textContent = candidate.roll_number || 'N/A';
        document.getElementById('modal-val-college').textContent = candidate.college || 'N/A';
        
        const webcamStatus = candidate.webcam_status === 'Active' ? '✅ Active' : '❌ Offline';
        document.getElementById('modal-val-webcam').textContent = webcamStatus;
        document.getElementById('modal-val-webcam').style.color = 
            candidate.webcam_status === 'Active' ? 'var(--accent-green)' : 'var(--accent-red)';

        // Social links
        const linkedinLink = document.getElementById('modal-val-linkedin');
        if (candidate.linkedin) {
            linkedinLink.href = candidate.linkedin;
            linkedinLink.style.display = 'inline';
        } else {
            linkedinLink.style.display = 'none';
        }

        const githubLink = document.getElementById('modal-val-github');
        if (candidate.github) {
            githubLink.href = candidate.github;
            githubLink.style.display = 'inline';
        } else {
            githubLink.style.display = 'none';
        }

        // Telemetry
        document.getElementById('telemetry-speed').textContent = `${candidate.typing_speed_avg || 0} CPM`;
        document.getElementById('telemetry-variance').textContent = `${(candidate.typing_pattern_variance || 0).toFixed(1)}ms`;
        document.getElementById('telemetry-backspaces').textContent = candidate.backspace_count || 0;
        document.getElementById('telemetry-idle').textContent = `${candidate.idle_duration || 0}s`;

        // Violation logs
        const logsBody = document.getElementById('violation-logs-body');
        let logs = Utils.parseJSON(candidate.violation_logs, []);
        
        if (logs && logs.length > 0) {
            logsBody.innerHTML = logs.map(log => `
                <tr>
                    <td>${Utils.escapeHTML(log.timestamp || 'N/A')}</td>
                    <td><span class="badge badge-error">${Utils.escapeHTML(log.type || 'Unknown')}</span></td>
                    <td>${Utils.escapeHTML(log.detail || '')}</td>
                </tr>
            `).join('');
        } else {
            logsBody.innerHTML = `
                <tr>
                    <td colspan="3" style="text-align: center; padding: 1rem; color: var(--text-muted);">
                        ✅ No violations recorded
                    </td>
                </tr>
            `;
        }

        // Answers
        const answersContainer = document.getElementById('modal-answers-area');
        const levels = [
            { name: 'Level 1: Logic Detective', data: candidate.level1_ans },
            { name: 'Level 2: Future Thinker', data: candidate.level2_ans },
            { name: 'Level 3: Prompt Master', data: candidate.level3_ans },
            { name: 'Level 4: Innovation Lab', data: candidate.level4_ans },
            { name: 'Level 5: AI Architect', data: candidate.level5_ans },
            { name: 'Level 6: Balance Master', data: candidate.level6_ans },
            { name: 'Level 7: Future Builder', data: candidate.level7_ans }
        ];

        answersContainer.innerHTML = levels.map(level => {
            let displayData = level.data || 'No response';
            if (typeof displayData === 'string' && displayData.startsWith('{')) {
                try {
                    const parsed = JSON.parse(displayData);
                    displayData = Object.entries(parsed)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join('\n');
                } catch {}
            }
            return `
                <div class="answer-card">
                    <div class="answer-header">${level.name}</div>
                    <pre class="answer-body">${Utils.escapeHTML(displayData)}</pre>
                </div>
            `;
        }).join('');

        // Show modal
        DOM.detailModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    },

    flagCandidate(candidateId) {
        const candidate = AdminState.candidates.find(c => c.candidate_id === candidateId);
        if (!candidate) return;

        candidate.violation_count = candidate.violation_count >= 3 ? 0 : candidate.violation_count + 1;
        
        // Add to violation logs
        let logs = Utils.parseJSON(candidate.violation_logs, []);
        logs.push({
            timestamp: new Date().toISOString(),
            type: 'Manual Flag',
            detail: `Flagged by admin (${candidate.violation_count}/3)`
        });
        candidate.violation_logs = JSON.stringify(logs);

        Toast.warning(`🚩 ${candidate.name} flagged (${candidate.violation_count}/3)`);
        RenderEngine.renderAll();
        DataManager.saveChanges();
    },

    async exportCSV() {
        const candidates = AdminState.filtered.length > 0 ? AdminState.filtered : AdminState.candidates;
        
        if (candidates.length === 0) {
            Toast.warning('No data to export');
            return;
        }

        const headers = [
            'Candidate ID', 'Name', 'Email', 'College', 'Department', 'Year',
            'Webcam Status', 'Violations', 'Typing Speed', 'Logic Score',
            'Creativity Score', 'AI Knowledge', 'Time Score', 'Final Score',
            'Time Taken (s)', 'Status'
        ];

        const rows = candidates.map(c => ({
            'Candidate ID': c.candidate_id,
            'Name': c.name,
            'Email': c.email,
            'College': c.college,
            'Department': c.department,
            'Year': c.year,
            'Webcam Status': c.webcam_status,
            'Violations': c.violation_count,
            'Typing Speed': c.typing_speed_avg,
            'Logic Score': c.score_logic,
            'Creativity Score': c.score_creativity,
            'AI Knowledge': c.score_ai_knowledge,
            'Time Score': c.score_time,
            'Final Score': c.score_final,
            'Time Taken (s)': c.time_taken,
            'Status': Utils.getStatusText(c.selected).text
        }));

        const csv = Utils.generateCSV(rows, headers);
        const filename = `candidates_${new Date().toISOString().slice(0, 10)}.csv`;
        Utils.downloadFile(csv, filename);
        Toast.success('📊 CSV exported successfully');
    },

    openEmailsModal() {
        DOM.emailsModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    },

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    },

    copyTemplate(elementId) {
        const element = document.getElementById(elementId);
        if (!element) return;

        const text = element.textContent.trim();
        navigator.clipboard.writeText(text)
            .then(() => Toast.success('📋 Template copied to clipboard!'))
            .catch(() => {
                // Fallback
                const range = document.createRange();
                range.selectNode(element);
                window.getSelection().removeAllRanges();
                window.getSelection().addRange(range);
                document.execCommand('copy');
                Toast.success('📋 Template copied!');
            });
    },

    async handleLogout() {
        if (!confirm('Are you sure you want to logout?')) return;

        try {
            await fetch('/api/admin/logout', { method: 'POST' });
            window.location.href = '/admin-login';
        } catch (error) {
            window.location.href = '/admin-login';
        }
    }
};

// ============================================
// 9. EVENT BINDINGS
// ============================================

function initEventListeners() {
    // Search & Filters
    DOM.searchInput?.addEventListener('input', Utils.debounce(() => {
        RenderEngine.renderTable();
    }, 300));

    DOM.collegeFilter?.addEventListener('change', () => {
        RenderEngine.renderTable();
    });

    DOM.statusFilter?.addEventListener('change', () => {
        RenderEngine.renderTable();
    });

    DOM.sortSelect?.addEventListener('change', () => {
        RenderEngine.renderTable();
    });

    // Buttons
    DOM.logoutBtn?.addEventListener('click', AdminActions.handleLogout);
    DOM.shortlistBtn?.addEventListener('click', AdminActions.autoShortlist);
    DOM.exportBtn?.addEventListener('click', AdminActions.exportCSV);
    DOM.emailBtn?.addEventListener('click', AdminActions.openEmailsModal);
    DOM.refreshBtn?.addEventListener('click', () => {
        DataManager.refreshData();
    });

    // Modal close
    DOM.closeDetail?.addEventListener('click', () => {
        AdminActions.closeModal('detail-modal');
    });

    DOM.closeEmails?.addEventListener('click', () => {
        AdminActions.closeModal('emails-modal');
    });

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                AdminActions.closeModal(overlay.id);
            }
        });
    });

    // Close modals on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.active').forEach(modal => {
                AdminActions.closeModal(modal.id);
            });
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Ctrl+F for search focus
        if (e.ctrlKey && e.key === 'f') {
            e.preventDefault();
            DOM.searchInput?.focus();
            DOM.searchInput?.select();
        }
        // Ctrl+R for refresh
        if (e.ctrlKey && e.key === 'r') {
            e.preventDefault();
            DataManager.refreshData();
        }
    });
}

// ============================================
// 10. INITIALIZATION
// ============================================

async function init() {
    console.log('🚀 Admin Dashboard Initializing...');
    
    // Initialize Toast
    Toast.init();

    // Load data
    await DataManager.loadCandidates();

    // Populate filters
    const colleges = [...new Set(AdminState.candidates.map(c => c.college).filter(Boolean))];
    if (DOM.collegeFilter) {
        DOM.collegeFilter.innerHTML = `
            <option value="">All Colleges</option>
            ${colleges.map(c => `<option value="${c}">${Utils.escapeHTML(c)}</option>`).join('')}
        `;
    }

    // Render everything
    RenderEngine.renderAll();

    // Bind events
    initEventListeners();

    // Auto-refresh every 60 seconds
    setInterval(() => {
        DataManager.loadCandidates();
    }, 60000);

    console.log('✅ Admin Dashboard Ready');
    console.log(`📊 ${AdminState.candidates.length} candidates loaded`);
    console.log('📌 Shortcuts: Ctrl+F (search), Ctrl+R (refresh)');
}

// ============================================
// 11. EXPOSE GLOBALS (for inline onclick)
// ============================================

window.AdminActions = AdminActions;
window.AdminState = AdminState;
window.RenderEngine = RenderEngine;
window.DataManager = DataManager;

// ============================================
// 12. STARTUP
// ============================================

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// ============================================
// END OF SCRIPT
// ============================================