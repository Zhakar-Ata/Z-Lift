/* ================= MEASUREMENT ENGINE ================= */
function measurePanelHTML(prefix) {
  return `
    <div class="card" style="margin-top:14px">
      <div class="card-title" style="margin-bottom:8px">📐 ${t('measures')}</div>
      <p style="font-size:11.8px;color:var(--text-3);margin-bottom:10px">${t('measNote')}</p>
      <div class="form-grid">
        ${MEASURE_FIELDS.map(f => `
          <div class="field" style="margin-bottom:8px">
            <label>${esc(f.fa)} <span style="color:var(--text-3);direction:ltr;display:inline-block">(${f.unit})</span></label>
            <input type="number" step="any" id="${prefix}_${f.id}" placeholder="—" />
          </div>`).join('')}
      </div>
      <button class="btn btn-ghost btn-sm" id="${prefix}_evalBtn">🧪 ${t('measCheck')}</button>
      <div id="${prefix}_evalOut"></div>
    </div>`;
}
function collectMeasures(prefix) {
  const out = [];
  MEASURE_FIELDS.forEach(f => {
    const el = $('#' + prefix + '_' + f.id);
    if (el && el.value !== '') out.push({ id: f.id, label: f.fa, value: parseFloat(el.value), unit: f.unit });
  });
  return out;
}
function evalMeasures(list, context) {
  /* Legacy diagnostic measurement panel now delegates to the same conservative
     engine as the measurement history. No duplicate hard-coded EN thresholds. */
  const ctx = context && typeof context === 'object' ? context : {};
  return (Array.isArray(list) ? list : []).map(entry => {
    const f = MEASURE_FIELDS_BY_ID[entry.id];
    const res = evalMeasurement({ typeId: entry.id, value: entry.value, context: ctx });
    const reason = res.reason && (res.reason[LANG] || res.reason.fa || res.reason.en);
    const statusLabel = MEAS_STATUS_META[res.status] ? t(MEAS_STATUS_META[res.status].key) : t('measStatusUnknown');
    return {
      ok: res.status === 'normal' ? true : (res.status === 'unknown' ? null : false),
      status: res.status,
      verificationStatus: res.thresholdClass || (f && f.thresholdClass) || THRESHOLD_CLASS.UNKNOWN,
      text: `${f ? (f[LANG] || f.fa) : entry.id}: ${faNum(entry.value)}${f && f.unit ? ' ' + f.unit : ''} — ${statusLabel}${reason ? ' · ' + reason : ''}`
    };
  });
}
function wireMeasurePanel(prefix) {
  const btn = $('#' + prefix + '_evalBtn');
  if (!btn) return;
  btn.onclick = () => {
    const list = collectMeasures(prefix);
    const msgs = evalMeasures(list);
    $('#' + prefix + '_evalOut').innerHTML = msgs.length
      ? `<div class="calc-result" style="margin-top:10px">${msgs.map(m => `<div class="r-row"><span class="r-label" style="font-size:12.8px">${m.status === 'normal' ? '✅' : m.status === 'critical' ? '⛔' : m.status === 'attention' ? '⚠️' : '❔'} ${esc(m.text)} · ${esc(m.verificationStatus)}</span></div>`).join('')}</div>`
      : `<p class="calc-note">—</p>`;
  };
}

/* ================= SAVE DIAGNOSTIC SESSION ================= */
function openDiagSaveForm(flowId, resultNodeId) {
  const f = DIAG_FLOWS.find(x => x.id === flowId);
  const node = f.nodes[resultNodeId];
  const path = diagSession.path.map(pid => f.nodes[pid] && f.nodes[pid].q ? f.nodes[pid].q.fa : '').filter(Boolean);
  openModal(`
    <div class="modal-head"><h3>💾 ${t('diagSave')}</h3><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="field"><label>${t('diagSelProject')}</label><select id="dg_project">
        <option value="">—</option>
        ${state.projects.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}
      </select></div>
      <div class="field"><label>${t('diagFinal')}</label><textarea id="dg_final" style="min-height:60px">${esc(node.title.fa)}</textarea></div>
      <div class="field"><label>${t('diagFaultyComp')}</label><input id="dg_comp" value="${esc((node.parts || []).map(x => x.fa).join('، '))}" /></div>
      ${measurePanelHTML('dgm')}
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-primary" id="dgSave">💾 ${t('save')}</button>
    </div>`, { size: 'lg' });
  wireMeasurePanel('dgm');
  $('#dgSave').onclick = guard('#dgSave', async () => {
    const body = {
      projectId: $('#dg_project').value,
      flowId, symptom: f.symptom.fa,
      path, result: node.title.fa,
      finalDiagnosis: $('#dg_final').value,
      faultyComponent: $('#dg_comp').value,
      measurements: collectMeasures('dgm'),
      technician: state.user.name,
      date: Date.now()
    };
    try {
      const d = await api('/diagSessions', { method: 'POST', body });
      state.diagSessions.unshift(d.item);
      closeModal();
      toast(t('diagSaved'));
      // offer transfer to service report
      diagToServicePrompt(d.item);
    } catch (e) { toast(errMsg(e), 'err'); }
  });
}
function diagToServicePrompt(sess) {
  openModal(`
    <div class="modal-head"><h3>🔧 ${t('diagToService')}</h3><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <div class="modal-body"><p style="font-size:13.5px;color:var(--text-2)">${t('diagToService')}؟</p></div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">${t('close')}</button>
      <button class="btn btn-primary" id="dg2svc">✅ ${t('diagToService')}</button>
    </div>`, { size: 'sm' });
  $('#dg2svc').onclick = () => {
    closeModal();
    openServiceForm(null, sess.projectId || '');
    // prefill after modal renders
    setTimeout(() => {
      const probEl = $('#s_problem'), diagEl = $('#s_diag'), measEl = $('#s_meas');
      if (probEl && !probEl.value) probEl.value = sess.symptom || '';
      if (diagEl) diagEl.value = (sess.finalDiagnosis || '') + (sess.faultyComponent ? ' — ' + (LANG === 'fa' ? 'قطعه: ' : 'part: ') + sess.faultyComponent : '');
      if (measEl && sess.measurements && sess.measurements.length) {
        measEl.value = sess.measurements.map(m => m.label + '=' + m.value + m.unit).join(' · ');
      }
    }, 60);
  };
}

/* ================= SAVE CALCULATION ================= */
function openCalcSaveForm(calId) {
  const cal = CALCULATORS.find(x => x.id === calId);
  if (!cal) return;
  const vals = {};
  cal.inputs.forEach(inp => { vals[inp.id] = parseFloat($(`#calc_${cal.id}_${inp.id}`).value) || 0; });
  let rows = [];
  try { rows = cal.compute(vals); } catch (e) {}
  openModal(`
    <div class="modal-head"><h3>💾 ${t('calcSave')}</h3><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="kv-cell" style="margin-bottom:12px"><div class="k">${esc(cal.title.fa)}</div>
        <div class="v" style="font-weight:500;font-size:13px">${rows.map(r => esc((r.label.fa || '') + ': ' + r.val)).join(' · ')}</div></div>
      <div class="field"><label>${t('diagSelProject')}</label><select id="cs_project">
        <option value="">—</option>
        ${state.projects.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}
      </select></div>
      <div class="field"><label>${t('prNotes')}</label><input id="cs_note" /></div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-primary" id="csSave">💾 ${t('save')}</button>
    </div>`, { size: 'sm' });
  $('#csSave').onclick = guard('#csSave', async () => {
    try {
      const d = await api('/calcSaves', { method: 'POST', body: {
        calcId: cal.id, name: cal.title.fa,
        inputs: cal.inputs.map(inp => ({ label: inp.label.fa, value: vals[inp.id], unit: inp.unit || '' })),
        results: rows.map(r => ({ label: r.label.fa || '', val: r.val })),
        projectId: $('#cs_project').value, note: $('#cs_note').value,
        technician: state.user.name
      } });
      state.calcSaves.unshift(d.item);
      closeModal(); toast(t('calcSaved'));
    } catch (e) { toast(errMsg(e), 'err'); }
  });
}

/* ================= PARTS CONSUMPTION ================= */
function openConsumeForm(partId) {
  const part = state.parts.find(x => x.id === partId);
  if (!part) return;
  openModal(`
    <div class="modal-head"><h3>📉 ${t('consume')} — ${esc(part.name)}</h3><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="kv-cell" style="margin-bottom:12px"><div class="k">${t('partQty')}</div><div class="v">${faNum(part.qty)} ${esc(part.unit)}</div></div>
      <div class="field"><label>${t('consumeQty')} *</label><input id="cn_qty" type="number" min="1" value="1" /></div>
      <div class="field"><label>${t('diagSelProject')}</label><select id="cn_project">
        <option value="">—</option>
        ${state.projects.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}
      </select></div>
      <div class="field"><label>${t('prNotes')}</label><input id="cn_note" /></div>
      ${Array.isArray(part.history) && part.history.length ? `
        <div class="section-title" style="margin:14px 0 8px"><h3 style="font-size:13.5px">📜 ${t('consumeHistory')}</h3></div>
        ${part.history.slice(0, 5).map(h => { const q = +h.qty || 0; const disp = q > 0 && h.note !== 'adjustment' ? -q : q; return `<div class="kv-cell" style="margin-bottom:6px"><div class="v" style="font-weight:500;font-size:12.5px">${disp > 0 ? '+' : ''}${faNum(disp)}${h.shortQty ? ' <span style="color:var(--danger)">⚠️ ' + faNum(h.shortQty) + ' ' + t('stockShortTag') + '</span>' : ''} · ${fmtDate(h.date)}${h.projectId ? ' · ' + esc(projName(h.projectId)) : ''}${h.note === 'adjustment' ? ' · ' + t('adjustLabel') : (h.note ? ' · ' + esc(h.note) : '')}</div></div>`; }).join('')}` : ''}
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-primary" id="cnSave">📉 ${t('consume')}</button>
    </div>`);
  let overStockConfirmed = false;
  $('#cnSave').onclick = guard('#cnSave', async () => {
    const qty = Math.max(1, Math.round(+$('#cn_qty').value || 1));
    if (qty > (+part.qty || 0) && !overStockConfirmed) {
      overStockConfirmed = true;                 // second tap confirms
      toast(t('consumeOverStock'), 'err');
      return;
    }
    try {
      const d = await api('/parts-consume', { method: 'POST', body: { partId: part.id, qty, projectId: $('#cn_project').value, note: $('#cn_note').value } });
      Object.assign(part, d.part);
      warnStockShort(d, part.name);
      closeModal(); toast(t('consumeDone') + ' — ' + faNum(part.qty) + ' ' + part.unit); drawParts();
    } catch (e) { toast(errMsg(e), 'err'); }
  });
}

/* ================= PHOTOS ================= */
function photoCats() { return t('photoCats').split('|'); }
/* only allow safe raster data-URIs — blocks javascript:/svg vectors from malicious backups */
/* 1×1 transparent PNG shown until an IndexedDB-backed photo hydrates */
var PHOTO_PLACEHOLDER = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNsaGj4DwAFhAJ/wlseKgAAAABJRU5ErkJggg==';
function safePhotoSrc(d) {
  return (typeof d === 'string' && /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(d)) ? d : '';
}
function openPhotoForm(presetProject) {
  const cats = photoCats();
  openModal(`
    <div class="modal-head"><h3>📷 ${t('addPhoto')}</h3><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="field"><label>${t('photoCat')}</label><select id="ph_cat">${cats.map(x => `<option>${esc(x)}</option>`).join('')}</select></div>
      <div class="field"><label>${t('diagSelProject')}</label><select id="ph_project">
        <option value="">—</option>
        ${state.projects.map(p => `<option value="${p.id}" ${presetProject === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
      </select></div>
      <div class="field"><label>${t('prNotes')}</label><input id="ph_note" /></div>
      <input type="file" id="ph_file" accept="image/*" capture="environment" style="width:100%" />
      <div id="ph_preview" style="margin-top:10px"></div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-primary" id="phSave" disabled>💾 ${t('save')}</button>
    </div>`);
  let dataUrl = '';
  $('#ph_file').onchange = () => {
    const file = $('#ph_file').files[0];
    if (!file) return;
    const img = new Image();
    const fr = new FileReader();
    fr.onerror = () => toast(t('photoReadFailed'), 'err');
    img.onerror = () => { dataUrl = ''; $('#phSave').disabled = true; toast(t('photoReadFailed'), 'err'); };
    fr.onload = () => {
      img.onload = () => {
        // downscale to max 1280px to keep storage sane
        const max = 1280;
        let { width: w, height: h } = img;
        if (w > max || h > max) { const k = Math.min(max / w, max / h); w = Math.round(w * k); h = Math.round(h * k); }
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        dataUrl = cv.toDataURL('image/jpeg', 0.75);
        if (dataUrl.length > 2000000) { toast(t('photoTooLarge'), 'err'); dataUrl = ''; return; }
        $('#ph_preview').innerHTML = `<img src="${dataUrl}" style="max-width:100%;border-radius:12px;border:1px solid var(--border)" />`;
        $('#phSave').disabled = false;
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  };
  $('#phSave').onclick = guard('#phSave', async () => {
    if (!dataUrl) return;
    try {
      const d = await api('/photos', { method: 'POST', body: { data: dataUrl, cat: $('#ph_cat').value, projectId: $('#ph_project').value, note: $('#ph_note').value } });
      state.photos.unshift(d.item);
      closeModal(); toast(t('saved')); render();
    } catch (e) { toast(errMsg(e), 'err'); }
  });
}
function viewPhoto(id) {
  const ph = state.photos.find(x => x.id === id);
  if (!ph) return;
  openModal(`
    <div class="modal-head"><h3>📷 ${esc(ph.cat || '')}</h3><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <div class="modal-body" style="text-align:center">
      <img src="${photoDataSync(ph) || PHOTO_PLACEHOLDER}" data-phid="${esc(ph.id)}" style="max-width:100%;border-radius:12px;background:var(--bg-soft)" />
      <p style="font-size:12.5px;color:var(--text-2);margin-top:8px">${fmtDateTime(ph.createdAt)}${ph.projectId ? ' · ' + esc(projName(ph.projectId)) : ''}${ph.note ? '<br>' + esc(ph.note) : ''}</p>
    </div>
    <div class="modal-foot">
      <button class="btn btn-soft-danger" onclick="deletePhoto('${ph.id}')">${IC.trash} ${t('delete')}</button>
      <button class="btn btn-primary" onclick="closeModal()">${t('close')}</button>
    </div>`, { size: 'lg' });
  hydratePhotoImgs();
}
function deletePhoto(id) {
  confirmDialog(t('confirmDeleteTitle'), t('confirmDeletePhotoMsg'), async () => {
    const rb = optimisticRemove(state.photos, id);
    if (!rb) { closeModal(); return; }
    closeModal(); render();
    try { await api('/photos/' + id, { method: 'DELETE' }); toast(t('deleted')); }
    catch (e) { rb.restore(); toast(errMsg(e), 'err'); render(); }
  });
}


/* ================= INVOICES ================= */
var invFilter = { q: '', status: 'all' };
var invDraft = null; // items being edited in the open form

function money(n) { return faNum((Math.round(+n || 0)).toLocaleString('en-US')); }
function invTotals(inv) {
  /* integer-safe: rials have no fractions; round every term to avoid FP drift.
     Tax is computed on the post-discount subtotal (items+labor-discount). */
  const items = (inv.items || []).reduce((a, it) => a + Math.round(+it.qty || 0) * Math.round(+it.price || 0), 0);
  const labor = Math.round(+inv.labor || 0);
  const discount = Math.round(+inv.discount || 0);
  const base = Math.max(0, items + labor - discount);
  const taxRate = inv.taxExempt ? 0 : Math.max(0, Math.min(100, Math.round(+inv.taxRate || 0)));
  const tax = Math.round(base * taxRate / 100);
  const grand = base + tax;
  const paid = (inv.payments || []).reduce((a, p) => a + (Math.round(+p.amount) || 0), 0);
  return { items, labor, discount, base, tax, taxRate, grand, paid, balance: Math.max(0, grand - paid), overpayment: Math.max(0, paid - grand) };
}
function invStatusMeta(inv) {
  const tt = invTotals(inv);
  if (tt.grand > 0 && tt.paid >= tt.grand) return { key: 'invPaidFull', cls: 'b-green', icon: '✅' };
  if (tt.paid > 0) return { key: 'invPartial', cls: 'b-amber', icon: '🟠' };
  return { key: 'invUnpaid', cls: 'b-red', icon: '🔴' };
}

function renderInvoices() {
  const c = $('#content');
  const month = Date.now() - 30 * 86400000;
  let incomeMonth = 0, openBalance = 0;
  state.invoices.forEach(inv => {
    (inv.payments || []).forEach(p => { if (p.date >= month) incomeMonth += +p.amount || 0; });
    openBalance += invTotals(inv).balance;
  });
  c.innerHTML = `
    <div class="grid-2" style="margin-bottom:16px">
      ${'<div class="card stat-card"><div class="stat-icon" style="background:var(--ok-soft);font-size:21px">💰</div><div class="stat-body"><div class="stat-value" style="font-size:17px">' + money(incomeMonth) + ' <span style="font-size:11px;color:var(--text-3)">' + t('rial') + '</span></div><div class="stat-label">' + t('invTotalsMonth') + '</div></div></div>'}
      ${'<div class="card stat-card"><div class="stat-icon" style="background:var(--danger-soft);font-size:21px">🧾</div><div class="stat-body"><div class="stat-value" style="font-size:17px">' + money(openBalance) + ' <span style="font-size:11px;color:var(--text-3)">' + t('rial') + '</span></div><div class="stat-label">' + t('invOpenBalance') + '</div></div></div>'}
    </div>
    <div class="toolbar">
      <div class="search">${IC.search}<input id="invSearch" placeholder="${t('searchInvoices')}" value="${esc(invFilter.q)}" /></div>
      <div class="chip-row">
        <button class="chip ${invFilter.status === 'all' ? 'active' : ''}" data-s="all">${t('all')}</button>
        <button class="chip ${invFilter.status === 'unpaid' ? 'active' : ''}" data-s="unpaid">🔴 ${t('invUnpaid')}</button>
        <button class="chip ${invFilter.status === 'partial' ? 'active' : ''}" data-s="partial">🟠 ${t('invPartial')}</button>
        <button class="chip ${invFilter.status === 'paid' ? 'active' : ''}" data-s="paid">✅ ${t('invPaidFull')}</button>
      </div>
      <button class="btn btn-primary" onclick="openInvoiceForm()">${IC.plus} ${t('newInvoice')}</button>
    </div>
    <div id="invList"></div>`;
  $('#invSearch').oninput = debounce(e => { invFilter.q = e.target.value; drawInvList(); }, 200);
  $$('#content .chip[data-s]').forEach(ch => ch.onclick = () => { invFilter.status = ch.dataset.s; renderInvoices(); });
  drawInvList();
}
function drawInvList() {
  if (!$('#invList')) return;
  const q = norm(invFilter.q);
  let list = state.invoices;
  if (invFilter.status !== 'all') {
    list = list.filter(inv => {
      const m = invStatusMeta(inv);
      return (invFilter.status === 'paid' && m.key === 'invPaidFull') ||
             (invFilter.status === 'partial' && m.key === 'invPartial') ||
             (invFilter.status === 'unpaid' && m.key === 'invUnpaid');
    });
  }
  if (q) list = list.filter(inv => hay(inv.customer, inv.note, inv.projectId ? projName(inv.projectId) : '', (inv.items || []).map(i => i.desc).join(' ')).includes(q));
  const el = $('#invList');
  if (!state.invoices.length) {
    el.innerHTML = `<div class="empty"><div class="e-icon">🧾</div><strong>${t('noInvoices')}</strong><p>${t('noInvoicesSub')}</p><button class="btn btn-primary" onclick="openInvoiceForm()">${IC.plus} ${t('newInvoice')}</button></div>`;
    return;
  }
  if (!list.length) {
    el.innerHTML = `<div class="empty"><div class="e-icon">🔍</div><strong>${t('notFound')}</strong><p>${t('notFoundSub')}</p></div>`;
    return;
  }
  paintList(el, list, inv => {
    const tt = invTotals(inv);
    const m = invStatusMeta(inv);
    return `<div class="row-item" onclick="openInvoiceForm('${inv.id}')">
      <div class="row-icon" style="background:var(--bg-soft);border:1px solid var(--border);font-size:18px">🧾</div>
      <div class="row-body">
        <strong>${esc(inv.customer || '—')}${inv.projectId ? ' · ' + esc(projName(inv.projectId)) : ''}</strong>
        <span class="sub">${t('invGrand')}: ${money(tt.grand)} ${t('rial')}${tt.balance ? ' · ' + t('invBalance') + ': ' + money(tt.balance) : ''}</span>
      </div>
      <div class="row-side">
        <span class="badge ${m.cls}">${m.icon} ${t(m.key)}</span>
        <span class="date">${fmtDate(inv.date || inv.createdAt)} · #${esc((inv.id || '').slice(0, 6).toUpperCase())}</span>
      </div>
    </div>`;
  });
}

function invItemsHTML() {
  return invDraft.items.map((it, i) => `
    <div style="display:flex;gap:7px;align-items:flex-start;margin-bottom:8px;flex-wrap:wrap">
      <input placeholder="${t('invDesc')}" value="${esc(it.desc)}" data-if="desc" data-ix="${i}"
        style="flex:2;min-width:130px;background:var(--bg-soft);border:1.5px solid var(--border);border-radius:10px;padding:9px 11px;outline:none" />
      <input type="number" min="1" placeholder="${t('invQty')}" value="${it.qty}" data-if="qty" data-ix="${i}"
        style="width:64px;background:var(--bg-soft);border:1.5px solid var(--border);border-radius:10px;padding:9px 8px;outline:none" />
      <input type="number" min="0" placeholder="${t('invUnitPrice')}" value="${it.price}" data-if="price" data-ix="${i}"
        style="flex:1;min-width:100px;background:var(--bg-soft);border:1.5px solid var(--border);border-radius:10px;padding:9px 8px;outline:none" />
      <button class="icon-btn" style="width:36px;height:36px" onclick="invDelItem(${i})">✕</button>
      <div style="width:100%;font-size:11.5px;color:var(--text-3);direction:ltr;text-align:end">${money((+it.qty || 0) * (+it.price || 0))} ${t('rial')}</div>
    </div>`).join('');
}
function invRefreshItems() {
  const box = $('#invItemsBox');
  if (box) { box.innerHTML = invItemsHTML(); invWireItems(); invRefreshTotals(); }
}
function invWireItems() {
  $$('#invItemsBox [data-if]').forEach(inp => {
    inp.oninput = () => {
      const it = invDraft.items[+inp.dataset.ix];
      if (!it) return;
      if (inp.dataset.if === 'desc') it.desc = inp.value;
      else it[inp.dataset.if] = +inp.value || 0;
      invRefreshTotals();
    };
  });
}
function invDelItem(i) {
  if (!invDraft) return;
  const it = invDraft.items[i];
  if (it && it.partId) {
    /* a row added in THIS editing session was never taken from stock yet —
       just cancel its pending consumption. Rows that came from the saved
       invoice did consume stock, so removing them gives the parts back. */
    const pend = it.rowKey ? invDraft.consumedParts.findIndex(c => c.rowKey === it.rowKey) : -1;
    if (pend >= 0) invDraft.consumedParts.splice(pend, 1);
    else if (+it.qty > 0) invDraft.releasedParts.push({ partId: it.partId, qty: Math.round(+it.qty) });
  }
  invDraft.items.splice(i, 1);
  invRefreshItems();
}
function invAddItem(item) {
  if (!invDraft) return;
  invDraft.items.push(item || { desc: '', qty: 1, price: 0 });
  invRefreshItems();
}
function invRefreshTotals() {
  if (!invDraft) return;
  const items = invDraft.items.reduce((a, it) => a + Math.round((+it.qty || 0) * (+it.price || 0)), 0);
  const labor = Math.round(+($('#inv_labor') && $('#inv_labor').value) || 0);
  const disc = Math.round(+($('#inv_discount') && $('#inv_discount').value) || 0);
  const rate = Math.max(0, Math.min(100, Math.round(+($('#inv_taxrate') && $('#inv_taxrate').value) || 0)));
  const exempt = ($('#inv_taxexempt') && $('#inv_taxexempt').checked) || invDraft.taxExempt;
  invDraft.taxRate = rate; invDraft.taxExempt = !!exempt;
  const base = Math.max(0, items + labor - disc);
  const tax = exempt ? 0 : Math.round(base * rate / 100);
  const grand = base + tax;
  const paid = (invDraft.payments || []).reduce((a, p) => a + Math.round(+p.amount || 0), 0);
  invDraft.taxAmount = tax;
  const el = $('#invTotalsBox');
  if (el) el.innerHTML = `
    <div class="calc-result">
      <div class="r-row"><span class="r-label">${t('invSubtotal')}</span><span class="r-val" style="font-size:14px">${money(items)} ${t('rial')}</span></div>
      <div class="r-row"><span class="r-label">${t('invLabor')}</span><span class="r-val" style="font-size:14px">${money(labor)} ${t('rial')}</span></div>
      ${disc ? `<div class="r-row"><span class="r-label">${t('invDiscount')}</span><span class="r-val" style="font-size:14px">−${money(disc)} ${t('rial')}</span></div>` : ''}
      ${tax ? `<div class="r-row"><span class="r-label">${t('invTax')} (${faNum(rate)}٪)</span><span class="r-val" style="font-size:14px">${money(tax)} ${t('rial')}</span></div>` : ''}
      <div class="r-row"><span class="r-label"><b>${t('invGrand')}</b></span><span class="r-val">${money(grand)} ${t('rial')}</span></div>
      ${paid ? `<div class="r-row"><span class="r-label">${t('invPaid')}</span><span class="r-val" style="font-size:14px;color:var(--ok)">${money(paid)} ${t('rial')}</span></div>
      <div class="r-row"><span class="r-label"><b>${t('invBalance')}</b></span><span class="r-val" style="color:${grand - paid > 0 ? 'var(--danger)' : 'var(--ok)'}">${money(Math.max(0, grand - paid))} ${t('rial')}</span></div>
      ${paid > grand ? `<div class="r-row"><span class="r-label"><b>${t('invOverpayment')}</b></span><span class="r-val" style="color:var(--warn)">${money(paid - grand)} ${t('rial')}</span></div>` : ''}` : ''}
    </div>`;
}
function invPickPart() {
  invSyncDraftFromForm();
  const opts = state.parts.map(p => `
    <div class="row-item" style="margin-bottom:7px" onclick="invUsePart('${p.id}')">
      <div class="row-body"><strong style="font-size:13.5px">${esc(p.name)}</strong>
      <span class="sub">${t('partQty')}: ${faNum(p.qty)} ${esc(p.unit)} · ${money(p.price)} ${t('rial')}</span></div>
    </div>`).join('');
  openModal(`
    <div class="modal-head"><h3>📦 ${t('invAddPart')}</h3><button class="icon-btn" onclick="invBackToForm()">✕</button></div>
    <div class="modal-body">${opts || `<p style="color:var(--text-3)">${t('noParts')}</p>`}</div>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="invBackToForm()">${t('cancel')}</button></div>`);
}
function invUsePart(partId) {
  const p = state.parts.find(x => x.id === partId);
  if (!p || !invDraft) return;
  const rowKey = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  invDraft.items.push({ desc: p.name, qty: 1, price: p.price || 0, partId: p.id, rowKey });
  invDraft.consumedParts.push({ partId: p.id, rowKey });
  invBackToForm();
}
function invBackToForm() {
  if (!invDraft) { closeModal(); return; }
  openInvoiceForm(invDraft.editingId, null, true);
}
/* copy the values currently typed in the form into the draft, so they survive
   a round-trip through the part-picker / payment sub-modal */
function invSyncDraftFromForm() {
  if (!invDraft) return;
  const g = id => $('#' + id);
  if (g('inv_customer')) invDraft.customerOverride = g('inv_customer').value;
  if (g('inv_project')) invDraft.projectOverride = g('inv_project').value;
  if (g('inv_service')) invDraft.serviceOverride = g('inv_service').value;
  if (g('inv_note')) invDraft.noteOverride = g('inv_note').value;
  if (g('inv_labor')) invDraft.laborOverride = Math.max(0, Math.round(+g('inv_labor').value || 0));
  if (g('inv_discount')) invDraft.discountOverride = Math.max(0, Math.round(+g('inv_discount').value || 0));
  if (g('inv_taxrate')) invDraft.taxRate = Math.max(0, Math.min(100, Math.round(+g('inv_taxrate').value || 0)));
  if (g('inv_taxexempt')) invDraft.taxExempt = !!g('inv_taxexempt').checked;
  const dt = jdateVal('inv_date');
  if (dt) invDraft.dateOverride = dt;
}

function openInvoiceForm(id, presetProject, keepDraft) {
  const inv = id ? state.invoices.find(x => x.id === id) : null;
  if (!keepDraft) {
    invDraft = {
      editingId: id || null,
      /* Stable across retries/part-picker round trips; POST uses it to make a
         duplicate submission return the original invoice without re-consuming stock. */
      clientMutationId: inv ? '' : _lsUid(),
      items: inv ? JSON.parse(JSON.stringify(inv.items || [])) : [],
      payments: inv ? JSON.parse(JSON.stringify(inv.payments || [])) : [],
      consumedParts: [], releasedParts: []
    };
  }
  const v = inv || { customer: '', projectId: presetProject || '', serviceId: '', date: Date.now(), labor: 0, discount: 0, note: '' };
  const dateTs = invDraft.dateOverride || v.date || Date.now();
  const laborVal = invDraft.laborOverride !== undefined ? invDraft.laborOverride : (v.labor || 0);
  const discountVal = invDraft.discountOverride !== undefined ? invDraft.discountOverride : (v.discount || 0);
  const noteVal = invDraft.noteOverride !== undefined ? invDraft.noteOverride : (v.note || '');
  const serviceOverride = invDraft.serviceOverride !== undefined ? invDraft.serviceOverride : v.serviceId;
  const defTax = (state.settings && state.settings.taxRate != null) ? +state.settings.taxRate : 0;
  const taxRateVal = invDraft.taxRate != null ? invDraft.taxRate : (v.taxRate != null ? +v.taxRate : defTax);
  const taxExemptVal = invDraft.taxExempt != null ? invDraft.taxExempt : !!(v.taxExempt);
  const svcOpts = state.services.slice(0, 40).map(s => `<option value="${s.id}" ${serviceOverride === s.id ? 'selected' : ''}>${esc(svcTarget(s))} — ${fmtDate(s.date)}</option>`).join('');
  openModal(`
    <div class="modal-head"><h3>${inv ? '✏️ ' + t('editInvoice') : '🧾 ' + t('newInvoice')}</h3><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="field span2"><label>${t('invCustomer')} *</label><input id="inv_customer" value="${esc(invDraft.customerOverride !== undefined ? invDraft.customerOverride : v.customer)}" /></div>
        <div class="field"><label>${t('invDate')}</label>${jdateInput('inv_date', dateTs)}</div>
        <div class="field"><label>${t('diagSelProject')}</label><select id="inv_project">
          <option value="">—</option>
          ${state.projects.map(p => `<option value="${p.id}" ${(invDraft.projectOverride !== undefined ? invDraft.projectOverride : v.projectId) === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
        </select></div>
        <div class="field span2"><label>${t('invFromService')}</label><select id="inv_service">
          <option value="">—</option>${svcOpts}
        </select></div>
      </div>
      <div class="section-title" style="margin:8px 0 10px"><h3 style="font-size:14.5px">📋 ${t('invItems')}</h3></div>
      <p style="font-size:11.8px;color:var(--text-3);margin-bottom:9px">💡 ${t('invConsumeHint')}</p>
      <div id="invItemsBox">${invItemsHTML()}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
        <button class="btn btn-ghost btn-sm" onclick="invAddItem()">${IC.plus} ${t('invAddItem')}</button>
        <button class="btn btn-ghost btn-sm" onclick="invPickPart()">📦 ${t('invAddPart')}</button>
      </div>
      <div class="form-grid">
        <div class="field"><label>${t('invLabor')}</label><input id="inv_labor" type="number" min="0" value="${laborVal}" /></div>
        <div class="field"><label>${t('invDiscount')}</label><input id="inv_discount" type="number" min="0" value="${discountVal}" /></div>
        <div class="field"><label>${t('invTaxRate')}</label><input id="inv_taxrate" type="number" min="0" max="100" step="1" value="${faNum(taxRateVal)}" ${taxExemptVal ? 'disabled' : ''} /></div>
        <div class="field" style="align-self:end"><label style="display:flex;gap:8px;align-items:center;font-weight:500;cursor:pointer"><input type="checkbox" id="inv_taxexempt" ${taxExemptVal ? 'checked' : ''} style="width:18px;height:18px" /> ${t('invTaxExempt')}</label></div>
        <div class="field span2"><label>${t('invNote2')}</label><input id="inv_note" value="${esc(noteVal)}" /></div>
      </div>
      <div id="invTotalsBox"></div>
      ${invDraft.payments.length ? `
        <div class="section-title" style="margin:14px 0 8px"><h3 style="font-size:13.5px">💵 ${t('invPayments')}</h3></div>
        ${invDraft.payments.map((p, i) => `
          <div class="kv-cell" style="margin-bottom:6px;display:flex;align-items:center;gap:8px">
            <div style="flex:1"><div class="v" style="font-weight:600;font-size:13px">${money(p.amount)} ${t('rial')}</div>
            <div class="k">${fmtDate(p.date)}${p.note ? ' · ' + esc(p.note) : ''}</div></div>
            <button class="icon-btn" style="width:32px;height:32px" onclick="invDelPay(${i})">✕</button>
          </div>`).join('')}` : ''}
    </div>
    <div class="modal-foot">
      ${inv ? `<button class="btn btn-soft-danger" onclick="deleteInvoice('${inv.id}')">${IC.trash}</button>` : ''}
      ${inv ? `<button class="btn btn-ghost" style="color:#2AABEE" onclick="shareTelegram(buildInvoiceText(state.invoices.find(x=>x.id==='${inv.id}')))">${IC.telegram}</button>` : ''}
      ${inv ? `<button class="btn btn-ghost" onclick="printInvoice('${inv.id}')">${IC.print} ${t('invPrint')}</button>` : ''}
      <button class="btn btn-ghost" id="invPayBtn">💵 ${t('invAddPay')}</button>
      <button class="btn btn-ghost" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-primary" id="invSave">${inv ? t('save') : t('create')}</button>
    </div>`, { size: 'lg' });

  invWireItems();
  invRefreshTotals();
  $('#inv_labor').oninput = () => { invDraft.laborOverride = +$('#inv_labor').value || 0; invRefreshTotals(); };
  $('#inv_discount').oninput = () => { invDraft.discountOverride = +$('#inv_discount').value || 0; invRefreshTotals(); };
  $('#inv_taxrate').oninput = () => invRefreshTotals();
  $('#inv_taxexempt').onchange = e => {
    $('#inv_taxrate').disabled = e.target.checked;
    invRefreshTotals();
  };
  $('#inv_note').oninput = () => { invDraft.noteOverride = $('#inv_note').value; };
  $('#inv_service').onchange = () => { invDraft.serviceOverride = $('#inv_service').value; };
  // keep field values across part-picker roundtrip
  ['inv_customer', 'inv_project'].forEach(fid => {
    const el = $('#' + fid);
    el.onchange = el.oninput = () => {
      if (fid === 'inv_customer') invDraft.customerOverride = el.value;
      else invDraft.projectOverride = el.value;
    };
  });
  $('#inv_date').addEventListener('change', () => { invDraft.dateOverride = jdateVal('inv_date') || Date.now(); });

  $('#invPayBtn').onclick = () => {
    invSyncDraftFromForm();
    openModal(`
      <div class="modal-head"><h3>💵 ${t('invAddPay')}</h3><button class="icon-btn" onclick="invBackToForm()">✕</button></div>
      <div class="modal-body">
        <div class="field"><label>${t('invPayAmount')} *</label><input id="pay_amount" type="number" min="1" /></div>
        <div class="field"><label>${t('invPayNote')}</label><input id="pay_note" /></div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" onclick="invBackToForm()">${t('cancel')}</button>
        <button class="btn btn-primary" id="payOk">💵 ${t('invAddPay')}</button>
      </div>`, { size: 'sm' });
    let payConfirmedOver = false;
    $('#payOk').onclick = () => {
      const btn = $('#payOk');
      if (btn.disabled) return;
      const amount = Math.round(+$('#pay_amount').value || 0);
      if (amount <= 0) { fieldError('#pay_amount', 'invPayInvalid'); return; }
      // Overpayment guard uses the exact same VAT/discount rounding as persisted totals.
      const draftTotals = invTotals({
        items: invDraft.items,
        labor: invDraft.laborOverride !== undefined ? invDraft.laborOverride : (inv ? inv.labor : 0),
        discount: invDraft.discountOverride !== undefined ? invDraft.discountOverride : (inv ? inv.discount : 0),
        taxRate: invDraft.taxRate != null ? invDraft.taxRate : (inv ? inv.taxRate : 0),
        taxExempt: !!invDraft.taxExempt,
        payments: invDraft.payments
      });
      if (draftTotals.grand > 0 && draftTotals.paid + amount > draftTotals.grand && !payConfirmedOver) {
        payConfirmedOver = true;
        toast(t('payOverConfirm'), 'err');
        return; // second tap confirms
      }
      btn.disabled = true;
      invDraft.payments.push({ amount, note: $('#pay_note').value, date: Date.now() });
      invBackToForm();
    };
  };

  $('#invSave').onclick = async () => {
    const customer = $('#inv_customer').value.trim();
    if (!customer) { fieldError('#inv_customer', 'requiredCustomer'); return; }
    const body = {
      customer,
      clientMutationId: inv ? (inv.clientMutationId || '') : invDraft.clientMutationId,
      projectId: $('#inv_project').value,
      serviceId: $('#inv_service').value,
      date: jdateVal('inv_date') || Date.now(),
      items: invDraft.items.filter(it => it.desc || it.price).map(it => ({
        desc: String(it.desc || ''), qty: Math.max(0, Math.round(+it.qty || 0)),
        price: Math.max(0, Math.round(+it.price || 0)), partId: it.partId || undefined
      })),
      labor: Math.max(0, Math.round(+$('#inv_labor').value || 0)),
      discount: Math.max(0, Math.round(+$('#inv_discount').value || 0)),
      taxRate: Math.max(0, Math.min(100, Math.round(+$('#inv_taxrate').value || 0))),
      taxExempt: !!$('#inv_taxexempt').checked,
      note: $('#inv_note').value,
      payments: invDraft.payments
    };
    const btn = $('#invSave'); btn.disabled = true;
    try {
      let saved, response;
      if (inv) {
        response = await api('/invoices/' + inv.id, { method: 'PUT', body });
        Object.assign(inv, response.item); saved = inv;
      } else {
        response = await api('/invoices', { method: 'POST', body });
        if (!state.invoices.some(x => x.id === response.item.id)) state.invoices.unshift(response.item);
        saved = response.item;
      }
      /* Inventory effects are committed atomically by the data layer. Mirror the
         returned records into UI state; never issue a second consumption call. */
      (response.changedParts || []).forEach(changed => {
        const local = state.parts.find(x => x.id === changed.id);
        if (local) Object.assign(local, changed);
      });
      invDraft.consumedParts = [];
      invDraft.releasedParts = [];
      invDraft = null;
      closeModal(); toast(t('saved')); render();
    } catch (e) { toast(errMsg(e), 'err'); btn.disabled = false; }
  };
}
function invDelPay(i) {
  if (!invDraft) return;
  invDraft.payments.splice(i, 1);
  invBackToForm();
}
function deleteInvoice(id) {
  const inv = state.invoices.find(x => x.id === id);
  const partRows = inv ? (inv.items || []).filter(it => it && it.partId) : [];
  const partTotals = {};
  partRows.forEach(it => { partTotals[it.partId] = (partTotals[it.partId] || 0) + Math.max(0, Math.round(+it.qty || 0)); });
  const partCount = Object.values(partTotals).reduce((a, b) => a + b, 0);
  const extra = partCount > 0
    ? (LANG === 'fa' ? `\n\n⚠️ این فاکتور شامل ${faNum(partCount)} عدد قطعه از انبار می‌باشد — با حذف فاکتور، موجودی قطعات مربوطه بازگردانده می‌شود.`
                    : `\n\n⚠️ This invoice consumed ${partCount} part(s) from inventory — deleting it will return them to stock.`)
    : '';
  confirmDialog(t('confirmDeleteTitle'), t('confirmDeleteInvMsg') + extra, async () => {
    const rb = optimisticRemove(state.invoices, id);
    invDraft = null;
    if (!rb) { closeModal(); return; }
    closeModal(); render();
    try {
      const response = await api('/invoices/' + id, { method: 'DELETE' });
      (response.changedParts || []).forEach(changed => {
        const local = state.parts.find(x => x.id === changed.id);
        if (local) Object.assign(local, changed);
      });
      toast(t('deleted'));
      render();
    }
    catch (e) { rb.restore(); toast(errMsg(e), 'err'); render(); }
  });
}
function printInvoice(id) {
  const inv = state.invoices.find(x => x.id === id);
  if (!inv) return;
  const tt = invTotals(inv);
  printDoc(`
    ${printHeader(t('invoice'))}
    <table>
      <tr><th>${t('invNumber') || t('invNo')}</th><td>${esc(inv.number || inv.id.slice(0, 8).toUpperCase())}</td></tr>
      <tr><th>${t('invDate')}</th><td>${fmtDate(inv.date || inv.createdAt)}</td></tr>
      <tr><th>${t('invCustomer')}</th><td>${esc(inv.customer)}</td></tr>
      ${inv.projectId ? `<tr><th>${t('profile')}</th><td>${esc(projName(inv.projectId))}</td></tr>` : ''}
    </table>
    <table>
      <tr><th style="width:auto">${t('invDesc')}</th><th style="width:60px">${t('invQty')}</th><th style="width:120px">${t('invUnitPrice')}</th><th style="width:130px">${t('invRowTotal')}</th></tr>
      ${(inv.items || []).map(it => `<tr><td>${esc(it.desc)}</td><td>${faNum(it.qty)}</td><td>${money(it.price)}</td><td>${money((+it.qty || 0) * (+it.price || 0))}</td></tr>`).join('')}
      ${inv.labor ? `<tr><td colspan="3">${t('invLabor')}</td><td>${money(inv.labor)}</td></tr>` : ''}
      ${inv.discount ? `<tr><td colspan="3">${t('invDiscount')}</td><td>−${money(inv.discount)}</td></tr>` : ''}
      ${tt.tax ? `<tr><td colspan="3">${t('invTax')}${tt.taxRate ? ' (' + faNum(tt.taxRate) + '٪)' : ''}</td><td>${money(tt.tax)}</td></tr>` : ''}
      <tr><td colspan="3"><b>${t('invGrand')}</b></td><td><b>${money(tt.grand)} ${t('rial')}</b></td></tr>
      ${tt.paid ? `<tr><td colspan="3">${t('invPaid')}</td><td>${money(tt.paid)}</td></tr>
      <tr><td colspan="3"><b>${t('invBalance')}</b></td><td><b>${money(tt.balance)} ${t('rial')}</b></td></tr>` : ''}
    </table>
    ${inv.note ? `<p style="font-size:12px">${esc(inv.note)}</p>` : ''}
    <div class="sig-row">
      <div class="sig">${t('signTech')}</div>
      <div class="sig">${t('signCustomer')}</div>
    </div>`);
}


/* ================= GLOBAL SEARCH ================= */
function openGlobalSearch() {
  openModal(`
    <div class="modal-head"><h3>🔎 ${t('searchEverywhere')}</h3><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="field" style="margin-bottom:10px">
        <input id="gsInput" placeholder="${t('globalSearch')}" autocomplete="off" style="font-size:16px" />
      </div>
      <div id="gsOut"><p style="font-size:12.5px;color:var(--text-3)">${t('searchEverywhere')} — ${t('srProjects')}، ${t('srServices')}، ${t('srParts')}، ${t('srNotes')}، ${t('srKb')}، ${t('srDiag')}، ${t('srInv')}، ${t('srCalc')}</p></div>
    </div>`, { size: 'lg' });
  const inp = $('#gsInput');
  inp.focus();
  inp.oninput = debounce(() => drawGlobalSearch(inp.value), 250);
}
function gsRow(icon, title, sub, onclick) {
  return `<div class="row-item" style="margin-bottom:7px" onclick="${onclick}">
    <div class="row-icon" style="background:var(--bg-soft);border:1px solid var(--border);font-size:17px;width:38px;height:38px">${icon}</div>
    <div class="row-body"><strong style="font-size:13.5px">${title}</strong><span class="sub">${sub}</span></div>
  </div>`;
}
function drawGlobalSearch(qRaw) {
  const q = norm(qRaw);
  const out = $('#gsOut');
  if (q.length < 2) { out.innerHTML = `<p style="font-size:12.5px;color:var(--text-3)">…</p>`; return; }
  const S = [];
  const grp = (label, rows) => { if (rows.length) S.push(`<div class="nav-section" style="margin:10px 2px 6px">${label} (${faNum(rows.length)})</div>` + rows.join('')); };

  grp(t('srProjects'), state.projects
    .filter(p => hay(p.name, p.customer, p.location, p.controller, p.motor).includes(q))
    .slice(0, 5).map(p => gsRow(p.elevatorType === 'hydraulic' ? '🛢️' : '⚙️', esc(p.name), esc(p.customer || p.location || ''), `closeModal();navigate('/projects/${p.id}')`)));

  grp(t('srServices'), state.services
    .filter(s => hay(svcTarget(s), s.problem, s.diagnosis, s.workDone, s.partsReplaced).includes(q))
    .slice(0, 5).map(s => gsRow('🔧', esc(svcTarget(s)), esc(s.problem || s.complaint || fmtDate(s.date)), `closeModal();openServiceView('${s.id}')`)));

  grp(t('srParts'), state.parts
    .filter(x => hay(x.name, x.category, x.location, x.note).includes(q))
    .slice(0, 5).map(x => gsRow('📦', esc(x.name), faNum(x.qty) + ' ' + esc(x.unit) + (x.qty <= x.minQty ? ' ⚠️' : ''), `closeModal();navigate('/parts');setTimeout(()=>openPartForm('${x.id}'),120)`)));

  grp(t('srInv'), state.invoices
    .filter(i => hay(i.customer, i.note, (i.items || []).map(x => x.desc).join(' ')).includes(q))
    .slice(0, 5).map(i => gsRow('🧾', esc(i.customer || '—'), money(invTotals(i).grand) + ' ' + t('rial'), `closeModal();navigate('/invoices');setTimeout(()=>openInvoiceForm('${i.id}'),120)`)));

  grp(t('srContracts'), state.contracts
    .filter(ct => hay(ct.building, ct.note).includes(q))
    .slice(0, 5).map(ct => gsRow('📄', esc(ct.building), money(ct.amount) + ' ' + t('rial'), `closeModal();navigate('/contracts');setTimeout(()=>openContractForm('${ct.id}'),120)`)));

  grp(t('srNotes'), state.notes
    .filter(n => hay(n.title, n.content, (n.tags || []).join(' ')).includes(q))
    .slice(0, 5).map(n => gsRow('📝', esc(n.title), esc((n.content || '').slice(0, 60)), `closeModal();navigate('/notes');setTimeout(()=>openNoteForm('${n.id}'),120)`)));

  grp(t('srKb'), KNOWLEDGE
    .filter(k => kbSearchText(k).includes(q))
    .slice(0, 5).map(k => gsRow(k.icon, esc(k.title[LANG] || k.title.fa), esc(k.summary[LANG] || k.summary.fa), `closeModal();openKbArticle('${k.id}')`)));

  grp(t('srDiag'), DIAG_FLOWS
    .filter(f => flowSearchText(f).includes(q))
    .slice(0, 5).map(f => gsRow(f.icon || '🔩', esc(f.symptom.fa), esc((f.first && f.first.fa) || ''), `closeModal();navigate('/diagnostics');setTimeout(()=>startDiagFlow('${f.id}'),120)`)));

  grp(t('srCalc'), CALCULATORS
    .filter(c2 => hay(c2.title.fa, c2.title.en, c2.desc.fa, c2.formula).includes(q))
    .slice(0, 5).map(c2 => gsRow('🧮', esc(c2.title.fa), esc(c2.desc.fa), `closeModal();calcFilter={cat:'all',q:'${jsAttr(qRaw)}'};navigate('/calculations')`)));
  grp(t('measures'), (state.measurements || [])
    .filter(m => { const f = MEASURE_FIELDS_BY_ID[m.typeId]; return hay(f && f.fa, f && f.en, m.point, m.component, m.note, m.value).includes(q); })
    .slice(0, 5).map(m => { const f = MEASURE_FIELDS_BY_ID[m.typeId]; return gsRow(MEAS_STATUS_META[m.status] ? MEAS_STATUS_META[m.status].icon : '📐', esc((f && (f[LANG] || f.fa)) || m.typeId), esc((m.point || '') + ' ' + (m.component || '') + ' · ' + fmtDate(m.ts)), `closeModal();navigate('/measurements')`); }));

  out.innerHTML = S.length ? S.join('') : `<div class="empty"><div class="e-icon">🔍</div><strong>${t('noResults')}</strong></div>`;
}



/* ================= CONTRACTS (monthly maintenance) ================= */
/* contract: { id, building, amount, startTs, months, projectId, note, paid: { 'jy-jm': true } } */
function ctStartTs(ct) { return +ct.startTs || +ct.createdAt || Date.now(); }
function ctMonthList(ct) {
  // list of {jy,jm,key,ts} for the contract duration
  const out = [];
  let { jy, jm } = tsToJalali(ctStartTs(ct));
  const months = Math.max(1, Math.min(120, Math.round(+ct.months || 12)));
  for (let i = 0; i < months; i++) {
    out.push({ jy, jm, key: jy + '-' + jm, ts: jalDayStart(jy, jm, 1) });
    jm++; if (jm > 12) { jm = 1; jy++; }
  }
  return out;
}
function ctStats(ct) {
  const now = Date.now();
  const list = ctMonthList(ct);
  const started = list.filter(m => m.ts <= now);
  const paidCount = list.filter(m => ct.paid && ct.paid[m.key]).length;
  const overdue = started.filter(m => !(ct.paid && ct.paid[m.key])).length;
  /* a contract runs until the END of its last month, not its first day */
  const last = list[list.length - 1];
  const endTs = last ? jalMonthRange(last.jy, last.jm).to : 0;
  const active = !!list.length && endTs > now && list[0].ts <= now;
  const expired = !!list.length && endTs <= now;
  return { list, paidCount, overdue, active, expired, total: list.length, endTs };
}
function renderContracts() {
  const c = $('#content');
  const nowJ = tsToJalali(Date.now());
  const curKey = nowJ.jy + '-' + nowJ.jm;
  let expect = 0, collected = 0;
  state.contracts.forEach(ct => {
    const st = ctStats(ct);
    const cur = st.list.find(m => m.key === curKey);
    if (cur) {
      expect += +ct.amount || 0;
      if (ct.paid && ct.paid[curKey]) collected += +ct.amount || 0;
    }
  });
  c.innerHTML = `
    <div class="grid-2" style="margin-bottom:16px">
      <div class="card stat-card"><div class="stat-icon" style="background:var(--accent-soft);font-size:21px">📄</div>
        <div class="stat-body"><div class="stat-value" style="font-size:17px">${money(expect)} <span style="font-size:11px;color:var(--text-3)">${t('rial')}</span></div>
        <div class="stat-label">${t('ctExpectMonth')} (${jalMonth(nowJ.jm)})</div></div></div>
      <div class="card stat-card"><div class="stat-icon" style="background:var(--ok-soft);font-size:21px">💰</div>
        <div class="stat-body"><div class="stat-value" style="font-size:17px">${money(collected)} <span style="font-size:11px;color:var(--text-3)">${t('rial')}</span></div>
        <div class="stat-label">${t('ctCollected')}</div></div></div>
    </div>
    <div class="toolbar">
      <div style="flex:1"></div>
      <button class="btn btn-primary" onclick="openContractForm()">${IC.plus} ${t('newContract')}</button>
    </div>
    ${state.contracts.length ? state.contracts.map(ct => {
      const st = ctStats(ct);
      return `<div class="row-item" onclick="openContractForm('${ct.id}')">
        <div class="row-icon" style="background:${st.overdue ? 'var(--danger-soft)' : 'var(--ok-soft)'};font-size:18px">${st.overdue ? '🔴' : '📄'}</div>
        <div class="row-body">
          <strong>${esc(ct.building)}</strong>
          <span class="sub">${money(ct.amount)} ${t('rial')} / ${jalMonth(tsToJalali(ctStartTs(ct)).jm)} ${faNum(tsToJalali(ctStartTs(ct)).jy)} · ${faNum(st.total)} ${LANG === 'fa' ? 'ماه' : 'months'}</span>
        </div>
        <div class="row-side">
          ${st.overdue ? `<span class="badge b-red">${faNum(st.overdue)} ${t('ctOverdueMonths')}</span>` : `<span class="badge b-green">${st.expired ? t('ctExpired') : t('ctActive')}</span>`}
          <span class="date">${faNum(st.paidCount)}/${faNum(st.total)} ${t('ctPaid')}</span>
        </div>
      </div>`;
    }).join('') : `<div class="empty"><div class="e-icon">📄</div><strong>${t('noContracts')}</strong><p>${t('noContractsSub')}</p><button class="btn btn-primary" onclick="openContractForm()">${IC.plus} ${t('newContract')}</button></div>`}`;
}
function openContractForm(id) {
  const ct = id ? state.contracts.find(x => x.id === id) : null;
  const v = ct ? Object.assign({}, ct, { startTs: ctStartTs(ct) })
              : { building: '', amount: 0, startTs: Date.now(), months: 12, projectId: '', note: '', paid: {} };
  openModal(`
    <div class="modal-head"><h3>${ct ? '✏️ ' + t('editContract') : '📄 ' + t('newContract')}</h3><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="field span2"><label>${t('ctBuilding')} *</label><input id="ct_building" value="${esc(v.building)}" /></div>
        <div class="field"><label>${t('ctAmount')}</label><input id="ct_amount" type="number" min="0" value="${v.amount || 0}" /></div>
        <div class="field"><label>${t('ctMonths')}</label><input id="ct_months" type="number" min="1" max="36" value="${v.months || 12}" /></div>
        <div class="field"><label>${t('ctStart')}</label>${jdateInput('ct_start', v.startTs)}</div>
        <div class="field"><label>${t('ctLinkProject')}</label><select id="ct_project">
          <option value="">—</option>
          ${state.projects.map(p => `<option value="${p.id}" ${v.projectId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
        </select></div>
        <div class="field span2"><label>${t('ctNote')}</label><input id="ct_note" value="${esc(v.note || '')}" /></div>
      </div>
      ${ct ? `
      <div class="section-title" style="margin:10px 0 8px"><h3 style="font-size:14px">📅 ${t('ctPayTable')}</h3></div>
      <p style="font-size:11.8px;color:var(--text-3);margin-bottom:9px">💡 ${t('ctTapMonth')}</p>
      <div id="ctMonths" style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px">${ctMonthsHTML(ct)}</div>` : ''}
    </div>
    <div class="modal-foot">
      ${ct ? `<button class="btn btn-soft-danger" onclick="deleteContract('${ct.id}')">${IC.trash}</button>` : ''}
      <button class="btn btn-ghost" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-primary" id="ctSave">${ct ? t('save') : t('create')}</button>
    </div>`, { size: 'lg' });
  $('#ctSave').onclick = guard('#ctSave', async () => {
    const building = $('#ct_building').value.trim();
    if (!building) { fieldError('#ct_building', 'requiredTitle'); return; }
    const body = {
      building, amount: +$('#ct_amount').value || 0,
      months: Math.max(1, Math.min(36, +$('#ct_months').value || 12)),
      startTs: jdateVal('ct_start') || Date.now(),
      projectId: $('#ct_project').value, note: $('#ct_note').value,
      paid: ct ? ct.paid || {} : {}
    };
    try {
      if (ct) { const d = await api('/contracts/' + ct.id, { method: 'PUT', body }); Object.assign(ct, d.item); }
      else { const d = await api('/contracts', { method: 'POST', body }); state.contracts.unshift(d.item); }
      closeModal(); toast(t('saved')); render();
    } catch (e) { toast(errMsg(e), 'err'); }
  });
}
function ctMonthsHTML(ct) {
  const now = Date.now();
  return ctMonthList(ct).map(m => {
    const paid = ct.paid && ct.paid[m.key];
    const due = m.ts <= now && !paid;
    return `<button onclick="ctTogglePaid('${ct.id}','${m.key}')" style="border:1.5px solid ${paid ? 'var(--ok)' : due ? 'var(--danger)' : 'var(--border)'};
      background:${paid ? 'var(--ok-soft)' : due ? 'var(--danger-soft)' : 'var(--bg-soft)'};
      border-radius:11px;padding:9px 4px;font-family:inherit;font-size:12px;cursor:pointer;color:var(--text);line-height:1.5">
      ${paid ? '✅' : due ? '🔴' : '⬜'}<br><b>${jalMonth(m.jm)}</b><br><span style="font-size:10px;color:var(--text-3)">${faNum(m.jy)}</span>
    </button>`;
  }).join('');
}
async function ctTogglePaid(ctId, key) {
  const ct = state.contracts.find(x => x.id === ctId);
  if (!ct) return;
  if (!ct.paid) ct.paid = {};
  if (ct.paid[key]) delete ct.paid[key];
  else ct.paid[key] = true;
  const box = $('#ctMonths');
  if (box) box.innerHTML = ctMonthsHTML(ct);
  try { await api('/contracts/' + ct.id, { method: 'PUT', body: { paid: ct.paid } }); }
  catch (e) { toast(errMsg(e), 'err'); }
}
function deleteContract(id) {
  confirmDialog(t('confirmDeleteTitle'), t('confirmDeleteCtMsg'), async () => {
    const rb = optimisticRemove(state.contracts, id);
    if (!rb) { closeModal(); return; }
    closeModal(); render();
    try { await api('/contracts/' + id, { method: 'DELETE' }); toast(t('deleted')); }
    catch (e) { rb.restore(); toast(errMsg(e), 'err'); render(); }
  });
}

