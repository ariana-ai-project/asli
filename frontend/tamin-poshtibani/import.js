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
    /* ستون‌های خروجی تازهٔ راهکاران (شهریور ۱۴۰۵) — همه اختیاری تا فایل قدیمی هم خوانده شود */
    ["نوع مبنا",            "basisType", false],
    ["شماره مبنا",          "basisNo",   false],
    ["نوع الگو سند قراردادی", "contractKind", false],
    ["شماره قرارداد/تفاهم نامه", "contractNo", false],
    ["کد قلم خریدنی",       "code",      false],   // خروجی روزانهٔ راهکاران کد قلم ندارد؛ کلید قلم روی عنوان است
    ["عنوان قلم خریدنی",    "title",     true],
    ["مشخصه فنی",           "spec",      false],
    ["مقدار",               "qty",       true],
    ["واحد",                "unit",      true],
    ["تاریخ نیاز",          "needDate",  false],
    ["مصرف کننده",          "consumer",  false],
    ["ارز",                 "currency",  false],
    ["نرخ ارز",             "rate",      false],
    ["فی",                  "fee",       false],
    ["مبلغ",                "amount",    false],
    ["نوع خرید",            "buyType",   false],
    ["روند خرید",           "buyFlow",   false],
    ["مهلت استعلام",        "quoteDeadline", false],
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
          urgency: get("urgency"),
          /* برای برگهٔ درخواست خرید: واحد/رمز تامین و نوع قلم؛ مبنا و قرارداد فقط بایگانی */
          supplyUnit: get("unitSrc"), itemType: get("itemType"), basisType: get("basisType"), basisNo: get("basisNo"),
          contractKind: get("contractKind"), contractNo: get("contractNo"),
          items: [], _parties: new Set(), _dates: new Set(),
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
        quoteDeadline: TP.jNorm(get("quoteDeadline")), currency: get("currency"), fee: TP.num(get("fee")), amount: TP.num(get("amount")),
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

  /* ---------- بایگانیِ درخواست‌ها برای گزارش‌ها ----------
     گزارش سه‌ماهه درخواست‌های «خرید شده» و «متوقف» هر دوره را به تفکیک کارشناس و پروژه می‌شمارد، ولی
     ورود روزانه درخواستِ بسته را به پنل نمی‌فرستد (بالا) — پس هر دورهٔ گذشته صفر بود (ممیزی مهر ۱۴۰۵).
     برای هر درخواستِ فایل (باز و بسته) یک ردیفِ خلاصه ساخته می‌شود — همان شمارش‌هایی که گزارش از
     اقلام می‌گیرد — و سرور فقط ردیفی را می‌نویسد که اثرانگشتش عوض شده: بار اول یک ردیف برای هر درخواست
     (۲۰ هزار در ۷ سال)، بعد از آن روزانه فقط چند ده ردیف. */
  const fnv32 = (s, h = 0x811c9dc5) => { s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
  const HIST_FIELDS = ["id", "date", "party", "center", "party_type", "requester", "req_type", "supply_unit", "buy_type", "n", "nc", "ns", "nh", "ost", "anyst", "sx", "note"];
  TP.REQ_HIST_FIELDS = HIST_FIELDS;
  TP.requestSummaries = function (parsed) {
    return parsed.requests.map((req) => {
      const its = req.items;
      const cnt = (s) => its.filter((i) => i.state === s).length;
      const ost = [...new Set(its.filter((i) => i.state === "open").map((i) => i.srcStatus).filter(Boolean))].sort().join(",");
      /* همان MAX(src_status) که گزارش روی اقلامِ پنل می‌گیرد */
      const anyst = its.map((i) => i.srcStatus || "").reduce((a, b) => (b > a ? b : a), "");
      /* کارشناس درخواست: رایج‌ترین نامِ ستون «کارشناس خرید» میان اقلام */
      const f = new Map(); for (const i of its) { const e = T(i.srcExpert); if (e) f.set(e, (f.get(e) || 0) + 1); }
      const sx = [...f].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1)).map(([e]) => e)[0] || "";
      const row = { id: req.id, date: req.date, party: req.party, center: req.center, party_type: req.partyType, requester: req.requester,
        req_type: req.reqType, supply_unit: req.supplyUnit, buy_type: req.buyType, n: its.length, nc: cnt("closed"), ns: cnt("stop"), nh: cnt("hold"),
        ost, anyst, sx, note: (its.find((i) => T(i.note)) || {}).note || "" };
      row.fp = (fnv32(JSON.stringify(HIST_FIELDS.map((k) => row[k]))) >>> 0).toString(16);
      return row;
    });
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

})();
