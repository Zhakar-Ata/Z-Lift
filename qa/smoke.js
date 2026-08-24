/* Z Lift — end-to-end smoke test (jsdom)
   Loads the real index.html, registers a user through the app's own
   localStorage API, renders every route, exercises the EN 81-20
   standards module, calculators, checklist flow and field checks.
   Run:  npm install && npm test        (from repo root)
   Exit code 0 = all checks passed. */
const { JSDOM, VirtualConsole } = require('jsdom');
const { indexedDB, IDBKeyRange } = require('fake-indexeddb');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const rawHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// In modular architecture, scripts are external — inline them for jsdom
function inlineScripts(htmlStr) {
  return htmlStr.replace(/<script\s+src="([^"]+)"[^>]*><\/script>/g, (match, src) => {
    const filePath = path.join(ROOT, src);
    if (!fs.existsSync(filePath)) {
      console.warn('WARNING: script not found: ' + src);
      return '<script>/* MISSING: ' + src + ' */</script>';
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return '<script>\n' + content + '\n</script>';
  });
}
const html = inlineScripts(rawHtml);
// For version regex checks, combine all sources
const allSources = rawHtml + '\n' + fs.readFileSync(path.join(ROOT, 'js/core/app-core.js'), 'utf8');

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
    virtualConsole: vc,
    beforeParse(window) {
      window.indexedDB = indexedDB;
      window.IDBKeyRange = IDBKeyRange;
    }
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
      '/contracts', '/report', '/analytics', '/settings', '/standards'
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
    await T('governor scenario requests missing source coefficients', () => ev(`document.querySelector('#calcResult_std-gov').innerHTML.includes('ورودی‌های لازم')`));
    await ev(`document.querySelector('#calc_std-gov_kmin').value='1.2';document.querySelector('#calc_std-gov_vmax').value='1.6';computeCalc(CALCULATORS.find(c => c.id === 'std-gov'));`);
    await T('governor scenario computes only after source parameters are entered', () => ev(`document.querySelector('#calcResult_std-gov').innerHTML.includes('1.200') && document.querySelector('#calcResult_std-gov').innerHTML.includes('1.600')`));
    await ev(`computeCalc(CALCULATORS.find(c => c.id === 'std-buffer'));`);
    await T('buffer scenario requests missing source coefficients', () => ev(`document.querySelector('#calcResult_std-buffer').innerHTML.includes('ورودی‌های لازم')`));
    await ev(`document.querySelector('#calc_std-headroom_base').value='1';document.querySelector('#calc_std-headroom_k').value='0.04';computeCalc(CALCULATORS.find(c => c.id === 'std-headroom'));`);
    await T('headroom scenario uses user-entered source parameters', () => ev(`document.querySelector('#calcResult_std-headroom').innerHTML.includes('1.040')`));
    await ev(`calcFilter.cat = 'all'; renderCalculations();`); // all cards live
    let calcFails = 0;
    const calcIds = await ev(`CALCULATORS.map(c => c.id)`);
    for (const id of calcIds) {
      const ok = await ev(`(() => { try { computeCalc(CALCULATORS.find(c => c.id === '${id}')); return true; } catch (e) { return String(e && e.message || e); } })()`);
      if (ok !== true) { calcFails++; failures.push('calculator ' + id + ' throws: ' + ok); }
    }
    await T('all ' + calcIds.length + ' calculators compute without exception', calcFails === 0, calcFails + ' failed');
    await T('every calculator exposes inputs, formula, assumptions, limitations, reference and provenance', () => ev(`CALCULATORS.every(c=>Array.isArray(c.inputs)&&c.inputs.length&&c.formula&&c.assume&&c.limit&&c.reference&&['UNVERIFIED','ENGINEERING PRACTICE'].includes(c.verificationStatus))`));
    await T('calculator rendering exposes formula, substituted calculation, result and units', () => ev(`(function(){calcFilter.cat='all';renderCalculations();var h=document.querySelector('#calcResult_c9').innerHTML;return h.includes('FORMULA')&&h.includes('CALCULATION')&&h.includes('RESULT')&&h.includes('kW');})()`));
    await T('Alpha Angle remains limited to traction 1:1 with exact geometric-only warning', () => ev(`(function(){var c=CALCULATORS.find(x=>x.id==='r2');return c&&/1:1/.test(c.title.fa)&&c.note.fa===ALPHA_ANGLE_WARNING_FA&&c.note.fa.includes('به‌تنهایی کفایت کشش، ایمنی یا انطباق سیستم را تأیید نمی‌کند');})()`));
    await T('knowledge articles have explicit provenance classification', () => ev(`KNOWLEDGE_AUDIT_RECORDS.length===KNOWLEDGE.length&&KNOWLEDGE.every(k=>['UNVERIFIED','ENGINEERING PRACTICE'].includes(k.verificationStatus))`));

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

    await ev(`sessionStorage.setItem('zlift_safety_ack_en81-safety-audit','1'); navigate('/checklists/en81-safety-audit?project=${pidT}')`); await waitLoaded();
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

    /* ---------- measurement engine: unverified thresholds stay UNKNOWN ---------- */
    const msgs = await ev(`evalMeasures([{ id: 'door_force', value: 180 }, { id: 'door_gap', value: 7 }, { id: 'lock_eng', value: 5 }, { id: 'v_rated', value: 1 }, { id: 'v_gov', value: 1.05 }])`);
    await T('field check: door force is UNKNOWN without a verified/configured range', msgs.some(m => m.text.includes('نیروی بستن') && m.status === 'unknown'));
    await T('field check: lock engagement is UNKNOWN without exact source/model', msgs.some(m => m.text.includes('قفل') && m.status === 'unknown'));
    await T('field check: governor is UNKNOWN without type/certificate', msgs.some(m => m.text.includes('گاورنر') && m.status === 'unknown'));
    const configuredMsgs = await ev(`evalMeasures([{ id: 'door_force', value: 120 }], { expectedMax: 150, reference: 'configured test fixture' })`);
    await T('field check: an explicitly configured range can evaluate', configuredMsgs.every(m => m.ok === true), JSON.stringify(configuredMsgs.map(m => m.text)));

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

    /* -- service reports can deduct stock parts and free-text parts coexist -- */
    const svcPartQa = await ev(`api('/parts', { method: 'POST', body: { name: 'قطعه تست سرویس', category: 'QA', unit: 'عدد', qty: 7, minQty: 1, price: 9000 } })`);
    await ev(`state.parts = null; loadAll(true);`);
    await ev(`openServiceForm()`);
    await ev(`(function(){
      svcPartsDraft = [
        { partId: ${JSON.stringify(svcPartQa.part.id)}, name: 'قطعه تست سرویس', qty: 2 },
        { name: 'پیچ تنظیم (مصرفی)', qty: 4 }
      ];
      document.querySelector('#s_customer').value = 'مشتری سرویس QA';
      document.querySelector('#s_tech').value = 'تکنسین QA';
      document.querySelector('#svcSave').onclick();
    })()`);
    await waitUntil(() => ev(`state.services.some(s => s.customer === 'مشتری سرویس QA')`), 8000, 'service saved');
    const svcQa = await ev(`state.services.find(s => s.customer === 'مشتری سرویس QA')`);
    await T('service saved with structured parts', !!(svcQa && svcQa.partsUsed && svcQa.partsUsed.length === 2));
    await T('service stock part deducted inventory (7 → 5)', () => ev(`state.parts.find(p => p.id === ${JSON.stringify(svcPartQa.part.id)}).qty === 5`), await ev(`String(state.parts.find(p => p.id === ${JSON.stringify(svcPartQa.part.id)}).qty)`));
    await T('service parts text appears in print/share output', () => ev(`buildServiceText(state.services.find(s => s.customer === 'مشتری سرویس QA')).indexOf('قطعه تست سرویس') >= 0`));
    // editing: reduce qty 2 → 1 returns one unit, increasing consumes more
    await ev(`openServiceForm(${JSON.stringify(svcQa.id)})`);
    await T('service form loads existing structured parts', () => ev(`svcPartsDraft.length === 2 && svcPartsDraft[0].qty === 2`));
    await ev(`(function(){ svcPartsDraft[0].qty = 1; document.querySelector('#svcSave').onclick(); })()`);
    await wait(300);
    await T('reducing part qty on edit returns stock (5 → 6)', () => ev(`state.parts.find(p => p.id === ${JSON.stringify(svcPartQa.part.id)}).qty === 6`), await ev(`String(state.parts.find(p => p.id === ${JSON.stringify(svcPartQa.part.id)}).qty)`));

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
    await T('_lsSave reports success', () => ev(`_lsSave().then(v => v === true)`));
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
      const src = fs.readFileSync(path.join(ROOT, 'css/app.css'), 'utf8');
      return /html\[data-theme="dark"\] \{\s*color-scheme: dark;/.test(src) && /html\[data-theme="light"\] \{\s*color-scheme: light;/.test(src);
    });
    await T('reduced-motion and touch-hover rules are present', () => {
      const src = fs.readFileSync(path.join(ROOT, 'css/app.css'), 'utf8');
      return src.includes('prefers-reduced-motion: reduce') && src.includes('@media (hover: none)');
    });
    await T('print stylesheet sets page margins and avoids broken rows', () => {
      const src = fs.readFileSync(path.join(ROOT, 'css/app.css'), 'utf8');
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
      // the structured-parts field is its own panel (picker + custom row) and
      // is excluded from the ordered list of core job fields
      const ids = [...document.querySelectorAll('#modalRoot .form-grid > .field:not([data-svcparts]) input, #modalRoot .form-grid > .field:not([data-svcparts]) select, #modalRoot .form-grid > .field:not([data-svcparts]) textarea')].map(e => e.id);
      const want = ['s_project','s_customer','s_elevator','s_date','s_type','s_tech','s_complaint','s_problem',
                    's_diag','s_meas','s_work','s_recommend','s_final','s_followup'];
      return want.join(',') === ids.join(',') && document.querySelectorAll('#modalRoot .form-sep').length === 3
        && !!document.querySelector('#svcPartsBox') && !!document.querySelector('#svcPickPanel') && !!document.querySelector('#svcCustomRow');
    })()`), await ev(`[...document.querySelectorAll('#modalRoot .form-grid > .field:not([data-svcparts]) input, #modalRoot .form-grid > .field:not([data-svcparts]) select, #modalRoot .form-grid > .field:not([data-svcparts]) textarea')].map(e => e.id).join(',')`));
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

    /* ================= PHASE 1: structured measurements ================= */
    await T('parseNum reads Persian/Arabic numerals', () => ev(
      `parseNum('۲۲۰')===220 && parseNum('٣٨٠')===380 && parseNum('1,234.5')===1234.5 && parseNum('abc')===null && parseNum('')===null`
    ));
    await T('measurement engine returns UNKNOWN unless context justifies a threshold', () => ev(`
      evalMeasurement({typeId:'v_rs',kind:'numeric',value:380}).status==='unknown' &&
      evalMeasurement({typeId:'temp',kind:'numeric',value:90}).status==='unknown' &&
      evalMeasurement({typeId:'lock_eng',kind:'numeric',value:4}).status==='unknown' &&
      evalMeasurement({typeId:'i_motor',kind:'numeric',value:14}).status==='unknown'
    `));
    await T('configured nominal voltage and tolerance drive voltage evaluation', () => ev(`
      evalMeasurement({typeId:'v_rs',value:394,context:{nominalVoltage:380,tolerancePercent:5}}).status==='normal' &&
      evalMeasurement({typeId:'v_rs',value:430,context:{nominalVoltage:380,tolerancePercent:5}}).status==='attention'
    `));
    await ev(`state.settings.taxRate=9`);
    const m1 = await ev(`api('/measurements',{method:'POST',body:{typeId:'v_rs',kind:'numeric',value:'۳۸۰',point:'ورودی تابلو',projectId:'',ts:Date.now()}})`);
    await ev(`state.measurements=null;loadAll(true);`);
    await T('persian-digit measurement saved and normalized to 380', m1 && m1.item && m1.item.value === 380, JSON.stringify(m1));
    await T('saved measurement is in state', () => ev(`state.measurements.some(m=>m.typeId==='v_rs'&&m.value===380)`));
    const structuredMeasurement = await ev(`(async()=>{var s=_lsLoad().services[0];var d=await api('/measurements',{method:'POST',body:{typeId:'temp',kind:'numeric',value:31,unit:'WRONG',projectId:s&&s.projectId||'',serviceId:s&&s.id||'',location:'machine room',point:'motor frame',mode:'stopped',observation:'no visible damage',note:'repeat next visit',ts:Date.now()}});return d.item})()`);
    await T('structured measurement persists service/location/point/mode/observation and authoritative unit', structuredMeasurement && structuredMeasurement.serviceId && structuredMeasurement.location === 'machine room' && structuredMeasurement.point === 'motor frame' && structuredMeasurement.mode === 'stopped' && structuredMeasurement.observation === 'no visible damage' && structuredMeasurement.unit === '°C', JSON.stringify(structuredMeasurement));
    await ev(`navigate('/measurements');`); await waitLoaded();
    await T('measurement form exposes structured technician context fields', () => ev(`openMeasForm();!!document.querySelector('#m_service')&&!!document.querySelector('#m_location')&&!!document.querySelector('#m_mode')&&!!document.querySelector('#m_unit')&&!!document.querySelector('#m_observation')&&!!document.querySelector('#m_photo')`));
    await ev(`closeModal()`);
    await T('measurements page renders list + status badge', () => ev(`document.querySelector('#content').innerHTML.includes('۳۸۰')||document.querySelector('#content').innerHTML.includes('380')`));
    await T('measurements page shows red-flag for critical safety observation', async () => {
      await ev(`api('/measurements',{method:'POST',body:{typeId:'safety_chain',kind:'state',value:'open',point:'تابلو',ts:Date.now()}});state.measurements=null;loadAll(true);navigate('/measurements');`);
      await waitLoaded();
      return ev(`document.querySelector('#content').innerHTML.includes('پرچم قرمز')||document.querySelector('#content').innerHTML.includes('بحرانی')`);
    });

    /* ================= PHASE 1: safety confirmation ================= */
    await ev(`sessionStorage.removeItem('zlift_safety_ack_en81-safety-audit'); navigate('/checklists/en81-safety-audit');`); await waitLoaded();
    await T('critical checklist shows safety gate before items', () => ev(`!!document.querySelector('#safetyAck') && document.querySelector('#content .check-item')===null`));
    await T('continue button disabled until acknowledged', () => ev(`document.querySelector('#safetyContinue').disabled===true`));
    await ev(`(function(){var c=document.querySelector('#safetyAck');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await wait(50);
    await T('continue enables after checkbox', () => ev(`document.querySelector('#safetyContinue')!==null && document.querySelector('#safetyContinue').disabled===false`));
    await ev(`document.querySelector('#safetyContinue').click();`); await waitLoaded(); await wait(100);
    await T('acknowledgement proceeds to the 32 checklist items', () => ev(`document.querySelectorAll('#content .check-item[data-item]').length===32`));
    await T('safety acknowledgement was logged', () => ev(`state.safetyLogs && state.safetyLogs.some(l=>l.checklistId==='en81-safety-audit')`));
    // non-critical checklist opens directly
    await ev(`navigate('/checklists/traction-install');`); await waitLoaded();
    await T('non-critical checklist opens without safety gate', () => ev(`document.querySelector('#safetyAck')===null && document.querySelectorAll('#content .check-item[data-item]').length===30`));

    /* ================= PHASE 1: invoice VAT + legal number ================= */
    const invTax = await ev(`(async()=>{
      const d=await api('/invoices',{method:'POST',body:{customer:'مشتری VAT',items:[{desc:'سرویس',qty:1,price:1000000}],labor:0,discount:0,taxRate:9,taxExempt:false,payments:[]}});
      return d.item;
    })()`);
    await T('invoice gets a sequential legal number', !!(invTax && invTax.number && /^\d+$/.test(invTax.number)), JSON.stringify(invTax));
    const duplicateInvoiceNumber = await ev(`(async()=>{try{await api('/invoices',{method:'POST',body:{number:${JSON.stringify(invTax.number)},customer:'duplicate',items:[{desc:'x',qty:1,price:1}],payments:[]}});return 'accepted'}catch(e){return e.code}})()`);
    await T('duplicate invoice number is rejected before mutation', duplicateInvoiceNumber === 'duplicate_invoice_number', duplicateInvoiceNumber);
    const invalidInvoice = await ev(`(async()=>{try{await api('/invoices',{method:'POST',body:{customer:'invalid',items:[{desc:'x',qty:-1,price:1}],payments:[]}});return 'accepted'}catch(e){return e.code}})()`);
    await T('negative invoice quantity is rejected', invalidInvoice === 'invalid_invoice', invalidInvoice);
    await ev(`state.invoices=null;loadAll(true);`);
    await T('invoice VAT calculated (9% of 1,000,000 = 90,000; total 1,090,000)', () => {
      const id = invTax.id;
      return ev(`(function(){var i=state.invoices.find(x=>x.id===${JSON.stringify(id)});var t=invTotals(i);return t.tax===90000 && t.grand===1090000;})()`);
    });
    const invEx = await ev(`(async()=>{const d=await api('/invoices',{method:'POST',body:{customer:'معاف',items:[{desc:'x',qty:1,price:1000000}],taxRate:9,taxExempt:true,payments:[]}});return d.item;})()`);
    await ev(`state.invoices=null;loadAll(true);`);
    await T('tax-exempt invoice has zero tax', () => {
      const id = invEx.id;
      return ev(`(function(){var i=state.invoices.find(x=>x.id===${JSON.stringify(id)});var t=invTotals(i);return t.tax===0 && t.grand===1000000;})()`);
    });
    await ev(`navigate('/invoices');`); await waitLoaded();
    await T('invoice list still renders with VAT', () => ev(`document.querySelector('#content').innerHTML.includes('مشتری VAT')`));

    /* ================= PHASE 1: backup validation + auto backup ================= */
    const goodBackup = await ev(`api('/backup')`);
    await T('backup export includes measurements & safetyLogs & version', () => ev(`
      (function(){var b=${JSON.stringify(JSON.stringify(goodBackup.backup))};var x=JSON.parse(b);return x.version>=5 && Array.isArray(x.measurements) && Array.isArray(x.safetyLogs);})()
    `));
    await T('validateBackup rejects non-zlift object', () => ev(`validateBackup({foo:1}).ok===false`));
    await T('validateBackup rejects missing projects', () => ev(`validateBackup({app:'zlift',services:[]}).ok===false`));
    await T('validateBackup rejects corrupt/array field', () => ev(`validateBackup({app:'zlift',projects:[],services:'nope'}).ok===false`));
    await T('validateBackup rejects malformed version metadata', () => ev(`validateBackup({app:'zlift',version:'not-a-version',projects:[]}).why==='version'`));
    await T('validateBackup rejects duplicate invoice numbers', () => ev(`(function(){var b=JSON.parse(JSON.stringify(${JSON.stringify(goodBackup.backup)}));delete b.integrity;if(b.metadata)delete b.metadata.integrity;if(!b.invoices.length)b.invoices=[{id:'inv-a',number:'DUP',customer:'A',items:[],payments:[]}];var seed=b.invoices[0];b.invoices.push(Object.assign({},seed,{id:'duplicate-invoice-number-qa'}));return validateBackup(b).why.indexOf('invoices:duplicate-number')===0;})()`));
    await T('validateBackup rejects negative invoice values', () => ev(`(function(){var b=JSON.parse(JSON.stringify(${JSON.stringify(goodBackup.backup)}));delete b.integrity;if(b.metadata)delete b.metadata.integrity;if(!b.invoices.length)b.invoices=[{id:'inv-a',number:'A',customer:'A',items:[{desc:'x',qty:1,price:1}],payments:[]}];b.invoices[0].items[0].qty=-1;return validateBackup(b).why.indexOf('invoices:item')===0;})()`));
    await T('validateBackup accepts a valid backup', () => ev(`validateBackup(${JSON.stringify(goodBackup.backup)}).ok===true`));
    await ev(`typeof runAutoBackup==='function' && runAutoBackup();`);
    await T('auto backup created a snapshot', () => ev(`listAutoBackups && listAutoBackups().length>=1`));
    await T('auto backup snapshot is restorable (round-trips)', () => ev(`(function(){var s=listAutoBackups()[0];return s && s.data && Array.isArray(s.data.projects);})()`));
    await T('backup rejects device-local photo metadata without portable payload', () => ev(`(function(){var b=JSON.parse(JSON.stringify(${JSON.stringify(goodBackup.backup)}));delete b.integrity;if(b.metadata)delete b.metadata.integrity;b.photos=[{id:'missing-photo',inIdb:true,data:''}];return validateBackup(b).why.indexOf('photos:missing-data')===0;})()`));

    const portablePhoto = 'data:image/png;base64,' + 'A'.repeat(5000);
    const restoreResult = await ev(`(async()=>{var b=JSON.parse(JSON.stringify(${JSON.stringify(goodBackup.backup)}));b.projects.push({id:'restore-project-qa',name:'restore marker',createdAt:111,updatedAt:222});b.settings=Object.assign({},b.settings,{company:'Restore QA Company'});b.photos.push({id:'restore-photo-qa',data:${JSON.stringify(portablePhoto)},inIdb:false,cat:'QA',projectId:'restore-project-qa',createdAt:333,updatedAt:444});b=enrichBackupMetadata(b);var r=await api('/backup',{method:'PUT',body:{backup:b}});var x=await api('/backup');return {r,project:x.backup.projects.find(p=>p.id==='restore-project-qa'),photo:x.backup.photos.find(p=>p.id==='restore-photo-qa'),company:x.backup.settings.company};})()`);
    await T('restore commits and read-back verifies all staged collections', restoreResult.r.verified === true && restoreResult.project && restoreResult.project.createdAt === 111 && restoreResult.company === 'Restore QA Company', JSON.stringify(restoreResult).slice(0, 220));
    await T('restore preserves and re-exports photo payloads and timestamps', restoreResult.photo && restoreResult.photo.data === portablePhoto && restoreResult.photo.createdAt === 333 && restoreResult.photo.updatedAt === 444);
    await ev(`(async()=>{await api('/backup',{method:'PUT',body:{backup:${JSON.stringify(goodBackup.backup)}}});await loadAll(true);return true})()`);

    const restoreBeforeFailure = await ev(`({company:_lsLoad().settings.company,projects:_lsLoad().projects.length})`);
    const restoreCommitFailure = await ev(`(async()=>{var b=JSON.parse(JSON.stringify(${JSON.stringify(goodBackup.backup)}));b.settings.company='must not activate';b=enrichBackupMetadata(b);var real=_lsSave;_lsSave=async()=>{throw new Error('qa-restore-commit')};try{await api('/backup',{method:'PUT',body:{backup:b}});return {ok:true}}catch(e){return {ok:false,message:e.message}}finally{_lsSave=real}})()`);
    const restoreAfterFailure = await ev(`({company:_lsLoad().settings.company,projects:_lsLoad().projects.length})`);
    await T('restore commit failure is surfaced instead of activating partial data', restoreCommitFailure.ok === false && restoreCommitFailure.message === 'qa-restore-commit', JSON.stringify(restoreCommitFailure));
    await T('restore commit failure keeps the previous live aggregate', restoreAfterFailure.company === restoreBeforeFailure.company && restoreAfterFailure.projects === restoreBeforeFailure.projects, JSON.stringify({restoreBeforeFailure,restoreAfterFailure}));

    const photoFallback = await ev(`(async()=>{var b=JSON.parse(JSON.stringify(${JSON.stringify(goodBackup.backup)}));b.photos.push({id:'restore-photo-fallback',data:${JSON.stringify(portablePhoto)},inIdb:false,cat:'QA',projectId:'',createdAt:555});b=enrichBackupMetadata(b);var real=IDB_PHOTOS.put;IDB_PHOTOS.put=async()=>{throw new Error('qa-photo-store')};try{var r=await api('/backup',{method:'PUT',body:{backup:b}});var p=_lsLoad().photos.find(x=>x.id==='restore-photo-fallback');return {r:r,p:{inIdb:p.inIdb,data:p.data,createdAt:p.createdAt}}}finally{IDB_PHOTOS.put=real}})()`);
    await T('restore photo-store failure safely retains verified inline payload', photoFallback.r.verified === true && photoFallback.r.photosOffloaded === false && photoFallback.p.inIdb === false && photoFallback.p.data === portablePhoto && photoFallback.p.createdAt === 555, JSON.stringify(photoFallback).slice(0, 180));
    await ev(`(async()=>{await api('/backup',{method:'PUT',body:{backup:${JSON.stringify(goodBackup.backup)}}});await loadAll(true);return true})()`);

    /* ================= PHASE 1: search robustness ================= */
    await T('normalization maps Arabic ي/ك to Persian ی/ک', () => ev(`norm('بريك')===norm('بریک') && norm('DOOR ')==='door'`));
    // global search must never throw on technician-style queries (incl. Arabic letters)
    await ev(`closeModal&&closeModal();`); await wait(100);
    await ev(`openGlobalSearch&&openGlobalSearch();`); await wait(200);
    await T('global search modal is open', () => ev(`!!document.querySelector('#gsInput')`));
    for (const q of ['OC','ایمنی','بریک','مدار','ك']) {
      await ev(`(function(q){var i=document.querySelector('#gsInput');if(i){i.value=q;i.dispatchEvent(new Event('input'));}})(${JSON.stringify(q)})`);
      await wait(350);
      await T('global search handles "'+q+'" without errors', () => ev(`(function(){var o=document.querySelector('#gsOut');return o && !/undefined|TypeError|null is not/i.test(o.innerHTML);})()`));
    }
    await ev(`closeModal&&closeModal();`);
    await ev(`(function(){var i=document.querySelector('#gsInput');if(i){i.value='مدار ايمني';i.dispatchEvent(new Event('input'));}})()`); await wait(300);
    await T('global search handles Arabic ي and نیم‌فاصله without error', () => ev(`!document.querySelector('#gsOut') || (!document.querySelector('#gsOut').innerHTML.includes('undefined') && !document.querySelector('#gsOut').innerHTML.includes('null'))`));
    await ev(`closeModal();`);

    /* ================================================================
       SECOND PRODUCTION HARDENING (v28) — regression tests
       Each block pins a bug fixed in this hardening pass.
       ================================================================ */

    /* ---- PH10: insulation resistance must NOT use a universal 1 MΩ pass/fail ---- */
    const insEval = await ev(`evalMeasurement({ typeId: 'r_insulation', value: 2.5 })`);
    await T('insulation: 2.5 MΩ evaluates to UNKNOWN (no universal limit)', insEval && insEval.status === 'unknown', JSON.stringify(insEval));
    await T('insulation: reason states the limit is context-dependent', !!(insEval && insEval.reason && /نوع مدار|circuit/i.test(insEval.reason.fa + ' ' + (insEval.reason.en || ''))));
    const insLow = await ev(`evalMeasurement({ typeId: 'r_insulation', value: 0.4 })`);
    await T('insulation: 0.4 MΩ also stays UNKNOWN (context-dependent)', insLow && insLow.status === 'unknown', JSON.stringify(insLow));

    /* ---- PH12: standards articles expose edition + verification status ---- */
    await ev(`navigate('/standards');`); await waitLoaded();
    await ev(`openStdArticle('s-door-gap');`);
    await T('standards: formerly asserted item is downgraded to UNVERIFIED', () => ev(`(function(){var m=document.querySelector('#modalRoot').innerHTML;return m.includes('UNVERIFIED') && m.includes('در مخزن موجود نیست');})()`));
    await ev(`closeModal(); openStdArticle('s-well-light');`);
    await T('standards: every unsourced item shows UNVERIFIED badge', () => ev(`document.querySelector('#modalRoot').innerHTML.includes('UNVERIFIED')`));
    await ev(`closeModal();`);
    await T('standards: EN 81-20 set carries edition metadata', () => ev(`(function(){var s=STD_SETS.find(x=>x.id==='en81-20');return !!(s && s.edition && s.edition.fa);})()`));
    await T('standards: clause inconsistency fixed (s50-level → §5.12.1.1.4)', () => ev(`(function(){var a=STD8150.find(x=>x.id==='s50-level');return a && a.clause==='§5.12.1.1.4';})()`));
    await T('standards: s50-sgear/s50-buffer clauses aligned with test list', () => ev(`(function(){var g=STD8150.find(x=>x.id==='s50-sgear');var b=STD8150.find(x=>x.id==='s50-buffer');return g.clause==='§6.3.4' && b.clause==='§6.3.7';})()`));

    /* ---- PH11: leveling has no universal ±10/±20 hard threshold ---- */
    const lvlUnknown = await ev(`evalMeasurement({ typeId: 'lvl_err', value: 15 })`);
    await T('leveling: 15 mm → UNKNOWN without applicable verified/configured range', lvlUnknown && lvlUnknown.status === 'unknown', JSON.stringify(lvlUnknown));
    const lvlOk = await ev(`evalMeasurement({ typeId: 'lvl_err', value: 8, expectedMin: -10, expectedMax: 10, reference: 'project configuration' })`);
    await T('leveling: configured project range can evaluate 8 mm as normal', lvlOk && lvlOk.status === 'normal' && /ثبت‌شده|configured/.test(lvlOk.reason.fa + ' ' + (lvlOk.reason.en || '')), JSON.stringify(lvlOk));

    /* ---- PH5: permanent project delete preserves history with context stamp ---- */
    const pdelProj = await ev(`api('/projects', { method: 'POST', body: { name: 'پروژه حذفی QA', customer: 'مشتری تست', elevatorType: 'traction' } })`);
    const dpid = pdelProj.project.id;
    await ev(`api('/checklists', { method: 'POST', body: { templateId: 'en81-safety-audit', projectId: ${JSON.stringify('DPID')}, checked: { e1: 'pass' } } })`.replace('"DPID"', JSON.stringify(dpid)));
    const pdelMeas = await ev(`api('/measurements', { method: 'POST', body: { typeId: 'door_force', value: 120, projectId: ${JSON.stringify('DPID')} } })`.replace('"DPID"', JSON.stringify(dpid)));
    const pdelSvc = await ev(`api('/services', { method: 'POST', body: { projectId: ${JSON.stringify('DPID')}, customer: 'مشتری تست', problem: 'تست' } })`.replace('"DPID"', JSON.stringify(dpid)));
    await T('delete-flow: fixtures created', !!(pdelMeas.item && pdelSvc.service));
    const pdelRes = await ev(`api('/projects/' + ${JSON.stringify(dpid)}, { method: 'DELETE' })`);
    await T('delete-flow: project delete succeeds', !!(pdelRes && pdelRes.ok));
    const afterPdel = await ev(`(async()=>{const ck=await api('/checklists');const me=await api('/measurements');const sv=await api('/services');return {ck:ck.checklists.find(x=>x.projectId==='' && (x.projectInfo||'').includes('پروژه حذفی')), meas:me.items.find(x=>x.id===${JSON.stringify(pdelMeas.item.id)}), svc:sv.services.find(x=>x.id===${JSON.stringify(pdelSvc.service.id)})};})()`);
    await T('delete-flow: checklist survives (detached, not destroyed)', !!afterPdel.ck, JSON.stringify(afterPdel.ck).slice(0, 120));
    await T('delete-flow: measurement detached + stamped with project context', !!(afterPdel.meas && afterPdel.meas.projectId === '' && (afterPdel.meas.projectInfo || '').includes('پروژه حذفی')), JSON.stringify(afterPdel.meas).slice(0, 160));
    await T('delete-flow: service detached + keeps elevator context', !!(afterPdel.svc && afterPdel.svc.projectId === '' && (afterPdel.svc.elevatorInfo || afterPdel.svc.projectInfo || '').includes('پروژه حذفی')), JSON.stringify(afterPdel.svc).slice(0, 160));

    /* ---- PH19: parts-consume records shortage instead of silent clamp ---- */
    const shortPart = await ev(`api('/parts', { method: 'POST', body: { name: 'قطعه کمبود QA', category: 'تست', unit: 'عدد', qty: 1, min: 0, price: 1000 } })`);
    const shortRes = await ev(`api('/parts-consume', { method: 'POST', body: { partId: ${JSON.stringify(shortPart.part.id)}, qty: 3, note: 'QA short test' } })`);
    await T('inventory: over-consumption never goes negative (qty 1 − 3 → 0)', shortRes.part.qty === 0, JSON.stringify(shortRes.part.qty));
    await T('inventory: shortage surfaced (shortQty = 2)', shortRes.shortQty === 2, JSON.stringify(shortRes.shortQty));
    await T('inventory: shortage recorded in part history', !!(shortRes.part.history[0] && shortRes.part.history[0].shortQty === 2), JSON.stringify(shortRes.part.history[0]).slice(0, 140));
    const normPart = await ev(`api('/parts', { method: 'POST', body: { name: 'قطعه کافی QA', category: 'تست', unit: 'عدد', qty: 10, min: 0, price: 1000 } })`);
    const normRes = await ev(`api('/parts-consume', { method: 'POST', body: { partId: ${JSON.stringify(normPart.part.id)}, qty: 4 } })`);
    await T('inventory: normal consumption reports no shortage', normRes.shortQty === 0 && normRes.part.qty === 6);

    /* ---- PH19: invoice qty change consumes/returns the difference exactly once ----
       This pins the diff arithmetic the invoice form implements:
       prev-saved rows vs new rows -> single transactional consume/return per part. */
    const invPart = await ev(`api('/parts', { method: 'POST', body: { name: 'قطعه فاکتور QA', category: 'تست', unit: 'عدد', qty: 10, min: 0, price: 500000 } })`);
    const invPid = invPart.part.id;
    const stockNow = () => ev(`(async()=>{const r=await api('/parts');const p=r.parts.find(x=>x.id==='${invPid}');return p?p.qty:null;})()`);
    const invCreated = await ev(`(async()=>{
      const d=await api('/invoices',{method:'POST',body:{customer:'مصرف diff',items:[{desc:'قطعه فاکتور QA',qty:1,price:500000,partId:'${invPid}'}],labor:0,discount:0,taxRate:0,payments:[]}});
      return d.item;
    })()`);
    await T('invoice-diff: create with qty 1 consumes 1 (stock 10 -> 9)', await stockNow() === 9);
    await ev(`api('/invoices/'+'${invCreated.id}',{method:'PUT',body:{customer:'مصرف diff',items:[{desc:'قطعه فاکتور QA',qty:3,price:500000,partId:'${invPid}'}],labor:0,discount:0,taxRate:0,taxExempt:true,payments:[]}})`);
    await T('invoice-diff: qty 1 to 3 consumes exactly 2 more (stock 7)', await stockNow() === 7);
    await ev(`api('/invoices/'+'${invCreated.id}',{method:'PUT',body:{customer:'مصرف diff',items:[{desc:'قطعه فاکتور QA',qty:1,price:500000,partId:'${invPid}'}],labor:0,discount:0,taxRate:0,taxExempt:true,payments:[]}})`);
    await T('invoice-diff: qty 3 to 1 returns exactly 2 (stock back to 9)', await stockNow() === 9);
    await ev(`api('/invoices/'+'${invCreated.id}',{method:'DELETE'})`);
    await T('invoice-diff: delete invoice returns its qty (stock back to 10)', await stockNow() === 10);
    await T('invoice-diff: history totals reconcile with final stock', await ev(`(async()=>{
      const r=await api('/parts');
      const p=r.parts.find(x=>x.id==='${invPid}');
      const consumed=p.history.filter(h=>h.qty<0).reduce((a,h)=>a+(-h.qty),0);
      const returned=p.history.filter(h=>h.qty>0).reduce((a,h)=>a+h.qty,0);
      return (10+returned-consumed)===p.qty;
    })()`));

    /* ---- PH2 hardening: invoice totals, idempotency, shortages and rollback ---- */
    const totalsExact = await ev(`invTotals({items:[{qty:2,price:100001}],labor:50000,discount:25000,taxRate:9,taxExempt:false,payments:[{amount:100000},{amount:200000}]})`);
    await T('invoice totals: VAT uses post-discount base with integer rounding', totalsExact.base === 225002 && totalsExact.tax === 20250 && totalsExact.grand === 245252, JSON.stringify(totalsExact));
    await T('invoice totals: overpayment is separate and balance never negative', totalsExact.balance === 0 && totalsExact.overpayment === 54748, JSON.stringify(totalsExact));
    const totalsExempt = await ev(`invTotals({items:[{qty:1,price:99999}],labor:1,discount:0,taxRate:99,taxExempt:true,payments:[]})`);
    await T('invoice totals: tax exemption always forces zero VAT', totalsExempt.tax === 0 && totalsExempt.taxRate === 0 && totalsExempt.grand === 100000, JSON.stringify(totalsExempt));

    const idemPart = await ev(`api('/parts',{method:'POST',body:{name:'قطعه idempotent QA',category:'تست',unit:'عدد',qty:12,min:0,price:100}})`);
    const idemPid = idemPart.part.id;
    const idemBody = `{customer:'retry QA',clientMutationId:'qa-fixed-mutation-1',items:[{desc:'same part row A',qty:2,price:100,partId:'${idemPid}'},{desc:'same part row B',qty:3,price:100,partId:'${idemPid}'}],labor:0,discount:0,taxRate:0,payments:[]}`;
    const idemFirst = await ev(`api('/invoices',{method:'POST',body:${idemBody}})`);
    const idemSecond = await ev(`api('/invoices',{method:'POST',body:${idemBody}})`);
    await T('invoice duplicate rows aggregate to one stock delta', await ev(`(async()=>{const r=await api('/parts');return r.parts.find(x=>x.id==='${idemPid}').qty===7})()`));
    await T('invoice retry key returns the original invoice', idemSecond.duplicate === true && idemSecond.item.id === idemFirst.item.id && idemSecond.changedParts.length === 0, JSON.stringify(idemSecond));
    await T('invoice retry does not duplicate invoice or inventory history', await ev(`(async()=>{const ir=await api('/invoices');const pr=await api('/parts');const p=pr.parts.find(x=>x.id==='${idemPid}');return ir.items.filter(x=>x.clientMutationId==='qa-fixed-mutation-1').length===1 && p.history.filter(h=>h.invoiceId==='${idemFirst.item.id}').length===1})()`));

    const idemHistBefore = await ev(`(async()=>{const r=await api('/parts');return r.parts.find(x=>x.id==='${idemPid}').history.length})()`);
    await ev(`api('/invoices/'+'${idemFirst.item.id}',{method:'PUT',body:{customer:'retry QA',clientMutationId:'qa-fixed-mutation-1',items:[{desc:'same combined qty',qty:5,price:100,partId:'${idemPid}'}],payments:[{amount:123,date:123456,note:'partial'}],taxRate:9,labor:0,discount:0}})`);
    const idemAfterPayment = await ev(`(async()=>{const ir=await api('/invoices/'+ '${idemFirst.item.id}');const pr=await api('/parts');const p=pr.parts.find(x=>x.id==='${idemPid}');return {qty:p.qty,hist:p.history.length,pay:ir.item.payments[0].amount};})()`);
    await T('invoice payment-only/identical-qty edit has no second stock effect', idemAfterPayment.qty === 7 && idemAfterPayment.hist === idemHistBefore && idemAfterPayment.pay === 123, JSON.stringify(idemAfterPayment));

    const shortagePart = await ev(`api('/parts',{method:'POST',body:{name:'قطعه shortage invoice QA',category:'تست',unit:'عدد',qty:2,min:0,price:100}})`);
    const shortagePid = shortagePart.part.id;
    const invoiceCountBeforeShortage = await ev(`api('/invoices').then(r=>r.items.length)`);
    const sequenceBeforeShortage = await ev(`_lsLoad().settings.invoiceSeq`);
    const shortageAttempt = await ev(`api('/invoices',{method:'POST',body:{customer:'shortage QA',items:[{desc:'too many',qty:3,price:100,partId:'${shortagePid}'}]}}).then(()=>({ok:true})).catch(e=>({ok:false,code:e.code}))`);
    await T('invoice shortage is rejected with actionable code', shortageAttempt.ok === false && shortageAttempt.code === 'insufficient_stock', JSON.stringify(shortageAttempt));
    await T('invoice shortage leaves stock, invoice count and sequence unchanged', await ev(`(async()=>{const pr=await api('/parts');const ir=await api('/invoices');return pr.parts.find(x=>x.id==='${shortagePid}').qty===2 && ir.items.length===${invoiceCountBeforeShortage} && _lsLoad().settings.invoiceSeq===${sequenceBeforeShortage}})()`));
    const missingAttempt = await ev(`api('/invoices',{method:'POST',body:{customer:'missing part QA',items:[{desc:'missing',qty:1,price:1,partId:'does-not-exist'}]}}).then(()=>({ok:true})).catch(e=>({ok:false,code:e.code}))`);
    await T('invoice linked to a missing part is rejected without mutation', missingAttempt.ok === false && missingAttempt.code === 'invoice_part_not_found', JSON.stringify(missingAttempt));

    const rollbackPart = await ev(`api('/parts',{method:'POST',body:{name:'قطعه rollback QA',category:'تست',unit:'عدد',qty:4,min:0,price:100}})`);
    const rollbackPid = rollbackPart.part.id;
    const rollbackBefore = await ev(`({invoices:_lsLoad().invoices.length,seq:_lsLoad().settings.invoiceSeq,qty:_lsLoad().parts.find(x=>x.id==='${rollbackPid}').qty})`);
    const rollbackAttempt = await ev(`(async()=>{const real=_lsSave;_lsSave=async()=>{throw new Error('qa-commit-failure')};try{await api('/invoices',{method:'POST',body:{customer:'rollback QA',items:[{desc:'rollback part',qty:2,price:100,partId:'${rollbackPid}'}]}});return {ok:true}}catch(e){return {ok:false,message:e.message}}finally{_lsSave=real}})()`);
    const rollbackAfter = await ev(`({invoices:_lsLoad().invoices.length,seq:_lsLoad().settings.invoiceSeq,qty:_lsLoad().parts.find(x=>x.id==='${rollbackPid}').qty,history:(_lsLoad().parts.find(x=>x.id==='${rollbackPid}').history||[]).length})`);
    await T('invoice commit failure is surfaced', rollbackAttempt.ok === false && rollbackAttempt.message === 'qa-commit-failure', JSON.stringify(rollbackAttempt));
    await T('invoice commit failure rolls back stock, history, sequence and invoice', rollbackAfter.invoices === rollbackBefore.invoices && rollbackAfter.seq === rollbackBefore.seq && rollbackAfter.qty === rollbackBefore.qty && rollbackAfter.history === 0, JSON.stringify({rollbackBefore,rollbackAfter}));

    await ev(`api('/invoices/'+'${idemFirst.item.id}',{method:'DELETE'})`);
    const idemDeleteStock = await ev(`(async()=>{const r=await api('/parts');return r.parts.find(x=>x.id==='${idemPid}').qty})()`);
    const idemDeleteAgain = await ev(`api('/invoices/'+'${idemFirst.item.id}',{method:'DELETE'}).then(()=>({ok:true})).catch(e=>({ok:false,code:e.code}))`);
    await T('invoice delete returns linked stock exactly once', idemDeleteStock === 12);
    await T('repeated invoice delete cannot return stock twice', idemDeleteAgain.ok === false && idemDeleteAgain.code === 'not_found' && await ev(`(async()=>{const r=await api('/parts');return r.parts.find(x=>x.id==='${idemPid}').qty===12})()`));

    /* ---- PH2: photo payloads live in IndexedDB and hydrate for backup ---- */
    const tinyPhoto = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNsaGj4DwAFhAJ/wlseKgAAAABJRU5ErkJggg==';
    const phRes = await ev(`api('/photos', { method: 'POST', body: { data: ${JSON.stringify(tinyPhoto)}, cat: 'تست', projectId: '', note: 'idb' } })`);
    await T('photos: payload is offloaded to IndexedDB', !!(phRes.item && phRes.item.inIdb && phRes.item.data === ''), JSON.stringify(phRes.item || {}).slice(0, 100));
    const phHydrated = await ev(`IDB_PHOTOS.get(${JSON.stringify(phRes.item.id)})`);
    await T('photos: IndexedDB payload round-trips', phHydrated === tinyPhoto);
    const phDel = await ev(`api('/photos/' + ${JSON.stringify(phRes.item.id)}, { method: 'DELETE' })`);
    await T('photos: delete removes metadata and payload', !!(phDel && phDel.ok));

    /* ---- PH14: diagnostic evidence trail persists across answers (no restart) ---- */
    await ev(`diagExit && diagExit();`); await wait(80);
    await ev(`startDiagFlow('f01');`); await wait(80);
    await ev(`diagAnswer('p2', 'آیا تابلو برق دارد؟', 'بله، برق دارد');`); await wait(80);
    const diagState = await ev(`({ current: diagSession && diagSession.current, flowId: diagSession && diagSession.flowId, evidence: (diagSession && diagSession.evidence || []).length })`);
    await T('diagnostics: answer advances node without restarting the session', diagState && diagState.flowId === 'f01' && diagState.current === 'p2', JSON.stringify(diagState));
    await T('diagnostics: evidence trail records the answer', diagState && diagState.evidence >= 1);
    await ev(`diagExit();`);

    /* ---- PH3: backup is explicitly labelled LOCAL with its limitations ---- */
    await T('backup: local-backup title & limitation note exist in i18n', () => ev(`!!(I18N.fa.backupLocalTitle && I18N.fa.backupLocalLimits && I18N.en.backupLocalTitle && I18N.en.backupLocalLimits)`));
    await T('backup: limitation note names phone-loss/device-failure risks', () => ev(`/خرابی گوشی|phone loss|device failure/.test(I18N.fa.backupLocalLimits + I18N.en.backupLocalLimits)`));
    await T('backup: status is based on external JSON export, not local snapshot', () => ev(`(localStorage.removeItem('zlift_last_external_backup'), localStorage.setItem('zlift_last_local_backup', String(Date.now())), /No external|هیچ فایل/.test(backupStatusBadge()))`));

    /* ---- Data safety: realistic backup → clear → restore round-trip ---- */
    const backupRoundTrip = await ev(`(async()=>{
      const now = Date.now();
      const p1 = {id:'qa-pr-1', name:'QA Tower A', customer:'Client A', elevatorType:'traction', createdAt:now, updatedAt:now};
      const p2 = {id:'qa-pr-2', name:'QA Tower B', customer:'Client B', elevatorType:'hydraulic', createdAt:now, updatedAt:now};
      const part = {id:'qa-part-1', name:'Door roller', category:'Doors', unit:'pcs', qty:5, min:1, price:1000, history:[], createdAt:now, updatedAt:now};
      const service = {id:'qa-svc-1', projectId:p1.id, customer:p1.customer, elevatorInfo:p1.name, date:now, technician:'QA Tech', serviceType:'maintenance', problem:'noise', diagnosis:'roller', work:'adjusted', partsUsed:[{partId:part.id,name:part.name,qty:1}], finalStatus:'ok', createdAt:now, updatedAt:now};
      const backup = enrichBackupMetadata({app:'zlift', projects:[p1,p2], archivedProjects:[], services:[service], measurements:[{id:'qa-meas-1', projectId:p1.id, serviceId:service.id, typeId:'voltage', kind:'numeric', value:380, status:'normal', date:now, createdAt:now}], diagSessions:[{id:'qa-diag-1', projectId:p1.id, flowId:'f01', current:'done', evidence:[], createdAt:now, updatedAt:now}], checklists:[{id:'qa-ch-1', projectId:p1.id, type:'traction', items:{x:'pass'}, createdAt:now, updatedAt:now}], invoices:[{id:'qa-inv-1', number:'QA-1', projectId:p1.id, serviceId:service.id, customer:p1.customer, items:[{desc:'Door roller', qty:1, price:1000, partId:part.id}], payments:[{amount:1000,date:now,note:'paid'}], labor:0, discount:0, taxRate:0, createdAt:now, updatedAt:now}], parts:[part], notes:[{id:'qa-note-1', projectId:p1.id, text:'site note', createdAt:now, updatedAt:now}], issues:[{id:'qa-issue-1', projectId:p1.id, title:'follow up', status:'open', createdAt:now, updatedAt:now}], contracts:[], reminders:[], photos:[], calcSaves:[{id:'qa-calc-1', title:'calc', createdAt:now}], tools:[{id:'qa-tool-1', name:'meter', createdAt:now}], safetyLogs:[], settings:{company:'QA Lift', invoiceSeq:1}});
      const v = validateBackup(backup);
      if(!v.ok) return {ok:false, step:'validate', why:v.why};
      await api('/backup',{method:'PUT', body:{backup}});
      const exported = (await api('/backup')).backup;
      const exportedValid = validateBackup(exported);
      if(!exportedValid.ok || !exported.integrity || !exported.recordCounts) return {ok:false, step:'export', why:exportedValid.why};
      const empty = enrichBackupMetadata(Object.assign({}, backup, {projects:[], services:[], measurements:[], diagSessions:[], checklists:[], invoices:[], parts:[], notes:[], issues:[], calcSaves:[], tools:[]}));
      await api('/backup',{method:'PUT', body:{backup:empty}});
      await api('/backup',{method:'PUT', body:{backup:exported}});
      const restored = (await api('/backup')).backup;
      const c = backupCountMap(restored);
      const rel = restored.services[0].projectId === 'qa-pr-1' && restored.measurements[0].serviceId === 'qa-svc-1' && restored.invoices[0].items[0].partId === 'qa-part-1';
      return {ok:c.projects===2 && c.services===1 && c.measurements===1 && c.diagnostics===1 && c.checklists===1 && c.invoices===1 && c.inventory===1 && c.notes===1 && c.issues===1 && rel, counts:c, rel};
    })()`);
    await T('backup/restore: realistic dataset round-trips all key categories and relationships', backupRoundTrip && backupRoundTrip.ok, JSON.stringify(backupRoundTrip));
    await T('backup validation: newer unsupported backup is rejected safely', () => ev(`!validateBackup(Object.assign({}, (window.__qaLastBackup||{}), {app:'zlift', formatVersion:BACKUP_FORMAT_VERSION+1, projects:[]})).ok`));
    await T('backup validation: unknown top-level fields are not silently discarded', () => ev(`!validateBackup({app:'zlift', formatVersion:BACKUP_FORMAT_VERSION, projects:[], unexpectedField:true}).ok`));

    /* ---- PH2: interrupted migration marker is recovered idempotently ---- */
    const migrationLegacyRaw = await ev(`JSON.stringify(_lsLoad())`);
    const migrationExpectedProjects = await ev(`_lsLoad().projects.length`);
    await ev(`localStorage.setItem('zlift_db', ${JSON.stringify(migrationLegacyRaw)})`);
    await ev(`STRUCTURED_DB.clear()`);
    await ev(`new Promise((resolve,reject)=>{const q=indexedDB.open('zlift-data',3);q.onsuccess=()=>{const tx=q.result.transaction('metadata','readwrite');tx.objectStore('metadata').put({key:'migration',version:STRUCTURED_DB.migrationVersion,status:'copying',startedAt:1,source:'qa-interruption'});tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error)}})`);
    const migrationRecoveredMode = await ev(`STRUCTURED_DB.ready()`);
    const migrationMarker = await ev(`new Promise((resolve,reject)=>{const q=indexedDB.open('zlift-data',3);q.onsuccess=()=>{const tx=q.result.transaction('metadata','readonly');const g=tx.objectStore('metadata').get('migration');g.onsuccess=()=>resolve(g.result);g.onerror=()=>reject(g.error)}})`);
    await T('migration resumes a copying/interrupted marker and verifies before completion', migrationRecoveredMode === 'indexedDB' && migrationMarker.status === 'complete' && migrationMarker.verifiedAt >= migrationMarker.startedAt && !!migrationMarker.sourceFingerprint, JSON.stringify(migrationMarker));
    await T('migration recovery preserves counts and does not duplicate records', await ev(`_lsLoad().projects.length===${migrationExpectedProjects} && new Set(_lsLoad().projects.map(x=>x.id)).size===_lsLoad().projects.length`));
    await T('migration recovery never deletes or rewrites the legacy source', await ev(`localStorage.getItem('zlift_db')===${JSON.stringify(migrationLegacyRaw)}`));

    /* ---- PHASE 2A: BUG-1 archive persistence (real API → IDB path) ---- */
    const p2aArchive = await ev(`(async()=>{
      const mk = name => api('/projects', { method: 'POST', body: { name } }).then(d => d.project);
      const pA = await mk('P2A-Archive-A');
      const pB = await mk('P2A-Archive-B');
      if (!pA || !pB) return { ok: false, step: 'create' };
      const ts = Date.now();
      const put = await api('/projects/' + pA.id, { method: 'PUT', body: { archived: true, archivedAt: ts } });
      if (!put.project || put.project.archived !== true || put.project.archivedAt !== ts) return { ok: false, step: 'put-response' };
      /* clone the aggregate and re-read the database: the flag must live in
         IndexedDB itself, not in a shared object reference */
      const freshRead = () => STRUCTURED_DB.verifyAggregate(JSON.parse(JSON.stringify(_lsDB)));
      const f1 = await freshRead();
      const fA = f1.projects.find(x => x.id === pA.id);
      const fB = f1.projects.find(x => x.id === pB.id);
      if (!fA || fA.archived !== true || fA.archivedAt !== ts) return { ok: false, step: 'fresh-read' };
      if (!fB || fB.archived === true) return { ok: false, step: 'sibling-isolation' };
      /* a normal field edit must not clear the archive flags (whitelist semantics) */
      const upd = await api('/projects/' + pA.id, { method: 'PUT', body: { name: 'P2A-Archive-A-renamed' } });
      if (!upd.project || upd.project.archived !== true || upd.project.archivedAt !== ts) return { ok: false, step: 'edit-keeps-archive' };
      /* archive → re-read → archive again (repeat operation) */
      const ts2 = Date.now() + 5;
      await api('/projects/' + pA.id, { method: 'PUT', body: { archived: true, archivedAt: ts2 } });
      const f2 = await freshRead();
      const fA2 = f2.projects.find(x => x.id === pA.id);
      if (!fA2 || fA2.archived !== true || fA2.archivedAt !== ts2) return { ok: false, step: 're-archive' };
      /* data-layer unarchive is supported (UI has no button — documented) */
      const un = await api('/projects/' + pA.id, { method: 'PUT', body: { archived: false } });
      const f3 = await freshRead();
      const fA3 = f3.projects.find(x => x.id === pA.id);
      if (!un.project || un.project.archived !== false || !fA3 || fA3.archived !== false) return { ok: false, step: 'unarchive-api' };
      /* re-archive for the backup/restore check below */
      await api('/projects/' + pA.id, { method: 'PUT', body: { archived: true, archivedAt: ts2 } });
      return { ok: true, id: pA.id, other: pB.id };
    })()`);
    await T('P2A BUG-1: archive persists explicitly through the real API/IndexedDB path (clone-independent, edit-safe, repeatable)', p2aArchive && p2aArchive.ok, JSON.stringify(p2aArchive));
    const p2aArchiveBackup = await ev(`(async()=>{
      const exported = (await api('/backup')).backup;
      const v = validateBackup(exported);
      if (!v.ok) return { ok: false, step: 'export-invalid:' + v.why };
      await api('/backup', { method: 'PUT', body: { backup: exported } });
      const fresh = await STRUCTURED_DB.verifyAggregate(JSON.parse(JSON.stringify(_lsDB)));
      const p = fresh.projects.find(x => x.name === 'P2A-Archive-A-renamed');
      return { ok: !!p && p.archived === true && typeof p.archivedAt === 'number' && p.archivedAt > 0 };
    })()`);
    await T('P2A BUG-1: archived project survives backup → restore → verified re-read', p2aArchiveBackup && p2aArchiveBackup.ok, JSON.stringify(p2aArchiveBackup));

    /* ---- PHASE 2A: BUG-2 delete/detach completeness ---- */
    const p2aDelete = await ev(`(async()=>{
      const mk = name => api('/projects', { method: 'POST', body: { name } }).then(d => d.project);
      const pA = await mk('P2A-Del-A');
      const pB = await mk('P2A-Del-B');
      const csA = (await api('/calcSaves', { method: 'POST', body: { calcId: 'c9', name: 't', inputs: [], results: [], projectId: pA.id } })).item;
      const csB = (await api('/calcSaves', { method: 'POST', body: { calcId: 'c9', name: 't2', inputs: [], results: [], projectId: pB.id } })).item;
      const slA = (await api('/safetyLogs', { method: 'POST', body: { checklistId: 'tpl', projectId: pA.id, acknowledged: true } })).item;
      const svA = (await api('/services', { method: 'POST', body: { projectId: pA.id, customer: '', elevatorInfo: '', problem: 'x' } })).service;
      const svB = (await api('/services', { method: 'POST', body: { projectId: pB.id, customer: '', elevatorInfo: '', problem: 'y' } })).service;
      await api('/projects/' + pA.id, { method: 'DELETE' });
      const fresh = await STRUCTURED_DB.verifyAggregate(JSON.parse(JSON.stringify(_lsDB)));
      const csA2 = fresh.calcSaves.find(x => x.id === csA.id);
      const csB2 = fresh.calcSaves.find(x => x.id === csB.id);
      const slA2 = fresh.safetyLogs.find(x => x.id === slA.id);
      const svA2 = fresh.services.find(x => x.id === svA.id);
      const svB2 = fresh.services.find(x => x.id === svB.id);
      return {
        ok: csA2 && csA2.projectId === '' && String(csA2.projectInfo || '').includes('P2A-Del-A')   /* detached + stamped, not deleted */
         && slA2 && slA2.projectId === '' && String(slA2.projectInfo || '').includes('P2A-Del-A')
         && csB2 && csB2.projectId === pB.id                                                          /* sibling untouched */
         && svA2 && svA2.projectId === '' && svA2.customer === 'P2A-Del-A'                            /* legacy detach behavior preserved */
         && svB2 && svB2.projectId === pB.id
         && !fresh.projects.some(x => x.id === pA.id) && fresh.projects.some(x => x.id === pB.id)
      };
    })()`);
    await T('P2A BUG-2: project delete detaches calcSaves & safetyLogs (stamped, no dangling refs; siblings & legacy service behavior intact)', p2aDelete && p2aDelete.ok, JSON.stringify(p2aDelete));

    const p2aDangling = await ev(`(async()=>{
      const injectAndExpectThrow = async (coll) => {
        const rec = _lsDB[coll][0];
        const keep = rec.projectId;
        rec.projectId = 'ghost-project-p2a';
        await _lsSave();                                    /* real persistence path */
        let threw = false;
        try { await STRUCTURED_DB.verifyAggregate(JSON.parse(JSON.stringify(_lsDB))); }
        catch (e) { threw = String(e && e.message || '').includes('structured-relation:' + coll); }
        const repaired = STRUCTURED_DB.repairProjectRefs(_lsDB);   /* canonical repair on the real aggregate */
        await _lsSave();
        let okAfter = false;
        try { await STRUCTURED_DB.verifyAggregate(JSON.parse(JSON.stringify(_lsDB))); okAfter = true; } catch (e) {}
        rec.projectId = keep; /* restore context for later tests (already '' post-repair) */
        return threw && repaired && okAfter;
      };
      const calcOk = await injectAndExpectThrow('calcSaves');
      const safetyOk = await injectAndExpectThrow('safetyLogs');
      return { ok: calcOk && safetyOk, calcOk, safetyOk };
    })()`);
    await T('P2A BUG-2: strict relationship verification detects injected dangling calcSaves AND safetyLogs refs; canonical repair restores integrity', p2aDangling && p2aDangling.ok, JSON.stringify(p2aDangling));
    await T('P2A BUG-2: backup audit surfaces dangling calcSaves/safetyLogs refs as warnings (legacy backups stay restorable)', () => ev(`(function(){
      const now = Date.now();
      const bk = { app:'zlift', formatVersion:BACKUP_FORMAT_VERSION, dbSchemaVersion:DB_SCHEMA_VERSION,
        projects:[{id:'p1', name:'x', createdAt:now, updatedAt:now}], archivedProjects:[],
        services:[], notes:[], checklists:[], parts:[], diagSessions:[],
        calcSaves:[{id:'c1', projectId:'ghost', title:'legacy calc', createdAt:now, updatedAt:now}],
        issues:[], tools:[], photos:[], invoices:[], contracts:[], reminders:[], measurements:[],
        safetyLogs:[{id:'s1', projectId:'ghost', checklistId:'t', createdAt:now, updatedAt:now}], settings:{} };
      const a = auditBackupData(bk);
      return a.ok && a.warnings.some(w => w.indexOf('calcSaves:project-relation:') === 0)
        && a.warnings.some(w => w.indexOf('safetyLogs:project-relation:') === 0);
    })()`));

    /* ---- PHASE 2A: OBS-2 vestigial archivedProjects disposition ---- */
    const p2aObs = await ev(`(async()=>{
      /* pure fold helper: valid entry folded, duplicate dropped, malformed kept */
      const db1 = { projects: [{id:'p1', name:'live'}], archivedProjects: [
        {id:'pa1', name:'Old Tower', createdAt:1, updatedAt:2},
        {id:'p1', name:'duplicate-of-live'},
        {notAnId:true}
      ]};
      const changed = STRUCTURED_DB.foldArchivedProjects(db1);
      const foldOk = changed === true && db1.projects.length === 2 && db1.projects[1].id === 'pa1'
        && db1.projects[1].archived === true && db1.projects[1].archivedAt === 2
        && db1.archivedProjects.length === 1 /* malformed row is never deleted */;
      /* the collection left the live model: validate() no longer gates on it */
      const validateIgnores = STRUCTURED_DB.validate({ projects: [], users: [], archivedProjects: 'garbage-not-an-array' }).ok === true;
      /* legacy backup carrying archivedProjects entries + a dangling legacy calcSave:
         import stays valid (warnings only) and restore folds/repairs everything */
      const now = Date.now();
      const legacy = enrichBackupMetadata({ app:'zlift', projects:[{id:'qa-pr-live', name:'Live Tower', elevatorType:'traction', createdAt:now, updatedAt:now}],
        archivedProjects:[{id:'qa-pr-arch', name:'Legacy Archived Tower', elevatorType:'hydraulic', createdAt:now-5, updatedAt:now-4}],
        services:[], notes:[], checklists:[], parts:[], diagSessions:[],
        calcSaves:[{id:'qa-calc-dangling', projectId:'qa-pr-gone', title:'legacy calc', createdAt:now, updatedAt:now}],
        issues:[], tools:[], photos:[], invoices:[], contracts:[], reminders:[], measurements:[], safetyLogs:[], settings:{} });
      const v = validateBackup(legacy);
      if (!v.ok) return { ok: false, step: 'legacy-validate:' + v.why, foldOk };
      await api('/backup', { method: 'PUT', body: { backup: legacy } });
      const fresh = await STRUCTURED_DB.verifyAggregate(JSON.parse(JSON.stringify(_lsDB)));
      const live = fresh.projects.find(x => x.id === 'qa-pr-live');
      const arch = fresh.projects.find(x => x.id === 'qa-pr-arch');
      const calcFixed = fresh.calcSaves.find(x => x.id === 'qa-calc-dangling');
      const exported = (await api('/backup')).backup;
      const exportClean = Array.isArray(exported.archivedProjects) && exported.archivedProjects.length === 0;
      return { ok: foldOk && validateIgnores && live && arch && arch.archived === true
        && calcFixed && calcFixed.projectId === '' && exportClean, foldOk, validateIgnores };
    })()`);
    await T('P2A OBS-2: legacy archivedProjects entries fold into archived projects (never deleted); dangling legacy calcSave restored via documented detach; export carries the empty collection', p2aObs && p2aObs.ok, JSON.stringify(p2aObs));

    /* ---- PHASE 2A VERIFICATION — BUG-3: repair/recovery must not produce
       poorer history than the normal delete path ----
       Scenario A (project exists → technician deletes it) detaches AND stamps.
       Scenario B (old device already carries a dangling projectId → boot runs
       repairProjectRefs) used to only blank projectId, turning the record into
       an unexplained orphan. Both paths must leave usable historical context. */
    const p2aRepairParity = await ev(`(async()=>{
      const mk = n => api('/projects', { method: 'POST', body: { name: n, customer: 'Cust-' + n, location: 'Loc-' + n } }).then(d => d.project);
      /* SCENARIO A — normal delete */
      const pA = await mk('P2A-Parity-A');
      const csA = (await api('/calcSaves', { method: 'POST', body: { calcId: 'c1', name: 'calcA', projectId: pA.id } })).item;
      const slA = (await api('/safetyLogs', { method: 'POST', body: { checklistId: 't', projectId: pA.id } })).item;
      await api('/projects/' + pA.id, { method: 'DELETE' });
      const aCalc = _lsDB.calcSaves.find(x => x.id === csA.id);
      const aSafe = _lsDB.safetyLogs.find(x => x.id === slA.id);
      const aOk = aCalc && aCalc.projectId === '' && String(aCalc.projectInfo || '').includes('P2A-Parity-A')
               && aSafe && aSafe.projectId === '' && String(aSafe.projectInfo || '').includes('P2A-Parity-A');
      /* SCENARIO B — legacy dangling ref repaired at boot */
      const pB = await mk('P2A-Parity-B');
      const csB = (await api('/calcSaves', { method: 'POST', body: { calcId: 'c1', name: 'calcB', projectId: pB.id } })).item;
      const slB = (await api('/safetyLogs', { method: 'POST', body: { checklistId: 't', projectId: pB.id } })).item;
      const lostId = pB.id;
      _lsDB.projects = _lsDB.projects.filter(x => x.id !== lostId);   /* legacy delete that missed the detach */
      const repaired = STRUCTURED_DB.repairProjectRefs(_lsDB);
      await _lsSave();
      const bCalc = _lsDB.calcSaves.find(x => x.id === csB.id);
      const bSafe = _lsDB.safetyLogs.find(x => x.id === slB.id);
      /* the record must SURVIVE, be detached, and still carry context — not a bare orphan */
      const bOk = repaired
        && bCalc && bCalc.projectId === '' && !!bCalc.projectInfo && String(bCalc.projectInfo).includes(lostId)
        && bSafe && bSafe.projectId === '' && !!bSafe.projectInfo && String(bSafe.projectInfo).includes(lostId)
        && bCalc.name === 'calcB';   /* the record's own payload is untouched */
      /* the repaired aggregate must pass strict verification (device stays on IndexedDB) */
      let verifyOk = false;
      try { await STRUCTURED_DB.verifyAggregate(JSON.parse(JSON.stringify(_lsDB))); verifyOk = true; } catch (e) {}
      return { ok: aOk && bOk && verifyOk, aOk, bOk, verifyOk };
    })()`);
    await T('P2A BUG-3: recovery repair is equivalent to normal delete — surviving records keep historical context instead of becoming bare orphans', p2aRepairParity && p2aRepairParity.ok, JSON.stringify(p2aRepairParity));

    /* ---- PHASE 2A VERIFICATION — BUG-4: repair coverage must equal strict
       verification coverage ----
       verifyAggregate rejects a dangling projectId in 11 collections, but the
       repair pass only normalized 2 of them. A legacy dangling ref in any of
       the other 9 made boot verification throw on every start and permanently
       stranded the device in the localStorage fallback. */
    await T('P2A BUG-4: repairProjectRefs normalizes every project-owned collection that strict verification checks (no unrecoverable boot)', () => ev(`(function(){
      const cols = ['services','invoices','contracts','checklists','measurements','reminders','photos','diagSessions','issues','calcSaves','safetyLogs'];
      const db = { projects: [{ id: 'live' }] };
      cols.forEach((k, i) => { db[k] = [{ id: 'dg-' + i, projectId: 'ghost-project' }]; });
      const changed = STRUCTURED_DB.repairProjectRefs(db);
      const allDetached = cols.every(k => db[k][0].projectId === '');
      const allStamped  = cols.every(k => !!db[k][0].projectInfo && String(db[k][0].projectInfo).includes('ghost-project'));
      const noneDeleted = cols.every(k => db[k].length === 1);
      /* idempotent: a second pass reports no further change and does not re-stamp */
      const second = STRUCTURED_DB.repairProjectRefs(db);
      return changed === true && allDetached && allStamped && noneDeleted && second === false;
    })()`));

    /* an existing, valid stamp from the richer delete path is never overwritten
       by the poorer recovery stamp */
    await T('P2A BUG-4: recovery repair never downgrades a context stamp already written by the delete path', () => ev(`(function(){
      const db = { projects: [], calcSaves: [{ id: 'c1', projectId: 'ghost', projectInfo: 'Tower A — Client — Tehran' }] };
      STRUCTURED_DB.repairProjectRefs(db);
      return db.calcSaves[0].projectId === '' && db.calcSaves[0].projectInfo === 'Tower A — Client — Tehran';
    })()`));

    /* ordering guard: archived projects are folded back BEFORE refs are
       repaired, so a legitimately archived project never gets its records
       falsely detached */
    await T('P2A BUG-4: fold-before-repair ordering keeps records attached to a legacy archived project', () => ev(`(function(){
      const db = { projects: [], archivedProjects: [{ id: 'pa', name: 'Arch Tower', updatedAt: 9 }],
        calcSaves: [{ id: 'c9', projectId: 'pa' }] };
      STRUCTURED_DB.foldArchivedProjects(db);
      STRUCTURED_DB.repairProjectRefs(db);
      return db.calcSaves[0].projectId === 'pa' && db.projects[0].archived === true;
    })()`));

    /* ---- PHASE 2A VERIFICATION — project isolation across all six record
       kinds required by the verification brief ---- */
    const p2aIsolation = await ev(`(async()=>{
      const mk = n => api('/projects', { method: 'POST', body: { name: n, customer: 'C-' + n, location: 'L-' + n } }).then(d => d.project);
      const A = await mk('P2A-Iso-A');
      const B = await mk('P2A-Iso-B');
      const seed = async (p) => ({
        service:     (await api('/services',     { method: 'POST', body: { projectId: p.id, customer: 'c', problem: 'p' } })).service,
        measurement: (await api('/measurements', { method: 'POST', body: { projectId: p.id, typeId: 'voltage', value: 380 } })).item,
        diag:        (await api('/diagSessions', { method: 'POST', body: { projectId: p.id, flowId: 'f01', current: 'n1' } })).item,
        checklist:   (await api('/checklists',   { method: 'POST', body: { projectId: p.id, templateId: 'traction-install', checked: {} } })).checklist,
        calc:        (await api('/calcSaves',    { method: 'POST', body: { projectId: p.id, calcId: 'c1', name: 'k' } })).item,
        safety:      (await api('/safetyLogs',   { method: 'POST', body: { projectId: p.id, checklistId: 't' } })).item
      });
      const recA = await seed(A), recB = await seed(B);
      const snapB = JSON.stringify(recB);
      await api('/projects/' + A.id, { method: 'DELETE' });
      const fresh = await STRUCTURED_DB.verifyAggregate(JSON.parse(JSON.stringify(_lsDB)));
      const find = (coll, id) => (fresh[coll] || []).find(x => x.id === id);
      /* Project B is completely untouched */
      const bIntact =
           find('services', recB.service.id)         && find('services', recB.service.id).projectId === B.id
        && find('measurements', recB.measurement.id) && find('measurements', recB.measurement.id).projectId === B.id
        && find('diagSessions', recB.diag.id)        && find('diagSessions', recB.diag.id).projectId === B.id
        && find('checklists', recB.checklist.id)     && find('checklists', recB.checklist.id).projectId === B.id
        && find('calcSaves', recB.calc.id)           && find('calcSaves', recB.calc.id).projectId === B.id
        && find('safetyLogs', recB.safety.id)        && find('safetyLogs', recB.safety.id).projectId === B.id
        && fresh.projects.some(x => x.id === B.id);
      /* Project A's records all survive, detached and stamped */
      const kinds = [['services', recA.service.id], ['measurements', recA.measurement.id], ['diagSessions', recA.diag.id],
                     ['checklists', recA.checklist.id], ['calcSaves', recA.calc.id], ['safetyLogs', recA.safety.id]];
      const aPreserved = kinds.every(([coll, id]) => {
        const r = find(coll, id);
        return r && r.projectId === '' && String(r.projectInfo || r.elevatorInfo || '').includes('P2A-Iso-A');
      });
      const aGone = !fresh.projects.some(x => x.id === A.id);
      return { ok: bIntact && aPreserved && aGone, bIntact, aPreserved, aGone, snapB: snapB.length > 0 };
    })()`);
    await T('P2A ISOLATION: deleting project A preserves all six of its record kinds with context and leaves project B completely untouched', p2aIsolation && p2aIsolation.ok, JSON.stringify(p2aIsolation));

    /* ---- PHASE 2A VERIFICATION — detached history survives a full
       backup → restore round-trip with its context intact ---- */
    const p2aHistoryBackup = await ev(`(async()=>{
      const p = (await api('/projects', { method: 'POST', body: { name: 'P2A-Hist', customer: 'HistCo', location: 'Shiraz' } })).project;
      const calc = (await api('/calcSaves', { method: 'POST', body: { projectId: p.id, calcId: 'c1', name: 'histcalc' } })).item;
      const svc  = (await api('/services',  { method: 'POST', body: { projectId: p.id, customer: '', problem: 'hist' } })).service;
      await api('/projects/' + p.id, { method: 'DELETE' });
      const exported = (await api('/backup')).backup;
      const v = validateBackup(exported);
      if (!v.ok) return { ok: false, step: 'export:' + v.why };
      await api('/backup', { method: 'PUT', body: { backup: exported } });
      const fresh = await STRUCTURED_DB.verifyAggregate(JSON.parse(JSON.stringify(_lsDB)));
      const c = fresh.calcSaves.find(x => x.id === calc.id);
      const s = fresh.services.find(x => x.id === svc.id);
      /* the service keeps BOTH its own customer field and the project stamp */
      return { ok: !!c && c.projectId === '' && String(c.projectInfo || '').includes('P2A-Hist')
                && !!s && s.projectId === '' && String(s.projectInfo || '').includes('P2A-Hist')
                && s.customer === 'HistCo' };
    })()`);
    await T('P2A HISTORY: detached-and-stamped records keep their elevator context through export → import → verified re-read', p2aHistoryBackup && p2aHistoryBackup.ok, JSON.stringify(p2aHistoryBackup));

    /* ================= PHASE 2B.0 — BLOCKER REMEDIATION =================
       BUG-1 checklist logical identity, BUG-2 nested parts.history project
       references. BUG-3 (writeAggregate transaction behaviour + performance)
       runs in the dedicated qa/perf.js runner, so its large synthetic
       aggregates and deliberate transaction failures cannot perturb this
       suite. No Multi-Elevator model is introduced anywhere below: the
       elevator dimension exists only as an optional identity component. */

    /* ---- BUG-1: the canonical identity helpers (pure, no storage) ---- */
    await T('P2B0 BUG-1: checklist identity resolves the elevator dimension with a 1:1 fallback to projectId', () => ev(`(function(){
      /* no elevator dimension → identity is the project, exactly as before */
      if (checklistKeyOf({ projectId: 'P1', templateId: 'T1' }) !== checklistKey('P1', 'P1', 'T1')) return false;
      /* explicit elevator dimension → identity is the elevator, inside its project */
      if (checklistKeyOf({ projectId: 'P1', elevatorId: 'E1', templateId: 'T1' }) !== checklistKey('P1', 'E1', 'T1')) return false;
      /* the project stays in the key: the same elevator label in another
         project is a different instance, never a match */
      if (checklistKeyOf({ projectId: 'P1', elevatorId: 'E1', templateId: 'T1' })
       === checklistKeyOf({ projectId: 'P2', elevatorId: 'E1', templateId: 'T1' })) return false;
      /* detached (project deleted) → empty elevator dimension, never "any" */
      if (checklistElevatorId({ projectId: '', templateId: 'T1' }) !== '') return false;
      /* the two contexts are different keys */
      return checklistKeyOf({ projectId: 'P1', elevatorId: 'E1', templateId: 'T1' })
          !== checklistKeyOf({ projectId: 'P1', elevatorId: 'E2', templateId: 'T1' });
    })()`));

    await T('P2B0 BUG-1: a legacy record and a legacy request still match each other (no migration needed)', () => ev(`(function(){
      const legacy = { id: 'c1', projectId: 'P1', templateId: 'T1', checked: { a: 'pass' } };
      const future = { id: 'c2', projectId: 'P1', elevatorId: 'E1', templateId: 'T1', checked: {} };
      /* legacy ↔ legacy still resolves, so existing data stays readable */
      if (findChecklistInstance([legacy], 'P1', 'T1') !== legacy) return false;
      if (findChecklistInstance([legacy], 'P1', 'T1', 'P1') !== legacy) return false;
      /* and a record carrying the future dimension is never matched by a
         request that omits it — in either direction */
      if (findChecklistInstance([future], 'P1', 'T1') !== null) return false;
      return findChecklistInstance([future], 'P1', 'T1', 'E1') === future;
    })()`));

    await T('P2B0 BUG-1: a malformed inbound elevatorId cannot poison the identity', () => ev(`(function(){
      return normalizeChecklistElevatorId(undefined) === '' && normalizeChecklistElevatorId(null) === ''
        && normalizeChecklistElevatorId(42) === '' && normalizeChecklistElevatorId({}) === ''
        && normalizeChecklistElevatorId('   ') === '' && normalizeChecklistElevatorId(' E1 ') === 'E1'
        && normalizeChecklistElevatorId('x'.repeat(500)) === '';
    })()`));

    /* ---- BUG-1 CASE A: the existing single-elevator behaviour is unchanged ---- */
    const p2b0CaseA = await ev(`(async()=>{
      const p = (await api('/projects', { method: 'POST', body: { name: 'P2B0-CaseA', elevatorType: 'traction' } })).project;
      const first = (await api('/checklists', { method: 'POST', body: { projectId: p.id, templateId: 'traction-install', checked: { a1: 'pass' } } })).checklist;
      const second = (await api('/checklists', { method: 'POST', body: { projectId: p.id, templateId: 'traction-install', checked: { a1: 'fail', a2: 'na' } } })).checklist;
      const stored = (await api('/checklists')).checklists.filter(c => c.projectId === p.id);
      const fresh = await STRUCTURED_DB.verifyAggregate(JSON.parse(JSON.stringify(_lsDB)));
      const reread = fresh.checklists.filter(c => c.projectId === p.id);
      return {
        /* upsert, not duplicate: one record, same id, latest answers */
        ok: stored.length === 1 && reread.length === 1 && first.id === second.id
          && first.id !== 'tmp' && second.checked.a1 === 'fail' && second.checked.a2 === 'na'
          /* no elevator field is introduced for a caller that did not ask for one */
          && !('elevatorId' in first) && !('elevatorId' in reread[0])
          && second.updatedAt >= first.updatedAt,
        ids: [first.id, second.id], keys: Object.keys(reread[0]).sort()
      };
    })()`);
    await T('P2B0 BUG-1 CASE A: single existing elevator context behaves exactly as before (upsert, same id, no new field)', p2b0CaseA && p2b0CaseA.ok, JSON.stringify(p2b0CaseA));

    /* ---- BUG-1 CASE B: two logical elevator contexts, one project, one template ---- */
    const p2b0CaseB = await ev(`(async()=>{
      const p = (await api('/projects', { method: 'POST', body: { name: 'P2B0-CaseB', elevatorType: 'traction' } })).project;
      /* the future elevator dimension, modelled at the data layer only — there
         is deliberately no elevator collection, picker, route or UI for it */
      const a1 = (await api('/checklists', { method: 'POST', body: { projectId: p.id, elevatorId: 'ELEV-A', templateId: 'traction-install', checked: { a1: 'pass' } } })).checklist;
      const b1 = (await api('/checklists', { method: 'POST', body: { projectId: p.id, elevatorId: 'ELEV-B', templateId: 'traction-install', checked: { a1: 'fail' } } })).checklist;
      /* repeated saves must stay idempotent: same two rows, no duplicates */
      const a2 = (await api('/checklists', { method: 'POST', body: { projectId: p.id, elevatorId: 'ELEV-A', templateId: 'traction-install', checked: { a1: 'pass', a5: 'na' } } })).checklist;
      const b2 = (await api('/checklists', { method: 'POST', body: { projectId: p.id, elevatorId: 'ELEV-B', templateId: 'traction-install', checked: { a1: 'fail', a7: 'pass' } } })).checklist;
      const stored = (await api('/checklists')).checklists.filter(c => c.projectId === p.id);
      const fresh = await STRUCTURED_DB.verifyAggregate(JSON.parse(JSON.stringify(_lsDB)));
      const reread = fresh.checklists.filter(c => c.projectId === p.id);
      const A = reread.find(c => c.elevatorId === 'ELEV-A'), B = reread.find(c => c.elevatorId === 'ELEV-B');
      return {
        /* isolation: neither context can overwrite the other's answers */
        ok: stored.length === 2 && reread.length === 2 && a1.id !== b1.id && a1.id === a2.id && b1.id === b2.id
          && !!A && !!B && A.id !== B.id
          && A.checked.a1 === 'pass' && A.checked.a5 === 'na' && A.checked.a7 === undefined
          && B.checked.a1 === 'fail' && B.checked.a7 === 'pass' && B.checked.a5 === undefined
          && new Set(reread.map(c => c.id)).size === 2,
        project: p.id, ids: [a1.id, b1.id], counts: { stored: stored.length, reread: reread.length }
      };
    })()`);
    await T('P2B0 BUG-1 CASE B: two elevator contexts in one project with one template cannot overwrite each other (save/update/load/repeat)', p2b0CaseB && p2b0CaseB.ok, JSON.stringify(p2b0CaseB));

    /* ---- BUG-1: the same elevator label in two different projects must stay
       two separate instances. The identity keeps the project in the key
       precisely for this: nothing in the current model guarantees that
       elevator identifiers are globally unique. ---- */
    const p2b0CrossProject = await ev(`(async()=>{
      const p1 = (await api('/projects', { method: 'POST', body: { name: 'P2B0-XP-1', elevatorType: 'traction' } })).project;
      const p2 = (await api('/projects', { method: 'POST', body: { name: 'P2B0-XP-2', elevatorType: 'traction' } })).project;
      const a = (await api('/checklists', { method: 'POST', body: { projectId: p1.id, elevatorId: 'CAR-1', templateId: 'traction-install', checked: { a1: 'pass' } } })).checklist;
      const b = (await api('/checklists', { method: 'POST', body: { projectId: p2.id, elevatorId: 'CAR-1', templateId: 'traction-install', checked: { a1: 'fail' } } })).checklist;
      /* snapshot as plain values: api() hands back live references into the
         in-memory aggregate, which the delete below mutates in place */
      const aProject = a.projectId, bProject = b.projectId;
      const fresh = await STRUCTURED_DB.verifyAggregate(JSON.parse(JSON.stringify(_lsDB)));
      const ra = fresh.checklists.find(c => c.id === a.id), rb = fresh.checklists.find(c => c.id === b.id);
      /* deleting one project must not touch the other project's instance */
      await api('/projects/' + p1.id, { method: 'DELETE' });
      const after = await STRUCTURED_DB.verifyAggregate(JSON.parse(JSON.stringify(_lsDB)));
      const da = after.checklists.find(c => c.id === a.id), db = after.checklists.find(c => c.id === b.id);
      return {
        ok: a.id !== b.id && aProject === p1.id && bProject === p2.id
          && !!ra && !!rb && ra.checked.a1 === 'pass' && rb.checked.a1 === 'fail'
          && !!da && !!db && da.projectId === '' && db.projectId === p2.id
          && String(da.projectInfo || '').includes('P2B0-XP-1') && db.projectInfo === undefined
          && db.checked.a1 === 'fail',
        ids: [a.id, b.id]
      };
    })()`);
    await T('P2B0 BUG-1: the same elevator label in two different projects stays two isolated instances (project is part of the key)', p2b0CrossProject && p2b0CrossProject.ok, JSON.stringify(p2b0CrossProject));

    /* ---- BUG-1: the two contexts survive backup → restore, and a project
       delete detaches both instead of merging or dropping them ---- */
    const p2b0Backup = await ev(`(async()=>{
      const p = (await api('/projects', { method: 'POST', body: { name: 'P2B0-Bkp', customer: 'BkpCo', location: 'Yazd', elevatorType: 'traction' } })).project;
      const A = (await api('/checklists', { method: 'POST', body: { projectId: p.id, elevatorId: 'ELEV-A', templateId: 'traction-install', checked: { a1: 'pass' } } })).checklist;
      const B = (await api('/checklists', { method: 'POST', body: { projectId: p.id, elevatorId: 'ELEV-B', templateId: 'traction-install', checked: { a1: 'fail' } } })).checklist;
      const exported = (await api('/backup')).backup;
      const v = validateBackup(exported);
      if (!v.ok) return { ok: false, step: 'export:' + v.why };
      await api('/backup', { method: 'PUT', body: { backup: exported } });
      const fresh = await STRUCTURED_DB.verifyAggregate(JSON.parse(JSON.stringify(_lsDB)));
      const ra = fresh.checklists.find(c => c.id === A.id), rb = fresh.checklists.find(c => c.id === B.id);
      const roundTrip = !!ra && !!rb && ra.checked.a1 === 'pass' && rb.checked.a1 === 'fail'
        && ra.elevatorId === 'ELEV-A' && rb.elevatorId === 'ELEV-B';
      /* now delete the project: both contexts survive, detached and stamped */
      await api('/projects/' + p.id, { method: 'DELETE' });
      const after = await STRUCTURED_DB.verifyAggregate(JSON.parse(JSON.stringify(_lsDB)));
      const da = after.checklists.find(c => c.id === A.id), db2 = after.checklists.find(c => c.id === B.id);
      const detached = !!da && !!db2 && da.projectId === '' && db2.projectId === ''
        && String(da.projectInfo || '').includes('P2B0-Bkp') && String(db2.projectInfo || '').includes('P2B0-Bkp')
        && da.checked.a1 === 'pass' && db2.checked.a1 === 'fail'
        /* the dead identifier must not linger as the elevator dimension */
        && da.elevatorId !== p.id && db2.elevatorId !== p.id;
      return { ok: roundTrip && detached, roundTrip, detached };
    })()`);
    await T('P2B0 BUG-1: both elevator contexts survive backup → restore and a project delete (answers preserved, never merged)', p2b0Backup && p2b0Backup.ok, JSON.stringify(p2b0Backup));

    /* ---- BUG-1: ambiguous duplicate identity is reported, never resolved by
       deleting or merging real technician answers ---- */
    await T('P2B0 BUG-1: duplicate logical identity is reported, never merged or deleted', () => ev(`(function(){
      const dup = [
        { id: 'k1', projectId: 'P1', templateId: 'T1', checked: { a: 'pass' } },
        { id: 'k2', projectId: 'P1', elevatorId: 'P1', templateId: 'T1', checked: { a: 'fail' } }
      ];
      const conflicts = checklistIdentityConflicts(dup);
      const bk = { app: 'zlift', formatVersion: BACKUP_FORMAT_VERSION, projects: [{ id: 'P1', name: 'x' }], checklists: dup };
      const audit = auditBackupData(bk, {});
      /* lookup stays deterministic (first match wins) and both rows survive */
      const found = findChecklistInstance(dup, 'P1', 'T1');
      return conflicts.length === 1 && conflicts[0].ids.join(',') === 'k1,k2'
        && found === dup[0] && dup.length === 2
        && audit.ok === true && audit.warnings.some(w => w.indexOf('checklists:duplicate-identity') === 0);
    })()`));

    /* ---- BUG-2: nested parts.history[].projectId is now a managed reference ---- */
    const p2b0Nested = await ev(`(async()=>{
      const A = (await api('/projects', { method: 'POST', body: { name: 'P2B0-Nest-A', customer: 'CA', location: 'LA' } })).project;
      const B = (await api('/projects', { method: 'POST', body: { name: 'P2B0-Nest-B', customer: 'CB', location: 'LB' } })).project;
      const part = (await api('/parts', { method: 'POST', body: { name: 'P2B0 nested part', qty: 20, price: 100 } })).part;
      await api('/parts-consume', { method: 'POST', body: { partId: part.id, qty: 2, projectId: A.id, note: 'for A' } });
      await api('/parts-consume', { method: 'POST', body: { partId: part.id, qty: 3, projectId: B.id, note: 'for B' } });
      const read = () => _lsLoad().parts.find(x => x.id === part.id);
      const before = JSON.parse(JSON.stringify(read().history));
      /* 1. a valid nested reference is left completely alone by the repair pass */
      const repairOnValid = STRUCTURED_DB.repairProjectRefs(_lsDB);
      const validIntact = repairOnValid === false
        && read().history.some(h => h.projectId === A.id) && read().history.some(h => h.projectId === B.id);
      /* 2/3/4. deleting project A detaches + stamps its nested ref and preserves
                the historical entry verbatim; no entry is deleted */
      await api('/projects/' + A.id, { method: 'DELETE' });
      const after = JSON.parse(JSON.stringify(read().history));
      const entryA = after.find(h => h.note === 'for A');
      const entryB = after.find(h => h.note === 'for B');
      const origA = before.find(h => h.note === 'for A');
      const preserved = !!entryA && entryA.projectId === ''
        && String(entryA.projectInfo || '').includes('P2B0-Nest-A')
        /* nothing but the dead link changed */
        && entryA.id === origA.id && entryA.qty === origA.qty && entryA.date === origA.date
        && entryA.prevQty === origA.prevQty && entryA.newQty === origA.newQty
        && after.length === before.length;
      /* 10. project isolation: the entry that referenced project B is untouched */
      const isolated = !!entryB && entryB.projectId === B.id && entryB.projectInfo === undefined;
      /* 8. repeated repair is idempotent: no change, no re-stamp, no churn */
      const second = STRUCTURED_DB.repairProjectRefs(_lsDB);
      const third = STRUCTURED_DB.repairProjectRefs(_lsDB);
      const idempotent = second === false && third === false
        && JSON.stringify(read().history) === JSON.stringify(after);
      const fresh = await STRUCTURED_DB.verifyAggregate(JSON.parse(JSON.stringify(_lsDB)));
      return {
        ok: validIntact && preserved && isolated && idempotent
          && fresh.parts.find(x => x.id === part.id).history.length === before.length,
        validIntact, preserved, isolated, idempotent,
        entryA: entryA && { projectId: entryA.projectId, projectInfo: entryA.projectInfo, qty: entryA.qty },
        entryB: entryB && { projectId: entryB.projectId }
      };
    })()`);
    await T('P2B0 BUG-2: project delete detaches-and-stamps the nested parts.history ref, preserves the entry, isolates other projects, and repeats idempotently', p2b0Nested && p2b0Nested.ok, JSON.stringify(p2b0Nested));

    /* ---- BUG-2: strict verification and canonical repair cover the nested
       level too, through one shared definition (the P2A BUG-4 drift failure) ---- */
    const p2b0VerifyNested = await ev(`(async()=>{
      const part = (_lsDB.parts || [])[0];
      if (!part) return { ok: false, step: 'no-part' };
      const keep = part.history;
      part.history = [{ id: 'n1', qty: -1, date: 1, projectId: 'ghost-project-p2b0', note: 'injected', prevQty: 5, newQty: 4 }];
      await _lsSave();                                        /* real persistence path */
      let threw = '';
      try { await STRUCTURED_DB.verifyAggregate(JSON.parse(JSON.stringify(_lsDB))); }
      catch (e) { threw = String(e && e.message || ''); }
      const detected = threw.indexOf('structured-relation:parts.history') === 0;
      const changed = STRUCTURED_DB.repairProjectRefs(_lsDB);   /* canonical repair */
      await _lsSave();
      let okAfter = false;
      try { await STRUCTURED_DB.verifyAggregate(JSON.parse(JSON.stringify(_lsDB))); okAfter = true; } catch (e) {}
      const entry = part.history[0];
      const preserved = part.history.length === 1 && entry.qty === -1 && entry.note === 'injected'
        && entry.prevQty === 5 && entry.newQty === 4
        && entry.projectId === '' && String(entry.projectInfo || '').indexOf('projectId:ghost-project-p2b0') === 0;
      const idempotent = STRUCTURED_DB.repairProjectRefs(_lsDB) === false;
      part.history = keep; await _lsSave();                    /* leave later tests alone */
      return { ok: detected && changed === true && okAfter && preserved && idempotent, threw, changed, okAfter, preserved, idempotent };
    })()`);
    await T('P2B0 BUG-2: verifyAggregate detects a dangling nested history ref and the canonical repair restores integrity (no drift, nothing deleted)', p2b0VerifyNested && p2b0VerifyNested.ok, JSON.stringify(p2b0VerifyNested));

    /* ---- BUG-2: the creation seam never writes a dangling nested ref ---- */
    await T('P2B0 BUG-2: an unknown projectId is never written into parts.history (consume + invoice)', () => ev(`(async()=>{
      const part = (await api('/parts', { method: 'POST', body: { name: 'P2B0 seam part', qty: 10, price: 100 } })).part;
      await api('/parts-consume', { method: 'POST', body: { partId: part.id, qty: 1, projectId: 'no-such-project', note: 'bogus' } });
      const live = (await api('/projects', { method: 'POST', body: { name: 'P2B0 seam proj' } })).project;
      await api('/parts-consume', { method: 'POST', body: { partId: part.id, qty: 1, projectId: live.id, note: 'real' } });
      await api('/invoices', { method: 'POST', body: { customer: 'P2B0 seam', projectId: 'no-such-project', items: [{ desc: 'seam', qty: 1, price: 100, partId: part.id }] } });
      const h = _lsLoad().parts.find(x => x.id === part.id).history;
      const bogus = h.filter(x => x.note === 'bogus' || x.note === 'invoice consumption');
      return {
        ok: h.length === 3
          && bogus.length === 2 && bogus.every(x => x.projectId === '')
          && h.some(x => x.projectId === live.id)
          /* nothing was invented and nothing was reassigned to another project */
          && !h.some(x => x.projectId && x.projectId !== live.id),
        refs: h.map(x => x.projectId)
      };
    })()`));

    /* ---- BUG-2: malformed nested history is flagged and preserved, and legacy
       backups carrying dangling/malformed history still import ---- */
    await T('P2B0 BUG-2: malformed nested history is reported as warnings, never as blocking errors, and never deleted', () => ev(`(function(){
      const bk = {
        app: 'zlift', formatVersion: BACKUP_FORMAT_VERSION,
        projects: [{ id: 'live-p', name: 'Live', createdAt: 1, updatedAt: 1 }],
        parts: [
          { id: 'p-ok', name: 'ok', qty: 1, history: [{ id: 'h1', qty: -1, date: 1, projectId: 'live-p' }] },
          { id: 'p-dead', name: 'dead', qty: 1, history: [{ id: 'h2', qty: -2, date: 2, projectId: 'ghost-p' }] },
          { id: 'p-badarr', name: 'badarr', qty: 1, history: 'not-an-array' },
          { id: 'p-badrow', name: 'badrow', qty: 1, history: [null, { id: 'h3', qty: -3, projectId: 42 }] },
          { id: 'p-none', name: 'none', qty: 1 }
        ]
      };
      const audit = auditBackupData(bk, {});
      const w = audit.warnings.join('|');
      return audit.ok === true && audit.errors.length === 0
        && w.indexOf('parts:history-project-relation:p-dead:h2') >= 0
        && w.indexOf('parts:history-not-array:p-badarr') >= 0
        && w.indexOf('parts:history-record:p-badrow:0') >= 0
        && w.indexOf('parts:history-project-type:p-badrow:h3') >= 0
        && w.indexOf('p-ok') === -1 && w.indexOf('p-none') === -1;
    })()`));

    await T('P2B0 BUG-2: legacy backup with dangling + malformed history imports, keeps every entry and repairs the dead ref', () => ev(`(async()=>{
      const now = Date.now();
      const legacy = enrichBackupMetadata({
        app: 'zlift', projects: [{ id: 'leg-p', name: 'Legacy Tower', customer: 'LegacyCo', location: 'Rasht', elevatorType: 'traction', createdAt: now, updatedAt: now }],
        parts: [{ id: 'leg-part', name: 'Legacy part', category: 'x', unit: 'pcs', qty: 7, minQty: 0, price: 100, createdAt: now, updatedAt: now,
          history: [
            { id: 'leg-h1', qty: -2, date: now - 3000, projectId: 'deleted-long-ago', note: 'old consume', prevQty: 9, newQty: 7 },
            { id: 'leg-h2', qty: -1, date: now - 2000, projectId: 'leg-p', note: 'live consume', prevQty: 8, newQty: 7 },
            null,
            { id: 'leg-h4', qty: -5, date: now - 1000, projectId: 99, note: 'malformed ref' }
          ] }],
        services: [], measurements: [], invoices: [], notes: [], issues: [], contracts: [],
        reminders: [], photos: [], diagSessions: [], calcSaves: [], tools: [], checklists: [], safetyLogs: [], settings: {}
      });
      const v = validateBackup(legacy);
      if (!v.ok) return { ok: false, step: 'validate:' + v.why };
      await api('/backup', { method: 'PUT', body: { backup: legacy } });
      const fresh = await STRUCTURED_DB.verifyAggregate(JSON.parse(JSON.stringify(_lsDB)));
      const part = fresh.parts.find(x => x.id === 'leg-part');
      const h = part && part.history;
      const dead = h && h.find(x => x && x.id === 'leg-h1');
      const live = h && h.find(x => x && x.id === 'leg-h2');
      const malformed = h && h.find(x => x && x.id === 'leg-h4');
      return {
        /* every entry survived, including the malformed ones — nothing dropped */
        ok: !!h && h.length === 4
          && !!dead && dead.projectId === '' && String(dead.projectInfo || '').indexOf('projectId:deleted-long-ago') === 0
          && dead.qty === -2 && dead.note === 'old consume' && dead.prevQty === 9 && dead.newQty === 7
          && !!live && live.projectId === 'leg-p'
          && h[2] === null
          /* the non-string ref is preserved as-is, not guessed at */
          && !!malformed && malformed.projectId === 99,
        len: h && h.length, dead: dead && { projectId: dead.projectId, projectInfo: dead.projectInfo }
      };
    })()`));

    /* 9. an export produced by THIS build still round-trips (BACKUP_FORMAT_VERSION
       unchanged at 8), and the aggregate is left in a verified state */
    const p2b0LegacyCompat = await ev(`(async()=>{
      const exported = (await api('/backup')).backup;
      const audit = auditBackupData(exported, { requireTimestamps: true });
      if (!audit.ok) return { ok: false, step: 'audit:' + audit.errors.join(',') };
      const stripped = JSON.parse(JSON.stringify(exported));
      delete stripped.integrity; delete stripped.metadata; delete stripped.recordCounts; delete stripped.relationships;
      const v = validateBackup(stripped);
      if (!v.ok) return { ok: false, step: 'revalidate:' + v.why };
      await api('/backup', { method: 'PUT', body: { backup: stripped } });
      const fresh = await STRUCTURED_DB.verifyAggregate(JSON.parse(JSON.stringify(_lsDB)));
      const before = backupCountMap(exported), after = backupCountMap((await api('/backup')).backup);
      const keys = ['projects', 'parts', 'checklists', 'services', 'measurements', 'invoices', 'notes', 'issues'];
      return {
        ok: keys.every(k => before[k] === after[k]) && fresh.parts.length === before.parts
          && BACKUP_FORMAT_VERSION === 8 && DB_SCHEMA_VERSION === 3 && STRUCTURED_DB.migrationVersion === 1,
        parts: [before.parts, after.parts]
      };
    })()`);
    await T('P2B0 BACKUP: export → delete/repair → restore round-trips with BACKUP_FORMAT_VERSION still 8 and every count intact', p2b0LegacyCompat && p2b0LegacyCompat.ok, JSON.stringify(p2b0LegacyCompat));
    await ev(`(async()=>{ state.projects = null; state.services = null; state.checklists = null; state.parts = null; state.measurements = null; state.invoices = null; state.notes = null; state.issues = null; state.diagSessions = null; state.calcSaves = null; state.safetyLogs = null; state.photos = null; state.contracts = null; state.reminders = null; state.tools = null; await loadAll(true); return true; })()`);

    /* ---- PH20: version identifiers stay consistent across files ---- */
    const swSrc = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    const pkgJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const htmlSrc = allSources;
    const swCache = (swSrc.match(/const CACHE = '([^']+)'/) || [])[1];
    const appCache = (htmlSrc.match(/CACHE_VERSION = '([^']+)'/) || [])[1];
    const appVer = (htmlSrc.match(/APP_VERSION = '([^']+)'/) || [])[1];
    await T('versioning: CACHE_VERSION (app) === CACHE (service worker)', swCache && swCache === appCache, swCache + ' vs ' + appCache);
    await T('PWA install requires one complete atomic core precache', /\.addAll\(CORE\)/.test(swSrc) && !/CORE\.map\([^\n]+catch/.test(swSrc));
    await T('PWA cache does not store unnecessary external CDN/font resources', !/cdn\.jsdelivr|fonts\.googleapis|fonts\.gstatic|isCdn/.test(swSrc));
    await T('PWA core precache includes every local script and stylesheet from index.html', () => {
      const assets = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)=\"([^\"]+)\"/g)].map(m => m[1]).filter(x => !/^(https?:|data:)/.test(x) && !x.startsWith('#'));
      return assets.every(a => swSrc.includes("'./" + a.replace(/^\.\//, '') + "'") || swSrc.includes('"./' + a.replace(/^\.\//, '') + '"'));
    });
    await T('PWA same-origin assets use network-first fallback to avoid old/new shell mismatches', /static assets: network-first/.test(swSrc) && /fetch\(req\)[\s\S]+caches\.match\(req\)/.test(swSrc));
    await T('versioning: package.json version === APP_VERSION', pkgJson.version === appVer, pkgJson.version + ' vs ' + appVer);
    await T('versioning: backup format version is an integer ≥ 6', () => ev(`Number.isInteger(BACKUP_FORMAT_VERSION) && BACKUP_FORMAT_VERSION >= 6`));

    /* ---- PH1: no fetch-based /api/ call remains in the data layer ---- */
    await T('architecture: data layer is local (no fetch in _apiLocal)', () => ev(`!/fetch\\(/.test(_apiLocal.toString())`));
    await T('architecture: api() delegates to the local persistence layer', () => ev(`/ _apiLocal\\(/.test(api.toString())`));

    /* ---------- legacy regressions ---------- */
    await ev(`navigate('/checklists/traction-install')`); await waitLoaded();
    await T('traction install checklist still renders (30 items)', () => ev(`document.querySelectorAll('#content .check-item[data-item]').length === 30`));
    await ev(`navigate('/knowledge')`); await waitLoaded();
    await ev(`kbQuery = 'استاندارد'; drawKb();`);
    await T('knowledge search finds k3 article', () => ev(`document.querySelector('#kbList').innerHTML.includes('k3')`));
    await ev(`openKbArticle('k3');`);
    await T('standards-related knowledge article is visibly UNVERIFIED', () => ev(`document.querySelector('#modalRoot').innerHTML.includes('UNVERIFIED') && document.querySelector('#modalRoot').innerHTML.includes('آستانهٔ ایمنی')`));
    await ev(`closeModal();`);

    const fallbackDom = new JSDOM(html, {
      url: 'http://fallback.local/index.html', runScripts: 'dangerously', pretendToBeVisual: true,
      virtualConsole: vc,
      beforeParse(window) { window.indexedDB = undefined; window.IDBKeyRange = undefined; }
    });
    fallbackDom.window.scrollTo = () => {};
    const fallbackStart = Date.now();
    while (fallbackDom.window.eval(`typeof STRUCTURED_DB==='undefined'`)) {
      if (Date.now() - fallbackStart > 8000) break;
      await wait(50);
    }
    await fallbackDom.window.eval(`STRUCTURED_DB.ready()`);
    await T('storage: unavailable IndexedDB activates explicit localStorage fallback', fallbackDom.window.eval(`STRUCTURED_DB.status().mode==='localStorage-fallback'`), fallbackDom.window.eval(`JSON.stringify(STRUCTURED_DB.status())`));
    await T('storage: fallback remains operational and persists a valid aggregate', await fallbackDom.window.eval(`(async()=>{_lsLoad();await _lsSave();var raw=localStorage.getItem('zlift_db');return !!raw && Array.isArray(JSON.parse(raw).projects)})()`));
    fallbackDom.window.close();

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
