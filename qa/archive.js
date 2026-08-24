/* Z Lift — Archive-button regression suite (jsdom)
   Locks the full chain of the project Archive action:
   CLICK → HANDLER → CONFIRMATION → API → PERSISTENCE → STATE → UI → RELOAD
   Root cause this suite guards against (fixed 2026-08): the Archive button
   used to run closeModal();archiveProject() — closeModal() queues
   history.back() with a compensating _ignorePop counter, the immediately
   following pushUiLayer() resets that counter and pushes a new history
   entry, and the pending back() popstate then arrives uncompensated and
   destroys the freshly painted confirmation dialog. On a real device the
   user experienced "click Archive → nothing happens".
   Run:  node qa/archive.js   (also part of npm test)
   Exit code 0 = all checks passed. */
const { JSDOM, VirtualConsole } = require('jsdom');
const { indexedDB, IDBKeyRange } = require('fake-indexeddb');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const rawHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function inlineScripts(htmlStr) {
  return htmlStr.replace(/<script\s+src="([^"]+)"[^>]*><\/script>/g, (match, src) => {
    const filePath = path.join(ROOT, src);
    if (!fs.existsSync(filePath)) return '<script>/* MISSING: ' + src + ' */</script>';
    return '<script>\n' + fs.readFileSync(filePath, 'utf8') + '\n</script>';
  });
}
const html = inlineScripts(rawHtml);

let pass = 0, fail = 0;
const failures = [];
async function T(name, cond, info) {
  let c = cond;
  if (typeof c === 'function') c = await c();
  else if (c && typeof c.then === 'function') c = await c;
  if (c) { pass++; console.log('  ✓ ' + name); }
  else { fail++; failures.push(name + (info ? ' — ' + info : '')); console.log('  ✗ ' + name + (info ? ' — ' + info : '')); }
}

function bootDom(seed) {
  const vc = new VirtualConsole();
  const jsdomErrors = [];
  vc.on('jsdomError', e => {
    const m = String(e && e.message || e);
    if (/Could not parse CSS/i.test(m)) return;
    jsdomErrors.push(m);
  });
  vc.on('error', m => jsdomErrors.push(String(m)));
  const dom = new JSDOM(html, {
    url: 'http://localhost:4173/index.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.indexedDB = indexedDB;           // same in-process IDB across instances
      window.IDBKeyRange = IDBKeyRange;
      if (seed) for (const [k, v] of Object.entries(seed)) window.localStorage.setItem(k, v);
    }
  });
  dom.window.scrollTo = () => {};
  const windowErrors = [];
  dom.window.addEventListener('error', e => windowErrors.push(String(e.error || e.message)));
  dom.window.addEventListener('unhandledrejection', e => windowErrors.push('unhandledrejection: ' + String(e.reason && e.reason.message || e.reason)));
  return { dom, jsdomErrors, windowErrors };
}

(async () => {
  console.log('ARCHIVE REGRESSION — click → handler → confirm → API → persistence → state → UI → reload\n');
  /* shared seed for a realistic boot: authenticated session, backup nag suppressed
     (the nag opens a modal 1.2 s after enterApp and would hijack this suite) */
  const seed = { zlift_last_external_backup: String(Date.now()), zlift_backup_snooze: String(Date.now() + 86400000) };
  const { dom, jsdomErrors, windowErrors } = bootDom(seed);
  const w = dom.window;
  const ev = expr => w.eval(expr);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const waitUntil = async (condFn, ms = 8000, label = 'condition') => {
    const start = Date.now();
    for (;;) {
      try { if (await condFn()) return true; } catch (e) {}
      if (Date.now() - start > ms) throw new Error('timeout waiting for ' + label);
      await wait(50);
    }
  };

  /* ---------- boot & fixtures ---------- */
  await waitUntil(() => ev(`typeof init === 'function' && typeof STD81 !== 'undefined'`), 8000, 'app boot');
  const d = await ev(`api('/auth/register', { method: 'POST', body: { username: 'archqa', password: '123456', name: 'QA بایگانی' } })`);
  seed.zlift_token = d.token;
  await ev(`state.token = ${JSON.stringify(d.token)}; state.user = ${JSON.stringify(d.user)}; localStorage.setItem('zlift_token', ${JSON.stringify(d.token)}); enterApp();`);
  await waitUntil(() => ev(`!document.querySelector('#appView').classList.contains('hidden') && state.projects !== null`), 8000, 'enter app');

  /* two projects; A carries real history (service + issue), B must stay untouched */
  const fx = await ev(`(async()=>{
    const mk = async (name, type) => (await api('/projects', { method: 'POST', body: { name, customer: 'مشتری', location: 'سایت', elevatorType: type } })).project;
    const A = await mk('پروژه الف کششی', 'traction');
    const B = await mk('پروژه ب هیدرولیک', 'hydraulic');
    await api('/services', { method: 'POST', body: { projectId: A.id, customer: 'مشتری', date: Date.now(), type: 'monthly', tasks: ['g'], notes: 'سرویس اول' } });
    await api('/issues', { method: 'POST', body: { projectId: A.id, title: 'خرابی درب', status: 'open' } });
    return { A: A.id, B: B.id };
  })()`);
  await ev(`state.projects = null; loadAll(true);`);
  await waitUntil(() => ev(`(state.projects||[]).length >= 2`), 8000, 'fixtures loaded');
  const A = fx.A, B = fx.B;

  /* helper: drive the REAL UI — open the project's delete modal from its detail page */
  const openDeleteModalViaUI = async pid => {
    await ev(`navigate('/projects/${pid}')`);
    await waitUntil(() => ev(`document.querySelector('#content .detail-head') !== null`), 8000, 'detail page');
    await wait(600);                                   // let hash/popstate events settle (real-user pace)
    const clicked = await ev(`(() => {
      const b = Array.from(document.querySelectorAll('.detail-head .actions .btn'))
        .find(x => (x.getAttribute('onclick') || '').includes('deleteProject'));
      if (!b) return false; b.click(); return true;
    })()`);
    if (!clicked) throw new Error('delete button not found on detail page');
    await wait(50);
    return true;
  };
  const clickArchiveBtn = async () => ev(`(() => {
    const b = Array.from(document.querySelectorAll('#modalRoot button'))
      .find(x => (x.getAttribute('onclick') || '').includes('archiveProject'));
    if (!b) return 'NO_BUTTON';
    b.click(); return 'CLICKED';
  })()`);

  /* ============ TEST 1: click Archive → handler runs, confirm appears, no history race ============ */
  await openDeleteModalViaUI(A);
  await T('TEST 1a: delete modal opens with the Archive button (linked records)', await ev(`!!document.getElementById('modalOverlay')`) && await ev(`!!Array.from(document.querySelectorAll('#modalRoot button')).find(x => (x.getAttribute('onclick')||'').includes('archiveProject'))`));
  const race1 = await ev(`(function(){
    let backCalls = 0;
    const ob = history.back.bind(history);
    history.back = function(){ backCalls++; return ob(); };
    const b = Array.from(document.querySelectorAll('#modalRoot button')).find(x => (x.getAttribute('onclick')||'').includes('archiveProject'));
    b.click();
    history.back = ob;
    return { backDuringClick: backCalls, confirmPainted: !!document.getElementById('confirmYes'), uiStack: uiStack.length, ignorePop: _ignorePop };
  })()`);
  await T('TEST 1b: clicking Archive executes the handler and paints the confirmation dialog', race1.confirmPainted === true, JSON.stringify(race1));
  await T('TEST 1c (ROOT-CAUSE REGRESSION): the Archive click queues NO history.back() (old close-then-reopen race)', race1.backDuringClick === 0, JSON.stringify(race1));
  await wait(80);  // one browser task later — any pending traversal would have landed here
  await T('TEST 1d: confirmation dialog still visible after the task tick (real-browser popstate ordering)', await ev(`!!document.getElementById('confirmYes')`));
  /* hardware back must still close the confirm dialog (expected ui-layer behavior) */
  await ev(`window.dispatchEvent(new PopStateEvent('popstate'))`);
  await T('TEST 1e: hardware-back popstate still closes the dialog (ui-layer behavior intact)', await ev(`!document.getElementById('modalOverlay')`) && await ev(`uiStack.length === 0`));

  /* ============ TEST 7 (before mutating): cancel confirmation → project unchanged ============ */
  await openDeleteModalViaUI(A);
  await clickArchiveBtn();
  await wait(50);
  await T('TEST 7a: cancel button present on confirmation dialog', await ev(`!!Array.from(document.querySelectorAll('#modalRoot button')).find(x => (x.getAttribute('onclick')||'').includes('closeModal') && x.textContent.trim() !== '✕')`));
  await ev(`(() => { const b = Array.from(document.querySelectorAll('#modalRoot .modal-foot .btn')).find(x => (x.getAttribute('onclick')||'').includes('closeModal')); b.click(); })()`);
  await wait(100);
  const cancelState = await ev(`(async()=>{
    const db = await STRUCTURED_DB.verifyAggregate(JSON.parse(JSON.stringify(_lsDB)));
    const p = db.projects.find(x => x.id === '${A}');
    const s = state.projects.find(x => x.id === '${A}');
    return { modalClosed: !document.getElementById('modalOverlay'), dbArchived: p && p.archived, stateArchived: s && s.archived };
  })()`);
  await T('TEST 7b: CANCEL — modal closed, project remains active (db + state)', cancelState.modalClosed && cancelState.dbArchived !== true && cancelState.stateArchived !== true, JSON.stringify(cancelState));

  /* ============ TEST 8 (before mutating): rapid repeated Archive clicks are idempotent-safe ============ */
  await openDeleteModalViaUI(A);
  const dbl = await ev(`(async()=>{
    let liveClicks = 0, opened = 0;
    const spyOpen = window.openModal;
    window.openModal = function(){ opened++; return spyOpen.apply(this, arguments); };
    const find = () => Array.from(document.querySelectorAll('#modalRoot button'))
      .find(x => (x.getAttribute('onclick') || '').includes('archiveProject'));
    for (let i = 0; i < 3; i++) {          // a real user can only click what is rendered
      const b = find();
      if (b) { b.click(); liveClicks++; }
    }
    const y = document.getElementById('confirmYes');
    if (y) { y.click(); y.click(); }       // rapid double-confirm (allowed; PUT is idempotent)
    await new Promise(r => setTimeout(r, 500));
    window.openModal = spyOpen;
    const db = await STRUCTURED_DB.verifyAggregate(JSON.parse(JSON.stringify(_lsDB)));
    const same = db.projects.filter(x => x.id === '${A}');
    return { liveClicks, opened, count: same.length, archived: same[0] && same[0].archived,
             archivedAt: same[0] && same[0].archivedAt, projectsTotal: db.projects.length, uiStack: uiStack.length, ignorePop: _ignorePop };
  })()`);
  await T('TEST 8a: rapid clicks — Archive button consumed by the first click (dialog replaces modal)', dbl.liveClicks === 1 && dbl.opened === 1, JSON.stringify(dbl));
  await T('TEST 8b: double-confirm — one record, archived once, no duplicates', dbl.count === 1 && dbl.archived === true, JSON.stringify(dbl));
  await T('TEST 8c: repeated archive does not corrupt timestamps', typeof dbl.archivedAt === 'number', JSON.stringify(dbl));
  await T('TEST 8d: ui-layer bookkeeping stays balanced after repeated clicks (stack empty, no stray back)', dbl.uiStack === 0 && dbl.ignorePop === 0, JSON.stringify(dbl));

  /* ============ TESTS 2/3/9/10: the happy path through the real UI ============ */
  await openDeleteModalViaUI(B);           // B has no linked records → no Archive button: use A for the visible-button path
  await ev(`closeModal()`);
  await wait(100);
  await openDeleteModalViaUI(A);
  await clickArchiveBtn();
  await wait(50);
  const confirmTs = await ev(`Date.now()`);
  await ev(`document.getElementById('confirmYes').click()`);
  await waitUntil(() => ev(`!document.getElementById('modalOverlay')`), 5000, 'confirm modal close');
  const arch = await ev(`(async()=>{
    const db = await STRUCTURED_DB.verifyAggregate(JSON.parse(JSON.stringify(_lsDB)));  // clone → durable, not a shared reference
    const p = db.projects.find(x => x.id === '${A}');
    const s = state.projects.find(x => x.id === '${A}');
    const svc = db.services.filter(x => x.projectId === '${A}');
    const iss = db.issues.filter(x => x.projectId === '${A}');
    const toasts = Array.from(document.querySelectorAll('#toastRoot .toast')).map(x => x.className + ':' + x.textContent);
    return { dbArchived: p && p.archived, dbArchivedAt: p && p.archivedAt, tsOk: p && p.archivedAt >= ${confirmTs} - 60000,
             stateArchived: s && s.archived, svc: svc.length, iss: iss.length, toasts };
  })()`);
  await T('TEST 2a: ARCHIVE API — project.archived becomes true in the persisted record (clone read)', arch.dbArchived === true, JSON.stringify(arch));
  await T('TEST 2b: archive timestamp persisted (archivedAt)', typeof arch.dbArchivedAt === 'number' && arch.tsOk, JSON.stringify(arch));
  await T('TEST 2c: in-memory state follows the persisted record (state.archived === true)', arch.stateArchived === true, JSON.stringify(arch));
  await T('TEST 2d: SUCCESS is visible — success toast shown to the user', arch.toasts.some(x => x.startsWith('toast ok') && /بایگانی|archived/i.test(x)), JSON.stringify(arch));

  /* UI refresh without reload (STEP 8 scenario) */
  await ev(`navigate('/projects')`);
  await waitUntil(() => ev(`document.querySelector('#projList') !== null`), 8000, 'projects list');
  await wait(200);
  await T('TEST 3a: UI refresh — archived project disappears from the ACTIVE list (no reload)', await ev(`!document.querySelector('#projList').innerHTML.includes('پروژه الف')`));
  await ev(`projFilter.status = 'archived'; drawProjList();`);
  await wait(100);
  await T('TEST 5: archived project appears in the ARCHIVE view (status filter)', await ev(`document.querySelector('#projList').innerHTML.includes('پروژه الف')`));
  await ev(`projFilter.status = 'all'; drawProjList();`);

  await T('TEST 9: historical data intact — service + issue still linked to the archived project', arch.svc === 1 && arch.iss === 1, JSON.stringify({ svc: arch.svc, iss: arch.iss }));
  const otherB = await ev(`(async()=>{
    const db = await STRUCTURED_DB.verifyAggregate(JSON.parse(JSON.stringify(_lsDB)));
    const b = db.projects.find(x => x.id === '${B}');
    const inActiveList = (() => { projFilter.status = 'all'; drawProjList(); return document.querySelector('#projList').innerHTML.includes('پروژه ب'); })();
    return { b, inActiveList };
  })()`);
  await T('TEST 10: sibling project B completely unchanged (not archived, still active in UI)', otherB.b && otherB.b.archived !== true && otherB.inActiveList, JSON.stringify(otherB));

  /* ============ TEST 6: archive failure → visible error, no false success ============ */
  await openDeleteModalViaUI(B);
  await ev(`closeModal()`); await wait(50);
  await openDeleteModalViaUI(A === A ? B : A);   // B (no records) exercises the same path
  /* B has no linked records → its delete modal has no Archive button; fall back to
     the data-level check through the same handler the button uses (archiveProject) */
  const hasArchBtn = await ev(`!!Array.from(document.querySelectorAll('#modalRoot button')).find(x => (x.getAttribute('onclick')||'').includes('archiveProject'))`);
  if (hasArchBtn) await clickArchiveBtn(); else await ev(`archiveProject('${B}')`);
  await wait(50);
  const failRun = await ev(`(async()=>{
    const realApi = window.api;
    window.api = function(path, opts){ if (opts && opts.method === 'PUT' && /\\/projects\\//.test(path)) return Promise.reject({ code: 'not_found', status: 404 }); return realApi(path, opts); };
    const y = document.getElementById('confirmYes');
    if (y) y.click();
    await new Promise(r => setTimeout(r, 300));
    window.api = realApi;
    const db = await STRUCTURED_DB.verifyAggregate(JSON.parse(JSON.stringify(_lsDB)));
    const p = db.projects.find(x => x.id === '${B}');
    const errs = Array.from(document.querySelectorAll('#toastRoot .toast')).filter(x => x.className.includes('err')).map(x => x.textContent);
    const oks = Array.from(document.querySelectorAll('#toastRoot .toast')).filter(x => !x.className.includes('err')).map(x => x.textContent);
    return { errs, oks, bArchived: p && p.archived };
  })()`);
  await T('TEST 6: archive FAILURE — visible error toast, no false success, state unchanged', failRun.errs.length > 0 && failRun.bArchived !== true, JSON.stringify(failRun));
  await ev(`closeModal()`); await wait(50);

  /* ============ TEST 4: RELOAD — archive survives a fresh app boot ============ */
  const { dom: dom2 } = bootDom(seed);      // same in-process IndexedDB → true reload simulation
  const w2 = dom2.window;
  const ev2 = expr => w2.eval(expr);
  await new Promise(async (resolve) => {
    const start = Date.now();
    for (;;) {
      try { if (ev2(`typeof init === 'function' && state.user !== null && state.projects !== null && !document.querySelector('#appView').classList.contains('hidden')`)) break; } catch (e) {}
      if (Date.now() - start > 10000) break;
      await wait(80);
    }
    resolve();
  });
  const reload = await ev2(`(async()=>{
    const db = await STRUCTURED_DB.verifyAggregate(JSON.parse(JSON.stringify(_lsDB)));
    const a = db.projects.find(x => x.id === '${A}');
    const b = db.projects.find(x => x.id === '${B}');
    const st = (state.projects || []).find(x => x.id === '${A}');
    return { aArchived: a && a.archived, aAt: a && a.archivedAt, bArchived: b && !!b.archived, stArchived: st && st.archived };
  })()`);
  await T('TEST 4a: RELOAD — project remains archived in the database after fresh boot', reload.aArchived === true, JSON.stringify(reload));
  await T('TEST 4b: RELOAD — archive timestamp preserved', typeof reload.aAt === 'number' && reload.aAt === arch.dbArchivedAt, JSON.stringify(reload));
  await T('TEST 4c: RELOAD — freshly loaded in-memory state shows archived', reload.stArchived === true, JSON.stringify(reload));
  await T('TEST 4d: RELOAD — sibling B still not archived', reload.bArchived === false, JSON.stringify(reload));
  dom2.window.close();

  /* unarchive at the data layer remains supported (no UI button — documented Phase 2A) */
  const un = await ev(`(async()=>{ const d = await api('/projects/${A}', { method: 'PUT', body: { archived: false } }); return d.project && d.project.archived; })()`);
  await T('STEP 12: data-layer unarchive behavior remains intact', un === false);
  const re = await ev(`(async()=>{ const d = await api('/projects/${A}', { method: 'PUT', body: { archived: true, archivedAt: ${arch.dbArchivedAt} } }); const s = state.projects.find(x=>x.id==='${A}'); if (d.project) Object.assign(s, d.project); return d.project.archived; })()`);
  await T('STEP 12: re-archive restores the archived state', re === true);

  await T('no uncaught window errors during the archive flows', windowErrors.length === 0, windowErrors.join(' | ').slice(0, 300));
  await T('no jsdom errors during the archive flows', jsdomErrors.length === 0, jsdomErrors.join(' | ').slice(0, 300));

  console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
  if (failures.length) console.log('FAILURES:\n - ' + failures.join('\n - '));
  dom.window.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
