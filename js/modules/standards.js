/* ================= STANDARDS CLAIM INDEX =================
   Legacy summaries are preserved for continuity, but no official source text,
   edition or page citation is present in this repository. Every record below is
   therefore classified UNVERIFIED and must not be used as a hard threshold or
   proof of compliance until checked against the applicable approved source. */
var STD81_CATS = [
  { id: 'all', fa: 'همه', en: 'All' },
  { id: 'well', fa: '🏗️ چاه و چاهک', en: 'Well & pit' },
  { id: 'refuge', fa: '🛡️ فضاهای جان‌پناه', en: 'Refuge spaces' },
  { id: 'doors', fa: '🚪 درب‌ها', en: 'Doors' },
  { id: 'car', fa: '🛗 کابین', en: 'Car' },
  { id: 'gov', fa: '⚙️ گاورنر و پاراشوت', en: 'Governor & safety gear' },
  { id: 'ucmp', fa: '🛑 حرکت ناخواسته و اضافه‌سرعت', en: 'UCM & overspeed' },
  { id: 'buffers', fa: '🛞 بافرها', en: 'Buffers' },
  { id: 'ropes', fa: '🔗 بکسل و زنجیر', en: 'Suspension means' },
  { id: 'machine', fa: '🌀 محرکه و موتورخانه', en: 'Machine & rooms' },
  { id: 'hyd', fa: '🛢️ هیدرولیک', en: 'Hydraulic' },
  { id: 'elec', fa: '⚡ برق و مدار ایمنی', en: 'Electrical safety' },
  { id: 'tests', fa: '🧪 تست‌ها و بازرسی', en: 'Tests & inspection' }
];
var STD81 = [
  /* ---------- well & pit ---------- */
  { id: 's-well-light', cat: 'well', icon: '💡', title: { fa: 'روشنایی چاه', en: 'Well lighting' }, clause: '§5.2.1.4.1', kind: 'limit',
    vals: [
      { fa: 'روشنایی در ۱ متری بالای سقف کابین (در هر موقعیت کابین)', en: 'At 1 m above the car roof, any car position', v: '≥ 50', unit: 'lux' },
      { fa: 'روشنایی در ۱ متری کف چاهک (تمام نقاط کار)', en: 'At 1 m above pit floor, all working areas', v: '≥ 50', unit: 'lux' },
      { fa: 'سایر نقاط چاه (خارج از سایه اجزا)', en: 'Remaining well areas (excluding shadows)', v: '≥ 20', unit: 'lux' }
    ],
    note: { fa: 'روشنایی دائمی چاه حتی با بسته بودن همه درب‌ها باید تأمین باشد.', en: 'Permanent lighting must work even with all doors closed.' } },
  { id: 's-well-elec', cat: 'well', icon: '🔌', title: { fa: 'تجهیزات برقی چاهک', en: 'Electrical equipment in the pit' }, clause: '§5.2.1.5', kind: 'req',
    vals: [
      { fa: 'کلید استپ چاهک — قابل مشاهده و دسترسی از درب چاهک و کف چاهک', en: 'Pit stop switch — visible/accessible from the pit door and pit floor', v: 'الزامی', unit: '' },
      { fa: 'پریز برق در چاهک', en: 'Socket outlet in the pit', v: 'الزامی', unit: '' },
      { fa: 'روشنایی چاهک', en: 'Pit lighting', v: 'الزامی', unit: '' }
    ],
    note: { fa: 'عمق چاهک ≤ ۱.۶ متر: استپ نزدیک درب؛ عمق بیشتر: استپ دوم نزدیک نردبان.', en: 'Pit ≤ 1.6 m deep: stop near the door; deeper: second stop near the ladder.' } },
  { id: 's-well-access', cat: 'well', icon: '🪜', title: { fa: 'دسترسی به چاهک', en: 'Pit access' }, clause: '§5.2.2.4', kind: 'limit',
    vals: [
      { fa: 'عمق چاهک بیشتر از ۲.۵ متر → درب دسترسی الزامی', en: 'Pit depth > 2.5 m → access door mandatory', v: '> 2.5', unit: 'm' },
      { fa: 'عمق چاهک تا ۲.۵ متر → درب دسترسی یا نردبان داخل چاه', en: 'Pit depth ≤ 2.5 m → access door or well ladder', v: '≤ 2.5', unit: 'm' }
    ],
    note: { fa: 'نردبان چاهک باید مطابق Annex F باشد (ابعاد، فاصله پله‌ها و محل نصب).', en: 'Pit ladders must comply with Annex F (dimensions, rung spacing, location).' } },
  { id: 's-well-wall', cat: 'well', icon: '🧱', title: { fa: 'استحکام دیوار چاه', en: 'Well wall strength' }, clause: '§5.2.1.1', kind: 'limit',
    vals: [
      { fa: 'تحمل نیروی افقی استاتیک ۱۰۰۰ نیوتن روی سطح ۰.۳×۰.۳ متر در هر نقطه', en: 'Withstand 1000 N static force over 0.3×0.3 m at any point', v: '1000 N', unit: '' },
      { fa: 'مقاومت بدون تغییر شکل دائمی', en: 'No permanent deformation', v: '—', unit: '' }
    ],
    note: { fa: 'برای دیوارهای پیش‌ساخته یا سبک، گواهی سازنده دیوار لازم است.', en: 'For lightweight/prefab walls, a wall-maker certificate is required.' } },
  { id: 's-well-below', cat: 'well', icon: '⬇️', title: { fa: 'فضای قابل دسترس زیر چاهک', en: 'Accessible space below the pit' }, clause: '§5.2.5.4', kind: 'req',
    vals: [
      { fa: 'کف چاهک باید بار اضافی حداقل ۵۰۰۰ نیوتن بر مترمربع را تحمل کند', en: 'Pit base must withstand at least 5000 N/m² imposed load', v: '5000', unit: 'N/m²' },
      { fa: 'وزنه تعادل باید پاراشوت داشته باشد (راه‌حل قدیمی «پایه بتنی» دیگر مجاز نیست)', en: 'Counterweight safety gear required (solid pier no longer accepted)', v: 'الزامی', unit: '' }
    ],
    note: { fa: 'وقتی زیر چاهک پارکینگ/فضای قابل دسترس است، پاراشوت وزنه تعادل اجباری است.', en: 'Where occupied space exists below the pit, counterweight safety gear is mandatory.' } },
  /* ---------- refuge spaces ---------- */
  { id: 's-refuge-pit', cat: 'refuge', icon: '🛡️', title: { fa: 'فضای جان‌پناه چاهک', en: 'Refuge space in the pit' }, clause: '§5.2.5.8.1 / Table 4', kind: 'limit',
    vals: [
      { fa: 'حالت ایستاده', en: 'Upright position', v: '0.4 × 0.5 × 2.0', unit: 'm' },
      { fa: 'حالت خمیده', en: 'Crouching position', v: '0.5 × 0.7 × 1.0', unit: 'm' },
      { fa: 'حالت خوابیده', en: 'Lying position', v: '0.7 × 1.0 × 0.5', unit: 'm' }
    ],
    note: { fa: 'با کابین روی بافر کاملاً فشرده باید حداقل یکی از این بلوک‌ها آزاد بماند. تعداد نفرات مجاز روی تابلو در چاهک قید می‌شود.', en: 'With the car on fully compressed buffers at least one of these blocks must remain clear. Allowed persons indicated on a pit sign.' } },
  { id: 's-refuge-roof', cat: 'refuge', icon: '🛡️', title: { fa: 'فضای جان‌پناه سقف کابین', en: 'Refuge space on the car roof' }, clause: '§5.2.5.7.1 / Table 3', kind: 'limit',
    vals: [
      { fa: 'حالت ایستاده', en: 'Upright position', v: '0.4 × 0.5 × 2.0', unit: 'm' },
      { fa: 'حالت خمیده', en: 'Crouching position', v: '0.5 × 0.7 × 1.0', unit: 'm' }
    ],
    note: { fa: 'در بالاترین موقعیت کابین، بالای سقف کابین. حالت خوابیده روی سقف کابین مجاز نیست.', en: 'At the highest car position, above the car roof. Lying position is not allowed on the car roof.' } },
  { id: 's-refuge-headroom', cat: 'refuge', icon: '📏', title: { fa: 'فاصله آزاد بالاسری', en: 'Headroom clearance' }, clause: '§5.2.5.7.2', kind: 'limit',
    vals: [
      { fa: 'با وزنه تعادل روی بافر فشرده: فاصله آزاد بالاترین نقطه سقف کابین تا سقف چاه', en: 'With counterweight on fully compressed buffers: free distance from car roof top to well ceiling', v: '1.0 + 0.035·v²', unit: 'm' },
      { fa: 'مثال سرعت ۱ متر بر ثانیه', en: 'Example at 1 m/s', v: '1.035', unit: 'm' },
      { fa: 'مثال سرعت ۲ متر بر ثانیه', en: 'Example at 2 m/s', v: '1.14', unit: 'm' }
    ],
    note: { fa: 'v سرعت نامی بر حسب m/s است. در صورت وجود طناب‌های جبران‌کننده یا ضدبرگشت، طبق §5.2.5.6.1 ممکن است متفاوت باشد.', en: 'v = rated speed in m/s. With compensating ropes or anti-rebound devices, see §5.2.5.6.1.' } },
  { id: 's-refuge-pit-clear', cat: 'refuge', icon: '📏', title: { fa: 'فاصله آزاد کف چاهک', en: 'Pit bottom clearance' }, clause: '§5.2.5.8.2', kind: 'limit',
    vals: [
      { fa: 'با کابین روی بافر فشرده: فاصله آزاد کف چاهک تا پایین‌ترین نقطه کابین', en: 'With car on fully compressed buffers: free distance from pit floor to lowest car part', v: '≥ 0.5', unit: 'm' },
      { fa: 'پیش‌بند یا درب کابین: در فاصله افقی حداکثر ۰.۱۵ متر از دیوار', en: 'Apron or vertical car door parts: within 0.15 m horizontally from the wall', v: '≥ 0.1', unit: 'm' }
    ],
    note: { fa: 'کاهش ۰.۵ به ۰.۱ متر فقط برای پیش‌بند/درب کابین و فقط در فاصله ۱۵ سانتی‌متری دیوار مجاز است.', en: 'The 0.5→0.1 m reduction applies only to apron/car door parts within 0.15 m of the wall.' } },
  /* ---------- doors ---------- */
  { id: 's-door-lock', cat: 'doors', icon: '🔒', title: { fa: 'درگیری قفل درب طبقه', en: 'Landing door lock engagement' }, clause: '§5.3.9', kind: 'limit', verif: true,
    vals: [
      { fa: 'درگیری مکانیکی قفل قبل از بسته شدن کنتاکت الکتریکی', en: 'Mechanical engagement before the electrical contact closes', v: '≥ 7', unit: 'mm' },
      { fa: 'کنتاکت ایمنی از نوع مثبت‌گسست', en: 'Safety contact, positive opening type', v: '§5.11.2', unit: '' }
    ],
    note: { fa: 'با درگیری کمتر از ۷ میلی‌متر مدار ایمنی نباید بسته شود — رایج‌ترین مردودی بازرسی.', en: 'Below 7 mm engagement the safety circuit must not close — a very common inspection failure.' } },
  { id: 's-door-gap', cat: 'doors', icon: '🚪', title: { fa: 'فاصله لته‌های درب', en: 'Door panel gaps' }, clause: '§5.3.1.4', kind: 'limit', verif: true,
    vals: [
      { fa: 'فاصله بین لته‌ها یا لته و چهارچوب/آستانه هنگام بسته بودن درب', en: 'Gap between panels or panel/frame/sill when closed', v: '≤ 6', unit: 'mm' },
      { fa: 'حد مجاز بر اثر سایش', en: 'Allowed after wear', v: '≤ 10', unit: 'mm' }
    ],
    note: { fa: 'بیش از ۱۰ میلی‌متر در هر شرایطی مردود است.', en: 'More than 10 mm fails in all cases.' } },
  { id: 's-door-force', cat: 'doors', icon: '💪', title: { fa: 'نیروی بستن درب', en: 'Door closing force' }, clause: '§5.3.6.2', kind: 'limit', verif: true,
    vals: [
      { fa: 'حداکثر نیروی بستن درب (جلوگیری از آسیب به نفر)', en: 'Max closing force (injury protection)', v: '≤ 150', unit: 'N' },
      { fa: 'حداکثر انرژی جنبشی لته‌ها', en: 'Max kinetic energy of panels', v: '≤ 10', unit: 'J' }
    ],
    note: { fa: 'بعد از هر تنظیم سردرب/فنر، نیروی بستن باید با نیروسنج اندازه‌گیری شود. برگشت خودکار درب (§5.3.6.2.3) پیش از رسیدن به این نیرو باید عمل کند.', en: 'Re-measure after any operator/spring adjustment. The reopening device (§5.3.6.2.3) must act before this force is reached.' } },
  { id: 's-door-cardoor', cat: 'doors', icon: '🛗', title: { fa: 'درب کابین', en: 'Car door' }, clause: '§5.3.1.1', kind: 'req',
    vals: [
      { fa: 'آسانسور مسافربری باید حتماً درب کابین داشته باشد', en: 'Passenger lifts must have a car door', v: 'الزامی', unit: '' },
      { fa: 'مدار ایمنی وجود درب کابین (کنتاکت بسته بودن)', en: 'Car door closed safety contact', v: '§5.3.13', unit: '' }
    ],
    note: { fa: 'حرکت بدون درب کابین بسته — جز در حالت‌های مجاز استاندارد — ممنوع است.', en: 'Travel with the car door not closed is prohibited except where the standard allows.' } },
  { id: 's-door-unlock', cat: 'doors', icon: '🔓', title: { fa: 'ناحیه باز شدن قفل', en: 'Unlocking zone' }, clause: '§5.3.9.3', kind: 'limit',
    vals: [
      { fa: 'باز شدن قفل درب طبقه فقط در ناحیه ±۰.۲۰ متر از تراز طبقه', en: 'Landing door unlock only within ±0.20 m of landing level', v: '± 0.20', unit: 'm' },
      { fa: 'خارج از این ناحیه درب طبقه نباید با دست باز شود', en: 'Outside this zone the landing door must not be openable by hand', v: 'ممنوع', unit: '' }
    ],
    note: { fa: 'وقتی کابین خارج از ناحیه است، تلاش برای باز کردن درب طبقه باید ناموفق بماند — تست ایمنی مهم.', en: 'With the car outside the zone, opening attempts must fail — an important safety test.' } },
  /* ---------- car ---------- */
  { id: 's-car-area', cat: 'car', icon: '📐', title: { fa: 'مساحت مجاز کابین', en: 'Available car area' }, clause: '§5.4.2 / Table 6', kind: 'limit',
    vals: [
      { fa: 'ظرفیت ۶۳۰ کیلوگرم (۸ نفر)', en: '630 kg (8 persons)', v: '1.66', unit: 'm²' },
      { fa: 'ظرفیت ۱۰۰۰ کیلوگرم (۱۳ نفر)', en: '1000 kg (13 persons)', v: '2.40', unit: 'm²' },
      { fa: 'ظرفیت ۲۵۰۰ کیلوگرم (۳۳ نفر)', en: '2500 kg (33 persons)', v: '5.00', unit: 'm²' }
    ],
    note: { fa: 'هر نفر ۷۵ کیلوگرم؛ بیش از ۲۵۰۰ کیلوگرم به ازای هر ۱۰۰ کیلوگرم، ۰.۱۶ مترمربع اضافه می‌شود. ماشین‌حساب «ظرفیت و مساحت» در همین اپ جدول کامل را دارد.', en: '75 kg per person; beyond 2500 kg add 0.16 m² per 100 kg. The capacity/area calculator in this app has the full table.' } },
  { id: 's-car-vent', cat: 'car', icon: '🌬️', title: { fa: 'تهویه کابین', en: 'Car ventilation' }, clause: '§5.4.9', kind: 'limit',
    vals: [
      { fa: 'منافذ تهویه در قسمت بالا و پایین کابین، هر یک حداقل ۱٪ مساحت کف کابین', en: 'Ventilation openings at top and bottom, each ≥ 1% of the car floor area', v: '≥ 1%', unit: 'each' }
    ],
    note: { fa: 'منافذ نباید به داخل چاه یا خارج بدنه باز شوند به نحوی که خطر گیر کردن عضو ایجاد شود.', en: 'Openings must not create entrapment hazards toward the well.' } },
  { id: 's-car-light', cat: 'car', icon: '💡', title: { fa: 'روشنایی کابین', en: 'Car lighting' }, clause: '§5.4.10', kind: 'limit',
    vals: [
      { fa: 'روشنایی روی سطح صفحه شستی', en: 'At the control device level', v: '≥ 100', unit: 'lux' },
      { fa: 'روشنایی در ۱ متری کف کابین', en: 'At 1 m above the car floor', v: '≥ 50', unit: 'lux' },
      { fa: 'روشنایی اضطراری (برق قطع)', en: 'Emergency lighting (mains off)', v: '≥ 1', unit: 'hour' }
    ],
    note: { fa: 'روشنایی اضطراری با قطع برق باید خودکار روشن شود و حداقل ۱ ساعت کار کند.', en: 'Emergency light must switch on automatically and last ≥ 1 hour.' } },
  { id: 's-car-alarm', cat: 'car', icon: '🔔', title: { fa: 'آلارم اضطراری و اینترکام', en: 'Emergency alarm & intercom' }, clause: '§5.12.3', kind: 'req',
    vals: [
      { fa: 'زنگ خطر اضطراری قابل شنیدن بیرون از چاه', en: 'Emergency alarm audible outside the well', v: 'الزامی', unit: '' },
      { fa: 'اینترکام دوطرفه با مرکز نجات/مسئول ساختمان', en: 'Two-way intercom to the rescue service', v: '§5.12.3.3', unit: '' },
      { fa: 'منبع برق اضطراری آلارم (باطری) حداقل', en: 'Alarm emergency power (battery) at least', v: '1', unit: 'hour' }
    ],
    note: { fa: 'بعد از فشردن دکمه، ادامه ارتباط نباید نیاز به اقدام مجدد مسافر داشته باشد. الزامات تفصیلی: EN 81-28.', en: 'After initiation, communication must not require further passenger action. Details: EN 81-28.' } },
  /* ---------- governor & safety gear ---------- */
  { id: 's-gov-trip', cat: 'gov', icon: '⚙️', title: { fa: 'سرعت عملکرد گاورنر', en: 'Governor tripping speed' }, clause: '§5.6.2.2.1', kind: 'limit', verif: true,
    vals: [
      { fa: 'حداقل سرعت تریپ: ۱۱۵٪ سرعت نامی', en: 'Minimum tripping speed: 115% of rated speed', v: '≥ 1.15·v', unit: '' },
      { fa: 'سقف — پاراشوت لحظه‌ای (به‌جز غلتک‌محور)', en: 'Max — instantaneous (except captive roller)', v: '0.8', unit: 'm/s' },
      { fa: 'سقف — پاراشوت لحظه‌ای غلتک‌محور', en: 'Max — captive roller instantaneous', v: '1.0', unit: 'm/s' },
      { fa: 'سقف — لحظه‌ای ضربه‌گیر و پیشرونده با سرعت نامی ≤ ۱', en: 'Max — buffered instantaneous & progressive, rated speed ≤ 1 m/s', v: '1.5', unit: 'm/s' },
      { fa: 'سقف — پیشرونده با سرعت نامی > ۱', en: 'Max — progressive, rated speed > 1 m/s', v: '1.25·v + 0.25/v', unit: 'm/s' }
    ],
    note: { fa: 'کنتاکت الکتریکی گاورنر باید قبل از تریپ مکانیکی عمل کند. ماشین‌حساب «گاورنر» همین اپ محدوده را محاسبه می‌کند.', en: 'The governor electrical contact must trip before the mechanical tripping. See the governor calculator in this app.' } },
  { id: 's-gov-type', cat: 'gov', icon: '🛠️', title: { fa: 'نوع پاراشوت مجاز', en: 'Safety gear type vs speed' }, clause: '§5.6.2.2.1', kind: 'limit',
    vals: [
      { fa: 'پاراشوت لحظه‌ای فقط تا سرعت نامی ۰.۶۳ متر بر ثانیه', en: 'Instantaneous safety gear only up to 0.63 m/s rated speed', v: '≤ 0.63', unit: 'm/s' },
      { fa: 'سرعت نامی بالاتر → پاراشوت پیشرونده الزامی', en: 'Higher rated speeds → progressive safety gear mandatory', v: '> 0.63', unit: 'm/s' }
    ],
    note: { fa: 'در سرعت‌های بالای ۰.۶۳ حتی با بافر هم پاراشوت لحظه‌ای مجاز نیست.', en: 'Above 0.63 m/s instantaneous gears are not compliant even with buffering.' } },
  { id: 's-gov-cwt', cat: 'gov', icon: '⚖️', title: { fa: 'گاورنر وزنه تعادل', en: 'Counterweight governor' }, clause: '§5.6.2.2.2', kind: 'limit',
    vals: [
      { fa: 'سرعت تریپ حداکثر ۱۰٪ بالاتر از سرعت تریپ گاورنر کابین', en: 'Tripping speed at most 10% above the car governor', v: '≤ +10%', unit: '' }
    ],
    note: { fa: 'گاورنر وزنه فقط وقتی لازم است که پاراشوت وزنه تعادل نصب باشد (فضای قابل دسترس زیر چاهک).', en: 'A counterweight governor is only needed where a counterweight safety gear is fitted (accessible space below the pit).' } },
  { id: 's-gov-cwtsg', cat: 'gov', icon: '🛡️', title: { fa: 'پاراشوت وزنه تعادل', en: 'Counterweight safety gear' }, clause: '§5.6.2.6', kind: 'req',
    vals: [
      { fa: 'وجود فضای قابل دسترس زیر مسیر وزنه → پاراشوت وزنه الزامی', en: 'Accessible space below the counterweight path → safety gear mandatory', v: 'الزامی', unit: '' },
      { fa: 'تریپ توسط گاورنر (یا وسیله هم‌ارز)', en: 'Tripped by governor (or equivalent)', v: 'الزامی', unit: '' }
    ],
    note: { fa: 'راه‌حل قدیمی «پایه سخت زیر وزنه» در EN 81-20 پذیرفته نیست.', en: 'The old solid-pier solution is no longer accepted under EN 81-20.' } },
  /* ---------- UCM & overspeed ---------- */
  { id: 's-ucmp', cat: 'ucmp', icon: '🛑', title: { fa: 'محافظت حرکت ناخواسته (UCMP)', en: 'Unintended car movement protection' }, clause: '§5.6.7', kind: 'req',
    vals: [
      { fa: 'تشخیص حرکت ناخواسته کابین وقتی درب طبقه قفل نشده و درب کابین بسته نیست', en: 'Detect unintended car movement with landing door unlocked and car door open', v: 'الزامی', unit: '' },
      { fa: 'حداکثر جابه‌جایی مجاز از لبه ناحیه باز شدن قفل تا توقف کامل', en: 'Max movement from the unlocking zone edge to full stop', v: '≤ 1.2', unit: 'm' },
      { fa: 'نگه‌داشتن کابین متوقف + ریست دستی توسط شخص مجاز', en: 'Hold the car stopped + manual reset by authorized person', v: 'الزامی', unit: '' }
    ],
    note: { fa: 'در آسانسور کششی وسیله توقف می‌تواند پاراشوت دوطرفه، ترمز بکسل یا ترمز دوم باشد. تست طبق §6.3.13 با کابین خالی (رو به بالا) و بار نامی (رو به پایین).', en: 'Stopping means may be bidirectional safety gear, rope brake or secondary brake. Test per §6.3.13 with empty car (up) and rated load (down).' } },
  { id: 's-acop', cat: 'ucmp', icon: '⬆️', title: { fa: 'محافظت اضافه‌سرعت صعود (ACOP)', en: 'Ascending car overspeed protection' }, clause: '§5.6.6', kind: 'req',
    vals: [
      { fa: 'تشخیص اضافه‌سرعت کابین در حرکت رو به بالا (کششی)', en: 'Detect upward overspeed of the car (traction lifts)', v: 'الزامی', unit: '' },
      { fa: 'توقف کابین یا کاهش سرعت تا حد مجاز بافر وزنه تعادل', en: 'Stop the car or slow it to the counterweight buffer rated speed', v: 'الزامی', unit: '' },
      { fa: 'تست قبل از بهره‌برداری', en: 'Test before putting into service', v: '§6.3.11', unit: '' }
    ],
    note: { fa: 'وسیله توقف معمولاً ترمز بکسل یا پاراشوت دوطرفه است. ریست دستی لازم است.', en: 'Usually a rope brake or bidirectional safety gear; manual reset required.' } },
  { id: 's-rupture', cat: 'ucmp', icon: '🛢️', title: { fa: 'شیر پاراشوت (هیدرولیک)', en: 'Rupture valve (hydraulic)' }, clause: '§5.6.3', kind: 'limit',
    vals: [
      { fa: 'تریپ حداکثر در سرعت vd + 0.30 متر بر ثانیه (با ریسترکتور)', en: 'Trip at latest at vd + 0.30 m/s (with restrictor)', v: 'vd + 0.3', unit: 'm/s' },
      { fa: 'سایر موارد: تریپ از سرعت ۱۱۵٪ سرعت نامی رو به پایین', en: 'Otherwise: from 115% of rated downward speed', v: '1.15·vd', unit: '' },
      { fa: 'توقف و نگه‌داشتن کابین در حرکت رو به پایین', en: 'Stop the downward car and hold it', v: 'الزامی', unit: '' }
    ],
    note: { fa: 'تست قبل از بهره‌برداری طبق §6.3.8 و به‌صورت دوره‌ای طبق دستور سازنده.', en: 'Test per §6.3.8 and periodically per manufacturer.' } },
  { id: 's-restrictor', cat: 'ucmp', icon: '🌊', title: { fa: 'ریسترکتور (محدودکننده جریان)', en: 'Restrictor / one-way restrictor' }, clause: '§5.6.4', kind: 'limit',
    vals: [
      { fa: 'با نشتی بزرگ در مدار، سرعت پایین‌روی کابین با بار نامی حداکثر vd + 0.30', en: 'With a major leak, downward speed at rated load ≤ vd + 0.30 m/s', v: '≤ vd + 0.3', unit: 'm/s' }
    ],
    note: { fa: 'ریسترکتور یک‌طرفه با اجزای صرفاً مکانیکی جزء ایمنی محسوب می‌شود.', en: 'A one-way restrictor with purely mechanical parts counts as a safety component.' } },
  /* ---------- buffers ---------- */
  { id: 's-buffer-req', cat: 'buffers', icon: '🛞', title: { fa: 'بافر کابین و وزنه تعادل', en: 'Car & counterweight buffers' }, clause: '§5.8.1', kind: 'req',
    vals: [
      { fa: 'بافر در انتهای کورس کابین و وزنه تعادل', en: 'Buffers at the end of car and counterweight travel', v: 'الزامی', unit: '' },
      { fa: 'برگشت بافر انرژی‌انباشت باید با وسیله ضدبرگشت کنترل شود', en: 'Energy-accumulation rebound must be controlled', v: '§5.8.2.2.2', unit: '' }
    ],
    note: { fa: 'نوع بافر باید با حداکثر سرعت ضربه (تریپ گاورنر) هم‌خوان باشد.', en: 'Buffer type must match the maximum impact speed (governor tripping).' } },
  { id: 's-buffer-stroke', cat: 'buffers', icon: '📏', title: { fa: 'کورس (حرکت) بافر', en: 'Buffer stroke' }, clause: '§5.8.2.2', kind: 'limit',
    vals: [
      { fa: 'انباشت انرژی با برگشت ضربه‌گیر: حداقل 0.135·v² متر (و نه کمتر از ۶۵ میلی‌متر)', en: 'Energy accumulation, buffered return: ≥ 0.135·v² m (min 65 mm)', v: '0.135·v²', unit: 'm' },
      { fa: 'اتلاف انرژی (هیدرولیک): حداقل 0.0674·v² متر', en: 'Energy dissipation (hydraulic): ≥ 0.0674·v² m', v: '0.0674·v²', unit: 'm' },
      { fa: 'حداقل کورس در هر دو نوع', en: 'Minimum stroke in all cases', v: '65', unit: 'mm' }
    ],
    note: { fa: 'ماشین‌حساب «کورس بافر» همین اپ مقدار دقیق را می‌دهد. شتاب متوسط مجاز در اتلاف انرژی حدود ۱g و قله آن حداکثر 2.5g برای بیش از ۰.۰۴ ثانیه است.', en: 'See the buffer-stroke calculator in this app. Energy dissipation: mean deceleration ~1g, peak ≤ 2.5g for more than 0.04 s.' } },
  /* ---------- suspension ---------- */
  { id: 's-rope-num', cat: 'ropes', icon: '🔗', title: { fa: 'تعداد سیم‌بکسل', en: 'Number of suspension ropes' }, clause: '§5.5.1', kind: 'limit',
    vals: [
      { fa: 'حداقل تعداد بکسل در آسانسور کششی', en: 'Minimum number of ropes, traction lifts', v: '≥ 2', unit: '' }
    ],
    note: { fa: 'بکسل‌ها باید مستقل از هم مهار شوند (پایانه مجزا).', en: 'Ropes must have independent terminations.' } },
  { id: 's-rope-sf', cat: 'ropes', icon: '🧮', title: { fa: 'ضریب اطمینان بکسل', en: 'Rope safety factor' }, clause: '§5.5.2.2', kind: 'limit',
    vals: [
      { fa: 'کششی با ۳ رشته بکسل یا بیشتر', en: 'Traction with 3 or more ropes', v: '≥ 12', unit: '' },
      { fa: 'کششی با ۲ رشته بکسل', en: 'Traction with 2 ropes', v: '≥ 16', unit: '' }
    ],
    note: { fa: 'مخرج کسر: بار استاتیک روی بکسل‌ها با کابین در پایین‌ترین طبقه با بار نامی. ماشین‌حساب «ضریب اطمینان بکسل» در اپ این قاعده را اعمال می‌کند.', en: 'Denominator: static load with car at the lowest landing with rated load. The rope calculator in this app applies this rule.' } },
  { id: 's-rope-dd', cat: 'ropes', icon: '🛞', title: { fa: 'نسبت قطر فلکه به بکسل', en: 'Sheave/rope diameter ratio' }, clause: '§5.5.2.1', kind: 'limit',
    vals: [
      { fa: 'نسبت قطر فلکه کشش/هرزگرد به قطر بکسل', en: 'Traction/diverter sheave diameter to rope diameter', v: '≥ 40', unit: 'D/d' }
    ],
    note: { fa: 'مقادیر بالاتر برای فلکه‌های جبران‌کننده و تعداد برگشت زیاد لازم است.', en: 'Higher ratios apply for compensation sheaves and multiple reverse bends.' } },
  { id: 's-rope-balance', cat: 'ropes', icon: '⚖️', title: { fa: 'توزیع بار بکسل‌ها', en: 'Rope load distribution' }, clause: '§5.5.5', kind: 'req',
    vals: [
      { fa: 'توزیع یکنواخت بار بین رشته‌ها + تشخیص شلی/پارگی در صورت نیاز', en: 'Even load distribution + slack/broken rope detection where required', v: 'الزامی', unit: '' },
      { fa: 'در هیدرولیک 2:1: کنتاکت شلی بکسل', en: 'Hydraulic 2:1: slack-rope contact', v: 'الزامی', unit: '' }
    ],
    note: { fa: 'اختلاف کشش رشته‌ها را با ترازوی کشش بسنجید (هدف معمول ≤ ۵٪).', en: 'Check rope tensions with a tension gauge (typical target ≤ 5%).' } },
  /* ---------- machine ---------- */
  { id: 's-brake', cat: 'machine', icon: '🛑', title: { fa: 'ترمز موتور', en: 'Machine brake' }, clause: '§5.9.2.2', kind: 'req',
    vals: [
      { fa: 'توقف و نگه‌داری کابین با ۱۲۵٪ بار نامی در حرکت رو به پایین', en: 'Stop and hold the car with 125% rated load moving downward', v: '125%', unit: '' },
      { fa: 'ترمز مکانیکی-الکتریکی «عادی بسته» (با فنر می‌گیرد)', en: 'Electro-mechanical, normally closed (spring applied)', v: 'الزامی', unit: '' },
      { fa: 'تست قبل از بهره‌برداری', en: 'Test before putting into service', v: '§6.3.1', unit: '' }
    ],
    note: { fa: 'ترمز باید حداقل دو مجموعه مستقل فنر/کفشک داشته باشد یا الزامات افزونگی §5.9.2.2 را برآورده کند. هرگز با ترمز باز کابین را رها نکنید.', en: 'Two independent spring/shoe sets or the redundancy of §5.9.2.2. Never release the brake with an unbalanced car.' } },
  { id: 's-brake-release', cat: 'machine', icon: '🖐️', title: { fa: 'رهاسازی اضطراری ترمز', en: 'Emergency brake release' }, clause: '§5.9.2.3', kind: 'req',
    vals: [
      { fa: 'باز کردن دستی ترمز با فرمان دستی برای نجات مسافران', en: 'Manual brake release for rescue', v: 'الزامی', unit: '' },
      { fa: 'نیروی مداوم دست هنگام رهاسازی', en: 'Continuous manual force while released', v: 'الزامی', unit: '' }
    ],
    note: { fa: 'در MRL وسیله رهاسازی باید خارج از چاه قابل دسترس باشد (یا هم‌ارز آن).', en: 'In MRL lifts the release means must be reachable from outside the well (or equivalent).' } },
  { id: 's-mr-space', cat: 'machine', icon: '🚧', title: { fa: 'فضاهای موتورخانه', en: 'Machine room spaces' }, clause: '§5.2.6', kind: 'limit',
    vals: [
      { fa: 'ارتفاع آزاد مسیر حرکت و دسترسی', en: 'Clear height for movement/access', v: '≥ 1.8', unit: 'm' },
      { fa: 'ارتفاع کاری نزدیک تجهیزات', en: 'Working height at equipment', v: '≥ 2.1', unit: 'm' }
    ],
    note: { fa: 'درب‌های دسترسی: ارتفاع ≥ ۲.۰ متر، عرض ≥ ۰.۶ متر (درب اتاق فلکه: ارتفاع ≥ ۱.۴ متر).', en: 'Access doors: height ≥ 2.0 m, width ≥ 0.6 m (pulley room: ≥ 1.4 m).' } },
  /* ---------- hydraulic ---------- */
  { id: 's-hyd-relief', cat: 'hyd', icon: '🌡️', title: { fa: 'شیر اطمینان (رلیف)', en: 'Pressure relief valve' }, clause: '§5.9.3.5.3', kind: 'limit',
    vals: [
      { fa: 'تنظیم شیر اطمینان حداکثر ۱۴۰٪ فشار بار کامل', en: 'Relief setting ≤ 140% of full-load pressure', v: '≤ 140%', unit: '' }
    ],
    note: { fa: 'آسانسورهایی با تنظیم رلیف بالای ۵۰ مگاپاسکال خارج از شمول EN 81-20 هستند. تنظیم با مانومتر و پلمپ.', en: 'Relief settings above 50 MPa fall outside EN 81-20 scope. Set with a gauge and seal.' } },
  { id: 's-hyd-shutoff', cat: 'hyd', icon: '🔧', title: { fa: 'شیر قطع‌کن دستی', en: 'Manual shut-off valve' }, clause: '§5.9.3.5.4', kind: 'req',
    vals: [
      { fa: 'شیر قطع‌کن دستی بین پاوریونیت و جک', en: 'Manual shut-off valve between power unit and jack', v: 'الزامی', unit: '' }
    ],
    note: { fa: 'برای تعمیرات و نجات باید قابل دسترس باشد.', en: 'Must be accessible for maintenance and rescue.' } },
  { id: 's-hyd-lowering', cat: 'hyd', icon: '⬇️', title: { fa: 'پایین‌آوردن اضطراری دستی', en: 'Manual emergency lowering' }, clause: '§5.9.3.9', kind: 'req',
    vals: [
      { fa: 'شیر پایین‌بر دستی برای نجات در قطع برق', en: 'Manual lowering valve for rescue during power failure', v: 'الزامی', unit: '' },
      { fa: 'نیازمند نیروی مداوم دست هنگام کار', en: 'Continuous manual force while operating', v: 'الزامی', unit: '' }
    ],
    note: { fa: 'همراه اینترکام (§5.12.3.3) امکان نجات کامل را فراهم می‌کند. سرعت پایین‌روی باید محدود باشد.', en: 'Together with the intercom (§5.12.3.3) enables full rescue. Lowering speed must be limited.' } },
  { id: 's-hyd-motor', cat: 'hyd', icon: '⏱️', title: { fa: 'محافظت موتور پمپ', en: 'Motor protection' }, clause: '§5.9.3.10', kind: 'req',
    vals: [
      { fa: 'محدودکننده زمان کار موتور + حفاظت دمایی', en: 'Motor run-time limiter + thermal protection', v: 'الزامی', unit: '' }
    ],
    note: { fa: 'توقف‌های مکرر/طولانی نباید به داغی و سوختن موتور منجر شود؛ بی‌متال را هرگز روی جریان بالاتر تنظیم نکنید.', en: 'Repeated long runs must not overheat the motor; never re-set the thermal relay higher.' } },
  { id: 's-hyd-pressure-test', cat: 'hyd', icon: '🧪', title: { fa: 'تست فشار استاتیک', en: 'Static pressure test' }, clause: '§6.3.10', kind: 'req',
    vals: [
      { fa: 'فشار تست: ۲۰۰٪ فشار بار کامل', en: 'Test pressure: 200% of full-load pressure', v: '200%', unit: '' },
      { fa: 'مدت نگه‌داشتن فشار', en: 'Hold time', v: '5', unit: 'min' },
      { fa: 'افت فشار غیرمجاز در طول تست', en: 'Unacceptable pressure drop during the test', v: 'مردود', unit: '' }
    ],
    note: { fa: 'قبل از بهره‌برداری و بعد از هر تغییر مهم در مدار هیدرولیک تکرار شود.', en: 'Repeat before commissioning and after any major hydraulic circuit change.' } },
  { id: 's-hyd-creep', cat: 'hyd', icon: '📉', title: { fa: 'تست ریزش کابین', en: 'Creep / sink test' }, clause: 'رویه بازرسی', kind: 'limit',
    vals: [
      { fa: 'افت کابین با بار نامی در ۱۰ دقیقه', en: 'Car drop with rated load in 10 minutes', v: '≤ 10', unit: 'mm' }
    ],
    note: { fa: 'معیار رایج پذیرفته‌شده در بازرسی‌ها برای سلامت چک‌والو/سیل؛ همیشه با کابین بارگذاری‌شده و درب‌ها بسته انجام شود.', en: 'Common inspection criterion for check-valve/seal health; run loaded, doors closed.' } },
  /* ---------- electrical ---------- */
  { id: 's-elec-contacts', cat: 'elec', icon: '⚡', title: { fa: 'کنتاکت‌های ایمنی', en: 'Electric safety devices' }, clause: '§5.11.2', kind: 'req',
    vals: [
      { fa: 'کنتاکت‌های ایمنی باید از نوع مثبت‌گسست (باز شدن اجباری) باشند', en: 'Safety contacts must be positive-opening (forced break)', v: 'الزامی', unit: '' },
      { fa: 'قطع مدار ایمنی باید مستقیماً حرکت را متوقف کند', en: 'Opening the safety circuit must directly stop movement', v: 'الزامی', unit: '' }
    ],
    note: { fa: 'کنتاکت درب، قفل، استپ، گاورنر، پاراشوت و شلی بکسل همگی در این دسته‌اند. پل زدن آن‌ها ممنوع است.', en: 'Door, lock, stop, governor, safety gear and slack-rope contacts all qualify. Never bridge them.' } },
  { id: 's-elec-limits', cat: 'elec', icon: '🏁', title: { fa: 'لیمیت‌های نهایی', en: 'Final limit switches' }, clause: '§5.12.2', kind: 'req',
    vals: [
      { fa: 'توقف حرکت قبل از برخورد کابین/وزنه به بافر', en: 'Stop travel before the car/counterweight hits the buffers', v: 'الزامی', unit: '' },
      { fa: 'بازگشت به کار عادی فقط با مداخله شخص مجاز (ریست)', en: 'Return to normal only via competent-person reset', v: 'الزامی', unit: '' }
    ],
    note: { fa: 'عملکرد لیمیت نهایی باید مستقل از لیمیت‌های کندکننده/توقف عادی باشد.', en: 'Final limits must work independently of normal slowdown/stop switches.' } },
  { id: 's-elec-inspect', cat: 'elec', icon: '🐢', title: { fa: 'حالت بازرسی', en: 'Inspection operation' }, clause: '§5.12.1.8', kind: 'limit',
    vals: [
      { fa: 'حداکثر سرعت در حالت بازرسی', en: 'Max inspection speed', v: '≤ 0.30', unit: 'm/s' },
      { fa: 'کنترل حرکت فقط از روی سقف کابین', en: 'Movement control only from the car roof', v: 'الزامی', unit: '' }
    ],
    note: { fa: 'کار روی سقف کابین فقط در این حالت؛ استپ در دسترس باشد.', en: 'Car-roof work only in this mode; keep the stop switch at hand.' } },
  { id: 's-elec-level', cat: 'elec', icon: '🎯', title: { fa: 'دقت توقف', en: 'Stopping / levelling accuracy' }, clause: '§5.12.1.1.4', kind: 'limit', verif: true,
    vals: [
      { fa: 'دقت توقف (اختلاف آستانه کابین و طبقه)', en: 'Stopping accuracy (car sill to landing sill)', v: '± 10', unit: 'mm' },
      { fa: 'تست قبل از بهره‌برداری', en: 'Test before putting into service', v: '§6.3.12', unit: '' }
    ],
    note: { fa: 'خارج از ±۱۰ میلی‌متر را در سرویس‌ها ثبت و تنظیم کنید — خطر زمین خوردن مسافر.', en: 'Log and correct anything beyond ±10 mm — a trip hazard for passengers.' } },
  { id: 's-elec-stops', cat: 'elec', icon: '✋', title: { fa: 'کلیدهای استپ', en: 'Stop switches' }, clause: '§5.12.1.11', kind: 'req',
    vals: [
      { fa: 'استپ در: چاهک، سقف کابین، موتورخانه (در صورت وجود) و کنار تابلو MRL', en: 'Stops at: pit, car roof, machine room (where present) and MRL panel', v: 'الزامی', unit: '' },
      { fa: 'عملکرد قفل در حالت فشرده + ریست دستی', en: 'Latch in the operated position + manual reset', v: 'الزامی', unit: '' }
    ],
    note: { fa: 'استپ باید از نوع کنتاکت ایمنی مثبت‌گسست باشد.', en: 'Stops must use positive-opening safety contacts.' } },
  /* ---------- tests ---------- */
  { id: 's-test-list', cat: 'tests', icon: '🧪', title: { fa: 'تست‌های قبل از بهره‌برداری', en: 'Tests before putting into service' }, clause: '§6.3', kind: 'req',
    vals: [
      { fa: 'ترمز با ۱۲۵٪ بار', en: 'Brake at 125% load', v: '§6.3.1', unit: '' },
      { fa: 'پاراشوت کابین / پاراشوت وزنه', en: 'Car safety gear / counterweight safety gear', v: '§6.3.4 / §6.3.5', unit: '' },
      { fa: 'بافرها', en: 'Buffers', v: '§6.3.7', unit: '' },
      { fa: 'شیر پاراشوت / ریسترکتور (هیدرولیک)', en: 'Rupture valve / restrictor (hydraulic)', v: '§6.3.8 / §6.3.9', unit: '' },
      { fa: 'تست فشار ۲۰۰٪ (هیدرولیک)', en: 'Pressure test 200% (hydraulic)', v: '§6.3.10', unit: '' },
      { fa: 'محافظت اضافه‌سرعت صعود', en: 'Ascending overspeed protection', v: '§6.3.11', unit: '' },
      { fa: 'دقت توقف', en: 'Levelling accuracy', v: '§6.3.12', unit: '' },
      { fa: 'محافظت حرکت ناخواسته', en: 'Unintended movement protection', v: '§6.3.13', unit: '' }
    ],
    note: { fa: 'آزمون‌های دوره‌ای و بعد از تغییر مهم یا حادثه: Annex C استاندارد و مقررات ملی.', en: 'Periodic tests and after major modification/accident: Annex C and national rules.' } },
  { id: 's-test-plate', cat: 'tests', icon: '🏷️', title: { fa: 'برچسب‌ها و اطلاعات داخل کابین', en: 'Car marking & information' }, clause: '§5.4.2 / §7', kind: 'req',
    vals: [
      { fa: 'پلاک ظرفیت (کیلوگرم) و تعداد نفر', en: 'Rated load (kg) and persons plate', v: 'الزامی', unit: '' },
      { fa: 'شماره شناسایی آسانسور و اطلاعات سازنده', en: 'Lift identification number and manufacturer data', v: 'الزامی', unit: '' },
      { fa: 'دفترچه سرویس (Logbook) نزد مالک', en: 'Logbook kept by the owner', v: '§7.3', unit: '' }
    ],
    note: { fa: 'برچسب‌ها باید در داخل کابین، قابل خواندن و دائمی باشند.', en: 'Plates must be inside the car, legible and permanent.' } }
];

/* ================= EN 81-50 — آزمون‌ها و آزمایش اجزاء ایمنی =================
   قوانین آزمون (Test rules) — شامل آزمون‌های نوع (Type Examination) اجزاء ایمنی و
   آزمون‌های پذیرش/به‌ره‌برداری. مقادیر، خلاصه‌ی راهنما هستند (مطابق EN 81-20). */
var STD8150_CATS = [
  { id: 'all', fa: 'همه', en: 'All' },
  { id: 'safety', fa: '🛡️ آزمون اجزاء ایمنی', en: 'Safety-component tests' },
  { id: 'field', fa: '🧪 آزمون‌های پذیرش', en: 'Acceptance tests' },
  { id: 'elec', fa: '⚡ آزمون‌های الکتریکی', en: 'Electrical tests' }
];
var STD8150 = [
  { id: 's50-gov', cat: 'safety', icon: '⚙️', title: { fa: 'آزمون تریپ گاورنر', en: 'Governor tripping test' }, clause: '§5.6.2.2.1', kind: 'test', verif: true,
    vals: [
      { fa: 'پاراشوت پیشرونده → سرعت تریپ حداقل ۱۱۵٪ سرعت نامی', en: 'Progressive safety gear → trip ≥ 115% rated speed', v: '≥ 1.15·v', unit: '' },
      { fa: 'پاراشوت لحظه‌ای (فقط تا سرعت ≤ ۰.۶۳ m/s) → سقف تریپ', en: 'Instantaneous (only ≤ 0.63 m/s) → trip cap', v: '≤ 0.8', unit: 'm/s' },
      { fa: 'تست با قطع موتور و حرکت کابین به سمت پایین', en: 'Tested with motor off, car descending', v: '—', unit: '' }
    ],
    note: { fa: 'سرعت تریپ روی پلاک گاورنر حک شده و باید با پروژه مطابقت داده شود.', en: 'Tripping speed is stamped on the governor and must match the project.' } },
  { id: 's50-sgear', cat: 'safety', icon: '🛑', title: { fa: 'آزمون پاراشوت (Safety Gear)', en: 'Safety gear test' }, clause: '§6.3.4', kind: 'test',
    vals: [
      { fa: 'با بار اسمی، کابین رو به پایین و تریپ گاورنر', en: 'With rated load, car descending, governor tripped', v: 'الزامی', unit: '' },
      { fa: 'توقف کامل و نگه‌داشتن کابین روی ریل‌ها', en: 'Full stop and hold on the guide rails', v: 'الزامی', unit: '' },
      { fa: 'بررسی اثر گیره‌ها روی ریل پس از آزمون', en: 'Inspect grip marks on rails after the test', v: '—', unit: '' }
    ],
    note: { fa: 'برای وزنه تعادل (وقتی زیر چاهک فضای قابل دسترس است) نیز پاراشوت باید آزمون شود.', en: 'Counterweight safety gear must also be tested where occupied space exists below.' } },
  { id: 's50-brake', cat: 'field', icon: '🛑', title: { fa: 'آزمون ترمز ۱۲۵٪', en: '125% brake test' }, clause: '§5.9.2.2 / §6.3', kind: 'test',
    vals: [
      { fa: 'توقف و نگه‌داشتن کابین با ۱۲۵٪ بار اسمی در ایستگاه پایین‌ترین طبقه', en: 'Stop and hold with 125% rated load at the lowest landing', v: '125%', unit: '' },
      { fa: 'بدون لغزش محسوس روی فلکه کشش', en: 'No significant slip on the traction sheave', v: '—', unit: '' }
    ],
    note: { fa: 'این آزمون پرکاربردترین مورد در بازرسی بهره‌برداری است.', en: 'This is the most common commissioning test.' } },
  { id: 's50-buffer', cat: 'safety', icon: '🛞', title: { fa: 'آزمون بافر', en: 'Buffer test' }, clause: '§6.3.7', kind: 'test',
    vals: [
      { fa: 'فرورفتن کامل بافر (کابین با سرعت نامی + اضافه‌بار) و برگشت کامل', en: 'Full compression (car at rated speed + overload) and full recovery', v: 'الزامی', unit: '' },
      { fa: 'ضربه‌گیر روغنی: کنترل سطح روغن پس از آزمون', en: 'Oil buffer: check oil level after test', v: '—', unit: '' }
    ],
    note: { fa: 'تست دینامیکی روی بافر برای آسانسورهای با سرعت بالاتر حیاتی است.', en: 'Dynamic buffer tests are critical on higher-speed lifts.' } },
  { id: 's50-ucm', cat: 'field', icon: '🛑', title: { fa: 'آزمون UCMP (حرکت ناخواسته)', en: 'UCM protection test' }, clause: '§5.6.7 / §6.3.13', kind: 'test',
    vals: [
      { fa: 'با درب طبقه باز و درب کابین باز، تحریک حرکت ناخواسته', en: 'With landing & car doors open, induce unintended movement', v: 'الزامی', unit: '' },
      { fa: 'توقف کابین قبل از خروج از ناحیه باز شدن درب (حداکثر ۱.۲ متر)', en: 'Car stops before leaving the unlocking zone (max 1.2 m)', v: '≤ 1.2', unit: 'm' },
      { fa: 'ریست فقط به صورت دستی توسط تکنسین', en: 'Reset only manually by an authorised person', v: '—', unit: '' }
    ],
    note: { fa: 'بعد از هر توقف UCMP باید علت ثبت و سیستم ریست دستی شود.', en: 'After each UCM stop, log the cause and reset manually.' } },
  { id: 's50-lock', cat: 'safety', icon: '🔒', title: { fa: 'آزمون قفل درب طبقه', en: 'Door lock test' }, clause: '§5.3.9', kind: 'test', verif: true,
    vals: [
      { fa: 'درگیری حداقل ۷ میلی‌متر لنگه و زبانه قفل', en: 'Min 7 mm engagement of the locking element', v: '≥ 7', unit: 'mm' },
      { fa: 'کنتاکت ایمنی قفل: حرکت با قفل باز ممکن نباشد', en: 'Safety contact: no travel with an unlocked door', v: 'الزامی', unit: '' }
    ],
    note: { fa: 'برای هر طبقه جداگانه تست شود.', en: 'Test on every landing separately.' } },
  { id: 's50-door', cat: 'field', icon: '🚪', title: { fa: 'آزمون نیروی بستن درب', en: 'Door closing force test' }, clause: '§5.3.6.2', kind: 'test', verif: true,
    vals: [
      { fa: 'نیروی بستن درب (پیک، بیش از ۵۰ میلی‌متر مانده به بسته‌شدن)', en: 'Closing force (peak, before final 50 mm)', v: '≤ 150', unit: 'N' },
      { fa: 'انرژی جنبشی درب', en: 'Kinetic energy of the door', v: '≤ 10', unit: 'J' }
    ],
    note: { fa: 'نیروی بازشدن مجدد (reopening) نیز باید در محدوده ایمن باشد.', en: 'Reopening force must also stay within safe limits.' } },
  { id: 's50-hyd', cat: 'field', icon: '🛢️', title: { fa: 'آزمون فشار هیدرولیک', en: 'Hydraulic pressure test' }, clause: '§6.3.10', kind: 'test',
    vals: [
      { fa: 'تست فشار سیلندر و لوله‌ها با ۲۰۰٪ فشار کاری به مدت ۵ دقیقه', en: 'Pressure test at 200% working pressure for 5 minutes', v: '200% / 5', unit: 'min' },
      { fa: 'شیر رلیف (فشارشکن) حداکثر ۱۴۰٪ فشار کاری', en: 'Relief valve ≤ 140% working pressure', v: '≤ 140%', unit: '' }
    ],
    note: { fa: 'هیچ نشتی یا تغییر شکل دائمی در طول تست نباید دیده شود.', en: 'No leakage or permanent deformation during the test.' } },
  { id: 's50-level', cat: 'field', icon: '🎯', title: { fa: 'آزمون دقت همسطحی', en: 'Levelling accuracy test' }, clause: '§5.12.1.1.4', kind: 'test', verif: true,
    vals: [
      { fa: 'دقت توقف (حالت عادی)', en: 'Stopping accuracy (normal operation)', v: '≤ ±10', unit: 'mm' },
      { fa: 'هم‌ترازسازی مجدد زیر بار (ورود/خروج مسافر)', en: 'Re-levelling under loading/unloading', v: '≤ ±20', unit: 'mm' },
      { fa: 'آزمون قبل از بهره‌برداری (مرجع)', en: 'Test before putting into service (reference)', v: '§6.3.12', unit: '' }
    ],
    note: { fa: 'مقادیر توقف/هم‌ترازسازی این فهرست UNVERIFIED هستند؛ ویرایش مصوب، بند، صفحه، نوع عملکرد و شرایط قابل‌اعمال را پیش از استفاده ثبت کنید. طراحی پروژه ممکن است حد متفاوتی داشته باشد.', en: 'Stopping/re-levelling figures in this index are UNVERIFIED; record the approved edition, clause, page, function and applicable conditions before use. Project design may differ.' } },
  { id: 's50-elec', cat: 'elec', icon: '⚡', title: { fa: 'آزمون‌های الکتریکی', en: 'Electrical tests' }, clause: '§6.3 / Annex', kind: 'test',
    vals: [
      { fa: 'تست تداوم و مقاومت ارت (PE)', en: 'Continuity & earth (PE) resistance test', v: 'الزامی', unit: '' },
      { fa: 'تست عایق مدارهای قدرت و فرمان با میگر', en: 'Insulation test of power/control circuits (megger)', v: 'الزامی', unit: '' },
      { fa: 'عملکرد مدار ایمنی (Safety Chain) با باز کردن تک‌تک کنتاکت‌ها', en: 'Safety chain verification by opening each contact', v: '—', unit: '' }
    ],
    note: { fa: 'تست عایق با درایو/بردهای حساس جدا شده انجام شود تا آسیب نبیند.', en: 'Isolate drives/sensitive boards before megger testing to avoid damage.' } }
];

/* ================= EN 81-28 — آلارم اضطراری و ارتباط دوسویه ================= */
var STD8128_CATS = [
  { id: 'all', fa: 'همه', en: 'All' },
  { id: 'alarm', fa: '🔔 آلارم و دستگاه', en: 'Alarm & device' },
  { id: 'comm', fa: '📞 ارتباط دوسویه', en: 'Two-way communication' },
  { id: 'power', fa: '🔋 تغذیه و پشتیبان', en: 'Power & backup' }
];
var STD8128 = [
  { id: 's28-device', cat: 'alarm', icon: '🔔', title: { fa: 'الزام آلارم اضطراری', en: 'Remote alarm requirement' }, clause: '§4.1', kind: 'req',
    vals: [
      { fa: 'هر آسانسور باید آلارم اضطراری داشته باشد که در صورت گیر کردن فعال شود', en: 'Every lift must have a remote alarm activatable when trapped', v: 'الزامی', unit: '' },
      { fa: 'قابل فعال‌سازی از داخل کابین (دکمه آلارم با علامت زنگوله)', en: 'Activatable from the car (bell-symbol button)', v: 'الزامی', unit: '' }
    ],
    note: { fa: 'آلارم باید بدون توجه به وضعیت درایو/تابلو کار کند.', en: 'The alarm must work regardless of drive/controller state.' } },
  { id: 's28-2way', cat: 'comm', icon: '📞', title: { fa: 'ارتباط دوسویه (صوتی)', en: 'Two-way voice communication' }, clause: '§4.3', kind: 'req',
    vals: [
      { fa: 'مکالمه صوتی دوسویه بین سرنشین و سرویس نجات', en: 'Two-way voice between trapped user and rescue service', v: 'الزامی', unit: '' },
      { fa: 'کیفیت صدا قابل فهم در شرایط اضطراری', en: 'Audible, intelligible audio in an emergency', v: '—', unit: '' }
    ],
    note: { fa: 'سیستم‌های فقط-زنگ بدون مکالمه، الزامات EN 81-28 را کامل نمی‌کنند.', en: 'Bell-only systems without voice do not fully meet EN 81-28.' } },
  { id: 's28-power', cat: 'power', icon: '🔋', title: { fa: 'تغذیه آلارم', en: 'Alarm power supply' }, clause: '§4.4', kind: 'req',
    vals: [
      { fa: 'تغذیه از شبکه «فیلترشده» (قبل از کلید اصلی) + باتری قابل شارژ', en: 'Filtered mains supply (before the main switch) + rechargeable battery', v: 'الزامی', unit: '' },
      { fa: 'کارکرد آلارم در قطع برق حداقل ۱ ساعت', en: 'Alarm works for ≥ 1 hour during a power failure', v: '≥ 1', unit: 'h' }
    ],
    note: { fa: 'باتری باید به‌طور خودکار شارژ و سلامت آن دوره‌ای چک شود.', en: 'The battery must auto-charge and be checked periodically.' } },
  { id: 's28-info', cat: 'alarm', icon: '🆔', title: { fa: 'اطلاعات ارسالی آلارم', en: 'Transmitted alarm info' }, clause: '§4.5', kind: 'req',
    vals: [
      { fa: 'شناسه ساختمان، شماره آسانسور و موقعیت/آدرس', en: 'Building ID, lift number and location/address', v: 'الزامی', unit: '' },
      { fa: 'شماره‌گیری/ارسال خودکار به مرکز پاسخ‌گویی', en: 'Automatic dial/transmission to the receiving centre', v: 'الزامی', unit: '' }
    ],
    note: { fa: 'مرکز پاسخ‌گویی باید ۲۴/۷ در دسترس باشد.', en: 'The receiving centre must be reachable 24/7.' } },
  { id: 's28-ack', cat: 'alarm', icon: '✅', title: { fa: 'تأیید دریافت آلارم', en: 'Alarm acknowledgement' }, clause: '§4.6', kind: 'req',
    vals: [
      { fa: 'نشانگر دیداری/شنیداری داخل کابین که آلارم دریافت شده است', en: 'Visual/audible indication in the car that the alarm was received', v: 'الزامی', unit: '' }
    ],
    note: { fa: 'نشانگر باید تا پایان عملیات نجات روشن بماند.', en: 'The indication stays on until rescue completes.' } },
  { id: 's28-test', cat: 'power', icon: '🧪', title: { fa: 'آزمون و نگهداری آلارم', en: 'Alarm test & maintenance' }, clause: '§5', kind: 'test',
    vals: [
      { fa: 'دکمه تست / خودآزمایی برای بررسی کل مسیر آلارم', en: 'Test button / self-test covering the whole alarm path', v: 'الزامی', unit: '' },
      { fa: 'آزمون دوره‌ای در سرویس (حداقل ماهانه پیشنهادی)', en: 'Periodic test during service (monthly recommended)', v: '—', unit: '' }
    ],
    note: { fa: 'نتیجه تست آلارم در گزارش سرویس ثبت شود.', en: 'Record the alarm test result in the service report.' } }
];

/* ================= EN 13015 — قوانین سرویس و نگهداری ================= */
var STD13015_CATS = [
  { id: 'all', fa: 'همه', en: 'All' },
  { id: 'program', fa: '🗓️ برنامه سرویس', en: 'Maintenance program' },
  { id: 'records', fa: '📒 مدارک و سوابق', en: 'Records' },
  { id: 'safety', fa: '🦺 ایمنی نگهداری', en: 'Maintenance safety' }
];
var STD13015 = [
  { id: 's15-program', cat: 'program', icon: '🗓️', title: { fa: 'برنامه نگهداری مدون', en: 'Documented maintenance program' }, clause: '§4', kind: 'req',
    vals: [
      { fa: 'برنامه مکتوب بازدید، تمیزکاری، روانکاری، تنظیم و بازرسی', en: 'Written schedule of checks, cleaning, lubrication, adjustment & inspection', v: 'الزامی', unit: '' },
      { fa: 'مطابق دستور کارخانه و نوع/کاربری آسانسور', en: 'Per manufacturer instructions, lift type & usage', v: '—', unit: '' }
    ],
    note: { fa: 'برنامه سرویس باید در دسترس تکنسین‌ها قرار گیرد.', en: 'The program must be available to technicians.' } },
  { id: 's15-interval', cat: 'program', icon: '⏱️', title: { fa: 'فواصل سرویس', en: 'Maintenance intervals' }, clause: '§5', kind: 'req',
    vals: [
      { fa: 'بازدید دوره‌ای پیشگیرانه (معمولاً ماهانه برای آسانسورهای پرتردد)', en: 'Periodic preventive visits (commonly monthly for high-traffic lifts)', v: '≥ 1/ماه', unit: '' },
      { fa: 'تنظیم فاصله بر اساس تعداد استارت و ساعت کار', en: 'Adjust interval by starts and running hours', v: '—', unit: '' }
    ],
    note: { fa: 'آسانسورهای عمومی/پرتغییرمصرف به بازدید کوتاه‌تر نیاز دارند.', en: 'Public/heavily-used lifts need shorter intervals.' } },
  { id: 's15-log', cat: 'records', icon: '📒', title: { fa: 'دفترچه سرویس (Logbook)', en: 'Service logbook' }, clause: '§6', kind: 'req',
    vals: [
      { fa: 'ثبت تاریخ، نام تکنسین، اقدامات و قطعات تعویضی در هر بازدید', en: 'Record date, technician, work done & replaced parts each visit', v: 'الزامی', unit: '' },
      { fa: 'ثبت خرابی‌ها، آلارم‌ها و نتایج آزمون‌های دوره‌ای', en: 'Log faults, alarms and periodic test results', v: '—', unit: '' }
    ],
    note: { fa: 'دفترچه نزد مالک نگهداری و برای بازرس ارائه می‌شود.', en: 'The logbook is kept by the owner and shown to inspectors.' } },
  { id: 's15-safety', cat: 'safety', icon: '🦺', title: { fa: 'قوانین ایمنی حین سرویس', en: 'Safety rules during maintenance' }, clause: '§7', kind: 'req',
    vals: [
      { fa: 'قطع برق اصلی و Lockout/Tagout قبل از کار روی تابلو', en: 'Main switch off + lockout/tagout before panel work', v: 'الزامی', unit: '' },
      { fa: 'استفاده از کلید استپ چاهک/بالاسری و ممنوعیت کار روی کابین متحرک', en: 'Use pit/top stop switch; never work on a moving car', v: 'الزامی', unit: '' }
    ],
    note: { fa: 'کار در چاه/بالای کابین فقط با حالت بازرسی (Inspection) مجاز است.', en: 'Shaft/car-top work is only allowed in inspection mode.' } },
  { id: 's15-rescue', cat: 'safety', icon: '🆘', title: { fa: 'روش نجات اضطراری', en: 'Emergency rescue procedure' }, clause: '§8', kind: 'req',
    vals: [
      { fa: 'روش مدون آزادسازی سرنشینان گیر افتاده + آموزش پرسنل', en: 'Documented trapped-passenger release procedure + trained staff', v: 'الزامی', unit: '' },
      { fa: 'بازکردن دستی درب فقط با ابزار استاندارد و با رعایت ایمنی', en: 'Manual door release only with standard tools, safely', v: '—', unit: '' }
    ],
    note: { fa: 'زمان رسیدن سرویس نجات باید مستند و محدود باشد.', en: 'Rescue response time must be documented and bounded.' } },
  { id: 's15-owner', cat: 'records', icon: '🏢', title: { fa: 'وظایف مالک / بهره‌بردار', en: 'Owner obligations' }, clause: '§9', kind: 'req',
    vals: [
      { fa: 'نگهداری دفترچه، پاسخ به خرابی و هماهنگی سرویس دوره‌ای', en: 'Keep logbook, respond to faults, arrange periodic service', v: 'الزامی', unit: '' },
      { fa: 'انجام بازرسی سالانه توسط مرجع/بازرس ذی‌صلاح', en: 'Annual inspection by a competent authority', v: '—', unit: '' }
    ],
    note: { fa: 'قرارداد سرویس، مسئولیت نگهداری را به شرکت سرویس منتقل می‌کند.', en: 'A service contract transfers maintenance responsibility to the service company.' } }
];

/* unified standards library (selectable via tabs) */
var STD_SETS = [
  { id: 'en81-20', name: { fa: 'EN 81-20', en: 'EN 81-20' }, short: { fa: 'الزامات ایمنی ساخت و نصب', en: 'Safety rules for construction & installation' },
    edition: { fa: 'نامشخص — متن منبع در مخزن موجود نیست', en: 'Unknown — source text is not present in the repository' }, cats: STD81_CATS, list: STD81 },
  { id: 'en81-50', name: { fa: 'EN 81-50', en: 'EN 81-50' }, short: { fa: 'آزمون‌ها و آزمایش اجزاء ایمنی', en: 'Test rules for safety components' },
    edition: { fa: 'نامشخص — متن منبع در مخزن موجود نیست', en: 'Unknown — source text is not present in the repository' }, cats: STD8150_CATS, list: STD8150 },
  { id: 'en81-28', name: { fa: 'EN 81-28', en: 'EN 81-28' }, short: { fa: 'آلارم اضطراری و ارتباط دوسویه', en: 'Remote alarm & two-way communication' },
    edition: { fa: 'نامشخص — متن منبع در مخزن موجود نیست', en: 'Unknown — source text is not present in the repository' }, cats: STD8128_CATS, list: STD8128 },
  { id: 'en13015', name: { fa: 'EN 13015', en: 'EN 13015' }, short: { fa: 'قوانین سرویس و نگهداری', en: 'Rules for maintenance instructions' },
    edition: { fa: 'نامشخص — متن منبع در مخزن موجود نیست', en: 'Unknown — source text is not present in the repository' }, cats: STD13015_CATS, list: STD13015 }
];

/* Structured standards knowledge architecture.
   No licensed/official standard text or traceable page citation exists in this
   repository. Consequently no current record is labelled VERIFIED. The legacy
   `verif` booleans are intentionally ignored: verification requires a source,
   edition and traceable citation, not an assertion in application code. */
var STANDARD_VERIFICATION = {
  VERIFIED: 'VERIFIED', UNVERIFIED: 'UNVERIFIED', MODEL_DEPENDENT: 'MODEL-DEPENDENT',
  MANUFACTURER_DEPENDENT: 'MANUFACTURER-DEPENDENT', ENGINEERING_PRACTICE: 'ENGINEERING PRACTICE'
};
var STANDARD_RECORDS = [];
STD_SETS.forEach(set => {
  set.list.forEach(article => {
    const record = {
      id: set.id + ':' + article.id,
      standard: set.name.fa,
      edition: null,
      clause: article.clause || null,
      title: article.title,
      requirement: (article.vals || []).map(v => ({ text: { fa: v.fa || '', en: v.en || '' }, value: v.v, unit: v.unit || '' })),
      source: null,
      verificationStatus: STANDARD_VERIFICATION.UNVERIFIED,
      notes: article.note || null,
      sourceNote: {
        fa: 'متن مصوب/تصویر منبع و ارجاع صفحه در مخزن موجود نیست؛ پیش از استناد یا اعمال حد باید با منبع رسمی تطبیق شود.',
        en: 'No approved source text/page citation exists in the repository; verify against an official source before citation or threshold use.'
      }
    };
    article.standardRecordId = record.id;
    article.verificationStatus = record.verificationStatus;
    article.source = record.source;
    STANDARD_RECORDS.push(record);
  });
});
var CHECKLIST_REFERENCE_RECORDS = [];
CHECKLIST_TEMPLATES.forEach(template => template.groups.forEach(group => group.items.forEach(item => {
  if (!item.ref) return;
  const isPractice = /رویه|practice/i.test(item.ref);
  const match = String(item.ref).match(/^(EN\s*\d+(?:-\d+)?|ISIRI\s*\d+)(?:\s+(.+))?$/i);
  const record = {
    id: 'checklist:' + template.id + ':' + item.id,
    standard: match ? match[1].replace(/\s+/g, ' ') : null,
    edition: null,
    clause: match && match[2] ? match[2] : null,
    title: { fa: item.fa, en: item.en || '' },
    requirement: { fa: item.fa, en: item.en || '' },
    source: null,
    verificationStatus: isPractice ? STANDARD_VERIFICATION.ENGINEERING_PRACTICE : STANDARD_VERIFICATION.UNVERIFIED,
    notes: { fa: 'ارجاع از چک‌لیست فعلی استخراج شده و منبع رسمی در مخزن موجود نیست.', en: 'Extracted from the current checklist; no official source is present in the repository.' }
  };
  item.referenceRecordId = record.id;
  item.verificationStatus = record.verificationStatus;
  CHECKLIST_REFERENCE_RECORDS.push(record);
})));

var stdSet = 'en81-20';
function stdCur() { return STD_SETS.find(x => x.id === stdSet) || STD_SETS[0]; }
function standardRecord(article, set) {
  return STANDARD_RECORDS.find(r => r.id === (set.id + ':' + article.id)) || null;
}

var stdQuery = '';
var stdCat = 'all';
function stdSearchText(s) {
  let str = s.title.fa + ' ' + (s.title.en || '') + ' ' + s.clause + ' ' + (s.note ? s.note.fa + ' ' + s.note.en : '');
  s.vals.forEach(v => { str += ' ' + v.fa + ' ' + (v.en || '') + ' ' + v.v + ' ' + (v.unit || ''); });
  return norm(str);
}
function renderStandards() {
  const c = $('#content');
  const set = stdCur();
  c.innerHTML = `
    <div class="safety-banner" style="background:var(--accent-soft);border-color:var(--accent-2);color:var(--accent-2)">
      <span style="font-size:18px">🛡️</span><span>${esc(set.short[LANG] || set.short.fa)} — ${t('stdBanner')}</span>
    </div>
    <div class="chip-row" style="margin-bottom:14px">
      ${STD_SETS.map(st => `<button class="chip ${stdSet === st.id ? 'active' : ''}" data-ss="${st.id}">${esc(st.name[LANG] || st.name.fa)}</button>`).join('')}
    </div>
    <div class="toolbar">
      <div class="search">${IC.search}<input id="stdSearch" placeholder="${t('stdSearch')}" value="${esc(stdQuery)}" /></div>
      <div class="chip-row">
        ${set.cats.map(ct => `<button class="chip ${stdCat === ct.id ? 'active' : ''}" data-sc="${ct.id}">${esc(ct[LANG] || ct.fa)}</button>`).join('')}
      </div>
    </div>
    <div id="stdList" class="grid-2"></div>
    <p class="calc-note" style="margin-top:16px">📖 ${t('stdDisclaimer')}</p>`;
  $('#stdSearch').oninput = debounce(e => { stdQuery = e.target.value; drawStd(); }, 200);
  $$('#content .chip[data-ss]').forEach(ch => ch.onclick = () => { stdSet = ch.dataset.ss; stdCat = 'all'; stdQuery = ''; renderStandards(); });
  $$('#content .chip[data-sc]').forEach(ch => ch.onclick = () => { stdCat = ch.dataset.sc; renderStandards(); });
  drawStd();
}
function drawStd() {
  const set = stdCur();
  const q = norm(stdQuery);
  let list = set.list;
  if (stdCat !== 'all') list = list.filter(s => s.cat === stdCat);
  if (q) list = list.filter(s => stdSearchText(s).includes(q));
  const el = $('#stdList');
  if (!list.length) {
    el.innerHTML = `<div class="empty"><div class="e-icon">🔍</div><strong>${t('notFound')}</strong><p>${t('stdNoMatch')}</p></div>`;
    return;
  }
  el.innerHTML = list.map(s => {
    const record = standardRecord(s, set);
    const status = record ? record.verificationStatus : STANDARD_VERIFICATION.UNVERIFIED;
    return `
    <div class="card kb-card" onclick="openStdArticle('${s.id}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <h4><span style="font-size:19px">${s.icon}</span> ${esc(s.title[LANG] || s.title.fa)}</h4>
        <span class="badge b-blue" style="direction:ltr;white-space:nowrap">${esc(s.clause)}</span>
      </div>
      <div class="std-vals" style="margin:8px 0 4px">
        ${s.vals.slice(0, 2).map(v => `<div style="font-size:12.6px;color:var(--text-2)">${esc(v.fa)}: <b style="color:var(--text);direction:ltr;display:inline-block">${esc(v.v)}</b> ${esc(v.unit || '')}</div>`).join('')}
        ${s.vals.length > 2 ? `<div style="font-size:11.5px;color:var(--text-3);margin-top:2px">+ ${faNum(s.vals.length - 2)} ${LANG === 'fa' ? 'مورد دیگر' : 'more'} …</div>` : ''}
      </div>
      <div class="kb-tags"><span class="badge b-amber">⚠️ ${esc(status)}</span><span class="badge b-gray">${t('stdExpand')} ←</span></div>
    </div>`;
  }).join('');
}
function openStdArticle(id) {
  const set = stdCur();
  const s = set.list.find(x => x.id === id);
  if (!s) return;
  const record = standardRecord(s, set);
  const verificationStatus = record ? record.verificationStatus : STANDARD_VERIFICATION.UNVERIFIED;
  openModal(`
    <div class="modal-head"><h3>${s.icon} ${esc(s.title[LANG] || s.title.fa)}</h3><button class="icon-btn" onclick="closeModal()">✕</button></div>
    <div class="modal-body kb-article">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
        <span class="badge b-blue" style="direction:ltr;font-size:13px">${esc(set.name[LANG] || set.name.fa)} ${esc(s.clause)}</span>
        <span style="font-size:11.5px;color:var(--text-3)">${t('stdClause')}</span>
      </div>
      <div class="kv-cell" style="margin-bottom:12px;padding:8px 10px">
        <div class="k" style="margin:2px 0">${t('stdStandard')}: <b style="color:var(--text)">${esc(set.name[LANG] || set.name.fa)}</b> · ${t('stdEdition')}: <b style="color:var(--text)">${esc(set.edition ? (set.edition[LANG] || set.edition.fa) : '—')}</b></div>
        <div class="k" style="margin:2px 0">${t('stdVerification')}:
          <span class="badge ${verificationStatus === STANDARD_VERIFICATION.VERIFIED ? 'b-green' : 'b-amber'}" style="font-size:11.5px">${verificationStatus === STANDARD_VERIFICATION.VERIFIED ? '✅' : '⚠️'} ${esc(verificationStatus)}</span>
        </div>
        <div class="k" style="margin:6px 0 2px">SOURCE: <b style="color:var(--text)">${record && record.source ? esc(record.source) : (LANG === 'fa' ? 'در مخزن موجود نیست' : 'Not present in repository')}</b></div>
        ${record && record.sourceNote ? `<div class="k" style="margin:2px 0;color:var(--warn)">${esc(record.sourceNote[LANG] || record.sourceNote.fa)}</div>` : ''}
      </div>
      <div class="calc-result" style="margin-bottom:12px">
        ${s.vals.map(v => `<div class="r-row" style="flex-wrap:wrap;gap:4px 10px">
          <span class="r-label" style="font-size:13px;max-width:100%">${esc(v.fa)}${v.en && LANG === 'en' ? ` — ${esc(v.en)}` : ''}</span>
          <span class="r-val" style="direction:ltr;font-size:15px">${esc(v.v)} ${esc(v.unit || '')}</span>
        </div>`).join('')}
      </div>
      ${s.note ? `<div class="note-block">📌 ${esc(s.note[LANG] || s.note.fa)}</div>` : ''}
    </div>
    <div class="modal-foot"><button class="btn btn-primary" onclick="closeModal()">${t('close')}</button></div>`, { size: 'lg' });
}
