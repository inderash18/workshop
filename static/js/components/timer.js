/* ============================================
   TIMER — Countdown timer with visual ring
   ============================================ */

class CountdownTimer {
  constructor(container, opts = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.duration = opts.duration || 1800;
    this.onTick = opts.onTick || null;
    this.onComplete = opts.onComplete || null;
    this.size = opts.size || 80;
    this.stroke = opts.stroke || 4;
    this._remaining = this.duration;
    this._interval = null;
    this._startTime = null;
    this._paused = false;
    this._render();
  }

  start() {
    if (this._interval) return;
    this._startTime = Date.now();
    this._paused = false;
    this._interval = setInterval(() => this._tick(), 250);
    this._tick();
  }

  pause() {
    this._paused = true;
    if (this._interval) clearInterval(this._interval);
    this._interval = null;
  }

  resume() {
    if (!this._paused) return;
    this._paused = false;
    this._startTime = Date.now() - (this.duration - this._remaining) * 1000;
    this._interval = setInterval(() => this._tick(), 250);
  }

  stop() {
    if (this._interval) clearInterval(this._interval);
    this._interval = null;
  }

  reset(newDuration) {
    this.stop();
    this.duration = newDuration || this.duration;
    this._remaining = this.duration;
    this._paused = false;
    this._updateDisplay();
    this._updateRing();
  }

  getRemaining() {
    return this._remaining;
  }

  getElapsed() {
    return this.duration - this._remaining;
  }

  _tick() {
    if (this._paused) return;
    const elapsed = Math.floor((Date.now() - this._startTime) / 1000);
    this._remaining = Math.max(0, this.duration - elapsed);
    this._updateDisplay();
    this._updateRing();

    if (this.onTick) this.onTick(this._remaining, this.duration);

    if (this._remaining <= 0) {
      this.stop();
      if (this.onComplete) this.onComplete();
    }
  }

  _render() {
    if (!this.container) return;
    const r = (this.size - this.stroke) / 2;
    const c = 2 * Math.PI * r;
    this._circumference = c;

    this.container.innerHTML = `
      <svg width="${this.size}" height="${this.size}" style="transform:rotate(-90deg)">
        <circle class="timer-ring-bg" cx="${this.size/2}" cy="${this.size/2}" r="${r}"
          fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="${this.stroke}"/>
        <circle class="timer-ring-fill" cx="${this.size/2}" cy="${this.size/2}" r="${r}"
          fill="none" stroke="var(--accent)" stroke-width="${this.stroke}"
          stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="0"
          style="transition: stroke-dashoffset 0.3s ease, stroke 0.3s ease;"/>
      </svg>
      <div class="timer-display" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">
        <span class="timer-time" style="font-family:var(--font-mono);font-size:${this.size * 0.22}px;font-weight:600;color:var(--text-primary);">--:--</span>
        <span class="timer-label" style="font-size:${this.size * 0.11}px;color:var(--text-tertiary);margin-top:2px;">remaining</span>
      </div>
    `;
    this._updateDisplay();
  }

  _updateDisplay() {
    if (!this.container) return;
    const mins = Math.floor(this._remaining / 60);
    const secs = this._remaining % 60;
    const timeEl = this.container.querySelector('.timer-time');
    if (timeEl) {
      timeEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      if (this._remaining <= 60) {
        timeEl.style.color = 'var(--red)';
      } else if (this._remaining <= 300) {
        timeEl.style.color = 'var(--yellow)';
      } else {
        timeEl.style.color = 'var(--text-primary)';
      }
    }
  }

  _updateRing() {
    if (!this.container) return;
    const fill = this.container.querySelector('.timer-ring-fill');
    if (fill && this._circumference) {
      const progress = 1 - (this._remaining / this.duration);
      fill.setAttribute('stroke-dashoffset', this._circumference * progress);
      if (this._remaining <= 60) {
        fill.setAttribute('stroke', '#ef4444');
      } else if (this._remaining <= 300) {
        fill.setAttribute('stroke', '#eab308');
      } else {
        fill.setAttribute('stroke', 'var(--accent)');
      }
    }
  }
}
