/**
 * «مناقصه» — مزایدهٔ معکوسِ زنده برای خریدِ یک قلم (مهر ۱۴۰۵، درخواست مالک).
 *
 * پشتیبانی در پنلِ خودش قلم را جستجو می‌کند، تأمین‌کنندگانِ سوابقِ همان قلم (و هر تأمین‌کنندهٔ تازه) را با تیک انتخاب
 * می‌کند، قیمتِ شروع، مقدار، واحد و قواعد را می‌گذارد و «ارسال دعوت» پیامکی می‌فرستد که فقط لینکِ سایت در آن است
 * (نه نوعِ کالا، نه مقدار). تأمین‌کننده هر بار با شمارهٔ همراه و رمزِ پیامکی وارد صفحهٔ مناقصه می‌شود، قیمتِ واحد را
 * پایین می‌آورد و کمترین قیمت در پایان برنده است. قواعدِ ناب: tender-core.js (گام، کف، پرشِ مجاز، تمدیدِ لحظهٔ آخر).
 *
 *   • نام‌ها پیش‌فرض پنهان‌اند («تأمین‌کنندهٔ ۳»)؛ پشتیبانی می‌تواند نشانشان دهد. شمارهٔ ناشناسِ هر نفر تصادفی است.
 *   • ثبتِ پیشنهاد اتمی است: درج و به‌روزرسانیِ «بهترین» در یک batch با شرطِ rev (دو پیشنهادِ هم‌زمان روی هم نمی‌نشینند).
 *   • پشتیبانی پیشنهادِ اشتباه را اصلاح یا باطل می‌کند (با علت؛ در رخدادها می‌ماند) و بهترین دوباره حساب می‌شود.
 *   • پایان: با اولین خواندن یا Cron (tenderTick)؛ برنده ثبت و به پشتیبان (تلگرام) و برنده (پیامک) خبر داده می‌شود.
 *   • بازار: دلار، یورو، درهم، تتر، طلا و سکه از tgju (هر دقیقه یک بار، با کشِ Cloudflare).
 */
import { HttpError } from "./http.js";
import { normPhone, maskPhone, randHex, rand6, sha256hex, passHash, siteOrigin, COMPANY, nkey, savePhone } from "./sp-core.js";
import { sendSms, smsReady } from "./sms.js";
import { queueStmt } from "./queue.js";
import { keyOf } from "./catalog.js";
import { raiseAlarm } from "./alarms.js";
import { TENDER_DEFAULTS, tenderState, bidRange, checkBid, extendOnBid, bestOf, ranksOf, numWords } from "./tender-core.js";

export const TENDER_DDL = `
CREATE TABLE IF NOT EXISTS tenders (id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, title TEXT NOT NULL, item_code TEXT, item_title TEXT, spec TEXT, terms TEXT, qty REAL NOT NULL, unit TEXT NOT NULL, start_price INTEGER NOT NULL, step_pct REAL NOT NULL DEFAULT 0.5, step_min INTEGER NOT NULL DEFAULT 0, floor_pct REAL NOT NULL DEFAULT 30, jump_pct REAL NOT NULL DEFAULT 10, ext_window_s INTEGER NOT NULL DEFAULT 180, ext_s INTEGER NOT NULL DEFAULT 180, ext_max INTEGER NOT NULL DEFAULT 0, ext_count INTEGER NOT NULL DEFAULT 0, show_names INTEGER NOT NULL DEFAULT 0, duration_s INTEGER NOT NULL DEFAULT 1800, start_at INTEGER, end_at INTEGER, state TEXT NOT NULL DEFAULT 'draft', best_amount INTEGER, best_alias INTEGER, best_bid_id INTEGER, winner_alias INTEGER, ended_at INTEGER, cancel_reason TEXT, rev INTEGER NOT NULL DEFAULT 0, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_tender_state ON tenders(state, end_at);
CREATE TABLE IF NOT EXISTS tender_invites (tender_id INTEGER NOT NULL, alias INTEGER NOT NULL, name TEXT NOT NULL, phone TEXT, supplier_id INTEGER, source TEXT, info TEXT, on_list INTEGER NOT NULL DEFAULT 1, sms_at INTEGER, sms_state TEXT, sms_err TEXT, pass_hash TEXT, pass_exp INTEGER, pass_sent_at INTEGER, pass_day INTEGER, pass_n INTEGER NOT NULL DEFAULT 0, fails INTEGER NOT NULL DEFAULT 0, lock_until INTEGER, seen_at INTEGER, PRIMARY KEY (tender_id, alias)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS tender_bids (id INTEGER PRIMARY KEY, tender_id INTEGER NOT NULL, alias INTEGER NOT NULL, amount INTEGER NOT NULL, at INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'ok', orig_amount INTEGER, fix_by TEXT, fix_reason TEXT, fix_at INTEGER, ext INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS ix_tbid_t ON tender_bids(tender_id, id);
CREATE TABLE IF NOT EXISTS tender_sessions (h TEXT PRIMARY KEY, tender_id INTEGER NOT NULL, alias INTEGER NOT NULL, exp INTEGER NOT NULL, at INTEGER NOT NULL) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS tender_jobs (id INTEGER PRIMARY KEY, tender_id INTEGER NOT NULL, query TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', result_json TEXT, error TEXT, at INTEGER NOT NULL, done_at INTEGER);
`;

const T = (v) => String(v == null ? "" : v).trim();
const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const now = () => Date.now();
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const latin = (s) => String(s == null ? "" : s).replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
const faN = (n) => String(n == null ? "" : n).replace(/\B(?=(\d{3})+(?!\d))/g, "٬").replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[+d]);
const escH = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
export const aliasLabel = (a) => `تأمین‌کنندهٔ ${faN(a)}`;
export const TENDER_PATH = "/tamin-poshtibani/tender.html";
export const tenderLink = (env, code) => `${siteOrigin(env)}${TENDER_PATH}#t=${code}`;

const PASS_TTL = 3 * 3600e3, PASS_GAP = 60e3, PASS_DAY = 6, MAX_FAILS = 5, LOCK_MS = 15 * 60e3, SESSION_TTL = 8 * 3600e3;
const SETTINGS = ["step_pct", "step_min", "floor_pct", "jump_pct", "ext_window_s", "ext_s", "ext_max", "show_names", "duration_s"];

/* ------------------------------------------------------------------ */
/* خواندن و پایان                                                       */
/* ------------------------------------------------------------------ */
async function rowOf(env, id) { return env.DB.prepare("SELECT * FROM tenders WHERE id=?").bind(id).first(); }
async function rowOfCode(env, code) { return /^[0-9a-f]{6,20}$/.test(T(code)) ? env.DB.prepare("SELECT * FROM tenders WHERE code=?").bind(T(code)).first() : null; }
const bidsOf = async (env, id) => (await env.DB.prepare("SELECT * FROM tender_bids WHERE tender_id=? ORDER BY id").bind(id).all()).results || [];
const invitesOf = async (env, id) => (await env.DB.prepare("SELECT * FROM tender_invites WHERE tender_id=? ORDER BY alias").bind(id).all()).results || [];
const setting = async (env, key) => { const r = await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(key).first().catch(() => null); return r ? parse(r.value, r.value) : null; };

async function sms(env, to, text) {
  if (!smsReady(env)) return { state: "off", error: "درگاه پیامک وصل نیست." };
  try { await sendSms(env, to, text); return { state: "sent" }; }
  catch (e) { return { state: "error", error: T(e && e.message).slice(0, 200) || "ارسال نشد" }; }
}

/**
 * مناقصه‌ای که زمانش تمام شده بسته می‌شود (یک بار، با شرطِ state و end_at): برنده ثبت، رخداد، تلگرامِ پشتیبان و پیامکِ برنده.
 * خروجی: ردیفِ تازه (یا همان ردیف اگر کاری نبود)
 */
export async function finalizeIfDue(env, t, ctx) {
  if (!t || t.state !== "scheduled" || !t.end_at || now() < t.end_at) return t;
  const r = await env.DB.prepare("UPDATE tenders SET state='ended', ended_at=end_at, winner_alias=best_alias, rev=rev+1, updated_at=? WHERE id=? AND state='scheduled' AND end_at<=?")
    .bind(now(), t.id, now()).run();
  const fresh = await rowOf(env, t.id);
  if (!r.meta.changes) return fresh;
  const inv = fresh.winner_alias != null ? await env.DB.prepare("SELECT * FROM tender_invites WHERE tender_id=? AND alias=?").bind(t.id, fresh.winner_alias).first() : null;
  const bidders = (await env.DB.prepare("SELECT COUNT(DISTINCT alias) AS n FROM tender_bids WHERE tender_id=? AND state<>'void'").bind(t.id).first()).n;
  const line = inv ? `برنده: ${inv.name} — ${faN(fresh.best_amount)} ریال برای هر ${fresh.unit}` : "هیچ پیشنهادی نرسید.";
  const stmts = [env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)").bind(now(), "system", "tender_end", null,
    JSON.stringify({ tender_id: t.id, title: fresh.title, winner: inv ? inv.name : null, amount: fresh.best_amount, bidders }))];
  const sc = await setting(env, "supportChat");
  if (sc) stmts.push(queueStmt(env, `tender:${t.id}:end`, sc, `🏁 <b>مناقصهٔ «${escH(fresh.title)}» تمام شد</b>\n${escH(line)}\n${faN(bidders)} شرکت‌کننده · ${faN(fresh.ext_count)} بار تمدید`, null));
  await env.DB.batch(stmts);
  if (inv && inv.phone) {
    const job = sms(env, inv.phone, `${COMPANY(env)}\nمناقصه به پایان رسید و پیشنهادِ شما کمترین قیمت بود. همکارانِ تدارکات برای ادامهٔ کار با شما تماس می‌گیرند.\n${tenderLink(env, fresh.code)}`);
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(job); else await job;
  }
  return fresh;
}

/** Cron: مناقصه‌های تمام‌شده و یک جستجوی هوشمندِ منتظر */
export async function tenderTick(env, ctx) {
  const due = (await env.DB.prepare("SELECT * FROM tenders WHERE state='scheduled' AND end_at<=? LIMIT 20").bind(now()).all().catch(() => ({ results: [] }))).results || [];
  for (const t of due) await finalizeIfDue(env, t, ctx);
  return due.length;
}

/* ------------------------------------------------------------------ */
/* نما                                                                 */
/* ------------------------------------------------------------------ */
const pub = (t, n) => ({
  id: t.id, code: t.code, title: t.title, item_code: t.item_code, item_title: t.item_title, spec: t.spec, terms: t.terms, qty: t.qty, unit: t.unit,
  start_price: t.start_price, step_pct: t.step_pct, step_min: t.step_min, floor_pct: t.floor_pct, jump_pct: t.jump_pct, ext_window_s: t.ext_window_s, ext_s: t.ext_s,
  ext_max: t.ext_max, ext_count: t.ext_count, show_names: !!t.show_names, duration_s: t.duration_s, start_at: t.start_at, end_at: t.end_at, ended_at: t.ended_at,
  state: tenderState(t, n), best_amount: t.best_amount, rev: t.rev, cancel_reason: t.cancel_reason,
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

/* ------------------------------------------------------------------ */
/* پنل پشتیبانی                                                         */
/* ------------------------------------------------------------------ */
export async function tenderList(env, ctx) {
  const rows = (await env.DB.prepare(`SELECT t.*, (SELECT COUNT(*) FROM tender_invites i WHERE i.tender_id=t.id AND i.on_list=1) AS invited,
      (SELECT COUNT(DISTINCT b.alias) FROM tender_bids b WHERE b.tender_id=t.id AND b.state<>'void') AS bidders,
      (SELECT COUNT(*) FROM tender_bids b WHERE b.tender_id=t.id AND b.state<>'void') AS bids,
      (SELECT i.name FROM tender_invites i WHERE i.tender_id=t.id AND i.alias=COALESCE(t.winner_alias, t.best_alias)) AS best_name
    FROM tenders t ORDER BY CASE WHEN t.state='scheduled' THEN 0 WHEN t.state='draft' THEN 1 ELSE 2 END, COALESCE(t.end_at, t.created_at) DESC LIMIT 200`).all()).results || [];
  const n = now(), out = [];
  for (const r of rows) {
    const f = r.state === "scheduled" && r.end_at <= n ? { ...r, ...(await finalizeIfDue(env, r, ctx)) } : r;
    out.push({ ...pub(f, n), invited: r.invited, bidders: r.bidders, bids: r.bids, best_name: r.best_name, created_at: r.created_at });
  }
  return { tenders: out, now: n, sms: smsReady(env) };
}

export async function tenderDetail(env, id, ctx) {
  let t = await rowOf(env, int(id));
  if (!t) throw new HttpError("این مناقصه پیدا نشد.", 404);
  t = await finalizeIfDue(env, t, ctx);
  const [inv, bids, jobs] = await Promise.all([invitesOf(env, t.id), bidsOf(env, t.id),
    env.DB.prepare("SELECT id, query, state, result_json, error, at, done_at FROM tender_jobs WHERE tender_id=? ORDER BY id DESC LIMIT 3").bind(t.id).all().then((r) => r.results || [])]);
  const n = now(), ranks = ranksOf(bids), names = new Map(inv.map((i) => [i.alias, i.name]));
  const lastBy = new Map(); for (const b of bids) if (b.state !== "void") lastBy.set(b.alias, b);
  return {
    tender: { ...pub(t, n), winner_alias: t.winner_alias, best_alias: t.best_alias, range: bidRange(t), created_by: t.created_by, created_at: t.created_at },
    invites: inv.map((i) => ({ alias: i.alias, label: aliasLabel(i.alias), name: i.name, phone: i.phone, source: i.source, info: parse(i.info, null), on: !!i.on_list,
      sms_at: i.sms_at, sms_state: i.sms_state, sms_err: i.sms_err, seen_at: i.seen_at, locked: !!(i.lock_until && i.lock_until > n),
      rank: ranks.get(i.alias) ? ranks.get(i.alias).rank : null, best: ranks.get(i.alias) ? ranks.get(i.alias).amount : null, last_at: lastBy.get(i.alias) ? lastBy.get(i.alias).at : null })),
    bids: bids.map((b) => ({ id: b.id, alias: b.alias, name: names.get(b.alias) || aliasLabel(b.alias), amount: b.amount, at: b.at, state: b.state, orig_amount: b.orig_amount,
      fix_reason: b.fix_reason, fix_at: b.fix_at, ext: !!b.ext })),
    series: seriesOf(bids),
    jobs: jobs.map((j) => ({ ...j, result: parse(j.result_json, null), result_json: undefined })),
    now: n, sms: smsReady(env), link: tenderLink(env, t.code),
  };
}

function cleanSettings(b, base) {
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
  o.show_names = b.show_names === undefined ? (s.show_names ? 1 : 0) : (b.show_names ? 1 : 0);
  return o;
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

/** POST /support/tenders — مناقصهٔ تازه (پیش‌نویس) با فهرستِ دعوت */
export async function tenderCreate(env, b) {
  const title = T(b.title || b.item_title).slice(0, 200);
  if (!title) throw new HttpError("عنوانِ مناقصه (نام قلم) لازم است.");
  const qty = Number(latin(b.qty));
  if (!(qty > 0)) throw new HttpError("مقدار را بنویسید.");
  const unit = T(b.unit).slice(0, 30);
  if (!unit) throw new HttpError("واحد را بنویسید.");
  const start = amountOf(b.start_price);
  if (!(start > 0)) throw new HttpError("قیمتِ شروع (سقفِ قیمتِ واحد، ریال) لازم است.");
  const s = cleanSettings(b);
  const list = (Array.isArray(b.invites) ? b.invites : []).map((x) => ({ name: T(x.name).slice(0, 120), phone: phoneOf(x.phone, x.name), source: T(x.source).slice(0, 20) || "manual",
    supplier_id: int(x.supplier_id), info: x.info ? JSON.stringify(x.info).slice(0, 600) : null, on: x.on === false ? 0 : 1 })).filter((x) => x.name);
  const seen = new Set(); const invites = list.filter((x) => { const k = nkey(x.name); if (seen.has(k)) return false; seen.add(k); return true; });
  const code = randHex(5), t = now();
  const r = await env.DB.prepare(`INSERT INTO tenders (code,title,item_code,item_title,spec,terms,qty,unit,start_price,${SETTINGS.join(",")},state,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,${SETTINGS.map(() => "?").join(",")},'draft','support',?,?)`)
    .bind(code, title, T(b.item_code).slice(0, 40) || null, T(b.item_title).slice(0, 200) || null, T(b.spec).slice(0, 2000) || null, T(b.terms).slice(0, 2000) || null,
      qty, unit, start, ...SETTINGS.map((k) => s[k]), t, t).run();
  const id = r.meta.last_row_id;
  const al = aliasesFor(invites.length, 0);
  const stmts = invites.map((x, i) => env.DB.prepare("INSERT INTO tender_invites (tender_id,alias,name,phone,supplier_id,source,info,on_list) VALUES (?,?,?,?,?,?,?,?)")
    .bind(id, al[i], x.name, x.phone, x.supplier_id, x.source, x.info, x.on));
  stmts.push(env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)").bind(t, "support", "tender_new", null, JSON.stringify({ tender_id: id, title, invites: invites.length })));
  await env.DB.batch(stmts);
  for (const x of invites) if (x.phone && x.source === "manual") await keepPhone(env, x.name, x.phone);
  return tenderDetail(env, id);
}

/** PUT /support/tenders/:id — قواعد و مشخصات؛ بعد از اولین پیشنهاد قیمتِ شروع و مقدار ثابت‌اند */
export async function tenderUpdate(env, id, b) {
  const t = await rowOf(env, int(id));
  if (!t) throw new HttpError("این مناقصه پیدا نشد.", 404);
  const st = tenderState(t, now());
  if (st === "ended" || st === "cancelled") throw new HttpError("این مناقصه بسته است.");
  const hasBids = t.best_amount != null;
  const s = cleanSettings(b, t);
  const set = { ...s, updated_at: now() };
  for (const k of ["title", "spec", "terms", "unit"]) if (b[k] !== undefined) set[k] = T(b[k]).slice(0, k === "spec" || k === "terms" ? 2000 : 200) || (k === "title" || k === "unit" ? t[k] : null);
  if (b.qty !== undefined) { const q = Number(latin(b.qty)); if (!(q > 0)) throw new HttpError("مقدار درست نیست."); if (hasBids && q !== t.qty) throw new HttpError("بعد از اولین پیشنهاد مقدار عوض نمی‌شود."); set.qty = q; }
  if (b.start_price !== undefined) { const p = amountOf(b.start_price); if (!(p > 0)) throw new HttpError("قیمتِ شروع درست نیست."); if (hasBids && p !== t.start_price) throw new HttpError("بعد از اولین پیشنهاد قیمتِ شروع عوض نمی‌شود."); set.start_price = p; }
  /* پایانِ تازه (دقیقه از حالا) — فقط وقتی در جریان یا زمان‌بندی‌شده است */
  if (b.end_in_min !== undefined && t.state === "scheduled") { const m = num(b.end_in_min, null, 1, 7 * 1440); if (m) set.end_at = Math.max(t.start_at || 0, now()) + m * 60e3; }
  const keys = Object.keys(set);
  await env.DB.batch([
    env.DB.prepare(`UPDATE tenders SET ${keys.map((k) => `${k}=?`).join(",")}, rev=rev+1 WHERE id=?`).bind(...keys.map((k) => set[k]), t.id),
    env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)").bind(now(), "support", "tender_edit", null, JSON.stringify({ tender_id: t.id, keys })),
  ]);
  return tenderDetail(env, t.id);
}

/** POST /support/tenders/:id/schedule — {start_in_min (۰ = همین حالا), duration_min} */
export async function tenderSchedule(env, id, b) {
  const t = await rowOf(env, int(id));
  if (!t) throw new HttpError("این مناقصه پیدا نشد.", 404);
  if (!["draft", "scheduled"].includes(t.state) || (t.state === "scheduled" && t.start_at <= now())) throw new HttpError("این مناقصه شروع شده یا بسته است.");
  const on = (await env.DB.prepare("SELECT COUNT(*) AS n FROM tender_invites WHERE tender_id=? AND on_list=1").bind(t.id).first()).n;
  if (!on) throw new HttpError("دست‌کم یک تأمین‌کننده را در فهرستِ دعوت تیک بزنید.");
  const startIn = num(b.start_in_min, 0, 0, 30 * 1440), dur = num(b.duration_min, t.duration_s / 60, 1, 7 * 1440);
  const start = now() + Math.round(startIn * 60e3), end = start + Math.round(dur * 60e3);
  await env.DB.batch([
    env.DB.prepare("UPDATE tenders SET state='scheduled', start_at=?, end_at=?, duration_s=?, rev=rev+1, updated_at=? WHERE id=?").bind(start, end, Math.round(dur * 60), now(), t.id),
    env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)").bind(now(), "support", "tender_start", null, JSON.stringify({ tender_id: t.id, start, end })),
  ]);
  return tenderDetail(env, t.id);
}

/** POST /support/tenders/:id/end (پایانِ همین حالا) و /cancel {reason} */
export async function tenderEnd(env, id, ctx) {
  const t = await rowOf(env, int(id));
  if (!t) throw new HttpError("این مناقصه پیدا نشد.", 404);
  if (tenderState(t, now()) !== "live") throw new HttpError("فقط مناقصهٔ در جریان را می‌شود همین حالا بست.");
  await env.DB.prepare("UPDATE tenders SET end_at=?, rev=rev+1 WHERE id=? AND state='scheduled'").bind(now(), t.id).run();
  await finalizeIfDue(env, await rowOf(env, t.id), ctx);
  return tenderDetail(env, t.id);
}
export async function tenderCancel(env, id, b) {
  const t = await rowOf(env, int(id));
  if (!t) throw new HttpError("این مناقصه پیدا نشد.", 404);
  if (["ended", "cancelled"].includes(t.state)) throw new HttpError("این مناقصه از قبل بسته است.");
  const reason = T(b && b.reason).slice(0, 300);
  if (!reason) throw new HttpError("علتِ لغو را بنویسید.");
  await env.DB.batch([
    env.DB.prepare("UPDATE tenders SET state='cancelled', cancel_reason=?, ended_at=?, rev=rev+1, updated_at=? WHERE id=?").bind(reason, now(), now(), t.id),
    env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)").bind(now(), "support", "tender_cancel", null, JSON.stringify({ tender_id: t.id, reason })),
  ]);
  return tenderDetail(env, t.id);
}

/** POST /support/tenders/:id/invites — نفرِ تازه {name, phone, source, info} */
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
  const alias = aliasesFor(1, inv.reduce((m, x) => Math.max(m, x.alias), 0) + Math.floor(Math.random() * 3))[0];
  await env.DB.prepare("INSERT INTO tender_invites (tender_id,alias,name,phone,supplier_id,source,info,on_list) VALUES (?,?,?,?,?,?,?,1)")
    .bind(t.id, alias, name, phone, int(b.supplier_id), T(b.source).slice(0, 20) || "manual", b.info ? JSON.stringify(b.info).slice(0, 600) : null).run();
  if (phone) await keepPhone(env, name, phone);
  return tenderDetail(env, t.id);
}
/** PUT /support/tenders/:id/invites/:alias — {on, phone} */
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
  await env.DB.prepare(`UPDATE tender_invites SET ${Object.keys(set).map((k) => `${k}=?`).join(",")} WHERE tender_id=? AND alias=?`).bind(...Object.values(set), t.id, inv.alias).run();
  if (set.phone) await keepPhone(env, inv.name, set.phone);
  if (set.on_list === 0) await env.DB.prepare("DELETE FROM tender_sessions WHERE tender_id=? AND alias=?").bind(t.id, inv.alias).run();
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
/** POST /support/tenders/:id/invite — پیامکِ دعوت به تیک‌خورده‌های شماره‌دار (aliases: فقط همین‌ها؛ again: دوباره به فرستاده‌شده‌ها) */
export async function tenderInviteSend(env, id, b) {
  const t = await rowOf(env, int(id));
  if (!t) throw new HttpError("این مناقصه پیدا نشد.", 404);
  if (["ended", "cancelled"].includes(tenderState(t, now()))) throw new HttpError("این مناقصه بسته است.");
  const only = Array.isArray(b && b.aliases) ? new Set(b.aliases.map(int)) : null;
  const list = (await invitesOf(env, t.id)).filter((i) => i.on_list && (!only || only.has(i.alias)) && (b && b.again || only || i.sms_state !== "sent"));
  const text = inviteText(env, t);
  const out = { sent: 0, off: 0, error: 0, nophone: 0 };
  for (const i of list) {
    if (!i.phone) { out.nophone++; await env.DB.prepare("UPDATE tender_invites SET sms_state='nophone' WHERE tender_id=? AND alias=?").bind(t.id, i.alias).run(); continue; }
    const r = await sms(env, i.phone, text);
    out[r.state === "sent" ? "sent" : r.state === "off" ? "off" : "error"]++;
    await env.DB.prepare("UPDATE tender_invites SET sms_at=?, sms_state=?, sms_err=? WHERE tender_id=? AND alias=?").bind(now(), r.state, r.error || null, t.id, i.alias).run();
  }
  await env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)").bind(now(), "support", "tender_invite", null, JSON.stringify({ tender_id: t.id, ...out })).run();
  return { ...(await tenderDetail(env, t.id)), result: out, text };
}

/**
 * POST /support/tenders/:id/invites/:alias/pass — رمزِ تلفنی: وقتی پیامک نمی‌رسد یا درگاه وصل نیست، پشتیبان رمزی می‌سازد و
 * تلفنی به همان تأمین‌کننده می‌گوید (فقط همین یک بار نشان داده می‌شود؛ خامش جایی نمی‌ماند).
 */
export async function tenderPhonePass(env, id, alias) {
  const inv = await env.DB.prepare("SELECT * FROM tender_invites WHERE tender_id=? AND alias=?").bind(int(id), int(alias)).first();
  if (!inv) throw new HttpError("این نفر در فهرست نیست.", 404);
  if (!inv.phone) throw new HttpError("اول شمارهٔ همراهِ او را ثبت کنید؛ ورود با همان شماره است.");
  const pass = rand6();
  await env.DB.prepare("UPDATE tender_invites SET pass_hash=?, pass_exp=?, fails=0, lock_until=NULL WHERE tender_id=? AND alias=?").bind(await passHash(pass), now() + PASS_TTL, inv.tender_id, inv.alias).run();
  await env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)").bind(now(), "support", "tender_pass", null, JSON.stringify({ tender_id: inv.tender_id, alias: inv.alias, name: inv.name })).run();
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
  const rows = (await env.DB.prepare(`SELECT MAX(supplier) AS name, supplier_n AS sn, COUNT(*) AS n, SUM(qty) AS qty, MAX(order_date) AS last, MAX(unit) AS unit,
      SUM(CASE WHEN qty>0 THEN amount_adj END) AS amt, SUM(CASE WHEN qty>0 THEN qty END) AS qty_p
      FROM purchases WHERE item_code=? AND supplier_n IS NOT NULL AND supplier_n<>'' GROUP BY supplier_n ORDER BY n DESC, last DESC LIMIT 60`).bind(c).all()).results || [];
  return { suppliers: await withPhones(env, rows.map((r) => ({ name: r.name, n: r.n, qty: r.qty, last: r.last, unit: r.unit, avg: r.qty_p ? Math.round(r.amt / r.qty_p) : null, sn: r.sn }))) };
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

/* --- جستجوی هوشمند در وب: کار در صف، با Cron (discovery.js چند دقیقه طول می‌کشد) --- */
export async function tenderDiscoverQueue(env, id, b) {
  const t = await rowOf(env, int(id));
  if (!t) throw new HttpError("این مناقصه پیدا نشد.", 404);
  if (!T(env.ANTHROPIC_API_KEY)) throw new HttpError("کلیدِ هوش مصنوعی وصل نیست؛ جستجوی هوشمند ممکن نیست.");
  const busy = await env.DB.prepare("SELECT id FROM tender_jobs WHERE tender_id=? AND state IN ('pending','running')").bind(t.id).first();
  if (busy) throw new HttpError("یک جستجوی هوشمند برای همین مناقصه در جریان است.");
  const query = T(b && b.query).slice(0, 200) || t.title;
  await env.DB.prepare("INSERT INTO tender_jobs (tender_id,query,state,at) VALUES (?,?,'pending',?)").bind(t.id, query, now()).run();
  return tenderDetail(env, t.id);
}
/** Cron: یک جستجوی منتظر (runDiscovery با ایمپورتِ پویا، تا بارِ ماژول برای همهٔ درخواست‌ها نباشد) */
export async function tenderDiscoverTick(env) {
  const j = await env.DB.prepare("SELECT * FROM tender_jobs WHERE state='pending' ORDER BY id LIMIT 1").first().catch(() => null);
  if (!j) return false;
  const r = await env.DB.prepare("UPDATE tender_jobs SET state='running' WHERE id=? AND state='pending'").bind(j.id).run();
  if (!r.meta.changes) return false;
  try {
    const t = await rowOf(env, j.tender_id);
    const { runDiscovery } = await import("./discovery.js");
    const out = await runDiscovery(env, { item: j.query, qty: t ? t.qty : undefined, unit: t ? t.unit : undefined, markets: ["IR"], specs: t && t.spec ? t.spec : undefined });
    const list = ((out && out.result && out.result.suppliers) || []).map((s) => ({ name: T(s.name).slice(0, 120), phones: (s.phones || []).map((p) => normPhone(p)).filter(Boolean).slice(0, 3),
      website: T(s.website).slice(0, 200) || null, type: T(s.type).slice(0, 40) || null, price: s.price && s.price.text ? T(s.price.text).slice(0, 80) : null })).filter((s) => s.name);
    await env.DB.prepare("UPDATE tender_jobs SET state='done', result_json=?, done_at=? WHERE id=?").bind(JSON.stringify({ suppliers: list, cost: out && out.cost }), now(), j.id).run();
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
  return { company: COMPANY(env), state: tenderState(t, now()), start_at: t.start_at, end_at: t.end_at, now: now(), sms: smsReady(env) };
}
async function inviteOfPhone(env, t, raw) {
  const p = normPhone(raw);
  if (!p) throw new HttpError("شمارهٔ همراه را درست بنویسید (مثل ۰۹۱۲۱۲۳۴۵۶۷).");
  const inv = await env.DB.prepare("SELECT * FROM tender_invites WHERE tender_id=? AND phone=? AND on_list=1").bind(t.id, p).first();
  if (!inv) throw new HttpError("این شماره به این مناقصه دعوت نشده است. اگر فکر می‌کنید اشتباه است، با تدارکات تماس بگیرید.", 403);
  return inv;
}
/** POST /tender/:code/pass {phone} — رمزِ شش‌رقمیِ ورود به پیامک (دقیقه‌ای یک بار، روزی شش بار) */
export async function tenderSendPass(env, code, b) {
  const t = await rowOfCode(env, code);
  if (!t || t.state === "draft") throw new HttpError("این لینکِ مناقصه معتبر نیست.", 404);
  const inv = await inviteOfPhone(env, t, b && b.phone);
  const n = now(), day = Math.floor((n + 3.5 * 3600e3) / 864e5);
  if (inv.pass_sent_at && n - inv.pass_sent_at < PASS_GAP) throw new HttpError("رمز همین الان فرستاده شد؛ یک دقیقه صبر کنید.", 429);
  if (inv.pass_day === day && inv.pass_n >= PASS_DAY) throw new HttpError("امروز بیش از اندازه رمز خواسته‌اید؛ با تدارکات تماس بگیرید.", 429);
  if (!smsReady(env)) throw new HttpError("پیامک فعلاً فرستاده نمی‌شود؛ با تدارکات تماس بگیرید تا رمز را تلفنی بدهند.", 503);
  const pass = rand6();
  const r = await sms(env, inv.phone, `رمز ورود به مناقصه: ${pass}\n${COMPANY(env)}`);
  if (r.state !== "sent") throw new HttpError("پیامک فرستاده نشد؛ دوباره بزنید یا با تدارکات تماس بگیرید.", 502);
  await env.DB.prepare("UPDATE tender_invites SET pass_hash=?, pass_exp=?, pass_sent_at=?, pass_day=?, pass_n=CASE WHEN pass_day=? THEN pass_n+1 ELSE 1 END WHERE tender_id=? AND alias=?")
    .bind(await passHash(pass), n + PASS_TTL, n, day, day, t.id, inv.alias).run();
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
    env.DB.prepare("INSERT INTO tender_sessions (h,tender_id,alias,exp,at) VALUES (?,?,?,?,?)").bind(await sha256hex(token), t.id, inv.alias, n + SESSION_TTL, n),
    env.DB.prepare("UPDATE tender_invites SET fails=0, lock_until=NULL, seen_at=COALESCE(seen_at, ?) WHERE tender_id=? AND alias=?").bind(n, t.id, inv.alias),
    env.DB.prepare("DELETE FROM tender_sessions WHERE exp<?").bind(n),
  ]);
  return { token, exp: n + SESSION_TTL };
}
/** نشستِ همین مناقصه از هدرِ X-Tender-Token — {t, inv} */
export async function tenderWho(env, request, code) {
  const tok = T(request.headers.get("X-Tender-Token"));
  const t = await rowOfCode(env, code);
  if (!t || t.state === "draft") throw new HttpError("این لینکِ مناقصه معتبر نیست.", 404);
  const s = tok ? await env.DB.prepare("SELECT * FROM tender_sessions WHERE h=?").bind(await sha256hex(tok)).first() : null;
  if (!s || s.tender_id !== t.id || s.exp < now()) throw new HttpError("دوباره وارد شوید.", 401, { relogin: true });
  const inv = await env.DB.prepare("SELECT * FROM tender_invites WHERE tender_id=? AND alias=? AND on_list=1").bind(t.id, s.alias).first();
  if (!inv) throw new HttpError("دعوتِ شما برداشته شده است.", 403);
  return { t, inv };
}
/** POST /tender/:code/logout */
export async function tenderLogout(env, request) {
  const tok = T(request.headers.get("X-Tender-Token"));
  if (tok) await env.DB.prepare("DELETE FROM tender_sessions WHERE h=?").bind(await sha256hex(tok)).run();
  return { ok: true };
}

/** نمای تأمین‌کننده: نام‌های دیگران پنهان (مگر پشتیبانی نشان دهد)، خودش «شما» */
async function supplierView(env, t, inv) {
  const n = now();
  const [bids, inv2, cnt] = await Promise.all([bidsOf(env, t.id), t.show_names ? invitesOf(env, t.id) : Promise.resolve([]),
    env.DB.prepare("SELECT COUNT(*) AS n FROM tender_invites WHERE tender_id=? AND on_list=1").bind(t.id).first()]);
  const names = new Map(inv2.map((i) => [i.alias, i.name]));
  const ranks = ranksOf(bids), me = ranks.get(inv.alias) || null;
  const label = (a) => (a === inv.alias ? "شما" : t.show_names ? names.get(a) || aliasLabel(a) : aliasLabel(a));
  const live = bids.filter((b) => b.state !== "void");
  const mineFixed = bids.filter((b) => b.alias === inv.alias && b.fix_at).map((b) => ({ id: b.id, state: b.state, amount: b.amount, orig_amount: b.orig_amount, reason: b.fix_reason, at: b.fix_at }));
  return {
    tender: { ...pub(t, n), range: bidRange(t), winner: t.state === "ended" ? (t.winner_alias === inv.alias ? "you" : t.winner_alias != null ? "other" : null) : null },
    me: { alias: inv.alias, name: inv.name, label: aliasLabel(inv.alias), rank: me ? me.rank : null, best: me ? me.amount : null, lead: t.best_alias === inv.alias },
    best: t.best_amount == null ? null : { amount: t.best_amount, mine: t.best_alias === inv.alias, label: label(t.best_alias) },
    bids: live.slice(-60).reverse().map((b) => ({ id: b.id, label: label(b.alias), mine: b.alias === inv.alias, amount: b.amount, at: b.at, fixed: b.state === "fixed", ext: !!b.ext, av: b.alias })),
    series: seriesOf(bids).map((p) => ({ at: p.at, amount: p.amount, best: p.best, mine: p.alias === inv.alias })),
    bidders: ranks.size, invited: cnt.n, fixes: mineFixed, now: n, company: COMPANY(env),
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
/** POST /tender/:code/bid {amount} — اتمی با شرطِ rev؛ تا چهار بار در برخورد با پیشنهادِ هم‌زمان */
export async function tenderBid(env, request, code, b, ctx) {
  let { t, inv } = await tenderWho(env, request, code);
  const amount = amountOf(b && b.amount);
  for (let i = 0; i < 4; i++) {
    t = await finalizeIfDue(env, t, ctx);
    const n = now();
    const c = checkBid(t, amount, inv.alias, n);
    if (!c.ok) throw new HttpError(c.error, 409, { code: c.code, range: c.range, view: await supplierView(env, t, inv) });
    const ext = extendOnBid(t, n);
    const res = await env.DB.batch([
      env.DB.prepare("INSERT INTO tender_bids (tender_id,alias,amount,at,ext) SELECT ?,?,?,?,? WHERE (SELECT rev FROM tenders WHERE id=?)=?").bind(t.id, inv.alias, amount, n, ext.extended ? 1 : 0, t.id, t.rev),
      env.DB.prepare(`UPDATE tenders SET rev=rev+1, best_amount=?, best_alias=?, best_bid_id=(SELECT MAX(id) FROM tender_bids WHERE tender_id=? AND alias=? AND amount=?),
          end_at=?, ext_count=ext_count+?, updated_at=? WHERE id=? AND rev=?`).bind(amount, inv.alias, t.id, inv.alias, amount, ext.end_at, ext.extended ? 1 : 0, n, t.id, t.rev),
    ]);
    if (res[1].meta.changes) {
      const fresh = await rowOf(env, t.id);
      return { ok: true, extended: ext.extended, view: await supplierView(env, fresh, inv) };
    }
    t = await rowOf(env, t.id);
  }
  throw new HttpError("پیشنهادهای هم‌زمانِ زیادی رسید؛ دوباره بزنید.", 409);
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
