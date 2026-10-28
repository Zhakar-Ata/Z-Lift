/* Z Lift — MULTI-ELEVATOR regression suite (jsdom)
   Q11 from the real-user audit: a tower with three shafts is ONE building
   (one customer, one address) with several technical profiles. Drives the
   real UI + API end-to-end: add elevators, file work on the right shaft,
   refuse ambiguous filing, protect history on delete, and survive a
   backup/restore round-trip (format v8 carries no elevator rows — the
   project-level elevatorProfiles mirror must rebuild them faithfully).
   Run:  node qa/elevators.js     Exit 0 = all green. */
const { JSDOM, VirtualConsole } = require('jsdom');
const { IDBFactory, IDBKeyRange } = require('fake-indexeddb');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/<script\s+src="([^"]+)"[^>]*><\/script>/g, (m, src) => {
  const fp = path.join(ROOT, src);
  return fs.existsSync(fp) ? '<script>\n' + fs.readFileSync(fp, 'utf8') + '\n</script>' : '<script>/*MISSING*/</script>';
});

const results = [];
let pass = 0, fail = 0;
async function T(id, name, fn) {
  try {
    const evd = await fn();
    pass++; results.push({ id, name, ok: true, evidence: String(evd || '') });
    console.log(`  ✓ [${id}] ${name}`);
  } catch (e) {
    fail++; results.push({ id, name, ok: false, evidence: String(e && e.message || e) });
    console.log(`  ✗ [${id}] ${name}\n      ↳ ${String(e && e.message || e)}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

async function bootApp() {
  const errs = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => {
    const m = String((e && e.detail && e.detail.message) || (e && e.message) || e);
    if (/canvas|getContext|Could not parse CSS|Not implemented|scrollTo|navigation/i.test(m)) return;
    errs.push(m.split('\n')[0].slice(0, 220));
  });
  const factory = new IDBFactory();
  const dom = new JSDOM(html, {
    url: 'http://localhost:4173/index.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(window) { window.indexedDB = factory; window.IDBKeyRange = IDBKeyRange; }
  });
  const w = dom.window;
  const document = w.document;
  w.scrollTo = () => {}; w.print = () => {};
  w.addEventListener('error', e => errs.push('window.error: ' + String(e.message || '').slice(0, 160)));
  const ev = expr => w.eval(expr);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const waitUntil = async (cond, ms = 12000, label = 'condition') => {
    const t0 = Date.now();
    for (;;) { try { if (await cond()) return true; } catch (e) {} if (Date.now() - t0 > ms) throw new Error('timeout: ' + label); await wait(50); }
  };
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const loadWait = async () => { await waitUntil(() => { const c = $('#content'); return c && c.innerHTML.length > 0 && !c.innerHTML.includes('page-loading'); }, 12000, 'page render'); await wait(350); };
  const fire = (el, type) => el.dispatchEvent(new w.Event(type, { bubbles: true, cancelable: true }));
  const typeIn = (sel, val) => { const el = $(sel); el.focus(); el.value = val; fire(el, 'input'); fire(el, 'change'); return el; };
  const setVal = (sel, val) => { const el = $(sel); el.value = val; fire(el, 'input'); fire(el, 'change'); return el; };
  const until = sel => waitUntil(() => $(sel), 12000, sel);
  const modalOpen = () => !!$('#modalOverlay');
  const closedSettle = async () => { await waitUntil(() => !modalOpen(), 12000, 'modal close'); await wait(450); };
  const A = { w, document, ev, wait, waitUntil, $, $$, loadWait, fire, typeIn, setVal, until, modalOpen, closedSettle, errs,
    nav: async r => { await ev(`navigate('${r}')`); await loadWait(); } };
  await waitUntil(() => ev(`typeof init === 'function'`), 12000, 'boot');
  await ev(`localStorage.setItem('zlift_last_external_backup', String(Date.now()))`);
  await ev(`localStorage.setItem('zlift_backup_snooze', String(Date.now() + 30 * 86400000))`);
  return A;
}
async function appVisible(A) { return A.$('#appView') && !A.$('#appView').classList.contains('hidden'); }
async function registerAs(A, name, user, pass) {
  await A.waitUntil(async () => (A.$('#authView') && !A.$('#authView').classList.contains('hidden')) || appVisible(A), 12000, 'auth/app');
  A.$('#tabRegister').click();
  A.typeIn('#authName', name); A.typeIn('#authUsername', user); A.typeIn('#authPassword', pass);
  A.fire(A.$('#authForm'), 'submit');
  await A.waitUntil(async () => appVisible(A), 12000, 'register ' + user);
  await A.loadWait();
  return true;
}

(async () => {
  console.log('\n== Q11) چند آسانسور برای یک ساختمان (multi-elevator) ==');
  const A = await bootApp();
  await registerAs(A, 'تکنسین برج', 'towertech', 'tower123');

  let pid = null, eastId = null, svcId = null;

  await T('E1', 'ساختن ساختمان، آسانسور اصلی (legacy) را هم می‌سازد و API برمی‌گرداند', async () => {
    const r = await A.ev(`api('/projects', { method: 'POST', body: { name: 'برج سه‌آسانسوره تست', customer: 'مدیریت برج', location: 'سعادت‌آباد', capacityKg: 630, persons: 8, floors: 12, stops: 12, speed: 1.6, elevatorType: 'traction' } })`);
    pid = r.project.id;
    assert(r.elevator && r.elevator.id === pid && r.elevator.projectId === pid, 'legacy elevator missing from POST response');
    await A.ev('loadAll(true)');
    const n = await A.ev(`elevatorsOfProject('${pid}').length`);
    assert(n === 1, 'expected 1 elevator, got ' + n);
    return 'legacy elevator present in state';
  });

  await T('E2', 'افزودن آسانسور دوم از رابط جزئیات ساختمان (فرم addElevator)', async () => {
    await A.nav('/projects/' + pid);
    const btn = A.$$('#content [onclick]').find(e => (e.getAttribute('onclick') || '').includes('addElevator'));
    assert(btn, '«افزودن آسانسور» button not found on project detail');
    btn.click(); await A.until('#elevSave');
    A.typeIn('#e_name', 'شرقی');
    A.setVal('#e_cap', '۱۰۰۰'); // Persian digits must parse
    A.$('#elevSave').click(); await A.closedSettle();
    const list = await A.ev(`elevatorsOfProject('${pid}').map(e => ({ id: e.id, name: e.name, cap: e.capacityKg }))`);
    assert(list.length === 2, 'expected 2 elevators, got ' + list.length);
    const east = list.find(e => e.name === 'شرقی');
    assert(east, 'east elevator not in state');
    assert(east.cap === 1000, 'capacity misparsed: ' + east.cap);
    eastId = east.id;
    assert(A.$('#content').textContent.includes('شرقی'), 'east elevator not listed on detail page');
    return 'east elevator created via UI, cap=1000kg';
  });

  await T('E3', 'فرم سرویس برای ساختمان چندآسانسوره انتخابگر شفت نشان می‌دهد و روی همان شفت ثبت می‌کند', async () => {
    await A.nav('/services');
    await A.ev(`openServiceForm(null, '${pid}')`); await A.until('#svcSave');
    const sel = A.$('#s_elevator_sel');
    assert(sel, 'elevator picker missing in service form');
    assert(sel.options.length === 2, 'picker options: ' + sel.options.length);
    sel.value = eastId; A.fire(sel, 'change');
    A.typeIn('#s_problem', 'سرویس دوره‌ای شفت شرقی');
    A.$('#svcSave').click(); await A.closedSettle();
    const s = await A.ev(`(state.services.find(x => x.projectId === '${pid}') || {})`);
    assert(s.id, 'service not saved');
    svcId = s.id;
    assert(s.elevatorId === eastId, 'service filed on wrong elevator: ' + s.elevatorId);
    const label = await A.ev(`svcTarget(state.services.find(x => x.id === '${svcId}'))`);
    assert(label.includes('شرقی'), 'row label missing shaft: ' + label);
    return 'service on east shaft, label: ' + label;
  });

  await T('E4', 'ثبت رکورد آسانسورمحور بدون مشخص‌کردن شفت در ساختمان چندآسانسوره رد می‌شود، با شفت قبول', async () => {
    const bad = await A.ev(`api('/issues', { method: 'POST', body: { title: 'بدون شفت', projectId: '${pid}' } }).then(() => 'ACCEPTED', e => e.code || String(e.message || e))`);
    assert(/AMBIGUOUS/.test(bad), 'ambiguous create was not refused: ' + bad);
    const good = await A.ev(`api('/issues', { method: 'POST', body: { title: 'خرابی شفت شرقی', projectId: '${pid}', elevatorId: '${eastId}' } }).then(d => d.item.elevatorId, e => 'ERR:' + (e.code || e.message))`);
    assert(good === eastId, 'explicit-shaft issue failed: ' + good);
    return 'ambiguous refused, explicit accepted';
  });

  await T('E5', 'آسانسور اصلی از مسیر CRUD آسانسورها قابل ویرایش/حذف نیست (آینهٔ پروژه است)', async () => {
    const put = await A.ev(`api('/projects/${pid}/elevators/${pid}', { method: 'PUT', body: { name: 'دستکاری' } }).then(() => 'ACCEPTED', e => e.code || String(e.message || e))`);
    assert(put === 'elevator_legacy_mirrored', 'legacy PUT: ' + put);
    const del = await A.ev(`api('/projects/${pid}/elevators/${pid}', { method: 'DELETE' }).then(() => 'ACCEPTED', e => e.code || String(e.message || e))`);
    assert(del === 'elevator_legacy_mirrored', 'legacy DELETE: ' + del);
    return 'legacy elevator protected';
  });

  await T('E6', 'حذف آسانسوری که سابقه دارد رد می‌شود؛ آسانسور بی‌سابقه حذف می‌شود', async () => {
    const delEast = await A.ev(`api('/projects/${pid}/elevators/${eastId}', { method: 'DELETE' }).then(() => 'ACCEPTED', e => e.code || String(e.message || e))`);
    assert(delEast === 'elevator_has_records', 'delete-with-history: ' + delEast);
    const west = await A.ev(`api('/projects/${pid}/elevators', { method: 'POST', body: { name: 'غربی' } }).then(d => d.elevator.id)`);
    const delWest = await A.ev(`api('/projects/${pid}/elevators/${west}', { method: 'DELETE' }).then(() => 'OK', e => 'ERR:' + (e.code || e.message))`);
    assert(delWest === 'OK', 'delete-empty failed: ' + delWest);
    return 'history protected, empty shaft removable';
  });

  await T('E7', 'چک‌لیست هر شفت نمونهٔ مستقل خودش را دارد', async () => {
    const r = await A.ev(`(async () => {
      const tid = CHECKLIST_TEMPLATES[0].id;
      const a = await api('/checklists', { method: 'POST', body: { projectId: '${pid}', elevatorId: '${pid}', templateId: tid, checked: {} } });
      const b = await api('/checklists', { method: 'POST', body: { projectId: '${pid}', elevatorId: '${eastId}', templateId: tid, checked: {} } });
      return { same: a.checklist.id === b.checklist.id, eastElevator: b.checklist.elevatorId };
    })()`);
    assert(!r.same, 'both shafts collapsed into one checklist instance');
    assert(r.eastElevator === eastId, 'east checklist elevatorId: ' + r.eastElevator);
    return 'one instance per shaft';
  });

  await T('E8', 'بک‌آپ v8 (بدون ردیف آسانسور) بعد از ری‌استور، نام و مشخصات شفت دوم را از آینهٔ پروفایل برمی‌گرداند', async () => {
    const meta = await A.ev(`(async () => {
      const d = await api('/backup');
      window.__bk = d.backup;
      const proj = d.backup.projects.find(p => p.id === '${pid}');
      return {
        fmt: d.backup.formatVersion, hasElevatorsKey: Object.prototype.hasOwnProperty.call(d.backup, 'elevators'),
        mirror: proj && proj.elevatorProfiles ? proj.elevatorProfiles['${eastId}'] : null
      };
    })()`);
    assert(meta.fmt === 8, 'backup format changed unexpectedly: ' + meta.fmt);
    assert(meta.hasElevatorsKey === false, 'backup must not carry an elevators key (v8 contract)');
    assert(meta.mirror && meta.mirror.name === 'شرقی' && meta.mirror.capacityKg === 1000, 'profile mirror missing/wrong: ' + JSON.stringify(meta.mirror));
    await A.ev(`api('/backup', { method: 'PUT', body: { backup: window.__bk } })`);
    await A.ev('loadAll(true)');
    const after = await A.ev(`(function () {
      const list = elevatorsOfProject('${pid}');
      const east = list.find(e => e.id === '${eastId}');
      const svc = state.services.find(x => x.id === '${svcId}');
      return { n: list.length, eastName: east && east.name, eastCap: east && east.capacityKg, svcElevator: svc && svc.elevatorId, label: svc ? svcTarget(svc) : '' };
    })()`);
    assert(after.n === 2, 'elevators after restore: ' + after.n);
    assert(after.eastName === 'شرقی' && after.eastCap === 1000, 'east specs lost in restore: ' + JSON.stringify(after));
    assert(after.svcElevator === eastId && after.label.includes('شرقی'), 'service lost its shaft: ' + JSON.stringify(after));
    return 'label+specs+history all survived the v8 round-trip';
  });

  await T('E9', 'کاربر دوم روی همان دستگاه آسانسورهای کاربر اول را نمی‌بیند', async () => {
    await A.ev(`document.querySelector('#logoutBtn').click()`);
    await A.waitUntil(() => A.$('#authView') && !A.$('#authView').classList.contains('hidden'), 12000, 'logout');
    await registerAs(A, 'کاربر دوم', 'secondtech', 'second123');
    await A.ev('loadAll(true)');
    const seen = await A.ev(`(state.elevators || []).filter(e => e.projectId === '${pid}').length`);
    assert(seen === 0, 'second account sees first account elevators: ' + seen);
    return 'per-user isolation holds for elevators';
  });

  const out = { app: 'Z Lift', suite: 'elevators (Q11 multi-elevator)', generatedAt: new Date().toISOString(), pass, fail, results };
  fs.writeFileSync(path.join(ROOT, 'qa', 'elevators-results.json'), JSON.stringify(out, null, 2));
  console.log(`\nELEVATORS RESULT: ${pass} passed, ${fail} failed  (✗ = multi-elevator model broken)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
