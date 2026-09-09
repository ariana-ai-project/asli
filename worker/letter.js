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

export const LETTER_PROMPT_VERSION = "letter/1.0";

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
   ننویس — بدنه شرحِ ماجراست، نه تقاضا.`;

/**
 * نامه را از رونویسی صوت و بافتِ درخواست می‌سازد.
 * خروجی ساختاریافته است تا قالب Word بدون تجزیهٔ متن پرش کند.
 */
export async function writeLetter(env, { transcript, request, items, quotes, notes, expert, company }) {
  if (!env.ANTHROPIC_API_KEY) throw new ExtractError("کلید مدل ست نشده است.", 503);

  /* تأمین‌کننده‌ای که همهٔ اقلام را قیمت نداده صریح علامت می‌خورد، وگرنه مدل
     جمع‌های ناهم‌جنس را مقایسه می‌کند و می‌نویسد «الف گران‌تر از ب بود» — که غلط است. */
    const total = (items || []).length;
  const supplierLines = (quotes || []).length
    ? [...new Set((quotes || []).map((q) => q.supplier_name))].map((s) => {
      const rows = quotes.filter((q) => q.supplier_name === s);
      const sum = rows.reduce((n, q) => n + (+q.price || 0) * (+q.qty || 0), 0);
      const partial = total && rows.length < total;
      return `- ${s}: برای ${rows.length} قلم از ${total || rows.length} قلمِ درخواست قیمت داده`
        + `، جمع همان اقلام ${sum.toLocaleString("en-US")} ریال`
        + (partial ? "  ⟵ ناقص است؛ جمع این تأمین‌کننده با تأمین‌کنندهٔ کامل قابل مقایسه نیست" : "");
    }).join("\n")
    : "هنوز استعلامی ثبت نشده است.";

  const context = `شرکت: ${company}\n`
    + `درخواست خرید شمارهٔ ${request.id}${request.date ? ` مورخ ${request.date}` : ""}\n`
    + `طرف مقابل / مرکز هزینه: ${request.party || "—"}\n`
    + `کارشناس خرید: ${expert}\n\n`
    + `اقلام:\n${(items || []).map((i) => `- ${i.title}${i.qty != null ? ` (${i.qty} ${i.unit || ""})` : ""}`).join("\n") || "—"}\n\n`
    + `تأمین‌کنندگان و استعلام‌ها:\n${supplierLines}\n`
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
        + `نامه را بنویس.` }] }],
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new ExtractError(`نگارش نامه نشد: ${String((d.error && d.error.message) || r.status).slice(0, 200)}`, 502);
  const use = (d.content || []).find((c) => c.type === "tool_use");
  if (!use) throw new ExtractError("مدل نامه را ساختاریافته برنگرداند.", 502);

  return {
    letter: { ...use.input, signature: `کارشناس خرید — ${expert}` },
    meta: { model: d.model, prompt_version: LETTER_PROMPT_VERSION, tokens_in: d.usage?.input_tokens, tokens_out: d.usage?.output_tokens },
  };
}
