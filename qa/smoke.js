/* Z Lift — end-to-end smoke test (jsdom)
   Loads the real index.html, registers a user through the app's own
   localStorage API, renders every route, exercises the EN 81-20
   standards module, calculators, checklist flow and field checks.
   Run:  npm install && npm test        (from repo root)
   Exit code 0 = all checks passed. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
async function T(name, cond, info) {
  let c = cond;
  if (typeof c === 'function') c = await c();      // lazy: allow async evaluation
  else if (c && typeof c.then === 'function') c = await c; // promise conditions are awaited
  if (c) { pass++; console.log('  ✓ ' + name); }
  else { fail++; failures.push(name + (info ? ' — ' + info : '')); console.log('  ✗ ' + name + (info ? ' — ' + info : '')); }
}

(async () => {
  const vc = new VirtualConsole();
  const jsdomErrors = [];
  vc.on('jsdomError', e => {
    const m = String(e && e.message || e);
    if (/Could not parse CSS/i.test(m)) return; // jsdom can't parse some modern CSS — ignore
    jsdomErrors.push(m);
  });
  vc.on('error', m => jsdomErrors.push(String(m)));

  const dom = new JSDOM(html, {
    url: 'http://localhost:4173/index.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc
  });
  const w = dom.window;
  w.scrollTo = () => {}; // jsdom lacks scrollTo; app uses it after diag navigation
  const windowErrors = [];
  w.addEventListener('error', e => windowErrors.push(String(e.error || e.message)));
  w.addEventListener('unhandledrejection', e => windowErrors.push('unhandledrejection: ' + String(e.reason && e.reason.message || e.reason)));

  const ev = expr => w.eval(expr);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const waitUntil = async (condFn, ms = 8000, label = 'condition') => {
    const start = Date.now();
    for (;;) {
      try { if (await condFn()) return true; } catch (e) {}
      if (Date.now() - start > ms) throw new Error('timeout waiting for ' + label);
      await wait(60);
    }
  };
  const waitLoaded = () => waitUntil(() => ev(`document.querySelector('#content').innerHTML.length > 0 && !document.querySelector('#content').innerHTML.includes('page-loading')`), 8000, 'page render');

  try {
    /* ---------- boot ---------- */
    await waitUntil(() => ev(`typeof init === 'function' && typeof STD81 !== 'undefined'`), 8000, 'app boot');
    await T('app boots (init + data constants defined)', true);

    /* ---------- register & enter ---------- */
    const d = await ev(`api('/auth/register', { method: 'POST', body: { username: 'qatester', password: '123456', name: 'تکنسین QA' } })`);
    await T('register via app api', d && d.token && d.user && d.user.name === 'تکنسین QA');
    await ev(`state.token = ${JSON.stringify(d.token)}; state.user = ${JSON.stringify(d.user)}; localStorage.setItem('zlift_token', ${JSON.stringify(d.token)}); localStorage.setItem('zlift_last_backup', String(Date.now())); enterApp();`);
    await waitUntil(() => ev(`document.querySelector('#appView') && !document.querySelector('#appView').classList.contains('hidden')`), 8000, 'enter app');
    await T('entered app shell', true);
    await waitLoaded();

    /* ---------- render every route ---------- */
    const routes = [
      '/dashboard', '/projects', '/services', '/parts', '/checklists', '/calculations',
      '/diagnostics', '/vvvf', '/knowledge', '/tools', '/notes', '/calendar', '/invoices',
      '/contracts', '/report', '/analytics', '/standards'
    ];
    for (const route of routes) {
      await ev(`navigate('${route}')`);
      await waitLoaded();
      const errs = windowErrors.length;
      await T('route renders without error: ' + route, errs === 0, 'window errors: ' + errs);
    }
    await T('page title for /standards', () => ev(`document.querySelector('#pageTitle').textContent === 'استانداردها'`), await ev(`document.querySelector('#pageTitle').textContent`));

    /* ---------- standards module interactions ---------- */
    await ev(`navigate('/standards')`); await waitLoaded();
    await T('standards cards rendered (UCMP present)', () => ev(`document.querySelector('#stdList').innerHTML.includes('s-ucmp')`));
    await ev(`stdQuery = 'قفل درب'; drawStd();`);
    await T('search «قفل درب» filters to lock items', () => ev(`document.querySelector('#stdList').innerHTML.includes('s-door-lock') && !document.querySelector('#stdList').innerHTML.includes('s-ucmp')`));
    await ev(`stdQuery = ''; stdCat = 'hyd'; drawStd();`);
    await T('category «هیدرولیک» shows relief valve', () => ev(`document.querySelector('#stdList').innerHTML.includes('s-hyd-relief') && !document.querySelector('#stdList').innerHTML.includes('s-brake')`));
    await ev(`openStdArticle('s-ucmp');`);
    await T('std article modal opens with clause', () => ev(`document.querySelector('#modalRoot').innerHTML.includes('5.6.7')`));
    await ev(`closeModal(); stdQuery = ''; stdCat = 'all'; drawStd();`);

    /* ---------- calculators ---------- */
    await ev(`navigate('/calculations')`); await waitLoaded();
    await ev(`calcFilter.cat = 'std'; renderCalculations();`);
    await T('EN 81-20 calculator category filters', () => ev(`document.querySelector('#content').innerHTML.includes('std-gov') && document.querySelector('#content').innerHTML.includes('std-buffer') && document.querySelector('#content').innerHTML.includes('std-headroom')`));
    await ev(`computeCalc(CALCULATORS.find(c => c.id === 'std-gov'));`);
    await T('governor calc computes (1.15 m/s @ default 1 m/s)', () => ev(`document.querySelector('#calcResult_std-gov').innerHTML.includes('1.15')`));
    await ev(`computeCalc(CALCULATORS.find(c => c.id === 'std-buffer'));`);
    await T('buffer calc computes (135 mm)', () => ev(`document.querySelector('#calcResult_std-buffer').innerHTML.includes('135')`));
    await ev(`computeCalc(CALCULATORS.find(c => c.id === 'std-headroom'));`);
    await T('headroom calc computes (1.035 m)', () => ev(`document.querySelector('#calcResult_std-headroom').innerHTML.includes('1.035')`));
    await ev(`calcFilter.cat = 'all'; renderCalculations();`); // all cards live
    let calcFails = 0;
    const calcIds = await ev(`CALCULATORS.map(c => c.id)`);
    for (const id of calcIds) {
      const ok = await ev(`(() => { try { computeCalc(CALCULATORS.find(c => c.id === '${id}')); return true; } catch (e) { return String(e && e.message || e); } })()`);
      if (ok !== true) { calcFails++; failures.push('calculator ' + id + ' throws: ' + ok); }
    }
    await T('all ' + calcIds.length + ' calculators compute without exception', calcFails === 0, calcFails + ' failed');

    /* ---------- checklist: EN 81-20 audit flow ---------- */
    const projT = await ev(`api('/projects', { method: 'POST', body: { name: 'برج کششی QA', elevatorType: 'traction', capacityKg: 630, persons: 8, floors: 8, stops: 8, speed: 1 } })`);
    const projH = await ev(`api('/projects', { method: 'POST', body: { name: 'ویلا هیدرولیک QA', elevatorType: 'hydraulic', capacityKg: 400, persons: 5, floors: 4, stops: 4, speed: 0.5 } })`);
    await T('projects created', !!(projT && projT.project && projH && projH.project));
    const pidT = projT.project.id, pidH = projH.project.id;
    await ev(`state.projects = null; loadAll(true);`);

    await ev(`navigate('/projects/${pidT}')`); await waitLoaded();
    await T('audit checklist available on traction project', () => ev(`document.querySelector('#content').innerHTML.includes('en81-safety-audit')`));
    await ev(`navigate('/projects/${pidH}')`); await waitLoaded();
    await T('audit checklist available on hydraulic project (type both)', () => ev(`document.querySelector('#content').innerHTML.includes('en81-safety-audit')`));

    await ev(`navigate('/checklists/en81-safety-audit?project=${pidT}')`); await waitLoaded();
    await T('audit checklist detail renders 32 items', () => ev(`document.querySelectorAll('#content .check-item[data-item]').length === 32`));
    await ev(`document.querySelector('#content .check-item[data-item="e1"]').onclick();`);
    await T('item state cycles to pass', () => ev(`document.querySelector('#content .check-item[data-item="e1"]').className.includes('ci-pass')`));
    await ev(`document.querySelector('#content .check-item[data-item="e1"]').onclick();`);
    await T('item state cycles to fail + failed box appears', () => ev(`document.querySelector('#content .check-item[data-item="e1"]').className.includes('ci-fail') && document.querySelector('#chFailedBox').innerHTML.includes('درگیری قفل درب طبقه')`));
    await wait(900); // debounced save (500 ms)
    const found = await ev(`api('/checklists').then(r => r.checklists.find(x => x.projectId === ${JSON.stringify(pidT)} && x.templateId === 'en81-safety-audit'))`);
    await T('checklist saved with fail state (real id, no tmp)', !!(found && found.checked && found.checked.e1 === 'fail' && found.id !== 'tmp'), JSON.stringify(found).slice(0, 200));

    await ev(`navigate('/checklists/en81-safety-audit?project=${pidH}')`); await waitLoaded();
    await T('audit detail opens for hydraulic project', () => ev(`document.querySelectorAll('#content .check-item[data-item]').length === 32`));
    await ev(`document.querySelector('#content .check-item[data-item="e27"]').onclick();`);
    await T('hydraulic item toggles on hydraulic project', () => ev(`document.querySelector('#content .check-item[data-item="e27"]').className.includes('ci-pass')`));

    /* ---------- measurement engine: EN 81-20 field checks ---------- */
    const msgs = await ev(`evalMeasures([{ id: 'door_force', value: 180 }, { id: 'door_gap', value: 7 }, { id: 'lock_eng', value: 5 }, { id: 'v_rated', value: 1 }, { id: 'v_gov', value: 1.05 }])`);
    await T('field check: door force 180 N flagged', msgs.some(m => m.text.includes('نیروی بستن') && m.ok === false));
    await T('field check: lock 5 mm flagged', msgs.some(m => m.text.includes('قفل') && m.ok === false));
    await T('field check: governor below 115% flagged', msgs.some(m => m.text.includes('گاورنر') && m.ok === false));
    const okMsgs = await ev(`evalMeasures([{ id: 'door_force', value: 120 }, { id: 'lock_eng', value: 8 }, { id: 'v_rated', value: 1 }, { id: 'v_gov', value: 1.2 }])`);
    await T('field check: compliant values pass', okMsgs.every(m => m.ok === true), JSON.stringify(okMsgs.map(m => m.text)));

    /* ---------- EN mode ---------- */
    await ev(`LANG = 'en'; applyLang(); navigate('/standards');`);
    await waitLoaded();
    await T('standards page works in English', () => ev(`document.querySelector('#content').innerHTML.includes('Unintended car movement')`));
    await ev(`LANG = 'fa'; applyLang();`);

    /* ---------- every diagnostic flow walks end-to-end ---------- */
    const flows = await ev(`DIAG_FLOWS.map(f => f.id)`);
    let flowFails = 0;
    for (const fid of flows) {
      const walk = await ev(`(() => {
        try {
          startDiagFlow('${fid}');
          const f = DIAG_FLOWS.find(x => x.id === '${fid}');
          let steps = 0, cur = f.start, max = Object.keys(f.nodes).length + 2;
          while (cur && f.nodes[cur] && f.nodes[cur].opts && steps < max) {
            const nxt = f.nodes[cur].opts[0].n;
            if (!nxt || nxt === cur) break;
            diagAnswer(nxt);
            cur = nxt; steps++;
          }
          diagSession = null;
          return steps;
        } catch (e) { return 'ERR: ' + String(e && e.message || e); }
      })()`);
      if (typeof walk !== 'number') { flowFails++; failures.push('flow ' + fid + ' throws: ' + walk); }
    }
    await T('all ' + flows.length + ' diagnostic flows walk without exception', flowFails === 0, flowFails + ' failed');
    await ev(`diagSession = null; navigate('/dashboard');`); await waitLoaded();

    /* ---------- every knowledge article opens ---------- */
    const kbIds = await ev(`KNOWLEDGE.map(k => k.id)`);
    let kbFails = 0;
    for (const kid of kbIds) {
      const ok = await ev(`(() => { try { openKbArticle('${kid}'); return document.querySelector('#modalRoot').innerHTML.length > 100; } catch (e) { return false; } })()`);
      if (!ok) { kbFails++; failures.push('kb article ' + kid + ' fails to open'); }
      await ev(`closeModal();`);
    }
    await T('all ' + kbIds.length + ' knowledge articles open without exception', kbFails === 0, kbFails + ' failed');

    /* ---------- i18n key coverage ---------- */
    const missingKeys = await ev(`(() => {
      const src = document.querySelector('script').textContent;
      const keys = new Set();
      for (const m of src.matchAll(/(?<![A-Za-z0-9_])t\\('([a-zA-Z0-9]+)'\\)/g)) keys.add(m[1]);
      for (const m of src.matchAll(/key: '([a-zA-Z0-9]+)'/g)) keys.add(m[1]);
      return [...keys].filter(k => !I18N.fa[k] || !I18N.en[k]);
    })()`);
    await T('all i18n keys defined in fa & en', missingKeys.length === 0, 'missing: ' + missingKeys.join(', '));

    /* ---------- data integrity ---------- */
    const integrity = await ev(`(() => {
      const errs = [];
      const uniq = (arr, what) => { const seen = new Set(); arr.forEach(x => { if (seen.has(x.id)) errs.push(what + ': duplicate id ' + x.id); seen.add(x.id); }); };
      uniq(STD81, 'STD81'); uniq(CALCULATORS, 'CALCULATORS'); uniq(CHECKLIST_TEMPLATES, 'CHECKLIST_TEMPLATES'); uniq(DIAG_FLOWS, 'DIAG_FLOWS');
      STD81.forEach(s => { if (!s.clause || !s.title.fa || !s.vals || !s.vals.length) errs.push('STD81 bad entry: ' + s.id); });
      CHECKLIST_TEMPLATES.forEach(t => {
        const seen = new Set();
        t.groups.forEach(g => g.items.forEach(it => { if (seen.has(it.id)) errs.push(t.id + ': duplicate item ' + it.id); seen.add(it.id); if (!it.fa) errs.push(t.id + ': item ' + it.id + ' missing fa'); }));
      });
      return errs;
    })()`);
    await T('data integrity: unique ids & required fields', integrity.length === 0, integrity.join(' | '));

    /* ---------- service calendar & reminders ---------- */
    await ev(`navigate('/calendar')`); await waitLoaded();
    await T('calendar page title set', () => ev(`document.querySelector('#pageTitle').textContent === 'تقویم سرویس'`), await ev(`document.querySelector('#pageTitle').textContent`));
    await T('calendar grid rendered', () => ev(`document.querySelector('#calGrid') && document.querySelector('#calGrid').children.length > 27`));
    await T('calendar header shows Jalali month/year', () => ev(`document.querySelector('#calHeader').textContent.trim().length > 0`));
    await T('calendar shows 7 Persian weekday labels', () => ev(`document.querySelectorAll('.cal-week span').length === 7`));

    const projC = await ev(`api('/projects', { method: 'POST', body: { name: 'برج کالندر QA', elevatorType: 'traction', capacityKg: 630, persons: 8, floors: 8, stops: 8, speed: 1, serviceIntervalDays: 30 } })`);
    await T('calendar test project created', !!projC.project);
    await ev(`state.projects = null; state.services = null; loadAll(true);`);
    await T('periodic reminder derived from service interval', () => ev(`buildReminders().filter(r => r.kind === 'periodic').length >= 2`));
    await T('periodic reminder flagged "soon" within 7 days', () => ev(`buildReminders().some(r => r.kind === 'periodic' && r.soon && !r.overdue)`));

    await ev(`api('/services', { method: 'POST', body: { projectId: ${JSON.stringify(pidT)}, technician: 'QA', serviceType: 'repair', problem: 'x', diagnosis: 'y', workDone: 'z', partsReplaced: '-', finalStatus: 'followup', followUpDate: Date.now() + 3 * 86400000 } })`);
    await ev(`state.services = null; loadAll(true);`);
    await T('followup reminder derived from service followUpDate', () => ev(`buildReminders().some(r => r.kind === 'followup' && r.soon && !r.overdue)`));
    await ev(`api('/services', { method: 'POST', body: { projectId: ${JSON.stringify(pidH)}, technician: 'QA', serviceType: 'maintenance', problem: 'x', diagnosis: 'y', workDone: 'z', partsReplaced: '-', finalStatus: 'followup', followUpDate: Date.now() - 2 * 86400000 } })`);
    await ev(`state.services = null; loadAll(true);`);
    await T('overdue followup reminder flagged', () => ev(`buildReminders().some(r => r.kind === 'followup' && r.overdue)`));
    await T('reminders sorted ascending by due date', () => ev(`(() => { const r = buildReminders(); for (let i = 1; i < r.length; i++) if (r[i].due < r[i-1].due) return false; return true; })()`));

    const rmA = await ev(`api('/reminders', { method: 'POST', body: { title: 'یادآوری تست کالندر', due: Date.now() + 5 * 86400000, kind: 'custom' } })`);
    await T('custom reminder created', !!(rmA && rmA.reminder && rmA.reminder.id));
    await ev(`state.reminders = null; loadAll(true);`);
    await T('custom reminder appears in active list', () => ev(`buildReminders().some(r => r.reminderId === ${JSON.stringify(rmA.reminder.id)})`));
    const rmUpd = await ev(`api('/reminders/${rmA.reminder.id}', { method: 'PUT', body: { title: 'یادآوری ویرایش‌شده' } })`);
    await T('reminder title edited', rmUpd.reminder.title === 'یادآوری ویرایش‌شده');
    const rmB = await ev(`api('/reminders', { method: 'POST', body: { title: 'حذف‌شود', due: Date.now() + 9 * 86400000, kind: 'custom' } })`);
    await ev(`api('/reminders/${rmB.reminder.id}', { method: 'DELETE' })`);
    await ev(`state.reminders = null; loadAll(true);`);
    await T('reminder deleted', () => ev(`!(state.reminders || []).some(r => r.id === ${JSON.stringify(rmB.reminder.id)})`));
    const rmC = await ev(`api('/reminders', { method: 'POST', body: { title: 'انجام‌شود', due: Date.now() + 6 * 86400000, kind: 'custom' } })`);
    await ev(`api('/reminders/${rmC.reminder.id}', { method: 'PUT', body: { done: true } })`);
    await ev(`state.reminders = null; loadAll(true);`);
    await T('done reminder removed from active list', () => ev(`!buildReminders().some(r => r.reminderId === ${JSON.stringify(rmC.reminder.id)})`));
    const rmBad = await ev(`api('/reminders', { method: 'POST', body: { title: '   ' } }).then(() => 'ok').catch(e => e.code)`);
    await T('empty reminder title rejected', rmBad === 'name_required', String(rmBad));

    await ev(`navigate('/calendar')`); await waitLoaded();
    await T('reminder list renders custom reminder', () => ev(`document.querySelector('#reminderList').innerHTML.includes('یادآوری ویرایش‌شده')`));
    const todayJ = await ev(`tsToJalali(Date.now())`);
    await ev(`api('/services', { method: 'POST', body: { projectId: ${JSON.stringify(pidT)}, technician: 'QA', serviceType: 'maintenance', date: jalaliToTs(${todayJ.jy}, ${todayJ.jm}, ${todayJ.jd}), problem: 'x', diagnosis: 'y', workDone: 'z', partsReplaced: '-', finalStatus: 'ok' } })`);
    await ev(`state.services = null; loadAll(true);`);
    await ev(`calState = { jy: ${todayJ.jy}, jm: ${todayJ.jm} }; navigate('/calendar')`); await waitLoaded();
    await ev(`calPickDay(${todayJ.jd})`);
    await T('calendar day pick shows services', () => ev(`document.querySelector('#calDayDetail [data-cal="services"]') !== null`));
    await T('calendar day pick shows no-events for empty day', () => ev(`(() => { const j = tsToJalali(Date.now()); calState = { jy: j.jy, jm: j.jm }; drawCalendar(); const used = new Set(); (state.services||[]).forEach(s => { const jj = tsToJalali(s.date); if (jj.jy===j.jy && jj.jm===j.jm) used.add(jj.jd); }); buildReminders().forEach(r => { const jj = tsToJalali(r.due); if (jj.jy===j.jy && jj.jm===j.jm) used.add(jj.jd); }); let d = 1; while (used.has(d) && d < 31) d++; calPickDay(d); return !used.has(d) && document.querySelector('#calDayDetail [data-cal="noevents"]') !== null; })()`));
    const calH1 = await ev(`(() => { const j = tsToJalali(Date.now()); calState = { jy: j.jy, jm: j.jm }; drawCalendar(); return document.querySelector('#calHeader').textContent; })()`);
    await ev(`calShift(1);`);
    const calH2 = await ev(`document.querySelector('#calHeader').textContent`);
    await T('calendar month shift changes header', calH1 !== calH2);
    await ev(`calShift(-1);`);
    const calH3 = await ev(`document.querySelector('#calHeader').textContent`);
    await T('calendar month shift back restores header', calH3 === calH1);
    await ev(`calToday();`);
    const calH4 = await ev(`document.querySelector('#calHeader').textContent`);
    await T('calToday returns to current month', calH4 === calH1);
    await T('calendar shows count badge on service day', () => ev(`(() => { const j = tsToJalali(Date.now()); calState = { jy: j.jy, jm: j.jm }; drawCalendar(); return [...document.querySelectorAll('.cal-day')].some(b => b.querySelector('.cal-dot')); })()`));

    const bk = await ev(`api('/backup')`);
    await T('backup includes reminders collection', Array.isArray(bk.backup.reminders));
    await T('reminders data integrity: unique ids & required fields', () => ev(`(() => { const rs = state.reminders || []; const seen = new Set(); for (const r of rs) { if (seen.has(r.id)) return false; seen.add(r.id); if (!r.id || !r.title || !r.due) return false; } return true; })()`));

    await ev(`LANG = 'en'; applyLang(); navigate('/calendar');`); await waitLoaded();
    await T('calendar page works in English', () => ev(`document.querySelector('#pageTitle').textContent === 'Service calendar'`));
    await ev(`LANG = 'fa'; applyLang(); navigate('/dashboard');`); await waitLoaded();

    /* ================= v19 hardening regressions ================= */

    /* -- every inline on*="fn(...)" handler resolves to a real function -- */
    const unresolved = await ev(`(() => {
      const skip = new Set(['String','Number','Math','JSON','Date','event','this','if','for','while','return','function','typeof','parseInt','parseFloat','confirm','alert','setTimeout','clearTimeout']);
      const names = new Set();
      const html = document.documentElement.outerHTML;
      for (const m of html.matchAll(/\\son[a-z]+="([^"]*)"/g)) {
        for (const c of m[1].matchAll(/([A-Za-z_$][\\w$]*)\\s*\\(/g)) names.add(c[1]);
      }
      return [...names].filter(n => !skip.has(n) && typeof window[n] !== 'function' &&
        !['find','getElementById','querySelector','replace','setItem','stopPropagation','toggle','now','push','slice','includes','map','join','filter'].includes(n));
    })()`);
    await T('every rendered inline handler resolves to a function', unresolved.length === 0, unresolved.join(', '));

    /* -- optimistic delete never removes a random row when the id is gone -- */
    await T('optimisticRemove ignores unknown ids', () => ev(`(() => {
      const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      const miss = optimisticRemove(list, 'zzz');
      if (miss !== null || list.length !== 3) return false;
      const hit = optimisticRemove(list, 'b');
      if (!hit || list.length !== 2) return false;
      hit.restore();
      return list.length === 3 && list[1].id === 'b';
    })()`));

    /* -- safe meta lookups on unknown/legacy values -- */
    await T('meta lookups never throw on unknown values', () => ev(`(() => {
      return svcMeta('nope') === SVC_META.maintenance && finalMeta(undefined) === FINAL_META.ok &&
             statMeta('???') === STATUS_META.contract && issueMeta(null) === ISSUE_META.open &&
             remMeta('x') === REMINDER_META.custom &&
             serviceRow({ id: 'x', serviceType: 'weird', finalStatus: 'weird', date: Date.now(), technician: 'q', problem: 'p' }).length > 10;
    })()`));

    /* -- inline-handler string escaping (quotes must not break the handler) -- */
    await T('jsAttr escapes quotes for inline handlers', () => ev(`(() => {
      const out = jsAttr("it's a \\"test\\"");
      return out.indexOf('\\\\&#39;') >= 0 && out.indexOf('&quot;') >= 0;
    })()`));
    await T('a query with quotes survives an inline handler round-trip', () => ev(`(() => {
      const q = "it's a \\"test\\"";
      const box = document.createElement('div');
      box.innerHTML = '<button id="qaEscBtn" onclick="calcFilter={cat:\\'all\\',q:\\'' + jsAttr(q) + '\\'}">x</button>';
      document.body.appendChild(box);
      calcFilter = { cat: 'all', q: '' };
      box.querySelector('#qaEscBtn').click();
      const got = calcFilter.q;
      box.remove();
      calcFilter = { cat: 'all', q: '' };
      return got === q;
    })()`));

    /* -- Jalali day boundaries: a morning service belongs to that day -- */
    const dayTest = await ev(`(() => {
      const j = tsToJalali(Date.now());
      const r = jalDayRange(j.jy, j.jm, j.jd);
      const morning = new Date(); morning.setHours(8, 30, 0, 0);
      const night = new Date(); night.setHours(23, 45, 0, 0);
      return { okMorning: morning.getTime() >= r.from && morning.getTime() < r.to,
               okNight: night.getTime() >= r.from && night.getTime() < r.to,
               span: r.to - r.from };
    })()`);
    await T('jalDayRange covers a whole local day (08:30 and 23:45)', dayTest.okMorning && dayTest.okNight, JSON.stringify(dayTest));

    const monthTest = await ev(`(() => {
      const j = tsToJalali(Date.now());
      const r = jalMonthRange(j.jy, j.jm);
      const first = jalDayStart(j.jy, j.jm, 1) + 30 * 60000;       // 00:30 on the 1st
      const last = jalDayStart(j.jy, j.jm, jalDaysInMonth(j.jy, j.jm)) + 23 * 3600000;
      const nextMonthFirst = r.to + 60000;
      return first >= r.from && first < r.to && last >= r.from && last < r.to && !(nextMonthFirst < r.to);
    })()`);
    await T('jalMonthRange starts at midnight and excludes the next month', monthTest === true);

    const morningSvc = await ev(`(() => {
      const d = new Date(); d.setHours(8, 15, 0, 0);
      return api('/services', { method: 'POST', body: { customer: 'سرویس صبح QA', technician: 'QA', serviceType: 'maintenance', date: d.getTime(), problem: 'x', diagnosis: 'y', workDone: 'z', partsReplaced: '-', finalStatus: 'ok' } });
    })()`);
    await ev(`(() => { state.services = null; return loadAll(true); })()`);
    await ev(`(() => { const j = tsToJalali(Date.now()); calState = { jy: j.jy, jm: j.jm }; navigate('/calendar'); })()`);
    await waitLoaded();
    await ev(`(() => { const j = tsToJalali(Date.now()); calPickDay(j.jd); })()`);
    await T('morning service (08:15) appears on today in the calendar', () => ev(`document.querySelector('#calDayDetail').innerHTML.includes('سرویس صبح QA')`));
    await T('picked day is highlighted in the grid', () => ev(`document.querySelectorAll('#calGrid .cal-sel').length === 1`));
    await ev(`api('/services/${morningSvc.service.id}', { method: 'DELETE' }); state.services = null; loadAll(true);`);

    /* -- monthly report navigation & month range -- */
    await ev(`mrMonth = null; navigate('/report');`); await waitLoaded();
    const mrNow = await ev(`JSON.stringify(mrMonth)`);
    await ev(`_mrPrev();`);
    const mrPrev = await ev(`JSON.stringify(mrMonth)`);
    await ev(`_mrNext();`);
    const mrBack = await ev(`JSON.stringify(mrMonth)`);
    await T('monthly report prev/next move exactly one month', mrPrev !== mrNow && mrBack === mrNow, mrNow + ' → ' + mrPrev + ' → ' + mrBack);
    await T('month nav arrows follow text direction', () => ev(`(() => {
      const fa = (LANG = 'fa', navArrows());
      const en = (LANG = 'en', navArrows());
      LANG = 'fa';
      return fa.prev === '›' && fa.next === '‹' && en.prev === '‹' && en.next === '›';
    })()`));

    /* -- contracts stay active until the END of the last month -- */
    const ctTest = await ev(`(() => {
      const j = tsToJalali(Date.now());
      const ct = { id: 'ctqa', building: 'QA', amount: 1000, months: 1, startTs: jalDayStart(j.jy, j.jm, 1), paid: {} };
      const st = ctStats(ct);
      return { active: st.active, expired: st.expired, endsAfterNow: st.endTs > Date.now() };
    })()`);
    await T('a contract in its final month is still active', ctTest.active === true && ctTest.expired === false && ctTest.endsAfterNow, JSON.stringify(ctTest));
    await T('a finished contract is reported expired', () => ev(`(() => {
      const j = tsToJalali(Date.now() - 400 * 86400000);
      return ctStats({ id: 'old', building: 'x', amount: 1, months: 2, startTs: jalDayStart(j.jy, j.jm, 1), paid: {} }).expired === true;
    })()`));
    await T('contract without startTs falls back to createdAt', () => ev(`ctMonthList({ months: 3, createdAt: Date.now() }).length === 3`));

    /* -- invoices: inventory is consumed on save and returned when the row is deleted -- */
    const partQa = await ev(`api('/parts', { method: 'POST', body: { name: 'قطعه تست فاکتور', category: 'QA', unit: 'عدد', qty: 10, minQty: 1, price: 5000 } })`);
    await ev(`state.parts = null; loadAll(true);`);
    await ev(`navigate('/invoices')`); await waitLoaded();
    await ev(`openInvoiceForm(); invUsePart(${JSON.stringify(partQa.part.id)}); document.querySelector('#inv_customer').value = 'مشتری QA'; document.querySelector('#inv_labor').value = '200000'; document.querySelector('#inv_labor').oninput();`);
    await ev(`document.querySelector('#invSave').onclick()`);
    await waitUntil(() => ev(`state.invoices.some(i => i.customer === 'مشتری QA')`), 8000, 'invoice saved');
    const invQa = await ev(`state.invoices.find(i => i.customer === 'مشتری QA')`);
    await T('invoice saved with the picked part', !!(invQa && invQa.items && invQa.items.length === 1 && invQa.items[0].partId === partQa.part.id));
    await T('stock is consumed once on save (10 → 9)', () => ev(`state.parts.find(p => p.id === ${JSON.stringify(partQa.part.id)}).qty === 9`), await ev(`String(state.parts.find(p => p.id === ${JSON.stringify(partQa.part.id)}).qty)`));

    await ev(`openInvoiceForm(${JSON.stringify(invQa.id)}); invDelItem(0);`);
    await ev(`document.querySelector('#invSave').onclick()`);
    await wait(300);
    await T('removing the row gives the part back to stock (9 → 10)', () => ev(`state.parts.find(p => p.id === ${JSON.stringify(partQa.part.id)}).qty === 10`), await ev(`String(state.parts.find(p => p.id === ${JSON.stringify(partQa.part.id)}).qty)`));

    /* -- payment on a saved invoice must not be blocked by a false overpay guard -- */
    await ev(`openInvoiceForm(${JSON.stringify(invQa.id)}); document.querySelector('#invPayBtn').onclick();`);
    await ev(`document.querySelector('#pay_amount').value = '200000'; document.querySelector('#payOk').onclick();`);
    await T('payment up to the saved total is accepted on the first tap', () => ev(`invDraft && invDraft.payments.length === 1 && invDraft.payments[0].amount === 200000`), await ev(`JSON.stringify(invDraft && invDraft.payments)`));
    await ev(`document.querySelector('#invPayBtn').onclick(); document.querySelector('#pay_amount').value = '999999'; document.querySelector('#payOk').onclick();`);
    await T('a real overpayment still needs a confirmation tap', () => ev(`invDraft.payments.length === 1`));
    await ev(`closeModal(); invDraft = null;`);

    /* -- deleting a project keeps its service history (services are independent) -- */
    const delProj = await ev(`api('/projects', { method: 'POST', body: { name: 'پروژه حذفی QA' } })`);
    await ev(`state.projects = null; loadAll(true);`);
    const delSvc = await ev(`api('/services', { method: 'POST', body: { projectId: ${JSON.stringify('')} || '', customer: 'مشتری حذفی', technician: 'QA', serviceType: 'repair', problem: 'x', diagnosis: 'y', workDone: 'z', partsReplaced: '-', finalStatus: 'ok' } })`);
    await ev(`api('/services/${delSvc.service.id}', { method: 'PUT', body: { projectId: ${JSON.stringify(delProj.project.id)} } })`);
    await ev(`state.services = null; state.projects = null; loadAll(true);`);
    await ev(`api('/projects/${delProj.project.id}', { method: 'DELETE' }); state.projects = null; state.services = null; loadAll(true);`);
    await T('services survive their project deletion (detached, not lost)', () => ev(`(() => { const s = state.services.find(x => x.id === ${JSON.stringify(delSvc.service.id)}); return !!s && !s.projectId; })()`));

    /* -- reminders can be edited & deleted from the UI -- */
    const rmUi = await ev(`api('/reminders', { method: 'POST', body: { title: 'یادآوری رابط کاربری', due: Date.now() + 4 * 86400000, kind: 'custom' } })`);
    await ev(`(() => { state.reminders = null; return loadAll(true); })()`);
    await ev(`navigate('/calendar')`); await waitLoaded();
    await T('custom reminder row opens its editor', () => ev(`document.querySelector('#reminderList').innerHTML.includes("openReminderForm('${rmUi.reminder.id}')")`));
    await ev(`openReminderForm('${rmUi.reminder.id}'); document.querySelector('#rm_title').value = 'یادآوری ویرایش‌شده از UI'; document.querySelector('#rmSave').onclick();`);
    await waitUntil(() => ev(`(state.reminders || []).some(r => r.title === 'یادآوری ویرایش‌شده از UI')`), 8000, 'reminder edited via UI');
    await T('reminder edited through the form', true);
    await ev(`openReminderForm('${rmUi.reminder.id}'); deleteReminder('${rmUi.reminder.id}'); document.querySelector('#confirmYes').onclick();`);
    await waitUntil(() => ev(`!(state.reminders || []).some(r => r.id === '${rmUi.reminder.id}')`), 8000, 'reminder deleted via UI');
    await T('reminder deleted through the form', true);
    const errsBefore = jsdomErrors.length;
    await T('markReminderDone on a missing id does not crash', () => ev(`markReminderDone('does-not-exist').then(() => true)`));
    jsdomErrors.length = errsBefore;   // the handled error above is logged on purpose

    /* -- due manual reminders are surfaced on the dashboard -- */
    const rmDash = await ev(`api('/reminders', { method: 'POST', body: { title: 'یادآوری داشبورد QA', due: Date.now() - 86400000, kind: 'custom' } })`);
    await ev(`(() => { state.reminders = null; return loadAll(true); })()`);
    await ev(`navigate('/dashboard')`); await waitLoaded();
    await T('overdue manual reminder shows on the dashboard', () => ev(`document.querySelector('#content').innerHTML.includes('یادآوری داشبورد QA')`));
    await ev(`api('/reminders/${rmDash.reminder.id}', { method: 'DELETE' })`);
    await ev(`(() => { state.reminders = null; return loadAll(true); })()`);

    /* -- router: the newest navigation always wins -- */
    await ev(`navigate('/projects'); navigate('/parts');`);
    await waitLoaded();
    await T('fast double navigation renders the last route only', () => ev(`state.route === '/parts' && document.querySelector('#content').innerHTML.includes('partList')`));

    /* -- storage layer -- */
    await T('_lsSave reports success', () => ev(`_lsSave() === true`));
    await T('old login sessions are pruned', () => ev(`(() => {
      const db = _lsLoad();
      db.sessions['stale-token'] = { userId: 'x', createdAt: Date.now() - 400 * 86400000 };
      _lsPruneSessions();
      return !db.sessions['stale-token'] && !!db.sessions[state.token];
    })()`));

    /* -- service worker contract -- */
    await T('service worker cache version bumped', () => {
      const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
      return /const CACHE = 'zlift-pwa-v(\d+)'/.test(sw) && sw.includes("req.mode === 'navigate'");
    });

    /* ================= v20 polish regressions ================= */

    /* -- Persian-aware search: Arabic ي/ك, Persian digits, ZWNJ -- */
    await T('norm() folds Arabic letters, Persian digits and ZWNJ', () => ev(`(() => {
      return norm('کلـيد ۱۲') === norm('كليد 12') && norm('می\\u200cشود') === norm('میشود') && norm('  Aا  ') === 'aا';
    })()`));
    const noteQa = await ev(`api('/notes', { method: 'POST', body: { title: 'تنظیم کلید ۱۲ ولت', content: 'یادداشت تست جست‌وجو', tags: ['تست'] } })`);
    await ev(`(() => { state.notes = null; return loadAll(true); })()`);
    await ev(`navigate('/notes')`); await waitLoaded();
    await T('search with Arabic «كليد» finds Persian «کلید»', () => ev(`(() => { noteQuery = 'كليد'; drawNotes(); return document.querySelector('#noteList').innerHTML.includes('تنظیم کلید'); })()`));
    await T('search with Latin digits finds Persian digits', () => ev(`(() => { noteQuery = '12'; drawNotes(); return document.querySelector('#noteList').innerHTML.includes('تنظیم کلید'); })()`));
    await T('search ignoring ZWNJ still matches', () => ev(`(() => { noteQuery = 'جستوجو'; drawNotes(); return document.querySelector('#noteList').innerHTML.includes('تنظیم کلید'); })()`));
    await ev(`(() => { noteQuery = ''; drawNotes(); return api('/notes/${noteQa.note.id}', { method: 'DELETE' }); })()`);
    await ev(`(() => { state.notes = null; return loadAll(true); })()`);

    /* -- modal is a real dialog: aria, scroll lock, focus, Enter = save -- */
    await ev(`navigate('/notes')`); await waitLoaded();
    await ev(`openNoteForm()`);
    await T('modal exposes dialog semantics', () => ev(`(() => {
      const box = document.querySelector('#modalRoot .modal');
      return box.getAttribute('role') === 'dialog' && box.getAttribute('aria-modal') === 'true' && !!box.getAttribute('aria-labelledby');
    })()`));
    await T('page behind the modal is scroll-locked', () => ev(`document.body.classList.contains('scroll-lock')`));
    await T('focus moves inside the dialog', () => ev(`document.querySelector('#modalRoot .modal').contains(document.activeElement)`));
    await ev(`closeModal()`);
    await T('scroll lock released after closing', () => ev(`!document.body.classList.contains('scroll-lock')`));

    await ev(`openServiceForm(); document.querySelector('#s_customer').value = 'مشتری اینتر QA';`);
    await ev(`document.querySelector('#modalRoot form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))`);
    await waitUntil(() => ev(`(state.services || []).some(x => x.customer === 'مشتری اینتر QA')`), 8000, 'Enter submits the form');
    await T('Enter inside a form runs the primary action (no page reload)', true);
    await ev(`(() => { const s = state.services.find(x => x.customer === 'مشتری اینتر QA'); return s ? api('/services/' + s.id, { method: 'DELETE' }) : null; })()`);
    await ev(`(() => { state.services = null; return loadAll(true); })()`);

    /* -- validation marks and focuses the offending field -- */
    await ev(`navigate('/projects')`); await waitLoaded();
    await ev(`openProjectForm(); document.querySelector('#f_name').value = '   '; document.querySelector('#projSave').onclick();`);
    await T('empty required field is highlighted and focused', () => ev(`(() => {
      const el = document.querySelector('#f_name');
      return el.classList.contains('input-error') && document.activeElement === el;
    })()`));
    await T('the error clears as soon as the user types', () => ev(`(() => {
      const el = document.querySelector('#f_name');
      el.value = 'x'; el.dispatchEvent(new Event('input', { bubbles: true }));
      return !el.classList.contains('input-error');
    })()`));
    await ev(`closeModal()`);

    /* -- API error codes become readable messages -- */
    await T('error codes map to specific messages', () => ev(`(() => {
      return errMsg({ code: 'not_found' }) === t('errNotFound') &&
             errMsg({ code: 'too_large' }) === t('photoTooLarge') &&
             errMsg({ code: 'nope' }) === t('errGeneric');
    })()`));

    /* -- printing pipeline builds a sheet and cleans it up -- */
    await T('printDoc renders a sheet and clears it afterwards', () => ev(`(() => {
      window.print = () => {};
      printDoc('<h1>QA print</h1>');
      const filled = document.getElementById('printSheet').innerHTML.includes('QA print');
      window.dispatchEvent(new Event('afterprint'));
      return filled && document.getElementById('printSheet').innerHTML === '';
    })()`));

    /* -- Jalali month names follow the interface language -- */
    await T('Jalali months are transliterated in English mode', () => ev(`(() => {
      LANG = 'en'; const en = jalMonth(6) + ' ' + fmtJalali(Date.now());
      LANG = 'fa'; const fa = jalMonth(6);
      return en.startsWith('Shahrivar') && !/[\\u0600-\\u06FF]/.test(en) && fa === 'شهریور';
    })()`));

    /* -- scroll position: new page starts at top, back restores -- */
    await T('scroll position is remembered per route', () => ev(`(() => {
      Object.defineProperty(window, 'scrollY', { value: 240, configurable: true });
      state.route = '/projects';
      _saveScroll();
      Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
      return _scrollPos['/projects'] === 240;
    })()`));

    /* -- navigation menu keeps its handlers and marks the current page -- */
    await ev(`navigate('/parts')`); await waitLoaded();
    await T('nav marks the active route for assistive tech', () => ev(`(() => {
      const btn = [...document.querySelectorAll('#mainNav .nav-item')].find(b => b.dataset.route === '/parts');
      return btn.classList.contains('active') && btn.getAttribute('aria-current') === 'page' && typeof btn.onclick === 'function';
    })()`));

    /* -- toasts never pile up -- */
    await T('at most 3 toasts are shown at once', () => ev(`(() => {
      for (let i = 0; i < 6; i++) toast('t' + i);
      const n = document.querySelector('#toastRoot').children.length;
      document.querySelector('#toastRoot').innerHTML = '';
      return n <= 3;
    })()`));

    /* ================= v21 visual consistency ================= */
    await T('empty states carry no ad-hoc inline styles', () => {
      const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
      return !/class="empty"[^>]*style=/.test(src.replace(/class="empty" data-cal="noevents" style="margin-top:12px"/g, ''));
    });
    await T('dark theme drives native controls (color-scheme)', () => {
      const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
      return /html\[data-theme="dark"\] \{\s*color-scheme: dark;/.test(src) && /html\[data-theme="light"\] \{\s*color-scheme: light;/.test(src);
    });
    await T('reduced-motion and touch-hover rules are present', () => {
      const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
      return src.includes('prefers-reduced-motion: reduce') && src.includes('@media (hover: none)');
    });
    await T('print stylesheet sets page margins and avoids broken rows', () => {
      const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
      return src.includes('@page { size: A4; margin: 14mm; }') && src.includes('display: table-header-group');
    });
    await T('theme toggle updates the browser theme colour', () => ev(`(() => {
      localStorage.setItem('zlift_theme', 'dark'); applyTheme();
      const dark = document.getElementById('metaTheme').getAttribute('content');
      localStorage.setItem('zlift_theme', 'light'); applyTheme();
      const light = document.getElementById('metaTheme').getAttribute('content');
      return dark === '#0b1220' && light === '#2563eb' && document.documentElement.getAttribute('data-theme') === 'light';
    })()`));

    /* ================= v22 wording & form flow ================= */
    await T('delete confirmation title is generic (not "delete project")', () => ev(`(() => {
      return !I18N.fa.confirmDeleteTitle.includes('پروژه') && !/project/i.test(I18N.en.confirmDeleteTitle);
    })()`));
    await T('project delete message matches what really happens', () => ev(`(() => {
      return I18N.fa.confirmDeleteMsg.includes('چک‌لیست') && I18N.fa.confirmDeleteMsg.includes('حذف نمی‌شوند') &&
             /kept/i.test(I18N.en.confirmDeleteMsg);
    })()`));
    await T('no informal imperative verbs left in the Persian UI', () => ev(`(() => {
      const bad = /(?:^|\\s)(?:بگیر|حذف کن|بازیابی کن|بزن|برو|ببین)(?:$|[\\s،.!؟])/;
      return !Object.keys(I18N.fa).some(k => typeof I18N.fa[k] === 'string' && bad.test(I18N.fa[k]));
    })()`));
    await T('English labels use sentence case', () => ev(`(() => {
      const keys = ['projects','parts','tools','issues','knowledge','standards','monthlyReport','settings',
                    'newProject','editProject','newPart','editPart','newNote','editNote','newInvoice',
                    'editInvoice','newContract','editContract','tCalc','tDiag','tKb','tChecklists','latestProject'];
      const bad = keys.filter(k => {
        const v = I18N.en[k]; if (!v) return true;
        return v.split(' ').slice(1).some(w => /^[A-Z][a-z]+$/.test(w.replace(/[()&—,.-]/g, '')));
      });
      return bad.length === 0;
    })()`));
    await ev(`navigate('/services')`); await waitLoaded();
    await ev(`openServiceForm()`);
    await T('service form follows the real job flow', () => ev(`(() => {
      const ids = [...document.querySelectorAll('#modalRoot .field input, #modalRoot .field select, #modalRoot .field textarea')].map(e => e.id);
      const want = ['s_project','s_customer','s_elevator','s_date','s_type','s_tech','s_complaint','s_problem',
                    's_diag','s_meas','s_work','s_parts','s_recommend','s_final','s_followup'];
      return want.join(',') === ids.join(',') && document.querySelectorAll('#modalRoot .form-sep').length === 3;
    })()`), await ev(`[...document.querySelectorAll('#modalRoot .field input, #modalRoot .field select, #modalRoot .field textarea')].map(e => e.id).join(',')`));
    await ev(`closeModal()`);
    await ev(`navigate('/projects')`); await waitLoaded();
    await ev(`openProjectForm()`);
    await T('project form is grouped: details, specs, equipment, status', () => ev(`(() => {
      const seps = [...document.querySelectorAll('#projForm .form-sep')].map(e => e.textContent);
      const ids = [...document.querySelectorAll('#projForm .field input, #projForm .field select, #projForm .field textarea')].map(e => e.id);
      return seps.length === 4 && ids[0] === 'f_name' && ids.indexOf('f_type') < ids.indexOf('f_controller') &&
             ids.indexOf('f_controller') < ids.indexOf('f_status') && ids[ids.length - 1] === 'f_notes';
    })()`));
    await ev(`closeModal()`);

    /* ================= v23 signatures, standards library, report numbers ================= */

    /* -- standards library: 4 selectable standard sets -- */
    await T('standards library exposes 4 standard sets', () => ev(`STD_SETS.length === 4 && STD_SETS.map(s => s.id).join(',') === 'en81-20,en81-50,en81-28,en13015'`));
    await ev(`stdSet = 'en81-50'; stdCat = 'all'; stdQuery = ''; navigate('/standards');`); await waitLoaded();
    await T('switching to EN 81-50 shows its test rules', () => ev(`document.querySelector('#stdList').innerHTML.includes('s50-gov') && !document.querySelector('#stdList').innerHTML.includes('s-ucmp')`));
    await ev(`openStdArticle('s50-gov');`);
    await T('EN 81-50 article badge shows the standard name', () => ev(`document.querySelector('#modalRoot').innerHTML.includes('EN 81-50')`));
    await ev(`closeModal(); stdSet = 'en81-20'; stdCat = 'all'; stdQuery = '';`);

    /* -- service report numbers are sequential & human-friendly -- */
    const rn1 = await ev(`api('/services', { method: 'POST', body: { customer: 'مشتری شماره QA', technician: 'QA', serviceType: 'maintenance', problem: 'x', workDone: 'y', finalStatus: 'ok' } })`);
    const rn2 = await ev(`api('/services', { method: 'POST', body: { customer: 'مشتری شماره ۲ QA', technician: 'QA', serviceType: 'maintenance', problem: 'x', workDone: 'y', finalStatus: 'ok' } })`);
    await T('service report numbers are sequential (SR-XXXX)', /^SR-\d{4}$/.test(rn1.service.reportNo) && rn2.service.reportNo === 'SR-' + String(parseInt(rn1.service.reportNo.slice(3), 10) + 1).padStart(4, '0'), JSON.stringify([rn1.service.reportNo, rn2.service.reportNo]));
    await ev(`api('/services/${rn1.service.id}', { method: 'DELETE' }); api('/services/${rn2.service.id}', { method: 'DELETE' }); state.services = null; loadAll(true);`);

    /* -- parts: supplier & code fields + inventory value summary -- */
    const partSup = await ev(`api('/parts', { method: 'POST', body: { name: 'قطعه با تأمین‌کننده QA', category: 'QA', unit: 'عدد', qty: 5, minQty: 2, price: 10000, supplier: 'شرکت قطعات برتر', code: 'P-123' } })`);
    await T('part supplier & code persisted', partSup.part.supplier === 'شرکت قطعات برتر' && partSup.part.code === 'P-123');
    await ev(`state.parts = null; loadAll(true);`);
    await ev(`navigate('/parts')`); await waitLoaded();
    await T('parts page shows inventory value summary', () => ev(`document.querySelector('#content').innerHTML.includes('ارزش کل موجودی') && document.querySelector('#content').innerHTML.includes('اقلام')`));
    await ev(`api('/parts/${partSup.part.id}', { method: 'DELETE' }); state.parts = null; loadAll(true);`);

    /* -- service form includes digital signature pads that degrade gracefully -- */
    await ev(`navigate('/services')`); await waitLoaded();
    await ev(`openServiceForm()`);
    await T('service form includes two signature pads', () => ev(`!!document.getElementById('sig_tech_cv') && !!document.getElementById('sig_cust_cv')`));
    await T('signature pad degrades gracefully without a canvas', () => ev(`wireSignaturePad('sig_tech', null) === null && readSignature('sig_tech') === ''`));
    await ev(`closeModal()`);

    /* -- dashboard shows financial KPIs -- */
    await ev(`navigate('/dashboard')`); await waitLoaded();
    await T('dashboard shows financial KPIs (income, balance, stock value)', () => ev(`document.querySelector('#content').innerHTML.includes('درآمد این ماه') && document.querySelector('#content').innerHTML.includes('مانده وصول‌نشده') && document.querySelector('#content').innerHTML.includes('ارزش انبار')`));

    /* ---------- legacy regressions ---------- */
    await ev(`navigate('/checklists/traction-install')`); await waitLoaded();
    await T('traction install checklist still renders (30 items)', () => ev(`document.querySelectorAll('#content .check-item[data-item]').length === 30`));
    await ev(`navigate('/knowledge')`); await waitLoaded();
    await ev(`kbQuery = 'استاندارد'; drawKb();`);
    await T('knowledge search finds k3 article', () => ev(`document.querySelector('#kbList').innerHTML.includes('k3')`));
    await ev(`openKbArticle('k3');`);
    await T('k3 article contains corrected refuge value', () => ev(`document.querySelector('#modalRoot').innerHTML.includes('0.5×0.7×1.0')`));
    await ev(`closeModal();`);

    await T('no uncaught window errors', windowErrors.length === 0, windowErrors.join(' | ').slice(0, 400));
    await T('no jsdom errors', jsdomErrors.length === 0, jsdomErrors.join(' | ').slice(0, 400));
  } catch (e) {
    await T('smoke test ran to completion', false, String(e && e.stack || e).slice(0, 600));
  }

  console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
  if (failures.length) console.log('FAILURES:\n - ' + failures.join('\n - '));
  dom.window.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
