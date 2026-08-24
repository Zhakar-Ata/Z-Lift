/* ================= STRUCTURED INDEXEDDB STORE (v29) =================
   IndexedDB is the primary store for structured application records. The old
   localStorage database is treated as a read-only migration source once a
   verified migration completes; it is never silently deleted. Small UI/session
   preferences remain in localStorage.

   Current domain note: the existing UI models one project as one elevator
   profile. Both `projects` and `elevators` stores therefore carry a deliberate
   1:1 projection with the same stable id. This preserves today's API while
   leaving a clean relationship seam for a future multi-elevator project model.

   Phase 2A note: the vestigial schema-v2 `archivedProjects` collection left
   the live model (archiving uses the project `archived` flag). Any legacy
   rows/entries are folded back into projects as archived:true — never
   deleted — and relationship verification now also covers calcSaves and
   safetyLogs (see repairProjectRefs/foldArchivedProjects below).

   Migration is fail-safe and idempotent:
     DETECT → VALIDATE → COPY (one transaction) → VERIFY → MARK COMPLETE.
   Any failure leaves zlift_db/zlift_db_mirror untouched and activates the
   localStorage fallback for that browser session. */
var STRUCTURED_DB = (() => {
  const NAME = 'zlift-data';
  const VERSION = 3;
  const MIGRATION_VERSION = 1;
  const ARRAY_STORES = {
    projects: 'projects', services: 'services', notes: 'notes',
    checklists: 'checklists', parts: 'inventory', diagSessions: 'diagnostics', calcSaves: 'calculations',
    issues: 'issues', tools: 'tools', photos: 'photos', invoices: 'invoices', contracts: 'contracts',
    reminders: 'reminders', measurements: 'measurements', safetyLogs: 'safetyLogs', users: 'users'
  };
  const STORES = ['elevators', ...new Set(Object.values(ARRAY_STORES)), 'settings', 'backups', 'metadata'];
  let dbp = null;
  let readyPromise = null;
  let mode = 'pending';
  let lastError = '';

  function available() {
    try { return typeof indexedDB !== 'undefined' && indexedDB && typeof indexedDB.open === 'function'; }
    catch (e) { return false; }
  }
  function open() {
    if (!available()) return Promise.reject(new Error('idb-unavailable'));
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(NAME, VERSION); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        STORES.forEach(name => {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: name === 'metadata' || name === 'settings' ? 'key' : 'id' });
        });
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { try { db.close(); } catch (e) {} dbp = null; };
        resolve(db);
      };
      req.onerror = () => { dbp = null; reject(req.error || new Error('idb-open-failed')); };
      req.onblocked = () => { dbp = null; reject(new Error('idb-blocked')); };
    });
    return dbp;
  }
  function request(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('idb-request-failed'));
    });
  }
  function transaction(storeNames, modeName, work) {
    return open().then(db => new Promise((resolve, reject) => {
      let tx, result;
      try { tx = db.transaction(storeNames, modeName); result = work(tx); }
      catch (e) {
        /* Phase 2B.0 BUG-3 — abort explicitly, do not just reject.

           writeAggregate queues a clear() on every store before it queues the
           puts. IndexedDB commits a transaction as soon as control returns to
           the event loop with no request still pending, so a synchronous throw
           out of work() — e.g. a value that cannot be structured-cloned, or
           any other error raised while queueing — left those clears queued and
           let them COMMIT. The save did not merely fail: it emptied the whole
           aggregate. Measured before the fix, a poisoned record turned a
           rejected write into a wiped database.

           Aborting hands the transaction to IndexedDB's rollback, so a failed
           write now leaves the previously committed state byte-identical. That
           is the guarantee the rest of the data layer (and every "atomic
           commit" comment in it) already assumed. */
        try { if (tx) tx.abort(); } catch (e2) { /* already finished — nothing to undo */ }
        reject(e);
        return;
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error('idb-transaction-failed'));
      tx.onabort = () => reject(tx.error || new Error('idb-transaction-aborted'));
    }));
  }
  function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === 'object') {
      const out = {};
      Object.keys(value).sort().forEach(k => { if (value[k] !== undefined) out[k] = stableValue(value[k]); });
      return out;
    }
    return value;
  }
  function fingerprint(value) {
    let h = 2166136261;
    const text = JSON.stringify(stableValue(value));
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16) + ':' + text.length;
  }
  function aggregateFingerprint(db) {
    const canonical = {};
    Object.keys(ARRAY_STORES).sort().forEach(k => {
      canonical[k] = (db[k] || []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id))).map(stableValue);
    });
    canonical.settings = stableValue(db.settings || {});
    canonical.sessions = stableValue(db.sessions || {});
    canonical.schemaVersion = +db.schemaVersion || DB_SCHEMA_VERSION;
    return fingerprint(canonical);
  }
  function validate(db) {
    if (!db || typeof db !== 'object' || !Array.isArray(db.projects) || !Array.isArray(db.users)) return { ok: false, why: 'root' };
    for (const key of Object.keys(ARRAY_STORES)) {
      if (db[key] !== undefined && !Array.isArray(db[key])) return { ok: false, why: key };
      const seen = new Set();
      for (const item of (db[key] || [])) {
        if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id || seen.has(item.id)) return { ok: false, why: key + ':id' };
        seen.add(item.id);
      }
    }
    if (db.settings !== undefined && (!db.settings || typeof db.settings !== 'object' || Array.isArray(db.settings))) return { ok: false, why: 'settings' };
    if (db.sessions !== undefined && (!db.sessions || typeof db.sessions !== 'object' || Array.isArray(db.sessions))) return { ok: false, why: 'sessions' };
    return { ok: true };
  }
  function normalize(db) {
    const out = db;
    Object.keys(ARRAY_STORES).forEach(k => { if (!Array.isArray(out[k])) out[k] = []; });
    if (!out.settings || typeof out.settings !== 'object') out.settings = { company: 'Z Lift', phone: '', address: '' };
    if (!out.sessions || typeof out.sessions !== 'object') out.sessions = {};
    if (!out.schemaVersion || +out.schemaVersion < DB_SCHEMA_VERSION) out.schemaVersion = DB_SCHEMA_VERSION;
    return out;
  }
  async function readMeta(key) {
    const db = await open();
    const tx = db.transaction('metadata', 'readonly');
    return request(tx.objectStore('metadata').get(key));
  }
  async function writeMeta(record) {
    await transaction(['metadata'], 'readwrite', tx => tx.objectStore('metadata').put(record));
  }
  async function readAggregate() {
    const db = await open();
    const names = [...new Set([...Object.values(ARRAY_STORES), 'settings', 'metadata'])];
    const tx = db.transaction(names, 'readonly');
    const pending = {};
    Object.entries(ARRAY_STORES).forEach(([key, store]) => { pending[key] = request(tx.objectStore(store).getAll()); });
    pending.settings = request(tx.objectStore('settings').get('app'));
    pending.sessions = request(tx.objectStore('settings').get('sessions'));
    pending.schema = request(tx.objectStore('metadata').get('schema'));
    const out = {};
    for (const [key, p] of Object.entries(pending)) out[key] = await p;
    out.settings = out.settings && out.settings.value ? out.settings.value : {};
    out.sessions = out.sessions && out.sessions.value ? out.sessions.value : {};
    out.schemaVersion = out.schema && +out.schema.version ? +out.schema.version : DB_SCHEMA_VERSION;
    delete out.schema;
    return normalize(out);
  }
  function countsOf(db) {
    const counts = {};
    Object.keys(ARRAY_STORES).forEach(k => { counts[k] = (db[k] || []).length; });
    counts.elevators = (db.projects || []).length;
    return counts;
  }
  /* ---- Phase 2A data-integrity helpers (pure, idempotent, no deletes) ----
     Both helpers may run on any aggregate-shaped object (boot read, legacy
     localStorage source, staged restore candidate). They never remove a
     record — they only repair relationships using the app's documented
     detach policy. */

  /* Single source of truth for "records owned by a project". repairProjectRefs
     and verifyAggregate MUST stay in sync: verification rejects a dangling
     projectId in any of these collections, so the repair pass has to be able
     to normalize every one of them. When the two lists drifted apart, a
     dangling ref in an unrepaired-but-verified collection made boot
     verification throw forever and pushed the device into the localStorage
     fallback with no way back. */
  const PROJECT_OWNED = ['services', 'invoices', 'contracts', 'checklists', 'measurements',
    'reminders', 'photos', 'diagSessions', 'issues', 'calcSaves', 'safetyLogs'];

  /* Phase 2B.0 BUG-2 — the SAME canonical model, one level deeper. A handful of
     references are nested inside a parent record instead of sitting on it, and
     they used to be invisible to every relationship mechanism: project delete
     left them pointing at a deleted project, repairProjectRefs skipped them,
     verifyAggregate accepted them and the backup audit did not even look at
     them. `parts.history[]` is the only such reference in the live model: an
     inventory movement row records which project/elevator consumed the stock.

     Declaring them here (rather than hard-coding `parts.history` in four
     places) keeps repair, verification, project deletion and the backup audit
     driven from one definition — the drift that caused P2A BUG-4.

     POLICY: nested references follow the parent model's documented
     detach-and-stamp policy. The historical entry is NEVER removed and its
     measured facts (qty, date, note, prevQty/newQty, id) are never touched —
     only the dead link is replaced by the surviving context stamp. */
  const PROJECT_NESTED_REFS = [{ collection: 'parts', field: 'history' }];

  /* Single iterator over every declared nested reference. Shared by the
     recovery repair and the live project-delete path so both apply one policy.
     Malformed containers/entries are skipped, never deleted. */
  function eachNestedProjectRef(db, fn) {
    PROJECT_NESTED_REFS.forEach(({ collection, field }) => {
      (Array.isArray(db[collection]) ? db[collection] : []).forEach(parent => {
        if (!parent || typeof parent !== 'object' || !Array.isArray(parent[field])) return;
        parent[field].forEach(entry => {
          if (!entry || typeof entry !== 'object') return;
          if (typeof entry.projectId !== 'string' || !entry.projectId) return;
          fn(entry, parent, collection, field);
        });
      });
    });
  }

  function repairProjectRefs(db) {
    /* Older builds could leave a dangling projectId behind after a project was
       deleted (calcSaves/safetyLogs were missing from the detach list, and an
       interrupted write can strand any collection). Such a reference is
       normalized here with the SAME policy the live project-delete path uses:
       detach-and-stamp — never delete the record.

       The delete path holds the project object and can stamp the full
       "name — customer — location" context. By the time this recovery pass
       runs the project row is already gone, so the only surviving fact about
       the historical elevator is the dead identifier itself. It is preserved
       in the existing `projectInfo` field (no new schema) instead of being
       discarded: records detached from the same lost project keep a shared,
       greppable stamp, and the id can still be resolved against any older
       backup that predates the deletion. Blanking projectId without the stamp
       turned the record into an unexplained orphan — strictly poorer history
       than the normal delete path produces. */
    let changed = false;
    const ids = new Set((db.projects || []).filter(Boolean).map(p => p.id));
    PROJECT_OWNED.forEach(k => {
      (Array.isArray(db[k]) ? db[k] : []).forEach(r => {
        if (r && r.projectId && !ids.has(r.projectId)) {
          const deadId = r.projectId;
          if (!r.projectInfo) r.projectInfo = 'projectId:' + deadId;  // keep the only surviving context
          r.projectId = '';
          /* The checklist elevator dimension is part of its logical identity and
             equals the project id under the current 1:1 model, so it must not
             survive as a reference to the same dead identifier. Guarded by
             typeof: this module is also evaluated where the checklist module is
             not loaded. No-op on every record this build writes. */
          if (k === 'checklists' && typeof detachChecklistElevatorRef === 'function') {
            detachChecklistElevatorRef(r, deadId);
          }
          changed = true;
        }
      });
    });
    /* Phase 2B.0 BUG-2 — nested references are normalized with the identical
       policy and the identical stamp convention. The historical entry itself
       (quantity, date, note, running totals, id) is preserved verbatim; only
       the dead project link is replaced by the surviving context. Idempotent:
       once projectId is '' the entry is no longer visited, so a second pass
       reports no change, re-stamps nothing and never rewrites a timestamp. */
    eachNestedProjectRef(db, entry => {
      if (ids.has(entry.projectId)) return;
      if (!entry.projectInfo) entry.projectInfo = 'projectId:' + entry.projectId;
      entry.projectId = '';
      changed = true;
    });
    return changed;
  }
  function foldArchivedProjects(db) {
    /* `archivedProjects` was a schema-v2 collection that no code path ever
       populated (archiving uses the project `archived` flag). It is no longer
       part of the live model. If entries somehow exist (legacy device data or
       an imported old backup), fold them back into projects as archived:true
       — no archived project may disappear. Unmergeable malformed rows are
       left in place, never deleted. */
    if (!Array.isArray(db.archivedProjects) || !db.archivedProjects.length) return false;
    let changed = false;
    const ids = new Set((db.projects || []).filter(Boolean).map(p => p.id));
    const keep = [];
    db.archivedProjects.forEach(rec => {
      if (rec && typeof rec === 'object' && typeof rec.id === 'string' && rec.id && !ids.has(rec.id)) {
        ids.add(rec.id);
        db.projects.push(Object.assign({}, rec, { archived: true, archivedAt: +rec.archivedAt || +rec.updatedAt || Date.now() }));
        changed = true;
      } else if (rec && typeof rec === 'object' && typeof rec.id === 'string' && rec.id) {
        changed = true;   // duplicate of a live project — the live record wins
      } else {
        keep.push(rec);   // malformed/unknown — leave untouched
      }
    });
    if (changed) db.archivedProjects = keep;
    return changed;
  }
  async function sweepLegacyArchivedStore(agg) {
    /* One-way compatibility sweep of the vestigial physical store on devices
       whose IndexedDB was created before the collection left the live model.
       Folds any rows into the aggregate (then clears the store only when
       everything was consumed) so boot verification can never fail on them. */
    try {
      const db = await open();
      if (!db.objectStoreNames || !db.objectStoreNames.contains('archivedProjects')) return false;
      const rows = await request(db.transaction('archivedProjects', 'readonly').objectStore('archivedProjects').getAll());
      if (!Array.isArray(rows) || !rows.length) return false;
      agg.archivedProjects = rows;
      const folded = foldArchivedProjects(agg);
      if (folded && agg.archivedProjects.length === 0) {
        await transaction(['archivedProjects'], 'readwrite', tx => tx.objectStore('archivedProjects').clear());
      }
      return folded;
    } catch (e) { return false; }
  }
  async function writeAggregate(source, migrationRecord) {
    const check = validate(source);
    if (!check.ok) throw new Error('structured-validation:' + check.why);
    const db = normalize(source);
    const names = [...new Set(['elevators', ...Object.values(ARRAY_STORES), 'settings', 'metadata'])];
    await transaction(names, 'readwrite', tx => {
      Object.entries(ARRAY_STORES).forEach(([key, storeName]) => {
        const store = tx.objectStore(storeName); store.clear();
        (db[key] || []).forEach(item => store.put(item));
      });
      const elevators = tx.objectStore('elevators'); elevators.clear();
      (db.projects || []).forEach(p => elevators.put(Object.assign({}, p, { projectId: p.id, elevatorId: p.id })));
      const settings = tx.objectStore('settings'); settings.clear();
      settings.put({ key: "app", value: db.settings || {} });
      settings.put({ key: "sessions", value: db.sessions || {} });
      const meta = tx.objectStore('metadata');
      meta.put({ key: "schema", version: DB_SCHEMA_VERSION, appVersion: APP_VERSION, updatedAt: Date.now() });
      if (migrationRecord) meta.put(migrationRecord);
    });
  }
  async function verifyAggregate(expected) {
    const loaded = await readAggregate();
    const check = validate(loaded);
    if (!check.ok) throw new Error('structured-verify:' + check.why);
    const a = countsOf(expected), b = countsOf(loaded);
    for (const key of Object.keys(a)) {
      if (a[key] !== b[key]) throw new Error('structured-count:' + key);
    }
    const projectIds = new Set((loaded.projects || []).map(x => x.id));
    for (const key of PROJECT_OWNED) {   // same list repairProjectRefs normalizes — they cannot drift
      for (const row of (loaded[key] || [])) {
        if (row.projectId && !projectIds.has(row.projectId)) throw new Error('structured-relation:' + key + ':' + row.id);
      }
    }
    /* Phase 2B.0 BUG-2 — nested references are verified through the SAME
       iterator repairProjectRefs normalizes, so the two can never drift apart
       (the drift that made P2A BUG-4 an unrecoverable boot loop). */
    let nestedDangling = '';
    eachNestedProjectRef(loaded, (entry, parent, collection, field) => {
      if (!nestedDangling && !projectIds.has(entry.projectId)) {
        nestedDangling = 'structured-relation:' + collection + '.' + field + ':' + (parent && parent.id) + ':' + (entry.id || '');
      }
    });
    if (nestedDangling) throw new Error(nestedDangling);
    if (aggregateFingerprint(expected) !== aggregateFingerprint(loaded)) throw new Error('structured-content-mismatch');
    return loaded;
  }
  function legacySource() {
    let primary = null, mirror = null;
    try { primary = JSON.parse(localStorage.getItem('zlift_db') || 'null'); } catch (e) {}
    try { mirror = JSON.parse(localStorage.getItem('zlift_db_mirror') || 'null'); } catch (e) {}
    if (validate(primary).ok) return { db: normalize(primary), source: 'localStorage:zlift_db' };
    if (validate(mirror).ok) return { db: normalize(mirror), source: 'localStorage:zlift_db_mirror' };
    return { db: normalize(_lsSeed()), source: 'fresh-install' };
  }
  async function ready() {
    if (readyPromise) return readyPromise;
    readyPromise = (async () => {
      if (!available()) { mode = 'localStorage-fallback'; return mode; }
      try {
        await open();
        const marker = await readMeta('migration');
        if (marker && marker.status === 'complete' && +marker.version === MIGRATION_VERSION) {
          const agg = await readAggregate();
          /* Phase 2A: normalize pre-existing integrity gaps (legacy dangling
             calcSaves/safetyLogs refs, vestigial archivedProjects rows)
             BEFORE strict verification, so an old device can never be pushed
             into the localStorage fallback by data written by older builds.
             writeAggregate is used directly (save() would re-enter ready()). */
          const folded = await sweepLegacyArchivedStore(agg);
          const repaired = repairProjectRefs(agg);
          if (folded || repaired) await writeAggregate(agg, null);
          _lsDB = await verifyAggregate(agg);
          mode = 'indexedDB';
          return mode;
        }
        const legacy = legacySource();
        foldArchivedProjects(legacy.db);
        repairProjectRefs(legacy.db);
        const sourceCheck = validate(legacy.db);
        if (!sourceCheck.ok) throw new Error('migration-source:' + sourceCheck.why);
        const startedAt = Date.now();
        const record = {
          key: "migration", version: MIGRATION_VERSION, status: 'copying', source: legacy.source,
          sourceFingerprint: aggregateFingerprint(legacy.db), startedAt, completedAt: null,
          counts: countsOf(legacy.db), appVersion: APP_VERSION
        };
        /* Never mark complete before read-back verification. If the process is
           interrupted here, the next boot sees `copying` and safely repeats the
           idempotent copy from the untouched legacy source. */
        await writeAggregate(legacy.db, record);
        _lsDB = await verifyAggregate(legacy.db);
        const completed = Object.assign({}, record, { status: 'complete', completedAt: Date.now(), verifiedAt: Date.now() });
        await writeMeta(completed);
        const verifiedMarker = await readMeta('migration');
        if (!verifiedMarker || verifiedMarker.status !== 'complete' || verifiedMarker.sourceFingerprint !== record.sourceFingerprint) throw new Error('migration-marker');
        mode = 'indexedDB';
        try { localStorage.setItem('zlift_migration_status', JSON.stringify({ version: MIGRATION_VERSION, status: 'complete', at: Date.now(), source: legacy.source })); } catch (e) {}
        return mode;
      } catch (e) {
        lastError = String(e && e.message || e);
        mode = 'localStorage-fallback';
        _lsDB = null;
        try { localStorage.setItem('zlift_migration_status', JSON.stringify({ version: MIGRATION_VERSION, status: 'failed', at: Date.now(), error: lastError })); } catch (e2) {}
        return mode;
      }
    })();
    return readyPromise;
  }
  async function save(db) {
    if (mode === 'pending') await ready();
    if (mode !== 'indexedDB') return false;
    await writeAggregate(db, null);
    return true;
  }
  async function putBackup(snapshot) {
    if (mode === 'pending') await ready();
    if (mode !== 'indexedDB') return false;
    await transaction(['backups'], 'readwrite', tx => tx.objectStore('backups').put(snapshot));
    return true;
  }
  async function listBackups() {
    if (mode === 'pending') await ready();
    if (mode !== 'indexedDB') return [];
    const db = await open();
    const rows = await request(db.transaction('backups', 'readonly').objectStore('backups').getAll());
    return rows.sort((a, b) => (+b.createdAt || 0) - (+a.createdAt || 0));
  }
  async function clear() {
    if (!available()) return;
    const db = await open();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORES, 'readwrite');
      STORES.forEach(s => tx.objectStore(s).clear());
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
    _lsDB = null; readyPromise = null; mode = 'pending';
  }
  return {
    available, ready, save, validate, verifyAggregate, putBackup, listBackups, clear,
    repairProjectRefs, foldArchivedProjects,
    /* Phase 2B.0 BUG-2 — nested project references. Exported so the live
       project-delete path applies the exact same canonical definition and
       policy as the recovery repair instead of growing a second system. */
    eachNestedProjectRef, nestedProjectRefs: PROJECT_NESTED_REFS, projectOwned: PROJECT_OWNED,
    schemaVersion: VERSION, migrationVersion: MIGRATION_VERSION,
    status() { return { mode, error: lastError, migrationVersion: MIGRATION_VERSION }; }
  };
})();
