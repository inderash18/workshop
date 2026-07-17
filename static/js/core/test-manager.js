class TestManager {
  constructor(testId) {
    this.testId = testId;
    this.testData = null;
    this.questions = [];
    this.currentIndex = 0;
    this.answers = {};
    this.timer = null;
    this.security = null;
    this.started = false;
    this.completed = false;
    this.startTime = null;
    this.endTime = null;
    this.telemetry = {
      backspaceCount: 0,
      typingTimes: [],
      mouseMoves: 0,
      focusChanges: 0,
      idlePeriods: 0,
    };
    this._telemetryHandlers = {};
    this._typingTimeout = null;
    this._lastKeystroke = null;
  }

  async loadQuestions() {
    try {
      const data = await API.get(`/api/test/${this.testId}/questions`);
      this.testData = data.test || data;
      this.questions = data.questions || data.test?.questions || [];
      return { test: this.testData, questions: this.questions };
    } catch (err) {
      Toast.error('Error', 'Failed to load test questions');
      throw err;
    }
  }

  async startTest() {
    try {
      const data = await API.post(`/api/test/${this.testId}/start`);
      this.started = true;
      this.startTime = new Date().toISOString();

      if (this.testData && this.testData.duration) {
        this._initTimer(this.testData.duration);
      }

      this._initSecurity();
      this.startTelemetry();

      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      } else if (document.documentElement.webkitRequestFullscreen) {
        await document.documentElement.webkitRequestFullscreen();
      } else if (document.documentElement.mozRequestFullScreen) {
        await document.documentElement.mozRequestFullScreen();
      } else if (document.documentElement.msRequestFullscreen) {
        await document.documentElement.msRequestFullscreen();
      }

      this.renderCurrentQuestion();
      this.updateProgress();

      return data;
    } catch (err) {
      Toast.error('Error', 'Failed to start test');
      throw err;
    }
  }

  async submitTest() {
    if (this.completed) return;
    this.completed = true;
    this.endTime = new Date().toISOString();
    this.stopTelemetry();

    if (this.timer) {
      this.timer.stop();
    }
    if (this.security) {
      this.security.stop();
    }

    const payload = {
      answers: this.answers,
      telemetry: this.getTypingStats(),
      security_data: this.security ? this.security.getData() : {},
      start_time: this.startTime,
      end_time: this.endTime,
    };

    try {
      const data = await API.post(`/api/test/${this.testId}/submit`, payload);
      return data;
    } catch (err) {
      Toast.error('Error', 'Failed to submit test');
      throw err;
    }
  }

  goToQuestion(index) {
    if (index < 0 || index >= this.questions.length) return;
    this.currentIndex = index;
    this.renderCurrentQuestion();
    this.updateProgress();
  }

  nextQuestion() {
    if (this.currentIndex < this.questions.length - 1) {
      this.goToQuestion(this.currentIndex + 1);
    }
  }

  prevQuestion() {
    if (this.currentIndex > 0) {
      this.goToQuestion(this.currentIndex - 1);
    }
  }

  saveAnswer(questionId, value) {
    this.answers[questionId] = value;
  }

  getCurrentQuestion() {
    return this.questions[this.currentIndex] || null;
  }

  getAnswer(questionId) {
    return this.answers[questionId] || '';
  }

  getAnsweredCount() {
    return Object.keys(this.answers).filter(k => {
      const v = this.answers[k];
      return v !== '' && v !== null && v !== undefined;
    }).length;
  }

  renderCurrentQuestion() {
    const container = document.getElementById('question-container');
    if (!container) return;

    const q = this.getCurrentQuestion();
    if (!q) {
      container.innerHTML = '<div class="question-empty">No questions available</div>';
      return;
    }

    const questionNum = this.currentIndex + 1;
    const total = this.questions.length;
    const currentAnswer = this.getAnswer(q.id || q._id);

    let html = `
      <div class="question-card">
        <div class="question-header">
          <span class="question-badge">Question ${questionNum} of ${total}</span>
          ${q.marks ? `<span class="question-marks">${q.marks} mark${q.marks > 1 ? 's' : ''}</span>` : ''}
        </div>
        <div class="question-text">${this._escapeHtml(q.question || q.text || q.title || '')}</div>
    `;

    const type = (q.type || 'mcq').toLowerCase();

    if (type === 'mcq' || type === 'multiple_choice' || type === 'multiple-choice') {
      const options = q.options || [];
      html += '<div class="question-options">';
      options.forEach((opt, i) => {
        const optValue = opt.value || opt.id || opt;
        const optLabel = opt.label || opt.text || opt;
        const selected = currentAnswer === optValue || currentAnswer === String(i);
        html += `
          <label class="option-item ${selected ? 'selected' : ''}" data-index="${i}">
            <input type="radio" name="question_${q.id || q._id}" value="${optValue || i}"
              ${selected ? 'checked' : ''} class="option-radio">
            <span class="option-letter">${String.fromCharCode(65 + i)}</span>
            <span class="option-text">${this._escapeHtml(String(optLabel))}</span>
          </label>
        `;
      });
      html += '</div>';

    } else if (type === 'text' || type === 'short_answer' || type === 'short-answer') {
      html += `
        <div class="question-input-wrapper">
          <input type="text" class="question-text-input" id="answer-input"
            value="${this._escapeHtml(String(currentAnswer))}"
            placeholder="Type your answer here..."
            autocomplete="off" spellcheck="false">
        </div>
      `;

    } else if (type === 'textarea' || type === 'long_answer' || type === 'long-answer') {
      const wordCount = currentAnswer ? String(currentAnswer).trim().split(/\s+/).filter(Boolean).length : 0;
      html += `
        <div class="question-input-wrapper">
          <textarea class="question-textarea" id="answer-input"
            placeholder="Type your answer here..."
            rows="8" spellcheck="true">${this._escapeHtml(String(currentAnswer))}</textarea>
          <div class="textarea-footer">
            <span class="word-count">${wordCount} word${wordCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
      `;
    }

    html += '</div>';
    container.innerHTML = html;

    this._attachQuestionListeners(q);
  }

  _attachQuestionListeners(q) {
    const type = (q.type || 'mcq').toLowerCase();
    const qId = q.id || q._id;

    if (type === 'mcq' || type === 'multiple_choice' || type === 'multiple-choice') {
      const options = document.querySelectorAll('.option-item');
      options.forEach(opt => {
        opt.addEventListener('click', () => {
          const radio = opt.querySelector('.option-radio');
          if (radio) {
            radio.checked = true;
            this.saveAnswer(qId, radio.value);
            options.forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
          }
        });
      });

    } else {
      const input = document.getElementById('answer-input');
      if (input) {
        const saveValue = () => {
          this.saveAnswer(qId, input.value);
          if (input.tagName === 'TEXTAREA') {
            const wordCount = input.value.trim().split(/\s+/).filter(Boolean).length;
            const counter = document.querySelector('.word-count');
            if (counter) counter.textContent = `${wordCount} word${wordCount !== 1 ? 's' : ''}`;
          }
        };

        input.addEventListener('input', () => {
          if (this._typingTimeout) clearTimeout(this._typingTimeout);
          this._typingTimeout = setTimeout(saveValue, 300);
        });

        input.addEventListener('blur', saveValue);

        if (input.tagName === 'TEXTAREA') {
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
              saveValue();
            }
          });
        }

        setTimeout(() => input.focus(), 100);
      }
    }
  }

  updateProgress() {
    const bar = document.getElementById('progress-bar');
    const counter = document.getElementById('progress-counter');
    const answered = this.getAnsweredCount();
    const total = this.questions.length;
    const pct = total > 0 ? (answered / total) * 100 : 0;

    if (bar) {
      bar.style.width = `${pct}%`;
    }
    if (counter) {
      counter.textContent = `${answered}/${total} answered`;
    }

    const dots = document.querySelectorAll('.question-dot');
    dots.forEach((dot, i) => {
      dot.classList.toggle('answered', !!this.answers[this.questions[i]?.id || this.questions[i]?._id]);
      dot.classList.toggle('current', i === this.currentIndex);
    });
  }

  renderQuestionNav() {
    const container = document.getElementById('question-nav');
    if (!container) return;

    let html = '';
    this.questions.forEach((q, i) => {
      const qId = q.id || q._id;
      const answered = !!this.answers[qId];
      const current = i === this.currentIndex;
      html += `<button class="question-dot ${answered ? 'answered' : ''} ${current ? 'current' : ''}"
                data-index="${i}" title="Question ${i + 1}">${i + 1}</button>`;
    });
    container.innerHTML = html;

    container.querySelectorAll('.question-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        this.goToQuestion(parseInt(dot.dataset.index, 10));
        this.renderQuestionNav();
      });
    });
  }

  _initTimer(durationMinutes) {
    const timerContainer = document.getElementById('test-timer');
    if (!timerContainer) return;

    this.timer = new CountdownTimer(timerContainer, {
      duration: durationMinutes * 60,
      onTick: (remaining) => {
        const el = document.getElementById('timer-display');
        if (el) el.textContent = this._formatTime(remaining);
      },
      onComplete: () => {
        Toast.warning('Time\'s Up!', 'Your test is being submitted automatically.');
        this.autoSubmit('timer_expired');
      },
    });
  }

  _initSecurity() {
    const options = this.testData ? {
      fullscreenMandatory: this.testData.fullscreen_mandatory !== false,
      tabSwitchLimit: this.testData.tab_switch_limit || 3,
      copyDetection: this.testData.copy_detection !== false,
      pasteDetection: this.testData.paste_detection !== false,
      rightClickDetection: this.testData.right_click_detection !== false,
      refreshDetection: this.testData.refresh_detection !== false,
      devtoolsDetection: this.testData.devtools_detection !== false,
      multipleTabsDetection: this.testData.multiple_tabs_detection !== false,
      screenResizeAction: this.testData.screen_resize_action || 'warning',
      idleDetection: this.testData.idle_detection !== false,
      idleTimeoutSeconds: this.testData.idle_timeout_seconds || 300,
    } : {};

    this.security = new SecurityMonitor(this.testId, options);

    this.security.onViolation = (violation) => {
      Toast.warning('Security Alert', violation.detail);
    };

    this.security.onAutoSubmit = (reason) => {
      this.autoSubmit(reason);
    };

    this.security.start();
  }

  async autoSubmit(reason) {
    if (this.completed) return;
    Toast.error('Test Submitted', `Your test has been auto-submitted: ${reason.replace(/_/g, ' ')}`);
    try {
      await this.submitTest();
    } catch (e) { /* already handled */ }
    this._showCompletionScreen(reason);
  }

  _showCompletionScreen(reason) {
    const main = document.getElementById('test-main') || document.getElementById('test-session');
    if (!main) return;

    main.innerHTML = `
      <div class="completion-screen">
        <div class="completion-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2">
            <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
            <path d="M12 8v4M12 16h.01"/>
          </svg>
        </div>
        <h2>Test Auto-Submitted</h2>
        <p class="completion-reason">${reason.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</p>
        <p class="completion-msg">Your responses have been saved. You will be redirected shortly.</p>
        <a href="/dashboard" class="btn btn-primary">Return to Dashboard</a>
      </div>
    `;
  }

  startTelemetry() {
    this._telemetryHandlers.keydown = (e) => {
      if (e.key === 'Backspace') {
        this.telemetry.backspaceCount++;
      }
    };

    this._telemetryHandlers.keypress = () => {
      const now = Date.now();
      if (this._lastKeystroke) {
        this.telemetry.typingTimes.push(now - this._lastKeystroke);
      }
      this._lastKeystroke = now;
    };

    this._telemetryHandlers.mousemove = (() => {
      let count = 0;
      return () => {
        count++;
        if (count % 10 === 0) {
          this.telemetry.mouseMoves++;
        }
      };
    })();

    this._telemetryHandlers.focus = () => {
      this.telemetry.focusChanges++;
    };

    document.addEventListener('keydown', this._telemetryHandlers.keydown);
    document.addEventListener('keypress', this._telemetryHandlers.keypress);
    document.addEventListener('mousemove', this._telemetryHandlers.mousemove);
    window.addEventListener('focus', this._telemetryHandlers.focus);
    window.addEventListener('blur', this._telemetryHandlers.focus);
  }

  stopTelemetry() {
    if (this._telemetryHandlers.keydown) {
      document.removeEventListener('keydown', this._telemetryHandlers.keydown);
    }
    if (this._telemetryHandlers.keypress) {
      document.removeEventListener('keypress', this._telemetryHandlers.keypress);
    }
    if (this._telemetryHandlers.mousemove) {
      document.removeEventListener('mousemove', this._telemetryHandlers.mousemove);
    }
    if (this._telemetryHandlers.focus) {
      window.removeEventListener('focus', this._telemetryHandlers.focus);
      window.removeEventListener('blur', this._telemetryHandlers.focus);
    }
  }

  getTypingStats() {
    const times = this.telemetry.typingTimes;
    let cpm = 0;
    let avgInterval = 0;
    let variance = 0;
    let consistency = 0;

    if (times.length > 1) {
      avgInterval = times.reduce((a, b) => a + b, 0) / times.length;
      cpm = avgInterval > 0 ? Math.round(60000 / avgInterval) : 0;

      const mean = avgInterval;
      variance = times.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / times.length;
      const stdDev = Math.sqrt(variance);
      consistency = mean > 0 ? Math.max(0, 100 - (stdDev / mean) * 100) : 0;
    }

    return {
      backspace_count: this.telemetry.backspaceCount,
      total_keystrokes: this.telemetry.typingTimes.length + this.telemetry.backspaceCount,
      cpm,
      avg_interval: Math.round(avgInterval),
      typing_variance: Math.round(variance),
      consistency: Math.round(consistency),
      mouse_moves: this.telemetry.mouseMoves,
      focus_changes: this.telemetry.focusChanges,
    };
  }

  _formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
