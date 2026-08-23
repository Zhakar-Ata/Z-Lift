/* ================= MEASUREMENT FIELDS (diagnostics) ================= */
/* Measurement field catalogue.
   Each field has a stable id, bilingual label, unit and category.
   `eval` returns {status, reason, next} based purely on a numeric value plus
   the project/elevator context. Status is one of normal/attention/critical/
   unknown. A field WITHOUT an eval is always 'unknown' — we never guess a
   limit that has no verified basis. */
var THRESHOLD_CLASS = {
  UNIVERSAL: 'UNIVERSAL', CONFIGURATION: 'CONFIGURATION_DEPENDENT', MANUFACTURER: 'MANUFACTURER_DEPENDENT',
  EQUIPMENT: 'EQUIPMENT_DEPENDENT', STANDARD: 'STANDARD_DEPENDENT', UNKNOWN: 'UNKNOWN'
};
function configuredRangeEval(v, ctx) {
  const lo = parseNum(ctx && ctx.expectedMin), hi = parseNum(ctx && ctx.expectedMax);
  if (lo == null && hi == null) return null;
  const low = lo != null && v < lo, high = hi != null && v > hi;
  if (!low && !high) return {
    status: 'normal',
    reason: { fa: 'داخل بازه مورد انتظارِ ثبت‌شده برای همین تجهیز/آزمون است.', en: 'Within the expected range configured for this equipment/test.' }
  };
  return {
    status: (ctx && ctx.outOfRangeStatus === 'critical') ? 'critical' : 'attention',
    reason: { fa: 'خارج از بازه مورد انتظارِ ثبت‌شده است؛ این نتیجه الزام عمومی استاندارد نیست.', en: 'Outside the configured expected range; this is not a universal standard requirement.' },
    next: { fa: 'مرجع بازه، روش آزمون و مشخصات تجهیز را بازبینی کنید.', en: 'Review the range source, test method and equipment data.' }
  };
}
function nominalToleranceEval(v, ctx, faLabel, enLabel) {
  const nominal = parseNum(ctx && ctx.nominalVoltage);
  const tolerance = parseNum(ctx && ctx.tolerancePercent);
  if (!(nominal > 0) || !(tolerance >= 0)) return {
    status: 'unknown',
    reason: { fa: `برای ارزیابی ${faLabel}، ولتاژ نامی و تلرانس مجازِ پروژه/سازنده لازم است.`, en: `Nominal voltage and the configured/manufacturer tolerance are required to evaluate ${enLabel}.` },
    next: { fa: 'مقادیر را از پلاک، طرح برق یا سند فنی معتبر ثبت کنید.', en: 'Enter the values from the nameplate, electrical design or a valid technical document.' }
  };
  const lo = nominal * (1 - tolerance / 100), hi = nominal * (1 + tolerance / 100);
  if (v >= lo && v <= hi) return {
    status: 'normal',
    reason: { fa: `داخل تلرانس پیکربندی‌شده ±${tolerance}٪ حول ${nominal} V است.`, en: `Within the configured ±${tolerance}% tolerance around ${nominal} V.` }
  };
  return {
    status: 'attention',
    reason: { fa: `خارج از تلرانس پیکربندی‌شده ±${tolerance}٪ حول ${nominal} V است.`, en: `Outside the configured ±${tolerance}% tolerance around ${nominal} V.` },
    next: { fa: 'تغذیه را تحت شرایط آزمون ثبت‌شده بررسی و با مرجع پیکربندی تطبیق دهید.', en: 'Check the supply under the recorded test conditions and compare it with the configured reference.' }
  };
}
var MEASURE_FIELDS = [
  { id: 'v_rs', fa: 'ولتاژ R-S', en: 'Voltage R-S', unit: 'V', cat: 'elec', decimals: 0, min: 0, thresholdClass: THRESHOLD_CLASS.CONFIGURATION,
    eval: (v, ctx) => nominalToleranceEval(v, ctx, 'ولتاژ سه‌فاز', 'three-phase voltage') },
  { id: 'v_st', fa: 'ولتاژ S-T', en: 'Voltage S-T', unit: 'V', cat: 'elec', decimals: 0, min: 0, thresholdClass: THRESHOLD_CLASS.CONFIGURATION,
    eval: (v, ctx) => nominalToleranceEval(v, ctx, 'ولتاژ سه‌فاز', 'three-phase voltage') },
  { id: 'v_rt', fa: 'ولتاژ R-T', en: 'Voltage R-T', unit: 'V', cat: 'elec', decimals: 0, min: 0, thresholdClass: THRESHOLD_CLASS.CONFIGURATION,
    eval: (v, ctx) => nominalToleranceEval(v, ctx, 'ولتاژ سه‌فاز', 'three-phase voltage') },
  { id: 'v_control', fa: 'ولتاژ کنترل/فرمان', en: 'Control supply voltage', unit: 'V', cat: 'control', decimals: 0, min: 0, placeholder: 'مثلاً ۱۱۰ / ۶۰ / ۲۴', thresholdClass: THRESHOLD_CLASS.EQUIPMENT,
    eval: (v, ctx) => nominalToleranceEval(v, { nominalVoltage: ctx && ctx.controlNominalVoltage, tolerancePercent: ctx && ctx.controlTolerancePercent }, 'ولتاژ مدار فرمان', 'control voltage') },
  { id: 'i_motor', fa: 'جریان موتور', en: 'Motor current', unit: 'A', cat: 'drive', decimals: 1, min: 0, thresholdClass: THRESHOLD_CLASS.MANUFACTURER,
    eval: (v, ctx) => {
      const max = parseNum(ctx && ctx.expectedMax);
      if (max == null) return { status: 'unknown', reason: { fa: 'حد جریان به موتور، پلاک، سیکل کاری و تنظیمات درایو وابسته است.', en: 'The current limit depends on the motor, nameplate, duty cycle and drive settings.' }, next: { fa: 'مدل دستگاه و حد مجاز سازنده لازم است.', en: 'The device model and manufacturer limit are required.' } };
      return configuredRangeEval(v, ctx);
    } },
  { id: 'v_dcbus', fa: 'ولتاژ باس DC درایو', en: 'Drive DC bus voltage', unit: 'V', cat: 'drive', decimals: 0, min: 0, thresholdClass: THRESHOLD_CLASS.MANUFACTURER,
    eval: (v, ctx) => {
      const configured = configuredRangeEval(v, ctx);
      if (configured) return configured;
      return { status: 'unknown', reason: { fa: 'حد باس DC به توپولوژی، شبکه، حالت کاری و مدل درایو وابسته است.', en: 'The DC-bus limit depends on topology, supply, operating state and drive model.' }, next: { fa: 'مدل دستگاه لازم است؛ بازه منوال همان مدل و شرایط اندازه‌گیری را ثبت کنید.', en: 'The device model is required; record the range from that model manual and the measurement conditions.' } };
    } },
  { id: 'i_brake', fa: 'جریان/ولتاژ بوبین ترمز', en: 'Brake coil voltage/current', unit: 'V', cat: 'drive', decimals: 0, min: 0, thresholdClass: THRESHOLD_CLASS.MANUFACTURER },
  { id: 'r_insulation', fa: 'مقاومت عایقی (میگر)', en: 'Insulation resistance', unit: 'MΩ', cat: 'elec', decimals: 1, min: 0, thresholdClass: THRESHOLD_CLASS.EQUIPMENT,
    eval: (v, ctx) => {
      const configured = configuredRangeEval(v, ctx);
      if (configured && ctx && ctx.reference && ctx.testMethod && ctx.testVoltage) return configured;
      return {
        status: 'unknown',
        reason: { fa: 'حد مجاز به مدار تحت آزمون، تجهیز، ولتاژ آزمون، روش آزمون و مرجع معتبر وابسته است.', en: 'The acceptable limit depends on the circuit, equipment, test voltage, method and a valid reference.' },
        next: { fa: 'مدار/موتور/کابل، ولتاژ تست، روش، سازنده/مدل و مرجع حد مجاز را ثبت کنید.', en: 'Record the circuit/motor/cable, test voltage, method, manufacturer/model and the limit source.' }
      };
    } },
  { id: 'p_hyd', fa: 'فشار هیدرولیک', en: 'Hydraulic pressure', unit: 'bar', cat: 'mech', decimals: 1, min: 0, thresholdClass: THRESHOLD_CLASS.EQUIPMENT },
  { id: 'temp', fa: 'دما (موتور/روغن)', en: 'Temperature (motor/oil)', unit: '°C', cat: 'mech', decimals: 0, thresholdClass: THRESHOLD_CLASS.EQUIPMENT,
    eval: (v, ctx) => configuredRangeEval(v, ctx) || { status: 'unknown', reason: { fa: 'حد دما به تجهیز، کلاس عایقی، روغن، محیط و الزام سازنده وابسته است.', en: 'Temperature limits depend on equipment, insulation class, oil, ambient conditions and manufacturer requirements.' } } },
  { id: 'lvl_err', fa: 'خطای همسطحی', en: 'Leveling error', unit: 'mm', cat: 'mech', decimals: 0, signed: true, thresholdClass: THRESHOLD_CLASS.CONFIGURATION,
    eval: (v, ctx) => configuredRangeEval(v, ctx) || {
      status: 'unknown',
      reason: { fa: 'حد ±۱۰ یا ±۲۰ میلی‌متر بدون متن مصوبِ ویرایش/بند و پیکربندی قابل اعمال، الزام عمومی تلقی نمی‌شود.', en: 'A ±10 or ±20 mm limit is not treated as universal without the approved edition/clause and applicable configuration.' },
      next: { fa: 'بازه پروژه/سازنده یا متن استاندارد مصوب را با نوع عملکرد (توقف یا هم‌ترازسازی مجدد) ثبت کنید.', en: 'Record the project/manufacturer range or approved standard text and distinguish stopping from re-levelling.' }
    } },
  { id: 't_travel', fa: 'زمان سفر', en: 'Travel time', unit: 's', cat: 'mech', decimals: 1, min: 0, thresholdClass: THRESHOLD_CLASS.CONFIGURATION },
  { id: 'vib', fa: 'لرزش (توصیفی)', en: 'Vibration (descriptive)', unit: '', cat: 'mech', text: true, thresholdClass: THRESHOLD_CLASS.UNKNOWN },
  { id: 'v_rated', fa: 'سرعت نامی کابین', en: 'Rated car speed', unit: 'm/s', cat: 'safety', decimals: 2, min: 0, thresholdClass: THRESHOLD_CLASS.EQUIPMENT },
  { id: 'v_gov', fa: 'سرعت تریپ گاورنر', en: 'Governor tripping speed', unit: 'm/s', cat: 'safety', decimals: 2, min: 0, thresholdClass: THRESHOLD_CLASS.STANDARD,
    eval: (v, ctx) => configuredRangeEval(v, ctx) || { status: 'unknown', reason: { fa: 'ارزیابی نیازمند نوع گاورنر/پاراشوت، سرعت نامی و مرجع راستی‌آزمایی‌شده است.', en: 'Evaluation requires governor/safety-gear type, rated speed and a verified reference.' }, next: { fa: 'مدل دستگاه لازم است و حد پلاک/گواهی آزمون باید ثبت شود.', en: 'The device model and nameplate/test-certificate limit are required.' } } },
  { id: 'door_force', fa: 'نیروی بستن درب', en: 'Door closing force', unit: 'N', cat: 'safety', decimals: 0, min: 0, thresholdClass: THRESHOLD_CLASS.STANDARD,
    eval: (v, ctx) => configuredRangeEval(v, ctx) || { status: 'unknown', reason: { fa: 'منبع دقیق حد نیروی این پیکربندی در کد موجود راستی‌آزمایی نشده است.', en: 'The exact force limit source for this configuration is not verified in the codebase.' } } },
  { id: 'door_gap', fa: 'فاصله لته‌های درب', en: 'Door panel gap', unit: 'mm', cat: 'safety', decimals: 0, min: 0, thresholdClass: THRESHOLD_CLASS.STANDARD,
    eval: (v, ctx) => configuredRangeEval(v, ctx) || { status: 'unknown', reason: { fa: 'نوع درب، وضعیت سایش و مرجع دقیق حد باید مشخص و راستی‌آزمایی شود.', en: 'Door type, wear condition and the exact limit source must be specified and verified.' } } },
  { id: 'lock_eng', fa: 'درگیری قفل درب طبقه', en: 'Landing lock engagement', unit: 'mm', cat: 'safety', decimals: 0, min: 0, thresholdClass: THRESHOLD_CLASS.STANDARD,
    eval: (v, ctx) => configuredRangeEval(v, ctx) || { status: 'unknown', reason: { fa: 'مرجع دقیق حد درگیری برای قفل/ویرایش مربوط در مخزن موجود نیست.', en: 'The exact engagement-limit source for the applicable lock/edition is not available in the repository.' }, next: { fa: 'نوع و مدل قفل و متن مصوب/گواهی سازنده لازم است.', en: 'Lock type/model and the approved text or manufacturer certificate are required.' } } },
  { id: 'safety_chain', fa: 'وضعیت زنجیرهٔ ایمنی', en: 'Safety chain state', unit: '', cat: 'safety', state: ['closed', 'open'], thresholdClass: THRESHOLD_CLASS.UNIVERSAL,
    eval: (v) => v === 'open' ? { status: 'critical', reason: { fa: 'زنجیرهٔ ایمنی باز است؛ حرکت عادی مجاز نیست.', en: 'The safety chain is open; normal operation is not permitted.' }, next: { fa: 'ایزوله کنید، نقطه قطع را بدون پل‌زدن پیدا و پس از تعمیر مدار را کامل بازیابی و آزمون کنید.', en: 'Isolate, locate the open point without bridging, then fully restore and test after repair.' } } : v === 'closed' ? { status: 'attention', reason: { fa: 'بسته بودن زنجیره فقط یک مشاهده است و سلامت تک‌تک وسایل ایمنی را اثبات نمی‌کند.', en: 'A closed chain is only an observation; it does not prove every safety device is sound.' } } : { status: 'unknown' } },
  { id: 'door_lock', fa: 'قفل درب طبقه', en: 'Landing door lock', unit: '', cat: 'safety', state: ['locked', 'unlocked'], thresholdClass: THRESHOLD_CLASS.UNIVERSAL,
    eval: (v) => v === 'unlocked' ? { status: 'critical', reason: { fa: 'قفل درب درگیر نیست؛ آسانسور باید از سرویس خارج بماند.', en: 'The landing lock is not engaged; keep the lift out of service.' } } : v === 'locked' ? { status: 'attention', reason: { fa: 'درگیر بودن مشاهده‌شده جای آزمون مکانیکی و الکتریکی قفل را نمی‌گیرد.', en: 'Observed engagement does not replace mechanical and electrical lock testing.' } } : { status: 'unknown' } },
  { id: 'estop', fa: 'کلید توقف اضطراری', en: 'Emergency stop', unit: '', cat: 'safety', state: ['released', 'pressed'], thresholdClass: THRESHOLD_CLASS.UNIVERSAL,
    eval: (v) => v === 'pressed' ? { status: 'critical', reason: { fa: 'کلید توقف فعال است؛ علت را قبل از ریست بررسی کنید.', en: 'The stop switch is active; investigate before resetting.' } } : v === 'released' ? { status: 'unknown', reason: { fa: 'رها بودن کلید به‌تنهایی عملکرد صحیح آن را تأیید نمی‌کند.', en: 'A released switch alone does not verify correct operation.' } } : { status: 'unknown' } }
];
var MEASURE_FIELDS_BY_ID = MEASURE_FIELDS.reduce((m, f) => { m[f.id] = f; return m; }, {});
var MEASURE_CATS = [
  { id: 'elec', key: 'measCat_elec', icon: '⚡' },
  { id: 'control', key: 'measCat_control', icon: '🎛️' },
  { id: 'safety', key: 'measCat_safety', icon: '🛡️' },
  { id: 'drive', key: 'measCat_drive', icon: '⚙️' },
  { id: 'mech', key: 'measCat_mech', icon: '🔧' }
];
var MEAS_STATUS_META = {
  normal:   { icon: '🟢', key: 'measStatusNormal',   cls: 'b-green' },
  attention:{ icon: '🟡', key: 'measStatusAttention', cls: 'b-amber' },
  critical: { icon: '🔴', key: 'measStatusCritical', cls: 'b-red' },
  model:    { icon: '🔵', key: 'measStatusModel', cls: 'b-blue' },
  unknown:  { icon: '⚪', key: 'measStatusUnknown', cls: 'b-gray' }
};
/* parse Persian/Arabic/European numerals and thousands separators into a Number.
   Returns null when empty/invalid. */
function parseNum(s) {
  if (s == null) return null;
  if (typeof s === 'number') return isFinite(s) ? s : null;
  let str = String(s).trim();
  if (!str) return null;
  str = str.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
           .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  // accept both 1,234.5 and 1٫234٫5 (Arabic decimal)
  if (str.indexOf(',') !== -1 || str.indexOf('٬') !== -1) {
    const lastDot = Math.max(str.lastIndexOf('.'), str.lastIndexOf('٫'));
    const lastComma = Math.max(str.lastIndexOf(','), str.lastIndexOf('٬'));
    if (lastComma > lastDot) str = str.replace(/[.,٬]/g, m => (m === ',' || m === '٬') ? '.' : '');
    else str = str.replace(/,/g, '');
  }
  str = str.replace(/٫/g, '.').replace(/[^\d.\-]/g, '');
  if (str === '' || str === '-' || str === '.') return null;
  const n = Number(str);
  return isFinite(n) ? n : null;
}
/* evaluate one numeric/state measurement against its field definition */
function evalMeasurement(m) {
  const f = MEASURE_FIELDS_BY_ID[m.typeId];
  const unknown = (reason, next) => ({
    status: 'unknown', thresholdClass: f ? f.thresholdClass : THRESHOLD_CLASS.UNKNOWN,
    reason: reason || { fa: 'اطلاعات کافی برای ارزیابی فنی وجود ندارد.', en: 'There is insufficient information for a technical evaluation.' },
    next: next || { fa: 'مشخصات تجهیز، پیکربندی، روش آزمون و مرجع معتبر را ثبت کنید.', en: 'Record equipment, configuration, test method and a valid reference.' }
  });
  if (!f) return unknown({ fa: 'نوع اندازه‌گیری شناخته‌شده نیست.', en: 'Unknown measurement type.' });
  const ctx = Object.assign({}, m.context || {}, {
    expectedMin: m.expectedMin != null ? m.expectedMin : (m.expectedRange && m.expectedRange.min != null ? m.expectedRange.min : (m.context && m.context.expectedMin)),
    expectedMax: m.expectedMax != null ? m.expectedMax : (m.expectedRange && m.expectedRange.max != null ? m.expectedRange.max : (m.context && m.context.expectedMax)),
    reference: m.reference || (m.context && m.context.reference) || '',
    testMethod: m.testMethod || (m.context && m.context.testMethod) || '',
    testVoltage: m.testVoltage || (m.context && m.context.testVoltage) || '',
    manufacturer: m.manufacturer || (m.context && m.context.manufacturer) || '',
    model: m.model || (m.context && m.context.model) || ''
  });
  let result;
  try {
    if (f.state) result = f.eval ? f.eval(m.value, ctx) : null;
    else if (f.text) result = unknown({ fa: 'اندازه‌گیری توصیفی است؛ قضاوت خودکار انجام نمی‌شود.', en: 'This is a descriptive measurement; no automatic judgement is made.' });
    else {
      const n = parseNum(m.value);
      if (n == null || isNaN(n)) return unknown({ fa: 'مقدار عددی معتبر نیست.', en: 'The numeric value is invalid.' });
      result = f.eval ? f.eval(n, ctx) : configuredRangeEval(n, ctx);
    }
  } catch (e) { result = null; }
  if (!result || !['normal', 'attention', 'critical', 'unknown'].includes(result.status)) result = unknown();
  result.thresholdClass = result.thresholdClass || f.thresholdClass || THRESHOLD_CLASS.UNKNOWN;
  if (result.status === 'unknown' && !result.reason) return unknown();
  return result;
}
