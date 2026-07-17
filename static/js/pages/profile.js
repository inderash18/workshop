/* ============================================
   PROFILE — Profile editor + results display
   ============================================ */

(function() {
  const $ = id => document.getElementById(id);

  const SCORE_DIMS = [
    { key: 'score_logic', label: 'Logic', max: 40, color: '#6366f1' },
    { key: 'score_creativity', label: 'Creativity', max: 20, color: '#ec4899' },
    { key: 'score_ai_knowledge', label: 'AI Knowledge', max: 20, color: '#3b82f6' },
    { key: 'score_problem_solving', label: 'Problem Solving', max: 10, color: '#22c55e' },
    { key: 'score_research', label: 'Research', max: 10, color: '#a855f7' },
    { key: 'score_ai_potential', label: 'AI Potential', max: 10, color: '#f97316' },
    { key: 'score_workshop_compat', label: 'Workshop Fit', max: 10, color: '#22d3ee' },
    { key: 'score_selection_prob', label: 'Selection Prob.', max: 100, color: '#eab308', unit: '%' },
  ];

  let candidate = null;

  async function init() {
    try {
      const res = await API.get('/api/session');
      if (!res.logged_in) { window.location.href = '/login'; return; }
      candidate = res.candidate;
      renderHeader(candidate);
      renderForm(candidate);
      if (candidate.completed) renderResults(candidate);
      renderBadges(candidate);
      renderSelection(candidate);
    } catch (err) {
      Toast.error('Error', 'Failed to load profile');
    }
  }

  function renderHeader(c) {
    const initials = (c.name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    $('profileAvatar').textContent = initials;
    $('profileName').textContent = c.name || 'Student';
    $('profileEmail').textContent = c.email || '';
    $('profileId').textContent = `ID: ${c.candidate_id || 'N/A'}`;
  }

  function renderForm(c) {
    $('pName').value = c.name || '';
    $('pPhone').value = c.phone || '';
    $('pCollege').value = c.college || '';
    $('pDept').value = c.department || '';
    $('pYear').value = c.year || '1';
    $('pLinkedin').value = c.linkedin || '';
    $('pGithub').value = c.github || '';

    $('profileForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('saveBtn');
      btn.disabled = true;
      btn.textContent = 'Saving...';
      try {
        const result = await API.post('/api/profile/update', {
          name: $('pName').value.trim(),
          phone: $('pPhone').value.trim(),
          college: $('pCollege').value.trim(),
          department: $('pDept').value.trim(),
          year: $('pYear').value,
          linkedin: $('pLinkedin').value.trim(),
          github: $('pGithub').value.trim(),
        });
        if (result.success) {
          Toast.success('Saved', 'Profile updated successfully');
          $('profileName').textContent = $('pName').value.trim();
        } else {
          Toast.error('Error', result.error || 'Failed to save');
        }
      } catch (err) {
        Toast.error('Error', err.message || 'Failed to save');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Save Changes';
      }
    });
  }

  function renderResults(c) {
    $('resultsCard').style.display = '';
    const bars = $('resultsBars');
    bars.innerHTML = SCORE_DIMS.map(d => {
      const val = c[d.key] || 0;
      const pct = (val / d.max) * 100;
      return `
        <div class="result-bar">
          <span class="result-bar-label">${d.label}</span>
          <div class="result-bar-track">
            <div class="result-bar-fill" style="width:${pct}%;background:${d.color};"></div>
          </div>
          <span class="result-bar-value" style="color:${d.color};">${d.unit ? val.toFixed(0) + '%' : val.toFixed(1)}</span>
        </div>
      `;
    }).join('');

    $('finalScore').textContent = (c.score_final || 0).toFixed(1) + '%';
  }

  function renderBadges(c) {
    const details = c.badge_details || [];
    const container = $('profileBadges');
    if (details.length === 0) {
      container.innerHTML = '<p style="color:var(--text-tertiary);font-size:var(--text-sm);">Complete the challenge to earn badges.</p>';
      return;
    }
    container.innerHTML = details.filter(b => b.earned).map(b => `
      <div class="badge badge-gradient" style="gap:var(--space-2);padding:0.4rem 0.8rem;" data-tooltip="${b.description}">
        <span>${b.icon}</span>
        <span>${b.name}</span>
      </div>
    `).join('') || '<p style="color:var(--text-tertiary);font-size:var(--text-sm);">No badges earned yet.</p>';
  }

  function renderSelection(c) {
    const el = $('selectionStatus');
    if (c.selected === 3) {
      el.innerHTML = `<div class="badge badge-red" style="font-size:var(--text-sm);padding:0.5rem 1rem;">Disqualified — Too many violations</div>`;
    } else if (c.selected === 1) {
      el.innerHTML = `<div class="badge badge-green" style="font-size:var(--text-sm);padding:0.5rem 1rem;">Shortlisted for AI Workshop</div>`;
    } else if (c.completed) {
      el.innerHTML = `<div class="badge badge-blue" style="font-size:var(--text-sm);padding:0.5rem 1rem;">Awaiting Results</div>`;
    } else {
      el.innerHTML = `<div class="badge badge-yellow" style="font-size:var(--text-sm);padding:0.5rem 1rem;">Not Yet Started</div>`;
    }
  }

  init();
})();
