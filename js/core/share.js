/* ================= SHARE (Telegram / system) ================= */
async function shareText(text) {
  try {
    if (navigator.share) { await navigator.share({ text }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  // fallback: copy to clipboard
  try {
    await navigator.clipboard.writeText(text);
    toast(t('shareCopied'));
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast(t('shareCopied')); } catch (e2) {}
    ta.remove();
  }
}
function shareTelegram(text) {
  const url = 'https://t.me/share/url?url=' + encodeURIComponent('🛗 Z Lift') + '&text=' + encodeURIComponent(text);
  openExternal(url);
}
var TG_CHANNEL_URL = 'https://t.me/+_2n4QjG6XpsxZGY0';
function openTgChannel() { openExternal(TG_CHANNEL_URL); }
function openExternal(url) {
  /* window.open از داخل onclick هندلرهای inline در PWA standalone گاهی توسط
     WebView مسدود می‌شود؛ لینک واقعی می‌سازیم و کلیک می‌کنیم — قابل اعتمادتر است */
  try {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 500);
  } catch (e) {
    try { window.open(url, '_blank'); } catch (e2) { location.href = url; }
  }
}
function buildServiceText(s) {
  const p = s.projectId ? state.projects.find(x => x.id === s.projectId) : null;
  const co = (state.settings || {}).company || 'Z Lift';
  const L = [];
  L.push('🛗 ' + co + ' — ' + t('reportTitle'));
  L.push('');
  L.push('👤 ' + (s.customer || (p && p.customer) || '—'));
  if (p) L.push('🏢 ' + p.name);
  L.push('📅 ' + fmtJalali(s.date));
  L.push('🔧 ' + t(svcMeta(s.serviceType).key));
  if (s.problem) L.push('❗ ' + t('svcProblem') + ': ' + s.problem);
  if (s.diagnosis) L.push('🔎 ' + t('svcDiagnosis') + ': ' + s.diagnosis);
  if (s.workDone) L.push('✅ ' + t('svcWork') + ': ' + s.workDone);
  const _partsTxt = svcPartsTextOf(s);
  if (_partsTxt) L.push('📦 ' + t('svcParts') + ': ' + _partsTxt);
  if (s.recommendations) L.push('💡 ' + t('svcRecommend') + ': ' + s.recommendations);
  L.push('🏁 ' + t('svcFinal') + ': ' + t(finalMeta(s.finalStatus).key));
  L.push('👨‍🔧 ' + s.technician);
  return L.join('\n');
}
function buildInvoiceText(inv) {
  const co = (state.settings || {}).company || 'Z Lift';
  const tt = invTotals(inv);
  const L = [];
  L.push('🧾 ' + co + ' — ' + t('invoice') + ' #' + inv.id.slice(0, 6).toUpperCase());
  L.push('👤 ' + inv.customer);
  L.push('📅 ' + fmtJalali(inv.date || inv.createdAt));
  L.push('');
  (inv.items || []).forEach(it => L.push('• ' + it.desc + ' ×' + faNum(it.qty) + ' — ' + money((+it.qty || 0) * (+it.price || 0)) + ' ' + t('rial')));
  if (inv.labor) L.push('• ' + t('invLabor') + ' — ' + money(inv.labor) + ' ' + t('rial'));
  if (inv.discount) L.push('• ' + t('invDiscount') + ' — −' + money(inv.discount) + ' ' + t('rial'));
  if (tt.tax) L.push('• ' + t('invTax') + (tt.taxRate ? ' (' + faNum(tt.taxRate) + '%)' : '') + ' — ' + money(tt.tax) + ' ' + t('rial'));
  L.push('');
  L.push('💰 ' + t('invGrand') + ': ' + money(tt.grand) + ' ' + t('rial'));
  if (tt.paid) { L.push('✅ ' + t('invPaid') + ': ' + money(tt.paid) + ' ' + t('rial')); L.push('⏳ ' + t('invBalance') + ': ' + money(tt.balance) + ' ' + t('rial')); }
  return L.join('\n');
}
