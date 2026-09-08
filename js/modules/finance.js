/* ================= FINANCE HUB ================= */
/* Independent money home for the technician. Invoices, contracts, monthly
   report and analytics stay as deep routes — they are not deleted — but they
   no longer own permanent navigation items. */
function renderFinance() {
  const c = $('#content');
  const monthStart = Date.now() - 30 * 86400000;
  let invIncome = 0, openBalance = 0, unpaid = 0;
  (state.invoices || []).forEach(inv => {
    (inv.payments || []).forEach(p => { if (p.date >= monthStart) invIncome += +p.amount || 0; });
    const tt = invTotals(inv);
    openBalance += tt.balance;
    if (tt.balance > 0) unpaid++;
  });
  const nowJ = tsToJalali(Date.now());
  const curKey = nowJ.jy + '-' + nowJ.jm;
  let collected = 0, overdueMonths = 0;
  (state.contracts || []).forEach(ct => {
    const st = ctStats(ct);
    overdueMonths += st.overdue || 0;
    const cur = (st.list || []).find(m => m.key === curKey);
    if (cur && ct.paid && ct.paid[curKey]) collected += +ct.amount || 0;
  });

  const cards = [
    ['/invoices', 'bill', 'invoices', 'financeInvSub', unpaid ? faNum(unpaid) + ' ' + t('invUnpaid') : t('invPaidFull'), 'var(--ok-soft)', 'var(--ok)'],
    ['/contracts', 'doc', 'contracts', 'financeCtSub', overdueMonths ? faNum(overdueMonths) + ' ' + t('ctOverdueMonths') : t('ctActive'), 'var(--accent-soft)', 'var(--accent-2)'],
    ['/report', 'chart', 'monthlyReport', 'financeRepSub', '', 'var(--purple-soft)', 'var(--purple)']
  ];

  c.innerHTML = `
    <div class="grid-3" style="margin-bottom:16px">
      ${statCard('💰', 'var(--ok-soft)', money(invIncome), 'invTotalsMonth')}
      ${statCard('🧾', 'var(--danger-soft)', money(openBalance), 'invOpenBalance')}
      ${statCard('📄', 'var(--accent-soft)', money(collected), 'ctCollected')}
    </div>
    <div class="toolbar">
      <button class="btn btn-primary" onclick="openInvoiceForm()">${IC.plus} ${t('newInvoice')}</button>
      <button class="btn btn-ghost" onclick="openContractForm()">${IC.plus} ${t('newContract')}</button>
    </div>
    <div class="tiles" style="margin-top:16px">
      ${cards.map(([route, icon, key, sub, extra, bg, fg]) => `
        <div class="tile" onclick="navigate('${route}')">
          <div class="t-icon" style="background:${bg};color:${fg}">${IC[icon]}</div>
          <strong>${t(key)}</strong>
          <span>${t(sub)}${extra ? ' · ' + extra : ''}</span>
        </div>`).join('')}
    </div>
    <p style="margin-top:14px;font-size:12.5px;color:var(--text-3)">
      <button class="btn btn-ghost btn-sm" onclick="navigate('/analytics')">${IC.stats} ${t('analytics')}</button>
    </p>`;
}
