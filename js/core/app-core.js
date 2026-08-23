/* ================= VERSION SINGLE SOURCE OF TRUTH ================= */
var APP_VERSION = '29.1.0';
var DB_SCHEMA_VERSION = 3;
var BACKUP_FORMAT_VERSION = 7;
var CACHE_VERSION = 'zlift-pwa-v34';
/* Display badge shown on Settings / about */
var APP_BUILD = '2026-08-24';

/* ================= Z Lift — SPA app ================= */
'use strict';

/* ---------- state ---------- */
var state = {
  token: localStorage.getItem('zlift_token') || null,
  user: null,
  projects: null,
  services: null,
  notes: null,
  checklists: null,
  parts: null,
  settings: null,
  diagSessions: null, calcSaves: null, issues: null, tools: null, photos: null, invoices: null, contracts: null, reminders: null, measurements: null, safetyLogs: null,
  route: location.hash.slice(1) || '/dashboard'
};

/* ---------- DATA ACCESS LAYER ----------
   ARCHITECTURE (v2): Z Lift is a fully offline PWA — there is NO backend server.
   Every `api(path, opts)` call below resolves against the local persistence layer
   (see the "LOCAL PERSISTENCE" section near the end of this file):
     • structured data → IndexedDB `zlift-data`; explicit localStorage fallback
     • photos (large blobs) → IndexedDB `zlift-photos`, inline fallback
   The function signature mimics a REST API on purpose: a future sync layer can be
   introduced by replacing only this single seam — the rest of the app stays as-is.
   No network request is made anywhere for application data. */
async function api(path, opts = {}) {
  return _apiLocal(path, opts);
}

/* ---------- utils ---------- */
var $ = s => document.querySelector(s);
var $$ = s => Array.from(document.querySelectorAll(s));
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function toast(msg, type = 'ok') {
  const root = $('#toastRoot');
  if (!root) return;
  while (root.children.length >= 3) root.firstElementChild.remove();   // never cover the screen
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.setAttribute('role', type === 'ok' ? 'status' : 'alert');
  el.setAttribute('aria-live', type === 'ok' ? 'polite' : 'assertive');
  el.innerHTML = (type === 'ok' ? '✅' : '⚠️') + ' <span>' + esc(msg) + '</span>';
  const hide = () => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); };
  el.onclick = hide;                                                   // tap to dismiss
  root.appendChild(el);
  setTimeout(hide, 2600);
}
/* inline validation: say what is wrong, mark the field and put the cursor in it
   (a toast alone leaves the user hunting for the empty box) */
function fieldError(sel, msgKey) {
  toast(t(msgKey), 'err');
  const el = $(sel);
  if (!el) return false;
  el.classList.add('input-error');
  el.addEventListener('input', () => el.classList.remove('input-error'), { once: true });
  el.addEventListener('change', () => el.classList.remove('input-error'), { once: true });
  try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) {} }
  try { el.scrollIntoView({ block: 'center' }); } catch (e) {}
  return false;
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
/* inventory shortage notice: /parts-consume clamps stock at zero and reports a
   shortage — make sure the technician actually SEES that it happened */
function warnStockShort(res, partName) {
  try {
    if (res && +res.shortQty > 0) {
      toast(t('stockShortMsg').replace('{n}', partName || '?').replace('{q}', faNum(+res.shortQty)), 'err');
    }
  } catch (e) {}
}
/* wrap an async save handler: disables the button during the call and
   swallows double-clicks (duplicate-submission protection) */
function guard(btnSel, fn) {
  return async (...a) => {
    const b = $(btnSel);
    if (b && b.disabled) return;
    if (b) b.disabled = true;
    try { await fn(...a); }
    catch (e) { reportError(e, 'guard:' + btnSel); }
    finally { const b2 = $(btnSel); if (b2) b2.disabled = false; }
  };
}
/* turn an API error code into a message the technician can act on */
var ERR_KEYS = {
    name_required: 'requiredTitle', customer_required: 'requiredCustomer',
  invalid_invoice: 'invInvalidRecord', duplicate_invoice_number: 'invDuplicateNumber',
  not_found: 'errNotFound', invoice_part_not_found: 'errNotFound', insufficient_stock: 'stockAlert', too_large: 'photoTooLarge', bad_backup: 'restoreBad',
  unauthorized: 'errSessionExpired', invalid_credentials: 'errInvalidCred',
  username_taken: 'errUserTaken', weak_password: 'errWeakPass', bad_username: 'errBadUser'
};
function errMsg(e) {
  if (e && e.code && ERR_KEYS[e.code]) return t(ERR_KEYS[e.code]);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return t('errOffline');
  return t('errGeneric');
}
/* central error handler */
function reportError(e, ctx) {
  try {
    console.error('[ZLift]', ctx || '', e);
    toast(t('errUnexpected'), 'err');
  } catch (e2) {}
}
window.addEventListener('error', ev => { try { console.error('[ZLift uncaught]', ev.message); } catch (e) {} });
window.addEventListener('unhandledrejection', ev => {
  try { console.error('[ZLift promise]', ev.reason); } catch (e) {}
  if (ev.preventDefault) ev.preventDefault();
});

var STATUS_META = {
  contract: { key: 'statusContract', cls: 'b-gray' },
  installing: { key: 'statusInstalling', cls: 'b-blue' },
  testing: { key: 'statusTesting', cls: 'b-purple' },
  inspection: { key: 'statusInspection', cls: 'b-amber' },
  maintenance: { key: 'statusMaintenance', cls: 'b-teal' },
  delivered: { key: 'statusDelivered', cls: 'b-green' }
};
var SVC_META = {
  maintenance: { key: 'typeMaintenance', cls: 'b-teal', icon: '🔧' },
  repair: { key: 'typeRepair', cls: 'b-blue', icon: '🛠️' },
  emergency: { key: 'typeEmergency', cls: 'b-red', icon: '🚨' },
  inspection: { key: 'typeInspection', cls: 'b-purple', icon: '📋' }
};
var FINAL_META = {
  ok: { key: 'finalOk', cls: 'b-green' },
  followup: { key: 'finalFollowup', cls: 'b-amber' },
  outoforder: { key: 'finalOut', cls: 'b-red' }
};
/* safe meta lookups — never throw on unknown/legacy values (restored backups, old records) */
function svcMeta(k) { return SVC_META[k] || SVC_META.maintenance; }
function finalMeta(k) { return FINAL_META[k] || FINAL_META.ok; }
function statMeta(k) { return STATUS_META[k] || STATUS_META.contract; }
function issueMeta(k) { return ISSUE_META[k] || ISSUE_META.open; }
function remMeta(k) { return REMINDER_META[k] || REMINDER_META.custom; }
/* escape a value that is embedded as a JS string literal inside an inline HTML
   handler attribute: JS-escape first, then HTML-escape (the parser decodes the
   entities before the JS is evaluated) */
function jsAttr(s) {
  return esc(String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n'));
}
/* ---- Persian-aware text normalisation for every search box ----
   Arabic ي/ك typed by many keyboards must match Persian ی/ک, Persian & Arabic
   digits must match Latin ones, and ZWNJ / diacritics / tatweel must be ignored,
   otherwise «کليد» never finds «کلید» and «۱۲» never finds «12». */
var _NORM_MAP = {
  'ي': 'ی', 'ﻱ': 'ی', 'ﻲ': 'ی', 'ی': 'ی', 'ئ': 'ی', 'ى': 'ی',
  'ك': 'ک', 'ﻙ': 'ک', 'ﻚ': 'ک',
  'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ا': 'ا',
  'ؤ': 'و', 'ة': 'ه', 'ۀ': 'ه',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9'
};
function norm(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[\u200c\u200f\u200e\u0640]/g, '')          // ZWNJ, bidi marks, tatweel
    .replace(/[\u064b-\u0652]/g, '')                      // harakat
    .replace(/[يﻱﻲیئىكﻙﻚأإآٱاؤةۀ٠-٩۰-۹]/g, c => _NORM_MAP[c] || c)
    .replace(/\s+/g, ' ')
    .trim();
}
/* join any number of fields into one normalised haystack */
function hay(...parts) { return norm(parts.filter(v => v != null && v !== '').join(' ')); }

/* optimistic list removal with rollback — safe when the id is already gone
   (a stale button / double tap must never delete a random last row) */
function optimisticRemove(list, id) {
  const idx = list.findIndex(x => x && x.id === id);
  if (idx < 0) return null;
  const [removed] = list.splice(idx, 1);
  return { idx, removed, restore() { list.splice(idx, 0, removed); } };
}
function statusBadge(s) { const m = statMeta(s); return `<span class="badge ${m.cls}">${t(m.key)}</span>`; }
function typeBadge(type) {
  if (type === 'hydraulic') return `<span class="badge b-teal">🛢️ ${t('hydraulic')}</span>`;
  if (type === 'both') return `<span class="badge b-purple">⚖️ ${t('bothTypes')}</span>`;
  return `<span class="badge b-blue">⚙️ ${t('traction')}</span>`;
}

/* ---------- icons ---------- */
var IC = {
  dash: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  proj: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><line x1="9" y1="9" x2="9" y2="9.01"/><line x1="9" y1="12" x2="9" y2="12.01"/><line x1="9" y1="15" x2="9" y2="15.01"/><line x1="9" y1="18" x2="9" y2="18.01"/></svg>',
  svc: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  calc: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="11" x2="8" y2="11.01"/><line x1="12" y1="11" x2="12" y2="11.01"/><line x1="16" y1="11" x2="16" y2="11.01"/><line x1="8" y1="15" x2="8" y2="15.01"/><line x1="12" y1="15" x2="12" y2="15.01"/><line x1="16" y1="15" x2="16" y2="15.01"/><line x1="8" y1="19" x2="8" y2="19.01"/><line x1="12" y1="19" x2="12" y2="19.01"/><line x1="16" y1="19" x2="16" y2="19.01"/></svg>',
  diag: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  kb: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  ruler: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.3 8.7 8.7 21.3c-1 1-2.5 1-3.4 0l-2.6-2.6c-1-1-1-2.5 0-3.4L15.3 2.7c1-1 2.5-1 3.4 0l2.6 2.6c1 1 1 2.5 0 3.4Z"/><path d="m7.5 10.5 2 2"/><path d="m10.5 7.5 2 2"/><path d="m13.5 4.5 2 2"/><path d="m4.5 13.5 2 2"/></svg>',
  note: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  search: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
  edit: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
  box: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
  telegram: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>',
  chart: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  doc: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  bill: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
  alert: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  chip: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>',
  wrench: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  cam: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
  print: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
  std: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>',
  cal: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>',
  stats: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 4 3 5-6"/><circle cx="7" cy="14" r="1.4" fill="currentColor" stroke="none"/><circle cx="11" cy="10" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="13" r="1.4" fill="currentColor" stroke="none"/><circle cx="20" cy="7" r="1.4" fill="currentColor" stroke="none"/></svg>',
  gear: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'
};

/* ---------- theme & lang ---------- */
function applyTheme() {
  const th = localStorage.getItem('zlift_theme') || 'light';
  document.documentElement.setAttribute('data-theme', th);
  $('#iconMoon').classList.toggle('hidden', th === 'dark');
  $('#iconSun').classList.toggle('hidden', th !== 'dark');
  const meta = document.getElementById('metaTheme');
  if (meta) meta.setAttribute('content', th === 'dark' ? '#0b1220' : '#2563eb');
}
/* offline indicator — everything keeps working (data is local), but sharing,
   Telegram and map links need a connection, so say so quietly */
function updateOnlineBadge() {
  const el = document.getElementById('offlineBadge');
  if (!el) return;
  const off = navigator.onLine === false;
  el.classList.toggle('hidden', !off);
  el.textContent = '📴 ' + t('offlineMode');
}
function applyLang() {
  document.documentElement.lang = LANG;
  document.documentElement.dir = I18N[LANG].dir;
  $('#langLabel').textContent = LANG === 'fa' ? 'EN' : 'فا';
  $$('[data-i18n]').forEach(el => { el.textContent = t(el.getAttribute('data-i18n')); });
  $$('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.getAttribute('data-i18n-ph')); });
}

/* ---------- UI back-stack (phone back button support) ----------
   Every overlay (modal / date picker / sidebar / diag step) registers a
   "layer". Pressing hardware back pops the top layer instead of leaving
   the app. Closing via UI removes the matching history entry. */
var uiStack = [];
var _ignorePop = 0;
function pushUiLayer(type, closeFn) {
  // opening a fresh first layer invalidates any stale compensating-back counters
  // (they belong to popstates that were lost to route changes — see race fix)
  if (uiStack.length === 0) _ignorePop = 0;
  uiStack.push({ type, close: closeFn });
  try { history.pushState({ zl: uiStack.length }, ''); } catch (e) {}
}
function popTaggedLayer(type) {
  // remove the topmost layer of this type that was closed via UI
  for (let i = uiStack.length - 1; i >= 0; i--) {
    if (uiStack[i].type === type) {
      const isTop = i === uiStack.length - 1;
      uiStack.splice(i, 1);
      if (isTop) { _ignorePop++; try { history.back(); } catch (e) {} }
      return true;
    }
  }
  return false;
}
window.addEventListener('popstate', () => {
  if (_ignorePop > 0) { _ignorePop--; return; }
  if (uiStack.length) {
    const layer = uiStack.pop();
    try { layer.close(); } catch (e) {}
  }
  // else: hash-route back — handled by the hashchange listener
});
/* safety net: if a modal/picker overlay exists but its stack entry was lost,
   clicking back must still close it (never trap the user) */
window.addEventListener('popstate', () => {
  setTimeout(() => {
    const hasOverlay = document.getElementById('modalOverlay') || document.getElementById('jdOverlay');
    if (hasOverlay && !uiStack.length) {
      _closeModalDom();
      if (typeof _closeJdateDom === 'function') _closeJdateDom();
    }
  }, 30);
});

/* ---------- modal ----------
   Accessible dialog: aria roles, focus moved in and restored on close, Tab is
   trapped inside, the page behind cannot scroll, and Enter inside a form runs
   the primary action instead of doing an implicit submit (which reloaded the
   whole app and lost the typed data). */
var FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
var _modalReturnFocus = null;
function _lockScroll(on) { document.body.classList.toggle('scroll-lock', !!on); }
function _closeModalDom() {
  $('#modalRoot').innerHTML = '';
  document.removeEventListener('keydown', escClose);
  if (!document.getElementById('jdOverlay')) _lockScroll(false);
  const back = _modalReturnFocus;
  _modalReturnFocus = null;
  if (back && document.contains(back)) { try { back.focus({ preventScroll: true }); } catch (e) {} }
}
function openModal(html, opts = {}) {
  const hadModal = !!document.getElementById('modalOverlay');
  if (!hadModal) _modalReturnFocus = document.activeElement;
  const keepFocus = _modalReturnFocus;
  _closeModalDom();
  _modalReturnFocus = keepFocus;
  const root = $('#modalRoot');
  root.innerHTML = `<div class="modal-overlay" id="modalOverlay"><div class="modal ${opts.size || ''}" role="dialog" aria-modal="true" aria-label="Z Lift">${html}</div></div>`;
  const box = root.querySelector('.modal');
  const head = box.querySelector('.modal-head h3');
  if (head) { head.id = 'modalTitle'; box.setAttribute('aria-labelledby', 'modalTitle'); box.removeAttribute('aria-label'); }
  $('#modalOverlay').addEventListener('mousedown', e => { if (e.target.id === 'modalOverlay') closeModal(); });
  document.addEventListener('keydown', escClose);
  _lockScroll(true);
  /* Enter anywhere in the form = the primary button (never an implicit submit) */
  box.querySelectorAll('form').forEach(f => {
    f.addEventListener('submit', e => {
      e.preventDefault();
      const primary = box.querySelector('.modal-foot .btn-primary:not([disabled])');
      if (primary) primary.click();
    });
  });
  /* keep Tab inside the dialog */
  box.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const items = [...box.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null || el === document.activeElement);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  /* move focus into the dialog — on phones don't pop the keyboard automatically */
  const wide = typeof matchMedia === 'function' && matchMedia('(min-width: 641px)').matches;
  const target = (wide && box.querySelector('input:not([readonly]):not([type="file"]), textarea, select')) ||
                 box.querySelector('.modal-foot .btn-primary') || box.querySelector('.modal-head .icon-btn');
  if (target) { try { target.focus({ preventScroll: true }); } catch (e) {} }
  if (!hadModal) pushUiLayer('modal', _closeModalDom);
}
function escClose(e) { if (e.key === 'Escape') closeModal(); }
function closeModal() {
  const had = !!document.getElementById('modalOverlay');
  _closeModalDom();
  if (had) popTaggedLayer('modal');
}
function confirmDialog(title, msg, onYes) {
  openModal(`
    <div class="modal-head"><h3>⚠️ ${esc(title)}</h3><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <div class="modal-body"><p style="font-size:14px;color:var(--text-2)">${esc(msg)}</p></div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-danger" id="confirmYes">${t('yesDelete')}</button>
    </div>`, { size: 'sm' });
  $('#confirmYes').onclick = onYes;
}

/* ---------- printing ----------
   One pipeline for every printable document (service report, invoice, monthly
   report, QR label): build the sheet, print it, then take it out of the DOM so
   nothing stale is left behind for the next print. */
function printDoc(html) {
  let sheet = document.getElementById('printSheet');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id = 'printSheet';
    sheet.className = 'print-sheet';
    document.body.appendChild(sheet);
  }
  sheet.dir = I18N[LANG].dir;
  sheet.innerHTML = html;
  const cleanup = () => {
    window.removeEventListener('afterprint', cleanup);
    const el = document.getElementById('printSheet');
    if (el) el.innerHTML = '';
  };
  window.addEventListener('afterprint', cleanup);
  setTimeout(cleanup, 60000);            // safety net for browsers without afterprint
  try { window.print(); } catch (e) { reportError(e, 'print'); }
}
/* shared header for printed documents */
function printHeader(subtitle) {
  const st = state.settings || {};
  return `<h1>🛗 ${esc(st.company || 'Z Lift')}</h1>
    <div class="ph-sub">${subtitle}${st.phone ? ' · ' + esc(st.phone) : ''}${st.address ? ' · ' + esc(st.address) : ''}</div>`;
}
/* ---------- file downloads ---------- */
function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}
/* Excel-friendly CSV (UTF-8 BOM + CRLF) */
function downloadCsv(filename, head, rows) {
  const cell = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const csv = '\ufeff' + [head, ...rows].map(r => r.map(cell).join(',')).join('\r\n');
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename);
}
/* paint long lists in chunks: the first screenful is instant even with hundreds
   of records, the rest is appended silently while the user scrolls */
function paintList(el, items, rowFn, chunk = 60) {
  if (!el) return;
  if (typeof IntersectionObserver !== 'function' || items.length <= chunk) {
    el.innerHTML = items.map(rowFn).join('');
    return;
  }
  el.innerHTML = items.slice(0, chunk).map(rowFn).join('');
  let i = chunk;
  const sentinel = document.createElement('div');
  sentinel.setAttribute('aria-hidden', 'true');
  sentinel.style.height = '1px';
  el.appendChild(sentinel);
  const io = new IntersectionObserver(entries => {
    if (!entries.some(e => e.isIntersecting)) return;
    if (!document.contains(sentinel)) { io.disconnect(); return; }
    sentinel.insertAdjacentHTML('beforebegin', items.slice(i, i + chunk).map(rowFn).join(''));
    i += chunk;
    if (i >= items.length) { io.disconnect(); sentinel.remove(); }
  }, { rootMargin: '600px' });
  io.observe(sentinel);
}

/* keywords used by the fault statistics (project profile + monthly report) */
var FAULT_WORDS = [
  ['درب', 'درب'], ['فتوسل', 'فتوسل'], ['ترمز', 'ترمز'], ['انکودر', 'انکودر'], ['درایو', 'درایو'],
  ['موتور', 'موتور'], ['بکسل', 'بکسل'], ['قفل', 'قفل درب'], ['روغن', 'روغن'], ['سیل', 'سیل جک'],
  ['شیر', 'شیرها'], ['پمپ', 'پمپ'], ['ریزش', 'ریزش'], ['همسطح', 'همسطح‌سازی'], ['برق', 'برق'],
  ['کنتاکتور', 'کنتاکتور'], ['لیمیت', 'لیمیت'], ['صدا', 'صدا'], ['لرزش', 'لرزش']
];
var FAULT_ICONS = { 'درب': '🚪', 'ترمز': '🛑', 'درایو': '🖥️', 'موتور': '⚙️', 'بکسل': '🔗', 'قفل درب': '🔒', 'روغن': '🛢️', 'همسطح‌سازی': '🎯', 'برق': '⚡', 'صدا': '🔊' };
function faultTally(services, icons) {
  const words = {};
  services.forEach(sv => {
    const txt = norm((sv.problem || '') + ' ' + (sv.diagnosis || '') + ' ' + (sv.complaint || ''));
    FAULT_WORDS.forEach(([w, lbl]) => { if (txt.includes(norm(w))) { const k = icons && icons[lbl] ? lbl + ' ' + icons[lbl] : lbl; words[k] = (words[k] || 0) + 1; } });
  });
  return Object.entries(words).sort((a, b) => b[1] - a[1]);
}

/* ---------- data loading ---------- */
async function loadAll(force) {
  if (state.projects && !force) return;
  const [p, s, n, c, pa, st, ds, cs, is_, tl, ph, inv, ct, rm, me, sl] = await Promise.all([
    api('/projects'), api('/services'), api('/notes'), api('/checklists'), api('/parts'), api('/settings'),
    api('/diagSessions'), api('/calcSaves'), api('/issues'), api('/tools'), api('/photos'), api('/invoices'), api('/contracts'),
    api('/reminders'), api('/measurements'), api('/safetyLogs')
  ]);
  state.projects = p.projects;
  state.services = s.services;
  state.notes = n.notes;
  state.checklists = c.checklists;
  state.parts = pa.parts;
  state.settings = st.settings;
  state.diagSessions = ds.items;
  state.calcSaves = cs.items;
  state.issues = is_.items;
  state.tools = tl.items;
  state.photos = ph.items;
  state.invoices = inv.items;
  state.contracts = ct.items;
  state.reminders = rm.reminders;
  state.measurements = me.items;
  state.safetyLogs = sl.items;
}

/* service-due calculation */
function dueInfo(p) {
  if (!p.serviceIntervalDays) return null;
  const svc = state.services.filter(s => s.projectId === p.id && (s.serviceType === 'maintenance' || s.serviceType === 'repair'));
  const last = svc.length ? Math.max(...svc.map(s => s.date)) : p.createdAt;
  const next = last + p.serviceIntervalDays * 86400000;
  const days = Math.round((next - Date.now()) / 86400000);
  return { last, next, days, overdue: days < 0, soon: days >= 0 && days <= 7 };
}
function projName(id) { const p = (state.projects || []).find(x => x.id === id); return p ? p.name : '—'; }
/* display target of a service: linked project name, or its own standalone customer/elevator */
function svcTarget(s) {
  if (s.projectId) { const p = (state.projects || []).find(x => x.id === s.projectId); if (p) return p.name; }
  return s.customer || s.elevatorInfo || '—';
}
function svcTargetSub(s) {
  if (s.projectId) return '';
  return s.elevatorInfo && s.customer ? s.elevatorInfo : '';
}
/* human-readable parts list: structured partsUsed if present, else legacy free text */
function svcPartsTextOf(s) {
  if (Array.isArray(s.partsUsed) && s.partsUsed.length) {
    return s.partsUsed.map(p => `${p.name} ×${faNum(p.qty)}`).join('، ');
  }
  return s.partsReplaced || '';
}
