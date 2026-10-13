/**
 * نگهبانِ کدهای ورودِ چهاررقمی (فاز ۰ طرح «پیام اول، استراتژی‌ها، پروفایل و گراف»، مهر ۱۴۰۵)
 *
 * کدِ کارشناس، کدِ مدیر و رمزِ تب پشتیبانیِ سایت چهار رقم‌اند (۹٬۰۰۰ حالت) و تا این‌جا هر تعدادی آزمودنشان آزاد بود.
 * حالا از هر نشانیِ اینترنت (CF-Connecting-IP) در هر ۱۵ دقیقه فقط ۲۰ کدِ نادرستِ «متفاوت» پذیرفته می‌شود؛ بعد از آن
 * حتی کدِ درست هم تا پایانِ همان بازه ۴۲۹ می‌گیرد، پس حدس زدن به نتیجه نمی‌رسد. کدِ نادرستِ تکراری (مثلاً زبانه‌ای که با
 * کدِ قدیمی هر ۱۰ ثانیه نظرسنجی می‌کند) یک بار شمرده می‌شود، تا شبکهٔ مشترکِ دفتر به خاطرِ یک زبانهٔ کهنه بسته نشود.
 * کد خام ذخیره نمی‌شود — فقط hashِ آن در کنارِ نشانی و بازه.
 *
 * تغییرِ کد از «حساب من» (PUT /me/code) هم سقف دارد: هر کارشناس در روز ۵ بار به «این کد قابل استفاده نیست» می‌خورد و بعد
 * تا فردا نه — وگرنه همین پیام نشان می‌داد کدام کدها مالِ کس دیگری است (و یکی‌شان کدِ مدیر).
 */
import { HttpError } from "./http.js";
import { raiseAlarm } from "./alarms.js";

export const GUARD_DDL = `
CREATE TABLE IF NOT EXISTS auth_fails (k TEXT NOT NULL, win INTEGER NOT NULL, h TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (k, win, h)) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS ix_authf_at ON auth_fails(at);
`;

export const WIN_MS = 15 * 60e3;
export const LIMIT = 20;
export const CODE_DAY_LIMIT = 5;
const DAY_MS = 86400e3;
const now = () => Date.now();
const faN = (s) => String(s).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[+d]);

/** نشانیِ درخواست‌کننده — پشتِ Cloudflare همیشه CF-Connecting-IP هست؛ در آزمون‌ها و wrangler dev «local» */
export function ipOf(request) {
  const h = request && request.headers;
  if (!h) return "local";
  return String(h.get("CF-Connecting-IP") || (h.get("X-Forwarded-For") || "").split(",")[0] || "local").trim() || "local";
}

async function hashOf(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`auth|${s}`));
  return [...new Uint8Array(d)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** دستورِ شمارشِ کدهای نادرستِ متفاوتِ این کلید در بازهٔ جاری — برای batch با خودِ جست‌وجوی کد */
export function failCountStmt(env, k, win) {
  return env.DB.prepare("SELECT COUNT(*) AS n FROM auth_fails WHERE k=? AND win=?").bind(k, win);
}
export const windowOf = (t = now(), ms = WIN_MS) => Math.floor(t / ms);

/** بسته است؟ — n از نتیجهٔ failCountStmt */
export function blockedError(n, limit = LIMIT) {
  if (n < limit) return null;
  return new HttpError("به خاطر کدهای نادرستِ پشت‌سرهم، ورود با کد از این شبکه چند دقیقه بسته است؛ کمی بعد دوباره بزنید.", 429, { retry_after_s: Math.round(WIN_MS / 1000) });
}

/**
 * یک کدِ نادرست ثبت می‌شود (همان کد در همان بازه یک بار). اگر با همین ثبت به سقف رسید، یک هشدار برای مدیر و پشتیبان —
 * فقط همان یک بار در هر بازه (ردیفِ «*alarm»).
 */
export async function recordFail(env, k, code, { win = windowOf(), limit = LIMIT, what = "کد ورود", body, expertId, ctx } = {}) {
  const t = now(), h = await hashOf(String(code || ""));
  await env.DB.prepare("INSERT OR IGNORE INTO auth_fails (k,win,h,at) VALUES (?,?,?,?)").bind(k, win, h, t).run();
  const r = await failCountStmt(env, k, win).first();
  const n = (r && r.n) || 0;
  if (n >= limit) {
    const once = await env.DB.prepare("INSERT OR IGNORE INTO auth_fails (k,win,h,at) VALUES (?,?,'*alarm',?)").bind(`alarm:${k}`, win, t).run();
    if (once.meta && once.meta.changes) {
      await raiseAlarm(env, { kind: "auth_block", title: "تلاش‌های پیاپی با کدِ نادرست",
        body: body || `${faN(n)} ${what}ِ نادرستِ متفاوت از یک شبکه در ${faN(Math.round(WIN_MS / 60e3))} دقیقه؛ ورود با کد از آن شبکه موقتاً بسته شد.`,
        expert_id: expertId || null, payload: { k: k.replace(/^ip:/, ""), n, what } }, ctx).catch((e) => console.error("auth alarm", e && e.message));
    }
  }
  /* پاک‌سازی: ردیف‌های بیش از دو روز (نمایهٔ at) — فقط وقتی کدی نادرست آمده */
  await env.DB.prepare("DELETE FROM auth_fails WHERE at < ?").bind(t - 2 * DAY_MS).run().catch(() => {});
  return n;
}

/** پیش از سنجیدنِ یک کد (مسیرهایی که خودشان batch ندارند): بسته است ← ۴۲۹ */
export async function guardOpen(env, request, { limit = LIMIT } = {}) {
  const k = `ip:${ipOf(request)}`, win = windowOf();
  const r = await failCountStmt(env, k, win).first().catch(() => null);
  const e = blockedError((r && r.n) || 0, limit);
  if (e) throw e;
  return { k, win };
}

/** «حساب من»: کارشناس در روز چند بار به کدِ گرفته‌شده خورده؟ — بیش از سقف ← ۴۲۹ */
export async function codeChangeOpen(env, expertId) {
  const k = `code:${expertId}`, win = windowOf(now(), DAY_MS);
  const r = await failCountStmt(env, k, win).first().catch(() => null);
  if (((r && r.n) || 0) >= CODE_DAY_LIMIT) throw new HttpError("امروز چند بار کدی را زده‌اید که قابل استفاده نبود؛ فردا دوباره امتحان کنید یا از پشتیبانی بخواهید کد را عوض کند.", 429);
  return { k, win };
}
export async function codeChangeConflict(env, g, code) {
  const expertId = Number(String(g.k).split(":")[1]) || null;
  return recordFail(env, g.k, code, { win: g.win, limit: CODE_DAY_LIMIT, what: "کدِ گرفته‌شده در «حساب من»", expertId,
    body: `کارشناسی امروز ${faN(CODE_DAY_LIMIT)} بار در «حساب من» کدی زد که مالِ کس دیگری بود؛ تغییرِ کد برایش تا فردا بسته شد.` });
}
