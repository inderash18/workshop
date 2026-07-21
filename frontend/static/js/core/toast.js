const Toast = {
  _container: null,

  _getContainer() {
    if (!this._container) {
      this._container = document.createElement('div');
      this._container.id = 'toast-container';
      this._container.className = 'toast-container';
      document.body.appendChild(this._container);
    }
    return this._container;
  },

  _getIcon(type) {
    const icons = {
      success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      warning: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    };
    return icons[type] || icons.info;
  },

  _getTypeColor(type) {
    const colors = {
      success: '#10b981',
      error: '#ef4444',
      warning: '#f59e0b',
      info: '#3b82f6',
    };
    return colors[type] || colors.info;
  },

  show(title, message, type = 'info', duration = 5000) {
    const container = this._getContainer();
    const color = this._getTypeColor(type);
    const icon = this._getIcon(type);

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
      position: relative;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 16px 20px;
      min-width: 320px;
      max-width: 420px;
      background: rgba(15, 15, 25, 0.85);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-left: 3px solid ${color};
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05);
      color: #e2e8f0;
      font-family: 'Inter', sans-serif;
      transform: translateX(120%);
      opacity: 0;
      transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      z-index: 10000;
      margin-bottom: 8px;
    `;

    toast.innerHTML = `
      <div class="toast-icon" style="color: ${color}; flex-shrink: 0; margin-top: 1px;">
        ${icon}
      </div>
      <div style="flex: 1; min-width: 0;">
        <div style="font-weight: 600; font-size: 14px; margin-bottom: 2px; color: #f8fafc;">${title}</div>
        <div style="font-size: 13px; color: #94a3b8; line-height: 1.5;">${message}</div>
      </div>
      <button class="toast-close" style="
        position: absolute; top: 8px; right: 8px;
        background: none; border: none; color: #64748b; cursor: pointer;
        padding: 4px; border-radius: 4px; line-height: 1;
        transition: color 0.2s;
      ">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
      <div class="toast-progress" style="
        position: absolute; bottom: 0; left: 0; height: 2px;
        background: ${color}; border-radius: 0 0 12px 12px;
        width: 100%; transform-origin: left;
        transition: transform ${duration}ms linear;
      "></div>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.transform = 'translateX(0)';
      toast.style.opacity = '1';
    });

    const progress = toast.querySelector('.toast-progress');
    if (progress) {
      requestAnimationFrame(() => {
        progress.style.transform = 'scaleX(0)';
      });
    }

    const closeBtn = toast.querySelector('.toast-close');
    const remove = () => {
      toast.style.transform = 'translateX(120%)';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 400);
    };

    closeBtn.addEventListener('click', remove);
    closeBtn.addEventListener('mouseenter', () => { closeBtn.style.color = '#e2e8f0'; });
    closeBtn.addEventListener('mouseleave', () => { closeBtn.style.color = '#64748b'; });

    if (duration > 0) {
      setTimeout(remove, duration);
    }

    toast.addEventListener('mouseenter', () => {
      if (progress) progress.style.transition = 'none';
    });
    toast.addEventListener('mouseleave', () => {
      if (progress) {
        progress.style.transition = `transform ${duration}ms linear`;
      }
    });

    return toast;
  },

  success(title, message, duration) {
    return this.show(title, message, 'success', duration);
  },

  error(title, message, duration) {
    return this.show(title, message, 'error', duration || 7000);
  },

  warning(title, message, duration) {
    return this.show(title, message, 'warning', duration || 6000);
  },

  info(title, message, duration) {
    return this.show(title, message, 'info', duration);
  },

  clear() {
    if (this._container) {
      this._container.innerHTML = '';
    }
  },
};
