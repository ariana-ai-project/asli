/**
 * منوی پایش تیم در بات کارشناس ارشد (@Supply_SeniorBot)
 *
 * بات تیمی تا حالا یک‌طرفه بود: اعلان می‌آمد و تمام. خواستهٔ مدیر (شهریور ۱۴۰۵) این است
 * که کارشناس ارشد بتواند خودش هم بپرسد — «کدام کارشناس، چند درخواست، هر کدام در چه
 * مرحله‌ای» — بی‌آنکه پنل را باز کند.
 *
 * سه صفحه، هر کدام یک پیام که با دکمه‌ها *ویرایش* می‌شود نه پیام تازه (وگرنه گفت‌وگو
 * پر از کارت‌های تکراری می‌شود و پیدا کردن اعلان‌های واقعی سخت):
 *
 *   فهرست تیم        tq:t          کارشناسان زیر نظر او، با شمار درخواست باز و چراغ‌ها
 *     └ یک کارشناس   tq:e:<id>     درخواست‌های باز او، هر کدام یک خط با نوار شش‌تایی
 *         └ یک درخواست tq:a:<aid>  همان کارتی که در اعلان‌ها می‌آید
 *
 * قاعدهٔ مالکیت (همان INV-11 بات کارشناسان): هر کوئری این فایل به `senior_id` همان
 * کارشناس ارشدی که گفت‌وگو به او گره خورده محدود است. شناسهٔ کارشناس و ارجاع از
 * callback_data می‌آید — یعنی از سمت کاربر — پس هیچ‌جا مستقیم به کار نمی‌رود و همیشه
 * اول با مالکیت سنجیده می‌شود. این بات فقط می‌خواند؛ هیچ دکمه‌ای چیزی را تغییر نمی‌دهد.
 *
 * رنگ‌ها دقیقاً با همان فرمولی حساب می‌شوند که اعلان‌های مدیر (manager.js) و میز کار
 * پنل استفاده می‌کنند — با عکسِ آستانه‌های لحظهٔ ارسال، وگرنه آستانه‌های خودِ ارشد.
 */
import { esc } from "./telegram.js";
import { stageColors, fmtFa } from "./time.js";
import { STAGE_NAMES } from "./queue.js";
import { DOT, managerCard } from "./manager.js";
import { getSettings } from "./settings.js";
import { parseThresholds } from "./assign.js";

const now = () => Date.now();
const FA = "۰۱۲۳۴۵۶۷۸۹";
const M = (n) => String(n == null ? "" : n).replace(/\d/g, (d) => FA[+d]).replace(/\./g, "٫");
const short = (s, n) => { const x = String(s || "").trim(); return x.length > n ? x.slice(0, n - 1) + "…" : x; };
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

/* ارجاع «زنده»: ارسال شده و هنوز قلم بازی دارد — همان تعریفی که پایش مدیر به کار می‌برد */
const LIVE = `a.dispatched_at IS NOT NULL
  AND EXISTS (SELECT 1 FROM items i WHERE i.assignment_id=a.id AND i.state IN ('open','hold'))`;

/** کارشناس ارشدی که این گفت‌وگو «تلگرام تیمی» اوست. مبنای همهٔ سنجش‌های مالکیت. */
export function seniorOfChat(env, chatId) {
  return env.DB.prepare(
    `SELECT id, name, label, alert_thresholds FROM experts
      WHERE team_chat=? AND team_via='team' AND senior=1 AND active=1`,
  ).bind(String(chatId)).first();
}

/** آستانه‌های مؤثر: عکسِ لحظهٔ ارسال (SLA-04)، وگرنه آستانه‌های ارشد، وگرنه مدیر */
function thresholdsFor(row, senior, settings) {
  if (row.thr_snapshot) { try { const a = JSON.parse(row.thr_snapshot); if (Array.isArray(a) && a.length === 6) return a; } catch (_) { /* خراب — پایین‌تر */ } }
  return parseThresholds(senior && senior.alert_thresholds) || settings.thresholds;
}

const flagsOf = (r) => [!!r.viewed_at, r.hist > 0, r.smart > 0, r.quotes > 0, r.proformas > 0, !!r.commission_at];
const colorsOf = (r, senior, settings, t) => stageColors(
  { dispatchedAt: r.dispatched_at, days: r.days, active: r.open_count > 0, done: flagsOf(r) },
  thresholdsFor(r, senior, settings), t,
);

/** نوار شش‌تایی فشرده، یک خط — برای فهرست‌ها که جا تنگ است */
const dots = (colors) => colors.map((c) => DOT[c] || "⚪").join("");

/** نام مرحله‌ای که کار روی آن مانده (اولین باکسی که سبز نیست) */
function pending(colors) {
  const i = colors.findIndex((c) => c !== "done");
  return i < 0 ? "همهٔ مرحله‌ها انجام شد" : STAGE_NAMES[i];
}

/* ------------------------------------------------------------------ */
/* کوئری‌ها — همه محدود به تیمِ همان ارشد                                 */
/* ------------------------------------------------------------------ */

const ASSIGN_COLS = `a.id, a.request_id, a.days, a.dispatched_at, a.deadline_at, a.viewed_at,
  a.commission_at, a.thr_snapshot, e.id AS expert_id, e.name AS expert_name, e.label AS expert_label, r.party,
  (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id AND i.state='open') AS open_count,
  (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id) AS item_count,
  (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id AND i.hist_done_at IS NOT NULL) AS hist,
  (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id AND i.smart_done_at IS NOT NULL) AS smart,
  (SELECT COUNT(*) FROM quotes q WHERE q.assignment_id=a.id AND q.saved=1) AS quotes,
  (SELECT COUNT(*) FROM quotes q WHERE q.assignment_id=a.id) AS lines,
  (SELECT COUNT(*) FROM proformas p WHERE p.assignment_id=a.id) AS proformas`;

/** اعضای فعال تیم، با شمار ارجاع‌های زنده */
function teamRows(env, seniorId) {
  return env.DB.prepare(
    `SELECT e.id, e.name, e.label,
            (SELECT COUNT(*) FROM assignments a WHERE a.expert_id=e.id AND ${LIVE}) AS live
       FROM experts e WHERE e.senior_id=? AND e.active=1 ORDER BY e.name`,
  ).bind(seniorId).all();
}

/** ارجاع‌های زندهٔ یک عضو تیم. `seniorId` در WHERE است تا شناسهٔ دستکاری‌شده چیزی لو ندهد. */
function expertRows(env, seniorId, expertId, limit) {
  return env.DB.prepare(
    `SELECT ${ASSIGN_COLS} FROM assignments a
        JOIN experts e ON e.id=a.expert_id JOIN requests r ON r.id=a.request_id
       WHERE a.expert_id=? AND e.senior_id=? AND e.active=1 AND ${LIVE}
       ORDER BY COALESCE(a.deadline_at, a.dispatched_at) LIMIT ?`,
  ).bind(expertId, seniorId, limit).all();
}

/** یک ارجاع — فقط اگر کارشناسش زیر نظر همین ارشد باشد */
function assignRow(env, seniorId, aid) {
  return env.DB.prepare(
    `SELECT ${ASSIGN_COLS} FROM assignments a
        JOIN experts e ON e.id=a.expert_id JOIN requests r ON r.id=a.request_id
       WHERE a.id=? AND e.senior_id=? AND e.active=1`,
  ).bind(aid, seniorId).first();
}

/* ------------------------------------------------------------------ */
/* صفحه‌ها                                                              */
/* ------------------------------------------------------------------ */

const MAX_BTN = 12;   /* بیش از این، دکمه‌ها در تلگرام یک دیوار می‌شوند */

/** صفحهٔ ۱ — فهرست تیم */
async function teamPage(env, senior) {
  const [team, settings] = await Promise.all([teamRows(env, senior.id), getSettings(env)]);
  const rows = team.results || [];
  if (!rows.length) {
    return {
      text: `👥 <b>تیم ${esc(senior.label || senior.name)}</b>\n\nهنوز هیچ کارشناسی زیر نظر شما گذاشته نشده است.\n\n<i>تعیین اعضای تیم با مدیر واحد است — پنل مدیر ← تب «کارشناسان».</i>`,
      keyboard: [[{ text: "🔄 به‌روزرسانی", callback_data: "tq:t" }]],
    };
  }

  /* یک کوئری برای همهٔ ارجاع‌های تیم، نه یکی به‌ازای هر کارشناس (پلن رایگان: ۵۰ subrequest) */
  const ids = rows.map((r) => r.id);
  const all = (await env.DB.prepare(
    `SELECT ${ASSIGN_COLS} FROM assignments a
        JOIN experts e ON e.id=a.expert_id JOIN requests r ON r.id=a.request_id
       WHERE e.senior_id=? AND e.active=1 AND ${LIVE}`,
  ).bind(senior.id).all()).results || [];

  const t = now();
  const byExpert = new Map(ids.map((id) => [id, []]));
  for (const a of all) if (byExpert.has(a.expert_id)) byExpert.get(a.expert_id).push(colorsOf(a, senior, settings, t));

  const line = (e) => {
    const cs = byExpert.get(e.id) || [];
    /* «عقب» = دست‌کم یک باکس قرمز یا نارنجی دارد؛ همان چیزی که ارشد باید اول ببیند */
    const behind = cs.filter((c) => c.some((x) => x === "over" || x === "late")).length;
    return `• <b>${esc(e.label || e.name)}</b> — ${e.live ? `${M(e.live)} درخواست باز` : "بدون درخواست باز"}`
      + (behind ? `  <b>(${M(behind)} عقب‌افتاده)</b>` : "");
  };

  const total = all.length, rest = rows.length - Math.min(rows.length, MAX_BTN);
  return {
    text: `👥 <b>تیم ${esc(senior.label || senior.name)}</b>\n\n`
      + rows.map(line).join("\n")
      + `\n\nمجموع ارجاع‌های باز: <b>${M(total)}</b>\n\n`
      + (rest > 0 ? `<i>دکمه فقط برای ${M(MAX_BTN)} نفر نخست است؛ بقیه در پنل «تیم کارشناسی».</i>\n` : "")
      + `<i>برای دیدن درخواست‌های هر کارشناس، نامش را بزنید.</i>`,
    keyboard: [
      ...rows.slice(0, MAX_BTN).map((e) => [{
        text: `${e.label || e.name}${e.live ? ` (${M(e.live)})` : ""}`,
        callback_data: `tq:e:${e.id}`,
      }]),
      [{ text: "🔄 به‌روزرسانی", callback_data: "tq:t" }],
    ],
  };
}

/** صفحهٔ ۲ — درخواست‌های یک کارشناس */
async function expertPage(env, senior, expertId) {
  const ex = await env.DB.prepare("SELECT id,name,label FROM experts WHERE id=? AND senior_id=? AND active=1")
    .bind(expertId, senior.id).first();
  if (!ex) return { text: "این کارشناس در تیم شما نیست.", keyboard: [[{ text: "« تیم", callback_data: "tq:t" }]] };

  const [rs, settings] = await Promise.all([expertRows(env, senior.id, expertId, MAX_BTN + 8), getSettings(env)]);
  const rows = rs.results || [];
  const back = [{ text: "« تیم", callback_data: "tq:t" }, { text: "🔄 به‌روزرسانی", callback_data: `tq:e:${expertId}` }];
  if (!rows.length) {
    return { text: `👤 <b>${esc(ex.label || ex.name)}</b>\n\nهیچ درخواست بازی ندارد.`, keyboard: [back] };
  }

  /* متن و دکمه‌ها باید یکی باشند: شمارهٔ ۱۳ در متن بی‌دکمه، کاربر را سرگردان می‌کند.
     پس هر دو تا MAX_BTN، و بقیه فقط شمرده می‌شوند. */
  const t = now();
  const shown = rows.slice(0, MAX_BTN), rest = rows.length - shown.length;
  const body = shown.map((r, k) => {
    const c = colorsOf(r, senior, settings, t);
    return `${M(k + 1)}. <b>${esc(r.request_id)}</b> — ${esc(short(r.party, 38))}\n`
      + `   ${dots(c)}  <b>${M(r.item_count)} قلم</b>`
      + (r.deadline_at ? ` · مهلت ${esc(fmtFa(r.deadline_at))}` : "")
      + `\n   مانده روی: <b>${esc(pending(c))}</b>`;
  }).join("\n\n");

  return {
    text: `👤 <b>${esc(ex.label || ex.name)}</b> — ${M(rows.length)} درخواست باز\n\n${body}\n`
      + (rest > 0 ? `\n<i>و ${M(rest)} درخواست دیگر — در پنل «تیم کارشناسی»</i>\n` : "")
      + `\n<i>ترتیب نوار: ${STAGE_NAMES.join(" · ")}</i>\n`
      + `<i>برای کارت کامل یک درخواست، شمارهٔ آن را بزنید.</i>`,
    keyboard: [
      ...chunk(shown.map((r, k) => ({ text: `${M(k + 1)}· ${r.request_id}`, callback_data: `tq:a:${r.id}` })), 2),
      back,
    ],
  };
}

/** صفحهٔ ۳ — کارت کامل یک درخواست */
async function assignPage(env, senior, aid) {
  const row = await assignRow(env, senior.id, aid);
  if (!row) return { text: "این درخواست در تیم شما نیست یا دیگر وجود ندارد.", keyboard: [[{ text: "« تیم", callback_data: "tq:t" }]] };
  const [items, settings] = await Promise.all([
    env.DB.prepare("SELECT title, qty, unit FROM items WHERE assignment_id=? ORDER BY line_no").bind(row.id).all(),
    getSettings(env),
  ]);
  const colors = colorsOf(row, senior, settings, now());
  return {
    text: managerCard({ ...row, items: items.results || [] }, colors, { head: "📋 <b>وضعیت درخواست</b>" })
      + `\n<i>مانده روی: ${esc(pending(colors))}</i>`,
    keyboard: [[
      { text: `« ${row.expert_label || row.expert_name}`, callback_data: `tq:e:${row.expert_id}` },
      { text: "🔄", callback_data: `tq:a:${row.id}` },
    ], [{ text: "« تیم", callback_data: "tq:t" }]],
  };
}

/** صفحه‌ای که این callback می‌خواهد. جدا از فرستادن، تا تست بتواند بی‌تلگرام بسنجدش. */
export async function teamPageFor(env, senior, data) {
  const m = /^tq:(t|e|a)(?::(\d+))?$/.exec(String(data || ""));
  if (!m) return null;
  if (m[1] === "t") return teamPage(env, senior);
  const id = Number(m[2]);
  if (!id) return teamPage(env, senior);
  return m[1] === "e" ? expertPage(env, senior, id) : assignPage(env, senior, id);
}

/* ------------------------------------------------------------------ */
/* ورودی‌های بات                                                        */
/* ------------------------------------------------------------------ */

/** دکمهٔ «وضعیت تیم» — زیر پیام‌های راهنما و خوشامد */
export const teamMenuKb = () => [[{ text: "👥 وضعیت تیم", callback_data: "tq:t" }]];

/** `/tim` (یا دکمهٔ منو): صفحهٔ فهرست تیم را به‌عنوان پیام تازه می‌فرستد */
export async function sendTeamMenu(env, api, chat, senior) {
  const p = await teamPage(env, senior);
  await api.sendMessage(chat, p.text, p.keyboard).catch(() => {});
  return { ok: true };
}

/**
 * فشردن دکمه در بات تیمی. همیشه بی‌استثنا برمی‌گردد و همیشه answerCallback می‌زند —
 * وگرنه تلگرام ساعت شنی را روی دکمه نگه می‌دارد و کاربر فکر می‌کند بات مرده است.
 */
export async function handleTeamCallback(env, api, cq) {
  const chat = cq.message && cq.message.chat && cq.message.chat.id;
  const ack = (text, alert) => api.answerCallback(cq.id, text, alert).catch(() => {});
  try {
    if (!chat || !String(cq.data || "").startsWith("tq:")) { await ack(); return { ok: true }; }
    const senior = await seniorOfChat(env, chat);
    if (!senior) { await ack("این گفت‌وگو به هیچ کارشناس ارشدی وصل نیست.", true); return { ok: true }; }

    const page = await teamPageFor(env, senior, cq.data);
    if (!page) { await ack(); return { ok: true }; }
    await ack();
    /* ویرایش همان پیام؛ اگر متن عوض نشده باشد تلگرام ۴۰۰ می‌دهد و آن خطا نیست */
    await api.editMessageText(chat, cq.message.message_id, page.text, page.keyboard)
      .catch(() => api.sendMessage(chat, page.text, page.keyboard).catch(() => {}));
  } catch (e) {
    console.error("team callback failed", e && e.message);
    await ack("خطا در خواندن وضعیت تیم.", true);
  }
  return { ok: true };
}
