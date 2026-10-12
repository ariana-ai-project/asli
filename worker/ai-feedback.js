/**
 * 🧠 بایگانیِ بازخوردِ انسانی به کارشناس هوشمند — داده برای تحلیلِ پشتیبانی و آموزشِ مدل (مهر ۱۴۰۵، درخواستِ مالک)
 *
 * هر بازخوردِ کارشناس یک ردیف در ai_feedback، با «عکسِ» زمینه‌اش در همان لحظه — تا اگر درخواست یا گفت‌وگو بعداً حذف شد
 * (api.js:deleteRequests پاکشان می‌کند)، داده سالم بماند و بی جست‌وجو در جدول‌های دیگر به کارِ آموزش بیاید:
 *   msg     امتیازِ ۱ تا ۵ به پیامِ کارشناس هوشمند (+ علت) — ai_text همان پیام، context پیام‌های پیش از آن
 *   thread  امتیاز و نظر به کلِ مکاتبه — context کلِ گفت‌وگو (تا ۶۰ پیامِ آخر)
 *   letter  امتیاز و نظر به نامهٔ کمیسیونِ کارشناس هوشمند — ai_text متنِ نامه
 *   prop    تصمیمِ کارشناس روی پیشنهادِ «⏱ با مهلت»: outcome = ok (فرستاد) | no (رد؛ note علت، human_text پیامِ جایگزینِ او —
 *           جفتِ «ردشده/برگزیده» برای آموزشِ ترجیحی) | auto (در مهلت چیزی نگفت و خودکار رفت)
 * (kind, ref) یکتاست: امتیازِ دوباره همان ردیف را به‌روز می‌کند. خروجیِ JSONL و CSV و «برایندِ هوش مصنوعی» در پنل پشتیبانی.
 * بی ایمپورت از ai-agent.js و sp-core.js — ai-rates.js و ai-agent.js صدایش می‌زنند.
 */
import { HttpError } from "./http.js";
import { callModel } from "./ai-prompts.js";

const now = () => Date.now();
const T = (v) => String(v == null ? "" : v).trim();
const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const clip = (s, n) => { const x = T(s); return x.length > n ? `${x.slice(0, n - 1)}…` : x; };
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const DAY = 86400000;

export const FB_DDL = `
CREATE TABLE IF NOT EXISTS ai_feedback (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, ref INTEGER NOT NULL, at INTEGER NOT NULL, expert_id INTEGER, expert_name TEXT, assignment_id INTEGER, request_id TEXT, thread_id INTEGER, supplier TEXT, items TEXT, stars INTEGER, note TEXT, ai_text TEXT, human_text TEXT, outcome TEXT, model TEXT, context_json TEXT, UNIQUE(kind, ref));
CREATE INDEX IF NOT EXISTS ix_aifb_at ON ai_feedback(at);
CREATE INDEX IF NOT EXISTS ix_aifb_exp ON ai_feedback(expert_id, at);
`;
export const FB_KIND_FA = { msg: "پیام", thread: "کلِ مکاتبه", letter: "نامهٔ کمیسیون", prop: "پیشنهادِ با مهلت" };
export const FB_OUT_FA = { ok: "✅ فرستاد", no: "✏️ رد کرد", auto: "⏱ خودکار رفت" };

/* ---------- عکسِ زمینه ---------- */
const whoOf = (m) => (m.who === "s" ? "supplier" : (parse(m.meta_json, {}) || {}).ai ? "ai" : "expert");
async function msgsBefore(env, threadId, uptoId, n) {
  const rows = (await env.DB.prepare("SELECT id, who, kind, body, meta_json, at FROM sp_msgs WHERE thread_id=? AND id<? ORDER BY id DESC LIMIT ?")
    .bind(threadId, uptoId || 9e15, n).all()).results || [];
  return rows.reverse().map((m) => ({ id: m.id, who: whoOf(m), kind: m.kind, text: clip(m.body, 900), at: m.at }));
}
/** سرِ گفت‌وگو: درخواست، تأمین‌کننده، کارشناس، اقلام (عنوان، مقدار، واحد، قیمت) و شمارهٔ کارِ کارشناس هوشمند */
async function threadHead(env, threadId) {
  const [hr, lr] = await env.DB.batch([
    env.DB.prepare(`SELECT t.id, t.assignment_id, t.request_id, s.name AS supplier, a.expert_id, e.label, e.name, x.run_id FROM sp_threads t
        JOIN sp_suppliers s ON s.id=t.supplier_id JOIN assignments a ON a.id=t.assignment_id JOIN experts e ON e.id=a.expert_id
        LEFT JOIN ai_threads x ON x.thread_id=t.id WHERE t.id=?`).bind(threadId),
    env.DB.prepare("SELECT title, qty, unit, price, state FROM sp_lines WHERE thread_id=? ORDER BY id LIMIT 30").bind(threadId),
  ]);
  const h = (hr.results || [])[0];
  if (!h) return null;
  return { ...h, expert_name: h.label || h.name, items: (lr.results || []).map((l) => ({ title: l.title, qty: l.qty, unit: l.unit, price: l.price, state: l.state })) };
}
/** کدام مدل این متن را نوشت (آخرین فراخوانیِ مذاکره در همان گفت‌وگو تا آن لحظه) — با نمایهٔ run_id */
async function modelOf(env, runId, threadId, at, purpose = "negotiate") {
  if (!runId) return null;
  const r = await env.DB.prepare(`SELECT model FROM ai_calls WHERE run_id=? AND purpose=? ${threadId ? "AND thread_id=?" : ""} AND at<=? ORDER BY id DESC LIMIT 1`)
    .bind(...[runId, purpose, ...(threadId ? [threadId] : []), at || 9e15]).first().catch(() => null);
  return r ? r.model : null;
}
async function upsert(env, row) {
  await env.DB.prepare(`INSERT INTO ai_feedback (kind,ref,at,expert_id,expert_name,assignment_id,request_id,thread_id,supplier,items,stars,note,ai_text,human_text,outcome,model,context_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(kind, ref) DO UPDATE SET at=excluded.at, stars=excluded.stars, note=excluded.note,
        human_text=excluded.human_text, outcome=excluded.outcome, expert_id=excluded.expert_id, expert_name=excluded.expert_name`)
    .bind(row.kind, row.ref, now(), row.expert_id || null, row.expert_name || null, row.assignment_id || null, row.request_id || null, row.thread_id || null,
      row.supplier || null, row.items ? JSON.stringify(row.items) : null, row.stars == null ? null : row.stars, row.note || null, row.ai_text || null,
      row.human_text || null, row.outcome || null, row.model || null, row.context ? JSON.stringify(row.context) : null).run();
}

/** امتیازِ کارشناس (ai-rates.js:rate) — kind: msg | thread | letter؛ ref همان شناسهٔ پیام، گفت‌وگو یا نامه */
export async function recordRate(env, { kind, ref, stars, note }) {
  if (kind === "msg") {
    const m = await env.DB.prepare("SELECT id, thread_id, body, at FROM sp_msgs WHERE id=?").bind(ref).first();
    if (!m) return;
    const h = await threadHead(env, m.thread_id);
    if (!h) return;
    return upsert(env, { kind, ref, stars, note, ...h, thread_id: m.thread_id, ai_text: m.body, model: await modelOf(env, h.run_id, m.thread_id, m.at),
      context: { transcript: await msgsBefore(env, m.thread_id, m.id, 14), at: m.at } });
  }
  if (kind === "thread") {
    const h = await threadHead(env, ref);
    if (!h) return;
    return upsert(env, { kind, ref, stars, note, ...h, thread_id: ref, model: await modelOf(env, h.run_id, ref, null), context: { transcript: await msgsBefore(env, ref, null, 60) } });
  }
  if (kind === "letter") {
    const L = await env.DB.prepare(`SELECT l.id, l.assignment_id, l.letter_json, l.transcript, a.request_id, a.expert_id, e.label, e.name,
        (SELECT r.id FROM ai_runs r WHERE r.assignment_id=l.assignment_id ORDER BY r.id DESC LIMIT 1) AS run_id
      FROM letters l JOIN assignments a ON a.id=l.assignment_id JOIN experts e ON e.id=a.expert_id WHERE l.id=?`).bind(ref).first();
    if (!L) return;
    const body = parse(L.letter_json, {}) || {};
    const text = [body.to, body.subject ? `موضوع: ${body.subject}` : "", body.salutation, ...(body.paragraphs || []), body.closing, body.thanks, body.signature].filter(Boolean).join("\n");
    return upsert(env, { kind, ref, stars, note, expert_id: L.expert_id, expert_name: L.label || L.name, assignment_id: L.assignment_id, request_id: L.request_id,
      ai_text: text, model: await modelOf(env, L.run_id, null, null, "letter"), context: { letter: body, report: clip(L.transcript, 4000) } });
  }
}

/** تصمیمِ کارشناس روی پیشنهادِ «⏱ با مهلت» (ai-agent.js: ok | no | auto) — p: ردیفِ ai_props */
export async function recordProp(env, p, { outcome, reason = null, own = null, bundle = null }) {
  const h = await threadHead(env, p.thread_id);
  if (!h) return;
  const meta = parse(p.meta_json, {}) || {};
  const what = p.kind === "final" ? `🏁 تأیید نهاییِ بستهٔ ${p.bundle_id}` : p.kind === "act"
    ? (meta.actions || []).map((a) => `${a.type} بستهٔ ${a.bundle_id}${a.comment ? `: ${a.comment}` : ""}`).join(" · ") : "";
  return upsert(env, { kind: "prop", ref: p.id, outcome, note: reason, human_text: own, ...h, thread_id: p.thread_id,
    ai_text: [what, T(p.body)].filter(Boolean).join("\n") || null, model: await modelOf(env, h.run_id, p.thread_id, p.created_at),
    context: { transcript: await msgsBefore(env, p.thread_id, (p.seen_msg || 0) + 1, 14), prop_kind: p.kind, bundle_act: bundle, created_at: p.created_at, due_at: p.due_at || null } });
}

/* ---------- پنل پشتیبانی: /support/ai/feedback ---------- */
const WIN = { "7d": 7, "30d": 30, "90d": 90, "365d": 365, all: null };
function filterOf(url) {
  const w = Object.prototype.hasOwnProperty.call(WIN, url.searchParams.get("win")) ? url.searchParams.get("win") : "30d";
  const from = WIN[w] == null ? 0 : now() - WIN[w] * DAY;
  const conds = ["at>=?"], args = [from];
  const ex = int(url.searchParams.get("expert"));
  if (ex) { conds.push("expert_id=?"); args.push(ex); }
  return { win: w, from, ex, where: conds.join(" AND "), args };
}
/* واژه‌های بی‌معنا برای «پرتکرارترین‌ها» */
const STOP = new Set("و در به از که این را با برای تا یا هم اما ولی است بود شد شود می نمی خیلی کمی بیشتر کمتر هست نیست باید نباید اگر چون یک دو آن ها های ای را تو من ما شما او بر پس هر همه چه چرا کرد کند کرده بودن داشت دارد داشته ندارد نداشت".split(" "));
function topWords(notes, n = 18) {
  const c = new Map();
  for (const s of notes) {
    const words = String(s || "").replace(/[ي]/g, "ی").replace(/[ك]/g, "ک").replace(/[^؀-ۿa-zA-Z0-9‌ ]+/g, " ").split(/\s+/);
    for (let w of words) {
      w = w.replace(/‌+$/, "");
      if (w.length < 3 || STOP.has(w) || /^\d+$/.test(w)) continue;
      c.set(w, (c.get(w) || 0) + 1);
    }
  }
  return [...c].filter(([, k]) => k > 1).sort((a, b) => b[1] - a[1]).slice(0, n).map(([w, k]) => ({ w, n: k }));
}

export async function feedbackStats(env, url) {
  const f = filterOf(url);
  const kind = T(url.searchParams.get("kind")), low = url.searchParams.get("low") === "1", q = T(url.searchParams.get("q"));
  const lim = Math.min(200, Math.max(10, int(url.searchParams.get("limit")) || 50)), off = Math.max(0, int(url.searchParams.get("offset")) || 0);
  const lc = [f.where], la = [...f.args];
  if (FB_KIND_FA[kind]) { lc.push("kind=?"); la.push(kind); }
  if (low) lc.push("((stars IS NOT NULL AND stars<3) OR outcome='no')");
  if (q) { lc.push("(note LIKE ? OR ai_text LIKE ? OR human_text LIKE ? OR supplier LIKE ? OR request_id LIKE ? OR expert_name LIKE ?)"); la.push(...Array(6).fill(`%${q}%`)); }
  const span = now() - (f.from || now() - 365 * DAY);
  const bucket = span <= 45 * DAY ? DAY : 7 * DAY;
  const [kr, er, dr, tr, nr, ir, cr] = await env.DB.batch([
    env.DB.prepare(`SELECT kind, COUNT(*) AS n, AVG(stars) AS avg, SUM(stars<3) AS low, SUM(outcome='ok') AS ok, SUM(outcome='no') AS no, SUM(outcome='auto') AS auto
      FROM ai_feedback WHERE ${f.where} GROUP BY kind`).bind(...f.args),
    env.DB.prepare(`SELECT expert_id, MAX(expert_name) AS name, kind, COUNT(*) AS n, AVG(stars) AS avg, SUM(stars<3) AS low, SUM(outcome='ok') AS ok, SUM(outcome='no') AS no, SUM(outcome='auto') AS auto
      FROM ai_feedback WHERE ${f.where} GROUP BY expert_id, kind`).bind(...f.args),
    env.DB.prepare(`SELECT kind, stars, COUNT(*) AS n FROM ai_feedback WHERE ${f.where} AND stars IS NOT NULL GROUP BY kind, stars`).bind(...f.args),
    env.DB.prepare(`SELECT CAST((at - ?) / ? AS INTEGER) AS b, AVG(stars) AS avg, COUNT(*) AS n FROM ai_feedback WHERE ${f.where} AND kind='msg' GROUP BY b ORDER BY b`).bind(f.from || 0, bucket, ...f.args),
    env.DB.prepare(`SELECT note FROM ai_feedback WHERE ${f.where} AND note IS NOT NULL AND ((stars IS NOT NULL AND stars<3) OR outcome='no') ORDER BY at DESC LIMIT 400`).bind(...f.args),
    env.DB.prepare(`SELECT id, kind, at, expert_id, expert_name, request_id, thread_id, supplier, stars, note, outcome, model, substr(ai_text,1,500) AS ai_text, substr(human_text,1,500) AS human_text
      FROM ai_feedback WHERE ${lc.join(" AND ")} ORDER BY at DESC LIMIT ? OFFSET ?`).bind(...la, lim, off),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM ai_feedback WHERE ${lc.join(" AND ")}`).bind(...la),
  ]);
  const byKind = Object.fromEntries((kr.results || []).map((r) => [r.kind, { n: r.n, avg: r.avg == null ? null : Math.round(r.avg * 100) / 100, low: r.low || 0, ok: r.ok || 0, no: r.no || 0, auto: r.auto || 0 }]));
  const ex = new Map();
  for (const r of er.results || []) {
    if (!ex.has(r.expert_id)) ex.set(r.expert_id, { expert_id: r.expert_id, name: r.name || "—", n: 0 });
    const e = ex.get(r.expert_id);
    e.n += r.n;
    e[r.kind] = { n: r.n, avg: r.avg == null ? null : Math.round(r.avg * 100) / 100, low: r.low || 0, ok: r.ok || 0, no: r.no || 0, auto: r.auto || 0 };
  }
  const dist = {};
  for (const r of dr.results || []) { dist[r.kind] = dist[r.kind] || [0, 0, 0, 0, 0]; if (r.stars >= 1 && r.stars <= 5) dist[r.kind][r.stars - 1] = r.n; }
  return {
    win: f.win, from: f.from, bucket: bucket === DAY ? "day" : "week",
    kinds: byKind, experts: [...ex.values()].sort((a, b) => b.n - a.n), dist,
    trend: (tr.results || []).map((r) => ({ at: (f.from || 0) + r.b * bucket, avg: Math.round(r.avg * 100) / 100, n: r.n })),
    words: topWords((nr.results || []).map((r) => r.note)),
    items: ir.results || [], total: ((cr.results || [])[0] || {}).n || 0,
  };
}

export async function feedbackOne(env, id) {
  const r = await env.DB.prepare("SELECT * FROM ai_feedback WHERE id=?").bind(id).first();
  if (!r) throw new HttpError("این بازخورد پیدا نشد.", 404);
  return { ...r, items: parse(r.items, []), context: parse(r.context_json, null), context_json: undefined };
}

/** خروجیِ آموزش: JSONL (هر خط یک بازخورد با زمینه) یا CSV برای اکسل — حداکثر ۲۰٬۰۰۰ ردیف، تازه‌ترها اول */
export async function feedbackExport(env, url) {
  const f = filterOf(url);
  const fmt = url.searchParams.get("format") === "csv" ? "csv" : "jsonl";
  const rows = (await env.DB.prepare(`SELECT * FROM ai_feedback WHERE ${f.where} ORDER BY at DESC LIMIT 20000`).bind(...f.args).all()).results || [];
  if (fmt === "jsonl") {
    const body = rows.map((r) => JSON.stringify({ id: r.id, kind: r.kind, at: new Date(r.at).toISOString(), stars: r.stars, note: r.note, outcome: r.outcome,
      ai_text: r.ai_text, human_text: r.human_text, model: r.model, request_id: r.request_id, supplier: r.supplier, expert_id: r.expert_id,
      items: parse(r.items, []), context: parse(r.context_json, null) })).join("\n");
    return new Response(body + (body ? "\n" : ""), { headers: { "content-type": "application/x-ndjson; charset=utf-8",
      "content-disposition": `attachment; filename="ai-feedback-${f.win}.jsonl"` } });
  }
  const cell = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
  const head = ["شناسه", "نوع", "زمان", "کارشناس", "درخواست", "تأمین‌کننده", "ستاره", "نظر یا علت", "نتیجه", "متنِ کارشناس هوشمند", "پیامِ جایگزینِ کارشناس", "مدل"];
  const lines = rows.map((r) => [r.id, FB_KIND_FA[r.kind] || r.kind, new Date(r.at).toISOString(), r.expert_name, r.request_id, r.supplier, r.stars, r.note,
    FB_OUT_FA[r.outcome] || r.outcome, r.ai_text, r.human_text, r.model].map(cell).join(","));
  return new Response("﻿" + [head.map(cell).join(","), ...lines].join("\r\n"), { headers: { "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="ai-feedback-${f.win}.csv"` } });
}

/**
 * «🤖 برایند»: نظرها و علت‌های همان بازه با Claude Haiku 4.5 جمع‌بندی می‌شود — مشکلاتِ پرتکرار، نقطه‌های قوت و پیشنهادِ عملی برای
 * پرامپت یا قواعد. فقط با کلیکِ پشتیبانی؛ حداکثر ۲۵۰ نظر؛ هزینه در ai_calls (purpose='feedback').
 */
const SUM_SCHEMA = {
  type: "object", additionalProperties: false, required: ["summary", "problems", "strengths", "actions"],
  properties: {
    summary: { type: "string" },
    problems: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "detail", "share"], properties: { title: { type: "string" }, detail: { type: "string" }, share: { type: "string" } } } },
    strengths: { type: "array", items: { type: "string" } },
    actions: { type: "array", items: { type: "string" } },
  },
};
export async function feedbackSummary(env, body) {
  const url = new URL(`https://x/?win=${encodeURIComponent(T(body && body.win) || "30d")}${int(body && body.expert) ? `&expert=${int(body.expert)}` : ""}`);
  const f = filterOf(url);
  const rows = (await env.DB.prepare(`SELECT kind, stars, note, outcome, substr(ai_text,1,280) AS ai_text, substr(human_text,1,200) AS human_text FROM ai_feedback
      WHERE ${f.where} AND (note IS NOT NULL OR outcome='no') ORDER BY ((stars IS NOT NULL AND stars<3) OR outcome='no') DESC, at DESC LIMIT 250`).bind(...f.args).all()).results || [];
  if (rows.length < 3) throw new HttpError("برای برایند دست‌کم سه نظر یا علت در این بازه لازم است.", 409);
  const lines = rows.map((r, i) => `${i + 1}. [${FB_KIND_FA[r.kind] || r.kind}${r.stars ? ` · ${r.stars} از ۵` : ""}${r.outcome ? ` · ${FB_OUT_FA[r.outcome] || r.outcome}` : ""}] `
    + `نظر: ${T(r.note) || "—"}${r.ai_text ? ` | متنِ ربات: ${T(r.ai_text)}` : ""}${r.human_text ? ` | جایگزینِ کارشناس: ${T(r.human_text)}` : ""}`).join("\n");
  const system = "تو تحلیل‌گرِ کیفیتِ یک «کارشناس هوشمندِ خرید» هستی که با تأمین‌کنندگان مذاکره می‌کند. نظرها و امتیازهای کارشناسانِ خرید را می‌خوانی و برایِ پشتیبانِ سامانه جمع‌بندیِ کوتاه، دقیق و کاربردی به فارسیِ ساده می‌نویسی. فقط از همین داده‌ها حرف بزن؛ چیزی نساز. problems: پرتکرارترین ایرادها، هر کدام با توضیح و سهمِ تقریبی (مثلاً «حدود ۱۲ مورد از ۴۰»). strengths: آنچه خوب کار می‌کند. actions: پیشنهادِ مشخص برای اصلاحِ دستورالعمل یا قواعدِ ربات. summary: دو یا سه جمله.";
  const t0 = now();
  let res;
  try {
    res = await callModel(env, { system, user: `${rows.length} بازخورد:\n${lines}`, schema: SUM_SCHEMA, model: "claude-haiku-4-5", maxTokens: 3000, timeoutMs: 55000 });
  } catch (e) {
    console.error("feedback summary", e && e.message);
    throw new HttpError("مدل الان پاسخ نداد؛ کمی بعد دوباره «تحلیل کن» را بزنید.", 502);
  }
  const u = res.usage || {};
  const cost = ((u.input_tokens || 0) * 1 + (u.output_tokens || 0) * 5) / 1e6;
  await env.DB.prepare("INSERT INTO ai_calls (purpose,model,in_tok,out_tok,cost_usd,ms,status,at) VALUES ('feedback',?,?,?,?,?,'ok',?)")
    .bind(res.model, u.input_tokens || 0, u.output_tokens || 0, cost, now() - t0, now()).run().catch(() => {});
  return { ...res.out, n: rows.length, win: f.win, at: now(), cost };
}
