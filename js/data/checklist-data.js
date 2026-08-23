/* ================= CHECKLIST TEMPLATES ================= */
var CHECKLIST_TEMPLATES = [
  {
    id: 'traction-install',
    type: 'traction',
    kind: 'install',
    riskLevel: 'caution',
    title: { fa: 'چک‌لیست نصب آسانسور کششی', en: 'Traction Elevator Installation Checklist' },
    desc: { fa: 'مراحل نصب از شفت تا تحویل، بر اساس رویه‌های رایج و الزامات EN 81-20 / استاندارد ۶۳۰۳-۲۰', en: 'Installation steps from shaft to handover, per common practice and EN 81-20 / ISIRI 6303-20' },
    groups: [
      {
        title: { fa: '۱) بررسی چاه و آماده‌سازی', en: '1) Shaft survey & preparation' },
        items: [
          { id: 't1', fa: 'کنترل ابعاد چاه (عرض، عمق، شاقول‌بودن دیوارها) با نقشه', en: 'Verify shaft dimensions (width, depth, plumb walls) against drawings' },
          { id: 't2', fa: 'کنترل عمق چاهک و ارتفاع بالاسری مطابق نقشه و فضاهای جان‌پناه (خمیده 0.5×0.7×1.0 متر و بلوک‌های دیگر)', en: 'Check pit depth and headroom incl. refuge spaces (crouching 0.5×0.7×1.0 m and other blocks)', ref: 'EN 81-20 §5.2.5.7 / §5.2.5.8' },
          { id: 't3', fa: 'وجود نردبان چاهک، روشنایی چاه (۵۰ لوکس) و پریز برق در چاهک', en: 'Pit ladder, shaft lighting (50 lux) and pit socket present', ref: 'EN 81-20 §5.2.1.4 / §5.2.1.5' },
          { id: 't4', fa: 'کنترل موقعیت و ابعاد درگاه‌های طبقات', en: 'Check landing entrance positions and dimensions' },
          { id: 't5', fa: 'نصب داربست یا سکوی کار ایمن داخل چاه', en: 'Install safe scaffolding / working platform in shaft' }
        ]
      },
      {
        title: { fa: '۲) ریل‌گذاری', en: '2) Guide rails' },
        items: [
          { id: 't6', fa: 'شاقول‌کشی و تعیین خط مبنا (قالب‌بندی)', en: 'Plumb lines and templates set' },
          { id: 't7', fa: 'نصب براکت‌ها با فواصل مجاز (معمولاً حداکثر ~۲.۵ متر بسته به طراحی)', en: 'Brackets installed at allowed spacing (typically max ~2.5 m per design)' },
          { id: 't8', fa: 'نصب و هم‌راستایی ریل‌های کابین و وزنه با تلرانس مجاز (DBG)', en: 'Car & counterweight rails aligned within tolerance (DBG)' },
          { id: 't9', fa: 'آچارکشی کامل فیش‌پلیت‌ها و کلمپ‌ها با گشتاور مناسب', en: 'Fishplates and clips torqued correctly' }
        ]
      },
      {
        title: { fa: '۳) موتورخانه و سیستم محرکه', en: '3) Machine room & drive' },
        items: [
          { id: 't10', fa: 'نصب شاسی موتور و لرزه‌گیرها؛ تراز موتور گیربکس/گیرلس', en: 'Machine bedframe and isolation pads; motor leveled' },
          { id: 't11', fa: 'همراستایی فلکه کشش با فلکه هرزگرد و مسیر بکسل', en: 'Traction sheave aligned with diverter and roping path' },
          { id: 't12', fa: 'نصب تابلو فرمان، کابل‌کشی قدرت و فرمان با رعایت جدا‌سازی', en: 'Controller installed; power/control wiring segregated' },
          { id: 't13', fa: 'اتصال ارت مستقل و هم‌بندی کلیه بدنه‌های فلزی', en: 'Dedicated earthing and bonding of all metalwork' },
          { id: 't14', fa: 'نصب گاورنر (فلکه تنظیم سرعت) و کشنده آن در چاهک', en: 'Overspeed governor and tension pulley installed', ref: 'EN 81-20 §5.6.2' }
        ]
      },
      {
        title: { fa: '۴) کابین، وزنه و بکسل', en: '4) Car, counterweight & ropes' },
        items: [
          { id: 't15', fa: 'مونتاژ یوک و کف کابین؛ تراز کف با دقت', en: 'Sling and platform assembled; floor leveled' },
          { id: 't16', fa: 'نصب پاراشوت و اتصال به گاورنر؛ تست مکانیزم قبل از بکسل‌اندازی', en: 'Safety gear fitted & linked to governor; mechanism tested', ref: 'EN 81-20 §5.6.2' },
          { id: 't17', fa: 'بارگذاری قاب وزنه مطابق محاسبه تعادل (معمولاً ~۵۰٪ ظرفیت + وزن کابین)', en: 'Counterweight filled per balance calc (~50% duty load + car weight)' },
          { id: 't18', fa: 'بکسل‌اندازی؛ یکنواختی کشش رشته‌ها با ترازوی کشش', en: 'Roping done; rope tensions equalized with tension gauge' },
          { id: 't19', fa: 'نصب بافر کابین و وزنه در چاهک', en: 'Car and counterweight buffers installed', ref: 'EN 81-20 §5.8' }
        ]
      },
      {
        title: { fa: '۵) درب‌ها و سیم‌کشی چاه', en: '5) Doors & shaft wiring' },
        items: [
          { id: 't20', fa: 'نصب درب‌های طبقات؛ تنظیم گپ‌ها (فاصله لته‌ها حداکثر ۶ میلی‌متر، با سایش تا ۱۰)', en: 'Landing doors installed; gaps adjusted (max 6 mm panel gaps, 10 mm after wear)', ref: 'EN 81-20 §5.3.1.4' },
          { id: 't21', fa: 'قفل‌های درب طبقات: درگیری حداقل ۷ میلی‌متر و تست کنتاکت', en: 'Landing door locks: min 7 mm engagement, contact tested', ref: 'EN 81-20 §5.3.9.1' },
          { id: 't22', fa: 'نصب درب کابین، سردرب و پرده نوری/فتوسل', en: 'Car door operator and light curtain installed' },
          { id: 't23', fa: 'نصب تراول کابل و شینه/سنسورهای احضار در چاه', en: 'Travelling cable, shaft switches and landing sensors installed' },
          { id: 't24', fa: 'لیمیت سوییچ‌های حد بالا/پایین و شناسایی طبقات', en: 'Final limit switches and floor detection set', ref: 'EN 81-20 §5.12.2' }
        ]
      },
      {
        title: { fa: '۶) راه‌اندازی و تست‌های نهایی', en: '6) Commissioning & final tests' },
        items: [
          { id: 't25', fa: 'کنترل مدار ایمنی (سری‌کامل) و تست تک‌تک کنتاکت‌ها', en: 'Safety chain checked; every contact tested individually' },
          { id: 't26', fa: 'تنظیم درایو (Auto-tune)، منحنی حرکت و دقت توقف (±۱۰ میلی‌متر)', en: 'Drive tuned; ride curve & leveling accuracy (±10 mm)', ref: 'EN 81-20 §5.12.1.1.4' },
          { id: 't27', fa: 'تست پاراشوت با بار مطابق دستورالعمل', en: 'Loaded safety gear test per procedure', ref: 'EN 81-20 §6.3' },
          { id: 't28', fa: 'تست ترمز موتور با بار ۱۲۵٪ (توقف و نگهداری)', en: 'Machine brake test at 125% load (stop & hold)', ref: 'EN 81-20 §5.9.2.2' },
          { id: 't29', fa: 'تست زنگ خطر اضطراری و اینترکام (باطری ≥ ۱ ساعت)، روشنایی اضطراری و سیستم نجات', en: 'Emergency alarm & intercom (battery ≥1 h), emergency light and rescue tested', ref: 'EN 81-20 §5.12.3 / §5.4.10' },
          { id: 't30', fa: 'نصب برچسب ظرفیت، شماره پلاک و راهنمای نجات؛ تکمیل مدارک بازرسی', en: 'Capacity plate, ID and rescue instructions fitted; inspection docs ready', ref: 'ISIRI 6303' }
        ]
      }
    ]
  },
  {
    id: 'hydraulic-install',
    type: 'hydraulic',
    kind: 'install',
    riskLevel: 'caution',
    title: { fa: 'چک‌لیست نصب آسانسور هیدرولیک', en: 'Hydraulic Elevator Installation Checklist' },
    desc: { fa: 'نصب جک، پاوریونیت و راه‌اندازی مطابق رویه‌های رایج و EN 81-20', en: 'Jack, power unit installation and commissioning per EN 81-20' },
    groups: [
      {
        title: { fa: '۱) آماده‌سازی و جانمایی', en: '1) Preparation & layout' },
        items: [
          { id: 'h1', fa: 'کنترل ابعاد چاه، چاهک و محل اتاقک پاوریونیت', en: 'Check shaft, pit and machine cabinet location' },
          { id: 'h2', fa: 'در جک مدفون: کنترل حفاری غلاف (کیسینگ) و عایق ضدخوردگی', en: 'Buried jack: casing bore and corrosion protection checked' },
          { id: 'h3', fa: 'تهویه و دمای مناسب محل پاوریونیت (روغن بین ۵ تا ۷۰ درجه)', en: 'Ventilation & temperature of unit room (oil 5–70 °C)' },
          { id: 'h4', fa: 'روشنایی چاه، پریز چاهک و نردبان چاهک', en: 'Shaft lighting, pit socket and ladder' }
        ]
      },
      {
        title: { fa: '۲) نصب جک و ریل‌ها', en: '2) Jack & rails' },
        items: [
          { id: 'h5', fa: 'نصب جک (مستقیم/غیرمستقیم) کاملاً شاقول؛ کنترل با تراز دقیق', en: 'Jack installed truly plumb (direct/indirect); verified with precision level' },
          { id: 'h6', fa: 'در سیستم غیرمستقیم (2:1): نصب فلکه سر جک و بکسل‌ها با کشش یکنواخت', en: 'Indirect (2:1): head sheave and ropes with even tension' },
          { id: 'h7', fa: 'ریل‌گذاری کابین (و ریل جک در صورت نیاز) با تلرانس مجاز', en: 'Car rails (and ram guide if any) within tolerance' },
          { id: 'h8', fa: 'در سیستم غیرمستقیم: نصب کنتاکت شلی بکسل (slack rope)', en: 'Indirect: slack-rope safety contact installed', ref: 'EN 81-20 §5.5.5.3' }
        ]
      },
      {
        title: { fa: '۳) پاوریونیت و لوله‌کشی', en: '3) Power unit & piping' },
        items: [
          { id: 'h9', fa: 'نصب پاوریونیت روی لرزه‌گیر؛ اتصال لوله/شیلنگ فشار قوی با خم‌های استاندارد', en: 'Power unit on isolation pads; high-pressure pipe/hose with proper bends' },
          { id: 'h10', fa: 'نصب شیر قطع‌کن دستی (شات‌آف) بین پاوریونیت و جک', en: 'Manual shut-off valve between unit and jack', ref: 'EN 81-20 §5.9.3.5' },
          { id: 'h11', fa: 'نصب شیر پاراشوت (Rupture valve) روی سیلندر', en: 'Rupture valve fitted at cylinder', ref: 'EN 81-20 §5.6.3' },
          { id: 'h12', fa: 'پر کردن روغن مناسب (معمولاً HLP 46) تا سطح صحیح', en: 'Correct oil filled (typically HLP 46) to level' },
          { id: 'h13', fa: 'هواگیری کامل سیستم (جک تا انتها + تخلیه هوا)', en: 'System fully bled of air' },
          { id: 'h14', fa: 'تنظیم شیر اطمینان (رلیف) حداکثر ۱۴۰٪ فشار بار کامل', en: 'Relief valve set ≤140% full-load pressure', ref: 'EN 81-20 §5.9.3.5.3' }
        ]
      },
      {
        title: { fa: '۴) کابین، درب‌ها و برق', en: '4) Car, doors & electrical' },
        items: [
          { id: 'h15', fa: 'مونتاژ کابین و اتصال به جک/بکسل؛ تراز کف', en: 'Car assembled and connected; floor level' },
          { id: 'h16', fa: 'نصب درب‌های طبقات و کابین؛ قفل‌ها با درگیری حداقل ۷ میلی‌متر', en: 'Landing/car doors; locks min 7 mm engagement', ref: 'EN 81-20 §5.3.9.1' },
          { id: 'h17', fa: 'تابلو فرمان، ارت و هم‌بندی، تراول کابل', en: 'Controller, earthing/bonding, travelling cable' },
          { id: 'h18', fa: 'لیمیت‌های حد و سنسورهای طبقه؛ سیستم همسطح‌سازی مجدد (Re-leveling)', en: 'Limits, floor sensors; re-leveling function set' }
        ]
      },
      {
        title: { fa: '۵) تست‌های نهایی', en: '5) Final tests' },
        items: [
          { id: 'h19', fa: 'تست فشار استاتیک ۲۰۰٪ فشار بار کامل به مدت ۵ دقیقه (افت غیرمجاز نداشته باشد)', en: 'Static pressure test at 200% FL pressure for 5 min', ref: 'EN 81-20 §6.3.10' },
          { id: 'h20', fa: 'تست ریزش: افت کابین با بار در ۱۰ دقیقه حداکثر ۱۰ میلی‌متر', en: 'Creep test: max 10 mm drop in 10 min with load' },
          { id: 'h21', fa: 'تست شیر پاراشوت با شبیه‌سازی پارگی لوله', en: 'Rupture valve tripping test' },
          { id: 'h22', fa: 'تست سیستم پایین‌آوردن اضطراری دستی (Hand lowering)', en: 'Manual emergency lowering tested', ref: 'EN 81-20 §5.9.3.9' },
          { id: 'h23', fa: 'کنترل دمای روغن و عملکرد در سیکل متوالی؛ تایمر محدودکننده موتور', en: 'Oil temp under repeated cycles; motor run-time limiter' },
          { id: 'h24', fa: 'برچسب ظرفیت، دستورالعمل نجات و مدارک بازرسی', en: 'Capacity plate, rescue instructions and inspection docs' }
        ]
      }
    ]
  },
  {
    id: 'traction-maint',
    type: 'traction',
    kind: 'maintenance',
    riskLevel: 'caution',
    title: { fa: 'چک‌لیست سرویس دوره‌ای — کششی', en: 'Preventive Maintenance — Traction' },
    desc: { fa: 'بازدید دوره‌ای کامل بر اساس اجزای سیستم؛ هر مورد را قبول/مردود/غیرمرتبط علامت بزنید', en: 'Component-based periodic visit; mark each item pass/fail/N.A.' },
    groups: [
      {
        title: { fa: '۱) موتورخانه و محیط', en: '1) Machine room & environment' },
        items: [
          { id: 'm1', fa: 'نظافت موتورخانه، دمای محیط (۵ تا ۴۰ درجه) و تهویه', en: 'Room cleanliness, temperature (5–40 °C), ventilation' },
          { id: 'm2', fa: 'روشنایی موتورخانه و کپسول اطفاء در دسترس', en: 'Room lighting and fire extinguisher available' },
          { id: 'm3', fa: 'عدم نشتی روغن روی کف و مسیرهای دسترسی آزاد', en: 'No oil on floor; clear access ways' }
        ]
      },
      {
        title: { fa: '۲) تابلو فرمان', en: '2) Controller' },
        items: [
          { id: 'm4', fa: 'آچارکشی ترمینال‌های قدرت و فرمان', en: 'Re-torque power and control terminals' },
          { id: 'm5', fa: 'فن و فیلتر تابلو تمیز و سالم', en: 'Panel fan and filter clean and working' },
          { id: 'm6', fa: 'حافظه خطاهای تابلو/درایو خوانده و ثبت شود', en: 'Read and log controller/drive fault memory' },
          { id: 'm7', fa: 'ولتاژ سه فاز و تقارن آن (اختلاف کمتر از ~۵٪)', en: 'Three-phase voltage and balance (<~5% deviation)' }
        ]
      },
      {
        title: { fa: '۳) موتور و ترمز', en: '3) Motor & brake' },
        items: [
          { id: 'm8', fa: 'صدا، لرزش و دمای موتور در حرکت', en: 'Motor noise, vibration, temperature during travel' },
          { id: 'm9', fa: 'سطح و نشتی روغن گیربکس (در موتور گیربکسی)', en: 'Gearbox oil level and leaks (geared machines)' },
          { id: 'm10', fa: 'ضخامت لنت ترمز و خلاصی طبق دستور سازنده', en: 'Brake lining thickness and clearance per manufacturer' },
          { id: 'm11', fa: 'باز شدن کامل و هم‌زمان کفشک‌های ترمز؛ بدون صدای کشیدن', en: 'Brake lifts fully and evenly; no dragging noise', ref: 'EN 81-20 §5.9.2' }
        ]
      },
      {
        title: { fa: '۴) فلکه کشش و سیم‌بکسل', en: '4) Sheave & ropes' },
        items: [
          { id: 'm12', fa: 'سایش شیار فلکه (بکسل نباید ته شیار بنشیند)', en: 'Sheave groove wear (ropes must not bottom out)' },
          { id: 'm13', fa: 'بازدید بکسل‌ها: رشته‌پارگی، قطر، زنگ‌زدگی', en: 'Ropes: broken wires, diameter, corrosion' },
          { id: 'm14', fa: 'کشش یکنواخت رشته‌ها (اختلاف حداکثر ~۵٪)', en: 'Even rope tension (max ~5% difference)' },
          { id: 'm15', fa: 'روانکاری سبک بکسل فقط در صورت نیاز', en: 'Light rope dressing only if needed' }
        ]
      },
      {
        title: { fa: '۵) چاه، ریل و وزنه', en: '5) Shaft, rails & counterweight' },
        items: [
          { id: 'm16', fa: 'روانکاری ریل‌ها و بازدید سایش کفشک‌ها', en: 'Rail lubrication; guide shoe wear' },
          { id: 'm17', fa: 'براکت‌ها و فیش‌پلیت‌ها محکم و هم‌راستا', en: 'Brackets and fishplates tight and aligned' },
          { id: 'm18', fa: 'قاب وزنه: شمش‌ها مهار شده، کفشک‌های وزنه سالم', en: 'Counterweight fillers secured; its shoes OK' },
          { id: 'm19', fa: 'گاورنر و فلکه کشنده: حرکت آزاد و کنتاکت سالم', en: 'Governor & tensioner: free movement, contact OK', ref: 'EN 81-20 §5.6.2' },
          { id: 'm20', fa: 'نظافت چاهک، وضعیت بافرها و کلید استپ چاهک', en: 'Pit clean; buffers and pit stop switch OK' }
        ]
      },
      {
        title: { fa: '۶) کابین', en: '6) Car' },
        items: [
          { id: 'm21', fa: 'روشنایی، فن، زنگ خطر و اینترکام کابین', en: 'Car light, fan, alarm and intercom' },
          { id: 'm22', fa: 'روشنایی اضطراری و باطری آن (تست با قطع برق)', en: 'Emergency light and battery (test with mains off)' },
          { id: 'm23', fa: 'شستی‌ها، نمراتور و شاسی‌های احضار طبقات', en: 'Car buttons, indicator, landing calls' }
        ]
      },
      {
        title: { fa: '۷) درب‌ها', en: '7) Doors' },
        items: [
          { id: 'm24', fa: 'فتوسل/پرده نوری: تمیز، تراز و تست برگشت', en: 'Light curtain: clean, aligned, reopen test' },
          { id: 'm25', fa: 'قفل‌های طبقات: درگیری حداقل ۷ میلی‌متر و کنتاکت سالم', en: 'Landing locks: ≥7 mm engagement, contact OK', ref: 'EN 81-20 §5.3.9.1' },
          { id: 'm26', fa: 'سیل‌ها تمیز؛ هنگرها و غلتک‌های زیرین تنظیم', en: 'Sills clean; hangers and upthrust rollers adjusted' },
          { id: 'm27', fa: 'نیروی بستن درب حداکثر ۱۵۰ نیوتن', en: 'Door closing force ≤150 N', ref: 'EN 81-20 §5.3.6.2' }
        ]
      },
      {
        title: { fa: '۸) مدار ایمنی و لیمیت‌ها', en: '8) Safety circuit & limits' },
        items: [
          { id: 'm28', fa: 'تست تک‌تک استپ‌ها (چاهک، موتورخانه، سقف کابین)', en: 'Test each stop switch (pit, MR, car top)' },
          { id: 'm29', fa: 'لیمیت‌های حد بالا/پایین و لیمیت نهایی', en: 'Up/down limits and final limits', ref: 'EN 81-20 §5.12.2' },
          { id: 'm30', fa: 'کنتاکت‌های درب کابین و طبقات (تست ویگل)', en: 'Car/landing door contacts (wiggle test)' }
        ]
      },
      {
        title: { fa: '۹) تست نهایی', en: '9) Final testing' },
        items: [
          { id: 'm31', fa: 'دقت توقف در همه طبقات (هدف ±۱۰ میلی‌متر)', en: 'Leveling at all floors (±10 mm target)' },
          { id: 'm32', fa: 'کیفیت حرکت: استارت، سرعت، توقف بدون ضربه', en: 'Ride quality: start, travel, stop without jerk' },
          { id: 'm33', fa: 'تست سیستم نجات اضطراری (باطری/UPS)', en: 'Emergency rescue device test (battery/UPS)' },
          { id: 'm34', fa: 'ثبت گزارش سرویس و اطلاع موارد مردود به کارفرما', en: 'Log service report; inform customer of failed items' }
        ]
      }
    ]
  },
  {
    id: 'hydraulic-maint',
    type: 'hydraulic',
    kind: 'maintenance',
    riskLevel: 'caution',
    title: { fa: 'چک‌لیست سرویس دوره‌ای — هیدرولیک', en: 'Preventive Maintenance — Hydraulic' },
    desc: { fa: 'بازدید دوره‌ای کامل پاوریونیت، جک و ادوات ایمنی؛ قبول/مردود/غیرمرتبط', en: 'Full periodic visit: power unit, jack, safety devices; pass/fail/N.A.' },
    groups: [
      {
        title: { fa: '۱) پاوریونیت — موتور و پمپ', en: '1) Power unit — motor & pump' },
        items: [
          { id: 'y1', fa: 'صدای پمپ: جیغ/خش‌خش = کاویتاسیون (فیلتر/روغن)', en: 'Pump noise: screech = cavitation (filter/oil)' },
          { id: 'y2', fa: 'دمای موتور و روغن پس از چند سفر متوالی (حداکثر ~۶۰ درجه)', en: 'Motor/oil temperature after consecutive runs (≤~60 °C)' },
          { id: 'y3', fa: 'تایمر محدودکننده زمان کار موتور فعال و تنظیم', en: 'Motor run-time limiter active and set', ref: 'EN 81-20 §5.9.3.10' }
        ]
      },
      {
        title: { fa: '۲) بلوک شیر', en: '2) Valve block' },
        items: [
          { id: 'y4', fa: 'تست شیر پایین‌بر دستی (نجات اضطراری)', en: 'Manual lowering valve test', ref: 'EN 81-20 §5.9.3.9' },
          { id: 'y5', fa: 'نشتی از شیر برقی‌ها و بلوک', en: 'Leaks at solenoids and block' },
          { id: 'y6', fa: 'فشار مانومتر با بار و بی‌بار اندازه‌گیری و ثبت شود', en: 'Gauge pressure with/without load measured and logged' }
        ]
      },
      {
        title: { fa: '۳) روغن و مخزن', en: '3) Oil & tank' },
        items: [
          { id: 'y7', fa: 'سطح روغن با کابین در پایین‌ترین طبقه', en: 'Oil level with car at bottom floor' },
          { id: 'y8', fa: 'رنگ و بوی روغن (کدر/سوخته = برنامه تعویض)', en: 'Oil color/smell (cloudy/burnt = plan replacement)' },
          { id: 'y9', fa: 'فیلتر مکش/برگشت بازدید یا تعویض طبق برنامه', en: 'Suction/return filter checked or replaced per schedule' }
        ]
      },
      {
        title: { fa: '۴) سیلندر و جک', en: '4) Cylinder & jack' },
        items: [
          { id: 'y10', fa: 'نشتی سیل سر سیلندر (لایه نازک طبیعی؛ چکه غیرمجاز)', en: 'Head seal leak (film OK, drips not)' },
          { id: 'y11', fa: 'سطح پیستون: بدون خط، خوردگی یا زنگ‌زدگی', en: 'Ram surface: no scoring, corrosion, rust' },
          { id: 'y12', fa: 'تست ریزش: افت حداکثر ~۱۰ میلی‌متر در ۱۰ دقیقه با بار', en: 'Creep test: ≤~10 mm drop in 10 min with load' }
        ]
      },
      {
        title: { fa: '۵) لوله‌ها و اتصالات', en: '5) Pipes & hoses' },
        items: [
          { id: 'y13', fa: 'نشتی اتصالات، شیلنگ فشار قوی و ترک‌های سطحی', en: 'Fitting leaks, high-pressure hose surface cracks' },
          { id: 'y14', fa: 'مهار و بست لوله‌ها؛ عدم تماس با لبه تیز', en: 'Pipe clamping; no contact with sharp edges' }
        ]
      },
      {
        title: { fa: '۶) کابین و درب‌ها', en: '6) Car & doors' },
        items: [
          { id: 'y15', fa: 'روشنایی، زنگ، اینترکام و روشنایی اضطراری کابین', en: 'Car light, alarm, intercom, emergency light' },
          { id: 'y16', fa: 'فتوسل، قفل‌های طبقات (درگیری ۷ میلی‌متر) و کنتاکت‌ها', en: 'Light curtain, landing locks (7 mm), contacts' },
          { id: 'y17', fa: 'سیل‌ها تمیز؛ هنگرها و نیروی بستن درب', en: 'Sills clean; hangers and closing force' }
        ]
      },
      {
        title: { fa: '۷) ادوات ایمنی', en: '7) Safety devices' },
        items: [
          { id: 'y18', fa: 'شیر پاراشوت (Rupture valve): تست دوره‌ای طبق سازنده', en: 'Rupture valve periodic test per manufacturer', ref: 'EN 81-20 §5.6.3' },
          { id: 'y19', fa: 'در سیستم 2:1: کنتاکت شلی بکسل و وضعیت بکسل‌ها', en: '2:1 systems: slack-rope contact and rope condition' },
          { id: 'y20', fa: 'استپ چاهک، لیمیت‌های حد و کلیدهای ایمنی', en: 'Pit stop, travel limits and safety switches' }
        ]
      },
      {
        title: { fa: '۸) همسطح‌سازی', en: '8) Leveling' },
        items: [
          { id: 'y21', fa: 'دقت توقف در همه طبقات با بار و بی‌بار', en: 'Stopping accuracy at all floors, loaded/empty' },
          { id: 'y22', fa: 'عملکرد همسطح‌سازی مجدد (Re-leveling) با درب بسته', en: 'Re-leveling operation with doors closed' }
        ]
      },
      {
        title: { fa: '۹) تست نهایی', en: '9) Final testing' },
        items: [
          { id: 'y23', fa: 'سفر کامل بالا/پایین با توقف همه طبقات', en: 'Full up/down trip with all stops' },
          { id: 'y24', fa: 'تمرین نجات اضطراری با شیر پایین‌بر دستی', en: 'Emergency rescue drill with manual lowering' },
          { id: 'y25', fa: 'ثبت گزارش سرویس و اطلاع موارد مردود به کارفرما', en: 'Log report; inform customer of failed items' }
        ]
      }
    ]
  },
  {
    id: 'en81-safety-audit',
    type: 'both',
    kind: 'maintenance',
    riskLevel: 'critical',
    title: { fa: 'بازرسی ایمنی EN 81-20 (دوره‌ای)', en: 'EN 81-20 Safety Audit (periodic)' },
    desc: { fa: 'ممیزی الزامات ایمنی کلیدی EN 81-20 / ۶۳۰۳-۲۰ برای هر دو نوع آسانسور — موارد هیدرولیک را می‌توانید «غیرمرتبط» بزنید', en: 'Audit of key EN 81-20 / ISIRI 6303-20 safety requirements for both lift types — mark hydraulic items N.A. where not applicable' },
    groups: [
      {
        title: { fa: '۱) درب‌ها', en: '1) Doors' },
        items: [
          { id: 'e1', fa: 'درگیری قفل درب طبقه حداقل ۷ میلی‌متر قبل از بسته شدن کنتاکت (همه طبقات)', en: 'Landing lock engagement ≥7 mm before contact closes (all floors)', ref: 'EN 81-20 §5.3.9.1' },
          { id: 'e2', fa: 'فاصله لته‌های درب حداکثر ۶ میلی‌متر (تا ۱۰ با سایش)', en: 'Door panel gaps ≤6 mm (10 mm after wear)', ref: 'EN 81-20 §5.3.1.4' },
          { id: 'e3', fa: 'نیروی بستن درب حداکثر ۱۵۰ نیوتن؛ انرژی جنبشی ≤۱۰ ژول', en: 'Closing force ≤150 N; kinetic energy ≤10 J', ref: 'EN 81-20 §5.3.6.2' },
          { id: 'e4', fa: 'برگشت خودکار درب (فتوسل/پرده نوری) در همه طبقات', en: 'Door reopening device works at all floors', ref: 'EN 81-20 §5.3.6.2.3' },
          { id: 'e5', fa: 'باز نشدن درب طبقه با دست وقتی کابین خارج از ناحیه ±۰.۲۰ متر است', en: 'Landing door cannot be opened by hand outside the ±0.20 m zone', ref: 'EN 81-20 §5.3.9.3' }
        ]
      },
      {
        title: { fa: '۲) مدار ایمنی و حرکت', en: '2) Safety circuit & travel' },
        items: [
          { id: 'e6', fa: 'کنتاکت‌های ایمنی مثبت‌گسست؛ تست تک‌تک کنتاکت‌ها (بدون پل زدن)', en: 'Positive-opening safety contacts; test each contact (no bridging)', ref: 'EN 81-20 §5.11.2' },
          { id: 'e7', fa: 'استپ‌های چاهک، سقف کابین، موتورخانه/تابلو MRL', en: 'Pit, car-roof and machine-room/MRL stop switches', ref: 'EN 81-20 §5.12.1.11' },
          { id: 'e8', fa: 'لیمیت‌های نهایی بالا/پایین و برگشت فقط با ریست تعمیرکار', en: 'Final limits and competent-person reset', ref: 'EN 81-20 §5.12.2' },
          { id: 'e9', fa: 'حالت بازرسی: کنترل فقط از سقف، سرعت حداکثر ۰.۳ متر بر ثانیه', en: 'Inspection mode: car-roof control only, speed ≤0.3 m/s', ref: 'EN 81-20 §5.12.1.8' },
          { id: 'e10', fa: 'دقت توقف همه طبقات در محدوده ±۱۰ میلی‌متر', en: 'Stopping accuracy within ±10 mm at all floors', ref: 'EN 81-20 §5.12.1.1.4' }
        ]
      },
      {
        title: { fa: '۳) کابین، چاه و چاهک', en: '3) Car, well & pit' },
        items: [
          { id: 'e11', fa: 'روشنایی چاه: ≥۵۰ لوکس در ۱ متری سقف کابین و کف چاهک؛ ≥۲۰ لوکس سایر نقاط', en: 'Well lighting: ≥50 lux at 1 m above car roof & pit floor; ≥20 lux elsewhere', ref: 'EN 81-20 §5.2.1.4.1' },
          { id: 'e12', fa: 'فضای جان‌پناه چاهک آزاد (ایستاده/خمیده/خوابیده) با کابین روی بافر', en: 'Pit refuge space clear (upright/crouching/lying) with car on buffers', ref: 'EN 81-20 §5.2.5.8.1' },
          { id: 'e13', fa: 'فضای جان‌پناه سقف کابین + فاصله بالاسری 1.0+0.035v²', en: 'Car-roof refuge + headroom 1.0+0.035v²', ref: 'EN 81-20 §5.2.5.7' },
          { id: 'e14', fa: 'فاصله کف چاهک تا کابین ≥۰.۵ متر (پیش‌بند ۰.۱ متر نزدیک دیوار)', en: 'Pit floor to car ≥0.5 m (apron 0.1 m near wall)', ref: 'EN 81-20 §5.2.5.8.2' },
          { id: 'e15', fa: 'زنگ خطر + اینترکام دوطرفه + باطری ≥۱ ساعت + روشنایی اضطراری', en: 'Alarm + two-way intercom + ≥1 h battery + emergency light', ref: 'EN 81-20 §5.12.3 / §5.4.10' },
          { id: 'e16', fa: 'پلاک ظرفیت، تعداد نفر و شماره شناسایی داخل کابین', en: 'Capacity, persons and ID plates inside the car', ref: 'EN 81-20 §5.4.2' }
        ]
      },
      {
        title: { fa: '۴) گاورنر، پاراشوت و محافظت حرکت', en: '4) Governor, safety gear & movement protection' },
        items: [
          { id: 'e17', fa: 'سرعت تریپ گاورنر بین ۱۱۵٪ سرعت نامی و سقف مجاز نوع پاراشوت', en: 'Governor tripping between 115% of rated speed and the type limit', ref: 'EN 81-20 §5.6.2.2.2' },
          { id: 'e18', fa: 'نوع پاراشوت متناسب با سرعت (لحظه‌ای فقط ≤۰.۶۳ متر بر ثانیه)', en: 'Safety gear type matches speed (instantaneous only ≤0.63 m/s)', ref: 'EN 81-20 §5.6.2.2.1' },
          { id: 'e19', fa: 'کنتاکت الکتریکی گاورنر قبل از تریپ مکانیکی قطع می‌کند', en: 'Governor electrical contact trips before mechanical tripping', ref: 'EN 81-20 §5.6.2.2.2' },
          { id: 'e20', fa: 'پاراشوت وزنه تعادل در صورت وجود فضای قابل دسترس زیر چاهک', en: 'Counterweight safety gear where space below pit is accessible', ref: 'EN 81-20 §5.6.2.6' },
          { id: 'e21', fa: 'محافظت اضافه‌سرعت صعود (ACOP) سالم و تست‌شده', en: 'Ascending overspeed protection (ACOP) present and tested', ref: 'EN 81-20 §5.6.6' },
          { id: 'e22', fa: 'محافظت حرکت ناخواسته (UCMP): توقف ≤۱.۲ متر با درب باز + ریست دستی', en: 'UCMP: stops within 1.2 m with doors open + manual reset', ref: 'EN 81-20 §5.6.7' }
        ]
      },
      {
        title: { fa: '۵) بافرها، بکسل‌ها و ترمز', en: '5) Buffers, ropes & brake' },
        items: [
          { id: 'e23', fa: 'بافر کابین و وزنه سالم؛ کورس مطابق نوع (0.135v² / 0.0674v²، حداقل ۶۵ میلی‌متر)', en: 'Car & counterweight buffers OK; stroke per type (0.135v² / 0.0674v², min 65 mm)', ref: 'EN 81-20 §5.8' },
          { id: 'e24', fa: 'تست ترمز: توقف و نگهداری با ۱۲۵٪ بار نامی', en: 'Brake test: stop & hold at 125% rated load', ref: 'EN 81-20 §5.9.2.2 / §6.3.1' },
          { id: 'e25', fa: 'ضریب اطمینان بکسل ≥۱۲ (۳+ رشته) یا ≥۱۶ (۲ رشته)؛ نسبت D/d ≥۴۰', en: 'Rope safety factor ≥12 (3+ ropes) or ≥16 (2 ropes); D/d ≥40', ref: 'EN 81-20 §5.5.2' },
          { id: 'e26', fa: 'توزیع یکنواخت بار بکسل‌ها و سلامت پایانه‌ها', en: 'Even rope load distribution and sound terminations', ref: 'EN 81-20 §5.5.5' }
        ]
      },
      {
        title: { fa: '۶) هیدرولیک (در صورت وجود)', en: '6) Hydraulic (where applicable)' },
        items: [
          { id: 'e27', fa: 'تنظیم شیر اطمینان ≤۱۴۰٪ فشار بار کامل (مانومتر + پلمپ)', en: 'Relief valve ≤140% of full-load pressure (gauge + sealed)', ref: 'EN 81-20 §5.9.3.5.3' },
          { id: 'e28', fa: 'شیر قطع‌کن دستی و شیر پایین‌بر اضطراری دستی', en: 'Manual shut-off valve and manual emergency lowering', ref: 'EN 81-20 §5.9.3.5.4 / §5.9.3.9' },
          { id: 'e29', fa: 'شیر پاراشوت + ریسترکتور عملکرد صحیح', en: 'Rupture valve + restrictor working', ref: 'EN 81-20 §5.6.3 / §5.6.4' },
          { id: 'e30', fa: 'تست ریزش: افت ≤۱۰ میلی‌متر در ۱۰ دقیقه با بار نامی', en: 'Creep test: drop ≤10 mm in 10 min at rated load', ref: 'رویه بازرسی' }
        ]
      },
      {
        title: { fa: '۷) مستندات و ثبت', en: '7) Records & documentation' },
        items: [
          { id: 'e31', fa: 'گزارش تست‌های قبل از بهره‌برداری (ترمز ۱۲۵٪، پاراشوت، بافر، UCMP و…) موجود است', en: 'Commissioning test records available (125% brake, safety gear, buffers, UCMP…)', ref: 'EN 81-20 §6.3' },
          { id: 'e32', fa: 'موارد مردود به کارفرما کتباً اطلاع داده شده', en: 'Failed items reported to the customer in writing' }
        ]
      }
    ]
  }
];
