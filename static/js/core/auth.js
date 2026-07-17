/* ============================================
   AUTH — Session management
   ============================================ */

const Auth = {
  _session: null,

  async getSession() {
    if (this._session) return this._session;
    try {
      const res = await API.get('/api/session');
      this._session = res;
      return res;
    } catch {
      this._session = { logged_in: false };
      return this._session;
    }
  },

  isLoggedIn() {
    return this._session && this._session.logged_in;
  },

  getCandidate() {
    return this._session && this._session.candidate;
  },

  async logout() {
    try {
      await API.post('/api/logout');
    } catch {
      /* ignore */
    }
    this._session = null;
    window.location.href = '/login';
  },

  updateNav() {
    this.getSession().then(session => {
      const guestEl = document.getElementById('navGuest');
      const userEl = document.getElementById('navUser');
      const challengeEl = document.getElementById('navChallenge');
      const nameEl = document.getElementById('navUserName');

      if (!guestEl || !userEl) return;

      if (session.logged_in) {
        guestEl.style.display = 'none';
        userEl.style.display = 'flex';
        userEl.style.gap = 'var(--space-3)';
        if (nameEl) {
          nameEl.textContent = session.candidate ? session.candidate.name.split(' ')[0] : 'Profile';
        }
        if (challengeEl && !session.candidate?.completed) {
          challengeEl.style.display = '';
        }
      } else {
        guestEl.style.display = 'flex';
        guestEl.style.gap = 'var(--space-3)';
        userEl.style.display = 'none';
        if (challengeEl) challengeEl.style.display = 'none';
      }
    });
  },
};
