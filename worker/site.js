/**
 * تب «پشتیبانی» صفحهٔ اول — وضعیت کارت‌های بخش‌ها و رمز مشترک.
 *
 * وضعیت کارت‌ها باید برای همهٔ بازدیدکننده‌ها یکی باشد، پس در جدول settings
 * می‌نشیند نه در مرورگر. کلیدهای این‌جا عمداً در DEFAULTS نیستند تا به پنل
 * تأمین و پشتیبانی درز نکنند (settingsFromRows فقط کلیدهای DEFAULTS را می‌دهد).
 *
 * رمز: خودش ذخیره نمی‌شود، فقط SHA-256 آن. تا وقتی رمزی تعریف نشده، کد مدیر
 * (MANAGER_CODE) در تب را باز می‌کند؛ بعد از تعریف رمز، هر دو کار می‌کنند تا
 * اگر رمز مشترک را فراموش کردند مدیر بتواند عوضش کند.
 */
import { HttpError } from "./http.js";

const KEY_CARDS = "siteCards";
const KEY_PASS = "sitePassHash";
export const CARD_STATES = ["active", "soon", "off"];
const CODE_RE = /^\d{4,8}$/;
const T = (v) => String(v == null ? "" : v).trim();
/* شناسهٔ کارت‌ها همان data-dept صفحهٔ اول است */
const DEPT_RE = /^[a-z][a-z0-9-]{1,30}$/;

async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function readKeys(env) {
  const rows = (await env.DB.prepare("SELECT key,value FROM settings WHERE key IN (?,?)").bind(KEY_CARDS, KEY_PASS).all()).results || [];
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

function parseCards(raw) {
  let v = null;
  try { v = JSON.parse(raw || "null"); } catch (_) { /* مقدار خراب — انگار چیزی ذخیره نشده */ }
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out = {};
  for (const [dept, state] of Object.entries(v)) if (DEPT_RE.test(dept) && CARD_STATES.includes(state)) out[dept] = state;
  return out;
}

/** آنچه صفحهٔ اول بدون ورود می‌خواند: وضعیت کارت‌ها و این‌که رمزی تعریف شده یا نه */
export async function siteState(env) {
  const k = await readKeys(env);
  return { cards: parseCards(k[KEY_CARDS]), hasPass: !!k[KEY_PASS] };
}

/** رمز تب: رمز مشترک، یا کد مدیر */
export async function checkSiteCode(env, code) {
  const c = T(code);
  if (!c) return false;
  if (env.MANAGER_CODE && c === env.MANAGER_CODE) return true;
  const k = await readKeys(env);
  return !!k[KEY_PASS] && k[KEY_PASS] === (await sha256(c));
}

async function requireSite(env, code) {
  if (!(await checkSiteCode(env, code))) throw new HttpError("رمز تب پشتیبانی درست نیست.", 401);
}

/** فقط بررسی رمز — برای باز کردن تب */
export async function siteLogin(env, code) {
  await requireSite(env, code);
  return { ok: true, ...(await siteState(env)) };
}

/**
 * تغییر وضعیت کارت‌ها و/یا رمز. body: { cards?: {dept: state}, pass?: "1234" }
 * cards به‌صورت وصله اعمال می‌شود تا دو نفر هم‌زمان کار همدیگر را پاک نکنند.
 */
export async function putSite(env, body, code) {
  await requireSite(env, code);
  const b = body || {};
  const k = await readKeys(env);
  const stmts = [];

  if (b.cards !== undefined) {
    if (!b.cards || typeof b.cards !== "object" || Array.isArray(b.cards)) throw new HttpError("فهرست کارت‌ها درست نیست.", 400);
    const cards = parseCards(k[KEY_CARDS]);
    for (const [dept, state] of Object.entries(b.cards)) {
      if (!DEPT_RE.test(dept)) throw new HttpError(`شناسهٔ کارت «${dept}» معتبر نیست.`, 400);
      if (!CARD_STATES.includes(state)) throw new HttpError("وضعیت کارت باید فعال، در حال توسعه یا به‌زودی باشد.", 400);
      cards[dept] = state;
    }
    stmts.push(env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
      .bind(KEY_CARDS, JSON.stringify(cards), Date.now()));
  }

  if (b.pass !== undefined) {
    const p = T(b.pass).replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
    if (!CODE_RE.test(p)) throw new HttpError("رمز باید ۴ تا ۸ رقم باشد.", 400);
    if (env.MANAGER_CODE && p === env.MANAGER_CODE) throw new HttpError("رمز تب نباید همان کد مدیر باشد.", 400);
    stmts.push(env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
      .bind(KEY_PASS, await sha256(p), Date.now()));
  }

  if (stmts.length) await env.DB.batch(stmts);
  return { ok: true, ...(await siteState(env)) };
}
