class CountdownTimer {
  constructor(container, opts = {}) {
    this.container = container;
    this.duration = opts.duration || 300;
    this.remaining = this.duration;
    this.onTick = opts.onTick || null;
    this.onComplete = opts.onComplete || null;
    this.size = opts.size || 120;
    this.stroke = opts.stroke || 6;
    this.running = false;
    this.paused = false;
    this._interval = null;
    this._lastTick = 0;
    this._render();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.paused = false;
    this._lastTick = Date.now();
    this._interval = setInterval(() => this._tick(), 250);
    this._updateDisplay();
    this._updateRing();
  }

  pause() {
    if (!this.running || this.paused) return;
    this.paused = true;
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  resume() {
    if (!this.running || !this.paused) return;
    this.paused = false;
    this._lastTick = Date.now();
    this._interval = setInterval(() => this._tick(), 250);
  }

  stop() {
    this.running = false;
    this.paused = false;
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  reset(newDuration) {
    this.stop();
    if (newDuration !== undefined) this.duration = newDuration;
    this.remaining = this.duration;
    this._updateDisplay();
    this._updateRing();
  }

  getRemaining() {
    return this.remaining;
  }

  getElapsed() {
    return this.duration - this.remaining;
  }

  _tick() {
    if (!this.running || this.paused) return;

    const now = Date.now();
    const elapsed = Math.floor((now - this._lastTick) / 1000);

    if (elapsed >= 1) {
      this.remaining = Math.max(0, this.remaining - elapsed);
      this._lastTick = now;
      this._updateDisplay();
      this._updateRing();

      if (this.onTick) {
        this.onTick(this.remaining);
      }

      if (this.remaining <= 0) {
        this.stop();
        if (this.onComplete) {
          this.onComplete();
        }
      }
    }
  }

  _render() {
    const r = (this.size - this.stroke) / 2;
    const circumference = 2 * Math.PI * r;

    this.container.innerHTML = `
      <div class="countdown-timer" style="
        width: ${this.size}px; height: ${this.size}px;
        position: relative; display: inline-flex;
        align-items: center; justify-content: center;
      ">
        <svg class="timer-ring" width="${this.size}" height="${this.size}"
          style="position: absolute; top: 0; left: 0; transform: rotate(-90deg);">
          <circle class="timer-ring-bg"
            cx="${this.size / 2}" cy="${this.size / 2}" r="${r}"
            fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="${this.stroke}" />
          <circle class="timer-ring-progress"
            cx="${this.size / 2}" cy="${this.size / 2}" r="${r}"
            fill="none" stroke="#10b981" stroke-width="${this.stroke}"
            stroke-linecap="round"
            stroke-dasharray="${circumference}"
            stroke-dashoffset="0"
            style="transition: stroke-dashoffset 0.4s ease, stroke 0.5s ease;" />
        </svg>
        <div class="timer-display" style="
          position: relative; z-index: 1;
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          font-size: ${this.size * 0.22}px;
          font-weight: 700; color: #10b981;
          letter-spacing: 2px;
          text-align: center;
          line-height: 1;
        ">
          ${this._formatTime(this.remaining)}
        </div>
      </div>
    `;

    this._ringProgress = this.container.querySelector('.timer-ring-progress');
    this._display = this.container.querySelector('.timer-display');
    this._circumference = circumference;
  }

  _updateDisplay() {
    if (!this._display) return;
    const time = this._formatTime(this.remaining);
    this._display.textContent = time;

    let color = '#10b981';
    if (this.remaining <= 60) {
      color = '#ef4444';
    } else if (this.remaining <= 300) {
      color = '#f59e0b';
    }
    this._display.style.color = color;

    if (this.remaining <= 60 && this.running && !this.paused) {
      this._display.style.animation = 'timerPulse 1s ease-in-out infinite';
    } else {
      this._display.style.animation = 'none';
    }
  }

  _updateRing() {
    if (!this._ringProgress || !this._circumference) return;
    const progress = this.duration > 0 ? this.remaining / this.duration : 0;
    const offset = this._circumference * (1 - progress);
    this._ringProgress.style.strokeDashoffset = offset;

    let color = '#10b981';
    if (this.remaining <= 60) {
      color = '#ef4444';
    } else if (this.remaining <= 300) {
      color = '#f59e0b';
    }
    this._ringProgress.style.stroke = color;
  }

  _formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
}
