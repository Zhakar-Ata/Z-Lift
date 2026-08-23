/* ================= DASHBOARD ================= */
function renderDashboard() {
  const c = $('#content');
  const projects = (state.projects || []).filter(p => !p.archived);
  const latest = projects[0];
  const stats = {
    projects: projects.length,
    active: projects.filter(p => p.status !== 'delivered').length,
    services: state.services.length,
    month: state.services.filter(s => s.date >= Date.now() - 30 * 86400000).length
  };
  const recent = state.services.slice(0, 4);

  const hero = latest ? `
    <div class="hero">
      <div class="eyebrow">📌 ${t('latestProject')} · ${t('lastUpdate')}: ${fmtDate(latest.updatedAt)}</div>
      <h3>${esc(latest.name)}</h3>
      <div class="sub">${esc(latest.customer)} — ${esc(latest.location)}</div>
      <div class="hero-row">
        <span class="kv">${latest.elevatorType === 'hydraulic' ? '🛢️ ' + t('hydraulic') : '⚙️ ' + t('traction')}</span>
        <span class="kv">🏢 ${faNum(latest.floors)} ${t('floorsUnit')}</span>
        <span class="kv">⚖️ ${faNum(latest.capacityKg)} kg</span>
        <span class="kv">👤 ${faNum(latest.persons)} ${t('personsUnit')}</span>
      </div>
      <div class="hero-progress">
        <div class="row"><span>${t(statMeta(latest.status).key)}</span><span>${faNum(latest.progress)}٪</span></div>
        <div class="bar"><div class="fill" style="width:${latest.progress}%"></div></div>
      </div>
      <div class="hero-actions">
        <button class="btn" onclick="navigate('/projects/${latest.id}')">${t('viewDetails')}</button>
        <button class="btn" onclick="openServiceForm(null,'${latest.id}')">${IC.plus} ${t('newService')}</button>
      </div>
    </div>` : `
    <div class="empty"><div class="e-icon">🏗️</div><strong>${t('noProjects')}</strong><p>${t('noProjectsSub')}</p>
    <button class="btn btn-primary" onclick="openProjectForm()">${IC.plus} ${t('newProject')}</button></div>`;

  const tiles = [
    ['tProjects', 'tProjectsSub', '/projects', 'proj', 'var(--accent-soft)', 'var(--accent-2)'],
    ['tServices', 'tServicesSub', '/services', 'svc', 'var(--teal-soft)', 'var(--teal)'],
    ['tChecklists', 'tChecklistsSub', '/checklists', 'check', 'var(--ok-soft)', 'var(--ok)'],
    ['tCalc', 'tCalcSub', '/calculations', 'calc', 'var(--purple-soft)', 'var(--purple)'],
    ['tDiag', 'tDiagSub', '/diagnostics', 'diag', 'var(--warn-soft)', 'var(--warn)'],
    ['tKb', 'tKbSub', '/knowledge', 'kb', 'var(--danger-soft)', 'var(--danger)'],
    ['tParts', 'tPartsSub', '/parts', 'box', 'var(--teal-soft)', 'var(--teal)'],
    ['tAnalytics', 'tAnalyticsSub', '/analytics', 'stats', 'var(--accent-soft)', 'var(--accent-2)']
  ].map(([k, sub, route, icon, bg, fg]) => `
    <div class="tile" onclick="navigate('${route}')">
      <div class="t-icon" style="background:${bg};color:${fg}">${IC[icon]}</div>
      <strong>${t(k)}</strong><span>${t(sub)}</span>
    </div>`).join('') + `
    <div class="tile" onclick="openTgChannel()" style="border-bottom-color:#2AABEE">
      <div class="t-icon" style="background:rgba(42,171,238,.14);color:#2AABEE">${IC.telegram}</div>
      <strong>${t('tgChannel')}</strong><span>${t('tgChannelSub')}</span>
    </div>`;

  /* service due list */
  const dues = projects
    .map(p => ({ p, d: dueInfo(p) }))
    .filter(x => x.d && (x.d.overdue || x.d.soon))
    .sort((a, b) => a.d.days - b.d.days);
  /* open follow-ups & out-of-order units */
  const openIssues = state.services
    .filter(s => s.finalStatus === 'followup' || s.finalStatus === 'outoforder')
    .slice(0, 4);
  const openIssueItems = state.issues.filter(i => !i.closed).slice(0, 4);
  const ctOverdue = state.contracts
    .map(ct => ({ ct, st: ctStats(ct) }))
    .filter(x => x.st.overdue > 0)
    .slice(0, 3);
  /* manual calendar reminders that are due — they used to be visible only in the calendar */
  const remDue = buildReminders().filter(r => r.reminderId && (r.overdue || r.soon)).slice(0, 4);

  const dueHtml = (dues.length || openIssues.length || openIssueItems.length || ctOverdue.length || remDue.length) ? (
    dues.map(({ p, d }) => `
    <div class="due-item ${d.overdue ? 'overdue' : 'soon'}">
      <span style="font-size:19px">${d.overdue ? '🔴' : '🟡'}</span>
      <div class="grow">
        <strong>${esc(p.name)}</strong>
        <span class="d-sub">${t('lastService')}: ${fmtDate(d.last)} · ${d.overdue ? faNum(Math.abs(d.days)) + ' ' + t('daysOverdue') : faNum(d.days) + ' ' + t('daysLeft')}</span>
      </div>
      <button class="btn btn-primary btn-sm" onclick="openServiceForm(null,'${p.id}')">${t('logService')}</button>
    </div>`).join('') +
    openIssues.map(s => `
    <div class="due-item ${s.finalStatus === 'outoforder' ? 'overdue' : 'soon'}" onclick="openServiceView('${s.id}')" style="cursor:pointer">
      <span style="font-size:19px">${s.finalStatus === 'outoforder' ? '⛔' : '📌'}</span>
      <div class="grow">
        <strong>${esc(projName(s.projectId))}</strong>
        <span class="d-sub">${esc(s.problem || s.complaint || '—')}${s.followUpDate ? ' · ' + t('svcFollowUp') + ': ' + fmtDate(s.followUpDate) : ''}</span>
      </div>
      <span class="badge ${finalMeta(s.finalStatus).cls}">${t(finalMeta(s.finalStatus).key)}</span>
    </div>`).join('') +
    openIssueItems.map(i => {
      const m = issueMeta(i.kind);
      return `
    <div class="due-item ${i.kind === 'open' ? 'overdue' : 'soon'}" onclick="openIssueForm('${i.id}')" style="cursor:pointer">
      <span style="font-size:19px">${m.icon}</span>
      <div class="grow">
        <strong>${esc(i.title)}</strong>
        <span class="d-sub">${i.projectId ? esc(projName(i.projectId)) + ' · ' : ''}${fmtDate(i.createdAt)}</span>
      </div>
      <span class="badge ${m.cls}">${t(m.key)}</span>
    </div>`;
    }).join('') +
    remDue.map(r => `
    <div class="due-item ${r.overdue ? 'overdue' : 'soon'}" onclick="svcTab='calendar';navigate('/services')" style="cursor:pointer">
      <span style="font-size:19px">${remMeta(r.kind).icon}</span>
      <div class="grow">
        <strong>${esc(r.title)}</strong>
        <span class="d-sub">${r.projectId ? esc(projName(r.projectId)) + ' · ' : ''}${fmtJalali(r.due)} · ${r.overdue ? faNum(Math.abs(r.days)) + ' ' + t('daysOverdue') : faNum(r.days) + ' ' + t('daysLeft')}</span>
      </div>
      <span class="badge ${r.overdue ? 'b-red' : 'b-amber'}">${r.overdue ? t('calOverdue') : t('calDueSoon')}</span>
    </div>`).join('') +
    ctOverdue.map(({ ct, st }) => `
    <div class="due-item overdue" onclick="navigate('/contracts')" style="cursor:pointer">
      <span style="font-size:19px">📄</span>
      <div class="grow">
        <strong>${esc(ct.building)}</strong>
        <span class="d-sub">${faNum(st.overdue)} ${t('ctOverdueMonths')} · ${money(ct.amount * st.overdue)} ${t('rial')}</span>
      </div>
      <span class="badge b-red">${t('invUnpaid')}</span>
    </div>`).join('')
  ) : `<p style="font-size:13.5px;color:var(--ok);font-weight:600">${t('noDue')}</p>`;

  /* low stock */
  const low = state.parts.filter(x => x.qty <= x.minQty);

  /* monthly chart data — last 6 months */
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    const start = d.getTime();
    const e2 = new Date(d); e2.setMonth(e2.getMonth() + 1);
    const cnt = state.services.filter(s => s.date >= start && s.date < e2.getTime()).length;
    const lbl = new Intl.DateTimeFormat(LANG === 'fa' ? 'fa-IR' : 'en-GB', { month: 'short' }).format(d);
    months.push({ lbl, cnt });
  }
  const maxCnt = Math.max(1, ...months.map(m => m.cnt));
  const chartHtml = `<div class="chart-bars">${months.map(m => `
    <div class="chart-col">
      <span class="bar-num">${m.cnt ? faNum(m.cnt) : ''}</span>
      <div class="bar-v" style="height:${Math.round(m.cnt / maxCnt * 100)}%"></div>
      <span class="bar-lbl">${m.lbl}</span>
    </div>`).join('')}</div>`;

  /* status distribution */
  const stColors = { contract: 'var(--text-3)', installing: 'var(--accent-2)', testing: 'var(--purple)', inspection: 'var(--warn)', maintenance: 'var(--teal)', delivered: 'var(--ok)' };
  const statusHtml = `<div class="status-bars">${Object.keys(STATUS_META).map(s => {
    const n = projects.filter(p => p.status === s).length;
    if (!n && !projects.length) return '';
    const pct = projects.length ? Math.round(n / projects.length * 100) : 0;
    return `<div class="sb-row"><span class="sb-lbl">${t(statMeta(s).key)}</span>
      <div class="sb-track"><div class="sb-fill" style="width:${pct}%;background:${stColors[s]}"></div></div>
      <span class="sb-val">${faNum(n)}</span></div>`;
  }).join('')}</div>`;

  /* financial KPIs */
  const monthStart = Date.now() - 30 * 86400000;
  const invIncome = state.invoices.reduce((a, inv) => a + (inv.payments || []).reduce((b, p) => b + (p.date >= monthStart ? +p.amount || 0 : 0), 0), 0);
  const openBalance = state.invoices.reduce((a, inv) => a + invTotals(inv).balance, 0);
  const stockValue = state.parts.reduce((a, x) => a + (+x.price || 0) * (+x.qty || 0), 0);

  c.innerHTML = `
    ${hero}
    <div class="grid-4" style="margin-top:18px">
      ${statCard('🏗️', 'var(--accent-soft)', stats.projects, 'stTotalProjects')}
      ${statCard('⚡', 'var(--warn-soft)', stats.active, 'stActive')}
      ${statCard('🔧', 'var(--teal-soft)', stats.services, 'stServices')}
      ${statCard('📅', 'var(--ok-soft)', stats.month, 'stMonth')}
    </div>
    <div class="grid-3" style="margin-top:14px">
      ${statCard('💰', 'var(--ok-soft)', money(invIncome), 'invTotalsMonth')}
      ${statCard('🧾', 'var(--danger-soft)', money(openBalance), 'invOpenBalance')}
      ${statCard('📦', 'var(--teal-soft)', money(stockValue), 'stInvValue')}
    </div>
    <div class="grid-2" style="margin-top:16px">
      <div class="card">
        <div class="card-title">⏰ ${t('svcDue')}</div>
        ${dueHtml}
        ${low.length ? `<div class="due-item soon" style="margin-top:12px">
          <span style="font-size:19px">📦</span>
          <div class="grow"><strong>${t('stockAlert')}</strong>
          <span class="d-sub">${faNum(low.length)} ${t('stockAlertSub')}: ${low.slice(0, 3).map(x => esc(x.name)).join('، ')}${low.length > 3 ? ' …' : ''}</span></div>
          <button class="btn btn-ghost btn-sm" onclick="navigate('/parts')">${t('viewAll')}</button>
        </div>` : ''}
      </div>
      <div class="card">
        <div class="card-title">📈 ${t('monthlyChart')}</div>
        ${chartHtml}
      </div>
    </div>
    <div class="grid-2" style="margin-top:16px">
      <div class="card">
        <div class="card-title">📊 ${t('statusChart')}</div>
        ${statusHtml}
      </div>
      <div class="card">
        <div class="card-title">🔧 ${t('recentServices')} <button class="btn btn-ghost btn-sm" style="margin-inline-start:auto" onclick="navigate('/services')">${t('viewAll')}</button></div>
        ${recent.length ? recent.map(serviceRow).join('') : `<p style="font-size:13px;color:var(--text-3)">${t('noServices')}</p>`}
      </div>
    </div>
    <div class="section-title"><h3>${t('quickAccess')}</h3></div>
    <div class="tiles">${tiles}</div>
  `;
}
function statCard(emoji, bg, val, key) {
  return `<div class="card stat-card"><div class="stat-icon" style="background:${bg};font-size:21px">${emoji}</div>
    <div class="stat-body"><div class="stat-value">${faNum(val)}</div><div class="stat-label">${t(key)}</div></div></div>`;
}
