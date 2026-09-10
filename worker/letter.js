/**
 * نامهٔ پیوستِ جدول کمیسیون — از صدای کارشناس تا فایل Word روی سربرگ
 *
 * چرا صدا: کارشناس اغلب در کارگاه و با گوشی کار می‌کند. توضیح دادنِ اینکه چه
 * اتفاقی افتاده با حرف زدن یک دقیقه طول می‌کشد و با تایپ ده دقیقه.
 *
 * مسیر: پیام صوتی تلگرام → انبار فایل → ElevenLabs (فارسی) → متن خام →
 * مدل زبانی → نامهٔ رسمی ساختاریافته → قالب سربرگ → فایل .docx
 *
 * هیچ‌کدام از این مراحل بایت‌های صوت را در Worker نگه نمی‌دارند: ElevenLabs
 * خودش فایل را از یک لینک امضاشده برمی‌دارد.
 */
import { ExtractError } from "./extract.js";

const STT_URL = "https://api.elevenlabs.io/v1/speech-to-text";
const AI_URL = "https://api.anthropic.com/v1/messages";

export const LETTER_PROMPT_VERSION = "letter/2.0";

/**
 * صوت را به متن فارسی تبدیل می‌کند.
 * `language_code: "fa"` صریح داده می‌شود چون تشخیص خودکار روی جمله‌های کوتاه
 * فارسی گاهی عربی یا اردو حدس می‌زند و کل رونویسی را خراب می‌کند.
 */
export async function transcribe(env, fileUrl) {
  if (!env.ELEVENLABS_API_KEY) throw new ExtractError("کلید سرویس تبدیل صوت ست نشده است.", 503);
  const form = new FormData();
  form.append("model_id", env.STT_MODEL || "scribe_v2");
  form.append("language_code", "fa");
  form.append("source_url", fileUrl);

  const r = await fetch(STT_URL, { method: "POST", headers: { "xi-api-key": env.ELEVENLABS_API_KEY }, body: form });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (d && (d.detail?.message || d.detail || d.message)) || `خطای ${r.status}`;
    throw new ExtractError(`تبدیل صوت به متن نشد: ${String(typeof msg === "string" ? msg : JSON.stringify(msg)).slice(0, 200)}`, r.status === 429 ? 429 : 502);
  }
  return { text: String(d.text || "").trim(), language: d.language_code, confidence: d.language_probability };
}

/* ------------------------------------------------------------------ */
/* نگارش نامه                                                          */
/* ------------------------------------------------------------------ */

const LETTER_SCHEMA = {
  type: "object",
  properties: {
    subject: { type: "string", description: "موضوع نامه، یک سطر، بدون کلمهٔ «موضوع»" },
    to: { type: "string", description: "مخاطب، مثلاً «کمیسیون محترم خرید شرکت تونل سد آریانا»" },
    salutation: { type: "string", description: "با سلام و احترام،" },
    paragraphs: { type: "array", items: { type: "string" }, description: "بدنهٔ نامه، هر بند یک عضو آرایه. دو تا چهار بند." },
    closing: { type: "string", description: "جملهٔ پایانی و درخواست اقدام" },
    uncertain: { type: "array", items: { type: "string" }, description: "چیزهایی که در صوت مبهم بود و در نامه نیاوردی" },
  },
  required: ["subject", "to", "salutation", "paragraphs", "closing"],
  additionalProperties: false,
};

const LETTER_SYSTEM = `تو نامه‌های اداری یک شرکت پیمانکاری ایرانی را می‌نویسی.

ورودی تو دو چیز است: (۱) رونویسیِ صحبت شفاهی کارشناس خرید که توضیح می‌دهد در جریان یک درخواست خرید چه گذشته،
و (۲) اطلاعات همان درخواست و استعلام‌ها. خروجی تو نامه‌ای است که پیوست جدول کمیسیون می‌شود و اعضای کمیسیون می‌خوانند.

قواعد:

۱. فقط از چیزی بنویس که در صوت یا در داده‌های درخواست آمده. هیچ دلیل، عدد، تاریخ یا اسمی از خودت اضافه نکن.
   اگر کارشناس چیزی را مبهم گفته، در uncertain بنویسش و در متن نامه نیاور.

۲. زبان اداری فارسی، محترمانه و کوتاه. «احتراماً»، «به استحضار می‌رساند»، «خواهشمند است دستور فرمایید».
   ولی پرحرفی نکن: دو تا چهار بند کافی است. هر بند یک موضوع.

۳. حرف شفاهی را به نثر اداری برگردان، نه اینکه عیناً نقل کنی. «طرف جواب نداد» می‌شود
   «تأمین‌کنندهٔ مذکور به استعلام ارسالی پاسخ نداد». ولی معنا را عوض نکن و چیزی به آن نیفزا.

۴. اگر کارشناس از قیمت یا تأمین‌کننده‌ای حرف زده که در داده‌های استعلام هست، همان عدد و نام رسمی را
   به کار ببر، نه تقریبِ شفاهی را.

۵. لحن باید توضیحی باشد نه دفاعی. هدف نامه این است که کمیسیون بفهمد چه اتفاقی افتاده و چرا،
   نه اینکه کسی را متهم یا تبرئه کند.

۶. اگر رونویسی آن‌قدر کوتاه یا نامفهوم است که نمی‌شود نامه‌ای از آن ساخت، در paragraphs یک بند بنویس که
   توضیح کارشناس ناقص بوده و در uncertain دلیلش را بیاور. نامهٔ توخالی نساز.

۷. جمعِ دو تأمین‌کننده را وقتی برای تعداد اقلام متفاوتی قیمت داده‌اند مقایسه نکن.
   اگر یکی برای دو قلم قیمت داده و دیگری فقط برای یک قلم، جمع کلشان قابل مقایسه نیست و
   نوشتنِ «الف گران‌تر از ب بود» غلط و گمراه‌کننده است. در چنین حالتی یا قیمتِ همان قلمِ مشترک را
   مقایسه کن، یا اصلاً مقایسهٔ عددی نکن و فقط بنویس کدام تأمین‌کننده برای کدام اقلام قیمت داده.
   در متن ورودی، تأمین‌کننده‌ای که همهٔ اقلام را قیمت نداده صریح علامت خورده است.

۸. درخواستِ اقدام فقط یک بار و فقط در closing بیاید. در بندهای بدنه «خواهشمند است دستور فرمایید»
   ننویس — بدنه شرحِ ماجراست، نه تقاضا.

۹. تاریخ شمسی را همیشه سال/ماه/روز بنویس: «۱۴۰۵/۰۶/۱۸»، نه «۱۸/۰۶/۱۴۰۵». در متن راست‌به‌چپ،
   عددها از چپ خوانده می‌شوند و ترتیبِ وارونه، تاریخ را وارونه نشان می‌دهد.
   کلمه‌های مرکب را هم با نیم‌فاصله بنویس: «تأمین‌کننده»، «پیش‌فاکتور»، «قیمت‌ها»، «می‌شود».

۱۰. تاریخ و شمارهٔ نامه را خودت در متن نیاور؛ جای آن‌ها فیلدهای بالای سربرگ است و سامانه پرشان می‌کند.

۱۱. **هیچ عدد مالی یا شمارشی را خودت ننویس.** جمع مبلغ، قیمت، تعداد اقلام، شمارهٔ درخواست و تاریخ درخواست
   را با جای‌خالی بگذار؛ سامانه از دادهٔ خودش پرشان می‌کند. جای‌خالی‌های مجاز (دقیقاً همین شکل، با همان
   نام تأمین‌کننده و قلمی که در «اطلاعات درخواست» آمده):
     {{شماره_درخواست}}  {{تاریخ_درخواست}}  {{طرف_مقابل}}
     {{تعداد_اقلام_کمیسیون}}   ← چند قلم در جدول کمیسیون است
     {{تعداد_اقلام_درخواست}}   ← کل اقلام درخواست
     {{اقلام_کمیسیون}}          ← فهرست عنوان اقلام جدول، با ویرگول
     {{جمع|نام تأمین‌کننده}}     ← جمع مبلغ همان تأمین‌کننده برای اقلام جدول، به ریال
     {{تعداد|نام تأمین‌کننده}}   ← برای چند قلم قیمت داده
     {{قیمت|نام تأمین‌کننده|عنوان قلم}} ← قیمت واحد یک قلم
   مثال: «جمع مبلغ پیشنهادی {{جمع|شرکت آریا}} ریال برای {{تعداد|شرکت آریا}} قلم».
   عددی که در «حرف کارشناس» آمده و در داده نیست (مثلاً «سه بار زنگ زدم») را می‌توانی با حروف بنویسی.`;

/**
 * نامه را از رونویسی صوت و بافتِ درخواست می‌سازد.
 * خروجی ساختاریافته است تا قالب Word بدون تجزیهٔ متن پرش کند.
 */
/**
 * دادهٔ نامه از دادهٔ خام ارجاع: فقط استعلام‌های **تیک‌خورده** و قلم‌هایی که همان‌ها
 * قیمت داده‌اند. همان قاعدهٔ جدول کمیسیون — نامه پیوستِ همان جدول است.
 */
export function letterData({ request, items, quotes, allItems }) {
  const finals = (quotes || []).filter((q) => q.final && q.saved);
  const covered = new Set(finals.map((q) => q.item_id));
  const rows = (items || []).filter((i) => covered.has(i.id));
  const suppliers = [...new Set(finals.map((q) => q.supplier_name))].map((name) => {
    const qs = finals.filter((q) => q.supplier_name === name);
    return {
      name,
      count: qs.length,
      sum: qs.reduce((n, q) => n + (+q.price || 0) * (+q.qty || 0), 0),
      prices: qs.map((q) => ({ item: (rows.find((i) => i.id === q.item_id) || {}).title || "", price: +q.price || 0 })),
    };
  });
  return {
    request, items: rows, suppliers,
    totalItems: (allItems || items || []).length,
  };
}

const money = (n) => Number(n || 0).toLocaleString("en-US");
const norm = (s) => String(s == null ? "" : s).replace(/[ي]/g, "ی").replace(/[ك]/g, "ک").replace(/[\u200c\s]+/g, " ").trim().toLowerCase();
const same = (a, b) => { const x = norm(a), y = norm(b); return x === y || (x.length > 3 && y.includes(x)) || (y.length > 3 && x.includes(y)); };

/**
 * جای‌خالی‌های نامه را از دادهٔ سامانه پر می‌کند.
 *
 * چرا این‌جا و نه در مدل: مدل یک بار «هفت قلم» و جمعِ هفت قلم را نوشت وقتی فقط
 * دو قلم تیک خورده بود. عددی که در نامه می‌نشیند باید همان عددِ جدول کمیسیون
 * باشد، و آن را فقط کد می‌تواند تضمین کند. هر جای‌خالیِ حل‌نشده «—» می‌شود و
 * گزارش می‌شود؛ هر عددِ بزرگی که مدل خودش نوشته و در داده نیست، مشکوک علامت
 * می‌خورد تا کارشناس پیش از فرستادن ببیند.
 */
export function fillLetter(letter, d) {
  const unresolved = new Set();
  const known = new Set([String(d.request.id), ...(d.suppliers || []).flatMap((s) => [s.sum, s.count, ...s.prices.map((p) => p.price)]).map(String)]);
  known.add(String(d.items.length)); known.add(String(d.totalItems));

  const findSup = (name) => (d.suppliers || []).find((s) => same(s.name, name));
  const resolve = (token) => {
    const parts = token.split("|").map((x) => x.trim());
    const key = parts[0];
    if (key === "شماره_درخواست") return String(d.request.id || "");
    if (key === "تاریخ_درخواست") return String(d.request.date || "");
    if (key === "طرف_مقابل") return String(d.request.party || "");
    if (key === "تعداد_اقلام_کمیسیون") return String(d.items.length);
    if (key === "تعداد_اقلام_درخواست") return String(d.totalItems);
    if (key === "اقلام_کمیسیون") return d.items.map((i) => i.title).join("، ");
    if (key === "جمع" || key === "تعداد" || key === "قیمت") {
      const s = findSup(parts[1] || "");
      if (!s) return null;
      if (key === "جمع") return money(s.sum);
      if (key === "تعداد") return String(s.count);
      const p = s.prices.find((x) => same(x.item, parts[2] || ""));
      return p ? money(p.price) : null;
    }
    return null;
  };
  const fill = (text) => String(text == null ? "" : text).replace(/\{\{([^{}]+)\}\}/g, (m, tok) => {
    const v = resolve(tok);
    if (v == null) { unresolved.add(tok.trim()); return "—"; }
    return v;
  });

  const out = { ...letter };
  for (const k of ["subject", "to", "salutation", "closing"]) if (out[k] != null) out[k] = fill(out[k]);
  out.paragraphs = (letter.paragraphs || []).map(fill);

  /* عددهای بزرگی که از داده نیامده‌اند — نامزدِ اشتباهِ مدل */
  const text = [out.subject, ...(out.paragraphs || []), out.closing].join("\n");
  const digits = (x) => x.replace(/[۰-۹]/g, (c) => "۰۱۲۳۴۵۶۷۸۹".indexOf(c)).replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c));
  const suspicious = [];
  /* روی متنِ اصلی جست‌وجو می‌شود تا همان شکلی که کارشناس در نامه می‌بیند گزارش شود */
  for (const m of text.matchAll(/[\d۰-۹٠-٩][\d۰-۹٠-٩,٬]{3,}/g)) {
    const raw = digits(m[0]).replace(/[,٬]/g, "");
    if (raw.length >= 4 && !known.has(raw) && !/^1[34]\d\d$/.test(raw)) suspicious.push(m[0]);
  }
  return { letter: out, unresolved: [...unresolved], suspicious: [...new Set(suspicious)] };
}

/**
 * نامه را از رونویسی صوت و بافتِ درخواست می‌سازد.
 * خروجی ساختاریافته است تا قالب Word بدون تجزیهٔ متن پرش کند.
 * مدل عدد نمی‌نویسد؛ جای‌خالی می‌گذارد و fillLetter پرش می‌کند.
 */
export async function writeLetter(env, { transcript, request, items, quotes, allItems, notes, expert, company }) {
  if (!env.ANTHROPIC_API_KEY) throw new ExtractError("کلید مدل ست نشده است.", 503);

  const d = letterData({ request, items, quotes, allItems });
  const supplierLines = d.suppliers.length
    ? d.suppliers.map((s) => `- ${s.name}: برای ${s.count} قلم از ${d.items.length} قلمِ جدول قیمت داده`
      + (s.count < d.items.length ? "  ⟵ ناقص است؛ جمعش با تأمین‌کنندهٔ کامل قابل مقایسه نیست" : "")
      + `\n  جای‌خالی‌هایش: {{جمع|${s.name}}} · {{تعداد|${s.name}}}`
      + s.prices.map((p) => ` · {{قیمت|${s.name}|${p.item}}}`).join("")).join("\n")
    : "هنوز استعلامِ تیک‌خورده‌ای نیست.";

  const context = `شرکت: ${company}\n`
    + `درخواست خرید {{شماره_درخواست}} مورخ {{تاریخ_درخواست}}\n`
    + `طرف مقابل / مرکز هزینه: {{طرف_مقابل}}\n`
    + `کارشناس خرید: ${expert}\n\n`
    + `این درخواست {{تعداد_اقلام_درخواست}} قلم دارد و جدول کمیسیون برای {{تعداد_اقلام_کمیسیون}} قلم زیر است:\n`
    + `${d.items.map((i) => `- ${i.title}${i.qty != null ? ` (${i.qty} ${i.unit || ""})` : ""}`).join("\n") || "—"}\n\n`
    + `تأمین‌کنندگانِ تیک‌خورده:\n${supplierLines}\n`
    + (notes ? `\nتوضیحات کارشناس در برگهٔ کمیسیون:\n${notes}\n` : "");

  const r = await fetch(AI_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: env.AI_MODEL || "claude-sonnet-5",
      max_tokens: 3000,
      system: LETTER_SYSTEM,
      tools: [{ name: "write_letter", description: "نامهٔ اداری ساخته‌شده", input_schema: LETTER_SCHEMA }],
      tool_choice: { type: "tool", name: "write_letter" },
      messages: [{ role: "user", content: [{ type: "text", text:
        `<اطلاعات_درخواست>\n${context}\n</اطلاعات_درخواست>\n\n`
        + `<حرف_کارشناس>\n${transcript}\n</حرف_کارشناس>\n\n`
        + `نامه را بنویس. عددها را ننویس؛ فقط جای‌خالی‌های بالا را عیناً بگذار.` }] }],
    }),
  });
  const dd = await r.json().catch(() => ({}));
  if (!r.ok) throw new ExtractError(`نگارش نامه نشد: ${String((dd.error && dd.error.message) || r.status).slice(0, 200)}`, 502);
  const use = (dd.content || []).find((c) => c.type === "tool_use");
  if (!use) throw new ExtractError("مدل نامه را ساختاریافته برنگرداند.", 502);

  const filled = fillLetter(use.input, d);
  return {
    letter: { ...filled.letter, signature: `کارشناس خرید — ${expert}` },
    meta: {
      model: dd.model, prompt_version: LETTER_PROMPT_VERSION,
      tokens_in: dd.usage?.input_tokens, tokens_out: dd.usage?.output_tokens,
      unresolved: filled.unresolved, suspicious: filled.suspicious,
      items: d.items.length, suppliers: d.suppliers.length,
    },
  };
}

