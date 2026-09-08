/* ================= APP SHELL ================= */
function checkBackupNag() {
  try {
    const last = +(localStorage.getItem('zlift_last_external_backup') || 0);
    const snooze = +localStorage.getItem('zlift_backup_snooze') || 0;
    if (Date.now() < snooze) return;
    const days = last ? Math.floor((Date.now() - last) / 86400000) : 999;
    if (days < 7) return;
    setTimeout(() => {
      const txt = last ? faNum(days) + ' ' + t('backupNagMsg') : t('backupHint');
      openModal(`
        <div class="modal-head"><h3>💾 ${t('backupNagTitle')}</h3><button class="icon-btn" onclick="closeModal()">✕</button></div>
        <div class="modal-body"><div class="note-block">⚠️ ${txt}</div></div>
        <div class="modal-foot">
          <button class="btn btn-ghost" onclick="localStorage.setItem('zlift_backup_snooze', String(Date.now() + 3 * 86400000));closeModal()">${t('backupNagLater')}</button>
          <button class="btn btn-primary" onclick="openBackupModal()">💾 ${t('backupNagBtn')}</button>
        </div>`, { size: 'sm' });
    }, 1200);
  } catch (e) {}
}
function enterApp() {
  $('#authView').classList.add('hidden');
  $('#appView').classList.remove('hidden');
  checkBackupNag();
  $('#userName').textContent = state.user.name;
  $('#userAvatar').textContent = (state.user.name || '?').trim()[0] || '?';
  renderNav();
  navigate(state.route || '/dashboard');
  /* surface overdue services as a native notification shortly after entering */
  setTimeout(checkRemindersNotify, 1500);
  /* create a rotating local snapshot once a day (no network, no third party) */
  setTimeout(autoBackupIfDue, 2500);
  /* one-way verified migration of inline photo payloads to IndexedDB (fail-safe:
     without IndexedDB, or on any error, photos simply stay inline) */
  setTimeout(() => { _migratePhotosToIdb(); }, 800);
}
var NAV = [
  { section: 'navMain' },
  { route: '/dashboard', key: 'today', icon: 'dash' },
  { route: '/projects', key: 'navElevators', icon: 'proj' },
  { route: '/services', key: 'services', icon: 'svc' },
  { route: '/finance', key: 'finance', icon: 'bill' },
  { section: 'navTools' },
  { route: '/workshop', key: 'workshop', icon: 'wrench' },
  { route: '/settings', key: 'settings', icon: 'gear' }
];
var NAV_GROUPS = {
  '/finance': ['/invoices', '/contracts', '/report', '/analytics'],
  '/workshop': ['/checklists', '/calculations', '/diagnostics', '/vvvf', '/standards', '/knowledge', '/measurements', '/parts', '/tools', '/notes', '/issues'],
  '/services': ['/calendar']
};
function navItemActive(itemRoute, current) {
  if (!current) return false;
  if (current === itemRoute || current.startsWith(itemRoute + '/')) return true;
  const kids = NAV_GROUPS[itemRoute] || [];
  return kids.some(k => current === k || current.startsWith(k + '/'));
}
var _navLang = null;
function renderNav() {
  const nav = $('#mainNav');
  if (!nav) return;
  if (_navLang !== LANG || !nav.children.length) {          // (re)build only when needed
    _navLang = LANG;
    nav.innerHTML = NAV.map(item => {
      if (item.section) return `<div class="nav-section">${t(item.section)}</div>`;
      return `<button class="nav-item" data-route="${item.route}" aria-current="false">${IC[item.icon]}<span>${t(item.key)}</span></button>`;
    }).join('');
    nav.querySelectorAll('.nav-item').forEach(b => b.onclick = () => { navigate(b.dataset.route); closeSidebar(); });
  }
  nav.querySelectorAll('.nav-item').forEach(b => {
    const r = b.dataset.route;
    const active = navItemActive(r, state.route);
    b.classList.toggle('active', active);
    b.setAttribute('aria-current', active ? 'page' : 'false');
  });
}
function _closeSidebarDom() { $('#sidebar').classList.remove('open'); $('#backdrop').classList.remove('show'); }
function closeSidebar() {
  const wasOpen = $('#sidebar').classList.contains('open');
  _closeSidebarDom();
  if (wasOpen) popTaggedLayer('sidebar');
}

/* ================= ROUTER ================= */
function flushUiLayers() {
  /* drop all overlay layers (modal / picker / sidebar / diag) without
     touching history — used on internal navigation & logout */
  if (!uiStack.length) return;
  uiStack = [];
  _closeModalDom();
  if (typeof _closeJdateDom === 'function') _closeJdateDom();
  _closeSidebarDom();
  diagSession = null;
}
/* remember where the user was on each page: opening a page starts at the top,
   coming back restores the previous scroll position (like a native app) */
var _scrollPos = {};
var _pendingScroll = 0;
function _saveScroll() { if (state.route) _scrollPos[state.route] = window.scrollY || window.pageYOffset || 0; }
function navigate(route) {
  if (route === state.route) { flushUiLayers(); render(); return; }
  _saveScroll();
  flushUiLayers();
  state.route = route;
  _pendingScroll = 0;                 // a freshly opened page starts at the top
  location.hash = route;
  render();
}
window.addEventListener('hashchange', () => {
  const r = location.hash.slice(1) || '/dashboard';
  if (r !== state.route) {
    _saveScroll();
    state.route = r;
    _pendingScroll = _scrollPos[r] || 0;   // back/forward → restore the old spot
    // route changed underneath any open overlays: close them & reset stack
    flushUiLayers();
    if (state.user) render();
  }
});

var _renderSeq = 0;
async function render() {
  const seq = ++_renderSeq;          // only the newest render may paint
  renderNav();
  const c = $('#content');
  const r = state.route;
  const titles = {
    '/dashboard': 'today', '/projects': 'navElevators', '/services': 'services',
    '/parts': 'parts', '/checklists': 'checklists', '/calculations': 'calculations',
    '/diagnostics': 'diagnostics', '/knowledge': 'knowledge', '/notes': 'notes',
    '/vvvf': 'vvvf', '/issues': 'issues', '/tools': 'tools', '/invoices': 'invoices', '/contracts': 'contracts', '/report': 'monthlyReport', '/standards': 'standards', '/calendar': 'calendar', '/analytics': 'analytics', '/measurements': 'measures', '/settings': 'settings',
    '/finance': 'finance', '/workshop': 'workshop'
  };
  const baseRoute = '/' + r.split('/')[1];
  $('#pageTitle').textContent = t(titles[baseRoute] || 'dashboard');
  const spinner = setTimeout(() => {
    if (seq === _renderSeq) c.innerHTML = '<div class="page-loading"><div class="spinner"></div></div>';
  }, 160);                                   // no spinner flash on instant local data
  try {
    await loadAll();
    clearTimeout(spinner);
    if (seq !== _renderSeq) return;  // a newer navigation won the race
    if (r === '/dashboard') renderDashboard();
    else if (r === '/projects') renderProjects();
    else if (r.startsWith('/projects/')) renderProjectDetail(r.split('/')[2]);
    else if (r === '/services') renderServices();
    else if (r === '/parts') renderParts();
    else if (r === '/checklists') renderChecklists();
    else if (r.startsWith('/checklists/')) renderChecklistDetail(r.split('/')[2]);
    else if (r === '/calculations') renderCalculations();
    else if (r === '/diagnostics') renderDiagnostics();
    else if (r === '/vvvf') renderVVVF();
    else if (r === '/issues') renderIssues();
    else if (r === '/finance') renderFinance();
    else if (r === '/workshop') renderWorkshop();
    else if (r === '/invoices') renderInvoices();
    else if (r === '/contracts') renderContracts();
    else if (r === '/report') renderMonthlyReport();
    else if (r === '/analytics') renderAnalytics();
    else if (r === '/settings') renderSettings();
    else if (r === '/tools') renderToolsPage();
    else if (r === '/knowledge') renderKnowledge();
    else if (r === '/standards') renderStandards();
    else if (r === '/notes') renderNotes();
    else if (r === '/calendar') renderCalendar();
    else if (r === '/measurements') renderMeasurements();
    else renderDashboard();
    const y = _pendingScroll; _pendingScroll = 0;
    if (typeof window.scrollTo === 'function') { try { window.scrollTo(0, y); } catch (e2) {} }
  } catch (e) {
    clearTimeout(spinner);
    if (seq !== _renderSeq) return;
    if (e && e.message === 'unauthorized') return;
    reportError(e, 'render:' + r);
    c.innerHTML = `<div class="error-box"><p style="font-weight:700;margin-bottom:10px">⚠️ ${t('loadError')}</p><button class="btn btn-primary" onclick="render()">${t('retry')}</button></div>`;
  }
}
