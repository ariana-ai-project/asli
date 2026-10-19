/**
 * قفل‌های «کارشناس هوشمند» برای کارشناسِ انسانی — فاز ۲ پنل پشتیبانی (مهر ۱۴۰۵، درخواست مالک).
 *
 * تیکِ «🤖 هوشمند / ✋ دستی» هر کارشناس در پنل پشتیبانی است (ai_agents.mode). وقتی «هوشمند» است:
 *   • ارجاعِ بازی که کارِ زندهٔ کارشناس هوشمند دارد — یا هنوز کاری ندارد و قلم‌به‌قلم با «🚀 شروع»ِ کارشناس سپرده می‌شود — بررسی سوابق،
 *     جستجوی هوشمند، ساختار قلم، جدول کمیسیون و نامه‌اش برای کارشناس قفل است (aiOwned). بی قیدِ زمانِ روشن شدن (مهر ۱۴۰۵، درخواست
 *     مالک): ارجاعی که وقتِ «✋ دستی» رسیده هم با «🤖 هوشمند» شدن همان لحظه هوشمند است؛ تکلیفِ کارِ دستیِ پیشینش را
 *     ai-agent.js:aiModeSet روشن می‌کند. جدول و نامه فقط وقتی قفل‌اند که کاری هست یا قلمی هنوز به کارشناس هوشمند می‌رسد
 *     (ai-modes.js:aiEndLocked).
 *   • خط‌های استعلامی که کارشناس هوشمند ساخته یا از گفت‌وگوهای او آمده تغییر نمی‌کنند (aiQuoteNames / aiQuote)؛ خطِ دستیِ
 *     خودِ کارشناس (افزودن، پیش‌فاکتور و خواندنش) آزاد است و در پنل نشانِ «✋ دستی» دارد.
 *   • گفت‌وگوهایی که کارشناس هوشمند باز کرده برای کارشناس بسته‌اند (aiThread) — مگر «پرسش از کارشناس» (state='ask'): کارشناس
 *     هوشمند سؤالی دارد که جوابش در پروندهٔ درخواست نیست؛ گفت‌وگو تا پاسخِ کارشناس برایش باز است و با پاسخ دوباره بسته می‌شود
 *     (askAnswered، از sp-core.js:postMsg).
 * «دستی» کردنِ کارشناس همهٔ این قفل‌ها را برمی‌دارد و کارهای کارشناس هوشمند همان لحظه می‌ایستند (claimRun فقط «on»)؛ پیشنهادهای
 * معطلِ «⏱ با مهلت» هم همان لحظه کنار می‌روند (ai-agent.js:aiModeSet). پنلِ باز با هر تغییر تازه می‌شود (aiRevStmt).
 * فاز ۳: اگر کارشناس هوشمند در مهلتِ پنل پشتیبانی به «حداقلِ استعلام» نرسید (ai-rules.js)، کار به کارشناس «واگذار» می‌شود
 * (ai_runs.handover_at): بررسی سوابق، جستجوی هوشمند و ساختار برایش باز می‌شود تا استعلامِ کم را بگیرد؛ جدول و نامه هنوز با
 * کارشناس هوشمند است. «رد»ِ تحویل در پنل پشتیبانی (review_json.state='rejected') درخواست را کامل به کارشناس برمی‌گرداند:
 * گفت‌وگوها و خط‌های کارشناس هوشمندِ همان درخواست هم آزاد می‌شوند.
 *
 * فاز ۴ب طرح «خرید هوشمند»: تیکِ «🤖 هوشمند»ِ مدیر در ارجاع (assignments.ai_on=0 یعنی دستی) و قفلِ قلم‌به‌قلم — قلمِ «انجام دستی»،
 * بیرون از کار یا از نوعِ «مستقیم» برای کارشناس آزاد است (ai-modes.js:aiItemFree؛ جدول و نامه همچنان برای کلِ درخواست).
 * گام ۲: در روالِ تازه (ai_runs.data_json.flow=2، و هر کارِ هنوز ساخته‌نشده) بررسی سوابق، جستجوی هوشمند و ساختارِ قلمِ
 * سپرده‌نشده کارِ خودِ کارشناس است (ai-picks.js)؛ قلمِ سپرده‌شده را انجماد نگه می‌دارد.
 * «⏱ با مهلت» (مهر ۱۴۰۵، جای «👁 حالت تأیید»؛ worker/ai-supervise.js): کارشناسی که در تنظیماتش «با مهلت» است (پیش‌فرض) گفت‌وگوهای
 * کارشناس هوشمندش را باز و فقط‌خواندنی می‌بیند: پیشنهادها را «ارسال» یا «رد» می‌کند و پیام یا تصمیمِ خودش فقط با ردِ پیشنهاد می‌رود
 * (sp-core.js:watchOnly)؛ «🤖 خودکار» یعنی بسته، مگر «🚨 پرسش از کارشناس».
 * بی ایمپورت از ماژول‌های دیگر، تا sp-core.js، sp-push.js، api.js و bot.js بی حلقهٔ ایمپورت بپرسند.
 */
const now = () => Date.now();
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };

/* سقفِ دورهای کارشناس هوشمند در هر گفت‌وگو (بازخوردِ آزمونِ مهر ۱۴۰۵): پیش‌فرض و بیشینه ۵ — پیامِ بعدیِ تأمین‌کننده که برسد، گفت‌وگو
   دستِ خودِ کارشناس است (ai-agent.js:capThread)؛ هر «🤖 برگرداندن» سقفِ تازه می‌دهد (ask_json.cap_base = شمارِ دورها در همان لحظه) */
export const TURN_CAP = 5;
/** سقفِ همین کارشناس (تنظیمِ تب، از ۱ تا TURN_CAP) */
export const turnCapOf = (configJson) => { const n = Math.round(Number((parse(configJson, {}) || {}).maxTurns)); return n >= 1 ? Math.min(TURN_CAP, n) : TURN_CAP; };
/** دورهای مصرف‌شده از آخرین برگرداندن */
export const turnsUsed = (turns, askJson) => Math.max(0, (Number(turns) || 0) - (Number((parse(askJson, {}) || {}).cap_base) || 0));

export const AI_LOCK_MSG = "🤖 این درخواست دستِ کارشناس هوشمند است و این کار را خودش انجام می‌دهد. تیکِ «هوشمند / دستی» در پنل پشتیبانی است.";
export const AI_QUOTE_MSG = "🤖 این خط استعلام را کارشناس هوشمند ساخته (یا از گفت‌وگوی او آمده) و تغییرش ممکن نیست. خطِ دستیِ خودتان را می‌توانید بیفزایید.";
/** پشتیبانی تحویلِ کارشناس هوشمند را «رد» کرده: درخواست کامل به کارشناس برگشته (review_json از ai_runs) */
export const aiRejected = (reviewJson) => (parse(reviewJson, {}) || {}).state === "rejected";
/** شرطِ SQLِ همان «رد» روی ردیفِ ai_runs با نامِ مستعارِ داده‌شده — همیشه ۰ یا ۱ (NULL زیرِ NOT همه‌چیز را باطل می‌کرد) */
export const AI_REJECTED_SQL = (r) => `COALESCE(json_extract(${r}.review_json,'$.state'),'')='rejected'`;

export const AI_THREAD_MSG = "🤖 این گفت‌وگو دستِ کارشناس هوشمند است و تا وقتی از شما سؤالی نپرسیده بسته است. تیکِ «هوشمند / دستی» در پنل پشتیبانی است.";
export const AI_WATCH_MSG = "⏱ این گفت‌وگو را کارشناس هوشمند پیش می‌برد و هر پیامش پیش از رفتن به شما نشان داده می‌شود: «✅ ارسال» همان لحظه می‌فرستد و «✏️ رد» با علت و پیامِ خودتان؛ بی‌پاسخ، سرِ مهلت خودکار می‌رود.";
/* «⏸ بی‌مهلت» (کلیدِ hold، تصمیم ۵ سند «پیام اول…»): «حالت کار»ِ نوع قلمِ اقلامِ گفت‌وگو کفِ حالت است — «ترکیبی» دست‌کم با مهلت،
   «کارشناس‌محور» بی‌مهلت؛ تغییرِ پشتیبانی (cr_head_x، field='workflow') بر دادهٔ تحقیق مقدم است */
export const HOLD_ON_SQL = "COALESCE((SELECT json_extract(value,'$.hold') FROM settings WHERE key='crFlags'),0)=1";
export const WF_SQL = (h) => `COALESCE((SELECT json_extract(x.value,'$') FROM cr_head_x x WHERE x.head=${h}.head AND x.field='workflow' AND x.active=1 ORDER BY x.at DESC LIMIT 1), ${h}.workflow)`;
/** نوع قلمِ هر خطِ گفت‌وگو: همان که با بسته رفته (sp_lines.head)، وگرنه ساختارِ قلم */
export const LINE_HEAD_SQL = (l) => `COALESCE(NULLIF(${l}.head,''), (SELECT json_extract(si.norm_json,'$.head') FROM items si WHERE si.id=${l}.item_id))`;
/**
 * گفت‌وگوی «⏱ با مهلت» یا «⏸ بی‌مهلت»: کارشناسِ فعلیِ ارجاعِ این گفت‌وگو «🤖 خودکار» نیست (بی تنظیم = با مهلت)، یا کلیدِ hold روشن
 * است و نوع قلمِ یکی از خط‌هایش «ترکیبی» یا «کارشناس‌محور» است — tid عبارتِ SQLِ شناسهٔ گفت‌وگو. جست‌وجوها با کلیدِ اصلی و
 * نمایه‌اند؛ در فهرست و نظرسنجیِ مکاتبات هم ارزان است.
 */
export const AI_SUP_SQL = (tid) => `EXISTS (SELECT 1 FROM sp_threads st JOIN assignments sa ON sa.id=st.assignment_id JOIN experts se ON se.id=sa.expert_id
  WHERE st.id=${tid} AND (COALESCE(json_extract(se.sup_json,'$.mode'),'timer')<>'auto' OR (${HOLD_ON_SQL} AND EXISTS (SELECT 1 FROM sp_lines sl
    JOIN cr_heads ch ON ch.head=${LINE_HEAD_SQL("sl")} WHERE sl.thread_id=st.id AND ${WF_SQL("ch")} IN ('ترکیبی','کارشناس‌محور')))))`;

/**
 * نسخهٔ «تکلیفِ درخواست‌های» یک کارشناس (ai_agents.rev): هر تغییری که هوشمند یا دستی بودنِ درخواست‌هایش را عوض می‌کند — تیکِ
 * پشتیبانی، تیکِ مدیر روی ارجاع، «انجام دستی»ِ تأییدشده و ردِ تحویل — یکی جلویش می‌برد؛ پنل کارشناس و مکاتبات از /sp/x/inbox
 * (کلیدِ اصلی، هر ۱۰ ثانیه) می‌فهمند و همان لحظه تازه می‌شوند. statement برای batchِ صدازننده.
 */
export const aiRevStmt = (env, expertId) => env.DB.prepare("UPDATE ai_agents SET rev=rev+1 WHERE expert_id=?").bind(expertId);

/** کارشناس «هوشمند» است؟ */
export async function aiModeOn(env, expertId) {
  if (!expertId) return false;
  const r = await env.DB.prepare("SELECT mode FROM ai_agents WHERE expert_id=?").bind(expertId).first().catch(() => null);
  return !!(r && r.mode === "on");
}

/**
 * ارجاعِ دستِ کارشناس هوشمند: کارشناسش «هوشمند» است، مدیر تیکِ «🤖»ِ ارجاع را برنداشته (COALESCE(ai_on,1)=1) و یا کارِ زنده (ai_runs بی
 * finished_at) روی همین ارجاع هست، یا ارجاع ارسال شده و هنوز بسته نیست — هر وقت که رسیده باشد (on_at فقط برای نمایشِ «هوشمند از …»).
 * خروجی {run_id, state, handover} یا null. handover: مهلتِ حدِ استعلام گذشت و کار به کارشناس واگذار شد — فقط قفلِ جدول و نامه می‌ماند
 * (aiResearchLocked). همین قاعده در SQL: AI_OWNED_SQL (کارتابل).
 */
export async function aiOwned(env, assignmentId) {
  if (!assignmentId) return null;
  const r = await env.DB.prepare(`SELECT a.expert_id, a.dispatched_at, a.closed_at, a.ai_on, g.mode, x.id AS run_id, x.expert_id AS run_expert, x.state, x.finished_at, x.handover_at,
        json_extract(x.data_json,'$.flow') AS flow
      FROM assignments a JOIN ai_agents g ON g.expert_id=a.expert_id LEFT JOIN ai_runs x ON x.assignment_id=a.id WHERE a.id=?`)
    .bind(assignmentId).first().catch(() => null);
  if (!r || r.mode !== "on") return null;
  /* فاز ۴ب: مدیر در ارجاع تیکِ «🤖 هوشمند» را برداشته — درخواست کاملاً دستِ خودِ کارشناس است */
  if (r.ai_on === 0) return null;
  /* کارِ همین ارجاع پیش‌تر مالِ کارشناسِ دیگری بود (تغییر کارشناس): کارشناس هوشمند دوباره برش نمی‌دارد، پس قفل هم نیست */
  if (r.run_id) return r.finished_at || r.run_expert !== r.expert_id ? null : { run_id: r.run_id, state: r.state, handover: r.handover_at || null, flow: Number(r.flow) || 1 };
  /* کارِ تازه همیشه روالِ تازه است (فاز ۴ب گام ۲: فهرستِ دعوتِ کارشناس) — بی قیدِ زمان: ارجاعی که وقتِ «✋ دستی» رسیده هم */
  return r.dispatched_at && !r.closed_at ? { run_id: null, state: "pending", handover: null, flow: 2 } : null;
}
/**
 * همان قاعدهٔ aiOwned در یک ستون — a: assignments؛ ۰ (نه)، ۱ (دستِ کارشناس هوشمند) یا ۲ (کارِ واگذارشده). کارتابل نشانِ 🤖 می‌زند.
 * ai_agents با کلیدِ اصلی و ai_runs با کلیدِ یکتای assignment_id — در نظرسنجیِ کارتابل هم ارزان.
 */
export const AI_OWNED_SQL = `(SELECT CASE WHEN g.mode<>'on' THEN 0 WHEN a.ai_on=0 THEN 0
    WHEN EXISTS (SELECT 1 FROM ai_runs x WHERE x.assignment_id=a.id) THEN (SELECT CASE WHEN x.finished_at IS NULL AND x.expert_id=a.expert_id THEN (CASE WHEN x.handover_at IS NULL THEN 1 ELSE 2 END) ELSE 0 END FROM ai_runs x WHERE x.assignment_id=a.id)
    WHEN a.dispatched_at IS NOT NULL AND a.closed_at IS NULL THEN 1 ELSE 0 END FROM ai_agents g WHERE g.expert_id=a.expert_id)`;
/**
 * بررسی سوابق، جستجوی هوشمند و ساختارِ قلم قفل است؟ فقط در کارِ زندهٔ روالِ پیشین و پیش از «واگذاری» (جدول و نامه با
 * ai-modes.js:aiEndLocked قفل می‌مانند). روالِ تازه (فاز ۴ب گام ۲): بررسی سوابق و جستجوی هوشمند کارِ خودِ کارشناس است — فهرستِ دعوتِ هر قلم را او می‌چیند.
 */
export const aiResearchLocked = (owned) => !!owned && !!owned.run_id && owned.flow !== 2 && !owned.handover;

/**
 * گفت‌وگوی کارشناس هوشمند برای کارشناسِ فعلیِ آن: {ai, locked, ask, watch}. ai: کارشناس هوشمند بازش کرده؛ locked: کارشناس «هوشمند»
 * است و سؤالی منتظرِ او نیست؛ ask: {q, at} وقتی کارشناس هوشمند از او پرسیده؛ watch: «⏱ با مهلت» — باز ولی فقط‌خواندنی.
 */
export async function aiThread(env, threadId, expertId) {
  const r = await env.DB.prepare(`SELECT x.state, x.ask_json, x.turns, x.run_id, run.expert_id AS run_expert, run.review_json, g.mode, g.config_json, ${AI_SUP_SQL("x.thread_id")} AS sup
      FROM ai_threads x JOIN ai_runs run ON run.id=x.run_id LEFT JOIN ai_agents g ON g.expert_id=? WHERE x.thread_id=?`).bind(expertId || 0, threadId).first().catch(() => null);
  if (!r) return { ai: false, locked: false, ask: null, watch: false };
  /* ارجاع به کارشناسِ دیگری رفته (کارِ کارشناس هوشمند بسته شد)، کارشناس «دستی» است، یا پشتیبانی تحویل را رد کرد: باز */
  if (r.mode !== "on" || r.run_expert !== expertId || aiRejected(r.review_json)) return { ai: true, locked: false, ask: null, watch: false };
  /* دورهای کارشناس هوشمند در این گفت‌وگو از سقفش — چیپِ «🤖 n از ۵» و نوارِ «✋ سقف پر شد» */
  const turns = { used: turnsUsed(r.turns, r.ask_json), max: turnCapOf(r.config_json) };
  /* «🚨 باز کردنِ اضطراری» (ai-takeover.js) یا سقفِ دورها (ai-agent.js:capThread): کارشناس خودش ادامه می‌دهد؛ کارشناس هوشمند در این
     گفت‌وگو جواب نمی‌دهد. cap: وقتی آخرین سپردن از سقف بوده */
  if (r.state === "human") {
    const a = parse(r.ask_json, {}) || {};
    const cap = a.cap && (!a.takeover || Number(a.cap.at) > Number(a.takeover.at)) ? a.cap : null;
    return { ai: true, locked: false, ask: null, watch: false, human: true, cap, turns };
  }
  const ask = r.state === "ask" ? parse(r.ask_json, {}) : null;
  const watch = !!r.sup;
  return { ai: true, locked: !ask && !watch, ask, watch, turns };
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
  /* فقط نامِ تأمین‌کنندهٔ گفت‌وگوهای او ملاک است — دعوتش خط و گفت‌وگو را با هم می‌سازد (ai-agent.js:inviteOne). source نه: «استخراج»ِ
     پیش‌فاکتورِ خودِ کارشناس هم پیش‌تر source='ai' می‌گرفت؛ حالا source='extract' است (proforma.js) و خط‌های قدیمی هم آزادند */
  return (names || (await aiQuoteNames(env, q.assignment_id))).has(q.supplier_name);
}

export const AI_LIVE_MSG = "🤖 کارشناس هوشمند همین حالا با این تأمین‌کننده مذاکره می‌کند؛ تا تمام شدنِ مذاکره یا «🚨 باز کردنِ اضطراری» این خط دستی عوض نمی‌شود.";
/* گفت‌وگویی که مذاکره‌اش تمام شده (یا دستِ خودِ کارشناس است) دیگر «زنده» نیست */
const DONE_STATES = "('final','declined','closed','human')";
/** نامِ تأمین‌کنندگانی که کارشناس هوشمند همین حالا در این ارجاع با آن‌ها مذاکره می‌کند */
export async function aiQuoteLiveNames(env, assignmentId) {
  const rows = (await env.DB.prepare(`SELECT DISTINCT s.name FROM ai_threads x JOIN ai_runs r ON r.id=x.run_id JOIN sp_threads t ON t.id=x.thread_id JOIN sp_suppliers s ON s.id=t.supplier_id
      JOIN assignments a ON a.id=t.assignment_id JOIN ai_agents g ON g.expert_id=a.expert_id AND g.mode='on'
      WHERE t.assignment_id=? AND x.state NOT IN ${DONE_STATES} AND r.finished_at IS NULL AND NOT ${AI_REJECTED_SQL("r")}`).bind(assignmentId).all().catch(() => null)) || {};
  return new Set((rows.results || []).map((r) => r.name));
}
/**
 * خطِ استعلامی که کارشناس هوشمند همین حالا رویش مذاکره می‌کند (درخواست مالک، مهر ۱۴۰۵: بقیهٔ خط‌ها، حتی خطِ کارشناس هوشمند بعد از
 * پایانِ مذاکره، دستی پر و ویرایش می‌شوند و منبعِ هر خانه ثبت می‌شود — api.js:quoteUpdate)
 */
export async function aiQuoteLive(env, q) {
  if (!q || !(await aiQuote(env, q))) return false;
  return (await aiQuoteLiveNames(env, q.assignment_id)).has(q.supplier_name);
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
