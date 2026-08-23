/* ================= OPEN ISSUES ================= */
var ISSUE_META = {
  open: { key: 'issueOpen', icon: '🔴', cls: 'b-red' },
  followup: { key: 'issueFollow', icon: '🟠', cls: 'b-amber' },
  recommend: { key: 'issueRecommend', icon: '🟡', cls: 'b-gray' }
};
function renderIssues() {
  const c = $('#content');
  const open = state.issues.filter(i => !i.closed);
  const closed = state.issues.filter(i => i.closed).slice(0, 10);
  c.innerHTML = `
    <div class="toolbar">
      <div style="flex:1"></div>
      <button class="btn btn-primary" onclick="openIssueForm()">${IC.plus} ${t('newIssue')}</button>
    </div>
    ${open.length ? open.map(issueRow).join('') : `<div class="empty"><div class="e-icon">✅</div><strong>${t('noIssues')}</strong></div>`}
    ${closed.length ? `<div class="section-title"><h3>✔️ ${t('issueClosed')}</h3></div>` + closed.map(issueRow).join('') : ''}`;
}
function issueRow(i) {
  const m = issueMeta(i.kind);
  return `<div class="row-item" style="${i.closed ? 'opacity:.55' : ''}" onclick="openIssueForm('${i.id}')">
    <div class="row-icon" style="background:var(--bg-soft);border:1px solid var(--border);font-size:18px">${i.closed ? '✔️' : m.icon}</div>
    <div class="row-body">
      <strong>${esc(i.title)}</strong>
      <span class="sub">${i.projectId ? esc(projName(i.projectId)) + ' · ' : ''}${fmtDate(i.createdAt)}</span>
    </div>
    <div class="row-side"><span class="badge ${m.cls}">${t(m.key)}</span></div>
  </div>`;
}
function openIssueForm(id, presetProject) {
  const i = id ? state.issues.find(x => x.id === id) : null;
  const v = i || { title: '', kind: 'open', projectId: presetProject || '', note: '', closed: false };
  openModal(`
    <div class="modal-head"><h3>${i ? '✏️' : '🔴'} ${i ? t('edit') : t('newIssue')}</h3><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="field"><label>${t('issueTitle')} *</label><input id="is_title" value="${esc(v.title)}" /></div>
      <div class="field"><label>${t('issueStatus')}</label><select id="is_kind">
        ${Object.keys(ISSUE_META).map(k => `<option value="${k}" ${v.kind === k ? 'selected' : ''}>${ISSUE_META[k].icon} ${t(ISSUE_META[k].key)}</option>`).join('')}
      </select></div>
      <div class="field"><label>${t('diagSelProject')}</label><select id="is_project">
        <option value="">—</option>
        ${state.projects.map(p => `<option value="${p.id}" ${v.projectId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
      </select></div>
      <div class="field"><label>${t('prNotes')}</label><textarea id="is_note">${esc(v.note || '')}</textarea></div>
    </div>
    <div class="modal-foot">
      ${i ? `<button class="btn btn-soft-danger" onclick="deleteIssue('${i.id}')">${IC.trash}</button>` : ''}
      ${i ? `<button class="btn btn-ghost" id="isToggle">${i.closed ? '🔄 ' + t('issueReopen') : '✔️ ' + t('issueDone')}</button>` : ''}
      <button class="btn btn-ghost" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-primary" id="isSave">${i ? t('save') : t('create')}</button>
    </div>`);
  if (i) $('#isToggle').onclick = async () => {
    try {
      const d = await api('/issues/' + i.id, { method: 'PUT', body: { closed: !i.closed } });
      Object.assign(i, d.item);
      closeModal(); toast(t('saved')); render();
    } catch (e) { toast(errMsg(e), 'err'); }
  };
  $('#isSave').onclick = guard('#isSave', async () => {
    const title = $('#is_title').value.trim();
    if (!title) { fieldError('#is_title', 'requiredTitle'); return; }
    const body = { title, kind: $('#is_kind').value, projectId: $('#is_project').value, note: $('#is_note').value, closed: i ? i.closed : false };
    try {
      if (i) { const d = await api('/issues/' + i.id, { method: 'PUT', body }); Object.assign(i, d.item); }
      else { const d = await api('/issues', { method: 'POST', body }); state.issues.unshift(d.item); }
      closeModal(); toast(t('saved')); render();
    } catch (e) { toast(errMsg(e), 'err'); }
  });
}
function deleteIssue(id) {
  confirmDialog(t('confirmDeleteTitle'), t('confirmDeleteIssueMsg'), async () => {
    const rb = optimisticRemove(state.issues, id);
    if (!rb) { closeModal(); return; }
    closeModal(); render();
    try { await api('/issues/' + id, { method: 'DELETE' }); toast(t('deleted')); }
    catch (e) { rb.restore(); toast(errMsg(e), 'err'); render(); }
  });
}
