/**
 * پنل تأمین‌کننده (دموی مهر ۱۴۰۵) — هستهٔ داده
 *
 * کارشناس برای یک یا چند قلمِ یک درخواست به یک تأمین‌کننده «ارسال» می‌زند (از بات کارشناسان، جای
 * «کپی پیام» قالب، یا از صفحهٔ مکاتبات). یک گفت‌وگو برای هر «درخواست × تأمین‌کننده» ساخته می‌شود و
 * برای هر قلم یک خطِ مشخصات با لایه‌های ویژگیِ قفل‌شده — از ساختار تأییدشدهٔ همان قلم (norm_json) یا
 * فهرست اقلام. تأمین‌کننده با لینک و رمزِ پیامک وارد پنل وب یا بات تأمین‌کنندگان می‌شود؛ هر دو یک
 * وضعیتِ سرور دارند. پیامک فعلاً خاموش است: متنش (با لینک و رمز) در گفت‌وگوی کارشناس نشان داده می‌شود.
 *
 * چرخهٔ خط:  new → draft → ready → submitted → approved → proforma → final
 *                                         ↘ returned (دوباره قابل ویرایش) · rejected
 * تصمیم‌ها روی «بسته» است: اقلامی که تأمین‌کننده با هم فرستاده (sp_bundles). هر بسته تا تأیید نهایی
 * قابل مذاکره است؛ شرط تأیید نهایی: فیلدهای ضروری پر، پیش‌فاکتور رسیده، و صراحتِ لایه‌ها و فیلدهای
 * اجباری در پیش‌فاکتور (با «بررسی هوشمند» یا تأیید خودِ کارشناس).
 *
 * این لایه به تلگرام چیزی نمی‌فرستد؛ پیام‌هایی که هر کار می‌سازد برمی‌گردند و sp-push.js پخششان می‌کند.
 */
import { HttpError } from "./http.js";
import { telegram } from "./telegram.js";
import { normOf, dbStruct } from "./normalize.js";
import { layerText } from "../frontend/tamin-poshtibani/catalog-rules.mjs";
import { canSave, validDtime, normalizeDtime, ENUMS } from "./quote-rules.js";
import { aiUsable, resolve, acceptable, lineKey, headKey } from "./sp-ai.js";
import { phoneChars } from "./sms.js";
import { aiThread, askAnswered, AI_THREAD_MSG, AI_ASK_SQL } from "./ai-lock.js";

const now = () => Date.now();
const T = (v) => String(v == null ? "" : v).trim();
const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
/* نمایش: ی و ک فارسی و فاصله‌های یکدست — نیم‌فاصله می‌ماند («آهن‌آلات») */
export const nrm = (x) => T(x).replace(/[ي]/g, "ی").replace(/[ك]/g, "ک").replace(/\s+/g, " ");
/* کلیدِ مقایسه: نیم‌فاصله هم فاصله، کوچک‌حرف */
export const nkey = (x) => nrm(x).replace(/‌/g, " ").replace(/\s+/g, " ").toLowerCase();
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const FA = "۰۱۲۳۴۵۶۷۸۹", AR = "٠١٢٣٤٥٦٧٨٩";
export const latin = (s) => String(s == null ? "" : s).replace(/[۰-۹]/g, (d) => String(FA.indexOf(d))).replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)));

/* ------------------------------------------------------------------ */
/* طرح جدول‌ها — هر دستور یک سطر (exec در D1 سطر به سطر می‌خواند)          */
/* ------------------------------------------------------------------ */
export const SP_DDL = `
CREATE TABLE IF NOT EXISTS sp_suppliers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, name_n TEXT NOT NULL, demo INTEGER NOT NULL DEFAULT 0, created_by INTEGER, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_spsup_name ON sp_suppliers(name_n);
CREATE TABLE IF NOT EXISTS sp_phones (id INTEGER PRIMARY KEY, supplier_id INTEGER NOT NULL, phone TEXT NOT NULL UNIQUE, label TEXT, k TEXT NOT NULL UNIQUE, pass_hash TEXT, pass_at INTEGER, fails INTEGER NOT NULL DEFAULT 0, lock_until INTEGER, resend_at INTEGER, created_by INTEGER, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_spph_sup ON sp_phones(supplier_id);
CREATE TABLE IF NOT EXISTS sp_threads (id INTEGER PRIMARY KEY, assignment_id INTEGER NOT NULL, request_id TEXT, supplier_id INTEGER NOT NULL, phone_id INTEGER, created_by INTEGER, e_seen INTEGER NOT NULL DEFAULT 0, s_seen INTEGER NOT NULL DEFAULT 0, rev INTEGER NOT NULL DEFAULT 0, last_at INTEGER NOT NULL, created_at INTEGER NOT NULL, e_clear INTEGER, s_clear INTEGER, terms_json TEXT, UNIQUE(assignment_id, supplier_id));
CREATE INDEX IF NOT EXISTS ix_spth_sup ON sp_threads(supplier_id);
CREATE TABLE IF NOT EXISTS sp_lines (id INTEGER PRIMARY KEY, thread_id INTEGER NOT NULL, item_id INTEGER NOT NULL, title TEXT NOT NULL, head TEXT, layers_json TEXT, extra_json TEXT, req_qty REAL, req_unit TEXT, qty REAL, unit TEXT, price REAL, note TEXT, state TEXT NOT NULL DEFAULT 'new', bundle_id INTEGER, quote_id INTEGER, no INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(thread_id, item_id));
CREATE TABLE IF NOT EXISTS sp_bundles (id INTEGER PRIMARY KEY, thread_id INTEGER NOT NULL, line_ids TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', comment TEXT, pf_key TEXT, pf_name TEXT, pf_mime TEXT, pf_size INTEGER, pf_at INTEGER, ai_json TEXT, ai_at INTEGER, manual_ok INTEGER, accept_json TEXT, terms_json TEXT, created_at INTEGER NOT NULL, decided_at INTEGER);
CREATE INDEX IF NOT EXISTS ix_spb_thread ON sp_bundles(thread_id);
CREATE TABLE IF NOT EXISTS sp_msgs (id INTEGER PRIMARY KEY, thread_id INTEGER NOT NULL, who TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'text', body TEXT NOT NULL, meta_json TEXT, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_spm_thread ON sp_msgs(thread_id, id);
CREATE TABLE IF NOT EXISTS sp_files (id INTEGER PRIMARY KEY, thread_id INTEGER NOT NULL, line_id INTEGER NOT NULL, label TEXT NOT NULL, note TEXT, filename TEXT, mime TEXT, size INTEGER, skey TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_spf_line ON sp_files(line_id);
CREATE TABLE IF NOT EXISTS sp_sessions (h TEXT PRIMARY KEY, phone_id INTEGER NOT NULL, via TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS sp_tg (chat TEXT PRIMARY KEY, role TEXT NOT NULL, expert_id INTEGER, phone_id INTEGER, focus INTEGER, flow_json TEXT, ids_json TEXT, updated_at INTEGER NOT NULL) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS sp_links (token TEXT PRIMARY KEY, expert_id INTEGER NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER, payload TEXT) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS sp_sms (id INTEGER PRIMARY KEY, phone_id INTEGER NOT NULL, thread_id INTEGER, expert_id INTEGER, kind TEXT NOT NULL, body TEXT NOT NULL, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sp_passes (id INTEGER PRIMARY KEY, phone_id INTEGER NOT NULL, hash TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_sppass_phone ON sp_passes(phone_id, created_at);
`;

/* ستون‌هایی که بعد از اولین استقرارِ دمو اضافه شدند (CREATE IF NOT EXISTS روی جدولِ موجود اثری ندارد؛ api.js
   آن‌ها را در COLUMN_MIGRATIONS می‌گذارد): کدِ افزایشیِ قلم در پنل هر تأمین‌کننده، پذیرش‌های جدول تطابق،
   پیامک‌های شبیه‌سازی‌شده‌ای که منتظرند کارشناس بات مکاتبات را وصل کند؛ و (دور دوم) «پاک کردن گفت‌وگو»ی هر طرف
   — پیام‌ها در دیتابیس می‌مانند و فقط از صفحهٔ همان طرف می‌روند — و شرایطِ فاکتورِ اعلامیِ تأمین‌کننده (و عکسش
   روی هر بسته در لحظهٔ ارسال). */
export const SP_COLUMNS = [["sp_lines", "no", "INTEGER"], ["sp_bundles", "accept_json", "TEXT"], ["sp_links", "payload", "TEXT"],
  ["sp_threads", "e_clear", "INTEGER"], ["sp_threads", "s_clear", "INTEGER"], ["sp_threads", "terms_json", "TEXT"], ["sp_bundles", "terms_json", "TEXT"],
  /* (دور چهارم) پیامکِ واقعی با TextBee: از کدام راه رفت (textbee | sim | hold)، وضعیت، شناسهٔ TextBee و خطا (sp-sms.js) */
  ["sp_sms", "via", "TEXT"], ["sp_sms", "status", "TEXT"], ["sp_sms", "ref", "TEXT"], ["sp_sms", "error", "TEXT"],
  /* تیکِ «شمارهٔ پنل»: این شماره واقعاً مال همین تأمین‌کننده است و پنلش به آن وابسته است (چند شماره هم ممکن است).
     کارشناس هوشمند فقط به شماره‌های تیک‌خورده پیامک می‌دهد — تیک را فقط انسان می‌زند (worker/ai-agent.js) */
  ["sp_phones", "panel", "INTEGER"], ["sp_phones", "panel_by", "INTEGER"], ["sp_phones", "panel_at", "INTEGER"]];

/** قلم‌های بی‌کد (پیش از ستون «no») به ترتیب ساخت در پنل همان تأمین‌کننده شماره می‌گیرند — یک بار */
export async function spBackfill(env) {
  await env.DB.prepare(`UPDATE sp_lines SET no=(SELECT COUNT(*) FROM sp_lines l2 JOIN sp_threads t2 ON t2.id=l2.thread_id
      WHERE t2.supplier_id=(SELECT t.supplier_id FROM sp_threads t WHERE t.id=sp_lines.thread_id) AND l2.id<=sp_lines.id)
    WHERE no IS NULL`).run();
}

/* ------------------------------------------------------------------ */
/* ثابت‌ها                                                              */
/* ------------------------------------------------------------------ */
/** تأمین‌کنندهٔ فرضی دمو — یکی برای همه؛ پیامکش به گفت‌وگوی کارشناسی می‌رود که فرستاده */
export const DEMO = { name: "تأمین‌کنندهٔ فرضی آریانا (دمو)", phone: "09000000000", label: "دمو" };
export const COMPANY = (env) => T(env && env.COMPANY) || "تونل سد آریانا";
const PASS_TTL = 7 * 86400000;        /* رمز پیامک: هفت روز، یا تا اولین «خروج» */
const SESSION_TTL = 30 * 86400000;
const MAX_FAILS = 5, LOCK_MS = 15 * 60000, RESEND_GAP = 60000;
/* «ارسال رمز» حالا پیامکِ واقعی است (سقف پلنِ TextBee): هر شماره در ۲۴ ساعت حداکثر این‌قدر */
const RESEND_DAY = 6;
export const LINE_EDITABLE = ["new", "draft", "returned", "ready"];
export const LINE_FA = {
  new: "تازه", draft: "پیش‌نویس", ready: "آمادهٔ ارسال", submitted: "در انتظار بررسی کارشناس", returned: "برگشت برای اصلاح",
  rejected: "رد شد", approved: "منتظر پیش‌فاکتور", proforma: "پیش‌فاکتور رسید", final: "تأیید نهایی",
};
export const BUNDLE_FA = {
  pending: "در انتظار بررسی کارشناس", approved: "مشخصات تأیید شد — منتظر پیش‌فاکتور", proforma: "پیش‌فاکتور رسید — منتظر تأیید نهایی",
  returned: "برگشت خورد", rejected: "رد شد", final: "تأیید نهایی",
};
export const FILE_LABELS = ["گواهی کیفیت", "گواهی آزمایشگاه", "تصویر محصول", "کاتالوگ / برگهٔ مشخصات"];
export const PANEL_PATH = "/tamin-poshtibani/supplier.html";
export const CORR_PATH = "/tamin-poshtibani/correspond.html";

/**
 * شرایطِ فاکتورِ اعلامیِ تأمین‌کننده — کادر دومِ کارت هر قلم. همان فیلدهای اجباریِ تب استعلامات که «شرطِ فاکتور»اند
 * و برای همهٔ خط‌های یک تأمین‌کننده در یک درخواست یکی‌اند (quote-rules.js:PER_SUPPLIER)، پس روی گفت‌وگو می‌مانند
 * و در هر کارت نشان داده می‌شوند. هر بسته در لحظهٔ ارسال عکسِ خودش را دارد تا جدول تطابق با همان سنجیده شود.
 */
export const TERM_FIELDS = ["dtime", "pay", "invoice", "vat", "valid_days"];
export const TERM_REQUIRED = ["dtime", "pay", "invoice", "vat"];
export const TERM_FA = { dtime: "زمان تحویل", pay: "شرایط تسویه", invoice: "نوع فاکتور", vat: "ارزش افزوده", valid_days: "اعتبار پیش‌فاکتور (روز)" };
export const TERM_ENUMS = { pay: ENUMS.pay, invoice: ENUMS.invoice, vat: ENUMS.vat };
export const termsOf = (row) => { const t = parse(row && row.terms_json, null); return t && typeof t === "object" ? t : {}; };
export const termsMissing = (t) => TERM_REQUIRED.filter((f) => !T(t && t[f])).map((f) => TERM_FA[f]);

/* ------------------------------------------------------------------ */
/* ابزارها                                                              */
/* ------------------------------------------------------------------ */
/**
 * شمارهٔ ایران به شکل 09121234567 (یا ثابت با پیش‌شماره)؛ شمارهٔ خارجی با + ؛ نامعتبر → null.
 * +98، 0098، 98 و «+98 0912…» (با صفرِ اضافه) همه به 09… می‌رسند؛ جهت‌نماهای نامرئیِ شمارهٔ کپی‌شده هم می‌روند (sms.js:phoneChars).
 */
export function normPhone(raw) {
  let s = phoneChars(raw);
  const ir = /^(?:\+98|0098|98)0?([1-9]\d{9})$/.exec(s);
  if (ir) s = "0" + ir[1];
  else if (/^9\d{9}$/.test(s)) s = "0" + s;
  if (/^0\d{10}$/.test(s)) return s;
  if (/^\+\d{8,15}$/.test(s)) return s;
  return null;
}
export const maskPhone = (p) => { const s = String(p || ""); return s.length > 7 ? `${s.slice(0, 4)}•••${s.slice(-4)}` : s; };

/** عدد مقدار/قیمت با هر دستگاه رقم؛ خالی → null؛ نامعتبر یا منفی → NaN */
export function toNum(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : NaN;
  const s = latin(v).replace(/[,٬،\s]/g, "").replace(/٫/g, ".").replace(/ریال|تومان/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
export const randHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
export function rand6() { const a = crypto.getRandomValues(new Uint32Array(1)); return String(a[0] % 1000000).padStart(6, "0"); }
export async function sha256hex(s) { return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s)))); }
/** «نمک:هش» — رمز شش‌رقمی هرگز خام ذخیره نمی‌شود */
export async function passHash(pass, salt = randHex(8)) { return `${salt}:${await sha256hex(`${salt}:${pass}`)}`; }
async function passOk(stored, pass) { const salt = String(stored || "").split(":")[0]; return !!salt && (await passHash(pass, salt)) === stored; }

export const siteOrigin = (env, fallback) => T(env && env.SITE_ORIGIN) || fallback || "https://arianaai.website";
export const panelLink = (env, k) => `${siteOrigin(env)}${PANEL_PATH}#k=${k}`;
export const corrLink = (env) => `${siteOrigin(env)}${CORR_PATH}`;
export const botLink = (user, param) => (user ? `https://t.me/${user}${param ? `?start=${param}` : ""}` : null);

/** نام کاربری بات تأمین‌کنندگان — از متغیر، یا آنچه وبهوکِ آن بات هنگام ثبت از getMe ذخیره کرده.
    اگر هنوز چیزی ذخیره نشده (اولین Cron بعد از استقرار نرسیده)، یک بار از خودِ تلگرام. */
export async function spBotUser(env) {
  if (T(env.TG_SP_BOT_USERNAME)) return T(env.TG_SP_BOT_USERNAME);
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key='spBot'").first().catch(() => null);
  const v = r ? parse(r.value, null) : null;
  if (v && v.username) return v.username;
  if (!env.TG_SP_BOT_TOKEN) return null;
  try {
    const me = await telegram(env, "sp").getMe();
    await env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('spBot',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
      .bind(JSON.stringify({ ...(v || {}), username: me.username, id: me.id }), now()).run();
    return me.username || null;
  } catch (_) { return null; }
}

const msgStmt = (env, thId, who, kind, body, meta, t) =>
  env.DB.prepare("INSERT INTO sp_msgs (thread_id,who,kind,body,meta_json,at) VALUES (?,?,?,?,?,?)").bind(thId, who, kind, body, meta ? JSON.stringify(meta) : null, t);
const touchStmt = (env, thId, t, rev = true) => env.DB.prepare(`UPDATE sp_threads SET last_at=?${rev ? ", rev=rev+1" : ""} WHERE id=?`).bind(t, thId);
const msgObj = (id, thId, who, kind, body, meta, t) => ({ id, thread_id: thId, who, kind, body, meta: meta || null, at: t });
export const msgOut = (m) => ({ id: m.id, who: m.who, kind: m.kind, body: m.body, meta: m.meta !== undefined ? m.meta : parse(m.meta_json, null), at: m.at });
/**
 * پیام برای صفحهٔ یک طرف. پیامِ صوتی (kind «voice»): متنِ پیاده‌شده از صدا فقط سمتِ کارشناس — تأمین‌کننده فقط صدای خودش
 * را می‌بیند (درخواست مالک، مهر ۱۴۰۵) — و کلیدِ انبار هیچ‌جا بیرون نمی‌رود (صدا از /sp/msg/:id/voice با سنجشِ دسترسی).
 */
export function msgFor(m, side) {
  if (!m || m.kind !== "voice") return m;
  const v = (m.meta && m.meta.voice) || {};
  const voice = { dur: v.dur || null, mime: v.mime || null };
  return side === "e" ? { ...m, meta: { ...m.meta, voice } } : { ...m, body: "", meta: { voice } };
}
export const fmtMoney = (n) => (n == null || !Number.isFinite(Number(n)) ? "—" : Number(n).toLocaleString("en-US"));
/* متن رخدادها با رقم فارسی (عنوان قلم دست نمی‌خورد — «M8» باید M8 بماند) */
const faN = (s) => String(s).replace(/\d/g, (d) => FA[+d]).replace(/,/g, "٬").replace(/\./g, "٫");
const qtyTxt = (n) => (n == null ? "—" : faN(String(Math.round(Number(n) * 1000) / 1000)));
const moneyTxt = (n) => faN(fmtMoney(n));
/** «کد ۷ — » پیش از نام قلم: کدِ افزایشیِ پنلِ همان تأمین‌کننده */
const codeTxt = (no) => (no ? `کد ${faN(no)} — ` : "");
/** فهرست اقلامِ یک رخداد، هر قلم با کد و نامش — تا هر پیامِ گفت‌وگو بگوید دقیقاً کدام قلم */
const itemsTxt = (lines) => lines.map((l) => `• ${codeTxt(l.no)}${l.title}`).join("\n");
/** مشخصات اصلیِ یک قلم برای پیام‌ها: لایه‌های قفل و افزوده */
const layersOf = (l) => [...(Array.isArray(l.layers) ? l.layers : parse(l.layers_json, [])), ...(Array.isArray(l.extra) ? l.extra : parse(l.extra_json, []))];
const specTxt = (l) => layersOf(l).map((x) => `${x.k}: ${x.v}`).join(" · ");
/**
 * عکسِ قلم‌های یک رخداد در meta پیام — صفحه‌ها کارتِ مرتبِ پیام را از همین می‌سازند (کد و عنوان، بعد قیمت و
 * مشخصات) و کلیک روی آن به بخشِ اقدام و تصمیمِ همان بسته یا قلم می‌رود. عکس است تا ویرایشِ بعدی تاریخچه را عوض نکند.
 */
const itemSnap = (l, withPrice) => ({
  no: l.no || null, title: l.title, head: l.head || null, qty: l.qty == null ? null : Number(l.qty), unit: l.unit || null,
  ...(withPrice ? { price: l.price == null ? null : Number(l.price) } : {}), layers: Array.isArray(l.layers) ? l.layers : parse(l.layers_json, []),
  extra: Array.isArray(l.extra) ? l.extra : parse(l.extra_json, []),
});
/** یک قلم در متنِ پیام: سطرِ اول کد و عنوان، زیرش مقدار (و قیمت) و مشخصات اصلی */
const itemBlock = (l, withPrice) => {
  const amount = withPrice ? `${qtyTxt(l.qty)} ${T(l.unit)} × ${moneyTxt(l.price)} ریال = ${moneyTxt(Number(l.qty) * Number(l.price))} ریال` : `${qtyTxt(l.qty)} ${T(l.unit)}`;
  const spec = specTxt(l);
  return `▫️ ${codeTxt(l.no)}${l.title}\n    ${amount}${spec ? `\n    ${spec}` : ""}`;
};
const termsLine = (t) => TERM_FIELDS.filter((f) => T(t && t[f])).map((f) => `${TERM_FA[f].replace(" (روز)", "")}: ${faN(t[f])}${f === "valid_days" ? " روز" : ""}`).join(" · ");

/* ------------------------------------------------------------------ */
/* هویت تأمین‌کننده: لینک + رمز پیامک → نشست                              */
/* ------------------------------------------------------------------ */
export async function phoneIdentity(env, phoneId) {
  return env.DB.prepare(`SELECT p.id AS phone_id, p.supplier_id, p.phone, p.label, p.k, s.name, s.demo
    FROM sp_phones p JOIN sp_suppliers s ON s.id=p.supplier_id WHERE p.id=?`).bind(phoneId).first();
}

export async function sessionOf(env, token) {
  if (!T(token)) return null;
  const s = await env.DB.prepare("SELECT phone_id FROM sp_sessions WHERE h=? AND revoked_at IS NULL AND expires_at>?").bind(await sha256hex(T(token)), now()).first();
  return s ? phoneIdentity(env, s.phone_id) : null;
}

export async function newSession(env, phoneId, via) {
  const tok = randHex(24);
  const t = now();
  await env.DB.prepare("INSERT INTO sp_sessions (h,phone_id,via,created_at,expires_at) VALUES (?,?,?,?,?)").bind(await sha256hex(tok), phoneId, via || "web", t, t + SESSION_TTL).run();
  return tok;
}

/** خروج: نشست باطل و همهٔ رمزهای پیامکِ این شماره هم باطل — ورودِ دوباره فقط با «ارسال رمز به پیامک» */
export async function logout(env, phoneId, token) {
  const stmts = [
    env.DB.prepare("UPDATE sp_phones SET pass_hash=NULL WHERE id=?").bind(phoneId),
    env.DB.prepare("DELETE FROM sp_passes WHERE phone_id=?").bind(phoneId),
  ];
  if (T(token)) stmts.push(env.DB.prepare("UPDATE sp_sessions SET revoked_at=? WHERE h=?").bind(now(), await sha256hex(T(token))));
  await env.DB.batch(stmts);
}

/** رمزهای زندهٔ یک شماره: هر پیامک رمز خودش را دارد و تا هفت روز (یا تا «خروج») معتبر است — پیامکِ
    تازه رمزِ پیامکِ قبلی را باطل نمی‌کند. pass_hash روی sp_phones شکلِ قبلی (یک رمز) است و تا انقضا پذیرفته می‌شود. */
async function liveHashes(env, p, t) {
  const rows = (await env.DB.prepare("SELECT hash FROM sp_passes WHERE phone_id=? AND created_at>? ORDER BY id DESC LIMIT 20").bind(p.id, t - PASS_TTL).all()).results || [];
  const out = rows.map((r) => r.hash);
  if (p.pass_hash && p.pass_at && t - p.pass_at < PASS_TTL) out.push(p.pass_hash);
  return out;
}

/** ورود با کلیدِ لینک و رمز. پنج اشتباهِ پشت‌سرهم → ۱۵ دقیقه قفل (رمز شش‌رقمی بی این سقف حدس‌زدنی است) */
export async function login(env, k, pass) {
  const p = await env.DB.prepare("SELECT * FROM sp_phones WHERE k=?").bind(T(k)).first();
  if (!p) throw new HttpError("این لینک ورود معتبر نیست.", 404);
  const t = now();
  if (p.lock_until && p.lock_until > t) throw new HttpError("چند بار پشت سر هم رمز اشتباه وارد شد؛ ۱۵ دقیقهٔ دیگر دوباره امتحان کنید یا «ارسال رمز به پیامک» را بزنید.", 429);
  const code = latin(T(pass));
  const hashes = await liveHashes(env, p, t);
  const live = hashes.length > 0;
  let ok = false;
  if (live && /^\d{6}$/.test(code)) for (const h of hashes) if (await passOk(h, code)) { ok = true; break; }
  if (!ok) {
    const fails = (p.fails || 0) + 1, lock = fails >= MAX_FAILS;
    await env.DB.prepare("UPDATE sp_phones SET fails=?, lock_until=? WHERE id=?").bind(lock ? 0 : fails, lock ? t + LOCK_MS : null, p.id).run();
    if (lock) throw new HttpError("پنج بار رمز اشتباه وارد شد؛ ورود ۱۵ دقیقه بسته شد.", 429);
    if (!live) throw new HttpError("رمز فعالی برای این شماره نیست (یا منقضی شده است)؛ «ارسال رمز به پیامک» را بزنید.", 401);
    throw new HttpError("رمز درست نیست.", 401);
  }
  if (p.fails || p.lock_until) await env.DB.prepare("UPDATE sp_phones SET fails=0, lock_until=NULL WHERE id=?").bind(p.id).run();
  return phoneIdentity(env, p.id);
}

/** رمز تازه برای یک پیامک؛ خودِ رمز فقط برای متنِ پیامک برمی‌گردد و هیچ‌جا خام نمی‌ماند.
    رمزهای منقضیِ همین شماره همان‌جا پاک می‌شوند تا جدول بی‌دلیل بزرگ نشود. */
async function newPassword(env, phoneId) {
  const pass = rand6(), t = now();
  return { pass, stmts: [
    env.DB.prepare("INSERT INTO sp_passes (phone_id,hash,created_at) VALUES (?,?,?)").bind(phoneId, await passHash(pass), t),
    env.DB.prepare("DELETE FROM sp_passes WHERE phone_id=? AND created_at<?").bind(phoneId, t - PASS_TTL),
    /* pass_at فقط مالِ رمزِ شکلِ قبلی (sp_phones.pass_hash) است؛ دست نمی‌خورد تا عمرش دراز نشود */
    env.DB.prepare("UPDATE sp_phones SET fails=0, lock_until=NULL WHERE id=?").bind(phoneId),
  ] };
}

/** متن پیامک — همان که به‌جای پیامک (فعلاً خاموش) در گفت‌وگوی کارشناس نشان داده می‌شود */
function smsBody(env, { intro, k, bot, pass }) {
  return [T(intro), "", `🔗 پنل تأمین‌کننده: ${panelLink(env, k)}`, bot ? `📲 یا در تلگرام: ${botLink(bot, "s" + k)}` : null, `🔑 رمز ورود: ${pass}`]
    .filter((x) => x != null).join("\n");
}
const maskPass = (text, pass) => String(text).split(pass).join("••••••");

/** «ارسال رمز به پیامک» از صفحهٔ ورود یا بات. پیامک شبیه‌سازی‌شده به کارشناسِ آخرین گفت‌وگوی همین تأمین‌کننده می‌رود */
export async function resendPassword(env, k) {
  const p = await env.DB.prepare("SELECT * FROM sp_phones WHERE k=?").bind(T(k)).first();
  if (!p) throw new HttpError("این لینک ورود معتبر نیست.", 404);
  const t = now();
  if (p.resend_at && t - p.resend_at < RESEND_GAP) throw new HttpError("یک دقیقه صبر کنید و دوباره بخواهید.", 429);
  const day = await env.DB.prepare("SELECT COUNT(*) AS n FROM sp_sms WHERE phone_id=? AND kind='pass' AND at>?").bind(p.id, t - 86400000).first();
  if (day && day.n >= RESEND_DAY) throw new HttpError("امروز چند بار رمز فرستاده شده است؛ فردا دوباره بخواهید یا با کارشناس خرید تماس بگیرید.", 429);
  const th = await env.DB.prepare(`SELECT t.id, a.expert_id, e.telegram_chat FROM sp_threads t JOIN assignments a ON a.id=t.assignment_id
    JOIN experts e ON e.id=a.expert_id WHERE t.supplier_id=? ORDER BY t.last_at DESC LIMIT 1`).bind(p.supplier_id).first();
  const sup = await env.DB.prepare("SELECT name, demo FROM sp_suppliers WHERE id=?").bind(p.supplier_id).first();
  const { pass, stmts } = await newPassword(env, p.id);
  const bot = await spBotUser(env);
  const text = smsBody(env, { intro: `رمز تازهٔ ورود به پنل تأمین‌کنندگان شرکت ${COMPANY(env)}`, k: p.k, bot, pass });
  const res = await env.DB.batch([
    ...stmts,
    env.DB.prepare("UPDATE sp_phones SET resend_at=? WHERE id=?").bind(t, p.id),
    env.DB.prepare("INSERT INTO sp_sms (phone_id,thread_id,expert_id,kind,body,at) VALUES (?,?,?,'pass',?,?)").bind(p.id, th ? th.id : null, th ? th.expert_id : null, maskPass(text, pass), t),
  ]);
  return { to: p.phone, masked: maskPhone(p.phone), label: p.label, supplier: sup ? sup.name : "", demo: !!(sup && sup.demo), text, expertChat: th ? th.telegram_chat : null,
    expertId: th ? th.expert_id : null, threadId: th ? th.id : null, panel: panelLink(env, p.k), bot: botLink(bot, "s" + p.k),
    smsId: res[res.length - 1].meta.last_row_id };
}

/* ------------------------------------------------------------------ */
/* ارسال استعلام (کارشناس)                                              */
/* ------------------------------------------------------------------ */

/** لایه‌های قفل‌شدهٔ یک قلم: ساختار تأییدشدهٔ کارشناس، وگرنه فهرست اقلام؛ بی‌ساختار → «مشخصات» همان سطر */
export async function lockedLayers(env, it) {
  const n = normOf(it);
  let head = n && n.head, layers = n && n.layers;
  if (!layers) {
    const db = await dbStruct(env, it).catch(() => null);
    if (db && db.struct) { head = head || db.struct.head; layers = db.struct.layers; }
  }
  return { head: head ? nrm(head) : null, layers: packLayers(layers, it.spec) };
}
/** لایه‌های خطِ تأمین‌کننده از ساختارِ قلم؛ قلمِ بی‌لایه با «مشخصات فنی»ِ خودش */
function packLayers(layers, spec) {
  const out = Object.entries(layers || {}).map(([k, v]) => ({ k: nrm(k), v: nrm(layerText(v)) })).filter((x) => x.k && x.v);
  if (!out.length && T(spec)) out.push({ k: "مشخصات فنی", v: nrm(spec).slice(0, 300) });
  return out;
}

/**
 * بستهٔ قفل‌شده (درخواست کاربر، مهر ۱۴۰۵): اولین ارسالِ هر قلم به یک تأمین‌کنندهٔ واقعی عنوان، نوع قلم، لایه‌های ویژگی،
 * مقدار و واحدش را قفل می‌کند. هر ارسالِ بعدی — به هر تأمین‌کننده، از پنل، بات یا کارشناس هوشمند — عینِ همان می‌رود و
 * ساختارِ قلم دیگر ویرایش نمی‌شود (api.js: /items/:id/norm و /edit). ارسال به تأمین‌کنندهٔ فرضی (دمو) قفل نمی‌کند.
 * خروجی Map(item_id → {title, head, layers, qty, unit, at}) — عکسِ همان اولین خطِ تأمین‌کننده.
 */
export async function itemLocks(env, itemIds) {
  const ids = [...new Set((itemIds || []).map(int).filter(Boolean))];
  const out = new Map();
  for (let i = 0; i < ids.length; i += 80) {
    const part = ids.slice(i, i + 80);
    const rows = (await env.DB.prepare(`SELECT l.item_id, l.title, l.head, l.layers_json, l.req_qty, l.req_unit, l.created_at FROM sp_lines l
        JOIN sp_threads t ON t.id=l.thread_id JOIN sp_suppliers s ON s.id=t.supplier_id
        WHERE s.demo=0 AND l.item_id IN (${part.map(() => "?").join(",")}) ORDER BY l.id`).bind(...part).all()).results || [];
    for (const r of rows) {
      if (!out.has(r.item_id)) out.set(r.item_id, { title: r.title, head: r.head, layers: parse(r.layers_json, []), qty: r.req_qty, unit: r.req_unit, at: r.created_at });
    }
  }
  return out;
}
export const LOCK_MSG = "این قلم برای تأمین‌کننده فرستاده شده و قفل است: عنوان، نوع قلم و لایه‌های ویژگی‌اش عوض نمی‌شود تا همهٔ تأمین‌کنندگان عینِ همان بسته را بگیرند. نرخ‌های تبدیل را هنوز می‌شود ذخیره کرد.";
/** ساختارِ تازه همان بستهٔ قفل‌شده است؟ — ذخیرهٔ قلمِ قفل فقط وقتی پذیرفته است که فقط نرخ‌ها عوض شده باشند */
export function sameAsLock(lock, head, layers, spec) {
  const key = (xs) => JSON.stringify((xs || []).map((x) => [x.k, x.v]).sort());
  return nrm(head || "") === nrm(lock.head || "") && key(packLayers(layers, spec)) === key(lock.layers);
}

async function findOrCreateSupplier(env, name, by) {
  const n = nrm(name).slice(0, 120);
  const have = await env.DB.prepare("SELECT * FROM sp_suppliers WHERE name_n=? AND demo=0 ORDER BY id LIMIT 1").bind(nkey(n)).first();
  if (have) return have;
  const r = await env.DB.prepare("INSERT INTO sp_suppliers (name,name_n,demo,created_by,created_at) VALUES (?,?,0,?,?)").bind(n, nkey(n), by || null, now()).run();
  return { id: r.meta.last_row_id, name: n, name_n: nkey(n), demo: 0 };
}

async function insertPhone(env, supplierId, phone, label, by) {
  const k = randHex(6);
  const r = await env.DB.prepare("INSERT INTO sp_phones (supplier_id,phone,label,k,created_by,created_at) VALUES (?,?,?,?,?,?)").bind(supplierId, phone, label || null, k, by || null, now()).run();
  return { id: r.meta.last_row_id, supplier_id: supplierId, phone, label: label || null, k };
}

/** تأمین‌کنندهٔ فرضی و شماره‌اش؛ اگر هنوز نیست ساخته می‌شود */
export async function demoSupplier(env, by) {
  const ph = await env.DB.prepare("SELECT * FROM sp_phones WHERE phone=?").bind(DEMO.phone).first();
  if (ph) return { sup: await env.DB.prepare("SELECT * FROM sp_suppliers WHERE id=?").bind(ph.supplier_id).first(), ph };
  const r = await env.DB.prepare("INSERT INTO sp_suppliers (name,name_n,demo,created_by,created_at) VALUES (?,?,1,?,?)").bind(DEMO.name, nkey(DEMO.name), by || null, now()).run();
  const sup = { id: r.meta.last_row_id, name: DEMO.name, demo: 1 };
  return { sup, ph: await insertPhone(env, sup.id, DEMO.phone, DEMO.label, by) };
}

/**
 * دفترچهٔ شماره‌ها (تب «کارشناس هوشمند»): شمارهٔ تازه برای یک تأمین‌کننده یا ویرایشِ برچسب و تیکِ «پنل» روی شمارهٔ
 * موجود. هر شماره مالِ یک تأمین‌کننده است؛ یک تأمین‌کننده می‌تواند چند شمارهٔ تیک‌خورده داشته باشد.
 * panel: true/false — فقط انسان می‌زندش؛ کارشناس هوشمند فقط به شماره‌های تیک‌خورده پیامک می‌دهد.
 */
export async function savePhone(env, by, b) {
  let sup = int(b.supplier_id) ? await env.DB.prepare("SELECT * FROM sp_suppliers WHERE id=? AND demo=0").bind(int(b.supplier_id)).first() : null;
  if (!sup) {
    if (!nrm(b.supplier_name)) throw new HttpError("نام تأمین‌کننده لازم است.");
    sup = await findOrCreateSupplier(env, b.supplier_name, by);
  }
  const num = normPhone(b.phone);
  if (!num) throw new HttpError("شمارهٔ تلفن معتبر نیست (مثل 09121234567).");
  if (num === DEMO.phone) throw new HttpError("این شمارهٔ تأمین‌کنندهٔ فرضی است.");
  const label = nrm(b.label).slice(0, 30);
  let ph = await env.DB.prepare("SELECT * FROM sp_phones WHERE phone=?").bind(num).first();
  if (ph && ph.supplier_id !== sup.id) {
    const other = await env.DB.prepare("SELECT name FROM sp_suppliers WHERE id=?").bind(ph.supplier_id).first();
    throw new HttpError(`این شماره قبلاً برای «${other ? other.name : "تأمین‌کنندهٔ دیگر"}» ثبت شده است.`, 409);
  }
  if (!ph) {
    if (!label) throw new HttpError("برای شمارهٔ تازه یک برچسب بزنید (مثلاً «همراه مدیر فروش»).");
    ph = await insertPhone(env, sup.id, num, label, by);
  } else if (label && label !== ph.label) {
    await env.DB.prepare("UPDATE sp_phones SET label=? WHERE id=?").bind(label, ph.id).run();
    ph.label = label;
  }
  if (b.panel !== undefined) await setPanel(env, ph.id, !!b.panel, by);
  const row = await env.DB.prepare("SELECT id, phone, label, panel, panel_at FROM sp_phones WHERE id=?").bind(ph.id).first();
  return { supplier: { id: sup.id, name: sup.name }, phone: { ...row, panel: !!row.panel } };
}
/** تیکِ «پنل» یک شماره — با این‌که چه کسی و کی */
export async function setPanel(env, phoneId, on, by) {
  await env.DB.prepare("UPDATE sp_phones SET panel=?, panel_by=?, panel_at=? WHERE id=?").bind(on ? 1 : 0, by || null, now(), int(phoneId)).run();
}

/** شماره‌های ثبت‌شدهٔ یک تأمین‌کننده (با نام) — برای انتخاب شماره هنگام ارسال */
export async function phonesOfName(env, name) {
  return (await env.DB.prepare(`SELECT p.id, p.phone, p.label, p.panel, s.id AS supplier_id, s.name FROM sp_phones p JOIN sp_suppliers s ON s.id=p.supplier_id
    WHERE s.name_n=? AND s.demo=0 ORDER BY p.id`).bind(nkey(name)).all()).results || [];
}

/**
 * ارسال استعلام: گفت‌وگو (درخواست × تأمین‌کننده)، خطِ مشخصات برای هر قلمِ تازه، پیام کارشناس، رمز تازه
 * و متن پیامک. قلمی که قبلاً برای همین تأمین‌کننده رفته دوباره ساخته نمی‌شود؛ ولی پیامک (با رمز تازه)
 * باز هم می‌رود — «ارسال» دوباره یعنی یادآوری.
 *
 * b: {assignment_id, item_ids, text, demo} + یا {supplier_id|supplier_name, phone_id | phone+label}
 *    sms (اختیاری): اولِ پیامک وقتی باید کوتاه‌تر از text (اولین پیامِ گفت‌وگو) باشد.
 *    silent: گفت‌وگو از قبل هست و این فقط پیامکِ شمارهٔ دیگری از همان تأمین‌کننده است — پیامِ تازه‌ای در گفت‌وگو نمی‌نشیند.
 */
export async function spSend(env, ex, b) {
  const aid = int(b.assignment_id);
  const asg = aid ? await env.DB.prepare("SELECT a.id, a.request_id, a.expert_id, a.dispatched_at, r.party FROM assignments a JOIN requests r ON r.id=a.request_id WHERE a.id=?").bind(aid).first() : null;
  if (!asg || asg.expert_id !== ex.id) throw new HttpError("این درخواست متعلق به شما نیست.", 403);
  const want = [...new Set((Array.isArray(b.item_ids) ? b.item_ids : []).map(int).filter(Boolean))].slice(0, 40);
  if (!want.length) throw new HttpError("دست‌کم یک قلم را انتخاب کنید.");
  const its = ((await env.DB.prepare(`SELECT id, title, qty, unit, spec, code, norm_json, state FROM items WHERE assignment_id=? AND id IN (${want.map(() => "?").join(",")}) ORDER BY line_no`)
    .bind(aid, ...want).all()).results || []).filter((i) => i.state === "open");
  if (!its.length) throw new HttpError("این اقلام دیگر باز نیستند.", 409);

  let sup, ph;
  if (b.demo) ({ sup, ph } = await demoSupplier(env, ex.id));
  else {
    sup = int(b.supplier_id) ? await env.DB.prepare("SELECT * FROM sp_suppliers WHERE id=?").bind(int(b.supplier_id)).first() : null;
    if (!sup) {
      if (!nrm(b.supplier_name)) throw new HttpError("نام تأمین‌کننده لازم است.");
      sup = await findOrCreateSupplier(env, b.supplier_name, ex.id);
    }
    const label = nrm(b.label).slice(0, 30);
    if (int(b.phone_id)) {
      ph = await env.DB.prepare("SELECT * FROM sp_phones WHERE id=? AND supplier_id=?").bind(int(b.phone_id), sup.id).first();
      if (!ph) throw new HttpError("این شماره مال این تأمین‌کننده نیست.", 409);
    } else {
      const num = normPhone(b.phone);
      if (!num) throw new HttpError("شمارهٔ تلفن معتبر نیست (مثل 09121234567).");
      if (num === DEMO.phone) throw new HttpError("این شمارهٔ تأمین‌کنندهٔ فرضی است؛ گزینهٔ «تأمین‌کنندهٔ فرضی» را بزنید.");
      ph = await env.DB.prepare("SELECT * FROM sp_phones WHERE phone=?").bind(num).first();
      if (ph && ph.supplier_id !== sup.id) {
        const other = await env.DB.prepare("SELECT name FROM sp_suppliers WHERE id=?").bind(ph.supplier_id).first();
        throw new HttpError(`این شماره قبلاً برای «${other ? other.name : "تأمین‌کنندهٔ دیگر"}» ثبت شده است.`, 409);
      }
      if (!ph) {
        if (!label) throw new HttpError("برای شمارهٔ تازه یک برچسب بزنید (مثلاً «فروش» یا «همراه مدیر»).");
        ph = await insertPhone(env, sup.id, num, label, ex.id);
      }
    }
    if (label && label !== ph.label) { await env.DB.prepare("UPDATE sp_phones SET label=? WHERE id=?").bind(label, ph.id).run(); ph.label = label; }
  }

  const t = now();
  let th = await env.DB.prepare("SELECT * FROM sp_threads WHERE assignment_id=? AND supplier_id=?").bind(aid, sup.id).first();
  if (!th) {
    const r = await env.DB.prepare("INSERT INTO sp_threads (assignment_id,request_id,supplier_id,phone_id,created_by,last_at,created_at) VALUES (?,?,?,?,?,?,?)")
      .bind(aid, asg.request_id, sup.id, ph.id, ex.id, t, t).run();
    th = { id: r.meta.last_row_id };
  }
  const oldRows = (await env.DB.prepare("SELECT item_id, no, title, head, layers_json, req_qty, req_unit FROM sp_lines WHERE thread_id=?").bind(th.id).all()).results || [];
  const old = new Map(oldRows.map((x) => [x.item_id, x.no]));
  const oldById = new Map(oldRows.map((x) => [x.item_id, x]));
  const fresh = its.filter((i) => !old.has(i.id));
  /* بستهٔ قفل‌شده: قلمی که قبلاً برای تأمین‌کنندهٔ واقعیِ دیگری رفته، با همان عنوان، لایه‌ها، مقدار و واحد می‌رود */
  const locks = await itemLocks(env, fresh.map((i) => i.id));
  const pack = await Promise.all(fresh.map(async (i) => locks.get(i.id) || { title: nrm(i.title), qty: i.qty, unit: T(i.unit) || null, ...(await lockedLayers(env, i)) }));
  /* کدِ قلم در پنل همین تأمین‌کننده: شمارش افزایشی، جدا از کد راهکاران (که مال خود شرکت است) */
  const top = await env.DB.prepare("SELECT COALESCE(MAX(l.no),0) AS n FROM sp_lines l JOIN sp_threads t ON t.id=l.thread_id WHERE t.supplier_id=?").bind(sup.id).first();
  const nos = new Map([...old].map(([id, no]) => [id, no]));
  fresh.forEach((i, n) => nos.set(i.id, (top ? top.n : 0) + n + 1));

  const stmts = fresh.map((i, n) => env.DB.prepare(
    "INSERT INTO sp_lines (thread_id,item_id,title,head,layers_json,req_qty,req_unit,qty,unit,state,no,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'new',?,?,?)",
  ).bind(th.id, i.id, pack[n].title, pack[n].head, JSON.stringify(pack[n].layers), pack[n].qty, pack[n].unit, pack[n].qty, pack[n].unit, nos.get(i.id), t, t));
  const { pass, stmts: passStmts } = await newPassword(env, ph.id);
  const silent = !!b.silent && oldRows.length > 0 && !fresh.length;
  stmts.push(...passStmts, silent ? env.DB.prepare("UPDATE sp_threads SET last_at=? WHERE id=?").bind(t, th.id)
    : env.DB.prepare("UPDATE sp_threads SET phone_id=?, last_at=?, rev=rev+1 WHERE id=?").bind(ph.id, t, th.id));

  const text = T(b.text).slice(0, 3000);
  /* هر قلمِ استعلام: کد و عنوان، زیرش مقدارِ خواسته و لایه‌های قفل — عکسش در meta برای کارتِ پیام */
  const evLines = (fresh.length ? fresh : its).map((i) => {
    const o = oldById.get(i.id), p = pack[fresh.indexOf(i)];
    if (p) return { no: nos.get(i.id), title: p.title, head: p.head, qty: p.qty, unit: p.unit, layers: p.layers, extra: [] };
    return { no: nos.get(i.id), title: (o && o.title) || nrm(i.title), head: o && o.head, qty: o ? o.req_qty : i.qty, unit: o ? o.req_unit : T(i.unit) || null,
      layers: parse(o && o.layers_json, []), extra: [] };
  });
  const evBody = `${fresh.length ? `📦 استعلام ${faN(fresh.length)} قلم:` : "🔁 یادآوری استعلام:"}\n${evLines.map((l) => itemBlock(l, false)).join("\n")}`;
  const msgs = [];
  const mark = b.ai ? { ai: true } : null;
  if (!silent) {
    if (text) msgs.push(["e", "text", text, mark]);
    msgs.push(["e", "event", evBody, { ev: fresh.length ? "rfq" : "remind", items: evLines.map((l) => itemSnap(l, false)), ...(mark || {}) }]);
  }
  const msgAt = stmts.length;
  for (const [who, kind, body, meta] of msgs) stmts.push(msgStmt(env, th.id, who, kind, body, meta, t));
  const bot = await spBotUser(env);
  const smsTxt = smsBody(env, { intro: T(b.sms).slice(0, 600) || text || `استعلام قیمت از شرکت ${COMPANY(env)} — ${faN(fresh.length || its.length)} قلم`, k: ph.k, bot, pass });
  const smsAt = stmts.length;
  stmts.push(env.DB.prepare("INSERT INTO sp_sms (phone_id,thread_id,expert_id,kind,body,at) VALUES (?,?,?,'rfq',?,?)").bind(ph.id, th.id, ex.id, maskPass(smsTxt, pass), t));
  const res = await env.DB.batch(stmts);
  const out = msgs.map(([who, kind, body, meta], n) => msgObj(res[msgAt + n].meta.last_row_id, th.id, who, kind, body, meta, t));
  return {
    ok: true, thread_id: th.id, request_id: asg.request_id, added: fresh.length, skipped: its.length - fresh.length,
    supplier: { id: sup.id, name: sup.name, demo: !!sup.demo }, phone: { id: ph.id, phone: ph.phone, label: ph.label, k: ph.k },
    sms: { id: res[smsAt].meta.last_row_id, to: ph.phone, label: ph.label, text: smsTxt }, links: { panel: panelLink(env, ph.k), bot: botLink(bot, "s" + ph.k) }, msgs: out,
  };
}

/* ------------------------------------------------------------------ */
/* خواندن                                                                */
/* ------------------------------------------------------------------ */
const THREAD_SQL = `SELECT t.*, s.name AS supplier_name, s.demo, p.phone, p.label AS phone_label, p.k AS phone_k,
    a.expert_id, r.party, e.name AS expert_name, e.label AS expert_label, e.telegram_chat AS expert_chat
  FROM sp_threads t JOIN sp_suppliers s ON s.id=t.supplier_id LEFT JOIN sp_phones p ON p.id=t.phone_id
  JOIN assignments a ON a.id=t.assignment_id JOIN requests r ON r.id=a.request_id JOIN experts e ON e.id=a.expert_id`;

/** یک گفت‌وگو بی سنجش دسترسی — فقط برای پخش پیام به هر دو طرف (sp-push.js) */
export const threadRow = (env, id) => env.DB.prepare(`${THREAD_SQL} WHERE t.id=?`).bind(id).first();

/**
 * یک گفت‌وگو با سنجش دسترسی. کارشناسِ «فعلیِ» ارجاع صاحب آن است — اگر درخواست به کارشناس دیگری
 * برود، گفت‌وگو هم با آن می‌رود (درس F-05). تأمین‌کننده فقط گفت‌وگوهای خودش را می‌بیند.
 */
export async function threadFor(env, id, who) {
  const th = int(id) ? await env.DB.prepare(`${THREAD_SQL} WHERE t.id=?`).bind(int(id)).first() : null;
  if (!th) throw new HttpError("این گفت‌وگو پیدا نشد.", 404);
  if (who.expert && th.expert_id !== who.expert.id) throw new HttpError("این گفت‌وگو متعلق به شما نیست.", 403);
  if (who.supplier && th.supplier_id !== who.supplier.supplier_id) throw new HttpError("این استعلام متعلق به شما نیست.", 403);
  /* گفت‌وگوی کارشناس هوشمند برای کارشناسِ «هوشمند» بسته است، مگر «پرسش از کارشناس» (ai-lock.js). خودِ کارشناس هوشمند
     (who.ai) از این‌جا رد می‌شود — تصمیم‌هایش با همین توابع است */
  if (who.expert && !who.ai) {
    const L = await aiThread(env, th.id, th.expert_id);
    if (L.locked) throw new HttpError(AI_THREAD_MSG, 423, { ai_locked: true });
    th.ai = L;
  }
  return th;
}

/** خوانده‌شده تا آخرین پیام — فقط اگر چیز تازه‌ای هست (هر بار خواندن نباید یک نوشتن در D1 باشد) */
export async function markSeen(env, thId, side) {
  const col = side === "e" ? "e_seen" : "s_seen";
  await env.DB.prepare(`UPDATE sp_threads SET ${col}=(SELECT COALESCE(MAX(id),0) FROM sp_msgs WHERE thread_id=?1)
    WHERE id=?1 AND ${col}<(SELECT COALESCE(MAX(id),0) FROM sp_msgs WHERE thread_id=?1)`).bind(thId).run();
}

export function threadOut(th, side) {
  return {
    id: th.id, request_id: th.request_id, supplier: th.supplier_name, demo: !!th.demo, expert: th.expert_label || th.expert_name,
    phone: side === "e" ? th.phone : maskPhone(th.phone), phone_label: th.phone_label, rev: th.rev, last_at: th.last_at, terms: termsOf(th),
    ...(side === "e" ? { assignment_id: th.assignment_id, party: th.party,
      ai: th.ai && th.ai.ai ? { locked: !!th.ai.locked, ask: th.ai.ask ? { q: T(th.ai.ask.q), at: th.ai.ask.at || 0 } : null } : null } : {}),
  };
}
/** پیام‌هایی که این طرف از صفحه‌اش پاک کرده: تا همین شناسه (در دیتابیس می‌مانند و طرف دیگر هنوز می‌بیند) */
export const clearedUpTo = (th, side) => Number((side === "e" ? th.e_clear : th.s_clear) || 0);
export function lineOut(l) {
  const qty = l.qty == null ? null : Number(l.qty), price = l.price == null ? null : Number(l.price);
  return {
    id: l.id, no: l.no || null, item_id: l.item_id, title: l.title, head: l.head, layers: parse(l.layers_json, []), extra: parse(l.extra_json, []),
    req_qty: l.req_qty, req_unit: l.req_unit, qty, unit: l.unit, price, total: qty != null && price != null ? qty * price : null,
    note: l.note, state: l.state, state_fa: LINE_FA[l.state] || l.state, bundle_id: l.bundle_id, quote_id: l.quote_id, missing: lineMissing(l),
  };
}
/** بسته برای نمایش؛ کارشناس جدول تطابق، پذیرش‌هایش و این‌که تأیید نهایی ممکن است یا چه مانعی مانده را هم می‌بیند */
export function bundleOut(b, side) {
  const ai0 = side === "e" ? parse(b.ai_json, null) : null;
  const ai = aiUsable(ai0) ? ai0 : null;
  const accept = side === "e" ? parse(b.accept_json, {}) : null;
  const match = ai ? resolve(ai, accept) : null;
  return {
    id: b.id, line_ids: parse(b.line_ids, []), state: b.state, state_fa: BUNDLE_FA[b.state] || b.state, comment: b.comment, terms: termsOf(b),
    pf: b.pf_key ? { name: b.pf_name, mime: b.pf_mime, size: b.pf_size, at: b.pf_at } : null,
    ...(side === "e" ? { ai, accept, ready: !!(match && match.ready), problems: match ? match.problems : [], gaps: match ? match.gaps : [] } : {}),
    created_at: b.created_at, decided_at: b.decided_at,
  };
}
export const lineMissing = (l) => [Number(l.qty) > 0 ? null : "مقدار", T(l.unit) ? null : "واحد", Number(l.price) > 0 ? null : "قیمت واحد"].filter(Boolean);

/** همهٔ یک گفت‌وگو: خط‌ها، بسته‌ها، پیوست‌ها و ۲۰۰ پیام آخر (بعد از «پاک کردن» همین طرف) — و خوانده‌شدن */
export async function threadFull(env, th, side) {
  const [lines, bundles, msgs, files] = await Promise.all([
    env.DB.prepare("SELECT * FROM sp_lines WHERE thread_id=? ORDER BY id").bind(th.id).all(),
    env.DB.prepare("SELECT * FROM sp_bundles WHERE thread_id=? ORDER BY id").bind(th.id).all(),
    env.DB.prepare(`SELECT * FROM (SELECT * FROM sp_msgs WHERE thread_id=? AND id>?${side === "s" ? " AND kind!='note'" : ""} ORDER BY id DESC LIMIT 200) ORDER BY id`).bind(th.id, clearedUpTo(th, side)).all(),
    env.DB.prepare("SELECT id, line_id, label, note, filename, mime, size, at FROM sp_files WHERE thread_id=? ORDER BY id").bind(th.id).all(),
  ]);
  await markSeen(env, th.id, side);
  return {
    thread: threadOut(th, side),
    lines: (lines.results || []).map(lineOut),
    bundles: (bundles.results || []).map((b) => bundleOut(b, side)),
    msgs: (msgs.results || []).map((m) => msgFor(msgOut(m), side)),
    files: files.results || [],
    labels: FILE_LABELS,
  };
}

/** نظرسنجیِ سبک صفحه‌ها: پیام‌های بعد از `since` و شمارهٔ نسخهٔ گفت‌وگو (اگر عوض شده، صفحه کل را دوباره می‌خواند) */
export async function poll(env, th, side, since) {
  const from = Math.max(0, int(since) || 0, clearedUpTo(th, side));
  const rows = (await env.DB.prepare(`SELECT * FROM sp_msgs WHERE thread_id=? AND id>?${side === "s" ? " AND kind!='note'" : ""} ORDER BY id LIMIT 100`).bind(th.id, from).all()).results || [];
  if (rows.some((m) => m.who !== side)) await markSeen(env, th.id, side);
  return { msgs: rows.map((m) => msgFor(msgOut(m), side)), rev: th.rev };
}

/**
 * «پاک کردن گفت‌وگو»: پیام‌های تا این لحظه از صفحهٔ همین طرف می‌روند، در دیتابیس می‌مانند و طرف دیگر هنوز
 * می‌بیندشان. پیامِ تازه بعد از این دوباره دیده می‌شود. یک نوشتن، بی پیامِ تازه.
 */
export async function clearMsgs(env, th, side) {
  const col = side === "e" ? "e_clear" : "s_clear";
  await env.DB.prepare(`UPDATE sp_threads SET ${col}=(SELECT COALESCE(MAX(id),0) FROM sp_msgs WHERE thread_id=?1), rev=rev+1 WHERE id=?1`).bind(th.id).run();
  const r = await env.DB.prepare(`SELECT ${col} AS c FROM sp_threads WHERE id=?`).bind(th.id).first();
  return { ok: true, cleared: r ? r.c || 0 : 0 };
}

/** گفت‌وگوهای یک تأمین‌کننده (همهٔ شماره‌هایش یک شرکت‌اند و همه را می‌بینند) */
export async function supplierThreads(env, sup) {
  return ((await env.DB.prepare(`SELECT t.id, t.request_id, t.last_at, t.rev, e.label AS expert_label, e.name AS expert_name,
      (SELECT COUNT(*) FROM sp_msgs m WHERE m.thread_id=t.id AND m.who='e' AND m.kind!='note' AND m.id>t.s_seen) AS unread,
      (SELECT COUNT(*) FROM sp_lines l WHERE l.thread_id=t.id) AS lines,
      (SELECT COUNT(*) FROM sp_lines l WHERE l.thread_id=t.id AND l.state IN ('new','draft','returned','ready')) AS todo,
      (SELECT COUNT(*) FROM sp_bundles b WHERE b.thread_id=t.id AND b.state='approved') AS need_pf
    FROM sp_threads t JOIN assignments a ON a.id=t.assignment_id JOIN experts e ON e.id=a.expert_id
    WHERE t.supplier_id=? ORDER BY t.last_at DESC LIMIT 50`).bind(sup.supplier_id).all()).results || [])
    .map((r) => ({ id: r.id, request_id: r.request_id, expert: r.expert_label || r.expert_name, unread: r.unread, lines: r.lines, todo: r.todo, need_pf: r.need_pf, last_at: r.last_at }));
}

/**
 * میزِ مکاتبات کارشناس: درخواست‌های باز (و هر درخواستی که گفت‌وگو دارد)، و زیر هر کدام تأمین‌کنندگانش
 * با شمار پیام‌های نخوانده و بسته‌های منتظر تصمیم.
 */
export async function expertThreads(env, ex) {
  /* گفت‌وگوهای کارشناس هوشمند: «locked» (بسته)، «ask» (پرسش از کارشناس — باز تا پاسخ) یا «open» (کارشناس «دستی» است) */
  const [th, asg, air, mode] = await Promise.all([
    env.DB.prepare(`SELECT t.id, t.assignment_id, t.request_id, t.supplier_id, s.name AS supplier, s.demo, p.phone, p.label AS phone_label, t.last_at, r.party,
        (SELECT COUNT(*) FROM sp_msgs m WHERE m.thread_id=t.id AND m.who='s' AND m.id>t.e_seen) AS unread,
        (SELECT COUNT(*) FROM sp_bundles b WHERE b.thread_id=t.id AND b.state IN ('pending','proforma')) AS waiting,
        (SELECT COUNT(*) FROM sp_lines l WHERE l.thread_id=t.id) AS lines
      FROM sp_threads t JOIN assignments a ON a.id=t.assignment_id JOIN requests r ON r.id=a.request_id
      JOIN sp_suppliers s ON s.id=t.supplier_id LEFT JOIN sp_phones p ON p.id=t.phone_id
      WHERE a.expert_id=? ORDER BY t.last_at DESC LIMIT 300`).bind(ex.id).all(),
    env.DB.prepare(`SELECT a.id, a.request_id, r.party, a.dispatched_at,
        (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id AND i.state='open') AS open_items
      FROM assignments a JOIN requests r ON r.id=a.request_id
      WHERE a.expert_id=? AND a.dispatched_at IS NOT NULL AND a.closed_at IS NULL ORDER BY a.dispatched_at DESC LIMIT 80`).bind(ex.id).all(),
    env.DB.prepare(`SELECT x.thread_id, x.state, x.ask_json, r.expert_id AS run_expert FROM ai_threads x JOIN ai_runs r ON r.id=x.run_id JOIN sp_threads t ON t.id=x.thread_id
      JOIN assignments a ON a.id=t.assignment_id WHERE a.expert_id=?`).bind(ex.id).all().catch(() => ({ results: [] })),
    env.DB.prepare("SELECT mode FROM ai_agents WHERE expert_id=?").bind(ex.id).first().catch(() => null),
  ]);
  const aiOn = !!(mode && mode.mode === "on");
  const aiBy = new Map((air.results || []).map((x) => [x.thread_id, x]));
  const aiOf = (id) => {
    const x = aiBy.get(id);
    if (!x) return { ai: null, ask: null };
    if (!aiOn || x.run_expert !== ex.id) return { ai: "open", ask: null };
    return x.state === "ask" ? { ai: "ask", ask: (parse(x.ask_json, {}) || {}).q || "" } : { ai: "locked", ask: null };
  };
  const byA = new Map();
  for (const a of asg.results || []) byA.set(a.id, { assignment_id: a.id, request_id: a.request_id, party: a.party, open_items: a.open_items, threads: [], unread: 0, waiting: 0, last_at: 0 });
  for (const t of th.results || []) {
    if (!byA.has(t.assignment_id)) byA.set(t.assignment_id, { assignment_id: t.assignment_id, request_id: t.request_id, party: t.party, open_items: 0, threads: [], unread: 0, waiting: 0, last_at: 0 });
    const g = byA.get(t.assignment_id);
    const A = aiOf(t.id);
    /* گفت‌وگوی بسته: نخوانده و منتظرِ تصمیمش به حسابِ کارشناس نمی‌آید */
    const shut = A.ai === "locked";
    g.threads.push({ id: t.id, supplier_id: t.supplier_id, supplier: t.supplier, demo: !!t.demo, phone: shut ? null : t.phone, phone_label: t.phone_label, unread: shut ? 0 : t.unread,
      waiting: shut ? 0 : t.waiting, lines: t.lines, last_at: t.last_at, ai: A.ai, ask: A.ask });
    if (!shut) { g.unread += t.unread; g.waiting += t.waiting; }
    if (A.ai === "ask") g.asks = (g.asks || 0) + 1;
    g.last_at = Math.max(g.last_at, t.last_at);
  }
  const requests = [...byA.values()].sort((a, b) => (b.asks || 0) - (a.asks || 0) || (b.threads.length ? 1 : 0) - (a.threads.length ? 1 : 0) || b.last_at - a.last_at);
  return { requests, unread: requests.reduce((s, g) => s + g.unread, 0), waiting: requests.reduce((s, g) => s + g.waiting, 0), asks: requests.reduce((s, g) => s + (g.asks || 0), 0), ai: aiOn };
}

/**
 * اعلانِ گوشهٔ پنل کارشناس (مهر ۱۴۰۵): پیام‌های تازهٔ تأمین‌کنندگان بعد از `since` که کارشناس هنوز ندیده (و از
 * صفحه‌اش پاک نکرده)، حداکثر شش تای آخر. `last` بالاترین شناسهٔ پیام در کل سامانه است — صفحه با آن شروع می‌کند تا
 * فقط پیام‌هایی که بعد از باز شدنش می‌رسند اعلان شوند. بی `since` فقط `last` و شمارِ نخوانده‌ها (برای یک اعلانِ خلاصه).
 */
export async function expertInbox(env, ex, since) {
  const s = Math.max(0, int(since) || 0);
  const [top, unread, rows, asks] = await Promise.all([
    env.DB.prepare("SELECT COALESCE(MAX(id),0) AS id FROM sp_msgs").first(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM sp_msgs m JOIN sp_threads t ON t.id=m.thread_id JOIN assignments a ON a.id=t.assignment_id
      WHERE a.expert_id=? AND m.who='s' AND m.id>t.e_seen AND m.id>COALESCE(t.e_clear,0) AND ${AI_SHUT_SQL}`).bind(ex.id).first(),
    s ? env.DB.prepare(`SELECT m.id, m.thread_id, m.kind, m.body, m.at, t.assignment_id, t.request_id, sup.name AS supplier, sup.demo
        FROM sp_msgs m JOIN sp_threads t ON t.id=m.thread_id JOIN assignments a ON a.id=t.assignment_id JOIN sp_suppliers sup ON sup.id=t.supplier_id
        WHERE a.expert_id=? AND m.who='s' AND m.id>? AND m.id>t.e_seen AND m.id>COALESCE(t.e_clear,0) AND ${AI_SHUT_SQL} ORDER BY m.id DESC LIMIT 6`).bind(ex.id, s).all() : null,
    /* «پرسش از کارشناس»های بی‌پاسخ — نشانِ 🚨 کنارِ «مکاتبات» و اعلانِ گوشهٔ پنل */
    env.DB.prepare(`SELECT x.thread_id, x.ask_json, t.assignment_id, t.request_id, sup.name AS supplier FROM ai_threads x JOIN sp_threads t ON t.id=x.thread_id
        JOIN assignments a ON a.id=t.assignment_id JOIN sp_suppliers sup ON sup.id=t.supplier_id WHERE a.expert_id=? AND ${AI_ASK_SQL} ORDER BY x.updated_at DESC LIMIT 20`)
      .bind(ex.id).all().catch(() => ({ results: [] })),
  ]);
  const msgs = ((rows && rows.results) || []).reverse().map((m) => ({
    id: m.id, thread_id: m.thread_id, assignment_id: m.assignment_id, request_id: m.request_id, supplier: m.supplier, demo: !!m.demo,
    kind: m.kind, body: m.kind === "voice" ? `🎤 ${T(m.body) || "پیام صوتی"}`.slice(0, 300) : T(m.body).slice(0, 300), at: m.at,
  }));
  const askList = (asks.results || []).map((x) => { const k = parse(x.ask_json, {}) || {}; return { thread_id: x.thread_id, assignment_id: x.assignment_id, request_id: x.request_id, supplier: x.supplier, q: k.q || "", at: k.at || 0 }; });
  return { last: Math.max(top ? top.id : 0, ...msgs.map((m) => m.id)), unread: unread ? unread.n : 0, msgs, asks: askList.length, ask_list: askList };
}
/* گفت‌وگوی بستهٔ کارشناس هوشمند (ai-lock.js) برای کارشناس اعلان و شمرده نمی‌شود — t: sp_threads، a: assignments */
const AI_SHUT_SQL = `NOT EXISTS (SELECT 1 FROM ai_threads x JOIN ai_runs r ON r.id=x.run_id JOIN ai_agents g ON g.expert_id=r.expert_id AND g.mode='on'
  WHERE x.thread_id=t.id AND r.expert_id=a.expert_id AND x.state<>'ask')`;

/** اقلام باز یک ارجاعِ همین کارشناس — برای پنجرهٔ «ارسال استعلام» صفحهٔ مکاتبات */
export async function sendableItems(env, ex, aid) {
  const a = await env.DB.prepare("SELECT id, expert_id FROM assignments WHERE id=?").bind(int(aid)).first();
  if (!a || a.expert_id !== ex.id) throw new HttpError("این درخواست متعلق به شما نیست.", 403);
  const its = (await env.DB.prepare("SELECT id, line_no, title, qty, unit FROM items WHERE assignment_id=? AND state='open' ORDER BY line_no").bind(a.id).all()).results || [];
  /* locked: قبلاً برای تأمین‌کنندهٔ دیگری رفته و عینِ همان بسته می‌رود */
  const locks = await itemLocks(env, its.map((i) => i.id));
  return its.map((i) => ({ ...i, locked: locks.has(i.id) }));
}

/* ------------------------------------------------------------------ */
/* گفت‌وگو                                                               */
/* ------------------------------------------------------------------ */
/** meta: علامتِ پیام (مثلاً {ai: true} برای کارشناس هوشمند)؛ kind "note": یادداشتِ درونیِ سمت کارشناس — تأمین‌کننده نمی‌بیند */
export async function postMsg(env, th, side, text, meta = null, kind = "text") {
  const body = T(text);
  if (!body) throw new HttpError("پیام خالی است.");
  if (body.length > 3000) throw new HttpError("پیام خیلی بلند است (حداکثر ۳۰۰۰ نویسه).");
  const k = kind === "note" && side === "e" ? "note" : "text";
  const t = now();
  const [r] = await env.DB.batch([msgStmt(env, th.id, side, k, body, meta, t), touchStmt(env, th.id, t, false)]);
  /* پاسخِ کارشناسِ انسانی به «پرسش از کارشناس»: گفت‌وگو دوباره دستِ کارشناس هوشمند می‌رود (ai-lock.js) */
  if (side === "e" && k === "text" && !(meta && meta.ai)) await askAnswered(env, th.id, r.meta.last_row_id).catch((e) => console.error("ask answered", e && e.message));
  return { ok: true, msgs: [msgObj(r.meta.last_row_id, th.id, side, k, body, meta, t)] };
}

/**
 * پیامِ صوتیِ تأمین‌کننده (پنل وب یا بات): صدا در انبار و متنِ پیاده‌شده‌اش (ElevenLabs، worker/stt.js) در body —
 * کارشناس و کارشناس هوشمند همین متن را می‌خوانند؛ اگر پیاده نشد body خالی و stt.error. tg: file_id تلگرامِ بات مکاتبات
 * (برای فرستادنِ همان صدا به کارشناس در تلگرام).
 */
export async function postVoice(env, th, side, v) {
  const t = now();
  const body = T(v.text).slice(0, 4000);
  const meta = {
    voice: { key: v.key, mime: v.mime || null, size: v.size || null, dur: v.dur || null, ...(v.tg ? { tg: v.tg } : {}) },
    stt: v.error ? { ok: false, error: T(v.error).slice(0, 200) } : { ok: true, lang: v.lang || null },
  };
  const [r] = await env.DB.batch([msgStmt(env, th.id, side, "voice", body, meta, t), touchStmt(env, th.id, t, false)]);
  if (side === "e") await askAnswered(env, th.id, r.meta.last_row_id).catch((e) => console.error("ask answered", e && e.message));
  return { ok: true, msgs: [msgObj(r.meta.last_row_id, th.id, side, "voice", body, meta, t)] };
}
/** صدای یک پیامِ صوتی با سنجشِ دسترسی به گفت‌وگو */
export async function voiceOf(env, who, msgId) {
  const m = int(msgId) ? await env.DB.prepare("SELECT * FROM sp_msgs WHERE id=?").bind(int(msgId)).first() : null;
  if (!m || m.kind !== "voice") throw new HttpError("این پیام صوتی پیدا نشد.", 404);
  await threadFor(env, m.thread_id, who);
  const v = (parse(m.meta_json, {}) || {}).voice || {};
  if (!v.key) throw new HttpError("صدای این پیام در انبار نیست.", 404);
  return v;
}

/* ------------------------------------------------------------------ */
/* مشخصات (تأمین‌کننده)                                                  */
/* ------------------------------------------------------------------ */
async function ownLine(env, sup, lineId) {
  const l = int(lineId) ? await env.DB.prepare("SELECT l.*, t.supplier_id FROM sp_lines l JOIN sp_threads t ON t.id=l.thread_id WHERE l.id=?").bind(int(lineId)).first() : null;
  if (!l || l.supplier_id !== sup.supplier_id) throw new HttpError("این قلم پیدا نشد.", 404);
  return l;
}
const notEditable = (l) => new HttpError(`این قلم «${LINE_FA[l.state] || l.state}» است و فعلاً قابل ویرایش نیست.`, 409);

function cleanExtra(list, locked) {
  const lockedK = new Set((locked || []).map((x) => nkey(x.k)));
  const out = [], seen = new Set();
  for (const x of Array.isArray(list) ? list : []) {
    const k = nrm(x && x.k).slice(0, 40), v = nrm(x && x.v).slice(0, 160);
    if (!k || !v) continue;
    if (lockedK.has(nkey(k))) throw new HttpError(`«${k}» لایهٔ قفل‌شدهٔ کارشناس است و تغییر نمی‌کند؛ اگر حرفی درباره‌اش دارید در گفت‌وگو بنویسید.`, 422);
    if (seen.has(nkey(k))) continue;
    seen.add(nkey(k)); out.push({ k, v });
  }
  if (out.length > 20) throw new HttpError("حداکثر ۲۰ لایهٔ افزوده.");
  return out;
}

/** ذخیرهٔ مقدار، واحد، قیمت واحد، توضیح و لایه‌های افزوده — قیمت کل همیشه حاصل‌ضرب است و ذخیره نمی‌شود */
export async function lineSave(env, sup, lineId, b) {
  const l = await ownLine(env, sup, lineId);
  if (!LINE_EDITABLE.includes(l.state)) throw notEditable(l);
  const sets = [], args = [];
  for (const f of ["qty", "price"]) {
    if (!(f in b)) continue;
    const n = toNum(b[f]);
    if (Number.isNaN(n)) throw new HttpError(f === "qty" ? "مقدار باید عدد باشد." : "قیمت واحد باید عدد باشد (ریال).");
    sets.push(`${f}=?`); args.push(n);
  }
  if ("unit" in b) { sets.push("unit=?"); args.push(nrm(b.unit).slice(0, 30) || null); }
  if ("note" in b) {
    const s = T(b.note);
    if (s.length > 1000) throw new HttpError("توضیح خیلی بلند است (حداکثر ۱۰۰۰ نویسه).");
    sets.push("note=?"); args.push(s || null);
  }
  if ("extra" in b) { sets.push("extra_json=?"); args.push(JSON.stringify(cleanExtra(b.extra, parse(l.layers_json, [])))); }
  if (!sets.length) return { ok: true };
  if (l.state === "new") sets.push("state='draft'");
  const t = now();
  sets.push("updated_at=?"); args.push(t);
  await env.DB.batch([env.DB.prepare(`UPDATE sp_lines SET ${sets.join(",")} WHERE id=?`).bind(...args, l.id), touchStmt(env, l.thread_id, t)]);
  return { ok: true, line: lineOut(await env.DB.prepare("SELECT * FROM sp_lines WHERE id=?").bind(l.id).first()) };
}

/**
 * شرایطِ فاکتورِ اعلامی (کادر دومِ کارت‌ها) برای همهٔ اقلامِ این گفت‌وگو. فقط فیلدهایی که آمده‌اند؛ خالی یعنی پاک.
 * زمان تحویل همان قاعدهٔ تب استعلامات را دارد: تاریخ شمسی یا شمار روز.
 */
export async function termsSave(env, sup, thId, b) {
  const th = await threadFor(env, thId, { supplier: sup });
  const t = { ...termsOf(th) };
  for (const f of TERM_FIELDS) {
    if (!(f in (b || {}))) continue;
    /* رقم فارسی فقط در تاریخ و شمار روز لاتین می‌شود — گزینه‌های فهرستی (مثل «۵۰٪ پیش‌پرداخت») همان‌طورند */
    const v = TERM_ENUMS[f] ? nrm(b[f]) : nrm(latin(b[f]));
    if (!v) { delete t[f]; continue; }
    if (f === "dtime") {
      if (!validDtime(v)) throw new HttpError("زمان تحویل باید تاریخ شمسی (مثل ۱۴۰۵/۰۸/۰۱) یا شمار روز (مثل ۱۰ یا ۱۰ روز کاری) باشد.", 422, { field: f });
      t[f] = normalizeDtime(v);
    } else if (f === "valid_days") {
      const n = toNum(v);
      if (n == null || Number.isNaN(n)) throw new HttpError("اعتبار پیش‌فاکتور باید شمار روز باشد.", 422, { field: f });
      t[f] = Math.round(n);
    } else {
      if (!TERM_ENUMS[f].includes(v)) throw new HttpError(`«${TERM_FA[f]}» یکی از این‌ها باشد: ${TERM_ENUMS[f].join("، ")}`, 422, { field: f });
      t[f] = v;
    }
  }
  await env.DB.batch([env.DB.prepare("UPDATE sp_threads SET terms_json=? WHERE id=?").bind(JSON.stringify(t), th.id), touchStmt(env, th.id, now())]);
  return { ok: true, terms: t, missing: termsMissing(t) };
}

/** «آمادهٔ ارسال» (یا برگشت به پیش‌نویس) — آماده فقط با مقدار، واحد، قیمت واحد و شرایطِ اجباریِ فاکتور */
export async function lineReady(env, sup, lineId, on) {
  const l = await ownLine(env, sup, lineId);
  if (!LINE_EDITABLE.includes(l.state)) throw notEditable(l);
  if (on) {
    const th = await env.DB.prepare("SELECT terms_json FROM sp_threads WHERE id=?").bind(l.thread_id).first();
    const miss = [...lineMissing(l), ...termsMissing(termsOf(th))];
    if (miss.length) throw new HttpError(`برای «آمادهٔ ارسال» این‌ها را پر کنید: ${miss.join("، ")}`, 422, { missing: miss });
  }
  const state = on ? "ready" : (l.state === "ready" ? "draft" : l.state);
  const t = now();
  await env.DB.batch([env.DB.prepare("UPDATE sp_lines SET state=?, updated_at=? WHERE id=?").bind(state, t, l.id), touchStmt(env, l.thread_id, t)]);
  return { ok: true, state };
}

/**
 * چند قلمِ «آمادهٔ ارسال» با هم: یک بسته برای تصمیم کارشناس، با عکسِ شرایطِ اعلامیِ همین لحظه.
 * pf (اختیاری): پیش‌فاکتوری که تأمین‌کننده همان اول کنار مشخصات می‌فرستد ({skey, filename, mime, size}، فایل را لایهٔ
 * API در انبار گذاشته) — بسته یک‌راست «پیش‌فاکتور رسید» می‌شود و مرحلهٔ «تأیید و درخواست پیش‌فاکتور» لازم نیست.
 */
export async function submitLines(env, sup, thId, lineIds, pf) {
  const th = await threadFor(env, thId, { supplier: sup });
  const want = Array.isArray(lineIds) && lineIds.length ? new Set(lineIds.map(int)) : null;
  const lines = ((await env.DB.prepare("SELECT * FROM sp_lines WHERE thread_id=? AND state='ready' ORDER BY id").bind(th.id).all()).results || [])
    .filter((l) => !want || want.has(l.id));
  if (!lines.length) throw new HttpError("هیچ قلمِ «آمادهٔ ارسال»ی انتخاب نشده است.", 422);
  const bad = lines.filter((l) => lineMissing(l).length);
  if (bad.length) throw new HttpError(`این اقلام کامل نیستند: ${bad.map((l) => `${codeTxt(l.no)}«${l.title}»`).join("، ")}`, 422);
  const terms = termsOf(th);
  const tmiss = termsMissing(terms);
  if (tmiss.length) throw new HttpError(`شرایط فاکتور کامل نیست: ${tmiss.join("، ")}`, 422, { missing: tmiss });
  const t = now();
  const state = pf ? "proforma" : "pending";
  const r = await env.DB.prepare(`INSERT INTO sp_bundles (thread_id,line_ids,state,terms_json,pf_key,pf_name,pf_mime,pf_size,pf_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .bind(th.id, JSON.stringify(lines.map((l) => l.id)), state, JSON.stringify(terms), pf ? pf.skey : null, pf ? T(pf.filename).slice(0, 120) || "proforma" : null,
      pf ? pf.mime || null : null, pf ? pf.size || null : null, pf ? t : null, t).run();
  const bid = r.meta.last_row_id;
  const sum = lines.reduce((s, l) => s + Number(l.qty) * Number(l.price), 0);
  const pfName = pf ? T(pf.filename) || "پیش‌فاکتور" : null;
  const body = `📤 مشخصات ${faN(lines.length)} قلم برای بررسی فرستاده شد${pf ? ` همراه با پیش‌فاکتور «${pfName}»` : ""}:\n`
    + lines.map((l) => itemBlock(l, true)).join("\n")
    + `\nجمع: ${moneyTxt(sum)} ریال\nشرایط: ${termsLine(terms)}`;
  const meta = { ev: "submit", bundle: bid, pf: pfName, items: lines.map((l) => itemSnap(l, true)), terms, sum };
  const res = await env.DB.batch([
    env.DB.prepare(`UPDATE sp_lines SET state=?, bundle_id=?, updated_at=? WHERE id IN (${lines.map(() => "?").join(",")})`).bind(pf ? "proforma" : "submitted", bid, t, ...lines.map((l) => l.id)),
    msgStmt(env, th.id, "s", "event", body, meta, t),
    touchStmt(env, th.id, t),
  ]);
  return { ok: true, bundle_id: bid, state, msgs: [msgObj(res[1].meta.last_row_id, th.id, "s", "event", body, meta, t)], thread: th };
}

/* ------------------------------------------------------------------ */
/* پیوست‌ها و پیش‌فاکتور (تأمین‌کننده) — فایل را لایهٔ API در انبار می‌گذارد  */
/* ------------------------------------------------------------------ */
export async function fileTarget(env, sup, lineId, label) {
  const l = await ownLine(env, sup, lineId);
  if (["final", "rejected"].includes(l.state)) throw notEditable(l);
  const lab = nrm(label).slice(0, 40);
  if (!lab) throw new HttpError("هر پیوست یک برچسب لازم دارد (مثلاً «گواهی کیفیت»).");
  return { line: l, label: lab };
}
export async function addFile(env, sup, target, f) {
  const { line: l, label } = target;
  const t = now();
  const note = T(f.note).slice(0, 300) || null;
  const body = `📎 پیوست «${label}» برای ${codeTxt(l.no)}${l.title}${note ? ` — ${note}` : ""}`;
  const meta = { ev: "file", line: l.id };
  const res = await env.DB.batch([
    env.DB.prepare("INSERT INTO sp_files (thread_id,line_id,label,note,filename,mime,size,skey,at) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind(l.thread_id, l.id, label, note, T(f.filename).slice(0, 120) || "file", f.mime || null, f.size || null, f.skey, t),
    msgStmt(env, l.thread_id, "s", "event", body, meta, t),
    touchStmt(env, l.thread_id, t),
  ]);
  return { ok: true, id: res[0].meta.last_row_id, msgs: [msgObj(res[1].meta.last_row_id, l.thread_id, "s", "event", body, meta, t)] };
}
export async function delFile(env, sup, fileId) {
  const f = await env.DB.prepare("SELECT f.*, t.supplier_id, l.state FROM sp_files f JOIN sp_threads t ON t.id=f.thread_id JOIN sp_lines l ON l.id=f.line_id WHERE f.id=?").bind(int(fileId)).first();
  if (!f || f.supplier_id !== sup.supplier_id) throw new HttpError("این پیوست پیدا نشد.", 404);
  if (!LINE_EDITABLE.includes(f.state)) throw new HttpError("پیوستِ قلمی که فرستاده شده، فقط با برگشتِ کارشناس عوض می‌شود.", 409);
  const t = now();
  await env.DB.batch([env.DB.prepare("DELETE FROM sp_files WHERE id=?").bind(f.id), touchStmt(env, f.thread_id, t)]);
  return { ok: true, skey: f.skey };
}
/** یک پیوست برای دانلود — تأمین‌کنندهٔ صاحبش یا کارشناسِ همان گفت‌وگو */
export async function fileFor(env, who, fileId) {
  const f = await env.DB.prepare("SELECT * FROM sp_files WHERE id=?").bind(int(fileId)).first();
  if (!f) throw new HttpError("این پیوست پیدا نشد.", 404);
  await threadFor(env, f.thread_id, who);
  return f;
}

/* «🚨 پرسش از کارشناس» (ai-lock.js): گفت‌وگو فقط برای پاسخِ کارشناس باز است — تصمیم دربارهٔ بسته‌ها و پیش‌فاکتورها با کارشناس هوشمند */
function askOnly(th, byAi) {
  if (!byAi && th.ai && th.ai.ask) throw new HttpError("🚨 این گفت‌وگو فقط برای پاسخ به «پرسش از کارشناس» باز است؛ تصمیم دربارهٔ بسته‌ها و پیش‌فاکتورها با کارشناس هوشمند است.", 423, { ai_locked: true });
}
async function bundleFor(env, who, bundleId) {
  const b = int(bundleId) ? await env.DB.prepare("SELECT * FROM sp_bundles WHERE id=?").bind(int(bundleId)).first() : null;
  if (!b) throw new HttpError("این بسته پیدا نشد.", 404);
  const th = await threadFor(env, b.thread_id, who);
  return { b, th };
}
const bundleLines = async (env, bid) => (await env.DB.prepare("SELECT * FROM sp_lines WHERE bundle_id=? ORDER BY id").bind(bid).all()).results || [];

export async function proformaTarget(env, sup, bundleId) {
  const { b, th } = await bundleFor(env, { supplier: sup }, bundleId);
  if (!["approved", "proforma"].includes(b.state)) throw new HttpError("برای این بسته پیش‌فاکتور خواسته نشده است.", 409);
  return { b, th };
}
/** پیش‌فاکتور رسید (یا عوض شد): بررسی و پذیرش‌های قبلی باطل می‌شوند — سند تازه، بررسی تازه */
export async function setProforma(env, target, f) {
  const { b, th } = target;
  const t = now();
  const lines = await bundleLines(env, b.id);
  const body = `📄 پیش‌فاکتور «${T(f.filename) || "پیش‌فاکتور"}» ${b.state === "proforma" ? "عوض شد" : "رسید"} برای:\n${itemsTxt(lines)}`;
  const meta = { ev: "pf", bundle: b.id, items: lines.map((l) => ({ no: l.no || null, title: l.title })) };
  const res = await env.DB.batch([
    env.DB.prepare("UPDATE sp_bundles SET state='proforma', pf_key=?, pf_name=?, pf_mime=?, pf_size=?, pf_at=?, ai_json=NULL, ai_at=NULL, manual_ok=NULL, accept_json=NULL WHERE id=?")
      .bind(f.skey, T(f.filename).slice(0, 120) || "proforma", f.mime || null, f.size || null, t, b.id),
    env.DB.prepare("UPDATE sp_lines SET state='proforma', updated_at=? WHERE bundle_id=? AND state IN ('approved','proforma')").bind(t, b.id),
    msgStmt(env, th.id, "s", "event", body, meta, t),
    touchStmt(env, th.id, t),
  ]);
  return { ok: true, old: b.pf_key && b.pf_key !== f.skey ? b.pf_key : null, msgs: [msgObj(res[2].meta.last_row_id, th.id, "s", "event", body, meta, t)], thread: th };
}
/** کلید پیش‌فاکتورِ یک بسته برای دیدن — کارشناسِ گفت‌وگو یا خودِ تأمین‌کننده */
export async function proformaOfBundle(env, who, bundleId) {
  const { b } = await bundleFor(env, who, bundleId);
  if (!b.pf_key) throw new HttpError("برای این بسته هنوز پیش‌فاکتوری نرسیده است.", 404);
  return b;
}

/* ------------------------------------------------------------------ */
/* تصمیم کارشناس                                                         */
/* ------------------------------------------------------------------ */
const aiOf = (b) => { const ai = parse(b.ai_json, null); return aiUsable(ai) ? ai : null; };

/**
 * تصمیم روی یک بسته: approve (تأیید مشخصات و درخواست پیش‌فاکتور) · return (برگشت با توضیح؛ قابل ویرایش
 * می‌شود) · reject (رد) · final (تأیید نهایی ← اقلام با مقدارهای پیش‌فاکتور به تب استعلامات).
 * تأیید نهایی فقط وقتی که هر ردیفِ دروازه‌ایِ جدول تطابق ✅ است یا کارشناس تیکش زده (پیش‌فاکتور ملاک؛ sp-ai.js:resolve).
 * فیلدِ اجباری‌ای که با پذیرشِ «نیامده» خالی می‌ماند (gaps)، خط استعلام را از «ثبت موقت» و تیک «تأیید نهایی» بازمی‌دارد.
 */
export async function decide(env, ex, bundleId, action, { comment, ai } = {}) {
  const { b, th } = await bundleFor(env, { expert: ex, ai: !!ai }, bundleId);
  askOnly(th, ai);
  const lines = await bundleLines(env, b.id);
  const note = T(comment).slice(0, 1000);
  const t = now();
  const stmts = [];
  let body, quoteIds = [], gaps = [];
  const open = ["pending", "approved", "proforma"];
  const list = itemsTxt(lines);
  if (action === "approve") {
    if (b.state !== "pending") throw new HttpError(`این بسته «${BUNDLE_FA[b.state]}» است.`, 409);
    stmts.push(env.DB.prepare("UPDATE sp_bundles SET state='approved', comment=?, decided_at=? WHERE id=?").bind(note || null, t, b.id),
      env.DB.prepare("UPDATE sp_lines SET state='approved', updated_at=? WHERE bundle_id=? AND state='submitted'").bind(t, b.id));
    body = `✅ مشخصات تأیید شد؛ لطفاً پیش‌فاکتورِ این اقلام را بارگذاری کنید:\n${list}${note ? `\n💬 ${note}` : ""}`;
  } else if (action === "return") {
    if (!open.includes(b.state)) throw new HttpError(`این بسته «${BUNDLE_FA[b.state]}» است.`, 409);
    if (!note) throw new HttpError("برای برگشت، توضیح بنویسید تا تأمین‌کننده بداند چه چیزی را اصلاح کند.");
    stmts.push(env.DB.prepare("UPDATE sp_bundles SET state='returned', comment=?, decided_at=? WHERE id=?").bind(note, t, b.id),
      env.DB.prepare("UPDATE sp_lines SET state='returned', updated_at=? WHERE bundle_id=?").bind(t, b.id));
    body = `↩️ برای اصلاح برگشت خورد:\n${list}\n💬 ${note}`;
  } else if (action === "reject") {
    if (!open.includes(b.state)) throw new HttpError(`این بسته «${BUNDLE_FA[b.state]}» است.`, 409);
    stmts.push(env.DB.prepare("UPDATE sp_bundles SET state='rejected', comment=?, decided_at=? WHERE id=?").bind(note || null, t, b.id),
      env.DB.prepare("UPDATE sp_lines SET state='rejected', updated_at=? WHERE bundle_id=?").bind(t, b.id));
    body = `❌ رد شد:\n${list}${note ? `\n💬 ${note}` : ""}`;
  } else if (action === "final") {
    if (b.state !== "proforma") throw new HttpError(b.state === "approved" ? "پیش‌فاکتور هنوز نرسیده است." : `این بسته «${BUNDLE_FA[b.state]}» است.`, 409);
    const res = resolve(aiOf(b), parse(b.accept_json, {}));
    if (!res.ready) throw new HttpError(`تأیید نهایی هنوز ممکن نیست:\n• ${res.problems.join("\n• ")}`, 422, { problems: res.problems });
    gaps = res.gaps;
    stmts.push(...await quoteStmts(env, th, b, lines, res, t),
      env.DB.prepare("UPDATE sp_bundles SET state='final', decided_at=? WHERE id=?").bind(t, b.id),
      env.DB.prepare("UPDATE sp_lines SET state='final', updated_at=? WHERE bundle_id=?").bind(t, b.id));
    body = `🏁 تأیید نهایی شد:\n${list}${note ? `\n💬 ${note}` : ""}`;
  } else throw new HttpError("تصمیم نامعتبر.");
  const meta = { ev: action, bundle: b.id, items: lines.map((l) => ({ no: l.no || null, title: l.title })), ...(ai ? { ai: true } : {}) };
  stmts.push(msgStmt(env, th.id, "e", "event", body, meta, t), touchStmt(env, th.id, t));
  const out = await env.DB.batch(stmts);
  const mid = out[out.length - 2].meta.last_row_id;
  /* خط‌های استعلام — شناسه‌شان بعد از اجرای دسته معلوم است */
  if (action === "final") {
    const ids = ((await env.DB.prepare(`SELECT id, item_id FROM quotes WHERE assignment_id=? AND supplier_name=? AND item_id IN (${lines.map(() => "?").join(",")})`)
      .bind(th.assignment_id, th.supplier_name, ...lines.map((l) => l.item_id)).all()).results || []);
    const byItem = new Map(ids.map((r) => [r.item_id, r.id]));
    const link = lines.filter((l) => byItem.has(l.item_id)).map((l) => env.DB.prepare("UPDATE sp_lines SET quote_id=? WHERE id=?").bind(byItem.get(l.item_id), l.id));
    if (link.length) await env.DB.batch(link);
    quoteIds = lines.map((l) => byItem.get(l.item_id)).filter(Boolean);
  }
  return { ok: true, state: { approve: "approved", return: "returned", reject: "rejected", final: "final" }[action], quote_ids: quoteIds, gaps, demo: !!th.demo,
    msgs: [msgObj(mid, th.id, "e", "event", body, meta, t)], thread: th };
}

/**
 * اقلامِ تأییدنهایی‌شده در تب استعلامات — همهٔ مقدارها از پیش‌فاکتور: ردیف‌های ✅ و مغایرت‌هایی که کارشناس
 * پذیرفته (resolve). خطی که برای همین تأمین‌کننده و قلم از قبل هست (مثلاً از «انتخاب جهت استعلام») همان
 * به‌روز می‌شود. اگر همهٔ اجباری‌ها پر باشد، خط «ثبت موقت» است و تیک «تأیید نهایی» می‌خورد تا به جدول کمیسیون
 * برسد؛ وگرنه (کارشناس «نیامده» را پذیرفته) همان خط با جاهای خالی می‌ماند و به کمیسیون نمی‌رود. پیش‌فاکتور هم برای
 * همین تأمین‌کننده ثبت می‌شود تا تب استعلامات و کمیسیون همان سند را ببینند.
 */
async function quoteStmts(env, th, b, lines, res, t) {
  const have = new Map(((await env.DB.prepare("SELECT id, item_id FROM quotes WHERE assignment_id=? AND supplier_name=?").bind(th.assignment_id, th.supplier_name).all()).results || [])
    .map((r) => [r.item_id, r.id]));
  const byLine = new Map(res.lines.map((x) => [x.line_id, x.values]));
  const tm = res.terms;
  const stmts = [];
  for (const l of lines) {
    const v = byLine.get(l.id) || {};
    const spec = [l.head ? `نوع قلم: ${l.head}` : null, ...(v.spec || []).map((x) => `${x.k}: ${x.v}`)].filter(Boolean).join("، ").slice(0, 500) || null;
    const q = { unit: v.unit || null, qty: v.qty ?? null, price: v.price ?? null, dtime: tm.dtime || null, pay: tm.pay || null, invoice: tm.invoice || null, vat: tm.vat || null };
    const ok = canSave(q) ? 1 : 0;
    const vals = [spec, q.unit, q.qty, q.price, q.dtime, tm.valid_days != null ? String(tm.valid_days) : null, tm.ship || null, q.invoice, q.pay, q.vat,
      tm.place || null, tm.place_other || null, ok, ok, ok ? t : null];
    if (have.has(l.item_id)) {
      stmts.push(env.DB.prepare(`UPDATE quotes SET spec=?, unit=?, qty=?, price=?, dtime=?, valid_days=?, ship=?, invoice=?, pay=?, vat=?, place=?, place_other=?, saved=?,
          final=?, final_at=?, low_conf=0, invoice_src=NULL, source='supplier', origin='supplier', origin_ref=?, updated_at=? WHERE id=?`)
        .bind(...vals, b.id, t, have.get(l.item_id)));
    } else {
      stmts.push(env.DB.prepare(`INSERT INTO quotes (assignment_id,item_id,supplier_name,spec,unit,qty,price,dtime,valid_days,ship,invoice,pay,vat,place,place_other,saved,final,final_at,low_conf,source,origin,origin_ref,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,'supplier','supplier',?,?,?)`)
        .bind(th.assignment_id, l.item_id, th.supplier_name, ...vals, b.id, t, t));
    }
  }
  if (b.pf_key) {
    stmts.push(env.DB.prepare(`INSERT INTO proformas (assignment_id,supplier_name,filename,storage_key,mime,size_bytes,source,uploaded_at,item_ids)
      VALUES (?,?,?,?,?,?,'supplier',?,?)
      ON CONFLICT(assignment_id,supplier_name) DO UPDATE SET filename=excluded.filename, storage_key=excluded.storage_key, mime=excluded.mime,
        size_bytes=excluded.size_bytes, source='supplier', uploaded_at=excluded.uploaded_at, item_ids=excluded.item_ids`)
      .bind(th.assignment_id, th.supplier_name, b.pf_name, b.pf_key, b.pf_mime, b.pf_size, t, JSON.stringify(lines.map((l) => l.item_id))));
  }
  return stmts;
}

/** همهٔ ردیف‌های جدول تطابق با کلیدِ پذیرششان */
function matchRows(ai) {
  const out = [];
  for (const ln of (ai && ai.lines) || []) for (const row of ln.rows || []) out.push({ key: lineKey(ln.line_id, row), row, line: ln });
  for (const row of (ai && ai.header) || []) out.push({ key: headKey(row), row, line: null });
  return out;
}

/**
 * تیکِ ردیف‌های جدول تطابق: کارشناس قبول می‌کند که پیش‌فاکتور به‌جای درخواست ملاک باشد — هر ردیفِ غیرسبز (⚠️ ⚪ ❌).
 * مقدار همیشه از سند است؛ اگر سند چیزی نگفته، خالی می‌ماند و چیزی از بستهٔ تأمین‌کننده جایش نمی‌نشیند. `all`: همه.
 */
export async function acceptRows(env, ex, bundleId, { keys, on = true, all = false, byAi = false } = {}) {
  const { b, th } = await bundleFor(env, { expert: ex, ai: !!byAi }, bundleId);
  askOnly(th, byAi);
  if (b.state !== "proforma") throw new HttpError(`این بسته «${BUNDLE_FA[b.state]}» است.`, 409);
  const ai = aiOf(b);
  if (!ai) throw new HttpError("اول «خوانش هوشمند» را بزنید تا جدول تطابق ساخته شود.", 409);
  const acc = parse(b.accept_json, {});
  const rows = matchRows(ai);
  if (all) { for (const x of rows) if (acceptable(x.row)) acc[x.key] = true; }
  else {
    for (const k of Array.isArray(keys) ? keys : [keys]) {
      const x = rows.find((y) => y.key === k);
      if (!x) throw new HttpError("این ردیف در جدول تطابق نیست.", 404);
      if (!acceptable(x.row)) throw new HttpError("این ردیف همین حالا هم با پیش‌فاکتور یکی است.", 422);
      if (on) acc[k] = true; else delete acc[k];
    }
  }
  await env.DB.batch([env.DB.prepare("UPDATE sp_bundles SET accept_json=? WHERE id=?").bind(JSON.stringify(acc), b.id), touchStmt(env, th.id, now())]);
  const r = resolve(ai, acc);
  return { ok: true, accept: acc, ready: r.ready, problems: r.problems, gaps: r.gaps, thread: th };
}

/** نتیجهٔ «بررسی هوشمند» روی بسته ذخیره می‌شود (sp-ai.js مدل را صدا می‌زند) */
export async function aiTarget(env, ex, bundleId) {
  const { b, th } = await bundleFor(env, { expert: ex }, bundleId);
  askOnly(th, false);
  if (b.state !== "proforma" || !b.pf_key) throw new HttpError("خوانش هوشمند فقط بعد از رسیدن پیش‌فاکتور.", 409);
  return { b, th, lines: await bundleLines(env, b.id), terms: termsOf(b) };
}
export async function saveAi(env, target, ai) {
  const { b, th } = target;
  const t = now();
  const rows = matchRows(ai).filter((x) => x.row.gate);
  const n = (s) => rows.filter((x) => x.row.status === s).length;
  const body = ai.readable === false ? `🤖 خوانش هوشمند: پیش‌فاکتور خوانا نبود${ai.reason ? ` (${ai.reason})` : ""}.`
    : ai.ok ? "🤖 خوانش هوشمند: همهٔ لایه‌ها و فیلدهای اجباری با پیش‌فاکتور می‌خوانند ✅"
      : `🤖 خوانش هوشمند: ${[["bad", "فرق دارد ❌"], ["none", "نیامده ⚪"], ["warn", "نامطمئن ⚠️"]].filter(([s]) => n(s)).map(([s, f]) => `${faN(n(s))} ${f}`).join("، ")} — جدول تطابق را ببینید.`;
  const meta = { ev: "ai", bundle: b.id, ok: !!ai.ok };
  /* «note»: یادداشتِ درونیِ کارشناس — تأمین‌کننده نمی‌بیند. خواندنِ تازه، پذیرش‌های قبلی را پاک می‌کند */
  const res = await env.DB.batch([
    env.DB.prepare("UPDATE sp_bundles SET ai_json=?, ai_at=?, accept_json=NULL WHERE id=?").bind(JSON.stringify(ai), t, b.id),
    msgStmt(env, th.id, "e", "note", body, meta, t),
    touchStmt(env, th.id, t),
  ]);
  return { ok: true, ai, msgs: [msgObj(res[1].meta.last_row_id, th.id, "e", "note", body, meta, t)], thread: th };
}

/* ------------------------------------------------------------------ */
/* لینک اتصال کارشناس به بات مکاتبات                                    */
/* ------------------------------------------------------------------ */
/**
 * لینک یک‌بارمصرفِ اتصال به بات مکاتبات. `pending`: پیامک‌های شبیه‌سازی‌شده‌ای که هنوز جایی برای نشان دادن
 * نداشتند (کارشناس بات مکاتبات را وصل نکرده) — با همین لینک نگه داشته و بعد از اتصال نشان داده و پاک می‌شوند.
 */
export async function expertLink(env, exId, pending) {
  const t = now();
  const prev = await env.DB.prepare("SELECT payload FROM sp_links WHERE expert_id=? AND used_at IS NULL AND expires_at>? ORDER BY created_at DESC LIMIT 1").bind(exId, t).first();
  const queue = [...parse(prev && prev.payload, []), ...(pending ? [pending] : [])].slice(-5);
  const token = "e" + randHex(12);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sp_links WHERE expert_id=? OR expires_at<?").bind(exId, t),
    env.DB.prepare("INSERT INTO sp_links (token,expert_id,created_at,expires_at,payload) VALUES (?,?,?,?,?)").bind(token, exId, t, t + 24 * 3600000, queue.length ? JSON.stringify(queue) : null),
  ]);
  const bot = await spBotUser(env);
  return { token, url: botLink(bot, token), bot };
}
