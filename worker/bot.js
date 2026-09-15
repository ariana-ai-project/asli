/**
 * بات تلگرام سامانهٔ تأمین و پشتیبانی — منطق کاری
 *
 * (ADR-0001 بات سازمانی · ADR-0032 وبهوک روی Worker · TG-03 ثبت‌نام · TG-05 صف · TG-06 پیام‌ها)
 *
 * سه ورودی دارد:
 *   handleUpdate  — یک آپدیت از وبهوک تلگرام
 *   runAlerts     — Cron: هشدارهای سررسیده را به صف می‌گذارد
 *   drainOutbox   — Cron یا waitUntil: صف را می‌فرستد
 *
 * مسیر کار کارشناس (همان ترتیبی که مدیر خواسته):
 *   ارجاع ← «مشاهده» ← بررسی سوابق · جستجوی هوشمند · کارتابل
 *   سوابق: اقلام (چندانتخابی یا «همه») ← یک پیامِ تفکیک‌شده به قلم ← انتخاب قلم
 *          ← تأمین‌کنندگان (چندانتخابی) ← «افزودن به استعلامات» یا «فهرست»
 *          ← تب استعلامات · جستجوی هوشمند · کارتابل · درخواست · بازگشت
 *   تب استعلامات: خط‌ها (چندانتخابی) ← «دریافت پیش‌فاکتور» · خط استعلام دستی · جدول کمیسیون
 *   جدول کمیسیون (با «درج توضیحات») ← تحویل (درخواست خرید، نامه، جدول، پیوست‌ها) و خاتمه.
 *   درخواست فقط با «خاتمه» از کارتابل و منوها بیرون می‌رود، نه با ساختن جدول.
 *
 * فایلِ رسیده سه معنا دارد و فقط «حالتی» که کارشناس خودش باز کرده تعیینش می‌کند:
 * پیوستِ تحویل، پیش‌فاکتورِ منتظر، یا پیش‌فاکتورِ آزاد (درخواست ← اقلام ← استفاده).
 *
 * قاعدهٔ مالکیت (INV-11): هر چیزی که بات نشان می‌دهد یا تغییر می‌دهد، فقط از
 * ارجاع‌های همان کارشناسی است که chat_id‌اش گره خورده. هیچ مسیری این را دور نمی‌زند.
 */
import { telegram, esc, TgError } from "./telegram.js";
import { fmtFa, workHours, nextWorkMoment, inWorkHours } from "./time.js";
import { storage, storageKey, MAX_BYTES } from "./storage.js";
import { REFUSAL_FA } from "./extract.js";
import { runExtraction, extractFor, saveExtraction, applyExtraction, lineUnitPrice, idList } from "./proforma.js";
import { transcribe, writeLetter, letterSubject } from "./letter.js";
import { renderLetter } from "./docx.js";
import { bundleData, readiness, commissionGuard, recordCommission } from "./bundle.js";
import { deleteQuotes, phoneChannels, withPhoneKeys, itemSearches, titleKey, PLATFORMS } from "./records.js";
import { commissionXlsx } from "./sheets.js";
import { renderRequestDoc } from "./reqdoc.js";
import { REQUIRED, PER_SUPPLIER, PER_LINE, LABELS, ENUMS, INVOICE_DEFAULT, missingRequired, validateQuote, validDtime, normalizeDtime } from "./quote-rules.js";
import { getSettings } from "./settings.js";
import { STAGE_NAMES, queueStmt } from "./queue.js";
import { stageWatch, markManagerSeen, recipients, RECIPIENT_COLS, RECIPIENT_JOIN } from "./manager.js";
import { expertDecision, approveDecision, rejectDecision } from "./decisions.js";
import { itemHistory, activeImport } from "./history.js";
import { MARKETS, MAX_MARKETS, smartSearch, searchById } from "./discovery.js";
import { TEMPLATE_TOKENS, ensureTemplates, listTemplates, ownTemplate, fillTemplate } from "./templates.js";

const now = () => Date.now();
const T = (v) => String(v == null ? "" : v).trim();

export { STAGE_NAMES, queueStmt } from "./queue.js";

/* عددهای فارسی، چون بقیهٔ سامانه هم فارسی نشان می‌دهد. ممیز هم فارسی می‌شود
   وگرنه «۱۱.۹» یک نقطهٔ لاتین وسط رقم‌های فارسی دارد و بد می‌نشیند. */
const FA = "۰۱۲۳۴۵۶۷۸۹";
const M = (n) => String(n == null ? "" : n).replace(/\d/g, (d) => FA[+d]).replace(/\./g, "٫");

/* ------------------------------------------------------------------ */
/* صف پیام (TG-05، INV-10)                                             */
/* ------------------------------------------------------------------ */

/**
 * صف را می‌فرستد. هر ارسال یک subrequest است، پس سقف دارد.
 * شکست موقت → تلاش دوباره با عقب‌نشینی نمایی؛ شکست دائمی (بلاک شدن بات) → dead.
 */
export async function drainOutbox(env, limit = 20) {
  /* بیرون از ساعت اداری هیچ اعلانی نمی‌رود.
     صف عقب انداخته می‌شود، نه دور ریخته: پیام سرِ ساعت ۷:۳۰ اولین روز کاری
     می‌رسد. (پاسخِ خودِ گفت‌وگو از این مسیر رد نمی‌شود؛ اگر کارشناس شب چیزی
     برای بات بفرستد، همان لحظه جواب می‌گیرد.) */
  const t = now();
  /* TG_IGNORE_HOURS فقط در توسعهٔ محلی ست می‌شود تا تست‌ها به ساعتِ دیواری وابسته نباشند */
  if (!env.TG_IGNORE_HOURS && !inWorkHours(t)) {
    const at = nextWorkMoment(t);
    const r = await env.DB.prepare("UPDATE outbox SET next_at=? WHERE status='pending' AND next_at<?").bind(at, at).run();
    return { sent: 0, failed: 0, deferred: (r.meta && r.meta.changes) || 0, until: at };
  }

  const rows = (await env.DB.prepare(
    `SELECT * FROM outbox WHERE status='pending' AND next_at<=? ORDER BY next_at LIMIT ?`,
  ).bind(t, limit).all()).results || [];
  if (!rows.length) return { sent: 0, failed: 0 };

  const api = telegram(env);
  const done = [];
  let sent = 0, failed = 0;
  for (const row of rows) {
    const p = JSON.parse(row.payload_json);
    try {
      await api.sendMessage(row.target, p.text, p.keyboard);
      sent++;
      done.push(env.DB.prepare("UPDATE outbox SET status='sent', sent_at=?, attempts=attempts+1 WHERE id=?").bind(now(), row.id));
    } catch (e) {
      failed++;
      const attempts = row.attempts + 1;
      const permanent = e instanceof TgError && e.permanent;
      /* FloodWait تلگرام محترم شمرده می‌شود (TG-05) */
      const wait = e instanceof TgError && e.retryAfter ? e.retryAfter * 1000 : Math.min(30 * 60000, 60000 * 2 ** (attempts - 1));
      done.push(permanent || attempts >= 6
        ? env.DB.prepare("UPDATE outbox SET status='dead', attempts=?, last_error=? WHERE id=?").bind(attempts, String(e.message).slice(0, 300), row.id)
        : env.DB.prepare("UPDATE outbox SET attempts=?, next_at=?, last_error=? WHERE id=?").bind(attempts, nextWorkMoment(now() + wait), String(e.message).slice(0, 300), row.id));
      if (e instanceof TgError && e.retryAfter) break; /* بقیه هم رد می‌شوند؛ اجرای بعدی ادامه می‌دهد */
    }
  }
  if (done.length) await env.DB.batch(done);
  return { sent, failed };
}

/* ------------------------------------------------------------------ */
/* متن پیام‌ها (TG-06)                                                  */
/* ------------------------------------------------------------------ */

const SIGN = "\n\n<i>ارجاع از سوی مدیر واحد پشتیبانی</i>";

/**
 * پیام «ارجاع جدید». اقلام هم ردیف‌به‌ردیف می‌آیند — با مقدار و واحد — تا کارشناس
 * بی‌آنکه پنل را باز کند بداند این درخواست چقدر کار است و اولویتش را بسنجد.
 * سقف ۲۰ قلم: پیام تلگرام ۴۰۹۶ نویسه جا دارد و درخواست‌های بزرگ‌تر در پنل خوانده می‌شوند.
 */
const DISPATCH_MAX_ITEMS = 20;
export function dispatchText(a) {
  const its = a.items || [];
  const list = its.slice(0, DISPATCH_MAX_ITEMS).map((i, k) =>
    `${M(k + 1)}. ${esc(short(i.title, 48))}${i.qty != null ? ` — <b>${M(i.qty)}</b> ${esc(i.unit || "")}` : ""}`).join("\n");
  return `🔔 <b>ارجاع جدید</b>\n\n`
    + `درخواست <b>${esc(a.request_id)}</b>\n`
    + `${esc(a.party || "")}\n\n`
    + `<b>${M(a.item_count)} قلم</b> · مهلت ${M(a.days)} روز کاری\n`
    + `تا <b>${esc(fmtFa(a.deadline_at))}</b>`
    + (list ? `\n\n<b>اقلام:</b>\n${list}` : "")
    + (its.length > DISPATCH_MAX_ITEMS ? `\n<i>و ${M(its.length - DISPATCH_MAX_ITEMS)} قلم دیگر — در پنل</i>` : "")
    + SIGN;
}

export function stageAlertText(row, stage) {
  const left = Math.max(0, workHours(now(), row.deadline_at));
  return `⏳ <b>یادآوری — ${esc(STAGE_NAMES[stage])}</b>\n\n`
    + `درخواست <b>${esc(row.request_id)}</b>\n`
    + `${esc(row.party || "")}\n\n`
    + `این مرحله هنوز انجام نشده است.\n`
    + `مهلت: ${esc(fmtFa(row.deadline_at))}\n`
    + `باقی‌مانده: <b>${M(left.toFixed(1))}</b> ساعت کاری`;
}

export function overdueText(row) {
  return `🔴 <b>مهلت تمام شد</b>\n\n`
    + `درخواست <b>${esc(row.request_id)}</b>\n`
    + `${esc(row.party || "")}\n\n`
    + `مهلت ${esc(fmtFa(row.deadline_at))} به پایان رسید و کار هنوز بسته نشده است.`;
}

export function managerOverdueText(row) {
  return `🔴 <b>عبور از مهلت</b>\n\n`
    + `درخواست <b>${esc(row.request_id)}</b> · کارشناس ${esc(row.label || row.name)}\n`
    + `${esc(row.party || "")}\n`
    + `مهلت: ${esc(fmtFa(row.deadline_at))}`;
}

/* ------------------------------------------------------------------ */
/* دکمه‌های راهبری — یک جا، تا هر منو همان برچسب‌ها را داشته باشد       */
/* ------------------------------------------------------------------ */

/** پیام ارجاع فقط یک دکمه دارد؛ بقیهٔ مسیر بعد از «مشاهده» باز می‌شود */
export const seenKb = (aid) => [[{ text: "👁 مشاهده", callback_data: `seen:a:${aid}` }]];

/** بعد از «مشاهده»: دو کار اول، و کارتابل */
const firstStepsKb = (aid) => [
  [{ text: "📚 بررسی سوابق", callback_data: `hs:a:${aid}` }],
  [{ text: "🔎 جستجوی هوشمند", callback_data: `sm:a:${aid}` }],
  [{ text: "📋 کارتابل", callback_data: "kt:n" }],
];

const KARTABL_BTN = { text: "📋 کارتابل", callback_data: "kt:n" };
const reqBtn = (aid) => ({ text: "📄 درخواست", callback_data: `rq:${aid}:m` });
const navRow = (aid) => [KARTABL_BTN, reqBtn(aid)];
/** زیر یادآوری‌ها: مستقیم به مسیر همان درخواست */
const reqKb = (aid) => [[{ text: "📄 باز کردن درخواست", callback_data: `rq:${aid}:m` }]];

/**
 * پنج راهِ بعد از انتخاب تأمین‌کننده (یا «فهرست»).
 * `back` کارتی است که از آن آمده‌ایم: h<flow> سوابق · s<flow> جستجو · p<flow> انتخاب قلم.
 */
const hubKb = (aid, back) => [
  [{ text: "🧾 تب استعلامات", callback_data: `qt:${aid}` }],
  [{ text: "🔎 جستجوی هوشمند", callback_data: `sm:a:${aid}` }],
  navRow(aid),
  ...(back ? [[{ text: "↩️ بازگشت", callback_data: `hb:${back}` }]] : []),
];
const hub = (api, chat, aid, back, mid, head) => show(api, chat, mid, `${head ? head + "\n\n" : ""}قدم بعد؟`, hubKb(aid, back));

/** دو گزینهٔ زیر نتیجهٔ جستجوی هوشمند */
/* `itemId` قلمی است که کارشناس الان رویش کار می‌کند — نتیجهٔ جستجوی قبلیِ درخواست دیگر هم به همین قلم می‌رود */
const smartChoiceKb = (sid, itemId) => [
  [{ text: "➕ انتخاب جهت استعلام", callback_data: `sq:${sid}:open:${itemId || 0}` }],
  [{ text: "✉️ انتخاب جهت ارسال پیام", callback_data: `sg:${sid}:open:${itemId || 0}` }],
];

/** اگر mid باشد همان پیام ویرایش می‌شود، وگرنه (یا اگر ویرایش نشد) پیام تازه */
async function show(api, chat, mid, text, kb) {
  if (mid) {
    const r = await api.editMessageText(chat, mid, text, kb || []).catch(() => null);
    if (r) return r;
  }
  return api.sendMessage(chat, text, kb).catch(() => null);
}

/* ------------------------------------------------------------------ */
/* هشدارهای مهلت (SLA-03، SLA-05)                                       */
/* ------------------------------------------------------------------ */

/**
 * ردیف‌های سررسیدهٔ `alerts` را برمی‌دارد، مرحله را دوباره می‌سنجد و اگر هنوز
 * انجام نشده، پیام را به صف می‌گذارد.
 *
 * چرا دوباره می‌سنجد: زمان‌بندی در لحظهٔ ارسال ساخته شده؛ ممکن است کارشناس
 * مرحله را زودتر تمام کرده باشد. هشدار برای کاری که انجام شده، اعتماد را می‌برد.
 */
export async function runAlerts(env, limit = 20) {
  const rows = (await env.DB.prepare(
    `SELECT al.id AS alert_id, al.kind, al.stage, al.fire_at,
            a.id AS aid, a.request_id, a.days, a.deadline_at, a.viewed_at, a.commission_at,
            e.id AS expert_id, e.name, e.label, e.telegram_chat, ${RECIPIENT_COLS},
            r.party,
            (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id AND i.state='open') AS open_count,
            (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id AND i.hist_done_at IS NOT NULL) AS hist_count,
            (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id AND i.smart_done_at IS NOT NULL) AS smart_count,
            (SELECT COUNT(*) FROM quotes q WHERE q.assignment_id=a.id AND q.saved=1) AS quote_count,
            (SELECT COUNT(*) FROM proformas p WHERE p.assignment_id=a.id) AS proforma_count
     FROM alerts al
     JOIN assignments a ON a.id=al.assignment_id
     JOIN experts e ON e.id=a.expert_id
     JOIN requests r ON r.id=a.request_id ${RECIPIENT_JOIN}
     WHERE al.fired_at IS NULL AND al.canceled_at IS NULL AND al.fire_at<=?
     ORDER BY al.fire_at LIMIT ?`,
  ).bind(now(), limit).all()).results || [];
  if (!rows.length) return { fired: 0, skipped: 0, queued: 0 };

  const managerChat = await settingValue(env, "managerChat");
  const stmts = [];
  let queued = 0, skipped = 0;
  for (const row of rows) {
    stmts.push(env.DB.prepare("UPDATE alerts SET fired_at=? WHERE id=?").bind(now(), row.alert_id));

    /* کار تمام‌شده یا خارج از کارتابل → هشدار بی‌معنی است */
    const done = [!!row.viewed_at, row.hist_count > 0, row.smart_count > 0, row.quote_count > 0, row.proforma_count > 0, !!row.commission_at];
    if (!row.open_count || (row.kind === "stage" && done[row.stage])) { skipped++; continue; }

    /* کلید یکتایی صف، زمانِ هشدار را هم دارد: شناسهٔ ارجاع بعد از پاک‌کردن میز
       دوباره استفاده می‌شود و ردیفِ قدیمیِ صف، هشدارِ ارجاعِ تازه را بی‌صدا می‌خورد. */
    if (row.kind === "stage") {
      if (!row.telegram_chat) { skipped++; continue; }
      stmts.push(queueStmt(env, `stage:${row.aid}:${row.stage}:${row.fire_at}`, row.telegram_chat,
        stageAlertText(row, row.stage), row.stage === 0 ? seenKb(row.aid) : reqKb(row.aid)));
      queued++;
    } else {
      /* عبور از ۱۰۰٪: هم کارشناس، هم کانال مدیر و/یا گروه کارشناس ارشدش (SLA-05، TG-04) */
      if (row.telegram_chat) { stmts.push(queueStmt(env, `over:${row.aid}:${row.fire_at}`, row.telegram_chat, overdueText(row), reqKb(row.aid))); queued++; }
      for (const rc of recipients(row, null, managerChat)) { stmts.push(queueStmt(env, `over-${rc.tag}:${row.aid}:${row.fire_at}`, rc.chat, managerOverdueText(row))); queued++; }
    }
  }
  await env.DB.batch(stmts);
  return { fired: rows.length, skipped, queued };
}

async function settingValue(env, key) {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(key).first();
  if (!r) return null;
  try { return JSON.parse(r.value); } catch { return null; }
}

/* ------------------------------------------------------------------ */
/* ثبت‌نام کارشناس (TG-03)                                              */
/* ------------------------------------------------------------------ */

const TOKEN_TTL = 15 * 60000;

/** توکن یک‌بارمصرف می‌سازد و لینک عمیق بات را برمی‌گرداند */
export async function makeLink(env, expertId) {
  const token = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  const t = now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM tg_tokens WHERE expert_id=? OR expires_at<?").bind(expertId, t),
    env.DB.prepare("INSERT INTO tg_tokens (token,expert_id,created_at,expires_at) VALUES (?,?,?,?)").bind(token, expertId, t, t + TOKEN_TTL),
  ]);
  const user = T(env.TG_BOT_USERNAME) || "ArianaSupplyBot";
  return { url: `https://t.me/${user}?start=${token}`, expires_at: t + TOKEN_TTL };
}

/**
 * لینک اتصال گروه تیم کارشناس ارشد. `startgroup` یعنی تلگرام از او می‌پرسد بات را به کدام
 * گروه اضافه کند و بعد `/start <token>` را در همان گروه می‌فرستد؛ توکن با پیشوند «tm» از
 * توکن اتصال شخصی جدا می‌شود. همان بات است — فقط اعلان‌های زیرمجموعهٔ او به این گروه می‌رود.
 */
export async function makeTeamLink(env, expertId) {
  const token = "tm" + crypto.randomUUID().replace(/-/g, "").slice(0, 22);
  const t = now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM tg_tokens WHERE (expert_id=? AND token LIKE 'tm%') OR expires_at<?").bind(expertId, t),
    env.DB.prepare("INSERT INTO tg_tokens (token,expert_id,created_at,expires_at) VALUES (?,?,?,?)").bind(token, expertId, t, t + TOKEN_TTL),
  ]);
  const user = T(env.TG_BOT_USERNAME) || "ArianaSupplyBot";
  return { url: `https://t.me/${user}?startgroup=${token}`, expires_at: t + TOKEN_TTL };
}

/** `/start tm…` در گروه: این گروه، گروه اعلان‌های تیمِ همان کارشناس ارشد می‌شود */
async function bindTeam(env, api, chat, token) {
  const t = now();
  const row = await env.DB.prepare("SELECT * FROM tg_tokens WHERE token=?").bind(token).first();
  if (!row || row.used_at || row.expires_at < t) { await api.sendMessage(chat, "این لینک معتبر نیست یا منقضی شده است؛ از پنل، لینک تازه بگیرید.").catch(() => {}); return { ok: true }; }
  const ex = await env.DB.prepare("SELECT id,name,label,senior,active FROM experts WHERE id=?").bind(row.expert_id).first();
  if (!ex || !ex.active || !ex.senior) { await api.sendMessage(chat, "این کارشناس، کارشناس ارشد نیست.").catch(() => {}); return { ok: true }; }
  await env.DB.batch([
    env.DB.prepare("UPDATE experts SET team_chat=NULL WHERE team_chat=?").bind(String(chat)),
    env.DB.prepare("UPDATE experts SET team_chat=? WHERE id=?").bind(String(chat), ex.id),
    env.DB.prepare("UPDATE tg_tokens SET used_at=? WHERE token=?").bind(t, token),
  ]);
  await api.sendMessage(chat, `✅ این گروه به‌عنوان گروه اعلان‌های تیم <b>${esc(ex.label || ex.name)}</b> ثبت شد.\n\n`
    + "از این پس تغییر وضعیت مراحل، عبور از مهلت و بسته شدن درخواست‌های کارشناسان زیرمجموعهٔ ایشان این‌جا اعلام می‌شود.\n"
    + "<i>کدام مرحله‌ها؟ در پنل کارشناس، تب «تنظیم اعلانات».</i>").catch(() => {});
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* پردازش آپدیت وبهوک                                                   */
/* ------------------------------------------------------------------ */

/**
 * یک آپدیت را پردازش می‌کند. همیشه بدون استثنا برمی‌گردد — اگر به تلگرام
 * پاسخ ۲۰۰ ندهیم، همان آپدیت را بارها دوباره می‌فرستد.
 */
export async function handleUpdate(env, u, ctx) {
  try {
    if (u.message) return await onMessage(env, u.message);
    if (u.callback_query) return await onCallback(env, u.callback_query, ctx);
    if (u.my_chat_member) return await onChatMember(env, u.my_chat_member);
  } catch (e) {
    console.error("bot update failed", e && e.message);
  }
  return { ok: true };
}

async function expertOfChat(env, chatId) {
  return env.DB.prepare("SELECT id,name,label,code,active,telegram_chat FROM experts WHERE telegram_chat=?").bind(String(chatId)).first();
}

async function onMessage(env, msg) {
  const chat = msg.chat && msg.chat.id;
  /* کانال/گروه جای گفت‌وگو نیست — با یک استثنا: مدیر که «رد» را زده، دلیلش را
     همان‌جا می‌نویسد. (در گروه با حالت خصوصیِ بات، فقط پاسخ‌های مستقیم به پیامِ
     بات می‌رسند؛ برای همین از او خواسته می‌شود Reply کند.) */
  if (chat && msg.chat.type !== "private") {
    const gtext = T(msg.text);
    /* گروه تیم کارشناس ارشد: لینک startgroup پنل همین را می‌فرستد (بات ممکن است @نام داشته باشد) */
    const st = /^\/start(?:@\w+)?\s+(tm\w+)/.exec(gtext);
    if (st) return bindTeam(env, telegram(env), chat, st[1]);
    /* «/manager» در گروه: همین‌جا کانال مدیر می‌شود — برای وقتی گروه مدیر عوض شده */
    if (/^\/manager(?:@\w+)?$/.test(gtext)) {
      await env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('managerChat',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
        .bind(JSON.stringify(String(chat)), now()).run();
      await telegram(env).sendMessage(chat, "✅ این‌جا کانال اعلان مدیر واحد پشتیبانی شد.").catch(() => {});
      return { ok: true };
    }
    const mgr = await settingValue(env, "managerChat");
    const pend = mgr && String(chat) === String(mgr) ? await settingValue(env, "mgrReject") : null;
    if (pend && pend.decision_id && T(msg.text)) {
      const reason = /^بدون دلیل$/.test(T(msg.text)) ? "" : T(msg.text);
      await env.DB.prepare("DELETE FROM settings WHERE key='mgrReject'").run();
      try {
        await rejectDecision(env, pend.decision_id, reason);
        await telegram(env).sendMessage(chat, "✅ رد ثبت شد و به کارشناس اطلاع داده شد.").catch(() => {});
      } catch (e) { await telegram(env).sendMessage(chat, `رد ثبت نشد: ${esc(e.message)}`).catch(() => {}); }
      await drainOutbox(env, 10).catch(() => {});
    }
    return { ok: true };
  }
  if (!chat) return { ok: true };
  const api = telegram(env);
  const text = T(msg.text);

  if (text.startsWith("/start")) {
    const token = T(text.slice(6));
    if (!token || token === "kartabl") {
      const ex = await expertOfChat(env, chat);
      if (ex) return kartabl(env, api, chat, ex, { head: `سلام ${esc(ex.label || ex.name)}. حساب شما به سامانه وصل است.` });
      await api.sendMessage(chat, "برای اتصال، از پنل کارشناس دکمهٔ «اتصال به تلگرام» را بزنید و روی لینکی که می‌دهد کلیک کنید.\n\nاین بات فقط با کارشناسان ثبت‌شدهٔ واحد تأمین و پشتیبانی کار می‌کند.");
      return { ok: true };
    }
    return bindToken(env, api, chat, token);
  }

  const ex = await expertOfChat(env, chat);
  if (!ex) { await api.sendMessage(chat, "این گفت‌وگو به هیچ کارشناسی وصل نیست. از پنل کارشناس «اتصال به تلگرام» را بزنید."); return { ok: true }; }

  if (msg.voice || msg.audio) return onVoice(env, msg, ex);
  if (msg.document || msg.photo || msg.video) return onFile(env, msg, ex);

  if (text === "/stop") {
    await env.DB.prepare("UPDATE experts SET telegram_chat=NULL WHERE id=?").bind(ex.id).run();
    await api.sendMessage(chat, "اتصال قطع شد. دیگر اعلانی فرستاده نمی‌شود.\nبرای وصل شدن دوباره، از پنل لینک تازه بگیرید.");
    return { ok: true };
  }
  if (text === "/kartabl") return kartabl(env, api, chat, ex);
  if (text === "/ghaleb") return templateList(env, api, chat, ex, null, "");
  /* میان‌بُرها به همان مسیرهای منو می‌رسند؛ فقط «کدام درخواست؟» را اول می‌پرسند */
  if (SHORTCUTS[text]) return kartabl(env, api, chat, ex, { target: SHORTCUTS[text] });

  /* متن آزاد: پاسخِ کدام پرسشِ باز است؟ کارشناس ممکن است هم‌زمان نامه‌ای منتظرِ
     توضیح، فایلی منتظرِ نام تأمین‌کننده و فیلدی منتظرِ مقدار داشته باشد. قاعده ساده
     و قابل پیش‌بینی است: **آخرین چیزی که پرسیده شده، همان است که جواب می‌گیرد.** */
  if (text && !text.startsWith("/")) {
    const t = now();
    const [letter, upload, flow] = await Promise.all([
      env.DB.prepare("SELECT * FROM letters WHERE expert_id=? AND state IN ('need_voice','transcribed') AND updated_at>? ORDER BY id DESC LIMIT 1")
        .bind(ex.id, t - LETTER_FRESH).first(),
      env.DB.prepare("SELECT *, COALESCE(asked_at, created_at) AS at FROM tg_uploads WHERE expert_id=? AND state='need_name' AND done_at IS NULL AND expires_at>? ORDER BY at DESC, id DESC LIMIT 1")
        .bind(ex.id, t).first(),
      inputFlow(env, ex.id),
    ]);
    const pick = [
      letter && { at: letter.updated_at || letter.created_at, run: () => onLetterText(env, api, chat, ex, letter, text) },
      upload && { at: upload.at, run: () => nameForUpload(env, api, chat, ex, upload, text) },
      flow && { at: flow.at, run: () => onFlowText(env, api, chat, ex, flow, text) },
    ].filter(Boolean).sort((a, b) => b.at - a.at)[0];
    if (pick) return pick.run();
  }

  await api.sendMessage(chat, HELP_TEXT, [[KARTABL_BTN]]);
  return { ok: true };
}

const SHORTCUTS = { "/estelam": "t", "/faktor": "f", "/tozihat": "n", "/nameh": "l", "/tahvil": "d" };
const HELP_TEXT = "چه کاری می‌خواهید بکنید؟\n\n"
  + "/kartabl — کارتابل: درخواست‌های فعال و مسیر هر کدام\n"
  + "/estelam — تب استعلامات یک درخواست\n"
  + "/faktor — خط استعلام دستی\n"
  + "/tozihat — توضیحات جدول کمیسیون\n"
  + "/nameh — نامهٔ پیوست (صوتی یا نوشتاری)\n"
  + "/tahvil — تحویل اسناد\n"
  + "/ghaleb — قالب‌های پیام به تأمین‌کننده (ساخت و ویرایش)\n"
  + "/stop — قطع اتصال\n\n"
  + "<i>هر فایلی که بیرون از «دریافت پیش‌فاکتور» یا «پیوست‌ها»ی تحویل بفرستید، پیش‌فاکتور حساب می‌شود.</i>";

/** پاسخ متنی کارشناس به پرسشِ یک گفت‌وگو (فقط گام‌های INPUT_STEPS به این‌جا می‌رسند) */
async function onFlowText(env, api, chat, ex, f, text) {
  const d = flowData(f);
  if (f.kind === "field") return onFieldText(env, api, chat, f, text);

  /* قیدهای متنیِ جستجوی هوشمند: برند / مشخصات / ملاحظات */
  if (f.kind === "smart") {
    const key = f.step === "need_brand" ? "brand" : f.step === "need_specs" ? "specs" : "notes";
    d[key] = text.trim() === "-" ? "" : text.slice(0, 500);
    await env.DB.prepare("UPDATE tg_flows SET step='prefs', data_json=? WHERE id=?").bind(JSON.stringify(d), f.id).run();
    return smartPrefsRender(env, api, chat, f, d, f.message_id);
  }

  /* «درج توضیحات» منوی جدول کمیسیون */
  if (f.kind === "notes") {
    if (text.length > 1500) { await api.sendMessage(chat, "توضیحات خیلی بلند است؛ کوتاه‌ترش کنید."); return { ok: true }; }
    await env.DB.batch([
      env.DB.prepare("UPDATE assignments SET notes=? WHERE id=? AND expert_id=?").bind(text, f.assignment_id, ex.id),
      env.DB.prepare("UPDATE tg_flows SET step='done', done_at=? WHERE id=?").bind(now(), f.id),
    ]);
    return tableSelect(env, api, chat, ex, f.assignment_id, null, "📝 توضیحات ثبت شد؛ در بخش «توضیحات تدارکات و پشتیبانی» جدول کمیسیون می‌نشیند.");
  }

  /* خط استعلام دستی: نام تأمین‌کنندهٔ تازه */
  if (f.kind === "manual") {
    if (text.length > 120) { await api.sendMessage(chat, "نام تأمین‌کننده خیلی بلند است."); return { ok: true }; }
    return manualItems(env, api, chat, ex, f, { ...d, supplier: text }, null);
  }

  /* قالب پیام: عنوان یا متنِ قالبِ تازه، یا ویرایشِ یکی از قبلی‌ها */
  if (f.kind === "tpl") return onTemplateText(env, api, chat, ex, f, d, text);
  return { ok: true };
}

/**
 * «۲٬۵۰۰٬۰۰۰»، «2,500,000»، «2500000 ریال» → 2500000
 * ارقام فارسی و عربی، جداکننده‌های رایج و کلمهٔ «ریال» پذیرفته می‌شوند؛
 * چیزی که عدد نیست، null برمی‌گردد تا کاربر دوباره بنویسد نه اینکه صفر ثبت شود.
 */
export function parsePrice(s) {
  const digits = "۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩";
  let x = String(s == null ? "" : s).replace(/[۰-۹٠-٩]/g, (d) => String(digits.indexOf(d) % 10));
  x = x.replace(/[,٬،_\s]/g, "").replace(/ریال|تومان|rial|IRR/gi, "").trim();
  if (!/^\d+(\.\d+)?$/.test(x)) return null;
  const n = Number(x);
  return isFinite(n) && n > 0 ? n : null;
}

async function bindToken(env, api, chat, token) {
  const t = now();
  const row = await env.DB.prepare("SELECT * FROM tg_tokens WHERE token=?").bind(token).first();
  if (!row || row.used_at || row.expires_at < t) {
    await api.sendMessage(chat, "این لینک معتبر نیست یا منقضی شده است.\nاز پنل کارشناس یک لینک تازه بگیرید (اعتبار ۱۵ دقیقه).");
    return { ok: true };
  }
  const ex = await env.DB.prepare("SELECT id,name,label,active FROM experts WHERE id=?").bind(row.expert_id).first();
  if (!ex || !ex.active) { await api.sendMessage(chat, "این کارشناس در سامانه فعال نیست."); return { ok: true }; }

  await env.DB.batch([
    /* یک chat فقط به یک کارشناس، و یک کارشناس فقط به یک chat */
    env.DB.prepare("UPDATE experts SET telegram_chat=NULL WHERE telegram_chat=?").bind(String(chat)),
    env.DB.prepare("UPDATE experts SET telegram_chat=? WHERE id=?").bind(String(chat), ex.id),
    env.DB.prepare("UPDATE tg_tokens SET used_at=? WHERE token=?").bind(t, token),
  ]);
  await api.sendMessage(chat,
    `✅ وصل شد.\n\n${esc(ex.label || ex.name)} گرامی، از این پس ارجاع‌های تازه و یادآوری مهلت‌ها همین‌جا به شما اطلاع داده می‌شود.\n\n/kartabl — ارجاع‌های باز\n/stop — قطع اتصال`);
  return kartabl(env, api, chat, ex);
}

/* ------------------------------------------------------------------ */
/* کارتابل و مسیر هر درخواست                                           */
/* ------------------------------------------------------------------ */

/* «فعال» همان تعریف کارتابل پنل است: ارسال شده و دست‌کم یک قلمِ باز دارد. ساختن
   جدول کمیسیون درخواست را نمی‌بندد؛ فقط «خاتمه» اقلام را می‌بندد و درخواست وقتی
   قلمِ بازی نماند از این‌جا (و از همهٔ منوهای بات) بیرون می‌رود. */
const OPEN_ASSIGNMENT = `SELECT a.id, a.request_id, a.deadline_at, r.party FROM assignments a JOIN requests r ON r.id=a.request_id
  WHERE a.expert_id=? AND a.dispatched_at IS NOT NULL
    AND EXISTS (SELECT 1 FROM items i WHERE i.assignment_id=a.id AND i.state='open')`;

/** ارجاع‌های فعال همین کارشناس، برای ساختن دکمه‌ها (INV-11) */
async function openAssignments(env, expertId) {
  return (await env.DB.prepare(`${OPEN_ASSIGNMENT} ORDER BY a.deadline_at LIMIT 25`).bind(expertId).all()).results || [];
}

/**
 * یک ارجاعِ فعال و متعلق به همین کارشناس.
 *
 * مستقیم پرسیده می‌شود، نه با جست‌وجو در فهرستِ دکمه‌ها: آن فهرست سقف دارد و
 * اگر کارشناس ارجاع‌های بیشتری داشته باشد، انتخابِ ارجاعِ خارج از سقف بی‌صدا
 * شکست می‌خورد — که یک بار همین‌جا اتفاق افتاد.
 */
async function ownOpenAssignment(env, expertId, aid) {
  return env.DB.prepare(`${OPEN_ASSIGNMENT} AND a.id=?`).bind(expertId, aid).first();
}

const short = (s, n = 28) => { const x = String(s || "").trim(); return x.length > n ? x.slice(0, n - 1) + "…" : x; };

/** خواندن خودکار پیش‌فاکتور روی این نصب فعال است؟ (مدل + انبارِ دارای لینک امضاشده) */
const aiReady = (env) => !!(env.ANTHROPIC_API_KEY && (storage(env) || {}).signedUrl);

/* مقصدِ بعد از انتخاب درخواست — برای میان‌بُرها */
const KT_TARGET = { t: "🧾 تب استعلامات", f: "✍️ خط استعلام دستی", n: "📝 توضیحات جدول کمیسیون", l: "✉️ نامه", d: "📦 تحویل" };

/** کارتابل: فهرست درخواست‌های فعال با یک دکمه برای هر کدام */
async function kartabl(env, api, chat, ex, { target = "m", mid = null, head = "" } = {}) {
  const rows = (await env.DB.prepare(
    `SELECT a.id, a.request_id, a.deadline_at, r.party,
            (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id AND i.state='open') AS open_count
     FROM assignments a JOIN requests r ON r.id=a.request_id
     WHERE a.expert_id=? AND a.dispatched_at IS NOT NULL
       AND EXISTS (SELECT 1 FROM items i WHERE i.assignment_id=a.id AND i.state='open')
     ORDER BY a.deadline_at LIMIT 25`,
  ).bind(ex.id).all()).results || [];
  const top = head ? head + "\n\n" : "";
  if (!rows.length) return show(api, chat, mid, `${top}📋 <b>کارتابل شما خالی است.</b>`, []);
  const t = now();
  const body = rows.map((r) => {
    const left = r.deadline_at ? Math.max(0, workHours(t, r.deadline_at)) : null;
    return `• <b>${esc(r.request_id)}</b> — ${esc(short(r.party, 40))}\n   ${M(r.open_count)} قلم باز`
      + (r.deadline_at ? ` · مهلت ${esc(fmtFa(r.deadline_at))} (${M(left.toFixed(1))} ساعت کاری)` : "");
  }).join("\n");
  const kb = rows.map((r) => [{ text: `📄 ${r.request_id} — ${short(r.party, 24)}`, callback_data: `rq:${r.id}:${KT_TARGET[target] ? target : "m"}:e` }]);
  return show(api, chat, mid,
    `${top}📋 <b>کارتابل</b> — ${M(rows.length)} درخواست فعال\n\n${body}\n\n`
    + (KT_TARGET[target] ? `برای ${KT_TARGET[target]}، درخواست را انتخاب کنید:` : "هر درخواست را بزنید تا مسیرش باز شود."), kb);
}

/**
 * مسیر یک درخواست. کار تازه همان دو قدم اول را دارد (سوابق، جستجوی هوشمند)؛
 * مرحله‌های بعدی فقط وقتی دکمه می‌شوند که کار به آن‌جا رسیده باشد، تا کارشناسی
 * که فردا برمی‌گردد برای «تحویل» مجبور نباشد از سوابق دوباره راه بیفتد.
 */
async function requestMenu(env, api, chat, ex, aid, { mid = null, head = "" } = {}) {
  const s = await env.DB.prepare(
    `SELECT a.id, a.request_id, a.deadline_at, a.viewed_at, a.commission_at, r.party,
            (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id AND i.state='open') AS open_count,
            (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id) AS item_count,
            (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id AND i.hist_done_at IS NOT NULL) AS hist,
            (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id AND i.smart_done_at IS NOT NULL) AS smart,
            (SELECT COUNT(*) FROM quotes q WHERE q.assignment_id=a.id) AS lines,
            (SELECT COUNT(*) FROM quotes q WHERE q.assignment_id=a.id AND q.saved=1) AS quotes,
            (SELECT COUNT(*) FROM proformas p WHERE p.assignment_id=a.id) AS proformas
     FROM assignments a JOIN requests r ON r.id=a.request_id WHERE a.id=? AND a.expert_id=? AND a.dispatched_at IS NOT NULL`,
  ).bind(aid, ex.id).first();
  if (!s) return show(api, chat, mid, "این درخواست متعلق به شما نیست.", [[KARTABL_BTN]]);
  /* حالتِ فایلِ درخواستِ دیگری («دریافت پیش‌فاکتور»، «پیوست‌ها») این‌جا بسته می‌شود
     تا فایلِ بعدی به درخواستِ اشتباه نچسبد */
  await endModes(env, ex.id, aid);
  if (!s.open_count) {
    return show(api, chat, mid, `📄 درخواست <b>${esc(s.request_id)}</b>\n\nهمهٔ اقلام این درخواست بسته شده و دیگر در کارتابل نیست.`, [[KARTABL_BTN]]);
  }
  const done = [!!s.viewed_at, s.hist > 0, s.smart > 0, s.quotes > 0, s.proformas > 0, !!s.commission_at];
  const left = s.deadline_at ? Math.max(0, workHours(now(), s.deadline_at)) : null;
  const text = `${head ? head + "\n\n" : ""}📄 <b>درخواست ${esc(s.request_id)}</b>\n${esc(s.party || "")}\n\n`
    + `${M(s.open_count)} قلم باز از ${M(s.item_count)}`
    + (s.deadline_at ? ` · مهلت ${esc(fmtFa(s.deadline_at))} (${M(left.toFixed(1))} ساعت کاری)` : "") + "\n\n"
    + STAGE_NAMES.map((n, i) => `${done[i] ? "✅" : "⬜"} ${n}`).join("\n");
  const kb = [
    [{ text: "📚 بررسی سوابق", callback_data: `hs:a:${aid}` }],
    [{ text: "🔎 جستجوی هوشمند", callback_data: `sm:a:${aid}` }],
  ];
  if (s.lines) kb.push([{ text: "🧾 تب استعلامات", callback_data: `qt:${aid}` }]);
  if (s.quotes) kb.push([{ text: "📊 جدول کمیسیون", callback_data: `ct:${aid}:start:0` }]);
  if (s.commission_at) {
    kb.push([{ text: "📦 تحویل", callback_data: `dvo:${aid}` }, { text: "✉️ تولید نامه", callback_data: `rq:${aid}:l` }]);
    kb.push([{ text: "🔒 خاتمه", callback_data: `cm:${aid}:card:0` }]);
  }
  kb.push([KARTABL_BTN]);
  return show(api, chat, mid, text, kb);
}

/* ------------------------------------------------------------------ */
/* فایلِ رسیده (ADR-0008، TG-11)                                        */
/*                                                                      */
/* یک فایل سه معنا دارد و فقط «حالتی» که کارشناس خودش با دکمه باز کرده   */
/* تعیینش می‌کند:                                                       */
/*   ۱. «پیوست‌ها»ی تحویل باز است ← پیوست (هر چند فایل پشت سر هم)        */
/*   ۲. «دریافت پیش‌فاکتور» از تب استعلامات باز است ← پیش‌فاکتورِ همان    */
/*      تأمین‌کنندگان و اقلام؛ «کدام درخواست؟» دیگر پرسیده نمی‌شود       */
/*   ۳. هیچ‌کدام ← پیش‌فاکتورِ آزاد: درخواست ← اقلام ← «استفاده پیش‌فاکتور» */
/* ------------------------------------------------------------------ */

const UPLOAD_TTL = 24 * 3600000;

/** مشخصات فایلِ پیام: سند، عکس (بزرگ‌ترین اندازه) یا ویدئو */
function fileOf(msg) {
  const day = new Date().toISOString().slice(0, 10);
  if (msg.document) {
    const d = msg.document;
    return { kind: "document", id: d.file_id, size: d.file_size || 0, name: d.file_name || `سند-${day}`, mime: d.mime_type || "application/octet-stream" };
  }
  if (Array.isArray(msg.photo) && msg.photo.length) {
    const p = msg.photo[msg.photo.length - 1];
    return { kind: "photo", id: p.file_id, size: p.file_size || 0, name: `عکس-${day}.jpg`, mime: "image/jpeg" };
  }
  if (msg.video) {
    const v = msg.video;
    return { kind: "video", id: v.file_id, size: v.file_size || 0, name: v.file_name || `ویدئو-${day}.mp4`, mime: v.mime_type || "video/mp4" };
  }
  return null;
}

async function onFile(env, msg, ex) {
  const api = telegram(env);
  const chat = msg.chat.id;
  const file = fileOf(msg);
  if (!file) return { ok: true };
  /* اگر هر دو حالت باز باشند، آخرینی که کارشناس باز کرده برنده است */
  const mode = await env.DB.prepare(
    `SELECT *, COALESCE(asked_at, created_at) AS at FROM tg_flows WHERE expert_id=? AND done_at IS NULL AND expires_at>?
       AND ((kind='deliver' AND step='attach') OR (kind='await_pf' AND step='wait'))
     ORDER BY at DESC, id DESC LIMIT 1`,
  ).bind(ex.id, now()).first();
  /* پیوست دانلود نمی‌شود: تلگرام همان file_id را هنگام تحویل دوباره می‌فرستد */
  if (mode && mode.kind === "deliver") return addAttachment(env, api, chat, ex, mode, file);

  if (file.kind === "video") {
    await api.sendMessage(chat, "ویدئو پیش‌فاکتور حساب نمی‌شود؛ فقط در «پیوست‌ها»ی تحویل پذیرفته می‌شود.");
    return { ok: true };
  }
  if (file.size > MAX_BYTES) {
    await api.sendMessage(chat, `این فایل ${M((file.size / 1048576).toFixed(1))} مگابایت است.\nبات تلگرام فقط تا ${M(20)} مگابایت را می‌تواند بگیرد؛ لطفاً از پنل بارگذاری کنید یا فشرده‌ترش کنید.`);
    return { ok: true };
  }
  const store = storage(env);
  if (!store) { await api.sendMessage(chat, "انبار فایل هنوز به سامانه وصل نشده است. فعلاً پیش‌فاکتور را از پنل بارگذاری کنید."); return { ok: true }; }
  if (mode) return awaitedProforma(env, api, chat, ex, mode, file, store);
  return freeProforma(env, api, chat, ex, file, store);
}

/**
 * دانلود فوری و جریانی به انبار — بایت‌ها از حافظهٔ Worker رد نمی‌شوند.
 * ترتیب مهم است: لینک دانلود تلگرام فقط حدود یک ساعت معتبر است؛ اگر اول سؤال
 * می‌پرسیدیم و کارشناس فردا جواب می‌داد، فایل از دست می‌رفت (ADR-0008).
 */
async function storeFile(api, store, aid, file) {
  const f = await api.getFile(file.id);
  const src = await fetch(api.fileUrl(f.file_path));
  if (!src.ok || !src.body) return null;
  const key = storageKey(aid || null, file.name);
  await store.put(key, src.body, { contentType: file.mime, size: file.size || undefined });
  return key;
}

async function newUpload(env, ex, chat, file, key, aid, state, opts) {
  const t = now();
  const r = await env.DB.prepare(
    `INSERT INTO tg_uploads (expert_id,chat_id,file_id,storage_key,filename,mime,size_bytes,state,assignment_id,options_json,created_at,expires_at,asked_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(ex.id, String(chat), file.id, key, file.name, file.mime, file.size || null, state, aid || null, JSON.stringify(opts || {}), t, t + UPLOAD_TTL, t).run();
  return r.meta.last_row_id;
}

/* گزینه‌های بارگذاری: sel (اقلام تیک‌خورده) · groups (تأمین‌کنندگان) · read (سندِ خوانده‌شده).
   ردیف‌های قدیمی آرایهٔ تأمین‌کنندگان بودند. */
const uploadOpts = (up) => {
  let o;
  try { o = JSON.parse((up && up.options_json) || "{}"); } catch (_) { o = {}; }
  return Array.isArray(o) ? { groups: o } : (o || {});
};
const ownUpload = (env, ex, uid) => env.DB.prepare("SELECT * FROM tg_uploads WHERE id=? AND expert_id=?").bind(uid, ex.id).first();
const dropFileKb = (uid) => [[{ text: "✖️ بی‌خیال (فایل حذف شود)", callback_data: `pf:${uid}:x:0` }]];

/** پیش‌فاکتورِ آزاد، گام اول: کدام درخواست؟ (با یک درخواستِ فعال پرسیده نمی‌شود) */
async function freeProforma(env, api, chat, ex, file, store) {
  const open = await openAssignments(env, ex.id);
  if (!open.length) { await api.sendMessage(chat, "الان هیچ درخواست فعالی ندارید که این پیش‌فاکتور به آن بخورد."); return { ok: true }; }
  const one = open.length === 1 ? open[0] : null;
  const key = await storeFile(api, store, one && one.id, file);
  if (!key) { await api.sendMessage(chat, "دانلود فایل از تلگرام نشد. یک بار دیگر بفرستید."); return { ok: true }; }
  const uid = await newUpload(env, ex, chat, file, key, one && one.id, one ? "need_items" : "need_request", {});
  if (one) return uploadItems(env, api, chat, ex, await ownUpload(env, ex, uid), null);

  const kb = open.map((a) => [{ text: `📄 ${a.request_id} — ${short(a.party)}`, callback_data: `pf:${uid}:r:${a.id}` }]);
  kb.push(...dropFileKb(uid));
  const sent = await api.sendMessage(chat, `📎 <b>${esc(file.name)}</b> گرفته شد و پیش‌فاکتور حساب می‌شود.\n\nبرای کدام درخواست است؟`, kb);
  await env.DB.prepare("UPDATE tg_uploads SET message_id=? WHERE id=?").bind(sent.message_id, uid).run();
  return { ok: true };
}

/** پیش‌فاکتورِ آزاد، گام دوم: کدام اقلام؟ چندانتخابی با «همه»، بعد «استفاده پیش‌فاکتور» */
async function uploadItems(env, api, chat, ex, up, mid) {
  const asg = up && await ownOpenAssignment(env, ex.id, up.assignment_id);
  if (!asg) { await api.sendMessage(chat, "این درخواست دیگر فعال نیست.").catch(() => {}); return { ok: true }; }
  const its = await itemsOf(env, up.assignment_id);
  const o = uploadOpts(up);
  /* تک‌قلمی از پیش تیک می‌خورد؛ «استفاده» همچنان لازم است تا بی‌اجازه خرجِ خواندن نشود */
  if (!Array.isArray(o.sel)) {
    o.sel = its.length === 1 ? [its[0].id] : [];
    await env.DB.prepare("UPDATE tg_uploads SET options_json=? WHERE id=?").bind(JSON.stringify(o), up.id).run();
  }
  const sel = new Set(o.sel);
  const kb = its.slice(0, 40).map((i) => [{
    text: `${sel.has(i.id) ? "☑" : "☐"} ${short(i.title, 30)}${i.qty != null ? ` — ${M(i.qty)} ${i.unit || ""}` : ""}`,
    callback_data: `pf:${up.id}:t:${i.id}`,
  }]);
  if (its.length > 1) kb.push([{ text: sel.size === its.length ? "☐ هیچ" : "☑ همه", callback_data: `pf:${up.id}:all:0` }]);
  kb.push([{ text: `📎 استفاده پیش‌فاکتور${sel.size ? ` (${M(sel.size)} قلم)` : ""}`, callback_data: `pf:${up.id}:use:0` }]);
  kb.push(...dropFileKb(up.id));
  const r = await show(api, chat, mid,
    `📎 <b>${esc(up.filename)}</b>\nدرخواست <b>${esc(asg.request_id)}</b> — ${esc(short(asg.party, 40))}\n\n`
    + "این پیش‌فاکتور برای کدام اقلام است؟ تیک بزنید و «استفاده پیش‌فاکتور» را بزنید.", kb);
  if (r && r.message_id && r.message_id !== up.message_id) await env.DB.prepare("UPDATE tg_uploads SET message_id=? WHERE id=?").bind(r.message_id, up.id).run();
  return { ok: true };
}

/**
 * پیش‌فاکتورِ آزاد، گام سوم: کدام تأمین‌کننده؟ فقط آن‌هایی که روی همان اقلام خط
 * استعلام دارند — پیش‌فاکتور به تأمین‌کننده می‌چسبد. اگر هیچ نیست، سند خوانده
 * می‌شود تا نام از سربرگ خودش دربیاید (یا بی خواندن خودکار، نام پرسیده می‌شود).
 */
async function uploadSupplier(env, api, chat, ex, up, mid) {
  const o = uploadOpts(up);
  const ids = idList(o.sel);
  const rows = ids.length ? (await env.DB.prepare(
    `SELECT supplier_name AS n, COUNT(*) AS c, SUM(saved) AS s FROM quotes
     WHERE assignment_id=? AND item_id IN (${ids.map(() => "?").join(",")}) GROUP BY supplier_name ORDER BY supplier_name LIMIT 30`,
  ).bind(up.assignment_id, ...ids).all()).results || [] : [];
  o.groups = rows.filter((g) => T(g.n)).map((g) => ({ n: g.n, c: g.c, s: g.s || 0 }));
  const ai = aiReady(env);
  const state = o.groups.length || ai ? "need_supplier" : "need_name";
  await env.DB.prepare("UPDATE tg_uploads SET state=?, options_json=?, asked_at=? WHERE id=?").bind(state, JSON.stringify(o), now(), up.id).run();
  const next = { ...up, state, options_json: JSON.stringify(o) };
  if (!o.groups.length && ai) return newQuoteFromFile(env, api, chat, ex, next, mid);

  const kb = o.groups.map((g, i) => [{ text: `${g.s === g.c ? "✅" : "⚪"} ${short(g.n, 26)} · ${M(g.c)} قلم`, callback_data: `pf:${up.id}:s:${i}` }]);
  if (ai) kb.push([{ text: "➕ تأمین‌کنندهٔ تازه (نامش را از خود فایل می‌خوانم)", callback_data: `pf:${up.id}:a:0` }]);
  if (o.groups.length) kb.push([{ text: "✍️ نام تأمین‌کننده را خودم می‌نویسم", callback_data: `pf:${up.id}:n:0` }]);
  kb.push(...dropFileKb(up.id));
  await show(api, chat, mid, `📎 <b>${esc(up.filename)}</b> · ${M(ids.length)} قلم\n\n`
    + (o.groups.length
      ? "این پیش‌فاکتورِ کدام تأمین‌کننده است؟\n<i>⚪ یعنی هنوز ثبت موقت نشده؛ فرقی نمی‌کند، انتخابش کنید.</i>"
      : "برای این اقلام هنوز خط استعلامی نیست. <b>نام تأمین‌کننده را بنویسید:</b>"), kb);
  return { ok: true };
}

/**
 * «تأمین‌کنندهٔ تازه» — سند خوانده می‌شود تا **نام تأمین‌کننده از خود پیش‌فاکتور**
 * دربیاید. کلیدِ ردیف پیش‌فاکتور همان نام است، پس تا سند خوانده نشود ردیفی هم
 * نمی‌شود ساخت؛ برای همین extractFor صدا زده می‌شود که چیزی نمی‌نویسد. خروجی در
 * گزینه‌های بارگذاری می‌ماند تا اگر نام را کارشناس نوشت، دوباره پول خواندن ندهیم.
 */
async function newQuoteFromFile(env, api, chat, ex, up, mid) {
  const o = uploadOpts(up);
  const askName = async (why) => {
    await env.DB.prepare("UPDATE tg_uploads SET state='need_name', options_json=?, asked_at=? WHERE id=?").bind(JSON.stringify(o), now(), up.id).run();
    await show(api, chat, mid, `📎 <b>${esc(up.filename)}</b>\n\n${why}\n\n<b>نام تأمین‌کننده را بنویسید</b> تا فایل همان‌جا ثبت شود:`, dropFileKb(up.id));
    return { ok: true };
  };
  const asg = await ownOpenAssignment(env, ex.id, up.assignment_id);
  if (!asg) { await api.sendMessage(chat, "این درخواست دیگر فعال نیست.").catch(() => {}); return { ok: true }; }
  if (!aiReady(env)) return askName("خواندن خودکار روی این نصب فعال نیست.");

  await show(api, chat, mid, `📎 <b>${esc(up.filename)}</b>\n\n⏳ دارم سند را می‌خوانم تا نام تأمین‌کننده و قیمت‌ها را از خودش بردارم…`, []);
  let out;
  try {
    out = await extractFor(env, storage(env), {
      assignment_id: up.assignment_id, request_id: asg.request_id, storage_key: up.storage_key, mime: up.mime, item_ids: o.sel,
    });
  } catch (e) { return askName(`خواندن نشد: ${esc(e.message)}`); }
  const r = out.result;
  o.read = out;
  if (!r.extractable) return askName(`⚠️ نتوانستم مطمئن بخوانم — <b>${esc(REFUSAL_FA[r.reason] || r.reason || "نامشخص")}</b>. بعد از ثبت، فیلدها را روی کارت استعلام دستی پر کنید.`);
  if (!T(r.supplier_name)) return askName("⚠️ سند را خواندم ولی نام تأمین‌کننده روی سربرگش پیدا نشد.");
  return attachProforma(env, api, chat, ex, { aid: up.assignment_id, up, supplier: T(r.supplier_name), itemIds: o.sel, out, mid: null });
}

/** پاسخ متنی به «نام تأمین‌کننده را بنویسید» */
async function nameForUpload(env, api, chat, ex, up, name) {
  if (name.length > 120) { await api.sendMessage(chat, "نام تأمین‌کننده خیلی بلند است."); return { ok: true }; }
  const o = uploadOpts(up);
  return attachProforma(env, api, chat, ex, { aid: up.assignment_id, up, supplier: name, itemIds: o.sel, out: o.read || null, mid: null });
}

/** خط استعلامِ (تأمین‌کننده × قلم) اگر نیست — خطِ موجود دست نمی‌خورد. `origin`: proforma | manual */
const lineInserts = (env, aid, supplier, ids, t, origin = "proforma") => ids.map((iid) => env.DB.prepare(
  `INSERT INTO quotes (assignment_id,item_id,supplier_name,unit,qty,invoice,source,origin,created_at,updated_at)
   SELECT i.assignment_id, i.id, ?, i.unit, i.qty, ?, 'telegram', ?, ?, ? FROM items i
   WHERE i.id=? AND i.assignment_id=?
     AND NOT EXISTS (SELECT 1 FROM quotes q WHERE q.assignment_id=i.assignment_id AND q.item_id=i.id AND q.supplier_name=?)`,
).bind(supplier, INVOICE_DEFAULT, origin, t, t, iid, aid, supplier));

/**
 * ثبت پیش‌فاکتور روی یک تأمین‌کننده و اقلامش، بعد خواندن خودکار.
 *
 * خطِ استعلامِ اقلامِ انتخابی اگر برای این تأمین‌کننده نبود همین‌جا ساخته می‌شود:
 * هم خواندن روی همان خط می‌نشیند، هم اگر خواندن نشد کارت استعلام همهٔ فیلدها را
 * برای پرکردنِ دستی دارد. فهرست اقلام روی ردیف پیش‌فاکتور می‌ماند تا خواندن و ثبت
 * (حتی «دوباره بخوان» ساعتی بعد) فقط همان اقلام را ببیند. فایلِ تازه برای همان
 * تأمین‌کننده، خواندنِ قبلی را بی‌اعتبار می‌کند.
 */
async function attachProforma(env, api, chat, ex, { aid, up, supplier, itemIds, out, mid }) {
  const asg = await ownOpenAssignment(env, ex.id, aid);
  if (!asg) { await api.sendMessage(chat, "این درخواست دیگر فعال نیست.").catch(() => {}); return { ok: true }; }
  const ids = idList(itemIds);
  const t = now();
  const stmts = [
    env.DB.prepare(
      `INSERT INTO proformas (assignment_id,supplier_name,filename,storage_key,mime,size_bytes,source,uploaded_at,item_ids)
       VALUES (?,?,?,?,?,?,'telegram',?,?)
       ON CONFLICT(assignment_id,supplier_name) DO UPDATE SET filename=excluded.filename, storage_key=excluded.storage_key,
         mime=excluded.mime, size_bytes=excluded.size_bytes, source='telegram', uploaded_at=excluded.uploaded_at,
         item_ids=excluded.item_ids, extracted_json=NULL, extract_state=NULL, extract_at=NULL`,
    ).bind(aid, supplier, up.filename, up.storage_key, up.mime, up.size_bytes || null, t, ids.length ? JSON.stringify(ids) : null),
    ...lineInserts(env, aid, supplier, ids, t),
    env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)")
      .bind(t, `expert:${ex.id}`, "proforma", asg.request_id, JSON.stringify({ assignment_id: aid, supplier, filename: up.filename, items: ids, channel: "telegram" })),
  ];
  if (up.id) stmts.push(env.DB.prepare("UPDATE tg_uploads SET state='done', done_at=?, assignment_id=? WHERE id=?").bind(t, aid, up.id));
  await env.DB.batch(stmts);

  const pf = await env.DB.prepare("SELECT * FROM proformas WHERE assignment_id=? AND supplier_name=?").bind(aid, supplier).first();
  await show(api, chat, mid, `✅ پیش‌فاکتور <b>${esc(up.filename)}</b> زیر نام <b>${esc(supplier)}</b> ثبت شد${ids.length ? ` — ${M(ids.length)} قلم` : ""}.`, []);
  if (!pf) return { ok: true };
  if (out) {
    await saveExtraction(env, pf.id, out);
    return presentExtraction(env, api, chat, pf.id, out.result, aid, ids);
  }
  if (!aiReady(env)) return quoteCard(env, api, chat, aid, supplier, null, "خواندن خودکار روی این نصب فعال نیست؛ فیلدها را همین‌جا پر کنید:");
  await api.sendMessage(chat, "⏳ در حال خواندن پیش‌فاکتور…").catch(() => {});
  try {
    const res = await runExtraction(env, storage(env), { ...pf, request_id: asg.request_id });
    return presentExtraction(env, api, chat, pf.id, res.result, aid, ids);
  } catch (e) {
    await api.sendMessage(chat, `خواندن نشد: ${esc(e.message)}`, [
      [{ text: "🔁 دوباره بخوان", callback_data: `ai:${pf.id}:go:0` }],
      [{ text: "✍️ پرکردن دستی روی کارت استعلام", callback_data: `qk:${pf.id}` }],
    ]).catch(() => {});
    return { ok: true };
  }
}

/** «دریافت پیش‌فاکتور» باز است: فایل بی‌پرسشِ درخواست به همان تأمین‌کنندگان و اقلام می‌نشیند */
async function awaitedProforma(env, api, chat, ex, f, file, store) {
  const d = flowData(f);
  const pending = (d.want || []).map((w, i) => ({ ...w, i })).filter((w) => !w.got);
  if (!pending.length) {
    await env.DB.prepare("UPDATE tg_flows SET step='done', done_at=? WHERE id=?").bind(now(), f.id).run();
    return freeProforma(env, api, chat, ex, file, store);
  }
  const key = await storeFile(api, store, f.assignment_id, file);
  if (!key) { await api.sendMessage(chat, "دانلود فایل از تلگرام نشد. یک بار دیگر بفرستید."); return { ok: true }; }
  const uid = await newUpload(env, ex, chat, file, key, f.assignment_id, "need_await", { flow: f.id });
  const up = { id: uid, filename: file.name, storage_key: key, mime: file.mime, size_bytes: file.size || null };
  if (pending.length === 1) return receiveAwaited(env, api, chat, ex, f.id, pending[0].i, up, null);

  /* چند تأمین‌کننده منتظرند: فقط همان‌ها دکمه می‌شوند */
  const kb = pending.map((w) => [{ text: `${short(w.s, 30)} · ${M((w.items || []).length)} قلم`, callback_data: `aw:${f.id}:s:${w.i}:${uid}` }]);
  kb.push([{ text: "✖️ این فایل را نمی‌خواهم", callback_data: `pf:${uid}:x:0` }]);
  const sent = await api.sendMessage(chat, `📎 <b>${esc(file.name)}</b>\n\nپیش‌فاکتورِ کدام‌یک از تأمین‌کنندگانِ منتظر است؟`, kb);
  await env.DB.prepare("UPDATE tg_uploads SET message_id=? WHERE id=?").bind(sent.message_id, uid).run();
  return { ok: true };
}

async function receiveAwaited(env, api, chat, ex, fid, idx, up, mid) {
  /* اتمی: دو فایلِ هم‌زمان هر کدام علامتِ خودش را می‌زند و علامتِ دیگری را پاک نمی‌کند */
  await env.DB.prepare(`UPDATE tg_flows SET data_json=json_set(data_json, '$.want[${Number(idx) | 0}].got', 1) WHERE id=? AND expert_id=?`).bind(fid, ex.id).run();
  const f = await env.DB.prepare("SELECT * FROM tg_flows WHERE id=?").bind(fid).first();
  const d = flowData(f), w = (d.want || [])[idx];
  if (!w) return { ok: true };
  if (!d.want.some((x) => !x.got)) await env.DB.prepare("UPDATE tg_flows SET step='done', done_at=? WHERE id=? AND done_at IS NULL").bind(now(), fid).run();
  await attachProforma(env, api, chat, ex, { aid: f.assignment_id, up, supplier: w.s, itemIds: w.items, out: null, mid });
  return awaitStatus(env, api, chat, f, null);
}

/* ------------------------------------------------------------------ */
/* کارت استعلام — چه خوانده شد، چه نه؛ پرکردن دستی؛ ثبت موقت           */
/*                                                                      */
/* بعد از خواندنِ خودکار یا فاکتور دستی، کارشناس همین‌جا می‌بیند کدام     */
/* فیلدها پر شده و کدام نه. هر خالی یک دکمه است: اجباری‌ها با ❌ و        */
/* اختیاری‌ها با ⚪. اختیاریِ خالی مانع ثبت نیست؛ اجباریِ خالی هست.       */
/* ------------------------------------------------------------------ */

/** خط‌های یک تأمین‌کننده در یک ارجاع، به ترتیب قلم */
async function supplierLines(env, aid, supplier) {
  return (await env.DB.prepare(
    `SELECT q.*, i.title AS item_title FROM quotes q JOIN items i ON i.id=q.item_id
     WHERE q.assignment_id=? AND q.supplier_name=? ORDER BY i.line_no, q.id`,
  ).bind(aid, supplier).all()).results || [];
}

/** یک خط استعلام، فقط اگر مال همین کارشناس باشد (INV-11) */
async function ownQuote(env, expertId, qid) {
  return env.DB.prepare(
    `SELECT q.*, a.request_id, i.title AS item_title FROM quotes q
     JOIN assignments a ON a.id=q.assignment_id JOIN items i ON i.id=q.item_id WHERE q.id=? AND a.expert_id=?`,
  ).bind(qid, expertId).first();
}

const filled = (v) => T(v) !== "";
const fieldLabel = (f) => (LABELS[f] || f).replace(" (ریال)", "").replace(" (روز)", "");

/**
 * کارت یک تأمین‌کننده. `messageId` اگر باشد همان پیام ویرایش می‌شود تا گفت‌وگو
 * پر از کارت‌های تکراری نشود؛ `head` یک خط خبر بالای کارت است («✅ ثبت شد»).
 */
async function quoteCard(env, api, chat, aid, supplier, messageId, head) {
  const lines = await supplierLines(env, aid, supplier);
  if (!lines.length) { await api.sendMessage(chat, "برای این تأمین‌کننده خط استعلامی نمانده."); return { ok: true }; }
  const q0 = lines[0];
  const a = await env.DB.prepare(
    "SELECT request_id, (SELECT COUNT(*) FROM quotes q WHERE q.assignment_id=assignments.id AND q.saved=1) AS saved_all FROM assignments WHERE id=?",
  ).bind(aid).first();

  const read = [], missReq = [], missOpt = [], kbReq = [], kbOpt = [];
  /* شرایط فاکتور — یک بار برای همهٔ خط‌ها */
  for (const f of PER_SUPPLIER) {
    if (f === "place_other") continue;
    const ok = filled(q0[f]) && !(f === "place" && q0.place === "سایر" && !filled(q0.place_other));
    const req = REQUIRED.includes(f);
    const shown = f === "place" && q0.place === "سایر" && filled(q0.place_other) ? q0.place_other : q0[f];
    if (ok) read.push(`${fieldLabel(f)}: ${esc(short(String(shown), 22))}`);
    else if (req) { missReq.push(fieldLabel(f)); kbReq.push({ text: `❌ ${fieldLabel(f)}`, callback_data: `qf:${q0.id}:${f}` }); }
    else { missOpt.push(fieldLabel(f)); kbOpt.push({ text: `⚪ ${fieldLabel(f)}`, callback_data: `qf:${q0.id}:${f}` }); }
  }
  /* فیلدهای هر قلم — خلاصه‌شده، و برای خالی‌ها دکمه با نام قلم */
  for (const f of PER_LINE) {
    const n = lines.filter((q) => filled(q[f])).length;
    if (n) read.push(`${fieldLabel(f)} ${M(n)}/${M(lines.length)}`);
  }
  for (const q of lines) {
    for (const f of PER_LINE) {
      if (filled(q[f])) continue;
      const req = REQUIRED.includes(f);
      if (!req && lines.length > 5) continue; /* اختیاریِ هر قلم در فهرست‌های بلند، در پنل */
      const lbl = `${fieldLabel(f)} — ${short(q.item_title, 18)}`;
      if (req) { missReq.push(lbl); kbReq.push({ text: `❌ ${lbl}`, callback_data: `qf:${q.id}:${f}` }); }
      else { missOpt.push(lbl); kbOpt.push({ text: `⚪ ${lbl}`, callback_data: `qf:${q.id}:${f}` }); }
    }
  }

  const savedN = lines.filter((q) => q.saved).length;
  const allSaved = savedN === lines.length;
  const lowN = lines.filter((q) => q.low_conf).length;

  /* اجباری‌ها هر کدام یک ردیف؛ اختیاری‌ها دوتا-دوتا تا کارت بلند نشود */
  const kb = kbReq.map((b) => [b]);
  for (let i = 0; i < kbOpt.length; i += 2) kb.push(kbOpt.slice(i, i + 2));
  /* تصمیم مدیر: حتی وقتی نام تأمین‌کننده دستی وارد شده، بقیهٔ فیلدها می‌تواند از پیش‌فاکتور بیاید */
  kb.push([{ text: "📎 دریافت پیش‌فاکتور (بقیه از فایل خوانده شود)", callback_data: `qw:${q0.id}:0` }]);
  kb.push([{ text: "✏️ اصلاح یک فیلد پرشده", callback_data: `qe:${q0.id}:0` }]);
  if (!allSaved) kb.push([{ text: missReq.length ? "✅ ثبت موقت (اول ❌ها را پر کنید)" : "✅ ثبت موقت", callback_data: `qs:${q0.id}:0` }]);
  if (a && a.saved_all > 0) kb.push([{ text: "📊 تولید جدول کمیسیون", callback_data: `ct:${aid}:start:0` }]);
  kb.push([{ text: "🧾 تب استعلامات", callback_data: `qt:${aid}` }], navRow(aid));

  const state = allSaved
    ? `✅ <b>همهٔ خط‌ها ثبت موقت شده‌اند.</b> حالا می‌توانید جدول کمیسیون را بسازید.`
    : missReq.length
      ? `⛔ برای ثبت موقت، فیلدهای ❌ باید پر شوند. روی هر کدام بزنید و مقدارش را بدهید.`
      : `همهٔ اجباری‌ها هستند؛ «ثبت موقت» را بزنید.${missOpt.length ? " اختیاری‌های خالی مانع نیستند." : ""}`;

  const text = `${head ? head + "\n\n" : ""}📋 <b>استعلام «${esc(supplier)}»</b> — درخواست <b>${esc(a ? a.request_id : "")}</b>\n`
    + `${M(lines.length)} قلم · ثبت‌شده ${M(savedN)} از ${M(lines.length)}${lowN ? ` · ${M(lowN)} قیمتِ کم‌اطمینان ⚠️` : ""}\n\n`
    + (read.length ? `✅ <b>پر شده:</b> ${read.join(" · ")}\n` : "")
    + (missReq.length ? `❌ <b>اجباری و خالی:</b> ${esc(missReq.join("، "))}\n` : "")
    + (missOpt.length ? `⚪ <b>اختیاری و خالی:</b> ${esc(missOpt.join("، "))}\n` : "")
    + `\n${state}`;

  if (messageId) {
    const r = await api.editMessageText(chat, messageId, text, kb).catch(() => null);
    if (r) return { ok: true };
  }
  await api.sendMessage(chat, text, kb);
  return { ok: true };
}

/** نوشتنِ یک فیلد: شرایط فاکتور روی همهٔ خط‌های تأمین‌کننده، فیلد قلم فقط روی همان خط. هر ویرایش «ثبت موقت» را برمی‌دارد — همان قاعدهٔ پنل. */
async function setField(env, q, field, value) {
  if (!LABELS[field]) throw new Error("فیلد ناشناخته");
  const v = value == null || value === "" ? null : (field === "qty" || field === "price" ? Number(value) : String(value));
  const t = now();
  if (PER_SUPPLIER.includes(field)) {
    await env.DB.prepare(`UPDATE quotes SET ${field}=?${field === "invoice" ? ", invoice_src='manual'" : ""}, saved=0, updated_at=? WHERE assignment_id=? AND supplier_name=?`)
      .bind(v, t, q.assignment_id, q.supplier_name).run();
  } else {
    await env.DB.prepare(`UPDATE quotes SET ${field}=?, saved=0, updated_at=? WHERE id=?`).bind(v, t, q.id).run();
  }
}

/** فیلد فهرستی: گزینه‌ها همان‌هایی که پنل دارد */
async function askEnum(api, chat, q, field, messageId) {
  const kb = ENUMS[field].map((v, i) => [{ text: v, callback_data: `qv:${q.id}:${field}:${i}` }]);
  kb.push([{ text: "↩️ برگشت", callback_data: `qc:${q.id}:0` }]);
  const text = `<b>${esc(fieldLabel(field))}</b> برای «${esc(q.supplier_name)}» را انتخاب کنید:`;
  if (messageId) { const r = await api.editMessageText(chat, messageId, text, kb).catch(() => null); if (r) return { ok: true }; }
  await api.sendMessage(chat, text, kb);
  return { ok: true };
}

const FIELD_HINTS = {
  price: "قیمت واحد را به <b>ریال</b> بنویسید — مثلاً <code>5605961</code>",
  qty: "مقدار را با عدد بنویسید — مثلاً <code>4</code>",
  unit: "واحد را بنویسید — مثلاً عدد، متر، کیلوگرم، شاخه",
  spec: "جنس یا مشخصات فنی را بنویسید",
  dtime: "زمان تحویل را بنویسید — مثلاً «۱۰ روز کاری» یا «۱۴۰۵/۰۷/۱۰»",
  valid_days: "اعتبار پیش‌فاکتور را به روز بنویسید — مثلاً <code>15</code>",
  ship: "روش حمل را بنویسید — مثلاً «با باربری، هزینه با خریدار»",
  place_other: "محل تحویل را بنویسید",
  supplier_code: "کد تأمین‌کننده را بنویسید",
};

/** فیلد متنی/عددی: یک گفت‌وگوی کوتاه؛ پاسخِ بعدیِ کارشناس همین را پر می‌کند */
async function askFieldText(env, api, chat, ex, q, field, messageId) {
  await closeInputs(env, ex.id);
  const t = now();
  const ins = await env.DB.prepare(
    "INSERT INTO tg_flows (expert_id,chat_id,kind,step,assignment_id,data_json,created_at,expires_at) VALUES (?,?,'field','need_value',?,?,?,?)",
  ).bind(ex.id, String(chat), q.assignment_id, JSON.stringify({ qid: q.id, field, mid: messageId || null }), t, t + FLOW_TTL).run();
  const scope = PER_LINE.includes(field) ? ` — ${esc(short(q.item_title, 40))}` : ` — همهٔ اقلام «${esc(short(q.supplier_name, 30))}»`;
  await api.sendMessage(chat, `✏️ <b>${esc(fieldLabel(field))}</b>${scope}\n\n${FIELD_HINTS[field] || "مقدار را بنویسید:"}`,
    [[{ text: "✖️ بی‌خیال", callback_data: `fl:${ins.meta.last_row_id}:x:0` }]]);
  return { ok: true };
}

/** پاسخ متنیِ کارشناس به یک فیلد */
async function onFieldText(env, api, chat, f, text) {
  const d = flowData(f);
  const q = await ownQuote(env, f.expert_id, d.qid);
  if (!q) { await env.DB.prepare("UPDATE tg_flows SET step='done', done_at=? WHERE id=?").bind(now(), f.id).run(); await api.sendMessage(chat, "این خط استعلام دیگر وجود ندارد."); return { ok: true }; }
  let v = text;
  if (d.field === "price" || d.field === "qty" || d.field === "valid_days") {
    const n = parsePrice(text);
    if (n == null) { await api.sendMessage(chat, "عدد را نفهمیدم. فقط رقم بنویسید — مثلاً <code>2500000</code>."); return { ok: true }; }
    v = d.field === "valid_days" ? String(Math.round(n)) : n;
  } else if (text.length > 200) { await api.sendMessage(chat, "خیلی بلند است؛ کوتاه‌ترش کنید."); return { ok: true }; }
  /* زمان تحویل فقط تاریخ شمسی یا عدد روز (تصمیم مدیر) — همان قاعدهٔ پنل */
  if (d.field === "dtime") {
    if (!validDtime(text)) { await api.sendMessage(chat, "زمان تحویل باید تاریخ شمسی (مثلاً <code>1405/07/10</code>) یا عدد روز (مثلاً <code>10</code> یا «۱۰ روز کاری») باشد."); return { ok: true }; }
    v = normalizeDtime(text);
  }
  await setField(env, q, d.field, v);
  await env.DB.prepare("UPDATE tg_flows SET step='done', done_at=? WHERE id=?").bind(now(), f.id).run();
  return quoteCard(env, api, chat, q.assignment_id, q.supplier_name, null, `✅ ${esc(fieldLabel(d.field))} ثبت شد.`);
}

/** فهرست همهٔ فیلدها برای اصلاحِ چیزی که مدل غلط خوانده */
async function editMenu(env, api, chat, q, messageId) {
  const lines = await supplierLines(env, q.assignment_id, q.supplier_name);
  const kb = [];
  const sup = PER_SUPPLIER.filter((f) => f !== "place_other");
  for (let i = 0; i < sup.length; i += 2) kb.push(sup.slice(i, i + 2).map((f) => ({ text: fieldLabel(f), callback_data: `qf:${q.id}:${f}` })));
  for (const l of lines.slice(0, 12)) kb.push([{ text: `قیمت — ${short(l.item_title, 22)}`, callback_data: `qf:${l.id}:price` }, { text: `مقدار`, callback_data: `qf:${l.id}:qty` }]);
  kb.push([{ text: "↩️ برگشت", callback_data: `qc:${q.id}:0` }]);
  const text = `✏️ کدام فیلد از «${esc(q.supplier_name)}» اصلاح شود؟`;
  if (messageId) { const r = await api.editMessageText(chat, messageId, text, kb).catch(() => null); if (r) return { ok: true }; }
  await api.sendMessage(chat, text, kb);
  return { ok: true };
}

/** ثبت موقتِ همهٔ خط‌های تأمین‌کننده — فقط اگر اجباری‌ها پرند (همان قاعدهٔ پنل) */
async function saveSupplier(env, api, chat, ex, q, messageId) {
  const lines = await supplierLines(env, q.assignment_id, q.supplier_name);
  const problems = [];
  for (const l of lines) {
    const miss = missingRequired(l);
    if (miss.length) problems.push(`• ${esc(short(l.item_title, 24))}: ${esc(miss.map(fieldLabel).join("، "))}`);
    for (const b of validateQuote(l)) problems.push(`• ${esc(short(l.item_title, 24))}: ${esc(b.message)}`);
  }
  if (problems.length) return quoteCard(env, api, chat, q.assignment_id, q.supplier_name, messageId, `⛔ <b>ثبت موقت نشد</b> — این‌ها خالی‌اند:\n${problems.join("\n")}`);
  const t = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE quotes SET saved=1, updated_at=? WHERE assignment_id=? AND supplier_name=?").bind(t, q.assignment_id, q.supplier_name),
    env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)")
      .bind(t, `expert:${ex.id}`, "quote_saved", q.request_id, JSON.stringify({ assignment_id: q.assignment_id, supplier: q.supplier_name, lines: lines.length, channel: "telegram" })),
  ]);
  return quoteCard(env, api, chat, q.assignment_id, q.supplier_name, messageId, `✅ ${M(lines.length)} خط استعلام «${esc(q.supplier_name)}» ثبت موقت شد.`);
}

/* ------------------------------------------------------------------ */
/* جدول کمیسیون — انتخاب خط‌ها، درج توضیحات، ساختِ مکانیکی، بدون مدل     */
/* ------------------------------------------------------------------ */

/**
 * منوی «تولید». هر خط یک تیکِ «تأیید نهایی» پنل است؛ «درج توضیحات» همان متنی
 * است که در بخش «توضیحات تدارکات و پشتیبانی» جدول چاپ می‌شود.
 */
async function tableSelect(env, api, chat, ex, aid, messageId, head) {
  const own = await env.DB.prepare("SELECT id, request_id, notes FROM assignments WHERE id=? AND expert_id=?").bind(aid, ex.id).first();
  if (!own) { await api.sendMessage(chat, "این ارجاع متعلق به شما نیست."); return { ok: true }; }
  const top = `${head ? head + "\n\n" : ""}📊 <b>جدول کمیسیون — درخواست ${esc(own.request_id)}</b>\n\n`;
  const lines = (await env.DB.prepare(
    `SELECT q.id, q.supplier_name, q.price, q.final, i.title FROM quotes q JOIN items i ON i.id=q.item_id
     WHERE q.assignment_id=? AND q.saved=1 ORDER BY q.supplier_name, i.line_no LIMIT 60`,
  ).bind(aid).all()).results || [];
  if (!lines.length) {
    return show(api, chat, messageId, top + "هنوز هیچ خط استعلامِ ثبت‌موقت‌شده‌ای نیست. اول در تب استعلامات فیلدها را کامل و «ثبت موقت» کنید.",
      [[{ text: "🧾 تب استعلامات", callback_data: `qt:${aid}` }], navRow(aid)]);
  }
  const n = lines.filter((l) => l.final).length;
  const kb = lines.map((l) => [{
    text: `${l.final ? "☑" : "☐"} ${short(l.supplier_name, 14)} — ${short(l.title, 16)} — ${money(l.price)}`,
    callback_data: `ct:${aid}:t:${l.id}`,
  }]);
  kb.push([{ text: "☑ همه", callback_data: `ct:${aid}:all:0` }, { text: "☐ هیچ", callback_data: `ct:${aid}:none:0` }]);
  kb.push([{ text: own.notes ? "📝 ویرایش توضیحات" : "📝 درج توضیحات", callback_data: `ct:${aid}:nt:0` }]);
  kb.push([{ text: `📊 تولید جدول کمیسیون (${M(n)} خط)`, callback_data: `ct:${aid}:go:0` }]);
  kb.push([{ text: "🧾 تب استعلامات", callback_data: `qt:${aid}` }], navRow(aid));
  return show(api, chat, messageId, top
    + "کدام استعلام‌ها در جدول بیایند؟ روی هر خط بزنید تا انتخاب یا لغو شود (همان «تأیید نهایی» پنل).\n"
    + `<b>${M(n)}</b> از ${M(lines.length)} خط انتخاب شده.\n\n`
    + `📝 <b>توضیحات:</b> ${own.notes ? `<i>${esc(short(own.notes, 600))}</i>` : "— خالی"}`, kb);
}

/** «درج توضیحات»: پاسخِ متنیِ بعدی، توضیحاتِ جدول می‌شود (جایگزینِ متن قبلی) */
async function notesAsk(env, api, chat, ex, aid) {
  const own = await env.DB.prepare("SELECT id, request_id, notes FROM assignments WHERE id=? AND expert_id=?").bind(aid, ex.id).first();
  if (!own) { await api.sendMessage(chat, "این ارجاع متعلق به شما نیست."); return { ok: true }; }
  await closeInputs(env, ex.id);
  const f = await newFlow(env, ex, chat, "notes", "need_notes", aid, {});
  await api.sendMessage(chat, `📝 <b>توضیحات جدول کمیسیون</b> — درخواست <b>${esc(own.request_id)}</b>\n\n`
    + (own.notes
      ? `متن فعلی:\n<i>${esc(own.notes)}</i>\n\nمتن تازه را بنویسید (جایگزین می‌شود):`
      : "توضیحاتتان را بنویسید؛ در بخش «توضیحات تدارکات و پشتیبانی» جدول چاپ می‌شود:"),
  [[{ text: "✖️ بی‌خیال", callback_data: `fl:${f.id}:x:0` }]]).catch(() => {});
  return { ok: true };
}

/**
 * ساختن و فرستادن جدول کمیسیون — همان کدِ مکانیکیِ sheets.js و همان نگهبانِ پنل.
 * تولید جدول درخواست را **نمی‌بندد**: فقط مرحلهٔ «جدول کمیسیون» سبز می‌شود و
 * درخواست تا «خاتمه» در کارتابل می‌ماند. هشدار عبور از مهلت هم می‌ماند؛ فقط
 * یادآوری‌های مرحله بی‌معنی شده‌اند.
 */
async function makeTable(env, api, chat, ex, aid, messageId) {
  const settings = await getSettings(env);
  const d = await bundleData(env, aid, settings, env.COMPANY || "تونل سد آریانا");
  if (d.assignment.expert_id !== ex.id) { await api.sendMessage(chat, "این ارجاع متعلق به شما نیست."); return { ok: true }; }
  const g = await commissionGuard(env, aid, settings);
  if (!g.finals) return tableSelect(env, api, chat, ex, aid, messageId, "⛔ هیچ خطی انتخاب نشده؛ دست‌کم یکی را تیک بزنید.");
  if (g.missing.length) {
    return tableSelect(env, api, chat, ex, aid, messageId,
      `⛔ مدیر برای هر قلم دست‌کم ${M(g.need)} استعلامِ ثبت‌موقت‌شده خواسته. این‌ها کم دارند:\n`
      + g.missing.slice(0, 8).map((x) => `• ${esc(short(x.title, 40))} (${M(x.n)})`).join("\n"));
  }
  const st = readiness(d);
  const finals = d.quotes.filter((q) => q.final && q.saved);
  const t = now();
  /* شمارهٔ ترتیبی فرم (TSA-PS-FO-n) پیش از ساختن فایل داده می‌شود تا روی خودِ برگه بنشیند؛ عکسِ جدول هم ثبت می‌شود */
  d.commission_no = await recordCommission(env, aid, { expertId: ex.id, channel: "telegram" });
  await env.DB.batch([
    env.DB.prepare("UPDATE alerts SET canceled_at=? WHERE assignment_id=? AND kind='stage' AND fired_at IS NULL AND canceled_at IS NULL").bind(t, aid),
    env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)")
      .bind(t, `expert:${ex.id}`, "commission_table", d.request.id, JSON.stringify({ assignment_id: aid, lines: finals.length, commission_no: d.commission_no, channel: "telegram" })),
  ]);
  if (messageId) await api.editMessageText(chat, messageId, `📊 جدول کمیسیون درخواست <b>${esc(d.request.id)}</b> با <b>${M(finals.length)}</b> خط ساخته شد.`).catch(() => {});

  let sent = true;
  try {
    await api.sendDocument(chat, `کمیسیون-${d.request.id}.xlsx`, await commissionXlsx({ ...d, notes: d.assignment.notes }),
      `📊 <b>جدول مقایسه استعلام بها — ${esc(d.request.id)}</b> · کد TSA-PS-FO-${M(d.commission_no)}\n${M(finals.length)} خط · ${M(st.suppliers)} تأمین‌کننده`);
  } catch (e) { sent = false; }

  const warn = [];
  if (!sent) warn.push("⚠️ فایل به تلگرام نرسید؛ در «تحویل» یا پنل دوباره می‌گیرید.");
  if (st.itemsMissing.length) warn.push(`⚠️ ${M(st.itemsMissing.length)} قلم هنوز قیمت تأییدشده ندارد: ${esc(st.itemsMissing.slice(0, 4).join("، "))}`);
  if (!st.hasNotes) warn.push("📝 توضیحات جدول خالی است — «جدول کمیسیون» ← «درج توضیحات».");
  /* تصمیم مدیر: کنار «تحویل»، همان‌جا «تولید نامه» هم هست */
  return show(api, chat, null, `✅ <b>جدول کمیسیون تولید شد.</b>${warn.length ? "\n" + warn.join("\n") : ""}\n\nدرخواست تا «خاتمه» در کارتابل می‌ماند. قدم بعد؟`, [
    [{ text: "📦 تحویل", callback_data: `dvo:${aid}` }, { text: "✉️ تولید نامه", callback_data: `rq:${aid}:l` }],
    [{ text: "🔒 خاتمه (تأیید کمیسیون)", callback_data: `cm:${aid}:card:0` }],
    [{ text: "📊 جدول کمیسیون", callback_data: `ct:${aid}:start:0` }],
    navRow(aid),
  ]);
}

/**
 * کارتِ «تأیید کمیسیون و خاتمه».
 *
 * اقلامِ بازِ درخواست چندانتخابی‌اند: کارشناس هر کدام را که کمیسیون تأیید کرده
 * تیک می‌زند و «خاتمه» را می‌زند. فقط همان‌ها بسته می‌شوند؛ اگر همه بودند درخواست
 * از کارتابل می‌رود، وگرنه با باقی اقلام در جریان می‌ماند.
 */
async function closeCard(env, api, chat, ex, aid, messageId, head) {
  const own = await env.DB.prepare("SELECT id, request_id FROM assignments WHERE id=? AND expert_id=?").bind(aid, ex.id).first();
  if (!own) { await api.sendMessage(chat, "این ارجاع متعلق به شما نیست."); return { ok: true }; }
  const its = (await env.DB.prepare(
    "SELECT id, title, qty, unit, commission_ok FROM items WHERE assignment_id=? AND state='open' ORDER BY line_no LIMIT 40",
  ).bind(aid).all()).results || [];
  if (!its.length) return show(api, chat, messageId, "این درخواست قلمِ بازی ندارد.", [[KARTABL_BTN]]);
  const n = its.filter((i) => i.commission_ok).length;
  const s = await getSettings(env);

  const kb = its.map((i) => [{
    text: `${i.commission_ok ? "☑" : "☐"} ${short(i.title, 30)}${i.qty != null ? ` — ${M(i.qty)} ${i.unit || ""}` : ""}`,
    callback_data: `cm:${aid}:t:${i.id}`,
  }]);
  kb.push([{ text: "☑ همه", callback_data: `cm:${aid}:all:0` }, { text: "☐ هیچ", callback_data: `cm:${aid}:none:0` }]);
  kb.push([{ text: `🔒 خاتمه (${M(n)} قلم)`, callback_data: `cm:${aid}:end:0` }]);
  kb.push([{ text: "📦 تحویل", callback_data: `dvo:${aid}` }], navRow(aid));

  return show(api, chat, messageId, `${head ? head + "\n\n" : ""}🧾 <b>تأیید کمیسیون — درخواست ${esc(own.request_id)}</b>\n\n`
    + "کدام اقلام را کمیسیون تأیید کرد؟ روی هر قلم بزنید تا تیک بخورد؛ بعد «خاتمه».\n"
    + `<b>${M(n)}</b> از ${M(its.length)} قلم تیک خورده.\n\n`
    + (s.approvalRequired
      ? "<i>چون «تصمیم کارشناس منوط به تأیید مدیر» فعال است، خاتمه اول برای مدیر می‌رود.</i>"
      : "<i>«خاتمه» همان لحظه اقلامِ تیک‌خورده را می‌بندد؛ اگر همه بودند، درخواست از کارتابل می‌رود.</i>"), kb);
}

/** خلاصهٔ خوانا از خروجی مدل، تا کارشناس پیش از ثبت ببیند چه چیزی قرار است بنشیند */
function extractSummary(r, itemTitles) {
  if (!r.extractable) {
    return `⚠️ <b>نتوانستم مطمئن بخوانم</b>\n\nدلیل: <b>${esc(REFUSAL_FA[r.reason] || r.reason || "نامشخص")}</b>\n\n`
      + `${r.notes ? esc(r.notes) + "\n\n" : ""}قیمت‌ها را روی کارت استعلام دستی وارد کنید.`;
  }
  const matched = (r.lines || []).filter((l) => l.matched_item_id);
  const other = (r.lines || []).filter((l) => !l.matched_item_id);
  const cur = r.currency || "نامشخص";
  const body = matched.map((l) => {
    const title = esc(itemTitles.get(l.matched_item_id) || l.title);
    return `• ${title}\n   ${money(l.unit_price)} ${esc(cur)}${l.confidence === "high" ? " ✓" : " ⚠️"}`;
  }).join("\n");

  const rotated = r.orientation && r.orientation !== "upright";

  return `🤖 <b>خوانده شد</b>\n\n`
    + (rotated ? `⚠️ <b>این اسکن چرخیده است.</b> خواندمش، ولی اگر صاف بفرستید دقتش خیلی بیشتر می‌شود.\n\n` : "")
    + `${r.supplier_name ? `تأمین‌کننده: <b>${esc(r.supplier_name)}</b>\n` : ""}`
    + `واحد پول: <b>${esc(cur)}</b>\n\n${body || "<i>هیچ سطری با اقلام درخواست تطبیق نخورد.</i>"}\n`
    + (other.length ? `\n<i>${M(other.length)} سطر دیگر در فاکتور بود که به اقلام این درخواست نمی‌خورد و ثبت نمی‌شود.</i>\n` : "")
    + (r.valid_days ? `\nاعتبار: ${M(r.valid_days)} روز` : "")
    + (r.delivery_date ? `\nتحویل: ${esc(r.delivery_date)}` : "")
    + (r.pay_terms ? `\nتسویه: ${esc(r.pay_terms)}` : "")
    + (r.ship_method ? `\nحمل: ${esc(r.ship_method)}` : "")
    + (r.invoice_type ? `\nنوع فاکتور: ${esc(r.invoice_type)}` : "")
    + (r.place ? `\nمحل تحویل: ${esc(r.place === "سایر" && r.place_other ? r.place_other : r.place)}` : "")
    + ((r.unreadable_fields || []).length ? `\n\n⚠️ خوانا نبود: ${esc(r.unreadable_fields.join("، "))}` : "")
    + (r.notes ? `\n\n${esc(r.notes)}` : "")
    + `

✓ = مدل مطمئن بوده · ⚠️ = مطمئن نبوده، خودتان نگاه کنید.
قیمت‌ها در پنل قابل اصلاح‌اند.`;
}

/**
 * خلاصهٔ خوانده‌شده را نشان می‌دهد و دکمهٔ ثبت می‌گذارد.
 *
 * دکمه فقط وقتی می‌آید که واقعاً چیزی برای نوشتن باشد؛ همان شرطی که
 * applyExtraction هم دارد — از جمله ته‌مانده‌ی «یک قلم، یک سطر» که خودش وصل
 * می‌شود. `itemIds` اگر باشد، فقط اقلامی که کارشناس برای این پیش‌فاکتور تیک
 * زده به حساب می‌آیند (همان محدودیتی که ثبت هم دارد).
 */
async function presentExtraction(env, api, chat, pid, r, aid, itemIds) {
  const only = idList(itemIds);
  const items = ((await env.DB.prepare("SELECT id, title FROM items WHERE assignment_id=?").bind(aid).all()).results || [])
    .filter((i) => !only.length || only.includes(i.id));
  const titles = new Map(items.map((i) => [i.id, i.title]));
  const priced = (r.lines || []).filter((l) => lineUnitPrice(l) != null);
  const sole = titles.size === 1 && priced.length === 1 && !(priced[0].matched_item_id && titles.has(priced[0].matched_item_id));
  const canApply = r.extractable && (priced.some((l) => l.matched_item_id && titles.has(l.matched_item_id)) || sole);

  const has = await env.DB.prepare("SELECT COUNT(*) AS n FROM quotes q JOIN proformas p ON p.assignment_id=q.assignment_id AND p.supplier_name=q.supplier_name WHERE p.id=?").bind(pid).first();
  const label = has && has.n ? "ثبت در جدول" : "ساختن خط استعلام";

  const kb = [];
  if (canApply) {
    if (r.currency) kb.push([{ text: `✅ ${label} (${r.currency})`, callback_data: `ai:${pid}:ok:0` }]);
    else {
      /* مدل واحد پول را نفهمیده — کارشناس باید صریح بگوید، وگرنه خطای ده‌برابری */
      kb.push([{ text: `${label} — ریال`, callback_data: `ai:${pid}:r:0` },
        { text: `${label} — تومان`, callback_data: `ai:${pid}:t:0` }]);
    }
  }
  kb.push([{ text: "✍️ کارت استعلام (پرکردن دستی)", callback_data: `qk:${pid}` }]);
  kb.push([{ text: "🧾 تب استعلامات", callback_data: `qt:${aid}` }]);
  await api.sendMessage(chat, extractSummary(r, titles)
    + (sole ? "\n\n<i>این سند یک سطر قیمت دارد و این پیش‌فاکتور هم یک قلم؛ به همان وصل می‌شود.</i>" : "")
    + (r.extractable ? `\n\n<i>تا وقتی «${label}» را نزنید، چیزی در جدول کمیسیون نمی‌نشیند.</i>` : ""), kb).catch(() => {});
  return { ok: true };
}

async function onExtract(env, api, chat, ex, pid, step, val, messageId) {
  const p = await env.DB.prepare(
    "SELECT p.*, a.expert_id, a.request_id FROM proformas p JOIN assignments a ON a.id=p.assignment_id WHERE p.id=?",
  ).bind(pid).first();
  if (!p || p.expert_id !== ex.id) { await api.sendMessage(chat, "این پیش‌فاکتور متعلق به شما نیست."); return { ok: true }; }

  if (step === "go") {
    const store = storage(env);
    if (!store || !store.signedUrl) { await api.sendMessage(chat, "انبار فایل فعلی از استخراج خودکار پشتیبانی نمی‌کند."); return { ok: true }; }
    await api.sendMessage(chat, "⏳ در حال خواندن پیش‌فاکتور…").catch(() => {});
    let out;
    try { out = await runExtraction(env, store, p); }
    catch (e) {
      await api.sendMessage(chat, `خواندن نشد: ${esc(e.message)}`, [
        [{ text: "🔁 دوباره بخوان", callback_data: `ai:${pid}:go:0` }],
        [{ text: "✍️ پرکردن دستی روی کارت استعلام", callback_data: `qk:${pid}` }],
      ]).catch(() => {});
      return { ok: true };
    }
    return presentExtraction(env, api, chat, pid, out.result, p.assignment_id, p.item_ids);
  }

  if (step === "ok" || step === "r" || step === "t") {
    const currency = step === "r" ? "ریال" : step === "t" ? "تومان" : null;
    try {
      const res = await applyExtraction(env, p, currency ? { currency } : {});
      const head = `✅ ${M(res.applied)} قلم از پیش‌فاکتور در جدول نشست.`
        + (res.created ? `\n${M(res.created)} خط استعلام تازه به نام <b>${esc(res.supplier)}</b> ساخته شد.` : "")
        + (res.skipped ? `\n${M(res.skipped)} سطر تطبیق نخورد و ثبت نشد.` : "")
        + (res.unsaved ? `\n${M(res.unsaved)} خط هنوز ثبت موقت نشده — چیزی کم دارد.` : "");
      return quoteCard(env, api, chat, p.assignment_id, res.supplier, null, head);
    } catch (e) { await api.sendMessage(chat, `ثبت نشد: ${esc(e.message)}`); }
    return { ok: true };
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* نامهٔ پیوست کمیسیون — از صدا یا نوشتهٔ کارشناس                        */
/*                                                                      */
/* توضیح (صوتی یا نوشتاری) ← تأیید متن ← انتخاب اقلامِ موضوع ← نگارش.     */
/* مخاطب، «موضوع: گزارش خرید …» و «با تشکر» را سامانه می‌گذارد (letter.js). */
/* ------------------------------------------------------------------ */

/* نامهٔ نیمه‌کارهٔ کهنه‌تر از این، متن یا صوتِ آزادِ کارشناس را نمی‌بلعد */
const LETTER_FRESH = 24 * 3600000;

/** تحویلی که منتظر ساخته شدنِ نامهٔ همین درخواست است (اگر هست) */
async function deliverWaiting(env, ex, aid) {
  return env.DB.prepare(
    "SELECT * FROM tg_flows WHERE expert_id=? AND kind='deliver' AND step='letter' AND assignment_id=? AND done_at IS NULL AND expires_at>? ORDER BY id DESC LIMIT 1",
  ).bind(ex.id, aid, now()).first();
}

/** `skip` اگر باشد، نامه وسط «تحویل» خواسته شده و لغوش تحویل را بی‌نامه ادامه می‌دهد */
async function startLetter(env, api, chat, ex, aid, { skip } = {}) {
  const a = await env.DB.prepare("SELECT id, request_id FROM assignments WHERE id=? AND expert_id=?").bind(aid, ex.id).first();
  if (!a) { await api.sendMessage(chat, "این ارجاع متعلق به شما نیست."); return { ok: true }; }
  const t = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE letters SET state='canceled', updated_at=? WHERE assignment_id=? AND state IN ('need_voice','transcribed')").bind(t, aid),
    env.DB.prepare("INSERT INTO letters (assignment_id,expert_id,state,created_at,updated_at) VALUES (?,?,'need_voice',?,?)").bind(aid, ex.id, t, t),
  ]);
  await api.sendMessage(chat,
    `✉️ <b>نامهٔ پیوست — درخواست ${esc(a.request_id)}</b>\n\n`
    + (skip ? "نامه هنوز ساخته نشده. اگر نامه می‌خواهید، " : "")
    + "توضیح بدهید در جریان این خرید چه اتفاقی افتاده: چه چالشی داشتید، چرا این تأمین‌کننده، چه چیزی طول کشید.\n\n"
    + "🎤 <b>یک پیام صوتی بفرستید</b> — یا اگر راحت‌تر است، <b>همین‌جا تایپ کنید</b>.\n\n"
    + "<i>محاوره‌ای و به زبان خودتان بگویید؛ متنِ رسمی نامه را من می‌نویسم. بعدش اقلامِ موضوعِ نامه را انتخاب می‌کنید.</i>",
    [[skip ? { text: "✖️ نامه نمی‌خواهم — ادامهٔ تحویل", callback_data: skip } : { text: "✖️ بی‌خیال", callback_data: `lt:${aid}:x:0` }]]);
  return { ok: true };
}

/* تأیید متن پیش از نگارش: اگر رونویسی اشتباه شنیده باشد، نامه هم غلط می‌شود */
const letterConfirmKb = (L) => [
  [{ text: "✅ درست است — انتخاب اقلامِ موضوع", callback_data: `lt:${L.id}:go:0` }],
  [{ text: "✏️ از نو می‌گویم", callback_data: `lt:${L.assignment_id}:ask:0` }],
  [{ text: "✖️ بی‌خیال", callback_data: `lt:${L.assignment_id}:x:0` }],
];

/**
 * همان جای صوت، ولی نوشته. بعضی کارشناس‌ها جایی هستند که نمی‌شود حرف زد، یا
 * ترجیح می‌دهند بنویسند. ورودی هرچه باشد، از این نقطه به بعد مسیر یکی است.
 */
async function onLetterText(env, api, chat, ex, L, text) {
  if (text.length < 15) { await api.sendMessage(chat, "کمی بیشتر توضیح بدهید تا بشود از آن نامه ساخت."); return { ok: true }; }
  if (text.length > 4000) { await api.sendMessage(chat, "متن خیلی بلند است؛ خلاصه‌ترش کنید."); return { ok: true }; }
  await env.DB.prepare("UPDATE letters SET transcript=?, state='transcribed', updated_at=? WHERE id=?").bind(text, now(), L.id).run();
  await api.sendMessage(chat, `📄 <b>این را می‌نویسم:</b>\n\n<i>${esc(text)}</i>\n\nدرست است؟`, letterConfirmKb(L));
  return { ok: true };
}

/** پیام صوتی رسید: ذخیره، رونویسی، و نشان دادن متن برای تأیید */
async function onVoice(env, msg, ex) {
  const api = telegram(env);
  const chat = msg.chat.id;
  const pending = await env.DB.prepare(
    "SELECT * FROM letters WHERE expert_id=? AND state='need_voice' AND updated_at>? ORDER BY id DESC LIMIT 1",
  ).bind(ex.id, now() - LETTER_FRESH).first();
  if (!pending) { await api.sendMessage(chat, "الان منتظر پیام صوتی نبودم.\nاگر نامه می‌خواهید، /nameh را بزنید."); return { ok: true }; }
  const store = storage(env);
  if (!store || !store.signedUrl) { await api.sendMessage(chat, "انبار فایل برای صوت آماده نیست؛ توضیحتان را همین‌جا تایپ کنید."); return { ok: true }; }

  const v = msg.voice || msg.audio;
  if (v.file_size > MAX_BYTES) { await api.sendMessage(chat, "این صوت خیلی بلند است؛ کوتاه‌ترش کنید."); return { ok: true }; }

  /* پیام‌های «در حال انجام» تزئینی‌اند؛ شکستشان نباید کار را متوقف کند */
  await api.sendMessage(chat, "⏳ در حال گوش دادن…").catch(() => {});
  const f = await api.getFile(v.file_id);
  const src = await fetch(api.fileUrl(f.file_path));
  if (!src.ok || !src.body) { await api.sendMessage(chat, "دانلود صوت نشد؛ دوباره بفرستید."); return { ok: true }; }
  const key = storageKey(pending.assignment_id, `voice-${pending.id}.ogg`);
  await store.put(key, src.body, { contentType: v.mime_type || "audio/ogg", size: v.file_size || undefined });

  let text;
  try {
    const url = await store.signedUrl(key, 900);
    text = (await transcribe(env, url)).text;
  } catch (e) {
    /* نامه منتظر می‌ماند تا کارشناس همان توضیح را تایپ کند یا دوباره ضبط کند */
    await env.DB.prepare("UPDATE letters SET voice_key=?, updated_at=? WHERE id=?").bind(key, now(), pending.id).run();
    await api.sendMessage(chat, `صوت به متن تبدیل نشد: ${esc(e.message)}\n\nهمین توضیح را همین‌جا تایپ کنید، یا دوباره ضبط کنید.`);
    return { ok: true };
  }
  if (!text || text.length < 15) {
    await api.sendMessage(chat, "چیزی نشنیدم یا خیلی کوتاه بود. یک بار دیگر و کمی واضح‌تر بفرستید.");
    return { ok: true };
  }
  await env.DB.prepare("UPDATE letters SET voice_key=?, voice_secs=?, transcript=?, state='transcribed', updated_at=? WHERE id=?")
    .bind(key, v.duration || null, text, now(), pending.id).run();
  await api.sendMessage(chat, `📄 <b>این را شنیدم:</b>\n\n<i>${esc(text)}</i>\n\nدرست است؟`, letterConfirmKb(pending));
  return { ok: true };
}

/** بعد از تأیید متن: موضوع نامه = «گزارش خرید» + اقلامِ انتخابی با «و» میانشان */
async function letterSubjectCard(env, api, chat, ex, L, mid) {
  const its = (await env.DB.prepare("SELECT id, title FROM items WHERE assignment_id=? ORDER BY line_no LIMIT 40").bind(L.assignment_id).all()).results || [];
  const a = await env.DB.prepare("SELECT request_id FROM assignments WHERE id=?").bind(L.assignment_id).first();
  /* پیش‌فرض: اقلامی که در جدول کمیسیون تأیید نهایی دارند */
  const fin = new Set(((await env.DB.prepare("SELECT DISTINCT item_id FROM quotes WHERE assignment_id=? AND saved=1 AND final=1").bind(L.assignment_id).all()).results || []).map((r) => r.item_id));
  const f = await newFlow(env, ex, chat, "lsub", "pick", L.assignment_id, { letterId: L.id, rid: a ? a.request_id : "", sel: its.filter((i) => fin.has(i.id)).map((i) => i.id) });
  return letterSubjectRender(api, chat, f, flowData(f), its, mid);
}

function letterSubjectRender(api, chat, f, d, its, mid) {
  const sel = new Set(d.sel || []);
  const kb = its.map((i) => [{ text: `${sel.has(i.id) ? "☑" : "☐"} ${short(i.title, 34)}`, callback_data: `ls:${f.id}:t:${i.id}` }]);
  if (its.length > 1) kb.push([{ text: sel.size === its.length ? "☐ هیچ" : "☑ همه", callback_data: `ls:${f.id}:all:0` }]);
  kb.push([{ text: `✍️ نوشتن نامه${sel.size ? ` (${M(sel.size)} قلم)` : ""}`, callback_data: `ls:${f.id}:go:0` }]);
  const titles = its.filter((i) => sel.has(i.id)).map((i) => i.title);
  return show(api, chat, mid, "✉️ <b>موضوع نامه</b>\n\nنامه دربارهٔ کدام اقلام است؟ هر چند قلم را تیک بزنید.\n\n"
    + `<b>موضوع:</b> ${titles.length ? esc(letterSubject(titles, d.rid)) : "—"}`, kb);
}

/** نگارش نامه و ساخت فایل Word روی سربرگ؛ اگر تحویلی منتظرش بود، همان‌جا ادامه می‌دهد */
async function makeLetter(env, api, chat, ex, letterId, subjectTitles) {
  const L = await env.DB.prepare("SELECT * FROM letters WHERE id=? AND expert_id=?").bind(letterId, ex.id).first();
  if (!L || !L.transcript || L.state !== "transcribed") { await api.sendMessage(chat, "این نامه قبلاً نوشته یا لغو شده است.").catch(() => {}); return { ok: true }; }
  const store = storage(env);
  const dw = await deliverWaiting(env, ex, L.assignment_id);
  const failKb = dw ? [[{ text: "📦 ادامهٔ تحویل بدون نامه", callback_data: `dv:${dw.id}:nl:0` }]] : [];
  await api.sendMessage(chat, "✍️ در حال نوشتن نامه…").catch(() => {});

  const settings = await getSettings(env);
  const d = await bundleData(env, L.assignment_id, settings, env.COMPANY || "تونل سد آریانا");
  let out;
  try {
    /* همان قاعدهٔ جدول کمیسیون: فقط استعلام‌های تیک‌خورده و قلم‌هایی که آن‌ها قیمت داده‌اند */
    out = await writeLetter(env, {
      transcript: L.transcript, request: d.request, items: d.items, quotes: d.quotes, allItems: d.items,
      notes: d.assignment.notes, expert: d.expert, expertName: d.expertName, company: d.company, subjectTitles,
    });
  } catch (e) {
    await env.DB.prepare("UPDATE letters SET state='failed', updated_at=? WHERE id=?").bind(now(), L.id).run();
    /* خطای letter.js خودش با «نگارش نامه نشد» شروع می‌شود */
    await api.sendMessage(chat, `نگارش نامه نشد: ${esc(String(e.message || "").replace(/^نگارش نامه نشد:\s*/, ""))}`, failKb);
    return { ok: true };
  }

  const letter = { ...out.letter, date: d.date, number: null };
  let docxKey = null;
  try {
    if (!store) throw new Error("انبار فایل وصل نیست.");
    const tpl = await store.get("_templates/letterhead.docx");
    if (!tpl) throw new Error("سربرگ در انبار پیدا نشد.");
    const blob = await renderLetter(await new Response(tpl.body).arrayBuffer(), letter);
    docxKey = storageKey(L.assignment_id, `letter-${L.id}.docx`);
    await store.put(docxKey, blob, { contentType: DOCX_MIME });
  } catch (e) {
    /* نامه نوشته شده ولی فایلش ساخته نشد — متن را از دست ندهیم */
    await env.DB.prepare("UPDATE letters SET letter_json=?, meta_json=?, state='written', updated_at=? WHERE id=?")
      .bind(JSON.stringify(letter), JSON.stringify(out.meta), now(), L.id).run();
    await api.sendMessage(chat, `نامه نوشته شد ولی فایل Word ساخته نشد: ${esc(e.message)}\nمتنش در پنل هست.`, failKb);
    return { ok: true };
  }

  await env.DB.batch([
    env.DB.prepare("UPDATE letters SET letter_json=?, docx_key=?, meta_json=?, state='written', updated_at=? WHERE id=?")
      .bind(JSON.stringify(letter), docxKey, JSON.stringify(out.meta), now(), L.id),
    env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)")
      .bind(now(), `expert:${ex.id}`, "letter", d.request.id, JSON.stringify({ assignment_id: L.assignment_id, letter_id: L.id, channel: "telegram" })),
  ]);

  /* وسط تحویل، نامه همراهِ بقیهٔ اسناد می‌رود؛ بیرون از آن، همین حالا */
  if (!dw) {
    const file = await store.get(docxKey);
    await api.sendDocument(chat, `نامه-${d.request.id}.docx`, new Blob([await new Response(file.body).arrayBuffer()], { type: DOCX_MIME }),
      `📝 <b>${esc(letter.subject)}</b>\n\nاگر متنش را می‌پسندید همین را پیوست کنید؛ وگرنه در Word اصلاحش کنید.`).catch(() => {});
  }
  if (out.letter.uncertain && out.letter.uncertain.length) {
    await api.sendMessage(chat, `⚠️ این‌ها در صحبتتان روشن نبود و در نامه نیامد:\n${out.letter.uncertain.map((u) => "• " + esc(u)).join("\n")}`).catch(() => {});
  }
  /* عددی که مدل خودش نوشته و در دادهٔ سامانه نیست، پیش از پیوست کردن باید دیده شود */
  const mt = out.meta || {};
  if ((mt.suspicious || []).length || (mt.unresolved || []).length) {
    await api.sendMessage(chat, "⚠️ <b>پیش از پیوست کردن، این‌ها را در نامه چک کنید:</b>\n"
      + ((mt.suspicious || []).length ? `• عددهایی که از دادهٔ سامانه نیامده‌اند: <b>${esc(mt.suspicious.join("، "))}</b>\n` : "")
      + ((mt.unresolved || []).length ? `• جای‌خالیِ حل‌نشده (با «—» پر شد): ${esc(mt.unresolved.join("، "))}\n` : "")
      + `\nنامه بر پایهٔ ${M(mt.items || 0)} قلمِ تیک‌خورده و ${M(mt.suppliers || 0)} تأمین‌کننده نوشته شده — همان جدول کمیسیون.`).catch(() => {});
  }
  if (dw) {
    await api.sendMessage(chat, `✅ نامه نوشته شد: <b>${esc(letter.subject)}</b>`).catch(() => {});
    return deliverNext(env, api, chat, ex, dw, flowData(dw), null);
  }
  await api.sendMessage(chat, `✅ نامه آماده است: <b>${esc(letter.subject)}</b>`, [[{ text: "📦 تحویل", callback_data: `dvo:${L.assignment_id}` }], navRow(L.assignment_id)]).catch(() => {});
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* بررسی سوابق — همان موتور پنل (worker/history.js)                     */
/*                                                                      */
/* اقلام چندانتخابی یا «همه اقلام» ← یک پیامِ تفکیک‌شده به قلم ← انتخاب  */
/* قلم ← تأمین‌کنندگان (چندانتخابی) ← «افزودن به استعلامات» یا «فهرست».  */
/* درخواستِ تک‌قلمی مستقیم به تأمین‌کنندگان می‌رسد.                      */
/* ------------------------------------------------------------------ */
/* ضریب اهمیت گشتاور در بات ثابت است؛ نوارِ ۱ تا ۱۰ مال پنل است. */
const HIST_K = 5;
const RQ = (x) => Math.round((Number(x) || 0) * 100) / 100;   /* عددها بدون زبالهٔ اعشار شناور */
const HIST_MAX_SEL = 24;   /* سقف دکمه‌های تأمین‌کننده در یک کارت */
/* هر قلم چند کوئری D1 است و هر فراخوانی پلن رایگان ۵۰ زیردرخواست دارد؛ بیش از
   این در یک فراخوانی نمی‌رود و بقیه با «ادامهٔ سوابق» در فراخوانی بعدی می‌آید. */
const HIST_BATCH = 5;
const MSG_MAX = 3900;      /* متن تلگرام ۴۰۹۶ نویسه جا دارد */

async function histStart(env, api, chat, ex, aid, mid) {
  const asg = await ownOpenAssignment(env, ex.id, aid);
  if (!asg) { await api.sendMessage(chat, "این درخواست متعلق به شما نیست یا بسته شده.").catch(() => {}); return { ok: true }; }
  const its = await itemsOf(env, aid);
  if (!its.length) { await api.sendMessage(chat, "قلم بازی در این درخواست نمانده است.").catch(() => {}); return { ok: true }; }
  const d = { sel: [], single: its.length === 1 };
  const f = await newFlow(env, ex, chat, "hsel", "pick", aid, d);
  if (d.single) return histRun(env, api, chat, ex, f, d, asg, [its[0].id], null);
  return histSelCard(api, chat, f, d, its, asg, mid);
}

function histSelCard(api, chat, f, d, its, asg, mid) {
  const sel = new Set(d.sel || []);
  const kb = its.slice(0, 40).map((i) => [{
    text: `${sel.has(i.id) ? "☑" : "☐"} ${short(i.title, 30)}${i.qty != null ? ` — ${M(i.qty)} ${i.unit || ""}` : ""}`,
    callback_data: `hx:${f.id}:t:${i.id}`,
  }]);
  kb.push([{ text: `📚 سوابق اقلام انتخابی${sel.size ? ` (${M(sel.size)})` : ""}`, callback_data: `hx:${f.id}:go:0` }]);
  kb.push([{ text: "📚 همه اقلام", callback_data: `hx:${f.id}:all:0` }]);
  kb.push(navRow(f.assignment_id));
  return show(api, chat, mid, `📚 <b>بررسی سوابق</b> — درخواست <b>${esc(asg.request_id)}</b>\n\n`
    + "سوابق کدام اقلام را ببینم؟ چند قلم را تیک بزنید و «سوابق اقلام انتخابی» را بزنید، یا «همه اقلام».", kb);
}

async function histRun(env, api, chat, ex, f, d, asg, ids, mid) {
  const aid = f.assignment_id;
  const want = (await itemsOf(env, aid)).filter((i) => ids.includes(i.id));
  const its = want.slice(0, HIST_BATCH);
  d.rest = want.slice(HIST_BATCH).map((i) => i.id);
  if (!its.length) return show(api, chat, mid, "این اقلام دیگر باز نیستند.", [navRow(aid)]);
  const cur = await activeImport(env);
  if (!cur) return show(api, chat, mid, "📚 فایل سوابق خرید هنوز بارگذاری نشده است؛ مدیر آن را از تب «سوابق تأمین» بارگذاری می‌کند.", [navRow(aid)]);

  const results = [];
  for (const it of its) results.push({ it, h: await itemHistory(env, it, { k: HIST_K, cur, brief: true }) });

  const ran = its.map((i) => i.id);
  d.ran = [...new Set([...(d.ran || []), ...ran])];
  d.opts = d.opts || {};
  for (const { it, h } of results) d.opts[it.id] = (h.suppliers || []).slice(0, HIST_MAX_SEL).map((s) => ({ name: s.name, code: s.code || "" }));
  const t = now();
  /* خواندنِ سوابق همان انجامِ مرحله است — همان رفتار پنل؛ باکس مدیر سبز می‌شود */
  await env.DB.batch([
    env.DB.prepare(`UPDATE items SET hist_done_at=COALESCE(hist_done_at,?) WHERE assignment_id=? AND id IN (${ran.map(() => "?").join(",")})`).bind(t, aid, ...ran),
    env.DB.prepare("UPDATE alerts SET canceled_at=? WHERE assignment_id=? AND kind='stage' AND stage=1 AND fired_at IS NULL").bind(t, aid),
    env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)")
      .bind(t, `expert:${ex.id}`, "hist", asg.request_id, JSON.stringify({ assignment_id: aid, item_ids: ran, channel: "telegram" })),
    env.DB.prepare("UPDATE tg_flows SET step='ran', data_json=? WHERE id=?").bind(JSON.stringify(d), f.id),
  ]);

  if (mid) await api.editMessageText(chat, mid, `📚 سوابق ${M(its.length)} قلم — در پیام بعد.`).catch(() => {});
  for (const text of histMessages(asg, results)) await api.sendMessage(chat, text).catch(() => {});
  if (d.rest.length) {
    await api.sendMessage(chat, `⏭ سوابق ${M(d.rest.length)} قلم دیگر مانده.`,
      [[{ text: `📚 ادامهٔ سوابق (${M(d.rest.length)} قلم)`, callback_data: `hx:${f.id}:more:0` }], navRow(aid)]).catch(() => {});
    return { ok: true };
  }
  return histAfter(env, api, chat, ex, f, d, null);
}

/** یک پیام، به تفکیک قلم؛ فقط اگر از سقف تلگرام بگذرد، سر مرزِ قلم‌ها به چند پیام شکسته می‌شود */
function histMessages(asg, results) {
  const head = `📚 <b>سوابق تأمین — درخواست ${esc(asg.request_id)}</b>\n`
    + `<i>ترتیب با امتیاز گشتاوری است: خریدِ تازه‌تر سنگین‌تر (ضریب ${M(HIST_K)}). عددهای برابر، رتبهٔ برابر دارند.</i>`;
  const budget = Math.max(450, Math.floor((MSG_MAX - head.length) / results.length) - 4);
  const out = [];
  let cur = head;
  for (const [k, r] of results.entries()) {
    const s = histSection(r.it, r.h, results.length > 1 ? k + 1 : 0, budget);
    if (cur.length + 2 + s.length > MSG_MAX) { out.push(cur); cur = s; } else cur += "\n\n" + s;
  }
  out.push(cur);
  return out;
}

function histSection(it, h, no, budget) {
  const title = `━━ ${no ? `${M(no)}. ` : ""}<b>${esc(short(it.title, 60))}</b>`;
  if (!h.available) return `${title}\n${esc(h.message)}`;
  const rows = h.suppliers || [];
  if (!rows.length) {
    const why = h.excluded && h.excluded.length
      ? `هرچه از این قلم خریده شده زیر نام تجمیعی «${h.excluded[0].name}» ثبت شده و تأمین‌کنندهٔ نام‌داری ندارد.`
      : (h.message || "سابقه‌ای در فایل مرجع پیدا نشد.");
    return `${title}\n${esc(why)}`;
  }
  const unit = h.item && h.item.unit ? ` ${h.item.unit}` : "";
  let s = `${title}\n${M(rows.length)} تأمین‌کننده · ${M(h.totals.n)} خرید · جمع مقدار ${M(RQ(h.totals.qty))}${esc(unit)}`
    + (h.item && h.item.mixedUnits ? `\n⚠️ <i>واحدها یکدست نیستند (${esc(h.item.units || "")})؛ جمع مقدار را با احتیاط بخوانید.</i>` : "");
  let shown = 0;
  for (const [i, x] of rows.entries()) {
    const line = `\n${M(i + 1)}. <b>${esc(short(x.name, 36))}</b>\n`
      + `   دفعات خرید <b>${M(x.n)}</b> (رتبه ${M(x.rankN)}) · مقدار <b>${M(RQ(x.qty))}</b>${esc(unit)} (رتبه ${M(x.rankQty)})\n`
      + `   امتیاز گشتاوری <b>${M(RQ(x.qtyM))}</b> (رتبه ${M(x.rankM)})`;
    if (shown && s.length + line.length > budget) break;
    s += line; shown++;
  }
  if (shown < rows.length) s += `\n<i>و ${M(rows.length - shown)} تأمین‌کنندهٔ دیگر — در پنل</i>`;
  return s;
}

/** بعد از پیامِ سوابق: یک قلم ← مستقیم تأمین‌کنندگانش؛ چند قلم ← اول انتخاب قلم */
function histAfter(env, api, chat, ex, f, d, mid) {
  const ran = d.ran || [];
  if (ran.length === 1) return histSupplierCard(env, api, chat, ex, f, d, ran[0], d.single ? "r" : "x", mid);
  return histPicker(env, api, chat, f, d, mid);
}

async function histPicker(env, api, chat, f, d, mid) {
  const its = (await itemsOf(env, f.assignment_id)).filter((i) => (d.ran || []).includes(i.id));
  const kb = its.map((i) => {
    const n = ((d.opts || {})[i.id] || []).length;
    return [{ text: `${short(i.title, 30)} · ${n ? `${M(n)} تأمین‌کننده` : "بی‌سابقه"}`, callback_data: `hp:${f.id}:${i.id}` }];
  });
  kb.push([{ text: "🗂 فهرست", callback_data: `hp:${f.id}:ls` }]);
  kb.push([KARTABL_BTN, { text: "↩️ بازگشت", callback_data: `hx:${f.id}:back:0` }]);
  return show(api, chat, mid, "📚 <b>تأمین‌کنندگانِ کدام قلم را برای استعلام انتخاب می‌کنید؟</b>\n<i>«فهرست» بی‌انتخاب جلو می‌رود.</i>", kb);
}

/** `back`: p انتخاب قلم · x کارت انتخاب اقلام · r منوی درخواست (تک‌قلمی) */
async function histSupplierCard(env, api, chat, ex, hf, hd, itemId, back, mid) {
  const aid = hf.assignment_id;
  const it = (await itemsOf(env, aid)).find((i) => i.id === itemId);
  if (!it) return show(api, chat, mid, "این قلم دیگر باز نیست.", [navRow(aid)]);
  const options = (hd.opts || {})[itemId] || [];
  if (!options.length) {
    return hub(api, chat, aid, back === "p" ? `p${hf.id}` : null, mid, `📚 «${esc(short(it.title, 40))}» در سوابق، تأمین‌کنندهٔ نام‌داری ندارد.`);
  }
  const f = await newFlow(env, ex, chat, "hist", "pick_suppliers", aid, { itemId, title: it.title, options, sel: [], back, from: hf.id });
  return supplierCard(env, api, chat, f, flowData(f), mid);
}

/* ------------------------------------------------------------------ */
/* کارت انتخاب تأمین‌کننده — مشترکِ سوابق (hf) و جستجوی هوشمند (sq)       */
/* ------------------------------------------------------------------ */

const haveSet = async (env, aid, itemId) => new Set(((await env.DB.prepare(
  "SELECT supplier_name FROM quotes WHERE assignment_id=? AND item_id=?",
).bind(aid, itemId).all()).results || []).map((q) => q.supplier_name));

async function supplierCard(env, api, chat, f, d, mid, head) {
  const pre = f.kind === "hist" ? "hf" : "sq";
  const have = await haveSet(env, f.assignment_id, d.itemId);
  const sel = new Set(d.sel || []);
  const kb = (d.options || []).map((o, i) => [{ text: `${sel.has(i) ? "☑" : "☐"} ${short(o.name, 30)}${have.has(o.name) ? " ✓" : ""}`, callback_data: `${pre}:${f.id}:t:${i}` }]);
  kb.push([{ text: `➕ افزودن به استعلامات${sel.size ? ` (${M(sel.size)})` : ""}`, callback_data: `${pre}:${f.id}:go:0` }]);
  kb.push([{ text: "🗂 فهرست", callback_data: `${pre}:${f.id}:ls:0` }]);
  kb.push([KARTABL_BTN, { text: "↩️ بازگشت", callback_data: `${pre}:${f.id}:back:0` }]);
  const r = await show(api, chat, mid, `${head ? head + "\n\n" : ""}${f.kind === "hist" ? "📚" : "🔎"} <b>تأمین‌کنندگانِ «${esc(short(d.title || "", 40))}»</b>\n\n`
    + "هر کدام را که می‌خواهید از او استعلام بگیرید تیک بزنید و «افزودن به استعلامات» را بزنید؛ فقط نامش وارد می‌شود و قیمت با پیش‌فاکتور یا ورود دستی می‌آید. «فهرست» بی‌افزودن جلو می‌رود."
    + (have.size ? "\n<i>✓ یعنی از قبل در استعلامات هست.</i>" : ""), kb);
  if (r && r.message_id && r.message_id !== f.message_id) await env.DB.prepare("UPDATE tg_flows SET message_id=? WHERE id=?").bind(r.message_id, f.id).run();
  return { ok: true };
}

/** انتخاب‌شده‌ها ← خط‌های استعلامِ همان قلم؛ بعد پنج راهِ بعدی */
async function addSelected(env, api, chat, ex, f, d, mid) {
  const aid = f.assignment_id;
  const itRow = await env.DB.prepare("SELECT id, unit, qty FROM items WHERE id=? AND assignment_id=?").bind(d.itemId, aid).first();
  if (!itRow) return show(api, chat, mid, "قلم این فهرست دیگر پیدا نمی‌شود.", [navRow(aid)]);
  const have = await haveSet(env, aid, d.itemId);
  const t = now();
  const stmts = [];
  let added = 0, skipped = 0;
  for (const i of d.sel || []) {
    const o = (d.options || [])[i];
    if (!o) continue;
    if (have.has(o.name)) { skipped++; continue; }
    have.add(o.name);
    /* از کجا آمد: سوابق یا جستجوی هوشمند (با شناسهٔ همان جستجو) */
    stmts.push(env.DB.prepare(`INSERT INTO quotes (assignment_id,item_id,supplier_name,supplier_code,unit,qty,invoice,source,origin,origin_ref,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,'telegram',?,?,?,?)`)
      .bind(aid, d.itemId, o.name, o.code || null, itRow.unit || null, itRow.qty ?? null, INVOICE_DEFAULT,
        f.kind === "hist" ? "history" : "smart", f.kind === "hist" ? null : (d.searchId || null), t, t));
    added++;
  }
  d.sel = [];
  stmts.push(env.DB.prepare("UPDATE tg_flows SET data_json=? WHERE id=?").bind(JSON.stringify(d), f.id));
  await env.DB.batch(stmts);
  return hub(api, chat, aid, `${f.kind === "hist" ? "h" : "s"}${f.id}`, mid,
    `✅ <b>${M(added)}</b> تأمین‌کننده برای «${esc(short(d.title || "", 40))}» وارد استعلامات شد${skipped ? ` و ${M(skipped)} مورد از قبل بود` : ""}.`);
}

/** دکمه‌های کارت تأمین‌کننده: t انتخاب · go افزودن · ls فهرست · back بازگشت */
async function supplierCardAction(env, api, chat, ex, f, step, v, mid, ack) {
  const d = flowData(f);
  if (step === "t") {
    if (!(d.options || [])[v]) { await ack("گزینهٔ نامعتبر.", true); return { ok: true }; }
    d.sel = toggleIn(d.sel, v);
    await saveFlow(env, f.id, d);
    await ack();
    return supplierCard(env, api, chat, f, d, mid);
  }
  if (step === "go") {
    if (!(d.sel || []).length) { await ack("هنوز تأمین‌کننده‌ای انتخاب نکرده‌اید؛ برای رفتن بی‌افزودن «فهرست» را بزنید.", true); return { ok: true }; }
    await ack("در حال افزودن…");
    return addSelected(env, api, chat, ex, f, d, mid);
  }
  if (step === "ls") { await ack(); return hub(api, chat, f.assignment_id, `${f.kind === "hist" ? "h" : "s"}${f.id}`, mid); }
  if (step === "back") {
    await ack();
    if (f.kind === "smsel") return show(api, chat, mid, "🔎 با نتایج جستجو چه کنم؟", [...smartChoiceKb(d.searchId, d.itemId), navRow(f.assignment_id)]);
    const hf = d.back === "p" || d.back === "x" ? await ownFlow(env, ex, d.from, "hsel") : null;
    if (hf && d.back === "p") return histPicker(env, api, chat, hf, flowData(hf), mid);
    if (hf) {
      const asg = await ownOpenAssignment(env, ex.id, hf.assignment_id);
      if (asg) return histSelCard(api, chat, hf, flowData(hf), await itemsOf(env, hf.assignment_id), asg, mid);
    }
    return requestMenu(env, api, chat, ex, f.assignment_id, { mid });
  }
  await ack();
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* تب استعلامات — انتخاب خط‌ها برای «دریافت پیش‌فاکتور»، خط دستی، کارت‌ها */
/* ------------------------------------------------------------------ */

async function qtabRows(env, aid) {
  return (await env.DB.prepare(
    `SELECT q.id, q.supplier_name, q.item_id, q.price, q.saved, i.title,
            EXISTS (SELECT 1 FROM proformas p WHERE p.assignment_id=q.assignment_id AND p.supplier_name=q.supplier_name) AS has_pf
     FROM quotes q JOIN items i ON i.id=q.item_id WHERE q.assignment_id=? ORDER BY q.supplier_name, i.line_no, q.id LIMIT 40`,
  ).bind(aid).all()).results || [];
}

async function quotesTab(env, api, chat, ex, aid, mid, head) {
  const asg = await ownOpenAssignment(env, ex.id, aid);
  if (!asg) { await api.sendMessage(chat, "این درخواست متعلق به شما نیست یا بسته شده.").catch(() => {}); return { ok: true }; }
  const f = await newFlow(env, ex, chat, "qtab", "pick", aid, { sel: [] });
  return qtabRender(env, api, chat, f, { sel: [] }, asg, mid, head);
}

async function qtabRender(env, api, chat, f, d, asg, mid, head) {
  const aid = f.assignment_id;
  const rows = await qtabRows(env, aid);
  const sel = new Set(d.sel || []);
  const list = rows.length
    ? rows.map((q, i) => `${M(i + 1)}. <b>${esc(short(q.supplier_name, 26))}</b> — ${esc(short(q.title, 24))}`
      + `${q.price != null ? ` · ${money(q.price)} ریال` : ""} ${q.saved ? "✅" : "✳️"}${q.has_pf ? "📎" : ""}`).join("\n")
      + "\n\n✅ ثبت موقت · ✳️ ناقص · 📎 پیش‌فاکتور دارد"
    : "هنوز خط استعلامی ثبت نشده است.";
  const kb = rows.map((q, i) => [{ text: `${sel.has(q.id) ? "☑" : "☐"} ${M(i + 1)}. ${short(q.supplier_name, 20)} — ${short(q.title, 14)}`, callback_data: `qx:${f.id}:t:${q.id}` }]);
  if (rows.length > 1) kb.push([{ text: sel.size === rows.length ? "☐ هیچ" : "☑ همه", callback_data: `qx:${f.id}:all:0` }]);
  if (rows.length) kb.push([{ text: `📎 دریافت پیش‌فاکتور${sel.size ? ` (${M(sel.size)} خط)` : ""}`, callback_data: `qx:${f.id}:pf:0` }]);
  kb.push([{ text: "➕ خط استعلام دستی", callback_data: `qx:${f.id}:new:0` }]);
  if (rows.length) kb.push([{ text: "✏️ پرکردن و اصلاح فیلدها", callback_data: `qx:${f.id}:ed:0` }]);
  /* تصمیم مدیر: چند خط را تیک بزند و یک‌جا حذف کند */
  if (rows.length) kb.push([{ text: `🗑 حذف خط‌های انتخابی${sel.size ? ` (${M(sel.size)})` : ""}`, callback_data: `qx:${f.id}:del:0` }]);
  if (rows.some((q) => q.saved)) kb.push([{ text: "📊 جدول کمیسیون", callback_data: `ct:${aid}:start:0` }]);
  kb.push(navRow(aid));
  return show(api, chat, mid, `${head ? head + "\n\n" : ""}🧾 <b>تب استعلامات — درخواست ${esc(asg.request_id)}</b>\n\n${list}`
    + (rows.length ? "\n\nخط‌هایی را که منتظر پیش‌فاکتورشان هستید تیک بزنید و «دریافت پیش‌فاکتور» را بزنید؛ فایل‌های بعدی بی‌پرسش به همان‌ها می‌نشینند. با همان تیک‌ها می‌توانید خط‌ها را حذف هم بکنید." : ""), kb);
}

/** تأیید حذفِ خط‌های تیک‌خورده — فهرستشان یک بار دیده می‌شود، بعد «حذف» */
async function qtabDeleteConfirm(env, api, chat, f, d, mid) {
  const rows = (await qtabRows(env, f.assignment_id)).filter((q) => (d.sel || []).includes(q.id));
  if (!rows.length) return { ok: true };
  const list = rows.map((q) => `• <b>${esc(short(q.supplier_name, 26))}</b> — ${esc(short(q.title, 24))}${q.saved ? " ✅" : ""}`).join("\n");
  return show(api, chat, mid, `🗑 <b>حذف ${M(rows.length)} خط استعلام؟</b>\n\n${list}\n\n`
    + "این خط‌ها با قیمت و فیلدهایشان پاک می‌شوند؛ فایل پیش‌فاکتورِ تأمین‌کننده می‌ماند.",
  [[{ text: `🗑 حذف ${M(rows.length)} خط`, callback_data: `qx:${f.id}:delok:0` }], [{ text: "↩️ بازگشت", callback_data: `qx:${f.id}:back:0` }]]);
}

/* حذف: از تب استعلامات و همهٔ گزینه‌های بات کامل بیرون می‌رود؛ نسخه‌اش در quotes_deleted می‌ماند */
async function qtabDelete(env, api, chat, ex, f, d, asg, mid) {
  const ids = (await qtabRows(env, f.assignment_id)).filter((q) => (d.sel || []).includes(q.id)).map((q) => q.id);
  if (!ids.length) return qtabRender(env, api, chat, f, { sel: [] }, asg, mid);
  const n = await deleteQuotes(env, { ids, expertId: ex.id, assignmentId: f.assignment_id, channel: "telegram" });
  d.sel = [];
  await saveFlow(env, f.id, d);
  return qtabRender(env, api, chat, f, d, asg, mid, `🗑 ${M(n)} خط استعلام حذف شد.`);
}

/** تب استعلامات ← «دریافت پیش‌فاکتور»: خط‌های تیک‌خورده به تفکیک تأمین‌کننده منتظر فایل می‌مانند */
async function awaitStart(env, api, chat, ex, f, d, mid) {
  const rows = (await qtabRows(env, f.assignment_id)).filter((q) => (d.sel || []).includes(q.id));
  const want = [];
  for (const q of rows) {
    let w = want.find((x) => x.s === q.supplier_name);
    if (!w) { w = { s: q.supplier_name, items: [], got: 0 }; want.push(w); }
    if (!w.items.includes(q.item_id)) w.items.push(q.item_id);
  }
  /* یک حالتِ فایل در هر لحظه: «پیوست‌ها» یا انتظارِ دیگری بسته می‌شود */
  await endModes(env, ex.id, null);
  await env.DB.prepare("UPDATE tg_flows SET step='done', done_at=? WHERE id=?").bind(now(), f.id).run();
  const w = await newFlow(env, ex, chat, "await_pf", "wait", f.assignment_id, { want }, MODE_TTL);
  return awaitStatus(env, api, chat, w, mid);
}

async function awaitStatus(env, api, chat, f, mid) {
  const d = flowData(f), aid = f.assignment_id;
  const want = d.want || [];
  const left = want.filter((w) => !w.got).length;
  const list = want.map((w) => `${w.got ? "✅" : "⏳"} <b>${esc(short(w.s, 34))}</b> · ${M((w.items || []).length)} قلم`).join("\n");
  const nav = [[{ text: "🧾 تب استعلامات", callback_data: `qt:${aid}` }], navRow(aid)];
  if (!left) return show(api, chat, mid, `📎 <b>همهٔ پیش‌فاکتورهای منتظر رسید.</b>\n\n${list}\n\nحالت «دریافت پیش‌فاکتور» بسته شد.`, nav);
  return show(api, chat, mid, `📎 <b>منتظر پیش‌فاکتور</b>\n\n${list}\n\n`
    + "فایل‌ها را همین‌جا بفرستید؛ هر فایل بی‌آنکه درخواست را بپرسم به همین‌ها و همین اقلام می‌نشیند"
    + (left > 1 ? " — فقط می‌پرسم مال کدام تأمین‌کننده است." : "."),
  [[{ text: "✖️ پایان دریافت", callback_data: `aw:${f.id}:x:0` }], ...nav]);
}

/* ------------------------------------------------------------------ */
/* خط استعلام دستی: تأمین‌کننده ← اقلام ← کارت استعلام با همهٔ فیلدها     */
/* ------------------------------------------------------------------ */

async function manualStart(env, api, chat, ex, aid) {
  const asg = await ownOpenAssignment(env, ex.id, aid);
  if (!asg) { await api.sendMessage(chat, "این درخواست متعلق به شما نیست یا بسته شده.").catch(() => {}); return { ok: true }; }
  await closeInputs(env, ex.id);
  const sups = ((await env.DB.prepare("SELECT DISTINCT supplier_name FROM quotes WHERE assignment_id=? ORDER BY supplier_name LIMIT 20").bind(aid).all()).results || [])
    .map((r) => r.supplier_name).filter(Boolean);
  const f = await newFlow(env, ex, chat, "manual", "need_supplier", aid, { sups });
  const kb = sups.map((s, i) => [{ text: short(s, 34), callback_data: `mn:${f.id}:s:${i}` }]);
  kb.push([{ text: "✖️ لغو", callback_data: `mn:${f.id}:x:0` }]);
  await api.sendMessage(chat, `✍️ <b>خط استعلام دستی</b> — درخواست <b>${esc(asg.request_id)}</b>\n\n`
    + `<b>نام تأمین‌کننده را بنویسید</b>${sups.length ? "، یا اگر همین‌جا هست انتخابش کنید" : ""}:`, kb).catch(() => {});
  return { ok: true };
}

async function manualItems(env, api, chat, ex, f, d, mid) {
  const its = await itemsOf(env, f.assignment_id);
  if (!Array.isArray(d.sel)) d.sel = its.length === 1 ? [its[0].id] : [];
  await saveFlow(env, f.id, d, "pick_items");
  const sel = new Set(d.sel);
  const kb = its.slice(0, 40).map((i) => [{
    text: `${sel.has(i.id) ? "☑" : "☐"} ${short(i.title, 30)}${i.qty != null ? ` — ${M(i.qty)} ${i.unit || ""}` : ""}`,
    callback_data: `mn:${f.id}:t:${i.id}`,
  }]);
  if (its.length > 1) kb.push([{ text: sel.size === its.length ? "☐ هیچ" : "☑ همه", callback_data: `mn:${f.id}:all:0` }]);
  kb.push([{ text: `✅ ساختن خط استعلام${sel.size ? ` (${M(sel.size)} قلم)` : ""}`, callback_data: `mn:${f.id}:go:0` }]);
  /* تصمیم مدیر: نام را کارشناس نوشته، ولی بقیهٔ فیلدها می‌تواند از پیش‌فاکتور خوانده شود */
  kb.push([{ text: "📎 ساختن خط و دریافت پیش‌فاکتور", callback_data: `mn:${f.id}:pf:0` }]);
  kb.push([{ text: "✖️ لغو", callback_data: `mn:${f.id}:x:0` }]);
  return show(api, chat, mid, `✍️ <b>خط استعلام دستی — «${esc(short(d.supplier, 40))}»</b>\n\n`
    + "برای کدام اقلام؟ تیک بزنید و «ساختن خط استعلام» را بزنید؛ بعد همهٔ فیلدها را روی کارت استعلام پر می‌کنید.\n"
    + "اگر پیش‌فاکتورش را دارید، «ساختن خط و دریافت پیش‌فاکتور» را بزنید تا فیلدها از خودِ فایل خوانده شود.", kb);
}

async function manualCreate(env, api, chat, ex, f, d, mid, thenAwait) {
  const its = await itemsOf(env, f.assignment_id);
  const ids = (d.sel || []).filter((x) => its.some((i) => i.id === x));
  const t = now();
  await env.DB.batch([
    ...lineInserts(env, f.assignment_id, d.supplier, ids, t, "manual"),
    env.DB.prepare("UPDATE tg_flows SET step='done', done_at=? WHERE id=?").bind(t, f.id),
    env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)")
      .bind(t, `expert:${ex.id}`, "manual_quote", null, JSON.stringify({ assignment_id: f.assignment_id, supplier: d.supplier, items: ids, channel: "telegram" })),
  ]);
  await show(api, chat, mid, `✅ خط استعلام «${esc(d.supplier)}» برای ${M(ids.length)} قلم ساخته شد.`, []);
  if (thenAwait) return awaitSupplier(env, api, chat, ex, f.assignment_id, d.supplier, null);
  return quoteCard(env, api, chat, f.assignment_id, d.supplier, null,
    "فیلدها را پر کنید — ❌ اجباری، ⚪ اختیاری — و بعد «ثبت موقت»؛ یا «دریافت پیش‌فاکتور» را بزنید تا بقیه از فایل خوانده شود.");
}

/**
 * حالت «دریافت پیش‌فاکتور» برای یک تأمین‌کنندهٔ مشخص — از کارت استعلام یا خط دستی.
 * همان حالتی که تب استعلامات با تیکِ خط‌ها باز می‌کند؛ این‌جا همهٔ خط‌های همین
 * تأمین‌کننده منتظر می‌مانند و فایل بعدی بی‌پرسش روی آن‌ها می‌نشیند.
 */
async function awaitSupplier(env, api, chat, ex, aid, supplier, mid) {
  const asg = await ownOpenAssignment(env, ex.id, aid);
  if (!asg) { await api.sendMessage(chat, "این درخواست متعلق به شما نیست یا بسته شده.").catch(() => {}); return { ok: true }; }
  const lines = await supplierLines(env, aid, supplier);
  if (!lines.length) { await api.sendMessage(chat, "برای این تأمین‌کننده خط استعلامی نیست.").catch(() => {}); return { ok: true }; }
  const items = [...new Set(lines.map((q) => q.item_id))];
  await endModes(env, ex.id, null);
  const w = await newFlow(env, ex, chat, "await_pf", "wait", aid, { want: [{ s: supplier, items, got: 0 }] }, MODE_TTL);
  return awaitStatus(env, api, chat, w, mid);
}

/* ------------------------------------------------------------------ */
/* جستجوی هوشمند در بات — همان موتور پنل (worker/discovery.js)            */
/* ------------------------------------------------------------------ */

async function smartItemOf(env, exId, itemId) {
  const it = await env.DB.prepare(`SELECT i.id, i.title, i.code, i.hist_code, i.qty, i.unit, i.spec, i.note, i.state,
      a.id AS aid, a.expert_id, a.request_id, a.dispatched_at, r.party
    FROM items i JOIN assignments a ON a.id=i.assignment_id JOIN requests r ON r.id=a.request_id WHERE i.id=?`).bind(itemId).first();
  return it && it.expert_id === exId ? it : null;
}

async function smartPickItem(env, api, chat, ex, aid) {
  const asg = await ownOpenAssignment(env, ex.id, aid);
  if (!asg) { await api.sendMessage(chat, "این درخواست متعلق به شما نیست یا بسته شده.").catch(() => {}); return { ok: true }; }
  const its = await itemsOf(env, aid);
  if (!its.length) { await api.sendMessage(chat, "قلم بازی در این درخواست نمانده است.").catch(() => {}); return { ok: true }; }
  if (its.length === 1) return smartPrefsCard(env, api, chat, ex, its[0].id);
  const kb = its.slice(0, 40).map((i) => [{ text: `${short(i.title, 32)}${i.qty != null ? ` — ${M(i.qty)} ${i.unit || ""}` : ""}`, callback_data: `sm:i:${i.id}` }]);
  kb.push(navRow(aid));
  await api.sendMessage(chat, `🔎 <b>جستجوی هوشمند</b>\nدرخواست <b>${esc(asg.request_id)}</b>\n\nبرای کدام قلم تأمین‌کنندهٔ تازه پیدا کنم؟`, kb).catch(() => {});
  return { ok: true };
}

async function smartPrefsCard(env, api, chat, ex, itemId) {
  const it = await smartItemOf(env, ex.id, itemId);
  if (!it) { await api.sendMessage(chat, "این قلم متعلق به شما نیست.").catch(() => {}); return { ok: true }; }
  await closeInputs(env, ex.id);
  const t = now();
  /* جستجوهای قبلیِ همین قلم (هر درخواست، هر کارشناس) پیش از خرج کردنِ جستجوی تازه */
  const prev = (await itemSearches(env, it, 5)).length;
  /* مشخصهٔ فنی و توضیحاتِ فایل راهکاران، پیش‌فرضِ قیدهای جستجو (تصمیم مدیر) — قابل ویرایش */
  const d = { itemId, title: it.title, markets: ["IR"], brand: "", specs: T(it.spec).slice(0, 500), notes: T(it.note).slice(0, 500), prev };
  const r = await env.DB.prepare("INSERT INTO tg_flows (expert_id,chat_id,kind,step,assignment_id,data_json,created_at,expires_at) VALUES (?,?,'smart','prefs',?,?,?,?)")
    .bind(ex.id, String(chat), it.aid, JSON.stringify(d), t, t + FLOW_TTL).run();
  const f = { id: r.meta.last_row_id };
  return smartPrefsRender(env, api, chat, f, d, null);
}

function smartPrefsText(d) {
  const names = (d.markets || []).map((k) => (MARKETS.find((m2) => m2.key === k) || {}).fa).filter(Boolean).join("، ") || "—";
  return `🔎 <b>جستجوی هوشمند «${esc(short(d.title || "", 40))}»</b>\n\n`
    + `🌍 بازار تأمین کالا: <b>${esc(names)}</b>\n`
    + `🏷 برند: ${d.brand ? `<b>${esc(d.brand)}</b>` : "—"}\n`
    + `📋 مشخصات فنی: ${d.specs ? esc(short(d.specs, 80)) : "—"}\n`
    + `📝 ملاحظات: ${d.notes ? esc(short(d.notes, 80)) : "—"}\n\n`
    + (d.prev ? `📜 <b>${M(d.prev)} جستجوی قبلی</b> برای همین قلم ثبت است — پیش از اجرای تازه، «نتایج قبلی» را ببینید.\n\n` : "")
    + "قیدها را تنظیم کنید و «اجرای جستجو» را بزنید؛ بازار تأمین کالا مهم‌ترین قید است.";
}
function smartPrefsKb(fid, d) {
  return [
    ...(d && d.prev ? [[{ text: `📜 نتایج قبلی این قلم (${M(d.prev)})`, callback_data: `sf:${fid}:pv:0` }]] : []),
    [{ text: "🌍 بازار تأمین کالا", callback_data: `sf:${fid}:mk:0` }],
    [{ text: "🏷 برند", callback_data: `sf:${fid}:br:0` }, { text: "📋 مشخصات فنی", callback_data: `sf:${fid}:sp:0` }],
    [{ text: "📝 ملاحظات", callback_data: `sf:${fid}:no:0` }],
    [{ text: "▶️ اجرای جستجو", callback_data: `sf:${fid}:go:0` }],
    [{ text: "✖️ لغو", callback_data: `sf:${fid}:x:0` }],
  ];
}
async function smartPrefsRender(env, api, chat, f, d, mid) {
  const text = smartPrefsText(d), kb = smartPrefsKb(f.id, d);
  const edited = mid ? await api.editMessageText(chat, mid, text, kb).catch(() => null) : null;
  if (!edited) {
    const msg = await api.sendMessage(chat, text, kb).catch(() => null);
    if (msg && msg.message_id) await env.DB.prepare("UPDATE tg_flows SET message_id=? WHERE id=?").bind(msg.message_id, f.id).run();
  }
  return { ok: true };
}
async function smartMarketMenu(env, api, chat, f, d, mid) {
  const kb = MARKETS.map((m2, i) => [{ text: `${(d.markets || []).includes(m2.key) ? "☑" : "☐"} ${m2.fa}`, callback_data: `sf:${f.id}:m:${i}` }]);
  kb.push([{ text: "→ بازگشت", callback_data: `sf:${f.id}:back:0` }]);
  const text = "🌍 <b>بازار تأمین کالا</b> — حداکثر سه بازار که تأمین‌کننده از آن پذیرفتنی است را تیک بزنید. هرچه بیرون از این‌ها باشد در نتایج نمی‌آید.";
  const edited = mid ? await api.editMessageText(chat, mid, text, kb).catch(() => null) : null;
  if (!edited) await api.sendMessage(chat, text, kb).catch(() => {});
  return { ok: true };
}

/**
 * نتیجهٔ یک جستجو را در یک پیام می‌فرستد. خودِ اجرا در صف انجام شده
 * (runSmartJobs)؛ این‌جا فقط قالب‌بندی است و متن زیر سقف ۴۰۹۶ نویسهٔ تلگرام می‌ماند.
 */
/* نتیجهٔ جستجو را هر دو شکل می‌خوانند: v3 (فهرست ساده) و نتایج ذخیره‌شدهٔ قدیمی */
const supPhonesBot = (s) => (s.phones || []).map((p) => (p && typeof p === "object" ? p.e164 || p.verbatim : p)).filter(Boolean);
const supEmailsBot = (s) => (s.emails || []).map((x) => (x && typeof x === "object" ? x.verbatim : x)).filter(Boolean);
const supPriceBot = (s) => (s.price && typeof s.price === "object" ? [s.price.text, s.price.unit ? `/ ${s.price.unit}` : ""].filter(Boolean).join(" ") : s.price || "");

/**
 * نتیجهٔ یک جستجو: فقط فهرست تأمین‌کنندگان، و هزینه در یک خط کوچک. هیچ ردیفی کنار
 * گذاشته نمی‌شود؛ اگر در یک پیام جا نشد (سقف ۴۰۹۶ نویسهٔ تلگرام)، در پیام بعدی می‌آید.
 */
const PLAT_FA = { telegram: "تلگرام", whatsapp: "واتساپ", bale: "بله", rubika: "روبیکا" };

async function smartResultsMessage(env, api, chat, ex, it, params, out, opts = {}) {
  const result = withPhoneKeys(out.result) || {};
  const sup = result.suppliers || [];
  /* بررسیِ پیام‌رسان‌ها که کارشناس‌ها (در پنل) برای هر شماره ثبت کرده‌اند، کنار همان شماره */
  const chans = await phoneChannels(env, sup.flatMap((s2) => s2.phone_keys || [])).catch(() => ({}));
  const marks = (key) => {
    const c = chans[key];
    if (!c) return "";
    const set = PLATFORMS.filter((p) => c[p] === "ok" || c[p] === "no").map((p) => `${c[p] === "ok" ? "✅" : "❌"}${PLAT_FA[p]}`);
    return set.length ? ` (${set.join(" ")})` : "";
  };
  const cost = out.cost != null ? `\n\n<i>هزینهٔ این جستجو: ${M(Number(out.cost).toFixed(2))} دلار</i>` : "";
  const head = opts.head || `🔎 <b>نتیجهٔ جستجوی هوشمند «${esc(short(it.title, 40))}»</b> — ${M(sup.length)} تأمین‌کننده`;
  const card = (s2, i) => {
    const phones = supPhonesBot(s2), emails = supEmailsBot(s2), price = supPriceBot(s2);
    const type = s2.type || s2.role || "unknown", market = s2.market || (s2.location && s2.location.country) || "";
    return `${M(i + 1)}. <b>${esc(s2.name || "—")}</b> — ${esc(ROLE_FA_BOT[type] || type)}${market ? ` · ${esc(market)}` : ""}`
      + (phones.length ? `\n📞 ${phones.map((p, k) => `<code>${esc(p)}</code>${marks((s2.phone_keys || [])[k])}`).join(" · ")}` : "")
      + (emails.length ? `\n✉️ ${emails.map((x) => esc(x)).join(" · ")}` : "")
      + (s2.website ? `\n🌐 ${esc(s2.website)}` : "")
      + (price ? `\n💰 ${esc(price)}` : "");
  };
  const parts = [];
  let cur = head;
  for (const [i, s2] of sup.entries()) {
    const c = card(s2, i);
    if (cur.length + c.length + 2 > 3800) { parts.push(cur); cur = c; } else cur += `\n\n${c}`;
  }
  parts.push(cur + cost);
  for (const p of parts) await api.sendMessage(chat, p).catch(() => {});
  if (!sup.length) return { ok: true };
  await api.sendMessage(chat, "با نتایج چه کنم؟", [...smartChoiceKb(out.search_id, it.id), navRow(it.aid)]).catch(() => {});
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* صف جستجوی هوشمند — Cron اجرایش می‌کند                                 */
/*                                                                      */
/* جستجو چند دقیقه طول می‌کشد. waitUntil بعد از پاسخ به تلگرام فقط ۳۰      */
/* ثانیه فرصت می‌دهد، ولی اجرای Cron تا ۱۵ دقیقه. پس دکمهٔ «اجرا» فقط کار   */
/* را در smart_jobs می‌نشاند و Cron هر دقیقه یک کار برمی‌دارد.             */
/* ------------------------------------------------------------------ */
const JOB_STALE = 16 * 60000;

export async function runSmartJobs(env) {
  const t = now();
  const api = telegram(env);
  /* کاری که از سقف Cron گذشته، مرده است — کارشناس بی‌خبر نمی‌ماند */
  const stale = (await env.DB.prepare("SELECT id, chat_id FROM smart_jobs WHERE state='running' AND started_at<?").bind(t - JOB_STALE).all()).results || [];
  for (const j of stale) {
    await env.DB.prepare("UPDATE smart_jobs SET state='failed', error='timeout', finished_at=? WHERE id=?").bind(t, j.id).run();
    await api.sendMessage(j.chat_id, "❌ جستجوی هوشمند در زمان مجاز تمام نشد؛ دوباره اجرا کنید (بازار کمتری تیک بزنید).").catch(() => {});
  }
  /* برداشتنِ اتمیِ یک کار: دو اجرای هم‌زمان هرگز یک کار را دو بار نمی‌گیرند */
  const claimed = (await env.DB.prepare(
    `UPDATE smart_jobs SET state='running', started_at=? WHERE id=(SELECT id FROM smart_jobs WHERE state='queued' ORDER BY id LIMIT 1) AND state='queued' RETURNING *`,
  ).bind(t).all()).results || [];
  const job = claimed[0];
  if (!job) return { jobs: 0, stale: stale.length };
  try {
    const ex = await env.DB.prepare("SELECT id, name, label FROM experts WHERE id=?").bind(job.expert_id).first();
    const it = ex ? await smartItemOf(env, ex.id, job.item_id) : null;
    if (!it) throw new Error("این قلم دیگر در دسترس شما نیست.");
    const params = JSON.parse(job.params_json || "{}");
    const out = await smartSearch(env, it, ex, { ...params, deliveryHint: it.party }, "telegram");
    await env.DB.prepare("UPDATE smart_jobs SET state='done', search_id=?, finished_at=? WHERE id=?").bind(out.search_id, now(), job.id).run();
    await smartResultsMessage(env, api, job.chat_id, ex, it, params, out);
    return { jobs: 1, stale: stale.length };
  } catch (e) {
    const msg = String((e && e.message) || e).slice(0, 300);
    await env.DB.prepare("UPDATE smart_jobs SET state='failed', error=?, finished_at=? WHERE id=?").bind(msg, now(), job.id).run();
    await api.sendMessage(job.chat_id, `❌ جستجوی هوشمند انجام نشد: ${esc(msg.slice(0, 200))}`).catch(() => {});
    return { jobs: 1, failed: 1, stale: stale.length };
  }
}

const ROLE_FA_BOT = {
  manufacturer: "تولیدکننده", authorized_dealer: "نمایندگی رسمی", wholesaler: "عمده‌فروش/واردکننده",
  retailer: "فروشگاه", online_seller: "فروشندهٔ آنلاین/آگهی", unknown: "نامشخص",
  authorized_distributor: "نمایندهٔ رسمی", wholesaler_importer: "عمده‌فروش/واردکننده", retailer_shop: "فروشگاه",
  marketplace_only: "فقط آگهی", broker_intermediary: "واسطه",
};

/**
 * یک جستجو برای کدام قلمِ همین کارشناس به کار می‌آید: خودِ قلمِ جستجو اگر هنوز مال اوست،
 * وگرنه همان قلم (کد استاندارد، کد راهکاران یا عنوان) در یکی از ارجاع‌های باز او —
 * تا نتیجهٔ جستجوی قبلیِ کارشناسِ دیگر هم قابل افزودن و پیام دادن باشد.
 */
async function searchItemFor(env, ex, sr, preferId) {
  if (!sr) return null;
  const live = (it) => it && it.state === "open" && it.dispatched_at;
  const sameKey = (i) => i.id === sr.item_id || (sr.hist_code && i.hist_code === sr.hist_code) || (sr.item_code && i.code === sr.item_code) || (sr.title_n && titleKey(i.title) === sr.title_n);
  /* اول قلمی که کارشناس از رویش آمده (دکمه‌ها شناسه‌اش را دارند)، اگر باز است و همان قلمِ جستجوست */
  if (preferId) {
    const p = await smartItemOf(env, ex.id, preferId);
    if (live(p) && sameKey(p)) return p;
  }
  /* بعد خودِ قلمِ جستجو — فقط اگر هنوز باز است؛ قلمِ بسته‌شده جای افزودن نیست */
  const own = await smartItemOf(env, ex.id, sr.item_id);
  if (live(own)) return own;
  const rows = (await env.DB.prepare(
    `SELECT i.id, i.title, i.code, i.hist_code FROM items i JOIN assignments a ON a.id=i.assignment_id
      WHERE a.expert_id=? AND a.dispatched_at IS NOT NULL AND i.state='open' ORDER BY i.id DESC LIMIT 300`,
  ).bind(ex.id).all()).results || [];
  const hit = rows.find(sameKey);
  return hit ? smartItemOf(env, ex.id, hit.id) : null;
}

/** «انتخاب جهت استعلام» زیر نتیجهٔ جستجو — همان کارتِ انتخابِ تأمین‌کنندهٔ سوابق */
async function smartSelOpen(env, api, chat, ex, searchId, mid, preferId) {
  const sr = await searchById(env, searchId);
  const it = await searchItemFor(env, ex, sr, preferId);
  if (!it) { await api.sendMessage(chat, "این جستجو پیدا نشد.").catch(() => {}); return { ok: true }; }
  const options = ((sr.result && sr.result.suppliers) || []).slice(0, HIST_MAX_SEL).map((s) => ({ name: s.name, code: "" }));
  if (!options.length) { await api.sendMessage(chat, "تأمین‌کننده‌ای برای انتخاب نیست.").catch(() => {}); return { ok: true }; }
  const f = await newFlow(env, ex, chat, "smsel", "pick_suppliers", it.aid, { itemId: it.id, title: it.title, searchId, options, sel: [] });
  return supplierCard(env, api, chat, f, flowData(f), mid);
}

/* ------------------------------------------------------------------ */
/* قالب‌های پیام به تأمین‌کننده — همان قالب‌های پنل، ساخت و ویرایش از بات  */
/*                                                                      */
/* فهرست ← نمایش یک قالب (متن با جای‌خالی‌ها) ← ویرایش عنوان/متن یا حذف؛   */
/* «قالب جدید» عنوان و بعد متن را می‌پرسد. `ctx` (شناسهٔ جستجو و ردیف     */
/* تأمین‌کننده) اگر باشد، «بازگشت» به همان انتخابِ قالب برمی‌گردد.         */
/* ------------------------------------------------------------------ */

/* ctx = «:جستجو:ردیف:قلم» — از کدام نتیجهٔ جستجو و برای کدام قلم آمده‌ایم؛ خالی یعنی /ghaleb */
const ctxOf = (sid, i, item) => (sid ? `:${sid}:${i}:${item || 0}` : "");

/**
 * ردیف‌های راهبری پایینِ هر صفحهٔ قالب پیام: «بازگشت» به صفحهٔ قبل، و «کارتابل» و «درخواست».
 * «درخواست» فقط وقتی معنا دارد که از نتیجهٔ جستجوی یک قلم آمده باشیم؛ در /ghaleb فقط کارتابل.
 */
async function tplNav(env, ex, ctx, back) {
  const item = parseInt(String(ctx || "").split(":")[3], 10) || 0;
  const it = item ? await smartItemOf(env, ex.id, item) : null;
  return [[{ text: "↩️ بازگشت", callback_data: back }], it ? navRow(it.aid) : [KARTABL_BTN]];
}
const tokensLine = () => TEMPLATE_TOKENS.map((t) => `<code>{${t}}</code>`).join(" ");

/** انتخاب قالب برای یک تأمین‌کنندهٔ نتیجهٔ جستجو (sg:p) */
async function templatePick(env, api, chat, ex, sr, i, s2, mid, itemId) {
  const tpls = (await ensureTemplates(env, ex.id, env.COMPANY)).slice(0, 12);
  const desc = tpls.map((t2, k) => `${M(k + 1)}. <b>${esc(t2.title)}</b> — <i>${esc(short(t2.body.replace(/\s+/g, " "), 60))}</i>`).join("\n");
  const kb = tpls.map((t2) => [{ text: short(t2.title, 34), callback_data: `sg:${sr.search_id}:t:${i}:${t2.id}${itemId ? `:${itemId}` : ""}` }]);
  kb.push([{ text: "🗂 قالب‌های پیام (جدید / ویرایش)", callback_data: `tp:ls:0${ctxOf(sr.search_id, i, itemId)}` }]);
  kb.push(...await tplNav(env, ex, ctxOf(sr.search_id, i, itemId), `sg:${sr.search_id}:open:${itemId || 0}`));
  return show(api, chat, null, `✉️ پیام برای <b>${esc(short(s2.name, 36))}</b>\nکدام قالب؟\n\n${desc}`, kb);
}

async function templateList(env, api, chat, ex, ctx, mid, head) {
  const tpls = await ensureTemplates(env, ex.id, env.COMPANY);
  const list = tpls.map((t2, k) => `${M(k + 1)}. <b>${esc(t2.title)}</b>${t2.expert_id == null ? " <i>(مشترک)</i>" : ""}\n   <i>${esc(short(t2.body.replace(/\s+/g, " "), 70))}</i>`).join("\n");
  const kb = tpls.slice(0, 20).map((t2) => [{ text: `📄 ${short(t2.title, 30)}`, callback_data: `tp:v:${t2.id}${ctx || ""}` }]);
  kb.push([{ text: "➕ قالب جدید", callback_data: `tp:new:0${ctx || ""}` }]);
  /* بازگشت: از نتیجهٔ جستجو ← انتخاب قالب همان تأمین‌کننده؛ از /ghaleb ← راهنمای بات */
  const [, sid, i, item] = String(ctx || "").split(":");
  kb.push(...await tplNav(env, ex, ctx, ctx ? `sg:${sid}:p:${i}:${item || 0}` : "tp:hm:0"));
  return show(api, chat, mid, `${head ? head + "\n\n" : ""}🗂 <b>قالب‌های پیام</b> — ${M(tpls.length)} قالب\n\n${list}\n\n`
    + `جای‌خالی‌ها هنگام ارسال با دادهٔ همان قلم و تأمین‌کننده پر می‌شوند: ${tokensLine()}`, kb);
}

async function templateView(env, api, chat, ex, id, ctx, mid, head) {
  const t2 = await ownTemplate(env, ex.id, id);
  if (!t2) return templateList(env, api, chat, ex, ctx, mid, "این قالب دیگر نیست.");
  const kb = [
    [{ text: "✏️ ویرایش عنوان", callback_data: `tp:et:${id}${ctx || ""}` }, { text: "✏️ ویرایش متن", callback_data: `tp:eb:${id}${ctx || ""}` }],
    [{ text: "🗑 حذف این قالب", callback_data: `tp:dl:${id}${ctx || ""}` }],
    ...await tplNav(env, ex, ctx, `tp:ls:0${ctx || ""}`),
  ];
  return show(api, chat, mid, `${head ? head + "\n\n" : ""}📄 <b>${esc(t2.title)}</b>${t2.expert_id == null ? " <i>(مشترک)</i>" : ""}\n\n<code>${esc(t2.body)}</code>\n\n`
    + `<i>ساختار قالب همین است؛ جای‌خالی‌ها هنگام ارسال پر می‌شوند.</i>`, kb);
}

/** پرسیدن عنوان یا متن: پاسخِ متنیِ بعدیِ کارشناس همین را پر می‌کند */
async function templateAsk(env, api, chat, ex, step, data, prompt) {
  await closeInputs(env, ex.id);
  const f = await newFlow(env, ex, chat, "tpl", step, null, data);
  await api.sendMessage(chat, prompt, [[{ text: "✖️ بی‌خیال", callback_data: `fl:${f.id}:x:0` }]]).catch(() => {});
  return { ok: true };
}
const bodyPrompt = (title) => `📝 <b>متن قالب «${esc(title)}»</b> را بنویسید.\n\nهر جا لازم است، جای‌خالی‌ها را عیناً بگذارید: ${tokensLine()}\n<i>مثال: «برای {عنوان قلم} به مقدار {مقدار} {واحد} استعلام قیمت نیاز داریم.»</i>`;

async function onTemplateText(env, api, chat, ex, f, d, text) {
  if (text.length > 2000) { await api.sendMessage(chat, "خیلی بلند است؛ کوتاه‌ترش کنید.").catch(() => {}); return { ok: true }; }
  const t = now();
  if (f.step === "need_title") {
    d.title = short(text, 80);
    await env.DB.prepare("UPDATE tg_flows SET step='need_body', data_json=?, asked_at=? WHERE id=?").bind(JSON.stringify(d), t, f.id).run();
    await api.sendMessage(chat, bodyPrompt(d.title), [[{ text: "✖️ بی‌خیال", callback_data: `fl:${f.id}:x:0` }]]).catch(() => {});
    return { ok: true };
  }
  if (f.step === "need_body") {
    const r = await env.DB.prepare("INSERT INTO templates (expert_id,title,body,created_at) VALUES (?,?,?,?)").bind(ex.id, d.title || "بدون عنوان", text, t).run();
    await env.DB.prepare("UPDATE tg_flows SET step='done', done_at=? WHERE id=?").bind(t, f.id).run();
    return templateView(env, api, chat, ex, r.meta.last_row_id, d.ctx || "", null, "✅ قالب ساخته شد.");
  }
  if (f.step === "edit_title" || f.step === "edit_body") {
    const col = f.step === "edit_title" ? "title" : "body";
    const r = await env.DB.prepare(`UPDATE templates SET ${col}=? WHERE id=? AND (expert_id IS NULL OR expert_id=?)`)
      .bind(col === "title" ? short(text, 80) : text, d.id, ex.id).run();
    await env.DB.prepare("UPDATE tg_flows SET step='done', done_at=? WHERE id=?").bind(t, f.id).run();
    if (!r.meta.changes) { await api.sendMessage(chat, "این قالب دیگر نیست.").catch(() => {}); return { ok: true }; }
    return templateView(env, api, chat, ex, d.id, d.ctx || "", null, `✅ ${col === "title" ? "عنوان" : "متن"} قالب ذخیره شد.`);
  }
  return { ok: true };
}

async function onTemplateAction(env, api, chat, ex, parts, mid, ack) {
  const step = parts[1], id = parseInt(parts[2], 10) || 0;
  const ctx = parts[3] ? `:${parts[3]}:${parts[4] || 0}:${parts[5] || 0}` : "";
  if (step === "ls") { await ack(); return templateList(env, api, chat, ex, ctx, mid); }
  /* بازگشت از فهرست قالب‌های /ghaleb */
  if (step === "hm") { await ack(); return show(api, chat, mid, HELP_TEXT, [[KARTABL_BTN]]); }
  if (step === "v") { await ack(); return templateView(env, api, chat, ex, id, ctx, mid); }
  if (step === "new") { await ack(); return templateAsk(env, api, chat, ex, "need_title", { ctx }, "➕ <b>قالب جدید</b>\n\nعنوان قالب را بنویسید (مثلاً «زمان تحویل»):"); }
  const t2 = id ? await ownTemplate(env, ex.id, id) : null;
  if (!t2) { await ack("این قالب دیگر نیست.", true); return { ok: true }; }
  if (step === "et") { await ack(); return templateAsk(env, api, chat, ex, "edit_title", { id, ctx }, `✏️ عنوان تازهٔ قالب «${esc(t2.title)}» را بنویسید:`); }
  if (step === "eb") { await ack(); return templateAsk(env, api, chat, ex, "edit_body", { id, ctx }, `${bodyPrompt(t2.title)}\n\nمتن فعلی:\n<code>${esc(t2.body)}</code>`); }
  if (step === "dl") {
    await ack();
    return show(api, chat, mid, `🗑 قالب «<b>${esc(t2.title)}</b>» حذف شود؟`,
      [[{ text: "🗑 بله، حذف شود", callback_data: `tp:dk:${id}${ctx}` }], ...await tplNav(env, ex, ctx, `tp:v:${id}${ctx}`)]);
  }
  if (step === "dk") {
    await env.DB.prepare("DELETE FROM templates WHERE id=? AND (expert_id IS NULL OR expert_id=?)").bind(id, ex.id).run();
    await ack("حذف شد");
    return templateList(env, api, chat, ex, ctx, mid, `🗑 قالب «${esc(t2.title)}» حذف شد.`);
  }
  await ack();
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* تحویل — انتخاب اسناد، ساختنِ آنچه نیست، پیوست‌ها، و فرستادن همه با هم  */
/*                                                                      */
/* درخواست خرید و جدول کمیسیون همان لحظه ساخته می‌شوند؛ نامه اگر نیست     */
/* پرسیده می‌شود (صوتی یا نوشتاری)؛ «پیوست‌ها» یعنی تا «تحویل» زده نشده،  */
/* هر فایلی که برسد پیوست است نه پیش‌فاکتور. در پایان همه با هم می‌روند.  */
/* ------------------------------------------------------------------ */

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DV_DOCS = [["req", "📄 درخواست خرید"], ["letter", "✉️ نامه"], ["table", "📊 جدول کمیسیون"], ["att", "📎 پیوست‌ها"]];
const ATT_MAX = 10;   /* هر پیوست یک ارسال است و فراخوانی سقف زیردرخواست دارد */

const writtenLetter = (env, aid) => env.DB.prepare(
  "SELECT id FROM letters WHERE assignment_id=? AND state='written' AND docx_key IS NOT NULL ORDER BY id DESC LIMIT 1",
).bind(aid).first();

async function deliverOpen(env, api, chat, ex, aid, mid) {
  const asg = await ownOpenAssignment(env, ex.id, aid);
  if (!asg) { await api.sendMessage(chat, "این درخواست متعلق به شما نیست یا بسته شده.").catch(() => {}); return { ok: true }; }
  /* یک حالتِ فایل در هر لحظه */
  await endModes(env, ex.id, null);
  const d = { docs: { req: 1, letter: (await writtenLetter(env, aid)) ? 1 : 0, table: 1, att: 0 } };
  const f = await newFlow(env, ex, chat, "deliver", "pick", aid, d, MODE_TTL);
  return deliverCard(api, chat, f, d, asg, mid);
}

function deliverCard(api, chat, f, d, asg, mid, head) {
  const kb = DV_DOCS.map(([k, label]) => [{ text: `${d.docs[k] ? "☑" : "☐"} ${label}`, callback_data: `dv:${f.id}:t:${k}` }]);
  kb.push([{ text: "📦 تحویل", callback_data: `dv:${f.id}:go:0` }]);
  kb.push(navRow(f.assignment_id));
  return show(api, chat, mid, `${head ? head + "\n\n" : ""}📦 <b>تحویل — درخواست ${esc(asg.request_id)}</b>\n\n`
    + "کدام اسناد تحویل شوند؟ تیک بزنید و «تحویل» را بزنید.\n\n"
    + "<i>درخواست خرید و جدول کمیسیون همان لحظه ساخته می‌شوند. نامه اگر هنوز نیست، می‌پرسم (صوتی یا نوشتاری). "
    + "با «پیوست‌ها»، فایل‌هایی که بعدش می‌فرستید پیوست حساب می‌شوند، نه پیش‌فاکتور.</i>", kb);
}

/** قدم بعدیِ تحویل: اول نامه (اگر لازم است)، بعد پیوست‌ها (اگر خواسته شده)، بعد فرستادن */
async function deliverNext(env, api, chat, ex, f, d, mid) {
  const aid = f.assignment_id;
  if (!Object.values(d.docs || {}).some(Boolean)) {
    await saveFlow(env, f.id, d, "pick");
    const asg = await ownOpenAssignment(env, ex.id, aid);
    return asg ? deliverCard(api, chat, { ...f, step: "pick" }, d, asg, mid, "⛔ هیچ سندی برای تحویل انتخاب نشده.") : { ok: true };
  }
  if (d.docs.letter && !(await writtenLetter(env, aid))) {
    await env.DB.prepare("UPDATE tg_flows SET step='letter', data_json=?, asked_at=? WHERE id=?").bind(JSON.stringify(d), now(), f.id).run();
    if (mid) await api.editMessageText(chat, mid, "📦 تحویل — اول نامه:").catch(() => {});
    return startLetter(env, api, chat, ex, aid, { skip: `dv:${f.id}:nl:0` });
  }
  if (d.docs.att && f.step !== "attach") {
    await env.DB.prepare("UPDATE tg_flows SET step='attach', data_json=?, asked_at=? WHERE id=?").bind(JSON.stringify(d), now(), f.id).run();
    return show(api, chat, mid, "📎 <b>پیوست‌ها</b>\n\n"
      + "فایل‌های پیوست را همین حالا بفرستید — هر چند تا، پشت سر هم. تا «تحویل» را نزده‌اید، هر فایلی که برسد پیوست حساب می‌شود، نه پیش‌فاکتور.\n\n"
      + "بعد «📦 تحویل» را بزنید تا همهٔ اسناد با هم فرستاده شوند.",
    [[{ text: "📦 تحویل", callback_data: `dv:${f.id}:fin:0` }], [{ text: "✖️ بدون پیوست تحویل بده", callback_data: `dv:${f.id}:na:0` }]]);
  }
  return deliverSend(env, api, chat, ex, f, d, mid);
}

/** در حالت «پیوست‌ها»: هر فایل یک ردیف (اتمی — آلبومِ چندفایلی هم‌زمان می‌رسد) */
async function addAttachment(env, api, chat, ex, f, file) {
  const cnt = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM tg_uploads WHERE expert_id=? AND state='attach' AND done_at IS NULL AND json_extract(options_json,'$.flow')=?",
  ).bind(ex.id, f.id).first();
  const n = (cnt && cnt.n) || 0;
  const finKb = (k) => [[{ text: `📦 تحویل (${M(k)} پیوست)`, callback_data: `dv:${f.id}:fin:0` }]];
  if (n >= ATT_MAX) { await api.sendMessage(chat, `سقف ${M(ATT_MAX)} پیوست پر شده؛ «تحویل» را بزنید.`, finKb(n)).catch(() => {}); return { ok: true }; }
  const t = now();
  await env.DB.prepare(
    `INSERT INTO tg_uploads (expert_id,chat_id,file_id,filename,mime,size_bytes,state,assignment_id,options_json,created_at,expires_at)
     VALUES (?,?,?,?,?,?,'attach',?,?,?,?)`,
  ).bind(ex.id, String(chat), file.id, file.name, file.mime, file.size || null, f.assignment_id, JSON.stringify({ flow: f.id, kind: file.kind }), t, t + MODE_TTL).run();
  await api.sendMessage(chat, `📎 پیوست ${M(n + 1)}: <b>${esc(file.name)}</b>`, finKb(n + 1)).catch(() => {});
  return { ok: true };
}

/** ساختن اسناد انتخابی و فرستادنِ همه با هم — اسناد، بعد پیوست‌ها، بعد یک خلاصه */
async function deliverSend(env, api, chat, ex, f, d, mid) {
  const aid = f.assignment_id;
  /* دو بار زدنِ «تحویل» دو بسته نمی‌فرستد */
  const claim = await env.DB.prepare("UPDATE tg_flows SET step='sent', done_at=? WHERE id=? AND done_at IS NULL").bind(now(), f.id).run();
  if (!claim.meta.changes) return { ok: true };
  const settings = await getSettings(env);
  const b = await bundleData(env, aid, settings, env.COMPANY || "تونل سد آریانا");
  if (b.assignment.expert_id !== ex.id) return { ok: true };
  const id = b.request.id, files = [], notes = [];
  if (mid) await api.editMessageText(chat, mid, `📦 در حال آماده کردن اسناد درخواست <b>${esc(id)}</b>…`).catch(() => {});

  if (d.docs.req) {
    try { files.push({ name: `درخواست-خرید-${id}.docx`, blob: await renderRequestDoc(b) }); }
    catch (e) { notes.push(`⚠️ درخواست خرید ساخته نشد: ${esc(e.message)}`); }
  }
  if (d.docs.letter) {
    const store = storage(env);
    const obj = b.letter && b.letter.docx_key && store ? await store.get(b.letter.docx_key).catch(() => null) : null;
    if (obj) files.push({ name: `نامه-${id}.docx`, blob: new Blob([await new Response(obj.body).arrayBuffer()], { type: DOCX_MIME }) });
    else notes.push("⚠️ فایل نامه پیدا نشد.");
  }
  const finals = b.quotes.filter((q) => q.final && q.saved);
  if (d.docs.table) {
    if (!finals.length) notes.push("⚠️ جدول کمیسیون خطِ «تأیید نهایی» ندارد و فرستاده نشد.");
    else {
      /* جدولی که این‌جا ساخته می‌شود همان تولید جدول است: شمارهٔ فرم (اگر هنوز ندارد) همین‌جا داده می‌شود */
      b.commission_no = await recordCommission(env, aid, { expertId: ex.id, channel: "telegram" });
      files.push({ name: `کمیسیون-${id}.xlsx`, blob: await commissionXlsx({ ...b, notes: b.assignment.notes }) });
    }
  }
  const atts = d.docs.att ? ((await env.DB.prepare(
    "SELECT * FROM tg_uploads WHERE expert_id=? AND state='attach' AND done_at IS NULL AND json_extract(options_json,'$.flow')=? ORDER BY id LIMIT ?",
  ).bind(ex.id, f.id, ATT_MAX).all()).results || []) : [];

  const t = now();
  const stmts = [env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)")
    .bind(t, `expert:${ex.id}`, "deliver", id, JSON.stringify({ assignment_id: aid, files: files.map((x) => x.name), attachments: atts.length, channel: "telegram" }))];
  /* جدولی که این‌جا ساخته و فرستاده شد، همان تولید جدول است — مرحله سبز می‌شود (commission_at را markCommission زد) */
  if (d.docs.table && finals.length) {
    stmts.push(env.DB.prepare("UPDATE alerts SET canceled_at=? WHERE assignment_id=? AND kind='stage' AND fired_at IS NULL AND canceled_at IS NULL").bind(t, aid));
  }
  if (atts.length) stmts.push(env.DB.prepare(`UPDATE tg_uploads SET state='done', done_at=? WHERE id IN (${atts.map(() => "?").join(",")})`).bind(t, ...atts.map((a) => a.id)));
  await env.DB.batch(stmts);

  let sent = 0;
  const failed = [];
  for (const x of files) {
    try { await api.sendDocument(chat, x.name, x.blob); sent++; } catch (e) { failed.push(x.name); }
  }
  for (const a of atts) {
    /* فایلِ تلگرام با همان نوعی دوباره فرستاده می‌شود که آمده بود (عکس با sendPhoto) */
    const kind = uploadOpts(a).kind;
    const [method, field] = kind === "photo" ? ["sendPhoto", "photo"] : kind === "video" ? ["sendVideo", "video"] : ["sendDocument", "document"];
    try { await api.call(method, { chat_id: chat, [field]: a.file_id, caption: `📎 پیوست — ${a.filename || ""}`.slice(0, 1000) }); sent++; }
    catch (e) { failed.push(a.filename || "پیوست"); }
  }
  await api.sendMessage(chat, [
    `✅ <b>تحویل درخواست ${esc(id)}</b> — ${M(sent)} فایل`,
    ...notes,
    failed.length ? `⚠️ فرستاده نشد: ${esc(failed.join("، "))}` : "",
    "<i>درخواست تا «خاتمه» در کارتابل می‌ماند.</i>",
  ].filter(Boolean).join("\n"), [[{ text: "🔒 خاتمه (تأیید کمیسیون)", callback_data: `cm:${aid}:card:0` }], navRow(aid)]).catch(() => {});
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* گفت‌وگوهای چندمرحله‌ای (tg_flows)                                     */
/*                                                                      */
/* سه جور گفت‌وگو، هر کدام با قاعدهٔ بسته‌شدنِ خودش:                      */
/*   پرسشِ متنی (field، notes، manual، smart): پاسخِ متنیِ بعدی را        */
/*     می‌گیرد؛ هر پرسشِ تازه پرسش‌های قبلی را می‌بندد.                  */
/*   حالتِ فایل (await_pf، deliver): معنای فایلِ بعدی را تعیین می‌کند؛     */
/*     با باز شدنِ حالتِ دیگر یا رفتن به درخواستِ دیگر بسته می‌شود.       */
/*   کارتِ انتخاب (hsel، hist، smsel، qtab، lsub): فقط دکمه؛ با شناسه‌اش   */
/*     صدا زده می‌شود و به بقیه کاری ندارد.                              */
/* ------------------------------------------------------------------ */

const FLOW_TTL = 2 * 3600000;
/* جوابِ تأمین‌کننده و جمع کردنِ پیوست‌ها ممکن است ساعت‌ها طول بکشد */
const MODE_TTL = 24 * 3600000;

const INPUT_STEPS = `((kind='field' AND step='need_value') OR (kind='notes' AND step='need_notes')
  OR (kind='manual' AND step='need_supplier') OR (kind='smart' AND step IN ('need_brand','need_specs','need_notes2'))
  OR (kind='tpl' AND step IN ('need_title','need_body','edit_title','edit_body')))`;

/** آخرین پرسشِ متنیِ باز همین کارشناس */
async function inputFlow(env, expertId) {
  return env.DB.prepare(`SELECT *, COALESCE(asked_at, created_at) AS at FROM tg_flows
    WHERE expert_id=? AND done_at IS NULL AND expires_at>? AND ${INPUT_STEPS} ORDER BY at DESC, id DESC LIMIT 1`).bind(expertId, now()).first();
}
async function closeInputs(env, expertId) {
  await env.DB.prepare(`UPDATE tg_flows SET done_at=? WHERE expert_id=? AND done_at IS NULL AND ${INPUT_STEPS}`).bind(now(), expertId).run();
}
/** حالت‌های فایل را می‌بندد؛ `keepAid` اگر باشد، حالتِ همان درخواست می‌ماند */
async function endModes(env, expertId, keepAid) {
  await env.DB.prepare("UPDATE tg_flows SET step='ended', done_at=? WHERE expert_id=? AND done_at IS NULL AND kind IN ('await_pf','deliver') AND assignment_id IS NOT ?")
    .bind(now(), expertId, keepAid == null ? null : keepAid).run();
}

async function newFlow(env, ex, chat, kind, step, aid, data, ttl = FLOW_TTL) {
  const t = now();
  const json = JSON.stringify(data || {});
  const r = await env.DB.prepare(
    "INSERT INTO tg_flows (expert_id,chat_id,kind,step,assignment_id,data_json,created_at,expires_at,asked_at) VALUES (?,?,?,?,?,?,?,?,?)",
  ).bind(ex.id, String(chat), kind, step, aid || null, json, t, t + ttl, t).run();
  return { id: r.meta.last_row_id, expert_id: ex.id, chat_id: String(chat), kind, step, assignment_id: aid || null, data_json: json, created_at: t, expires_at: t + ttl, done_at: null };
}
async function saveFlow(env, fid, d, step) {
  if (step) await env.DB.prepare("UPDATE tg_flows SET data_json=?, step=? WHERE id=?").bind(JSON.stringify(d), step, fid).run();
  else await env.DB.prepare("UPDATE tg_flows SET data_json=? WHERE id=?").bind(JSON.stringify(d), fid).run();
}
/** گفت‌وگوی همین کارشناس از همین نوع (INV-11) */
const ownFlow = (env, ex, fid, kind) => env.DB.prepare("SELECT * FROM tg_flows WHERE id=? AND expert_id=? AND kind=?").bind(fid, ex.id, kind).first();
const flowData = (f) => { try { return JSON.parse((f && f.data_json) || "{}"); } catch (_) { return {}; } };
const toggleIn = (arr, v) => { const a = Array.isArray(arr) ? [...arr] : []; const i = a.indexOf(v); if (i >= 0) a.splice(i, 1); else a.push(v); return a; };

/** اقلام باز یک ارجاع، به ترتیب سطر */
async function itemsOf(env, aid) {
  return (await env.DB.prepare(
    "SELECT id, line_no, title, qty, unit, spec, code, hist_code FROM items WHERE assignment_id=? AND state='open' ORDER BY line_no",
  ).bind(aid).all()).results || [];
}

/** «۱۲٬۳۴۵٬۶۷۸» — جداکنندهٔ هزارگان فارسی */
const money = (n) => M(Number(n || 0).toLocaleString("en-US")).replace(/,/g, "٬");

async function onCallback(env, cq) {
  const api = telegram(env);
  /* تأیید فشردن دکمه فقط ساعت‌شنی تلگرام را برمی‌دارد. اگر شکست بخورد نباید
     تغییر وضعیتی که کاربر خواسته را لغو کند، پس خطایش بلعیده می‌شود. */
  const ack = (text, alert) => api.answerCallback(cq.id, text, alert).catch(() => {});
  const chat = cq.message && cq.message.chat && cq.message.chat.id;
  const [action, , idRaw] = T(cq.data).split(":");
  const id = parseInt(idRaw, 10);

  /* دکمهٔ مدیر پیش از احراز کارشناس می‌آید: از کانال مدیر زده می‌شود، نه از
     گفت‌وگوی یک کارشناس. mseen:<assignmentId> */
  if (action === "mseen") {
    const mgr = await settingValue(env, "managerChat");
    if (!mgr || String(chat) !== String(mgr)) { await ack("این دکمه فقط از کانال مدیر کار می‌کند.", true); return { ok: true }; }
    await markManagerSeen(env, parseInt(T(cq.data).split(":")[1], 10));
    await ack("از میز کار برداشته شد ✅");
    if (cq.message) {
      await api.editMessageText(chat, cq.message.message_id,
        (cq.message.text ? esc(cq.message.text) : "✅ درخواست بسته شد")
        + "\n\n<i>✅ مدیر مشاهده کرد — از میز کار برداشته شد.</i>").catch(() => {});
    }
    return { ok: true };
  }

  /* تصمیم مدیر روی درخواستِ کارشناس: mdec:<decisionId>:ok|no */
  if (action === "mdec") {
    const mgr = await settingValue(env, "managerChat");
    if (!mgr || String(chat) !== String(mgr)) { await ack("این دکمه فقط از کانال مدیر کار می‌کند.", true); return { ok: true }; }
    const [, didRaw, verdict] = T(cq.data).split(":");
    const did = parseInt(didRaw, 10);
    if (verdict === "ok") {
      try {
        const res = await approveDecision(env, did, "telegram");
        await ack("تأیید شد ✅");
        if (cq.message) await api.editMessageText(chat, cq.message.message_id,
          (cq.message.text ? esc(cq.message.text) : "") + `\n\n<b>✅ تأیید شد</b> — ${M(res.closed || 0)} قلم بسته شد${res.fullyClosed ? "؛ درخواست به‌کل بسته شد." : "."}`).catch(() => {});
      } catch (e) { await ack(String(e.message || "نشد").slice(0, 180), true); }
      await drainOutbox(env, 10).catch(() => {});
      return { ok: true };
    }
    if (verdict === "no") {
      /* دلیل لازم است؛ پیام بعدیِ مدیر (در پاسخ به همین پیام) دلیل است */
      await env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('mgrReject',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
        .bind(JSON.stringify({ decision_id: did, at: now() }), now()).run();
      await ack("دلیل رد را بنویسید");
      await api.sendMessage(chat, "❌ <b>رد شد.</b> لطفاً <b>در پاسخ (Reply) به همین پیام</b> بنویسید چرا — همان متن برای کارشناس فرستاده می‌شود.\n\n<i>اگر نمی‌خواهید دلیلی بنویسید، فقط بنویسید «بدون دلیل».</i>").catch(() => {});
      return { ok: true };
    }
    await ack();
    return { ok: true };
  }

  const ex = chat ? await expertOfChat(env, chat) : null;
  if (!ex) { await ack("این گفت‌وگو به کارشناسی وصل نیست.", true); return { ok: true }; }
  /* همهٔ دکمه‌ها action:a:b:c اند */
  const parts = T(cq.data).split(":");
  const num = (i) => parseInt(parts[i], 10);
  const mid = cq.message && cq.message.message_id;

  if (action === "seen" && id) {
    /* مالکیت (INV-11): فقط ارجاع خودِ همین کارشناس */
    const a = await env.DB.prepare("SELECT id, viewed_at FROM assignments WHERE id=? AND expert_id=?").bind(id, ex.id).first();
    if (!a) { await ack("این ارجاع متعلق به شما نیست.", true); return { ok: true }; }
    if (!a.viewed_at) {
      await env.DB.batch([
        env.DB.prepare("UPDATE assignments SET viewed_at=COALESCE(viewed_at,?) WHERE id=?").bind(now(), id),
        env.DB.prepare("UPDATE alerts SET canceled_at=? WHERE assignment_id=? AND kind='stage' AND stage=0 AND fired_at IS NULL").bind(now(), id),
        env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)")
          .bind(now(), `expert:${ex.id}`, "viewed", null, JSON.stringify({ assignment_id: id, channel: "telegram" })),
      ]);
    }
    await ack("ثبت شد ✅");
    if (cq.message) {
      await api.editMessageText(chat, mid, cq.message.text
        ? esc(cq.message.text) + "\n\n<i>✅ مشاهده ثبت شد</i>" : "✅ مشاهده ثبت شد", firstStepsKb(id)).catch(() => {});
    }
    return { ok: true };
  }

  /* کارتابل: kt:n پیام تازه · kt:e همان پیام */
  if (action === "kt") { await ack(); return kartabl(env, api, chat, ex, { mid: parts[1] === "e" ? mid : null }); }

  /* مسیر درخواست: rq:<aid>:<مقصد>[:e] — m منو · t تب استعلامات · f خط دستی · n توضیحات · l نامه · d تحویل */
  if (action === "rq") {
    const aid = num(1), target = parts[2] || "m", edit = parts[3] === "e" ? mid : null;
    await ack();
    /* فایلِ بعدی نباید به حالتِ بازِ درخواستِ دیگری بچسبد */
    await endModes(env, ex.id, aid);
    if (target === "t") return quotesTab(env, api, chat, ex, aid, edit);
    if (target === "f") return manualStart(env, api, chat, ex, aid);
    if (target === "n") return notesAsk(env, api, chat, ex, aid);
    if (target === "l") return startLetter(env, api, chat, ex, aid);
    if (target === "d") return deliverOpen(env, api, chat, ex, aid, edit);
    return requestMenu(env, api, chat, ex, aid, { mid: edit });
  }

  /* بررسی سوابق: hs:a:<aid>. (hs:s و hs:i دکمه‌های پیام‌های قدیمی‌اند و به همان مسیرها می‌رسند) */
  if (action === "hs") {
    const v = num(2);
    if (parts[1] === "s") {
      if (!env.ANTHROPIC_API_KEY) { await ack("جستجوی هوشمند هنوز به مدل وصل نشده است.", true); return { ok: true }; }
      await ack();
      return smartPickItem(env, api, chat, ex, v);
    }
    let aid = v;
    if (parts[1] === "i") {
      const it = await env.DB.prepare("SELECT i.assignment_id FROM items i JOIN assignments a ON a.id=i.assignment_id WHERE i.id=? AND a.expert_id=?").bind(v, ex.id).first();
      aid = it ? it.assignment_id : 0;
    }
    await ack();
    return histStart(env, api, chat, ex, aid, null);
  }

  /* کارت انتخاب اقلامِ سوابق: hx:<flow>:t:<item> · go · all · more · back */
  if (action === "hx") {
    const f = await ownFlow(env, ex, num(1), "hsel");
    if (!f) { await ack("این فهرست دیگر پیدا نمی‌شود.", true); return { ok: true }; }
    const asg = await ownOpenAssignment(env, ex.id, f.assignment_id);
    if (!asg) { await ack("این درخواست دیگر فعال نیست.", true); return { ok: true }; }
    const d = flowData(f), step = parts[2], v = num(3);
    const its = await itemsOf(env, f.assignment_id);
    if (step === "t") {
      if (its.some((i) => i.id === v)) d.sel = toggleIn(d.sel, v);
      await saveFlow(env, f.id, d);
      await ack();
      return histSelCard(api, chat, f, d, its, asg, mid);
    }
    if (step === "go" || step === "all") {
      const ids = step === "all" ? its.map((i) => i.id) : (d.sel || []);
      if (!ids.length) { await ack("دست‌کم یک قلم را تیک بزنید، یا «همه اقلام».", true); return { ok: true }; }
      await ack("در حال محاسبه…");
      return histRun(env, api, chat, ex, f, { ...d, ran: [], opts: {} }, asg, ids, mid);
    }
    if (step === "more") {
      await ack("در حال محاسبه…");
      if (!(d.rest || []).length) return histAfter(env, api, chat, ex, f, d, mid);
      return histRun(env, api, chat, ex, f, d, asg, d.rest, mid);
    }
    if (step === "back") {
      await ack();
      return d.single ? requestMenu(env, api, chat, ex, f.assignment_id, { mid }) : histSelCard(api, chat, f, d, its, asg, mid);
    }
    await ack();
    return { ok: true };
  }

  /* انتخاب قلم بعد از پیامِ سوابق: hp:<flow>:<item> · hp:<flow>:ls (فهرست) */
  if (action === "hp") {
    const f = await ownFlow(env, ex, num(1), "hsel");
    if (!f) { await ack("این فهرست دیگر پیدا نمی‌شود.", true); return { ok: true }; }
    await ack();
    if (parts[2] === "ls") return hub(api, chat, f.assignment_id, `p${f.id}`, mid);
    return histSupplierCard(env, api, chat, ex, f, flowData(f), num(2), "p", mid);
  }

  /* کارت تأمین‌کنندگانِ سوابق: hf:<flow>:t:<i> · go · ls · back */
  if (action === "hf") {
    const f = await ownFlow(env, ex, num(1), "hist");
    if (!f) { await ack("این فهرست دیگر پیدا نمی‌شود.", true); return { ok: true }; }
    return supplierCardAction(env, api, chat, ex, f, parts[2], num(3), mid, ack);
  }

  /* «بازگشت» از پنج راه: hb:h<flow> سوابق · hb:s<flow> جستجو · hb:p<flow> انتخاب قلم */
  if (action === "hb") {
    const tag = parts[1] || "";
    const kind = { h: "hist", s: "smsel", p: "hsel" }[tag[0]];
    const f = kind ? await ownFlow(env, ex, parseInt(tag.slice(1), 10), kind) : null;
    if (!f) { await ack("این فهرست دیگر پیدا نمی‌شود.", true); return { ok: true }; }
    await ack();
    if (kind === "hsel") return histPicker(env, api, chat, f, flowData(f), mid);
    return supplierCard(env, api, chat, f, flowData(f), mid);
  }

  /* جستجوی هوشمند: sm:a:<aid> انتخاب قلم · sm:i:<item> کارت قیدها · sf:<flow>:… قیدها و اجرا */
  if (action === "sm") {
    if (!env.ANTHROPIC_API_KEY) { await ack("جستجوی هوشمند هنوز به مدل وصل نشده است.", true); return { ok: true }; }
    await ack();
    if (parts[1] === "i") return smartPrefsCard(env, api, chat, ex, num(2));
    return smartPickItem(env, api, chat, ex, num(2));
  }

  if (action === "sf") {
    const [, fidRaw, step, valRaw] = T(cq.data).split(":");
    const f = await env.DB.prepare("SELECT * FROM tg_flows WHERE id=? AND expert_id=? AND kind='smart'").bind(parseInt(fidRaw, 10), ex.id).first();
    if (!f || f.done_at) { await ack("این گفت‌وگو دیگر فعال نیست.", true); return { ok: true }; }
    const d = flowData(f);
    const mid = f.message_id || (cq.message && cq.message.message_id);
    if (step === "x") {
      await env.DB.prepare("UPDATE tg_flows SET step='canceled', done_at=? WHERE id=?").bind(now(), f.id).run();
      await ack("لغو شد");
      if (mid) await api.editMessageText(chat, mid, "✖️ جستجوی هوشمند لغو شد.").catch(() => {});
      return { ok: true };
    }
    if (step === "mk") { await ack(); return smartMarketMenu(env, api, chat, f, d, mid); }
    /* نتایج جستجوهای قبلیِ همین قلم — بعد کارت قیدها دوباره، تا جستجوی تازه هم ممکن باشد */
    if (step === "pv") {
      const it = await smartItemOf(env, ex.id, d.itemId);
      if (!it) { await ack("این قلم دیگر در دسترس نیست.", true); return { ok: true }; }
      await ack();
      const list = (await itemSearches(env, it, 3)).reverse();
      for (const s of list) {
        const n = ((s.result && s.result.suppliers) || []).length;
        await smartResultsMessage(env, api, chat, ex, it, null, { result: s.result, cost: s.cost, search_id: s.search_id }, {
          head: `📜 <b>جستجوی قبلی «${esc(short(it.title, 40))}»</b> — ${M(n)} تأمین‌کننده\n`
            + `<i>${esc(fmtFa(s.created_at))} · ${esc(s.expert || "—")}${s.request_id ? ` · درخواست ${esc(s.request_id)}` : ""}</i>`,
        });
      }
      await env.DB.prepare("UPDATE tg_flows SET message_id=NULL WHERE id=?").bind(f.id).run();
      return smartPrefsRender(env, api, chat, f, d, null);
    }
    if (step === "m") {
      const k = (MARKETS[parseInt(valRaw, 10)] || {}).key;
      d.markets = d.markets || [];
      /* سقف هزینهٔ هر جستجو: بیش از سه بازار میان پنج جستجو پخش نمی‌شود */
      if (k && !d.markets.includes(k) && d.markets.length >= MAX_MARKETS) {
        await ack("حداکثر سه بازار در هر جستجو؛ اول تیک یکی را بردارید.", true);
        return { ok: true };
      }
      if (k) { const i = d.markets.indexOf(k); if (i >= 0) d.markets.splice(i, 1); else d.markets.push(k); }
      await env.DB.prepare("UPDATE tg_flows SET data_json=? WHERE id=?").bind(JSON.stringify(d), f.id).run();
      await ack();
      return smartMarketMenu(env, api, chat, f, d, mid);
    }
    if (step === "back") { await ack(); return smartPrefsRender(env, api, chat, f, d, mid); }
    if (step === "br" || step === "sp" || step === "no") {
      const st2 = step === "br" ? "need_brand" : step === "sp" ? "need_specs" : "need_notes2";
      await env.DB.prepare("UPDATE tg_flows SET step=?, asked_at=? WHERE id=?").bind(st2, now(), f.id).run();
      await ack();
      await api.sendMessage(chat, step === "br" ? "🏷 نام برند موردنظر را بنویسید (برای پاک‌کردن: -)"
        : step === "sp" ? "📋 مشخصات فنی موردنظر را بنویسید (برای پاک‌کردن: -)"
        : "📝 ملاحظات جستجو را بنویسید (برای پاک‌کردن: -)").catch(() => {});
      return { ok: true };
    }
    if (step === "go") {
      if (!(d.markets || []).length) { await ack("دست‌کم یک بازار انتخاب کنید.", true); return { ok: true }; }
      const it = await smartItemOf(env, ex.id, d.itemId);
      if (!it) { await ack("این قلم دیگر در دسترس نیست.", true); return { ok: true }; }
      /* اجرا در صف: Cron برش می‌دارد (runSmartJobs) — waitUntil برای کار چنددقیقه‌ای کوتاه است */
      const t = now();
      await env.DB.batch([
        env.DB.prepare("UPDATE tg_flows SET step='queued', done_at=? WHERE id=?").bind(t, f.id),
        env.DB.prepare("INSERT INTO smart_jobs (item_id,assignment_id,expert_id,chat_id,params_json,state,created_at) VALUES (?,?,?,?,?,'queued',?)")
          .bind(it.id, it.aid, ex.id, String(chat), JSON.stringify({ markets: d.markets, brand: d.brand || "", specs: d.specs || "", notes: d.notes || "" }), t),
      ]);
      await ack("در صف اجرا");
      const note = `🔎 <b>جستجوی هوشمند «${esc(short(d.title || it.title, 40))}»</b>\n\n⏳ در صف اجرا گذاشته شد. اجرا تا یکی-دو دقیقه شروع می‌شود و معمولاً چند دقیقه طول می‌کشد؛ نتیجه همین‌جا می‌آید.`;
      if (mid) await api.editMessageText(chat, mid, note).catch(() => api.sendMessage(chat, note).catch(() => {}));
      else await api.sendMessage(chat, note).catch(() => {});
      return { ok: true };
    }
    await ack(); return { ok: true };
  }

  /* نتیجهٔ جستجو: sq:<search>:open (کارت انتخاب) · sq:<flow>:t:<i> · go · ls · back */
  if (action === "sq") {
    if (parts[2] === "open") { await ack(); return smartSelOpen(env, api, chat, ex, num(1), mid, num(3)); }
    const f = await ownFlow(env, ex, num(1), "smsel");
    if (!f) { await ack("این فهرست دیگر پیدا نمی‌شود.", true); return { ok: true }; }
    return supplierCardAction(env, api, chat, ex, f, parts[2], num(3), mid, ack);
  }

  if (action === "sg") {
    /* sg:<search>:open:<item> · sg:<search>:p:<i>:<item> · sg:<search>:t:<i>:<template>:<item> */
    const [, sidRaw, step, aRaw, bRaw, cRaw] = T(cq.data).split(":");
    const sr = await searchById(env, parseInt(sidRaw, 10));
    const sit = await searchItemFor(env, ex, sr, parseInt(step === "open" ? aRaw : step === "p" ? bRaw : cRaw, 10) || 0);
    if (!sit) { await ack("این جستجو پیدا نشد.", true); return { ok: true }; }
    const sup = (sr.result && sr.result.suppliers) || [];
    if (step === "open") {
      await ack();
      const kb = sup.map((s2, i) => [{ text: short(s2.name, 34), callback_data: `sg:${sr.search_id}:p:${i}:${sit.id}` }]);
      kb.push([{ text: "↩️ بازگشت", callback_data: `sg:${sr.search_id}:ch:${sit.id}` }], navRow(sit.aid));
      await show(api, chat, mid, "✉️ پیام برای کدام تأمین‌کننده آماده شود؟", kb);
      return { ok: true };
    }
    /* بازگشت از فهرست تأمین‌کنندگان ← همان دو گزینهٔ زیر نتیجهٔ جستجو */
    if (step === "ch") {
      await ack();
      await show(api, chat, mid, "🔎 با نتایج جستجو چه کنم؟", [...smartChoiceKb(sr.search_id, sit.id), navRow(sit.aid)]);
      return { ok: true };
    }
    if (step === "p") {
      const i = parseInt(aRaw, 10); const s2 = sup[i];
      if (!s2) { await ack("گزینهٔ نامعتبر.", true); return { ok: true }; }
      await ack();
      return templatePick(env, api, chat, ex, sr, i, s2, mid, sit.id);
    }
    if (step === "t") {
      const i = parseInt(aRaw, 10), tplId = parseInt(bRaw, 10);
      const s2 = sup[i];
      const tpl = await ownTemplate(env, ex.id, tplId);
      if (!s2 || !tpl) { await ack("پیدا نشد.", true); return { ok: true }; }
      const itRow = sit;
      await ack();
      const text = fillTemplate(tpl.body, { supplier: s2.name, item: itRow, expertName: ex.name });
      /* همان «کپی پیام» پنل: دکمهٔ کپیِ تلگرام متن را عیناً در کلیپ‌بورد می‌گذارد (سقف ۲۵۶ نویسه)؛
         متن بلندتر با لمسِ بلوکِ <code> کپی می‌شود. */
      const kb = [];
      if (text.length <= 256) kb.push([{ text: "📋 کپی پیام", copy_text: { text } }]);
      kb.push([{ text: "✉️ قالب دیگر", callback_data: `sg:${sr.search_id}:p:${i}:${sit.id}` }, { text: "🗂 قالب‌های پیام", callback_data: `tp:ls:0:${sr.search_id}:${i}:${sit.id}` }]);
      kb.push([{ text: "↩️ بازگشت", callback_data: `sg:${sr.search_id}:p:${i}:${sit.id}` }], navRow(sit.aid));
      await api.sendMessage(chat, `✉️ <b>${esc(tpl.title)}</b> — برای ${esc(short(s2.name, 36))}\n\n<code>${esc(text)}</code>\n\n<i>${text.length <= 256 ? "«کپی پیام» را بزنید" : "روی متن بزنید تا کپی شود"} و در کانال دلخواه بفرستید.</i>`, kb).catch(() => {});
      return { ok: true };
    }
    await ack(); return { ok: true };
  }

  /* قالب‌های پیام: tp:<step>:<id>[:sid:i] — ls فهرست · v نمایش · new · et/eb ویرایش عنوان/متن · dl/dk حذف */
  if (action === "tp") return onTemplateAction(env, api, chat, ex, parts, mid, ack);

  /* تب استعلامات: qt:<aid> · qx:<flow>:t:<quote> · all · pf (دریافت پیش‌فاکتور) · new (خط دستی) · ed (کارت‌ها) · back */
  if (action === "qt") { await ack(); return quotesTab(env, api, chat, ex, num(1), null); }
  if (action === "qx") {
    const f = await ownFlow(env, ex, num(1), "qtab");
    if (!f || f.done_at) { await ack("این فهرست دیگر فعال نیست؛ تب استعلامات را دوباره باز کنید.", true); return { ok: true }; }
    const asg = await ownOpenAssignment(env, ex.id, f.assignment_id);
    if (!asg) { await ack("این درخواست دیگر فعال نیست.", true); return { ok: true }; }
    const d = flowData(f), step = parts[2], v = num(3);
    if (step === "t" || step === "all") {
      const rows = await qtabRows(env, f.assignment_id);
      if (step === "t") { if (rows.some((q) => q.id === v)) d.sel = toggleIn(d.sel, v); }
      else d.sel = (d.sel || []).length === rows.length ? [] : rows.map((q) => q.id);
      await saveFlow(env, f.id, d);
      await ack();
      return qtabRender(env, api, chat, f, d, asg, mid);
    }
    if (step === "pf") {
      if (!(d.sel || []).length) { await ack("اول خط‌هایی را که منتظر پیش‌فاکتورشان هستید تیک بزنید.", true); return { ok: true }; }
      await ack("منتظر پیش‌فاکتور");
      return awaitStart(env, api, chat, ex, f, d, mid);
    }
    if (step === "del") {
      if (!(d.sel || []).length) { await ack("اول خط‌هایی را که می‌خواهید حذف شوند تیک بزنید.", true); return { ok: true }; }
      await ack();
      return qtabDeleteConfirm(env, api, chat, f, d, mid);
    }
    if (step === "delok") { await ack("در حال حذف…"); return qtabDelete(env, api, chat, ex, f, d, asg, mid); }
    if (step === "new") { await ack(); return manualStart(env, api, chat, ex, f.assignment_id); }
    if (step === "ed") {
      const firsts = [];
      for (const q of await qtabRows(env, f.assignment_id)) if (!firsts.some((x) => x.supplier_name === q.supplier_name)) firsts.push(q);
      await ack();
      const kb = firsts.map((q) => [{ text: `✏️ ${short(q.supplier_name, 32)}`, callback_data: `qc:${q.id}:0` }]);
      kb.push([{ text: "↩️ بازگشت", callback_data: `qx:${f.id}:back:0` }]);
      return show(api, chat, mid, "✏️ کارت استعلامِ کدام تأمین‌کننده؟", kb);
    }
    if (step === "back") { await ack(); return qtabRender(env, api, chat, f, d, asg, mid); }
    await ack();
    return { ok: true };
  }

  /* دریافت پیش‌فاکتور: aw:<flow>:x (پایان) · aw:<flow>:s:<i>:<upload> (فایل مالِ کدام تأمین‌کنندهٔ منتظر است) */
  if (action === "aw") {
    const f = await ownFlow(env, ex, num(1), "await_pf");
    if (!f) { await ack("پیدا نشد.", true); return { ok: true }; }
    if (parts[2] === "x") {
      await env.DB.prepare("UPDATE tg_flows SET step='ended', done_at=COALESCE(done_at,?) WHERE id=?").bind(now(), f.id).run();
      await ack("دریافت بسته شد");
      return show(api, chat, mid, "✖️ حالت «دریافت پیش‌فاکتور» بسته شد؛ فایلِ بعدی دوباره می‌پرسد برای کدام درخواست و اقلام است.",
        [[{ text: "🧾 تب استعلامات", callback_data: `qt:${f.assignment_id}` }], navRow(f.assignment_id)]);
    }
    if (parts[2] === "s") {
      const idx = num(3), up = await ownUpload(env, ex, num(4));
      if (f.step === "ended") { await ack("حالت دریافت بسته شده؛ فایل را دوباره بفرستید.", true); return { ok: true }; }
      if (!up || up.done_at) { await ack("این فایل قبلاً ثبت یا لغو شده است."); return { ok: true }; }
      if (!(flowData(f).want || [])[idx]) { await ack("گزینهٔ نامعتبر.", true); return { ok: true }; }
      await ack();
      return receiveAwaited(env, api, chat, ex, f.id, idx, up, mid);
    }
    await ack();
    return { ok: true };
  }

  /* خط استعلام دستی: mn:<flow>:s:<i> · t:<item> · all · go · x */
  if (action === "mn") {
    const f = await ownFlow(env, ex, num(1), "manual");
    if (!f || f.done_at) { await ack("این گفت‌وگو دیگر فعال نیست.", true); return { ok: true }; }
    const d = flowData(f), step = parts[2], v = num(3);
    if (step === "x") {
      await env.DB.prepare("UPDATE tg_flows SET step='canceled', done_at=? WHERE id=?").bind(now(), f.id).run();
      await ack("لغو شد");
      return show(api, chat, mid, "✖️ خط استعلام دستی لغو شد.", [[{ text: "🧾 تب استعلامات", callback_data: `qt:${f.assignment_id}` }]]);
    }
    if (step === "s") {
      const name = (d.sups || [])[v];
      if (!name) { await ack("این گزینه معتبر نیست.", true); return { ok: true }; }
      await ack();
      return manualItems(env, api, chat, ex, f, { ...d, supplier: name }, mid);
    }
    if (!d.supplier) { await ack("اول نام تأمین‌کننده را بنویسید.", true); return { ok: true }; }
    if (step === "t" || step === "all") {
      const its = await itemsOf(env, f.assignment_id);
      if (step === "t") { if (its.some((i) => i.id === v)) d.sel = toggleIn(d.sel, v); }
      else d.sel = (d.sel || []).length === its.length ? [] : its.map((i) => i.id);
      await ack();
      return manualItems(env, api, chat, ex, f, d, mid);
    }
    if (step === "go" || step === "pf") {
      if (!(d.sel || []).length) { await ack("دست‌کم یک قلم را تیک بزنید.", true); return { ok: true }; }
      await ack(step === "pf" ? "منتظر پیش‌فاکتور" : "");
      return manualCreate(env, api, chat, ex, f, d, mid, step === "pf");
    }
    await ack();
    return { ok: true };
  }

  /* «دریافت پیش‌فاکتور» از روی کارت استعلام: qw:<quote> — همهٔ خط‌های همان تأمین‌کننده منتظر فایل می‌مانند */
  if (action === "qw") {
    const q = await ownQuote(env, ex.id, num(1));
    if (!q) { await ack("این خط استعلام پیدا نشد.", true); return { ok: true }; }
    await ack("منتظر پیش‌فاکتور");
    return awaitSupplier(env, api, chat, ex, q.assignment_id, q.supplier_name, null);
  }

  /* کارت استعلامِ تأمین‌کنندهٔ یک پیش‌فاکتور: qk:<proforma> */
  if (action === "qk") {
    const p = await env.DB.prepare("SELECT p.assignment_id, p.supplier_name FROM proformas p JOIN assignments a ON a.id=p.assignment_id WHERE p.id=? AND a.expert_id=?")
      .bind(num(1), ex.id).first();
    if (!p) { await ack("این پیش‌فاکتور پیدا نشد.", true); return { ok: true }; }
    await ack();
    return quoteCard(env, api, chat, p.assignment_id, p.supplier_name, null);
  }

  /* کارت استعلام: qf (کدام فیلد؟) · qv (گزینهٔ فهرستی) · qc (کارت) · qe (اصلاح) · qs (ثبت موقت) */
  if (action === "qf" || action === "qv" || action === "qc" || action === "qe" || action === "qs") {
    const [, qidRaw, field, valRaw] = T(cq.data).split(":");
    const q = await ownQuote(env, ex.id, parseInt(qidRaw, 10));
    if (!q) { await ack("این خط استعلام پیدا نشد.", true); return { ok: true }; }
    const mid = cq.message && cq.message.message_id;
    if (action === "qc") { await ack(); return quoteCard(env, api, chat, q.assignment_id, q.supplier_name, mid); }
    if (action === "qe") { await ack(); return editMenu(env, api, chat, q, mid); }
    if (action === "qs") { await ack(); return saveSupplier(env, api, chat, ex, q, mid); }
    if (!LABELS[field]) { await ack("فیلد ناشناخته.", true); return { ok: true }; }
    if (action === "qf") {
      await ack();
      if (ENUMS[field]) return askEnum(api, chat, q, field, mid);
      return askFieldText(env, api, chat, ex, q, field, mid);
    }
    /* qv */
    const v = (ENUMS[field] || [])[parseInt(valRaw, 10)];
    if (!v) { await ack("این گزینه معتبر نیست.", true); return { ok: true }; }
    await ack();
    await setField(env, q, field, v);
    if (field === "place" && v === "سایر") return askFieldText(env, api, chat, ex, q, "place_other", mid);
    return quoteCard(env, api, chat, q.assignment_id, q.supplier_name, mid, `✅ ${esc(fieldLabel(field))}: ${esc(v)}`);
  }

  /* جدول کمیسیون: ct:<aid>:t:<quote> · all · none · nt (درج توضیحات) · go (تولید) · start */
  if (action === "ct") {
    const aid = num(1), step = parts[2];
    if (step === "t") {
      await env.DB.prepare(
        `UPDATE quotes SET final=CASE WHEN final=1 THEN 0 ELSE 1 END, final_at=CASE WHEN final=1 THEN NULL ELSE ? END, updated_at=? WHERE id=? AND assignment_id=? AND saved=1
         AND assignment_id IN (SELECT id FROM assignments WHERE expert_id=?)`,
      ).bind(now(), now(), num(3), aid, ex.id).run();
      await ack();
      return tableSelect(env, api, chat, ex, aid, mid);
    }
    if (step === "all" || step === "none") {
      await env.DB.prepare(
        `UPDATE quotes SET final=?, final_at=${step === "all" ? "COALESCE(CASE WHEN final=1 THEN final_at END, ?)" : "NULL"}, updated_at=?
         WHERE assignment_id=? AND saved=1 AND assignment_id IN (SELECT id FROM assignments WHERE expert_id=?)`,
      ).bind(step === "all" ? 1 : 0, ...(step === "all" ? [now()] : []), now(), aid, ex.id).run();
      await ack();
      return tableSelect(env, api, chat, ex, aid, mid);
    }
    if (step === "nt") { await ack(); return notesAsk(env, api, chat, ex, aid); }
    if (step === "go") { await ack("در حال ساختن…"); return makeTable(env, api, chat, ex, aid, mid); }
    await ack();
    return tableSelect(env, api, chat, ex, aid, null);
  }

  /* تأیید کمیسیون و خاتمه: cm:<aid>:t:<item> · all · none · end · card */
  if (action === "cm") {
    const aid = num(1), step = parts[2];
    const own = await env.DB.prepare("SELECT id FROM assignments WHERE id=? AND expert_id=?").bind(aid, ex.id).first();
    if (!own) { await ack("این ارجاع متعلق به شما نیست.", true); return { ok: true }; }
    if (step === "t") {
      await env.DB.prepare("UPDATE items SET commission_ok=CASE WHEN commission_ok=1 THEN 0 ELSE 1 END WHERE id=? AND assignment_id=? AND state='open'")
        .bind(num(3), aid).run();
      await ack();
      return closeCard(env, api, chat, ex, aid, mid);
    }
    if (step === "all" || step === "none") {
      await env.DB.prepare("UPDATE items SET commission_ok=? WHERE assignment_id=? AND state='open'").bind(step === "all" ? 1 : 0, aid).run();
      await ack();
      return closeCard(env, api, chat, ex, aid, mid);
    }
    if (step === "end") {
      let res;
      try { res = await expertDecision(env, ex, aid, { action: "end" }); }
      catch (e) { await ack(String(e.message || "نشد").slice(0, 180), true); return { ok: true }; }
      await ack(res.pending ? "برای تأیید مدیر رفت" : "بسته شد ✅");
      const txt = res.pending
        ? `🟠 <b>خاتمهٔ ${M(res.items)} قلم برای تأیید مدیر فرستاده شد.</b>\nتا تأیید یا ردِ او، درخواست در کارتابل شما می‌ماند و نتیجه همین‌جا می‌آید.`
        : `🔒 <b>${M(res.closed)} قلم بسته شد.</b>` + (res.fullyClosed
          ? "\nهمهٔ اقلام تمام شد و درخواست از کارتابل شما خارج شد. خسته نباشید."
          : "\nباقی اقلام همچنان در کارتابل شماست و پیگیری می‌شود.");
      await show(api, chat, mid, txt, res.fullyClosed ? [[KARTABL_BTN]] : [navRow(aid)]);
      /* پیام‌های صف (اعلان مدیر) بی‌درنگ بروند، نه با Cron بعدی */
      await drainOutbox(env, 10).catch(() => {});
      return { ok: true };
    }
    await ack();
    return closeCard(env, api, chat, ex, aid, null);
  }

  /* تحویل: dvo:<aid> باز کردن · dv:<flow>:t:<سند> · go · nl (بی‌نامه) · na (بی‌پیوست) · fin (فرستادن) */
  if (action === "dvo") { await ack(); return deliverOpen(env, api, chat, ex, num(1), null); }
  if (action === "dv") {
    const f = await ownFlow(env, ex, num(1), "deliver");
    if (!f || f.done_at) { await ack("این تحویل دیگر فعال نیست؛ از منوی درخواست دوباره «تحویل» را بزنید.", true); return { ok: true }; }
    const d = flowData(f), step = parts[2];
    d.docs = d.docs || {};
    if (step === "t") {
      const k = parts[3];
      if (f.step !== "pick" || !DV_DOCS.some(([x]) => x === k)) { await ack("این انتخاب دیگر باز نیست.", true); return { ok: true }; }
      d.docs[k] = d.docs[k] ? 0 : 1;
      await saveFlow(env, f.id, d);
      await ack();
      const asg = await ownOpenAssignment(env, ex.id, f.assignment_id);
      return asg ? deliverCard(api, chat, f, d, asg, mid) : { ok: true };
    }
    if (step === "go") { await ack(); return deliverNext(env, api, chat, ex, f, d, mid); }
    if (step === "nl") {
      d.docs.letter = 0;
      await env.DB.prepare("UPDATE letters SET state='canceled', updated_at=? WHERE assignment_id=? AND expert_id=? AND state IN ('need_voice','transcribed')")
        .bind(now(), f.assignment_id, ex.id).run();
      await saveFlow(env, f.id, d, "pick");
      await ack();
      return deliverNext(env, api, chat, ex, { ...f, step: "pick" }, d, mid);
    }
    if (step === "na") { d.docs.att = 0; await saveFlow(env, f.id, d); await ack(); return deliverSend(env, api, chat, ex, f, d, mid); }
    if (step === "fin") { await ack("در حال فرستادن…"); return deliverSend(env, api, chat, ex, f, d, mid); }
    await ack();
    return { ok: true };
  }

  /* پیش‌فاکتورِ آزاد: pf:<upload>:r:<aid> · t:<item> · all · use · s:<i> · a (تأمین‌کنندهٔ تازه از فایل) · n (نام دستی) · x */
  if (action === "pf") {
    const up = await ownUpload(env, ex, num(1));
    if (!up) { await ack("این بارگذاری پیدا نشد.", true); return { ok: true }; }
    if (up.done_at) { await ack("این فایل قبلاً ثبت یا لغو شده است."); return { ok: true }; }
    const step = parts[2], v = num(3);
    if (step === "x") {
      const store = storage(env);
      if (store && up.storage_key) await store.remove(up.storage_key).catch(() => {});
      await env.DB.prepare("UPDATE tg_uploads SET state='canceled', done_at=? WHERE id=?").bind(now(), up.id).run();
      await ack("لغو شد");
      return show(api, chat, mid, "✖️ لغو شد و فایل حذف شد.", []);
    }
    if (step === "r") {
      const asg = await ownOpenAssignment(env, ex.id, v);
      if (!asg) { await ack("این درخواست دیگر فعال نیست.", true); return { ok: true }; }
      await env.DB.prepare("UPDATE tg_uploads SET assignment_id=?, state='need_items' WHERE id=?").bind(v, up.id).run();
      await ack();
      return uploadItems(env, api, chat, ex, { ...up, assignment_id: v, state: "need_items" }, mid);
    }
    if (!up.assignment_id) { await ack("اول درخواست را انتخاب کنید.", true); return { ok: true }; }
    if (step === "t" || step === "all") {
      const its = await itemsOf(env, up.assignment_id);
      const o = uploadOpts(up);
      if (step === "t") { if (its.some((i) => i.id === v)) o.sel = toggleIn(o.sel, v); }
      else o.sel = (o.sel || []).length === its.length ? [] : its.map((i) => i.id);
      await env.DB.prepare("UPDATE tg_uploads SET options_json=? WHERE id=?").bind(JSON.stringify(o), up.id).run();
      await ack();
      return uploadItems(env, api, chat, ex, { ...up, options_json: JSON.stringify(o) }, mid);
    }
    if (step === "use") {
      if (!idList(uploadOpts(up).sel).length) { await ack("دست‌کم یک قلم را تیک بزنید.", true); return { ok: true }; }
      await ack();
      return uploadSupplier(env, api, chat, ex, up, mid);
    }
    if (step === "s") {
      const o = uploadOpts(up);
      const g = (o.groups || [])[v];
      const name = typeof g === "string" ? g : g && g.n;
      if (!name) { await ack("این گزینه دیگر معتبر نیست.", true); return { ok: true }; }
      await ack();
      return attachProforma(env, api, chat, ex, { aid: up.assignment_id, up, supplier: name, itemIds: o.sel, out: o.read || null, mid });
    }
    if (step === "a") { await ack("در حال خواندن…"); return newQuoteFromFile(env, api, chat, ex, up, mid); }
    if (step === "n") {
      await env.DB.prepare("UPDATE tg_uploads SET state='need_name', asked_at=? WHERE id=?").bind(now(), up.id).run();
      await ack();
      return show(api, chat, mid, `📎 <b>${esc(up.filename)}</b>\n\n<b>نام تأمین‌کننده را بنویسید و بفرستید:</b>`, dropFileKb(up.id));
    }
    await ack();
    return { ok: true };
  }

  /* لغوِ پرسشِ متنی (فیلد، توضیحات): fl:<flow>:x */
  if (action === "fl") {
    const f = await env.DB.prepare("SELECT * FROM tg_flows WHERE id=? AND expert_id=?").bind(num(1), ex.id).first();
    if (!f) { await ack("این گفت‌وگو پیدا نشد.", true); return { ok: true }; }
    if (f.done_at) { await ack("این گفت‌وگو تمام شده است."); return { ok: true }; }
    if (parts[2] === "x") {
      await env.DB.prepare("UPDATE tg_flows SET step='canceled', done_at=? WHERE id=?").bind(now(), f.id).run();
      await ack("لغو شد");
      return show(api, chat, mid, "✖️ لغو شد.", []);
    }
    await ack();
    return { ok: true };
  }

  /* استخراج خودکار: ai:<proforma>:go (دوباره بخوان) · ok · r (ریال) · t (تومان) */
  if (action === "ai") {
    const step = parts[2];
    await ack(step === "go" ? "شروع شد" : "");
    return onExtract(env, api, chat, ex, num(1), step, parts[3], mid);
  }

  /* نامه: lt:<aid>:ask (از نو) · lt:<aid>:x (لغو) · lt:<letter>:go (انتخاب اقلامِ موضوع) */
  if (action === "lt") {
    const n = num(1), step = parts[2];
    await ack();
    if (step === "ask") return startLetter(env, api, chat, ex, n);
    if (step === "x") {
      await env.DB.prepare("UPDATE letters SET state='canceled', updated_at=? WHERE assignment_id=? AND expert_id=? AND state IN ('need_voice','transcribed')")
        .bind(now(), n, ex.id).run();
      const dw = await deliverWaiting(env, ex, n);
      if (!dw) return show(api, chat, mid, "✖️ نامه لغو شد.", []);
      /* وسط تحویل: لغوِ نامه یعنی تحویل بدون نامه */
      const d = flowData(dw);
      d.docs = { ...(d.docs || {}), letter: 0 };
      await saveFlow(env, dw.id, d, "pick");
      await show(api, chat, mid, "✖️ نامه لغو شد؛ تحویل بدون نامه ادامه می‌یابد.", []);
      return deliverNext(env, api, chat, ex, { ...dw, step: "pick" }, d, null);
    }
    if (step === "go") {
      const L = await env.DB.prepare("SELECT * FROM letters WHERE id=? AND expert_id=?").bind(n, ex.id).first();
      if (!L || L.state !== "transcribed" || !L.transcript) return show(api, chat, null, "این نامه قبلاً نوشته یا لغو شده است.", []);
      return letterSubjectCard(env, api, chat, ex, L, mid);
    }
    return { ok: true };
  }

  /* موضوع نامه: ls:<flow>:t:<item> · all · go */
  if (action === "ls") {
    const f = await ownFlow(env, ex, num(1), "lsub");
    if (!f || f.done_at) { await ack("این انتخاب دیگر فعال نیست.", true); return { ok: true }; }
    const d = flowData(f), step = parts[2];
    const its = (await env.DB.prepare("SELECT id, title FROM items WHERE assignment_id=? ORDER BY line_no LIMIT 40").bind(f.assignment_id).all()).results || [];
    if (step === "go") {
      const titles = its.filter((i) => (d.sel || []).includes(i.id)).map((i) => i.title);
      if (!titles.length) { await ack("دست‌کم یک قلم را برای موضوع نامه تیک بزنید.", true); return { ok: true }; }
      const claim = await env.DB.prepare("UPDATE tg_flows SET step='done', done_at=? WHERE id=? AND done_at IS NULL").bind(now(), f.id).run();
      if (!claim.meta.changes) { await ack(); return { ok: true }; }
      await ack("در حال نوشتن…");
      await show(api, chat, mid, `✉️ <b>موضوع:</b> ${esc(letterSubject(titles, d.rid))}`, []);
      return makeLetter(env, api, chat, ex, d.letterId, titles);
    }
    if (step === "t") { const v = num(3); if (its.some((i) => i.id === v)) d.sel = toggleIn(d.sel, v); }
    else if (step === "all") d.sel = (d.sel || []).length === its.length ? [] : its.map((i) => i.id);
    await saveFlow(env, f.id, d);
    await ack();
    return letterSubjectRender(api, chat, f, d, its, mid);
  }

  await ack("این دکمه دیگر کار نمی‌کند.");
  return { ok: true };
}

/**
 * وقتی بات در کانال/گروهی ادمین می‌شود، همان‌جا را کانال هشدار مدیر ثبت می‌کنیم (TG-04).
 * این‌طور مدیر لازم نیست chat_id عددی را از جایی پیدا و دستی وارد کند.
 */
async function onChatMember(env, m) {
  const chat = m.chat || {};
  const status = m.new_chat_member && m.new_chat_member.status;
  if (!["channel", "supergroup", "group"].includes(chat.type)) return { ok: true };

  /* در کانال، بات برای فرستادن پیام باید ادمین باشد؛ در گروه، عضو بودن کافی
     است و افزودنش هم همان «member» را می‌فرستد. اگر فقط administrator را قبول
     می‌کردیم، مدیری که بات را به گروهش اضافه کرده و ادمین نکرده، هیچ اعلانی
     نمی‌گرفت و جایی هم نمی‌دید چرا. */
  const joined = status === "administrator" || (status === "member" && chat.type !== "channel");
  if (joined) {
    /* گروه‌های تیمِ کارشناس‌های ارشد هم همین بات را اضافه می‌کنند (لینک startgroup پنل)؛
       آن‌ها نباید کانال مدیر را بدزدند. اگر کانال مدیر از قبل هست، این گروه فقط با
       «/manager» صریح مدیر می‌شود؛ گروه تیم با «/start tm…» که تلگرام خودش می‌فرستد ثبت می‌شود. */
    const cur = await settingValue(env, "managerChat");
    if (cur && String(cur) !== String(chat.id)) {
      const isTeam = await env.DB.prepare("SELECT id FROM experts WHERE team_chat=?").bind(String(chat.id)).first();
      if (!isTeam) {
        try { await telegram(env).sendMessage(chat.id, "بات اضافه شد. اگر این گروهِ تیمِ یک کارشناس ارشد است، از لینک «اتصال گروه تیم» در پنل او استفاده کنید؛ اگر می‌خواهید کانال مدیر همین‌جا باشد، <b>/manager</b> بفرستید."); } catch (_) { /* شاید اجازه ندارد */ }
      }
      return { ok: true };
    }
    await env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('managerChat',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
      .bind(JSON.stringify(String(chat.id)), now()).run();
    try {
      await telegram(env).sendMessage(chat.id,
        "✅ این‌جا به‌عنوان کانال اعلان مدیر واحد پشتیبانی ثبت شد.\n\n"
        + "از این پس این‌ها اعلام می‌شود:\n"
        + "• تغییر وضعیت مراحل «مشاهده»، «پیش‌فاکتور» و «جدول کمیسیون»\n"
        + "• عبور از مهلت\n"
        + "• بسته شدن درخواست، با دکمهٔ «مشاهده کردم»\n\n"
        + "<i>اعلان‌ها فقط در ساعت اداری فرستاده می‌شوند.</i>");
    } catch (_) { /* شاید هنوز اجازهٔ ارسال ندارد */ }
  } else if (["left", "kicked"].includes(status)) {
    const cur = await settingValue(env, "managerChat");
    if (cur === String(chat.id)) await env.DB.prepare("DELETE FROM settings WHERE key='managerChat'").run();
    await env.DB.prepare("UPDATE experts SET team_chat=NULL WHERE team_chat=?").bind(String(chat.id)).run();
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Cron                                                                */
/* ------------------------------------------------------------------ */

/**
 * یک اجرای زمان‌بندی‌شده. سقف‌ها محافظه‌کارانه‌اند چون در پلن رایگان هر فراخوانی
 * ۵۰ subrequest دارد و هر کوئری D1 و هر sendMessage یکی از آن‌هاست.
 */
export async function scheduled(env, cron) {
  /* Cron هر دقیقه می‌زند. دقیقه‌های مضرب ۵: چرخهٔ هشدار، پایش رنگ‌ها و صف پیام (مثل
     قبل). بقیهٔ دقیقه‌ها: یک کار از صف جستجوی هوشمند. جدا ماندنشان سقف ۵۰ زیردرخواستِ
     هر اجرا را حفظ می‌کند. اجرای دستی (/tg/tick، بدون cron) هر دو را می‌زند. */
  const heavy = !cron || new Date().getUTCMinutes() % 5 === 0;
  let out = {};
  if (heavy) {
    const a = await runAlerts(env, 15);
    /* رنگ‌های پایش را می‌سنجد و تغییرها را برای مدیر به صف می‌گذارد. پیش از
       drain است تا اگر چیزی تازه به صف آمد، در همین اجرا برود. */
    let w = { checked: 0, changed: 0 };
    try {
      const [settings, managerChat] = await Promise.all([getSettings(env), settingValue(env, "managerChat")]);
      w = await stageWatch(env, settings, managerChat, 40);
    } catch (e) { console.error("stageWatch failed", e && e.message); }
    const d = await drainOutbox(env, 20);
    out = { ...a, ...d, watched: w.checked, colorChanges: w.changed };
  }
  if (!cron || !heavy) out = { ...out, ...(await runSmartJobs(env).catch((e) => ({ jobsError: e && e.message }))) };
  return out;
}
