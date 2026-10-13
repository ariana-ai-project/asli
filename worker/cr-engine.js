/**
 * موتور راهبرد روی دادهٔ D1 — پلِ میان worker/strategy (قطعی، بی پایگاه داده) و جدول‌های تحقیق و کارشناس (worker/cr-data.js)
 *
 *   headProfile   پروفایلِ تختِ موتور برای یک نوع قلم: ردیفِ تحقیق + استثنای سطح قلم + آخرینِ تغییرهای فعالِ کارشناس و پشتیبانی
 *   headPolicy    سیاستِ استعلامِ مؤثر (با شمارِ موج اولِ پشتیبانی و حالتِ تغییرداده‌شده) و خلاصهٔ «چرا»
 *   recipientPlan برنامهٔ گیرندگانِ یک قلم روی گراف: تأمین‌کنندگانِ فعلی (سوابقِ ۱۴۰۳ به بعد، به ترتیبِ تازگی و مبلغ) + کشف‌شده‌های
 *                 ۴۰ نفر اولِ واحد، یال‌های مانع، و برنامهٔ «محتاط» برای هر نوع قلم (حتی وقتی پیش‌فرضش حداکثری است)
 * دستورِ ساختِ نامزدها همان 10_analysis_scripts/build_package_data.py بسته است.
 */
import { HttpError } from "./http.js";
import { engineProfile } from "./strategy/profile.js";
import { rfqPolicy, selectRecipients } from "./strategy/rfq.js";
import * as C from "./strategy/config.js";
import { crShard, supKey } from "./cr-data.js";

const now = () => Date.now();
const T = (v) => String(v == null ? "" : v).trim();
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const YM = (y) => y * 12 + 1;                         /* purchases.ym = سال × ۱۲ + ماه */
export const CAUTIOUS = new Set(["LIMITED_STAGED", "STAGED_BROADENING", "DIRECT_PLUS_MARKET_TEST"]);
export const FAMILY = (mode) => (mode === "BROAD" ? "max" : CAUTIOUS.has(mode) ? "cautious" : "special");
export const MODE_FA = { BROAD: "گسترده (حداکثری)", STANDARD: "استاندارد", SIMULTANEOUS_INDEX: "هم‌زمان قیمت‌مرجع", MULTICHANNEL: "چندکاناله",
  LIMITED_STAGED: "محدود و مرحله‌ای", CONSULT_THEN_COMPETE: "مشورت سپس رقابت", DIRECT_PLUS_MARKET_TEST: "مستقیم با آزمون بازار",
  FRAMEWORK_CALLOFF: "قرارداد چارچوب", STAGED_BROADENING: "مرحله‌ای با گسترش مشروط" };

/* ------------------------------------------------------------------ */
/* لایهٔ کارشناس                                                        */
/* ------------------------------------------------------------------ */
/** آخرینِ تغییرِ فعالِ هر فیلدِ یک نوع قلم ← {field: {value, source, by_name, reason, at}} */
export async function headChanges(env, head) {
  const rows = (await env.DB.prepare("SELECT field, value, source, by_name, reason, at FROM cr_head_x WHERE head=? AND active=1 ORDER BY at").bind(head).all()).results || [];
  const out = {};
  for (const r of rows) out[r.field] = { value: parse(r.value, r.value), source: r.source, by_name: r.by_name, reason: r.reason, at: r.at };
  return out;
}
/** تغییرهای کارشناس ← ورودیِ expert در engineProfile (همان کلیدهای questionnaire.applyAnswers) */
function expertUpdates(ch) {
  const e = {};
  if (ch.ms) e.ms = ch.ms.value;
  if (ch.labels_set) e.labels_set = ch.labels_set.value;
  if (ch.rfq_pref) { e.rfq_mode_preference = ch.rfq_pref.value.mode || ch.rfq_pref.value; e.confidence = ch.rfq_pref.value.confidence || "high"; }
  if (ch.pi) e.max_diversification_premium = ch.pi.value;
  if (ch.monthly_rate) e.monthly_rate = ch.monthly_rate.value;
  if (ch.weights) e.weights = ch.weights.value;
  if (ch.hard_constraints_add) e.hard_constraints_add = ch.hard_constraints_add.value;
  return Object.keys(e).length ? e : null;
}

/** ردیفِ تحقیقِ نوع قلم (با rec کامل) — یا null اگر این نوع قلم در بسته نیست */
export async function headRow(env, head) {
  const r = await env.DB.prepare("SELECT * FROM cr_heads WHERE head=?").bind(T(head)).first().catch(() => null);
  return r ? { ...r, rec: parse(r.rec, {}) } : null;
}
/** ردیفِ کد قلم از تکه‌ها: {h, c, u, r, i, ms?, la?, why?} */
export async function codeRow(env, code) {
  const k = T(code);
  if (!k) return null;
  const r = await env.DB.prepare("SELECT data FROM cr_codes WHERE shard=?").bind(crShard(k)).first().catch(() => null);
  return r ? (parse(r.data, {})[k] || null) : null;
}

/** پروفایلِ موتور برای یک نوع قلم و (اختیاری) یک کد قلم */
export async function headProfile(env, head, itemCode) {
  const row = await headRow(env, head);
  if (!row) return null;
  const [ch, cr] = await Promise.all([headChanges(env, row.head), itemCode ? codeRow(env, itemCode) : null]);
  const itemRow = cr && (cr.ms || cr.la) ? { item_ms_override: cr.ms || null, item_labels_add: cr.la || "" } : null;
  const p = engineProfile(row.rec, itemRow, expertUpdates(ch));
  if (ch.mode && C.RFQ_MODES.includes(ch.mode.value)) { p.forced_mode = ch.mode.value; p.forced_why = `به تصمیم ${ch.mode.by_name || "پشتیبانی"}: ${ch.mode.reason || "بی دلیل"}`; }
  return { row, profile: p, changes: ch, code: cr };
}

/* ------------------------------------------------------------------ */
/* سیاستِ مؤثر                                                          */
/* ------------------------------------------------------------------ */
/** جدولِ شمارِ موج اول و سقف (پنل پشتیبانی، settings.crRfqN) روی پیش‌فرضِ بسته */
export async function rfqNTable(env) {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key='crRfqN'").first().catch(() => null);
  const over = r ? parse(r.value, {}) : {};
  const out = {};
  for (const [mode, tiers] of Object.entries(C.RFQ_N)) {
    out[mode] = {};
    for (const [t, v] of Object.entries(tiers)) {
      const o = over[mode] && over[mode][t];
      out[mode][t] = Array.isArray(o) && o.length === 2 && o.every((x) => Number.isInteger(x) && x >= 1 && x <= 20) && o[0] <= o[1] ? o : [...v];
    }
  }
  return out;
}

/**
 * سیاستِ استعلامِ مؤثر برای یک نوع قلم. runtime: {urgent, quantity_vs_typical, request_value_bn}؛ cautious: برنامهٔ «محتاط»
 * (حالتِ محدود و مرحله‌ای) حتی اگر پیش‌فرضِ نوع قلم چیز دیگری است.
 */
export async function headPolicy(env, head, { itemCode, runtime, cautious } = {}) {
  const hp = await headProfile(env, head, itemCode);
  if (!hp) return null;
  const prof = { ...hp.profile };
  if (cautious && !CAUTIOUS.has(rfqPolicy(prof, runtime).competition_mode)) {
    prof.forced_mode = "LIMITED_STAGED";
    prof.forced_why = "به درخواست کارشناس: «این قلم کمیاب یا متمرکز است؛ استعلام محتاط»";
  }
  const pol = rfqPolicy(prof, runtime);
  const table = await rfqNTable(env);
  const tierN = (table[pol.competition_mode] || {})[pol.tier];
  const notes = [];
  if (tierN && (tierN[0] !== pol.n_wave1 || tierN[1] !== pol.n_max)) { [pol.n_wave1, pol.n_max] = tierN; notes.push("شمارِ موج اول و سقف از جدولِ پنل پشتیبانی"); }
  if (hp.changes.n && !cautious) {
    const v = hp.changes.n.value || {};
    if (Number.isInteger(v.n_wave1) && Number.isInteger(v.n_max) && v.n_wave1 >= 1 && v.n_wave1 <= v.n_max) {
      [pol.n_wave1, pol.n_max] = [v.n_wave1, v.n_max];
      notes.push(`استثنای این نوع قلم: ${hp.changes.n.by_name || "پشتیبانی"} — ${hp.changes.n.reason || ""}`.trim());
    }
  }
  return { head: hp.row.head, profile: prof, policy: pol, family: FAMILY(pol.competition_mode), mode_fa: MODE_FA[pol.mode], competition_fa: MODE_FA[pol.competition_mode],
    workflow: hp.row.workflow, priority: hp.row.priority, confidence: hp.row.confidence, changes: hp.changes, notes, code: hp.code };
}

/* ------------------------------------------------------------------ */
/* نامزدها و برنامهٔ گیرندگان                                           */
/* ------------------------------------------------------------------ */
/** تأمین‌کنندگانِ فعلیِ یک نوع قلم از سوابق (سال ۱۴۰۳ به بعد) — با کلیدِ اصلیِ purchases (head, …)، و حافظهٔ ۶ ساعته */
async function incumbentsOf(env, head, codes) {
  const key = `inc|${head}|${codes ? codes.length : 0}`;
  const c = await env.DB.prepare("SELECT v, at FROM cr_cache WHERE k=?").bind(key).first().catch(() => null);
  if (c && now() - c.at < 6 * 3600e3) return parse(c.v, []);
  const rows = (await env.DB.prepare("SELECT item_code, supplier, supplier_n, ym, COALESCE(amount_adj, amount, 0) AS v FROM purchases WHERE head=? AND ym>=?").bind(head, YM(1403)).all()).results || [];
  const want = codes && codes.length ? new Set(codes) : null;
  const by = new Map();
  for (const r of rows) {
    if (want && !want.has(String(r.item_code))) continue;
    if (!r.supplier_n) continue;
    const o = by.get(r.supplier_n) || { k: r.supplier_n, name: r.supplier, last: 0, val: 0 };
    o.last = Math.max(o.last, r.ym || 0); o.val += Number(r.v) || 0;
    by.set(r.supplier_n, o);
  }
  const list = [...by.values()].sort((a, b) => b.last - a.last || b.val - a.val);
  await env.DB.prepare("INSERT INTO cr_cache (k,v,at) VALUES (?,?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at")
    .bind(key, JSON.stringify(list), now()).run().catch(() => {});
  return list;
}

const inChunks = async (env, sql, ids, size = 90) => {
  const out = [];
  for (let i = 0; i < ids.length; i += size) {
    const part = ids.slice(i, i + size);
    out.push(...(((await env.DB.prepare(sql.replace("?*", part.map(() => "?").join(","))).bind(...part).all()).results) || []));
  }
  return out;
};
/* نوعِ رابطهٔ پیوندهای کارشناس ← نوعِ یالِ موتور (برای یال‌های مانع؛ rfq.js:buildAdjacency با startsWith) */
const TYPE_OF_NATURE = { same_business: "تلفن مشترک", same_market: "هم‌پاساژ", partner: "هم‌پاساژ (همکاری)", rival: "رقابت", chain: "زنجیرهٔ تأمین", collusion: "الگوی سلطهٔ مکمل (کارشناس)" };

/**
 * برنامهٔ گیرندگانِ یک قلم: {policy, plan, candidates, cautious?} — plan همان خروجیِ selectRecipients با نام و جزئیاتِ هر نامزد.
 * opts: {itemCode, runtime, cautious, recentlyAsked}
 */
export async function recipientPlan(env, head, opts = {}) {
  const hp = await headPolicy(env, head, opts);
  if (!hp) throw new HttpError("این نوع قلم در دادهٔ تحقیق نیست؛ برنامهٔ گیرنده ندارد.", 404);
  /* واحدِ کشف: خوشهٔ کدِ قلم، وگرنه خوشهٔ اصلیِ نوع قلم */
  const cluster = (hp.code && hp.code.c) || hp.profile.cluster;
  const unitKey = (hp.code && hp.code.u) || `${cluster}|${hp.head}`;
  const unit = await env.DB.prepare("SELECT * FROM cr_units WHERE unit_key=?").bind(unitKey).first().catch(() => null);
  const uinfo = unit ? parse(unit.unit, {}) : {};
  const inc = await incumbentsOf(env, hp.head, uinfo.codes || null);
  /* شناسهٔ دفترِ تأمین‌کنندگانِ فعلی با نامِ کلیدی؛ رده از supplier_grades */
  const keys = inc.map((x) => x.k);
  const [regs, grades] = keys.length ? await Promise.all([
    inChunks(env, "SELECT sid, name_n FROM sreg WHERE kind='old' AND name_n IN (?*)", keys),
    inChunks(env, "SELECT sn, grade FROM supplier_grades WHERE sn IN (?*)", keys)]) : [[], []];
  const sidOf = new Map(regs.map((r) => [r.name_n, r.sid])), gradeOf = new Map(grades.map((g) => [g.sn, g.grade]));
  const cands = inc.map((x, i) => ({ id: sidOf.get(x.k) || `N:${x.name}`, name: x.name, is_incumbent: true, priority: i, hub: null, role: null, verification: 2,
    trusted: gradeOf.get(x.k) === "A" && x.last >= YM(1404), source: "سوابق خرید", last_ym: x.last, k: x.k }));
  const seen = new Set(cands.map((c) => c.id));
  const disc = unit ? parse(unit.cands, []) : [];
  const dIds = disc.map((d) => d[0]).filter((s) => !seen.has(s));
  const dRows = dIds.length ? await inChunks(env, "SELECT sid, name, hub, role, verification, phones, mobiles FROM sreg WHERE sid IN (?*)", dIds) : [];
  const dMap = new Map(dRows.map((r) => [r.sid, r]));
  for (const [sid, fit, rank, status, score] of disc) {
    if (seen.has(sid)) continue;
    const r = dMap.get(sid) || {};
    const v = status === "تأییدشده" ? 2 : Number(r.verification ?? 0);
    if (v < 0) continue;
    seen.add(sid);
    cands.push({ id: sid, name: r.name || sid, is_incumbent: false, priority: (fit ? 0 : 50) + (rank ?? 99), hub: r.hub || null, role: r.role || null, verification: v,
      trusted: false, source: "کشف", fit: fit ? "اصلی" : "خانواده", rank, status, score, phones: r.phones || null, mobiles: r.mobiles || null });
  }
  /* یال‌های میانِ نامزدها (یالِ ردشده نه؛ پیشنهادی هم مانع است — تصمیم ۸) */
  const ids = cands.map((c) => c.id);
  const eRows = ids.length ? await inChunks(env, "SELECT a, b, ev, nature, status, source FROM sreg_edges WHERE status<>'ردشده' AND a IN (?*)", ids, 90) : [];
  const eRows2 = ids.length ? await inChunks(env, "SELECT a, b, ev, nature, status, source FROM sreg_edges WHERE status<>'ردشده' AND b IN (?*)", ids, 90) : [];
  const idSet = new Set(ids), edges = [];
  const seenE = new Set();
  for (const e of [...eRows, ...eRows2]) {
    const k = `${e.a}|${e.b}|${e.ev || e.nature}`;
    if (seenE.has(k) || !idSet.has(e.a) || !idSet.has(e.b)) continue;
    seenE.add(k);
    edges.push({ from_id: e.a, to_id: e.b, type: e.ev || TYPE_OF_NATURE[e.nature] || e.nature, nature: e.nature, status: e.status });
  }
  const asked = new Set(opts.recentlyAsked || []);
  const plan = selectRecipients(hp.policy, cands, edges, asked);
  const byId = new Map(cands.map((c) => [c.id, c]));
  const pub = (id) => { const c = byId.get(id) || { id }; return { id, name: c.name, incumbent: !!c.is_incumbent, hub: c.hub, role: c.role, verification: c.verification,
    trusted: !!c.trusted, fit: c.fit || null, rank: c.rank ?? null, phones: c.phones || null, mobiles: c.mobiles || null, k: c.k || supKey(c.name) }; };
  return { head: hp.head, unit_key: unitKey, policy: hp.policy, family: hp.family, mode_fa: hp.mode_fa, competition_fa: hp.competition_fa, notes: hp.notes,
    workflow: hp.workflow, changes: hp.changes,
    plan: { ...plan, wave1: plan.wave1.map(pub), reserve: plan.reserve.map(pub) },
    candidates: cands.length, edges: edges.length };
}
