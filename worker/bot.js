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
import { fmtFa, workHours } from "./time.js";
import { storage, storageKey, MAX_BYTES } from "./storage.js";

const now = () => Date.now();
const T = (v) => String(v == null ? "" : v).trim();

export const STAGE_NAMES = ["مشاهده", "بررسی سوابق", "جستجوی هوشمند", "استعلامات", "پیش‌فاکتور", "جدول کمیسیون"];
const PANEL_URL = "https://arianaai.website/tamin-poshtibani/expert";

/* عددهای فارسی، چون بقیهٔ سامانه هم فارسی نشان می‌دهد. ممیز هم فارسی می‌شود
   وگرنه «۱۱.۹» یک نقطهٔ لاتین وسط رقم‌های فارسی دارد و بد می‌نشیند. */
const FA = "۰۱۲۳۴۵۶۷۸۹";
const M = (n) => String(n == null ? "" : n).replace(/\d/g, (d) => FA[+d]).replace(/\./g, "٫");

/* ------------------------------------------------------------------ */
/* صف پیام (TG-05، INV-10)                                             */
/* ------------------------------------------------------------------ */

/**
 * پیام را برای ارسال در صف می‌گذارد و statement آن را برمی‌گرداند تا در همان
 * batchِ صدازننده اجرا شود (هر کوئری D1 یک subrequest است و پلن رایگان ۵۰ تا دارد).
 *
 * `idem` کلید یکتای رویداد است: اگر همان رویداد دوبار به صف برود — مثلاً چون
 * تلگرام آپدیت را دوباره فرستاد یا Cron همزمان دوبار اجرا شد — فقط یکی می‌ماند.
 */
export function queueStmt(env, idem, chat, text, keyboard) {
  return env.DB.prepare(
    `INSERT INTO outbox (idem,channel,target,payload_json,status,next_at,created_at)
     VALUES (?,'telegram',?,?,'pending',?,?) ON CONFLICT(idem) DO NOTHING`,
  ).bind(idem, String(chat), JSON.stringify({ text, keyboard: keyboard || null }), now(), now());
}

/**
 * صف را می‌فرستد. هر ارسال یک subrequest است، پس سقف دارد.
 * شکست موقت → تلاش دوباره با عقب‌نشینی نمایی؛ شکست دائمی (بلاک شدن بات) → dead.
 */
export async function drainOutbox(env, limit = 20) {
  const rows = (await env.DB.prepare(
    `SELECT * FROM outbox WHERE status='pending' AND next_at<=? ORDER BY next_at LIMIT ?`,
  ).bind(now(), limit).all()).results || [];
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
        : env.DB.prepare("UPDATE outbox SET attempts=?, next_at=?, last_error=? WHERE id=?").bind(attempts, now() + wait, String(e.message).slice(0, 300), row.id));
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

export function dispatchText(a) {
  return `🔔 <b>ارجاع جدید</b>\n\n`
    + `درخواست <b>${esc(a.request_id)}</b>\n`
    + `${esc(a.party || "")}\n\n`
    + `${M(a.item_count)} قلم · مهلت ${M(a.days)} روز کاری\n`
    + `تا <b>${esc(fmtFa(a.deadline_at))}</b>`
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
    `SELECT al.id AS alert_id, al.kind, al.stage,
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

    if (row.kind === "stage") {
      if (!row.telegram_chat) { skipped++; continue; }
      stmts.push(queueStmt(env, `stage:${row.aid}:${row.stage}`, row.telegram_chat,
        stageAlertText(row, row.stage), row.stage === 0 ? seenButton(row.aid) : panelButton));
      queued++;
    } else {
      /* عبور از ۱۰۰٪: هم کارشناس، هم کانال مدیر (SLA-05، TG-04) */
      if (row.telegram_chat) { stmts.push(queueStmt(env, `over:${row.aid}`, row.telegram_chat, overdueText(row), panelButton)); queued++; }
      if (managerChat) { stmts.push(queueStmt(env, `over-mgr:${row.aid}`, managerChat, managerOverdueText(row))); queued++; }
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
  if (!chat || (msg.chat.type !== "private")) return { ok: true }; /* گروه/کانال جای گفت‌وگو نیست */
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

  if (msg.document || msg.photo) return onDocument(env, msg, ex);

  /* اگر منتظر نام تأمین‌کننده‌ایم، این پیام همان نام است */
  if (text && !text.startsWith("/")) {
    const up = await env.DB.prepare(
      "SELECT * FROM tg_uploads WHERE expert_id=? AND state='need_name' AND done_at IS NULL AND expires_at>? ORDER BY id DESC LIMIT 1",
    ).bind(ex.id, now()).first();
    if (up) {
      if (text.length > 120) { await api.sendMessage(chat, "نام تأمین‌کننده خیلی بلند است."); return { ok: true }; }
      return saveProforma(env, api, chat, up, text);
    }
  }

  if (text === "/stop") {
    await env.DB.prepare("UPDATE experts SET telegram_chat=NULL WHERE id=?").bind(ex.id).run();
    await api.sendMessage(chat, "اتصال قطع شد. دیگر اعلانی فرستاده نمی‌شود.\nبرای وصل شدن دوباره، از پنل لینک تازه بگیرید.");
    return { ok: true };
  }
  if (text === "/kartabl" || text === "/start kartabl") return sendTray(env, api, chat, ex);

  await api.sendMessage(chat, "دستورها:\n/kartabl — ارجاع‌های باز شما\n/stop — قطع اتصال");
  return { ok: true };
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
  if (open.length === 1) return askSupplier(env, api, chat, uid, open[0], filename, null);

  const kb = open.map((a) => [{ text: `${a.request_id} — ${short(a.party)}`, callback_data: `pf:${uid}:r:${a.id}` }]);
  kb.push([{ text: "✖️ بی‌خیال", callback_data: `pf:${uid}:x:0` }]);
  const sent = await api.sendMessage(chat, `📎 <b>${esc(filename)}</b> گرفته شد.\n\nاین پیش‌فاکتور برای کدام درخواست است؟`, kb);
  await env.DB.prepare("UPDATE tg_uploads SET message_id=? WHERE id=?").bind(sent.message_id, uid).run();
  return { ok: true };
}

/** ارجاع‌های باز همین کارشناس (INV-11) */
async function openAssignments(env, expertId) {
  return (await env.DB.prepare(
    `SELECT a.id, a.request_id, r.party FROM assignments a JOIN requests r ON r.id=a.request_id
     WHERE a.expert_id=? AND a.dispatched_at IS NOT NULL AND a.commission_at IS NULL
       AND EXISTS (SELECT 1 FROM items i WHERE i.assignment_id=a.id AND i.state='open')
     ORDER BY a.deadline_at LIMIT 12`,
  ).bind(expertId).all()).results || [];
}

const short = (s, n = 28) => { const x = String(s || "").trim(); return x.length > n ? x.slice(0, n - 1) + "…" : x; };

/**
 * گام دوم: کدام تأمین‌کننده؟ فهرست از استعلام‌های همان درخواست می‌آید.
 * نام تأمین‌کننده می‌تواند بلند باشد و `callback_data` سقف ۶۴ بایت دارد، پس
 * نام‌ها در خود ردیف آپلود ذخیره و با اندیس ارجاع داده می‌شوند.
 */
async function askSupplier(env, api, chat, uid, asg, filename, messageId) {
  const sups = ((await env.DB.prepare(
    "SELECT DISTINCT supplier_name FROM quotes WHERE assignment_id=? ORDER BY supplier_name",
  ).bind(asg.id).all()).results || []).map((r) => r.supplier_name).filter(Boolean);

  await env.DB.prepare("UPDATE tg_uploads SET assignment_id=?, state='need_supplier', options_json=? WHERE id=?")
    .bind(asg.id, JSON.stringify(sups), uid).run();

  const kb = sups.map((s, i) => [{ text: short(s, 34), callback_data: `pf:${uid}:s:${i}` }]);
  kb.push([{ text: "➕ تأمین‌کنندهٔ تازه (نامش را می‌نویسم)", callback_data: `pf:${uid}:n:0` }]);
  kb.push([{ text: "✖️ بی‌خیال", callback_data: `pf:${uid}:x:0` }]);
  const text = `📎 <b>${esc(filename)}</b>\nدرخواست <b>${esc(asg.request_id)}</b> — ${esc(short(asg.party, 40))}\n\n`
    + (sups.length ? "این پیش‌فاکتور از کدام تأمین‌کننده است؟" : "برای این درخواست هنوز استعلامی ثبت نشده. نام تأمین‌کننده را بنویسید:");

  if (messageId) { await api.editMessageText(chat, messageId, text, kb); return { ok: true }; }
  const sent = await api.sendMessage(chat, text, kb);
  await env.DB.prepare("UPDATE tg_uploads SET message_id=? WHERE id=?").bind(sent.message_id, uid).run();
  return { ok: true };
}

/** گام آخر: ثبت پیش‌فاکتور روی استعلام آن تأمین‌کننده */
async function saveProforma(env, api, chat, up, supplier) {
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
  const text = `✅ ثبت شد.\n\n📎 <b>${esc(up.filename)}</b>\nدرخواست <b>${esc(a ? a.request_id : "")}</b> · تأمین‌کننده <b>${esc(supplier)}</b>\n\n`
    + `<i>استخراج خودکار اطلاعات پیش‌فاکتور در مرحلهٔ بعد فعال می‌شود.</i>`;
  if (up.message_id) await api.editMessageText(chat, up.message_id, text, panelButton).catch(() => api.sendMessage(chat, text, panelButton));
  else await api.sendMessage(chat, text, panelButton);
  return { ok: true };
}

async function onCallback(env, cq) {
  const api = telegram(env);
  const chat = cq.message && cq.message.chat && cq.message.chat.id;
  const [action, , idRaw] = T(cq.data).split(":");
  const id = parseInt(idRaw, 10);
  const ex = chat ? await expertOfChat(env, chat) : null;

  if (!ex) { await api.answerCallback(cq.id, "این گفت‌وگو به کارشناسی وصل نیست.", true); return { ok: true }; }

  if (action === "seen" && id) {
    /* مالکیت (INV-11): فقط ارجاع خودِ همین کارشناس */
    const a = await env.DB.prepare("SELECT id, viewed_at FROM assignments WHERE id=? AND expert_id=?").bind(id, ex.id).first();
    if (!a) { await api.answerCallback(cq.id, "این ارجاع متعلق به شما نیست.", true); return { ok: true }; }
    if (!a.viewed_at) {
      await env.DB.batch([
        env.DB.prepare("UPDATE assignments SET viewed_at=COALESCE(viewed_at,?) WHERE id=?").bind(now(), id),
        env.DB.prepare("UPDATE alerts SET canceled_at=? WHERE assignment_id=? AND kind='stage' AND stage=0 AND fired_at IS NULL").bind(now(), id),
        env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)")
          .bind(now(), `expert:${ex.id}`, "viewed", null, JSON.stringify({ assignment_id: id, channel: "telegram" })),
      ]);
    }
    await api.answerCallback(cq.id, "ثبت شد ✅");
    if (cq.message) {
      await api.editMessageText(chat, cq.message.message_id, cq.message.text
        ? esc(cq.message.text) + "\n\n<i>✅ مشاهده ثبت شد</i>" : "✅ مشاهده ثبت شد", panelButton).catch(() => {});
    }
    return { ok: true };
  }

  /* جریان پیش‌فاکتور: pf:<uploadId>:<step>:<value> */
  if (action === "pf") {
    const [, uidRaw, step, valRaw] = T(cq.data).split(":");
    const up = await env.DB.prepare("SELECT * FROM tg_uploads WHERE id=? AND expert_id=?").bind(parseInt(uidRaw, 10), ex.id).first();
    if (!up) { await api.answerCallback(cq.id, "این بارگذاری پیدا نشد.", true); return { ok: true }; }
    if (up.done_at) { await api.answerCallback(cq.id, "این فایل قبلاً ثبت شده است."); return { ok: true }; }

    if (step === "x") {
      const store = storage(env);
      if (store && up.storage_key) await store.remove(up.storage_key).catch(() => {});
      await env.DB.prepare("UPDATE tg_uploads SET state='canceled', done_at=? WHERE id=?").bind(now(), up.id).run();
      await api.answerCallback(cq.id, "لغو شد");
      if (cq.message) await api.editMessageText(chat, cq.message.message_id, "✖️ لغو شد و فایل حذف شد.").catch(() => {});
      return { ok: true };
    }
    if (step === "r") {
      const asg = (await openAssignments(env, ex.id)).find((a) => a.id === parseInt(valRaw, 10));
      if (!asg) { await api.answerCallback(cq.id, "این ارجاع دیگر باز نیست.", true); return { ok: true }; }
      await api.answerCallback(cq.id);
      return askSupplier(env, api, chat, up.id, asg, up.filename, cq.message && cq.message.message_id);
    }
    if (step === "s") {
      const opts = JSON.parse(up.options_json || "[]");
      const name = opts[parseInt(valRaw, 10)];
      if (!name) { await api.answerCallback(cq.id, "این گزینه دیگر معتبر نیست.", true); return { ok: true }; }
      await api.answerCallback(cq.id);
      return saveProforma(env, api, chat, up, name);
    }
    if (step === "n") {
      await env.DB.prepare("UPDATE tg_uploads SET state='need_name' WHERE id=?").bind(up.id).run();
      await api.answerCallback(cq.id);
      await api.sendMessage(chat, "نام تأمین‌کننده را بنویسید و بفرستید:");
      return { ok: true };
    }
  }

  await api.answerCallback(cq.id, "این دکمه دیگر کار نمی‌کند.");
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

  if (status === "administrator") {
    await env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('managerChat',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
      .bind(JSON.stringify(String(chat.id)), now()).run();
    try { await telegram(env).sendMessage(chat.id, "✅ این کانال به‌عنوان کانال هشدار مدیر واحد پشتیبانی ثبت شد.\nاز این پس عبور از مهلت‌ها این‌جا اعلام می‌شود."); } catch (_) { /* شاید هنوز اجازهٔ ارسال ندارد */ }
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
  const d = await drainOutbox(env, 20);
  return { ...a, ...d };
}
