class SecurityMonitor {
  constructor(testId, options = {}) {
    this.testId = testId;
    this.options = {
      fullscreenMandatory: true,
      tabSwitchLimit: 3,
      copyDetection: true,
      pasteDetection: true,
      rightClickDetection: true,
      refreshDetection: true,
      devtoolsDetection: true,
      multipleTabsDetection: true,
      screenResizeAction: 'warning',
      idleDetection: true,
      idleTimeoutSeconds: 300,
      ...options,
    };

    this.tabSwitchCount = 0;
    this.violations = [];
    this.lastActivity = Date.now();
    this.isRunning = false;
    this.isPaused = false;
    this.isAutoSubmitted = false;

    this.onViolation = null;
    this.onAutoSubmit = null;
    this.onResume = null;
    this.onPause = null;

    this._handlers = {};
    this._idleInterval = null;
    this._devtoolsInterval = null;
    this._multipleTabsChannel = null;
    this._resizeTimeout = null;
    this._onlineCheckTimeout = null;
    this._lastScreenWidth = window.screen.width;
    this._lastScreenHeight = window.screen.height;
    this._lastInnerWidth = window.innerWidth;
    this._lastInnerHeight = window.innerHeight;
    this._devtoolsOpen = false;
    this._pauseStartTime = null;
    this._totalPauseTime = 0;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isPaused = false;
    this._totalPauseTime = 0;
    this._attachListeners();
    this._startIdleCheck();
    this._startDevToolsDetection();
    this._startMultipleTabDetection();
    this._reportEvent('monitor_started', { options: this.options });
    this._updateUI();
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    this._detachListeners();
    this._stopIdleCheck();
    this._stopDevToolsDetection();
    this._stopMultipleTabDetection();
    if (this._resizeTimeout) {
      clearTimeout(this._resizeTimeout);
      this._resizeTimeout = null;
    }
    if (this._onlineCheckTimeout) {
      clearTimeout(this._onlineCheckTimeout);
      this._onlineCheckTimeout = null;
    }
  }

  pause() {
    if (!this.isRunning || this.isPaused) return;
    this.isPaused = true;
    this._pauseStartTime = Date.now();
    this._detachListeners();
    this._stopIdleCheck();
    this._stopDevToolsDetection();
    if (this.onPause) this.onPause();
  }

  resume() {
    if (!this.isRunning || !this.isPaused) return;
    this.isPaused = false;
    if (this._pauseStartTime) {
      this._totalPauseTime += Date.now() - this._pauseStartTime;
      this._pauseStartTime = null;
    }
    this._attachListeners();
    this._startIdleCheck();
    this._startDevToolsDetection();
    this.lastActivity = Date.now();
    this._updateUI();
    if (this.onResume) this.onResume();
  }

  addViolation(type, detail) {
    const violation = {
      type,
      detail: detail || '',
      timestamp: Date.now(),
      time: new Date().toISOString(),
    };
    this.violations.push(violation);
    this._reportEvent('violation', violation);
    this._updateUI();
    if (this.onViolation) {
      this.onViolation(violation);
    }
    return violation;
  }

  getViolationCount() {
    return this.violations.length;
  }

  getTabSwitchCount() {
    return this.tabSwitchCount;
  }

  getData() {
    return {
      test_id: this.testId,
      violations: this.violations,
      tab_switch_count: this.tabSwitchCount,
      total_pause_time: this._totalPauseTime + (this._pauseStartTime ? Date.now() - this._pauseStartTime : 0),
    };
  }

  _attachListeners() {
    this._handlers.fullscreenChange = this._handleFullscreenChange.bind(this);
    this._handlers.visibilityChange = this._handleVisibilityChange.bind(this);
    this._handlers.contextMenu = this._handleContextMenu.bind(this);
    this._handlers.copy = this._handleCopy.bind(this);
    this._handlers.paste = this._handlePaste.bind(this);
    this._handlers.keyDown = this._handleKeyDown.bind(this);
    this._handlers.beforeUnload = this._handleBeforeUnload.bind(this);
    this._handlers.online = this._handleOnline.bind(this);
    this._handlers.offline = this._handleOffline.bind(this);
    this._handlers.resize = this._handleResize.bind(this);
    this._handlers.mouseMove = this._handleActivity.bind(this);
    this._handlers.keyPress = this._handleActivity.bind(this);
    this._handlers.click = this._handleActivity.bind(this);
    this._handlers.scroll = this._handleActivity.bind(this);

    document.addEventListener('fullscreenchange', this._handlers.fullscreenChange);
    document.addEventListener('visibilitychange', this._handlers.visibilityChange);
    document.addEventListener('contextmenu', this._handlers.contextMenu);
    document.addEventListener('copy', this._handlers.copy);
    document.addEventListener('paste', this._handlers.paste);
    document.addEventListener('keydown', this._handlers.keyDown);
    window.addEventListener('beforeunload', this._handlers.beforeUnload);
    window.addEventListener('online', this._handlers.online);
    window.addEventListener('offline', this._handlers.offline);
    window.addEventListener('resize', this._handlers.resize);
    document.addEventListener('mousemove', this._handlers.mouseMove);
    document.addEventListener('keypress', this._handlers.keyPress);
    document.addEventListener('click', this._handlers.click);
    document.addEventListener('scroll', this._handlers.scroll);
  }

  _detachListeners() {
    document.removeEventListener('fullscreenchange', this._handlers.fullscreenChange);
    document.removeEventListener('visibilitychange', this._handlers.visibilityChange);
    document.removeEventListener('contextmenu', this._handlers.contextMenu);
    document.removeEventListener('copy', this._handlers.copy);
    document.removeEventListener('paste', this._handlers.paste);
    document.removeEventListener('keydown', this._handlers.keyDown);
    window.removeEventListener('beforeunload', this._handlers.beforeUnload);
    window.removeEventListener('online', this._handlers.online);
    window.removeEventListener('offline', this._handlers.offline);
    window.removeEventListener('resize', this._handlers.resize);
    document.removeEventListener('mousemove', this._handlers.mouseMove);
    document.removeEventListener('keypress', this._handlers.keyPress);
    document.removeEventListener('click', this._handlers.click);
    document.removeEventListener('scroll', this._handlers.scroll);
  }

  _handleFullscreenChange() {
    if (!this.options.fullscreenMandatory) return;
    const isFullscreen = !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    );

    if (!isFullscreen && this.isRunning && !this.isAutoSubmitted) {
      this.addViolation('fullscreen_exit', 'Candidate exited fullscreen mode');
      this._triggerAutoSubmit('fullscreen_exit');
    }
  }

  _handleVisibilityChange() {
    if (document.hidden && this.isRunning && !this.isAutoSubmitted) {
      this.tabSwitchCount++;
      this.addViolation('tab_switch', `Tab switch #${this.tabSwitchCount}`);

      if (this.tabSwitchCount > this.options.tabSwitchLimit) {
        this._triggerAutoSubmit('tab_switch_limit_exceeded');
      }
    }
  }

  _handleContextMenu(e) {
    if (!this.options.rightClickDetection || !this.isRunning) return;
    e.preventDefault();
    e.stopPropagation();
    this.addViolation('right_click', 'Right-click attempted');
    return false;
  }

  _handleCopy(e) {
    if (!this.options.copyDetection || !this.isRunning) return;
    e.preventDefault();
    e.stopPropagation();
    this.addViolation('copy', 'Copy action attempted');
    this._triggerAutoSubmit('copy_detected');
    return false;
  }

  _handlePaste(e) {
    if (!this.options.pasteDetection || !this.isRunning) return;
    e.preventDefault();
    e.stopPropagation();
    this.addViolation('paste', 'Paste action attempted');
    this._triggerAutoSubmit('paste_detected');
    return false;
  }

  _handleKeyDown(e) {
    if (!this.isRunning || this.isAutoSubmitted) return;

    const isCtrl = e.ctrlKey || e.metaKey;

    if (this.options.copyDetection && isCtrl && e.key === 'c') {
      e.preventDefault();
      this.addViolation('copy', 'Ctrl+C blocked');
      this._triggerAutoSubmit('copy_detected');
      return false;
    }

    if (this.options.pasteDetection && isCtrl && e.key === 'v') {
      e.preventDefault();
      this.addViolation('paste', 'Ctrl+V blocked');
      this._triggerAutoSubmit('paste_detected');
      return false;
    }

    if (isCtrl && e.key === 'x') {
      e.preventDefault();
      this.addViolation('cut', 'Ctrl+X blocked');
      this._triggerAutoSubmit('cut_detected');
      return false;
    }

    if (isCtrl && e.key === 'a' && !e.target.closest('textarea, input[type="text"]')) {
      e.preventDefault();
      return false;
    }

    if (isCtrl && e.key === 'u') {
      e.preventDefault();
      this.addViolation('view_source', 'Ctrl+U blocked');
      return false;
    }

    if (e.key === 'F12') {
      e.preventDefault();
      this.addViolation('devtools', 'F12 key blocked');
      return false;
    }

    if (isCtrl && e.shiftKey && (e.key === 'I' || e.key === 'i')) {
      e.preventDefault();
      this.addViolation('devtools', 'Ctrl+Shift+I blocked');
      return false;
    }

    if (isCtrl && e.shiftKey && (e.key === 'J' || e.key === 'j')) {
      e.preventDefault();
      this.addViolation('devtools', 'Ctrl+Shift+J blocked');
      return false;
    }

    if (isCtrl && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
      e.preventDefault();
      this.addViolation('devtools', 'Ctrl+Shift+C blocked');
      return false;
    }

    if (isCtrl && e.key === 'p') {
      e.preventDefault();
      this.addViolation('print', 'Ctrl+P blocked');
      return false;
    }

    if (isCtrl && e.key === 's') {
      e.preventDefault();
      return false;
    }

    if (e.key === 'PrintScreen') {
      e.preventDefault();
      this.addViolation('screenshot', 'PrintScreen blocked');
      this._triggerAutoSubmit('screenshot_detected');
      return false;
    }

    if (e.altKey && e.key === 'PrintScreen') {
      e.preventDefault();
      this.addViolation('screenshot', 'Alt+PrintScreen blocked');
      return false;
    }
  }

  _handleBeforeUnload(e) {
    if (!this.isRunning || this.isAutoSubmitted) return;
    this._triggerAutoSubmit('window_close');
    e.preventDefault();
    e.returnValue = '';
    return '';
  }

  _handleOnline() {
    if (this.isPaused && this._pauseStartTime) {
      this.resume();
      if (this.onViolation) {
        this.onViolation({ type: 'network_restored', detail: 'Internet connection restored', timestamp: Date.now() });
      }
    }
  }

  _handleOffline() {
    if (!this.isRunning || this.isAutoSubmitted) return;
    this.addViolation('network_disconnect', 'Internet connection lost');
    if (this.onViolation) {
      this.onViolation({ type: 'network_disconnect', detail: 'Internet connection lost — test paused', timestamp: Date.now() });
    }
    this.pause();
    this._scheduleOnlineCheck();
  }

  _scheduleOnlineCheck() {
    if (this._onlineCheckTimeout) clearTimeout(this._onlineCheckTimeout);
    this._onlineCheckTimeout = setTimeout(() => {
      if (!navigator.onLine) {
        this.addViolation('network_timeout', 'Network timeout — no connectivity for 30s');
        this._triggerAutoSubmit('network_timeout');
      } else {
        this.resume();
      }
    }, 30000);
  }

  _handleResize() {
    if (!this.isRunning || this.isAutoSubmitted) return;

    if (this._resizeTimeout) clearTimeout(this._resizeTimeout);

    this._resizeTimeout = setTimeout(() => {
      const widthChanged = Math.abs(window.innerWidth - this._lastInnerWidth) > 50;
      const heightChanged = Math.abs(window.innerHeight - this._lastInnerHeight) > 50;

      if (widthChanged || heightChanged) {
        this._lastInnerWidth = window.innerWidth;
        this._lastInnerHeight = window.innerHeight;
        this.addViolation('screen_resize', `Window resized to ${window.innerWidth}x${window.innerHeight}`);

        if (this.options.screenResizeAction === 'autosubmit') {
          this._triggerAutoSubmit('screen_resize');
        }
      }
    }, 500);
  }

  _handleActivity() {
    this.lastActivity = Date.now();
  }

  _startIdleCheck() {
    this._stopIdleCheck();
    if (!this.options.idleDetection) return;

    this._idleInterval = setInterval(() => {
      if (this.isPaused || this.isAutoSubmitted) return;
      const elapsed = (Date.now() - this.lastActivity) / 1000;
      if (elapsed >= this.options.idleTimeoutSeconds) {
        this.addViolation('idle_timeout', `Idle for ${Math.round(elapsed)}s (limit: ${this.options.idleTimeoutSeconds}s)`);
        this._triggerAutoSubmit('idle_timeout');
      }
    }, 10000);
  }

  _stopIdleCheck() {
    if (this._idleInterval) {
      clearInterval(this._idleInterval);
      this._idleInterval = null;
    }
  }

  _startDevToolsDetection() {
    this._stopDevToolsDetection();
    if (!this.options.devtoolsDetection) return;

    const threshold = 160;
    this._devtoolsInterval = setInterval(() => {
      if (this.isPaused || this.isAutoSubmitted) return;

      const widthThreshold = window.outerWidth - window.innerWidth > threshold;
      const heightThreshold = window.outerHeight - window.innerHeight > threshold;

      if (widthThreshold || heightThreshold) {
        if (!this._devtoolsOpen) {
          this._devtoolsOpen = true;
          this.addViolation('devtools', 'Developer tools detected (window size)');
          this._triggerAutoSubmit('devtools_detected');
        }
      } else {
        this._devtoolsOpen = false;
      }

      try {
        const element = new Image();
        Object.defineProperty(element, 'id', {
          get: function () {
            throw new Error('DevTools detected');
          },
        });
        console.log('%c', element);
      } catch (err) {
        if (err.message === 'DevTools detected' && !this._devtoolsOpen) {
          this._devtoolsOpen = true;
          this.addViolation('devtools', 'Developer tools detected (console profiling)');
          this._triggerAutoSubmit('devtools_detected');
        }
      }
    }, 3000);
  }

  _stopDevToolsDetection() {
    if (this._devtoolsInterval) {
      clearInterval(this._devtoolsInterval);
      this._devtoolsInterval = null;
    }
  }

  _startMultipleTabDetection() {
    if (!this.options.multipleTabsDetection) return;

    try {
      this._multipleTabsChannel = new BroadcastChannel('test_security');
      this._multipleTabsChannel.onmessage = (e) => {
        if (e.data === 'tab_opened' && this.isRunning && !this.isAutoSubmitted) {
          this.addViolation('multiple_tabs', 'Another test tab detected');
          this._triggerAutoSubmit('multiple_tabs_detected');
        }
      };
      this._multipleTabsChannel.postMessage('tab_opened');
    } catch (err) {
      window.addEventListener('storage', this._handleStorageEvent.bind(this));
    }

    this._handlers.windowFocus = this._handleWindowFocus.bind(this);
    this._handlers.windowBlur = this._handleWindowBlur.bind(this);
    window.addEventListener('focus', this._handlers.windowFocus);
    window.addEventListener('blur', this._handlers.windowBlur);
  }

  _stopMultipleTabDetection() {
    if (this._multipleTabsChannel) {
      this._multipleTabsChannel.close();
      this._multipleTabsChannel = null;
    }
    if (this._handlers.windowFocus) {
      window.removeEventListener('focus', this._handlers.windowFocus);
    }
    if (this._handlers.windowBlur) {
      window.removeEventListener('blur', this._handlers.windowBlur);
    }
  }

  _handleStorageEvent(e) {
    if (e.key === 'test_tab_signal' && this.isRunning && !this.isAutoSubmitted) {
      this.addViolation('multiple_tabs', 'Another test tab detected via storage');
      this._triggerAutoSubmit('multiple_tabs_detected');
    }
  }

  _handleWindowFocus() {
    if (this.isRunning && !this.isAutoSubmitted) {
      try {
        localStorage.setItem('test_tab_signal', Date.now().toString());
        setTimeout(() => localStorage.removeItem('test_tab_signal'), 2000);
      } catch (e) { /* ignore */ }
    }
  }

  _handleWindowBlur() {
    if (this.isRunning && !this.isAutoSubmitted && this.options.multipleTabsDetection) {
      setTimeout(() => {
        if (document.hidden && this.isRunning && !this.isAutoSubmitted) {
          this.tabSwitchCount++;
          this.addViolation('tab_switch', `Tab switch #${this.tabSwitchCount} (blur+hidden)`);
          if (this.tabSwitchCount > this.options.tabSwitchLimit) {
            this._triggerAutoSubmit('tab_switch_limit_exceeded');
          }
        }
      }, 200);
    }
  }

  async _reportEvent(type, detail) {
    try {
      await API.post(`/api/test/${this.testId}/security-event`, {
        event_type: type,
        detail: detail,
        timestamp: Date.now(),
        url: window.location.href,
        screen: { w: window.screen.width, h: window.screen.height },
      });
    } catch (err) {
      // Silently fail — don't block the test for reporting errors
    }
  }

  _triggerAutoSubmit(reason) {
    if (this.isAutoSubmitted) return;
    this.isAutoSubmitted = true;
    this.stop();
    this._reportEvent('auto_submit', { reason });

    if (this.onAutoSubmit) {
      this.onAutoSubmit(reason);
    }
  }

  _updateUI() {
    const indicator = document.getElementById('security-indicator');
    const counter = document.getElementById('violation-count');
    const switches = document.getElementById('tab-switches');

    if (indicator) {
      indicator.className = `security-indicator ${this.isRunning ? (this.violations.length > 0 ? 'warning' : 'active') : 'inactive'}`;
    }
    if (counter) {
      counter.textContent = this.violations.length;
    }
    if (switches) {
      switches.textContent = `${this.tabSwitchCount}/${this.options.tabSwitchLimit}`;
    }
  }
}
