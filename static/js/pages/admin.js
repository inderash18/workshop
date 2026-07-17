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
            <th>Test Score</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;

    filtered.forEach(c => {
      const score = c.score !== undefined ? c.score : c.total_score;
      const total = c.total_marks || 100;
      const status = c.selection_status || c.status || 'pending';
      const statusClass = status === 'selected' ? 'badge-success' : status === 'shortlisted' ? 'badge-warning' : status === 'rejected' ? 'badge-danger' : 'badge-secondary';

      html += `
        <tr data-id="${c.id || c._id}">
          <td class="candidate-name">${escapeHtml(c.name || 'N/A')}</td>
          <td>${escapeHtml(c.email || 'N/A')}</td>
          <td><code>${escapeHtml(c.candidate_id || c.id || '')}</code></td>
          <td>${score !== undefined && score !== null ? `${score}/${total}` : 'N/A'}</td>
          <td><span class="badge ${statusClass}">${capitalize(status)}</span></td>
          <td>
            <button class="btn btn-sm btn-ghost view-btn" data-id="${c.id || c._id}" title="View Details">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button class="btn btn-sm btn-ghost shortlist-btn" data-id="${c.id || c._id}" title="Shortlist">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </button>
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

    container.querySelectorAll('.shortlist-btn').forEach(btn => {
      btn.addEventListener('click', () => shortlistCandidate(btn.dataset.id));
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
            <div class="detail-item"><label>Score</label><span>${candidate.score !== undefined ? `${candidate.score}/${candidate.total_marks || 100}` : 'N/A'}</span></div>
            <div class="detail-item"><label>Status</label><span class="badge badge-${candidate.selection_status === 'selected' ? 'success' : 'secondary'}">${capitalize(candidate.selection_status || 'pending')}</span></div>
            ${candidate.test_results ? `<div class="detail-item full-width"><label>Test Results</label><pre>${JSON.stringify(candidate.test_results, null, 2)}</pre></div>` : ''}
          </div>
        </div>
        <div class="overlay-footer">
          <button class="btn btn-secondary overlay-close-btn">Close</button>
          <button class="btn btn-primary shortlist-action-btn" data-id="${id}">Shortlist</button>
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
    overlay.querySelector('.shortlist-action-btn').addEventListener('click', async () => {
      await shortlistCandidate(id);
      close();
    });
  }

  function initAutoShortlist() {
    const btn = $('auto-shortlist') || document.querySelector('.auto-shortlist-btn');
    if (btn) {
      btn.addEventListener('click', async () => {
        if (!confirm('Auto-shortlist candidates who scored above the threshold?')) return;
        try {
          const data = await API.post('/api/admin/auto-shortlist');
          Toast.success('Done', data.message || 'Auto-shortlist completed');
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
