/* ================= CALCULATORS ================= */
/* Each: { id, title, desc, formula, inputs[{id,label,value,step,unit}], compute(v)->rows, assume, note } */
var CALC_GUIDE = {
  fa: 'PRELIMINARY ESTIMATE — ENGINEERING VERIFICATION REQUIRED. فرمول، ورودی، فرضیات و محدودیت‌ها نمایش داده می‌شوند. ارجاعات استانداردی این نسخه UNVERIFIED هستند و نتیجه به‌تنهایی ایمنی یا انطباق را تأیید نمی‌کند.',
  en: 'PRELIMINARY ESTIMATE — ENGINEERING VERIFICATION REQUIRED. Formula, inputs, assumptions and limitations are shown. Standard references in this build are UNVERIFIED; a result alone does not confirm safety or compliance.'
};
var ALPHA_ANGLE_WARNING_FA = '⚠️ این محاسبه هندسی است و به‌تنهایی کفایت کشش، ایمنی یا انطباق سیستم را تأیید نمی‌کند. اعتبارسنجی کشش به نوع و زاویه شیار، اصطکاک، نیروهای بکسل، جرم وزنه، شتاب و داده‌های سازنده نیاز دارد. ارجاع پیوست استاندارد در این مخزن راستی‌آزمایی نشده است.';
var CALCULATORS = [
  {
    id: 'c1',
    title: { fa: 'ظرفیت کابین و مساحت مرجع', en: 'Car capacity & referenced area' },
    desc: { fa: 'محاسبه سناریویی با جرم نفر و مساحت استخراج‌شده از منبع قابل‌اعمال پروژه', en: 'Scenario using person mass and area taken from the applicable project source' },
    formula: 'Persons = Rated load / configured person mass | Area limit = value entered from approved source',
    inputs: [
      { id: 'load', label: { fa: 'ظرفیت نامی', en: 'Rated load' }, value: 630, unit: 'kg' },
      { id: 'personMass', label: { fa: 'جرم مبنای هر نفر از مرجع پروژه', en: 'Person mass from project reference' }, value: '', unit: 'kg/person' },
      { id: 'areaLimit', label: { fa: 'مساحت مجاز از جدول/مرجع مصوب', en: 'Allowed area from approved table/source' }, value: '', unit: 'm²' }
    ],
    compute(v) {
      if (v.personMass <= 0 || v.areaLimit <= 0) throw new Error('invalid-source-input');
      return [
        { label: { fa: 'تعداد نفر محاسباتی', en: 'Calculated persons' }, val: Math.floor(v.load / v.personMass) + (LANG === 'fa' ? ' نفر' : ' persons') },
        { label: { fa: 'مساحت مرجع واردشده', en: 'Entered referenced area' }, val: v.areaLimit.toFixed(2) + ' m²' }
      ];
    },
    assume: { fa: 'جرم نفر و مساحت از منبع مصوبِ قابل‌اعمال پروژه توسط کاربر وارد می‌شود؛ برنامه جدول استاندارد داخلی و تأییدشده ندارد.', en: 'The user enters person mass and area from the approved source applicable to the project; the app has no internally verified standard table.' },
    note: { fa: 'این ابزار فقط محاسبه/ثبت سناریو است و مساحت مجاز یا انطباق را تعیین نمی‌کند.', en: 'This tool only calculates/records a scenario; it does not determine allowed area or compliance.' }
  },
  {
    id: 'c2',
    title: { fa: 'توان موتور آسانسور کششی', en: 'Traction motor power' },
    desc: { fa: 'برآورد توان موتور با احتساب وزنه تعادل و بازده', en: 'Motor power estimate with counterbalance and efficiency' },
    formula: 'P = ((1 − CB) × Q × g × v) / (1000 × η)',
    inputs: [
      { id: 'q', label: { fa: 'ظرفیت نامی', en: 'Rated load' }, value: 630, unit: 'kg' },
      { id: 'v', label: { fa: 'سرعت', en: 'Speed' }, value: 1, step: 0.1, unit: 'm/s' },
      { id: 'cb', label: { fa: 'ضریب تعادل', en: 'Counterbalance' }, value: 50, unit: '%' },
      { id: 'eff', label: { fa: 'بازده کل', en: 'Overall efficiency' }, value: 60, unit: '%' }
    ],
    compute(v) {
      if (v.eff <= 0 || v.eff > 100 || v.cb < 0 || v.cb > 100) throw new Error('invalid-input');
      const p = ((1 - v.cb / 100) * v.q * 9.81 * v.v) / (1000 * (v.eff / 100));
      return [
        { label: { fa: 'توان مکانیکی/الکتریکی برآوردشده با بازده واردشده', en: 'Estimated power using entered efficiency' }, val: p.toFixed(2) + ' kW' }
      ];
    },
    assume: { fa: 'g=9.81؛ ضریب تعادل و بازده کل همان مقادیر ورودی‌اند؛ جرم بکسل/کابل، پروفیل شتاب و حاشیه انتخاب موتور لحاظ نشده‌اند.', en: 'g=9.81; balance factor and overall efficiency are the entered values; ropes/cables, acceleration profile and motor-selection margin are excluded.' },
    note: { fa: 'راهنمای تکنسین — انتخاب نهایی موتور فقط با کاتالوگ سازنده و محاسبات کامل پروژه.', en: 'Guidance only — final motor per manufacturer catalogue.' }
  },
  {
    id: 'c3',
    title: { fa: 'وزنه تعادل', en: 'Counterweight' },
    desc: { fa: 'محاسبه جرم وزنه تعادل', en: 'Counterweight mass' },
    formula: 'CWT = P_car + (CB% × Q)',
    inputs: [
      { id: 'car', label: { fa: 'وزن کابین خالی', en: 'Empty car weight' }, value: 700, unit: 'kg' },
      { id: 'q', label: { fa: 'ظرفیت نامی', en: 'Rated load' }, value: 630, unit: 'kg' },
      { id: 'cb', label: { fa: 'ضریب تعادل از طراحی/سازنده', en: 'Balance factor from design/manufacturer' }, value: '', unit: '%' }
    ],
    compute(v) {
      if (v.cb < 0 || v.cb > 100) throw new Error('invalid-input');
      const cwt = v.car + v.q * v.cb / 100;
      return [
        { label: { fa: 'جرم وزنه تعادل بر اساس ضریب واردشده', en: 'Counterweight mass from entered factor' }, val: Math.round(cwt) + ' kg' }
      ];
    },
    assume: { fa: 'ضریب تعادل ورودی باید از طراحی پروژه و داده سازنده گرفته شود؛ برنامه مقدار عمومی پیشنهاد نمی‌کند.', en: 'The entered balance factor must come from the project design and manufacturer data; the app does not prescribe a universal value.' },
    note: { fa: 'جرم نهایی و روش آزمون تعادل باید با محاسبات طراحی و دستور سازنده تأیید شود؛ آزمون خطرناک یا حرکت دستی پیشنهاد نمی‌شود.', en: 'Final mass and balance-test method require design and manufacturer verification; no hazardous manual movement is suggested.' }
  },
  {
    id: 'c4',
    title: { fa: 'سیم‌بکسل: ضریب اطمینان', en: 'Rope safety factor' },
    desc: { fa: 'محاسبه ضریب بار استاتیک بکسل، بدون اعمال حد انطباق داخلی', en: 'Calculate static rope factor without an internal compliance limit' },
    formula: 'SF = (n × F_break) / ((P + Q) × g / roping)',
    inputs: [
      { id: 'n', label: { fa: 'تعداد بکسل', en: 'Number of ropes' }, value: 5 },
      { id: 'fb', label: { fa: 'نیروی گسیختگی هر بکسل', en: 'Breaking force per rope' }, value: 55, unit: 'kN' },
      { id: 'p', label: { fa: 'وزن کابین', en: 'Car weight' }, value: 700, unit: 'kg' },
      { id: 'q', label: { fa: 'ظرفیت', en: 'Rated load' }, value: 630, unit: 'kg' },
      { id: 'rop', label: { fa: 'بکسل‌بندی (1 یا 2 برای 2:1)', en: 'Roping (1 or 2)' }, value: 1 }
    ],
    compute(v) {
      const staticLoad = (v.p + v.q) * 9.81 / 1000 / (v.rop || 1);
      const sf = (v.n * v.fb) / staticLoad;
      return [
        { label: { fa: 'بار استاتیک ساده‌شده روی بکسل‌ها', en: 'Simplified static rope load' }, val: staticLoad.toFixed(1) + ' kN' },
        { label: { fa: 'ضریب محاسبه‌شده', en: 'Calculated factor' }, val: sf.toFixed(1) }
      ];
    },
    assume: { fa: 'مدل بار استاتیک ساده؛ جرم بکسل، تراول کابل، توزیع کشش، شیار، خمش و بارهای دینامیکی لحاظ نشده‌اند. نیروی گسیختگی باید از گواهی همان بکسل وارد شود.', en: 'Simplified static-load model; rope/cable mass, tension distribution, groove, bending and dynamic loads are excluded. Breaking force must come from that rope certificate.' },
    note: { fa: 'هیچ حد قبولی در کد اعمال نمی‌شود. انتخاب/تأیید بکسل و ضریب لازم به طراحی کامل، داده سازنده و منبع مصوب قابل‌اعمال نیاز دارد.', en: 'No acceptance limit is applied in code. Rope selection and required factor need full design, manufacturer data and the applicable approved source.' }
  },
  {
    id: 'c5',
    title: { fa: 'هیدرولیک: فشار کار جک', en: 'Hydraulic: working pressure' },
    desc: { fa: 'فشار کار بر اساس بار و قطر پیستون', en: 'Pressure from load and ram diameter' },
    formula: 'p = F / A = (m × g × roping) / (π × d²/4)',
    inputs: [
      { id: 'm', label: { fa: 'جرم کل روی جک (کابین+بار)', en: 'Total mass (car+load)' }, value: 1400, unit: 'kg' },
      { id: 'd', label: { fa: 'قطر پیستون', en: 'Ram diameter' }, value: 85, unit: 'mm' },
      { id: 'rop', label: { fa: 'سیستم (1 مستقیم / 2 غیرمستقیم)', en: 'System (1 direct / 2 indirect)' }, value: 1 }
    ],
    compute(v) {
      const F = v.m * 9.81 * (v.rop == 2 ? 2 : 1);
      const A = Math.PI * Math.pow(v.d / 1000, 2) / 4;
      const bar = F / A / 100000;
      return [
        { label: { fa: 'نیروی ساده‌شده روی پیستون', en: 'Simplified ram force' }, val: (F / 1000).toFixed(1) + ' kN' },
        { label: { fa: 'فشار نظری کار', en: 'Theoretical working pressure' }, val: bar.toFixed(1) + ' bar' }
      ];
    },
    assume: { fa: 'وزن پیستون، اصطکاک، افت مدار و بارهای دینامیکی صرف‌نظر شده‌اند؛ ضریب سیستم 1 یا 2 همان ورودی کاربر است.', en: 'Ram weight, friction, circuit losses and dynamic loads are excluded; the 1 or 2 system factor is user-entered.' },
    note: { fa: 'تنظیم رلیف و فشار آزمون از این برآورد تعیین نمی‌شود؛ مقادیر و روش ایمن باید از سازنده و منبع مصوب همان سامانه گرفته شود.', en: 'Relief setting and test pressure are not determined by this estimate; obtain values and safe procedure from the system manufacturer and applicable approved source.' }
  },
  {
    id: 'c6',
    title: { fa: 'هیدرولیک: دبی پمپ و توان', en: 'Hydraulic: pump flow & power' },
    desc: { fa: 'دبی لازم برای سرعت کابین و توان موتور یونیت', en: 'Flow for car speed and unit motor power' },
    formula: 'Q = A × v_ram × 60000 | P = p × Q / (600 × η)',
    inputs: [
      { id: 'd', label: { fa: 'قطر پیستون', en: 'Ram diameter' }, value: 85, unit: 'mm' },
      { id: 'v', label: { fa: 'سرعت کابین', en: 'Car speed' }, value: 0.6, step: 0.1, unit: 'm/s' },
      { id: 'p', label: { fa: 'فشار کار', en: 'Working pressure' }, value: 35, unit: 'bar' },
      { id: 'rop', label: { fa: 'سیستم (1 / 2)', en: 'System (1 / 2)' }, value: 1 },
      { id: 'eff', label: { fa: 'بازده کل', en: 'Overall efficiency' }, value: 70, unit: '%' }
    ],
    compute(v) {
      const vram = v.rop == 2 ? v.v / 2 : v.v;
      const A = Math.PI * Math.pow(v.d / 1000, 2) / 4;
      const Q = A * vram * 1000 * 60;
      const P = v.p * Q / (600 * (v.eff / 100));
      return [
        { label: { fa: 'سرعت پیستون', en: 'Ram speed' }, val: vram.toFixed(2) + ' m/s' },
        { label: { fa: 'دبی لازم پمپ', en: 'Required flow' }, val: Q.toFixed(0) + ' L/min' },
        { label: { fa: 'توان تقریبی موتور', en: 'Approx. motor power' }, val: P.toFixed(1) + ' kW' }
      ];
    },
    assume: { fa: 'رابطه مهندسی توان سیال (bar×L/min/600)؛ نشتی داخلی، افت لوله/شیر و گذراها صرف‌نظر شده‌اند.', en: 'Engineering fluid-power relation (bar×L/min/600); internal leakage, pipe/valve losses and transients are excluded.' },
    note: { fa: 'به همین دلیل موتور هیدرولیک از کششی هم‌ظرفیت بزرگ‌تر است — فقط در حرکت بالا کار می‌کند.', en: 'Hydraulic motors are larger — they only work on the up run.' }
  },
  {
    id: 'c7',
    title: { fa: 'زمان سفر و ترافیک', en: 'Travel time & traffic' },
    desc: { fa: 'زمان سفر کامل و رفت‌وبرگشت تقریبی', en: 'Trip time and rough round trip' },
    formula: 't ≈ H/v + stops × (t_door + t_acc)',
    inputs: [
      { id: 'h', label: { fa: 'ارتفاع کل مسیر', en: 'Total travel' }, value: 33, unit: 'm' },
      { id: 'v', label: { fa: 'سرعت', en: 'Speed' }, value: 1, step: 0.1, unit: 'm/s' },
      { id: 'stops', label: { fa: 'توقف میانی فرضی', en: 'Assumed stops' }, value: 4 },
      { id: 'tdoor', label: { fa: 'زمان درب هر توقف', en: 'Door time per stop' }, value: 8, unit: 's' },
      { id: 'tacc', label: { fa: 'زمان شتاب/کاهش در هر توقف', en: 'Acceleration/deceleration allowance per stop' }, value: 3, unit: 's' }
    ],
    compute(v) {
      if (v.v <= 0) throw new Error('invalid-input');
      const run = v.h / v.v;
      const total = run + v.stops * (v.tdoor + v.tacc);
      return [
        { label: { fa: 'زمان حرکت خالص', en: 'Pure run time' }, val: run.toFixed(0) + ' s' },
        { label: { fa: 'زمان کل با توقف‌ها', en: 'Total with stops' }, val: total.toFixed(0) + ' s' },
        { label: { fa: 'رفت‌وبرگشت (RTT) تقریبی', en: 'Approx. RTT' }, val: (total * 2).toFixed(0) + ' s' }
      ];
    },
    assume: { fa: 'زمان شتاب/کاهش، تعداد توقف و زمان درب ورودی کاربرند؛ تأخیر اعزام، بارگیری و پروفیل واقعی حرکت لحاظ نشده‌اند.', en: 'Acceleration allowance, stop count and door time are user inputs; dispatch, loading and the real motion profile are excluded.' },
    note: { fa: 'برای طراحی واقعی ترافیک، تحلیل کامل (تعداد ساکنین، پیک صبح و…) لازم است.', en: 'Real traffic design needs full analysis.' }
  },
  {
    id: 'c8',
    title: { fa: 'جریان موتور سه‌فاز', en: 'Three-phase motor current' },
    desc: { fa: 'برآورد جریان از توان، ولتاژ، ضریب توان و بازده واردشده', en: 'Estimate current from entered power, voltage, power factor and efficiency' },
    formula: 'I = P / (√3 × U × cosφ × η)',
    inputs: [
      { id: 'p', label: { fa: 'توان موتور', en: 'Motor power' }, value: 7.5, step: 0.5, unit: 'kW' },
      { id: 'u', label: { fa: 'ولتاژ خط', en: 'Line voltage' }, value: 380, unit: 'V' },
      { id: 'pf', label: { fa: 'ضریب توان cosφ', en: 'Power factor' }, value: 0.85, step: 0.05 },
      { id: 'eff', label: { fa: 'بازده موتور', en: 'Motor efficiency' }, value: 88, unit: '%' }
    ],
    compute(v) {
      if (v.p < 0 || v.u <= 0 || v.pf <= 0 || v.pf > 1 || v.eff <= 0 || v.eff > 100) throw new Error('invalid-input');
      const I = v.p * 1000 / (Math.sqrt(3) * v.u * v.pf * v.eff / 100);
      return [{ label: { fa: 'جریان خط برآوردشده', en: 'Estimated line current' }, val: I.toFixed(1) + ' A' }];
    },
    assume: { fa: 'تغذیه و بار سه‌فاز متعادل؛ توان، ولتاژ، cosφ و بازده همان مقادیر ورودی‌اند. هارمونیک، رژیم کاری و شرایط VVVF لحاظ نشده‌اند.', en: 'Balanced three-phase supply/load; power, voltage, pf and efficiency are entered values. Harmonics, duty and VVVF conditions are excluded.' },
    note: { fa: 'این ابزار سایز کابل، کلید یا حفاظت پیشنهاد نمی‌کند. انتخاب نهایی به روش نصب، دما، گروه‌بندی، طول، افت ولتاژ، اتصال کوتاه، هماهنگی حفاظت، داده سازنده و مقررات قابل‌اعمال نیاز دارد.', en: 'This tool does not suggest cable or protective-device sizes. Final selection requires installation method, temperature, grouping, length, voltage drop, fault level, protection coordination, manufacturer data and applicable rules.' }
  },
  {
    id: 'c9',
    title: { fa: 'توان از جریان اندازه‌گیری‌شده', en: 'Power from measured current' },
    desc: { fa: 'برآورد توان سه‌فاز از جریان، ولتاژ و ضریب توان واردشده', en: 'Estimate three-phase power from entered current, voltage and power factor' },
    formula: 'P = √3 × U × I × cosφ',
    inputs: [
      { id: 'i', label: { fa: 'جریان اندازه‌گیری‌شده', en: 'Measured current' }, value: 14, step: 0.1, unit: 'A' },
      { id: 'u', label: { fa: 'ولتاژ خط', en: 'Line voltage' }, value: 380, unit: 'V' },
      { id: 'pf', label: { fa: 'ضریب توان cosφ', en: 'Power factor' }, value: 0.85, step: 0.05 }
    ],
    compute(v) {
      const S = Math.sqrt(3) * v.u * v.i / 1000;
      const P = S * v.pf;
      return [
        { label: { fa: 'توان ظاهری S', en: 'Apparent power S' }, val: S.toFixed(2) + ' kVA' },
        { label: { fa: 'توان اکتیو P', en: 'Active power P' }, val: P.toFixed(2) + ' kW' }
      ];
    },
    assume: { fa: 'بار سه‌فاز متعادل؛ cosφ تخمینی (موتور زیر بار ~۰.۸-۰.۸۵).', en: 'Balanced 3-phase; estimated cosφ (~0.8–0.85 loaded).' },
    note: { fa: 'ضریب توان تخمینی نتیجه را تقریبی می‌کند. اختلاف با پلاک علت را اثبات نمی‌کند؛ شرایط بار، کیفیت اندازه‌گیری، شبکه، موتور و درایو باید بررسی شوند.', en: 'An estimated power factor makes the result approximate. A nameplate difference does not prove a cause; check load, measurement quality, supply, motor and drive.' }
  },
  {
    id: 'c10',
    title: { fa: 'افت ولتاژ کابل', en: 'Cable voltage drop' },
    desc: { fa: 'کنترل افت ولتاژ مسیر کنتور تا تابلو', en: 'Voltage drop from supply to panel' },
    formula: 'ΔU = √3 × I × L × (ρ/S) | ρ_cu ≈ 0.0175',
    inputs: [
      { id: 'i', label: { fa: 'جریان', en: 'Current' }, value: 16, step: 0.5, unit: 'A' },
      { id: 'l', label: { fa: 'طول مسیر (یک‌طرفه)', en: 'One-way length' }, value: 40, unit: 'm' },
      { id: 's', label: { fa: 'سطح مقطع کابل', en: 'Cable cross-section' }, value: 6, unit: 'mm²' },
      { id: 'u', label: { fa: 'ولتاژ خط', en: 'Line voltage' }, value: 380, unit: 'V' }
    ],
    compute(v) {
      const dU = Math.sqrt(3) * v.i * v.l * (0.0175 / v.s);
      const pct = dU / v.u * 100;
      return [
        { label: { fa: 'افت ولتاژ', en: 'Voltage drop' }, val: dU.toFixed(1) + ' V' },
        { label: { fa: 'درصد افت', en: 'Drop %' }, val: pct.toFixed(1) + ' %' },
        { label: { fa: 'ارزیابی', en: 'Assessment' }, val: LANG === 'fa' ? 'نیازمند حد مجازِ پروژه و تأیید مهندسی' : 'Project limit and engineering verification required' }
      ];
    },
    assume: { fa: 'کابل مسی، سه‌فاز متعادل، cosφ≈1 برای سادگی؛ دمای ۲۰ درجه.', en: 'Copper, balanced 3-phase, cosφ≈1 simplification; 20 °C.' },
    note: { fa: 'نتیجه فقط افت مقاومتی ساده‌شده است؛ حد مجاز، راکتانس، دمای هادی، هارمونیک، روش نصب و هماهنگی حفاظت در طراحی برق پروژه بررسی شوند.', en: 'This is only a simplified resistive drop; project electrical design must address the applicable limit, reactance, conductor temperature, harmonics, installation method and protection coordination.' }
  },
  {
    id: 'c11',
    title: { fa: 'هیدرولیک: زمان سفر و حجم روغن', en: 'Hydraulic: travel time & oil volume' },
    desc: { fa: 'زمان طی مسیر و حجم روغن جابجاشده', en: 'Trip time and displaced oil volume' },
    formula: 't = H / v | V = A × stroke',
    inputs: [
      { id: 'h', label: { fa: 'کورس حرکت کابین', en: 'Car travel' }, value: 9, unit: 'm' },
      { id: 'v', label: { fa: 'سرعت کابین', en: 'Car speed' }, value: 0.5, step: 0.1, unit: 'm/s' },
      { id: 'd', label: { fa: 'قطر پیستون', en: 'Ram diameter' }, value: 85, unit: 'mm' },
      { id: 'rop', label: { fa: 'سیستم (1 / 2)', en: 'System (1 / 2)' }, value: 1 }
    ],
    compute(v) {
      const t = v.h / v.v;
      const stroke = v.rop == 2 ? v.h / 2 : v.h;
      const A = Math.PI * Math.pow(v.d / 1000, 2) / 4;
      const vol = A * stroke * 1000;
      return [
        { label: { fa: 'زمان سفر کامل', en: 'Full trip time' }, val: t.toFixed(1) + ' s' },
        { label: { fa: 'کورس پیستون', en: 'Ram stroke' }, val: stroke.toFixed(1) + ' m' },
        { label: { fa: 'حجم روغن جابجاشده', en: 'Displaced oil volume' }, val: vol.toFixed(0) + ' L' }
      ];
    },
    assume: { fa: 'سرعت ثابت در کل مسیر (شتاب‌گیری صرف‌نظر)؛ حجم مخزن باید بزرگ‌تر از این حجم + حاشیه باشد.', en: 'Constant speed; tank must exceed this volume + margin.' },
    note: { fa: 'اگر روغن مخزن با کابین بالا کمتر از حداقل نشانگر شد، حجم مخزن/روغن ناکافی است.', en: 'If tank level drops below min with car up, oil volume is insufficient.' }
  },
  {
    id: 'c12',
    title: { fa: 'تبدیل ظرفیت و کنترل اضافه‌بار', en: 'Load conversion & overload check' },
    desc: { fa: 'بار واقعی داخل کابین در برابر ظرفیت مجاز', en: 'Actual car load vs rated capacity' },
    formula: 'Load% = actual / rated × 100',
    inputs: [
      { id: 'rated', label: { fa: 'ظرفیت نامی', en: 'Rated load' }, value: 630, unit: 'kg' },
      { id: 'n', label: { fa: 'تعداد نفر داخل کابین', en: 'Persons in car' }, value: 8 },
      { id: 'personMass', label: { fa: 'جرم فرضی هر نفر', en: 'Assumed mass per person' }, value: '', unit: 'kg/person' },
      { id: 'extra', label: { fa: 'بار اضافه (وسایل)', en: 'Extra goods' }, value: 0, unit: 'kg' }
    ],
    compute(v) {
      if (v.rated <= 0 || v.personMass <= 0) throw new Error('invalid-input');
      const actual = v.n * v.personMass + v.extra;
      const pct = actual / v.rated * 100;
      return [
        { label: { fa: 'بار تخمینی', en: 'Estimated load' }, val: actual.toFixed(0) + ' kg' },
        { label: { fa: 'درصد ظرفیت نامی ثبت‌شده', en: 'Recorded rated-load %' }, val: pct.toFixed(0) + ' %' },
        { label: { fa: 'ارزیابی', en: 'Assessment' }, val: LANG === 'fa' ? 'عملکرد حفاظت اضافه‌بار باید طبق تجهیز و مرجع معتبر آزمون شود' : 'Overload protection must be tested against equipment data and a valid reference' }
      ];
    },
    assume: { fa: 'جرم هر نفر ورودی کاربر است؛ بار واقعی افراد/وسایل ممکن است با برآورد تفاوت داشته باشد.', en: 'Person mass is user-entered; actual people/goods may differ from the estimate.' },
    note: { fa: 'این درصد جای آزمون وسیله اضافه‌بار نیست. نقطه عملکرد و رفتار لازم باید از اطلاعات تجهیز و منبع مصوب قابل‌اعمال گرفته شود.', en: 'This percentage does not replace overload-device testing. Obtain the trip point and required behavior from equipment data and the applicable approved source.' }
  }
];
