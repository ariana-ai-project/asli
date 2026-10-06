/**
 * قفل‌های «کارشناس هوشمند» برای کارشناسِ انسانی — فاز ۲ پنل پشتیبانی (مهر ۱۴۰۵، درخواست مالک).
 *
 * تیکِ «🤖 هوشمند / ✋ دستی» هر کارشناس در پنل پشتیبانی است (ai_agents.mode). وقتی «هوشمند» است:
 *   • ارجاعی که کارِ زندهٔ کارشناس هوشمند دارد — یا بعد از روشن شدن رسیده و Cron به‌زودی برش می‌دارد — بررسی سوابق،
 *     جستجوی هوشمند، ساختار قلم، جدول کمیسیون و نامه‌اش برای کارشناس قفل است (aiOwned).
 *   • خط‌های استعلامی که کارشناس هوشمند ساخته یا از گفت‌وگوهای او آمده تغییر نمی‌کنند (aiQuoteNames / aiQuote)؛ خطِ دستیِ
 *     خودِ کارشناس (افزودن، پیش‌فاکتور و خواندنش) آزاد است و در پنل نشانِ «✋ دستی» دارد.
 *   • گفت‌وگوهایی که کارشناس هوشمند باز کرده برای کارشناس بسته‌اند (aiThread) — مگر «پرسش از کارشناس» (state='ask'): کارشناس
 *     هوشمند سؤالی دارد که جوابش در پروندهٔ درخواست نیست؛ گفت‌وگو تا پاسخِ کارشناس برایش باز است و با پاسخ دوباره بسته می‌شود
 *     (askAnswered، از sp-core.js:postMsg).
 * «دستی» کردنِ کارشناس همهٔ این قفل‌ها را برمی‌دارد و کارهای کارشناس هوشمند همان لحظه می‌ایستند (claimRun فقط «on»).
 * فاز ۳: اگر کارشناس هوشمند در مهلتِ پنل پشتیبانی به «حداقلِ استعلام» نرسید (ai-rules.js)، کار به کارشناس «واگذار» می‌شود
 * (ai_runs.handover_at): بررسی سوابق، جستجوی هوشمند و ساختار برایش باز می‌شود تا استعلامِ کم را بگیرد؛ جدول و نامه هنوز با
 * کارشناس هوشمند است. «رد»ِ تحویل در پنل پشتیبانی (review_json.state='rejected') درخواست را کامل به کارشناس برمی‌گرداند:
 * گفت‌وگوها و خط‌های کارشناس هوشمندِ همان درخواست هم آزاد می‌شوند.
 *
 * بی ایمپورت از ماژول‌های دیگر، تا sp-core.js، sp-push.js، api.js و bot.js بی حلقهٔ ایمپورت بپرسند.
 */
const now = () => Date.now();
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };

export const AI_LOCK_MSG = "🤖 این درخواست دستِ کارشناس هوشمند است و این کار را خودش انجام می‌دهد. تیکِ «هوشمند / دستی» در پنل پشتیبانی است.";
export const AI_QUOTE_MSG = "🤖 این خط استعلام را کارشناس هوشمند ساخته (یا از گفت‌وگوی او آمده) و تغییرش ممکن نیست. خطِ دستیِ خودتان را می‌توانید بیفزایید.";
/** پشتیبانی تحویلِ کارشناس هوشمند را «رد» کرده: درخواست کامل به کارشناس برگشته (review_json از ai_runs) */
export const aiRejected = (reviewJson) => (parse(reviewJson, {}) || {}).state === "rejected";
/** شرطِ SQLِ همان «رد» روی ردیفِ ai_runs با نامِ مستعارِ داده‌شده — همیشه ۰ یا ۱ (NULL زیرِ NOT همه‌چیز را باطل می‌کرد) */
export const AI_REJECTED_SQL = (r) => `COALESCE(json_extract(${r}.review_json,'$.state'),'')='rejected'`;

export const AI_THREAD_MSG = "🤖 این گفت‌وگو دستِ کارشناس هوشمند است و تا وقتی از شما سؤالی نپرسیده بسته است. تیکِ «هوشمند / دستی» در پنل پشتیبانی است.";

/** کارشناس «هوشمند» است؟ */
export async function aiModeOn(env, expertId) {
  if (!expertId) return false;
  const r = await env.DB.prepare("SELECT mode FROM ai_agents WHERE expert_id=?").bind(expertId).first().catch(() => null);
  return !!(r && r.mode === "on");
}

/**
 * ارجاعِ دستِ کارشناس هوشمند: کارشناسش «هوشمند» است و یا کارِ زنده (ai_runs بی finished_at) روی همین ارجاع هست، یا ارجاع
 * بعد از روشن شدن ارسال شده و هنوز بسته نیست (Cron در دقیقهٔ بعد برش می‌دارد). خروجی {run_id, state, handover} یا null.
 * handover: مهلتِ حدِ استعلام گذشت و کار به کارشناس واگذار شد — فقط قفلِ جدول و نامه می‌ماند (aiResearchLocked).
 */
export async function aiOwned(env, assignmentId) {
  if (!assignmentId) return null;
  const r = await env.DB.prepare(`SELECT a.expert_id, a.dispatched_at, a.closed_at, g.mode, g.on_at, x.id AS run_id, x.expert_id AS run_expert, x.state, x.finished_at, x.handover_at
      FROM assignments a JOIN ai_agents g ON g.expert_id=a.expert_id LEFT JOIN ai_runs x ON x.assignment_id=a.id WHERE a.id=?`)
    .bind(assignmentId).first().catch(() => null);
  if (!r || r.mode !== "on") return null;
  /* کارِ همین ارجاع پیش‌تر مالِ کارشناسِ دیگری بود (تغییر کارشناس): کارشناس هوشمند دوباره برش نمی‌دارد، پس قفل هم نیست */
  if (r.run_id) return r.finished_at || r.run_expert !== r.expert_id ? null : { run_id: r.run_id, state: r.state, handover: r.handover_at || null };
  return r.dispatched_at && r.dispatched_at >= (r.on_at || 0) && !r.closed_at ? { run_id: null, state: "pending", handover: null } : null;
}
/** بررسی سوابق، جستجوی هوشمند و ساختارِ قلم قفل است؟ — نه بعد از «واگذاری» (جدول و نامه با aiOwned قفل می‌مانند) */
export const aiResearchLocked = (owned) => !!owned && !owned.handover;

/**
 * گفت‌وگوی کارشناس هوشمند برای کارشناسِ فعلیِ آن: {ai, locked, ask}. ai: کارشناس هوشمند بازش کرده؛ locked: کارشناس «هوشمند»
 * است و سؤالی منتظرِ او نیست؛ ask: {q, at} وقتی کارشناس هوشمند از او پرسیده.
 */
export async function aiThread(env, threadId, expertId) {
  const r = await env.DB.prepare(`SELECT x.state, x.ask_json, x.run_id, run.expert_id AS run_expert, run.review_json, g.mode FROM ai_threads x JOIN ai_runs run ON run.id=x.run_id
      LEFT JOIN ai_agents g ON g.expert_id=? WHERE x.thread_id=?`).bind(expertId || 0, threadId).first().catch(() => null);
  if (!r) return { ai: false, locked: false, ask: null };
  /* ارجاع به کارشناسِ دیگری رفته (کارِ کارشناس هوشمند بسته شد)، کارشناس «دستی» است، یا پشتیبانی تحویل را رد کرد: باز */
  if (r.mode !== "on" || r.run_expert !== expertId || aiRejected(r.review_json)) return { ai: true, locked: false, ask: null };
  const ask = r.state === "ask" ? parse(r.ask_json, {}) : null;
  return { ai: true, locked: !ask, ask };
}

/** نام تأمین‌کنندگانی که خط‌هایشان در این ارجاع مالِ کارشناس هوشمند است (دعوت یا گفت‌وگوی او) — فقط وقتی کارشناس «هوشمند» است */
export async function aiQuoteNames(env, assignmentId) {
  const rows = (await env.DB.prepare(`SELECT DISTINCT s.name FROM ai_threads x JOIN ai_runs r ON r.id=x.run_id JOIN sp_threads t ON t.id=x.thread_id JOIN sp_suppliers s ON s.id=t.supplier_id
      JOIN assignments a ON a.id=t.assignment_id JOIN ai_agents g ON g.expert_id=a.expert_id AND g.mode='on' WHERE t.assignment_id=? AND NOT ${AI_REJECTED_SQL("r")}`).bind(assignmentId).all().catch(() => null)) || {};
  return new Set((rows.results || []).map((r) => r.name));
}

/** این خط استعلام مالِ کارشناس هوشمند است؟ q: {assignment_id, supplier_name, source} */
export async function aiQuote(env, q, names) {
  if (!q) return false;
  const a = await env.DB.prepare("SELECT g.mode, r.review_json FROM assignments a JOIN ai_agents g ON g.expert_id=a.expert_id LEFT JOIN ai_runs r ON r.assignment_id=a.id WHERE a.id=?").bind(q.assignment_id).first().catch(() => null);
  if (!a || a.mode !== "on" || aiRejected(a.review_json)) return false;
  if (q.source === "ai") return true;
  return (names || (await aiQuoteNames(env, q.assignment_id))).has(q.supplier_name);
}

/**
 * شرطِ SQLِ «پرسش از کارشناس»ِ بی‌پاسخی که منتظرِ کارشناس است (x: ai_threads، a: assignments) — همان قاعدهٔ aiThread: کارشناس
 * «هوشمند» است و کار مالِ خودش. «دستی» که شد گفت‌وگو به‌هرحال باز است و 🚨 نمی‌خواهد.
 */
export const AI_ASK_SQL = `x.state='ask' AND EXISTS (SELECT 1 FROM ai_runs ar JOIN ai_agents ag ON ag.expert_id=ar.expert_id AND ag.mode='on'
  WHERE ar.id=x.run_id AND ar.expert_id=a.expert_id)`;

/** شمارِ «پرسش از کارشناس»های بی‌پاسخِ یک کارشناس — نشانِ 🚨 کنارِ «مکاتبات» */
export async function aiAsks(env, expertId) {
  const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ai_threads x JOIN sp_threads t ON t.id=x.thread_id JOIN assignments a ON a.id=t.assignment_id
      WHERE a.expert_id=? AND ${AI_ASK_SQL}`).bind(expertId).first().catch(() => null);
  return r ? r.n : 0;
}

/**
 * پاسخِ کارشناس به «پرسش از کارشناس»: هر پیامِ کارشناسِ انسانی در گفت‌وگویی که منتظرِ اوست، گفت‌وگو را دوباره دستِ
 * کارشناس هوشمند می‌دهد (و قفل می‌کند). کارشناس هوشمند دورِ بعد پاسخ را در گفت‌وگو می‌بیند و کار را پیش می‌برد.
 */
export async function askAnswered(env, threadId, msgId) {
  const t = now();
  const r = await env.DB.prepare(`UPDATE ai_threads SET state='active', ask_json=json_set(COALESCE(ask_json,'{}'),'$.answered_at',?,'$.answer_msg',?), updated_at=?
      WHERE thread_id=? AND state='ask' RETURNING run_id`).bind(t, msgId || null, t, threadId).first().catch(() => null);
  if (!r) return false;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO ai_log (run_id,thread_id,at,kind,body) VALUES (?,?,?,'ask',?)").bind(r.run_id, threadId, t, "پاسخِ کارشناس رسید؛ گفت‌وگو دوباره دستِ کارشناس هوشمند است."),
    env.DB.prepare(`INSERT INTO events (at,actor,kind,request_id,payload_json) SELECT ?, 'expert:' || a.expert_id, 'ai_answer', t.request_id,
        json_object('assignment_id', a.id, 'thread_id', t.id, 'supplier', s.name) FROM sp_threads t JOIN assignments a ON a.id=t.assignment_id
        JOIN sp_suppliers s ON s.id=t.supplier_id WHERE t.id=?`).bind(t, threadId),
    env.DB.prepare("UPDATE ai_runs SET next_at=? WHERE id=? AND finished_at IS NULL AND next_at>?").bind(t, r.run_id, t),
  ]).catch(() => {});
  return true;
}
