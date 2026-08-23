/* ================= SETTINGS HUB (v26) ================= */
function renderSettings() {
  const c = $('#content');
  const s = state.settings || {};
  const theme = document.documentElement.getAttribute('data-theme') || 'light';
  const notifyOn = !!s.notify;
  const canNotify = notifySupported();
  const perm = canNotify ? (Notification.permission || 'default') : 'unsupported';
  let usage = '—';
  try {
    const raw = JSON.stringify(_lsDB || {});
    const mb = (raw.length * 2 / 1048576).toFixed(1);
    usage = (STRUCTURED_DB.status().mode === 'indexedDB' ? 'IndexedDB · ' : 'localStorage fallback · ') + faNum(mb) + ' MB · ' + faNum((state.photos || []).length) + ' ' + t('storagePhotos');
  } catch (e) {}
  const permBadge = perm === 'granted' ? `<span class="badge b-green">${t('setNotifyGranted')}</span>`
    : perm === 'denied' ? `<span class="badge b-red">${t('setNotifyDenied')}</span>`
    : perm === 'unsupported' ? `<span class="badge b-gray">—</span>`
    : `<span class="badge b-amber">${t('setNotifyAsk')}</span>`;
  c.innerHTML = `
    <div class="grid-2">
      <div class="card">
        <div class="card-title">🏢 ${t('setCompany')}</div>
        <div class="field"><label>${t('setCompany')}</label><input id="st_company" value="${esc(s.company || '')}" /></div>
        <div class="form-grid">
          <div class="field"><label>${t('setPhone')}</label><input id="st_phone" value="${esc(s.phone || '')}" /></div>
          <div class="field"><label>${t('setAddress')}</label><input id="st_address" value="${esc(s.address || '')}" /></div>
        </div>
        <button class="btn btn-primary btn-sm" id="stSaveCompany">💾 ${t('save')}</button>
      </div>
      <div class="card">
        <div class="card-title">🔧 ${t('setSvcDefaults')}</div>
        <div class="field"><label>${t('setDefaultTech')}</label><input id="st_defaulttech" value="${esc(s.defaultTech || '')}" placeholder="${esc((state.user && state.user.name) || '')}" /></div>
        <p class="hint">${t('setDefaultTechHint')}</p>
        <div class="field" style="max-width:160px;margin-top:6px"><label>${t('invTaxRate')}</label><input id="st_taxrate" type="number" min="0" max="100" step="1" value="${faNum(s.taxRate != null ? s.taxRate : 0)}" /></div>
        <button class="btn btn-primary btn-sm" id="stSaveSvc" style="margin-top:8px">💾 ${t('save')}</button>
      </div>
    </div>
    <div class="grid-2" style="margin-top:16px">
      <div class="card">
        <div class="card-title">🎨 ${t('setAppearance')}</div>
        <div class="seg" style="margin-bottom:12px">
          <button class="seg-btn ${theme === 'light' ? 'active' : ''}" onclick="setTheme('light')">☀️ ${t('setLight')}</button>
          <button class="seg-btn ${theme === 'dark' ? 'active' : ''}" onclick="setTheme('dark')">🌙 ${t('setDark')}</button>
        </div>
        <div class="seg">
          <button class="seg-btn ${LANG === 'fa' ? 'active' : ''}" onclick="setLang('fa')">فارسی</button>
          <button class="seg-btn ${LANG === 'en' ? 'active' : ''}" onclick="setLang('en')">English</button>
        </div>
      </div>
      <div class="card">
        <div class="card-title">🔔 ${t('setNotifications')}</div>
        ${canNotify ? `
        <div class="due-item" style="align-items:center">
          <div class="grow"><strong>${t('setNotifyEnable')}</strong><div class="d-sub">${t('setNotifyHint')}</div></div>
          <div class="seg" style="max-width:170px">
            <button class="seg-btn ${notifyOn ? 'active' : ''}" onclick="toggleNotify(true)">${t('setOn')}</button>
            <button class="seg-btn ${!notifyOn ? 'active' : ''}" onclick="toggleNotify(false)">${t('setOff')}</button>
          </div>
        </div>
        <div style="margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          ${permBadge}
          ${perm === 'default' ? `<button class="btn btn-ghost btn-sm" onclick="enableNotifications()">${t('setNotifyRequest')}</button>` : ''}
        </div>` : `<p class="hint">${t('setNotifyUnsupported')}</p>`}
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="card-title">💾 ${t('setData')}</div>
      <div class="kv-cell" style="margin-bottom:12px"><div class="k">📊 ${t('storageUsage')}</div><div class="v">${usage}</div>
        <div class="k" style="margin-top:6px">🕓 ${t('backupStatus')}: ${backupStatusBadge()} <span class="badge b-amber" style="font-size:10.5px">📱 ${t('backupLocalTag')}</span></div></div>
      <label style="display:flex;gap:10px;align-items:center;font-size:13px;margin-bottom:12px;cursor:pointer">
        <input type="checkbox" id="st_autobackup" ${(s.autoBackup !== false) ? 'checked' : ''} style="width:20px;height:20px" />
        <span>${t('backupAutoOn')}</span>
      </label>
      <div style="display:flex;gap:9px;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="openBackupModal()">💾 ${t('backup')}</button>
        <button class="btn btn-soft-danger" onclick="clearAllData()">${IC.trash} ${t('setClearAll')}</button>
      </div>
    </div>
    <div class="card" style="margin-top:16px;text-align:center">
      <div style="font-size:32px;margin-bottom:4px">🛗</div>
      <strong style="font-size:17px">Z Lift</strong>
      <div style="color:var(--text-3);font-size:12.5px;margin-top:4px">
        v${esc(APP_VERSION)} · DB v${faNum(DB_SCHEMA_VERSION)} · Backup v${faNum(BACKUP_FORMAT_VERSION)} · ${esc(APP_BUILD)}
      </div>
      <div style="color:var(--text-3);font-size:11.5px;margin-top:2px">${t('tagline')}</div>
      <button class="btn btn-ghost btn-sm" style="margin-top:12px;color:#2AABEE" onclick="openTgChannel()">${IC.telegram} ${t('tgChannel')}</button>
    </div>`;
  $('#stSaveCompany').onclick = guard('#stSaveCompany', async () => {
    try { const d = await api('/settings', { method: 'PUT', body: { company: $('#st_company').value, phone: $('#st_phone').value, address: $('#st_address').value } }); state.settings = d.settings; toast(t('saved')); }
    catch (e) { toast(errMsg(e), 'err'); }
  });
  $('#stSaveSvc').onclick = guard('#stSaveSvc', async () => {
    try { const d = await api('/settings', { method: 'PUT', body: { defaultTech: $('#st_defaulttech').value, taxRate: Math.max(0, Math.min(100, Math.round(+$('#st_taxrate').value || 0))) } }); state.settings = d.settings; toast(t('saved')); }
    catch (e) { toast(errMsg(e), 'err'); }
  });
  const ab = document.getElementById('st_autobackup');
  if (ab) ab.onchange = async () => {
    try { const d = await api('/settings', { method: 'PUT', body: { autoBackup: ab.checked } }); state.settings = d.settings; if (ab.checked) runAutoBackup(); toast(t('saved')); }
    catch (e) { toast(errMsg(e), 'err'); }
  };
}
