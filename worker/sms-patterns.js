/**
 * الگوهای پیامکِ IPPanel (آبان ۱۴۰۵)
 *
 * پیامکِ متن‌آزاد روی خطِ مشترکِ IPPanel بررسیِ دستی می‌شود: چند دقیقه «درانتظار تایید» و گاهی «رد شده» (۸ آبان، گزارشِ سامانه).
 * الگوی تأییدشده بی بررسی و فوری می‌رود. تعریفِ هر الگو همین‌جاست. برنامهٔ پل روی سرورِ شرکت (scripts/vps/sms_relay.py) با
 * GET /relay/patterns این تعریف‌ها را می‌گیرد، در IPPanel می‌سازد (کلیدِ IPPanel فقط آن‌جاست)، وضعیتِ تأییدشان را می‌پرسد و در
 * تپشش برمی‌گرداند. worker/relay.js وضعیت‌ها را در settings.smsPatterns نگه می‌دارد.
 *
 *   • صدازننده با opts.pattern = {key, params} (و رمزِ ورود با opts.otp) می‌گوید این پیامک کدام الگوست. تا الگو «فعال» نشده یا
 *     پارامتری کم است، همان متنِ کاملِ قبلی (webservice) می‌رود — هیچ پیامکی به خاطرِ الگو نمی‌ماند.
 *   • متن عوض شود، hash عوض می‌شود و پل الگوی تازه می‌سازد؛ الگوی کهنه به کار نمی‌رود.
 *   • متغیرِ IPPanel حداکثر ۴۰ نویسه است (cut). پیامکِ دعوت کالا را نمی‌گوید، فقط «درخواست خرید دارد» (درخواست مالک، ۸ آبان).
 */
/* همان TENDER_PATHِ worker/tender.js — این‌جا تکرار شده چون tender.js خودش sms.js را وارد می‌کند (حلقه نشود) */
const TENDER_PATH_ = "/tamin-poshtibani/tender";
const T =(v) => String(v == null ? "" : v).trim();
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const company = (env) => T(env && env.COMPANY) || "تونل سد آریانا";
const site = (env) => T(env && env.SITE_ORIGIN) || "https://arianaai.website";
/** مقدارِ متغیرِ الگو: یک خط و حداکثر ۴۰ نویسه */
export const cut = (v, n = 40) => { const s = T(v).replace(/\s+/g, " "); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
/**
 * متغیرِ عددی (IPPanel «params.x باید از نوع عددی باشد»): رقمِ فارسی و عربی لاتین می‌شود؛ مقداری که چیزِ دیگری دارد (مثلاً کدِ
 * هگزِ مناقصه‌های قدیمی «4a0f…») خالی برمی‌گردد تا همان متنِ کامل برود — بریدنِ حروف لینکِ اشتباه می‌ساخت
 */
const digits = (v) => {
  const s = T(v).replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
  return /^\d{1,15}$/.test(s) ? s : "";
};
/** ساعتِ تهران به شکلِ عددِ HHMM (برای الگوی test) */
export function tehranCode(t = Date.now()) {
  try {
    const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(t));
    return `${p.find((x) => x.type === "hour").value}${p.find((x) => x.type === "minute").value}`;
  } catch (_) { return new Date(t).toISOString().slice(11, 16).replace(":", ""); }
}

/** متنِ آغازِ پیامکِ دعوتِ تأمین‌کننده (استعلام، کارشناس هوشمند، فراخوانِ پیش‌فاکتور) — همان متنِ الگوی invite */
export const buyIntro = (env) => `شرکت ${company(env)} درخواست خرید دارد.`;

/**
 * تعریف‌ها: key، نامِ فارسی برای پنل، متن با %متغیر%، فهرستِ متغیرها و types (متغیرِ عددی: integer).
 * پاسخِ IPPanel در ۸ آبان: otp، invite، thanks و test تأیید؛ tender_invite، tender_note و report «نیازمندِ معرفی‌نامه از راهِ تیکت»؛
 * alarm «متن پترن نمی‌تواند متغیر ثبت شود» (عنوانِ آزاد) — حالا فقط کدِ عددی دارد؛ test را IPPanel عددی کرد — حالا کدِ عددیِ ساعت.
 * بارِ دوم alarm هم «نیازمندِ معرفی‌نامه» شد؛ چهار الگوی مانده به شکلِ تأییدشده‌ها بازنویسی شدند (بی «هشدار»، «مناقصه» و متنِ آزاد).
 */
function raw(env) {
  const co = company(env), s = site(env);
  return [
    { key: "otp", fa: "رمز ورود", vars: ["code"],
      message: `رمز ورود شما به سامانه تأمین شرکت ${co}: %code%` },
    { key: "invite", fa: "دعوت تأمین‌کننده", vars: ["k", "code"],
      message: `${buyIntro(env)}\nورود به پنل تأمین‌کنندگان: ${s}/tamin-poshtibani/supplier#k=%k%\nرمز ورود: %code%` },
    /* مناقصه، هشدار و گزارش دو بار «نیازمندِ معرفی‌نامه» شدند؛ حالا به شکلِ الگوهای تأییدشده (متنِ خدماتیِ کوتاه با لینک یا کدِ عددی) */
    { key: "tender_invite", fa: "دعوت به مناقصه", vars: ["code"],
      message: `${buyIntro(env)}\nورود با شمارهٔ همین گوشی: ${s}${TENDER_PATH_}#t=%code%` },
    { key: "tender_note", fa: "خبرِ مناقصه", vars: ["code"],
      message: `شرکت ${co}: وضعیت درخواست خرید شما تغییر کرد؛ برای دیدن جزئیات وارد شوید:\n${s}${TENDER_PATH_}#t=%code%` },
    { key: "thanks", fa: "تشکر بعد از کمیسیون", vars: ["req"],
      message: `شرکت ${co}: از پیشنهادتان برای استعلام %req% سپاسگزاریم. این بار خرید از تأمین‌کنندهٔ دیگری انجام شد؛ امیدواریم در خریدهای بعدی همکاری کنیم.` },
    { key: "alarm", fa: "هشدار و اعلان به همکاران", vars: ["code"], types: { code: "integer" },
      message: `سامانه تأمین شرکت ${co}: یک مورد تازه برای بررسی در پنل ثبت شد. کد %code%` },
    { key: "test", fa: "پیامک آزمایشی", vars: ["code"], types: { code: "integer" },
      message: `پیامک آزمایشی سامانه تأمین شرکت ${co} — کد %code%` },
    { key: "report", fa: "گزارش سامانه", vars: ["ok", "fail"], types: { ok: "integer", fail: "integer" },
      message: `سامانه تأمین شرکت ${co}: آزمون‌های دوره‌ای انجام شد؛ %ok% مورد موفق و %fail% مورد ناموفق.` },
  ];
}
/** FNV-1a کوتاه — برای این‌که متنِ عوض‌شده الگوی تازه بخواهد */
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}
/** تعریف‌ها با hash — همان چیزی که GET /relay/patterns به پل می‌دهد */
export function patternDefs(env) {
  /* hashِ الگوهای بی types همان قبلی می‌ماند (otp، invite و thanks تأییدشده‌اند و نباید دوباره ساخته شوند) */
  return raw(env).map((d) => ({ ...d, types: d.types || {}, hash: hash(`${d.message}|${d.vars.join(",")}${d.types ? `|${JSON.stringify(d.types)}` : ""}`),
    title: `ariana-${d.key}`, description: `سامانه تأمین شرکت ${company(env)} — ${d.fa}` }));
}
export const PATTERN_KEYS = ["otp", "invite", "tender_invite", "tender_note", "thanks", "alarm", "test", "report"];

/** وضعیت‌های گزارش‌شدهٔ پل: {key: {code, status, status_fa, reject, hash}} */
export async function patternStates(env) {
  if (!env || !env.DB) return {};
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key='smsPatterns'").first().catch(() => null);
  const v = parse(r && r.value, {});
  return v && typeof v === "object" ? v : {};
}

/**
 * الگوی فعالِ این پیامک یا null: opts.pattern = {key, params}؛ رمزِ ورود (opts.otp) بی الگوی صریح یعنی «otp».
 * فقط اگر پل گفته «active» است، hash همان متنِ امروز است و همهٔ متغیرها مقدار دارند.
 */
export async function activePattern(env, opts = {}) {
  const want = opts.pattern && opts.pattern.key ? opts.pattern : T(opts.otp) ? { key: "otp", params: { code: T(opts.otp) } } : null;
  if (!want) return null;
  const def = patternDefs(env).find((d) => d.key === want.key);
  if (!def) return null;
  const st = (await patternStates(env))[want.key];
  if (!st || st.status !== "active" || !T(st.code) || st.hash !== def.hash) return null;
  const params = {};
  for (const v of def.vars) params[v] = def.types[v] === "integer" ? digits(want.params && want.params[v]) : cut(want.params && want.params[v]);
  if (def.vars.some((v) => !params[v])) return null;
  return { key: def.key, code: T(st.code), params };
}

/** متنِ کاملِ یک الگو با مقدارها — برای تاریخچه و پیش‌نمایش */
export const renderPattern = (def, params) => def.message.replace(/%(\w+)%/g, (_, v) => T(params && params[v]));
