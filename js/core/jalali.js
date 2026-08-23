/* ================= JALALI (SHAMSI) CALENDAR ================= */
/* Standard civil Jalali<->Gregorian conversion (jalaali algorithm, well-established) */
function _div(a, b) { return ~~(a / b); }
function _mod(a, b) { return a - ~~(a / b) * b; }
function jalCal(jy) {
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  let bl = breaks.length, gy = jy + 621, leapJ = -14, jp = breaks[0], jump = 0;
  for (let i = 1; i < bl; i += 1) {
    const jm = breaks[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + _div(jump, 33) * 8 + _div(_mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ = leapJ + _div(n, 33) * 8 + _div(_mod(n, 33) + 3, 4);
  if (_mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = _div(gy, 4) - _div((_div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + _div(jump + 4, 33) * 33;
  let leap = _mod(_mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}
function g2d(gy, gm, gd) {
  let d = _div((gy + _div(gm - 8, 6) + 100100) * 1461, 4) + _div(153 * _mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  d = d - _div(_div(gy + 100100 + _div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}
function d2g(jdn) {
  let j = 4 * jdn + 139361631;
  j = j + _div(_div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = _div(_mod(j, 1461), 4) * 5 + 308;
  const gd = _div(_mod(i, 153), 5) + 1;
  const gm = _mod(_div(i, 153), 12) + 1;
  const gy = _div(j, 1461) - 100100 + _div(8 - gm, 6);
  return { gy, gm, gd };
}
function j2d(jy, jm, jd) {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - _div(jm, 7) * (jm - 7) + jd - 1;
}
function d2j(jdn) {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let jd, jm, k = jdn - jdn1f;
  if (k >= 0) {
    if (k <= 185) { jm = 1 + _div(k, 31); jd = _mod(k, 31) + 1; return { jy, jm, jd }; }
    else k -= 186;
  } else {
    jy -= 1; k += 179;
    if (r.leap === 1) k += 1;
  }
  jm = 7 + _div(k, 30);
  jd = _mod(k, 30) + 1;
  return { jy, jm, jd };
}
function jalaliToTs(jy, jm, jd) {
  const g = d2g(j2d(jy, jm, jd));
  return new Date(g.gy, g.gm - 1, g.gd, 12, 0, 0).getTime();
}
/* Range helpers — jalaliToTs() intentionally returns NOON (DST-safe anchor for
   stored dates), so it must NOT be used as a range boundary: a service logged
   at 09:00 would fall into the previous day. These return real local midnight. */
function jalDayStart(jy, jm, jd) {
  const g = d2g(j2d(jy, jm, jd));
  return new Date(g.gy, g.gm - 1, g.gd, 0, 0, 0, 0).getTime();
}
function jalDayRange(jy, jm, jd) {
  const days = jalDaysInMonth(jy, jm);
  let ny = jy, nm = jm, nd = jd + 1;
  if (nd > days) { nd = 1; nm++; if (nm > 12) { nm = 1; ny++; } }
  return { from: jalDayStart(jy, jm, jd), to: jalDayStart(ny, nm, nd) };
}
function jalMonthRange(jy, jm) {
  let ny = jy, nm = jm + 1;
  if (nm > 12) { nm = 1; ny++; }
  return { from: jalDayStart(jy, jm, 1), to: jalDayStart(ny, nm, 1) };
}
/* month navigation arrows: in RTL "back" points right, in LTR it points left */
function navArrows() {
  return I18N[LANG].dir === 'rtl' ? { prev: '›', next: '‹' } : { prev: '‹', next: '›' };
}
function tsToJalali(ts) {
  const d = new Date(ts);
  return d2j(g2d(d.getFullYear(), d.getMonth() + 1, d.getDate()));
}
var JAL_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
var JAL_MONTHS_EN = ['Farvardin', 'Ordibehesht', 'Khordad', 'Tir', 'Mordad', 'Shahrivar', 'Mehr', 'Aban', 'Azar', 'Dey', 'Bahman', 'Esfand'];
/* Jalali month name in the active interface language (1-based) */
function jalMonth(jm) { return (LANG === 'fa' ? JAL_MONTHS : JAL_MONTHS_EN)[(jm - 1 + 12) % 12]; }
function jalDaysInMonth(jy, jm) { return jm <= 6 ? 31 : (jm <= 11 ? 30 : (jalCal(jy).leap === 0 ? 30 : 29)); }
function fmtJalali(ts) {
  const j = tsToJalali(ts);
  return faNum(j.jd) + ' ' + jalMonth(j.jm) + ' ' + faNum(j.jy);
}

/* Z Lift — technical content: checklists, diagnostics, knowledge base, calculators
   References: EN 81-20 / Iranian National Standard ISIRI 6303-20 (informative summaries) */
