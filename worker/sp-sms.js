/**
 * پیامک‌های پنل تأمین‌کننده — «ارسال» کارشناس، دعوتِ کارشناس هوشمند و «ارسال رمز»، با یک قاعده (مهر ۱۴۰۵):
 *
 *   • درگاه پیامک (TextBee، worker/sms.js) وصل است و شماره واقعی است ← پیامکِ واقعی به گوشیِ تأمین‌کننده. کارشناس فقط
 *     خبرِ «فرستاده شد» را می‌گیرد، بی رمز: رمز کلیدِ ورودِ تأمین‌کننده است و فقط به گوشیِ خودش می‌رود.
 *   • درگاه وصل نیست، پیامک نرفت (سقف پلن، گوشیِ خاموش…) یا تأمین‌کنندهٔ فرضی ← همان شبیه‌سازیِ قبلی: متنِ کامل (با
 *     لینک و رمز) در بات مکاتباتِ کارشناس؛ اگر هنوز وصلش نکرده، لینکِ اتصال در بات کارشناسان و پیامک تا اتصال نگه
 *     داشته می‌شود (sp_links.payload).
 *   • hold — کارشناس هوشمند در حالت آزمایشی برای تأمین‌کنندهٔ واقعی: هیچ‌جا نمی‌رود؛ فقط ثبت می‌شود.
 * نتیجه روی همان ردیفِ sp_sms می‌نشیند (via: textbee | sim | hold، status، ref، error).
 */
import { telegram, esc } from "./telegram.js";
import * as C from "./sp-core.js";
import * as P from "./sp-push.js";
import { smsReady, sendSms } from "./sms.js";

/**
 * s: {smsId, expertId, expertChat, threadId, supplier, to, label, text, panel, bot, demo, hold, kind: "rfq" | "pass"}
 * opts.sim: "push" (پیش‌فرض) — اگر پیامک نرفت، شبیه‌سازی در بات مکاتبات؛ "none" — صدازننده خودش متن را نشان می‌دهد.
 * opts.pointer: اگر کارشناس بات مکاتبات را وصل نکرده، بات کارشناسان لینکِ اتصال را بدهد (پیش‌فرض: بله).
 * خروجی {via, sent, error, pushed, where}
 */
export async function deliverSms(env, s, opts = {}) {
  const sim = opts.sim || "push";
  let via = "sim", status = "sim", ref = null, error = null;
  if (s.hold) { via = "hold"; status = "held"; }
  else if (!s.demo && s.to !== C.DEMO.phone && smsReady(env)) {
    try { const r = await sendSms(env, s.to, s.text); via = "textbee"; status = "queued"; ref = r.ref; }
    catch (e) { error = String((e && e.message) || e).slice(0, 300); status = "failed"; }
  }
  let pushed = 0, where = "";
  if (via === "sim" && sim === "push") ({ pushed, where } = await simulate(env, s, error, opts.pointer !== false));
  if (s.smsId) {
    await env.DB.prepare("UPDATE sp_sms SET via=?, status=?, ref=?, error=? WHERE id=?").bind(via, status, ref, error, s.smsId).run()
      .catch((e) => console.error("sp_sms status", e && e.message));
  }
  return { via, sent: via === "textbee", error, pushed, where };
}

/** شبیه‌سازی: متنِ پیامک در بات مکاتباتِ کارشناس؛ اگر وصل نیست، اشاره و لینکِ اتصال در بات کارشناسان */
async function simulate(env, s, error, pointer) {
  if (!s.expertId) return { pushed: 0, where: "" };
  const sms = { thread_id: s.threadId || null, supplier: s.supplier, to: s.to, label: s.label, text: s.text, panel: s.panel, bot: s.bot, error };
  const pushed = await P.deliverSms(env, s.expertId, sms).catch(() => 0);
  if (pushed) return { pushed, where: "گفت‌وگوی کارشناس در بات مکاتبات" };
  if (!pointer || !s.expertChat || !env.TG_BOT_TOKEN) return { pushed: 0, where: "" };
  const link = await C.expertLink(env, s.expertId, sms).catch(() => null);
  const what = s.kind === "pass" ? `«${esc(s.supplier)}» رمز تازه خواست.` : `استعلام برای «${esc(s.supplier)}» رفت.`;
  await telegram(env).sendMessage(s.expertChat,
    `📱 ${what} پیامکِ ${error ? "شبیه‌سازی‌شده‌اش (پیامک واقعی نرفت)" : "شبیه‌سازی‌شده‌اش"} در <b>بات مکاتبات</b> است؛ یک بار وصلش کنید تا آن‌جا ببینید.`,
    link && link.url ? [[{ text: "💬 بات مکاتبات", url: link.url }]] : null).catch((e) => console.error("sim sms pointer", e && e.message));
  return { pushed: 0, where: "بات مکاتبات (بعد از اتصالِ کارشناس)" };
}

/** «ارسال رمز به پیامک» — صفحهٔ ورود یا بات. r خروجیِ C.resendPassword است */
export function deliverPass(env, r) {
  return deliverSms(env, { smsId: r.smsId, expertId: r.expertId, expertChat: r.expertChat, threadId: r.threadId, supplier: r.supplier,
    to: r.to, label: r.label, text: r.text, panel: r.panel, bot: r.bot, demo: r.demo, kind: "pass" });
}

/** متنِ کوتاهِ وضعیتِ پیامک برای کارشناس — بی رمز */
export function smsNote(d, masked) {
  if (d.sent) return `📱 پیامک برای ${masked} فرستاده شد.`;
  if (d.via === "hold") return `📱 پیامک برای ${masked} نرفت (حالت آزمایشی؛ فقط ثبت شد).`;
  return d.error ? `⚠️ پیامکِ واقعی برای ${masked} نرفت: ${d.error}` : `📱 پیامک فعلاً خاموش است (شبیه‌سازی).`;
}
