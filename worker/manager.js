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

  /* تصمیم مدیر: کنار هر اعلان، شمار خطوط استعلام و پیش‌فاکتورهای واردشده هم بیاید */
  const counts = row.lines != null || row.proformas != null
    ? `🧾 خطوط استعلام: <b>${M(row.lines || 0)}</b>${row.quotes != null ? ` (${M(row.quotes)} ثبت‌شده)` : ""} · 📎 پیش‌فاکتور: <b>${M(row.proformas || 0)}</b>\n`
    : "";

  return `${head}\n\n`
    + `درخواست <b>${esc(row.request_id)}</b>\n`
    + `${esc(short(row.party, 60))}\n`
    + `<b>${M(row.item_count == null ? items.length : row.item_count)} قلم</b>`
    + (row.deadline_at ? ` · مهلت تا ${esc(fmtFa(row.deadline_at))}` : "")
    + `\n\n👤 کارشناس: <b>${esc(row.expert_label || row.expert_name || "—")}</b>\n`
    + counts
    + (changes ? `\n<b>تغییر:</b>\n${changes}\n` : "")
    + `\n${statusBar(colors)}\n`
    + (list ? `\n<b>اقلام:</b>\n${list}\n` : "")
    + (items.length > MAX_ITEMS ? `<i>و ${M(items.length - MAX_ITEMS)} قلم دیگر</i>\n` : "");
}

/* ------------------------------------------------------------------ */

/**
 * گیرنده‌های اعلان‌های پایشِ یک ارجاع (تصمیم مدیر، شهریور ۱۴۰۵):
 *   • گروه تیمِ کارشناس ارشدِ آن کارشناس — همیشه، اگر وصل باشد
 *   • کانال مدیر — مگر مدیر برای آن کارشناس «فقط کارشناس ارشد» را انتخاب کرده و ارشدش گروه دارد
 * `stage` اگر داده شود، تیکِ همان مرحله (مدیر: settings.mgrStages؛ ارشد: experts.alert_stages) سنجیده می‌شود.
 * خروجی: [{chat, tag}] — tag برای کلید یکتایی صف.
 */
const ticks = (v, dflt) => { let a = v; if (typeof v === "string") { try { a = JSON.parse(v); } catch (_) { a = null; } } return Array.isArray(a) && a.length === 6 ? a.map(Boolean) : dflt; };
const MGR_DEFAULT = [true, false, false, false, true, true];
export function recipients(row, settings, managerChat, stage) {
  const out = [];
  const seniorOk = stage == null || ticks(row.senior_stages, MGR_DEFAULT)[stage];
  if (row.team_chat && seniorOk) out.push({ chat: row.team_chat, tag: "team" });
  const onlySenior = row.notify_to === "senior" && row.team_chat;
  const mgrOk = stage == null || ticks(settings && settings.mgrStages, MGR_DEFAULT)[stage];
  if (managerChat && !onlySenior && mgrOk) out.push({ chat: managerChat, tag: "mgr" });
  return out;
}
/* ستون‌های کارشناس و ارشدش که recipients لازم دارد — در هر کوئریِ اعلان الحاق می‌شوند */
export const RECIPIENT_COLS = `e.notify_to, s.team_chat, s.alert_stages AS senior_stages`;
export const RECIPIENT_JOIN = `LEFT JOIN experts s ON s.id=e.senior_id AND s.active=1 AND s.senior=1`;

/** ارجاع‌هایی که هنوز زنده‌اند، با هر چیزی که برای رنگ‌ها لازم است */
const WATCH_SQL = `SELECT a.id, a.request_id, a.days, a.dispatched_at, a.deadline_at, a.viewed_at,
        a.commission_at, a.thr_snapshot, a.mgr_colors,
        e.name AS expert_name, e.label AS expert_label, r.party, ${RECIPIENT_COLS},
        (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id AND i.state='open') AS open_count,
        (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id) AS item_count,
        (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id AND i.hist_done_at IS NOT NULL) AS hist,
        (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id AND i.smart_done_at IS NOT NULL) AS smart,
        (SELECT COUNT(*) FROM quotes q WHERE q.assignment_id=a.id AND q.saved=1) AS quotes,
        (SELECT COUNT(*) FROM quotes q WHERE q.assignment_id=a.id) AS lines,
        (SELECT COUNT(*) FROM proformas p WHERE p.assignment_id=a.id) AS proformas
   FROM assignments a JOIN experts e ON e.id=a.expert_id JOIN requests r ON r.id=a.request_id ${RECIPIENT_JOIN}
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
    /* هر گیرنده فقط مرحله‌هایی را می‌گیرد که در تب «تنظیم اعلانات» خودش تیک زده
       (مدیر: settings.mgrStages؛ کارشناس ارشد: alert_stages). هشدارهای خود کارشناس
       برای همهٔ مراحل سر جایشان‌اند (bot.js:runAlerts). عکسِ رنگ‌ها بالاتر کامل
       ذخیره شد تا مقایسهٔ بعدی نلغزد؛ فقط پیام فیلتر می‌شود. */
    const changed = colors.map((c, i) => (c === before[i] ? -1 : i)).filter((i) => i >= 0);
    const targets = new Map();
    for (const i of changed) for (const rc of recipients(row, settings, managerChat, i)) {
      if (!targets.has(rc.chat)) targets.set(rc.chat, { ...rc, diff: [] });
      targets.get(rc.chat).diff.push(i);
    }
    if (targets.size) news.push({ row, colors, key, targets: [...targets.values()] });
  }

  /* اقلام فقط برای همان‌هایی که عوض شده‌اند خوانده می‌شوند — معمولاً صفر تا دو
     ارجاع در هر اجرا. آوردنشان در کوئری اصلی یعنی یک join روی همهٔ ارجاع‌های
     باز، برای چیزی که اغلب لازم نمی‌شود. */
  const items = new Map();
  if (news.length) {
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
    for (const rc of n.targets) {
      /* کلید یکتایی: شناسهٔ ارجاع + لحظهٔ ارسال + خودِ رنگ‌ها (+ گیرنده).
         لحظهٔ ارسال لازم است چون شناسهٔ ارجاع بعد از پاک‌کردن میز دوباره استفاده
         می‌شود و ردیفِ قدیمیِ صف، اعلانِ ارجاعِ تازه را بی‌صدا می‌خورد. */
      stmts.push(queueStmt(env, `${rc.tag}:${n.row.id}:${n.row.dispatched_at}:${n.key}`, rc.chat,
        managerCard({ ...n.row, items: items.get(n.row.id) || [] }, n.colors, {
          head: "🔄 <b>تغییر وضعیت</b>", changed: rc.diff,
        })));
      queued++;
    }
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
  const row = await env.DB.prepare(
    `SELECT a.id, a.request_id, a.deadline_at, a.dispatched_at, e.name AS expert_name, e.label AS expert_label, r.party, ${RECIPIENT_COLS},
            (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id) AS item_count,
            (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id AND i.state IN ('open','hold')) AS live,
            (SELECT COUNT(*) FROM quotes q WHERE q.assignment_id=a.id) AS lines,
            (SELECT COUNT(*) FROM quotes q WHERE q.assignment_id=a.id AND q.saved=1) AS quotes,
            (SELECT COUNT(*) FROM proformas p WHERE p.assignment_id=a.id) AS proformas
       FROM assignments a JOIN experts e ON e.id=a.expert_id JOIN requests r ON r.id=a.request_id ${RECIPIENT_JOIN} WHERE a.id=?`,
  ).bind(aid).first();
  if (!row || row.live > 0) return { ok: true, queued: 0 };   /* هنوز قلم بازی مانده — خاتمهٔ جزئی */
  const to = recipients(row, null, managerChat);
  if (!to.length) return { ok: true, queued: 0 };

  const items = (await env.DB.prepare("SELECT title, qty, unit FROM items WHERE assignment_id=? ORDER BY line_no").bind(aid).all()).results || [];
  const done = ["done", "done", "done", "done", "done", "done"];
  const text = managerCard({ ...row, items }, done, { head: "✅ <b>درخواست بسته شد</b>" })
    + `\n<i>${esc(actor || "کارشناس")} کار را خاتمه داد.</i>`;

  await env.DB.batch(to.map((rc) => rc.tag === "mgr"
    ? queueStmt(env, `closed:${aid}:${row.dispatched_at}`, rc.chat, text + "\n<i>تا «مشاهده کردم» را نزنید، در میز کار شما می‌ماند.</i>", [[{ text: "✅ مشاهده کردم", callback_data: `mseen:${aid}` }]])
    : queueStmt(env, `closed-team:${aid}:${row.dispatched_at}`, rc.chat, text)));
  return { ok: true, queued: to.length };
}

/** مدیر «مشاهده کردم» را زد — درخواست از میز کارش می‌رود */
export async function markManagerSeen(env, aid) {
  await env.DB.prepare("UPDATE assignments SET mgr_seen_at=COALESCE(mgr_seen_at,?) WHERE id=?").bind(now(), aid).run();
  return { ok: true };
}
