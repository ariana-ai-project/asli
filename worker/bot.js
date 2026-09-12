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
 * قاعدهٔ مالکیت (INV-11): هر چیزی که بات نشان می‌دهد یا تغییر می‌دهد، فقط از
 * ارجاع‌های همان کارشناسی است که chat_id‌اش گره خورده. هیچ مسیری این را دور نمی‌زند.
 */
import { telegram, esc, TgError } from "./telegram.js";
import { fmtFa, workHours, nextWorkMoment, inWorkHours } from "./time.js";
import { storage, storageKey, MAX_BYTES } from "./storage.js";
import { REFUSAL_FA } from "./extract.js";
import { runExtraction, extractFor, saveExtraction, applyExtraction } from "./proforma.js";
import { transcribe, writeLetter } from "./letter.js";
import { renderLetter } from "./docx.js";
import { bundleData, buildFiles, readiness } from "./bundle.js";
import { commissionHtml } from "./sheets.js";
import { REQUIRED, PER_SUPPLIER, PER_LINE, LABELS, ENUMS, INVOICE_DEFAULT, missingRequired } from "./quote-rules.js";
import { getSettings } from "./settings.js";
import { STAGE_NAMES, queueStmt } from "./queue.js";
import { stageWatch, markManagerSeen } from "./manager.js";
import { expertDecision, approveDecision, rejectDecision } from "./decisions.js";
import { itemHistory } from "./history.js";

const now = () => Date.now();
const T = (v) => String(v == null ? "" : v).trim();

export { STAGE_NAMES, queueStmt } from "./queue.js";
const PANEL_URL = "https://arianaai.website/tamin-poshtibani/expert";

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

const seenButton = (aid) => [[{ text: "✅ مشاهده کردم", callback_data: `seen:a:${aid}` }], [{ text: "باز کردن پنل", url: PANEL_URL }]];
const panelButton = [[{ text: "باز کردن پنل", url: PANEL_URL }]];
/* بعد از «مشاهده کردم» همان‌جا دو قدم بعدی پیشنهاد می‌شود؛ جستجوی هوشمند تا
   اتصال مدل فقط پیام می‌دهد. */
const afterSeenKb = (aid) => [
  [{ text: "📚 بررسی سوابق", callback_data: `hs:a:${aid}` }],
  [{ text: "🔎 جستجوی هوشمند", callback_data: `hs:s:${aid}` }],
  [{ text: "باز کردن پنل", url: PANEL_URL }],
];

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
            e.id AS expert_id, e.name, e.label, e.telegram_chat,
            r.party,
            (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id AND i.state='open') AS open_count,
            (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id AND i.hist_done_at IS NOT NULL) AS hist_count,
            (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id AND i.smart_done_at IS NOT NULL) AS smart_count,
            (SELECT COUNT(*) FROM quotes q WHERE q.assignment_id=a.id AND q.saved=1) AS quote_count,
            (SELECT COUNT(*) FROM proformas p WHERE p.assignment_id=a.id) AS proforma_count
     FROM alerts al
     JOIN assignments a ON a.id=al.assignment_id
     JOIN experts e ON e.id=a.expert_id
     JOIN requests r ON r.id=a.request_id
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
        stageAlertText(row, row.stage), row.stage === 0 ? seenButton(row.aid) : panelButton));
      queued++;
    } else {
      /* عبور از ۱۰۰٪: هم کارشناس، هم کانال مدیر (SLA-05، TG-04) */
      if (row.telegram_chat) { stmts.push(queueStmt(env, `over:${row.aid}:${row.fire_at}`, row.telegram_chat, overdueText(row), panelButton)); queued++; }
      if (managerChat) { stmts.push(queueStmt(env, `over-mgr:${row.aid}:${row.fire_at}`, managerChat, managerOverdueText(row))); queued++; }
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

/* ------------------------------------------------------------------ */
/* پردازش آپدیت وبهوک                                                   */
/* ------------------------------------------------------------------ */

/**
 * یک آپدیت را پردازش می‌کند. همیشه بدون استثنا برمی‌گردد — اگر به تلگرام
 * پاسخ ۲۰۰ ندهیم، همان آپدیت را بارها دوباره می‌فرستد.
 */
export async function handleUpdate(env, u) {
  try {
    if (u.message) return await onMessage(env, u.message);
    if (u.callback_query) return await onCallback(env, u.callback_query);
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
    if (!token) {
      const ex = await expertOfChat(env, chat);
      await api.sendMessage(chat, ex
        ? `سلام ${esc(ex.label || ex.name)}.\nحساب شما از قبل به سامانه وصل است.\n\nبا /kartabl کارتابل، و با /stop قطع اتصال.`
        : "برای اتصال، از پنل کارشناس دکمهٔ «اتصال به تلگرام» را بزنید و روی لینکی که می‌دهد کلیک کنید.\n\nاین بات فقط با کارشناسان ثبت‌شدهٔ واحد تأمین و پشتیبانی کار می‌کند.");
      return { ok: true };
    }
    return bindToken(env, api, chat, token);
  }

  const ex = await expertOfChat(env, chat);
  if (!ex) { await api.sendMessage(chat, "این گفت‌وگو به هیچ کارشناسی وصل نیست. از پنل کارشناس «اتصال به تلگرام» را بزنید."); return { ok: true }; }

  if (msg.voice || msg.audio) return onVoice(env, msg, ex);
  if (msg.document || msg.photo) return onDocument(env, msg, ex);

  if (text === "/faktor" || text === "فاکتور دستی") return startFlow(env, api, chat, ex, "manual");
  if (text === "/tozihat" || text === "توضیحات") return startFlow(env, api, chat, ex, "notes");
  if (text === "/nameh" || text === "نامه") return startFlow(env, api, chat, ex, "letter");
  if (text === "/tahvil" || text === "تحویل") return startFlow(env, api, chat, ex, "deliver");
  if (text === "/pishraft" || text === "پیشرفت") return startFlow(env, api, chat, ex, "progress");

  /* متن آزاد: پاسخِ کدام گفت‌وگوی نیمه‌کاره است؟
     کارشناس ممکن است هم‌زمان یک نامهٔ منتظرِ توضیح، یک فایلِ منتظرِ نام
     تأمین‌کننده و یک فاکتور دستیِ نیمه‌کاره داشته باشد. قاعده ساده و قابل
     پیش‌بینی است: **آخرین چیزی که شروع کرده، همان است که جواب می‌گیرد.**
     (پیش از این، نامهٔ نیمه‌کاره متنِ فاکتور دستی را می‌بلعید.) */
  if (text && !text.startsWith("/")) {
    const t = now();
    const [letter, upload, flow] = await Promise.all([
      /* نامه: چه صوتی چه نوشتاری. اصلاح متنِ رونویسی‌شده هم همین‌جاست، تا
         کارشناس برای یک غلط املایی مجبور به ضبط دوباره نشود. */
      env.DB.prepare("SELECT * FROM letters WHERE expert_id=? AND state IN ('need_voice','transcribed') ORDER BY id DESC LIMIT 1").bind(ex.id).first(),
      env.DB.prepare("SELECT * FROM tg_uploads WHERE expert_id=? AND state='need_name' AND done_at IS NULL AND expires_at>? ORDER BY id DESC LIMIT 1").bind(ex.id, t).first(),
      openFlow(env, ex.id),
    ]);
    const pick = [
      letter && { at: letter.updated_at || letter.created_at, run: () => onLetterText(env, api, chat, ex, letter, text) },
      upload && { at: upload.created_at, run: async () => {
        if (text.length > 120) { await api.sendMessage(chat, "نام تأمین‌کننده خیلی بلند است."); return { ok: true }; }
        return saveProforma(env, api, chat, upload, text);
      } },
      flow && { at: flow.created_at, run: () => onFlowText(env, api, chat, flow, text) },
    ].filter(Boolean).sort((a, b) => b.at - a.at)[0];
    if (pick) return pick.run();
  }

  if (text === "/stop") {
    await env.DB.prepare("UPDATE experts SET telegram_chat=NULL WHERE id=?").bind(ex.id).run();
    await api.sendMessage(chat, "اتصال قطع شد. دیگر اعلانی فرستاده نمی‌شود.\nبرای وصل شدن دوباره، از پنل لینک تازه بگیرید.");
    return { ok: true };
  }
  if (text === "/kartabl" || text === "/start kartabl") return sendTray(env, api, chat, ex);

  await api.sendMessage(chat,
    "چه کاری می‌خواهید بکنید؟\n\n"
    + "/kartabl — ارجاع‌های باز شما\n"
    + "/faktor — فاکتور دستی (قیمت‌ها را خودتان وارد کنید)\n"
    + "/tozihat — توضیحات برگهٔ کمیسیون\n"
    + "/nameh — نامهٔ پیوست کمیسیون (صوتی یا نوشتاری)\n"
    + "/tahvil — گرفتن فایل‌های آماده\n"
    + "/stop — قطع اتصال\n\n"
    + "<i>برای پیش‌فاکتور، فقط فایلش را همین‌جا بفرستید.</i>");
  return { ok: true };
}

/** پاسخ متنی کاربر در یکی از گام‌های گفت‌وگو */
async function onFlowText(env, api, chat, f, text) {
  const d = flowData(f);

  if (f.kind === "field" && f.step === "need_value") return onFieldText(env, api, chat, f, text);

  /* منوی چندانتخابی سوابق متن نمی‌خواهد — انتخاب فقط با دکمه‌هاست */
  if (f.kind === "hist") {
    await api.sendMessage(chat, "برای انتخاب تأمین‌کننده از دکمه‌های زیر فهرست استفاده کنید؛ اگر تأمین‌کنندهٔ تازه‌ای مدنظر است، از «افزودن دستی استعلام جدید» بروید.").catch(() => {});
    return { ok: true };
  }

  if (f.step === "need_supplier") {
    if (text.length > 120) { await api.sendMessage(chat, "نام تأمین‌کننده خیلی بلند است."); return { ok: true }; }
    d.supplier = text; d.idx = 0; d.prices = {};
    await env.DB.prepare("UPDATE tg_flows SET step='prices', data_json=? WHERE id=?").bind(JSON.stringify(d), f.id).run();
    return askPrice(env, api, chat, { ...f, step: "prices", data_json: JSON.stringify(d) });
  }

  if (f.step === "prices") {
    const its = await itemsOf(env, f.assignment_id);
    const it = its[d.idx || 0];
    if (!it) return confirmManual(env, api, chat, f);
    if (text !== "-" && text !== "—") {
      const price = parsePrice(text);
      if (price == null) {
        await api.sendMessage(chat, "عدد را نفهمیدم. فقط رقم بنویسید — مثلاً <code>2500000</code> یا <code>۲٬۵۰۰٬۰۰۰</code>.\nاگر این قلم در فاکتور نیست، «-» بفرستید.");
        return { ok: true };
      }
      d.prices[it.id] = price;
    }
    d.idx = (d.idx || 0) + 1;
    await env.DB.prepare("UPDATE tg_flows SET data_json=? WHERE id=?").bind(JSON.stringify(d), f.id).run();
    const next = { ...f, data_json: JSON.stringify(d) };
    return (d.idx < its.length) ? askPrice(env, api, chat, next) : confirmManual(env, api, chat, next);
  }

  if (f.step === "need_notes") {
    if (text.length > 1500) { await api.sendMessage(chat, "توضیحات خیلی بلند است؛ کوتاه‌ترش کنید."); return { ok: true }; }
    if (f.kind === "notes") {
      const t = now();
      await env.DB.batch([
        env.DB.prepare("UPDATE assignments SET notes=? WHERE id=?").bind(text, f.assignment_id),
        env.DB.prepare("UPDATE tg_flows SET step='done', done_at=? WHERE id=?").bind(t, f.id),
      ]);
      const a = await env.DB.prepare("SELECT request_id FROM assignments WHERE id=?").bind(f.assignment_id).first();
      await api.sendMessage(chat, `📝 ثبت شد.\n\nاین توضیحات پای برگهٔ کمیسیون درخواست <b>${esc(a ? a.request_id : "")}</b> چاپ می‌شود، در بخش «توضیحات تدارکات و پشتیبانی».`, panelButton);
      return { ok: true };
    }
    /* توضیحات وسط جریان فاکتور دستی */
    d.notes = text;
    await env.DB.prepare("UPDATE tg_flows SET step='confirm', data_json=? WHERE id=?").bind(JSON.stringify(d), f.id).run();
    return confirmManual(env, api, chat, { ...f, data_json: JSON.stringify(d) });
  }

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
  return await sendTray(env, api, chat, ex);
}

async function sendTray(env, api, chat, ex) {
  const rows = (await env.DB.prepare(
    `SELECT a.id, a.request_id, a.days, a.deadline_at, r.party,
            (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id AND i.state='open') AS open_count
     FROM assignments a JOIN requests r ON r.id=a.request_id
     WHERE a.expert_id=? AND a.dispatched_at IS NOT NULL AND a.commission_at IS NULL
       AND EXISTS (SELECT 1 FROM items i WHERE i.assignment_id=a.id AND i.state='open')
     ORDER BY a.deadline_at LIMIT 15`,
  ).bind(ex.id).all()).results || [];

  if (!rows.length) { await api.sendMessage(chat, "کارتابل شما خالی است.", panelButton); return { ok: true }; }
  const body = rows.map((r) => {
    const left = r.deadline_at ? Math.max(0, workHours(now(), r.deadline_at)) : null;
    return `• <b>${esc(r.request_id)}</b> — ${esc(r.party || "")}\n  ${M(r.open_count)} قلم باز`
      + (r.deadline_at ? ` · مهلت ${esc(fmtFa(r.deadline_at))} (${M(left.toFixed(1))} ساعت کاری)` : "");
  }).join("\n");
  await api.sendMessage(chat, `📋 <b>کارتابل شما</b> — ${M(rows.length)} ارجاع باز\n\n${body}`, panelButton);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* دریافت پیش‌فاکتور از بات (ADR-0008، TG-11)                            */
/* ------------------------------------------------------------------ */

const UPLOAD_TTL = 24 * 3600000;

/**
 * فایل رسیده را **بلافاصله** دانلود و ذخیره می‌کند، بعد می‌پرسد مال کدام درخواست است.
 *
 * ترتیب مهم است: لینک دانلود تلگرام فقط حدود یک ساعت معتبر است. اگر اول سؤال
 * می‌پرسیدیم و کارشناس جواب را فردا می‌داد، فایل از دست می‌رفت (ADR-0008).
 */
async function onDocument(env, msg, ex) {
  const api = telegram(env);
  const chat = msg.chat.id;
  const store = storage(env);
  if (!store) { await api.sendMessage(chat, "انبار فایل هنوز به سامانه وصل نشده است. فعلاً پیش‌فاکتور را از پنل بارگذاری کنید."); return { ok: true }; }

  /* سند یا عکس؛ از عکس، بزرگ‌ترین اندازه برداشته می‌شود */
  const doc = msg.document;
  const photo = !doc && Array.isArray(msg.photo) && msg.photo.length ? msg.photo[msg.photo.length - 1] : null;
  const fileId = doc ? doc.file_id : photo && photo.file_id;
  if (!fileId) return { ok: true };
  const size = (doc && doc.file_size) || (photo && photo.file_size) || 0;
  const filename = (doc && doc.file_name) || `عکس-${new Date().toISOString().slice(0, 10)}.jpg`;
  const mime = (doc && doc.mime_type) || (photo ? "image/jpeg" : "application/octet-stream");

  if (size > MAX_BYTES) {
    await api.sendMessage(chat, `این فایل ${M((size / 1048576).toFixed(1))} مگابایت است.\nبات تلگرام فقط تا ${M(20)} مگابایت را می‌تواند بگیرد؛ لطفاً از پنل بارگذاری کنید یا فشرده‌ترش کنید.`, panelButton);
    return { ok: true };
  }

  const open = await openAssignments(env, ex.id);
  if (!open.length) { await api.sendMessage(chat, "الان هیچ ارجاع بازی ندارید که این پیش‌فاکتور به آن بخورد."); return { ok: true }; }

  /* دانلود فوری و جریانی — بایت‌ها از حافظهٔ Worker رد نمی‌شوند */
  const f = await api.getFile(fileId);
  const src = await fetch(api.fileUrl(f.file_path));
  if (!src.ok || !src.body) { await api.sendMessage(chat, "دانلود فایل از تلگرام نشد. یک بار دیگر بفرستید."); return { ok: true }; }
  const key = storageKey(open.length === 1 ? open[0].id : null, filename);
  await store.put(key, src.body, { contentType: mime, size: size || undefined });

  const t = now();
  const ins = await env.DB.prepare(
    `INSERT INTO tg_uploads (expert_id,chat_id,file_id,storage_key,filename,mime,size_bytes,state,created_at,expires_at)
     VALUES (?,?,?,?,?,?,?,'need_request',?,?)`,
  ).bind(ex.id, String(chat), fileId, key, filename, mime, size || null, t, t + UPLOAD_TTL).run();
  const uid = ins.meta.last_row_id;

  /* اگر فقط یک ارجاع باز دارد، پرسیدن «کدام درخواست؟» بی‌معنی است */
  if (open.length === 1) return askQuote(env, api, chat, uid, open[0], filename, null);

  const kb = open.map((a) => [{ text: `${a.request_id} — ${short(a.party)}`, callback_data: `pf:${uid}:r:${a.id}` }]);
  kb.push([{ text: "✖️ بی‌خیال", callback_data: `pf:${uid}:x:0` }]);
  const sent = await api.sendMessage(chat, `📎 <b>${esc(filename)}</b> گرفته شد.\n\nاین پیش‌فاکتور برای کدام درخواست است؟`, kb);
  await env.DB.prepare("UPDATE tg_uploads SET message_id=? WHERE id=?").bind(sent.message_id, uid).run();
  return { ok: true };
}

const OPEN_ASSIGNMENT = `SELECT a.id, a.request_id, r.party FROM assignments a JOIN requests r ON r.id=a.request_id
  WHERE a.expert_id=? AND a.dispatched_at IS NOT NULL AND a.commission_at IS NULL
    AND EXISTS (SELECT 1 FROM items i WHERE i.assignment_id=a.id AND i.state='open')`;

/** ارجاع‌های باز همین کارشناس، برای ساختن دکمه‌ها (INV-11) */
async function openAssignments(env, expertId) {
  return (await env.DB.prepare(`${OPEN_ASSIGNMENT} ORDER BY a.deadline_at LIMIT 24`).bind(expertId).all()).results || [];
}

/**
 * یک ارجاعِ باز و متعلق به همین کارشناس.
 *
 * مستقیم پرسیده می‌شود، نه با جست‌وجو در فهرستِ دکمه‌ها: آن فهرست سقف دارد و
 * اگر کارشناس ارجاع‌های بیشتری داشته باشد، انتخابِ ارجاعِ خارج از سقف بی‌صدا
 * شکست می‌خورد — که یک بار همین‌جا اتفاق افتاد.
 */
async function ownOpenAssignment(env, expertId, aid) {
  return env.DB.prepare(`${OPEN_ASSIGNMENT} AND a.id=?`).bind(expertId, aid).first();
}

const short = (s, n = 28) => { const x = String(s || "").trim(); return x.length > n ? x.slice(0, n - 1) + "…" : x; };

/**
 * گام دوم: این پیش‌فاکتور برای کدام استعلام است؟
 *
 * ملاکِ دیده‌شدن، **باز بودنِ خط استعلام** است، نه «ثبت موقت». ثبت موقت خودش
 * می‌خواهد همهٔ فیلدها از قبل دستی پر شده باشند — و اگر شرطش می‌کردیم، خواندنِ
 * خودکار بی‌معنی می‌شد: کارشناس باید همان چیزی را تایپ می‌کرد که قرار است مدل
 * از روی سند بخواند.
 *
 * نام تأمین‌کننده می‌تواند بلند باشد و `callback_data` سقف ۶۴ بایت دارد، پس
 * گزینه‌ها در خود ردیف آپلود ذخیره و با اندیس ارجاع داده می‌شوند.
 */
async function askQuote(env, api, chat, uid, asg, filename, messageId) {
  const rows = (await env.DB.prepare(
    `SELECT q.supplier_name, q.saved FROM quotes q WHERE q.assignment_id=? ORDER BY q.supplier_name, q.id LIMIT 60`,
  ).bind(asg.id).all()).results || [];

  /* خط‌های یک تأمین‌کننده یک گزینه‌اند: پیش‌فاکتور به تأمین‌کننده می‌چسبد، نه به قلم */
  const groups = [];
  for (const r of rows) {
    const name = T(r.supplier_name);
    if (!name) continue;
    let g = groups.find((x) => x.n === name);
    if (!g) { g = { n: name, c: 0, s: 0 }; groups.push(g); }
    g.c++; if (r.saved) g.s++;
  }

  await env.DB.prepare("UPDATE tg_uploads SET assignment_id=?, state='need_supplier', options_json=? WHERE id=?")
    .bind(asg.id, JSON.stringify(groups), uid).run();

  const kb = groups.map((g, i) => [{
    /* ⚪ یعنی هنوز ثبت موقت نشده — همین‌ها بودند که قبلاً از قلم می‌افتادند */
    text: `${g.s === g.c ? "✅" : "⚪"} ${short(g.n, 26)} · ${M(g.c)} قلم`,
    callback_data: `pf:${uid}:s:${i}`,
  }]);
  const ai = !!(env.ANTHROPIC_API_KEY && (storage(env) || {}).signedUrl);
  if (ai) kb.push([{ text: "➕ استعلام جدید (از روی همین فایل)", callback_data: `pf:${uid}:a:0` }]);
  kb.push([{ text: "✍️ نام تأمین‌کننده را خودم می‌نویسم", callback_data: `pf:${uid}:n:0` }]);
  kb.push([{ text: "✖️ بی‌خیال", callback_data: `pf:${uid}:x:0` }]);

  const text = `📎 <b>${esc(filename)}</b>\nدرخواست <b>${esc(asg.request_id)}</b> — ${esc(short(asg.party, 40))}\n\n`
    + (groups.length
      ? "این پیش‌فاکتور برای کدام استعلام است؟\n<i>⚪ یعنی هنوز ثبت موقت نشده؛ فرقی نمی‌کند، انتخابش کنید.</i>"
      : ai
        ? "برای این درخواست هنوز استعلامی باز نشده.\n«استعلام جدید» را بزنید تا خودم سند را بخوانم و خط استعلام را با نام همان تأمین‌کننده بسازم."
        : "برای این درخواست هنوز استعلامی باز نشده. نام تأمین‌کننده را بنویسید:");

  if (messageId) { await api.editMessageText(chat, messageId, text, kb); return { ok: true }; }
  const sent = await api.sendMessage(chat, text, kb);
  await env.DB.prepare("UPDATE tg_uploads SET message_id=? WHERE id=?").bind(sent.message_id, uid).run();
  return { ok: true };
}

/**
 * «استعلام جدید +» — سند خوانده می‌شود تا **نام تأمین‌کننده از خود پیش‌فاکتور**
 * دربیاید و خط استعلام با همان نام ساخته شود.
 *
 * ترتیب اجباری است: کلیدِ ردیف پیش‌فاکتور همان نام تأمین‌کننده است، پس تا سند
 * خوانده نشود ردیفی هم نمی‌شود ساخت. برای همین این‌جا extractFor صدا زده می‌شود
 * که چیزی در دیتابیس نمی‌نویسد.
 */
async function newQuoteFromFile(env, api, chat, ex, up) {
  const store = storage(env);
  const fallback = async (msg) => {
    await env.DB.prepare("UPDATE tg_uploads SET state='need_name' WHERE id=?").bind(up.id).run();
    await api.sendMessage(chat, msg + "\n\nنام تأمین‌کننده را بنویسید تا فایل را همان‌جا ثبت کنم:");
    return { ok: true };
  };
  if (!env.ANTHROPIC_API_KEY || !store || !store.signedUrl) return fallback("خواندن خودکار روی این نصب فعال نیست.");

  const asg = await env.DB.prepare("SELECT request_id FROM assignments WHERE id=?").bind(up.assignment_id).first();
  if (!asg) return fallback("این ارجاع پیدا نشد.");

  await api.sendMessage(chat, "⏳ دارم سند را می‌خوانم تا خط استعلام را خودم بسازم…").catch(() => {});
  let out;
  try {
    out = await extractFor(env, store, {
      assignment_id: up.assignment_id, request_id: asg.request_id, storage_key: up.storage_key, mime: up.mime,
    });
  } catch (e) { return fallback(`خواندن نشد: ${esc(e.message)}`); }

  const r = out.result;
  const supplier = T(r.supplier_name);
  if (!r.extractable) {
    return fallback(`⚠️ نتوانستم مطمئن بخوانم — <b>${esc(REFUSAL_FA[r.reason] || r.reason || "نامشخص")}</b>.`
      + "\nقیمت‌ها را بعداً با /faktor دستی وارد کنید.");
  }
  /* بدون نام تأمین‌کننده، خط استعلام کلید ندارد */
  if (!supplier) return fallback("⚠️ سند را خواندم ولی نام تأمین‌کننده روی سربرگش پیدا نشد.");

  return saveProforma(env, api, chat, up, supplier, out);
}

/**
 * گام آخر: ثبت پیش‌فاکتور روی استعلام آن تأمین‌کننده.
 * اگر سند از پیش خوانده شده (مسیر «استعلام جدید»)، همان خروجی روی ردیف تازه
 * می‌نشیند تا دو بار به مدل پول ندهیم.
 */
async function saveProforma(env, api, chat, up, supplier, out) {
  const t = now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO proformas (assignment_id,supplier_name,filename,storage_key,mime,size_bytes,source,uploaded_at)
       VALUES (?,?,?,?,?,?,'telegram',?)
       ON CONFLICT(assignment_id,supplier_name) DO UPDATE SET filename=excluded.filename, storage_key=excluded.storage_key,
         mime=excluded.mime, size_bytes=excluded.size_bytes, source='telegram', uploaded_at=excluded.uploaded_at`,
    ).bind(up.assignment_id, supplier, up.filename, up.storage_key, up.mime, up.size_bytes, t),
    env.DB.prepare("UPDATE tg_uploads SET state='done', done_at=? WHERE id=?").bind(t, up.id),
    env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)")
      .bind(t, `expert:${up.expert_id}`, "proforma", null, JSON.stringify({ assignment_id: up.assignment_id, supplier, filename: up.filename, channel: "telegram" })),
  ]);
  const a = await env.DB.prepare("SELECT request_id FROM assignments WHERE id=?").bind(up.assignment_id).first();
  const pf = await env.DB.prepare("SELECT id FROM proformas WHERE assignment_id=? AND supplier_name=?").bind(up.assignment_id, supplier).first();
  await sendProgress(env, api, chat, up.assignment_id);

  if (out && pf) {
    await saveExtraction(env, pf.id, out);
    if (up.message_id) {
      await api.editMessageText(chat, up.message_id,
        `✅ فایل زیر نام <b>${esc(supplier)}</b> ثبت شد.\n📎 ${esc(up.filename)}`, panelButton).catch(() => {});
    }
    return presentExtraction(env, api, chat, pf.id, out.result, up.assignment_id);
  }

  const text = `✅ ثبت شد.\n\n📎 <b>${esc(up.filename)}</b>\nدرخواست <b>${esc(a ? a.request_id : "")}</b> · تأمین‌کننده <b>${esc(supplier)}</b>`;
  const kb = pf && env.ANTHROPIC_API_KEY
    ? [[{ text: "🤖 خواندن خودکار قیمت‌ها", callback_data: `ai:${pf.id}:go:0` }], [{ text: "باز کردن پنل", url: PANEL_URL }]]
    : panelButton;
  if (up.message_id) await api.editMessageText(chat, up.message_id, text, kb).catch(() => api.sendMessage(chat, text, kb));
  else await api.sendMessage(chat, text, kb);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* استخراج خودکار (AI-06) — خواندن، نمایش، و ثبت فقط با تأیید کارشناس    */
/* ------------------------------------------------------------------ */

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
  kb.push([{ text: "✏️ اصلاح یک فیلد پرشده", callback_data: `qe:${q0.id}:0` }]);
  if (!allSaved) kb.push([{ text: missReq.length ? "✅ ثبت موقت (اول ❌ها را پر کنید)" : "✅ ثبت موقت", callback_data: `qs:${q0.id}:0` }]);
  if (a && a.saved_all > 0) kb.push([{ text: "📊 تولید جدول کمیسیون", callback_data: `ct:${aid}:start:0` }]);
  kb.push([{ text: "باز کردن پنل", url: PANEL_URL }]);

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
    await env.DB.prepare(`UPDATE quotes SET ${field}=?, saved=0, updated_at=? WHERE assignment_id=? AND supplier_name=?`)
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
  await closeFlows(env, ex.id);
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
  }
  if (problems.length) return quoteCard(env, api, chat, q.assignment_id, q.supplier_name, messageId, `⛔ <b>ثبت موقت نشد</b> — این‌ها خالی‌اند:\n${problems.join("\n")}`);
  const t = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE quotes SET saved=1, updated_at=? WHERE assignment_id=? AND supplier_name=?").bind(t, q.assignment_id, q.supplier_name),
    env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)")
      .bind(t, `expert:${ex.id}`, "quote_saved", q.request_id, JSON.stringify({ assignment_id: q.assignment_id, supplier: q.supplier_name, lines: lines.length, channel: "telegram" })),
  ]);
  await quoteCard(env, api, chat, q.assignment_id, q.supplier_name, messageId, `✅ ${M(lines.length)} خط استعلام «${esc(q.supplier_name)}» ثبت موقت شد.`);
  return sendProgress(env, api, chat, q.assignment_id);
}

/* ------------------------------------------------------------------ */
/* جدول کمیسیون از بات — انتخاب خط‌ها، ساختِ مکانیکی، بدون مدل           */
/* ------------------------------------------------------------------ */

/**
 * کدام خط‌ها در جدول بیایند؟ همان «تأیید نهایی» پنل است؛ هر بار زدن روی یک خط،
 * پرچمِ final همان خط را برمی‌گرداند و در پنل هم دیده می‌شود.
 */
async function tableSelect(env, api, chat, ex, aid, messageId, head) {
  const own = await env.DB.prepare("SELECT id, request_id FROM assignments WHERE id=? AND expert_id=?").bind(aid, ex.id).first();
  if (!own) { await api.sendMessage(chat, "این ارجاع متعلق به شما نیست."); return { ok: true }; }
  const lines = (await env.DB.prepare(
    `SELECT q.id, q.supplier_name, q.price, q.final, i.title FROM quotes q JOIN items i ON i.id=q.item_id
     WHERE q.assignment_id=? AND q.saved=1 ORDER BY q.supplier_name, i.line_no LIMIT 60`,
  ).bind(aid).all()).results || [];
  if (!lines.length) {
    await api.sendMessage(chat, "هنوز هیچ خط استعلامِ ثبت‌موقت‌شده‌ای ندارید. اول خط‌ها را ثبت موقت کنید.", panelButton);
    return { ok: true };
  }
  const n = lines.filter((l) => l.final).length;
  const kb = lines.map((l) => [{
    text: `${l.final ? "☑" : "☐"} ${short(l.supplier_name, 14)} — ${short(l.title, 16)} — ${money(l.price)}`,
    callback_data: `ct:${aid}:t:${l.id}`,
  }]);
  kb.push([{ text: "☑ همه", callback_data: `ct:${aid}:all:0` }, { text: "☐ هیچ", callback_data: `ct:${aid}:none:0` }]);
  kb.push([{ text: `📊 تولید جدول کمیسیون (${M(n)} خط)`, callback_data: `ct:${aid}:go:0` }]);
  kb.push([{ text: "✖️ بی‌خیال", callback_data: `ct:${aid}:x:0` }]);
  const text = `${head ? head + "\n\n" : ""}📊 <b>جدول کمیسیون — درخواست ${esc(own.request_id)}</b>\n\n`
    + `کدام استعلام‌ها در جدول بیایند؟ روی هر خط بزنید تا انتخاب یا لغو شود (همان «تأیید نهایی» پنل).\n\n`
    + `<b>${M(n)}</b> از ${M(lines.length)} خط انتخاب شده.`;
  if (messageId) { const r = await api.editMessageText(chat, messageId, text, kb).catch(() => null); if (r) return { ok: true }; }
  await api.sendMessage(chat, text, kb);
  return { ok: true };
}

const XLS_MIME = "application/vnd.ms-excel";

/**
 * ساختن و فرستادن جدول کمیسیون. هیچ مدلی در کار نیست — همان کدِ مکانیکیِ
 * sheets.js که پنل هم استفاده می‌کند، از روی خط‌های تأییدنهایی‌شده.
 * مرحلهٔ «تحویل» (commission_at) این‌جا زده نمی‌شود؛ آن با /tahvil و بستهٔ
 * کامل است، تا ارجاع برای پیش‌فاکتور و نامهٔ بعدی باز بماند.
 */
async function makeTable(env, api, chat, ex, aid, messageId) {
  const settings = await getSettings(env);
  const d = await bundleData(env, aid, settings, env.COMPANY || "تونل سد آریانا");
  if (d.assignment.expert_id !== ex.id) { await api.sendMessage(chat, "این ارجاع متعلق به شما نیست."); return { ok: true }; }
  const st = readiness(d);
  const finals = d.quotes.filter((q) => q.final && q.saved);
  if (!finals.length) return tableSelect(env, api, chat, ex, aid, messageId, "⛔ هیچ خطی انتخاب نشده؛ دست‌کم یکی را تیک بزنید.");

  const body = commissionHtml({ ...d, notes: d.assignment.notes });
  const t = now();
  /* تولید جدول = مرحلهٔ ششم انجام شده — همان کاری که دکمهٔ پنل می‌کند. باکس مدیر
     همین‌جا سبز می‌شود، نه بعد از تحویل فایل‌ها. هشدارهای مانده هم بی‌معنی‌اند. */
  await env.DB.batch([
    env.DB.prepare("UPDATE assignments SET commission_at=COALESCE(commission_at,?) WHERE id=?").bind(t, aid),
    env.DB.prepare("UPDATE alerts SET canceled_at=? WHERE assignment_id=? AND fired_at IS NULL AND canceled_at IS NULL").bind(t, aid),
    env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)")
      .bind(t, `expert:${ex.id}`, "commission_table", d.request.id, JSON.stringify({ assignment_id: aid, lines: finals.length, channel: "telegram" })),
  ]);
  if (messageId) await api.editMessageText(chat, messageId, `📊 جدول کمیسیون با <b>${M(finals.length)}</b> خط ساخته شد.`).catch(() => {});

  let sent = true;
  try {
    await api.sendDocument(chat, `کمیسیون-${d.request.id}.xls`, new Blob([body], { type: XLS_MIME }),
      `📊 <b>جدول مقایسه استعلام بها — ${esc(d.request.id)}</b>\n${M(finals.length)} خط · ${M(st.suppliers)} تأمین‌کننده`);
  } catch (e) { sent = false; }

  const warn = [];
  if (!sent) warn.push("⚠️ فایل به تلگرام نرسید؛ در پنل با «تولید جدول کمیسیون» همین را می‌گیرید.");
  if (st.itemsMissing.length) warn.push(`⚠️ ${M(st.itemsMissing.length)} قلم هنوز قیمت تأییدشده ندارد: ${esc(st.itemsMissing.slice(0, 4).join("، "))}`);
  if (!st.hasNotes) warn.push("📝 توضیحات پای برگه خالی است — با /tozihat می‌نویسید.");
  return closeCard(env, api, chat, ex, aid, null,
    `✅ <b>جدول کمیسیون تولید شد.</b>` + (warn.length ? "\n" + warn.join("\n") : ""));
}

/**
 * کارتِ «تأیید کمیسیون و خاتمه» — زیرِ جدولِ تولیدشده.
 *
 * اقلامِ بازِ درخواست چندانتخابی‌اند: کارشناس هر کدام را که کمیسیون تأیید کرده
 * تیک می‌زند و «خاتمه» را می‌زند. فقط همان‌ها بسته می‌شوند؛ اگر همه بودند
 * درخواست به‌کل می‌رود، وگرنه با باقی اقلام در جریان می‌ماند. «ویرایش» پرونده
 * را برای ادامهٔ کار باز نگه می‌دارد (پیش‌فاکتور تازه، خط تازه، جدول دوباره).
 */
async function closeCard(env, api, chat, ex, aid, messageId, head) {
  const own = await env.DB.prepare("SELECT id, request_id FROM assignments WHERE id=? AND expert_id=?").bind(aid, ex.id).first();
  if (!own) { await api.sendMessage(chat, "این ارجاع متعلق به شما نیست."); return { ok: true }; }
  const its = (await env.DB.prepare(
    "SELECT id, title, qty, unit, commission_ok FROM items WHERE assignment_id=? AND state='open' ORDER BY line_no LIMIT 40",
  ).bind(aid).all()).results || [];
  if (!its.length) { await api.sendMessage(chat, "این درخواست قلمِ بازی ندارد.", panelButton); return { ok: true }; }
  const n = its.filter((i) => i.commission_ok).length;
  const s = await getSettings(env);

  const kb = its.map((i) => [{
    text: `${i.commission_ok ? "☑" : "☐"} ${short(i.title, 30)}${i.qty != null ? ` — ${M(i.qty)} ${i.unit || ""}` : ""}`,
    callback_data: `cm:${aid}:t:${i.id}`,
  }]);
  kb.push([{ text: "☑ همه", callback_data: `cm:${aid}:all:0` }, { text: "☐ هیچ", callback_data: `cm:${aid}:none:0` }]);
  kb.push([{ text: `🔒 خاتمه (${M(n)} قلم)`, callback_data: `cm:${aid}:end:0` }, { text: "✏️ ویرایش", callback_data: `cm:${aid}:edit:0` }]);
  kb.push([{ text: "📝 نامهٔ پیوست لازم دارم", callback_data: `lt:${aid}:ask:0` }]);
  kb.push([{ text: "باز کردن پنل", url: PANEL_URL }]);

  const text = `${head ? head + "\n\n" : ""}🧾 <b>تأیید کمیسیون — درخواست ${esc(own.request_id)}</b>\n\n`
    + `کدام اقلام را کمیسیون تأیید کرد؟ روی هر قلم بزنید تا تیک بخورد؛ بعد «خاتمه».\n`
    + `<b>${M(n)}</b> از ${M(its.length)} قلم تیک خورده.\n\n`
    + (s.approvalRequired
      ? "<i>چون «تصمیم کارشناس منوط به تأیید مدیر» فعال است، خاتمه اول برای مدیر می‌رود.</i>"
      : "<i>«خاتمه» همان لحظه اقلامِ تیک‌خورده را می‌بندد؛ اگر همه بودند، درخواست از کارتابل می‌رود.</i>");
  if (messageId) { const r = await api.editMessageText(chat, messageId, text, kb).catch(() => null); if (r) return { ok: true }; }
  await api.sendMessage(chat, text, kb);
  return { ok: true };
}

/** خلاصهٔ خوانا از خروجی مدل، تا کارشناس پیش از ثبت ببیند چه چیزی قرار است بنشیند */
function extractSummary(r, itemTitles) {
  if (!r.extractable) {
    return `⚠️ <b>نتوانستم مطمئن بخوانم</b>\n\nدلیل: <b>${esc(REFUSAL_FA[r.reason] || r.reason || "نامشخص")}</b>\n\n`
      + `${r.notes ? esc(r.notes) + "\n\n" : ""}قیمت‌ها را با «فاکتور دستی» وارد کنید — /faktor`;
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
 * می‌شود. وگرنه کارشناس دکمه‌ای می‌زد که ته‌اش خطا بود.
 */
async function presentExtraction(env, api, chat, pid, r, aid) {
  const items = (await env.DB.prepare("SELECT id, title FROM items WHERE assignment_id=?").bind(aid).all()).results || [];
  const titles = new Map(items.map((i) => [i.id, i.title]));
  const priced = (r.lines || []).filter((l) => l.unit_price != null);
  const sole = titles.size === 1 && priced.length === 1 && !priced[0].matched_item_id;
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
  kb.push([{ text: "باز کردن پنل", url: PANEL_URL }]);
  await api.sendMessage(chat, extractSummary(r, titles)
    + (sole ? "\n\n<i>این سند یک سطر قیمت دارد و این درخواست هم یک قلم؛ به همان وصل می‌شود.</i>" : "")
    + (r.extractable ? `\n\n<i>تا وقتی «${label}» را نزنید، چیزی در جدول کمیسیون نمی‌نشیند.</i>` : ""), kb);
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
    catch (e) { await api.sendMessage(chat, `خواندن نشد: ${esc(e.message)}\n\nمی‌توانید با /faktor دستی وارد کنید.`); return { ok: true }; }
    return presentExtraction(env, api, chat, pid, out.result, p.assignment_id);
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
/* نامهٔ پیوست کمیسیون — از صدا یا نوشتهٔ کارشناس                                 */
/* ------------------------------------------------------------------ */


async function startLetter(env, api, chat, ex, aid) {
  const a = await env.DB.prepare("SELECT a.id, r.id AS rid FROM assignments a JOIN requests r ON r.id=a.request_id WHERE a.id=? AND a.expert_id=?")
    .bind(aid, ex.id).first();
  if (!a) { await api.sendMessage(chat, "این ارجاع متعلق به شما نیست."); return { ok: true }; }
  const t = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE letters SET state='canceled', updated_at=? WHERE assignment_id=? AND state IN ('need_voice','transcribed')").bind(t, aid),
    env.DB.prepare("INSERT INTO letters (assignment_id,expert_id,state,created_at,updated_at) VALUES (?,?,'need_voice',?,?)").bind(aid, ex.id, t, t),
  ]);
  await api.sendMessage(chat,
    `✉️ <b>نامهٔ پیوست — درخواست ${esc(a.rid)}</b>\n\n`
    + `توضیح بدهید در جریان این خرید چه اتفاقی افتاده: چه چالشی داشتید، چرا این تأمین‌کننده، چه چیزی طول کشید.\n\n`
    + `🎤 <b>یک پیام صوتی بفرستید</b> — یا اگر راحت‌تر است، <b>همین‌جا تایپ کنید</b>.\n\n`
    + `<i>محاوره‌ای و به زبان خودتان بگویید؛ متنِ رسمی نامه را من می‌نویسم.</i>`,
    [[{ text: "✖️ بی‌خیال", callback_data: `lt:${aid}:x:0` }]]);
  return { ok: true };
}

/**
 * همان جای صوت، ولی نوشته.
 * بعضی کارشناس‌ها جایی هستند که نمی‌شود حرف زد، یا ترجیح می‌دهند بنویسند.
 * ورودی هرچه باشد، از این نقطه به بعد مسیر یکی است.
 */
async function onLetterText(env, api, chat, ex, L, text) {
  if (text.length < 15) {
    await api.sendMessage(chat, "کمی بیشتر توضیح بدهید تا بشود از آن نامه ساخت.");
    return { ok: true };
  }
  if (text.length > 4000) { await api.sendMessage(chat, "متن خیلی بلند است؛ خلاصه‌ترش کنید."); return { ok: true }; }
  await env.DB.prepare("UPDATE letters SET transcript=?, state='transcribed', updated_at=? WHERE id=?")
    .bind(text, now(), L.id).run();
  await api.sendMessage(chat, `📄 <b>این را می‌نویسم:</b>\n\n<i>${esc(text)}</i>\n\nنامه را بسازم؟`,
    [[{ text: "✅ بله، نامه را بنویس", callback_data: `lt:${L.id}:go:0` }],
      [{ text: "✏️ متن را عوض می‌کنم", callback_data: `lt:${L.assignment_id}:ask:0` }],
      [{ text: "✖️ بی‌خیال", callback_data: `lt:${L.assignment_id}:x:0` }]]);
  return { ok: true };
}

/** پیام صوتی رسید: ذخیره، رونویسی، و نشان دادن متن برای تأیید */
async function onVoice(env, msg, ex) {
  const api = telegram(env);
  const chat = msg.chat.id;
  const pending = await env.DB.prepare(
    "SELECT * FROM letters WHERE expert_id=? AND state='need_voice' ORDER BY id DESC LIMIT 1",
  ).bind(ex.id).first();
  if (!pending) {
    await api.sendMessage(chat, "الان منتظر پیام صوتی نبودم.\nاگر می‌خواهید نامه بنویسم، /nameh را بزنید.");
    return { ok: true };
  }
  const store = storage(env);
  if (!store || !store.signedUrl) { await api.sendMessage(chat, "انبار فایل برای صوت آماده نیست."); return { ok: true }; }

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
    const r = await transcribe(env, url);
    text = r.text;
  } catch (e) {
    await env.DB.prepare("UPDATE letters SET voice_key=?, state='failed', updated_at=? WHERE id=?").bind(key, now(), pending.id).run();
    await api.sendMessage(chat, `صوت به متن تبدیل نشد: ${esc(e.message)}\n\nمی‌توانید متن را تایپ کنید و با /tozihat ثبتش کنید.`);
    return { ok: true };
  }
  if (!text || text.length < 15) {
    await api.sendMessage(chat, "چیزی نشنیدم یا خیلی کوتاه بود. یک بار دیگر و کمی واضح‌تر بفرستید.");
    return { ok: true };
  }

  await env.DB.prepare("UPDATE letters SET voice_key=?, voice_secs=?, transcript=?, state='transcribed', updated_at=? WHERE id=?")
    .bind(key, v.duration || null, text, now(), pending.id).run();

  /* تأیید متن پیش از نگارش: اگر رونویسی اشتباه شنیده باشد، نامه هم غلط می‌شود */
  await api.sendMessage(chat,
    `📄 <b>این را شنیدم:</b>\n\n<i>${esc(text)}</i>\n\nدرست است؟`,
    [[{ text: "✅ بله، نامه را بنویس", callback_data: `lt:${pending.id}:go:0` }],
      [{ text: "🎤 دوباره ضبط می‌کنم", callback_data: `lt:${pending.assignment_id}:ask:0` }],
      [{ text: "✖️ بی‌خیال", callback_data: `lt:${pending.assignment_id}:x:0` }]]);
  return { ok: true };
}

/** نگارش نامه و ساخت فایل Word روی سربرگ */
async function makeLetter(env, api, chat, ex, letterId) {
  const L = await env.DB.prepare("SELECT * FROM letters WHERE id=? AND expert_id=?").bind(letterId, ex.id).first();
  if (!L || !L.transcript) { await api.sendMessage(chat, "متنی برای این نامه ثبت نشده است."); return { ok: true }; }
  const store = storage(env);
  await api.sendMessage(chat, "✍️ در حال نوشتن نامه…").catch(() => {});

  const settings = await getSettings(env);
  const d = await bundleData(env, L.assignment_id, settings, env.COMPANY || "تونل سد آریانا");

  let out;
  try {
    /* همان قاعدهٔ جدول کمیسیون: فقط استعلام‌های تیک‌خورده و قلم‌هایی که آن‌ها قیمت داده‌اند */
    out = await writeLetter(env, {
      transcript: L.transcript, request: d.request, items: d.items, quotes: d.quotes, allItems: d.items,
      notes: d.assignment.notes, expert: d.expert, company: d.company,
    });
  } catch (e) {
    await env.DB.prepare("UPDATE letters SET state='failed', updated_at=? WHERE id=?").bind(now(), L.id).run();
    await api.sendMessage(chat, `نگارش نامه نشد: ${esc(e.message)}`);
    return { ok: true };
  }

  const letter = { ...out.letter, date: d.date, number: null };
  let docxKey = null;
  try {
    const tpl = await store.get("_templates/letterhead.docx");
    if (!tpl) throw new Error("سربرگ در انبار پیدا نشد.");
    const blob = await renderLetter(await new Response(tpl.body).arrayBuffer(), letter);
    docxKey = storageKey(L.assignment_id, `letter-${L.id}.docx`);
    await store.put(docxKey, blob, { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  } catch (e) {
    /* نامه نوشته شده ولی فایلش ساخته نشد — متن را از دست ندهیم */
    await env.DB.prepare("UPDATE letters SET letter_json=?, meta_json=?, state='written', updated_at=? WHERE id=?")
      .bind(JSON.stringify(letter), JSON.stringify(out.meta), now(), L.id).run();
    await api.sendMessage(chat, `نامه نوشته شد ولی فایل Word ساخته نشد: ${esc(e.message)}\nمتنش در پنل هست.`);
    return { ok: true };
  }

  await env.DB.batch([
    env.DB.prepare("UPDATE letters SET letter_json=?, docx_key=?, meta_json=?, state='written', updated_at=? WHERE id=?")
      .bind(JSON.stringify(letter), docxKey, JSON.stringify(out.meta), now(), L.id),
    env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)")
      .bind(now(), `expert:${ex.id}`, "letter", d.request.id, JSON.stringify({ assignment_id: L.assignment_id, letter_id: L.id, channel: "telegram" })),
  ]);

  const file = await store.get(docxKey);
  const bytes = await new Response(file.body).arrayBuffer();
  await api.sendDocument(chat, `نامه-${d.request.id}.docx`, new Blob([bytes]),
    `📝 <b>${esc(letter.subject)}</b>\n\nاگر متنش را می‌پسندید همین را پیوست کنید؛ وگرنه در Word اصلاحش کنید.`);
  if (out.letter.uncertain && out.letter.uncertain.length) {
    await api.sendMessage(chat, `⚠️ این‌ها در صحبتتان روشن نبود و در نامه نیامد:\n${out.letter.uncertain.map((u) => "• " + esc(u)).join("\n")}`);
  }
  /* عددی که مدل خودش نوشته و در دادهٔ سامانه نیست، پیش از پیوست کردن باید دیده شود */
  const mt = out.meta || {};
  if ((mt.suspicious || []).length || (mt.unresolved || []).length) {
    await api.sendMessage(chat, "⚠️ <b>پیش از پیوست کردن، این‌ها را در نامه چک کنید:</b>\n"
      + ((mt.suspicious || []).length ? `• عددهایی که از دادهٔ سامانه نیامده‌اند: <b>${esc(mt.suspicious.join("، "))}</b>\n` : "")
      + ((mt.unresolved || []).length ? `• جای‌خالیِ حل‌نشده (با «—» پر شد): ${esc(mt.unresolved.join("، "))}\n` : "")
      + `\nنامه بر پایهٔ ${M(mt.items || 0)} قلمِ تیک‌خورده و ${M(mt.suppliers || 0)} تأمین‌کننده نوشته شده — همان جدول کمیسیون.`).catch(() => {});
  }
  await api.sendMessage(chat, "برای گرفتن کل بستهٔ فایل‌ها (برگهٔ درخواست + جدول کمیسیون + نامه) دستور /tahvil را بزنید.", panelButton);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* پایش شش مرحله — همان باکس‌های رنگیِ میز مدیر                          */
/* ------------------------------------------------------------------ */

/**
 * وضعیت شش مرحلهٔ یک ارجاع، دقیقاً با همان قاعده‌ای که پنل و میز مدیر
 * حساب می‌کنند — تا آنچه کارشناس در تلگرام می‌بیند با آنچه مدیر می‌بیند یکی باشد.
 */
async function stageState(env, aid) {
  return env.DB.prepare(
    `SELECT a.id, a.request_id, a.viewed_at, a.commission_at,
            (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id AND i.hist_done_at IS NOT NULL) AS hist,
            (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id AND i.smart_done_at IS NOT NULL) AS smart,
            (SELECT COUNT(*) FROM quotes q WHERE q.assignment_id=a.id AND q.saved=1) AS quotes,
            (SELECT COUNT(*) FROM proformas p WHERE p.assignment_id=a.id) AS proformas
     FROM assignments a WHERE a.id=?`,
  ).bind(aid).first();
}

const stageFlags = (s) => [!!s.viewed_at, s.hist > 0, s.smart > 0, s.quotes > 0, s.proformas > 0, !!s.commission_at];

/** نوار پیشرفت: ✅ برای انجام‌شده، ⬜ برای مانده */
function progressBar(s) {
  const done = stageFlags(s);
  return STAGE_NAMES.map((n, i) => `${done[i] ? "✅" : "⬜"} ${n}`).join("\n");
}

/** پیام پیشرفت + دکمهٔ مرحله‌هایی که هنوز سبز نشده‌اند */
async function sendProgress(env, api, chat, aid, prefix) {
  const s = await stageState(env, aid);
  if (!s) return { ok: true };
  const done = stageFlags(s);
  const kb = [];
  /* سوابق دیگر «علامت دستی» نیست — همان بررسی واقعی از داخل بات اجرا می‌شود */
  if (!done[1]) kb.push([{ text: "📚 بررسی سوابق", callback_data: `hs:a:${aid}` }]);
  if (!done[2]) kb.push([{ text: "✅ جستجو را انجام دادم", callback_data: `st:${aid}:smart:0` }]);
  if (done[3]) kb.push([{ text: "📊 تولید جدول کمیسیون", callback_data: `st:${aid}:table:0` }]);
  if (done[3] && done[4] && !done[5]) kb.push([{ text: "📦 گرفتن فایل‌ها و بستن کار", callback_data: `st:${aid}:deliver:0` }]);
  if (done[5]) kb.push([{ text: "🧾 تأیید کمیسیون و خاتمه", callback_data: `cm:${aid}:card:0` }]);
  kb.push([{ text: "باز کردن پنل", url: PANEL_URL }]);
  await api.sendMessage(chat,
    `${prefix ? prefix + "\n\n" : ""}📊 <b>پیشرفت درخواست ${esc(s.request_id)}</b>\n\n${progressBar(s)}`, kb).catch(() => {});
  return { ok: true };
}

/** علامت‌زدن مرحلهٔ «بررسی سوابق» یا «جستجوی هوشمند» روی همهٔ اقلام باز */
async function markStage(env, api, chat, ex, aid, stage) {
  const col = stage === "hist" ? "hist_done_at" : "smart_done_at";
  const own = await ownOpenAssignment(env, ex.id, aid);
  if (!own) { await api.sendMessage(chat, "این ارجاع متعلق به شما نیست یا بسته شده.").catch(() => {}); return { ok: true }; }
  const t = now();
  await env.DB.batch([
    env.DB.prepare(`UPDATE items SET ${col}=COALESCE(${col},?) WHERE assignment_id=? AND state='open'`).bind(t, aid),
    env.DB.prepare("UPDATE alerts SET canceled_at=? WHERE assignment_id=? AND kind='stage' AND stage=? AND fired_at IS NULL")
      .bind(t, aid, stage === "hist" ? 1 : 2),
    env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)")
      .bind(t, `expert:${ex.id}`, stage, own.request_id, JSON.stringify({ assignment_id: aid, channel: "telegram" })),
  ]);
  return sendProgress(env, api, chat, aid, `✅ مرحلهٔ «${stage === "hist" ? "بررسی سوابق" : "جستجوی هوشمند"}» سبز شد.`);
}

/* ------------------------------------------------------------------ */
/* بررسی سوابق در بات — همان موتور پنل (worker/history.js)               */
/* ------------------------------------------------------------------ */
/* ضریب اهمیت گشتاور در بات ثابت است؛ نوارِ ۱ تا ۱۰ مال پنل است و رتبه‌ها
   آن‌جا همان لحظه عوض می‌شوند. */
const HIST_K = 5;
const RQ = (x) => Math.round((Number(x) || 0) * 100) / 100;   /* مقدارها بدون زبالهٔ اعشار شناور */
const HIST_MAX_LIST = 12;   /* سقف متن پیام — تلگرام ۴۰۹۶ نویسه جا دارد */
const HIST_MAX_SEL = 24;    /* سقف دکمه‌های منوی چندانتخابی */
const HIST_SEL_TEXT = "تأمین‌کنندگان موردنظر را انتخاب کنید و «افزودن به استعلامات» را بزنید؛ فقط نامشان وارد می‌شود و قیمت با پیش‌فاکتور یا ورود دستی می‌آید.";

async function histPickItem(env, api, chat, ex, aid) {
  const asg = await ownOpenAssignment(env, ex.id, aid);
  if (!asg) { await api.sendMessage(chat, "این ارجاع متعلق به شما نیست یا بسته شده.").catch(() => {}); return { ok: true }; }
  const its = (await env.DB.prepare("SELECT id, title, qty, unit FROM items WHERE assignment_id=? AND state='open' ORDER BY line_no LIMIT 40").bind(aid).all()).results || [];
  if (!its.length) { await api.sendMessage(chat, "قلم بازی در این درخواست نمانده است.").catch(() => {}); return { ok: true }; }
  if (its.length === 1) return histRun(env, api, chat, ex, its[0].id);
  const kb = its.map((i) => [{ text: `${short(i.title, 32)}${i.qty != null ? ` — ${M(i.qty)} ${i.unit || ""}` : ""}`, callback_data: `hs:i:${i.id}` }]);
  await api.sendMessage(chat, `📚 <b>بررسی سوابق</b>\nدرخواست <b>${esc(asg.request_id)}</b>\n\nسوابق کدام قلم را ببینم؟ (یکی را انتخاب کنید)`, kb).catch(() => {});
  return { ok: true };
}

async function histRun(env, api, chat, ex, itemId) {
  const it = await env.DB.prepare(`SELECT i.id, i.title, i.code, i.hist_code, i.hist_done_at, a.id AS aid, a.expert_id, a.request_id
    FROM items i JOIN assignments a ON a.id=i.assignment_id WHERE i.id=?`).bind(itemId).first();
  if (!it || it.expert_id !== ex.id) { await api.sendMessage(chat, "این قلم متعلق به شما نیست.").catch(() => {}); return { ok: true }; }
  const h = await itemHistory(env, it, { k: HIST_K });
  if (!h.available) { await api.sendMessage(chat, `📚 ${esc(h.message)}`).catch(() => {}); return { ok: true }; }

  /* خواندنِ سوابق همان انجامِ مرحله است — همان رفتار پنل؛ باکس مدیر سبز می‌شود */
  const t = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE items SET hist_done_at=COALESCE(hist_done_at,?) WHERE id=?").bind(t, itemId),
    env.DB.prepare("UPDATE alerts SET canceled_at=? WHERE assignment_id=? AND kind='stage' AND stage=1 AND fired_at IS NULL").bind(t, it.aid),
    env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)")
      .bind(t, `expert:${ex.id}`, "hist", it.request_id, JSON.stringify({ assignment_id: it.aid, item_id: itemId, channel: "telegram" })),
  ]);

  const rows = h.suppliers || [];
  if (!rows.length) {
    const why = h.excluded && h.excluded.length
      ? `هرچه از این قلم خریده شده زیر نام تجمیعی «${h.excluded[0].name}» ثبت شده و تأمین‌کنندهٔ نام‌داری ندارد.`
      : (h.message || "سابقه‌ای در فایل مرجع پیدا نشد.");
    await api.sendMessage(chat, `📚 <b>سوابق «${esc(short(it.title, 40))}»</b>\n\n${esc(why)}`).catch(() => {});
    return { ok: true };
  }

  const unit = h.item && h.item.unit ? ` ${h.item.unit}` : "";
  const list = rows.slice(0, HIST_MAX_LIST).map((s, i) =>
    `${M(i + 1)}. <b>${esc(short(s.name, 36))}</b>\n`
    + `▫️ دفعات خرید: <b>${M(s.n)}</b> (رتبه ${M(s.rankN)}) · مقدار: <b>${M(RQ(s.qty))}</b>${esc(unit)} (رتبه ${M(s.rankQty)})\n`
    + `▫️ سهم: <b>${s.share.toFixed(1)}٪</b> · امتیاز گشتاوری: <b>${s.mshare.toFixed(1)}٪</b> (رتبه ${M(s.rankM)})`).join("\n");
  const text = `📚 <b>سوابق تأمین «${esc(short(it.title, 40))}»</b>\n`
    + `${M(rows.length)} تأمین‌کننده · ${M(h.totals.n)} خرید · جمع مقدار ${M(RQ(h.totals.qty))}${esc(unit)}\n`
    + `<i>ترتیب با امتیاز گشتاوری است: خریدِ تازه‌تر سنگین‌تر (ضریب ${M(h.base.k)}).</i>\n\n${list}`
    + (rows.length > HIST_MAX_LIST ? `\n\n<i>و ${M(rows.length - HIST_MAX_LIST)} تأمین‌کنندهٔ دیگر — در پنل</i>` : "")
    + (h.item && h.item.mixedUnits ? `\n\n⚠️ <i>واحدهای این قلم یکدست نیستند (${esc(h.item.units || "")})؛ جمع مقدار را با احتیاط بخوانید.</i>` : "");
  await api.sendMessage(chat, text).catch(() => {});

  /* منوی چندانتخابی، در یک پیام جدا: با هر انتخاب فقط همین پیام کوچک ویرایش
     می‌شود و متنِ بلندِ رتبه‌بندی دست‌نخورده می‌ماند. */
  const options = rows.slice(0, HIST_MAX_SEL).map((s) => ({ name: s.name, code: s.code || "" }));
  const r = await env.DB.prepare("INSERT INTO tg_flows (expert_id,chat_id,kind,step,assignment_id,data_json,created_at,expires_at) VALUES (?,?,'hist','pick_suppliers',?,?,?,?)")
    .bind(ex.id, String(chat), it.aid, JSON.stringify({ itemId, options, sel: [] }), t, t + FLOW_TTL).run();
  const fid = r.meta.last_row_id;
  const msg = await api.sendMessage(chat, HIST_SEL_TEXT, histSelKb(fid, options, [])).catch(() => null);
  if (msg && msg.message_id) await env.DB.prepare("UPDATE tg_flows SET message_id=? WHERE id=?").bind(msg.message_id, fid).run();
  return { ok: true };
}

function histSelKb(fid, options, sel) {
  const kb = (options || []).map((o, i) => [{ text: `${(sel || []).includes(i) ? "☑" : "☐"} ${short(o.name, 32)}`, callback_data: `hf:${fid}:t:${i}` }]);
  kb.push([{ text: `➕ افزودن به استعلامات${(sel || []).length ? ` (${M(sel.length)})` : ""}`, callback_data: `hf:${fid}:go:0` }]);
  kb.push([{ text: "✖️ بستن", callback_data: `hf:${fid}:x:0` }]);
  return kb;
}

/** انتخاب‌شده‌ها را به خط‌های استعلامِ همان قلم تبدیل می‌کند و کارت خط‌ها را می‌فرستد */
async function histAddToQuotes(env, api, chat, ex, f, d, messageId) {
  const aid = f.assignment_id;
  const itRow = await env.DB.prepare("SELECT id, unit, qty FROM items WHERE id=? AND assignment_id=?").bind(d.itemId, aid).first();
  if (!itRow) { await api.sendMessage(chat, "قلم این فهرست دیگر پیدا نمی‌شود.").catch(() => {}); return { ok: true }; }
  const have = new Set(((await env.DB.prepare("SELECT supplier_name FROM quotes WHERE assignment_id=? AND item_id=?").bind(aid, d.itemId).all()).results || [])
    .map((q) => q.supplier_name));
  const t = now();
  const stmts = []; let added = 0, skipped = 0;
  for (const i of d.sel || []) {
    const o = (d.options || [])[i]; if (!o) continue;
    if (have.has(o.name)) { skipped++; continue; }
    stmts.push(env.DB.prepare(`INSERT INTO quotes (assignment_id,item_id,supplier_name,supplier_code,unit,qty,invoice,source,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,'telegram',?,?)`)
      .bind(aid, d.itemId, o.name, o.code || null, itRow.unit || null, itRow.qty ?? null, INVOICE_DEFAULT, t, t));
    added++;
  }
  stmts.push(env.DB.prepare("UPDATE tg_flows SET step='done', done_at=? WHERE id=?").bind(t, f.id));
  await env.DB.batch(stmts);
  if (messageId) await api.editMessageText(chat, messageId,
    `✅ <b>${M(added)}</b> تأمین‌کننده وارد استعلامات شد${skipped ? ` و ${M(skipped)} مورد از قبل بود` : ""}.`).catch(() => {});
  return quoteLinesCard(env, api, chat, ex, aid);
}

/* ------------------------------------------------------------------ */
/* کارت خط‌های استعلام — بعد از افزودن از سوابق، خودکار می‌آید              */
/* ------------------------------------------------------------------ */
async function quoteLinesCard(env, api, chat, ex, aid, messageId) {
  const asg = await ownOpenAssignment(env, ex.id, aid);
  if (!asg) { await api.sendMessage(chat, "این ارجاع متعلق به شما نیست یا بسته شده.").catch(() => {}); return { ok: true }; }
  const qs2 = (await env.DB.prepare(`SELECT q.id, q.supplier_name, q.price, q.saved, i.title
    FROM quotes q JOIN items i ON i.id=q.item_id WHERE q.assignment_id=? ORDER BY q.id LIMIT 24`).bind(aid).all()).results || [];
  const text = `🧾 <b>استعلامات درخواست ${esc(asg.request_id)}</b>\n\n`
    + (qs2.length
      ? qs2.map((q, i) => `${M(i + 1)}. <b>${esc(short(q.supplier_name, 28))}</b> — ${esc(short(q.title, 26))}${q.price != null ? ` — ${M(q.price)} ریال` : ""} ${q.saved ? "✅" : "✳️"}`).join("\n")
        + "\n\n✅ ثبت موقت شده · ✳️ هنوز ناقص\nروی هر خط بزنید تا پیش‌فاکتورش را بدهید یا دستی ویرایشش کنید."
      : "هنوز خط استعلامی ثبت نشده است.");
  const kb = qs2.map((q, i) => [{ text: `${M(i + 1)}. ${short(q.supplier_name, 24)} — ${short(q.title, 16)}`, callback_data: `hql:${q.id}:c:0` }]);
  kb.push([{ text: "➕ افزودن دستی استعلام جدید", callback_data: `hq:${aid}:new:0` }]);
  const edited = messageId ? await api.editMessageText(chat, messageId, text, kb).catch(() => null) : null;
  if (!edited) await api.sendMessage(chat, text, kb).catch(() => {});
  return { ok: true };
}

async function quoteLineMenu(env, api, chat, ex, qid, messageId) {
  const q = await ownQuote(env, ex.id, qid);
  if (!q) { await api.sendMessage(chat, "این خط استعلام پیدا نشد.").catch(() => {}); return { ok: true }; }
  const text = `🧾 خط استعلام <b>${esc(short(q.supplier_name, 32))}</b>${q.price != null ? ` — قیمت فعلی ${M(q.price)} ریال` : " — هنوز قیمت ندارد"}\n\nچه می‌کنید؟`;
  const kb = [
    [{ text: "📎 دریافت پیش‌فاکتور", callback_data: `hqp:${q.id}:0:0` }],
    [{ text: "✏️ ویرایش دستی", callback_data: `qe:${q.id}:0` }],
    [{ text: "→ بازگشت به فهرست", callback_data: `hq:${q.assignment_id}:show:0` }],
  ];
  const edited = messageId ? await api.editMessageText(chat, messageId, text, kb).catch(() => null) : null;
  if (!edited) await api.sendMessage(chat, text, kb).catch(() => {});
  return { ok: true };
}

/** استعلام دستی برای ارجاعِ معلوم — بدون پرسیدنِ دوبارهٔ «کدام درخواست» */
async function manualForAssignment(env, api, chat, ex, aid) {
  const asg = await ownOpenAssignment(env, ex.id, aid);
  if (!asg) { await api.sendMessage(chat, "این ارجاع متعلق به شما نیست یا بسته شده.").catch(() => {}); return { ok: true }; }
  await closeFlows(env, ex.id);
  const sups = ((await env.DB.prepare("SELECT DISTINCT supplier_name FROM quotes WHERE assignment_id=? ORDER BY supplier_name").bind(aid).all()).results || [])
    .map((r) => r.supplier_name).filter(Boolean);
  const t = now();
  const r = await env.DB.prepare("INSERT INTO tg_flows (expert_id,chat_id,kind,step,assignment_id,data_json,created_at,expires_at) VALUES (?,?,'manual','need_supplier',?,?,?,?)")
    .bind(ex.id, String(chat), aid, JSON.stringify({ supplierOptions: sups }), t, t + FLOW_TTL).run();
  const fid = r.meta.last_row_id;
  const kb = sups.map((s2, i) => [{ text: short(s2, 34), callback_data: `fl:${fid}:s:${i}` }]);
  kb.push([{ text: "✖️ لغو", callback_data: `fl:${fid}:x:0` }]);
  const msg = await api.sendMessage(chat,
    `🧾 <b>استعلام دستی</b>\nدرخواست <b>${esc(asg.request_id)}</b> — ${esc(short(asg.party, 40))}\n\n`
    + (sups.length ? "از کدام تأمین‌کننده؟ اگر تازه است، نامش را بنویسید." : "نام تأمین‌کننده را بنویسید:"), kb).catch(() => null);
  if (msg && msg.message_id) await env.DB.prepare("UPDATE tg_flows SET message_id=? WHERE id=?").bind(msg.message_id, fid).run();
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* تحویل بسته                                                          */
/* ------------------------------------------------------------------ */

async function deliver(env, api, chat, ex, aid) {
  const settings = await getSettings(env);
  const d = await bundleData(env, aid, settings, env.COMPANY || "تونل سد آریانا");
  if (d.assignment.expert_id !== ex.id) { await api.sendMessage(chat, "این ارجاع متعلق به شما نیست."); return { ok: true }; }

  const st = readiness(d);
  if (!st.suppliers) {
    await api.sendMessage(chat, "هنوز هیچ استعلامِ تأییدنهایی‌شده‌ای ندارید، پس جدول کمیسیون خالی درمی‌آید.\nاول قیمت‌ها را ثبت کنید — با /faktor یا فرستادن پیش‌فاکتور.");
    return { ok: true };
  }

  const store = storage(env);
  let letterBytes = null;
  if (d.letter && d.letter.docx_key && store) {
    const f = await store.get(d.letter.docx_key).catch(() => null);
    if (f) letterBytes = await new Response(f.body).arrayBuffer();
  }

  const files = await buildFiles(d, letterBytes);

  /* اول ثبت، بعد ارسال.
     تولید جدول کمیسیون یعنی مرحلهٔ ششم انجام شده — همان کاری که دکمهٔ پنل می‌کند.
     اگر اول می‌فرستادیم و تلگرام یک لحظه در دسترس نبود، کارِ تمام‌شده در میز
     مدیر ناتمام می‌ماند و هشدارهایش هم می‌رفت. ارسال، تحویل است نه تولید. */
  const t = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE assignments SET commission_at=COALESCE(commission_at,?) WHERE id=?").bind(t, aid),
    env.DB.prepare("UPDATE alerts SET canceled_at=? WHERE assignment_id=? AND fired_at IS NULL").bind(t, aid),
    env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)")
      .bind(t, `expert:${ex.id}`, "commission", d.request.id, JSON.stringify({ assignment_id: aid, files: files.length, channel: "telegram" })),
  ]);

  await api.sendMessage(chat, `📦 در حال آماده کردن ${M(files.length)} فایل برای درخواست <b>${esc(d.request.id)}</b>…`).catch(() => {});
  const failed = [];
  for (const f of files) {
    try { await api.sendDocument(chat, f.name, new Blob([f.body], { type: f.type })); }
    catch (e) { failed.push(f.name); }
  }
  if (failed.length) {
    await api.sendMessage(chat,
      `⚠️ ${M(failed.length)} فایل فرستاده نشد: ${esc(failed.join("، "))}\nهمه‌شان در پنل هستند و از آن‌جا می‌توانید بگیرید.`,
      panelButton).catch(() => {});
  }

  const warn = [];
  if (st.itemsMissing.length) warn.push(`⚠️ ${M(st.itemsMissing.length)} قلم هنوز قیمت تأییدنهایی ندارد: ${esc(st.itemsMissing.slice(0, 4).join("، "))}`);
  if (!st.hasNotes) warn.push("📝 توضیحات برگهٔ کمیسیون خالی است — با /tozihat می‌نویسید.");
  if (!st.hasLetter) warn.push("✉️ نامهٔ پیوست ندارید — اگر لازم است /nameh را بزنید.");
  await api.sendMessage(chat,
    `✅ فایل‌ها فرستاده شد. همین‌ها در پنل هم هست.` + (warn.length ? `\n\n${warn.join("\n")}` : ""), panelButton).catch(() => {});
  return sendProgress(env, api, chat, aid);
}

/* ------------------------------------------------------------------ */
/* فاکتور دستی و توضیحات — گفت‌وگوی چندمرحله‌ای                          */
/* ------------------------------------------------------------------ */

const FLOW_TTL = 2 * 3600000;

/** جریان باز همین کارشناس (هر کارشناس در هر لحظه یک جریان دارد) */
async function openFlow(env, expertId) {
  return env.DB.prepare("SELECT * FROM tg_flows WHERE expert_id=? AND done_at IS NULL AND expires_at>? ORDER BY id DESC LIMIT 1")
    .bind(expertId, now()).first();
}
async function closeFlows(env, expertId) {
  await env.DB.prepare("UPDATE tg_flows SET done_at=? WHERE expert_id=? AND done_at IS NULL").bind(now(), expertId).run();
}
const flowData = (f) => { try { return JSON.parse(f.data_json || "{}"); } catch { return {}; } };

/** شروع: کدام درخواست؟ — هم برای فاکتور دستی، هم برای توضیحات */
async function startFlow(env, api, chat, ex, kind) {
  const open = await openAssignments(env, ex.id);
  if (!open.length) { await api.sendMessage(chat, "الان هیچ ارجاع بازی ندارید."); return { ok: true }; }
  await closeFlows(env, ex.id);
  const t = now();
  const ins = await env.DB.prepare(
    "INSERT INTO tg_flows (expert_id,chat_id,kind,step,created_at,expires_at) VALUES (?,?,?,'pick_request',?,?)",
  ).bind(ex.id, String(chat), kind, t, t + FLOW_TTL).run();
  const fid = ins.meta.last_row_id;

  const kb = open.map((a) => [{ text: `${a.request_id} — ${short(a.party)}`, callback_data: `fl:${fid}:r:${a.id}` }]);
  kb.push([{ text: "✖️ بی‌خیال", callback_data: `fl:${fid}:x:0` }]);
  const title = { manual: "🧾 <b>فاکتور دستی</b>", notes: "📝 <b>توضیحات برگهٔ کمیسیون</b>",
    letter: "✉️ <b>نامهٔ پیوست کمیسیون</b>", deliver: "📦 <b>گرفتن فایل‌های آماده</b>",
    progress: "📊 <b>پیشرفت کار</b>" }[kind];
  const sent = await api.sendMessage(chat, `${title}\n\nبرای کدام درخواست است؟`, kb);
  await env.DB.prepare("UPDATE tg_flows SET message_id=? WHERE id=?").bind(sent.message_id, fid).run();
  return { ok: true };
}

/** اقلام باز یک ارجاع، به ترتیب سطر */
async function itemsOf(env, aid) {
  return (await env.DB.prepare(
    "SELECT id, line_no, title, qty, unit, spec FROM items WHERE assignment_id=? AND state='open' ORDER BY line_no",
  ).bind(aid).all()).results || [];
}

/** پرسش قیمت قلم جاری */
async function askPrice(env, api, chat, f) {
  const d = flowData(f);
  const its = await itemsOf(env, f.assignment_id);
  const it = its[d.idx || 0];
  if (!it) return confirmManual(env, api, chat, f);
  const n = its.length;
  await api.sendMessage(chat,
    `🧾 قلم ${M((d.idx || 0) + 1)} از ${M(n)}\n\n<b>${esc(it.title)}</b>\n`
    + `${it.qty == null ? "" : `مقدار: ${M(it.qty)} ${esc(it.unit || "")}\n`}`
    + `${it.spec ? `مشخصات: ${esc(it.spec)}\n` : ""}`
    + `\n<b>قیمت واحد</b> را به ریال بنویسید.\nاگر این قلم در فاکتور نیست، «-» بفرستید.`,
    [[{ text: "✖️ لغو فاکتور دستی", callback_data: `fl:${f.id}:x:0` }]]);
  return { ok: true };
}

/** جمع‌بندی و گرفتن تأیید نهایی */
async function confirmManual(env, api, chat, f) {
  const d = flowData(f);
  const its = await itemsOf(env, f.assignment_id);
  const a = await env.DB.prepare("SELECT request_id FROM assignments WHERE id=?").bind(f.assignment_id).first();
  const lines = its.map((it) => {
    const p = d.prices && d.prices[it.id];
    if (p == null) return `• ${esc(it.title)} — <i>وارد نشد</i>`;
    const tot = (+p) * (+it.qty || 0);
    return `• ${esc(it.title)}\n   ${money(p)} ریال × ${M(it.qty || 0)} = <b>${money(tot)}</b> ریال`;
  }).join("\n");
  const sum = its.reduce((s, it) => s + ((d.prices && d.prices[it.id]) || 0) * (+it.qty || 0), 0);

  await env.DB.prepare("UPDATE tg_flows SET step='confirm', data_json=? WHERE id=?").bind(JSON.stringify(d), f.id).run();
  await api.sendMessage(chat,
    `🧾 <b>بازبینی فاکتور دستی</b>\n\nدرخواست <b>${esc(a ? a.request_id : "")}</b>\nتأمین‌کننده: <b>${esc(d.supplier || "")}</b>\n\n${lines}\n\n`
    + `جمع بدون ارزش افزوده: <b>${money(sum)}</b> ریال\n\n`
    + `${d.notes ? `📝 توضیحات: ${esc(d.notes)}\n\n` : ""}درست است؟`,
    [
      [{ text: "✅ ثبت کن", callback_data: `fl:${f.id}:ok:0` }],
      [{ text: "📝 افزودن توضیحات", callback_data: `fl:${f.id}:note:0` }],
      [{ text: "🔁 از اول", callback_data: `fl:${f.id}:again:0` }, { text: "✖️ لغو", callback_data: `fl:${f.id}:x:0` }],
    ]);
  return { ok: true };
}

/** «۱۲٬۳۴۵٬۶۷۸» — جداکنندهٔ هزارگان فارسی */
const money = (n) => M(Number(n || 0).toLocaleString("en-US")).replace(/,/g, "٬");

/** ثبت نهایی: قیمت‌ها به‌عنوان استعلام همان تأمین‌کننده می‌نشینند —
    دقیقاً همان جدولی که استخراج مدل هم در آن می‌نویسد، تا جدول کمیسیون یکی باشد.
    یکتایی (ارجاع، قلم، تأمین‌کننده) در این سامانه با ایندکس تضمین نشده و در کد
    کنترل می‌شود، پس این‌جا هم اول می‌خوانیم بعد می‌نویسیم. */
async function saveManual(env, api, chat, f) {
  const d = flowData(f);
  const its = await itemsOf(env, f.assignment_id);
  const t = now();
  const existing = new Map(((await env.DB.prepare(
    "SELECT id, item_id FROM quotes WHERE assignment_id=? AND supplier_name=?",
  ).bind(f.assignment_id, d.supplier).all()).results || []).map((q) => [q.item_id, q.id]));

  const stmts = [];
  let n = 0;
  for (const it of its) {
    const price = d.prices && d.prices[it.id];
    if (price == null) continue;
    n++;
    const qid = existing.get(it.id);
    /* ثبت موقت این‌جا زده نمی‌شود: زمان تحویل و شرایط تسویه اجباری‌اند و فاکتور
       دستی فقط قیمت می‌گیرد. کارتِ بعدی همان دو-سه فیلد را می‌پرسد و «ثبت موقت»
       را همان‌جا می‌گذارد. */
    stmts.push(qid
      ? env.DB.prepare("UPDATE quotes SET price=?, qty=?, unit=COALESCE(unit,?), invoice=COALESCE(invoice,?), saved=0, source='manual', updated_at=? WHERE id=?")
        .bind(price, it.qty, it.unit || null, INVOICE_DEFAULT, t, qid)
      : env.DB.prepare(
        `INSERT INTO quotes (assignment_id,item_id,supplier_name,spec,unit,qty,price,invoice,saved,final,source,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,0,0,'manual',?,?)`,
      ).bind(f.assignment_id, it.id, d.supplier, it.spec || null, it.unit || null, it.qty, price, INVOICE_DEFAULT, t, t));
  }
  if (d.notes) stmts.push(env.DB.prepare("UPDATE assignments SET notes=? WHERE id=?").bind(d.notes, f.assignment_id));
  stmts.push(env.DB.prepare("UPDATE tg_flows SET step='done', done_at=? WHERE id=?").bind(t, f.id));
  stmts.push(env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)")
    .bind(t, `expert:${f.expert_id}`, "manual_quote", null, JSON.stringify({ assignment_id: f.assignment_id, supplier: d.supplier, items: n, channel: "telegram" })));
  await env.DB.batch(stmts);

  return quoteCard(env, api, chat, f.assignment_id, d.supplier, null,
    `✅ ${M(n)} قلم قیمت‌گذاری شد.${d.notes ? "\n📝 توضیحات هم در برگهٔ کمیسیون ثبت شد." : ""}\nبرای ثبت موقت، شرایط فاکتور (زمان تحویل و شرایط تسویه) هم لازم است:`);
}

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
      await api.editMessageText(chat, cq.message.message_id, cq.message.text
        ? esc(cq.message.text) + "\n\n<i>✅ مشاهده ثبت شد</i>" : "✅ مشاهده ثبت شد", afterSeenKb(id)).catch(() => {});
    }
    return { ok: true };
  }

  /* بررسی سوابق: hs:a:<aid> (انتخاب قلم) · hs:i:<itemId> (اجرا) · hs:s (جستجوی هوشمند — هنوز وصل نیست) */
  if (action === "hs") {
    const [, sub, vRaw] = T(cq.data).split(":");
    const v = parseInt(vRaw, 10);
    if (sub === "s") { await ack("جستجوی هوشمند هنوز به مدل وصل نشده است؛ به‌زودی فعال می‌شود.", true); return { ok: true }; }
    if (sub === "a") { await ack(); return histPickItem(env, api, chat, ex, v); }
    if (sub === "i") { await ack("در حال محاسبه…"); return histRun(env, api, chat, ex, v); }
    await ack(); return { ok: true };
  }

  /* منوی چندانتخابی تأمین‌کنندگانِ سوابق: hf:<flowId>:t:<idx> · go · x */
  if (action === "hf") {
    const [, fidRaw, step, valRaw] = T(cq.data).split(":");
    const f = await env.DB.prepare("SELECT * FROM tg_flows WHERE id=? AND expert_id=? AND kind='hist'").bind(parseInt(fidRaw, 10), ex.id).first();
    if (!f || f.done_at) { await ack("این فهرست دیگر فعال نیست.", true); return { ok: true }; }
    const d = flowData(f);
    if (step === "x") {
      await env.DB.prepare("UPDATE tg_flows SET step='canceled', done_at=? WHERE id=?").bind(now(), f.id).run();
      await ack("بسته شد");
      if (cq.message) await api.editMessageText(chat, cq.message.message_id, "✖️ فهرست بسته شد؛ از پنل یا با اجرای دوبارهٔ «بررسی سوابق» دوباره باز می‌شود.").catch(() => {});
      return { ok: true };
    }
    if (step === "t") {
      const i = parseInt(valRaw, 10);
      if (!(d.options || [])[i]) { await ack("گزینهٔ نامعتبر.", true); return { ok: true }; }
      d.sel = d.sel || [];
      const at = d.sel.indexOf(i);
      if (at >= 0) d.sel.splice(at, 1); else d.sel.push(i);
      await env.DB.prepare("UPDATE tg_flows SET data_json=? WHERE id=?").bind(JSON.stringify(d), f.id).run();
      await ack();
      if (cq.message) await api.editMessageText(chat, cq.message.message_id, HIST_SEL_TEXT, histSelKb(f.id, d.options, d.sel)).catch(() => {});
      return { ok: true };
    }
    if (step === "go") {
      if (!(d.sel || []).length) { await ack("هنوز تأمین‌کننده‌ای انتخاب نکرده‌اید.", true); return { ok: true }; }
      await ack("در حال افزودن…");
      return histAddToQuotes(env, api, chat, ex, f, d, cq.message && cq.message.message_id);
    }
    await ack(); return { ok: true };
  }

  /* کارت خط‌های استعلام: hq:<aid>:show|new · hql:<qid> (منوی خط) · hqp:<qid> (درخواست پیش‌فاکتور) */
  if (action === "hq") {
    const [, aidRaw, sub] = T(cq.data).split(":");
    const aid2 = parseInt(aidRaw, 10);
    await ack();
    if (sub === "new") return manualForAssignment(env, api, chat, ex, aid2);
    return quoteLinesCard(env, api, chat, ex, aid2, cq.message && cq.message.message_id);
  }
  if (action === "hql") {
    const [, qidRaw] = T(cq.data).split(":");
    await ack();
    return quoteLineMenu(env, api, chat, ex, parseInt(qidRaw, 10), cq.message && cq.message.message_id);
  }
  if (action === "hqp") {
    const [, qidRaw] = T(cq.data).split(":");
    const q = await ownQuote(env, ex.id, parseInt(qidRaw, 10));
    if (!q) { await ack("این خط استعلام پیدا نشد.", true); return { ok: true }; }
    await ack();
    await api.sendMessage(chat,
      `📎 فایل پیش‌فاکتور <b>${esc(short(q.supplier_name, 36))}</b> را همین حالا همین‌جا بفرستید (PDF یا عکس).\n\n`
      + "<i>هر فایلی که به بات بفرستید پیش‌فاکتور حساب می‌شود؛ بعد از دریافت، همان‌جا تأمین‌کننده‌اش را تأیید می‌کنید و استخراج خودکار شروع می‌شود.</i>").catch(() => {});
    return { ok: true };
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

  /* جدول کمیسیون: ct:<aid>:<step>:<value> */
  if (action === "ct") {
    const [, aidRaw, step, valRaw] = T(cq.data).split(":");
    const aid = parseInt(aidRaw, 10);
    const mid = cq.message && cq.message.message_id;
    if (step === "x") {
      await ack("بی‌خیال");
      if (mid) await api.editMessageText(chat, mid, "باشد. هر وقت خواستید، از کارت استعلام یا /pishraft جدول را بسازید.").catch(() => {});
      return { ok: true };
    }
    if (step === "t") {
      await env.DB.prepare(
        `UPDATE quotes SET final=CASE WHEN final=1 THEN 0 ELSE 1 END, updated_at=? WHERE id=? AND assignment_id=? AND saved=1
         AND assignment_id IN (SELECT id FROM assignments WHERE expert_id=?)`,
      ).bind(now(), parseInt(valRaw, 10), aid, ex.id).run();
      await ack();
      return tableSelect(env, api, chat, ex, aid, mid);
    }
    if (step === "all" || step === "none") {
      await env.DB.prepare(
        "UPDATE quotes SET final=?, updated_at=? WHERE assignment_id=? AND saved=1 AND assignment_id IN (SELECT id FROM assignments WHERE expert_id=?)",
      ).bind(step === "all" ? 1 : 0, now(), aid, ex.id).run();
      await ack();
      return tableSelect(env, api, chat, ex, aid, mid);
    }
    if (step === "go") { await ack("در حال ساختن…"); return makeTable(env, api, chat, ex, aid, mid); }
    await ack();
    return tableSelect(env, api, chat, ex, aid, null);
  }

  /* تأیید کمیسیون و خاتمه: cm:<aid>:<step>:<value> */
  if (action === "cm") {
    const [, aidRaw, step, valRaw] = T(cq.data).split(":");
    const aid = parseInt(aidRaw, 10);
    const mid = cq.message && cq.message.message_id;
    const own = await env.DB.prepare("SELECT id FROM assignments WHERE id=? AND expert_id=?").bind(aid, ex.id).first();
    if (!own) { await ack("این ارجاع متعلق به شما نیست.", true); return { ok: true }; }

    if (step === "t") {
      await env.DB.prepare("UPDATE items SET commission_ok=CASE WHEN commission_ok=1 THEN 0 ELSE 1 END WHERE id=? AND assignment_id=? AND state='open'")
        .bind(parseInt(valRaw, 10), aid).run();
      await ack();
      return closeCard(env, api, chat, ex, aid, mid);
    }
    if (step === "all" || step === "none") {
      await env.DB.prepare("UPDATE items SET commission_ok=? WHERE assignment_id=? AND state='open'").bind(step === "all" ? 1 : 0, aid).run();
      await ack();
      return closeCard(env, api, chat, ex, aid, mid);
    }
    if (step === "edit") {
      /* پرونده باز می‌ماند: مرحلهٔ «جدول کمیسیون» از سبز برمی‌گردد تا معلوم باشد کار ادامه دارد */
      await env.DB.batch([
        env.DB.prepare("UPDATE assignments SET commission_at=NULL WHERE id=?").bind(aid),
        env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)")
          .bind(now(), `expert:${ex.id}`, "commission_reopen", null, JSON.stringify({ assignment_id: aid, channel: "telegram" })),
      ]);
      await ack("پرونده برای ویرایش باز است");
      if (mid) await api.editMessageText(chat, mid, "✏️ پرونده باز است. پیش‌فاکتور تازه بفرستید، خط اضافه کنید یا قیمت‌ها را عوض کنید؛ بعد دوباره جدول کمیسیون را بسازید.", panelButton).catch(() => {});
      return sendProgress(env, api, chat, aid);
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
      if (mid) await api.editMessageText(chat, mid, txt, panelButton).catch(() => api.sendMessage(chat, txt, panelButton));
      else await api.sendMessage(chat, txt, panelButton);
      /* پیام‌های صف (اعلان مدیر) بی‌درنگ بروند، نه با Cron بعدی */
      await drainOutbox(env, 10).catch(() => {});
      return { ok: true };
    }
    await ack();
    return closeCard(env, api, chat, ex, aid, null);
  }

  /* جریان پیش‌فاکتور: pf:<uploadId>:<step>:<value> */
  if (action === "pf") {
    const [, uidRaw, step, valRaw] = T(cq.data).split(":");
    const up = await env.DB.prepare("SELECT * FROM tg_uploads WHERE id=? AND expert_id=?").bind(parseInt(uidRaw, 10), ex.id).first();
    if (!up) { await ack("این بارگذاری پیدا نشد.", true); return { ok: true }; }
    if (up.done_at) { await ack("این فایل قبلاً ثبت شده است."); return { ok: true }; }

    if (step === "x") {
      const store = storage(env);
      if (store && up.storage_key) await store.remove(up.storage_key).catch(() => {});
      await env.DB.prepare("UPDATE tg_uploads SET state='canceled', done_at=? WHERE id=?").bind(now(), up.id).run();
      await ack("لغو شد");
      if (cq.message) await api.editMessageText(chat, cq.message.message_id, "✖️ لغو شد و فایل حذف شد.").catch(() => {});
      return { ok: true };
    }
    if (step === "r") {
      const asg = await ownOpenAssignment(env, ex.id, parseInt(valRaw, 10));
      if (!asg) { await ack("این ارجاع دیگر باز نیست.", true); return { ok: true }; }
      await ack();
      return askQuote(env, api, chat, up.id, asg, up.filename, cq.message && cq.message.message_id);
    }
    if (step === "s") {
      const opts = JSON.parse(up.options_json || "[]");
      const o = opts[parseInt(valRaw, 10)];
      /* گزینه‌های قدیمی رشتهٔ خالی‌اند، تازه‌ها شیء — هر دو باید کار کنند */
      const name = typeof o === "string" ? o : o && o.n;
      if (!name) { await ack("این گزینه دیگر معتبر نیست.", true); return { ok: true }; }
      await ack();
      return saveProforma(env, api, chat, up, name);
    }
    if (step === "a") {
      if (!up.assignment_id) { await ack("اول باید درخواست را انتخاب کنید.", true); return { ok: true }; }
      await ack("در حال خواندن…");
      return newQuoteFromFile(env, api, chat, ex, up);
    }
    if (step === "n") {
      await env.DB.prepare("UPDATE tg_uploads SET state='need_name' WHERE id=?").bind(up.id).run();
      await ack();
      await api.sendMessage(chat, "نام تأمین‌کننده را بنویسید و بفرستید:");
      return { ok: true };
    }
  }

  /* فاکتور دستی و توضیحات: fl:<flowId>:<step>:<value> */
  if (action === "fl") {
    const [, fidRaw, step, valRaw] = T(cq.data).split(":");
    const f = await env.DB.prepare("SELECT * FROM tg_flows WHERE id=? AND expert_id=?").bind(parseInt(fidRaw, 10), ex.id).first();
    if (!f) { await ack("این گفت‌وگو پیدا نشد.", true); return { ok: true }; }
    if (f.done_at) { await ack("این گفت‌وگو تمام شده است."); return { ok: true }; }
    const d = flowData(f);

    if (step === "x") {
      await env.DB.prepare("UPDATE tg_flows SET step='canceled', done_at=? WHERE id=?").bind(now(), f.id).run();
      await ack("لغو شد");
      if (cq.message) await api.editMessageText(chat, cq.message.message_id, "✖️ لغو شد.").catch(() => {});
      return { ok: true };
    }

    if (step === "r") {
      const aid = parseInt(valRaw, 10);
      const asg = await ownOpenAssignment(env, ex.id, aid);
      if (!asg) { await ack("این ارجاع دیگر باز نیست.", true); return { ok: true }; }
      await ack();

      if (f.kind === "progress") {
        await env.DB.prepare("UPDATE tg_flows SET assignment_id=?, step='done', done_at=? WHERE id=?").bind(aid, now(), f.id).run();
        if (cq.message) await api.editMessageText(chat, cq.message.message_id, `درخواست <b>${esc(asg.request_id)}</b>`).catch(() => {});
        return sendProgress(env, api, chat, aid);
      }
      if (f.kind === "letter" || f.kind === "deliver") {
        await env.DB.prepare("UPDATE tg_flows SET assignment_id=?, step='done', done_at=? WHERE id=?").bind(aid, now(), f.id).run();
        if (cq.message) await api.editMessageText(chat, cq.message.message_id, `درخواست <b>${esc(asg.request_id)}</b> انتخاب شد.`).catch(() => {});
        return f.kind === "letter" ? startLetter(env, api, chat, ex, aid) : deliver(env, api, chat, ex, aid);
      }

      if (f.kind === "notes") {
        await env.DB.prepare("UPDATE tg_flows SET assignment_id=?, step='need_notes' WHERE id=?").bind(aid, f.id).run();
        const cur = await env.DB.prepare("SELECT notes FROM assignments WHERE id=?").bind(aid).first();
        await api.editMessageText(chat, cq.message.message_id,
          `📝 <b>توضیحات برگهٔ کمیسیون</b>\nدرخواست <b>${esc(asg.request_id)}</b>\n\n`
          + (cur && cur.notes ? `متن فعلی:\n<i>${esc(cur.notes)}</i>\n\nمتن تازه را بنویسید (جایگزین می‌شود):` : "توضیحاتتان را بنویسید:")).catch(() => {});
        return { ok: true };
      }

      /* فاکتور دستی: اول تأمین‌کننده */
      const sups = ((await env.DB.prepare("SELECT DISTINCT supplier_name FROM quotes WHERE assignment_id=? ORDER BY supplier_name").bind(aid).all()).results || [])
        .map((r) => r.supplier_name).filter(Boolean);
      d.supplierOptions = sups;
      await env.DB.prepare("UPDATE tg_flows SET assignment_id=?, step='need_supplier', data_json=? WHERE id=?").bind(aid, JSON.stringify(d), f.id).run();
      const kb = sups.map((s2, i) => [{ text: short(s2, 34), callback_data: `fl:${f.id}:s:${i}` }]);
      kb.push([{ text: "✖️ لغو", callback_data: `fl:${f.id}:x:0` }]);
      await api.editMessageText(chat, cq.message.message_id,
        `🧾 <b>فاکتور دستی</b>\nدرخواست <b>${esc(asg.request_id)}</b> — ${esc(short(asg.party, 40))}\n\n`
        + (sups.length ? "فاکتور از کدام تأمین‌کننده است؟ اگر تازه است، نامش را بنویسید." : "نام تأمین‌کننده را بنویسید:"), kb).catch(() => {});
      return { ok: true };
    }

    if (step === "s") {
      const name = (d.supplierOptions || [])[parseInt(valRaw, 10)];
      if (!name) { await ack("این گزینه معتبر نیست.", true); return { ok: true }; }
      await ack();
      d.supplier = name; d.idx = 0; d.prices = {};
      await env.DB.prepare("UPDATE tg_flows SET step='prices', data_json=? WHERE id=?").bind(JSON.stringify(d), f.id).run();
      return askPrice(env, api, chat, { ...f, step: "prices", data_json: JSON.stringify(d) });
    }

    if (step === "note") {
      await env.DB.prepare("UPDATE tg_flows SET step='need_notes' WHERE id=?").bind(f.id).run();
      await ack();
      await api.sendMessage(chat, "📝 توضیحاتی که باید پای برگهٔ کمیسیون بیاید را بنویسید:");
      return { ok: true };
    }

    if (step === "again") {
      d.idx = 0; d.prices = {};
      await env.DB.prepare("UPDATE tg_flows SET step='prices', data_json=? WHERE id=?").bind(JSON.stringify(d), f.id).run();
      await ack("از اول");
      return askPrice(env, api, chat, { ...f, step: "prices", data_json: JSON.stringify(d) });
    }

    if (step === "ok") {
      if (!Object.keys(d.prices || {}).length) { await ack("هیچ قیمتی وارد نشده است.", true); return { ok: true }; }
      await ack();
      return saveManual(env, api, chat, f);
    }
  }

  /* استخراج خودکار: ai:<proformaId>:<step>:<value> */
  if (action === "ai") {
    const [, pidRaw, step, val] = T(cq.data).split(":");
    await ack(step === "go" ? "شروع شد" : "");
    return onExtract(env, api, chat, ex, parseInt(pidRaw, 10), step, val, cq.message && cq.message.message_id);
  }

  /* نامهٔ پیوست: lt:<id>:<step>:0  — در گام ask و x و no شناسه ارجاع است، در go شناسهٔ نامه */
  if (action === "lt") {
    const [, idRaw, step] = T(cq.data).split(":");
    const n = parseInt(idRaw, 10);
    await ack();
    if (step === "ask") return startLetter(env, api, chat, ex, n);
    if (step === "no") {
      if (cq.message) await api.editMessageText(chat, cq.message.message_id, "باشد. اگر بعداً لازم شد /nameh را بزنید.\nبرای گرفتن بستهٔ کامل فایل‌ها (برگهٔ درخواست + جدول کمیسیون) و بستن کار، /tahvil را بزنید.", panelButton).catch(() => {});
      return { ok: true };
    }
    if (step === "x") {
      await env.DB.prepare("UPDATE letters SET state='canceled', updated_at=? WHERE assignment_id=? AND expert_id=? AND state IN ('need_voice','transcribed')")
        .bind(now(), n, ex.id).run();
      if (cq.message) await api.editMessageText(chat, cq.message.message_id, "✖️ نامه لغو شد.").catch(() => {});
      return { ok: true };
    }
    if (step === "go") return makeLetter(env, api, chat, ex, n);
  }

  /* پایش مراحل: st:<assignmentId>:<stage>:0 */
  if (action === "st") {
    const [, aidRaw, stage] = T(cq.data).split(":");
    const aid = parseInt(aidRaw, 10);
    await ack();
    if (stage === "hist" || stage === "smart") return markStage(env, api, chat, ex, aid, stage);
    if (stage === "deliver") return deliver(env, api, chat, ex, aid);
    if (stage === "table") return tableSelect(env, api, chat, ex, aid, null);
    return sendProgress(env, api, chat, aid);
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
export async function scheduled(env) {
  const a = await runAlerts(env, 15);
  /* رنگ‌های پایش را می‌سنجد و تغییرها را برای مدیر به صف می‌گذارد. پیش از
     drain است تا اگر چیزی تازه به صف آمد، در همین اجرا برود. */
  let w = { checked: 0, changed: 0 };
  try {
    const [settings, managerChat] = await Promise.all([getSettings(env), settingValue(env, "managerChat")]);
    w = await stageWatch(env, settings, managerChat, 40);
  } catch (e) { console.error("stageWatch failed", e && e.message); }
  const d = await drainOutbox(env, 20);
  return { ...a, ...d, watched: w.checked, colorChanges: w.changed };
}
