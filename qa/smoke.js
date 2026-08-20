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
      '/contracts', '/report', '/standards'
    ];
    for (const route of routes) {
      await ev(`navigate('${route}')`);
      await waitLoaded();
      const errs = windowErrors.length;
      await T('route renders without error: ' + route, errs === 0, 'window errors: ' + errs);
    }
    await T('page title for /standards', () => ev(`document.querySelector('#pageTitle').textContent === 'استاندارد EN 81-20'`), await ev(`document.querySelector('#pageTitle').textContent`));

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
