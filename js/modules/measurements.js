/* ================= MEASUREMENTS (structured) ================= */
var measFilter = { projectId: '', cat: 'all', q: '' };
function measFieldLabel(f) { return (f && f[LANG]) || (f && f.fa) || '—'; }
function measStatusHtml(status) {
  const m = MEAS_STATUS_META[status] || MEAS_STATUS_META.unknown;
  return `<span class="badge ${m.cls}">${m.icon} ${t(m.key)}</span>`;
}
function measFormatVal(m) {
  if (m.kind === 'state') return esc(m.stateLabel || m.value || '—');
  if (m.kind === 'text') return esc(m.text || '—');
  const f = MEASURE_FIELDS_BY_ID[m.typeId];
  const n = parseNum(m.value);
  if (n == null) return esc(m.value || '—');
  const d = (f && typeof f.decimals === 'number') ? f.decimals : 1;
  return esc(faNum(n.toFixed(d)) + (f && f.unit ? ' ' + f.unit : ''));
}
function redFlagHtml(res) {
  if (!res || res.status === 'normal' || res.status === 'unknown') return '';
  const reason = (res.reason && (res.reason[LANG] || res.reason.fa)) || '';
  const next = (res.next && (res.next[LANG] || res.next.fa)) || '';
  const isCrit = res.status === 'critical';
  return `<div class="redflag ${isCrit ? 'crit' : 'warn'}" style="margin-top:8px;padding:9px 11px;border-radius:11px;border:1px solid ${isCrit ? 'var(--danger)' : 'var(--warn)'};background:${isCrit ? 'var(--danger-soft)' : 'var(--warn-soft)'}">
    <div style="font-weight:800;font-size:12.5px;color:${isCrit ? 'var(--danger)' : 'var(--warn)'};margin-bottom:4px">🚩 ${t('measRedFlag')} — ${measStatusHtml(res.status)}</div>
    ${reason ? `<div style="font-size:12.5px;margin-bottom:3px"><b>${t('measReason')}:</b> ${esc(reason)}</div>` : ''}
    ${next ? `<div style="font-size:12.5px"><b>${t('measNextCheck')}:</b> ${esc(next)}</div>` : ''}
    ${isCrit ? `<div style="font-size:11.5px;margin-top:5px;color:var(--danger)">⚠️ ${t('measSafetyWarn')}</div>` : ''}
  </div>`;
}
function measFilteredList() {
  let list = (state.measurements || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
  if (measFilter.projectId) list = list.filter(m => m.projectId === measFilter.projectId);
  if (measFilter.cat !== 'all') list = list.filter(m => { const f = MEASURE_FIELDS_BY_ID[m.typeId]; return f && f.cat === measFilter.cat; });
  const q = norm(measFilter.q);
  if (q) list = list.filter(m => {
    const f = MEASURE_FIELDS_BY_ID[m.typeId];
    return hay(f && f.fa, f && f.en, m.point, m.component, m.note, m.value, m.technician).includes(q);
  });
  return list;
}
function renderMeasurements() {
  const c = $('#content');
  const projectOpts = `<option value="">${t('all')}</option>` +
    state.projects.map(p => `<option value="${p.id}" ${measFilter.projectId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  const catChips = [{ id: 'all', label: t('all') }].concat(MEASURE_CATS.map(x => ({ id: x.id, label: x.icon + ' ' + t(x.key) })));
  const counts = { crit: 0, attn: 0 };
  (state.measurements || []).forEach(m => { if (m.status === 'critical') counts.crit++; else if (m.status === 'attention') counts.attn++; });
  c.innerHTML = `
    <div class="grid-3" style="margin-bottom:14px">
      <div class="stat-card"><div class="stat-icon" style="background:var(--accent-soft)">📐</div><div class="stat-body"><div class="stat-value" id="measCountVal">${faNum((state.measurements || []).length)}</div><div class="stat-label">${t('measHistory')}</div></div></div>
      <div class="stat-card"><div class="stat-icon" style="background:var(--warn-soft)">🟡</div><div class="stat-body"><div class="stat-value">${faNum(counts.attn)}</div><div class="stat-label">${t('measStatusAttention')}</div></div></div>
      <div class="stat-card"><div class="stat-icon" style="background:var(--danger-soft)">🔴</div><div class="stat-body"><div class="stat-value">${faNum(counts.crit)}</div><div class="stat-label">${t('measStatusCritical')}</div></div></div>
    </div>
    <div class="toolbar">
      <div class="search">${IC.search}<input id="measSearch" placeholder="${esc(t('measures'))}…" value="${esc(measFilter.q)}" /></div>
      <button class="btn btn-primary" onclick="openMeasForm()">${IC.plus} ${t('measAdd')}</button>
    </div>
    <div class="chip-row" style="margin:10px 0">
      ${catChips.map(x => `<button class="chip ${measFilter.cat === x.id ? 'active' : ''}" data-mcat="${x.id}">${x.label}</button>`).join('')}
    </div>
    <div class="field" style="max-width:320px;margin-bottom:12px"><select id="measProject">${projectOpts}</select></div>
    <div id="measTrend"></div>
    <div id="measList"></div>`;
  drawMeasList();
  $('#measSearch').oninput = debounce(e => { measFilter.q = e.target.value; drawMeasList(); }, 200);
  $('#measProject').onchange = e => { measFilter.projectId = e.target.value; renderMeasurements(); };
  $$('#content [data-mcat]').forEach(ch => ch.onclick = () => { measFilter.cat = ch.dataset.mcat; renderMeasurements(); });
}
/* trend sparkline per measurement type for one elevator (wear over time),
   shown when a single project is selected and a type has 2+ numeric points */
function measTrendHTML(list) {
  if (!measFilter.projectId) return '';
  const byType = {};
  list.forEach(m => {
    const f = MEASURE_FIELDS_BY_ID[m.typeId];
    if (!f || f.state || f.text) return;
    const n = parseNum(m.value);
    if (n == null) return;
    (byType[m.typeId] = byType[m.typeId] || []).push({ ts: +m.ts || 0, v: n });
  });
  const types = Object.keys(byType).filter(k => byType[k].length >= 2).slice(0, 3);
  if (!types.length) return '';
  return `<div class="card" style="margin-bottom:14px"><div class="card-title">📈 ${t('measTrend')}</div>` + types.map(tid => {
    const f = MEASURE_FIELDS_BY_ID[tid];
    const pts = byType[tid].slice().sort((a, b) => a.ts - b.ts);
    const vs = pts.map(p => p.v), mn = Math.min(...vs), mx = Math.max(...vs), span = (mx - mn) || 1;
    const W = 260, H = 56;
    const xy = pts.map((p, i) => `${Math.round(4 + i * (W - 8) / Math.max(1, pts.length - 1))},${Math.round(H - 6 - (p.v - mn) / span * (H - 12))}`).join(' ');
    const last = pts[pts.length - 1], first = pts[0];
    const arrow = last.v > first.v ? '↗️' : last.v < first.v ? '↘️' : '➡️';
    return `<div style="margin-bottom:10px"><div style="font-size:12.5px;font-weight:700;margin-bottom:4px">${esc(measFieldLabel(f))} ${arrow} <span style="color:var(--text-3);font-weight:500">${faNum(first.v)} ← ${faNum(last.v)} ${esc(f.unit || '')}</span></div>
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:56px;background:var(--bg-soft);border-radius:10px" preserveAspectRatio="none"><polyline points="${xy}" fill="none" stroke="var(--accent)" stroke-width="2" /></svg></div>`;
  }).join('') + '</div>';
}
/* list-only repaint: search typing must not rebuild the whole page
   (that destroyed the input and the mobile keyboard with it) */
function drawMeasList() {
  const box = $('#measList');
  if (!box) return;
  const list = measFilteredList();
  const cv = $('#measCountVal'); if (cv) cv.textContent = faNum(list.length);
  const tr = $('#measTrend'); if (tr) tr.innerHTML = measTrendHTML(list);
  if (!list.length) {
    box.innerHTML = `<div class="empty"><div class="e-icon">📐</div><strong>${t('measNoHistory')}</strong><button class="btn btn-primary" onclick="openMeasForm()">${IC.plus} ${t('measAdd')}</button></div>`;
  } else {
    box.innerHTML = list.map(m => {
      const f = MEASURE_FIELDS_BY_ID[m.typeId];
      const proj = m.projectId ? projName(m.projectId) : '';
      const cat = MEASURE_CATS.find(x => x.id === (f && f.cat));
      return `<div class="card kb-card" onclick="openMeasForm('${m.id}')">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
          <div style="min-width:0"><h4 style="margin:0">${cat ? cat.icon + ' ' : ''}${esc(measFieldLabel(f))}${m.point ? ' <span style="color:var(--text-3);font-weight:500">· ' + esc(m.point) + '</span>' : ''}</h4>
          <p style="margin:4px 0 0;font-size:13px"><b style="font-size:15px">${measFormatVal(m)}</b>
            ${m.component ? ' · ' + esc(m.component) : ''}${proj ? ' · 🏗️ ' + esc(proj) : ''}</p></div>
          ${measStatusHtml(m.status)}
        </div>
        ${redFlagHtml(m._res || null)}
        <div class="kb-tags" style="margin-top:8px"><span class="badge b-gray">${fmtDateTime(m.ts)}</span>${m.technician ? `<span class="badge b-gray">${esc(m.technician)}</span>` : ''}${m.location ? `<span class="badge b-gray">📍 ${esc(m.location)}</span>` : ''}${m.mode ? `<span class="badge b-gray">${esc(m.mode)}</span>` : ''}${m.photoId ? `<span class="badge b-gray">📷</span>` : ''}${m.note ? `<span class="badge b-gray">${esc(m.note)}</span>` : ''}</div>
      </div>`;
    }).join('');
  }
  enhanceClickableRows(box);
}
function measServiceOptsHTML(projectId, selectedId) {
  const pid = String(projectId || '');
  return `<option value="">—</option>` + (state.services || []).slice().sort((a, b) => (+b.date || 0) - (+a.date || 0))
    .filter(s => (selectedId && s.id === selectedId) || (pid ? s.projectId === pid : !s.projectId))
    .slice(0, 100)
    .map(s => `<option value="${s.id}" ${selectedId === s.id ? 'selected' : ''}>${esc(svcTarget(s))} — ${fmtDate(s.date)}</option>`).join('');
}
function measPhotoOptsHTML(projectId, selectedId) {
  const pid = String(projectId || '');
  return `<option value="">—</option>` + (state.photos || [])
    .filter(ph => (selectedId && ph.id === selectedId) || String(ph.projectId || '') === pid)
    .slice(0, 100)
    .map(ph => `<option value="${ph.id}" ${selectedId === ph.id ? 'selected' : ''}>${esc(ph.cat || t('photos'))}${ph.note ? ' — ' + esc(ph.note) : ''}</option>`).join('');
}
function openMeasForm(id) {
  const m = id ? (state.measurements || []).find(x => x.id === id) : null;
  const v = m || { typeId: 'v_rs', kind: 'numeric', value: '', point: '', location: '', mode: '', component: '', manufacturer: '', model: '', configuration: '', testMethod: '', testVoltage: '', expectedMin: '', expectedMax: '', reference: '', projectId: measFilter.projectId || '', serviceId: '', photoId: '', observation: '', condition: '', note: '', refType: 'manual' };
  const fieldOpts = MEASURE_CATS.map(cat => {
    const fs = MEASURE_FIELDS.filter(f => f.cat === cat.id);
    return `<optgroup label="${cat.icon} ${t(cat.key)}">` + fs.map(f => `<option value="${f.id}" ${v.typeId === f.id ? 'selected' : ''}>${esc(f[LANG] || f.fa)}${f.unit ? ' (' + f.unit + ')' : ''}</option>`).join('') + '</optgroup>';
  }).join('');
  const projectOpts = projectOptsHTML(v.projectId, true);
  const serviceOpts = measServiceOptsHTML(v.projectId, v.serviceId);
  const photoOpts = measPhotoOptsHTML(v.projectId, v.photoId);
  openModal(`
    <div class="modal-head"><h3>${m ? '✏️ ' + t('measAdd') : '📐 ' + t('measAdd')}</h3><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <div class="modal-body"><form class="form-grid" onsubmit="return false">
      <div class="span2" id="m_safety"></div>
      <div class="field span2"><label>${t('measType')}</label><select id="m_type">${fieldOpts}</select></div>
      <div class="field"><label>${t('svcDate')}</label>${jdateInput('m_date', v.ts || Date.now())}</div>
      <div class="field"><label>${t('svcProject')}</label><select id="m_project">${projectOpts}</select></div>
      <div class="field span2"><label>${t('measService')}</label><select id="m_service">${serviceOpts}</select></div>
      <div class="field"><label>${t('measLocation')}</label><input id="m_location" value="${esc(v.location || '')}" /></div>
      <div class="field"><label>${t('measPoint')}</label><input id="m_point" value="${esc(v.point || '')}" placeholder="${esc(t('measPoint'))}" /></div>
      <div class="field"><label>${t('measMode')}</label><input id="m_mode" value="${esc(v.mode || '')}" placeholder="${esc(t('measModeHint'))}" /></div>
      <div class="field"><label>${t('measUnit')}</label><input id="m_unit" value="" readonly /></div>
      <div class="field" id="m_valueWrap"><label>${t('measValue')}</label><input id="m_value" inputmode="decimal" value="${esc(v.value != null ? v.value : '')}" /><span style="font-size:11px;color:var(--text-3)">${t('measPersianHint')}</span></div>
      <div class="field"><label>${t('measComp')}</label><input id="m_comp" value="${esc(v.component || '')}" /></div>
      <div class="field span2" id="m_stateWrap" style="display:none"><label>${t('measValue')}</label><select id="m_state"></select></div>
      <div class="field"><label>${t('measManufacturer')}</label><input id="m_mfr" value="${esc(v.manufacturer || '')}" /></div>
      <div class="field"><label>${t('measModel')}</label><input id="m_model" value="${esc(v.model || '')}" /></div>
      <div class="field span2"><label>${t('measConfiguration')}</label><input id="m_config" value="${esc(v.configuration || '')}" /></div>
      <div class="field span2"><label>${t('measTestMethod')}</label><input id="m_method" value="${esc(v.testMethod || '')}" /></div>
      <div class="field"><label>${t('measTestVoltage')}</label><input id="m_testv" inputmode="decimal" value="${esc(v.testVoltage != null ? v.testVoltage : '')}" /></div>
      <div class="field"><label>${t('measCondition')}</label><input id="m_cond" value="${esc(v.condition || '')}" placeholder="${esc(t('measCondition'))}" /></div>
      <div class="field"><label>${t('measExpectedMin')}</label><input id="m_expmin" inputmode="decimal" value="${esc(v.expectedMin != null ? v.expectedMin : '')}" /></div>
      <div class="field"><label>${t('measExpectedMax')}</label><input id="m_expmax" inputmode="decimal" value="${esc(v.expectedMax != null ? v.expectedMax : '')}" /></div>
      <div class="field"><label>${t('measRefType')}</label>
        <select id="m_ref"><option value="tech" ${v.refType==='tech'?'selected':''}>${t('measRefTech')}</option>
        <option value="standard" ${v.refType==='standard'?'selected':''}>${t('measRefStandard')}</option>
        <option value="manual" ${v.refType==='manual'?'selected':''}>${t('measRefManual')}</option></select>
      </div>
      <div class="field"><label>${t('measThresholdClass')}</label><input id="m_class" value="${esc(v.thresholdClass || '')}" readonly /></div>
      <div class="field span2"><label>${t('measReferenceText')}</label><input id="m_reference" value="${esc(v.reference || '')}" placeholder="${esc(t('measReferenceHint'))}" /></div>
      <div class="field span2"><label>${t('measObservation')}</label><textarea id="m_observation" rows="2">${esc(v.observation || v.technicianNote || '')}</textarea></div>
      <div class="field span2"><label>${t('measPhoto')}</label><select id="m_photo">${photoOpts}</select></div>
      <div class="field span2"><label>${t('noteTitle')}</label><input id="m_note" value="${esc(v.note || '')}" /></div>
      <div class="span2" id="m_preview"></div>
    </form></div>
    <div class="modal-foot">
      ${m ? `<button class="btn btn-soft-danger" id="m_del">${IC.trash}</button>` : ''}
      <button class="btn btn-ghost" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-primary" id="m_save">${t('save')}</button>
    </div>`, { size: 'lg' });
  const syncField = () => {
    const f = MEASURE_FIELDS_BY_ID[$('#m_type').value];
    if (!f) return;
    const vw = $('#m_valueWrap'), sw = $('#m_stateWrap');
    if (f.state) {
      vw.style.display = 'none'; sw.style.display = '';
      const sel = $('#m_state');
      sel.innerHTML = f.state.map(s => {
        const meta = f.eval ? f.eval(s) : null;
        const lbl = s === f.state[0] ? (LANG === 'fa' ? 'بسته/درگیر/رها — نرمال' : 'closed/engaged/released') : (LANG === 'fa' ? 'باز/درگیر نیست/زده — غیرعادی' : 'open/not-engaged/pressed');
        return `<option value="${s}" ${v.value === s ? 'selected' : ''}>${esc(lbl)}</option>`;
      }).join('');
    } else if (f.text) {
      vw.style.display = ''; sw.style.display = 'none';
      $('#m_value').type = 'text';
    } else {
      vw.style.display = ''; sw.style.display = 'none';
      $('#m_value').type = 'number';
    }
    $('#m_class').value = f.thresholdClass || THRESHOLD_CLASS.UNKNOWN;
    $('#m_unit').value = f.unit || '—';
    const electrical = ['elec', 'control', 'drive'].includes(f.cat);
    $('#m_safety').innerHTML = electrical
      ? `<div class="safety-banner" style="margin:0">⚡ ${LANG === 'fa' ? 'ایزولاسیون و LOTO → کنترل وسیله آزمون روی منبع معلوم → تأیید نبود ولتاژ/انرژی → اندازه‌گیری طبق روش مصوب → کنترل مجدد وسیله آزمون → بازیابی ایمن. فازمتر یک‌پل کافی نیست؛ میگر باید از درایو/برد جدا باشد.' : 'Isolate and LOTO → prove the test instrument → verify absence of voltage/energy → measure under an approved method → re-prove the instrument → restore safely. A one-pole tester is insufficient; isolate drives/boards before insulation testing.'}</div>`
      : '';
    measPreview();
  };
  const formMeasurement = () => {
    const f = MEASURE_FIELDS_BY_ID[$('#m_type').value];
    const project = state.projects.find(p => p.id === $('#m_project').value) || {};
    let val, kind = 'numeric';
    if (f.state) { kind = 'state'; val = $('#m_state').value; }
    else if (f.text) { kind = 'text'; val = $('#m_value').value; }
    else val = parseNum($('#m_value').value);
    return {
      typeId: f.id, kind, value: val,
      expectedMin: parseNum($('#m_expmin').value), expectedMax: parseNum($('#m_expmax').value),
      manufacturer: $('#m_mfr').value.trim(), model: $('#m_model').value.trim(), configuration: $('#m_config').value.trim(),
      testMethod: $('#m_method').value.trim(), testVoltage: parseNum($('#m_testv').value), reference: $('#m_reference').value.trim(),
      context: {
        nominalVoltage: project.nominalVoltage || null, tolerancePercent: project.voltageTolerance,
        v_rated: project.speed || null
      }
    };
  };
  const measPreview = () => {
    const f = MEASURE_FIELDS_BY_ID[$('#m_type').value];
    if (!f) return;
    const tmp = formMeasurement();
    if (!f.state && !f.text && tmp.value == null) { $('#m_preview').innerHTML = ''; return; }
    const res = evalMeasurement(tmp);
    $('#m_preview').innerHTML = `<div class="kv-cell"><div class="k">${t('measStatus')}</div><div class="v">${measStatusHtml(res.status)}</div><div class="k" style="margin-top:6px">${t('measThresholdClass')}: <b>${esc(res.thresholdClass || f.thresholdClass || THRESHOLD_CLASS.UNKNOWN)}</b></div></div>` + redFlagHtml(res);
  };
  $('#m_type').onchange = syncField;
  ['m_value','m_state','m_project','m_expmin','m_expmax','m_mfr','m_model','m_config','m_method','m_testv','m_reference'].forEach(id2 => {
    const el = $('#' + id2); if (el) { el.oninput = measPreview; el.onchange = measPreview; }
  });
  syncField();
  /* linked service/photo lists follow the chosen project (the API rejects
     cross-project links, so they are not offered in the first place) */
  $('#m_project').addEventListener('change', () => {
    $('#m_service').innerHTML = measServiceOptsHTML($('#m_project').value, '');
    $('#m_photo').innerHTML = measPhotoOptsHTML($('#m_project').value, '');
  });
  if (m) $('#m_del').onclick = () => confirmDialog(t('confirmDeleteTitle'), t('confirmDeleteMsg'), async () => {
    state.measurements = state.measurements.filter(x => x.id !== m.id);
    const context = m.projectId && m.elevatorId
      ? '?projectId=' + encodeURIComponent(m.projectId) + '&elevatorId=' + encodeURIComponent(m.elevatorId)
      : '';
    closeModal(); renderMeasurements();
    try { await api('/measurements/' + m.id + context, { method: 'DELETE' }); toast(t('deleted')); } catch (e) { toast(errMsg(e), 'err'); }
  });
  $('#m_save').onclick = guard('#m_save', async () => {
    const f = MEASURE_FIELDS_BY_ID[$('#m_type').value];
    let value, kind = 'numeric';
    if (f.state) { kind = 'state'; value = $('#m_state').value; }
    else if (f.text) { kind = 'text'; value = $('#m_value').value.trim(); if (!value) { fieldError('#m_value', 'requiredTitle'); return; } }
    else {
      value = parseNum($('#m_value').value);
      if (value == null) { fieldError('#m_value', 'measInvalid'); return; }
      if (f.min != null && value < f.min) { fieldError('#m_value', 'measInvalid'); return; }
    }
    const formRec = formMeasurement();
    const rec = {
      typeId: f.id, kind, value, unit: f.unit || '',
      projectId: $('#m_project').value, serviceId: $('#m_service').value,
      location: $('#m_location').value.trim(), point: $('#m_point').value.trim(), measurementPoint: $('#m_point').value.trim(),
      mode: $('#m_mode').value.trim(), photoId: $('#m_photo').value,
      component: $('#m_comp').value.trim(), equipment: $('#m_comp').value.trim(),
      manufacturer: formRec.manufacturer, model: formRec.model, configuration: formRec.configuration,
      testMethod: formRec.testMethod, testVoltage: formRec.testVoltage,
      expectedMin: formRec.expectedMin, expectedMax: formRec.expectedMax,
      expectedRange: { min: formRec.expectedMin, max: formRec.expectedMax, unit: f.unit || '' },
      reference: formRec.reference, thresholdClass: f.thresholdClass || THRESHOLD_CLASS.UNKNOWN,
      condition: $('#m_cond').value.trim(), observation: $('#m_observation').value.trim(),
      note: $('#m_note').value.trim(), technicianNote: $('#m_observation').value.trim(),
      refType: $('#m_ref').value || 'manual', context: formRec.context,
      ts: jdateVal('m_date') || Date.now(), timestamp: jdateVal('m_date') || Date.now(),
      technician: (state.user && state.user.name) || '', status: 'unknown'
    };
    /* Preserve the loaded row's exact owner across edits. A new record remains
       project-only and therefore succeeds only through the exact-1:1 wrapper. */
    if (m) rec.elevatorId = String(m.elevatorId || '');
    const res = evalMeasurement(rec);
    rec.status = res.status;
    rec.reason = res.reason || null;
    rec.nextStep = res.next || null;
    rec._res = res;
    if (m) { Object.assign(m, rec); delete m._res; await api('/measurements/' + m.id, { method: 'PUT', body: m }); Object.assign(m, rec); }
    else { const d = await api('/measurements', { method: 'POST', body: rec }); state.measurements.unshift(d.item); }
    closeModal(); toast(t('measSaved'));
    if (res.status === 'critical') toast((res.reason && (res.reason[LANG] || res.reason.fa)) || t('measStatusCritical'), 'err');
    renderMeasurements();
  });
}
