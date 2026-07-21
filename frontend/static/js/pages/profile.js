(function () {
  const $ = (id) => document.getElementById(id);

  async function init() {
    const session = await Auth.getSession();
    if (!session.logged_in) {
      window.location.href = '/login';
      return;
    }

    const user = session.candidate || session.user || {};
    renderProfile(user);
    await loadResults();
    renderSelectionStatus(user);
    initEditForm(user);
    Auth.updateNav();
  }

  function renderProfile(user) {
    const avatarEl = $('profile-avatar') || document.querySelector('.profile-avatar-img');
    const nameEl = $('profile-name') || document.querySelector('.profile-name');
    const emailEl = $('profile-email') || document.querySelector('.profile-email');
    const idEl = $('profile-id') || document.querySelector('.profile-id');
    const roleEl = $('profile-role') || document.querySelector('.profile-role');

    if (avatarEl) {
      const initials = getInitials(user.name || user.email || '?');
      if (user.avatar || user.photo) {
        avatarEl.innerHTML = `<img src="${user.avatar || user.photo}" alt="Avatar">`;
      } else {
        avatarEl.innerHTML = `<div class="avatar-initials">${initials}</div>`;
      }
    }
    if (nameEl) nameEl.textContent = user.name || 'N/A';
    if (emailEl) emailEl.textContent = user.email || 'N/A';
    if (idEl) idEl.textContent = user.candidate_id || user.student_id || user.id || 'N/A';
    if (roleEl) roleEl.textContent = user.role || 'student';
  }

  function getInitials(name) {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2);
  }

  async function loadResults() {
    const container = $('results-container') || document.querySelector('.results-section');
    if (!container) return;

    try {
      const data = await API.get('/api/student/results');
      const results = data.results || data.data || data || [];

      if (!results.length) {
        container.innerHTML = `
          <div class="empty-state-small">
            <p>No test results yet.</p>
          </div>
        `;
        return;
      }

      let html = '<div class="results-list">';
      results.forEach(r => {
        const score = r.score !== undefined ? r.score : r.marks_obtained;
        const total = r.total_marks || r.max_score || r.out_of || 100;
        const pct = total > 0 ? Math.round((score / total) * 100) : 0;
        const barColor = pct >= 70 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#ef4444';

        html += `
          <div class="result-item">
            <div class="result-header">
              <span class="result-title">${escapeHtml(r.test_title || r.title || 'Test')}</span>
              <span class="result-score" style="color: ${barColor}">${score}/${total}</span>
            </div>
            <div class="result-bar">
              <div class="result-bar-fill" style="width: ${pct}%; background: ${barColor};"></div>
            </div>
            <div class="result-meta">
              <span>${pct}%</span>
              <span>${r.completed_at ? formatDate(r.completed_at) : ''}</span>
            </div>
          </div>
        `;
      });
      html += '</div>';
      container.innerHTML = html;

      setTimeout(() => {
        container.querySelectorAll('.result-bar-fill').forEach(bar => {
          const w = bar.style.width;
          bar.style.width = '0';
          requestAnimationFrame(() => {
            bar.style.transition = 'width 1s ease';
            bar.style.width = w;
          });
        });
      }, 100);
    } catch (err) {
      container.innerHTML = `<p class="error-text">Failed to load results.</p>`;
    }
  }

  function renderSelectionStatus(user) {
    const container = $('selection-status') || document.querySelector('.selection-status');
    if (!container) return;

    const status = user.selection_status || user.status || 'pending';
    const statusMap = {
      selected: { label: 'Selected', icon: 'check', color: '#10b981' },
      shortlisted: { label: 'Shortlisted', icon: 'star', color: '#f59e0b' },
      pending: { label: 'Pending Review', icon: 'clock', color: '#3b82f6' },
      rejected: { label: 'Not Selected', icon: 'x', color: '#ef4444' },
    };

    const s = statusMap[status] || statusMap.pending;
    const badges = user.badges || [];

    let html = `
      <div class="selection-card" style="border-left-color: ${s.color}">
        <div class="selection-info">
          <h4>Selection Status</h4>
          <span class="selection-badge" style="background: ${s.color}20; color: ${s.color}">${s.label}</span>
        </div>
      </div>
    `;

    if (badges.length > 0) {
      html += '<div class="badges-section"><h4>Badges</h4><div class="badges-list">';
      badges.forEach(b => {
        html += `
          <div class="badge-item" data-tooltip="${escapeHtml(b.description || b.name)}">
            <span class="badge-icon">${b.icon || '🏅'}</span>
            <span class="badge-name">${escapeHtml(b.name || 'Badge')}</span>
          </div>
        `;
      });
      html += '</div></div>';
    }

    container.innerHTML = html;
  }

  function initEditForm(user) {
    const form = $('edit-profile-form') || document.querySelector('.edit-profile-form');
    if (!form) return;

    const nameInput = form.querySelector('[name="name"], #edit-name');
    const emailInput = form.querySelector('[name="email"], #edit-email');
    const phoneInput = form.querySelector('[name="phone"], #edit-phone');

    if (nameInput) nameInput.value = user.name || '';
    if (emailInput) emailInput.value = user.email || '';
    if (phoneInput) phoneInput.value = user.phone || '';

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('[type="submit"]');
      if (btn) btn.disabled = true;

      try {
        const payload = {};
        if (nameInput) payload.name = nameInput.value.trim();
        if (emailInput) payload.email = emailInput.value.trim();
        if (phoneInput) payload.phone = phoneInput.value.trim();

        await API.put('/api/student/profile', payload);
        Toast.success('Success', 'Profile updated successfully');
        Auth.reset();
        await Auth.getSession();
      } catch (err) {
        Toast.error('Error', err.message || 'Failed to update profile');
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  function formatDate(dateStr) {
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
