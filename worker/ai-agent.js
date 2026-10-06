/**
 * کارشناس هوشمند (مهر ۱۴۰۵، کارشناس «test») — کارشناسی که ردیفِ ai_agents دارد و «خودکار»ش روشن است، کارِ هر ارجاعِ
 * تازه‌اش را خودِ سامانه انجام می‌دهد:
 *   ۱. آماده‌سازیِ هر قلم: ساختار (نوع قلم و لایه‌ها) و «بررسی سوابق» — همان itemHistory پنل.
 *   ۲. «جستجوی هوشمند» هر قلم — همان smartSearch پنل و بات (جستجوی تازهٔ همان قلم در چند روزِ اخیر دوباره خرج نمی‌شود).
 *   ۳. دعوت — فقط تأمین‌کنندگانی که دست‌کم یک «شمارهٔ پنل» تیک‌خورده دارند. تیک را فقط انسان می‌زند (تب کارشناس
 *      هوشمند): نامزدها از سوابق و جستجو، و هر تأمین‌کننده‌ای که کارشناس دستی به همان درخواست افزوده. قالبِ استاندارد +
 *      لینک پنل و بات (spSend)، و پیامک فقط به شماره‌های تیک‌خورده — پیش از هر پیامک تیک دوباره سنجیده می‌شود.
 *   ۴. مذاکره در هر گفت‌وگو: مدل (ai-prompts.js) پرونده را می‌خواند، پاسخ می‌دهد و تصمیم می‌گیرد — تأیید، برگشت، رد،
 *      پذیرش مغایرت، تأیید نهایی — با همان توابعِ صفحهٔ مکاتبات. پیش‌فاکتور اول با همان «خوانش هوشمند» خوانده می‌شود.
 *   ۵. پایان (هر قلم به «حداقلِ استعلامِ» خودش رسیده — قواعدِ پنل پشتیبانی، ai-rules.js — و سکوتِ تأمین‌کنندگان یا «پایان»
 *      از پنل): شرحِ فرایند، چالش‌ها و معیار انتخاب ← نامه، و جدول کمیسیون — به تلگرام کارشناس، و «تحویل» در پنل پشتیبانی
 *      برای تأیید یا ردِ کمیسیون (فاز ۳). اگر در مهلتِ قواعد به حد نرسید، کار به کارشناس «واگذار» می‌شود (handOver).
 * همه با Cron، یک گام در هر اجرا (سقف ۵۰ زیردرخواست و ۱۰ms CPU پلن رایگان)، با قفل روی هر اجرا و هر گفت‌وگو. کارِ
 * تأمین‌کننده (پیام، ارسال، پیش‌فاکتور) گامِ همان گفت‌وگو را بلافاصله هم می‌زند (waitUntil، زیر ۳۰ ثانیه).
 * شفافیت: هر فراخوانیِ مدل با پرامپتِ دقیق، پاسخ و تخمین هزینه در ai_calls؛ هر گام در ai_log؛ هر پیامک در sp_sms؛ و همهٔ
 * گفت‌وگوها با برچسب در یک فایل md در انبار (ai-md.js). «خاموش» کردن هر کاری را همان لحظه نگه می‌دارد.
 */
import { HttpError } from "./http.js";
import { telegram, esc } from "./telegram.js";
import { storage, storageKey } from "./storage.js";
import { itemHistory } from "./history.js";
import { normalizeItem, normOf } from "./normalize.js";
import { smartSearch, MARKETS, MAX_MARKETS } from "./discovery.js";
import { itemSearches } from "./records.js";
import * as C from "./sp-core.js";
import * as P from "./sp-push.js";
import { deliverSms } from "./sp-sms.js";
import { smsReady, isMobile } from "./sms.js";
import { runAiCheck, aiUsable, resolve, acceptable } from "./sp-ai.js";
import { bundleData, recordCommission } from "./bundle.js";
import { commissionXlsx } from "./sheets.js";
import { writeLetter } from "./letter.js";
import { renderLetter } from "./docx.js";
import { getSettings } from "./settings.js";
import { fmtFa } from "./time.js";
import { negotiate, negotiationContext, closingReport, replayCall, AGENT_MODEL, AGENT_MODELS, EFFORTS, modelOk } from "./ai-prompts.js";
import { threadSection, runMd, SOURCE_FA } from "./ai-md.js";
import { estimateCost } from "./ai-fetch.js";
import { AI_ASK_SQL } from "./ai-lock.js";
import { getRules, saveRules, coverOf, DIMS, DIM_FA, DIM_UNIT } from "./ai-rules.js";
import { expertAppUrl } from "./tg-nav.js";
import { setCommission } from "./support.js";
import { queueStmt } from "./queue.js";

const now = () => Date.now();
const T = (v) => String(v == null ? "" : v).trim();
const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const FA = "۰۱۲۳۴۵۶۷۸۹";
const faN = (s) => String(s).replace(/\d/g, (d) => FA[+d]);
const clip = (s, n) => (s == null ? null : String(s).length > n ? `${String(s).slice(0, n)}…[بریده شد]` : String(s));
const COMPANY = (env) => C.COMPANY(env);
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/* ------------------------------------------------------------------ */
/* طرح جدول‌ها (هر دستور یک سطر)                                         */
/* ------------------------------------------------------------------ */
export const AI_DDL = `
CREATE TABLE IF NOT EXISTS ai_agents (expert_id INTEGER PRIMARY KEY, mode TEXT NOT NULL DEFAULT 'off', on_at INTEGER, config_json TEXT, updated_at INTEGER NOT NULL, updated_by TEXT);
CREATE TABLE IF NOT EXISTS ai_runs (id INTEGER PRIMARY KEY, assignment_id INTEGER NOT NULL UNIQUE, expert_id INTEGER NOT NULL, request_id TEXT, state TEXT NOT NULL DEFAULT 'prep', data_json TEXT, manual_json TEXT, finish_at INTEGER, paused_from TEXT, md_key TEXT, md_at INTEGER, next_at INTEGER NOT NULL DEFAULT 0, lock_until INTEGER, error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, finished_at INTEGER);
CREATE INDEX IF NOT EXISTS ix_airun_due ON ai_runs(next_at) WHERE finished_at IS NULL;
CREATE TABLE IF NOT EXISTS ai_threads (thread_id INTEGER PRIMARY KEY, run_id INTEGER NOT NULL, source TEXT, state TEXT NOT NULL DEFAULT 'invited', seen_msg INTEGER NOT NULL DEFAULT 0, lock_until INTEGER, retry_at INTEGER, fails INTEGER NOT NULL DEFAULT 0, turns INTEGER NOT NULL DEFAULT 0, memo TEXT, errors_json TEXT, last_ai_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_aith_run ON ai_threads(run_id);
CREATE TABLE IF NOT EXISTS ai_calls (id INTEGER PRIMARY KEY, run_id INTEGER, thread_id INTEGER, expert_id INTEGER, purpose TEXT NOT NULL, model TEXT, effort TEXT, request_json TEXT, response_json TEXT, in_tok INTEGER, out_tok INTEGER, cache_read INTEGER, cache_write INTEGER, cost_usd REAL, ms INTEGER, status TEXT, error TEXT, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_aicall_exp ON ai_calls(expert_id, id);
CREATE TABLE IF NOT EXISTS ai_log (id INTEGER PRIMARY KEY, run_id INTEGER NOT NULL, thread_id INTEGER, at INTEGER NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL, meta_json TEXT);
CREATE INDEX IF NOT EXISTS ix_ailog_run ON ai_log(run_id, id);
`;

/* تنظیماتِ هر کارشناس هوشمند (تب کارشناس هوشمند). minInvites فقط هدف است: بی شمارهٔ پنل دعوتی نمی‌رود */
/* model و effort: مدلِ مذاکره و شرحِ پایانی و «عمق فکر»ش — از تب (ai-prompts.js:AGENT_MODELS) */
export const AI_DEFAULTS = { minInvites: 5, maxInvites: 10, markets: ["IR"], quietMin: 30, maxTurns: 30, maxItems: 10, reuseDays: 14, model: AGENT_MODEL, effort: "medium" };
const LIMITS = { minInvites: [1, 20], maxInvites: [1, 30], quietMin: [5, 10080], maxTurns: [3, 80], maxItems: [1, 20], reuseDays: [0, 60] };
const LOCK_LONG = 16 * 60000;           /* جستجوی هوشمند چند دقیقه طول می‌کشد؛ سقف Cron ۱۵ دقیقه */
const LOCK_STEP = 4 * 60000;
const THREAD_LOCK = 3 * 60000;
/* هر دعوت حدود ۲۵ زیردرخواست دارد (ارسال، پیامک، پخش، ثبت) — یکی در هر اجرا تا زیر سقفِ ۵۰ بماند */
const INVITES_PER_TICK = 1;
const STATE_FA = { prep: "آماده‌سازی و بررسی سوابق", search: "جستجوی هوشمند", work: "دعوت و مذاکره", closing: "جدول کمیسیون و نامه", done: "پایان‌یافته", paused: "متوقف", ended: "بسته شد" };
const PURPOSE_FA = { normalize: "تفکیک قلم (نوع و لایه‌ها)", smart: "جستجوی هوشمند", proforma: "خوانش پیش‌فاکتور", negotiate: "مذاکره", closing: "شرح فرایند و معیارها", letter: "نگارش نامه", compare: "مقایسهٔ مدل (بی اجرا)" };

export function cfgOf(row) {
  const c = { ...AI_DEFAULTS, ...parse(row && row.config_json, {}) };
  for (const [k, [lo, hi]] of Object.entries(LIMITS)) c[k] = Math.min(hi, Math.max(lo, Number(c[k]) || AI_DEFAULTS[k]));
  if (c.maxInvites < c.minInvites) c.maxInvites = c.minInvites;
  c.markets = (Array.isArray(c.markets) ? c.markets : []).filter((k) => MARKETS.some((m) => m.key === k)).slice(0, MAX_MARKETS);
  if (!c.markets.length) c.markets = ["IR"];
  if (!modelOk(c.model)) c.model = AGENT_MODEL;
  if (!EFFORTS.includes(c.effort)) c.effort = "medium";
  return c;
}
export const agentOf = (env, expertId) => env.DB.prepare("SELECT * FROM ai_agents WHERE expert_id=?").bind(expertId).first().catch(() => null);

const logStmt = (env, runId, threadId, kind, body, meta) =>
  env.DB.prepare("INSERT INTO ai_log (run_id,thread_id,at,kind,body,meta_json) VALUES (?,?,?,?,?,?)").bind(runId, threadId || null, now(), kind, clip(body, 2000), meta ? JSON.stringify(meta) : null);
const log = (env, runId, threadId, kind, body, meta) => logStmt(env, runId, threadId, kind, body, meta).run().catch((e) => console.error("ai log", e && e.message));
const saveData = (env, run, extra = "") => env.DB.prepare(`UPDATE ai_runs SET data_json=?, updated_at=?${extra} WHERE id=?`).bind(JSON.stringify(run.data), now(), run.id);

/* ------------------------------------------------------------------ */
/* ضبطِ فراخوانی‌های مدل                                                  */
/* ------------------------------------------------------------------ */
/** env‌ای که aiFetch با آن هر فراخوانی را ضبط می‌کند؛ purpose و thread را صدازننده پیش از هر کار می‌گذارد */
function recorder(env) {
  const rec = { calls: [], purpose: "?", thread: null };
  rec.env = { ...env, __aiRec: (e) => rec.calls.push({ ...e, purpose: rec.purpose, thread: rec.thread }) };
  return rec;
}
/** فراخوانی‌های ضبط‌شده ← ai_calls (یک batch). usage و cost برای پاسخِ جریانی را صدازننده روی همان ورودی گذاشته است */
async function flushCalls(env, run, expertId, rec) {
  const stmts = rec.calls.splice(0).map((c) => {
    const req = parse(c.request, null), res = parse(c.response, null);
    const model = (res && res.model) || (req && req.model) || null;
    const u = c.usage || (res && res.usage) || null;
    const cost = c.cost != null ? c.cost : estimateCost(model, u);
    return env.DB.prepare(`INSERT INTO ai_calls (run_id,thread_id,expert_id,purpose,model,effort,request_json,response_json,in_tok,out_tok,cache_read,cache_write,cost_usd,ms,status,error,at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(run ? run.id : null, c.thread || null, expertId, c.purpose || "?", model,
      (req && req.output_config && req.output_config.effort) || null, clip(c.request, 150000), clip(c.stream ? "(پاسخِ جریانی؛ نتیجه در تب جستجوی هوشمند)" : c.response, 80000),
      u ? u.input_tokens || 0 : null, u ? u.output_tokens || 0 : null, u ? u.cache_read_input_tokens || 0 : null, u ? u.cache_creation_input_tokens || 0 : null,
      cost == null ? null : Math.round(cost * 1e6) / 1e6, c.ms || null, c.error ? "error" : String(c.status || ""), clip(c.error, 500), c.at || now());
  });
  if (stmts.length) await env.DB.batch(stmts).catch((e) => console.error("ai calls", e && e.message));
}

/* ------------------------------------------------------------------ */
/* اجرا: ساختن و برداشتن                                                 */
/* ------------------------------------------------------------------ */
/** ارجاع‌های تازهٔ کارشناس‌های هوشمندِ روشن — فقط ارسال‌شده بعد از روشن شدن؛ قدیمی‌ترها با «▶️ شروع» در تب */
async function discover(env) {
  const rows = (await env.DB.prepare(`SELECT a.id, a.request_id, a.expert_id FROM ai_agents g JOIN assignments a ON a.expert_id=g.expert_id
      WHERE g.mode='on' AND a.dispatched_at IS NOT NULL AND a.dispatched_at>=COALESCE(g.on_at,0) AND a.closed_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM ai_runs r WHERE r.assignment_id=a.id) ORDER BY a.id LIMIT 2`).all()).results || [];
  for (const a of rows) await createRun(env, a, "auto").catch((e) => console.error("ai run", e && e.message));
  return rows.length;
}

export async function createRun(env, a, how) {
  const ag = await agentOf(env, a.expert_id);
  const cfg = cfgOf(ag);
  const its = (await env.DB.prepare("SELECT id, title, qty, unit FROM items WHERE assignment_id=? AND state='open' ORDER BY line_no LIMIT ?").bind(a.id, cfg.maxItems).all()).results || [];
  if (!its.length) throw new HttpError("این ارجاع قلمِ بازی ندارد.", 409);
  const t = now();
  const data = { items: its.map((i) => ({ id: i.id, title: i.title, qty: i.qty, unit: i.unit })), cands: [], how };
  const r = await env.DB.prepare(`INSERT INTO ai_runs (assignment_id,expert_id,request_id,state,data_json,next_at,created_at,updated_at) VALUES (?,?,?,'prep',?,?,?,?)
    ON CONFLICT(assignment_id) DO NOTHING`).bind(a.id, a.expert_id, a.request_id, JSON.stringify(data), t, t, t).run();
  if (!r.meta.changes) throw new HttpError("کارشناس هوشمند روی این ارجاع از قبل کار می‌کند.", 409);
  const runId = r.meta.last_row_id;
  /* «مشاهده» همان دیدنِ ارجاع است — کارشناس هوشمند دیده و شروع کرده */
  await env.DB.batch([
    env.DB.prepare("UPDATE assignments SET viewed_at=COALESCE(viewed_at,?) WHERE id=?").bind(t, a.id),
    env.DB.prepare("UPDATE alerts SET canceled_at=? WHERE assignment_id=? AND kind='stage' AND stage=0 AND fired_at IS NULL").bind(t, a.id),
    env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)").bind(t, `expert:${a.expert_id}`, "viewed", a.request_id, JSON.stringify({ assignment_id: a.id, channel: "ai" })),
    logStmt(env, runId, null, "run", `شروعِ کار روی درخواست ${a.request_id} — ${faN(its.length)} قلم (${how === "manual" ? "دستی از تب" : "ارجاعِ تازه"})`),
  ]);
  return runId;
}

/** برداشتنِ اتمیِ یک اجرای سررسیده — فقط کارشناس‌های روشن؛ دو Cron هم‌زمان یک اجرا را دو بار نمی‌گیرند */
async function claimRun(env, t) {
  const got = (await env.DB.prepare(`UPDATE ai_runs SET lock_until=?1 WHERE id=(SELECT r.id FROM ai_runs r JOIN ai_agents g ON g.expert_id=r.expert_id AND g.mode='on'
      WHERE r.finished_at IS NULL AND r.state<>'paused' AND r.next_at<=?2 AND (r.lock_until IS NULL OR r.lock_until<?2) ORDER BY r.next_at LIMIT 1)
      AND (lock_until IS NULL OR lock_until<?2) RETURNING *`).bind(t + LOCK_STEP, t).all()).results || [];
  return got[0] || null;
}

/**
 * یک اجرای Cron: ارجاع‌های تازه، بعد یک گام از یک اجرا. خروجی {ai: 0|1, ...} — bot.js فقط وقتی جستجوی هوشمندِ صف
 * اجرا نشد صدایش می‌زند (سقف زیردرخواست).
 */
export async function aiTick(env) {
  const on = await env.DB.prepare("SELECT COUNT(*) AS n FROM ai_agents WHERE mode='on'").first().catch(() => null);
  if (!on || !on.n) return { ai: 0 };
  const t = now();
  const fresh = await discover(env);
  /* زمانِ تازه: اجرایی که همین حالا ساخته شد هم سررسیده است */
  const row = await claimRun(env, Math.max(t, now()));
  if (!row) return { ai: fresh ? 1 : 0, aiNew: fresh };
  const run = { ...row, data: parse(row.data_json, {}) };
  const rec = recorder(env);
  const ex = await env.DB.prepare("SELECT id, name, label, telegram_chat, active FROM experts WHERE id=?").bind(run.expert_id).first();
  try {
    const asg = await env.DB.prepare("SELECT id, expert_id, request_id, deadline_at, closed_at FROM assignments WHERE id=?").bind(run.assignment_id).first();
    if (!asg || asg.expert_id !== run.expert_id || asg.closed_at || !ex || !ex.active) {
      await endRun(env, run, !asg || asg.expert_id !== run.expert_id ? "ارجاع به کارشناسِ دیگری رفت یا حذف شد" : asg && asg.closed_at ? "ارجاع خاتمه یافت" : "کارشناس غیرفعال است");
      return { ai: 1, ended: run.id };
    }
    const cfg = cfgOf(await agentOf(env, run.expert_id));
    const out = await advance(env, run, { ex, cfg, rec, asg });
    return { ai: 1, run: run.id, ...out };
  } catch (e) {
    const msg = String((e && e.message) || e).slice(0, 400);
    await env.DB.prepare("UPDATE ai_runs SET error=?, next_at=?, updated_at=? WHERE id=?").bind(msg, now() + 5 * 60000, now(), run.id).run().catch(() => {});
    await log(env, run.id, null, "error", `خطا در «${STATE_FA[run.state] || run.state}»: ${msg} — پنج دقیقهٔ دیگر دوباره.`);
    return { ai: 1, run: run.id, error: msg };
  } finally {
    await flushCalls(env, run, run.expert_id, rec);
    await env.DB.prepare("UPDATE ai_runs SET lock_until=NULL WHERE id=?").bind(run.id).run().catch(() => {});
  }
}

async function endRun(env, run, why) {
  const t = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE ai_runs SET state='ended', finished_at=?, updated_at=? WHERE id=?").bind(t, t, run.id),
    env.DB.prepare("UPDATE ai_threads SET state='closed', updated_at=? WHERE run_id=?").bind(t, run.id),
    logStmt(env, run.id, null, "run", `کار بسته شد: ${why}`),
  ]);
}

async function advance(env, run, k) {
  if (run.state === "prep") return stepPrep(env, run, k);
  if (run.state === "search") return stepSearch(env, run, k);
  if (run.state === "work") return stepWork(env, run, k);
  if (run.state === "closing") return stepClosing(env, run, k);
  await env.DB.prepare("UPDATE ai_runs SET next_at=? WHERE id=?").bind(now() + 3600000, run.id).run();
  return {};
}
const next = (env, run, ms, state) => env.DB.prepare(`UPDATE ai_runs SET next_at=?, updated_at=?, error=NULL${state ? ", state=?" : ""} WHERE id=?`)
  .bind(now() + ms, now(), ...(state ? [state] : []), run.id);

/* ------------------------------------------------------------------ */
/* ۱. آماده‌سازی: ساختار و بررسی سوابق — یک قلم در هر گام                  */
/* ------------------------------------------------------------------ */
const itemRow = (env, aid, id) => env.DB.prepare(`SELECT i.*, a.id AS aid, a.request_id, r.party FROM items i JOIN assignments a ON a.id=i.assignment_id
  JOIN requests r ON r.id=a.request_id WHERE i.id=? AND i.assignment_id=?`).bind(id, aid).first();

async function stepPrep(env, run, { ex, rec }) {
  const d = run.data, idx = d.items.findIndex((x) => !x.prep);
  if (idx < 0) { await next(env, run, 0, "search").run(); return { step: "prep-done" }; }
  const di = d.items[idx];
  const it = await itemRow(env, run.assignment_id, di.id);
  if (!it || it.state !== "open") { di.prep = 1; di.skip = true; await saveData(env, run).run(); return { step: "prep-skip" }; }
  /* ساختار: اگر قلم ساختارِ تأییدشده ندارد و در دیتابیسِ اصلی هم نیست، پیشنهادِ مدل فقط روی همین قلم می‌نشیند — نه در
     دیتابیسِ اصلی (item_edits)؛ تصحیحِ آن کارِ کارشناسِ انسانی است */
  if (!normOf(it)) {
    rec.purpose = "normalize"; rec.thread = null;
    const p = await normalizeItem(rec.env, it, { model: true }).catch((e) => ({ error: e.message }));
    if (p && !p.error && p.head && ["model", "cache"].includes(p.source)) {
      const norm = { v: 2, head: p.head, layers: p.layers || {}, residual: p.residual || "", source: "ai", code: null, rates: {}, confirmed_at: now() };
      /* قلمی که برای تأمین‌کننده رفته قفل است (sp-core.js:itemLocks) — ساختارش دست نمی‌خورد */
      await env.DB.prepare(`UPDATE items SET norm_json=?, norm_at=? WHERE id=? AND norm_json IS NULL AND NOT EXISTS (SELECT 1 FROM sp_lines l
          JOIN sp_threads t ON t.id=l.thread_id JOIN sp_suppliers s ON s.id=t.supplier_id WHERE l.item_id=items.id AND s.demo=0)`).bind(JSON.stringify(norm), norm.confirmed_at, it.id).run();
      it.norm_json = JSON.stringify(norm);
      di.struct = `پیشنهادِ مدل: ${p.head}`;
    } else di.struct = p && p.error ? `ناموفق: ${p.error}` : p && p.head ? `از فهرست اقلام: ${p.head}` : "ساختاری پیدا نشد";
  } else di.struct = `تأییدشده: ${normOf(it).head}`;
  const h = await itemHistory(env, it, { mode: "head", k: 5 }).catch((e) => ({ available: false, message: e.message }));
  const sups = h.suppliers || [];
  di.hist = {
    ok: !!h.available && !h.message, msg: h.message || null, n: sups.length, ref: (h.item && h.item.refUnit) || (h.struct && h.struct.refUnit) || null,
    top: sups.slice(0, 15).map((s) => ({ name: s.name, rank: s.rankM, grade: s.grade || null, n: s.n, avg: s.avgUnit, min: s.minUnit, max: s.maxUnit, last: s.lastDate,
      phones: [s.contact && s.contact.phone, s.contact && s.contact.tel2].filter(Boolean) })),
  };
  di.prep = 1;
  const t = now();
  await env.DB.batch([
    saveData(env, run),
    env.DB.prepare("UPDATE items SET hist_done_at=COALESCE(hist_done_at,?) WHERE id=?").bind(t, it.id),
    env.DB.prepare("UPDATE alerts SET canceled_at=? WHERE assignment_id=? AND kind='stage' AND stage=1 AND fired_at IS NULL").bind(t, run.assignment_id),
    env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)").bind(t, `expert:${ex.id}`, "hist", run.request_id, JSON.stringify({ assignment_id: run.assignment_id, item_ids: [it.id], channel: "ai" })),
    logStmt(env, run.id, null, "step", `«${it.title}» — ساختار: ${di.struct}؛ بررسی سوابق: ${di.hist.ok ? `${faN(di.hist.n)} تأمین‌کننده` : di.hist.msg || "سابقه‌ای نیست"}`),
    next(env, run, 0),
  ]);
  return { step: "prep", item: it.id };
}

/* ------------------------------------------------------------------ */
/* ۲. جستجوی هوشمند — یک قلم در هر گام؛ جستجوی تازهٔ همان قلم دوباره خرج نمی‌شود  */
/* ------------------------------------------------------------------ */
const phonesOfResult = (s) => (s.phones || []).map((p) => (p && typeof p === "object" ? p.e164 || p.verbatim : p)).filter(Boolean);

async function stepSearch(env, run, { ex, cfg, rec }) {
  const d = run.data, idx = d.items.findIndex((x) => !x.skip && !x.smart);
  if (idx < 0) {
    await buildCandidates(env, run);
    await env.DB.batch([saveData(env, run), next(env, run, 0, "work"),
      logStmt(env, run.id, null, "step", `نامزدهای دعوت: ${faN(d.cands.length)} تأمین‌کننده از سوابق و جستجو. دعوت فقط برای شماره‌هایی که تیکِ «پنل» دارند.`)]);
    return { step: "search-done" };
  }
  const di = d.items[idx];
  const it = await itemRow(env, run.assignment_id, di.id);
  if (!it || it.state !== "open") { di.smart = { skip: true }; await saveData(env, run).run(); return { step: "search-skip" }; }
  const recent = (await itemSearches(env, it, 3).catch(() => [])).find((s) => s.result && now() - s.created_at < cfg.reuseDays * 86400000);
  if (recent) {
    di.smart = { sid: recent.search_id, n: ((recent.result && recent.result.suppliers) || []).length, reused: true };
    const t = now();
    await env.DB.batch([saveData(env, run), env.DB.prepare("UPDATE items SET smart_done_at=COALESCE(smart_done_at,?) WHERE id=?").bind(t, it.id),
      env.DB.prepare("UPDATE alerts SET canceled_at=? WHERE assignment_id=? AND kind='stage' AND stage=2 AND fired_at IS NULL").bind(t, run.assignment_id),
      logStmt(env, run.id, null, "step", `«${it.title}» — جستجوی هوشمندِ ${fmtFa(recent.created_at)} همین قلم دوباره به کار رفت (${faN(di.smart.n)} تأمین‌کننده؛ جستجوی تازه خرج نشد).`),
      next(env, run, 0)]);
    return { step: "search-reuse", item: it.id };
  }
  /* جستجو چند دقیقه طول می‌کشد: قفلِ این اجرا تا سقفِ Cron */
  await env.DB.prepare("UPDATE ai_runs SET lock_until=? WHERE id=?").bind(now() + LOCK_LONG, run.id).run();
  rec.purpose = "smart"; rec.thread = null;
  const specs = [T(it.spec), ...Object.entries((normOf(it) || {}).layers || {}).map(([k, v]) => `${k}: ${typeof v === "object" && v ? v.v : v}`)].filter(Boolean).join("، ");
  const out = await smartSearch(rec.env, it, ex, { markets: cfg.markets, specs, notes: T(it.note), deliveryHint: it.party }, "ai").catch((e) => ({ error: e.message }));
  /* پاسخِ جستجو جریانی است؛ مصرف و هزینه‌اش را خودِ smartSearch حساب کرده — روی همان فراخوانیِ ضبط‌شده */
  const last = rec.calls.filter((c) => c.purpose === "smart").pop();
  if (last && !out.error) { last.usage = out.usage ? { input_tokens: out.usage.input, output_tokens: out.usage.output, cache_read_input_tokens: out.usage.cacheRead, cache_creation_input_tokens: out.usage.cacheWrite } : null; last.cost = out.cost; }
  di.smart = out.error ? { err: out.error } : { sid: out.search_id, n: ((out.result && out.result.suppliers) || []).length };
  await env.DB.batch([saveData(env, run),
    logStmt(env, run.id, null, "step", out.error ? `«${it.title}» — جستجوی هوشمند نشد: ${out.error}` : `«${it.title}» — جستجوی هوشمند: ${faN(di.smart.n)} تأمین‌کننده.`),
    next(env, run, 0)]);
  return { step: "search", item: it.id };
}

/**
 * نامزدهای دعوت: برای هر قلم، تأمین‌کنندگانِ سوابق (به ترتیبِ رتبه) و بعد جستجوی هوشمند؛ با شماره‌هایی که پیدا شده
 * (دعوت فقط با شمارهٔ پنلِ تیک‌خورده — این‌ها فقط پیشنهادِ شماره برای کارشناس‌اند).
 */
async function buildCandidates(env, run) {
  const d = run.data, by = new Map();
  const add = (name, itemId, src, rank, phones) => {
    const key = C.nkey(name);
    if (!key) return;
    const c = by.get(key) || { key, name: C.nrm(name), items: [], src, rank: rank == null ? 999 : rank, found: [] };
    if (!c.items.includes(itemId)) c.items.push(itemId);
    for (const p of phones || []) { const n = C.normPhone(p); if (n && !c.found.includes(n)) c.found.push(n); }
    if (src === "history" && c.src !== "history") { c.src = "history"; c.rank = rank; }
    by.set(key, c);
  };
  for (const di of d.items) {
    if (di.skip) continue;
    for (const s of (di.hist && di.hist.top) || []) add(s.name, di.id, "history", s.rank, s.phones);
    if (di.smart && di.smart.sid) {
      const row = await env.DB.prepare("SELECT result_json FROM smart_searches WHERE id=?").bind(di.smart.sid).first();
      ((parse(row && row.result_json, {}) || {}).suppliers || []).forEach((s) => add(s.name, di.id, "smart", null, phonesOfResult(s)));
    }
  }
  /* شماره‌هایی که جستجوهای قبلی برای همین نام‌ها پیدا کرده‌اند */
  const names = [...by.values()].map((c) => c.name).slice(0, 80);
  if (names.length) {
    const rows = (await env.DB.prepare(`SELECT supplier_name, phone FROM supplier_phones WHERE supplier_name IN (${names.map(() => "?").join(",")}) LIMIT 300`).bind(...names).all()).results || [];
    for (const r of rows) { const c = by.get(C.nkey(r.supplier_name)); const n = C.normPhone(r.phone); if (c && n && !c.found.includes(n)) c.found.push(n); }
  }
  d.cands = [...by.values()].sort((a, b) => (a.src === b.src ? a.rank - b.rank : a.src === "history" ? -1 : 1)).slice(0, 40);
}

/* ------------------------------------------------------------------ */
/* ۳ و ۴. دعوت (فقط شمارهٔ پنل) و مذاکره                                   */
/* ------------------------------------------------------------------ */
/** تأمین‌کنندگانِ نامزد یا دستی که دست‌کم یک شمارهٔ پنلِ تیک‌خورده دارند و هنوز برای این ارجاع گفت‌وگو ندارند */
/* تأمین‌کنندگانِ دستیِ کارشناس در ستونِ جدای manual_json — تبِ کارشناس می‌نویسدش و گامِ Cron فقط می‌خواند (بی مسابقه با data_json) */
const manualOf = (run) => parse(run.manual_json, []);

async function invitable(env, run) {
  const d = run.data;
  const man = manualOf(run);
  const keys = (d.cands || []).map((c) => c.key);
  const ids = man.map((m) => m.sid).filter(Boolean);
  if (!keys.length && !ids.length) return [];
  const cond = [keys.length ? `s.name_n IN (${keys.map(() => "?").join(",")})` : null, ids.length ? `s.id IN (${ids.map(() => "?").join(",")})` : null].filter(Boolean).join(" OR ");
  const rows = (await env.DB.prepare(`SELECT s.id AS sid, s.name, s.name_n, p.id AS pid, p.phone, p.label FROM sp_suppliers s JOIN sp_phones p ON p.supplier_id=s.id
      WHERE s.demo=0 AND p.panel=1 AND (${cond}) AND NOT EXISTS (SELECT 1 FROM sp_threads t WHERE t.assignment_id=? AND t.supplier_id=s.id) ORDER BY p.id`)
    .bind(...keys, ...ids, run.assignment_id).all()).results || [];
  const bySup = new Map();
  for (const r of rows) {
    if (!bySup.has(r.sid)) {
      const manual = man.find((m) => m.sid === r.sid);
      const cand = (d.cands || []).find((c) => c.key === r.name_n);
      const items = manual ? d.items.filter((x) => !x.skip).map((x) => x.id) : cand ? cand.items : [];
      bySup.set(r.sid, { sid: r.sid, name: r.name, src: manual ? "manual" : cand ? cand.src : "manual", rank: cand ? cand.rank : 0, items, phones: [] });
    }
    bySup.get(r.sid).phones.push({ id: r.pid, phone: r.phone, label: r.label });
  }
  return [...bySup.values()].filter((x) => x.items.length).sort((a, b) => (a.src === "manual" ? -1 : 0) - (b.src === "manual" ? -1 : 0) || a.rank - b.rank);
}

/**
 * قالبِ دعوت — اولین پیامِ گفت‌وگو، با همان لحنِ محاوره‌ایِ مذاکره (درخواست کاربر، مهر ۱۴۰۵)؛ پیامک کوتاه‌ترش را می‌برد.
 * یک جمله می‌گوید پیام‌ها را دستیارِ هوشمند جواب می‌دهد — مدل هم اگر صادقانه پرسیده شود انکار نمی‌کند (ai-prompts.js).
 */
function inviteText(env, sup, items) {
  const list = items.map((i) => `• ${i.title} — ${faN(i.qty == null ? "—" : i.qty)} ${i.unit || ""}`.trim()).join("\n");
  return `سلام، وقتتون بخیر 🌷\n${sup}، از واحد تدارکات شرکت ${COMPANY(env)} مزاحمتون می‌شم؛ برای ${items.length === 1 ? "این قلم" : "این اقلام"} قیمت می‌خواستیم:\n${list}\n`
    + "اگه لطف کنید مقدار، قیمت واحد (بدون ارزش افزوده)، زمان تحویل، شرایط تسویه، نوع فاکتور و ارزش افزوده رو همین‌جا توی پنل ثبت کنید و «ارسال» رو بزنید، ممنون می‌شم. اگه پیش‌فاکتور هم دارید، همین‌جا بارگذاری کنید.\n"
    + "پیام‌هاتون رو دستیارِ هوشمندِ خریدِ ما همین‌جا جواب می‌ده؛ تصمیمِ نهایی هم با کمیسیون معاملات شرکته.\nممنون از همکاری‌تون 🙏";
}
const smsIntro = (env, items) => `استعلام قیمت شرکت ${COMPANY(env)}: ${items.length === 1 ? `${items[0].title} (${faN(items[0].qty == null ? "—" : items[0].qty)} ${items[0].unit || ""})`.trim() : `${faN(items.length)} قلم`}. ثبت قیمت و گفت‌وگو با کارشناس خرید:`;

async function inviteOne(env, run, ex, inv) {
  const items = run.data.items.filter((x) => inv.items.includes(x.id) && !x.skip);
  if (!items.length) return null;
  const [p0, ...more] = inv.phones;
  const r = await C.spSend(env, ex, { assignment_id: run.assignment_id, item_ids: items.map((i) => i.id), supplier_id: inv.sid, phone_id: p0.id,
    text: inviteText(env, inv.name, items), sms: smsIntro(env, items), ai: true });
  const t = now();
  const top = await env.DB.prepare("SELECT COALESCE(MAX(id),0) AS n FROM sp_msgs WHERE thread_id=?").bind(r.thread_id).first();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO ai_threads (thread_id,run_id,source,state,seen_msg,created_at,updated_at) VALUES (?,?,?,'invited',?,?,?) ON CONFLICT(thread_id) DO NOTHING`)
      .bind(r.thread_id, run.id, inv.src, top ? top.n : 0, t, t),
    /* همان «انتخاب جهت استعلام» کارشناس: خطی بی قیمت در تب استعلامات، تا پیش‌فاکتور یا تأیید نهایی پرش کند */
    ...items.map((i) => env.DB.prepare(`INSERT INTO quotes (assignment_id,item_id,supplier_name,unit,qty,invoice,source,origin,created_at,updated_at)
      SELECT ?,?,?,?,?,'رسمی','ai',?,?,? WHERE NOT EXISTS (SELECT 1 FROM quotes WHERE assignment_id=? AND item_id=? AND supplier_name=?)`)
      .bind(run.assignment_id, i.id, r.supplier.name, i.unit || null, i.qty ?? null, inv.src === "smart" ? "smart" : inv.src === "history" ? "history" : "manual", t, t, run.assignment_id, i.id, r.supplier.name)),
  ]);
  await P.pushMsgs(env, { id: r.thread_id }, r.msgs).catch((e) => console.error("ai push", e && e.message));
  const results = [];
  /* پیامک فقط به شمارهٔ پنل — تیک همین لحظه دوباره سنجیده می‌شود (ممکن است کارشناس وسطِ کار برداشته باشد) */
  const send = async (ph, sms) => {
    const fresh = await env.DB.prepare("SELECT panel FROM sp_phones WHERE id=?").bind(ph.id).first();
    const ok = !!(fresh && fresh.panel);
    const d = await deliverSms(env, { smsId: sms.id, expertId: ex.id, expertChat: ex.telegram_chat, threadId: r.thread_id, supplier: r.supplier.name, to: ph.phone,
      label: ph.label, text: sms.text, panel: r.links.panel, bot: r.links.bot, hold: !ok, kind: "rfq" });
    results.push({ phone: C.maskPhone(ph.phone), via: d.via, sent: d.sent, error: d.error || (!ok ? "تیکِ پنل برداشته شده بود" : null) });
  };
  await send(p0, r.sms);
  for (const ph of more.slice(0, 2)) {
    const r2 = await C.spSend(env, ex, { assignment_id: run.assignment_id, item_ids: items.map((i) => i.id), supplier_id: inv.sid, phone_id: ph.id, silent: true, sms: smsIntro(env, items), ai: true });
    await send(ph, r2.sms);
  }
  if (!run.data.invited_at) run.data.invited_at = t;
  await env.DB.batch([saveData(env, run), logStmt(env, run.id, r.thread_id, "invite",
    `دعوت از «${r.supplier.name}» (${SOURCE_FA[inv.src] || inv.src}) برای ${items.map((i) => `«${i.title}»`).join("، ")} — پیامک: ${results.map((x) => `${x.phone} ${x.sent ? "✅ فرستاده شد" : x.via === "hold" ? `⛔ نرفت (${x.error || "بی تیکِ پنل"})` : x.error ? `⚠️ نرفت: ${x.error} — شبیه‌سازی شد` : "🧪 شبیه‌سازی (درگاه پیامک وصل نیست)"}`).join("؛ ")}`, { results })]);
  return { thread: r.thread_id, results };
}

/** گفت‌وگویی که کاری برایش هست: پیامِ تازهٔ تأمین‌کننده بعد از آخرین دورِ مدل، یا دوباره‌سازیِ دورِ ناموفق */
async function pickThread(env, run, cfg) {
  const t = now();
  /* «پرسش از کارشناس» (state='ask'): تا پاسخِ کارشناس، گفت‌وگو دستِ اوست و کارشناس هوشمند منتظر می‌ماند */
  return env.DB.prepare(`SELECT x.thread_id FROM ai_threads x WHERE x.run_id=? AND x.state NOT IN ('closed','ask') AND x.turns<? AND (x.lock_until IS NULL OR x.lock_until<?)
      AND (EXISTS (SELECT 1 FROM sp_msgs m WHERE m.thread_id=x.thread_id AND m.who='s' AND m.id>x.seen_msg) OR (x.retry_at IS NOT NULL AND x.retry_at<=?))
    ORDER BY x.updated_at LIMIT 1`).bind(run.id, cfg.maxTurns, t, t).first();
}

async function stepWork(env, run, k) {
  const { ex, cfg } = k;
  /* دعوت‌های تازه (شماره‌ای که همین حالا تیک خورده هم) — سقفِ کلِ دعوت‌ها */
  const done = await env.DB.prepare("SELECT COUNT(*) AS n FROM ai_threads WHERE run_id=?").bind(run.id).first();
  const room = cfg.maxInvites - ((done && done.n) || 0);
  if (room > 0) {
    const todo = (await invitable(env, run)).slice(0, Math.min(room, INVITES_PER_TICK));
    if (todo.length) {
      for (const inv of todo) {
        await inviteOne(env, run, ex, inv).catch((e) => log(env, run.id, null, "error", `دعوت از «${inv.name}» نشد: ${e.message}`));
      }
      await saveMd(env, run, ex).catch((e) => console.error("ai md", e && e.message));
      await next(env, run, 0).run();
      return { step: "invite", n: todo.length };
    }
  }
  const pick = await pickThread(env, run, cfg);
  if (pick) {
    const r = await threadTurn(env, pick.thread_id, { run, ex, cfg, rec: k.rec });
    await next(env, run, 0).run();
    return { step: "turn", thread: pick.thread_id, ...r };
  }
  return finishCheck(env, run, k);
}

/** حداقلِ استعلامِ اقلامِ بازِ یک ارجاع با قواعدِ پنل پشتیبانی و حدِ پایهٔ مدیر (ai-rules.js) */
const coverNow = async (env, aid) => coverOf(env, aid, await getRules(env), (await getSettings(env)).minSuppliers);
const shortOf = (cover) => cover.filter((c) => c.have < c.need).map((c) => ({ id: c.id, title: c.title, need: c.need, have: c.have }));

/**
 * پایانِ مذاکره: هر قلمِ باز به «حداقلِ استعلامِ» خودش رسیده (شمارِ تأمین‌کنندگانِ مختلف با «ثبت موقت + تأیید نهایی»؛ حد از
 * قواعدِ پنل پشتیبانی و «حداقل تأمین‌کننده»ی مدیر)، و (سکوتِ تأمین‌کنندگان، «پایان» از پنل یا نزدیکیِ مهلت). «پایان»ِ پشتیبانی
 * با کمتر از حد هم می‌بندد اگر هر قلم دست‌کم یک پیشنهادِ تأییدنهایی دارد — کمبود در شرح و نامه گفته می‌شود. اگر در مهلتِ قواعد
 * به حد نرسید، یک بار به کارشناس «واگذار» می‌شود (handOver) و کار ادامه دارد.
 */
async function finishCheck(env, run, { cfg, asg, ex }) {
  const rules = await getRules(env);
  const cover = await coverOf(env, run.assignment_id, rules, (await getSettings(env)).minSuppliers);
  const covered = cover.length > 0 && cover.every((c) => c.have >= c.need);
  const some = cover.length > 0 && cover.every((c) => c.have > 0);
  const last = await env.DB.prepare("SELECT MAX(m.at) AS at FROM sp_msgs m JOIN ai_threads x ON x.thread_id=m.thread_id WHERE x.run_id=? AND m.who='s'").bind(run.id).first();
  const since = Math.max((last && last.at) || 0, run.data.invited_at || 0, run.created_at);
  const quiet = now() - since >= cfg.quietMin * 60000;
  const soon = !!(asg && asg.deadline_at && asg.deadline_at - now() < 2 * 3600000);
  const why = run.finish_at ? `دستورِ «پایان مذاکره» از پنل پشتیبانی${covered ? "" : "، با کمتر از حداقلِ استعلام"}` : quiet ? `${faN(cfg.quietMin)} دقیقه بی پیامِ تازه از تأمین‌کنندگان` : soon ? "نزدیکیِ مهلتِ ارجاع" : null;
  run.data.cover = cover.map((c) => ({ id: c.id, title: c.title, n: c.have, need: c.need, why: c.why }));
  if ((covered && why) || (run.finish_at && some)) {
    const short = shortOf(cover);
    run.data.closing = { step: "report", why, ...(short.length ? { short } : {}) };
    await env.DB.batch([saveData(env, run), next(env, run, 0, "closing"), logStmt(env, run.id, null, "step", short.length
      ? `پایانِ مذاکره (${why}): این اقلام کمتر از حداقلِ استعلام دارند — ${short.map((c) => `«${c.title}» ${faN(c.have)} از ${faN(c.need)}`).join("، ")}. جدول کمیسیون و نامه آماده می‌شود و کمبود در آن‌ها گفته می‌شود.`
      : `پایانِ مذاکره (${why}): هر قلم به حداقلِ استعلامِ خودش رسید. جدول کمیسیون و نامه آماده می‌شود.`)]);
    return { step: "finish", short: short.length };
  }
  /* «پایان» خواسته شد ولی قلمی بی پیشنهاد است: یک بار برای هر بار زدنِ دکمه (finish_at) گفته می‌شود */
  if (run.finish_at && !some && run.data.finishWarned !== run.finish_at) {
    run.data.finishWarned = run.finish_at;
    await log(env, run.id, null, "step", `«پایان مذاکره» خواسته شد ولی این اقلام هنوز پیشنهادِ تأییدنهایی‌شده ندارند: ${cover.filter((c) => !c.have).map((c) => `«${c.title}»`).join("، ")}`);
  }
  /* مهلتِ رسیدن به حد (قواعدِ پنل پشتیبانی) گذشت و هنوز نرسیده: آلارم به کارشناس و واگذاریِ سوابق و جستجو — یک بار */
  const start = run.data.invited_at || run.created_at;
  if (!covered && !run.handover_at && rules.waitHours > 0 && now() - start >= rules.waitHours * 3600000) {
    await handOver(env, run, ex, cover, rules);
    return { step: "handover", short: shortOf(cover).length };
  }
  await env.DB.batch([saveData(env, run), next(env, run, 60000)]);
  return { step: "wait", covered };
}

/**
 * «واگذاری» (فاز ۳): مهلتِ قواعدِ پنل پشتیبانی گذشت و قلمی هنوز به حداقلِ استعلامش نرسیده. کارشناس در تلگرام آلارم می‌گیرد
 * و بررسی سوابق، جستجوی هوشمند و ساختارِ همین درخواست برایش باز می‌شود (ai-lock.js:aiResearchLocked) تا استعلامِ کم را خودش
 * بگیرد («ارسال استعلام» در مکاتبات یا خطِ دستیِ ✋). کارشناس هوشمند گفت‌وگوهایش را ادامه می‌دهد و وقتی حد پر شد (با
 * خط‌های کارشناس هم)، جدول و نامه را خودش می‌سازد.
 */
async function handOver(env, run, ex, cover, rules) {
  const t = now();
  const short = shortOf(cover);
  run.data.handover = { at: t, hours: rules.waitHours, items: short };
  run.handover_at = t;
  await env.DB.batch([
    env.DB.prepare("UPDATE ai_runs SET data_json=?, handover_at=?, next_at=?, error=NULL, updated_at=? WHERE id=?").bind(JSON.stringify(run.data), t, t + 60000, t, run.id),
    logStmt(env, run.id, null, "handover", `⚠️ مهلتِ ${faN(rules.waitHours)} ساعته گذشت و این اقلام به حداقلِ استعلام نرسیدند: ${short.map((c) => `«${c.title}» ${faN(c.have)} از ${faN(c.need)}`).join("، ")}. `
      + "کار به کارشناس واگذار شد: بررسی سوابق و جستجوی هوشمند برایش باز است؛ گفت‌وگوها ادامه دارند و جدول و نامه با کارشناس هوشمند است."),
    env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)").bind(t, `expert:${ex.id}`, "ai_handover", run.request_id,
      JSON.stringify({ assignment_id: run.assignment_id, hours: rules.waitHours, items: short, channel: "ai" })),
  ]);
  await handoverAlarm(env, ex, run, short, rules.waitHours).catch((e) => console.error("ai handover alarm", e && e.message));
}
/** آلارمِ واگذاری در بات کارشناسان — همان لحظه، با دکمهٔ مینی‌اپِ پنل کارشناس */
async function handoverAlarm(env, ex, run, short, hours) {
  if (!ex.telegram_chat || !env.TG_BOT_TOKEN) return 0;
  const text = `⚠️ <b>کارشناس هوشمند به حداقلِ استعلامِ درخواست ${esc(run.request_id)} نرسید</b>\n\n`
    + `بعد از ${faN(hours)} ساعت، این اقلام هنوز کمتر از حدی که پنل پشتیبانی تعیین کرده پیشنهادِ تأییدنهایی دارند:\n`
    + short.map((c) => `• ${esc(c.title)} — ${faN(c.have)} از ${faN(c.need)}`).join("\n")
    + "\n\n<b>لطفاً خودتان وارد شوید:</b> بررسی سوابق و جستجوی هوشمندِ این درخواست حالا برایتان باز است. تأمین‌کنندهٔ تازه پیدا کنید و استعلامِ کم را بگیرید "
    + "(«ارسال استعلام» در مکاتبات، یا خطِ دستیِ ✋ با پیش‌فاکتور). گفت‌وگوهای کارشناس هوشمند ادامه دارند و وقتی حد پر شد، جدول کمیسیون و نامه را خودش می‌سازد.";
  await telegram(env).call("sendMessage", { chat_id: ex.telegram_chat, text, parse_mode: "HTML", link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: [[{ text: "📋 باز کردنِ پنل کارشناس", web_app: { url: expertAppUrl(env) } }]] } });
  return 1;
}

/* ------------------------------------------------------------------ */
/* یک دورِ مذاکره در یک گفت‌وگو                                           */
/* ------------------------------------------------------------------ */
const bundleItems = (b, lines) => parse(b.line_ids, []).map((id) => lines.find((l) => l.id === id)).filter(Boolean);

/**
 * fast: از waitUntilِ کارِ تأمین‌کننده (زیر ۳۰ ثانیه) و فقط برای پاسخ به پیام. اگر پیش‌فاکتوری خواندنی است فقط همان
 * خوانده می‌شود؛ اگر بسته‌ای تصمیم می‌خواهد (pending، یا پیش‌فاکتورِ خوانده‌شده) یا مدل در همین دورِ کم‌عمق تصمیمی
 * گرفت، دور به Cronِ بعدی سپرده می‌شود تا تأیید، برگشت، رد و تأیید نهایی همیشه با عمقِ فکرِ تب باشند (حداکثر حدود
 * یک دقیقه تأخیر). وگرنه پاسخ با تلاشِ کمتر (effort: low) و سقفِ ۲۴ ثانیه. شکست ← retry_at و همین گفت‌وگو در Cron.
 */
async function threadTurn(env, threadId, { run, ex, cfg, rec, fast = false }) {
  const t0 = now();
  const lock = await env.DB.prepare("UPDATE ai_threads SET lock_until=? WHERE thread_id=? AND (lock_until IS NULL OR lock_until<?)").bind(t0 + THREAD_LOCK, threadId, t0).run();
  if (!lock.meta.changes) return { busy: true };
  const st = await env.DB.prepare("SELECT * FROM ai_threads WHERE thread_id=?").bind(threadId).first();
  rec.thread = threadId;
  try {
    const th = await C.threadRow(env, threadId);
    if (!th || th.expert_id !== ex.id) {
      await env.DB.prepare("UPDATE ai_threads SET state='closed', lock_until=NULL, updated_at=? WHERE thread_id=?").bind(now(), threadId).run();
      return { closed: true };
    }
    const [lr, br, mr] = await env.DB.batch([
      env.DB.prepare("SELECT * FROM sp_lines WHERE thread_id=? ORDER BY id").bind(threadId),
      env.DB.prepare("SELECT * FROM sp_bundles WHERE thread_id=? ORDER BY id").bind(threadId),
      env.DB.prepare("SELECT * FROM sp_msgs WHERE thread_id=? ORDER BY id").bind(threadId),
    ]);
    const lines = lr.results || [], bundles = br.results || [], msgs = (mr.results || []).map(C.msgOut);
    /* پیش‌فاکتورِ تازه: اول خوانش هوشمند (همان پرامپتِ sp-ai.js) */
    const need = bundles.find((b) => b.state === "proforma" && b.pf_key && !aiUsable(parse(b.ai_json, null)));
    if (need) {
      const store = storage(env);
      if (!store || !store.signedUrl) throw new Error("انبار فایل لینک امضاشده نمی‌دهد؛ پیش‌فاکتور خوانده نشد.");
      rec.purpose = "proforma";
      const bl = bundleItems(need, lines);
      const ai = await runAiCheck(rec.env, { fileUrl: await store.signedUrl(need.pf_key, 900), mime: need.pf_mime, lines: bl, terms: C.termsOf(need) });
      await C.saveAi(env, { b: need, th, lines: bl }, ai);
      need.ai_json = JSON.stringify(ai); need.accept_json = null;
      /* خوانش یک گامِ جداست و تصمیمش گامِ بعد (سقفِ زیردرخواستِ هر اجرا؛ و در waitUntil سقفِ ۳۰ ثانیه) */
      await env.DB.batch([
        env.DB.prepare("UPDATE ai_threads SET lock_until=NULL, retry_at=?, updated_at=? WHERE thread_id=?").bind(now(), now(), threadId),
        logStmt(env, run.id, threadId, "proforma", `خوانش پیش‌فاکتورِ بستهٔ ${need.id}: ${ai.readable === false ? "خوانا نبود" : ai.ok ? "همه ✅" : "مغایرت دارد"} — تصمیم در گامِ بعد.`),
      ]);
      return { read: need.id };
    }
    if (fast) {
      const due = bundles.filter((b) => b.state === "pending" || (b.state === "proforma" && aiUsable(parse(b.ai_json, null))));
      if (due.length) return toCron(env, run, threadId, `بستهٔ ${due.map((b) => b.id).join("، ")} تصمیم می‌خواهد؛ دورِ فوری کنار رفت و Cron همین گفت‌وگو را با عمقِ فکرِ تب می‌زند.`);
    }
    const maxId = msgs.length ? msgs[msgs.length - 1].id : st.seen_msg;
    const context = await buildContext(env, { run, cfg, th, st, lines, bundles, msgs });
    rec.purpose = "negotiate";
    /* گامِ فوری (waitUntil، زیر ۳۰ ثانیه) با عمقِ فکرِ کم؛ Cron با همان که در تب انتخاب شده */
    const res = (await negotiate(rec.env, { company: COMPANY(env), context, model: cfg.model, effort: fast ? "low" : cfg.effort, timeoutMs: fast ? 24000 : undefined })).out;
    /* دورِ کم‌عمق تصمیمی روی بسته گرفت (مثلاً ردِ بسته پس از پیامِ تأمین‌کننده): نه تصمیم اجرا می‌شود نه پاسخ می‌رود */
    if (fast && Array.isArray(res.actions) && res.actions.length) {
      return toCron(env, run, threadId, `دورِ فوری تصمیم گرفت (${res.actions.map((a) => `${a.type} بستهٔ ${a.bundle_id}`).join("، ")})؛ اجرا نشد و Cron همین دور را با عمقِ فکرِ تب می‌زند.`);
    }
    const out = [], errors = [];
    for (const a of (Array.isArray(res.actions) ? res.actions : []).slice(0, 5)) {
      const b = bundles.find((x) => x.id === int(a.bundle_id));
      if (!b) { errors.push(`بستهٔ ${a.bundle_id} در این گفت‌وگو نیست.`); continue; }
      try {
        const comment = T(a.comment).slice(0, 1000);
        let r = null;
        if (a.type === "approve" || a.type === "return" || a.type === "reject") {
          r = await C.decide(env, ex, b.id, a.type, { comment: a.type === "return" ? comment || "لطفاً مشخصات رو اصلاح کنید و دوباره «ارسال» رو بزنید." : comment, ai: true });
        } else if (a.type === "accept_rows" || a.type === "final") {
          const ok = validKeys(b, a.rows);
          if (ok.length) await C.acceptRows(env, ex, b.id, { keys: ok, byAi: true });
          if (a.type === "final") r = await C.decide(env, ex, b.id, "final", { comment, ai: true });
          if ((a.rows || []).length > ok.length) errors.push(`کلیدهای نامعتبرِ جدول تطابق کنار گذاشته شد: ${(a.rows || []).filter((x) => !ok.includes(x)).join("، ")}`);
        }
        if (r && r.msgs) out.push(...r.msgs);
      } catch (e) { errors.push(`${a.type} روی بستهٔ ${b.id} نشد: ${e.message}`); }
    }
    if (T(res.reply)) out.push(...(await C.postMsg(env, th, "e", T(res.reply).slice(0, 2900), { ai: true })).msgs);
    const notes = [];
    if (T(res.note) || errors.length) notes.push(...(await C.postMsg(env, th, "e", `🤖 ${T(res.note) || "—"}${errors.length ? `\n⚠️ ${errors.join("\n⚠️ ")}` : ""}`.slice(0, 2900), { ai: true, ev: "ai-note" }, "note")).msgs);
    /* «پرسش از کارشناس» (فاز ۲ پنل پشتیبانی): جوابِ سؤالِ تأمین‌کننده در پروندهٔ درخواست نیست — یادداشتِ درونی با خودِ سؤال
       (تأمین‌کننده نمی‌بیند)، گفت‌وگو تا پاسخِ کارشناس برایش باز (ai-lock.js) و پیامِ تلگرام به او */
    const ask = T(res.ask_expert).slice(0, 600);
    let askNote = null;
    if (ask) {
      askNote = ((await C.postMsg(env, th, "e", `🚨 پرسش از کارشناس: ${ask}`, { ai: true, ev: "ask", q: ask }, "note")).msgs || [])[0] || null;
      notes.push(...(askNote ? [askNote] : []));
    }
    await P.pushMsgs(env, th, out).catch((e) => console.error("ai push", e && e.message));
    /* وضعیتِ گفت‌وگو: همهٔ اقلام بسته شد (نهایی یا رد) ← final/declined؛ وگرنه آنچه مدل گفت */
    const ls = (await env.DB.prepare("SELECT state FROM sp_lines WHERE thread_id=?").bind(threadId).all()).results || [];
    const closed = ls.length && ls.every((l) => ["final", "rejected"].includes(l.state));
    const state = ask ? "ask" : closed ? (ls.some((l) => l.state === "final") ? "final" : "declined") : res.thread_status === "declined" ? "declined" : "active";
    await env.DB.batch([
      env.DB.prepare(`UPDATE ai_threads SET seen_msg=?, memo=?, errors_json=?, turns=turns+1, state=?, last_ai_at=?, lock_until=NULL, retry_at=NULL, fails=0, updated_at=?${ask ? ", ask_json=?" : ""} WHERE thread_id=?`)
        .bind(Math.max(maxId || 0, st.seen_msg || 0), clip(T(res.memo), 2000), errors.length ? JSON.stringify(errors.slice(0, 6)) : null, state, now(), now(),
          ...(ask ? [JSON.stringify({ q: ask, at: now(), note: askNote ? askNote.id : null })] : []), threadId),
      logStmt(env, run.id, threadId, "turn", `دورِ ${faN((st.turns || 0) + 1)} با «${th.supplier_name}»: ${(res.actions || []).map((a) => `${a.type} بستهٔ ${a.bundle_id}`).join("، ") || "بی تصمیم"}${T(res.reply) ? " · پاسخ رفت" : ""}${errors.length ? ` · ${faN(errors.length)} خطا` : ""}${T(res.note) ? ` — ${T(res.note)}` : ""}`,
        { actions: res.actions, status: res.thread_status, errors, ms: now() - t0, fast }),
      ...(ask ? [logStmt(env, run.id, threadId, "ask", `🚨 پرسش از کارشناس: ${ask} — گفت‌وگو تا پاسخِ او برایش باز است و کارشناس هوشمند منتظر می‌ماند.`),
        env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)").bind(now(), `expert:${ex.id}`, "ai_ask", th.request_id,
          JSON.stringify({ assignment_id: run.assignment_id, thread_id: threadId, supplier: th.supplier_name, q: ask, channel: "ai" }))] : []),
    ]);
    if (ask) await askAlarm(env, ex, th, ask).catch((e) => console.error("ai ask alarm", e && e.message));
    await saveMd(env, run, ex).catch((e) => console.error("ai md", e && e.message));
    return { turn: true, actions: (res.actions || []).length, notes: notes.length, ask: !!ask };
  } catch (e) {
    const fails = (st.fails || 0) + 1;
    await env.DB.prepare("UPDATE ai_threads SET lock_until=NULL, fails=?, retry_at=?, updated_at=? WHERE thread_id=?")
      .bind(fails, fails < 4 ? now() + (fast ? 30000 : 5 * 60000) : null, now(), threadId).run().catch(() => {});
    await log(env, run.id, threadId, "error", `دورِ مذاکره نشد${fast ? " (فوری)" : ""}: ${String((e && e.message) || e).slice(0, 300)}${fails < 4 ? " — دوباره امتحان می‌شود." : " — بعد از چهار شکست متوقف شد؛ از تب «تلاش دوباره» را بزنید."}`);
    return { error: e.message };
  }
}

/**
 * «پرسش از کارشناس» در تلگرامِ کارشناس — همان لحظه، نه با صف: بات کارشناسان (دکمهٔ مینی‌اپِ صفحهٔ مکاتبات)، و اگر بات
 * مکاتبات را وصل کرده، همان‌جا هم با دکمهٔ رفتن به همین گفت‌وگو (جوابش را همان‌جا هم می‌تواند بنویسد).
 */
async function askAlarm(env, ex, th, q) {
  const text = `🚨 <b>کارشناس هوشمند از شما سؤال دارد</b>\n\nتأمین‌کنندهٔ «${esc(th.supplier_name)}» در درخواست <b>${esc(th.request_id)}</b> چیزی پرسیده که جوابش در پروندهٔ درخواست نیست:\n`
    + `«${esc(q)}»\n\nاین گفت‌وگو تا پاسخِ شما برایتان باز است؛ جواب را فقط در همان گفت‌وگو بنویسید (صفحهٔ مکاتبات یا بات مکاتبات) — مستقیم برای تأمین‌کننده می‌رود. `
    + "بعد از پاسخ، گفت‌وگو دوباره دستِ کارشناس هوشمند است.";
  let sent = 0;
  if (ex.telegram_chat && env.TG_BOT_TOKEN) {
    await telegram(env).call("sendMessage", { chat_id: ex.telegram_chat, text, parse_mode: "HTML", link_preview_options: { is_disabled: true },
      reply_markup: { inline_keyboard: [[{ text: "💬 باز کردنِ مکاتبات", web_app: { url: P.appUrl(env, "e") } }]] } }).then(() => sent++).catch((e) => console.error("ask tg", e && e.message));
  }
  if (env.TG_SP_BOT_TOKEN) {
    const rows = (await env.DB.prepare("SELECT chat FROM sp_tg WHERE expert_id=? AND role='e' LIMIT 3").bind(ex.id).all()).results || [];
    for (const r of rows) {
      await P.spApi(env).call("sendMessage", { chat_id: r.chat, text, parse_mode: "HTML", link_preview_options: { is_disabled: true },
        reply_markup: { inline_keyboard: [[{ text: "💬 رفتن به همین گفت‌وگو", callback_data: `go:${th.id}:e` }]] } }).then(() => sent++).catch(() => {});
    }
  }
  return sent;
}

/** دورِ فوری کنار می‌رود: همین گفت‌وگو در Cronِ بعدی (هر دقیقه؛ kickNow اجرا را سررسید کرده) با عمقِ فکرِ تب */
async function toCron(env, run, threadId, why) {
  const t = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE ai_threads SET lock_until=NULL, retry_at=?, updated_at=? WHERE thread_id=?").bind(t, t, threadId),
    logStmt(env, run.id, threadId, "step", why),
  ]);
  return { deferred: true };
}

/** کلیدهای جدول تطابق که در همین بسته‌اند و پذیرفتنی‌اند (غیرسبز) */
function validKeys(b, rows) {
  const ai = parse(b.ai_json, null);
  if (!aiUsable(ai)) return [];
  const all = new Map();
  for (const ln of ai.lines || []) for (const r of ln.rows || []) all.set(`${ln.line_id}|${r.key}`, r);
  for (const r of ai.header || []) all.set(`h|${r.key}`, r);
  return [...new Set((Array.isArray(rows) ? rows : []).map((x) => T(x).replace(/^\[|\]$/g, "")))].filter((k) => all.has(k) && acceptable(all.get(k)));
}

/** پروندهٔ یک دور برای مدل (ai-prompts.js:negotiationContext) */
async function buildContext(env, { run, cfg, th, st, lines, bundles, msgs }) {
  const lineOut = lines.map(C.lineOut);
  /* محکِ قیمت: سوابقِ همین قلم (از آماده‌سازی) و پیشنهادهای دیگرِ همین ارجاع — بی نام */
  const others = (await env.DB.prepare(`SELECT l.item_id, COUNT(*) AS n, MIN(l.price) AS min FROM sp_lines l JOIN sp_threads t ON t.id=l.thread_id
      WHERE t.assignment_id=? AND l.thread_id<>? AND l.price>0 AND l.state IN ('submitted','approved','proforma','final') GROUP BY l.item_id`).bind(run.assignment_id, th.id).all()).results || [];
  const bench = lineOut.map((l) => {
    const di = run.data.items.find((x) => x.id === l.item_id);
    const top = (di && di.hist && di.hist.top) || [];
    const avgs = top.map((s) => s.avg).filter((x) => x > 0);
    const o = others.find((x) => x.item_id === l.item_id);
    return {
      no: l.no, title: l.title,
      hist: avgs.length ? { avg: avgs.reduce((a, b) => a + b, 0) / avgs.length, min: Math.min(...top.map((s) => s.min).filter((x) => x > 0)), max: Math.max(...top.map((s) => s.max).filter((x) => x > 0)), n: top.reduce((a, s) => a + (s.n || 0), 0), ref: di.hist.ref } : null,
      others: o ? { n: o.n, min: o.min } : null,
    };
  });
  const bOut = bundles.map((b) => {
    const ai = parse(b.ai_json, null), acc = parse(b.accept_json, {});
    const usable = aiUsable(ai) ? ai : null;
    return { id: b.id, state: b.state, comment: b.comment, terms: C.termsOf(b), pf: b.pf_key ? b.pf_name || "پیش‌فاکتور" : null,
      items: bundleItems(b, lines).map((l) => ({ no: l.no, title: l.title })), ai: usable, accept: acc, match: usable ? resolve(usable, acc) : null };
  });
  /* حقیقت‌های واقعیِ مذاکره: تاریخِ نیازِ هر قلم (فایلِ درخواست) و سابقهٔ خریدِ شرکت از همین تأمین‌کننده (بررسی سوابق) —
     مدل فقط به همین‌ها تکیه می‌کند و عدد یا سابقه‌ای نمی‌سازد (ai-prompts.js) */
  const ids = [...new Set(lineOut.map((l) => l.item_id))];
  /* تاریخِ نیاز و «توضیحاتِ خودِ درخواست» (مشخصات، توضیح و مصرف‌کنندهٔ فایلِ درخواست) — هر سؤالی که جوابش این‌جا و در
     لایه‌ها نیست، «پرسش از کارشناس» می‌شود (ai-prompts.js) */
  const rowsOf = ids.length ? ((await env.DB.prepare(`SELECT id, need_date, spec, note, consumer FROM items WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all()).results || []) : [];
  const needOf = new Map(rowsOf.map((r) => [r.id, T(r.need_date) || null]));
  const descOf = new Map(rowsOf.map((r) => [r.id, [T(r.spec), T(r.note), T(r.consumer) ? `مصرف‌کننده: ${T(r.consumer)}` : ""].filter(Boolean).join(" · ") || null]));
  /* حداقلِ استعلامِ هر قلم (قواعدِ پنل پشتیبانی) و آنچه تا حالا رسیده — مدل می‌داند هنوز چند پیشنهادِ کامل لازم است */
  const cover = await coverNow(env, run.assignment_id);
  const minOf = new Map(cover.map((c) => [c.id, { need: c.need, have: c.have, why: c.why }]));
  const sk = C.nkey(th.supplier_name);
  const rel = lineOut.map((l) => {
    const di = run.data.items.find((x) => x.id === l.item_id);
    const top = (di && di.hist && di.hist.top) || [];
    const me = top.find((s) => C.nkey(s.name) === sk);
    return { no: l.no, title: l.title, n: me ? me.n || 0 : 0, last: me ? me.last || null : null, total: top.reduce((a, s) => a + (s.n || 0), 0), sups: top.length };
  });
  const supplierSrc = SOURCE_FA[st.source] || st.source || "—";
  const tInfo = { thread_id: th.id, supplier: th.supplier_name, supplier_id: th.supplier_id, phone: th.phone, label: th.phone_label, request_id: th.request_id, party: th.party, lines: lineOut };
  const asg = await env.DB.prepare("SELECT deadline_at FROM assignments WHERE id=?").bind(run.assignment_id).first();
  return negotiationContext({
    company: COMPANY(env), request: { id: th.request_id, party: th.party }, now: fmtFa(now()), deadline: asg && asg.deadline_at ? fmtFa(asg.deadline_at) : null,
    turn: (st.turns || 0) + 1, maxTurns: cfg.maxTurns, supplier: { name: th.supplier_name, source: supplierSrc },
    lines: lineOut.map((l) => ({ ...l, need: needOf.get(l.item_id) || null, desc: descOf.get(l.item_id) || null, min: minOf.get(l.item_id) || null })), terms: C.termsOf(th), rel,
    bundles: bOut, bench, memo: T(st.memo), errors: parse(st.errors_json, []), ask: parse(st.ask_json, null), transcript: threadSection(tInfo, msgs, { forModel: true }),
  });
}

/* ------------------------------------------------------------------ */
/* پروندهٔ md در انبار                                                   */
/* ------------------------------------------------------------------ */
async function mdOf(env, run, ex) {
  const [tr, ir] = await env.DB.batch([
    env.DB.prepare(`SELECT x.thread_id, x.source, x.state, x.turns, t.request_id, t.supplier_id, s.name AS supplier, p.phone, p.label, r.party
        FROM ai_threads x JOIN sp_threads t ON t.id=x.thread_id JOIN sp_suppliers s ON s.id=t.supplier_id LEFT JOIN sp_phones p ON p.id=t.phone_id
        JOIN assignments a ON a.id=t.assignment_id JOIN requests r ON r.id=a.request_id WHERE x.run_id=? ORDER BY x.created_at`).bind(run.id),
    env.DB.prepare("SELECT i.id, i.title, i.qty, i.unit, i.norm_json, r.party FROM items i JOIN requests r ON r.id=i.request_id WHERE i.assignment_id=? ORDER BY i.line_no").bind(run.assignment_id),
  ]);
  const threads = tr.results || [];
  const ids = threads.map((t) => t.thread_id);
  const msgsBy = new Map(), linesBy = new Map();
  if (ids.length) {
    const q = ids.map(() => "?").join(",");
    const [mm, ll] = await env.DB.batch([
      env.DB.prepare(`SELECT * FROM sp_msgs WHERE thread_id IN (${q}) ORDER BY id`).bind(...ids),
      env.DB.prepare(`SELECT thread_id, no, title FROM sp_lines WHERE thread_id IN (${q}) ORDER BY id`).bind(...ids),
    ]);
    for (const m of mm.results || []) { if (!msgsBy.has(m.thread_id)) msgsBy.set(m.thread_id, []); msgsBy.get(m.thread_id).push(C.msgOut(m)); }
    for (const l of ll.results || []) { if (!linesBy.has(l.thread_id)) linesBy.set(l.thread_id, []); linesBy.get(l.thread_id).push(l); }
  }
  const items = (ir.results || []).map((i) => { const n = parse(i.norm_json, null); return { ...i, head: n && n.head, layers: n && n.layers ? Object.entries(n.layers).map(([k, v]) => ({ k, v: v && typeof v === "object" ? v.v : v })) : [] }; });
  return runMd({
    company: COMPANY(env), run, request: { id: run.request_id, party: items[0] && items[0].party }, expert: `${ex.label || ex.name} (کارشناس هوشمند)`, items,
    threads: threads.map((t) => ({ ...t, lines: linesBy.get(t.thread_id) || [] })), msgsBy, now: now(),
  });
}
async function saveMd(env, run, ex) {
  const store = storage(env);
  if (!store) return null;
  const md = await mdOf(env, run, ex);
  const key = run.md_key || storageKey(run.assignment_id, `ai-negotiation-${run.request_id}.md`);
  await store.put(key, md, { contentType: "text/markdown; charset=utf-8" });
  if (!run.md_key) run.md_key = key;
  await env.DB.prepare("UPDATE ai_runs SET md_key=?, md_at=? WHERE id=?").bind(key, now(), run.id).run();
  return key;
}

/* ------------------------------------------------------------------ */
/* ۵. پایان: شرح و معیارها ← نامه ← جدول کمیسیون و تحویل ← خداحافظی        */
/* ------------------------------------------------------------------ */
async function stepClosing(env, run, k) {
  const { ex, rec } = k;
  const cl = run.data.closing || (run.data.closing = { step: "report" });
  const aid = run.assignment_id;
  if (cl.step === "report") {
    const context = await closingContext(env, run);
    rec.purpose = "closing"; rec.thread = null;
    const r = (await closingReport(rec.env, { company: COMPANY(env), context, model: k.cfg.model, effort: k.cfg.effort })).out;
    cl.report = { narrative: T(r.narrative), criteria: (r.criteria || []).map(T).filter(Boolean), challenges: (r.challenges || []).map(T).filter(Boolean), picks: r.picks || [], notes: T(r.notes) };
    cl.step = "letter";
    await env.DB.batch([saveData(env, run),
      env.DB.prepare("UPDATE assignments SET notes=? WHERE id=? AND (notes IS NULL OR notes='')").bind(clip(cl.report.notes, 900), aid),
      logStmt(env, run.id, null, "close", "شرحِ فرایند، معیارها و چالش‌ها نوشته شد."), next(env, run, 0)]);
    return { step: "close-report" };
  }
  if (cl.step === "letter") {
    const rep = cl.report || {};
    const transcript = [rep.narrative, rep.criteria && rep.criteria.length ? `معیارهای انتخاب:\n${rep.criteria.map((x) => `- ${x}`).join("\n")}` : "",
      rep.challenges && rep.challenges.length ? `چالش‌ها:\n${rep.challenges.map((x) => `- ${x}`).join("\n")}` : "",
      rep.picks && rep.picks.length ? `پیشنهاد برای هر قلم:\n${rep.picks.map((p) => `- ${p.item}: ${p.supplier} — ${p.why}`).join("\n")}` : ""].filter(Boolean).join("\n\n").slice(0, 3800);
    const t = now();
    const L = await env.DB.prepare("INSERT INTO letters (assignment_id,expert_id,transcript,state,meta_json,created_at,updated_at) VALUES (?,?,?,'transcribed',?,?,?) RETURNING *")
      .bind(aid, ex.id, transcript, JSON.stringify({ channel: "ai" }), t, t).first();
    const settings = await getSettings(env);
    const d = await bundleData(env, aid, settings, COMPANY(env));
    rec.purpose = "letter";
    let out;
    try {
      out = await writeLetter(rec.env, { transcript, request: d.request, items: d.items, quotes: d.quotes, allItems: d.items, notes: d.assignment.notes, expert: d.expert, expertName: d.expertName, company: d.company });
    } catch (e) {
      await env.DB.prepare("UPDATE letters SET state='failed', updated_at=? WHERE id=?").bind(now(), L.id).run();
      throw e;
    }
    const letter = { ...out.letter, date: d.date, number: null };
    const store = storage(env);
    let docxKey = null, fileError = null;
    try {
      if (!store) throw new Error("انبار فایل وصل نیست.");
      const tpl = await store.get("_templates/letterhead.docx");
      if (!tpl) throw new Error("سربرگ در انبار پیدا نشد.");
      const blob = await renderLetter(await new Response(tpl.body).arrayBuffer(), letter);
      docxKey = storageKey(aid, `letter-${L.id}.docx`);
      await store.put(docxKey, blob, { contentType: DOCX_MIME });
    } catch (e) { fileError = e.message; }
    cl.letter_id = L.id; cl.letter_file = !!docxKey; cl.step = "table";
    await env.DB.batch([
      env.DB.prepare("UPDATE letters SET letter_json=?, docx_key=?, meta_json=?, state='written', updated_at=? WHERE id=?").bind(JSON.stringify(letter), docxKey, JSON.stringify({ ...out.meta, channel: "ai" }), now(), L.id),
      env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)").bind(now(), `expert:${ex.id}`, "letter", run.request_id, JSON.stringify({ assignment_id: aid, letter_id: L.id, channel: "ai" })),
      saveData(env, run), logStmt(env, run.id, null, "close", `نامهٔ پیوست نوشته شد${fileError ? ` (فایل Word ساخته نشد: ${fileError})` : ""}.`), next(env, run, 0),
    ]);
    return { step: "close-letter" };
  }
  if (cl.step === "table") {
    const settings = await getSettings(env);
    const d = await bundleData(env, aid, settings, COMPANY(env));
    const finals = d.quotes.filter((q) => q.final && q.saved);
    d.commission_no = await recordCommission(env, aid, { expertId: ex.id, channel: "ai" });
    cl.commission_no = d.commission_no;
    const t = now();
    await env.DB.batch([
      env.DB.prepare("UPDATE alerts SET canceled_at=? WHERE assignment_id=? AND kind='stage' AND fired_at IS NULL AND canceled_at IS NULL").bind(t, aid),
      env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)").bind(t, `expert:${ex.id}`, "commission_table", run.request_id, JSON.stringify({ assignment_id: aid, lines: finals.length, commission_no: d.commission_no, channel: "ai" })),
      /* «تحویل» در پنل پشتیبانی (فاز ۳): جدول، برگهٔ درخواست و نامه برای تأیید یا ردِ کمیسیون */
      env.DB.prepare("UPDATE ai_runs SET review_json=? WHERE id=? AND review_json IS NULL").bind(JSON.stringify({ state: "new", at: t }), run.id),
      env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)").bind(t, `expert:${ex.id}`, "ai_delivery", run.request_id,
        JSON.stringify({ assignment_id: aid, run_id: run.id, commission_no: d.commission_no, lines: finals.length, short: (cl.short || []).length, channel: "ai" })),
    ]);
    /* تحویل در بات کارشناسان (همان «تحویل»): خلاصه، جدول، نامه و پروندهٔ md */
    let sent = 0;
    if (ex.telegram_chat && env.TG_BOT_TOKEN) {
      const api = telegram(env);
      const rep = cl.report || {};
      await api.sendMessage(ex.telegram_chat, [`🤖 <b>کارشناس هوشمند — تحویلِ درخواست ${esc(run.request_id)}</b>`, `جدول کمیسیون (کد TSA-PS-FO-${faN(d.commission_no)}) با ${faN(finals.length)} خطِ تأییدنهایی‌شده، نامهٔ پیوست و پروندهٔ مذاکره.`,
        rep.picks && rep.picks.length ? `\n<b>پیشنهاد:</b>\n${rep.picks.map((p) => `• ${esc(p.item)}: ${esc(p.supplier)} — ${esc(p.why)}`).join("\n")}` : "",
        cl.short && cl.short.length ? `\n⚠️ <b>کمتر از حداقلِ استعلام:</b> ${cl.short.map((c) => `${esc(c.title)} ${faN(c.have)} از ${faN(c.need)}`).join("، ")}` : "",
        "\n<i>این تحویل در «پنل پشتیبانی» برای تأیید کمیسیون است؛ درخواست تا «خاتمه» در کارتابل می‌ماند.</i>"].filter(Boolean).join("\n")).then(() => sent++).catch(() => {});
      await api.sendDocument(ex.telegram_chat, `کمیسیون-${run.request_id}.xlsx`, await commissionXlsx({ ...d, notes: d.assignment.notes })).then(() => sent++).catch(() => {});
      const store = storage(env);
      const L = cl.letter_id ? await env.DB.prepare("SELECT docx_key FROM letters WHERE id=?").bind(cl.letter_id).first() : null;
      const lf = L && L.docx_key && store ? await store.get(L.docx_key).catch(() => null) : null;
      if (lf) await api.sendDocument(ex.telegram_chat, `نامه-${run.request_id}.docx`, new Blob([await new Response(lf.body).arrayBuffer()], { type: DOCX_MIME })).then(() => sent++).catch(() => {});
      const md = await mdOf(env, run, ex).catch(() => null);
      if (md) await api.sendDocument(ex.telegram_chat, `پرونده-مذاکره-${run.request_id}.md`, new Blob([md], { type: "text/markdown" })).then(() => sent++).catch(() => {});
    }
    cl.sent = sent; cl.step = "bye";
    await env.DB.batch([saveData(env, run), logStmt(env, run.id, null, "close", `جدول کمیسیون (کد ${faN(d.commission_no)}) ساخته شد${sent ? ` و ${faN(sent)} پیام و فایل به تلگرام کارشناس رفت` : ""}.`), next(env, run, 0)]);
    return { step: "close-table" };
  }
  /* bye: پیامِ پایانی به گفت‌وگوهایی که تأمین‌کننده در آن‌ها پاسخ داده بود؛ بعد بسته */
  const eng = (await env.DB.prepare(`SELECT x.thread_id FROM ai_threads x WHERE x.run_id=? AND x.state<>'closed'
      AND EXISTS (SELECT 1 FROM sp_msgs m WHERE m.thread_id=x.thread_id AND m.who='s') LIMIT 6`).bind(run.id).all()).results || [];
  for (const e of eng) {
    const th = await C.threadRow(env, e.thread_id);
    if (!th) continue;
    const r = await C.postMsg(env, th, "e", "از همکاری و پاسخ شما سپاسگزاریم. پیشنهادهای این استعلام برای بررسی به کمیسیون معاملات شرکت رفت؛ نتیجه را کارشناسان شرکت اعلام می‌کنند.", { ai: true }).catch(() => null);
    if (r) await P.pushMsgs(env, th, r.msgs).catch(() => {});
  }
  const t = now();
  await saveMd(env, run, ex).catch(() => {});
  await env.DB.batch([
    env.DB.prepare("UPDATE ai_runs SET state='done', finished_at=?, updated_at=? WHERE id=?").bind(t, t, run.id),
    env.DB.prepare("UPDATE ai_threads SET state='closed', updated_at=? WHERE run_id=?").bind(t, run.id),
    logStmt(env, run.id, null, "run", "کارِ این درخواست تمام شد."),
  ]);
  return { step: "done" };
}

/** پروندهٔ پایانی برای مدل: اقلام، نامزدها، دعوت‌ها، نتیجهٔ هر گفت‌وگو و یادداشت‌های مذاکره */
async function closingContext(env, run) {
  const d = run.data;
  const [tr, qr] = await env.DB.batch([
    env.DB.prepare(`SELECT x.thread_id, x.source, x.state, x.turns, x.memo, s.name AS supplier,
        (SELECT COUNT(*) FROM sp_msgs m WHERE m.thread_id=x.thread_id AND m.who='s') AS replies
        FROM ai_threads x JOIN sp_threads t ON t.id=x.thread_id JOIN sp_suppliers s ON s.id=t.supplier_id WHERE x.run_id=? ORDER BY x.created_at`).bind(run.id),
    env.DB.prepare("SELECT item_id, supplier_name, qty, unit, price, dtime, pay, invoice, vat, valid_days, saved, final FROM quotes WHERE assignment_id=?").bind(run.assignment_id),
  ]);
  const threads = tr.results || [], quotes = qr.results || [];
  const ids = threads.map((t) => t.thread_id);
  const bundles = ids.length ? ((await env.DB.prepare(`SELECT thread_id, state, comment FROM sp_bundles WHERE thread_id IN (${ids.map(() => "?").join(",")}) ORDER BY id`).bind(...ids).all()).results || []) : [];
  const money = (n) => (n == null ? "—" : faN(Math.round(n).toLocaleString("en-US")).replace(/,/g, "٬"));
  const items = d.items.filter((x) => !x.skip).map((i) => {
    const fin = quotes.filter((q) => q.item_id === i.id && q.final && q.saved);
    return `- ${i.title} (${faN(i.qty == null ? "—" : i.qty)} ${i.unit || ""}): سوابق ${i.hist && i.hist.ok ? `${faN(i.hist.n)} تأمین‌کننده` : "بی سابقه"} · جستجو ${i.smart && i.smart.n != null ? `${faN(i.smart.n)} تأمین‌کننده` : "—"}\n`
      + (fin.length ? fin.map((q) => `    پیشنهادِ تأییدنهایی‌شده: ${q.supplier_name} — ${faN(q.qty)} ${q.unit || ""} × ${money(q.price)} ریال · تحویل ${q.dtime || "—"} · تسویه ${q.pay || "—"} · فاکتور ${q.invoice || "—"} · ارزش افزوده ${q.vat || "—"}`).join("\n") : "    پیشنهادِ تأییدنهایی‌شده‌ای نیست");
  }).join("\n");
  const cands = d.cands || [];
  const ths = threads.map((t) => `- ${t.supplier} (${SOURCE_FA[t.source] || t.source}) — ${faN(t.replies)} پیام از تأمین‌کننده، ${faN(t.turns)} دورِ مذاکره، وضعیت ${t.state}`
    + `${bundles.filter((b) => b.thread_id === t.thread_id && b.comment).map((b) => `\n    ${b.state === "returned" ? "برگشت" : b.state === "rejected" ? "رد" : b.state}: ${b.comment}`).join("")}`
    + `${t.memo ? `\n    یادداشتِ مذاکره: ${t.memo}` : ""}`).join("\n");
  const cover = await coverNow(env, run.assignment_id);
  const noPanel = cands.filter((c) => !threads.some((t) => C.nkey(t.supplier) === c.key)).length;
  const ho = d.handover;
  return [
    `درخواست خرید: ${run.request_id}`,
    "", "<حداقل_استعلام>",
    cover.map((c) => `- ${c.title}: لازم ${faN(c.need)} پیشنهادِ تأییدنهایی از تأمین‌کنندگانِ مختلف (${c.why}) — رسید ${faN(c.have)}${c.have < c.need ? " ⚠️ کمتر از حداقل" : ""}`).join("\n") || "—",
    ho ? `مهلتِ ${faN(ho.hours)} ساعتهٔ رسیدن به حد گذشت و ${fmtFa(ho.at)} کار برای استعلامِ بیشتر به کارشناسِ خرید هم واگذار شد.` : "",
    "</حداقل_استعلام>",
    "", "<اقلام_و_پیشنهادها>", items, "</اقلام_و_پیشنهادها>",
    "", `<نامزدها>\n${faN(cands.length)} تأمین‌کنندهٔ نامزد از سوابق خرید و جستجوی هوشمند پیدا شد؛ ${faN(noPanel)} نامزد شمارهٔ پنلِ تأییدشده نداشتند و دعوت نشدند (دعوت فقط با شماره‌ای که کارشناس تیکِ «پنل» زده باشد).\n</نامزدها>`,
    "", "<دعوت‌ها_و_گفت‌وگوها>", ths || "دعوتی نرفت.", "</دعوت‌ها_و_گفت‌وگوها>",
    "", "شرح، معیارها، چالش‌ها و پیشنهاد هر قلم را بنویس.",
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* گامِ فوری بعد از کارِ تأمین‌کننده (waitUntil)                            */
/* ------------------------------------------------------------------ */
/** sp-api.js و sp-bot.js بعد از پیام، ارسال، پیش‌فاکتور یا پیوستِ تأمین‌کننده صدا می‌زنند؛ اگر گفت‌وگو مال کارشناس هوشمندِ روشن است */
export function aiKick(env, ctx, threadId) {
  if (!ctx || typeof ctx.waitUntil !== "function" || !int(threadId)) return;
  ctx.waitUntil(kickNow(env, int(threadId)).catch((e) => console.error("ai kick", e && e.message)));
}
async function kickNow(env, threadId) {
  const row = await env.DB.prepare(`SELECT r.*, g.mode, g.config_json FROM ai_threads x JOIN ai_runs r ON r.id=x.run_id JOIN ai_agents g ON g.expert_id=r.expert_id
    WHERE x.thread_id=? AND x.state NOT IN ('closed','ask')`).bind(threadId).first().catch(() => null);
  if (!row || row.mode !== "on" || row.finished_at || row.state !== "work") return { skip: true };
  /* اجرا همین حالا سررسید می‌شود: اگر گامِ فوری فقط پیش‌فاکتور را خواند یا نرسید، Cronِ بعدی همین گفت‌وگو را برمی‌دارد */
  await env.DB.prepare("UPDATE ai_runs SET next_at=? WHERE id=? AND next_at>?").bind(now(), row.id, now()).run().catch(() => {});
  const run = { ...row, data: parse(row.data_json, {}) };
  const ex = await env.DB.prepare("SELECT id, name, label, telegram_chat, active FROM experts WHERE id=?").bind(run.expert_id).first();
  if (!ex || !ex.active) return { skip: true };
  const cfg = cfgOf(row);
  const rec = recorder(env);
  try { return await threadTurn(env, threadId, { run, ex, cfg, rec, fast: true }); }
  finally { await flushCalls(env, run, ex.id, rec); }
}

/* ------------------------------------------------------------------ */
/* API تب «کارشناس هوشمند» — /ai/*                                       */
/* ------------------------------------------------------------------ */
async function runsOf(env, exId) {
  return ((await env.DB.prepare(`SELECT r.id, r.assignment_id, r.request_id, r.state, r.data_json, r.error, r.md_key, r.created_at, r.updated_at, r.finished_at, rq.party,
      (SELECT COUNT(*) FROM ai_threads x WHERE x.run_id=r.id) AS invited,
      (SELECT COUNT(*) FROM ai_threads x WHERE x.run_id=r.id AND x.turns>0) AS engaged,
      (SELECT COUNT(*) FROM ai_threads x WHERE x.run_id=r.id AND x.state='final') AS finals,
      (SELECT COALESCE(SUM(c.cost_usd),0) FROM ai_calls c WHERE c.run_id=r.id) AS cost
    FROM ai_runs r JOIN requests rq ON rq.id=r.request_id WHERE r.expert_id=? ORDER BY r.id DESC LIMIT 30`).bind(exId).all()).results || [])
    .map((r) => { const d = parse(r.data_json, {}); return { id: r.id, assignment_id: r.assignment_id, request_id: r.request_id, party: r.party, state: r.state, state_fa: STATE_FA[r.state] || r.state,
      items: (d.items || []).length, invited: r.invited, engaged: r.engaged, finals: r.finals, cost: r.cost, error: r.error, md: !!r.md_key, created_at: r.created_at, updated_at: r.updated_at, finished_at: r.finished_at,
      commission_no: d.closing && d.closing.commission_no || null }; });
}

/** نامزدهای یک اجرا با شماره‌هایشان: ثبت‌شده‌ها (با تیکِ پنل) و پیداشده‌ها (پیشنهاد) */
async function candidatesView(env, run) {
  const d = run.data, cands = d.cands || [], man = manualOf(run);
  const keys = cands.map((c) => c.key), ids = man.map((m) => m.sid);
  const cond = [keys.length ? `s.name_n IN (${keys.map(() => "?").join(",")})` : null, ids.length ? `s.id IN (${ids.map(() => "?").join(",")})` : null].filter(Boolean).join(" OR ");
  const rows = cond ? ((await env.DB.prepare(`SELECT s.id AS sid, s.name, s.name_n, p.id AS pid, p.phone, p.label, p.panel FROM sp_suppliers s LEFT JOIN sp_phones p ON p.supplier_id=s.id
      WHERE s.demo=0 AND (${cond}) ORDER BY p.id`).bind(...keys, ...ids).all()).results || []) : [];
  const threads = (await env.DB.prepare("SELECT t.supplier_id FROM sp_threads t WHERE t.assignment_id=?").bind(run.assignment_id).all()).results || [];
  const invited = new Set(threads.map((t) => t.supplier_id));
  const phonesBy = (pred) => rows.filter(pred).filter((r) => r.pid).map((r) => ({ id: r.pid, phone: r.phone, label: r.label, panel: !!r.panel, mobile: isMobile(r.phone) }));
  const out = cands.map((c) => {
    const sid = (rows.find((r) => r.name_n === c.key) || {}).sid || null;
    const phones = phonesBy((r) => r.name_n === c.key);
    return { key: c.key, name: c.name, src: c.src, src_fa: SOURCE_FA[c.src] || c.src, rank: c.rank, items: c.items, sid, invited: !!(sid && invited.has(sid)), phones,
      found: c.found.filter((p) => !phones.some((x) => x.phone === p)).map((p) => ({ phone: p, mobile: isMobile(p) })) };
  });
  for (const m of man) {
    if (out.some((x) => x.sid === m.sid)) continue;
    out.unshift({ key: `m${m.sid}`, name: m.name, src: "manual", src_fa: SOURCE_FA.manual, rank: 0, items: d.items.map((x) => x.id), sid: m.sid, invited: invited.has(m.sid),
      phones: phonesBy((r) => r.sid === m.sid), found: [] });
  }
  return out;
}

async function runDetail(env, ex, id) {
  const r = await env.DB.prepare("SELECT * FROM ai_runs WHERE id=? AND expert_id=?").bind(int(id), ex.id).first();
  if (!r) throw new HttpError("این کار پیدا نشد.", 404);
  const run = { ...r, data: parse(r.data_json, {}) };
  const [th, lg, cs] = await env.DB.batch([
    env.DB.prepare(`SELECT x.*, s.name AS supplier, p.phone, p.label, (SELECT COUNT(*) FROM sp_msgs m WHERE m.thread_id=x.thread_id AND m.who='s') AS replies,
        (SELECT GROUP_CONCAT(b.state) FROM sp_bundles b WHERE b.thread_id=x.thread_id) AS bundles
      FROM ai_threads x JOIN sp_threads t ON t.id=x.thread_id JOIN sp_suppliers s ON s.id=t.supplier_id LEFT JOIN sp_phones p ON p.id=t.phone_id WHERE x.run_id=? ORDER BY x.created_at`).bind(run.id),
    env.DB.prepare("SELECT id, thread_id, at, kind, body FROM ai_log WHERE run_id=? ORDER BY id DESC LIMIT 200").bind(run.id),
    env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(cost_usd),0) AS cost FROM ai_calls WHERE run_id=?").bind(run.id),
  ]);
  const cover = await coverNow(env, run.assignment_id);
  const L = run.data.closing && run.data.closing.letter_id ? await env.DB.prepare("SELECT id, state, docx_key FROM letters WHERE id=?").bind(run.data.closing.letter_id).first() : null;
  return {
    run: { id: run.id, assignment_id: run.assignment_id, request_id: run.request_id, state: run.state, state_fa: STATE_FA[run.state] || run.state, error: run.error, md: !!run.md_key,
      created_at: run.created_at, finished_at: run.finished_at, finish: !!run.finish_at, closing: run.data.closing ? { step: run.data.closing.step, why: run.data.closing.why, report: run.data.closing.report || null,
        commission_no: run.data.closing.commission_no || null, letter: L ? { id: L.id, state: L.state, file: !!L.docx_key } : null, short: run.data.closing.short || [] } : null,
      handover: run.data.handover || null, review: parse(r.review_json, null) },
    items: (run.data.items || []).map((i) => ({ id: i.id, title: i.title, qty: i.qty, unit: i.unit, struct: i.struct || null, hist: i.hist ? { ok: i.hist.ok, msg: i.hist.msg, n: i.hist.n } : null, smart: i.smart || null,
      covered: (cover.find((c) => c.id === i.id) || {}).have || 0, need: (cover.find((c) => c.id === i.id) || {}).need || 1, why: (cover.find((c) => c.id === i.id) || {}).why || null })),
    candidates: await candidatesView(env, run),
    threads: (th.results || []).map((x) => ({ thread_id: x.thread_id, supplier: x.supplier, phone: x.phone, label: x.label, source: x.source, source_fa: SOURCE_FA[x.source] || x.source, state: x.state,
      turns: x.turns, replies: x.replies, bundles: x.bundles ? x.bundles.split(",") : [], memo: x.memo, fails: x.fails, retry_at: x.retry_at, last_ai_at: x.last_ai_at,
      ask: parse(x.ask_json, null) })),
    log: lg.results || [], calls: (cs.results || [])[0] || { n: 0, cost: 0 },
  };
}

/* ------------------------------------------------------------------ */
/* اداره از پنل پشتیبانی (فاز ۲) — /support/ai/*                          */
/* ------------------------------------------------------------------ */
/**
 * تبِ قدیمیِ «🤖 کارشناس هوشمند» پنل کارشناس (/ai/*): از فاز ۲ پنل پشتیبانی، کارشناس هوشمند فقط از «پنل پشتیبانی» اداره
 * می‌شود (درخواست مالک، مهر ۱۴۰۵) — کارشناس خودش آن را روشن، خاموش یا تنظیم نمی‌کند.
 */
export async function aiRoute(request, env, ctx, path, m, url, deps) {
  if (!path.startsWith("/ai/")) return null;
  await deps.requireExpert(request, env);
  throw new HttpError("کارشناس هوشمند حالا از «پنل پشتیبانی» اداره می‌شود: تیکِ «هوشمند / دستی» هر کارشناس، کارها، فراخوانی‌ها و تنظیماتش همان‌جاست.", 403);
}

/** صفحهٔ اولِ تبِ پشتیبانی: کارشناسانِ فعال با تیکِ «هوشمند / دستی»، کارهای زنده، و «پرسش از کارشناس»های بی‌پاسخ */
async function aiExperts(env) {
  const [ex, asks, ho, dl] = await env.DB.batch([
    env.DB.prepare(`SELECT e.id, e.name, e.label, e.senior, (e.telegram_chat IS NOT NULL) AS tg, g.mode, g.on_at, g.updated_at, g.updated_by,
        (SELECT COUNT(*) FROM ai_runs r WHERE r.expert_id=e.id AND r.finished_at IS NULL) AS live,
        (SELECT COUNT(*) FROM ai_runs r WHERE r.expert_id=e.id) AS runs,
        (SELECT COUNT(*) FROM ai_threads x JOIN sp_threads t ON t.id=x.thread_id JOIN assignments a ON a.id=t.assignment_id WHERE a.expert_id=e.id AND ${AI_ASK_SQL}) AS asks,
        (SELECT COALESCE(SUM(c.cost_usd),0) FROM ai_calls c WHERE c.expert_id=e.id) AS cost
      FROM experts e LEFT JOIN ai_agents g ON g.expert_id=e.id WHERE e.active=1 ORDER BY (g.mode='on') DESC, e.senior DESC, e.name`),
    env.DB.prepare(`SELECT x.thread_id, x.ask_json, x.updated_at, r.expert_id, r.id AS run_id, t.request_id, s.name AS supplier
      FROM ai_threads x JOIN ai_runs r ON r.id=x.run_id JOIN sp_threads t ON t.id=x.thread_id JOIN assignments a ON a.id=t.assignment_id JOIN sp_suppliers s ON s.id=t.supplier_id
      WHERE ${AI_ASK_SQL} ORDER BY x.updated_at DESC LIMIT 50`),
    /* فاز ۳: کارهایی که به حداقلِ استعلام نرسیدند و به کارشناس واگذار شدند (هنوز باز)، و تحویل‌های بررسی‌نشده */
    env.DB.prepare(`SELECT r.id, r.assignment_id, r.expert_id, r.request_id, r.handover_at, json_extract(r.data_json,'$.handover.items') AS items
      FROM ai_runs r WHERE r.handover_at IS NOT NULL AND r.finished_at IS NULL ORDER BY r.handover_at DESC LIMIT 30`),
    env.DB.prepare("SELECT COUNT(*) AS n FROM ai_runs WHERE json_extract(review_json,'$.state')='new'"),
  ]);
  return {
    experts: (ex.results || []).map((e) => ({ ...e, tg: !!e.tg, on: e.mode === "on", senior: e.senior ? 1 : 0 })),
    asks: (asks.results || []).map((a) => { const k = parse(a.ask_json, {}) || {}; return { thread_id: a.thread_id, run_id: a.run_id, expert_id: a.expert_id, request_id: a.request_id, supplier: a.supplier, q: k.q || "", at: k.at || a.updated_at }; }),
    handovers: (ho.results || []).map((h) => ({ id: h.id, assignment_id: h.assignment_id, expert_id: h.expert_id, request_id: h.request_id, at: h.handover_at, items: parse(h.items, []) || [] })),
    deliveries: { new: ((dl.results || [])[0] || {}).n || 0 },
    sms: smsReady(env),
  };
}

/* ------------------------------------------------------------------ */
/* تحویل‌های کارشناس هوشمند — بررسی و تأیید یا ردِ کمیسیون در پنل پشتیبانی (فاز ۳) */
/* ------------------------------------------------------------------ */
const REVIEW_FA = { new: "🆕 منتظرِ بررسی", ok: "✓ کمیسیون تأیید شد", rejected: "✗ رد شد" };
/** فهرستِ تحویل‌ها: هر کاری که جدول کمیسیونش ساخته شد — state: new | ok | rejected | (همه) */
async function deliveries(env, url) {
  const st = T(url.searchParams.get("state"));
  const cond = ["new", "ok", "rejected"].includes(st) ? `json_extract(r.review_json,'$.state')='${st}'` : "r.review_json IS NOT NULL";
  const rows = (await env.DB.prepare(`SELECT r.id, r.assignment_id, r.expert_id, r.request_id, r.state, r.review_json, r.finished_at, r.updated_at, r.handover_at, rq.party,
      a.commission_no, a.commission_at, json_extract(r.data_json,'$.closing.why') AS why, json_extract(r.data_json,'$.closing.short') AS short,
      (SELECT COUNT(*) FROM items i WHERE i.assignment_id=r.assignment_id AND i.state='open') AS items,
      (SELECT COUNT(*) FROM items i WHERE i.assignment_id=r.assignment_id AND i.state='open' AND i.commission_ok=1) AS ok_items,
      (SELECT COUNT(*) FROM quotes q WHERE q.assignment_id=r.assignment_id AND q.saved=1 AND q.final=1) AS finals
    FROM ai_runs r JOIN requests rq ON rq.id=r.request_id JOIN assignments a ON a.id=r.assignment_id WHERE ${cond} ORDER BY r.id DESC LIMIT 100`).all()).results || [];
  return { deliveries: rows.map(({ review_json, short, ...r }) => { const rv = parse(review_json, {}) || {}; return { ...r, review: rv, review_fa: REVIEW_FA[rv.state] || "—", short: parse(short, []) || [] }; }) };
}
/** یک تحویل: شرحِ فرایند، حداقلِ استعلام و پیشنهادهای هر قلم، و متنِ نامه — فایل‌ها از مسیرهای /support/assignments/… */
async function delivery(env, id) {
  const r = await env.DB.prepare("SELECT * FROM ai_runs WHERE id=?").bind(id).first();
  if (!r || !r.review_json) throw new HttpError("این تحویل پیدا نشد.", 404);
  const run = { ...r, data: parse(r.data_json, {}) };
  const cl = run.data.closing || {};
  const [ar, ir, qr, lr] = await env.DB.batch([
    env.DB.prepare(`SELECT a.id, a.request_id, a.expert_id, a.commission_no, a.commission_at, a.notes, a.closed_at, rq.party, rq.date, e.name AS expert_name, e.label AS expert_label
      FROM assignments a JOIN requests rq ON rq.id=a.request_id JOIN experts e ON e.id=a.expert_id WHERE a.id=?`).bind(run.assignment_id),
    env.DB.prepare("SELECT id, title, qty, unit, state, commission_ok FROM items WHERE assignment_id=? ORDER BY line_no, id").bind(run.assignment_id),
    env.DB.prepare(`SELECT item_id, supplier_name, qty, unit, price, dtime, pay, invoice, vat, valid_days, source FROM quotes WHERE assignment_id=? AND saved=1 AND final=1
      ORDER BY item_id, price`).bind(run.assignment_id),
    env.DB.prepare("SELECT id, state, letter_json, docx_key FROM letters WHERE id=?").bind(cl.letter_id || 0),
  ]);
  const a = (ar.results || [])[0] || {};
  const L = (lr.results || [])[0] || null;
  const letter = L ? parse(L.letter_json, null) : null;
  const cover = await coverNow(env, run.assignment_id);
  const rv = parse(r.review_json, {}) || {};
  return {
    run: { id: r.id, assignment_id: r.assignment_id, expert_id: r.expert_id, request_id: r.request_id, state: r.state, state_fa: STATE_FA[r.state] || r.state, finished_at: r.finished_at,
      handover: run.data.handover || null, review: rv, review_fa: REVIEW_FA[rv.state] || "—", md: !!r.md_key },
    request: { id: a.request_id, party: a.party, date: a.date, expert: a.expert_label || a.expert_name, commission_no: a.commission_no, commission_at: a.commission_at, notes: a.notes, closed: !!a.closed_at },
    report: cl.report || null, why: cl.why || null, short: cl.short || [],
    items: (ir.results || []).map((i) => ({ ...i, cover: cover.find((c) => c.id === i.id) || null, quotes: (qr.results || []).filter((q) => q.item_id === i.id) })),
    letter: letter ? { to: letter.to || null, subject: letter.subject || null, paragraphs: letter.paragraphs || [], closing: letter.closing || null, file: !!(L && L.docx_key) } : null,
  };
}
/**
 * تصمیمِ پشتیبانی روی یک تحویل. ok: تیکِ «تأیید کمیسیون» همهٔ اقلامِ بازِ همان درخواست (همان مسیرِ تبِ «تأیید کمیسیون»:
 * رخداد و پیامِ «🔒 خاتمه» به کارشناس). رد (با دلیل): درخواست کامل به کارشناس برمی‌گردد — گفت‌وگوها و خط‌های کارشناس هوشمند
 * هم آزاد (ai-lock.js:aiRejected) — تأییدِ قبلی برداشته می‌شود و دلیل در تلگرامِ کارشناس می‌رود. تصمیم را می‌شود عوض کرد.
 */
async function reviewDelivery(env, id, b, deps) {
  const r = await env.DB.prepare("SELECT id, assignment_id, expert_id, request_id, review_json FROM ai_runs WHERE id=?").bind(id).first();
  if (!r || !r.review_json) throw new HttpError("این تحویل پیدا نشد.", 404);
  const ok = !!(b && b.ok === true);
  const reason = T(b && b.reason).slice(0, 1000);
  if (!ok && !reason) throw new HttpError("دلیلِ رد را بنویسید — برای کارشناس فرستاده می‌شود.");
  const t = now();
  const review = { ...(parse(r.review_json, {}) || {}), state: ok ? "ok" : "rejected", decided_at: t, by: "support", reason: ok ? null : reason };
  await env.DB.prepare("UPDATE ai_runs SET review_json=?, updated_at=? WHERE id=?").bind(JSON.stringify(review), t, r.id).run();
  const ids = ((await env.DB.prepare("SELECT id FROM items WHERE assignment_id=? AND state='open'").bind(r.assignment_id).all()).results || []).map((x) => x.id);
  const res = ids.length ? await setCommission(env, { item_ids: ids, ok }) : { changed: 0, notified: 0 };
  if (!ok) {
    const ex = await env.DB.prepare("SELECT telegram_chat FROM experts WHERE id=?").bind(r.expert_id).first();
    const stmts = [env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)").bind(t, "support", "ai_reject", r.request_id,
      JSON.stringify({ assignment_id: r.assignment_id, expert_id: r.expert_id, run_id: r.id, reason }))];
    if (ex && ex.telegram_chat) {
      stmts.push(queueStmt(env, `ai-rej:${r.id}:${t}`, ex.telegram_chat, `↩️ <b>پشتیبانی تحویلِ کارشناس هوشمند برای درخواست ${esc(r.request_id)} را رد کرد</b>\n\nدلیل: ${esc(reason)}\n\n`
        + "این درخواست حالا کامل دستِ شماست: گفت‌وگوها و خط‌های استعلامِ کارشناس هوشمند هم برایتان باز شد و کار را خودتان ادامه می‌دهید.",
        [[{ text: "📋 باز کردنِ پنل کارشناس", web_app: { url: expertAppUrl(env) } }]]));
      res.notified = (res.notified || 0) + 1;
    }
    await env.DB.batch(stmts);
  }
  if (deps && deps.flush) deps.flush(res.notified);
  return { ok: true, review, changed: res.changed || 0, notified: res.notified || 0 };
}

/**
 * /support/ai/*؛ sub بقیهٔ مسیر بعد از /support/ai. «/experts» فهرستِ بالاست؛ «/<کارشناس>/…» همان داشبوردِ تبِ قدیمی برای
 * همان کارشناس: state، mode (تیکِ هوشمند/دستی)، config، runs، calls، sms، phones. deps: {readJson, json}.
 * ردیفِ ai_agents با اولین تیک یا تنظیم ساخته می‌شود؛ updated_by «support».
 */
export async function aiAdmin(request, env, ctx, sub, m, url, deps) {
  const { json, readJson } = deps;
  if (sub === "/experts" && m === "GET") return json(await aiExperts(env));
  /* فاز ۳: قواعدِ «حداقلِ استعلام» (سراسری) و تحویل‌های کارشناس هوشمند */
  if (sub === "/rules" && m === "GET") {
    return json({ rules: await getRules(env), base: Math.max(1, Number((await getSettings(env)).minSuppliers) || 1), dims: DIMS.map((d) => ({ key: d, fa: DIM_FA[d], unit: DIM_UNIT[d] })) });
  }
  if (sub === "/rules" && m === "PUT") {
    const rules = await saveRules(env, await readJson(request), "support");
    /* کارهای در حالِ مذاکره همین حالا با قواعدِ تازه دوباره بسنجند */
    await env.DB.prepare("UPDATE ai_runs SET next_at=? WHERE state='work' AND finished_at IS NULL AND next_at>?").bind(now(), now()).run();
    return json({ ok: true, rules });
  }
  if (sub === "/deliveries" && m === "GET") return json(await deliveries(env, url));
  let dm;
  if ((dm = /^\/deliveries\/(\d+)$/.exec(sub)) && m === "GET") return json(await delivery(env, int(dm[1])));
  if ((dm = /^\/deliveries\/(\d+)\/review$/.exec(sub)) && m === "POST") return json(await reviewDelivery(env, int(dm[1]), await readJson(request), deps));
  const top = /^\/(\d+)(\/.*)$/.exec(sub);
  if (!top) throw new HttpError("مسیر پیدا نشد.", 404);
  const ex = await env.DB.prepare("SELECT id, name, label, telegram_chat, active FROM experts WHERE id=?").bind(int(top[1])).first();
  if (!ex) throw new HttpError("کارشناس پیدا نشد.", 404);
  const path = top[2];
  const ag = await agentOf(env, ex.id);
  const by = "support";
  let mm;

  if (path === "/state" && m === "GET") {
    const open = (await env.DB.prepare(`SELECT a.id, a.request_id, r.party, a.dispatched_at, (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id AND i.state='open') AS items
        FROM assignments a JOIN requests r ON r.id=a.request_id WHERE a.expert_id=? AND a.dispatched_at IS NOT NULL AND a.closed_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM ai_runs x WHERE x.assignment_id=a.id) ORDER BY a.dispatched_at DESC LIMIT 20`).bind(ex.id).all()).results || [];
    const tot = await env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(cost_usd),0) AS cost FROM ai_calls WHERE expert_id=?").bind(ex.id).first();
    const cfg = cfgOf(ag);
    return json({ expert: { id: ex.id, name: ex.name, label: ex.label, active: !!ex.active, tg: !!ex.telegram_chat },
      agent: { mode: ag ? ag.mode : "off", on: !!ag && ag.mode === "on", on_at: ag ? ag.on_at : null, cfg, updated_at: ag ? ag.updated_at : null, updated_by: ag ? ag.updated_by : null },
      defaults: AI_DEFAULTS, markets: MARKETS.map(({ key, fa }) => ({ key, fa })), maxMarkets: MAX_MARKETS, model: cfg.model, sms: smsReady(env),
      models: Object.entries(AGENT_MODELS).map(([id, x]) => ({ id, fa: x.fa, price: x.price, effort: x.effort })), efforts: EFFORTS,
      runs: await runsOf(env, ex.id), open: open.filter((a) => a.items > 0), totals: tot || { n: 0, cost: 0 }, purposes: PURPOSE_FA });
  }
  /* تیکِ «🤖 هوشمند / ✋ دستی»: هوشمند ارجاع‌های از همین لحظه را خودکار برمی‌دارد و کارهای کارشناس را قفل می‌کند (ai-lock.js)؛
     دستی همهٔ کارهای کارشناس هوشمند را همان لحظه نگه می‌دارد و قفل‌ها را برمی‌دارد */
  if (path === "/mode" && m === "PUT") {
    const b = await readJson(request);
    const on = b.on === true;
    const t = now();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO ai_agents (expert_id,mode,on_at,config_json,updated_at,updated_by) VALUES (?,?,?,NULL,?,?)
        ON CONFLICT(expert_id) DO UPDATE SET mode=excluded.mode, on_at=CASE WHEN excluded.mode='on' THEN excluded.on_at ELSE ai_agents.on_at END,
          updated_at=excluded.updated_at, updated_by=excluded.updated_by`).bind(ex.id, on ? "on" : "off", on ? t : null, t, by),
      env.DB.prepare("INSERT INTO events (at,actor,kind,payload_json) VALUES (?,?,?,?)").bind(t, "support", on ? "ai_on" : "ai_off", JSON.stringify({ expert_id: ex.id })),
    ]);
    return json({ ok: true, on });
  }
  if (path === "/config" && m === "PUT") {
    const b = await readJson(request);
    const cur = cfgOf(ag), nx = { ...cur };
    for (const k of Object.keys(LIMITS)) if (b[k] !== undefined) nx[k] = Number(b[k]);
    if (Array.isArray(b.markets)) nx.markets = b.markets;
    if (b.model !== undefined) { if (!modelOk(b.model)) throw new HttpError("این مدل در فهرست نیست."); nx.model = b.model; }
    if (b.effort !== undefined) { if (!EFFORTS.includes(b.effort)) throw new HttpError("عمقِ فکرِ نامعتبر."); nx.effort = b.effort; }
    const c = cfgOf({ config_json: JSON.stringify(nx) });
    await env.DB.prepare(`INSERT INTO ai_agents (expert_id,mode,config_json,updated_at,updated_by) VALUES (?,'off',?,?,?)
      ON CONFLICT(expert_id) DO UPDATE SET config_json=excluded.config_json, updated_at=excluded.updated_at, updated_by=excluded.updated_by`).bind(ex.id, JSON.stringify(c), now(), by).run();
    return json({ ok: true, cfg: c });
  }
  if (path === "/runs" && m === "POST") {
    if (!ag || ag.mode !== "on") throw new HttpError("اول تیکِ «هوشمند»ِ این کارشناس را بزنید.", 409);
    const b = await readJson(request);
    const a = await env.DB.prepare("SELECT id, request_id, expert_id, dispatched_at, closed_at FROM assignments WHERE id=?").bind(int(b.assignment_id)).first();
    if (!a || a.expert_id !== ex.id) throw new HttpError("این ارجاع مالِ این کارشناس نیست.", 403);
    if (!a.dispatched_at || a.closed_at) throw new HttpError("این ارجاع ارسال‌نشده یا بسته است.", 409);
    return json({ ok: true, run_id: await createRun(env, a, "manual") });
  }
  if ((mm = /^\/runs\/(\d+)$/.exec(path)) && m === "GET") return json(await runDetail(env, ex, mm[1]));
  if ((mm = /^\/runs\/(\d+)\/act$/.exec(path)) && m === "POST") {
    const b = await readJson(request);
    const r = await env.DB.prepare("SELECT * FROM ai_runs WHERE id=? AND expert_id=?").bind(int(mm[1]), ex.id).first();
    if (!r) throw new HttpError("این کار پیدا نشد.", 404);
    const t = now();
    /* این‌جا فقط ستون‌های خودش را می‌نویسد (paused_from، finish_at، manual_json) — data_json مالِ گام‌های Cron است */
    if (b.action === "pause") {
      if (r.finished_at || r.state === "paused") throw new HttpError(r.finished_at ? "این کار تمام شده است." : "این کار از قبل متوقف است.", 409);
      await env.DB.batch([env.DB.prepare("UPDATE ai_runs SET state='paused', paused_from=?, updated_at=? WHERE id=? AND state<>'paused'").bind(r.state, t, r.id), logStmt(env, r.id, null, "run", "متوقف شد (پنل پشتیبانی).")]);
    } else if (b.action === "resume") {
      if (r.state !== "paused") throw new HttpError("این کار متوقف نیست.", 409);
      await env.DB.batch([env.DB.prepare("UPDATE ai_runs SET state=?, next_at=?, updated_at=? WHERE id=?").bind(r.paused_from || "work", t, t, r.id), logStmt(env, r.id, null, "run", "ادامه (پنل پشتیبانی).")]);
    } else if (b.action === "finish") {
      if (r.state !== "work") throw new HttpError("«پایان مذاکره» فقط در مرحلهٔ دعوت و مذاکره.", 409);
      await env.DB.batch([env.DB.prepare("UPDATE ai_runs SET finish_at=?, next_at=?, updated_at=? WHERE id=?").bind(t, t, t, r.id), logStmt(env, r.id, null, "run", "«پایان مذاکره» خواسته شد (پنل پشتیبانی).")]);
    } else if (b.action === "retry") {
      await env.DB.batch([env.DB.prepare("UPDATE ai_threads SET fails=0, retry_at=?, lock_until=NULL WHERE run_id=? AND fails>0").bind(t, r.id),
        env.DB.prepare("UPDATE ai_runs SET next_at=?, error=NULL, lock_until=NULL, updated_at=? WHERE id=?").bind(t, t, r.id), logStmt(env, r.id, null, "run", "تلاشِ دوباره (پنل پشتیبانی).")]);
    } else throw new HttpError("کارِ نامعتبر.");
    return json({ ok: true });
  }
  /* تأمین‌کنندهٔ دستی برای همین درخواست: نام + شماره (+ تیکِ پنل) */
  if ((mm = /^\/runs\/(\d+)\/supplier$/.exec(path)) && m === "POST") {
    const b = await readJson(request);
    const r = await env.DB.prepare("SELECT * FROM ai_runs WHERE id=? AND expert_id=?").bind(int(mm[1]), ex.id).first();
    if (!r) throw new HttpError("این کار پیدا نشد.", 404);
    if (r.finished_at) throw new HttpError("این کار تمام شده است.", 409);
    const s = await C.savePhone(env, ex.id, { supplier_id: b.supplier_id, supplier_name: b.supplier_name, phone: b.phone, label: b.label, panel: b.panel !== false });
    const man = manualOf(r).filter((x) => x.sid !== s.supplier.id).concat([{ sid: s.supplier.id, name: s.supplier.name }]);
    await env.DB.batch([env.DB.prepare("UPDATE ai_runs SET manual_json=?, next_at=?, updated_at=? WHERE id=?").bind(JSON.stringify(man), now(), now(), r.id),
      logStmt(env, r.id, null, "step", `پشتیبانی «${s.supplier.name}» را با شمارهٔ ${C.maskPhone(s.phone.phone)} ${s.phone.panel ? "(پنل ✅)" : "(بی تیکِ پنل)"} به این درخواست افزود.`)]);
    return json({ ok: true, ...s });
  }
  if ((mm = /^\/runs\/(\d+)\/md$/.exec(path)) && m === "GET") {
    const r = await env.DB.prepare("SELECT * FROM ai_runs WHERE id=? AND expert_id=?").bind(int(mm[1]), ex.id).first();
    if (!r) throw new HttpError("این کار پیدا نشد.", 404);
    const md = await mdOf(env, { ...r, data: parse(r.data_json, {}) }, ex);
    return new Response(md, { headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`پرونده-مذاکره-${r.request_id}.md`)}`, "cache-control": "private, no-store" } });
  }
  /* فراخوانی‌های مدل: فهرست (بی متن) و یکی با درخواست و پاسخِ کامل */
  if (path === "/calls" && m === "GET") {
    const run = int(url.searchParams.get("run")), before = int(url.searchParams.get("before"));
    const rows = (await env.DB.prepare(`SELECT id, run_id, thread_id, purpose, model, effort, in_tok, out_tok, cache_read, cache_write, cost_usd, ms, status, error, at FROM ai_calls
        WHERE expert_id=?${run ? " AND run_id=?" : ""}${before ? " AND id<?" : ""} ORDER BY id DESC LIMIT 60`).bind(ex.id, ...(run ? [run] : []), ...(before ? [before] : [])).all()).results || [];
    return json({ calls: rows.map((c) => ({ ...c, purpose_fa: PURPOSE_FA[c.purpose] || c.purpose })) });
  }
  if ((mm = /^\/calls\/(\d+)$/.exec(path)) && m === "GET") {
    const c = await env.DB.prepare("SELECT * FROM ai_calls WHERE id=? AND expert_id=?").bind(int(mm[1]), ex.id).first();
    if (!c) throw new HttpError("این فراخوانی پیدا نشد.", 404);
    return json({ call: { ...c, purpose_fa: PURPOSE_FA[c.purpose] || c.purpose } });
  }
  /* «مقایسهٔ مدل»: همان درخواستِ ضبط‌شدهٔ یک دورِ مذاکره یا شرحِ پایانی با مدل یا عمقِ فکرِ دیگر — فقط خروجی، بی اجرا؛
     خودش هم با هزینه‌اش در فهرستِ فراخوانی‌ها می‌نشیند (purpose: compare) */
  if ((mm = /^\/calls\/(\d+)\/replay$/.exec(path)) && m === "POST") {
    const b = await readJson(request);
    const c = await env.DB.prepare("SELECT * FROM ai_calls WHERE id=? AND expert_id=?").bind(int(mm[1]), ex.id).first();
    if (!c) throw new HttpError("این فراخوانی پیدا نشد.", 404);
    if (!["negotiate", "closing", "compare"].includes(c.purpose)) throw new HttpError("فقط دورِ مذاکره و شرحِ پایانی قابلِ مقایسه‌اند.", 422);
    if (!modelOk(b.model)) throw new HttpError("این مدل در فهرست نیست.");
    const req = parse(c.request_json, null);
    if (!req) throw new HttpError("درخواستِ ضبط‌شده کامل نیست (بریده شده) و قابلِ تکرار نیست.", 422);
    const rec = recorder(env);
    rec.purpose = "compare"; rec.thread = c.thread_id;
    const t0 = now();
    let out, error = null;
    try { out = await replayCall(rec.env, req, { model: b.model, effort: EFFORTS.includes(b.effort) ? b.effort : "medium" }); }
    catch (e) { error = e.message; }
    await flushCalls(env, { id: c.run_id }, ex.id, rec);
    const last = await env.DB.prepare("SELECT id, model, effort, in_tok, out_tok, cache_read, cost_usd, ms FROM ai_calls WHERE expert_id=? AND purpose='compare' ORDER BY id DESC LIMIT 1").bind(ex.id).first();
    if (error) throw new HttpError(`مقایسه نشد: ${error}`, 502);
    return json({ ok: true, out: out.out, model: out.model, call: last, ms: now() - t0 });
  }
  /* پیامک‌ها: هر پیامکِ گفت‌وگوهای همین کارشناس — رفت یا نه، از چه راهی، چرا (متن با رمزِ پوشیده) */
  if (path === "/sms" && m === "GET") {
    const rows = (await env.DB.prepare(`SELECT m.id, m.kind, m.body, m.at, m.via, m.status, m.error, m.ref, p.phone, p.label, p.panel, s.name AS supplier, t.request_id
        FROM sp_sms m JOIN sp_phones p ON p.id=m.phone_id JOIN sp_suppliers s ON s.id=p.supplier_id LEFT JOIN sp_threads t ON t.id=m.thread_id
        WHERE m.expert_id=? ORDER BY m.id DESC LIMIT 80`).bind(ex.id).all()).results || [];
    return json({ sms: rows.map((r) => ({ ...r, panel: !!r.panel })), ready: smsReady(env) });
  }
  /* دفترچهٔ شماره‌ها: جستجو، شمارهٔ تازه، تیکِ «پنل» — مشترک بین همهٔ کارشناس‌ها */
  if (path === "/phones" && m === "GET") {
    const q = C.nkey(url.searchParams.get("q"));
    const rows = (await env.DB.prepare(`SELECT s.id AS sid, s.name, p.id AS pid, p.phone, p.label, p.panel, p.panel_at FROM sp_suppliers s LEFT JOIN sp_phones p ON p.supplier_id=s.id
        WHERE s.demo=0${q ? " AND (s.name_n LIKE ? OR p.phone LIKE ?)" : ""} ORDER BY s.id DESC, p.id LIMIT 200`).bind(...(q ? [`%${q}%`, `%${C.latin(q)}%`] : [])).all()).results || [];
    const byS = new Map();
    for (const r of rows) {
      if (!byS.has(r.sid)) byS.set(r.sid, { id: r.sid, name: r.name, phones: [] });
      if (r.pid) byS.get(r.sid).phones.push({ id: r.pid, phone: r.phone, label: r.label, panel: !!r.panel, panel_at: r.panel_at, mobile: isMobile(r.phone) });
    }
    return json({ suppliers: [...byS.values()].slice(0, 60) });
  }
  if (path === "/phones" && m === "POST") return json({ ok: true, ...(await C.savePhone(env, ex.id, await readJson(request))) });
  if ((mm = /^\/phones\/(\d+)$/.exec(path)) && m === "PUT") {
    const b = await readJson(request);
    const ph = await env.DB.prepare("SELECT p.id, s.demo FROM sp_phones p JOIN sp_suppliers s ON s.id=p.supplier_id WHERE p.id=?").bind(int(mm[1])).first();
    if (!ph || ph.demo) throw new HttpError("این شماره پیدا نشد.", 404);
    if (b.panel !== undefined) await C.setPanel(env, ph.id, !!b.panel, null);
    if (T(b.label)) await env.DB.prepare("UPDATE sp_phones SET label=? WHERE id=?").bind(C.nrm(b.label).slice(0, 30), ph.id).run();
    /* تیکِ تازه: کارهای در حالِ مذاکره همین حالا دوباره نگاه کنند */
    if (b.panel === true) await env.DB.prepare("UPDATE ai_runs SET next_at=? WHERE expert_id=? AND state='work' AND finished_at IS NULL").bind(now(), ex.id).run();
    return json({ ok: true });
  }
  throw new HttpError("مسیر پیدا نشد.", 404);
}
