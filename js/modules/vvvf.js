/* ================= VVVF FAULT CODES ================= */
var vvvfSel = { brand: 0, q: '', model: '', firmware: '' };
function renderVVVF() {
  const c = $('#content');
  const drive = VVVF_DB[vvvfSel.brand] || VVVF_DB[0];
  const q = norm(vvvfSel.q);
  let codes = drive.codes;
  if (q) codes = codes.filter(x => hay(x.code, x.meaning, (x.causes || []).join(' ')).includes(q));
  c.innerHTML = `
    <div class="safety-banner" style="background:var(--warn-soft);border-color:var(--warn);color:var(--warn)">
      <span style="font-size:18px">⚠️</span><span>${t('vvvfWarn')}</span>
    </div>
    <div class="toolbar">
      <div class="search">${IC.search}<input id="vvvfSearch" placeholder="${t('vvvfSearch')}" value="${esc(vvvfSel.q)}" /></div>
      <div class="chip-row">
        ${VVVF_DB.map((d, i) => `<button class="chip ${vvvfSel.brand === i ? 'active' : ''}" data-b="${i}">${esc(d.brand)}</button>`).join('')}
      </div>
    </div>
    <div class="form-grid" style="margin-bottom:12px">
      <div class="field"><label>MANUFACTURER / MODEL</label><input id="vvvfModel" value="${esc(vvvfSel.model)}" placeholder="${LANG === 'fa' ? 'مدل دقیق دستگاه لازم است' : 'Exact device model required'}" /></div>
      <div class="field"><label>VERSION / FIRMWARE</label><input id="vvvfFirmware" value="${esc(vvvfSel.firmware)}" /></div>
    </div>
    <p style="font-size:12.5px;color:var(--text-3);margin-bottom:8px">📟 ${esc(drive.brand)} — ${esc(drive.model)} · <b>MODEL-DEPENDENT</b></p>
    ${!vvvfSel.model ? `<div class="note-block" style="margin-bottom:12px">⚠️ ${LANG === 'fa' ? 'مدل دستگاه لازم است. این جدول فقط الگوی جست‌وجو است و معنی کد/ترمینال/پارامتر را تأیید نمی‌کند.' : 'The device model is required. This table is a search pattern and does not verify code, terminal or parameter meanings.'}</div>` : ''}
    ${codes.length ? codes.map((x, i) => `
      <div class="diag-item" id="vv_${i}">
        <button class="diag-q" onclick="document.getElementById('vv_${i}').classList.toggle('open')">
          <span class="badge b-red" style="direction:ltr;font-family:monospace">${esc(x.code)}</span>
          <span>${esc(x.meaning)}</span>
          ${IC.chev}
        </button>
        <div class="diag-a">
          <h5>🔎 ${t('vvvfCauses')}</h5>
          <ul>${x.causes.map(y => `<li>${esc(y)}</li>`).join('')}</ul>
          <h5>🛠️ ${t('vvvfChecks')}</h5>
          <ul>${x.checks.map((y, j) => `<li><b>${faNum(j + 1)}.</b> ${esc(y)}</li>`).join('')}</ul>
          ${x.meas && x.meas.length ? `<h5>📐 ${t('vvvfMeas')}</h5>
          <div style="display:flex;flex-wrap:wrap;gap:6px">${x.meas.map(mid => { const mf = MEASURE_FIELDS.find(f => f.id === mid); return mf ? `<span class="badge b-blue">${esc(mf.fa)} (${mf.unit})</span>` : ''; }).join('')}</div>` : ''}
        </div>
      </div>`).join('')
    : `<div class="empty"><div class="e-icon">🔍</div><strong>${t('notFound')}</strong><p>${t('notFoundSub')}</p></div>`}`;
  $('#vvvfSearch').oninput = debounce(e => { vvvfSel.q = e.target.value; renderVVVF(); }, 250);
  $('#vvvfModel').onchange = e => { vvvfSel.model = e.target.value.trim(); renderVVVF(); };
  $('#vvvfFirmware').onchange = e => { vvvfSel.firmware = e.target.value.trim(); renderVVVF(); };
  $$('#content .chip[data-b]').forEach(ch => ch.onclick = () => { vvvfSel.brand = +ch.dataset.b; vvvfSel.q = ''; vvvfSel.model = ''; vvvfSel.firmware = ''; renderVVVF(); });
}
