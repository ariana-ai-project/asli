/**
 * «🚨 باز کردنِ اضطراری»ِ گفت‌وگوی کارشناس هوشمند (مهر ۱۴۰۵، درخواست مالک)
 *
 * کارشناس گفت‌وگوهای کارشناس هوشمند با تأمین‌کنندگان را فقط می‌بیند (sp-core.js:threadFor با read). اگر کارِ فوری پیش آمد،
 * با نوشتنِ علت گفت‌وگو را «اضطراری» باز می‌کند: ai_threads.state='human' — کارشناس هوشمند دیگر در این گفت‌وگو جواب نمی‌دهد
 * (ai-agent.js: pickThread، kickNow و پیامِ پایانی)، و کارشناس مثل گفت‌وگوی دستی پیام و تصمیم می‌فرستد. همان لحظه هشدار به
 * مدیر و پشتیبان می‌رود (alarms.js: پنل‌ها، تلگرام و پیامک اگر گذاشته شده). «🤖 برگرداندن» گفت‌وگو را دوباره به کارشناس هوشمند می‌سپارد.
 */
import { HttpError } from "./http.js";
import { raiseAlarm } from "./alarms.js";

const T = (v) => String(v == null ? "" : v).trim();
const now = () => Date.now();
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function rowOf(env, th) {
  const x = await env.DB.prepare("SELECT x.thread_id, x.state, x.run_id, r.finished_at FROM ai_threads x JOIN ai_runs r ON r.id=x.run_id WHERE x.thread_id=?").bind(th.id).first();
  if (!x) throw new HttpError("این گفت‌وگو دستِ کارشناس هوشمند نیست.", 409);
  return x;
}

/** th: ردیفِ گفت‌وگو (sp-core.js:threadFor با read) */
export async function takeoverThread(env, ctx, ex, th, reason0) {
  const reason = T(reason0).slice(0, 500);
  if (reason.length < 3) throw new HttpError("علتِ باز کردنِ اضطراری را بنویسید — برای مدیر و پشتیبان فرستاده می‌شود.");
  const x = await rowOf(env, th);
  if (x.state === "human") return { ok: true, already: true };
  if (x.state === "closed" || x.finished_at) throw new HttpError("کارِ کارشناس هوشمند در این گفت‌وگو تمام شده و گفت‌وگو از قبل باز است.", 409);
  const t = now();
  const who = ex.label || ex.name;
  await env.DB.batch([
    env.DB.prepare("UPDATE ai_threads SET state='human', lock_until=NULL, ask_json=json_set(COALESCE(ask_json,'{}'),'$.takeover',json_object('by',?,'at',?,'reason',?,'from',?)), updated_at=? WHERE thread_id=?")
      .bind(ex.id, t, reason, x.state, t, th.id),
    env.DB.prepare("INSERT INTO ai_log (run_id,thread_id,at,kind,body) VALUES (?,?,?,'takeover',?)").bind(x.run_id, th.id, t, `🚨 ${who} گفت‌وگو را اضطراری باز کرد: ${reason}`),
    env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)").bind(t, `expert:${ex.id}`, "ai_takeover", th.request_id,
      JSON.stringify({ assignment_id: th.assignment_id, thread_id: th.id, supplier: th.supplier_name, reason })),
  ]);
  const a = await raiseAlarm(env, {
    kind: "ai_takeover", title: `${who} گفت‌وگوی کارشناس هوشمند را اضطراری باز کرد`,
    body: `درخواست ${th.request_id} · ${th.supplier_name} — علت: ${reason}`, request_id: th.request_id, assignment_id: th.assignment_id, thread_id: th.id, expert_id: ex.id,
    payload: { supplier: th.supplier_name, reason },
    tg: `🚨 <b>باز کردنِ اضطراریِ گفت‌وگو</b>\n${esc(who)} گفت‌وگوی کارشناس هوشمند با <b>${esc(th.supplier_name)}</b> (درخواست ${esc(th.request_id)}) را باز کرد و خودش ادامه می‌دهد.\n\nعلت: ${esc(reason)}`,
    sms: `هشدار سامانه تدارکات: ${who} گفت‌وگوی کارشناس هوشمند با ${th.supplier_name} (درخواست ${th.request_id}) را اضطراری باز کرد. علت: ${reason}`.slice(0, 300),
  }, ctx);
  return { ok: true, alarm: a.id, queued: a.queued };
}

/** «🤖 برگرداندن به کارشناس هوشمند» — گفت‌وگوی اضطراری دوباره دستِ او؛ پیام‌های تازهٔ تأمین‌کننده در نوبتِ بعد خوانده می‌شوند */
export async function handbackThread(env, ex, th) {
  const x = await rowOf(env, th);
  if (x.state !== "human") throw new HttpError("این گفت‌وگو اضطراری باز نشده است.", 409);
  if (x.finished_at) throw new HttpError("کارِ کارشناس هوشمند در این درخواست تمام شده است.", 409);
  const t = now();
  const who = ex.label || ex.name;
  await env.DB.batch([
    env.DB.prepare("UPDATE ai_threads SET state='active', ask_json=json_set(COALESCE(ask_json,'{}'),'$.handback_at',?), updated_at=? WHERE thread_id=?").bind(t, t, th.id),
    env.DB.prepare("INSERT INTO ai_log (run_id,thread_id,at,kind,body) VALUES (?,?,?,'takeover',?)").bind(x.run_id, th.id, t, `🤖 ${who} گفت‌وگو را دوباره به کارشناس هوشمند سپرد.`),
    env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)").bind(t, `expert:${ex.id}`, "ai_handback", th.request_id,
      JSON.stringify({ assignment_id: th.assignment_id, thread_id: th.id, supplier: th.supplier_name })),
    env.DB.prepare("UPDATE ai_runs SET next_at=? WHERE id=? AND finished_at IS NULL AND next_at>?").bind(t, x.run_id, t),
  ]);
  return { ok: true };
}
