/**
 * «⏱ مکاتباتِ کارشناس هوشمند با مهلت» — از مهر ۱۴۰۵ (درخواستِ مالک؛ جای «👁 حالت تأیید»ِ فاز ۴ب گام ۴)
 *
 * وقتی پشتیبانی کارشناس هوشمندِ کارشناسی را روشن کرده، مکاتباتِ کارِ او قفلِ حالتِ هوشمند است و خودِ کارشناس (فقط او — نه تیکِ
 * مدیر و نه اجازهٔ پشتیبانی برای نوعِ قلم) در «حساب من» یا صفحهٔ مکاتبات یکی از دو حالت را می‌گذارد (experts.sup_json):
 *   • «⏱ با مهلت» (پیش‌فرض، ۱۰ دقیقه؛ ۱ تا ۶۰): هر پیامِ چت و هر تصمیمِ بستهٔ کارشناس هوشمند اول «پیشنهاد» می‌شود (ai_props با
 *     due_at) و با شمارشِ معکوس در مکاتبات، اعلانِ گوشی و بات به کارشناس نشان داده می‌شود:
 *       – «✅ ارسال» همان لحظه می‌فرستد، بی توضیح؛
 *       – «✏️ رد» علت می‌خواهد (به کارشناس هوشمند می‌رسد) و پیامِ تازهٔ خودِ کارشناس — همان به‌جای پیشنهاد می‌رود؛ در ردِ «تأیید
 *         نهایی»، بسته با پیامِ او برمی‌گردد، رد می‌شود یا فعلاً می‌ماند و تصمیمش از آن پس با خودِ اوست (manualBundles)؛
 *       – بی‌پاسخ تا سرِ مهلت: بی بررسی خودکار می‌رود (state='auto'؛ Cronِ هر دقیقه یا خودِ صفحهٔ باز سرِ صفر — ai-agent.js:propsDue).
 *   • «🤖 خودکار»: کارشناس هوشمند خودش مذاکره می‌کند و فقط وقتی جوابِ کارشناس لازم است «🚨 پرسش از کارشناس» می‌فرستد.
 *   • «⏸ بی‌مهلت» (کلیدِ hold پشتیبانی؛ تصمیم ۵ سند «پیام اول، استراتژی‌ها…»): همان پیشنهاد، بی due_at — تا «✅ ارسال» یا «✏️ رد»ِ
 *     کارشناس نمی‌رود (تأیید پیش از هر پیام).
 * با کلیدِ hold، «حالت کار»ِ نوع قلمِ اقلامِ گفت‌وگو (cr_heads.workflow، یا تغییرِ پشتیبانی) کفِ حالت است و سخت‌گیرترینِ این دو اجرا
 * می‌شود: «کاملاً هوش مصنوعی» (با شرط تحویل یا بی آن) بی کف، «ترکیبی» دست‌کم «⏱ با مهلت»، «کارشناس‌محور» همیشه «⏸ بی‌مهلت».
 * پیامِ تازهٔ تأمین‌کننده پیشنهادِ پاسخِ معطل را کنار می‌گذارد (stale) و کارشناس هوشمند پاسخِ تازه می‌نویسد. دعوت، افزودنِ قلم به
 * گفت‌وگو، یادداشت‌های درونی و «🚨 پرسش از کارشناس» پیشنهاد نمی‌شوند؛ «🚨 باز کردنِ اضطراری» (ai-takeover.js) سرِ جایش است.
 * ستون‌های قدیمیِ assignments.sup_on و items.sup_on و «supervise»ِ نوعِ قلم دیگر خوانده نمی‌شوند.
 * بی ایمپورت از ai-agent.js و sp-core.js، تا sp-core.js، api.js و bot.js بی حلقهٔ ایمپورت بخوانند.
 */
import { HttpError } from "./http.js";
import { AI_SUP_SQL, WF_SQL, LINE_HEAD_SQL } from "./ai-lock.js";

const now = () => Date.now();
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const FA = "۰۱۲۳۴۵۶۷۸۹";
const faN = (n) => String(n).replace(/\d/g, (d) => FA[+d]);
const latin = (v) => String(v == null ? "" : v).replace(/[۰-۹]/g, (d) => FA.indexOf(d)).replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).trim();

export const SUP_MIN = 1, SUP_MAX = 60;
export const SUP_DEFAULT = { mode: "timer", minutes: 10 };
export const SUP_MODES = ["timer", "auto", "hold"];
export const SUP_FA = { timer: "⏱ با مهلت", auto: "🤖 خودکار", hold: "⏸ بی‌مهلت" };
/** سخت‌گیری: خودکار < با مهلت < بی‌مهلت */
export const SUP_RANK = { auto: 0, timer: 1, hold: 2 };
/** «حالت کار»ِ نوع قلم (دادهٔ تحقیق، I-02 §۷) ← کفِ حالت */
export const WORKFLOW_SUP = { "کاملاً هوش مصنوعی": "auto", "کاملاً هوش مصنوعی (با شرط تحویل)": "auto", "ترکیبی": "timer", "کارشناس‌محور": "hold" };
export const WORKFLOWS = Object.keys(WORKFLOW_SUP);
/** کلیدِ «⏸ بی‌مهلت» در پنل پشتیبانی (settings.crFlags.hold؛ همان cr-api.js:crFlags، بی ایمپورت تا حلقه نسازد) */
export async function holdOn(env) {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key='crFlags'").first().catch(() => null);
  return !!(parse(r && r.value, {}) || {}).hold;
}
export const PROP_FA = { reply: "💬 پاسخ", final: "🏁 تأیید نهایی", act: "🧾 تصمیمِ بسته" };
export const PROP_STATE_FA = { pending: "منتظرِ شما", ok: "✅ فرستادید", auto: "⏱ بی‌پاسخ ماند و خودکار رفت", no: "✏️ رد کردید", stale: "کنار رفت — پیامِ تازهٔ تأمین‌کننده", off: "کنار رفت" };
/** ردِ «تأیید نهایی»: بسته با پیامِ کارشناس برمی‌گردد، رد می‌شود یا فعلاً می‌ماند */
export const BUNDLE_ACTS = ["return", "reject", "keep"];

/** تنظیماتِ یک کارشناس (experts.sup_json): {mode, minutes} — قالبِ قدیمیِ {chat, bundle} یا هر چیزِ نامعتبر = پیش‌فرض */
export function supCfg(raw) {
  const s = typeof raw === "string" ? parse(raw, {}) : raw && typeof raw === "object" ? raw : {};
  const m = Number(latin(s && s.minutes));
  return { mode: SUP_MODES.includes(s && s.mode) ? s.mode : SUP_DEFAULT.mode, minutes: Number.isInteger(m) && m >= SUP_MIN && m <= SUP_MAX ? m : SUP_DEFAULT.minutes };
}
export async function getSup(env, expertId) {
  const r = await env.DB.prepare("SELECT sup_json FROM experts WHERE id=?").bind(expertId).first().catch(() => null);
  return supCfg(r && r.sup_json);
}
/** ذخیره با سنجش (۴۲۲ برای حالت یا دقیقهٔ نادرست)؛ کارهای پسِ ذخیره (مهلتِ تازهٔ پیشنهادهای معطل، رفتنِ همه با «خودکار») در api.js */
export async function saveSup(env, expertId, body) {
  const mode = String((body && body.mode) || "").trim();
  const hold = await holdOn(env);
  if (!SUP_MODES.includes(mode) || (mode === "hold" && !hold)) throw new HttpError(hold ? "حالت باید «⏱ با مهلت»، «⏸ بی‌مهلت» یا «🤖 خودکار» باشد." : "حالت باید «⏱ با مهلت» یا «🤖 خودکار» باشد.", 422);
  const cur = await getSup(env, expertId);
  let minutes = cur.minutes;
  if (body && body.minutes != null && body.minutes !== "") {
    minutes = Number(latin(body.minutes));
    if (!Number.isInteger(minutes) || minutes < SUP_MIN || minutes > SUP_MAX) throw new HttpError(`مهلت عددی صحیح از ${faN(SUP_MIN)} تا ${faN(SUP_MAX)} دقیقه است.`, 422);
  }
  const v = { mode, minutes };
  await env.DB.batch([
    env.DB.prepare("UPDATE experts SET sup_json=? WHERE id=?").bind(JSON.stringify(v), expertId),
    env.DB.prepare("INSERT INTO events (at,actor,kind,payload_json) VALUES (?,?,?,?)").bind(now(), `expert:${expertId}`, "ai_sup_cfg", JSON.stringify(v)),
  ]);
  return v;
}

/**
 * کفِ حالتِ یک گفت‌وگو از «حالت کار»ِ نوع قلمِ خط‌هایش: {mode, head, workflow} برای سخت‌گیرترین، یا null (بی دادهٔ تحقیق یا همه
 * «کاملاً هوش مصنوعی»). فقط با کلیدِ hold معنا دارد؛ صدازننده می‌سنجد.
 */
export async function supFloor(env, threadId) {
  const rows = (await env.DB.prepare(`SELECT ch.head, ${WF_SQL("ch")} AS wf FROM sp_lines sl JOIN cr_heads ch ON ch.head=${LINE_HEAD_SQL("sl")} WHERE sl.thread_id=?`)
    .bind(threadId).all().catch(() => null)) || {};
  let floor = null;
  for (const x of rows.results || []) {
    const mode = WORKFLOW_SUP[x.wf] || "auto";
    if (SUP_RANK[mode] > 0 && (!floor || SUP_RANK[mode] > SUP_RANK[floor.mode])) floor = { mode, head: x.head, workflow: x.wf };
  }
  return floor;
}
/** حالتِ مؤثر: سخت‌گیرترینِ تنظیمِ کارشناس و کفِ نوع قلم؛ بی کلیدِ hold، «بی‌مهلت»ِ ذخیره‌شده همان «با مهلت» است */
export function supEffective(cfg, floor, hold) {
  let mode = cfg.mode === "hold" && !hold ? "timer" : cfg.mode;
  if (hold && floor && SUP_RANK[floor.mode] > SUP_RANK[mode]) mode = floor.mode;
  return mode;
}

/**
 * حالتِ یک گفت‌وگو: {on, chat, bundle, minutes, hold, mode, floor} — on یعنی پیام‌ها و تصمیم‌ها پیشنهاد می‌شوند («با مهلت» یا
 * «بی‌مهلت»)؛ hold یعنی پیشنهاد بی مهلت است. فقط در مسیرهای کارشناس هوشمند صدا زده می‌شود؛ مالکیتِ گفت‌وگو را صدازننده سنجیده است.
 */
export async function supOfThread(env, threadId) {
  const r = await env.DB.prepare(`SELECT e.sup_json, ${AI_SUP_SQL("t.id")} AS sup FROM sp_threads t JOIN assignments a ON a.id=t.assignment_id JOIN experts e ON e.id=a.expert_id
      WHERE t.id=?`).bind(threadId).first().catch(() => null);
  if (!r || !r.sup) return { on: false, chat: false, bundle: false, minutes: 0, hold: false, mode: "auto", floor: null };
  const cfg = supCfg(r.sup_json);
  const hold = await holdOn(env);
  const floor = hold ? await supFloor(env, threadId) : null;
  const mode = supEffective(cfg, floor, hold);
  return { on: mode !== "auto", chat: true, bundle: true, minutes: cfg.minutes, hold: mode === "hold", mode, floor };
}

/**
 * بسته‌هایی از یک گفت‌وگوی «⏱ با مهلت» که تصمیمشان با خودِ کارشناس است: کارشناس پیشنهادِ تصمیمِ کارشناس هوشمند را برای آن‌ها رد
 * کرده (ai_props با state='no'؛ بسته در bundle_id یا meta_json.bundles).
 */
export async function manualBundles(env, threadId) {
  const rows = (await env.DB.prepare("SELECT bundle_id, meta_json FROM ai_props WHERE thread_id=? AND state='no' AND kind IN ('final','act')").bind(threadId).all().catch(() => null)) || {};
  const out = new Set();
  for (const r of rows.results || []) {
    if (r.bundle_id) out.add(r.bundle_id);
    for (const b of (parse(r.meta_json, {}) || {}).bundles || []) out.add(Number(b));
  }
  return out;
}

/** پیشنهادهای یک گفت‌وگو برای صفحهٔ مکاتبات: معطل‌ها و ده تصمیمِ آخر */
export async function propsOf(env, threadId) {
  const rows = (await env.DB.prepare("SELECT * FROM ai_props WHERE thread_id=? ORDER BY id DESC LIMIT 20").bind(threadId).all().catch(() => null)) || {};
  const list = (rows.results || []).map(propOut);
  return { pending: list.filter((p) => p.state === "pending").reverse(), done: list.filter((p) => p.state !== "pending").slice(0, 10) };
}
export function propOut(p) {
  const meta = parse(p.meta_json, {}) || {};
  return { id: p.id, kind: p.kind, kind_fa: PROP_FA[p.kind] || p.kind, body: p.body || "", bundle_id: p.bundle_id || null, actions: meta.actions || [], why: meta.why || null,
    state: p.state, state_fa: PROP_STATE_FA[p.state] || p.state, reason: p.reason || null, own: p.own || null, bundle_act: meta.bundle_act || null,
    created_at: p.created_at, due_at: p.due_at || null, decided_at: p.decided_at || null, decided_by: p.decided_by || null };
}

/**
 * بدنهٔ «رد»: علتِ اجباری (به کارشناس هوشمند می‌رسد)، و پیامِ تازهٔ خودِ کارشناس — برای پیشنهادی که پیام دارد (پاسخ، یا تصمیمِ
 * بسته با پاسخ) اجباری است چون همان به‌جای پیامِ ردشده می‌رود. در «🏁 تأیید نهایی» پیام برای «↩️ برگشت» اجباری است.
 */
export function rejectBody(p, b) {
  const reason = String((b && b.reason) || "").trim().slice(0, 1000);
  if (!reason) throw new HttpError("برای «✏️ رد» بنویسید چرا پیشنهاد را رد می‌کنید؛ همین توضیح به کارشناس هوشمند می‌رسد تا دفعهٔ بعد درست‌تر بنویسد.", 422, { need_reason: true });
  const text = String((b && b.text) || "").trim().slice(0, 2900);
  if (p.kind !== "final" && p.body && !text) throw new HttpError("پیامِ خودتان را بنویسید — به‌جای پیامِ ردشدهٔ کارشناس هوشمند همین برای تأمین‌کننده می‌رود.", 422, { need_text: true });
  const bundle = p.kind === "final" ? (BUNDLE_ACTS.includes(b && b.bundle) ? b.bundle : text ? "return" : "keep") : null;
  if (bundle === "return" && !text) throw new HttpError("برای «↩️ برگشت» پیامِ خودتان را بنویسید تا تأمین‌کننده بداند چه چیزی را اصلاح کند.", 422, { need_text: true });
  return { reason, text, bundle };
}
