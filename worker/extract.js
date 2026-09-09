/**
 * استخراج اطلاعات پیش‌فاکتور با مدل زبانی
 *
 * (AI-06 قواعد استخراج · AI-12 فیلدهای قابل استخراج · ADR-0015 لایهٔ ۲ · INV-07 و INV-15)
 *
 * چرا فایل از داخل Worker رد نمی‌شود:
 * Messages API می‌تواند خودش سند را از یک URL بگیرد. پس ما فقط یک لینک امضاشدهٔ
 * کوتاه‌عمر به فایلِ داخل Supabase می‌سازیم و در درخواست می‌گذاریم. نتیجه: بدنهٔ
 * درخواست چند کیلوبایت JSON است، نه ۲۰ مگابایت base64 — که در پلن رایگان
 * کلودفلیر (۱۰ میلی‌ثانیه CPU) اصلاً شدنی نبود.
 *
 * خروجی با «ابزار» گرفته می‌شود نه با متن آزاد، تا همیشه JSON معتبرِ هم‌شکل باشد.
 */

export const MODEL = "claude-sonnet-5";
const API = "https://api.anthropic.com/v1/messages";
const MAX_TOKENS = 8000;

/** نسخهٔ دستور — در کنار خروجی ذخیره می‌شود تا بعداً بشود فهمید با چه چیزی استخراج شده (INV-15، PRV-05) */
export const PROMPT_VERSION = "pf-extract/1.0";

/* ------------------------------------------------------------------ */
/* قرارداد خروجی                                                       */
/* ------------------------------------------------------------------ */

const LINE = {
  type: "object",
  properties: {
    matched_item_id: { type: ["integer", "null"], description: "شناسهٔ قلمِ درخواست که این سطر با آن یکی است. اگر مطمئن نیستی null بگذار." },
    title: { type: "string", description: "شرح کالا، دقیقاً همان‌طور که در پیش‌فاکتور نوشته شده" },
    spec: { type: ["string", "null"], description: "جنس یا مشخصات فنی، اگر جدا نوشته شده" },
    unit: { type: ["string", "null"], description: "واحد (عدد، متر، کیلوگرم…)" },
    qty: { type: ["number", "null"], description: "مقدار" },
    unit_price: { type: ["number", "null"], description: "قیمت واحد، با همان واحد پولی که در سند نوشته شده. تبدیل نکن." },
    total_price: { type: ["number", "null"], description: "مبلغ کل سطر، اگر در سند آمده. حساب نکن؛ فقط اگر نوشته شده." },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    note: { type: ["string", "null"], description: "اگر چیزی در این سطر مبهم بود، این‌جا بنویس" },
  },
  required: ["title", "confidence"],
  additionalProperties: false,
};

export const SCHEMA = {
  type: "object",
  properties: {
    extractable: { type: "boolean", description: "آیا توانستی با اطمینان اطلاعات را بخوانی؟" },
    reason: {
      type: ["string", "null"],
      enum: ["handwritten", "low_quality_scan", "unclear_structure", "not_a_proforma", "password_protected", "empty", null],
      description: "اگر extractable=false، دلیلش",
    },
    supplier_name: { type: ["string", "null"], description: "نام فروشنده/تأمین‌کننده روی سربرگ" },
    currency: { type: ["string", "null"], enum: ["ریال", "تومان", null], description: "واحد پولِ نوشته‌شده در سند. حدس نزن." },
    vat_included: { type: ["boolean", "null"], description: "آیا قیمت‌های نوشته‌شده ارزش افزوده را در خود دارند؟" },
    invoice_type: { type: ["string", "null"], enum: ["رسمی", "غیر رسمی", null] },
    pay_terms: { type: ["string", "null"], description: "شرایط تسویه، عیناً" },
    valid_days: { type: ["integer", "null"], description: "مدت اعتبار پیش‌فاکتور به روز" },
    delivery_date: { type: ["string", "null"], description: "زمان تحویل، عیناً همان‌طور که نوشته شده" },
    ship_method: { type: ["string", "null"], description: "روش حمل" },
    orientation: { type: ["string", "null"], enum: ["upright", "rotated_90", "rotated_180", "rotated_270", null], description: "جهت اسکن؛ اگر چرخیده بود بگو" },
    lines: { type: "array", items: LINE },
    unreadable_fields: { type: "array", items: { type: "string" }, description: "نام فیلدهایی که در سند بودند ولی خوانا نبودند" },
    notes: { type: ["string", "null"], description: "هر چیز مهمی که کارشناس باید بداند" },
  },
  required: ["extractable", "lines"],
  additionalProperties: false,
};

/* ------------------------------------------------------------------ */
/* دستور سیستم                                                         */
/* ------------------------------------------------------------------ */

export const SYSTEM = `تو دستیار استخراج اطلاعات از پیش‌فاکتورهای خرید یک شرکت پیمانکاری ایرانی هستی.
خروجی تو مستقیم وارد «جدول مقایسه استعلام بها» می‌شود که کمیسیون خرید بر اساسش تصمیم می‌گیرد و پول واقعی جابه‌جا می‌کند.

اصل اول — خودداری بهتر از حدس است.
اگر سند خوانا نیست، دست‌نویس است، اسکنش بد است، یا اصلاً پیش‌فاکتور نیست، بگو extractable=false و دلیلش را بنویس.
این پاسخِ درست است و هیچ ایرادی ندارد. یک عدد اشتباه در جدول کمیسیون خیلی بدتر از یک خانهٔ خالی است.
حتی وقتی extractable=true است، هر فیلدی که مطمئن نیستی را null بگذار، نه حدس.

اصل دوم — فقط آنچه نوشته شده.
• هیچ عددی را حساب نکن. اگر «مبلغ کل» در سند نیست، total_price را null بگذار؛ خودت ضرب نکن.
• هیچ فیلدی را از روی فیلد دیگر استنتاج نکن.
• متن‌ها (شرایط تسویه، زمان تحویل، روش حمل) را عیناً بنویس؛ خلاصه و بازنویسی نکن.

اصل سوم — واحد پول را هرگز تبدیل نکن.
پیش‌فاکتورهای ایرانی گاهی به ریال و گاهی به تومان نوشته می‌شوند و اشتباه گرفتنشان یعنی خطای ده‌برابری.
عددها را دقیقاً همان‌طور که نوشته شده بنویس و currency را همان چیزی بگذار که در سند آمده.
اگر واحد پول در سند مشخص نیست، currency را null بگذار و در notes بنویس که مشخص نبود. خودت تومان یا ریال فرض نکن.

اصل چهارم — تطبیق با اقلام درخواست.
فهرست اقلام درخواست به تو داده می‌شود. برای هر سطر پیش‌فاکتور، اگر با اطمینان بالا با یکی از آن‌ها یکی است،
شناسه‌اش را در matched_item_id بگذار. تطبیق باید بر پایهٔ خودِ کالا باشد، نه شباهت لفظی سطحی.
اگر شک داری، null بگذار؛ کارشناس خودش وصلش می‌کند. تطبیق غلط بدتر از تطبیق‌نکردن است.

اصل پنجم — اطمینان را صادقانه بده.
confidence هر سطر: high یعنی عدد و شرح هر دو واضح خوانده شدند. medium یعنی خوانده شد ولی جای تردید هست.
low یعنی حدس نزدیک است. هر فیلدی که در سند بود ولی نتوانستی بخوانی را در unreadable_fields بیاور.

اصل ششم — عددها را رقم‌به‌رقم بخوان.
این سندها معمولاً اسکن‌اند و ارقام فارسی در اسکن بد به هم شبیه می‌شوند: ۵ و ۶، ۱ و ۲، ۳ و ۴، ۷ و ۹.
هر قیمت را رقم‌به‌رقم و با دقت بخوان، نه با یک نگاه کلی. اگر یک رقم قطعی نیست، confidence آن سطر
را حداکثر medium بگذار و در note بنویس کدام رقم مشکوک بود. عددِ نزدیک، عددِ درست نیست.

اصل هفتم — جهت صفحه.
اسکن ممکن است ۹۰ یا ۱۸۰ درجه چرخیده باشد. اگر چنین است، در ذهنت بچرخانش و بخوانش؛ چرخیدگی
به‌تنهایی دلیل ناخوانا بودن نیست. فقط در فیلد orientation بنویس صفحه چطور بوده تا کاربر بداند.

زبان همهٔ متن‌های خروجی فارسی است، مگر آنکه در خود سند لاتین نوشته شده باشد.`;

/** پیام کاربر: فهرست اقلام درخواست + خود سند */
export function userContent(fileUrl, mime, items, requestInfo) {
  const itemList = items.map((i) =>
    `- شناسه ${i.id}: ${i.title}` + (i.qty != null ? ` — ${i.qty} ${i.unit || ""}` : "") + (i.spec ? ` — ${i.spec}` : ""),
  ).join("\n");

  const doc = String(mime || "").startsWith("image/")
    ? { type: "image", source: { type: "url", url: fileUrl } }
    : { type: "document", source: { type: "url", url: fileUrl } };

  return [
    doc,
    {
      type: "text",
      text: `این پیش‌فاکتور مربوط به درخواست خرید شمارهٔ ${requestInfo.id} است`
        + (requestInfo.party ? ` (${requestInfo.party})` : "") + `.\n\n`
        + `اقلامی که در این درخواست خواسته شده‌اند:\n${itemList}\n\n`
        + `اطلاعات پیش‌فاکتور را با ابزار ثبت کن. اگر خوانا نیست یا پیش‌فاکتور نیست، extractable=false بگذار و دلیلش را بنویس.`,
    },
  ];
}

/* ------------------------------------------------------------------ */

export class ExtractError extends Error {
  constructor(message, status) { super(message); this.status = status || 500; }
}

/**
 * یک پیش‌فاکتور را به مدل می‌دهد و خروجی ساختاریافته می‌گیرد.
 * هیچ چیزی در دیتابیس نمی‌نویسد — تصمیمِ ثبت با کارشناس است (INV-07).
 *
 * سند **دو بار مستقل** خوانده می‌شود و فقط قیمت‌هایی که هر دو خوانش روی آن‌ها
 * توافق دارند «تأییدشده» حساب می‌شوند.
 *
 * چرا: روی یک اسکن واقعی CamScanner، مدل ۲ از ۶ قیمت را اشتباه خواند و در هر دو
 * مورد هم «اطمینان بالا» اعلام کرد — یعنی خودِ confidence مدل برای عدد قابل اتکا
 * نیست. ولی در همان آزمون، **هر قیمتی که دو خوانش روی آن توافق داشتند درست بود و
 * همهٔ خطاها در جاهایی افتاد که دو خوانش اختلاف داشتند.** پس توافق دو خوانش،
 * سنجه‌ای است که خودِ مدل نمی‌تواند بدهد.
 *
 * با AI_PASSES=1 می‌شود خاموشش کرد (نصفِ هزینه، بدون این محافظ).
 */
export async function extractProforma(env, { fileUrl, mime, items, request }) {
  if (!env.ANTHROPIC_API_KEY) throw new ExtractError("کلید مدل روی این پروژه ست نشده است.", 503);
  const passes = Math.max(1, Math.min(2, parseInt(env.AI_PASSES, 10) || 2));

  const first = await onePass(env, { fileUrl, mime, items, request });
  if (passes === 1 || !first.result.extractable) return first;

  const second = await onePass(env, { fileUrl, mime, items, request });
  return {
    result: reconcile(first.result, second.result),
    meta: { ...first.meta, passes: 2, second: { tokens_in: second.meta.tokens_in, tokens_out: second.meta.tokens_out } },
  };
}

/**
 * دو خوانش را کنار هم می‌گذارد.
 * سطرها با قلمِ تطبیق‌خورده جفت می‌شوند (و اگر نبود، با عنوان نرمال‌شده).
 * قیمتی که دو خوانش روی آن اختلاف دارند، هرچقدر هم مدل مطمئن باشد، low می‌شود
 * و هر دو خوانش در note می‌آید تا کارشناس بداند دقیقاً چه چیزی را باید چک کند.
 */
export function reconcile(a, b) {
  const key = (l) => (l.matched_item_id != null ? `i${l.matched_item_id}` : `t${String(l.title || "").replace(/\s+/g, "").slice(0, 30)}`);
  const bByKey = new Map((b.lines || []).map((l) => [key(l), l]));
  let agreed = 0, disputed = 0;

  const lines = (a.lines || []).map((l) => {
    const o = bByKey.get(key(l));
    if (!o) return { ...l, confidence: "low", note: [l.note, "این سطر فقط در یکی از دو خوانش دیده شد"].filter(Boolean).join(" · ") };
    const same = l.unit_price === o.unit_price;
    if (same) { agreed++; return l; }
    disputed++;
    return {
      ...l,
      confidence: "low",
      unit_price_alt: o.unit_price,
      note: [l.note, `دو بار متفاوت خوانده شد: ${l.unit_price} و ${o.unit_price} — خودتان از روی سند بخوانید`].filter(Boolean).join(" · "),
    };
  });
  /* سطرهایی که فقط در خوانش دوم بودند هم بیایند، با علامت */
  const aKeys = new Set((a.lines || []).map(key));
  for (const l of b.lines || []) {
    if (!aKeys.has(key(l))) lines.push({ ...l, confidence: "low", note: [l.note, "این سطر فقط در یکی از دو خوانش دیده شد"].filter(Boolean).join(" · ") });
  }

  const merged = { ...a, lines, agreement: { agreed, disputed } };
  /* فیلدهای سرآیندی که دو خوانش روی آن‌ها توافق ندارند، حذف نمی‌شوند ولی علامت می‌خورند */
  for (const f of ["currency", "supplier_name", "invoice_type", "valid_days"]) {
    if (a[f] != null && b[f] != null && a[f] !== b[f]) {
      merged.notes = [merged.notes, `«${f}» در دو خوانش متفاوت بود: ${a[f]} / ${b[f]}`].filter(Boolean).join(" · ");
      if (f === "currency") merged.currency = null; /* واحد پول مشکوک = کارشناس باید صریح بگوید */
    }
  }
  return merged;
}

async function onePass(env, { fileUrl, mime, items, request }) {
  const body = {
    model: env.AI_MODEL || MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM,
    tools: [{
      /* نام ابزار باید ASCII باشد؛ Anthropic الگوی ^[a-zA-Z0-9_-]{1,128}$ را الزام می‌کند */
      name: "record_proforma",
      description: "اطلاعات خوانده‌شده از پیش‌فاکتور را ثبت می‌کند. اگر سند خوانا نبود، extractable=false با دلیل.",
      input_schema: SCHEMA,
    }],
    tool_choice: { type: "tool", name: "record_proforma" },
    messages: [{ role: "user", content: userContent(fileUrl, mime, items, request) }],
  };

  const r = await fetch(API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (d && d.error && d.error.message) || `خطای ${r.status}`;
    throw new ExtractError(`مدل پاسخ نداد: ${String(msg).slice(0, 300)}`, r.status === 429 ? 429 : 502);
  }

  const use = (d.content || []).find((c) => c.type === "tool_use");
  if (!use) throw new ExtractError("مدل خروجی ساختاریافته برنگرداند.", 502);

  return {
    result: use.input,
    meta: {
      model: d.model,
      prompt_version: PROMPT_VERSION,
      stop_reason: d.stop_reason,
      tokens_in: d.usage && d.usage.input_tokens,
      tokens_out: d.usage && d.usage.output_tokens,
      at: Date.now(),
    },
  };
}

/** برچسب فارسی دلیل خودداری، برای نمایش به کارشناس */
export const REFUSAL_FA = {
  handwritten: "دست‌نویس است",
  low_quality_scan: "کیفیت اسکن پایین است",
  unclear_structure: "ساختارش روشن نیست",
  not_a_proforma: "پیش‌فاکتور نیست",
  password_protected: "فایل رمز دارد",
  empty: "خالی است",
};

/**
 * قیمت‌ها را به ریال برمی‌گرداند.
 * تبدیل این‌جا انجام می‌شود نه در مدل: ضرب در ۱۰ یک کار قطعی است و نباید به
 * تشخیص مدل سپرده شود. اگر واحد پول معلوم نباشد، هیچ تبدیلی نمی‌کنیم و
 * کارشناس باید خودش تأیید کند.
 */
export function toRial(value, currency) {
  if (value == null) return null;
  if (currency === "تومان") return value * 10;
  return value;
}
