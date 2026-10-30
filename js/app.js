/* ================= INIT ================= */
/* The boot splash (index.html) is dismissed by whichever view wins the
   boot — the app shell (enterApp) or the auth screen (showAuth). On fast
   devices the whole boot can finish in ~200ms, faster than a launch
   screen can even register, so dismissal waits out a short minimum
   on-screen time (750ms from first paint; never longer than a slow real
   boot). The running version is stamped on the splash so a field device
   can prove at a glance which build actually booted. */
function hideBootSplash() {
  var el = document.getElementById('bootSplash');
  if (!el || el.dataset.hiding) return;
  el.dataset.hiding = '1';
  var ver = el.querySelector('.bs-ver');
  if (ver && typeof APP_VERSION !== 'undefined') ver.textContent = 'Z Lift v' + APP_VERSION;
  var wait = Math.max(0, 750 - (Date.now() - (window.__zlT0 || Date.now())));
  setTimeout(() => {
    el.classList.add('done');
    setTimeout(() => { try { el.remove(); } catch (e) {} }, 340);
  }, wait);
}
/* ============ v26: theme/lang helpers + service-due notifications ============ */
function setTheme(th) {
  if (th !== 'dark') th = 'light';
  localStorage.setItem('zlift_theme', th);
  applyTheme();
}
function setLang(l) {
  LANG = (l === 'en') ? 'en' : 'fa';
  localStorage.setItem('zlift_lang', LANG);
  applyLang();
  updateOnlineBadge();
  if (state.user) { renderNav(); render(); $('#userName').textContent = state.user.name; }
  setAuthMode(authMode);
}
/* Browser notifications — only fired by user opt-in; the app has no backend,
   so they surface when the app is opened/foregrounded with overdue items. */
function notifySupported() { return typeof window !== 'undefined' && 'Notification' in window; }
async function ensureNotifyPermission() {
  if (!notifySupported() || typeof Notification.requestPermission !== 'function') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try { return (await Notification.requestPermission()) === 'granted'; } catch (e) { return false; }
}
var _lastNotifyCheck = 0;
function checkRemindersNotify() {
  if (!notifySupported()) return;
  const s = state.settings || {};
  if (!s.notify || Notification.permission !== 'granted') return;
  const rems = buildReminders();
  const due = rems.filter(r => r.overdue || r.soon);
  if (!due.length) return;
  const overdueN = due.filter(r => r.overdue).length;
  const title = overdueN
    ? (LANG === 'fa' ? '🔴 ' + faNum(overdueN) + ' سرویس عقب‌افتاده' : overdueN + ' overdue services')
    : (LANG === 'fa' ? '🟡 سرویس‌های نزدیک موعد' : 'Services due soon');
  const body = due.slice(0, 5).map(r => '• ' + r.title).join('\n');
  try {
    const n = new Notification(title, { body, tag: 'zlift-reminders', icon: 'icons/icon-192.png' });
    n.onclick = () => { try { window.focus(); n.close(); svcTab = 'calendar'; navigate('/services'); } catch (e) {} };
    setTimeout(() => { try { n.close(); } catch (e) {} }, 10000);
  } catch (e) { /* notifications can be blocked at runtime — fail silently */ }
}
async function enableNotifications() {
  const ok = await ensureNotifyPermission();
  if (!ok) { toast(t('setNotifyDenied'), 'err'); renderSettings(); return false; }
  try { const d = await api('/settings', { method: 'PUT', body: { notify: true } }); state.settings = d.settings; } catch (e) { toast(errMsg(e), 'err'); }
  toast(t('setNotifyOn'), 'ok');
  renderSettings();
  checkRemindersNotify();
  return true;
}
async function toggleNotify(on) {
  if (!on) {
    try { const d = await api('/settings', { method: 'PUT', body: { notify: false } }); state.settings = d.settings; } catch (e) {}
    renderSettings();
    return;
  }
  await enableNotifications();
}
function clearAllData() {
  confirmDialog(t('confirmDeleteTitle'), t('setClearAllMsg'), async () => {
    try { await STRUCTURED_DB.clear(); } catch (e) { reportError(e, 'clear structured data'); return; }
    if (IDB_PHOTOS.available()) { try { await IDB_PHOTOS.clear(); } catch (e) { reportError(e, 'clear photos'); return; } }
    try {
      ['zlift_db', 'zlift_db_mirror', AUTO_BACKUP_KEY, 'zlift_pre_restore_backup', 'zlift_migration_status'].forEach(k => localStorage.removeItem(k));
    } catch (e) {}
    doLocalLogout();
    try { location.reload(); } catch (e) {}
  });
}

async function init() {
  applyTheme();
  applyLang();
  initAuth();

  $('#themeBtn').onclick = () => setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  $('#langBtn').onclick = () => setLang(LANG === 'fa' ? 'en' : 'fa');
  updateOnlineBadge();
  window.addEventListener('online', updateOnlineBadge);
  window.addEventListener('offline', updateOnlineBadge);
  /* multi-tab: when another tab saves, refresh from storage instead of
     letting this tab's stale in-memory aggregate overwrite the newer data.
     Never yank data while a form (modal) is open. */
  window.addEventListener('storage', e => {
    if (e.key !== 'zlift_sync' || !state.user) return;
    if (document.getElementById('modalOverlay')) return;
    loadAll(true).then(() => render()).catch(() => {});
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - _lastNotifyCheck < 5 * 60 * 1000) return;
    _lastNotifyCheck = Date.now();
    checkRemindersNotify();
  });
  $('#menuBtn').onclick = () => {
    $('#sidebar').classList.add('open');
    $('#backdrop').classList.add('show');
    pushUiLayer('sidebar', _closeSidebarDom);
  };
  $('#sidebarClose').onclick = closeSidebar;
  $('#backdrop').onclick = closeSidebar;
  $('#backupBtn').onclick = openBackupModal;
  $('#gSearchBtn').onclick = openGlobalSearch;
  $('#tgChannelBtn').onclick = openTgChannel;
  $('#logoutBtn').onclick = async () => {
    try { localStorage.removeItem('zlift_diag_session'); } catch (e) {}
    try { await api('/auth/logout', { method: 'POST' }); } catch (e) {}
    doLocalLogout();
    toast(LANG === 'fa' ? 'با موفقیت خارج شدید' : 'Logged out');
  };

  if (state.token) {
    try {
      const d = await api('/auth/me');
      state.user = d.user;
      enterApp();
      return;
    } catch (e) { /* fallthrough to auth */ }
  }
  showAuth();
}
/* init() moved to end */
init();