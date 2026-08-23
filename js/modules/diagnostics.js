/* ================= DIAGNOSTICS — decision tree ================= */
var diagFilter = { q: '', type: 'all' };
var diagSession = null; // { flowId, path:[nodeIds], current }

function renderDiagnostics() {
  const c = $('#content');
  if (diagSession) { renderDiagFlow(c); return; }
  c.innerHTML = `
    <div class="safety-banner"><span style="font-size:18px">⚠️</span><span>${t('diagSafety')}</span></div>
    <div class="toolbar">
      <div class="search">${IC.search}<input id="diagSearch" placeholder="${t('searchDiag')}" value="${esc(diagFilter.q)}" /></div>
      <div class="chip-row">
        <button class="chip ${diagFilter.type === 'all' ? 'active' : ''}" data-t="all">${t('all')}</button>
        <button class="chip ${diagFilter.type === 'traction' ? 'active' : ''}" data-t="traction">⚙️ ${t('traction')}</button>
        <button class="chip ${diagFilter.type === 'hydraulic' ? 'active' : ''}" data-t="hydraulic">🛢️ ${t('hydraulic')}</button>
      </div>
    </div>
    <p style="font-size:13px;color:var(--text-2);margin-bottom:14px">${t('diagPickSymptom')} — ${t('diagIntro')}</p>
    <div id="diagList"></div>`;
  $('#diagSearch').oninput = debounce(e => { diagFilter.q = e.target.value; drawDiagList(); }, 200);
  $$('#content .toolbar .chip[data-t]').forEach(ch => ch.onclick = () => { diagFilter.type = ch.dataset.t; renderDiagnostics(); });
  drawDiagList();
}
function flowSearchText(f) {
  let s = (f.symptom.fa || '') + ' ' + (f.symptom.en || '') + ' ' + (f.first ? f.first.fa : '');
  Object.values(f.nodes).forEach(n => {
    if (n.q) s += ' ' + n.q.fa;
    if (n.title) s += ' ' + n.title.fa;
    (n.causes || []).forEach(x => s += ' ' + x.fa);
    (n.parts || []).forEach(x => s += ' ' + x.fa);
  });
  return norm(s);
}
function drawDiagList() {
  const q = norm(diagFilter.q);
  let list = DIAG_FLOWS;
  if (diagFilter.type !== 'all') list = list.filter(d => d.type === 'both' || d.type === diagFilter.type);
  if (q) list = list.filter(d => flowSearchText(d).includes(q));
  const el = $('#diagList');
  if (!list.length) {
    el.innerHTML = `<div class="empty"><div class="e-icon">🔍</div><strong>${t('notFound')}</strong><p>${t('notFoundSub')}</p></div>`;
    return;
  }
  el.innerHTML = list.map(d => `
    <div class="row-item" onclick="startDiagFlow('${d.id}')">
      <div class="row-icon" style="background:${d.type === 'hydraulic' ? 'var(--teal-soft)' : d.type === 'traction' ? 'var(--accent-soft)' : 'var(--warn-soft)'};font-size:19px">${d.icon || '🔩'}</div>
      <div class="row-body">
        <strong>${esc(d.symptom[LANG] || d.symptom.fa)}</strong>
        <span class="sub">🔍 ${esc((d.first && d.first.fa) || '')}</span>
      </div>
      <div class="row-side">${d.type !== 'both' ? typeBadge(d.type) : `<span class="badge b-gray">⚙️/🛢️</span>`}</div>
    </div>`).join('');
}
function _diagStepBackDom() {
  /* called by hardware back: one step back, or exit flow at first step */
  if (!diagSession) return;
  if (!diagSession.path.length) { diagSession = null; }
  else { diagSession.current = diagSession.path.pop(); }
  renderDiagnostics();
}
function startDiagFlow(id) {
  const f = DIAG_FLOWS.find(x => x.id === id);
  if (!f) return;
  diagSession = { flowId: id, path: [], current: f.start, evidence: [], startedAt: Date.now() };
  pushUiLayer('diag', _diagStepBackDom);
  renderDiagnostics();
  window.scrollTo(0, 0);
}
function _diagQuickObs(key, kind) {
  const f = DIAG_FLOWS.find(x => x.id === diagSession.flowId);
  const cur = f && f.nodes[diagSession.current];
  const q = cur && cur.q ? cur.q.fa : key;
  const txt = kind === 'ok'
    ? (LANG === 'fa' ? `تأیید شد: «${q}» نرمال است` : `Confirmed normal: "${q}"`)
    : (LANG === 'fa' ? `مشاهده غیرنرمال: «${q}»` : `Abnormal observation: "${q}"`);
  _diagEvidenceMark(kind, txt);
}
function _diagNoteObs() {
  const note = prompt(LANG === 'fa' ? 'ثبت یادداشت/اندازه‌گیری:' : 'Record a note/measurement:');
  if (note && note.trim()) _diagEvidenceMark('meas', note.trim());
}
function diagAnswer(nodeId, qText, aText) {
  if (!diagSession) return;                       // stale button after the flow was closed
  const f = DIAG_FLOWS.find(x => x.id === diagSession.flowId);
  if (!f || !f.nodes[nodeId]) return;
  // record answer in evidence trail
  if (qText) _diagEvidenceMark('hypo', (LANG === 'fa' ? 'پاسخ: ' : 'Answer: ') + qText + ' → ' + aText);
  diagSession.path.push(diagSession.current);
  diagSession.current = nodeId;
  pushUiLayer('diag', _diagStepBackDom);
  renderDiagnostics();
  window.scrollTo(0, 0);
}
function diagBack() {
  if (!diagSession) return;
  popTaggedLayer('diag');
  if (!diagSession.path.length) { diagSession = null; renderDiagnostics(); return; }
  diagSession.current = diagSession.path.pop();
  renderDiagnostics();
}
function diagExit() {
  while (popTaggedLayer('diag')) {}
  diagSession = null;
  renderDiagnostics();
}
function _diagEvidenceMark(kind, text) {
  if (!diagSession) return;
  diagSession.evidence = diagSession.evidence || [];
  diagSession.evidence.push({ kind, text: String(text || '').slice(0, 240), at: Date.now() });
  renderDiagnostics();
}
function _diagEvidencePanel() {
  if (!diagSession || !diagSession.evidence || !diagSession.evidence.length) return '';
  const icon = { ok: '✅', abn: '🚩', meas: '📐', elim: '➖', hypo: '❓', act: '🛠️' };
  return `<div class="card" style="margin-top:12px">
    <div style="font-size:12px;font-weight:700;color:var(--text-3);margin-bottom:8px">🧭 ${LANG === 'fa' ? 'شواهد ثبت‌شده در این جلسه' : 'Evidence gathered'}</div>
    ${diagSession.evidence.map(e => `<div style="font-size:12.5px;margin:3px 0">${icon[e.kind] || '•'} ${esc(e.text)}</div>`).join('')}
  </div>`;
}

function renderDiagFlow(c) {
  const f = DIAG_FLOWS.find(x => x.id === diagSession.flowId);
  if (!f) { diagSession = null; renderDiagnostics(); return; }
  const node = f.nodes[diagSession.current];
  if (!node) { diagSession = null; renderDiagnostics(); return; }
  const stepNo = diagSession.path.length + 1;
  const isResult = !node.q;

  /* breadcrumb of previous questions */
  const crumbs = diagSession.path.map(pid => {
    const pn = f.nodes[pid];
    return pn && pn.q ? `<span class="badge b-gray" style="margin:2px">${esc(pn.q.fa)}</span>` : '';
  }).join(' ← ');

  let body;
  const obsKey = diagSession.flowId + ':' + diagSession.current;
  if (!isResult) {
    body = `
      <div class="card" style="border-inline-start:4px solid var(--accent)">
        <div style="font-size:12px;color:var(--text-3);font-weight:700;margin-bottom:6px">${t('diagStep')} ${faNum(stepNo)}</div>
        <h3 style="font-size:17px;margin-bottom:8px">🧪 TEST: ${esc(node.test.fa)}</h3>
        <span class="badge ${node.verificationStatus === STANDARD_VERIFICATION.UNVERIFIED ? 'b-amber' : 'b-blue'}" style="margin-bottom:12px">${esc(node.verificationStatus)}</span>
        ${node.why ? `<div class="kv-cell" style="margin-bottom:9px"><div class="k">❓ WHY</div><div class="v" style="font-weight:500">${esc(node.why.fa)}</div></div>` : ''}
        ${node.how ? `<div class="kv-cell" style="margin-bottom:9px"><div class="k">🔧 ${t('diagHow')}</div><div class="v" style="font-weight:500">${esc(node.how.fa)}</div></div>` : ''}
        ${node.expectedResult ? `<div class="kv-cell" style="margin-bottom:9px;background:var(--ok-soft)"><div class="k">✅ EXPECTED RESULT</div><div class="v" style="font-weight:500">${esc(node.expectedResult.fa)}</div></div>` : ''}
        <div class="form-grid" style="margin-bottom:12px">
          ${node.ifNormal ? `<div class="kv-cell"><div class="k">IF NORMAL</div><div class="v">${esc(node.ifNormal.fa)}</div></div>` : ''}
          ${node.ifAbnormal ? `<div class="kv-cell"><div class="k">IF ABNORMAL</div><div class="v">${esc(node.ifAbnormal.fa)}</div></div>` : ''}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
          <button class="chip" style="cursor:pointer" onclick="_diagQuickObs('${obsKey}','ok')">✅ ${LANG === 'fa' ? 'تأیید شد (نرمال)' : 'Confirmed normal'}</button>
          <button class="chip" style="cursor:pointer" onclick="_diagQuickObs('${obsKey}','abn')">🚩 ${LANG === 'fa' ? 'غیرنرمال' : 'Abnormal'}</button>
          <button class="chip" style="cursor:pointer" onclick="_diagNoteObs('${obsKey}')">📝 ${LANG === 'fa' ? 'ثبت یادداشت/اندازه' : 'Note/measurement'}</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:9px">
          ${node.opts.map(o => `<button class="btn btn-primary" style="justify-content:flex-start;text-align:start" onclick="diagAnswer('${o.n}','${esc(node.q.fa)}','${esc(o.l.fa)}')">➜ ${esc(o.l.fa)}</button>`).join('')}
        </div>
      </div>`;
  } else {
    body = `
      <div class="card" style="border-inline-start:4px solid var(--ok)">
        <div style="font-size:12px;color:var(--text-3);font-weight:700;margin-bottom:6px">🎯 ROOT CAUSE / ${t('diagResult')}</div>
        <h3 style="font-size:17px;margin-bottom:8px">${esc(node.title.fa)}</h3>
        <span class="badge ${node.verificationStatus === STANDARD_VERIFICATION.UNVERIFIED ? 'b-amber' : 'b-blue'}" style="margin-bottom:12px">${esc(node.verificationStatus)}</span>
        ${node.causes && node.causes.length ? `<h5 style="font-size:13px;color:var(--accent-2);margin:10px 0 6px">🔎 ${t('probableCauses')}</h5>
        <ul style="padding-inline-start:20px;font-size:13.6px;color:var(--text-2)">${node.causes.map(x => `<li style="margin-bottom:4px">${esc(x.fa)}</li>`).join('')}</ul>` : ''}
        ${node.actions && node.actions.length ? `<h5 style="font-size:13px;color:var(--accent-2);margin:14px 0 6px">🛠️ ${t('diagActions')}</h5>
        <ul style="padding-inline-start:20px;font-size:13.6px;color:var(--text-2)">${node.actions.map((x, i) => `<li style="margin-bottom:5px"><b>${faNum(i + 1)}.</b> ${esc(x.fa)}</li>`).join('')}</ul>` : ''}
        ${node.parts && node.parts.length ? `<h5 style="font-size:13px;color:var(--accent-2);margin:14px 0 6px">📦 ${t('diagParts')}</h5>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${node.parts.map(x => `<span class="badge b-amber">${esc(x.fa)}</span>`).join('')}</div>` : ''}
        ${node.next ? `<div class="note-block" style="margin-top:14px">⏭️ <b>${t('diagNext')}:</b> ${esc(node.next.fa)}</div>` : ''}
        ${(() => {
          /* smart link: match faulty parts to knowledge base articles */
          const partTxt = (node.parts || []).map(x => x.fa).join(' ') + ' ' + node.title.fa;
          const kbMap = [['ترمز', 'c-brake'], ['انکودر', 'c-encoder'], ['درایو', 'c-vvvf'], ['موتور', 'c-motor'], ['قفل', 'c-doorlock'], ['سردرب', 'c-dooroperator'], ['درب', 'c-dooroperator'], ['فتوسل', 'c-dooroperator'], ['کنتاکتور', 'c-contactor'], ['رله', 'c-relay'], ['بکسل', 'c-traction'], ['فلکه', 'c-traction'], ['پمپ', 'c-pump'], ['شیر', 'c-valveblock'], ['سیل', 'c-cylinder'], ['جک', 'c-cylinder'], ['روغن', 'c-tank'], ['گاورنر', 'c-govsafety'], ['پاراشوت', 'c-govsafety'], ['لیمیت', 'c-limits'], ['سنسور', 'c-sensors'], ['تابلو', 'c-controller'], ['مدار ایمنی', 'c-safetycircuit']];
          const hits = [];
          kbMap.forEach(([w, kid]) => { if (partTxt.includes(w) && !hits.includes(kid)) hits.push(kid); });
          if (!hits.length) return '';
          return `<div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:12px">${hits.slice(0, 3).map(kid => {
            const kb = KNOWLEDGE.find(k => k.id === kid);
            return kb ? `<button class="chip" onclick="openKbArticle('${kid}')">${kb.icon} ${t('kbReadMore')}: ${esc(kb.title.fa)}</button>` : '';
          }).join('')}</div>`;
        })()}
        <div style="display:flex;gap:9px;margin-top:16px;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="openDiagSaveForm('${f.id}','${diagSession.current}')">💾 ${t('diagSave')}</button>
          <button class="btn btn-ghost" onclick="openServiceForm()">${IC.plus} ${t('logService')}</button>
          <button class="btn btn-ghost" onclick="startDiagFlow('${f.id}')">🔄 ${t('diagRestart')}</button>
        </div>
      </div>`;
  }

  c.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:13px;flex-wrap:wrap">
      <button class="btn btn-ghost btn-sm" onclick="diagExit()">${IC.back} ${t('diagnostics')}</button>
      ${diagSession.path.length ? `<button class="btn btn-ghost btn-sm" onclick="diagBack()">↩️ ${t('diagBack')}</button>` : ''}
    </div>
    <div class="detail-head" style="margin-bottom:12px">
      <div class="row-icon" style="background:var(--warn-soft);font-size:22px;width:50px;height:50px">${f.icon || '🔩'}</div>
      <div class="grow">
        <h2 style="font-size:18px">${esc(f.symptom.fa)}</h2>
        <div class="sub">${f.type !== 'both' ? typeBadge(f.type) : `<span class="badge b-gray">⚙️ / 🛢️</span>`}</div>
      </div>
    </div>
    ${f.safety ? `<div class="safety-banner"><span style="font-size:18px">⚠️</span><span><b>${t('diagSafetyThis')}:</b> ${esc(f.safety.fa)}</span></div>` : ''}
    <div class="grid-2" style="margin-bottom:14px">
      ${f.tools ? `<div class="kv-cell"><div class="k">🧰 ${t('diagTools')}</div><div class="v" style="font-weight:600">${esc(f.tools.fa)}</div></div>` : ''}
      ${f.first ? `<div class="kv-cell"><div class="k">🔍 ${t('diagFirst')}</div><div class="v" style="font-weight:600">${esc(f.first.fa)}</div></div>` : ''}
    </div>
    ${crumbs ? `<div style="font-size:11.5px;color:var(--text-3);margin-bottom:10px;line-height:2.2">🧭 ${crumbs}</div>` : ''}
    ${body}
    ${_diagEvidencePanel()}`;
}
