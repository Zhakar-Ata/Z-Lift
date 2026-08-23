/* ================= KNOWLEDGE ================= */
/* Knowledge articles are retained, but their provenance is explicit. Embedded
   standard/clause claims are an UNVERIFIED index until an official source is
   attached; other general guidance is labelled ENGINEERING PRACTICE. */
var KNOWLEDGE_AUDIT_RECORDS = KNOWLEDGE.map(k => {
  const text = [k.summary && k.summary.fa, k.summary && k.summary.en, k.body && k.body.fa, k.body && k.body.en,
    k.what, k.where, k.safety, k.diag, ...(k.test || []), ...(k.inspect || [])].filter(Boolean).join(' ');
  const status = /EN\s*81|6303|ISIRI|§|استاندارد/i.test(text) ? 'UNVERIFIED' : 'ENGINEERING PRACTICE';
  k.verificationStatus = status;
  return { id: 'knowledge:' + k.id, title: k.title, source: null, edition: null, clause: null, verificationStatus: status };
});
var kbQuery = '';
var kbCat = 'all';
function kbSearchText(k) {
  let s = k.title.fa + ' ' + (k.title.en || '') + ' ' + k.summary.fa + ' ' + (k.summary.en || '') + ' ' + k.tags.join(' ');
  ['what', 'where', 'safety', 'diag'].forEach(f => { if (k[f]) s += ' ' + k[f]; });
  ['symptoms', 'inspect', 'test', 'causes', 'related'].forEach(f => { if (k[f]) s += ' ' + k[f].join(' '); });
  if (k.body) s += ' ' + (k.body.fa || '') + ' ' + (k.body.en || '');
  return norm(s);
}
function renderKnowledge() {
  const c = $('#content');
  c.innerHTML = `
    <div class="toolbar">
      <div class="search">${IC.search}<input id="kbSearch" placeholder="${t('searchKb')}" value="${esc(kbQuery)}" /></div>
      <div class="chip-row">
        ${KB_CATS.map(ct => `<button class="chip ${kbCat === ct.id ? 'active' : ''}" data-c="${ct.id}">${esc(ct[LANG] || ct.fa)}</button>`).join('')}
      </div>
    </div>
    <div id="kbList" class="grid-2"></div>`;
  $('#kbSearch').oninput = debounce(e => { kbQuery = e.target.value; drawKb(); }, 200);
  $$('#content .chip[data-c]').forEach(ch => ch.onclick = () => { kbCat = ch.dataset.c; renderKnowledge(); });
  drawKb();
}
function drawKb() {
  const q = norm(kbQuery);
  let list = KNOWLEDGE;
  if (kbCat !== 'all') list = list.filter(k => k.cat === kbCat);
  if (q) list = list.filter(k => kbSearchText(k).includes(q));
  const el = $('#kbList');
  if (!list.length) {
    el.innerHTML = `<div class="empty"><div class="e-icon">🔍</div><strong>${t('notFound')}</strong><p>${t('notFoundSub')}</p></div>`;
    return;
  }
  el.innerHTML = list.map(k => `
    <div class="card kb-card" onclick="openKbArticle('${k.id}')">
      <h4><span style="font-size:20px">${k.icon}</span> ${esc(k.title[LANG] || k.title.fa)}</h4>
      <p>${esc(k.summary[LANG] || k.summary.fa)}</p>
      <div class="kb-tags">${k.tags.slice(0, 4).map(tg => `<span class="badge b-gray">${esc(tg)}</span>`).join('')}</div>
    </div>`).join('');
}
function kbSection(icon, titleKey, content) {
  if (!content || (Array.isArray(content) && !content.length)) return '';
  const body = Array.isArray(content)
    ? `<ul style="padding-inline-start:20px">${content.map(x => `<li style="margin-bottom:3px">${esc(x)}</li>`).join('')}</ul>`
    : `<p>${esc(content)}</p>`;
  return `<h4 style="display:flex;align-items:center;gap:7px">${icon} ${t(titleKey)}</h4>${body}`;
}
function kbOpenRelated(name) {
  const q = norm(name);
  const hit = KNOWLEDGE.find(k => hay(k.title.fa, k.title.en).includes(q)) ||
              KNOWLEDGE.find(k => kbSearchText(k).includes(q));
  if (hit) { openKbArticle(hit.id); }
  else { closeModal(); kbQuery = name; navigate('/knowledge'); }
}
function openKbArticle(id) {
  const k = KNOWLEDGE.find(x => x.id === id);
  if (!k) return;
  let inner;
  if (k.what) {
    // structured component entry
    inner = `<div class="kb-article">
      ${kbSection('⚙️', 'kbWhat', k.what)}
      ${kbSection('📍', 'kbWhere', k.where)}
      ${kbSection('🚨', 'kbSymptoms', k.symptoms)}
      ${kbSection('👁️', 'kbInspect', k.inspect)}
      ${kbSection('🧪', 'kbTest', k.test)}
      ${kbSection('💥', 'kbCauses', k.causes)}
      ${k.related && k.related.length ? `<h4>🔗 ${t('kbRelated')}</h4><div style="display:flex;flex-wrap:wrap;gap:6px;margin:6px 0">${k.related.map(r => `<span class="badge b-blue" style="cursor:pointer" title="${t('kbRelClick')}" onclick="kbOpenRelated('${jsAttr(r)}')">${esc(r)} ←</span>`).join('')}</div>` : ''}
      ${k.safety ? `<div class="safety-banner" style="margin-top:14px"><span style="font-size:17px">⚠️</span><span>${esc(k.safety)}</span></div>` : ''}
      ${k.diag ? `<div class="note-block" style="margin-top:10px">🧭 <b>${t('kbDiag')}:</b> ${esc(k.diag)} — <a href="#/diagnostics" onclick="closeModal()">${t('diagnostics')} ←</a></div>` : ''}
    </div>`;
  } else {
    inner = `<div class="kb-article">${k.body[LANG] || k.body.fa}</div>`;
  }
  openModal(`
    <div class="modal-head"><h3>${k.icon} ${esc(k.title[LANG] || k.title.fa)}</h3><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="safety-banner" style="background:var(--warn-soft);border-color:var(--warn);color:var(--text-2);margin-bottom:14px">
        <span>📖</span><span><b>${esc(k.verificationStatus)}</b> — ${k.verificationStatus === 'UNVERIFIED'
          ? (LANG === 'fa' ? 'ادعاهای استانداردی/عددی این مقاله بدون متن رسمی، ویرایش و صفحهٔ منبع‌اند؛ به‌عنوان آستانهٔ ایمنی یا گواهی انطباق استفاده نشوند.' : 'Standard/numeric claims lack an official text, edition and page citation; do not use them as safety thresholds or proof of compliance.')
          : (LANG === 'fa' ? 'راهنمای عمومی مهندسی؛ با شرایط پروژه و دستور سازنده تطبیق دهید.' : 'General engineering guidance; verify against project conditions and manufacturer instructions.')}</span>
      </div>
      ${inner}
      <div class="kb-tags" style="margin-top:16px">${k.tags.map(tg => `<span class="badge b-gray">${esc(tg)}</span>`).join('')}</div>
    </div>
    <div class="modal-foot"><button class="btn btn-primary" onclick="closeModal()">${t('close')}</button></div>`, { size: 'lg' });
}
