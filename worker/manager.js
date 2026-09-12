/**
 * اعلان‌های مدیر واحد پشتیبانی
 *
 * مدیر کارتابل خودش را دارد و نمی‌خواهد بابت هر ریزه‌کاری پیام بگیرد. چیزی که
 * برایش معنا دارد **تغییر وضعیت** است، نه تغییر عدد: اینکه پیش‌فاکتورهای یک
 * ارجاع از دو تا سه شد خبر نیست، ولی اینکه باکس «پیش‌فاکتور» سبز شد یا باکس
 * «استعلامات» از زرد به نارنجی رفت، خبر است.
 *
 * پس ملاک، همان شش رنگی است که در میز کار می‌بیند. رنگ‌ها هر بار در Cron
 * دوباره حساب و با عکسِ قبلی مقایسه می‌شوند؛ فقط وقتی چیزی عوض شده باشد پیام
 * می‌رود. عکس در خود ردیف ارجاع ذخیره است تا مقایسه یک کوئری بیشتر نخواهد
 * (پلن رایگان: ۵۰ subrequest در هر فراخوانی).
 *
 * قالب پیام هم عمدی است: شمارهٔ درخواست و طرف مقابل بالا، **نام کارشناس درشت
 * و جدا**، بعد نوار وضعیت. مدیر در یک نگاه باید بفهمد «کدام درخواست، دستِ چه
 * کسی، در چه حالی».
 */
import { esc } from "./telegram.js";
import { stageColors, fmtFa } from "./time.js";
import { queueStmt, STAGE_NAMES } from "./queue.js";

const now = () => Date.now();
const FA = "۰۱۲۳۴۵۶۷۸۹";
const M = (n) => String(n == null ? "" : n).replace(/\d/g, (d) => FA[+d]);

/** رنگ‌های میز کار، به نشانه‌ای که در تلگرام دیده می‌شود */
export const DOT = {
  done: "🟢", empty: "⬜", warn: "🟡", late: "🟠", over: "🔴", muted: "⚪", idle: "⚪",
};
const WORD = {
  done: "انجام شد", empty: "در مهلت", warn: "از آستانه گذشت", late: "عقب افتاده",
  over: "مهلت تمام", muted: "—", idle: "ارسال نشده",
};

const short = (s, n = 40) => { const x = String(s || "").trim(); return x.length > n ? x.slice(0, n - 1) + "…" : x; };
const MAX_ITEMS = 12;

/** نوار وضعیت: شش باکس، همان‌طور که در میز کار چیده شده‌اند */
export const statusBar = (colors) =>
  STAGE_NAMES.map((n, i) => `${DOT[colors[i]] || "⚪"} ${n}`).join("\n");

/**
 * کارتِ یک ارجاع برای مدیر.
 * `changed` اگر داده شود، اندیس باکس‌هایی است که همین حالا عوض شده‌اند.
 */
export function managerCard(row, colors, opts = {}) {
  const items = row.items || [];
  const list = items.slice(0, MAX_ITEMS).map((i, k) =>
    `${M(k + 1)}. ${esc(short(i.title, 46))}${i.qty != null ? ` — <b>${M(i.qty)}</b> ${esc(i.unit || "")}` : ""}`).join("\n");

  const head = opts.head || "📋 <b>وضعیت درخواست</b>";
  const changes = (opts.changed || []).map((i) =>
    `${DOT[colors[i]] || "⚪"} <b>${esc(STAGE_NAMES[i])}</b> → ${esc(WORD[colors[i]] || colors[i])}`).join("\n");

  return `${head}\n\n`
    + `درخواست <b>${esc(row.request_id)}</b>\n`
    + `${esc(short(row.party, 60))}\n`
    + `<b>${M(row.item_count == null ? items.length : row.item_count)} قلم</b>`
    + (row.deadline_at ? ` · مهلت تا ${esc(fmtFa(row.deadline_at))}` : "")
    + `\n\n👤 کارشناس: <b>${esc(row.expert_label || row.expert_name || "—")}</b>\n`
    + (changes ? `\n<b>تغییر:</b>\n${changes}\n` : "")
    + `\n${statusBar(colors)}\n`
    + (list ? `\n<b>اقلام:</b>\n${list}\n` : "")
    + (items.length > MAX_ITEMS ? `<i>و ${M(items.length - MAX_ITEMS)} قلم دیگر</i>\n` : "");
}

/* ------------------------------------------------------------------ */

/** ارجاع‌هایی که هنوز زنده‌اند، با هر چیزی که برای رنگ‌ها لازم است */
const WATCH_SQL = `SELECT a.id, a.request_id, a.days, a.dispatched_at, a.deadline_at, a.viewed_at,
        a.commission_at, a.thr_snapshot, a.mgr_colors,
        e.name AS expert_name, e.label AS expert_label, r.party,
        (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id AND i.state='open') AS open_count,
        (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id) AS item_count,
        (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id AND i.hist_done_at IS NOT NULL) AS hist,
        (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id AND i.smart_done_at IS NOT NULL) AS smart,
        (SELECT COUNT(*) FROM quotes q WHERE q.assignment_id=a.id AND q.saved=1) AS quotes,
        (SELECT COUNT(*) FROM proformas p WHERE p.assignment_id=a.id) AS proformas
   FROM assignments a JOIN experts e ON e.id=a.expert_id JOIN requests r ON r.id=a.request_id
  WHERE a.dispatched_at IS NOT NULL
    AND EXISTS (SELECT 1 FROM items i WHERE i.assignment_id=a.id AND i.state IN ('open','hold'))
  ORDER BY a.deadline_at LIMIT ?`;

const flagsOf = (row) => [
  !!row.viewed_at, row.hist > 0, row.smart > 0, row.quotes > 0, row.proformas > 0, !!row.commission_at,
];

/**
 * رنگ‌ها را دوباره می‌سنجد و هر تغییری را به مدیر خبر می‌دهد.
 *
 * اولین بار برای هر ارجاع فقط عکس گرفته می‌شود و پیامی نمی‌رود: وگرنه در
 * نخستین اجرای بعد از استقرار، مدیر برای همهٔ ارجاع‌های موجود یک‌باره پیام
 * می‌گرفت.
 */
export async function stageWatch(env, settings, managerChat, limit = 40) {
  const rows = (await env.DB.prepare(WATCH_SQL).bind(limit).all()).results || [];
  if (!rows.length) return { checked: 0, changed: 0, queued: 0 };

  const t = now();
  const stmts = [];
  const news = [];
  for (const row of rows) {
    let thr = settings.thresholds;
    if (row.thr_snapshot) { try { thr = JSON.parse(row.thr_snapshot); } catch (_) { /* خراب — همان تنظیمات جاری */ } }

    const colors = stageColors(
      { dispatchedAt: row.dispatched_at, days: row.days, active: row.open_count > 0, done: flagsOf(row) },
      thr, t,
    );
    const key = colors.join(",");
    if (row.mgr_colors === key) continue;

    stmts.push(env.DB.prepare("UPDATE assignments SET mgr_colors=? WHERE id=?").bind(key, row.id));
    if (!row.mgr_colors) continue;                    /* اولین عکس — خبر نیست */

    const before = row.mgr_colors.split(",");
    /* تصمیم مدیر: از مراحل میانی (بررسی سوابق ۱، جستجوی هوشمند ۲، استعلامات ۳)
       نه خبرِ انجام می‌خواهد نه خبرِ گذشتن از آستانه — فقط مشاهده، پیش‌فاکتور و
       جدول کمیسیون. هشدارهای خود کارشناس برای همهٔ مراحل سر جایشان‌اند
       (bot.js:runAlerts). عکسِ رنگ‌ها بالاتر کامل ذخیره شد تا مقایسهٔ بعدی
       نلغزد؛ فقط پیام فیلتر می‌شود. */
    const MGR_STAGES = [0, 4, 5];
    const diff = colors.map((c, i) => (c === before[i] ? -1 : i)).filter((i) => i >= 0 && MGR_STAGES.includes(i));
    if (diff.length) news.push({ row, colors, key, diff });
  }

  /* اقلام فقط برای همان‌هایی که عوض شده‌اند خوانده می‌شوند — معمولاً صفر تا دو
     ارجاع در هر اجرا. آوردنشان در کوئری اصلی یعنی یک join روی همهٔ ارجاع‌های
     باز، برای چیزی که اغلب لازم نمی‌شود. */
  const items = new Map();
  if (news.length && managerChat) {
    const ids = news.map((n) => n.row.id);
    const rs = (await env.DB.prepare(
      `SELECT assignment_id, title, qty, unit FROM items WHERE assignment_id IN (${ids.map(() => "?").join(",")})
       ORDER BY assignment_id, line_no`,
    ).bind(...ids).all()).results || [];
    for (const r of rs) {
      if (!items.has(r.assignment_id)) items.set(r.assignment_id, []);
      items.get(r.assignment_id).push(r);
    }
  }

  let queued = 0;
  for (const n of news) {
    if (!managerChat) continue;
    /* کلید یکتایی: شناسهٔ ارجاع + لحظهٔ ارسال + خودِ رنگ‌ها.
       لحظهٔ ارسال لازم است چون شناسهٔ ارجاع بعد از پاک‌کردن میز دوباره استفاده
       می‌شود و ردیفِ قدیمیِ صف، اعلانِ ارجاعِ تازه را بی‌صدا می‌خورد. */
    stmts.push(queueStmt(env, `mgr:${n.row.id}:${n.row.dispatched_at}:${n.key}`, managerChat,
      managerCard({ ...n.row, items: items.get(n.row.id) || [] }, n.colors, {
        head: "🔄 <b>تغییر وضعیت</b>", changed: n.diff,
      })));
    queued++;
  }
  if (stmts.length) await env.DB.batch(stmts);
  return { checked: rows.length, changed: news.length, queued };
}

/* ------------------------------------------------------------------ */

/**
 * اعلانِ «درخواست بسته شد».
 *
 * دکمهٔ «مشاهده کردم» زیرش است و تا مدیر نزندش، درخواست از میز کارش بیرون
 * نمی‌رود — خاتمهٔ کارشناس یک خبر است، نه چیزی که بی‌صدا از جلوی چشم مدیر
 * برداشته شود.
 */
export async function notifyClosed(env, aid, managerChat, actor) {
  if (!managerChat) return { ok: true, queued: 0 };
  const row = await env.DB.prepare(
    `SELECT a.id, a.request_id, a.deadline_at, a.dispatched_at, e.name AS expert_name, e.label AS expert_label, r.party,
            (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id) AS item_count,
            (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id AND i.state IN ('open','hold')) AS live
       FROM assignments a JOIN experts e ON e.id=a.expert_id JOIN requests r ON r.id=a.request_id WHERE a.id=?`,
  ).bind(aid).first();
  if (!row || row.live > 0) return { ok: true, queued: 0 };   /* هنوز قلم بازی مانده — خاتمهٔ جزئی */

  const items = (await env.DB.prepare("SELECT title, qty, unit FROM items WHERE assignment_id=? ORDER BY line_no").bind(aid).all()).results || [];
  const done = ["done", "done", "done", "done", "done", "done"];
  const text = managerCard({ ...row, items }, done, { head: "✅ <b>درخواست بسته شد</b>" })
    + `\n<i>${esc(actor || "کارشناس")} کار را خاتمه داد. تا «مشاهده کردم» را نزنید، در میز کار شما می‌ماند.</i>`;

  await env.DB.batch([
    queueStmt(env, `closed:${aid}:${row.dispatched_at}`, managerChat, text, [[{ text: "✅ مشاهده کردم", callback_data: `mseen:${aid}` }]]),
  ]);
  return { ok: true, queued: 1 };
}

/** مدیر «مشاهده کردم» را زد — درخواست از میز کارش می‌رود */
export async function markManagerSeen(env, aid) {
  await env.DB.prepare("UPDATE assignments SET mgr_seen_at=COALESCE(mgr_seen_at,?) WHERE id=?").bind(now(), aid).run();
  return { ok: true };
}
