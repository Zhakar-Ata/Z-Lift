/* ================= FIELD TOOLS HUB ================= */
/* Technical references and instruments live behind one door. Each destination
   is unchanged; only the permanent navigation item is grouped. */
function renderWorkshop() {
  const c = $('#content');
  const tiles = [
    ['/diagnostics', 'diag', 'diagnostics', 'tDiagSub', 'var(--warn-soft)', 'var(--warn)'],
    ['/measurements', 'ruler', 'measures', 'workshopMeasSub', 'var(--accent-soft)', 'var(--accent-2)'],
    ['/checklists', 'check', 'checklists', 'tChecklistsSub', 'var(--ok-soft)', 'var(--ok)'],
    ['/calculations', 'calc', 'calculations', 'tCalcSub', 'var(--purple-soft)', 'var(--purple)'],
    ['/vvvf', 'chip', 'vvvf', 'workshopVvvfSub', 'var(--teal-soft)', 'var(--teal)'],
    ['/standards', 'std', 'standards', 'workshopStdSub', 'var(--accent-soft)', 'var(--accent-2)'],
    ['/knowledge', 'kb', 'knowledge', 'tKbSub', 'var(--danger-soft)', 'var(--danger)'],
    ['/parts', 'box', 'parts', 'tPartsSub', 'var(--teal-soft)', 'var(--teal)']
  ];
  c.innerHTML = `
    <p style="font-size:13.5px;color:var(--text-2);margin-bottom:14px">${t('workshopIntro')}</p>
    <div class="tiles">
      ${tiles.map(([route, icon, key, sub, bg, fg]) => `
        <div class="tile" onclick="navigate('${route}')">
          <div class="t-icon" style="background:${bg};color:${fg}">${IC[icon]}</div>
          <strong>${t(key)}</strong><span>${t(sub)}</span>
        </div>`).join('')}
    </div>`;
}
