/**
 * ⭐ امتیازِ کارشناس به کارِ کارشناس هوشمند (مهر ۱۴۰۵، درخواستِ مالک)
 *
 * وقتی مکاتبه دستِ کارشناس هوشمند است، کارشناسِ خرید به هر پیامی که او برای تأمین‌کننده نوشته (پاسخ‌ها؛ نه قالب‌های ثابتِ دعوت و
 * تشکر — meta.tpl — و نه کارت‌های رخداد و یادداشت‌های درونی) یک تا پنج ستاره می‌دهد؛ کمتر از سه ستاره علت می‌خواهد. وقتی گفت‌وگو
 * بسته شد (نهایی، کنار رفت یا کارِ کارشناس هوشمند تمام شد)، به کلِ همان مکاتبه ستاره و نظرِ اجباری، و به نامهٔ کمیسیونی که کارشناس
 * هوشمند نوشته هم ستاره و نظرِ اجباری. «خاتمه»ِ کارشناس تا همهٔ این‌ها داده نشده معلق است (decisions.js — تصمیمِ مالک) تا کارشناسان
 * در این ارزیابی شرکت کنند. امتیازهای کم با علتشان در پروندهٔ دورِ بعدِ مذاکره به خودِ کارشناس هوشمند می‌رسد (ai-agent.js).
 *
 * ai_rates: (kind, ref) یکتا — msg: شناسهٔ پیام (sp_msgs)، thread: شناسهٔ گفت‌وگو، letter: شناسهٔ نامه (letters). امتیاز عوض‌شدنی است.
 * بی ایمپورت از ai-agent.js و sp-core.js، تا هر دو و api.js و decisions.js بی حلقه بخوانند.
 */
import { HttpError } from "./http.js";
import { recordRate } from "./ai-feedback.js";

const now = () => Date.now();
const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const T = (v) => String(v == null ? "" : v).trim();
const FA = "۰۱۲۳۴۵۶۷۸۹";
const faN = (s) => String(s).replace(/\d/g, (d) => FA[+d]);

export const RATE_DDL = `
CREATE TABLE IF NOT EXISTS ai_rates (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, ref INTEGER NOT NULL, assignment_id INTEGER NOT NULL, thread_id INTEGER, expert_id INTEGER NOT NULL, stars INTEGER NOT NULL, note TEXT, at INTEGER NOT NULL, UNIQUE(kind, ref));
CREATE INDEX IF NOT EXISTS ix_airates_asg ON ai_rates(assignment_id, kind);
CREATE INDEX IF NOT EXISTS ix_airates_th ON ai_rates(thread_id, kind);
`;

/** پیامی که امتیاز می‌خواهد (m: نامِ مستعارِ sp_msgs): متنِ کارشناس هوشمند برای تأمین‌کننده، بی قالب‌های ثابت */
export const RATE_MSG_SQL = (m) => `${m}.who='e' AND ${m}.kind='text' AND json_extract(${m}.meta_json,'$.ai')=1 AND json_extract(${m}.meta_json,'$.tpl') IS NULL`;
/** همان شرط در جاوااسکریپت، برای پیامی که در دست است */
export const rateable = (m) => !!m && m.who === "e" && (m.kind || "text") === "text" && !!(m.meta && m.meta.ai) && !(m.meta && m.meta.tpl);
/** گفت‌وگوی کارشناس هوشمند بسته است؟ (x: ai_threads، r: ai_runs) — از این لحظه امتیازِ کلِ مکاتبه خواسته می‌شود */
const CLOSED_SQL = `(x.state IN ('final','declined','closed') OR r.finished_at IS NOT NULL)`;
const LOW = 3;

/**
 * امتیازهای یک گفت‌وگو برای صفحهٔ مکاتبات (فقط گفت‌وگوی کارشناس هوشمند): {msgs: {شناسهٔ پیام: {stars, note}}، thread، closed، need}.
 * closed: گفت‌وگو بسته است یا کارِ ارجاعش به کمیسیون رسیده — از این لحظه امتیازِ کلِ مکاتبه خواسته می‌شود.
 * need: شمارِ پیام‌های بی‌امتیاز + ۱ اگر گفت‌وگو بسته است و امتیازِ کلش نیامده.
 */
export async function threadRates(env, threadId) {
  const [rr, xr, mr] = await env.DB.batch([
    env.DB.prepare("SELECT kind, ref, stars, note, at FROM ai_rates WHERE thread_id=?").bind(threadId),
    /* بسته، یا کارِ ارجاعش به کمیسیون رسیده (قلمِ تأییدشده دارد) — همان قاعدهٔ rate() و «خاتمه» */
    env.DB.prepare(`SELECT ${CLOSED_SQL} AS closed, EXISTS (SELECT 1 FROM sp_threads t JOIN items i ON i.assignment_id=t.assignment_id WHERE t.id=x.thread_id AND i.commission_ok=1) AS ending
      FROM ai_threads x JOIN ai_runs r ON r.id=x.run_id WHERE x.thread_id=?`).bind(threadId),
    env.DB.prepare(`SELECT m.id FROM sp_msgs m WHERE m.thread_id=? AND ${RATE_MSG_SQL("m")}`).bind(threadId),
  ]);
  const rows = rr.results || [];
  const msgs = {};
  let thread = null;
  for (const r of rows) {
    if (r.kind === "msg") msgs[r.ref] = { stars: r.stars, note: r.note || null };
    else if (r.kind === "thread" && r.ref === threadId) thread = { stars: r.stars, note: r.note || null, at: r.at };
  }
  const ids = (mr.results || []).map((x) => x.id);
  const xs = (xr.results || [])[0] || {};
  const closed = !!xs.closed || !!xs.ending;
  const need = ids.filter((id) => !msgs[id]).length + (closed && ids.length && !thread ? 1 : 0);
  return { msgs, thread, closed, rateable: ids.length, need };
}

/** ستاره از ورودی: عدد صحیح ۱ تا ۵ (رقم فارسی هم) */
function starsOf(v) {
  const n = int(String(v == null ? "" : v).replace(/[۰-۹]/g, (d) => FA.indexOf(d)));
  if (!n || n < 1 || n > 5) throw new HttpError("امتیاز از یک تا پنج ستاره است.", 422);
  return n;
}

/**
 * امتیازِ کارشناس — POST /sp/x/rate: {kind: msg|thread|letter, msg_id | thread_id | letter_id, stars, note}.
 *   msg: پیامِ کارشناس هوشمند در گفت‌وگوی خودِ کارشناس؛ کمتر از سه ستاره علت می‌خواهد.
 *   thread: کلِ مکاتبه، بعد از بسته شدنش (یا وقتی کارِ ارجاع به کمیسیون رسیده)؛ نظر همیشه اجباری.
 *   letter: نامهٔ کمیسیونی که کارشناس هوشمند نوشته؛ نظر همیشه اجباری.
 */
export async function rate(env, ex, b = {}) {
  const kind = T(b.kind);
  const stars = starsOf(b.stars);
  const note = T(b.note).slice(0, 800);
  let ref, aid, threadId = null, what;
  if (kind === "msg") {
    const m = await env.DB.prepare(`SELECT m.id, m.thread_id, m.who, m.kind, m.meta_json, a.id AS aid, a.expert_id FROM sp_msgs m JOIN sp_threads t ON t.id=m.thread_id
        JOIN assignments a ON a.id=t.assignment_id WHERE m.id=?`).bind(int(b.msg_id) || 0).first();
    if (!m) throw new HttpError("این پیام پیدا نشد.", 404);
    if (m.expert_id !== ex.id) throw new HttpError("این پیام در گفت‌وگوی شما نیست.", 403);
    let meta = null; try { meta = m.meta_json ? JSON.parse(m.meta_json) : null; } catch (_) { meta = null; }
    if (!rateable({ who: m.who, kind: m.kind, meta })) throw new HttpError("فقط پیام‌هایی که کارشناس هوشمند برای تأمین‌کننده نوشته امتیاز می‌گیرند.", 409);
    if (stars < LOW && note.length < 3) throw new HttpError("برای کمتر از سه ستاره بنویسید چه چیزِ این پیام درست نبود.", 422, { need_note: true });
    ref = m.id; aid = m.aid; threadId = m.thread_id; what = "پیام";
  } else if (kind === "thread") {
    const x = await env.DB.prepare(`SELECT t.id, a.id AS aid, a.expert_id, ${CLOSED_SQL} AS closed,
        (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id AND i.commission_ok=1) AS ok_items,
        (SELECT COUNT(*) FROM sp_msgs m WHERE m.thread_id=t.id AND ${RATE_MSG_SQL("m")}) AS n
      FROM ai_threads x JOIN ai_runs r ON r.id=x.run_id JOIN sp_threads t ON t.id=x.thread_id JOIN assignments a ON a.id=t.assignment_id WHERE x.thread_id=?`).bind(int(b.thread_id) || 0).first();
    if (!x) throw new HttpError("این گفت‌وگو دستِ کارشناس هوشمند نبوده است.", 404);
    if (x.expert_id !== ex.id) throw new HttpError("این گفت‌وگو مالِ شما نیست.", 403);
    if (!x.n) throw new HttpError("کارشناس هوشمند در این گفت‌وگو هنوز پیامی ننوشته است.", 409);
    if (!x.closed && !x.ok_items) throw new HttpError("امتیاز به کلِ مکاتبه بعد از بسته شدنِ گفت‌وگو داده می‌شود.", 409);
    if (note.length < 3) throw new HttpError("نظرتان دربارهٔ کلِ این مکاتبه را بنویسید — اجباری است.", 422, { need_note: true });
    ref = x.id; aid = x.aid; threadId = x.id; what = "کلِ مکاتبه";
  } else if (kind === "letter") {
    const L = await env.DB.prepare(`SELECT l.id, l.state, json_extract(l.meta_json,'$.channel') AS ch, a.id AS aid, a.expert_id FROM letters l JOIN assignments a ON a.id=l.assignment_id
        WHERE l.id=?`).bind(int(b.letter_id) || 0).first();
    if (!L) throw new HttpError("این نامه پیدا نشد.", 404);
    if (L.expert_id !== ex.id) throw new HttpError("این نامه مالِ ارجاعِ شما نیست.", 403);
    if (L.ch !== "ai" || L.state !== "written") throw new HttpError("فقط نامه‌ای که کارشناس هوشمند نوشته امتیاز می‌گیرد.", 409);
    if (note.length < 3) throw new HttpError("نظرتان دربارهٔ نامه را بنویسید — اجباری است.", 422, { need_note: true });
    ref = L.id; aid = L.aid; what = "نامهٔ کمیسیون";
  } else throw new HttpError("نوعِ امتیاز نامعتبر است.");
  const t = now();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO ai_rates (kind,ref,assignment_id,thread_id,expert_id,stars,note,at) VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(kind, ref) DO UPDATE SET stars=excluded.stars, note=excluded.note, expert_id=excluded.expert_id, at=excluded.at`)
      .bind(kind, ref, aid, threadId, ex.id, stars, note || null, t),
    env.DB.prepare("INSERT INTO events (at,actor,kind,payload_json) VALUES (?,?,?,?)").bind(t, `expert:${ex.id}`, "ai_rate",
      JSON.stringify({ assignment_id: aid, thread_id: threadId, kind, ref, stars, ...(note ? { note: note.slice(0, 200) } : {}) })),
  ]);
  /* بایگانیِ بازخورد با عکسِ زمینه — برای تحلیلِ پشتیبانی و آموزشِ مدل (ai-feedback.js)؛ شکستش امتیاز را باطل نمی‌کند */
  await recordRate(env, { kind, ref, stars, note: note || null }).catch((e) => console.error("feedback rate", e && e.message));
  return { ok: true, kind, ref, stars, note: note || null, what, gaps: await rateGaps(env, aid) };
}

/**
 * آنچه پیش از «خاتمه» باید امتیاز بگیرد: {msgs: شمارِ پیام‌های بی‌امتیاز، threads: [{id, supplier}]، letter: شناسهٔ نامهٔ بی‌امتیاز یا null، total}.
 * گفت‌وگویی حساب است که کارشناس هوشمند در آن دست‌کم یک پیامِ امتیازی نوشته؛ نامه فقط آخرین نامهٔ نوشتهٔ کارشناس هوشمند.
 */
export async function rateGaps(env, aid) {
  const [mr, tr, lr] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS n FROM sp_threads t JOIN sp_msgs m ON m.thread_id=t.id WHERE t.assignment_id=? AND ${RATE_MSG_SQL("m")}
        AND NOT EXISTS (SELECT 1 FROM ai_rates q WHERE q.kind='msg' AND q.ref=m.id)`).bind(aid),
    env.DB.prepare(`SELECT t.id, s.name AS supplier FROM ai_threads x JOIN sp_threads t ON t.id=x.thread_id JOIN sp_suppliers s ON s.id=t.supplier_id
        WHERE t.assignment_id=? AND EXISTS (SELECT 1 FROM sp_msgs m WHERE m.thread_id=t.id AND ${RATE_MSG_SQL("m")})
        AND NOT EXISTS (SELECT 1 FROM ai_rates q WHERE q.kind='thread' AND q.ref=t.id) ORDER BY t.id`).bind(aid),
    env.DB.prepare(`SELECT l.id FROM letters l WHERE l.assignment_id=? AND l.state='written' AND json_extract(l.meta_json,'$.channel')='ai'
        AND NOT EXISTS (SELECT 1 FROM ai_rates q WHERE q.kind='letter' AND q.ref=l.id) ORDER BY l.id DESC LIMIT 1`).bind(aid),
  ]);
  const msgs = ((mr.results || [])[0] || {}).n || 0;
  const threads = tr.results || [];
  const letter = ((lr.results || [])[0] || {}).id || null;
  return { msgs, threads, letter, total: msgs + threads.length + (letter ? 1 : 0) };
}

/** «۳ پیام، ۱ مکاتبه (پیچ‌سازان) و نامهٔ کمیسیون» — برای پیامِ خطای «خاتمه» و بات */
export function gapText(g) {
  const parts = [];
  if (g.msgs) parts.push(`${faN(g.msgs)} پیامِ کارشناس هوشمند`);
  if (g.threads.length) parts.push(`${faN(g.threads.length)} مکاتبهٔ کامل (${g.threads.slice(0, 3).map((x) => x.supplier).join("، ")}${g.threads.length > 3 ? "، …" : ""})`);
  if (g.letter) parts.push("نامهٔ کمیسیون");
  return parts.length > 1 ? `${parts.slice(0, -1).join("، ")} و ${parts[parts.length - 1]}` : parts[0] || "";
}

/** امتیازهای اخیرِ کارشناس به پیام‌های همین گفت‌وگو — برای پروندهٔ دورِ بعدِ مذاکره (کم‌ها با علت اول) */
export async function ratesForModel(env, threadId) {
  const rows = (await env.DB.prepare(`SELECT q.stars, q.note, m.body FROM ai_rates q JOIN sp_msgs m ON m.id=q.ref WHERE q.kind='msg' AND q.thread_id=?
      ORDER BY (q.stars>=3), q.at DESC LIMIT 6`).bind(threadId).all().catch(() => null)) || {};
  return (rows.results || []).map((r) => ({ stars: r.stars, note: r.note || null, body: String(r.body || "").slice(0, 200) }));
}
