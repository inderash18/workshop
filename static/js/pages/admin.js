(function () {
  const $ = (id) => document.getElementById(id);

  let allCandidates = [];
  let sortField = 'name';
  let sortDir = 'asc';
  let filterText = '';

  async function init() {
    const ok = await Auth.requireAdmin();
    if (!ok) return;
    Auth.updateNav();

    initLogout();
    await loadStats();
    await loadCandidates();
    initSearch();
    initExport();
    initAutoShortlist();
    initPublishToggle();
  }

  function initLogout() {
    const btn = $('admin-logout') || document.querySelector('.admin-logout');
    if (btn) btn.addEventListener('click', (e) => { e.preventDefault(); Auth.logout(); });
  }

  async function loadStats() {
    try {
      const data = await API.get('/api/admin/stats');
      renderStats(data.stats || data);
    } catch (err) {
      Toast.error('Error', 'Failed to load dashboard stats');
    }
  }

  function renderStats(stats) {
    const container = $('stats-container') || document.querySelector('.stats-grid');
    if (!container) return;

    const cards = [
      { label: 'Total Candidates', value: stats.total_candidates || stats.candidates || 0, icon: 'users', color: '#6366f1' },
      { label: 'Tests Created', value: stats.total_tests || stats.tests || 0, icon: 'file', color: '#10b981' },
      { label: 'Tests Completed', value: stats.completed_tests || stats.completed || 0, icon: 'check', color: '#3b82f6' },
      { label: 'Shortlisted', value: stats.shortlisted || stats.selected || 0, icon: 'star', color: '#f59e0b' },
    ];

    container.innerHTML = cards.map(c => `
      <div class="stat-card">
        <div class="stat-card-icon" style="background: ${c.color}15; color: ${c.color}">
          ${getStatIcon(c.icon)}
        </div>
        <div class="stat-card-info">
          <div class="stat-card-value" data-count="${c.value}">0</div>
          <div class="stat-card-label">${c.label}</div>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.stat-card-value').forEach(el => {
      const target = parseInt(el.dataset.count, 10) || 0;
      animateValue(el, 0, target, 1500);
    });
  }

  function animateValue(el, start, end, duration) {
    const startTime = performance.now();
    function update(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(eased * (end - start) + start).toLocaleString();
      if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  }

  function getStatIcon(type) {
    const icons = {
      users: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
      file: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
      check: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
      star: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    };
    return icons[type] || icons.file;
  }

  async function loadCandidates() {
    const container = $('candidates-table') || document.querySelector('.candidates-table') || document.querySelector('.table-container');
    if (!container) return;

    try {
      const data = await API.get('/api/admin/candidates');
      allCandidates = data.candidates || data.data || data || [];
      renderCandidates(allCandidates);
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><p>Failed to load candidates: ${err.message}</p></div>`;
    }
  }

  function renderCandidates(candidates) {
    const container = $('candidates-table') || document.querySelector('.candidates-table') || document.querySelector('.table-container');
    if (!container) return;

    let filtered = candidates.filter(c => {
      if (!filterText) return true;
      const search = filterText.toLowerCase();
      return (c.name || '').toLowerCase().includes(search) ||
        (c.email || '').toLowerCase().includes(search) ||
        (c.candidate_id || '').toLowerCase().includes(search);
    });

    filtered.sort((a, b) => {
      let va = a[sortField] || '';
      let vb = b[sortField] || '';
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    if (!filtered.length) {
      container.innerHTML = '<div class="empty-state"><p>No candidates found.</p></div>';
      return;
    }

    let html = `
      <table class="data-table">
        <thead>
          <tr>
            <th class="sortable" data-sort="name">Name ${sortIndicator('name')}</th>
            <th class="sortable" data-sort="email">Email ${sortIndicator('email')}</th>
            <th>ID</th>
            <th>Score</th>
            <th>Security</th>
            <th>AI Verdict</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;

    const AI_REC_CLASS = {
      'Highly Recommended': 'badge-success',
      'Recommended': 'badge-warning',
      'Borderline': 'badge-secondary',
      'Not Recommended': 'badge-danger',
    };

    filtered.forEach(c => {
      const score = c.score !== undefined ? c.score : c.total_score;
      const total = c.total_marks || 100;
      const status = c.selection_status || c.status || 'pending';
      const statusClass = {
        selected: 'badge-success',
        waitlisted: 'badge-warning',
        rejected: 'badge-danger',
        disqualified: 'badge-danger',
        pending: 'badge-secondary',
      }[status] || 'badge-secondary';

      const aiRec = c.ai_recommendation || '—';
      const aiClass = AI_REC_CLASS[aiRec] || 'badge-secondary';

      const attemptBadge = c.attempt_status === 'disqualified'
        ? '<span class="badge badge-danger" style="font-size:0.6rem;margin-left:4px">DQ</span>'
        : c.attempt_status === 'completed'
        ? '<span class="badge badge-success" style="font-size:0.6rem;margin-left:4px">Done</span>'
        : '';

      const violations = c.violation_count || 0;
      let secBadge = '';
      if (c.attempt_status === 'disqualified') {
        secBadge = '<span class="badge badge-danger" style="font-size:0.65rem">🚫 DQ</span>';
      } else if (violations > 0) {
        secBadge = `<span class="badge badge-warning" style="font-size:0.65rem">⚠️ ${violations} Alert</span>`;
      } else if (c.attempt_status === 'completed') {
        secBadge = '<span class="badge badge-success" style="font-size:0.65rem">🛡️ Clean</span>';
      } else {
        secBadge = '<span class="badge badge-secondary" style="font-size:0.65rem">⏳ Pending</span>';
      }

      html += `
        <tr data-id="${c.id || c._id}">
          <td class="candidate-name">${escapeHtml(c.name || 'N/A')}${attemptBadge}</td>
          <td>${escapeHtml(c.email || 'N/A')}</td>
          <td><code>${escapeHtml(c.candidate_id || c.id || '')}</code></td>
          <td>${score !== undefined && score !== null ? `${score}/${total}` : 'N/A'}</td>
          <td>${secBadge}</td>
          <td><span class="badge ${aiClass}" style="font-size:0.65rem">${aiRec}</span></td>
          <td><span class="badge ${statusClass}">${capitalize(status)}</span></td>
          <td style="display:flex;gap:6px;align-items:center">
            <button class="btn btn-sm btn-ghost view-btn" data-id="${c.id || c._id}" title="View Details">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <select class="status-select" data-id="${c.id || c._id}" style="font-size:0.75rem;padding:2px 6px;border-radius:6px;border:1px solid var(--border-default);background:var(--bg-secondary);color:var(--text-primary);cursor:pointer">
              <option value="selected" ${status === 'selected' ? 'selected' : ''}>✅ Selected</option>
              <option value="waitlisted" ${status === 'waitlisted' ? 'selected' : ''}>⏳ Waitlisted</option>
              <option value="rejected" ${status === 'rejected' ? 'selected' : ''}>❌ Rejected</option>
              <option value="disqualified" ${status === 'disqualified' ? 'selected' : ''}>🚫 Disqualified</option>
              <option value="pending" ${status === 'pending' ? 'selected' : ''}>⬜ Pending</option>
            </select>
          </td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    container.querySelectorAll('.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const field = th.dataset.sort;
        if (sortField === field) {
          sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          sortField = field;
          sortDir = 'asc';
        }
        renderCandidates(allCandidates);
      });
    });

    container.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', () => viewCandidateDetail(btn.dataset.id));
    });

    container.querySelectorAll('.status-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        const candidateId = sel.dataset.id;
        const newStatus = sel.value;
        try {
          await API.post(`/api/admin/candidates/${candidateId}/status`, { status: newStatus });
          Toast.success('Updated', `Candidate status set to ${capitalize(newStatus)}`);
          await loadCandidates();
        } catch (err) {
          Toast.error('Error', err.message || 'Failed to update status');
          await loadCandidates();
        }
      });
    });
  }

  function sortIndicator(field) {
    if (sortField !== field) return '';
    return sortDir === 'asc' ? '↑' : '↓';
  }

  function initSearch() {
    const search = $('candidate-search') || document.querySelector('.search-input, input[type="search"]');
    if (!search) return;

    let debounce;
    search.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        filterText = search.value.trim();
        renderCandidates(allCandidates);
      }, 300);
    });
  }

  function initExport() {
    const btn = $('export-csv') || document.querySelector('.export-btn');
    if (btn) {
      btn.addEventListener('click', exportCSV);
    }
  }

  function exportCSV() {
    if (!allCandidates.length) {
      Toast.warning('No Data', 'No candidates to export');
      return;
    }

    const headers = ['Name', 'Email', 'Candidate ID', 'Score', 'Status'];
    const rows = allCandidates.map(c => [
      c.name || '',
      c.email || '',
      c.candidate_id || c.id || '',
      c.score !== undefined ? `${c.score}/${c.total_marks || 100}` : 'N/A',
      c.selection_status || c.status || 'pending',
    ]);

    let csv = headers.join(',') + '\n';
    rows.forEach(row => {
      csv += row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `candidates_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    Toast.success('Exported', 'CSV file downloaded');
  }

  async function shortlistCandidate(id) {
    try {
      await API.post(`/api/admin/candidates/${id}/shortlist`);
      Toast.success('Shortlisted', 'Candidate has been shortlisted');
      await loadCandidates();
    } catch (err) {
      Toast.error('Error', err.message || 'Failed to shortlist');
    }
  }

  async function viewCandidateDetail(id) {
    const candidate = allCandidates.find(c => String(c.id || c._id) === String(id));
    if (!candidate) return;

    const aiRec = candidate.ai_recommendation || '—';
    const aiScores = candidate.ai_scores || {};
    const violations = candidate.violation_count || 0;
    const timeTaken = candidate.time_taken ? `${Math.floor(candidate.time_taken / 60)}m ${candidate.time_taken % 60}s` : 'N/A';

    const aiRecColor = {
      'Highly Recommended': '#10b981',
      'Recommended': '#f59e0b',
      'Borderline': '#6366f1',
      'Not Recommended': '#ef4444',
    }[aiRec] || '#6b7280';

    const overlay = document.createElement('div');
    overlay.className = 'overlay candidate-detail-overlay';
    overlay.innerHTML = `
      <div class="overlay-backdrop"></div>
      <div class="overlay-content modal-lg">
        <div class="overlay-header">
          <h3>${escapeHtml(candidate.name || 'Candidate Detail')}</h3>
          <button class="overlay-close">&times;</button>
        </div>
        <div class="overlay-body">
          <div class="detail-grid">
            <div class="detail-item"><label>Name</label><span>${escapeHtml(candidate.name || 'N/A')}</span></div>
            <div class="detail-item"><label>Email</label><span>${escapeHtml(candidate.email || 'N/A')}</span></div>
            <div class="detail-item"><label>Candidate ID</label><span><code>${escapeHtml(candidate.candidate_id || candidate.id || '')}</code></span></div>
            <div class="detail-item"><label>Phone</label><span>${escapeHtml(candidate.phone || 'N/A')}</span></div>
            <div class="detail-item"><label>College</label><span>${escapeHtml(candidate.college || 'N/A')}</span></div>
            <div class="detail-item"><label>Department</label><span>${escapeHtml(candidate.department || 'N/A')}</span></div>
            <div class="detail-item"><label>Score</label><span style="font-size:1.1rem;font-weight:700;color:var(--accent-primary)">${candidate.score !== undefined ? `${candidate.score}/${candidate.total_marks || 100}` : 'N/A'}</span></div>
            <div class="detail-item"><label>Time Taken</label><span>${timeTaken}</span></div>
            <div class="detail-item"><label>Security Violations</label><span style="color:${violations > 0 ? '#ef4444' : '#10b981'}">${violations}</span></div>
            <div class="detail-item"><label>Attempt Status</label><span>${capitalize(candidate.attempt_status || 'not_started')}</span></div>
            <div class="detail-item full-width" style="background:${aiRecColor}15;border:1px solid ${aiRecColor}40;border-radius:10px;padding:1rem">
              <label style="color:${aiRecColor}">🤖 AI Recommendation</label>
              <span style="font-size:1rem;font-weight:700;color:${aiRecColor}">${aiRec}</span>
            </div>
            ${Object.keys(aiScores).some(k => aiScores[k] > 0) ? `
            <div class="detail-item full-width">
              <label>AI Score Breakdown</label>
              <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.5rem;margin-top:0.5rem">
                ${Object.entries(aiScores).map(([k, v]) => `
                  <div style="text-align:center;background:var(--bg-primary);border-radius:8px;padding:0.5rem">
                    <div style="font-size:1.1rem;font-weight:700;color:var(--accent-primary)">${Math.round(v)}%</div>
                    <div style="font-size:0.65rem;color:var(--text-tertiary);text-transform:uppercase">${k.replace('_', ' ')}</div>
                  </div>
                `).join('')}
              </div>
            </div>` : ''}
            <div class="detail-item full-width">
              <label>Current Status</label>
              <select id="modal-status-select" style="font-size:0.85rem;padding:6px 12px;border-radius:8px;border:1px solid var(--border-default);background:var(--bg-secondary);color:var(--text-primary);width:100%">
                <option value="selected" ${candidate.selection_status === 'selected' ? 'selected' : ''}>✅ Selected</option>
                <option value="waitlisted" ${candidate.selection_status === 'waitlisted' ? 'selected' : ''}>⏳ Waitlisted</option>
                <option value="rejected" ${candidate.selection_status === 'rejected' ? 'selected' : ''}>❌ Rejected</option>
                <option value="disqualified" ${candidate.selection_status === 'disqualified' ? 'selected' : ''}>🚫 Disqualified</option>
                <option value="pending" ${(candidate.selection_status || 'pending') === 'pending' ? 'selected' : ''}>⬜ Pending</option>
              </select>
            </div>
          </div>
        </div>
        <div class="overlay-footer">
          <button class="btn btn-secondary overlay-close-btn">Close</button>
          <button class="btn btn-primary save-status-btn" data-id="${id}">Save Status</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('active'));

    const close = () => {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 300);
    };

    overlay.querySelector('.overlay-backdrop').addEventListener('click', close);
    overlay.querySelector('.overlay-close').addEventListener('click', close);
    overlay.querySelector('.overlay-close-btn').addEventListener('click', close);
    overlay.querySelector('.save-status-btn').addEventListener('click', async () => {
      const newStatus = overlay.querySelector('#modal-status-select').value;
      try {
        await API.post(`/api/admin/candidates/${id}/status`, { status: newStatus });
        Toast.success('Updated', `Status set to ${capitalize(newStatus)}`);
        await loadCandidates();
        close();
      } catch (err) {
        Toast.error('Error', err.message || 'Failed to update status');
      }
    });
  }

  function initAutoShortlist() {
    const btn = $('auto-shortlist') || document.querySelector('.auto-shortlist-btn');
    if (btn) {
      btn.addEventListener('click', async () => {
        if (!confirm('Run AI Auto-Shortlist?\n\n• Score ≥ 80% → Selected\n• Score ≥ 60% → Waitlisted\n• Score < 60% → Rejected\n• Disqualified candidates remain unchanged')) return;
        try {
          const data = await API.post('/api/admin/auto-shortlist');
          Toast.success('AI Shortlisting Done', data.message || 'Completed');
          await loadCandidates();
        } catch (err) {
          Toast.error('Error', err.message || 'Auto-shortlist failed');
        }
      });
    }
  }

  function initPublishToggle() {
    document.querySelectorAll('.publish-toggle').forEach(toggle => {
      toggle.addEventListener('change', async () => {
        const testId = toggle.dataset.id || toggle.dataset.testId;
        const published = toggle.checked;
        try {
          await API.put(`/api/admin/tests/${testId}/publish`, { published });
          Toast.success('Updated', `Test ${published ? 'published' : 'unpublished'}`);
        } catch (err) {
          toggle.checked = !published;
          Toast.error('Error', err.message || 'Failed to update');
        }
      });
    });
  }

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  document.addEventListener('DOMContentLoaded', init);
})();
