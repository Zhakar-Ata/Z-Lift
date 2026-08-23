/* ================= AUTH ================= */
var authMode = 'login';
function showAuth() {
  $('#authView').classList.remove('hidden');
  $('#appView').classList.add('hidden');
}
function doLocalLogout() {
  flushUiLayers();
  state.token = null; state.user = null;
  ['projects', 'services', 'notes', 'checklists', 'parts', 'settings', 'diagSessions',
   'calcSaves', 'issues', 'tools', 'photos', 'invoices', 'contracts', 'reminders', 'measurements', 'safetyLogs']
    .forEach(k => { state[k] = null; });
  invDraft = null; diagSession = null;
  localStorage.removeItem('zlift_token');
  showAuth();
}
async function initAuth() {
  $('#tabLogin').onclick = () => setAuthMode('login');
  $('#tabRegister').onclick = () => setAuthMode('register');
  $('#authForm').onsubmit = async e => {
    e.preventDefault();
    const btn = $('#authSubmit'); btn.disabled = true;
    $('#authError').classList.add('hidden');
    try {
      const body = {
        username: $('#authUsername').value.trim(),
        password: $('#authPassword').value,
        name: $('#authName').value.trim()
      };
      const d = await api('/auth/' + authMode, { method: 'POST', body });
      state.token = d.token; state.user = d.user;
      localStorage.setItem('zlift_token', d.token);
      enterApp();
    } catch (err) {
      const map = { invalid_credentials: 'errInvalidCred', username_taken: 'errUserTaken', weak_password: 'errWeakPass', bad_username: 'errBadUser' };
      $('#authError').textContent = t(map[err.code] || 'errGeneric');
      $('#authError').classList.remove('hidden');
    } finally { btn.disabled = false; }
  };
}
function setAuthMode(m) {
  authMode = m;
  $('#tabLogin').classList.toggle('active', m === 'login');
  $('#tabRegister').classList.toggle('active', m === 'register');
  $('#nameField').classList.toggle('hidden', m === 'login');
  $('#authSubmit').textContent = m === 'login' ? t('loginBtn') : t('registerBtn');
}
