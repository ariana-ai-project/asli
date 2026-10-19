/**
 * «مذاکرهٔ دوگامی» — فاز ۴ طرح «پیام اول، استراتژی‌ها، پروفایل و گراف تأمین‌کنندگان» (تصمیم‌های ۴ و ۶؛ 01_algorithms/A6 بستهٔ «درخواست تغییر ۰۲»)
 *
 * هر پیامِ متنیِ تازهٔ تأمین‌کننده در گفت‌وگویی که یک قلمِ باز با دادهٔ تحقیق دارد:
 *   ۰. نگهبانِ ورودی (کد): الگوی دستورِ جاسازی‌شده ← ST-E03.
 *   ۱. طبقه‌بند (P3، پیش‌فرض Claude Haiku 5.5): تا سه وضعیت با اطمینان و شاهد، و عددها و شرط‌ها ساخت‌یافته. اطمینانِ کمتر از ۰٫۵
 *      ← ST-E10 (پاسخِ امنِ کوتاه و ارجاع، بی گامِ دوم)؛ عددِ تازه بی وضعیتِ N ← ST-N00؛ تقدم E > C > Q > N > R > P.
 *   ۲. کد (قطعی): برنامه از قیمت مرجع، قاعده‌های سندِ تأییدشده و بهترین پیشنهادِ واقعیِ دیگران (BATNA، از پنل و یادداشت)؛ قیمتِ
 *      مؤثرِ پیشنهادِ تازه، accept، پیشنهادِ بعدیِ ما و قیمتِ اسمی‌اش با شرایطِ همین گفت‌وگو، بسته‌های پرداختِ دیرتر با نرخِ گفتنی و ST-N20.
 *   ۳. مذاکره‌گر (P4، پیش‌فرض Claude Sonnet 5.5): یک حرکت از ده حرکت و پیام، با کارتِ کاملِ همان وضعیت‌ها.
 *   ۴. اعتبارسنج (strategy/validator.js) و نگهبانِ نظرهای کارکنان: ردشده یک بار با دلیل بازنویسی می‌شود؛ باز ردشده نمی‌رود، با
 *      «🚨 پرسش» به کارشناس می‌رسد و در «⭐ ارزیابی ربات» با جعبهٔ نقدِ همان قاعده ثبت می‌شود.
 *   ۵. ثبت: دورِ t، پیشنهادهای ما، یادداشتِ مشترکِ قلم (cr_facts؛ در گفت‌وگوی دیگر فقط بی‌نام) و توافقِ موقت.
 * «بله»ی تأمین‌کننده توافقِ موقت است: M-CLOSE همیشه «پس از تأیید کمیسیون» دارد و تأیید با همان روالِ بسته‌هاست.
 *
 * فقط پاسخِ چت عوض می‌شود: خروجی همان شکلِ negotiate است و «⏱/⏸»، «🚨 پرسش»، «✋ تحویل» و تصمیمِ بسته‌ها سرِ جایشان. پشتِ کلیدِ
 * turn پنل پشتیبانی؛ گفت‌وگوی چندقلمی، قلمِ بیرون از دادهٔ تحقیق یا بی پیامِ متنیِ تازه ← null (همان negotiate).
 */
import { HttpError } from "./http.js";
import { callModel } from "./ai-prompts.js";
import { headPolicy, headRow } from "./cr-engine.js";
import { docNumbers, docRules, panelSettings, docBlock } from "./strategy-doc.js";
import { effectivePrice, nominalForEffective, settingsFor } from "./strategy/pricing.js";
import { planNegotiation, nextOffer, accept as acceptOffer } from "./strategy/negotiation.js";
import { validateTurn, norm as vnorm } from "./strategy/validator.js";
import { extremeAnchor } from "./strategy/detectors.js";
import { P0, P3, P4, STATES, MOVES, KB } from "./strategy/kb-data.js";
import { qtyRange } from "./first-msg.js";
import { recordGuard } from "./ai-feedback.js";
import { resolveSid } from "./sreg.js";
import { supKey } from "./cr-data.js";

const now = () => Date.now();
const T = (v) => String(v == null ? "" : v).trim();
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const clip = (s, n) => { const x = T(s); return x.length > n ? `${x.slice(0, n - 1)}…` : x; };
const termsOf = (row) => { const t = parse(row && row.terms_json, null); return t && typeof t === "object" ? t : {}; };

export const TURN_DDL = `
CREATE TABLE IF NOT EXISTS cr_turns (thread_id INTEGER PRIMARY KEY, item_id INTEGER, t INTEGER NOT NULL DEFAULT 0, offers TEXT, last TEXT, agreement TEXT, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS cr_facts (id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL, thread_id INTEGER NOT NULL, supplier_k TEXT, type TEXT NOT NULL, value TEXT NOT NULL, anon TEXT, usable INTEGER NOT NULL DEFAULT 0, eff REAL, src_msg INTEGER, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_crfacts_item ON cr_facts(item_id, at);
`;
/** مدل‌های دو گام (تصمیم ۴) و گزینه‌های پنل پشتیبانی (settings.crTurnModels) */
export const TURN_MODELS = { p3: "claude-haiku-5-5", p4: "claude-sonnet-5-5" };
export const TURN_MODEL_OPTS = {
  p3: { "claude-haiku-5-5": "Claude Haiku 5.5 — پیش‌فرض (تصمیم ۴)", "claude-haiku-4-5": "Claude Haiku 4.5", "claude-sonnet-5-5": "Claude Sonnet 5.5" },
  p4: { "claude-sonnet-5-5": "Claude Sonnet 5.5 — پیش‌فرض (تصمیم ۴)", "claude-opus-5-5": "Claude Opus 5.5", "claude-fable-5-1": "Claude Fable 5.1" },
};
/* Haiku 5.5 در فهرستِ مدل‌های تب نیست: بی effort و fallbacks؛ اگر API نپذیرفت، طبقه‌بند با Haiku 4.5 (تا پایانِ عمرِ همین isolate) */
const P3_CAPS = { effort: false, fallbacks: false };
const P3_FALLBACK = "claude-haiku-4-5";
const badModels = new Set();
const MOVE_IDS = MOVES.map((m) => m.id);
const OFFER_MOVES = new Set(["M-ANCHOR", "M-COUNTER", "M-PACKAGE", "M-FACT", "M-SPLIT"]);
const FACT_TYPES = ["قیمت", "شرط پرداخت", "شرط تحویل", "پذیرش", "رد", "استدلال", "موجودی", "زمان تحویل"];
const RANK = { E: 0, C: 1, Q: 2, N: 3, R: 4, P: 5 };
/* پیام‌های گفت‌وگو: متن، و متنِ پیاده‌شدهٔ پیامِ صوتی (یادداشت‌ها و رویدادها نه) */
const TALK = new Set(["text", "voice"]);
const SAFE_REPLY = "ممنون از پیامتان. بررسی می‌کنیم و به‌زودی پاسخ می‌دهیم.";

export async function turnOn(env) {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key='crFlags'").first().catch(() => null);
  return !!(parse(r && r.value, {}) || {}).turn;
}
export async function turnModels(env) {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key='crTurnModels'").first().catch(() => null);
  const v = parse(r && r.value, {}) || {};
  return { p3: TURN_MODEL_OPTS.p3[v.p3] ? v.p3 : TURN_MODELS.p3, p4: TURN_MODEL_OPTS.p4[v.p4] ? v.p4 : TURN_MODELS.p4 };
}
export async function saveTurnModels(env, b) {
  const cur = await turnModels(env);
  for (const k of ["p3", "p4"]) if (b && b[k] !== undefined) { if (!TURN_MODEL_OPTS[k][b[k]]) throw new HttpError(`مدلِ ${k === "p3" ? "طبقه‌بند" : "مذاکره‌گر"} در فهرست نیست.`, 422); cur[k] = b[k]; }
  await env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('crTurnModels',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
    .bind(JSON.stringify(cur), now()).run();
  return cur;
}

/* ------------------------------------------------------------------ */
/* طرح‌واره‌های خروجی — بی null و بی union: عددِ ناگفته ۰، متنِ ناگفته خالی، و «بله/نه/نامعلوم» برای دوحالته‌ها؛ کد آن‌ها را به     */
/* شکلِ classifier.schema.json و turn.schema.json بسته (با null) برمی‌گرداند.                                                    */
/* ------------------------------------------------------------------ */
const S = { type: "string" }, N = { type: "number" }, B = { type: "boolean" };
const E = (vals) => ({ type: "string", enum: vals });
const obj = (props) => ({ type: "object", properties: props, required: Object.keys(props), additionalProperties: false });
const TRI = ["بله", "نه", "نامعلوم"];
export const CLS_API = obj({
  states: { type: "array", items: obj({ id: S, confidence: N, evidence: S }) },
  extracted: obj({ unit_price: N, currency_as_stated: E(["ریال", "تومان", "دلار", "درهم", "یورو", "یوان", "لیر", "نامعلوم"]), unit: S, qty: N, vat_included: E(TRI),
    official_invoice: E(TRI), payment_method: E(["نقد", "اعتباری", "چک", "ترکیبی", "نامعلوم"]), pay_months: N, prepay_share: N, delivery_days: N, delivery_place: S,
    validity_hours: N, brand: S, origin_country: S, genuine_or_equivalent: E(["اصلی", "معادل", "نامعلوم"]), condition_accepted: E(TRI), moq: N, partial_qty: N,
    mentions_others: B, threat: B, asks_commitment: B }),
  notes_for_buyer: S,
});
export const TURN_API = obj({
  state_ids: { type: "array", items: S },
  move: E(MOVE_IDS),
  offer: obj({ unit_price: N, pay_months: N, payment_method: S, delivery_days: N, qty: N, other_terms: S, package_ref: S }),
  message_fa: S,
  facts_used: { type: "array", items: S },
  new_facts: { type: "array", items: obj({ type: E(FACT_TYPES), value: S, usable_elsewhere: B }) },
  needs_human: B,
  escalation_reason: S,
  notes_for_buyer: S,
});
const pos = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
const tri = (v) => (v === "بله" ? true : v === "نه" ? false : null);
const known = (v) => (T(v) && v !== "نامعلوم" ? T(v) : null);
/** extracted ← شکلِ بسته (null یعنی گفته نشده) */
export function exOf(x = {}) {
  const share = pos(x.prepay_share);
  return { unit_price: pos(x.unit_price), currency_as_stated: known(x.currency_as_stated), unit: known(x.unit), qty: pos(x.qty), vat_included: tri(x.vat_included),
    official_invoice: tri(x.official_invoice), payment_method: known(x.payment_method), pay_months: pos(x.pay_months), prepay_share: share == null ? null : Math.min(1, share > 1 ? share / 100 : share),
    delivery_days: pos(x.delivery_days), delivery_place: known(x.delivery_place), validity_hours: pos(x.validity_hours), brand: known(x.brand), origin_country: known(x.origin_country),
    genuine_or_equivalent: known(x.genuine_or_equivalent), condition_accepted: tri(x.condition_accepted), moq: pos(x.moq), partial_qty: pos(x.partial_qty),
    mentions_others: !!x.mentions_others, threat: !!x.threat, asks_commitment: !!x.asks_commitment };
}
const offerOf = (o) => (o && pos(o.unit_price) ? { unit_price: pos(o.unit_price), pay_months: Number(o.pay_months) > 0 ? Number(o.pay_months) : 0, payment_method: known(o.payment_method),
  delivery_days: pos(o.delivery_days), qty: pos(o.qty), other_terms: known(o.other_terms), package_ref: known(o.package_ref) } : null);

/* ------------------------------------------------------------------ */
/* پرامپت‌ها                                                            */
/* ------------------------------------------------------------------ */
/* فهرستِ فشردهٔ وضعیت‌ها برای P3: زبانی و «هر دو»، و همهٔ نگهبان‌ها (state_index.md بسته) */
const STATE_INDEX = Object.values(STATES).filter((s) => ["language", "both"].includes((s.detect || {}).by) || s.group === "E")
  .map((s) => `${s.id} — ${s.name}${((s.detect || {}).cues || []).length ? ` — نشانه‌ها: ${s.detect.cues.slice(0, 4).join("، ")}` : ""}`).join("\n");
const ADAPT_P3 = `## سازگاری با این سامانه
- طرح‌وارهٔ خروجی null ندارد: عددِ گفته‌نشده ۰، متنِ گفته‌نشده رشتهٔ خالی، و برای دوحالته‌ها «بله»، «نه» یا «نامعلوم».
- قیمتِ تومانی را همان‌طور که گفته شده بنویس و currency_as_stated را «تومان» بگذار؛ کد به ریال می‌برد. prepay_share کسری از ۰ تا ۱ است.`;
const ADAPT_P4 = `## سازگاری با این سامانه
- لحن: محاوره‌ای و مؤدبِ بازار (همان لحنِ کارشناس هوشمندِ این سامانه)، کوتاه. هوش مصنوعی بودن را انکار نکن و واقعیت نساز.
- طرح‌وارهٔ خروجی null ندارد: offer.unit_price = ۰ یعنی پیشنهادِ عددی نداری؛ متنِ گفته‌نشده خالی. pay_months = ۰ یعنی همان شرایطِ فعلیِ گفت‌وگو؛ برای بسته، package_ref همان ref بستهٔ <engine>.
- عددها ریالی‌اند؛ اگر تأمین‌کننده تومان گفته، معادلِ تومانی را هم می‌توانی بگویی. ابزاری در کار نیست: عددی که در <engine> نیست ← needs_human.
- قیمت و شرایط را تأمین‌کننده در «پنلِ تأمین‌کننده» ثبت و «ارسال» می‌کند؛ در M-CLOSE بخواه همان توافق را در پنل ثبت کند و بنویس «تصمیم نهایی پس از تأیید کمیسیون».
- <strategy_doc> اگر آمد، سندِ تأییدشدهٔ کارشناس است؛ از آن پیروی کن، ولی عدد فقط از <engine>.
- <validator_violations> اگر آمد، پیامِ قبلی‌ات به این دلیل‌ها رد شد؛ همان‌ها را درست کن.`;

/* ------------------------------------------------------------------ */
/* وضعیت‌ها                                                            */
/* ------------------------------------------------------------------ */
const INJECT = /نادیده\s*بگیر|دستور(?:\s*ها|ات)?(?:ی)?\s+(?:قبلی|قبل|پیشین)|ignore\s+(?:all\s+|the\s+)?(?:previous|prior|above)\s+instructions|system\s*prompt|you\s+are\s+now|به\s*عنوان\s+سیستم|تو\s+مجازی/i;
/** نامزدهای طبقه‌بند + نگهبانِ ورودی + ST-N00 + آشکارسازهای داده‌ای ← تا سه وضعیت به ترتیبِ تقدم (A6 §۱) */
export function statesOf(cls, { text = "", price = false, data = [] } = {}) {
  let st = (cls || []).filter((s) => s && STATES[s.id]).map((s) => ({ id: s.id, confidence: Math.max(0, Math.min(1, Number(s.confidence) || 0)), evidence: clip(s.evidence, 300) }));
  if (INJECT.test(vnorm(text)) && !st.some((s) => s.id === "ST-E03")) st.push({ id: "ST-E03", confidence: 0.95, evidence: "نگهبانِ ورودی: الگوی دستورِ جاسازی‌شده" });
  if (!st.some((s) => s.confidence >= 0.5 && s.id !== "ST-E10")) return [{ id: "ST-E10", confidence: 1, evidence: "هیچ وضعیتی با اطمینانِ ۰٫۵ یا بیشتر نبود" }];
  st = st.filter((s) => s.confidence >= 0.4 && s.id !== "ST-E10");
  if (price && !st.some((s) => STATES[s.id].group === "N")) st.push({ id: "ST-N00", confidence: 0.6, evidence: "عددِ تازه بی وضعیتِ دیگری از گروهِ N" });
  for (const d of data) if (STATES[d.state] && !st.some((s) => s.id === d.state)) st.push({ id: d.state, confidence: 1, evidence: d.detail });
  const seen = new Set();
  return st.filter((s) => !seen.has(s.id) && seen.add(s.id))
    .sort((a, b) => RANK[STATES[a.id].group] - RANK[STATES[b.id].group] || b.confidence - a.confidence).slice(0, 3);
}

/* ------------------------------------------------------------------ */
/* برنامه، قیمتِ مؤثر و یادداشتِ مشترک                                   */
/* ------------------------------------------------------------------ */
const UNIT_SYN = { "کیلو": "کیلوگرم", "kg": "کیلوگرم", "تعداد": "عدد", "pcs": "عدد", "m": "متر" };
const unitKey = (u) => { const k = vnorm(T(u)).replace(/\s+/g, "").toLowerCase(); return UNIT_SYN[k] || k; };
export const sameUnit = (a, b) => !T(a) || !T(b) || unitKey(a) === unitKey(b);
const effOf = (price, terms, settings) => effectivePrice({ qty: 1, condition_ok: true, ...terms, price }, {}, settings).effective_unit_price;
/** شرایطِ پنلِ تأمین‌کننده (quote-rules.js) ← شرایطِ effectivePrice؛ مدتِ «اعتباری» گفته نشده، پس محتاطانه نقد */
const panelTerms = (t) => ({ has_official_invoice: t.invoice !== "غیر رسمی", vat_included: t.vat === "ندارد", pay_months: 0, prepay_share: /۵۰|50/.test(T(t.pay)) ? 0.5 : 0 });

/**
 * برنامهٔ مذاکره با این تأمین‌کننده (A5): planNegotiation با قیمت مرجع و پیشنهادهای واقعیِ دیگران، و درصدهای سندِ تأییدشده
 * (rules_pct: هدف و حد نسبت به مرجع، آهنگ c و دورها) اگر هست — هر دو هرگز بالاتر از بهترین پیشنهادِ واقعی.
 */
export function planOf(profile, ref, quotes, rules) {
  const p = planNegotiation(profile, ref, quotes, false);
  if (p.status !== "OK") return null;
  const r = rules || {}, best = p.batna;
  const cap = (v) => (best != null ? Math.min(v, best) : v);
  if (Number.isFinite(r.target_vs_ref)) p.target = cap(p.anchor * (1 + r.target_vs_ref));
  if (Number.isFinite(r.rv_tol)) p.reservation = cap(p.anchor * (1 + r.rv_tol));
  if (Number(r.concession_c) > 0) p.c = Number(r.concession_c);
  if (Number.isInteger(r.rounds) && r.rounds >= 1) p.rounds = r.rounds;
  if (p.target > p.reservation) p.target = p.reservation;
  return p;
}

const fid = (id) => `F-${id}`;
/**
 * یادداشتِ مشترک برای این گفت‌وگو (R17؛ A6 §۵): واقعیت‌های خودش با متنِ کامل؛ از دیگران فقط بی‌نام و طبقِ «پیشنهادِ دیگران»ِ سند
 * (none | better_only | fact). قیمتِ دیگران هرگز با عدد (ST-N16): فقط «پیشنهادِ واقعیِ کمتری داریم» وقتی بهترینِ دیگران از پیشنهادِ
 * فعلیِ همین تأمین‌کننده کمتر است. best: {eff, id} — id برای خطِ پنل «L<شناسهٔ خط>».
 */
export function notesFor(rows, threadId, { eff = null, best = null, others = "better_only" } = {}) {
  const out = rows.filter((r) => r.thread_id === threadId).slice(0, 15)
    .map((r) => ({ fact_id: fid(r.id), type: r.type, value: r.value, usable_elsewhere: !!r.usable, own: true }));
  if (others === "none") return out;
  if (best && eff && best.eff < eff * 0.995) {
    out.push({ fact_id: fid(best.id), type: "قیمت", value: "پیشنهادِ واقعیِ دیگری با قیمتِ مؤثرِ کمتر از پیشنهادِ فعلیِ شما ثبت شده است (نام و عددش گفتنی نیست)", usable_elsewhere: true, own: false });
  }
  if (others === "fact") {
    const seen = new Set();
    for (const r of rows) {
      if (out.length >= 30) break;
      if (r.thread_id === threadId || !r.usable || r.type === "قیمت" || !T(r.anon)) continue;
      const k = `${r.supplier_k}|${r.type}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ fact_id: fid(r.id), type: r.type, value: r.anon, usable_elsewhere: true, own: false });
    }
  }
  return out;
}

/** نگهبانِ نظرها: نامِ صاحب‌نظر یا تکه‌ای (۱۲ نویسهٔ پیاپی) از نظرهای کارکنان دربارهٔ تأمین‌کنندگان در پیامِ بیرونی */
export function opinionLeaks(message, opinions) {
  const msg = vnorm(message || "").replace(/\s+/g, " ");
  const v = [];
  for (const o of opinions || []) {
    for (const nm of [o.holder, o.author_name]) if (T(nm).length >= 3 && msg.includes(vnorm(T(nm)).replace(/\s+/g, " "))) v.push(`confidential: نامِ صاحب‌نظر «${T(nm)}»`);
    const body = vnorm(T(o.body)).replace(/\s+/g, " ");
    for (let i = 0; i + 12 <= body.length; i += 6) {
      const piece = body.slice(i, i + 12);
      if (piece.trim().length >= 10 && msg.includes(piece)) { v.push("confidential: تکه‌ای از نظرهای کارکنان"); break; }
    }
  }
  return [...new Set(v)];
}
/* دستهٔ نقضِ اعتبارسنج ← جعبهٔ نقد (worker/critique.js) */
export const boxOfViolation = (v) => (/^(commitment|claim|tax)/.test(v) ? "claim" : /^number/.test(v) ? "number" : /^threat/.test(v) ? "tone" : "leak");

async function opinionsOf(env, names) {
  const sids = [];
  for (const n of names.slice(0, 11)) { if (!T(n)) continue; const s = await resolveSid(env, { name: n }).catch(() => null); if (s) sids.push(s); }
  if (!sids.length) return [];
  return (await env.DB.prepare(`SELECT holder, author_name, body FROM sreg_ops WHERE sid IN (${sids.map(() => "?").join(",")}) AND hidden=0 ORDER BY created_at DESC LIMIT 60`)
    .bind(...sids).all().catch(() => ({ results: [] }))).results || [];
}

/* ------------------------------------------------------------------ */
/* یک نوبت                                                             */
/* ------------------------------------------------------------------ */
async function classify(rec, models, args) {
  let model = badModels.has(models.p3) ? P3_FALLBACK : models.p3;
  rec.purpose = "classify";
  try {
    return (await callModel(rec.env, { ...args, model, caps: P3_CAPS })).out;
  } catch (e) {
    if (model === P3_FALLBACK || !(e && e.code === "http" && /model/i.test(e.message || ""))) throw e;
    badModels.add(model);
    model = P3_FALLBACK;
    return (await callModel(rec.env, { ...args, model, caps: P3_CAPS })).out;
  }
}

/**
 * پاسخِ یک گفت‌وگو با دو گام — همان شکلِ خروجیِ negotiate ({reply, actions, thread_status, memo, note, ask_expert} و _turn برای
 * گزارش)، {defer} در گامِ فوری وقتی پیام باید بازنویسی شود (Cron با عمقِ کامل)، یا null وقتی این گفت‌وگو جای مذاکرهٔ دوگامی نیست.
 * rec: ضبط‌کنندهٔ ai-agent.js ({env, purpose}) — purpose پیش از هر فراخوان گذاشته می‌شود.
 */
export async function turnReply(env, rec, { run, th, st, lines, msgs, fast = false, company }) {
  const sNew = (msgs || []).filter((m) => m.who === "s" && m.id > (st.seen_msg || 0) && TALK.has(m.kind || "text") && T(m.body));
  if (!sNew.length) return null;
  const active = [...new Set((lines || []).filter((l) => !["final", "rejected"].includes(l.state)).map((l) => l.item_id))];
  if (active.length !== 1) return null;
  const it = await env.DB.prepare("SELECT id, code, title, spec, qty, unit, need_date, norm_json FROM items WHERE id=?").bind(active[0]).first();
  const headName = it && (parse(it.norm_json, {}) || {}).head;
  const hp = headName ? await headPolicy(env, headName, { itemCode: it.code || null }).catch(() => null) : null;
  if (!hp) return null;
  const prof = hp.profile, pol = hp.policy;
  const [models, panel, row, rules, nums, turnRow, factRows, panelRows, othersRows] = await Promise.all([
    turnModels(env), panelSettings(env), headRow(env, hp.head), docRules(env, hp.head, it.code || null).catch(() => null),
    docNumbers(env, hp.head, it.code || null).catch(() => null),
    env.DB.prepare("SELECT * FROM cr_turns WHERE thread_id=?").bind(th.id).first(),
    env.DB.prepare("SELECT * FROM cr_facts WHERE item_id=? ORDER BY at DESC, id DESC LIMIT 80").bind(it.id).all(),
    /* قیمت و نامِ گفت‌وگوی قدیمیِ «تأمین‌کنندهٔ فرضی» (demo=1) نه محکِ مذاکره است و نه رقیب */
    env.DB.prepare(`SELECT l.id, l.price, l.unit, b.terms_json FROM sp_lines l JOIN sp_bundles b ON b.id=l.bundle_id
      WHERE l.item_id=? AND l.thread_id<>? AND l.price>0 AND b.state IN ('pending','approved','proforma','final')
        AND NOT EXISTS (SELECT 1 FROM sp_threads t JOIN sp_suppliers s ON s.id=t.supplier_id WHERE t.id=l.thread_id AND s.demo=1)`).bind(it.id, th.id).all(),
    env.DB.prepare("SELECT DISTINCT s.name FROM sp_threads t JOIN sp_suppliers s ON s.id=t.supplier_id WHERE t.request_id=? AND t.id<>? AND s.demo=0").bind(th.request_id, th.id).all(),
  ]);
  const nd = ((row && row.rec) || {}).negotiation_defaults || {};
  const builder = (rules && rules.builder) || {};
  const settings = settingsFor(prof, panel);
  if (builder.panel_rate != null) settings.panel_rate = builder.panel_rate;
  const ts = { t: turnRow ? turnRow.t : 0, offers: turnRow ? parse(turnRow.offers, []) : [], agreement: turnRow ? parse(turnRow.agreement, null) : null };
  const facts0 = factRows.results || [];
  const others = (othersRows.results || []).map((r) => r.name).filter((n) => T(n) && n !== th.supplier_name);
  const supplierText = sNew.map((m) => T(m.body)).join("\n").slice(0, 3000);
  const ours = (msgs || []).filter((m) => m.who === "e" && TALK.has(m.kind || "text") && T(m.body)).slice(-3).map((m) => clip(m.body, 600));
  const lastOurs = ts.offers.length ? ts.offers[ts.offers.length - 1] : null;

  /* ۱. طبقه‌بند */
  const brief = { item_head: hp.head, item_title: it.title, unit: it.unit, ms: prof.ms, labels: prof.labels || [], rfq_mode: pol.mode,
    our_last_offer: turnRow ? (parse(turnRow.last, {}) || {}).nominal || null : null };
  const c = await classify(rec, models, { system: `${P3}\n\n## فهرستِ وضعیت‌ها\n${STATE_INDEX}\n\n${ADAPT_P3}`,
    user: `<item_brief>${JSON.stringify(brief)}</item_brief>\n<our_last_messages>${JSON.stringify(ours)}</our_last_messages>\n<supplier_message>\n${supplierText}\n</supplier_message>`,
    schema: CLS_API, maxTokens: 2000, timeoutMs: fast ? 9000 : 60000 });
  const ex = exOf(c.extracted || {});

  /* ۲. کد */
  const unitOk = sameUnit(it.unit, nums && nums.unit) && sameUnit(ex.unit, it.unit);
  const priceRial = !ex.unit_price ? null : !ex.currency_as_stated || ex.currency_as_stated === "ریال" ? ex.unit_price : ex.currency_as_stated === "تومان" ? ex.unit_price * 10 : null;
  const terms = { has_official_invoice: ex.official_invoice ?? true, vat_included: ex.vat_included ?? false, pay_months: ex.pay_months || 0, prepay_share: ex.prepay_share || 0 };
  const eff = priceRial && unitOk ? effOf(priceRial, { ...terms, condition_ok: ex.condition_accepted ?? true }, settings) : null;
  /* بهترین پیشنهادِ واقعیِ دیگران (BATNA): خط‌های ارسال‌شدهٔ پنل و قیمت‌های یادداشت، به همان واحد */
  let best = null;
  for (const l of panelRows.results || []) {
    if (!sameUnit(l.unit, it.unit)) continue;
    const e = effOf(Number(l.price), panelTerms(termsOf(l)), settings);
    if (Number.isFinite(e) && (!best || e < best.eff)) best = { eff: e, id: `L${l.id}` };
  }
  for (const f of facts0) if (f.thread_id !== th.id && f.type === "قیمت" && f.eff && (!best || f.eff < best.eff)) best = { eff: f.eff, id: f.id };
  const ref = nums && nums.status === "OK" && sameUnit(it.unit, nums.unit) ? nums.ref : null;
  const plan = unitOk ? planOf(prof, ref, best ? [best.eff] : [], rules && rules.rules) : null;
  const t = ts.t;
  const hardOk = ex.condition_accepted !== false;
  const acc = plan && eff ? acceptOffer(plan, t, eff, best ? best.eff : null, hardOk) : null;
  const next = plan ? nextOffer(plan, Math.min(plan.rounds, t + 1)) : null;
  const curTerms = { qty: 1, has_official_invoice: terms.has_official_invoice, vat_included: terms.vat_included, pay_months: terms.pay_months, prepay_share: terms.prepay_share };
  /* اسمی رو به پایین گرد می‌شود تا قیمتِ مؤثرش از پیشنهادِ برنامه جلو نیفتد (concession_ok) */
  const nextNominal = next ? Math.floor(nominalForEffective(next, curTerms, {}, settings)) : null;
  /* نرخِ گفتنی برای پرداختِ دیرتر (تصمیم ۱۲): نیمِ نرخِ پنل، یا خودِ نرخ اگر say_panel_rate؛ بسته‌ها با همین نرخ اسمی می‌شوند و
     قیمتِ مؤثرشان با نرخِ کامل ≤ پیشنهادِ بعدی است، و از پیشنهادِ قبلیِ ما کمتر نه (امتیاز پس گرفته نمی‌شود) */
  const rate = settings.panel_rate ? (panel.say_panel_rate ? settings.panel_rate : settings.panel_rate / 2) : null;
  const packages = [];
  if (next && rate) {
    const sOffer = { ...settings, panel_rate: rate, fx_growth: 0, basis: "panel" };
    for (let m = 1; m <= Math.min(6, Number.isInteger(builder.max_pay_months) ? builder.max_pay_months : 3); m++) {
      const tm = { ...curTerms, pay_months: m, prepay_share: 0 };
      const nominal = Math.floor(nominalForEffective(next, tm, {}, sOffer));
      const e = effOf(nominal, tm, settings);
      const allowed = e <= next * 1.001 && (lastOurs == null || e >= lastOurs * 0.999);
      packages.push({ ref: `pay${m}`, label: `پرداخت ${m} ماهه`, terms: { pay_months: m }, nominal_unit: nominal, effective_unit: Math.round(e), allowed });
    }
  }
  const ownPrices = facts0.filter((f) => f.thread_id === th.id && f.type === "قیمت").length;
  const dataStates = !ownPrices && eff && ref ? extremeAnchor(eff, ref, prof.ms) : [];
  const states = statesOf(c.states, { text: supplierText, price: !!priceRial, data: dataStates });
  const notes = notesFor(facts0, th.id, { eff, best, others: builder.others || "better_only" });
  const engine = {
    extracted: ex, offer_effective_unit: eff ? Math.round(eff) : null, accept: acc, next_offer: next ? Math.round(next) : null, next_offer_nominal: nextNominal,
    next_offer_terms: next ? { pay_months: curTerms.pay_months, vat_included: curTerms.vat_included, official_invoice: curTerms.has_official_invoice } : null,
    packages, offered_monthly_rate: rate, concession_ok: true, hard_constraints_ok: hardOk, data_states: dataStates, best_seen: best ? Math.round(best.eff) : null,
    round: { t, T: plan ? plan.rounds : null, last_round: plan ? t + 1 >= plan.rounds : false },
    ...(unitOk ? {} : { note: "واحدِ پیشنهاد یا قیمتِ مرجع با واحدِ قلم یکی نیست؛ کد عددی نداد — واحد را روشن کن یا needs_human" }),
  };
  const stateIds = states.map((s) => s.id);
  const stateFa = stateIds.map((s) => `${s} ${STATES[s].name}`).join("، ");
  const k = supKey(th.supplier_name);
  const srcMsg = sNew[sNew.length - 1].id;
  const priceStmt = priceRial && eff ? env.DB.prepare("INSERT INTO cr_facts (item_id,thread_id,supplier_k,type,value,anon,usable,eff,src_msg,at) VALUES (?,?,?,?,?,NULL,1,?,?,?)")
    .bind(it.id, th.id, k, "قیمت", `${th.supplier_name}: ${Math.round(priceRial)} ریال برای هر ${ex.unit || it.unit || "واحد"}${terms.pay_months ? `، پرداخت ${terms.pay_months} ماهه` : ""}${terms.vat_included ? "، با ارزش افزوده" : ""}`,
      eff, srcMsg, now()) : null;
  const memoOf = (move) => clip(`${T(st.memo)}\n• دور ${t + 1}: ${stateFa} ← ${move}${eff ? ` (پیشنهادِ مؤثرِ تأمین‌کننده ${Math.round(eff)})` : ""}`, 2000);

  /* ST-E10: پاسخِ امنِ کارت و ارجاع — بی مذاکره‌گر */
  if (stateIds.length === 1 && stateIds[0] === "ST-E10") {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO cr_turns (thread_id,item_id,t,offers,last,agreement,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(thread_id) DO UPDATE SET last=excluded.last, updated_at=excluded.updated_at`)
        .bind(th.id, it.id, t, JSON.stringify(ts.offers), JSON.stringify({ states, move: "M-ESCALATE", eff: engine.offer_effective_unit }), ts.agreement ? JSON.stringify(ts.agreement) : null, now()),
      ...(priceStmt ? [priceStmt] : []),
    ]);
    return { reply: SAFE_REPLY, actions: [], thread_status: "active", memo: memoOf("M-ESCALATE"), note: "",
      ask_expert: "کارشناس هوشمند وضعیتِ پیامِ تازهٔ تأمین‌کننده را با اطمینانِ کافی نشناخت؛ پاسخِ کوتاهِ «بررسی می‌کنیم» رفت — لطفاً خودتان پاسخ دهید.",
      _turn: { states: stateIds, move: "M-ESCALATE", held: false, eff: engine.offer_effective_unit } };
  }

  /* ۳. مذاکره‌گر */
  const cards = Object.fromEntries(stateIds.map((s) => [s, STATES[s]]));
  const kbIds = [...new Set(stateIds.flatMap((s) => STATES[s].kb || []))].filter((x) => KB[x]).slice(0, 6);
  const rg = qtyRange(it.qty);
  const shown = /^بازه/.test(T(pol.disclosure.quantity)) ? (rg ? `حدود ${rg.lo} تا ${rg.hi}` : "مقدار پس از جمع‌بندی") : it.qty;
  const doc = await docBlock(env, [{ head: hp.head, code: it.code || null, title: it.title }]).catch(() => "");
  const user0 = [
    `<item_profile>${JSON.stringify({ item_head: hp.head, ms: prof.ms, labels: prof.labels || [], quadrant: prof.quadrant, supply_power: prof.supply_power, dependence: prof.dependence,
      rfq_mode: pol.mode, negotiation_defaults: { weights: nd.weights || null, hard_constraints: [...(nd.hard_constraints || []), ...((rules && rules.hard) || [])], tradeable_issues: nd.tradeable_issues || [] } })}</item_profile>`,
    `<request>${JSON.stringify({ item_code: it.code || null, item_title: it.title, item_head: hp.head, qty: it.qty, unit: it.unit, qty_shown: shown, needed_by_date: T(it.need_date) || null,
      spec: clip(it.spec, 600) || null, internal: { project: th.party || null } })}</request>`,
    `<settings>${JSON.stringify(settings)}</settings>`,
    `<plan>${JSON.stringify(plan ? { status: "OK", target: Math.round(plan.target), reservation: Math.round(plan.reservation), anchor: Math.round(plan.anchor), batna: best ? Math.round(best.eff) : null,
      c: plan.c, rounds: plan.rounds, t, disclose: plan.disclose } : { status: "NO_NUMBERS", why: unitOk ? "قیمت مرجع یا پیشنهادِ واقعیِ دیگری نیست" : "واحدها یکی نیست" })}</plan>`,
    `<shared_notes>${JSON.stringify(notes.map(({ fact_id, type, value, usable_elsewhere }) => ({ fact_id, type, value, usable_elsewhere })))}</shared_notes>`,
    `<history>${JSON.stringify({ memo: clip(st.memo, 1500), last: (msgs || []).filter((m) => TALK.has(m.kind || "text") && T(m.body)).slice(-8).map((m) => ({ who: m.who === "s" ? "تأمین‌کننده" : "ما", text: clip(m.body, 500) })) })}</history>`,
    `<engine>${JSON.stringify(engine)}</engine>`,
    `<states>${JSON.stringify(cards)}</states>`,
    kbIds.length ? `<kb>\n${kbIds.map((x) => `### ${x} — ${KB[x].title || ""}\n${KB[x].summary || ""}`).join("\n")}\n</kb>` : "",
    doc,
    `<supplier_message>\n${supplierText}\n</supplier_message>`,
  ].filter(Boolean).join("\n");
  const system = `${P0.replace(/\{\{company_name\}\}/g, company || "شرکت")}\n\n${P4}\n\n${ADAPT_P4}`;
  const opinions = await opinionsOf(env, [th.supplier_name, ...others]);
  const allowedBase = [...(next ? [next] : []), ...packages.filter((p) => p.allowed).map((p) => p.effective_unit)];
  const vctx = (turn) => {
    const o = offerOf(turn.offer);
    const pk = o && o.package_ref ? packages.find((p) => p.ref === o.package_ref) : null;
    const tm = { ...curTerms, ...(pk ? { pay_months: pk.terms.pay_months, prepay_share: 0 } : o && o.pay_months ? { pay_months: o.pay_months } : {}) };
    const tEff = o ? effOf(o.unit_price, tm, settings) : null;
    const close = turn.move === "M-CLOSE";
    return { other_supplier_names: others, project_names: [th.party].filter(Boolean), disclose_project: pol.disclosure.project_name !== "نه", valid_fact_ids: notes.map((f) => f.fact_id),
      offer_effective_unit: tEff, reservation: plan ? plan.reservation : null, allowed_offers: close ? (eff ? [eff] : []) : allowedBase,
      previous_offers: close ? [] : ts.offers, plan: close ? null : plan, round: plan ? Math.min(plan.rounds, t + 1) : null };
  };
  const check = (turn) => {
    if (turn.move === "M-ESCALATE" || (turn.needs_human && !T(turn.message_fa))) return [];
    const v = [...validateTurn({ message_fa: turn.message_fa, move: turn.move, facts_used: turn.facts_used || [], offer: offerOf(turn.offer) }, vctx(turn)).violations,
      ...opinionLeaks(turn.message_fa, opinions)];
    if (turn.move === "M-CLOSE" && !(acc && acc.accept) && !stateIds.includes("ST-N23")) v.push("number: جمع‌بندی بی پذیرشِ کد (accept)");
    if (!T(turn.message_fa)) v.push("internal: پیامِ خالی");
    return v;
  };
  rec.purpose = "turn";
  const call = (viol) => callModel(rec.env, { system, user: viol ? `${user0}\n<validator_violations>${JSON.stringify(viol)}</validator_violations>` : user0, schema: TURN_API,
    model: models.p4, effort: fast ? "low" : "medium", maxTokens: 6000, timeoutMs: fast ? 14000 : 90000 });
  let turn = (await call(null)).out;
  let viol = check(turn);
  let rewritten = false;
  if (viol.length) {
    if (fast) return { defer: `پیامِ مذاکرهٔ دوگامی برای «${th.supplier_name}» از اعتبارسنج نگذشت (${viol.slice(0, 2).join("؛ ")})؛ بازنویسی با عمقِ کامل در Cron.` };
    rewritten = true;
    turn = (await call(viol)).out;
    viol = check(turn);
  }
  const held = viol.length > 0;
  const move = MOVE_IDS.includes(turn.move) ? turn.move : "M-ESCALATE";
  const escalate = move === "M-ESCALATE";
  const sent = !held && !escalate && !!T(turn.message_fa);

  /* ۴. ثبت: نوبت، یادداشتِ مشترک، توافقِ موقت؛ پیامِ ردشده در «⭐ ارزیابی ربات» با جعبهٔ همان قاعده */
  const o = offerOf(turn.offer);
  const ourEff = sent && o && move !== "M-CLOSE" ? vctx(turn).offer_effective_unit : null;
  const counted = sent && ourEff != null && OFFER_MOVES.has(move);
  const agreement = sent && move === "M-CLOSE" ? { at: now(), price: priceRial, eff: eff ? Math.round(eff) : null, terms, qty: ex.qty, states: stateIds } : ts.agreement;
  const stmts = [env.DB.prepare(`INSERT INTO cr_turns (thread_id,item_id,t,offers,last,agreement,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(thread_id) DO UPDATE SET t=excluded.t,
      offers=excluded.offers, last=excluded.last, agreement=excluded.agreement, updated_at=excluded.updated_at`)
    .bind(th.id, it.id, counted ? t + 1 : t, JSON.stringify(counted ? [...ts.offers, Math.round(ourEff)] : ts.offers),
      JSON.stringify({ states, move, held, rewritten, eff: engine.offer_effective_unit, accept: acc, nominal: counted ? o.unit_price : null }), agreement ? JSON.stringify(agreement) : null, now())];
  if (priceStmt) stmts.push(priceStmt);
  for (const f of (turn.new_facts || []).slice(0, 5)) {
    if (!FACT_TYPES.includes(f.type) || !T(f.value) || f.type === "قیمت") continue;
    const anon = f.usable_elsewhere ? clip(T(f.value).split(th.supplier_name).join("یک تأمین‌کننده"), 300) : null;
    stmts.push(env.DB.prepare("INSERT INTO cr_facts (item_id,thread_id,supplier_k,type,value,anon,usable,eff,src_msg,at) VALUES (?,?,?,?,?,?,?,NULL,?,?)")
      .bind(it.id, th.id, k, f.type, clip(f.value, 300), anon, f.usable_elsewhere ? 1 : 0, srcMsg, now()));
  }
  await env.DB.batch(stmts);
  if (held) {
    await recordGuard(env, { th, run, text: clip(turn.message_fa, 2000), violations: viol, boxes: [...new Set(viol.map(boxOfViolation))], model: models.p4,
      context: { states: stateIds, move, rewritten, engine: { accept: acc, next_offer: engine.next_offer, offer_effective_unit: engine.offer_effective_unit } } })
      .catch((e) => console.error("turn guard", e && e.message));
  }
  const ask = held ? `پیامِ کارشناس هوشمند به «${th.supplier_name}» دو بار از اعتبارسنج نگذشت و نرفت (${viol.slice(0, 3).join("؛ ")}). پیش‌نویس در یادداشت است — لطفاً خودتان پاسخ دهید.`
    : escalate || (turn.needs_human && move !== "M-CLOSE") ? clip(T(turn.escalation_reason) || "این دورِ مذاکره تصمیمِ شما را می‌خواهد.", 500) : "";
  const note = [held || escalate ? `پیش‌نویسِ نرفته: «${clip(turn.message_fa, 600)}»` : "",
    sent && move === "M-CLOSE" ? "🤝 توافقِ موقت — تأمین‌کننده باید همان را در پنل ثبت کند؛ تصمیمِ نهایی با تأییدِ بسته و کمیسیون." : "", T(turn.notes_for_buyer)].filter(Boolean).join(" — ");
  return {
    reply: sent ? T(turn.message_fa).slice(0, 2900) : "",
    actions: [],
    thread_status: "active",
    memo: memoOf(`${move}${held ? " (رد اعتبارسنج)" : ""}${sent && move === "M-CLOSE" ? " — توافقِ موقت تا تأیید کمیسیون" : ""}`),
    note: clip(note, 1500),
    ask_expert: ask,
    _turn: { states: stateIds, move, held, rewritten, violations: viol, accept: acc, next: engine.next_offer, nominal: nextNominal, eff: engine.offer_effective_unit },
  };
}
