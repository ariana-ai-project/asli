/**
 * «🧭 مذاکرهٔ کارشناس هوشمند» — کارتِ وضعیتِ مذاکرهٔ یک گفت‌وگو در صفحهٔ مکاتبات (درخواست مالک، مهر ۱۴۰۵: «نمایشِ استراتژی مذاکره
 * و استراتژی استعلام چه شد؟» — بعد از «🚀 شروع» کارشناس نمی‌دید کارشناس هوشمند با چه برنامه‌ای و کجای مذاکره است).
 *
 * فقط سمتِ کارشناس: کلیدِ neg در GET /sp/thread/:id با side=e، و GET /sp/x/thread/:id/neg (worker/sp-api.js) — نه پنل و باتِ
 * تأمین‌کننده و نه پیام؛ عددهای درونی (قیمت مرجع، هدف، حد، بهترین پیشنهادِ دیگران) فقط همین‌جا. از چه ساخته می‌شود:
 *   • دورِ n از سقف (ai_threads.turns از آخرین «🤖 برگرداندن» — ai-lock.js:turnsUsed و turnCapOf)، حالتِ گفت‌وگو و یادداشتِ
 *     درونیِ کارشناس هوشمند (memo)
 *   • «مذاکرهٔ دوگامی» (worker/turn-engine.js): cr_turns — دورِ برنامه t، آخرین وضعیت‌ها و حرکت، پیشنهادهای ما (قیمتِ مؤثر) و
 *     توافقِ موقت؛ cr_facts — پیشنهادهای همین تأمین‌کننده و واقعیت‌های ثبت‌شدهٔ همین گفت‌وگو
 *   • برنامهٔ همان موتور (planOf با قیمت مرجعِ کد، قاعده‌های سندِ تأییدشده و بهترین پیشنهادِ واقعیِ دیگران): هدف، حد، لنگر، آهنگ و
 *     پیشنهادِ بعدی؛ با مذاکرهٔ همیشگی (کلیدِ turn خاموش، یا گفت‌وگوی چندقلمی) همان عددهای درونیِ سند که در زمینهٔ مدل است (docNumbers)
 *   • سندِ راهبردِ تأییدشدهٔ نوع قلم (cr_docs؛ strategy-doc.js:docBrief) — «📘 سند راهبرد»ِ کارت همان را فقط‌خواندنی باز می‌کند
 * امضای sig همان امضای نظرسنجیِ مکاتبات است (negSig): با هر دورِ تازه، حالتِ گفت‌وگو یا نوبتِ موتور کارت تازه می‌شود.
 */
import { STATES, MOVES } from "./strategy/kb-data.js";
import { MS_NAMES } from "./strategy/config.js";
import { nextOffer } from "./strategy/negotiation.js";
import { headPolicy, MODE_FA } from "./cr-engine.js";
import { docOn, docNumbers, docRules, docBrief, panelSettings } from "./strategy-doc.js";
import { turnOn, planOf, bestOther, othersStmt, turnSettings, refOf } from "./turn-engine.js";
import { turnsUsed, turnCapOf } from "./ai-lock.js";

const T = (v) => String(v == null ? "" : v).trim();
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const R = (n) => (n == null || n === "" || !Number.isFinite(Number(n)) ? null : Math.round(Number(n)));
const MOVE_FA = Object.fromEntries(MOVES.map((m) => [m.id, m.fa]));
const DONE = new Set(["final", "rejected"]);
export const NEG_STATE_FA = { invited: "دعوت شد", active: "در مذاکره", ask: "🚨 منتظرِ پاسخِ شما", human: "✋ دستِ شما", final: "تأیید نهایی شد",
  declined: "تأمین نمی‌کند", closed: "بسته شد" };

/** امضای کارت برای نظرسنجیِ مکاتبات (sp-api.js، /sp/poll): دورها، حالتِ گفت‌وگو و آخرین نوبتِ موتور — هر دو با کلیدِ اصلی */
export const NEG_SIG_SQL = "SELECT x.turns, x.state, (SELECT updated_at FROM cr_turns WHERE thread_id=x.thread_id) AS c FROM ai_threads x WHERE x.thread_id=?";
export const negSig = (r) => (r ? `${Number(r.turns) || 0}:${T(r.state)}:${Number(r.c) || 0}` : null);

/**
 * کارتِ وضعیتِ مذاکرهٔ گفت‌وگوی کارشناس هوشمند. th: ردیفِ گفت‌وگو (sp-core.js:threadFor). null اگر ردیفِ ai_threads نیست.
 * خروجی را فقط کارشناس می‌بیند — صدازننده side را می‌سنجد.
 */
export async function negView(env, th) {
  const [x, lr, tr, ag] = await Promise.all([
    env.DB.prepare("SELECT state, turns, memo, ask_json, updated_at FROM ai_threads WHERE thread_id=?").bind(th.id).first(),
    env.DB.prepare(`SELECT l.item_id, l.state, l.price, l.unit, l.head AS line_head, l.title, i.title AS item_title, i.code, i.unit AS item_unit, i.norm_json
        FROM sp_lines l LEFT JOIN items i ON i.id=l.item_id WHERE l.thread_id=? ORDER BY l.id`).bind(th.id).all(),
    env.DB.prepare("SELECT * FROM cr_turns WHERE thread_id=?").bind(th.id).first(),
    env.DB.prepare("SELECT config_json FROM ai_agents WHERE expert_id=?").bind(th.expert_id || 0).first(),
  ]);
  if (!x) return null;
  const lines = lr.results || [];
  const active = [...new Set(lines.filter((l) => !DONE.has(l.state)).map((l) => l.item_id))];
  const focus = (tr && tr.item_id) || (active.length === 1 ? active[0] : null) || (lines[0] ? lines[0].item_id : null);
  const line = lines.find((l) => l.item_id === focus) || null;
  const head = line ? T((parse(line.norm_json, {}) || {}).head) || T(line.line_head) : "";
  const code = line ? T(line.code) || null : null;
  const unit = line ? T(line.item_unit) || T(line.unit) || null : null;
  const [engineOn, docsOn, hp] = await Promise.all([turnOn(env), docOn(env), head ? headPolicy(env, head, { itemCode: code }).catch(() => null) : null]);
  /* همان شرطِ turnReply: کلیدِ turn، یک قلمِ باز و نوع قلمِ درونِ دادهٔ تحقیق — وگرنه مذاکرهٔ همیشگی */
  const engine = engineOn && active.length === 1 && hp ? "turn" : "classic";
  const t = tr ? Number(tr.t) || 0 : 0;
  const last = tr ? parse(tr.last, null) : null;
  const facts = focus ? ((await env.DB.prepare("SELECT id, thread_id, type, value, eff, at FROM cr_facts WHERE item_id=? ORDER BY at DESC, id DESC LIMIT 80")
    .bind(focus).all().catch(() => ({ results: [] }))).results || []) : [];
  const own = facts.filter((f) => f.thread_id === th.id);
  const theirs = own.filter((f) => f.type === "قیمت" && f.eff).slice(0, 6).reverse().map((f) => ({ eff: R(f.eff), text: T(f.value), at: f.at }));

  let plan = null, doc = null;
  if (hp) {
    const rules = await docRules(env, hp.head, code, { hp }).catch(() => null);
    const [nums, brief] = await Promise.all([docNumbers(env, hp.head, code, { hp, rules: rules ? rules.rules : null }).catch(() => null),
      docBrief(env, hp.head, code, { hp }).catch(() => null)]);
    if (brief) doc = { ...brief, code, ms_fa: MS_NAMES[brief.ms] || null, mode_fa: MODE_FA[brief.mode] || null };
    if (engine === "turn") {
      /* همان برنامه‌ای که موتور در دورِ بعد با آن پیشنهاد می‌دهد: قیمت مرجعِ هم‌واحد، قاعده‌های سند و بهترین پیشنهادِ واقعیِ دیگران */
      const [panel, others] = await Promise.all([panelSettings(env), othersStmt(env, focus, th.id).all().catch(() => ({ results: [] }))]);
      const best = bestOther(others.results, facts, th.id, unit, turnSettings(hp.profile, panel, rules));
      const p = planOf(hp.profile, refOf(nums, unit), best ? [best.eff] : [], rules && rules.rules);
      if (p) {
        plan = { src: "engine", ref: R(refOf(nums, unit)), unit: (nums && nums.unit) || unit, target: R(p.target), reservation: R(p.reservation), anchor: R(p.anchor),
          batna: best ? R(best.eff) : null, c: p.c, rounds: p.rounds, offers: Array.from({ length: p.rounds }, (_, i) => R(nextOffer(p, i + 1))),
          next: R(nextOffer(p, Math.min(p.rounds, t + 1))), rules: !!(rules && rules.rules) };
      }
    } else if (docsOn && nums && nums.status === "OK") {
      /* مذاکرهٔ همیشگی: همان عددهای درونی که «📘 سند راهبرد» در زمینهٔ مدل می‌گذارد (strategy-doc.js:docBlock، با قاعده‌های سندِ تأییدشده) */
      plan = { src: "doc", ref: nums.ref, unit: nums.unit || unit, target: nums.target, reservation: nums.reservation, anchor: nums.anchor, batna: null, c: nums.c,
        rounds: nums.rounds, offers: nums.offers, next: nums.offers[Math.min(nums.rounds, t + 1) - 1] ?? null, rules: !!nums.rules };
    }
  }

  const ours = tr ? parse(tr.offers, []).map(R).filter((v) => v != null) : [];
  const ag0 = tr ? parse(tr.agreement, null) : null;
  const seenFact = new Set();
  return {
    sig: negSig({ turns: x.turns, state: x.state, c: tr ? tr.updated_at : 0 }),
    state: x.state, state_fa: NEG_STATE_FA[x.state] || x.state,
    round: { used: turnsUsed(x.turns, x.ask_json), max: turnCapOf(ag && ag.config_json) },
    engine, t, items: new Set(lines.map((l) => l.item_id)).size,
    item: line ? { id: focus, title: T(line.item_title) || T(line.title), head: hp ? hp.head : head || null, code, unit } : null,
    /* stale: گفت‌وگو حالا با مذاکرهٔ همیشگی است (کلیدِ turn خاموش شد یا قلمِ دیگری به آن افزوده شد) — حرکت و پیشنهادها از دورهای پیشینِ موتورند */
    last: last ? { move: last.move || null, move_fa: MOVE_FA[last.move] || last.move || null,
      states: (last.states || []).slice(0, 3).map((s) => ({ id: s.id, name: (STATES[s.id] || {}).name || s.id, confidence: s.confidence == null ? null : Number(s.confidence) })),
      held: !!last.held, rewritten: !!last.rewritten, eff: R(last.eff), accept: last.accept ? { accept: !!last.accept.accept, reason: T(last.accept.reason) || null } : null,
      at: tr.updated_at || null, stale: engine !== "turn" } : null,
    ours, our_last: ours.length ? ours[ours.length - 1] : null, our_nominal: last ? R(last.nominal) : null,
    theirs, their_last: (last && R(last.eff)) ?? (theirs.length ? theirs[theirs.length - 1].eff : null),
    panel: line && Number(line.price) > 0 ? { price: R(line.price), unit: T(line.unit) || unit } : null,
    plan, doc,
    agreement: ag0 ? { price: R(ag0.price), eff: R(ag0.eff), at: ag0.at || null } : null,
    /* واقعیت‌های غیرِ قیمت، تازه‌ترین اول و هر کدام یک بار (مذاکره‌گر ممکن است همان را در چند دور دوباره ثبت کند) */
    facts: own.filter((f) => { const k = `${f.type}|${T(f.value)}`; return f.type !== "قیمت" && !seenFact.has(k) && !!seenFact.add(k); }).slice(0, 8)
      .map((f) => ({ type: f.type, value: T(f.value), at: f.at })),
    memo: T(x.memo),
    at: Math.max(Number(x.updated_at) || 0, tr ? Number(tr.updated_at) || 0 : 0) || null,
  };
}
