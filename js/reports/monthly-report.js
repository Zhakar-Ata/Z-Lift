/* ================= MONTHLY REPORT ================= */
var mrMonth = null; // {jy, jm}
function renderMonthlyReport() {
  if (!mrMonth) { const j = tsToJalali(Date.now()); mrMonth = { jy: j.jy, jm: j.jm }; }
  const c = $('#content');
  const { jy, jm } = mrMonth;
  const { from, to } = jalMonthRange(jy, jm);
  const inMonth = ts => ts >= from && ts < to;

  const svcs = state.services.filter(s => inMonth(s.date));
  const byType = {};
  svcs.forEach(s => { byType[s.serviceType] = (byType[s.serviceType] || 0) + 1; });
  // fault words (shared keyword list — see FAULT_WORDS)
  const topFaults = faultTally(svcs).slice(0, 6);
  // money
  let invIncome = 0, ctIncome = 0, openBalance = 0;
  state.invoices.forEach(inv => {
    (inv.payments || []).forEach(p => { if (inMonth(p.date)) invIncome += +p.amount || 0; });
    openBalance += invTotals(inv).balance;
  });
  const monthKey = jy + '-' + jm;
  state.contracts.forEach(ct => {
    if (ct.paid && ct.paid[monthKey]) ctIncome += +ct.amount || 0;
  });
  // parts consumed
  const partsUsed = [];
  state.parts.forEach(p => (p.history || []).forEach(h => { if (inMonth(h.date)) partsUsed.push({ name: p.name, qty: h.qty, unit: p.unit }); }));
  const newProjects = state.projects.filter(p => inMonth(p.createdAt)).length;
  const openIss = state.issues.filter(i => !i.closed).length;
  const hasData = svcs.length || invIncome || ctIncome || partsUsed.length || newProjects;

  const prevM = () => { mrMonth.jm--; if (mrMonth.jm < 1) { mrMonth.jm = 12; mrMonth.jy--; } renderMonthlyReport(); };
  const nextM = () => { mrMonth.jm++; if (mrMonth.jm > 12) { mrMonth.jm = 1; mrMonth.jy++; } renderMonthlyReport(); };
  window._mrPrev = prevM; window._mrNext = nextM;

  c.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <button class="icon-btn" onclick="_mrPrev()" aria-label="${t('prevMonth')}" title="${t('prevMonth')}">${navArrows().prev}</button>
        <strong style="font-size:16.5px">📈 ${jalMonth(jm)} ${faNum(jy)}</strong>
        <button class="icon-btn" onclick="_mrNext()" aria-label="${t('nextMonth')}" title="${t('nextMonth')}">${navArrows().next}</button>
      </div>
    </div>
    ${!hasData ? `<div class="empty"><div class="e-icon">📭</div><strong>${t('mrEmpty')}</strong></div>` : `
    <div class="grid-4">
      ${statCard('🔧', 'var(--teal-soft)', svcs.length, 'mrServices')}
      ${statCard('💰', 'var(--ok-soft)', money(invIncome), 'mrIncome')}
      ${statCard('📄', 'var(--accent-soft)', money(ctIncome), 'mrContracts')}
      ${statCard('🧾', 'var(--danger-soft)', money(openBalance), 'mrOpenBalance')}
    </div>
    <div class="grid-2" style="margin-top:16px">
      <div class="card">
        <div class="card-title">🔧 ${t('mrByType')}</div>
        ${Object.keys(byType).length ? Object.keys(byType).map(k => `
          <div class="sb-row" style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
            <span style="font-size:12.5px;color:var(--text-2);flex:1">${svcMeta(k).icon} ${t(svcMeta(k).key)}</span>
            <span class="badge b-blue">${faNum(byType[k])}</span>
          </div>`).join('') : `<p style="font-size:12.5px;color:var(--text-3)">—</p>`}
        ${newProjects ? `<div class="sb-row" style="display:flex;align-items:center;gap:10px"><span style="font-size:12.5px;color:var(--text-2);flex:1">🏗️ ${t('mrNewProjects')}</span><span class="badge b-purple">${faNum(newProjects)}</span></div>` : ''}
      </div>
      <div class="card">
        <div class="card-title">🚨 ${t('mrTopFaults')}</div>
        ${topFaults.length ? `<div class="status-bars">${topFaults.map(([lbl, n]) => `
          <div class="sb-row"><span class="sb-lbl">${esc(lbl)}</span>
          <div class="sb-track"><div class="sb-fill" style="width:${Math.round(n / topFaults[0][1] * 100)}%;background:var(--warn)"></div></div>
          <span class="sb-val">${faNum(n)}</span></div>`).join('')}</div>` : `<p style="font-size:12.5px;color:var(--text-3)">—</p>`}
      </div>
    </div>
    ${partsUsed.length ? `<div class="card" style="margin-top:16px">
      <div class="card-title">📦 ${t('mrPartsUsed')} (${faNum(partsUsed.length)})</div>
      <div style="display:flex;flex-wrap:wrap;gap:7px">${partsUsed.slice(0, 20).map(x => `<span class="badge b-gray">${esc(x.name)} ×${faNum(x.qty)}</span>`).join('')}</div>
    </div>` : ''}
    <div style="display:flex;gap:9px;margin-top:18px;flex-wrap:wrap">
      <button class="btn btn-primary" onclick="printMonthlyReport()">${IC.print} ${t('mrPrint')}</button>
      <button class="btn btn-ghost" onclick="shareText(buildMonthlyText())">📤 ${t('share')}</button>
      <button class="btn btn-ghost" style="color:#2AABEE" onclick="shareTelegram(buildMonthlyText())">${IC.telegram} ${t('shareTelegram')}</button>
    </div>`}`;
}
function buildMonthlyText() {
  const { jy, jm } = mrMonth;
  const { from, to } = jalMonthRange(jy, jm);
  const inMonth = ts => ts >= from && ts < to;
  const svcs = state.services.filter(s => inMonth(s.date));
  let invIncome = 0;
  state.invoices.forEach(inv => (inv.payments || []).forEach(p => { if (inMonth(p.date)) invIncome += +p.amount || 0; }));
  let ctIncome = 0;
  const mk = jy + '-' + jm;
  state.contracts.forEach(ct => { if (ct.paid && ct.paid[mk]) ctIncome += +ct.amount || 0; });
  const co = (state.settings || {}).company || 'Z Lift';
  return `📈 ${t('mrTitle')} — ${jalMonth(jm)} ${faNum(jy)}\n🏢 ${co}\n\n🔧 ${t('mrServices')}: ${faNum(svcs.length)}\n💰 ${t('mrIncome')}: ${money(invIncome)} ${t('rial')}\n📄 ${t('mrContracts')}: ${money(ctIncome)} ${t('rial')}\n\n🛗 Z Lift`;
}
function printMonthlyReport() {
  const { jy, jm } = mrMonth;
  const { from, to } = jalMonthRange(jy, jm);
  const inMonth = ts => ts >= from && ts < to;
  const svcs = state.services.filter(s => inMonth(s.date));
  let invIncome = 0, ctIncome = 0;
  state.invoices.forEach(inv => (inv.payments || []).forEach(p => { if (inMonth(p.date)) invIncome += +p.amount || 0; }));
  const mk = jy + '-' + jm;
  state.contracts.forEach(ct => { if (ct.paid && ct.paid[mk]) ctIncome += +ct.amount || 0; });
  const partsUsed = [];
  state.parts.forEach(p => (p.history || []).forEach(h => { if (inMonth(h.date)) partsUsed.push({ name: p.name, qty: h.qty }); }));
  printDoc(`
    ${printHeader(t('mrTitle') + ' — ' + jalMonth(jm) + ' ' + faNum(jy))}
    <table>
      <tr><th>${t('mrServices')}</th><td>${faNum(svcs.length)}</td></tr>
      <tr><th>${t('mrIncome')}</th><td>${money(invIncome)} ${t('rial')}</td></tr>
      <tr><th>${t('mrContracts')}</th><td>${money(ctIncome)} ${t('rial')}</td></tr>
      <tr><th>${t('mrPartsUsed')}</th><td>${partsUsed.length ? partsUsed.map(x => esc(x.name) + ' ×' + faNum(x.qty)).join('، ') : '—'}</td></tr>
    </table>
    <table>
      <tr><th style="width:90px">${t('svcDate')}</th><th>${t('svcCustomer')}</th><th>${t('svcProblem')}</th><th style="width:80px">${t('svcFinal')}</th></tr>
      ${svcs.map(s => `<tr><td>${fmtJalali(s.date)}</td><td>${esc(svcTarget(s))}</td><td>${esc(s.problem || s.complaint || '—')}</td><td>${t(finalMeta(s.finalStatus).key)}</td></tr>`).join('')}
    </table>
    <div class="sig-row"><div class="sig">${t('signTech')}</div></div>`);
}
