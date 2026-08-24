function _lsLoad() {
  if (_lsDB) return _lsDB;
  try { _lsDB = JSON.parse(localStorage.getItem('zlift_db')); } catch (e) { _lsDB = null; }
  if (!_lsDB || !_lsDB.users) {
    // primary lost — try the mirror before falling back to seed
    try {
      const mirror = JSON.parse(localStorage.getItem('zlift_db_mirror'));
      if (mirror && mirror.users && Array.isArray(mirror.projects)) {
        _lsDB = mirror;
        _lsSave();
      }
    } catch (e) {}
  }
  if (!_lsDB || !_lsDB.users) { _lsDB = _lsSeed(); _lsSave(); }
  if (!_lsDB.parts) _lsDB.parts = _lsSeed().parts;
  if (!_lsDB.settings) _lsDB.settings = { company: 'Z Lift', phone: '', address: '' };
  ['diagSessions', 'calcSaves', 'issues', 'tools', 'photos', 'invoices', 'contracts', 'reminders', 'measurements', 'safetyLogs'].forEach(k => { if (!Array.isArray(_lsDB[k])) _lsDB[k] = []; });
  let _schemaChanged = false;
  if (!_lsDB.schemaVersion) { _lsDB.schemaVersion = 1; _schemaChanged = true; }
  if (+_lsDB.schemaVersion < DB_SCHEMA_VERSION) {
    _lsDB.schemaVersion = DB_SCHEMA_VERSION;
    /* schema v2 introduced an `archivedProjects` collection that no code
       path ever populated (archiving uses the project `archived` flag); it
       is no longer created. Legacy entries, if any, are folded back into
       projects below. */
    _schemaChanged = true;
  }
  /* Phase 2A load-time normalization (idempotent, no deletes):
     - fold any legacy archivedProjects entries into projects (archived:true)
     - clear dangling calcSaves/safetyLogs projectIds left by older builds */
  if (Array.isArray(_lsDB.archivedProjects) && _lsDB.archivedProjects.length &&
      typeof STRUCTURED_DB !== 'undefined' && STRUCTURED_DB.foldArchivedProjects(_lsDB)) _schemaChanged = true;
  if (typeof STRUCTURED_DB !== 'undefined' && STRUCTURED_DB.repairProjectRefs(_lsDB)) _schemaChanged = true;
  if (!_lsDB.sessions || typeof _lsDB.sessions !== 'object') _lsDB.sessions = {};
  _lsPruneSessions();
  _lsMigrateServices();
  if (_schemaChanged) _lsSave();
  return _lsDB;
}

/* drop login sessions older than 180 days (and the current token is always kept) */
function _lsPruneSessions() {
  const db = _lsDB, keep = Date.now() - 180 * 86400000;
  let changed = false;
  Object.keys(db.sessions).forEach(tok => {
    const ss = db.sessions[tok];
    const alive = ss && (+ss.createdAt || 0) >= keep;
    if (!alive && tok !== state.token) { delete db.sessions[tok]; changed = true; }
  });
  return changed;
}

/* Migration: services = independent collection. Idempotent, no deletes, no duplicates. */
function _lsMigrateServices() {
  const db = _lsDB;
  if (!Array.isArray(db.services)) db.services = [];
  let changed = false;
  db.services.forEach(s => {
    if (s.customer === undefined) { s.customer = ''; changed = true; }
    if (s.elevatorInfo === undefined) { s.elevatorInfo = ''; changed = true; }
    if (s.projectId === undefined) { s.projectId = ''; changed = true; }
    if (s.projectId && (!s.customer || !s.elevatorInfo)) {
      const p = db.projects.find(x => x.id === s.projectId);
      if (p) {
        if (!s.customer && p.customer) { s.customer = p.customer; changed = true; }
        if (!s.elevatorInfo) { s.elevatorInfo = [p.name, p.elevatorType === 'hydraulic' ? 'هیدرولیک' : 'کششی'].filter(Boolean).join(' — '); changed = true; }
      } else { s.projectId = ''; changed = true; }
    }
  });
  db.projects.forEach(p => {
    if (Array.isArray(p.services) && p.services.length) {
      p.services.forEach(ns => {
        if (!db.services.find(x => x.id === ns.id)) {
          db.services.push(Object.assign({ projectId: p.id, customer: p.customer || '', elevatorInfo: p.name || '' }, ns));
        }
      });
      delete p.services;
      changed = true;
    }
  });
  // Older builds could leave optional links dangling after deleting a service or
  // photo. Detach those links without deleting the historical parent record.
  const serviceIds = new Set(db.services.map(x => x.id));
  const photoIds = new Set((db.photos || []).map(x => x.id));
  (db.invoices || []).forEach(x => { if (x.serviceId && !serviceIds.has(x.serviceId)) { x.serviceId = ''; changed = true; } });
  (db.measurements || []).forEach(x => {
    if (x.serviceId && !serviceIds.has(x.serviceId)) { x.serviceId = ''; changed = true; }
    if (x.photoId && !photoIds.has(x.photoId)) { x.photoId = ''; changed = true; }
  });
  if (changed) _lsSave();
}

var _lsMirrorTick = 0;
async function _lsSave(dbOverride) {
  const data = dbOverride || _lsDB;
  let raw;
  try { raw = JSON.stringify(data); }
  catch (e) { console.error('[ZLift] serialize failed', e); throw e; }

  /* IndexedDB is primary after migration. A successful call means the IDB
     transaction completed; the legacy localStorage source remains untouched as
     recovery evidence, rather than becoming a second diverging database. */
  if (STRUCTURED_DB.status().mode === 'pending') await STRUCTURED_DB.ready();
  if (STRUCTURED_DB.status().mode === 'indexedDB') {
    await STRUCTURED_DB.save(data);
    window._lsSaveFailed = false;
    return true;
  }

  /* Safe fallback for browsers/private modes without usable IndexedDB. */
  try {
    localStorage.setItem('zlift_db', raw);
    window._lsSaveFailed = false;
    if (++_lsMirrorTick % 10 === 1) {
      try { localStorage.setItem('zlift_db_mirror', raw); } catch (e2) {}
    }
    return true;
  } catch (e) {
    try {
      localStorage.removeItem('zlift_db_mirror');
      localStorage.setItem('zlift_db', raw);
      window._lsSaveFailed = false;
      return true;
    } catch (e2) {}
    if (!window._lsSaveFailed) {
      window._lsSaveFailed = true;
      try { toast(t('storageFull'), 'err'); } catch (e3) { alert('Storage full! حافظه پر است — عکس‌های قدیمی را حذف و بکاپ بگیرید.'); }
    }
    throw e;
  }
}
function _lsUsage() {
  try {
    const raw = localStorage.getItem('zlift_db') || '';
    return { bytes: raw.length * 2, photos: (_lsDB && _lsDB.photos ? _lsDB.photos.length : 0) };
  } catch (e) { return { bytes: 0, photos: 0 }; }
}
function normSvcParts(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 50).map(p => ({
    partId: p && p.partId ? String(p.partId) : '',
    name: p && p.name ? String(p.name).slice(0, 120) : '',
    qty: Math.max(1, Math.round(+(p && p.qty) || 1))
  })).filter(p => p.name);
}
function _lsErr(code, status) { const e = new Error(code); e.code = code; e.status = status || 400; return e; }
/* Phase 2B.0 BUG-2 — resolve a project reference destined for a NESTED
   historical row (parts.history[]). A reference written into history cannot be
   re-pointed later, so it is resolved once, at the seam where the row is
   created: an id that is not a live project becomes '' — the documented
   "no project context" value — instead of a string that merely looks like a
   project id and would dangle forever. Nothing is invented and nothing is
   reassigned to a different project. */
function resolveProjectRef(db, projectId) {
  const id = projectId == null ? '' : String(projectId);
  if (!id) return '';
  return (db.projects || []).some(p => p && p.id === id) ? id : '';
}
function invoicePartQuantities(items) {
  const totals = {};
  (Array.isArray(items) ? items : []).forEach(row => {
    if (!row || !row.partId) return;
    const qty = Math.max(0, Math.round(+row.qty || 0));
    if (qty) totals[String(row.partId)] = (totals[String(row.partId)] || 0) + qty;
  });
  return totals;
}
function _invoiceFiniteNonNegative(value) {
  const n = Number(value == null || value === '' ? 0 : value);
  return Number.isFinite(n) && n >= 0;
}
function validateInvoicePayloadInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw _lsErr('invalid_invoice');
  if (body.items != null && !Array.isArray(body.items)) throw _lsErr('invalid_invoice');
  if (body.payments != null && !Array.isArray(body.payments)) throw _lsErr('invalid_invoice');
  for (const row of (body.items || [])) {
    if (!row || typeof row !== 'object' || !_invoiceFiniteNonNegative(row.qty) || !_invoiceFiniteNonNegative(row.price)) throw _lsErr('invalid_invoice');
    if ((row.desc || row.partId || +row.price) && !(Number(row.qty) > 0)) throw _lsErr('invalid_invoice');
  }
  for (const pay of (body.payments || [])) {
    if (!pay || typeof pay !== 'object' || !_invoiceFiniteNonNegative(pay.amount) || !(Number(pay.amount) > 0)) throw _lsErr('invalid_invoice');
    if (pay.date != null && (!Number.isFinite(Number(pay.date)) || Number(pay.date) <= 0)) throw _lsErr('invalid_invoice');
  }
  for (const key of ['labor', 'discount']) if (!_invoiceFiniteNonNegative(body[key])) throw _lsErr('invalid_invoice');
  if (body.taxRate != null && (!Number.isFinite(Number(body.taxRate)) || Number(body.taxRate) < 0 || Number(body.taxRate) > 100)) throw _lsErr('invalid_invoice');
  if (body.date != null && (!Number.isFinite(Number(body.date)) || Number(body.date) <= 0)) throw _lsErr('invalid_invoice');
}
function normalizeInvoicePayload(body) {
  validateInvoicePayloadInput(body);
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 200).map(row => ({
    desc: String(row && row.desc || '').slice(0, 240),
    qty: Math.round(Number(row.qty)),
    price: Math.round(Number(row.price)),
    partId: row && row.partId ? String(row.partId) : undefined
  })).filter(row => row.desc || row.price || row.partId);
  const payments = (Array.isArray(body.payments) ? body.payments : []).slice(0, 200).map(pay => ({
    amount: Math.max(0, Math.round(+(pay && pay.amount) || 0)),
    date: +(pay && pay.date) || Date.now(), note: String(pay && pay.note || '').slice(0, 240)
  })).filter(pay => pay.amount > 0);
  return Object.assign({}, body, {
    customer: String(body.customer || '').trim().slice(0, 240), items, payments,
    clientMutationId: String(body.clientMutationId || '').slice(0, 120),
    labor: Math.max(0, Math.round(+body.labor || 0)), discount: Math.max(0, Math.round(+body.discount || 0)),
    taxRate: body.taxExempt ? 0 : Math.max(0, Math.min(100, +body.taxRate || 0)), taxExempt: !!body.taxExempt
  });
}
function uniqueInvoiceNumber(db, requested, ignoreId) {
  const used = new Set((db.invoices || []).filter(x => x && x.id !== ignoreId && x.number != null).map(x => String(x.number).trim()).filter(Boolean));
  if (requested != null && String(requested).trim()) {
    const value = String(requested).trim().slice(0, 80);
    if (used.has(value)) throw _lsErr('duplicate_invoice_number');
    return value;
  }
  let seq = Math.max(0, Math.floor(+((db.settings || {}).invoiceSeq) || 0));
  do { seq++; } while (used.has(String(seq)));
  return { number: String(seq), seq };
}
function applyInvoiceInventory(db, beforeItems, afterItems, invoiceId, projectId, effectVersion) {
  const before = invoicePartQuantities(beforeItems), after = invoicePartQuantities(afterItems);
  const ids = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes = [];
  // Validate every increase before mutating anything.
  ids.forEach(id => {
    const delta = (after[id] || 0) - (before[id] || 0);
    const part = db.parts.find(p => p.id === id);
    if (!part) throw _lsErr('invoice_part_not_found');
    if (delta > 0 && (+part.qty || 0) < delta) throw _lsErr('insufficient_stock');
    changes.push({ part, delta });
  });
  changes.forEach(({ part, delta }) => {
    if (!delta) return;
    const prevQty = Math.max(0, +part.qty || 0);
    part.qty = prevQty - delta; // validated above; negative delta returns stock
    part.updatedAt = Date.now();
    if (!Array.isArray(part.history)) part.history = [];
    part.history.unshift({
      id: _lsUid(), qty: -delta, date: Date.now(), projectId: resolveProjectRef(db, projectId), serviceId: '',
      invoiceId: String(invoiceId), effectKey: 'invoice:' + invoiceId + ':v' + effectVersion,
      note: delta > 0 ? 'invoice consumption' : 'invoice return', prevQty, newQty: part.qty
    });
    if (part.history.length > 100) part.history.length = 100;
  });
  return changes.map(x => x.part);
}

/* ---- LOCAL PERSISTENCE — the actual data-access implementation ----
   Mimics a REST API but resolves entirely against localStorage/IndexedDB. */
async function _apiLocal(path, opts = {}) {
  await STRUCTURED_DB.ready();
  const db = _lsLoad();
  const method = (opts.method || 'GET').toUpperCase();
  const b = opts.body || {};
  const parts = path.split('?')[0].split('/').filter(Boolean);

  /* auth */
  if (path === '/auth/login' && method === 'POST') {
    const u = db.users.find(x => x.username === String(b.username || '').trim().toLowerCase());
    if (!u || u.password !== _lsHash(String(b.password || ''))) throw _lsErr('invalid_credentials', 401);
    const token = _lsUid() + _lsUid();
    db.sessions[token] = { userId: u.id, createdAt: Date.now() };
    await _lsSave();
    return { token, user: { id: u.id, username: u.username, name: u.name, role: u.role } };
  }
  if (path === '/auth/register' && method === 'POST') {
    const username = String(b.username || '').trim().toLowerCase();
    if (!username || username.length < 3) throw _lsErr('bad_username');
    if (String(b.password || '').length < 6) throw _lsErr('weak_password');
    if (db.users.find(x => x.username === username)) throw _lsErr('username_taken', 409);
    const u = { id: _lsUid(), username, name: String(b.name || '').trim() || username, password: _lsHash(String(b.password)), role: 'technician', createdAt: Date.now() };
    db.users.push(u);
    const token = _lsUid() + _lsUid();
    db.sessions[token] = { userId: u.id, createdAt: Date.now() };
    await _lsSave();
    return { token, user: { id: u.id, username: u.username, name: u.name, role: u.role } };
  }

  const sess = state.token && db.sessions[state.token];
  const me = sess ? db.users.find(u => u.id === sess.userId) : null;
  if (!me && !path.startsWith('/auth/')) { doLocalLogout(); throw _lsErr('unauthorized', 401); }

  if (path === '/auth/logout') { if (state.token) delete db.sessions[state.token]; await _lsSave(); return { ok: true }; }
  if (path === '/auth/me') {
    if (!me) throw _lsErr('unauthorized', 401);
    return { user: { id: me.id, username: me.username, name: me.name, role: me.role } };
  }

  /* projects */
  if (path === '/projects' && method === 'GET') return { projects: [...db.projects].sort((a, c) => c.updatedAt - a.updatedAt) };
  if (path === '/projects' && method === 'POST') {
    if (!b.name || !String(b.name).trim()) throw _lsErr('name_required');
    const p = {
      id: _lsUid(), name: String(b.name).trim(), customer: String(b.customer || ''), phone: String(b.phone || ''),
      location: String(b.location || ''), elevatorType: b.elevatorType === 'hydraulic' ? 'hydraulic' : 'traction',
      capacityKg: +b.capacityKg || 0, persons: +b.persons || 0, floors: +b.floors || 0, stops: +b.stops || 0,
      speed: +b.speed || 0, nominalVoltage: +b.nominalVoltage || 0,
      voltageTolerance: b.voltageTolerance == null || b.voltageTolerance === '' ? null : Math.max(0, +b.voltageTolerance || 0),
      controller: String(b.controller || ''), motor: String(b.motor || ''),
      drive: String(b.drive || ''), doorOperator: String(b.doorOperator || ''),
      roping: b.roping === '2:1' ? '2:1' : '1:1', encoder: String(b.encoder || ''), brake: String(b.brake || ''),
      status: b.status || 'contract', progress: Math.max(0, Math.min(100, +b.progress || 0)),
      serviceIntervalDays: +b.serviceIntervalDays || 0, notes: String(b.notes || ''),
      createdAt: Date.now(), updatedAt: Date.now()
    };
    db.projects.push(p); await _lsSave();
    return { project: p };
  }
  if (parts[0] === 'projects' && parts[1]) {
    const p = db.projects.find(x => x.id === parts[1]);
    if (!p) throw _lsErr('not_found', 404);
    if (method === 'GET') return { project: p, services: db.services.filter(s => s.projectId === p.id), checklists: db.checklists.filter(c => c.projectId === p.id) };
    if (method === 'PUT') {
      ['name', 'customer', 'phone', 'location', 'elevatorType', 'controller', 'motor', 'drive', 'doorOperator', 'roping', 'encoder', 'brake', 'status', 'notes'].forEach(f => { if (b[f] !== undefined) p[f] = String(b[f]); });
      ['capacityKg', 'persons', 'floors', 'stops', 'speed', 'serviceIntervalDays', 'nominalVoltage'].forEach(f => { if (b[f] !== undefined) p[f] = +b[f] || 0; });
      if (b.voltageTolerance !== undefined) p.voltageTolerance = b.voltageTolerance == null || b.voltageTolerance === '' ? null : Math.max(0, +b.voltageTolerance || 0);
      if (b.progress !== undefined) p.progress = Math.max(0, Math.min(100, +b.progress || 0));
      /* archive flags are persisted explicitly through the API path — the
         client must never depend on shared object references for archival
         (reference-based persistence breaks under cloning, rehydration or
         multi-tab use). Omitting the fields (normal edit) preserves state. */
      if (b.archived !== undefined) p.archived = !!b.archived;
      if (b.archivedAt !== undefined) p.archivedAt = +b.archivedAt || Date.now();
      if (p.elevatorType !== 'hydraulic') p.elevatorType = 'traction';
      p.updatedAt = Date.now(); await _lsSave();
      return { project: p };
    }
    if (method === 'DELETE') {
      /* Historical technical records are NEVER destroyed with the project:
         they are detached but stamped with the elevator/project context so the
         service history stays logically connected to the correct elevator. */
      const pInfo = [p.name, p.customer, p.location].filter(Boolean).join(' — ');
      const stamp = (rec) => { if (!rec.projectInfo) rec.projectInfo = pInfo; rec.projectId = ''; };
      db.services.forEach(s => {
        if (s.projectId === p.id) {
          if (!s.customer) s.customer = p.customer || p.name || '';
          if (!s.elevatorInfo) s.elevatorInfo = [p.name, p.location].filter(Boolean).join(' — ');
          stamp(s);
        }
      });
      /* every project-owned collection is detached and stamped — calcSaves and
         safetyLogs used to be missed here, leaving dangling projectId refs
         behind after a project deletion (relationship verification now also
         covers them, so a miss would break boot verification) */
      ['measurements', 'photos', 'invoices', 'diagSessions', 'issues', 'contracts', 'reminders', 'checklists', 'calcSaves', 'safetyLogs'].forEach(k => {
        if (Array.isArray(db[k])) db[k].forEach(r => { if (r && r.projectId === p.id) stamp(r); });
      });
      /* Phase 2B.0 BUG-2 — nested inventory history references are detached and
         stamped through the SAME canonical iterator the recovery repair uses,
         so the two paths cannot drift. The history entry itself is preserved
         (quantity, date, note, running totals, id untouched); only the link to
         the project that no longer exists is replaced by the context stamp. */
      if (typeof STRUCTURED_DB !== 'undefined' && STRUCTURED_DB.eachNestedProjectRef) {
        STRUCTURED_DB.eachNestedProjectRef(db, entry => { if (entry.projectId === p.id) stamp(entry); });
      }
      /* Phase 2B.0 BUG-1 — a checklist's elevator dimension is the project id
         under the current 1:1 model, so it must not survive as a reference to
         the deleted identifier. No-op on every record this build writes. */
      (Array.isArray(db.checklists) ? db.checklists : []).forEach(c => detachChecklistElevatorRef(c, p.id));
      db.projects = db.projects.filter(x => x.id !== p.id);
      await _lsSave();
      return { ok: true };
    }
  }

  /* services */
  if (path === '/services' && method === 'GET') return { services: [...db.services].sort((a, c) => c.date - a.date) };
  if (path === '/services' && method === 'POST') {
    const projectId = b.projectId && db.projects.find(x => x.id === b.projectId) ? b.projectId : '';
    if (!projectId && !String(b.customer || '').trim()) throw _lsErr('customer_required');
    /* sequential, human-friendly report number (stored in settings so it survives backup/restore) */
    db.settings = db.settings || {};
    const seq = Math.max(1, (+db.settings.reportSeq || 0) + 1);
    db.settings.reportSeq = seq;
    const s = {
      id: _lsUid(), reportNo: 'SR-' + String(seq).padStart(4, '0'), projectId, customer: String(b.customer || ''), elevatorInfo: String(b.elevatorInfo || ''), date: +b.date || Date.now(),
      technician: String(b.technician || (me && me.name) || ''),
      serviceType: ['maintenance', 'repair', 'emergency', 'inspection'].includes(b.serviceType) ? b.serviceType : 'maintenance',
      complaint: String(b.complaint || ''), problem: String(b.problem || ''), diagnosis: String(b.diagnosis || ''),
      measurements: String(b.measurements || ''), workDone: String(b.workDone || ''), partsReplaced: String(b.partsReplaced || ''),
      partsUsed: normSvcParts(b.partsUsed),
      recommendations: String(b.recommendations || ''), followUpDate: +b.followUpDate || 0,
      finalStatus: ['ok', 'followup', 'outoforder'].includes(b.finalStatus) ? b.finalStatus : 'ok',
      signTech: String(b.signTech || ''), signCustomer: String(b.signCustomer || ''),
      createdAt: Date.now()
    };
    db.services.push(s); await _lsSave();
    return { service: s };
  }
  if (parts[0] === 'services' && parts[1]) {
    const s = db.services.find(x => x.id === parts[1]);
    if (!s) throw _lsErr('not_found', 404);
    if (method === 'PUT') {
      ['technician', 'customer', 'elevatorInfo', 'complaint', 'problem', 'diagnosis', 'measurements', 'workDone', 'partsReplaced', 'recommendations'].forEach(f => { if (b[f] !== undefined) s[f] = String(b[f]); });
      if (b.followUpDate !== undefined) s.followUpDate = +b.followUpDate || 0;
      if (b.projectId !== undefined) s.projectId = (b.projectId && db.projects.find(x => x.id === b.projectId)) ? b.projectId : '';
      if (b.date !== undefined) s.date = +b.date || s.date;
      if (b.serviceType && ['maintenance', 'repair', 'emergency', 'inspection'].includes(b.serviceType)) s.serviceType = b.serviceType;
      if (b.finalStatus && ['ok', 'followup', 'outoforder'].includes(b.finalStatus)) s.finalStatus = b.finalStatus;
      if (b.signTech !== undefined) s.signTech = String(b.signTech || '');
      if (b.signCustomer !== undefined) s.signCustomer = String(b.signCustomer || '');
      if (Array.isArray(b.partsUsed)) s.partsUsed = normSvcParts(b.partsUsed);
      await _lsSave();
      return { service: s };
    }
    if (method === 'DELETE') {
      db.services = db.services.filter(x => x.id !== s.id);
      (db.invoices || []).forEach(x => { if (x.serviceId === s.id) x.serviceId = ''; });
      (db.measurements || []).forEach(x => { if (x.serviceId === s.id) x.serviceId = ''; });
      await _lsSave(); return { ok: true };
    }
  }

  /* notes */
  if (path === '/notes' && method === 'GET') return { notes: [...db.notes].sort((a, c) => c.createdAt - a.createdAt) };
  if (path === '/notes' && method === 'POST') {
    if (!b.title || !String(b.title).trim()) throw _lsErr('title_required');
    const n = { id: _lsUid(), title: String(b.title).trim(), content: String(b.content || ''), tags: Array.isArray(b.tags) ? b.tags.map(String).slice(0, 10) : [], createdAt: Date.now() };
    db.notes.push(n); await _lsSave();
    return { note: n };
  }
  if (parts[0] === 'notes' && parts[1]) {
    const n = db.notes.find(x => x.id === parts[1]);
    if (!n) throw _lsErr('not_found', 404);
    if (method === 'PUT') {
      if (b.title !== undefined) n.title = String(b.title);
      if (b.content !== undefined) n.content = String(b.content);
      if (Array.isArray(b.tags)) n.tags = b.tags.map(String).slice(0, 10);
      await _lsSave();
      return { note: n };
    }
    if (method === 'DELETE') { db.notes = db.notes.filter(x => x.id !== n.id); await _lsSave(); return { ok: true }; }
  }

  /* checklists */
  if (path === '/checklists' && method === 'GET') return { checklists: db.checklists };
  if (path === '/checklists' && method === 'POST') {
    if (!b.projectId || !b.templateId) throw _lsErr('bad_request');
    /* Phase 2B.0 BUG-1 — this is an UPSERT against the checklist's LOGICAL
       identity, not against its storage id, and the identity is owned by
       findChecklistInstance() (js/data/checklist-data.js). Looking the record
       up by (projectId, templateId) here was the collision: a second elevator
       in the same project running the same template matched the first
       elevator's row and replaced its answers.

       `elevatorId` is optional and is ONLY persisted when a caller supplies
       it. The current 1:1 UI never does, so records written by this build are
       byte-identical to before — no field is added, no id is regenerated, no
       migration runs. When it is supplied it becomes part of the identity, so
       two elevator contexts in one project can no longer overwrite each
       other. Omitting it resolves to the project id (today's elevator). */
    const elevatorId = normalizeChecklistElevatorId(b.elevatorId);
    let c = findChecklistInstance(db.checklists, b.projectId, String(b.templateId), elevatorId);
    if (!c) {
      c = { id: _lsUid(), projectId: b.projectId, templateId: String(b.templateId), checked: {}, updatedAt: Date.now() };
      if (elevatorId) c.elevatorId = elevatorId;
      db.checklists.push(c);
    }
    if (b.checked && typeof b.checked === 'object') c.checked = b.checked;
    c.updatedAt = Date.now(); await _lsSave();
    return { checklist: c };
  }

  /* parts */
  if (path === '/parts' && method === 'GET') return { parts: [...db.parts].sort((a, c) => a.name.localeCompare(c.name, 'fa')) };
  if (path === '/parts' && method === 'POST') {
    if (!b.name || !String(b.name).trim()) throw _lsErr('name_required');
    const part = { id: _lsUid(), name: String(b.name).trim(), category: String(b.category || 'عمومی'), unit: String(b.unit || 'عدد'), qty: +b.qty || 0, minQty: +b.minQty || 0, price: +b.price || 0, location: String(b.location || ''), note: String(b.note || ''), supplier: String(b.supplier || ''), code: String(b.code || ''), updatedAt: Date.now() };
    db.parts.push(part); await _lsSave();
    return { part };
  }
  if (parts[0] === 'parts' && parts[1]) {
    const part = db.parts.find(x => x.id === parts[1]);
    if (!part) throw _lsErr('not_found', 404);
    if (method === 'PUT') {
      ['name', 'category', 'unit', 'location', 'note', 'supplier', 'code'].forEach(f => { if (b[f] !== undefined) part[f] = String(b[f]); });
      const prevQty = part.qty;
      ['qty', 'minQty', 'price'].forEach(f => { if (b[f] !== undefined) part[f] = Math.max(0, +b[f] || 0); });
      if (b.qty !== undefined && part.qty !== prevQty) {
        if (!Array.isArray(part.history)) part.history = [];
        part.history.unshift({ id: _lsUid(), qty: part.qty - prevQty, date: Date.now(), projectId: '', serviceId: '', note: 'adjustment', prevQty, newQty: part.qty });
        if (part.history.length > 100) part.history.length = 100;
      }
      part.updatedAt = Date.now(); await _lsSave();
      return { part };
    }
    if (method === 'DELETE') { db.parts = db.parts.filter(x => x.id !== part.id); await _lsSave(); return { ok: true }; }
  }



  /* invoices + inventory: one logical mutation and one atomic IDB commit.
     effectVersion/effectKey make repeated identical edits idempotent (delta=0)
     and provide an auditable consumption/return trail. */
  if (path === '/invoices' && method === 'GET') return { items: [...db.invoices].sort((a, c) => (c.createdAt || 0) - (a.createdAt || 0)) };
  if (path === '/invoices' && method === 'POST') {
    const payload = normalizeInvoicePayload(b);
    if (!payload.customer) throw _lsErr('customer_required');
    /* Retry-safe create: a stable caller mutation id may only create one invoice.
       The duplicate response has no changed parts because the original atomic
       transaction already owns the inventory effect. */
    if (payload.clientMutationId) {
      const existing = db.invoices.find(x => x.clientMutationId === payload.clientMutationId);
      if (existing) return { item: existing, changedParts: [], duplicate: true };
    }
    db.settings = db.settings || {};
    const oldSeq = +db.settings.invoiceSeq || 0;
    const numberResult = uniqueInvoiceNumber(db, b.number, null);
    const invoiceNumber = typeof numberResult === 'string' ? numberResult : numberResult.number;
    const seq = typeof numberResult === 'string' ? oldSeq : numberResult.seq;
    const item = Object.assign({}, payload, {
      id: _lsUid(), number: invoiceNumber,
      taxRate: payload.taxExempt ? 0 : Math.max(0, Math.min(100, +(b.taxRate != null ? b.taxRate : db.settings.taxRate) || 0)),
      inventoryApplied: true, inventoryEffectVersion: 1,
      createdAt: Date.now(), updatedAt: Date.now()
    });
    const partsSnapshot = JSON.parse(JSON.stringify(db.parts));
    try {
      const changedParts = applyInvoiceInventory(db, [], item.items, item.id, item.projectId, 1);
      db.settings.invoiceSeq = seq;
      db.invoices.unshift(item);
      await _lsSave();
      return { item, changedParts };
    } catch (e) {
      db.parts = partsSnapshot; db.settings.invoiceSeq = oldSeq;
      db.invoices = db.invoices.filter(x => x.id !== item.id);
      throw e;
    }
  }
  if (parts[0] === 'invoices' && parts[1]) {
    const item = db.invoices.find(x => x.id === parts[1]);
    if (!item) throw _lsErr('not_found', 404);
    if (method === 'GET') return { item };
    if (method === 'PUT') {
      const payload = normalizeInvoicePayload(Object.assign({}, item, b));
      if (!payload.customer) throw _lsErr('customer_required');
      const before = JSON.parse(JSON.stringify(item));
      const partsSnapshot = JSON.parse(JSON.stringify(db.parts));
      const version = Math.max(0, +item.inventoryEffectVersion || 0) + 1;
      try {
        const changedParts = applyInvoiceInventory(db, item.items || [], payload.items || [], item.id, payload.projectId, version);
        Object.keys(payload).forEach(k => { if (k !== 'id' && k !== 'createdAt' && k !== 'number') item[k] = payload[k]; });
        item.inventoryApplied = true; item.inventoryEffectVersion = version;
        if (!item.number) {
          const generated = uniqueInvoiceNumber(db, null, item.id);
          db.settings.invoiceSeq = generated.seq;
          item.number = generated.number;
        }
        item.taxRate = item.taxExempt ? 0 : Math.max(0, Math.min(100, +item.taxRate || 0));
        item.updatedAt = Date.now();
        await _lsSave();
        return { item, changedParts };
      } catch (e) {
        db.parts = partsSnapshot; Object.keys(item).forEach(k => delete item[k]); Object.assign(item, before); throw e;
      }
    }
    if (method === 'DELETE') {
      const beforeIndex = db.invoices.indexOf(item);
      const partsSnapshot = JSON.parse(JSON.stringify(db.parts));
      try {
        const version = Math.max(0, +item.inventoryEffectVersion || 0) + 1;
        const changedParts = item.inventoryApplied === false ? [] : applyInvoiceInventory(db, item.items || [], [], item.id, item.projectId, version);
        db.invoices.splice(beforeIndex, 1);
        await _lsSave();
        return { ok: true, changedParts };
      } catch (e) {
        db.parts = partsSnapshot;
        if (!db.invoices.find(x => x.id === item.id)) db.invoices.splice(Math.max(0, beforeIndex), 0, item);
        throw e;
      }
    }
  }

  /* measurements — normalise Persian/Arabic numerals and compute status */
  if (parts[0] === 'measurements') {
    if (!parts[1] && method === 'GET') return { items: [...db.measurements].sort((a, c) => (c.ts || c.createdAt || 0) - (a.ts || a.createdAt || 0)) };
    if (!parts[1] && method === 'POST') {
      const typeId = String(b.typeId || '');
      const field = (typeof MEASURE_FIELDS_BY_ID !== 'undefined') ? MEASURE_FIELDS_BY_ID[typeId] : null;
      let value = b.value;
      if (field && !field.state && !field.text) {
        const n = parseNum(b.value); if (n == null) throw _lsErr('invalid_measurement'); value = n;
      }
      const expectedMin = parseNum(b.expectedMin != null ? b.expectedMin : b.expectedRange && b.expectedRange.min);
      const expectedMax = parseNum(b.expectedMax != null ? b.expectedMax : b.expectedRange && b.expectedRange.max);
      const item = {
        id: _lsUid(), typeId, kind: b.kind === 'state' ? 'state' : (field && field.text ? 'text' : 'numeric'),
        value, unit: field ? String(field.unit || '') : String(b.unit || '').slice(0, 30),
        point: String(b.point || b.measurementPoint || '').slice(0, 120), measurementPoint: String(b.measurementPoint || b.point || '').slice(0, 120),
        location: String(b.location || '').slice(0, 120), mode: String(b.mode || '').slice(0, 120),
        component: String(b.component || b.equipment || '').slice(0, 120), equipment: String(b.equipment || b.component || '').slice(0, 120),
        manufacturer: String(b.manufacturer || '').slice(0, 120), model: String(b.model || '').slice(0, 120),
        configuration: String(b.configuration || '').slice(0, 300), testMethod: String(b.testMethod || '').slice(0, 300),
        testVoltage: parseNum(b.testVoltage), expectedMin, expectedMax,
        expectedRange: { min: expectedMin, max: expectedMax, unit: field ? field.unit : String((b.expectedRange && b.expectedRange.unit) || '') },
        reference: String(b.reference || '').slice(0, 300), thresholdClass: (field && field.thresholdClass) || THRESHOLD_CLASS.UNKNOWN,
        context: b.context && typeof b.context === 'object' ? Object.assign({}, b.context) : {},
        condition: String(b.condition || '').slice(0, 200), observation: String(b.observation || b.technicianNote || '').slice(0, 500),
        note: String(b.note || '').slice(0, 500), technicianNote: String(b.technicianNote || b.observation || '').slice(0, 500),
        refType: ['tech', 'standard', 'manual'].includes(b.refType) ? b.refType : 'tech',
        projectId: b.projectId && db.projects.find(x => x.id === b.projectId) ? b.projectId : '',
        serviceId: b.serviceId && db.services.find(x => x.id === b.serviceId) ? String(b.serviceId) : '',
        photoId: b.photoId && db.photos.find(x => x.id === b.photoId) ? String(b.photoId) : '',
        diagSessionId: b.diagSessionId ? String(b.diagSessionId) : '',
        technician: String(b.technician || (me && me.name) || ''),
        ts: +b.ts || +b.timestamp || Date.now(), timestamp: +b.timestamp || +b.ts || Date.now(),
        status: 'unknown', reason: null, nextStep: null, createdAt: Date.now(), updatedAt: Date.now()
      };
      try { const result = evalMeasurement(item); item.status = result.status || 'unknown'; item.reason = result.reason || null; item.nextStep = result.next || null; } catch (e) {}
      db.measurements.push(item); await _lsSave();
      return { item };
    }
    if (parts[1]) {
      const item = db.measurements.find(x => x.id === parts[1]);
      if (!item) throw _lsErr('not_found', 404);
      if (method === 'GET') return { item };
      if (method === 'PUT') {
        if (b.typeId !== undefined) item.typeId = String(b.typeId);
        const field = (typeof MEASURE_FIELDS_BY_ID !== 'undefined') ? MEASURE_FIELDS_BY_ID[item.typeId] : null;
        if (b.value !== undefined) {
          if (field && !field.state && !field.text) { const n = parseNum(b.value); item.value = n == null ? item.value : n; }
          else item.value = b.value;
        }
        ['point', 'measurementPoint', 'location', 'mode', 'component', 'equipment', 'manufacturer', 'model', 'configuration', 'testMethod', 'reference', 'condition', 'observation', 'note', 'technicianNote', 'refType'].forEach(k => { if (b[k] !== undefined) item[k] = String(b[k]).slice(0, k === 'note' || k === 'observation' || k === 'technicianNote' ? 500 : 300); });
        item.unit = field ? String(field.unit || '') : String(b.unit || item.unit || '').slice(0, 30);
        ['testVoltage', 'expectedMin', 'expectedMax'].forEach(k => { if (b[k] !== undefined) item[k] = parseNum(b[k]); });
        if (b.expectedRange && typeof b.expectedRange === 'object') item.expectedRange = { min: parseNum(b.expectedRange.min), max: parseNum(b.expectedRange.max), unit: String(b.expectedRange.unit || (field && field.unit) || '') };
        else item.expectedRange = { min: item.expectedMin, max: item.expectedMax, unit: (field && field.unit) || '' };
        item.thresholdClass = (field && field.thresholdClass) || THRESHOLD_CLASS.UNKNOWN;
        if (b.context && typeof b.context === 'object') item.context = Object.assign({}, b.context);
        if (b.projectId !== undefined) item.projectId = b.projectId && db.projects.find(x => x.id === b.projectId) ? b.projectId : '';
        if (b.serviceId !== undefined) item.serviceId = b.serviceId && db.services.find(x => x.id === b.serviceId) ? String(b.serviceId) : '';
        if (b.photoId !== undefined) item.photoId = b.photoId && db.photos.find(x => x.id === b.photoId) ? String(b.photoId) : '';
        if (b.ts !== undefined || b.timestamp !== undefined) { item.ts = +(b.ts || b.timestamp) || item.ts; item.timestamp = item.ts; }
        try { const result = evalMeasurement(item); item.status = result.status || 'unknown'; item.reason = result.reason || null; item.nextStep = result.next || null; } catch (e) {}
        item.updatedAt = Date.now(); await _lsSave();
        return { item };
      }
      if (method === 'DELETE') { db.measurements = db.measurements.filter(x => x.id !== item.id); await _lsSave(); return { ok: true }; }
    }
  }

  /* generic collections */
  const GENERIC = ['diagSessions', 'calcSaves', 'issues', 'tools', 'photos', 'contracts', 'safetyLogs'];
  if (parts[0] && GENERIC.includes(parts[0])) {
    const coll = db[parts[0]];
    if (!parts[1] && method === 'GET') return { items: [...coll].sort((a, c) => (c.createdAt || 0) - (a.createdAt || 0)) };
    if (!parts[1] && method === 'POST') {
      if (parts[0] === 'photos' && String(b.data || '').length > 2500000) throw _lsErr('too_large', 413);
      const item = Object.assign({}, b, { id: _lsUid(), createdAt: Date.now(), updatedAt: Date.now() });
      if (parts[0] === 'photos' && typeof item.data === 'string' && item.data) {
        /* offload the payload to IndexedDB; keep inline on any failure */
        try {
          await IDB_PHOTOS.put(item.id, item.data);
          item.inIdb = true; item.data = '';
        } catch (e) { item.inIdb = false; }
      }
      coll.push(item); await _lsSave();
      return { item };
    }
    if (parts[1]) {
      const item = coll.find(x => x.id === parts[1]);
      if (!item) throw _lsErr('not_found', 404);
      if (method === 'PUT') {
        Object.keys(b).forEach(k => { if (k !== 'id' && k !== 'createdAt') item[k] = b[k]; });
        item.updatedAt = Date.now(); await _lsSave();
        return { item };
      }
      if (method === 'DELETE') {
        if (parts[0] === 'photos') {
          if (item.inIdb && IDB_PHOTOS.available()) { try { await IDB_PHOTOS.del(item.id); } catch (e) {} }
          (db.measurements || []).forEach(x => { if (x.photoId === item.id) x.photoId = ''; });
        }
        db[parts[0]] = coll.filter(x => x.id !== item.id); await _lsSave(); return { ok: true };
      }
    }
  }

  /* parts consumption */
  if (path === '/parts-consume' && method === 'POST') {
    const part = db.parts.find(x => x.id === b.partId);
    if (!part) throw _lsErr('not_found', 404);
    const qty = Math.max(1, +b.qty || 1);
    const prevQ = Math.max(0, +part.qty || 0);
    /* stock never goes negative; when the request exceeds what is on the shelf the
       shortage is recorded and surfaced (shortQty) instead of being silently swallowed */
    const shortQty = Math.max(0, qty - prevQ);
    part.qty = Math.max(0, prevQ - qty);
    part.updatedAt = Date.now();
    if (!Array.isArray(part.history)) part.history = [];
    part.history.unshift({ id: _lsUid(), qty: -qty, shortQty: shortQty || undefined, date: Date.now(), projectId: resolveProjectRef(db, b.projectId), serviceId: String(b.serviceId || ''), note: String(b.note || ''), prevQty: prevQ, newQty: part.qty });
    if (part.history.length > 100) part.history.length = 100;
    await _lsSave();
    return { part, shortQty: shortQty || 0, stock: part.qty };
  }

  /* reminders */
  if (path === '/reminders' && method === 'GET') return { reminders: [...db.reminders].sort((a, c) => a.due - c.due) };
  if (path === '/reminders' && method === 'POST') {
    if (!b.title || !String(b.title).trim()) throw _lsErr('name_required');
    const r = {
      id: _lsUid(), title: String(b.title).trim(), due: +b.due || (Date.now() + 7 * 86400000),
      kind: b.kind === 'periodic' || b.kind === 'followup' ? b.kind : 'custom', projectId: String(b.projectId || ''),
      done: !!b.done, doneTs: b.done ? Date.now() : 0, createdAt: Date.now(), updatedAt: Date.now()
    };
    db.reminders.push(r); await _lsSave();
    return { reminder: r };
  }
  if (parts[0] === 'reminders' && parts[1]) {
    const r = db.reminders.find(x => x.id === parts[1]);
    if (!r) throw _lsErr('not_found', 404);
    if (method === 'PUT') {
      if (b.title !== undefined) r.title = String(b.title).trim();
      if (b.due !== undefined) r.due = +b.due || r.due;
      if (b.kind !== undefined) r.kind = b.kind === 'periodic' || b.kind === 'followup' ? b.kind : 'custom';
      if (b.projectId !== undefined) r.projectId = String(b.projectId || '');
      if (b.done !== undefined) { r.done = !!b.done; r.doneTs = r.done ? Date.now() : 0; }
      r.updatedAt = Date.now(); await _lsSave();
      return { reminder: r };
    }
    if (method === 'DELETE') { db.reminders = db.reminders.filter(x => x.id !== r.id); await _lsSave(); return { ok: true }; }
  }

  /* backup / restore */
  if (path === '/backup' && method === 'GET') {
    /* the export must be self-contained: re-hydrate IDB photo payloads so the
       JSON file works on any device (best-effort — unreadable payloads exported as-is) */
    let exportPhotos = db.photos;
    try {
      if (IDB_PHOTOS.available() && db.photos.some(p => p && p.inIdb && !p.data)) {
        exportPhotos = await Promise.all(db.photos.map(async p => {
          if (!p || !p.inIdb || p.data) return p;
          try { const d = await IDB_PHOTOS.get(p.id); return Object.assign({}, p, { data: d || '' }); }
          catch (e) { return p; }
        }));
      }
    } catch (e) { exportPhotos = db.photos; }
    const safeSettings = {};
    ['company', 'phone', 'address', 'defaultTech', 'taxRate', 'invoiceSeq', 'autoBackup', 'notify'].forEach(k => {
      if (db.settings && db.settings[k] !== undefined) safeSettings[k] = db.settings[k];
    });
    const backup = {
      app: 'zlift',
      version: BACKUP_FORMAT_VERSION,
      formatVersion: BACKUP_FORMAT_VERSION,
      appVersion: APP_VERSION,
      dbSchemaVersion: DB_SCHEMA_VERSION,
      storage: { primary: STRUCTURED_DB.status().mode, structuredMigrationVersion: STRUCTURED_DB.migrationVersion, photoStore: IDB_PHOTOS.available() ? 'indexedDB' : 'inline-fallback' },
      exportedAt: Date.now(),
      language: (typeof LANG !== 'undefined' ? LANG : 'fa'),
      relationships: { projectElevatorModel: '1:1', projectKey: 'projectId', serviceHistoryPolicy: 'detach-and-stamp-on-project-delete' },
      projects: db.projects,
      archivedProjects: Array.isArray(db.archivedProjects) ? db.archivedProjects : [],
      services: db.services, notes: db.notes,
      checklists: db.checklists, parts: db.parts, settings: safeSettings,
      diagSessions: db.diagSessions, calcSaves: db.calcSaves, issues: db.issues, tools: db.tools, photos: exportPhotos, invoices: db.invoices, contracts: db.contracts, reminders: db.reminders,
      measurements: db.measurements || [], safetyLogs: db.safetyLogs || []
    };
    return { backup: (typeof enrichBackupMetadata === 'function') ? enrichBackupMetadata(backup) : backup };
  }
  if (path === '/backup' && method === 'PUT') {
    const bk = b.backup || b;
    const valid = validateBackup(bk);
    if (!valid.ok) throw _lsErr('bad_backup:' + valid.why);

    /* Stage a complete candidate without mutating live data. Authentication and
       active sessions remain device-local; application collections come from
       the validated backup. */
    const candidate = JSON.parse(JSON.stringify(db));
    candidate.projects = JSON.parse(JSON.stringify(bk.projects));
    candidate.archivedProjects = Array.isArray(bk.archivedProjects) ? JSON.parse(JSON.stringify(bk.archivedProjects)) : [];
    candidate.services = Array.isArray(bk.services) ? JSON.parse(JSON.stringify(bk.services)) : [];
    candidate.notes = Array.isArray(bk.notes) ? JSON.parse(JSON.stringify(bk.notes)) : [];
    candidate.checklists = Array.isArray(bk.checklists) ? JSON.parse(JSON.stringify(bk.checklists)) : [];
    candidate.parts = Array.isArray(bk.parts) ? JSON.parse(JSON.stringify(bk.parts)) : [];
    if (bk.settings && typeof bk.settings === 'object') {
      const preserved = { autoBackup: db.settings && db.settings.autoBackup };
      candidate.settings = JSON.parse(JSON.stringify(bk.settings));
      if (preserved.autoBackup !== undefined && candidate.settings.autoBackup === undefined) candidate.settings.autoBackup = preserved.autoBackup;
    }
    ['diagSessions', 'calcSaves', 'issues', 'tools', 'photos', 'invoices', 'contracts', 'reminders', 'measurements', 'safetyLogs'].forEach(k => {
      candidate[k] = Array.isArray(bk[k]) ? JSON.parse(JSON.stringify(bk[k])) : [];
    });
    candidate.schemaVersion = DB_SCHEMA_VERSION;

    /* Phase 2A restore normalization (same policies as live operation, applied
       BEFORE the verified atomic commit): fold legacy archivedProjects entries
       into projects (archived:true) and detach dangling calcSaves/safetyLogs
       refs that older builds could export. Without this, a perfectly usable
       legacy backup would be rejected by strict relationship verification. */
    if (typeof STRUCTURED_DB !== 'undefined') {
      STRUCTURED_DB.foldArchivedProjects(candidate);
      STRUCTURED_DB.repairProjectRefs(candidate);
    }

    /* Keep restored photo bytes inline in the staged aggregate until the atomic
       structured commit is verified. Writing same-id blobs before that commit
       could corrupt live photos if the structured transaction then failed. */
    candidate.photos.forEach(p => { if (p && p.data) p.inIdb = false; });

    // Atomic structured write, then full content/count/relationship verification.
    await _lsSave(candidate);
    const verifiedCandidate = STRUCTURED_DB.status().mode === 'indexedDB'
      ? await STRUCTURED_DB.verifyAggregate(candidate)
      : candidate;
    _lsDB = verifiedCandidate;

    /* Offload large restored photos only after activation. The migration keeps
       inline bytes unless every copy verifies, so a photo-store failure is a
       safe inline fallback rather than a partial restore. */
    const photosOffloaded = await _migratePhotosToIdb();
    return { ok: true, verified: true, photosOffloaded: !!photosOffloaded, counts: valid.counts || {} };
  }

  /* settings */
  if (path === '/settings' && method === 'GET') return { settings: db.settings };
  if (path === '/settings' && method === 'PUT') {
    ['company', 'phone', 'address', 'defaultTech'].forEach(f => { if (b[f] !== undefined) db.settings[f] = String(b[f]); });
    if (b.taxRate !== undefined) db.settings.taxRate = Math.max(0, Math.min(100, Math.round(+b.taxRate || 0)));
    if (b.autoBackup !== undefined) db.settings.autoBackup = b.autoBackup !== false;
    if (b.notify !== undefined) db.settings.notify = !!b.notify;
    await _lsSave();
    return { settings: db.settings };
  }

  throw _lsErr('not_found', 404);
}
