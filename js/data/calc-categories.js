/* ================= v8: CALC CATEGORIES ================= */
var CALC_CATS = [
  { id: 'all', fa: 'همه', en: 'All' },
  { id: 'elec', fa: '⚡ برق', en: 'Electrical' },
  { id: 'traction', fa: '⚙️ کششی', en: 'Traction' },
  { id: 'ropes', fa: '🔗 بکسل و کشش', en: 'Ropes' },
  { id: 'hyd', fa: '🛢️ هیدرولیک', en: 'Hydraulic' },
  { id: 'motor', fa: '🌀 موتور و حرکت', en: 'Motor' },
  { id: 'door', fa: '🚪 درب', en: 'Doors' },
  { id: 'std', fa: '📏 استاندارد EN 81-20', en: 'EN 81-20' },
  { id: 'quick', fa: '⚡ سریع', en: 'Quick' }
];
/* categorize existing calculators */
(() => {
  const map = { c1: 'traction', c2: 'traction', c3: 'traction', c4: 'ropes', c5: 'hyd', c6: 'hyd', c7: 'traction', c8: 'elec', c9: 'elec', c10: 'elec', c11: 'hyd', c12: 'traction' };
  CALCULATORS.forEach(c => { c.cat = map[c.id] || 'quick'; });
})();

/* ---- new calculators ---- */
CALCULATORS.push(
  {
    id: 'e1', cat: 'elec',
    title: { fa: 'قانون اهم (V=I×R)', en: "Ohm's law" },
    desc: { fa: 'دو مقدار را بده، سومی محاسبه می‌شود (صفر = مجهول)', en: 'Enter two values; zero = unknown' },
    formula: 'V = I × R | P = V × I',
    inputs: [
      { id: 'v', label: { fa: 'ولتاژ', en: 'Voltage' }, value: 220, unit: 'V' },
      { id: 'i', label: { fa: 'جریان', en: 'Current' }, value: 0, step: 0.1, unit: 'A' },
      { id: 'r', label: { fa: 'مقاومت', en: 'Resistance' }, value: 48, step: 0.1, unit: 'Ω' }
    ],
    compute(x) {
      let { v, i, r } = x;
      if (!v && i && r) v = i * r;
      else if (!i && v && r) i = v / r;
      else if (!r && v && i) r = v / i;
      const p = v * i;
      return [
        { label: { fa: 'ولتاژ', en: 'V' }, val: v.toFixed(1) + ' V' },
        { label: { fa: 'جریان', en: 'I' }, val: i.toFixed(2) + ' A' },
        { label: { fa: 'مقاومت', en: 'R' }, val: r.toFixed(1) + ' Ω' },
        { label: { fa: 'توان', en: 'P' }, val: p.toFixed(1) + ' W' }
      ];
    },
    assume: { fa: 'مدار DC یا AC مقاومتی خالص؛ برای بار سلفی ضریب توان لازم است.', en: 'DC or pure resistive AC.' },
    note: { fa: 'برای تست بوبین‌ها و مقاومت ترمز کاربردی است — مقدار اندازه‌گیری‌شده را با پلاک مقایسه کنید.', en: 'Useful for coils and brake resistors.' }
  },
  {
    id: 'e2', cat: 'elec',
    title: { fa: 'توان تک‌فاز', en: 'Single-phase power' },
    desc: { fa: 'توان مصرفی بار تک‌فاز (روشنایی کابین، سردرب...)', en: 'Single-phase load power' },
    formula: 'P = U × I × cosφ',
    inputs: [
      { id: 'u', label: { fa: 'ولتاژ', en: 'Voltage' }, value: 220, unit: 'V' },
      { id: 'i', label: { fa: 'جریان', en: 'Current' }, value: 2, step: 0.1, unit: 'A' },
      { id: 'pf', label: { fa: 'ضریب توان', en: 'cosφ' }, value: 0.9, step: 0.05 }
    ],
    compute(v) {
      const p = v.u * v.i * v.pf;
      return [
        { label: { fa: 'توان اکتیو', en: 'P' }, val: p.toFixed(0) + ' W' },
        { label: { fa: 'توان ظاهری', en: 'S' }, val: (v.u * v.i).toFixed(0) + ' VA' }
      ];
    },
    assume: { fa: 'بار تک‌فاز؛ cosφ تخمینی مگر اندازه‌گیری شود.', en: 'Single-phase; estimated pf.' },
    note: { fa: 'راهنمای تکنسین — نه طراحی نهایی.', en: 'Guidance only.' }
  },
  {
    id: 'e3', cat: 'elec',
    title: { fa: 'kW ↔ اسب بخار', en: 'kW ↔ HP' },
    desc: { fa: 'تبدیل توان موتور', en: 'Motor power conversion' },
    formula: '1 HP ≈ 0.7457 kW',
    inputs: [{ id: 'kw', label: { fa: 'توان (kW) — یا صفر', en: 'kW (or 0)' }, value: 7.5, step: 0.1 }, { id: 'hp', label: { fa: 'توان (HP) — یا صفر', en: 'HP (or 0)' }, value: 0, step: 0.1 }],
    compute(v) {
      const kw = v.kw || v.hp * 0.7457;
      const hp = v.hp || v.kw / 0.7457;
      return [{ label: { fa: 'کیلووات', en: 'kW' }, val: kw.toFixed(2) + ' kW' }, { label: { fa: 'اسب بخار', en: 'HP' }, val: hp.toFixed(2) + ' HP' }];
    },
    assume: { fa: 'اسب بخار مکانیکی (0.7457kW).', en: 'Mechanical HP.' },
    note: { fa: 'موتورهای قدیمی ایرانی/ایتالیایی اغلب با HP پلاک خورده‌اند.', en: 'Older motors are often HP-rated.' }
  },
  {
    id: 'e4', cat: 'motor',
    title: { fa: 'دور سنکرون، قطب و فرکانس', en: 'Sync speed, poles, frequency' },
    desc: { fa: 'رابطه فرکانس، تعداد قطب و دور موتور', en: 'Frequency-poles-RPM relation' },
    formula: 'Ns = 120 × f / P',
    inputs: [
      { id: 'f', label: { fa: 'فرکانس', en: 'Frequency' }, value: 50, unit: 'Hz' },
      { id: 'p', label: { fa: 'تعداد قطب', en: 'Poles' }, value: 4 },
      { id: 'slip', label: { fa: 'لغزش (٪) — موتور القایی', en: 'Slip %' }, value: 4, step: 0.5 }
    ],
    compute(v) {
      const ns = 120 * v.f / (v.p || 1);
      const n = ns * (1 - v.slip / 100);
      return [
        { label: { fa: 'دور سنکرون', en: 'Sync RPM' }, val: ns.toFixed(0) + ' rpm' },
        { label: { fa: 'دور واقعی تقریبی', en: 'Actual RPM' }, val: n.toFixed(0) + ' rpm' }
      ];
    },
    assume: { fa: 'لغزش نمونه موتور القایی ۲ تا ۵٪؛ موتور PM گیرلس لغزش ندارد.', en: 'Induction slip 2–5%; PM has none.' },
    note: { fa: 'مثلاً ۴ قطب ۵۰ هرتز = ۱۵۰۰ دور سنکرون، واقعی ~۱۴۴۰.', en: '4-pole 50Hz = 1500 sync.' }
  },
  {
    id: 'e5', cat: 'elec',
    title: { fa: 'مصرف انرژی', en: 'Energy consumption' },
    desc: { fa: 'برآورد مصرف برق آسانسور در ماه', en: 'Monthly energy estimate' },
    formula: 'E = P × t × سفر در روز × 30',
    inputs: [
      { id: 'p', label: { fa: 'توان موتور', en: 'Power' }, value: 7.5, step: 0.5, unit: 'kW' },
      { id: 't', label: { fa: 'زمان متوسط هر سفر', en: 'Avg trip time' }, value: 20, unit: 's' },
      { id: 'n', label: { fa: 'تعداد سفر در روز', en: 'Trips/day' }, value: 100 },
      { id: 'load', label: { fa: 'ضریب بار متوسط (٪)', en: 'Avg load %' }, value: 50 }
    ],
    compute(v) {
      const kwhDay = v.p * (v.load / 100) * (v.t / 3600) * v.n;
      return [
        { label: { fa: 'مصرف روزانه', en: 'Daily' }, val: kwhDay.toFixed(1) + ' kWh' },
        { label: { fa: 'مصرف ماهانه تقریبی', en: 'Monthly' }, val: (kwhDay * 30).toFixed(0) + ' kWh' }
      ];
    },
    assume: { fa: 'مصرف استندبای (تابلو، روشنایی) لحاظ نشده؛ کششی با وزنه در برخی سفرها ژنراتوری است.', en: 'Standby excluded.' },
    note: { fa: 'برآورد اولیه برای پاسخ به کارفرما — نه محاسبه قبض.', en: 'Rough estimate only.' }
  },
  {
    id: 'm1', cat: 'motor',
    title: { fa: 'گشتاور موتور', en: 'Motor torque' },
    desc: { fa: 'گشتاور از توان و دور', en: 'Torque from power & RPM' },
    formula: 'T = 9550 × P / n',
    inputs: [
      { id: 'p', label: { fa: 'توان', en: 'Power' }, value: 7.5, step: 0.1, unit: 'kW' },
      { id: 'n', label: { fa: 'دور موتور', en: 'RPM' }, value: 1440, unit: 'rpm' }
    ],
    compute(v) {
      const tq = 9550 * v.p / (v.n || 1);
      return [{ label: { fa: 'گشتاور', en: 'Torque' }, val: tq.toFixed(1) + ' N·m' }];
    },
    assume: { fa: 'گشتاور نامی در دور نامی؛ گشتاور راه‌اندازی متفاوت است.', en: 'Rated torque at rated speed.' },
    note: { fa: 'گیرلس‌ها دور پایین و گشتاور بالا دارند — به همین دلیل جریان نامی‌شان بالاتر از حد انتظار است.', en: 'Gearless: low RPM, high torque.' }
  },
  {
    id: 'm2', cat: 'motor',
    title: { fa: 'نسبت گیربکس و سرعت کابین', en: 'Gear ratio & car speed' },
    desc: { fa: 'سرعت کابین از دور موتور، گیربکس، قطر فلکه و سیستم بکسل‌بندی', en: 'Car speed from RPM, ratio, sheave, roping' },
    formula: 'v = (n / i) × π × D / 60 / roping',
    inputs: [
      { id: 'n', label: { fa: 'دور موتور', en: 'Motor RPM' }, value: 1440, unit: 'rpm' },
      { id: 'i', label: { fa: 'نسبت گیربکس (گیرلس=1)', en: 'Gear ratio' }, value: 47, step: 0.5 },
      { id: 'd', label: { fa: 'قطر فلکه کشش', en: 'Sheave dia.' }, value: 550, unit: 'mm' },
      { id: 'rop', label: { fa: 'بکسل‌بندی (1 یا 2)', en: 'Roping' }, value: 1 }
    ],
    compute(v) {
      const speed = (v.n / (v.i || 1)) * Math.PI * (v.d / 1000) / 60 / (v.rop || 1);
      return [
        { label: { fa: 'دور فلکه', en: 'Sheave RPM' }, val: (v.n / (v.i || 1)).toFixed(1) + ' rpm' },
        { label: { fa: 'سرعت کابین', en: 'Car speed' }, val: speed.toFixed(2) + ' m/s' }
      ];
    },
    assume: { fa: 'بدون لغزش بکسل؛ در 2:1 سرعت کابین نصف سرعت بکسل است.', en: 'No rope slip; 2:1 halves car speed.' },
    note: { fa: 'برای کنترل صحت پلاک موتور/گیربکس با سرعت نامی آسانسور عالی است.', en: 'Great for verifying nameplates.' }
  },
  {
    id: 'r1', cat: 'ropes',
    title: { fa: 'طول و وزن سیم‌بکسل', en: 'Rope length & weight' },
    desc: { fa: 'برآورد متراژ و وزن بکسل مورد نیاز', en: 'Estimate rope length & weight' },
    formula: 'L ≈ (H + overhead) × falls × n | W = L × w',
    inputs: [
      { id: 'h', label: { fa: 'ارتفاع مسیر', en: 'Travel' }, value: 30, unit: 'm' },
      { id: 'extra', label: { fa: 'اضافه سر و ته (جمع)', en: 'Extra ends' }, value: 8, unit: 'm' },
      { id: 'rop', label: { fa: 'بکسل‌بندی (1 یا 2)', en: 'Roping' }, value: 1 },
      { id: 'n', label: { fa: 'تعداد رشته', en: 'Ropes' }, value: 5 },
      { id: 'w', label: { fa: 'وزن هر متر بکسل', en: 'kg per m' }, value: 0.4, step: 0.05, unit: 'kg/m' }
    ],
    compute(v) {
      const per = (v.h + v.extra) * (v.rop == 2 ? 2 : 1);
      const total = per * v.n;
      return [
        { label: { fa: 'طول هر رشته', en: 'Per rope' }, val: per.toFixed(0) + ' m' },
        { label: { fa: 'متراژ کل', en: 'Total length' }, val: total.toFixed(0) + ' m' },
        { label: { fa: 'وزن کل تقریبی', en: 'Total weight' }, val: (total * v.w).toFixed(0) + ' kg' }
      ];
    },
    assume: { fa: 'وزن نمونه: بکسل ⌀۸ ~۰.۲۵، ⌀۱۰ ~۰.۴۰، ⌀۱۳ ~۰.۶۵ kg/m (به کاتالوگ سازنده مراجعه شود).', en: 'Typical: Ø8 ~0.25, Ø10 ~0.40, Ø13 ~0.65 kg/m.' },
    note: { fa: 'همیشه چند متر اضافه سفارش بده — کوتاه آمدن بکسل یعنی دوباره‌کاری کامل.', en: 'Always order extra meters.' }
  },
  {
    id: 'r2', cat: 'ropes', special: 'alpha',
    title: { fa: 'زاویه آلفا (α) — کششی 1:1', en: 'Alpha angle (α) — 1:1 traction' },
    desc: { fa: 'زاویه پیچش بکسل روی فلکه کشش با فلکه هرزگرد (گردون)', en: 'Rope wrap angle on traction sheave with diverter' },
    formula: 'β = arctan(X / Y) | α = 180° − β',
    inputs: [
      { id: 'x', label: { fa: 'فاصله افقی مرکز فلکه کشش تا مرکز فلکه هرزگرد', en: 'Horizontal distance sheave↔diverter centers' }, value: 60, unit: 'cm' },
      { id: 'y', label: { fa: 'فاصله عمودی مرکز فلکه کشش تا مرکز فلکه هرزگرد', en: 'Vertical distance sheave↔diverter centers' }, value: 25, step: 0.5, unit: 'cm' }
    ],
    compute(v) {
      if (!v.y) return [{ label: { fa: 'خطا', en: 'Error' }, val: 'Y > 0' }];
      const beta = Math.atan(v.x / v.y) * 180 / Math.PI;
      const alpha = 180 - beta;
      return [
        { label: { fa: 'زاویه انحراف β', en: 'Deviation β' }, val: beta.toFixed(1) + '°' },
        { label: { fa: 'زاویه پیچش α', en: 'Wrap angle α' }, val: alpha.toFixed(1) + '°' },
        { label: { fa: 'α بر حسب رادیان', en: 'α in rad' }, val: (alpha * Math.PI / 180).toFixed(3) + ' rad' }
      ];
    },
    assume: { fa: 'مدل ساده‌شده هندسی: رشته سمت کابین قائم فرض شده، قطر فلکه‌ها و خیز بکسل صرف‌نظر شده است. اگر رشته کابین قائم نیست یا اختلاف قطر فلکه‌ها زیاد است، زاویه واقعی متفاوت خواهد بود.', en: 'Simplified geometry: car-side fall assumed vertical; pulley diameters and rope sag neglected.' },
    note: { fa: ALPHA_ANGLE_WARNING_FA, en: '⚠️ This is a geometric calculation and does not by itself confirm traction capability, safety or compliance. Validation requires groove data, friction, rope forces, counterweight, acceleration and manufacturer data. The standard-annex reference is unverified in this repository.' }
  },
  {
    id: 'h1', cat: 'hyd',
    title: { fa: 'قطر سیلندر لازم', en: 'Required cylinder diameter' },
    desc: { fa: 'قطر پیستون از بار و فشار کار هدف', en: 'Ram diameter from load & target pressure' },
    formula: 'A = F / p | d = √(4A / π)',
    inputs: [
      { id: 'm', label: { fa: 'جرم کل (کابین+بار)', en: 'Total mass' }, value: 1400, unit: 'kg' },
      { id: 'p', label: { fa: 'فشار کار هدف', en: 'Target pressure' }, value: 35, unit: 'bar' },
      { id: 'rop', label: { fa: 'سیستم (1 / 2)', en: 'System' }, value: 1 }
    ],
    compute(v) {
      const F = v.m * 9.81 * (v.rop == 2 ? 2 : 1);
      const A = F / (v.p * 100000);
      const d = Math.sqrt(4 * A / Math.PI) * 1000;
      return [
        { label: { fa: 'نیرو', en: 'Force' }, val: (F / 1000).toFixed(1) + ' kN' },
        { label: { fa: 'سطح لازم', en: 'Area' }, val: (A * 10000).toFixed(1) + ' cm²' },
        { label: { fa: 'قطر پیستون محاسبه‌شده', en: 'Calc. diameter' }, val: d.toFixed(0) + ' mm' }
      ];
    },
    assume: { fa: 'وزن پیستون و اصطکاک صرف‌نظر شده؛ قطر نهایی از سایزهای استاندارد سازنده جک انتخاب می‌شود.', en: 'Pick final size from manufacturer standard sizes.' },
    note: { fa: 'کمانش (buckling) پیستون‌های بلند باید جداگانه توسط سازنده کنترل شود.', en: 'Buckling must be checked by the manufacturer.' }
  },
  {
    id: 'd1', cat: 'door',
    title: { fa: 'سرعت و سیکل درب', en: 'Door speed & cycle' },
    desc: { fa: 'سرعت متوسط لته و تعداد سیکل در ساعت', en: 'Panel speed and cycles per hour' },
    formula: 'v = s / t | cycles/h = 3600 / t_cycle',
    inputs: [
      { id: 's', label: { fa: 'کورس بازشو درب', en: 'Door opening' }, value: 800, unit: 'mm' },
      { id: 'topen', label: { fa: 'زمان باز شدن', en: 'Open time' }, value: 2.5, step: 0.1, unit: 's' },
      { id: 'tclose', label: { fa: 'زمان بسته شدن', en: 'Close time' }, value: 3.5, step: 0.1, unit: 's' },
      { id: 'dwell', label: { fa: 'زمان توقف باز', en: 'Dwell time' }, value: 4, step: 0.5, unit: 's' }
    ],
    compute(v) {
      const vOpen = v.s / 1000 / (v.topen || 1);
      const vClose = v.s / 1000 / (v.tclose || 1);
      const cyc = v.topen + v.tclose + v.dwell;
      return [
        { label: { fa: 'سرعت متوسط باز شدن', en: 'Avg open speed' }, val: vOpen.toFixed(2) + ' m/s' },
        { label: { fa: 'سرعت متوسط بسته شدن', en: 'Avg close speed' }, val: vClose.toFixed(2) + ' m/s' },
        { label: { fa: 'زمان کل سیکل درب', en: 'Cycle time' }, val: cyc.toFixed(1) + ' s' },
        { label: { fa: 'حداکثر سیکل در ساعت', en: 'Cycles/hour' }, val: (3600 / cyc).toFixed(0) }
      ];
    },
    assume: { fa: 'سرعت متوسط؛ پروفیل واقعی درب شتاب‌دار است. بسته شدن عمداً کندتر از باز شدن تنظیم می‌شود.', en: 'Average speeds; real profile has accel.' },
    note: { fa: 'سرعت متوسط به‌تنهایی ایمنی درب را اثبات نمی‌کند؛ انرژی، نیرو، وسیله بازگشایی و حدود قابل‌اعمال باید با ابزار مناسب و منبع مصوب/داده سازنده بررسی شوند.', en: 'Average speed alone does not establish door safety; verify energy, force, reopening device and applicable limits with suitable instruments and approved/manufacturer sources.' }
  }
);

/* ---- quick converters ---- */
var CONVERTERS = [
  { id: 'q1', fa: 'bar ↔ MPa', a: 'bar', b: 'MPa', f: x => x / 10, g: x => x * 10 },
  { id: 'q2', fa: 'bar ↔ PSI', a: 'bar', b: 'psi', f: x => x * 14.5038, g: x => x / 14.5038 },
  { id: 'q3', fa: 'میلی‌متر ↔ اینچ', a: 'mm', b: 'in', f: x => x / 25.4, g: x => x * 25.4 },
  { id: 'q4', fa: 'متر ↔ میلی‌متر', a: 'm', b: 'mm', f: x => x * 1000, g: x => x / 1000 },
  { id: 'q5', fa: 'm/s ↔ m/min', a: 'm/s', b: 'm/min', f: x => x * 60, g: x => x / 60 },
  { id: 'q6', fa: '°C ↔ °F', a: '°C', b: '°F', f: x => x * 9 / 5 + 32, g: x => (x - 32) * 5 / 9 },
  { id: 'q7', fa: 'کیلوگرم ↔ نیوتن', a: 'kg', b: 'N', f: x => x * 9.81, g: x => x / 9.81 },
  { id: 'q8', fa: 'kW ↔ HP', a: 'kW', b: 'HP', f: x => x / 0.7457, g: x => x * 0.7457 }
];

/* ---- Source-parameterised standards scenarios ----
   Coefficients/limits are deliberately blank: the repository has no official
   text to justify built-in safety thresholds. A qualified user must transcribe
   the applicable values from an approved source before calculation. */
CALCULATORS.push(
  {
    id: 'std-gov', cat: 'std',
    title: { fa: 'گاورنر: سناریوی بازه عملکرد', en: 'Governor: tripping-range scenario' },
    desc: { fa: 'محاسبه با ضریب و سقف واردشده از منبع مصوب/گواهی همان تجهیز', en: 'Calculate using a factor and cap entered from the approved source/certificate for that device' },
    formula: 'v_trip,min = k_min × v_rated | compare with entered v_trip,max',
    inputs: [
      { id: 'v', label: { fa: 'سرعت نامی کابین', en: 'Rated car speed' }, value: 1, step: 0.05, unit: 'm/s' },
      { id: 'kmin', label: { fa: 'ضریب حد پایین از منبع مصوب', en: 'Lower-bound factor from approved source' }, value: '' },
      { id: 'vmax', label: { fa: 'سقف قابل‌اعمال برای نوع تجهیز', en: 'Applicable cap for equipment type' }, value: '', unit: 'm/s' }
    ],
    compute(v) {
      if (v.v <= 0 || v.kmin <= 0 || v.vmax <= 0) throw new Error('source-values-required');
      const vmin = v.kmin * v.v;
      return [
        { label: { fa: 'کران پایین سناریو', en: 'Scenario lower bound' }, val: vmin.toFixed(3) + ' m/s' },
        { label: { fa: 'کران بالای واردشده', en: 'Entered upper bound' }, val: v.vmax.toFixed(3) + ' m/s' },
        { label: { fa: 'سازگاری ریاضی بازه', en: 'Mathematical range consistency' }, val: vmin < v.vmax ? (LANG === 'fa' ? 'کران پایین کمتر از بالا است' : 'lower bound is below upper bound') : (LANG === 'fa' ? 'ورودی‌ها بازه معتبر نمی‌سازند' : 'inputs do not form a valid range') }
      ];
    },
    assume: { fa: 'نوع گاورنر/پاراشوت، جهت آزمون، مدل، فرمور/گواهی و شرایط آزمون باید مشخص باشند؛ k و سقف را کاربر از منبع قابل‌اعمال وارد می‌کند.', en: 'Governor/safety-gear type, direction, model, certificate and test conditions must be known; the user enters k and the cap from the applicable source.' },
    note: { fa: 'خروجی فقط سناریوی ریاضی است و «محدوده مجاز» یا دستور آزمون اعلام نمی‌کند. مدل دستگاه لازم است.', en: 'Output is only a mathematical scenario; it does not declare an allowed range or test procedure. The device model is required.' }
  },
  {
    id: 'std-buffer', cat: 'std',
    title: { fa: 'بافر: سناریوی کورس', en: 'Buffer: stroke scenario' },
    desc: { fa: 'محاسبه با ضریب و کف کورس واردشده از منبع مصوب/داده همان بافر', en: 'Calculate with coefficient and floor entered from the approved source/data for that buffer' },
    formula: 'S_scenario = max(k × v², S_floor)',
    inputs: [
      { id: 'v', label: { fa: 'سرعت قابل‌اعمال', en: 'Applicable speed' }, value: 1, step: 0.05, unit: 'm/s' },
      { id: 'k', label: { fa: 'ضریب کورس از منبع مصوب', en: 'Stroke coefficient from approved source' }, value: '', unit: 's²' },
      { id: 'floor', label: { fa: 'کف کورس از منبع مصوب', en: 'Stroke floor from approved source' }, value: '', unit: 'mm' }
    ],
    compute(v) {
      if (v.v < 0 || v.k <= 0 || v.floor < 0) throw new Error('source-values-required');
      const formulaMm = v.k * v.v * v.v * 1000;
      return [
        { label: { fa: 'مولفه k×v²', en: 'k×v² component' }, val: formulaMm.toFixed(1) + ' mm' },
        { label: { fa: 'نتیجه سناریو', en: 'Scenario result' }, val: Math.max(formulaMm, v.floor).toFixed(1) + ' mm' }
      ];
    },
    assume: { fa: 'نوع بافر، سرعت ضربه، روش کاهش کورس و شرایط نصب باید از طراحی/سازنده مشخص باشند؛ هیچ ضریب پیش‌فرضی در برنامه وجود ندارد.', en: 'Buffer type, impact speed, reduced-stroke method and installation conditions must come from design/manufacturer data; the app has no default coefficient.' },
    note: { fa: 'این نتیجه کورس لازم یا انطباق را تأیید نمی‌کند؛ ظرفیت انرژی، بار، گواهی و دستور سازنده جداگانه بررسی شوند.', en: 'This result does not confirm required stroke or compliance; separately verify energy capacity, load, certificate and manufacturer instructions.' }
  },
  {
    id: 'std-headroom', cat: 'std',
    title: { fa: 'بالاسری: سناریوی فاصله', en: 'Headroom: clearance scenario' },
    desc: { fa: 'محاسبه هندسی با پایه و ضریب واردشده از منبع قابل‌اعمال پروژه', en: 'Geometric calculation using base and coefficient entered from the applicable project source' },
    formula: 'H_scenario = H_base + k × v²',
    inputs: [
      { id: 'v', label: { fa: 'سرعت نامی', en: 'Rated speed' }, value: 1, step: 0.05, unit: 'm/s' },
      { id: 'base', label: { fa: 'فاصله پایه از منبع مصوب', en: 'Base clearance from approved source' }, value: '', unit: 'm' },
      { id: 'k', label: { fa: 'ضریب سرعت از منبع مصوب', en: 'Speed coefficient from approved source' }, value: '', unit: 's²/m' }
    ],
    compute(v) {
      if (v.v < 0 || v.base < 0 || v.k < 0) throw new Error('source-values-required');
      return [{ label: { fa: 'فاصله سناریوی محاسبه‌شده', en: 'Calculated scenario clearance' }, val: (v.base + v.k * v.v * v.v).toFixed(3) + ' m' }];
    },
    assume: { fa: 'نوع آسانسور، بافر، جبران‌کننده، ضدپرش، جان‌پناه و تمام هندسه‌های مؤثر باید مشخص باشند؛ ورودی‌ها از منبع مصوب پروژه می‌آیند.', en: 'Lift type, buffers, compensation, anti-rebound, refuge spaces and all relevant geometry must be known; inputs come from the approved project source.' },
    note: { fa: 'این ابزار چاهک، جان‌پناه یا سایر فواصل را حدگذاری نمی‌کند و جای اندازه‌گیری، طراحی و تأیید بازرس/مهندس را نمی‌گیرد.', en: 'This tool does not set pit, refuge-space or other clearances and does not replace measurement, design and competent verification.' }
  }
);

/* Calculator audit metadata. Every card exposes the requested input/formula/
   result/assumptions/limitations/reference chain. A formula that mentions a
   standard remains usable as a mathematical what-if, but is not a compliance
   decision while its source is unavailable. */
CALCULATORS.forEach(cal => {
  cal.resultClass = 'PRELIMINARY ESTIMATE';
  cal.verificationRequired = true;
  cal.limit = cal.note || { fa: 'نتیجه به ورودی‌ها و فرضیات وابسته است.', en: 'The result depends on inputs and assumptions.' };
  const standardNamed = cal.cat === 'std' || /EN\s*81|6303|IEC\s*60364|استاندارد/i.test([cal.desc && cal.desc.fa, cal.desc && cal.desc.en, cal.formula, cal.assume && cal.assume.fa, cal.note && cal.note.fa].filter(Boolean).join(' '));
  cal.verificationStatus = standardNamed ? 'UNVERIFIED' : 'ENGINEERING PRACTICE';
  cal.reference = standardNamed
    ? { fa: 'UNVERIFIED — متن منبع/ویرایش/صفحه در مخزن موجود نیست؛ ضرایب استانداردی داخلی اعمال نمی‌شوند.', en: 'UNVERIFIED — source text/edition/page is not present; no built-in standard coefficients are applied.' }
    : { fa: 'ENGINEERING PRACTICE — فرمول و فرضیات نمایش‌داده‌شده؛ مرجع الزامی ادعا نمی‌شود.', en: 'ENGINEERING PRACTICE — displayed formula and assumptions; no mandatory source is claimed.' };
});
