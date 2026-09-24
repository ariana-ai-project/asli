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
import { extractProforma, toRial, ExtractError } from "./extract.js";
import { transcribe, writeLetter } from "./letter.js";
import { renderLetter } from "./docx.js";
import { HttpError } from "./http.js";
import { DEFAULTS, getSettings, settingsFromRows } from "./settings.js";
import { bundleData, readiness, commissionGuard, recordCommission } from "./bundle.js";
import { assignmentLogStmt, settingsHistoryStmts, scoresHistoryStmts, deleteQuotes, phoneChannels, setPhoneChannel, itemSearches, withPhoneKeys, backfillSearchKeys } from "./records.js";
import { expertDecision, approveDecision, rejectDecision } from "./decisions.js";
import { historyStatus, itemHistory, supplierBuys, itemSeries } from "./history.js";
import { CATALOG_DDL, catalogBegin, catalogChunk, catalogFinish } from "./catalog.js";
import { normalizeItem, confirmNorm, clearNorm } from "./normalize.js";
import { MARKETS, MAX_MARKETS, smartSearch } from "./discovery.js";
import { commissionHtml, commissionXlsx, XLSX_MIME } from "./sheets.js";
import { renderRequestDoc, requestHtml, REQUEST_CSS } from "./reqdoc.js";
import { SHEET_CSS } from "./xlsx.js";
import { selfTest } from "./selftest.js";
import { statusData, statusBook, seasonData, seasonBook, bookPreview, bookFile, reportMeta, BOOK_CSS } from "./reports.js";
import { proformaOf, runExtraction, applyExtraction } from "./proforma.js";
import { siteState, siteLogin, putSite } from "./site.js";
import { handleUpdate, handleTeamUpdate, makeLink, makeTeamLink, ensureTeamWebhook, scheduled, drainOutbox } from "./bot.js";
import { holidayFn, resetHolidayCache, alertStatements, delegateAssignment, reassign, thresholdsByExpert, parseThresholds, rescheduleTeam, dispatchText, seenKb, TEAM_SIZE_SQL } from "./assign.js";
import { queueStmt } from "./queue.js";
import { missingRequired, INVOICE_DEFAULT, validateQuote, normalizeDtime, toNumber } from "./quote-rules.js";

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
/* تعریف در worker/http.js است تا bot.js هم بدون حلقهٔ ایمپورت از آن استفاده کند */

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
  const ex = await env.DB.prepare("SELECT id,name,label,code,active,senior,senior_id,notify_to,team_chat,team_via,alert_stages,alert_thresholds FROM experts WHERE code=?").bind(code).first();
  if (!ex || !ex.active) throw new HttpError("کد کارشناسی معتبر نیست.", 401);
  ex.senior = ex.senior ? 1 : 0;
  ex.alert_stages = stageTicks(ex.alert_stages);
  ex.alert_thresholds = parseThresholds(ex.alert_thresholds);
  return ex;
}

/* شش تیکِ مرحله‌ها (JSON آرایهٔ بولی). پیش‌فرض همان سه مرحله‌ای که مدیر تا حالا می‌خواست:
   مشاهده، پیش‌فاکتور، جدول کمیسیون. */
const DEFAULT_STAGES = [true, false, false, false, true, true];
function stageTicks(v) {
  let a = v;
  if (typeof v === "string") { try { a = JSON.parse(v); } catch (_) { a = null; } }
  if (!Array.isArray(a) || a.length !== 6) return DEFAULT_STAGES.slice();
  return a.map(Boolean);
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
CREATE TABLE IF NOT EXISTS tg_flows (id INTEGER PRIMARY KEY, expert_id INTEGER NOT NULL, chat_id TEXT NOT NULL, kind TEXT NOT NULL, step TEXT NOT NULL, assignment_id INTEGER, message_id INTEGER, data_json TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, done_at INTEGER);
CREATE INDEX IF NOT EXISTS ix_flows_open ON tg_flows(expert_id) WHERE done_at IS NULL;
CREATE TABLE IF NOT EXISTS letters (id INTEGER PRIMARY KEY, assignment_id INTEGER NOT NULL, expert_id INTEGER NOT NULL, voice_key TEXT, voice_secs REAL, transcript TEXT, letter_json TEXT, docx_key TEXT, state TEXT NOT NULL DEFAULT 'need_voice', meta_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_letters_asg ON letters(assignment_id);
CREATE TABLE IF NOT EXISTS hist_imports (id INTEGER PRIMARY KEY, filename TEXT, imported_at INTEGER NOT NULL, finished_at INTEGER, row_count INTEGER, state TEXT NOT NULL DEFAULT 'loading', stats_json TEXT);
${CATALOG_DDL.join(";\n")};
CREATE TABLE IF NOT EXISTS norm_cache (title_n TEXT PRIMARY KEY, result TEXT NOT NULL, model TEXT, cost_usd REAL, created_at INTEGER NOT NULL) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS smart_searches (id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL, assignment_id INTEGER, expert_id INTEGER, params_json TEXT, result_json TEXT, model TEXT, prompt_version TEXT, in_tokens INTEGER, out_tokens INTEGER, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_smart_item ON smart_searches(item_id);
CREATE TABLE IF NOT EXISTS smart_jobs (id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL, assignment_id INTEGER, expert_id INTEGER NOT NULL, chat_id TEXT NOT NULL, params_json TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'queued', search_id INTEGER, error TEXT, created_at INTEGER NOT NULL, started_at INTEGER, finished_at INTEGER);
CREATE INDEX IF NOT EXISTS ix_smart_jobs_state ON smart_jobs(state, id);
CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS search_suppliers (id INTEGER PRIMARY KEY, search_id INTEGER NOT NULL, idx INTEGER NOT NULL, item_id INTEGER, assignment_id INTEGER, request_id TEXT, expert_id INTEGER, name TEXT, name_n TEXT, type TEXT, market TEXT, website TEXT, emails_json TEXT, price_text TEXT, price_unit TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_ssup_search ON search_suppliers(search_id);
CREATE INDEX IF NOT EXISTS ix_ssup_name ON search_suppliers(name_n);
CREATE TABLE IF NOT EXISTS supplier_phones (id INTEGER PRIMARY KEY, search_id INTEGER NOT NULL, idx INTEGER NOT NULL, phone TEXT NOT NULL, phone_raw TEXT, supplier_name TEXT, market TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_sphone_phone ON supplier_phones(phone);
CREATE TABLE IF NOT EXISTS phone_channels (phone TEXT PRIMARY KEY, telegram TEXT, whatsapp TEXT, bale TEXT, rubika TEXT, updated_by INTEGER, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS phone_channel_log (id INTEGER PRIMARY KEY, phone TEXT NOT NULL, platform TEXT NOT NULL, state TEXT NOT NULL, prev_state TEXT, expert_id INTEGER, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_pclog_phone ON phone_channel_log(phone, at);
CREATE TABLE IF NOT EXISTS assignment_log (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, action TEXT NOT NULL, request_id TEXT, assignment_id INTEGER, expert_id INTEGER, from_expert_id INTEGER, days INTEGER, deadline_at INTEGER, item_ids_json TEXT, source TEXT, actor TEXT);
CREATE INDEX IF NOT EXISTS ix_alog_req ON assignment_log(request_id, at);
CREATE TABLE IF NOT EXISTS settings_history (id INTEGER PRIMARY KEY, key TEXT NOT NULL, value_json TEXT, prev_json TEXT, at INTEGER NOT NULL, actor TEXT);
CREATE TABLE IF NOT EXISTS scores_history (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, expert_id INTEGER, score_kind TEXT, key TEXT, value REAL, prev REAL, at INTEGER NOT NULL, actor TEXT);
CREATE TABLE IF NOT EXISTS quotes_deleted (id INTEGER PRIMARY KEY, quote_id INTEGER NOT NULL, assignment_id INTEGER, request_id TEXT, item_id INTEGER, supplier_name TEXT, row_json TEXT NOT NULL, deleted_at INTEGER NOT NULL, deleted_by INTEGER, channel TEXT);
CREATE INDEX IF NOT EXISTS ix_qdel_asg ON quotes_deleted(assignment_id);
CREATE TABLE IF NOT EXISTS commission_tables (id INTEGER PRIMARY KEY, assignment_id INTEGER NOT NULL, request_id TEXT, commission_no INTEGER, expert_id INTEGER, at INTEGER NOT NULL, channel TEXT, quote_ids_json TEXT, lines_json TEXT, notes TEXT);
CREATE INDEX IF NOT EXISTS ix_ctab_asg ON commission_tables(assignment_id);
CREATE TABLE IF NOT EXISTS closures (id INTEGER PRIMARY KEY, assignment_id INTEGER NOT NULL, request_id TEXT, expert_id INTEGER, action TEXT NOT NULL, item_ids_json TEXT, closed INTEGER, fully_closed INTEGER, actor TEXT, decision_id INTEGER, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_closures_asg ON closures(assignment_id);
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
  ["assignments", "notes", "TEXT"],           /* توضیحات کارشناس، پای برگهٔ کمیسیون (CM-03) */
  ["quotes", "source", "TEXT"],               /* panel | telegram | ai — قیمت از کجا آمده */
  ["proformas", "extracted_json", "TEXT"],    /* خروجی خام استخراج مدل (INV-15) */
  ["proformas", "extract_state", "TEXT"],     /* pending | ok | refused | failed */
  ["proformas", "extract_at", "INTEGER"],
  ["quotes", "vat", "TEXT"],                  /* ارزش افزوده: دارد | ندارد (اجباری، انتخابی) */
  ["assignments", "mgr_colors", "TEXT"],      /* عکسِ شش رنگِ پایش، برای تشخیص تغییر (اعلان مدیر) */
  ["assignments", "mgr_seen_at", "INTEGER"],  /* مدیر خاتمه را دید — از میز کارش می‌رود */
  ["decisions", "note", "TEXT"],              /* دلیلِ ردِ مدیر (یا مسیرِ تأیید) */
  /* «کد قلم جدید» قالب قبلی فایل سوابق. دیگر خوانده نمی‌شود: ساختار قلم حالا از فهرست اقلام
     (کد راهکاران) یا نرمال‌سازیِ تأییدشده (items.norm_json) می‌آید — worker/history.js:resolveScope */
  ["items", "hist_code", "TEXT"],
  /* جستجوی هوشمند: مصرف واقعی و هزینهٔ هر اجرا (worker/discovery.js:runCost) */
  ["smart_searches", "cache_read", "INTEGER"],
  ["smart_searches", "cache_write", "INTEGER"],
  ["smart_searches", "searches", "INTEGER"],
  ["smart_searches", "fetches", "INTEGER"],
  ["smart_searches", "cost_usd", "REAL"],
  /* «manual» یعنی نوع فاکتور را کارشناس خودش گذاشته؛ خواندن پیش‌فاکتور فقط پیش‌فرض را عوض می‌کند */
  ["quotes", "invoice_src", "TEXT"],
  ["proformas", "item_ids", "TEXT"],          /* JSON: پیش‌فاکتور فقط برای همین اقلام (بات)؛ خالی = همه */
  ["tg_flows", "asked_at", "INTEGER"],        /* آخرین باری که این گفت‌وگو از کارشناس چیزی پرسید */
  ["tg_uploads", "asked_at", "INTEGER"],
  /* شمارهٔ ترتیبی جدول کمیسیون (کد فرم TSA-PS-FO-n) — یک بار، هنگام اولین تولید (bundle.js:markCommission) */
  ["assignments", "commission_no", "INTEGER"],
  ["assignments", "closed_at", "INTEGER"],        /* همهٔ اقلام بسته شد (decisions.js) */
  /* کلید قلمِ هر جستجو، تا جستجوهای همان قلم در درخواست دیگر پیدا شوند (records.js:itemSearches) */
  ["smart_searches", "item_code", "TEXT"],
  ["smart_searches", "hist_code", "TEXT"],
  ["smart_searches", "title_n", "TEXT"],
  ["smart_searches", "request_id", "TEXT"],
  /* خط استعلام از کجا آمد (history | smart | manual | proforma) و شناسهٔ جستجو اگر از جستجو آمد */
  ["quotes", "origin", "TEXT"],
  ["quotes", "origin_ref", "INTEGER"],
  ["quotes", "final_at", "INTEGER"],              /* لحظهٔ تیک «تأیید نهایی» */
  ["quotes", "commission_at", "INTEGER"],         /* در آخرین جدول کمیسیونِ ساخته‌شده بود */
  /* تیم کارشناسی (تصمیم مدیر، شهریور ۱۴۰۵): کارشناس ارشد، سرپرستِ هر کارشناس، مقصد اعلان‌های پایش
     (manager | senior)، گروه تلگرامِ تیمِ کارشناس ارشد، و مرحله‌هایی که او اعلانشان را می‌خواهد */
  ["experts", "senior", "INTEGER"],
  ["experts", "senior_id", "INTEGER"],
  ["experts", "notify_to", "TEXT"],
  ["experts", "team_chat", "TEXT"],
  ["experts", "alert_stages", "TEXT"],
  /* ستون‌های تازهٔ خروجی راهکاران (شهریور ۱۴۰۵) — برای برگهٔ درخواست خرید و بایگانی */
  ["requests", "supply_unit", "TEXT"],           /* واحد رمز/تامین */
  ["requests", "item_type", "TEXT"],             /* نوع قلم (کالا / خدمت) */
  ["requests", "basis_type", "TEXT"],            /* نوع مبنا */
  ["requests", "basis_no", "TEXT"],              /* شماره مبنا */
  ["requests", "contract_kind", "TEXT"],         /* نوع الگو سند قراردادی */
  ["requests", "contract_no", "TEXT"],           /* شماره قرارداد/تفاهم نامه */
  ["items", "quote_deadline", "TEXT"],           /* مهلت استعلام (ستون فایل) */
  ["items", "currency", "TEXT"],
  ["items", "fee", "REAL"],                      /* فی */
  ["items", "amount", "REAL"],                   /* مبلغ */
  /* (شهریور ۱۴۰۵) آستانه‌های پایشی که کارشناس ارشد برای کارشناسان تیمش می‌گذارد (JSON شش‌تایی)،
     و اینکه گفت‌وگوی اعلان تیمش با کدام بات است: «team» = بات Supply Senior، خالی = گروهِ بات اصلی */
  ["experts", "alert_thresholds", "TEXT"],
  ["experts", "team_via", "TEXT"],
  /* پیامِ صف با کدام بات برود: خالی = بات کارشناسان و کانال مدیر، «team» = بات تیمیِ کارشناسان ارشد */
  ["outbox", "bot", "TEXT"],
  /* آخرین باری که پایش رنگ‌ها این ارجاع را سنجید — تا همهٔ ارجاع‌های باز به نوبت سنجیده شوند (manager.js) */
  ["assignments", "watch_at", "INTEGER"],
  /* (مهر ۱۴۰۵) «نرمال‌سازی اقلام»: ساختاری که کارشناس برای قلم تأیید کرده — نوع قلم، لایه‌های ویژگی
     و نرخ‌های تبدیلی که عوض کرده (worker/normalize.js). «بررسی سوابق» بر همین جستجو می‌کند. */
  ["items", "norm_json", "TEXT"],
  ["items", "norm_at", "INTEGER"],
];

/* تغییر نام ستون. `r2_key` وقتی نوشته شد که قرار بود فایل‌ها در R2 بنشینند؛
   R2 روی این حساب فعال نیست و انبار فایل پشت یک آداپتور رفت، پس نام عمومی‌تر
   درست‌تر است. جدول هنوز خالی است، پس تغییر نام بی‌خطر است. */
const COLUMN_RENAMES = [["proformas", "r2_key", "storage_key"]];

/* جدول‌های پیاده‌سازی‌های قبلیِ سوابق که دیگر هیچ کدی نمی‌خواندشان؛ اگر بمانند فقط
   فضای D1 را می‌گیرند و آدم را سرِ خواندنِ طرح دیتابیس گمراه می‌کنند.
   `purchase_history` (قالب قبلی سوابق، با شاخص تعدیلِ درون هر ردیف؛ جایش purchases و
   فهرست اقلام است — worker/catalog.js) در ۲ مهر ۱۴۰۵ دستی حذف و مصرفش اندازه گرفته شد:
   DROP یک جدول ۷۰٬۸۲۵ ردیفی با ۴ ایندکس فقط ۵ «ردیف نوشته‌شده» از سهمیهٔ روزانه برد (نه به
   ازای هر ردیف)، و حجم دیتابیس از ۵۶٫۷ به ۲۶٫۶ مگابایت رسید. این‌جا هست تا دیتابیسِ دیگری
   (نسخهٔ محلی، بازیابی) هم پاکش کند. */
const DROPPED_TABLES = ["supply_history", "history_batches", "purchase_history"];

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


/* اثر انگشتِ طرح: هر تغییری در SCHEMA، ستون‌های افزوده، تغییرنام‌ها یا جدول‌های حذفی این عدد را
   عوض می‌کند. isolate تازه (که در سایت کم‌ترافیک زیاد پیش می‌آید) اول فقط همین را از counters
   می‌خواند؛ اگر همان بود طرح از قبل اعمال شده و ~۲۰ رفت‌وبرگشتِ CREATE/PRAGMA به D1 — که هر
   درخواستِ سرد تا حالا می‌پرداخت — لازم نیست. استقرارِ نسخهٔ تازه با طرحِ تازه، یک بار مسیر کامل را می‌رود. */
const SCHEMA_FP = (() => {
  const s = SCHEMA + JSON.stringify([COLUMN_MIGRATIONS, COLUMN_RENAMES, DROPPED_TABLES]);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0) * 1000 + (s.length % 1000);
})();
let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  if (!env.DB) throw new HttpError("بایندینگ D1 با نام DB روی این پروژه ست نشده است.", 503);
  try {
    const fp = await env.DB.prepare("SELECT value FROM counters WHERE key='schema_fp'").first();
    if (fp && Number(fp.value) === SCHEMA_FP) { schemaReady = true; return; }
  } catch (_) { /* دیتابیس تازه — جدول counters هنوز ساخته نشده؛ مسیر کامل */ }
  await env.DB.exec(SCHEMA.trim().split("\n").filter(Boolean).join("\n"));
  for (const t of DROPPED_TABLES) await env.DB.exec(`DROP TABLE IF EXISTS ${t};`);
  await migrateColumns(env);
  /* جستجوهای پیش از ستون‌های کلید قلم؛ اگر نشد، فقط جستجوهای قبلی دیرتر پیدا می‌شوند */
  await backfillSearchKeys(env).catch((e) => console.error("backfillSearchKeys", e && e.message));
  const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM experts").first();
  if (!c || !c.n) {
    const t = now();
    await env.DB.batch(SEED_EXPERTS.map(([code, name, label]) =>
      env.DB.prepare("INSERT OR IGNORE INTO experts (code,name,label,active,speed,created_at) VALUES (?,?,?,1,1.0,?)").bind(code, nrm(name), label, t)));
  }
  await env.DB.prepare("INSERT INTO counters (key,value) VALUES ('schema_fp',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(SCHEMA_FP).run();
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

/* تعطیلات، زمان‌بندی هشدارها، تغییر کارشناس و آستانه‌های مؤثر در worker/assign.js اند —
   بات تلگرام («ارجاع به تیم» از تلگرامِ کارشناس ارشد) هم همان‌ها را صدا می‌زند. */

/**
 * حذف درخواست‌ها و هر چیزی که به آن‌ها آویزان است.
 *
 * `ids = null` یعنی همه — میز از نو.
 *
 * ترتیب مهم است: اول کلیدهای فایل جمع می‌شوند (پیش‌فاکتورها و نامه‌ها)، بعد
 * ردیف‌های دیتابیس می‌روند، و در آخر فایل‌ها از انبار پاک می‌شوند. اگر حذفِ
 * فایل شکست بخورد، دیتابیس تمیز است و فقط چند فایل یتیم می‌ماند — که از
 * حالتِ عکسش (ردیفی که به فایلِ نبوده اشاره می‌کند) خیلی بهتر است.
 */
async function deleteRequests(env, ids) {
  const where = ids ? `IN (${ids.map(() => "?").join(",")})` : "IS NOT NULL";
  const args = ids || [];
  const inAsg = `SELECT id FROM assignments WHERE request_id ${where}`;

  const before = await env.DB.prepare(`SELECT COUNT(*) AS n FROM requests WHERE id ${where}`).bind(...args).first();
  if (!before || !before.n) return { ok: true, requests: 0, files: 0 };

  const keys = [
    ...((await env.DB.prepare(`SELECT storage_key AS k FROM proformas WHERE assignment_id IN (${inAsg}) AND storage_key IS NOT NULL`).bind(...args).all()).results || []),
    ...((await env.DB.prepare(`SELECT docx_key AS k FROM letters WHERE assignment_id IN (${inAsg}) AND docx_key IS NOT NULL`).bind(...args).all()).results || []),
    ...((await env.DB.prepare(`SELECT voice_key AS k FROM letters WHERE assignment_id IN (${inAsg}) AND voice_key IS NOT NULL`).bind(...args).all()).results || []),
  ].map((r) => r.k).filter(Boolean);

  const t = now();
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM quotes WHERE assignment_id IN (${inAsg})`).bind(...args),
    env.DB.prepare(`DELETE FROM proformas WHERE assignment_id IN (${inAsg})`).bind(...args),
    env.DB.prepare(`DELETE FROM letters WHERE assignment_id IN (${inAsg})`).bind(...args),
    env.DB.prepare(`DELETE FROM decisions WHERE assignment_id IN (${inAsg})`).bind(...args),
    env.DB.prepare(`DELETE FROM alerts WHERE assignment_id IN (${inAsg})`).bind(...args),
    env.DB.prepare(`DELETE FROM tg_uploads WHERE assignment_id IN (${inAsg})`).bind(...args),
    env.DB.prepare(`DELETE FROM tg_flows WHERE assignment_id IN (${inAsg})`).bind(...args),
    /* اعلان‌های در صف برای ارجاع‌های حذف‌شده نباید بعداً فرستاده شوند؛ فرستاده‌شده‌ها تاریخچه‌اند و می‌مانند */
    env.DB.prepare(`DELETE FROM outbox WHERE status='pending' AND EXISTS (SELECT 1 FROM assignments a WHERE a.request_id ${where}
      AND (outbox.idem LIKE 'dispatch:' || a.id || ':%' OR outbox.idem LIKE 'stage:' || a.id || ':%'
        OR outbox.idem LIKE 'over:' || a.id || ':%' OR outbox.idem LIKE 'over-mgr:' || a.id || ':%'
        OR outbox.idem = 'dispatch:' || a.id OR outbox.idem = 'over:' || a.id OR outbox.idem = 'over-mgr:' || a.id))`).bind(...args),
    env.DB.prepare(`DELETE FROM items WHERE request_id ${where}`).bind(...args),
    env.DB.prepare(`DELETE FROM assignments WHERE request_id ${where}`).bind(...args),
    env.DB.prepare(`DELETE FROM events WHERE request_id ${where}`).bind(...args),
    /* ثبت‌های هر درخواست هم با خودش می‌روند — شناسهٔ ارجاع بعد از پاک‌کردن میز دوباره استفاده می‌شود */
    ...["assignment_log", "quotes_deleted", "commission_tables", "closures"].map((tb) => env.DB.prepare(`DELETE FROM ${tb} WHERE request_id ${where}`).bind(...args)),
    env.DB.prepare(`DELETE FROM requests WHERE id ${where}`).bind(...args),
    /* پاک‌کردن میز خودش یک رویداد است و باید در تاریخچه بماند */
    env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)")
      .bind(t, "manager", "delete", null, JSON.stringify({ requests: before.n, all: !ids, ids: ids ? ids.slice(0, 20) : null })),
  ]);

  const store = storage(env);
  let files = 0;
  if (store) for (const k of keys) { try { await store.remove(k); files++; } catch (_) { /* یتیم می‌ماند، ولی دیتابیس تمیز است */ } }
  return { ok: true, requests: before.n, files };
}

/* ------------------------------------------------------------------ */
/* استخراج پیش‌فاکتور                                                    */
/* ------------------------------------------------------------------ */

async function putSettings(env, patch) {
  const t = now(); const stmts = [];
  const known = Object.fromEntries(Object.entries(patch || {}).filter(([k]) => k in DEFAULTS));
  /* هر تغییرِ آستانه‌ها و ضرایب ارجاع/مهلت هوشمند با مقدار قبلی در تاریخچه می‌ماند */
  stmts.push(...await settingsHistoryStmts(env, known, "manager"));
  for (const [k, v] of Object.entries(known)) {
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
  let newRequests = 0, newItems = 0, closedSkipped = 0;
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
    stmts.push(env.DB.prepare(`INSERT INTO requests (id,date,party,party_type,center,requester,req_type,buy_type,buy_flow,urgency,first_import_id,last_import_id,
        supply_unit,item_type,basis_type,basis_no,contract_kind,contract_no)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET date=excluded.date, party=excluded.party, party_type=excluded.party_type, center=excluded.center,
        requester=excluded.requester, req_type=excluded.req_type, buy_type=excluded.buy_type, buy_flow=excluded.buy_flow, urgency=excluded.urgency, last_import_id=excluded.last_import_id,
        supply_unit=COALESCE(excluded.supply_unit, requests.supply_unit), item_type=COALESCE(excluded.item_type, requests.item_type),
        basis_type=COALESCE(excluded.basis_type, requests.basis_type), basis_no=COALESCE(excluded.basis_no, requests.basis_no),
        contract_kind=COALESCE(excluded.contract_kind, requests.contract_kind), contract_no=COALESCE(excluded.contract_no, requests.contract_no)`)
      .bind(id, T(r.date), T(r.party), T(r.partyType) || null, T(r.center) || null, T(r.requester) || null, T(r.reqType) || null, T(r.buyType) || null, T(r.buyFlow) || null, T(r.urgency) || null, importId, importId,
        T(r.supplyUnit) || null, T(r.itemType) || null, T(r.basisType) || null, T(r.basisNo) || null, T(r.contractKind) || null, T(r.contractNo) || null));
    /* کلید قلم = عنوانِ نرمال‌شده (+ شمارنده برای عنوان تکراری در همان درخواست).
       خروجی روزانهٔ راهکاران کد قلم ندارد و خروجی کامل دارد؛ کلیدِ عنوانی در هر دو یکی است
       و بارگذاری دوباره (یا هر دو فرمت پشت‌سرهم) قلم را تکرار نمی‌کند. */
    const seen = new Map();
    for (const it of r.items || []) {
      const base = nrm(it.title) || ("line" + int(it.lineNo, 1));
      const n = seen.get(base) || 0; seen.set(base, n + 1);
      const key = n ? `${base}#${n}` : base;

      /* قلمی که در راهکاران «بسته شده» است وارد پنل نمی‌شود.
         اگر سامانه از قبل داردش، فقط وضعیتِ فایل روی همان ردیف می‌نشیند تا در
         گام finish به مدیر پیشنهادِ بستن برود؛ اگر ندارد، اصلاً ساخته نمی‌شود.
         (کلید همچنان برای همهٔ سطرها ساخته می‌شود — ترتیبِ فایل باید حفظ شود،
         وگرنه با افتادنِ یک سطر، کلیدِ قلم‌های هم‌نامِ بعدی جابه‌جا می‌شود.) */
      if (it.state === "closed") {
        stmts.push(env.DB.prepare("UPDATE items SET src_status=? WHERE request_id=? AND item_key=?")
          .bind(T(it.srcStatus) || null, id, key));
        closedSkipped++;
        continue;
      }

      /* وضعیت راهکاران فقط برای قلمِ تازه اعمال می‌شود؛ برای قلم موجود، state سامانه دست‌نخورده می‌ماند
         و اختلاف در مرحلهٔ finish به‌عنوان پیشنهاد به مدیر برمی‌گردد (ملاک فایل جدید است، اعمال با تأیید).
         ستون‌هایی که فایل روزانه ندارد (کد، مشخصه، تاریخ نیاز، …) با COALESCE از فایل کامل قبلی حفظ می‌شوند. */
      stmts.push(env.DB.prepare(`INSERT INTO items (request_id,item_key,line_no,code,title,spec,qty,unit,need_date,consumer,note,src_status,src_expert,state,state_at,quote_deadline,currency,fee,amount)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(request_id,item_key) DO UPDATE SET line_no=excluded.line_no, title=excluded.title,
          code=COALESCE(excluded.code, items.code), spec=COALESCE(excluded.spec, items.spec), qty=excluded.qty, unit=excluded.unit,
          need_date=COALESCE(excluded.need_date, items.need_date), consumer=COALESCE(excluded.consumer, items.consumer), note=COALESCE(excluded.note, items.note),
          src_status=excluded.src_status, src_expert=COALESCE(excluded.src_expert, items.src_expert),
          quote_deadline=COALESCE(excluded.quote_deadline, items.quote_deadline), currency=COALESCE(excluded.currency, items.currency),
          fee=COALESCE(excluded.fee, items.fee), amount=COALESCE(excluded.amount, items.amount)`)
        .bind(id, key, int(it.lineNo, 1), T(it.code) || null, T(it.title), T(it.spec) || null, num(it.qty), T(it.unit) || null, T(it.needDate) || null,
          T(it.consumer) || null, T(it.note) || null, T(it.srcStatus) || null, T(it.srcExpert) || null, ["open", "hold", "stop", "closed"].includes(it.state) ? it.state : "open", t,
          T(it.quoteDeadline) || null, T(it.currency) || null, num(it.fee), num(it.amount)));
      newItems++;
    }
  }
  for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
  return { ok: true, requests: reqs.length, newRequests, itemsUpserted: newItems, closedSkipped };
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
  /* درخواستِ زنده همیشه هست؛ درخواستِ بسته تا وقتی مدیر «مشاهده کردم» را
     نزده (یا سی روز نگذشته) از میز کار بیرون نمی‌رود. */
  const scopeSql = "r.id IN (SELECT request_id FROM items WHERE state IN ('open','hold')"
    + " UNION SELECT request_id FROM assignments WHERE dispatched_at > ? AND mgr_seen_at IS NULL)";
  if (id) { conds.push("r.id=?"); args.push(id); }
  else {
    if (scope !== "all") { conds.push(scopeSql); args.push(now() - 30 * DAY); }
    if (from) { conds.push("r.date >= ?"); args.push(from); }
  }
  const where = conds.length ? conds.join(" AND ") : "1=1";
  /* سرعت: همهٔ خواندن‌های مستقلِ میز در یک batch — یک رفت‌وبرگشت به D1 به‌جای ۶ تا ۱۲ رفت‌وبرگشتِ
     پشت‌سرهم. هر رفت‌وبرگشت وقتی Worker و دیتابیس در یک منطقه نباشند ده‌ها تا صدها میلی‌ثانیه است.
     with=all: امتیازها و تصمیم‌های در انتظار هم در همین پاسخ (پنل مدیر قبلاً سه درخواست می‌فرستاد). */
  const withAll = url.searchParams.get("with") === "all";
  const allArgs = scope !== "all" ? [now() - 30 * DAY] : [];
  const first = [
    env.DB.prepare(`SELECT COUNT(*) AS n FROM requests r WHERE ${where}`).bind(...args),
    // all_total: همان شمارش بدون فیلتر تاریخ — تا وقتی بازهٔ انتخابی خالی است، پنل به‌جای
    // «فایلی بارگذاری نشده» بگوید درخواست‌ها در تاریخ‌های قدیمی‌تر هستند
    env.DB.prepare(`SELECT COUNT(*) AS n FROM requests r WHERE ${from && !id ? (scope !== "all" ? scopeSql : "1=1") : where}`).bind(...(from && !id ? allArgs : args)),
    env.DB.prepare(`SELECT r.*, im.imported_at AS imported_at FROM requests r LEFT JOIN imports im ON im.id=r.first_import_id WHERE ${where} ORDER BY r.date DESC, r.id DESC LIMIT ? OFFSET ?`).bind(...args, limit, offset),
    listExpertsStmt(env),
    env.DB.prepare("SELECT key,value FROM settings"),
    ...(withAll ? [
      env.DB.prepare("SELECT * FROM expert_scores"), env.DB.prepare("SELECT * FROM weights"),
      env.DB.prepare("SELECT d.*, e.name AS expert_name, a.request_id FROM decisions d JOIN experts e ON e.id=d.expert_id JOIN assignments a ON a.id=d.assignment_id WHERE d.approved_at IS NULL AND d.rejected_at IS NULL ORDER BY d.requested_at"),
    ] : []),
  ];
  const [cnt, allCnt, reqRes, expRes, setRes, scRes, wRes, decRes] = await env.DB.batch(first);
  const total = (cnt.results[0] || {}).n || 0, all_total = (allCnt.results[0] || {}).n || total;
  const reqs = reqRes.results || [];
  const extra = {
    limit, offset, total, all_total,
    experts: expertRows(expRes.results || []),
    settings: settingsFromRows(setRes.results || []),
    ...(withAll ? { scores: { scores: scRes.results || [], weights: wRes.results || [] }, decisions: decRes.results || [] } : {}),
  };
  if (!reqs.length) return { requests: [], ...extra };
  const ids = reqs.map((r) => r.id);
  const second = [];
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90), q = part.map(() => "?").join(",");
    second.push(env.DB.prepare(`SELECT * FROM items WHERE request_id IN (${q}) ORDER BY request_id, line_no`).bind(...part));
    second.push(env.DB.prepare(`SELECT a.*, e.name AS expert_name, e.label AS expert_label,
        (SELECT COUNT(*) FROM quotes q WHERE q.assignment_id=a.id AND q.saved=1) AS quote_count,
        (SELECT COUNT(*) FROM proformas p WHERE p.assignment_id=a.id) AS proforma_count
      FROM assignments a JOIN experts e ON e.id=a.expert_id WHERE a.request_id IN (${q})`).bind(...part));
  }
  const res2 = await env.DB.batch(second);
  const byReq = new Map(reqs.map((r) => [r.id, { ...r, items: [], assignments: [] }]));
  res2.forEach((r, k) => (r.results || []).forEach((x) => { const g = byReq.get(x.request_id); if (g) (k % 2 ? g.assignments : g.items).push(x); }));
  return { requests: [...byReq.values()], ...extra };
}

/* بار باز کارشناسان برای ارجاع و مهلت هوشمند: همهٔ ارجاع‌هایی که قلم باز یا معلق دارند —
   ارسال‌شده و ارسال‌نشده، چون فرض پیشنهادها «تأیید همه» است — با طرف مقابل و عنوان اقلام.
   گروه کالایی را پنل از روی عنوان حدس می‌زند، پس این‌جا فقط دادهٔ خام می‌رود. */
async function workload(env) {
  const rows = (await env.DB.prepare(`SELECT a.id AS aid, a.expert_id, a.request_id, a.dispatched_at, r.party, i.title
    FROM assignments a JOIN requests r ON r.id=a.request_id JOIN items i ON i.assignment_id=a.id
    WHERE i.state IN ('open','hold') ORDER BY a.id LIMIT 20000`).all()).results || [];
  const by = new Map();
  for (const x of rows) {
    let g = by.get(x.aid);
    if (!g) { g = { aid: x.aid, expert_id: x.expert_id, request_id: x.request_id, dispatched: !!x.dispatched_at, party: x.party, titles: [] }; by.set(x.aid, g); }
    g.titles.push(x.title);
  }
  return { assignments: [...by.values()] };
}

/* کارشناس‌های ارشد اول، بعد بقیه — همان ترتیبی که فهرست انتخاب کارشناس در میز باید داشته باشد */
async function listExperts(env) {
  return expertRows((await listExpertsStmt(env).all()).results || []);
}
/* کوئری و شکلِ خروجیِ فهرست کارشناسان جدا شده‌اند تا میز ارجاع آن را در همان batch بقیهٔ
   خواندن‌هایش بفرستد (یک رفت‌وبرگشت به D1 به‌جای چند تا). */
const listExpertsStmt = (env) => env.DB.prepare(`SELECT e.id,e.name,e.label,e.code,e.active,e.speed,e.telegram_chat,e.senior,e.senior_id,e.notify_to,e.team_chat,e.team_via,e.alert_stages,e.alert_thresholds,
      (SELECT COUNT(DISTINCT a.id) FROM assignments a JOIN items i ON i.assignment_id=a.id WHERE a.expert_id=e.id AND a.dispatched_at IS NOT NULL AND i.state IN ('open','hold')) AS open_load
    FROM experts e ORDER BY e.active DESC, e.senior DESC, e.name`);
const expertRows = (rows) => rows.map((e) => ({ ...e, senior: e.senior ? 1 : 0, notify_to: e.notify_to === "senior" ? "senior" : "manager", alert_stages: stageTicks(e.alert_stages),
  alert_thresholds: parseThresholds(e.alert_thresholds), team_connected: !!e.team_chat, team_bot: e.team_via === "team", team_chat: undefined, team_via: undefined }));

/* ------------------------------------------------------------------ */
/* کد ورود کارشناس                                                       */
/* ------------------------------------------------------------------ */
const CODE_RE = /^\d{4,8}$/;
/* کدِ کارشناسِ حذف‌شده (غیرفعال) کنار می‌رود تا همان کد دوباره قابل استفاده باشد؛ غیرفعال که وارد
   نمی‌شود و رقم ندارد، پس با هیچ کد ورودی برابر نمی‌شود. نام و کد در جدول UNIQUE اند. */
const retiredCode = (id) => `x${id}-${now()}`;

/**
 * مدیر یا خودِ کارشناس کد ورود را عوض می‌کند. کدِ کارشناسِ فعالِ دیگر قابل گرفتن نیست؛
 * کدِ یک کارشناسِ حذف‌شده آزاد می‌شود. `reveal` (فقط مدیر) نام صاحبِ کد را در خطا می‌گوید.
 */
async function setExpertCode(env, id, raw, { reveal } = {}) {
  const code = T(raw).replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
  if (!CODE_RE.test(code)) throw new HttpError("کد ورود باید ۴ تا ۸ رقم باشد و فقط عدد.");
  if (env.MANAGER_CODE && code === String(env.MANAGER_CODE)) throw new HttpError("این کد قابل استفاده نیست؛ کد دیگری انتخاب کنید.", 409);
  const holder = await env.DB.prepare("SELECT id,name,active FROM experts WHERE code=?").bind(code).first();
  if (holder && holder.id === id) return { ok: true, code, unchanged: true };
  if (holder && holder.active) throw new HttpError(reveal ? `این کد ورودِ «${holder.name}» است؛ کد دیگری بدهید.` : "این کد را کارشناس دیگری دارد؛ کد دیگری انتخاب کنید.", 409);
  const stmts = [];
  if (holder) stmts.push(env.DB.prepare("UPDATE experts SET code=? WHERE id=?").bind(retiredCode(holder.id), holder.id));
  stmts.push(env.DB.prepare("UPDATE experts SET code=? WHERE id=?").bind(code, id));
  await env.DB.batch(stmts);
  return { ok: true, code };
}

/**
 * افزودن کارشناس از تب «کارشناسان». باگ قبلی: «حذف» فقط غیرفعال می‌کند و ردیف با همان نام و
 * کد می‌ماند، پس افزودنِ دوبارهٔ همان نفر با همان کد خطای «از قبل هست» می‌داد. حالا:
 *   • نام یا کد مالِ کارشناسِ فعال باشد ← خطای روشن
 *   • همان نام، حذف‌شده ← همان ردیف برمی‌گردد (سوابق ارجاع‌هایش هم با او) با کد و نام کوتاه تازه
 *   • کد مالِ کارشناسِ حذف‌شدهٔ دیگری ← کد از او آزاد می‌شود و به این نفر می‌رسد
 */
async function addExpert(env, b) {
  const name = nrm(b.name), label = T(b.label) || T(b.name);
  const code = T(b.code).replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
  if (!name || !code) throw new HttpError("نام و کد ورود لازم است.");
  if (!CODE_RE.test(code)) throw new HttpError("کد ورود باید ۴ تا ۸ رقم باشد و فقط عدد.");
  if (env.MANAGER_CODE && code === String(env.MANAGER_CODE)) throw new HttpError("این کد قابل استفاده نیست؛ کد دیگری بدهید.", 409);
  const rows = (await env.DB.prepare("SELECT id,name,code,active FROM experts WHERE name=? OR code=?").bind(name, code).all()).results || [];
  const byCode = rows.find((r) => r.active && r.code === code);
  if (byCode) throw new HttpError(`کد ورود ${code} مالِ «${byCode.name}» است؛ کد دیگری بدهید.`, 409);
  if (rows.some((r) => r.active && r.name === name)) throw new HttpError(`«${name}» از قبل در فهرست کارشناسان هست.`, 409);
  const back = rows.find((r) => r.name === name) || null;
  const stmts = rows.filter((r) => r.code === code && (!back || r.id !== back.id))
    .map((r) => env.DB.prepare("UPDATE experts SET code=? WHERE id=?").bind(retiredCode(r.id), r.id));
  if (back) {
    stmts.push(env.DB.prepare("UPDATE experts SET active=1, code=?, label=?, senior=0, senior_id=NULL, notify_to=NULL WHERE id=?").bind(code, label || name, back.id));
    await env.DB.batch(stmts);
    return { ok: true, id: back.id, name, code, restored: true };
  }
  stmts.push(env.DB.prepare("INSERT INTO experts (name,label,code,active,speed,created_at) VALUES (?,?,?,1,1.0,?)").bind(name, label || name, code, now()));
  const res = await env.DB.batch(stmts);
  return { ok: true, id: res[res.length - 1].meta.last_row_id, name, code };
}

/**
 * جدول کارشناسان مدیر (تب «کارشناسان»): نام، ستاره (ارشد)، سرپرست، مقصد اعلان.
 * ستاره برداشته شود → زیرمجموعه‌هایش بی‌سرپرست می‌شوند، نه اینکه به کس دیگری بروند.
 */
async function updateExpert(env, id, b) {
  const cur = await env.DB.prepare("SELECT * FROM experts WHERE id=?").bind(id).first();
  if (!cur) throw new HttpError("کارشناس پیدا نشد.", 404);
  const sets = [], args = [], extra = [];
  /* کد ورود: مدیر هر وقت بخواهد عوضش می‌کند (کارشناس هم از صفحهٔ «حساب من») */
  if ("code" in b) await setExpertCode(env, id, b.code, { reveal: true });
  if ("speed" in b) { sets.push("speed=?"); args.push(Number(b.speed) || 1); }
  if ("active" in b) {
    sets.push("active=?"); args.push(b.active ? 1 : 0);
    if (!b.active) { sets.push("senior=0"); extra.push(env.DB.prepare("UPDATE experts SET senior_id=NULL WHERE senior_id=?").bind(id)); }
  }
  if ("telegram_chat" in b) { sets.push("telegram_chat=?"); args.push(T(b.telegram_chat) || null); }
  if ("name" in b) {
    const name = nrm(b.name);
    if (!name) throw new HttpError("نام کارشناس خالی است.");
    const dup = await env.DB.prepare("SELECT id FROM experts WHERE name=? AND id<>?").bind(name, id).first();
    if (dup) throw new HttpError("کارشناسی با همین نام از قبل هست.", 409);
    sets.push("name=?, label=?"); args.push(name, T(b.label) || name);
  } else if ("label" in b) { sets.push("label=?"); args.push(T(b.label) || cur.name); }
  if ("senior" in b) {
    sets.push("senior=?"); args.push(b.senior ? 1 : 0);
    if (!b.senior) extra.push(env.DB.prepare("UPDATE experts SET senior_id=NULL WHERE senior_id=?").bind(id));
    if (b.senior) { sets.push("senior_id=NULL"); }              /* ارشد زیرِ کسی نیست */
  }
  if ("senior_id" in b) {
    const sid = int(b.senior_id);
    if (sid) {
      if (sid === id) throw new HttpError("کارشناس نمی‌تواند سرپرست خودش باشد.");
      const s = await env.DB.prepare("SELECT id FROM experts WHERE id=? AND active=1 AND senior=1").bind(sid).first();
      if (!s) throw new HttpError("کارشناس ارشد معتبر نیست.");
    }
    sets.push("senior_id=?"); args.push(sid || null);
  }
  if ("notify_to" in b) { sets.push("notify_to=?"); args.push(b.notify_to === "senior" ? "senior" : "manager"); }
  if ("alert_stages" in b) { sets.push("alert_stages=?"); args.push(JSON.stringify(stageTicks(b.alert_stages))); }
  if (sets.length) { args.push(id); await env.DB.batch([env.DB.prepare(`UPDATE experts SET ${sets.join(",")} WHERE id=?`).bind(...args), ...extra]); }
  return { ok: true };
}

/* آیا `who` (مدیر یا کارشناس) این ارجاع را می‌بیند؟ کارشناس: مال خودش یا مال زیرمجموعه‌اش */
async function canSee(env, who, expertId) {
  if (who.role === "manager") return true;
  if (who.expert.id === expertId) return true;
  if (!who.expert.senior) return false;
  const e = await env.DB.prepare("SELECT id FROM experts WHERE id=? AND senior_id=?").bind(expertId, who.expert.id).first();
  return !!e;
}

/**
 * تب «تیم کارشناسی» کارشناس ارشد: زیرمجموعه‌ها و همهٔ ارجاع‌هایشان که قلم باز/معلق دارند
 * (یا در سی روز اخیر ارسال شده‌اند) — همان ردیف‌های میز مدیر، فقط برای تیم او.
 */
async function teamDesk(env, ex) {
  const team = (await env.DB.prepare("SELECT id,name,label,active FROM experts WHERE senior_id=? AND active=1 ORDER BY name").bind(ex.id).all()).results || [];
  if (!team.length) return { team: [], requests: [], settings: await getSettings(env) };
  const ids = team.map((e) => e.id), q = ids.map(() => "?").join(",");
  const assigns = (await env.DB.prepare(`SELECT a.*, e.name AS expert_name, e.label AS expert_label, r.date, r.party, r.center,
      (SELECT COUNT(*) FROM quotes x WHERE x.assignment_id=a.id AND x.saved=1) AS quote_count,
      (SELECT COUNT(*) FROM proformas p WHERE p.assignment_id=a.id) AS proforma_count
    FROM assignments a JOIN experts e ON e.id=a.expert_id JOIN requests r ON r.id=a.request_id
    WHERE a.expert_id IN (${q}) AND (EXISTS (SELECT 1 FROM items i WHERE i.assignment_id=a.id AND i.state IN ('open','hold')) OR a.dispatched_at > ?)
    ORDER BY a.dispatched_at DESC, a.id DESC LIMIT 400`).bind(...ids, now() - 30 * DAY).all()).results || [];
  const aids = assigns.map((a) => a.id);
  const items = aids.length ? (await env.DB.prepare(`SELECT * FROM items WHERE assignment_id IN (${aids.map(() => "?").join(",")}) ORDER BY request_id, line_no`).bind(...aids).all()).results || [] : [];
  const byReq = new Map();
  for (const a of assigns) {
    if (!byReq.has(a.request_id)) byReq.set(a.request_id, { id: a.request_id, date: a.date, party: a.party, center: a.center, items: [], assignments: [] });
    byReq.get(a.request_id).assignments.push(a);
  }
  for (const i of items) { const r = byReq.get(i.request_id); if (r) r.items.push(i); }
  /* باکس‌های تیم با آستانه‌های خودِ ارشد (اگر گذاشته) */
  const s = await getSettings(env);
  return { team, requests: [...byReq.values()], settings: ex.alert_thresholds ? { ...s, thresholds: ex.alert_thresholds } : s };
}

/**
 * «ارجاع به تیم»: کارشناس ارشد یکی از ارجاع‌های خودش (یا زیرمجموعه‌اش) را به یکی از
 * زیرمجموعه‌هایش (یا به خودش) می‌دهد. همان تغییر کارشناسِ مدیر است؛ ساعت‌شمار از نو،
 * و اگر ارسال شده بود، به کارشناس تازه اعلان «ارجاع جدید» می‌رود.
 */
async function delegate(env, ex, body, ctx) {
  const r = await delegateAssignment(env, ex, body);   /* همان مسیری که دکمهٔ «ارجاع به تیم» در بات می‌رود */
  flush(env, ctx, 1);
  return r;
}

/* ارجاع: (درخواست، کارشناس) → اقلام */
async function assign(env, body) {
  const rid = T(body.request_id), eid = int(body.expert_id);
  if (!rid) throw new HttpError("request_id لازم است.");
  const t = now();
  const source = body.source === "smart" ? "smart" : "manual";
  if (!eid) {
    /* حذف کارشناس از اقلام ارسال‌نشده */
    await env.DB.prepare(`UPDATE items SET assignment_id=NULL WHERE request_id=? AND assignment_id IN (SELECT id FROM assignments WHERE request_id=? AND dispatched_at IS NULL)`).bind(rid, rid).run();
    await env.DB.prepare("DELETE FROM assignments WHERE request_id=? AND dispatched_at IS NULL AND id NOT IN (SELECT DISTINCT assignment_id FROM items WHERE assignment_id IS NOT NULL)").bind(rid).run();
    await assignmentLogStmt(env, { at: t, action: "unassign", request_id: rid, source }).run();
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
  const mine = ((await env.DB.prepare("SELECT id FROM items WHERE assignment_id=?").bind(a.id).all()).results || []).map((i) => i.id);
  await assignmentLogStmt(env, { at: t, action: "assign", request_id: rid, assignment_id: a.id, expert_id: eid, days: body.days === undefined ? null : int(body.days), item_ids: mine, source }).run();
  return { ok: true, assignment_id: a.id };
}

async function setDays(env, body) {
  const aid = int(body.assignment_id); if (!aid) throw new HttpError("assignment_id لازم است.");
  const a = await env.DB.prepare("SELECT dispatched_at, request_id, expert_id, days FROM assignments WHERE id=?").bind(aid).first();
  if (!a) throw new HttpError("ارجاع پیدا نشد.", 404);
  if (a.dispatched_at) throw new HttpError("مهلتِ ارجاعِ ارسال‌شده از اینجا تغییر نمی‌کند؛ از «تغییر کارشناس» استفاده کنید.");
  const days = int(body.days);
  const stmts = [env.DB.prepare("UPDATE assignments SET days=? WHERE id=?").bind(days, aid)];
  if (days !== a.days) stmts.push(assignmentLogStmt(env, { action: "days", request_id: a.request_id, assignment_id: aid, expert_id: a.expert_id, days, source: body.source === "smart" ? "smart" : "manual" }));
  await env.DB.batch(stmts);
  return { ok: true };
}

/* ارسال: ساعت‌شمار شروع می‌شود + رویداد اعلان برای هر کارشناس */
async function dispatch(env, body) {
  const ids = (body.assignment_ids || []).map((x) => int(x)).filter(Boolean);
  if (!ids.length) throw new HttpError("هیچ ارجاعی انتخاب نشده.");
  const rows = (await env.DB.prepare(`SELECT a.*, e.name, e.label, e.telegram_chat, e.senior, ${TEAM_SIZE_SQL} AS team_n, r.party,
      (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id) AS item_count
    FROM assignments a JOIN experts e ON e.id=a.expert_id JOIN requests r ON r.id=a.request_id
    WHERE a.id IN (${ids.map(() => "?").join(",")}) AND a.dispatched_at IS NULL AND a.days>0`).bind(...ids).all()).results || [];
  const t = now(); const stmts = []; let notified = 0;
  /* آستانه‌ها و تعطیلات یک بار خوانده می‌شوند و برای همهٔ ارجاع‌های این دسته به کار می‌روند.
     آستانهٔ هر ارجاع، آستانهٔ مؤثرِ کارشناسش است: ارشدش اگر برای تیم گذاشته، وگرنه مدیر. */
  const [settings, isHoliday] = rows.length ? await Promise.all([getSettings(env), holidayFn(env)]) : [null, null];
  const thrBy = rows.length ? await thresholdsByExpert(env, rows.map((a) => a.expert_id), settings) : new Map();
  /* اقلامِ همهٔ ارجاع‌های این دسته با یک کوئری — پیام ارجاع باید خودِ اقلام را
     بگوید تا کارشناس بتواند سبک‌سنگین کند، و سقف ۵۰ زیردرخواست هم اجازهٔ یک
     کوئری برای هر ارجاع نمی‌داد. */
  const itemsBy = new Map();
  if (rows.length) {
    const aids = rows.map((a) => a.id);
    const its = (await env.DB.prepare(`SELECT id, assignment_id, title, qty, unit FROM items
      WHERE assignment_id IN (${aids.map(() => "?").join(",")}) AND state='open' ORDER BY assignment_id, line_no`).bind(...aids).all()).results || [];
    for (const i of its) { if (!itemsBy.has(i.assignment_id)) itemsBy.set(i.assignment_id, []); itemsBy.get(i.assignment_id).push(i); }
  }
  for (const a of rows) {
    stmts.push(env.DB.prepare("UPDATE assignments SET dispatched_at=? WHERE id=?").bind(t, a.id));
    const thr = thrBy.get(a.expert_id) || settings.thresholds;
    const sched = alertStatements(env, a, thr, isHoliday, t);
    stmts.push(...sched);
    /* تاریخچهٔ ارجاع: لحظهٔ ارسال، کارشناس، مهلت (روز و لحظهٔ پایان) و اقلام */
    stmts.push(assignmentLogStmt(env, { at: t, action: "dispatch", request_id: a.request_id, assignment_id: a.id, expert_id: a.expert_id, days: a.days,
      deadline_at: alertSchedule(t, a.days, thr, isHoliday).deadlineAt, item_ids: (itemsBy.get(a.id) || []).map((i) => i.id) }));
    /* اعلان «ارجاع جدید» (TG-06). مهلت را از همان زمان‌بندیِ تازه‌ساخته برمی‌داریم
       چون ستون deadline_at هنوز در همین batch نوشته نشده است. */
    if (a.telegram_chat) {
      /* کلیدِ یکتایی باید زمان را هم داشته باشد: شناسهٔ ارجاع بعد از پاک‌کردن میز
         دوباره از ۱ شروع می‌شود و ردیفِ قدیمیِ «dispatch:3» اعلانِ ارجاعِ تازه را
         بی‌صدا می‌خورد (ON CONFLICT DO NOTHING) — همین در تست محلی اتفاق افتاد. */
      stmts.push(queueStmt(env, `dispatch:${a.id}:${t}`, a.telegram_chat,
        dispatchText({ ...a, items: itemsBy.get(a.id) || [], dispatched_at: t, deadline_at: alertSchedule(t, a.days, thr, isHoliday).deadlineAt }),
        seenKb(a.id, a.senior && a.team_n > 0)));
      notified++;
    }
    stmts.push(ev(env, "manager", "dispatch", a.request_id, null, { assignment_id: a.id, expert_id: a.expert_id, expert: a.name, days: a.days, notify: a.telegram_chat ? "telegram" : "none" }));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return { ok: true, dispatched: rows.length, notified };
}

/* تغییر کارشناس (reassign) در worker/assign.js است — مدیر از این‌جا، کارشناس ارشد از پنل و بات */

/* مدیر کارشناسِ یک ارجاعِ ارسال‌نشده را برمی‌دارد: اقلامش دوباره «بدون کارشناس»
   می‌شوند و با «ارسال» جایی نمی‌روند. فقط همان ارجاع، نه بقیهٔ کارشناس‌های همین درخواست. */
async function unassign(env, body) {
  const aid = int(body.assignment_id);
  const a = await env.DB.prepare("SELECT * FROM assignments WHERE id=?").bind(aid).first();
  if (!a) throw new HttpError("ارجاع پیدا نشد.", 404);
  if (a.dispatched_at) throw new HttpError("این ارجاع ارسال شده است؛ برای عوض کردن کارشناس از «تغییر» استفاده کنید.", 409);
  await env.DB.batch([
    env.DB.prepare("UPDATE items SET assignment_id=NULL WHERE assignment_id=?").bind(aid),
    env.DB.prepare("DELETE FROM alerts WHERE assignment_id=?").bind(aid),
    env.DB.prepare("DELETE FROM assignments WHERE id=? AND dispatched_at IS NULL").bind(aid),
    ev(env, "manager", "unassign", a.request_id, null, { assignment_id: aid, expert_id: a.expert_id }),
    assignmentLogStmt(env, { action: "unassign", request_id: a.request_id, assignment_id: aid, expert_id: a.expert_id }),
  ]);
  return { ok: true };
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
/* خودِ کارشناس برای پنلش — کد ورود و شناسهٔ گفت‌وگوها بیرون نمی‌رود */
const meOut = (ex) => ({ ...ex, code: undefined, team_connected: !!ex.team_chat, team_bot: ex.team_via === "team", team_chat: undefined, team_via: undefined });

/**
 * آستانه‌های مؤثر برای باکس‌های پایشِ یک کارشناس: اگر ارشدش برای تیم آستانه گذاشته، همان؛
 * وگرنه آستانه‌های مدیر. پنل‌ها رنگ باکس را با settings.thresholds می‌سازند، پس همان را عوض می‌کنیم.
 */
async function settingsFor(env, expertId, settings) {
  const s = settings || await getSettings(env);
  const thr = (await thresholdsByExpert(env, [expertId], s)).get(expertId);
  return thr ? { ...s, thresholds: thr } : s;
}

async function tray(env, ex, url) {
  /* full=1: کارتابل، وضعیت تلگرام و «من» در یک درخواست — پنل کارشناس قبلاً سه‌چهار درخواست
     موازی می‌فرستاد و هر کدام رفت‌وبرگشت شبکه و احراز هویتِ خودش را داشت */
  const full = url && url.searchParams.get("full") === "1";
  const [res, settings] = await Promise.all([env.DB.prepare(`SELECT a.*, r.date, r.party, r.party_type, r.center,
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
    ORDER BY a.dispatched_at DESC`).bind(ex.id).all(), getSettings(env)]);
  const out = { assignments: res.results || [], settings: await settingsFor(env, ex.id, settings) };
  if (!full) return out;
  const tg = await env.DB.prepare("SELECT telegram_chat FROM experts WHERE id=?").bind(ex.id).first();
  const team = ex.senior ? (await env.DB.prepare("SELECT id,name,label FROM experts WHERE senior_id=? AND active=1 ORDER BY name").bind(ex.id).all()).results || [] : [];
  return { ...out, me: { role: "expert", expert: meOut(ex), team },
    tg: { connected: !!(tg && tg.telegram_chat), botConfigured: !!env.TG_BOT_TOKEN, bot: env.TG_BOT_USERNAME || null,
      teamBotConfigured: !!env.TG_TEAM_BOT_TOKEN, teamBot: env.TG_TEAM_BOT_USERNAME || null } };
}

async function assignmentDetail(env, aid, who) {
  const a = await env.DB.prepare("SELECT a.*, e.name AS expert_name, e.label AS expert_label FROM assignments a JOIN experts e ON e.id=a.expert_id WHERE a.id=?").bind(aid).first();
  if (!a) throw new HttpError("ارجاع پیدا نشد.", 404);
  /* کارشناس ارشد ارجاع‌های تیمش را هم می‌بیند (فقط‌خواندنی؛ نوشتن‌ها همچنان با ownAssignment) */
  if (!(await canSee(env, who, a.expert_id))) throw new HttpError("این ارجاع متعلق به شما نیست.", 403);
  const request = await env.DB.prepare("SELECT * FROM requests WHERE id=?").bind(a.request_id).first();
  const items = (await env.DB.prepare("SELECT * FROM items WHERE assignment_id=? ORDER BY line_no").bind(aid).all()).results || [];
  const quotes = (await env.DB.prepare("SELECT * FROM quotes WHERE assignment_id=? ORDER BY id").bind(aid).all()).results || [];
  const proformas = (await env.DB.prepare("SELECT * FROM proformas WHERE assignment_id=?").bind(aid).all()).results || [];
  const decisions = (await env.DB.prepare("SELECT * FROM decisions WHERE assignment_id=? AND approved_at IS NULL AND rejected_at IS NULL").bind(aid).all()).results || [];
  return { assignment: a, request, items, quotes, proformas, pendingDecisions: decisions, settings: await settingsFor(env, a.expert_id) };
}

/* قلمِ موردِ سؤالِ تب سوابق، با همان نگهبان مالکیتی که بقیهٔ مسیرهای کارشناس دارند.
   مدیر هر قلمی را می‌بیند (پنل فقط‌خواندنی‌اش همین را لازم دارد). */
async function ownItem(env, who, itemId) {
  if (!itemId) throw new HttpError("item_id لازم است.");
  const it = await env.DB.prepare(`SELECT i.id, i.title, i.code, i.hist_code, i.norm_json, i.qty, i.unit, i.spec, a.expert_id, a.id AS aid, a.request_id
    FROM items i LEFT JOIN assignments a ON a.id=i.assignment_id WHERE i.id=?`).bind(itemId).first();
  if (!it) throw new HttpError("قلم پیدا نشد.", 404);
  if (who.role === "expert" && it.expert_id !== who.expert.id) throw new HttpError("این قلم متعلق به شما نیست.", 403);
  return it;
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
const QUOTE_FIELDS = ["supplier_name", "supplier_code", "spec", "unit", "qty", "price", "dtime", "valid_days", "ship", "invoice", "pay", "vat", "deal", "place", "place_other", "final", "low_conf", "item_id"];
async function ownAssignment(env, ex, aid) {
  const a = await env.DB.prepare("SELECT id FROM assignments WHERE id=? AND expert_id=?").bind(aid, ex.id).first();
  if (!a) throw new HttpError("ارجاع متعلق به شما نیست.", 403);
}
/**
 * ساختن خط استعلام. یک تأمین‌کننده معمولاً چند قلم را با هم قیمت می‌دهد، پس
 * `item_ids` چند قلم را در یک درخواست می‌گیرد؛ `item_id` تکی هم برای سازگاری می‌ماند.
 * قلمی که برای همین تأمین‌کننده از قبل خط دارد رد می‌شود، نه اینکه کل درخواست شکست بخورد.
 */
async function quoteCreate(env, ex, body) {
  const aid = int(body.assignment_id); await ownAssignment(env, ex, aid);
  const supplier = T(body.supplier_name);
  if (!supplier) throw new HttpError("نام تأمین‌کننده لازم است.");
  const wanted = [...new Set((Array.isArray(body.item_ids) ? body.item_ids : [body.item_id]).map((x) => int(x)).filter(Boolean))];
  if (!wanted.length) throw new HttpError("دست‌کم یک قلم را انتخاب کنید.");
  const its = new Map(((await env.DB.prepare(`SELECT id, unit, qty FROM items WHERE assignment_id=? AND id IN (${wanted.map(() => "?").join(",")})`)
    .bind(aid, ...wanted).all()).results || []).map((i) => [i.id, i]));
  const have = new Set(((await env.DB.prepare("SELECT item_id FROM quotes WHERE assignment_id=? AND supplier_name=?").bind(aid, supplier).all()).results || []).map((q) => q.item_id));
  const fresh = wanted.filter((id) => its.has(id) && !have.has(id));
  if (!fresh.length) throw new HttpError("این تأمین‌کننده برای همین قلم قبلاً اضافه شده است.", 409);
  const t = now();
  /* از کجا آمده: تب سوابق، جستجوی هوشمند (با شناسهٔ همان جستجو) یا دستی */
  const origin = ["history", "smart", "manual"].includes(body.origin) ? body.origin : "manual";
  const originRef = origin === "smart" ? int(body.search_id) : null;
  const stmts = fresh.map((item) => {
    const it = its.get(item);
    return env.DB.prepare(`INSERT INTO quotes (assignment_id,item_id,supplier_name,supplier_code,spec,unit,qty,price,invoice,source,origin,origin_ref,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'panel',?,?,?,?)`)
      .bind(aid, item, supplier, T(body.supplier_code) || null, T(body.spec) || null, T(body.unit) || it.unit || null,
        num(body.qty) ?? it.qty ?? null, num(body.price), INVOICE_DEFAULT, origin, originRef, t, t);
  });
  const res = await env.DB.batch(stmts);
  const ids = res.map((r) => r.meta.last_row_id);
  return { ok: true, id: ids[0], ids, skipped: wanted.length - fresh.length };
}
async function quoteUpdate(env, ex, id, body) {
  const q = await env.DB.prepare("SELECT q.* FROM quotes q JOIN assignments a ON a.id=q.assignment_id WHERE q.id=? AND a.expert_id=?").bind(id, ex.id).first();
  if (!q) throw new HttpError("استعلام پیدا نشد.", 404);
  /* قالبِ فیلدها (تصمیم مدیر): قیمت و مقدار عدد، زمان تحویل تاریخ یا عدد، اعتبار عدد — وگرنه خطا */
  const bad = validateQuote(body);
  if (bad.length) throw new HttpError(bad.map((x) => x.message).join(" "), 422, { invalid: bad.map((x) => x.field) });
  const sets = [], args = [];
  for (const f of QUOTE_FIELDS) if (f in body) { sets.push(`${f}=?`); args.push(["qty", "price"].includes(f) ? toNumber(body[f]) : ["final", "low_conf", "item_id"].includes(f) ? int(body[f], 0) : (f === "dtime" ? normalizeDtime(body[f]) : f === "valid_days" ? String(toNumber(body[f]) ?? "") || null : T(body[f]) || null)); }
  /* هر ویرایشِ فیلدِ محتوایی، «ثبت موقت» را برمی‌دارد؛ save صریح آن را می‌گذارد.
     «تأیید نهایی» ویرایش محتوا نیست — تیکش نباید ثبت موقت را باطل کند، وگرنه
     همان تیکی که باید دکمهٔ کمیسیون را روشن کند (saved=1 AND final=1)
     خاموشش می‌کند. مسیر تلگرام از اول همین‌طور بود. */
  /* نوع فاکتوری که کارشناس خودش انتخاب کرده، با خواندن پیش‌فاکتور بعدی عوض نمی‌شود */
  if ("invoice" in body) sets.push("invoice_src='manual'");
  /* لحظهٔ تیک «تأیید نهایی» ثبت می‌شود؛ برداشتنِ تیک پاکش می‌کند */
  if ("final" in body) { sets.push("final_at=?"); args.push(int(body.final, 0) ? (q.final ? q.final_at || now() : now()) : null); }
  const contentEdited = Object.keys(body).some((f) => QUOTE_FIELDS.includes(f) && f !== "final");
  if (body.save === true) {
    const merged = { ...q, ...body };
    const miss = missingRequired(merged);
    if (miss.length) throw new HttpError("این فیلدها خالی‌اند و ثبت موقت انجام نشد.", 422, { missing: miss });
    /* خطی که از خواندن پیش‌فاکتور پر شده هم باید قالب درست داشته باشد تا به جدول برسد */
    const badSaved = validateQuote(merged);
    if (badSaved.length) throw new HttpError(badSaved.map((x) => x.message).join(" "), 422, { invalid: badSaved.map((x) => x.field) });
    sets.push("saved=1");
  } else if (contentEdited) sets.push("saved=0");
  if (!sets.length) return { ok: true };
  sets.push("updated_at=?"); args.push(now(), id);
  await env.DB.prepare(`UPDATE quotes SET ${sets.join(",")} WHERE id=?`).bind(...args).run();
  return { ok: true };
}
/* حذف: از تب و بات کامل بیرون می‌رود، نسخه‌اش در quotes_deleted می‌ماند (records.js) */
async function quoteDelete(env, ex, id) {
  return { ok: true, deleted: await deleteQuotes(env, { ids: [id], expertId: ex.id, channel: "panel" }) };
}

/* جدول کمیسیون: نگهبان حداقل استعلام برای هر قلم + حداقل یک تأیید نهایی */
async function commission(env, ex, aid) {
  await ownAssignment(env, ex, aid);
  /* همان نگهبانی که بات هم دارد (bundle.js) */
  const g = await commissionGuard(env, aid, await getSettings(env));
  if (!g.finals) throw new HttpError("حداقل یک استعلام باید تیک «تأیید نهایی» بخورد.", 422, { missing: g.missing, need: g.need });
  if (g.missing.length) throw new HttpError(`مدیر حداقل ${g.need} استعلام برای هر قلم را الزامی کرده.`, 422, { missing: g.missing, need: g.need });
  /* شمارهٔ ترتیبی فرم (TSA-PS-FO-n) همین‌جا و فقط یک بار داده می‌شود؛ عکسِ جدول هم ثبت می‌شود */
  const no = await recordCommission(env, aid, { expertId: ex.id, channel: "panel" });
  await env.DB.batch([ev(env, `expert:${ex.id}`, "commission", null, null, { assignment_id: aid, commission_no: no })]);
  return { ok: true, commission_no: no };
}

/* تصمیم کارشناس و تأیید/ردِ مدیر: worker/decisions.js */

/* ------------------------------------------------------------------ */
/* مشترک: کانال‌ها، قالب‌ها، امتیازها                                     */
/* ------------------------------------------------------------------ */
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
  /* هر تغییرِ امتیاز کارشناس یا ضریب گروه/پروژه با مقدار قبلی در تاریخچه می‌ماند */
  const stmts = await scoresHistoryStmts(env, body || {}, "manager");
  for (const s of body.scores || []) stmts.push(env.DB.prepare("INSERT INTO expert_scores (expert_id,kind,key,score) VALUES (?,?,?,?) ON CONFLICT(expert_id,kind,key) DO UPDATE SET score=excluded.score").bind(int(s.expert_id), T(s.kind), T(s.key), Math.max(0, Math.min(5, int(s.score, 0)))));
  for (const w of body.weights || []) stmts.push(env.DB.prepare("INSERT INTO weights (kind,key,w) VALUES (?,?,?) ON CONFLICT(kind,key) DO UPDATE SET w=excluded.w").bind(T(w.kind), T(w.key), Number(w.w) || 1));
  for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
  return scoresGet(env);
}

/* زیرساخت اتصال‌های خارجی — هنوز وصل نشده؛ پاسخ ساخت‌یافته تا UI برچسب «در انتظار اتصال» بزند */
const NOT_CONNECTED = (what) => json({ available: false, message: `${what} هنوز به سامانه وصل نشده است؛ زیرساختش آماده است و در مرحلهٔ بعد فعال می‌شود.` }, 200);

/* ------------------------------------------------------------------ */
/* نامهٔ پیوست کمیسیون — همان مسیر بات، این بار از پنل                    */
/*                                                                      */
/* ضبط یا بارگذاری صوت ← ElevenLabs ← متنِ قابل ویرایش برای تأیید ←      */
/* انتخاب اقلامِ موضوع ← نگارش و فایل Word روی سربرگ.                    */
/*                                                                      */
/* منطقش همان منطق بات است (ADR-0008: هر دو ورودی یک اعتبارسنجی و یک     */
/* قاعده دارند): نگارش و رونویسی در worker/letter.js و ساخت فایل در      */
/* worker/docx.js است و این‌جا فقط همان ارکستراسیونی است که              */
/* bot.js:startLetter…makeLetter برای تلگرام دارد. وضعیت‌ها و جدول       */
/* `letters` هم یکی است، پس نامه‌ای که در پنل شروع شود در تلگرام هم       */
/* همان است و برعکس.                                                    */
/* ------------------------------------------------------------------ */
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
/* همان دو مرزی که بات می‌گذارد: کمتر از این نامه نمی‌شود، بیشتر از این برای مدل زیادی است */
const LETTER_MIN = 15, LETTER_MAX = 4000;
/* نامه‌ای که هنوز متنش را می‌شود عوض کرد. `failed` هم هست چون وقتی نگارش شکست
   می‌خورد (کلید مدل، سقف نرخ) متنِ کارشناس سالم است و نباید دوباره بگویدش. */
const LETTER_OPEN = ["need_voice", "transcribed", "failed"];
/* پسوند کلیدِ انبار از نوع صوت — مرورگر webm/mp4 می‌دهد، تلگرام ogg */
const AUDIO_EXT = { "audio/webm": ".webm", "audio/ogg": ".ogg", "audio/mp4": ".m4a", "audio/mpeg": ".mp3", "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/aac": ".aac", "audio/flac": ".flac" };
const audioExt = (type) => AUDIO_EXT[String(type || "").split(";")[0].trim().toLowerCase()] || ".webm";

const letterView = (L) => ({
  id: L.id, state: L.state, transcript: L.transcript,
  body: L.letter_json ? JSON.parse(L.letter_json) : null,
  meta: L.meta_json ? JSON.parse(L.meta_json) : null,
  hasFile: !!L.docx_key, hasVoice: !!L.voice_key, updated_at: L.updated_at,
});

/** نامهٔ خواسته‌شده (یا آخرین نامهٔ همین ارجاع) — شناسه همیشه با ارجاع سنجیده می‌شود (INV-11) */
async function letterOf(env, aid, id) {
  const L = id
    ? await env.DB.prepare("SELECT * FROM letters WHERE id=? AND assignment_id=?").bind(id, aid).first()
    : await env.DB.prepare("SELECT * FROM letters WHERE assignment_id=? ORDER BY id DESC LIMIT 1").bind(aid).first();
  if (!L) throw new HttpError("نامه‌ای برای این ارجاع باز نشده است.", 404);
  return L;
}
/* خطای letter.js/extract.js پیام فارسیِ آمادهٔ نمایش دارد؛ بدون این، پنل «خطای داخلی» می‌بیند */
const asHttp = (e) => (e instanceof ExtractError ? new HttpError(e.message, e.status || 502) : e);

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
      await handleUpdate(env, u, ctx);
      return json({ ok: true });
    }

    /* وبهوکِ بات تیمی (Supply Senior): فقط ثبتِ گفت‌وگوی تیم کارشناس ارشد و /stop. همان راز. شناسهٔ
       آپدیتِ دو بات از هم مستقل است، پس در tg_seen با علامت منفی جدا نگه داشته می‌شود. */
    if (path === "/tg/team-webhook" && m === "POST") {
      if (!env.TG_WEBHOOK_SECRET || request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TG_WEBHOOK_SECRET) {
        return new Response("forbidden", { status: 403 });
      }
      const u = await request.json().catch(() => null);
      if (!u || !u.update_id) return json({ ok: true });
      const fresh = await env.DB.prepare("INSERT INTO tg_seen (update_id,seen_at) VALUES (?,?) ON CONFLICT(update_id) DO NOTHING").bind(-Math.abs(u.update_id), now()).run();
      if (!fresh.meta.changes) return json({ ok: true, duplicate: true });
      await handleTeamUpdate(env, u);
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
      /* بات تیمی کارشناسان ارشد هم اگر توکنش ست شده */
      const team = env.TG_TEAM_BOT_TOKEN ? await ensureTeamWebhook(env, url.origin, true).catch((e) => ({ error: e.message })) : null;
      return json({ ok: true, me: await api.getMe(), webhook: await api.getWebhookInfo(), team });
    }
    if (path === "/tg/setup" && m === "GET") {
      requireManager(request, env);
      if (!env.TG_BOT_TOKEN) return NOT_CONNECTED("بات تلگرام");
      const api = telegram(env);
      return json({ me: await api.getMe(), webhook: await api.getWebhookInfo() });
    }
    /* گفت‌وگوهای نیمه‌کارهٔ بات — برای پشتیبانی: وقتی کارشناس می‌گوید «بات گیر کرده»،
       مدیر می‌تواند ببیند کجای کار مانده است. */
    if (path === "/tg/flows" && m === "GET") {
      requireManager(request, env);
      return json({
        flows: (await env.DB.prepare(
          `SELECT f.id, f.kind, f.step, f.assignment_id, f.created_at, f.expires_at, e.name AS expert
           FROM tg_flows f JOIN experts e ON e.id=f.expert_id
           WHERE f.done_at IS NULL AND f.expires_at>? ORDER BY f.id DESC LIMIT 50`,
        ).bind(now()).all()).results || [],
        uploads: (await env.DB.prepare(
          `SELECT u.id, u.state, u.filename, u.assignment_id, u.options_json, u.created_at, e.name AS expert
           FROM tg_uploads u JOIN experts e ON e.id=u.expert_id
           WHERE u.done_at IS NULL AND u.expires_at>? ORDER BY u.id DESC LIMIT 50`,
        ).bind(now()).all()).results || [],
      });
    }
    /* اجرای دستی چرخهٔ هشدار — برای تست؛ همان کاری که Cron می‌کند */
    if (path === "/tg/tick" && m === "POST") { requireManager(request, env); return json(await scheduled(env)); }

    /* --- ورود --- */
    /* تب «پشتیبانی» صفحهٔ اول: وضعیت کارت‌ها برای همه خواندنی است، نوشتن با رمز تب */
    if (path === "/site" && m === "GET") return json(await siteState(env));
    if (path === "/site/login" && m === "POST") { const b = await readJson(request); return json(await siteLogin(env, b.code)); }
    if (path === "/site" && m === "PUT") {
      const b = await readJson(request);
      return json(await putSite(env, b, request.headers.get("X-Site-Code") || b.code));
    }

    if (path === "/login" && m === "POST") {
      const b = await readJson(request);
      if (b.role === "manager") { requireManager({ headers: new Headers({ "X-Manager-Code": T(b.code) }) }, env); return json({ role: "manager" }); }
      const ex = await env.DB.prepare("SELECT id,name,label,code,senior FROM experts WHERE code=? AND active=1").bind(T(b.code)).first();
      if (!ex) throw new HttpError("کد کارشناسی معتبر نیست.", 401);
      return json({ role: "expert", expert: { ...ex, senior: ex.senior ? 1 : 0 } });
    }
    if (path === "/me") {
      const who = await requireAny(request, env);
      if (who.expert) {
        /* زیرمجموعه‌های کارشناس ارشد — برای «ارجاع به تیم» و تب تیم */
        const team = who.expert.senior ? (await env.DB.prepare("SELECT id,name,label FROM experts WHERE senior_id=? AND active=1 ORDER BY name").bind(who.expert.id).all()).results || [] : [];
        return json({ ...who, expert: meOut(who.expert), team });
      }
      return json(who);
    }

    /* --- تنظیمات و کارشناسان --- */
    if (path === "/settings" && m === "GET") { await requireAny(request, env); return json(await getSettings(env)); }
    if (path === "/settings" && m === "PUT") { requireManager(request, env); return json(await putSettings(env, await readJson(request))); }
    if (path === "/experts" && m === "GET") { await requireAny(request, env); return json({ experts: await listExperts(env) }); }
    /* افزودن کارشناس — کارکنان عوض می‌شوند و نباید برای هر نفر تازه استقرار لازم باشد */
    if (path === "/experts" && m === "POST") {
      requireManager(request, env);
      return json(await addExpert(env, await readJson(request)));
    }
    /* کارشناس کد ورود خودش را عوض می‌کند (صفحهٔ «حساب من»): کد فعلی لازم است */
    if (path === "/me/code" && m === "PUT") {
      const ex = await requireExpert(request, env);
      const b = await readJson(request);
      if (T(b.current) !== String(ex.code)) throw new HttpError("کد فعلی درست نیست.", 403);
      return json(await setExpertCode(env, ex.id, b.code));
    }

    /* خودآزمون سرویس‌های بیرونی — تلگرام، انبار فایل، تبدیل صوت، مدل، دیتابیس */
    if (path === "/selftest" && m === "GET") { requireManager(request, env); return json(await selfTest(env)); }

    /* حذف درخواست — با همهٔ چیزهایی که به آن آویزان‌اند.
       فایل‌های ذخیره‌شده هم پاک می‌شوند، وگرنه در انبار یتیم می‌مانند و
       فضای رایگان را بی‌دلیل پر می‌کنند. */
    if (path === "/requests/delete" && m === "POST") {
      requireManager(request, env);
      const b = await readJson(request);
      const all = b.all === true;
      const ids = Array.isArray(b.ids) ? b.ids.map((x) => T(x)).filter(Boolean) : [];
      if (all && T(b.confirm) !== "پاک کن") throw new HttpError("برای پاک کردن همهٔ درخواست‌ها باید عبارت «پاک کن» را تأیید کنید.", 422);
      if (!all && !ids.length) throw new HttpError("هیچ درخواستی انتخاب نشده است.");
      return json(await deleteRequests(env, all ? null : ids));
    }

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
      resetHolidayCache(); /* کش این isolate باطل می‌شود؛ بقیه حداکثر ۵ دقیقه بعد تازه می‌شوند */
      return json({ ok: true, count: rows.length });
    }
    let mm;
    if ((mm = /^\/experts\/(\d+)$/.exec(path)) && m === "PUT") {
      requireManager(request, env);
      return json(await updateExpert(env, int(mm[1]), await readJson(request)));
    }
    /* تنظیم اعلانات خودِ کارشناس ارشد (تیک مرحله‌ها) و لینک اتصال گروه تیمش */
    /* تنظیم اعلانات کارشناس ارشد — همان تب مدیر برای تیم خودش: تیک مرحله‌هایی که در تلگرام تیمی
       اعلام شود، و آستانه‌های پایش (درصد مهلت) که برای کارشناسان زیر نظرش جای آستانه‌های مدیر را
       می‌گیرد. alert_thresholds: null یعنی «همان آستانه‌های مدیر». */
    if (path === "/me/alerts" && m === "PUT") {
      const ex = await requireExpert(request, env);
      if (!ex.senior) throw new HttpError("فقط کارشناس ارشد تنظیم اعلانات دارد.", 403);
      const b = await readJson(request);
      const sets = [], args = [];
      if ("alert_stages" in b) { sets.push("alert_stages=?"); args.push(JSON.stringify(stageTicks(b.alert_stages))); }
      let thr = ex.alert_thresholds, thrChanged = false;
      if ("alert_thresholds" in b) {
        thr = b.alert_thresholds == null ? null : parseThresholds(b.alert_thresholds);
        if (b.alert_thresholds != null && !thr) throw new HttpError("درصدها باید صعودی و بین ۱ تا ۱۰۰ باشند.");
        thrChanged = JSON.stringify(thr) !== JSON.stringify(ex.alert_thresholds);
        sets.push("alert_thresholds=?"); args.push(thr ? JSON.stringify(thr) : null);
      }
      if (sets.length) await env.DB.prepare(`UPDATE experts SET ${sets.join(",")} WHERE id=?`).bind(...args, ex.id).run();
      /* هشدارهای ارجاع‌های زندهٔ تیم با آستانه‌های تازه از نو چیده می‌شوند */
      const r = thrChanged ? await rescheduleTeam(env, ex.id, thr) : { rescheduled: 0 };
      return json({ ok: true, alert_stages: "alert_stages" in b ? stageTicks(b.alert_stages) : ex.alert_stages, alert_thresholds: thr, ...r });
    }
    /* «تلگرام تیمی» کارشناس ارشد: لینک یک‌بارمصرفِ بات تیمی (Supply Senior). وبهوکِ آن بات، اگر
       هنوز روی همین دامنه ثبت نشده، همین‌جا ثبت می‌شود تا بعد از استقرار کار دستی لازم نباشد. */
    if (path === "/tg/team-link" && m === "POST") {
      const ex = await requireExpert(request, env);
      if (!ex.senior) throw new HttpError("فقط کارشناس ارشد تلگرام تیمی دارد.", 403);
      if (!env.TG_TEAM_BOT_TOKEN && !env.TG_BOT_TOKEN) return NOT_CONNECTED("بات تلگرام");
      if (env.TG_TEAM_BOT_TOKEN && env.TG_WEBHOOK_SECRET) await ensureTeamWebhook(env, url.origin).catch((e) => console.error("team webhook", e && e.message));
      return json(await makeTeamLink(env, ex.id));
    }
    if (path === "/team" && m === "GET") {
      const ex = await requireExpert(request, env);
      if (!ex.senior) throw new HttpError("فقط کارشناس ارشد تیم دارد.", 403);
      return json(await teamDesk(env, ex));
    }
    if (path === "/team/delegate" && m === "POST") {
      const ex = await requireExpert(request, env);
      return json(await delegate(env, ex, await readJson(request), ctx));
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
    if (path === "/workload" && m === "GET") { requireManager(request, env); return json(await workload(env)); }
    if (path === "/assign" && m === "POST") { requireManager(request, env); return json(await assign(env, await readJson(request))); }
    if (path === "/assign/days" && m === "POST") { requireManager(request, env); return json(await setDays(env, await readJson(request))); }
    if (path === "/dispatch" && m === "POST") { requireManager(request, env); const r = await dispatch(env, await readJson(request)); flush(env, ctx, r.notified); return json(r); }
    if (path === "/reassign" && m === "POST") { requireManager(request, env); const r = await reassign(env, await readJson(request)); flush(env, ctx, r.notified ? 1 : 0); return json(r); }
    if (path === "/unassign" && m === "POST") { requireManager(request, env); return json(await unassign(env, await readJson(request))); }
    if (path === "/items/state" && m === "POST") { requireManager(request, env); return json(await setState(env, await readJson(request), "manager")); }
    if (path === "/decisions" && m === "GET") { requireManager(request, env); return json({ decisions: (await env.DB.prepare("SELECT d.*, e.name AS expert_name, a.request_id FROM decisions d JOIN experts e ON e.id=d.expert_id JOIN assignments a ON a.id=d.assignment_id WHERE d.approved_at IS NULL AND d.rejected_at IS NULL ORDER BY d.requested_at").all()).results || [] }); }
    if ((mm = /^\/decisions\/(\d+)\/(approve|reject)$/.exec(path)) && m === "POST") {
      requireManager(request, env); const b = await readJson(request).catch(() => ({}));
      const r = mm[2] === "approve" ? await approveDecision(env, int(mm[1]), "panel") : await rejectDecision(env, int(mm[1]), b && b.note);
      flush(env, ctx, 1);
      return json(r);
    }
    if (path === "/events" && m === "GET") { requireManager(request, env); const since = int(url.searchParams.get("since"), 0); return json({ events: (await env.DB.prepare("SELECT * FROM events WHERE at>? ORDER BY at DESC LIMIT 300").bind(since).all()).results || [] }); }

    /* --- پنل کارشناس --- */
    if (path === "/tray" && m === "GET") { const ex = await requireExpert(request, env); return json(await tray(env, ex, url)); }
    if ((mm = /^\/assignments\/(\d+)$/.exec(path)) && m === "GET") { const who = await requireAny(request, env); return json(await assignmentDetail(env, int(mm[1]), who)); }
    if ((mm = /^\/assignments\/(\d+)\/viewed$/.exec(path)) && m === "POST") { const ex = await requireExpert(request, env); await ownAssignment(env, ex, int(mm[1])); await env.DB.prepare("UPDATE assignments SET viewed_at=COALESCE(viewed_at,?) WHERE id=?").bind(now(), int(mm[1])).run(); return json({ ok: true }); }
    if ((mm = /^\/assignments\/(\d+)\/commission$/.exec(path)) && m === "POST") { const ex = await requireExpert(request, env); return json(await commission(env, ex, int(mm[1]))); }
    if ((mm = /^\/assignments\/(\d+)\/decision$/.exec(path)) && m === "POST") {
      const ex = await requireExpert(request, env); const r = await expertDecision(env, ex, int(mm[1]), await readJson(request));
      flush(env, ctx, 1); return json(r);
    }
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
      await env.DB.prepare("INSERT INTO proformas (assignment_id,supplier_name,filename,uploaded_at) VALUES (?,?,?,?) ON CONFLICT(assignment_id,supplier_name) DO UPDATE SET filename=excluded.filename, uploaded_at=excluded.uploaded_at, item_ids=NULL")
        .bind(int(b.assignment_id), T(b.supplier_name), T(b.filename) || null, now()).run();
      return json({ ok: true, stored: false, message: "نام فایل ثبت شد؛ ذخیرهٔ خود فایل (R2) در مرحلهٔ بعد فعال می‌شود." });
    }

    /* استخراج خودکار اطلاعات پیش‌فاکتور (AI-06).
       فایل از داخل Worker رد نمی‌شود: یک لینک امضاشدهٔ کوتاه‌عمر ساخته می‌شود و
       خود مدل سند را می‌گیرد. هیچ چیزی در جدول استعلام‌ها نوشته نمی‌شود —
       نتیجه فقط ذخیره می‌شود تا کارشناس ببیند و تأیید کند (INV-07). */
    if ((mm = /^\/proformas\/(\d+)\/extract$/.exec(path)) && m === "POST") {
      const ex = await requireExpert(request, env);
      const p = await proformaOf(env, int(mm[1]), ex);
      const store = storage(env);
      if (!store || !p.storage_key) return NOT_CONNECTED("انبار فایل");
      if (!store.signedUrl) throw new HttpError("انبار فعلی لینک امضاشده نمی‌سازد؛ استخراج فقط با Supabase کار می‌کند.", 503);
      if (!env.ANTHROPIC_API_KEY) return NOT_CONNECTED("استخراج هوشمند");
      return json(await runExtraction(env, store, p));
    }
    /* ثبت نتیجهٔ استخراج در جدول استعلام‌ها — با تأیید صریح کارشناس */
    if ((mm = /^\/proformas\/(\d+)\/apply$/.exec(path)) && m === "POST") {
      const ex = await requireExpert(request, env);
      const p = await proformaOf(env, int(mm[1]), ex);
      return json(await applyExtraction(env, p, await readJson(request)));
    }

    /* نامهٔ پیوست کمیسیون — متن و فایل Word */
    if ((mm = /^\/assignments\/(\d+)\/letter$/.exec(path)) && m === "GET") {
      const ex = await requireExpert(request, env);
      const aid = int(mm[1]); await ownAssignment(env, ex, aid);
      const L = await env.DB.prepare("SELECT * FROM letters WHERE assignment_id=? ORDER BY id DESC LIMIT 1").bind(aid).first();
      if (!L) return json({ letter: null, stt: !!env.ELEVENLABS_API_KEY });
      return json({ letter: letterView(L), stt: !!env.ELEVENLABS_API_KEY });
    }
    /* شروع (یا از نو شروع کردنِ) نامه — همان کاری که /nameh در بات می‌کند:
       نامهٔ نیمه‌کارهٔ قبلی لغو می‌شود تا صوتِ بعدی سراغ دو نامه نرود. */
    if ((mm = /^\/assignments\/(\d+)\/letter$/.exec(path)) && m === "POST") {
      const ex = await requireExpert(request, env);
      const aid = int(mm[1]); await ownAssignment(env, ex, aid);
      const t = now();
      await env.DB.prepare("UPDATE letters SET state='canceled', updated_at=? WHERE assignment_id=? AND state IN ('need_voice','transcribed','failed')").bind(t, aid).run();
      const L = await env.DB.prepare(
        "INSERT INTO letters (assignment_id,expert_id,state,created_at,updated_at) VALUES (?,?,'need_voice',?,?) RETURNING *",
      ).bind(aid, ex.id, t, t).first();
      return json({ letter: letterView(L) });
    }
    /* بی‌خیالِ نامه */
    if ((mm = /^\/assignments\/(\d+)\/letter\/cancel$/.exec(path)) && m === "POST") {
      const ex = await requireExpert(request, env);
      const aid = int(mm[1]); await ownAssignment(env, ex, aid);
      await env.DB.prepare("UPDATE letters SET state='canceled', updated_at=? WHERE assignment_id=? AND state IN ('need_voice','transcribed','failed')").bind(now(), aid).run();
      return json({ ok: true });
    }
    /* صوتِ ضبط‌شده یا بارگذاری‌شده در پنل. بدنه خام و جریانی است (همان قاعدهٔ
       /proformas/upload) و بایت‌ها از حافظهٔ Worker رد نمی‌شوند؛ ElevenLabs خودش
       فایل را از لینک امضاشده برمی‌دارد، پس انبار باید Supabase باشد. */
    if ((mm = /^\/assignments\/(\d+)\/letter\/voice$/.exec(path)) && m === "POST") {
      const ex = await requireExpert(request, env);
      const aid = int(mm[1]); await ownAssignment(env, ex, aid);
      const L = await letterOf(env, aid, int(url.searchParams.get("letter_id")));
      if (!LETTER_OPEN.includes(L.state)) throw new HttpError("این نامه دیگر منتظر متن نیست.", 409);
      const store = storage(env);
      if (!store) return NOT_CONNECTED("انبار فایل");
      if (!store.signedUrl) throw new HttpError("انبار فعلی لینک امضاشده نمی‌سازد؛ تبدیل صوت به متن فقط با Supabase کار می‌کند.", 503);
      if (!env.ELEVENLABS_API_KEY) return NOT_CONNECTED("تبدیل صوت به متن");
      const size = int(request.headers.get("content-length"), 0);
      if (size > MAX_BYTES) throw new HttpError(`حجم صوت بیشتر از ${Math.round(MAX_BYTES / 1048576)} مگابایت است؛ کوتاه‌ترش کنید.`, 413);
      const type = request.headers.get("content-type") || "audio/webm";
      const key = storageKey(aid, `voice-${L.id}${audioExt(type)}`);
      await store.put(key, request.body, { contentType: type, size: size || undefined });
      const secs = num(url.searchParams.get("secs"));
      let text;
      try { text = (await transcribe(env, await store.signedUrl(key, 900))).text; }
      catch (e) {
        /* صوت سر جایش می‌ماند و نامه منتظر: کارشناس یا دوباره ضبط می‌کند یا تایپ */
        await env.DB.prepare("UPDATE letters SET voice_key=?, voice_secs=?, state='need_voice', updated_at=? WHERE id=?").bind(key, secs, now(), L.id).run();
        throw asHttp(e);
      }
      if (!text || text.length < LETTER_MIN) {
        await env.DB.prepare("UPDATE letters SET voice_key=?, voice_secs=?, state='need_voice', updated_at=? WHERE id=?").bind(key, secs, now(), L.id).run();
        throw new HttpError("چیزی نشنیدم یا خیلی کوتاه بود. یک بار دیگر و کمی واضح‌تر بگویید.", 422);
      }
      await env.DB.prepare("UPDATE letters SET voice_key=?, voice_secs=?, transcript=?, state='transcribed', updated_at=? WHERE id=?")
        .bind(key, secs, text, now(), L.id).run();
      return json({ letter: letterView(await letterOf(env, aid, L.id)) });
    }
    /* متنِ تأییدشده — چه تایپِ مستقیم باشد چه اصلاحِ رونویسی. رونویسی گاهی یک
       کلمه را اشتباه می‌شنود و از نو گفتنِ کل حرف برای یک کلمه منطقی نیست. */
    if ((mm = /^\/assignments\/(\d+)\/letter\/transcript$/.exec(path)) && m === "PUT") {
      const ex = await requireExpert(request, env);
      const aid = int(mm[1]); await ownAssignment(env, ex, aid);
      const b = await readJson(request);
      const L = await letterOf(env, aid, int(b.letter_id));
      if (!LETTER_OPEN.includes(L.state)) throw new HttpError("این نامه دیگر منتظر متن نیست.", 409);
      const text = T(b.transcript);
      if (text.length < LETTER_MIN) throw new HttpError("کمی بیشتر توضیح بدهید تا بشود از آن نامه ساخت.");
      if (text.length > LETTER_MAX) throw new HttpError("متن خیلی بلند است؛ خلاصه‌ترش کنید.");
      await env.DB.prepare("UPDATE letters SET transcript=?, state='transcribed', updated_at=? WHERE id=?").bind(text, now(), L.id).run();
      return json({ letter: letterView(await letterOf(env, aid, L.id)) });
    }
    /* نگارش نامه و ساخت فایل Word — دوقلوی HTTPیِ makeLetter در بات */
    if ((mm = /^\/assignments\/(\d+)\/letter\/write$/.exec(path)) && m === "POST") {
      const ex = await requireExpert(request, env);
      const aid = int(mm[1]); await ownAssignment(env, ex, aid);
      const b = await readJson(request);
      const L = await letterOf(env, aid, int(b.letter_id));
      if (!L.transcript || L.state !== "transcribed") throw new HttpError("این نامه قبلاً نوشته یا لغو شده است.", 409);
      if (!env.ANTHROPIC_API_KEY) return NOT_CONNECTED("نگارش نامه");
      const subjectTitles = (Array.isArray(b.subject_titles) ? b.subject_titles : []).map(T).filter(Boolean);
      const d = await bundleData(env, aid, await getSettings(env), env.COMPANY || "تونل سد آریانا");
      let out;
      try {
        /* همان قاعدهٔ جدول کمیسیون: فقط استعلام‌های تیک‌خورده و اقلامی که قیمت دارند */
        out = await writeLetter(env, {
          transcript: L.transcript, request: d.request, items: d.items, quotes: d.quotes, allItems: d.items,
          notes: d.assignment.notes, expert: d.expert, expertName: d.expertName, company: d.company, subjectTitles,
        });
      } catch (e) {
        await env.DB.prepare("UPDATE letters SET state='failed', updated_at=? WHERE id=?").bind(now(), L.id).run();
        throw asHttp(e);
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
      } catch (e) {
        /* نامه نوشته شده ولی فایلش ساخته نشد — متن را از دست ندهیم */
        fileError = e.message;
      }
      await env.DB.batch([
        env.DB.prepare("UPDATE letters SET letter_json=?, docx_key=?, meta_json=?, state='written', updated_at=? WHERE id=?")
          .bind(JSON.stringify(letter), docxKey, JSON.stringify(out.meta), now(), L.id),
        env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)")
          .bind(now(), `expert:${ex.id}`, "letter", d.request.id, JSON.stringify({ assignment_id: aid, letter_id: L.id, channel: "panel" })),
      ]);
      return json({ letter: letterView(await letterOf(env, aid, L.id)), fileError });
    }
    if ((mm = /^\/assignments\/(\d+)\/letter\/file$/.exec(path)) && m === "GET") {
      const who = await requireAny(request, env);
      const aid = int(mm[1]);
      if (who.expert) await ownAssignment(env, who.expert, aid);
      const L = await env.DB.prepare("SELECT * FROM letters WHERE assignment_id=? AND docx_key IS NOT NULL ORDER BY id DESC LIMIT 1").bind(aid).first();
      const store = storage(env);
      if (!L || !store) throw new HttpError("نامه‌ای برای این ارجاع ساخته نشده است.", 404);
      const f = await store.get(L.docx_key);
      if (!f) throw new HttpError("فایل نامه در انبار نیست.", 404);
      return new Response(f.body, { headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent("نامه.docx")}`,
        "cache-control": "private, no-store",
      } });
    }

    /* بستهٔ برگه‌ها — همان فایل‌هایی که بات می‌فرستد، برای دانلود از پنل.
       kind: request | commission */
    if ((mm = /^\/assignments\/(\d+)\/sheet\/(request|commission)$/.exec(path)) && m === "GET") {
      const who = await requireAny(request, env);
      const aid = int(mm[1]); const kind = mm[2];
      if (who.expert) await ownAssignment(env, who.expert, aid);
      const d = await bundleData(env, aid, await getSettings(env), env.COMPANY || "تونل سد آریانا");
      const cd = { ...d, notes: d.assignment.notes };
      /* format=html: همان برگه برای پیش‌نمایش و چاپ پنل، از همان مدلی که فایل را می‌سازد */
      if (url.searchParams.get("format") === "html") {
        return json(kind === "request" ? { html: requestHtml(d), css: REQUEST_CSS } : { html: commissionHtml(cd), css: SHEET_CSS });
      }
      /* برگهٔ درخواست خرید فایل Word است (قالب چاپ راهکاران)، جدول کمیسیون xlsx واقعی (فرم TSA-PS-FO-02) */
      const isReq = kind === "request";
      const body = isReq ? await renderRequestDoc(d) : await commissionXlsx(cd);
      const name = `${isReq ? "درخواست-خرید" : "کمیسیون"}-${d.request.id}.${isReq ? "docx" : "xlsx"}`;
      return new Response(body, { headers: {
        "content-type": isReq ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : XLSX_MIME,
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
        "cache-control": "private, no-store",
      } });
    }
    /* وضعیت آمادگی بسته — پنل با آن می‌گوید چه چیزی هنوز مانده */
    if ((mm = /^\/assignments\/(\d+)\/bundle$/.exec(path)) && m === "GET") {
      const ex = await requireExpert(request, env);
      const aid = int(mm[1]); await ownAssignment(env, ex, aid);
      const d = await bundleData(env, aid, await getSettings(env), env.COMPANY || "تونل سد آریانا");
      return json(readiness(d));
    }

    /* توضیحات کارشناس — پای برگهٔ کمیسیون، خانهٔ «توضیحات تدارکات و پشتیبانی» (CM-03).
       از پنل و از بات هر دو نوشته می‌شود و یک جا ذخیره است. */
    if ((mm = /^\/assignments\/(\d+)\/notes$/.exec(path)) && m === "PUT") {
      const ex = await requireExpert(request, env);
      const aid = int(mm[1]);
      await ownAssignment(env, ex, aid);
      const b = await readJson(request);
      const notes = T(b.notes);
      if (notes.length > 1500) throw new HttpError("توضیحات نباید از ۱۵۰۰ نویسه بیشتر باشد.");
      await env.DB.prepare("UPDATE assignments SET notes=? WHERE id=?").bind(notes || null, aid).run();
      return json({ ok: true, notes });
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
           mime=excluded.mime, size_bytes=excluded.size_bytes, source='panel', uploaded_at=excluded.uploaded_at, item_ids=NULL`,
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
    /* پیام‌رسان‌های هر شماره — مشترک بین همهٔ کارشناسان؛ هر کلیک با تاریخچه (records.js) */
    if (path === "/phones/channels" && m === "GET") {
      await requireAny(request, env);
      return json({ channels: await phoneChannels(env, T(url.searchParams.get("phones")).split(",").map(T).filter(Boolean)) });
    }
    if (path === "/phones/channels" && m === "PUT") {
      const who = await requireAny(request, env); const b = await readJson(request);
      try { return json({ ok: true, phone: T(b.phone), channels: await setPhoneChannel(env, who.expert ? who.expert.id : null, T(b.phone), T(b.platform), T(b.state)) }); }
      catch (e) { throw new HttpError(e.message, e.status || 400); }
    }
    if (path === "/templates" && m === "GET") { const who = await requireAny(request, env); return json(await templatesList(env, who)); }
    if (path === "/templates" && m === "POST") { const who = await requireAny(request, env); const b = await readJson(request); const r = await env.DB.prepare("INSERT INTO templates (expert_id,title,body,created_at) VALUES (?,?,?,?)").bind(b.shared && who.role === "manager" ? null : (who.expert ? who.expert.id : null), T(b.title) || "بدون عنوان", T(b.body), now()).run(); return json({ ok: true, id: r.meta.last_row_id }); }
    if ((mm = /^\/templates\/(\d+)$/.exec(path)) && m === "PUT") { const who = await requireAny(request, env); const b = await readJson(request); await env.DB.prepare("UPDATE templates SET title=?, body=? WHERE id=? AND (expert_id IS NULL OR expert_id=?)").bind(T(b.title) || "بدون عنوان", T(b.body), int(mm[1]), who.expert ? who.expert.id : -1).run(); return json({ ok: true }); }
    if ((mm = /^\/templates\/(\d+)$/.exec(path)) && m === "DELETE") { const who = await requireAny(request, env); await env.DB.prepare("DELETE FROM templates WHERE id=? AND (expert_id=? OR (expert_id IS NULL AND ?=1))").bind(int(mm[1]), who.expert ? who.expert.id : -1, who.role === "manager" ? 1 : 0).run(); return json({ ok: true }); }

    /* --- زیرساخت اتصال‌های خارجی (مرحلهٔ بعد) --- */
    if (path === "/notify/telegram") { await requireAny(request, env); return NOT_CONNECTED("اعلان تلگرام"); }
    if (path === "/notify/email") { await requireAny(request, env); return NOT_CONNECTED("ارسال ایمیل"); }
    /* جستجوی هوشمند تأمین‌کننده — کشف با Claude + جستجوی وب، ثبت‌شده در D1.
       GET نتیجهٔ ذخیره‌شدهٔ قبلی را می‌دهد تا رفرش چیزی را نپراند. */
    if (path === "/search/smart" && m === "GET") {
      const who = await requireAny(request, env);
      const it = await ownItem(env, who, int(url.searchParams.get("item_id")));
      /* همهٔ جستجوهای همین قلم (در هر درخواست و دست هر کارشناس)، تازه‌ترین اول، با وضعیتِ
         پیام‌رسان‌های شماره‌هایشان — پیش از آنکه جستجوی تازه‌ای خرج شود */
      const searches = await itemSearches(env, it);
      const keys = searches.flatMap((s) => ((s.result && s.result.suppliers) || []).flatMap((x) => x.phone_keys || []));
      return json({ markets: MARKETS.map(({ key, fa }) => ({ key, fa })), maxMarkets: MAX_MARKETS, searches, channels: await phoneChannels(env, keys) });
    }
    if (path === "/search/smart" && m === "POST") {
      const who = await requireAny(request, env);
      const b = await readJson(request);
      const it = await ownItem(env, who, int(b.item_id));
      if (!env.ANTHROPIC_API_KEY) return NOT_CONNECTED("جستجوی هوشمند تأمین‌کننده");
      /* اجرا چند دقیقه طول می‌کشد: پاسخ جریانی است و تا آماده شدن نتیجه هر ۱۵ ثانیه
         یک فاصله می‌رود تا اتصال بیکار نماند. خطا بعد از شروع جریان وضعیت HTTP را
         عوض نمی‌کند، پس در خود JSON می‌آید و پنل همان error را نشان می‌دهد. */
      return streamJson(async () => {
        const out = await smartSearch(env, it, who.expert || null, b, "panel");
        const result = withPhoneKeys(out.result);
        const keys = (result.suppliers || []).flatMap((x) => x.phone_keys || []);
        const ex = who.expert;
        return { ...out, result, request_id: it.request_id, expert: ex ? ex.label || ex.name : "", same_item: true, channels: await phoneChannels(env, keys) };
      });
    }
    /* سوابق خرید (IMP-13): بارگذاری سه‌مرحله‌ای از تب مدیر، خواندن از تب کارشناس.
       begin جدول را از نو می‌سازد، chunkها ردیف‌ها را می‌ریزند و finish نمایه‌ها
       و آمار مرجع (از جمله فاصلهٔ قدیمی‌ترین خرید) را می‌سازد. */
    /* گزارش‌های مدیر (reports.js): «وضعیت درخواست ها» و «گزارش سه ماهه» — JSON برای نمایش در پنل،
       .xlsx با همان ساختار فایل‌های نمونهٔ واحد. سه‌ماهه POST است چون انتخاب سال/فصل/ماه/برگه‌ها در بدنه است. */
    if (path.startsWith("/reports/")) {
      requireManager(request, env);
      const settings = await getSettings(env);
      const xlsx = (bytes, name) => new Response(bytes, { headers: { "content-type": XLSX_MIME, "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`, "cache-control": "private, no-store" } });
      if (path === "/reports/meta" && m === "GET") return json(await reportMeta(env, settings));
      if (path === "/reports/status" && m === "GET") return json(await statusData(env, settings));
      if (path === "/reports/status.xlsx" && m === "GET") return xlsx(await bookFile(statusBook(await statusData(env, settings))), `وضعیت درخواست ها ${jStr(now()).replace(/\//g, "-")}.xlsx`);
      if ((path === "/reports/season" || path === "/reports/season.xlsx") && m === "POST") {
        const b = await readJson(request);
        const D = await seasonData(env, settings, b);
        const book = seasonBook(D, Array.isArray(b.sheets) ? b.sheets : null);
        if (path.endsWith(".xlsx")) return xlsx(await bookFile(book), `گزارش ${D.period.label}.xlsx`);
        return json({ label: D.period.label, priorLabel: D.period.priorLabel, workDays: D.workDays, hasExpertAmounts: D.hasExpertAmounts, unmatched: D.unmatched, sheets: bookPreview(book), css: BOOK_CSS });
      }
      throw new HttpError("گزارش ناشناخته.", 404);
    }
    if (path === "/history/status" && m === "GET") { await requireAny(request, env); return json(await historyStatus(env)); }
    /* بارگذاری چهار فایل مرجع (اقلام، شاخص تعدیل، نرخ تبدیل، سوابق) — worker/catalog.js */
    if (path === "/catalog/begin" && m === "POST") { requireManager(request, env); return json(await catalogBegin(env, await readJson(request))); }
    if (path === "/catalog/chunk" && m === "POST") { requireManager(request, env); return json(await catalogChunk(env, await readJson(request))); }
    if (path === "/catalog/finish" && m === "POST") { requireManager(request, env); return json(await catalogFinish(env, await readJson(request))); }
    /* نرمال‌سازی اقلام: پیشنهاد (از فهرست یا مدل)، تأیید کارشناس، و برداشتن تأیید — worker/normalize.js */
    if ((mm = /^\/items\/(\d+)\/normalize$/.exec(path)) && m === "POST") {
      const who = await requireAny(request, env);
      const it = await ownItem(env, who, int(mm[1]));
      const b = await readJson(request);
      return json(await normalizeItem(env, it, { force: !!b.force }));
    }
    if ((mm = /^\/items\/(\d+)\/norm$/.exec(path)) && (m === "PUT" || m === "DELETE")) {
      const who = await requireAny(request, env);
      const it = await ownItem(env, who, int(mm[1]));
      return json(m === "PUT" ? await confirmNorm(env, it, await readJson(request)) : await clearNorm(env, it));
    }
    /* «عین قلم» (mode=exact) یا «نوع قلم» (mode=head)؛ norm=1 یعنی بر ساختار تأییدشدهٔ نرمال‌سازی،
       norm=0 یعنی فقط با کد راهکاران در فهرست اقلام */
    const histOpts = () => ({
      k: url.searchParams.get("k"), mode: url.searchParams.get("mode") === "head" ? "head" : "exact",
      norm: url.searchParams.get("norm") === "1" ? true : url.searchParams.get("norm") === "0" ? false : undefined,
    });
    if (path === "/suppliers/history" && m === "GET") {
      const who = await requireAny(request, env);
      const it = await ownItem(env, who, int(url.searchParams.get("item_id")));
      return json(await itemHistory(env, it, histOpts()));
    }
    if (path === "/suppliers/history/buys" && m === "GET") {
      const who = await requireAny(request, env);
      const it = await ownItem(env, who, int(url.searchParams.get("item_id")));
      return json(await supplierBuys(env, it, url.searchParams.get("supplier"), histOpts()));
    }
    /* نقاط نمودار روند خرید قلم (تاریخ × مقدار به واحد مرجع، به تفکیک تأمین‌کننده) */
    if (path === "/suppliers/history/series" && m === "GET") {
      const who = await requireAny(request, env);
      const it = await ownItem(env, who, int(url.searchParams.get("item_id")));
      return json(await itemSeries(env, it, histOpts()));
    }
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

/* پاسخ JSON جریانی برای کار طولانی. JSON.parse فاصله‌های ابتدایی را نادیده می‌گیرد،
   پس فاصله‌های نگهداریِ اتصال به خواندنِ پاسخ آسیبی نمی‌زنند. */
function streamJson(work) {
  const { readable, writable } = new TransformStream();
  const w = writable.getWriter(), enc = new TextEncoder();
  const beat = setInterval(() => { w.write(enc.encode(" ")).catch(() => {}); }, 15000);
  (async () => {
    let out;
    try { out = JSON.stringify(await work()); }
    catch (e) { out = JSON.stringify({ error: e && e.message ? e.message : String(e), status: (e && e.status) || 500 }); }
    clearInterval(beat);
    try { await w.write(enc.encode(out)); await w.close(); } catch (_) { /* کاربر پنجره را بسته است */ }
  })();
  return new Response(readable, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

export { route, ensureSchema };
