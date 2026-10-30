#!/usr/bin/env node
'use strict';
/* Scratch tool: photograph the boot splash mid-flight by stalling every
   .js response, so first paint (the splash) stays on screen. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium').default;

const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || '/home/user/splash.png';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function ensureLibs() {
  if (fs.existsSync('/tmp/al2023/lib/libnspr4.so')) return '/tmp/al2023/lib';
  const tar = zlib.brotliDecompressSync(fs.readFileSync(path.join(ROOT, 'node_modules/@sparticuz/chromium/bin/al2023.tar.br')));
  fs.writeFileSync('/tmp/al2023.tar', tar);
  execSync('mkdir -p /tmp/al2023 && tar -xf /tmp/al2023.tar -C /tmp/al2023');
  return '/tmp/al2023/lib';
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };

(async () => {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const fp = path.join(ROOT, p);
    if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await puppeteer.launch({
    args: [...chromium.args.filter(a => a !== '--single-process'), '--no-sandbox', '--disable-dev-shm-usage'],
    executablePath: await chromium.executablePath(),
    headless: true,
    protocolTimeout: 30000, // a wedged frame must fail fast, not hang 180s
    env: { ...process.env, LD_LIBRARY_PATH: ensureLibs() }
  });
  try {
    const page = await browser.newPage();
    await page.emulate({
      viewport: { width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, isLandscape: false },
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
    });
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    /* Freeze the splash loops from the very start (the app's own
       prefers-reduced-motion CSS stops them): on this GPU-less headless
       build, captureScreenshot never receives a compositor frame while
       the infinite glow/bar animations repaint. A still photo cannot
       show motion anyway — layout, glow, bar and stamp all read fine. */
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }).catch(() => {});
    /* Stall every module script so first paint (the splash) stays up — the
       proven way to photograph a screen that normally lives <1s, and the
       only capture this GPU-less headless build reliably produces while
       the splash's own animations exist (they are frozen anyway above).
       The version stamp is JS-driven, so it stays empty in this still;
       on a real boot hideBootSplash fills it in just before the fade. */
    await page.setRequestInterception(true);
    page.on('request', async r => {
      if (r.url().endsWith('.js')) await sleep(2500);
      r.continue().catch(() => {});
    });
    page.goto(base + '/index.html', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await sleep(1100); // first paint settled; boot still stalled on scripts
    await page.screenshot({ path: OUT });
    const ver = '(version stamp appears on real boot)';
    console.log('splash shot → ' + OUT + '  ·  stamped: ' + JSON.stringify(ver));
  } finally {
    await browser.close().catch(() => {});
    srv.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
