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
import { REFUSAL_FA } from "./extract.js";
import { runExtraction, applyExtraction } from "./proforma.js";
import { transcribe, writeLetter } from "./letter.js";
import { renderLetter } from "./docx.js";
import { bundleData, buildFiles, readiness } from "./bundle.js";
import { getSettings } from "./settings.js";

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

  if (msg.voice || msg.audio) return onVoice(env, msg, ex);
  if (msg.document || msg.photo) return onDocument(env, msg, ex);

  if (text === "/faktor" || text === "فاکتور دستی") return startFlow(env, api, chat, ex, "manual");
  if (text === "/tozihat" || text === "توضیحات") return startFlow(env, api, chat, ex, "notes");
  if (text === "/nameh" || text === "نامه") return startFlow(env, api, chat, ex, "letter");
  if (text === "/tahvil" || text === "تحویل") return startFlow(env, api, chat, ex, "deliver");

  /* متن آزاد: ممکن است پاسخ یکی از گفت‌وگوهای نیمه‌کاره باشد */
  if (text && !text.startsWith("/")) {
    /* منتظر توضیح نامه‌ایم — چه صوتی چه نوشته. اگر متنِ رونویسی‌شده را هم
       اصلاح کند، همان را می‌گیریم؛ کارشناس نباید مجبور شود دوباره ضبط کند. */
    const L = await env.DB.prepare(
      "SELECT * FROM letters WHERE expert_id=? AND state IN ('need_voice','transcribed') ORDER BY id DESC LIMIT 1",
    ).bind(ex.id).first();
    if (L) return onLetterText(env, api, chat, ex, L, text);

    const up = await env.DB.prepare(
      "SELECT * FROM tg_uploads WHERE expert_id=? AND state='need_name' AND done_at IS NULL AND expires_at>? ORDER BY id DESC LIMIT 1",
    ).bind(ex.id, now()).first();
    if (up) {
      if (text.length > 120) { await api.sendMessage(chat, "نام تأمین‌کننده خیلی بلند است."); return { ok: true }; }
      return saveProforma(env, api, chat, up, text);
    }
    const f = await openFlow(env, ex.id);
    if (f) return onFlowText(env, api, chat, f, text);
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
  if (open.length === 1) return askSupplier(env, api, chat, uid, open[0], filename, null);

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
  const pf = await env.DB.prepare("SELECT id FROM proformas WHERE assignment_id=? AND supplier_name=?").bind(up.assignment_id, supplier).first();
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
    + ((r.unreadable_fields || []).length ? `\n\n⚠️ خوانا نبود: ${esc(r.unreadable_fields.join("، "))}` : "")
    + (r.notes ? `\n\n${esc(r.notes)}` : "")
    + `

✓ = مدل مطمئن بوده · ⚠️ = مطمئن نبوده، خودتان نگاه کنید.
قیمت‌ها در پنل قابل اصلاح‌اند.`;
}

async function onExtract(env, api, chat, ex, pid, step, val, messageId) {
  const p = await env.DB.prepare(
    "SELECT p.*, a.expert_id, a.request_id FROM proformas p JOIN assignments a ON a.id=p.assignment_id WHERE p.id=?",
  ).bind(pid).first();
  if (!p || p.expert_id !== ex.id) { await api.sendMessage(chat, "این پیش‌فاکتور متعلق به شما نیست."); return { ok: true }; }

  const titles = new Map(((await env.DB.prepare("SELECT id, title FROM items WHERE assignment_id=?").bind(p.assignment_id).all()).results || [])
    .map((i) => [i.id, i.title]));

  if (step === "go") {
    const store = storage(env);
    if (!store || !store.signedUrl) { await api.sendMessage(chat, "انبار فایل فعلی از استخراج خودکار پشتیبانی نمی‌کند."); return { ok: true }; }
    await api.sendMessage(chat, "⏳ در حال خواندن پیش‌فاکتور…").catch(() => {});
    let out;
    try { out = await runExtraction(env, store, p); }
    catch (e) { await api.sendMessage(chat, `خواندن نشد: ${esc(e.message)}\n\nمی‌توانید با /faktor دستی وارد کنید.`); return { ok: true }; }

    const r = out.result;
    const kb = [];
    if (r.extractable && (r.lines || []).some((l) => l.matched_item_id && l.unit_price != null)) {
      if (r.currency) kb.push([{ text: `✅ ثبت در جدول (${r.currency})`, callback_data: `ai:${pid}:ok:0` }]);
      else {
        /* مدل واحد پول را نفهمیده — کارشناس باید صریح بگوید، وگرنه خطای ده‌برابری */
        kb.push([{ text: "ثبت به ریال", callback_data: `ai:${pid}:r:0` }, { text: "ثبت به تومان", callback_data: `ai:${pid}:t:0` }]);
      }
    }
    kb.push([{ text: "باز کردن پنل", url: PANEL_URL }]);
    await api.sendMessage(chat, extractSummary(r, titles)
      + (r.extractable ? "\n\n<i>تا وقتی «ثبت» را نزنید، چیزی در جدول کمیسیون نمی‌نشیند.</i>" : ""), kb);
    return { ok: true };
  }

  if (step === "ok" || step === "r" || step === "t") {
    const currency = step === "r" ? "ریال" : step === "t" ? "تومان" : null;
    try {
      const res = await applyExtraction(env, p, currency ? { currency } : {});
      await api.sendMessage(chat,
        `✅ ${M(res.applied)} قلم در جدول کمیسیون ثبت شد.`
        + (res.skipped ? `\n${M(res.skipped)} سطر تطبیق نخورد و ثبت نشد.` : "")
        + `\n\nقلم‌هایی که با اطمینان پایین خوانده شدند در پنل علامت دارند؛ قبل از تولید جدول یک نگاه بیندازید.`
        + `\n\n<b>برای این خرید نیاز به نامهٔ پیوست دارید؟</b>\nاگر چالشی داشتید یا چیزی هست که کمیسیون باید بداند، یک پیام صوتی بدهید تا نامه‌اش را بنویسم.`,
        letterOffer(p.assignment_id));
    } catch (e) { await api.sendMessage(chat, `ثبت نشد: ${esc(e.message)}`); }
    return { ok: true };
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* نامهٔ پیوست کمیسیون — از صدا یا نوشتهٔ کارشناس                                 */
/* ------------------------------------------------------------------ */

/** «نیاز به نامه دارید؟» — بعد از ثبت پیش‌فاکتور پرسیده می‌شود */
function letterOffer(aid) {
  return [[{ text: "📝 بله، نامه لازم دارم", callback_data: `lt:${aid}:ask:0` }],
    [{ text: "نه، لازم نیست", callback_data: `lt:${aid}:no:0` }]];
}

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
    out = await writeLetter(env, {
      transcript: L.transcript, request: d.request, items: d.items, quotes: d.quotes,
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
  await api.sendMessage(chat, "برای گرفتن کل بستهٔ فایل‌ها (برگهٔ درخواست + جدول کمیسیون + نامه) دستور /tahvil را بزنید.", panelButton);
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

  const files = buildFiles(d, letterBytes);
  await api.sendMessage(chat, `📦 در حال آماده کردن ${M(files.length)} فایل برای درخواست <b>${esc(d.request.id)}</b>…`).catch(() => {});
  for (const f of files) {
    await api.sendDocument(chat, f.name, new Blob([f.body], { type: f.type }));
  }

  const warn = [];
  if (st.itemsMissing.length) warn.push(`⚠️ ${M(st.itemsMissing.length)} قلم هنوز قیمت تأییدنهایی ندارد: ${esc(st.itemsMissing.slice(0, 4).join("، "))}`);
  if (!st.hasNotes) warn.push("📝 توضیحات برگهٔ کمیسیون خالی است — با /tozihat می‌نویسید.");
  if (!st.hasLetter) warn.push("✉️ نامهٔ پیوست ندارید — اگر لازم است /nameh را بزنید.");
  await api.sendMessage(chat,
    `✅ فایل‌ها فرستاده شد. همین‌ها در پنل هم هست.` + (warn.length ? `\n\n${warn.join("\n")}` : ""), panelButton);
  return { ok: true };
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
    letter: "✉️ <b>نامهٔ پیوست کمیسیون</b>", deliver: "📦 <b>گرفتن فایل‌های آماده</b>" }[kind];
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
    stmts.push(qid
      ? env.DB.prepare("UPDATE quotes SET price=?, qty=?, unit=COALESCE(unit,?), saved=1, final=1, source='manual', updated_at=? WHERE id=?")
        .bind(price, it.qty, it.unit || null, t, qid)
      : env.DB.prepare(
        `INSERT INTO quotes (assignment_id,item_id,supplier_name,spec,unit,qty,price,saved,final,source,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,1,1,'manual',?,?)`,
      ).bind(f.assignment_id, it.id, d.supplier, it.spec || null, it.unit || null, it.qty, price, t, t));
  }
  if (d.notes) stmts.push(env.DB.prepare("UPDATE assignments SET notes=? WHERE id=?").bind(d.notes, f.assignment_id));
  stmts.push(env.DB.prepare("UPDATE tg_flows SET step='done', done_at=? WHERE id=?").bind(t, f.id));
  stmts.push(env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)")
    .bind(t, `expert:${f.expert_id}`, "manual_quote", null, JSON.stringify({ assignment_id: f.assignment_id, supplier: d.supplier, items: n, channel: "telegram" })));
  await env.DB.batch(stmts);

  const a = await env.DB.prepare("SELECT request_id FROM assignments WHERE id=?").bind(f.assignment_id).first();
  await api.sendMessage(chat,
    `✅ ثبت شد.\n\nدرخواست <b>${esc(a ? a.request_id : "")}</b> · تأمین‌کننده <b>${esc(d.supplier)}</b>\n${M(n)} قلم قیمت‌گذاری شد`
    + `${d.notes ? "\n📝 توضیحات هم در برگهٔ کمیسیون ثبت شد." : ""}\n\nاین قیمت‌ها در جدول کمیسیون کنار پیش‌فاکتورهای تایپی می‌نشینند.`
    + `\n\n<b>نیاز به نامهٔ پیوست دارید؟</b>`,
    letterOffer(f.assignment_id));
  return { ok: true };
}

async function onCallback(env, cq) {
  const api = telegram(env);
  /* تأیید فشردن دکمه فقط ساعت‌شنی تلگرام را برمی‌دارد. اگر شکست بخورد نباید
     تغییر وضعیتی که کاربر خواسته را لغو کند، پس خطایش بلعیده می‌شود. */
  const ack = (text, alert) => api.answerCallback(cq.id, text, alert).catch(() => {});
  const chat = cq.message && cq.message.chat && cq.message.chat.id;
  const [action, , idRaw] = T(cq.data).split(":");
  const id = parseInt(idRaw, 10);
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
        ? esc(cq.message.text) + "\n\n<i>✅ مشاهده ثبت شد</i>" : "✅ مشاهده ثبت شد", panelButton).catch(() => {});
    }
    return { ok: true };
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
      return askSupplier(env, api, chat, up.id, asg, up.filename, cq.message && cq.message.message_id);
    }
    if (step === "s") {
      const opts = JSON.parse(up.options_json || "[]");
      const name = opts[parseInt(valRaw, 10)];
      if (!name) { await ack("این گزینه دیگر معتبر نیست.", true); return { ok: true }; }
      await ack();
      return saveProforma(env, api, chat, up, name);
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
      if (cq.message) await api.editMessageText(chat, cq.message.message_id, "باشد. اگر بعداً لازم شد /nameh را بزنید.", panelButton).catch(() => {});
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
