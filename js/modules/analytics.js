/* ================= ANALYTICS & INSIGHTS (v25) ================= */
/* A bird's-eye view of the business over a selectable window (3 / 6 / 12 months).
   Everything is derived from existing collections — no new storage. */
var anPeriod = +localStorage.getItem('zlift_anperiod') || 12;
function anSetPeriod(n) { anPeriod = n; localStorage.setItem('zlift_anperiod', String(n)); renderAnalytics(); }
/* trailing Jalali month buckets, oldest -> newest */
function anBuckets(n) {
  const out = [];
  const now = tsToJalali(Date.now());
  let jy = now.jy, jm = now.jm;
  const keys = [];
  for (let i = 0; i < n; i++) { keys.push({ jy, jm }); jm--; if (jm < 1) { jm = 12; jy--; } }
  keys.reverse().forEach(({ jy, jm }) => {
    const { from, to } = jalMonthRange(jy, jm);
    out.push({ jy, jm, key: jy + '-' + jm, from, to });
  });
  return out;
}
/* compact axis label so 12 columns still fit a phone */
function anMonthShort(jm) { const m = jalMonth(jm); return m.length > 4 ? m.slice(0, 3) : m; }
/* horizontal bar chart from per-bucket values (scrolls on narrow screens) */
function anBarChart(buckets, values, bg) {
  const max = Math.max(1, ...values.map(v => +v || 0));
  const cols = buckets.map((b, i) => {
    const v = +values[i] || 0;
    return `<div class="chart-col">
      <span class="bar-num">${v ? faNum(v) : ''}</span>
      <div class="bar-v" style="height:${Math.round(v / max * 100)}%;background:${bg || 'linear-gradient(180deg,var(--accent-2),var(--accent))'}"></div>
      <span class="bar-lbl">${anMonthShort(b.jm)}</span>
    </div>`;
  }).join('');
  return `<div style="overflow-x:auto"><div class="chart-bars" style="min-width:${buckets.length * 34}px">${cols}</div></div>`;
}
/* status-bars from [{label,value,color}] */
function anStatusBars(rows, def) {
  const max = Math.max(1, ...rows.map(r => +r.value || 0));
  return `<div class="status-bars">${rows.map(r => {
    const v = +r.value || 0; if (!v) return '';
    return `<div class="sb-row"><span class="sb-lbl">${r.label}</span>
      <div class="sb-track"><div class="sb-fill" style="width:${Math.round(v / max * 100)}%;background:${r.color || def || 'var(--accent)'}"></div></div>
      <span class="sb-val">${faNum(v)}</span></div>`;
  }).join('')}</div>`;
}
function svcColor(k) { return { maintenance: 'var(--teal)', repair: 'var(--accent-2)', emergency: 'var(--danger)', inspection: 'var(--purple)' }[k] || 'var(--accent)'; }
function anWindow() {
  const buckets = anBuckets(anPeriod);
  const from = buckets[0].from, to = buckets[buckets.length - 1].to;
  const inPeriod = ts => ts >= from && ts < to;
  const keySet = new Set(buckets.map(b => b.key));
  return { buckets, inPeriod, keySet };
}
function renderAnalytics() {
  const c = $('#content');
  const { buckets, inPeriod, keySet } = anWindow();
  const svcs = state.services.filter(s => inPeriod(s.date));
  const incomeByMonth = {}; buckets.forEach(b => incomeByMonth[b.key] = 0);
  const svcByMonth = {}; buckets.forEach(b => svcByMonth[b.key] = 0);
  let income = 0;
  state.invoices.forEach(inv => (inv.payments || []).forEach(p => {
    if (inPeriod(p.date)) { income += +p.amount || 0; const j = tsToJalali(p.date); const k = j.jy + '-' + j.jm; if (incomeByMonth[k] != null) incomeByMonth[k] += +p.amount || 0; }
  }));
  state.contracts.forEach(ct => (ctStats(ct).list || []).forEach(m => {
    if (keySet.has(m.key) && ct.paid && ct.paid[m.key]) { income += +ct.amount || 0; if (incomeByMonth[m.key] != null) incomeByMonth[m.key] += +ct.amount || 0; }
  }));
  svcs.forEach(s => { const j = tsToJalali(s.date); const k = j.jy + '-' + j.jm; if (svcByMonth[k] != null) svcByMonth[k]++; });
  let openBalance = 0, unpaidCount = 0;
  state.invoices.forEach(inv => { const b = invTotals(inv).balance; openBalance += b; if (b > 0) unpaidCount++; });
  const activeContracts = state.contracts.filter(ct => ctStats(ct).active);
  const forecast = activeContracts.reduce((a, ct) => a + (+ct.amount || 0), 0);
  const byType = Object.keys(SVC_META).map(k => ({ label: t(SVC_META[k].key), value: svcs.filter(s => s.serviceType === k).length, color: svcColor(k) }));
  const techMap = {};
  svcs.forEach(s => { const tk = (s.technician || '—').trim() || '—'; techMap[tk] = (techMap[tk] || 0) + 1; });
  const byTech = Object.entries(techMap).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value }));
  const topFaults = faultTally(svcs, FAULT_ICONS).slice(0, 7).map(([label, value]) => ({ label, value, color: 'var(--warn)' }));
  const elevMap = {};
  svcs.forEach(s => {
    const key = s.projectId || ('c:' + (s.customer || svcTarget(s)));
    if (!elevMap[key]) { const p = s.projectId ? (state.projects.find(x => x.id === s.projectId) || null) : null;
      elevMap[key] = { name: p ? p.name : (s.customer || svcTarget(s)), n: 0, type: p ? p.elevatorType : '', pid: s.projectId || '' }; }
    elevMap[key].n++;
  });
  const topElev = Object.values(elevMap).sort((a, b) => b.n - a.n).slice(0, 6);
  const partsUsed = []; let consumedValue = 0;
  state.parts.forEach(p => (p.history || []).forEach(h => {
    if (inPeriod(h.date) && h.qty < 0) { const q = -h.qty; partsUsed.push({ name: p.name, qty: q }); consumedValue += q * (+p.price || 0); }
  }));
  partsUsed.sort((a, b) => b.qty - a.qty);
  const hasData = svcs.length || income || state.invoices.length || state.contracts.length;
  const avgMonth = Math.round((svcs.length / anPeriod) * 10) / 10;

  const periodChips = [['an3m', 3], ['an6m', 6], ['an12m', 12]].map(([k, n]) =>
    `<button class="chip ${anPeriod === n ? 'active' : ''}" onclick="anSetPeriod(${n})">${t(k)}</button>`).join('');
  const muted = txt => `<p style="font-size:12.5px;color:var(--text-3)">${txt}</p>`;

  c.innerHTML = `
    <div class="toolbar">
      <span style="font-size:12.5px;color:var(--text-2);font-weight:700">${t('anPeriod')}:</span>
      <div class="chip-row">${periodChips}</div>
      <div style="flex:1"></div>
      <button class="btn btn-ghost" onclick="exportAnalyticsCsv()">📊 ${t('exportCsv')}</button>
      <button class="btn btn-ghost" style="color:#2AABEE" onclick="shareTelegram(buildAnalyticsText())">${IC.telegram} ${t('shareTelegram')}</button>
      <button class="btn btn-ghost" onclick="shareText(buildAnalyticsText())">📤 ${t('share')}</button>
      <button class="btn btn-primary" onclick="printAnalytics()">${IC.print} ${t('anPrint')}</button>
    </div>
    ${!hasData ? `<div class="empty"><div class="e-icon">📉</div><strong>${t('anNoData')}</strong></div>` : `
    <div class="grid-4" style="margin-bottom:16px">
      ${svcKpiHTML('💰', 'var(--ok-soft)', money(income), t('anIncome'), "navigate('/invoices')")}
      ${svcKpiHTML('🔧', 'var(--teal-soft)', faNum(svcs.length), t('anServices'), "navigate('/services')")}
      ${svcKpiHTML('🧾', 'var(--danger-soft)', money(openBalance), t('anBalance'), "navigate('/invoices')")}
      ${svcKpiHTML('📈', 'var(--accent-soft)', faNum(avgMonth), t('anAvgMonth'), "navigate('/analytics')")}
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="card-title">${IC.stats} ${t('anRevenueTrend')}<span style="margin-inline-start:auto;font-size:12px;color:var(--text-2);font-weight:600">${money(income)} ${t('rial')}</span></div>
        ${income ? anBarChart(buckets, buckets.map(b => incomeByMonth[b.key]), 'linear-gradient(180deg,#34d399,var(--ok))') : muted('—')}
      </div>
      <div class="card">
        <div class="card-title">${IC.chart} ${t('anSvcTrend')}</div>
        ${svcs.length ? anBarChart(buckets, buckets.map(b => svcByMonth[b.key])) : muted('—')}
      </div>
    </div>
    <div class="grid-2" style="margin-top:16px">
      <div class="card">
        <div class="card-title">🔧 ${t('anByType')}</div>
        ${byType.some(r => r.value) ? anStatusBars(byType) : muted('—')}
      </div>
      <div class="card">
        <div class="card-title">👷 ${t('anByTech')}</div>
        ${byTech.length ? anStatusBars(byTech, 'var(--purple)') : muted('—')}
      </div>
    </div>
    <div class="grid-2" style="margin-top:16px">
      <div class="card">
        <div class="card-title">🚨 ${t('anTopFaults')}</div>
        ${topFaults.length ? anStatusBars(topFaults) : muted('—')}
      </div>
      <div class="card">
        <div class="card-title">🛗 ${t('anTopElevators')}</div>
        ${topElev.length ? topElev.map(e => {
          const go = e.pid ? `svcFilter={q:'',type:'all',projectId:'${e.pid}'};svcTab='list';navigate('/services')` : `svcTab='list';navigate('/services')`;
          return `<div class="due-item" style="cursor:pointer" onclick="${go}">
            <div class="grow"><strong>${e.type === 'hydraulic' ? '🛢️ ' : '⚙️ '}${esc(e.name)}</strong></div>
            <span class="badge b-blue">${faNum(e.n)} ${t('anServicesUnit')}</span></div>`;
        }).join('') : muted('—')}
      </div>
    </div>
    <div class="grid-2" style="margin-top:16px">
      <div class="card">
        <div class="card-title">📦 ${t('anPartsUsed')}<span style="margin-inline-start:auto;font-size:12px;color:var(--text-2);font-weight:600">${t('anConsumedValue')}: ${money(consumedValue)} ${t('rial')}</span></div>
        ${partsUsed.length ? `<div style="display:flex;flex-wrap:wrap;gap:7px">${partsUsed.slice(0, 10).map(p => `<span class="badge b-gray">${esc(p.name)} ×${faNum(p.qty)}</span>`).join('')}</div>` : muted('—')}
      </div>
      <div class="card">
        <div class="card-title">📄 ${t('anContractForecast')}</div>
        <div class="kv-cell" style="margin-bottom:10px"><div class="k">${t('anForecastMonth')}</div><div class="v" style="color:var(--ok)">${money(forecast)} ${t('rial')}</div></div>
        <div class="kv-cell"><div class="k">${t('anActiveContracts')}</div><div class="v">${faNum(activeContracts.length)}</div></div>
        ${openBalance ? `<div class="kv-cell" style="margin-top:10px"><div class="k">${t('anReceivables')} (${faNum(unpaidCount)})</div><div class="v" style="color:var(--danger)">${money(openBalance)} ${t('rial')}</div></div>` : ''}
      </div>
    </div>`}`;
}
function buildAnalyticsText() {
  const { inPeriod } = anWindow();
  const svcs = state.services.filter(s => inPeriod(s.date));
  let income = state.invoices.reduce((a, inv) => a + (inv.payments || []).reduce((b, p) => b + (inPeriod(p.date) ? +p.amount || 0 : 0), 0), 0);
  const openBalance = state.invoices.reduce((a, inv) => a + invTotals(inv).balance, 0);
  const co = (state.settings || {}).company || 'Z Lift';
  return `📊 ${t('anTitle')} — ${faNum(anPeriod)} ${LANG === 'fa' ? 'ماه' : 'months'}\n🏢 ${co}\n\n💰 ${t('anIncome')}: ${money(income)} ${t('rial')}\n🔧 ${t('anServices')}: ${faNum(svcs.length)}\n📈 ${t('anAvgMonth')}: ${faNum(Math.round(svcs.length / anPeriod))}\n🧾 ${t('anBalance')}: ${money(openBalance)} ${t('rial')}\n\n🛗 Z Lift`;
}
function printAnalytics() {
  const { inPeriod } = anWindow();
  const svcs = state.services.filter(s => inPeriod(s.date));
  let income = state.invoices.reduce((a, inv) => a + (inv.payments || []).reduce((b, p) => b + (inPeriod(p.date) ? +p.amount || 0 : 0), 0), 0);
  const byType = {}; svcs.forEach(s => byType[s.serviceType] = (byType[s.serviceType] || 0) + 1);
  const topFaults = faultTally(svcs, FAULT_ICONS).slice(0, 8);
  const subtitle = faNum(anPeriod) + ' ' + (LANG === 'fa' ? 'ماه' : 'months');
  printDoc(`
    ${printHeader(t('anTitle') + ' — ' + subtitle)}
    <table>
      <tr><th>${t('anIncome')}</th><td>${money(income)} ${t('rial')}</td></tr>
      <tr><th>${t('anServices')}</th><td>${faNum(svcs.length)}</td></tr>
      <tr><th>${t('anByType')}</th><td>${Object.keys(byType).map(k => t(svcMeta(k).key) + ' ' + faNum(byType[k])).join('، ') || '—'}</td></tr>
    </table>
    <table>
      <tr><th>${t('anTopFaults')}</th><th style="width:80px">${t('anCount')}</th></tr>
      ${topFaults.length ? topFaults.map(([lbl, n]) => `<tr><td>${esc(lbl)}</td><td>${faNum(n)}</td></tr>`).join('') : `<tr><td>—</td><td></td></tr>`}
    </table>
    <div class="sig-row"><div class="sig">${t('signTech')}</div></div>`);
}
function exportAnalyticsCsv() {
  const buckets = anBuckets(anPeriod);
  const head = [t('anPeriod'), t('anRevenue'), t('anServices')];
  const rows = buckets.map(b => {
    const svcN = state.services.filter(s => { const j = tsToJalali(s.date); return j.jy === b.jy && j.jm === b.jm; }).length;
    let inc = 0;
    state.invoices.forEach(inv => (inv.payments || []).forEach(p => { const j = tsToJalali(p.date); if (j.jy === b.jy && j.jm === b.jm) inc += +p.amount || 0; }));
    state.contracts.forEach(ct => { if (ct.paid && ct.paid[b.key]) inc += +ct.amount || 0; });
    return [jalMonth(b.jm) + ' ' + b.jy, inc, svcN];
  });
  downloadCsv('zlift-analytics-' + new Date().toISOString().slice(0, 10) + '.csv', head, rows);
  toast(t('saved'));
}
