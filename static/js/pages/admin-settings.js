(function () {
  const $ = (id) => document.getElementById(id);

  let settings = {};

  async function init() {
    const ok = await Auth.requireAdmin();
    if (!ok) return;
    Auth.updateNav();

    initLogout();
    await loadSettings();
    initSettingsForm();
  }

  function initLogout() {
    const btn = $('admin-logout') || document.querySelector('.admin-logout');
    if (btn) btn.addEventListener('click', (e) => { e.preventDefault(); Auth.logout(); });
  }

  async function loadSettings() {
    try {
      const data = await API.get('/api/admin/settings');
      settings = data.settings || data;
      renderSettings(settings);
    } catch (err) {
      Toast.error('Error', 'Failed to load settings');
      renderDefaultSettings();
    }
  }

  function renderSettings(s) {
    setToggle('leaderboard-enabled', s.leaderboard_enabled !== false);
    setToggle('auto-shortlist', s.auto_shortlist === true);
    setToggle('email-notifications', s.email_notifications !== false);
    setToggle('show-scores', s.show_scores !== false);
    setToggle('allow-review', s.allow_review === true);
    setToggle('dark-mode-default', s.dark_mode_default !== false);

    const minScore = $('min-shortlist-score') || document.querySelector('[name="min_shortlist_score"]');
    if (minScore) minScore.value = s.min_shortlist_score || 60;

    const defaultDuration = $('default-test-duration') || document.querySelector('[name="default_test_duration"]');
    if (defaultDuration) defaultDuration.value = s.default_test_duration || 60;

    const maxTabSwitch = $('max-tab-switches') || document.querySelector('[name="max_tab_switches"]');
    if (maxTabSwitch) maxTabSwitch.value = s.max_tab_switches || 3;

    const idleTimeout = $('idle-timeout') || document.querySelector('[name="idle_timeout"]');
    if (idleTimeout) idleTimeout.value = s.idle_timeout || 300;

    const platformName = $('platform-name') || document.querySelector('[name="platform_name"]');
    if (platformName) platformName.value = s.platform_name || 'AI Next Gen';
  }

  function renderDefaultSettings() {
    setToggle('leaderboard-enabled', true);
    setToggle('auto-shortlist', false);
    setToggle('email-notifications', true);
    setToggle('show-scores', true);
    setToggle('allow-review', false);
    setToggle('dark-mode-default', true);
  }

  function setToggle(id, checked) {
    const el = $(id) || document.querySelector(`[data-setting="${id}"]`);
    if (el) el.checked = checked;
  }

  function getToggle(id) {
    const el = $(id) || document.querySelector(`[data-setting="${id}"]`);
    return el ? el.checked : false;
  }

  function getNumber(id, fallback) {
    const el = $(id) || document.querySelector(`[name="${id}"]`);
    return el ? parseInt(el.value, 10) || fallback : fallback;
  }

  function getString(id, fallback) {
    const el = $(id) || document.querySelector(`[name="${id}"]`);
    return el ? el.value.trim() || fallback : fallback;
  }

  function initSettingsForm() {
    const form = $('settings-form') || document.querySelector('.settings-form');
    if (!form) {
      initDirectSaveButtons();
      return;
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await saveSettings();
    });
  }

  function initDirectSaveButtons() {
    const saveBtn = $('save-settings') || document.querySelector('.save-settings-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', saveSettings);
    }

    document.querySelectorAll('.setting-toggle, .settings-form input[type="checkbox"]').forEach(toggle => {
      toggle.addEventListener('change', debounce(async () => {
        await saveSettings();
      }, 500));
    });
  }

  async function saveSettings() {
    const payload = {
      leaderboard_enabled: getToggle('leaderboard-enabled'),
      auto_shortlist: getToggle('auto-shortlist'),
      email_notifications: getToggle('email-notifications'),
      show_scores: getToggle('show-scores'),
      allow_review: getToggle('allow-review'),
      dark_mode_default: getToggle('dark-mode-default'),
      min_shortlist_score: getNumber('min-shortlist-score', 60),
      default_test_duration: getNumber('default-test-duration', 60),
      max_tab_switches: getNumber('max-tab-switches', 3),
      idle_timeout: getNumber('idle-timeout', 300),
      platform_name: getString('platform-name', 'AI Next Gen'),
    };

    try {
      await API.put('/api/admin/settings', payload);
      settings = { ...settings, ...payload };
      Toast.success('Saved', 'Settings saved successfully');
    } catch (err) {
      Toast.error('Error', err.message || 'Failed to save settings');
    }
  }

  function debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  document.addEventListener('DOMContentLoaded', init);
})();
