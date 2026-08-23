/* ================= PARTS INVENTORY ================= */
var partFilter = { q: '', low: false };
function renderParts() {
  const c = $('#content');
  const lowCount = state.parts.filter(x => x.qty <= x.minQty).length;
  const stockValue = state.parts.reduce((a, x) => a + (+x.price || 0) * (+x.qty || 0), 0);
  c.innerHTML = `
    <div class="grid-3" style="margin-bottom:16px">
      <div class="card stat-card"><div class="stat-icon" style="background:var(--accent-soft);font-size:21px">📦</div>
        <div class="stat-body"><div class="stat-value" style="font-size:18px">${faNum(state.parts.length)}</div><div class="stat-label">${t('stockItems')}</div></div></div>
      <div class="card stat-card"><div class="stat-icon" style="background:var(--ok-soft);font-size:21px">💰</div>
        <div class="stat-body"><div class="stat-value" style="font-size:18px">${money(stockValue)} <span style="font-size:11px;color:var(--text-3)">${t('rial')}</span></div><div class="stat-label">${t('stockValue')}</div></div></div>
      <div class="card stat-card"><div class="stat-icon" style="background:${lowCount ? 'var(--danger-soft)' : 'var(--ok-soft)'};font-size:21px">${lowCount ? '⚠️' : '✅'}</div>
        <div class="stat-body"><div class="stat-value" style="font-size:18px">${faNum(lowCount)}</div><div class="stat-label">${t('lowStock')}</div></div></div>
    </div>
    <div class="toolbar">
      <div class="search">${IC.search}<input id="partSearch" placeholder="${t('searchParts')}" value="${esc(partFilter.q)}" /></div>
      <div class="chip-row">
        <button class="chip ${!partFilter.low ? 'active' : ''}" data-low="0">${t('all')}</button>
        <button class="chip ${partFilter.low ? 'active' : ''}" data-low="1">⚠️ ${t('lowStockOnly')} ${lowCount ? '(' + faNum(lowCount) + ')' : ''}</button>
      </div>
      <button class="btn btn-ghost" onclick="exportPartsCsv()">📊 ${t('exportCsv')}</button>
      <button class="btn btn-primary" onclick="openPartForm()">${IC.plus} ${t('newPart')}</button>
    </div>
    <div class="card" style="padding:6px 6px 2px"><div class="table-wrap" id="partList"></div></div>`;
  $('#partSearch').oninput = debounce(e => { partFilter.q = e.target.value; drawParts(); }, 200);
  $$('#content .toolbar .chip[data-low]').forEach(ch => ch.onclick = () => { partFilter.low = ch.dataset.low === '1'; renderParts(); });
  drawParts();
}
function drawParts() {
  if (!$('#partList')) return;
  const q = norm(partFilter.q);
  let list = state.parts;
  if (partFilter.low) list = list.filter(x => x.qty <= x.minQty);
  if (q) list = list.filter(x => hay(x.name, x.category, x.location, x.note, x.unit, x.supplier, x.code).includes(q));
  const el = $('#partList');
  if (!state.parts.length) {
    el.innerHTML = `<div class="empty"><div class="e-icon">📦</div><strong>${t('noParts')}</strong><p>${t('noPartsSub')}</p><button class="btn btn-primary" onclick="openPartForm()">${IC.plus} ${t('newPart')}</button></div>`;
    return;
  }
  if (!list.length) {
    el.innerHTML = `<div class="empty"><div class="e-icon">🔍</div><strong>${t('notFound')}</strong><p>${t('notFoundSub')}</p></div>`;
    return;
  }
  el.innerHTML = `<table class="parts-table">
    <thead><tr>
      <th>${t('partName')}</th><th class="hide-sm">${t('partCategory')}</th>
      <th>${t('partQty')}</th><th class="hide-sm">${t('partLocation')}</th>
      <th class="hide-sm">${t('partPrice')}</th><th></th>
    </tr></thead>
    <tbody>${list.map(x => {
      const isLow = x.qty <= x.minQty;
      return `<tr onclick="openPartForm('${x.id}')">
        <td><span class="p-name">${esc(x.name)}</span>${x.note ? `<div class="p-sub">${esc(x.note)}</div>` : ''}</td>
        <td class="hide-sm"><span class="badge b-gray">${esc(x.category)}</span></td>
        <td><span class="qty-pill"><span class="qty-dot" style="background:${isLow ? 'var(--danger)' : 'var(--ok)'}"></span>${faNum(x.qty)} ${esc(x.unit)}</span>
          ${isLow ? `<div class="p-sub" style="color:var(--danger)">${t('lowStock')} (min ${faNum(x.minQty)})</div>` : ''}</td>
        <td class="hide-sm">${esc(x.location || '—')}</td>
        <td class="hide-sm" style="direction:ltr;text-align:end">${x.price ? faNum(x.price.toLocaleString('en-US')) : '—'}</td>
        <td><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openConsumeForm('${x.id}')">📉 ${t('consume')}</button></td>
      </tr>`;
    }).join('')}</tbody></table>`;
}
function exportPartsCsv() {
  const head = [t('partName'), t('partCategory'), t('partUnit'), t('partQty'), t('partMin'), t('partPrice'), t('partSupplier'), t('partCode'), t('partLocation'), t('partNote')];
  const rows = state.parts.map(x => [x.name, x.category, x.unit, x.qty, x.minQty, x.price, x.supplier, x.code, x.location, x.note]);
  downloadCsv('zlift-parts-' + new Date().toISOString().slice(0, 10) + '.csv', head, rows);
  toast(t('saved'));
}
function openPartForm(id) {
  const x = id ? state.parts.find(p => p.id === id) : null;
  const v = x || { name: '', category: 'عمومی', unit: 'عدد', qty: 0, minQty: 0, price: 0, location: '', note: '' };
  openModal(`
    <div class="modal-head"><h3>${x ? '✏️ ' + t('editPart') : '📦 ' + t('newPart')}</h3><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <div class="modal-body"><form class="form-grid">
      <div class="field span2"><label>${t('partName')} *</label><input id="p_name" value="${esc(v.name)}" /></div>
      <div class="field"><label>${t('partCategory')}</label><input id="p_cat" value="${esc(v.category)}" list="catList" />
        <datalist id="catList"><option>الکتریکال</option><option>مکانیکال</option><option>هیدرولیک</option><option>درب</option><option>مصرفی</option><option>عمومی</option></datalist></div>
      <div class="field"><label>${t('partUnit')}</label><input id="p_unit" value="${esc(v.unit)}" /></div>
      <div class="field"><label>${t('partQty')}</label><input id="p_qty" type="number" min="0" value="${v.qty}" /></div>
      <div class="field"><label>${t('partMin')}</label><input id="p_min" type="number" min="0" value="${v.minQty}" /></div>
      <div class="field"><label>${t('partPrice')}</label><input id="p_price" type="number" min="0" value="${v.price}" /></div>
      <div class="field"><label>${t('partLocation')}</label><input id="p_loc" value="${esc(v.location)}" /></div>
      <div class="field"><label>${t('partSupplier')}</label><input id="p_supplier" value="${esc(v.supplier || '')}" /></div>
      <div class="field"><label>${t('partCode')}</label><input id="p_code" value="${esc(v.code || '')}" style="direction:ltr" /></div>
      <div class="field span2"><label>${t('partNote')}</label><input id="p_note" value="${esc(v.note)}" /></div>
    </form></div>
    <div class="modal-foot">
      ${x ? `<button class="btn btn-soft-danger" onclick="deletePart('${x.id}')">${IC.trash} ${t('delete')}</button>` : ''}
      <button class="btn btn-ghost" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-primary" id="partSave">${x ? t('save') : t('create')}</button>
    </div>`);
  $('#partSave').onclick = async () => {
    const name = $('#p_name').value.trim();
    if (!name) { fieldError('#p_name', 'requiredTitle'); return; }
    const body = {
      name, category: $('#p_cat').value, unit: $('#p_unit').value,
      qty: +$('#p_qty').value, minQty: +$('#p_min').value, price: +$('#p_price').value,
      location: $('#p_loc').value, note: $('#p_note').value,
      supplier: $('#p_supplier').value, code: $('#p_code').value
    };
    const btn = $('#partSave'); btn.disabled = true;
    try {
      if (x) {
        const d = await api('/parts/' + x.id, { method: 'PUT', body });
        Object.assign(x, d.part);
        toast(t('saved'));
      } else {
        const d = await api('/parts', { method: 'POST', body });
        state.parts.push(d.part);
        toast(t('created'));
      }
      closeModal(); drawParts();
    } catch (e) { toast(errMsg(e), 'err'); btn.disabled = false; }
  };
}
function deletePart(id) {
  confirmDialog(t('confirmDeleteTitle'), t('confirmDeletePartMsg'), async () => {
    const rb = optimisticRemove(state.parts, id);
    if (!rb) { closeModal(); return; }
    closeModal(); drawParts();
    try { await api('/parts/' + id, { method: 'DELETE' }); toast(t('deleted')); }
    catch (e) { rb.restore(); toast(errMsg(e), 'err'); drawParts(); }
  });
}
