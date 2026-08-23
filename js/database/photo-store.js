/* ================= INDEXEDDB PHOTO STORE (v28) =================
   Photos are the only large blobs in the app. localStorage reliably holds only
   ~5 MB, so photo data now lives in IndexedDB when the browser provides it:
     • metadata (id, cat, projectId, note, createdAt, inIdb) stays in zlift_db
     • the base64 payload is stored as a separate IDB record  { id → data }
   SAFE MIGRATION (_migratePhotosToIdb): photos found inline in zlift_db are
   COPIED to IDB first; the localStorage copy is stripped only after every copy
   is verified readable; if anything fails the inline data is left untouched.
   FALLBACK: environments without IndexedDB (or on any IDB error) keep the
   previous behaviour — inline data in localStorage. The flag `inIdb` on each
   photo record marks where the payload lives, so export/restore and rendering
   hydrate transparently. */
var IDB_PHOTOS = (() => {
  const DB_NAME = 'zlift-photos', STORE = 'photos', VERSION = 1;
  let dbp = null;
  function available() {
    try { return typeof indexedDB !== 'undefined' && indexedDB && typeof indexedDB.open === 'function'; }
    catch (e) { return false; }
  }
  function open() {
    if (!available()) return Promise.reject(new Error('idb-unavailable'));
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(DB_NAME, VERSION); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => {
        try { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' }); }
        catch (e) { reject(e); }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { dbp = null; reject(req.error || new Error('idb-open-failed')); };
      req.onblocked = () => { dbp = null; reject(new Error('idb-blocked')); };
    });
    return dbp;
  }
  function tx(mode, fn) {
    return open().then(db => new Promise((resolve, reject) => {
      let t, out;
      try { t = db.transaction(STORE, mode); } catch (e) { reject(e); return; }
      const st = t.objectStore(STORE);
      try { out = fn(st); } catch (e) { reject(e); return; }
      t.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
      t.onerror = () => reject(t.error || new Error('idb-tx-failed'));
      t.onabort = () => reject(t.error || new Error('idb-tx-abort'));
    }));
  }
  return {
    available,
    put(id, data) { return tx('readwrite', st => st.put({ id, data })); },
    get(id) { return tx('readonly', st => st.get(id)).then(r => (r && typeof r.data === 'string') ? r.data : null); },
    del(id) { return tx('readwrite', st => st.delete(id)); },
    clear() { return tx('readwrite', st => st.clear()); },
    count() { return tx('readonly', st => st.count()); }
  };
})();
/* resolve a photo record to a displayable data-URL — sync when the payload is
   inline, async (IDB) otherwise. Never throws. */
function photoDataSync(ph) {
  return (ph && typeof ph.data === 'string' && ph.data) ? safePhotoSrc(ph.data) : '';
}
function hydratePhotoImgs() {
  const imgs = $$('#content img[data-phid], #modalRoot img[data-phid]');
  imgs.forEach(img => {
    const ph = state.photos.find(p => p.id === img.dataset.phid);
    if (!ph || img.dataset.hydrated) return;
    const inline = photoDataSync(ph);
    if (inline) { img.src = inline; img.dataset.hydrated = '1'; return; }
    if (!ph.inIdb || !IDB_PHOTOS.available()) return;
    img.dataset.hydrated = '1';
    IDB_PHOTOS.get(ph.id).then(d => { if (d) img.src = safePhotoSrc(d); }).catch(() => {});
  });
}
/* move inline photo payloads from zlift_db into IndexedDB (one-way, verified) */
async function _migratePhotosToIdb() {
  try {
    if (!IDB_PHOTOS.available()) return false;
    const db = _lsDB;
    if (!db || !Array.isArray(db.photos)) return false;
    const inline = db.photos.filter(p => p && typeof p.data === 'string' && p.data.length > 4000);
    if (!inline.length) return false;
    let copied = 0;
    for (const p of inline) {
      try { await IDB_PHOTOS.put(p.id, p.data); const back = await IDB_PHOTOS.get(p.id); if (back === p.data) copied++; }
      catch (e) { break; }                       // any failure → keep localStorage intact
    }
    if (copied !== inline.length) return false;   // not fully verified → NO stripping (rollback = do nothing)
    inline.forEach(p => { p.data = ''; p.inIdb = true; });
    state.photos.forEach(sp => { const m = inline.find(x => x.id === sp.id); if (m) { sp.data = ''; sp.inIdb = true; } });
    await _lsSave();
    hydratePhotoImgs();
    return true;
  } catch (e) { return false; }
}
