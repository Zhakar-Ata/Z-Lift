/* ================= SERVICES (independent module) ================= */
/* v24: the Services page is now a hub with two tabs —
   'list' (service reports) and 'calendar' (service calendar + reminders).
   The calendar that used to live at its own nav entry is integrated here. */
var svcFilter = { q: '', type: 'all', projectId: '' };
var svcTab = 'list'; // 'list' | 'calendar'
function viewProjectServices(projectId) {
  svcFilter = { q: '', type: 'all', projectId };
  svcTab = 'list';
  navigate('/services');
}
function switchSvcTab(tab) {
  svcTab = tab;
  // only re-render the panel + tabs, keeping the KPI strip intact (no flicker)
  const seg = $('#svcTabs');
  if (seg) {
    [...seg.querySelectorAll('.seg-btn')].forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    drawSvcPanel();
  } else {
    renderServices();
  }
}
function svcKpiHTML(icon, bg, val, label, onclick) {
  return `<div class="card stat-card svc-kpi" onclick="${onclick}">
    <div class="stat-icon" style="background:${bg};font-size:20px">${icon}</div>
    <div class="stat-body"><div class="stat-value">${val}</div><div class="stat-label">${label}</div></div></div>`;
}
function renderServices() {
  const c = $('#content');
  const filteredProj = svcFilter.projectId ? state.projects.find(p => p.id === svcFilter.projectId) : null;

  /* ---- KPI strip (today / this month / follow-ups / overdue reminders) ---- */
  const todayJ = tsToJalali(Date.now());
  const { from: tStart, to: tEnd } = jalDayRange(todayJ.jy, todayJ.jm, todayJ.jd);
  const todayCount = state.services.filter(s => s.date >= tStart && s.date < tEnd).length;
  const monthCount = state.services.filter(s => { const j = tsToJalali(s.date); return j.jy === todayJ.jy && j.jm === todayJ.jm; }).length;
  const followups = state.services.filter(s => s.finalStatus === 'followup').length;
  const rems = buildReminders();
  const overdueRems = rems.filter(r => r.overdue).length;

  c.innerHTML = `
    ${filteredProj ? `
    <div class="note-block" style="margin-bottom:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span>🔎 ${t('svcOfProject')} <b>${esc(filteredProj.name)}</b></span>
      <button class="btn btn-ghost btn-sm" onclick="svcFilter.projectId='';renderServices()">✕ ${t('clearFilter')}</button>
    </div>` : ''}
    <div class="grid-4" style="margin-bottom:16px">
      ${svcKpiHTML('📅', 'var(--accent-soft)', faNum(todayCount), t('svcKpiToday'), "switchSvcTab('list')")}
      ${svcKpiHTML('🗓️', 'var(--teal-soft)', faNum(monthCount), t('svcKpiMonth'), "switchSvcTab('list')")}
      ${svcKpiHTML('📌', 'var(--warn-soft)', faNum(followups), t('svcKpiFollowup'), "svcFilter.type='all';switchSvcTab('list')")}
      ${svcKpiHTML(overdueRems ? '🔴' : '🔔', overdueRems ? 'var(--danger-soft)' : 'var(--ok-soft)', faNum(overdueRems), t('svcKpiOverdue'), "switchSvcTab('calendar')")}
    </div>
    <div id="svcTabs" class="seg" role="tablist" style="margin-bottom:16px">
      <button class="seg-btn ${svcTab === 'list' ? 'active' : ''}" data-tab="list" role="tab" aria-selected="${svcTab === 'list'}">📋 ${t('svcTabReports')}</button>
      <button class="seg-btn ${svcTab === 'calendar' ? 'active' : ''}" data-tab="calendar" role="tab" aria-selected="${svcTab === 'calendar'}">📅 ${t('svcTabCalendar')}</button>
    </div>
    <div id="svcPanel"></div>`;
  $$('#svcTabs .seg-btn').forEach(b => b.onclick = () => switchSvcTab(b.dataset.tab));
  drawSvcPanel();
}
/* renders the active tab (reports list or calendar) into #svcPanel */
function drawSvcPanel() {
  const panel = $('#svcPanel');
  if (!panel) return;
  if (svcTab === 'calendar') {
    if (!calState.jy) { const j = tsToJalali(Date.now()); calState = { jy: j.jy, jm: j.jm }; }
    calSelDay = 0;
    panel.innerHTML = `
      <div class="toolbar" style="margin-bottom:14px">
        <button class="btn btn-primary" onclick="openReminderForm()">${IC.plus} ${t('newReminder')}</button>
        <button class="btn btn-ghost" onclick="openServiceForm()">${IC.plus} ${t('newServiceRec')}</button>
        <div style="flex:1"></div>
        <button class="btn btn-ghost btn-sm" onclick="calToday()">${t('today')}</button>
      </div>
      ${calendarSectionHTML()}`;
    drawCalendar();
    drawReminderList(buildReminders());
    return;
  }
  /* reports list tab */
  panel.innerHTML = `
    <div class="toolbar">
      <div class="search">${IC.search}<input id="svcSearch" placeholder="${t('searchServices')}" value="${esc(svcFilter.q)}" /></div>
      <div class="chip-row">
        <button class="chip ${svcFilter.type === 'all' ? 'active' : ''}" data-t="all">${t('all')}</button>
        ${Object.keys(SVC_META).map(k => `<button class="chip ${svcFilter.type === k ? 'active' : ''}" data-t="${k}">${SVC_META[k].icon} ${t(SVC_META[k].key)}</button>`).join('')}
      </div>
      <button class="btn btn-ghost" onclick="exportServicesCsv()">📊 ${t('exportCsv')}</button>
      <button class="btn btn-primary" onclick="openServiceForm()">${IC.plus} ${t('newServiceRec')}</button>
    </div>
    <div id="svcList"></div>`;
  $('#svcSearch').oninput = debounce(e => { svcFilter.q = e.target.value; drawSvcList(); }, 200);
  $$('#svcPanel .chip[data-t]').forEach(ch => ch.onclick = () => { svcFilter.type = ch.dataset.t; drawSvcPanel(); });
  drawSvcList();
}
function drawSvcList() {
  if (!$('#svcList')) return;
  const q = norm(svcFilter.q);
  let list = state.services;
  if (svcFilter.projectId) list = list.filter(s => s.projectId === svcFilter.projectId);
  if (svcFilter.type !== 'all') list = list.filter(s => s.serviceType === svcFilter.type);
  if (q) list = list.filter(s => hay(svcTarget(s), s.customer, s.elevatorInfo, s.technician, s.problem, s.complaint, s.diagnosis, s.workDone, s.partsReplaced, (s.partsUsed||[]).map(p=>p.name).join(' '), s.recommendations).includes(q));
  const el = $('#svcList');
  if (!state.services.length) {
    el.innerHTML = `<div class="empty"><div class="e-icon">🔧</div><strong>${t('noServices')}</strong><p>${t('noServicesSub')}</p><button class="btn btn-primary" onclick="openServiceForm()">${IC.plus} ${t('newServiceRec')}</button></div>`;
    return;
  }
  if (!list.length) {
    el.innerHTML = `<div class="empty"><div class="e-icon">🔍</div><strong>${t('notFound')}</strong><p>${t('notFoundSub')}</p></div>`;
    return;
  }
  paintList(el, list, serviceRow);
}
function exportServicesCsv() {
  const head = [t('svcDate'), t('svcCustomer'), t('svcProject'), t('svcTechnician'), t('svcType'), t('svcProblem'), t('svcDiagnosis'), t('svcWork'), t('svcParts'), t('svcFinal')];
  const rows = state.services.map(s => [
    new Date(s.date).toISOString().slice(0, 10),
    s.customer || '', s.projectId ? projName(s.projectId) : '', s.technician,
    t(svcMeta(s.serviceType).key), s.problem, s.diagnosis, s.workDone, svcPartsTextOf(s),
    t(finalMeta(s.finalStatus).key)
  ]);
  downloadCsv('zlift-services-' + new Date().toISOString().slice(0, 10) + '.csv', head, rows);
  toast(t('saved'));
}
function serviceRow(s) {
  const m = svcMeta(s.serviceType);
  return `<div class="row-item" onclick="openServiceView('${s.id}')">
    <div class="row-icon" style="background:var(--bg-soft);border:1px solid var(--border);font-size:19px">${m.icon}</div>
    <div class="row-body">
      <strong>${esc(svcTarget(s))} ${s.projectId ? '' : '<span class="badge b-gray badge-sm">🔧</span>'}</strong>
      <span class="sub">${esc(s.problem || s.complaint || '—')}</span>
    </div>
    <div class="row-side">
      <span class="badge ${finalMeta(s.finalStatus).cls}">${t(finalMeta(s.finalStatus).key)}</span>
      <span class="date">${fmtDate(s.date)} · ${esc(s.technician)}</span>
    </div>
  </div>`;
}
function openServiceView(id) {
  const s = state.services.find(x => x.id === id);
  if (!s) return;
  const m = svcMeta(s.serviceType);
  const rows = [
    [t('reportNo'), s.reportNo || s.id.slice(0, 8).toUpperCase()],
    [t('svcCustomer'), s.customer || (s.projectId ? (state.projects.find(p => p.id === s.projectId) || {}).customer : '')],
    [t('svcElevator'), s.elevatorInfo],
    [t('svcLinkProject'), s.projectId ? projName(s.projectId) : ''],
    [t('svcDate'), fmtDate(s.date)],
    [t('svcTechnician'), s.technician],
    [t('svcType'), t(m.key)],
    [t('svcComplaint'), s.complaint],
    [t('svcProblem'), s.problem],
    [t('svcDiagnosis'), s.diagnosis],
    [t('svcMeasurements'), s.measurements],
    [t('svcWork'), s.workDone],
    [t('svcParts'), svcPartsTextOf(s)],
    [t('svcRecommend'), s.recommendations],
    [t('svcFollowUp'), s.followUpDate ? fmtDate(s.followUpDate) : '']
  ].filter(x => x[1]);
  openModal(`
    <div class="modal-head"><h3>${m.icon} ${t(m.key)} <span class="badge ${finalMeta(s.finalStatus).cls}" style="margin-inline-start:6px">${t(finalMeta(s.finalStatus).key)}</span></h3>
    <button class="icon-btn" onclick="closeModal()">✕</button></div>
    <div class="modal-body"><div class="kv-grid" style="grid-template-columns:1fr">
      ${rows.map(([k, v]) => `<div class="kv-cell"><div class="k">${esc(k)}</div><div class="v" style="font-weight:500;white-space:pre-wrap">${esc(v)}</div></div>`).join('')}
    </div></div>
    <div class="modal-foot">
      <button class="btn btn-soft-danger" onclick="deleteService('${s.id}')">${IC.trash} ${t('delete')}</button>
      <button class="btn btn-ghost" onclick="duplicateService('${s.id}')">📋 ${t('dupService')}</button>
      <button class="btn btn-ghost" style="color:#2AABEE" onclick="shareTelegram(buildServiceText(state.services.find(x=>x.id==='${s.id}')))">${IC.telegram}</button>
      <button class="btn btn-ghost" onclick="shareText(buildServiceText(state.services.find(x=>x.id==='${s.id}')))">📤</button>
      <button class="btn btn-ghost" onclick="printServiceReport('${s.id}')">${IC.print} ${t('printReport')}</button>
      <button class="btn btn-ghost" onclick="openServiceForm('${s.id}')">${IC.edit} ${t('edit')}</button>
      <button class="btn btn-primary" onclick="closeModal()">${t('close')}</button>
    </div>`);
}
/* ================= DIGITAL SIGNATURE ================= */
function _sigInk() { return document.documentElement.getAttribute('data-theme') === 'dark' ? '#e5e7eb' : '#0b1220'; }
function sigPadMarkup(prefix, label, existing) {
  const prev = existing ? `<img class="sig-preview" src="${existing}" alt="${esc(label || '')}" style="max-height:64px;margin:6px 0 0;border:1px solid var(--border);border-radius:8px" />` : '';
  return `
    <div class="field span2" style="margin-bottom:10px">
      <label>🖊️ ${esc(label)}</label>
      <div class="sigpad">
        <canvas id="${prefix}_cv" width="640" height="180" style="display:block;width:100%;height:120px;background:var(--bg-soft);border:1.5px solid var(--border);border-radius:10px;touch-action:none;cursor:crosshair"></canvas>
        ${prev}
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:6px">
          <span style="font-size:11.5px;color:var(--text-3)">${t('signHint')}</span>
          <button type="button" class="btn btn-ghost btn-sm" onclick="clearSignature('${prefix}')">✕ ${t('signClear')}</button>
        </div>
      </div>
    </div>`;
}
function wireSignaturePad(prefix, existing) {
  const cv = document.getElementById(prefix + '_cv');
  if (!cv) return null;
  /* feature-detect 2D canvas without invoking getContext (which logs a
     "not implemented" error in headless/jsdom environments) */
  if (typeof CanvasRenderingContext2D === 'undefined') return null;
  const ctx = cv.getContext && cv.getContext('2d');
  if (!ctx) return null;                       // canvas unsupported → signature feature disabled
  cv.__hasData = !!existing;
  cv.__drawn = false;
  let drawing = false, last = null;
  const pos = e => {
    const r = cv.getBoundingClientRect();
    const px = (e.touches && e.touches.length) ? e.touches[0] : e;
    return { x: (px.clientX - r.left) * (cv.width / Math.max(1, r.width)),
             y: (px.clientY - r.top) * (cv.height / Math.max(1, r.height)) };
  };
  const seg = p => {
    ctx.strokeStyle = _sigInk(); ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last = p;
  };
  const down = e => {
    drawing = true; last = pos(e); cv.__drawn = true; cv.__hasData = false;
    if (cv.setPointerCapture && e.pointerId != null) { try { cv.setPointerCapture(e.pointerId); } catch (e2) {} }
    e.preventDefault();
  };
  const move = e => { if (drawing) seg(pos(e)); };
  const up = () => { drawing = false; last = null; };
  cv.addEventListener('pointerdown', down);
  cv.addEventListener('pointermove', move);
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  if (existing) {
    const im = new Image();
    im.onload = () => { try { ctx.drawImage(im, 0, 0, cv.width, cv.height); } catch (e) {} };
    im.src = existing;
  }
  return cv;
}
function clearSignature(prefix) {
  const cv = document.getElementById(prefix + '_cv');
  if (!cv) return;
  if (typeof CanvasRenderingContext2D !== 'undefined') {
    const ctx = cv.getContext && cv.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, cv.width, cv.height);
  }
  cv.__drawn = false; cv.__hasData = false;
}
function readSignature(prefix) {
  const cv = document.getElementById(prefix + '_cv');
  if (!cv || !(cv.__drawn || cv.__hasData)) return '';
  try { return cv.toDataURL('image/png'); } catch (e) { return ''; }
}

/* ---- service → stock linkage ----
   While a service form is open, svcPartsDraft holds the parts being recorded:
     { partId?, name, qty }  — partId present = deduct from stock on save.
   On save we only ever consume NEW stock (edits compare against the saved
   record), and a failed consumption never blocks saving the report. */
var svcPartsDraft = [];
var svcPartsOrig = [];        // parts as they were when editing (for diff)
var svcPartsEditingId = null;
function svcPartStock(partId) {
  const p = (state.parts || []).find(x => x.id === partId);
  return p ? +p.qty || 0 : 0;
}
function svcPartsHTML() {
  if (!svcPartsDraft.length) return `<p class="hint" style="margin:4px 0 2px">${t('svcNoParts')}</p>`;
  return svcPartsDraft.map((p, i) => {
    const stock = p.partId ? svcPartStock(p.partId) : null;
    const low = p.partId && (+p.qty || 0) > stock;
    const tag = p.partId
      ? `<span class="tag ${low ? 'low' : ''}">${t('svcStockHint')}: ${faNum(stock)} ${low ? '⚠️' : ''}</span>`
      : `<span class="tag free">${t('svcCustomPart')}</span>`;
    return `<div class="spart">
      <div class="grow"><strong>${esc(p.name)}</strong><span class="meta">${tag}</span></div>
      <input class="qty" type="number" min="1" value="${faNum(p.qty)}" data-spi="${i}" aria-label="${esc(t('svcPartQty'))}" />
      <button type="button" class="icon-btn" style="width:32px;height:32px" data-spdel="${i}" title="${esc(t('svcRemovePart'))}">✕</button>
    </div>`;
  }).join('');
}
function svcRefreshParts() {
  const box = $('#svcPartsBox');
  if (box) box.innerHTML = svcPartsHTML();
}
function svcBindPartsBox() {
  const box = $('#svcPartsBox');
  if (!box) return;
  box.addEventListener('input', e => {
    const i = e.target.getAttribute && e.target.getAttribute('data-spi');
    if (i != null) { const q = Math.max(1, Math.round(+e.target.value || 1)); svcPartsDraft[+i].qty = q; svcRefreshParts(); }
  });
  box.addEventListener('click', e => {
    const d = e.target.getAttribute && e.target.getAttribute('data-spdel');
    if (d != null) { svcPartsDraft.splice(+d, 1); svcRefreshParts(); }
  });
  const search = $('#svcPickSearch');
  if (search) search.addEventListener('input', () => svcTogglePicker(true));
}
/* Inline stock picker — rendered inside the service form so picking a part
   never closes the form and loses what the technician typed. */
function svcTogglePicker(show) {
  const panel = $('#svcPickPanel');
  if (!panel) return;
  const on = show == null ? panel.classList.contains('hidden') : !!show;
  panel.classList.toggle('hidden', !on);
  if (on) {
    const q = ($('#svcPickSearch') || {}).value || '';
    const nq = norm(q);
    const list = (state.parts || []).slice().sort((a, b) => a.name.localeCompare(b.name, 'fa'))
      .filter(p => !nq || norm(p.name, p.code, p.category).includes(nq));
    const box = $('#svcPickList');
    if (box) box.innerHTML = list.length ? list.map(p => {
      const low = +p.qty <= +p.minQty;
      return `<div class="row-item" style="margin-bottom:6px;${low ? 'border-color:var(--danger-soft)' : ''}">
        <div class="row-body" onclick="svcAddStockPart('${p.id}')"><strong style="font-size:13.5px">${esc(p.name)}</strong>
        <span class="sub">${t('svcStockHint')}: <b style="color:${low ? 'var(--danger)' : 'inherit'}">${faNum(p.qty)}</b> ${esc(p.unit)}${p.code ? ' · ' + esc(p.code) : ''}</span></div>
        <button type="button" class="btn btn-ghost btn-sm" onclick="svcAddStockPart('${p.id}')">${IC.plus}</button>
      </div>`;
    }).join('') : `<p style="color:var(--text-3);font-size:12.5px">${t('noResults')}</p>`;
  }
}
function svcAddStockPart(partId) {
  const p = (state.parts || []).find(x => x.id === partId);
  if (!p) return;
  const ex = svcPartsDraft.find(x => x.partId === partId);
  if (ex) ex.qty = Math.max(1, (+ex.qty || 0) + 1);
  else svcPartsDraft.push({ partId, name: p.name, qty: 1 });
  svcRefreshParts();
  if (+p.qty <= (+p.minQty)) toast(t('stockAlert'), 'err');
}
/* Inline free-text part row — no nested modal, so it never wipes the form. */
function svcCustomAdd() {
  const row = $('#svcCustomRow');
  if (row) { row.classList.remove('hidden'); const i = $('#svcCustomName'); if (i) { i.value = ''; i.focus(); } return; }
}
function svcCustomCommit() {
  const nm = ($('#svcCustomName') || {}).value || '';
  if (!nm.trim()) { fieldError('#svcCustomName', 'requiredTitle'); return; }
  svcPartsDraft.push({ name: nm.trim(), qty: Math.max(1, Math.round(+$('#svcCustomQty').value || 1)) });
  $('#svcCustomName').value = '';
  $('#svcCustomRow').classList.add('hidden');
  svcRefreshParts();
}
/* consume the newly-added stock parts for a saved/created service.
   Returns { consumed:[], released:[] } for the caller to update local state. */
async function svcApplyStock(serviceId, projectId) {
  const consumed = [], released = [];
  const origByPart = {};
  (svcPartsOrig || []).forEach(p => { if (p.partId) origByPart[p.partId] = (origByPart[p.partId] || 0) + (+p.qty || 0); });
  const newByPart = {};
  svcPartsDraft.forEach(p => { if (p.partId) newByPart[p.partId] = (newByPart[p.partId] || 0) + (+p.qty || 0); });
  const note = t('svcConsumedNote') + (svcPartsEditingId || serviceId || '').slice(0, 6).toUpperCase();
  for (const partId of Object.keys(newByPart)) {
    const delta = newByPart[partId] - (origByPart[partId] || 0);
    if (delta > 0) {
      try {
        const d = await api('/parts-consume', { method: 'POST', body: { partId, qty: delta, projectId: projectId || '', serviceId, note } });
        consumed.push(d.part);
        warnStockShort(d, d.part && d.part.name);
      } catch (e) { /* stock can't move on — report saved anyway */ }
    } else if (delta < 0) {
      const local = (state.parts || []).find(x => x.id === partId);
      if (local) {
        try {
          const d = await api('/parts/' + partId, { method: 'PUT', body: { qty: (+local.qty || 0) - delta } });
          released.push(d.part);
        } catch (e) {}
      }
    }
  }
  return { consumed, released };
}
/* free-text summary built from structured parts (kept for legacy field/print) */
function svcPartsText() {
  return svcPartsDraft.map(p => `${p.name} ×${faNum(p.qty)}`).join('، ');
}
function openServiceForm(id, presetProject) {
  const s = id ? state.services.find(x => x.id === id) : null;
  svcPartsEditingId = s ? s.id : null;
  svcPartsOrig = s && Array.isArray(s.partsUsed) ? JSON.parse(JSON.stringify(s.partsUsed)) : [];
  svcPartsDraft = s && Array.isArray(s.partsUsed)
    ? JSON.parse(JSON.stringify(s.partsUsed))
    : (s && s.partsReplaced ? s.partsReplaced.split(/[،,]/).map(x => x.trim()).filter(Boolean).map(x => ({ name: x.replace(/\s*[×x*]\s*\d+\s*$/, ''), qty: parseInt((x.match(/(\d+)\s*$/) || [0, 1])[1], 10) || 1 })) : []);
  const v = s || { projectId: presetProject || '', customer: '', elevatorInfo: '', date: Date.now(), technician: (state.settings && state.settings.defaultTech) || state.user.name, serviceType: 'maintenance', complaint: '', problem: '', diagnosis: '', measurements: '', workDone: '', partsReplaced: '', recommendations: '', followUpDate: 0, finalStatus: 'ok' };
  const projOpts = `<option value="">— ${t('svcNoProject')} —</option>` +
    state.projects.map(p => `<option value="${p.id}" ${v.projectId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  /* jalali date inputs */
  openModal(`
    <div class="modal-head"><h3>${s ? '✏️ ' + t('editService') : '🔧 ' + t('newServiceRec')}</h3><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <div class="modal-body"><form class="form-grid">
      <!-- 1) where & who: picking a project fills in the identity, so it comes first -->
      <div class="form-sep span2">${t('secJob')}</div>
      <div class="field span2"><label>${t('svcLinkProject')}</label><select id="s_project">${projOpts}</select></div>
      <div class="field span2"><label>${t('svcCustomer')} ${v.projectId ? '' : '*'}</label><input id="s_customer" value="${esc(v.customer || '')}" placeholder="${esc(t('phCustomer'))}" /></div>
      <div class="field span2"><label>${t('svcElevator')}</label><input id="s_elevator" value="${esc(v.elevatorInfo || '')}" placeholder="${esc(t('phElevator'))}" /></div>
      <div class="field"><label>${t('svcDate')}</label>${jdateInput('s_date', v.date)}</div>
      <div class="field"><label>${t('svcType')}</label><select id="s_type">
        ${Object.keys(SVC_META).map(k => `<option value="${k}" ${v.serviceType === k ? 'selected' : ''}>${t(SVC_META[k].key)}</option>`).join('')}
      </select></div>
      <div class="field span2"><label>${t('svcTechnician')}</label><input id="s_tech" value="${esc(v.technician)}" /></div>
      <!-- 2) what was reported and what was found -->
      <div class="form-sep span2">${t('secFindings')}</div>
      <div class="field span2"><label>${t('svcComplaint')}</label><textarea id="s_complaint" style="min-height:52px">${esc(v.complaint || '')}</textarea></div>
      <div class="field span2"><label>${t('svcProblem')}</label><textarea id="s_problem" style="min-height:52px">${esc(v.problem)}</textarea></div>
      <div class="field span2"><label>${t('svcDiagnosis')}</label><textarea id="s_diag" style="min-height:52px">${esc(v.diagnosis)}</textarea></div>
      <div class="field span2"><label>${t('svcMeasurements')}</label><textarea id="s_meas" style="min-height:52px" placeholder="${esc(t('phMeasure'))}">${esc(v.measurements || '')}</textarea></div>
      <!-- 3) what was done and how it ended -->
      <div class="form-sep span2">${t('secWork')}</div>
      <div class="field span2"><label>${t('svcWork')}</label><textarea id="s_work" style="min-height:64px">${esc(v.workDone)}</textarea></div>
      <div class="field span2" data-svcparts>
        <label>${t('svcParts')}</label>
        <div id="svcPartsBox">${svcPartsHTML()}</div>
        <div class="spart-add" style="margin-top:8px">
          <button type="button" class="btn btn-ghost btn-sm" onclick="svcTogglePicker(true)">📦 ${t('svcPickStock')}</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="svcCustomAdd()">✏️ ${t('svcCustomPart')}</button>
        </div>
        <div id="svcCustomRow" class="hidden" style="display:flex;gap:8px;margin-top:9px;align-items:flex-end">
          <div class="field" style="flex:1;margin:0"><label>${t('svcPartName')}</label><input id="svcCustomName" /></div>
          <div class="field" style="width:90px;margin:0"><label>${t('svcPartQty')}</label><input id="svcCustomQty" type="number" min="1" value="1" /></div>
          <button type="button" class="btn btn-primary btn-sm" onclick="svcCustomCommit()">${IC.plus}</button>
        </div>
        <div id="svcPickPanel" class="hidden" style="margin-top:9px;border:1px solid var(--border);border-radius:12px;padding:10px;background:var(--bg-card)">
          <div class="search" style="margin-bottom:8px">${IC.search}<input id="svcPickSearch" placeholder="${esc(t('searchParts'))}" /></div>
          <div id="svcPickList" style="max-height:240px;overflow:auto"></div>
          <div style="display:flex;justify-content:flex-end;margin-top:8px">
            <button type="button" class="btn btn-ghost btn-sm" onclick="svcTogglePicker(false)">${t('close')}</button>
          </div>
        </div>
      </div>
      <div class="field span2"><label>${t('svcRecommend')}</label><textarea id="s_recommend" style="min-height:52px">${esc(v.recommendations || '')}</textarea></div>
      <div class="field"><label>${t('svcFinal')}</label><select id="s_final">
        ${Object.keys(FINAL_META).map(k => `<option value="${k}" ${v.finalStatus === k ? 'selected' : ''}>${t(FINAL_META[k].key)}</option>`).join('')}
      </select></div>
      <div class="field"><label>${t('svcFollowUp')}</label>${jdateInput('s_followup', v.followUpDate || 0, true)}</div>
      ${sigPadMarkup('sig_tech', t('signTech'), s && s.signTech)}
      ${sigPadMarkup('sig_cust', t('signCustomer'), s && s.signCustomer)}
    </form></div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-primary" id="svcSave">${s ? t('save') : t('create')}</button>
    </div>`, { size: 'lg' });
  wireSignaturePad('sig_tech', s && s.signTech);
  wireSignaturePad('sig_cust', s && s.signCustomer);
  svcBindPartsBox();
  $('#svcSave').onclick = async () => {
    const projectId = $('#s_project').value;
    const customer = $('#s_customer').value.trim();
    if (!projectId && !customer) { fieldError('#s_customer', 'requiredCustomer'); return; }
    const partsUsed = svcPartsDraft
      .map(p => ({ partId: p.partId || '', name: String(p.name || ''), qty: Math.max(1, Math.round(+p.qty || 1)) }))
      .filter(p => p.name);
    const body = {
      projectId, customer, elevatorInfo: $('#s_elevator').value,
      date: jdateVal('s_date') || Date.now(),
      technician: $('#s_tech').value, serviceType: $('#s_type').value, finalStatus: $('#s_final').value,
      complaint: $('#s_complaint').value, problem: $('#s_problem').value, diagnosis: $('#s_diag').value,
      measurements: $('#s_meas').value, workDone: $('#s_work').value,
      partsUsed, partsReplaced: svcPartsText() || (s && s.partsReplaced) || '',
      recommendations: $('#s_recommend').value, followUpDate: jdateVal('s_followup'),
      signTech: readSignature('sig_tech'), signCustomer: readSignature('sig_cust')
    };
    /* Existing rows always carry their exact authorization context through the
       application seam. New rows deliberately remain project-only so only the
       documented exact-1:1 wrapper can resolve them without an elevator UI. */
    if (s) body.elevatorId = String(s.elevatorId || '');
    const btn = $('#svcSave'); btn.disabled = true;
    try {
      let saved;
      if (s) {
        const d = await api('/services/' + s.id, { method: 'PUT', body });
        Object.assign(s, d.service);
        saved = s;
        toast(t('saved'));
      } else {
        const d = await api('/services', { method: 'POST', body });
        state.services.unshift(d.service);
        saved = d.service;
        toast(t('created'));
      }
      // apply the stock delta for this report (failures never block the save)
      const { consumed, released } = await svcApplyStock(saved.id, projectId);
      consumed.forEach(pt => { const lp = state.parts.find(x => x.id === pt.id); if (lp) Object.assign(lp, pt); });
      released.forEach(pt => { const lp = state.parts.find(x => x.id === pt.id); if (lp) Object.assign(lp, pt); });
      svcPartsDraft = []; svcPartsOrig = []; svcPartsEditingId = null;
      state.services.sort((a, b) => b.date - a.date);
      closeModal(); render();
    } catch (e) { toast(errMsg(e), 'err'); btn.disabled = false; }
  };
}
function printServiceReport(id) {
  const s = state.services.find(x => x.id === id);
  if (!s) return;
  const p = state.projects.find(x => x.id === s.projectId) || {};
  const rows = [
    [t('reportNo'), s.reportNo || s.id.slice(0, 8).toUpperCase()],
    [t('svcDate'), fmtDateTime(s.date)],
    [t('customer'), s.customer || (p.customer ? p.customer + (p.phone ? ' — ' + p.phone : '') : '—')],
    [t('svcElevator'), s.elevatorInfo || (p.name ? [p.name, p.location].filter(Boolean).join(' — ') : '—')],
    p.id ? [t('prType'), p.elevatorType === 'hydraulic' ? t('hydraulic') : t('traction')] : null,
    [t('svcTechnician'), s.technician],
    [t('svcType'), t(svcMeta(s.serviceType).key)],
    [t('svcComplaint'), s.complaint],
    [t('svcProblem'), s.problem],
    [t('svcDiagnosis'), s.diagnosis],
    [t('svcMeasurements'), s.measurements],
    [t('svcWork'), s.workDone],
    [t('svcParts'), svcPartsTextOf(s)],
    [t('svcRecommend'), s.recommendations],
    [t('svcFinal'), t(finalMeta(s.finalStatus).key)],
    [t('svcFollowUp'), s.followUpDate ? fmtDate(s.followUpDate) : '']
  ].filter(r => r && r[1]);
  const sigBox = (sig, label) => `
    <div class="sig" style="padding-top:0;border-top:0">
      <div style="min-height:76px">${sig ? `<img src="${sig}" alt="" style="max-width:100%;max-height:76px;display:block;margin:0 auto">` : `<span style="font-size:11px;color:#999">${t('noSignature')}</span>`}</div>
      <div style="border-top:1px solid #666;margin-top:6px;padding-top:6px">${esc(label)}</div>
    </div>`;
  printDoc(`
    ${printHeader(t('reportTitle'))}
    <table>${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v || '—')}</td></tr>`).join('')}</table>
    <div class="sig-row">
      ${sigBox(s.signTech, t('signTech'))}
      ${sigBox(s.signCustomer, t('signCustomer'))}
    </div>`);
}

function duplicateService(id) {
  const s = state.services.find(x => x.id === id);
  if (!s) return;
  closeModal();
  openServiceForm(null, s.projectId || '');
  setTimeout(() => {
    const set = (sel, val) => { const el = $(sel); if (el && val) el.value = val; };
    set('#s_customer', s.customer);
    set('#s_elevator', s.elevatorInfo);
    set('#s_tech', s.technician);
    const ty = $('#s_type'); if (ty) ty.value = s.serviceType;
    set('#s_complaint', s.complaint);
    set('#s_problem', s.problem);
  }, 80);
}
function deleteService(id) {
  confirmDialog(t('confirmDeleteTitle'), t('confirmDeleteSvcMsg'), async () => {
    const rb = optimisticRemove(state.services, id);
    if (!rb) { closeModal(); return; }
    const owner = rb.removed || {};
    const context = owner.projectId && owner.elevatorId
      ? '?projectId=' + encodeURIComponent(owner.projectId) + '&elevatorId=' + encodeURIComponent(owner.elevatorId)
      : '';
    closeModal(); render();
    try { await api('/services/' + id + context, { method: 'DELETE' }); toast(t('deleted')); }
    catch (e) { rb.restore(); toast(errMsg(e), 'err'); render(); }
  });
}
