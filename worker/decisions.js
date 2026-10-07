/**
 * تصمیم‌های کارشناس روی یک ارجاع: تعلیق، توقف، خاتمه — و تأیید یا ردِ مدیر
 *
 * چرا فایل جدا: این منطق را هم روتر (پنل) صدا می‌زند هم بات (دکمهٔ «خاتمه»
 * زیر جدول کمیسیون). اگر در api.js می‌ماند، bot.js باید روتر را ایمپورت می‌کرد
 * و حلقه درست می‌شد.
 *
 * قاعدهٔ خاتمه: فقط قلم‌هایی بسته می‌شوند که تیکِ «تأیید کمیسیون» خورده‌اند — تیکی که از مهر ۱۴۰۵ فقط پنل
 * پشتیبانی می‌زند (worker/support.js)؛ کارشناس «خاتمه»ی همان‌ها را می‌زند.
 * اگر همهٔ اقلام بودند، درخواست «بسته شده» و از هر دو کارتابل می‌رود؛ اگر
 * بخشی بودند، همان قلم‌ها می‌روند و درخواست با باقی اقلام «در جریان» می‌ماند.
 * اگر مدیر گزینهٔ «منوط به تأیید من» را زده باشد، تصمیم می‌نشیند در صف و در
 * تلگرامِ مدیر با دو دکمهٔ تأیید/رد می‌آید؛ ردْ دلیل می‌خواهد و همان دلیل به
 * کارشناس برمی‌گردد.
 *
 * «انجام دستی» (طرح «خرید هوشمند، کارشناس ناظر»، فاز ۴ب): در درخواستی که دستِ کارشناس هوشمند است، کارشناس اقلامی را با علت به مدیر
 * برمی‌گرداند تا خودش انجامشان دهد — همیشه منوط به تأییدِ مدیر، چه «منوط به تأیید من» روشن باشد چه نه. تأیید: همان اقلام دستی
 * (items.ai_off) و بیرون از کارِ کارشناس هوشمند؛ رد: با پاسخِ مدیر، اقلام هوشمند می‌مانند.
 *
 * «👁 حالت تأیید» (فاز ۴ب گام ۴، پاسخ ۲۰): بی اجازهٔ مدیر در ارجاع، کارشناس پیش از «🚀 شروع» برای اقلامی که نوعشان «مجازِ تأیید» است
 * با توضیح می‌خواهد — همیشه منوط به تأییدِ مدیر. تأیید: items.sup_on=1 (worker/ai-supervise.js)؛ رد: کارشناس هوشمند بی تأیید پیش می‌رود.
 */
import { HttpError } from "./http.js";
import { getSettings } from "./settings.js";
import { queueStmt } from "./queue.js";
import { notifyClosed, managerCard } from "./manager.js";
import { esc } from "./telegram.js";
import { closureStmt } from "./records.js";
import { aiOwned } from "./ai-lock.js";
import { itemModes } from "./ai-modes.js";

const now = () => Date.now();
const int = (v, d = null) => { const n = parseInt(v, 10); return isNaN(n) ? d : n; };
const FA = "۰۱۲۳۴۵۶۷۸۹";
const M = (n) => String(n == null ? "" : n).replace(/\d/g, (d) => FA[+d]);
const ACTION_FA = { hold: "تعلیق", stop: "توقف", end: "خاتمه", manual: "انجام دستی", supervise: "حالت تأیید" };
/* درخواست‌هایی که همیشه با تأییدِ مدیرند و فقط همان اقلام را عوض می‌کنند */
const ITEM_ASKS = ["manual", "supervise"];
const T = (v) => String(v == null ? "" : v).trim();

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
  if (!["hold", "stop", "end", "manual", "supervise"].includes(action)) throw new HttpError("action نامعتبر است.");
  const own = await env.DB.prepare("SELECT id, request_id FROM assignments WHERE id=? AND expert_id=?").bind(aid, ex.id).first();
  if (!own) throw new HttpError("ارجاع متعلق به شما نیست.", 403);
  if (action === "manual") return manualRequest(env, ex, own, body);
  if (action === "supervise") return supRequest(env, ex, own, body);

  let itemIds = Array.isArray(body.item_ids) ? body.item_ids.map((x) => int(x)).filter(Boolean) : null;
  if (action === "end") {
    /* فقط قلم‌های بازِ تیک‌خورده — چه فهرست داده باشد چه نه */
    const rows = (await env.DB.prepare(
      `SELECT id FROM items WHERE assignment_id=? AND state='open' AND commission_ok=1${itemIds && itemIds.length ? ` AND id IN (${itemIds.map(() => "?").join(",")})` : ""}`,
    ).bind(aid, ...(itemIds && itemIds.length ? itemIds : [])).all()).results || [];
    itemIds = rows.map((r) => r.id);
    /* تیک «تأیید کمیسیون» را حالا فقط پنل پشتیبانی می‌زند (worker/support.js) */
    if (!itemIds.length) throw new HttpError("هنوز پشتیبانی کمیسیونِ هیچ قلمی از این درخواست را تأیید نکرده؛ «خاتمه» فقط برای اقلامِ تأییدشده است.", 422);
  }
  const payload = { item_ids: itemIds };

  const s = await getSettings(env);
  if (s.approvalRequired) {
    const t = now();
    const r = await env.DB.prepare("INSERT INTO decisions (assignment_id,expert_id,action,payload_json,requested_at) VALUES (?,?,?,?,?)")
      .bind(aid, ex.id, action, JSON.stringify(payload), t).run();
    const id = r.meta.last_row_id;
    const stmts = [ev(env, `expert:${ex.id}`, "decision_requested", own.request_id, { decision_id: id, action, items: itemIds })];
    const mgr = await settingValue(env, "managerChat");
    if (mgr) stmts.push(await decisionRequestStmt(env, mgr, id, aid, action, itemIds, t));
    await env.DB.batch(stmts);
    return { ok: true, pending: true, decision_id: id, items: (itemIds || []).length };
  }
  const res = await applyDecision(env, `expert:${ex.id}`, aid, action, payload);
  return { ok: true, pending: false, ...res };
}

/**
 * «انجام دستی»: اقلامِ بازی که هنوز به کارشناس هوشمند سپرده نشده‌اند (نه در کارِ زندهٔ او، نه «دستی»ِ قبلی، نه در انتظارِ
 * درخواستِ دیگر)، با علتِ اجباری — تا تصمیمِ مدیر در صف می‌ماند و در تلگرامِ مدیر با دکمهٔ تأیید و رد می‌آید.
 */
async function manualRequest(env, ex, own, body) {
  const reason = T(body.reason).slice(0, 1000);
  if (!reason) throw new HttpError("برای «انجام دستی» علت را بنویسید تا مدیر تصمیم بگیرد.");
  const o = await aiOwned(env, own.id);
  if (!o) throw new HttpError("این درخواست در حالت هوشمند نیست؛ کارهایش همین حالا با خودِ شماست.", 409);
  const want = [...new Set((Array.isArray(body.item_ids) ? body.item_ids : []).map((x) => int(x)).filter(Boolean))];
  if (!want.length) throw new HttpError("دست‌کم یک قلم را برای انجام دستی انتخاب کنید.");
  const rows = (await env.DB.prepare(`SELECT id, frozen_at, ai_off, ai_start_at FROM items WHERE assignment_id=? AND state='open' AND id IN (${want.map(() => "?").join(",")})`)
    .bind(own.id, ...want).all()).results || [];
  const waiting = await waitingItems(env, own.id, "manual");
  /* سپرده‌شده («🚀 شروع»ِ فاز ۴ب گام ۲، یا منجمد در کارِ زنده) دیگر برنمی‌گردد */
  const itemIds = rows.filter((r) => !r.ai_start_at && !(o.run_id && r.frozen_at) && Number(r.ai_off) !== 1 && !waiting.has(r.id)).map((r) => r.id);
  if (!itemIds.length) throw new HttpError("این اقلام سپرده شده‌اند، از قبل دستی‌اند یا درخواستِ دیگری برایشان در انتظارِ مدیر است.", 409);
  return queueAsk(env, ex, own, "manual", itemIds, reason);
}

/** اقلامی که درخواستِ «action»ِ دیگری برایشان در انتظارِ مدیر است */
async function waitingItems(env, aid, action) {
  return new Set(((await env.DB.prepare("SELECT payload_json FROM decisions WHERE assignment_id=? AND action=? AND approved_at IS NULL AND rejected_at IS NULL")
    .bind(aid, action).all()).results || []).flatMap((d) => { try { return JSON.parse(d.payload_json || "{}").item_ids || []; } catch (_) { return []; } }));
}

/** درخواستِ اقلام (ITEM_ASKS) در صفِ مدیر می‌نشیند و در تلگرامش با «✅ تأیید» و «❌ رد» می‌آید */
async function queueAsk(env, ex, own, action, itemIds, reason) {
  const t = now();
  const payload = { item_ids: itemIds, reason };
  const r = await env.DB.prepare("INSERT INTO decisions (assignment_id,expert_id,action,payload_json,requested_at) VALUES (?,?,?,?,?)")
    .bind(own.id, ex.id, action, JSON.stringify(payload), t).run();
  const id = r.meta.last_row_id;
  const stmts = [ev(env, `expert:${ex.id}`, "decision_requested", own.request_id, { decision_id: id, action, items: itemIds, reason })];
  const mgr = await settingValue(env, "managerChat");
  if (mgr) stmts.push(await decisionRequestStmt(env, mgr, id, own.id, action, itemIds, t, reason));
  await env.DB.batch(stmts);
  return { ok: true, pending: true, decision_id: id, items: itemIds.length };
}

/**
 * «👁 درخواست حالت تأیید»: اقلامِ بازی که هنوز سپرده نشده‌اند، دستی نیستند، حالت تأیید ندارند و نوعشان را پشتیبانی «مجازِ تأیید» کرده
 * (ai-modes.js)، با توضیحِ اجباری — تا تصمیمِ مدیر در صف.
 */
async function supRequest(env, ex, own, body) {
  const reason = T(body.reason).slice(0, 1000);
  if (!reason) throw new HttpError("برای «👁 حالت تأیید» توضیح بنویسید تا مدیر تصمیم بگیرد.", 422, { need_reason: true });
  const o = await aiOwned(env, own.id);
  if (!o) throw new HttpError("این درخواست در حالت هوشمند نیست؛ کارهایش همین حالا با خودِ شماست.", 409);
  const want = [...new Set((Array.isArray(body.item_ids) ? body.item_ids : []).map((x) => int(x)).filter(Boolean))];
  if (!want.length) throw new HttpError("دست‌کم یک قلم را برای «حالت تأیید» انتخاب کنید.");
  const rows = (await env.DB.prepare(`SELECT id, code, title, norm_json, ai_off, ai_start_at, sup_on FROM items WHERE assignment_id=? AND state='open' AND id IN (${want.map(() => "?").join(",")})`)
    .bind(own.id, ...want).all()).results || [];
  const waiting = await waitingItems(env, own.id, "supervise");
  const modes = await itemModes(env, rows);
  const itemIds = rows.filter((r) => !r.ai_start_at && Number(r.ai_off) !== 1 && Number(r.sup_on) !== 1 && !waiting.has(r.id) && (modes.get(r.id) || {}).supervise).map((r) => r.id);
  if (!itemIds.length) throw new HttpError("«حالت تأیید» فقط پیش از «🚀 شروع» و برای نوع قلمی است که پشتیبانی مجاز کرده؛ این اقلام سپرده شده‌اند، دستی‌اند، از قبل «با تأیید»اند یا درخواستشان در انتظارِ مدیر است.", 409);
  return queueAsk(env, ex, own, "supervise", itemIds, reason);
}

/** پیام «در انتظار تأیید» برای مدیر، با دو دکمه. `at` لحظهٔ ثبتِ تصمیم است و در کلید یکتایی صف می‌آید */
async function decisionRequestStmt(env, mgrChat, decisionId, aid, action, itemIds, at, reason = null) {
  const c = await context(env, aid);
  const its = (await env.DB.prepare("SELECT id, title, qty, unit, state FROM items WHERE assignment_id=? ORDER BY line_no").bind(aid).all()).results || [];
  const chosen = new Set(itemIds || []);
  const list = its.filter((i) => !["end", ...ITEM_ASKS].includes(action) || chosen.has(i.id)).slice(0, 12)
    .map((i, k) => `${M(k + 1)}. ${esc(i.title)}${i.qty != null ? ` — <b>${M(i.qty)}</b> ${esc(i.unit || "")}` : ""}`).join("\n");
  const text = `🟠 <b>درخواست تأیید: ${ACTION_FA[action]}</b>\n\n`
    + `درخواست <b>${esc(c.request_id)}</b>\n${esc(c.party || "")}\n\n`
    + `👤 کارشناس: <b>${esc(c.expert_label || c.expert_name)}</b>\n\n`
    + (action === "end"
      ? `کارشناس می‌خواهد <b>${M(chosen.size)} قلم از ${M(c.item_count)}</b> را با تأیید کمیسیون خاتمه دهد:\n${list}`
      : action === "manual"
        ? `کارشناس می‌خواهد این <b>${M(chosen.size)} قلم</b> را به‌جای کارشناس هوشمند خودش انجام دهد:\n${list}${reason ? `\n\n<b>علت:</b>\n${esc(reason)}` : ""}`
        : action === "supervise"
          ? `کارشناس می‌خواهد این <b>${M(chosen.size)} قلم</b> با «👁 حالت تأیید» پیش بروند — کارشناس هوشمند هر پیام یا تصمیمی را که او «با تأیید» گذاشته، اول به او پیشنهاد می‌کند:\n${list}${reason ? `\n\n<b>علت:</b>\n${esc(reason)}` : ""}`
          : `کارشناس می‌خواهد این درخواست را <b>${ACTION_FA[action]}</b> کند.`)
    + (action === "manual" ? "\n\n<i>«انجام دستی» همیشه با تأیید شماست؛ با رد، اقلام دستِ کارشناس هوشمند می‌مانند.</i>"
      : action === "supervise" ? "\n\n<i>«حالت تأیید» همیشه با تأیید شماست؛ با رد، کارشناس هوشمند این اقلام را بی تأیید پیش می‌برد.</i>"
        : `\n\n<i>چون «تصمیم کارشناس منوط به تأیید من» فعال است، تا شما تأیید نکنید اعمال نمی‌شود.</i>`);
  /* کلید یکتایی زمان را هم دارد: شناسهٔ تصمیم بعد از حذف درخواست‌ها دوباره استفاده می‌شود و ردیفِ
     قدیمیِ «dec:5:ask» پیامِ تصمیمِ تازه را بی‌صدا می‌خورد (ON CONFLICT DO NOTHING) — همان باگِ dispatch */
  return queueStmt(env, `dec:${decisionId}:${at}:ask`, mgrChat, text, [
    [{ text: "✅ تأیید", callback_data: `mdec:${decisionId}:ok` }, { text: "❌ رد", callback_data: `mdec:${decisionId}:no` }],
  ]);
}

/**
 * اعمال تصمیم. خاتمه فقط قلم‌های داده‌شده را می‌بندد.
 * برمی‌گرداند چند قلم بسته شد و آیا درخواست به‌کل بسته شده.
 */
export async function applyDecision(env, actor, aid, action, payload, decisionId) {
  const t = now();
  if (action === "manual") return applyManual(env, actor, aid, payload, t);
  if (action === "supervise") return applySupervise(env, actor, aid, payload, t);
  let closed = 0;
  /* اقلامی که همین تصمیم تغییرشان می‌دهد — پیش از UPDATE خوانده می‌شوند تا در closures بمانند */
  const ids = Array.isArray(payload && payload.item_ids) ? payload.item_ids.map((x) => int(x)).filter(Boolean) : [];
  const where = action === "end"
    ? (ids.length ? `assignment_id=? AND state='open' AND id IN (${ids.map(() => "?").join(",")})` : "assignment_id=? AND state='open' AND commission_ok=1")
    : "assignment_id=? AND state='open'";
  const args = action === "end" && ids.length ? [aid, ...ids] : [aid];
  const touched = ((await env.DB.prepare(`SELECT id FROM items WHERE ${where}`).bind(...args).all()).results || []).map((r) => r.id);
  const r = await env.DB.prepare(`UPDATE items SET state=?, state_at=? WHERE ${where}`).bind(action === "end" ? "closed" : action, t, ...args).run();
  if (action === "end") closed = (r.meta && r.meta.changes) || 0;
  const c = await context(env, aid);
  const live = await env.DB.prepare("SELECT COUNT(*) AS n FROM items WHERE assignment_id=? AND state IN ('open','hold')").bind(aid).first();
  const fullyClosed = !live || live.n === 0;
  const stmts = [
    ev(env, actor, action === "end" ? "close" : action, c && c.request_id, { assignment_id: aid, closed, fully_closed: fullyClosed }),
    /* تاریخ خاتمه (یا تعلیق/توقف) با اقلام و تأییدکننده */
    closureStmt(env, { assignment_id: aid, request_id: c && c.request_id, expert_id: c && c.expert_id, action, item_ids: touched,
      closed: action === "end" ? closed : touched.length, fully_closed: fullyClosed, actor, decision_id: decisionId, at: t }),
  ];
  if (fullyClosed) {
    /* هشدارهای مانده بی‌معنی‌اند */
    stmts.push(env.DB.prepare("UPDATE alerts SET canceled_at=? WHERE assignment_id=? AND fired_at IS NULL AND canceled_at IS NULL").bind(t, aid));
    if (action === "end") stmts.push(env.DB.prepare("UPDATE assignments SET closed_at=COALESCE(closed_at,?) WHERE id=?").bind(t, aid));
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

/** «انجام دستی»ِ تأییدشده: همان اقلامِ باز دستی می‌شوند — وضعیتشان عوض نمی‌شود */
async function applyManual(env, actor, aid, payload, t) {
  const ids = Array.isArray(payload && payload.item_ids) ? payload.item_ids.map((x) => int(x)).filter(Boolean) : [];
  if (!ids.length) return { manual: 0, closed: 0, fullyClosed: false };
  const r = await env.DB.prepare(`UPDATE items SET ai_off=1, ai_off_at=? WHERE assignment_id=? AND state='open' AND COALESCE(ai_off,0)<>1 AND id IN (${ids.map(() => "?").join(",")})`)
    .bind(t, aid, ...ids).run();
  const c = await context(env, aid);
  await env.DB.batch([ev(env, actor, "ai_manual", c && c.request_id, { assignment_id: aid, items: ids, reason: (payload && payload.reason) || null })]);
  return { manual: (r.meta && r.meta.changes) || 0, closed: 0, fullyClosed: false };
}

/** «👁 حالت تأیید»ِ تأییدشده: همان اقلامِ باز «با تأیید» می‌شوند — از همین لحظه، چه سپرده شده باشند چه نه */
async function applySupervise(env, actor, aid, payload, t) {
  const ids = Array.isArray(payload && payload.item_ids) ? payload.item_ids.map((x) => int(x)).filter(Boolean) : [];
  if (!ids.length) return { sup: 0, closed: 0, fullyClosed: false };
  const r = await env.DB.prepare(`UPDATE items SET sup_on=1, sup_at=?, sup_by='expert' WHERE assignment_id=? AND state='open' AND COALESCE(sup_on,0)<>1 AND id IN (${ids.map(() => "?").join(",")})`)
    .bind(t, aid, ...ids).run();
  const c = await context(env, aid);
  await env.DB.batch([ev(env, actor, "ai_sup_item", c && c.request_id, { assignment_id: aid, items: ids, reason: (payload && payload.reason) || null })]);
  return { sup: (r.meta && r.meta.changes) || 0, closed: 0, fullyClosed: false };
}

/** مدیر تأیید کرد */
export async function approveDecision(env, decisionId, via) {
  const d = await env.DB.prepare("SELECT * FROM decisions WHERE id=? AND approved_at IS NULL AND rejected_at IS NULL").bind(decisionId).first();
  if (!d) throw new HttpError("تصمیم پیدا نشد یا قبلاً رسیدگی شده.", 404);
  const res = await applyDecision(env, "manager", d.assignment_id, d.action, JSON.parse(d.payload_json || "{}"), d.id);
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
      + (d.action === "manual" && res ? `\n${M(res.manual)} قلم دستِ خودِ شماست: بررسی سوابق، جستجو و مکاتبه‌اش را خودتان انجام دهید.` : "")
      + (d.action === "supervise" && res ? `\n${M(res.sup)} قلم «👁 با تأیید» شد: کارشناس هوشمند هر کاری را که در «👁 حالت تأیید»ِ حسابتان «با تأیید» گذاشته‌اید، اول به شما پیشنهاد می‌کند.` : "")
    : `❌ <b>مدیر ${act} را رد کرد</b>\n\nدرخواست <b>${esc(c.request_id)}</b>`
      + (reason ? `\n\n<b>علت:</b>\n${esc(reason)}` : "\n\n<i>دلیلی نوشته نشد.</i>")
      + (d.action === "manual" ? "\n\nاین اقلام با کارشناس هوشمند می‌مانند؛ بعد از نرمال‌سازی «سپردن» را بزنید."
        : d.action === "supervise" ? "\n\nکارشناس هوشمند این اقلام را بی تأیید پیش می‌برد." : `\n\nدرخواست همچنان در کارتابل شماست.`);
  await env.DB.batch([queueStmt(env, `dec:${d.id}:${d.requested_at}:${ok ? "ok" : "no"}`, c.telegram_chat, text)]);
}
