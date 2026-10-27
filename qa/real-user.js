/* Z Lift — REAL-USER exploratory audit (jsdom)
   Drives the actual UI like a technician would: taps buttons, types into
   forms, submits, searches — including the mistakes real users make
   (empty fields, negative numbers, wrong-project selections, Persian
   digits, archived buildings, shared-tablet second accounts…).

   Every check states the EXPECTED correct behaviour. A ✗ therefore means
   "a real user hits a bug / trap here today". When the bugs are fixed this
   script should go green. Run:  node qa/real-user.js
   Exit code 0 = every expectation holds. */
const { JSDOM, VirtualConsole } = require('jsdom');
const { indexedDB, IDBKeyRange } = require('fake-indexeddb');
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

/* ---------- static (source) helpers ---------- */
const readSrc = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
function contrast(hex1, hex2) {
  const L = h => {
    const c = h.replace('#', '');
    const f = i => { const v = parseInt(c.substr(i, 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(0) + 0.7152 * f(2) + 0.0722 * f(4);
  };
  const a = L(hex1), b = L(hex2);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

(async () => {
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => {}); // canvas/css noise in jsdom — not what we audit here
  const dom = new JSDOM(html, {
    url: 'http://localhost:4173/index.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) { window.indexedDB = indexedDB; window.IDBKeyRange = IDBKeyRange; }
  });
  const w = dom.window;
  const document = w.document;
  w.scrollTo = () => {};
  const ev = expr => w.eval(expr);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const waitUntil = async (cond, ms = 9000, label = 'condition') => {
    const t0 = Date.now();
    for (;;) { try { if (await cond()) return true; } catch (e) {} if (Date.now() - t0 > ms) throw new Error('timeout: ' + label); await wait(50); }
  };
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const loadWait = async () => { await waitUntil(() => { const c = $('#content'); return c && c.innerHTML.length > 0 && !c.innerHTML.includes('page-loading'); }, 9000, 'page render'); await wait(400); }; // settle: like a human pausing before tapping
  const fire = (el, type) => el.dispatchEvent(new w.Event(type, { bubbles: true, cancelable: true }));
  const typeIn = (sel, val) => { const el = $(sel); el.focus(); el.value = val; fire(el, 'input'); fire(el, 'change'); return el; };
  const setVal = (sel, val) => { const el = $(sel); el.value = val; fire(el, 'input'); fire(el, 'change'); return el; };
  const clickOnclick = async substr => { await waitUntil(() => $$('[onclick]').some(e => (e.getAttribute('onclick') || '').includes(substr)), 9000, 'onclick~' + substr); const el = $$('[onclick]').find(e => (e.getAttribute('onclick') || '').includes(substr)); el.click(); return el; };
  const until = sel => waitUntil(() => $(sel), 9000, sel);
  const closedSettle = async () => { await waitUntil(() => !modalOpen(), 9000, 'modal close'); await wait(450); }; // let history popstate land
  const toastText = () => ($('#toastRoot') ? $('#toastRoot').textContent.trim() : '');
  const clearToasts = () => { if ($('#toastRoot')) $('#toastRoot').innerHTML = ''; };
  const modalOpen = () => !!$('#modalOverlay');
  const refresh = async () => { await ev('loadAll(true)'); };

  await waitUntil(() => ev(`typeof init === 'function'`), 9000, 'boot');
  // silence the "take a backup" nag so it doesn't cover the UI mid-test
  await ev(`localStorage.setItem('zlift_last_external_backup', String(Date.now()))`);
  await waitUntil(() => !$('#authView').classList.contains('hidden'), 9000, 'auth view');

  console.log('\n== A) ورود و اولین اجرا (auth & first run) ==');

  await T('A1', 'auth', 'رمز اشتباه پیام خطای واضح می‌دهد و وارد اپ نمی‌شود', async () => {
    typeIn('#authUsername', 'tech'); typeIn('#authPassword', 'wrong-pass');
    fire($('#authForm'), 'submit'); await wait(500);
    const err = $('#authError');
    return (!err.classList.contains('hidden') && err.textContent.trim().length > 2 && $('#appView').classList.contains('hidden'))
      ? OK('error shown: ' + err.textContent.trim()) : BAD('authError hidden or app entered');
  });

  await T('A2', 'auth', 'ثبت‌نام با رمز کوتاه رد می‌شود', async () => {
    $('#tabRegister').click();
    typeIn('#authName', 'کاربر تست'); typeIn('#authUsername', 'realuser1'); typeIn('#authPassword', '123');
    fire($('#authForm'), 'submit'); await wait(500);
    const err = $('#authError');
    return (!err.classList.contains('hidden')) ? OK(err.textContent.trim()) : BAD('weak password accepted / no error');
  });

  await T('A3', 'auth', 'ثبت‌نام کاربر جدید وارد اپ می‌شود', async () => {
    typeIn('#authPassword', '123456');
    fire($('#authForm'), 'submit');
    await waitUntil(() => !$('#appView').classList.contains('hidden'), 9000, 'enter app');
    await loadWait();
    return OK('entered as ' + $('#userName').textContent);
  });

  await T('A4', 'first-run', 'کاربر تازه‌ثبت‌نام‌شده باید اپ خالی ببیند، نه داده دمو', async () => {
    const names = await ev(`state.projects.map(p => p.name)`);
    const svcN = await ev(`state.services.length`);
    const partN = await ev(`state.parts.length`);
    return names.length === 0
      ? OK('clean start')
      : BAD(`کاربر جدید ${names.length} پروژهٔ آماده می‌بیند: ${names.join('، ')} + ${svcN} سرویس + ${partN} قطعه (داده سید دمو) — باید دستی پاکشان کند و برای ساختمان خیالی یادآوری سرویس می‌گیرد`);
  });

  console.log('\n== B) مسیریابی (router) ==');

  await T('B1', 'router', 'آدرس اشتباه (#/blah) کاربر را گمراه نمی‌کند', async () => {
    await ev(`navigate('/blah')`); await loadWait();
    const hash = w.location.hash, title = $('#pageTitle').textContent;
    return (hash !== '#/blah')
      ? OK('normalized to ' + hash)
      : BAD(`هش روی ${hash} مانده ولی «${title}» نمایش داده می‌شود — نه 404 هست نه اصلاح آدرس؛ رفرش/اشتراک لینک گمراه‌کننده است`);
  });

  await T('B2', 'router', 'پروژهٔ ناموجود راه بازگشت دارد', async () => {
    await ev(`navigate('/projects/does-not-exist')`); await loadWait();
    const hasBtn = !!$('#content button, #content a');
    return hasBtn ? OK('has action') : BAD('فقط پیام «یافت نشد» بدون هیچ دکمه بازگشت (مثلاً وقتی QR ساختمان با گوشی دیگری اسکن شود)');
  });

  console.log('\n== C) پروژه‌ها از طریق فرم ==');

  let projA = null, projB = null;
  await T('C1', 'projects', 'ساخت پروژه با فرم و نمایش در لیست', async () => {
    await ev(`navigate('/projects')`); await loadWait();
    await clickOnclick('openProjectForm()'); await until('#f_name');
    typeIn('#f_name', 'ساختمان تست کاربر واقعی'); typeIn('#f_customer', 'آقای تست'); setVal('#f_floors', '6');
    $('#projSave').click(); await closedSettle();
    projA = await ev(`(state.projects.find(p => p.name === 'ساختمان تست کاربر واقعی') || {}).id`);
    return $('#content').textContent.includes('ساختمان تست کاربر واقعی') && projA ? OK('created ' + projA) : BAD('not in list');
  });

  await T('C2', 'projects', 'نام خالی: فرم باز می‌ماند و فیلد علامت می‌خورد', async () => {
    const before = await ev(`state.projects.length`);
    await clickOnclick('openProjectForm()'); await until('#f_name');
    typeIn('#f_name', '   ');
    $('#projSave').click(); await wait(400);
    const marked = $('#f_name') && $('#f_name').classList.contains('input-error');
    const after = await ev(`state.projects.length`);
    const good = modalOpen() && marked && after === before;
    await ev(`closeModal()`); await wait(150);
    return good ? OK('blocked + field marked') : BAD(`modalOpen=${modalOpen()} marked=${marked} count ${before}->${after}`);
  });

  await T('C3', 'projects', 'اعداد منفی برای طبقات/ظرفیت/نفرات/سرعت پذیرفته نمی‌شوند', async () => {
    await clickOnclick('openProjectForm()'); await until('#f_name');
    typeIn('#f_name', 'پروژه اعداد منفی');
    setVal('#f_floors', '-3'); setVal('#f_cap', '-100'); setVal('#f_persons', '-2'); setVal('#f_speed', '-1');
    $('#projSave').click(); await closedSettle();
    const p = await ev(`state.projects.find(p => p.name === 'پروژه اعداد منفی')`);
    projB = p && p.id;
    const clean = p && p.floors >= 0 && p.capacityKg >= 0 && p.persons >= 0 && p.speed >= 0;
    return clean ? OK('clamped/rejected') : BAD(`ذخیره شد: طبقات=${p && p.floors}، ظرفیت=${p && p.capacityKg}kg، نفرات=${p && p.persons}، سرعت=${p && p.speed} — در کارت پروژه و داشبورد «-۳ طبقه · -۱۰۰kg» دیده می‌شود؛ نه min روی ورودی هست نه clamp در API`);
  });

  await T('C4', 'xss', 'نام/مشتری حاوی HTML تزریق نمی‌شود (XSS)', async () => {
    await ev(`window.__xss = 0`);
    await clickOnclick('openProjectForm()'); await until('#f_name');
    typeIn('#f_name', '<img src=x onerror="window.__xss=1">');
    typeIn('#f_customer', '"><svg onload="window.__xss=2">');
    $('#projSave').click(); await closedSettle();
    await ev(`navigate('/projects')`); await loadWait(); await wait(300);
    const inj = $$('#content img[onerror], #content svg[onload]').length;
    const x = await ev(`window.__xss`);
    // cleanup this project so later assertions stay readable
    const pid = await ev(`(state.projects.find(p => p.name.includes('onerror')) || {}).id`);
    if (pid) { await ev(`api('/projects/${pid}', { method: 'DELETE' })`); await refresh(); await ev(`navigate('/projects')`); await loadWait(); }
    return (!x && inj === 0) ? OK('escaped correctly') : BAD(`__xss=${x} injectedEls=${inj}`);
  });

  console.log('\n== D) انبار قطعات از طریق فرم ==');

  let partId = null;
  await T('D1', 'parts', 'ساخت قطعه با فرم', async () => {
    await ev(`navigate('/parts')`); await loadWait();
    await clickOnclick('openPartForm()'); await until('#p_name');
    typeIn('#p_name', 'بلبرینگ تست واقعی'); typeIn('#p_code', 'SKF-6204-RU'); setVal('#p_qty', '5'); setVal('#p_price', '100000');
    $('#partSave').click(); await closedSettle();
    partId = await ev(`(state.parts.find(p => p.name === 'بلبرینگ تست واقعی') || {}).id`);
    return $('#content').textContent.includes('بلبرینگ تست واقعی') && partId ? OK('created') : BAD('not listed');
  });

  await T('D2', 'parts', 'موجودی/قیمت منفی قطعه پذیرفته نمی‌شود', async () => {
    await clickOnclick('openPartForm()'); await until('#p_name');
    typeIn('#p_name', 'قطعه منفی تست'); setVal('#p_qty', '-5'); setVal('#p_price', '-9000');
    $('#partSave').click(); await closedSettle();
    const p = await ev(`state.parts.find(p => p.name === 'قطعه منفی تست')`);
    return (p && p.qty >= 0 && p.price >= 0) ? OK('clamped on create')
      : BAD(`ذخیره شد: موجودی=${p && p.qty} قیمت=${p && p.price} — در POST قطعه clamp نیست (در ویرایش هست)؛ «ارزش کل انبار» هم با همین اعداد منفی حساب می‌شود`);
  });

  console.log('\n== E) فرم سرویس ==');

  let svcA = null;
  await T('E1', 'services', 'سرویس مستقل بدون مشتری و بدون پروژه رد می‌شود', async () => {
    await ev(`navigate('/services')`); await loadWait();
    const before = await ev(`state.services.length`);
    await ev(`openServiceForm()`); await until('#svcSave');
    setVal('#s_project', ''); typeIn('#s_customer', '');
    $('#svcSave').click(); await wait(400);
    const after = await ev(`state.services.length`);
    const good = modalOpen() && after === before && $('#s_customer').classList.contains('input-error');
    await ev(`closeModal()`); await wait(150);
    return good ? OK('blocked with field error') : BAD(`modalOpen=${modalOpen()} ${before}->${after}`);
  });

  await T('E2', 'services', 'جستجوی قطعه در فرم سرویس با «کد فنی» هم پیدا می‌کند', async () => {
    await ev(`openServiceForm(null, '${projA}')`); await until('#svcSave');
    await clickOnclick('svcTogglePicker(true)'); await until('#svcPickSearch');
    typeIn('#svcPickSearch', 'SKF-6204'); await wait(250);
    const found = $('#svcPickList').textContent.includes('بلبرینگ تست واقعی');
    return found ? OK('found by code')
      : BAD('با کد SKF-6204-RU هیچ نتیجه‌ای نیست؛ جستجو فقط روی نام است — norm(p.name, p.code, p.category) آرگومان‌های دوم‌به‌بعد را دور می‌ریزد (services.js:304). تکنسین معمولاً کد روی جعبه را سرچ می‌کند');
  });

  await T('E3', 'services', 'کادر «تعداد قطعه مصرفی» عدد را درست نشان می‌دهد و هنگام تایپ فوکوس نمی‌پرد', async () => {
    // picker is still open from E2 — search by NAME (works) and add the part
    typeIn('#svcPickSearch', 'بلبرینگ'); await wait(250);
    const addBtn = $$('#svcPickList [onclick]').find(e => (e.getAttribute('onclick') || '').includes('svcAddStockPart'));
    if (!addBtn) return BAD('add button not found');
    addBtn.click(); await wait(200);
    const qtyInput = $('#svcPartsBox input[data-spi]');
    const raw = qtyInput ? qtyInput.outerHTML : '';
    const shownVal = qtyInput ? qtyInput.value : '(none)';
    // now type in it like a user changing 1 -> 3
    qtyInput.focus(); qtyInput.value = '3'; fire(qtyInput, 'input'); await wait(150);
    const stillThere = document.contains(qtyInput);
    await ev(`closeModal()`); await wait(150);
    const persianValue = /value="[۰-۹]"/.test(raw);
    return (!persianValue && shownVal === '1' && stillThere)
      ? OK('qty input sane')
      : BAD(`value ورودی number با رقم فارسی رندر می‌شود (${raw.slice(0, 90)}…) → در مرورگر واقعی کادر خالی دیده می‌شود؛ مقدار خوانده‌شده: «${shownVal}». و با اولین تایپ، کل ردیف بازرندر می‌شود (المان هنوز در DOM هست؟ ${stillThere}) → فوکوس/کیبورد موبایل می‌پرد، برای عدد دورقمی باید دوباره لمس کرد`);
  });

  await T('E4', 'services', 'ثبت سرویس کامل برای پروژه از طریق فرم', async () => {
    await ev(`openServiceForm(null, '${projA}')`); await until('#svcSave');
    typeIn('#s_problem', 'صدای غیرعادی درب طبقه سوم');
    typeIn('#s_work', 'تنظیم و روانکاری ریل درب');
    $('#svcSave').click(); await closedSettle(); await loadWait();
    svcA = await ev(`(state.services.find(s => s.problem === 'صدای غیرعادی درب طبقه سوم') || {}).id`);
    return svcA ? OK('saved ' + svcA) : BAD('service not found after save');
  });

  await T('E5', 'services', 'ویرایش سرویس، امضای ذخیره‌شده را پاک نمی‌کند', async () => {
    const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNsaGj4DwAFhAJ/wlseKgAAAABJRU5ErkJggg==';
    const made = await ev(`api('/services', { method: 'POST', body: { projectId: '${projA}', problem: 'سرویس امضادار', signTech: '${SIG}', signCustomer: '${SIG}' } })`);
    await refresh();
    await ev(`openServiceForm('${made.service.id}')`); await until('#svcSave'); await wait(200);
    typeIn('#s_work', 'یک ویرایش کوچک متنی');
    $('#svcSave').click(); await closedSettle();
    const after = await ev(`(state.services.find(s => s.id === '${made.service.id}') || {}).signTech`);
    return after === SIG ? OK('signature preserved')
      : BAD(`بعد از ویرایش ساده، signTech شد: «${String(after).slice(0, 40)}» — readSignature وقتی چیزی کشیده نشده «» برمی‌گرداند و فرم همان را ذخیره می‌کند؛ در مرورگر واقعی هم اگر قبل از لودشدن تصویر امضا روی بوم ذخیره بزنی، PNG خالی جای امضای مشتری می‌نشیند`);
  });

  await T('E6', 'modal-race', 'دکمه «کپی سرویس» فرم جدید را باز نگه می‌دارد', async () => {
    await ev(`openServiceView('${svcA}')`); await until('#modalOverlay'); await wait(200);
    await clickOnclick('duplicateService(');
    await wait(800); // let any history popstate land
    const formThere = !!$('#svcSave');
    if (modalOpen()) { await ev(`closeModal()`); await wait(150); }
    return formThere ? OK('duplicate form stayed open')
      : BAD('فرم کپی بلافاصله بسته شد — همان الگوی closeModal();openModal() که در کامنت projects.js برای باگ «دکمه بایگانی کار نمی‌کند» مستند شده؛ در duplicateService و diagToServicePrompt و ردیف‌های جستجوی سراسری هم تکرار شده');
  });

  await T('E7', 'modal-race', 'کلیک «کپی سرویس» history.back صف نمی‌کند (ترتیب رویداد مرورگر واقعی)', async () => {
    // Same instrumentation the project itself uses in qa/archive.js TEST 1c:
    // a correct close-then-reopen must queue NO history.back() during the click.
    await ev(`openServiceView('${svcA}')`); await until('#modalOverlay'); await wait(300);
    const race = await ev(`(() => {
      let backs = 0; const ob = history.back.bind(history);
      history.back = function () { backs++; return ob(); };
      const b = [...document.querySelectorAll('#modalRoot button')].find(x => (x.getAttribute('onclick') || '').includes('duplicateService('));
      b.click();
      history.back = ob;
      return { backs, painted: !!document.querySelector('#svcSave'), ignorePop: _ignorePop, stack: uiStack.length };
    })()`);
    // only a queued traversal can land: if the click queued no history.back(),
    // a real browser fires no popstate here at all (dispatching one anyway
    // would simulate a hardware-back press, which SHOULD close the form)
    if (race.backs > 0) await ev(`window.dispatchEvent(new PopStateEvent('popstate'))`);
    await wait(250);
    const survives = !!$('#svcSave');
    if (modalOpen()) { await ev(`closeModal()`); await wait(200); }
    return (race.backs === 0 && survives) ? OK('no queued back')
      : BAD(`کلیک ${race.backs} بار history.back() صف کرد و بعد از فرود popstate فرم کپی ${survives ? 'ماند' : 'نابود شد'} — دقیقاً همان ریشه‌ای که در ARCHIVE_BUTTON_FIX.md روی دستگاه واقعی دیده و برای «بایگانی» فیکس شد، ولی duplicateService (services.js:523)، انتقال عیب‌یابی به سرویس (measurement-engine.js:106 و :90) و ردیف‌های جستجوی سراسری (:758,:778) هنوز الگوی closeModal();openModal() را دارند`);
  });

  console.log('\n== F) خرابی‌ها و چک‌لیست ==');

  await T('F1', 'issues', 'ثبت خرابی بدون انتخاب پروژه یا ذخیره می‌شود یا خطای روشن می‌دهد', async () => {
    clearToasts();
    const before = await ev(`state.issues.length`);
    await ev(`navigate('/issues')`); await loadWait();
    await ev(`openIssueForm()`); await until('#isSave');
    typeIn('#is_title', 'خرابی بدون پروژه تست');
    setVal('#is_project', ''); // «—» — looks optional, no * on the label
    $('#isSave').click(); await wait(600);
    const after = await ev(`state.issues.length`);
    const toast = toastText();
    const generic = await ev(`t('errGeneric')`);
    if (modalOpen()) { await ev(`closeModal()`); await wait(150); }
    return (after === before + 1 || (toast && toast !== generic && toast.includes('پروژه')))
      ? OK('created or clear message')
      : BAD(`ساخته نشد (${before}->${after}) و پیام فقط بود: «${toast}» — کاربر نمی‌فهمد پروژه در عمل اجباری است (API برای issues حالت standalone را رد می‌کند ولی فرم پروژه را اختیاری نشان می‌دهد)`);
  });

  await T('F2', 'checklists', 'تأیید ایمنی چک‌لیست بحرانی بدون خطای گمراه‌کننده ثبت می‌شود', async () => {
    clearToasts();
    await ev(`sessionStorage.removeItem('zlift_safety_ack_en81-safety-audit')`);
    await ev(`navigate('/checklists/en81-safety-audit')`); await loadWait();
    const cb = $('#safetyAck');
    if (!cb) return BAD('safety gate did not render');
    cb.checked = true; fire(cb, 'change'); await wait(100);
    $('#safetyContinue').click(); await wait(900); await loadWait();
    const toast = toastText();
    const logFail = await ev(`t('safetyLogFailed')`);
    return !toast.includes(logFail)
      ? OK('ack logged cleanly')
      : BAD(`بدون انتخاب پروژه (حالت مشاهده) همیشه این خطا می‌آید: «${toast}» — safetyLogs هم standalone را رد می‌کند؛ پیام از «حافظه» حرف می‌زند و تکنسین را بی‌دلیل نگران می‌کند، و سابقه تأیید ایمنی هم اصلاً ذخیره نمی‌شود`);
  });

  await T('F3', 'checklists', 'حالت «بدون پروژه» یا ذخیره می‌کند یا اصلاً قابل تیک‌زدن نیست', async () => {
    await ev(`navigate('/checklists/traction-install')`); await loadWait();
    const first = $('#content .check-item[data-item]');
    if (!first) return BAD('no checklist items rendered');
    first.click(); await wait(300);
    const markedNow = first.className.includes('ci-pass');
    await ev(`navigate('/dashboard')`); await loadWait();
    await ev(`navigate('/checklists/traction-install')`); await loadWait();
    const again = $('#content .check-item[data-item]');
    const persisted = again && again.className.includes('ci-pass');
    return (persisted || !markedNow) ? OK('persisted or read-only')
      : BAD('آیتم تیک خورد و درصد پیشرفت بالا رفت، ولی با رفتن‌وبرگشتن همه‌چیز پاک شد — برچسب «فقط مشاهده» ریز است و هیچ هشداری هنگام تیک‌زدن داده نمی‌شود؛ تکنسین می‌تواند کل چک‌لیست را پر کند و از دست بدهد');
  });

  console.log('\n== G) فاکتور و مالیات ==');

  await T('G1', 'invoices', 'نرخ مالیات پیش‌فرض تنظیمات در فاکتور جدید واقعاً اعمال می‌شود', async () => {
    await ev(`api('/settings', { method: 'PUT', body: { taxRate: 10 } }).then(d => { state.settings = d.settings; })`);
    await ev(`navigate('/invoices')`); await loadWait();
    await ev(`openInvoiceForm()`); await until('#inv_taxrate');
    const raw = $('#inv_taxrate') ? $('#inv_taxrate').outerHTML : '';
    const draftRate = await ev(`invDraft.taxRate`);
    await ev(`invAddItem({ desc: 'خدمت تست', qty: 1, price: 100000 })`); await wait(200);
    const totals = $('#invTotalsBox') ? $('#invTotalsBox').textContent.replace(/\s+/g, ' ') : '';
    const persianValue = /value="[۰-۹]/.test(raw);
    await ev(`closeModal(); invDraft = null;`); await wait(150);
    return (!persianValue && draftRate === 10 && totals.includes('۱۱۰'))
      ? OK('10% tax applied')
      : BAD(`کادر نرخ مالیات با رقم فارسی داخل type=number رندر شد (${persianValue ? 'value="۱۰"' : raw.slice(0, 60)}) → مرورگر آن را خالی می‌خواند و invRefreshTotals نرخ را ${draftRate} کرد؛ جمع فاکتور ۱۰۰٬۰۰۰ ریالی بدون مالیات شد. مبلغ نهایی از مشتری کمتر گرفته می‌شود و در حالت فارسی همیشه رخ می‌دهد (در EN درست است)`);
  });

  await T('G2', 'settings', 'ذخیره تنظیمات، نرخ مالیات را بی‌صدا صفر نمی‌کند', async () => {
    await ev(`api('/settings', { method: 'PUT', body: { taxRate: 10 } }).then(d => { state.settings = d.settings; })`);
    await ev(`navigate('/settings')`); await loadWait();
    const raw = $('#st_taxrate') ? $('#st_taxrate').outerHTML : '';
    $('#stSaveSvc').click(); await wait(500);
    const after = await ev(`state.settings.taxRate`);
    return after === 10 ? OK('tax preserved')
      : BAD(`بعد از یک ذخیره ساده در تنظیمات، taxRate از ۱۰ شد ${after} — همان باگ رقم فارسی در value ورودی number (settings.js:34)؛ کاربر برای عوض‌کردن نام تکنسین پیش‌فرض، نرخ مالیاتش را از دست می‌دهد. outerHTML: ${raw.slice(0, 80)}`);
  });

  await T('G3', 'invoices', 'فاکتور کاملاً خالی (بدون ردیف و مبلغ) صادر نمی‌شود', async () => {
    const before = await ev(`state.invoices.length`);
    await ev(`navigate('/invoices')`); await loadWait();
    await ev(`openInvoiceForm()`); await until('#invSave');
    typeIn('#inv_customer', 'مشتری فاکتور خالی');
    $('#invSave').click(); await wait(700);
    const after = await ev(`state.invoices.length`);
    let status = '';
    if (after > before) status = await ev(`invStatusMeta(state.invoices.find(i => i.customer === 'مشتری فاکتور خالی')).key`);
    if (modalOpen()) { await ev(`closeModal(); invDraft = null;`); await wait(150); }
    return after === before ? OK('empty invoice rejected')
      : BAD(`فاکتور صفر ریالی ساخته شد و وضعیتش «${status}» (پرداخت‌نشده 🔴) است — تا ابد در مطالبات باز می‌ماند و هیچ‌وقت تسویه نمی‌شود`);
  });

  await T('G4', 'invoices', 'انتخاب سرویسِ پروژه دیگر در فاکتور خطای قابل‌فهم می‌دهد', async () => {
    clearToasts();
    const before = await ev(`state.invoices.length`);
    await ev(`openInvoiceForm()`); await until('#invSave');
    typeIn('#inv_customer', 'مشتری تداخل پروژه');
    setVal('#inv_project', projB);           // project B …
    setVal('#inv_service', svcA);            // … but a service of project A (dropdown lists ALL services)
    $('#invSave').click(); await wait(700);
    const after = await ev(`state.invoices.length`);
    const toast = toastText(); const generic = await ev(`t('errGeneric')`);
    if (modalOpen()) { await ev(`closeModal(); invDraft = null;`); await wait(150); }
    return (after === before + 1 || (toast && !toast.includes(generic)))
      ? OK('handled clearly')
      : BAD(`ذخیره نشد و پیام فقط «${toast}» بود — لیست «سرویس مرتبط» سرویس همه پروژه‌ها را نشان می‌دهد ولی API ترکیب ناهمخوان را رد می‌کند و کد خطا (RELATED_RECORD_CONTEXT_MISMATCH) به پیام انسانی ترجمه نشده`);
  });

  await T('G5', 'invoices', 'جستجوی فاکتور با شماره فاکتور کار می‌کند', async () => {
    await ev(`api('/invoices', { method: 'POST', body: { customer: 'مشتری شماره‌دار', number: 'RU-9911', items: [{ desc: 'ردیف', qty: 1, price: 500 }], payments: [] } })`);
    await refresh();
    await ev(`navigate('/invoices')`); await loadWait();
    typeIn('#invSearch', 'RU-9911'); await wait(450);
    const found = $('#invList').textContent.includes('مشتری شماره‌دار');
    return found ? OK('found by number')
      : BAD('با شماره RU-9911 چیزی پیدا نشد — جستجو روی شماره فاکتور نیست و لیست هم به‌جای شماره، تکه‌ای از id داخلی (#AB12CD) را نشان می‌دهد؛ همان چیزی که مشتری روی فاکتور چاپی می‌خواند قابل جستجو نیست');
  });

  console.log('\n== H) اندازه‌گیری ==');

  await T('H1', 'measurements', 'انتخاب سرویس پروژه دیگر در اندازه‌گیری خطای قابل‌فهم می‌دهد', async () => {
    clearToasts();
    const before = await ev(`(state.measurements || []).length`);
    await ev(`navigate('/measurements')`); await loadWait();
    await ev(`openMeasForm()`); await until('#m_save');
    setVal('#m_project', projB);
    setVal('#m_service', svcA); // service of project A — dropdown is not filtered by project
    typeIn('#m_value', '380');
    $('#m_save').click(); await wait(800);
    const after = await ev(`(state.measurements || []).length`);
    const toast = toastText();
    const unexp = await ev(`t('errUnexpected')`);
    if (modalOpen()) { await ev(`closeModal()`); await wait(150); }
    return (after === before + 1 || (toast && !toast.includes(unexp)))
      ? OK('handled clearly')
      : BAD(`ذخیره نشد (${before}->${after}) و پیام «${toast}» آمد — منوی سرویس مرتبط با پروژه انتخابی فیلتر نمی‌شود (برای عکس مرتبط هم همین است) و خطا از مسیر guard به «خطای غیرمنتظره» تبدیل می‌شود`);
  });

  console.log('\n== I) فوکوس جستجوها (موبایل) ==');

  for (const [route, sel, label] of [['/vvvf', '#vvvfSearch', 'کدهای خطای درایو'], ['/measurements', '#measSearch', 'اندازه‌گیری‌ها'], ['/calculations', '#calcSearch', 'محاسبات']]) {
    await T('I-' + route, 'search-focus', `تایپ در جستجوی «${label}» فوکوس را نمی‌پراند`, async () => {
      await ev(`navigate('${route}')`); await loadWait();
      const inp = $(sel); inp.focus();
      inp.value = 'OC'; fire(inp, 'input');
      await wait(600); // debounce fires → full re-render?
      const sameEl = document.contains(inp);
      const focused = document.activeElement === inp;
      return (sameEl && focused) ? OK('focus kept')
        : BAD(`بعد از توقف تایپ، کل صفحه بازرندر شد: همان input در DOM هست؟ ${sameEl}، فوکوس روش هست؟ ${focused} — روی موبایل کیبورد بسته می‌شود و برای ادامه جستجو باید دوباره لمس کرد${route === '/calculations' ? '؛ در محاسبات، عددهایی که در کارت‌ها وارد کرده بودی هم پاک می‌شوند' : ''}`);
    });
  }

  console.log('\n== J) محاسبات ==');

  await T('J1', 'calculators', 'ماشین‌حساب‌ها ورودی فیزیکی ناممکن (منفی) را بی‌هشدار حساب نمی‌کنند', async () => {
    await ev(`calcFilter = { cat: 'all', q: '' }; navigate('/calculations')`); await loadWait(); await ev(`renderCalculations()`); await wait(300);
    const offenders = await ev(`(() => {
      const out = [];
      for (const cal of CALCULATORS) {
        cal.inputs.forEach(inp => { const el = document.querySelector('#calc_' + cal.id + '_' + inp.id); if (el) el.value = '-5'; });
        computeCalc(cal);
        const el = document.querySelector('#calcResult_' + cal.id);
        if (el && el.innerHTML.includes('RESULT')) out.push(cal.id);
      }
      return out;
    })()`);
    return offenders.length === 0 ? OK('domain validated')
      : BAD(`${offenders.length} ماشین‌حساب با همه ورودی‌های ‎-5‎ هم «RESULT» تولید کردند (مثلاً ${offenders.slice(0, 6).join(', ')}) — هیچ کنترل دامنه‌ای (سرعت/ظرفیت/طول منفی) نیست؛ فقط NaN/Infinity گرفته می‌شود`);
  });

  console.log('\n== K) عیب‌یابی ==');

  await T('K1', 'diagnostics', 'جلسه عیب‌یابی نیمه‌کاره با جابجایی صفحه از بین نمی‌رود', async () => {
    await ev(`navigate('/diagnostics')`); await loadWait();
    await ev(`startDiagFlow('f01')`); await waitUntil(() => $$('#content [onclick]').some(e => (e.getAttribute('onclick') || '').startsWith('diagAnswer(')), 9000, 'diag options');
    // answer first question via its real button
    const opt = $$('#content [onclick]').find(e => (e.getAttribute('onclick') || '').startsWith('diagAnswer('));
    opt.click(); await wait(250);
    const inFlowBefore = await ev(`!!(diagSession && diagSession.path.length === 1)`);
    await ev(`navigate('/projects')`); await loadWait();          // e.g. phone rings, taps elsewhere
    await ev(`navigate('/diagnostics')`); await loadWait();
    const still = await ev(`!!diagSession`);
    return (inFlowBefore && still) ? OK('session preserved')
      : BAD('با یک بار رفتن به صفحه دیگر، کل مسیر عیب‌یابی و شواهد ثبت‌شده پاک شد (flushUiLayers در navigate سشن را null می‌کند) — وسط موتورخانه با یک لمس اشتباه باید از سؤال اول شروع کند');
  });

  await T('K2', 'i18n', 'در حالت English محتوای عیب‌یابی انگلیسی است', async () => {
    await ev(`setLang('en')`); await wait(300); await loadWait();
    await ev(`navigate('/diagnostics')`); await loadWait();
    await ev(`startDiagFlow('f01')`); await wait(250);
    const qFa = await ev(`DIAG_FLOWS[0].nodes.p1.q.fa`);
    const hasFa = $('#content').textContent.includes(qFa);
    await ev(`diagExit()`); await ev(`setLang('fa')`); await wait(300); await loadWait();
    return !hasFa ? OK('English content')
      : BAD('کل سؤال‌ها/نتیجه‌ها/اقدام‌های درخت عیب‌یابی فقط فارسی‌اند (در داده‌ها اصلاً en ندارند و رندر هم .fa را می‌خواند) — کاربر انگلیسی‌زبان وسط اپ انگلیسی با متن فارسی مواجه می‌شود؛ تقویم هم حروف روزهای هفته‌اش فارسی ثابت مانده');
  });

  console.log('\n== L) یادآوری و بایگانی ==');

  await T('L1', 'reminders', 'پروژه بایگانی‌شده دیگر یادآوری سرویس عقب‌افتاده تولید نمی‌کند', async () => {
    const made = await ev(`api('/projects', { method: 'POST', body: { name: 'پروژه بایگانی تست', serviceIntervalDays: 30 } })`);
    const pid = made.project.id;
    await ev(`api('/services', { method: 'POST', body: { projectId: '${pid}', serviceType: 'maintenance', date: Date.now() - 40 * 86400000, problem: 'سرویس قدیمی' } })`);
    await refresh();
    const before = await ev(`buildReminders().filter(r => r.projectId === '${pid}').length`);
    await ev(`archiveProject('${pid}')`); await wait(250);
    $('#confirmYes').click(); await wait(700); await loadWait();
    const archived = await ev(`(state.projects.find(p => p.id === '${pid}') || {}).archived`);
    const after = await ev(`buildReminders().filter(r => r.projectId === '${pid}').length`);
    return (archived && after === 0) ? OK('archived = silent')
      : BAD(`قبل از بایگانی ${before} یادآوری، بعد از بایگانی هم ${after} یادآوری — buildReminders پروژه‌های archived را فیلتر نمی‌کند؛ ساختمان تحویل‌شده/ازدست‌رفته تا ابد در تقویم و اعلان «سرویس عقب‌افتاده» می‌ماند (داشبورد درست فیلتر می‌کند، تقویم و نوتیفیکیشن نه)`);
  });

  await T('L2', 'reminders', 'پیگیریِ سرویسِ «تمام‌شده (سالم)» برای همیشه عقب‌افتاده نمی‌ماند', async () => {
    const made = await ev(`api('/services', { method: 'POST', body: { projectId: '${projA}', problem: 'کار تمام شد ولی تاریخ پیگیری ماند', finalStatus: 'ok', followUpDate: Date.now() - 3 * 86400000 } })`);
    await refresh();
    const hits = await ev(`buildReminders().filter(r => r.serviceId === '${made.service.id}').length`);
    return hits === 0 ? OK('ok service not nagging')
      : BAD('سرویس با وضعیت نهایی «سالم/تمام» هم به‌خاطر followUpDate هر روز «عقب‌افتاده» نشان داده می‌شود — و برای این نوع یادآوری دکمه انجام‌شد/بستن وجود ندارد (فقط یادآوری دستی دارد)؛ تنها راه، ویرایش سرویس و پاک‌کردن تاریخ است');
  });

  console.log('\n== M) گزارش و آمار ==');

  await T('M1', 'xss', 'نام تکنسین در صفحه آمار تزریق HTML نمی‌کند', async () => {
    const payload = '<img src=x onerror="window.__xss=9">';
    await ev(`openServiceForm(null, '${projA}')`); await until('#svcSave');
    typeIn('#s_tech', payload); typeIn('#s_problem', 'تست آمار');
    $('#svcSave').click(); await closedSettle();
    await ev(`navigate('/analytics')`); await loadWait(); await wait(300);
    const inj = $$('#content img[onerror]').length;
    return inj === 0 ? OK('escaped')
      : BAD(`نام تکنسین بدون esc داخل نمودار «بار کاری تکنسین‌ها» رندر شد (${inj} تگ تزریق‌شده) — anStatusBars برچسب را خام می‌نویسد (analytics.js). هر فیلد متنی آزاد (اینجا از فرم سرویس) می‌تواند اسکریپت اجرا کند`);
  });

  await T('M2', 'reports', 'گزارش ماهانه مصرف قطعه را با علامت درست نشان می‌دهد', async () => {
    if (!partId) { const mk = await ev(`api('/parts', { method: 'POST', body: { name: 'بلبرینگ تست واقعی', qty: 5, price: 1000 } })`); partId = mk.part.id; }
    await ev(`api('/parts-consume', { method: 'POST', body: { partId: '${partId}', qty: 2, projectId: '${projA}', note: 'تست گزارش' } })`);
    await refresh();
    await ev(`navigate('/report')`); await loadWait();
    const txt = $('#content').textContent.replace(/\s+/g, ' ');
    const neg = /×\s*-\s*[۰-۹0-9]/.test(txt);
    const hasPart = txt.includes('بلبرینگ تست واقعی');
    return (hasPart && !neg) ? OK('shows ×2')
      : BAD(`در گزارش ماهانه «بلبرینگ تست واقعی ×-۲» دیده می‌شود (qty خام تاریخچه منفی است) — صفحه آمار درست برعکسش می‌کند ولی گزارش ماهانه و نسخه چاپی‌اش نه؛ تعدیل‌های موجودی (+/برگشت فاکتور) هم قاطی «مصرف» همین‌جا فهرست می‌شوند`);
  });

  console.log('\n== N) قرارداد ==');

  await T('N1', 'contracts', 'مبلغ منفی قرارداد پذیرفته نمی‌شود', async () => {
    await ev(`navigate('/contracts')`); await loadWait();
    await ev(`openContractForm()`); await until('#ctSave');
    typeIn('#ct_building', 'قرارداد منفی تست'); setVal('#ct_amount', '-50000');
    $('#ctSave').click(); await wait(700);
    const ct = await ev(`state.contracts.find(c => c.building === 'قرارداد منفی تست')`);
    if (modalOpen()) { await ev(`closeModal()`); await wait(150); }
    return (!ct || ct.amount >= 0) ? OK('rejected/clamped')
      : BAD(`قرارداد با مبلغ ماهانه ${ct.amount} ریال ذخیره شد — کالکشن قراردادها هیچ اعتبارسنجی عددی ندارد؛ کارت‌های «درآمد مورد انتظار/پیش‌بینی» منفی می‌شوند`);
  });

  console.log('\n== O) دسترس‌پذیری صفحه‌کلید ==');

  await T('O1', 'a11y', 'ردیف‌های لیست با صفحه‌کلید هم قابل بازکردن‌اند', async () => {
    await ev(`navigate('/projects')`); await loadWait();
    const rows = $$('#content .row-item[onclick]');
    const unreachable = rows.filter(el => !el.hasAttribute('tabindex') && !el.hasAttribute('role')).length;
    return rows.length && unreachable === 0 ? OK('keyboard reachable')
      : BAD(`${unreachable} از ${rows.length} ردیف پروژه فقط div با onclick است (نه tabindex نه role) — با کیبورد/اسکرین‌ریدر اصلاً نمی‌شود پروژه/سرویس/فاکتور باز کرد؛ فقط چک‌لیست‌ها درست پیاده شده‌اند`);
  });

  console.log('\n== P) حساب دوم روی همان دستگاه (تبلت مشترک کارگاه) ==');

  await T('P1', 'auth', 'حساب دوم روی همان دستگاه، داده کاربر اول را نمی‌بیند', async () => {
    await ev(`api('/projects', { method: 'POST', body: { name: 'نشانگر کاربر اول' } })`); await refresh();
    $('#logoutBtn').click(); await wait(600);
    await waitUntil(() => !$('#authView').classList.contains('hidden'), 9000, 'back to auth');
    $('#tabRegister').click();
    typeIn('#authName', 'تکنسین دوم'); typeIn('#authUsername', 'secondtech'); typeIn('#authPassword', '654321');
    fire($('#authForm'), 'submit');
    await waitUntil(() => !$('#appView').classList.contains('hidden'), 9000, 'enter as user2');
    await loadWait();
    const sees = await ev(`state.projects.some(p => p.name === 'نشانگر کاربر اول')`);
    const total = await ev(`state.projects.length`);
    return !sees ? OK('data isolated per user')
      : BAD(`کاربر دوم تازه‌ثبت‌نام‌شده همه ${total} پروژه (و سرویس/فاکتور/عکس) کاربر اول را می‌بیند و می‌تواند حذف/بایگانی کند — داده‌ها userId ندارند؛ صفحه ورود عملاً قفل نیست: هر کس گوشی را بردارد با «ثبت‌نام» یک حساب تازه می‌سازد و به همه‌چیز می‌رسد`);
  });

  console.log('\n== Q) بررسی‌های ایستا (قابلیت‌هایی که در UI نیستند) ==');

  const statics = [
    ['Q1', 'دکمه تماس (tel:) برای شماره مشتری/کارفرما وجود دارد', () => /href="tel:|telHref\(|location\.href\s*=\s*'tel:/.test(readSrc('js/modules/projects.js') + readSrc('js/modules/dashboard.js') + readSrc('js/modules/services.js') + readSrc('js/core/app-core.js')), 'شماره تلفن همه‌جا فقط متن است؛ تکنسین در راه باید شماره را حفظ/کپی کند — هیچ tel: یا لینک مسیریابی (نقشه) برای آدرس ساختمان نیست'],
    ['Q2', 'بازیابی از اسنپ‌شات خودکار در UI قابل انجام است', () => /restoreAutoBackup\(/.test(readSrc('js/database/backup.js').split('function openBackupModal')[1] || ''), 'هر روز اسنپ‌شات خودکار ساخته می‌شود (runAutoBackup) ولی هیچ دکمه‌ای برای دیدن/بازیابی آن‌ها نیست — restoreAutoBackup فقط تعریف شده و هیچ‌جا صدا زده نمی‌شود؛ بعد از حذف اشتباهی، کاربر راهی به آن‌ها ندارد'],
    ['Q3', 'تغییر رمز عبور از داخل اپ ممکن است', () => /تغییر رمز|changePassword|رمز فعلی/.test(readSrc('js/modules/settings.js') + readSrc('index.html')), 'نه تغییر رمز هست نه بازیابی رمز فراموش‌شده؛ تنها راه غیررسمی ساختن حساب جدید است (که به‌خاطر Q/P1 به همه داده‌ها می‌رسد)'],
    ['Q4', 'به گزارش سرویس می‌شود مستقیم عکس پیوست کرد', () => readSrc('js/modules/services.js').includes('type="file"'), 'فرم سرویس ورودی عکس ندارد؛ عکس خرابی باید جداگانه از پروفایل پروژه اضافه شود و به آن گزارش سرویس وصل نیست — روی گزارش چاپی هم عکسی نمی‌آید'],
    ['Q5', 'چک‌لیست دکمه «شروع مجدد/دوره جدید» دارد', () => readSrc('js/modules/checklists.js').includes('chReset'), 'کلید ترجمه chReset هست ولی دکمه‌ای نیست؛ از هر قالب برای هر پروژه فقط یک نمونه زنده وجود دارد — بازرسی این ماه پاسخ‌های ماه پیش را بازنویسی می‌کند و تاریخچه‌ای از اجراهای قبلی نمی‌ماند؛ صفرکردن یعنی ۴ بار لمس هر آیتم'],
    ['Q6', 'ناوبری پایین صفحه (thumb bar) در موبایل وجود دارد', () => /tabbar|bottom-nav|bottombar/i.test(readSrc('css/app.css') + readSrc('index.html')), 'روی گوشی همه جابجایی‌ها از منوی همبرگری و سایدبار است؛ برای اپ میدانیِ یکدستی، نوار پایین (امروز/آسانسورها/سرویس/مالی/ابزار) استاندارد است'],
    ['Q7', 'راهنمای نصب روی آیفون (Add to Home Screen) داخل اپ هست', () => /Add to Home|هوم|صفحه اصلی گوشی|Share.*Home/i.test(readSrc('js/pwa.js') + readSrc('js/modules/settings.js') + readSrc('index.html')), 'دکمه نصب فقط با beforeinstallprompt (اندروید/کروم) می‌آید؛ کاربر آیفون هیچ راهنمایی نمی‌بیند و اپ را نصب‌شده تجربه نمی‌کند'],
    ['Q8', 'فونت وزیرمتن جزو فایل‌های آفلاین (Service Worker) هست', () => /vazirmatn|Vazirmatn|woff2/.test(readSrc('sw.js')), 'فونت از CDN jsdelivr می‌آید و precache نشده؛ اولین اجرای آفلاین/بدون اینترنت با فونت جایگزین (Tahoma) است و هر بازدید یک درخواست خارجی دارد — برخلاف شعار «کاملاً آفلاین». preconnect به fonts.googleapis هم بلااستفاده مانده'],
    ['Q9', 'برای پروژه فیلد سررسید گواهی/بازرسی استاندارد وجود دارد', () => /cert|گواهی|سررسید بازرسی|inspectionDue/i.test(readSrc('js/modules/projects.js')), 'مهم‌ترین سررسید قانونی آسانسور در ایران (بازرسی ادواری استاندارد/گواهی) هیچ فیلد و یادآوری ندارد؛ فقط با یادآوری دستی قابل مدیریت است'],
    ['Q10', 'نمودار روند اندازه‌گیری هر آسانسور وجود دارد', () => readSrc('js/modules/measurements.js').includes('measTrend') || /chart/i.test(readSrc('js/modules/measurements.js')), 'کلید ترجمه «روند تغییرات» هست ولی اندازه‌گیری‌ها فقط فهرست‌اند؛ تکنسین روند فرسایش (مثلاً روغن/لقی/جریان) را در طول زمان نمی‌بیند'],
    ['Q11', 'رابط کاربری چندآسانسوری برای یک ساختمان وجود دارد', () => /آسانسور جدید|افزودن آسانسور|addElevator|elevatorPicker/i.test(readSrc('js/modules/projects.js')), 'لایه داده از فاز ۲B آماده است ولی UI هنوز «هر پروژه = یک آسانسور» است؛ برج ۳ آسانسوره یعنی ۳ پروژه تکراری با مشتری/آدرس تکراری و سوابق پراکنده'],
  ];
  for (const [id, name, fn, why] of statics) {
    await T(id, 'missing-feature', name, async () => (fn() ? OK('exists') : BAD(why)));
  }

  await T('Q12', 'a11y', 'کنتراست متن کم‌رنگ (text-3) روی کارت سفید حداقل 4.5:1 است', async () => {
    const css = readSrc('css/app.css');
    const light = (css.match(/html\[data-theme="light"\][^}]*--text-3:\s*(#[0-9a-fA-F]{6})/) || [])[1] || '#94a3b8';
    const dark = (css.match(/html\[data-theme="dark"\][^}]*--text-3:\s*(#[0-9a-fA-F]{6})/) || [])[1] || '#8598b4';
    const r = contrast(light, '#ffffff');
    const rd = contrast(dark, '#131c2e');
    return r >= 4.5 ? OK(r.toFixed(2) + ':1') : BAD(`حالت روشن ${r.toFixed(2)}:1 (حداقل WCAG برای متن ریز 4.5:1) — تاریخ‌ها، راهنماها و زیرواژه‌های ۱۱–۱۲ پیکسلی زیر نور آفتابِ موتورخانه/پشت‌بام خوانا نیستند؛ حالت تیره ${rd.toFixed(2)}:1 است`);
  });

  console.log(`\nREAL-USER RESULT: ${pass} passed, ${fail} failed  (✗ = real user hits a bug/trap)`);
  fs.writeFileSync(path.join(__dirname, 'real-user-results.json'), JSON.stringify(results, null, 2));
  console.log('details → qa/real-user-results.json');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('AUDIT CRASHED:', e); process.exit(2); });
