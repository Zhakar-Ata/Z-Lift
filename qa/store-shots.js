#!/usr/bin/env node
'use strict';
/*
 * store-shots.js — regenerates the store/README screenshots in assets/store/.
 *
 * Unlike qa/android-sim.js (which intentionally starts from a FRESH account
 * to test the first-run experience), this tool signs in as the seeded demo
 * user `tech` so the shots show the app the way a working technician sees
 * it: due shafts on the dashboard, real buildings, a project file with its
 * elevators. Same real-Chromium Pixel 8 profile as the Android sim.
 *
 * Run after visible UI changes:  npm run shots:store
 * (Committed output is referenced by README.md and manifest.json screenshots;
 *  re-check the manifest "sizes" if the emulated device ever changes.)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium').default;

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'store');
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml'
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

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { srv, base } = await startServer();
  const browser = await puppeteer.launch({
    args: [...chromium.args.filter(a => a !== '--single-process'), '--no-sandbox', '--disable-dev-shm-usage'],
    executablePath: await chromium.executablePath(),
    headless: true,
    env: { ...process.env, LD_LIBRARY_PATH: ensureLibs() }
  });
  try {
    const page = await browser.newPage();
    await page.emulate({
      viewport: { width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, isLandscape: false },
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
    });
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Tehran' }).catch(() => {});
    const ev = (fn, ...a) => page.evaluate(fn, ...a);
    const shot = async name => { await page.screenshot({ path: path.join(OUT, name + '.png') }); console.log('  ✓ assets/store/' + name + '.png'); };
    const type = async (sel, text) => {
      await page.waitForSelector(sel, { visible: true, timeout: 20000 });
      await page.tap(sel);
      await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
      await page.keyboard.press('Backspace');
      await page.keyboard.type(text, { delay: 8 });
    };

    await page.goto(base + '/index.html', { waitUntil: 'networkidle2', timeout: 45000 });
    await page.waitForFunction(() => { const a = document.querySelector('#authView'); return a && !a.classList.contains('hidden') && !document.getElementById('bootSplash'); }, { timeout: 25000 });
    /* keep the store shots free of nag banners — same snooze the sim uses */
    await ev(() => { localStorage.setItem('zlift_backup_snooze', String(Date.now() + 30 * 86400000)); localStorage.setItem('zlift_last_external_backup', String(Date.now())); });

    console.log('signing in as demo user tech…');
    await type('#authUsername', 'tech');
    await type('#authPassword', '123456');
    await page.tap('#authSubmit');
    await page.waitForFunction(() => { const a = document.querySelector('#appView'); return a && !a.classList.contains('hidden') && !document.getElementById('bootSplash'); }, { timeout: 25000 });
    await sleep(1800);
    await ev(() => { window.scrollTo(0, 0); });
    await shot('shot-dashboard');

    await ev(() => navigate('/projects')); await sleep(900);
    await shot('shot-projects');

    /* open the first building like a user would — via its list row */
    const rowH = await page.evaluateHandle(() => [...document.querySelectorAll('[onclick]')].find(e => /navigate\('\/projects\/[^']+'\)/.test(e.getAttribute('onclick') || '')) || null);
    const row = rowH.asElement();
    if (row) {
      await row.evaluate(e => e.scrollIntoView({ block: 'center' })); await sleep(250);
      await row.tap(); await sleep(1100);
      await ev(() => { window.scrollTo(0, 0); });
      await shot('shot-project');
    } else {
      console.log('  ! no project row found — skipped shot-project');
    }
    console.log('STORE SHOTS DONE → assets/store/');
  } finally {
    await browser.close().catch(() => {});
    srv.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
