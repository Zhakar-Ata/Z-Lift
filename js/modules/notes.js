/* ================= NOTES ================= */
var noteQuery = '';
function renderNotes() {
  const c = $('#content');
  c.innerHTML = `
    <div class="toolbar">
      <div class="search">${IC.search}<input id="noteSearch" placeholder="${t('searchNotes')}" value="${esc(noteQuery)}" /></div>
      <button class="btn btn-primary" onclick="openNoteForm()">${IC.plus} ${t('newNote')}</button>
    </div>
    <div id="noteList" class="grid-2"></div>`;
  $('#noteSearch').oninput = debounce(e => { noteQuery = e.target.value; drawNotes(); }, 200);
  drawNotes();
}
function drawNotes() {
  const q = norm(noteQuery);
  let list = state.notes;
  if (q) list = list.filter(n => hay(n.title, n.content, (n.tags || []).join(' ')).includes(q));
  const el = $('#noteList');
  if (!state.notes.length) {
    el.innerHTML = `<div class="empty"><div class="e-icon">📝</div><strong>${t('noNotes')}</strong><p>${t('noNotesSub')}</p><button class="btn btn-primary" onclick="openNoteForm()">${IC.plus} ${t('newNote')}</button></div>`;
    return;
  }
  if (!list.length) {
    el.innerHTML = `<div class="empty"><div class="e-icon">🔍</div><strong>${t('notFound')}</strong><p>${t('notFoundSub')}</p></div>`;
    return;
  }
  el.innerHTML = list.map(n => `
    <div class="card kb-card" onclick="openNoteForm('${n.id}')">
      <h4>📝 ${esc(n.title)}</h4>
      <p>${esc(n.content)}</p>
      <div class="kb-tags">
        ${n.tags.map(tg => `<span class="badge b-blue">#${esc(tg)}</span>`).join('')}
        <span class="badge b-gray">${fmtDate(n.createdAt)}</span>
      </div>
    </div>`).join('');
}
function openNoteForm(id) {
  const n = id ? state.notes.find(x => x.id === id) : null;
  const v = n || { title: '', content: '', tags: [] };
  openModal(`
    <div class="modal-head"><h3>${n ? '✏️ ' + t('editNote') : '📝 ' + t('newNote')}</h3><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="field"><label>${t('noteTitle')} *</label><input id="n_title" value="${esc(v.title)}" /></div>
      <div class="field"><label>${t('noteContent')}</label><textarea id="n_content" style="min-height:140px">${esc(v.content)}</textarea></div>
      <div class="field"><label>${t('noteTags')}</label><input id="n_tags" value="${esc(v.tags.join('، '))}" /></div>
    </div>
    <div class="modal-foot">
      ${n ? `<button class="btn btn-soft-danger" onclick="deleteNote('${n.id}')">${IC.trash} ${t('delete')}</button>` : ''}
      <button class="btn btn-ghost" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-primary" id="noteSave">${n ? t('save') : t('create')}</button>
    </div>`);
  $('#noteSave').onclick = async () => {
    const title = $('#n_title').value.trim();
    if (!title) { fieldError('#n_title', 'requiredTitle'); return; }
    const body = {
      title, content: $('#n_content').value,
      tags: $('#n_tags').value.split(/[,،]/).map(x => x.trim()).filter(Boolean)
    };
    const btn = $('#noteSave'); btn.disabled = true;
    try {
      if (n) {
        const d = await api('/notes/' + n.id, { method: 'PUT', body });
        Object.assign(n, d.note);
        toast(t('saved'));
      } else {
        const d = await api('/notes', { method: 'POST', body });
        state.notes.unshift(d.note);
        toast(t('created'));
      }
      closeModal(); drawNotes();
    } catch (e) { toast(errMsg(e), 'err'); btn.disabled = false; }
  };
}
function deleteNote(id) {
  confirmDialog(t('confirmDeleteTitle'), t('confirmDeleteNoteMsg'), async () => {
    const rb = optimisticRemove(state.notes, id);
    if (!rb) { closeModal(); return; }
    closeModal(); drawNotes();
    try { await api('/notes/' + id, { method: 'DELETE' }); toast(t('deleted')); }
    catch (e) { rb.restore(); toast(errMsg(e), 'err'); drawNotes(); }
  });
}

