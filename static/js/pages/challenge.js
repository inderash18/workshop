/* ============================================
   CHALLENGE — Full challenge UI engine
   ============================================ */

(function() {
  const $ = id => document.getElementById(id);

  const state = {
    levels: [],
    currentLevel: 0,
    currentQuestion: 0,
    answers: {},
    timer: null,
    totalTime: 0,
    started: false,
    violations: [],
    tabSwitches: 0,
    lastActive: Date.now(),
    idleDuration: 0,
    mouseMoves: 0,
    backspaceCount: 0,
    typingTimes: [],
  };

  /* --- Proctoring --- */
  function initProctoring() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && state.started) {
        state.tabSwitches++;
        state.violations.push({
          time: Date.now(),
          type: 'tab_switch',
          detail: `Tab switch #${state.tabSwitches}`,
        });
        updateViolationUI();
      }
    });

    document.addEventListener('contextmenu', e => {
      if (state.started) {
        e.preventDefault();
        state.violations.push({ time: Date.now(), type: 'right_click', detail: 'Right-click blocked' });
        updateViolationUI();
      }
    });

    ['copy', 'paste', 'cut'].forEach(evt => {
      document.addEventListener(evt, e => {
        if (state.started) {
          e.preventDefault();
          state.violations.push({ time: Date.now(), type: evt, detail: `${evt} blocked` });
          updateViolationUI();
        }
      });
    });

    document.addEventListener('keydown', e => {
      if (state.started && (e.ctrlKey || e.metaKey) && ['c', 'v', 'x', 'a'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        state.violations.push({ time: Date.now(), type: 'shortcut', detail: `Ctrl+${e.key.toUpperCase()} blocked` });
        updateViolationUI();
      }
    });

    document.addEventListener('mousemove', () => {
      if (state.started) state.mouseMoves++;
    });

    setInterval(() => {
      if (state.started) {
        const idle = Date.now() - state.lastActive;
        if (idle > 30000) state.idleDuration += 30;
      }
    }, 30000);

    ['mousemove', 'keydown', 'click', 'scroll'].forEach(evt => {
      document.addEventListener(evt, () => { state.lastActive = Date.now(); }, { passive: true });
    });

    document.addEventListener('fullscreenchange', () => {
      if (state.started && !document.fullscreenElement) {
        state.violations.push({ time: Date.now(), type: 'fullscreen_exit', detail: 'Exited fullscreen' });
        updateViolationUI();
      }
    });
  }

  function updateViolationUI() {
    const bar = $('violationBar');
    const dot = $('proctorDot');
    const text = $('violationText');
    const count = state.violations.length;
    bar.className = 'violation-bar ' + (count === 0 ? 'safe' : count < 3 ? 'warn' : 'danger');
    dot.className = 'proctor-dot ' + (count === 0 ? 'green' : 'red');
    text.textContent = count === 0 ? 'All clear' : `${count} violation${count > 1 ? 's' : ''}`;
  }

  /* --- Telemetry for typing speed --- */
  function trackTyping(e) {
    if (!state.started) return;
    if (e.key === 'Backspace') { state.backspaceCount++; return; }
    if (e.key.length === 1) {
      const now = Date.now();
      state.typingTimes.push(now);
    }
  }

  function getTypingStats() {
    const times = state.typingTimes;
    if (times.length < 2) return { avg: 0, variance: 0 };
    const gaps = [];
    for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const variance = gaps.reduce((s, g) => s + Math.pow(g - avg, 2), 0) / gaps.length;
    const cpm = avg > 0 ? Math.round(60000 / avg) : 0;
    return { avg: cpm, variance: Math.round(variance) };
  }

  /* --- Load questions --- */
  async function loadQuestions() {
    try {
      const data = await API.get('/api/challenge/questions');
      state.levels = data.levels;
      state.totalTime = data.total_time;
      return true;
    } catch (err) {
      Toast.error('Error', err.message || 'Failed to load challenge');
      return false;
    }
  }

  /* --- Render level list --- */
  function renderLevelList() {
    const list = $('levelList');
    list.innerHTML = '';
    state.levels.forEach((level, i) => {
      const li = document.createElement('li');
      li.className = 'level-item' + (i === state.currentLevel ? ' active' : '') + (isLevelComplete(i) ? ' completed' : '');
      li.innerHTML = `<span class="level-num">${isLevelComplete(i) ? '&#10003;' : level.id}</span><span>${level.name}</span>`;
      li.addEventListener('click', () => goToLevel(i));
      list.appendChild(li);
    });
  }

  function isLevelComplete(idx) {
    const level = state.levels[idx];
    return level.questions.every(q => state.answers[q.id] !== undefined && state.answers[q.id] !== '');
  }

  function updateProgress() {
    let total = 0, answered = 0;
    state.levels.forEach(lv => lv.questions.forEach(q => {
      total++;
      if (state.answers[q.id] !== undefined && state.answers[q.id] !== '') answered++;
    }));
    $('progressText').textContent = `${answered} / ${total}`;
    $('progressFill').style.width = `${total > 0 ? (answered / total) * 100 : 0}%`;
    $('submitBtn').disabled = answered < total * 0.5;
  }

  /* --- Render current question --- */
  function renderQuestion() {
    const level = state.levels[state.currentLevel];
    if (!level) return showComplete();

    const q = level.questions[state.currentQuestion];
    if (!q) {
      if (state.currentLevel < state.levels.length - 1) {
        goToLevel(state.currentLevel + 1);
      } else {
        showComplete();
      }
      return;
    }

    $('levelIcon').textContent = level.icon;
    $('levelLabel').textContent = `Level ${level.id} of ${state.levels.length}`;
    $('levelName').textContent = level.name;

    const container = $('questionContent');
    const typeBadge = `<span class="q-type-badge q-type-${q.type}">${q.type.replace('_', ' ')}</span>`;
    const qNum = `<span style="color:var(--text-muted);font-size:var(--text-xs);">Question ${state.currentQuestion + 1} of ${level.questions.length}</span>`;

    let inputHTML = '';
    if (q.type === 'mcq') {
      inputHTML = '<div class="mcq-options">';
      q.options.forEach(opt => {
        const selected = state.answers[q.id] === opt;
        inputHTML += `<div class="mcq-option${selected ? ' selected' : ''}" data-value="${esc(opt)}">
          <div class="mcq-radio"></div>
          <span>${esc(opt)}</span>
        </div>`;
      });
      inputHTML += '</div>';
    } else if (q.type === 'text') {
      inputHTML = `<input class="form-input" type="text" id="qInput" placeholder="${esc(q.placeholder || 'Type your answer')}" value="${esc(state.answers[q.id] || '')}">`;
    } else if (q.type === 'textarea') {
      inputHTML = `<textarea class="form-textarea" id="qInput" rows="6" placeholder="${esc(q.placeholder || 'Write your response...')}">${esc(state.answers[q.id] || '')}</textarea>`;
      if (q.min_words) {
        inputHTML += `<span class="form-hint" id="wordHint">Minimum ${q.min_words} words</span>`;
      }
    }

    container.innerHTML = `
      <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-6);">${typeBadge} ${qNum}</div>
      <div style="font-size:var(--text-lg);color:var(--text-primary);line-height:1.6;margin-bottom:var(--space-6);">${esc(q.text)}</div>
      ${inputHTML}
    `;

    $('prevBtn').style.visibility = state.currentQuestion > 0 || state.currentLevel > 0 ? 'visible' : 'hidden';
    const isLast = state.currentLevel === state.levels.length - 1 && state.currentQuestion === level.questions.length - 1;
    $('nextBtn').textContent = isLast ? 'Finish' : 'Next Question';

    if (q.type === 'mcq') {
      container.querySelectorAll('.mcq-option').forEach(opt => {
        opt.addEventListener('click', () => {
          state.answers[q.id] = opt.dataset.value;
          container.querySelectorAll('.mcq-option').forEach(o => o.classList.remove('selected'));
          opt.classList.add('selected');
          updateProgress();
        });
      });
    } else {
      const input = $('qInput');
      if (input) {
        input.addEventListener('input', () => {
          state.answers[q.id] = input.value;
          updateProgress();
          if (q.min_words) {
            const words = input.value.trim().split(/\s+/).filter(Boolean).length;
            const hint = $('wordHint');
            if (hint) {
              hint.textContent = words >= q.min_words
                ? `${words} words — good!`
                : `${words} / ${q.min_words} minimum words`;
              hint.style.color = words >= q.min_words ? 'var(--green)' : 'var(--text-muted)';
            }
          }
        });
        input.addEventListener('keydown', trackTyping);
        input.focus();
      }
    }

    renderLevelList();
    updateProgress();
  }

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* --- Navigation --- */
  function goToLevel(idx) {
    if (idx > state.currentLevel + 1) return;
    state.currentLevel = idx;
    state.currentQuestion = 0;
    $('questionArea').style.display = '';
    $('startScreen').style.display = 'none';
    $('completeScreen').style.display = 'none';
    renderQuestion();
  }

  function nextQuestion() {
    const level = state.levels[state.currentLevel];
    if (state.currentQuestion < level.questions.length - 1) {
      state.currentQuestion++;
    } else if (state.currentLevel < state.levels.length - 1) {
      state.currentLevel++;
      state.currentQuestion = 0;
    } else {
      showComplete();
      return;
    }
    renderQuestion();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function prevQuestion() {
    if (state.currentQuestion > 0) {
      state.currentQuestion--;
    } else if (state.currentLevel > 0) {
      state.currentLevel--;
      state.currentQuestion = state.levels[state.currentLevel].questions.length - 1;
    }
    renderQuestion();
  }

  function showComplete() {
    $('questionArea').style.display = 'none';
    $('startScreen').style.display = 'none';
    $('completeScreen').style.display = '';
    if (state.timer) state.timer.stop();
  }

  /* --- Start --- */
  async function startChallenge() {
    const startBtn = $('startBtn');
    const errEl = $('startError');
    startBtn.disabled = true;
    startBtn.textContent = 'Loading...';
    errEl.style.display = 'none';

    const ok = await loadQuestions();
    if (!ok) {
      startBtn.disabled = false;
      startBtn.textContent = 'Begin Mission';
      return;
    }

    try {
      await API.post('/api/challenge/start');
    } catch (e) {
      errEl.textContent = e.message || 'Failed to start';
      errEl.style.display = '';
      startBtn.disabled = false;
      startBtn.textContent = 'Begin Mission';
      return;
    }

    state.started = true;
    initProctoring();

    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      /* fullscreen not supported or denied */
    }

    state.timer = new CountdownTimer($('timerWrap'), {
      duration: state.totalTime,
      size: 64,
      stroke: 3,
      onComplete: () => submitChallenge(),
    });
    state.timer.start();

    goToLevel(0);
  }

  /* --- Submit --- */
  async function submitChallenge() {
    if (!state.started) return;
    state.started = false;
    if (state.timer) state.timer.stop();

    try {
      if (document.exitFullscreen && document.fullscreenElement) {
        document.exitFullscreen();
      }
    } catch {
      /* ignore */
    }

    $('submitBtn').disabled = true;
    $('submitBtn').textContent = 'Submitting...';

    const typing = getTypingStats();
    const answersByLevel = {};
    state.levels.forEach(lv => {
      answersByLevel[lv.id] = {};
      lv.questions.forEach(q => {
        if (state.answers[q.id] !== undefined && state.answers[q.id] !== '') {
          answersByLevel[lv.id][q.id] = state.answers[q.id];
        }
      });
    });
    const payload = {
      answers: answersByLevel,
      time_taken: state.timer ? state.timer.getElapsed() : 0,
      tab_switches: state.tabSwitches,
      violation_count: state.violations.length,
      violation_logs: state.violations,
      telemetry: {
        backspace_count: state.backspaceCount,
        typing_speed_avg: typing.avg,
        typing_pattern_variance: typing.variance,
        mouse_moves_count: state.mouseMoves,
        idle_duration: state.idleDuration,
      },
    };

    try {
      const result = await API.post('/api/submit_challenge', payload);
      Toast.success('Submitted!', `Score: ${result.scores?.score_final || 0}`, 6000);
      showComplete();
    } catch (err) {
      Toast.error('Submission failed', err.message || 'Try again');
      $('submitBtn').disabled = false;
      $('submitBtn').textContent = 'Submit Challenge';
      state.started = true;
    }
  }

  /* --- Button bindings --- */
  $('startBtn').addEventListener('click', startChallenge);
  $('nextBtn').addEventListener('click', nextQuestion);
  $('prevBtn').addEventListener('click', prevQuestion);
  $('submitBtn').addEventListener('click', () => {
    if (confirm('Submit your challenge? This cannot be undone.')) submitChallenge();
  });

  /* --- Mobile sidebar toggle --- */
  const sidebarToggle = $('sidebarToggle');
  if (sidebarToggle && window.innerWidth <= 1024) {
    sidebarToggle.style.display = 'flex';
    sidebarToggle.addEventListener('click', () => $('sidebar').classList.toggle('open'));
  }

  /* --- Keyboard shortcut --- */
  document.addEventListener('keydown', e => {
    if (!state.started) return;
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      nextQuestion();
    }
  });
})();
