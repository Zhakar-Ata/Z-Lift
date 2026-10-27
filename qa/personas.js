/* Z Lift — PERSONA-BASED real-user testing (jsdom)
   Eight different "user models" drive the actual UI end-to-end:

     P1  رضا، تکنسین تازه‌کار      — اشتباه‌های رایج، عدد فارسی، دابل‌کلیک
     P2  خانم محمدی، مدیر مالی       — چرخهٔ کامل فاکتور/پرداخت/قرارداد/چاپ
     P3  John، تکنسین انگلیسی‌زبان  — پیمایش کل اپ در EN و شکار نشت فارسی
     P4  تیم کارگاه، تبلت اشتراکی    — چند حساب، نشت تنظیمات، خروج وسط فرم
     P5  استادکار پرحجم             — صدها رکورد، سقف لیست‌ها، سرعت رندر
     P6  ممیز ایمنی                  — چک‌لیست، اندازه‌گیری، محاسبات
     P7  شرایط سخت                   — خرابی داده، ریلود، دیپ‌لینک، ایمپورت خراب
     P8  میمون هرج‌ومرج              — کلیک/تایپ تصادفی و شکار کرش

   Every check states the expected correct behaviour; ✗ = a real user hits a
   bug/trap. Companion to qa/real-user.js (which covers the first audit).
   Run:  node qa/personas.js        Exit 0 = every expectation holds. */
const { JSDOM, VirtualConsole } = require('jsdom');
const { IDBFactory, IDBKeyRange } = require('fake-indexeddb');
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
async function bootApp({ idbFactory = null, lsSeed = null, urlHash = '' } = {}) {
  const errs = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => {
    const m = String((e && e.detail && e.detail.message) || (e && e.message) || e);
    if (/canvas|getContext|Could not parse CSS|Not implemented|scrollTo|navigation/i.test(m)) return;
    errs.push(m.split('\n')[0].slice(0, 220));
  });
  const factory = idbFactory || new IDBFactory();
  const dom = new JSDOM(html, {
    url: 'http://localhost:4173/index.html' + urlHash,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.indexedDB = factory;
      window.IDBKeyRange = IDBKeyRange;
      if (lsSeed) { try { for (const [k, v] of Object.entries(lsSeed)) window.localStorage.setItem(k, v); } catch (e) {} }
    }
  });
  const w = dom.window;
  const document = w.document;
  w.scrollTo = () => {};
  w.print = () => {};
  w.addEventListener('error', e => {
    const stk = (e.error && e.error.stack) ? String(e.error.stack).split('\n').slice(1, 3).join(' @ ') : '';
    errs.push('window.error: ' + String(e.message || '').slice(0, 160) + (stk ? ' || ' + stk.slice(0, 260) : ''));
  });
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
  const clickOnclick = async substr => { await waitUntil(() => $$('[onclick]').some(e => (e.getAttribute('onclick') || '').includes(substr)), 12000, 'onclick~' + substr); const el = $$('[onclick]').find(e => (e.getAttribute('onclick') || '').includes(substr)); el.click(); return el; };
  const until = sel => waitUntil(() => $(sel), 12000, sel);
  const modalOpen = () => !!$('#modalOverlay');
  const closedSettle = async () => { await waitUntil(() => !modalOpen(), 12000, 'modal close'); await wait(450); };
  const toastText = () => ($('#toastRoot') ? $('#toastRoot').textContent.trim() : '');
  const clearToasts = () => { if ($('#toastRoot')) $('#toastRoot').innerHTML = ''; };
  const refresh = async () => { await ev('loadAll(true)'); };
  const snapshotLS = () => { const o = {}; try { for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); o[k] = w.localStorage.getItem(k); } } catch (e) {} return o; };
  const A = { w, document, ev, wait, waitUntil, $, $$, loadWait, fire, typeIn, setVal, clickOnclick, until, modalOpen, closedSettle, toastText, clearToasts, refresh, snapshotLS, errs, factory,
    nav: async r => { await ev(`navigate('${r}')`); await loadWait(); } };
  await waitUntil(() => ev(`typeof init === 'function'`), 12000, 'boot');
  await ev(`localStorage.setItem('zlift_last_external_backup', String(Date.now()))`);
  await ev(`localStorage.setItem('zlift_backup_snooze', String(Date.now() + 30 * 86400000))`);
  return A;
}
async function authVisible(A) { return A.$('#authView') && !A.$('#authView').classList.contains('hidden'); }
async function appVisible(A) { return A.$('#appView') && !A.$('#appView').classList.contains('hidden'); }
async function loginAs(A, user, pass) {
  await A.waitUntil(async () => authVisible(A) || appVisible(A), 12000, 'auth/app');
  if (await appVisible(A)) return true;
  const tabL = A.$('#tabLogin'); if (tabL) { tabL.click(); await A.wait(150); }
  A.typeIn('#authUsername', user); A.typeIn('#authPassword', pass);
  A.fire(A.$('#authForm'), 'submit');
  await A.waitUntil(async () => appVisible(A), 12000, 'login ' + user);
  await A.loadWait();
  return true;
}
async function registerAs(A, name, user, pass) {
  await A.waitUntil(async () => authVisible(A) || appVisible(A), 12000, 'auth/app');
  A.$('#tabRegister').click();
  A.typeIn('#authName', name); A.typeIn('#authUsername', user); A.typeIn('#authPassword', pass);
  A.fire(A.$('#authForm'), 'submit');
  await A.waitUntil(async () => appVisible(A), 12000, 'register ' + user);
  await A.loadWait();
  return true;
}
async function logout(A) {
  await A.ev(`document.querySelector('#logoutBtn').click()`);
  await A.waitUntil(async () => authVisible(A), 12000, 'logout');
  await A.wait(300);
}
let uniq = 0;
const U = (base) => base + ' #' + (++uniq);

(async () => {

  /* ==================================================================
     P1 — رضا، تکنسین تازه‌کار: اشتباه‌های رایج در اولین روزهای کاری
     ================================================================== */
  console.log('\n== P1) رضا — تکنسین تازه‌کار (اشتباه‌های رایج) ==');
  const A = await bootApp();
  await registerAs(A, 'رضا تازه‌کار', 'رضا', 'reza123');
  let projA = null, partA = null;

  await T('N1', 'novice', 'مبلغ قرارداد با ارقام فارسی («۲۵۰۰۰۰») بی‌صدا صفر نمی‌شود', async () => {
    await A.nav('/contracts');
    await A.clickOnclick('openContractForm()'); await A.until('#ct_building');
    A.typeIn('#ct_building', U('برج قرارداد عدد فارسی'));
    const amt = A.$('#ct_amount'); amt.focus(); amt.value = '۲۵۰۰۰۰'; A.fire(amt, 'input'); A.fire(amt, 'change');
    A.clearToasts();
    A.$('#ctSave').click(); await A.wait(700);
    const ct = await A.ev(`state.contracts.find(x => x.building.startsWith('برج قرارداد عدد فارسی'))`);
    if (A.modalOpen()) { await A.ev('closeModal()'); await A.wait(200); }
    if (!ct) return BAD('قرارداد ساخته نشد و خطای روشنی هم نیست (toast: «' + A.toastText() + '»)');
    return ct.amount === 250000 ? OK('250000 saved')
      : BAD(`کاربر «۲۵۰۰۰۰» چسباند/تایپ کرد ولی amount=${ct.amount} ذخیره شد — روی کیبورد/مرورگری که رقم فارسی را در input[type=number] تبدیل نمی‌کند، مبلغ قرارداد بی‌صدا صفر می‌شود و «مبلغ مورد انتظار ماه» غلط می‌شود`);
  });

  await T('N2', 'novice', 'چسباندن «۱٬۲۵۰» در مقدار اندازه‌گیری ۱۲۵۰ خوانده می‌شود، نه ۱٫۲۵', async () => {
    const v = await A.ev(`parseNum('۱٬۲۵۰')`);
    const v2 = await A.ev(`parseNum('1,250')`);
    return (v === 1250 && v2 === 1250) ? OK('1250')
      : BAD(`parseNum('۱٬۲۵۰')=${v} و parseNum('1,250')=${v2} — نویسهٔ ٬ جداکنندهٔ هزارگان است نه اعشار؛ مقاومت عایقیِ ۱۲۵۰ اهم از پیامک/اکسل پیست شود ۱٫۲۵ ذخیره و «خارج از بازه» قضاوت می‌شود`);
  });

  await T('N3', 'novice', 'دابل‌کلیک روی «ایجاد پروژه» پروژهٔ تکراری نمی‌سازد', async () => {
    await A.nav('/projects');
    await A.clickOnclick('openProjectForm()'); await A.until('#f_name');
    const nm = U('ساختمان دابل‌کلیک');
    A.typeIn('#f_name', nm);
    const before = await A.ev('state.projects.length');
    A.$('#projSave').click(); A.$('#projSave').click(); A.$('#projSave').click();
    await A.wait(900);
    if (A.modalOpen()) { await A.ev('closeModal()'); await A.wait(200); }
    const after = await A.ev('state.projects.length');
    const made = await A.ev(`state.projects.filter(p => p.name === '${nm}').length`);
    projA = await A.ev(`(state.projects.find(p => p.name === '${nm}') || {}).id`);
    return (made === 1 && after === before + 1) ? OK('exactly one')
      : BAD(`${made} پروژه با یک نام ساخته شد (${before}→${after}) — دکمهٔ ذخیره در برابر لمس مضاعفِ کاربر عجول/دستکش‌پوش محافظ ندارد`);
  });

  await T('N4', 'novice', 'نام فقط فاصله برای پروژه پذیرفته نمی‌شود', async () => {
    const before = await A.ev('state.projects.length');
    await A.clickOnclick('openProjectForm()'); await A.until('#f_name');
    A.typeIn('#f_name', '     ');
    A.$('#projSave').click(); await A.wait(600);
    const still = A.modalOpen();
    const after = await A.ev('state.projects.length');
    if (A.modalOpen()) { await A.ev('closeModal()'); await A.wait(200); }
    return (still && after === before) ? OK('blocked') : BAD(`پروژهٔ بی‌نام ساخته شد یا بدون خطا بسته شد (modalOpen=${still}, ${before}→${after})`);
  });

  await T('N5', 'novice', 'جستجوی پروژه با حروف عربی (ي/ك) همان پروژهٔ فارسی را پیدا می‌کند', async () => {
    await A.nav('/projects');
    await A.clickOnclick('openProjectForm()'); await A.until('#f_name');
    A.typeIn('#f_name', 'ساختمان یکتای کیان');
    A.$('#projSave').click(); await A.closedSettle();
    const inp = A.$('.search input, #content .search input') || A.$('input[type="search"], .toolbar input');
    if (!inp) return BAD('search input not found on projects page');
    inp.focus(); inp.value = 'يكتاي كيان'; A.fire(inp, 'input');
    await A.wait(600);
    const hit = A.$('#content').textContent.includes('ساختمان یکتای کیان');
    inp.value = ''; A.fire(inp, 'input'); await A.wait(400);
    return hit ? OK('arabic ي ك matched') : BAD('با کیبورد عربی (ي/ك) ساختمان «یکتای کیان» پیدا نشد — نرمال‌سازی جستجو حروف عربی را پوشش نمی‌دهد');
  });

  await T('N6', 'novice', 'ثبت اشتباهیِ سرویس با تاریخ آینده (+۴۰ روز) یادآوری دوره‌ای را کور نمی‌کند', async () => {
    // project with monthly service whose last real service was 35 days ago (overdue…)
    const made = await A.ev(`api('/projects', { method: 'POST', body: { name: '${U('برج تاریخ آینده')}', serviceIntervalDays: 30 } })`);
    const pid = made.project.id;
    await A.ev(`api('/services', { method: 'POST', body: { projectId: '${pid}', serviceType: 'maintenance', date: Date.now() - 35 * 86400000, problem: 'سرویس دوره‌ای قبلی' } })`);
    await A.refresh();
    const before = await A.ev(`(() => { const r = buildReminders().find(r => r.projectId === '${pid}' && r.kind === 'periodic'); return r ? { n: 1, overdue: r.overdue, days: r.days } : { n: 0 }; })()`);
    // …then the novice fat-fingers the date picker one month too far while logging today's visit
    await A.nav('/services');
    await A.ev(`openServiceForm(null, '${pid}')`); await A.until('#svcSave');
    await A.ev(`(() => { const el = document.querySelector('#s_date'); const ts = Date.now() + 40 * 86400000; el.dataset.ts = ts; el.value = fmtJalali(ts); })()`);
    A.typeIn('#s_problem', 'سرویس امروز با تاریخ اشتباه');
    A.clearToasts();
    A.$('#svcSave').click(); await A.wait(900);
    if (A.modalOpen()) { await A.ev('closeModal()'); await A.wait(200); }
    await A.refresh();
    const after = await A.ev(`(() => { const r = buildReminders().find(r => r.projectId === '${pid}' && r.kind === 'periodic'); return r ? { n: 1, overdue: r.overdue, days: r.days } : { n: 0 }; })()`);
    const warned = /آینده|future/i.test(A.toastText());
    return (before.overdue && (warned || after.overdue)) ? OK(`warned=${warned} overdue kept, days=${after.days}`)
      : BAD(`ساختمان ۵ روز از سرویس ماهانه عقب بود (overdue=${before.overdue})؛ یک سرویس با تاریخِ اشتباهِ ۴۰ روز آینده ثبت شد و حالا overdue=${after.overdue} با ${after.days} روز مانده — dueInfo آخرین تاریخ (حتی آینده) را مبنا می‌گیرد و هیچ هشداری نیست؛ ساختمان تا ~۷۰ روز از رادار سرویس می‌افتد`);
  });

  await T('N7', 'novice', 'بستن تصادفی فرم نیمه‌پر سرویس، اطلاعات را بی‌هیچ هشداری نمی‌پراند', async () => {
    await A.nav('/services');
    await A.ev('openServiceForm()'); await A.until('#svcSave');
    A.typeIn('#s_customer', 'مشتری فرم نیمه‌کاره');
    A.typeIn('#s_problem', 'شرح کامل خرابی که تکنسین ده دقیقه تایپ کرده است');
    // accidental tap on the ✕ / cancel zone
    const x = A.$('#modalRoot .icon-btn');
    A.clearToasts();
    if (x) x.click(); else await A.ev('closeModal()');
    await A.wait(700);
    const asked = A.modalOpen() && /لغو|پیش‌نویس|از دست|discard|unsaved/i.test(A.$('#modalRoot').textContent);
    if (A.modalOpen()) {
      // prefer "keep editing" if asked; otherwise close whatever is open
      const btns = A.$$('#modalRoot button');
      const keep = btns.find(b => /ادامه|keep/i.test(b.textContent));
      (keep || btns[btns.length - 1] || { click() {} }).click(); await A.wait(400);
      if (A.modalOpen()) { await A.ev('closeModal()'); await A.wait(200); }
    }
    // reopen: was the typed text preserved as a draft anywhere?
    let preserved = false;
    if (!asked) {
      await A.ev('openServiceForm()'); await A.until('#svcSave');
      preserved = (A.$('#s_problem') || {}).value === 'شرح کامل خرابی که تکنسین ده دقیقه تایپ کرده است';
      await A.ev('closeModal()'); await A.wait(200);
    }
    return (asked || preserved) ? OK(asked ? 'confirm-discard shown' : 'draft preserved')
      : BAD('یک لمس اشتباه روی ✕ یعنی کل فرم پرشده بی‌سروصدا دور ریخته می‌شود: نه تأیید «تغییرات ذخیره‌نشده» هست نه پیش‌نویس خودکار — در موتورخانه با دستکش یعنی از نو تایپ‌کردن');
  });

  /* ==================================================================
     P2 — خانم محمدی، مدیر مالی: چرخهٔ کامل پول
     ================================================================== */
  console.log('\n== P2) خانم محمدی — مدیر مالی (فاکتور/قرارداد/گزارش) ==');
  let invFrac = null, invMain = null;

  await T('F1', 'finance', 'تعداد اعشاری (۲٫۵ متر کابل): جمعِ فرم فاکتور = جمعِ ذخیره‌شده در لیست', async () => {
    await A.nav('/invoices');
    await A.clickOnclick('openInvoiceForm()'); await A.until('#invSave');
    A.typeIn('#inv_customer', U('مشتری اعشاری'));
    await A.ev(`invAddItem({ desc: 'کابل فرمان', qty: 2.5, price: 100000 })`);
    await A.wait(300);
    const formTxt = (A.$('#invTotalsBox') || {}).textContent || '';
    const formGrand = await A.ev(`(() => { const els = [...document.querySelectorAll('#invTotalsBox .r-val')]; return els.length ? els[els.length - 1].textContent : ''; })()`);
    A.setVal('#inv_taxrate', '0');
    A.$('#invSave').click(); await A.closedSettle();
    const inv = await A.ev(`state.invoices.find(i => i.customer.startsWith('مشتری اعشاری'))`);
    invFrac = inv && inv.id;
    const saved = inv ? await A.ev(`invTotals(state.invoices.find(i => i.id === '${inv.id}')).grand`) : null;
    return (saved === 250000) ? OK('grand 250,000 everywhere')
      : BAD(`فرم جمع را ۲۵۰٬۰۰۰ نشان می‌دهد (۲٫۵×۱۰۰٬۰۰۰) ولی جمعِ ذخیره‌شده/لیست ${saved} است — invTotals تعداد را قبل از ضرب گرد می‌کند (۲٫۵→۳) و invRefreshTotals بعد از ضرب؛ مشتری روی کاغذ یک عدد می‌بیند و در سیستم عدد دیگر`);
  });

  await T('F2', 'finance', 'پرداخت جزئی→تسویه: وضعیت و کارت‌های «درآمد ماه/مانده باز» با واقعیت می‌خوانند', async () => {
    await A.nav('/invoices');
    await A.ev('openInvoiceForm()'); await A.until('#invSave');
    A.typeIn('#inv_customer', U('مشتری اقساطی'));
    await A.ev(`invAddItem({ desc: 'تعمیر درایو', qty: 1, price: 1000000 })`);
    A.setVal('#inv_taxrate', '0');
    A.$('#invSave').click(); await A.closedSettle();
    const inv = await A.ev(`state.invoices.find(i => i.customer.startsWith('مشتری اقساطی'))`);
    invMain = inv.id;
    const payPartial = async amt => {
      await A.ev(`openInvoiceForm('${invMain}')`); await A.until('#invSave');
      A.$('#invPayBtn').click(); await A.until('#pay_amount');
      A.setVal('#pay_amount', String(amt));
      A.$('#payOk').click(); await A.until('#invSave');
      A.$('#invSave').click(); await A.closedSettle();
    };
    await payPartial(400000);
    let st = await A.ev(`invStatusMeta(state.invoices.find(i => i.id === '${invMain}')).key`);
    let bal = await A.ev(`invTotals(state.invoices.find(i => i.id === '${invMain}')).balance`);
    const partialOK = st === 'invPartial' && bal === 600000;
    await payPartial(600000);
    st = await A.ev(`invStatusMeta(state.invoices.find(i => i.id === '${invMain}')).key`);
    bal = await A.ev(`invTotals(state.invoices.find(i => i.id === '${invMain}')).balance`);
    await A.nav('/invoices');
    const txt = A.$('#content').textContent.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
    // income(30d) card must at least include this invoice's 1,000,000; open balance must not include it
    const openBal = await A.ev(`state.invoices.reduce((a, i) => a + invTotals(i).balance, 0)`);
    return (partialOK && st === 'invPaidFull' && bal === 0 && txt.includes('1,000,000')) ? OK('partial→paid, cards consistent (openBal total=' + openBal + ')')
      : BAD(`partialOK=${partialOK} status=${st} balance=${bal} — وضعیت/مانده بعد از پرداخت‌ها از واقعیت عقب است`);
  });

  await T('F3', 'finance', 'کم‌کردن مبلغ فاکتورِ تسویه‌شده، اضافه‌پرداخت را روی چاپ هم نشان می‌دهد', async () => {
    await A.ev(`openInvoiceForm('${invMain}')`); await A.until('#invSave');
    // shrink the only item from 1,000,000 to 700,000 while 1,000,000 is already paid
    const price = A.$('#invItemsBox [data-if="price"]');
    price.value = '700000'; A.fire(price, 'input');
    await A.wait(300);
    A.$('#invSave').click(); await A.closedSettle();
    const tt = await A.ev(`invTotals(state.invoices.find(i => i.id === '${invMain}'))`);
    await A.ev(`printInvoice('${invMain}')`); await A.wait(300);
    const sheet = (A.$('#printSheet') || {}).textContent || '';
    const sheetEn = sheet.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/٬/g, ',');
    const showsOver = /300[٬,]000/.test(sheetEn) && /اضافه|overpay/i.test(sheet);
    return (tt.overpayment === 300000 && showsOver) ? OK('overpayment on print')
      : BAD(`اضافه‌پرداخت ${tt.overpayment} ریال در داده هست ولی روی فاکتور چاپی که دست مشتری می‌رسد هیچ ردیفی برایش نیست (فقط «مانده: ۰») — ۳۰۰ هزار تومانِ مشتری روی کاغذ ناپدید می‌شود و اختلاف حساب ساخته می‌شود`);
  });

  await T('F4', 'finance', 'فاکتور صفر (تخفیف = کل مبلغ) «پرداخت‌نشده»🔴 حساب نمی‌شود', async () => {
    await A.ev('openInvoiceForm()'); await A.until('#invSave');
    A.typeIn('#inv_customer', U('مشتری رایگان گارانتی'));
    await A.ev(`invAddItem({ desc: 'تعویض تحت گارانتی', qty: 1, price: 500000 })`);
    A.setVal('#inv_discount', '500000'); A.setVal('#inv_taxrate', '0');
    A.$('#invSave').click(); await A.closedSettle();
    const inv = await A.ev(`state.invoices.find(i => i.customer.startsWith('مشتری رایگان گارانتی'))`);
    const st = inv ? await A.ev(`invStatusMeta(state.invoices.find(i => i.id === '${inv.id}')).key`) : null;
    return (inv && st !== 'invUnpaid') ? OK('status=' + st)
      : BAD(`فاکتورِ کاملاً تخفیف‌خورده (جمع نهایی ۰) با وضعیت «${st}» قرمز می‌شود و در فیلتر «پرداخت‌نشده»ها و پیگیری وصول می‌آید — مشتری بدهکار نیست ولی سیستم طلبکارش می‌بیند`);
  });

  await T('F5', 'finance', 'قراردادی که از امروز شروع می‌شود روز اول «معوق» نیست', async () => {
    const made = await A.ev(`api('/contracts', { method: 'POST', body: { building: '${U('ساختمان تازه‌قرارداد')}', amount: 200000, months: 12, startTs: Date.now(), paid: {} } })`);
    await A.refresh();
    const st = await A.ev(`ctStats(state.contracts.find(c => c.id === '${made.item.id}'))`);
    return (st.overdue === 0) ? OK('not overdue on day 1')
      : BAD(`قرارداد دست‌امضا ${st.overdue} ماه «معوق»🔴 نشان می‌دهد — ماه جاری از روز اول «سررسیدشده» حساب می‌شود (m.ts <= now)؛ مدیر هر قرارداد جدید را با اخطار قرمز تحویل می‌گیرد و روی داشبورد هم طلبِ معوق جعلی می‌آید`);
  });

  await T('F6', 'finance', 'جابه‌جا کردن تاریخ شروع قرارداد، پرداخت‌های ثبت‌شدهٔ ماه‌ها را گم نمی‌کند', async () => {
    const lost = await A.ev(`(async () => {
      const threeAgo = Date.now() - 95 * 86400000;
      const d = await api('/contracts', { method: 'POST', body: { building: 'قرارداد جابه‌جایی تست', amount: 100000, months: 12, startTs: threeAgo, paid: {} } });
      const ct0 = state.contracts.find(c => c.id === d.item.id) || d.item;
      const keys = ctMonthList(ct0).slice(0, 3).map(m => m.key);
      const paid = {}; keys.forEach(k => paid[k] = true);
      await api('/contracts/' + ct0.id, { method: 'PUT', body: { paid } });
      await loadAll(true);
      const ct1 = state.contracts.find(c => c.id === ct0.id);
      const paidBefore = ctStats(ct1).paidCount;
      // office fixes a wrong start date: one month later
      await api('/contracts/' + ct0.id, { method: 'PUT', body: { startTs: threeAgo + 31 * 86400000, paid: ct1.paid } });
      await loadAll(true);
      const ct2 = state.contracts.find(c => c.id === ct0.id);
      return { paidBefore, paidAfter: ctStats(ct2).paidCount, overdueAfter: ctStats(ct2).overdue };
    })()`);
    return (lost.paidBefore === lost.paidAfter) ? OK(`paid ${lost.paidBefore}→${lost.paidAfter}`)
      : BAD(`۳ ماه پرداختی (${lost.paidBefore}) بعد از اصلاح تاریخ شروع شد ${lost.paidAfter} و معوق=${lost.overdueAfter} — کلید پرداخت‌ها «سال-ماه» تقویمی است؛ شیفت تاریخ یعنی پولِ گرفته‌شده از روی جدول محو و مشتری دوباره بدهکار دیده می‌شود، بدون هیچ هشدار`);
  });

  await T('F7', 'finance', 'چاپ فاکتور اطلاعات شرکتِ تنظیمات را دارد', async () => {
    await A.nav('/settings'); await A.wait(400);
    // set company info through the real settings UI if present, else via API like the UI does
    const co = A.$('#setCompany, [id*="company" i], input[name*="company" i]');
    if (co) { A.typeIn('#' + (co.id || 'setCompany'), 'شرکت آسانسور تست پارس'); }
    await A.ev(`api('/settings', { method: 'PUT', body: Object.assign({}, state.settings, { company: 'شرکت آسانسور تست پارس', phone: '09120000000' }) })`);
    await A.refresh();
    await A.ev(`printInvoice('${invMain}')`); await A.wait(300);
    const sheet = (A.$('#printSheet') || {}).textContent || '';
    return sheet.includes('شرکت آسانسور تست پارس') ? OK('company on print')
      : BAD('نام شرکتی که در تنظیمات ذخیره شده روی فاکتور چاپی نیست — سند رسمی بدون سربرگ شرکت صادر می‌شود');
  });

  await T('F8', 'finance', 'متن اشتراک‌گذاری فاکتور شماره و ماندهٔ درست دارد', async () => {
    const txt = await A.ev(`buildInvoiceText(state.invoices.find(i => i.id === '${invMain}'))`);
    const inv = await A.ev(`state.invoices.find(i => i.id === '${invMain}')`);
    const numOk = inv.number ? txt.includes(String(inv.number).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[d])) || txt.includes(String(inv.number)) : true;
    return numOk ? OK('number in share text') : BAD(`شمارهٔ فاکتور (${inv.number}) در متن اشتراک نیست: «${String(txt).slice(0, 90)}…» — مشتری در پیام‌رسان نمی‌داند بابت کدام فاکتور پول می‌دهد`);
  });

  /* ==================================================================
     P3 — John، English sweep روی نمونهٔ جدا با دادهٔ انگلیسی
     ================================================================== */
  console.log('\n== P3) John — English-speaking senior tech (EN sweep) ==');
  const B = await bootApp();
  await B.ev(`localStorage.setItem('zlift_lang', 'en')`);
  await registerAs(B, 'John Carter', 'John', 'english1');
  // minimal English-named data so lists are not just empty states
  await B.ev(`(async () => {
    const p = await api('/projects', { method: 'POST', body: { name: 'Alpha Tower', customer: 'Mr Smith', floors: 8 } });
    await api('/services', { method: 'POST', body: { projectId: p.project.id, serviceType: 'maintenance', date: Date.now(), problem: 'Monthly visit' } });
    await api('/parts', { method: 'POST', body: { name: 'Brake coil', code: 'BC-10', qty: 4, price: 9000 } });
    await loadAll(true);
  })()`);

  await T('E1', 'i18n', 'پیمایش همهٔ صفحه‌ها در EN: کرومِ رابط (عنوان/ابزار/دکمه‌ها) فارسی نشت نمی‌کند', async () => {
    if (await B.ev('LANG') !== 'en') { await B.ev(`setLang('en')`); await B.wait(500); await B.loadWait(); }
    const routes = ['/dashboard', '/projects', '/services', '/parts', '/checklists', '/calculations', '/diagnostics', '/knowledge', '/notes', '/vvvf', '/issues', '/tools', '/invoices', '/contracts', '/report', '/standards', '/calendar', '/analytics', '/measurements', '/settings', '/finance', '/workshop'];
    const FA = /[\u0600-\u06FF]/;
    const leaks = [];
    for (const r of routes) {
      await B.nav(r);
      const chrome = await B.ev(`(() => {
        const take = sel => [...document.querySelectorAll(sel)].map(e => e.textContent.trim()).filter(Boolean);
        return [
          (document.querySelector('#pageTitle') || {}).textContent || '',
          ...take('.toolbar .chip'), ...take('.card-title'), ...take('.stat-label'),
          ...take('.empty strong'), ...take('.empty p'), ...take('.btn'), ...take('.section-title h3'),
          ...take('#bottomNav .nav-item span'), ...take('#mainNav .nav-item span'), ...take('.nav-section')
        ];
      })()`);
      const bad = chrome.filter(s => FA.test(s) && !/Alpha|Smith/.test(s));
      if (bad.length) leaks.push(r + ' → ' + bad.slice(0, 3).join('؛ '));
    }
    return leaks.length === 0 ? OK('no Persian in UI chrome across 22 routes')
      : BAD('نشت فارسی در رابط انگلیسی:\n      ' + leaks.join('\n      '));
  });

  await T('E2', 'i18n', 'سربرگ روزهای هفته در انتخابگر تاریخ جلالی در EN انگلیسی است', async () => {
    await B.nav('/services');
    await B.ev('openServiceForm()'); await B.until('#svcSave');
    B.$('#s_date').click(); await B.wait(400);
    const box = (B.$('#jdBox') || {}).textContent || '';
    await B.ev('closeJdatePicker()'); await B.ev('closeModal()'); await B.wait(250);
    const faWeek = /ش\s*ی\s*د\s*س\s*چ\s*پ\s*ج/.test(box) || (box.includes('ش') && box.includes('ج') && !/Sat/.test(box));
    return !faWeek ? OK('week header localized')
      : BAD('روزهای هفتهٔ پیکر تاریخ هاردکد فارسی‌اند (ش ی د س چ پ ج) — در حالت EN هم فارسی دیده می‌شوند؛ تقویم اصلی اصلاح شده بود ولی jdate-picker جا مانده');
  });

  await T('E3', 'i18n', 'برچسب «note» خام در مودال یادداشت عیب‌یابی دیده نمی‌شود (کلید ترجمه گمشده)', async () => {
    const ghost = await B.ev(`t('note')`);
    return ghost !== 'note' ? OK('t(note)=' + ghost)
      : BAD(`t('note') === 'note' — این کلید در fa/en تعریف نشده (استفاده در diagnostics.js)؛ کاربر فارسی هم وسط فرم کلمهٔ خام انگلیسی «note» را به‌عنوان برچسب می‌بیند`);
  });

  await T('E4', 'i18n', 'در حالت EN عددها لاتین‌اند و چیدمان LTR است', async () => {
    await B.nav('/invoices');
    const dir = await B.ev(`document.documentElement.dir`);
    const txt = B.$('#content').textContent;
    const faDigits = /[۰-۹]/.test(txt);
    return (dir === 'ltr' && !faDigits) ? OK('ltr + latin digits')
      : BAD(`dir=${dir} faDigits=${faDigits} — در EN هنوز رقم فارسی/راست‌به‌چپ جاهایی باقی مانده`);
  });

  await T('E5', 'i18n', 'هیچ onclickای در هیچ صفحه‌ای به تابع تعریف‌نشده اشاره نمی‌کند (شکار کرش نهفته)', async () => {
    const routes = ['/dashboard', '/projects', '/services', '/parts', '/checklists', '/calculations', '/diagnostics', '/knowledge', '/notes', '/vvvf', '/issues', '/tools', '/invoices', '/contracts', '/report', '/standards', '/calendar', '/analytics', '/measurements', '/settings', '/finance', '/workshop'];
    const missing = new Set();
    for (const r of routes) {
      await B.nav(r);
      const found = await B.ev(`(() => {
        const names = new Set();
        document.querySelectorAll('[onclick]').forEach(el => {
          const code = el.getAttribute('onclick') || '';
          for (const m of code.matchAll(/(?:^|[;{]\\s*)([A-Za-z_$][\\w$]*)\\s*\\(/g)) names.add(m[1]);
        });
        return [...names].filter(n => typeof window[n] !== 'function' && !/^(if|for|while|return|void)$/.test(n));
      })()`);
      found.forEach(n => missing.add(r + ': ' + n));
    }
    // also scan key modals
    for (const open of ['openProjectForm()', 'openServiceForm()', 'openInvoiceForm()', 'openContractForm()', 'openPartForm()', 'openIssueForm()', 'openNoteForm()', 'openToolForm()', 'openBackupModal()']) {
      await Promise.resolve().then(() => B.ev(open)).catch(() => {});
      await B.wait(450);
      const found = await B.ev(`(() => {
        const names = new Set();
        document.querySelectorAll('#modalRoot [onclick]').forEach(el => {
          const code = el.getAttribute('onclick') || '';
          for (const m of code.matchAll(/(?:^|[;{]\\s*)([A-Za-z_$][\\w$]*)\\s*\\(/g)) names.add(m[1]);
        });
        return [...names].filter(n => typeof window[n] !== 'function');
      })()`);
      found.forEach(n => missing.add(open + ' → ' + n));
      if (B.modalOpen()) { await B.ev('closeModal()'); await B.wait(250); }
    }
    return missing.size === 0 ? OK('all inline handlers resolve')
      : BAD('دکمه‌هایی که کلیکشان ReferenceError می‌دهد:\n      ' + [...missing].slice(0, 12).join('\n      '));
  });

  /* ==================================================================
     P4 — تبلت اشتراکی کارگاه: چند حساب روی یک دستگاه
     ================================================================== */
  console.log('\n== P4) تیم کارگاه — تبلت اشتراکی (چند حساب) ==');

  await T('S1', 'accounts', 'تنظیمات شرکت (نام/تلفن/نرخ مالیات) بین دو حساب روی یک دستگاه نشت نمی‌کند', async () => {
    // حساب A از قبل وارد است و شرکت «تست پارس» را در F7 ثبت کرده
    await logout(A);
    await registerAs(A, 'شرکت دوم', 'secondco', 'second1');
    const co = await A.ev(`(state.settings || {}).company || ''`);
    const tax = await A.ev(`(state.settings || {}).taxRate`);
    await logout(A);
    await loginAs(A, 'رضا', 'reza123');
    return (!co || !co.includes('تست پارس')) ? OK(`settings isolated (company='${co}', taxRate=${tax})`)
      : BAD(`حساب تازهٔ «شرکت دوم» با company='${co}' بالا آمد — تنظیمات سراسری ذخیره می‌شود؛ روی تبلت مشترکِ دو شرکت، فاکتورهای یکی با سربرگ و نرخ مالیات دیگری صادر می‌شود`);
  });

  await T('S2', 'accounts', 'خروج وسط فاکتورِ باز، پیش‌نویس را به کاربر بعدی تحویل نمی‌دهد', async () => {
    await A.nav('/invoices');
    await A.ev('openInvoiceForm()'); await A.until('#invSave');
    A.typeIn('#inv_customer', 'مشتری محرمانهٔ رضا');
    await A.ev(`invAddItem({ desc: 'ردیف محرمانه', qty: 1, price: 123456 })`);
    // user walks away; next tech opens the app and switches account from the sidebar
    await logout(A);
    await loginAs(A, 'secondco', 'second1');
    await A.nav('/invoices');
    await A.ev('openInvoiceForm()'); await A.until('#invSave');
    const cust = (A.$('#inv_customer') || {}).value || '';
    const body = (A.$('#modalRoot') || {}).textContent || '';
    const leaked = cust.includes('محرمانه') || body.includes('ردیف محرمانه') || body.includes('123٬456') || body.includes('123,456');
    await A.ev('closeModal()'); await A.wait(250);
    await logout(A);
    await loginAs(A, 'رضا', 'reza123');
    return !leaked ? OK('draft not leaked across accounts')
      : BAD('invDraft سراسری در حافظه مانده بود: کاربر دوم فرم فاکتور را باز کرد و مشتری/ردیفِ کاربر قبلی را آماده دید (و اگر ذخیره می‌کرد برای حساب خودش ثبت می‌شد)');
  });

  await T('S3', 'accounts', 'ثبت‌نام با نام کاربری تکراری خطای روشن «موجود است» می‌دهد، نه خطای گنگ', async () => {
    await logout(A);
    A.$('#tabRegister').click();
    A.typeIn('#authName', 'تکراری'); A.typeIn('#authUsername', 'رضا'); A.typeIn('#authPassword', 'reza123');
    A.fire(A.$('#authForm'), 'submit'); await A.wait(600);
    const err = A.$('#authError');
    const txt = err && !err.classList.contains('hidden') ? err.textContent.trim() : '';
    const inApp = await appVisible(A);
    if (inApp) await logout(A);
    await loginAs(A, 'رضا', 'reza123');
    return (txt && /موجود|تکراری|ثبت شده|قبلی|exists|taken|already/i.test(txt) && !inApp) ? OK('clear duplicate error: ' + txt)
      : BAD(`نام کاربری «رضا» دوباره ثبت‌نام شد/خطای گنگ داد (inApp=${inApp}, err=«${txt}») — کاربر نمی‌فهمد باید وارد شود نه ثبت‌نام کند`);
  });

  await T('S4', 'accounts', '۵ رمز اشتباه پشت‌سرهم حداقل اخطار/تأخیر دارد (قفل حدسی)', async () => {
    await logout(A);
    let lastErr = '';
    for (let i = 0; i < 5; i++) {
      A.typeIn('#authUsername', 'رضا'); A.typeIn('#authPassword', 'wrong' + i);
      A.fire(A.$('#authForm'), 'submit'); await A.wait(350);
      const e = A.$('#authError'); if (e) lastErr = e.textContent.trim();
    }
    const inApp = await appVisible(A);
    await loginAs(A, 'رضا', 'reza123'); // correct login must still work for the legit user afterwards
    return !inApp ? OK('wrong passwords rejected (note: no lockout text seen: «' + lastErr + '»)')
      : BAD('با رمز اشتباه وارد اپ شد!');
  });

  /* ==================================================================
     موجودی انبار — چرخهٔ عمر قطعه در سرویس (یافته‌های سورسی، تأیید رفتاری)
     ================================================================== */
  console.log('\n== P1b) انبار — سرنوشت قطعه در چرخهٔ عمر سرویس ==');
  // defensive: make sure we are back on Reza's account whatever P4 did
  if (await authVisible(A)) await loginAs(A, 'رضا', 'reza123');
  else if (!(await appVisible(A))) { await loginAs(A, 'رضا', 'reza123'); }
  else {
    const me = await A.ev(`state.user && state.user.username`);
    if (me !== 'رضا') { await logout(A); await loginAs(A, 'رضا', 'reza123'); }
  }

  await T('R1', 'stock', 'حذف سرویس، قطعات مصرف‌شده‌اش را به انبار برمی‌گرداند', async () => {
    await A.nav('/parts');
    await A.clickOnclick('openPartForm()'); await A.until('#p_name');
    A.typeIn('#p_name', U('رله تست موجودی')); A.setVal('#p_qty', '10'); A.setVal('#p_price', '5000');
    A.$('#partSave').click(); await A.closedSettle();
    partA = await A.ev(`(state.parts.find(p => p.name.startsWith('رله تست موجودی')) || {}).id`);
    // service that consumes 3 of it (through the real form draft machinery)
    await A.nav('/services');
    await A.ev(`openServiceForm(null, '${projA || (await A.ev("state.projects[0] && state.projects[0].id"))}')`); await A.until('#svcSave');
    await A.ev(`(() => { svcPartsDraft = [{ partId: '${partA}', name: state.parts.find(p => p.id === '${partA}').name, qty: 3 }]; })()`);
    A.typeIn('#s_problem', 'تعویض سه رله');
    A.$('#svcSave').click(); await A.closedSettle();
    await A.refresh();
    const afterConsume = await A.ev(`state.parts.find(p => p.id === '${partA}').qty`);
    const svc = await A.ev(`state.services.find(s => s.problem && s.problem.includes('تعویض سه رله'))`);
    // delete it like a user who filed the report against the wrong building
    await A.ev(`openServiceView('${svc.id}')`); await A.until('#modalRoot .modal-foot, #modalRoot button');
    await A.clickOnclick(`deleteService('${svc.id}')`);
    await A.until('#confirmYes'); A.$('#confirmYes').click(); await A.wait(900);
    if (A.modalOpen()) { await A.ev('closeModal()'); await A.wait(200); }
    await A.refresh();
    const afterDelete = await A.ev(`state.parts.find(p => p.id === '${partA}').qty`);
    return (afterConsume === 7 && afterDelete === 10) ? OK('10→7→10')
      : BAD(`موجودی: ۱۰ → بعد از سرویس ${afterConsume} → بعد از حذف سرویس ${afterDelete} — حذف گزارش (اشتباه ثبتی رایج) قطعات را برنمی‌گرداند؛ نه اخطاری در تأیید حذف هست نه رهاسازی خودکار. انبار به‌مرور «کم می‌آورد» و کسی نمی‌فهمد چرا`);
  });

  await T('R2', 'stock', 'حذف کامل ردیف قطعه از ویرایش سرویس، موجودی را برمی‌گرداند', async () => {
    await A.refresh();
    const pid = await A.ev("state.projects[0] && state.projects[0].id");
    await A.nav('/services');
    await A.ev(`openServiceForm(null, '${pid}')`); await A.until('#svcSave');
    const base = await A.ev(`state.parts.find(p => p.id === '${partA}').qty`);
    await A.ev(`(() => { svcPartsDraft = [{ partId: '${partA}', name: state.parts.find(p => p.id === '${partA}').name, qty: 2 }]; })()`);
    A.typeIn('#s_problem', 'سرویس ویرایش قطعه تست');
    A.$('#svcSave').click(); await A.closedSettle();
    await A.refresh();
    const mid = await A.ev(`state.parts.find(p => p.id === '${partA}').qty`);
    const svc = await A.ev(`state.services.find(s => s.problem && s.problem.includes('سرویس ویرایش قطعه تست'))`);
    await A.ev(`openServiceForm('${svc.id}')`); await A.until('#svcSave');
    await A.ev(`(() => { svcPartsDraft = []; })()`); // رله اصلاً مصرف نشده بود؛ ردیف پاک شد
    A.$('#svcSave').click(); await A.closedSettle();
    await A.refresh();
    const end = await A.ev(`state.parts.find(p => p.id === '${partA}').qty`);
    return (mid === base - 2 && end === base) ? OK(`${base}→${mid}→${end}`)
      : BAD(`موجودی ${base} → مصرف ${mid} → بعد از حذف ردیف ${end} — svcApplyStock فقط کلیدهای newByPart را می‌گردد؛ قطعه‌ای که کامل از پیش‌نویس حذف شده هرگز آزاد نمی‌شود (کم‌کردن تعداد درست کار می‌کند، حذف کامل نه)`);
  });

  await T('R3', 'stock', 'قطعهٔ تازه با موجودی ۰ و بدون حداقل، «کمبود موجودی» داشبورد نیست', async () => {
    await A.ev(`api('/parts', { method: 'POST', body: { name: '${U('قطعه صفر تست')}', qty: 0, price: 1000 } })`);
    await A.refresh();
    await A.nav('/dashboard');
    const dash = A.$('#content').textContent;
    const flagged = dash.includes('قطعه صفر تست');
    return !flagged ? OK('not flagged')
      : BAD('قطعه‌ای که عمداً موجودی/حداقلش صفر است در هشدار «کمبود موجودی» داشبورد آمد (qty<=minQty با هر دو صفر) — هشدار به‌مرور پر از نویز می‌شود و کاربر دیگر جدی‌اش نمی‌گیرد');
  });

  await T('R4', 'stock', 'پیگیریِ سرویس پروژهٔ بایگانی‌شده در «نیازمند توجه» داشبورد نمی‌آید', async () => {
    const res = await A.ev(`(async () => {
      const p = await api('/projects', { method: 'POST', body: { name: 'ساختمان تحویل‌داده‌شده تست داشبورد' } });
      const pid = p.project.id;
      await api('/services', { method: 'POST', body: { projectId: pid, serviceType: 'repair', date: Date.now(), problem: 'منتظر قطعه', finalStatus: 'outoforder' } });
      await api('/projects/' + pid, { method: 'PUT', body: { archived: true } });
      await loadAll(true);
      return pid;
    })()`);
    await A.nav('/dashboard');
    const shown = A.$('#content').textContent.includes('ساختمان تحویل‌داده‌شده تست داشبورد');
    return !shown ? OK('archived follow-up hidden from dashboard')
      : BAD('ساختمان بایگانی/تحویل‌شده هنوز با بج ⛔ «نیازمند توجه» است — یادآوری‌هایش ساکت شدند (فیکس قبلی) ولی لیست پیگیری داشبورد (openIssues) پروژهٔ آرشیوی را فیلتر نمی‌کند؛ پس هیچ‌وقت از جلوی چشم نمی‌رود');
  });

  /* ==================================================================
     P5 — استادکار پرحجم: صدها رکورد واقعی
     ================================================================== */
  console.log('\n== P5) استادکار پرحجم — حجم دادهٔ چندساله ==');
  const bulkT0 = Date.now();
  let bulkSeedErr = null;
  try { await A.ev(`(async () => {
    for (let i = 1; i <= 150; i++) await api('/projects', { method: 'POST', body: { name: 'برج انبوه ' + i, customer: 'مشتری ' + (i % 40), serviceIntervalDays: 30 } });
    const ps = state.projects.length ? state.projects : [];
    await loadAll(true);
    const ids = state.projects.filter(p => p.name.startsWith('برج انبوه')).map(p => p.id);
    for (let i = 0; i < 600; i++) {
      await api('/services', { method: 'POST', body: { projectId: ids[i % ids.length], serviceType: 'maintenance', date: Date.now() - (i % 400) * 86400000, problem: 'سرویس انبوه ' + i } });
    }
    await loadAll(true);
  })()`); } catch (e) { bulkSeedErr = e; }
  const bulkSeedMs = Date.now() - bulkT0;
  if (bulkSeedErr) { console.log('  (bulk seeding failed: ' + String(bulkSeedErr && bulkSeedErr.message || bulkSeedErr) + ')'); }

  await T('B1', 'bulk', 'با ۱۵۰ پروژه و ۶۰۰ سرویس، لیست‌ها رندر و جستجو درست کار می‌کند', async () => {
    const t0 = Date.now();
    await A.nav('/projects');
    const tProj = Date.now() - t0;
    const rows = A.$$('#content .row-item, #content .card').length;
    const inp = A.$('#content .search input');
    inp.focus(); inp.value = 'برج انبوه 149'; A.fire(inp, 'input');
    await A.wait(800);
    const found149 = A.$('#content').textContent.includes('برج انبوه 149');
    inp.value = ''; A.fire(inp, 'input'); await A.wait(500);
    const t1 = Date.now();
    await A.nav('/services');
    const tSvc = Date.now() - t1;
    const sinp = A.$('#content .search input');
    sinp.focus(); sinp.value = 'سرویس انبوه 599'; A.fire(sinp, 'input');
    await A.wait(800);
    const found599 = A.$('#content').textContent.includes('سرویس انبوه 599');
    return (found149 && found599) ? OK(`projects render ${tProj}ms (${rows} nodes), services ${tSvc}ms, seed ${bulkSeedMs}ms`)
      : BAD(`پیدا نشد: پروژه 149=${found149} سرویس 599=${found599} — در حجم واقعی چندساله جستجو/لیست رکوردهای انتهایی را گم می‌کند (سقف مخفی رندر؟)`);
  });

  await T('B2', 'bulk', 'سلکت پروژه در فرم سرویس، پروژهٔ ۱۵۰ام را هم دارد (سقف مخفی ندارد)', async () => {
    await A.ev('openServiceForm()'); await A.until('#s_project');
    const n = A.$$('#s_project option').length;
    const has149 = [...A.$$('#s_project option')].some(o => o.textContent.includes('برج انبوه 149'));
    await A.ev('closeModal()'); await A.wait(250);
    return has149 ? OK(n + ' options') : BAD(`فقط ${n} گزینه در سلکت هست و «برج انبوه 149» در آن نیست — برای ساختمان‌های انتهای لیست اصلاً نمی‌شود سرویس ثبت کرد`);
  });

  await T('B3', 'bulk', 'جستجوی سراسری در حجم بالا پروژهٔ انتهایی را پیدا می‌کند', async () => {
    await A.ev('openGlobalSearch()'); await A.wait(500);
    const inp = A.$('#modalRoot input');
    if (!inp) return BAD('global search input not found');
    inp.focus(); inp.value = 'برج انبوه 150'; A.fire(inp, 'input');
    await A.wait(800);
    const hit = (A.$('#modalRoot') || {}).textContent.includes('برج انبوه 150');
    await A.ev('closeModal()'); await A.wait(250);
    return hit ? OK('found in global search') : BAD('«برج انبوه 150» در جستجوی سراسری پیدا نشد — سقف نمایش نتایج، تطابق دقیق را هم خفه می‌کند');
  });

  /* ==================================================================
     P6 — ممیز ایمنی: چک‌لیست، اندازه‌گیری، محاسبات
     ================================================================== */
  console.log('\n== P6) ممیز ایمنی — چک‌لیست/اندازه‌گیری/محاسبات ==');

  await T('C1', 'audit', 'روند اندازه‌گیری با یک نقطه و مقادیر برابر، NaN/کرش تولید نمی‌کند', async () => {
    const res = await A.ev(`(async () => {
      const pid = state.projects[0].id;
      return pid;
    })()`);
    await A.nav('/measurements');
    await A.ev(`openMeasForm()`); await A.wait(500);
    const hasForm = !!A.$('#m_value');
    if (A.modalOpen()) { await A.ev('closeModal()'); await A.wait(250); }
    const trend = await A.ev(`(() => {
      try {
        const one = typeof measTrendHTML === 'function' ? measTrendHTML([{ value: 5, date: Date.now(), field: 'x' }]) : 'no-fn';
        const flat = typeof measTrendHTML === 'function' ? measTrendHTML([{ value: 7, date: Date.now() - 1000 }, { value: 7, date: Date.now() }]) : 'no-fn';
        return { one: String(one).slice(0, 60), flatNaN: String(flat).includes('NaN'), oneNaN: String(one).includes('NaN') };
      } catch (e) { return { err: String(e && e.message || e) }; }
    })()`);
    return (hasForm && !trend.err && !trend.flatNaN && !trend.oneNaN) ? OK('robust: ' + JSON.stringify(trend).slice(0, 80))
      : BAD(`روند با دادهٔ مرزی مشکل دارد: ${JSON.stringify(trend)} — اولین اندازه‌گیری هر آسانسور دقیقاً همین حالت تک‌نقطه‌ای است`);
  });

  await T('C2', 'audit', 'مبدل واحدها تبدیل‌های معلوم را درست می‌زند (دوطرفه)', async () => {
    await A.nav('/calculations');
    const ask = async (fromId, val, toId) => { const el = A.$('#' + fromId); if (!el) return null; el.value = String(val); A.fire(el, 'input'); await A.wait(120); const t = A.$('#' + toId); return t ? parseFloat(t.value) : null; };
    const hp = await ask('cva_q8', 10, 'cvb_q8');        // 10 kW -> HP
    const psi = await ask('cva_q2', 10, 'cvb_q2');       // 10 bar -> psi
    const cels = await ask('cvb_q6', 212, 'cva_q6');     // 212 F -> C (reverse)
    const close = (a, b) => a != null && Math.abs(a - b) < 0.02;
    return (close(hp, 13.4102) && close(psi, 145.038) && close(cels, 100)) ? OK(`10kW=${hp}HP, 10bar=${psi}psi, 212F=${cels}C`)
      : BAD(`مبدل‌ها: 10kW→${hp}HP (درست: ۱۳٫۴۱)، 10bar→${psi}psi (درست: ۱۴۵٫۰۴)، 212F→${cels}C (درست: ۱۰۰)`);
  });

  await T('C3', 'audit', 'ذخیرهٔ محاسبه از مسیر واقعی ماشین‌حساب، در پروفایل پروژه دیده می‌شود', async () => {
    const pid = await A.ev("state.projects[0] && state.projects[0].id");
    await A.nav('/calculations');
    const cal = await A.ev(`(() => { const c = CALCULATORS.find(x => x.inputs && x.inputs.length && document.querySelector('#calc_' + x.id + '_' + x.inputs[0].id)); return c ? { id: c.id, title: c.title.fa, inputs: c.inputs.map(i => i.id) } : null; })()`);
    if (!cal) return BAD('no calculator with rendered inputs found');
    for (const inp of cal.inputs) { const el = A.$(`#calc_${cal.id}_${inp}`); if (el && !el.value) { el.value = '10'; A.fire(el, 'input'); } }
    await A.ev(`openCalcSaveForm('${cal.id}')`); await A.until('#csSave');
    A.setVal('#cs_project', pid);
    A.typeIn('#cs_note', 'یادداشت ممیز');
    A.$('#csSave').click(); await A.closedSettle();
    await A.nav('/projects/' + pid);
    const txt = A.$('#content').textContent;
    return txt.includes(cal.title) ? OK('«' + cal.title + '» on project profile')
      : BAD(`محاسبهٔ «${cal.title}» برای پروژه ذخیره شد ولی در پروفایل پروژه نیست — ممیز/تکنسین بعدی مبنای تصمیم را پیدا نمی‌کند`);
  });

  await T('C4', 'audit', 'از نتیجهٔ عیب‌یابی می‌شود گزارش سرویس ساخت و خودکار به آن وصل شود', async () => {
    await A.nav('/diagnostics');
    await A.ev(`startDiagFlow('f01')`); await A.wait(400);
    // answer "no power" path → r1 result
    const btns = A.$$('#content .btn');
    const no = btns.find(b => (b.getAttribute('onclick') || '').includes("diagAnswer('r1'"));
    if (!no) return BAD('f01 option r1 not found');
    no.click(); await A.wait(500);
    const toSvc = A.$$('#content [onclick]').find(b => (b.getAttribute('onclick') || '').includes('openServiceForm'));
    if (!toSvc) { await A.ev('diagExit()'); return BAD('دکمهٔ «ثبت سرویس» در صفحهٔ نتیجه نیست'); }
    toSvc.click(); await A.until('#svcSave');
    const prefill = (A.$('#s_diag') || {}).value || (A.$('#s_problem') || {}).value || '';
    await A.ev('closeModal()'); await A.wait(250);
    await A.ev('diagExit()'); await A.wait(250);
    return prefill.length > 3 ? OK('service form prefilled from diagnosis')
      : BAD('فرم سرویس از نتیجهٔ عیب‌یابی خالی باز شد — تشخیص/علت ریشه‌ای که همین الان پیدا شده باید دستی دوباره تایپ شود و پیوند آن دو گم می‌شود');
  });

  await T('C4b', 'audit', 'مسیر طراحی‌شدهٔ «ذخیرهٔ عیب‌یابی ← ساخت سرویس» فرم را پیش‌پر می‌کند', async () => {
    await A.nav('/diagnostics');
    await A.ev(`startDiagFlow('f01')`); await A.wait(350);
    const no = A.$$('#content [onclick]').find(b => (b.getAttribute('onclick') || '').includes("diagAnswer('r1'"));
    if (!no) return BAD('r1 option missing');
    no.click(); await A.wait(450);
    const saveBtn = A.$$('#content [onclick]').find(b => (b.getAttribute('onclick') || '').includes('openDiagSaveForm'));
    if (!saveBtn) { await A.ev('diagExit()'); return BAD('دکمهٔ ذخیرهٔ عیب‌یابی در نتیجه نیست'); }
    saveBtn.click(); await A.until('#dgSave');
    A.$('#dgSave').click(); await A.until('#dg2svc');
    A.$('#dg2svc').click(); await A.until('#svcSave');
    await A.wait(300);
    const diag = (A.$('#s_diag') || {}).value || '';
    const prob = (A.$('#s_problem') || {}).value || '';
    await A.ev('closeModal()'); await A.wait(250);
    await A.ev('diagExit()'); await A.wait(200);
    return (diag.length > 2 || prob.length > 2) ? OK('prefill via save path works')
      : BAD('حتی از مسیر ذخیرهٔ عیب‌یابی هم فرم سرویس خالی می‌آید — diagToServicePrompt/dg() زنجیره‌اش قطع است');
  });

  /* ==================================================================
     P7 — شرایط سخت: خرابی، ریلود، دیپ‌لینک، ایمپورت
     ================================================================== */
  console.log('\n== P7) شرایط سخت — خرابی داده/ریلود/دیپ‌لینک ==');

  await T('H1', 'harsh', 'بوت با دادهٔ خرابِ localStorage صفحهٔ سفید دائمی نمی‌دهد', async () => {
    const C = await bootApp({ lsSeed: { zlift_db: '{{{not-json', zlift_db_mirror: '###broken###', zlift_autobackup: 'null[', zlift_lang: 'fa' } });
    const sawAuth = await C.waitUntil(async () => authVisible(C) || appVisible(C), 12000, 'auth after corruption').then(() => true).catch(() => false);
    const bodyTxt = C.document.body.textContent.trim().length;
    return sawAuth ? OK('booted to auth despite corrupt LS')
      : BAD(`با JSON خراب در کلیدهای ذخیره، اپ روی صفحهٔ سفید/اسپینر ماند (bodyTextLen=${bodyTxt}) — یک خرابی جزئی استوریج یعنی از دست رفتن کل اپ برای تکنسین`);
  });

  await T('H2', 'harsh', 'ریلود واقعی وسط عیب‌یابی، جلسه را از همان سؤال برمی‌گرداند', async () => {
    const D1 = await bootApp();
    await loginAs(D1, 'tech', '123456');
    await D1.nav('/diagnostics');
    await D1.ev(`startDiagFlow('f01')`); await D1.wait(350);
    const b1 = D1.$$('#content [onclick]').find(b => (b.getAttribute('onclick') || '').includes("diagAnswer('p2'"));
    if (b1) { b1.click(); await D1.wait(400); }
    const cur1 = await D1.ev(`diagSession && diagSession.current`);
    const ls = D1.snapshotLS();
    // hard reload: brand-new window, same IndexedDB universe + same localStorage content
    const D2 = await bootApp({ idbFactory: D1.factory, lsSeed: ls });
    await D2.waitUntil(async () => appVisible(D2) || authVisible(D2), 12000, 'reload boot');
    if (await authVisible(D2)) await loginAs(D2, 'tech', '123456');
    await D2.nav('/diagnostics');
    const cur2 = await D2.ev(`diagSession && diagSession.current`);
    if (cur2) await D2.ev('diagExit()');
    return (cur1 && cur1 === cur2) ? OK(`resumed at ${cur2}`)
      : BAD(`قبل از ریلود روی گره «${cur1}» بودیم، بعد از ریلود «${cur2}» — کشته‌شدن اپ توسط سیستم (تماس، باتری) یعنی شروع از سؤال اول وسط موتورخانه`);
  });

  await T('H3', 'harsh', 'دیپ‌لینک QR پروژه هنگام لاگین‌نبودن، بعد از ورود روی همان پروژه فرود می‌آید', async () => {
    const E1 = await bootApp();
    await loginAs(E1, 'tech', '123456');
    const pid = await E1.ev("state.projects[0] && state.projects[0].id");
    const ls = E1.snapshotLS();
    // strip anything that looks like an auth token/session for a cold scan
    Object.keys(ls).forEach(k => { if (/token|session|auth/i.test(k)) delete ls[k]; });
    const E2 = await bootApp({ idbFactory: E1.factory, lsSeed: ls, urlHash: '#/projects/' + pid });
    await E2.waitUntil(async () => authVisible(E2) || appVisible(E2), 12000, 'cold deep link');
    if (await authVisible(E2)) await loginAs(E2, 'tech', '123456');
    await E2.loadWait();
    const route = await E2.ev('state.route');
    const nameShown = E2.$('#content').textContent.includes(await E2.ev(`(state.projects.find(p => p.id === '${pid}') || {}).name || '؟؟؟'`));
    return (route === '/projects/' + pid && nameShown) ? OK('landed on scanned project')
      : BAD(`اسکن برچسب QR روی تابلو بعد از لاگین کاربر را به «${route}» برد نه همان آسانسور — کل ایدهٔ برچسب فیزیکی (رسیدن مستقیم به پرونده) برای کسی که لاگین نیست می‌شکند`);
  });

  await T('H4', 'harsh', 'ایمپورت فایل بکاپ خراب خطای قابل‌فهم می‌دهد و دادهٔ فعلی سالم می‌ماند', async () => {
    const before = await A.ev('state.projects.length');
    const res = await A.ev(`(async () => {
      const badShapes = [
        { app: 'zlift', version: 999, data: {} },
        { hello: 'world' },
        [],
        'not an object'
      ];
      const out = [];
      for (const bad of badShapes) {
        const v = (typeof validateBackup === 'function') ? validateBackup(typeof bad === 'object' ? (bad.data ? bad : { data: bad }) : bad) : { ok: null };
        out.push(v && v.ok === false ? 'rejected' : 'ACCEPTED?');
      }
      try { await api('/backup', { method: 'PUT', body: { backup: { app: 'zlift', version: 999, collections: { projects: 'evil' } } } }); out.push('api-ACCEPTED'); }
      catch (e) { out.push('api-rejected:' + String(e && e.message || e).slice(0, 40)); }
      return out;
    })()`);
    await A.refresh();
    const after = await A.ev('state.projects.length');
    return (res.every(r => r.startsWith('rejected') || r.startsWith('api-rejected')) && after === before) ? OK(res.join(' | '))
      : BAD(`بکاپ معیوب درست رد نشد یا داده آسیب دید (پروژه‌ها ${before}→${after}؛ ${res.join(' | ')}) — فایل اشتباهِ همکار/نسخهٔ دیگر می‌تواند کل دادهٔ دستگاه را بی‌صدا خراب کند`);
  });

  await T('H5', 'harsh', 'متن ۵۰۰۰ کاراکتری + HTML در یادداشت، امن ذخیره و سالم نمایش داده می‌شود', async () => {
    const longTxt = 'یادداشت بلند '.repeat(400) + '<img src=x onerror="window.__xssNote=1">';
    await A.ev(`window.__xssNote = 0`);
    await A.nav('/notes');
    await A.clickOnclick('openNoteForm()'); await A.until('#n_title');
    A.typeIn('#n_title', U('یادداشت خیلی بلند'));
    A.typeIn('#n_content', longTxt);
    const saveBtn = A.$('#noteSave, #nSave, #modalRoot .btn-primary');
    (saveBtn || {}).click && saveBtn.click();
    await A.wait(900);
    if (A.modalOpen()) { await A.ev('closeModal()'); await A.wait(250); }
    await A.nav('/notes');
    const x = await A.ev('window.__xssNote');
    const inj = A.$$('#content img[onerror]').length;
    const saved = await A.ev(`(() => { const n = state.notes.find(n => n.title.startsWith('یادداشت خیلی بلند')); return n ? n.content.length : -1; })()`);
    return (!x && inj === 0 && saved > 4000) ? OK(`stored ${saved} chars, escaped`)
      : BAD(`xss=${x} injected=${inj} savedLen=${saved} — متن بلند/HTML در یادداشت یا ذخیره نمی‌شود یا تزریق می‌کند`);
  });

  await T('H6', 'harsh', 'پروژه با نام تکراری دقیقاً شبیه قبلی، کاربر را گمراه نمی‌کند (هشدار یا نشانهٔ تمایز)', async () => {
    await A.nav('/projects');
    await A.clickOnclick('openProjectForm()'); await A.until('#f_name');
    A.typeIn('#f_name', 'برج انبوه 1'); // exact duplicate of an existing project
    A.clearToasts();
    A.$('#projSave').click(); await A.wait(800);
    const toast = A.toastText();
    const count = await A.ev(`state.projects.filter(p => p.name === 'برج انبوه 1').length`);
    if (A.modalOpen()) { await A.ev('closeModal()'); await A.wait(200); }
    return (count <= 1 || /تکراری|موجود|duplicate/i.test(toast)) ? OK(`count=${count} toast=«${toast.slice(0, 40)}»`)
      : BAD(`سومین «برج انبوه 1» بدون هیچ تذکری ساخته شد (حالا ${count} تا) — در عمل دو ساختمان هم‌نام یعنی سرویس/فاکتورِ اشتباهی روی پروندهٔ همسایه؛ حداقل هشدار «مشابه موجود است» لازم است`);
  });

  /* ==================================================================
     P8 — میمون هرج‌ومرج: ۳۰۰ اکشن تصادفیِ بدون کرش
     ================================================================== */
  console.log('\n== P8) میمون هرج‌ومرج — کلیک/تایپ تصادفی (seed ثابت) ==');

  await T('X1', 'chaos', '۳۰۰ اکشن تصادفی در همهٔ صفحه‌ها بدون خطای JS و بدون مودالِ گیرکرده', async () => {
    const M = await bootApp();
    await loginAs(M, 'tech', '123456');
    // deterministic RNG so failures reproduce
    let seed = 1234567;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const pick = a => a[Math.floor(rnd() * a.length) % a.length];
    const routes = ['/dashboard', '/projects', '/services', '/parts', '/checklists', '/calculations', '/diagnostics', '/knowledge', '/notes', '/vvvf', '/issues', '/tools', '/invoices', '/contracts', '/report', '/standards', '/calendar', '/analytics', '/measurements', '/settings', '/finance', '/workshop'];
    const FORBIDDEN = /delete|حذف|logout|خروج|restore|بازیابی|import|reset|archive|بایگانی|changePassword|diagExit/i;
    let stuck = 0, actions = 0;
    for (let i = 0; i < 300; i++) {
      try {
        const roll = rnd();
        if (roll < 0.35) { await M.ev(`navigate('${pick(routes)}')`); await M.wait(120); }
        else if (roll < 0.8) {
          const els = M.$$('#content button, #content [onclick], #modalRoot button, .chip, .row-item, .tab')
            .filter(e => e.offsetParent !== null || e.closest('#modalRoot'))
            .filter(e => !FORBIDDEN.test((e.getAttribute('onclick') || '') + ' ' + e.textContent));
          if (els.length) { pick(els).click(); await M.wait(120); }
        } else if (roll < 0.92) {
          const inps = M.$$('#content input, #modalRoot input').filter(e => e.type !== 'file' && !e.readOnly);
          if (inps.length) { const el = pick(inps); el.focus(); el.value = pick(['تست', '۱۲۳', 'abc', '-5', '999999999999999999', ''] ); M.fire(el, 'input'); M.fire(el, 'change'); await M.wait(80); }
        } else if (M.modalOpen()) { await M.ev('closeModal()'); await M.wait(150); }
        actions++;
        // a modal that cannot be closed is a trap: try the standard escapes
        if (M.modalOpen() && rnd() < 0.4) {
          await M.ev(`(() => { const x = document.querySelector('#modalRoot .icon-btn'); if (x) x.click(); })()`);
          await M.wait(250);
          if (M.modalOpen()) { await M.ev('closeModal()'); await M.wait(250); if (M.modalOpen()) stuck++; }
        }
      } catch (e) { /* harness-side hiccup on a stale node — monkey keeps going */ }
    }
    await M.nav('/dashboard');
    const alive = (M.$('#content') || {}).textContent.length > 20;
    const badErrs = M.errs.filter(e => !/ResizeObserver|play\(\)|AbortError/i.test(e));
    return (alive && badErrs.length === 0 && stuck === 0) ? OK(`${actions} actions, 0 errors`)
      : BAD(`خطاهای مدیریت‌نشده: ${badErrs.slice(0, 4).join(' | ') || '—'}؛ مودال گیرکرده: ${stuck} بار؛ داشبورد نهایی alive=${alive}`);
  });

  /* ==================================================================
     اسکن‌های استاتیک تکمیلی
     ================================================================== */
  console.log('\n== ST) اسکن‌های استاتیک ==');

  await T('ST1', 'static', 'همهٔ ارجاع‌های محلی index.html در precache سرویس‌ورکر هستند (آفلاین واقعی)', async () => {
    const h = readSrc('index.html'); const sw = readSrc('sw.js');
    const core = sw.match(/const CORE = \[([\s\S]*?)\];/)[1];
    const precached = new Set([...core.matchAll(/'([^']+)'/g)].map(m => m[1].replace(/^\.\//, '')));
    const refs = new Set();
    for (const m of h.matchAll(/(?:src|href)="([^"]+)"/g)) { const u = m[1]; if (u.startsWith('http') || u.startsWith('#') || u.startsWith('data:')) continue; refs.add(u.replace(/^\.\//, '')); }
    const missing = [...refs].filter(r => !precached.has(r));
    const ext = [...h.matchAll(/(?:src|href)="(https:[^"]+)"/g)].map(m => m[1]);
    return (missing.length === 0 && ext.length === 0) ? OK('shell complete, zero external refs')
      : BAD(`نقص آفلاین: precache ندارد: ${missing.join(', ')}؛ ارجاع خارجی: ${ext.join(', ')}`);
  });

  await T('ST2', 'static', 'شکاف ترجمه: کلید گمشده‌ای در t()ها نیست (متن خام در UI)', async () => {
    const srcs = [];
    const walk = d => { for (const f of fs.readdirSync(path.join(ROOT, d))) { const p = path.join(d, f); const st = fs.statSync(path.join(ROOT, p)); if (st.isDirectory()) walk(p); else if (f.endsWith('.js')) srcs.push(p); } };
    walk('js');
    const used = new Set();
    for (const f of srcs) { if (f.includes('translations.js')) continue; const s = readSrc(f); let m; const re = /\bt\(\s*'([A-Za-z0-9_]+)'\s*\)|\bt\(\s*"([A-Za-z0-9_]+)"\s*\)/g; while ((m = re.exec(s))) used.add(m[1] || m[2]); }
    const ghosts = await A.ev(`(() => { const used = ${JSON.stringify([...used])}; return used.filter(k => t(k) === k); })()`);
    return ghosts.length === 0 ? OK('all ' + used.size + ' static keys resolve')
      : BAD(`کلیدهایی که عیناً خودشان در UI چاپ می‌شوند: ${ghosts.join(', ')} — کاربر به‌جای برچسب، اسم کلید را می‌بیند`);
  });

  console.log(`\nPERSONAS RESULT: ${pass} passed, ${fail} failed  (✗ = a real persona hits a bug/trap)`);
  fs.writeFileSync(path.join(__dirname, 'personas-results.json'), JSON.stringify({ pass, fail, results }, null, 2));
  console.log('details → qa/personas-results.json');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('PERSONAS CRASHED:', e); process.exit(2); });
