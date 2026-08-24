/* Z Lift — Phase 2B.2 Elevator-Aware API & Application Layer Tests

   Runs in its own jsdom + fake-indexeddb process. This is NOT a real Android
   benchmark. It verifies the canonical projectId+elevatorId boundary, legacy
   exact-1:1 wrappers, isolation/security, linked records, restore, deletion,
   search/report adapters, and representative 100/500/1000-elevator reads.

   Run: node qa/phase2b2.js
   Exit code 0 = every check passed. */
const { JSDOM, VirtualConsole } = require('jsdom');
const { indexedDB, IDBKeyRange } = require('fake-indexeddb');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const rawHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
function inlineScripts(html) {
  return html.replace(/<script\s+src="([^"]+)"[^>]*><\/script>/g, (match, src) => {
    const file = path.join(ROOT, src);
    return fs.existsSync(file) ? '<script>\n' + fs.readFileSync(file, 'utf8') + '\n</script>' : '<script>/* missing */</script>';
  });
}

let pass = 0;
let fail = 0;
const failures = [];
const timings = [];
async function T(name, check) {
  try {
    const ok = typeof check === 'function' ? await check() : await check;
    if (!ok) throw new Error('assertion returned false');
    pass++;
    console.log('  ✓ ' + name);
  } catch (error) {
    fail++;
    const detail = String(error && (error.stack || error.message) || error);
    failures.push(name + ' — ' + detail);
    console.log('  ✗ ' + name + ' — ' + String(error && error.message || error));
  }
}
async function errorCode(promise) {
  try { await promise; return 'accepted'; }
  catch (error) { return error && error.code || String(error && error.message || error); }
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  console.log('\n=== PHASE 2B.2: ELEVATOR-AWARE API & APPLICATION LAYER ===');
  console.log('    environment: jsdom + fake-indexeddb (NOT a real Android device)\n');

  const virtualConsole = new VirtualConsole();
  const jsdomErrors = [];
  virtualConsole.on('jsdomError', error => {
    const message = String(error && error.message || error);
    if (!/Could not parse CSS/i.test(message)) jsdomErrors.push(message);
  });
  const dom = new JSDOM(inlineScripts(rawHtml), {
    url: 'http://localhost:4173/index.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.indexedDB = indexedDB;
      window.IDBKeyRange = IDBKeyRange;
    }
  });
  const w = dom.window;
  w.scrollTo = () => {};
  const ev = expression => w.eval(expression);

  const bootStart = Date.now();
  while (!ev(`typeof api === 'function' && typeof STRUCTURED_DB !== 'undefined' && typeof _apiResolveContext === 'function'`)) {
    if (Date.now() - bootStart > 10000) throw new Error('app did not boot');
    await wait(25);
  }
  const auth = await w.api('/auth/register', {
    method: 'POST', body: { username: 'phase2b2', password: '123456', name: 'Phase 2B.2 QA' }
  });
  w.state.token = auth.token;
  w.state.user = auth.user;

  const createProject = async name => (await w.api('/projects', { method: 'POST', body: { name, customer: 'QA' } })).project;
  const one = await createProject('P2B2 one elevator');
  const multi = await createProject('P2B2 multi elevator');
  const other = await createProject('P2B2 other multi elevator');
  const multiE1 = multi.id;
  const multiE2 = 'p2b2-multi-e2';
  const otherE1 = other.id;
  const otherE2 = 'p2b2-other-e2';
  const addElevator = (id, project, name) => {
    w._lsDB.elevators.push(Object.assign(w._apiBuildElevator(project, id, true), { name }));
  };
  addElevator(multiE2, multi, 'Multi elevator 2');
  addElevator(otherE2, other, 'Other elevator 2');
  await w._lsSave();

  const owned = ['services', 'measurements', 'diagSessions', 'checklists', 'issues', 'safetyLogs'];
  const responseKey = { services: 'service', checklists: 'checklist' };
  let sequence = 0;
  function bodyFor(collection, projectId, elevatorId, label) {
    const body = { projectId, elevatorId };
    if (collection === 'services') Object.assign(body, { customer: 'QA', complaint: label, date: Date.now() });
    else if (collection === 'measurements') Object.assign(body, { typeId: 'p2b2_custom', value: 1, note: label });
    else if (collection === 'checklists') Object.assign(body, { templateId: 'p2b2-template-' + label, checked: { a: 'pass' } });
    else if (collection === 'diagSessions') Object.assign(body, { title: label, evidence: [{ answer: 'yes' }] });
    else if (collection === 'issues') Object.assign(body, { title: label, closed: false });
    else Object.assign(body, { note: label, acknowledged: true });
    return body;
  }
  async function createOwned(collection, projectId, elevatorId, label) {
    const result = await w.api('/' + collection, {
      method: 'POST', body: bodyFor(collection, projectId, elevatorId, label || ('fixture-' + (++sequence)))
    });
    return result[responseKey[collection] || 'item'];
  }
  async function listOwned(collection, projectId, elevatorId) {
    const result = await w.api('/' + collection + '?projectId=' + encodeURIComponent(projectId) + '&elevatorId=' + encodeURIComponent(elevatorId));
    return result.services || result.checklists || result.items;
  }
  const exactPath = (collection, id, projectId, elevatorId) => '/' + collection + '/' + id + '?projectId=' + encodeURIComponent(projectId) + '&elevatorId=' + encodeURIComponent(elevatorId);

  console.log('  -- 1×1 and explicit ownership creation --');
  const fixtures = {};
  for (const collection of owned) {
    fixtures[collection] = {
      a: await createOwned(collection, multi.id, multiE1, 'phase2b2-alpha-' + collection),
      b: await createOwned(collection, multi.id, multiE2, 'phase2b2-beta-' + collection),
      c: await createOwned(collection, other.id, otherE1, 'phase2b2-other-' + collection),
      d: await createOwned(collection, other.id, otherE2, 'phase2b2-other-second-' + collection)
    };
    await T(collection + ': create persists the explicit project/elevator pair', () => {
      const row = fixtures[collection].a;
      return row.projectId === multi.id && row.elevatorId === multiE1;
    });
  }

  console.log('\n  -- 1×N and N×N isolation/authorization matrix --');
  for (const collection of owned) {
    await T(collection + ': scoped list isolates sibling and cross-project elevators', async () => {
      const rows = await listOwned(collection, multi.id, multiE1);
      return rows.some(row => row.id === fixtures[collection].a.id) &&
        !rows.some(row => row.id === fixtures[collection].b.id || row.id === fixtures[collection].c.id || row.id === fixtures[collection].d.id);
    });
    await T(collection + ': sibling-elevator item access is rejected', async () =>
      (await errorCode(w.api(exactPath(collection, fixtures[collection].a.id, multi.id, multiE2)))) === 'RECORD_CONTEXT_MISMATCH');
    await T(collection + ': cross-project elevator pair is rejected', async () =>
      (await errorCode(w.api(exactPath(collection, fixtures[collection].a.id, other.id, multiE1)))) === 'ELEVATOR_PROJECT_MISMATCH');
    await T(collection + ': elevatorId without projectId is rejected', async () => {
      const payload = bodyFor(collection, '', multiE1, 'missing-project-' + collection);
      delete payload.projectId;
      return (await errorCode(w.api('/' + collection, { method: 'POST', body: payload }))) === 'ELEVATOR_CONTEXT_REQUIRED';
    });
  }

  console.log('\n  -- Temporary exact-1:1 wrappers and ambiguous calls --');
  const legacy = {};
  for (const collection of owned) {
    const payload = bodyFor(collection, one.id, '', 'legacy-' + collection);
    delete payload.elevatorId;
    const result = await w.api('/' + collection, { method: 'POST', body: payload });
    legacy[collection] = result[responseKey[collection] || 'item'];
    await T(collection + ': project-only wrapper resolves only the exact 1:1 project', () =>
      legacy[collection].projectId === one.id && legacy[collection].elevatorId === one.id);
    const ambiguous = bodyFor(collection, multi.id, '', 'ambiguous-' + collection);
    delete ambiguous.elevatorId;
    await T(collection + ': project-only call fails for a multi-elevator project', async () =>
      (await errorCode(w.api('/' + collection, { method: 'POST', body: ambiguous }))) === 'ELEVATOR_CONTEXT_AMBIGUOUS');
  }

  console.log('\n  -- Standalone compatibility (narrow and explicit) --');
  const standaloneAllowed = ['services', 'measurements', 'diagSessions'];
  for (const collection of standaloneAllowed) {
    const payload = bodyFor(collection, '', '', 'standalone-' + collection);
    delete payload.projectId; delete payload.elevatorId;
    const result = await w.api('/' + collection, { method: 'POST', body: payload });
    const row = result[responseKey[collection] || 'item'];
    await T(collection + ': historical standalone creation keeps both owner ids empty', () =>
      row.projectId === '' && row.elevatorId === '');
  }
  for (const collection of ['checklists', 'issues', 'safetyLogs']) {
    const payload = bodyFor(collection, '', '', 'forbidden-standalone-' + collection);
    delete payload.projectId; delete payload.elevatorId;
    await T(collection + ': new standalone creation is rejected', async () =>
      (await errorCode(w.api('/' + collection, { method: 'POST', body: payload }))) === 'ELEVATOR_CONTEXT_REQUIRED');
  }

  console.log('\n  -- Update and delete matrix --');
  function updatePatch(collection, value) {
    if (collection === 'services') return { complaint: value };
    if (collection === 'measurements') return { note: value };
    if (collection === 'checklists') return { checked: { updated: value } };
    if (collection === 'diagSessions') return { title: value, evidence: [{ answer: value }] };
    if (collection === 'issues') return { title: value, closed: true };
    return { note: value, acknowledged: true };
  }
  function updated(row, collection, value) {
    if (collection === 'services') return row.complaint === value;
    if (collection === 'measurements' || collection === 'safetyLogs') return row.note === value;
    if (collection === 'checklists') return row.checked && row.checked.updated === value;
    return row.title === value;
  }
  for (const collection of owned) {
    const value = 'updated-' + collection;
    const target = fixtures[collection].a;
    const updatedResponse = await w.api(exactPath(collection, target.id, multi.id, multiE1), {
      method: 'PUT', body: updatePatch(collection, value)
    });
    const row = updatedResponse[responseKey[collection] || 'item'];
    await T(collection + ': exact-context update preserves ownership and technician payload', () =>
      updated(row, collection, value) && row.projectId === multi.id && row.elevatorId === multiE1);
    const rejectedValue = 'must-not-commit-' + collection;
    const wrongCode = await errorCode(w.api(exactPath(collection, target.id, multi.id, multiE2), {
      method: 'PUT', body: updatePatch(collection, rejectedValue)
    }));
    const afterRejected = await w.api(exactPath(collection, target.id, multi.id, multiE1));
    const afterRow = afterRejected[responseKey[collection] || 'item'];
    await T(collection + ': rejected cross-elevator update is non-mutating', () =>
      wrongCode === 'RECORD_CONTEXT_MISMATCH' && updated(afterRow, collection, value));

    const disposable = await createOwned(collection, multi.id, multiE1, 'delete-' + collection);
    const wrongDelete = await errorCode(w.api(exactPath(collection, disposable.id, multi.id, multiE2), { method: 'DELETE' }));
    await w.api(exactPath(collection, disposable.id, multi.id, multiE1), { method: 'DELETE' });
    const rows = await listOwned(collection, multi.id, multiE1);
    await T(collection + ': delete rejects wrong elevator then removes only the exact record', () =>
      wrongDelete === 'RECORD_CONTEXT_MISMATCH' && !rows.some(item => item.id === disposable.id));
  }

  console.log('\n  -- Checklist identity, search, report, and project detail --');
  const checklistCollisionCode = await errorCode(w.api(exactPath('checklists', fixtures.checklists.a.id, multi.id, multiE1), {
    method: 'PUT',
    body: { targetProjectId: multi.id, targetElevatorId: multiE2, templateId: fixtures.checklists.b.templateId }
  }));
  await T('checklist identity collision is rejected instead of merging technician answers', () =>
    checklistCollisionCode === 'CHECKLIST_IDENTITY_CONFLICT');

  const globalSearch = await w.api('/search');
  await T('global search returns all six owned kinds with canonical context', () =>
    owned.every(collection => globalSearch.results.some(result => result.collection === collection &&
      result.id === fixtures[collection].a.id && result.projectId === multi.id &&
      result.elevatorId === multiE1 && result.context.elevatorId === multiE1)));
  const scopedSearch = await w.api('/search?q=phase2b2&projectId=' + encodeURIComponent(multi.id) + '&elevatorId=' + encodeURIComponent(multiE2));
  await T('scoped search excludes sibling and cross-project records', () =>
    scopedSearch.results.length > 0 && scopedSearch.results.every(result =>
      result.scope !== 'elevator' || (result.projectId === multi.id && result.elevatorId === multiE2)));

  const report = await w.api('/reports/elevator?projectId=' + encodeURIComponent(multi.id) + '&elevatorId=' + encodeURIComponent(multiE1));
  await T('elevator report contains each owned collection for only the requested pair', () =>
    owned.every(collection => report.collections[collection].some(row => row.id === fixtures[collection].a.id) &&
      report.collections[collection].every(row => row.projectId === multi.id && row.elevatorId === multiE1)));
  await T('elevator report rejects ambiguous project-only context', async () =>
    (await errorCode(w.api('/reports/elevator?projectId=' + encodeURIComponent(multi.id)))) === 'ELEVATOR_CONTEXT_AMBIGUOUS');
  const detail = await w.api('/projects/' + multi.id + '?elevatorId=' + encodeURIComponent(multiE2));
  await T('project detail returns the requested elevator and isolates all owned collections', () =>
    detail.elevator.id === multiE2 && owned.every(collection =>
      detail[collection].every(row => row.projectId === multi.id && row.elevatorId === multiE2)));
  await T('project detail rejects an ambiguous multi-elevator wrapper', async () =>
    (await errorCode(w.api('/projects/' + multi.id))) === 'ELEVATOR_CONTEXT_AMBIGUOUS');

  console.log('\n  -- Related records: measurements, invoices, attachments, and parts history --');
  const linkServiceA = await createOwned('services', multi.id, multiE1, 'link-service-a');
  const linkServiceB = await createOwned('services', multi.id, multiE2, 'link-service-b');
  const linkServiceOther = await createOwned('services', other.id, otherE1, 'link-service-other');
  const linkDiagA = await createOwned('diagSessions', multi.id, multiE1, 'link-diag-a');
  const photoA = (await w.api('/photos', { method: 'POST', body: { projectId: multi.id, name: 'photo-a' } })).item;
  const photoOther = (await w.api('/photos', { method: 'POST', body: { projectId: other.id, name: 'photo-other' } })).item;
  const linkedMeasurement = (await w.api('/measurements', {
    method: 'POST', body: Object.assign(bodyFor('measurements', multi.id, multiE1, 'linked-measurement'), {
      serviceId: linkServiceA.id, diagSessionId: linkDiagA.id, photoId: photoA.id
    })
  })).item;
  await T('measurement accepts same-pair service/diagnostic and same-project attachment links', () =>
    linkedMeasurement.serviceId === linkServiceA.id && linkedMeasurement.diagSessionId === linkDiagA.id && linkedMeasurement.photoId === photoA.id);
  const beforeMeasurementCount = w._lsDB.measurements.length;
  const wrongMeasurementLink = await errorCode(w.api('/measurements', {
    method: 'POST', body: Object.assign(bodyFor('measurements', multi.id, multiE1, 'wrong-link'), { serviceId: linkServiceB.id })
  }));
  await T('measurement rejects a sibling-elevator service before creating a record', () =>
    wrongMeasurementLink === 'RELATED_RECORD_CONTEXT_MISMATCH' && w._lsDB.measurements.length === beforeMeasurementCount);
  const wrongPhotoLink = await errorCode(w.api('/measurements', {
    method: 'POST', body: Object.assign(bodyFor('measurements', multi.id, multiE1, 'wrong-photo'), { photoId: photoOther.id })
  }));
  await T('measurement rejects a cross-project photo attachment', () => wrongPhotoLink === 'RELATED_RECORD_CONTEXT_MISMATCH');

  const staged = await createOwned('measurements', multi.id, multiE1, 'staged-original');
  const stagedCode = await errorCode(w.api(exactPath('measurements', staged.id, multi.id, multiE1), {
    method: 'PUT', body: { serviceId: linkServiceB.id, note: 'must-not-commit' }
  }));
  const stagedAfter = (await w.api(exactPath('measurements', staged.id, multi.id, multiE1))).item;
  await T('measurement linked-record update is staged and atomic on rejection', () =>
    stagedCode === 'RELATED_RECORD_CONTEXT_MISMATCH' && stagedAfter.note === 'staged-original' && !stagedAfter.serviceId);

  const invoice = (await w.api('/invoices', {
    method: 'POST', body: { customer: 'P2B2 invoice', projectId: multi.id, serviceId: linkServiceA.id, items: [] }
  })).item;
  await T('invoice accepts a service from the same project and stores no elevatorId', () =>
    invoice.serviceId === linkServiceA.id && invoice.projectId === multi.id && !Object.prototype.hasOwnProperty.call(invoice, 'elevatorId'));
  const invoiceCount = w._lsDB.invoices.length;
  const wrongInvoice = await errorCode(w.api('/invoices', {
    method: 'POST', body: { customer: 'Wrong invoice', projectId: multi.id, serviceId: linkServiceOther.id, items: [] }
  }));
  await T('invoice rejects a cross-project service without mutating invoice inventory', () =>
    wrongInvoice === 'RELATED_RECORD_CONTEXT_MISMATCH' && w._lsDB.invoices.length === invoiceCount);
  const invoiceUpdateCode = await errorCode(w.api('/invoices/' + invoice.id + '?projectId=' + encodeURIComponent(multi.id), {
    method: 'PUT', body: { serviceId: linkServiceOther.id }
  }));
  await T('invoice update rejects a cross-project service and keeps the original link', () =>
    invoiceUpdateCode === 'RELATED_RECORD_CONTEXT_MISMATCH' && w._lsDB.invoices.find(row => row.id === invoice.id).serviceId === linkServiceA.id);
  await T('invoice item read rejects a different project context', async () =>
    (await errorCode(w.api('/invoices/' + invoice.id + '?projectId=' + encodeURIComponent(other.id)))) === 'RECORD_CONTEXT_MISMATCH');

  const stockPart = (await w.api('/parts', { method: 'POST', body: { name: 'P2B2 linked stock', qty: 5 } })).part;
  const stockBefore = stockPart.qty;
  const badStock = await errorCode(w.api('/parts-consume', {
    method: 'POST', body: { partId: stockPart.id, qty: 1, projectId: multi.id, serviceId: linkServiceOther.id }
  }));
  await T('parts history rejects a service from another project before changing stock', () =>
    badStock === 'RELATED_RECORD_CONTEXT_MISMATCH' && w._lsDB.parts.find(row => row.id === stockPart.id).qty === stockBefore);
  await w.api('/parts-consume', {
    method: 'POST', body: { partId: stockPart.id, qty: 1, projectId: multi.id, serviceId: linkServiceA.id }
  });
  const stockHistory = w._lsDB.parts.find(row => row.id === stockPart.id).history[0];
  await T('parts history remains project-level while its service id preserves exact elevator context', () =>
    stockHistory.projectId === multi.id && stockHistory.serviceId === linkServiceA.id && !Object.prototype.hasOwnProperty.call(stockHistory, 'elevatorId'));

  const cleanupService = await createOwned('services', multi.id, multiE1, 'cleanup-service');
  const cleanupMeasurement = (await w.api('/measurements', {
    method: 'POST', body: Object.assign(bodyFor('measurements', multi.id, multiE1, 'cleanup-measurement'), { serviceId: cleanupService.id })
  })).item;
  const cleanupInvoice = (await w.api('/invoices', {
    method: 'POST', body: { customer: 'Cleanup invoice', projectId: multi.id, serviceId: cleanupService.id, items: [] }
  })).item;
  await w.api(exactPath('services', cleanupService.id, multi.id, multiE1), { method: 'DELETE' });
  await T('service deletion clears live measurement/invoice links without deleting parent history', () => {
    const measurement = w._lsDB.measurements.find(row => row.id === cleanupMeasurement.id);
    const savedInvoice = w._lsDB.invoices.find(row => row.id === cleanupInvoice.id);
    return measurement && savedInvoice && measurement.serviceId === '' && savedInvoice.serviceId === '';
  });

  console.log('\n  -- Multi-elevator project deletion and historical preservation --');
  const doomed = await createProject('P2B2 project delete');
  const doomedE2 = 'p2b2-doomed-e2';
  addElevator(doomedE2, doomed, 'Doomed elevator 2');
  await w._lsSave();
  const doomedRows = {};
  for (const collection of owned) doomedRows[collection] = await createOwned(collection, doomed.id, doomedE2, 'doomed-' + collection);
  const otherSentinel = fixtures.issues.c;
  await w.api('/projects/' + doomed.id, { method: 'DELETE' });
  await T('project delete detaches all six owned histories as a complete pair and keeps payloads', () =>
    owned.every(collection => {
      const row = w._lsDB[collection].find(item => item.id === doomedRows[collection].id);
      return row && row.projectId === '' && row.elevatorId === '' && row.projectInfo && row.elevatorInfo;
    }));
  await T('project delete removes every elevator row for only that project', () =>
    !w._lsDB.elevators.some(elevator => elevator.projectId === doomed.id) &&
      w._lsDB.elevators.some(elevator => elevator.projectId === other.id));
  await T('project delete leaves records from other projects unchanged', () => {
    const sentinel = w._lsDB.issues.find(row => row.id === otherSentinel.id);
    return sentinel && sentinel.projectId === other.id && sentinel.elevatorId === otherE1;
  });

  console.log('\n  -- Backup/restore v8 ownership and negative activation tests --');
  const exported = (await w.api('/backup')).backup;
  await T('backup remains format v8 and omits the derived elevators collection', () =>
    exported.formatVersion === 8 && exported.version === 8 && !Object.prototype.hasOwnProperty.call(exported, 'elevators'));
  await T('backup metadata counts explicit multi-elevator contexts', () => exported.recordCounts.elevators >= exported.projects.length + 2);

  const malicious = JSON.parse(JSON.stringify(exported));
  malicious.issues.push({ id: 'p2b2-ambiguous-restore', projectId: other.id, elevatorId: multiE2, title: 'ambiguous', createdAt: Date.now(), updatedAt: Date.now() });
  delete malicious.integrity;
  if (malicious.metadata) delete malicious.metadata.integrity;
  const maliciousAudit = w.validateBackup(w.enrichBackupMetadata(malicious));
  await T('restore audit blocks one elevator id from being claimed by two projects', () =>
    !maliciousAudit.ok && maliciousAudit.errors.some(error => error.includes('elevator-project-ambiguity')));
  const beforeRejectedRestore = w._lsDB.projects.length;
  const maliciousRestore = await errorCode(w.api('/backup', { method: 'PUT', body: { backup: w.enrichBackupMetadata(malicious) } }));
  await T('rejected ambiguous restore does not activate the candidate', () =>
    String(maliciousRestore).startsWith('bad_backup:') && w._lsDB.projects.length === beforeRejectedRestore);

  const badLinked = JSON.parse(JSON.stringify(exported));
  const linkedMeasurementBackup = badLinked.measurements.find(row => row.projectId === multi.id && row.elevatorId === multiE1);
  if (linkedMeasurementBackup) linkedMeasurementBackup.serviceId = linkServiceB.id;
  delete badLinked.integrity;
  if (badLinked.metadata) delete badLinked.metadata.integrity;
  const linkedAudit = w.validateBackup(w.enrichBackupMetadata(badLinked));
  await T('restore audit blocks cross-elevator measurement links', () =>
    !linkedAudit.ok && linkedAudit.errors.some(error => error.includes('measurements:service-context-mismatch')));

  const badAttachment = JSON.parse(JSON.stringify(exported));
  const attachedMeasurementBackup = badAttachment.measurements.find(row => row.id === linkedMeasurement.id);
  if (attachedMeasurementBackup) attachedMeasurementBackup.photoId = photoOther.id;
  delete badAttachment.integrity;
  if (badAttachment.metadata) delete badAttachment.metadata.integrity;
  const attachmentAudit = w.validateBackup(w.enrichBackupMetadata(badAttachment));
  await T('restore audit blocks cross-project measurement attachments', () =>
    !attachmentAudit.ok && attachmentAudit.errors.some(error => error.includes('measurements:photo-project-mismatch')));

  const badInvoiceLink = JSON.parse(JSON.stringify(exported));
  const linkedInvoiceBackup = badInvoiceLink.invoices.find(row => row.id === invoice.id);
  if (linkedInvoiceBackup) linkedInvoiceBackup.projectId = other.id;
  delete badInvoiceLink.integrity;
  if (badInvoiceLink.metadata) delete badInvoiceLink.metadata.integrity;
  const invoiceAudit = w.validateBackup(w.enrichBackupMetadata(badInvoiceLink));
  await T('restore audit blocks cross-project invoice service links', () =>
    !invoiceAudit.ok && invoiceAudit.errors.some(error => error.includes('invoices:service-project-mismatch')));

  const badPartsHistory = JSON.parse(JSON.stringify(exported));
  const historyPartBackup = badPartsHistory.parts.find(row => row.id === stockPart.id);
  const linkedHistoryBackup = historyPartBackup && historyPartBackup.history.find(entry => entry.serviceId === linkServiceA.id);
  if (linkedHistoryBackup) linkedHistoryBackup.projectId = other.id;
  delete badPartsHistory.integrity;
  if (badPartsHistory.metadata) delete badPartsHistory.metadata.integrity;
  const partsHistoryAudit = w.validateBackup(w.enrichBackupMetadata(badPartsHistory));
  await T('restore audit blocks cross-project parts-history service links', () =>
    !partsHistoryAudit.ok && partsHistoryAudit.errors.some(error => error.includes('parts:history-service-project-mismatch')));

  const legacyBackup = JSON.parse(JSON.stringify(exported));
  owned.forEach(collection => legacyBackup[collection].forEach(row => {
    if (row.projectId === one.id) delete row.elevatorId;
  }));
  delete legacyBackup.integrity;
  if (legacyBackup.metadata) delete legacyBackup.metadata.integrity;
  const restored = await w.api('/backup', { method: 'PUT', body: { backup: w.enrichBackupMetadata(legacyBackup) } });
  await T('legacy v8 restore derives missing elevatorId only from exact project context', () =>
    restored.ok && owned.every(collection => w._lsDB[collection]
      .filter(row => row.projectId === one.id)
      .every(row => row.elevatorId === one.id)));
  await T('restore reconstructs explicit custom elevator contexts without selecting array-first', () =>
    w._lsDB.elevators.some(elevator => elevator.id === multiE2 && elevator.projectId === multi.id) &&
      w._lsDB.elevators.some(elevator => elevator.id === otherE2 && elevator.projectId === other.id));

  console.log('\n  -- Representative scalability checks --');
  console.log('     jsdom + fake-indexeddb only; timings are not real-Android results');
  const perfProject = await createProject('P2B2 performance');
  for (const size of [100, 500, 1000]) {
    w._lsDB.elevators = w._lsDB.elevators.filter(elevator => elevator.projectId !== perfProject.id);
    w._lsDB.services = w._lsDB.services.filter(service => service.projectId !== perfProject.id);
    for (let i = 0; i < size; i++) {
      const elevatorId = 'p2b2-perf-e-' + i;
      w._lsDB.elevators.push(Object.assign(w._apiBuildElevator(perfProject, elevatorId, true), { name: 'Perf ' + i }));
      w._lsDB.services.push({
        id: 'p2b2-perf-s-' + size + '-' + i, projectId: perfProject.id, elevatorId,
        customer: 'Perf', complaint: i === size - 1 ? 'p2b2-perf-target-' + size : 'perf',
        date: i + 1, createdAt: i + 1, updatedAt: i + 1
      });
    }
    const elevatorId = 'p2b2-perf-e-' + (size - 1);
    const started = Date.now();
    const list = await listOwned('services', perfProject.id, elevatorId);
    const search = await w.api('/search?q=p2b2-perf-target-' + size + '&projectId=' + encodeURIComponent(perfProject.id) + '&elevatorId=' + encodeURIComponent(elevatorId));
    const perfReport = await w.api('/reports/elevator?projectId=' + encodeURIComponent(perfProject.id) + '&elevatorId=' + encodeURIComponent(elevatorId));
    const elapsedMs = Date.now() - started;
    timings.push({ elevators: size, operations: 'scoped list + search + report', elapsedMs });
    await T(size + ' elevators: scoped list/search/report stay isolated and complete', () =>
      list.length === 1 && list[0].elevatorId === elevatorId &&
      search.results.some(result => result.id === list[0].id) &&
      perfReport.collections.services.length === 1 && elapsedMs < 2000);
    console.log('      timing ' + size + ': ' + elapsedMs + ' ms');
  }

  await T('no uncaught jsdom errors', () => jsdomErrors.length === 0);

  console.log('\nPHASE 2B.2 RESULT: ' + pass + ' passed, ' + fail + ' failed');
  console.log('PERFORMANCE RESULTS (jsdom + fake-indexeddb; NOT real Android): ' + JSON.stringify(timings));
  if (failures.length) {
    console.log('FAILURES:');
    failures.forEach(failure => console.log(' - ' + failure));
  }
  dom.window.close();
  process.exitCode = fail ? 1 : 0;
})().catch(error => {
  console.error('\nPHASE 2B.2 RUNNER FAILED:', error && error.stack || error);
  process.exitCode = 1;
});
