/* ================= SERVICE CALENDAR & REMINDERS ================= */
var REMINDER_META = {
  periodic: { key: 'reminderPeriodic', icon: '🔧', cls: 'b-teal' },
  followup: { key: 'reminderFollowup', icon: '🔎', cls: 'b-blue' },
  custom:   { key: 'reminderCustom', icon: '📌', cls: 'b-gray' }
};
var calState = { jy: 0, jm: 0 }; // initialized to current Jalali month on first render
var calSelDay = 0;                 // day highlighted in the grid (0 = none)

/* Pure derivation of every active reminder from projects + services + manual entries.
   periodic  → project.serviceIntervalDays elapsed since its last maintenance/repair
   followup  → service.followUpDate
   custom    → manual reminders stored in db.reminders (not done) */
function buildReminders() {
  const out = [];
  const DAY = 86400000;
  (state.projects || []).forEach(p => {
    if (!p.serviceIntervalDays) return;
    const info = dueInfo(p);
    if (!info) return;
    out.push({ id: 'per-' + p.id, kind: 'periodic', projectId: p.id, title: p.name,
      due: info.next, days: info.days, overdue: info.overdue, soon: info.soon, last: info.last, intervalDays: p.serviceIntervalDays });
  });
  (state.services || []).forEach(s => {
    if (!s.followUpDate) return;
    const days = Math.round((s.followUpDate - Date.now()) / DAY);
    out.push({ id: 'fu-' + s.id, kind: 'followup', serviceId: s.id, projectId: s.projectId,
      title: svcTarget(s), due: s.followUpDate, days, overdue: days < 0, soon: days >= 0 && days <= 7 });
  });
  (state.reminders || []).forEach(r => {
    if (r.done) return;
    const days = Math.round((r.due - Date.now()) / DAY);
    out.push({ id: 'rem-' + r.id, kind: r.kind === 'periodic' || r.kind === 'followup' ? r.kind : 'custom', reminderId: r.id, projectId: r.projectId || '',
      title: r.title, due: r.due, days, overdue: days < 0, soon: days >= 0 && days <= 7 });
  });
  return out.sort((a, b) => a.due - b.due);
}

/* shared calendar markup — used both by the standalone /calendar route
   and by the in-Services calendar tab (v24). The IDs (#calWrap, #reminderList,
   #calGrid, #calDayDetail) are unique on screen at any one time because each
   render() replaces #content. */
function calendarSectionHTML() {
  return `
    <div id="calWrap" class="card" style="padding:16px"></div>
    <div class="card" style="margin-top:16px">
      <div class="card-title">🔔 ${t('calReminderList')}</div>
      <div id="reminderList"></div>
    </div>`;
}
function renderCalendar() {
  const c = $('#content');
  if (!calState.jy) { const j = tsToJalali(Date.now()); calState = { jy: j.jy, jm: j.jm }; }
  calSelDay = 0;
  const reminders = buildReminders();
  c.innerHTML = `
    <div class="toolbar">
      <h2 style="margin:0;font-size:17px">📅 ${t('calendar')}</h2>
      <button class="btn btn-primary" onclick="openReminderForm()">${IC.plus} ${t('newReminder')}</button>
    </div>
    ${calendarSectionHTML()}`;
  drawCalendar();
  drawReminderList(reminders);
}
function calShift(d) {
  calSelDay = 0;
  calState.jm += d;
  if (calState.jm > 12) { calState.jm = 1; calState.jy++; }
  if (calState.jm < 1) { calState.jm = 12; calState.jy--; }
  drawCalendar();
}
function calToday() {
  const j = tsToJalali(Date.now());
  calSelDay = 0;
  calState = { jy: j.jy, jm: j.jm };
  drawCalendar();
}
function calCellsHTML() {
  const { jy, jm } = calState;
  const days = jalDaysInMonth(jy, jm);
  const firstTs = jalaliToTs(jy, jm, 1);
  const startCol = (new Date(firstTs).getDay() + 1) % 7; // Persian week starts Saturday
  const todayJ = tsToJalali(Date.now());
  // count services + reminders per day of the displayed month
  const dayCount = {};
  (state.services || []).forEach(s => {
    const j = tsToJalali(s.date);
    if (j.jy === jy && j.jm === jm) dayCount[j.jd] = (dayCount[j.jd] || 0) + 1;
  });
  buildReminders().forEach(r => {
    const j = tsToJalali(r.due);
    if (j.jy === jy && j.jm === jm) dayCount[j.jd] = (dayCount[j.jd] || 0) + 1;
  });
  let cells = '';
  for (let i = 0; i < startCol; i++) cells += '<span></span>';
  for (let d = 1; d <= days; d++) {
    const isToday = todayJ.jy === jy && todayJ.jm === jm && todayJ.jd === d;
    const isSel = calSelDay === d;
    const n = dayCount[d] || 0;
    cells += `<button class="cal-day ${isToday ? 'cal-today' : ''} ${isSel ? 'cal-sel' : ''}" data-d="${d}" onclick="calPickDay(${d})" aria-pressed="${isSel ? 'true' : 'false'}">
      <span class="cal-num">${faNum(d)}</span>
      ${n ? `<span class="cal-dot">${faNum(n)}</span>` : ''}
    </button>`;
  }
  return cells;
}
/* repaint only the day grid (keeps the open day detail below intact) */
function drawCalDays() {
  const grid = $('#calGrid');
  if (grid) grid.innerHTML = calCellsHTML();
}
function drawCalendar() {
  if (!$('#calWrap')) return;
  const { jy, jm } = calState;
  const cells = calCellsHTML();
  $('#calWrap').innerHTML = `
    <div class="cal-head">
      <button class="icon-btn" onclick="calShift(-1)" aria-label="${t('prevMonth')}" title="${t('prevMonth')}">${navArrows().prev}</button>
      <strong id="calHeader">${jalMonth(jm)} ${faNum(jy)}</strong>
      <button class="icon-btn" onclick="calShift(1)" aria-label="${t('nextMonth')}" title="${t('nextMonth')}">${navArrows().next}</button>
      <button class="btn btn-ghost btn-sm" onclick="calToday()">${t('today')}</button>
    </div>
    <div class="cal-week">${['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].map(w => `<span>${w}</span>`).join('')}</div>
    <div id="calGrid" class="cal-grid">${cells}</div>
    <div class="cal-legend">
      <span class="lg"><span class="dot"></span>${t('calLegendEvents')}</span>
      <span class="lg"><span class="sq" style="background:var(--accent-soft);border:1px solid var(--accent)"></span>${t('calLegendToday')}</span>
      <span class="lg">🔴 ${t('calLegendOverdue')}</span>
      <span class="lg">🟡 ${t('calLegendSoon')}</span>
    </div>
    <div id="calDayDetail"></div>`;
}
function calPickDay(d) {
  const { jy, jm } = calState;
  const { from: start, to: end } = jalDayRange(jy, jm, d);
  const svcs = (state.services || []).filter(s => s.date >= start && s.date < end);
  const rems = buildReminders().filter(r => r.due >= start && r.due < end);
  calSelDay = d;
  drawCalDays();
  if (!svcs.length && !rems.length) { $('#calDayDetail').innerHTML = `<div class="empty" data-cal="noevents" style="margin-top:12px"><p>${t('calNoEvents')}</p></div>`; return; }
  $('#calDayDetail').innerHTML = `
    <div class="card" style="margin-top:12px">
      <div class="card-title">${fmtJalali(start)}</div>
      ${svcs.length ? `<div class="sub-title" data-cal="services">${t('calServicesOnDay')}</div>` + svcs.map(s => `<div class="row-item" onclick="openServiceView('${s.id}')"><span>${svcMeta(s.serviceType).icon}</span> ${esc(svcTarget(s))}</div>`).join('') : ''}
      ${rems.length ? `<div class="sub-title" data-cal="reminders" style="margin-top:10px">${t('calRemindersDue')}</div>` + rems.map(r => `<div class="row-item ${r.overdue ? 'overdue' : ''}"><span>${remMeta(r.kind).icon}</span> ${esc(r.title)}</div>`).join('') : ''}
    </div>`;
}
function drawReminderList(reminders) {
  const el = $('#reminderList');
  if (!el) return;
  if (!reminders.length) { el.innerHTML = `<div class="empty"><p>${t('calNoReminders')}</p><p class="sub">${t('calTapDay')}</p></div>`; return; }
  el.innerHTML = `<p style="font-size:11.5px;color:var(--text-3);margin-bottom:8px">💡 ${t('reminderEditHint')}</p>` + reminders.map(r => {
    const m = remMeta(r.kind);
    const label = r.overdue ? t('calOverdue') : (r.soon ? t('calDueSoon') : t('calUpcoming'));
    const cls = r.overdue ? 'b-red' : (r.soon ? 'b-amber' : 'b-gray');
    /* only manual reminders own a record: they can be edited / completed / deleted */
    const editable = !!r.reminderId;
    const done = editable ? `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();markReminderDone('${r.reminderId}')">${t('reminderMarkDone')}</button>` : '';
    return `<div class="row-item" style="justify-content:space-between${editable ? ';cursor:pointer' : ''}" ${editable ? `onclick="openReminderForm('${r.reminderId}')"` : ''}>
      <div class="row-body"><strong>${m.icon} ${esc(r.title)}</strong><span class="sub">${r.projectId ? esc(projName(r.projectId)) : ''}</span></div>
      <div class="row-side"><span class="badge ${cls}">${label} · ${fmtJalali(r.due)}</span>${done}</div>
    </div>`;
  }).join('');
}
function openReminderForm(id) {
  const r = id ? (state.reminders || []).find(x => x.id === id) : null;
  const v = r || { title: '', due: Date.now() + 7 * 86400000, kind: 'custom', projectId: '' };
  openModal(`
    <div class="modal-head"><h3>${r ? '✏️ ' + t('editReminder') : '📌 ' + t('newReminder')}</h3><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <div class="modal-body"><form class="form-grid">
      <div class="field span2"><label>${t('reminderTitle')} *</label><input id="rm_title" value="${esc(v.title)}" /></div>
      <div class="field"><label>${t('reminderDate')}</label>${jdateInput('rm_due', v.due, false)}</div>
      <div class="field"><label>${t('svcType')}</label><select id="rm_kind">
        ${Object.keys(REMINDER_META).map(k => `<option value="${k}" ${v.kind === k ? 'selected' : ''}>${t(REMINDER_META[k].key)}</option>`).join('')}
      </select></div>
      <div class="field span2"><label>${t('reminderProject')}</label><select id="rm_project">
        <option value="">—</option>
        ${(state.projects || []).map(p => `<option value="${p.id}" ${v.projectId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
      </select></div>
    </form></div>
    <div class="modal-foot">
      ${r ? `<button class="btn btn-soft-danger" onclick="deleteReminder('${r.id}')">${IC.trash}</button>` : ''}
      <button class="btn btn-ghost" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-primary" id="rmSave">${r ? t('save') : t('create')}</button>
    </div>`);
  $('#rmSave').onclick = guard('#rmSave', async () => {
    const title = $('#rm_title').value.trim();
    if (!title) { fieldError('#rm_title', 'reminderTitleReq'); return; }
    const body = {
      title, due: jdateVal('rm_due') || (Date.now() + 7 * 86400000),
      kind: $('#rm_kind').value, projectId: $('#rm_project').value
    };
    try {
      if (r) { await api('/reminders/' + r.id, { method: 'PUT', body }); }
      else { await api('/reminders', { method: 'POST', body }); }
      await reloadReminders();
      closeModal(); toast(r ? t('saved') : t('created')); render();
    } catch (e) { toast(errMsg(e), 'err'); }
  });
}
function deleteReminder(id) {
  confirmDialog(t('confirmDeleteTitle'), t('confirmDeleteReminderMsg'), async () => {
    try {
      await api('/reminders/' + id, { method: 'DELETE' });
      await reloadReminders();
      closeModal(); toast(t('reminderDeleted')); render();
    } catch (e) { closeModal(); toast(errMsg(e), 'err'); }
  });
}
/* refresh just the reminders collection (cheaper & safer than a full reload) */
async function reloadReminders() {
  const d = await api('/reminders');
  state.reminders = d.reminders;
}
async function markReminderDone(id) {
  try {
    await api('/reminders/' + id, { method: 'PUT', body: { done: true } });
    await reloadReminders();
    render();
    toast(t('saved'));
  } catch (e) { reportError(e, 'markReminderDone'); }
}
