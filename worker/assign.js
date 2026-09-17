/**
 * ارجاع و زمان‌بندی هشدار — مشترک میان روتر (api.js) و بات (bot.js)
 *
 * چرا فایل جدا: «ارجاع به تیم» حالا از بات تلگرامِ کارشناس ارشد هم زده می‌شود. تغییر کارشناس
 * (reassign) و زمان‌بندی هشدارها تا حالا در api.js بودند و بات نمی‌توانست api.js را ایمپورت
 * کند (api.js خودش bot.js را ایمپورت می‌کند). متن و دکمهٔ پیام «ارجاع جدید» هم به همین دلیل
 * این‌جاست: هم ارسال مدیر، هم تغییر کارشناس، هم ارجاعِ ارشد همان پیام را می‌فرستند.
 *
 * آستانه‌های پایش (تصمیم مدیر، شهریور ۱۴۰۵): کارشناس ارشد می‌تواند برای کارشناسان زیر
 * نظرش آستانه‌های خودش را بگذارد. مهلت‌ها و هشدارهای آن کارشناس‌ها و رنگ باکس‌هایشان
 * همه‌جا با آستانه‌های ارشد سنجیده می‌شود؛ بقیه با آستانه‌های مدیر.
 */
import { HttpError } from "./http.js";
import { getSettings } from "./settings.js";
import { alertSchedule, fmtFa } from "./time.js";
import { queueStmt } from "./queue.js";
import { assignmentLogStmt } from "./records.js";
import { esc } from "./telegram.js";

const now = () => Date.now();
const T = (v) => String(v == null ? "" : v).trim();
const int = (v, d = null) => { const n = parseInt(v, 10); return isNaN(n) ? d : n; };
const FA = "۰۱۲۳۴۵۶۷۸۹";
const M = (n) => String(n == null ? "" : n).replace(/\d/g, (d) => FA[+d]).replace(/\./g, "٫");
const short = (s, n) => { const x = String(s || "").trim(); return x.length > n ? x.slice(0, n - 1) + "…" : x; };

/* ------------------------------------------------------------------ */
/* پیام «ارجاع جدید» (TG-06)                                            */
/* ------------------------------------------------------------------ */
const SIGN = "\n\n<i>ارجاع از سوی مدیر واحد پشتیبانی</i>";
const DISPATCH_MAX_ITEMS = 20;

/**
 * پیام «ارجاع جدید». اقلام هم ردیف‌به‌ردیف می‌آیند — با مقدار و واحد — تا کارشناس
 * بی‌آنکه پنل را باز کند بداند این درخواست چقدر کار است و اولویتش را بسنجد.
 * سقف ۲۰ قلم: پیام تلگرام ۴۰۹۶ نویسه جا دارد و درخواست‌های بزرگ‌تر در پنل خوانده می‌شوند.
 */
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
    + (a.from ? `\n\n<i>ارجاع از سوی ${esc(a.from)}</i>` : SIGN);
}

/**
 * زیر پیام ارجاع: «مشاهده»، و برای کارشناس ارشدی که تیم دارد «ارجاع به تیم» هم.
 * dg:<aid>:n یعنی فهرست کارشناسان تیم روی همین پیام باز شود.
 */
export const seenKb = (aid, team) => [[
  { text: "👁 مشاهده", callback_data: `seen:a:${aid}` },
  ...(team ? [{ text: "👥 ارجاع به تیم", callback_data: `dg:${aid}:n` }] : []),
]];

/* ------------------------------------------------------------------ */
/* تعطیلات                                                              */
/* ------------------------------------------------------------------ */
/* در هر isolate کش می‌شود؛ خیلی کم تغییر می‌کند و Cron در پلن رایگان فقط ۵۰ subrequest دارد */
let holidayCache = null;
export async function holidayFn(env) {
  if (!holidayCache || now() - holidayCache.at > 5 * 60000) {
    const rows = (await env.DB.prepare("SELECT date_j FROM holidays").all()).results || [];
    holidayCache = { at: now(), set: new Set(rows.map((r) => r.date_j)) };
  }
  const s = holidayCache.set;
  return (d) => s.has(d);
}
export const resetHolidayCache = () => { holidayCache = null; };

/* ------------------------------------------------------------------ */
/* آستانه‌ها                                                             */
/* ------------------------------------------------------------------ */

/**
 * شش آستانهٔ معتبر یا null. خالی ("") یعنی هشدارِ آن مرحله خاموش؛ پرها صعودی و ۱ تا ۱۰۰.
 * همان قاعدهٔ تب «تنظیم اعلانات» مدیر.
 */
export function parseThresholds(v) {
  let a = v;
  if (typeof v === "string") { try { a = JSON.parse(v); } catch (_) { return null; } }
  if (!Array.isArray(a) || a.length !== 6) return null;
  const out = a.map((x) => (x === "" || x == null ? "" : Number(x)));
  const act = out.filter((x) => x !== "");
  if (act.some((x) => !Number.isFinite(x) || x < 1 || x > 100)) return null;
  if (act.some((x, k) => k > 0 && x <= act[k - 1])) return null;
  return out;
}

/** آستانه‌های مؤثرِ هر کارشناس: آستانه‌های ارشدش اگر گذاشته باشد، وگرنه مدیر */
export async function thresholdsByExpert(env, expertIds, settings) {
  const ids = [...new Set((expertIds || []).map(Number).filter(Boolean))];
  const out = new Map();
  if (!ids.length) return out;
  const s = settings || await getSettings(env);
  const rows = (await env.DB.prepare(`SELECT e.id, s.alert_thresholds AS thr FROM experts e
      LEFT JOIN experts s ON s.id=e.senior_id AND s.active=1 AND s.senior=1
      WHERE e.id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all()).results || [];
  for (const id of ids) out.set(id, s.thresholds);
  for (const r of rows) { const t = parseThresholds(r.thr); if (t) out.set(r.id, t); }
  return out;
}

/**
 * زمان‌بندی هشدارهای یک ارجاعِ ارسال‌شده را می‌سازد.
 *
 * چرا در لحظهٔ ارسال و نه در لحظهٔ هشدار: `SLA-04` می‌گوید تغییر آستانه‌ها نباید
 * ارجاع‌های در جریان را تکان بدهد، و Cron پلن رایگان (۱۰ms CPU) توان محاسبهٔ
 * ساعات کاری برای ده‌ها ارجاع را ندارد. این‌جا یک بار حساب، بعد فقط SELECT.
 *
 * خروجی: آرایه‌ای از statement ها تا در همان batchِ صدازننده اجرا شوند.
 */
export function alertStatements(env, a, thresholds, isHoliday, at) {
  const s = alertSchedule(at, a.days, thresholds, isHoliday);
  const st = [
    env.DB.prepare("UPDATE assignments SET deadline_at=?, budget_h=?, thr_snapshot=? WHERE id=?")
      .bind(s.deadlineAt, s.budget, JSON.stringify(thresholds), a.id),
    /* هشدارهای قبلیِ همین ارجاع (مثلاً بعد از تغییر کارشناس) بی‌اثر می‌شوند */
    env.DB.prepare("UPDATE alerts SET canceled_at=? WHERE assignment_id=? AND fired_at IS NULL").bind(at, a.id),
  ];
  for (const r of s.rows) {
    st.push(env.DB.prepare(`INSERT INTO alerts (assignment_id,kind,stage,fire_at) VALUES (?,'stage',?,?)
      ON CONFLICT(assignment_id,kind,stage) DO UPDATE SET fire_at=excluded.fire_at, fired_at=NULL, canceled_at=NULL`)
      .bind(a.id, r.stage, r.fireAt));
  }
  st.push(env.DB.prepare(`INSERT INTO alerts (assignment_id,kind,stage,fire_at) VALUES (?,'over',-1,?)
    ON CONFLICT(assignment_id,kind,stage) DO UPDATE SET fire_at=excluded.fire_at, fired_at=NULL, canceled_at=NULL`)
    .bind(a.id, s.deadlineAt));
  return st;
}

/**
 * کارشناس ارشد آستانه‌ها را عوض کرد: هشدارهای مرحله‌ایِ ارجاع‌های زندهٔ تیمش با آستانهٔ تازه.
 * مهلت و هشدار «پایان مهلت» دست نمی‌خورد (به آستانه ربطی ندارد). هشداری که لحظه‌اش با
 * آستانهٔ تازه گذشته، ساخته نمی‌شود — وگرنه همه یک‌جا در اجرای بعدیِ Cron می‌رفتند — و
 * هشدارِ فرستاده‌شده هم دوباره فرستاده نمی‌شود. عکسِ رنگ‌ها پاک می‌شود تا پایشِ بعدی
 * تغییرِ رنگِ ناشی از آستانه را «خبر» نپندارد.
 */
export async function rescheduleTeam(env, seniorId, thresholds) {
  const rows = (await env.DB.prepare(`SELECT a.id, a.days, a.dispatched_at FROM assignments a JOIN experts e ON e.id=a.expert_id
      WHERE e.senior_id=? AND a.dispatched_at IS NOT NULL
        AND EXISTS (SELECT 1 FROM items i WHERE i.assignment_id=a.id AND i.state='open')`).bind(seniorId).all()).results || [];
  if (!rows.length) return { rescheduled: 0 };
  const [settings, isHoliday] = await Promise.all([getSettings(env), holidayFn(env)]);
  const thr = parseThresholds(thresholds) || settings.thresholds;
  const t = now(), stmts = [];
  for (const a of rows) {
    const s = alertSchedule(a.dispatched_at, a.days, thr, isHoliday);
    stmts.push(env.DB.prepare("UPDATE assignments SET thr_snapshot=?, mgr_colors=NULL WHERE id=?").bind(JSON.stringify(thr), a.id));
    stmts.push(env.DB.prepare("UPDATE alerts SET canceled_at=? WHERE assignment_id=? AND kind='stage' AND fired_at IS NULL").bind(t, a.id));
    for (const r of s.rows) {
      if (r.fireAt <= t) continue;
      stmts.push(env.DB.prepare(`INSERT INTO alerts (assignment_id,kind,stage,fire_at) VALUES (?,'stage',?,?)
        ON CONFLICT(assignment_id,kind,stage) DO UPDATE SET fire_at=excluded.fire_at, canceled_at=NULL WHERE alerts.fired_at IS NULL`)
        .bind(a.id, r.stage, r.fireAt));
    }
  }
  await env.DB.batch(stmts);
  return { rescheduled: rows.length };
}

/* ------------------------------------------------------------------ */
/* تغییر کارشناس و ارجاع به تیم                                          */
/* ------------------------------------------------------------------ */
const ev = (env, actor, kind, request_id, item_id, payload) =>
  env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,item_id,payload_json) VALUES (?,?,?,?,?,?)")
    .bind(now(), actor, kind, request_id || null, item_id || null, payload ? JSON.stringify(payload) : null);

/** کارشناس ارشدی که دست‌کم یک زیرمجموعهٔ فعال دارد؟ (برای دکمهٔ «ارجاع به تیم») */
export const TEAM_SIZE_SQL = "(SELECT COUNT(*) FROM experts t WHERE t.senior_id=e.id AND t.active=1)";

/** تغییر کارشناس: ارجاع جدید، انتقال اقلام و کارهای انجام‌شده، ساعت‌شمار از نو */
export async function reassign(env, body, actor = "manager") {
  const aid = int(body.assignment_id), eid = int(body.expert_id);
  const a = await env.DB.prepare("SELECT a.*, r.party FROM assignments a JOIN requests r ON r.id=a.request_id WHERE a.id=?").bind(aid).first();
  if (!a) throw new HttpError("ارجاع پیدا نشد.", 404);
  if (a.expert_id === eid) return { ok: true, assignment_id: aid };
  const target = await env.DB.prepare(`SELECT e.id, e.name, e.label, e.telegram_chat, e.senior, ${TEAM_SIZE_SQL} AS team_n FROM experts e WHERE e.id=? AND e.active=1`).bind(eid).first();
  if (!target) throw new HttpError("کارشناس معتبر نیست.");
  const t = now();
  const days = int(body.days, a.days);
  let b = await env.DB.prepare("SELECT * FROM assignments WHERE request_id=? AND expert_id=?").bind(a.request_id, eid).first();
  if (!b) { const r = await env.DB.prepare("INSERT INTO assignments (request_id,expert_id,days,dispatched_at,created_at) VALUES (?,?,?,?,?)").bind(a.request_id, eid, days, a.dispatched_at ? t : null, t).run(); b = { id: r.meta.last_row_id, days }; }
  const items = (await env.DB.prepare("SELECT id, title, qty, unit FROM items WHERE assignment_id=? AND state='open' ORDER BY line_no").bind(aid).all()).results || [];
  /* ساعت‌شمار کارشناس جدید از نو شروع می‌شود، پس زمان‌بندی هشدارها هم از نو ساخته می‌شود —
     با آستانه‌های مؤثرِ کارشناسِ تازه (ارشدش اگر گذاشته باشد) */
  let fresh = [], deadlineAt = null;
  const newDays = int(body.days, b.days || a.days);
  if (a.dispatched_at) {
    const [settings, isHoliday] = await Promise.all([getSettings(env), holidayFn(env)]);
    const thr = (await thresholdsByExpert(env, [eid], settings)).get(eid);
    fresh = alertStatements(env, { id: b.id, days: newDays }, thr, isHoliday, t);
    deadlineAt = alertSchedule(t, newDays, thr, isHoliday).deadlineAt;
  }
  const stmts = [
    env.DB.prepare("UPDATE items SET assignment_id=? WHERE assignment_id=?").bind(b.id, aid),
    env.DB.prepare("UPDATE quotes SET assignment_id=? WHERE assignment_id=?").bind(b.id, aid),
    env.DB.prepare("UPDATE proformas SET assignment_id=? WHERE assignment_id=? AND supplier_name NOT IN (SELECT supplier_name FROM proformas WHERE assignment_id=?)").bind(b.id, aid, b.id),
    env.DB.prepare("UPDATE alerts SET canceled_at=? WHERE assignment_id=? AND fired_at IS NULL").bind(t, aid),
    env.DB.prepare("DELETE FROM assignments WHERE id=?").bind(aid),
    ev(env, actor, "reassign", a.request_id, null, { from_expert_id: a.expert_id, to_expert_id: eid, notify: target.telegram_chat && a.dispatched_at ? "telegram" : "none" }),
    assignmentLogStmt(env, { at: t, action: actor === "manager" ? "reassign" : "delegate", request_id: a.request_id, assignment_id: b.id, expert_id: eid, from_expert_id: a.expert_id,
      days: newDays, deadline_at: deadlineAt, item_ids: items.map((i) => i.id), actor }),
    ...fresh,
  ];
  /* کارشناس تازه همان پیام «ارجاع جدید» را می‌گیرد که با «ارسال» مدیر می‌رفت */
  if (a.dispatched_at && target.telegram_chat) {
    stmts.push(queueStmt(env, `dispatch:${b.id}:${t}`, target.telegram_chat,
      dispatchText({ request_id: a.request_id, party: a.party, item_count: items.length, days: newDays, items, dispatched_at: t, deadline_at: deadlineAt, from: body.from }),
      seenKb(b.id, target.senior && target.team_n > 0)));
  }
  await env.DB.batch(stmts);
  return { ok: true, assignment_id: b.id, notified: !!(a.dispatched_at && target.telegram_chat), expert: { id: target.id, name: target.name, label: target.label } };
}

/** اعضای فعال تیم یک کارشناس ارشد */
export async function teamOf(env, seniorId) {
  return (await env.DB.prepare("SELECT id,name,label FROM experts WHERE senior_id=? AND active=1 ORDER BY name").bind(seniorId).all()).results || [];
}

/**
 * «ارجاع به تیم» — از پنل یا از بات. ارجاع باید مال خود ارشد یا یکی از زیرمجموعه‌هایش باشد
 * و مقصد یکی از زیرمجموعه‌ها (یا خودِ ارشد).
 */
export async function delegateAssignment(env, ex, body) {
  if (!ex.senior) throw new HttpError("فقط کارشناس ارشد می‌تواند ارجاع را به تیم بدهد.", 403);
  const aid = int(body.assignment_id), eid = int(body.expert_id);
  const a = await env.DB.prepare("SELECT a.expert_id FROM assignments a WHERE a.id=?").bind(aid).first();
  if (!a) throw new HttpError("ارجاع پیدا نشد.", 404);
  const mineOrTeam = a.expert_id === ex.id || !!(await env.DB.prepare("SELECT id FROM experts WHERE id=? AND senior_id=?").bind(a.expert_id, ex.id).first());
  if (!mineOrTeam) throw new HttpError("این ارجاع متعلق به تیم شما نیست.", 403);
  const target = eid === ex.id ? { id: ex.id } : await env.DB.prepare("SELECT id FROM experts WHERE id=? AND senior_id=? AND active=1").bind(eid, ex.id).first();
  if (!target) throw new HttpError("کارشناس انتخابی در تیم شما نیست.");
  return reassign(env, { assignment_id: aid, expert_id: eid, days: body.days, from: ex.label || ex.name }, `expert:${ex.id}`);
}
