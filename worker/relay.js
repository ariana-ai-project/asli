/**
 * پلِ سرورِ شرکت (آبان ۱۴۰۵، درخواستِ مالک): پیامکِ IPPanel و پشتیبان‌گیریِ شبانه
 *
 * پنل پیامکِ IPPanel فقط از اینترنتِ داخل جواب می‌دهد: از Cloudflare (و هر IPِ خارجی) پاسخ ۵۰۲ است، از سرورِ شرکت ۲۰۰. سرورِ
 * شرکت پشتِ NAT است و از بیرون فقط پورتِ SSHاش باز است، پس Worker نمی‌تواند صدایش بزند؛ برعکس است: برنامهٔ کوچکِ پل روی سرور
 * (scripts/vps/sms_relay.py) هر چند ثانیه POST /relay/sync را می‌زند، نتیجهٔ پیامک‌های قبلی را می‌دهد و پیامک‌های تازه را می‌گیرد.
 *
 *   • RELAY_KEY (راز، فقط در Worker و روی سرور) هر مسیرِ /relay/* را باز می‌کند؛ بی آن این مسیرها ۴۰۴اند و پیامک مثل قبل مستقیم می‌رود.
 *   • با RELAY_KEY درگاهِ ippanel (worker/sms.js) دیگر IPPanel را صدا نمی‌زند: بدنهٔ همان درخواست (بی کلید) در sms_outbox می‌نشیند و
 *     کلیدِ IPPanel فقط روی سرور است. تاریخچهٔ کاملِ پیامک‌ها (متن، گیرنده، شناسهٔ IPPanel، وضعیتِ تحویل) هم روی سرور می‌ماند؛
 *     این‌جا بدنه بعد از نتیجه پاک می‌شود تا رمزهای ورود در D1 نمانند.
 *   • تپشِ پل (دقیقه‌ای یک بار): اعتبارِ پنل و نتیجهٔ آخرین پشتیبان‌گیری در settings.smsRelay — «درگاه پیامک»ِ پنل پشتیبانی همین را
 *     نشان می‌دهد و Cron (relayWatch) اگر پل چند دقیقه نیامد هشدار می‌دهد و پیامک‌های ماندهٔ صف را منقضی می‌کند.
 *   • پشتیبان‌گیری: GET /relay/backup/schema و GET /relay/backup/rows (صفحه‌به‌صفحه با rowid یا کلیدِ اصلی) — سرور هر شب یک
 *     نسخهٔ SQLite از همهٔ جدول‌ها می‌سازد (scripts/vps/backup.py).
 */
import { HttpError } from "./http.js";
import { patternDefs, patternStates, tehranCode } from "./sms-patterns.js";

export const RELAY_DDL = `
CREATE TABLE IF NOT EXISTS sms_outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, phone TEXT NOT NULL, body TEXT, kind TEXT, sp_sms_id INTEGER, status TEXT NOT NULL DEFAULT 'queued', claimed_at INTEGER, done_at INTEGER, ref TEXT, error TEXT);
CREATE INDEX IF NOT EXISTS ix_smsout_status ON sms_outbox(status, id);
`;

const T = (v) => String(v == null ? "" : v).trim();
const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const now = () => Date.now();
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };

/** پل زنده حساب می‌شود اگر تپشش تازه‌تر از این باشد (تپش دقیقه‌ای است) */
export const RELAY_FRESH_MS = 3 * 60e3;
/** پیامکی که پل این‌قدر نگرفت منقضی می‌شود — رمزِ ورودِ دیرآمده به کار نمی‌آید */
export const RELAY_EXPIRE_MS = 15 * 60e3;
/** پیامکِ گرفته‌شده‌ای که نتیجه‌اش این‌قدر نیامد «نامعلوم» می‌شود (دوباره فرستاده نمی‌شود) */
export const RELAY_STALE_MS = 10 * 60e3;
const CLAIM_MAX = 20;
/** فاصلهٔ پیشنهادیِ دو تماسِ پل (ثانیه) — سقفِ روزانهٔ درخواست‌های Worker را هم در نظر دارد */
const POLL_S = 5;

export const relayOn = (env) => !!T(env && env.RELAY_KEY);

/** مقایسهٔ زمان‌ثابتِ کلید؛ بی RELAY_KEY مسیرهای پل نیستند */
export function relayAuth(env, request) {
  const want = T(env.RELAY_KEY);
  if (!want) throw new HttpError("مسیر پیدا نشد.", 404);
  const a = new TextEncoder().encode(T(request.headers.get("x-relay-key"))), b = new TextEncoder().encode(want);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= b[i] ^ (a[i] || 0);
  if (diff) throw new HttpError("کلیدِ پل پذیرفته نشد.", 403);
}

async function relayState(env) {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key='smsRelay'").first().catch(() => null);
  return parse(r && r.value, null) || {};
}

/**
 * پیامک به صفِ پل. body همان بدنهٔ /api/sendِ IPPanel است، بی کلید. opts.smsId: ردیفِ sp_sms تا نتیجهٔ پل روی همان بنشیند.
 * اگر پل چند دقیقه است نیامده، خطا — صدازننده همان رفتارِ «پیامک نرفت» را دارد (شبیه‌سازی در بات)، نه صفی که کسی برنمی‌دارد.
 */
export async function relayEnqueue(env, phone, body, opts = {}) {
  const st = await relayState(env);
  const age = st.seen ? now() - st.seen : null;
  if (age == null || age > RELAY_FRESH_MS) {
    const e = new Error(age == null ? "پلِ پیامکِ سرورِ شرکت هنوز وصل نشده است" : `پلِ پیامکِ سرورِ شرکت ${Math.round(age / 60e3)} دقیقه است وصل نشده`);
    e.code = "network";
    throw e;
  }
  const r = await env.DB.prepare("INSERT INTO sms_outbox (at,phone,body,kind,sp_sms_id) VALUES (?,?,?,?,?)")
    .bind(now(), phone, JSON.stringify(body), T(opts.kind) || T(body && body.sending_type) || null, int(opts.smsId)).run();
  return r.meta.last_row_id;
}

/** GET /relay/patterns — تعریفِ الگوهای پیامک (worker/sms-patterns.js) برای ساختن در IPPanel به دستِ پل */
export function relayPatterns(env, request) {
  relayAuth(env, request);
  return { patterns: patternDefs(env).map(({ key, fa, title, description, message, vars, types, hash }) => ({ key, fa, title, description, message, vars, types, hash })) };
}

/** وضعیتِ الگوها برای پنل‌ها: [{key, fa, status, status_fa, reject}] — status: active | pending | rejected | error | none */
async function patternView(env) {
  const st = await patternStates(env);
  return patternDefs(env).map((d) => {
    const s = st[d.key];
    const cur = s && s.hash === d.hash;
    return { key: d.key, fa: d.fa, status: cur ? T(s.status) || "pending" : "none", status_fa: cur ? T(s.status_fa) || null : null, reject: cur ? T(s.reject) || null : null };
  });
}

/**
 * POST /relay/sync — بدنه: {results: [{id, ok, ref, error, code}], deliveries: [{id, state: done|rejected, status}],
 *   beat: {credit, gift, credit_at, ver, backup, patterns: {key: {code, status, status_fa, reject, hash}}}}
 * نتیجه‌ها روی sms_outbox (و ردیفِ sp_sms) می‌نشیند، تپش در settings، و تا ۲۰ پیامکِ تازهٔ صف گرفته و برگردانده می‌شود.
 * deliveries نتیجهٔ نهاییِ IPPanel است: «رد شده» (بررسیِ دستیِ متن) پیامک را «نرفت» می‌کند و opts.raise یک هشدار می‌دهد
 * (ساعتی یک بار — هشدار خودش پیامک دارد و نباید زنجیره بسازد).
 */
export async function relaySync(env, request, opts = {}) {
  relayAuth(env, request);
  const b = (await request.json().catch(() => null)) || {};
  const t = now();
  const stmts = [], dstmts = [];
  const rejected = [];
  for (const x of (Array.isArray(b.deliveries) ? b.deliveries : []).slice(0, 100)) {
    const id = int(x && x.id);
    const st = x && x.state === "rejected" ? "rejected" : x && x.state === "done" ? "delivered" : null;
    if (!id || !st) continue;
    const why = st === "rejected" ? `IPPanel پیامک را رد کرد${T(x.status) ? ` (${T(x.status).slice(0, 60)})` : ""} — پیامکِ متن‌آزاد در IPPanel بررسیِ دستی می‌شود` : null;
    if (why) {
      rejected.push(id);
      dstmts.push(env.DB.prepare("UPDATE sp_sms SET status='failed', error=? WHERE id=(SELECT sp_sms_id FROM sms_outbox WHERE id=? AND status='sent')").bind(why, id));
    }
    dstmts.push(env.DB.prepare("UPDATE sms_outbox SET status=?, error=COALESCE(?,error) WHERE id=? AND status='sent'").bind(st, why, id));
  }
  if (b.beat && b.beat.patterns && typeof b.beat.patterns === "object") {
    const keep = {};
    for (const d of patternDefs(env)) {
      const p = b.beat.patterns[d.key];
      if (p && typeof p === "object") keep[d.key] = { code: T(p.code).slice(0, 40) || null, status: T(p.status).slice(0, 20) || null,
        status_fa: T(p.status_fa).slice(0, 40) || null, reject: T(p.reject).slice(0, 200) || null, hash: T(p.hash).slice(0, 20) || null };
    }
    stmts.push(env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('smsPatterns',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
      .bind(JSON.stringify(keep), t));
  }
  for (const x of (Array.isArray(b.results) ? b.results : []).slice(0, 100)) {
    const id = int(x && x.id);
    if (!id) continue;
    const ok = x.ok === true, ref = T(x.ref).slice(0, 40) || null, err = ok ? null : (T(x.error).slice(0, 300) || "پیامک فرستاده نشد");
    stmts.push(env.DB.prepare("UPDATE sp_sms SET status=?, ref=COALESCE(?,ref), error=? WHERE id=(SELECT sp_sms_id FROM sms_outbox WHERE id=? AND status='sending')")
      .bind(ok ? "queued" : "failed", ref, err, id));
    stmts.push(env.DB.prepare("UPDATE sms_outbox SET status=?, done_at=?, ref=?, error=?, body=NULL WHERE id=? AND status='sending'")
      .bind(ok ? "sent" : "failed", t, ref, err, id));
  }
  /* نتیجهٔ تحویل بعد از نتیجهٔ فرستادن (هر دو در یک تماس هم بیایند، ترتیب درست است) */
  stmts.push(...dstmts);
  if (b.beat && typeof b.beat === "object") {
    const v = { seen: t, credit: Number.isFinite(Number(b.beat.credit)) ? Number(b.beat.credit) : null, gift: Number(b.beat.gift) || 0,
      credit_at: T(b.beat.credit_at) || null, credit_error: T(b.beat.credit_error).slice(0, 200) || null, ver: T(b.beat.ver).slice(0, 20) || null,
      backup: b.beat.backup && typeof b.beat.backup === "object" ? {
        at: int(b.beat.backup.at), ok: b.beat.backup.ok === true, tables: int(b.beat.backup.tables), rows: int(b.beat.backup.rows),
        bytes: int(b.beat.backup.bytes), error: T(b.beat.backup.error).slice(0, 200) || null } : null };
    stmts.push(env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('smsRelay',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
      .bind(JSON.stringify(v), t));
  }
  if (stmts.length) await env.DB.batch(stmts);
  if (rejected.length && opts.raise) await rejectAlarm(env, rejected, opts.raise).catch((e) => console.error("sms reject alarm", e && e.message));
  const rows = (await env.DB.prepare(`UPDATE sms_outbox SET status='sending', claimed_at=? WHERE id IN
      (SELECT id FROM sms_outbox WHERE status='queued' AND at>=? ORDER BY id LIMIT ${CLAIM_MAX}) RETURNING id, phone, body, at, kind`)
    .bind(t, t - RELAY_EXPIRE_MS).all()).results || [];
  rows.sort((a, c) => a.id - c.id);
  return { ok: true, poll: POLL_S, jobs: rows.map((r) => ({ id: r.id, phone: r.phone, at: r.at, kind: r.kind || null, body: parse(r.body, null) })).filter((j) => j.body) };
}

/** «IPPanel پیامک را رد کرد» — ساعتی حداکثر یک هشدار؛ شماره پوشیده */
async function rejectAlarm(env, ids, raise) {
  const t = now();
  const last = await env.DB.prepare("SELECT value FROM settings WHERE key='smsRejectAlarm'").first().catch(() => null);
  if (last && t - (Number(parse(last.value, 0)) || 0) < 3600e3) return;
  await env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('smsRejectAlarm',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
    .bind(String(t), t).run();
  const r = await env.DB.prepare("SELECT phone, kind FROM sms_outbox WHERE id=?").bind(ids[0]).first().catch(() => null);
  const ph = r && r.phone ? `${String(r.phone).replace(/^\+98/, "0").slice(0, 4)}…${String(r.phone).slice(-4)}` : "";
  await raise({ kind: "sms_rejected", title: "IPPanel پیامک را رد کرد",
    body: `${ids.length > 1 ? `${ids.length} پیامک` : `پیامک${ph ? ` به ${ph}` : ""}`} در بررسیِ دستیِ IPPanel رد شد و نرسید. پیامکِ متن‌آزاد در IPPanel بررسی می‌شود؛ وضعیتِ الگوهای پیامک در «📶 درگاه پیامک».`,
    payload: { outbox: ids.slice(0, 20), kind: r && r.kind } });
}

/** ساعتِ تهران به رقمِ فارسی */
function tehranHM(t) {
  try { return new Date(t).toLocaleTimeString("fa-IR", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit", hour12: false }); }
  catch (_) { return new Date(t).toISOString().slice(11, 16) + " UTC"; }
}
/** متنِ «پیامک آزمایشی» با ساعتِ تهران */
export const relayTestText = (t = now()) => `پیامک آزمایشی سامانهٔ تأمین آریانا — ساعت ${tehranHM(t)}`;
/** الگوی همان پیامک (worker/sms-patterns.js، کلیدِ test) — IPPanel متغیرش را عددی کرد: ساعتِ تهران به شکلِ HHMM */
export const relayTestPattern = (t = now()) => ({ key: "test", params: { code: tehranCode(t) } });

/** وضعیتِ پل برای پنل پشتیبانی — بی هیچ کلید */
export async function relayStatus(env) {
  const st = await relayState(env);
  const q = await env.DB.prepare("SELECT COUNT(*) AS n FROM sms_outbox WHERE status='queued'").first().catch(() => null);
  const age = st.seen ? now() - st.seen : null;
  return { seen: st.seen || null, age_s: age == null ? null : Math.round(age / 1000), live: age != null && age <= RELAY_FRESH_MS,
    queued: (q && q.n) || 0, credit: st.credit == null ? null : st.credit, gift: st.gift || 0, credit_at: st.credit_at || null,
    credit_error: st.credit_error || null, ver: st.ver || null, backup: st.backup || null, patterns: await patternView(env) };
}

/** «تستِ درگاه» در حالتِ پل: پل زنده است و اعتبارِ آخرین تپش؟ (پیامکی نمی‌رود) */
export async function relayCheck(env) {
  const s = await relayStatus(env);
  if (!s.seen) return { ok: false, code: "network", error: "پلِ پیامکِ سرورِ شرکت هنوز وصل نشده است.", relay: s };
  if (!s.live) return { ok: false, code: "network", error: `پلِ پیامکِ سرورِ شرکت ${Math.round(s.age_s / 60)} دقیقه است وصل نشده.`, relay: s };
  if (s.credit_error) return { ok: false, code: "auth", error: s.credit_error, relay: s };
  const ok = !(s.credit != null && s.credit <= 0);
  return { ok, credit: s.credit, gift: s.gift, at: s.credit_at, relay: s, error: ok ? null : "اعتبارِ پنل پیامک تمام شده است." };
}

/**
 * Cron (دقیقه‌های مضرب ۵): پیامک‌های ماندهٔ صف منقضی و «فرستاده‌شده‌های بی‌نتیجه» نامعلوم می‌شوند؛ اگر پل از دست رفته، یک هشدار
 * (تا وقتی دوباره بیاید فقط همان یک بار). raise همان raiseAlarm است (worker/alarms.js).
 */
export async function relayWatch(env, raise, ctx) {
  if (!relayOn(env)) return null;
  const t = now();
  const exp = await env.DB.prepare("UPDATE sms_outbox SET status='failed', done_at=?, error='منقضی شد — پلِ پیامک به‌موقع برش نداشت', body=NULL WHERE status='queued' AND at<?")
    .bind(t, t - RELAY_EXPIRE_MS).run();
  const stale = await env.DB.prepare("UPDATE sms_outbox SET status='unknown', done_at=?, error='پل گرفت ولی نتیجه‌اش نیامد', body=NULL WHERE status='sending' AND claimed_at<?")
    .bind(t, t - RELAY_STALE_MS).run();
  const st = await relayState(env);
  const down = !st.seen || t - st.seen > RELAY_FRESH_MS;
  if (down && st.seen && !st.alarmed && raise) {
    await raise(env, { kind: "sms_relay", title: "پلِ پیامک قطع است",
      body: `برنامهٔ پلِ پیامک روی سرورِ شرکت ${Math.round((t - st.seen) / 60e3)} دقیقه است وصل نشده؛ تا برگردد پیامکی نمی‌رود (به‌جایش شبیه‌سازی در بات).` }, ctx);
    await env.DB.prepare("UPDATE settings SET value=? WHERE key='smsRelay'").bind(JSON.stringify({ ...st, alarmed: t })).run();
  }
  return { expired: exp.meta.changes || 0, stale: stale.meta.changes || 0, down };
}

/* ------------------------------------------------------------------ */
/* پشتیبان‌گیری                                                        */
/* ------------------------------------------------------------------ */
const SKIP = (n) => /^(sqlite_|_cf_)/i.test(n);
const qid = (n) => `"${String(n).replace(/"/g, '""')}"`;

async function tables(env) {
  const rows = (await env.DB.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type DESC, name").all()).results || [];
  return rows.filter((r) => !SKIP(r.name) && !SKIP(r.tbl_name));
}

/** GET /relay/backup/schema — جدول‌ها (با ستون‌های کلیدِ اصلیِ جدول‌های WITHOUT ROWID) و ایندکس‌ها */
export async function relayBackupSchema(env, request) {
  relayAuth(env, request);
  const all = await tables(env);
  const tbl = all.filter((r) => r.type === "table");
  const info = tbl.length ? await env.DB.batch(tbl.map((r) => env.DB.prepare(`PRAGMA table_info(${qid(r.name)})`))) : [];
  return {
    at: now(),
    tables: tbl.map((r, i) => {
      const cols = (info[i] && info[i].results) || [];
      const norowid = /\bWITHOUT\s+ROWID\b/i.test(r.sql);
      return { name: r.name, sql: r.sql, rowid: !norowid, cols: cols.map((c) => c.name),
        pk: cols.filter((c) => c.pk).sort((a, c) => a.pk - c.pk).map((c) => c.name) };
    }),
    indexes: all.filter((r) => r.type === "index").map((r) => ({ name: r.name, table: r.tbl_name, sql: r.sql })),
  };
}

const BYTES_MAX = 600 * 1024;
/** BLOB در JSON: {$b64} — D1 آن را آرایهٔ بایت می‌دهد، node:sqlite به شکلِ Uint8Array */
const cell = (v) => {
  if (v == null || typeof v !== "object") return v;
  const u = v instanceof ArrayBuffer ? new Uint8Array(v) : ArrayBuffer.isView(v) ? new Uint8Array(v.buffer, v.byteOffset, v.byteLength) : Array.isArray(v) ? v : null;
  if (!u) return v;
  let s = ""; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i] & 255);
  return { $b64: btoa(s) };
};

/**
 * GET /relay/backup/rows?t=<جدول>&after=<JSON>&n=<تا ۵۰۰> — یک صفحه از یک جدول، به ترتیبِ rowid (یا کلیدِ اصلی در WITHOUT ROWID).
 * خروجی {rows: [[...مقدارها]], cols, next (JSONِ کلیدِ آخرین ردیف یا null یعنی تمام شد)}. هر صفحه حداکثر ~۶۰۰ کیلوبایت.
 */
export async function relayBackupRows(env, request, url) {
  relayAuth(env, request);
  const name = T(url.searchParams.get("t"));
  const meta = (await tables(env)).find((r) => r.type === "table" && r.name === name);
  if (!meta) throw new HttpError("جدول پیدا نشد.", 404);
  const n = Math.min(500, Math.max(1, int(url.searchParams.get("n")) || 200));
  const after = parse(url.searchParams.get("after"), null);
  const norowid = /\bWITHOUT\s+ROWID\b/i.test(meta.sql);
  let sql, args = [], keyOf;
  if (!norowid) {
    sql = `SELECT rowid AS "__rowid", * FROM ${qid(name)}${after != null ? ' WHERE rowid>?' : ""} ORDER BY rowid LIMIT ?`;
    if (after != null) args.push(Number(after));
    keyOf = (r) => r.__rowid;
  } else {
    const cols = ((await env.DB.prepare(`PRAGMA table_info(${qid(name)})`).all()).results || []);
    const pk = cols.filter((c) => c.pk).sort((a, c) => a.pk - c.pk).map((c) => c.name);
    if (!pk.length) throw new HttpError("جدول کلیدِ اصلی ندارد.", 500);
    const k = pk.map(qid).join(",");
    const where = Array.isArray(after) && after.length === pk.length ? ` WHERE (${k})>(${pk.map(() => "?").join(",")})` : "";
    if (where) args.push(...after);
    sql = `SELECT * FROM ${qid(name)}${where} ORDER BY ${k} LIMIT ?`;
    keyOf = (r) => pk.map((c) => r[c]);
  }
  args.push(n);
  const res = (await env.DB.prepare(sql).bind(...args).all()).results || [];
  const cols = res.length ? Object.keys(res[0]) : [];
  const out = [];
  let bytes = 0, last = null;
  for (const r of res) {
    const row = cols.map((c) => cell(r[c]));
    bytes += JSON.stringify(row).length;
    out.push(row); last = keyOf(r);
    if (bytes > BYTES_MAX) break;
  }
  const more = out.length < res.length || res.length === n;
  return { table: name, cols, rows: out, next: more && last != null ? JSON.stringify(last) : null };
}
