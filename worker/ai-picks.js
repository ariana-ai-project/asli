/**
 * «🎯 فهرست دعوت»ِ هر قلم — طرح «خرید هوشمند، کارشناس ناظر»، فاز ۴ب گام ۲ (پاسخ‌های ۱۵ مهر؛ تصمیم‌های ۱۷، ۱۸ و ۲۲)
 *
 * کارشناس هوشمند دیگر خودش تأمین‌کننده برنمی‌گزیند و جستجوی هوشمند نمی‌زند. کارشناس «بررسی سوابق» را می‌زند و برای هر قلم
 * فهرستی می‌بیند به ترتیبِ رتبهٔ نهایی و «قاعدهٔ دعوت» (همان ترتیبی که کارشناس هوشمند پیش‌تر خودش می‌ساخت)؛ پنج نفر اول از
 * پیش تیک خورده‌اند. بسته به حالتِ نوع قلم (ai-modes.js):
 *   • «انتخاب کارشناس» (pick): تیک‌ها کم و زیاد می‌شوند؛ برداشتنِ هر کدام از پنج نفر اول یک توضیحِ کوتاه کنار همان نام می‌خواهد.
 *   • «سپردن یا برگشت» (handoff): فهرست همان رتبه‌بندی است و عوض نمی‌شود — «سپردن» یا «برگرداندن به مدیر».
 *   • «مستقیم» (direct): اگر کارشناس خواست بسپارد، تیک‌ها آزاد و بی توضیح‌اند.
 * از «جستجوی هوشمند» (یا هر نامِ دیگر) تأمین‌کننده فقط با انتخابِ خودِ کارشناس به فهرست می‌آید؛ نفرستادنش توضیح نمی‌خواهد.
 * «شروع» (ai-agent.js:startItem) برای هر قلم جداست. کارشناس هوشمند فقط تیک‌خورده‌های سپرده‌شده (go) را دعوت می‌کند، آن هم فقط
 * اگر شمارهٔ پنلِ تیک‌خورده دارند — تیک‌خوردهٔ بی شماره منتظر می‌ماند تا شماره بخورد. انتخاب‌های بعد از شروع با «دعوت از
 * انتخاب‌های تازه» سپرده می‌شوند.
 *
 * items.pick_json: {v, at, by, rule, n, msg, list: [{k, name, src, pos, top, on, why, why_at, why_by, grade, rankF, score, buys, last,
 *   ph, sid, add_at, add_by, go}]}
 *   src: grade | exact | type (سوابق، با جایگاهِ pos در قاعدهٔ دعوت) · smart (جستجوی هوشمند، sid) · manual (افزودهٔ کارشناس)
 * بی ایمپورت از ai-agent.js، تا ai-agent.js و api.js بی حلقه بپرسند.
 */
import { HttpError } from "./http.js";
import { itemHistory } from "./history.js";
import { getRanking, dispatchOrder } from "./ranking.js";
import { nkey, nrm, normPhone } from "./sp-core.js";

const T = (v) => String(v == null ? "" : v).trim();
const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const faN = (s) => String(s).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[+d]);
const list = (xs) => xs.map((x) => `«${x}»`).join("، ");

/** «پنج نفر اول» (تصمیم ۱۷) */
export const TOP = 5;
/** فهرستِ سوابق — همان سقفِ آماده‌سازیِ کارشناس هوشمند */
const MAX_LIST = 15;
/** افزوده‌های کارشناس (جستجوی هوشمند و نام‌های دیگر) برای هر قلم */
const MAX_ADD = 20;
export const PICK_SRC_FA = { grade: "عین قلم — ردهٔ برگزیده", exact: "عین قلم", type: "نوع قلم", smart: "جستجوی هوشمند", manual: "افزودهٔ کارشناس" };
const HIST = new Set(["grade", "exact", "type"]);
/** منبعِ گفت‌وگو در ai_threads و پروندهٔ مذاکره (ai-md.js:SOURCE_FA) */
export const threadSrc = (src) => (HIST.has(src) ? "history" : src === "smart" ? "smart" : "manual");

export const A_MSG = "در حالت «سپردن یا برگشت» فهرست همان رتبه‌بندیِ کارشناس هوشمند است و عوض نمی‌شود؛ «🤖 سپردن» یا «↩️ برگرداندن به مدیر».";

export const pickOf = (it) => parse(it && it.pick_json, null);

const phonesOf = (s) => [...new Set([...(Array.isArray(s.phones) ? s.phones : []), s.contact && s.contact.phone, s.contact && s.contact.tel2]
  .map((p) => normPhone(p)).filter(Boolean))].slice(0, 3);
const entryOf = (s, i) => ({
  k: nkey(s.name), name: nrm(s.name), src: HIST.has(s.tier) ? s.tier : "type", pos: i + 1, top: i < TOP, on: i < TOP, why: null,
  grade: s.grade || null, rankF: s.rankF == null ? null : s.rankF, score: s.score == null ? null : s.score, buys: s.n == null ? null : s.n,
  last: s.lastDate || s.last || null, ph: phonesOf(s), go: null,
});

/** فهرستِ پیش‌فرض از سوابقِ «عین قلم» و «نوع قلم» با قاعدهٔ دعوت (ranking.js:dispatchOrder) — پنج نفر اول تیک‌خورده */
export function defaultFrom({ exact = [], type = [] }, rule) {
  const seen = new Set(), out = [];
  for (const s of dispatchOrder({ exact, type }, rule)) {
    const k = nkey(s.name);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(entryOf(s, out.length));
    if (out.length >= MAX_LIST) break;
  }
  return out;
}

/** فهرستِ تازهٔ یک قلم از سوابق — دو بار itemHistory (نوع قلم کامل، عین قلم کوتاه)، همان کارِ آماده‌سازیِ کارشناس هوشمند */
export async function buildDefault(env, it) {
  const rk = await getRanking(env);
  const [h, hx] = await Promise.all([
    itemHistory(env, it, { mode: "head", k: rk.weights.k }).catch((e) => ({ available: false, message: e.message })),
    itemHistory(env, it, { mode: "exact", k: rk.weights.k, brief: true }).catch(() => ({ suppliers: [] })),
  ]);
  const byF = (a, b) => (a.rankF || 1e9) - (b.rankF || 1e9) || (b.qtyM || 0) - (a.qtyM || 0);
  const type = [...(h.suppliers || [])].sort(byF).slice(0, MAX_LIST), exact = [...(hx.suppliers || [])].sort(byF).slice(0, MAX_LIST);
  return { v: 1, at: Date.now(), rule: rk.dispatch, n: (h.suppliers || []).length, msg: h.available === false || (!type.length && h.message) ? h.message || null : null,
    list: defaultFrom({ exact, type }, rk.dispatch) };
}

/** «بازسازی»: فهرستِ تازهٔ سوابق، با افزوده‌های کارشناس (جستجوی هوشمند و نام‌های دیگر) که در سوابق نیامده‌اند */
export function mergeRebuilt(fresh, old) {
  const have = new Set(fresh.list.map((e) => e.k));
  for (const e of (old && old.list) || []) if (!HIST.has(e.src) && !have.has(e.k)) fresh.list.push(e);
  return fresh;
}

/**
 * تغییرِ کارشناس روی فهرست. body: on {k: true|false}، why {k: متن}، add [{name, src: smart|manual, sid, ph}]، remove [k].
 * mode: حالتِ نوع قلم؛ cap: سقفِ تیک (پنل پشتیبانی). تیکِ سپرده‌شده (go) برداشته نمی‌شود؛ تیکِ تازه بعد از شروع تا «دعوت از
 * انتخاب‌های تازه» پیش‌نویس است. خروجی: همان pick، دست‌خورده.
 */
export function applyEdits(pick, body, { mode, by, cap, at = Date.now() }) {
  const b = body && typeof body === "object" ? body : {};
  const on = b.on && typeof b.on === "object" ? b.on : {};
  const why = b.why && typeof b.why === "object" ? b.why : {};
  const add = Array.isArray(b.add) ? b.add : [];
  const remove = Array.isArray(b.remove) ? b.remove : [];
  if (Object.keys(on).length + Object.keys(why).length + add.length + remove.length === 0) return pick;
  if (mode === "handoff") throw new HttpError(A_MSG, 409);
  const L = pick.list;
  const byK = new Map(L.map((e) => [e.k, e]));
  const get = (k) => { const e = byK.get(String(k)); if (!e) throw new HttpError("این تأمین‌کننده در فهرستِ دعوتِ این قلم نیست؛ صفحه را تازه کنید.", 409); return e; };
  for (const [k, v] of Object.entries(on)) {
    const e = get(k), want = v === true || v === 1;
    if (e.go && !want) throw new HttpError(`«${e.name}» به کارشناس هوشمند سپرده شده و تیکش برداشته نمی‌شود.`, 409);
    if (e.on === want) continue;
    e.on = want;
    if (want && e.top) { e.why = null; e.why_at = null; e.why_by = null; }
  }
  for (const [k, v] of Object.entries(why)) {
    const e = get(k), t = T(v).slice(0, 300);
    e.why = t || null; e.why_at = t ? at : null; e.why_by = t ? by : null;
  }
  for (const a of add) {
    const name = nrm(a && a.name).slice(0, 120), k = nkey(name);
    if (!k) throw new HttpError("نام تأمین‌کننده لازم است.");
    const src = a.src === "smart" ? "smart" : "manual";
    const old = byK.get(k);
    if (old) {
      /* همین نام از قبل در فهرست است (مثلاً از سوابق): تیک می‌خورد */
      old.on = true;
      if (src === "smart" && int(a.sid) && !old.sid) old.sid = int(a.sid);
      continue;
    }
    if (L.filter((e) => !HIST.has(e.src)).length >= MAX_ADD) throw new HttpError(`حداکثر ${faN(MAX_ADD)} تأمین‌کنندهٔ افزوده برای هر قلم.`, 422);
    const e = { k, name, src, pos: null, top: false, on: true, why: null, grade: null, rankF: null, score: null, buys: null, last: null,
      ph: (Array.isArray(a.ph) ? a.ph : []).map((p) => normPhone(p)).filter(Boolean).slice(0, 3), sid: int(a.sid) || null, add_at: at, add_by: by, go: null };
    L.push(e); byK.set(k, e);
  }
  for (const k of remove) {
    const e = get(k);
    if (HIST.has(e.src)) throw new HttpError("تأمین‌کنندهٔ سوابق از فهرست حذف نمی‌شود؛ تیکش را بردارید.", 409);
    if (e.go) throw new HttpError(`«${e.name}» به کارشناس هوشمند سپرده شده است.`, 409);
    L.splice(L.indexOf(e), 1); byK.delete(e.k);
  }
  const n = L.filter((e) => e.on).length;
  if (cap && n > cap) throw new HttpError(`حداکثر ${faN(cap)} تأمین‌کنندهٔ تیک‌خورده برای هر قلم (سقفِ دعوت در پنل پشتیبانی).`, 422, { cap });
  return pick;
}

/** «سپردن یا برگشت»: همان رتبه‌بندی — تیکِ پنج نفر اول، بی افزوده */
export function resetToDefault(pick) {
  pick.list = pick.list.filter((e) => HIST.has(e.src));
  for (const e of pick.list) { e.on = !!e.top; e.why = null; e.why_at = null; e.why_by = null; }
  return pick;
}

/**
 * سنجشِ پیش از «شروع»: دست‌کم یک تیک؛ «انتخاب کارشناس»: هر نفرِ پنج نفر اول که تیک ندارد توضیح دارد؛ سقفِ تیک.
 * more: فقط انتخاب‌های تازهٔ قلمِ سپرده‌شده (تیک‌خورده و سپرده‌نشده). need=false (سپردنِ یکجای درخواست، ▶️ پشتیبانی): فهرستِ بی تیک هم
 * می‌رود — کارشناس هوشمند منتظرِ افزودهٔ پشتیبانی یا «واگذاری» می‌ماند.
 */
export function startCheck(pick, mode, { cap, more = false, need = true } = {}) {
  const L = (pick && pick.list) || [];
  const on = L.filter((e) => e.on);
  if (more) {
    const fresh = on.filter((e) => !e.go);
    if (!fresh.length) throw new HttpError("انتخابِ تازه‌ای برای دعوت نیست؛ اول تأمین‌کننده‌ای را تیک بزنید یا از «جستجوی هوشمند» بیفزایید.", 409);
    return fresh;
  }
  if (!on.length && need) {
    throw new HttpError(mode === "handoff" && !L.length ? "فهرستِ سوابقِ این قلم خالی است؛ در حالت «سپردن یا برگشت» فقط «↩️ برگرداندن به مدیر» می‌ماند."
      : "دست‌کم یک تأمین‌کننده را تیک بزنید — از سوابق، یا از «جستجوی هوشمند» با «🎯 به فهرست دعوت».", 422);
  }
  if (mode === "pick") {
    const miss = L.filter((e) => e.top && !e.on && !T(e.why));
    if (miss.length) throw new HttpError(`برداشتنِ تیکِ پنج نفر اول توضیح می‌خواهد: ${list(miss.map((e) => e.name))} — علت را کنار همان نام بنویسید.`, 422, { need_reason: miss.map((e) => e.k) });
  }
  if (cap && on.length > cap) throw new HttpError(`حداکثر ${faN(cap)} تأمین‌کنندهٔ تیک‌خورده برای هر قلم (سقفِ دعوت در پنل پشتیبانی).`, 422, { cap });
  return on;
}

/** تیک‌خورده‌ها سپرده می‌شوند — فقط همین‌ها دعوت می‌شوند */
export function release(pick, at) {
  let n = 0;
  for (const e of pick.list) if (e.on && !e.go) { e.go = at; n++; }
  return n;
}

/**
 * فهرست با وضعیتِ هر نفر برای پنل کارشناس: شماره‌های ثبت‌شده (تیکِ پنل)، گفت‌وگوی همین ارجاع و خطِ همین قلم.
 * st: sent (دعوت شد) · human (گفت‌وگوی خودِ کارشناس — کارشناس هوشمند واردش نمی‌شود) · queued (در صفِ دعوت) · nophone (منتظرِ
 * شمارهٔ پنل) · draft (تیکِ تازه، هنوز سپرده نشده) · off
 */
export async function pickView(env, it, aid, pick) {
  const L = (pick && pick.list) || [];
  const keys = [...new Set(L.map((e) => e.k))].slice(0, 80);
  const sups = keys.length ? ((await env.DB.prepare(`SELECT id, name, name_n FROM sp_suppliers WHERE demo=0 AND name_n IN (${keys.map(() => "?").join(",")})`)
    .bind(...keys).all()).results || []) : [];
  const sids = sups.map((s) => s.id);
  let phones = [], threads = [];
  if (sids.length) {
    const q = sids.map(() => "?").join(",");
    const [p, t] = await env.DB.batch([
      env.DB.prepare(`SELECT id, supplier_id, phone, label, panel FROM sp_phones WHERE supplier_id IN (${q}) ORDER BY id`).bind(...sids),
      env.DB.prepare(`SELECT t.id, t.supplier_id, EXISTS (SELECT 1 FROM ai_threads x WHERE x.thread_id=t.id) AS ai,
          EXISTS (SELECT 1 FROM sp_lines l WHERE l.thread_id=t.id AND l.item_id=?) AS line FROM sp_threads t WHERE t.assignment_id=? AND t.supplier_id IN (${q})`).bind(it.id, aid, ...sids),
    ]);
    phones = p.results || []; threads = t.results || [];
  }
  const supOf = new Map(sups.map((s) => [s.name_n, s]));
  return L.map((e) => {
    const s = supOf.get(e.k) || null;
    const ph = s ? phones.filter((p) => p.supplier_id === s.id).map((p) => ({ id: p.id, phone: p.phone, label: p.label, panel: !!p.panel })) : [];
    const th = s ? threads.find((x) => x.supplier_id === s.id) || null : null;
    const panel = ph.filter((p) => p.panel).length;
    const st = !e.on ? "off" : th && th.line ? (th.ai ? "sent" : "human") : th && !th.ai ? "human" : !e.go ? "draft" : panel ? "queued" : "nophone";
    return { ...e, src_fa: PICK_SRC_FA[e.src] || e.src, supplier_id: s ? s.id : null, phones: ph, panel, thread_id: th ? th.id : null, st,
      found: (e.ph || []).filter((p) => !ph.some((x) => x.phone === p)) };
  });
}

/**
 * نامزدهای دعوتِ کارِ کارشناس هوشمند (روالِ تازه): فقط تیک‌خورده‌های سپرده‌شده (go) از فهرستِ اقلامِ همین کار، به نوبت میانِ
 * اقلام (نفرِ اولِ هر قلم، بعد دوم …) — همان شکلِ نامزدهای پیشین: {key, name, items, src, tier, rank, found}.
 * rows: [{id, pick_json}] به ترتیبِ اقلامِ کار.
 */
export function pickCands(rows) {
  const per = rows.map((r) => ({ id: r.id, list: ((pickOf(r) || {}).list || []).filter((e) => e.on && e.go) }));
  const by = new Map();
  let rank = 0;
  for (let i = 0; per.some((p) => i < p.list.length); i++) {
    for (const p of per) {
      const e = p.list[i];
      if (!e) continue;
      const c = by.get(e.k) || { key: e.k, name: e.name, items: [], src: threadSrc(e.src), tier: HIST.has(e.src) ? e.src : null, rank: ++rank, found: [] };
      if (!c.items.includes(p.id)) c.items.push(p.id);
      for (const ph of e.ph || []) if (!c.found.includes(ph)) c.found.push(ph);
      by.set(e.k, c);
    }
  }
  return [...by.values()];
}

/** خلاصهٔ انتخابِ کارشناس برای پروندهٔ پایانی (شرح فرایند و نامه): تیک‌ها، برداشتنِ پنج نفر اول با علت، افزوده‌ها */
export function pickSummary(rows, titleOf) {
  return rows.map((r) => {
    const p = pickOf(r);
    const title = titleOf(r.id) || "قلم";
    if (!p) return `- ${title}: فهرستِ دعوت ندارد.`;
    const L = p.list || [], on = L.filter((e) => e.on && e.go);
    const off = L.filter((e) => e.top && !e.on);
    const added = on.filter((e) => !HIST.has(e.src));
    return `- ${title}: ${faN(on.length)} تأمین‌کننده سپرده شد از ${faN(L.length)} نفرِ فهرست (به ترتیبِ رتبهٔ نهایی و قاعدهٔ دعوت؛ پنج نفر اول از پیش تیک‌خورده)`
      + (off.length ? `\n    برداشتنِ تیکِ پنج نفر اول: ${off.map((e) => `${e.name}${e.why ? ` — علت: ${e.why}` : ""}`).join("؛ ")}` : "")
      + (added.length ? `\n    افزودهٔ کارشناس: ${added.map((e) => `${e.name} (${PICK_SRC_FA[e.src]})`).join("، ")}` : "");
  }).join("\n");
}
