(function () {
  const $ = (id) => document.getElementById(id);

  let manager = null;
  let testId = null;

  function getTestId() {
    const meta = document.querySelector('meta[name="test-id"]');
    if (meta) return meta.content;

    const path = window.location.pathname;
    const match = path.match(/\/test\/([^/]+)/);
    if (match) return match[1];

    const dataEl = document.querySelector('[data-test-id]');
    if (dataEl) return dataEl.dataset.testId;

    return null;
  }

  async function init() {
    testId = getTestId();
    if (!testId) {
      showError('Invalid test URL');
      return;
    }

    const session = await Auth.getSession();
    if (!session.logged_in) {
      window.location.href = '/login';
      return;
    }

    try {
      manager = new TestManager(testId);
      await manager.loadQuestions();
      renderPreTestScreen();
    } catch (err) {
      showError('Failed to load test: ' + (err.message || 'Unknown error'));
    }
  }

  function renderPreTestScreen() {
    const main = $('test-main') || document.querySelector('.test-session-main');
    if (!main) return;

    const testData = manager.testData || {};
    const qCount = manager.questions.length;
    const duration = testData.duration || 0;

    main.innerHTML = `
      <div class="pre-test-screen">
        <div class="pre-test-card">
          <div class="pre-test-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
          </div>
          <h1 class="pre-test-title">${escapeHtml(testData.title || 'Assessment')}</h1>
          ${testData.description ? `<p class="pre-test-desc">${escapeHtml(testData.description)}</p>` : ''}

          <div class="pre-test-info-grid">
            <div class="pre-test-info-item">
              <div class="info-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <div>
                <span class="info-value">${duration} min</span>
                <span class="info-label">Duration</span>
              </div>
            </div>
            <div class="pre-test-info-item">
              <div class="info-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
              </div>
              <div>
                <span class="info-value">${qCount}</span>
                <span class="info-label">Questions</span>
              </div>
            </div>
            <div class="pre-test-info-item">
              <div class="info-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              </div>
              <div>
                <span class="info-value">${testData.total_marks || testData.marks || '—'}</span>
                <span class="info-label">Total Marks</span>
              </div>
            </div>
          </div>

          <div class="pre-test-rules">
            <h3>Rules & Instructions</h3>
            <ul>
              <li>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>
                The test will run in <strong>fullscreen mode</strong>. Exiting fullscreen will auto-submit your test.
              </li>
              <li>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                Switching tabs is limited to <strong>${testData.tab_switch_limit || 3} times</strong>. Exceeding this will auto-submit.
              </li>
              <li>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                Copy, paste, right-click, and keyboard shortcuts are <strong>disabled</strong>.
              </li>
              <li>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                Developer tools are <strong>monitored</strong>. Attempting to open them will auto-submit.
              </li>
              <li>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                You can navigate between questions and change answers freely.
              </li>
              <li>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                Click <strong>"Submit Test"</strong> when you are done, or the test auto-submits on timer expiry.
              </li>
            </ul>
          </div>

          <div class="pre-test-actions">
            <button id="begin-test-btn" class="btn btn-primary btn-lg">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              Begin Test
            </button>
          </div>
        </div>
      </div>
    `;

    const beginBtn = $('begin-test-btn');
    if (beginBtn) {
      beginBtn.addEventListener('click', startTest);
    }
  }

  async function startTest() {
    const beginBtn = $('begin-test-btn');
    if (beginBtn) {
      beginBtn.disabled = true;
      beginBtn.innerHTML = '<div class="spinner-sm"></div> Entering fullscreen...';
    }

    try {
      await manager.startTest();
      renderActiveTest();
    } catch (err) {
      if (beginBtn) {
        beginBtn.disabled = false;
        beginBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Begin Test';
      }
      Toast.error('Error', 'Failed to start test: ' + (err.message || 'Unknown'));
    }
  }

  function renderActiveTest() {
    const main = $('test-main') || document.querySelector('.test-session-main');
    if (!main) return;

    main.innerHTML = `
      <div class="test-session-layout">
        <div class="test-topbar">
          <div class="test-topbar-left">
            <span class="test-title-mini">${escapeHtml((manager.testData || {}).title || 'Test')}</span>
          </div>
          <div class="test-topbar-center">
            <div id="test-timer" class="test-timer-wrapper"></div>
          </div>
          <div class="test-topbar-right">
            <div class="security-status" id="security-indicator">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <span>Tab switches: <strong id="tab-switches">0/${manager.security ? manager.security.options.tabSwitchLimit : 3}</strong></span>
              <span>Violations: <strong id="violation-count">0</strong></span>
            </div>
          </div>
        </div>

        <div class="test-body">
          <div class="test-sidebar">
            <div class="sidebar-header">
              <h4>Questions</h4>
              <span id="progress-counter" class="progress-counter">0/${manager.questions.length} answered</span>
            </div>
            <div class="progress-bar-wrapper">
              <div class="progress-bar-track">
                <div id="progress-bar" class="progress-bar-fill" style="width: 0%"></div>
              </div>
            </div>
            <div id="question-nav" class="question-nav-grid"></div>
            <div class="sidebar-actions">
              <button id="submit-test-btn" class="btn btn-primary btn-block">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Submit Test
              </button>
            </div>
          </div>

          <div class="test-content">
            <div id="question-container" class="question-container"></div>
            <div class="test-nav-buttons">
              <button id="prev-btn" class="btn btn-secondary" disabled>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
                Previous
              </button>
              <button id="next-btn" class="btn btn-primary">
                Next
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    if (manager.timer) {
      manager._initTimer((manager.testData || {}).duration || 60);
    }

    manager.renderQuestionNav();
    manager.renderCurrentQuestion();
    manager.updateProgress();
    initNavigationButtons();
    initSubmitButton();
    initKeyboardNav();
    preventBrowserNav();

    if (manager.security) {
      manager.security._updateUI();
    }
  }

  function initNavigationButtons() {
    const prevBtn = $('prev-btn');
    const nextBtn = $('next-btn');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        manager.prevQuestion();
        manager.renderQuestionNav();
        updateNavButtons();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        manager.nextQuestion();
        manager.renderQuestionNav();
        updateNavButtons();
      });
    }

    updateNavButtons();
  }

  function updateNavButtons() {
    const prevBtn = $('prev-btn');
    const nextBtn = $('next-btn');

    if (prevBtn) prevBtn.disabled = manager.currentIndex === 0;
    if (nextBtn) {
      if (manager.currentIndex === manager.questions.length - 1) {
        nextBtn.style.display = 'none';
      } else {
        nextBtn.style.display = '';
      }
    }
  }

  function initKeyboardNav() {
    document.addEventListener('keydown', (e) => {
      if (!manager.started || manager.completed) return;

      if (e.key === 'ArrowLeft' || (e.altKey && e.key === 'ArrowLeft')) {
        e.preventDefault();
        manager.prevQuestion();
        manager.renderQuestionNav();
        updateNavButtons();
      }

      if (e.key === 'ArrowRight' || (e.altKey && e.key === 'ArrowRight')) {
        e.preventDefault();
        manager.nextQuestion();
        manager.renderQuestionNav();
        updateNavButtons();
      }
    });
  }

  function initSubmitButton() {
    const submitBtn = $('submit-test-btn');
    if (!submitBtn) return;

    submitBtn.addEventListener('click', async () => {
      const answered = manager.getAnsweredCount();
      const total = manager.questions.length;
      const unanswered = total - answered;

      let message = 'Are you sure you want to submit your test?';
      if (unanswered > 0) {
        message = `You have ${unanswered} unanswered question${unanswered > 1 ? 's' : ''}. Are you sure you want to submit?`;
      }

      if (!confirm(message)) return;

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<div class="spinner-sm"></div> Submitting...';

      try {
        await manager.submitTest();
        renderCompletionScreen();
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Submit Test';
        Toast.error('Error', 'Failed to submit: ' + (err.message || 'Unknown'));
      }
    });
  }

  function renderCompletionScreen() {
    const main = $('test-main') || document.querySelector('.test-session-main');
    if (!main) return;

    const answered = manager.getAnsweredCount();
    const total = manager.questions.length;
    const duration = manager.startTime ? Math.round((Date.now() - new Date(manager.startTime).getTime()) / 60000) : 0;

    main.innerHTML = `
      <div class="completion-screen">
        <div class="completion-icon success">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <h1 class="completion-title">Test Submitted Successfully</h1>
        <p class="completion-subtitle">Your responses have been recorded.</p>

        <div class="completion-stats">
          <div class="completion-stat">
            <span class="stat-value">${answered}/${total}</span>
            <span class="stat-label">Questions Answered</span>
          </div>
          <div class="completion-stat">
            <span class="stat-value">${duration} min</span>
            <span class="stat-label">Time Taken</span>
          </div>
        </div>

        <div class="completion-actions">
          <a href="/dashboard" class="btn btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            Return to Dashboard
          </a>
        </div>
      </div>
    `;
  }

  function preventBrowserNav() {
    if (window.history && window.history.pushState) {
      window.history.pushState(null, '', window.location.href);
      window.addEventListener('popstate', () => {
        window.history.pushState(null, '', window.location.href);
        if (manager && manager.started && !manager.completed) {
          Toast.warning('Navigation Blocked', 'You cannot navigate away during the test');
        }
      });
    }
  }

  function showError(message) {
    const main = $('test-main') || document.querySelector('.test-session-main');
    if (!main) return;

    main.innerHTML = `
      <div class="error-screen">
        <div class="error-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        </div>
        <h2>Error</h2>
        <p>${escapeHtml(message)}</p>
        <a href="/dashboard" class="btn btn-primary">Return to Dashboard</a>
      </div>
    `;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  document.addEventListener('DOMContentLoaded', init);
})();
