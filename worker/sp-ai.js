/**
 * «بررسی هوشمند» پیش‌فاکتورِ تأمین‌کننده (پنل تأمین‌کننده) — یک فراخوانیِ مدل، دو خروجی:
 *   ۱) همهٔ فیلدهای اجباریِ تب استعلامات از خودِ پیش‌فاکتور: مقدار، واحد، قیمت واحد (هر سطر)، زمان تحویل،
 *      شرایط تسویه، نوع فاکتور و ارزش افزوده (و اعتبار، حمل و محل تحویل اگر آمده).
 *   ۲) جدول تطابق: هر لایهٔ ویژگیِ قفل‌شده و هر فیلد اجباری، در برابرِ بستهٔ پیشنهادیِ تأمین‌کننده —
 *      ✅ همان در سند هست · ⚠️ پیدا نشد یا مدل مطمئن نیست · ❌ سند چیز دیگری گفته.
 * کارشناس می‌تواند ❌ (یا ⚠️ای که سند مقداری برایش دارد) را «بپذیرد»: پیش‌فاکتور ملاک می‌شود. برعکسش نه — عدد
 * و مشخصه‌ای که در سند نیست هرگز به تب استعلامات نمی‌رود (تصمیم مدیر، مهر ۱۴۰۵).
 *
 * همان مدلِ تصمیم مدیر (Haiku 4.5). سند با لینک امضاشدهٔ کوتاه‌عمر به مدل می‌رسد، نه از داخل Worker
 * (۱۰ میلی‌ثانیه CPU). هر اجرا هزینه دارد، پس فقط بعد از تأیید صریح کارشناس صدا زده می‌شود.
 */
import { MODEL } from "./extract.js";
import { HttpError } from "./http.js";
import { validDtime, normalizeDtime, VAT_RATE } from "./quote-rules.js";

const API = (env) => (env.ANTHROPIC_API_BASE || "https://api.anthropic.com") + "/v1/messages";
export const AI_VERSION = "sp-check/2.0";
/* بهای Haiku 4.5 (دلار برای هر میلیون توکن) — فقط برای گزارش هزینهٔ واقعیِ هر اجرا */
const PRICE_IN = 1, PRICE_OUT = 5;
/** برآوردی که پیش از اجرا به کارشناس گفته می‌شود: پیش‌فاکتور یکی‌دوصفحه‌ای ≈ ۳ تا ۸ هزار توکن ورودی */
export const AI_COST_HINT = "حدود ۰٫۰۱ تا ۰٫۰۳ دلار";

const T = (v) => String(v == null ? "" : v).trim();
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const faN = (s) => String(s).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[+d]);
const key = (x) => T(x).replace(/[ي]/g, "ی").replace(/[ك]/g, "ک").replace(/‌/g, " ").replace(/\s+/g, " ").toLowerCase();

const SURE = { type: "boolean", description: "با اطمینان خواندی؟ اگر رقم یا متن مبهم بود، یا حدس زدی، false" };
const val = (type, description, extra = {}) => ({
  type: "object", properties: { value: { type: [type, "null"], description, ...extra }, sure: SURE }, required: ["value", "sure"],
});

const TOOL = {
  name: "record_check",
  description: "مقدارهای خوانده‌شده از پیش‌فاکتور و سنجشِ آن‌ها با بستهٔ پیشنهادیِ تأمین‌کننده را ثبت می‌کند.",
  input_schema: {
    type: "object",
    properties: {
      readable: { type: "boolean", description: "آیا سند خوانا و واقعاً پیش‌فاکتور است؟" },
      reason: { type: ["string", "null"], description: "اگر readable=false، دلیلش به فارسی" },
      currency: { type: ["string", "null"], enum: ["ریال", "تومان", null], description: "واحد پولِ نوشته‌شده در سند (سرستونِ قیمت یا جمع)؛ حدس نزن" },
      vat_included: { type: ["boolean", "null"], description: "آیا قیمت‌های واحدِ سطرها ارزش افزوده را در خود دارند؟ اگر ارزش افزوده ته فاکتور جدا آمده false" },
      vat_rate: { type: ["number", "null"], description: "درصد ارزش افزودهٔ نوشته‌شده، مثلاً ۱۰" },
      delivery: val("string", "زمان تحویل، عیناً همان‌طور که نوشته شده (مثلاً «۱۰ روز کاری» یا «۱۴۰۵/۰۸/۰۱»)"),
      pay: {
        type: "object",
        properties: {
          value: { type: ["string", "null"], enum: ["نقدی", "اعتباری", "۵۰٪ پیش‌پرداخت", "سایر", null], description: "شرایط تسویه ریخته‌شده در فهرست ثابت" },
          text: { type: ["string", "null"], description: "متن کامل شرایط تسویه، عیناً" },
          sure: SURE,
        },
        required: ["value", "sure"],
      },
      invoice: val("string", "«غیر رسمی» فقط اگر خودِ سند صریح گفته؛ «رسمی» اگر صریح گفته؛ وگرنه null", { enum: ["رسمی", "غیر رسمی", null] }),
      vat: val("string", "آیا معامله ارزش افزوده دارد؟", { enum: ["دارد", "ندارد", null] }),
      valid_days: val("integer", "اعتبار پیش‌فاکتور به روز"),
      ship: val("string", "روش حمل، عیناً"),
      place: {
        type: "object",
        properties: {
          value: { type: ["string", "null"], enum: ["محل پروژه", "انبار شرکت", "سایر", null] },
          other: { type: ["string", "null"], description: "اگر سایر، نام همان محل" },
          sure: SURE,
        },
        required: ["value", "sure"],
      },
      lines: {
        type: "array",
        items: {
          type: "object",
          properties: {
            line_id: { type: "integer" },
            found: { type: "boolean", description: "این قلم در پیش‌فاکتور آمده است؟" },
            qty: val("number", "مقدارِ همین سطر در سند"),
            unit: {
              type: "object",
              properties: {
                value: { type: ["string", "null"], description: "واحدِ سطر در سند، عیناً" },
                same: { type: ["boolean", "null"], description: "آیا هم‌معنای واحدِ اعلامیِ تأمین‌کننده است؟ (کیلو = کیلوگرم، عدد = دستگاه نیست)" },
                sure: SURE,
              },
              required: ["value", "sure"],
            },
            unit_price: val("number", "قیمت واحد (فی) همین سطر، عیناً با واحد پولِ سند؛ تبدیل و حساب نکن. اگر سند فقط مبلغ کلِ سطر را دارد null"),
            total_price: { type: ["number", "null"], description: "مبلغ کلِ سطر، فقط اگر در سند نوشته شده" },
            layers: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "نامِ لایه، همان که در فهرست آمده" },
                  status: { type: "string", enum: ["explicit", "different", "missing"] },
                  seen: { type: ["string", "null"], description: "عینِ آنچه در سند برای این لایه آمده" },
                  sure: SURE,
                },
                required: ["name", "status", "sure"],
              },
            },
            note: { type: ["string", "null"] },
          },
          required: ["line_id", "found", "qty", "unit", "unit_price", "layers"],
        },
      },
      notes: { type: ["string", "null"] },
    },
    required: ["readable", "lines", "delivery", "pay", "invoice", "vat"],
  },
};

const SYSTEM = `تو پیش‌فاکتورِ یک تأمین‌کننده را می‌خوانی و با «بستهٔ پیشنهادیِ» همان تأمین‌کننده می‌سنجی. مقدارهایی که می‌خوانی مستقیم وارد جدول استعلام و کمیسیون خرید می‌شوند، پس:
۱. فقط آنچه در سند نوشته شده. اگر چیزی صریح نیامده null بگذار؛ حدس و استنتاج نکن. هر جا رقم یا متن مبهم بود sure=false.
۲. همهٔ فیلدهای اجباری را از سند بخوان: برای هر سطر مقدار، واحد و قیمت واحد (فی)؛ برای کل سند زمان تحویل، شرایط تسویه، نوع فاکتور و ارزش افزوده.
   همهٔ خانه‌های هر سطر را با سرستون‌هایشان بخوان — قیمت واحد معمولاً در ستونِ «فی»، «قیمت واحد» یا «مبلغ واحد» است. اگر فقط «مبلغ کل» سطر آمده، total_price را بنویس و unit_price را null بگذار.
   واحد پول را از سرستون یا جمعِ سند بفهم و تبدیل نکن. بگو قیمت‌ها ارزش افزوده را در خود دارند یا نه.
۳. لایه‌ها: explicit یعنی همان مقدار — یا معادلِ قطعیِ آن («۲ میل» = «۲ میلی‌متر»، «St37» = «فولاد St37») — برای همان قلم در سند آمده است،
   در شرح کالا، ستونی جدا، یا یادداشتی که صریحاً به همهٔ اقلام مربوط است. different یعنی مقدار دیگری آمده (عینش را در seen بیاور). missing یعنی نیامده.
۴. واحد: same=true اگر واحدِ سند هم‌معنای واحدِ اعلامی است، false اگر واحد دیگری است.
۵. نوع فاکتور را فقط اگر سند صریح گفته پر کن. اگر سند خوانا نیست یا پیش‌فاکتور نیست، readable=false و دلیلش.
زبان متن‌ها فارسی.`;

const lockedOf = (l) => parse(l.layers_json, []);
const extraOf = (l) => parse(l.extra_json, []);

export async function runAiCheck(env, { fileUrl, mime, lines }) {
  if (!env.ANTHROPIC_API_KEY) throw new HttpError("کلید مدل روی این پروژه ست نشده است.", 503);
  const list = lines.map((l) => `- line_id ${l.id} (کد ${l.no || l.id}): ${l.title}\n`
    + `  اعلامِ تأمین‌کننده: مقدار ${l.qty} ${l.unit || ""} · قیمت واحد ${l.price} ریال (بدون ارزش افزوده)\n`
    + `  لایه‌های قفل‌شدهٔ خریدار: ${lockedOf(l).map((x) => `${x.k} = ${x.v}`).join("؛ ") || "—"}\n`
    + `  لایه‌های افزودهٔ تأمین‌کننده: ${extraOf(l).map((x) => `${x.k} = ${x.v}`).join("؛ ") || "—"}`).join("\n");
  const doc = String(mime || "").startsWith("image/")
    ? { type: "image", source: { type: "url", url: fileUrl } }
    : { type: "document", source: { type: "url", url: fileUrl } };
  const body = {
    model: env.AI_MODEL || MODEL,
    max_tokens: 6000,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [{ role: "user", content: [doc, { type: "text", text: `بستهٔ پیشنهادیِ تأمین‌کننده:\n${list}\n\nمقدارهای سند و سنجش را با ابزار ثبت کن؛ برای هر line_id یک سطر و برای هر لایهٔ نام‌برده یک ردیف.` }] }],
  };
  const r = await fetch(API(env), {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(`مدل پاسخ نداد: ${String((d && d.error && d.error.message) || `خطای ${r.status}`).slice(0, 300)}`, r.status === 429 ? 429 : 502);
  const use = (d.content || []).find((c) => c.type === "tool_use");
  if (!use) throw new HttpError("مدل خروجی ساختاریافته برنگرداند.", 502);
  const u = d.usage || {};
  const cost = ((u.input_tokens || 0) * PRICE_IN + (u.output_tokens || 0) * PRICE_OUT) / 1e6;
  return judge(lines, use.input || {}, { model: d.model || body.model, tokens_in: u.input_tokens, tokens_out: u.output_tokens, cost_usd: Math.round(cost * 10000) / 10000 });
}

/* ------------------------------------------------------------------ */
/* جدول تطابق                                                            */
/* ------------------------------------------------------------------ */
const num = (x) => (x == null || x === "" || !Number.isFinite(Number(x)) ? null : Number(x));
const sureOf = (o) => !!(o && o.sure !== false);
const valOf = (o) => (o && typeof o === "object" ? o.value : o);
/* «همان»: مقدار دقیقاً برابر؛ قیمت تا یک ریالِ گرد کردن، و اگر سامانه ارزش افزوده را از قیمتِ سند کم کرده، تا ۰٫۰۲٪ */
const near = (a, b, rel = 0, abs = 0) => a != null && b != null && Math.abs(a - b) <= Math.max(abs, Math.abs(b) * rel);

/**
 * خروجی مدل ← جدول: هر ردیف {key, label, want (بستهٔ پیشنهادی), got (پیش‌فاکتور), status: ok|warn|bad, gate}.
 * قیمتِ سند به ریال و بی ارزش افزوده برگردانده می‌شود (ضرب و تقسیم کارِ قطعیِ سامانه است، نه مدل) تا با قیمتِ
 * اعلامیِ تأمین‌کننده سنجیده شود. gate=false یعنی ردیفِ اطلاعاتی (لایهٔ افزوده، اعتبار، حمل، محل تحویل).
 */
export function judge(lines, r, meta = {}) {
  const tooman = r.currency === "تومان";
  const rate = num(r.vat_rate) != null ? num(r.vat_rate) / 100 : VAT_RATE;
  const byId = new Map((Array.isArray(r.lines) ? r.lines : []).map((x) => [Number(x.line_id), x]));
  const outLines = lines.map((l) => {
    const x = byId.get(l.id) || { found: false, layers: [] };
    const found = !!x.found;
    const st = new Map((Array.isArray(x.layers) ? x.layers : []).map((y) => [key(y.name), y]));
    const layerRow = (w, kind) => {
      const y = st.get(key(w.k));
      const got = y && y.seen ? T(y.seen) : y && y.status === "explicit" ? w.v : null;
      let status = "warn";
      if (found && y) {
        if (y.status === "explicit") status = sureOf(y) ? "ok" : "warn";
        else if (y.status === "different") status = sureOf(y) ? "bad" : "warn";
      }
      return { key: `${kind === "extra" ? "X" : "L"}:${w.k}`, kind, label: w.k, want: w.v, got, status, gate: kind === "layer" };
    };
    const rows = [...lockedOf(l).map((w) => layerRow(w, "layer")), ...extraOf(l).map((w) => layerRow(w, "extra"))];
    /* مقدار */
    const q = num(valOf(x.qty));
    rows.push({ key: "qty", kind: "field", label: "مقدار", want: num(l.qty), got: q,
      status: !found || q == null || !sureOf(x.qty) ? "warn" : near(q, num(l.qty), 0, 1e-9) ? "ok" : "bad", gate: true });
    /* واحد */
    const uo = x.unit || {};
    const ug = T(valOf(uo)) || null;
    rows.push({ key: "unit", kind: "field", label: "واحد", want: T(l.unit) || null, got: ug,
      status: !found || !ug || !sureOf(uo) ? "warn" : uo.same === true || (uo.same == null && key(ug) === key(l.unit)) ? "ok" : "bad", gate: true });
    /* قیمت واحد — به ریال و بی ارزش افزوده */
    let p = num(valOf(x.unit_price));
    if (p == null && num(x.total_price) != null && q) p = num(x.total_price) / q;
    if (p != null && tooman) p *= 10;
    if (p != null && r.vat_included === true) p = p / (1 + rate);
    if (p != null) p = Math.round(p);
    rows.push({ key: "price", kind: "field", label: "قیمت واحد (ریال، بی ارزش افزوده)", want: num(l.price), got: p,
      status: !found || p == null || (x.unit_price && !sureOf(x.unit_price)) ? "warn" : near(p, num(l.price), r.vat_included === true ? 0.0002 : 0, 1) ? "ok" : "bad", gate: true });
    return { line_id: l.id, no: l.no || null, title: l.title, item_id: l.item_id, found, rows, note: x.note || null };
  });

  /* شرایط فاکتور: بستهٔ پیشنهادی چیزی برایشان ندارد؛ ✅ یعنی صریح در سند آمده، ⚠️ یعنی نیامده یا مطمئن نیست */
  const hrow = (k, label, o, gate, fmt) => {
    const v = valOf(o);
    const got = v == null || T(v) === "" ? null : fmt ? fmt(v, o) : v;
    return { key: k, kind: "terms", label, want: null, got, status: got == null || !sureOf(o) ? "warn" : "ok", gate };
  };
  const header = [];
  const dl = hrow("dtime", "زمان تحویل", r.delivery, true);
  /* زمانِ تحویلی که نه تاریخ شمسی است نه شمار روز، به جدول کمیسیون نمی‌رود — پذیرفتنی هم نیست */
  if (dl.got != null && !validDtime(dl.got)) { dl.status = "warn"; dl.note = "قالبِ تاریخ شمسی یا شمار روز نیست"; dl.noaccept = true; }
  if (dl.got != null && dl.status === "ok") dl.value = normalizeDtime(dl.got);
  header.push(dl);
  const pay = hrow("pay", "شرایط تسویه", r.pay, true);
  if (r.pay && r.pay.text) pay.text = T(r.pay.text);
  header.push(pay);
  /* نوع فاکتور: «رسمی است مگر خلافش ثابت شود» (قاعدهٔ شرکت) — سکوتِ سند یعنی رسمی */
  const inv = hrow("invoice", "نوع فاکتور", r.invoice, true);
  if (inv.got == null) { inv.got = "رسمی"; inv.status = "ok"; inv.def = true; }
  header.push(inv);
  header.push(hrow("vat", "ارزش افزوده", r.vat, true));
  header.push(hrow("valid_days", "اعتبار پیش‌فاکتور (روز)", r.valid_days, false));
  header.push(hrow("ship", "روش حمل", r.ship, false));
  const pl = hrow("place", "محل تحویل", r.place, false);
  if (pl.got === "سایر" && r.place && r.place.other) pl.other = T(r.place.other);
  header.push(pl);

  const out = {
    v: AI_VERSION, readable: r.readable !== false, reason: r.reason || null, currency: r.currency || null,
    vat_included: r.vat_included == null ? null : !!r.vat_included, lines: outLines, header, notes: r.notes || null, at: Date.now(), ...meta,
  };
  out.ok = resolve(out, {}).ready;
  return out;
}

/** ردیف را می‌شود «پذیرفت» (پیش‌فاکتور ملاک) اگر سند برایش مقداری دارد و ✅ نیست */
export const acceptable = (row) => row.status !== "ok" && row.got != null && row.got !== "" && !row.noaccept;
const lineKey = (lineId, row) => `${lineId}|${row.key}`;
const headKey = (row) => `h|${row.key}`;

/**
 * پذیرش‌های کارشناس روی جدول ← آیا تأیید نهایی ممکن است، و مقدارهایی که به تب استعلامات می‌روند.
 * فقط از پیش‌فاکتور: ✅ (همان) یا پذیرفته‌شده (مقدارِ سند). ردیفِ دروازه‌ای که نه این است نه آن، مانع است.
 */
export function resolve(ai, accept) {
  const acc = accept || {};
  const problems = [];
  if (!ai) return { ready: false, problems: ["بررسی هوشمند پیش‌فاکتور هنوز انجام نشده است"], lines: [], terms: {} };
  if (ai.readable === false) return { ready: false, problems: [`پیش‌فاکتور خوانا نبود${ai.reason ? ` (${ai.reason})` : ""}`], lines: [], terms: {} };
  const take = (row, k) => {
    if (row.status === "ok") return { use: true, value: row.got != null ? row.got : row.want, accepted: false };
    if (acc[k] && acceptable(row)) return { use: true, value: row.got, accepted: true };
    return { use: false };
  };
  const lines = (ai.lines || []).map((ln) => {
    const tag = `«${ln.title}»${ln.no ? ` (کد ${faN(ln.no)})` : ""}`;
    if (!ln.found) problems.push(`${tag} در پیش‌فاکتور پیدا نشد`);
    const values = { spec: [] };
    for (const row of ln.rows || []) {
      const t = take(row, lineKey(ln.line_id, row));
      if (row.kind === "layer" || row.kind === "extra") {
        if (t.use) values.spec.push({ k: row.label, v: row.status === "ok" ? row.want : t.value });
        else if (row.gate) problems.push(`${tag}: «${row.label}» ${row.status === "bad" ? "با پیش‌فاکتور فرق دارد" : "در پیش‌فاکتور نیامده یا مطمئن نیست"}`);
        continue;
      }
      if (t.use) values[row.key] = row.key === "unit" && row.status === "ok" ? (row.want || row.got) : t.value;
      else if (row.gate) problems.push(`${tag}: «${row.label}» ${row.status === "bad" ? "با پیش‌فاکتور فرق دارد" : "در پیش‌فاکتور نیامده یا مطمئن نیست"}`);
    }
    return { line_id: ln.line_id, item_id: ln.item_id, values };
  });
  const terms = {};
  for (const row of ai.header || []) {
    const t = take(row, headKey(row));
    if (t.use) {
      terms[row.key] = row.key === "dtime" ? (validDtime(t.value) ? normalizeDtime(t.value) : null) : t.value;
      if (row.key === "dtime" && terms.dtime == null && row.gate) problems.push("زمان تحویلِ سند قالبِ تاریخ شمسی یا شمار روز ندارد");
      if (row.key === "place" && row.other) terms.place_other = row.other;
    } else if (row.gate) {
      problems.push(row.noaccept && row.got != null
        ? `«${row.label}» در پیش‌فاکتور «${row.got}» آمده — ${row.note || "قالبش پذیرفتنی نیست"}`
        : `«${row.label}» در پیش‌فاکتور نیامده یا مطمئن نیست`);
    }
  }
  return { ready: problems.length === 0, problems, lines, terms };
}

export { lineKey, headKey };
