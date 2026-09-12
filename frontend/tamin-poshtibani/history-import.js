/* ============================================================
   خواندن فایل «سوابق خرید» (.xlsx) در مرورگرِ مدیر

   همان الگوی import.js: فایل هیچ‌وقت به Worker نمی‌رود؛ این‌جا باز می‌شود و
   فقط ردیف‌های تمیزشده به‌صورت JSON دسته‌دسته فرستاده می‌شوند.

   ستون‌ها با «نام» پیدا می‌شوند نه با شماره، تا جابه‌جایی ستون در خروجی‌های
   بعدی فایل را نشکند.

   دو ستون «قیمت کل (۱۴۰۴)» و «قیمت واحد (۱۴۰۴)» در فایل فرمول‌اند و اگر فایل
   با اکسل باز نشده باشد مقدارِ ذخیره‌شده ندارند. پس اگر مقدار داشتند همان
   خوانده می‌شود و اگر نه، از روی «مبلغ به ارز عملیاتی» × «شاخص تعدیل» ساخته
   می‌شود — دقیقاً همان فرمولِ داخل فایل.

   نیاز: window.XLSX (vendor/xlsx.full.min.js) و window.TP (shared.js)
   ============================================================ */
(function () {
  "use strict";
  const TP = (window.TP = window.TP || {});

  /* [نام(های) ستون در فایل, کلید داخلی, لازم؟]
     چند نام یعنی نسخه‌های مختلف فایل مرجع همان ستون را جور دیگری نامیده‌اند؛
     اولین نامی که در سرستون باشد برداشته می‌شود. */
  const COLUMNS = [
    ["تاریخ سفارش",             "date",      true],
    ["کد قلم خریدنی",           "itemCode",  false],
    ["عنوان قلم خریدنی",        "title",     true],
    ["مقدار",                   "qty",       false],
    ["واحد سنجش",               "unit",      false],
    [["فی", "قیمت واحد"],       "unitPrice", false],
    ["مبلغ به ارز عملیاتی",     "amount",    true],
    ["تامین کننده",             "supplier",  true],
    ["ماه",                     "month",     false],
    ["شاخص تعدیل",              "idx",       true],
    ["قیمت کل (1404)",          "amount1404", false],
    ["قیمت واحد (1404)",        "unit1404",  false],
    ["کد قلم جدید",             "code2",     true],
    ["سطح اول",                 "lvl1",      false],
    ["سطح دوم",                 "lvl2",      false],
    ["سطح سوم",                 "lvl3",      false],
  ];
  const namesOf = (c) => (Array.isArray(c[0]) ? c[0] : [c[0]]);

  const ascii = (s) => String(s == null ? "" : s)
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
  /* کلید مقایسهٔ سرستون: نرمال‌سازی فارسی + رقم‌های فارسی/عربی → لاتین + حذف فاصله */
  const hkey = (s) => ascii(TP.nrm(s)).replace(/\s/g, "");
  const T = (v) => String(v == null ? "" : v).trim();
  const numOf = (v) => { const s = ascii(String(v == null ? "" : v)).replace(/,/g, "").trim(); if (!s) return null; const n = Number(s); return isNaN(n) ? null : n; };

  function mapHeader(headerRow) {
    const norm = headerRow.map(hkey);
    const idx = {}; const missing = [];
    for (const c of COLUMNS) {
      const i = namesOf(c).map((n) => norm.indexOf(hkey(n))).find((x) => x >= 0);
      if (i >= 0) idx[c[1]] = i; else if (c[2]) missing.push(namesOf(c).join(" / "));
    }
    if (missing.length) {
      const e = new Error("این فایل، «سوابق خرید» نیست یا ستون‌های زیر را ندارد:\n" + missing.map((m) => "• " + m).join("\n"));
      e.code = "BAD_HEADER"; throw e;
    }
    return idx;
  }

  /* فایل کامل باید در حافظهٔ مرورگر باز شود و xlsx فشرده است؛ نمونهٔ واقعی
     (۷۱ هزار سطر، ۸ سال) حدود ۱۴ مگابایت است. */
  const MAX_BYTES = 60 * 1024 * 1024;

  async function readRows(file, onProgress) {
    if (!window.XLSX) throw new Error("کتابخانهٔ خواندن اکسل بارگذاری نشده است (vendor/xlsx.full.min.js).");
    if (!/\.xlsx?$/i.test(file.name || "")) throw new Error("فقط فایل اکسل (.xlsx) پذیرفته می‌شود.");
    if (file.size > MAX_BYTES) throw new Error(`حجم فایل ${(file.size / 1048576).toFixed(1)} مگابایت است و از سقف ${MAX_BYTES / 1048576} مگابایت بیشتر است.`);
    onProgress && onProgress("خواندن فایل…");
    const buf = await file.arrayBuffer();
    onProgress && onProgress("تجزیهٔ کاربرگ…");
    const wb = XLSX.read(buf, { type: "array", cellDates: false, cellText: false, cellHTML: false, cellNF: false, cellStyles: false });
    if (!wb.SheetNames.length) throw new Error("فایل هیچ کاربرگی ندارد.");
    /* فایل مرجع چند کاربرگ دارد (سوابق، درخت طبقه‌بندی، شاخص‌ها)؛ کاربرگ درست را
       با سرستون‌هایش پیدا می‌کنیم نه با جایگاهش. */
    const required = COLUMNS.filter((c) => c[2]).map((c) => ({ label: namesOf(c).join(" / "), alts: namesOf(c).map(hkey) }));
    let name = null, best = null;
    for (const n of wb.SheetNames) {
      const ws = wb.Sheets[n]; if (!ws || !ws["!ref"]) continue;
      const rg = XLSX.utils.decode_range(ws["!ref"]);
      const head = [];
      for (let c = rg.s.c; c <= rg.e.c; c++) { const cell = ws[XLSX.utils.encode_cell({ r: rg.s.r, c })]; head.push(hkey(cell ? cell.v : "")); }
      const miss = required.filter((r) => !r.alts.some((h) => head.includes(h)));
      if (!miss.length) { name = n; break; }
      if (!best || miss.length < best.miss.length) best = { n, miss };
    }
    if (!name) {
      /* بدون گفتنِ اینکه کدام ستون کم است، مدیر نمی‌داند فایل را چطور درست کند */
      const near = best ? `\nنزدیک‌ترین کاربرگ «${best.n}» بود و این ستون‌ها را نداشت:\n${best.miss.map((r) => "• " + r.label).join("\n")}` : "";
      const e = new Error(`هیچ کاربرگی با ستون‌های سوابق خرید پیدا نشد.\nکاربرگ‌ها: ${wb.SheetNames.join("، ")}${near}`);
      e.code = "BAD_HEADER"; throw e;
    }
    return { rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: true, blankrows: false }), sheet: name };
  }

  /* «1405/06/16» → [1405, 6] */
  function ymOf(dateStr, monthCell) {
    const m = /^(\d{4})\/(\d{1,2})/.exec(ascii(T(dateStr)));
    if (!m) return null;
    const y = +m[1];
    const mo = numOf(monthCell) || +m[2];
    if (!y || !mo || mo < 1 || mo > 12) return null;
    return y * 12 + mo;
  }

  /** سطرهای خام → ردیف‌های آمادهٔ ارسال + آمار */
  function build(rows, idx) {
    const out = [];
    const stats = {
      rows: 0, skipped: 0, noIndex: 0, noCode: 0, badAmount: 0,
      suppliers: 0, codes: 0, titles: 0, ymMin: null, ymMax: null, dateMin: null, dateMax: null,
    };
    const sup = new Set(), codes = new Set(), titles = new Set();

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r]; if (!row) continue;
      const g = (k) => (idx[k] == null ? null : row[idx[k]]);
      const date = T(g("date")), title = T(g("title")), supplier = T(g("supplier"));
      if (!date || !title || !supplier) { stats.skipped++; continue; }

      const ym = ymOf(date, g("month"));
      if (ym == null) { stats.skipped++; continue; }

      const qty = numOf(g("qty"));
      const amount = numOf(g("amount"));
      const idxVal = numOf(g("idx"));
      if (amount == null) stats.badAmount++;
      if (idxVal == null) stats.noIndex++;

      /* ستون فرمول: مقدارِ ذخیره‌شده اگر بود، وگرنه همان فرمول را خودمان اجرا می‌کنیم */
      let a1404 = numOf(g("amount1404"));
      if (a1404 == null && idxVal != null && amount != null) a1404 = idxVal * amount / 100;
      let u1404 = numOf(g("unit1404"));
      if (u1404 == null && a1404 != null && qty) u1404 = a1404 / qty;

      const code2 = T(g("code2"));
      if (!code2) stats.noCode++;

      out.push({
        date, ym, itemCode: T(g("itemCode")), code2, title,
        qty, unit: T(g("unit")), unitPrice: numOf(g("unitPrice")), amount,
        supplier, idx: idxVal, amount1404: a1404, unit1404: u1404,
        lvl1: T(g("lvl1")), lvl2: T(g("lvl2")), lvl3: T(g("lvl3")),
      });
      stats.rows++;
      sup.add(TP.nrm(supplier)); if (code2) codes.add(code2); titles.add(TP.nrm(title));
      if (stats.ymMin == null || ym < stats.ymMin) { stats.ymMin = ym; stats.dateMin = date; }
      if (stats.ymMax == null || ym > stats.ymMax) { stats.ymMax = ym; stats.dateMax = date; }
    }
    stats.suppliers = sup.size; stats.codes = codes.size; stats.titles = titles.size;
    return { rows: out, stats };
  }

  /** ورودی اصلی. onProgress(text) اختیاری. */
  TP.importHistory = async function (file, onProgress) {
    const { rows, sheet } = await readRows(file, onProgress);
    if (!rows.length) throw new Error("کاربرگ خالی است.");
    const idx = mapHeader(rows[0]);
    onProgress && onProgress(`ساخت ردیف‌ها از ${TP.M(rows.length - 1)} سطر…`);
    const out = build(rows, idx);
    out.sheet = sheet; out.filename = file.name;
    return out;
  };

  /* بریدن به دسته‌های ثابت برای ارسال. ۸۰۰ ردیف حدود ۲۰۰ کیلوبایت JSON است و
     سمت سرور به ۱۶۰ دستور چندردیفی تبدیل می‌شود (سقف پارامتر D1). */
  TP.chunkHistory = function (rows, size = 800) {
    const out = [];
    for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
    return out;
  };
})();
