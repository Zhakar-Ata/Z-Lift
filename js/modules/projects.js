/* ================= PROJECTS ================= */
var projFilter = { q: '', type: 'all', status: 'all', sort: 'newest' };
function renderProjects() {
  const c = $('#content');
  c.innerHTML = `
    <div class="toolbar">
      <div class="search">${IC.search}<input id="projSearch" placeholder="${t('searchProjects')}" value="${esc(projFilter.q)}" /></div>
      <div class="chip-row">
        <button class="chip ${projFilter.type === 'all' ? 'active' : ''}" data-t="all">${t('all')}</button>
        <button class="chip ${projFilter.type === 'traction' ? 'active' : ''}" data-t="traction">⚙️ ${t('traction')}</button>
        <button class="chip ${projFilter.type === 'hydraulic' ? 'active' : ''}" data-t="hydraulic">🛢️ ${t('hydraulic')}</button>
      </div>
      <select id="projStatusSel" style="background:var(--bg-card);border:1.5px solid var(--border);border-radius:12px;padding:9px 12px;color:inherit;outline:none">
        <option value="all">${t('statusFilter')}: ${t('all')}</option>
        ${Object.keys(STATUS_META).map(s2 => `<option value="${s2}" ${projFilter.status === s2 ? 'selected' : ''}>${t(STATUS_META[s2].key)}</option>`).join('')}
        <option value="archived" ${projFilter.status === 'archived' ? 'selected' : ''}>📦 ${LANG === 'fa' ? 'بایگانی' : 'Archived'}</option>
      </select>
      <select id="projSortSel" style="background:var(--bg-card);border:1.5px solid var(--border);border-radius:12px;padding:9px 12px;color:inherit;outline:none">
        <option value="newest" ${projFilter.sort === 'newest' ? 'selected' : ''}>${t('sortBy')}: ${t('sortNewest')}</option>
        <option value="name" ${projFilter.sort === 'name' ? 'selected' : ''}>${t('sortBy')}: ${t('sortName')}</option>
        <option value="progress" ${projFilter.sort === 'progress' ? 'selected' : ''}>${t('sortBy')}: ${t('sortProgress')}</option>
      </select>
      <button class="btn btn-primary" onclick="openProjectForm()">${IC.plus} ${t('newProject')}</button>
    </div>
    <div id="projList"></div>`;
  $('#projSearch').oninput = debounce(e => { projFilter.q = e.target.value; drawProjList(); }, 200);
  $$('#content .toolbar .chip[data-t]').forEach(ch => ch.onclick = () => { projFilter.type = ch.dataset.t; renderProjects(); });
  $('#projStatusSel').onchange = e => { projFilter.status = e.target.value; drawProjList(); };
  $('#projSortSel').onchange = e => { projFilter.sort = e.target.value; drawProjList(); };
  drawProjList();
}
function drawProjList() {
  if (!$('#projList')) return;
  const q = norm(projFilter.q);
  let list = state.projects;
  if (projFilter.status === 'archived') list = list.filter(p => !!p.archived);
  else list = list.filter(p => !p.archived);
  if (projFilter.type !== 'all') list = list.filter(p => p.elevatorType === projFilter.type);
  if (projFilter.status !== 'all' && projFilter.status !== 'archived') list = list.filter(p => p.status === projFilter.status);
  if (q) list = list.filter(p => hay(p.name, p.customer, p.location, p.controller, p.motor).includes(q));
  list = [...list];
  if (projFilter.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  else if (projFilter.sort === 'progress') list.sort((a, b) => b.progress - a.progress);
  const el = $('#projList');
  if (!state.projects.length) {
    el.innerHTML = `<div class="empty"><div class="e-icon">🏗️</div><strong>${t('noProjects')}</strong><p>${t('noProjectsSub')}</p><button class="btn btn-primary" onclick="openProjectForm()">${IC.plus} ${t('newProject')}</button></div>`;
    return;
  }
  if (!list.length) {
    el.innerHTML = `<div class="empty"><div class="e-icon">🔍</div><strong>${t('notFound')}</strong><p>${t('notFoundSub')}</p></div>`;
    return;
  }
  paintList(el, list, p => `
    <div class="row-item" onclick="navigate('/projects/${p.id}')">
      <div class="row-icon" style="background:${p.elevatorType === 'hydraulic' ? 'var(--teal-soft)' : 'var(--accent-soft)'};font-size:20px">${p.elevatorType === 'hydraulic' ? '🛢️' : '⚙️'}</div>
      <div class="row-body">
        <strong>${esc(p.name)}</strong>
        <span class="sub">${esc(p.customer)} · ${esc(p.location)}</span>
        <div class="mini-progress"><div class="fill" style="width:${p.progress}%"></div></div>
      </div>
      <div class="row-side">
        ${statusBadge(p.status)}
        <span class="date">${faNum(p.floors)} ${t('floorsUnit')} · ${faNum(p.capacityKg)}kg · ${faNum(p.progress)}٪</span>
      </div>
    </div>`);
}

function openProjectForm(id) {
  const p = id ? state.projects.find(x => x.id === id) : null;
  const v = p || { name: '', customer: '', phone: '', location: '', elevatorType: 'traction', capacityKg: 630, persons: 8, floors: 5, stops: 5, speed: 1, nominalVoltage: '', voltageTolerance: '', controller: '', motor: '', drive: '', doorOperator: '', roping: '1:1', encoder: '', brake: '', status: 'contract', progress: 0, serviceIntervalDays: 0, notes: '' };
  const statusOpts = Object.keys(STATUS_META).map(s => `<option value="${s}" ${v.status === s ? 'selected' : ''}>${t(STATUS_META[s].key)}</option>`).join('');
  openModal(`
    <div class="modal-head"><h3>${p ? '✏️ ' + t('editProject') : '🏗️ ' + t('newProject')}</h3><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <div class="modal-body"><form id="projForm" class="form-grid">
      <div class="form-sep span2">${t('secProject')}</div>
      <div class="field span2"><label>${t('prName')} *</label><input id="f_name" value="${esc(v.name)}" required /></div>
      <div class="field"><label>${t('prCustomer')}</label><input id="f_customer" value="${esc(v.customer)}" /></div>
      <div class="field"><label>${t('prPhone')}</label><input id="f_phone" value="${esc(v.phone)}" /></div>
      <div class="field span2"><label>${t('prLocation')}</label><input id="f_location" value="${esc(v.location)}" /></div>

      <div class="form-sep span2">${t('secSpecs')}</div>
      <div class="field"><label>${t('prType')}</label><select id="f_type">
        <option value="traction" ${v.elevatorType === 'traction' ? 'selected' : ''}>⚙️ ${t('traction')}</option>
        <option value="hydraulic" ${v.elevatorType === 'hydraulic' ? 'selected' : ''}>🛢️ ${t('hydraulic')}</option>
      </select></div>
      <div class="field"><label>${t('prSpeed')}</label><input id="f_speed" type="number" step="0.1" value="${v.speed}" /></div>
      <div class="field"><label>${t('prCapacity')}</label><input id="f_cap" type="number" value="${v.capacityKg}" /></div>
      <div class="field"><label>${t('prPersons')}</label><input id="f_persons" type="number" value="${v.persons}" /></div>
      <div class="field"><label>${t('prFloors')}</label><input id="f_floors" type="number" value="${v.floors}" /></div>
      <div class="field"><label>${t('prStops')}</label><input id="f_stops" type="number" value="${v.stops}" /></div>
      <div class="field"><label>${t('prRoping')}</label><select id="f_roping">
        <option value="1:1" ${v.roping !== '2:1' ? 'selected' : ''}>1:1</option>
        <option value="2:1" ${v.roping === '2:1' ? 'selected' : ''}>2:1</option>
      </select></div>
      <div class="field"><label>${t('prNominalVoltage')}</label><input id="f_nominalv" type="number" min="0" step="1" value="${v.nominalVoltage || ''}" placeholder="مثلاً 380" /></div>
      <div class="field"><label>${t('prVoltageTolerance')}</label><input id="f_volttol" type="number" min="0" max="100" step="0.1" value="${v.voltageTolerance != null ? v.voltageTolerance : ''}" placeholder="از مرجع پروژه/سازنده" /></div>

      <div class="form-sep span2">${t('secEquip')}</div>
      <div class="field span2"><label>${t('prController')}</label><input id="f_controller" value="${esc(v.controller)}" /></div>
      <div class="field span2"><label>${t('prMotor')}</label><input id="f_motor" value="${esc(v.motor)}" /></div>
      <div class="field"><label>${t('prDrive')}</label><input id="f_drive" value="${esc(v.drive || '')}" /></div>
      <div class="field"><label>${t('prDoorOp')}</label><input id="f_doorop" value="${esc(v.doorOperator || '')}" /></div>
      <div class="field"><label>${t('prEncoder')}</label><input id="f_encoder" value="${esc(v.encoder || '')}" /></div>
      <div class="field"><label>${t('prBrake')}</label><input id="f_brake" value="${esc(v.brake || '')}" /></div>

      <div class="form-sep span2">${t('secStatus')}</div>
      <div class="field"><label>${t('prStatus')}</label><select id="f_status">${statusOpts}</select></div>
      <div class="field"><label>${t('prProgress')}</label><input id="f_progress" type="number" min="0" max="100" value="${v.progress}" /></div>
      <div class="field span2"><label>${t('serviceInterval')}</label><input id="f_interval" type="number" min="0" value="${v.serviceIntervalDays || 0}" /></div>
      <div class="field span2"><label>${t('prNotes')}</label><textarea id="f_notes">${esc(v.notes)}</textarea></div>
    </form></div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-primary" id="projSave">${p ? t('save') : t('create')}</button>
    </div>`, { size: 'lg' });
  $('#projSave').onclick = async () => {
    const name = $('#f_name').value.trim();
    if (!name) { fieldError('#f_name', 'requiredName'); return; }
    const body = {
      name, customer: $('#f_customer').value, phone: $('#f_phone').value, location: $('#f_location').value,
      elevatorType: $('#f_type').value, status: $('#f_status').value,
      capacityKg: +$('#f_cap').value, persons: +$('#f_persons').value, floors: +$('#f_floors').value,
      stops: +$('#f_stops').value, speed: +$('#f_speed').value, progress: +$('#f_progress').value,
      nominalVoltage: parseNum($('#f_nominalv').value) || 0,
      voltageTolerance: parseNum($('#f_volttol').value),
      serviceIntervalDays: +$('#f_interval').value,
      controller: $('#f_controller').value, motor: $('#f_motor').value,
      drive: $('#f_drive').value, doorOperator: $('#f_doorop').value,
      roping: $('#f_roping').value, encoder: $('#f_encoder').value, brake: $('#f_brake').value,
      notes: $('#f_notes').value
    };
    const btn = $('#projSave'); btn.disabled = true;
    try {
      if (p) {
        const d = await api('/projects/' + p.id, { method: 'PUT', body });
        Object.assign(p, d.project);
        toast(t('saved'));
      } else {
        const d = await api('/projects', { method: 'POST', body });
        state.projects.unshift(d.project);
        toast(t('created'));
      }
      state.projects.sort((a, b) => b.updatedAt - a.updatedAt);
      closeModal(); render();
    } catch (e) { toast(errMsg(e), 'err'); btn.disabled = false; }
  };
}

function projectImpactCount(pid) {
  return {
    services: (state.services || []).filter(s => s.projectId === pid).length,
    measurements: (state.measurements || []).filter(m => m.projectId === pid).length,
    photos: (state.photos || []).filter(x => x.projectId === pid).length,
    invoices: (state.invoices || []).filter(i => i.projectId === pid).length,
    diagSessions: (state.diagSessions || []).filter(d => d.projectId === pid).length,
    issues: (state.issues || []).filter(x => x.projectId === pid).length,
    contracts: (state.contracts || []).filter(c => c.projectId === pid).length,
    reminders: (state.reminders || []).filter(r => r.projectId === pid).length,
    checklists: (state.checklists || []).filter(c => c.projectId === pid).length
  };
}
function archiveProject(id) {
  const p = state.projects.find(x => x.id === id);
  if (!p) return;
  confirmDialog(
    LANG === 'fa' ? 'بایگانی پروژه' : 'Archive project',
    (LANG === 'fa'
      ? 'پروژه به بایگانی منتقل می‌شود و از لیست فعال‌ها خارج می‌گردد. داده‌های تاریخی (سرویس، فاکتور، اندازه‌گیری و …) حفظ می‌شوند. ادامه؟'
      : 'Project will be moved to archive and removed from active lists. Historical data (services, invoices, measurements…) is preserved. Continue?'),
    async () => {
      try {
        const archivedAt = Date.now();
        const d = await api('/projects/' + id, { method: 'PUT', body: { archived: true, archivedAt } });
        /* state follows the persisted record returned by the API — the flag
           is now durable in the database itself, not kept alive only by the
           shared in-memory object reference */
        if (d && d.project) Object.assign(p, d.project);
        closeModal(); toast(LANG === 'fa' ? 'پروژه بایگانی شد' : 'Project archived'); render();
      } catch (e) { toast(errMsg(e), 'err'); }
    }
  );
}
function deleteProject(id) {
  const p = state.projects.find(x => x.id === id);
  if (!p) return;
  const c = projectImpactCount(id);
  const anyLinked = c.services + c.measurements + c.photos + c.invoices + c.diagSessions + c.issues + c.contracts + c.reminders + c.checklists;
  // Show impact summary
  const fmt = (n, fa, en) => n > 0 ? `• ${n} ${LANG === 'fa' ? fa : en}` : '';
  const lines = [
    fmt(c.services, 'گزارش سرویس', 'service reports'),
    fmt(c.measurements, 'رکورد اندازه‌گیری', 'measurements'),
    fmt(c.photos, 'عکس', 'photos'),
    fmt(c.invoices, 'فاکتور', 'invoices'),
    fmt(c.diagSessions, 'جلسه عیب‌یابی', 'diagnostic sessions'),
    fmt(c.issues, 'ثبت خرابی', 'issues'),
    fmt(c.contracts, 'قرارداد', 'contracts'),
    fmt(c.reminders, 'یادآوری', 'reminders'),
    fmt(c.checklists, 'چک‌لیست', 'checklists')
  ].filter(Boolean);
  const warnTitle = LANG === 'fa' ? 'حذف دائمی پروژه' : 'Permanently delete project';
  const hasLinked = LANG === 'fa'
    ? `این پروژه شامل موارد زیر است (حذف دائمی):\n\n${lines.join('\n')}\n\n⚠️ پیشنهاد می‌شود به‌جای حذف، از «بایگانی» استفاده کنید. در صورت حذف دائمی، سوابق از بین نمی‌روند؛ از پروژه جدا و با نام/مشخصات همین آسانسور مهر می‌خورند («سوابق بدون پروژه»). حذف دائمی؟`
    : `This project contains (permanent delete):\n\n${lines.join('\n')}\n\n⚠️ Prefer Archive instead. On permanent delete, history records are preserved — detached from the project but stamped with this elevator's name/details. Delete permanently?`;
  const noneMsg = LANG === 'fa'
    ? 'این پروژه هیچ سابقه‌ای ندارد. آیا از حذف دائمی آن مطمئنید؟'
    : 'This project has no history. Permanently delete?';
  // custom modal with impact summary instead of default confirmDialog
  openModal(`
    <div class="modal-head"><h3>⚠️ ${esc(warnTitle)}</h3><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <p style="margin:0 0 8px"><b>${esc(p.name)}</b></p>
      ${anyLinked ? `
      <div class="note-block" style="background:var(--warn-soft);border-color:var(--warn);margin-bottom:10px">
        ${lines.map(l => `<div style="margin:3px 0">${esc(l)}</div>`).join('')}
      </div>
      <p style="font-size:12.5px;color:var(--text-3);margin:0 0 10px">${
        LANG === 'fa'
        ? 'پیشنهاد: به‌جای حذف، پروژه را بایگانی کنید. سوابق تکنسینی هرگز همراه پروژه حذف نمی‌شوند — فقط از پروژه جدا می‌شوند.'
        : 'Tip: Archive instead. Technical history is never destroyed with the project — it is only detached.'
      }</p>` : `<p style="margin:0 0 10px">${esc(noneMsg)}</p>`}
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">${t('cancel')}</button>
      ${anyLinked ? `<button class="btn" onclick="closeModal();archiveProject('${id}')">📦 ${LANG === 'fa' ? 'بایگانی پروژه' : 'Archive'}</button>` : ''}
      <button class="btn btn-soft-danger" id="pdYes">${IC.trash} ${LANG === 'fa' ? 'حذف دائمی' : 'Delete permanently'}</button>
    </div>
  `, { size: 'sm' });
  $('#pdYes').onclick = async () => {
    closeModal();
    await _doDeleteProject(id);
  };
}
async function _doDeleteProject(id) {
  const rb = optimisticRemove(state.projects, id);
  if (!rb) return;
  const p = rb.removed; // the removed project (for context stamping)
  const pInfo = p ? [p.name, p.customer, p.location].filter(Boolean).join(' — ') : '';
  const stampAll = (list) => { (list || []).forEach(r => { if (r && r.projectId === id) { if (pInfo && !r.projectInfo) r.projectInfo = pInfo; r.projectId = ''; } }); };
  navigate('/projects');
  try {
    await api('/projects/' + id, { method: 'DELETE' });
    // mirror the server-side detach-and-stamp in local state (records survive,
    // keeping the elevator context; checklists are detached, not destroyed)
    state.services.forEach(s => { if (s.projectId === id) { if (p && !s.customer) s.customer = p.customer || p.name || ''; if (p && !s.elevatorInfo) s.elevatorInfo = [p.name, p.location].filter(Boolean).join(' — '); } });
    stampAll(state.services); stampAll(state.measurements); stampAll(state.photos); stampAll(state.invoices);
    stampAll(state.diagSessions); stampAll(state.issues); stampAll(state.contracts); stampAll(state.reminders); stampAll(state.checklists);
    toast(t('deleted'));
  } catch (e) {
    rb.restore();
    toast(errMsg(e), 'err'); render();
  }
}

function renderProjectDetail(id) {
  const p = state.projects.find(x => x.id === id);
  const c = $('#content');
  if (!p) { c.innerHTML = `<div class="empty"><div class="e-icon">🔍</div><strong>${t('notFound')}</strong></div>`; return; }
  const services = state.services.filter(s => s.projectId === id).sort((a, b) => b.date - a.date);
  const templates = CHECKLIST_TEMPLATES.filter(tp => tp.type === p.elevatorType || tp.type === 'both');
  const insts = state.checklists.filter(x => x.projectId === id);

  const kv = [
    [t('customer'), p.customer + (p.phone ? ' — ' + p.phone : '')],
    [t('location'), p.location],
    [t('prType'), p.elevatorType === 'hydraulic' ? t('hydraulic') : t('traction')],
    [t('capacity'), `${faNum(p.capacityKg)} kg / ${faNum(p.persons)} ${t('personsUnit')}`],
    [t('prFloors'), `${faNum(p.floors)} ${t('floorsUnit')} · ${faNum(p.stops)} ${LANG === 'fa' ? 'توقف' : 'stops'}`],
    [t('prSpeed'), faNum(p.speed) + ' m/s'],
    [t('prController'), p.controller],
    [t('prMotor'), p.motor],
    [t('prDrive'), p.drive],
    [t('prDoorOp'), p.doorOperator],
    [t('prRoping'), p.roping],
    [t('prEncoder'), p.encoder],
    [t('prBrake'), p.brake]
  ].filter(x => x[1]);
  const due = dueInfo(p);
  if (due) {
    kv.push([t('lastService'), fmtDate(due.last)]);
    kv.push([t('nextService'), fmtDate(due.next) + (due.overdue ? ` — ⚠️ ${faNum(Math.abs(due.days))} ${t('daysOverdue')}` : ` (${faNum(due.days)} ${t('daysLeft')})`)]);
  }

  c.innerHTML = `
    <button class="btn btn-ghost btn-sm" onclick="navigate('/projects')" style="margin-bottom:14px">${IC.back} ${t('projects')}</button>
    <div class="detail-head">
      <div class="row-icon" style="background:${p.elevatorType === 'hydraulic' ? 'var(--teal-soft)' : 'var(--accent-soft)'};font-size:24px;width:54px;height:54px">${p.elevatorType === 'hydraulic' ? '🛢️' : '⚙️'}</div>
      <div class="grow">
        <h2>${esc(p.name)}</h2>
        <div class="sub">${statusBadge(p.status)} ${typeBadge(p.elevatorType)} <span style="color:var(--text-3);font-size:12px">· ${t('lastUpdate')}: ${fmtDateTime(p.updatedAt)}</span></div>
      </div>
      <div class="actions">
        <button class="btn btn-ghost" onclick="openQrModal('${p.id}')">🏷️ QR</button>
        <button class="btn btn-ghost" onclick="openProjectForm('${p.id}')">${IC.edit} ${t('edit')}</button>
        <button class="btn btn-soft-danger" onclick="deleteProject('${p.id}')">${IC.trash} ${t('delete')}</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">📊 ${t('progress')}</div>
      <div class="progress-edit">
        <input type="range" min="0" max="100" step="5" value="${p.progress}" id="progRange" />
        <span class="val" id="progVal">${faNum(p.progress)}٪</span>
      </div>
      <div class="mini-progress" style="height:9px;margin-top:10px"><div class="fill" id="progBar" style="width:${p.progress}%"></div></div>
    </div>

    <div class="card">
      <div class="card-title">📋 ${t('specs')}</div>
      <div class="kv-grid">${kv.map(([k, v]) => `<div class="kv-cell"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`).join('')}</div>
      ${p.notes ? `<div class="note-block" style="margin-top:14px">📝 ${esc(p.notes)}</div>` : ''}
    </div>

    <div class="section-title"><h3>✅ ${t('projectChecklists')}</h3></div>
    <div class="grid-2">
      ${templates.map(tp => {
        const inst = insts.find(i => i.templateId === tp.id);
        const total = tp.groups.reduce((a, g) => a + g.items.length, 0);
        const done = inst ? Object.values(inst.checked).filter(Boolean).length : 0;
        const pct = total ? Math.round(done / total * 100) : 0;
        return `<div class="card kb-card" onclick="navigate('/checklists/${tp.id}?project=${p.id}')">
          <h4>${tp.kind === 'install' ? '🏗️' : '🔧'} ${esc(tp.title[LANG] || tp.title.fa)}</h4>
          <div class="mini-progress" style="height:8px"><div class="fill" style="width:${pct}%"></div></div>
          <p style="margin-top:8px;font-size:12.5px">${faNum(done)} / ${faNum(total)} ${t('itemsDone')} (${faNum(pct)}٪)</p>
        </div>`;
      }).join('')}
    </div>

    ${services.length ? `
    <div class="card" style="margin-top:16px">
      <button class="btn btn-ghost btn-block" onclick="viewProjectServices('${p.id}')">
        🔧 ${t('viewServiceHistory')} (${faNum(services.length)})
      </button>
    </div>` : ''}

    ${(() => {
      /* permanent elevator profile: issues, diagnostics, calcs, photos */
      const pIssues = state.issues.filter(i => i.projectId === p.id && !i.closed);
      const pDiags = state.diagSessions.filter(dd => dd.projectId === p.id).slice(0, 5);
      const pCalcs = state.calcSaves.filter(cc => cc.projectId === p.id).slice(0, 5);
      const pPhotos = state.photos.filter(ph => ph.projectId === p.id).slice(0, 8);
      let out = '';
      /* open issues */
      out += `<div class="section-title"><h3>🔴 ${t('issues')}</h3>
        <button class="btn btn-ghost btn-sm" onclick="openIssueForm(null,'${p.id}')">${IC.plus} ${t('newIssue')}</button></div>`;
      out += pIssues.length ? pIssues.map(issueRow).join('') : `<p style="font-size:13px;color:var(--ok);font-weight:600">${t('noIssues')}</p>`;
      /* diagnostics history */
      if (pDiags.length) {
        out += `<div class="section-title"><h3>🧭 ${t('diagSessions')}</h3></div>`;
        out += pDiags.map(dd => `
          <div class="kv-cell" style="margin-bottom:8px">
            <div class="k">${fmtDateTime(dd.date || dd.createdAt)} · ${esc(dd.technician || '')}</div>
            <div class="v" style="font-weight:600;font-size:13.3px">${esc(dd.symptom || '')} ← ${esc(dd.finalDiagnosis || dd.result || '')}</div>
            ${dd.measurements && dd.measurements.length ? `<div style="font-size:11.8px;color:var(--text-3);margin-top:3px;direction:ltr;text-align:end">${dd.measurements.map(m => esc(m.label + '=' + m.value + m.unit)).join(' · ')}</div>` : ''}
          </div>`).join('');
      }
      /* saved calculations */
      if (pCalcs.length) {
        out += `<div class="section-title"><h3>🧮 ${t('calcHistory')}</h3></div>`;
        out += pCalcs.map(cc => `
          <div class="kv-cell" style="margin-bottom:8px">
            <div class="k">${fmtDateTime(cc.createdAt)}</div>
            <div class="v" style="font-weight:600;font-size:13.3px">${esc(cc.name)}</div>
            <div style="font-size:12px;color:var(--text-2);margin-top:2px">${(cc.results || []).map(r => esc(r.label + ': ' + r.val)).join(' · ')}</div>
          </div>`).join('');
      }
      /* fault pattern stats */
      const pSvc = state.services.filter(s => s.projectId === p.id);
      if (pSvc.length >= 2) {
        const top = faultTally(pSvc, FAULT_ICONS).slice(0, 6);
        if (top.length) {
          const mx = top[0][1];
          out += `<div class="card" style="margin-top:16px"><div class="card-title">📊 ${t('faultStats')}</div>
            <p style="font-size:11.8px;color:var(--text-3);margin-bottom:10px">${t('faultStatsSub')} (${faNum(pSvc.length)})</p>
            <div class="status-bars">${top.map(([lbl, n]) => `
              <div class="sb-row"><span class="sb-lbl">${esc(lbl)}</span>
              <div class="sb-track"><div class="sb-fill" style="width:${Math.round(n / mx * 100)}%;background:var(--warn)"></div></div>
              <span class="sb-val">${faNum(n)}</span></div>`).join('')}</div></div>`;
        }
      }
      /* invoices of this elevator */
      const pInvs = state.invoices.filter(i => i.projectId === p.id).slice(0, 5);
      if (pInvs.length) {
        out += `<div class="section-title"><h3>🧾 ${t('profInvoices')}</h3></div>`;
        out += pInvs.map(i => {
          const tt2 = invTotals(i);
          const mm = invStatusMeta(i);
          return `<div class="due-item ${tt2.balance > 0 ? 'soon' : ''}" onclick="navigate('/invoices');setTimeout(()=>openInvoiceForm('${i.id}'),120)" style="cursor:pointer">
            <span style="font-size:17px">🧾</span>
            <div class="grow"><strong>${money(tt2.grand)} ${t('rial')}</strong>
            <span class="d-sub">${fmtDate(i.date || i.createdAt)}${tt2.balance ? ' · ' + t('invBalance') + ': ' + money(tt2.balance) : ''}</span></div>
            <span class="badge ${mm.cls}">${mm.icon} ${t(mm.key)}</span>
          </div>`;
        }).join('');
      }
      /* contract of this building */
      const pCt = state.contracts.find(ct => ct.projectId === p.id);
      if (pCt) {
        const cst = ctStats(pCt);
        out += `<div class="section-title"><h3>📄 ${t('profContract')}</h3></div>
          <div class="due-item ${cst.overdue ? 'overdue' : ''}" onclick="navigate('/contracts');setTimeout(()=>openContractForm('${pCt.id}'),120)" style="cursor:pointer">
            <span style="font-size:17px">📄</span>
            <div class="grow"><strong>${esc(pCt.building)}</strong>
            <span class="d-sub">${money(pCt.amount)} ${t('rial')} · ${faNum(cst.paidCount)}/${faNum(cst.total)} ${t('ctPaid')}</span></div>
            ${cst.overdue ? `<span class="badge b-red">${faNum(cst.overdue)} ${t('ctOverdueMonths')}</span>` : `<span class="badge b-green">${cst.expired ? t('ctExpired') : t('ctActive')}</span>`}
          </div>`;
      }
      /* photos */
      out += `<div class="section-title"><h3>📷 ${t('photos')}</h3>
        <button class="btn btn-ghost btn-sm" onclick="openPhotoForm('${p.id}')">${IC.cam} ${t('addPhoto')}</button></div>`;
      out += pPhotos.length
        ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:8px">${pPhotos.map(ph => `
            <img src="${photoDataSync(ph) || PHOTO_PLACEHOLDER}" data-phid="${esc(ph.id)}" onclick="viewPhoto('${ph.id}')" title="${esc(ph.cat || '')}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:11px;border:1px solid var(--border);cursor:pointer;background:var(--bg-soft)" />`).join('')}</div>`
        : `<p style="font-size:12.5px;color:var(--text-3)">${t('noPhotos')}</p>`;
      return out;
    })()}
  `;

  // progress slider — optimistic save (debounced)
  const range = $('#progRange');
  const saveProg = debounce(async val => {
    try { await api('/projects/' + p.id, { method: 'PUT', body: { progress: val } }); toast(t('saved')); }
    catch (e) { toast(errMsg(e), 'err'); }
  }, 600);
  range.oninput = () => {
    const v = +range.value;
    p.progress = v;
    $('#progVal').textContent = faNum(v) + '٪';
    $('#progBar').style.width = v + '%';
    saveProg(v);
  };
  hydratePhotoImgs();
}
