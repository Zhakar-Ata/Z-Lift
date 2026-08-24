/* ================= BACKUP / RESTORE ================= */
var BACKUP_COLLECTIONS = ['projects', 'archivedProjects', 'services', 'invoices', 'contracts', 'parts', 'notes', 'checklists', 'measurements', 'safetyLogs', 'reminders', 'photos', 'diagSessions', 'calcSaves', 'issues', 'tools'];
var BACKUP_ELEVATOR_OWNED = ['services', 'measurements', 'diagSessions', 'checklists', 'issues', 'safetyLogs'];
var BACKUP_PROJECT_OWNED = ['invoices', 'contracts', 'reminders', 'photos', 'calcSaves', 'notes', 'tools'];
var BACKUP_ALLOWED_TOP_LEVEL = ['app', 'version', 'formatVersion', 'appVersion', 'dbSchemaVersion', 'schemaVersion', 'storage', 'exportedAt', 'createdAt', 'creationTimestamp', 'backupId', 'language', 'metadata', 'recordCounts', 'integrity', 'relationships', 'settings'].concat(BACKUP_COLLECTIONS);
var EXTERNAL_BACKUP_LAST_KEY = 'zlift_last_external_backup';
var LOCAL_BACKUP_LAST_KEY = 'zlift_last_local_backup';

function backupCountMap(bk) {
  const counts = {};
  BACKUP_COLLECTIONS.forEach(k => { counts[k] = Array.isArray(bk && bk[k]) ? bk[k].length : 0; });
  /* v8 omits the derived elevator collection. Count canonical contexts from
     projects plus explicit child pairs, without inventing ownership. */
  const contexts = new Set((bk && Array.isArray(bk.projects) ? bk.projects : []).filter(Boolean).map(p => p.id + '\u0000' + p.id));
  BACKUP_ELEVATOR_OWNED.forEach(k => (bk && Array.isArray(bk[k]) ? bk[k] : []).forEach(r => {
    if (r && r.projectId) contexts.add(r.projectId + '\u0000' + (r.elevatorId || r.projectId));
  }));
  counts.elevators = contexts.size;
  counts.diagnostics = counts.diagSessions;
  counts.invoiceItems = (bk && Array.isArray(bk.invoices) ? bk.invoices : []).reduce((n, inv) => n + (Array.isArray(inv.items) ? inv.items.length : 0), 0);
  counts.inventory = counts.parts;
  counts.reports = 0; // reports are generated from service/project data, not stored as separate user records
  return counts;
}

function stableBackupString(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableBackupString).join(',') + ']';
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stableBackupString(value[k])).join(',') + '}';
}

function backupChecksum(bk) {
  const clone = JSON.parse(JSON.stringify(bk || {}));
  if (clone.integrity) delete clone.integrity;
  if (clone.metadata && clone.metadata.integrity) delete clone.metadata.integrity;
  const s = stableBackupString(clone);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return 'fnv1a32-' + h.toString(16).padStart(8, '0');
}

function auditBackupData(bk, opts) {
  opts = opts || {};
  const errors = [], warnings = [];
  const isObj = row => row && typeof row === 'object' && !Array.isArray(row);
  if (!isObj(bk)) return { ok: false, errors: ['format'], warnings, counts: {} };
  if (bk.app !== 'zlift') errors.push('app');
  const declared = bk.formatVersion != null ? bk.formatVersion : (bk.version != null ? bk.version : 1);
  const ver = Number(declared);
  if (!Number.isInteger(ver) || ver < 1) errors.push('version');
  else if (ver > BACKUP_FORMAT_VERSION) errors.push('future-version');
  if (bk.dbSchemaVersion != null) {
    const schema = Number(bk.dbSchemaVersion);
    if (!Number.isInteger(schema) || schema < 1) errors.push('schema');
    else if (schema > DB_SCHEMA_VERSION) errors.push('future-schema');
  }
  Object.keys(bk).forEach(k => { if (!BACKUP_ALLOWED_TOP_LEVEL.includes(k)) errors.push('unknown-field:' + k); });
  if (!Array.isArray(bk.projects)) errors.push('projects');
  BACKUP_COLLECTIONS.forEach(k => { if (bk[k] !== undefined && !Array.isArray(bk[k])) errors.push(k); });
  if (bk.settings !== undefined && !isObj(bk.settings)) errors.push('settings');

  const idsByCollection = {};
  BACKUP_COLLECTIONS.forEach(k => {
    if (!Array.isArray(bk[k])) return;
    const seen = new Set();
    bk[k].forEach((row, idx) => {
      if (!isObj(row)) { errors.push(k + ':record'); return; }
      if (typeof row.id !== 'string' || !row.id) errors.push(k + ':id');
      else if (seen.has(row.id)) errors.push(k + ':duplicate-id:' + row.id);
      else seen.add(row.id);
      ['createdAt', 'updatedAt', 'date', 'due', 'doneTs'].forEach(f => {
        if (row[f] != null && row[f] !== '' && (!Number.isFinite(Number(row[f])) || Number(row[f]) < 0)) errors.push(k + ':' + f + ':date');
      });
      if (row.updatedAt != null && row.createdAt != null && Number(row.updatedAt) && Number(row.createdAt) && Number(row.updatedAt) < Number(row.createdAt)) warnings.push(k + ':' + row.id + ':updated-before-created');
      if (opts.requireTimestamps && row.createdAt == null && row.date == null) warnings.push(k + ':' + (row.id || idx) + ':missing-timestamp');
    });
    idsByCollection[k] = seen;
  });

  const projectIds = idsByCollection.projects || new Set();
  ['services', 'invoices', 'contracts', 'checklists', 'measurements', 'reminders', 'photos', 'diagSessions', 'issues'].forEach(k => {
    (Array.isArray(bk[k]) ? bk[k] : []).forEach(row => { if (row.projectId && !projectIds.has(row.projectId)) errors.push(k + ':project-relation:' + row.id); });
  });
  /* Phase 2A: older builds could export dangling calcSaves/safetyLogs refs
     (they were missing from the project-delete detach list). Detected and
     surfaced as WARNINGS — never silently ignored — but not blocking: the
     restore path detaches them with the same policy used live, so legacy
     backups remain restorable. */
  ['calcSaves', 'safetyLogs'].forEach(k => {
    (Array.isArray(bk[k]) ? bk[k] : []).forEach(row => { if (row.projectId && !projectIds.has(row.projectId)) warnings.push(k + ':project-relation:' + row.id + ':will-be-detached-on-restore'); });
  });

  /* Phase 2B.2: backup v8 intentionally has no elevator collection. Canonical
     contexts are reconstructed only from an explicit child pair, or from the
     deterministic legacy project→same-id relation when elevatorId is absent.
     A reused elevator id across projects is ambiguous and blocks activation. */
  const elevatorOwners = new Map();
  projectIds.forEach(projectId => elevatorOwners.set(projectId, projectId));
  BACKUP_ELEVATOR_OWNED.forEach(k => {
    (Array.isArray(bk[k]) ? bk[k] : []).forEach(row => {
      const projectId = typeof row.projectId === 'string' ? row.projectId : '';
      const elevatorId = typeof row.elevatorId === 'string' ? row.elevatorId : '';
      if (!projectId && elevatorId) {
        errors.push(k + ':elevator-without-project:' + row.id);
        return;
      }
      if (!projectId || !projectIds.has(projectId)) return; // standalone or already reported above
      if (!elevatorId) {
        warnings.push(k + ':missing-elevator:' + row.id + ':will-use-exact-legacy-context');
        return;
      }
      const owner = elevatorOwners.get(elevatorId);
      if (owner && owner !== projectId) errors.push(k + ':elevator-project-ambiguity:' + row.id);
      else elevatorOwners.set(elevatorId, projectId);
    });
  });
  BACKUP_PROJECT_OWNED.forEach(k => {
    (Array.isArray(bk[k]) ? bk[k] : []).forEach(row => {
      if (row && row.elevatorId) warnings.push(k + ':unexpected-elevator:' + row.id + ':will-be-removed-on-restore');
    });
  });

  /* Phase 2B.0 BUG-2 — nested inventory history references
     (parts.history[].projectId). These are historical context, not live
     ownership, so they are reported as WARNINGS and never as blocking errors:
     the restore path detaches-and-stamps them with the same canonical policy
     used live, so a legacy backup that predates this handling stays restorable
     and no history entry is ever dropped. Malformed containers/entries are
     also warnings — the app may not silently discard a technician's stock
     history, it flags it and keeps the bytes. */
  (Array.isArray(bk.parts) ? bk.parts : []).forEach(part => {
    if (!isObj(part) || part.history === undefined || part.history === null) return;
    if (!Array.isArray(part.history)) { warnings.push('parts:history-not-array:' + part.id); return; }
    part.history.forEach((h, idx) => {
      if (!isObj(h)) { warnings.push('parts:history-record:' + part.id + ':' + idx); return; }
      if (h.projectId !== undefined && h.projectId !== null && h.projectId !== '' && typeof h.projectId !== 'string') {
        warnings.push('parts:history-project-type:' + part.id + ':' + (h.id || idx));
        return;
      }
      if (h.projectId && !projectIds.has(h.projectId)) {
        warnings.push('parts:history-project-relation:' + part.id + ':' + (h.id || idx) + ':will-be-detached-on-restore');
      }
    });
  });
  /* Phase 2B.0 BUG-1 — two checklist rows claiming the same logical identity
     ((elevator, template)) is genuine ambiguity about whose answers these are.
     Surfaced, never merged and never deleted: guessing would overwrite real
     technician work. */
  if (typeof checklistIdentityConflicts === 'function') {
    checklistIdentityConflicts(bk.checklists).forEach(c => {
      warnings.push('checklists:duplicate-identity:' + c.ids.join('+') + ':' + c.key.split('\u0000')[1]);
    });
  }
  const serviceIds = idsByCollection.services || new Set();
  const photoIds = idsByCollection.photos || new Set();
  const diagIds = idsByCollection.diagSessions || new Set();
  const partIds = idsByCollection.parts || new Set();
  const servicesById = new Map((Array.isArray(bk.services) ? bk.services : []).map(row => [row.id, row]));
  const diagnosticsById = new Map((Array.isArray(bk.diagSessions) ? bk.diagSessions : []).map(row => [row.id, row]));
  const photosById = new Map((Array.isArray(bk.photos) ? bk.photos : []).map(row => [row.id, row]));
  const pairOf = row => ({ projectId: String(row && row.projectId || ''), elevatorId: String(row && (row.elevatorId || row.projectId) || '') });
  (Array.isArray(bk.parts) ? bk.parts : []).forEach(part => {
    (Array.isArray(part && part.history) ? part.history : []).forEach(entry => {
      if (!entry || !entry.serviceId) return;
      if (!serviceIds.has(entry.serviceId)) {
        /* Inventory history is immutable evidence; service deletion may leave a
           historical id, so surface it without dropping or blocking the row. */
        warnings.push('parts:history-service-missing:' + part.id + ':' + (entry.id || entry.serviceId));
        return;
      }
      const service = servicesById.get(entry.serviceId);
      if (String(entry.projectId || '') !== String(service && service.projectId || '')) {
        errors.push('parts:history-service-project-mismatch:' + part.id + ':' + (entry.id || entry.serviceId));
      }
    });
  });
  (Array.isArray(bk.invoices) ? bk.invoices : []).forEach(inv => {
    if (inv.serviceId && !serviceIds.has(inv.serviceId)) errors.push('invoices:service-relation:' + inv.id);
    if (inv.serviceId && servicesById.has(inv.serviceId)) {
      const service = servicesById.get(inv.serviceId);
      if (String(inv.projectId || '') !== String(service.projectId || '')) errors.push('invoices:service-project-mismatch:' + inv.id);
    }
    (Array.isArray(inv.items) ? inv.items : []).forEach(row => { if (row && row.partId && !partIds.has(row.partId)) errors.push('invoices:part-relation:' + inv.id); });
  });
  (Array.isArray(bk.measurements) ? bk.measurements : []).forEach(m => {
    const measurementPair = pairOf(m);
    if (m.serviceId && !serviceIds.has(m.serviceId)) errors.push('measurements:service-relation:' + m.id);
    if (m.serviceId && servicesById.has(m.serviceId)) {
      const servicePair = pairOf(servicesById.get(m.serviceId));
      if (measurementPair.projectId !== servicePair.projectId || measurementPair.elevatorId !== servicePair.elevatorId) errors.push('measurements:service-context-mismatch:' + m.id);
    }
    if (m.diagSessionId && !diagIds.has(m.diagSessionId)) errors.push('measurements:diagnostic-relation:' + m.id);
    if (m.diagSessionId && diagnosticsById.has(m.diagSessionId)) {
      const diagnosticPair = pairOf(diagnosticsById.get(m.diagSessionId));
      if (measurementPair.projectId !== diagnosticPair.projectId || measurementPair.elevatorId !== diagnosticPair.elevatorId) errors.push('measurements:diagnostic-context-mismatch:' + m.id);
    }
    if (m.photoId && !photoIds.has(m.photoId)) errors.push('measurements:photo-relation:' + m.id);
    if (m.photoId && photosById.has(m.photoId)) {
      const photo = photosById.get(m.photoId);
      if (String(photo.projectId || '') !== measurementPair.projectId) errors.push('measurements:photo-project-mismatch:' + m.id);
    }
  });
  (Array.isArray(bk.services) ? bk.services : []).forEach(s => (Array.isArray(s.partsUsed) ? s.partsUsed : []).forEach(row => { if (row && row.partId && !partIds.has(row.partId)) warnings.push('services:part-history-missing:' + s.id); }));

  const invoiceNumbers = new Set();
  (Array.isArray(bk.invoices) ? bk.invoices : []).forEach(inv => {
    if (typeof inv.customer !== 'string' || !inv.customer.trim()) errors.push('invoices:customer:' + inv.id);
    if (!Array.isArray(inv.items) || (inv.payments !== undefined && !Array.isArray(inv.payments))) errors.push('invoices:structure:' + inv.id);
    if (inv.number != null && String(inv.number).trim()) {
      const number = String(inv.number).trim();
      if (invoiceNumbers.has(number)) errors.push('invoices:duplicate-number:' + number);
      invoiceNumbers.add(number);
    }
    (Array.isArray(inv.items) ? inv.items : []).forEach(row => {
      if (!isObj(row) || !Number.isFinite(Number(row.qty)) || Number(row.qty) < 0 || !Number.isFinite(Number(row.price)) || Number(row.price) < 0) errors.push('invoices:item:' + inv.id);
    });
    (Array.isArray(inv.payments) ? inv.payments : []).forEach(pay => {
      if (!isObj(pay) || !Number.isFinite(Number(pay.amount)) || Number(pay.amount) <= 0) errors.push('invoices:payment:' + inv.id);
    });
    ['labor', 'discount'].forEach(key => { if (inv[key] != null && (!Number.isFinite(Number(inv[key])) || Number(inv[key]) < 0)) errors.push('invoices:' + key + ':' + inv.id); });
    if (inv.taxRate != null && (!Number.isFinite(Number(inv.taxRate)) || Number(inv.taxRate) < 0 || Number(inv.taxRate) > 100)) errors.push('invoices:tax:' + inv.id);
  });
  (Array.isArray(bk.measurements) ? bk.measurements : []).forEach(m => {
    if (typeof m.typeId !== 'string' || !m.typeId) errors.push('measurements:type:' + m.id);
    if (m.status != null && !['normal', 'attention', 'critical', 'unknown'].includes(m.status)) errors.push('measurements:status:' + m.id);
    if ((m.kind || 'numeric') === 'numeric' && !Number.isFinite(Number(m.value))) errors.push('measurements:value:' + m.id);
  });
  (Array.isArray(bk.photos) ? bk.photos : []).forEach(ph => {
    if (ph.data && !safePhotoSrc(ph.data)) errors.push('photos:data:' + ph.id);
    if (ph.inIdb && !ph.data) errors.push('photos:missing-data:' + ph.id);
  });

  const serial = JSON.stringify(bk);
  if (serial.includes('\"__proto__\"') || serial.includes('\"constructor\":{\"prototype\"')) errors.push('unsafe keys');
  const expectedChecksum = bk.integrity && bk.integrity.checksum;
  if (expectedChecksum && expectedChecksum !== backupChecksum(bk)) errors.push('checksum');
  return { ok: errors.length === 0, errors, warnings, counts: backupCountMap(bk), version: Number.isInteger(ver) ? ver : 0 };
}

function validateBackup(bk) {
  const a = auditBackupData(bk, { requireTimestamps: false });
  return { ok: a.ok, why: a.errors[0] || '', version: a.version, counts: a.counts, warnings: a.warnings, errors: a.errors };
}

function enrichBackupMetadata(bk) {
  const out = JSON.parse(JSON.stringify(bk));
  const now = Date.now();
  out.formatVersion = BACKUP_FORMAT_VERSION;
  out.version = BACKUP_FORMAT_VERSION;
  out.appVersion = APP_VERSION;
  out.dbSchemaVersion = DB_SCHEMA_VERSION;
  out.language = LANG || 'fa';
  out.exportedAt = out.exportedAt || now;
  out.createdAt = out.exportedAt;
  out.creationTimestamp = new Date(out.exportedAt).toISOString();
  out.backupId = out.backupId || ('zlift-' + out.exportedAt + '-' + _lsUid());
  out.recordCounts = backupCountMap(out);
  out.relationships = Object.assign({ projectElevatorModel: 'projectId+elevatorId', projectKey: 'projectId', elevatorKey: 'elevatorId', elevatorRestorePolicy: 'derive-from-explicit-child-pairs-or-exact-legacy-project', serviceHistoryPolicy: 'detach-and-stamp-on-project-delete' }, out.relationships || {});
  out.metadata = {
    application: 'Z Lift', appVersion: out.appVersion, dbSchemaVersion: out.dbSchemaVersion,
    backupFormatVersion: out.formatVersion, createdAt: out.creationTimestamp,
    language: out.language, backupId: out.backupId, recordCounts: out.recordCounts
  };
  out.integrity = { algorithm: 'fnv1a32-stable-json', checksum: backupChecksum(out) };
  out.metadata.integrity = out.integrity;
  return out;
}

function externalBackupStatusBadge() {
  const last = +(localStorage.getItem(EXTERNAL_BACKUP_LAST_KEY) || 0);
  if (!last) return '🔴 ' + t('backupNoneExternal');
  const days = Math.floor((Date.now() - last) / 86400000);
  if (days <= 7) return '🟢 ' + t('backupAvailableExternal');
  if (days <= 30) return '🟡 ' + t('backupRecommended') + ' (' + faNum(days) + ' ' + t('daysAgo') + ')';
  return '🔴 ' + t('backupNoneRecentExternal') + ' (' + faNum(days) + ' ' + t('daysAgo') + ')';
}
function backupStatusBadge() { return externalBackupStatusBadge(); }

function backupFileName(ts) {
  const d = new Date(ts || Date.now());
  const p = n => String(n).padStart(2, '0');
  return `Z-Lift-Backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}-${p(d.getMinutes())}.json`;
}

function restorePreviewHtml(bk, audit) {
  const c = audit.counts || backupCountMap(bk);
  const rows = [
    ['Backup created', bk.creationTimestamp || (bk.exportedAt || bk.createdAt ? new Date(bk.exportedAt || bk.createdAt).toISOString() : '—')],
    ['Application version', bk.appVersion || '—'],
    ['Format / DB', 'Backup v' + (bk.formatVersion || bk.version || '?') + ' · DB v' + (bk.dbSchemaVersion || '?')],
    ['Projects', c.projects], ['Elevators', c.elevators], ['Services', c.services], ['Measurements', c.measurements],
    ['Diagnostics', c.diagnostics], ['Checklists', c.checklists], ['Invoices', c.invoices], ['Invoice items', c.invoiceItems],
    ['Inventory', c.inventory], ['Notes', c.notes], ['Issues', c.issues], ['Warnings', (audit.warnings || []).length]
  ];
  return `<div class="kv-grid" style="grid-template-columns:1fr 1fr">${rows.map(r => `<div class="kv-cell"><div class="k">${esc(r[0])}</div><div class="v">${esc(faNum(r[1]))}</div></div>`).join('')}</div>` +
    ((audit.warnings || []).length ? `<div class="note-block" style="margin-top:12px;background:var(--warn-soft);border-color:var(--warn)">⚠️ ${(audit.warnings || []).slice(0, 6).map(esc).join('<br>')}</div>` : '');
}
/* automatic local backup: keeps a rotating set of dated snapshots in
   localStorage (no network, no third party). Recovers from accidental
   deletes/corruption. Telegram upload is explicitly NOT done client-side
   because it would require exposing a bot token in the frontend — that is a
   backend feature and is intentionally left for the future. */
var AUTO_BACKUP_KEY = 'zlift_autobackup';
var AUTO_BACKUP_DAYS = 1;
function autoBackupIfDue() {
  try {
    if (state.settings && state.settings.autoBackup === false) return;
    const last = +(localStorage.getItem(LOCAL_BACKUP_LAST_KEY) || localStorage.getItem('zlift_last_backup') || 0);
    if (Date.now() - last < AUTO_BACKUP_DAYS * 86400000) return;
    runAutoBackup();
  } catch (e) { /* storage full / private mode — never block the app */ }
}
var _autoBackupCache = [];
async function runAutoBackup() {
  try {
    /* Use the same self-contained export path as a manual backup. This includes
       every structured collection and hydrated photo payloads. */
    const exported = await api('/backup');
    if (!exported || !validateBackup(exported.backup).ok) throw new Error('auto-backup-validation');
    const snap = {
      id: 'auto-' + Date.now() + '-' + _lsUid(), app: 'zlift-auto',
      version: BACKUP_FORMAT_VERSION, appVersion: APP_VERSION,
      dbSchemaVersion: DB_SCHEMA_VERSION, createdAt: Date.now(), data: exported.backup
    };
    if (STRUCTURED_DB.status().mode === 'indexedDB') {
      await STRUCTURED_DB.putBackup(snap);
      _autoBackupCache = (await STRUCTURED_DB.listBackups()).slice(0, 5);
    } else {
      let store = [];
      try { store = JSON.parse(localStorage.getItem(AUTO_BACKUP_KEY) || '[]'); if (!Array.isArray(store)) store = []; } catch (e) { store = []; }
      store.unshift(snap);
      _autoBackupCache = store.slice(0, 5);
      localStorage.setItem(AUTO_BACKUP_KEY, JSON.stringify(_autoBackupCache));
    }
    localStorage.setItem(LOCAL_BACKUP_LAST_KEY, String(Date.now()));
    return snap;
  } catch (e) {
    console.warn('[ZLift] automatic backup skipped:', e && e.message || e);
    return null;
  }
}
function listAutoBackups() {
  if (_autoBackupCache.length) return _autoBackupCache.slice();
  try {
    const rows = JSON.parse(localStorage.getItem(AUTO_BACKUP_KEY) || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch (e) { return []; }
}
async function restoreAutoBackup(idx) {
  if (STRUCTURED_DB.status().mode === 'indexedDB' && !_autoBackupCache.length) _autoBackupCache = await STRUCTURED_DB.listBackups();
  const snap = listAutoBackups()[idx];
  if (!snap || !snap.data || !validateBackup(snap.data).ok) throw new Error('bad_backup');
  /* Restore through the validated API path; never write storage directly. */
  await api('/backup', { method: 'PUT', body: { backup: snap.data } });
  await loadAll(true);
  return true;
}

function openBackupModal() {
  openModal(`
    <div class="modal-head"><h3>💾 ${t('backupLocalTitle')}</h3><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="note-block" style="margin-bottom:14px">⚠️ ${t('backupHint')}</div>
      <div class="note-block" style="background:var(--warn-soft);border-color:var(--warn);margin-bottom:14px">${t('backupLocalLimits')}</div>
      ${(() => {
        try {
          const raw = JSON.stringify(_lsDB || {});
          const mb = (raw.length * 2 / 1048576).toFixed(1);
          const pct = Math.min(100, Math.round(raw.length * 2 / (50 * 1048576) * 100));
          const lastBk = +(localStorage.getItem(LOCAL_BACKUP_LAST_KEY) || localStorage.getItem('zlift_last_backup') || 0);
          const days = lastBk ? Math.floor((Date.now() - lastBk) / 86400000) : -1;
          const lastTxt = lastBk
            ? fmtDate(lastBk) + (days > 0 ? ' · ' + faNum(days) + ' ' + t('daysAgo') : ' · ' + t('today'))
            : t('backupNever');
          return `<div class="kv-cell" style="margin-bottom:14px"><div class="k">📊 ${t('storageUsage')}</div>
            <div class="v" style="font-weight:600;font-size:13px">${faNum(mb)} MB · ${faNum((state.photos || []).length)} ${t('storagePhotos')}</div>
            <div class="k" style="margin-top:6px">🕓 LOCAL SNAPSHOT: <b style="color:${lastBk && days <= 7 ? 'var(--ok)' : 'var(--danger)'}">${lastTxt}</b></div>
            <div class="k" style="margin-top:6px">💾 EXTERNAL BACKUP: ${externalBackupStatusBadge()}</div>
            <div class="mini-progress" style="height:7px;margin-top:6px"><div class="fill" style="width:${pct}%;background:${pct > 75 ? 'var(--danger)' : 'var(--accent)'}"></div></div></div>`;
        } catch (e) { return ''; }
      })()}
      <div class="kv-cell" style="margin-bottom:14px;font-size:12px;line-height:1.9">
        <div><b>LOCAL SNAPSHOT:</b> ${LANG === 'fa' ? 'چرخشی، داخل IndexedDB همین مرورگر' : 'rotating copy inside this browser IndexedDB'}</div>
        <div><b>MANUAL EXPORT / EXTERNAL BACKUP:</b> ${LANG === 'fa' ? 'فایل JSON قابل نگهداری خارج از دستگاه' : 'JSON file that can be stored off-device'}</div>
        <div><b>FUTURE CLOUD BACKUP:</b> ${LANG === 'fa' ? 'در این نسخه پیاده‌سازی نشده است' : 'not implemented in this build'}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px">
        <button class="btn btn-primary" id="bkExport">⬇️ ${t('backupExport')} · MANUAL EXPORT</button>
        <button class="btn btn-ghost" id="bkImport">⬆️ ${t('backupImport')} · EXTERNAL BACKUP</button>
        <input type="file" id="bkFile" accept=".json,application/json" class="hidden" />
      </div>
      <div class="section-title" style="margin:0 0 8px"><h3 style="font-size:14px">🏢 ${t('companySettings')}</h3></div>
      <p style="font-size:11.8px;color:var(--text-3);margin-bottom:9px">${t('settingsSub')}</p>
      <div class="field"><label>${t('setCompany')}</label><input id="set_company" value="${esc((state.settings || {}).company || '')}" /></div>
      <div class="form-grid">
        <div class="field"><label>${t('setPhone')}</label><input id="set_phone" value="${esc((state.settings || {}).phone || '')}" /></div>
        <div class="field"><label>${t('setAddress')}</label><input id="set_address" value="${esc((state.settings || {}).address || '')}" /></div>
      </div>
      <button class="btn btn-ghost btn-sm" id="setSave">💾 ${t('save')}</button>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal()">${t('close')}</button></div>`, { size: 'sm' });

  $('#setSave').onclick = guard('#setSave', async () => {
    try {
      const d = await api('/settings', { method: 'PUT', body: {
        company: $('#set_company').value, phone: $('#set_phone').value, address: $('#set_address').value
      } });
      state.settings = d.settings;
      toast(t('saved'));
    } catch (e) { toast(errMsg(e), 'err'); }
  });
  $('#bkExport').onclick = async () => {
    try {
      const d = await api('/backup');
      const audit = auditBackupData(d.backup, { requireTimestamps: true });
      if (!audit.ok) throw new Error('backup-validation:' + audit.errors.join(','));
      const backup = enrichBackupMetadata(d.backup);
      const verified = validateBackup(backup);
      if (!verified.ok) throw new Error('backup-validation:' + verified.why);
      downloadBlob(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), backupFileName(backup.exportedAt));
      localStorage.setItem(EXTERNAL_BACKUP_LAST_KEY, String(Date.now()));
      toast(t('backupDone'));
    } catch (e) { toast((e && e.message && e.message.indexOf('backup-validation:') === 0) ? t('backupInvalid') + ' (' + e.message.replace('backup-validation:', '') + ')' : errMsg(e), 'err'); }
  };
  $('#bkImport').onclick = () => $('#bkFile').click();
  $('#bkFile').onchange = () => {
    const file = $('#bkFile').files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let bk;
      try { bk = JSON.parse(reader.result); } catch (e) { toast(t('restoreBad'), 'err'); return; }
      const audit = auditBackupData(bk, { requireTimestamps: true });
      if (!audit.ok) { toast(t('restoreBad') + (audit.errors[0] ? ' (' + audit.errors[0] + ')' : ''), 'err'); return; }
      openRestorePreviewModal(bk, audit);
    };
    reader.readAsText(file);
  };
}

function openRestorePreviewModal(bk, audit) {
  openModal(`
    <div class="modal-head"><h3>⬆️ ${t('restorePreviewTitle')}</h3><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="note-block" style="margin-bottom:12px">${t('restorePreviewHint')}</div>
      ${restorePreviewHtml(bk, audit)}
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-primary" id="restorePreviewConfirm">${t('yesRestore')}</button>
    </div>`, { size: 'md' });
  $('#restorePreviewConfirm').onclick = guard('#restorePreviewConfirm', async () => {
    confirmDialog(t('restoreConfirmTitle'), t('restoreConfirmMsg'), async () => {
      let safety = null;
      try {
        const cur = await api('/backup');
        safety = enrichBackupMetadata(cur.backup);
        const safetyValid = validateBackup(safety);
        if (!safetyValid.ok) throw new Error('current-safety-backup-invalid:' + safetyValid.why);
        if (STRUCTURED_DB.status().mode === 'indexedDB') {
          await STRUCTURED_DB.putBackup({ id: 'pre-restore-' + Date.now(), app: 'zlift-auto', version: BACKUP_FORMAT_VERSION, appVersion: APP_VERSION, dbSchemaVersion: DB_SCHEMA_VERSION, createdAt: Date.now(), kind: 'PRE_RESTORE', data: safety });
        } else {
          localStorage.setItem('zlift_pre_restore_backup', JSON.stringify(safety));
        }
        const restored = await api('/backup', { method: 'PUT', body: { backup: bk } });
        if (!restored || !restored.verified) throw new Error('restore-not-verified');
        await loadAll(true);
        const after = await api('/backup');
        const afterCounts = backupCountMap(after.backup);
        const beforeCounts = backupCountMap(bk);
        /* projects + archivedProjects are compared combined: legacy backups
           may carry archived entries that the restore path folds into
           projects (archived:true) instead of keeping a dead collection */
        const projectTotal = c => (c.projects || 0) + (c.archivedProjects || 0);
        if (projectTotal(afterCounts) !== projectTotal(beforeCounts)) throw new Error('restore-count-verification:projects');
        for (const k of ['services', 'measurements', 'diagSessions', 'checklists', 'invoices', 'parts', 'notes', 'issues']) {
          if (afterCounts[k] !== beforeCounts[k]) throw new Error('restore-count-verification:' + k);
        }
        closeModal();
        toast(t('restoreDone'));
        render();
      } catch (e) {
        try {
          if (!safety) safety = JSON.parse(localStorage.getItem('zlift_pre_restore_backup') || 'null');
          if (safety) { await api('/backup', { method: 'PUT', body: { backup: safety } }); await loadAll(true); }
        } catch (e2) { console.error('[ZLift] restore rollback failed', e2); }
        reportError(e, 'restore');
        render();
      }
    });
    const yesBtn = $('#confirmYes');
    if (yesBtn) { yesBtn.textContent = t('yesRestore'); yesBtn.classList.remove('btn-danger'); yesBtn.classList.add('btn-primary'); }
  });
}
