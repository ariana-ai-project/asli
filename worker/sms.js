/**
 * پیامک — لایهٔ درگاه (مهر ۱۴۰۵)
 *
 * بیرونِ این فایل همان چند چیزِ قبلی را می‌بیند — sendSms، smsReady و SmsError (و e164، isMobile، phoneChars، BIDI) — و نمی‌داند
 * پیامک از کدام درگاه می‌رود؛ درگاه را SMS_PROVIDER می‌گوید: «textbee» (پیش‌فرض) یا «ippanel». مالک برای راه‌اندازیِ واقعی کلیدِ
 * پنلِ پیامکِ تازه‌ای داد (شرکتش هنوز قطعی نیست؛ شکلِ کلید مالِ پنل‌های خانوادهٔ IPPanel است)، پس درگاه پشتِ یک لایه رفت تا
 * عوض کردنش فقط چند متغیرِ محیطی باشد، نه دست زدن به ده جای کد (مکاتبات، کارشناس هوشمند، هشدار، کمیسیون، مناقصه).
 *
 * ── textbee (پیش‌فرض؛ رفتارِ پیشین بی‌تغییر) ──────────────────────────────────────────────────
 * TextBee یک گوشی اندرویدی را درگاه پیامک می‌کند: سامانه به API آن می‌گوید چه بفرستد و همان گوشی با سیم‌کارتِ خودش
 * پیامک را می‌فرستد. پس فرستنده همان شمارهٔ سیم‌کارتِ آن گوشی است و هزینه‌اش با همان سیم‌کارت.
 *   POST https://api.textbee.dev/api/v1/gateway/send-sms   x-api-key: TEXTBEE_API_KEY   بدنه: {recipients: ["+98912…"], message, deviceId?}
 *   GET  https://api.textbee.dev/api/v1/gateway/devices    «تستِ درگاه»: گوشی‌های حساب، بی فرستادنِ پیامک
 * پاسخ ۲۰۰ یعنی «به صفِ گوشی رفت»، نه «رسید» — رسیدنش را خودِ گوشی در داشبورد TextBee گزارش می‌کند.
 * ۴۰۱ کلید نادرست، ۴۰۰ «گوشیِ فعالی نیست»، ۴۲۹ سقفِ پلن (رایگان: ۵۰ پیامک در روز و ۳۰۰ در ماه) — در هر سه هیچ پیامکی نرفته است.
 * رازها: TEXTBEE_API_KEY؛ اختیاری TEXTBEE_DEVICE_ID (بی آن، گوشیِ پیش‌فرض یا تازه‌ترین گوشیِ فعال). TEXTBEE_API_BASE فقط آزمون.
 *
 * ── ippanel (REST «Edge»؛ مستندِ رسمی: https://ippanelcom.github.io/Edge-Document/docs/) ─────────────
 *   پایه: https://edge.ippanel.com/v1      Authorization: IPPANEL_API_KEY — خودِ کلید، بی Bearer (همان SDKِ رسمیِ Node: ippanel/node-sdk)
 *   POST {پایه}/api/send  ساده: {sending_type: "webservice", from_number: "+983000505", message, params: {recipients: ["+98912…"]}}
 *   POST {پایه}/api/send  الگو: {sending_type: "pattern", from_number, code: IPPANEL_PATTERN_OTP, recipients: ["+98912…"], params: {code: "123456"}}
 *   GET  {پایه}/api/payment/credit/mine    اعتبارِ حساب — «تستِ درگاه» بی فرستادنِ پیامک
 * پاسخ همیشه {data, meta: {status, message, message_code, errors}}؛ موفق: meta.status=true و data.message_outbox_ids. کلیدِ نادرست ۴۰۱
 * (message_code «400-1»)، درخواستِ نامعتبر ۴۲۲ («400-2» با errors). «اعتبار کافی نیست» در مستند کدی ندارد: از ۴۰۲ یا ۴۲۹ یا متنِ پیام
 * شناخته می‌شود (NO_CREDIT). گیرنده و خطِ فرستنده هر دو E.164 با +98 — خط هر شکلی نوشته شود همین می‌شود (lineE164).
 * رازها: IPPANEL_API_KEY و IPPANEL_FROM (خطِ فرستنده)؛ اختیاری IPPANEL_PATTERN_OTP (کدِ الگوی رمز) و IPPANEL_PATTERN_VAR (نامِ متغیرِ
 * همان الگو، پیش‌فرض code). IPPANEL_API_BASE فقط آزمون.
 *
 * رمزِ ورود (OTP): صدازننده opts.otp می‌دهد («ارسال رمز» پنل تأمین‌کننده و رمزِ مناقصه). اگر درگاه الگوی رمز دارد (IPPanel با
 * IPPANEL_PATTERN_OTP) فقط همان رمز با الگو می‌رود — پیامکِ الگو در پنل‌های ایرانی خدماتی حساب می‌شود و فهرستِ سیاهِ تبلیغاتی جلویش
 * را نمی‌گیرد — وگرنه همان متنِ کامل. کلیدها هرگز در کد یا wrangler.toml نمی‌نشینند (مخزن عمومی است): wrangler secret put.
 */
const T = (v) => String(v == null ? "" : v).trim();
const FA = "۰۱۲۳۴۵۶۷۸۹", AR = "٠١٢٣٤٥٦٧٨٩";
const latin = (s) => String(s == null ? "" : s).replace(/[۰-۹]/g, (d) => String(FA.indexOf(d))).replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)));

/**
 * جهت‌نماها و نویسه‌های بی‌پهنا که با کپیِ شماره از دفترچهٔ تلفن، تلگرام یا واتس‌اپ می‌آیند (LRM، RLM، ALM،
 * LRE…RLO، LRI…PDI، فاصلهٔ بی‌پهنا، BOM) — نیم‌فاصله نه، چون در برچسبِ فارسیِ کنارِ شماره لازم است
 */
export const BIDI = /[؜​‎‏‪-‮⁦-⁩﻿]/g;
/**
 * فقط رقم و +، با رقمِ فارسی و عربیِ لاتین‌شده: فاصله، خط‌تیره، پرانتز و هر نویسهٔ نامرئی می‌رود.
 * «‎+989121234567‎»ی کپی‌شده با جهت‌نماهایش پیش از این نامعتبر می‌شد (مهر ۱۴۰۵).
 */
export const phoneChars = (raw) => latin(raw).replace(/[＋﹢]/g, "+").replace(/[^\d+]/g, "");

/** شماره به قالب بین‌المللی: 09121234567، 9121234567، 989…، 0098…، +98 0912… → +989121234567؛ شمارهٔ + همان؛ بقیه null (ثابت پیامک نمی‌گیرد) */
export function e164(phone) {
  const s = phoneChars(phone);
  const ir = /^(?:\+98|0098|98)?0?(9\d{9})$/.exec(s);
  if (ir) return `+98${ir[1]}`;
  if (/^\+\d{8,15}$/.test(s)) return s;
  return null;
}
/** شمارهٔ همراهِ ایران (پیامک‌پذیر) */
export const isMobile = (phone) => /^\+989\d{9}$/.test(e164(phone) || "");
/** خطِ فرستندهٔ پنل به شکلِ E.164: «3000505»، «03000505»، «983000505» و «+983000505» یکی‌اند؛ خالی → "" */
export function lineE164(raw) {
  const s = phoneChars(raw);
  if (!s) return "";
  if (s[0] === "+") return s;
  if (s.startsWith("0098")) return `+${s.slice(2)}`;
  if (s.startsWith("98")) return `+${s}`;
  return `+98${s.replace(/^0+/, "")}`;
}

export class SmsError extends Error {
  constructor(message, code, status) { super(message); this.code = code; this.status = status || 0; }
}
/** درخواست به درگاه: خطای شبکه SmsError فارسی؛ بدنهٔ غیر JSON یعنی {} */
async function req(url, init, why) {
  let r;
  try { r = await fetch(url, init); } catch (e) { throw new SmsError(`${why.network}: ${String((e && e.message) || e).slice(0, 120)}`, "network"); }
  return { r, d: (await r.json().catch(() => ({}))) || {} };
}
/** «چرا»ی فارسی + توضیحِ خودِ درگاه (یا کدِ HTTP) */
const fail = (why, code, detail, status) => new SmsError(`${why[code]}${T(detail) ? ` (${T(detail).slice(0, 120)})` : ` (${status})`}`, code, status);

/* ------------------------------------------------------------------ */
/* TextBee                                                              */
/* ------------------------------------------------------------------ */
const TB = (env) => `${T(env.TEXTBEE_API_BASE) || "https://api.textbee.dev"}/api/v1/gateway`;
const TB_WHY = {
  auth: "کلید TextBee پذیرفته نشد",
  quota: "سقف پیامکِ پلن TextBee پر شده است",
  rejected: "TextBee درخواست را نپذیرفت",
  network: "درگاه پیامک در دسترس نبود",
  error: "پیامک فرستاده نشد",
};
const tbCode = (s) => (s === 401 || s === 403 ? "auth" : s === 429 ? "quota" : s === 400 ? "rejected" : "error");
const textbee = {
  label: "TextBee", key: "TEXTBEE_API_KEY", dev: "TEXTBEE_DEVICE_ID", devFa: "شناسهٔ دستگاه", need: ["TEXTBEE_API_KEY"],
  info: (env) => ({ device: T(env.TEXTBEE_DEVICE_ID) || null }),
  async send(env, num, text) {
    const body = { recipients: [num], message: text };
    if (T(env.TEXTBEE_DEVICE_ID)) body.deviceId = T(env.TEXTBEE_DEVICE_ID);
    const { r, d } = await req(`${TB(env)}/send-sms`, {
      method: "POST", headers: { "x-api-key": T(env.TEXTBEE_API_KEY), "content-type": "application/json" }, body: JSON.stringify(body),
    }, TB_WHY);
    const data = typeof d.data === "object" && d.data ? d.data : {};
    if (!r.ok || data.success === false || d.success === false) throw fail(TB_WHY, tbCode(r.status), d.error || d.message || data.message, r.status);
    return { ok: true, provider: "textbee", ref: data.smsBatchId || null, to: num };
  },
  /** گوشی‌های حساب: کلید درست است و گوشیِ روشنی (یا همان TEXTBEE_DEVICE_ID) هست؟ */
  async check(env) {
    const { r, d } = await req(`${TB(env)}/devices`, { headers: { "x-api-key": T(env.TEXTBEE_API_KEY) } }, TB_WHY);
    if (!r.ok) throw fail(TB_WHY, tbCode(r.status), d.error || d.message, r.status);
    const list = (Array.isArray(d.data) ? d.data : []).filter((x) => x && typeof x === "object");
    const on = list.filter((x) => x.enabled !== false);
    const want = T(env.TEXTBEE_DEVICE_ID), dev = want ? list.find((x) => x._id === want) : null;
    const ok = want ? !!dev && dev.enabled !== false : on.length > 0;
    return { ok, devices: list.length, enabled: on.length,
      ...(dev ? { device: T(dev.name) || [dev.brand, dev.model].filter(Boolean).join(" ") || want, last: dev.lastHeartbeat || null } : {}),
      error: ok ? null : want && !dev ? "گوشیِ TEXTBEE_DEVICE_ID در این حساب نیست." : want ? "گوشیِ TEXTBEE_DEVICE_ID خاموش است." : "گوشیِ روشنی در حساب TextBee نیست." };
  },
};

/* ------------------------------------------------------------------ */
/* IPPanel (Edge)                                                        */
/* ------------------------------------------------------------------ */
const IP = (env) => T(env.IPPANEL_API_BASE) || "https://edge.ippanel.com/v1";
const IP_WHY = {
  auth: "کلید IPPanel پذیرفته نشد",
  quota: "اعتبار یا سقفِ ارسالِ پنل پیامک (IPPanel) کافی نیست",
  rejected: "IPPanel درخواست را نپذیرفت",
  network: "درگاه پیامک در دسترس نبود",
  error: "پیامک فرستاده نشد",
};
/* «اعتبار کافی نیست» کدی در مستند ندارد؛ «اعتبارسنجی» (خطای فیلد) نباید اعتبارِ حساب حساب شود، پس «اعتبار» فقط با کافی/کم/تمام */
const NO_CREDIT = /عدم\s*(?:اعتبار|موجودی)|(?:اعتبار|موجودی)(?!\s*سنج)[^.،\n]{0,30}(?:کافی|ناکافی|کم|تمام)|موجودی\s*حساب|شارژ|insufficient|not enough credit|low credit|balance/i;
const ipHead = (env) => ({ Authorization: T(env.IPPANEL_API_KEY), "Content-Type": "application/json", Accept: "application/json" });
const ipMeta = (d) => (typeof d.meta === "object" && d.meta ? d.meta : {});
/** خطای IPPanel: کلید (۴۰۱/۴۰۳ یا «400-1») · اعتبار و سقف (۴۰۲، ۴۲۹ یا متنِ پیام) · بقیهٔ ردها · خطای سرور */
function ipFail(r, d) {
  const m = ipMeta(d);
  const errs = m.errors && typeof m.errors === "object" ? Object.values(m.errors).flat().map(T).filter(Boolean) : [];
  const detail = T(m.message) || errs[0] || T(d.message || d.error);
  const s = r.status;
  const code = s === 401 || s === 403 || m.message_code === "400-1" ? "auth"
    : s === 402 || s === 429 || NO_CREDIT.test(`${detail} ${errs.join(" ")}`) ? "quota"
    : s >= 500 ? "error" : "rejected";
  return fail(IP_WHY, code, detail, s);
}
const odd = (s) => new SmsError(`${IP_WHY.error} (پاسخِ نامفهومِ IPPanel)`, "error", s);
const ippanel = {
  label: "IPPanel", key: "IPPANEL_API_KEY", dev: "IPPANEL_FROM", devFa: "خط فرستنده", need: ["IPPANEL_API_KEY", "IPPANEL_FROM"],
  info: (env) => ({ from: lineE164(env.IPPANEL_FROM) || null, pattern: T(env.IPPANEL_PATTERN_OTP) || null, pattern_var: T(env.IPPANEL_PATTERN_VAR) || "code" }),
  async send(env, num, text, opts) {
    const from = lineE164(env.IPPANEL_FROM), pat = T(env.IPPANEL_PATTERN_OTP), otp = T(opts.otp);
    const body = otp && pat
      ? { sending_type: "pattern", from_number: from, code: pat, recipients: [num], params: { [T(env.IPPANEL_PATTERN_VAR) || "code"]: otp } }
      : { sending_type: "webservice", from_number: from, message: text, params: { recipients: [num] } };
    const { r, d } = await req(`${IP(env)}/api/send`, { method: "POST", headers: ipHead(env), body: JSON.stringify(body) }, IP_WHY);
    const m = ipMeta(d), ids = d.data && Array.isArray(d.data.message_outbox_ids) ? d.data.message_outbox_ids : [];
    if (!r.ok || m.status === false) throw ipFail(r, d);
    /* ۲۰۰ بی meta.status و بی شناسه (صفحهٔ واسط، پروکسی…) یعنی معلوم نیست رفت — رفته حساب نمی‌شود */
    if (m.status !== true && !ids.length) throw odd(r.status);
    return { ok: true, provider: "ippanel", ref: ids.length ? String(ids[0]) : null, to: num, ...(body.sending_type === "pattern" ? { pattern: true } : {}) };
  },
  /** اعتبارِ حساب: کلید درست است و چیزی برای فرستادن مانده؟ */
  async check(env) {
    const { r, d } = await req(`${IP(env)}/api/payment/credit/mine`, { headers: ipHead(env) }, IP_WHY);
    if (!r.ok || ipMeta(d).status === false) throw ipFail(r, d);
    const c = typeof d.data === "object" && d.data ? d.data : null;
    if (!c) throw odd(r.status);
    const credit = Number(c.credit), gift = Number(c.gift);
    const ok = !(Number.isFinite(credit) && credit <= 0);
    return { ok, credit: Number.isFinite(credit) ? credit : null, gift: Number.isFinite(gift) ? gift : 0, at: T(c.updated_at) || null,
      error: ok ? null : "اعتبارِ پنل پیامک تمام شده است." };
  },
};

/* ------------------------------------------------------------------ */
/* لایهٔ درگاه                                                           */
/* ------------------------------------------------------------------ */
const PROVIDERS = { textbee, ippanel };
const rawName = (env) => T(env && env.SMS_PROVIDER).toLowerCase() || "textbee";
/** درگاهِ فعال (textbee | ippanel)؛ نامِ ناشناخته null — پیامک نمی‌رود، نه این‌که بی‌صدا از درگاهِ دیگری برود */
export function smsProvider(env) {
  const p = rawName(env);
  return Object.prototype.hasOwnProperty.call(PROVIDERS, p) ? p : null;
}
/** نامِ نمایشیِ درگاهِ فعال برای پنل‌ها */
export const smsLabel = (env) => { const p = smsProvider(env); return p ? PROVIDERS[p].label : rawName(env); };
/** نامِ نمایشیِ ستونِ via (sp_sms) — نامِ درگاه؛ sim و hold و قدیمی‌ها null */
export const viaLabel = (via) => (Object.prototype.hasOwnProperty.call(PROVIDERS, via) ? PROVIDERS[via].label : null);
/** پیامک به درگاه رفت؟ via نامِ درگاه است، sim (شبیه‌سازی) و hold (نگه داشته) یعنی نه */
export const viaSent = (via) => !!via && via !== "sim" && via !== "hold";

/** درگاه وصل است؟ (درگاهِ شناخته و همهٔ متغیرهای لازمش ست شده) */
export const smsReady = (env) => { const p = smsProvider(env); return !!p && PROVIDERS[p].need.every((k) => !!T((env || {})[k])); };

/**
 * وضعیتِ فقط‌خواندنی برای پنل پشتیبانی — بی هیچ کلید: {provider, label, known, ready, missing: [نامِ متغیرهای ست‌نشده], …}
 * (TextBee: device؛ IPPanel: from، pattern، pattern_var)
 */
export function smsStatus(env) {
  const p = smsProvider(env), e = env || {};
  if (!p) return { provider: rawName(env), label: rawName(env), known: false, ready: false, missing: [], dev_fa: "",
    note: `SMS_PROVIDER=«${rawName(env)}» شناخته نیست (textbee یا ippanel)؛ پیامکی نمی‌رود.` };
  const d = PROVIDERS[p];
  const missing = d.need.filter((k) => !T(e[k]));
  return { provider: p, label: d.label, known: true, ready: !missing.length, missing, dev_fa: d.devFa, ...d.info(e) };
}

/**
 * env با کلید (و دستگاه یا خطِ فرستندهٔ) جدا برای درگاهِ فعال — مناقصه می‌تواند کلیدِ خودش را داشته باشد (tender.js:smsEnv).
 * device در TextBee شناسهٔ گوشی است و در IPPanel خطِ فرستنده.
 */
export function smsEnvWith(env, o) {
  const p = smsProvider(env), key = T(o && o.key), dev = T(o && o.device);
  if (!p || (!key && !dev)) return env;
  const d = PROVIDERS[p];
  return { ...env, ...(key ? { [d.key]: key } : {}), ...(dev ? { [d.dev]: dev } : {}) };
}

/**
 * یک پیامک. خروجی {ok, provider, ref, to, pattern?}؛ هر شکستی SmsError با پیام فارسی و کد (off | bad_number | auth | quota |
 * rejected | network | error). opts.otp: رمزِ همین پیامک — درگاهی که الگوی رمز دارد فقط همان را با الگو می‌فرستد.
 * متنِ پیامک (که رمز ورود در آن است) هیچ‌جا لاگ نمی‌شود.
 */
export async function sendSms(env, to, text, opts = {}) {
  if (!smsReady(env)) throw new SmsError("درگاه پیامک وصل نیست.", "off");
  const num = e164(to);
  if (!num) throw new SmsError("این شماره پیامک نمی‌گیرد.", "bad_number");
  return PROVIDERS[smsProvider(env)].send(env, num, String(text || ""), opts || {});
}

/**
 * «تستِ درگاه» بی فرستادنِ پیامک: کلید و حساب سنجیده می‌شود (IPPanel: اعتبار؛ TextBee: گوشی‌ها). همیشه یک شیء برمی‌گردد، نه خطا —
 * {ok, provider, label, error, code?, credit?, gift?, at?, devices?, enabled?, device?, last?} — تا پنل نتیجه را همان‌جا نشان دهد.
 */
export async function smsCheck(env) {
  const st = smsStatus(env);
  const base = { provider: st.provider, label: st.label };
  if (!st.ready) return { ...base, ok: false, code: "off", error: st.known ? `درگاه وصل نیست — ست نشده: ${st.missing.join("، ")}` : st.note };
  try { return { ...base, ...(await PROVIDERS[st.provider].check(env)) }; }
  catch (e) { return { ...base, ok: false, code: (e && e.code) || "error", error: String((e && e.message) || e).slice(0, 300) }; }
}
