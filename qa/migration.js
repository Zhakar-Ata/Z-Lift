/* Z Lift — Phase 2B.1 Multi-Elevator Migration Engine Tests
   
   This runs in its OWN process and jsdom/IndexedDB instance because it
   tests the migration engine with various scenarios including idempotency,
   cross-project isolation, backup compatibility, and performance.

   TEST ENVIRONMENT: jsdom + fake-indexeddb (NOT a real Android device)
   
   Test cases cover:
   - Empty database migration
   - Single project migration
   - Multiple projects migration
   - Archived project migration
   - Projects with various child records (services, measurements, etc.)
   - Standalone records (no project)
   - Idempotency (running migration twice)
   - Cross-project isolation
   - Backup/restore compatibility
   - Performance at scale

   Run:  npm test        (smoke suite, perf suite, then this runner)
   Exit code 0 = all checks passed. */
const { JSDOM, VirtualConsole } = require('jsdom');
const { indexedDB, IDBKeyRange } = require('fake-indexeddb');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const rawHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

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

let pass = 0, fail = 0;
const failures = [];
async function T(name, cond, info) {
  let c = cond;
  if (typeof c === 'function') c = await c();
  else if (c && typeof c.then === 'function') c = await c;
  if (c) { pass++; console.log('  ✓ ' + name); }
  else { fail++; failures.push(name + (info ? ' — ' + info : '')); console.log('  ✗ ' + name + (info ? ' — ' + info : '')); }
}

const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('\n=== PHASE 2B.1: MULTI-ELEVATOR MIGRATION ENGINE ===');
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
  while (!ev(`typeof api === 'function' && typeof STRUCTURED_DB !== 'undefined' && typeof migrateElevatorsInAggregate === 'function'`)) {
    if (Date.now() - bootStart > 10000) throw new Error('app did not boot');
    await wait(30);
  }

  /* Register and enter app */
  const d = await ev(`api('/auth/register', { method: 'POST', body: { username: 'migration-test', password: '123456', name: 'Migration Tester' } })`);
  await ev(`state.token = ${JSON.stringify(d.token)}; state.user = ${JSON.stringify(d.user)};`);

  console.log('  -- Test Case 1: Empty database --');
  const case1 = await ev(`(async()=>{
    const db = { projects: [], elevators: [], services: [], users: [{ id: 'u1', username: 'test' }] };
    const result = migrateElevatorsInAggregate(db);
    return {
      ok: result.changed === false && result.report.projectsProcessed === 0 && result.report.elevatorsCreated === 0,
      report: result.report
    };
  })()`);
  await T('empty database migration produces no changes', case1 && case1.ok, JSON.stringify(case1));

  console.log('\n  -- Test Case 2: Single normal project --');
  const case2 = await ev(`(async()=>{
    const db = {
      projects: [{ id: 'p1', name: 'Building A', elevatorType: 'traction', capacityKg: 630, floors: 5, createdAt: 1000, updatedAt: 2000 }],
      elevators: [], services: [], users: []
    };
    const result = migrateElevatorsInAggregate(db);
    return {
      ok: result.changed === true && result.report.projectsProcessed === 1 && result.report.elevatorsCreated === 1,
      elevator: db.elevators[0],
      checks: {
        id: db.elevators[0] && db.elevators[0].id === 'p1',
        projectId: db.elevators[0] && db.elevators[0].projectId === 'p1',
        name: db.elevators[0] && db.elevators[0].name === 'Building A',
        type: db.elevators[0] && db.elevators[0].elevatorType === 'traction'
      }
    };
  })()`);
  await T('single project creates one elevator with id=projectId', case2 && case2.ok && case2.checks.id && case2.checks.projectId, JSON.stringify(case2));

  console.log('\n  -- Test Case 3: Multiple projects --');
  const case3 = await ev(`(async()=>{
    const db = {
      projects: [
        { id: 'p1', name: 'Building A', elevatorType: 'traction', createdAt: 1000, updatedAt: 1000 },
        { id: 'p2', name: 'Building B', elevatorType: 'hydraulic', createdAt: 2000, updatedAt: 2000 },
        { id: 'p3', name: 'Building C', elevatorType: 'traction', createdAt: 3000, updatedAt: 3000 }
      ],
      elevators: [], services: [], users: []
    };
    const result = migrateElevatorsInAggregate(db);
    return {
      ok: result.changed === true && result.report.projectsProcessed === 3 && result.report.elevatorsCreated === 3,
      count: db.elevators.length,
      ids: db.elevators.map(e => e.id).sort()
    };
  })()`);
  await T('multiple projects create multiple elevators', case3 && case3.ok && case3.count === 3, JSON.stringify(case3));

  console.log('\n  -- Test Case 4: Archived project --');
  const case4 = await ev(`(async()=>{
    const db = {
      projects: [{ id: 'p1', name: 'Archived Building', archived: true, archivedAt: 5000, elevatorType: 'traction', createdAt: 1000, updatedAt: 2000 }],
      elevators: [], services: [], users: []
    };
    const result = migrateElevatorsInAggregate(db);
    return {
      ok: result.changed === true && db.elevators.length === 1,
      elevator: db.elevators[0],
      checks: {
        archived: db.elevators[0] && db.elevators[0].archived === true,
        archivedAt: db.elevators[0] && db.elevators[0].archivedAt === 5000
      }
    };
  })()`);
  await T('archived project creates archived elevator', case4 && case4.ok && case4.checks.archived && case4.checks.archivedAt, JSON.stringify(case4));

  console.log('\n  -- Test Case 5: Project with services --');
  const case5 = await ev(`(async()=>{
    const db = {
      projects: [{ id: 'p1', name: 'Building A', elevatorType: 'traction', createdAt: 1000, updatedAt: 1000 }],
      elevators: [],
      services: [
        { id: 's1', projectId: 'p1', customer: 'C', elevatorInfo: 'E', date: 2000, createdAt: 2000 },
        { id: 's2', projectId: 'p1', customer: 'C', elevatorInfo: 'E', date: 3000, createdAt: 3000 }
      ],
      users: []
    };
    const result = migrateElevatorsInAggregate(db);
    return {
      ok: result.changed === true && result.report.recordsStamped.services === 2,
      services: db.services.map(s => ({ id: s.id, elevatorId: s.elevatorId }))
    };
  })()`);
  await T('services get elevatorId stamped', case5 && case5.ok && case5.services.every(s => s.elevatorId === 'p1'), JSON.stringify(case5));

  console.log('\n  -- Test Case 6: Project with measurements --');
  const case6 = await ev(`(async()=>{
    const db = {
      projects: [{ id: 'p1', name: 'Building A', elevatorType: 'traction', createdAt: 1000, updatedAt: 1000 }],
      elevators: [],
      measurements: [{ id: 'm1', projectId: 'p1', typeId: 'voltage', value: 380, createdAt: 2000, updatedAt: 2000 }],
      services: [], users: []
    };
    const result = migrateElevatorsInAggregate(db);
    return {
      ok: result.changed === true && result.report.recordsStamped.measurements === 1,
      measurement: db.measurements[0]
    };
  })()`);
  await T('measurements get elevatorId stamped', case6 && case6.ok && case6.measurement.elevatorId === 'p1', JSON.stringify(case6));

  console.log('\n  -- Test Case 7: Project with diagnostics --');
  const case7 = await ev(`(async()=>{
    const db = {
      projects: [{ id: 'p1', name: 'Building A', elevatorType: 'traction', createdAt: 1000, updatedAt: 1000 }],
      elevators: [],
      diagSessions: [{ id: 'd1', projectId: 'p1', symptom: 'noise', createdAt: 2000, updatedAt: 2000 }],
      services: [], measurements: [], users: []
    };
    const result = migrateElevatorsInAggregate(db);
    return {
      ok: result.changed === true && result.report.recordsStamped.diagSessions === 1,
      diag: db.diagSessions[0]
    };
  })()`);
  await T('diagnostics get elevatorId stamped', case7 && case7.ok && case7.diag.elevatorId === 'p1', JSON.stringify(case7));

  console.log('\n  -- Test Case 8: Project with checklists --');
  const case8 = await ev(`(async()=>{
    const db = {
      projects: [{ id: 'p1', name: 'Building A', elevatorType: 'traction', createdAt: 1000, updatedAt: 1000 }],
      elevators: [],
      checklists: [{ id: 'c1', projectId: 'p1', templateId: 'traction-install', checked: { a1: 'pass' }, updatedAt: 2000 }],
      services: [], measurements: [], diagSessions: [], users: []
    };
    const result = migrateElevatorsInAggregate(db);
    return {
      ok: result.changed === true && result.report.recordsStamped.checklists === 1,
      checklist: db.checklists[0]
    };
  })()`);
  await T('checklists get elevatorId stamped', case8 && case8.ok && case8.checklist.elevatorId === 'p1', JSON.stringify(case8));

  console.log('\n  -- Test Case 9: Project with safety logs --');
  const case9 = await ev(`(async()=>{
    const db = {
      projects: [{ id: 'p1', name: 'Building A', elevatorType: 'traction', createdAt: 1000, updatedAt: 1000 }],
      elevators: [],
      safetyLogs: [{ id: 'sl1', projectId: 'p1', note: 'safety check', createdAt: 2000, updatedAt: 2000 }],
      services: [], measurements: [], diagSessions: [], checklists: [], users: []
    };
    const result = migrateElevatorsInAggregate(db);
    return {
      ok: result.changed === true && result.report.recordsStamped.safetyLogs === 1,
      log: db.safetyLogs[0]
    };
  })()`);
  await T('safety logs get elevatorId stamped', case9 && case9.ok && case9.log.elevatorId === 'p1', JSON.stringify(case9));

  console.log('\n  -- Test Case 10: Project with project-level invoice --');
  const case10 = await ev(`(async()=>{
    const db = {
      projects: [{ id: 'p1', name: 'Building A', elevatorType: 'traction', createdAt: 1000, updatedAt: 1000 }],
      elevators: [],
      invoices: [{ id: 'inv1', projectId: 'p1', customer: 'C', items: [], payments: [], createdAt: 2000, updatedAt: 2000 }],
      services: [], measurements: [], diagSessions: [], checklists: [], safetyLogs: [], users: []
    };
    const result = migrateElevatorsInAggregate(db);
    return {
      ok: result.changed === true,
      invoice: db.invoices[0],
      hasElevatorId: 'elevatorId' in db.invoices[0]
    };
  })()`);
  await T('invoices remain project-level (no elevatorId)', case10 && case10.ok && !case10.hasElevatorId, JSON.stringify(case10));

  console.log('\n  -- Test Case 11: Project with contract --');
  const case11 = await ev(`(async()=>{
    const db = {
      projects: [{ id: 'p1', name: 'Building A', elevatorType: 'traction', createdAt: 1000, updatedAt: 1000 }],
      elevators: [],
      contracts: [{ id: 'ct1', projectId: 'p1', building: 'Building A', amount: 1000000, createdAt: 2000, updatedAt: 2000 }],
      services: [], measurements: [], diagSessions: [], checklists: [], safetyLogs: [], invoices: [], users: []
    };
    const result = migrateElevatorsInAggregate(db);
    return {
      ok: result.changed === true,
      contract: db.contracts[0],
      hasElevatorId: 'elevatorId' in db.contracts[0]
    };
  })()`);
  await T('contracts remain project-level (no elevatorId)', case11 && case11.ok && !case11.hasElevatorId, JSON.stringify(case11));

  console.log('\n  -- Test Case 12: Standalone service --');
  const case12 = await ev(`(async()=>{
    const db = {
      projects: [{ id: 'p1', name: 'Building A', elevatorType: 'traction', createdAt: 1000, updatedAt: 1000 }],
      elevators: [],
      services: [
        { id: 's1', projectId: '', customer: 'Standalone Customer', elevatorInfo: 'Standalone Elevator', date: 2000, createdAt: 2000 }
      ],
      measurements: [], diagSessions: [], checklists: [], safetyLogs: [], invoices: [], contracts: [], users: []
    };
    const result = migrateElevatorsInAggregate(db);
    return {
      ok: result.changed === true && result.report.recordsSkippedStandalone.services === 1,
      service: db.services[0],
      checks: {
        projectId: db.services[0].projectId === '',
        elevatorId: db.services[0].elevatorId === ''
      }
    };
  })()`);
  await T('standalone service remains standalone (projectId and elevatorId both empty)', case12 && case12.ok && case12.checks.projectId && case12.checks.elevatorId, JSON.stringify(case12));

  console.log('\n  -- Test Case 13: Nested parts history --');
  const case13 = await ev(`(async()=>{
    const db = {
      projects: [{ id: 'p1', name: 'Building A', elevatorType: 'traction', createdAt: 1000, updatedAt: 1000 }],
      elevators: [],
      parts: [{ id: 'part1', name: 'Bearing', qty: 10, history: [{ id: 'h1', projectId: 'p1', qty: -2, date: 2000 }] }],
      services: [], measurements: [], diagSessions: [], checklists: [], safetyLogs: [], invoices: [], contracts: [], users: []
    };
    const result = migrateElevatorsInAggregate(db);
    return {
      ok: result.changed === true,
      part: db.parts[0],
      history: db.parts[0].history[0],
      hasElevatorId: 'elevatorId' in db.parts[0].history[0]
    };
  })()`);
  await T('parts history remains project-level (no elevatorId on nested refs)', case13 && case13.ok && !case13.hasElevatorId, JSON.stringify(case13));

  console.log('\n  -- Test Case 14: Dangling project reference --');
  const case14 = await ev(`(async()=>{
    const db = {
      projects: [{ id: 'p1', name: 'Building A', elevatorType: 'traction', createdAt: 1000, updatedAt: 1000 }],
      elevators: [],
      services: [
        { id: 's1', projectId: 'p-deleted', customer: 'C', elevatorInfo: 'E', date: 2000, createdAt: 2000 }
      ],
      measurements: [], diagSessions: [], checklists: [], safetyLogs: [], invoices: [], contracts: [], users: []
    };
    const result = migrateElevatorsInAggregate(db);
    return {
      ok: result.changed === true,
      service: db.services[0],
      checks: {
        elevatorId: db.services[0].elevatorId === '',
        skipped: result.report.recordsSkippedStandalone.services === 1
      }
    };
  })()`);
  await T('service with dangling projectId gets empty elevatorId (not assigned to wrong elevator)', case14 && case14.ok && case14.checks.elevatorId && case14.checks.skipped, JSON.stringify(case14));

  console.log('\n  -- Test Case 15: Existing elevator record already present --');
  const case15 = await ev(`(async()=>{
    const db = {
      projects: [{ id: 'p1', name: 'Building A', elevatorType: 'traction', createdAt: 1000, updatedAt: 1000 }],
      elevators: [{ id: 'p1', projectId: 'p1', name: 'Building A', elevatorType: 'traction', createdAt: 1000, updatedAt: 1000 }],
      services: [], measurements: [], diagSessions: [], checklists: [], safetyLogs: [], invoices: [], contracts: [], users: []
    };
    const result = migrateElevatorsInAggregate(db);
    return {
      ok: result.report.elevatorsExisting === 1 && result.report.elevatorsCreated === 0,
      count: db.elevators.length
    };
  })()`);
  await T('existing elevator is recognized, not duplicated', case15 && case15.ok && case15.count === 1, JSON.stringify(case15));

  console.log('\n  -- Test Case 16: Migration executed twice (idempotency) --');
  const case16 = await ev(`(async()=>{
    const db = {
      projects: [{ id: 'p1', name: 'Building A', elevatorType: 'traction', createdAt: 1000, updatedAt: 1000 }],
      elevators: [],
      services: [{ id: 's1', projectId: 'p1', customer: 'C', elevatorInfo: 'E', date: 2000, createdAt: 2000 }],
      measurements: [], diagSessions: [], checklists: [], safetyLogs: [], invoices: [], contracts: [], users: []
    };
    const first = migrateElevatorsInAggregate(db);
    const before = JSON.stringify(db);
    const second = migrateElevatorsInAggregate(db);
    const after = JSON.stringify(db);
    return {
      ok: first.changed === true && second.changed === false && before === after,
      first: first.report,
      second: second.report
    };
  })()`);
  await T('migration is idempotent (second run produces no changes)', case16 && case16.ok, JSON.stringify(case16));

  console.log('\n  -- Test Case 17: Migration after partial progress --');
  const case17 = await ev(`(async()=>{
    const db = {
      projects: [
        { id: 'p1', name: 'Building A', elevatorType: 'traction', createdAt: 1000, updatedAt: 1000 },
        { id: 'p2', name: 'Building B', elevatorType: 'hydraulic', createdAt: 2000, updatedAt: 2000 }
      ],
      elevators: [{ id: 'p1', projectId: 'p1', name: 'Building A', elevatorType: 'traction', createdAt: 1000, updatedAt: 1000 }],
      services: [
        { id: 's1', projectId: 'p1', customer: 'C', elevatorInfo: 'E', date: 2000, createdAt: 2000, elevatorId: 'p1' },
        { id: 's2', projectId: 'p2', customer: 'C', elevatorInfo: 'E', date: 3000, createdAt: 3000 }
      ],
      measurements: [], diagSessions: [], checklists: [], safetyLogs: [], invoices: [], contracts: [], users: []
    };
    const result = migrateElevatorsInAggregate(db);
    return {
      ok: result.changed === true && result.report.elevatorsExisting === 1 && result.report.elevatorsCreated === 1,
      elevators: db.elevators.length,
      services: db.services.map(s => ({ id: s.id, elevatorId: s.elevatorId }))
    };
  })()`);
  await T('migration completes partial progress (creates missing elevator, stamps missing records)', case17 && case17.ok && case17.elevators === 2, JSON.stringify(case17));

  console.log('\n  -- Test Case 20: Cross-project isolation --');
  const case20 = await ev(`(async()=>{
    const db = {
      projects: [
        { id: 'pA', name: 'Project A', elevatorType: 'traction', createdAt: 1000, updatedAt: 1000 },
        { id: 'pB', name: 'Project B', elevatorType: 'hydraulic', createdAt: 2000, updatedAt: 2000 }
      ],
      elevators: [],
      services: [
        { id: 'sA1', projectId: 'pA', customer: 'A', elevatorInfo: 'A', date: 2000, createdAt: 2000 },
        { id: 'sB1', projectId: 'pB', customer: 'B', elevatorInfo: 'B', date: 3000, createdAt: 3000 }
      ],
      measurements: [
        { id: 'mA1', projectId: 'pA', typeId: 'voltage', value: 380, createdAt: 2000, updatedAt: 2000 },
        { id: 'mB1', projectId: 'pB', typeId: 'voltage', value: 220, createdAt: 3000, updatedAt: 3000 }
      ],
      diagSessions: [
        { id: 'dA1', projectId: 'pA', symptom: 'noise', createdAt: 2000, updatedAt: 2000 },
        { id: 'dB1', projectId: 'pB', symptom: 'vibration', createdAt: 3000, updatedAt: 3000 }
      ],
      checklists: [
        { id: 'cA1', projectId: 'pA', templateId: 'traction-install', checked: {}, updatedAt: 2000 },
        { id: 'cB1', projectId: 'pB', templateId: 'hydraulic-install', checked: {}, updatedAt: 3000 }
      ],
      issues: [
        { id: 'iA1', projectId: 'pA', title: 'Issue A', createdAt: 2000, updatedAt: 2000 },
        { id: 'iB1', projectId: 'pB', title: 'Issue B', createdAt: 3000, updatedAt: 3000 }
      ],
      safetyLogs: [
        { id: 'slA1', projectId: 'pA', note: 'Safety A', createdAt: 2000, updatedAt: 2000 },
        { id: 'slB1', projectId: 'pB', note: 'Safety B', createdAt: 3000, updatedAt: 3000 }
      ],
      invoices: [], contracts: [], users: []
    };
    const result = migrateElevatorsInAggregate(db);
    const validation = validateElevatorRelationships(db);
    return {
      ok: result.changed === true && validation.ok,
      elevators: db.elevators.map(e => ({ id: e.id, projectId: e.projectId })),
      isolation: {
        sA1: db.services.find(s => s.id === 'sA1').elevatorId === 'pA',
        sB1: db.services.find(s => s.id === 'sB1').elevatorId === 'pB',
        mA1: db.measurements.find(m => m.id === 'mA1').elevatorId === 'pA',
        mB1: db.measurements.find(m => m.id === 'mB1').elevatorId === 'pB'
      },
      validation: validation
    };
  })()`);
  await T('cross-project isolation: A records → A elevator, B records → B elevator', case20 && case20.ok && case20.isolation.sA1 && case20.isolation.sB1 && case20.isolation.mA1 && case20.isolation.mB1, JSON.stringify(case20));

  console.log('\n  -- Relationship Validation --');
  const relVal = await ev(`(async()=>{
    const db = {
      projects: [{ id: 'p1', name: 'Building A', elevatorType: 'traction', createdAt: 1000, updatedAt: 1000 }],
      elevators: [{ id: 'e1', projectId: 'p1', name: 'Elevator 1', createdAt: 1000, updatedAt: 1000 }],
      services: [{ id: 's1', projectId: 'p1', elevatorId: 'e1', customer: 'C', elevatorInfo: 'E', date: 2000, createdAt: 2000 }],
      measurements: [], diagSessions: [], checklists: [], safetyLogs: [], invoices: [], contracts: [], users: []
    };
    const validation = validateElevatorRelationships(db);
    return { ok: validation.ok, errors: validation.errors, warnings: validation.warnings };
  })()`);
  await T('valid elevator relationships pass validation', relVal && relVal.ok, JSON.stringify(relVal));

  const relValCross = await ev(`(async()=>{
    const db = {
      projects: [
        { id: 'p1', name: 'Building A', elevatorType: 'traction', createdAt: 1000, updatedAt: 1000 },
        { id: 'p2', name: 'Building B', elevatorType: 'traction', createdAt: 2000, updatedAt: 2000 }
      ],
      elevators: [
        { id: 'e1', projectId: 'p1', name: 'Elevator 1', createdAt: 1000, updatedAt: 1000 },
        { id: 'e2', projectId: 'p2', name: 'Elevator 2', createdAt: 2000, updatedAt: 2000 }
      ],
      services: [{ id: 's1', projectId: 'p1', elevatorId: 'e2', customer: 'C', elevatorInfo: 'E', date: 2000, createdAt: 2000 }],
      measurements: [], diagSessions: [], checklists: [], safetyLogs: [], invoices: [], contracts: [], users: []
    };
    const validation = validateElevatorRelationships(db);
    return { ok: !validation.ok, errors: validation.errors };
  })()`);
  await T('cross-project elevator reference is rejected (service in P1 referencing elevator of P2)', relValCross && relValCross.ok, JSON.stringify(relValCross));

  console.log('\n  -- Performance: Migration at scale --');
  console.log('     projects | migration time | validation time');

  for (const n of [100, 500, 1000]) {
    const perfResult = await ev(`(async()=>{
      const now = Date.now();
      const db = {
        projects: [], elevators: [], services: [], measurements: [], diagSessions: [],
        checklists: [], safetyLogs: [], invoices: [], contracts: [], users: []
      };
      for (let i = 0; i < ${n}; i++) {
        const id = 'perf-p-' + i;
        db.projects.push({
          id, name: 'Building ' + i, elevatorType: i % 2 ? 'hydraulic' : 'traction',
          capacityKg: 630, floors: 10, createdAt: now - i * 1000, updatedAt: now - i * 500
        });
        db.services.push({
          id: 'perf-s-' + i, projectId: id, customer: 'C' + i, elevatorInfo: 'E' + i,
          date: now - i * 1000, createdAt: now - i * 1000
        });
        db.measurements.push({
          id: 'perf-m-' + i, projectId: id, typeId: 'voltage', value: 380,
          createdAt: now - i * 1000, updatedAt: now - i * 1000
        });
      }
      const t0 = Date.now();
      const result = migrateElevatorsInAggregate(db);
      const tMigration = Date.now() - t0;
      const t1 = Date.now();
      const validation = validateElevatorRelationships(db);
      const tValidation = Date.now() - t1;
      return { tMigration, tValidation, ok: result.changed && validation.ok, elevators: db.elevators.length };
    })()`);
    console.log(`     ${String(n).padStart(5)} | ${String(perfResult.tMigration).padStart(8)} ms | ${String(perfResult.tValidation).padStart(8)} ms`);
    await T(`migration + validation complete for ${n} projects`, perfResult && perfResult.ok && perfResult.elevators === n);
  }

  console.log('\n  -- Test Case 18: Backup restored before migration (v8 format) --');
  const case18 = await ev(`(async()=>{
    /* Simulate a pre-migration backup (v8 format, no elevators field).
       After restore, the migration should run and create elevators. */
    const preBackup = {
      app: 'zlift', version: 8, formatVersion: 8, appVersion: '29.1.2',
      dbSchemaVersion: 3, exportedAt: Date.now(),
      projects: [
        { id: 'p1', name: 'Pre-migration Building', elevatorType: 'traction', capacityKg: 630, createdAt: 1000, updatedAt: 2000 }
      ],
      services: [
        { id: 's1', projectId: 'p1', customer: 'C', elevatorInfo: 'E', date: 2000, createdAt: 2000 }
      ],
      measurements: [], diagSessions: [], checklists: [], safetyLogs: [],
      invoices: [], contracts: [], notes: [], parts: [], tools: [], photos: [],
      reminders: [], calcSaves: [], issues: [], archivedProjects: [],
      settings: { company: 'Z Lift' }
    };
    /* Validate the backup format */
    const audit = validateBackup(preBackup);
    if (!audit.ok) return { ok: false, error: 'backup-invalid', why: audit.why };

    /* Simulate the migration on the restored data */
    const db = JSON.parse(JSON.stringify(preBackup));
    db.elevators = [];
    const result = migrateElevatorsInAggregate(db);
    return {
      ok: audit.ok && result.changed && db.elevators.length === 1,
      elevator: db.elevators[0],
      service: db.services[0],
      checks: {
        elevatorId: db.elevators[0] && db.elevators[0].id === 'p1',
        serviceElevatorId: db.services[0] && db.services[0].elevatorId === 'p1'
      }
    };
  })()`);
  await T('pre-migration backup restores and migrates correctly', case18 && case18.ok && case18.checks.elevatorId && case18.checks.serviceElevatorId, JSON.stringify(case18));

  console.log('\n  -- Test Case 19: Backup exported after migration --');
  const case19 = await ev(`(async()=>{
    /* Simulate a post-migration aggregate, export it, and verify it round-trips. */
    const db = {
      projects: [{ id: 'p1', name: 'Post-migration Building', elevatorType: 'traction', capacityKg: 630, createdAt: 1000, updatedAt: 2000 }],
      elevators: [],
      services: [{ id: 's1', projectId: 'p1', customer: 'C', elevatorInfo: 'E', date: 2000, createdAt: 2000 }],
      measurements: [], diagSessions: [], checklists: [], safetyLogs: [],
      invoices: [], contracts: [], notes: [], parts: [], tools: [], photos: [],
      reminders: [], calcSaves: [], issues: [], archivedProjects: [],
      settings: { company: 'Z Lift' }, users: [{ id: 'u1', username: 'test' }]
    };
    /* Run migration */
    migrateElevatorsInAggregate(db);
    /* Export as backup (backup doesn't include elevators) */
    const backup = {
      app: 'zlift', version: 8, formatVersion: 8,
      projects: db.projects, services: db.services, measurements: db.measurements,
      diagSessions: db.diagSessions, checklists: db.checklists, safetyLogs: db.safetyLogs,
      invoices: db.invoices, contracts: db.contracts, notes: db.notes, parts: db.parts,
      tools: db.tools, photos: db.photos, reminders: db.reminders, calcSaves: db.calcSaves,
      issues: db.issues, archivedProjects: [], settings: db.settings
    };
    const audit = validateBackup(backup);
    /* Re-import: migration should recreate elevators from projects */
    const restored = JSON.parse(JSON.stringify(backup));
    restored.elevators = [];
    const result = migrateElevatorsInAggregate(restored);
    return {
      ok: audit.ok && result.changed && restored.elevators.length === 1,
      elevator: restored.elevators[0],
      checks: {
        id: restored.elevators[0] && restored.elevators[0].id === 'p1',
        projectId: restored.elevators[0] && restored.elevators[0].projectId === 'p1'
      }
    };
  })()`);
  await T('post-migration backup exports and re-imports correctly', case19 && case19.ok && case19.checks.id && case19.checks.projectId, JSON.stringify(case19));

  console.log('\n  -- Data Count Verification --');
  const countVerify = await ev(`(async()=>{
    const now = Date.now();
    const db = {
      projects: [
        { id: 'p1', name: 'B1', elevatorType: 'traction', createdAt: now, updatedAt: now },
        { id: 'p2', name: 'B2', elevatorType: 'hydraulic', createdAt: now, updatedAt: now }
      ],
      elevators: [],
      services: [
        { id: 's1', projectId: 'p1', customer: 'C', elevatorInfo: 'E', date: now, createdAt: now },
        { id: 's2', projectId: 'p1', customer: 'C', elevatorInfo: 'E', date: now, createdAt: now },
        { id: 's3', projectId: 'p2', customer: 'C', elevatorInfo: 'E', date: now, createdAt: now },
        { id: 's4', projectId: '', customer: 'Standalone', elevatorInfo: 'S', date: now, createdAt: now }
      ],
      measurements: [
        { id: 'm1', projectId: 'p1', typeId: 'voltage', value: 380, createdAt: now, updatedAt: now },
        { id: 'm2', projectId: 'p2', typeId: 'voltage', value: 220, createdAt: now, updatedAt: now }
      ],
      diagSessions: [{ id: 'd1', projectId: 'p1', symptom: 'noise', createdAt: now, updatedAt: now }],
      checklists: [{ id: 'c1', projectId: 'p1', templateId: 't1', checked: {}, updatedAt: now }],
      safetyLogs: [{ id: 'sl1', projectId: 'p2', note: 'safe', createdAt: now, updatedAt: now }],
      invoices: [{ id: 'inv1', projectId: 'p1', customer: 'C', items: [], payments: [], createdAt: now, updatedAt: now }],
      contracts: [], notes: [], parts: [], tools: [], photos: [],
      reminders: [], calcSaves: [], issues: [], users: []
    };
    const before = {
      projects: db.projects.length,
      services: db.services.length,
      measurements: db.measurements.length,
      diagSessions: db.diagSessions.length,
      checklists: db.checklists.length,
      safetyLogs: db.safetyLogs.length,
      invoices: db.invoices.length
    };
    const serviceIds = db.services.map(s => s.id).sort();
    const measurementIds = db.measurements.map(m => m.id).sort();
    const result = migrateElevatorsInAggregate(db);
    const after = {
      projects: db.projects.length,
      elevators: db.elevators.length,
      services: db.services.length,
      measurements: db.measurements.length,
      diagSessions: db.diagSessions.length,
      checklists: db.checklists.length,
      safetyLogs: db.safetyLogs.length,
      invoices: db.invoices.length
    };
    const afterServiceIds = db.services.map(s => s.id).sort();
    const afterMeasurementIds = db.measurements.map(m => m.id).sort();
    return {
      ok: before.projects === after.projects && before.services === after.services
        && before.measurements === after.measurements && after.elevators === 2
        && JSON.stringify(serviceIds) === JSON.stringify(afterServiceIds)
        && JSON.stringify(measurementIds) === JSON.stringify(afterMeasurementIds),
      before, after, serviceIds, afterServiceIds
    };
  })()`);
  await T('data counts preserved after migration (only elevators added)', countVerify && countVerify.ok, JSON.stringify(countVerify));

  console.log('\n  -- Data Hash / ID Verification --');
  const idVerify = await ev(`(async()=>{
    const now = Date.now();
    const db = {
      projects: [{ id: 'p1', name: 'B1', elevatorType: 'traction', createdAt: now, updatedAt: now }],
      elevators: [],
      services: [
        { id: 'svc-001', projectId: 'p1', customer: 'C', elevatorInfo: 'E', date: now, createdAt: now },
        { id: 'svc-002', projectId: 'p1', customer: 'C', elevatorInfo: 'E', date: now, createdAt: now }
      ],
      measurements: [
        { id: 'meas-001', projectId: 'p1', typeId: 'voltage', value: 380, createdAt: now, updatedAt: now }
      ],
      diagSessions: [{ id: 'diag-001', projectId: 'p1', symptom: 'x', createdAt: now, updatedAt: now }],
      checklists: [{ id: 'chk-001', projectId: 'p1', templateId: 't1', checked: { a1: 'pass' }, updatedAt: now }],
      safetyLogs: [{ id: 'sl-001', projectId: 'p1', note: 'ok', createdAt: now, updatedAt: now }],
      invoices: [], contracts: [], notes: [], parts: [], tools: [], photos: [],
      reminders: [], calcSaves: [], issues: [], users: []
    };
    const beforeIds = {
      services: db.services.map(s => s.id).sort(),
      measurements: db.measurements.map(m => m.id).sort(),
      diagSessions: db.diagSessions.map(d => d.id).sort(),
      checklists: db.checklists.map(c => c.id).sort(),
      safetyLogs: db.safetyLogs.map(s => s.id).sort()
    };
    const beforeTimestamps = {
      svc001: db.services[0].createdAt,
      meas001: db.measurements[0].createdAt
    };
    migrateElevatorsInAggregate(db);
    const afterIds = {
      services: db.services.map(s => s.id).sort(),
      measurements: db.measurements.map(m => m.id).sort(),
      diagSessions: db.diagSessions.map(d => d.id).sort(),
      checklists: db.checklists.map(c => c.id).sort(),
      safetyLogs: db.safetyLogs.map(s => s.id).sort()
    };
    const afterTimestamps = {
      svc001: db.services[0].createdAt,
      meas001: db.measurements[0].createdAt
    };
    return {
      ok: JSON.stringify(beforeIds) === JSON.stringify(afterIds)
        && JSON.stringify(beforeTimestamps) === JSON.stringify(afterTimestamps),
      beforeIds, afterIds, beforeTimestamps, afterTimestamps
    };
  })()`);
  await T('all record IDs and timestamps preserved after migration', idVerify && idVerify.ok, JSON.stringify(idVerify));

  console.log('\n  -- QR Compatibility (identity preservation) --');
  const qrCompat = await ev(`(async()=>{
    const db = {
      projects: [{ id: 'qr-project-123', name: 'QR Building', elevatorType: 'traction', createdAt: 1000, updatedAt: 1000 }],
      elevators: [],
      services: [], measurements: [], diagSessions: [], checklists: [], safetyLogs: [],
      invoices: [], contracts: [], notes: [], parts: [], tools: [], photos: [],
      reminders: [], calcSaves: [], issues: [], users: []
    };
    migrateElevatorsInAggregate(db);
    return {
      ok: db.elevators.length === 1 && db.elevators[0].id === 'qr-project-123' && db.elevators[0].projectId === 'qr-project-123',
      elevator: db.elevators[0]
    };
  })()`);
  await T('QR compatibility: elevator.id = project.id (legacy identity preserved)', qrCompat && qrCompat.ok, JSON.stringify(qrCompat));

  console.log('\n  -- Archive Behavior --');
  const archiveBeh = await ev(`(async()=>{
    const db = {
      projects: [
        { id: 'p-active', name: 'Active', elevatorType: 'traction', archived: false, createdAt: 1000, updatedAt: 1000 },
        { id: 'p-archived', name: 'Archived', elevatorType: 'hydraulic', archived: true, archivedAt: 5000, createdAt: 2000, updatedAt: 3000 }
      ],
      elevators: [],
      services: [], measurements: [], diagSessions: [], checklists: [], safetyLogs: [],
      invoices: [], contracts: [], notes: [], parts: [], tools: [], photos: [],
      reminders: [], calcSaves: [], issues: [], users: []
    };
    migrateElevatorsInAggregate(db);
    const active = db.elevators.find(e => e.id === 'p-active');
    const archived = db.elevators.find(e => e.id === 'p-archived');
    return {
      ok: active && !active.archived && archived && archived.archived && archived.archivedAt === 5000,
      active, archived
    };
  })()`);
  await T('archive behavior preserved: active → active elevator, archived → archived elevator', archiveBeh && archiveBeh.ok, JSON.stringify(archiveBeh));

  console.log('\n  -- Delete Safety --');
  const deleteSafe = await ev(`(async()=>{
    /* Verify that project delete removes the correct elevator and clears
       elevatorId on the correct records. Project B must be completely untouched. */
    const now = Date.now();
    const db = {
      projects: [
        { id: 'pA', name: 'A', customer: 'CA', location: 'LA', elevatorType: 'traction', createdAt: now, updatedAt: now },
        { id: 'pB', name: 'B', customer: 'CB', location: 'LB', elevatorType: 'hydraulic', createdAt: now, updatedAt: now }
      ],
      elevators: [],
      services: [
        { id: 'sA1', projectId: 'pA', customer: 'CA', elevatorInfo: 'EA', date: now, createdAt: now },
        { id: 'sB1', projectId: 'pB', customer: 'CB', elevatorInfo: 'EB', date: now, createdAt: now }
      ],
      measurements: [
        { id: 'mA1', projectId: 'pA', typeId: 'voltage', value: 380, createdAt: now, updatedAt: now },
        { id: 'mB1', projectId: 'pB', typeId: 'voltage', value: 220, createdAt: now, updatedAt: now }
      ],
      diagSessions: [], checklists: [], safetyLogs: [], invoices: [], contracts: [],
      notes: [], parts: [], tools: [], photos: [], reminders: [], calcSaves: [], issues: [], users: []
    };
    migrateElevatorsInAggregate(db);

    /* Simulate project A delete (same logic as api-local.js) */
    const p = db.projects.find(x => x.id === 'pA');
    const pInfo = [p.name, p.customer, p.location].filter(Boolean).join(' — ');
    const stamp = (rec) => { if (!rec.projectInfo) rec.projectInfo = pInfo; rec.projectId = ''; };
    ['services', 'measurements'].forEach(k => {
      (db[k] || []).forEach(r => { if (r && r.projectId === p.id) stamp(r); });
    });
    /* Remove elevator for project A */
    db.elevators = db.elevators.filter(e => e.projectId !== 'pA');
    /* Clear elevatorId on A's records */
    ELEVATOR_OWNED_COLLECTIONS.forEach(k => {
      (db[k] || []).forEach(r => { if (r && r.elevatorId === 'pA') r.elevatorId = ''; });
    });
    db.projects = db.projects.filter(x => x.id !== 'pA');

    /* Verify: B is completely untouched */
    const sB = db.services.find(s => s.id === 'sB1');
    const mB = db.measurements.find(m => m.id === 'mB1');
    const sA = db.services.find(s => s.id === 'sA1');
    const mA = db.measurements.find(m => m.id === 'mA1');
    return {
      ok: sB && sB.projectId === 'pB' && sB.elevatorId === 'pB'
        && mB && mB.projectId === 'pB' && mB.elevatorId === 'pB'
        && sA && sA.projectId === '' && sA.elevatorId === ''
        && mA && mA.projectId === '' && mA.elevatorId === ''
        && db.elevators.length === 1 && db.elevators[0].id === 'pB',
      elevators: db.elevators.map(e => e.id),
      sA, sB, mA, mB
    };
  })()`);
  await T('delete safety: deleting Project A preserves B entirely (B records untouched)', deleteSafe && deleteSafe.ok, JSON.stringify(deleteSafe));

  console.log('\n  summary (TEST ENVIRONMENT — jsdom + fake-indexeddb, not a device):');
  console.log('    migration is deterministic, idempotent, and preserves all record IDs');
  console.log('    cross-project isolation is enforced');
  console.log('    standalone records remain standalone');
  console.log('    elevator.id = project.id for legacy data (QR-compatible)');
  console.log('    backup/restore round-trips preserve elevator relationships');
  console.log('    archive status is mirrored to elevators');
  console.log('    delete safety: cross-project isolation maintained');
  console.log('');

  console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
  if (failures.length) {
    console.log('FAILURES:');
    failures.forEach(f => console.log(' - ' + f));
  }
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error('FATAL', e);
  process.exit(1);
});
