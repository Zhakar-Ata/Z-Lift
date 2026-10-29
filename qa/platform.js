/* Z Lift — PLATFORM round (v29.6): the four directions chosen after the
   audits closed, each pinned by a behavioural check:

     W) امنیت رمز عبور — PBKDF2 (WebCrypto) with silent legacy upgrade,
        and a graceful v2 fallback where subtle crypto is unavailable
     Q) برچسب QR هر شفت — a shaft-specific deep link that lands on the
        building with that shaft focused and actions pre-scoped
     C) ورود گروهی CSV — forgiving parser (fa/en headers, fa digits,
        Iranian-Excel ';'), idempotent by duplicate-skipping
     M) ایمپورت ادغامی بکاپ — merge a second device's backup file into
        this device without losing local data (newer copy wins)
     D) آماده‌به‌دستگاه — static PWA installability facts that a real
        phone would trip over (manifest, metas, atomic precache targets)

   Every check states the expected correct behaviour; ✗ = regression.
   Run:  node qa/platform.js        Exit 0 = every expectation holds. */
const { JSDOM, VirtualConsole } = require('jsdom');
const { IDBFactory, IDBKeyRange } = require('fake-indexeddb');
const { webcrypto } = require('node:crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const rawHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
function inlineScripts(htmlStr) {
  return htmlStr.replace(/<script\s+src="([^"]+)"[^>]*><\/script>/g, (m, src) => {
    const fp = path.join(ROOT, src);
    return fs.existsSync(fp) ? '<script>\n' + fs.readFileSync(fp, 'utf8') + '\n</script>' : '<script>/*MISSING*/</script>';
  });
}
const html = inlineScripts(rawHtml);
const readSrc = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

const results = [];
let pass = 0, fail = 0;
async function T(id, area, name, fn) {
  try {
    const r = await fn();
    const ok = !!(r && r.ok);
    results.push({ id, area, name, ok, evidence: String((r && r.evidence) || '') });
    if (ok) { pass++; console.log(`  ✓ [${id}] ${name}`); }
    else { fail++; console.log(`  ✗ [${id}] ${name}\n      ↳ ${(r && r.evidence) || ''}`); }
  } catch (e) {
    fail++; results.push({ id, area, name, ok: false, evidence: 'EXCEPTION: ' + String(e && e.message || e) });
    console.log(`  ✗ [${id}] ${name}\n      ↳ EXCEPTION: ${String(e && e.message || e)}`);
  }
}
const OK = (evidence = '') => ({ ok: true, evidence });
const BAD = evidence => ({ ok: false, evidence });

/* ---------------- boot a fresh app instance ---------------- */
async function bootApp({ idbFactory = null, lsSeed = null, injectCrypto = true } = {}) {
  const errs = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => {
    const m = String((e && e.detail && e.detail.message) || (e && e.message) || e);
    if (/canvas|getContext|Could not parse CSS|Not implemented|scrollTo|navigation/i.test(m)) return;
    errs.push(m.split('\n')[0].slice(0, 220));
  });
  const factory = idbFactory || new IDBFactory();
  const dom = new JSDOM(html, {
    url: 'http://localhost:4173/index.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.indexedDB = factory;
      window.IDBKeyRange = IDBKeyRange;
      if (injectCrypto) {
        /* jsdom ships without SubtleCrypto; a real browser on a secure
           origin has it — inject Node's WebCrypto so the PBKDF2 path is
           exercised for real, not mocked */
        try { Object.defineProperty(window, 'crypto', { value: webcrypto, configurable: true }); }
        catch (e) { try { window.crypto = webcrypto; } catch (e2) {} }
        if (!window.TextEncoder) window.TextEncoder = TextEncoder;
        if (!window.TextDecoder) window.TextDecoder = TextDecoder;
      }
      if (lsSeed) { try { for (const [k, v] of Object.entries(lsSeed)) window.localStorage.setItem(k, v); } catch (e) {} }
    }
  });
  const w = dom.window;
  const document = w.document;
  w.scrollTo = () => {};
  w.print = () => {};
  w.addEventListener('error', e => { errs.push('window.error: ' + String(e.message || '').slice(0, 180)); });
  const ev = expr => w.eval(expr);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const waitUntil = async (cond, ms = 15000, label = 'condition') => {
    const t0 = Date.now();
    for (;;) { try { if (await cond()) return true; } catch (e) {} if (Date.now() - t0 > ms) throw new Error('timeout: ' + label); await wait(50); }
  };
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const loadWait = async () => { await waitUntil(() => { const c = $('#content'); return c && c.innerHTML.length > 0 && !c.innerHTML.includes('page-loading'); }, 15000, 'page render'); await wait(350); };
  const fire = (el, type) => el.dispatchEvent(new w.Event(type, { bubbles: true, cancelable: true }));
  const typeIn = (sel, val) => { const el = $(sel); el.focus(); el.value = val; fire(el, 'input'); fire(el, 'change'); return el; };
  const A = { w, document, ev, wait, waitUntil, $, $$, loadWait, fire, typeIn, errs, factory,
    nav: async r => { await ev(`navigate('${r}')`); await loadWait(); } };
  await waitUntil(() => ev(`typeof init === 'function'`), 15000, 'boot');
  await ev(`localStorage.setItem('zlift_last_external_backup', String(Date.now()))`);
  await ev(`localStorage.setItem('zlift_backup_snooze', String(Date.now() + 30 * 86400000))`);
  return A;
}
async function authVisible(A) { return A.$('#authView') && !A.$('#authView').classList.contains('hidden'); }
async function appVisible(A) { return A.$('#appView') && !A.$('#appView').classList.contains('hidden'); }
async function loginAs(A, user, pass) {
  await A.waitUntil(async () => authVisible(A) || appVisible(A), 15000, 'auth/app');
  if (await appVisible(A)) return true;
  const tabL = A.$('#tabLogin'); if (tabL) { tabL.click(); await A.wait(150); }
  A.typeIn('#authUsername', user); A.typeIn('#authPassword', pass);
  A.fire(A.$('#authForm'), 'submit');
  await A.waitUntil(async () => appVisible(A), 15000, 'login ' + user);
  await A.loadWait();
  return true;
}
async function registerAs(A, name, user, pass) {
  await A.waitUntil(async () => authVisible(A) || appVisible(A), 15000, 'auth/app');
  A.$('#tabRegister').click();
  A.typeIn('#authName', name); A.typeIn('#authUsername', user); A.typeIn('#authPassword', pass);
  A.fire(A.$('#authForm'), 'submit');
  await A.waitUntil(async () => appVisible(A), 15000, 'register ' + user);
  await A.loadWait();
  return true;
}
async function logout(A) {
  await A.ev(`document.querySelector('#logoutBtn').click()`);
  await A.waitUntil(async () => authVisible(A), 15000, 'logout');
  await A.wait(300);
}
const storedPw = (A, u) => A.ev(`(_lsDB.users.find(x => x.username === '${u}') || {}).password || ''`);

(async () => {

  /* ==================================================================
     W) امنیت رمز عبور — PBKDF2
     ================================================================== */
  console.log('\n== W) امنیت رمز عبور (PBKDF2) ==');
  const W = await bootApp();

  await T('W0', 'pbkdf2', 'محیط تست واقعاً SubtleCrypto دارد (مسیر PBKDF2 mock نیست)', async () => {
    const has = await W.ev(`!!(typeof crypto !== 'undefined' && crypto.subtle && crypto.getRandomValues)`);
    return has ? OK('subtle present') : BAD('crypto.subtle تزریق نشد — تست‌های W بی‌معنا می‌شوند');
  });

  await registerAs(W, 'کاربر رمزنگاری', 'cryptouser', 'secret-123');
  await T('W1', 'pbkdf2', 'ثبت‌نام جدید رمز را با PBKDF2 ذخیره می‌کند (v3 + شمارندهٔ تکرار)', async () => {
    const pw = await storedPw(W, 'cryptouser');
    return /^v3\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/.test(pw) && +pw.split('$')[1] >= 100000
      ? OK(pw.slice(0, 14) + '… iters=' + pw.split('$')[1])
      : BAD('رمز ذخیره‌شده: ' + pw.slice(0, 30) + ' — انتظار v3$<iters>$<salt>$<dk> می‌رفت');
  });

  await T('W2', 'pbkdf2', 'ورود با رمز درست کار می‌کند و رمز اشتباه رد می‌شود (راستی‌آزمایی v3)', async () => {
    await logout(W);
    const tabL = W.$('#tabLogin'); if (tabL) { tabL.click(); await W.wait(150); }
    W.typeIn('#authUsername', 'cryptouser'); W.typeIn('#authPassword', 'wrong-password');
    W.fire(W.$('#authForm'), 'submit');
    await W.wait(900);
    if (await appVisible(W)) return BAD('با رمز اشتباه وارد شد!');
    W.typeIn('#authUsername', 'cryptouser'); W.typeIn('#authPassword', 'secret-123');
    W.fire(W.$('#authForm'), 'submit');
    await W.waitUntil(async () => appVisible(W), 15000, 'v3 login');
    return OK('wrong rejected, correct accepted');
  });

  await T('W3', 'pbkdf2', 'هش قدیمی (bare و v2) در اولین ورود موفق بی‌صدا به PBKDF2 ارتقا پیدا می‌کند', async () => {
    // downgrade the stored record to a v2 hash of a known password
    await W.ev(`(async () => { const u = _lsDB.users.find(x => x.username === 'cryptouser'); u.password = _lsHashV2('secret-v2'); await _lsSave(); })()`);
    let pw = await storedPw(W, 'cryptouser');
    if (!pw.startsWith('v2$')) return BAD('setup: downgrade to v2 failed: ' + pw.slice(0, 12));
    await logout(W); await loginAs(W, 'cryptouser', 'secret-v2');
    pw = await storedPw(W, 'cryptouser');
    if (!pw.startsWith('v3$')) return BAD('بعد از ورود با v2 هنوز ارتقا نیافته: ' + pw.slice(0, 12));
    // and the pre-v2 legacy bare hash
    await W.ev(`(async () => { const u = _lsDB.users.find(x => x.username === 'cryptouser'); u.password = _lsHash('secret-legacy'); await _lsSave(); })()`);
    await logout(W); await loginAs(W, 'cryptouser', 'secret-legacy');
    pw = await storedPw(W, 'cryptouser');
    return pw.startsWith('v3$') ? OK('v2→v3 and legacy→v3 on login') : BAD('legacy hash not upgraded: ' + pw.slice(0, 12));
  });

  await T('W4', 'pbkdf2', 'رکورد v3 دست‌کاری‌شده (هش خراب / تکرار نجومی) رد می‌شود و اپ قفل یا کرش نمی‌کند', async () => {
    const before = await storedPw(W, 'cryptouser');
    // corrupt one char of the derived key
    await W.ev(`(async () => { const u = _lsDB.users.find(x => x.username === 'cryptouser'); const seg = u.password.split('$'); seg[3] = (seg[3][0] === 'A' ? 'B' : 'A') + seg[3].slice(1); u.password = seg.join('$'); await _lsSave(); })()`);
    let code = await W.ev(`(async () => { try { await api('/auth/login', { method: 'POST', body: { username: 'cryptouser', password: 'secret-legacy' } }); return 'ACCEPTED'; } catch (e) { return e.code || String(e); } })()`);
    if (code === 'ACCEPTED') return BAD('هش خراب پذیرفته شد');
    // absurd iteration count must be refused before deriving (no hang)
    await W.ev(`(async () => { const u = _lsDB.users.find(x => x.username === 'cryptouser'); const seg = u.password.split('$'); seg[1] = '999999999'; u.password = seg.join('$'); await _lsSave(); })()`);
    const t0 = Date.now();
    code = await W.ev(`(async () => { try { await api('/auth/login', { method: 'POST', body: { username: 'cryptouser', password: 'secret-legacy' } }); return 'ACCEPTED'; } catch (e) { return e.code || String(e); } })()`);
    const dt = Date.now() - t0;
    // restore the good record so later sections can use this app
    await W.ev(`(async () => { const u = _lsDB.users.find(x => x.username === 'cryptouser'); u.password = ${JSON.stringify(before)}; await _lsSave(); })()`);
    return (code !== 'ACCEPTED' && dt < 4000) ? OK('tampered rejected in ' + dt + 'ms (' + code + ')')
      : BAD('code=' + code + ' dt=' + dt + 'ms');
  });

  await T('W5', 'pbkdf2', 'بدون SubtleCrypto (مرورگر قدیمی/ناامن) ثبت‌نام و ورود با هش v2 ادامه دارد — کسی قفل نمی‌شود', async () => {
    const N = await bootApp({ injectCrypto: false });
    const has = await N.ev(`!!(typeof crypto !== 'undefined' && crypto.subtle)`);
    if (has) return BAD('setup: jsdom unexpectedly has subtle — fallback untestable here');
    await registerAs(N, 'بدون کریپتو', 'nocrypt', 'pass-12345');
    const pw = await storedPw(N, 'nocrypt');
    if (!pw.startsWith('v2$')) return BAD('انتظار v2 می‌رفت، ذخیره شد: ' + pw.slice(0, 12));
    await logout(N); await loginAs(N, 'nocrypt', 'pass-12345');
    return OK('v2 fallback register+login works');
  });

  /* ==================================================================
     Q) برچسب QR اختصاصی هر شفت
     ================================================================== */
  console.log('\n== Q) برچسب QR هر شفت ==');
  const pid = await W.ev(`api('/projects', { method: 'POST', body: { name: 'برج QR تست', customer: 'مشتری', capacityKg: 630, floors: 10, stops: 10 } }).then(d => d.project.id)`);
  const eid2 = await W.ev(`api('/projects/${pid}/elevators', { method: 'POST', body: { name: 'شفت غربی' } }).then(d => d.elevator.id)`);
  await W.ev(`loadAll(true)`);

  await T('Q1', 'shaft-qr', 'لینک QR شفت، پارامتر elevator دارد و لینک ساختمان ساده می‌ماند', async () => {
    const u1 = await W.ev(`qrUrlFor('${pid}', '${eid2}')`);
    const u0 = await W.ev(`qrUrlFor('${pid}', '')`);
    return (u1.endsWith('#/projects/' + pid + '?elevator=' + eid2) && u0.endsWith('#/projects/' + pid) && !u0.includes('?'))
      ? OK(u1) : BAD('shaft=' + u1 + ' building=' + u0);
  });

  await T('Q2', 'shaft-qr', 'اسکن QR شفت روی ساختمان فرود می‌آید، همان شفت متمرکز و فرم سرویس از پیش روی آن است', async () => {
    await W.nav('/projects/' + pid + '?elevator=' + eid2);
    const focusBtn = W.$$(`[onclick*="openServiceForm(null,'${pid}','${eid2}')"]`)[0];
    if (!focusBtn) return BAD('کارت تمرکز شفت (دکمهٔ سرویس این شفت) رندر نشد');
    const row = W.$('#elevRow-' + eid2);
    if (!row || !/accent/.test(row.getAttribute('style') || '')) return BAD('ردیف شفت هایلایت نشد');
    focusBtn.click();
    await W.waitUntil(() => W.$('#s_elevator_sel'), 15000, 'elevator picker');
    const sel = W.$('#s_elevator_sel').value;
    await W.ev('closeModal()'); await W.wait(250);
    return sel === eid2 ? OK('picker preselected to scanned shaft') : BAD('picker value=' + sel + ' expected ' + eid2);
  });

  await T('Q3', 'shaft-qr', 'مودال QR برای شفت، نام شفت را روی برچسب می‌نویسد؛ QR ساختمان بدون پسوند شفت است', async () => {
    await W.ev(`openQrModal('${pid}', '${eid2}')`);
    await W.waitUntil(() => W.$('#modalOverlay'), 15000, 'qr modal');
    const shaftHtml = W.$('#modalOverlay').innerHTML;
    await W.ev('closeModal()'); await W.wait(250);
    await W.ev(`openQrModal('${pid}')`);
    await W.waitUntil(() => W.$('#modalOverlay'), 15000, 'qr modal 2');
    const bHtml = W.$('#modalOverlay').innerHTML;
    await W.ev('closeModal()'); await W.wait(250);
    const okShaft = shaftHtml.includes('شفت غربی') && shaftHtml.includes('<svg') && shaftHtml.includes(`printQrLabel('${pid}','${eid2}')`);
    const okB = bHtml.includes('<svg') && !bHtml.includes('شفت غربی');
    return (okShaft && okB) ? OK('shaft label + building label correct')
      : BAD('shaft ok=' + okShaft + ' building ok=' + okB);
  });

  /* ==================================================================
     C) ورود گروهی CSV
     ================================================================== */
  console.log('\n== C) ورود گروهی CSV ==');

  await T('C1', 'csv', 'پارسر CSV: BOM و CRLF و فیلد کوتیشن‌دار و جداکنندهٔ «؛» اکسل ایرانی درست خوانده می‌شوند', async () => {
    const out = JSON.parse(await W.ev(`JSON.stringify({
      a: parseCsvText('\\ufeffa,b\\r\\n"x,y","q""z"\\r\\n'),
      b: parseCsvText('نام;تعداد\\nقطعه;۵'),
      c: parseCsvText('only-one\\n\\nsecond')
    })`));
    const aOk = JSON.stringify(out.a) === JSON.stringify([['a', 'b'], ['x,y', 'q"z']]);
    const bOk = JSON.stringify(out.b) === JSON.stringify([['نام', 'تعداد'], ['قطعه', '۵']]);
    const cOk = JSON.stringify(out.c) === JSON.stringify([['only-one'], ['second']]);
    return (aOk && bOk && cOk) ? OK('quotes/BOM/CRLF/semicolon all parse')
      : BAD('a=' + JSON.stringify(out.a) + ' b=' + JSON.stringify(out.b) + ' c=' + JSON.stringify(out.c));
  });

  await T('C2', 'csv', 'ایمپورت ساختمان‌ها: هدر فارسی، رقم فارسی، نگاشت نوع/وضعیت، ردِ بی‌نام و تکراری، و ورود دوباره بی‌اثر', async () => {
    await W.ev(`api('/projects', { method: 'POST', body: { name: 'ساختمان از قبل موجود' } })`);
    await W.ev(`loadAll(true)`);
    const maint = await W.ev(`I18N.fa.statusMaintenance`);
    const csv = ['نام,مشتری,تلفن,نوع,ظرفیت,طبقات,وضعیت,دوره سرویس',
      'برج ایمپورت یک,مشتری الف,09120000001,هیدرولیک,۴۵۰,۵,' + maint + ',۳۰',
      'برج ایمپورت دو,مشتری ب,,کششی,630,8,,',
      ',بی‌نام,,,,,,',
      'ساختمان از قبل موجود,تکراری,,,,,,',
      'برج ایمپورت یک,تکراری داخل فایل,,,,,,'].join('\n');
    W.w.__csv = csv;
    const plan = JSON.parse(await W.ev(`(async () => {
      const plan = csvClassify('projects', csvToObjects(parseCsvText(window.__csv)));
      return JSON.stringify({ ready: plan.ready.length, noName: plan.noName, dup: plan.dup,
        first: plan.ready[0] || null });
    })()`));
    if (!(plan.ready === 2 && plan.noName === 1 && plan.dup.length === 2)) return BAD('classify: ' + JSON.stringify(plan));
    if (!(plan.first.elevatorType === 'hydraulic' && plan.first.capacityKg === 450 && plan.first.floors === 5 &&
          plan.first.status === 'maintenance' && plan.first.serviceIntervalDays === 30)) {
      return BAD('نگاشت فیلدها غلط: ' + JSON.stringify(plan.first));
    }
    await W.ev(`(async () => {
      const plan = csvClassify('projects', csvToObjects(parseCsvText(window.__csv)));
      for (const b of plan.ready) { const d = await CSV_IMPORT_KINDS.projects.make(b); CSV_IMPORT_KINDS.projects.after(d); }
    })()`);
    const made = await W.ev(`state.projects.filter(p => p.name.startsWith('برج ایمپورت')).length`);
    const hyd = await W.ev(`(state.projects.find(p => p.name === 'برج ایمپورت یک') || {}).elevatorType`);
    const again = JSON.parse(await W.ev(`JSON.stringify((() => { const p2 = csvClassify('projects', csvToObjects(parseCsvText(window.__csv))); return { ready: p2.ready.length, dup: p2.dup.length }; })())`));
    return (made === 2 && hyd === 'hydraulic' && again.ready === 0 && again.dup === 4)
      ? OK('2 imported, re-import is a no-op')
      : BAD('made=' + made + ' type=' + hyd + ' again=' + JSON.stringify(again));
  });

  await T('C3', 'csv', 'ایمپورت قطعات: تکرار با «کد فنی» (حتی با نام دیگر) و با نام، رد می‌شود', async () => {
    await W.ev(`api('/parts', { method: 'POST', body: { name: 'قطعه از قبل موجود', code: 'EX-1', qty: 3 } })`);
    await W.ev(`loadAll(true)`);
    W.w.__csv2 = ['name,code,qty,price',
      'قطعه وارداتی یک,NW-1,۵,۱۲۰۰۰۰',
      'نام کاملاً دیگر,EX-1,3,100',
      'قطعه از قبل موجود,,2,200'].join('\n');
    const plan = JSON.parse(await W.ev(`JSON.stringify((() => { const p = csvClassify('parts', csvToObjects(parseCsvText(window.__csv2))); return { ready: p.ready.length, dup: p.dup, first: p.ready[0] || null }; })())`));
    if (!(plan.ready === 1 && plan.dup.length === 2)) return BAD('classify: ' + JSON.stringify(plan));
    if (!(plan.first.qty === 5 && plan.first.price === 120000)) return BAD('ارقام فارسی غلط خوانده شد: ' + JSON.stringify(plan.first));
    await W.ev(`(async () => {
      const plan = csvClassify('parts', csvToObjects(parseCsvText(window.__csv2)));
      for (const b of plan.ready) { const d = await CSV_IMPORT_KINDS.parts.make(b); CSV_IMPORT_KINDS.parts.after(d); }
    })()`);
    const got = await W.ev(`(state.parts.find(p => p.code === 'NW-1') || {}).qty`);
    return got === 5 ? OK('NW-1 imported with qty 5') : BAD('NW-1 qty=' + got);
  });

  /* ==================================================================
     M) ایمپورت ادغامی بکاپ (دو دستگاه)
     ================================================================== */
  console.log('\n== M) ایمپورت ادغامی بکاپ ==');
  const A2 = await bootApp();
  await registerAs(A2, 'دستگاه الف', 'deva', 'deva-12345');
  const pA = await A2.ev(`api('/projects', { method: 'POST', body: { name: 'ساختمان دستگاه الف', customer: 'مشتری الف', capacityKg: 630, floors: 9, stops: 9 } }).then(d => d.project.id)`);
  const elA2 = await A2.ev(`api('/projects/${pA}/elevators', { method: 'POST', body: { name: 'شفت شرقی', capacityKg: 800 } }).then(d => d.elevator.id)`);
  await A2.ev(`api('/services', { method: 'POST', body: { projectId: '${pA}', elevatorId: '${elA2}', serviceType: 'maintenance', problem: 'سرویس روی شفت شرقی' } })`);
  const invANo = await A2.ev(`api('/invoices', { method: 'POST', body: { customer: 'مشتری الف', projectId: '${pA}', items: [{ desc: 'سرویس', qty: 1, price: 1000 }], payments: [] } }).then(d => d.item.number)`);
  let bkAStr = await A2.ev(`(async () => JSON.stringify((await api('/backup')).backup))()`);

  const B2 = await bootApp();
  await registerAs(B2, 'دستگاه ب', 'devb', 'devb-12345');
  await B2.ev(`api('/settings', { method: 'PUT', body: { company: 'شرکت دستگاه ب' } })`);
  const pB = await B2.ev(`api('/projects', { method: 'POST', body: { name: 'ساختمان دستگاه ب', customer: 'مشتری ب' } }).then(d => d.project.id)`);
  const invBNo = await B2.ev(`api('/invoices', { method: 'POST', body: { customer: 'مشتری ب', projectId: '${pB}', items: [{ desc: 'کار', qty: 1, price: 2000 }], payments: [] } }).then(d => d.item.number)`);
  const usersBefore = await B2.ev(`_lsDB.users.length`);
  B2.w.__bk = JSON.parse(bkAStr);
  let rep1 = null;

  await T('M1', 'merge', 'مرج فایل دستگاه الف: ساختمان و شفت دوم و سرویسش می‌آیند و دادهٔ خود دستگاه ب سر جایش می‌ماند', async () => {
    rep1 = JSON.parse(await B2.ev(`api('/backup/merge', { method: 'POST', body: { backup: window.__bk } }).then(d => JSON.stringify(d.report))`));
    await B2.ev(`loadAll(true)`);
    const names = await B2.ev(`state.projects.map(p => p.name)`);
    const elevs = JSON.parse(await B2.ev(`api('/projects/${pA}/elevators').then(d => JSON.stringify(d.elevators.map(e => ({ name: e.name, cap: e.capacityKg }))))`));
    const svc = await B2.ev(`state.services.filter(s => s.projectId === '${pA}' && s.elevatorId === '${elA2}').length`);
    const ok = rep1.added.projects >= 1 && names.includes('ساختمان دستگاه الف') && names.includes('ساختمان دستگاه ب') &&
      elevs.length === 2 && elevs.some(e => e.name === 'شفت شرقی' && e.cap === 800) && svc === 1;
    return ok ? OK('added.projects=' + rep1.added.projects + ', elevators=2, shaft service carried')
      : BAD('rep=' + JSON.stringify(rep1.added) + ' names=' + JSON.stringify(names) + ' elevs=' + JSON.stringify(elevs) + ' svc=' + svc);
  });

  await T('M2', 'merge', 'شمارهٔ فاکتور تکراری بین دو دستگاه: فاکتور وارداتی پسوند می‌گیرد و شمارهٔ بعدی دستگاه درست ادامه پیدا می‌کند', async () => {
    if (String(invANo) !== String(invBNo)) return BAD('setup: شماره‌ها باید روی هر دو دستگاه یکی می‌شدند: A=' + invANo + ' B=' + invBNo);
    const nums = await B2.ev(`state.invoices.map(i => String(i.number))`);
    const renOk = rep1 && rep1.renumbered.length === 1 && rep1.renumbered[0].from === String(invBNo) && rep1.renumbered[0].to === String(invBNo) + '-B';
    const nextNo = await B2.ev(`api('/invoices', { method: 'POST', body: { customer: 'بعد از مرج', items: [{ desc: 'x', qty: 1, price: 5 }], payments: [] } }).then(d => d.item.number)`);
    const uniq = new Set([...nums, String(nextNo)]).size === nums.length + 1;
    return (renOk && nums.includes(String(invBNo)) && nums.includes(String(invBNo) + '-B') && uniq)
      ? OK('numbers: ' + [...nums, nextNo].join(','))
      : BAD('renumbered=' + JSON.stringify(rep1 && rep1.renumbered) + ' nums=' + JSON.stringify(nums) + ' next=' + nextNo);
  });

  await T('M3', 'merge', 'نسخهٔ تازه‌تر برنده است، نسخهٔ قدیمی‌تر برنمی‌گردد، و مرج دوبارهٔ همان فایل بی‌اثر است', async () => {
    await new Promise(r => setTimeout(r, 20));
    await A2.ev(`api('/projects/${pA}', { method: 'PUT', body: { name: 'ساختمان دستگاه الف — ویرایش‌شده' } })`);
    const bkA2Str = await A2.ev(`(async () => JSON.stringify((await api('/backup')).backup))()`);
    B2.w.__bk = JSON.parse(bkA2Str);
    const rep2 = JSON.parse(await B2.ev(`api('/backup/merge', { method: 'POST', body: { backup: window.__bk } }).then(d => JSON.stringify(d.report))`));
    await B2.ev(`loadAll(true)`);
    const nm = await B2.ev(`(state.projects.find(p => p.id === '${pA}') || {}).name || ''`);
    // merging the ORIGINAL (older) export again must not roll the name back
    B2.w.__bk = JSON.parse(bkAStr);
    const rep3 = JSON.parse(await B2.ev(`api('/backup/merge', { method: 'POST', body: { backup: window.__bk } }).then(d => JSON.stringify(d.report))`));
    await B2.ev(`loadAll(true)`);
    const nm2 = await B2.ev(`(state.projects.find(p => p.id === '${pA}') || {}).name || ''`);
    const ok = rep2.updated.projects === 1 && rep2.added.projects === 0 && nm.includes('ویرایش‌شده') &&
      rep3.added.projects === 0 && rep3.updated.projects === 0 && nm2.includes('ویرایش‌شده');
    return ok ? OK('newer won, older ignored, repeat = no-op')
      : BAD('rep2=' + JSON.stringify(rep2.updated) + '/' + JSON.stringify(rep2.added) + ' nm=' + nm + ' rep3u=' + rep3.updated.projects + ' nm2=' + nm2);
  });

  await T('M4', 'merge', 'مرج تنظیمات شرکت و حساب‌های کاربری این دستگاه را دست نمی‌زند', async () => {
    const company = await B2.ev(`api('/settings').then(d => (d.settings || {}).company || '')`);
    const usersAfter = await B2.ev(`_lsDB.users.length`);
    return (company === 'شرکت دستگاه ب' && usersAfter === usersBefore)
      ? OK('company kept, users=' + usersAfter)
      : BAD('company=' + company + ' users ' + usersBefore + '→' + usersAfter);
  });

  await T('M5', 'merge', 'رکورد یتیم (سرویسِ ساختمانی که هیچ‌جا نیست) وارد نمی‌شود و دادهٔ سالم دست‌نخورده می‌ماند', async () => {
    const bkBad = JSON.parse(bkAStr);
    bkBad.services = [...(bkBad.services || []), { id: 'orphan000000001', projectId: 'nope00000000000', elevatorId: 'nope00000000000', date: Date.now(), createdAt: Date.now(), problem: 'سرویس یتیم' }];
    B2.w.__bk = bkBad;
    const res = JSON.parse(await B2.ev(`(async () => { try { const d = await api('/backup/merge', { method: 'POST', body: { backup: window.__bk } }); return JSON.stringify({ ok: true, orphaned: (d.report.orphaned || []).length }); } catch (e) { return JSON.stringify({ ok: false, code: e.code || String(e.message || e) }); } })()`));
    const present = await B2.ev(`_lsDB.services.some(s => s.id === 'orphan000000001')`);
    const intact = await B2.ev(`state.projects.some(p => p.id === '${pB}')`);
    await B2.ev(`loadAll(true)`);
    return (!present && intact)
      ? OK('stopped by ' + (res.ok ? 'orphan-filter (orphaned=' + res.orphaned + ')' : 'validator (' + String(res.code).slice(0, 40) + ')'))
      : BAD('orphan present=' + present + ' own data intact=' + intact + ' res=' + JSON.stringify(res));
  });

  /* ==================================================================
     D) آماده‌به‌دستگاه (PWA statics — pure fs checks)
     ================================================================== */
  console.log('\n== D) آماده‌به‌دستگاه (PWA) ==');

  await T('D1', 'pwa', 'مانیفست نصب‌پذیر است: نام/نمایش standalone و آیکون‌های 192 و 512 و maskable روی دیسک هستند', async () => {
    const man = JSON.parse(readSrc('manifest.json'));
    const sizes = new Set((man.icons || []).map(i => i.sizes));
    const maskable = (man.icons || []).some(i => String(i.purpose || '').includes('maskable'));
    const missing = (man.icons || []).map(i => i.src).filter(s => !fs.existsSync(path.join(ROOT, s)) || fs.statSync(path.join(ROOT, s)).size === 0);
    const ok = !!man.name && !!man.short_name && man.display === 'standalone' && man.start_url &&
      sizes.has('192x192') && sizes.has('512x512') && maskable && !missing.length;
    return ok ? OK('manifest installable, icons present')
      : BAD('display=' + man.display + ' sizes=' + [...sizes].join(',') + ' maskable=' + maskable + ' missing=' + missing.join(','));
  });

  await T('D2', 'pwa', 'index.html متاهای موبایل (viewport-fit، theme-color، apple-touch-icon، manifest) را دارد و همهٔ ارجاع‌هایش روی دیسک‌اند', async () => {
    const idx = rawHtml;
    const metas = [/name="viewport"[^>]*viewport-fit=cover/, /name="theme-color"/, /rel="apple-touch-icon"/, /rel="manifest"/];
    const badMeta = metas.filter(re => !re.test(idx));
    const refs = [...idx.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1])
      .filter(u => u && !/^(https?:|data:|#|mailto:|tel:)/.test(u));
    const missing = refs.filter(u => !fs.existsSync(path.join(ROOT, u.split('?')[0])));
    return (!badMeta.length && !missing.length) ? OK(refs.length + ' local refs resolve')
      : BAD('badMeta=' + badMeta.length + ' missing=' + missing.join(','));
  });

  await T('D3', 'pwa', 'سرویس‌ورکر: precache اتمیک است و تک‌تک ورودی‌های CORE روی دیسک وجود دارند (ورودی اشتباه = نصب آفلاین خراب)', async () => {
    const sw = readSrc('sw.js');
    const coreBlock = (sw.match(/const CORE = \[([\s\S]*?)\];/) || [])[1] || '';
    const entries = [...coreBlock.matchAll(/'([^']+)'/g)].map(m => m[1]);
    const missing = entries.filter(e => e !== './' && !fs.existsSync(path.join(ROOT, e.replace(/^\.\//, ''))));
    const ok = entries.length > 20 && sw.includes('addAll(CORE)') && entries.includes('./manifest.json') &&
      entries.some(e => e.includes('icons/icon-192')) && !missing.length;
    return ok ? OK(entries.length + ' core entries, all on disk')
      : BAD('entries=' + entries.length + ' missing=' + missing.join(','));
  });

  await T('ZZ', 'hygiene', 'هیچ خطای JS شنیده‌نشده‌ای در کل ران نبود', async () => {
    const all = [...W.errs, ...A2.errs, ...B2.errs];
    return all.length === 0 ? OK('clean') : BAD(all.slice(0, 3).join(' | '));
  });

  fs.writeFileSync(path.join(ROOT, 'qa/platform-results.json'), JSON.stringify({ pass, fail, results }, null, 2));
  console.log(`\nPLATFORM RESULT: ${pass} passed, ${fail} failed  (✗ = platform regression)`);
  console.log('details → qa/platform-results.json');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
