/**
 * بخش حقوقی (/hoghooghi) — API روی Cloudflare Worker
 *
 * مسیر:  /hoghooghi/api/*          بایندینگ D1: env.DB     راز: env.ANTHROPIC_API_KEY
 *
 * چرا این‌جا و نه تابع Supabase (مهر ۱۴۰۵): تابع لبهٔ Supabase در پلن رایگان بعد از ۱۵۰ ثانیه
 * بی‌اعتنا به کار نیمه‌تمام بسته می‌شود (لاگ: «shutdown reason: WallClockTime») و تحلیل یک قرارداد
 * بلند بیشتر از این طول می‌کشد — همان «بعد از چند دقیقه خطا» که کاربران می‌دیدند. درخواست HTTP در
 * Worker سقف زمانی ندارد تا وقتی مرورگر وصل است، و CPU فقط صرف ساختن درخواست می‌شود: پاسخ جریانی
 * مدل بی‌دست‌خوردگی به مرورگر می‌رود و فایل‌ها جریانی به Files API انتروپیک. ساختن فایل Word
 * (که در تابع Supabase بود) حالا در مرورگر انجام می‌شود.
 *
 * هویت: بخش حقوقی ورود ندارد؛ مرورگر یک «فضای کاری» تصادفی ۱۲۸ بیتی می‌سازد و در هدر X-Legal-Ws
 * می‌فرستد. گفت‌وگوها و فایل‌ها مال همان فضا هستند و با همان کد روی دستگاه دیگری هم باز می‌شوند.
 *
 * گفت‌وگو و حافظه — هر گفت‌وگو یک حافظهٔ متنیِ جدا در legal_chats.memory دارد:
 *   send    درخواست مدل = دستور ثابت (کش) + نوبت‌های خام از «نقطهٔ تاشدگی» به بعد (کش)
 *           + پیام تازه که حافظه، تاریخ امروز و فایل‌های تازه را با خود دارد. پاسخ جریانی به مرورگر.
 *   commit  مرورگر متن کامل پاسخ را پس می‌دهد؛ ذخیره می‌شود و مدلِ «نگه‌دارندهٔ حافظه» (همان
 *           Sonnet 5 با تلاش کم و خروجی ساختاریافته) حافظه را با این نوبت و خلاصهٔ فایل‌هایش به‌روز
 *           می‌کند؛ اگر از MEMORY_HARD نویسه گذشت، فشرده می‌شود.
 *   تاشدگی  وقتی متن خام گفت‌وگو از FOLD_AT توکن گذشت، نوبت‌های قدیمی از درخواست بیرون می‌روند
 *           (حافظه جایشان را دارد) و فایل‌هایشان تا سقف PIN_TOK سنجاق می‌مانند.
 * پیشوند درخواست تا تاشدگی بعدی ثابت است، پس کش پرامپت در هر نوبت فقط نوبت آخر را تازه می‌نویسد.
 */
import { HttpError } from "./http.js";
import { tehranParts, WEEKDAYS } from "./time.js";
import {
  ANALYSIS_SYSTEM, analysisInstruction, REPORT_SCHEMA,
  DRAFT_SYSTEM, draftInstruction, DRAFT_SCHEMA,
  CHAT_SYSTEM, MEMORY_SYSTEM, COMPACT_SYSTEM, MEMORY_SCHEMA, COMPACT_SCHEMA, MEMORY_HARD,
} from "./legal-prompts.js";

export const PREFIX = "/hoghooghi/api";
export const LEGAL_MODEL = "claude-sonnet-5";
/* سقف خروجی خودِ مدل. پاسخ جریانی است، پس سقف بزرگ نه زمان‌بر است نه گران: مدل فقط به اندازهٔ
   نیاز می‌نویسد و فقط همان حساب می‌شود. */
export const MAX_OUT = 128000;
const MEMORY_OUT = 32000;
/* قیمت Sonnet 5 به دلار برای هر میلیون توکن — فقط برای نمایش هزینه */
const PRICE = { in: 2, out: 10, read: 0.2, write1h: 4, write5m: 2.5 };

/* گفت‌وگو */
export const FOLD_AT = 350000;   /* کل ورودی نوبت قبل از این بیشتر شد → تاشدگی */
export const KEEP_TURNS = 6;     /* پس از تاشدگی، حداکثر این تعداد نوبت آخر خام می‌ماند… */
export const KEEP_TOK = 80000;   /* …و روی هم حداکثر این‌قدر توکن (دست‌کم نوبت آخر، هر چقدر باشد) */
export const PIN_TOK = 120000;   /* فایل‌های نوبت‌های تاشده تا این سقف سنجاق می‌مانند */
const MAX_Q = 100000;            /* نویسهٔ یک پیام */
const MAX_FILES_TURN = 20;
const MAX_A = 1500000;           /* نویسهٔ یک پاسخ برای ذخیره (سقف ردیف D1 دو مگابایت است) */
const MEMORY_BATCH = 6;          /* نوبت‌های پس‌افتاده در هر به‌روزرسانی حافظه */

/* فایل */
export const MAX_FILE = 32 * 1024 * 1024;
const MAX_IMAGE = 5 * 1024 * 1024;
const MIME_KIND = {
  "application/pdf": "document",
  "text/plain": "document",
  "image/png": "image", "image/jpeg": "image", "image/gif": "image", "image/webp": "image",
};
const EXT = { "application/pdf": "pdf", "text/plain": "txt", "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };
const FILE_TTL = 24 * 3600000;   /* فایل‌های تحلیل و پیش‌نویس یک روز می‌مانند؛ فایل گفت‌وگو تا حذف گفت‌وگو */

/* سقف مصرف: دفتر حقوقی احتمالاً پشت یک IP است، پس سقف IP بزرگ‌تر از سقف هر فضای کاری است */
export const LIMITS = { wsHour: 60, ipHour: 240, day: 3000 };

const WS_RE = /^[a-f0-9]{32}$/;
const ID_RE = /^[a-z0-9]{8,40}$/;

/* ------------------------------------------------------------------ */
/* ابزارها                                                              */
/* ------------------------------------------------------------------ */
const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } });
const T = (v) => String(v == null ? "" : v).trim();
const int = (v, d = 0) => { const n = parseInt(v, 10); return isNaN(n) ? d : n; };
const now = () => Date.now();
const rid = (n = 20) => {
  const b = new Uint8Array(Math.ceil(n / 2));
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, n);
};
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
/* برآورد توکن متن فارسی/انگلیسی بدون شمارش واقعی (Sonnet 5 برای فارسی حدود ۲٫۵ نویسه در هر توکن) */
export const estTok = (s) => Math.ceil(String(s || "").length / 2.5);

async function readJson(request) {
  try { return await request.json(); } catch (_) { throw new HttpError("بدنهٔ درخواست JSON معتبر نیست.", 400); }
}

const API = (env) => env.ANTHROPIC_API_BASE || "https://api.anthropic.com";
function headers(env, extra = {}) {
  if (!env.ANTHROPIC_API_KEY) throw new HttpError("کلید مدل (ANTHROPIC_API_KEY) روی سرور ست نشده است.", 503);
  return { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", ...extra };
}

/** پیام خطای انتروپیک به زبان کاربر؛ متن اصلی برای عیب‌یابی در لاگ می‌ماند */
export function modelError(status, body) {
  const e = (body && body.error) || {};
  const m = String(e.message || "");
  const type = String(e.type || "");
  if (status === 401 || type === "authentication_error") return new HttpError("کلید API مدل نامعتبر است یا باطل شده. کلید را در Cloudflare به‌روز کنید.", 503, { code: "key" });
  if (/credit balance|billing|purchase credits/i.test(m)) return new HttpError("اعتبار حساب Anthropic تمام شده است؛ حساب را شارژ کنید.", 503, { code: "credit" });
  if (status === 403 || type === "permission_error") return new HttpError("کلید API اجازهٔ استفاده از این مدل را ندارد.", 503, { code: "permission" });
  if (status === 413 || type === "request_too_large") return new HttpError("حجم درخواست بیش از سقف سرویس مدل است؛ فایل کوچک‌تر یا کمتری بفرستید.", 413, { code: "too_large" });
  if (/prompt is too long|too many total tokens|context window/i.test(m)) return new HttpError("حجم اسناد و متن از ظرفیت یک درخواست مدل (یک میلیون توکن) بیشتر است. فایل‌ها را کمتر یا کوچک‌تر کنید.", 413, { code: "context" });
  if (/pdf|page/i.test(m) && status === 400) return new HttpError(`فایل PDF را مدل نپذیرفت: ${m}`, 400, { code: "pdf" });
  if (status === 429 || type === "rate_limit_error") return new HttpError("سقف درخواست به سرویس مدل پر شده است؛ یک دقیقهٔ دیگر دوباره تلاش کنید.", 429, { code: "rate" });
  if (status === 529 || type === "overloaded_error") return new HttpError("سرویس مدل موقتاً شلوغ است؛ چند لحظهٔ دیگر دوباره تلاش کنید.", 503, { code: "overloaded" });
  if (status >= 500) return new HttpError("خطای موقت در سرویس مدل؛ دوباره تلاش کنید.", 502, { code: "upstream" });
  return new HttpError(`درخواست را سرویس مدل نپذیرفت: ${m || status}`, 400, { code: "invalid" });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const RETRY = new Set([429, 500, 502, 503, 504, 529]);

/** POST به API انتروپیک، با دو تلاش دوباره برای شلوغی و خطای موقت (پیش از رسیدن هیچ بایتی به کاربر) */
async function post(env, path, body, extraHeaders) {
  let last;
  for (let i = 0; i < 3; i++) {
    if (i) await wait(i === 1 ? 2000 : 6000);
    const r = await fetch(API(env) + path, {
      method: "POST",
      headers: headers(env, { "content-type": "application/json", ...(extraHeaders || {}) }),
      body: JSON.stringify(body),
    });
    if (r.ok) return r;
    const t = await r.text();
    last = { status: r.status, body: parse(t, { error: { message: t.slice(0, 300) } }) };
    console.error("anthropic", path, r.status, t.slice(0, 500));
    if (!RETRY.has(r.status)) break;
  }
  throw modelError(last.status, last.body);
}

/** پاسخ کامل (غیرجریانی) — برای حافظه و شمارش توکن */
async function postJson(env, path, body) {
  const r = await post(env, path, body);
  return r.json();
}

/** جریان پاسخ مدل، دست‌نخورده به مرورگر */
function sse(upstream, extra = {}) {
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
      ...extra,
    },
  });
}

export function costOf(u) {
  if (!u) return 0;
  const c = u.cache_creation || {};
  const w1h = c.ephemeral_1h_input_tokens != null ? c.ephemeral_1h_input_tokens : 0;
  const w5m = c.ephemeral_5m_input_tokens != null ? c.ephemeral_5m_input_tokens : Math.max(0, (u.cache_creation_input_tokens || 0) - w1h);
  return ((u.input_tokens || 0) * PRICE.in + (u.output_tokens || 0) * PRICE.out + (u.cache_read_input_tokens || 0) * PRICE.read
    + w1h * PRICE.write1h + w5m * PRICE.write5m) / 1e6;
}
const promptTokens = (u) => (u ? (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) : 0);

/* ------------------------------------------------------------------ */
/* طرح پایگاه داده                                                       */
/* ------------------------------------------------------------------ */
export const LEGAL_SCHEMA = `
CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS legal_chats (id TEXT PRIMARY KEY, ws TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', title_auto INTEGER NOT NULL DEFAULT 1, memory TEXT NOT NULL DEFAULT '', memory_seq INTEGER NOT NULL DEFAULT 0, memory_at INTEGER, compactions INTEGER NOT NULL DEFAULT 0, fold_seq INTEGER NOT NULL DEFAULT 0, pins_json TEXT, last_seq INTEGER NOT NULL DEFAULT 0, ctx_tokens INTEGER NOT NULL DEFAULT 0, in_tokens INTEGER NOT NULL DEFAULT 0, out_tokens INTEGER NOT NULL DEFAULT 0, cost_usd REAL NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_lchat_ws ON legal_chats(ws, updated_at);
CREATE TABLE IF NOT EXISTS legal_turns (chat_id TEXT NOT NULL, seq INTEGER NOT NULL, q TEXT NOT NULL, files_json TEXT, a TEXT, state TEXT NOT NULL DEFAULT 'pending', stop TEXT, usage_json TEXT, tok INTEGER, q_at INTEGER NOT NULL, a_at INTEGER, PRIMARY KEY (chat_id, seq)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS legal_files (id TEXT PRIMARY KEY, ws TEXT NOT NULL, chat_id TEXT, purpose TEXT NOT NULL, file_id TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, src TEXT, size INTEGER, tok INTEGER, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_lfile_chat ON legal_files(chat_id);
CREATE INDEX IF NOT EXISTS ix_lfile_age ON legal_files(purpose, created_at);
CREATE TABLE IF NOT EXISTS legal_calls (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, ws TEXT, ip TEXT, kind TEXT NOT NULL, chat_id TEXT, in_tokens INTEGER, out_tokens INTEGER, cost_usd REAL);
CREATE INDEX IF NOT EXISTS ix_lcall_at ON legal_calls(at);
`;
const LEGAL_FP = (() => {
  let h = 0x811c9dc5;
  for (let i = 0; i < LEGAL_SCHEMA.length; i++) { h ^= LEGAL_SCHEMA.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
})();
let legalReady = false;
export async function ensureLegalSchema(env) {
  if (legalReady) return;
  if (!env.DB) throw new HttpError("بایندینگ D1 با نام DB روی این پروژه ست نشده است.", 503);
  try {
    const fp = await env.DB.prepare("SELECT value FROM counters WHERE key='legal_schema_fp'").first();
    if (fp && Number(fp.value) === LEGAL_FP) { legalReady = true; return; }
  } catch (_) { /* counters هنوز ساخته نشده */ }
  await env.DB.exec(LEGAL_SCHEMA.trim().split("\n").filter(Boolean).join("\n"));
  await env.DB.prepare("INSERT INTO counters (key,value) VALUES ('legal_schema_fp',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(LEGAL_FP).run();
  legalReady = true;
}
export function resetLegalSchemaFlag() { legalReady = false; }

/* ------------------------------------------------------------------ */
/* دسترسی و سقف مصرف                                                    */
/* ------------------------------------------------------------------ */
function workspace(request) {
  const ws = T(request.headers.get("X-Legal-Ws")).toLowerCase();
  if (!WS_RE.test(ws)) throw new HttpError("شناسهٔ فضای کاری نامعتبر است؛ صفحه را دوباره بارگذاری کنید.", 400);
  return ws;
}

/* درخواست‌های پرهزینه فقط از خود سایت: مرورگر در POST همیشه Origin می‌فرستد. اسکریپت می‌تواند جعلش
   کند، پس این فقط جلوی سوءاستفاده از صفحه‌های دیگر را می‌گیرد؛ سقف مصرف پایین‌تر بقیه را. */
function sameOrigin(request) {
  const o = request.headers.get("Origin");
  if (!o) return;
  let host;
  try { host = new URL(o).hostname; } catch (_) { throw new HttpError("مبدأ درخواست نامعتبر است.", 403); }
  const self = new URL(request.url).hostname;
  if (host === self || host === "localhost" || host === "127.0.0.1") return;
  throw new HttpError("این درخواست فقط از خود سامانه پذیرفته می‌شود.", 403);
}

const ipOf = (request) => T(request.headers.get("CF-Connecting-IP")) || "local";

/** یک فراخوان مدل: اول سقف، بعد ثبت (ثبت پیش از فراخوان است تا درخواست‌های هم‌زمان هم شمرده شوند) */
async function meter(env, request, ws, kind, chatId) {
  const t = now(), ip = ipOf(request);
  const r = await env.DB.prepare(
    "SELECT COALESCE(SUM(ws=?1 AND at>?2),0) AS ws_h, COALESCE(SUM(ip=?3 AND at>?2),0) AS ip_h, COUNT(*) AS day FROM legal_calls WHERE at>?4",
  ).bind(ws, t - 3600000, ip, t - 86400000).first();
  if (r && r.ws_h >= LIMITS.wsHour) throw new HttpError(`سقف ${LIMITS.wsHour} درخواست در ساعت برای این مرورگر پر شده است؛ کمی بعد دوباره تلاش کنید.`, 429);
  if (r && r.ip_h >= LIMITS.ipHour) throw new HttpError("سقف ساعتیِ درخواست از این شبکه پر شده است؛ کمی بعد دوباره تلاش کنید.", 429);
  if (r && r.day >= LIMITS.day) throw new HttpError("سقف روزانهٔ درخواست‌های بخش حقوقی پر شده است؛ فردا دوباره تلاش کنید.", 429);
  const ins = await env.DB.prepare("INSERT INTO legal_calls (at,ws,ip,kind,chat_id) VALUES (?,?,?,?,?)").bind(t, ws, ip, kind, chatId || null).run();
  return ins && ins.meta ? ins.meta.last_row_id : null;
}

async function noteUsage(env, callId, usage) {
  if (!callId || !usage) return;
  await env.DB.prepare("UPDATE legal_calls SET in_tokens=?, out_tokens=?, cost_usd=? WHERE id=?")
    .bind(promptTokens(usage), usage.output_tokens || 0, costOf(usage), callId).run();
}

/* ------------------------------------------------------------------ */
/* فایل                                                                 */
/* ------------------------------------------------------------------ */
const kindOf = (mime) => MIME_KIND[mime] || null;
const baseMime = (ct) => T(ct).split(";")[0].toLowerCase();

/** بلوک محتوای مدل برای یک فایل ذخیره‌شده (نام فایل برای سند در title، برای تصویر در متن قبلش) */
export function fileBlocks(files) {
  const out = [];
  for (const f of files || []) {
    if (kindOf(f.mime) === "image") {
      out.push({ type: "text", text: `تصویر پیوست: ${f.name}` });
      out.push({ type: "image", source: { type: "file", file_id: f.file_id } });
    } else {
      out.push({ type: "document", source: { type: "file", file_id: f.file_id }, title: f.name });
    }
  }
  return out;
}

/**
 * بارگذاری جریانی یک فایل به Files API انتروپیک.
 * بدنهٔ multipart از سه تکه ساخته می‌شود — سرآغاز، خودِ جریان درخواست و پایان — و طول کلش از
 * پیش معلوم است (FixedLengthStream)، پس فایل هرگز کامل در حافظهٔ Worker نمی‌نشیند و CPU صرفش نمی‌شود.
 */
async function toAnthropic(env, body, size, mime) {
  const boundary = "ariana" + rid(24);
  const enc = new TextEncoder();
  const head = enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="upload.${EXT[mime] || "bin"}"\r\nContent-Type: ${mime}\r\n\r\n`);
  const tail = enc.encode(`\r\n--${boundary}--\r\n`);
  const { readable, writable } = new FixedLengthStream(head.length + size + tail.length);
  const pump = (async () => {
    let w = writable.getWriter();
    await w.write(head);
    w.releaseLock();
    await body.pipeTo(writable, { preventClose: true });
    w = writable.getWriter();
    await w.write(tail);
    await w.close();
  })();
  let r;
  try {
    r = await fetch(API(env) + "/v1/files", {
      method: "POST",
      headers: headers(env, { "content-type": `multipart/form-data; boundary=${boundary}` }),
      body: readable,
    });
  } finally {
    await pump.catch((e) => console.error("upload pump", e && e.message));
  }
  const t = await r.text();
  if (!r.ok) { console.error("files upload", r.status, t.slice(0, 500)); throw modelError(r.status, parse(t, {})); }
  const d = parse(t, {});
  if (!d.id) throw new HttpError("پاسخ بارگذاری فایل شناسه نداشت.", 502);
  return d.id;
}

async function removeRemote(env, fileId) {
  try {
    await fetch(`${API(env)}/v1/files/${encodeURIComponent(fileId)}`, { method: "DELETE", headers: headers(env) });
  } catch (e) { console.error("files delete", fileId, e && e.message); }
}

/**
 * برآورد توکن یک فایل — فقط برای بودجهٔ تاشدگی و سنجاق (planFold)، نه صورت‌حساب.
 * شمارش دقیق انتروپیک (count_tokens) منبع file_id را نمی‌پذیرد و خودِ فایل هم هرگز در Worker نیست.
 * متن فارسی در UTF-8 حدود ۳ بایت به ازای هر توکن است؛ PDF هر صفحه متن و تصویر دارد، پس بایت‌به‌توکن
 * در آن بسیار متغیر است و برآورد عمداً محتاطانه (بزرگ) است تا سنجاق‌ها از سقف نگذرند.
 */
export function estFileTok(mime, size) {
  if (kindOf(mime) === "image") return 1600;
  if (mime === "text/plain") return Math.ceil(size / 3);
  return Math.min(Math.ceil(size / 12), 600000);
}

async function uploadFile(request, env, ws, url) {
  const purpose = T(url.searchParams.get("purpose"));
  if (!["chat", "analyze", "draft"].includes(purpose)) throw new HttpError("کاربرد فایل نامعتبر است.", 400);
  /* نام فایل در هدر (درصدرمزشده، چون هدر فقط ASCII می‌پذیرد) نه در نشانی — نشانی‌ها در لاگ‌ها می‌مانند */
  let name = T(request.headers.get("X-File-Name"));
  try { name = decodeURIComponent(name); } catch (_) { /* همان متن خام */ }
  name = T(name).replace(/[\u0000-\u001f]/g, "").slice(0, 200) || "فایل";
  const src = T(url.searchParams.get("src")).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10) || null;
  const mime = baseMime(request.headers.get("content-type"));
  const kind = kindOf(mime);
  if (!kind) throw new HttpError("این نوع فایل پشتیبانی نمی‌شود؛ PDF، متن، Word، اکسل، پاورپوینت یا تصویر بفرستید.", 415);
  const size = int(request.headers.get("content-length"), -1);
  if (size < 0) throw new HttpError("طول فایل مشخص نیست.", 411);
  if (size === 0) throw new HttpError("فایل خالی است.", 400);
  const cap = kind === "image" ? MAX_IMAGE : MAX_FILE;
  if (size > cap) throw new HttpError(`حجم فایل «${name}» بیش از ${Math.round(cap / 1048576)} مگابایت است.`, 413);
  if (!request.body) throw new HttpError("بدنهٔ فایل خالی است.", 400);

  const fileId = await toAnthropic(env, request.body, size, mime);
  const rec = { id: "f" + rid(20), ws, chat_id: null, purpose, file_id: fileId, name, mime, src, size, created_at: now() };
  rec.tok = estFileTok(mime, size);
  await env.DB.prepare("INSERT INTO legal_files (id,ws,chat_id,purpose,file_id,name,mime,src,size,tok,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .bind(rec.id, ws, null, purpose, fileId, name, mime, src, size, rec.tok, rec.created_at).run();
  return json({ id: rec.id, name, mime, src, size, tok: rec.tok, kind });
}

async function filesOf(env, ws, ids, purpose) {
  const list = [...new Set((Array.isArray(ids) ? ids : []).map(T).filter((x) => ID_RE.test(x)))];
  if (!list.length) return [];
  const rows = (await env.DB.prepare(`SELECT id,chat_id,purpose,file_id,name,mime,src,size,tok FROM legal_files WHERE ws=? AND id IN (${list.map(() => "?").join(",")})`)
    .bind(ws, ...list).all()).results || [];
  const by = new Map(rows.map((r) => [r.id, r]));
  const out = list.map((id) => by.get(id));
  if (out.some((f) => !f || f.purpose !== purpose)) throw new HttpError("یکی از فایل‌ها پیدا نشد یا منقضی شده است؛ آن را دوباره بارگذاری کنید.", 404);
  return out;
}

async function deleteFile(env, ws, id) {
  const f = await env.DB.prepare("SELECT id,file_id,chat_id FROM legal_files WHERE id=? AND ws=?").bind(id, ws).first();
  if (!f) return json({ ok: true });
  /* فایلی که در گفت‌وگو فرستاده شده بخشی از آن گفت‌وگوست و با خودِ گفت‌وگو پاک می‌شود */
  if (f.chat_id) return json({ ok: true, kept: true });
  await removeRemote(env, f.file_id);
  await env.DB.prepare("DELETE FROM legal_files WHERE id=?").bind(id).run();
  return json({ ok: true });
}

/** Cron: فایل‌های تحلیل و پیش‌نویسِ قدیمی‌تر از یک روز، و فایل‌های گفت‌وگویی که هرگز فرستاده نشدند */
export async function legalCleanup(env, limit = 20) {
  if (!env.DB || !env.ANTHROPIC_API_KEY) return { removed: 0 };
  await ensureLegalSchema(env);
  const rows = (await env.DB.prepare("SELECT id,file_id FROM legal_files WHERE created_at<? AND (purpose IN ('analyze','draft') OR chat_id IS NULL) LIMIT ?")
    .bind(now() - FILE_TTL, limit).all()).results || [];
  for (const r of rows) await removeRemote(env, r.file_id);
  if (rows.length) await env.DB.prepare(`DELETE FROM legal_files WHERE id IN (${rows.map(() => "?").join(",")})`).bind(...rows.map((r) => r.id)).run();
  /* ثبت فراخوان‌ها فقط برای سقف مصرف و گزارش هزینه است؛ سه ماه کافی است */
  await env.DB.prepare("DELETE FROM legal_calls WHERE at<?").bind(now() - 90 * 86400000).run();
  return { removed: rows.length };
}

/* ------------------------------------------------------------------ */
/* تحلیلگر آریانا و پیش‌نویس                                           */
/* ------------------------------------------------------------------ */
/* کش ۵ دقیقه‌ای روی دستور و روی آخرین فایل: کاربر اغلب همان سند را با گزینهٔ دیگری دوباره تحلیل
   می‌کند؛ بار دوم سند از کش خوانده می‌شود (یک‌دهم قیمت و شروع سریع‌تر). */
const CACHE5 = { type: "ephemeral" };
const CACHE1H = { type: "ephemeral", ttl: "1h" };

export function analysisRequest(files, question) {
  const blocks = fileBlocks(files);
  if (blocks.length) blocks[blocks.length - 1] = { ...blocks[blocks.length - 1], cache_control: CACHE5 };
  return {
    model: LEGAL_MODEL,
    max_tokens: MAX_OUT,
    stream: true,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: { type: "json_schema", schema: REPORT_SCHEMA } },
    system: [{ type: "text", text: ANALYSIS_SYSTEM, cache_control: CACHE5 }],
    messages: [{ role: "user", content: [...blocks, { type: "text", text: analysisInstruction(question) }] }],
  };
}

export function draftRequest(refs, draft, question) {
  const content = [];
  refs.forEach((f, i) => {
    content.push({ type: "text", text: `قرارداد مرجع شماره ${i + 1} (فایل: ${f.name}):` });
    content.push(...fileBlocks([{ ...f, name: `قرارداد مرجع شماره ${i + 1} — ${f.name}` }]));
  });
  content.push({ type: "text", text: `قرارداد پیش‌نویس در حال بررسی (فایل: ${draft.name}):` });
  content.push(...fileBlocks([{ ...draft, name: `قرارداد پیش‌نویس در حال بررسی — ${draft.name}` }]));
  const last = content.length - 1;
  content[last] = { ...content[last], cache_control: CACHE5 };
  content.push({ type: "text", text: draftInstruction(question) });
  return {
    model: LEGAL_MODEL,
    max_tokens: MAX_OUT,
    stream: true,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: { type: "json_schema", schema: DRAFT_SCHEMA } },
    system: [{ type: "text", text: DRAFT_SYSTEM, cache_control: CACHE5 }],
    messages: [{ role: "user", content }],
  };
}

async function analyze(request, env, ws) {
  const b = await readJson(request);
  const files = await filesOf(env, ws, b.files, "analyze");
  if (!files.length) throw new HttpError("ابتدا فایل سند را بارگذاری کنید.", 400);
  const call = await meter(env, request, ws, "analyze");
  const up = await post(env, "/v1/messages", analysisRequest(files, T(b.question).slice(0, MAX_Q)));
  return sse(up, { "x-call": String(call || "") });
}

async function draft(request, env, ws) {
  const b = await readJson(request);
  const refs = await filesOf(env, ws, b.references, "draft");
  const [dr] = await filesOf(env, ws, [b.draft], "draft");
  if (!refs.length) throw new HttpError("دست‌کم یک قرارداد مرجع لازم است.", 400);
  if (!dr) throw new HttpError("قرارداد پیش‌نویس بارگذاری نشده است.", 400);
  if (refs.some((f) => f.id === dr.id)) throw new HttpError("پیش‌نویس نباید میان قراردادهای مرجع هم باشد.", 400);
  const call = await meter(env, request, ws, "draft");
  const up = await post(env, "/v1/messages", draftRequest(refs, dr, T(b.question).slice(0, MAX_Q)));
  return sse(up, { "x-call": String(call || "") });
}

/** مرورگر پس از پایان جریان، مصرف را گزارش می‌دهد (فقط برای گزارش هزینه) */
async function usage(request, env, ws) {
  const b = await readJson(request);
  const id = int(b.call, 0);
  if (id > 0) {
    const row = await env.DB.prepare("SELECT id FROM legal_calls WHERE id=? AND ws=? AND in_tokens IS NULL").bind(id, ws).first();
    if (row) await noteUsage(env, id, b.usage || null);
  }
  return json({ ok: true });
}

/* ------------------------------------------------------------------ */
/* گفت‌وگو — ساختن درخواست                                            */
/* ------------------------------------------------------------------ */
const MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
const faDigits = (s) => String(s).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
export function todayLine(ms) {
  const p = tehranParts(ms);
  const g = new Date(ms + 3.5 * 3600000).toISOString().slice(0, 10);
  return `تاریخ امروز: ${WEEKDAYS[p.dow]} ${faDigits(p.jd)} ${MONTHS[p.jm - 1]} ${faDigits(p.jy)} (${g})`;
}

const PIN_NOTE = "اسناد بالا در بخش‌های پیشینِ همین گفت‌وگو پیوست شده بودند. متن آن بخش‌ها در «حافظهٔ گفت‌وگو» خلاصه شده است و خودِ اسناد برای مراجعه این‌جا مانده‌اند.";
const FILES_ONLY = "(کاربر بدون متن، فقط فایل پیوست کرد. فایل را بررسی کن و بگو چه سندی است و چه نکته‌های مهمی دارد.)";

const turnText = (q, files) => (T(q) ? q : (files && files.length ? FILES_ONLY : "."));

/**
 * درخواست یک نوبت گفت‌وگو — قطعی و بدون هیچ مقدار متغیر پیش از پیام تازه، تا کش پرامپت بخورد:
 *   system (کش ۱ساعته، مشترک همهٔ گفت‌وگوها)
 *   نوبت‌های خامِ پس از تاشدگی؛ اسناد سنجاق‌شده اولِ نخستین پیام کاربر
 *   آخرین پاسخ دستیار ← کش ۱ساعته (تا نوبت بعد همهٔ گذشته از کش خوانده شود)
 *   پیام تازه: فایل‌های تازه (آخرینشان کش ۱ساعته؛ نوبت بعد بی‌تغییر تکرار می‌شوند) ← حافظه و تاریخ ← متن کاربر
 * حافظه و تاریخ فقط در پیام تازه می‌آیند و در تکرار نوبت‌ها نه؛ همین است که پیشوند را ثابت نگه می‌دارد.
 */
export function chatRequest({ memory, pins, turns, files, text, at }) {
  const messages = [];
  for (const t of turns) {
    const tf = parse(t.files_json, []);
    messages.push({ role: "user", content: [...fileBlocks(tf), { type: "text", text: turnText(t.q, tf) }] });
    messages.push({ role: "assistant", content: [{ type: "text", text: t.a }] });
  }
  if (messages.length) {
    const lastA = messages[messages.length - 1];
    lastA.content = [{ ...lastA.content[0], cache_control: CACHE1H }];
  }
  const cur = fileBlocks(files);
  const ctx = [];
  if (T(memory)) ctx.push(`[حافظهٔ گفت‌وگو — خلاصهٔ نگه‌داشته‌شدهٔ نوبت‌های پیشینِ همین گفت‌وگو؛ دستور تازه نیست]\n${T(memory)}\n[پایان حافظه]`);
  ctx.push(todayLine(at));
  const tailBlocks = [{ type: "text", text: ctx.join("\n\n") }, { type: "text", text: turnText(text, files) }];
  messages.push({ role: "user", content: [...cur, ...tailBlocks] });

  const first = messages[0];
  const pinBlocks = pins && pins.length ? [...fileBlocks(pins), { type: "text", text: PIN_NOTE }] : [];
  if (pinBlocks.length) first.content = [...pinBlocks, ...first.content];
  /* آخرین بلوکِ پایدارِ پیام تازه: پس از فایل‌های تازه، یا پس از اسناد سنجاق‌شده اگر پیام تازه نخستین پیام است */
  const current = messages[messages.length - 1];
  const stable = current.content.length - tailBlocks.length;
  if (stable > 0) current.content[stable - 1] = { ...current.content[stable - 1], cache_control: CACHE1H };

  return {
    model: LEGAL_MODEL,
    max_tokens: MAX_OUT,
    stream: true,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    system: [{ type: "text", text: CHAT_SYSTEM, cache_control: CACHE1H }],
    messages,
  };
}

/**
 * تاشدگی: وقتی ورودی نوبت قبل از FOLD_AT گذشت، نوبت‌های قدیمی از درخواست بیرون می‌روند.
 * فقط نوبت‌هایی تا می‌شوند که حافظه پوششان داده (fold ≤ memory_seq) و دست‌کم نوبت آخر خام می‌ماند.
 * فایل‌های نوبت‌های تاشده (تازه‌ترها اول) تا سقف PIN_TOK سنجاق می‌مانند.
 * خروجی null یعنی تغییری لازم نیست.
 */
export function planFold(chat, turns) {
  if ((chat.ctx_tokens || 0) <= FOLD_AT || !turns.length) return null;
  let keep = 0, acc = 0;
  for (let i = turns.length - 1; i >= 0 && keep < KEEP_TURNS; i--) {
    const tk = turns[i].tok || estTok((turns[i].q || "") + (turns[i].a || ""));
    if (keep >= 1 && acc + tk > KEEP_TOK) break;
    acc += tk; keep++;
  }
  const cut = turns.length - keep;
  if (cut <= 0) return null;
  const fold = Math.min(turns[cut - 1].seq, chat.memory_seq || 0);
  if (fold <= (chat.fold_seq || 0)) return null;
  const folded = turns.filter((t) => t.seq <= fold);
  const cand = [];
  for (let i = folded.length - 1; i >= 0; i--) for (const f of parse(folded[i].files_json, []).slice().reverse()) cand.push(f);
  for (const f of parse(chat.pins_json, [])) cand.push(f);
  const pins = [];
  let pt = 0;
  const seen = new Set();
  for (const f of cand) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    const tk = f.tok || 2000;
    if (pt + tk > PIN_TOK) continue;
    pins.push(f); pt += tk;
  }
  /* ترتیب زمانی (قدیمی‌تر اول) تا متن سنجاق‌ها بین تاشدگی‌ها قطعی بماند */
  const order = new Map();
  let k = 0;
  for (const f of parse(chat.pins_json, [])) order.set(f.id, k++);
  for (const t of folded) for (const f of parse(t.files_json, [])) if (!order.has(f.id)) order.set(f.id, k++);
  pins.sort((a, b) => order.get(a.id) - order.get(b.id));
  return { fold, pins, remaining: turns.filter((t) => t.seq > fold) };
}

/* ------------------------------------------------------------------ */
/* گفت‌وگو — مسیرها                                                     */
/* ------------------------------------------------------------------ */
const pubFile = (f) => ({ id: f.id, name: f.name, mime: f.mime, src: f.src || null, size: f.size || 0, tok: f.tok || 0 });

async function chatOf(env, ws, id) {
  if (!ID_RE.test(id)) throw new HttpError("گفت‌وگو پیدا نشد.", 404);
  const c = await env.DB.prepare("SELECT * FROM legal_chats WHERE id=? AND ws=?").bind(id, ws).first();
  if (!c) throw new HttpError("گفت‌وگو پیدا نشد.", 404);
  return c;
}

async function listChats(env, ws) {
  const rows = (await env.DB.prepare("SELECT id,title,last_seq,updated_at,created_at FROM legal_chats WHERE ws=? AND last_seq>0 ORDER BY updated_at DESC LIMIT 300").bind(ws).all()).results || [];
  return json({ chats: rows.map((r) => ({ id: r.id, title: r.title || "گفت‌وگوی تازه", turns: r.last_seq, updated_at: r.updated_at, created_at: r.created_at })) });
}

async function getChat(env, ws, id) {
  const c = await chatOf(env, ws, id);
  const turns = (await env.DB.prepare("SELECT seq,q,files_json,a,state,stop,q_at,a_at FROM legal_turns WHERE chat_id=? ORDER BY seq").bind(c.id).all()).results || [];
  return json({
    chat: {
      id: c.id, title: c.title || "گفت‌وگوی تازه", created_at: c.created_at, updated_at: c.updated_at,
      memory_seq: c.memory_seq, memory_chars: (c.memory || "").length, last_seq: c.last_seq, fold_seq: c.fold_seq,
    },
    turns: turns.map((t) => ({
      seq: t.seq, q: t.q, files: parse(t.files_json, []).map(pubFile), a: t.a || "",
      state: t.state, stop: t.stop || null, q_at: t.q_at, a_at: t.a_at || null,
    })),
  });
}

async function renameChat(request, env, ws, id) {
  const c = await chatOf(env, ws, id);
  const b = await readJson(request);
  const title = T(b.title).replace(/\s+/g, " ").slice(0, 120);
  if (!title) throw new HttpError("عنوان خالی است.", 400);
  await env.DB.prepare("UPDATE legal_chats SET title=?, title_auto=0 WHERE id=?").bind(title, c.id).run();
  return json({ ok: true, title });
}

async function deleteChat(env, ws, id) {
  const c = await chatOf(env, ws, id);
  const files = (await env.DB.prepare("SELECT id,file_id FROM legal_files WHERE chat_id=?").bind(c.id).all()).results || [];
  /* هر حذف یک زیردرخواست است؛ باقیِ فایل‌ها (گفت‌وگوی خیلی بلند) بی‌صاحب می‌مانند و Cron پاکشان می‌کند */
  const now_ = files.slice(0, 30);
  for (const f of now_) await removeRemote(env, f.file_id);
  const stmts = [
    env.DB.prepare("DELETE FROM legal_turns WHERE chat_id=?").bind(c.id),
    env.DB.prepare("DELETE FROM legal_chats WHERE id=?").bind(c.id),
  ];
  if (now_.length) stmts.push(env.DB.prepare(`DELETE FROM legal_files WHERE id IN (${now_.map(() => "?").join(",")})`).bind(...now_.map((f) => f.id)));
  if (files.length > now_.length) stmts.push(env.DB.prepare("UPDATE legal_files SET chat_id=NULL, created_at=0 WHERE chat_id=?").bind(c.id));
  await env.DB.batch(stmts);
  return json({ ok: true });
}

async function memoryOf(env, ws, id) {
  const c = await chatOf(env, ws, id);
  const d = await env.DB.prepare("SELECT COALESCE(MAX(seq),0) AS s, COUNT(*) AS n FROM legal_turns WHERE chat_id=? AND state='done'").bind(c.id).first();
  return json({
    title: c.title || "گفت‌وگوی تازه", memory: c.memory || "", memory_seq: c.memory_seq, last_seq: c.last_seq,
    done_seq: d ? d.s : 0, done_turns: d ? d.n : 0,
    memory_at: c.memory_at || null, compactions: c.compactions, fold_seq: c.fold_seq,
    ctx_tokens: c.ctx_tokens, cost_usd: Math.round((c.cost_usd || 0) * 10000) / 10000,
  });
}

async function send(request, env, ws, id) {
  const b = await readJson(request);
  const text = String(b.text == null ? "" : b.text).slice(0, MAX_Q);
  const ids = Array.isArray(b.files) ? b.files.slice(0, MAX_FILES_TURN) : [];
  if (!T(text) && !ids.length) throw new HttpError("پیام خالی است.", 400);

  let chat;
  const t = now();
  if (id === "new") {
    chat = { id: rid(20), ws, title: "", title_auto: 1, memory: "", memory_seq: 0, fold_seq: 0, pins_json: null, last_seq: 0, ctx_tokens: 0, created_at: t };
  } else {
    chat = await chatOf(env, ws, id);
  }
  const files = await filesOf(env, ws, ids, "chat");
  if (files.some((f) => f.chat_id && f.chat_id !== chat.id)) throw new HttpError("این فایل مال گفت‌وگوی دیگری است؛ دوباره بارگذاری‌اش کنید.", 409);
  const call = await meter(env, request, ws, "chat", chat.id);

  let turns = id === "new" ? [] : ((await env.DB.prepare("SELECT seq,q,files_json,a,tok FROM legal_turns WHERE chat_id=? AND state='done' AND seq>? ORDER BY seq")
    .bind(chat.id, chat.fold_seq || 0).all()).results || []);
  let pins = parse(chat.pins_json, []);
  const stmts = [];
  const plan = planFold(chat, turns);
  if (plan) {
    turns = plan.remaining;
    pins = plan.pins;
    stmts.push(env.DB.prepare("UPDATE legal_chats SET fold_seq=?, pins_json=? WHERE id=?").bind(plan.fold, JSON.stringify(pins), chat.id));
  }

  const seq = (chat.last_seq || 0) + 1;
  const req = chatRequest({ memory: chat.memory, pins, turns, files, text, at: t });
  const title0 = (T(text) || (files[0] && files[0].name) || "گفت‌وگوی تازه").replace(/\s+/g, " ").slice(0, 60);
  const filesJson = JSON.stringify(files.map((f) => ({ id: f.id, file_id: f.file_id, name: f.name, mime: f.mime, src: f.src || null, size: f.size || 0, tok: f.tok || 0 })));

  if (id === "new") {
    stmts.unshift(env.DB.prepare("INSERT INTO legal_chats (id,ws,title,title_auto,last_seq,created_at,updated_at) VALUES (?,?,?,1,?,?,?)").bind(chat.id, ws, title0, seq, t, t));
  } else {
    stmts.push(env.DB.prepare("UPDATE legal_turns SET state='failed' WHERE chat_id=? AND state='pending'").bind(chat.id));
    stmts.push(env.DB.prepare("UPDATE legal_chats SET last_seq=?, updated_at=? WHERE id=?").bind(seq, t, chat.id));
  }
  stmts.push(env.DB.prepare("INSERT INTO legal_turns (chat_id,seq,q,files_json,state,q_at) VALUES (?,?,?,?,'pending',?)").bind(chat.id, seq, text, filesJson, t));
  if (files.length) stmts.push(env.DB.prepare(`UPDATE legal_files SET chat_id=? WHERE id IN (${files.map(() => "?").join(",")})`).bind(chat.id, ...files.map((f) => f.id)));
  await env.DB.batch(stmts);

  let up;
  try {
    up = await post(env, "/v1/messages", req);
  } catch (e) {
    await env.DB.prepare("UPDATE legal_turns SET state='failed', stop='error' WHERE chat_id=? AND seq=?").bind(chat.id, seq).run();
    throw Object.assign(e, { extra: { ...(e.extra || {}), chat: chat.id, seq } });
  }
  return sse(up, { "x-chat-id": chat.id, "x-turn": String(seq), "x-call": String(call || ""), "access-control-expose-headers": "x-chat-id, x-turn, x-call" });
}

async function commit(request, env, ws, id) {
  const c = await chatOf(env, ws, id);
  const b = await readJson(request);
  const seq = int(b.seq, 0);
  const text = String(b.text == null ? "" : b.text).slice(0, MAX_A);
  const stop = T(b.stop).slice(0, 40) || null;
  const u = b.usage && typeof b.usage === "object" ? b.usage : null;
  const turn = await env.DB.prepare("SELECT seq,q,files_json,state FROM legal_turns WHERE chat_id=? AND seq=?").bind(c.id, seq).first();
  if (!turn) throw new HttpError("این نوبت گفت‌وگو پیدا نشد.", 404);

  if (turn.state === "pending") {
    if (!T(text)) {
      await env.DB.prepare("UPDATE legal_turns SET state='failed', stop=? WHERE chat_id=? AND seq=?").bind(stop || "empty", c.id, seq).run();
      return json({ ok: false, state: "failed" });
    }
    const tf = parse(turn.files_json, []);
    const tok = tf.reduce((s, f) => s + (f.tok || 0), 0) + estTok(turn.q) + estTok(text);
    const t = now();
    const stmts = [
      env.DB.prepare("UPDATE legal_turns SET a=?, state='done', stop=?, usage_json=?, tok=?, a_at=? WHERE chat_id=? AND seq=? AND state='pending'")
        .bind(text, stop, u ? JSON.stringify(u) : null, tok, t, c.id, seq),
      env.DB.prepare("UPDATE legal_chats SET ctx_tokens=?, in_tokens=in_tokens+?, out_tokens=out_tokens+?, cost_usd=cost_usd+?, updated_at=? WHERE id=?")
        .bind(u ? promptTokens(u) : c.ctx_tokens, u ? promptTokens(u) : 0, u ? (u.output_tokens || 0) : 0, costOf(u), t, c.id),
    ];
    const call = int(b.call, 0);
    if (call > 0 && u) stmts.push(env.DB.prepare("UPDATE legal_calls SET in_tokens=?, out_tokens=?, cost_usd=? WHERE id=? AND ws=?").bind(promptTokens(u), u.output_tokens || 0, costOf(u), call, ws));
    await env.DB.batch(stmts);
  } else if (turn.state !== "done") {
    return json({ ok: false, state: turn.state });
  }
  /* مرورگر پاسخ را بی‌درنگ ذخیره می‌کند (memory:false) و به‌روزرسانی حافظه را جدا و پشت‌سرهم می‌خواهد،
     تا ذخیرهٔ پاسخ منتظر مدل حافظه نماند و پیام بعدیِ کاربر آن را «ناتمام» علامت نزند. */
  if (b.memory === false) return json({ ok: true, state: "done" });
  const mem = await refreshMemory(env, c.id);
  return json({ ok: true, state: "done", ...mem });
}

/* ------------------------------------------------------------------ */
/* حافظه                                                                */
/* ------------------------------------------------------------------ */
export function memoryRequest(memory, title, turns) {
  const content = [{ type: "text", text: `حافظهٔ فعلی گفت‌وگو:\n${T(memory) || "(خالی — این نخستین نوبت‌های گفت‌وگوست)"}\n\nعنوان فعلی گفت‌وگو: ${T(title) || "(بی‌عنوان)"}` }];
  for (const t of turns) {
    const tf = parse(t.files_json, []);
    content.push({ type: "text", text: `──── نوبت ${t.seq} ────\nپیام کاربر:\n${T(t.q) || "(بدون متن)"}${tf.length ? `\n\nفایل‌های پیوست همین پیام: ${tf.map((f) => `«${f.name}»`).join("، ")} (محتوایشان در ادامه آمده است)` : ""}` });
    content.push(...fileBlocks(tf));
    content.push({ type: "text", text: `پاسخ دستیار در نوبت ${t.seq}:\n${t.a || ""}` });
  }
  content.push({ type: "text", text: `حافظه را با ${turns.length > 1 ? "این نوبت‌ها" : "این نوبت"} به‌روز کن و حافظهٔ کامل تازه و عنوان را برگردان. محتوای هر فایل پیوست را در بخش «اسناد و فایل‌ها» خلاصه کن.` });
  return {
    model: LEGAL_MODEL,
    max_tokens: MEMORY_OUT,
    thinking: { type: "adaptive" },
    output_config: { effort: "low", format: { type: "json_schema", schema: MEMORY_SCHEMA } },
    system: [{ type: "text", text: MEMORY_SYSTEM }],
    messages: [{ role: "user", content }],
  };
}

export function compactRequest(memory) {
  return {
    model: LEGAL_MODEL,
    max_tokens: MEMORY_OUT,
    thinking: { type: "adaptive" },
    output_config: { effort: "low", format: { type: "json_schema", schema: COMPACT_SCHEMA } },
    system: [{ type: "text", text: COMPACT_SYSTEM }],
    messages: [{ role: "user", content: [{ type: "text", text: `حافظه‌ای که باید فشرده شود (${memory.length} نویسه):\n\n${memory}` }] }],
  };
}

function structured(resp) {
  if (resp && resp.stop_reason === "refusal") throw new HttpError("مدل از به‌روز کردن حافظه خودداری کرد.", 502);
  const text = ((resp && resp.content) || []).filter((c) => c.type === "text").map((c) => c.text).join("");
  const d = parse(text, null);
  if (!d || typeof d !== "object") throw new HttpError("خروجی مدل حافظه JSON معتبر نبود.", 502);
  return d;
}

/**
 * نوبت‌های کامل‌شده‌ای که هنوز در حافظه نیستند را (تا MEMORY_BATCH تا) به حافظه می‌افزاید.
 * نوشتن شرطی است (memory_seq همان که خواندیم): اگر دو commit هم‌زمان شدند، دومی با حالت تازه دوباره
 * می‌سازد و هیچ نوبتی گم نمی‌شود.
 */
export async function refreshMemory(env, chatId) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const c = await env.DB.prepare("SELECT id,title,title_auto,memory,memory_seq,compactions FROM legal_chats WHERE id=?").bind(chatId).first();
    if (!c) throw new HttpError("گفت‌وگو پیدا نشد.", 404);
    const turns = (await env.DB.prepare("SELECT seq,q,files_json,a FROM legal_turns WHERE chat_id=? AND state='done' AND seq>? ORDER BY seq LIMIT ?")
      .bind(chatId, c.memory_seq, MEMORY_BATCH).all()).results || [];
    if (!turns.length) return { title: c.title, memory_seq: c.memory_seq, memory_chars: (c.memory || "").length, compacted: false };

    let resp = await postJson(env, "/v1/messages", memoryRequest(c.memory, c.title, turns));
    let cost = costOf(resp.usage), inT = promptTokens(resp.usage), outT = (resp.usage && resp.usage.output_tokens) || 0;
    const d = structured(resp);
    let memory = T(d.memory);
    if (!memory) throw new HttpError("مدل حافظهٔ خالی برگرداند.", 502);
    let compacted = false;
    if (memory.length > MEMORY_HARD) {
      resp = await postJson(env, "/v1/messages", compactRequest(memory));
      cost += costOf(resp.usage); inT += promptTokens(resp.usage); outT += (resp.usage && resp.usage.output_tokens) || 0;
      const m2 = T(structured(resp).memory);
      if (m2 && m2.length < memory.length) { memory = m2; compacted = true; }
    }
    const title = T(d.title).replace(/\s+/g, " ").slice(0, 120);
    const seq = turns[turns.length - 1].seq;
    const r = await env.DB.prepare(
      "UPDATE legal_chats SET memory=?, memory_seq=?, memory_at=?, title=CASE WHEN title_auto=1 AND ?<>'' THEN ? ELSE title END, compactions=compactions+?, in_tokens=in_tokens+?, out_tokens=out_tokens+?, cost_usd=cost_usd+? WHERE id=? AND memory_seq=?",
    ).bind(memory, seq, now(), title, title, compacted ? 1 : 0, inT, outT, cost, chatId, c.memory_seq).run();
    if (r && r.meta && r.meta.changes) {
      return { title: c.title_auto && title ? title : c.title, memory_seq: seq, memory_chars: memory.length, compacted };
    }
  }
  throw new HttpError("به‌روزرسانی هم‌زمان حافظه؛ دوباره تلاش کنید.", 409);
}

async function memoryRefresh(env, ws, id) {
  const c = await chatOf(env, ws, id);
  const mem = await refreshMemory(env, c.id);
  return json({ ok: true, ...mem });
}

/* ------------------------------------------------------------------ */
/* سلامت                                                                */
/* ------------------------------------------------------------------ */
let deepAt = 0, deepResult = null;
async function health(env, url) {
  const out = { ok: true, model: LEGAL_MODEL, key: !!env.ANTHROPIC_API_KEY };
  if (url.searchParams.get("deep") && env.ANTHROPIC_API_KEY) {
    if (!deepResult || now() - deepAt > 60000) {
      try {
        const r = await fetch(`${API(env)}/v1/models/${LEGAL_MODEL}`, { headers: headers(env) });
        const d = parse(await r.text(), {});
        deepResult = r.ok ? { status: "ok", max_input_tokens: d.max_input_tokens || null, max_tokens: d.max_tokens || null }
          : { status: modelError(r.status, d).extra.code, http: r.status };
      } catch (e) { deepResult = { status: "network", error: String(e && e.message) }; }
      deepAt = now();
    }
    out.deep = deepResult;
    out.ok = deepResult.status === "ok";
  }
  return json(out);
}

/* ------------------------------------------------------------------ */
/* مسیریاب                                                              */
/* ------------------------------------------------------------------ */
export async function legalRoute(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.slice(PREFIX.length).replace(/\/+$/, "") || "/";
  const m = request.method;
  try {
    if (path === "/health" && m === "GET") return await health(env, url);
    await ensureLegalSchema(env);
    const ws = workspace(request);
    if (m !== "GET") sameOrigin(request);

    if (path === "/files" && m === "POST") return await uploadFile(request, env, ws, url);
    let mm = /^\/files\/([a-z0-9]+)$/.exec(path);
    if (mm && m === "DELETE") return await deleteFile(env, ws, mm[1]);
    if (path === "/analyze" && m === "POST") return await analyze(request, env, ws);
    if (path === "/draft" && m === "POST") return await draft(request, env, ws);
    if (path === "/usage" && m === "POST") return await usage(request, env, ws);

    if (path === "/chats" && m === "GET") return await listChats(env, ws);
    mm = /^\/chats\/([a-z0-9]+)(\/[a-z/]+)?$/.exec(path);
    if (mm) {
      const [, id, sub = ""] = mm;
      if (sub === "/send" && m === "POST") return await send(request, env, ws, id);
      if (sub === "/commit" && m === "POST") return await commit(request, env, ws, id);
      if (sub === "/memory" && m === "GET") return await memoryOf(env, ws, id);
      if (sub === "/memory/refresh" && m === "POST") return await memoryRefresh(env, ws, id);
      if (!sub && m === "GET") return await getChat(env, ws, id);
      if (!sub && m === "PATCH") return await renameChat(request, env, ws, id);
      if (!sub && m === "DELETE") return await deleteChat(env, ws, id);
    }
    return json({ error: "مسیر پیدا نشد." }, 404);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, ...(e.extra || {}) }, e.status);
    console.error("legal", path, e && e.stack);
    return json({ error: "خطای داخلی سرور: " + (e && e.message ? e.message : String(e)) }, 500);
  }
}
