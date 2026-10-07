/**
 * حالتِ هر نوع قلم برای کارشناس هوشمند — طرح «خرید هوشمند، کارشناس ناظر»، فاز ۴ب (مهر ۱۴۰۵، پاسخ‌های ۱۵ مهر)
 *
 * پشتیبانی برای هر نوع قلم یکی از سه حالت را می‌گذارد؛ نوع قلمی که نامش نیامده «انتخاب کارشناس» است (تصمیم ۲۴):
 *   • handoff «سپردن یا برگشت»: بعد از بررسی سوابق، کارشناس فقط به کارشناس هوشمند می‌سپارد (همان فهرستِ رتبه‌بندی)، یا با
 *     توضیح به مدیر برمی‌گرداند تا دستی شود.
 *   • pick «انتخاب کارشناس»: کارشناس تیک‌ها را کم و زیاد می‌کند (برداشتنِ پنج نفر اول با توضیح) و «شروع» را می‌زند — بی اجازهٔ
 *     مدیر؛ مکاتبهٔ مستقیم ندارد.
 *   • direct «مستقیم»: کارشناس خودش مکاتبه می‌کند، یا به انتخابِ خودش می‌سپارد؛ نه توضیح می‌خواهد نه اجازه.
 * supervise: «حالت تأیید» برای این نوع قلم مجاز است (مدیر اجازه می‌دهد یا کارشناس پیش از شروع با توضیح می‌خواهد — گام ۴).
 *
 * هر قلم با حالتِ نوعِ خودش جلو می‌رود (تصمیم ۱۶): نوع قلم از ساختارِ قلم (نرمال‌سازی)، وگرنه از کد یا عنوان در فهرست اقلام.
 */
import { headOfCode, codeOfTitle, allHeads } from "./catalog.js";
import { normOf } from "./normalize.js";

const T = (v) => String(v == null ? "" : v).trim();
const nkey = (x) => T(x).replace(/[ي]/g, "ی").replace(/[ك]/g, "ک").replace(/‌/g, " ").replace(/\s+/g, " ").toLowerCase();
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };

export const MODES_KEY = "aiModes";
export const MODES = ["handoff", "pick", "direct"];
export const MODE_FA = { handoff: "سپردن یا برگشت", pick: "انتخاب کارشناس", direct: "مستقیم" };
export const MODE_DEFAULT = { mode: "pick", supervise: false };
const MAX_HEADS = 500;

function clean(raw) {
  const heads = {};
  const src = raw && typeof raw.heads === "object" && raw.heads ? raw.heads : {};
  for (const [h, v] of Object.entries(src).slice(0, MAX_HEADS)) {
    const name = T(h).slice(0, 120);
    if (!name || !v || typeof v !== "object") continue;
    heads[name] = { mode: MODES.includes(v.mode) ? v.mode : MODE_DEFAULT.mode, supervise: v.supervise === true };
  }
  return { heads };
}

let cache = null;
/** {heads: {نوع قلم: {mode, supervise}}, updated_at, by} — ۶۰ ثانیه در حافظهٔ isolate */
export async function getModes(env, now = Date.now()) {
  if (cache && now - cache.at < 60000) return cache.v;
  const r = await env.DB.prepare("SELECT value, updated_at FROM settings WHERE key=?").bind(MODES_KEY).first().catch(() => null);
  const raw = parse(r && r.value, null);
  const v = { ...clean(raw), updated_at: r ? r.updated_at : null, by: (raw && raw.by) || null };
  v.byKey = new Map(Object.entries(v.heads).map(([h, x]) => [nkey(h), x]));
  cache = { at: now, v };
  return v;
}
export const resetModesCache = () => { cache = null; };

/** ذخیره از پنل پشتیبانی — کلِ فهرست جایگزین می‌شود؛ با یک رخداد */
export async function saveModes(env, body, by = "support") {
  const next = clean(body);
  const t = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
      .bind(MODES_KEY, JSON.stringify({ ...next, by }), t),
    env.DB.prepare("INSERT INTO events (at,actor,kind,payload_json) VALUES (?,?,?,?)").bind(t, by, "ai_modes", JSON.stringify({ n: Object.keys(next.heads).length })),
  ]);
  cache = null;
  return { ...next, updated_at: t, by };
}

/** حالتِ یک نوع قلم: {mode, supervise, set} — set یعنی پشتیبانی نامش را برده؛ وگرنه پیش‌فرض */
export function modeOf(cfg, head) {
  const x = head && cfg && cfg.byKey ? cfg.byKey.get(nkey(head)) : null;
  return x ? { ...x, set: true } : { ...MODE_DEFAULT, set: false };
}

/** نوع قلم: ساختارِ قلم (نرمال‌سازی یا پیشنهاد)، وگرنه کد راهکاران یا عنوانِ عیناً همان در فهرست اقلام — بی مدل */
export async function headGuess(env, it) {
  const n = normOf(it);
  if (n && T(n.head)) return T(n.head);
  let h = T(it && it.code) ? await headOfCode(env, it.code).catch(() => null) : null;
  if (h == null && T(it && it.title)) {
    const c = await codeOfTitle(env, it.title).catch(() => null);
    if (c) h = await headOfCode(env, c).catch(() => null);
  }
  return h ? T(h) : null;
}

/** حالتِ هر قلم: Map(شناسهٔ قلم → {head, mode, supervise, set}) */
export async function itemModes(env, items) {
  const cfg = await getModes(env);
  const out = new Map();
  for (const it of items || []) {
    const head = await headGuess(env, it);
    out.set(it.id, { head, ...modeOf(cfg, head) });
  }
  return out;
}

/**
 * قلمِ دستیِ کارشناس در درخواستی که دستِ کارشناس هوشمند است (owned از ai-lock.js:aiOwned): «انجام دستی»ِ تأییدشدهٔ مدیر
 * (items.ai_off)، قلمی که در کارِ زندهٔ کارشناس هوشمند نیست، یا — هنوز نسپرده — قلمی از نوعِ «مستقیم».
 */
export async function aiItemFree(env, owned, it) {
  if (!owned || !it) return false;
  if (Number(it.ai_off) === 1) return true;
  if (owned.run_id) {
    const r = await env.DB.prepare("SELECT data_json FROM ai_runs WHERE id=?").bind(owned.run_id).first();
    const ids = new Set(((parse(r && r.data_json, {}) || {}).items || []).map((x) => x.id));
    return !ids.has(it.id);
  }
  const m = modeOf(await getModes(env), await headGuess(env, it));
  return m.mode === "direct";
}

/** جستجوی نوع قلم برای پنل پشتیبانی — حداکثر ۳۰ نام */
export async function searchHeads(env, q) {
  const k = nkey(q);
  if (!k) return [];
  const heads = await allHeads(env);
  const hit = heads.filter((h) => nkey(h).includes(k));
  hit.sort((a, b) => (nkey(a).startsWith(k) ? 0 : 1) - (nkey(b).startsWith(k) ? 0 : 1) || a.length - b.length);
  return hit.slice(0, 30);
}
