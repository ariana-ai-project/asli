/**
 * هشدارها برای مدیر و پشتیبان (مهر ۱۴۰۵، درخواست مالک)
 *
 * اولین هشدار: کارشناس گفت‌وگوی کارشناس هوشمند با تأمین‌کننده را «🚨 اضطراری» باز کرد (ai-takeover.js). هر هشدار:
 *   • در جدول alarms می‌ماند و تا «دیدم» در پنل مدیر و پنل پشتیبانی (جداگانه) بالای صفحه دیده می‌شود
 *   • به تلگرامِ مدیر (کانال اعلان مدیر، settings.managerChat) و تلگرامِ پشتیبان (گروهی که «/support» زده، settings.supportChat) می‌رود
 *   • اگر پشتیبانی شمارهٔ همراهِ مدیر یا پشتیبان را گذاشته (settings.alertPhones)، پیامکِ کوتاه هم می‌رود
 * تلگرام و پیامکی که هنوز وصل یا گذاشته نشده، بی‌صدا رد می‌شود — هشدار در پنل‌ها همیشه هست.
 */
import { HttpError } from "./http.js";
import { queueStmt } from "./queue.js";
import { pushLater, MANAGER, SUPPORT } from "./push.js";
import { smsReady, sendSms, e164, isMobile } from "./sms.js";

export const ALARM_DDL = `
CREATE TABLE IF NOT EXISTS alarms (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT, request_id TEXT, assignment_id INTEGER, thread_id INTEGER, expert_id INTEGER, payload_json TEXT, ack_m INTEGER, ack_s INTEGER);
CREATE INDEX IF NOT EXISTS ix_alarms_at ON alarms(at);
`;

const T = (v) => String(v == null ? "" : v).trim();
const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const now = () => Date.now();
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const setting = async (env, key) => { const r = await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(key).first().catch(() => null); return r ? parse(r.value, r.value) : null; };

/** شماره‌های پیامکِ هشدار — {manager, support} (فقط همراهِ ایران) */
export async function alertContacts(env) {
  const p = (await setting(env, "alertPhones")) || {};
  const [mc, sc] = await Promise.all([setting(env, "managerChat"), setting(env, "supportChat")]);
  return { manager_phone: p.manager || "", support_phone: p.support || "", manager_tg: !!mc, support_tg: !!sc, sms: smsReady(env) };
}
/** PUT /support/alert-contacts — {manager_phone, support_phone}؛ خالی = برداشتن */
export async function alertContactsSave(env, b) {
  const clean = (v, who) => {
    const s = T(v);
    if (!s) return "";
    if (!isMobile(s)) throw new HttpError(`شمارهٔ همراهِ ${who} درست نیست (مثل ۰۹۱۲۱۲۳۴۵۶۷).`);
    return "0" + e164(s).slice(3);
  };
  const v = { manager: clean(b && b.manager_phone, "مدیر"), support: clean(b && b.support_phone, "پشتیبان") };
  await env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('alertPhones',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
    .bind(JSON.stringify(v), now()).run();
  return alertContacts(env);
}

/**
 * هشدارِ تازه. a: {kind, title, body, request_id, assignment_id, thread_id, expert_id, payload, tg (متنِ HTMLِ تلگرام), sms (متنِ پیامک)}
 * خروجی {id, queued} — queued: شمارِ پیام‌های تلگرامِ در صف (برای flush صدازننده)
 */
export async function raiseAlarm(env, a, ctx) {
  const t = now();
  const r = await env.DB.prepare(`INSERT INTO alarms (at,kind,title,body,request_id,assignment_id,thread_id,expert_id,payload_json) VALUES (?,?,?,?,?,?,?,?,?)`)
    .bind(t, a.kind, a.title, a.body || null, a.request_id || null, a.assignment_id || null, a.thread_id || null, a.expert_id || null, a.payload ? JSON.stringify(a.payload) : null).run();
  const id = r.meta.last_row_id;
  const [mc, sc] = await Promise.all([setting(env, "managerChat"), setting(env, "supportChat")]);
  const text = a.tg || `🚨 <b>${esc(a.title)}</b>${a.body ? `\n${esc(a.body)}` : ""}`;
  const stmts = [];
  for (const [chat, tag] of [[mc, "m"], [sc, "s"]]) if (chat && !(tag === "s" && String(sc) === String(mc))) stmts.push(queueStmt(env, `alarm:${id}:${tag}`, chat, text, null));
  if (stmts.length) await env.DB.batch(stmts);
  /* اعلانِ گوشی و مرورگرِ مدیر و پشتیبان — مثل پیامک همان لحظه (هشدار فوری است، ساعت اداری ندارد) */
  const pmsg = (url) => ({ title: `🚨 ${a.title}`, body: a.body || "", url, tag: `alarm${id}` });
  const pj = Promise.all([pushLater(env, ctx, MANAGER, pmsg("manager")), pushLater(env, ctx, SUPPORT, pmsg("support"))]);
  if (!ctx || typeof ctx.waitUntil !== "function") await pj;
  /* پیامک — بعد از پاسخ (waitUntil)، تا کندیِ درگاه کارِ کارشناس را نگه ندارد */
  const p = (await setting(env, "alertPhones")) || {};
  const to = [...new Set([p.manager, p.support].filter(Boolean))];
  if (to.length && smsReady(env)) {
    /* الگوی alarm (worker/sms-patterns.js): فقط عنوان، فوری و بی بررسیِ دستیِ IPPanel؛ تا تأیید نشده همان متنِ کامل */
    const job = Promise.all(to.map((x) => sendSms(env, x, a.sms || `${a.title}${a.body ? ` — ${a.body}` : ""}`.slice(0, 300), { pattern: { key: "alarm", params: { title: a.title } } })
      .catch((e) => console.error("alarm sms", e && e.message))));
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(job); else await job;
  }
  return { id, queued: stmts.length };
}

/** هشدارهای دیده‌نشدهٔ یک طرف (m: مدیر، s: پشتیبان) و چند تای آخرِ دیده‌شده */
export async function alarmsList(env, side, url) {
  const col = side === "s" ? "ack_s" : "ack_m";
  const all = url && url.searchParams.get("all") === "1";
  const rows = ((await env.DB.prepare(`SELECT a.*, e.label AS expert_label, e.name AS expert_name FROM alarms a LEFT JOIN experts e ON e.id=a.expert_id
      WHERE ${all ? "1=1" : `a.${col} IS NULL`} ORDER BY a.at DESC LIMIT ${all ? 60 : 20}`).all()).results || []);
  return { alarms: rows.map((r) => ({ id: r.id, at: r.at, kind: r.kind, title: r.title, body: r.body, request_id: r.request_id, assignment_id: r.assignment_id,
    thread_id: r.thread_id, expert: r.expert_label || r.expert_name || null, payload: parse(r.payload_json, null), seen: !!r[col] })) };
}
export async function alarmAck(env, side, id) {
  const col = side === "s" ? "ack_s" : "ack_m";
  const n = int(id);
  if (!n) throw new HttpError("هشدار مشخص نیست.");
  await env.DB.prepare(`UPDATE alarms SET ${col}=? WHERE id=? AND ${col} IS NULL`).bind(now(), n).run();
  return { ok: true };
}
