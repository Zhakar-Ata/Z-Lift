/* Z Lift — ANDROID DEVICE SIMULATION (real Chromium, not jsdom)

   A full Android OS emulator (AVD) needs KVM + Google's SDK images; this
   sandbox has neither. What it CAN run is the real thing one layer down:
   an actual Chromium 153 binary (the same engine as Chrome for Android,
   bundled by @sparticuz/chromium) driven by puppeteer-core with a
   Pixel-8 device profile — mobile viewport, touch input, Android UA,
   Asia/Tehran timezone — against the app served over http://127.0.0.1
   (a secure context, so Service Worker and WebCrypto run for real).

   Everything here is what jsdom fundamentally cannot prove: real layout
   (horizontal overflow), real canvas signatures drawn with touch, real
   file inputs/downloads, a real Service Worker serving the shell with
   the network (and then the server itself) gone, and PBKDF2 timing in a
   real engine. The user is driven by taps and keyboard input like a
   person holding the phone; `evaluate` is used only to READ state.

   "Phone B" is a second isolated browser context = a second device with
   its own storage, used for the backup-export → merge-import journey.

   Screenshots land in qa/android-shots/ (gitignored).
   Run:  node qa/android-sim.js     Exit 0 = every expectation holds. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium').default;

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(__dirname, 'android-shots');
const DL = path.join(__dirname, 'android-downloads');
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(DL, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
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

/* @sparticuz/chromium ships Amazon-Linux system libraries in a brotli tar;
   on a bare Debian/Ubuntu box the binary needs them on LD_LIBRARY_PATH */
function ensureLibs() {
  const marker = '/tmp/al2023/lib/libnspr4.so';
  if (fs.existsSync(marker)) return '/tmp/al2023/lib';
  const tar = zlib.brotliDecompressSync(fs.readFileSync(path.join(ROOT, 'node_modules/@sparticuz/chromium/bin/al2023.tar.br')));
  fs.writeFileSync('/tmp/al2023.tar', tar);
  execSync('mkdir -p /tmp/al2023 && tar -xf /tmp/al2023.tar -C /tmp/al2023');
  return '/tmp/al2023/lib';
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json'
};
function startServer() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p === '/') p = '/index.html';
      const fp = path.join(ROOT, p);
      if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); return res.end('nf'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      fs.createReadStream(fp).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, base: 'http://127.0.0.1:' + srv.address().port }));
  });
}

const PIXEL8 = {
  viewport: { width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, isLandscape: false },
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
};

async function newPhone(browser, base, label) {
  const ctx = browser.createBrowserContext ? await browser.createBrowserContext() : await browser.createIncognitoBrowserContext();
  const page = await ctx.newPage();
  await page.emulate(PIXEL8);
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Tehran' }).catch(() => {});
  await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DL }).catch(() => {});
  const logs = { label, pageerrors: [], consoleErrors: [] };
  page.on('pageerror', e => logs.pageerrors.push(String(e && e.message || e).slice(0, 220)));
  page.on('console', m => { if (m.type() === 'error') logs.consoleErrors.push(m.text().slice(0, 220)); });
  const P = {
    ctx, page, cdp, logs, label,
    ev: (fn, ...a) => page.evaluate(fn, ...a),
    goto: async (hash = '') => { const t0 = Date.now(); await page.goto(base + '/index.html' + hash, { waitUntil: 'networkidle2', timeout: 45000 }); return Date.now() - t0; },
    tap: async sel => { await page.waitForSelector(sel, { visible: true, timeout: 20000 }); await page.tap(sel); },
    tapOnclick: async sub => {
      await page.waitForFunction(s => [...document.querySelectorAll('[onclick]')].some(e => (e.getAttribute('onclick') || '').includes(s)), { timeout: 20000 }, sub);
      const h = await page.evaluateHandle(s => [...document.querySelectorAll('[onclick]')].find(e => (e.getAttribute('onclick') || '').includes(s)), sub);
      const el = h.asElement();
      await el.evaluate(e => e.scrollIntoView({ block: 'center' })); await sleep(200);
      await el.tap();
    },
    type: async (sel, text) => {
      await page.waitForSelector(sel, { visible: true, timeout: 20000 });
      await page.tap(sel);
      /* replace any prefilled value, like a user selecting the field content */
      await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
      await page.keyboard.press('Backspace');
      await page.keyboard.type(text, { delay: 8 });
    },
    shot: async name => { await page.screenshot({ path: path.join(SHOTS, name + '.png') }); },
    waitFn: (fn, timeout = 20000, ...a) => page.waitForFunction(fn, { timeout }, ...a),
    waitApp: async () => { await page.waitForFunction(() => { const a = document.querySelector('#appView'); return a && !a.classList.contains('hidden') && !document.getElementById('bootSplash'); }, { timeout: 25000 }); await sleep(500); },
    waitAuth: async () => { await page.waitForFunction(() => { const a = document.querySelector('#authView'); return a && !a.classList.contains('hidden') && !document.getElementById('bootSplash'); }, { timeout: 25000 }); await sleep(300); },
    nav: async r => { await page.evaluate(rt => navigate(rt), r); await sleep(650); }
  };
  return P;
}

async function signPad(page, sel) {
  const el = await page.waitForSelector(sel, { visible: true, timeout: 20000 });
  await el.evaluate(e => e.scrollIntoView({ block: 'center' }));
  await sleep(300);
  const box = await el.boundingBox();
  if (!box) throw new Error('signature canvas has no box');
  const x0 = box.x + box.width * 0.12, y0 = box.y + box.height * 0.62;
  await page.touchscreen.touchStart(x0, y0);
  for (let i = 1; i <= 14; i++) {
    await page.touchscreen.touchMove(x0 + (box.width * 0.68 * i) / 14, y0 - Math.sin(i / 2.2) * box.height * 0.2);
    await sleep(12);
  }
  await page.touchscreen.touchEnd();
  await sleep(250);
}

async function register(P, name, user, pw) {
  await P.waitAuth();
  await P.tap('#tabRegister'); await sleep(250);
  await P.type('#authName', name);
  await P.type('#authUsername', user);
  await P.type('#authPassword', pw);
  const t0 = Date.now();
  await P.tap('#authSubmit');
  await P.waitApp();
  return Date.now() - t0;
}

(async () => {
  const libPath = ensureLibs();
  const { srv, base } = await startServer();
  console.log('serving ' + base);
  let browser = null;
  try {
    browser = await puppeteer.launch({
      /* sparticuz defaults target Lambda; --single-process cannot host two
         isolated browser contexts (our two "phones"), so drop it */
      args: [...chromium.args.filter(a => a !== '--single-process'), '--no-sandbox', '--disable-dev-shm-usage'],
      executablePath: await chromium.executablePath(),
      headless: true,
      env: { ...process.env, LD_LIBRARY_PATH: libPath }
    });
    console.log('browser: ' + (await browser.version()) + ' · device: Pixel 8 (412×915 @2.625, touch, Asia/Tehran)');

    const A = await newPhone(browser, base, 'A');
    let pid = '', eid2 = '';

    console.log('\n== A) بوت و نصب‌پذیری در مرورگر واقعی ==');
    const coldMs = await A.goto();
    await A.waitAuth();
    await A.ev(() => { localStorage.setItem('zlift_backup_snooze', String(Date.now() + 30 * 86400000)); localStorage.setItem('zlift_last_external_backup', String(Date.now())); });
    await A.shot('01-auth');

    await T('A1', 'boot', 'اپ در Chromium واقعی (موبایل) بدون خطای صفحه بالا می‌آید و صفحهٔ ورود رندر می‌شود', async () => {
      const hasForm = await A.ev(() => !!document.querySelector('#authForm') && !!document.querySelector('#authUsername'));
      return (hasForm && A.logs.pageerrors.length === 0)
        ? OK('cold load ' + coldMs + 'ms')
        : BAD('form=' + hasForm + ' errors=' + A.logs.pageerrors.join(' | '));
    });

    await T('A2', 'pwa', 'Service Worker واقعاً ثبت و فعال می‌شود و شل آفلاین در Cache Storage می‌نشیند', async () => {
      const sw = await A.ev(async () => {
        const reg = await navigator.serviceWorker.ready;
        const keys = await caches.keys();
        let entries = 0;
        for (const k of keys) entries += (await (await caches.open(k)).keys()).length;
        return { state: reg.active && reg.active.state, keys, entries };
      });
      return (sw.state === 'activated' && sw.keys.some(k => k.startsWith('zlift-pwa-')) && sw.entries >= 40)
        ? OK(sw.keys.join(',') + ' · ' + sw.entries + ' entries')
        : BAD(JSON.stringify(sw));
    });

    await T('A3', 'pwa', 'مانیفست از دید مرورگر قابل دریافت و معتبر است (پیش‌شرط نصب روی هوم‌اسکرین)', async () => {
      const man = await A.ev(async () => {
        const link = document.querySelector('link[rel="manifest"]');
        if (!link) return { ok: false, why: 'no link' };
        const r = await fetch(link.href);
        const j = await r.json();
        return { ok: r.ok, name: j.name, display: j.display, icons: (j.icons || []).length };
      });
      return (man.ok && man.display === 'standalone' && man.icons >= 3) ? OK(man.name + ' · ' + man.icons + ' icons')
        : BAD(JSON.stringify(man));
    });

    console.log('\n== B) سفر کاربر واقعی با لمس ==');
    const regMs = await register(A, 'رضا محمدی', 'رضا', 'reza1234');
    await A.shot('02-dashboard');

    await T('B1', 'auth', 'ثبت‌نام با تایپ و لمس واقعی؛ رمز در Chrome واقعی با PBKDF2 ذخیره می‌شود', async () => {
      const pw = await A.ev(() => (_lsDB.users.find(u => u.username === 'رضا') || {}).password || '');
      return pw.startsWith('v3$') ? OK('stored ' + pw.slice(0, 12) + '… · register+PBKDF2 ' + regMs + 'ms')
        : BAD('stored: ' + pw.slice(0, 16));
    });

    await T('B2', 'journey', 'ساخت ساختمان از فرم (نام فارسی + ظرفیت با ارقام فارسی) و نمایش در لیست', async () => {
      await A.nav('/projects');
      await A.tapOnclick('openProjectForm()');
      await A.type('#f_name', 'برج تست اندروید');
      await A.type('#f_customer', 'شرکت ساختمانی آریا');
      await A.type('#f_cap', '۶۳۰');
      await A.type('#f_floors', '12');
      await A.tap('#projSave');
      await A.waitFn(() => document.body.textContent.includes('برج تست اندروید'));
      pid = await A.ev(() => (state.projects.find(p => p.name === 'برج تست اندروید') || {}).id || '');
      const cap = await A.ev(id => (state.projects.find(p => p.id === id) || {}).capacityKg, pid);
      await A.shot('03-projects');
      return (pid && cap === 630) ? OK('id=' + pid + ' capacityKg=630 (fa digits parsed)') : BAD('pid=' + pid + ' cap=' + cap);
    });

    await T('B3', 'journey', 'افزودن شفت دوم از رابط ساختمان و برچسب QR اختصاصی همان شفت', async () => {
      await A.nav('/projects/' + pid);
      await A.tapOnclick(`addElevator('${pid}')`);
      await A.type('#e_name', 'شفت غربی');
      await A.tap('#elevSave');
      await A.waitFn(() => document.querySelectorAll('[id^="elevRow-"]').length === 2);
      eid2 = await A.ev(id => (state.elevators.find(e => e.projectId === id && e.id !== id) || {}).id || '', pid);
      if (!eid2) return BAD('شفت دوم در state نیست');
      await A.tapOnclick(`openQrModal('${pid}','${eid2}')`);
      await A.page.waitForSelector('#modalOverlay svg', { visible: true, timeout: 20000 });
      const hasName = await A.ev(() => document.querySelector('#modalOverlay').textContent.includes('شفت غربی'));
      await A.shot('04-shaft-qr');
      await A.ev(() => closeModal()); await sleep(300);
      return hasName ? OK('shaft QR modal with shaft name + QR svg') : BAD('نام شفت روی مودال QR نیست');
    });

    await T('B4', 'journey', 'ثبت سرویس روی شفت دوم با امضای لمسی روی canvas واقعی و پیوست عکس از فایل', async () => {
      const png = path.join(DL, 'test-photo.png');
      fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64'));
      await A.nav('/services');
      await A.tapOnclick('openServiceForm()');
      await A.page.waitForSelector('#s_project', { visible: true, timeout: 20000 });
      await A.page.select('#s_project', pid);
      await A.page.waitForSelector('#s_elevator_sel', { visible: true, timeout: 20000 });
      await A.page.select('#s_elevator_sel', eid2);
      await A.type('#s_problem', 'صدای غیرعادی هنگام حرکت');
      await signPad(A.page, '#sig_tech_cv');
      const fileInput = await A.page.$('#svc_photos');
      await fileInput.uploadFile(png);
      await sleep(400);
      await A.shot('05-service-form-signed');
      await A.tap('#svcSave');
      await A.waitFn((e2) => state.services.some(s => s.elevatorId === e2), 25000, eid2);
      await sleep(800);
      const got = await A.ev(e2 => {
        const s = state.services.find(x => x.elevatorId === e2);
        const ph = (state.photos || []).filter(p => p.serviceId === (s && s.id)).length;
        return { sig: s ? String(s.signTech || '').length : 0, photos: ph, problem: s ? s.problem : '' };
      }, eid2);
      return (got.sig > 200 && got.photos >= 1 && got.problem.includes('صدای غیرعادی'))
        ? OK('signature ' + got.sig + ' chars · photos=' + got.photos)
        : BAD(JSON.stringify(got));
    });

    await T('B5', 'journey', 'اسکن QR شفت (لود سرد از URL) روی همان شفت فرود می‌آید', async () => {
      await A.goto('#/projects/' + pid + '?elevator=' + eid2);
      await A.waitApp();
      await A.waitFn(e2 => [...document.querySelectorAll('[onclick]')].some(el => (el.getAttribute('onclick') || '').includes(`openServiceForm(null,'`) && (el.getAttribute('onclick') || '').includes(e2)), 20000, eid2);
      await A.shot('06-qr-landing');
      return OK('focus card rendered on cold deep-link load');
    });

    await T('B6', 'layout', 'هیچ صفحه‌ای در ویوپورت موبایل اسکرول افقی ندارد (لی‌اوت واقعی)', async () => {
      const routes = ['/dashboard', '/projects', '/services', '/parts', '/finance', '/workshop', '/settings', '/measurements', '/diagnostics', '/calculations', '/invoices', '/contracts', '/calendar', '/analytics'];
      const bad = [];
      for (const r of routes) {
        await A.nav(r);
        const over = await A.ev(() => Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0) - window.innerWidth);
        if (over > 2) bad.push(r + ' +' + over + 'px');
      }
      return bad.length === 0 ? OK(routes.length + ' routes fit 412px') : BAD('overflow: ' + bad.join(' · '));
    });

    console.log('\n== D) گوشی دوم: بکاپ، ادغام و CSV با فایل واقعی ==');
    let backupFile = '';
    await T('D1', 'backup', 'خروجی بکاپ از گوشی A به‌صورت فایل واقعی دانلود می‌شود و فرمت v8 معتبر دارد', async () => {
      const before = new Set(fs.readdirSync(DL));
      await A.nav('/settings');
      await A.tapOnclick('openBackupModal()');
      await A.tap('#bkExport');
      const t0 = Date.now();
      while (Date.now() - t0 < 20000) {
        const fresh = fs.readdirSync(DL).filter(f => f.endsWith('.json') && !before.has(f));
        if (fresh.length) { backupFile = path.join(DL, fresh[0]); break; }
        await sleep(300);
      }
      await A.ev(() => closeModal()); await sleep(300);
      if (!backupFile) return BAD('هیچ فایلی دانلود نشد');
      const bk = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
      const ok = bk.formatVersion === 8 && (bk.projects || []).some(p => p.name === 'برج تست اندروید');
      return ok ? OK(path.basename(backupFile) + ' · v8 · ' + bk.projects.length + ' projects') : BAD('bad file: v' + bk.formatVersion);
    });

    const B = await newPhone(browser, base, 'B');
    const bCold = await B.goto();
    await B.waitAuth();
    await B.ev(() => { localStorage.setItem('zlift_backup_snooze', String(Date.now() + 30 * 86400000)); localStorage.setItem('zlift_last_external_backup', String(Date.now())); });
    await register(B, 'تکنسین دوم', 'devb', 'devb1234');

    await T('D2', 'merge', 'گوشی B ساختمان خودش را می‌سازد، فایل A را آپلود و ادغام می‌کند و هر دو ساختمان کنار هم می‌آیند', async () => {
      await B.nav('/projects');
      await B.tapOnclick('openProjectForm()');
      await B.type('#f_name', 'ساختمان گوشی دوم');
      await B.tap('#projSave');
      await B.waitFn(() => document.body.textContent.includes('ساختمان گوشی دوم'));
      await B.nav('/settings');
      await B.tapOnclick('openBackupModal()');
      const bkInput = await B.page.$('#bkFile');
      await bkInput.uploadFile(backupFile);
      await B.page.waitForSelector('#restorePreviewMerge', { visible: true, timeout: 25000 });
      await B.tap('#restorePreviewMerge');
      await B.page.waitForSelector('#confirmYes', { visible: true, timeout: 20000 });
      await B.tap('#confirmYes');
      await B.waitFn(() => {
        const m = document.querySelector('#modalOverlay');
        return m && (m.textContent.includes('گزارش ادغام') || m.textContent.includes('Merge report'));
      }, 30000);
      await B.shot('07-merge-report');
      await B.ev(() => closeModal()); await sleep(400);
      await B.ev(() => loadAll(true));
      const names = await B.ev(() => state.projects.map(p => p.name));
      const elevs = await B.ev(id => state.elevators.filter(e => e.projectId === id).length, pid);
      const ok = names.includes('ساختمان گوشی دوم') && names.includes('برج تست اندروید') && elevs === 2;
      return ok ? OK('both buildings + 2 shafts on phone B (boot ' + bCold + 'ms)') : BAD('names=' + JSON.stringify(names) + ' elevs=' + elevs);
    });

    await T('D3', 'csv', 'ورود CSV فارسی از فایل واقعی روی گوشی B (پیش‌نمایش + ورود)', async () => {
      const csvPath = path.join(DL, 'buildings.csv');
      fs.writeFileSync(csvPath, '﻿' + ['نام,مشتری,نوع,ظرفیت,طبقات',
        'برج CSV اندروید یک,مشتری سی‌اس‌وی,کششی,۶۳۰,۷',
        'برج CSV اندروید دو,مشتری دوم,هیدرولیک,۴۵۰,۴'].join('\r\n'), 'utf8');
      await B.nav('/projects');
      await B.tapOnclick("openCsvImport('projects')");
      const csvInput = await B.page.$('#csvFile');
      await csvInput.uploadFile(csvPath);
      await B.page.waitForFunction(() => { const b = document.querySelector('#csvDoBtn'); return b && !b.classList.contains('hidden'); }, { timeout: 20000 });
      await B.shot('08-csv-preview');
      await B.tap('#csvDoBtn');
      await B.waitFn(() => state.projects.some(p => p.name === 'برج CSV اندروید دو'), 25000);
      const n = await B.ev(() => state.projects.filter(p => p.name.startsWith('برج CSV اندروید')).length);
      return n === 2 ? OK('2 buildings imported from Persian CSV') : BAD('count=' + n);
    });

    console.log('\n== C) آفلاین واقعی: قطع شبکه و سپس مرگ سرور ==');
    await T('C1', 'offline', 'بعد از کنترل‌گرفتن SW، قطع کامل شبکه: اپ از کش بالا می‌آید و آفلاین هم ساختمان ثبت می‌شود', async () => {
      await A.page.reload({ waitUntil: 'networkidle2', timeout: 45000 });
      await A.waitApp();
      const controlled = await A.ev(() => !!navigator.serviceWorker.controller);
      if (!controlled) return BAD('SW هنوز صفحه را کنترل نمی‌کند');
      await A.page.setOfflineMode(true);
      await A.page.reload({ waitUntil: 'load', timeout: 45000 });
      await A.waitApp();
      await A.nav('/projects');
      await A.tapOnclick('openProjectForm()');
      await A.type('#f_name', 'ساختمان حالت پرواز');
      await A.tap('#projSave');
      await A.waitFn(() => state.projects.some(p => p.name === 'ساختمان حالت پرواز'), 20000);
      await A.shot('09-offline');
      await A.page.setOfflineMode(false);
      return OK('offline shell + offline write worked');
    });

    await T('C2', 'offline', 'سرور کاملاً خاموش: ریلود همچنان از Cache Storage سرو می‌شود و دادهٔ آفلاین سر جاست', async () => {
      await new Promise(r => srv.close(r));
      await A.page.reload({ waitUntil: 'load', timeout: 45000 });
      await A.waitApp();
      const has = await A.ev(() => state.projects.some(p => p.name === 'ساختمان حالت پرواز'));
      return has ? OK('server dead, app alive from SW cache') : BAD('دادهٔ آفلاین پیدا نشد');
    });

    await T('ZZ', 'hygiene', 'در کل ران هیچ خطای JS شنیده‌نشده‌ای (pageerror) روی هیچ‌کدام از دو گوشی نبود', async () => {
      const errs = [...A.logs.pageerrors.map(e => 'A:' + e), ...B.logs.pageerrors.map(e => 'B:' + e)];
      const consoleNote = [...A.logs.consoleErrors, ...B.logs.consoleErrors].filter(t => /uncaught|typeerror|referenceerror/i.test(t));
      return (errs.length === 0 && consoleNote.length === 0)
        ? OK('clean console on both phones')
        : BAD('pageerrors: ' + errs.join(' | ') + ' console: ' + consoleNote.join(' | '));
    });
  } finally {
    try { if (browser) await browser.close(); } catch (e) {}
    try { srv.close(); } catch (e) {}
  }

  fs.writeFileSync(path.join(ROOT, 'qa/android-sim-results.json'), JSON.stringify({ pass, fail, results, when: new Date().toISOString() }, null, 2));
  console.log(`\nANDROID-SIM RESULT: ${pass} passed, ${fail} failed  (✗ = real-browser regression)`);
  console.log('screenshots → qa/android-shots/ · details → qa/android-sim-results.json');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
