/* ============================================
   ADMIN — Full admin panel logic (no jQuery)
   ============================================ */

(function() {
  const $ = id => document.getElementById(id);

  const state = {
    candidates: [],
    filtered: [],
    stats: null,
  };

  const STATUS_MAP = { 0: 'Pending', 1: 'Shortlisted', 2: 'Rejected', 3: 'Disqualified' };
  const STATUS_COLORS = { 0: 'var(--text-muted)', 1: 'var(--green)', 2: 'var(--red)', 3: 'var(--yellow)' };

  /* --- Init --- */
  async function init() {
    bindEvents();
    await Promise.all([loadStats(), loadCandidates()]);
    loadPublishStatus();
  }

  function bindEvents() {
    $('searchInput').addEventListener('input', applyFilters);
    $('collegeFilter').addEventListener('change', applyFilters);
    $('statusFilter').addEventListener('change', applyFilters);
    $('sortBy').addEventListener('change', applyFilters);
    $('autoShortlistBtn').addEventListener('click', autoShortlist);
    $('exportCsvBtn').addEventListener('click', exportCsv);
    $('refreshBtn').addEventListener('click', () => { loadStats(); loadCandidates(); });
    $('adminLogoutBtn').addEventListener('click', adminLogout);
    $('publishToggle').addEventListener('click', togglePublish);
    $('detailOverlay').addEventListener('click', (e) => {
      if (e.target === $('detailOverlay')) closeDetail();
    });
  }

  /* --- Load data --- */
  async function loadStats() {
    try {
      state.stats = await API.get('/api/admin/stats');
      $('statTotal').textContent = state.stats.total;
      $('statCompleted').textContent = state.stats.completed;
      $('statShortlisted').textContent = state.stats.shortlisted;
      $('statAvgScore').textContent = state.stats.avg_score;
    } catch (err) {
      Toast.error('Error', 'Failed to load stats');
    }
  }

  async function loadCandidates() {
    try {
      state.candidates = await API.get('/api/admin/candidates');
      populateCollegeFilter();
      applyFilters();
    } catch (err) {
      Toast.error('Error', 'Failed to load candidates');
    }
  }

  function populateCollegeFilter() {
    const colleges = [...new Set(state.candidates.map(c => c.college).filter(Boolean))].sort();
    const sel = $('collegeFilter');
    const current = sel.value;
    sel.innerHTML = '<option value="">All Colleges</option>';
    colleges.forEach(c => {
      sel.innerHTML += `<option value="${esc(c)}" ${c === current ? 'selected' : ''}>${esc(c)}</option>`;
    });
  }

  /* --- Filtering + sorting --- */
  function applyFilters() {
    const search = $('searchInput').value.toLowerCase().trim();
    const college = $('collegeFilter').value.toLowerCase();
    const status = $('statusFilter').value;
    const sort = $('sortBy').value;

    let list = [...state.candidates];

    if (search) {
      list = list.filter(c =>
        (c.name || '').toLowerCase().includes(search) ||
        (c.email || '').toLowerCase().includes(search) ||
        (c.candidate_id || '').toLowerCase().includes(search)
      );
    }
    if (college) {
      list = list.filter(c => (c.college || '').toLowerCase().includes(college));
    }
    if (status) {
      const statusVal = { shortlisted: 1, pending: 0, disqualified: 3 }[status];
      if (statusVal !== undefined) {
        list = list.filter(c => c.selected === statusVal);
      }
    }

    const sorters = {
      score: (a, b) => (b.score_final || 0) - (a.score_final || 0) || (a.time_taken || 99999) - (b.time_taken || 99999),
      name: (a, b) => (a.name || '').localeCompare(b.name || ''),
      time: (a, b) => (a.time_taken || 99999) - (b.time_taken || 99999),
      creativity: (a, b) => (b.score_creativity || 0) - (a.score_creativity || 0),
    };
    list.sort(sorters[sort] || sorters.score);

    state.filtered = list;
    renderTable();
  }

  /* --- Render table --- */
  function renderTable() {
    const tbody = $('candidateTable');
    const empty = $('tableEmpty');

    if (state.filtered.length === 0) {
      tbody.innerHTML = '';
      empty.style.display = '';
      return;
    }
    empty.style.display = 'none';

    tbody.innerHTML = state.filtered.map(c => {
      const status = c.selected || 0;
      const statusColor = STATUS_COLORS[status] || 'var(--text-muted)';
      const completed = c.completed;
      return `<tr style="opacity:${completed ? 1 : 0.5};">
        <td style="font-family:var(--font-mono);font-size:var(--text-xs);">${esc(c.candidate_id || '-')}</td>
        <td class="name-col">${esc(c.name || '-')}</td>
        <td>${esc(c.college || '-')}</td>
        <td class="score-col">${completed ? (c.score_final || 0).toFixed(1) : '-'}</td>
        <td>${completed ? (c.score_logic || 0).toFixed(0) : '-'}</td>
        <td>${completed ? (c.score_creativity || 0).toFixed(0) : '-'}</td>
        <td>${completed ? (c.score_ai_knowledge || 0).toFixed(0) : '-'}</td>
        <td>${completed ? formatTime(c.time_taken || 0) : '-'}</td>
        <td>${c.violation_count || 0}</td>
        <td>
          <select class="status-select" data-id="${esc(c.candidate_id)}" onchange="AdminPanel.setStatus(this)">
            <option value="0" ${status===0?'selected':''}>Pending</option>
            <option value="1" ${status===1?'selected':''}>Shortlisted</option>
            <option value="2" ${status===2?'selected':''}>Rejected</option>
            <option value="3" ${status===3?'selected':''}>Disqualified</option>
          </select>
        </td>
        <td><button class="btn btn-ghost btn-sm" onclick="AdminPanel.viewDetail('${esc(c.candidate_id)}')">View</button></td>
      </tr>`;
    }).join('');
  }

  /* --- View detail --- */
  window.AdminPanel = {
    async setStatus(sel) {
      const id = sel.dataset.id;
      const val = parseInt(sel.value);
      try {
        await API.post('/api/admin/toggle_selection', { candidate_id: id, selected: val });
        const c = state.candidates.find(x => x.candidate_id === id);
        if (c) c.selected = val;
        Toast.success('Updated', `${id} → ${STATUS_MAP[val]}`);
        loadStats();
      } catch (err) {
        Toast.error('Error', err.message);
        applyFilters();
      }
    },

    viewDetail(candidateId) {
      const c = state.candidates.find(x => x.candidate_id === candidateId);
      if (!c) return;

      const panel = $('detailPanel');
      const badges = Array.isArray(c.badges) ? c.badges : [];
      const badgeHtml = badges.length > 0
        ? badges.map(b => `<span class="badge badge-accent">${esc(b)}</span>`).join(' ')
        : '<span style="color:var(--text-muted)">None</span>';

      panel.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-6);">
          <h3 style="font-size:var(--text-xl);">Candidate Details</h3>
          <div style="display:flex;gap:var(--space-2);">
            <a href="/admin/report/${esc(candidateId)}" target="_blank" class="btn btn-secondary btn-sm">&#x1F4C4; Print Report</a>
            <button class="btn btn-ghost btn-sm" onclick="AdminPanel.closeDetail()">&times;</button>
          </div>
        <div class="detail-row"><span class="detail-row-label">Name</span><span class="detail-row-value">${esc(c.name)}</span></div>
        <div class="detail-row"><span class="detail-row-label">Email</span><span class="detail-row-value">${esc(c.email)}</span></div>
        <div class="detail-row"><span class="detail-row-label">ID</span><span class="detail-row-value" style="font-family:var(--font-mono);">${esc(c.candidate_id)}</span></div>
        <div class="detail-row"><span class="detail-row-label">College</span><span class="detail-row-value">${esc(c.college)}</span></div>
        <div class="detail-row"><span class="detail-row-label">Department</span><span class="detail-row-value">${esc(c.department)}</span></div>
        <div class="detail-row"><span class="detail-row-label">Year</span><span class="detail-row-value">${c.year || '-'}</span></div>
        <div class="detail-row"><span class="detail-row-label">Phone</span><span class="detail-row-value">${esc(c.phone)}</span></div>
        ${c.linkedin ? `<div class="detail-row"><span class="detail-row-label">LinkedIn</span><span class="detail-row-value"><a href="${esc(c.linkedin)}" target="_blank">Link</a></span></div>` : ''}
        ${c.github ? `<div class="detail-row"><span class="detail-row-label">GitHub</span><span class="detail-row-value"><a href="${esc(c.github)}" target="_blank">Link</a></span></div>` : ''}

        <div style="margin:var(--space-6) 0;border-top:1px solid var(--glass-border);padding-top:var(--space-5);">
          <h4 style="font-size:var(--text-base);margin-bottom:var(--space-4);">Scores</h4>
          ${renderScoreRow('Logic', c.score_logic, 40)}
          ${renderScoreRow('Creativity', c.score_creativity, 20)}
          ${renderScoreRow('AI Knowledge', c.score_ai_knowledge, 20)}
          ${renderScoreRow('Problem Solving', c.score_problem_solving, 10)}
          ${renderScoreRow('Research', c.score_research, 10)}
          ${renderScoreRow('AI Potential', c.score_ai_potential, 10)}
          ${renderScoreRow('Workshop Fit', c.score_workshop_compat, 10)}
          ${renderScoreRow('Selection Prob.', c.score_selection_prob, 100, '%')}
          <div style="margin-top:var(--space-4);padding-top:var(--space-3);border-top:1px solid var(--glass-border);display:flex;justify-content:space-between;">
            <span style="font-weight:600;">Final Score</span>
            <span style="font-family:var(--font-display);font-weight:700;color:var(--accent-light);font-size:var(--text-lg);">${(c.score_final || 0).toFixed(1)}%</span>
          </div>
        </div>

        <div style="margin:var(--space-5) 0;border-top:1px solid var(--glass-border);padding-top:var(--space-5);">
          <h4 style="font-size:var(--text-base);margin-bottom:var(--space-3);">Challenge Info</h4>
          <div class="detail-row"><span class="detail-row-label">Time Taken</span><span class="detail-row-value">${formatTime(c.time_taken || 0)}</span></div>
          <div class="detail-row"><span class="detail-row-label">Tab Switches</span><span class="detail-row-value">${c.tab_switches || 0}</span></div>
          <div class="detail-row"><span class="detail-row-label">Violations</span><span class="detail-row-value">${c.violation_count || 0}</span></div>
          <div class="detail-row"><span class="detail-row-label">Typing Speed</span><span class="detail-row-value">${c.typing_speed_avg || 0} CPM</span></div>
          <div class="detail-row"><span class="detail-row-label">Completed</span><span class="detail-row-value">${c.completed_at ? new Date(c.completed_at).toLocaleString() : 'No'}</span></div>
        </div>

        <div style="margin-top:var(--space-5);border-top:1px solid var(--glass-border);padding-top:var(--space-5);">
          <h4 style="font-size:var(--text-base);margin-bottom:var(--space-3);">Badges</h4>
          <div style="display:flex;flex-wrap:wrap;gap:var(--space-2);">${badgeHtml}</div>
        </div>
      `;
      $('detailOverlay').classList.add('open');
    },

    closeDetail() {
      $('detailOverlay').classList.remove('open');
    },
  };

  function renderScoreRow(label, val, max, unit) {
    val = val || 0;
    const pct = (val / max) * 100;
    return `<div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-2);">
      <span style="width:110px;font-size:var(--text-sm);color:var(--text-secondary);">${label}</span>
      <div style="flex:1;height:6px;background:var(--bg-primary);border-radius:var(--radius-full);overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:var(--accent);border-radius:var(--radius-full);"></div>
      </div>
      <span style="width:50px;text-align:right;font-family:var(--font-mono);font-size:var(--text-sm);font-weight:600;">${unit ? val.toFixed(0) + unit : val.toFixed(1)}</span>
    </div>`;
  }

  /* --- Actions --- */
  async function autoShortlist() {
    if (!confirm('Auto-shortlist the top 30 candidates? This will reset all current selections.')) return;
    try {
      const res = await API.post('/api/admin/auto_shortlist');
      Toast.success('Done', res.message);
      await loadStats();
      await loadCandidates();
    } catch (err) {
      Toast.error('Error', err.message);
    }
  }

  function exportCsv() {
    window.location.href = '/api/admin/export_csv';
  }

  async function togglePublish() {
    try {
      const res = await API.post('/api/admin/toggle_publish');
      const published = res.results_published;
      $('publishToggle').textContent = published ? 'Unpublish Results' : 'Publish Results';
      Toast.info('Updated', published ? 'Results are now visible to students' : 'Results hidden from students');
    } catch (err) {
      Toast.error('Error', err.message);
    }
  }

  async function loadPublishStatus() {
    try {
      const res = await API.get('/api/admin/publish_status');
      $('publishToggle').textContent = res.results_published ? 'Unpublish Results' : 'Publish Results';
    } catch {
      /* ignore */
    }
  }

  async function adminLogout() {
    try { await API.post('/api/admin/logout'); } catch {}
    window.location.href = '/admin-login';
  }

  /* --- Helpers --- */
  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function formatTime(secs) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s}s`;
  }

  init();
})();
