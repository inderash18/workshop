(function () {
  const $ = (id) => document.getElementById(id);

  let currentPage = 'list';
  let editingTest = null;

  async function init() {
    const ok = await Auth.requireAdmin();
    if (!ok) return;
    Auth.updateNav();

    detectPage();
    initLogout();
  }

  function detectPage() {
    const path = window.location.pathname;
    if (path.includes('/create') || path.includes('/new')) {
      currentPage = 'create';
      initCreateForm();
    } else if (path.includes('/manage') || (path.match(/\/test\/[^/]+$/) && !path.includes('/candidates'))) {
      currentPage = 'manage';
      initManagePage();
    } else {
      currentPage = 'list';
      loadTestList();
    }
  }

  function initLogout() {
    const btn = $('admin-logout') || document.querySelector('.admin-logout');
    if (btn) btn.addEventListener('click', (e) => { e.preventDefault(); Auth.logout(); });
  }

  // ─── TEST LIST ──────────────────────────────────────────

  async function loadTestList() {
    const container = $('tests-list') || document.querySelector('.tests-grid') || document.querySelector('.test-cards-container');
    if (!container) return;

    container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading tests...</p></div>';

    try {
      const data = await API.get('/api/admin/tests');
      const tests = data.tests || data.data || data || [];

      if (!tests.length) {
        container.innerHTML = `
          <div class="empty-state">
            <h3>No Tests Assigned</h3>
            <p>Wait for challenge setup or assignments.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = '';
      tests.forEach(test => container.appendChild(createTestCard(test)));
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><p>Failed to load tests: ${err.message}</p></div>`;
    }
  }

  function createTestCard(test) {
    const card = document.createElement('div');
    card.className = `test-admin-card status-${test.status || 'draft'}`;

    const isPublished = test.published || test.status === 'published';
    const isLocked = test.locked || test.status === 'locked';

    card.innerHTML = `
      <div class="test-admin-card-header">
        <h3>${escapeHtml(test.title || 'Untitled Test')}</h3>
        <div class="test-admin-card-badges">
          <span class="badge ${isPublished ? 'badge-success' : 'badge-secondary'}">${isPublished ? 'Published' : 'Draft'}</span>
          ${isLocked ? '<span class="badge badge-danger">Locked</span>' : ''}
        </div>
      </div>
      <div class="test-admin-card-meta">
        <span>${test.questions_count || (test.questions || []).length || 0} questions</span>
        <span>${test.duration || 0} min</span>
        <span>${test.total_marks || test.marks || 0} marks</span>
      </div>
      ${test.description ? `<p class="test-admin-card-desc">${escapeHtml(test.description).substring(0, 100)}...</p>` : ''}
      <div class="test-admin-card-actions">
        <a href="/admin/tests/${test.id || test._id}/manage" class="btn btn-sm btn-secondary">Manage</a>
        <a href="/admin/tests/${test.id || test._id}/edit" class="btn btn-sm btn-ghost">Edit</a>
        <button class="btn btn-sm btn-ghost publish-btn" data-id="${test.id || test._id}" data-published="${isPublished}">
          ${isPublished ? 'Unpublish' : 'Publish'}
        </button>
        <button class="btn btn-sm btn-ghost lock-btn" data-id="${test.id || test._id}" data-locked="${isLocked}">
          ${isLocked ? 'Unlock' : 'Lock'}
        </button>
        <button class="btn btn-sm btn-danger delete-btn" data-id="${test.id || test._id}">Delete</button>
      </div>
    `;

    card.querySelector('.publish-btn').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const id = btn.dataset.id;
      const currentlyPublished = btn.dataset.published === 'true';
      try {
        await API.put(`/api/admin/tests/${id}/publish`, { published: !currentlyPublished });
        Toast.success('Updated', `Test ${currentlyPublished ? 'unpublished' : 'published'}`);
        loadTestList();
      } catch (err) {
        Toast.error('Error', err.message);
      }
    });

    card.querySelector('.lock-btn').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const id = btn.dataset.id;
      const currentlyLocked = btn.dataset.locked === 'true';
      try {
        await API.put(`/api/admin/tests/${id}/lock`, { locked: !currentlyLocked });
        Toast.success('Updated', `Test ${currentlyLocked ? 'unlocked' : 'locked'}`);
        loadTestList();
      } catch (err) {
        Toast.error('Error', err.message);
      }
    });

    card.querySelector('.delete-btn').addEventListener('click', async (e) => {
      const id = e.currentTarget.dataset.id;
      if (!confirm('Are you sure you want to delete this test? This cannot be undone.')) return;
      try {
        await API.delete(`/api/admin/tests/${id}`);
        Toast.success('Deleted', 'Test deleted');
        loadTestList();
      } catch (err) {
        Toast.error('Error', err.message);
      }
    });

    return card;
  }

  // ─── TEST CREATION ──────────────────────────────────────

  function initCreateForm() {
    const form = $('test-form') || document.querySelector('.test-form');
    if (!form) return;

    let questionIndex = 0;

    const addQuestionBtn = $('add-question') || document.querySelector('.add-question-btn');
    if (addQuestionBtn) {
      addQuestionBtn.addEventListener('click', () => {
        questionIndex++;
        addQuestionBlock(form, questionIndex);
      });
    }

    const saveDraftBtn = $('save-draft') || document.querySelector('.save-draft-btn');
    const publishBtn = $('publish-test') || document.querySelector('.publish-btn');

    if (saveDraftBtn) {
      saveDraftBtn.addEventListener('click', (e) => {
        e.preventDefault();
        submitTestForm(form, false);
      });
    }

    if (publishBtn) {
      publishBtn.addEventListener('click', (e) => {
        e.preventDefault();
        submitTestForm(form, true);
      });
    }

    initSecurityToggles(form);

    if (form.dataset.testId) {
      loadTestData(form.dataset.testId, form);
    }
  }

  function addQuestionBlock(form, index) {
    const container = $('questions-container') || form.querySelector('.questions-container');
    if (!container) return;

    const block = document.createElement('div');
    block.className = 'question-block';
    block.dataset.index = index;

    block.innerHTML = `
      <div class="question-block-header">
        <span class="question-block-number">Question ${index + 1}</span>
        <button type="button" class="btn btn-sm btn-danger remove-question-btn">Remove</button>
      </div>
      <div class="form-group">
        <label>Question Text</label>
        <textarea name="question_${index}" rows="3" placeholder="Enter your question..." required></textarea>
      </div>
      <div class="form-group">
        <label>Type</label>
        <select name="type_${index}" class="question-type-select">
          <option value="mcq">Multiple Choice</option>
          <option value="text">Short Answer</option>
          <option value="textarea">Long Answer</option>
        </select>
      </div>
      <div class="options-container" data-index="${index}">
        <label>Options</label>
        <div class="options-list">
          <div class="option-row">
            <input type="text" name="opt_${index}_0" placeholder="Option A" class="option-input">
            <label class="checkbox-label"><input type="radio" name="correct_${index}" value="0"> Correct</label>
          </div>
          <div class="option-row">
            <input type="text" name="opt_${index}_1" placeholder="Option B" class="option-input">
            <label class="checkbox-label"><input type="radio" name="correct_${index}" value="1"> Correct</label>
          </div>
        </div>
        <button type="button" class="btn btn-sm btn-ghost add-option-btn" data-index="${index}">+ Add Option</button>
      </div>
      <div class="form-group">
        <label>Marks</label>
        <input type="number" name="marks_${index}" min="1" value="1" placeholder="1">
      </div>
    `;

    container.appendChild(block);

    block.querySelector('.remove-question-btn').addEventListener('click', () => {
      block.remove();
      renumberQuestions(form);
    });

    block.querySelector('.add-option-btn').addEventListener('click', () => {
      addOptionRow(block, index);
    });

    block.querySelector('.question-type-select').addEventListener('change', (e) => {
      const optContainer = block.querySelector('.options-container');
      if (optContainer) {
        optContainer.style.display = e.target.value === 'mcq' ? '' : 'none';
      }
    });
  }

  function addOptionRow(block, qIndex) {
    const list = block.querySelector('.options-list');
    if (!list) return;

    const count = list.querySelectorAll('.option-row').length;
    const letter = String.fromCharCode(65 + count);

    const row = document.createElement('div');
    row.className = 'option-row';
    row.innerHTML = `
      <input type="text" name="opt_${qIndex}_${count}" placeholder="Option ${letter}" class="option-input">
      <label class="checkbox-label"><input type="radio" name="correct_${qIndex}" value="${count}"> Correct</label>
      <button type="button" class="btn btn-sm btn-ghost remove-option-btn">&times;</button>
    `;

    row.querySelector('.remove-option-btn').addEventListener('click', () => row.remove());
    list.appendChild(row);
  }

  function renumberQuestions(form) {
    const blocks = form.querySelectorAll('.question-block');
    blocks.forEach((block, i) => {
      block.dataset.index = i;
      const num = block.querySelector('.question-block-number');
      if (num) num.textContent = `Question ${i + 1}`;
    });
  }

  function initSecurityToggles(form) {
    const toggles = form.querySelectorAll('.security-toggle, input[type="checkbox"][data-security]');
    toggles.forEach(toggle => {
      toggle.addEventListener('change', () => {
        const label = toggle.closest('.toggle-item')?.querySelector('.toggle-label');
        if (label) {
          label.textContent = toggle.checked ? 'Enabled' : 'Disabled';
        }
      });
    });
  }

  async function submitTestForm(form, publish) {
    const formData = new FormData(form);
    const title = formData.get('title') || form.querySelector('[name="title"]')?.value;
    const description = formData.get('description') || form.querySelector('[name="description"]')?.value;
    const duration = parseInt(formData.get('duration') || form.querySelector('[name="duration"]')?.value, 10);

    if (!title) {
      Toast.warning('Required', 'Please enter a test title');
      return;
    }

    const questions = [];
    const blocks = form.querySelectorAll('.question-block');
    blocks.forEach((block, i) => {
      const qText = formData.get(`question_${i}`) || block.querySelector(`[name="question_${i}"]`)?.value;
      const qType = formData.get(`type_${i}`) || block.querySelector(`[name="type_${i}"]`)?.value || 'mcq';
      const marks = parseInt(formData.get(`marks_${i}`) || block.querySelector(`[name="marks_${i}"]`)?.value, 10) || 1;

      const q = { question: qText, type: qType, marks };

      if (qType === 'mcq') {
        const options = [];
        block.querySelectorAll('.option-input').forEach((opt, j) => {
          if (opt.value.trim()) {
            options.push({ label: opt.value.trim(), value: String(j) });
          }
        });
        q.options = options;
        const correct = block.querySelector(`input[name="correct_${i}"]:checked`);
        q.correct_answer = correct ? correct.value : null;
      }

      if (qText) questions.push(q);
    });

    const security = {};
    form.querySelectorAll('.security-toggle, input[data-security]').forEach(toggle => {
      const key = toggle.dataset.security || toggle.name;
      security[key] = toggle.checked;
    });

    const payload = {
      title,
      description: description || '',
      duration: duration || 60,
      questions,
      security,
      published: publish,
    };

    try {
      const testId = form.dataset.testId || form.dataset.id;
      if (testId) {
        await API.put(`/api/admin/tests/${testId}`, payload);
        Toast.success('Updated', 'Test updated successfully');
      } else {
        await API.post('/api/admin/tests', payload);
        Toast.success('Created', publish ? 'Test created and published' : 'Test saved as draft');
      }
      window.location.href = '/admin/tests';
    } catch (err) {
      Toast.error('Error', err.message || 'Failed to save test');
    }
  }

  async function loadTestData(testId, form) {
    try {
      const data = await API.get(`/api/admin/tests/${testId}`);
      const test = data.test || data;
      form.dataset.testId = testId;

      const titleInput = form.querySelector('[name="title"]');
      const descInput = form.querySelector('[name="description"]');
      const durationInput = form.querySelector('[name="duration"]');

      if (titleInput) titleInput.value = test.title || '';
      if (descInput) descInput.value = test.description || '';
      if (durationInput) durationInput.value = test.duration || 60;

      (test.questions || []).forEach((q, i) => {
        addQuestionBlock(form, i);
        const block = form.querySelectorAll('.question-block')[i];
        if (!block) return;

        const qInput = block.querySelector(`[name="question_${i}"]`);
        const typeSelect = block.querySelector(`[name="type_${i}"]`);
        const marksInput = block.querySelector(`[name="marks_${i}"]`);

        if (qInput) qInput.value = q.question || '';
        if (typeSelect) typeSelect.value = q.type || 'mcq';
        if (marksInput) marksInput.value = q.marks || 1;

        if (q.options && q.options.length > 2) {
          for (let j = 2; j < q.options.length; j++) {
            addOptionRow(block, i);
          }
        }

        if (q.options) {
          q.options.forEach((opt, j) => {
            const optInput = block.querySelector(`[name="opt_${i}_${j}"]`);
            if (optInput) optInput.value = opt.label || opt;
          });
        }
      });
    } catch (err) {
      Toast.error('Error', 'Failed to load test data');
    }
  }

  // ─── TEST MANAGE ────────────────────────────────────────

  function initManagePage() {
    const path = window.location.pathname;
    const match = path.match(/\/tests\/([^/]+)\/manage/);
    if (!match) return;
    const testId = match[1];

    loadTestDetails(testId);
    initTabs(testId);
  }

  async function loadTestDetails(testId) {
    const container = $('test-details') || document.querySelector('.test-details');
    if (!container) return;

    try {
      const data = await API.get(`/api/admin/tests/${testId}`);
      const test = data.test || data;

      const infoEl = $('test-info') || container.querySelector('.test-info');
      if (infoEl) {
        infoEl.innerHTML = `
          <div class="detail-grid">
            <div class="detail-item"><label>Title</label><span>${escapeHtml(test.title || 'N/A')}</span></div>
            <div class="detail-item"><label>Status</label><span class="badge ${test.published ? 'badge-success' : 'badge-secondary'}">${test.published ? 'Published' : 'Draft'}</span></div>
            <div class="detail-item"><label>Duration</label><span>${test.duration || 0} min</span></div>
            <div class="detail-item"><label>Questions</label><span>${(test.questions || []).length}</span></div>
            <div class="detail-item"><label>Total Marks</label><span>${test.total_marks || test.marks || 0}</span></div>
            <div class="detail-item"><label>Created</label><span>${formatDate(test.created_at)}</span></div>
          </div>
        `;
      }

      await loadTestCandidates(testId);
    } catch (err) {
      Toast.error('Error', 'Failed to load test details');
    }
  }

  function initTabs(testId) {
    const tabs = document.querySelectorAll('.tab-btn, [data-tab]');
    const panels = document.querySelectorAll('.tab-panel, [data-tab-panel]');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab || tab.dataset.target;

        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        panels.forEach(p => {
          p.style.display = (p.dataset.tabPanel === target || p.id === target) ? '' : 'none';
        });
      });
    });
  }

  async function loadTestCandidates(testId) {
    const container = $('test-candidates') || document.querySelector('.test-candidates-list');
    if (!container) return;

    try {
      const data = await API.get(`/api/admin/tests/${testId}/candidates`);
      const candidates = data.candidates || data.data || data || [];

      if (!candidates.length) {
        container.innerHTML = '<p class="empty-text">No candidates have taken this test yet.</p>';
        return;
      }

      let html = '<table class="data-table"><thead><tr><th>Name</th><th>Email</th><th>Score</th><th>Time Taken</th><th>Status</th></tr></thead><tbody>';
      candidates.forEach(c => {
        const score = c.score !== undefined ? c.score : 'N/A';
        const total = c.total_marks || 100;
        html += `
          <tr>
            <td>${escapeHtml(c.name || 'N/A')}</td>
            <td>${escapeHtml(c.email || 'N/A')}</td>
            <td>${score !== 'N/A' ? `${score}/${total}` : 'N/A'}</td>
            <td>${c.time_taken ? `${c.time_taken} min` : 'N/A'}</td>
            <td><span class="badge ${c.submitted ? 'badge-success' : 'badge-warning'}">${c.submitted ? 'Submitted' : 'In Progress'}</span></td>
          </tr>
        `;
      });
      html += '</tbody></table>';
      container.innerHTML = html;
    } catch (err) {
      container.innerHTML = `<p class="error-text">Failed to load candidates.</p>`;
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateStr;
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  document.addEventListener('DOMContentLoaded', init);
})();
