/* ================= VVVF FAULT DATABASE =================
   ⚠️ کدها الگوهای متداولِ مستندشده برای هر خانواده درایو هستند؛ معنی دقیق هر کد
   به مدل و نسخه فرمور بستگی دارد — همیشه با منوال همان مدل تطبیق دهید. */
var VVVF_DB = [
  {
    brand: 'Delta', model: 'VFD-ED (آسانسوری)',
    codes: [
      { code: 'OC / ocA / ocd', meaning: 'اضافه جریان (شتاب/کندشوندگی/سرعت ثابت)', causes: ['ترمز کامل باز نمی‌شود', 'اتصالی/بدنه در موتور یا کابل', 'ترمینال قدرت شل', 'تیون نادرست'], checks: ['باز شدن ترمز هنگام استارت', 'میگر موتور (جدا از درایو!)', 'آچارکشی U/V/W', 'Auto-tune مجدد'], meas: ['i_motor'] },
      { code: 'OV / ovA / ovd', meaning: 'اضافه ولتاژ باس DC', causes: ['مقاومت ترمز قطع/نامناسب', 'کندشوندگی خیلی تند'], checks: ['اهم مقاومت ترمز و کابل آن', 'نرم کردن رمپ توقف'], meas: ['v_dcbus'] },
      { code: 'LV / Lv', meaning: 'افت ولتاژ', causes: ['ضعف شبکه', 'کنتاکتور ورودی معیوب'], checks: ['ولتاژ سه‌فاز زیر بار', 'کنتاکت‌های کنتاکتور'], meas: ['v_rs', 'v_st', 'v_rt'] },
      { code: 'OH / oH1', meaning: 'داغی هیت‌سینک', causes: ['فن درایو خراب', 'فیلتر تابلو مسدود', 'دمای موتورخانه بالا'], checks: ['فن و مسیر هوا', 'دمای محیط'], meas: ['temp'] },
      { code: 'PGF / PGE', meaning: 'خطای انکودر (PG)', causes: ['کانکتور/شیلد', 'کوپلینگ لق', 'انکودر معیوب'], checks: ['کانکتور و شیلد', 'مسیر جدا از کابل قدرت', 'تعویض با هم‌مشخصات'], meas: [] },
      { code: 'OL / oL1 / oL2', meaning: 'اضافه بار درایو/موتور', causes: ['بالانس غلط', 'اصطکاک مکانیکی', 'پارامتر جریان اشتباه'], checks: ['تست بالانس ~۵۰٪', 'حرکت آزاد مکانیکی', 'پارامتر جریان موتور'], meas: ['i_motor'] }
    ]
  },
  {
    brand: 'Yaskawa', model: 'L1000A / L1000V (آسانسوری)',
    codes: [
      { code: 'oC', meaning: 'اضافه جریان', causes: ['اتصالی خروجی', 'ترمز درگیر', 'کابل معیوب'], checks: ['میگر موتور جدا', 'ترمز', 'ترمینال‌ها'], meas: ['i_motor'] },
      { code: 'ov', meaning: 'اضافه ولتاژ DC', causes: ['مقاومت/واحد ترمز', 'رمپ تند'], checks: ['مدار ترمز dynamic', 'رمپ‌ها'], meas: ['v_dcbus'] },
      { code: 'Uv1', meaning: 'افت ولتاژ DC', causes: ['افت شبکه', 'فاز قطع ورودی'], checks: ['سه‌فاز ورودی زیر بار'], meas: ['v_rs', 'v_st', 'v_rt'] },
      { code: 'oH / oH1', meaning: 'داغی هیت‌سینک', causes: ['فن', 'محیط داغ'], checks: ['فن درایو', 'تهویه'], meas: ['temp'] },
      { code: 'PF', meaning: 'قطع فاز ورودی', causes: ['فیوز یک فاز', 'ترمینال شل'], checks: ['هر سه فاز ورودی'], meas: ['v_rs', 'v_st', 'v_rt'] },
      { code: 'LF', meaning: 'قطع فاز خروجی', causes: ['کنتاکتور خروجی', 'کابل موتور'], checks: ['کنتاکت‌های کنتاکتور خروجی', 'اتصال موتور'], meas: [] },
      { code: 'PGo / dv1..dv7', meaning: 'خطاهای انکودر/جهت', causes: ['انکودر، شیلد، جهت شمارش'], checks: ['کانکتور، شیلد، پارامتر جهت A/B'], meas: [] },
      { code: 'SC', meaning: 'اتصال کوتاه خروجی', causes: ['اتصالی کابل/موتور', 'IGBT معیوب'], checks: ['میگر کابل و موتور جدا از درایو'], meas: [] }
    ]
  },
  {
    brand: 'INVT', model: 'GD / EC series',
    codes: [
      { code: 'OC1 / OC2 / OC3', meaning: 'اضافه جریان (شتاب/کند/ثابت)', causes: ['ترمز، موتور، رمپ تند'], checks: ['ترمز، میگر، رمپ‌ها'], meas: ['i_motor'] },
      { code: 'OV1 / OV2 / OV3', meaning: 'اضافه ولتاژ', causes: ['مقاومت ترمز', 'رمپ کند تند'], checks: ['مقاومت ترمز'], meas: ['v_dcbus'] },
      { code: 'UV', meaning: 'افت ولتاژ', causes: ['شبکه ضعیف'], checks: ['ولتاژ ورودی'], meas: ['v_rs', 'v_st', 'v_rt'] },
      { code: 'OL1 / OL2', meaning: 'اضافه بار موتور/درایو', causes: ['بار مکانیکی', 'پارامتر'], checks: ['بالانس، اصطکاک'], meas: ['i_motor'] },
      { code: 'OH1 / OH2', meaning: 'داغی یکسوساز/اینورتر', causes: ['فن، تهویه'], checks: ['فن‌ها، فیلتر'], meas: ['temp'] },
      { code: 'SPI / SPO', meaning: 'قطع فاز ورودی/خروجی', causes: ['فیوز، کنتاکتور، کابل'], checks: ['فازها ورودی و خروجی'], meas: ['v_rs', 'v_st', 'v_rt'] },
      { code: 'EF', meaning: 'خطای خارجی', causes: ['ورودی EF فعال شده (ترمیستور، حفاظت خارجی)'], checks: ['مدار متصل به ترمینال EF'], meas: [] }
    ]
  },
  {
    brand: 'LS (LG)', model: 'iS7 / H100',
    codes: [
      { code: 'OCT / OC', meaning: 'اضافه جریان', causes: ['اتصالی، ترمز، رمپ'], checks: ['میگر، ترمز'], meas: ['i_motor'] },
      { code: 'OVT / OV', meaning: 'اضافه ولتاژ', causes: ['مقاومت ترمز'], checks: ['مدار ترمز'], meas: ['v_dcbus'] },
      { code: 'LVT / LV', meaning: 'افت ولتاژ', causes: ['شبکه'], checks: ['ولتاژ ورودی'], meas: ['v_rs', 'v_st', 'v_rt'] },
      { code: 'OHT / OH', meaning: 'داغی', causes: ['فن، محیط'], checks: ['فن، تهویه'], meas: ['temp'] },
      { code: 'GFT / GF', meaning: 'خطای اتصال زمین', causes: ['نشتی به بدنه در موتور/کابل'], checks: ['میگر موتور و کابل'], meas: [] }
    ]
  },
  {
    brand: 'Schneider', model: 'Altivar (ATV)',
    codes: [
      { code: 'OCF', meaning: 'اضافه جریان', causes: ['اتصالی، بار سنگین، رمپ'], checks: ['موتور، ترمز، رمپ'], meas: ['i_motor'] },
      { code: 'OSF', meaning: 'اضافه ولتاژ شبکه', causes: ['ولتاژ بالا/نوسان'], checks: ['ولتاژ ورودی'], meas: ['v_rs', 'v_st', 'v_rt'] },
      { code: 'ObF', meaning: 'اضافه ولتاژ ترمزی DC', causes: ['مقاومت ترمز، رمپ'], checks: ['مقاومت ترمز'], meas: ['v_dcbus'] },
      { code: 'USF', meaning: 'افت ولتاژ', causes: ['شبکه ضعیف'], checks: ['ورودی زیر بار'], meas: ['v_rs', 'v_st', 'v_rt'] },
      { code: 'OHF', meaning: 'داغی درایو', causes: ['فن، تهویه'], checks: ['فن هیت‌سینک'], meas: ['temp'] },
      { code: 'OPF1 / OPF2', meaning: 'قطع فاز خروجی', causes: ['کنتاکتور خروجی، کابل موتور'], checks: ['اتصالات خروجی'], meas: [] },
      { code: 'SCF', meaning: 'اتصال کوتاه', causes: ['کابل/موتور معیوب'], checks: ['میگر جدا از درایو'], meas: [] },
      { code: 'PHF', meaning: 'قطع فاز ورودی', causes: ['فیوز، شبکه'], checks: ['سه‌فاز ورودی'], meas: ['v_rs', 'v_st', 'v_rt'] }
    ]
  },
  {
    brand: 'Arkel', model: 'ADrive',
    codes: [
      { code: 'Overcurrent', meaning: 'اضافه جریان', causes: ['ترمز، موتور، تیون'], checks: ['ترمز، میگر، Auto-tune'], meas: ['i_motor'] },
      { code: 'DC Bus Over/Under', meaning: 'خطای ولتاژ باس', causes: ['مقاومت ترمز / شبکه'], checks: ['مقاومت ترمز، ولتاژ ورودی'], meas: ['v_dcbus'] },
      { code: 'Encoder Fault', meaning: 'خطای انکودر', causes: ['اتصال، شیلد، انکودر'], checks: ['کانکتور، شیلد'], meas: [] },
      { code: 'Overtemperature', meaning: 'داغی', causes: ['فن، محیط'], checks: ['فن، تهویه تابلو'], meas: ['temp'] },
      { code: 'Contactor Fault', meaning: 'خطای کنتاکتور', causes: ['فیدبک کنتاکتور خروجی نمی‌آید'], checks: ['کنتاکت کمکی و بوبین کنتاکتور'], meas: [] }
    ]
  },
  {
    brand: 'عمومی', model: 'الگوی مشترک همه درایوها',
    codes: [
      { code: 'OC*', meaning: 'خانواده اضافه جریان', causes: ['ترمز کامل باز نمی‌شود', 'اتصالی موتور/کابل', 'ترمینال شل', 'تیون/پارامتر غلط', 'اصطکاک مکانیکی'], checks: ['ترمز هنگام استارت طبق روش مصوب', 'میگر فقط با موتور جدا از درایو و روش سازنده', 'آچارکشی در حالت ایزوله', 'Auto-tune همان مدل', 'بررسی اصطکاک مکانیکی پس از LOTO و مهار حرکت، طبق روش سازنده'], meas: ['i_motor'] },
      { code: 'OV*', meaning: 'خانواده اضافه ولتاژ', causes: ['مقاومت ترمز قطع/کم', 'رمپ توقف تند', 'کابین سبک رو به بالا'], checks: ['اهم مقاومت ترمز', 'رمپ‌ها'], meas: ['v_dcbus'] },
      { code: 'UV* / LV*', meaning: 'خانواده افت ولتاژ', causes: ['شبکه ضعیف در پیک', 'کنتاکتور/فیوز ورودی'], checks: ['ولتاژ زیر بار در ساعت خطا'], meas: ['v_rs', 'v_st', 'v_rt'] },
      { code: 'OH*', meaning: 'خانواده دما', causes: ['فن درایو', 'فیلتر مسدود', 'موتورخانه داغ'], checks: ['فن‌ها، فیلتر، تهویه'], meas: ['temp'] },
      { code: 'PG* / Enc*', meaning: 'خانواده انکودر', causes: ['کانکتور، شیلد، کوپلینگ، نویز'], checks: ['اتصالات، مسیر کابل، تعویض هم‌مشخصات'], meas: [] }
    ]
  }
];
VVVF_DB.forEach(family => family.codes.forEach(code => {
  code.manufacturer = family.brand;
  code.modelFamily = family.model;
  code.firmware = null;
  code.source = null;
  code.verificationStatus = 'MODEL-DEPENDENT';
}));

/* suggested technician tools */
var TOOL_SUGGESTIONS = ['مولتی‌متر', 'کلمپ‌متر (آمپرمتر انبری)', 'نشانگر دوپل ولتاژ', 'میگر (تستر عایق)', 'متر ۵ متری', 'کولیس', 'مانومتر', 'ترمومتر لیزری', 'تراز', 'شاقول', 'آچار آلن ست', 'آچار فرانسه', 'دم‌باریک و سیم‌چین', 'چراغ پیشانی', 'کلید سه‌گوش', 'گیج کشش بکسل', 'فیلر'];
