/* ================= BACKUP / RESTORE ================= */
function validateBackup(bk) {
  if (!bk || typeof bk !== 'object') return { ok: false, why: 'format' };
  if (bk.app !== 'zlift') return { ok: false, why: 'app' };
  if (!Array.isArray(bk.projects)) return { ok: false, why: 'projects' };
  // Backward compatible, but the declared format itself must be a real integer.
  const ver = Number(bk.formatVersion != null ? bk.formatVersion : (bk.version != null ? bk.version : 1));
  if (!Number.isInteger(ver) || ver < 1) return { ok: false, why: 'version' };
  if (ver > BACKUP_FORMAT_VERSION) return { ok: false, why: 'future-version' };
  // structural checks on core collections (old backups may miss newer ones — fine)
  for (const k of ['projects', 'archivedProjects', 'services', 'invoices', 'contracts', 'parts', 'notes', 'checklists', 'measurements', 'safetyLogs', 'reminders', 'photos', 'diagSessions', 'calcSaves', 'issues', 'tools']) {
    if (bk[k] !== undefined && !Array.isArray(bk[k])) return { ok: false, why: k };
  }
  if (bk.settings !== undefined && (!bk.settings || typeof bk.settings !== 'object' || Array.isArray(bk.settings))) return { ok: false, why: 'settings' };
  if (bk.dbSchemaVersion != null) {
    const schema = Number(bk.dbSchemaVersion);
    if (!Number.isInteger(schema) || schema < 1) return { ok: false, why: 'schema' };
    if (schema > DB_SCHEMA_VERSION) return { ok: false, why: 'future-schema' };
  }
  // ids must be non-empty strings and unique within every collection
  const idsByCollection = {};
  for (const k of ['projects', 'archivedProjects', 'services', 'invoices', 'contracts', 'parts', 'notes', 'checklists', 'measurements', 'safetyLogs', 'reminders', 'photos', 'diagSessions', 'calcSaves', 'issues', 'tools']) {
    if (!Array.isArray(bk[k])) continue;
    const seen = new Set();
    for (const row of bk[k]) {
      if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id) return { ok: false, why: k + ':id' };
      if (seen.has(row.id)) return { ok: false, why: k + ':duplicate-id' };
      seen.add(row.id);
    }
    idsByCollection[k] = seen;
  }
  // relationships may be empty (standalone/history records), but a non-empty
  // project link must resolve in the same backup.
  const projectIds = idsByCollection.projects || new Set();
  for (const k of ['services', 'invoices', 'contracts', 'checklists', 'measurements', 'reminders', 'photos', 'diagSessions', 'issues']) {
    for (const row of (bk[k] || [])) if (row.projectId && !projectIds.has(row.projectId)) return { ok: false, why: k + ':project-relation' };
  }
  const serviceIds = idsByCollection.services || new Set();
  const photoIds = idsByCollection.photos || new Set();
  for (const inv of (bk.invoices || [])) if (inv.serviceId && !serviceIds.has(inv.serviceId)) return { ok: false, why: 'invoices:service-relation' };
  for (const m of (bk.measurements || [])) {
    if (m.serviceId && !serviceIds.has(m.serviceId)) return { ok: false, why: 'measurements:service-relation' };
    if (m.photoId && !photoIds.has(m.photoId)) return { ok: false, why: 'measurements:photo-relation' };
  }
  // Domain validation for records that can cause financial or safety decisions.
  const invoiceNumbers = new Set();
  for (const inv of (bk.invoices || [])) {
    if (typeof inv.customer !== 'string' || !inv.customer.trim()) return { ok: false, why: 'invoices:customer' };
    if (!Array.isArray(inv.items) || (inv.payments !== undefined && !Array.isArray(inv.payments))) return { ok: false, why: 'invoices:structure' };
    if (inv.number != null && String(inv.number).trim()) {
      const number = String(inv.number).trim();
      if (invoiceNumbers.has(number)) return { ok: false, why: 'invoices:duplicate-number' };
      invoiceNumbers.add(number);
    }
    for (const row of inv.items) {
      if (!row || typeof row !== 'object' || !Number.isFinite(Number(row.qty)) || Number(row.qty) < 0 || !Number.isFinite(Number(row.price)) || Number(row.price) < 0) return { ok: false, why: 'invoices:item' };
    }
    for (const pay of (inv.payments || [])) {
      if (!pay || typeof pay !== 'object' || !Number.isFinite(Number(pay.amount)) || Number(pay.amount) <= 0) return { ok: false, why: 'invoices:payment' };
    }
    for (const key of ['labor', 'discount']) if (inv[key] != null && (!Number.isFinite(Number(inv[key])) || Number(inv[key]) < 0)) return { ok: false, why: 'invoices:' + key };
    if (inv.taxRate != null && (!Number.isFinite(Number(inv.taxRate)) || Number(inv.taxRate) < 0 || Number(inv.taxRate) > 100)) return { ok: false, why: 'invoices:tax' };
  }
  for (const m of (bk.measurements || [])) {
    if (typeof m.typeId !== 'string' || !m.typeId) return { ok: false, why: 'measurements:type' };
    if (m.status != null && !['normal', 'attention', 'critical', 'unknown'].includes(m.status)) return { ok: false, why: 'measurements:status' };
    if ((m.kind || 'numeric') === 'numeric' && !Number.isFinite(Number(m.value))) return { ok: false, why: 'measurements:value' };
  }
  for (const ph of (bk.photos || [])) {
    if (ph.data && !safePhotoSrc(ph.data)) return { ok: false, why: 'photos:data' };
    /* A portable backup cannot rely on an IndexedDB blob that exists only on
       the source device. Export must hydrate it before this validator accepts it. */
    if (ph.inIdb && !ph.data) return { ok: false, why: 'photos:missing-data' };
  }
  // prototype-pollution guard
  const serial = JSON.stringify(bk);
  const poison = serial.includes('"__proto__"') || serial.includes('"constructor":{"prototype"');
  if (poison) return { ok: false, why: 'unsafe keys' };
  return { ok: true, version: ver, counts: Object.fromEntries(Object.keys(idsByCollection).map(k => [k, idsByCollection[k].size])) };
}
/* automatic local backup: keeps a rotating set of dated snapshots in
   localStorage (no network, no third party). Recovers from accidental
   deletes/corruption. Telegram upload is explicitly NOT done client-side
   because it would require exposing a bot token in the frontend — that is a
   backend feature and is intentionally left for the future. */
var AUTO_BACKUP_KEY = 'zlift_autobackup';
var AUTO_BACKUP_DAYS = 1;
function backupStatusBadge() {
  const last = +(localStorage.getItem('zlift_last_backup') || 0);
  if (!last) return '🔴 ' + t('backupNone');
  const days = Math.floor((Date.now() - last) / 86400000);
  if (days <= 7) return '🟢 ' + t('backupUpToDate');
  if (days <= 30) return '🟡 ' + t('backupRecommended') + ' (' + faNum(days) + ' ' + t('daysAgo') + ')';
  return '🔴 ' + faNum(days) + ' ' + t('daysAgo');
}
function autoBackupIfDue() {
  try {
    if (state.settings && state.settings.autoBackup === false) return;
    const last = +(localStorage.getItem('zlift_last_backup') || 0);
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
    localStorage.setItem('zlift_last_backup', String(Date.now()));
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
          const lastBk = +localStorage.getItem('zlift_last_backup') || 0;
          const days = lastBk ? Math.floor((Date.now() - lastBk) / 86400000) : -1;
          const lastTxt = lastBk
            ? fmtDate(lastBk) + (days > 0 ? ' · ' + faNum(days) + ' ' + t('daysAgo') : ' · ' + t('today'))
            : t('backupNever');
          return `<div class="kv-cell" style="margin-bottom:14px"><div class="k">📊 ${t('storageUsage')}</div>
            <div class="v" style="font-weight:600;font-size:13px">${faNum(mb)} MB · ${faNum((state.photos || []).length)} ${t('storagePhotos')}</div>
            <div class="k" style="margin-top:6px">🕓 ${t('backupLast')}: <b style="color:${lastBk && days <= 7 ? 'var(--ok)' : 'var(--danger)'}">${lastTxt}</b></div>
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
      downloadBlob(new Blob([JSON.stringify(d.backup, null, 2)], { type: 'application/json' }),
        'zlift-backup-' + new Date().toISOString().slice(0, 10) + '.json');
      localStorage.setItem('zlift_last_backup', String(Date.now()));
      toast(t('backupDone'));
    } catch (e) { toast(errMsg(e), 'err'); }
  };
  $('#bkImport').onclick = () => $('#bkFile').click();
  $('#bkFile').onchange = () => {
    const file = $('#bkFile').files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let bk;
      try { bk = JSON.parse(reader.result); } catch (e) { toast(t('restoreBad'), 'err'); return; }
      const v = validateBackup(bk);
      if (!v.ok) { toast(t('restoreBad') + (v.why ? ' (' + v.why + ')' : ''), 'err'); return; }
      // restore summary + explicit confirmation
      const colls = ['projects', 'services', 'invoices', 'contracts', 'parts', 'notes', 'photos', 'issues'];
      const summary = colls.map(k => Array.isArray(bk[k]) ? faNum(bk[k].length) + ' ' + (I18N[LANG][
        { projects: 'projects', services: 'services', invoices: 'invoices', contracts: 'contracts', parts: 'parts', notes: 'notes', photos: 'photos', issues: 'issues' }[k]
      ] || k) : '').filter(Boolean).join(' · ');
      confirmDialog(t('restoreConfirmTitle'), t('restoreConfirmMsg') + '\n' + t('restoreOf') + ': ' + summary, async () => {
        let safety = null;
        try {
          // 1) verified local safety snapshot of CURRENT data before overwrite
          const cur = await api('/backup');
          safety = cur.backup;
          if (STRUCTURED_DB.status().mode === 'indexedDB') {
            await STRUCTURED_DB.putBackup({ id: 'pre-restore-' + Date.now(), app: 'zlift-auto', version: BACKUP_FORMAT_VERSION, appVersion: APP_VERSION, dbSchemaVersion: DB_SCHEMA_VERSION, createdAt: Date.now(), kind: 'PRE_RESTORE', data: safety });
          } else {
            localStorage.setItem('zlift_pre_restore_backup', JSON.stringify(safety));
          }
          // 2) validated, staged, atomic restore
          const restored = await api('/backup', { method: 'PUT', body: { backup: bk } });
          if (!restored || !restored.verified) throw new Error('restore-not-verified');
          // 3) read-back verification
          await loadAll(true);
          if (!Array.isArray(state.projects) || state.projects.length !== bk.projects.length) throw new Error('restore-count-verification');
          closeModal();
          toast(t('restoreDone'));
          render();
        } catch (e) {
          // 4) rollback to the in-memory safety snapshot; never silently continue
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
    };
    reader.readAsText(file);
  };
}
