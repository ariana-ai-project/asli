/**
 * ساختارِ قلم پیش از سپردن به کارشناس هوشمند — فاز ۱ طرح «خرید هوشمند، کارشناس ناظر» (مهر ۱۴۰۵)
 *
 * • نرمال‌سازی اجباری و اول از همه: «بررسی سوابق» هر قلم فقط بعد از آن‌که کارشناس ساختارش را تأیید کرد (items.norm_json،
 *   نه آنچه کارشناس هوشمندِ قدیم خودش نشانده بود — source «ai»). سپردن به کارشناس هوشمند فقط وقتی همهٔ اقلامِ بازِ
 *   درخواست تأیید شده‌اند (تصمیم ۱: یک دکمه برای کل درخواست).
 * • قفلِ عنوان، مقدار و هر لایه (norm_json.locks): 🔒 یعنی تأمین‌کننده نمی‌تواند عوضش کند؛ مقدارِ 🔒 یعنی کلِ مقدار لازم است و
 *   🔓 یعنی مقدارِ کمتر هم پذیرفته است. پیش‌فرض همه 🔒 (تصمیم ۲). پنل تأمین‌کننده (فاز ۴) همین را اجرا می‌کند.
 * • هر تغییرِ ساختار در item_changes (کنشگر، زمان، قبل ← بعد و فهرستِ دقیقِ تغییرها). «پیشنهادِ سامانه» اولین پیشنهادی است
 *   که کارشناس برای همان قلم دید (items.sugg_json)؛ پنل پشتیبانی برای هر قلم یک پیام نشان می‌دهد: ساختارِ تأییدشده دقیقاً
 *   در چه با پیشنهادِ سامانه فرق دارد.
 * • «بررسی سوابق و سپردن به کارشناس هوشمند» (ai-agent.js:aiHandoff) ساختار را منجمد می‌کند (items.frozen_at)؛ تا کار دستِ
 *   کارشناس هوشمند است ساختار عوض نمی‌شود.
 *
 * بی ایمپورت از api.js و ai-agent.js، تا هر دو بی حلقه بپرسند.
 */
import * as RULES from "../frontend/tamin-poshtibani/catalog-rules.mjs";
import { fmtFa } from "./time.js";

const T = (v) => String(v == null ? "" : v).trim();
const parse = (s, d = null) => { try { return s ? (typeof s === "string" ? JSON.parse(s) : s) : d; } catch (_) { return d; } };

export const STRUCT_DDL = `
CREATE TABLE IF NOT EXISTS item_changes (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, item_id INTEGER NOT NULL, request_id TEXT, assignment_id INTEGER, actor TEXT NOT NULL, kind TEXT NOT NULL, before_json TEXT, after_json TEXT, diff_json TEXT);
CREATE INDEX IF NOT EXISTS ix_ichg_item ON item_changes(item_id, id);
`;
export const STRUCT_COLUMNS = [
  ["items", "sugg_json", "TEXT"],    /* اولین پیشنهادِ سامانه که کارشناس دید — مبنای پیامِ «تغییرات اقلام» */
  ["items", "frozen_at", "INTEGER"], /* ساختار منجمد شد: «بررسی سوابق و سپردن به کارشناس هوشمند» */
  ["items", "frozen_by", "TEXT"],    /* expert:<id> | support */
  ["item_changes", "reason", "TEXT"],  /* علتِ کارشناس برای تغییرِ نوع قلم یا لایه‌ها نسبت به پیشنهادِ سامانه (مهر ۱۴۰۵) */
];

/** ساختارِ تأییدشده به دستِ کارشناس (شرطِ SQL روی نامِ مستعارِ items) */
export const NORM_OK_SQL = (i = "i") => `(${i}.norm_json IS NOT NULL AND COALESCE(json_extract(${i}.norm_json,'$.source'),'')<>'ai')`;
export const normConfirmed = (it) => { const n = parse(it && it.norm_json); return !!(n && T(n.head) && n.source !== "ai"); };

export const NEED_NORM_MSG = "نرمال‌سازی اجباری است: اول ساختارِ این قلم را ببینید — نوع قلم، لایه‌ها، نرخ‌های تبدیل و 🔒/🔓ِ عنوان، مقدار و هر لایه — و «تأیید» بزنید؛ بعد سوابق خوانده می‌شود.";
export const FROZEN_MSG = (at) => `🔒 ساختارِ این قلم${at ? ` در ${fmtFa(at)}` : ""} منجمد شد و به کارشناس هوشمند سپرده شد؛ تا وقتی کار دستِ اوست عوض نمی‌شود.`;

/* ------------------------------------------------------------------ */
/* قفل‌ها                                                                */
/* ------------------------------------------------------------------ */
/** قفل‌ها با پیش‌فرضِ «همه 🔒» (تصمیم ۲). layers: لایه‌های همین ساختار — قفلِ لایه‌ای که نیست نگه داشته نمی‌شود */
export function cleanLocks(raw, layers) {
  const r = raw && typeof raw === "object" ? raw : {};
  const rl = r.layers && typeof r.layers === "object" ? r.layers : {};
  const out = { title: r.title !== false, qty: r.qty !== false, layers: {} };
  for (const k of Object.keys(layers || {})) out.layers[k] = rl[k] !== false;
  return out;
}
export const locksOf = (s) => cleanLocks(s && s.locks, s && s.layers);

/* ------------------------------------------------------------------ */
/* پیشنهادِ سامانه و فرقِ دو ساختار                                       */
/* ------------------------------------------------------------------ */
/** پیشنهادِ normalizeItem ← عکسِ «پیشنهادِ سامانه» (نرخ‌ها: نرخی که سامانه برای هر واحد حساب کرد) */
export function suggOf(p, at = Date.now()) {
  if (!p || !T(p.head) || p.confirmed) return null;
  const sysRates = {};
  for (const u of (p.rates && p.rates.units) || []) if (u && u.unit && u.rate != null && u.src !== "user") sysRates[u.unit] = Number(u.rate);
  return { sugg: true, source: p.source || null, head: T(p.head), layers: p.layers || {}, residual: T(p.residual), sysRates, at };
}

const txt = (v) => RULES.layerText(v && typeof v === "object" && !Array.isArray(v) && v.list ? v.list : v);
const sameLayer = (k, a, b) => RULES.layerKey(k, a) === RULES.layerKey(k, b);
const num = (x) => (x == null || x === "" ? null : Number(x));

/**
 * فرقِ دو ساختار — قبل (پیشنهادِ سامانه یا ذخیرهٔ قبلی) و بعد — به ترتیبِ پیامِ پشتیبانی:
 * [{k: head | layer | layer+ | layer- | rate | rate- | lock, name?, from?, to?}]
 * نرخ: بعد فقط نرخ‌های دستیِ کارشناس را دارد؛ مبنای مقایسه نرخِ دستیِ قبلی است، وگرنه نرخی که سامانه پیشنهاد داد.
 * قفل: پیش‌فرض 🔒؛ قلمی که قبلاً قفلی نداشت (پیشنهادِ سامانه) همه‌اش 🔒 حساب می‌شود.
 */
export function structDiff(before, after) {
  const A = before || {}, B = after || {};
  const out = [];
  if (T(A.head) !== T(B.head)) out.push({ k: "head", from: T(A.head), to: T(B.head) });
  const la = A.layers || {}, lb = B.layers || {};
  for (const [k, v] of Object.entries(lb)) {
    if (!(k in la)) out.push({ k: "layer+", name: k, to: txt(v) });
    else if (!sameLayer(k, la[k], v)) out.push({ k: "layer", name: k, from: txt(la[k]), to: txt(v) });
  }
  for (const [k, v] of Object.entries(la)) if (!(k in lb)) out.push({ k: "layer-", name: k, from: txt(v) });
  const ownA = A.sugg ? {} : A.rates || {}, sysA = A.sugg ? A.sysRates || {} : {}, rb = B.rates || {};
  for (const [u, r] of Object.entries(rb)) {
    const base = ownA[u] != null ? num(ownA[u]) : sysA[u] != null ? num(sysA[u]) : null;
    if (base == null || Math.abs(base - num(r)) > 1e-9 * Math.max(1, Math.abs(base))) out.push({ k: "rate", name: u, from: base, to: num(r) });
  }
  for (const [u, r] of Object.entries(ownA)) if (rb[u] == null) out.push({ k: "rate-", name: u, from: num(r) });
  const ka = locksOf(A), kb = locksOf(B);
  if (ka.title !== kb.title) out.push({ k: "lock", name: "title", to: kb.title });
  if (ka.qty !== kb.qty) out.push({ k: "lock", name: "qty", to: kb.qty });
  for (const k of Object.keys(lb)) {
    const was = k in la ? ka.layers[k] : true;
    if (was !== kb.layers[k]) out.push({ k: "lock", name: k, layer: true, to: kb.layers[k] });
  }
  return out;
}

const fmtN = (x) => (x == null ? "—" : Number(x).toLocaleString("en-US", { maximumFractionDigits: Math.abs(x) < 1 ? 6 : 4 }));
const LOCK_WHAT = (d) => (d.name === "title" ? "عنوان" : d.name === "qty" ? "مقدار" : `لایهٔ «${d.name}»`);
/** هر تغییر به یک جملهٔ فارسی (پیامِ «تغییرات اقلام» در پنل پشتیبانی) */
export function diffLines(diff) {
  return (diff || []).map((d) => {
    if (d.k === "head") return `نوع قلم: «${d.from || "—"}» ← «${d.to || "—"}»`;
    if (d.k === "layer") return `لایهٔ «${d.name}»: «${d.from}» ← «${d.to}»`;
    if (d.k === "layer+") return `لایهٔ تازهٔ «${d.name}»: «${d.to}»`;
    if (d.k === "layer-") return `لایهٔ «${d.name}» («${d.from}») حذف شد`;
    if (d.k === "rate") return `نرخ تبدیلِ «${d.name}»: ${fmtN(d.from)} ← ${fmtN(d.to)}`;
    if (d.k === "rate-") return `نرخِ دستیِ «${d.name}» (${fmtN(d.from)}) برداشته شد`;
    if (d.k === "lock") return `${LOCK_WHAT(d)}: ${d.to ? "🔒 قفل" : "🔓 باز"}${d.name === "qty" && !d.to ? " — تأمین‌کننده می‌تواند مقدارِ کمتری پیشنهاد دهد" : d.name === "qty" ? " — کلِ مقدار لازم است" : ""}`;
    return "";
  }).filter(Boolean);
}

/* ------------------------------------------------------------------ */
/* سابقهٔ تغییرات                                                        */
/* ------------------------------------------------------------------ */
/**
 * یک ردیفِ item_changes. kind: norm (ذخیرهٔ ساختار) | clear (برداشتنِ ذخیره) | revert (برگشت به فهرست اقلام) |
 * freeze (سپردن به کارشناس هوشمند: فرقِ پیشنهادِ سامانه با ساختارِ منجمد). it: {id, request_id, aid|assignment_id}
 */
export function changeStmt(env, it, actor, kind, before, after, at = Date.now(), reason = null) {
  const diff = after ? structDiff(before, after) : [];
  return env.DB.prepare("INSERT INTO item_changes (at,item_id,request_id,assignment_id,actor,kind,before_json,after_json,diff_json,reason) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .bind(at, it.id, it.request_id || null, it.aid || it.assignment_id || null, actor, kind,
      before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, JSON.stringify(diff), reason || null);
}

/**
 * پنل پشتیبانی ← «🧩 تغییرات اقلام»: برای هر قلمِ نرمال‌شده یک پیام — کارشناس، زمان، و فرقِ ساختارِ تأییدشده (منجمد)
 * با پیشنهادِ سامانه. صافی‌ها: expert، rid، frozen=1 (فقط سپرده‌شده‌ها)، changed=1 (فقط تغییرکرده‌ها)؛ limit/offset.
 */
export async function changesList(env, url) {
  const q = (k) => (url ? url.searchParams.get(k) : null);
  const where = [NORM_OK_SQL("i")], args = [];
  if (q("expert")) { where.push("a.expert_id=?"); args.push(Number(q("expert"))); }
  if (q("rid")) { where.push("i.request_id=?"); args.push(T(q("rid"))); }
  if (q("frozen") === "1") where.push("i.frozen_at IS NOT NULL");
  const limit = Math.min(300, Math.max(10, parseInt(q("limit"), 10) || 120)), offset = Math.max(0, parseInt(q("offset"), 10) || 0);
  const { results } = await env.DB.prepare(`SELECT i.id, i.request_id, i.title, i.qty, i.unit, i.code, i.state, i.norm_json, i.norm_at, i.sugg_json, i.frozen_at, i.frozen_by,
      a.id AS aid, a.expert_id, r.party,
      (SELECT COUNT(*) FROM item_changes c WHERE c.item_id=i.id) AS n_changes,
      (SELECT c.actor FROM item_changes c WHERE c.item_id=i.id AND c.kind='norm' ORDER BY c.id DESC LIMIT 1) AS last_by,
      (SELECT c.reason FROM item_changes c WHERE c.item_id=i.id AND c.reason IS NOT NULL ORDER BY c.id DESC LIMIT 1) AS reason
    FROM items i JOIN assignments a ON a.id=i.assignment_id JOIN requests r ON r.id=i.request_id
    WHERE ${where.join(" AND ")} ORDER BY COALESCE(i.frozen_at, i.norm_at) DESC, i.id DESC LIMIT ? OFFSET ?`).bind(...args, limit + 1, offset).all();
  const rows = (results || []).map((r) => {
    const norm = parse(r.norm_json, {}), sugg = parse(r.sugg_json, null);
    const diff = structDiff(sugg, norm);
    return {
      id: r.id, request_id: r.request_id, party: r.party, title: r.title, qty: r.qty, unit: r.unit, code: r.code, state: r.state,
      aid: r.aid, expert_id: r.expert_id, by: r.last_by || null, norm_at: r.norm_at, frozen_at: r.frozen_at, frozen_by: r.frozen_by,
      head: norm.head || "", sugg_source: sugg ? sugg.source : null, has_sugg: !!sugg, changes: r.n_changes || 0,
      diff, lines: sugg ? diffLines(diff) : [], locks: locksOf(norm), reason: r.reason || null,
    };
  });
  const more = rows.length > limit;
  const list = rows.slice(0, limit).filter((x) => q("changed") !== "1" || !x.has_sugg || x.diff.length);
  return { items: list, more, next: more ? offset + limit : null };
}

/** همهٔ تغییرهای یک قلم، به ترتیب زمان — «تاریخچه»ٔ همان پیام */
export async function changeLog(env, itemId) {
  const it = await env.DB.prepare("SELECT i.id, i.title, i.request_id, i.sugg_json, i.norm_json, i.frozen_at, a.expert_id FROM items i LEFT JOIN assignments a ON a.id=i.assignment_id WHERE i.id=?").bind(itemId).first();
  if (!it) return { item: null, changes: [] };
  const { results } = await env.DB.prepare("SELECT id, at, actor, kind, diff_json, reason FROM item_changes WHERE item_id=? ORDER BY id").bind(itemId).all();
  return {
    item: { id: it.id, title: it.title, request_id: it.request_id, expert_id: it.expert_id, frozen_at: it.frozen_at, sugg: parse(it.sugg_json, null), norm: parse(it.norm_json, null) },
    changes: (results || []).map((c) => ({ id: c.id, at: c.at, actor: c.actor, kind: c.kind, lines: diffLines(parse(c.diff_json, [])), reason: c.reason || null })),
  };
}
