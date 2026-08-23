/* ================= CALCULATIONS ================= */
function computeCalc(cal) {
  const out = cal && $('#calcResult_' + cal.id);
  if (!cal || !out) return;                       // card not on screen — nothing to do
  const vals = {}, missing = [];
  cal.inputs.forEach(inp => {
    const el = $(`#calc_${cal.id}_${inp.id}`);
    const raw = el ? el.value : (inp.value != null ? inp.value : '');
    const parsed = parseNum(raw);
    if (parsed == null) missing.push(inp.label[LANG] || inp.label.fa || inp.id);
    else vals[inp.id] = parsed;
  });
  if (missing.length) {
    out.innerHTML = `<div class="error-box" style="padding:10px;margin-top:10px">⚠️ ${LANG === 'fa' ? 'ورودی‌های لازم را وارد کنید' : 'Enter the required inputs'}: ${esc(missing.join('، '))}</div>`;
    return;
  }
  try {
    const rows = cal.compute(vals);
    if (!Array.isArray(rows) || rows.some(r => !r || !r.label || r.val == null || /(?:NaN|Infinity)/.test(String(r.val)))) throw new Error('invalid-calculation');
    const inputLine = cal.inputs.map(inp => `${inp.id}=${vals[inp.id]}${inp.unit ? ' ' + inp.unit : ''}`).join(' · ');
    out.innerHTML = `<div class="calc-result">
      <div class="r-row"><span class="r-label">INPUTS</span><span class="r-val" style="font-size:12px">${esc(inputLine)}</span></div>
      <div class="r-row"><span class="r-label">FORMULA</span><span class="r-val" style="font-size:12px">${esc(cal.formula)}</span></div>
      <div class="r-row"><span class="r-label">CALCULATION</span><span class="r-val" style="font-size:12px">${esc(cal.formula + ' | ' + inputLine)}</span></div>
      ${rows.map(r => `<div class="r-row"><span class="r-label">RESULT · ${esc(r.label[LANG] || r.label.fa || r.label)}</span><span class="r-val">${esc(r.val)}</span></div>`).join('')}
      <div class="r-row"><span class="r-label">STATUS</span><span class="r-val" style="font-size:12px;color:var(--warn)">${esc(cal.resultClass)} · ENGINEERING VERIFICATION REQUIRED</span></div>
    </div>`;
  } catch (e) {
    out.innerHTML = `<div class="error-box" style="padding:10px;margin-top:10px">⚠️ ${LANG === 'fa' ? 'محاسبه با این ورودی‌ها معتبر نیست؛ ورودی‌ها و محدودیت‌ها را بررسی کنید.' : 'The calculation is invalid for these inputs; check inputs and limitations.'}</div>`;
  }
}
var calcFilter = { cat: 'all', q: '' };
function converterHTML() {
  return `<div class="card" style="margin-bottom:16px">
    <div class="card-title">⚡ ${t('converters')}</div>
    <div class="form-grid">
      ${CONVERTERS.map(cv => `
        <div class="field" style="margin-bottom:8px">
          <label>${esc(cv.fa)}</label>
          <div style="display:flex;gap:7px;align-items:center;direction:ltr">
            <input type="number" step="any" id="cva_${cv.id}" placeholder="${cv.a}" style="flex:1;background:var(--bg-soft);border:1.5px solid var(--border);border-radius:10px;padding:9px 10px;outline:none" />
            <span style="color:var(--text-3)">⇄</span>
            <input type="number" step="any" id="cvb_${cv.id}" placeholder="${cv.b}" style="flex:1;background:var(--bg-soft);border:1.5px solid var(--border);border-radius:10px;padding:9px 10px;outline:none" />
          </div>
        </div>`).join('')}
    </div>
  </div>`;
}
function wireConverters() {
  CONVERTERS.forEach(cv => {
    const a = $('#cva_' + cv.id), b = $('#cvb_' + cv.id);
    if (!a || !b) return;
    a.oninput = () => { b.value = a.value === '' ? '' : +cv.f(parseFloat(a.value) || 0).toFixed(4); };
    b.oninput = () => { a.value = b.value === '' ? '' : +cv.g(parseFloat(b.value) || 0).toFixed(4); };
  });
}
function renderCalculations() {
  const c = $('#content');
  const q = norm(calcFilter.q);
  let list = CALCULATORS;
  if (calcFilter.cat !== 'all' && calcFilter.cat !== 'quick') list = list.filter(x => x.cat === calcFilter.cat);
  if (q) list = list.filter(x => hay(x.title.fa, x.title.en, x.desc.fa, x.desc.en, x.formula).includes(q));
  const showConv = calcFilter.cat === 'all' || calcFilter.cat === 'quick';
  const showCalcs = calcFilter.cat !== 'quick';
  c.innerHTML = `
    <div class="safety-banner" style="background:var(--accent-soft);border-color:var(--accent-2);color:var(--accent-2)">
      <span style="font-size:18px">🧮</span><span>${esc(CALC_GUIDE[LANG] || CALC_GUIDE.fa)}</span>
    </div>
    <div class="toolbar">
      <div class="search">${IC.search}<input id="calcSearch" placeholder="${t('searchCalc')}" value="${esc(calcFilter.q)}" /></div>
      <div class="chip-row">
        ${CALC_CATS.map(ct => `<button class="chip ${calcFilter.cat === ct.id ? 'active' : ''}" data-cc="${ct.id}">${esc(ct[LANG] || ct.fa)}</button>`).join('')}
      </div>
    </div>
    ${showConv ? converterHTML() : ''}
    ${showCalcs && !list.length && q ? `<div class="empty"><div class="e-icon">🔍</div><strong>${t('notFound')}</strong></div>` : ''}
    <div class="grid-2">
    ${(showCalcs ? list : []).map(cal => `
      <div class="card">
        <div class="card-title">${esc(cal.title[LANG] || cal.title.fa)}</div>
        <p style="font-size:12.8px;color:var(--text-2);margin-bottom:10px">${esc(cal.desc[LANG] || cal.desc.fa)}</p>
        <div class="formula">${esc(cal.formula)}</div>
        <div class="form-grid">
          ${cal.inputs.map(inp => `
            <div class="field"><label>${esc(inp.label[LANG] || inp.label.fa)}${inp.unit ? ` <span style="color:var(--text-3);direction:ltr;display:inline-block">(${inp.unit})</span>` : ''}</label>
            <input type="number" step="${inp.step || 'any'}" id="calc_${cal.id}_${inp.id}" value="${inp.value != null ? inp.value : ''}" data-calc-input="${cal.id}" required /></div>`).join('')}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" data-calc="${cal.id}">🟰 ${t('calculate')}</button>
          <button class="btn btn-ghost btn-sm" onclick="openCalcSaveForm('${cal.id}')">💾 ${t('calcSave')}</button>
        </div>
        <div id="calcResult_${cal.id}"></div>
        ${cal.assume ? `<p class="calc-note">📌 <b>${t('calcAssume')} / ASSUMPTIONS:</b> ${esc(cal.assume[LANG] || cal.assume.fa)}</p>` : ''}
        <p class="calc-note">⚠️ <b>LIMITATIONS:</b> ${esc((cal.limit && (cal.limit[LANG] || cal.limit.fa)) || (cal.note && (cal.note[LANG] || cal.note.fa)) || '—')}</p>
        <p class="calc-note">📖 <b>REFERENCE / PROVENANCE (${esc(cal.verificationStatus)}):</b> ${esc(cal.reference[LANG] || cal.reference.fa)}</p>
      </div>`).join('')}
    </div>`;
  $$('[data-calc]').forEach(btn => {
    const cal = CALCULATORS.find(x => x.id === btn.dataset.calc);
    btn.onclick = () => computeCalc(cal);
    computeCalc(cal); // initial
  });
  // live recompute on input change
  $$('input[data-calc-input]').forEach(inp => {
    inp.oninput = debounce(() => {
      const cal = CALCULATORS.find(x => x.id === inp.dataset.calcInput);
      if (cal) computeCalc(cal);
    }, 300);
  });
  $('#calcSearch').oninput = debounce(e => { calcFilter.q = e.target.value; renderCalculations(); }, 300);
  $$('#content .chip[data-cc]').forEach(ch => ch.onclick = () => { calcFilter.cat = ch.dataset.cc; renderCalculations(); });
  wireConverters();
}
