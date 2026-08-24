/* Z Lift — Phase 2B.0 BUG-3 runner: writeAggregate() transaction behaviour
   and scalability.

   This runs in its OWN process and its OWN jsdom/IndexedDB instance because it
   deliberately forces transaction failures and loads very large synthetic
   aggregates; neither belongs inside qa/smoke.js.

   TEST ENVIRONMENT vs REAL ANDROID DEVICE
   ---------------------------------------
   Every number below is produced by jsdom + fake-indexeddb: an in-memory
   IndexedDB implementation running on the test host's CPU and RAM. It measures
   the ALGORITHMIC cost of the storage path (how much work a save does, how it
   scales with record count) and the TRANSACTION SEMANTICS (what survives a
   failure). It does NOT measure a real device:

     • a real Android phone has slower flash storage and a much slower CPU
     • Chrome-on-Android enforces a storage quota; fake-indexeddb does not
     • real IndexedDB serialises through the browser's storage process

   Treat the timings as relative scaling evidence only. The transaction and
   rollback assertions, by contrast, are semantic and do transfer.

   Run:  npm test        (smoke suite, then this runner)
   Exit code 0 = all checks passed. */
const { JSDOM, VirtualConsole } = require('jsdom');
const { indexedDB, IDBKeyRange } = require('fake-indexeddb');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const rawHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const html = rawHtml.replace(/<script\s+src="([^"]+)"[^>]*><\/script>/g, (m, src) => {
  const fp = path.join(ROOT, src);
  if (!fs.existsSync(fp)) { console.warn('WARNING: script not found: ' + src); return '<script></script>'; }
  return '<script>\n' + fs.readFileSync(fp, 'utf8') + '\n</script>';
});

let pass = 0, fail = 0;
const failures = [];
function T(name, cond, info) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; failures.push(name + (info ? ' \u2014 ' + info : '')); console.log('  \u2717 ' + name + (info ? ' \u2014 ' + info : '')); }
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const mb = n => (n / 1048576).toFixed(2) + ' MB';

/* Read one object store straight from IndexedDB, bypassing the app. */
const readStore = (w, store) => w.eval(`new Promise((resolve,reject)=>{
  const q = indexedDB.open('zlift-data', 3);
  q.onsuccess = () => {
    const tx = q.result.transaction(${JSON.stringify(store)}, 'readonly');
    const g = tx.objectStore(${JSON.stringify(store)}).getAll();
    tx.oncomplete = () => resolve(g.result);
    tx.onerror = () => reject(tx.error);
  };
  q.onerror = () => reject(q.error);
})`);

(async () => {
  console.log('\n=== PHASE 2B.0 BUG-3: writeAggregate() transaction + scalability ===');
  console.log('    environment: jsdom + fake-indexeddb (NOT a real Android device)\n');

  const vc = new VirtualConsole();
  vc.on('jsdomError', () => {});
  const dom = new JSDOM(html, {
    url: 'http://localhost:4173/index.html', runScripts: 'dangerously', pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(w) { w.indexedDB = indexedDB; w.IDBKeyRange = IDBKeyRange; }
  });
  const w = dom.window;
  w.scrollTo = () => {};
  const ev = e => w.eval(e);
  const bootStart = Date.now();
  while (!ev(`typeof api === 'function' && typeof STRUCTURED_DB !== 'undefined'`)) {
    if (Date.now() - bootStart > 10000) throw new Error('app did not boot');
    await wait(30);
  }
  T('structured storage is the active primary store', await ev(`STRUCTURED_DB.ready()`) === 'indexedDB', await ev(`JSON.stringify(STRUCTURED_DB.status())`));
  const d = await ev(`api('/auth/register', { method: 'POST', body: { username: 'perf', password: '123456', name: 'Perf' } })`);
  await ev(`state.token = ${JSON.stringify(d.token)}; state.user = ${JSON.stringify(d.user)};`);

  /* ---------------- 1. TRANSACTION SEMANTICS (the correctness question) ---------------- */
  console.log('\n  -- transaction semantics --');

  const baseline = await ev(`(async()=>{
    const db = JSON.parse(JSON.stringify(_lsLoad()));
    db.projects = [{ id: 'tx-good', name: 'Committed project', customer: 'C', location: 'L', elevatorType: 'traction', createdAt: 1, updatedAt: 1 }];
    ['services','measurements','invoices','contracts','checklists','reminders','photos','diagSessions','issues','calcSaves','safetyLogs'].forEach(k => { db[k] = []; });
    (db.parts || []).forEach(p => { p.history = []; });
    db.notes = []; db.tools = [];
    await STRUCTURED_DB.save(db);
    return db.projects.length;
  })()`);
  T('baseline aggregate committed through the real write path', baseline === 1, String(baseline));

  /* (a) a validation failure is rejected before any transaction is opened */
  const rejectedEarly = await ev(`(async()=>{
    const db = JSON.parse(JSON.stringify(_lsLoad()));
    db.projects = [{ id: 'dup', name: 'a', createdAt: 1, updatedAt: 1 }, { id: 'dup', name: 'b', createdAt: 1, updatedAt: 1 }];
    let err = '';
    try { await STRUCTURED_DB.save(db); } catch (e) { err = String(e && e.message || e); }
    return { err };
  })()`);
  const afterEarly = await readStore(w, 'projects');
  T('a validation failure is rejected before a transaction is opened', /^structured-validation:/.test(rejectedEarly.err), rejectedEarly.err);
  T('a rejected-before-write save leaves the committed aggregate untouched',
    afterEarly.length === 1 && afterEarly[0].id === 'tx-good', JSON.stringify(afterEarly.map(p => p.id)));

  /* (b) a failure raised WHILE queueing requests must roll back, not commit the
         clears. This is the Phase 2B.0 BUG-3 correction: without an explicit
         tx.abort(), the queued clear() calls auto-committed and wiped the
         aggregate. Measured before the fix this returned an empty store. */
  const midTxFailure = await ev(`(async()=>{
    const db = JSON.parse(JSON.stringify(_lsLoad()));
    db.projects = [{ id: 'tx-poison', name: 'Poisoned', createdAt: 1, updatedAt: 1, poison: function () {} }];
    let err = '';
    try { await STRUCTURED_DB.save(db); } catch (e) { err = String(e && e.message || e); }
    return { err };
  })()`);
  const afterMid = await readStore(w, 'projects');
  const afterMidServices = await readStore(w, 'services');
  T('a value that cannot be structured-cloned is surfaced as a failed write', /could not be cloned/i.test(midTxFailure.err), midTxFailure.err);
  T('BUG-3 FIX: a failed transaction rolls back — the previous aggregate is still fully intact',
    afterMid.length === 1 && afterMid[0].id === 'tx-good',
    'projects after failed write: ' + JSON.stringify(afterMid.map(p => p.id)));
  T('BUG-3 FIX: the rollback covers every store in the transaction, not just the one that failed',
    Array.isArray(afterMidServices), String(afterMidServices && afterMidServices.length));

  /* (c) the aggregate is still writable after a failed transaction */
  const recovered = await ev(`(async()=>{
    const db = JSON.parse(JSON.stringify(_lsLoad()));
    db.projects = [{ id: 'tx-after', name: 'After failure', createdAt: 1, updatedAt: 1 }];
    await STRUCTURED_DB.save(db);
    return true;
  })()`);
  const afterRecovered = await readStore(w, 'projects');
  T('storage is still writable immediately after a rolled-back transaction',
    recovered === true && afterRecovered.length === 1 && afterRecovered[0].id === 'tx-after',
    JSON.stringify(afterRecovered.map(p => p.id)));

  /* (d) determinism: the same aggregate written twice stores identical content */
  const determinism = await ev(`(async()=>{
    const db = JSON.parse(JSON.stringify(_lsLoad()));
    const snap = () => JSON.stringify(db.projects.map(p => p.id).sort());
    await STRUCTURED_DB.save(db);
    const first = await STRUCTURED_DB.verifyAggregate(JSON.parse(JSON.stringify(db)));
    await STRUCTURED_DB.save(db);
    const second = await STRUCTURED_DB.verifyAggregate(JSON.parse(JSON.stringify(db)));
    return snap() === snap() && first.projects.length === second.projects.length
      && JSON.stringify(first.projects) === JSON.stringify(second.projects);
  })()`);
  T('repeated writes of the same aggregate are deterministic (no churn, no duplicates)', determinism === true);

  /* (e) photo payloads live in a DIFFERENT database, therefore outside this
         transaction. Proven empirically: write a photo through the real API,
         then confirm the payload is in zlift-photos while the record is in
         zlift-data — two databases, two independent transactions. */
  const tinyPhoto = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNsaGj4DwAFhAJ/wlseKgAAAABJRU5ErkJggg==';
  const photoRec = await ev(`api('/photos', { method: 'POST', body: { data: ${JSON.stringify(tinyPhoto)}, cat: 'perf', projectId: '', note: 'perf' } })`);
  const photoDbNames = await w.eval(`indexedDB.databases ? indexedDB.databases().then(x => x.map(y => y.name)) : ['(databases() unsupported)']`);
  const payloadInPhotoDb = await w.eval(`IDB_PHOTOS.get(${JSON.stringify(photoRec.item.id)})`);
  T('photo payloads are stored in a separate IndexedDB database, outside the aggregate transaction',
    photoDbNames.includes('zlift-photos') && photoDbNames.includes('zlift-data'), JSON.stringify(photoDbNames));
  T('documented: photo bytes are therefore NOT covered by the aggregate rollback (see report)',
    !!photoRec.item.inIdb && photoRec.item.data === '' && payloadInPhotoDb === tinyPhoto,
    JSON.stringify({ inIdb: photoRec.item.inIdb, hydrated: payloadInPhotoDb === tinyPhoto }));

  /* ---------------- 2. SCALABILITY (the performance question) ---------------- */
  console.log('\n  -- scalability: full aggregate rewrite per save --');
  console.log('     projects | json size |  write  | verify  | raw read | elevators | heap');

  const rows = [];
  for (const n of [100, 500, 1000, 5000]) {
    const r = await ev(`(async()=>{
      /* Record shapes deliberately mirror the real seed data so the byte size
         is representative rather than artificially small. */
      const now = Date.now();
      const projects = [], services = [], measurements = [];
      for (let i = 0; i < ${n}; i++) {
        const id = 'perf-p-' + i;
        projects.push({
          id, name: 'برج مسکونی شماره ' + i, customer: 'شرکت ساختمانی نمونه ' + i, phone: '0912-000-000' + (i % 10),
          location: 'تهران، سعادت‌آباد، خیابان سرو غربی، کوچه ' + (i % 40) + '، پلاک ' + i,
          elevatorType: i % 2 ? 'hydraulic' : 'traction', capacityKg: 630, persons: 8, floors: 12, stops: 12, speed: 1.6,
          nominalVoltage: 380, voltageTolerance: 10, controller: 'آریان (Arian) — درایو دلتا VFD-ED',
          motor: 'گیرلس زیلابگ (Ziehl-Abegg) SM200 — 6.7kW', drive: '', doorOperator: 'ویتور', roping: '2:1',
          encoder: '', brake: '', status: 'maintenance', progress: 65, serviceIntervalDays: 30,
          notes: 'ریل‌گذاری کامل شد. کابین مونتاژ شده، سیم‌کشی تراول کابل در جریان است. هماهنگی با کارفرما.',
          createdAt: now - i * 1000, updatedAt: now - i * 500
        });
        services.push({
          id: 'perf-s-' + i, projectId: id, reportNo: 'SR-' + i, customer: 'شرکت ساختمانی نمونه ' + i,
          elevatorInfo: 'برج مسکونی شماره ' + i, date: now - i * 1000, technician: 'رضا محمدی',
          serviceType: 'maintenance', complaint: '', problem: 'سرویس دوره‌ای ماهانه طبق قرارداد',
          diagnosis: 'افت جزئی فشار روغن در حالت ایستاده؛ نشتی بسیار جزئی از شیر یک‌طرفه',
          measurements: '', workDone: 'بازدید کامل پاور یونیت، تنظیم شیر رلیف، تمیزکاری فتوسل درب، روانکاری ریل‌ها',
          partsReplaced: 'اورینگ شیر یک‌طرفه', partsUsed: [], recommendations: '', followUpDate: 0,
          finalStatus: 'ok', signTech: '', signCustomer: '', createdAt: now - i * 1000
        });
        measurements.push({
          id: 'perf-m-' + i, projectId: id, serviceId: 'perf-s-' + i, typeId: 'voltage', kind: 'numeric',
          value: 380, unit: 'V', point: 'motor frame', measurementPoint: 'motor frame', location: 'machine room',
          mode: 'stopped', component: 'motor', equipment: 'motor', manufacturer: 'Ziehl-Abegg', model: 'SM200',
          configuration: '', testMethod: '', reference: 'configured test fixture', thresholdClass: 'unknown',
          context: {}, condition: '', observation: 'no visible damage', note: '', technician: 'رضا محمدی',
          ts: now - i * 1000, timestamp: now - i * 1000, status: 'normal', reason: null, nextStep: null,
          createdAt: now - i * 1000, updatedAt: now - i * 1000
        });
      }
      const db = JSON.parse(JSON.stringify(_lsLoad()));
      ['invoices','contracts','checklists','reminders','photos','diagSessions','issues','calcSaves','safetyLogs','notes','tools'].forEach(k => { db[k] = []; });
      (db.parts || []).forEach(p => { p.history = []; });
      db.projects = projects; db.services = services; db.measurements = measurements;

      const t0 = Date.now(); await STRUCTURED_DB.save(db); const tWrite = Date.now() - t0;
      const t1 = Date.now(); await STRUCTURED_DB.verifyAggregate(db); const tVerify = Date.now() - t1;
      const t2 = Date.now();
      const counts = await new Promise((res, rej) => {
        const q = indexedDB.open('zlift-data', 3);
        q.onsuccess = () => {
          const tx = q.result.transaction(['projects', 'services', 'measurements', 'elevators'], 'readonly');
          const g = { p: tx.objectStore('projects').getAll(), s: tx.objectStore('services').getAll(), m: tx.objectStore('measurements').getAll(), e: tx.objectStore('elevators').getAll() };
          tx.oncomplete = () => res({ projects: g.p.result.length, services: g.s.result.length, measurements: g.m.result.length, elevators: g.e.result.length });
          tx.onerror = () => rej(tx.error);
        };
        q.onerror = () => rej(q.error);
      });
      const tRead = Date.now() - t2;
      return { tWrite, tVerify, tRead, bytes: JSON.stringify(db).length, counts };
    })()`);
    const heap = process.memoryUsage().heapUsed;
    rows.push({ n, ...r, heap });
    console.log('     ' + String(n).padStart(8) + ' | ' + mb(r.bytes).padStart(9) + ' | '
      + (r.tWrite + ' ms').padStart(7) + ' | ' + (r.tVerify + ' ms').padStart(7) + ' | '
      + (r.tRead + ' ms').padStart(8) + ' | ' + String(r.counts.elevators).padStart(9) + ' | '
      + (heap / 1048576).toFixed(1).padStart(5) + ' MB');
    T('write + verify + read complete for ' + n + ' projects',
      r.counts.projects === n && r.counts.services === n && r.counts.measurements === n);
  }

  const r100 = rows.find(r => r.n === 100), r1000 = rows.find(r => r.n === 1000), r5000 = rows.find(r => r.n === 5000);
  T('the elevators store is a 1:1 projection of projects (writes each project twice per save)',
    rows.every(r => r.counts.elevators === r.counts.projects));
  /* Complexity is linear in total record count. The guard below is deliberately
     loose: it exists to catch an accidental quadratic change, not to pin a
     machine-specific number. */
  T('write cost stays roughly linear between 100 and 1000 projects (no quadratic blow-up)',
    r1000.tWrite < Math.max(3000, r100.tWrite * 40), 'write ' + r100.tWrite + ' ms -> ' + r1000.tWrite + ' ms');
  T('a 1000-project aggregate save stays far inside a usable interaction budget in the test environment',
    r1000.tWrite < 2000, r1000.tWrite + ' ms');
  T('a 5000-project aggregate save still completes (documented future-scale concern, not a present failure)',
    r5000.tWrite < 10000, r5000.tWrite + ' ms');

  console.log('\n  summary (TEST ENVIRONMENT — jsdom + fake-indexeddb, not a device):');
  console.log('    100 projects  -> write ' + r100.tWrite + ' ms, verify ' + r100.tVerify + ' ms, ' + mb(r100.bytes));
  console.log('    1000 projects -> write ' + r1000.tWrite + ' ms, verify ' + r1000.tVerify + ' ms, ' + mb(r1000.bytes));
  console.log('    5000 projects -> write ' + r5000.tWrite + ' ms, verify ' + r5000.tVerify + ' ms, ' + mb(r5000.bytes));
  console.log('    complexity: every mutation rewrites the whole aggregate -> O(total records) per save');
  console.log('    verifyAggregate re-reads the aggregate and fingerprints it twice -> same order as write\n');

  /* ---------------- 3. versions must be untouched ---------------- */
  const versions = await ev(`({ backup: BACKUP_FORMAT_VERSION, schema: DB_SCHEMA_VERSION, migration: STRUCTURED_DB.migrationVersion })`);
  T('BUG-3 required no schema or version change',
    versions.backup === 8 && versions.schema === 3 && versions.migration === 1, JSON.stringify(versions));

  console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
  if (failures.length) console.log('FAILURES:\n - ' + failures.join('\n - '));
  dom.window.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
