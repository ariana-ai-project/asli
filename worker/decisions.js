/**
 * تصمیم‌های کارشناس روی یک ارجاع: تعلیق، توقف، خاتمه — و تأیید یا ردِ مدیر
 *
 * چرا فایل جدا: این منطق را هم روتر (پنل) صدا می‌زند هم بات (دکمهٔ «خاتمه»
 * زیر جدول کمیسیون). اگر در api.js می‌ماند، bot.js باید روتر را ایمپورت می‌کرد
 * و حلقه درست می‌شد.
 *
 * قاعدهٔ خاتمه: فقط قلم‌هایی بسته می‌شوند که کارشناس تیکِ «تأیید کمیسیون» زده.
 * اگر همهٔ اقلام بودند، درخواست «بسته شده» و از هر دو کارتابل می‌رود؛ اگر
 * بخشی بودند، همان قلم‌ها می‌روند و درخواست با باقی اقلام «در جریان» می‌ماند.
 * اگر مدیر گزینهٔ «منوط به تأیید من» را زده باشد، تصمیم می‌نشیند در صف و در
 * تلگرامِ مدیر با دو دکمهٔ تأیید/رد می‌آید؛ ردْ دلیل می‌خواهد و همان دلیل به
 * کارشناس برمی‌گردد.
 */
import { HttpError } from "./http.js";
import { getSettings } from "./settings.js";
import { queueStmt } from "./queue.js";
import { notifyClosed, managerCard } from "./manager.js";
import { esc } from "./telegram.js";

const now = () => Date.now();
const int = (v, d = null) => { const n = parseInt(v, 10); return isNaN(n) ? d : n; };
const FA = "۰۱۲۳۴۵۶۷۸۹";
const M = (n) => String(n == null ? "" : n).replace(/\d/g, (d) => FA[+d]);
const ACTION_FA = { hold: "تعلیق", stop: "توقف", end: "خاتمه" };

const ev = (env, actor, kind, requestId, payload) =>
  env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)")
    .bind(now(), actor, kind, requestId || null, JSON.stringify(payload || {}));

async function settingValue(env, key) {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(key).first();
  if (!r) return null;
  try { return JSON.parse(r.value); } catch { return null; }
}

/** آنچه برای پیام‌ها لازم است: درخواست، کارشناس، اقلام */
async function context(env, aid) {
  const a = await env.DB.prepare(
    `SELECT a.id, a.request_id, a.deadline_at, a.dispatched_at, a.expert_id, e.name AS expert_name, e.label AS expert_label,
            e.telegram_chat, r.party,
            (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id) AS item_count
       FROM assignments a JOIN experts e ON e.id=a.expert_id JOIN requests r ON r.id=a.request_id WHERE a.id=?`,
  ).bind(aid).first();
  return a;
}

/**
 * تصمیم کارشناس. یا همان لحظه اعمال می‌شود، یا در انتظار مدیر می‌نشیند.
 * `payload.item_ids` برای خاتمه: همان قلم‌های تیک‌خورده.
 */
export async function expertDecision(env, ex, aid, body) {
  const action = body.action;
  if (!["hold", "stop", "end"].includes(action)) throw new HttpError("action نامعتبر است.");
  const own = await env.DB.prepare("SELECT id, request_id FROM assignments WHERE id=? AND expert_id=?").bind(aid, ex.id).first();
  if (!own) throw new HttpError("ارجاع متعلق به شما نیست.", 403);

  let itemIds = Array.isArray(body.item_ids) ? body.item_ids.map((x) => int(x)).filter(Boolean) : null;
  if (action === "end") {
    /* فقط قلم‌های بازِ تیک‌خورده — چه فهرست داده باشد چه نه */
    const rows = (await env.DB.prepare(
      `SELECT id FROM items WHERE assignment_id=? AND state='open' AND commission_ok=1${itemIds && itemIds.length ? ` AND id IN (${itemIds.map(() => "?").join(",")})` : ""}`,
    ).bind(aid, ...(itemIds && itemIds.length ? itemIds : [])).all()).results || [];
    itemIds = rows.map((r) => r.id);
    if (!itemIds.length) throw new HttpError("هیچ قلمِ تأییدشده‌ای برای خاتمه نیست؛ اول تیکِ «تأیید کمیسیون» را بزنید.", 422);
  }
  const payload = { item_ids: itemIds };

  const s = await getSettings(env);
  if (s.approvalRequired) {
    const r = await env.DB.prepare("INSERT INTO decisions (assignment_id,expert_id,action,payload_json,requested_at) VALUES (?,?,?,?,?)")
      .bind(aid, ex.id, action, JSON.stringify(payload), now()).run();
    const id = r.meta.last_row_id;
    const stmts = [ev(env, `expert:${ex.id}`, "decision_requested", own.request_id, { decision_id: id, action, items: itemIds })];
    const mgr = await settingValue(env, "managerChat");
    if (mgr) stmts.push(await decisionRequestStmt(env, mgr, id, aid, action, itemIds));
    await env.DB.batch(stmts);
    return { ok: true, pending: true, decision_id: id, items: (itemIds || []).length };
  }
  const res = await applyDecision(env, `expert:${ex.id}`, aid, action, payload);
  return { ok: true, pending: false, ...res };
}

/** پیام «در انتظار تأیید» برای مدیر، با دو دکمه */
async function decisionRequestStmt(env, mgrChat, decisionId, aid, action, itemIds) {
  const c = await context(env, aid);
  const its = (await env.DB.prepare("SELECT id, title, qty, unit, state FROM items WHERE assignment_id=? ORDER BY line_no").bind(aid).all()).results || [];
  const chosen = new Set(itemIds || []);
  const list = its.filter((i) => action !== "end" || chosen.has(i.id)).slice(0, 12)
    .map((i, k) => `${M(k + 1)}. ${esc(i.title)}${i.qty != null ? ` — <b>${M(i.qty)}</b> ${esc(i.unit || "")}` : ""}`).join("\n");
  const text = `🟠 <b>درخواست تأیید: ${ACTION_FA[action]}</b>\n\n`
    + `درخواست <b>${esc(c.request_id)}</b>\n${esc(c.party || "")}\n\n`
    + `👤 کارشناس: <b>${esc(c.expert_label || c.expert_name)}</b>\n\n`
    + (action === "end"
      ? `کارشناس می‌خواهد <b>${M(chosen.size)} قلم از ${M(c.item_count)}</b> را با تأیید کمیسیون خاتمه دهد:\n${list}`
      : `کارشناس می‌خواهد این درخواست را <b>${ACTION_FA[action]}</b> کند.`)
    + `\n\n<i>چون «تصمیم کارشناس منوط به تأیید من» فعال است، تا شما تأیید نکنید اعمال نمی‌شود.</i>`;
  return queueStmt(env, `dec:${decisionId}:ask`, mgrChat, text, [
    [{ text: "✅ تأیید", callback_data: `mdec:${decisionId}:ok` }, { text: "❌ رد", callback_data: `mdec:${decisionId}:no` }],
  ]);
}

/**
 * اعمال تصمیم. خاتمه فقط قلم‌های داده‌شده را می‌بندد.
 * برمی‌گرداند چند قلم بسته شد و آیا درخواست به‌کل بسته شده.
 */
export async function applyDecision(env, actor, aid, action, payload) {
  const t = now();
  let closed = 0;
  if (action === "end") {
    const ids = Array.isArray(payload && payload.item_ids) ? payload.item_ids.map((x) => int(x)).filter(Boolean) : [];
    if (ids.length) {
      const r = await env.DB.prepare(`UPDATE items SET state='closed', state_at=? WHERE assignment_id=? AND state='open' AND id IN (${ids.map(() => "?").join(",")})`)
        .bind(t, aid, ...ids).run();
      closed = (r.meta && r.meta.changes) || 0;
    } else {
      const r = await env.DB.prepare("UPDATE items SET state='closed', state_at=? WHERE assignment_id=? AND state='open' AND commission_ok=1").bind(t, aid).run();
      closed = (r.meta && r.meta.changes) || 0;
    }
  } else {
    await env.DB.prepare("UPDATE items SET state=?, state_at=? WHERE assignment_id=? AND state='open'").bind(action, t, aid).run();
  }
  const c = await context(env, aid);
  const live = await env.DB.prepare("SELECT COUNT(*) AS n FROM items WHERE assignment_id=? AND state IN ('open','hold')").bind(aid).first();
  const fullyClosed = !live || live.n === 0;
  const stmts = [ev(env, actor, action === "end" ? "close" : action, c && c.request_id, { assignment_id: aid, closed, fully_closed: fullyClosed })];
  if (fullyClosed) {
    /* هشدارهای مانده بی‌معنی‌اند */
    stmts.push(env.DB.prepare("UPDATE alerts SET canceled_at=? WHERE assignment_id=? AND fired_at IS NULL AND canceled_at IS NULL").bind(t, aid));
  }
  await env.DB.batch(stmts);

  if (action === "end") {
    const mgr = await settingValue(env, "managerChat");
    if (!actor.startsWith("expert:")) {
      /* خودِ مدیر تأیید کرده — تأیید همان مشاهده است */
      if (fullyClosed) await env.DB.prepare("UPDATE assignments SET mgr_seen_at=COALESCE(mgr_seen_at,?) WHERE id=?").bind(t, aid).run();
    } else if (fullyClosed) {
      await notifyClosed(env, aid, mgr, "کارشناس").catch(() => {});
    } else if (mgr && closed) {
      /* خاتمهٔ جزئی: خبر است، ولی چیزی از میز کار برداشته نمی‌شود */
      const items = (await env.DB.prepare("SELECT title, qty, unit, state FROM items WHERE assignment_id=? ORDER BY line_no").bind(aid).all()).results || [];
      const text = managerCard({ ...c, items: items.filter((i) => i.state === "closed") }, ["done", "done", "done", "done", "done", "done"],
        { head: `🔒 <b>خاتمهٔ جزئی — ${M(closed)} قلم بسته شد</b>` })
        + `\n<i>${M(live.n)} قلم دیگر همچنان در جریان است و درخواست در کارتابل می‌ماند.</i>`;
      await env.DB.batch([queueStmt(env, `partial:${aid}:${t}`, mgr, text)]);
    }
  }
  return { closed, fullyClosed };
}

/** مدیر تأیید کرد */
export async function approveDecision(env, decisionId, via) {
  const d = await env.DB.prepare("SELECT * FROM decisions WHERE id=? AND approved_at IS NULL AND rejected_at IS NULL").bind(decisionId).first();
  if (!d) throw new HttpError("تصمیم پیدا نشد یا قبلاً رسیدگی شده.", 404);
  const res = await applyDecision(env, "manager", d.assignment_id, d.action, JSON.parse(d.payload_json || "{}"));
  await env.DB.prepare("UPDATE decisions SET approved_at=?, note=? WHERE id=?").bind(now(), via || null, d.id).run();
  await tellExpert(env, d, true, null, res);
  return { ok: true, ...res };
}

/** مدیر رد کرد — با دلیل */
export async function rejectDecision(env, decisionId, note) {
  const d = await env.DB.prepare("SELECT * FROM decisions WHERE id=? AND approved_at IS NULL AND rejected_at IS NULL").bind(decisionId).first();
  if (!d) throw new HttpError("تصمیم پیدا نشد یا قبلاً رسیدگی شده.", 404);
  const reason = String(note == null ? "" : note).trim().slice(0, 1000);
  const c = await context(env, d.assignment_id);
  await env.DB.batch([
    env.DB.prepare("UPDATE decisions SET rejected_at=?, note=? WHERE id=?").bind(now(), reason || null, d.id),
    ev(env, "manager", "decision_rejected", c && c.request_id, { decision_id: d.id, action: d.action, note: reason }),
  ]);
  await tellExpert(env, d, false, reason, null);
  return { ok: true };
}

/** نتیجهٔ تصمیم مدیر برای کارشناس — در تلگرام، اگر وصل است */
async function tellExpert(env, d, ok, reason, res) {
  const c = await context(env, d.assignment_id);
  if (!c || !c.telegram_chat) return;
  const act = ACTION_FA[d.action] || d.action;
  const text = ok
    ? `✅ <b>مدیر ${act} را تأیید کرد</b>\n\nدرخواست <b>${esc(c.request_id)}</b>`
      + (d.action === "end" && res ? `\n${M(res.closed)} قلم بسته شد${res.fullyClosed ? " و درخواست از کارتابل شما خارج شد." : "؛ باقی اقلام در کارتابل می‌ماند."}` : "")
    : `❌ <b>مدیر ${act} را رد کرد</b>\n\nدرخواست <b>${esc(c.request_id)}</b>`
      + (reason ? `\n\n<b>علت:</b>\n${esc(reason)}` : "\n\n<i>دلیلی نوشته نشد.</i>")
      + `\n\nدرخواست همچنان در کارتابل شماست.`;
  await env.DB.batch([queueStmt(env, `dec:${d.id}:${ok ? "ok" : "no"}`, c.telegram_chat, text)]);
}
