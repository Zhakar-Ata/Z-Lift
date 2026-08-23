/* ================= TECHNICIAN TOOLS ================= */
function renderToolsPage() {
  const c = $('#content');
  const mine = state.tools;
  const suggestions = TOOL_SUGGESTIONS.filter(s => !mine.find(m => m.name === s));
  c.innerHTML = `
    <div class="toolbar">
      <div style="flex:1"></div>
      <button class="btn btn-primary" onclick="openToolForm()">${IC.plus} ${t('newTool')}</button>
    </div>
    ${mine.length ? `<div class="grid-2">${mine.map(x => `
      <div class="card kb-card" onclick="openToolForm('${x.id}')">
        <h4>🧰 ${esc(x.name)}</h4>
        ${x.note ? `<p>${esc(x.note)}</p>` : ''}
      </div>`).join('')}</div>`
    : `<div class="empty"><div class="e-icon">🧰</div><strong>${t('noTools')}</strong></div>`}
    ${suggestions.length ? `<div class="section-title"><h3>💡 ${t('toolSuggest')}</h3></div>
    <div style="display:flex;flex-wrap:wrap;gap:8px">
      ${suggestions.map(s => `<button class="chip" onclick="quickAddTool('${jsAttr(s)}')">${IC.plus} ${esc(s)}</button>`).join('')}
    </div>` : ''}`;
}
async function quickAddTool(name) {
  try {
    const d = await api('/tools', { method: 'POST', body: { name, note: '' } });
    state.tools.unshift(d.item);
    toast(t('created')); renderToolsPage();
  } catch (e) { toast(errMsg(e), 'err'); }
}
function openToolForm(id) {
  const x = id ? state.tools.find(y => y.id === id) : null;
  const v = x || { name: '', note: '' };
  openModal(`
    <div class="modal-head"><h3>🧰 ${x ? t('edit') : t('newTool')}</h3><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="field"><label>${t('toolName')} *</label><input id="tl_name" value="${esc(v.name)}" /></div>
      <div class="field"><label>${t('toolNote')}</label><input id="tl_note" value="${esc(v.note || '')}" /></div>
    </div>
    <div class="modal-foot">
      ${x ? `<button class="btn btn-soft-danger" id="tlDel">${IC.trash}</button>` : ''}
      <button class="btn btn-ghost" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-primary" id="tlSave">${x ? t('save') : t('create')}</button>
    </div>`, { size: 'sm' });
  if (x) $('#tlDel').onclick = () => confirmDialog(t('confirmDeleteTitle'), t('confirmDeleteToolMsg'), async () => {
    state.tools = state.tools.filter(y => y.id !== x.id);
    closeModal(); renderToolsPage();
    try { await api('/tools/' + x.id, { method: 'DELETE' }); toast(t('deleted')); } catch (e) { toast(errMsg(e), 'err'); }
  });
  $('#tlSave').onclick = guard('#tlSave', async () => {
    const name = $('#tl_name').value.trim();
    if (!name) { fieldError('#tl_name', 'requiredTitle'); return; }
    try {
      if (x) { const d = await api('/tools/' + x.id, { method: 'PUT', body: { name, note: $('#tl_note').value } }); Object.assign(x, d.item); }
      else { const d = await api('/tools', { method: 'POST', body: { name, note: $('#tl_note').value } }); state.tools.unshift(d.item); }
      closeModal(); toast(t('saved')); renderToolsPage();
    } catch (e) { toast(errMsg(e), 'err'); }
  });
}
