/**
 * «بررسی هوشمند» پیش‌فاکتورِ تأمین‌کننده (پنل تأمین‌کننده) — دو کار در یک فراخوانیِ مدل:
 *   ۱) آیا تک‌تکِ لایه‌های قفل‌شدهٔ هر قلم در پیش‌فاکتور صریح آمده است؟
 *   ۲) مقدار، واحد، قیمت و شرایط فاکتور — مثل استخراج قبلی (worker/extract.js) — تا خط استعلام پر شود.
 *
 * همان مدلِ تصمیم مدیر (Haiku 4.5). سند با لینک امضاشدهٔ کوتاه‌عمر به مدل می‌رسد، نه از داخل Worker
 * (۱۰ میلی‌ثانیه CPU). هیچ‌چیز این‌جا ذخیره نمی‌شود؛ sp-core.saveAi نتیجه را روی بسته می‌گذارد.
 * هر اجرا هزینه دارد، پس فقط بعد از تأیید صریح کارشناس صدا زده می‌شود (پنجرهٔ هزینه در پنل و بات).
 */
import { MODEL } from "./extract.js";
import { HttpError } from "./http.js";

const API = (env) => (env.ANTHROPIC_API_BASE || "https://api.anthropic.com") + "/v1/messages";
export const AI_VERSION = "sp-check/1.0";
/* بهای Haiku 4.5 (دلار برای هر میلیون توکن) — فقط برای گزارش هزینهٔ واقعیِ هر اجرا */
const PRICE_IN = 1, PRICE_OUT = 5;
/** برآوردی که پیش از اجرا به کارشناس گفته می‌شود: پیش‌فاکتور یکی‌دوصفحه‌ای ≈ ۳ تا ۸ هزار توکن ورودی */
export const AI_COST_HINT = "حدود ۰٫۰۱ تا ۰٫۰۳ دلار";

const T = (v) => String(v == null ? "" : v).trim();
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const key = (x) => T(x).replace(/[ي]/g, "ی").replace(/[ك]/g, "ک").replace(/‌/g, " ").replace(/\s+/g, " ").toLowerCase();

const TOOL = {
  name: "record_check",
  description: "نتیجهٔ سنجشِ پیش‌فاکتور با مشخصاتِ خواسته‌شده را ثبت می‌کند.",
  input_schema: {
    type: "object",
    properties: {
      readable: { type: "boolean", description: "آیا سند خوانا و واقعاً پیش‌فاکتور است؟" },
      reason: { type: ["string", "null"], description: "اگر readable=false، دلیلش به فارسی" },
      currency: { type: ["string", "null"], enum: ["ریال", "تومان", null], description: "واحد پولِ نوشته‌شده در سند؛ حدس نزن" },
      delivery: { type: ["string", "null"], description: "زمان تحویل، عیناً همان‌طور که نوشته شده" },
      pay_class: { type: ["string", "null"], enum: ["نقدی", "اعتباری", "۵۰٪ پیش‌پرداخت", "سایر", null] },
      invoice_type: { type: ["string", "null"], enum: ["رسمی", "غیر رسمی", null], description: "«غیر رسمی» فقط اگر خودِ سند صریح گفته باشد" },
      vat_status: { type: ["string", "null"], enum: ["دارد", "ندارد", null] },
      valid_days: { type: ["integer", "null"], description: "اعتبار پیش‌فاکتور به روز" },
      ship: { type: ["string", "null"], description: "روش حمل" },
      place: { type: ["string", "null"], enum: ["محل پروژه", "انبار شرکت", "سایر", null] },
      lines: {
        type: "array",
        items: {
          type: "object",
          properties: {
            line_id: { type: "integer" },
            found: { type: "boolean", description: "این قلم در پیش‌فاکتور آمده است؟" },
            qty: { type: ["number", "null"] },
            unit: { type: ["string", "null"] },
            unit_price: { type: ["number", "null"], description: "عیناً با واحد پولِ سند؛ تبدیل و حساب نکن" },
            total_price: { type: ["number", "null"], description: "فقط اگر در سند نوشته شده" },
            layers: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "نامِ لایه، همان که در فهرست آمده" },
                  status: { type: "string", enum: ["explicit", "different", "missing"] },
                  seen: { type: ["string", "null"], description: "عینِ آنچه در سند برای این لایه آمده" },
                },
                required: ["name", "status"],
              },
            },
            note: { type: ["string", "null"] },
          },
          required: ["line_id", "found", "layers"],
        },
      },
      notes: { type: ["string", "null"] },
    },
    required: ["readable", "lines"],
  },
};

const SYSTEM = `تو پیش‌فاکتورِ یک تأمین‌کننده را با مشخصاتی که کارشناس خرید خواسته می‌سنجی. نتیجهٔ تو تعیین می‌کند «تأیید نهایی» ممکن است یا نه؛ پس:
۱. فقط آنچه در سند نوشته شده. اگر مقدارِ یک لایه در سند صریح نیامده، missing بگذار؛ حدس و استنتاج نکن.
۲. explicit یعنی همان مقدار — یا معادلِ قطعیِ آن (مثلاً «۲ میل» = «۲ میلی‌متر»، «St37» = «فولاد St37») — برای همان قلم در سند آمده است:
   در شرح کالا، در ستونی جدا، یا در یادداشتی که صریحاً به همهٔ اقلام مربوط است. همهٔ خانه‌های سطر را با سرستون‌هایشان بخوان.
۳. different یعنی مقدارِ دیگری نوشته شده؛ عینِ آن را در seen بیاور.
۴. مقدار، واحد، قیمت واحد و مبلغ کل را عیناً همان‌طور که نوشته شده بیاور؛ حساب نکن و واحد پول را تبدیل نکن.
۵. شرایط فاکتور (زمان تحویل، تسویه، نوع فاکتور، ارزش افزوده، اعتبار، حمل، محل تحویل) را فقط اگر در سند هست بیاور؛ وگرنه null.
۶. اگر سند خوانا نیست یا پیش‌فاکتور نیست، readable=false و دلیلش.
زبان متن‌ها فارسی.`;

/** لایه‌هایی که باید صریح باشند: فقط لایه‌های قفل‌شدهٔ کارشناس (لایه‌های افزودهٔ تأمین‌کننده خواستهٔ ما نیست) */
const wanted = (l) => parse(l.layers_json, []);

export async function runAiCheck(env, { fileUrl, mime, lines }) {
  if (!env.ANTHROPIC_API_KEY) throw new HttpError("کلید مدل روی این پروژه ست نشده است.", 503);
  const list = lines.map((l) => `- line_id ${l.id}: ${l.title} — تأمین‌کننده اعلام کرده: ${l.qty} ${l.unit || ""}، قیمت واحد ${l.price} ریال\n`
    + `  لایه‌هایی که باید صریح در سند باشند: ${wanted(l).map((x) => `${x.k} = ${x.v}`).join("؛ ") || "—"}`).join("\n");
  const doc = String(mime || "").startsWith("image/")
    ? { type: "image", source: { type: "url", url: fileUrl } }
    : { type: "document", source: { type: "url", url: fileUrl } };
  const body = {
    model: env.AI_MODEL || MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [{ role: "user", content: [doc, { type: "text", text: `اقلام این پیش‌فاکتور و مشخصاتِ خواسته‌شده:\n${list}\n\nنتیجه را با ابزار ثبت کن؛ برای هر line_id یک سطر.` }] }],
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

/**
 * خروجی مدل → حکم: ok فقط اگر سند خوانا، هر قلم پیدا، همهٔ لایه‌های قفل «صریح»، و مقدار و قیمت در سند باشد.
 * قیمتِ تومانی به ریال برمی‌گردد (ضرب در ۱۰ کارِ قطعی است، نه کار مدل) تا با قیمتِ اعلامیِ تأمین‌کننده سنجیده شود.
 */
export function judge(lines, r, meta = {}) {
  const toRial = (v) => (v == null ? null : r.currency === "تومان" ? v * 10 : v);
  const byId = new Map((Array.isArray(r.lines) ? r.lines : []).map((x) => [Number(x.line_id), x]));
  const out = lines.map((l) => {
    const x = byId.get(l.id) || { found: false, layers: [] };
    const st = new Map((Array.isArray(x.layers) ? x.layers : []).map((y) => [key(y.name), y]));
    const layers = wanted(l).map((w) => { const y = st.get(key(w.k)); return { k: w.k, v: w.v, status: y ? y.status : "missing", seen: y && y.seen ? T(y.seen) : null }; });
    const qty = x.qty == null ? null : Number(x.qty);
    const price = x.unit_price != null ? toRial(Number(x.unit_price)) : (x.total_price != null && qty ? toRial(Number(x.total_price)) / qty : null);
    return {
      line_id: l.id, title: l.title, found: !!x.found, layers, qty, unit: x.unit || null, unit_price: price,
      qty_match: qty != null && l.qty != null ? Math.abs(qty - Number(l.qty)) < 1e-9 : null,
      price_match: price != null && l.price != null ? Math.abs(price - Number(l.price)) <= Math.max(1, Number(l.price) * 0.001) : null,
      note: x.note || null,
    };
  });
  const ok = r.readable !== false && out.length > 0
    && out.every((x) => x.found && x.layers.every((y) => y.status === "explicit") && x.qty != null && x.unit_price != null);
  return {
    v: AI_VERSION, ok, readable: r.readable !== false, reason: r.reason || null, currency: r.currency || null,
    header: { delivery: r.delivery || null, pay: r.pay_class || null, invoice: r.invoice_type || null, vat: r.vat_status || null,
      valid_days: r.valid_days == null ? null : r.valid_days, ship: r.ship || null, place: r.place || null },
    lines: out, notes: r.notes || null, at: Date.now(), ...meta,
  };
}
