/**
 * «خوانش هوشمند» پیش‌فاکتورِ تأمین‌کننده (پنل تأمین‌کننده) — یک فراخوانیِ مدل، دو خروجی:
 *   ۱) همهٔ فیلدهای اجباریِ تب استعلامات از خودِ پیش‌فاکتور: مقدار، واحد، قیمت واحد (هر سطر)، زمان تحویل،
 *      شرایط تسویه، نوع فاکتور و ارزش افزوده (و اعتبار، حمل و محل تحویل اگر آمده).
 *   ۲) جدول تطابق: هر لایهٔ ویژگی، هر فیلد اجباری و هر شرطِ اعلامی، در برابرِ بستهٔ پیشنهادیِ تأمین‌کننده —
 *      ✅ همان · ⚠️ مطمئن نیست · ⚪ مطمئن است که در سند نیامده · ❌ مطمئن است که فرق دارد.
 * کارشناس هر ردیفِ غیرسبز را می‌تواند تیک بزند: پیش‌فاکتور به‌جای درخواست ملاک می‌شود — مقدارِ سند، و اگر سند
 * چیزی نگفته، خالی. برعکسش نه: عدد و مشخصه‌ای که در سند نیست هرگز به تب استعلامات نمی‌رود (تصمیم مدیر، مهر ۱۴۰۵).
 *
 * درسِ آزمون مهر ۱۴۰۵ («گریس نسوز کیلویی» پیدا نشد و قیمتش هم خوانده نشد): مدل عنوان‌ها را عین‌به‌عین می‌سنجید.
 * حالا هر قلم با نوع قلم و لایه‌هایش به مدل می‌رسد و مدل باید سطرِ سند را از دریچهٔ همین لایه‌ها بخواند؛ کلیدِ
 * قلم‌ها «L1…» است (نه شمارهٔ ردیفِ سند)، و هر عدد هم عدد برمی‌گردد هم عینِ متنِ سند، تا جداکننده و رقم فارسی
 * خوانش را نخواباند.
 *
 * همان مدلِ تصمیم مدیر (Haiku 4.5). سند با لینک امضاشدهٔ کوتاه‌عمر به مدل می‌رسد، نه از داخل Worker
 * (۱۰ میلی‌ثانیه CPU). فقط بعد از تأیید صریح کارشناس صدا زده می‌شود؛ هزینه به کاربر گفته نمی‌شود.
 */
import { MODEL } from "./extract.js";
import { HttpError } from "./http.js";
import { validDtime, normalizeDtime, VAT_RATE, ENUMS } from "./quote-rules.js";
import { aiFetch } from "./ai-fetch.js";

const API = (env) => (env.ANTHROPIC_API_BASE || "https://api.anthropic.com") + "/v1/messages";
export const AI_VERSION = "sp-check/3.0";
/* جدولِ نسخهٔ ۲ همین شکل را دارد (بی ⚪ و بی سنجشِ شرایطِ اعلامی) و هنوز خوانده می‌شود */
const READABLE = new Set(["sp-check/2.0", AI_VERSION]);
export const aiUsable = (ai) => !!(ai && READABLE.has(ai.v));
/* بهای Haiku 4.5 (دلار برای هر میلیون توکن) — فقط برای ثبتِ درونیِ هر اجرا؛ به کاربر نشان داده نمی‌شود */
const PRICE_IN = 1, PRICE_OUT = 5;

const T = (v) => String(v == null ? "" : v).trim();
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const FA = "۰۱۲۳۴۵۶۷۸۹", AR = "٠١٢٣٤٥٦٧٨٩";
const faN = (s) => String(s).replace(/\d/g, (d) => FA[+d]);
const latin = (s) => String(s).replace(/[۰-۹]/g, (d) => FA.indexOf(d)).replace(/[٠-٩]/g, (d) => AR.indexOf(d));
const key = (x) => T(x).replace(/[ي]/g, "ی").replace(/[ك]/g, "ک").replace(/[‌‏‎]/g, " ").replace(/\s+/g, " ").toLowerCase();

/**
 * عدد از هر شکلی که مدل یا سند نوشته باشد: 1250000 · "1,250,000" · "۱٬۲۵۰٬۰۰۰ ریال" · "1.250.000" · "۱۲٫۵".
 * درسِ مهر ۱۴۰۵: مدل قیمت را گاهی رشته با جداکننده برمی‌گرداند و Number() آن را NaN می‌کرد.
 */
export function numOf(x) {
  if (x == null || x === "") return null;
  if (typeof x === "number") return Number.isFinite(x) ? x : null;
  const s = latin(String(x)).replace(/[\s‌‎‏]/g, "").replace(/[٬،']/g, ",").replace(/٫/g, ".");
  const m = /\d[\d,.]*/.exec(s);
  if (!m) return null;
  let t = m[0].replace(/[.,]+$/, "");
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, "");
  else if (/^\d{1,3}(\.\d{3}){2,}(,\d+)?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(",", ".");
  else t = t.replace(/,/g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const SURE = { type: "boolean", description: "با اطمینان خواندی؟ اگر رقم یا متن مبهم بود، یا حدس زدی، false" };
const NUM = (description) => ({
  type: "object",
  properties: {
    value: { type: ["number", "null"], description: `${description} — با رقم انگلیسی و بی جداکنندهٔ هزارگان؛ اگر در سند نیامده null` },
    text: { type: ["string", "null"], description: "عینِ نوشتهٔ سند برای همین عدد" },
    sure: SURE,
  },
  required: ["value", "sure"],
});
const TERM = (description, values) => ({
  type: "object",
  properties: {
    value: { type: ["string", "null"], description, ...(values ? { enum: [...values, null] } : {}) },
    same: { type: ["boolean", "null"], description: "با شرطِ اعلامیِ تأمین‌کننده هم‌معناست؟ اگر اعلامی نیست یا در سند نیامده null" },
    sure: SURE,
  },
  required: ["value", "sure"],
});

const TOOL = {
  name: "record_check",
  description: "مقدارهای خوانده‌شده از پیش‌فاکتور و سنجشِ آن‌ها با بستهٔ پیشنهادیِ تأمین‌کننده را ثبت می‌کند.",
  input_schema: {
    type: "object",
    properties: {
      readable: { type: "boolean", description: "آیا سند خوانا و واقعاً پیش‌فاکتور است؟" },
      reason: { type: ["string", "null"], description: "اگر readable=false، دلیلش به فارسی" },
      currency: { type: ["string", "null"], enum: ["ریال", "تومان", null], description: "واحد پولِ قیمت‌های سند (از سرستون، جمع یا متن)؛ حدس نزن" },
      vat_included: { type: ["boolean", "null"], description: "قیمت‌های واحدِ سطرها ارزش افزوده را در خود دارند؟ اگر ارزش افزوده ته فاکتور جدا آمده false" },
      vat_rate: { type: ["number", "null"], description: "درصد ارزش افزودهٔ نوشته‌شده، مثلاً 10" },
      delivery: TERM("زمان تحویل، عیناً همان‌طور که در سند نوشته شده (مثلاً «۱۰ روز کاری» یا «۱۴۰۵/۰۸/۰۱»)"),
      pay: {
        type: "object",
        properties: {
          value: { type: ["string", "null"], enum: [...ENUMS.pay, null], description: "شرایط تسویه، ریخته‌شده در فهرست ثابت" },
          text: { type: ["string", "null"], description: "متن کامل شرایط تسویه، عیناً" },
          same: { type: ["boolean", "null"], description: "با شرطِ اعلامیِ تأمین‌کننده هم‌معناست؟" },
          sure: SURE,
        },
        required: ["value", "sure"],
      },
      invoice: TERM("نوع فاکتور — فقط اگر خودِ سند صریح گفته؛ وگرنه null", ENUMS.invoice),
      vat: TERM("آیا معامله ارزش افزوده دارد؟", ENUMS.vat),
      valid_days: {
        type: "object",
        properties: {
          value: { type: ["integer", "null"], description: "اعتبار پیش‌فاکتور به روز" },
          same: { type: ["boolean", "null"] },
          sure: SURE,
        },
        required: ["value", "sure"],
      },
      ship: TERM("روش حمل، عیناً"),
      place: {
        type: "object",
        properties: {
          value: { type: ["string", "null"], enum: [...ENUMS.place, null] },
          other: { type: ["string", "null"], description: "اگر سایر، نام همان محل" },
          sure: SURE,
        },
        required: ["value", "sure"],
      },
      lines: {
        type: "array",
        description: "برای هر قلمِ بسته دقیقاً یک خروجی، با همان کلید",
        items: {
          type: "object",
          properties: {
            key: { type: "string", description: "کلیدِ قلم در فهرستِ بسته، مثل «L1» — نه شمارهٔ ردیفِ سند" },
            found: { type: "boolean", description: "سطری از همین نوعِ کالا در سند هست؟ (بند الف-۵)" },
            doc_title: { type: ["string", "null"], description: "عنوانِ همان سطر در سند، عیناً" },
            qty: NUM("مقدارِ همین سطر"),
            unit: {
              type: "object",
              properties: {
                value: { type: ["string", "null"], description: "واحدِ همین سطر در سند، عیناً" },
                same: { type: ["boolean", "null"], description: "هم‌معنای واحدِ اعلامی است؟ (کیلو = کیلوگرم؛ «کیلویی» در عنوان یعنی واحدِ کیلوگرم)" },
                sure: SURE,
              },
              required: ["value", "sure"],
            },
            unit_price: NUM("قیمت واحد (فی) همین سطر با واحد پولِ سند؛ تبدیل و حساب نکن. اگر سند فقط مبلغ کلِ سطر را دارد null"),
            total_price: NUM("مبلغ کلِ همین سطر، فقط اگر در سند نوشته شده"),
            layers: {
              type: "array",
              description: "برای هر لایهٔ نام‌برده (قفل و افزوده) یک ردیف",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "نامِ لایه، همان که در فهرست آمده" },
                  status: { type: "string", enum: ["explicit", "different", "missing"] },
                  seen: { type: ["string", "null"], description: "عینِ آنچه در سند برای این لایه آمده (یا آنچه به این لایه نسبت دادی)" },
                  sure: SURE,
                },
                required: ["name", "status", "sure"],
              },
            },
            note: { type: ["string", "null"] },
          },
          required: ["key", "found", "qty", "unit", "unit_price", "layers"],
        },
      },
      notes: { type: ["string", "null"] },
    },
    required: ["readable", "lines", "delivery", "pay", "invoice", "vat"],
  },
};

const SYSTEM = `تو پیش‌فاکتورِ یک تأمین‌کننده را می‌خوانی و با «بستهٔ پیشنهادیِ» همان تأمین‌کننده می‌سنجی. خروجیِ تو مستقیم به جدول استعلام و کمیسیون خرید می‌رود.

الف) هر قلمِ بسته با «نوع قلم» و «لایه‌های ویژگی» تعریف شده، نه با عینِ عنوانش. سطرهای سند را از دریچهٔ همین لایه‌ها بخوان، نه با مقایسهٔ واژه‌به‌واژهٔ عنوان‌ها:
۱. عنوانِ هر سطرِ سند را به اجزایش بشکن: اسمِ کالا، صفت‌ها، عددها و اندازه‌ها، واحد و شکلِ فروش، برند و استاندارد.
۲. هر جزء را به لایه‌ای نسبت بده که از نظرِ معنا به آن مربوط است، حتی اگر نامِ لایه در سند نیامده باشد. صفتی که جنس، رده، کاربرد، مقاومت یا ویژگیِ کالا را می‌گوید، مقدارِ همان لایه است؛ مثلاً اگر لایهٔ «جنس» مقدارِ «نسوز» دارد، «نسوز» در عنوانِ سند همان لایه است.
۳. واژه‌هایی که شکل یا مقدارِ فروش را می‌گویند — صفتِ نسبیِ ساخته از یک واحد مثل «کیلویی»، «متری»، «لیتری»، «شاخه‌ای»، «کارتنی»، یا «بستهٔ ۲۰ تایی» — دربارهٔ واحد یا بسته‌بندیِ کلِ قلم‌اند، نه جنس یا نام. آن‌ها را با ستونِ واحد و مقدارِ سند بسنج: «کیلویی» یعنی واحدِ فروش کیلوگرم است، و اگر سند همان کالا را به کیلو فروخته، آن لایه و آن واحد برقرارند.
۴. هم‌معناها، مخفف‌ها، املای دیگر، فارسی و انگلیسی، با یا بی فاصله و ترتیبِ دیگرِ واژه‌ها یکی‌اند (کیلو = کیلوگرم = kg؛ «۲ میل» = «۲ میلی‌متر»؛ St37 = فولاد St37).
۵. سطری از سند «همان قلم» است اگر نوعِ کالا یکی باشد و هیچ لایه‌ای آشکارا نقض نشود؛ لازم نیست همهٔ لایه‌ها در سند آمده باشند و لازم نیست عنوان‌ها شبیه باشند. found=false فقط وقتی است که در سند هیچ سطری از این نوعِ کالا نیست. اگر چند سطر نامزدند، آن را بگیر که لایه‌های بیشتری با آن جور است.
این‌ها مثال‌اند، نه فهرستِ کامل: همین منطق را برای هر کالا و هر لایه‌ای به کار ببر و صلب برخورد نکن.

ب) وضعیتِ هر لایه برای سطرِ پیداشده:
- explicit: مقدارِ لایه یا معادلِ قطعیِ آن برای همان سطر در سند هست — در عنوان، ستونی جدا، یا یادداشتی که صریحاً به همهٔ اقلام مربوط است. عینِ نوشتهٔ سند را در seen بیاور.
- different: سند برای همین لایه مقدارِ دیگری گفته؛ عینش را در seen بیاور.
- missing: در سند هیچ نشانی از این لایه نیست.
sure=false هر جا رقم یا متن مبهم است، سند ناخواناست، یا نسبت دادن به لایه را حدس زده‌ای. اگر مطمئنی که نیامده: missing با sure=true.

پ) مقدار، واحد و قیمتِ هر سطر:
- مقدار، واحد و قیمتِ واحد را از همان سطر بخوان. قیمتِ واحد معمولاً ستونِ «فی»، «قیمت واحد»، «مبلغ واحد» یا «بها» است؛ همهٔ خانه‌های سطر را با سرستون‌هایشان بخوان. اگر فقط مبلغِ کلِ سطر آمده، total_price را پر کن و unit_price را null بگذار.
- در value عدد را با رقم انگلیسی و بی جداکنندهٔ هزارگان بنویس (مثلاً 1250000)، و در text عینِ نوشتهٔ سند را بیاور. تبدیل و حساب نکن.
- واحد پول (ریال یا تومان) را از سرستون، جمع یا متنِ سند بفهم و بگو قیمت‌های واحد ارزش افزوده را در خود دارند یا نه.
- unit.same=true اگر واحدِ سند هم‌معنای واحدِ اعلامی است (بند الف-۳ را هم در نظر بگیر).

ت) شرایطِ فاکتور برای کلِ سند: زمان تحویل، شرایط تسویه، نوع فاکتور، ارزش افزوده و اعتبار؛ و اگر آمده روش حمل و محل تحویل. هر کدام را با شرطِ اعلامیِ تأمین‌کننده بسنج و same را بگو. نوع فاکتور را فقط اگر سند صریح گفته پر کن. اگر شرطی در سند نیامده value=null، و اگر مطمئنی که نیامده sure=true.

ث) فقط آنچه در سند آمده؛ حدس نزن. اگر سند خوانا نیست یا پیش‌فاکتور نیست، readable=false و دلیلش. کلیدِ هر قلم همان «L…» است که در فهرستِ بسته آمده — شمارهٔ ردیفِ سند را کلید نکن. برای هر قلمِ بسته دقیقاً یک خروجی و برای هر لایهٔ نام‌برده یک ردیف بده. زبانِ متن‌ها فارسی.`;

const lockedOf = (l) => parse(l.layers_json, []);
const extraOf = (l) => parse(l.extra_json, []);
const listTxt = (xs) => (xs.length ? xs.map((x) => `${x.k} = ${x.v}`).join(" · ") : "—");
const termsTxt = (t) => {
  if (!t) return "اعلام نشده";
  const parts = [t.dtime && `زمان تحویل «${t.dtime}»`, t.pay && `تسویه «${t.pay}»`, t.invoice && `نوع فاکتور «${t.invoice}»`, t.vat && `ارزش افزوده «${t.vat}»`,
    t.valid_days != null && t.valid_days !== "" && `اعتبار «${t.valid_days}» روز`].filter(Boolean);
  return parts.length ? parts.join(" · ") : "اعلام نشده";
};

/** متنِ بستهٔ پیشنهادی برای مدل: هر قلم با کلیدِ L، نوع قلم، لایه‌های قفل و افزوده، و اعلامِ تأمین‌کننده */
export function bundlePrompt(lines, terms) {
  const list = lines.map((l, i) => [
    `[L${i + 1}] عنوانِ ثبت‌شده: «${l.title}»`,
    `  نوع قلم: ${l.head || "—"}`,
    `  لایه‌های ویژگیِ قفل‌شدهٔ خریدار: ${listTxt(lockedOf(l))}`,
    `  لایه‌های افزودهٔ تأمین‌کننده: ${listTxt(extraOf(l))}`,
    `  اعلامِ تأمین‌کننده: مقدار ${l.qty ?? "—"} · واحد «${l.unit || "—"}» · قیمت واحد ${l.price ?? "—"} ریال بی ارزش افزوده`,
  ].join("\n")).join("\n\n");
  return `بستهٔ پیشنهادیِ تأمین‌کننده (هر قلم با کلیدش):\n${list}\n\nشرایطِ اعلامیِ تأمین‌کننده برای کلِ بسته: ${termsTxt(terms)}\n\n`
    + "مقدارهای سند و سنجش را با ابزار ثبت کن: برای هر کلید یک قلم، و برای هر لایه یک ردیف.";
}

export async function runAiCheck(env, { fileUrl, mime, lines, terms }) {
  if (!env.ANTHROPIC_API_KEY) throw new HttpError("کلید مدل روی این پروژه ست نشده است.", 503);
  const doc = String(mime || "").startsWith("image/")
    ? { type: "image", source: { type: "url", url: fileUrl } }
    : { type: "document", source: { type: "url", url: fileUrl } };
  const body = {
    model: env.AI_MODEL || MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [{ role: "user", content: [doc, { type: "text", text: bundlePrompt(lines, terms) }] }],
  };
  const r = await aiFetch(env, API(env), {
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
  return judge(lines, use.input || {}, { model: d.model || body.model, tokens_in: u.input_tokens, tokens_out: u.output_tokens, cost_usd: Math.round(cost * 10000) / 10000 }, terms);
}

/* ------------------------------------------------------------------ */
/* جدول تطابق                                                            */
/* ------------------------------------------------------------------ */
const sureOf = (o) => !!(o && o.sure !== false);
const valOf = (o) => (o && typeof o === "object" ? o.value : o);
const numIn = (o) => { const v = numOf(valOf(o)); return v != null ? v : numOf(o && typeof o === "object" ? o.text : null); };
/* «همان»: مقدار دقیقاً برابر؛ قیمت تا یک ریالِ گرد کردن، و اگر سامانه ارزش افزوده را از قیمتِ سند کم کرده، تا ۰٫۰۲٪ */
const near = (a, b, rel = 0, abs = 0) => a != null && b != null && Math.abs(a - b) <= Math.max(abs, Math.abs(b) * rel);
/* واحدهای هم‌معنا وقتی مدل خودش نگفته (same=null) */
const UNIT_SYN = { "کیلو": "کیلوگرم", "کیلو گرم": "کیلوگرم", "kg": "کیلوگرم", "کیلوگرم": "کیلوگرم", "گرم": "گرم", "g": "گرم", "تن": "تن", "ton": "تن",
  "متر": "متر", "m": "متر", "لیتر": "لیتر", "l": "لیتر", "lit": "لیتر", "عدد": "عدد", "pcs": "عدد", "مترمربع": "متر مربع", "متر مربع": "متر مربع" };
const unitKey = (u) => { const k = key(u).replace(/\.$/, ""); return UNIT_SYN[k] || UNIT_SYN[k.replace(/\s/g, "")] || k.replace(/\s/g, ""); };

/**
 * خروجیِ مدل ← کلیدِ هر قلم. «L2» یعنی قلمِ دوم؛ اگر مدل کلید را جا انداخت یا عددِ خالی داد، به‌ترتیب به قلم‌های
 * بی‌جواب می‌رسد — یک قلمِ گم‌شده نباید قیمت و مقدارِ پیداشده را دور بریزد.
 */
function mapLines(lines, arr) {
  const out = new Array(lines.length).fill(null);
  const used = new Set();
  arr.forEach((x, j) => {
    const k = T(x && (x.key ?? x.line ?? x.line_id));
    const m = /^l?\s*(\d+)$/i.exec(k);
    const i = m ? +m[1] - 1 : -1;
    if (i >= 0 && i < lines.length && !out[i]) { out[i] = x; used.add(j); }
  });
  const rest = arr.filter((x, j) => !used.has(j) && x && typeof x === "object");
  for (let i = 0; i < out.length && rest.length; i++) if (!out[i]) out[i] = rest.shift();
  return out;
}

/** وضعیتِ یک خانه از روی آنچه مدل گفت: نیامده ← ⚪ (مطمئن) یا ⚠️؛ آمده ← ✅/❌ (مطمئن) یا ⚠️ */
const cellStatus = (has, sure, same) => (!has ? (sure ? "none" : "warn") : !sure ? "warn" : same ? "ok" : "bad");

/**
 * خروجی مدل ← جدول: هر ردیف {key, kind, label, want (بستهٔ پیشنهادی), got (سند), val (مقداری که اگر به کار رود به تب
 * استعلامات می‌رود), status: ok|warn|none|bad, gate}. قیمتِ سند به ریال و بی ارزش افزوده برگردانده می‌شود (حسابِ
 * قطعی کارِ سامانه است، نه مدل). gate=false یعنی ردیفِ اطلاعاتی (لایهٔ افزوده، اعتبار، حمل، محل تحویل).
 * terms: شرایطِ اعلامیِ تأمین‌کننده برای همین بسته (dtime, pay, invoice, vat, valid_days).
 */
export function judge(lines, r, meta = {}, terms = null) {
  const tooman = r.currency === "تومان";
  const rate = numOf(r.vat_rate) != null ? numOf(r.vat_rate) / 100 : VAT_RATE;
  const got = mapLines(lines, Array.isArray(r.lines) ? r.lines : []);
  const outLines = lines.map((l, idx) => {
    const x = got[idx];
    const found = !!(x && x.found !== false);
    const gone = !!(x && x.found === false);       /* مدل مطمئن است که این قلم در سند نیست */
    const st = new Map((x && Array.isArray(x.layers) ? x.layers : []).map((y) => [key(y.name), y]));
    const base = (row) => (!x ? { ...row, status: "warn" } : gone ? { ...row, status: "none" } : row);
    const layerRow = (w, kind) => {
      const y = st.get(key(w.k));
      const k = `${kind === "extra" ? "X" : "L"}:${w.k}`;
      if (!x || gone || !y) return base({ key: k, kind, label: w.k, want: w.v, got: null, val: null, status: x && found && !y ? "warn" : "none", gate: kind === "layer" });
      const sure = sureOf(y);
      const seen = T(y.seen) || null;
      const status = y.status === "explicit" ? (sure ? "ok" : "warn") : y.status === "different" ? (sure ? "bad" : "warn") : (sure ? "none" : "warn");
      const g = y.status === "missing" ? null : seen || (y.status === "explicit" ? w.v : null);
      return { key: k, kind, label: w.k, want: w.v, got: g, val: g, status, gate: kind === "layer" };
    };
    const rows = [...lockedOf(l).map((w) => layerRow(w, "layer")), ...extraOf(l).map((w) => layerRow(w, "extra"))];
    /* مقدار */
    const want = numOf(l.qty);
    const q = x ? numIn(x.qty) : null;
    rows.push(base({ key: "qty", kind: "field", label: "مقدار", want, got: q, val: q,
      status: cellStatus(q != null, sureOf(x && x.qty), near(q, want, 0, 1e-9)), gate: true }));
    /* واحد */
    const uo = (x && x.unit) || {};
    const ug = T(valOf(uo)) || null;
    const uSame = uo.same === true || (uo.same == null && ug != null && unitKey(ug) === unitKey(l.unit));
    rows.push(base({ key: "unit", kind: "field", label: "واحد", want: T(l.unit) || null, got: ug, val: ug,
      status: cellStatus(!!ug, sureOf(uo), uSame), gate: true }));
    /* قیمت واحد — به ریال و بی ارزش افزوده */
    let p = x ? numIn(x.unit_price) : null;
    let from = "unit";
    if (p == null && x) { const tot = numIn(x.total_price), qq = q != null ? q : want; if (tot != null && qq) { p = tot / qq; from = "total"; } }
    if (p != null && tooman) p *= 10;
    if (p != null && r.vat_included === true) p /= 1 + rate;
    if (p != null) p = Math.round(p);
    const po = (x && (from === "total" ? x.total_price : x.unit_price)) || null;
    const priceRow = base({ key: "price", kind: "field", label: "قیمت واحد (ریال، بی ارزش افزوده)", want: numOf(l.price), got: p, val: p,
      status: cellStatus(p != null, po ? sureOf(po) : !!(x && x.unit_price && sureOf(x.unit_price)), near(p, numOf(l.price), r.vat_included === true ? 0.0002 : 0, 1)), gate: true });
    if (from === "total" && p != null) priceRow.note = "از مبلغِ کلِ سطر تقسیم بر مقدار";
    rows.push(priceRow);
    return { line_id: l.id, no: l.no || null, title: l.title, head: l.head || null, item_id: l.item_id, found, doc_title: x && x.doc_title ? T(x.doc_title) : null, rows, note: (x && x.note) || null };
  });

  /* شرایط فاکتور: ✅ همان شرطِ اعلامی (یا اگر اعلامی نیست، صریح در سند) · ❌ فرق دارد · ⚪ نیامده · ⚠️ نامطمئن */
  const decl = terms || {};
  const hrow = (k, label, o, gate, want, fmt) => {
    const raw = valOf(o);
    const g = raw == null || T(raw) === "" ? null : fmt ? fmt(raw, o) : raw;
    const has = g != null;
    const w = want == null || T(want) === "" ? null : want;
    const same = !has ? false : w == null ? true : o && o.same === true ? true : o && o.same === false ? false : key(g) === key(w);
    return { key: k, kind: "terms", label, want: w, got: g, val: g, status: o ? cellStatus(has, sureOf(o), same) : "warn", gate };
  };
  const header = [];
  const dl = hrow("dtime", "زمان تحویل", r.delivery, true, decl.dtime);
  if (dl.got != null && !validDtime(dl.got)) { dl.val = null; dl.note = "قالبِ سند تاریخ شمسی یا شمار روز نیست؛ اگر بپذیرید، زمان تحویل خالی می‌ماند"; if (dl.status === "ok") dl.status = "warn"; }
  else if (dl.got != null) {
    dl.val = normalizeDtime(dl.got);
    if (dl.want && r.delivery && r.delivery.same == null) dl.status = cellStatus(true, sureOf(r.delivery), normalizeDtime(dl.want) === dl.val);
  }
  header.push(dl);
  const pay = hrow("pay", "شرایط تسویه", r.pay, true, decl.pay);
  if (r.pay && r.pay.text) pay.text = T(r.pay.text);
  header.push(pay);
  /* نوع فاکتور: «رسمی است مگر خلافش ثابت شود» (قاعدهٔ شرکت) — سکوتِ سند یعنی رسمی */
  const inv = hrow("invoice", "نوع فاکتور", r.invoice, true, decl.invoice);
  if (inv.got == null) {
    inv.got = "رسمی"; inv.val = "رسمی"; inv.def = true;
    inv.status = !inv.want || inv.want === "رسمی" ? "ok" : "bad";
  }
  header.push(inv);
  header.push(hrow("vat", "ارزش افزوده", r.vat, true, decl.vat));
  const vd = hrow("valid_days", "اعتبار پیش‌فاکتور (روز)", r.valid_days, false, decl.valid_days != null && decl.valid_days !== "" ? String(decl.valid_days) : null, (v) => String(numOf(v) ?? T(v)));
  header.push(vd);
  header.push(hrow("ship", "روش حمل", r.ship, false, null));
  const pl = hrow("place", "محل تحویل", r.place, false, null);
  if (pl.got === "سایر" && r.place && r.place.other) pl.other = T(r.place.other);
  header.push(pl);

  const out = {
    v: AI_VERSION, readable: r.readable !== false, reason: r.reason || null, currency: r.currency || null,
    vat_included: r.vat_included == null ? null : !!r.vat_included, lines: outLines, header, notes: r.notes || null, at: Date.now(), ...meta,
  };
  out.ok = resolve(out, {}).ready;
  return out;
}

/** هر ردیفِ غیرسبز را کارشناس می‌تواند بپذیرد: پیش‌فاکتور به‌جای درخواست ملاک — مقدارِ سند، یا خالی اگر سند چیزی نگفته */
export const acceptable = (row) => !!row && row.status !== "ok";
const lineKey = (lineId, row) => `${lineId}|${row.key}`;
const headKey = (row) => `h|${row.key}`;
/* مقداری که از سند به تب استعلامات می‌رود (جدولِ نسخهٔ ۲ «val» ندارد) */
const docVal = (row) => {
  if (row.val !== undefined) return row.val;
  if (row.key === "dtime") return row.got != null && validDtime(row.got) ? normalizeDtime(row.got) : null;
  return row.got;
};
const STATUS_FA = { bad: "با پیش‌فاکتور فرق دارد", none: "در پیش‌فاکتور نیامده", warn: "خوانش مطمئن نیست" };
const REQ_LINE = ["qty", "unit", "price"], REQ_TERMS = ["dtime", "pay", "invoice", "vat"];

/**
 * پذیرش‌های کارشناس روی جدول ← آیا تأیید نهایی ممکن است، و مقدارهایی که به تب استعلامات می‌روند.
 * فقط از پیش‌فاکتور: ✅ (همان) یا پذیرفته (مقدارِ سند، یا خالی). ردیفِ دروازه‌ای که نه این است نه آن، مانع است.
 * gaps: فیلدهای اجباری‌ای که با پذیرشِ «نیامده» خالی می‌مانند — خط استعلام «ثبت موقت» نمی‌شود.
 */
export function resolve(ai, accept) {
  const acc = accept || {};
  const empty = { ready: false, gaps: [], lines: [], terms: {} };
  if (!aiUsable(ai)) return { ...empty, problems: ["خوانش هوشمند پیش‌فاکتور هنوز انجام نشده است"] };
  if (ai.readable === false) return { ...empty, problems: [`پیش‌فاکتور خوانا نبود${ai.reason ? ` (${ai.reason})` : ""}`] };
  const problems = [], gaps = [];
  const take = (row, k) => {
    if (row.status === "ok") return { use: true, value: row.kind === "layer" || row.kind === "extra" ? row.want : row.key === "unit" ? row.want || row.got : docVal(row) };
    if (acc[k]) return { use: true, value: docVal(row), accepted: true };
    return { use: false };
  };
  const lines = (ai.lines || []).map((ln) => {
    const tag = `«${ln.title}»${ln.no ? ` (کد ${faN(ln.no)})` : ""}`;
    const values = { spec: [] };
    for (const row of ln.rows || []) {
      const t = take(row, lineKey(ln.line_id, row));
      if (!t.use) {
        if (row.gate) problems.push(`${tag}: «${row.label}» ${STATUS_FA[row.status] || "مانده"}`);
        continue;
      }
      if (row.kind === "layer" || row.kind === "extra") { if (T(t.value)) values.spec.push({ k: row.label, v: T(t.value) }); continue; }
      values[row.key] = t.value == null || t.value === "" ? null : t.value;
      if (REQ_LINE.includes(row.key) && values[row.key] == null) gaps.push(`${tag}: ${row.label}`);
    }
    return { line_id: ln.line_id, item_id: ln.item_id, values };
  });
  const terms = {};
  for (const row of ai.header || []) {
    const t = take(row, headKey(row));
    if (!t.use) {
      if (row.gate) problems.push(`«${row.label}» ${STATUS_FA[row.status] || "مانده"}`);
      continue;
    }
    terms[row.key] = t.value == null || t.value === "" ? null : t.value;
    if (row.key === "place" && row.other) terms.place_other = row.other;
    if (REQ_TERMS.includes(row.key) && terms[row.key] == null) gaps.push(`«${row.label}»`);
  }
  return { ready: problems.length === 0, problems, gaps, lines, terms };
}

export { lineKey, headKey };
