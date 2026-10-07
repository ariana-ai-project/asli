/**
 * پنل «پشتیبانی» تدارکات (مهر ۱۴۰۵، درخواست مالک — مرحلهٔ ۱)
 *
 * نظارت بر کار کارشناسان بی‌آنکه چیزی از کارشان عوض شود: درخواست‌ها، کارشناسان و بار بازشان، همهٔ
 * گفت‌وگوهای کارشناس و تأمین‌کننده (فقط‌خواندنی — حتی «خوانده‌شده» هم نمی‌زند)، و گزارش کامل رخدادها
 * با زمان دقیق. تنها نوشتنِ کاری‌اش تیکِ «تأیید کمیسیون» هر قلم است که از پنل و بات کارشناس برداشته
 * شد؛ کارشناس فقط «خاتمه»ی اقلامِ تأییدشده را می‌زند (decisions.js همان commission_ok را می‌خواند).
 *
 * ورود: رمزِ مشترکِ پشتیبانی. اولین کسی که صفحه را باز می‌کند رمز را می‌گذارد (تصمیم مالک)؛ بعد از آن
 * فقط با همان رمز، و اگر فراموش شد مدیر با کد مدیر رمز تازه می‌گذارد. خودِ رمز ذخیره نمی‌شود — نمک و
 * SHA-256 در جدول settings با کلیدی بیرون از DEFAULTS، تا settingsFromRows آن را به هیچ پنلی ندهد.
 * پنج رمزِ غلط پشتِ هم = پانزده دقیقه قفل. بعد از ورود، نشانهٔ امضاشدهٔ ۱۲ساعته در هدر X-Support-Token
 * می‌آید: HMAC با رازِ سرور و هشِ رمز، پس عوض شدنِ رمز همهٔ نشانه‌های قبلی را باطل می‌کند.
 */
import { HttpError } from "./http.js";
import { queueStmt } from "./queue.js";
import { threadRow, threadOut, lineOut, bundleOut, msgOut, msgFor, FILE_LABELS } from "./sp-core.js";

const now = () => Date.now();
const T = (v) => String(v == null ? "" : v).trim();
const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const FA = "۰۱۲۳۴۵۶۷۸۹";
const faN = (s) => String(s).replace(/\d/g, (d) => FA[+d]);
/* رقم فارسی و عربی → لاتین: رمز با همین شکل هش می‌شود، پس ورود هم باید همین را بسنجد */
const latin = (v) => T(v).replace(/[۰-۹]/g, (d) => FA.indexOf(d)).replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const short = (s, n) => { const x = T(s).replace(/\s+/g, " "); return x.length > n ? x.slice(0, n - 1) + "…" : x; };

/* ------------------------------------------------------------------ */
/* ورود                                                                  */
/* ------------------------------------------------------------------ */
const KEY_PASS = "supportPass";   /* {salt, hash, at} */
const KEY_LOCK = "supportLock";   /* {n, until}: رمزهای غلطِ پشت‌سرهم و پایانِ قفل */
const PASS_MIN = 6, PASS_MAX = 64;
const MAX_FAILS = 5, LOCK_MS = 15 * 60000;
export const TOKEN_TTL = 12 * 3600000;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (s) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
async function hmac(key, msg) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)));
}
/** مقایسه با زمانِ ثابت — زمانِ پاسخ نباید بگوید چند نویسهٔ اولِ امضا درست بود */
function same(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

async function readKey(env, key) {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(key).first();
  return r ? parse(r.value, null) : null;
}
const putKey = (env, key, v) => env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
  .bind(key, JSON.stringify(v), now());
const delKey = (env, key) => env.DB.prepare("DELETE FROM settings WHERE key=?").bind(key);
/** رخدادِ پشتیبانی در همان جدول events — گزارش رخدادها همه را با هم نشان می‌دهد */
const evStmt = (env, kind, requestId, itemId, payload) => env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,item_id,payload_json) VALUES (?,?,?,?,?,?)")
  .bind(now(), "support", kind, requestId || null, itemId || null, payload ? JSON.stringify(payload) : null);

function cleanPass(env, p) {
  const s = latin(p);
  if (s.length < PASS_MIN || s.length > PASS_MAX) throw new HttpError(`رمز باید ${faN(PASS_MIN)} تا ${faN(PASS_MAX)} نویسه باشد.`, 400);
  if (env.MANAGER_CODE && s === env.MANAGER_CODE) throw new HttpError("رمز پشتیبانی نباید همان کد مدیر باشد.", 400);
  return s;
}
const hashPass = (pass, salt) => sha256(`${salt}:${pass}`);
/* رازِ سرور: هر کدام که ست شده. هشِ رمز هم در کلید امضاست، پس بی رازِ سرور هم نشانه جعل‌شدنی نیست */
const secret = (env) => T(env.SUPPORT_SECRET) || T(env.TG_WEBHOOK_SECRET) || T(env.MANAGER_CODE);
async function issue(env, rec) {
  const exp = now() + TOKEN_TTL;
  return { ok: true, token: `${exp}.${await hmac(`${secret(env)}|${rec.hash}`, `support|${exp}`)}`, exp };
}
async function makeRec(pass) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  return { salt, hash: await hashPass(pass, salt), at: now() };
}

/** صفحهٔ ورود: رمز گذاشته شده یا نه، و اگر قفل است تا کی */
export async function supportStatus(env) {
  const [rec, lock] = await Promise.all([readKey(env, KEY_PASS), readKey(env, KEY_LOCK)]);
  return { set: !!(rec && rec.hash), locked_until: lock && lock.until > now() ? lock.until : null };
}

/** اولین بازدیدکننده رمز را می‌گذارد — فقط وقتی هنوز رمزی نیست (DO NOTHING: دو نفرِ هم‌زمان، یکی برنده) */
export async function supportSetup(env, body) {
  const rec = await makeRec(cleanPass(env, body && body.pass));
  const r = await env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO NOTHING").bind(KEY_PASS, JSON.stringify(rec), now()).run();
  if (!r.meta.changes) throw new HttpError("رمز پشتیبانی قبلاً گذاشته شده؛ با همان وارد شوید.", 409, { set: true });
  await evStmt(env, "support_pass", null, null, { how: "setup" }).run();
  return issue(env, rec);
}

export async function supportLogin(env, body) {
  const lock = await readKey(env, KEY_LOCK);
  if (lock && lock.until > now()) {
    throw new HttpError(`به خاطر رمزهای نادرستِ پشت‌سرهم، ورود تا ${faN(Math.ceil((lock.until - now()) / 60000))} دقیقهٔ دیگر بسته است.`, 429, { locked_until: lock.until });
  }
  const rec = await readKey(env, KEY_PASS);
  if (!rec || !rec.hash) throw new HttpError("هنوز رمزی برای پشتیبانی گذاشته نشده.", 409, { set: false });
  const pass = latin(body && body.pass);
  if (pass && same(await hashPass(pass, rec.salt), rec.hash)) {
    await env.DB.batch([evStmt(env, "support_login", null, null, null), ...(lock ? [delKey(env, KEY_LOCK)] : [])]);
    return issue(env, rec);
  }
  const n = ((lock && lock.n) || 0) + 1;
  if (n >= MAX_FAILS) {
    await putKey(env, KEY_LOCK, { n: 0, until: now() + LOCK_MS }).run();
    throw new HttpError(`رمز نادرست است. ${faN(MAX_FAILS)} بار پشت‌سرهم اشتباه شد؛ ورود ${faN(LOCK_MS / 60000)} دقیقه بسته است.`, 429, { locked_until: now() + LOCK_MS });
  }
  await putKey(env, KEY_LOCK, { n, until: 0 }).run();
  throw new HttpError(`رمز نادرست است. ${faN(MAX_FAILS - n)} بار دیگر فرصت هست.`, 401);
}

/** فراموشیِ رمز: مدیر (مسیرش کد مدیر را پیش از این سنجیده) رمز تازه می‌گذارد؛ قفل هم برداشته می‌شود */
export async function supportReset(env, body) {
  const rec = await makeRec(cleanPass(env, body && body.pass));
  await env.DB.batch([putKey(env, KEY_PASS, rec), delKey(env, KEY_LOCK), evStmt(env, "support_pass", null, null, { how: "reset" })]);
  return issue(env, rec);
}

/** پشتیبانیِ واردشده رمز را عوض می‌کند — رمز فعلی لازم است؛ نشانه‌های قبلی باطل می‌شوند و نشانهٔ تازه برمی‌گردد */
export async function supportChangePass(env, body) {
  const old = await readKey(env, KEY_PASS);
  if (!old || !same(await hashPass(latin(body && body.current), old.salt), old.hash)) throw new HttpError("رمز فعلی درست نیست.", 403);
  const rec = await makeRec(cleanPass(env, body && body.pass));
  await env.DB.batch([putKey(env, KEY_PASS, rec), evStmt(env, "support_pass", null, null, { how: "change" })]);
  return issue(env, rec);
}

/** نگهبانِ همهٔ مسیرهای پشتیبانی — یک خواندن از settings */
export async function requireSupport(request, env) {
  const m = /^(\d{13})\.([0-9a-f]{64})$/.exec(T(request.headers.get("X-Support-Token")));
  if (!m) throw new HttpError("برای پنل پشتیبانی وارد نشده‌اید.", 401);
  if (Number(m[1]) < now()) throw new HttpError("نشست پشتیبانی تمام شده؛ دوباره وارد شوید.", 401);
  const rec = await readKey(env, KEY_PASS);
  if (!rec || !rec.hash || !same(await hmac(`${secret(env)}|${rec.hash}`, `support|${m[1]}`), m[2])) {
    throw new HttpError("نشست پشتیبانی معتبر نیست؛ دوباره وارد شوید.", 401);
  }
  return { role: "support" };
}

/* ------------------------------------------------------------------ */
/* کارشناسان                                                             */
/* ------------------------------------------------------------------ */
/** فقط آنچه پشتیبانی لازم دارد — کد ورود و گفت‌وگوی تلگرامِ کارشناس هیچ‌وقت به این پنل نمی‌رود */
export const pubExpert = (e) => ({ id: e.id, name: e.name, label: e.label, active: e.active ? 1 : 0, senior: e.senior ? 1 : 0, senior_id: e.senior_id || null, open_load: e.open_load || 0 });

/** تب «کارشناسان»: هر کارشناس فعال با بار بازش — ارجاع و قلم باز، از مهلت گذشته، دیده‌نشده، منتظر تأیید کمیسیون */
export async function supportExperts(env) {
  const rows = (await env.DB.prepare(`SELECT e.id, e.name, e.label, e.senior, e.senior_id, (e.telegram_chat IS NOT NULL) AS tg,
      (SELECT COUNT(DISTINCT a.id) FROM assignments a JOIN items i ON i.assignment_id=a.id WHERE a.expert_id=e.id AND a.dispatched_at IS NOT NULL AND i.state IN ('open','hold')) AS open_asg,
      (SELECT COUNT(*) FROM items i JOIN assignments a ON a.id=i.assignment_id WHERE a.expert_id=e.id AND a.dispatched_at IS NOT NULL AND i.state='open') AS open_items,
      (SELECT COUNT(DISTINCT a.id) FROM assignments a JOIN items i ON i.assignment_id=a.id WHERE a.expert_id=e.id AND a.dispatched_at IS NOT NULL AND a.deadline_at<?1 AND i.state='open') AS overdue,
      (SELECT COUNT(DISTINCT a.id) FROM assignments a JOIN items i ON i.assignment_id=a.id WHERE a.expert_id=e.id AND a.dispatched_at IS NOT NULL AND a.viewed_at IS NULL AND i.state='open') AS unseen,
      (SELECT COUNT(*) FROM items i JOIN assignments a ON a.id=i.assignment_id WHERE a.expert_id=e.id AND a.commission_no IS NOT NULL AND i.state='open' AND i.commission_ok=0) AS cm_wait,
      (SELECT COUNT(*) FROM sp_threads t JOIN assignments a ON a.id=t.assignment_id WHERE a.expert_id=e.id) AS threads,
      (SELECT g.mode FROM ai_agents g WHERE g.expert_id=e.id) AS ai
    FROM experts e WHERE e.active=1 ORDER BY e.senior DESC, e.name`).bind(now()).all()).results || [];
  return { experts: rows.map((r) => ({ ...r, tg: !!r.tg, senior: r.senior ? 1 : 0 })) };
}

/** کلیک روی کارشناس: ارجاع‌های بازش با شمارِ هر مرحله، و آخرین رخدادهایش */
export async function supportExpert(env, id) {
  const e = await env.DB.prepare("SELECT id, name, label, senior, senior_id, active FROM experts WHERE id=?").bind(id).first();
  if (!e) throw new HttpError("کارشناس پیدا نشد.", 404);
  const [asg, feed] = await Promise.all([
    env.DB.prepare(`SELECT a.id, a.request_id, a.days, a.dispatched_at, a.viewed_at, a.deadline_at, a.commission_no, a.commission_at, r.date, r.party, r.urgency,
        (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id) AS item_count,
        (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id AND i.state='open') AS open_count,
        (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id AND i.state='open' AND i.commission_ok=1) AS ok_count,
        (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id AND i.hist_done_at IS NOT NULL) AS hist_count,
        (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id AND i.smart_done_at IS NOT NULL) AS smart_count,
        (SELECT COUNT(*) FROM quotes q WHERE q.assignment_id=a.id) AS quote_lines,
        (SELECT COUNT(*) FROM quotes q WHERE q.assignment_id=a.id AND q.saved=1) AS quote_count,
        (SELECT COUNT(*) FROM quotes q WHERE q.assignment_id=a.id AND q.final=1) AS final_count,
        (SELECT COUNT(*) FROM proformas p WHERE p.assignment_id=a.id) AS proforma_count,
        (SELECT COUNT(*) FROM sp_threads t WHERE t.assignment_id=a.id) AS threads
      FROM assignments a JOIN requests r ON r.id=a.request_id
      WHERE a.expert_id=? AND a.dispatched_at IS NOT NULL AND EXISTS (SELECT 1 FROM items i WHERE i.assignment_id=a.id AND i.state IN ('open','hold'))
      ORDER BY a.dispatched_at DESC LIMIT 200`).bind(id).all(),
    supportActivity(env, null, { expert: id, limit: 80 }),
  ]);
  return { expert: { ...e, senior: e.senior ? 1 : 0 }, assignments: asg.results || [], activity: feed.rows };
}

/* ------------------------------------------------------------------ */
/* گزارش رخدادها                                                          */
/* ------------------------------------------------------------------ */
/*
 * یک فهرستِ زمانی از چند منبع، هر کدام با LIMIT خودش در یک batch (یک رفت‌وبرگشت):
 *   ev    جدول events (کارهای مدیر، تصمیم‌ها، جدول کمیسیون، نامه، تحویل، ثبت موقت، پشتیبانی…)
 *   alog  ارجاع و مهلت (assignment_log — فقط آنچه events ندارد)
 *   view / hist / norm / smart / qadd / qfin / pf  زمان‌هایی که خودِ جدول‌ها نگه می‌دارند (دیدن درخواست، بررسی
 *         سوابق، نرمال‌سازی، جستجوی هوشمند، افزودن خط استعلام، تیک تأیید نهایی، پیش‌فاکتور) — از پنل، بات یا
 *         کارشناس هوشمند، همه یکجا. رخدادهای هم‌معنایِ events (viewed/hist/smart/manual_quote/proforma) کنار
 *         گذاشته می‌شوند تا یک کار دو بار نیاید.
 *   msg / sms  پیام‌های مکاتبات و پیامک‌های تأمین‌کنندگان
 * هر ردیف: {key, src, at, by (manager|expert|ai|supplier|support|system), expert_id, request_id, text, …}.
 * صفحهٔ بعد با before=زمانِ آخرین ردیف (<=، و پنل ردیف تکراری را با key کنار می‌گذارد).
 */
const DUP_KINDS = ["viewed", "hist", "smart", "manual_quote", "proforma"];
export const GROUPS = {
  asg: { srcs: ["ev", "alog"], kinds: ["import", "delete", "dispatch", "unassign", "reassign", "open", "hold", "stop", "closed", "decision_requested", "decision_approved", "decision_rejected", "ai_tick", "ai_manual"] },
  work: { srcs: ["ev", "view", "hist", "norm", "smart", "qadd", "qfin", "pf"], kinds: ["close", "commission", "commission_table", "letter", "deliver", "quote_saved", "quote_deleted", "extract_applied", "norm_clear", "norm_revert", "ai_ask", "ai_answer", "ai_handover", "ai_delivery", "ai_handoff", "ai_start", "ai_pick_more"] },
  chat: { srcs: ["msg", "sms"], kinds: [] },
  support: { srcs: ["ev"], kinds: ["commission_ok", "commission_off", "support_login", "support_pass", "ai_on", "ai_off", "ai_rules", "ai_reject", "ai_ranking", "ai_switches", "ai_modes"] },
};
const ALL_SRCS = ["ev", "alog", "view", "hist", "norm", "smart", "qadd", "qfin", "pf", "msg", "sms"];

const EV_FA = {
  import: "بارگذاری فایل درخواست‌ها", delete: "حذف درخواست‌ها از میز", dispatch: "ارسال ارجاع برای کارشناس", unassign: "برداشتن ارجاع",
  reassign: "تغییر کارشناس", open: "باز کردن اقلام", hold: "تعلیق", stop: "توقف", closed: "بستن اقلام", close: "خاتمه",
  commission: "ساخت جدول کمیسیون", commission_table: "ساخت جدول کمیسیون", letter: "نگارش نامهٔ کمیسیون", deliver: "تحویل برگه‌ها",
  quote_saved: "ثبت موقت استعلام", quote_deleted: "حذف خط استعلام", extract_applied: "ثبت نتیجهٔ خواندن پیش‌فاکتور",
  decision_requested: "درخواست تأیید از مدیر", decision_approved: "تأیید مدیر", decision_rejected: "رد مدیر",
  norm_clear: "برداشتن نرمال‌سازی قلم", norm_revert: "برگرداندن قلم به فهرست اقلام",
  commission_ok: "تأیید کمیسیون", commission_off: "برداشتن تأیید کمیسیون", support_login: "ورود به پنل پشتیبانی", support_pass: "رمز پشتیبانی",
  ai_on: "کارشناس «🤖 هوشمند» شد", ai_off: "کارشناس «✋ دستی» شد", ai_ask: "🚨 پرسش از کارشناس", ai_answer: "پاسخِ کارشناس به پرسشِ کارشناس هوشمند",
  ai_handover: "⚠️ کارشناس هوشمند به حداقلِ استعلام نرسید — واگذاری به کارشناس", ai_delivery: "📥 تحویلِ کارشناس هوشمند برای تأیید کمیسیون",
  ai_reject: "✗ ردِ تحویلِ کارشناس هوشمند", ai_rules: "قواعدِ حداقلِ استعلام عوض شد",
  ai_handoff: "🤖 بررسی سوابق و سپردن به کارشناس هوشمند — ساختارِ اقلام منجمد شد",
  ai_ranking: "وزن‌های رتبهٔ نهایی و قاعدهٔ دعوت عوض شد",
  ai_switches: "🎛 کلیدهای کارشناس هوشمند عوض شد (خوانش هوشمند پیش‌فاکتور)",
  /* فاز ۴ب: تیکِ «🤖 هوشمند»ِ مدیر در ارجاع، «انجام دستی»ِ تأییدشده و حالتِ اقلام */
  ai_tick: "تیکِ «🤖 هوشمند / ✋ دستی»ِ ارجاع (مدیر)", ai_manual: "«انجام دستی»ِ اقلام با تأییدِ مدیر",
  ai_modes: "🧭 حالتِ اقلامِ کارشناس هوشمند عوض شد",
  /* فاز ۴ب گام ۲: «🚀 شروع»ِ هر قلم با «🎯 فهرست دعوت»ِ کارشناس، و دعوت از انتخاب‌های تازه */
  ai_start: "🚀 شروعِ قلم با فهرستِ دعوتِ کارشناس — ساختار منجمد شد", ai_pick_more: "📨 دعوت از انتخاب‌های تازهٔ فهرستِ دعوت",
};
const PICK_MODE_FA = { handoff: "سپردن یا برگشت", pick: "انتخاب کارشناس", direct: "مستقیم" };
const CH_FA = { telegram: "از تلگرام", panel: "از پنل", ai: "کارشناس هوشمند", import: "از فایل", supplier: "از پنل تأمین‌کننده" };
const ORIGIN_FA = { history: "از بررسی سوابق", smart: "از جستجوی هوشمند", manual: "دستی", proforma: "از پیش‌فاکتور", supplier: "از پنل تأمین‌کننده" };
const SRC_FA = { panel: "پنل", telegram: "تلگرام", ai: "کارشناس هوشمند", supplier: "پنل تأمین‌کننده", proforma: "خواندن پیش‌فاکتور" };
const PASS_FA = { setup: "اولین رمز گذاشته شد", reset: "مدیر رمز تازه گذاشت", change: "رمز عوض شد" };

/** کنشگرِ یک رخداد: «expert:7» → کارشناس ۷؛ کانالِ ai یعنی کارشناس هوشمند به نامِ همان کارشناس */
function actorOf(actor, p) {
  const m = /^expert:(\d+)$/.exec(T(actor));
  if (m) return { by: p && p.channel === "ai" ? "ai" : "expert", expert_id: Number(m[1]) };
  return { by: ["manager", "support", "system"].includes(actor) ? actor : "system", expert_id: null };
}
function evText(r, p) {
  const base = EV_FA[r.kind] || r.kind, bits = [];
  if (r.title) bits.push(`«${short(r.title, 60)}»`);
  if (p.supplier) bits.push(`«${short(p.supplier, 40)}»`);
  if (p.commission_no) bits.push(`کد TSA-PS-FO-${faN(p.commission_no)}`);
  if (r.kind === "close") bits.push(`${faN(p.closed || 0)} قلم${p.fully_closed ? " — درخواست کامل بسته شد" : ""}`);
  if (r.kind === "ai_ask" && p.q) bits.push(`«${short(p.q, 160)}»`);
  if (r.kind === "ai_handover" && Array.isArray(p.items)) bits.push(`بعد از ${faN(p.hours || 0)} ساعت: ${p.items.map((x) => `${short(x.title, 40)} ${faN(x.have)} از ${faN(x.need)}`).join("، ")}`);
  if (r.kind === "ai_delivery" && p.short) bits.push(`⚠️ ${faN(p.short)} قلم کمتر از حداقلِ استعلام`);
  if (r.kind === "ai_reject" && p.reason) bits.push(`دلیل: ${short(p.reason, 120)}`);
  if (["ai_start", "ai_pick_more"].includes(r.kind)) {
    bits.push(`${faN(p.n || 0)} تأمین‌کننده${p.mode && PICK_MODE_FA[p.mode] ? ` (${PICK_MODE_FA[p.mode]})` : ""}`);
    if (Array.isArray(p.off_top) && p.off_top.length) bits.push(`برداشتنِ پنج نفر اول: ${p.off_top.map((x) => `${short(x.name, 40)}${x.why ? ` — ${short(x.why, 80)}` : ""}`).join("؛ ")}`);
  }
  if (r.kind === "ai_rules") bits.push(`${faN((p.unit || 0) + (p.total || 0) + (p.qty || 0))} بازه · مهلت ${faN(p.wait || 0)} ساعت`);
  if (r.kind === "import") bits.push(p.closeCandidates ? `${faN(p.closeCandidates)} نامزدِ بستن` : "");
  if (r.kind === "delete") bits.push(p.all ? "همهٔ میز" : `${faN(p.requests || 0)} درخواست`);
  if (r.kind === "dispatch" && p.days) bits.push(`مهلت ${faN(p.days)} روز کاری`);
  if (["commission_ok", "commission_off"].includes(r.kind) && Array.isArray(p.item_ids)) bits.push(`${faN(p.item_ids.length)} قلم`);
  if (r.kind === "deliver" && Array.isArray(p.files)) bits.push(`${faN(p.files.length)} فایل`);
  if (r.kind === "quote_saved" && p.lines) bits.push(`${faN(p.lines)} خط`);
  if (r.kind === "support_pass") bits.push(PASS_FA[p.how] || "");
  if (["open", "hold", "stop", "closed"].includes(r.kind) && Array.isArray(p.item_ids) && p.item_ids.length) bits.push(`${faN(p.item_ids.length)} قلم`);
  if (r.kind === "decision_rejected" && p.note) bits.push(`دلیل: ${short(p.note, 80)}`);
  if (p.channel && CH_FA[p.channel] && p.channel !== "ai") bits.push(CH_FA[p.channel]);
  if (p.source && CH_FA[p.source]) bits.push(CH_FA[p.source]);
  return [base, ...bits.filter(Boolean)].join(" — ");
}

/* هر منبع: SQL با جای فیلتر کارشناس ({EX}) و درخواست ({RID})؛ همه زمان را با نام «at» برمی‌گردانند */
const FEED_SQL = {
  ev: {
    sql: `SELECT e.id, e.at, e.actor, e.kind, COALESCE(e.request_id, a.request_id) AS rid, e.item_id, e.payload_json AS p, a.expert_id AS aex, i.title
      FROM events e LEFT JOIN assignments a ON a.id = json_extract(e.payload_json, '$.assignment_id') LEFT JOIN items i ON i.id = e.item_id
      WHERE e.at BETWEEN ?1 AND ?2 {KINDS} {EX} {RID} ORDER BY e.at DESC LIMIT ?3`,
    ex: "AND (e.actor = 'expert:' || ?4 OR a.expert_id = ?4 OR json_extract(e.payload_json, '$.expert_id') = ?4 OR json_extract(e.payload_json, '$.to_expert_id') = ?4)",
    rid: "AND COALESCE(e.request_id, a.request_id) = ?5",
  },
  alog: {
    sql: `SELECT l.id, l.at, l.action, l.request_id AS rid, l.assignment_id, l.expert_id, l.days, l.source, l.actor
      FROM assignment_log l WHERE l.at BETWEEN ?1 AND ?2 AND l.action IN ('assign','days') {EX} {RID} ORDER BY l.at DESC LIMIT ?3`,
    ex: "AND l.expert_id = ?4", rid: "AND l.request_id = ?5",
  },
  view: {
    sql: `SELECT a.id, a.viewed_at AS at, a.request_id AS rid, a.expert_id FROM assignments a
      WHERE a.viewed_at BETWEEN ?1 AND ?2 {EX} {RID} ORDER BY a.viewed_at DESC LIMIT ?3`,
    ex: "AND a.expert_id = ?4", rid: "AND a.request_id = ?5",
  },
  hist: {
    sql: `SELECT i.id, i.hist_done_at AS at, i.request_id AS rid, i.title, a.expert_id FROM items i JOIN assignments a ON a.id = i.assignment_id
      WHERE i.hist_done_at BETWEEN ?1 AND ?2 {EX} {RID} ORDER BY i.hist_done_at DESC LIMIT ?3`,
    ex: "AND a.expert_id = ?4", rid: "AND i.request_id = ?5",
  },
  norm: {
    sql: `SELECT i.id, i.norm_at AS at, i.request_id AS rid, i.title, a.expert_id, json_extract(i.norm_json, '$.source') AS nsrc FROM items i LEFT JOIN assignments a ON a.id = i.assignment_id
      WHERE i.norm_at BETWEEN ?1 AND ?2 {EX} {RID} ORDER BY i.norm_at DESC LIMIT ?3`,
    ex: "AND a.expert_id = ?4", rid: "AND i.request_id = ?5",
  },
  smart: {
    sql: `SELECT s.id, s.created_at AS at, COALESCE(s.request_id, i.request_id) AS rid, s.expert_id, i.title FROM smart_searches s LEFT JOIN items i ON i.id = s.item_id
      WHERE s.created_at BETWEEN ?1 AND ?2 {EX} {RID} ORDER BY s.created_at DESC LIMIT ?3`,
    ex: "AND s.expert_id = ?4", rid: "AND COALESCE(s.request_id, i.request_id) = ?5",
  },
  qadd: {
    sql: `SELECT q.id, q.created_at AS at, a.request_id AS rid, a.expert_id, q.supplier_name, q.origin, q.source, i.title
      FROM quotes q JOIN assignments a ON a.id = q.assignment_id LEFT JOIN items i ON i.id = q.item_id
      WHERE q.created_at BETWEEN ?1 AND ?2 {EX} {RID} ORDER BY q.created_at DESC LIMIT ?3`,
    ex: "AND a.expert_id = ?4", rid: "AND a.request_id = ?5",
  },
  qfin: {
    sql: `SELECT q.id, q.final_at AS at, a.request_id AS rid, a.expert_id, q.supplier_name, q.source, i.title
      FROM quotes q JOIN assignments a ON a.id = q.assignment_id LEFT JOIN items i ON i.id = q.item_id
      WHERE q.final = 1 AND q.final_at BETWEEN ?1 AND ?2 {EX} {RID} ORDER BY q.final_at DESC LIMIT ?3`,
    ex: "AND a.expert_id = ?4", rid: "AND a.request_id = ?5",
  },
  pf: {
    sql: `SELECT p.id, p.uploaded_at AS at, a.request_id AS rid, a.expert_id, p.supplier_name, p.filename, p.source
      FROM proformas p JOIN assignments a ON a.id = p.assignment_id
      WHERE p.uploaded_at BETWEEN ?1 AND ?2 {EX} {RID} ORDER BY p.uploaded_at DESC LIMIT ?3`,
    ex: "AND a.expert_id = ?4", rid: "AND a.request_id = ?5",
  },
  msg: {
    sql: `SELECT m.id, m.at, m.who, m.kind, substr(m.body, 1, 200) AS body, (m.meta_json LIKE '%"ai":true%') AS ai, t.id AS tid, t.request_id AS rid, a.expert_id, s.name AS supplier, s.demo
      FROM sp_msgs m JOIN sp_threads t ON t.id = m.thread_id JOIN assignments a ON a.id = t.assignment_id JOIN sp_suppliers s ON s.id = t.supplier_id
      WHERE m.at BETWEEN ?1 AND ?2 {EX} {RID} ORDER BY m.at DESC LIMIT ?3`,
    ex: "AND a.expert_id = ?4", rid: "AND t.request_id = ?5",
  },
  sms: {
    sql: `SELECT x.id, x.at, x.kind, x.via, x.status, x.expert_id, x.thread_id AS tid, t.request_id AS rid, s.name AS supplier, s.demo
      FROM sp_sms x JOIN sp_phones p ON p.id = x.phone_id JOIN sp_suppliers s ON s.id = p.supplier_id LEFT JOIN sp_threads t ON t.id = x.thread_id
      WHERE x.at BETWEEN ?1 AND ?2 {EX} {RID} ORDER BY x.at DESC LIMIT ?3`,
    ex: "AND x.expert_id = ?4", rid: "AND t.request_id = ?5",
  },
};

const MSG_KIND_FA = { voice: "پیام صوتی", note: "یادداشت درونی" };
const SMS_FA = { rfq: "پیامکِ استعلام", pass: "پیامکِ رمز", resend: "پیامکِ رمز" };
/* sp-sms.js:deliverSms — via: textbee | sim | hold، و status «failed» یعنی TextBee نپذیرفت و شبیه‌سازی شد */
const smsState = (r) => (r.via === "textbee" ? "به درگاه پیامک سپرده شد" : r.via === "hold" ? "منتظر اتصالِ بات مکاتبات"
  : r.status === "failed" ? "نرفت — شبیه‌سازی شد" : "شبیه‌سازی (بی پیامکِ واقعی)");

/** ردیفِ هر منبع → شکلِ یکسانِ گزارش */
function feedRow(src, r) {
  const base = { key: `${src}:${r.id}`, src, at: r.at, request_id: r.rid || null, expert_id: r.expert_id || null };
  switch (src) {
    case "ev": {
      const p = parse(r.p, {}) || {};
      const who = actorOf(r.actor, p);
      return { ...base, ...who, expert_id: who.expert_id || r.aex || p.expert_id || null, kind: r.kind, text: evText(r, p), assignment_id: p.assignment_id || null, thread_id: p.thread_id || null };
    }
    case "alog":
      return { ...base, by: r.actor === "manager" || !r.actor ? "manager" : actorOf(r.actor).by, kind: r.action, assignment_id: r.assignment_id,
        text: r.action === "assign" ? `ارجاع به کارشناس${r.days ? ` — مهلت ${faN(r.days)} روز کاری` : ""}${r.source === "smart" ? " (ارجاع هوشمند)" : ""}`
          : `مهلت ارجاع ${r.days ? `${faN(r.days)} روز کاری` : "برداشته"} شد${r.source === "smart" ? " (مهلت هوشمند)" : ""}` };
    case "view": return { ...base, by: "expert", kind: "viewed", assignment_id: r.id, text: "درخواست را باز کرد (مشاهده)" };
    case "hist": return { ...base, by: "expert", kind: "hist", text: `بررسی سوابق — «${short(r.title, 60)}»` };
    case "norm": return { ...base, by: r.nsrc === "ai" ? "ai" : "expert", kind: "norm", text: `نرمال‌سازی قلم تأیید شد — «${short(r.title, 60)}»` };
    case "smart": return { ...base, by: "expert", kind: "smart", text: `جستجوی هوشمند — «${short(r.title || "قلم", 60)}»` };
    case "qadd": return { ...base, by: r.source === "ai" ? "ai" : "expert", kind: "quote_add",
      text: `خط استعلام «${short(r.supplier_name, 40)}» برای «${short(r.title, 50)}» افزوده شد${ORIGIN_FA[r.origin] ? ` (${ORIGIN_FA[r.origin]})` : ""}${SRC_FA[r.source] ? ` — ${SRC_FA[r.source]}` : ""}` };
    case "qfin": return { ...base, by: r.source === "ai" ? "ai" : "expert", kind: "quote_final", text: `تیک «تأیید نهایی» — «${short(r.supplier_name, 40)}» برای «${short(r.title, 50)}»` };
    case "pf": return { ...base, by: "expert", kind: "proforma", text: `پیش‌فاکتور «${short(r.supplier_name, 40)}» بارگذاری شد${r.filename ? ` — ${short(r.filename, 40)}` : ""}${SRC_FA[r.source] ? ` (${SRC_FA[r.source]})` : ""}` };
    case "msg": {
      const by = r.who === "s" ? "supplier" : r.who === "e" ? (r.ai ? "ai" : "expert") : "system";
      const what = MSG_KIND_FA[r.kind] || (r.kind === "text" ? "پیام" : "رخداد");
      const dir = r.who === "s" ? `از «${short(r.supplier, 40)}»` : `به «${short(r.supplier, 40)}»`;
      return { ...base, by, kind: `msg_${r.kind}`, thread_id: r.tid, demo: !!r.demo, text: `${what} ${dir}: ${short(r.body, 160) || "—"}` };
    }
    case "sms": return { ...base, by: "system", kind: "sms", thread_id: r.tid || null, demo: !!r.demo,
      text: `${SMS_FA[r.kind] || "پیامک"} برای «${short(r.supplier, 40)}» — ${smsState(r)}` };
    default: return base;
  }
}

/**
 * گزارش رخدادها. پارامترها (از نشانی یا opts): from/to (میلی‌ثانیه)، before (صفحهٔ بعد)، expert، rid (شمارهٔ
 * درخواست)، g (گروه: asg | work | chat | support؛ خالی = همه)، limit (حداکثر ۳۰۰).
 */
export async function supportActivity(env, url, opts = {}) {
  const q = (k) => (opts[k] !== undefined ? opts[k] : url ? url.searchParams.get(k) : null);
  const limit = Math.min(300, Math.max(20, int(q("limit")) || 150));
  const before = int(q("before"));
  const from = int(q("from")) || 0;
  const to = Math.min(int(q("to")) || 8.64e15, before || 8.64e15);
  const expert = int(q("expert"));
  const rid = T(q("rid")) || null;
  const g = Object.prototype.hasOwnProperty.call(GROUPS, q("g")) ? GROUPS[q("g")] : null;
  const srcs = g ? g.srcs : ALL_SRCS;
  const stmts = srcs.map((src) => {
    const f = FEED_SQL[src];
    let kinds = "";
    if (src === "ev") {
      const list = g ? g.kinds : null;
      kinds = list ? `AND e.kind IN (${list.map((k) => `'${k}'`).join(",")})` : `AND e.kind NOT IN (${DUP_KINDS.map((k) => `'${k}'`).join(",")})`;
    }
    const sql = f.sql.replace("{KINDS}", kinds).replace("{EX}", expert ? f.ex : "").replace("{RID}", rid ? f.rid : "");
    /* شمارهٔ جاها ثابت است (?1..?5)؛ D1 جای بی‌استفاده را نمی‌پذیرد، پس فقط تا بزرگ‌ترینِ به‌کاررفته می‌فرستیم */
    const args = [from, to, limit];
    if (rid) args.push(expert || 0, rid); else if (expert) args.push(expert);
    return env.DB.prepare(sql).bind(...args);
  });
  const res = await env.DB.batch(stmts);
  const rows = [];
  res.forEach((r, k) => { for (const x of r.results || []) if (x.at) rows.push(feedRow(srcs[k], x)); });
  rows.sort((a, b) => b.at - a.at || (a.key < b.key ? 1 : -1));
  const out = rows.slice(0, limit);
  /* اگر منبعی پُر برگشت، شاید ردیفِ قدیمی‌ترِ دیگری هم باشد — پنل دکمهٔ «قدیمی‌ترها» را نشان می‌دهد */
  const more = res.some((r) => (r.results || []).length >= limit) || rows.length > limit;
  return { rows: out, more, next: out.length ? out[out.length - 1].at : null };
}

/* ------------------------------------------------------------------ */
/* مکاتبات (فقط‌خواندنی)                                                  */
/* ------------------------------------------------------------------ */
export async function supportThreads(env, url) {
  const ex = int(url.searchParams.get("expert")), rid = T(url.searchParams.get("rid"));
  const conds = [], args = [];
  if (ex) { conds.push("a.expert_id=?"); args.push(ex); }
  if (rid) { conds.push("t.request_id=?"); args.push(rid); }
  const rows = (await env.DB.prepare(`SELECT t.id, t.request_id, t.assignment_id, t.last_at, t.created_at, s.name AS supplier, s.demo, a.expert_id, r.party,
      (SELECT COUNT(*) FROM sp_msgs m WHERE m.thread_id=t.id) AS msgs,
      (SELECT COUNT(*) FROM sp_lines l WHERE l.thread_id=t.id) AS lines,
      (SELECT COUNT(*) FROM sp_bundles b WHERE b.thread_id=t.id AND b.state='final') AS finals,
      (SELECT COUNT(*) FROM sp_msgs m WHERE m.thread_id=t.id AND m.meta_json LIKE '%"ai":true%') AS ai_msgs,
      (SELECT m.who FROM sp_msgs m WHERE m.thread_id=t.id ORDER BY m.id DESC LIMIT 1) AS last_who,
      (SELECT m.kind FROM sp_msgs m WHERE m.thread_id=t.id ORDER BY m.id DESC LIMIT 1) AS last_kind,
      (SELECT substr(m.body, 1, 140) FROM sp_msgs m WHERE m.thread_id=t.id ORDER BY m.id DESC LIMIT 1) AS last_body
    FROM sp_threads t JOIN sp_suppliers s ON s.id=t.supplier_id JOIN assignments a ON a.id=t.assignment_id JOIN requests r ON r.id=a.request_id
    ${conds.length ? `WHERE ${conds.join(" AND ")}` : ""} ORDER BY t.last_at DESC LIMIT 300`).bind(...args).all()).results || [];
  return { threads: rows.map((r) => ({ ...r, demo: !!r.demo })) };
}

/**
 * یک گفت‌وگو، کامل و از نگاهِ کارشناس (متنِ پیام صوتی، جدول تطابق و پذیرش‌ها) — ولی بی markSeen: نگاهِ
 * پشتیبانی نباید پیامی را برای کارشناس یا تأمین‌کننده «خوانده‌شده» کند. «پاک کردنِ» هر طرف هم این‌جا اثری ندارد.
 */
export async function supportThread(env, id) {
  const th = id ? await threadRow(env, id) : null;
  if (!th) throw new HttpError("این گفت‌وگو پیدا نشد.", 404);
  const [lines, bundles, msgs, files] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM sp_lines WHERE thread_id=? ORDER BY id").bind(th.id),
    env.DB.prepare("SELECT * FROM sp_bundles WHERE thread_id=? ORDER BY id").bind(th.id),
    env.DB.prepare("SELECT * FROM (SELECT * FROM sp_msgs WHERE thread_id=? ORDER BY id DESC LIMIT 400) ORDER BY id").bind(th.id),
    env.DB.prepare("SELECT id, line_id, label, note, filename, mime, size, at FROM sp_files WHERE thread_id=? ORDER BY id").bind(th.id),
  ]);
  return {
    thread: { ...threadOut(th, "e"), expert_id: th.expert_id, created_at: th.created_at, e_seen: th.e_seen, s_seen: th.s_seen },
    lines: (lines.results || []).map(lineOut),
    bundles: (bundles.results || []).map((b) => bundleOut(b, "e")),
    msgs: (msgs.results || []).map((m) => msgFor(msgOut(m), "e")),
    files: files.results || [],
    labels: FILE_LABELS,
  };
}

/* ------------------------------------------------------------------ */
/* تأیید کمیسیون                                                          */
/* ------------------------------------------------------------------ */
/**
 * اقلامِ بازِ ارجاع‌های ارسال‌شده، با شمار استعلام‌ها و برندهٔ «تأیید نهایی».
 * scope: ready (پیش‌فرض: جدول کمیسیونش ساخته شده) | open (همهٔ اقلام باز) | ok (تأییدشده‌ها، منتظر خاتمه)
 */
export async function commissionList(env, url, settings) {
  const s0 = url.searchParams.get("scope");
  const scope = ["ready", "open", "ok"].includes(s0) ? s0 : "ready";
  const ex = int(url.searchParams.get("expert")), rid = T(url.searchParams.get("rid"));
  const conds = ["i.state='open'", "a.dispatched_at IS NOT NULL"], args = [];
  if (scope === "ready") conds.push("a.commission_no IS NOT NULL");
  if (scope === "ok") conds.push("i.commission_ok=1");
  if (ex) { conds.push("a.expert_id=?"); args.push(ex); }
  if (rid) { conds.push("i.request_id=?"); args.push(rid); }
  const rows = (await env.DB.prepare(`SELECT i.id, i.title, i.qty, i.unit, i.code, i.line_no, i.commission_ok, i.request_id, a.id AS aid, a.expert_id,
      a.commission_no, a.commission_at, r.party, r.date,
      (SELECT COUNT(*) FROM quotes q WHERE q.assignment_id=a.id AND q.item_id=i.id AND q.saved=1) AS saved,
      (SELECT COUNT(*) FROM quotes q WHERE q.assignment_id=a.id AND q.item_id=i.id AND q.final=1) AS finals,
      (SELECT group_concat(q.supplier_name, '، ') FROM quotes q WHERE q.assignment_id=a.id AND q.item_id=i.id AND q.final=1) AS final_sup,
      (SELECT MIN(q.price) FROM quotes q WHERE q.assignment_id=a.id AND q.item_id=i.id AND q.final=1) AS final_price
    FROM items i JOIN assignments a ON a.id=i.assignment_id JOIN requests r ON r.id=i.request_id
    WHERE ${conds.join(" AND ")}
    ORDER BY (a.commission_at IS NULL), a.commission_at DESC, r.date DESC, i.request_id, i.line_no LIMIT 600`).bind(...args).all()).results || [];
  return { scope, min: (settings && settings.minSuppliers) || 1, items: rows };
}

/**
 * تیک «تأیید کمیسیون» — فقط از این پنل (پنل و بات کارشناس دیگر نمی‌توانند). body: {item_ids, ok}.
 * فقط اقلامِ بازِ ارجاع‌های ارسال‌شده؛ برای هر ارجاع یک رخداد و یک پیامِ تلگرام به کارشناسش.
 */
export async function setCommission(env, body) {
  const ids = [...new Set((Array.isArray(body && body.item_ids) ? body.item_ids : [body && body.item_id]).map(int).filter(Boolean))].slice(0, 300);
  if (!ids.length) throw new HttpError("قلمی انتخاب نشده.");
  const ok = body && body.ok ? 1 : 0;
  const rows = (await env.DB.prepare(`SELECT i.id, i.title, i.request_id, i.commission_ok, a.id AS aid, a.expert_id, e.telegram_chat
      FROM items i JOIN assignments a ON a.id=i.assignment_id JOIN experts e ON e.id=a.expert_id
      WHERE i.id IN (${ids.map(() => "?").join(",")}) AND i.state='open' AND a.dispatched_at IS NOT NULL`).bind(...ids).all()).results || [];
  const todo = rows.filter((r) => (r.commission_ok ? 1 : 0) !== ok);
  if (!todo.length) return { ok: true, changed: 0, notified: 0 };
  const t = now();
  const byAsg = new Map();
  for (const r of todo) { if (!byAsg.has(r.aid)) byAsg.set(r.aid, []); byAsg.get(r.aid).push(r); }
  const stmts = [env.DB.prepare(`UPDATE items SET commission_ok=? WHERE state='open' AND id IN (${todo.map(() => "?").join(",")})`).bind(ok, ...todo.map((r) => r.id))];
  let notified = 0;
  for (const [aid, list] of byAsg) {
    const r0 = list[0];
    stmts.push(evStmt(env, ok ? "commission_ok" : "commission_off", r0.request_id, list.length === 1 ? r0.id : null,
      { assignment_id: aid, expert_id: r0.expert_id, item_ids: list.map((r) => r.id) }));
    if (!r0.telegram_chat) continue;
    const titles = list.slice(0, 8).map((r) => `• ${esc(short(r.title, 60))}`).join("\n") + (list.length > 8 ? `\n• … و ${faN(list.length - 8)} قلم دیگر` : "");
    const text = ok
      ? `✅ <b>پشتیبانی کمیسیونِ ${faN(list.length)} قلم از درخواست ${esc(r0.request_id)} را تأیید کرد</b>\n${titles}\n\nحالا می‌توانید این اقلام را «خاتمه» بزنید.`
      : `↩️ <b>پشتیبانی تأیید کمیسیونِ ${faN(list.length)} قلم از درخواست ${esc(r0.request_id)} را برداشت</b>\n${titles}`;
    stmts.push(queueStmt(env, `sup-cm:${aid}:${t}:${ok}`, r0.telegram_chat, text, ok ? [[{ text: "🔒 خاتمه", callback_data: `cm:${aid}:card:0` }]] : null));
    notified++;
  }
  for (let i = 0; i < stmts.length; i += 90) await env.DB.batch(stmts.slice(i, i + 90));
  return { ok: true, changed: todo.length, notified };
}
