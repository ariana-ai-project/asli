/**
 * «👁 حالت تأیید» — طرح «خرید هوشمند، کارشناس ناظر»، فاز ۴ب گام ۴ (مهر ۱۴۰۵، پاسخ‌های ۱۹ و ۲۰)
 *
 * فقط برای نوع قلمی که پشتیبانی «مجازِ تأیید» کرده (ai-modes.js: supervise):
 *   • مدیر در ارجاع تیکِ «👁» را می‌زند (assignments.sup_on)؛ قلمِ مجاز با «🚀 شروع» حالت تأیید می‌گیرد (items.sup_on)، و قلمی که
 *     پیش‌تر سپرده شده همان لحظه.
 *   • بی اجازهٔ مدیر، کارشناس پیش از «🚀 شروع» با توضیح می‌خواهد (decisions.js: supervise) — همیشه با تأییدِ مدیر.
 *   • مدیر هر وقت خاموشش می‌کند، بی توضیح: پیشنهادهای معطل کنار می‌روند و کارشناس هوشمند همان کار را خودش انجام می‌دهد.
 * گفت‌وگویی که دست‌کم یک قلمِ «با تأیید» دارد (ai-lock.js: AI_SUP_SQL) برای کارشناس باز و فقط‌خواندنی است. کارشناس در تنظیماتش
 * (experts.sup_json) می‌گوید کدام کار تأیید بخواهد — پیامِ چت و تصمیمِ بسته — و همان کار «پیشنهاد» می‌شود (ai_props) و تا تأییدش
 * به تأمین‌کننده نمی‌رسد:
 *   • تأیید هیچ توضیحی نمی‌خواهد؛ پیام یا تصمیم همان لحظه می‌رود.
 *   • رد با توضیح است (به کارشناس هوشمند می‌رسد) و بعدش پیامِ خودِ کارشناس می‌رود یا هیچ؛ در ردِ «تأیید نهایی»، بسته با همان پیام
 *     برمی‌گردد، رد می‌شود یا فعلاً می‌ماند — و تصمیمِ آن بسته از آن پس با خودِ کارشناس است (manualBundles).
 *   • پیامِ تازهٔ تأمین‌کننده پیشنهادِ پاسخِ معطل را کنار می‌گذارد (stale) و کارشناس هوشمند پاسخِ تازه می‌نویسد.
 * دعوت، افزودنِ قلم به گفت‌وگو، یادداشت‌های درونی و «🚨 پرسش از کارشناس» تأیید نمی‌خواهند.
 * بی ایمپورت از ai-agent.js و sp-core.js، تا sp-core.js، api.js و bot.js بی حلقهٔ ایمپورت بخوانند.
 */
import { HttpError } from "./http.js";
import { getModes } from "./ai-modes.js";
import { AI_SUP_SQL } from "./ai-lock.js";

const now = () => Date.now();
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };

export const SUP_DEFAULT = { chat: false, bundle: true };
export const SUP_FA = { chat: "پیامِ چت به تأمین‌کننده", bundle: "تصمیمِ بسته (تأیید نهایی، برگشت، رد)" };
export const PROP_FA = { reply: "💬 پاسخ", final: "🏁 تأیید نهایی", act: "🧾 تصمیمِ بسته" };
export const PROP_STATE_FA = { pending: "منتظرِ شما", ok: "✅ تأیید شد", no: "❌ رد شد", stale: "کنار رفت — پیامِ تازهٔ تأمین‌کننده", off: "کنار رفت" };
/** ردِ «تأیید نهایی»: بسته با پیامِ کارشناس برمی‌گردد، رد می‌شود یا فعلاً می‌ماند */
export const BUNDLE_ACTS = ["return", "reject", "keep"];

/** تنظیماتِ «👁 حالت تأیید»ِ یک کارشناس (experts.sup_json) — هر کلیدِ نیامده همان پیش‌فرض */
export function supCfg(raw) {
  const s = typeof raw === "string" ? parse(raw, {}) : raw && typeof raw === "object" ? raw : {};
  return { chat: typeof s.chat === "boolean" ? s.chat : SUP_DEFAULT.chat, bundle: typeof s.bundle === "boolean" ? s.bundle : SUP_DEFAULT.bundle };
}
export async function getSup(env, expertId) {
  const r = await env.DB.prepare("SELECT sup_json FROM experts WHERE id=?").bind(expertId).first().catch(() => null);
  return supCfg(r && r.sup_json);
}
export async function saveSup(env, expertId, body) {
  const v = supCfg({ chat: !!(body && body.chat), bundle: !!(body && body.bundle) });
  const t = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE experts SET sup_json=? WHERE id=?").bind(JSON.stringify(v), expertId),
    env.DB.prepare("INSERT INTO events (at,actor,kind,payload_json) VALUES (?,?,?,?)").bind(t, `expert:${expertId}`, "ai_sup_cfg", JSON.stringify(v)),
  ]);
  return v;
}

/** حالتِ تأییدِ یک گفت‌وگو: {on, chat, bundle} — on: دست‌کم یک قلمش «با تأیید» است؛ chat و bundle از تنظیماتِ کارشناسِ فعلیِ ارجاع */
export async function supOfThread(env, threadId) {
  const r = await env.DB.prepare(`SELECT e.sup_json, ${AI_SUP_SQL("t.id")} AS sup FROM sp_threads t JOIN assignments a ON a.id=t.assignment_id JOIN experts e ON e.id=a.expert_id
      WHERE t.id=?`).bind(threadId).first().catch(() => null);
  if (!r || !r.sup) return { on: false, chat: false, bundle: false };
  return { on: true, ...supCfg(r.sup_json) };
}

/** چند نوع قلم را پشتیبانی «مجازِ تأیید» کرده — بی هیچ، تیکِ «👁» مدیر و درخواستِ کارشناس معنا ندارد */
export async function supHeads(env) {
  const m = await getModes(env);
  return Object.values(m.heads || {}).filter((h) => h && h.supervise).length;
}

/**
 * بسته‌هایی از یک گفت‌وگوی «👁 با تأیید» که تصمیمشان با خودِ کارشناس است: کارشناس پیشنهادِ تصمیمِ کارشناس هوشمند را برای آن‌ها رد
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
    created_at: p.created_at, decided_at: p.decided_at || null };
}

/** بدنهٔ «رد»: توضیح اجباری؛ پیامِ خودِ کارشناس اختیاری (برای «↩️ برگشت» همان توضیحِ برگشت و اجباری) */
export function rejectBody(p, b) {
  const reason = String((b && b.reason) || "").trim().slice(0, 1000);
  if (!reason) throw new HttpError("برای «❌ رد» توضیح بنویسید؛ همین توضیح به کارشناس هوشمند می‌رسد تا دفعهٔ بعد درست‌تر بنویسد.", 422, { need_reason: true });
  const text = String((b && b.text) || "").trim().slice(0, 2900);
  const bundle = p.kind === "final" ? (BUNDLE_ACTS.includes(b && b.bundle) ? b.bundle : text ? "return" : "keep") : null;
  if (bundle === "return" && !text) throw new HttpError("برای «↩️ برگشت» پیامِ خودتان را بنویسید تا تأمین‌کننده بداند چه چیزی را اصلاح کند.", 422, { need_text: true });
  return { reason, text, bundle };
}
