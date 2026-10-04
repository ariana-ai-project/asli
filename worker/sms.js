/**
 * پیامک — درگاه TextBee (مهر ۱۴۰۵)
 *
 * TextBee یک گوشی اندرویدی را درگاه پیامک می‌کند: سامانه به API آن می‌گوید چه بفرستد و همان گوشی با سیم‌کارتِ
 * خودش پیامک را می‌فرستد. پس فرستنده همان شمارهٔ سیم‌کارتِ آن گوشی است و هزینه‌اش با همان سیم‌کارت.
 *
 *   POST https://api.textbee.dev/api/v1/gateway/send-sms
 *   x-api-key: TEXTBEE_API_KEY        بدنه: {recipients: ["+98912…"], message, deviceId?}
 *
 * پاسخ ۲۰۰ یعنی «به صفِ گوشی رفت»، نه «رسید» — رسیدنش را خودِ گوشی در داشبورد TextBee گزارش می‌کند.
 * ۴۰۱ کلید نادرست، ۴۰۰ «گوشیِ فعالی نیست»، ۴۲۹ سقفِ پلن (رایگان: ۵۰ پیامک در روز و ۳۰۰ در ماه) — در هر سه
 * هیچ پیامکی نرفته است.
 *
 * راز: wrangler secret put TEXTBEE_API_KEY — مخزن عمومی است؛ کلید هرگز در کد یا wrangler.toml نمی‌نشیند.
 * اختیاری: TEXTBEE_DEVICE_ID؛ بی آن، TextBee گوشیِ پیش‌فرض (یا تازه‌ترین گوشیِ فعال) را برمی‌دارد.
 * TEXTBEE_API_BASE فقط برای آزمون‌ها و توسعهٔ محلی است.
 */
const T = (v) => String(v == null ? "" : v).trim();
const FA = "۰۱۲۳۴۵۶۷۸۹", AR = "٠١٢٣٤٥٦٧٨٩";
const latin = (s) => String(s == null ? "" : s).replace(/[۰-۹]/g, (d) => String(FA.indexOf(d))).replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)));
const BASE = (env) => `${T(env.TEXTBEE_API_BASE) || "https://api.textbee.dev"}/api/v1/gateway`;

/** درگاه وصل است؟ (کلید ست شده) */
export const smsReady = (env) => !!T(env && env.TEXTBEE_API_KEY);

/** شماره به قالب بین‌المللی: 09121234567 → +989121234567؛ شمارهٔ + همان؛ بقیه null (ثابت پیامک نمی‌گیرد) */
export function e164(phone) {
  const s = latin(phone).replace(/[\s\-().]/g, "");
  if (/^09\d{9}$/.test(s)) return `+98${s.slice(1)}`;
  if (/^\+989\d{9}$/.test(s)) return s;
  if (/^00989\d{9}$/.test(s)) return `+${s.slice(2)}`;
  if (/^\+\d{8,15}$/.test(s)) return s;
  return null;
}
/** شمارهٔ همراهِ ایران (پیامک‌پذیر) */
export const isMobile = (phone) => /^\+989\d{9}$/.test(e164(phone) || "");

export class SmsError extends Error {
  constructor(message, code, status) { super(message); this.code = code; this.status = status || 0; }
}
const WHY = {
  auth: "کلید TextBee پذیرفته نشد",
  quota: "سقف پیامکِ پلن TextBee پر شده است",
  rejected: "TextBee درخواست را نپذیرفت",
  network: "درگاه پیامک در دسترس نبود",
  error: "پیامک فرستاده نشد",
};

/**
 * یک پیامک. خروجی {ok, provider, ref, to}؛ هر شکستی SmsError با پیام فارسی و کد (off | bad_number | auth | quota |
 * rejected | network | error). متنِ پیامک (که رمز ورود در آن است) هیچ‌جا لاگ نمی‌شود.
 */
export async function sendSms(env, to, text) {
  if (!smsReady(env)) throw new SmsError("درگاه پیامک وصل نیست.", "off");
  const num = e164(to);
  if (!num) throw new SmsError("این شماره پیامک نمی‌گیرد.", "bad_number");
  const body = { recipients: [num], message: String(text || "") };
  if (T(env.TEXTBEE_DEVICE_ID)) body.deviceId = T(env.TEXTBEE_DEVICE_ID);
  let r;
  try {
    r = await fetch(`${BASE(env)}/send-sms`, {
      method: "POST",
      headers: { "x-api-key": T(env.TEXTBEE_API_KEY), "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new SmsError(`${WHY.network}: ${String((e && e.message) || e).slice(0, 120)}`, "network");
  }
  const d = await r.json().catch(() => ({}));
  const data = d && typeof d.data === "object" && d.data ? d.data : {};
  if (!r.ok || data.success === false || d.success === false) {
    const code = r.status === 401 || r.status === 403 ? "auth" : r.status === 429 ? "quota" : r.status === 400 ? "rejected" : "error";
    const why = T(d.error || d.message || data.message);
    throw new SmsError(`${WHY[code]}${why ? ` (${why.slice(0, 120)})` : ` (${r.status})`}`, code, r.status);
  }
  return { ok: true, provider: "textbee", ref: data.smsBatchId || null, to: num };
}
