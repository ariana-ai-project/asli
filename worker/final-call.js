/**
 * «📨 فراخوانِ پیش‌فاکتورِ رسمی» و «📦 بستهٔ کمیسیون» — درخواست مالک (۲۷ مهر ۱۴۰۵)
 *
 * لحظهٔ تصمیم: هر قلمِ باز به حداقلِ استعلامِ ردهٔ خودش رسیده — کارشناس هوشمند خودش (ai-agent.js:stepClosing)، و کارِ دستی با
 * دکمهٔ کارشناس پیش از جدول کمیسیون. همان لحظه ثبت می‌شود (final_calls.at) و مهلت = تصمیم + window_h (پیش‌فرض ۲۴ ساعت).
 *
 * به هر تأمین‌کننده‌ای که خطِ «تأیید نهایی» دارد پیامک می‌رود، مگر پیش‌فاکتورِ رسمیِ معتبر داشته باشد:
 *   «پیشنهاد شما با شمارهٔ X وارد کمیسیون معاملات شرکت … می‌شود؛ تا [مهلت] فرصت دارید پیش‌فاکتور رسمی با حداقل ۲۴ ساعت
 *   اعتبار ارسال کنید» — و اگر پشتیبانی روشن گذاشته، کمترین قیمتِ رسیده («می‌توانید قیمت نهایی‌تان را اعلام کنید»).
 *   دو گروه پیامک می‌گیرند: بی پیش‌فاکتورِ رسمی (need)، و با پیش‌فاکتوری که اعتبارش تا «ورود به کمیسیون + min_valid_h» نمی‌رسد
 *   (renew). شمارهٔ تأمین‌کننده نیست؟ به کارشناس (پیامک اگر شماره دارد، تلگرام و اعلان): «شماره‌اش را بدهید یا خودتان بفرستید».
 *
 * تأمین‌کننده پیش‌فاکتور را با پنل یا بات می‌فرستد (کارشناس هم می‌تواند به‌جایش بارگذاری کند). مدل سند را با پیشنهادِ خودش
 * می‌سنجد (sp-ai.js:runAiCheck) و حکم (verdictOf):
 *   blocked — ناسازگاری با 🔒، سندِ ناخوانا، قلمِ جاافتاده، اعتبارِ کم یا بی مهر و امضا؛ پیش‌فاکتورِ دیگری لازم است
 *   ask     — ناسازگاری‌های 🔓 (قیمت بالا یا پایین، شرطِ آزاد…): «جایگزین شود؟» — «بله» همان اصلاحِ نهایی است
 *   ok      — همان پیشنهاد؛ با «✅ ثبت» نهایی می‌شود
 * پیش‌فاکتورِ ثبت‌شده قیمت را قفل می‌کند (پیش از ثبت، در پیش‌نمایش، هنوز عوض می‌شود). سرِ مهلت — یا وقتی همه معتبرند —
 * «📦 بستهٔ کمیسیون» بسته می‌شود (commission_packages) و جدول کمیسیون نامِ دارندهٔ پیش‌فاکتورِ رسمی با دست‌کم min_valid_h
 * ساعت اعتبار هنگامِ ورود را سبز نشان می‌دهد (sheets.js). همه‌چیز ثبت است: پیامک به چه کسی و کِی (final_call_sups، sp_sms)،
 * پیش‌فاکتور آمد یا نه و حکمش (offpf)، و رخدادها.
 *
 * هنگامِ «📤 ارسالِ» پیشنهاد، پیش‌فاکتورِ رسمی فقط وقتی الزامی است که کارشناس «پیش‌فاکتورِ رسمی 🔒» گذاشته (terms-locks.js:offpf).
 */
import { HttpError } from "./http.js";
import { telegram, esc } from "./telegram.js";
import { pushTo, EXPERT } from "./push.js";
import { fmtFa, jStr2ms, jValid, jNorm, HOUR, DAY } from "./time.js";
import { storage } from "./storage.js";
import { runAiCheck } from "./sp-ai.js";
import { sendSms, smsReady, e164 } from "./sms.js";
import { deliverSms } from "./sp-sms.js";
import * as P from "./sp-push.js";
import * as C from "./sp-core.js";
import { combineLocks, violations, PRICE_FA, CREDIT_MONTHS } from "./terms-locks.js";
import { mergeSrc } from "./quote-src.js";
import { aiReqOn } from "./ai-lock.js";
import { normalizeDtime, validDtime } from "./quote-rules.js";

const T = (v) => String(v == null ? "" : v).trim();
const now = () => Date.now();
const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const FA = "۰۱۲۳۴۵۶۷۸۹";
const faN = (s) => String(s).replace(/\d/g, (d) => FA[+d]);
const money = (n) => faN(Math.round(Number(n) || 0).toLocaleString("en-US")).replace(/,/g, "٬");
const short = (s, n) => { const x = T(s); return x.length > n ? `${x.slice(0, n - 1)}…` : x; };
const when = (ms) => faN(fmtFa(ms));

/* ------------------------------------------------------------------ */
/* جدول‌ها                                                              */
/* ------------------------------------------------------------------ */
export const FC_DDL = [
  "CREATE TABLE IF NOT EXISTS final_calls (id INTEGER PRIMARY KEY, assignment_id INTEGER NOT NULL, request_id TEXT, at INTEGER NOT NULL, deadline_at INTEGER NOT NULL, by TEXT, mode TEXT, cfg_json TEXT, state TEXT NOT NULL DEFAULT 'open', closed_at INTEGER, closed_by TEXT, close_why TEXT, package_id INTEGER);",
  "CREATE INDEX IF NOT EXISTS ix_fc_asg ON final_calls(assignment_id);",
  "CREATE INDEX IF NOT EXISTS ix_fc_open ON final_calls(state, deadline_at);",
  "CREATE TABLE IF NOT EXISTS final_call_sups (id INTEGER PRIMARY KEY, call_id INTEGER NOT NULL, assignment_id INTEGER NOT NULL, supplier_name TEXT NOT NULL, offer_no TEXT, thread_id INTEGER, status TEXT NOT NULL, phone TEXT, sms_state TEXT, sms_at INTEGER, sms_id INTEGER, sms_err TEXT, expert_at INTEGER, expert_via TEXT, lowest_json TEXT, offpf_id INTEGER, offpf_at INTEGER, valid_to INTEGER, revised INTEGER NOT NULL DEFAULT 0, final TEXT, updated_at INTEGER, UNIQUE(call_id, supplier_name));",
  "CREATE INDEX IF NOT EXISTS ix_fcs_asg ON final_call_sups(assignment_id, supplier_name);",
  "CREATE TABLE IF NOT EXISTS offpf (id INTEGER PRIMARY KEY, assignment_id INTEGER NOT NULL, supplier_name TEXT NOT NULL, thread_id INTEGER, call_id INTEGER, bundle_id INTEGER, stage TEXT, skey TEXT, filename TEXT, mime TEXT, size INTEGER, channel TEXT, by TEXT, at INTEGER NOT NULL, state TEXT NOT NULL, ai_json TEXT, verdict_json TEXT, issue_date TEXT, valid_to INTEGER, stamped INTEGER, decided_at INTEGER, decided_by TEXT);",
  "CREATE INDEX IF NOT EXISTS ix_offpf_asg ON offpf(assignment_id, supplier_name);",
  "CREATE TABLE IF NOT EXISTS commission_packages (id INTEGER PRIMARY KEY, assignment_id INTEGER NOT NULL, request_id TEXT, call_id INTEGER, at INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'closed', data_json TEXT NOT NULL);",
  "CREATE INDEX IF NOT EXISTS ix_cpk_asg ON commission_packages(assignment_id);",
].join("\n");

/* ------------------------------------------------------------------ */
/* تنظیمات (پنل پشتیبانی — «🎛 کلیدها»)                                   */
/* ------------------------------------------------------------------ */
export const FC_KEY = "finalCall";
export const FC_DEFAULT = { on: true, window_h: 24, min_valid_h: 24, send_lowest: true };
export const FC_FA = {
  on: "فراخوانِ پیش‌فاکتورِ رسمی پیش از کمیسیون، فقط برای درخواست‌های هوشمند (درخواستِ دستی فراخوان ندارد) — روشن (پیش‌فرض): با رسیدن به حداقلِ استعلام، به تأمین‌کنندگانِ تأییدنهایی پیامک می‌رود و جدول کمیسیون بعد از بسته شدنِ «📦 بستهٔ کمیسیون» ساخته می‌شود؛ خاموش: جدول کمیسیون مستقیم.",
  window_h: "مهلتِ فرستادنِ پیش‌فاکتورِ رسمی پس از لحظهٔ تصمیم (ساعت)",
  min_valid_h: "کمینهٔ اعتبارِ پیش‌فاکتورِ رسمی پس از ورود به کمیسیون (ساعت)",
  send_lowest: "کمترین قیمتِ رسیده در پیامک («می‌توانید قیمت نهایی‌تان را اعلام کنید»)",
};
const hrs = (v, d, lo, hi) => {
  const s = v == null ? "" : String(v).replace(/[۰-۹]/g, (x) => FA.indexOf(x)).trim();
  const n = Number(s);
  return s !== "" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d;
};
function cleanCfg(x) {
  const v = x && typeof x === "object" ? x : {};
  return { on: v.on !== false, window_h: hrs(v.window_h, FC_DEFAULT.window_h, 1, 240), min_valid_h: hrs(v.min_valid_h, FC_DEFAULT.min_valid_h, 0, 720), send_lowest: v.send_lowest !== false };
}
/** فراخوان برای این ارجاع لازم است؟ — روشن و درخواستِ هوشمند؛ درخواستِ دستی فراخوان ندارد (آبان ۱۴۰۵، خواستهٔ مالک) */
async function callNeeded(env, cfg, aid) {
  if (!cfg.on) return false;
  return aiReqOn(env, aid);
}
let cache = null;
/** {on, window_h, min_valid_h, send_lowest, updated_at, by} — ۶۰ ثانیه در حافظهٔ isolate */
export async function fcCfg(env, t = now()) {
  if (cache && t - cache.at < 60000) return cache.v;
  const r = await env.DB.prepare("SELECT value, updated_at FROM settings WHERE key=?").bind(FC_KEY).first().catch(() => null);
  const raw = parse(r && r.value, null);
  const v = { ...cleanCfg(raw), updated_at: r ? r.updated_at : null, by: (raw && raw.by) || null };
  cache = { at: t, v };
  return v;
}
export const resetFcCache = () => { cache = null; };

/** نمای پنل پشتیبانی: تنظیمات، شمارهٔ همراهِ کارشناسان (پیامکِ «شمارهٔ تأمین‌کننده نیست») و وصل بودنِ درگاه */
export async function fcAdmin(env) {
  const experts = (await env.DB.prepare("SELECT id, name, label, phone, active FROM experts ORDER BY active DESC, id").all()).results || [];
  return { cfg: await fcCfg(env), fa: FC_FA, default: FC_DEFAULT, sms: smsReady(env),
    experts: experts.map((e) => ({ id: e.id, name: e.label || e.name, phone: e.phone || "", active: !!e.active })) };
}
/** ذخیره از پنل پشتیبانی: body.cfg (یا خودِ body) و body.phones [{expert_id, phone}] */
export async function saveFcCfg(env, body, by = "support") {
  const b = body && typeof body === "object" ? body : {};
  const cur = await fcCfg(env);
  const next = cleanCfg({ ...cur, ...(b.cfg && typeof b.cfg === "object" ? b.cfg : b) });
  const t = now();
  const stmts = [
    env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
      .bind(FC_KEY, JSON.stringify({ ...next, by }), t),
  ];
  const phones = [];
  for (const p of Array.isArray(b.phones) ? b.phones : []) {
    const id = int(p && p.expert_id);
    if (!id) continue;
    const raw = T(p.phone);
    const num = raw ? e164(raw) : null;
    if (raw && !num) throw new HttpError(`شمارهٔ «${raw}» پیامک نمی‌گیرد (مثل ۰۹۱۲۱۲۳۴۵۶۷).`, 422, { expert_id: id });
    phones.push(id);
    stmts.push(env.DB.prepare("UPDATE experts SET phone=? WHERE id=?").bind(num ? C.normPhone(num) || num : null, id));
  }
  stmts.push(env.DB.prepare("INSERT INTO events (at,actor,kind,payload_json) VALUES (?,?,?,?)").bind(t, by, "final_call_cfg", JSON.stringify({ ...next, phones: phones.length })));
  await env.DB.batch(stmts);
  cache = null;
  return fcAdmin(env);
}

/* ------------------------------------------------------------------ */
/* خواندن                                                                */
/* ------------------------------------------------------------------ */
export const lastCall = (env, aid) => env.DB.prepare("SELECT * FROM final_calls WHERE assignment_id=? ORDER BY id DESC LIMIT 1").bind(aid).first();
const supsOf = async (env, callId) => (await env.DB.prepare("SELECT * FROM final_call_sups WHERE call_id=? ORDER BY id").bind(callId).all()).results || [];
const STATUS_FA = { need: "منتظرِ پیش‌فاکتورِ رسمی", renew: "منتظرِ پیش‌فاکتورِ تازه (اعتبارِ قبلی کم است)", valid: "✅ پیش‌فاکتورِ رسمیِ معتبر" };
const SMS_FA = { sent: "📱 پیامک رفت", sim: "📱 شبیه‌سازی (درگاه خاموش)", held: "⏸ نگه داشته شد", failed: "⚠️ پیامک نرفت", no_phone: "☎️ شماره ندارد", skip: "—" };
const FINAL_FA = { ok: "✅ معتبر هنگامِ ورود", short: "⌛ اعتبارِ کم هنگامِ ورود", none: "— بی پیش‌فاکتورِ رسمی" };

/** خطِ کوتاهِ یک تأمین‌کننده برای پنل‌ها */
function supOut(s, c) {
  return { id: s.id, name: s.supplier_name, offer_no: s.offer_no, thread_id: s.thread_id, status: s.status, status_fa: STATUS_FA[s.status] || s.status,
    sms: s.sms_state || null, sms_fa: SMS_FA[s.sms_state] || null, sms_at: s.sms_at, sms_err: s.sms_err || null, phone: s.phone ? C.maskPhone(s.phone) : null,
    expert_at: s.expert_at, offpf_id: s.offpf_id, offpf_at: s.offpf_at, valid_to: s.valid_to, revised: !!s.revised,
    final: s.final || null, final_fa: s.final ? FINAL_FA[s.final] || s.final : null, lowest: parse(s.lowest_json, []),
    can_upload: !!c && c.state === "open" && s.status !== "valid" };
}
const callOut = (c) => (c ? { id: c.id, state: c.state, at: c.at, deadline_at: c.deadline_at, by: c.by, mode: c.mode, cfg: parse(c.cfg_json, FC_DEFAULT),
  closed_at: c.closed_at, closed_by: c.closed_by, close_why: c.close_why, package_id: c.package_id } : null);

/** نمای کارشناس (پنل و بات): فراخوانِ آخر با تأمین‌کنندگانش، پیش‌فاکتورهای در راه، و این‌که دکمهٔ شروع لازم است یا نه */
export async function callView(env, aid) {
  const cfg = await fcCfg(env);
  const c = await lastCall(env, aid).catch(() => null);
  const asg = await env.DB.prepare("SELECT commission_no FROM assignments WHERE id=?").bind(aid).first();
  const sups = c ? await supsOf(env, c.id) : [];
  const pfs = c ? ((await env.DB.prepare("SELECT id, supplier_name, state, filename, valid_to, at, channel, verdict_json FROM offpf WHERE assignment_id=? AND call_id=? ORDER BY id DESC").bind(aid, c.id).all()).results || []) : [];
  return {
    on: cfg.on && (!!c || await callNeeded(env, cfg, aid)), cfg, now: now(), sms: smsReady(env), legacy: !!(asg && asg.commission_no && !c),
    call: callOut(c), sups: sups.map((s) => supOut(s, c)),
    pfs: pfs.slice(0, 30).map((p) => ({ id: p.id, name: p.supplier_name, state: p.state, filename: p.filename, valid_to: p.valid_to, at: p.at, channel: p.channel, verdict: parse(p.verdict_json, null) })),
  };
}

/**
 * نمای گفت‌وگو (پنلِ تأمین‌کننده و صفحهٔ مکاتبات): اگر این تأمین‌کننده در فراخوانِ این درخواست است — شمارهٔ پیشنهاد، مهلت، وضعیت،
 * اقلامِ پیشنهادش، کمترین قیمت‌ها (اگر روشن) و آخرین پیش‌فاکتورِ رسمی‌اش با حکم.
 */
export async function callForThread(env, th, side) {
  const c = await lastCall(env, th.assignment_id).catch(() => null);
  if (!c || c.state === "cancelled") return null;
  const s = await env.DB.prepare("SELECT * FROM final_call_sups WHERE call_id=? AND supplier_name=?").bind(c.id, th.supplier_name).first();
  if (!s) return null;
  const cfg = parse(c.cfg_json, FC_DEFAULT);
  const pf = await env.DB.prepare("SELECT id, state, filename, valid_to, at, verdict_json FROM offpf WHERE assignment_id=? AND supplier_name=? AND call_id=? ORDER BY id DESC LIMIT 1")
    .bind(th.assignment_id, th.supplier_name, c.id).first();
  const items = ((await env.DB.prepare(`SELECT q.item_id, i.title, q.qty, q.unit, q.price, q.prices_json FROM quotes q JOIN items i ON i.id=q.item_id
      WHERE q.assignment_id=? AND q.supplier_name=? AND q.final=1 AND q.saved=1 ORDER BY i.line_no`).bind(th.assignment_id, th.supplier_name).all()).results || [])
    .map((q) => ({ item_id: q.item_id, title: q.title, qty: q.qty, unit: q.unit, price: q.price, prices: parse(q.prices_json, null) }));
  const v = pf ? parse(pf.verdict_json, {}) : null;
  return {
    id: c.id, state: c.state, offer_no: s.offer_no, at: c.at, deadline_at: c.deadline_at, now: now(), min_valid_h: cfg.min_valid_h,
    status: s.status, status_fa: STATUS_FA[s.status] || s.status, valid_to: s.valid_to, revised: !!s.revised, final: s.final || null,
    lowest: cfg.send_lowest ? parse(s.lowest_json, []) : [], items,
    pf: pf ? { id: pf.id, state: pf.state, filename: pf.filename, valid_to: pf.valid_to, at: pf.at, block: (v && v.block) || [], ask: (v && v.ask) || [], info: (v && v.info) || [] } : null,
    can_upload: c.state === "open" && s.status !== "valid" && c.deadline_at > now(),
    ...(side === "e" ? { sms: s.sms_state, sms_at: s.sms_at } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* نگهبانِ جدول کمیسیون                                                  */
/* ------------------------------------------------------------------ */
/**
 * پنل، بات و «تحویل»: با فراخوانِ روشن، جدول کمیسیون فقط بعد از بسته شدنِ «📦 بستهٔ کمیسیون». درخواستی که پیش از این روال
 * جدولِ کمیسیون گرفته (commission_no) همان‌طور که بود می‌ماند — سازگاری با گذشته.
 */
export async function callGuard(env, aid) {
  const c = await lastCall(env, aid).catch(() => null);
  if (c && c.state === "closed") return c;
  const cfg = await fcCfg(env);
  if (!(await callNeeded(env, cfg, aid))) return null;
  const a = await env.DB.prepare("SELECT commission_no FROM assignments WHERE id=?").bind(aid).first();
  if (a && a.commission_no && !c) return null;
  if (!c || c.state !== "open") {
    throw new HttpError("پیش از جدول کمیسیون، «📨 فراخوانِ پیش‌فاکتورِ رسمی» را بزنید: به تأمین‌کنندگانِ تأییدنهایی پیامک می‌رود و "
      + `${faN(cfg.window_h)} ساعت فرصتِ پیش‌فاکتورِ رسمی دارند؛ جدول بعد از بسته شدنِ «📦 بستهٔ کمیسیون» ساخته می‌شود.`, 409, { final_call: "none" });
  }
  throw new HttpError(`فراخوانِ پیش‌فاکتورِ رسمی تا ${when(c.deadline_at)} باز است؛ جدول کمیسیون بعد از بسته شدنِ «📦 بستهٔ کمیسیون» ساخته می‌شود.`, 409,
    { final_call: "open", deadline_at: c.deadline_at });
}

/* ------------------------------------------------------------------ */
/* شروع                                                                  */
/* ------------------------------------------------------------------ */
/** متنِ پیامک (بی لینک و رمز — آن‌ها را smsWithLogin می‌افزاید) */
export function callSmsText({ company, offer_no, deadline_at, min_valid_h, renew, valid_to, lowest, sendLowest }) {
  const out = [`پیشنهاد شما با شمارهٔ ${faN(offer_no)} وارد کمیسیون معاملات شرکت ${company} می‌شود؛ تا ${when(deadline_at)} فرصت دارید پیش‌فاکتور رسمی با حداقل ${faN(min_valid_h)} ساعت اعتبار ارسال کنید.`];
  if (renew && valid_to) out.push(`پیش‌فاکتورِ رسمیِ قبلیِ شما تا ${when(valid_to)} معتبر است و برای کمیسیون کافی نیست.`);
  if (sendLowest && lowest && lowest.length) {
    const L = lowest.slice(0, 2).map((x) => `«${short(x.title, 30)}» ${money(x.price)} ریال${x.own ? " (پیشنهادِ خودتان)" : ""}`);
    out.push(`کمترین قیمتِ رسیده: ${L.join("، ")}${lowest.length > 2 ? ` و ${faN(lowest.length - 2)} قلمِ دیگر (در پنل)` : ""}؛ می‌توانید قیمت نهایی‌تان را اعلام کنید.`);
  }
  return out.join("\n");
}

/**
 * لحظهٔ تصمیم: فراخوان و ردیفِ هر تأمین‌کننده، بعد پیامک‌ها. اگر فراخوانِ باز یا بسته‌ای از قبل هست، همان برمی‌گردد (دوباره پیامک نمی‌رود).
 * opts: {by: 'ai' | 'expert:<id>', mode: 'ai' | 'manual'}
 */
export async function startCall(env, aid, { by = "system", mode = "manual" } = {}) {
  const cfg = await fcCfg(env);
  if (!cfg.on) throw new HttpError("فراخوانِ پیش‌فاکتورِ رسمی در پنل پشتیبانی خاموش است؛ جدول کمیسیون را مستقیم بسازید.", 409, { final_call: "off" });
  const asg = await env.DB.prepare(`SELECT a.id, a.request_id, a.expert_id, e.name AS expert_name, e.label AS expert_label, e.telegram_chat, e.phone AS expert_phone
    FROM assignments a JOIN experts e ON e.id=a.expert_id WHERE a.id=?`).bind(aid).first();
  if (!asg) throw new HttpError("ارجاع پیدا نشد.", 404);
  const cur = await lastCall(env, aid).catch(() => null);
  if (cur && (cur.state === "open" || cur.state === "closed")) return { call: cur, existed: true, sent: 0 };
  const fin = (await env.DB.prepare(`SELECT q.id, q.item_id, q.supplier_name, q.price, q.qty, i.title FROM quotes q JOIN items i ON i.id=q.item_id
      WHERE q.assignment_id=? AND q.final=1 AND q.saved=1 AND i.state='open' ORDER BY q.id`).bind(aid).all()).results || [];
  if (!fin.length) throw new HttpError("هنوز خطِ «تأیید نهایی»ای نیست که به کمیسیون برود.", 422);
  const t = now(), deadline = t + cfg.window_h * HOUR, need = deadline + cfg.min_valid_h * HOUR;
  /* کمترین قیمتِ هر قلم (ریال، بی ارزش افزوده) میانِ همهٔ خط‌های تأییدنهایی */
  const low = new Map();
  for (const q of fin) {
    const p = Number(q.price);
    if (!(p > 0)) continue;
    const c0 = low.get(q.item_id);
    if (!c0 || p < c0.price) low.set(q.item_id, { item_id: q.item_id, title: q.title, price: p, by: q.supplier_name });
  }
  const names = [...new Set(fin.map((q) => q.supplier_name))];
  const ths = (await env.DB.prepare(`SELECT t.id, s.name, p.id AS phone_id, p.phone, p.k FROM sp_threads t JOIN sp_suppliers s ON s.id=t.supplier_id
      LEFT JOIN sp_phones p ON p.id=t.phone_id WHERE t.assignment_id=?`).bind(aid).all()).results || [];
  const pfs = (await env.DB.prepare("SELECT supplier_name, id, valid_to FROM offpf WHERE assignment_id=? AND state='applied' ORDER BY valid_to DESC").bind(aid).all()).results || [];
  const rows = names.map((name, i) => {
    const th = ths.find((x) => x.name === name) || null;
    const pf = pfs.find((x) => x.supplier_name === name) || null;
    const status = pf && pf.valid_to && pf.valid_to >= need ? "valid" : pf ? "renew" : "need";
    const lowest = [...new Set(fin.filter((q) => q.supplier_name === name).map((q) => q.item_id))].map((id) => low.get(id)).filter(Boolean)
      .map((x) => ({ item_id: x.item_id, title: x.title, price: x.price, own: x.by === name }));
    return { name, offer_no: `${asg.request_id}-${i + 1}`, th, pf, status, lowest };
  });
  const ins = await env.DB.prepare("INSERT INTO final_calls (assignment_id,request_id,at,deadline_at,by,mode,cfg_json,state) VALUES (?,?,?,?,?,?,?,'open') RETURNING *")
    .bind(aid, asg.request_id, t, deadline, by, mode, JSON.stringify({ window_h: cfg.window_h, min_valid_h: cfg.min_valid_h, send_lowest: cfg.send_lowest })).first();
  await env.DB.batch([
    ...rows.map((r) => env.DB.prepare(`INSERT INTO final_call_sups (call_id,assignment_id,supplier_name,offer_no,thread_id,status,phone,sms_state,lowest_json,offpf_id,offpf_at,valid_to,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(ins.id, aid, r.name, r.offer_no, r.th ? r.th.id : null, r.status, r.th && r.th.phone ? r.th.phone : null,
      r.status === "valid" ? "skip" : null, JSON.stringify(r.lowest), r.pf ? r.pf.id : null, r.pf ? t : null, r.pf ? r.pf.valid_to : null, t)),
    env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)").bind(t, by, "final_call", asg.request_id,
      JSON.stringify({ assignment_id: aid, call_id: ins.id, deadline_at: deadline, sups: rows.length, need: rows.filter((r) => r.status !== "valid").length, mode })),
  ]);
  /* پیامک‌ها، یکی‌یکی — هر کدام جدا ثبت می‌شود */
  let sent = 0, noPhone = 0;
  const sups = await supsOf(env, ins.id);
  for (const s of sups) {
    if (s.status === "valid") continue;
    const r = await smsOne(env, ins, s, asg, cfg).catch((e) => ({ state: "failed", error: String((e && e.message) || e).slice(0, 200) }));
    if (r.state === "sent" || r.state === "sim") sent++;
    if (r.state === "no_phone") noPhone++;
  }
  await summaryToExpert(env, asg, ins, await supsOf(env, ins.id)).catch((e) => console.error("final call summary", e && e.message));
  /* همه معتبرند: منتظرِ مهلت نمی‌ماند */
  if (!sups.some((s) => s.status !== "valid")) await closeCall(env, ins, { by: "system", why: "all" });
  return { call: await env.DB.prepare("SELECT * FROM final_calls WHERE id=?").bind(ins.id).first(), existed: false, sent, no_phone: noPhone };
}

/**
 * پیامکِ یک تأمین‌کننده (یا هشدار به کارشناس اگر شماره نیست) و ثبتش روی همان ردیف. گفت‌وگوی پنل لازم است تا تأمین‌کننده
 * بتواند بارگذاری کند؛ تأمین‌کننده‌ای که فقط در تب استعلامات است «شماره ندارد» حساب می‌شود تا کارشناس شماره بدهد.
 */
async function smsOne(env, call, s0, asg, cfg) {
  const t = now();
  const s = { ...s0 };
  /* تأمین‌کنندهٔ دستی (بی گفت‌وگوی پنل) که در دفترچهٔ شماره‌ها شماره دارد — اول شمارهٔ تیک‌خوردهٔ پنل: گفت‌وگوی فراخوان ساخته می‌شود */
  if (!s.thread_id) {
    const known = (await C.phonesOfName(env, s.supplier_name).catch(() => [])).sort((a, b) => (b.panel ? 1 : 0) - (a.panel ? 1 : 0))[0];
    if (known) s.thread_id = await callThread(env, asg, known.supplier_id, known.id, s);
  }
  const ph = s.thread_id ? await env.DB.prepare(`SELECT p.id, p.phone, p.k, p.label FROM sp_threads t JOIN sp_phones p ON p.id=t.phone_id WHERE t.id=?`).bind(s.thread_id).first() : null;
  if (!ph || !ph.phone) {
    const via = await alertExpert(env, asg, call, s).catch((e) => { console.error("final call alert", e && e.message); return ""; });
    await env.DB.prepare("UPDATE final_call_sups SET sms_state='no_phone', expert_at=?, expert_via=?, updated_at=? WHERE id=?").bind(t, via || null, t, s.id).run();
    return { state: "no_phone" };
  }
  const intro = callSmsText({ company: C.COMPANY(env), offer_no: s.offer_no, deadline_at: call.deadline_at, min_valid_h: cfg.min_valid_h, renew: s.status === "renew",
    valid_to: s.valid_to, lowest: parse(s.lowest_json, []), sendLowest: cfg.send_lowest });
  const m = await C.smsWithLogin(env, ph);
  const res = await env.DB.batch([...m.stmts,
    env.DB.prepare("INSERT INTO sp_sms (phone_id,thread_id,expert_id,kind,body,at) VALUES (?,?,?,'final',?,?)").bind(ph.id, s.thread_id, asg.expert_id, m.masked, t)]);
  const smsId = res[res.length - 1].meta.last_row_id;
  /* پیامِ همان گفت‌وگو هم: تأمین‌کننده در پنل و بات همان را می‌بیند */
  const body = `📨 ${intro}`;
  const msg = await env.DB.prepare("INSERT INTO sp_msgs (thread_id,who,kind,body,meta_json,at) VALUES (?,?,?,?,?,?) RETURNING *")
    .bind(s.thread_id, "e", "event", body, JSON.stringify({ ev: "final_call", call_id: call.id, offer_no: s.offer_no }), t).first().catch(() => null);
  if (msg) await env.DB.prepare("UPDATE sp_threads SET last_at=?, rev=rev+1 WHERE id=?").bind(t, s.thread_id).run().catch(() => {});
  const d = await deliverSms(env, { smsId, expertId: asg.expert_id, expertChat: asg.telegram_chat, threadId: s.thread_id, supplier: s.supplier_name, to: ph.phone,
    label: ph.label, text: m.text, pattern: m.pattern, panel: m.panel, bot: m.bot, kind: "final" });
  const state = d.sent ? "sent" : d.via === "hold" ? "held" : d.error ? "failed" : "sim";
  await env.DB.prepare("UPDATE final_call_sups SET phone=?, sms_state=?, sms_at=?, sms_id=?, sms_err=?, updated_at=? WHERE id=?")
    .bind(ph.phone, state, t, smsId, d.error || null, t, s.id).run();
  if (msg) {
    await P.pushMsgs(env, { id: s.thread_id }, [C.msgOut(msg)]).catch(() => {});
  }
  return { state, error: d.error || null };
}

/**
 * گفت‌وگوی پنلِ فراخوان برای تأمین‌کننده‌ای که در این درخواست گفت‌وگو نداشت (استعلامِ تلفنی یا دستی): بی قلم — پنل و بات پیشنهادِ او را
 * از خطِ استعلام نشان می‌دهند و فقط «🧾 پیش‌فاکتورِ رسمی» می‌خواهند. ردیفِ فراخوان به همین گفت‌وگو وصل می‌شود.
 */
async function callThread(env, asg, supplierId, phoneId, s) {
  const t = now();
  const have = await env.DB.prepare("SELECT id FROM sp_threads WHERE assignment_id=? AND supplier_id=?").bind(asg.id, supplierId).first();
  const id = have ? have.id : (await env.DB.prepare("INSERT INTO sp_threads (assignment_id,request_id,supplier_id,phone_id,created_by,last_at,created_at) VALUES (?,?,?,?,?,?,?) RETURNING id")
    .bind(asg.id, asg.request_id, supplierId, phoneId, asg.expert_id, t, t).first()).id;
  await env.DB.batch([
    ...(have ? [env.DB.prepare("UPDATE sp_threads SET phone_id=? WHERE id=?").bind(phoneId, id)] : []),
    env.DB.prepare("UPDATE final_call_sups SET thread_id=?, updated_at=? WHERE id=?").bind(id, t, s.id),
  ]);
  return id;
}

/** «شمارهٔ این تأمین‌کننده را ندارم؛ شماره‌اش را بدهید یا خودتان بفرستید» — پیامک (اگر کارشناس شماره دارد)، تلگرام و اعلان */
async function alertExpert(env, asg, call, s) {
  const text = `📨 فراخوانِ پیش‌فاکتورِ رسمی — درخواست ${asg.request_id}: شمارهٔ «${s.supplier_name}» (پیشنهادِ ${s.offer_no}) را ندارم. `
    + `شماره‌اش را در پنل کارشناس بدهید تا پیامک برود، یا خودتان خبرش کنید و پیش‌فاکتورِ رسمی‌اش را تا ${when(call.deadline_at)} همان‌جا بارگذاری کنید.`;
  const via = [];
  if (asg.expert_phone && smsReady(env)) {
    try { await sendSms(env, asg.expert_phone, text, { pattern: { key: "alarm", params: { title: `فراخوان ${asg.request_id}: شمارهٔ ${s.supplier_name} نیست` } } }); via.push("sms"); }
    catch (e) { console.error("expert sms", e && e.message); }
  }
  if (asg.telegram_chat && env.TG_BOT_TOKEN) {
    try { await telegram(env).sendMessage(asg.telegram_chat, esc(text)); via.push("telegram"); } catch (e) { console.error("expert tg", e && e.message); }
  }
  const p = await pushTo(env, EXPERT(asg.expert_id), { title: "📨 شمارهٔ تأمین‌کننده نیست", body: `${s.supplier_name} — درخواست ${asg.request_id}: شماره بدهید یا خودتان پیش‌فاکتور را بارگذاری کنید.`,
    url: "expert", tag: `fcp${s.id}` }).catch(() => null);
  if (p && p.sent) via.push("push");
  return via.join(",");
}

/** وضعیتِ فراخوان برای بات کارشناسان (HTML) — از callView */
export function callText(v) {
  if (!v || !v.call) return v && v.on === false ? "📨 فراخوانِ پیش‌فاکتورِ رسمی در پنل پشتیبانی خاموش است." : "📨 هنوز فراخوانی برای این درخواست زده نشده است.";
  const c = v.call;
  const head = c.state === "open" ? `📨 <b>فراخوانِ پیش‌فاکتورِ رسمی</b> — باز تا ${esc(when(c.deadline_at))}` : `📦 <b>بستهٔ کمیسیون بسته شد</b> — ${esc(when(c.closed_at || c.deadline_at))}`;
  const rows = (v.sups || []).slice(0, 20).map((s) => `• ${esc(s.offer_no)} — ${esc(s.name)}: ${esc(c.state === "open" ? s.status === "valid" ? STATUS_FA.valid : `${STATUS_FA[s.status] || s.status}${s.sms_fa ? ` · ${s.sms_fa}` : ""}` : s.final_fa || "—")}`);
  return [head, ...rows].join("\n");
}

/** خلاصه برای کارشناس در بات کارشناسان و اعلان — یک پیام برای کلِ فراخوان */
async function summaryToExpert(env, asg, call, sups) {
  const n = (st) => sups.filter((s) => s.sms_state === st).length;
  const valid = sups.filter((s) => s.status === "valid").length;
  const lines = [`📨 <b>فراخوانِ پیش‌فاکتورِ رسمی — درخواست ${esc(asg.request_id)}</b>`,
    `مهلت: ${esc(when(call.deadline_at))}`,
    `${faN(sups.length)} تأمین‌کننده: ${faN(n("sent"))} پیامک${n("sim") ? ` · ${faN(n("sim"))} شبیه‌سازی` : ""}${n("failed") ? ` · ⚠️ ${faN(n("failed"))} نرفت` : ""}`
      + `${n("no_phone") ? ` · ☎️ ${faN(n("no_phone"))} بی‌شماره` : ""}${valid ? ` · ✅ ${faN(valid)} پیش‌فاکتورِ معتبر دارند` : ""}`,
    ...sups.map((s) => `• ${esc(s.offer_no)} — ${esc(s.supplier_name)}: ${esc(s.status === "valid" ? STATUS_FA.valid : SMS_FA[s.sms_state] || "—")}`).slice(0, 15),
    "<i>جدول کمیسیون بعد از بسته شدنِ «📦 بستهٔ کمیسیون» ساخته می‌شود.</i>"];
  if (asg.telegram_chat && env.TG_BOT_TOKEN) await telegram(env).sendMessage(asg.telegram_chat, lines.join("\n")).catch(() => {});
  await pushTo(env, EXPERT(asg.expert_id), { title: `📨 فراخوانِ پیش‌فاکتورِ رسمی — درخواست ${asg.request_id}`,
    body: `${sups.length} تأمین‌کننده؛ مهلت تا ${fmtFa(call.deadline_at)}`, url: "expert", tag: `fc${call.id}` }).catch(() => {});
}

/* ------------------------------------------------------------------ */
/* شمارهٔ تازه از کارشناس / پیامکِ دوباره                                  */
/* ------------------------------------------------------------------ */
/**
 * کارشناس شمارهٔ تأمین‌کنندهٔ بی‌شماره را می‌دهد: شماره در دفترچهٔ پنل (savePhone)، گفت‌وگوی پنل برای همین درخواست (اگر نیست)،
 * و همان پیامکِ فراخوان. phone خالی یعنی فقط پیامکِ دوباره به شمارهٔ موجود.
 */
export async function callPhone(env, ex, aid, b) {
  const c = await lastCall(env, aid);
  if (!c || c.state !== "open") throw new HttpError("فراخوانِ بازی برای این درخواست نیست.", 409);
  const s = await env.DB.prepare("SELECT * FROM final_call_sups WHERE call_id=? AND supplier_name=?").bind(c.id, T(b.supplier_name)).first();
  if (!s) throw new HttpError("این تأمین‌کننده در فراخوان نیست.", 404);
  if (s.status === "valid") throw new HttpError("این تأمین‌کننده پیش‌فاکتورِ رسمیِ معتبر دارد؛ پیامک لازم نیست.", 409);
  const asg = await env.DB.prepare(`SELECT a.id, a.request_id, a.expert_id, e.telegram_chat, e.phone AS expert_phone FROM assignments a JOIN experts e ON e.id=a.expert_id WHERE a.id=?`).bind(aid).first();
  let threadId = s.thread_id;
  if (T(b.phone)) {
    const r = await C.savePhone(env, ex.id, { supplier_name: s.supplier_name, phone: b.phone, label: T(b.label) || "فراخوان" });
    if (threadId) await env.DB.prepare("UPDATE sp_threads SET phone_id=? WHERE id=?").bind(r.phone.id, threadId).run();
    else threadId = await callThread(env, asg, r.supplier.id, r.phone.id, s);
  }
  if (!threadId) throw new HttpError("شمارهٔ این تأمین‌کننده را بدهید.", 422);
  const r = await smsOne(env, c, { ...s, thread_id: threadId }, asg, { ...FC_DEFAULT, ...parse(c.cfg_json, {}) });
  return { ok: true, state: r.state, error: r.error || null, view: await callView(env, aid) };
}

/* ------------------------------------------------------------------ */
/* بستن و «📦 بستهٔ کمیسیون»                                              */
/* ------------------------------------------------------------------ */
/**
 * سرِ مهلت (یا وقتی همه معتبرند، یا «پایانِ زودهنگام»ِ کارشناس): وضعیتِ نهاییِ هر تأمین‌کننده هنگامِ ورود به کمیسیون —
 * ok (پیش‌فاکتورِ رسمی با دست‌کم min_valid_h ساعت اعتبار)، short (اعتبارِ کم) یا none — و «📦 بستهٔ کمیسیون» با عکسِ همه‌چیز.
 */
export async function closeCall(env, call, { by = "system", why = "deadline" } = {}) {
  const c = call && call.state ? call : await env.DB.prepare("SELECT * FROM final_calls WHERE id=?").bind(call && call.id).first();
  if (!c || c.state !== "open") return c;
  const t = now();
  const cfg = { ...FC_DEFAULT, ...parse(c.cfg_json, {}) };
  const sups = await supsOf(env, c.id);
  const fin = (s) => (s.offpf_id && s.valid_to && s.valid_to >= t + cfg.min_valid_h * HOUR ? "ok" : s.offpf_id ? "short" : "none");
  const asg = await env.DB.prepare(`SELECT a.id, a.request_id, a.expert_id, a.commission_no, r.party, e.label AS expert_label, e.name AS expert_name, e.telegram_chat
    FROM assignments a JOIN requests r ON r.id=a.request_id JOIN experts e ON e.id=a.expert_id WHERE a.id=?`).bind(c.assignment_id).first();
  const [items, quotes, pfs] = await Promise.all([
    env.DB.prepare("SELECT id, line_no, title, qty, unit FROM items WHERE assignment_id=? AND state='open' ORDER BY line_no").bind(c.assignment_id).all(),
    env.DB.prepare("SELECT id, item_id, supplier_name, spec, unit, qty, price, prices_json, dtime, valid_days, ship, invoice, pay, vat, deal, place, place_other, final, saved, src_json FROM quotes WHERE assignment_id=?").bind(c.assignment_id).all(),
    env.DB.prepare("SELECT id, supplier_name, state, filename, skey, mime, valid_to, issue_date, stamped, at, channel FROM offpf WHERE assignment_id=? AND call_id=? ORDER BY id").bind(c.assignment_id, c.id).all(),
  ]);
  const Q = (quotes.results || []).filter((q) => q.final && q.saved);
  const P = pfs.results || [];
  const data = {
    v: 1, at: t, why, by,
    request: asg ? { id: asg.request_id, party: asg.party, expert: asg.expert_label || asg.expert_name, commission_no: asg.commission_no || null } : null,
    call: { id: c.id, at: c.at, deadline_at: c.deadline_at, mode: c.mode, by: c.by, cfg },
    items: (items.results || []).map((i) => ({ id: i.id, no: i.line_no, title: i.title, qty: i.qty, unit: i.unit })),
    suppliers: sups.map((s) => {
      const pf = s.offpf_id ? P.find((p) => p.id === s.offpf_id) : null;
      return { name: s.supplier_name, offer_no: s.offer_no, status: s.status, final: fin(s), revised: !!s.revised,
        sms: { state: s.sms_state || null, at: s.sms_at || null, err: s.sms_err || null }, expert_alert: s.expert_at || null,
        offpf: pf ? { id: pf.id, filename: pf.filename, valid_to: pf.valid_to, issue: pf.issue_date, stamped: pf.stamped == null ? null : !!pf.stamped, at: pf.at, channel: pf.channel } : null,
        lines: Q.filter((q) => q.supplier_name === s.supplier_name).map((q) => ({ item_id: q.item_id, qty: q.qty, unit: q.unit, price: q.price, prices: parse(q.prices_json, null),
          spec: q.spec, terms: { dtime: q.dtime, pay: q.pay, invoice: q.invoice, vat: q.vat, valid_days: q.valid_days, ship: q.ship, deal: q.deal, place: q.place, place_other: q.place_other },
          src: parse(q.src_json, null) })) };
    }),
    offpf_log: P.map((p) => ({ id: p.id, name: p.supplier_name, state: p.state, filename: p.filename, at: p.at, channel: p.channel })),
  };
  const pk = await env.DB.prepare("INSERT INTO commission_packages (assignment_id,request_id,call_id,at,state,data_json) VALUES (?,?,?,?,'closed',?) RETURNING id")
    .bind(c.assignment_id, c.request_id, c.id, t, JSON.stringify(data)).first();
  await env.DB.batch([
    env.DB.prepare("UPDATE final_calls SET state='closed', closed_at=?, closed_by=?, close_why=?, package_id=? WHERE id=? AND state='open'").bind(t, by, why, pk.id, c.id),
    ...sups.map((s) => env.DB.prepare("UPDATE final_call_sups SET final=?, updated_at=? WHERE id=?").bind(fin(s), t, s.id)),
    env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)").bind(t, by, "commission_package", c.request_id,
      JSON.stringify({ assignment_id: c.assignment_id, call_id: c.id, package_id: pk.id, why, ok: sups.filter((s) => fin(s) === "ok").length, sups: sups.length })),
    /* کارشناس هوشمند در «📨 منتظرِ فراخوان» است: همان لحظه ادامه بدهد */
    env.DB.prepare("UPDATE ai_runs SET next_at=? WHERE assignment_id=? AND state='closing' AND finished_at IS NULL").bind(t, c.assignment_id),
  ]);
  if (asg) {
    const ok = sups.filter((s) => fin(s) === "ok").length;
    const msg = `📦 بستهٔ کمیسیونِ درخواست ${asg.request_id} بسته شد (${why === "deadline" ? "پایانِ مهلت" : why === "all" ? "همه پیش‌فاکتورِ رسمیِ معتبر دارند" : "پایانِ زودهنگام"}): `
      + `${faN(ok)} از ${faN(sups.length)} تأمین‌کننده پیش‌فاکتورِ رسمیِ معتبر دارند؛ حالا جدول کمیسیون ساخته می‌شود.`;
    if (asg.telegram_chat && env.TG_BOT_TOKEN && c.mode !== "ai") await telegram(env).sendMessage(asg.telegram_chat, esc(msg)).catch(() => {});
    await pushTo(env, EXPERT(asg.expert_id), { title: `📦 بستهٔ کمیسیون — درخواست ${asg.request_id}`, body: msg.slice(0, 300), url: "expert", tag: `pk${c.id}` }).catch(() => {});
  }
  return env.DB.prepare("SELECT * FROM final_calls WHERE id=?").bind(c.id).first();
}

/** پایانِ زودهنگام از پنل کارشناس — با تأیید (فقط فراخوانِ دستی؛ فراخوانِ کارشناس هوشمند سرِ مهلت یا با پشتیبانی بسته می‌شود) */
export async function closeEarly(env, ex, aid) {
  const c = await lastCall(env, aid);
  if (!c || c.state !== "open") throw new HttpError("فراخوانِ بازی برای این درخواست نیست.", 409);
  if (c.mode === "ai") throw new HttpError("این فراخوان را کارشناس هوشمند زده و سرِ مهلت خودش بسته می‌شود.", 423);
  await closeCall(env, c, { by: `expert:${ex.id}`, why: "early" });
  return callView(env, aid);
}

/** آخرین «📦 بستهٔ کمیسیون» یک ارجاع (پنلِ کمیسیون در گام بعد) */
export async function packageOf(env, aid) {
  const r = await env.DB.prepare("SELECT * FROM commission_packages WHERE assignment_id=? ORDER BY id DESC LIMIT 1").bind(aid).first();
  return r ? { id: r.id, at: r.at, state: r.state, call_id: r.call_id, data: parse(r.data_json, null) } : null;
}

/** Cron: فراخوان‌های سررسیده بسته می‌شوند — هر بار چند تا (سقفِ زیردرخواستِ هر اجرا) */
export async function finalCallTick(env, max = 2) {
  const due = (await env.DB.prepare("SELECT * FROM final_calls WHERE state='open' AND deadline_at<=? ORDER BY deadline_at LIMIT ?").bind(now(), max).all().catch(() => ({ results: [] }))).results || [];
  let closed = 0;
  for (const c of due) { await closeCall(env, c, { by: "system", why: "deadline" }).catch((e) => console.error("final call close", e && e.message)); closed++; }
  return closed ? { fcClosed: closed } : {};
}

/* ------------------------------------------------------------------ */
/* پیش‌فاکتورِ رسمی: خوانش و حکم                                         */
/* ------------------------------------------------------------------ */
/** «معتبر تا»: تا تاریخِ معین (پایانِ همان روز)، وگرنه صدور + روز یا ساعت؛ صدورِ نامعلوم یا امروز ← لحظهٔ رسیدن */
export function validTo(doc, at) {
  if (!doc) return null;
  const jd = (s) => { const x = jNorm(T(s)); return jValid(x) ? x : null; };
  const until = jd(doc.until);
  if (until) return jStr2ms(until) + DAY - 1;
  const issue = jd(doc.issue);
  const base = issue ? jStr2ms(issue) : null;
  const hours = Number(doc.hours), days = Number(doc.days);
  if (hours > 0) return (base == null || base + DAY > at ? at : base) + hours * HOUR;
  if (days > 0) return (base == null ? at : base) + days * DAY;
  return null;
}
const cellTxt = (v) => (v == null || v === "" ? "—" : typeof v === "number" ? money(v) : `«${T(v)}»`);

/**
 * حکمِ پیش‌فاکتورِ رسمی از خروجیِ sp-ai.js:judge — فقط ردیف‌های «❌ فرق دارد» تصمیم‌سازند (⚠️ و ⚪ اطلاعاتی‌اند):
 *   🔒 (لایه، مقدارِ 🔒، واحد، شرطِ 🔒ِ شرکت) ← block؛ بقیه (قیمت، لایهٔ 🔓، شرطِ آزاد) ← ask.
 * قیمتِ سند اگر با یکی از قیمت‌های نقد/اعتباریِ اعلامی بخواند، همان است. اعتبار باید تا needUntil برسد و مهر و امضا دیده شود.
 */
export function verdictOf(ai, { lines, lim, needUntil, at = now() }) {
  const block = [], ask = [], info = [];
  if (!ai || ai.readable === false) {
    block.push({ key: "doc", msg: `سند خوانا نبود یا پیش‌فاکتور نیست${ai && ai.reason ? ` (${ai.reason})` : ""}` });
    return { block, ask, info, valid_to: null, issue: null, stamped: null };
  }
  const lock = combineLocks((lines || []).map((l) => lim && lim.get(l.item_id)).filter(Boolean)).lock;
  for (const ln of ai.lines || []) {
    const l = (lines || []).find((x) => x.id === ln.line_id) || {};
    const lk = C.locksOfLine(l);
    const tag = `«${ln.title}»`;
    if (ln.found === false) { block.push({ key: `${ln.line_id}|found`, line_id: ln.line_id, msg: `${tag} در پیش‌فاکتور پیدا نشد` }); continue; }
    for (const r of ln.rows || []) {
      if (r.status !== "bad") continue;
      const d = { key: `${ln.line_id}|${r.key}`, line_id: ln.line_id, item_id: ln.item_id, field: r.key, kind: r.kind, label: r.label, want: r.want, got: r.got, val: r.val,
        msg: `${tag}: «${r.label}» در سند ${cellTxt(r.got)} است؛ پیشنهادِ شما ${cellTxt(r.want)}` };
      if (r.kind === "layer") { if (lk.layers[r.label] !== false) block.push({ ...d, locked: true, msg: `${d.msg} — این لایه 🔒 است` }); else ask.push(d); continue; }
      if (r.kind === "extra") { ask.push(d); continue; }
      if (r.key === "qty") { if (lk.qty && !lk.legacy) block.push({ ...d, locked: true, msg: `${d.msg} — مقدار 🔒 است` }); else ask.push(d); continue; }
      if (r.key === "unit") { if (lk.unit) block.push({ ...d, locked: true, msg: `${d.msg} — واحد 🔒 است` }); else ask.push(d); continue; }
      if (r.key === "price") {
        const P = C.pricesOf(l) || {};
        const hit = ["cash", ...CREDIT_MONTHS.map((m) => `c${m}`)].find((k) => Number(P[k]) > 0 && Math.abs(Number(P[k]) - Number(r.got)) <= 1);
        if (hit) { info.push({ ...d, msg: `${tag}: قیمتِ سند همان ${PRICE_FA[hit]} است` }); continue; }
        ask.push({ ...d, price: true, msg: `${tag}: قیمتِ واحدِ سند ${cellTxt(r.got)} ریال است؛ پیشنهادِ قبلیِ شما ${cellTxt(r.want)} ریال` });
        continue;
      }
      ask.push(d);
    }
  }
  for (const r of ai.header || []) {
    if (r.status !== "bad" || r.key === "valid_days") continue;
    const d = { key: `h|${r.key}`, field: r.key, kind: "terms", label: r.label, want: r.want, got: r.got, val: r.val, msg: `«${r.label}» در سند ${cellTxt(r.got)} است؛ پیشنهادِ شما ${cellTxt(r.want)}` };
    if (["pay", "invoice", "vat"].includes(r.key) && Array.isArray(lock[r.key]) && lock[r.key].length && !lock[r.key].includes(T(r.val))) {
      block.push({ ...d, locked: true, msg: `${d.msg} — شرطِ 🔒ِ شرکت فقط ${lock[r.key].map((o) => `«${o}»`).join(" یا ")}` });
      continue;
    }
    if (r.key === "dtime" && lock.dtime && r.val) {
      const vv = violations({ dtime: r.val }, { dtime: lock.dtime }, at);
      if (vv.length) { block.push({ ...d, locked: true, msg: `${d.msg} — ${vv[0].msg}` }); continue; }
    }
    if (!r.gate) { info.push(d); continue; }
    ask.push(d);
  }
  const vt = validTo(ai.doc, at);
  if (vt == null) block.push({ key: "valid", msg: "اعتبارِ پیش‌فاکتور روی سند خوانده نشد — اعتبار (مثلاً «۳ روز»، «۴۸ ساعت» یا «معتبر تا …») باید روی سند نوشته شده باشد" });
  else if (needUntil && vt < needUntil) block.push({ key: "valid", msg: `اعتبارِ این پیش‌فاکتور تا ${when(vt)} است؛ باید دست‌کم تا ${when(needUntil)} معتبر باشد` });
  if (ai.doc && ai.doc.stamped === false && ai.doc.stamped_sure) block.push({ key: "stamp", msg: "مهر یا امضای فروشنده روی سند دیده نشد؛ پیش‌فاکتورِ رسمیِ مهر و امضادار لازم است" });
  return { block, ask, info, valid_to: vt, issue: (ai.doc && ai.doc.issue) || null, stamped: ai.doc ? ai.doc.stamped : null };
}

/** خط‌های سنجش برای مدل: خطِ پنلِ همین تأمین‌کننده با مقدارهای خطِ استعلامِ نهایی؛ تأمین‌کنندهٔ بی‌پنل از خودِ قلم */
async function callLines(env, aid, name, threadId) {
  const qs = (await env.DB.prepare(`SELECT q.*, i.title AS it_title, i.norm_json, i.spec AS it_spec, i.terms_json AS it_terms FROM quotes q JOIN items i ON i.id=q.item_id
      WHERE q.assignment_id=? AND q.supplier_name=? AND q.final=1 AND q.saved=1 ORDER BY i.line_no`).bind(aid, name).all()).results || [];
  const sl = threadId ? ((await env.DB.prepare("SELECT * FROM sp_lines WHERE thread_id=?").bind(threadId).all()).results || []) : [];
  const out = [];
  for (const q of qs) {
    const l = sl.find((x) => x.item_id === q.item_id);
    const base = { qty: q.qty, unit: q.unit, price: q.price, prices_json: q.prices_json || (l && l.prices_json) || null, quote_id: q.id };
    if (l) { out.push({ ...l, ...base, layers_json: JSON.stringify(C.lineLayers(l).map(({ k, v }) => ({ k, v }))) }); continue; }
    const lk = await C.lockedLayers(env, { id: q.item_id, title: q.it_title, norm_json: q.norm_json, spec: q.it_spec }).catch(() => ({ head: null, layers: [] }));
    out.push({ id: -q.id, no: null, item_id: q.item_id, title: q.it_title, head: lk.head, layers_json: JSON.stringify(lk.layers), extra_json: "[]", locks_json: null, req_unit: null, ...base });
  }
  const q0 = qs[0] || {};
  return { lines: out, terms: { dtime: q0.dtime, pay: q0.pay, invoice: q0.invoice, vat: q0.vat, valid_days: q0.valid_days } };
}

async function signedUrl(env, key) {
  const store = storage(env);
  if (!store || !store.signedUrl) throw new HttpError("انبار فایل هنوز به سامانه وصل نیست.", 503);
  return store.signedUrl(key, 900);
}

/**
 * پیش‌فاکتورِ رسمی رسید — پنلِ تأمین‌کننده، بات، یا کارشناس به‌جای او. file: {skey, filename, mime, size} (فایل در انبار است).
 * stage: «call» در پنجرهٔ فراخوان؛ «submit» پیش از «📤 ارسال» وقتی کارشناس «پیش‌فاکتورِ رسمی 🔒» گذاشته (lineIds: اقلامِ ارسالی).
 * خروجی: {id, state: blocked | ask | ok, block, ask, info, valid_to}
 */
export async function offpfIngest(env, { aid, name, threadId = null, file, channel, by, stage = "call", lineIds = null }) {
  if (!file || !file.skey) throw new HttpError("فایلی نرسید.", 422);
  const cfg = await fcCfg(env);
  const t = now();
  let ctx, call = null, needUntil;
  if (stage === "call") {
    call = await lastCall(env, aid);
    const s = call && call.state === "open" ? await env.DB.prepare("SELECT * FROM final_call_sups WHERE call_id=? AND supplier_name=?").bind(call.id, name).first() : null;
    if (!s) throw new HttpError("فراخوانِ بازی برای پیش‌فاکتورِ رسمیِ شما نیست.", 409);
    if (s.status === "valid") throw new HttpError("پیش‌فاکتورِ رسمیِ شما ثبت شده و قیمت برای کمیسیون قفل است.", 409);
    if (call.deadline_at <= t) throw new HttpError("مهلتِ فرستادنِ پیش‌فاکتورِ رسمی تمام شده است.", 409);
    ctx = await callLines(env, aid, name, threadId || s.thread_id);
    needUntil = call.deadline_at + ({ ...FC_DEFAULT, ...parse(call.cfg_json, {}) }).min_valid_h * HOUR;
  } else {
    const th = await env.DB.prepare("SELECT * FROM sp_threads WHERE id=?").bind(threadId).first();
    if (!th) throw new HttpError("گفت‌وگو پیدا نشد.", 404);
    const want = Array.isArray(lineIds) && lineIds.length ? new Set(lineIds.map(int)) : null;
    const ls = ((await env.DB.prepare("SELECT * FROM sp_lines WHERE thread_id=? AND state='ready' ORDER BY id").bind(th.id).all()).results || []).filter((l) => !want || want.has(l.id));
    if (!ls.length) throw new HttpError("اول اقلامِ «آمادهٔ ارسال» را آماده کنید، بعد پیش‌فاکتورِ رسمی را بفرستید.", 422);
    ctx = { lines: ls.map((l) => ({ ...l, layers_json: JSON.stringify(C.lineLayers(l).map(({ k, v }) => ({ k, v }))) })), terms: C.termsOf(th) };
    const lim0 = await C.limitsOfLines(env, ls);
    const vmin = Math.max(0, ...ls.map((l) => { const L = lim0.get(l.item_id); return L && L.valid && L.valid.lock ? L.valid.min : 0; }));
    needUntil = t + Math.max(cfg.min_valid_h * HOUR, vmin * DAY);
  }
  if (!ctx.lines.length) throw new HttpError("خطِ تأییدنهایی‌ای برای سنجش نیست.", 422);
  const lim = await C.limitsOfLines(env, ctx.lines);
  const row = await env.DB.prepare(`INSERT INTO offpf (assignment_id,supplier_name,thread_id,call_id,stage,skey,filename,mime,size,channel,by,at,state) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'checking') RETURNING id`)
    .bind(aid, name, threadId, call ? call.id : null, stage, file.skey, T(file.filename).slice(0, 120) || "proforma", file.mime || null, file.size || null, channel || null, by || null, t).first();
  let ai;
  try {
    ai = await runAiCheck(env, { fileUrl: await signedUrl(env, file.skey), mime: file.mime, lines: ctx.lines, terms: ctx.terms });
  } catch (e) {
    await env.DB.prepare("UPDATE offpf SET state='failed', verdict_json=? WHERE id=?").bind(JSON.stringify({ error: String((e && e.message) || e).slice(0, 300) }), row.id).run();
    throw new HttpError(`خوانشِ هوشمندِ پیش‌فاکتور انجام نشد: ${String((e && e.message) || e).slice(0, 200)} — دوباره بفرستید.`, (e && e.status) || 502);
  }
  const v = verdictOf(ai, { lines: ctx.lines, lim, needUntil, at: t });
  const state = v.block.length ? "blocked" : v.ask.length ? "ask" : "ok";
  await env.DB.batch([
    env.DB.prepare("UPDATE offpf SET state=?, ai_json=?, verdict_json=?, issue_date=?, valid_to=?, stamped=? WHERE id=?")
      .bind(state, JSON.stringify(ai), JSON.stringify({ ...v, need_until: needUntil, lines: ctx.lines.map((l) => ({ id: l.id, item_id: l.item_id, quote_id: l.quote_id || null })) }),
        v.issue, v.valid_to, v.stamped == null ? null : v.stamped ? 1 : 0, row.id),
    env.DB.prepare("INSERT INTO events (at,actor,kind,payload_json) VALUES (?,?,?,?)").bind(t, by || channel || "supplier", "offpf",
      JSON.stringify({ assignment_id: aid, supplier: name, offpf_id: row.id, stage, state, block: v.block.length, ask: v.ask.length })),
  ]);
  return { id: row.id, state, block: v.block, ask: v.ask, info: v.info, valid_to: v.valid_to, need_until: needUntil };
}

/** صاحبِ یک پیش‌فاکتورِ رسمی: تأمین‌کنندهٔ همان گفت‌وگو یا کارشناسِ همان ارجاع */
async function ownOffpf(env, id, who) {
  const o = await env.DB.prepare("SELECT o.*, a.expert_id FROM offpf o JOIN assignments a ON a.id=o.assignment_id WHERE o.id=?").bind(int(id)).first();
  if (!o) throw new HttpError("این پیش‌فاکتور پیدا نشد.", 404);
  if (who.expert) { if (o.expert_id !== who.expert.id) throw new HttpError("این درخواست متعلق به شما نیست.", 403); return o; }
  const th = o.thread_id ? await env.DB.prepare("SELECT supplier_id FROM sp_threads WHERE id=?").bind(o.thread_id).first() : null;
  if (!who.supplier || !th || th.supplier_id !== who.supplier.supplier_id) throw new HttpError("این پیش‌فاکتور مالِ شما نیست.", 403);
  return o;
}

/**
 * تصمیمِ حکم: ok ← «✅ ثبت»؛ ask ← replace=true «جایگزین شود» (مقدارهای سند جای پیشنهاد می‌نشینند — اصلاحِ نهایی) یا false (کنار گذاشتن)؛
 * blocked پذیرفته نیست. در فراخوان: خطِ استعلام با منبعِ «پیش‌فاکتورِ رسمی» و مقدارِ قبلی، ردیفِ فراخوان «✅ معتبر» و قیمت قفل؛
 * پیش از ارسال: خطِ پنل و شرایطِ گفت‌وگو تا «📤 ارسال» با همین سند برود.
 */
export async function offpfDecide(env, id, { replace = false, by = "supplier" } = {}, who) {
  const o = await ownOffpf(env, id, who);
  if (o.state === "blocked") throw new HttpError("این پیش‌فاکتور پذیرفته نیست؛ پیش‌فاکتورِ دیگری بفرستید.", 409);
  if (!["ok", "ask"].includes(o.state)) throw new HttpError("تصمیمِ این پیش‌فاکتور گرفته شده است.", 409);
  const t = now();
  if (o.state === "ask" && !replace) {
    await env.DB.prepare("UPDATE offpf SET state='cancelled', decided_at=?, decided_by=? WHERE id=?").bind(t, by, o.id).run();
    return { ok: true, state: "cancelled" };
  }
  const v = parse(o.verdict_json, {});
  const asks = o.state === "ask" ? v.ask || [] : [];
  let revised = false;
  if (o.stage === "call") {
    const c = await env.DB.prepare("SELECT * FROM final_calls WHERE id=?").bind(o.call_id).first();
    if (!c || c.state !== "open" || c.deadline_at <= t) throw new HttpError("مهلتِ فراخوان تمام شده است.", 409);
    revised = await applyToQuotes(env, o, asks, v.lines || [], by);
    await env.DB.batch([
      env.DB.prepare("UPDATE offpf SET state='applied', decided_at=?, decided_by=? WHERE id=?").bind(t, by, o.id),
      env.DB.prepare("UPDATE final_call_sups SET status='valid', offpf_id=?, offpf_at=?, valid_to=?, revised=MAX(revised,?), updated_at=? WHERE call_id=? AND supplier_name=?")
        .bind(o.id, t, o.valid_to, revised ? 1 : 0, t, o.call_id, o.supplier_name),
      env.DB.prepare("INSERT INTO events (at,actor,kind,payload_json) VALUES (?,?,?,?)").bind(t, by, "offpf_applied",
        JSON.stringify({ assignment_id: o.assignment_id, supplier: o.supplier_name, offpf_id: o.id, revised, valid_to: o.valid_to })),
    ]);
    if (o.thread_id) await threadNote(env, o.thread_id, `🧾 پیش‌فاکتورِ رسمی «${o.filename}» ثبت شد (معتبر تا ${when(o.valid_to)})${revised ? "؛ مقدارهای سند جای پیشنهادِ قبلی نشست" : ""}. قیمت برای کمیسیون قفل است.`);
    /* همه معتبرند: «📦 بستهٔ کمیسیون» همین حالا */
    const left = await env.DB.prepare("SELECT COUNT(*) AS n FROM final_call_sups WHERE call_id=? AND status<>'valid'").bind(o.call_id).first();
    if (left && !left.n) await closeCall(env, c, { by: "system", why: "all" });
  } else {
    revised = await applyToLines(env, o, asks, v.lines || []);
    await env.DB.prepare("UPDATE offpf SET state='ok', decided_at=?, decided_by=? WHERE id=?").bind(t, by, o.id).run();
  }
  return { ok: true, state: o.stage === "call" ? "applied" : "ok", revised };
}

/** پیامِ کوتاهِ رخداد در همان گفت‌وگو (هر دو طرف می‌بینند) */
async function threadNote(env, threadId, body) {
  const t = now();
  const m = await env.DB.prepare("INSERT INTO sp_msgs (thread_id,who,kind,body,meta_json,at) VALUES (?,?,?,?,?,?) RETURNING *").bind(threadId, "e", "event", body, JSON.stringify({ ev: "offpf" }), t).first().catch(() => null);
  if (!m) return;
  await env.DB.prepare("UPDATE sp_threads SET last_at=?, rev=rev+1 WHERE id=?").bind(t, threadId).run().catch(() => {});
  await P.pushMsgs(env, { id: threadId }, [C.msgOut(m)]).catch(() => {});
}

/* مقدارِ سند برای خانه‌های خطِ استعلام */
const docVal = (a) => (a.val !== undefined ? a.val : a.got);
/** قیمتِ تازه روی ردیف‌های نقد/اعتباری: ردیفِ اصلی (نقد، وگرنه کوتاه‌ترین اعتباری) عوض می‌شود و درصدها دوباره حساب */
function repriced(pj, price) {
  const P = parse(pj, null);
  if (!P || typeof P !== "object") return null;
  const k = Number(P.cash) > 0 ? "cash" : CREDIT_MONTHS.map((m) => `c${m}`).find((x) => Number(P[x]) > 0);
  if (!k) return null;
  P[k] = price;
  for (const m of CREDIT_MONTHS) P[`r${m}`] = Number(P.cash) > 0 && Number(P[`c${m}`]) > 0 ? Math.round((Number(P[`c${m}`]) / Number(P.cash) - 1) * 1000) / 10 : null;
  return JSON.stringify(Object.fromEntries(Object.entries(P).filter(([, x]) => x != null)));
}

/** «جایگزین شود» در فراخوان: خط‌های استعلامِ همین تأمین‌کننده با منبعِ «پیش‌فاکتورِ رسمی»، مقدارِ قبلی و ثبتِ ویرایش */
async function applyToQuotes(env, o, asks, lineMap, by) {
  const t = now();
  const qs = (await env.DB.prepare("SELECT * FROM quotes WHERE assignment_id=? AND supplier_name=? AND final=1 AND saved=1").bind(o.assignment_id, o.supplier_name).all()).results || [];
  const stmts = [];
  const qOf = (lineId) => { const m = lineMap.find((x) => x.id === lineId); return m ? qs.find((q) => q.id === m.quote_id || q.item_id === m.item_id) : null; };
  const edits = new Map();
  const put = (q, f, v) => { if (!q) return; const e = edits.get(q.id) || { q, set: {} }; e.set[f] = v; edits.set(q.id, e); };
  for (const a of asks) {
    const v = docVal(a);
    if (a.kind === "terms") { for (const q of qs) put(q, a.field, a.field === "dtime" ? (validDtime(T(v)) ? normalizeDtime(T(v)) : T(v)) : T(v) || null); continue; }
    const q = qOf(a.line_id);
    if (!q) continue;
    if (a.field === "price" && Number(v) > 0) { put(q, "price", Math.round(Number(v))); const pj = repriced(q.prices_json, Math.round(Number(v))); if (pj) put(q, "prices_json", pj); continue; }
    if (a.field === "qty" && Number(v) > 0) { put(q, "qty", Number(v)); continue; }
    if (a.field === "unit" && T(v)) { put(q, "unit", T(v)); continue; }
    if ((a.kind === "layer" || a.kind === "extra") && T(v)) {
      const spec = String((edits.get(q.id) && edits.get(q.id).set.spec) || q.spec || "");
      const from = `${a.label}: ${T(a.want)}`, to = `${a.label}: ${T(v)}`;
      put(q, "spec", (spec.includes(from) ? spec.replace(from, to) : [spec, to].filter(Boolean).join("، ")).slice(0, 500));
    }
  }
  for (const { q, set } of edits.values()) {
    const fields = Object.keys(set).filter((f) => String(set[f] ?? "") !== String(q[f] ?? ""));
    if (!fields.length) continue;
    const patch = Object.fromEntries(fields.map((f) => [f, { s: "pf_off", at: t, by, ref: `offpf:${o.id}`, ...(q[f] != null && q[f] !== "" ? { prev: { v: q[f], s: (parse(q.src_json, {})[f] || {}).s || null } } : {}) }]));
    stmts.push(env.DB.prepare(`UPDATE quotes SET ${fields.map((f) => `${f}=?`).join(", ")}, src_json=?, updated_at=? WHERE id=?`).bind(...fields.map((f) => set[f]), mergeSrc(q.src_json, patch), t, q.id));
    stmts.push(env.DB.prepare("INSERT INTO quote_edits (quote_id,assignment_id,at,by,channel,fields_json,reason) VALUES (?,?,?,?,?,?,?)")
      .bind(q.id, o.assignment_id, t, by, "offpf", JSON.stringify(Object.fromEntries(fields.map((f) => [f, { from: q[f] ?? null, to: set[f] }]))), "پیش‌فاکتورِ رسمی"));
    /* خطِ پنلِ همین قلم هم همان قیمت و مقدار را نشان دهد */
    if (o.thread_id && (set.price != null || set.qty != null || set.prices_json)) {
      stmts.push(env.DB.prepare(`UPDATE sp_lines SET ${[set.price != null ? "price=?" : null, set.qty != null ? "qty=?" : null, set.prices_json ? "prices_json=?" : null].filter(Boolean).join(", ")}, updated_at=? WHERE thread_id=? AND item_id=?`)
        .bind(...[set.price, set.qty, set.prices_json].filter((x) => x != null), t, o.thread_id, q.item_id));
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
  return stmts.length > 0;
}

/** «جایگزین شود» پیش از «📤 ارسال»: خطِ پنل (قیمت، مقدار، واحد) و شرایطِ گفت‌وگو از سند */
async function applyToLines(env, o, asks, lineMap) {
  if (!asks.length) return false;
  const t = now();
  const stmts = [];
  const terms = {};
  for (const a of asks) {
    const v = docVal(a);
    if (a.kind === "terms") { terms[a.field] = a.field === "dtime" ? (validDtime(T(v)) ? normalizeDtime(T(v)) : T(v)) : T(v); continue; }
    const m = lineMap.find((x) => x.id === a.line_id);
    if (!m || !(m.id > 0)) continue;
    if (a.field === "price" && Number(v) > 0) {
      const l = await env.DB.prepare("SELECT prices_json FROM sp_lines WHERE id=?").bind(m.id).first();
      const pj = repriced(l && l.prices_json, Math.round(Number(v)));
      stmts.push(env.DB.prepare(`UPDATE sp_lines SET price=?${pj ? ", prices_json=?" : ""}, updated_at=? WHERE id=?`).bind(...[Math.round(Number(v)), ...(pj ? [pj] : []), t, m.id]));
    } else if (a.field === "qty" && Number(v) > 0) stmts.push(env.DB.prepare("UPDATE sp_lines SET qty=?, updated_at=? WHERE id=?").bind(Number(v), t, m.id));
    else if (a.field === "unit" && T(v)) stmts.push(env.DB.prepare("UPDATE sp_lines SET unit=?, updated_at=? WHERE id=?").bind(T(v), t, m.id));
  }
  if (Object.keys(terms).length && o.thread_id) {
    const th = await env.DB.prepare("SELECT terms_json FROM sp_threads WHERE id=?").bind(o.thread_id).first();
    stmts.push(env.DB.prepare("UPDATE sp_threads SET terms_json=? WHERE id=?").bind(JSON.stringify({ ...C.termsOf(th), ...terms }), o.thread_id));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return stmts.length > 0;
}

/**
 * «📤 ارسال» با «پیش‌فاکتورِ رسمی 🔒»: پیش‌فاکتورِ پذیرفته‌شدهٔ همین گفت‌وگو (state ok) — همان فایل پیوستِ بسته می‌شود.
 * بی 🔒: null (هیچ شرطی نیست).
 */
/** «پیش‌فاکتورِ رسمی 🔒» در شرایطِ دست‌کم یکی از این خط‌ها هست؟ */
export async function offpfRequired(env, lines) {
  if (!lines || !lines.length) return false;
  const lim = await C.limitsOfLines(env, lines);
  return lines.some((l) => { const L = lim.get(l.item_id); return !!(L && L.offpf && L.offpf.lock); });
}
/** «۱۴۰۵/۰۷/۲۸ — ۱۴:۳۰» برای پیام‌های بات */
export const fcWhen = when;
export async function submitOffpf(env, th, lines, offpfId) {
  if (!(await offpfRequired(env, lines))) return null;
  const o = offpfId ? await env.DB.prepare("SELECT * FROM offpf WHERE id=? AND thread_id=? AND stage='submit'").bind(int(offpfId), th.id).first() : null;
  if (!o) throw new HttpError("این استعلام «پیش‌فاکتورِ رسمی 🔒» می‌خواهد: اول پیش‌فاکتورِ مهر و امضادارِ خودتان را بفرستید تا سنجیده شود.", 422, { offpf: "need" });
  if (o.state !== "ok") throw new HttpError(o.state === "blocked" ? "پیش‌فاکتورِ رسمیِ فرستاده‌شده پذیرفته نشد؛ پیش‌فاکتورِ دیگری بفرستید." : "اول دربارهٔ تفاوت‌های پیش‌فاکتورِ رسمی تصمیم بگیرید («جایگزین شود؟»).", 422, { offpf: o.state });
  return o;
}
/** بعد از ساختنِ بسته: پیش‌فاکتورِ رسمیِ ارسال، «applied» با شمارهٔ بسته — اعتبارش برای فراخوانِ بعدی هم شمرده می‌شود */
export async function markSubmitted(env, o, bundleId) {
  if (!o) return;
  await env.DB.prepare("UPDATE offpf SET state='applied', bundle_id=? WHERE id=?").bind(bundleId, o.id).run();
}
