/* ================= AUTH ================= */
var authMode = 'login';
function showAuth() {
  $('#authView').classList.remove('hidden');
  $('#appView').classList.add('hidden');
  if (typeof hideBootSplash === 'function') hideBootSplash();
}
function doLocalLogout() {
  flushUiLayers();
  state.token = null; state.user = null;
  ['projects', 'services', 'notes', 'checklists', 'parts', 'settings', 'diagSessions',
   'calcSaves', 'issues', 'tools', 'photos', 'invoices', 'contracts', 'reminders', 'measurements', 'safetyLogs', 'elevators']
    .forEach(k => { state[k] = null; });
  invDraft = null; diagSession = null;
  try { sessionStorage.removeItem('zlift_diag_session'); } catch (e) {}
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
      if (err.code === 'too_many_attempts') {
        const secs = Math.max(1, err.retryAfter || 5);
        $('#authError').textContent = t('errTooMany').replace('{s}', faNum(secs));
        startAuthCooldown(secs);
      } else {
        $('#authError').textContent = t(map[err.code] || 'errGeneric');
      }
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

/* after repeated wrong passwords the API asks for a growing wait; mirror it
   on the button with a live countdown so the pause is explained, not a
   mysteriously dead form (the correct password still works right after) */
var _authCooldownTimer = null;
function startAuthCooldown(secs) {
  const btn = $('#authSubmit');
  if (!btn) return;
  const until = Date.now() + secs * 1000;
  if (_authCooldownTimer) clearInterval(_authCooldownTimer);
  const tick = () => {
    const left = Math.ceil((until - Date.now()) / 1000);
    if (left <= 0) {
      clearInterval(_authCooldownTimer); _authCooldownTimer = null;
      btn.disabled = false; setAuthMode(authMode);
      return;
    }
    btn.disabled = true;
    btn.textContent = t('loginWaitBtn').replace('{s}', faNum(left));
  };
  _authCooldownTimer = setInterval(tick, 250);
  setTimeout(tick, 0); // the submit handler's finally{} re-enables first — re-disable right after
}
