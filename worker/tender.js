/**
 * «مناقصه» — مزایدهٔ معکوسِ زنده برای خرید (مهر ۱۴۰۵، درخواست مالک).
 *
 * پشتیبانی در پنلِ خودش قلم (یا چند قلم) را جستجو می‌کند، تأمین‌کنندگانِ سوابق (و هر تأمین‌کنندهٔ تازه) را با تیک انتخاب
 * می‌کند، قیمتِ شروع، مقدار، واحد و قواعد را می‌گذارد و «ارسال دعوت» پیامکی می‌فرستد که فقط لینکِ سایت در آن است
 * (نه نوعِ کالا، نه مقدار). تأمین‌کننده هر بار با شمارهٔ همراه و رمزِ پیامکی وارد صفحهٔ مناقصه می‌شود، قیمتِ واحد را
 * پایین می‌آورد و کمترین قیمت در پایان برنده است. قواعدِ ناب: tender-core.js.
 *
 *   • نام‌ها پیش‌فرض پنهان‌اند («تأمین‌کنندهٔ ۳»)؛ «فقط رتبه» قیمت‌ها را هم پنهان می‌کند؛ «دورِ سربسته» پیش از دورِ زنده.
 *   • ثبتِ پیشنهاد اتمی است: درجِ پیشنهاد (و پیشنهادهای خودکارِ پاسخ) و به‌روزرسانیِ «بهترین» در یک batch با شرطِ rev.
 *   • هر کس رتبه‌اش پایین آمد پیامک (و پیامِ بات تلگرامِ تأمین‌کنندگان اگر وصل است) می‌گیرد — با فاصلهٔ کمینه، قابلِ خاموشی.
 *   • پشتیبانی پیشنهادِ اشتباه را اصلاح یا باطل می‌کند (با علت؛ در رخدادها می‌ماند) و بهترین دوباره حساب می‌شود.
 *   • پایان: با اولین خواندن یا Cron (tenderTick)؛ برنده ثبت، تلگرامِ پشتیبان، پیامکِ برنده و پیامِ تشکر به بقیه.
 *   • چندقلمی: قلم‌های یک «گروه» (grp) با یک دعوت و یک ورود؛ هر قلم مزایدهٔ خودش.
 *   • پیامک از همان درگاهِ TextBeeِ مکاتبات (sms.js)؛ پشتیبانی می‌تواند کلید و دستگاهِ جدا برای مناقصه بگذارد (settings.tenderSms).
 *   • بازار: دلار، یورو، درهم، تتر، طلا و سکه از tgju (هر دقیقه یک بار، با کشِ Cloudflare).
 */
import { HttpError } from "./http.js";
import { normPhone, maskPhone, randHex, rand6, sha256hex, passHash, siteOrigin, COMPANY, nkey, savePhone } from "./sp-core.js";
import { sendSms, smsReady, isMobile } from "./sms.js";
import { queueStmt } from "./queue.js";
import { keyOf } from "./catalog.js";
import { raiseAlarm } from "./alarms.js";
import { telegram } from "./telegram.js";
import { usdTable } from "./usd.js";
import { runDiscovery, MARKETS, MAX_MARKETS, MODEL as DISCOVERY_MODEL } from "./discovery.js";
import { TENDER_DEFAULTS, tenderState, bidRange, checkBid, extendOnBid, bestOf, ranksOf, mineOf, rankDrops, proxyRun, numWords } from "./tender-core.js";

export const TENDER_DDL = `
CREATE TABLE IF NOT EXISTS tenders (id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, title TEXT NOT NULL, item_code TEXT, item_title TEXT, spec TEXT, terms TEXT, qty REAL NOT NULL, unit TEXT NOT NULL, start_price INTEGER NOT NULL, step_pct REAL NOT NULL DEFAULT 0.5, step_min INTEGER NOT NULL DEFAULT 0, floor_pct REAL NOT NULL DEFAULT 30, jump_pct REAL NOT NULL DEFAULT 10, ext_window_s INTEGER NOT NULL DEFAULT 180, ext_s INTEGER NOT NULL DEFAULT 180, ext_max INTEGER NOT NULL DEFAULT 0, ext_count INTEGER NOT NULL DEFAULT 0, show_names INTEGER NOT NULL DEFAULT 0, duration_s INTEGER NOT NULL DEFAULT 1800, start_at INTEGER, end_at INTEGER, state TEXT NOT NULL DEFAULT 'draft', best_amount INTEGER, best_alias INTEGER, best_bid_id INTEGER, winner_alias INTEGER, ended_at INTEGER, cancel_reason TEXT, rev INTEGER NOT NULL DEFAULT 0, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_tender_state ON tenders(state, end_at);
CREATE TABLE IF NOT EXISTS tender_invites (tender_id INTEGER NOT NULL, alias INTEGER NOT NULL, name TEXT NOT NULL, phone TEXT, supplier_id INTEGER, source TEXT, info TEXT, on_list INTEGER NOT NULL DEFAULT 1, sms_at INTEGER, sms_state TEXT, sms_err TEXT, pass_hash TEXT, pass_exp INTEGER, pass_sent_at INTEGER, pass_day INTEGER, pass_n INTEGER NOT NULL DEFAULT 0, fails INTEGER NOT NULL DEFAULT 0, lock_until INTEGER, seen_at INTEGER, PRIMARY KEY (tender_id, alias)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS tender_bids (id INTEGER PRIMARY KEY, tender_id INTEGER NOT NULL, alias INTEGER NOT NULL, amount INTEGER NOT NULL, at INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'ok', orig_amount INTEGER, fix_by TEXT, fix_reason TEXT, fix_at INTEGER, ext INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS ix_tbid_t ON tender_bids(tender_id, id);
CREATE TABLE IF NOT EXISTS tender_sessions (h TEXT PRIMARY KEY, tender_id INTEGER NOT NULL, alias INTEGER NOT NULL, exp INTEGER NOT NULL, at INTEGER NOT NULL) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS tender_jobs (id INTEGER PRIMARY KEY, tender_id INTEGER NOT NULL, query TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', result_json TEXT, error TEXT, at INTEGER NOT NULL, done_at INTEGER);
`;
/** ستون‌های دورِ دوم (روی جدول‌های موجودِ تولید با ALTER — api.js:COLUMN_MIGRATIONS) */
export const TENDER_COLUMNS = [
  ["tenders", "grp", "TEXT"],                                   /* کدِ گروهِ مناقصهٔ چندقلمی */
  ["tenders", "lot_no", "INTEGER"],
  ["tenders", "sealed_s", "INTEGER NOT NULL DEFAULT 0"],        /* مدتِ دورِ سربسته */
  ["tenders", "sealed_end_at", "INTEGER"],
  ["tenders", "sealed_done", "INTEGER NOT NULL DEFAULT 0"],
  ["tenders", "show_prices", "INTEGER NOT NULL DEFAULT 1"],     /* ۰ = «فقط رتبه» */
  ["tenders", "proxy_on", "INTEGER NOT NULL DEFAULT 1"],        /* «پیشنهادِ خودکار» مجاز */
  ["tenders", "require_accept", "INTEGER NOT NULL DEFAULT 0"],
  ["tenders", "outbid_sms", "INTEGER NOT NULL DEFAULT 1"],
  ["tenders", "outbid_gap_s", "INTEGER NOT NULL DEFAULT 120"],
  ["tenders", "thanks_sms", "INTEGER NOT NULL DEFAULT 1"],
  ["tenders", "req_aid", "INTEGER"],                            /* ثبت‌شده در درخواست (ارجاع و قلم) */
  ["tenders", "req_item", "INTEGER"],
  ["tenders", "req_at", "INTEGER"],
  ["tender_invites", "proxy_min", "INTEGER"],
  ["tender_invites", "proxy_at", "INTEGER"],
  ["tender_invites", "accepted_at", "INTEGER"],
  ["tender_invites", "notify_off", "INTEGER NOT NULL DEFAULT 0"],
  ["tender_invites", "outbid_at", "INTEGER"],
  ["tender_invites", "outbid_n", "INTEGER NOT NULL DEFAULT 0"],
  ["tender_bids", "auto", "INTEGER NOT NULL DEFAULT 0"],
  ["tender_bids", "sealed", "INTEGER NOT NULL DEFAULT 0"],
  ["tender_sessions", "phone", "TEXT"],
  ["tender_jobs", "params_json", "TEXT"],                       /* همان ورودی‌های جستجوی هوشمندِ پنل کارشناس */
  ["tender_jobs", "model", "TEXT"],
  ["tender_jobs", "cost", "REAL"],
  ["tender_jobs", "searches", "INTEGER"],
  ["tender_jobs", "fetches", "INTEGER"],
  ["tender_jobs", "started_at", "INTEGER"],
];

const T = (v) => String(v == null ? "" : v).trim();
const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const now = () => Date.now();
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const latin = (s) => String(s == null ? "" : s).replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
const faN = (n) => String(n == null ? "" : n).replace(/\B(?=(\d{3})+(?!\d))/g, "٬").replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[+d]);
const escH = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const wait = (ctx, job) => { if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(job.catch((e) => console.error("tender job", e && e.message))); else return job.catch(() => {}); return null; };
/** عددِ صحیح از ورودیِ کاربر با هر رقم و جداکننده؛ نامعتبر → NaN */
export const amountOf = (v) => {
  if (typeof v === "number") return v;
  const s = latin(v).replace(/[,٬،\s]/g, "").replace(/ریال/g, "");
  return s && /^\d+$/.test(s) ? Number(s) : NaN;
};
/** عدد در بازه؛ خالی یا نامعتبر → پیش‌فرض (فیلدِ نفرستاده یعنی «همان قبلی»، نه صفر) */
const num = (v, d, lo, hi) => {
  if (v == null || T(v) === "") return d;
  const n = Number(latin(v).replace(/[,٬\s]/g, "").replace(/٫/g, "."));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const bool = (v, d) => (v === undefined || v === null || v === "" ? d : v === true || v === 1 || v === "1" || v === "true" ? 1 : 0);
export const aliasLabel = (a) => `تأمین‌کنندهٔ ${faN(a)}`;
export const TENDER_PATH = "/tamin-poshtibani/tender.html";
export const tenderLink = (env, code) => `${siteOrigin(env)}${TENDER_PATH}#t=${code}`;

const PASS_TTL = 3 * 3600e3, PASS_GAP = 60e3, PASS_DAY = 6, MAX_FAILS = 5, LOCK_MS = 15 * 60e3, SESSION_TTL = 8 * 3600e3;
/** قواعدی که در هر مناقصه ذخیره می‌شوند (و در «پیش‌فرض‌ها»ی پشتیبان) */
const RULES = ["step_pct", "step_min", "floor_pct", "jump_pct", "ext_window_s", "ext_s", "ext_max", "show_names", "duration_s",
  "sealed_s", "show_prices", "proxy_on", "require_accept", "outbid_sms", "outbid_gap_s", "thanks_sms"];
/** قواعدی که در گروهِ چندقلمی برای همهٔ قلم‌ها یکی است */
const GROUP_RULES = RULES.filter((k) => !["duration_s", "sealed_s"].includes(k));

/* ------------------------------------------------------------------ */
/* تنظیماتِ پشتیبان: پیش‌فرض‌ها و درگاهِ پیامک                          */
/* ------------------------------------------------------------------ */
const setting = async (env, key) => { const r = await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(key).first().catch(() => null); return r ? parse(r.value, r.value) : null; };
const putSetting = (env, key, v) => env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").bind(key, JSON.stringify(v), now()).run();

function cleanRules(b, base) {
  const s = { ...TENDER_DEFAULTS, ...(base || {}) };
  const o = {};
  o.step_pct = num(b.step_pct, s.step_pct, 0, 20);
  o.step_min = Math.round(num(b.step_min, s.step_min, 0, 1e12));
  o.floor_pct = num(b.floor_pct, s.floor_pct, 1, 95);
  o.jump_pct = num(b.jump_pct, s.jump_pct, 0.5, 95);
  o.ext_window_s = Math.round(num(b.ext_window_s, s.ext_window_s, 0, 3600));
  o.ext_s = Math.round(num(b.ext_s, s.ext_s, 0, 3600));
  o.ext_max = Math.round(num(b.ext_max, s.ext_max, 0, 1000));
  o.duration_s = Math.round(num(b.duration_s, s.duration_s, 60, 7 * 86400));
  o.sealed_s = Math.round(num(b.sealed_s, s.sealed_s, 0, 7 * 86400));
  o.outbid_gap_s = Math.round(num(b.outbid_gap_s, s.outbid_gap_s, 0, 86400));
  for (const k of ["show_names", "show_prices", "proxy_on", "require_accept", "outbid_sms", "thanks_sms"]) o[k] = bool(b[k], s[k] ? 1 : 0);
  return o;
}
async function defaultsOf(env) { return cleanRules({}, (await setting(env, "tenderDefaults")) || {}); }
/** درگاهِ پیامکِ مناقصه: همان TextBeeِ مکاتبات، مگر پشتیبان کلید یا دستگاهِ جدا گذاشته باشد */
async function smsEnv(env) {
  const c = (await setting(env, "tenderSms")) || {};
  if (!T(c.key) && !T(c.device)) return env;
  return { ...env, ...(T(c.key) ? { TEXTBEE_API_KEY: T(c.key) } : {}), ...(T(c.device) ? { TEXTBEE_DEVICE_ID: T(c.device) } : {}) };
}
/** GET /support/tender-settings */
export async function tenderSettingsGet(env) {
  const c = (await setting(env, "tenderSms")) || {};
  const se = await smsEnv(env);
  return { defaults: await defaultsOf(env), terms: T((await setting(env, "tenderTerms")) || ""),
    ai: { ready: !!T(env.ANTHROPIC_API_KEY), model: env.DISCOVERY_MODEL || DISCOVERY_MODEL, markets: MARKETS.map((m) => ({ key: m.key, fa: m.fa })), max: MAX_MARKETS },
    sms: { ready: smsReady(se), provider: "TextBee", own_key: !!T(c.key), key_tail: T(c.key) ? `…${T(c.key).slice(-4)}` : "", device: T(c.device), shared: smsReady(env) && !T(c.key) } };
}
/** PUT /support/tender-settings — {defaults, terms, sms: {key ("" = همان مکاتبات؛ نفرستاده = بی‌تغییر), device}} */
export async function tenderSettingsSave(env, b) {
  if (b.defaults) await putSetting(env, "tenderDefaults", cleanRules(b.defaults, await defaultsOf(env)));
  if (b.terms !== undefined) await putSetting(env, "tenderTerms", T(b.terms).slice(0, 2000));
  if (b.sms) {
    const c = (await setting(env, "tenderSms")) || {};
    if (b.sms.key !== undefined) c.key = T(b.sms.key).slice(0, 200);
    if (b.sms.device !== undefined) c.device = T(b.sms.device).slice(0, 100);
    await putSetting(env, "tenderSms", c);
  }
  await env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)").bind(now(), "support", "tender_settings", null,
    JSON.stringify({ defaults: !!b.defaults, terms: b.terms !== undefined, sms: !!b.sms })).run();
  return tenderSettingsGet(env);
}
/** POST /support/tender-settings/test {phone} — پیامکِ آزمایشی از درگاهِ مناقصه */
export async function tenderSmsTest(env, b) {
  const p = T(b && b.phone);
  if (!isMobile(p)) throw new HttpError("شمارهٔ همراه را درست بنویسید (مثل ۰۹۱۲۱۲۳۴۵۶۷).");
  const r = await sms(env, p, `${COMPANY(env)}\nپیامکِ آزمایشیِ مناقصه — درگاه کار می‌کند.`);
  if (r.state !== "sent") throw new HttpError(r.error || "پیامک نرفت.", 502);
  return { ok: true };
}

async function sms(env, to, text) {
  const se = await smsEnv(env);
  if (!smsReady(se)) return { state: "off", error: "درگاه پیامک وصل نیست." };
  try { await sendSms(se, to, text); return { state: "sent" }; }
  catch (e) { return { state: "error", error: T(e && e.message).slice(0, 200) || "ارسال نشد" }; }
}
/** همان پیام در بات تلگرامِ تأمین‌کنندگان، برای شماره‌ای که بات را وصل کرده (با دکمهٔ «ورود به مناقصه») */
async function tgSupplier(env, phone, text, link) {
  if (!phone || !env.TG_SP_BOT_TOKEN) return 0;
  const chats = (await env.DB.prepare("SELECT t.chat FROM sp_tg t JOIN sp_phones p ON p.id=t.phone_id WHERE p.phone=?").bind(phone).all().catch(() => ({ results: [] }))).results || [];
  let n = 0;
  for (const c of chats.slice(0, 3)) {
    try {
      await telegram(env, "sp").call("sendMessage", { chat_id: c.chat, text: escH(text), parse_mode: "HTML", link_preview_options: { is_disabled: true },
        ...(link ? { reply_markup: { inline_keyboard: [[{ text: "🔨 ورود به مناقصه", url: link }]] } } : {}) });
      n++;
    } catch (_) { /* گفت‌وگوی بسته یا بات مسدود */ }
  }
  return n;
}
/** پیامک + تلگرام؛ خروجی {state, tg} */
async function notify(env, phone, text, link) {
  const [s, tg] = await Promise.all([phone ? sms(env, phone, `${text}${link ? `\n${link}` : ""}`) : Promise.resolve({ state: "nophone" }), tgSupplier(env, phone, text, link)]);
  return { ...s, tg };
}

/* ------------------------------------------------------------------ */
/* خواندن، دورِ سربسته، پایان                                            */
/* ------------------------------------------------------------------ */
async function rowOf(env, id) { return env.DB.prepare("SELECT * FROM tenders WHERE id=?").bind(id).first(); }
async function rowOfCode(env, code) { return /^[0-9a-f]{6,20}$/.test(T(code)) ? env.DB.prepare("SELECT * FROM tenders WHERE code=?").bind(T(code)).first() : null; }
const bidsOf = async (env, id) => (await env.DB.prepare("SELECT * FROM tender_bids WHERE tender_id=? ORDER BY id").bind(id).all()).results || [];
const invitesOf = async (env, id) => (await env.DB.prepare("SELECT * FROM tender_invites WHERE tender_id=? ORDER BY alias").bind(id).all()).results || [];
/** همهٔ قلم‌های گروهِ همین مناقصه (یا خودش) */
const lotsOf = async (env, t) => (t.grp ? (await env.DB.prepare("SELECT * FROM tenders WHERE grp=? ORDER BY lot_no, id").bind(t.grp).all()).results || [t] : [t]);
const minsLeft = (t) => Math.max(0, Math.round((t.end_at - now()) / 60e3));

/** پایانِ دورِ سربسته: پیشنهادهای خودکار اجرا می‌شوند و هر شرکت‌کننده رتبه‌اش را می‌گیرد (یک بار) */
async function sealedCloseIfDue(env, t, ctx) {
  if (!t || t.state !== "scheduled" || !t.sealed_end_at || t.sealed_done || now() < t.sealed_end_at || now() >= t.end_at) return t;
  const r = await env.DB.prepare("UPDATE tenders SET sealed_done=1, rev=rev+1 WHERE id=? AND sealed_done=0").bind(t.id).run();
  if (!r.meta.changes) return rowOf(env, t.id);
  let fresh = await rowOf(env, t.id);
  if (fresh.proxy_on) fresh = (await runProxies(env, fresh, ctx, new Set())) || fresh;
  const [bids, inv] = await Promise.all([bidsOf(env, t.id), invitesOf(env, t.id)]);
  const ranks = ranksOf(bids), link = tenderLink(env, fresh.code);
  const jobs = inv.filter((i) => ranks.has(i.alias) && !i.notify_off && fresh.outbid_sms).map((i) => notify(env, i.phone,
    `${COMPANY(env)}\nدورِ سربستهٔ مناقصه تمام شد؛ رتبهٔ شما ${faN(ranks.get(i.alias).rank)} است و دورِ زنده شروع شد (${faN(minsLeft(fresh))} دقیقه).`, link));
  if (jobs.length) wait(ctx, Promise.all(jobs));
  return fresh;
}

/**
 * مناقصه‌ای که زمانش تمام شده بسته می‌شود (یک بار، با شرطِ state و end_at): برنده ثبت، رخداد، تلگرامِ پشتیبان،
 * پیامکِ برنده و پیامِ تشکر به بقیه. خروجی: ردیفِ تازه (یا همان ردیف اگر کاری نبود)
 */
export async function finalizeIfDue(env, t, ctx) {
  if (!t) return t;
  if (t.state === "scheduled" && t.sealed_end_at && !t.sealed_done && now() >= t.sealed_end_at && now() < t.end_at) return sealedCloseIfDue(env, t, ctx);
  if (t.state !== "scheduled" || !t.end_at || now() < t.end_at) return t;
  const r = await env.DB.prepare("UPDATE tenders SET state='ended', ended_at=end_at, winner_alias=best_alias, rev=rev+1, updated_at=? WHERE id=? AND state='scheduled' AND end_at<=?")
    .bind(now(), t.id, now()).run();
  const fresh = await rowOf(env, t.id);
  if (!r.meta.changes) return fresh;
  const [inv, bids] = await Promise.all([invitesOf(env, t.id), bidsOf(env, t.id)]);
  const win = fresh.winner_alias != null ? inv.find((i) => i.alias === fresh.winner_alias) : null;
  const ranks = ranksOf(bids);
  const line = win ? `برنده: ${win.name} — ${faN(fresh.best_amount)} ریال برای هر ${fresh.unit}` : "هیچ پیشنهادی نرسید.";
  const stmts = [env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)").bind(now(), "system", "tender_end", null,
    JSON.stringify({ tender_id: t.id, title: fresh.title, winner: win ? win.name : null, amount: fresh.best_amount, bidders: ranks.size }))];
  const sc = await setting(env, "supportChat");
  if (sc) stmts.push(queueStmt(env, `tender:${t.id}:end`, sc, `🏁 <b>مناقصهٔ «${escH(fresh.title)}» تمام شد</b>\n${escH(line)}\n${faN(ranks.size)} شرکت‌کننده · ${faN(fresh.ext_count)} بار تمدید`, null));
  await env.DB.batch(stmts);
  const link = tenderLink(env, fresh.code), co = COMPANY(env), jobs = [];
  if (win) jobs.push(notify(env, win.phone, `${co}\nمناقصه به پایان رسید و پیشنهادِ شما کمترین قیمت بود. همکارانِ تدارکات برای ادامهٔ کار با شما تماس می‌گیرند.`, link));
  if (fresh.thanks_sms) {
    for (const i of inv) if (ranks.has(i.alias) && (!win || i.alias !== win.alias)) {
      jobs.push(notify(env, i.phone, `${co}\nمناقصه به پایان رسید؛ این بار پیشنهادِ دیگری کمتر بود. از همراهی و پیشنهادتان سپاسگزاریم و به امیدِ همکاری‌های بعدی.`, null));
    }
  }
  if (jobs.length) wait(ctx, Promise.all(jobs));
  return fresh;
}

/** Cron: پایانِ دورِ سربسته، مناقصه‌های تمام‌شده و پیشنهادهای خودکارِ معطل */
export async function tenderTick(env, ctx) {
  const n = now();
  const due = (await env.DB.prepare("SELECT * FROM tenders WHERE state='scheduled' AND (end_at<=? OR (sealed_end_at IS NOT NULL AND sealed_done=0 AND sealed_end_at<=?)) LIMIT 20").bind(n, n).all()
    .catch(() => ({ results: [] }))).results || [];
  let done = 0;
  for (const t of due) { await finalizeIfDue(env, t, ctx); done++; }
  return done;
}

/* ------------------------------------------------------------------ */
/* ثبتِ پیشنهاد (دستی و خودکار) و خبرِ «عقب افتادید»                     */
/* ------------------------------------------------------------------ */
/**
 * درجِ چند پیشنهاد (به ترتیب) و به‌روزرسانیِ بهترین و پایان در یک batch با شرطِ rev. خروجی: ردیفِ تازه یا null اگر rev عوض شده بود.
 * list: [{alias, amount, auto, sealed}]
 */
async function commitBids(env, t, bids, list, n) {
  let end = { end_at: t.end_at, ext_count: t.ext_count || 0 }, all = bids.slice();
  const rows = list.map((b, i) => {
    const at = n + i;
    const ex = extendOnBid({ ...t, end_at: end.end_at, ext_count: end.ext_count }, at);
    if (ex.extended) end = { end_at: ex.end_at, ext_count: end.ext_count + 1 };
    const row = { id: 1e15 + i, tender_id: t.id, alias: b.alias, amount: b.amount, at, state: "ok", ext: ex.extended ? 1 : 0, auto: b.auto ? 1 : 0, sealed: b.sealed ? 1 : 0 };
    all.push(row);
    return row;
  });
  const best = bestOf(all);
  const stmts = rows.map((r) => env.DB.prepare("INSERT INTO tender_bids (tender_id,alias,amount,at,ext,auto,sealed) SELECT ?,?,?,?,?,?,? WHERE (SELECT rev FROM tenders WHERE id=?)=?")
    .bind(t.id, r.alias, r.amount, r.at, r.ext, r.auto, r.sealed, t.id, t.rev));
  stmts.push(env.DB.prepare(`UPDATE tenders SET rev=rev+1, best_amount=?, best_alias=?, best_bid_id=(SELECT id FROM tender_bids WHERE tender_id=? AND alias=? AND amount=? ORDER BY at, id LIMIT 1),
      end_at=?, ext_count=?, updated_at=? WHERE id=? AND rev=?`).bind(best ? best.amount : null, best ? best.alias : null, t.id, best ? best.alias : 0, best ? best.amount : 0,
    end.end_at, end.ext_count, n, t.id, t.rev));
  const res = await env.DB.batch(stmts);
  return res[res.length - 1].meta.changes ? rowOf(env, t.id) : null;
}
/** پیشنهادهای خودکارِ مجاز روی وضعیتِ فعلی (فقط دورِ زنده) */
async function proxiesOf(env, t) {
  if (!t.proxy_on) return [];
  return ((await env.DB.prepare("SELECT alias, proxy_min AS min, proxy_at AS at FROM tender_invites WHERE tender_id=? AND on_list=1 AND proxy_min IS NOT NULL").bind(t.id).all()).results || []);
}
/** هر کس رتبه‌اش پایین آمد پیامک و تلگرام می‌گیرد — با فاصلهٔ کمینه و تیکِ «خبر نده»ِ خودش */
async function notifyDrops(env, t, before, after, skip, ctx) {
  if (!t.outbid_sms) return;
  const drops = rankDrops(before, after, skip);
  if (!drops.length) return;
  const inv = await invitesOf(env, t.id), n = now(), gap = (t.outbid_gap_s ?? 120) * 1000;
  const co = COMPANY(env), link = tenderLink(env, t.code), jobs = [], stmts = [];
  for (const d of drops) {
    const i = inv.find((x) => x.alias === d.alias);
    if (!i || i.notify_off || !i.on_list || (i.outbid_at && n - i.outbid_at < gap)) continue;
    const lost = d.from === 1;
    const text = `${co}\n${lost ? "دیگر پیشتازِ مناقصه نیستید" : "در مناقصه پیشنهادِ پایین‌تری ثبت شد"}؛ رتبهٔ شما اکنون ${faN(d.to)} است. ${faN(minsLeft(t))} دقیقه تا پایان مانده.`;
    jobs.push(notify(env, i.phone, text, link));
    stmts.push(env.DB.prepare("UPDATE tender_invites SET outbid_at=?, outbid_n=outbid_n+1 WHERE tender_id=? AND alias=?").bind(n, t.id, i.alias));
  }
  if (stmts.length) await env.DB.batch(stmts);
  if (jobs.length) wait(ctx, Promise.all(jobs));
}
/** اجرای پیشنهادهای خودکار و خبرِ «عقب افتادید»؛ خروجی: ردیفِ تازه (یا null اگر کاری نبود) */
async function runProxies(env, t, ctx, skip) {
  for (let i = 0; i < 3; i++) {
    if (tenderState(t, now()) !== "live") return null;
    const P = await proxiesOf(env, t);
    if (!P.length) return null;
    const list = proxyRun(t, P);
    if (!list.length) return null;
    const bids = await bidsOf(env, t.id);
    const before = ranksOf(bids);
    const fresh = await commitBids(env, t, bids, list.map((x) => ({ ...x, auto: true })), now());
    if (fresh) {
      await notifyDrops(env, fresh, before, ranksOf(await bidsOf(env, t.id)), skip, ctx);
      return fresh;
    }
    t = await rowOf(env, t.id);
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* نما                                                                 */
/* ------------------------------------------------------------------ */
const pub = (t, n) => ({
  id: t.id, code: t.code, grp: t.grp || null, lot_no: t.lot_no || null, title: t.title, item_code: t.item_code, item_title: t.item_title, spec: t.spec, terms: t.terms,
  qty: t.qty, unit: t.unit, start_price: t.start_price, step_pct: t.step_pct, step_min: t.step_min, floor_pct: t.floor_pct, jump_pct: t.jump_pct,
  ext_window_s: t.ext_window_s, ext_s: t.ext_s, ext_max: t.ext_max, ext_count: t.ext_count, show_names: !!t.show_names, show_prices: t.show_prices !== 0,
  proxy_on: !!t.proxy_on, require_accept: !!t.require_accept, outbid_sms: !!t.outbid_sms, outbid_gap_s: t.outbid_gap_s ?? 120, thanks_sms: !!t.thanks_sms,
  sealed_s: t.sealed_s || 0, sealed_end_at: t.sealed_end_at || null, duration_s: t.duration_s, start_at: t.start_at, end_at: t.end_at, ended_at: t.ended_at,
  state: tenderState(t, n), best_amount: t.best_amount, rev: t.rev, cancel_reason: t.cancel_reason, req_aid: t.req_aid || null, req_item: t.req_item || null, req_at: t.req_at || null,
});
/** سری برای نمودار: بهترین قیمت پس از هر پیشنهادِ معتبر */
function seriesOf(bids) {
  const out = []; let best = null;
  for (const b of bids.filter((x) => x.state !== "void").sort((a, c) => a.at - c.at || a.id - c.id)) {
    if (best == null || b.amount < best) best = b.amount;
    out.push({ at: b.at, amount: b.amount, best, alias: b.alias });
  }
  return out;
}

/**
 * سوابقِ خریدِ همین کالا به «قیمت روز» (نسبتِ نرخِ دلارِ امروز به نرخِ روزِ خرید) — فقط برای پشتیبان.
 * {unit, n, last:{date, price, today, supplier}, median, min} از ده خریدِ آخرِ با مقدار
 */
async function historyOf(env, t) {
  if (!t.item_code) return null;
  const rows = (await env.DB.prepare("SELECT order_date, qty, unit, amount, supplier FROM purchases WHERE item_code=? AND qty>0 AND amount>0 ORDER BY order_date DESC LIMIT 10").bind(t.item_code).all()
    .catch(() => ({ results: [] }))).results || [];
  if (!rows.length) return null;
  const tb = await usdTable(env).catch(() => null);
  const list = rows.map((r) => {
    const price = r.amount / r.qty, on = tb && tb.rateOn(r.order_date);
    const today = on && on.rate ? price * tb.latest.rate / on.rate : null;
    return { date: r.order_date, unit: r.unit, price: Math.round(price), today: today == null ? null : Math.round(today), supplier: r.supplier };
  });
  /* بعضی خریدهای قدیمی با مقیاسِ دیگری ثبت شده‌اند (مثلاً «۴۰» برای چهل میلیون): هر چه کمتر از یک‌پنجاهمِ بیشترین است کنار می‌رود */
  const all = list.map((x) => x.today ?? x.price), top = Math.max(...all);
  const keep = list.filter((x) => (x.today ?? x.price) >= top / 50);
  const vals = keep.map((x) => x.today ?? x.price).sort((a, b) => a - b);
  return { unit: rows[0].unit, n: keep.length, dropped: list.length - keep.length, last: keep[0], median: vals[Math.floor(vals.length / 2)], min: vals[0], usd: !!tb, list: keep.slice(0, 6) };
}

/* ------------------------------------------------------------------ */
/* پنل پشتیبانی                                                         */
/* ------------------------------------------------------------------ */
export async function tenderList(env, ctx) {
  const rows = (await env.DB.prepare(`SELECT t.*, (SELECT COUNT(*) FROM tender_invites i WHERE i.tender_id=t.id AND i.on_list=1) AS invited,
      (SELECT COUNT(DISTINCT b.alias) FROM tender_bids b WHERE b.tender_id=t.id AND b.state<>'void') AS bidders,
      (SELECT COUNT(*) FROM tender_bids b WHERE b.tender_id=t.id AND b.state<>'void') AS bids,
      (SELECT i.name FROM tender_invites i WHERE i.tender_id=t.id AND i.alias=COALESCE(t.winner_alias, t.best_alias)) AS best_name,
      (SELECT COUNT(*) FROM tenders g WHERE g.grp=t.grp) AS lots
    FROM tenders t ORDER BY CASE WHEN t.state='scheduled' THEN 0 WHEN t.state='draft' THEN 1 ELSE 2 END, COALESCE(t.end_at, t.created_at) DESC, t.lot_no LIMIT 200`).all()).results || [];
  const n = now(), out = [];
  for (const r of rows) {
    const due = r.state === "scheduled" && (r.end_at <= n || (r.sealed_end_at && !r.sealed_done && r.sealed_end_at <= n));
    const f = due ? { ...r, ...(await finalizeIfDue(env, r, ctx)) } : r;
    out.push({ ...pub(f, n), invited: r.invited, bidders: r.bidders, bids: r.bids, best_name: r.best_name, lots: r.grp ? r.lots : 1, created_at: r.created_at });
  }
  const se = await smsEnv(env);
  return { tenders: out, now: n, sms: smsReady(se) };
}

export async function tenderDetail(env, id, ctx) {
  let t = await rowOf(env, int(id));
  if (!t) throw new HttpError("این مناقصه پیدا نشد.", 404);
  t = await finalizeIfDue(env, t, ctx);
  const [inv, bids, jobs, lots, hist] = await Promise.all([invitesOf(env, t.id), bidsOf(env, t.id),
    env.DB.prepare("SELECT id, query, state, result_json, error, at, done_at, params_json, model, cost, searches, fetches, started_at FROM tender_jobs WHERE tender_id=? ORDER BY id DESC LIMIT 3").bind(t.id).all().then((r) => r.results || []),
    lotsOf(env, t), historyOf(env, t)]);
  const n = now(), ranks = ranksOf(bids), names = new Map(inv.map((i) => [i.alias, i.name]));
  const lastBy = new Map(); for (const b of bids) if (b.state !== "void") lastBy.set(b.alias, b);
  const se = await smsEnv(env);
  return {
    tender: { ...pub(t, n), winner_alias: t.winner_alias, best_alias: t.best_alias, range: bidRange(t), created_by: t.created_by, created_at: t.created_at },
    lots: lots.map((l) => ({ id: l.id, code: l.code, title: l.title, lot_no: l.lot_no, state: tenderState(l, n), best_amount: l.best_amount })),
    invites: inv.map((i) => ({ alias: i.alias, label: aliasLabel(i.alias), name: i.name, phone: i.phone, source: i.source, info: parse(i.info, null), on: !!i.on_list,
      sms_at: i.sms_at, sms_state: i.sms_state, sms_err: i.sms_err, seen_at: i.seen_at, locked: !!(i.lock_until && i.lock_until > n),
      proxy_min: i.proxy_min, accepted_at: i.accepted_at, notify_off: !!i.notify_off, outbid_n: i.outbid_n || 0,
      rank: ranks.get(i.alias) ? ranks.get(i.alias).rank : null, best: ranks.get(i.alias) ? ranks.get(i.alias).amount : null, last_at: lastBy.get(i.alias) ? lastBy.get(i.alias).at : null })),
    bids: bids.map((b) => ({ id: b.id, alias: b.alias, name: names.get(b.alias) || aliasLabel(b.alias), amount: b.amount, at: b.at, state: b.state, orig_amount: b.orig_amount,
      fix_reason: b.fix_reason, fix_at: b.fix_at, ext: !!b.ext, auto: !!b.auto, sealed: !!b.sealed })),
    series: seriesOf(bids), hist,
    jobs: jobs.map((j) => ({ ...j, result: parse(j.result_json, null), params: parse(j.params_json, null), result_json: undefined, params_json: undefined })),
    now: n, sms: smsReady(se), link: tenderLink(env, t.code),
  };
}

/** شمارهٔ تمیز یا null؛ ورودیِ نادرست خطا */
function phoneOf(raw, name) {
  if (!T(raw)) return null;
  const p = normPhone(raw);
  if (!p) throw new HttpError(`شمارهٔ «${name || ""}» درست نیست (مثل ۰۹۱۲۱۲۳۴۵۶۷).`);
  return p;
}
/** شمارهٔ تازه برای دفعه‌های بعد در دفترچهٔ شماره‌های تأمین‌کنندگان هم می‌ماند (اگر با تأمین‌کنندهٔ دیگری تداخل نداشته باشد) */
async function keepPhone(env, name, phone) {
  if (!phone || !/^09\d{9}$/.test(phone)) return false;
  try { await savePhone(env, "support", { supplier_name: name, phone, label: "مناقصه" }); return true; } catch (_) { return false; }
}
/** شمارهٔ ناشناسِ تصادفی برای n نفرِ تازه، بعد از بزرگ‌ترینِ موجود (تا ترتیبِ فهرست از روی شماره خوانده نشود) */
function aliasesFor(n, from) {
  const a = Array.from({ length: n }, (_, i) => from + i + 1);
  for (let i = a.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function lotOf(x, i) {
  const title = T(x.title || x.item_title).slice(0, 200);
  if (!title) throw new HttpError(`عنوانِ قلمِ ${faN(i + 1)} لازم است.`);
  const qty = Number(latin(x.qty));
  if (!(qty > 0)) throw new HttpError(`مقدارِ «${title}» را بنویسید.`);
  const unit = T(x.unit).slice(0, 30);
  if (!unit) throw new HttpError(`واحدِ «${title}» را بنویسید.`);
  const start = amountOf(x.start_price);
  if (!(start > 0)) throw new HttpError(`قیمتِ شروعِ «${title}» (سقفِ قیمتِ واحد، ریال) لازم است.`);
  return { title, qty, unit, start, item_code: T(x.item_code).slice(0, 40) || null, item_title: T(x.item_title).slice(0, 200) || null, spec: T(x.spec).slice(0, 2000) || null };
}

/** POST /support/tenders — مناقصهٔ تازه (پیش‌نویس) با فهرستِ دعوت؛ lots: چند قلم در یک گروه */
export async function tenderCreate(env, b) {
  const lots = (Array.isArray(b.lots) && b.lots.length ? b.lots : [b]).slice(0, 30).map(lotOf);
  const s = cleanRules(b, await defaultsOf(env));
  const terms = T(b.terms).slice(0, 2000) || T((await setting(env, "tenderTerms")) || "") || null;
  const list = (Array.isArray(b.invites) ? b.invites : []).map((x) => ({ name: T(x.name).slice(0, 120), phone: phoneOf(x.phone, x.name), source: T(x.source).slice(0, 20) || "manual",
    supplier_id: int(x.supplier_id), info: x.info ? JSON.stringify(x.info).slice(0, 600) : null, on: x.on === false ? 0 : 1 })).filter((x) => x.name);
  const seen = new Set(); const invites = list.filter((x) => { const k = nkey(x.name); if (seen.has(k)) return false; seen.add(k); return true; });
  const grp = lots.length > 1 ? randHex(4) : null, t = now();
  const al = aliasesFor(invites.length, 0);
  const ids = [];
  for (let i = 0; i < lots.length; i++) {
    const L = lots[i];
    const r = await env.DB.prepare(`INSERT INTO tenders (code,grp,lot_no,title,item_code,item_title,spec,terms,qty,unit,start_price,${RULES.join(",")},state,created_by,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,${RULES.map(() => "?").join(",")},'draft','support',?,?)`)
      .bind(randHex(5), grp, grp ? i + 1 : null, L.title, L.item_code, L.item_title, L.spec, terms, L.qty, L.unit, L.start, ...RULES.map((k) => s[k]), t, t).run();
    const id = r.meta.last_row_id;
    ids.push(id);
    const stmts = invites.map((x, j) => env.DB.prepare("INSERT INTO tender_invites (tender_id,alias,name,phone,supplier_id,source,info,on_list) VALUES (?,?,?,?,?,?,?,?)")
      .bind(id, al[j], x.name, x.phone, x.supplier_id, x.source, x.info, x.on));
    stmts.push(env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)").bind(t, "support", "tender_new", null, JSON.stringify({ tender_id: id, title: L.title, grp, invites: invites.length })));
    await env.DB.batch(stmts);
  }
  for (const x of invites) if (x.phone && x.source === "manual") await keepPhone(env, x.name, x.phone);
  return tenderDetail(env, ids[0]);
}

/** PUT /support/tenders/:id — قواعد و مشخصات؛ بعد از اولین پیشنهاد قیمتِ شروع و مقدار ثابت‌اند. قواعدِ گروه برای همهٔ قلم‌ها */
export async function tenderUpdate(env, id, b) {
  const t = await rowOf(env, int(id));
  if (!t) throw new HttpError("این مناقصه پیدا نشد.", 404);
  const st = tenderState(t, now());
  if (st === "ended" || st === "cancelled") throw new HttpError("این مناقصه بسته است.");
  const hasBids = t.best_amount != null;
  const s = cleanRules(b, t);
  const set = { updated_at: now() };
  for (const k of RULES) if (b[k] !== undefined) set[k] = s[k];
  if (set.sealed_s !== undefined && t.state !== "draft") delete set.sealed_s;
  for (const k of ["title", "spec", "terms", "unit"]) if (b[k] !== undefined) set[k] = T(b[k]).slice(0, k === "spec" || k === "terms" ? 2000 : 200) || (k === "title" || k === "unit" ? t[k] : null);
  if (b.qty !== undefined) { const q = Number(latin(b.qty)); if (!(q > 0)) throw new HttpError("مقدار درست نیست."); if (hasBids && q !== t.qty) throw new HttpError("بعد از اولین پیشنهاد مقدار عوض نمی‌شود."); set.qty = q; }
  if (b.start_price !== undefined) { const p = amountOf(b.start_price); if (!(p > 0)) throw new HttpError("قیمتِ شروع درست نیست."); if (hasBids && p !== t.start_price) throw new HttpError("بعد از اولین پیشنهاد قیمتِ شروع عوض نمی‌شود."); set.start_price = p; }
  /* پایانِ تازه (دقیقه از حالا) — فقط وقتی در جریان یا زمان‌بندی‌شده است */
  if (b.end_in_min !== undefined && t.state === "scheduled") { const m = num(b.end_in_min, null, 1, 7 * 1440); if (m) set.end_at = Math.max(t.sealed_end_at || t.start_at || 0, now()) + m * 60e3; }
  const keys = Object.keys(set);
  const groupKeys = keys.filter((k) => GROUP_RULES.includes(k) || k === "terms");
  const stmts = [env.DB.prepare(`UPDATE tenders SET ${keys.map((k) => `${k}=?`).join(",")}, rev=rev+1 WHERE id=?`).bind(...keys.map((k) => set[k]), t.id)];
  if (t.grp && groupKeys.length) stmts.push(env.DB.prepare(`UPDATE tenders SET ${groupKeys.map((k) => `${k}=?`).join(",")}, rev=rev+1 WHERE grp=? AND id<>? AND state IN ('draft','scheduled')`)
    .bind(...groupKeys.map((k) => set[k]), t.grp, t.id));
  stmts.push(env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)").bind(now(), "support", "tender_edit", null, JSON.stringify({ tender_id: t.id, keys })));
  await env.DB.batch(stmts);
  return tenderDetail(env, t.id);
}

/** POST /support/tenders/:id/schedule — {start_in_min (۰ = همین حالا), duration_min, sealed_min}؛ گروه: همهٔ قلم‌های پیش‌نویس */
export async function tenderSchedule(env, id, b) {
  const t = await rowOf(env, int(id));
  if (!t) throw new HttpError("این مناقصه پیدا نشد.", 404);
  if (!["draft", "scheduled"].includes(t.state) || (t.state === "scheduled" && t.start_at <= now())) throw new HttpError("این مناقصه شروع شده یا بسته است.");
  const on = (await env.DB.prepare("SELECT COUNT(*) AS n FROM tender_invites WHERE tender_id=? AND on_list=1").bind(t.id).first()).n;
  if (!on) throw new HttpError("دست‌کم یک تأمین‌کننده را در فهرستِ دعوت تیک بزنید.");
  const startIn = num(b.start_in_min, 0, 0, 30 * 1440), dur = num(b.duration_min, t.duration_s / 60, 1, 7 * 1440), sealed = num(b.sealed_min, (t.sealed_s || 0) / 60, 0, 7 * 1440);
  const start = now() + Math.round(startIn * 60e3), sealedEnd = sealed ? start + Math.round(sealed * 60e3) : null, end = (sealedEnd || start) + Math.round(dur * 60e3);
  const ids = (await lotsOf(env, t)).filter((l) => l.id === t.id || l.state === "draft").map((l) => l.id);
  await env.DB.batch([
    ...ids.map((x) => env.DB.prepare("UPDATE tenders SET state='scheduled', start_at=?, end_at=?, duration_s=?, sealed_s=?, sealed_end_at=?, sealed_done=0, rev=rev+1, updated_at=? WHERE id=?")
      .bind(start, end, Math.round(dur * 60), Math.round(sealed * 60), sealedEnd, now(), x)),
    env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)").bind(now(), "support", "tender_start", null, JSON.stringify({ tender_id: t.id, lots: ids.length, start, end, sealed: sealedEnd })),
  ]);
  return tenderDetail(env, t.id);
}

/** POST /support/tenders/:id/end (پایانِ همین حالا) و /cancel {reason} — {all: همهٔ قلم‌های گروه} */
export async function tenderEnd(env, id, b, ctx) {
  const t = await rowOf(env, int(id));
  if (!t) throw new HttpError("این مناقصه پیدا نشد.", 404);
  const list = (b && b.all ? await lotsOf(env, t) : [t]).filter((l) => ["live", "sealed"].includes(tenderState(l, now())));
  if (!list.length) throw new HttpError("فقط مناقصهٔ در جریان را می‌شود همین حالا بست.");
  for (const l of list) {
    await env.DB.prepare("UPDATE tenders SET end_at=?, sealed_done=1, rev=rev+1 WHERE id=? AND state='scheduled'").bind(now(), l.id).run();
    await finalizeIfDue(env, await rowOf(env, l.id), ctx);
  }
  return tenderDetail(env, t.id);
}
export async function tenderCancel(env, id, b) {
  const t = await rowOf(env, int(id));
  if (!t) throw new HttpError("این مناقصه پیدا نشد.", 404);
  if (["ended", "cancelled"].includes(t.state)) throw new HttpError("این مناقصه از قبل بسته است.");
  const reason = T(b && b.reason).slice(0, 300);
  if (!reason) throw new HttpError("علتِ لغو را بنویسید.");
  const list = (b && b.all ? await lotsOf(env, t) : [t]).filter((l) => !["ended", "cancelled"].includes(l.state));
  await env.DB.batch([
    ...list.map((l) => env.DB.prepare("UPDATE tenders SET state='cancelled', cancel_reason=?, ended_at=?, rev=rev+1, updated_at=? WHERE id=?").bind(reason, now(), now(), l.id)),
    env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)").bind(now(), "support", "tender_cancel", null, JSON.stringify({ tender_id: t.id, lots: list.length, reason })),
  ]);
  return tenderDetail(env, t.id);
}

/** POST /support/tenders/:id/invites — نفرِ تازه {name, phone, source, info}؛ در گروه برای همهٔ قلم‌ها با همان شمارهٔ ناشناس */
export async function tenderInviteAdd(env, id, b) {
  const t = await rowOf(env, int(id));
  if (!t) throw new HttpError("این مناقصه پیدا نشد.", 404);
  if (["ended", "cancelled"].includes(tenderState(t, now()))) throw new HttpError("این مناقصه بسته است.");
  const name = T(b.name).slice(0, 120);
  if (!name) throw new HttpError("نام تأمین‌کننده لازم است.");
  const phone = phoneOf(b.phone, name);
  const inv = await invitesOf(env, t.id);
  if (inv.some((x) => nkey(x.name) === nkey(name))) throw new HttpError(`«${name}» از قبل در فهرست است.`);
  if (phone && inv.some((x) => x.phone === phone)) throw new HttpError("این شماره از قبل در فهرست است.");
  const lots = (await lotsOf(env, t)).filter((l) => !["ended", "cancelled"].includes(l.state));
  let top = 0;
  for (const l of lots) top = Math.max(top, ((await env.DB.prepare("SELECT MAX(alias) AS m FROM tender_invites WHERE tender_id=?").bind(l.id).first()) || {}).m || 0);
  const alias = top + 1 + Math.floor(Math.random() * 3);
  await env.DB.batch(lots.map((l) => env.DB.prepare("INSERT OR IGNORE INTO tender_invites (tender_id,alias,name,phone,supplier_id,source,info,on_list) VALUES (?,?,?,?,?,?,?,1)")
    .bind(l.id, alias, name, phone, int(b.supplier_id), T(b.source).slice(0, 20) || "manual", b.info ? JSON.stringify(b.info).slice(0, 600) : null)));
  if (phone) await keepPhone(env, name, phone);
  return tenderDetail(env, t.id);
}
/** PUT /support/tenders/:id/invites/:alias — {on, phone}؛ در گروه برای همهٔ قلم‌ها */
export async function tenderInviteSet(env, id, alias, b) {
  const t = await rowOf(env, int(id));
  if (!t) throw new HttpError("این مناقصه پیدا نشد.", 404);
  const inv = await env.DB.prepare("SELECT * FROM tender_invites WHERE tender_id=? AND alias=?").bind(t.id, int(alias)).first();
  if (!inv) throw new HttpError("این نفر در فهرست نیست.", 404);
  const set = {};
  if (b.on !== undefined) set.on_list = b.on ? 1 : 0;
  if (b.phone !== undefined) {
    const p = phoneOf(b.phone, inv.name);
    if (p && p !== inv.phone && (await env.DB.prepare("SELECT 1 AS x FROM tender_invites WHERE tender_id=? AND phone=? AND alias<>?").bind(t.id, p, inv.alias).first())) throw new HttpError("این شماره برای نفرِ دیگری در همین فهرست است.");
    set.phone = p; set.sms_state = null; set.sms_err = null;
  }
  if (!Object.keys(set).length) return tenderDetail(env, t.id);
  const lots = await lotsOf(env, t);
  await env.DB.batch(lots.map((l) => env.DB.prepare(`UPDATE tender_invites SET ${Object.keys(set).map((k) => `${k}=?`).join(",")} WHERE tender_id=? AND alias=?`).bind(...Object.values(set), l.id, inv.alias)));
  if (set.phone) await keepPhone(env, inv.name, set.phone);
  if (set.on_list === 0) await env.DB.batch(lots.map((l) => env.DB.prepare("DELETE FROM tender_sessions WHERE tender_id=? AND alias=?").bind(l.id, inv.alias)));
  return tenderDetail(env, t.id);
}

/** متنِ پیامکِ دعوت — فقط لینک و زمان؛ نه نوعِ کالا و نه مقدار (درخواست مالک) */
export function inviteText(env, t) {
  const when = t.start_at && t.start_at > now() ? `\nشروع: ${faTime(t.start_at)}` : t.start_at ? "\nهم‌اکنون در جریان است." : "";
  return `${COMPANY(env)}\nشما به یک مناقصهٔ خرید دعوت شده‌اید.${when}\nورود با شمارهٔ همین گوشی:\n${tenderLink(env, t.code)}`;
}
function faTime(ms) {
  try { return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "Asia/Tehran", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ms)); }
  catch (_) { return new Date(ms).toISOString(); }
}
/** POST /support/tenders/:id/invite — پیامکِ دعوت (و تلگرامِ بات) به تیک‌خورده‌های شماره‌دار؛ گروه: یک دعوت برای همهٔ قلم‌ها */
export async function tenderInviteSend(env, id, b) {
  const t = await rowOf(env, int(id));
  if (!t) throw new HttpError("این مناقصه پیدا نشد.", 404);
  if (["ended", "cancelled"].includes(tenderState(t, now()))) throw new HttpError("این مناقصه بسته است.");
  const lots = await lotsOf(env, t);
  const head = lots[0];
  const only = Array.isArray(b && b.aliases) ? new Set(b.aliases.map(int)) : null;
  const list = (await invitesOf(env, t.id)).filter((i) => i.on_list && (!only || only.has(i.alias)) && ((b && b.again) || only || i.sms_state !== "sent"));
  const text = inviteText(env, head);
  const out = { sent: 0, off: 0, error: 0, nophone: 0, tg: 0 };
  for (const i of list) {
    let st = "nophone", err = null;
    if (i.phone) {
      const r = await sms(env, i.phone, text);
      st = r.state; err = r.error || null;
      out.tg += await tgSupplier(env, i.phone, `${COMPANY(env)}\nشما به یک مناقصهٔ خرید دعوت شده‌اید.`, tenderLink(env, head.code));
    }
    out[st === "sent" ? "sent" : st === "off" ? "off" : st === "nophone" ? "nophone" : "error"]++;
    await env.DB.batch(lots.map((l) => env.DB.prepare("UPDATE tender_invites SET sms_at=?, sms_state=?, sms_err=? WHERE tender_id=? AND alias=?").bind(now(), st, err, l.id, i.alias)));
  }
  await env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)").bind(now(), "support", "tender_invite", null, JSON.stringify({ tender_id: t.id, ...out })).run();
  return { ...(await tenderDetail(env, t.id)), result: out, text };
}

/**
 * POST /support/tenders/:id/invites/:alias/pass — رمزِ تلفنی: وقتی پیامک نمی‌رسد یا درگاه وصل نیست، پشتیبان رمزی می‌سازد و
 * تلفنی به همان تأمین‌کننده می‌گوید (فقط همین یک بار نشان داده می‌شود؛ خامش جایی نمی‌ماند). در گروه برای همهٔ قلم‌ها.
 */
export async function tenderPhonePass(env, id, alias) {
  const t = await rowOf(env, int(id));
  const inv = t ? await env.DB.prepare("SELECT * FROM tender_invites WHERE tender_id=? AND alias=?").bind(t.id, int(alias)).first() : null;
  if (!inv) throw new HttpError("این نفر در فهرست نیست.", 404);
  if (!inv.phone) throw new HttpError("اول شمارهٔ همراهِ او را ثبت کنید؛ ورود با همان شماره است.");
  const pass = rand6(), h = await passHash(pass);
  const lots = await lotsOf(env, t);
  await env.DB.batch([...lots.map((l) => env.DB.prepare("UPDATE tender_invites SET pass_hash=?, pass_exp=?, fails=0, lock_until=NULL WHERE tender_id=? AND alias=?").bind(h, now() + PASS_TTL, l.id, inv.alias)),
    env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)").bind(now(), "support", "tender_pass", null, JSON.stringify({ tender_id: inv.tender_id, alias: inv.alias, name: inv.name }))]);
  return { pass, phone: inv.phone, name: inv.name, valid_h: PASS_TTL / 3600e3 };
}

/** پیشنهادِ اشتباه: اصلاحِ مبلغ یا باطل کردن، با علت — بهترین دوباره حساب می‌شود */
export async function tenderBidFix(env, id, bidId, b) {
  const t = await rowOf(env, int(id));
  if (!t) throw new HttpError("این مناقصه پیدا نشد.", 404);
  if (t.state === "cancelled") throw new HttpError("این مناقصه لغو شده است.");
  const bid = await env.DB.prepare("SELECT * FROM tender_bids WHERE id=? AND tender_id=?").bind(int(bidId), t.id).first();
  if (!bid) throw new HttpError("این پیشنهاد پیدا نشد.", 404);
  const reason = T(b.reason).slice(0, 300);
  if (!reason) throw new HttpError("علتِ اصلاح را بنویسید (در رخدادها می‌ماند و تأمین‌کننده هم می‌بیند).");
  let st = bid.state, amount = bid.amount;
  if (b.void) st = "void";
  else {
    amount = amountOf(b.amount);
    if (!(amount > 0)) throw new HttpError("مبلغِ درست را به ریال بنویسید.");
    if (amount > t.start_price) throw new HttpError("مبلغ از قیمتِ شروع بیشتر است.");
    st = "fixed";
  }
  await env.DB.prepare("UPDATE tender_bids SET state=?, amount=?, orig_amount=COALESCE(orig_amount, ?), fix_by='support', fix_reason=?, fix_at=? WHERE id=?")
    .bind(st, amount, bid.amount, reason, now(), bid.id).run();
  const best = bestOf(await bidsOf(env, t.id));
  await env.DB.batch([
    env.DB.prepare(`UPDATE tenders SET best_amount=?, best_alias=?, best_bid_id=?, ${t.state === "ended" ? "winner_alias=?," : ""} rev=rev+1, updated_at=? WHERE id=?`)
      .bind(...[best ? best.amount : null, best ? best.alias : null, best ? best.id : null, ...(t.state === "ended" ? [best ? best.alias : null] : []), now(), t.id]),
    env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)").bind(now(), "support", "tender_fix", null,
      JSON.stringify({ tender_id: t.id, bid_id: bid.id, alias: bid.alias, from: bid.amount, to: st === "void" ? null : amount, void: st === "void", reason })),
  ]);
  return tenderDetail(env, t.id);
}

/* --- جستجوی قلم و تأمین‌کنندگانِ سوابق --- */
const words = (q) => latin(q).replace(/[ي]/g, "ی").replace(/[ك]/g, "ک").split(/\s+/).map((w) => w.trim()).filter((w) => w.length >= 1).slice(0, 5);
/** GET /support/tender-items?q= — اقلامِ سوابقِ خرید (عنوان یا کد) با شمارِ خرید و تأمین‌کننده */
export async function tenderItems(env, q) {
  const ws = words(q);
  if (!ws.length || ws.join("").length < 2) return { items: [] };
  const cond = ws.map(() => "(title LIKE ? OR item_code LIKE ?)").join(" AND ");
  const args = ws.flatMap((w) => [`%${w}%`, `${w}%`]);
  const rows = (await env.DB.prepare(`SELECT item_code, MAX(title) AS title, MAX(unit) AS unit, MAX(head) AS head, COUNT(*) AS n, COUNT(DISTINCT supplier_n) AS sups, MAX(order_date) AS last
      FROM purchases WHERE ${cond} GROUP BY item_code ORDER BY n DESC LIMIT 30`).bind(...args).all().catch(() => ({ results: [] }))).results || [];
  return { items: rows };
}
/** GET /support/tender-suppliers?code= — تأمین‌کنندگانِ همین قلم در سوابق، با رده و شماره‌های شناخته‌شده */
export async function tenderSuppliers(env, code) {
  const c = T(code);
  if (!c) return { suppliers: [] };
  const rows = (await env.DB.prepare(`SELECT MAX(supplier) AS name, supplier_n AS sn, COUNT(*) AS n, SUM(qty) AS qty, MAX(order_date) AS last, MAX(unit) AS unit
      FROM purchases WHERE item_code=? AND supplier_n IS NOT NULL AND supplier_n<>'' GROUP BY supplier_n ORDER BY n DESC, last DESC LIMIT 60`).bind(c).all()).results || [];
  return { suppliers: await withPhones(env, rows.map((r) => ({ name: r.name, n: r.n, qty: r.qty, last: r.last, unit: r.unit, sn: r.sn, code: c }))) };
}
/** رده و شماره‌های هر نام: دفترچهٔ شماره‌های پنل (sp_phones) و دفترچهٔ تأمین‌کنندگان (suppliers) */
async function withPhones(env, list) {
  if (!list.length) return list;
  const names = list.map((x) => x.name);
  const q = names.map(() => "?").join(",");
  const [sp, book, grades] = await Promise.all([
    env.DB.prepare(`SELECT s.id AS supplier_id, s.name, p.phone, p.label, p.panel FROM sp_suppliers s JOIN sp_phones p ON p.supplier_id=s.id WHERE s.demo=0 AND s.name_n IN (${q}) ORDER BY p.panel DESC, p.id`)
      .bind(...names.map((n) => nkey(n))).all().then((r) => r.results || []).catch(() => []),
    env.DB.prepare(`SELECT name, phone, tel2, city FROM suppliers WHERE name IN (${q})`).bind(...names).all().then((r) => r.results || []).catch(() => []),
    env.DB.prepare(`SELECT sn, grade FROM supplier_grades WHERE sn IN (${q})`).bind(...list.map((x) => x.sn || keyOf(x.name))).all().then((r) => r.results || []).catch(() => []),
  ]);
  return list.map((x) => {
    const mine = sp.filter((p) => nkey(p.name) === nkey(x.name));
    const bk = book.find((b) => keyOf(b.name) === keyOf(x.name));
    const phones = [...mine.map((p) => ({ phone: p.phone, label: p.label, panel: !!p.panel })),
      ...(bk ? [bk.phone, bk.tel2].map((p) => normPhone(p)).filter((p) => p && /^09/.test(p) && !mine.some((m) => m.phone === p)).map((p) => ({ phone: p, label: "دفترچه" })) : [])];
    const g = grades.find((r) => r.sn === (x.sn || keyOf(x.name)));
    return { ...x, grade: g ? g.grade : null, city: bk ? bk.city : null, supplier_id: mine[0] ? mine[0].supplier_id : null, phones, phone: phones.length ? phones[0].phone : null };
  });
}
/** GET /support/tender-book?q= — جستجوی نام در دفترچه‌ها و سوابق، برای افزودنِ تأمین‌کنندهٔ دیگر */
export async function tenderBook(env, q) {
  const ws = words(q);
  if (!ws.length || ws.join("").length < 2) return { suppliers: [] };
  const like = (col) => ws.map(() => `${col} LIKE ?`).join(" AND ");
  const args = ws.map((w) => `%${w}%`);
  const [a, b, c] = await Promise.all([
    env.DB.prepare(`SELECT name FROM sp_suppliers WHERE demo=0 AND ${like("name")} LIMIT 20`).bind(...args).all().then((r) => r.results || []).catch(() => []),
    env.DB.prepare(`SELECT name FROM suppliers WHERE ${like("name")} LIMIT 20`).bind(...args).all().then((r) => r.results || []).catch(() => []),
    env.DB.prepare(`SELECT MAX(supplier) AS name, supplier_n AS sn, COUNT(*) AS n, MAX(order_date) AS last FROM purchases WHERE ${like("supplier")} GROUP BY supplier_n ORDER BY n DESC LIMIT 20`).bind(...args).all().then((r) => r.results || []).catch(() => []),
  ]);
  const by = new Map();
  for (const r of [...c, ...a, ...b]) { const k = nkey(r.name); if (r.name && !by.has(k)) by.set(k, { name: r.name, sn: r.sn || keyOf(r.name), n: r.n || 0, last: r.last || null }); }
  return { suppliers: await withPhones(env, [...by.values()].slice(0, 30)) };
}

/* --- ثبتِ نتیجه در درخواست: پیشنهادِ هر شرکت‌کننده یک خطِ استعلامِ ثبت‌شده؛ برنده «تأیید نهایی» --- */
/** GET /support/tender-req-items?rid= — اقلامِ بازِ ارجاع‌های ارسال‌شدهٔ یک درخواست */
export async function tenderReqItems(env, rid) {
  const r = T(rid);
  if (!r) return { items: [] };
  const rows = (await env.DB.prepare(`SELECT i.id, i.title, i.qty, i.unit, i.line_no, i.assignment_id AS aid, a.expert_id, e.label AS expert_label, e.name AS expert_name, q.party
      FROM items i JOIN assignments a ON a.id=i.assignment_id LEFT JOIN experts e ON e.id=a.expert_id LEFT JOIN requests q ON q.id=i.request_id
      WHERE i.request_id=? AND i.state='open' AND a.dispatched_at IS NOT NULL ORDER BY i.line_no`).bind(r).all().catch(() => ({ results: [] }))).results || [];
  return { items: rows.map((x) => ({ ...x, expert: x.expert_label || x.expert_name })) };
}
/** POST /support/tenders/:id/link {item_id} — خط‌های استعلام از پیشنهادها؛ دوباره زدن جای قبلی را می‌گیرد */
export async function tenderToRequest(env, id, b) {
  const t = await rowOf(env, int(id));
  if (!t) throw new HttpError("این مناقصه پیدا نشد.", 404);
  if (t.state !== "ended") throw new HttpError("بعد از پایانِ مناقصه.");
  const it = await env.DB.prepare("SELECT i.id, i.assignment_id, i.request_id, i.state, a.dispatched_at FROM items i JOIN assignments a ON a.id=i.assignment_id WHERE i.id=?").bind(int(b && b.item_id)).first();
  if (!it || it.state !== "open" || !it.dispatched_at) throw new HttpError("قلمِ بازِ یک ارجاعِ ارسال‌شده را انتخاب کنید.");
  const [bids, inv] = await Promise.all([bidsOf(env, t.id), invitesOf(env, t.id)]);
  const ranks = ranksOf(bids);
  if (!ranks.size) throw new HttpError("این مناقصه پیشنهادی ندارد.");
  const n = now(), names = new Map(inv.map((i) => [i.alias, i.name]));
  const stmts = [env.DB.prepare("DELETE FROM quotes WHERE origin='tender' AND origin_ref=? AND item_id=?").bind(t.id, it.id)];
  for (const [alias, r] of ranks) {
    const win = alias === t.winner_alias;
    stmts.push(env.DB.prepare(`INSERT INTO quotes (assignment_id,item_id,supplier_name,unit,qty,price,deal,saved,final,final_at,source,origin,origin_ref,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,1,?,?,'tender','tender',?,?,?)`).bind(it.assignment_id, it.id, names.get(alias) || aliasLabel(alias), t.unit, t.qty, r.amount,
      `مناقصهٔ ${t.code} — رتبهٔ ${r.rank}`, win ? 1 : 0, win ? n : null, t.id, n, n));
  }
  stmts.push(env.DB.prepare("UPDATE tenders SET req_aid=?, req_item=?, req_at=?, rev=rev+1 WHERE id=?").bind(it.assignment_id, it.id, n, t.id));
  stmts.push(env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)").bind(n, "support", "tender_link", it.request_id,
    JSON.stringify({ tender_id: t.id, item_id: it.id, assignment_id: it.assignment_id, lines: ranks.size })));
  await env.DB.batch(stmts);
  return { ...(await tenderDetail(env, t.id)), linked: { aid: it.assignment_id, item_id: it.id, request_id: it.request_id, lines: ranks.size } };
}

/* --- گزارش: CSV برای اکسل (با BOM تا فارسی درست باز شود) --- */
export async function tenderCsv(env, id) {
  const d = await tenderDetail(env, id);
  const t = d.tender, q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const fmt = (ms) => (ms ? new Date(ms).toLocaleString("fa-IR-u-ca-persian", { timeZone: "Asia/Tehran", hour12: false }) : "");
  const rows = [["مناقصه", t.title], ["مقدار", `${t.qty} ${t.unit}`], ["قیمت شروع (ریال)", t.start_price], ["کمترین قیمت (ریال)", t.best_amount ?? ""],
    ["شروع", fmt(t.start_at)], ["پایان", fmt(t.ended_at || t.end_at)], ["تمدید", t.ext_count], [],
    ["رتبه", "تأمین‌کننده", "شماره", "بهترین پیشنهاد (ریال)", "جمع کل (ریال)", "پیشنهاد خودکار تا", "آخرین پیشنهاد"],
    ...d.invites.filter((i) => i.rank).sort((a, b) => a.rank - b.rank).map((i) => [i.rank, i.name, i.phone || "", i.best, Math.round(i.best * t.qty), i.proxy_min || "", fmt(i.last_at)]), [],
    ["زمان", "تأمین‌کننده", "مبلغ (ریال)", "وضعیت", "خودکار", "تمدید", "علتِ اصلاح"],
    ...d.bids.map((b) => [fmt(b.at), b.name, b.amount, b.state === "void" ? "باطل" : b.state === "fixed" ? `اصلاح از ${b.orig_amount}` : "", b.auto ? "بله" : "", b.ext ? "بله" : "", b.fix_reason || ""])];
  const csv = "﻿" + rows.map((r) => r.map(q).join(",")).join("\r\n");
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="tender-${t.code}.csv"`, "cache-control": "no-store" } });
}

/* --- جستجوی هوشمند در وب — همان موتورِ «جستجوی هوشمند»ِ پنل کارشناس (discovery.js:runDiscovery): همان کلیدِ ANTHROPIC_API_KEY،
   همان مدل (DISCOVERY_MODEL یا پیش‌فرضِ discovery.js)، همان ابزارها، همان ورودی‌ها (بازارها تا سه تا، برند، مشخصات، توضیح، کدِ قلم،
   مقدار و واحد) و همان سقفِ زمانِ کار در صف (۱۶ دقیقه؛ bot.js:runSmartJobs). کار چند دقیقه طول می‌کشد، پس در صف و با Cron. --- */
const JOB_STALE = 16 * 60000;
export async function tenderDiscoverQueue(env, id, b) {
  const t = await rowOf(env, int(id));
  if (!t) throw new HttpError("این مناقصه پیدا نشد.", 404);
  if (!T(env.ANTHROPIC_API_KEY)) throw new HttpError("کلیدِ هوش مصنوعی وصل نیست؛ جستجوی هوشمند ممکن نیست.");
  const busy = await env.DB.prepare("SELECT id FROM tender_jobs WHERE tender_id=? AND state IN ('pending','running') AND COALESCE(started_at, at)>?").bind(t.id, now() - JOB_STALE).first();
  if (busy) throw new HttpError("یک جستجوی هوشمند برای همین مناقصه در جریان است.");
  const markets = [...new Set((Array.isArray(b && b.markets) ? b.markets : []).filter((k) => MARKETS.some((m) => m.key === k)))];
  if (markets.length > MAX_MARKETS) throw new HttpError("هر جستجو حداکثر سه بازار دارد؛ بازارهای کمتری تیک بزنید.", 422);
  const query = T(b && b.query).slice(0, 200) || t.title;
  const params = { markets: markets.length ? markets : ["IR"], brand: T(b && b.brand).slice(0, 120) || null, specs: T(b && b.specs).slice(0, 1000) || null,
    notes: T(b && b.notes).slice(0, 1000) || null };
  await env.DB.prepare("INSERT INTO tender_jobs (tender_id,query,state,at,params_json) VALUES (?,?,'pending',?,?)").bind(t.id, query, now(), JSON.stringify(params)).run();
  await env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)").bind(now(), "support", "tender_smart", null, JSON.stringify({ tender_id: t.id, query, ...params })).run();
  return tenderDetail(env, t.id);
}
/** ورودیِ مدل — عینِ smartSearch در discovery.js (فقط «قلم» این‌جا خودِ مناقصه است) */
export function discoveryInput(t, j) {
  const p = parse(j.params_json, {}) || {};
  return { item: T(j.query) || (t && t.title), itemCode: (t && t.item_code) || null, code2: null, qty: t ? t.qty : null, unit: t ? t.unit : null,
    markets: Array.isArray(p.markets) && p.markets.length ? p.markets : ["IR"], brand: p.brand || null, specs: p.specs || (t && t.spec) || null,
    notes: p.notes || null, deliveryHint: p.deliveryHint || null };
}
/** Cron: یک جستجوی منتظر؛ کارِ ماندهٔ بیش از سقفِ زمان «تمام نشد» می‌شود تا دوباره بشود زد */
export async function tenderDiscoverTick(env) {
  const n = now();
  await env.DB.prepare("UPDATE tender_jobs SET state='error', error='جستجو در زمانِ مجاز تمام نشد؛ دوباره بزنید (بازارِ کمتری تیک بزنید).', done_at=? WHERE state='running' AND started_at<?")
    .bind(n, n - JOB_STALE).run().catch(() => {});
  const claimed = (await env.DB.prepare("UPDATE tender_jobs SET state='running', started_at=? WHERE id=(SELECT id FROM tender_jobs WHERE state='pending' ORDER BY id LIMIT 1) AND state='pending' RETURNING *")
    .bind(n).all().catch(() => ({ results: [] }))).results || [];
  const j = claimed[0];
  if (!j) return false;
  try {
    const t = await rowOf(env, j.tender_id);
    const out = await runDiscovery(env, discoveryInput(t, j));
    const list = ((out && out.result && out.result.suppliers) || []).map((x) => ({ name: T(x.name).slice(0, 120), type: T(x.type).slice(0, 40) || null, market: T(x.market).slice(0, 40) || null,
      phones: (x.phones || []).map((p) => normPhone(p) || T(p)).filter(Boolean).slice(0, 5), emails: (x.emails || []).slice(0, 3),
      website: T(x.website).slice(0, 200) || null, price: x.price && x.price.text ? T(x.price.text).slice(0, 120) : null })).filter((x) => x.name);
    const u = out.usage || {};
    await env.DB.prepare("UPDATE tender_jobs SET state='done', result_json=?, model=?, cost=?, searches=?, fetches=?, done_at=? WHERE id=?")
      .bind(JSON.stringify({ suppliers: list }), out.model, out.cost, u.searches || 0, u.fetches || 0, now(), j.id).run();
  } catch (e) {
    await env.DB.prepare("UPDATE tender_jobs SET state='error', error=?, done_at=? WHERE id=?").bind(T(e && e.message).slice(0, 300) || "نشد", now(), j.id).run();
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* صفحهٔ تأمین‌کننده                                                     */
/* ------------------------------------------------------------------ */
/** پیش از ورود: فقط نامِ شرکت و زمان — نه نامِ کالا */
export async function tenderPublic(env, code, ctx) {
  let t = await rowOfCode(env, code);
  if (!t || t.state === "draft") throw new HttpError("این لینکِ مناقصه معتبر نیست.", 404);
  t = await finalizeIfDue(env, t, ctx);
  const se = await smsEnv(env);
  return { company: COMPANY(env), state: tenderState(t, now()), start_at: t.start_at, end_at: t.end_at, sealed_end_at: t.sealed_end_at || null, now: now(), sms: smsReady(se) };
}
async function inviteOfPhone(env, t, raw) {
  const p = normPhone(raw);
  if (!p) throw new HttpError("شمارهٔ همراه را درست بنویسید (مثل ۰۹۱۲۱۲۳۴۵۶۷).");
  const inv = await env.DB.prepare("SELECT * FROM tender_invites WHERE tender_id=? AND phone=? AND on_list=1").bind(t.id, p).first();
  if (!inv) throw new HttpError("این شماره به این مناقصه دعوت نشده است. اگر فکر می‌کنید اشتباه است، با تدارکات تماس بگیرید.", 403);
  return inv;
}
/** POST /tender/:code/pass {phone} — رمزِ شش‌رقمیِ ورود به پیامک (دقیقه‌ای یک بار، روزی شش بار؛ در گروه برای همهٔ قلم‌ها) */
export async function tenderSendPass(env, code, b) {
  const t = await rowOfCode(env, code);
  if (!t || t.state === "draft") throw new HttpError("این لینکِ مناقصه معتبر نیست.", 404);
  const inv = await inviteOfPhone(env, t, b && b.phone);
  const n = now(), day = Math.floor((n + 3.5 * 3600e3) / 864e5);
  if (inv.pass_sent_at && n - inv.pass_sent_at < PASS_GAP) throw new HttpError("رمز همین الان فرستاده شد؛ یک دقیقه صبر کنید.", 429);
  if (inv.pass_day === day && inv.pass_n >= PASS_DAY) throw new HttpError("امروز بیش از اندازه رمز خواسته‌اید؛ با تدارکات تماس بگیرید.", 429);
  if (!smsReady(await smsEnv(env))) throw new HttpError("پیامک فعلاً فرستاده نمی‌شود؛ با تدارکات تماس بگیرید تا رمز را تلفنی بدهند.", 503);
  const pass = rand6();
  const r = await sms(env, inv.phone, `رمز ورود به مناقصه: ${pass}\n${COMPANY(env)}`);
  if (r.state !== "sent") throw new HttpError("پیامک فرستاده نشد؛ دوباره بزنید یا با تدارکات تماس بگیرید.", 502);
  const h = await passHash(pass);
  await env.DB.batch((await lotsOf(env, t)).map((l) => env.DB.prepare(`UPDATE tender_invites SET pass_hash=?, pass_exp=?, pass_sent_at=?, pass_day=?, pass_n=CASE WHEN pass_day=? THEN pass_n+1 ELSE 1 END
      WHERE tender_id=? AND alias=?`).bind(h, n + PASS_TTL, n, day, day, l.id, inv.alias)));
  return { sent: true, to: maskPhone(inv.phone) };
}
/** POST /tender/:code/login {phone, pass} — نشستِ کوتاه (۸ ساعت؛ صفحه فقط در همان زبانه نگهش می‌دارد) */
export async function tenderLogin(env, code, b) {
  const t = await rowOfCode(env, code);
  if (!t || t.state === "draft") throw new HttpError("این لینکِ مناقصه معتبر نیست.", 404);
  const inv = await inviteOfPhone(env, t, b && b.phone);
  const n = now();
  if (inv.lock_until && inv.lock_until > n) throw new HttpError(`ورود تا ${Math.ceil((inv.lock_until - n) / 60e3)} دقیقهٔ دیگر بسته است (رمزِ نادرستِ پشت‌سرهم).`, 429);
  const pass = latin(b && b.pass).replace(/\D/g, "");
  const salt = String(inv.pass_hash || "").split(":")[0];
  const ok = !!salt && inv.pass_exp > n && /^\d{6}$/.test(pass) && (await passHash(pass, salt)) === inv.pass_hash;
  if (!ok) {
    const fails = (inv.fails || 0) + 1;
    await env.DB.prepare("UPDATE tender_invites SET fails=?, lock_until=? WHERE tender_id=? AND alias=?").bind(fails >= MAX_FAILS ? 0 : fails, fails >= MAX_FAILS ? n + LOCK_MS : null, t.id, inv.alias).run();
    throw new HttpError(!salt || inv.pass_exp <= n ? "رمزِ تازه بخواهید (رمزِ قبلی تمام شده یا هنوز رمزی نگرفته‌اید)." : fails >= MAX_FAILS ? "رمز پنج بار نادرست بود؛ ورود ۱۵ دقیقه بسته شد." : "رمز درست نیست.", 401);
  }
  const token = randHex(24);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO tender_sessions (h,tender_id,alias,exp,at,phone) VALUES (?,?,?,?,?,?)").bind(await sha256hex(token), t.id, inv.alias, n + SESSION_TTL, n, inv.phone),
    env.DB.prepare("UPDATE tender_invites SET fails=0, lock_until=NULL, seen_at=COALESCE(seen_at, ?) WHERE tender_id=? AND alias=?").bind(n, t.id, inv.alias),
    env.DB.prepare("DELETE FROM tender_sessions WHERE exp<?").bind(n),
  ]);
  return { token, exp: n + SESSION_TTL };
}
/** نشستِ همین مناقصه (یا قلمِ دیگری از همان گروه) از هدرِ X-Tender-Token — {t, inv} */
export async function tenderWho(env, request, code) {
  const tok = T(request.headers.get("X-Tender-Token"));
  const t = await rowOfCode(env, code);
  if (!t || t.state === "draft") throw new HttpError("این لینکِ مناقصه معتبر نیست.", 404);
  const s = tok ? await env.DB.prepare("SELECT * FROM tender_sessions WHERE h=?").bind(await sha256hex(tok)).first() : null;
  if (!s || s.exp < now()) throw new HttpError("دوباره وارد شوید.", 401, { relogin: true });
  let inv = null;
  if (s.tender_id === t.id) inv = await env.DB.prepare("SELECT * FROM tender_invites WHERE tender_id=? AND alias=? AND on_list=1").bind(t.id, s.alias).first();
  else if (t.grp && s.phone) {
    const home = await rowOf(env, s.tender_id);
    if (home && home.grp === t.grp) inv = await env.DB.prepare("SELECT * FROM tender_invites WHERE tender_id=? AND phone=? AND on_list=1").bind(t.id, s.phone).first();
    if (!inv) throw new HttpError("در این قلم دعوت نشده‌اید.", 403);
  } else throw new HttpError("دوباره وارد شوید.", 401, { relogin: true });
  if (!inv) throw new HttpError("دعوتِ شما برداشته شده است.", 403);
  if (!inv.seen_at) await env.DB.prepare("UPDATE tender_invites SET seen_at=? WHERE tender_id=? AND alias=?").bind(now(), t.id, inv.alias).run();
  return { t, inv };
}
/** POST /tender/:code/logout */
export async function tenderLogout(env, request) {
  const tok = T(request.headers.get("X-Tender-Token"));
  if (tok) await env.DB.prepare("DELETE FROM tender_sessions WHERE h=?").bind(await sha256hex(tok)).run();
  return { ok: true };
}

/**
 * نمای تأمین‌کننده: نام‌های دیگران پنهان (مگر پشتیبانی نشان دهد)، خودش «شما». «فقط رتبه» و دورِ سربسته: قیمت و
 * پیشنهادهای دیگران پیدا نیست (فقط رتبهٔ خودش — و در دورِ سربسته حتی رتبه هم نه).
 */
async function supplierView(env, t, inv) {
  const n = now(), st = tenderState(t, n);
  const [bids, inv2, cnt, lots] = await Promise.all([bidsOf(env, t.id), t.show_names ? invitesOf(env, t.id) : Promise.resolve([]),
    env.DB.prepare("SELECT COUNT(*) AS n FROM tender_invites WHERE tender_id=? AND on_list=1").bind(t.id).first(), t.grp ? lotsOf(env, t) : Promise.resolve([])]);
  const names = new Map(inv2.map((i) => [i.alias, i.name]));
  const ranks = ranksOf(bids), me = ranks.get(inv.alias) || null, mine = mineOf(bids, inv.alias);
  const sealed = st === "sealed", prices = t.show_prices !== 0 && !sealed;
  const label = (a) => (a === inv.alias ? "شما" : t.show_names ? names.get(a) || aliasLabel(a) : aliasLabel(a));
  const live = bids.filter((b) => b.state !== "void" && (prices || b.alias === inv.alias));
  const mineFixed = bids.filter((b) => b.alias === inv.alias && b.fix_at).map((b) => ({ id: b.id, state: b.state, amount: b.amount, orig_amount: b.orig_amount, reason: b.fix_reason, at: b.fix_at }));
  /* قلم‌های دیگرِ گروه که همین شماره در آن‌ها دعوت شده */
  let lotList = [];
  if (lots.length > 1) {
    const mineLots = (await env.DB.prepare(`SELECT tender_id FROM tender_invites WHERE phone=? AND on_list=1 AND tender_id IN (${lots.map(() => "?").join(",")})`).bind(inv.phone, ...lots.map((l) => l.id)).all()).results || [];
    const ok = new Set(mineLots.map((r) => r.tender_id));
    lotList = lots.filter((l) => ok.has(l.id)).map((l) => ({ code: l.code, title: l.title, qty: l.qty, unit: l.unit, state: tenderState(l, n), lot_no: l.lot_no, current: l.id === t.id }));
  }
  return {
    tender: { ...pub(t, n), state: st, range: bidRange(t, mine, sealed), req_aid: undefined, req_item: undefined, req_at: undefined,
      winner: t.state === "ended" ? (t.winner_alias === inv.alias ? "you" : t.winner_alias != null ? "other" : null) : null },
    me: { alias: inv.alias, name: inv.name, label: aliasLabel(inv.alias), rank: sealed ? null : me ? me.rank : null, best: mine, lead: !sealed && t.best_alias === inv.alias,
      proxy_min: inv.proxy_min, accepted: !!inv.accepted_at, need_accept: !!t.require_accept && !inv.accepted_at, notify_off: !!inv.notify_off },
    best: !prices || t.best_amount == null ? null : { amount: t.best_amount, mine: t.best_alias === inv.alias, label: label(t.best_alias) },
    bids: live.slice(-60).reverse().map((b) => ({ id: b.id, label: label(b.alias), mine: b.alias === inv.alias, amount: b.amount, at: b.at, fixed: b.state === "fixed", ext: !!b.ext, auto: !!b.auto, sealed: !!b.sealed, av: b.alias })),
    series: seriesOf(bids.filter((b) => prices || b.alias === inv.alias)).map((p) => ({ at: p.at, amount: p.amount, best: p.best, mine: p.alias === inv.alias })),
    bidders: sealed ? null : ranks.size, invited: cnt.n, fixes: mineFixed, lots: lotList, now: n, company: COMPANY(env),
  };
}
/** GET /tender/:code/state?rev= — نظرسنجی؛ اگر چیزی عوض نشده فقط {same, rev, now} */
export async function tenderStateOf(env, request, code, url, ctx) {
  let { t, inv } = await tenderWho(env, request, code);
  t = await finalizeIfDue(env, t, ctx);
  const rev = int(url.searchParams.get("rev"));
  if (rev != null && rev === t.rev) return { same: true, rev: t.rev, now: now(), state: tenderState(t, now()), end_at: t.end_at };
  return supplierView(env, t, inv);
}
/** GET /tender/:code/lots — قلم‌های گروه برای همین شماره */
export async function tenderLots(env, request, code) {
  const { t, inv } = await tenderWho(env, request, code);
  return { lots: (await supplierView(env, t, inv)).lots };
}
/** POST /tender/:code/bid {amount} — اتمی با شرطِ rev؛ پیشنهادهای خودکارِ پاسخ در همان batch؛ تا چهار بار در برخورد */
export async function tenderBid(env, request, code, b, ctx) {
  let { t, inv } = await tenderWho(env, request, code);
  const amount = amountOf(b && b.amount);
  if (t.require_accept && !inv.accepted_at) throw new HttpError("اول شرایطِ مناقصه را بخوانید و بپذیرید.", 409, { code: "accept" });
  for (let i = 0; i < 4; i++) {
    t = await finalizeIfDue(env, t, ctx);
    const n = now();
    const bids = await bidsOf(env, t.id);
    const mine = mineOf(bids, inv.alias);
    const c = checkBid(t, amount, inv.alias, n, mine);
    if (!c.ok) throw new HttpError(c.error, 409, { code: c.code, range: c.range, view: await supplierView(env, t, inv) });
    const sealed = c.phase === "sealed";
    let list = [{ alias: inv.alias, amount, sealed }];
    if (!sealed && t.proxy_on) {
      const P = await proxiesOf(env, t);
      const after = { ...t, best_amount: Math.min(amount, t.best_amount ?? Infinity), best_alias: t.best_amount == null || amount < t.best_amount ? inv.alias : t.best_alias };
      list = list.concat(proxyRun(after, P).map((x) => ({ ...x, auto: true })));
    }
    const before = ranksOf(bids);
    const fresh = await commitBids(env, t, bids, list, n);
    if (fresh) {
      if (!sealed) await notifyDrops(env, fresh, before, ranksOf(await bidsOf(env, t.id)), new Set([inv.alias]), ctx);
      return { ok: true, extended: fresh.ext_count > (t.ext_count || 0), auto: list.length - 1, view: await supplierView(env, fresh, inv) };
    }
    t = await rowOf(env, t.id);
  }
  throw new HttpError("پیشنهادهای هم‌زمانِ زیادی رسید؛ دوباره بزنید.", 409);
}
/** POST /tender/:code/proxy {min | null} — «پیشنهادِ خودکار» تا کفِ همین نفر؛ اگر لازم است همین حالا اجرا می‌شود */
export async function tenderProxy(env, request, code, b, ctx) {
  let { t, inv } = await tenderWho(env, request, code);
  if (!t.proxy_on) throw new HttpError("پیشنهادِ خودکار در این مناقصه بسته است.", 403);
  if (["ended", "cancelled"].includes(tenderState(t, now()))) throw new HttpError("این مناقصه بسته است.");
  if (t.require_accept && !inv.accepted_at) throw new HttpError("اول شرایطِ مناقصه را بخوانید و بپذیرید.", 409, { code: "accept" });
  let min = null;
  if (b && b.min != null && T(b.min) !== "") {
    min = amountOf(b.min);
    const floor = Math.ceil(t.start_price * (1 - t.floor_pct / 100));
    if (!(min > 0)) throw new HttpError("کفِ قیمت را به ریال بنویسید.");
    if (min > t.start_price) throw new HttpError("کف از قیمتِ شروع بیشتر است.");
    if (min < floor) throw new HttpError(`کمتر از ${faN(floor)} ریال (کفِ این مناقصه) پذیرفته نمی‌شود.`);
  }
  await env.DB.prepare("UPDATE tender_invites SET proxy_min=?, proxy_at=? WHERE tender_id=? AND alias=?").bind(min, min ? now() : null, t.id, inv.alias).run();
  await env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)").bind(now(), "supplier", "tender_proxy", null, JSON.stringify({ tender_id: t.id, alias: inv.alias, on: !!min })).run();
  if (min) t = (await runProxies(env, await rowOf(env, t.id), ctx, new Set())) || (await rowOf(env, t.id));
  inv = await env.DB.prepare("SELECT * FROM tender_invites WHERE tender_id=? AND alias=?").bind(t.id, inv.alias).first();
  return { ok: true, view: await supplierView(env, t, inv) };
}
/** POST /tender/:code/accept — «شرایط را خواندم و می‌پذیرم» (در گروه برای همهٔ قلم‌ها) */
export async function tenderAccept(env, request, code) {
  const { t, inv } = await tenderWho(env, request, code);
  await env.DB.batch((await lotsOf(env, t)).map((l) => env.DB.prepare("UPDATE tender_invites SET accepted_at=COALESCE(accepted_at, ?) WHERE tender_id=? AND phone=?").bind(now(), l.id, inv.phone)));
  const fresh = await env.DB.prepare("SELECT * FROM tender_invites WHERE tender_id=? AND alias=?").bind(t.id, inv.alias).first();
  return { ok: true, view: await supplierView(env, await rowOf(env, t.id), fresh) };
}
/** POST /tender/:code/pref {notify} — پیامکِ «عقب افتادید» را خودش خاموش یا روشن می‌کند */
export async function tenderPref(env, request, code, b) {
  const { t, inv } = await tenderWho(env, request, code);
  await env.DB.batch((await lotsOf(env, t)).map((l) => env.DB.prepare("UPDATE tender_invites SET notify_off=? WHERE tender_id=? AND phone=?").bind(b && b.notify === false ? 1 : 0, l.id, inv.phone)));
  const fresh = await env.DB.prepare("SELECT * FROM tender_invites WHERE tender_id=? AND alias=?").bind(t.id, inv.alias).first();
  return { ok: true, view: await supplierView(env, t, fresh) };
}
/** POST /tender/:code/fixreq {note} — «اشتباه زدم»: هشدار به پشتیبان و مدیر */
export async function tenderFixRequest(env, request, code, b, ctx) {
  const { t, inv } = await tenderWho(env, request, code);
  const note = T(b && b.note).slice(0, 400);
  if (!note) throw new HttpError("بنویسید کدام پیشنهاد اشتباه است و مبلغِ درست چیست.");
  const last = await env.DB.prepare("SELECT * FROM tender_bids WHERE tender_id=? AND alias=? AND state<>'void' ORDER BY id DESC LIMIT 1").bind(t.id, inv.alias).first();
  await raiseAlarm(env, { kind: "tender_fix", title: `درخواستِ اصلاحِ پیشنهاد در مناقصهٔ «${t.title}»`,
    body: `${inv.name}${last ? ` (آخرین پیشنهاد ${faN(last.amount)} ریال)` : ""}: ${note}`, payload: { tender_id: t.id, alias: inv.alias, bid_id: last ? last.id : null } }, ctx);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* بازار: دلار، یورو، درهم، تتر، طلا، سکه (tgju؛ ریال)                    */
/* ------------------------------------------------------------------ */
const MKT = [["price_dollar_rl", "دلار آزاد"], ["price_eur", "یورو"], ["price_aed", "درهم امارات"], ["crypto-tether-irr", "تتر"], ["geram18", "طلای ۱۸ عیار (گرم)"], ["sekee", "سکهٔ امامی"], ["ons", "انس جهانی (دلار)"]];
export async function tenderMarket(env) {
  const key = "https://cache.local/tender-market-v1";
  const cache = typeof caches !== "undefined" && caches.default ? caches.default : null;
  if (cache) { const hit = await cache.match(key).catch(() => null); if (hit) return hit.json(); }
  let out;
  try {
    const r = await fetch("https://call1.tgju.org/ajax.json", { headers: { "User-Agent": "Mozilla/5.0 (tender ticker)", Accept: "application/json" }, cf: { cacheTtl: 60 } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json(), c = (j && j.current) || {};
    const val = (s) => Number(String(s == null ? "" : s).replace(/,/g, ""));
    out = { ok: true, at: now(), src: "tgju.org", items: MKT.filter(([k]) => c[k]).map(([k, fa]) => ({ k, fa, p: val(c[k].p), h: val(c[k].h), l: val(c[k].l),
      d: val(c[k].d), dp: Number(c[k].dp) || 0, dt: c[k].dt || "", t: c[k].t || "", usd: k === "ons" })) };
  } catch (e) {
    out = { ok: false, at: now(), error: "قیمتِ لحظه‌ای فعلاً در دسترس نیست." };
  }
  if (cache && out.ok) await cache.put(key, new Response(JSON.stringify(out), { headers: { "content-type": "application/json", "cache-control": "max-age=60" } })).catch(() => {});
  return out;
}

export { numWords };
