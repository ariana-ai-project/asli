/**
 * برآوردِ مکانیکیِ قیمت واحدِ هر قلم — بی مدل (مهر ۱۴۰۵، درخواست مالک؛ برچسبِ «جزئی / متوسط / بزرگ / عمده»، worker/size.js)
 *
 * قاعده، همان جدولِ «بررسی سوابق»ِ کارشناس (worker/history.js:itemHistory):
 *   ۱. محدودهٔ «عین قلم» (عین همان لایه‌ها)؛ اگر هیچ خریدی جور نشد، «نوع قلم».
 *   ۲. تأمین‌کنندگان به ترتیبِ رتبهٔ نهایی (rankF — همان ترتیبِ جدول و فهرستِ دعوتِ کارشناس هوشمند).
 *   ۳. از اولین تأمین‌کننده آخرین خریدش؛ اگر واحدش (پس از یکسان‌سازیِ واحدِ خرید، catalog-units.mjs:purchaseUnit) با واحدِ
 *      قلم یکی نیست یا لایه‌هایش با قلم نمی‌خواند، خریدهای قبلیِ همان تأمین‌کننده، بعد تأمین‌کنندهٔ بعدی، تا اولین خریدِ جور.
 *      «عین قلم»: لایه‌ها از پیش برابرند. «نوع قلم»: هیچ لایهٔ مشترکی (هر دو طرف مقدار دارند) ناسازگار نباشد.
 *   ۴. قیمت واحد = «قیمت روز» همان خرید (مبلغ × نرخ دلارِ امروز ÷ نرخ دلارِ روزِ خرید) ÷ مقدار — ریالِ امروز؛ بی جدولِ دلار،
 *      مبلغِ تعدیلِ مرکز آمار.
 *   هیچ خریدِ جوری نبود ← بی‌برآورد (est_unit_rial خالی، est_at پر).
 * یک بار حساب و ذخیره می‌شود (items.est_unit_rial، est_src، est_at) — نه در هر بار دیدنِ صفحه. خالی‌بودنِ est_at یعنی «در صف»:
 * بعد از بارگذاریِ درخواست‌ها پنل مدیر POST /estimate/run را پشتِ سرِ هم می‌زند و Cronِ هر دقیقه هم در دقیقه‌های بیکار یکی
 * برمی‌دارد (با سقفِ روزانه، برای سقفِ خواندنِ D1). تأیید یا تغییرِ ساختارِ قلم est_at را خالی می‌کند تا دوباره حساب شود.
 */
import { itemHistory } from "./history.js";
import { purchaseUnit } from "../frontend/tamin-poshtibani/catalog-units.mjs";
import * as RULES from "../frontend/tamin-poshtibani/catalog-rules.mjs";

const T = (v) => String(v == null ? "" : v).trim();
const DAY = 86400000;
/* هر برآورد ده‌وچند کوئری است و سقفِ کوئریِ هر اجرا ۵۰؛ قلمِ تازه فقط وقتی شروع می‌شود که دست‌کم این‌قدر جا هست */
export const EST_QUERY_ROOM = 24, EST_BUDGET = 46;
/* سقفِ برآوردِ Cron در روز (پس‌مانده‌ها: اقلامِ بازِ قدیمی) — خواندنِ هر برآورد تا چند هزار ردیفِ سوابق است */
export const EST_DAY_MAX = 300;
export const EST_PENDING_SQL = "est_at IS NULL AND state IN ('open','hold')";

/** دو واحد یکی‌اند؟ — نامِ جدولِ واحدهای خرید («کیلوگرم» = «کیلو گرم»)، وگرنه همان متن بی فاصله */
export function sameUnit(a, b) {
  if (!T(a) || !T(b)) return false;
  const pa = purchaseUnit(a), pb = purchaseUnit(b);
  if (pa || pb) return pa === pb;
  return RULES.keyOf(a).replace(/\s/g, "") === RULES.keyOf(b).replace(/\s/g, "");
}
/** لایه‌های خریدِ «نوع قلم» با قلم می‌خوانند؟ — هیچ لایهٔ مشترکِ پُری ناسازگار نباشد */
export function layersFit(item, buy) {
  const A = item || {}, B = buy || {};
  for (const [k, v] of Object.entries(A)) {
    if (v == null || v === "" || B[k] == null || B[k] === "") continue;
    if (RULES.layerKey(k, v) !== RULES.layerKey(k, B[k])) return false;
  }
  return true;
}
/** ترتیبِ رتبهٔ نهایی — همان ai-picks.js:byF */
const byF = (a, b) => (a.rankF || 1e9) - (b.rankF || 1e9) || (b.qtyM || 0) - (a.qtyM || 0);

/**
 * انتخابِ خرید (خالص): suppliers از itemHistory، buys ریزِ خریدها (تازه‌ترین اول). خروجی
 * {unit_rial, basis: "usd"|"adj", sup, date, code, unit, rank} یا null.
 */
export function pickEstimate({ suppliers, buys, unit, layers, exact }) {
  const by = new Map();
  for (const b of buys || []) { if (!by.has(b.sn)) by.set(b.sn, []); by.get(b.sn).push(b); }
  for (const s of [...(suppliers || [])].sort(byF)) {
    const list = (by.get(s.key) || []).slice().sort((x, y) => (x.order_date < y.order_date ? 1 : x.order_date > y.order_date ? -1 : 0));
    for (const b of list) {
      const q = Number(b.qty);
      if (!(q > 0) || !sameUnit(b.unit, unit)) continue;
      if (!exact && !layersFit(layers, b.layers)) continue;
      const usd = b.usd != null && Number(b.usd) > 0 ? Number(b.usd) : null, adj = b.amount_adj != null && Number(b.amount_adj) > 0 ? Number(b.amount_adj) : null;
      const amt = usd != null ? usd : adj;
      if (amt == null) continue;
      return { unit_rial: amt / q, basis: usd != null ? "usd" : "adj", sup: s.name, date: b.order_date, code: b.item_code, unit: T(b.unit), rank: s.rankF == null ? null : s.rankF };
    }
  }
  return null;
}

/** برآوردِ یک قلم و ذخیره‌اش. خروجی همان est (یا null) */
export async function estimateItem(env, it) {
  let est = null, why = "nomatch";
  for (const mode of ["exact", "head"]) {
    const h = await itemHistory(env, it, { mode, brief: true, buys: 3000 });
    if (!h || h.available === false) { why = "nohist"; break; }
    if (!(h.suppliers || []).length || !h.buys) continue;
    const p = pickEstimate({ suppliers: h.suppliers, buys: h.buys, unit: it.unit, layers: (h.struct && h.struct.layers) || {}, exact: mode === "exact" });
    if (p) { est = { ...p, scope: mode }; break; }
  }
  const t = Date.now();
  await env.DB.prepare("UPDATE items SET est_unit_rial=?, est_src=?, est_at=? WHERE id=?")
    .bind(est ? est.unit_rial : null, JSON.stringify(est ? { ...est, unit_rial: undefined } : { none: why }), t, it.id).run();
  return est;
}

/** env با شمارشِ کوئری‌ها — سقفِ ۵۰ کوئریِ هر اجرا */
export function counted(env) {
  let n = 0;
  const DB = {
    prepare: (...a) => { n++; return env.DB.prepare(...a); },
    batch: (s) => { n++; return env.DB.batch(s); },
    exec: (...a) => { n++; return env.DB.exec(...a); },
  };
  return { env: { ...env, DB }, used: () => n };
}

/**
 * اقلامِ «در صف»: تازه‌ترین اول، تا جا هست. importId: فقط اقلامِ همان بارگذاری (پنل مدیر بعد از ورود). daily: با سقفِ روزانه (Cron).
 * خروجی {done, left?, capped?}
 */
export async function estimateRun(env, { importId = null, daily = false, budget = EST_BUDGET, max = 4 } = {}) {
  const C = counted(env);
  let used0 = 0, day = Math.floor(Date.now() / DAY);
  if (daily) {
    const c = await C.env.DB.prepare("SELECT value FROM counters WHERE key='est_day'").first().catch(() => null);
    used0 = c && Math.floor(Number(c.value) / 1e5) === day ? Number(c.value) % 1e5 : 0;
    if (used0 >= EST_DAY_MAX) return { done: 0, capped: true };
  }
  const next = () => (importId
    ? C.env.DB.prepare(`SELECT i.* FROM items i JOIN requests r ON r.id=i.request_id WHERE r.last_import_id=? AND i.${EST_PENDING_SQL.replace(" AND state", " AND i.state")} ORDER BY i.id LIMIT 1`).bind(importId).first()
    : C.env.DB.prepare(`SELECT * FROM items WHERE ${EST_PENDING_SQL} ORDER BY id DESC LIMIT 1`).first());
  let done = 0, left = true;
  while (done < max && C.used() + EST_QUERY_ROOM <= budget) {
    const it = await next();
    if (!it) { left = false; break; }
    try { await estimateItem(C.env, it); }
    catch (e) {
      /* قلمی که برآوردش خطا داد دوباره در صف نمی‌ماند (حلقهٔ بی‌پایان) — بی‌برآورد با علت */
      console.error("estimate", it.id, e && e.message);
      await C.env.DB.prepare("UPDATE items SET est_unit_rial=NULL, est_src=?, est_at=? WHERE id=?").bind(JSON.stringify({ none: "error" }), Date.now(), it.id).run();
    }
    done++;
  }
  if (daily && done) {
    await C.env.DB.prepare("INSERT INTO counters (key,value) VALUES ('est_day',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(day * 1e5 + used0 + done).run();
  }
  return { done, left, queries: C.used() };
}

/** ساختارِ قلم عوض شد: برآوردِ قبلی کهنه است — دوباره در صف */
export const resetEstimate = (env, itemId) => env.DB.prepare("UPDATE items SET est_at=NULL WHERE id=?").bind(itemId);
