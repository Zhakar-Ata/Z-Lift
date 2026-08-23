/* ================= Z Lift — OFFLINE DATA LAYER =================
   Replaces the server API with localStorage persistence.
   (This function declaration overrides the fetch-based api() from app.js
   because it appears later in the same script scope.) */

function _lsUid() { return Math.random().toString(16).slice(2, 10) + Math.random().toString(16).slice(2, 10); }
function _lsHash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return 'h' + h.toString(16); }

function _lsSeed() {
  const now = Date.now(), day = 86400000;
  const p1 = _lsUid(), p2 = _lsUid(), p3 = _lsUid(), p4 = _lsUid();
  const mkPart = (name, category, unit, qty, minQty, price, loc, note) =>
    ({ id: _lsUid(), name, category, unit, qty, minQty, price, location: loc || '', note: note || '', updatedAt: now });
  return {
    users: [{ id: _lsUid(), username: 'tech', password: _lsHash('123456'), name: 'رضا محمدی', role: 'technician', createdAt: now - 90 * day }],
    sessions: {},
    projects: [
      { id: p1, name: 'برج مسکونی نگین', customer: 'شرکت ساختمانی آریا', phone: '0912-345-6789',
        location: 'تهران، سعادت‌آباد، خیابان سرو غربی، پلاک ۱۲',
        elevatorType: 'traction', capacityKg: 630, persons: 8, floors: 12, stops: 12,
        speed: 1.6, controller: 'آریان (Arian) — درایو دلتا VFD-ED', motor: 'گیرلس زیلابگ (Ziehl-Abegg) SM200 — 6.7kW',
        status: 'installing', progress: 65, serviceIntervalDays: 0,
        notes: 'ریل‌گذاری کامل شد. کابین مونتاژ شده، سیم‌کشی تراول کابل در جریان است. هماهنگی با کارفرما برای برق سه‌فاز موتورخانه.',
        createdAt: now - 45 * day, updatedAt: now - 1 * day },
      { id: p2, name: 'ساختمان پزشکان پارس', customer: 'دکتر احمدی (هیئت مدیره)', phone: '0913-222-4455',
        location: 'اصفهان، خیابان چهارباغ بالا، کوچه ۱۴',
        elevatorType: 'hydraulic', capacityKg: 450, persons: 6, floors: 4, stops: 4,
        speed: 0.6, controller: 'بوکر (Bucher) iValve — تابلو هیدرولیک', motor: 'پاوریونیت GMV 3010 — 9.5kW غوطه‌ور',
        status: 'maintenance', progress: 100, serviceIntervalDays: 30,
        notes: 'قرارداد سرویس ماهانه فعال. سیل‌های جک در سرویس قبلی تعویض شد.',
        createdAt: now - 400 * day, updatedAt: now - 6 * day },
      { id: p3, name: 'مجتمع تجاری الماس شرق', customer: 'آقای کریمی', phone: '0915-888-1122',
        location: 'مشهد، بلوار وکیل‌آباد، نبش صدف ۷',
        elevatorType: 'traction', capacityKg: 1000, persons: 13, floors: 8, stops: 8,
        speed: 1.0, controller: 'آرکو (Arkel) ARL-500', motor: 'گیربکس الکمپ (Alberto Sassi) MF48 — 11kW',
        status: 'testing', progress: 90, serviceIntervalDays: 0,
        notes: 'تنظیمات نهایی درب‌ها انجام شد. آماده‌سازی مدارک برای بازرسی استاندارد. تست پاراشوت و گاورنر انجام و ثبت شد.',
        createdAt: now - 120 * day, updatedAt: now - 3 * day },
      { id: p4, name: 'ویلای دوبلکس لواسان', customer: 'خانم رستمی', phone: '0912-555-7788',
        location: 'لواسان، بلوار امام خمینی، کوچه یاس',
        elevatorType: 'hydraulic', capacityKg: 320, persons: 4, floors: 3, stops: 3,
        speed: 0.5, controller: 'تابلو هیدرولیک نیکان', motor: 'پاوریونیت Blain EV100 — 5.5kW',
        status: 'contract', progress: 5, serviceIntervalDays: 0,
        notes: 'پیش‌پرداخت دریافت شد. نقشه‌های شفت در انتظار تأیید کارفرما. سفارش جک تلسکوپی دو مرحله‌ای ثبت شود.',
        createdAt: now - 10 * day, updatedAt: now - 2 * day }
    ],
    services: [
      { id: _lsUid(), projectId: p2, date: now - 26 * day, technician: 'رضا محمدی', serviceType: 'maintenance',
        problem: 'سرویس دوره‌ای ماهانه طبق قرارداد',
        diagnosis: 'افت جزئی فشار روغن در حالت ایستاده؛ نشتی بسیار جزئی از شیر یک‌طرفه',
        workDone: 'بازدید کامل پاوریونیت، تنظیم شیر رلیف روی ۱.۴ برابر فشار کار، تمیزکاری فتوسل درب، روانکاری ریل‌ها، تست سطح و کیفیت روغن',
        partsReplaced: 'اورینگ شیر یک‌طرفه', finalStatus: 'ok', createdAt: now - 26 * day },
      { id: _lsUid(), projectId: p2, date: now - 56 * day, technician: 'رضا محمدی', serviceType: 'repair',
        problem: 'برگشت تدریجی کابین به پایین در توقف طبقات (ریزش)',
        diagnosis: 'فرسودگی سیل‌های جک هیدرولیک و نشتی داخلی شیر برقی پایین‌رو',
        workDone: 'تعویض کامل کیت سیل جک، سرویس و تمیزکاری شیر برقی، هواگیری سیستم، تست ریزش ۱۰ دقیقه‌ای طبق چک‌لیست',
        partsReplaced: 'کیت سیل جک ⌀۸۰، فیلتر روغن', finalStatus: 'ok', createdAt: now - 56 * day },
      { id: _lsUid(), projectId: p3, date: now - 3 * day, technician: 'رضا محمدی', serviceType: 'inspection',
        problem: 'آماده‌سازی برای بازرسی استاندارد (ISIRI 6303)',
        diagnosis: 'همه موارد ایمنی سالم؛ برچسب ظرفیت داخل کابین نصب نشده بود',
        workDone: 'تست سرعت گاورنر، تست پاراشوت با بار، کنترل فاصله‌های ایمنی چاهک و بالاسری طبق EN 81-20، نصب برچسب ظرفیت',
        partsReplaced: '—', finalStatus: 'ok', createdAt: now - 3 * day },
      { id: _lsUid(), projectId: p1, date: now - 12 * day, technician: 'سعید رحیمی', serviceType: 'emergency',
        problem: 'خطای درایو (OC — Overcurrent) هنگام تست حرکت کند',
        diagnosis: 'اتصال نامناسب یکی از فازهای خروجی درایو به موتور و لقی ترمینال',
        workDone: 'آچارکشی کامل ترمینال‌های قدرت، تست مقاومت عایقی موتور (مگر)، اجرای مجدد Auto-tune درایو، تست حرکت',
        partsReplaced: 'کابلشو ۱۰', finalStatus: 'ok', createdAt: now - 12 * day }
    ],
    notes: [
      { id: _lsUid(), title: 'تنظیم فتوسل درب ویتور', tags: ['درب', 'ویتور'],
        content: 'برای پرده نوری ویتور: تراز بودن دو پنل حیاتی است. LED قرمز ثابت = خطای تراز یا آلودگی لنز. فاصله نصب از لبه سیل ۵ میلی‌متر. حتماً کابل را از داکت جدا از کابل قدرت عبور بده تا نویز نگیرد.',
        createdAt: now - 20 * day },
      { id: _lsUid(), title: 'کدهای خطای پرکاربرد درایو دلتا VFD-ED', tags: ['درایو', 'دلتا', 'خطا'],
        content: 'OC: اضافه جریان — چک اتصال موتور و ترمز. OV: اضافه ولتاژ — مقاومت ترمز را چک کن. LV: افت ولتاژ ورودی. PGF: خطای انکودر — سیم‌کشی و شیلد انکودر. OH: داغ شدن هیت‌سینک — فن تابلو.',
        createdAt: now - 50 * day },
      { id: _lsUid(), title: 'ثبت مرجع فاصله‌های ایمنی پروژه', tags: ['استاندارد', 'پروژه'],
        content: 'پیش از ارزیابی چاهک، بالاسری، جان‌پناه و فاصله‌ها، نام استاندارد/مقررات قابل‌اعمال، ویرایش، بند، صفحه، نوع آسانسور و شرایط طراحی را ثبت کنید. این نسخه متن رسمی درون‌برنامه‌ای ندارد و مقدارهای بدون منبع نباید به‌عنوان حد ایمنی یا گواهی انطباق استفاده شوند.',
        createdAt: now - 70 * day }
    ],
    checklists: [],
    parts: [
      mkPart('کنتاکتور زیمنس 3RT 25A', 'الکتریکال', 'عدد', 6, 2, 9800000, 'قفسه A2'),
      mkPart('فتوسل پرده‌ای ویتور (جفت)', 'درب', 'ست', 3, 1, 28500000, 'قفسه B1'),
      mkPart('سیم‌بکسل ۱۰ گوستاولف', 'مکانیکال', 'متر', 120, 60, 1450000, 'انبار پایین', 'حلقه ۱۸۰ متری باز شده'),
      mkPart('کفشک کابین ۱۶ (لاستیکی)', 'مکانیکال', 'عدد', 10, 4, 3200000, 'قفسه A4'),
      mkPart('روغن هیدرولیک HLP 46 (۲۰ لیتری)', 'هیدرولیک', 'گالن', 4, 2, 21500000, 'انبار پایین'),
      mkPart('کیت سیل جک ⌀۸۰', 'هیدرولیک', 'ست', 2, 1, 16800000, 'قفسه C1'),
      mkPart('شیر برقی پایین‌رو GMV', 'هیدرولیک', 'عدد', 1, 1, 38000000, 'قفسه C2', 'برای پاوریونیت GMV 3010'),
      mkPart('لنت ترمز موتور الکمپ MF48', 'مکانیکال', 'ست', 2, 1, 12500000, 'قفسه A3'),
      mkPart('نمراتور طبقه (نمایشگر LCD)', 'الکتریکال', 'عدد', 8, 3, 5600000, 'قفسه B3'),
      mkPart('قفل درب سماوری (کامل)', 'درب', 'عدد', 5, 2, 7400000, 'قفسه B2'),
      mkPart('باطری ۱۲V 7Ah سیستم نجات', 'الکتریکال', 'عدد', 4, 4, 4200000, 'قفسه B4', 'تاریخ شارژ کنترل شود'),
      mkPart('روانکار ریل (اسپری)', 'مصرفی', 'عدد', 12, 6, 950000, 'قفسه D1')
    ],
    diagSessions: [], calcSaves: [], issues: [], tools: [], photos: [], invoices: [], contracts: [],
    measurements: [], safetyLogs: [],
    reminders: [],
    settings: { company: 'خدمات فنی آسانسور زد لیفت', phone: '021-88000000', address: 'تهران' }
  };
}

var _lsDB = null;
