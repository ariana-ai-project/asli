/**
 * «📘 سند راهبرد» — فاز ۳ طرح «پیام اول، استراتژی‌ها، پروفایل و گراف تأمین‌کنندگان» (سند طراحی، بخشِ «سند راهبرد»؛ تصمیم‌های ۳، ۴ و ۶)
 *
 * برای هر نوع قلم (و هر گونه‌ای که کلاسش را عوض می‌کند، مثلِ کدِ قلمی با استثنای کلاس — variant) یک سند: بازار، استعلام، مذاکره،
 * وضعیت‌های محتمل با پاسخِ آماده، ریسک‌ها و آنچه تأییدِ کارشناس می‌خواهد. پرامپتِ P1 بستهٔ «درخواست تغییر ۰۲» با P0
 * (worker/strategy/kb-data.js) و مدلِ سند (پیش‌فرض Claude Opus 5.5؛ settings.crDocModel) یک بار می‌نویسد و با شمارهٔ نسخه در cr_docs
 * می‌ماند. سند فقط وقتی دوباره ساخته می‌شود که ورودی‌اش عوض شود (input_sha) — نسخه‌های قبلی می‌مانند.
 *
 * عددها با مدل نیستند (P0 بند ۵): حالت، شمار، موج‌ها، گیرندگان و افشا را موتور (cr-engine.js) روی خروجی می‌نویسد؛ هدف، حد و
 * پیشنهادِ هر دورِ هر قلمِ درخواست را موتورِ قطعی از قیمت مرجعِ همان کد حساب می‌کند (docNumbers) و حد فقط درونی است. بسته‌های
 * معاوضه از گزینه‌هایی برگزیده می‌شوند که کد با قیمتِ مؤثر سنجیده (packageOptions).
 *
 * ساخت در Cron (crDocTick، یکی در هر دقیقه — فراخوانِ مدل بیش از مهلتِ waitUntil طول می‌کشد): صفِ «نخستین درخواست» اول، بعد
 * ۱۳۸ نوع قلمِ پرهزینه از پیش (تصمیم ۳). بازبینیِ کارشناس پیش از «🚀 شروع» (reviewDoc): امتیاز ۱ تا ۵ — ۱ تا ۳ توضیح و دست‌کم یک
 * جعبهٔ نقدِ راهبرد — و بعد تأیید، ویرایش (نسخهٔ اول و نهایی هر دو می‌مانند) یا ساخت با سازندهٔ پارامتری (builderDoc). نسخهٔ نهایی
 * در زمینهٔ هر پیامِ کارشناس هوشمند برای همان قلم می‌رود (docBlock). قاعدهٔ صداقت بالاتر از هر راهبرد است. پشتِ کلیدِ doc.
 */
import { HttpError } from "./http.js";
import { callModel, AiError, modelOk, AGENT_MODELS } from "./ai-prompts.js";
import { estimateCost } from "./ai-fetch.js";
import { headRow, headPolicy, recipientPlan, codeRow, MODE_FA } from "./cr-engine.js";
import { crShard } from "./cr-data.js";
import { planNegotiation, nextOffer, referencePrice } from "./strategy/negotiation.js";
import { effectivePrice, settingsFor, dependenceParams, pyRound } from "./strategy/pricing.js";
import { validateTurn } from "./strategy/validator.js";
import * as C from "./strategy/config.js";
import { KB, STATES, P0, P1, MOVES, KB_VERSION } from "./strategy/kb-data.js";
import { boxesIn, STRAT_BOXES, boxesOf } from "./critique.js";

const now = () => Date.now();
const T = (v) => String(v == null ? "" : v).trim();
const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const num = (v) => { const n = Number(String(v == null ? "" : v).replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))); return Number.isFinite(n) ? n : null; };
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const clip = (s, n) => { const x = T(s); return x.length > n ? `${x.slice(0, n - 1)}…` : x; };

export const DOC_DDL = `
CREATE TABLE IF NOT EXISTS cr_docs (id INTEGER PRIMARY KEY, head TEXT NOT NULL, variant TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL, state TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'model', model TEXT, input_sha TEXT, doc_json TEXT, final_json TEXT, review_json TEXT, error TEXT, prio INTEGER NOT NULL DEFAULT 0, cost_usd REAL, item_code TEXT, by TEXT, created_at INTEGER NOT NULL, built_at INTEGER, reviewed_at INTEGER, reviewed_by TEXT);
CREATE INDEX IF NOT EXISTS ix_crdocs_head ON cr_docs(head, variant, version);
CREATE INDEX IF NOT EXISTS ix_crdocs_queue ON cr_docs(state, prio) WHERE state IN ('queued','building');
`;
export const DOC_STATE_FA = { queued: "در صفِ ساخت", building: "در حالِ ساخت", draft: "منتظرِ بازبینیِ شما", approved: "✅ تأییدشده", failed: "ساخت نشد", superseded: "نسخهٔ قدیمی" };
export const DOC_MODEL = "claude-opus-5-5";
/* ۱۳۸ نوع قلمِ پرهزینه (همان کاربرگِ پرسش‌نامه) — از پیش ساخته می‌شوند (تصمیم ۳) */
export const PREGEN_RANK = 138;
const MOVE_IDS = MOVES.map((m) => m.id);
const ALWAYS_STATES = ["ST-N01", "ST-N02", "ST-N06", "ST-N16"];

/** کلیدِ «سند راهبرد پیش از مذاکره» (settings.crFlags.doc؛ همان cr-api.js:crFlags، بی ایمپورت تا حلقه نسازد) */
export async function docOn(env) {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key='crFlags'").first().catch(() => null);
  return !!(parse(r && r.value, {}) || {}).doc;
}
/** مدلِ سند (تنظیمِ پشتیبانی؛ تصمیم ۴ — پیش‌فرض Opus 5.5) */
export async function docModel(env) {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key='crDocModel'").first().catch(() => null);
  const m = r ? T(parse(r.value, r.value)) : "";
  return modelOk(m) ? m : DOC_MODEL;
}
/**
 * تنظیم‌های پنل برای قیمتِ مؤثر (context_blocks.md، <settings>) — settings.crPanel روی پیش‌فرض‌های بسته. panel_rate نرخِ ماهانهٔ
 * پذیرفتنی برای پرداختِ دیرتر است (R12)؛ say_panel_rate نه یعنی کارشناس هوشمند از نیمهٔ آن شروع می‌کند و بالاتر نمی‌رود (تصمیم ۱۲).
 */
export const PANEL_DEFAULT = { vat_rate: C.VAT_RATE, vat_creditable: false, no_invoice_premium: C.NO_INVOICE_RISK_PREMIUM, panel_rate: null, fx_growth: null,
  basis: C.DISCOUNT_BASIS, say_panel_rate: false, follow_up_hours: 48 };
export async function panelSettings(env) {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key='crPanel'").first().catch(() => null);
  const v = parse(r && r.value, {}) || {};
  const out = { ...PANEL_DEFAULT };
  for (const k of ["vat_rate", "no_invoice_premium", "panel_rate", "fx_growth", "follow_up_hours"]) if (v[k] != null && Number.isFinite(Number(v[k]))) out[k] = Number(v[k]);
  if (typeof v.vat_creditable === "boolean") out.vat_creditable = v.vat_creditable;
  if (typeof v.say_panel_rate === "boolean") out.say_panel_rate = v.say_panel_rate;
  if (["panel", "fx", "max"].includes(v.basis)) out.basis = v.basis;
  return out;
}
export async function savePanel(env, b) {
  const cur = await panelSettings(env);
  const rate = (k, lo, hi) => { if (b[k] === undefined) return; if (b[k] === null || b[k] === "") { cur[k] = null; return; } const n = num(b[k]); if (n == null || n < lo || n > hi) throw new HttpError(`«${k}» باید عددی از ${lo} تا ${hi} باشد.`, 422); cur[k] = n; };
  rate("vat_rate", 0, 0.5); rate("no_invoice_premium", 0, 0.5); rate("panel_rate", 0, 0.2); rate("fx_growth", 0, 0.2); rate("follow_up_hours", 1, 240);
  if (b.vat_creditable !== undefined) cur.vat_creditable = !!b.vat_creditable;
  if (b.say_panel_rate !== undefined) cur.say_panel_rate = !!b.say_panel_rate;
  if (b.basis !== undefined) { if (!["panel", "fx", "max"].includes(b.basis)) throw new HttpError("مبنای تنزیل باید panel، fx یا max باشد.", 422); cur.basis = b.basis; }
  if (b.model !== undefined) {
    if (!modelOk(b.model)) throw new HttpError("این مدل در فهرستِ مدل‌ها نیست.", 422);
    await env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('crDocModel',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").bind(JSON.stringify(b.model), now()).run();
  }
  await env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('crPanel',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").bind(JSON.stringify(cur), now()).run();
  return { panel: cur, model: await docModel(env), models: Object.fromEntries(Object.entries(AGENT_MODELS).map(([k, v]) => [k, v.fa])) };
}

/* ------------------------------------------------------------------ */
/* ورودیِ P1                                                            */
/* ------------------------------------------------------------------ */
/** گونهٔ سند: کدِ قلمی که کلاسِ بازار را عوض می‌کند سندِ خودش را دارد */
const variantOf = (code) => (code && code.ms ? `ms:${code.ms}` : "");

/**
 * گزینه‌های معاوضه با قیمتِ مؤثر — نسبت به «نقد، با صورتحساب رسمی، مقدارِ کامل» با قیمتِ اسمیِ یک میلیون (مقیاس‌ناپذیر):
 * پرداختِ دیرتر با افزایشِ نیمِ نرخِ پنل یا کاملِ آن، و پیش‌پرداخت با تخفیف. better = قیمتِ مؤثر کمتر.
 */
export function packageOptions(settings) {
  const base = { price: 1e6, qty: 1, has_official_invoice: true, vat_included: false, pay_months: 0, prepay_share: 0 };
  const e0 = effectivePrice(base, {}, settings).effective_unit_price;
  const r = settings.panel_rate || 0;
  const out = [];
  const add = (id, fa, offer) => {
    const e = effectivePrice({ ...base, ...offer }, {}, settings).effective_unit_price;
    out.push({ option_id: id, fa, effect_pct: pyRound(((e - e0) / e0) * 100, 2), better: e < e0 - 1e-6 });
  };
  for (const m of [1, 2, 3]) {
    add(`pay${m}_half`, `پرداخت ${m} ماهه با افزایشِ قیمت تا نیمِ نرخِ ماهانهٔ پنل`, { price: 1e6 * (1 + (r / 2) * m), pay_months: m });
    add(`pay${m}_full`, `پرداخت ${m} ماهه با افزایشِ قیمت به اندازهٔ نرخِ ماهانهٔ پنل`, { price: 1e6 * (1 + r * m), pay_months: m });
  }
  add("prepay30_d2", "پیش‌پرداختِ ۳۰٪ با ۲٪ تخفیف", { price: 0.98e6, prepay_share: 0.3 });
  /* خریدِ بی صورتحسابِ رسمی گزینهٔ معاوضه نیست — فقط چون مالیات نمی‌دهد «ارزان‌تر» می‌نماید */
  return { panel_rate: r || null, base: "نقد، با صورتحساب رسمی", options: out };
}

/** عددهای مذاکره با قیمت مرجعِ ۱ (درصدی) — برای قاعده‌های سندِ ثابت */
function negRules(profile) {
  const p = planNegotiation(profile, 1, [], false);
  return { target_vs_ref: pyRound(p.target - 1, 4), rv_tol: pyRound(p.reservation - 1, 4), concession_c: p.c, rounds: p.rounds,
    urgent_rv_extra: C.URGENT_RV_EXTRA, offers_by_round_vs_ref: Array.from({ length: p.rounds }, (_, i) => pyRound(nextOffer(p, i + 1) - 1, 4)) };
}

async function sha(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/**
 * ورودیِ P1 برای یک نوع قلم (و گونه‌اش): {head, variant, input, sha}. input همان بلوک‌های context_blocks.md به ترتیبِ ثابت —
 * item_profile (رکوردِ تحقیق بی indicators + تغییرهای کارشناس)، request (سندِ ثابت: فقط نوع قلم)، settings، engine، states، kb.
 */
export async function docInput(env, head, { itemCode = null } = {}) {
  const rp = await recipientPlan(env, head, { itemCode });
  const hp = await headPolicy(env, head, { itemCode });
  const row = await headRow(env, rp.head);
  const { indicators, ...rec } = row.rec || {};
  const panel = await panelSettings(env);
  const settings = settingsFor(hp.profile, panel);
  const variant = variantOf(hp.code);
  const ms = hp.profile.ms;
  const watch = [...new Set([...(((rec.negotiation_defaults || {}).watch_states) || []), ...ALWAYS_STATES])].filter((s) => STATES[s]);
  const cards = [...new Set([...(rec.kb_cards || []), ms])].filter((k) => KB[k]);
  const rec2 = (l) => l.map((x) => ({ id: x.id, name: x.name, incumbent: x.incumbent, hub: x.hub, role: x.role, verification: x.verification, trusted: x.trusted }));
  const input = {
    item_profile: { ...rec, ...(variant ? { item_exception: { ms: hp.code.ms, labels_add: hp.code.la || null, why: hp.code.why || null } } : {}),
      expert_changes: Object.fromEntries(Object.entries(hp.changes || {}).map(([k, v]) => [k, { value: v.value, by: v.by_name, reason: v.reason }])) },
    request: { item_head: rp.head, item_code: variant ? itemCode : null, scope: "سندِ ثابتِ نوع قلم؛ عددهای هر درخواست را کد جدا حساب می‌کند" },
    settings,
    engine: { rfq_policy: rp.policy, recipients: { wave1: rec2(rp.plan.wave1), reserve: rec2(rp.plan.reserve), relaxations: rp.plan.relaxations || [], notes: rp.plan.notes || [] },
      reference_price: null, dependence_policy: dependenceParams(hp.profile), negotiation: negRules(hp.profile), package_options: packageOptions(settings) },
    states: Object.fromEntries(watch.map((s) => [s, STATES[s]])),
    kb: cards,
  };
  return { head: rp.head, variant, input, sha: (await sha(`${KB_VERSION}|${JSON.stringify(input)}`)).slice(0, 32), hp, rp };
}

/* ------------------------------------------------------------------ */
/* فراخوانِ مدل                                                         */
/* ------------------------------------------------------------------ */
const S = { type: "string" }, SA = { type: "array", items: { type: "string" } };
const obj = (props) => ({ type: "object", properties: props, required: Object.keys(props), additionalProperties: false });
/** بخش‌هایی که مدل می‌نویسد (عددها، حالت و گیرندگان را کد روی خروجی می‌گذارد) — زیرمجموعهٔ schemas/plan.schema.json */
export const DOC_API_SCHEMA = obj({
  summary_fa: S,
  market_view: obj({ key_facts: SA }),
  rfq: obj({ distribution_explained: SA, anti_leak_measures: SA, timing: S, quote_fields: SA, spec_clarification: SA, why: SA }),
  negotiation: obj({ anchor_rule: S, reservation_rule: S, parallel_with: { type: "integer" }, packages: { type: "array", items: obj({ option_id: S, description_fa: S }) },
    hard_constraints: SA }),
  anticipated_states: { type: "array", items: obj({ state_id: S, move: { type: "string", enum: MOVE_IDS }, prepared_reply_fa: S }) },
  runtime_states: SA,
  risks: { type: "array", items: obj({ risk: S, control: S }) },
  expert_questions: SA,
  needs_approval: SA,
  sources: SA,
  notes_for_buyer: S,
});
const ADAPT = `## سازگاری با این سامانه (همین فراخوان)
- این «سندِ ثابتِ نوع قلم» است، نه یک درخواستِ مشخص: <request> فقط نوع قلم را دارد. عددهای هر درخواست (هدف، حد، پیشنهادِ هر دور) را کد از قیمت مرجعِ همان کد حساب می‌کند؛ تو قاعده‌شان را با درصدهای <engine>.negotiation بنویس و هیچ عددِ ریالی ننویس. بندهای «وضعیت‌های زمان اجرا» (فوریت، مقدارِ زیاد و …) را هم کد در زمانِ درخواست می‌افزاید؛ runtime_states را فقط وقتی پر کن که همیشه برای این نوع قلم صادق است.
- حالت، شمار، موج‌ها، گیرندگانِ موج اول و ذخیره، و افشا را کد از <engine> روی خروجی می‌نویسد؛ تو فقط «چرا» و توضیح‌ها را بنویس و از همان‌ها پیروی کن.
- بسته‌های معاوضه را فقط از <engine>.package_options.options با option_id برگزین — دو یا سه تا از آن‌ها که better=true دارند — و توضیحِ فارسیِ کوتاه بنویس. ابزاری در کار نیست.
- prepared_reply_fa به تأمین‌کننده می‌رسد: بی حد، هدف، قیمت مرجع، بودجه، فوریت، نامِ دیگران و شمارِ پیشنهادها. هوش مصنوعی بودن را انکار نکن و واقعیت نساز (تصمیم ۶).`;

export function docPrompt(env, input, company) {
  const system = `${P0.replace(/\{\{company_name\}\}/g, company || "تونل سد آریانا")}\n\n${P1}\n\n${ADAPT}`;
  const kb = input.kb.map((k) => `### ${k} — ${KB[k].title || ""}\n${KB[k].body}`).join("\n\n");
  const J = (o) => JSON.stringify(o);
  const user = [`<item_profile>${J(input.item_profile)}</item_profile>`, `<request>${J(input.request)}</request>`, `<settings>${J(input.settings)}</settings>`,
    `<engine>${J(input.engine)}</engine>`, `<states>${J(input.states)}</states>`, `<kb>\n${kb}\n</kb>`].join("\n");
  return { system, user };
}

/** خروجیِ مدل + عددهای موتور ← سند (همان شکلِ plan.schema.json)؛ پاسخ‌های آماده با اعتبارسنج سنجیده می‌شوند */
export function normalizeDoc(out, input) {
  const e = input.engine, pol = e.rfq_policy, o = out || {};
  const opts = new Map((e.package_options.options || []).map((x) => [x.option_id, x]));
  const prof = input.item_profile, cl = prof.classification || {};
  const ms = (prof.item_exception && prof.item_exception.ms) || cl.ms || null;
  const neg = o.negotiation || {};
  const doc = {
    item_head: input.request.item_head, item_code: input.request.item_code || null,
    summary_fa: clip(o.summary_fa, 1500),
    market_view: { ms, labels: cl.labels || [], confidence_band: (prof.confidence || {}).band || null, key_facts: (((o.market_view || {}).key_facts) || []).slice(0, 8).map((x) => clip(x, 300)) },
    rfq: { ...(o.rfq || {}), mode: pol.mode, competition_mode: pol.competition_mode, n_wave1: pol.n_wave1, n_max: pol.n_max, waves: pol.waves,
      recipients_wave1: e.recipients.wave1.map((x) => x.name || x.id), reserve: e.recipients.reserve.map((x) => x.name || x.id), disclosure: pol.disclosure,
      quote_fields: ((o.rfq || {}).quote_fields || []).length ? o.rfq.quote_fields : pol.quote_must_include || [] },
    negotiation: { anchor_rule: T(neg.anchor_rule), reservation_rule: T(neg.reservation_rule), internal_reservation: null,
      concession_c: e.negotiation.concession_c, rounds: e.negotiation.rounds, parallel_with: Math.min(3, Math.max(1, int(neg.parallel_with) || 1)),
      packages: (neg.packages || []).filter((p) => opts.has(p.option_id) && opts.get(p.option_id).better).slice(0, 3)
        .map((p) => ({ option_id: p.option_id, description_fa: clip(p.description_fa, 300) || opts.get(p.option_id).fa, effective_price_better: true, effect_pct: opts.get(p.option_id).effect_pct })),
      hard_constraints: (neg.hard_constraints || []).map((x) => clip(x, 300)), dependence: e.dependence_policy, rules_pct: e.negotiation },
    anticipated_states: (o.anticipated_states || []).filter((s) => STATES[s.state_id] && MOVE_IDS.includes(s.move)).map((s) => {
      const reply = clip(s.prepared_reply_fa, 700);
      const v = validateTurn({ message_fa: reply, move: s.move }, {}).violations;
      return { state_id: s.state_id, name: STATES[s.state_id].name, move: s.move, prepared_reply_fa: reply, ...(v.length ? { blocked: v } : {}) };
    }),
    runtime_states: (o.runtime_states || []).filter((s) => STATES[s]),
    risks: (o.risks || []).slice(0, 5).map((r) => ({ risk: clip(r.risk, 300), control: clip(r.control, 300) })),
    expert_questions: (o.expert_questions || []).filter((q) => /^Q\d{2}b?$/.test(q)),
    needs_approval: (o.needs_approval || []).map((x) => clip(x, 300)),
    sources: (o.sources || []).map((x) => clip(x, 40)).slice(0, 30),
    notes_for_buyer: T(o.notes_for_buyer) || null,
  };
  return doc;
}

/* ------------------------------------------------------------------ */
/* نسخه‌ها و صف                                                          */
/* ------------------------------------------------------------------ */
const docOut = (r) => (r ? { id: r.id, head: r.head, variant: r.variant, version: r.version, state: r.state, state_fa: DOC_STATE_FA[r.state] || r.state, source: r.source,
  model: r.model, doc: parse(r.doc_json, null), final: parse(r.final_json, null), review: parse(r.review_json, null), error: r.error || null,
  created_at: r.created_at, built_at: r.built_at, reviewed_at: r.reviewed_at, reviewed_by: r.reviewed_by } : null);
/** آخرین نسخهٔ یک نوع قلم (و گونه) — تأییدشده‌ها مقدم بر نسخه‌های ردشده‌ای نیستند: همان تازه‌ترین */
export async function latestDoc(env, head, variant = "") {
  const r = await env.DB.prepare("SELECT * FROM cr_docs WHERE head=? AND variant=? AND state<>'superseded' ORDER BY version DESC LIMIT 1").bind(head, variant).first();
  return r;
}
async function approvedDoc(env, head, variant = "") {
  return env.DB.prepare("SELECT * FROM cr_docs WHERE head=? AND variant=? AND state='approved' ORDER BY version DESC LIMIT 1").bind(head, variant).first();
}
/** صف: نسخهٔ تازه اگر نیست یا ورودی عوض شده — نسخهٔ قبلی می‌ماند (تصمیم ۳) */
export async function enqueueDoc(env, head, { itemCode = null, prio = 1, by = null, force = false } = {}) {
  const di = await docInput(env, head, { itemCode });
  const last = await env.DB.prepare("SELECT * FROM cr_docs WHERE head=? AND variant=? ORDER BY version DESC LIMIT 1").bind(di.head, di.variant).first();
  if (last && !force && (["queued", "building"].includes(last.state) || (last.input_sha === di.sha && last.state !== "failed"))) return { row: last, queued: false };
  const v = (last ? last.version : 0) + 1, t = now();
  const r = await env.DB.prepare("INSERT INTO cr_docs (head,variant,version,state,source,input_sha,prio,item_code,by,created_at) VALUES (?,?,?,'queued','model',?,?,?,?,?)")
    .bind(di.head, di.variant, v, di.sha, prio, di.variant ? itemCode : null, by, t).run();
  return { row: await env.DB.prepare("SELECT * FROM cr_docs WHERE id=?").bind(r.meta.last_row_id).first(), queued: true };
}

/** ساختِ یک نسخهٔ صف‌شده (Cron): ادعا ← مدل ← سند یا خطا */
export async function buildDoc(env, row, { company } = {}) {
  const t = now();
  const claim = await env.DB.prepare("UPDATE cr_docs SET state='building', built_at=? WHERE id=? AND state='queued'").bind(t, row.id).run();
  if (!claim.meta.changes) return null;
  try {
    const di = await docInput(env, row.head, { itemCode: row.item_code || null });
    const model = await docModel(env);
    const { system, user } = docPrompt(env, di.input, company);
    const res = await callModel(env, { system, user, schema: DOC_API_SCHEMA, model, effort: "high", maxTokens: 16000, timeoutMs: 600000 });
    const doc = normalizeDoc(res.out, di.input);
    const cost = estimateCost(res.model, res.usage);
    /* فقط اگر هنوز «در حالِ ساخت» است — کارشناس شاید در همین فاصله با سازندهٔ پارامتری تأییدش کرده باشد */
    await env.DB.batch([
      env.DB.prepare("UPDATE cr_docs SET state='draft', model=?, input_sha=?, doc_json=?, cost_usd=?, error=NULL, built_at=? WHERE id=? AND state='building'")
        .bind(res.model, di.sha, JSON.stringify(doc), cost, now(), row.id),
      env.DB.prepare("INSERT INTO ai_calls (purpose,model,in_tok,out_tok,cost_usd,ms,status,at) VALUES ('doc',?,?,?,?,?,'ok',?)")
        .bind(res.model, (res.usage || {}).input_tokens || 0, (res.usage || {}).output_tokens || 0, cost, now() - t, now()),
    ]);
    return { id: row.id, state: "draft", cost };
  } catch (e) {
    const msg = clip((e && e.message) || e, 400);
    await env.DB.prepare("UPDATE cr_docs SET state='failed', error=?, built_at=? WHERE id=? AND state='building'").bind(msg, now(), row.id).run().catch(() => {});
    if (!(e instanceof AiError) && !(e instanceof HttpError)) console.error("cr doc build", row.head, msg);
    return { id: row.id, state: "failed", error: msg };
  }
}

/**
 * Cronِ هر دقیقه (کلیدِ doc): ساختِ گیرکرده ← شکست؛ بعد یک نسخهٔ صف (درخواست‌ها اول)، وگرنه نوع قلمِ بعدیِ ۱۳۸ پرهزینه که هنوز
 * سندی ندارد. یکی در هر دقیقه — هزینه و بارِ مدل آرام.
 */
export async function crDocTick(env, { company } = {}) {
  if (!(await docOn(env))) return null;
  await env.DB.prepare("UPDATE cr_docs SET state='failed', error='ساخت بیش از ۱۵ دقیقه طول کشید' WHERE state='building' AND built_at<?").bind(now() - 15 * 60000).run().catch(() => {});
  if (await env.DB.prepare("SELECT 1 AS x FROM cr_docs WHERE state='building' LIMIT 1").first()) return { busy: true };
  let row = await env.DB.prepare("SELECT * FROM cr_docs WHERE state='queued' ORDER BY prio DESC, id LIMIT 1").first();
  if (!row) {
    const head = await nextPregen(env);
    if (!head) return { idle: true };
    row = (await enqueueDoc(env, head, { prio: 0, by: "پیش‌ساخت" })).row;
    if (!row || row.state !== "queued") return { skipped: head };
  }
  return buildDoc(env, row, { company });
}
/**
 * نوع قلمِ بعدیِ پیش‌ساخت با نشانگری در cr_cache: فهرستِ ۱۳۸ پرهزینه یک بار خوانده می‌شود (cr_heads نمایهٔ spend_rank ندارد و
 * خواندنِ همهٔ ۲٬۴۵۷ ردیف در هر دقیقه روزی سه میلیون و نیم خواندن بود)، بعد هر Cron فقط نوع قلم‌های پیشِ رو را با نمایهٔ cr_docs.
 */
async function nextPregen(env) {
  const c = await env.DB.prepare("SELECT v FROM cr_cache WHERE k='docPregen'").first().catch(() => null);
  let st = c ? parse(c.v, null) : null;
  if (st && st.done) return null;
  if (!st || !Array.isArray(st.heads)) {
    const rows = (await env.DB.prepare("SELECT head FROM cr_heads WHERE spend_rank<=? ORDER BY spend_rank").bind(PREGEN_RANK).all()).results || [];
    st = { heads: rows.map((r) => r.head), i: 0 };
  }
  let head = null;
  while (st.i < st.heads.length && st.i < 1e4) {
    const h = st.heads[st.i];
    if (!(await env.DB.prepare("SELECT 1 AS x FROM cr_docs WHERE head=? AND variant='' LIMIT 1").bind(h).first())) { head = h; break; }
    st.i++;
  }
  if (!head) st.done = true; else st.i++;
  await env.DB.prepare("INSERT INTO cr_cache (k,v,at) VALUES ('docPregen',?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at").bind(JSON.stringify(st), now()).run().catch(() => {});
  return head;
}

/* ------------------------------------------------------------------ */
/* عددهای هر درخواست                                                    */
/* ------------------------------------------------------------------ */
/**
 * هدف، حد، لنگر و پیشنهادِ هر دور برای یک قلمِ درخواست — قیمت مرجعِ کد (cr_prices) و برنامهٔ موتور (planNegotiation). درونی:
 * هرگز به تأمین‌کننده نمی‌رسد. بی قیمت مرجع: status NO_ANCHOR (ST-P11).
 */
export async function docNumbers(env, head, itemCode, { urgent = false } = {}) {
  const hp = await headPolicy(env, head, { itemCode });
  if (!hp) return null;
  let ref = null, refRow = null;
  if (T(itemCode)) {
    const r = await env.DB.prepare("SELECT data FROM cr_prices WHERE shard=?").bind(crShard(T(itemCode))).first().catch(() => null);
    const rows = r ? (parse(r.data, {})[T(itemCode)] || []) : [];
    refRow = rows[0] || null;
    if (refRow) ref = referencePrice({ median_real_24m: refRow.m24, median_real_all: refRow.m });
  }
  const p = planNegotiation(hp.profile, ref, [], urgent);
  if (p.status !== "OK") return { status: p.status, action: p.action, ref: null };
  return { status: "OK", ref: Math.round(ref), unit: refRow ? refRow.u : null, quality: refRow ? refRow.q : null, target: Math.round(p.target), reservation: Math.round(p.reservation),
    anchor: Math.round(p.anchor), c: p.c, rounds: p.rounds, offers: Array.from({ length: p.rounds }, (_, i) => Math.round(nextOffer(p, i + 1))), urgent };
}

/* ------------------------------------------------------------------ */
/* بازبینی، ویرایش و سازندهٔ پارامتری                                     */
/* ------------------------------------------------------------------ */
const PACE = { patient: 0.3, balanced: 0.5, uniform: 1.0 };
export const PACE_FA = { patient: "شکیبا", balanced: "متعادل", uniform: "یکنواخت" };
export const OTHERS_FA = { fact: "واقعیتِ بی‌نامِ ثبت‌شده", better_only: "فقط «پیشنهادِ بهتری داریم»", none: "هیچ" };
const WEIGHT_KEYS = ["price", "payment", "delivery", "condition", "quality"];
export const WEIGHT_FA = { price: "قیمت", payment: "پرداخت", delivery: "تحویل", condition: "شرطِ تحویل و پرداخت", quality: "کیفیت" };

/** سازندهٔ پارامتری (همان «پارامترهای مذاکره»ٔ بسته، بی تایپ): سندی از پارامترهای کارشناس، با همان بخش‌های موتور */
export function builderDoc(input, b) {
  const w = b.weights || {};
  const ws = WEIGHT_KEYS.map((k) => num(w[k]));
  if (ws.some((x) => x == null || x < 0) || Math.round(ws.reduce((s, x) => s + x, 0)) !== 100) throw new HttpError("وزنِ پنج بعد باید عددهای نامنفی با جمعِ ۱۰۰ باشد.", 422, { field: "weights" });
  const tv = num(b.target_vs_ref), rv = num(b.rv_tol), rounds = int(b.rounds), payMax = int(b.max_pay_months), rate = b.panel_rate == null || b.panel_rate === "" ? null : num(b.panel_rate);
  if (tv == null || tv < -0.3 || tv > 0.1) throw new HttpError("هدف نسبت به قیمت مرجع باید از ۳۰٪ کمتر تا ۱۰٪ بیشتر باشد (مثلاً -0.05).", 422, { field: "target_vs_ref" });
  if (rv == null || rv < 0 || rv > 0.3) throw new HttpError("تحملِ حد باید از ۰ تا ۳۰٪ باشد (مثلاً 0.03).", 422, { field: "rv_tol" });
  if (!rounds || rounds < 1 || rounds > 6) throw new HttpError("شمارِ دور از ۱ تا ۶.", 422, { field: "rounds" });
  if (payMax == null || payMax < 0 || payMax > 12) throw new HttpError("حداکثر ماهِ تعویقِ پرداخت از ۰ تا ۱۲.", 422, { field: "max_pay_months" });
  if (rate != null && (rate < 0 || rate > 0.2)) throw new HttpError("نرخِ ماهانهٔ پنل از ۰ تا ۰٫۲.", 422, { field: "panel_rate" });
  if (!PACE[b.pace]) throw new HttpError("آهنگِ امتیازدهی: شکیبا، متعادل یا یکنواخت.", 422, { field: "pace" });
  if (!OTHERS_FA[b.others]) throw new HttpError("استفاده از پیشنهادِ دیگران را انتخاب کنید.", 422, { field: "others" });
  const neg = (input.item_profile.negotiation_defaults || {});
  const tradeable = (Array.isArray(b.tradeables) ? b.tradeables : []).filter((x) => (neg.tradeable_issues || []).includes(x));
  const hard = (Array.isArray(b.hard_constraints) ? b.hard_constraints : []).map((x) => clip(x, 200)).filter(Boolean).slice(0, 10);
  const pol = input.engine.rfq_policy, e = input.engine;
  const pct = (x) => `${x >= 0 ? "+" : "−"}${Math.abs(Math.round(x * 1000) / 10)}٪`;
  const doc = normalizeDoc({
    summary_fa: [`سندِ پارامتریِ کارشناس برای «${input.request.item_head}».`, `هدف ${pct(tv)} نسبت به قیمت مرجع، حد تا ${pct(rv)}؛ ${rounds} دور با آهنگِ ${PACE_FA[b.pace]}.`,
      `وزن‌ها: ${WEIGHT_KEYS.map((k, i) => `${WEIGHT_FA[k]} ${ws[i]}`).join("، ")}.`, `پیشنهادِ دیگران: ${OTHERS_FA[b.others]}؛ تقسیمِ سفارش ${b.split_ok ? "مجاز" : "نه"}.`,
      T(b.note) ? `یادداشت: ${clip(b.note, 300)}` : ""].filter(Boolean).join("\n"),
    market_view: { key_facts: [] },
    rfq: { distribution_explained: [], anti_leak_measures: [], timing: pol.timing || "", quote_fields: pol.quote_must_include || [], spec_clarification: pol.spec_clarification || [], why: pol.why || [] },
    negotiation: { anchor_rule: `هدف = قیمت مرجع × (۱ ${pct(tv)})، و نه بالاتر از بهترین پیشنهادِ واقعی`, reservation_rule: `حد = کمینهٔ قیمت مرجع × (۱ ${pct(rv)}) و بهترین جایگزینِ واقعی`,
      parallel_with: 1, packages: [], hard_constraints: hard },
    anticipated_states: [], runtime_states: [], risks: [], expert_questions: [], needs_approval: [], sources: ["کارشناس"], notes_for_buyer: T(b.note) || null,
  }, input);
  doc.negotiation.concession_c = PACE[b.pace];
  doc.negotiation.rounds = rounds;
  doc.negotiation.rules_pct = { ...e.negotiation, target_vs_ref: tv, rv_tol: rv, concession_c: PACE[b.pace], rounds };
  doc.builder = { weights: Object.fromEntries(WEIGHT_KEYS.map((k, i) => [k, ws[i]])), target_vs_ref: tv, rv_tol: rv, rounds, max_pay_months: payMax, panel_rate: rate,
    pace: b.pace, others: b.others, tradeables: tradeable, hard_constraints: hard, split_ok: !!b.split_ok, note: clip(b.note, 600) || null };
  return doc;
}

/** ویرایشِ کارشناس روی بخش‌های متنی — شکل و عددهای موتور سرِ جایشان می‌مانند؛ پاسخ‌های آماده دوباره سنجیده می‌شوند */
function editDoc(doc, f) {
  const d = JSON.parse(JSON.stringify(doc));
  if (f.summary_fa !== undefined) d.summary_fa = clip(f.summary_fa, 1500);
  if (f.anchor_rule !== undefined) d.negotiation.anchor_rule = clip(f.anchor_rule, 600);
  if (f.reservation_rule !== undefined) d.negotiation.reservation_rule = clip(f.reservation_rule, 600);
  if (Array.isArray(f.hard_constraints)) d.negotiation.hard_constraints = f.hard_constraints.map((x) => clip(x, 300)).filter(Boolean);
  if (Array.isArray(f.risks)) d.risks = f.risks.slice(0, 5).map((r) => ({ risk: clip(r.risk, 300), control: clip(r.control, 300) })).filter((r) => r.risk);
  if (Array.isArray(f.replies)) {
    const by = new Map(f.replies.map((r) => [r.state_id, r.prepared_reply_fa]));
    d.anticipated_states = d.anticipated_states.map((s) => {
      if (!by.has(s.state_id)) return s;
      const reply = clip(by.get(s.state_id), 700), v = validateTurn({ message_fa: reply, move: s.move }, {}).violations;
      const { blocked, ...rest } = s;
      return { ...rest, prepared_reply_fa: reply, ...(v.length ? { blocked: v } : {}) };
    });
  }
  if (f.notes_for_buyer !== undefined) d.notes_for_buyer = clip(f.notes_for_buyer, 1000) || null;
  return d;
}

/**
 * بازبینیِ کارشناس — {score ۱..۵, note, boxes (جعبه‌های راهبرد), action: approve|edit|builder, edit: {…}, params: {…}}.
 * امتیازِ ۱ تا ۳ توضیح و دست‌کم یک جعبه می‌خواهد؛ ۴ و ۵ هیچ. هر سه کار نسخه را «تأییدشده» می‌کنند: approve همان سند، edit
 * سندِ ویرایش‌شده (نسخهٔ اولِ مدل در doc_json می‌ماند)، builder سندِ پارامتری. بایگانیِ بازخورد: ai_feedback با kind='doc'.
 */
export async function reviewDoc(env, who, id, b = {}) {
  const r = await env.DB.prepare("SELECT * FROM cr_docs WHERE id=?").bind(int(id) || 0).first();
  if (!r) throw new HttpError("این سند پیدا نشد.", 404);
  const action = T(b.action);
  if (!["approve", "edit", "builder"].includes(action)) throw new HttpError("کار نامعتبر: تأیید، ویرایش یا سازندهٔ پارامتری.", 422);
  if (action !== "builder" && !["draft", "approved"].includes(r.state)) throw new HttpError(`این سند هنوز آماده نیست (${DOC_STATE_FA[r.state] || r.state}).`, 409);
  const score = int(b.score);
  const note = clip(b.note, 800);
  let boxes = [];
  /* امتیاز به سندِ مدل؛ سازندهٔ پارامتری بی سندِ مدل (هنوز ساخته نشده یا نشد) امتیاز نمی‌خواهد */
  if (r.doc_json || action !== "builder") {
    if (!score || score < 1 || score > 5) throw new HttpError("امتیازِ سند از ۱ تا ۵ است.", 422, { field: "score" });
    boxes = boxesIn(b.boxes, { strategy: true, need: score <= 3, what: "برای امتیازِ ۱ تا ۳" });
    if (score <= 3 && note.length < 3) throw new HttpError("برای امتیازِ ۱ تا ۳ بنویسید چه چیزِ این سند درست نبود.", 422, { need_note: true });
  }
  let final;
  const source = action === "builder" ? "builder" : "model";
  if (action === "approve") {
    final = parse(r.doc_json, null);
    if (!final) throw new HttpError("این نسخه متنی ندارد؛ با سازندهٔ پارامتری بسازید.", 409);
  } else if (action === "edit") {
    const base = parse(r.final_json, null) || parse(r.doc_json, null);
    if (!base) throw new HttpError("این نسخه متنی ندارد؛ با سازندهٔ پارامتری بسازید.", 409);
    final = editDoc(base, b.edit || {});
  } else {
    const di = await docInput(env, r.head, { itemCode: r.item_code || null });
    final = builderDoc(di.input, b.params || {});
  }
  const t = now(), by = who.name || who.kind || "کارشناس";
  const review = { score, note: note || null, boxes, action, by, at: t };
  await env.DB.batch([
    env.DB.prepare("UPDATE cr_docs SET state='approved', final_json=?, review_json=?, source=?, reviewed_at=?, reviewed_by=? WHERE id=?")
      .bind(JSON.stringify(final), JSON.stringify(review), source, t, by, r.id),
    env.DB.prepare("UPDATE cr_docs SET state='superseded' WHERE head=? AND variant=? AND state='approved' AND id<>?").bind(r.head, r.variant, r.id),
    env.DB.prepare("INSERT INTO events (at,actor,kind,payload_json) VALUES (?,?,?,?)").bind(t, who.kind ? `${who.kind}:${who.id || ""}` : "expert", "cr_doc_review",
      JSON.stringify({ doc: r.id, head: r.head, version: r.version, action, score, boxes })),
  ]);
  /* بایگانیِ بازخورد به P1 (شمارشِ جعبه‌های راهبرد در «⭐ ارزیابی ربات») */
  if (score) {
    await env.DB.prepare(`INSERT INTO ai_feedback (kind,ref,at,expert_id,expert_name,stars,note,ai_text,human_text,outcome,model,context_json,boxes) VALUES ('doc',?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(kind, ref) DO UPDATE SET at=excluded.at, stars=excluded.stars, note=excluded.note, human_text=excluded.human_text, outcome=excluded.outcome, boxes=excluded.boxes`)
      .bind(r.id, t, who.kind === "expert" ? who.id || null : null, by, score, note || null, clip(r.doc_json, 20000) || null, action === "approve" ? null : clip(JSON.stringify(final), 20000),
        action === "approve" ? "ok" : "no", r.model || null, JSON.stringify({ head: r.head, variant: r.variant, version: r.version, action }), boxes.length ? JSON.stringify(boxes) : null).run()
      .catch((e) => console.error("doc feedback", e && e.message));
  }
  return docOut(await env.DB.prepare("SELECT * FROM cr_docs WHERE id=?").bind(r.id).first());
}

/* ------------------------------------------------------------------ */
/* برای صفحه، «🚀 شروع» و زمینهٔ مذاکره                                   */
/* ------------------------------------------------------------------ */
/** وضعیتِ سندِ یک قلم برای کادرِ «📘 سند راهبرد»: آخرین نسخه، تأییدشده، عددهای همین قلم و فهرست‌های سازنده */
export async function docView(env, head, { itemCode = null, urgent = false, enqueue = false, by = null } = {}) {
  const hp = await headPolicy(env, head, { itemCode });
  if (!hp) return { available: false };
  const variant = variantOf(hp.code);
  if (enqueue && !(await latestDoc(env, hp.head, variant))) await enqueueDoc(env, hp.head, { itemCode, prio: 1, by }).catch((e) => console.error("doc enqueue", e && e.message));
  const [last, ok, row] = await Promise.all([latestDoc(env, hp.head, variant), approvedDoc(env, hp.head, variant), headRow(env, hp.head)]);
  const nd = (row && row.rec && row.rec.negotiation_defaults) || {};
  return { available: true, head: hp.head, variant, latest: docOut(last), approved: docOut(ok), numbers: await docNumbers(env, hp.head, itemCode, { urgent }).catch(() => null),
    builder: { pace: PACE_FA, others: OTHERS_FA, weights: WEIGHT_FA, boxes: STRAT_BOXES, tradeable_issues: nd.tradeable_issues || [],
      defaults: { ...negRules(hp.profile), weights: Object.fromEntries(Object.entries(nd.weights || {}).map(([k, v]) => [k, Math.round(v * 100)])), max_pay_months: 3, pace: "balanced",
        others: "better_only", hard_constraints: nd.hard_constraints || [] } },
    states: DOC_STATE_FA, model: await docModel(env) };
}

/** «🚀 شروع» با کلیدِ doc: سندِ تأییدشده برای نوع قلمِ این قلم لازم است (نوع قلمِ بیرون از دادهٔ تحقیق آزاد است) */
export async function docGate(env, head, itemCode) {
  if (!(await docOn(env)) || !T(head)) return { ok: true };
  const hp = await headPolicy(env, head, { itemCode }).catch(() => null);
  if (!hp) return { ok: true };
  const variant = variantOf(hp.code);
  if (await approvedDoc(env, hp.head, variant)) return { ok: true };
  const last = await latestDoc(env, hp.head, variant);
  if (!last) await enqueueDoc(env, hp.head, { itemCode, prio: 1, by: "شروع" }).catch(() => null);
  const st = last ? last.state : "queued";
  return { ok: false, state: st, head: hp.head,
    msg: st === "draft" ? `سندِ راهبردِ «${hp.head}» آماده است؛ اول در «📘 سند راهبرد» بازبینی و تأییدش کنید، بعد «🚀 شروع».`
      : st === "failed" ? `ساختِ سندِ راهبردِ «${hp.head}» نشد؛ در «📘 سند راهبرد» دوباره بسازید یا با سازندهٔ پارامتری بسازید.`
        : `سندِ راهبردِ «${hp.head}» در صفِ ساخت است (یکی دو دقیقه)؛ بعد بازبینی و تأییدش کنید — یا همین حالا با سازندهٔ پارامتری بسازید.` };
}

/**
 * بلوکِ زمینهٔ مذاکره برای اقلامِ یک گفت‌وگو: نسخهٔ نهاییِ تأییدشدهٔ سندِ هر نوع قلم و عددهای درونیِ همان قلم. بی سندِ تأییدشده یا
 * با کلیدِ خاموش، رشتهٔ خالی (رفتارِ امروز).
 */
export async function docBlock(env, items) {
  if (!items || !items.length || !(await docOn(env))) return "";
  const parts = [];
  const seen = new Set();
  for (const it of items.slice(0, 6)) {
    const head = T(it.head);
    if (!head) continue;
    const hp = await headPolicy(env, head, { itemCode: it.code || null }).catch(() => null);
    if (!hp) continue;
    const key = `${hp.head}|${variantOf(hp.code)}`;
    const ok = seen.has(key) ? null : await approvedDoc(env, hp.head, variantOf(hp.code));
    seen.add(key);
    const d = ok ? parse(ok.final_json, null) : null;
    const nums = await docNumbers(env, hp.head, it.code || null).catch(() => null);
    if (!d && !(nums && nums.status === "OK")) continue;
    const lines = [`«${it.title || hp.head}» (نوع قلم: ${hp.head})`];
    if (d) {
      lines.push(`خلاصهٔ راهبرد: ${d.summary_fa}`);
      lines.push(`لنگر: ${d.negotiation.anchor_rule} | حد: ${d.negotiation.reservation_rule} | آهنگ c=${d.negotiation.concession_c}، ${d.negotiation.rounds} دور`);
      if (d.negotiation.packages.length) lines.push(`بسته‌های معاوضه: ${d.negotiation.packages.map((p) => p.description_fa).join(" · ")}`);
      if (d.negotiation.hard_constraints.length) lines.push(`قیدهای سخت (معامله نمی‌شوند): ${d.negotiation.hard_constraints.join(" · ")}`);
      const st = d.anticipated_states.filter((s) => !s.blocked).slice(0, 8);
      if (st.length) lines.push(`وضعیت‌های محتمل: ${st.map((s) => `${s.state_id} ${s.name} → ${s.move}: «${s.prepared_reply_fa}»`).join(" | ")}`);
    }
    if (nums && nums.status === "OK") lines.push(`[درونی — هرگز به تأمین‌کننده نگو] قیمت مرجع ${nums.ref}، هدف ${nums.target}، حد ${nums.reservation}، پیشنهادِ ما در دورهای ۱ تا ${nums.rounds}: ${nums.offers.join("، ")} (قیمتِ مؤثرِ واحد${nums.unit ? `، ${nums.unit}` : ""})`);
    parts.push(lines.join("\n"));
  }
  return parts.length ? `<strategy_doc>\nسندِ راهبردِ تأییدشدهٔ کارشناس برای اقلامِ این گفت‌وگو — از آن پیروی کن؛ قاعدهٔ صداقت و محرمانگی بالاتر از آن است.\n${parts.join("\n\n")}\n</strategy_doc>` : "";
}

/** فهرستِ پشتیبانی: وضعیتِ سندِ هر نوع قلم (آخرین نسخه) برای نوع قلم‌های یک صفحه */
export async function docStates(env, heads) {
  if (!heads || !heads.length) return {};
  const rows = (await env.DB.prepare(`SELECT head, variant, version, state FROM cr_docs WHERE head IN (${heads.map(() => "?").join(",")}) AND state<>'superseded' ORDER BY version`)
    .bind(...heads).all()).results || [];
  const out = {};
  for (const r of rows) if (!r.variant) out[r.head] = { version: r.version, state: r.state, state_fa: DOC_STATE_FA[r.state] };
  return out;
}
/** پیشرفتِ پیش‌ساخت (۱۳۸ نوع قلمِ پرهزینه) و هزینهٔ تا امروز */
export async function docProgress(env) {
  const [a, b, c] = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) AS n FROM cr_heads WHERE spend_rank<=?").bind(PREGEN_RANK),
    env.DB.prepare(`SELECT d.state, COUNT(DISTINCT d.head) AS n FROM cr_docs d JOIN cr_heads h ON h.head=d.head WHERE h.spend_rank<=? AND d.variant='' AND d.state<>'superseded' GROUP BY d.state`).bind(PREGEN_RANK),
    env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(cost_usd),0) AS usd FROM cr_docs WHERE cost_usd IS NOT NULL"),
  ]);
  return { target: ((a.results || [])[0] || {}).n || 0, by_state: Object.fromEntries((b.results || []).map((r) => [r.state, r.n])),
    built: ((c.results || [])[0] || {}).n || 0, cost_usd: ((c.results || [])[0] || {}).usd || 0 };
}
export { docOut, boxesOf };
