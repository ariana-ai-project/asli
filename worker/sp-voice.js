/**
 * پیامِ صوتیِ تأمین‌کننده — یک راه برای پنل وب و بات مکاتبات (مهر ۱۴۰۵)
 *
 * صدا ← انبار (پخش برای کارشناس) ← ElevenLabs (worker/stt.js) ← پیامِ «voice» با متنِ پیاده‌شده ← پخش به کارشناس
 * (تلگرام) ← گامِ مذاکرهٔ کارشناس هوشمند (aiKick) با همان متن. تأمین‌کننده متن را هیچ‌جا نمی‌بیند (sp-core.js:msgFor).
 */
import { HttpError } from "./http.js";
import { storage, storageKey } from "./storage.js";
import * as C from "./sp-core.js";
import * as P from "./sp-push.js";
import { aiKick } from "./ai-agent.js";
import { transcribe, audioExt } from "./stt.js";

/** سقفِ صدا: ۱۰ مگابایت (چند دقیقه گفتار با Opus) */
export const VOICE_MAX = 10 * 1048576;
const T = (v) => String(v == null ? "" : v).trim();

/** later(fn): کارِ بعد از پاسخ (waitUntil در Worker؛ همان‌جا در تست) */
export async function ingestVoice(env, ctx, th, { bytes, mime, dur, tg }, later) {
  const store = storage(env);
  if (!store) throw new HttpError("انبار فایل هنوز به سامانه وصل نیست.", 503);
  if (!bytes || !bytes.byteLength) throw new HttpError("صدایی نرسید.");
  if (bytes.byteLength > VOICE_MAX) throw new HttpError("پیام صوتی بیش از حد بلند است (حداکثر ۱۰ مگابایت).", 413);
  const type = T(mime).split(";")[0] || "audio/webm";
  const key = storageKey(th.assignment_id, `sp-voice.${audioExt(type)}`);
  /* انبار و تبدیل به متن هم‌زمان؛ بایت‌ها یک بار خوانده شده‌اند */
  const [, stt] = await Promise.all([store.put(key, bytes, { contentType: type, size: bytes.byteLength }), transcribe(env, bytes, type)]);
  if (!stt.ok) console.error("sp voice stt", stt.error);
  const r = await C.postVoice(env, th, "s", { key, mime: type, size: bytes.byteLength, dur: dur || stt.dur || null, text: stt.ok ? stt.text : "", lang: stt.lang, error: stt.ok ? null : stt.error, tg });
  await later(() => P.pushMsgs(env, th, r.msgs));
  aiKick(env, ctx, th.id);
  return r;
}
