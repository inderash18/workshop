(function () {
  const $ = (id) => document.getElementById(id);

  async function init() {
    const session = await Auth.getSession();
    if (!session.logged_in) {
      window.location.href = '/login';
      return;
    }

    const user = session.candidate || session.user || {};
    renderUserGreeting(user);
    await loadTests();
    Auth.updateNav();
  }

  function renderUserGreeting(user) {
    const greetingEl = $('user-greeting') || document.querySelector('.dashboard-greeting');
    if (greetingEl) {
      const name = user.name || user.email || 'Student';
      greetingEl.textContent = `Welcome, ${name}`;
    }
  }

  async function loadTests() {
    const container = $('tests-container') || document.querySelector('.tests-grid') || document.querySelector('.test-cards');
    if (!container) return;

    container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading tests...</p></div>';

    try {
      const data = await API.get('/api/student/tests');
      const tests = data.tests || data.data || data || [];

      if (!tests.length) {
        container.innerHTML = `
          <div class="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/>
              <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
            <h3>No Tests Assigned</h3>
            <p>You don't have any tests assigned yet. Check back later.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = '';
      tests.forEach(test => {
        container.appendChild(createTestCard(test));
      });
    } catch (err) {
      container.innerHTML = `
        <div class="empty-state error">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <h3>Error Loading Tests</h3>
          <p>${err.message || 'Something went wrong. Please try again.'}</p>
          <button class="btn btn-secondary" onclick="window.location.reload()">Retry</button>
        </div>
      `;
    }
  }

  function createTestCard(test) {
    const card = document.createElement('div');
    card.className = `test-card status-${test.status || 'pending'}`;

    const statusBadge = getStatusBadge(test.status);
    const isActive = test.status === 'active' || test.status === 'published' || test.status === 'in_progress';
    const isCompleted = test.status === 'completed' || test.status === 'submitted';
    const isLocked = test.status === 'locked' || test.status === 'draft';
    const isUpcoming = test.status === 'upcoming' || test.status === 'scheduled';

    const startDate = test.start_time || test.start_date || test.scheduled_at;
    const endDate = test.end_time || test.end_date || test.deadline;
    const duration = test.duration || test.time_limit || 0;
    const score = test.score !== undefined ? test.score : null;
    const totalMarks = test.total_marks || test.marks || test.max_score || 100;

    let buttonHtml = '';
    if (isActive) {
      buttonHtml = `<a href="/test/${test.id || test._id}" class="btn btn-primary btn-sm">Start Test</a>`;
    } else if (isCompleted && test.can_view_results !== false) {
      buttonHtml = `<a href="/test/${test.id || test._id}/result" class="btn btn-secondary btn-sm">View Results</a>`;
    } else if (isUpcoming) {
      buttonHtml = `<button class="btn btn-secondary btn-sm" disabled>Upcoming</button>`;
    } else if (isLocked) {
      buttonHtml = `<button class="btn btn-secondary btn-sm" disabled>Locked</button>`;
    } else {
      buttonHtml = `<button class="btn btn-secondary btn-sm" disabled>${test.status || 'Unknown'}</button>`;
    }

    card.innerHTML = `
      <div class="test-card-header">
        <div class="test-card-title">
          <h3>${escapeHtml(test.title || test.name || 'Untitled Test')}</h3>
          ${statusBadge}
        </div>
        <div class="test-card-meta">
          ${duration ? `<span class="meta-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${duration} min</span>` : ''}
          ${totalMarks ? `<span class="meta-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>${totalMarks} marks</span>` : ''}
        </div>
      </div>
      ${test.description ? `<p class="test-card-desc">${escapeHtml(test.description).substring(0, 150)}${test.description.length > 150 ? '...' : ''}</p>` : ''}
      <div class="test-card-footer">
        <div class="test-card-info">
          ${startDate ? `<span class="info-item">Start: ${formatDate(startDate)}</span>` : ''}
          ${endDate ? `<span class="info-item">End: ${formatDate(endDate)}</span>` : ''}
          ${score !== null ? `<span class="info-item score">Score: ${score}/${totalMarks}</span>` : ''}
        </div>
        <div class="test-card-actions">${buttonHtml}</div>
      </div>
    `;

    return card;
  }

  function getStatusBadge(status) {
    const map = {
      active: { label: 'Active', class: 'badge-success' },
      published: { label: 'Active', class: 'badge-success' },
      in_progress: { label: 'In Progress', class: 'badge-warning' },
      completed: { label: 'Completed', class: 'badge-info' },
      submitted: { label: 'Submitted', class: 'badge-info' },
      pending: { label: 'Pending', class: 'badge-secondary' },
      upcoming: { label: 'Upcoming', class: 'badge-secondary' },
      scheduled: { label: 'Scheduled', class: 'badge-secondary' },
      locked: { label: 'Locked', class: 'badge-danger' },
      draft: { label: 'Draft', class: 'badge-secondary' },
    };
    const s = map[status] || { label: status || 'Unknown', class: 'badge-secondary' };
    return `<span class="badge ${s.class}">${s.label}</span>`;
  }

  function formatDate(dateStr) {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateStr;
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  document.addEventListener('DOMContentLoaded', init);
})();
