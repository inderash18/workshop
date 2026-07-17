/* ============================================
   DASHBOARD — Score visualization + stats
   ============================================ */

(function() {
  const $ = id => document.getElementById(id);

  async function init() {
    try {
      const res = await API.get('/api/session');
      if (!res.logged_in) { window.location.href = '/login'; return; }
      const c = res.candidate;
      renderHeader(c);

      if (!c.completed && !c.started) {
        $('dashPending').style.display = '';
        $('dashContent').style.display = 'none';
        return;
      }
      if (!c.completed) {
        $('dashPending').style.display = '';
        $('dashPending').querySelector('h2').textContent = 'Challenge In Progress';
        $('dashPending').querySelector('p').textContent = 'Continue where you left off.';
        $('dashPending').querySelector('a').textContent = 'Continue Challenge';
        $('dashContent').style.display = 'none';
        return;
      }

      $('dashPending').style.display = 'none';
      $('dashContent').style.display = '';
      renderStatus(c);
      renderScores(c);
      renderStats(c);
      renderBadges(c);
      renderRadar(c);
    } catch (err) {
      Toast.error('Error', 'Failed to load dashboard');
    }
  }

  function renderHeader(c) {
    $('dashName').textContent = c.name ? c.name.split(' ')[0] : 'Student';
    $('dashCollege').textContent = [c.college, c.department, c.year ? `Year ${c.year}` : ''].filter(Boolean).join(' · ');

    const actions = $('dashActions');
    if (c.completed) {
      actions.innerHTML = `<a href="/profile" class="btn btn-secondary btn-sm">View Profile</a>`;
    } else {
      actions.innerHTML = `<a href="/challenge" class="btn btn-primary btn-sm">Start Challenge</a>`;
    }
  }

  function renderStatus(c) {
    const banner = $('statusBanner');
    if (c.selected === 3) {
      banner.innerHTML = `<div class="status-banner disqualified"><span class="status-icon">&#x26D4;</span><div class="status-text"><h4>Disqualified</h4><p>Too many violations were recorded during the challenge.</p></div></div>`;
    } else if (c.selected === 1) {
      banner.innerHTML = `<div class="status-banner completed"><span class="status-icon">&#x1F3C6;</span><div class="status-text"><h4>Shortlisted!</h4><p>Congratulations! You've been shortlisted for the AI Workshop.</p></div></div>`;
    } else if (c.completed) {
      banner.innerHTML = `<div class="status-banner completed"><span class="status-icon">&#x2705;</span><div class="status-text"><h4>Challenge Completed</h4><p>Your results have been scored. Check your ranking on the leaderboard.</p></div></div>`;
    }
  }

  function renderScores(c) {
    const dimensions = [
      { key: 'score_logic', label: 'Logic', max: 40, color: '#6366f1' },
      { key: 'score_creativity', label: 'Creativity', max: 20, color: '#ec4899' },
      { key: 'score_ai_knowledge', label: 'AI Knowledge', max: 20, color: '#3b82f6' },
      { key: 'score_problem_solving', label: 'Problem Solving', max: 10, color: '#22c55e' },
      { key: 'score_research', label: 'Research', max: 10, color: '#a855f7' },
      { key: 'score_time', label: 'Speed', max: 10, color: '#eab308' },
      { key: 'score_ai_potential', label: 'AI Potential', max: 10, color: '#f97316' },
      { key: 'score_selection_prob', label: 'Selection %', max: 100, color: '#22d3ee', unit: '%' },
    ];

    const grid = $('scoreGrid');
    grid.innerHTML = '';

    dimensions.forEach(d => {
      const val = c[d.key] || 0;
      const pct = d.max === 100 ? val : (val / d.max) * 100;
      const card = document.createElement('div');
      card.className = 'glass-card score-card';
      card.innerHTML = `
        <div style="position:relative;width:80px;height:80px;margin:0 auto;">
          <svg width="80" height="80" style="transform:rotate(-90deg)">
            <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="5"/>
            <circle cx="40" cy="40" r="34" fill="none" stroke="${d.color}" stroke-width="5"
              stroke-linecap="round" stroke-dasharray="${2 * Math.PI * 34}"
              stroke-dashoffset="${2 * Math.PI * 34 * (1 - pct / 100)}"
              style="transition: stroke-dashoffset 1.2s cubic-bezier(0.16,1,0.3,1);"/>
          </svg>
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
            <span style="font-family:var(--font-display);font-size:var(--text-lg);font-weight:700;">${d.unit ? val.toFixed(0) + '%' : val.toFixed(1)}</span>
          </div>
        </div>
        <div class="score-card-label">${d.label}</div>
      `;
      grid.appendChild(card);
    });
  }

  function renderStats(c) {
    const stats = [
      { label: 'Total Time', value: formatTime(c.time_taken || 0) },
      { label: 'Tab Switches', value: c.tab_switches || 0 },
      { label: 'Violations', value: c.violation_count || 0 },
      { label: 'Final Score', value: (c.score_final || 0).toFixed(1) },
    ];
    const grid = $('statsGrid');
    grid.innerHTML = stats.map(s => `
      <div class="glass-card proctor-stat">
        <div class="proctor-stat-value">${s.value}</div>
        <div class="proctor-stat-label">${s.label}</div>
      </div>
    `).join('');
  }

  function renderBadges(c) {
    const details = c.badge_details || [];
    const grid = $('badgeGrid');
    if (details.length === 0) {
      grid.innerHTML = '<p style="color:var(--text-tertiary);font-size:var(--text-sm);">No badges earned yet.</p>';
      return;
    }
    grid.innerHTML = details.map(b => `
      <div class="glass-card badge-card ${b.earned ? '' : 'locked'}">
        <div class="badge-icon" style="background:${b.color}22;color:${b.color};">${b.icon}</div>
        <div>
          <div class="badge-name">${b.name}</div>
          <div class="badge-desc">${b.description}</div>
        </div>
      </div>
    `).join('');
  }

  function renderRadar(c) {
    const canvas = $('radarChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const labels = ['Logic', 'Creativity', 'AI Knowledge', 'Problem Solving', 'Research', 'Speed'];
    const maxVals = [40, 20, 20, 10, 10, 10];
    const vals = [
      c.score_logic || 0, c.score_creativity || 0, c.score_ai_knowledge || 0,
      c.score_problem_solving || 0, c.score_research || 0, c.score_time || 0,
    ];
    const normalized = vals.map((v, i) => (v / maxVals[i]) * 100);

    new Chart(canvas, {
      type: 'radar',
      data: {
        labels,
        datasets: [{
          data: normalized,
          backgroundColor: 'rgba(99, 102, 241, 0.15)',
          borderColor: '#6366f1',
          borderWidth: 2,
          pointBackgroundColor: '#6366f1',
          pointBorderColor: '#fff',
          pointRadius: 4,
          pointHoverRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { display: false } },
        scales: {
          r: {
            beginAtZero: true,
            max: 100,
            ticks: { display: false, stepSize: 20 },
            grid: { color: 'rgba(255,255,255,0.06)' },
            angleLines: { color: 'rgba(255,255,255,0.06)' },
            pointLabels: {
              color: '#94a3b8',
              font: { family: "'Inter', sans-serif", size: 12 },
            },
          },
        },
      },
    });
  }

  function formatTime(secs) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s}s`;
  }

  init();
})();
