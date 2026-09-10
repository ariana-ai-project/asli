/* ============================================================
   خواندن فایل «خروجی اقلام درخواست» راهکاران (.xlsx) در مرورگر

   ساختار فایل (از نمونهٔ واقعی): یک شیت، یک سطر برای هر قلم، ستون‌ها با
   نام مشخص در سطر اول. ستون‌ها با «نام» پیدا می‌شوند نه با شماره، تا
   جابه‌جایی ستون در خروجی‌های بعدی راهکاران فایل را نشکند.

   قواعد (تأییدشده با مدیر):
   - وضعیت و کارشناس روی قلم نگه داشته می‌شوند؛ درخواست تا وقتی حتی یک
     قلم باز دارد «باز» است.
   - طرف مقابل و تاریخ درون یک درخواست همیشه یکی‌اند (در نمونه صفر تعارض)؛
     اگر روزی نبود، اولی گرفته و در آمار گزارش می‌شود.
   - کارشناس: چند سطر خالی + یک نام ⇒ حل خودکار (همان نام).
              دو نام غیرخالی متفاوت ⇒ تعارض نیازمند تصمیم مدیر (⚠).
   - وضعیت ناشناخته ⇒ «باز» + گزارش در آمار (بی‌صدا حذف نمی‌شود).

   نیاز: window.XLSX (vendor/xlsx.full.min.js) و window.TP (shared.js)
   ============================================================ */
(function () {
  "use strict";
  const TP = (window.TP = window.TP || {});

  /* نام ستون‌های راهکاران → کلید داخلی. required=true یعنی بدون آن فایل پذیرفته نمی‌شود. */
  const COLUMNS = [
    ["شماره درخواست",       "id",        true],
    ["تاریخ درخواست",       "date",      true],
    ["واحد رمز/تامین",      "unitSrc",   false],
    ["نوع قلم",             "itemType",  false],
    ["مرکز درخواست کننده",  "center",    false],
    ["درخواست کننده",       "requester", false],
    ["نوع طرف مقابل",       "partyType", false],
    ["طرف مقابل",           "party",     true],
    ["نوع درخواست خرید",    "reqType",   false],
    ["کد قلم خریدنی",       "code",      false],   // خروجی روزانهٔ راهکاران کد قلم ندارد؛ کلید قلم روی عنوان است
    ["عنوان قلم خریدنی",    "title",     true],
    ["مشخصه فنی",           "spec",      false],
    ["مقدار",               "qty",       true],
    ["واحد",                "unit",      true],
    ["تاریخ نیاز",          "needDate",  false],
    ["مصرف کننده",          "consumer",  false],
    ["نوع خرید",            "buyType",   false],
    ["روند خرید",           "buyFlow",   false],
    ["کارشناس خرید",        "expert",    false],
    ["رمز فوریت",           "urgency",   false],
    ["توضیحات",             "note",      false],
    ["وضعیت",               "status",    true],
  ];

  const T = (v) => String(v == null ? "" : v).trim();

  /* سطر اول → نقشهٔ کلید→اندیس ستون. ستون‌های لازمِ غایب را با نام گزارش می‌کند. */
  function mapHeader(headerRow) {
    const idx = {};
    const norm = headerRow.map((h) => TP.nrm(h));
    const missing = [];
    for (const [name, key, req] of COLUMNS) {
      const i = norm.indexOf(TP.nrm(name));
      if (i >= 0) idx[key] = i; else if (req) missing.push(name);
    }
    if (missing.length) {
      const e = new Error("این فایل، خروجی «اقلام درخواست» راهکاران نیست یا ستون‌های زیر را ندارد:\n" + missing.map((m) => "• " + m).join("\n"));
      e.code = "BAD_HEADER"; throw e;
    }
    return idx;
  }

  /* فایل → ArrayBuffer → سطرها (آرایهٔ آرایه). سنگین‌ترین مرحله؛ روی ۸۴ هزار سطر چند ثانیه. */
  /* سقف حجم: کل فایل باید در حافظهٔ مرورگر باز شود و xlsx فشرده است، پس فایل
     ۴۰ مگابایتی می‌تواند صدها مگابایت رم بگیرد و تب را قفل کند. بزرگ‌ترین خروجی
     واقعی راهکاران (۷ سال، ۸۴ هزار سطر) حدود ۶ مگابایت است. */
  const MAX_BYTES = 40 * 1024 * 1024;

  async function readRows(file, onProgress) {
    if (!window.XLSX) throw new Error("کتابخانهٔ خواندن اکسل بارگذاری نشده است (vendor/xlsx.full.min.js).");
    if (!/\.xlsx?$/i.test(file.name || "")) throw new Error("فقط فایل اکسل (.xlsx) پذیرفته می‌شود.");
    if (file.size > MAX_BYTES) {
      throw new Error(`حجم فایل ${(file.size / 1048576).toFixed(1)} مگابایت است و از سقف ${MAX_BYTES / 1048576} مگابایت بیشتر است.`);
    }
    onProgress && onProgress("خواندن فایل…");
    const buf = await file.arrayBuffer();
    onProgress && onProgress("تجزیهٔ کاربرگ…");
    /* cellText/cellHTML/cellNF خاموش تا حافظه کمتر مصرف شود؛ فقط مقدار خام لازم است */
    const wb = XLSX.read(buf, { type: "array", cellDates: false, cellText: false, cellHTML: false, cellNF: false, cellStyles: false });
    if (!wb.SheetNames.length) throw new Error("فایل هیچ کاربرگی ندارد.");
    /* کاربرگ را با سرستون‌هایش پیدا می‌کنیم، نه با جایگاهش: خروجی روزانهٔ راهکاران دو کاربرگ دارد
       («اقلام» و «درخواست») و ترتیبشان قرارداد نیست. فقط سطر اول هر کاربرگ خوانده می‌شود. */
    const required = COLUMNS.filter((c) => c[2]).map((c) => TP.nrm(c[0]));
    let name = null;
    for (const n of wb.SheetNames) {
      const ws = wb.Sheets[n]; if (!ws || !ws["!ref"]) continue;
      const rg = XLSX.utils.decode_range(ws["!ref"]);
      const head = [];
      for (let c = rg.s.c; c <= rg.e.c; c++) { const cell = ws[XLSX.utils.encode_cell({ r: rg.s.r, c })]; head.push(TP.nrm(cell ? cell.v : "")); }
      if (required.every((h) => head.includes(h))) { name = n; break; }
    }
    if (!name) {
      const e = new Error("هیچ کاربرگی با ستون‌های «اقلام درخواست» راهکاران پیدا نشد. کاربرگ‌ها: " + wb.SheetNames.join("، "));
      e.code = "BAD_HEADER"; throw e;
    }
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: false, blankrows: false });
    return { rows, sheet: name };
  }

  /* هستهٔ تبدیل: سطرهای خام → درخواست‌ها + آمار */
  function build(rows, idx) {
    const byId = new Map();
    const stats = {
      rows: 0, requests: 0, itemRows: 0, parties: 0, maxItems: 0, multiItem: 0,
      openRequests: 0, closedRequests: 0, unassignedOpen: 0,
      /* تفکیک غیرفعال‌ها — IMP-05 پیام «n درخواست بسته شده» را جدا از «متوقف شده» می‌خواهد.
         closedRequests = مجموع این سه (یعنی هر درخواستی که هیچ قلم باز/معلق ندارد). */
      closedOnly: 0, stoppedOnly: 0, mixedInactive: 0,
      expertConflictAuto: 0, expertConflictDecision: 0, statusMixed: 0,
      closedItemsSkipped: 0, partlyClosed: 0, liveItemRows: 0,
      partyConflicts: 0, dateConflicts: 0, badQty: 0,
      unknownStatuses: {}, statusCounts: {}, dateMin: null, dateMax: null,
    };
    const parties = new Set();

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r]; if (!row) continue;
      const id = T(row[idx.id]); if (!id) continue;
      stats.rows++;
      const get = (k) => (idx[k] == null ? "" : T(row[idx[k]]));

      let req = byId.get(id);
      if (!req) {
        req = {
          id, date: TP.jNorm(get("date")), party: get("party"), partyType: get("partyType"), center: get("center"),
          requester: get("requester"), reqType: get("reqType"), buyType: get("buyType"), buyFlow: get("buyFlow"),
          urgency: get("urgency"), items: [], _parties: new Set(), _dates: new Set(),
        };
        byId.set(id, req);
      }
      req._parties.add(get("party")); req._dates.add(TP.jNorm(get("date")));

      const srcStatus = get("status");
      const state = TP.SRC2STATE[srcStatus];
      if (!state) stats.unknownStatuses[srcStatus || "∅"] = (stats.unknownStatuses[srcStatus || "∅"] || 0) + 1;
      stats.statusCounts[srcStatus || "∅"] = (stats.statusCounts[srcStatus || "∅"] || 0) + 1;

      const qty = TP.num(get("qty")); if (qty === null) stats.badQty++;

      req.items.push({
        lineNo: req.items.length + 1,
        code: get("code"), title: get("title"), spec: get("spec"), qty, unit: get("unit"),
        needDate: TP.jNorm(get("needDate")), consumer: get("consumer"), note: get("note"),
        srcStatus, srcExpert: get("expert"), state: state || "open",
      });
      parties.add(get("party"));
    }

    const requests = [];
    for (const req of byId.values()) {
      if (req._parties.size > 1) stats.partyConflicts++;
      if (req._dates.size > 1) stats.dateConflicts++;
      delete req._parties; delete req._dates;

      /* itemRows/maxItems/multiItem همان «سطرهای فایل»‌اند و عددهای طلایی
         IMP-08 روی همین‌ها بسته شده؛ دست نمی‌خورند.
         قلمِ «بسته شده» وارد پنل نمی‌شود، پس شمارشِ کارِ واقعی جداگانه می‌آید. */
      const closed = req.items.filter((i) => i.state === "closed").length;
      req.liveItems = req.items.length - closed;
      stats.closedItemsSkipped += closed;
      if (closed && req.liveItems) stats.partlyClosed++;
      stats.liveItemRows += req.liveItems;

      const n = req.items.length;
      stats.itemRows += n; if (n > stats.maxItems) stats.maxItems = n; if (n > 1) stats.multiItem++;

      /* کارشناس در سطح درخواست */
      const live = req.items.filter((i) => i.state !== "closed");
      const names = [...new Set(live.map((i) => TP.nrm(i.srcExpert)).filter(Boolean))];
      const blanks = live.some((i) => !T(i.srcExpert));
      req.experts = [...new Set(live.map((i) => T(i.srcExpert)).filter(Boolean))];
      req.expertConflict = names.length > 1;
      if (req.expertConflict) stats.expertConflictDecision++;
      else if (names.length === 1 && blanks) stats.expertConflictAuto++;

      /* وضعیت در سطح درخواست */
      const states = new Set(req.items.map((i) => i.state));
      if (states.size > 1) stats.statusMixed++;
      req.anyOpen = req.items.some((i) => i.state === "open" || i.state === "hold");
      if (req.anyOpen) { stats.openRequests++; if (!req.experts.length) stats.unassignedOpen++; }
      else {
        stats.closedRequests++;
        if (states.size === 1 && states.has("closed")) stats.closedOnly++;
        else if (states.size === 1 && states.has("stop")) stats.stoppedOnly++;
        else stats.mixedInactive++;
      }

      if (req.date) { if (!stats.dateMin || req.date < stats.dateMin) stats.dateMin = req.date; if (!stats.dateMax || req.date > stats.dateMax) stats.dateMax = req.date; }
      requests.push(req);
    }
    stats.requests = requests.length; stats.parties = parties.size;
    /* جدیدترین اول */
    requests.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
    return { requests, stats };
  }

  /* ورودی اصلی. onProgress(text) اختیاری. */
  TP.importExcel = async function (file, onProgress) {
    const { rows, sheet } = await readRows(file, onProgress);
    if (!rows.length) throw new Error("کاربرگ خالی است.");
    const idx = mapHeader(rows[0]);
    onProgress && onProgress(`ساخت درخواست‌ها از ${TP.M(rows.length - 1)} سطر…`);
    const out = build(rows, idx);
    out.sheet = sheet; out.filename = file.name; out.headerMap = idx;
    return out;
  };

  /* آنچه به سرور فرستاده می‌شود:
     - درخواست‌های با قلم باز/معلق: کامل (برای درج/به‌روزرسانی)
     - شمارهٔ درخواست‌های کاملاً بسته/متوقف در فایل: فقط شناسه، تا سرور اقلامی را که
       در سامانه باز مانده‌اند ولی در راهکاران بسته شده‌اند، برای تأیید مدیر پیشنهاد بستن کند.
     تاریخچهٔ ۷ سالهٔ بسته (۶۸ هزار سطر) دیگر ارسال نمی‌شود. */
  TP.importPayload = function (parsed) {
    const open = parsed.requests.filter((r) => r.anyOpen);
    const closedIds = parsed.requests.filter((r) => !r.anyOpen).map((r) => r.id);
    return { filename: parsed.filename, stats: parsed.stats, open, closedIds };
  };

  /* برش دستهٔ درخواست‌های باز برای ارسال در چند فراخوانی (حدود N قلم در هر دسته) */
  TP.chunkRequests = function (reqs, maxItems = 600) {
    const out = []; let cur = [], n = 0;
    for (const r of reqs) {
      if (cur.length && n + r.items.length > maxItems) { out.push(cur); cur = []; n = 0; }
      cur.push(r); n += r.items.length;
    }
    if (cur.length) out.push(cur);
    return out;
  };

  /* ---------- سوابق تأمین (IMP-13) ----------
     فایلِ اسنادِ خرید شکلِ ثابتی ندارد (از حسابداری می‌آید، نه از خروجی
     درخواست‌ها)، پس ستون‌ها با نام‌های جایگزین شناخته می‌شوند و نقشهٔ نهایی به
     مدیر نشان داده می‌شود. */
  const HCOLS = [
    ["date", ["تاریخ سند", "تاریخ فاکتور", "تاریخ خرید", "تاریخ", "تاریخ درخواست"], true],
    ["supplier", ["تامین کننده", "تأمین کننده", "نام تامین کننده", "فروشنده", "طرف مقابل", "نام فروشنده"], true],
    ["item", ["عنوان قلم خریدنی", "عنوان قلم", "نام قلم", "نام کالا", "کالا", "شرح کالا", "شرح"], true],
    ["code", ["کد قلم خریدنی", "کد قلم", "کد کالا"], false],
    ["qty", ["مقدار", "تعداد"], false],
    ["price", ["فی", "قیمت واحد", "مبلغ واحد", "نرخ", "بهای واحد"], false],
    ["amount", ["مبلغ", "مبلغ کل", "جمع", "قیمت کل", "بهای کل", "جمع مبلغ"], false],
    ["party", ["مرکز هزینه", "پروژه", "مصرف کننده", "مرکز درخواست کننده", "محل مصرف"], false],
    ["doc", ["شماره سند", "شماره فاکتور", "شماره درخواست", "سند"], false],
  ];
  const hNormDate = (v) => {
    const s = String(v == null ? "" : v).replace(/[۰-۹]/g, (c) => "۰۱۲۳۴۵۶۷۸۹".indexOf(c)).trim();
    let m = /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/.exec(s);
    if (!m) { const c = /^(\d{4})(\d{2})(\d{2})$/.exec(s); if (c) m = [s, c[1], c[2], c[3]]; }
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3];
    if (y < 1300 || y > 1500 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${y}/${String(mo).padStart(2, "0")}/${String(d).padStart(2, "0")}`;
  };

  TP.importHistory = async function (file, onProgress) {
    if (!window.XLSX) throw new Error("کتابخانهٔ خواندن اکسل بارگذاری نشده است.");
    if (file.size > MAX_BYTES) throw new Error(`حجم فایل از سقف ${MAX_BYTES / 1048576} مگابایت بیشتر است.`);
    onProgress && onProgress("خواندن فایل…");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false, cellText: false, cellHTML: false, cellNF: false, cellStyles: false });
    /* کاربرگی که سه ستونِ لازم را دارد؛ سرستون در ده سطر اول جست‌وجو می‌شود */
    let found = null;
    for (const n of wb.SheetNames) {
      const ws = wb.Sheets[n]; if (!ws || !ws["!ref"]) continue;
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false, blankrows: false });
      for (let hr = 0; hr < Math.min(10, rows.length); hr++) {
        const head = (rows[hr] || []).map((x) => TP.nrm(x));
        const mapping = {};
        for (const [key, names] of HCOLS) { for (const nm of names) { const i = head.indexOf(TP.nrm(nm)); if (i >= 0) { mapping[key] = i; break; } } }
        const need = HCOLS.filter((c) => c[2]).every((c) => mapping[c[0]] != null);
        if (need && (mapping.amount != null || mapping.price != null)) { found = { sheet: n, rows, hr, mapping, headers: rows[hr].map((x) => String(x == null ? "" : x)) }; break; }
      }
      if (found) break;
    }
    if (!found) {
      const e = new Error("هیچ کاربرگی با ستون‌های لازمِ سوابق (تاریخ، تأمین‌کننده، قلم، و مبلغ یا فی) پیدا نشد. کاربرگ‌ها: " + wb.SheetNames.join("، "));
      e.code = "BAD_HEADER"; throw e;
    }
    onProgress && onProgress(`ساخت رکوردها از ${TP.M(found.rows.length - found.hr - 1)} سطر…`);
    const mp = found.mapping, out = [], sups = new Set();
    let bad = 0, dateMin = null, dateMax = null;
    const get = (row, k) => (mp[k] == null ? null : row[mp[k]]);
    for (let r = found.hr + 1; r < found.rows.length; r++) {
      const row = found.rows[r]; if (!row) continue;
      const date = hNormDate(get(row, "date")), supplier = T(get(row, "supplier")), item = T(get(row, "item"));
      const qty = TP.num(get(row, "qty")), price = TP.num(get(row, "price"));
      let amount = TP.num(get(row, "amount")); if (amount == null && price != null && qty != null) amount = price * qty;
      if (!date || !supplier || !item || !(amount > 0)) { bad++; continue; }
      out.push({ date, supplier, item, code: T(get(row, "code")), qty, price, amount, party: T(get(row, "party")), doc: T(get(row, "doc")) });
      sups.add(TP.nrm(supplier));
      if (!dateMin || date < dateMin) dateMin = date; if (!dateMax || date > dateMax) dateMax = date;
    }
    return { rows: out, mapping: mp, headers: found.headers, sheet: found.sheet, filename: file.name,
      stats: { rows: found.rows.length - found.hr - 1, good: out.length, bad, suppliers: sups.size, dateMin, dateMax } };
  };
})();
