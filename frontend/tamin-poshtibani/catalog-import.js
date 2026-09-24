/* ============================================================
   خواندن چهار فایل «اقلام · شاخص تعدیل · نرخ تبدیل · سوابق خرید» در مرورگرِ مدیر

   همان الگوی import.js: فایل‌ها هیچ‌وقت به Worker نمی‌روند؛ این‌جا باز و به هم
   وصل می‌شوند و فقط نتیجهٔ نهایی — آمادهٔ نوشتن — دسته‌دسته فرستاده می‌شود.
   اسکریپت ورود اول (scripts/import-catalog.mjs) همین فایل را عیناً اجرا می‌کند،
   پس ورود از پنل و ورود اول نمی‌توانند از هم واگرا شوند.

   چرا این شکل — کمترین نوشتن در D1 (سقف پلن رایگان: ۱۰۰ هزار ردیف در روز، و هر
   ایندکس برای هر ردیف یک نوشتن اضافه):
   • آنچه مال «قلم» است یک بار ذخیره می‌شود، نه روی تک‌تک ردیف‌های خرید: اقلام،
     لایه‌ها و نرخ‌های تبدیل یک ردیف به ازای هر نوع قلم (≈۲٬۵۰۰)، نه ۲۳ هزار قلم
     و ۵۵ هزار لایه. کد و ردهٔ تأمین‌کننده هم یک ردیف به ازای هر تأمین‌کننده.
   • ردیف خرید فقط یک نوشتن دارد: کلید اصلی (نوع قلم، کد قلم، اثرانگشت) خودش
     جستجوی «نوع قلم» و «عین قلم» را جواب می‌دهد و ایندکس جانبی لازم نیست.
   • قیمت تعدیل‌شده همین‌جا ساخته می‌شود (فرمول فایل ۲). نرخ تبدیل واحد نه — آن
     را کارشناس هنگام جستجو می‌تواند عوض کند، پس سرور هنگام خواندن اعمالش می‌کند.

   • لایه‌ها پیش از نوشتن یکسان می‌شوند (catalog-rules.mjs): لایهٔ کمّی عدد و واحدِ
     استانداردِ جدا («2 میل» ← {v: 2، u: میلی‌متر}، عددِ بی‌واحد با واحدِ عرفِ همان نوع قلم و
     علامت «ضمنی»)، جنس با نام استاندارد، و جنسِ گفته‌نشده با عرفِ نوع قلم
     (catalog-head-rules.mjs). نوع قلمی که جنس بازارش را جدا می‌کند به نام کامل می‌رود
     («ورق» ← «ورق آهنی»، «ورق گالوانیزه»)، ولی ردیف خرید همان نوع قلمِ فایل را نگه
     می‌دارد و نوع قلمِ مؤثر با «src» به آن وصل است — پس تغییر قاعده فقط فهرست اقلام را
     از نو می‌نویسد، نه ۷۰ هزار ردیف خرید را.

   ستون‌ها با «نام» پیدا می‌شوند نه با شماره، تا جابه‌جایی ستون فایل را نشکند.
   نیاز: window.XLSX (vendor/xlsx.full.min.js)، window.TP (shared.js) و TP.rules — دو ماژول
   catalog-rules.mjs و catalog-head-rules.mjs که صفحه با <script type="module"> رویش می‌گذارد.
   ============================================================ */
(function () {
  "use strict";
  const TP = (window.TP = window.TP || {});

  /* ---------- قواعد مشترک با Worker ----------
     این چهار تابع عیناً در worker/catalog.js هم هستند (مرورگر ماژول ES نمی‌خواند).
     تست «تطابق با Worker» (catalog.test.mjs) هر واگرایی را می‌گیرد: اگر کلید یا
     تکهٔ یک کد این‌جا و آن‌جا فرق کند، قلم یا تأمین‌کننده پیدا نمی‌شود. */
  const ascii = (s) => String(s == null ? "" : s)
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
  /* نام نمایشی و کلید جدول‌ها (نوع قلم، واحد): حروف عربی → فارسی، نیم‌فاصله → فاصله */
  const nameOf = (x) => String(x == null ? "" : x).replace(/ي/g, "ی").replace(/ك/g, "ک")
    .replace(/[‌‎‏]/g, " ").replace(/\s+/g, " ").trim();
  /* کلید مقایسه (تأمین‌کننده، عنوان): همان، با حروف کوچک و رقم لاتین */
  const keyOf = (x) => ascii(nameOf(x)).toLowerCase();
  const fnv32 = (s, h = 0x811c9dc5) => { s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
  const hex8 = (n) => (n >>> 0).toString(16).padStart(8, "0");
  /* تکهٔ ذخیرهٔ کد قلم و واژه — یکنواخت، مستقل از شکل کدها */
  const CODE_SHARDS = 64, WORD_SHARDS = 32;
  const shardOf = (kind, k) => kind === "code"
    ? "c" + String(fnv32(k) % CODE_SHARDS).padStart(2, "0")
    : "w" + String(fnv32(k) % WORD_SHARDS).padStart(2, "0");
  /* واژه‌های عنوان برای یافتن نوع قلم. عددِ تنها و تک‌حرف نشانهٔ نوع قلم نیستند (نمره و
     اندازه‌اند) و فقط شلوغ می‌کنند. «x» جداکننده نیست چون در واژه‌های لاتین هست. */
  const words = (title) => keyOf(title).split(/[\s\-_/\\()[\]{}*×,.،؛:;"'«»+|=!?؟#]+/)
    .filter((w) => w.length >= 2 && !/^\d+([.,/]\d+)*$/.test(w));
  TP.cat = { ascii, nameOf, keyOf, fnv32, shardOf, words, CODE_SHARDS, WORD_SHARDS };
  /* گروه‌های جدول — همان worker/catalog.js:GROUPS. هر گروه با یک اثرانگشت تصمیم می‌گیرد
     از نو ساخته شود یا نه، و پنل مدیر پیش از شروع همین را برای برآورد نوشتن نشان می‌دهد. */
  TP.catalogGroups = {
    catalog: ["cat_heads", "cat_codes", "cat_words", "price_index", "guild_classes"],
    grades: ["supplier_grades"],
    purchases: ["purchases"],
  };
  TP.catalogTableFa = {
    cat_heads: "اقلام به تفکیک نوع قلم", cat_codes: "نقشهٔ کد قلم", cat_words: "واژه‌نامهٔ یافتن اقلام مشابه",
    price_index: "شاخص‌های تعدیل", guild_classes: "طبقه‌های اصناف", supplier_grades: "کد و ردهٔ تأمین‌کنندگان", purchases: "ردیف‌های خرید",
  };

  const T = (v) => String(v == null ? "" : v).trim();
  const numOf = (v) => { const s = ascii(String(v == null ? "" : v)).replace(/,/g, "").trim(); if (!s) return null; const n = Number(s); return isNaN(n) ? null : n; };
  const hkey = (s) => keyOf(s).replace(/\s/g, "");
  /* طول بایتیِ UTF-8 — سقف دستور SQL در D1 بایتی است و حرف فارسی دو بایت است */
  const utf8len = (s) => { let n = 0; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); n += c < 0x80 ? 1 : c < 0x800 ? 2 : (c >= 0xd800 && c < 0xdc00) ? (i++, 4) : 3; } return n; };

  /* هر بخشِ یک نوع قلم کمتر از این بایت — تا ورود اول (SQL با مقدار درون‌خطی)
     از سقف ۱۰۰ کیلوبایتی دستور D1 نگذرد */
  const PART_BYTES = 40000;
  /* واژه‌ای که در بیش از این تعداد نوع قلم هست نشانه نیست («و»، «برای»، «کامل») */
  const MAX_WORD_HEADS = 120;

  /* ---------- خواندن کاربرگ ---------- */
  function sheetRows(wb, name) {
    const ws = wb.Sheets[name];
    return ws ? XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true, blankrows: false }) : null;
  }
  /** سرستون → اندیس، با نام‌های جایگزین. `need` نام‌های اجباری است؛ نبودشان خطای روشن می‌دهد. */
  function colsOf(header, spec, where) {
    const h = (header || []).map(hkey), idx = {}, miss = [];
    for (const [key, names, need] of spec) {
      const alts = Array.isArray(names) ? names : [names];
      const i = alts.map((n) => h.indexOf(hkey(n))).find((x) => x >= 0);
      if (i >= 0) idx[key] = i; else if (need) miss.push(alts.join(" / "));
    }
    if (miss.length) {
      const e = new Error(`${where} این ستون‌ها را ندارد:\n${miss.map((m) => "• " + m).join("\n")}`);
      e.code = "BAD_HEADER"; throw e;
    }
    return idx;
  }
  const need = (wb, sheet, file) => {
    const rows = sheetRows(wb, sheet);
    if (!rows || !rows.length) { const e = new Error(`کاربرگ «${sheet}» در فایل ${file} نیست.`); e.code = "BAD_HEADER"; throw e; }
    return rows;
  };

  /* سوابق: کاربرگی که این سه ستون را دارد (نام کاربرگ در هر خروجیِ راهکاران فرق می‌کند) */
  const HIST_MARK = ["تاریخ سفارش", "کد قلم خریدنی", "تامین کننده"];
  function historySheet(wb) {
    for (const n of wb.SheetNames) {
      const ws = wb.Sheets[n]; if (!ws || !ws["!ref"]) continue;
      const head = (sheetRows(wb, n)[0] || []).map(hkey);
      if (HIST_MARK.every((m) => head.includes(hkey(m)))) return n;
    }
    return null;
  }

  /** کدام یک از چهار فایل است؟ از روی کاربرگ‌ها، نه نام فایل. */
  TP.catalogKind = function (wb) {
    const has = (n) => wb.SheetNames.includes(n);
    if (has("items") && has("item_attributes")) return "items";
    if (has("class_index") && has("index_quarterly")) return "indices";
    if (has("head_rates") && has("item_rates")) return "units";
    if (historySheet(wb)) return "history";
    return null;
  };
  TP.catalogKindFa = { items: "اقلام (نرمال‌سازی)", indices: "شاخص‌های تعدیل", units: "نرخ‌های تبدیل واحد", history: "سوابق خرید" };

  /** یک فایل اکسل → کاربرگ‌ها. حالت dense حافظهٔ فایل ۷۰ هزار سطری را نصف می‌کند. */
  TP.readBook = async function (file) {
    if (!window.XLSX) throw new Error("کتابخانهٔ خواندن اکسل بارگذاری نشده است (vendor/xlsx.full.min.js).");
    if (!/\.xlsx?$/i.test(file.name || "")) throw new Error(`«${file.name}» اکسل نیست؛ فقط .xlsx پذیرفته می‌شود.`);
    return XLSX.read(await file.arrayBuffer(), { type: "array", dense: true, cellDates: false, cellText: false, cellHTML: false, cellNF: false, cellStyles: false });
  };

  /* ---------- فایل ۱: اقلام ---------- */
  function readItems(wb) {
    const rows = need(wb, "items", "اقلام");
    const c = colsOf(rows[0], [
      ["code", "کد قلم", true], ["title", "عنوان قلم", true], ["head", "نوع قلم", true], ["ref", "واحد مرجع", false],
      ["cl", "کد خوشه", false], ["cls", "کد طبقهٔ اصناف", true], ["residual", "باقیماندهٔ متن", false],
      ["json", "ویژگی‌ها (JSON)", false],
    ], "کاربرگ items فایل اقلام");

    /* نام لایه‌ها از برگهٔ بلند (فارسی ↔ انگلیسی)، به ترتیبِ ستون‌های برگهٔ items */
    const attrRows = sheetRows(wb, "item_attributes") || [];
    const ac = attrRows.length ? colsOf(attrRows[0], [["fa", "نام لایهٔ ویژگی", true], ["en", "نام لایه (انگلیسی)", false]], "کاربرگ item_attributes") : null;
    const en = new Map();
    if (ac) for (const r of attrRows.slice(1)) { const fa = nameOf(r[ac.fa]); if (fa && !en.has(fa)) en.set(fa, T(r[ac.en])); }
    const header = (rows[0] || []).map(nameOf);
    const layers = header.filter((h) => en.has(h));
    for (const fa of en.keys()) if (!layers.includes(fa)) layers.push(fa);
    const layerCol = new Map(layers.map((l) => [l, header.indexOf(l)]).filter(([, i]) => i >= 0));

    const items = [];
    for (const r of rows.slice(1)) {
      const code = T(r[c.code]); if (!code) continue;
      let attrs = null;
      if (c.json != null && r[c.json]) { try { attrs = JSON.parse(r[c.json]); } catch (_) { attrs = null; } }
      if (!attrs) { attrs = {}; for (const [l, i] of layerCol) if (T(r[i])) attrs[l] = T(r[i]); }
      const clean = {};
      for (const [k, v] of Object.entries(attrs || {})) if (T(v)) clean[nameOf(k)] = T(v);
      items.push({
        code, title: T(r[c.title]), head: nameOf(r[c.head]), ref: c.ref != null ? nameOf(r[c.ref]) : "",
        cl: c.cl != null ? T(r[c.cl]) : "", cls: T(r[c.cls]),
        residual: c.residual != null ? T(r[c.residual]) : "", attrs: Object.keys(clean).length ? clean : null,
      });
    }
    const clusters = {};
    const cr = sheetRows(wb, "clusters");
    if (cr && cr.length) { const k = colsOf(cr[0], [["code", "کد خوشه", true], ["name", "نام خوشه", true]], "کاربرگ clusters"); for (const r of cr.slice(1)) if (T(r[k.code])) clusters[T(r[k.code])] = T(r[k.name]); }
    return { items, layers: layers.map((fa) => ({ fa, en: en.get(fa) || "" })), clusters };
  }

  /* ---------- یکسان‌سازی لایه‌ها (catalog-rules.mjs) ---------- */
  /**
   * هر قلم → {eff: نوع قلمِ مؤثر، attrs: لایه‌های استاندارد}، با آمار برای گزارش ورود. سه گذر:
   *   ۱. جنس (لایه، پوششِ گالوانیزه، عنوان، یا عرفِ نوع قلم) و نوع قلمِ مؤثر؛ لایه‌های کمّی فقط
   *      با واحدِ صریح.
   *   ۲. عرفِ واحدِ هر لایه در هر نوع قلم، از همان مقدارهای صریح — به ازای نوع قلمِ مؤثر و، برای
   *      جایی که آن‌جا شاهدی نیست، نوع قلمِ فایل.
   *   ۳. عددِ بی‌واحد با همان عرف («لوله ۲» ← ۲ اینچ، «لوله ۱۰۲۰» ← ۱۰۲۰ میلی‌متر)، علامت «ضمنی».
   */
  function canonItems(items, RL) {
    const rules = RL.HEAD_RULES;
    const objects = new Set(items.map((it) => keyOf(it.head)));
    const st = { mat: { layer: 0, title: 0, implied: 0, none: 0 }, ruleItems: 0, qty: { explicit: 0, implicit: 0, unknown: 0, text: 0 }, splitItems: 0 };
    const pass = items.map((it) => {
      const rule = rules[keyOf(it.head)] || null;
      const a = RL.foldCoating(it.attrs || {});
      const m = RL.materialOf({ head: it.head, title: it.title, attrs: a }, rule, objects);
      const eff = RL.effectiveHead(it.head, rule, m.mat);
      const q0 = {};
      for (const [k, v] of Object.entries(a)) if (RL.QUANT[k]) q0[k] = RL.parseQuant(k, v, false);
      if (rule) { st.ruleItems++; st.mat[m.how || "none"]++; }
      if (eff !== it.head) st.splitItems++;
      return { it, a, m, eff, q0 };
    });
    const obs = (key) => pass.flatMap((p) => Object.entries(p.q0).map(([layer, q]) => ({ head: key(p), layer, q })));
    const ucEff = RL.unitConventions(obs((p) => p.eff)), ucSrc = RL.unitConventions(obs((p) => p.it.head));
    const conv = (p, k) => (ucEff[p.eff] || {})[k] || (ucSrc[p.it.head] || {})[k] || null;
    const byCode = new Map(), uc = new Map();
    for (const p of pass) {
      const attrs = {};
      for (const [k, v] of Object.entries(p.a)) {
        if (k === "جنس") { if (p.m.mat) attrs[k] = p.m.mat; continue; }
        if (!RL.QUANT[k]) { attrs[k] = v; continue; }
        const x = RL.quantLayer(k, v, conv(p, k));
        attrs[k] = x;
        if (typeof x === "string") st.qty.text++;
        else for (const y of Array.isArray(x) ? x : [x]) st.qty[!y.u ? "unknown" : y.i ? "implicit" : "explicit"]++;
      }
      if (p.m.mat && !("جنس" in attrs)) attrs["جنس"] = p.m.how === "implied" ? { v: p.m.mat, i: 1 } : p.m.mat;
      byCode.set(p.it.code, { eff: p.eff, attrs: Object.keys(attrs).length ? attrs : null });
      /* عرفِ واحدِ نوع قلمِ مؤثر برای Worker (خواندن عددِ بی‌واحدِ خروجی مدل) */
      if (!uc.has(p.eff)) uc.set(p.eff, {});
      const u = uc.get(p.eff);
      for (const k of Object.keys(p.q0)) if (!u[k]) { const c = conv(p, k); if (c) u[k] = c.map((x) => ({ u: x.u, n: x.n, lo: x.lo, hi: x.hi })); }
    }
    return { byCode, uc, st };
  }

  /* ---------- فایل ۲: شاخص تعدیل ---------- */
  const SEASON = { "بهار": 1, "تابستان": 2, "پاییز": 3, "پائیز": 3, "زمستان": 4 };
  function readIndices(wb) {
    const ci = need(wb, "class_index", "شاخص تعدیل");
    const c = colsOf(ci[0], [["gcode", "کد سرگروه اصناف", false], ["gname", "سرگروه اصناف", false], ["code", "کد طبقهٔ اصناف", true],
      ["name", "طبقهٔ اصناف", false], ["idx", "کد شاخص", true]], "کاربرگ class_index");
    const classes = ci.slice(1).filter((r) => T(r[c.code])).map((r) => ({
      code: T(r[c.code]), name: T(r[c.name]), group_code: T(r[c.gcode]), group_name: T(r[c.gname]), index_code: T(r[c.idx]),
    }));

    const meta = new Map();
    const ix = sheetRows(wb, "indices");
    if (ix && ix.length) { const k = colsOf(ix[0], [["code", "کد شاخص", true], ["name", "نام شاخص", false], ["src", "منبع", false]], "کاربرگ indices"); for (const r of ix.slice(1)) if (T(r[k.code])) meta.set(T(r[k.code]), { name: T(r[k.name]), source: T(r[k.src]) }); }

    const iq = need(wb, "index_quarterly", "شاخص تعدیل");
    const q = colsOf(iq[0], [["code", "کد شاخص", true], ["year", "سال", true], ["q", "شمارهٔ فصل", true], ["v", ["شاخص (زمستان ۱۴۰۴ = ۱۰۰)", "شاخص"], true]], "کاربرگ index_quarterly");
    const series = new Map();
    for (const r of iq.slice(1)) {
      const code = T(r[q.code]), y = numOf(r[q.year]), s = numOf(r[q.q]), v = numOf(r[q.v]);
      if (!code || !y || !s || !(v > 0)) continue;
      if (!series.has(code)) series.set(code, {});
      series.get(code)[`${y}Q${s}`] = v;
    }
    const indices = [...series.keys()].sort().map((code) => ({
      code, name: (meta.get(code) || {}).name || "", source: (meta.get(code) || {}).source || "",
      series: JSON.stringify(Object.fromEntries(Object.entries(series.get(code)).sort())),
    }));
    return { classes, indices, series };
  }

  /* ---------- فایل ۴: نرخ تبدیل ---------- */
  function readUnits(wb) {
    const ref = new Map();
    const ru = sheetRows(wb, "ref_units");
    if (ru && ru.length) { const k = colsOf(ru[0], [["head", "نوع قلم", true], ["ref", "واحد مرجع", true]], "کاربرگ ref_units"); for (const r of ru.slice(1)) if (T(r[k.head])) ref.set(nameOf(r[k.head]), nameOf(r[k.ref])); }

    const rateCols = [["head", "نوع قلم", true], ["unit", "واحد ثبت‌شده", true], ["rate", "نرخ تبدیل به واحد مرجع", true], ["basis", "مبنای نرخ", false], ["conf", "اطمینان", false]];
    const hr = new Map();   /* head → {unit: [rate, basis, conf]} */
    const hrr = need(wb, "head_rates", "نرخ تبدیل");
    const h = colsOf(hrr[0], rateCols, "کاربرگ head_rates");
    for (const r of hrr.slice(1)) {
      const head = nameOf(r[h.head]), unit = nameOf(r[h.unit]), rate = numOf(r[h.rate]);
      if (!head || !unit || !(rate > 0)) continue;
      if (!hr.has(head)) hr.set(head, {});
      hr.get(head)[unit] = [rate, T(r[h.basis]), T(r[h.conf])];
    }
    const cr = new Map();   /* head → {cluster: {unit: [rate, basis, conf]}} */
    const crr = need(wb, "cluster_rates", "نرخ تبدیل");
    const k = colsOf(crr[0], [["cl", "کد خوشه", true], ...rateCols], "کاربرگ cluster_rates");
    for (const r of crr.slice(1)) {
      const head = nameOf(r[k.head]), cl = T(r[k.cl]), unit = nameOf(r[k.unit]), rate = numOf(r[k.rate]);
      if (!head || !cl || !unit || !(rate > 0)) continue;
      if (!cr.has(head)) cr.set(head, {});
      const m = cr.get(head); if (!m[cl]) m[cl] = {};
      m[cl][unit] = [rate, T(r[k.basis]), T(r[k.conf])];
    }
    const ir = new Map();   /* code → {unit: [rate, basis]} */
    const irr = need(wb, "item_rates", "نرخ تبدیل");
    const i = colsOf(irr[0], [["code", "کد قلم", true], ["unit", "واحد ثبت‌شده", true], ["rate", "نرخ تبدیل به واحد مرجع", true], ["basis", "مبنای نرخ", false]], "کاربرگ item_rates");
    for (const r of irr.slice(1)) {
      const code = T(r[i.code]), unit = nameOf(r[i.unit]), rate = numOf(r[i.rate]);
      if (!code || !unit || !(rate > 0)) continue;
      if (!ir.has(code)) ir.set(code, {});
      ir.get(code)[unit] = [rate, T(r[i.basis])];
    }
    return { ref, hr, cr, ir };
  }

  /* ---------- فایل ۳: سوابق خرید ---------- */
  const HIST_COLS = [
    ["no", "شماره", false],
    ["date", "تاریخ سفارش", true],
    ["expert", "کارشناس خرید", false],
    ["code", "کد قلم خریدنی", true],
    ["title", "عنوان قلم خریدنی", true],
    ["qty", "مقدار", false],
    ["unit", "واحد سنجش", false],
    ["amount", "مبلغ به ارز عملیاتی", true],
    ["supplier", "تامین کننده", true],
    /* کد و ردهٔ تأمین‌کننده (فایل‌های تازه) — درست بعد از «تامین کننده» آمده‌اند */
    ["scode", "کد", false],
    ["grade", "رده", false],
    ["month", "ماه", false],
    ["season", "فصل", false],
    ["year", "سال", false],
  ];

  /* «1405/06/16» → [1405, 6] */
  function ymdOf(dateStr) {
    const m = /^(\d{4})\/(\d{1,2})/.exec(ascii(T(dateStr)));
    return m ? [+m[1], +m[2]] : null;
  }

  /* ---------- سازندهٔ اصلی ---------- */
  /**
   * `books`: {items, indices, units, history} — کاربرگ‌های خوانده‌شده (XLSX).
   * خروجی: ردیف‌های آمادهٔ هر جدول (به ترتیب ستون‌های worker/catalog.js:TABLES)،
   * اثرانگشت‌ها و آمار. قطعی است: همان فایل‌ها همیشه همان خروجی را می‌دهند.
   */
  TP.buildCatalog = function (books, onProgress) {
    const say = (t) => onProgress && onProgress(t);
    for (const k of ["items", "indices", "units", "history"]) {
      if (!books[k]) { const e = new Error(`فایل «${TP.catalogKindFa[k]}» انتخاب نشده است.`); e.code = "MISSING"; throw e; }
    }
    const RL = TP.rules;
    if (!RL || !RL.HEAD_RULES) { const e = new Error("قواعد یکسان‌سازی (catalog-rules.mjs) بارگذاری نشده است؛ صفحه را یک بار دیگر باز کنید."); e.code = "NO_RULES"; throw e; }
    say("خواندن فهرست اقلام…");
    const I = readItems(books.items);
    say("یکسان‌سازی لایه‌ها و جنس‌ها…");
    const N = canonItems(I.items, RL);
    say("خواندن شاخص‌های تعدیل…");
    const X = readIndices(books.indices);
    say("خواندن نرخ‌های تبدیل…");
    const U = readUnits(books.units);

    const byCode = new Map(I.items.map((it) => [it.code, it]));
    const classIdx = new Map(X.classes.map((c) => [c.code, c.index_code]));

    /* ----- سوابق ----- */
    say("خواندن سوابق خرید…");
    const hs = historySheet(books.history);
    if (!hs) { const e = new Error(`هیچ کاربرگی با ستون‌های سوابق خرید (${HIST_MARK.join("، ")}) پیدا نشد.`); e.code = "BAD_HEADER"; throw e; }
    const rows = sheetRows(books.history, hs);
    const c = colsOf(rows[0], HIST_COLS, `کاربرگ «${hs}» فایل سوابق`);
    const g = (r, k) => (c[k] == null ? null : r[c[k]]);

    const purchases = [], grades = new Map(), seen = new Map();
    const st = { rows: 0, skipped: 0, noHead: 0, noIndex: 0, noIndexYears: {}, dups: 0, years: {}, ymMin: null, ymMax: null, dateMin: null, dateMax: null };
    const sup = new Set(), codes = new Set();
    let s1 = 0, s2 = 0;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;
      const date = T(g(r, "date")), code = T(g(r, "code")), supplier = T(g(r, "supplier")), amount = numOf(g(r, "amount"));
      const ymd = ymdOf(date);
      if (!date || !code || !supplier || !ymd) { st.skipped++; continue; }
      const year = numOf(g(r, "year")) || ymd[0];
      const month = numOf(g(r, "month")) || ymd[1];
      if (!(month >= 1 && month <= 12)) { st.skipped++; continue; }
      const season = SEASON[T(g(r, "season"))] || Math.ceil(month / 3);
      const ym = year * 12 + month;

      const it = byCode.get(code);
      const head = it ? it.head : "";
      if (!it) st.noHead++;
      /* قیمت به زمستان ۱۴۰۴ = مبلغ × ۱۰۰ ÷ شاخص فصل خرید (فایل ۲). شاخص نداشتن — مثلاً
         خریدهای ۱۴۰۵ که آمارش هنوز منتشر نشده — یعنی ضریب ۱ (توصیهٔ خود فایل ۲). */
      const s = it ? X.series.get(classIdx.get(it.cls)) : null;
      const idx = s ? s[`${year}Q${season}`] : null;
      if (!(idx > 0)) { st.noIndex++; st.noIndexYears[year] = (st.noIndexYears[year] || 0) + 1; }
      const adj = amount == null ? null : idx > 0 ? amount * 100 / idx : amount;

      const qty = numOf(g(r, "qty")), unit = nameOf(g(r, "unit"));
      const sn = keyOf(supplier), title = T(g(r, "title"));
      /* هویت ردیف، مستقل از ترتیب فایل: همان فایل دوباره هیچ ردیفی نمی‌نویسد و فایلِ
         گسترش‌یافته فقط ردیف‌های تازه را. ردیف‌های کاملاً یکسانِ یک سفارش (در فایل
         واقعی هست) خریدِ جدا هستند و شمارنده می‌گیرند. */
      const base = [T(g(r, "no")), sn, keyOf(title), date, qty, amount, unit].join("|");
      const n = seen.get(base) || 0; seen.set(base, n + 1);
      if (n) st.dups++;
      const key = n ? `${base}#${n}` : base;
      const a = fnv32(key), b = fnv32(key, 0x9e3779b9);
      s1 = (s1 + a) >>> 0; s2 = (s2 ^ b) >>> 0;

      purchases.push([head, code, hex8(a) + hex8(b), date, ym, qty, unit, amount, adj == null ? null : Math.round(adj * 100) / 100,
        supplier, sn, T(g(r, "expert")) || null, title]);

      const scode = T(g(r, "scode")), grade = T(g(r, "grade")).toUpperCase();
      if ((scode || grade) && !grades.has(sn)) grades.set(sn, [sn, supplier, scode || null, /^[ABC]$/.test(grade) ? grade : (grade || null)]);

      st.rows++; st.years[year] = (st.years[year] || 0) + 1;
      sup.add(sn); codes.add(code);
      if (st.ymMin == null || ym < st.ymMin) { st.ymMin = ym; st.dateMin = date; }
      if (st.ymMax == null || ym > st.ymMax) { st.ymMax = ym; st.dateMax = date; }
    }
    st.suppliers = sup.size; st.codes = codes.size; st.graded = grades.size;
    if (!st.rows) { const e = new Error("فایل سوابق هیچ ردیف معتبری نداشت؛ هر ردیف باید تاریخ، کد قلم و تأمین‌کننده داشته باشد."); e.code = "EMPTY"; throw e; }

    /* ----- اقلام به تفکیک نوع قلم ----- */
    say("ساخت نوع‌های قلم…");
    /* نوع قلمِ مؤثر («ورق آهنی») → اقلامش؛ و شمار اقلامِ هر نوع قلمِ فایل، تا معلوم شود
       نوع قلمِ مؤثر همهٔ نوع قلمِ فایل است یا فقط بخشی از آن */
    const eff = (it) => N.byCode.get(it.code).eff;
    const heads = new Map(), srcN = new Map();
    for (const it of I.items) {
      if (!heads.has(eff(it))) heads.set(eff(it), []);
      heads.get(eff(it)).push(it);
      srcN.set(it.head, (srcN.get(it.head) || 0) + 1);
    }
    const headRows = [];
    for (const head of [...heads.keys()].sort()) {
      const its = heads.get(head).sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
      const src = [...new Set(its.map((x) => x.head))].sort();
      /* نرخ‌های تبدیل و واحد مرجع مال نوع قلمِ فایل‌اند و به همهٔ بخش‌هایش می‌رسند */
      const pick = (m) => Object.assign({}, ...src.map((h) => m.get(h) || {}).reverse());
      /* هیچ چیزِ وابسته به فایل سوابق این‌جا نمی‌آید (مثلاً شمار خریدها): وگرنه اثرانگشت فهرست
         با هر ردیف تازهٔ سوابق عوض می‌شد و هر بارگذاری ماهانه کل فهرست را از نو می‌نوشت */
      const top = {
        ref: src.map((h) => U.ref.get(h)).find(Boolean) || (its.find((x) => x.ref) || {}).ref || "عدد",
        n: its.length, hr: pick(U.hr), cr: pick(U.cr),
        /* src: نوع قلمِ فایل (ستون head ردیف‌های خرید)؛ sub: فقط بخشی از آن — جستجو با فهرست کدها */
        src, ...(src.reduce((s, h) => s + srcN.get(h), 0) !== its.length ? { sub: 1 } : {}),
        uc: N.uc.get(head) || {},
      };
      /* [کد، عنوان، خوشه، طبقهٔ اصناف، لایه‌ها (استاندارد)، باقیماندهٔ متن، نرخ ویژهٔ قلم] */
      const tuples = its.map((x) => JSON.stringify([x.code, x.title, x.cl, x.cls, N.byCode.get(x.code).attrs, x.residual || "", U.ir.get(x.code) || null]));
      /* بخش ۰ سرِ نوع قلم (واحد مرجع، نرخ‌ها) + نخستین اقلام؛ بخش‌های بعد فقط اقلام.
         تاپل‌ها یک بار stringify شده‌اند، پس JSON بخش دستی سر هم می‌شود. */
      const topJson = JSON.stringify(top);
      let part = 0, cur = [], size = utf8len(topJson) + 16;
      const flush = () => {
        const list = `"items":[${cur.join(",")}]`;
        headRows.push([head, part, part === 0 ? `${topJson.slice(0, -1)},${list}}` : `{${list}}`]);
        part++; cur = []; size = 16;
      };
      for (const t of tuples) {
        const n = utf8len(t) + 1;
        if (cur.length && size + n > PART_BYTES) flush();
        cur.push(t); size += n;
      }
      flush();
    }

    /* ----- کد قلم → نوع قلم ----- */
    const codeShards = new Map();
    for (const it of I.items) {
      const s = shardOf("code", it.code);
      if (!codeShards.has(s)) codeShards.set(s, {});
      codeShards.get(s)[it.code] = eff(it);
    }
    const codeRows = [...codeShards.keys()].sort().map((s) => [s, JSON.stringify(codeShards.get(s))]);

    /* ----- واژه → نوع‌های قلم (یافتن اقلام مشابه برای مدل) ----- */
    const wmap = new Map();
    const addWord = (w, head) => { if (!wmap.has(w)) wmap.set(w, new Set()); wmap.get(w).add(head); };
    for (const it of I.items) { for (const w of words(it.title)) addWord(w, eff(it)); for (const w of words(eff(it))) addWord(w, eff(it)); }
    const wordShards = new Map();
    for (const w of [...wmap.keys()].sort()) {
      const hs2 = [...wmap.get(w)].sort();
      if (hs2.length > MAX_WORD_HEADS) continue;
      const s = shardOf("word", w);
      if (!wordShards.has(s)) wordShards.set(s, {});
      wordShards.get(s)[w] = hs2;
    }
    const wordRows = [...wordShards.keys()].sort().map((s) => [s, JSON.stringify(wordShards.get(s))]);

    const indexRows = X.indices.map((x) => [x.code, x.name, x.source, x.series]);
    const classRows = X.classes.map((x) => [x.code, x.name, x.group_code, x.group_name, x.index_code]);
    const gradeRows = [...grades.values()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    /* نسخهٔ قواعد در اثرانگشت فهرست: قاعدهٔ تازه (جنس، واحد) فهرست را از نو می‌سازد حتی اگر
       فایل‌ها همان باشند؛ ردیف‌های خرید دست نمی‌خورند چون نوع قلمِ فایل را نگه می‌دارند */
    const rulesFp = hex8(fnv32(JSON.stringify([RL.HEAD_RULES, RL.MATERIALS, RL.UNITS, RL.QUANT, RL.LAYER_DEFAULT_UNIT])));
    const meta = { layers: I.layers, clusters: I.clusters, heads: headRows.filter((r) => r[1] === 0).length, items: I.items.length, words: wmap.size, rules: rulesFp, norm: N.st };

    /* ----- اثرانگشت‌ها -----
       cat  — هر چیزی که در جدول‌های فهرست اقلام می‌نشیند؛ عوض شد → فهرست از نو.
       adj  — آنچه روی ردیف خرید نوشته می‌شود (نوع قلمِ هر کد، شاخص هر طبقه)؛ عوض شد →
              ردیف‌های خرید هم باید از نو ساخته شوند، وگرنه ستون نوع قلم و قیمت تعدیل‌شده کهنه‌اند.
       rows — خودِ ردیف‌ها، مستقل از ترتیب؛ یکی بود → چیزی برای نوشتن نیست. */
    let cat = 0x811c9dc5;
    for (const set of [headRows, codeRows, wordRows, indexRows, classRows]) for (const r of set) cat = fnv32(r.join("\u0001"), cat);
    cat = fnv32(JSON.stringify(meta), cat);
    let adj = 0x811c9dc5;
    for (const it of [...I.items].sort((a, b) => (a.code < b.code ? -1 : 1))) adj = fnv32(`${it.code}\u0001${it.head}\u0001${classIdx.get(it.cls) || ""}`, adj);
    for (const x of X.indices) adj = fnv32(`${x.code}\u0001${x.series}`, adj);
    let gr = 0x811c9dc5;
    for (const r of gradeRows) gr = fnv32(r.join("\u0001"), gr);
    const fp = { cat: hex8(cat), adj: hex8(adj), rows: `${st.rows}-${hex8(s1)}${hex8(s2)}`, grades: hex8(gr) };

    return {
      meta, fp, stats: { ...st, items: I.items.length, heads: meta.heads, srcHeads: srcN.size, layers: I.layers.length, indices: indexRows.length, classes: classRows.length, norm: N.st },
      tables: { cat_heads: headRows, cat_codes: codeRows, cat_words: wordRows, price_index: indexRows, guild_classes: classRows, supplier_grades: gradeRows, purchases },
    };
  };

  /** ردیف‌ها → دسته‌های ارسال با سقف تقریبی بایت (نه تعداد): ردیف‌های فهرست اقلام تا ۴۰KB اند. */
  TP.chunkRows = function (rows, maxBytes = 300000, maxRows = 700) {
    const out = []; let cur = [], size = 0;
    for (const r of rows) {
      const n = utf8len(JSON.stringify(r));
      if (cur.length && (size + n > maxBytes || cur.length >= maxRows)) { out.push(cur); cur = []; size = 0; }
      cur.push(r); size += n;
    }
    if (cur.length) out.push(cur);
    return out;
  };
})();
