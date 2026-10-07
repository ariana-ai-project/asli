/**
 * «🎛 کلیدها»ی پنل پشتیبانی — طرح «خرید هوشمند، کارشناس ناظر» (مهر ۱۴۰۵)
 *
 * pfRead: «خوانش هوشمند پیش‌فاکتور». پیش‌فرض خاموش (فاز ۴): پیش‌فاکتور را خودِ سامانه از فیلدهای تأمین‌کننده می‌سازد
 * (worker/pfdoc.js)، مقدارهای ثبت‌شدهٔ او مستقیم خط استعلام می‌شود و بسته بعد از بررسی یکراست «تأیید نهایی» می‌شود یا با
 * توضیح برمی‌گردد — مرحلهٔ جدای «پیش‌فاکتور بفرستید» و جدول تطابق نیست. روشن، همان مسیرِ پیشین: تأیید مشخصات ← بارگذاری
 * پیش‌فاکتور ← خوانش هوشمند و جدول تطابق ← تأیید نهایی با مقدارهای سند.
 */
export const SWITCH_KEY = "aiSwitches";
export const SWITCH_DEFAULT = { pfRead: false };
export const SWITCH_FA = {
  pfRead: "خوانش هوشمند پیش‌فاکتور — روشن: تأمین‌کننده بعد از تأیید مشخصات پیش‌فاکتور می‌فرستد و مدل آن را می‌خواند؛ "
    + "خاموش (پیش‌فرض): پیش‌فاکتور را سامانه از همان فیلدهای تأمین‌کننده می‌سازد و بسته بعد از بررسی یکراست تأیید نهایی می‌شود.",
};

const clean = (v) => {
  const x = v && typeof v === "object" ? v : {};
  return { pfRead: x.pfRead === true };
};

let cache = null;
/** {pfRead, updated_at, by} — ۶۰ ثانیه در حافظهٔ isolate */
export async function getSwitches(env, now = Date.now()) {
  if (cache && now - cache.at < 60000) return cache.v;
  const r = await env.DB.prepare("SELECT value, updated_at FROM settings WHERE key=?").bind(SWITCH_KEY).first().catch(() => null);
  let raw = null;
  try { raw = r ? JSON.parse(r.value) : null; } catch (_) { raw = null; }
  const v = { ...clean(raw), updated_at: r ? r.updated_at : null, by: (raw && raw.by) || null };
  cache = { at: now, v };
  return v;
}
export const pfReadOn = async (env) => (await getSwitches(env)).pfRead;
export const resetSwitchCache = () => { cache = null; };

/** ذخیره از پنل پشتیبانی، با یک رخداد (گزارش رخدادها) */
export async function saveSwitches(env, body, by = "support") {
  const cur = await getSwitches(env);
  const next = clean({ ...cur, ...(body && typeof body === "object" ? body : {}) });
  const t = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
      .bind(SWITCH_KEY, JSON.stringify({ ...next, by }), t),
    env.DB.prepare("INSERT INTO events (at,actor,kind,payload_json) VALUES (?,?,?,?)").bind(t, by, "ai_switches", JSON.stringify(next)),
  ]);
  cache = null;
  return { ...next, updated_at: t, by };
}
