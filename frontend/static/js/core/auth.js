const Auth = {
  _session: null,
  _fetching: null,

  async getSession() {
    if (this._session) return this._session;
    if (this._fetching) return this._fetching;

    this._fetching = (async () => {
      try {
        const data = await API.get('/api/session');
        this._session = data;
        return data;
      } catch (err) {
        this._session = { logged_in: false };
        return this._session;
      } finally {
        this._fetching = null;
      }
    })();

    return this._fetching;
  },

  isLoggedIn() {
    return !!(this._session && this._session.logged_in);
  },

  getCandidate() {
    if (!this._session || !this._session.logged_in) return null;
    return this._session.candidate || this._session.user || null;
  },

  isAdmin() {
    if (!this._session || !this._session.logged_in) return false;
    const user = this._session.candidate || this._session.user || {};
    return user.role === 'admin' || user.is_admin === true;
  },

  async logout() {
    try {
      await API.post('/api/logout');
    } catch (e) { /* ignore */ }
    this._session = null;
    window.location.href = '/login';
  },

  updateNav() {
    const guestNav = document.querySelectorAll('.nav-guest');
    const userNav = document.querySelectorAll('.nav-user');
    const adminNav = document.querySelectorAll('.nav-admin');
    const loggedIn = this.isLoggedIn();
    const admin = this.isAdmin();

    if (admin) {
      guestNav.forEach(el => { el.style.display = 'none'; });
      userNav.forEach(el => { el.style.display = 'none'; });
      adminNav.forEach(el => { el.style.display = ''; });
    } else if (loggedIn) {
      guestNav.forEach(el => { el.style.display = 'none'; });
      userNav.forEach(el => { el.style.display = ''; });
      adminNav.forEach(el => { el.style.display = 'none'; });
    } else {
      guestNav.forEach(el => { el.style.display = ''; });
      userNav.forEach(el => { el.style.display = 'none'; });
      adminNav.forEach(el => { el.style.display = 'none'; });
    }

    const userEl = document.querySelector('.nav-username');
    if (userEl && loggedIn) {
      const user = this.getCandidate();
      userEl.textContent = user ? (user.name || user.email || 'User') : 'User';
    }
  },

  updateAdminNav() {
    const adminItems = document.querySelectorAll('.nav-admin-only');
    adminItems.forEach(el => {
      el.style.display = this.isAdmin() ? '' : 'none';
    });
  },

  async requireAuth() {
    const session = await this.getSession();
    if (!session.logged_in) {
      window.location.href = '/login';
      return false;
    }
    return true;
  },

  async requireAdmin() {
    const session = await this.getSession();
    if (!session.logged_in) {
      window.location.href = '/login';
      return false;
    }
    const user = session.candidate || session.user || {};
    if (user.role !== 'admin' && !user.is_admin) {
      window.location.href = '/dashboard';
      return false;
    }
    return true;
  },

  reset() {
    this._session = null;
  },
};
