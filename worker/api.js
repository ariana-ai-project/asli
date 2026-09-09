/**
 * سامانهٔ پشتیبانی خرید — API روی Cloudflare (Worker + D1)
 *
 * مسیر:  /tamin-poshtibani/api/*         بایندینگ D1:  env.DB
 * متغیر:  env.MANAGER_CODE  (کد ورود مدیر؛ بدون آن، مسیرهای مدیر ۵۰۳ می‌دهند تا
 *         پنل ارجاع هیچ‌وقت ناخواسته روی اینترنت باز نماند)
 *
 * احراز هویت (ساده، مطابق تصمیم «لیست ثابت کارشناس»):
 *   مدیر    → هدر X-Manager-Code = env.MANAGER_CODE
 *   کارشناس → هدر X-Expert-Code  = کد ورود در جدول experts
 *
 * طرح جدول‌ها در SCHEMA (پایین فایل) است و در اولین فراخوانی هر isolate با
 * CREATE TABLE IF NOT EXISTS اعمال می‌شود؛ نسخهٔ خوانا در
 * backend/tamin-poshtibani/schema.sql نگه داشته شده.
 *
 * نقطهٔ ورود: worker.js تابع route(request, env) را برای /tamin-poshtibani/api/* صدا می‌زند.
 */

import { alertSchedule, jNorm, jValid, jStr, fmtFa } from "./time.js";
import { telegram } from "./telegram.js";
import { storage, storageInfo, storageKey, MAX_BYTES } from "./storage.js";
import { handleUpdate, makeLink, scheduled, queueStmt, dispatchText, drainOutbox } from "./bot.js";

const PREFIX = "/tamin-poshtibani/api";
const DAY = 86400000;

/* ------------------------------------------------------------------ */
/* ابزارها                                                              */
/* ------------------------------------------------------------------ */
const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } });
const err = (message, status = 400, extra = {}) => json({ error: message, ...extra }, status);
const now = () => Date.now();
const nrm = (x) => String(x == null ? "" : x).replace(/[ي]/g, "ی").replace(/[ك]/g, "ک").replace(/‌/g, " ").replace(/\s+/g, " ").trim();
const T = (v) => String(v == null ? "" : v).trim();
const num = (v) => { const s = String(v == null ? "" : v).replace(/,/g, "").trim(); if (!s) return null; const n = Number(s); return isNaN(n) ? null : n; };
const int = (v, d = null) => { const n = parseInt(v, 10); return isNaN(n) ? d : n; };

async function readJson(request) {
  try { return await request.json(); } catch (_) { throw new HttpError("بدنهٔ درخواست JSON معتبر نیست.", 400); }
}
class HttpError extends Error { constructor(m, status = 400, extra) { super(m); this.status = status; this.extra = extra; } }

/* ------------------------------------------------------------------ */
/* احراز هویت                                                            */
/* ------------------------------------------------------------------ */
function requireManager(request, env) {
  if (!env.MANAGER_CODE) throw new HttpError("MANAGER_CODE در تنظیمات Cloudflare ست نشده؛ پنل مدیر تا آن زمان قفل است.", 503);
  const code = request.headers.get("X-Manager-Code") || "";
  if (code !== env.MANAGER_CODE) throw new HttpError("کد مدیر نادرست است.", 401);
}
async function requireExpert(request, env) {
  const code = T(request.headers.get("X-Expert-Code"));
  if (!code) throw new HttpError("وارد نشده‌اید.", 401);
  const ex = await env.DB.prepare("SELECT id,name,label,code,active FROM experts WHERE code=?").bind(code).first();
  if (!ex || !ex.active) throw new HttpError("کد کارشناسی معتبر نیست.", 401);
  return ex;
}
/* مدیر یا کارشناس — برای خواندن‌های مشترک */
async function requireAny(request, env) {
  if (request.headers.get("X-Manager-Code")) { requireManager(request, env); return { role: "manager" }; }
  const ex = await requireExpert(request, env); return { role: "expert", expert: ex };
}

/* ------------------------------------------------------------------ */
/* طرح پایگاه داده — خودکار در اولین فراخوانی                            */
/* ------------------------------------------------------------------ */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS experts (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, label TEXT, code TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1, speed REAL NOT NULL DEFAULT 1.0, telegram_chat TEXT, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS imports (id INTEGER PRIMARY KEY, filename TEXT, imported_at INTEGER NOT NULL, row_count INTEGER, request_count INTEGER, stats_json TEXT);
CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, date TEXT NOT NULL, party TEXT NOT NULL, party_type TEXT, center TEXT, requester TEXT, req_type TEXT, buy_type TEXT, buy_flow TEXT, urgency TEXT, first_import_id INTEGER, last_import_id INTEGER, head_req_type TEXT DEFAULT 'عادی', head_deal_type TEXT DEFAULT 'خرید', head_site TEXT);
CREATE INDEX IF NOT EXISTS ix_requests_date ON requests(date);
CREATE INDEX IF NOT EXISTS ix_requests_party ON requests(party);
CREATE TABLE IF NOT EXISTS assignments (id INTEGER PRIMARY KEY, request_id TEXT NOT NULL, expert_id INTEGER NOT NULL, days INTEGER, dispatched_at INTEGER, viewed_at INTEGER, commission_at INTEGER, created_at INTEGER NOT NULL, UNIQUE(request_id, expert_id));
CREATE INDEX IF NOT EXISTS ix_assign_expert ON assignments(expert_id, dispatched_at);
CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY, request_id TEXT NOT NULL, item_key TEXT NOT NULL, line_no INTEGER NOT NULL, code TEXT, title TEXT NOT NULL, spec TEXT, qty REAL, unit TEXT, need_date TEXT, consumer TEXT, note TEXT, src_status TEXT, src_expert TEXT, state TEXT NOT NULL DEFAULT 'open', state_at INTEGER, assignment_id INTEGER, hist_done_at INTEGER, smart_done_at INTEGER, commission_ok INTEGER NOT NULL DEFAULT 0, UNIQUE(request_id, item_key));
CREATE INDEX IF NOT EXISTS ix_items_request ON items(request_id);
CREATE INDEX IF NOT EXISTS ix_items_assign ON items(assignment_id);
CREATE INDEX IF NOT EXISTS ix_items_state ON items(state);
CREATE TABLE IF NOT EXISTS quotes (id INTEGER PRIMARY KEY, assignment_id INTEGER NOT NULL, item_id INTEGER NOT NULL, supplier_name TEXT NOT NULL, supplier_code TEXT, spec TEXT, unit TEXT, qty REAL, price REAL, dtime TEXT, valid_days TEXT, ship TEXT, invoice TEXT, pay TEXT, deal TEXT, place TEXT, place_other TEXT, saved INTEGER NOT NULL DEFAULT 0, final INTEGER NOT NULL DEFAULT 0, low_conf INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_quotes_assign ON quotes(assignment_id);
CREATE TABLE IF NOT EXISTS proformas (id INTEGER PRIMARY KEY, assignment_id INTEGER NOT NULL, supplier_name TEXT NOT NULL, filename TEXT, r2_key TEXT, extracted_json TEXT, uploaded_at INTEGER NOT NULL, UNIQUE(assignment_id, supplier_name));
CREATE TABLE IF NOT EXISTS suppliers (id INTEGER PRIMARY KEY, code TEXT UNIQUE, name TEXT NOT NULL, founded INTEGER, city TEXT, site TEXT, phone TEXT, tel2 TEXT, email TEXT, note TEXT, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS supplier_channels (supplier_code TEXT NOT NULL, item_title TEXT NOT NULL, platform TEXT NOT NULL, state TEXT NOT NULL, updated_by INTEGER, updated_at INTEGER NOT NULL, PRIMARY KEY (supplier_code, item_title, platform));
CREATE TABLE IF NOT EXISTS templates (id INTEGER PRIMARY KEY, expert_id INTEGER, title TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS expert_scores (expert_id INTEGER NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL, score INTEGER NOT NULL, PRIMARY KEY (expert_id, kind, key));
CREATE TABLE IF NOT EXISTS weights (kind TEXT NOT NULL, key TEXT NOT NULL, w REAL NOT NULL, PRIMARY KEY (kind, key));
CREATE TABLE IF NOT EXISTS decisions (id INTEGER PRIMARY KEY, assignment_id INTEGER NOT NULL, expert_id INTEGER NOT NULL, action TEXT NOT NULL, payload_json TEXT, requested_at INTEGER NOT NULL, approved_at INTEGER, rejected_at INTEGER);
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, actor TEXT NOT NULL, kind TEXT NOT NULL, request_id TEXT, item_id INTEGER, payload_json TEXT, delivered_at INTEGER);
CREATE INDEX IF NOT EXISTS ix_events_at ON events(at);
CREATE TABLE IF NOT EXISTS holidays (date_j TEXT PRIMARY KEY, title TEXT, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS alerts (id INTEGER PRIMARY KEY, assignment_id INTEGER NOT NULL, kind TEXT NOT NULL, stage INTEGER NOT NULL DEFAULT -1, fire_at INTEGER NOT NULL, fired_at INTEGER, canceled_at INTEGER, UNIQUE(assignment_id, kind, stage));
CREATE INDEX IF NOT EXISTS ix_alerts_due ON alerts(fire_at) WHERE fired_at IS NULL AND canceled_at IS NULL;
CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY, idem TEXT NOT NULL UNIQUE, channel TEXT NOT NULL, target TEXT NOT NULL, payload_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL, last_error TEXT, created_at INTEGER NOT NULL, sent_at INTEGER);
CREATE INDEX IF NOT EXISTS ix_outbox_due ON outbox(next_at) WHERE status='pending';
CREATE TABLE IF NOT EXISTS tg_tokens (token TEXT PRIMARY KEY, expert_id INTEGER NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER);
CREATE TABLE IF NOT EXISTS tg_seen (update_id INTEGER PRIMARY KEY, seen_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS tg_uploads (id INTEGER PRIMARY KEY, expert_id INTEGER NOT NULL, chat_id TEXT NOT NULL, message_id INTEGER, file_id TEXT, storage_key TEXT, filename TEXT, mime TEXT, size_bytes INTEGER, state TEXT NOT NULL DEFAULT 'need_request', assignment_id INTEGER, options_json TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, reminded_at INTEGER, done_at INTEGER);
CREATE INDEX IF NOT EXISTS ix_uploads_open ON tg_uploads(expires_at) WHERE done_at IS NULL;
`;

/* ستون‌هایی که بعد از اولین استقرار اضافه شده‌اند.
   SCHEMA فقط CREATE TABLE IF NOT EXISTS دارد و روی جدول موجود اثری ندارد،
   پس افزودن ستون جدید باید صریح و یک‌بار انجام شود. */
const COLUMN_MIGRATIONS = [
  ["assignments", "deadline_at", "INTEGER"],  /* لحظهٔ پایان مهلت (SLA-02) */
  ["assignments", "budget_h", "REAL"],        /* بودجهٔ مهلت به ساعت کاری */
  ["assignments", "thr_snapshot", "TEXT"],    /* آستانه‌ها در لحظهٔ ارسال (SLA-04) */
  ["proformas", "mime", "TEXT"],
  ["proformas", "size_bytes", "INTEGER"],
  ["proformas", "source", "TEXT"],            /* panel | telegram */
];

/* تغییر نام ستون. `r2_key` وقتی نوشته شد که قرار بود فایل‌ها در R2 بنشینند؛
   R2 روی این حساب فعال نیست و انبار فایل پشت یک آداپتور رفت، پس نام عمومی‌تر
   درست‌تر است. جدول هنوز خالی است، پس تغییر نام بی‌خطر است. */
const COLUMN_RENAMES = [["proformas", "r2_key", "storage_key"]];

/* کارشناسان اولیه — همان config.js؛ اینجا تکرار شده تا سرور به فایل استاتیک وابسته نباشد.
   بعد از اولین اجرا، منبعِ حقیقت جدول experts است (مدیر می‌تواند فعال/غیرفعال کند). */
const SEED_EXPERTS = [
  ["1140", "سالار کوشاری", "آقای سالار کوشاری"], ["1141", "امیرحسین کریم خان", "آقای کریمخانی"],
  ["1142", "سید حمید رسولی طاهر", "آقای رسولی"], ["1143", "حسین احسانی", "آقای احسانی"],
  ["1144", "ارسلان کوشاری", "آقای ارسلان کوشاری"], ["1145", "ابوذر بهمنی", "آقای بهمنی"],
  ["1146", "مریم محمودی اصل زاده", "خانم محمودی"], ["1147", "مهدی طراوتی", "آقای طراوتی"],
  ["1148", "زهرا خوانساری ورکانه", "خانم خوانساری"], ["1150", "مهدی شیری آغول بیک", "آقای شیری"],
  ["1151", "امید آقا موسی طهرانی", "آقای طهرانی"], ["1152", "کامران بخشی سولا", "آقای بخشی"],
  ["1153", "عادل حیدری", "آقای حیدری"], ["1154", "خشایار حقیقی حشمتی مفرد", "آقای خشایار حقیقی"],
  ["1155", "محمدهادی درجزی دولق", "آقای درجزی"], ["1156", "بهروز سهرابی", "آقای سهرابی"],
];

const DEFAULTS = {
  thresholds: [10, 30, 50, 70, 90, 100], dispatchDays: 2, minSuppliers: 1, approvalRequired: false,
  assign: { a: 40, b: 30, c: 30, op1: "+", op2: "−" },
  deadline: { base: 3, we: 1, wp: 1, wi: 1, op1: "×", op2: "×", op3: "×" },
  capacity: 8, window: "3d",
};

let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  if (!env.DB) throw new HttpError("بایندینگ D1 با نام DB روی این پروژه ست نشده است.", 503);
  await env.DB.exec(SCHEMA.trim().split("\n").filter(Boolean).join("\n"));
  await migrateColumns(env);
  const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM experts").first();
  if (!c || !c.n) {
    const t = now();
    await env.DB.batch(SEED_EXPERTS.map(([code, name, label]) =>
      env.DB.prepare("INSERT OR IGNORE INTO experts (code,name,label,active,speed,created_at) VALUES (?,?,?,1,1.0,?)").bind(code, nrm(name), label, t)));
  }
  schemaReady = true;
}

/* ------------------------------------------------------------------ */
/* تنظیمات                                                              */
/* ------------------------------------------------------------------ */
/* ستون‌های افزوده‌شده را روی جدول‌های موجود اعمال می‌کند. یک PRAGMA برای هر جدول
   و فقط در صورت نبودِ ستون یک ALTER — پس روی دیتابیس به‌روز عملاً یک کوئری است. */
async function migrateColumns(env) {
  const byTable = new Map();
  for (const [t, c, ty] of COLUMN_MIGRATIONS) { if (!byTable.has(t)) byTable.set(t, []); byTable.get(t).push([c, ty]); }
  for (const [t] of COLUMN_RENAMES) if (!byTable.has(t)) byTable.set(t, []);
  for (const [table, cols] of byTable) {
    const have = new Set(((await env.DB.prepare(`PRAGMA table_info(${table})`).all()).results || []).map((r) => r.name));
    const work = cols.filter(([c]) => !have.has(c)).map(([c, ty]) => env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${c} ${ty}`));
    for (const [t, from, to] of COLUMN_RENAMES) {
      if (t === table && have.has(from) && !have.has(to)) work.push(env.DB.prepare(`ALTER TABLE ${table} RENAME COLUMN ${from} TO ${to}`));
    }
    if (work.length) await env.DB.batch(work);
  }
}

/* تعطیلات رسمی — در هر isolate کش می‌شود؛ خیلی کم تغییر می‌کند و
   Cron در پلن رایگان فقط ۵۰ subrequest دارد، پس هر کوئری اضافه مهم است. */
let holidayCache = null;
async function holidayFn(env) {
  if (!holidayCache || now() - holidayCache.at > 5 * 60000) {
    const rows = (await env.DB.prepare("SELECT date_j FROM holidays").all()).results || [];
    holidayCache = { at: now(), set: new Set(rows.map((r) => r.date_j)) };
  }
  const s = holidayCache.set;
  return (d) => s.has(d);
}

/**
 * زمان‌بندی هشدارهای یک ارجاعِ ارسال‌شده را می‌سازد.
 *
 * چرا در لحظهٔ ارسال و نه در لحظهٔ هشدار: `SLA-04` می‌گوید تغییر آستانه‌ها نباید
 * ارجاع‌های در جریان را تکان بدهد، و Cron پلن رایگان (۱۰ms CPU) توان محاسبهٔ
 * ساعات کاری برای ده‌ها ارجاع را ندارد. این‌جا یک بار حساب، بعد فقط SELECT.
 *
 * خروجی: آرایه‌ای از statement ها تا در همان batchِ صدازننده اجرا شوند.
 */
function alertStatements(env, a, thresholds, isHoliday, at) {
  const s = alertSchedule(at, a.days, thresholds, isHoliday);
  const st = [
    env.DB.prepare("UPDATE assignments SET deadline_at=?, budget_h=?, thr_snapshot=? WHERE id=?")
      .bind(s.deadlineAt, s.budget, JSON.stringify(thresholds), a.id),
    /* هشدارهای قبلیِ همین ارجاع (مثلاً بعد از تغییر کارشناس) بی‌اثر می‌شوند */
    env.DB.prepare("UPDATE alerts SET canceled_at=? WHERE assignment_id=? AND fired_at IS NULL").bind(at, a.id),
  ];
  for (const r of s.rows) {
    st.push(env.DB.prepare(`INSERT INTO alerts (assignment_id,kind,stage,fire_at) VALUES (?,'stage',?,?)
      ON CONFLICT(assignment_id,kind,stage) DO UPDATE SET fire_at=excluded.fire_at, fired_at=NULL, canceled_at=NULL`)
      .bind(a.id, r.stage, r.fireAt));
  }
  st.push(env.DB.prepare(`INSERT INTO alerts (assignment_id,kind,stage,fire_at) VALUES (?,'over',-1,?)
    ON CONFLICT(assignment_id,kind,stage) DO UPDATE SET fire_at=excluded.fire_at, fired_at=NULL, canceled_at=NULL`)
    .bind(a.id, s.deadlineAt));
  return st;
}

async function getSettings(env) {
  const rows = (await env.DB.prepare("SELECT key,value FROM settings").all()).results || [];
  const s = JSON.parse(JSON.stringify(DEFAULTS));
  for (const r of rows) { try { s[r.key] = JSON.parse(r.value); } catch (_) { /* مقدار خراب — پیش‌فرض می‌ماند */ } }
  return s;
}
async function putSettings(env, patch) {
  const t = now(); const stmts = [];
  for (const [k, v] of Object.entries(patch || {})) {
    if (!(k in DEFAULTS)) continue;
    stmts.push(env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").bind(k, JSON.stringify(v), t));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return getSettings(env);
}

/* ------------------------------------------------------------------ */
/* رویداد / صف اعلان                                                     */
/* ------------------------------------------------------------------ */
function ev(env, actor, kind, request_id, item_id, payload) {
  return env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,item_id,payload_json) VALUES (?,?,?,?,?,?)")
    .bind(now(), actor, kind, request_id || null, item_id || null, payload ? JSON.stringify(payload) : null);
}

/* ------------------------------------------------------------------ */
/* بارگذاری اکسل                                                         */
/* ------------------------------------------------------------------ */
async function importBegin(env, body) {
  const r = await env.DB.prepare("INSERT INTO imports (filename,imported_at,row_count,request_count,stats_json) VALUES (?,?,?,?,?)")
    .bind(T(body.filename) || null, now(), int(body.stats && body.stats.rows), int(body.stats && body.stats.requests), body.stats ? JSON.stringify(body.stats) : null).run();
  return { import_id: r.meta.last_row_id };
}

/* یک دستهٔ درخواست‌های باز: درج/به‌روزرسانی درخواست و اقلام.
   کلید قلم: (request_id, code, line_no) — راهکاران ممکن است یک کد را چند بار در یک درخواست
   بیاورد، پس code تنها کافی نیست؛ line_no ترتیب همان فایل است. */
async function importChunk(env, body) {
  const importId = int(body.import_id); if (!importId) throw new HttpError("import_id لازم است.");
  const reqs = Array.isArray(body.requests) ? body.requests : [];
  const t = now();
  const stmts = [];
  let newRequests = 0, newItems = 0;
  const ids = reqs.map((r) => T(r.id)).filter(Boolean);
  const existing = new Set();
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    const rs = (await env.DB.prepare(`SELECT id FROM requests WHERE id IN (${part.map(() => "?").join(",")})`).bind(...part).all()).results || [];
    rs.forEach((x) => existing.add(x.id));
  }
  for (const r of reqs) {
    const id = T(r.id); if (!id) continue;
    if (!existing.has(id)) newRequests++;
    stmts.push(env.DB.prepare(`INSERT INTO requests (id,date,party,party_type,center,requester,req_type,buy_type,buy_flow,urgency,first_import_id,last_import_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET date=excluded.date, party=excluded.party, party_type=excluded.party_type, center=excluded.center,
        requester=excluded.requester, req_type=excluded.req_type, buy_type=excluded.buy_type, buy_flow=excluded.buy_flow, urgency=excluded.urgency, last_import_id=excluded.last_import_id`)
      .bind(id, T(r.date), T(r.party), T(r.partyType) || null, T(r.center) || null, T(r.requester) || null, T(r.reqType) || null, T(r.buyType) || null, T(r.buyFlow) || null, T(r.urgency) || null, importId, importId));
    /* کلید قلم = عنوانِ نرمال‌شده (+ شمارنده برای عنوان تکراری در همان درخواست).
       خروجی روزانهٔ راهکاران کد قلم ندارد و خروجی کامل دارد؛ کلیدِ عنوانی در هر دو یکی است
       و بارگذاری دوباره (یا هر دو فرمت پشت‌سرهم) قلم را تکرار نمی‌کند. */
    const seen = new Map();
    for (const it of r.items || []) {
      const base = nrm(it.title) || ("line" + int(it.lineNo, 1));
      const n = seen.get(base) || 0; seen.set(base, n + 1);
      const key = n ? `${base}#${n}` : base;
      /* وضعیت راهکاران فقط برای قلمِ تازه اعمال می‌شود؛ برای قلم موجود، state سامانه دست‌نخورده می‌ماند
         و اختلاف در مرحلهٔ finish به‌عنوان پیشنهاد به مدیر برمی‌گردد (ملاک فایل جدید است، اعمال با تأیید).
         ستون‌هایی که فایل روزانه ندارد (کد، مشخصه، تاریخ نیاز، …) با COALESCE از فایل کامل قبلی حفظ می‌شوند. */
      stmts.push(env.DB.prepare(`INSERT INTO items (request_id,item_key,line_no,code,title,spec,qty,unit,need_date,consumer,note,src_status,src_expert,state,state_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(request_id,item_key) DO UPDATE SET line_no=excluded.line_no, title=excluded.title,
          code=COALESCE(excluded.code, items.code), spec=COALESCE(excluded.spec, items.spec), qty=excluded.qty, unit=excluded.unit,
          need_date=COALESCE(excluded.need_date, items.need_date), consumer=COALESCE(excluded.consumer, items.consumer), note=COALESCE(excluded.note, items.note),
          src_status=excluded.src_status, src_expert=COALESCE(excluded.src_expert, items.src_expert)`)
        .bind(id, key, int(it.lineNo, 1), T(it.code) || null, T(it.title), T(it.spec) || null, num(it.qty), T(it.unit) || null, T(it.needDate) || null,
          T(it.consumer) || null, T(it.note) || null, T(it.srcStatus) || null, T(it.srcExpert) || null, ["open", "hold", "stop", "closed"].includes(it.state) ? it.state : "open", t));
      newItems++;
    }
  }
  for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
  return { ok: true, requests: reqs.length, newRequests, itemsUpserted: newItems };
}

/* پایان بارگذاری: پیشنهادها برای تأیید مدیر */
async function importFinish(env, body) {
  const importId = int(body.import_id); if (!importId) throw new HttpError("import_id لازم است.");
  const closedIds = Array.isArray(body.closedIds) ? body.closedIds.map(T).filter(Boolean) : [];
  const out = { closeCandidates: [], reopenCandidates: [], stateDrift: [], expertDrift: [] };

  /* ۱) در سامانه باز ولی در راهکاران کاملاً بسته/متوقف */
  for (let i = 0; i < closedIds.length; i += 90) {
    const part = closedIds.slice(i, i + 90);
    const rs = (await env.DB.prepare(`SELECT i.request_id, COUNT(*) AS n, MAX(e.name) AS expert
      FROM items i LEFT JOIN assignments a ON a.id=i.assignment_id LEFT JOIN experts e ON e.id=a.expert_id
      WHERE i.state IN ('open','hold') AND i.request_id IN (${part.map(() => "?").join(",")}) GROUP BY i.request_id`).bind(...part).all()).results || [];
    out.closeCandidates.push(...rs);
  }
  /* ۲) قلم‌هایی که وضعیت راهکاران‌شان با state سامانه نمی‌خواند (در همین بارگذاری به‌روز شده‌اند) */
  const drift = (await env.DB.prepare(`SELECT i.id, i.request_id, i.title, i.src_status, i.state, e.name AS expert
      FROM items i JOIN requests r ON r.id=i.request_id LEFT JOIN assignments a ON a.id=i.assignment_id LEFT JOIN experts e ON e.id=a.expert_id
      WHERE r.last_import_id=? AND (
        (i.src_status IN ('بسته شده') AND i.state<>'closed') OR (i.src_status='متوقف شده' AND i.state<>'stop') OR
        (i.src_status='معلق' AND i.state<>'hold') OR (i.src_status IN ('ثبت شده','تایید شده','در جریان','بررسی مجدد') AND i.state IN ('closed','stop')))
      LIMIT 500`).bind(importId).all()).results || [];
  out.stateDrift = drift;
  /* ۳) کارشناسِ فایل با کارشناسِ ارجاع‌شده در سامانه فرق دارد */
  const ed = (await env.DB.prepare(`SELECT i.id, i.request_id, i.title, i.src_expert, e.name AS expert
      FROM items i JOIN requests r ON r.id=i.request_id JOIN assignments a ON a.id=i.assignment_id JOIN experts e ON e.id=a.expert_id
      WHERE r.last_import_id=? AND i.src_expert IS NOT NULL AND i.src_expert<>'' LIMIT 500`).bind(importId).all()).results || [];
  out.expertDrift = ed.filter((x) => nrm(x.src_expert) !== nrm(x.expert));
  await env.DB.batch([ev(env, "manager", "import", null, null, { import_id: importId, closeCandidates: out.closeCandidates.length, stateDrift: out.stateDrift.length, expertDrift: out.expertDrift.length })]);
  return out;
}

/* اعمال تأییدشده‌ها */
async function importApply(env, body) {
  const t = now(); const stmts = [];
  for (const rid of (body.closeRequests || []).map(T).filter(Boolean)) {
    stmts.push(env.DB.prepare("UPDATE items SET state='closed', state_at=? WHERE request_id=? AND state IN ('open','hold')").bind(t, rid));
    stmts.push(ev(env, "manager", "close", rid, null, { source: "import" }));
  }
  for (const it of body.items || []) {
    const id = int(it.id), st = it.state; if (!id || !["open", "hold", "stop", "closed"].includes(st)) continue;
    stmts.push(env.DB.prepare("UPDATE items SET state=?, state_at=? WHERE id=?").bind(st, t, id));
    stmts.push(ev(env, "manager", st, null, id, { source: "import" }));
  }
  for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* میز ارجاع مدیر                                                        */
/* ------------------------------------------------------------------ */
/* پارامترها:
   from   = تاریخ شمسی yyyy/mm/dd — فقط درخواست‌های از این تاریخ (بازهٔ میز؛ مقایسهٔ متنی روی تاریخ صفرپَد)
   id     = جستجوی مستقیم یک شماره درخواست، خارج از بازه و فارغ از باز/بسته
   limit/offset = صفحه‌بندی برای بازه‌های بزرگ؛ total برای نمایش «n از m» برمی‌گردد
   scope  = open (پیش‌فرض: قلم باز دارد یا در ۳۰ روز اخیر ارسال شده) | all */
async function desk(env, url) {
  const from = T(url.searchParams.get("from")), id = T(url.searchParams.get("id"));
  const scope = url.searchParams.get("scope") || "open";
  const limit = Math.min(1000, Math.max(20, int(url.searchParams.get("limit"), 300)));
  const offset = Math.max(0, int(url.searchParams.get("offset"), 0));
  const conds = [], args = [];
  const scopeSql = "r.id IN (SELECT request_id FROM items WHERE state IN ('open','hold') UNION SELECT request_id FROM assignments WHERE dispatched_at > ?)";
  if (id) { conds.push("r.id=?"); args.push(id); }
  else {
    if (scope !== "all") { conds.push(scopeSql); args.push(now() - 30 * DAY); }
    if (from) { conds.push("r.date >= ?"); args.push(from); }
  }
  const where = conds.length ? conds.join(" AND ") : "1=1";
  const totalRow = await env.DB.prepare(`SELECT COUNT(*) AS n FROM requests r WHERE ${where}`).bind(...args).first();
  const total = totalRow ? totalRow.n : 0;
  // all_total: همان شمارش بدون فیلتر تاریخ — تا وقتی بازهٔ انتخابی خالی است، پنل به‌جای
  // «فایلی بارگذاری نشده» بگوید درخواست‌ها در تاریخ‌های قدیمی‌تر هستند
  let all_total = total;
  if (from && !id) { const a = await env.DB.prepare(`SELECT COUNT(*) AS n FROM requests r WHERE ${scope !== "all" ? scopeSql : "1=1"}`).bind(...(scope !== "all" ? [now() - 30 * DAY] : [])).first(); all_total = a ? a.n : total; }
  const reqs = (await env.DB.prepare(`SELECT r.*, im.imported_at AS imported_at FROM requests r LEFT JOIN imports im ON im.id=r.first_import_id WHERE ${where} ORDER BY r.date DESC, r.id DESC LIMIT ? OFFSET ?`).bind(...args, limit, offset).all()).results || [];
  if (!reqs.length) return { requests: [], total, all_total, limit, offset, experts: await listExperts(env), settings: await getSettings(env) };
  const ids = reqs.map((r) => r.id);
  const items = [], assigns = [];
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90), q = part.map(() => "?").join(",");
    items.push(...((await env.DB.prepare(`SELECT * FROM items WHERE request_id IN (${q}) ORDER BY request_id, line_no`).bind(...part).all()).results || []));
    assigns.push(...((await env.DB.prepare(`SELECT a.*, e.name AS expert_name, e.label AS expert_label,
        (SELECT COUNT(*) FROM quotes q WHERE q.assignment_id=a.id AND q.saved=1) AS quote_count,
        (SELECT COUNT(*) FROM proformas p WHERE p.assignment_id=a.id) AS proforma_count
      FROM assignments a JOIN experts e ON e.id=a.expert_id WHERE a.request_id IN (${q})`).bind(...part).all()).results || []));
  }
  const byReq = new Map(reqs.map((r) => [r.id, { ...r, items: [], assignments: [] }]));
  items.forEach((i) => byReq.get(i.request_id)?.items.push(i));
  assigns.forEach((a) => byReq.get(a.request_id)?.assignments.push(a));
  return { requests: [...byReq.values()], total, all_total, limit, offset, experts: await listExperts(env), settings: await getSettings(env) };
}

async function listExperts(env) {
  return (await env.DB.prepare(`SELECT e.id,e.name,e.label,e.code,e.active,e.speed,e.telegram_chat,
      (SELECT COUNT(DISTINCT a.id) FROM assignments a JOIN items i ON i.assignment_id=a.id WHERE a.expert_id=e.id AND a.dispatched_at IS NOT NULL AND a.commission_at IS NULL AND i.state IN ('open','hold')) AS open_load
    FROM experts e ORDER BY e.active DESC, e.name`).all()).results || [];
}

/* ارجاع: (درخواست، کارشناس) → اقلام */
async function assign(env, body) {
  const rid = T(body.request_id), eid = int(body.expert_id);
  if (!rid) throw new HttpError("request_id لازم است.");
  const t = now();
  if (!eid) {
    /* حذف کارشناس از اقلام ارسال‌نشده */
    await env.DB.prepare(`UPDATE items SET assignment_id=NULL WHERE request_id=? AND assignment_id IN (SELECT id FROM assignments WHERE request_id=? AND dispatched_at IS NULL)`).bind(rid, rid).run();
    await env.DB.prepare("DELETE FROM assignments WHERE request_id=? AND dispatched_at IS NULL AND id NOT IN (SELECT DISTINCT assignment_id FROM items WHERE assignment_id IS NOT NULL)").bind(rid).run();
    return { ok: true };
  }
  const ex = await env.DB.prepare("SELECT id FROM experts WHERE id=? AND active=1").bind(eid).first();
  if (!ex) throw new HttpError("کارشناس معتبر نیست.");
  let a = await env.DB.prepare("SELECT * FROM assignments WHERE request_id=? AND expert_id=?").bind(rid, eid).first();
  if (!a) {
    const r = await env.DB.prepare("INSERT INTO assignments (request_id,expert_id,days,created_at) VALUES (?,?,?,?)").bind(rid, eid, int(body.days), t).run();
    a = { id: r.meta.last_row_id };
  } else if (body.days !== undefined && !a.dispatched_at) {
    await env.DB.prepare("UPDATE assignments SET days=? WHERE id=?").bind(int(body.days), a.id).run();
  }
  const itemIds = Array.isArray(body.item_ids) ? body.item_ids.map((x) => int(x)).filter(Boolean) : null;
  if (itemIds && itemIds.length) {
    await env.DB.prepare(`UPDATE items SET assignment_id=? WHERE request_id=? AND state IN ('open','hold') AND id IN (${itemIds.map(() => "?").join(",")})
      AND (assignment_id IS NULL OR assignment_id IN (SELECT id FROM assignments WHERE dispatched_at IS NULL))`).bind(a.id, rid, ...itemIds).run();
  } else {
    /* پیش‌فرض: همهٔ اقلام باز که هنوز ارسال نشده‌اند */
    await env.DB.prepare(`UPDATE items SET assignment_id=? WHERE request_id=? AND state IN ('open','hold')
      AND (assignment_id IS NULL OR assignment_id IN (SELECT id FROM assignments WHERE dispatched_at IS NULL))`).bind(a.id, rid).run();
  }
  /* ارجاع‌های ارسال‌نشدهٔ بی‌قلم پاک می‌شوند */
  await env.DB.prepare("DELETE FROM assignments WHERE request_id=? AND dispatched_at IS NULL AND id NOT IN (SELECT DISTINCT assignment_id FROM items WHERE assignment_id IS NOT NULL)").bind(rid).run();
  return { ok: true, assignment_id: a.id };
}

async function setDays(env, body) {
  const aid = int(body.assignment_id); if (!aid) throw new HttpError("assignment_id لازم است.");
  const a = await env.DB.prepare("SELECT dispatched_at FROM assignments WHERE id=?").bind(aid).first();
  if (!a) throw new HttpError("ارجاع پیدا نشد.", 404);
  if (a.dispatched_at) throw new HttpError("مهلتِ ارجاعِ ارسال‌شده از اینجا تغییر نمی‌کند؛ از «تغییر کارشناس» استفاده کنید.");
  await env.DB.prepare("UPDATE assignments SET days=? WHERE id=?").bind(int(body.days), aid).run();
  return { ok: true };
}

/* ارسال: ساعت‌شمار شروع می‌شود + رویداد اعلان برای هر کارشناس */
async function dispatch(env, body) {
  const ids = (body.assignment_ids || []).map((x) => int(x)).filter(Boolean);
  if (!ids.length) throw new HttpError("هیچ ارجاعی انتخاب نشده.");
  const rows = (await env.DB.prepare(`SELECT a.*, e.name, e.label, e.telegram_chat, r.party,
      (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id) AS item_count
    FROM assignments a JOIN experts e ON e.id=a.expert_id JOIN requests r ON r.id=a.request_id
    WHERE a.id IN (${ids.map(() => "?").join(",")}) AND a.dispatched_at IS NULL AND a.days>0`).bind(...ids).all()).results || [];
  const t = now(); const stmts = []; let notified = 0;
  /* آستانه‌ها و تعطیلات یک بار خوانده می‌شوند و برای همهٔ ارجاع‌های این دسته به کار می‌روند */
  const [settings, isHoliday] = rows.length ? await Promise.all([getSettings(env), holidayFn(env)]) : [null, null];
  for (const a of rows) {
    stmts.push(env.DB.prepare("UPDATE assignments SET dispatched_at=? WHERE id=?").bind(t, a.id));
    const sched = alertStatements(env, a, settings.thresholds, isHoliday, t);
    stmts.push(...sched);
    /* اعلان «ارجاع جدید» (TG-06). مهلت را از همان زمان‌بندیِ تازه‌ساخته برمی‌داریم
       چون ستون deadline_at هنوز در همین batch نوشته نشده است. */
    if (a.telegram_chat) {
      stmts.push(queueStmt(env, `dispatch:${a.id}`, a.telegram_chat,
        dispatchText({ ...a, dispatched_at: t, deadline_at: alertSchedule(t, a.days, settings.thresholds, isHoliday).deadlineAt }),
        [[{ text: "✅ مشاهده کردم", callback_data: `seen:a:${a.id}` }], [{ text: "باز کردن پنل", url: "https://arianaai.website/tamin-poshtibani/expert" }]]));
      notified++;
    }
    stmts.push(ev(env, "manager", "dispatch", a.request_id, null, { assignment_id: a.id, expert_id: a.expert_id, expert: a.name, days: a.days, notify: a.telegram_chat ? "telegram" : "none" }));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return { ok: true, dispatched: rows.length, notified };
}

/* تغییر کارشناس: ارجاع جدید، انتقال اقلام و کارهای انجام‌شده، ساعت‌شمار از نو */
async function reassign(env, body) {
  const aid = int(body.assignment_id), eid = int(body.expert_id);
  const a = await env.DB.prepare("SELECT * FROM assignments WHERE id=?").bind(aid).first();
  if (!a) throw new HttpError("ارجاع پیدا نشد.", 404);
  if (a.expert_id === eid) return { ok: true, assignment_id: aid };
  const t = now();
  let b = await env.DB.prepare("SELECT * FROM assignments WHERE request_id=? AND expert_id=?").bind(a.request_id, eid).first();
  if (!b) { const r = await env.DB.prepare("INSERT INTO assignments (request_id,expert_id,days,dispatched_at,created_at) VALUES (?,?,?,?,?)").bind(a.request_id, eid, int(body.days, a.days), a.dispatched_at ? t : null, t).run(); b = { id: r.meta.last_row_id, days: int(body.days, a.days) }; }
  /* ساعت‌شمار کارشناس جدید از نو شروع می‌شود، پس زمان‌بندی هشدارها هم از نو ساخته می‌شود */
  const fresh = a.dispatched_at
    ? alertStatements(env, { id: b.id, days: int(body.days, b.days || a.days) }, (await getSettings(env)).thresholds, await holidayFn(env), t)
    : [];
  await env.DB.batch([
    env.DB.prepare("UPDATE items SET assignment_id=? WHERE assignment_id=?").bind(b.id, aid),
    env.DB.prepare("UPDATE quotes SET assignment_id=? WHERE assignment_id=?").bind(b.id, aid),
    env.DB.prepare("UPDATE proformas SET assignment_id=? WHERE assignment_id=? AND supplier_name NOT IN (SELECT supplier_name FROM proformas WHERE assignment_id=?)").bind(b.id, aid, b.id),
    env.DB.prepare("UPDATE alerts SET canceled_at=? WHERE assignment_id=? AND fired_at IS NULL").bind(t, aid),
    env.DB.prepare("DELETE FROM assignments WHERE id=?").bind(aid),
    ev(env, "manager", "reassign", a.request_id, null, { from_expert_id: a.expert_id, to_expert_id: eid, notify: "telegram" }),
    ...fresh,
  ]);
  return { ok: true, assignment_id: b.id };
}

/* تعلیق / توقف / خاتمه / بازگشت — مدیر */
async function setState(env, body, actor) {
  const st = body.state; if (!["open", "hold", "stop", "closed"].includes(st)) throw new HttpError("state نامعتبر است.");
  const t = now(); let res;
  if (Array.isArray(body.item_ids) && body.item_ids.length) {
    const ids = body.item_ids.map((x) => int(x)).filter(Boolean);
    res = await env.DB.prepare(`UPDATE items SET state=?, state_at=? WHERE id IN (${ids.map(() => "?").join(",")})`).bind(st, t, ...ids).run();
  } else if (body.assignment_id) {
    res = await env.DB.prepare("UPDATE items SET state=?, state_at=? WHERE assignment_id=? AND state<>'closed'").bind(st, t, int(body.assignment_id)).run();
  } else if (body.request_id) {
    res = await env.DB.prepare("UPDATE items SET state=?, state_at=? WHERE request_id=? AND state<>'closed'").bind(st, t, T(body.request_id)).run();
  } else throw new HttpError("request_id یا assignment_id یا item_ids لازم است.");
  await env.DB.batch([ev(env, actor, st, T(body.request_id) || null, null, { assignment_id: body.assignment_id || null, item_ids: body.item_ids || null, notify: "telegram" })]);
  return { ok: true, changed: res.meta.changes };
}

/* ------------------------------------------------------------------ */
/* پنل کارشناس                                                          */
/* ------------------------------------------------------------------ */
async function tray(env, ex) {
  /* ارجاع‌های ارسال‌شده که حداقل یک قلم باز دارند (معلق/متوقف/بسته در کارتابل نیستند) */
  const rows = (await env.DB.prepare(`SELECT a.*, r.date, r.party, r.party_type, r.center,
      (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id) AS item_count,
      (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id AND i.state='open') AS open_count,
      (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id AND i.hist_done_at IS NOT NULL) AS hist_count,
      (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id AND i.smart_done_at IS NOT NULL) AS smart_count,
      (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id AND i.commission_ok=1) AS ok_count,
      (SELECT COUNT(*) FROM quotes q WHERE q.assignment_id=a.id AND q.saved=1) AS quote_count,
      (SELECT COUNT(*) FROM proformas p WHERE p.assignment_id=a.id) AS proforma_count
    FROM assignments a JOIN requests r ON r.id=a.request_id
    WHERE a.expert_id=? AND a.dispatched_at IS NOT NULL
      AND EXISTS (SELECT 1 FROM items i WHERE i.assignment_id=a.id AND i.state='open')
    ORDER BY a.dispatched_at DESC`).bind(ex.id).all()).results || [];
  return { assignments: rows, settings: await getSettings(env) };
}

async function assignmentDetail(env, aid, who) {
  const a = await env.DB.prepare("SELECT a.*, e.name AS expert_name, e.label AS expert_label FROM assignments a JOIN experts e ON e.id=a.expert_id WHERE a.id=?").bind(aid).first();
  if (!a) throw new HttpError("ارجاع پیدا نشد.", 404);
  if (who.role === "expert" && a.expert_id !== who.expert.id) throw new HttpError("این ارجاع متعلق به شما نیست.", 403);
  const request = await env.DB.prepare("SELECT * FROM requests WHERE id=?").bind(a.request_id).first();
  const items = (await env.DB.prepare("SELECT * FROM items WHERE assignment_id=? ORDER BY line_no").bind(aid).all()).results || [];
  const quotes = (await env.DB.prepare("SELECT * FROM quotes WHERE assignment_id=? ORDER BY id").bind(aid).all()).results || [];
  const proformas = (await env.DB.prepare("SELECT * FROM proformas WHERE assignment_id=?").bind(aid).all()).results || [];
  const decisions = (await env.DB.prepare("SELECT * FROM decisions WHERE assignment_id=? AND approved_at IS NULL AND rejected_at IS NULL").bind(aid).all()).results || [];
  return { assignment: a, request, items, quotes, proformas, pendingDecisions: decisions, settings: await getSettings(env) };
}

async function markProgress(env, ex, itemId, stage) {
  const it = await env.DB.prepare("SELECT i.id FROM items i JOIN assignments a ON a.id=i.assignment_id WHERE i.id=? AND a.expert_id=?").bind(itemId, ex.id).first();
  if (!it) throw new HttpError("قلم متعلق به شما نیست.", 403);
  const col = stage === "hist" ? "hist_done_at" : stage === "smart" ? "smart_done_at" : null;
  if (!col) throw new HttpError("stage باید hist یا smart باشد.");
  await env.DB.prepare(`UPDATE items SET ${col}=COALESCE(${col},?) WHERE id=?`).bind(now(), itemId).run();
  return { ok: true };
}

/* استعلام‌ها */
const QUOTE_FIELDS = ["supplier_name", "supplier_code", "spec", "unit", "qty", "price", "dtime", "valid_days", "ship", "invoice", "pay", "deal", "place", "place_other", "final", "low_conf", "item_id"];
const QUOTE_REQUIRED = ["spec", "unit", "qty", "price", "dtime", "valid_days", "ship", "pay", "deal", "invoice", "place"];
async function ownAssignment(env, ex, aid) {
  const a = await env.DB.prepare("SELECT id FROM assignments WHERE id=? AND expert_id=?").bind(aid, ex.id).first();
  if (!a) throw new HttpError("ارجاع متعلق به شما نیست.", 403);
}
async function quoteCreate(env, ex, body) {
  const aid = int(body.assignment_id), item = int(body.item_id); await ownAssignment(env, ex, aid);
  if (!item) throw new HttpError("item_id لازم است.");
  const dup = await env.DB.prepare("SELECT id FROM quotes WHERE assignment_id=? AND item_id=? AND supplier_name=?").bind(aid, item, T(body.supplier_name)).first();
  if (dup) throw new HttpError("این تأمین‌کننده برای همین قلم قبلاً اضافه شده است.", 409);
  const it = await env.DB.prepare("SELECT unit,qty FROM items WHERE id=?").bind(item).first();
  const t = now();
  const r = await env.DB.prepare(`INSERT INTO quotes (assignment_id,item_id,supplier_name,supplier_code,spec,unit,qty,price,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .bind(aid, item, T(body.supplier_name), T(body.supplier_code) || null, T(body.spec) || null, T(body.unit) || (it && it.unit) || null, num(body.qty) ?? (it && it.qty) ?? null, num(body.price), t, t).run();
  return { ok: true, id: r.meta.last_row_id };
}
async function quoteUpdate(env, ex, id, body) {
  const q = await env.DB.prepare("SELECT q.* FROM quotes q JOIN assignments a ON a.id=q.assignment_id WHERE q.id=? AND a.expert_id=?").bind(id, ex.id).first();
  if (!q) throw new HttpError("استعلام پیدا نشد.", 404);
  const sets = [], args = [];
  for (const f of QUOTE_FIELDS) if (f in body) { sets.push(`${f}=?`); args.push(["qty", "price"].includes(f) ? num(body[f]) : ["final", "low_conf", "item_id"].includes(f) ? int(body[f], 0) : (T(body[f]) || null)); }
  /* هر ویرایشِ فیلد، «ثبت موقت» را برمی‌دارد؛ save صریح آن را می‌گذارد */
  if (body.save === true) {
    const merged = { ...q, ...body };
    const miss = QUOTE_REQUIRED.filter((f) => !T(merged[f]));
    if (T(merged.place) === "سایر" && !T(merged.place_other)) miss.push("place_other");
    if (miss.length) throw new HttpError("این فیلدها خالی‌اند و ثبت موقت انجام نشد.", 422, { missing: miss });
    sets.push("saved=1");
  } else if (sets.length) sets.push("saved=0");
  if (!sets.length) return { ok: true };
  sets.push("updated_at=?"); args.push(now(), id);
  await env.DB.prepare(`UPDATE quotes SET ${sets.join(",")} WHERE id=?`).bind(...args).run();
  return { ok: true };
}
async function quoteDelete(env, ex, id) {
  const r = await env.DB.prepare("DELETE FROM quotes WHERE id=? AND assignment_id IN (SELECT id FROM assignments WHERE expert_id=?)").bind(id, ex.id).run();
  return { ok: true, deleted: r.meta.changes };
}

/* جدول کمیسیون: نگهبان حداقل استعلام برای هر قلم + حداقل یک تأیید نهایی */
async function commission(env, ex, aid) {
  await ownAssignment(env, ex, aid);
  const s = await getSettings(env);
  const items = (await env.DB.prepare("SELECT id,title FROM items WHERE assignment_id=? AND state='open'").bind(aid).all()).results || [];
  const counts = (await env.DB.prepare("SELECT item_id, COUNT(*) AS n FROM quotes WHERE assignment_id=? AND saved=1 GROUP BY item_id").bind(aid).all()).results || [];
  const byItem = new Map(counts.map((c) => [c.item_id, c.n]));
  const miss = items.filter((i) => (byItem.get(i.id) || 0) < s.minSuppliers).map((i) => ({ title: i.title, n: byItem.get(i.id) || 0 }));
  const fin = await env.DB.prepare("SELECT COUNT(*) AS n FROM quotes WHERE assignment_id=? AND saved=1 AND final=1").bind(aid).first();
  if (!fin || !fin.n) throw new HttpError("حداقل یک استعلام باید تیک «تأیید نهایی» بخورد.", 422, { missing: miss, need: s.minSuppliers });
  if (miss.length) throw new HttpError(`مدیر حداقل ${s.minSuppliers} استعلام برای هر قلم را الزامی کرده.`, 422, { missing: miss, need: s.minSuppliers });
  await env.DB.batch([env.DB.prepare("UPDATE assignments SET commission_at=COALESCE(commission_at,?) WHERE id=?").bind(now(), aid), ev(env, `expert:${ex.id}`, "commission", null, null, { assignment_id: aid })]);
  return { ok: true };
}

/* تصمیم کارشناس: تعلیق/توقف/خاتمه — یا مستقیم اعمال، یا در انتظار تأیید مدیر */
async function expertDecision(env, ex, aid, body) {
  await ownAssignment(env, ex, aid);
  const action = body.action; if (!["hold", "stop", "end"].includes(action)) throw new HttpError("action نامعتبر است.");
  const s = await getSettings(env);
  const a = await env.DB.prepare("SELECT request_id FROM assignments WHERE id=?").bind(aid).first();
  const payload = { item_ids: body.item_ids || null };
  if (s.approvalRequired) {
    const r = await env.DB.prepare("INSERT INTO decisions (assignment_id,expert_id,action,payload_json,requested_at) VALUES (?,?,?,?,?)").bind(aid, ex.id, action, JSON.stringify(payload), now()).run();
    await env.DB.batch([ev(env, `expert:${ex.id}`, "decision_requested", a.request_id, null, { decision_id: r.meta.last_row_id, action, notify: "telegram" })]);
    return { ok: true, pending: true, decision_id: r.meta.last_row_id };
  }
  await applyDecision(env, `expert:${ex.id}`, aid, action, payload);
  return { ok: true, pending: false };
}
async function applyDecision(env, actor, aid, action, payload) {
  const t = now();
  if (action === "end") {
    /* خاتمه: فقط اقلامی که کمیسیون تأییدشان کرده بسته می‌شوند؛ بقیه باز می‌مانند (خاتمهٔ جزئی) */
    const ids = Array.isArray(payload && payload.item_ids) && payload.item_ids.length ? payload.item_ids.map((x) => int(x)).filter(Boolean) : null;
    if (ids) await env.DB.prepare(`UPDATE items SET state='closed', state_at=? WHERE assignment_id=? AND id IN (${ids.map(() => "?").join(",")})`).bind(t, aid, ...ids).run();
    else await env.DB.prepare("UPDATE items SET state='closed', state_at=? WHERE assignment_id=? AND commission_ok=1").bind(t, aid).run();
  } else {
    await env.DB.prepare("UPDATE items SET state=?, state_at=? WHERE assignment_id=? AND state='open'").bind(action, t, aid).run();
  }
  const a = await env.DB.prepare("SELECT request_id FROM assignments WHERE id=?").bind(aid).first();
  await env.DB.batch([ev(env, actor, action === "end" ? "close" : action, a && a.request_id, null, { assignment_id: aid, notify: "telegram" })]);
}

/* ------------------------------------------------------------------ */
/* مشترک: کانال‌ها، قالب‌ها، امتیازها                                     */
/* ------------------------------------------------------------------ */
async function channelsGet(env, url) {
  const title = url.searchParams.get("item_title");
  const rows = title ? (await env.DB.prepare("SELECT * FROM supplier_channels WHERE item_title=?").bind(title).all()).results
    : (await env.DB.prepare("SELECT * FROM supplier_channels ORDER BY updated_at DESC LIMIT 2000").all()).results;
  return { channels: rows || [] };
}
async function channelsPut(env, who, body) {
  const st = body.state; if (!["ok", "no", "unk"].includes(st)) throw new HttpError("state باید ok/no/unk باشد.");
  await env.DB.prepare(`INSERT INTO supplier_channels (supplier_code,item_title,platform,state,updated_by,updated_at) VALUES (?,?,?,?,?,?)
    ON CONFLICT(supplier_code,item_title,platform) DO UPDATE SET state=excluded.state, updated_by=excluded.updated_by, updated_at=excluded.updated_at`)
    .bind(T(body.supplier_code), T(body.item_title), T(body.platform), st, who.expert ? who.expert.id : null, now()).run();
  return { ok: true };
}
async function templatesList(env, who) {
  const rows = (await env.DB.prepare("SELECT * FROM templates WHERE expert_id IS NULL OR expert_id=? ORDER BY id").bind(who.expert ? who.expert.id : -1).all()).results || [];
  return { templates: rows };
}
async function scoresGet(env) {
  const scores = (await env.DB.prepare("SELECT * FROM expert_scores").all()).results || [];
  const weights = (await env.DB.prepare("SELECT * FROM weights").all()).results || [];
  return { scores, weights };
}
async function scoresPut(env, body) {
  const stmts = [];
  for (const s of body.scores || []) stmts.push(env.DB.prepare("INSERT INTO expert_scores (expert_id,kind,key,score) VALUES (?,?,?,?) ON CONFLICT(expert_id,kind,key) DO UPDATE SET score=excluded.score").bind(int(s.expert_id), T(s.kind), T(s.key), Math.max(0, Math.min(5, int(s.score, 0)))));
  for (const w of body.weights || []) stmts.push(env.DB.prepare("INSERT INTO weights (kind,key,w) VALUES (?,?,?) ON CONFLICT(kind,key) DO UPDATE SET w=excluded.w").bind(T(w.kind), T(w.key), Number(w.w) || 1));
  for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
  return scoresGet(env);
}

/* زیرساخت اتصال‌های خارجی — هنوز وصل نشده؛ پاسخ ساخت‌یافته تا UI برچسب «در انتظار اتصال» بزند */
const NOT_CONNECTED = (what) => json({ available: false, message: `${what} هنوز به سامانه وصل نشده است؛ زیرساختش آماده است و در مرحلهٔ بعد فعال می‌شود.` }, 200);

/* ------------------------------------------------------------------ */
/* روتر                                                                 */
/* ------------------------------------------------------------------ */
async function route(request, env, ctx) {
  const url = new URL(request.url);
  let path = url.pathname.startsWith(PREFIX) ? url.pathname.slice(PREFIX.length) : url.pathname;
  if (!path.startsWith("/")) path = "/" + path;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  const m = request.method.toUpperCase();

  if (m === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": url.origin, "access-control-allow-headers": "content-type,x-manager-code,x-expert-code,x-role", "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS" } });

  try {
    await ensureSchema(env);

    if (path === "/health") return json({ ok: true, schema: true, time: now(), managerConfigured: !!env.MANAGER_CODE, botConfigured: !!env.TG_BOT_TOKEN, storage: storageInfo(env) });

    /* ---------- بات تلگرام ---------- */

    /* وبهوک: تلگرام صدا می‌زند، نه کاربر. احراز هویت با هدر رازِ setWebhook انجام
       می‌شود و بس. همیشه ۲۰۰ برمی‌گردد — هر چیز دیگری باعث می‌شود تلگرام همان
       آپدیت را بارها دوباره بفرستد. */
    if (path === "/tg/webhook" && m === "POST") {
      if (!env.TG_WEBHOOK_SECRET || request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TG_WEBHOOK_SECRET) {
        return new Response("forbidden", { status: 403 });
      }
      const u = await request.json().catch(() => null);
      if (!u || !u.update_id) return json({ ok: true });
      /* آپدیت تکراری (تلگرام در صورت نگرفتن ۲۰۰ دوباره می‌فرستد) دوبار اجرا نشود */
      const fresh = await env.DB.prepare("INSERT INTO tg_seen (update_id,seen_at) VALUES (?,?) ON CONFLICT(update_id) DO NOTHING").bind(u.update_id, now()).run();
      if (!fresh.meta.changes) return json({ ok: true, duplicate: true });
      await handleUpdate(env, u);
      return json({ ok: true });
    }

    /* کارشناس لینک اتصال می‌گیرد (TG-03) */
    if (path === "/tg/link" && m === "POST") {
      const ex = await requireExpert(request, env);
      if (!env.TG_BOT_TOKEN) return NOT_CONNECTED("بات تلگرام");
      return json(await makeLink(env, ex.id));
    }
    if (path === "/tg/status" && m === "GET") {
      const who = await requireAny(request, env);
      if (who.expert) {
        const e = await env.DB.prepare("SELECT telegram_chat FROM experts WHERE id=?").bind(who.expert.id).first();
        return json({ connected: !!(e && e.telegram_chat), botConfigured: !!env.TG_BOT_TOKEN, bot: env.TG_BOT_USERNAME || null });
      }
      const rows = (await env.DB.prepare("SELECT id,name,label,telegram_chat FROM experts WHERE active=1 ORDER BY name").all()).results || [];
      const mgr = await env.DB.prepare("SELECT value FROM settings WHERE key='managerChat'").first();
      return json({
        botConfigured: !!env.TG_BOT_TOKEN, bot: env.TG_BOT_USERNAME || null,
        managerChannel: mgr ? JSON.parse(mgr.value) : null,
        experts: rows.map((r) => ({ id: r.id, name: r.name, label: r.label, connected: !!r.telegram_chat })),
        outbox: (await env.DB.prepare("SELECT status, COUNT(*) AS n FROM outbox GROUP BY status").all()).results || [],
      });
    }
    /* مدیر: ثبت/بررسی وبهوک روی تلگرام */
    if (path === "/tg/setup" && m === "POST") {
      requireManager(request, env);
      if (!env.TG_BOT_TOKEN || !env.TG_WEBHOOK_SECRET) return NOT_CONNECTED("بات تلگرام");
      const api = telegram(env);
      await api.setWebhook(`${url.origin}${PREFIX}/tg/webhook`, env.TG_WEBHOOK_SECRET);
      return json({ ok: true, me: await api.getMe(), webhook: await api.getWebhookInfo() });
    }
    if (path === "/tg/setup" && m === "GET") {
      requireManager(request, env);
      if (!env.TG_BOT_TOKEN) return NOT_CONNECTED("بات تلگرام");
      const api = telegram(env);
      return json({ me: await api.getMe(), webhook: await api.getWebhookInfo() });
    }
    /* اجرای دستی چرخهٔ هشدار — برای تست؛ همان کاری که Cron می‌کند */
    if (path === "/tg/tick" && m === "POST") { requireManager(request, env); return json(await scheduled(env)); }

    /* --- ورود --- */
    if (path === "/login" && m === "POST") {
      const b = await readJson(request);
      if (b.role === "manager") { requireManager({ headers: new Headers({ "X-Manager-Code": T(b.code) }) }, env); return json({ role: "manager" }); }
      const ex = await env.DB.prepare("SELECT id,name,label,code FROM experts WHERE code=? AND active=1").bind(T(b.code)).first();
      if (!ex) throw new HttpError("کد کارشناسی معتبر نیست.", 401);
      return json({ role: "expert", expert: ex });
    }
    if (path === "/me") { const who = await requireAny(request, env); return json(who); }

    /* --- تنظیمات و کارشناسان --- */
    if (path === "/settings" && m === "GET") { await requireAny(request, env); return json(await getSettings(env)); }
    if (path === "/settings" && m === "PUT") { requireManager(request, env); return json(await putSettings(env, await readJson(request))); }
    if (path === "/experts" && m === "GET") { await requireAny(request, env); return json({ experts: await listExperts(env) }); }

    /* تعطیلات رسمی (SLA-01) — بدون این، مهلت‌ها وسط نوروز هم می‌شمارند */
    if (path === "/holidays" && m === "GET") { await requireAny(request, env); return json({ holidays: (await env.DB.prepare("SELECT * FROM holidays ORDER BY date_j").all()).results || [] }); }
    if (path === "/holidays" && m === "PUT") {
      requireManager(request, env);
      const b = await readJson(request); const list = Array.isArray(b.holidays) ? b.holidays : [];
      const t = now(); const bad = [];
      const rows = list.map((h) => {
        const raw = typeof h === "string" ? h : h && h.date_j;
        const d = jNorm(raw);
        if (!jValid(d)) { bad.push(raw); return null; }
        return [d, T(typeof h === "string" ? "" : h.title) || null];
      }).filter(Boolean);
      if (bad.length) throw new HttpError(`تاریخ نامعتبر: ${bad.slice(0, 5).join("، ")}`);
      const stmts = [env.DB.prepare("DELETE FROM holidays")];
      for (const [d, title] of rows) stmts.push(env.DB.prepare("INSERT OR REPLACE INTO holidays (date_j,title,updated_at) VALUES (?,?,?)").bind(d, title, t));
      await env.DB.batch(stmts);
      holidayCache = null; /* کش این isolate باطل می‌شود؛ بقیه حداکثر ۵ دقیقه بعد تازه می‌شوند */
      return json({ ok: true, count: rows.length });
    }
    let mm;
    if ((mm = /^\/experts\/(\d+)$/.exec(path)) && m === "PUT") {
      requireManager(request, env); const b = await readJson(request); const sets = [], args = [];
      if ("speed" in b) { sets.push("speed=?"); args.push(Number(b.speed) || 1); }
      if ("active" in b) { sets.push("active=?"); args.push(b.active ? 1 : 0); }
      if ("telegram_chat" in b) { sets.push("telegram_chat=?"); args.push(T(b.telegram_chat) || null); }
      if (sets.length) { args.push(int(mm[1])); await env.DB.prepare(`UPDATE experts SET ${sets.join(",")} WHERE id=?`).bind(...args).run(); }
      return json({ ok: true });
    }
    if (path === "/scores" && m === "GET") { await requireAny(request, env); return json(await scoresGet(env)); }
    if (path === "/scores" && m === "PUT") { requireManager(request, env); return json(await scoresPut(env, await readJson(request))); }

    /* --- بارگذاری اکسل (مدیر) --- */
    if (path === "/import/begin" && m === "POST") { requireManager(request, env); return json(await importBegin(env, await readJson(request))); }
    if (path === "/import/chunk" && m === "POST") { requireManager(request, env); return json(await importChunk(env, await readJson(request))); }
    if (path === "/import/finish" && m === "POST") { requireManager(request, env); return json(await importFinish(env, await readJson(request))); }
    if (path === "/import/apply" && m === "POST") { requireManager(request, env); return json(await importApply(env, await readJson(request))); }
    if (path === "/imports" && m === "GET") { requireManager(request, env); return json({ imports: (await env.DB.prepare("SELECT * FROM imports ORDER BY id DESC LIMIT 30").all()).results || [] }); }

    /* --- میز ارجاع (مدیر) --- */
    if (path === "/desk" && m === "GET") { requireManager(request, env); return json(await desk(env, url)); }
    if (path === "/assign" && m === "POST") { requireManager(request, env); return json(await assign(env, await readJson(request))); }
    if (path === "/assign/days" && m === "POST") { requireManager(request, env); return json(await setDays(env, await readJson(request))); }
    if (path === "/dispatch" && m === "POST") { requireManager(request, env); const r = await dispatch(env, await readJson(request)); flush(env, ctx, r.notified); return json(r); }
    if (path === "/reassign" && m === "POST") { requireManager(request, env); return json(await reassign(env, await readJson(request))); }
    if (path === "/items/state" && m === "POST") { requireManager(request, env); return json(await setState(env, await readJson(request), "manager")); }
    if (path === "/decisions" && m === "GET") { requireManager(request, env); return json({ decisions: (await env.DB.prepare("SELECT d.*, e.name AS expert_name, a.request_id FROM decisions d JOIN experts e ON e.id=d.expert_id JOIN assignments a ON a.id=d.assignment_id WHERE d.approved_at IS NULL AND d.rejected_at IS NULL ORDER BY d.requested_at").all()).results || [] }); }
    if ((mm = /^\/decisions\/(\d+)\/(approve|reject)$/.exec(path)) && m === "POST") {
      requireManager(request, env); const d = await env.DB.prepare("SELECT * FROM decisions WHERE id=? AND approved_at IS NULL AND rejected_at IS NULL").bind(int(mm[1])).first();
      if (!d) throw new HttpError("تصمیم پیدا نشد یا قبلاً رسیدگی شده.", 404);
      if (mm[2] === "approve") { await applyDecision(env, "manager", d.assignment_id, d.action, JSON.parse(d.payload_json || "{}")); await env.DB.prepare("UPDATE decisions SET approved_at=? WHERE id=?").bind(now(), d.id).run(); }
      else await env.DB.prepare("UPDATE decisions SET rejected_at=? WHERE id=?").bind(now(), d.id).run();
      return json({ ok: true });
    }
    if (path === "/events" && m === "GET") { requireManager(request, env); const since = int(url.searchParams.get("since"), 0); return json({ events: (await env.DB.prepare("SELECT * FROM events WHERE at>? ORDER BY at DESC LIMIT 300").bind(since).all()).results || [] }); }

    /* --- پنل کارشناس --- */
    if (path === "/tray" && m === "GET") { const ex = await requireExpert(request, env); return json(await tray(env, ex)); }
    if ((mm = /^\/assignments\/(\d+)$/.exec(path)) && m === "GET") { const who = await requireAny(request, env); return json(await assignmentDetail(env, int(mm[1]), who)); }
    if ((mm = /^\/assignments\/(\d+)\/viewed$/.exec(path)) && m === "POST") { const ex = await requireExpert(request, env); await ownAssignment(env, ex, int(mm[1])); await env.DB.prepare("UPDATE assignments SET viewed_at=COALESCE(viewed_at,?) WHERE id=?").bind(now(), int(mm[1])).run(); return json({ ok: true }); }
    if ((mm = /^\/assignments\/(\d+)\/commission$/.exec(path)) && m === "POST") { const ex = await requireExpert(request, env); return json(await commission(env, ex, int(mm[1]))); }
    if ((mm = /^\/assignments\/(\d+)\/decision$/.exec(path)) && m === "POST") { const ex = await requireExpert(request, env); return json(await expertDecision(env, ex, int(mm[1]), await readJson(request))); }
    if ((mm = /^\/items\/(\d+)\/progress$/.exec(path)) && m === "POST") { const ex = await requireExpert(request, env); const b = await readJson(request); return json(await markProgress(env, ex, int(mm[1]), b.stage)); }
    if ((mm = /^\/items\/(\d+)\/commission$/.exec(path)) && m === "POST") {
      const ex = await requireExpert(request, env); const b = await readJson(request);
      const r = await env.DB.prepare("UPDATE items SET commission_ok=? WHERE id=? AND assignment_id IN (SELECT id FROM assignments WHERE expert_id=?)").bind(b.ok ? 1 : 0, int(mm[1]), ex.id).run();
      if (!r.meta.changes) throw new HttpError("قلم متعلق به شما نیست.", 403); return json({ ok: true });
    }
    if ((mm = /^\/requests\/([^/]+)\/head$/.exec(path)) && m === "PUT") {
      const ex = await requireExpert(request, env); const b = await readJson(request);
      const own = await env.DB.prepare("SELECT 1 FROM assignments WHERE request_id=? AND expert_id=?").bind(decodeURIComponent(mm[1]), ex.id).first();
      if (!own) throw new HttpError("این درخواست به شما ارجاع نشده.", 403);
      await env.DB.prepare("UPDATE requests SET head_req_type=COALESCE(?,head_req_type), head_deal_type=COALESCE(?,head_deal_type), head_site=COALESCE(?,head_site) WHERE id=?")
        .bind(T(b.req_type) || null, T(b.deal_type) || null, b.site !== undefined ? T(b.site) : null, decodeURIComponent(mm[1])).run();
      return json({ ok: true });
    }
    if (path === "/quotes" && m === "POST") { const ex = await requireExpert(request, env); return json(await quoteCreate(env, ex, await readJson(request))); }
    if ((mm = /^\/quotes\/(\d+)$/.exec(path)) && m === "PUT") { const ex = await requireExpert(request, env); return json(await quoteUpdate(env, ex, int(mm[1]), await readJson(request))); }
    if ((mm = /^\/quotes\/(\d+)$/.exec(path)) && m === "DELETE") { const ex = await requireExpert(request, env); return json(await quoteDelete(env, ex, int(mm[1]))); }
    if (path === "/proformas" && m === "POST") {
      const ex = await requireExpert(request, env); const b = await readJson(request); await ownAssignment(env, ex, int(b.assignment_id));
      await env.DB.prepare("INSERT INTO proformas (assignment_id,supplier_name,filename,uploaded_at) VALUES (?,?,?,?) ON CONFLICT(assignment_id,supplier_name) DO UPDATE SET filename=excluded.filename, uploaded_at=excluded.uploaded_at")
        .bind(int(b.assignment_id), T(b.supplier_name), T(b.filename) || null, now()).run();
      return json({ ok: true, stored: false, message: "نام فایل ثبت شد؛ ذخیرهٔ خود فایل (R2) در مرحلهٔ بعد فعال می‌شود." });
    }

    /* بارگذاری فایل پیش‌فاکتور از پنل — همان مسیری که بات هم می‌رود (ADR-0008:
       هر دو ورودی باید یک اعتبارسنجی و یک قاعدهٔ «یک پیش‌فاکتور به ازای هر
       استعلام» را رعایت کنند). بدنه خام و جریانی است تا CPU صرف کدگذاری نشود. */
    if (path === "/proformas/upload" && m === "POST") {
      const ex = await requireExpert(request, env);
      const aid = int(url.searchParams.get("assignment_id"));
      const supplier = T(url.searchParams.get("supplier_name"));
      const filename = T(url.searchParams.get("filename")) || "proforma";
      if (!aid || !supplier) throw new HttpError("assignment_id و supplier_name لازم است.");
      await ownAssignment(env, ex, aid);
      const store = storage(env);
      if (!store) return NOT_CONNECTED("انبار فایل");
      const size = int(request.headers.get("content-length"), 0);
      if (size > MAX_BYTES) throw new HttpError(`حجم فایل بیشتر از ${Math.round(MAX_BYTES / 1048576)} مگابایت است.`, 413);
      const key = storageKey(aid, filename);
      await store.put(key, request.body, { contentType: request.headers.get("content-type") || "application/octet-stream", size: size || undefined });
      const t = now();
      await env.DB.prepare(
        `INSERT INTO proformas (assignment_id,supplier_name,filename,storage_key,mime,size_bytes,source,uploaded_at)
         VALUES (?,?,?,?,?,?,'panel',?)
         ON CONFLICT(assignment_id,supplier_name) DO UPDATE SET filename=excluded.filename, storage_key=excluded.storage_key,
           mime=excluded.mime, size_bytes=excluded.size_bytes, source='panel', uploaded_at=excluded.uploaded_at`,
      ).bind(aid, supplier, filename, key, request.headers.get("content-type") || null, size || null, t).run();
      return json({ ok: true, stored: true, backend: store.backend });
    }
    /* دانلود فایل — فقط کارشناسِ همان ارجاع یا مدیر (INV-11) */
    if ((mm = /^\/proformas\/(\d+)\/file$/.exec(path)) && m === "GET") {
      const who = await requireAny(request, env);
      const p = await env.DB.prepare("SELECT p.*, a.expert_id FROM proformas p JOIN assignments a ON a.id=p.assignment_id WHERE p.id=?").bind(int(mm[1])).first();
      if (!p) throw new HttpError("پیش‌فاکتور پیدا نشد.", 404);
      if (who.expert && p.expert_id !== who.expert.id) throw new HttpError("این پیش‌فاکتور متعلق به شما نیست.", 403);
      const store = storage(env);
      if (!store || !p.storage_key) return NOT_CONNECTED("انبار فایل");
      const f = await store.get(p.storage_key);
      if (!f) throw new HttpError("فایل در انبار پیدا نشد.", 404);
      return new Response(f.body, { headers: {
        "content-type": p.mime || f.contentType || "application/octet-stream",
        "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(p.filename || "proforma")}`,
        "cache-control": "private, no-store",
      } });
    }

    /* --- مشترک --- */
    if (path === "/channels" && m === "GET") { await requireAny(request, env); return json(await channelsGet(env, url)); }
    if (path === "/channels" && m === "PUT") { const who = await requireAny(request, env); return json(await channelsPut(env, who, await readJson(request))); }
    if (path === "/templates" && m === "GET") { const who = await requireAny(request, env); return json(await templatesList(env, who)); }
    if (path === "/templates" && m === "POST") { const who = await requireAny(request, env); const b = await readJson(request); const r = await env.DB.prepare("INSERT INTO templates (expert_id,title,body,created_at) VALUES (?,?,?,?)").bind(b.shared && who.role === "manager" ? null : (who.expert ? who.expert.id : null), T(b.title) || "بدون عنوان", T(b.body), now()).run(); return json({ ok: true, id: r.meta.last_row_id }); }
    if ((mm = /^\/templates\/(\d+)$/.exec(path)) && m === "PUT") { const who = await requireAny(request, env); const b = await readJson(request); await env.DB.prepare("UPDATE templates SET title=?, body=? WHERE id=? AND (expert_id IS NULL OR expert_id=?)").bind(T(b.title) || "بدون عنوان", T(b.body), int(mm[1]), who.expert ? who.expert.id : -1).run(); return json({ ok: true }); }
    if ((mm = /^\/templates\/(\d+)$/.exec(path)) && m === "DELETE") { const who = await requireAny(request, env); await env.DB.prepare("DELETE FROM templates WHERE id=? AND (expert_id=? OR (expert_id IS NULL AND ?=1))").bind(int(mm[1]), who.expert ? who.expert.id : -1, who.role === "manager" ? 1 : 0).run(); return json({ ok: true }); }

    /* --- زیرساخت اتصال‌های خارجی (مرحلهٔ بعد) --- */
    if (path === "/notify/telegram") { await requireAny(request, env); return NOT_CONNECTED("اعلان تلگرام"); }
    if (path === "/notify/email") { await requireAny(request, env); return NOT_CONNECTED("ارسال ایمیل"); }
    if (path === "/search/smart") { await requireAny(request, env); return NOT_CONNECTED("جستجوی هوشمند تأمین‌کننده"); }
    if (path === "/suppliers/history") { await requireAny(request, env); return NOT_CONNECTED("سوابق تأمین‌کنندگان"); }
    if (path === "/reviews") { await requireAny(request, env); return NOT_CONNECTED("خلاصهٔ نظرات خریداران"); }
    if (/^\/proformas\/\d+\/extract$/.test(path)) { await requireAny(request, env); return NOT_CONNECTED("استخراج از پیش‌فاکتور"); }

    return err("مسیر پیدا نشد.", 404);
  } catch (e) {
    if (e instanceof HttpError) return err(e.message, e.status, e.extra);
    return err("خطای داخلی: " + (e && e.message ? e.message : String(e)), 500);
  }
}

/* پیام‌های تازه‌به‌صف‌رفته را همان لحظه می‌فرستد تا کارشناس منتظر تیکِ بعدی Cron نماند.
   بیرون از پاسخ اجرا می‌شود، پس اگر تلگرام کند بود مدیر معطل نمی‌ماند؛ اگر هم
   شکست بخورد، Cron دوباره سراغش می‌رود (صف پابرجاست). */
function flush(env, ctx, when) {
  if (!when || !ctx || !env.TG_BOT_TOKEN) return;
  ctx.waitUntil(drainOutbox(env, 20).catch((e) => console.error("outbox flush", e && e.message)));
}

export { route };
