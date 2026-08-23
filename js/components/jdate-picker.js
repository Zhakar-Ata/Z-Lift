/* ================= JALALI DATE INPUT ================= */
/* Renders a readonly text input showing a Jalali date + hidden ts value.
   Usage: jdateInput('myId', ts) then jdateVal('myId') to read the timestamp (0 if empty). */
function jdateInput(id, ts, allowEmpty) {
  const label = ts ? fmtJalali(ts) : '';
  return `<div style="position:relative">
    <input id="${id}" readonly value="${label}" data-ts="${ts || ''}" placeholder="—"
      style="cursor:pointer" onclick="openJdatePicker('${id}', ${allowEmpty ? 'true' : 'false'})" />
  </div>`;
}
function jdateVal(id) {
  const el = $('#' + id);
  return el && el.dataset.ts ? +el.dataset.ts : 0;
}
var _jdCur = null; // { jy, jm }
function openJdatePicker(targetId, allowEmpty) {
  const el = $('#' + targetId);
  const base = el && el.dataset.ts ? +el.dataset.ts : Date.now();
  const j = tsToJalali(base);
  _jdCur = { jy: j.jy, jm: j.jm, targetId, allowEmpty, selTs: el && el.dataset.ts ? +el.dataset.ts : 0 };
  // overlay on top of any open modal (do NOT close the underlying modal)
  const root = document.createElement('div');
  root.id = 'jdOverlay';
  root.style.cssText = 'position:fixed;inset:0;z-index:300;background:rgba(2,6,23,.55);display:flex;align-items:center;justify-content:center;padding:18px';
  root.innerHTML = `<div id="jdBox" style="background:var(--bg-card);border:1px solid var(--border);border-radius:18px;box-shadow:var(--shadow-lg);width:100%;max-width:330px;padding:16px"></div>`;
  root.addEventListener('mousedown', e => { if (e.target.id === 'jdOverlay') closeJdatePicker(); });
  document.body.appendChild(root);
  _lockScroll(true);
  pushUiLayer('jdate', _closeJdateDom);
  drawJdate();
}
function _closeJdateDom() {
  const o = document.getElementById('jdOverlay');
  if (o) o.remove();
  _jdCur = null;
  if (!document.getElementById('modalOverlay')) _lockScroll(false);
}
function closeJdatePicker() {
  const had = !!document.getElementById('jdOverlay');
  _closeJdateDom();
  if (had) popTaggedLayer('jdate');
}
function jdShift(d) {
  _jdCur.jm += d;
  if (_jdCur.jm > 12) { _jdCur.jm = 1; _jdCur.jy++; }
  if (_jdCur.jm < 1) { _jdCur.jm = 12; _jdCur.jy--; }
  drawJdate();
}
function jdPick(jd) {
  const ts = jalaliToTs(_jdCur.jy, _jdCur.jm, jd);
  const el = $('#' + _jdCur.targetId);
  if (el) { el.dataset.ts = ts; el.value = fmtJalali(ts); el.dispatchEvent(new Event('change')); }
  closeJdatePicker();
}
function jdClear() {
  const el = $('#' + _jdCur.targetId);
  if (el) { el.dataset.ts = ''; el.value = ''; el.dispatchEvent(new Event('change')); }
  closeJdatePicker();
}
function jdToday() {
  const j = tsToJalali(Date.now());
  _jdCur.jy = j.jy; _jdCur.jm = j.jm;
  jdPick(j.jd);
}
function drawJdate() {
  const box = document.getElementById('jdBox');
  if (!box || !_jdCur) return;
  const { jy, jm } = _jdCur;
  const days = jalDaysInMonth(jy, jm);
  const firstTs = jalaliToTs(jy, jm, 1);
  // Persian week starts Saturday. JS getDay(): Sat=6
  const startCol = (new Date(firstTs).getDay() + 1) % 7; // Sat->0, Sun->1 ... Fri->6
  const todayJ = tsToJalali(Date.now());
  const selJ = _jdCur.selTs ? tsToJalali(_jdCur.selTs) : null;
  let cells = '';
  for (let i = 0; i < startCol; i++) cells += '<span></span>';
  for (let d = 1; d <= days; d++) {
    const isToday = todayJ.jy === jy && todayJ.jm === jm && todayJ.jd === d;
    const isSel = selJ && selJ.jy === jy && selJ.jm === jm && selJ.jd === d;
    cells += `<button onclick="jdPick(${d})" style="border:0;border-radius:9px;padding:7px 0;font-family:inherit;font-size:13px;cursor:pointer;
      background:${isSel ? 'var(--accent)' : isToday ? 'var(--accent-soft)' : 'transparent'};
      color:${isSel ? '#fff' : isToday ? 'var(--accent-2)' : 'var(--text)'};font-weight:${isToday || isSel ? '800' : '500'}">${faNum(d)}</button>`;
  }
  box.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <button class="icon-btn" style="width:34px;height:34px" onclick="jdShift(-1)" aria-label="${t('prevMonth')}" title="${t('prevMonth')}">${navArrows().prev}</button>
      <strong style="font-size:14.5px">${jalMonth(jm)} ${faNum(jy)}</strong>
      <button class="icon-btn" style="width:34px;height:34px" onclick="jdShift(1)" aria-label="${t('nextMonth')}" title="${t('nextMonth')}">${navArrows().next}</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;text-align:center;font-size:10.5px;color:var(--text-3);margin-bottom:5px">
      <span>ش</span><span>ی</span><span>د</span><span>س</span><span>چ</span><span>پ</span><span>ج</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;text-align:center">${cells}</div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn btn-ghost btn-sm" style="flex:1" onclick="jdToday()">📅 ${t('today')}</button>
      ${_jdCur.allowEmpty ? `<button class="btn btn-ghost btn-sm" style="flex:1" onclick="jdClear()">✕</button>` : ''}
      <button class="btn btn-ghost btn-sm" style="flex:1" onclick="closeJdatePicker()">${t('close')}</button>
    </div>`;
}
