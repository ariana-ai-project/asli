/**
 * «🗂 تأمین‌کنندگان کشف‌شده» در تب «جستجوی هوشمند» (درخواست مالک، مهر ۱۴۰۵)
 *
 * فهرست: ۴۰ نفرِ برترِ ردنشدهٔ واحدِ کشفِ قلم در دادهٔ تحقیق (cr_units.cands). کلیدِ واحد همان cr-engine.js:recipientPlan است: واحدِ کدِ قلم
 * در دادهٔ تحقیق، وگرنه «خوشه|نوع قلم» از نوع قلمِ تحقیقیِ همان قلم. هر نفر با رکوردِ کاملِ دفتر (sreg و دادهٔ data) و اصلاح‌های فعالِ
 * کارشناس (sreg_x) می‌آید؛ «رد در دروازه» (راستی‌آزماییِ −۱) نمی‌آید. هر نامزد در cands:
 *   [sid, fit (۱ اصلی، ۰ خانواده), rank, status, score, p_top10, score_low, score_high, rank_basis, fit_quote, fit_url]
 * پنج خانهٔ آخر از ورودِ مهر ۱۴۰۵ است؛ ردیفِ قدیمیِ شش‌خانه‌ای هم خوانده می‌شود.
 *
 * دروازهٔ «اجرای جستجوی هوشمند» (settings.smartGate): کارشناس جستجوی وب (هزینهٔ API) را فقط برای قلمی اجرا می‌کند که کمتر از min
 * (پیش‌فرض ۱۰) تأمین‌کنندهٔ کشف‌شده دارد؛ مگر پشتیبانی جستجوی همان کارشناس را باز کرده باشد (open) یا قاعده خاموش باشد. مدیر آزاد است.
 * پنل، بات و سرور (api.js POST /search/smart، bot.js) همین gateFor را می‌سنجند.
 */
import { HttpError } from "./http.js";
import { researchHead, codeRow } from "./cr-engine.js";
import { headGuess } from "./ai-modes.js";

const now = () => Date.now();
const T = (v) => String(v == null ? "" : v).trim();
const int = (v) => { const n = parseInt(String(v == null ? "" : v).replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)), 10); return Number.isFinite(n) ? n : null; };
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const faN = (s) => String(s).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[+d]);

/* ------------------------------------------------------------------ */
/* تنظیمات (پنل پشتیبانی — «🎛 کلیدها»)                                   */
/* ------------------------------------------------------------------ */
export const SG_KEY = "smartGate";
export const SG_DEFAULT = { on: true, min: 10, open: [] };
export const SG_FA = {
  on: "روشن (پیش‌فرض): «اجرای جستجوی هوشمند» فقط برای قلمی باز است که تأمین‌کنندهٔ کشف‌شدهٔ کافی ندارد؛ خاموش: برای همه باز.",
  min: "جستجوی هوشمند باز است وقتی تأمین‌کنندگانِ کشف‌شدهٔ قلم کمتر باشند از",
  open: "جستجوی هوشمندِ این کارشناسان همیشه باز است",
};
function cleanSg(x) {
  const v = x && typeof x === "object" ? x : {};
  const m = int(v.min);
  return { on: v.on !== false, min: m == null ? SG_DEFAULT.min : Math.min(200, Math.max(1, m)),
    open: [...new Set((Array.isArray(v.open) ? v.open : []).map(int).filter((n) => n > 0))].sort((a, b) => a - b) };
}
let cache = null;
/** {on, min, open, updated_at, by} — ۶۰ ثانیه در حافظهٔ isolate */
export async function sgCfg(env, t = now()) {
  if (cache && t - cache.at < 60000) return cache.v;
  const r = await env.DB.prepare("SELECT value, updated_at FROM settings WHERE key=?").bind(SG_KEY).first().catch(() => null);
  const raw = parse(r && r.value, null);
  const v = { ...cleanSg(raw), updated_at: r ? r.updated_at : null, by: (raw && raw.by) || null };
  cache = { at: t, v };
  return v;
}
export const resetSgCache = () => { cache = null; };

/** نمای پنل پشتیبانی: تنظیمات و فهرستِ کارشناسان برای «همیشه باز» */
export async function sgAdmin(env) {
  const experts = (await env.DB.prepare("SELECT id, name, label, active FROM experts ORDER BY active DESC, id").all()).results || [];
  return { cfg: await sgCfg(env), fa: SG_FA, default: SG_DEFAULT, experts: experts.map((e) => ({ id: e.id, name: e.label || e.name, active: !!e.active })) };
}
/** ذخیره از پنل پشتیبانی: body.cfg یا خودِ body — {on, min, open: [شناسهٔ کارشناس]}؛ هر فیلدِ نیامده همان قبلی */
export async function saveSgCfg(env, body, by = "support") {
  const b = body && typeof body === "object" ? (body.cfg && typeof body.cfg === "object" ? body.cfg : body) : {};
  if (b.min !== undefined && int(b.min) == null) throw new HttpError("حدِ تأمین‌کنندگانِ کشف‌شده عدد است (مثلاً ۱۰).", 422);
  const cur = await sgCfg(env);
  const next = cleanSg({ on: cur.on, min: cur.min, open: cur.open, ...b });
  const t = now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
      .bind(SG_KEY, JSON.stringify({ ...next, by }), t),
    env.DB.prepare("INSERT INTO events (at,actor,kind,payload_json) VALUES (?,?,?,?)").bind(t, by, "smart_gate_cfg", JSON.stringify(next)),
  ]);
  cache = null;
  return sgAdmin(env);
}

/* ------------------------------------------------------------------ */
/* فهرستِ کشف‌شده‌های یک قلم                                             */
/* ------------------------------------------------------------------ */
/** کلیدِ واحدِ کشفِ قلم و نوع قلمِ تحقیقی — مثل recipientPlan، بی ساختنِ سیاست */
async function unitOf(env, it) {
  const head0 = await headGuess(env, it).catch(() => null);
  const code = T(it && it.code) || null;
  const rh = await researchHead(env, head0, code).catch(() => null);
  const cr = code ? await codeRow(env, code).catch(() => null) : null;
  if (cr && cr.u) return { key: cr.u, head: rh || T(cr.h) || head0 };
  if (!rh) return { key: null, head: head0 };
  const row = await env.DB.prepare("SELECT cluster FROM cr_heads WHERE head=?").bind(rh).first().catch(() => null);
  const cl = (cr && cr.c) || (row && row.cluster) || null;
  return { key: cl ? `${cl}|${rh}` : null, head: rh };
}

/**
 * کشف‌شده‌های قلم: {head, unit_key, cluster, cluster_name, route, n_found, count, list} — list به ترتیبِ رتبه، هر نفر:
 * {sid, name, fit, rank, status, score, lo, hi, p10, basis, quote, url, hub, province, city, role, country, verification, phones, mobiles, staff_phone, d}
 * (d: فیلدهای دیگرِ دفتر — نام رسمی، ثبت، نشانی، تماس، محصولات، دروازه‌ها، منابع و …)
 */
export async function discoveredFor(env, it) {
  const u0 = await unitOf(env, it);
  const out = { head: u0.head || null, unit_key: u0.key, cluster: null, cluster_name: null, route: null, n_found: null, count: 0, list: [] };
  if (!u0.key) return out;
  const u = await env.DB.prepare("SELECT unit_key, head, cluster, cands, unit FROM cr_units WHERE unit_key=?").bind(u0.key).first().catch(() => null);
  if (!u) return out;
  const cands = parse(u.cands, []).filter((c) => Array.isArray(c) && c[0]);
  const info = parse(u.unit, {}) || {};
  Object.assign(out, { head: u.head, cluster: u.cluster || null, cluster_name: info.cluster_name || null, route: info.route || null, n_found: info.n_found ?? null });
  const sids = [...new Set(cands.map((c) => String(c[0])))].slice(0, 90);
  if (!sids.length) return out;
  const ph = sids.map(() => "?").join(",");
  const [regs, xs] = await env.DB.batch([
    env.DB.prepare(`SELECT sid, kind, name, hub, province, city, role, country, verification, phones, mobiles, data FROM sreg WHERE sid IN (${ph})`).bind(...sids),
    env.DB.prepare(`SELECT sid, field, value FROM sreg_x WHERE active=1 AND sid IN (${ph}) ORDER BY at`).bind(...sids),
  ]);
  const by = new Map((regs.results || []).map((r) => [r.sid, r]));
  const fix = new Map();
  for (const x of xs.results || []) { if (!fix.has(x.sid)) fix.set(x.sid, {}); fix.get(x.sid)[x.field] = x.value; }
  for (const c of cands) {
    const [sid, fit, rank, status, score, p10, lo, hi, basis, quote, url] = c;
    const r = by.get(String(sid));
    if (!r) continue;
    const v = status === "تأییدشده" ? 2 : Number(r.verification ?? 0);
    if (v < 0) continue;
    const f = fix.get(r.sid) || {};
    out.list.push({ sid: r.sid, name: T(f.name) || r.name, fit: fit ? "اصلی" : "خانواده", rank: rank ?? null, status: status || null, score: score ?? null, p10: p10 ?? null,
      lo: lo ?? null, hi: hi ?? null, basis: basis || null, quote: quote || null, url: url || null,
      hub: r.hub || null, province: r.province || null, city: r.city || null, role: r.role || null, country: r.country || null, verification: v,
      phones: f.phones != null ? T(f.phones) || null : r.phones || null, mobiles: f.mobiles != null ? T(f.mobiles) || null : r.mobiles || null,
      staff_phone: f.phones != null || f.mobiles != null, d: parse(r.data, {}) || {} });
  }
  out.list.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
  out.count = out.list.length;
  return out;
}

/* ------------------------------------------------------------------ */
/* دروازهٔ «اجرای جستجوی هوشمند»                                          */
/* ------------------------------------------------------------------ */
/**
 * who: {expert} یا {role: "manager"}؛ disc: خروجیِ discoveredFor اگر پیش‌تر خوانده شده. ← {open, count, min, by}
 * by: «staff» (مدیر)، «off» (قاعده خاموش)، «support» (پشتیبانی برای همین کارشناس باز کرده)، «count» (از روی شمار)
 */
export async function gateFor(env, who, it, disc) {
  const g = await sgCfg(env);
  const count = disc ? disc.count : (await discoveredFor(env, it).catch(() => ({ count: 0 }))).count;
  const ex = who && who.expert;
  if (!ex) return { open: true, count, min: g.min, by: "staff" };
  if (!g.on) return { open: true, count, min: g.min, by: "off" };
  if (g.open.includes(ex.id)) return { open: true, count, min: g.min, by: "support" };
  return { open: count < g.min, count, min: g.min, by: "count" };
}
/** متنِ کوتاهِ بسته بودن برای هشدارِ دکمهٔ بات (سقفِ ۲۰۰ نویسهٔ تلگرام) */
export const gateShort = (g) => `🔒 برای این قلم ${faN(g.count)} تأمین‌کنندهٔ کشف‌شده هست؛ جستجوی هوشمند زیر ${faN(g.min)} نفر باز است. برای باز شدن از پشتیبانی بخواهید.`;
/** متنِ بسته بودن — همان «؟» کنارِ دکمهٔ پنل و پاسخِ ۴۰۹ */
export const gateMsg = (g) => `برای این قلم ${faN(g.count)} تأمین‌کنندهٔ کشف‌شده هست؛ «اجرای جستجوی هوشمند» وقتی باز است که کمتر از ${faN(g.min)} نفر باشند، تا هزینهٔ جستجوی وب فقط جایی صرف شود که تحقیق کم آورده. اگر لازم است، از پشتیبانی بخواهید جستجوی هوشمندِ شما را باز کند.`;
