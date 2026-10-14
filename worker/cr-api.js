/**
 * مسیرهای «درخواست تغییر ۰۲» — دفتر تأمین‌کنندگان، پروفایل، نظرها، گراف و استراتژی استعلام (فاز ۱ و ۲)
 *
 * مشترک (کارشناس، مدیر، پشتیبان؛ who در api.js):
 *   GET  /sreg/profile?sid=|name=&head=      GET /sreg/search?q=        GET /sreg/graph?sid=|name=&depth=1|2
 *   POST /sreg/opinions   PUT /sreg/opinions/:id   POST /sreg/opinions/:id/hide
 *   POST /sreg/links      POST /sreg/edges/:id/review
 *   GET  /cr/flags        GET /cr/head?head=&code=       GET /cr/plan?head=&code=&cautious=1
 *   GET  /cr/doc?head=&code=&enqueue=1   POST /cr/doc/build   POST /cr/doc/:id/review     («📘 سند راهبرد»، کلیدِ doc)
 * پشتیبانی:
 *   GET/PUT /support/cr/flags      GET /support/cr/status
 *   GET /support/sreg/g4?state=    POST /support/sreg/g4/:alias      GET /support/graph?head=&hub=&limit=
 *   GET /support/strategy/heads?mode=&family=&q=&page=   PUT /support/strategy/heads/:head
 *   GET/PUT /support/strategy/rfqn      GET/PUT /support/cr/panel (تنظیم‌های قیمتِ مؤثر، مدلِ سند، مدل‌های مذاکرهٔ دوگامی و پیشرفتِ پیش‌ساخت)
 * هر بخش پشتِ کلیدِ settings.crFlags است و تا روشن نشده رابطِ کاربری چیزی نشان نمی‌دهد (آزمون‌ها و پشتیبانی همیشه می‌بینند).
 */
import { HttpError } from "./http.js";
import { supplierProfile, addOpinion, editOpinion, hideOpinion, addLinks, reviewEdge, egoGraph, searchSuppliers, g4List, g4Decide, fullGraph } from "./sreg.js";
import { headPolicy, recipientPlan, rfqNTable, MODE_FA, FAMILY } from "./cr-engine.js";
import * as C from "./strategy/config.js";
import { WORKFLOWS, WORKFLOW_SUP, SUP_FA } from "./ai-supervise.js";
import { docView, enqueueDoc, reviewDoc, docOut, docStates, docProgress, panelSettings, savePanel, docModel } from "./strategy-doc.js";
import { AGENT_MODELS } from "./ai-prompts.js";
import { turnModels, saveTurnModels, TURN_MODEL_OPTS } from "./turn-engine.js";

const T = (v) => String(v == null ? "" : v).trim();
const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const now = () => Date.now();
export const FLAG_KEYS = { registry: "دفتر تأمین‌کنندگان، پروفایل، نظرها و گراف", strategy: "🧭 استراتژی استعلام در کارت قلم", pretick: "شمار پیش‌تیک از استراتژی",
  firstmsg: "✉️ پیام اول با قالب", doc: "سند راهبرد پیش از مذاکره", boxes: "جعبه‌های نقد", hold: "⏸ بی‌مهلت", turn: "مذاکرهٔ دوگامی (طبقه‌بند و مذاکره‌گر)" };

export async function crFlags(env) {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key='crFlags'").first().catch(() => null);
  const v = r ? parse(r.value, {}) : {};
  return Object.fromEntries(Object.keys(FLAG_KEYS).map((k) => [k, v[k] ? 1 : 0]));
}
async function saveFlags(env, b) {
  const cur = await crFlags(env);
  for (const k of Object.keys(FLAG_KEYS)) if (b && k in b) cur[k] = b[k] ? 1 : 0;
  await env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('crFlags',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").bind(JSON.stringify(cur), now()).run();
  return cur;
}

/** /sreg/* و /cr/* — who(): {kind, id, name} */
export async function crRoute(request, env, path, m, url, { json, readJson, who }) {
  const q = Object.fromEntries(url.searchParams.entries());
  let mm;
  const w = await who();
  if (path === "/sreg/profile" && m === "GET") return json(await supplierProfile(env, w, q));
  if (path === "/sreg/search" && m === "GET") return json(await searchSuppliers(env, q));
  if (path === "/sreg/graph" && m === "GET") return json(await egoGraph(env, q));
  if (path === "/sreg/opinions" && m === "POST") return json(await addOpinion(env, w, await readJson(request)));
  if ((mm = /^\/sreg\/opinions\/(\d+)$/.exec(path)) && m === "PUT") return json(await editOpinion(env, w, int(mm[1]), await readJson(request)));
  if ((mm = /^\/sreg\/opinions\/(\d+)\/hide$/.exec(path)) && m === "POST") return json(await hideOpinion(env, w, int(mm[1]), await readJson(request)));
  if (path === "/sreg/links" && m === "POST") return json(await addLinks(env, w, await readJson(request)));
  if ((mm = /^\/sreg\/edges\/(\d+)\/review$/.exec(path)) && m === "POST") return json(await reviewEdge(env, w, int(mm[1]), await readJson(request)));
  if (path === "/cr/flags" && m === "GET") return json({ flags: await crFlags(env) });
  if (path === "/cr/head" && m === "GET") {
    const hp = await headPolicy(env, T(q.head), { itemCode: T(q.code) || null });
    if (!hp) return json({ found: false });
    const p = hp.policy;
    return json({ found: true, head: hp.head, mode: p.mode, mode_fa: hp.mode_fa, competition_mode: p.competition_mode, competition_fa: hp.competition_fa, family: hp.family,
      tier: p.tier, n_wave1: p.n_wave1, n_max: p.n_max, why: p.why, workflow: hp.workflow, priority: hp.priority, confidence: hp.confidence, notes: hp.notes,
      disclosure: p.disclosure, quote_must_include: p.quote_must_include, timing: p.timing, ms: hp.profile.ms, labels: hp.profile.labels });
  }
  if (path === "/cr/plan" && m === "GET") return json(await recipientPlan(env, T(q.head), { itemCode: T(q.code) || null, cautious: q.cautious === "1" }));
  /* «📘 سند راهبرد» (worker/strategy-doc.js، کلیدِ doc) */
  if (path === "/cr/doc" || path.startsWith("/cr/doc/")) {
    if (!(await crFlags(env)).doc) throw new HttpError("«سند راهبرد» هنوز در پنل پشتیبانی روشن نشده است.", 409);
    if (path === "/cr/doc" && m === "GET") return json(await docView(env, T(q.head), { itemCode: T(q.code) || null, urgent: q.urgent === "1", enqueue: q.enqueue === "1", by: w.name }));
    if (path === "/cr/doc/build" && m === "POST") {
      const b = await readJson(request);
      const r = await enqueueDoc(env, T(b.head), { itemCode: T(b.code) || null, prio: 2, by: w.name, force: !!b.force });
      return json({ queued: r.queued, doc: docOut(r.row) });
    }
    if ((mm = /^\/cr\/doc\/(\d+)\/review$/.exec(path)) && m === "POST") return json(await reviewDoc(env, w, int(mm[1]), await readJson(request)));
  }
  throw new HttpError("مسیر پیدا نشد.", 404);
}

/** /support/cr/*، /support/sreg/*، /support/graph، /support/strategy/* — پس از requireSupport */
export async function crSupportRoute(request, env, path, m, url, { json, readJson }) {
  const q = Object.fromEntries(url.searchParams.entries());
  const w = { kind: "support", id: 0, name: "پشتیبانی" };
  let mm;
  if (path === "/support/cr/flags" && m === "GET") return json({ flags: await crFlags(env), names: FLAG_KEYS });
  if (path === "/support/cr/flags" && m === "PUT") return json({ flags: await saveFlags(env, await readJson(request)) });
  if (path === "/support/cr/status" && m === "GET") {
    const n = async (t) => ((await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first().catch(() => null)) || {}).n || 0;
    const [heads, units, sreg, edges, ops, alias] = await Promise.all(["cr_heads", "cr_units", "sreg", "sreg_edges", "sreg_ops", "sreg_alias"].map(n));
    const last = (await env.DB.prepare("SELECT MAX(imported_at) AS at, MAX(version) AS v FROM cr_heads").first().catch(() => null)) || {};
    return json({ heads, units, suppliers: sreg, edges, opinions: ops, aliases: alias, imported_at: last.at || null, version: last.v || null });
  }
  if (path === "/support/sreg/g4" && m === "GET") return json(await g4List(env, q));
  if ((mm = /^\/support\/sreg\/g4\/([^/]+)$/.exec(path)) && m === "POST") return json(await g4Decide(env, w, decodeURIComponent(mm[1]), await readJson(request)));
  if (path === "/support/graph" && m === "GET") return json(await fullGraph(env, q));
  if (path === "/support/strategy/heads" && m === "GET") return json(await headList(env, q));
  if ((mm = /^\/support\/strategy\/heads\/(.+)$/.exec(path)) && m === "PUT") return json(await headSet(env, w, decodeURIComponent(mm[1]), await readJson(request)));
  if (path === "/support/strategy/rfqn" && m === "GET") return json({ table: await rfqNTable(env), defaults: C.RFQ_N, modes: MODE_FA });
  if (path === "/support/strategy/rfqn" && m === "PUT") return json(await rfqNSave(env, await readJson(request)));
  /* «📘 سند راهبرد»: تنظیم‌های قیمتِ مؤثر (نرخِ ماهانهٔ پنل، مالیات…)، مدلِ سند و پیشرفتِ پیش‌ساختِ ۱۳۸ نوع قلم */
  if (path === "/support/cr/panel" && m === "GET") return json({ panel: await panelSettings(env), model: await docModel(env),
    models: Object.fromEntries(Object.entries(AGENT_MODELS).map(([k, v]) => [k, v.fa])), progress: await docProgress(env), turn: await turnModels(env), turn_opts: TURN_MODEL_OPTS });
  if (path === "/support/cr/panel" && m === "PUT") {
    const b = await readJson(request);
    /* مدل‌های «مذاکرهٔ دوگامی» (فاز ۴، تصمیم ۴): طبقه‌بند و مذاکره‌گر */
    const out = await savePanel(env, b || {});
    return json({ ...out, turn: b && b.turn ? await saveTurnModels(env, b.turn) : await turnModels(env) });
  }
  throw new HttpError("مسیر پیدا نشد.", 404);
}

/* ------------------------------------------------------------------ */
/* زبانهٔ «🧭 استراتژی استعلام» پشتیبانی                                */
/* ------------------------------------------------------------------ */
/** فهرستِ نوع قلم‌ها با حالتِ تحقیق و تغییرِ پشتیبانی؛ شمارشِ هر حالت. mode / family (max|cautious|special) / q / page */
async function headList(env, q) {
  const [counts, ch] = await env.DB.batch([
    env.DB.prepare("SELECT rfq_mode AS mode, COUNT(*) AS n FROM cr_heads GROUP BY rfq_mode"),
    env.DB.prepare("SELECT head, field, value, by_name, reason, at FROM cr_head_x WHERE active=1 AND field IN ('mode','n','workflow') ORDER BY at")]);
  const over = new Map();
  for (const r of ch.results || []) { const o = over.get(r.head) || {}; o[r.field] = { value: parse(r.value, r.value), by: r.by_name, reason: r.reason, at: r.at }; over.set(r.head, o); }
  const mode = T(q.mode), fam = T(q.family), term = T(q.q), page = Math.max(0, int(q.page) || 0), PER = 50;
  const where = [], args = [];
  if (mode && C.RFQ_MODES.includes(mode)) {
    /* حالتِ مؤثر: تحقیق یا تغییرِ پشتیبانی */
    const moved = [...over].filter(([, o]) => o.mode && o.mode.value === mode).map(([h]) => h);
    const movedOut = [...over].filter(([, o]) => o.mode && o.mode.value !== mode).map(([h]) => h);
    where.push(`((rfq_mode=?${movedOut.length ? ` AND head NOT IN (${movedOut.map(() => "?").join(",")})` : ""})${moved.length ? ` OR head IN (${moved.map(() => "?").join(",")})` : ""})`);
    args.push(mode, ...movedOut, ...moved);
  } else if (fam === "max" || fam === "cautious" || fam === "special") {
    const ms = C.RFQ_MODES.filter((x) => FAMILY(x) === fam);
    where.push(`rfq_mode IN (${ms.map(() => "?").join(",")})`); args.push(...ms);
  }
  if (term) { where.push("head LIKE ?"); args.push(`%${term}%`); }
  const sql = `SELECT head, cluster, ms, tier, rfq_mode, competition_mode, n_wave1, n_max, workflow, priority, confidence, spend_bn, spend_rank FROM cr_heads${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY spend_rank IS NULL, spend_rank, head LIMIT ${PER} OFFSET ${page * PER}`;
  const rows = (await env.DB.prepare(sql).bind(...args).all()).results || [];
  return {
    docs: await docStates(env, rows.map((r) => r.head)).catch(() => ({})),
    counts: Object.fromEntries((counts.results || []).map((r) => [r.mode, r.n])), modes: MODE_FA, families: { max: "حداکثری", cautious: "محتاط", special: "ویژه" },
    list: rows.map((r) => { const o = over.get(r.head) || {}; return { ...r, mode_fa: MODE_FA[r.rfq_mode], family: FAMILY(r.rfq_mode), moved: o.mode || null, n_over: o.n || null, wf_over: o.workflow || null }; }),
    page, per: PER,
    /* «حالت کار» و کفِ حالتِ مکاتبات («⏸ بی‌مهلت»، کلیدِ hold) */
    workflows: WORKFLOWS.map((w) => ({ key: w, sup: WORKFLOW_SUP[w], sup_fa: WORKFLOW_SUP[w] === "auto" ? "بی کف" : SUP_FA[WORKFLOW_SUP[w]] })),
  };
}
/** تغییرِ پشتیبانی روی یک نوع قلم: {mode?, n?: {n_wave1, n_max}, workflow?, clear?: ['mode'|'n'|'workflow'], reason} — دلیل لازم است؛ نسخهٔ قبلی غیرفعال می‌ماند */
async function headSet(env, w, head, b) {
  if (!(await env.DB.prepare("SELECT 1 FROM cr_heads WHERE head=?").bind(head).first())) throw new HttpError("این نوع قلم در دادهٔ تحقیق نیست.", 404);
  const reason = T(b && b.reason).slice(0, 400);
  if (reason.length < 3) throw new HttpError("دلیلِ تغییر را بنویسید.", 422);
  const t = now(), stmts = [];
  const put = (field, value) => {
    stmts.push(env.DB.prepare("UPDATE cr_head_x SET active=0 WHERE head=? AND field=? AND active=1").bind(head, field));
    if (value !== undefined) stmts.push(env.DB.prepare("INSERT INTO cr_head_x (head,field,value,source,by_kind,by_name,reason,at,active) VALUES (?,?,?,'پشتیبانی',?,?,?,?,1)")
      .bind(head, field, JSON.stringify(value), w.kind, w.name, reason, t));
  };
  if (b.mode !== undefined) {
    if (!C.RFQ_MODES.includes(b.mode)) throw new HttpError("حالتِ استعلام نامعتبر است.", 422);
    put("mode", b.mode);
  }
  if (b.n !== undefined) {
    const a = int(b.n && b.n.n_wave1), c = int(b.n && b.n.n_max);
    if (!a || !c || a < 1 || c > 20 || a > c) throw new HttpError("شمار موج اول و سقف باید ۱ تا ۲۰ باشد و موج اول بیش از سقف نه.", 422);
    put("n", { n_wave1: a, n_max: c });
  }
  if (b.workflow !== undefined) {
    if (!WORKFLOWS.includes(b.workflow)) throw new HttpError("«حالت کار» نامعتبر است.", 422);
    put("workflow", b.workflow);
  }
  for (const f of Array.isArray(b.clear) ? b.clear : []) if (f === "mode" || f === "n" || f === "workflow") put(f, undefined);
  if (!stmts.length) throw new HttpError("تغییری نیامده است.", 422);
  stmts.push(env.DB.prepare("INSERT INTO events (at,actor,kind,payload_json) VALUES (?,?,?,?)").bind(t, "support", "cr_head_set", JSON.stringify({ head, mode: b.mode, n: b.n, workflow: b.workflow, clear: b.clear, reason })));
  await env.DB.batch(stmts);
  return { ok: true };
}
async function rfqNSave(env, b) {
  const out = {};
  for (const [mode, tiers] of Object.entries((b && b.table) || {})) {
    if (!C.RFQ_N[mode]) continue;
    for (const [t, v] of Object.entries(tiers || {})) {
      if (!["A", "B", "C"].includes(t) || !Array.isArray(v) || v.length !== 2) continue;
      const [a, c] = v.map((x) => int(x));
      if (!a || !c || a < 1 || c > 20 || a > c) throw new HttpError(`${MODE_FA[mode]}، ردهٔ ${t}: موج اول ۱ تا سقف و سقف تا ۲۰.`, 422);
      (out[mode] ||= {})[t] = [a, c];
    }
  }
  await env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('crRfqN',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").bind(JSON.stringify(out), now()).run();
  return { ok: true, table: await rfqNTable(env) };
}
