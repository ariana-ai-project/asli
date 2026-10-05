/**
 * «حالتِ صوت» در بات مکاتبات (درخواست کاربر، مهر ۱۴۰۵) — ابزارِ تبدیلِ ویس به متن، جدا از sp-voice.js (پیامِ صوتیِ
 * تأمین‌کننده در گفت‌وگو با کارشناس).
 *
 * ورود: در صفحهٔ ورودِ تأمین‌کننده (لینکِ پیامک ← «رمز ۶ رقمی را بفرستید») به‌جای رمزِ پیامک، رمزِ ثابتِ VOICE_PASS.
 * VOICE_PASS راز است (wrangler secret put VOICE_PASS)، نه در کد؛ مخزن عمومی است. گفت‌وگو هویتِ تأمین‌کننده نمی‌گیرد و
 * «حالتِ صوت» می‌شود (sp_tg.role = 'v'). رمزِ اشتباه همان رمزِ اشتباهِ تأمین‌کننده است (C.login: پنج بار ← قفلِ همان
 * شماره)، پس رمزِ چهاررقمی را نمی‌شود حدس زد.
 *
 *   هر ویس ← انبار (فقط تا ElevenLabs از لینکِ امضاشده برش دارد؛ بعد پاک) ← ElevenLabs ← متنِ کامل در یک یا چند پیام
 *   ← «ذخیره شود؟»
 *   بله ← متن از سوابقِ خودِ ElevenLabs (GET transcripts/:id) خوانده و در voice_notes ذخیره می‌شود.
 *   نه  ← متن از ElevenLabs پاک می‌شود (DELETE transcripts/:id)، و پیام‌های متن و خودِ ویس از این گفت‌وگو هم؛ هیچ‌جا نمی‌ماند.
 * تا پاسخ، متن در پایگاهِ ما نیست: flow فقط شناسهٔ ElevenLabs و شمارهٔ پیام‌ها را دارد.
 *
 * تبدیل در همان درخواستِ وبهوک انجام می‌شود؛ تکرارِ همان آپدیت از تلگرام (اگر پاسخ دیر شد) با شمارهٔ پیام کنار می‌رود.
 */
import { esc } from "./telegram.js";
import { storage, storageKey, MAX_BYTES } from "./storage.js";
import { transcribe, getTranscript, deleteTranscript } from "./letter.js";
import * as P from "./sp-push.js";

const now = () => Date.now();
const T = (v) => String(v == null ? "" : v).trim();
const FA = "۰۱۲۳۴۵۶۷۸۹", AR = "٠١٢٣٤٥٦٧٨٩";
const latin = (s) => String(s).replace(/[۰-۹]/g, (d) => FA.indexOf(d)).replace(/[٠-٩]/g, (d) => AR.indexOf(d));
const { fa } = P;

export const VOICE_EXIT = "🚪 خروج از حالت صوت";
/* هر ویس: تبدیل در همان درخواستِ وبهوک است و ویسِ خیلی بلند از زمانِ انتظارِ تلگرام می‌گذرد */
export const MAX_SECS = 30 * 60;
/* روزانهٔ هر گفت‌وگو — سقفِ هزینه (ElevenLabs، Scribe v2: حدود ۰٫۲۲ دلار در ساعت) */
export const DAY_SECS = 180 * 60;
const CHUNK = 3500;                       /* نویسهٔ هر پیام — تلگرام ۴۰۹۶ جا دارد */
const BUSY_MS = 3 * 60000;

export const isVoicePass = (env, text) => !!T(env.VOICE_PASS) && latin(T(text)) === latin(T(env.VOICE_PASS));

const KB = { keyboard: [[{ text: VOICE_EXIT }]], is_persistent: true, resize_keyboard: true };
const ASK_KB = [[{ text: "✅ بله، ذخیره شود", callback_data: "vo:y" }], [{ text: "🗑 نه، همه‌جا پاک شود", callback_data: "vo:n" }]];
/* روزِ تهران (UTC+3:30) برای سقفِ روزانه */
const today = () => new Date(now() + 3.5 * 3600000).toISOString().slice(0, 10);
const dur = (s) => { const x = Math.round(Number(s) || 0); return x < 60 ? `${fa(x)} ثانیه` : `${fa(Math.floor(x / 60))} دقیقه${x % 60 ? ` و ${fa(x % 60)} ثانیه` : ""}`; };

/** متنِ بلند در چند پیام، بریده روی فاصله */
export function chunks(s, n = CHUNK) {
  const out = [];
  let rest = T(s);
  while (rest.length > n) {
    let cut = rest.lastIndexOf(" ", n);
    if (cut < n * 0.6) cut = n;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** ورود به حالتِ صوت — از صفحهٔ ورودِ تأمین‌کننده (sp-bot.js:pendingPass) */
export async function enterVoice(env, row) {
  const f = P.flowOf(row) || {};
  /* /start وسطِ «ذخیره شود؟»: متنِ منتظر (و شناسه‌اش در ElevenLabs) گم نشود */
  if (row.role === "v" && f.step === "ask") return askAgain(env, row);
  row.role = "v"; row._dirty = true;
  P.setFlow(row, { step: "voice", day: today(), used: f.day === today() ? f.used || 0 : 0 });
  await P.send(env, row, "🎙 <b>حالتِ صوت</b>\n\nیک ویس بفرستید؛ متنِ کاملش را همین‌جا می‌فرستم و بعد می‌پرسم ذخیره شود یا نه.\n"
    + `<i>هر ویس تا ${fa(MAX_SECS / 60)} دقیقه، هر روز تا ${fa(DAY_SECS / 60)} دقیقه. خروج: «${VOICE_EXIT}».</i>`, KB);
  return { ok: true };
}

const askAgain = (env, row) => P.send(env, row, "اول دربارهٔ متنِ قبلی بگویید: ذخیره شود؟", ASK_KB).then(() => ({ ok: true }));

/** پیام در حالتِ صوت. exit: بیرون رفتن (sp-bot.js — نقشِ قبلی یا پاک کردنِ ردیف) */
export async function voiceMessage(env, row, msg, text, exit) {
  const f = { ...(P.flowOf(row) || {}) };
  /* بیرون رفتن، مگر متنی منتظرِ «ذخیره شود؟» است — اول همان تصمیم */
  if (text === VOICE_EXIT || /^\/cancel$|^انصراف$/.test(text)) return f.step === "ask" ? askAgain(env, row) : exit();
  if (f.day !== today()) { f.day = today(); f.used = 0; }
  const v = msg.voice || msg.audio;
  /* تکرارِ همین آپدیت از تلگرام (پاسخِ قبلی دیر رسید): کنار می‌رود */
  if (v && (f.done === msg.message_id || (f.step === "busy" && f.vmid === msg.message_id))) return { ok: true };
  if (f.step === "ask") return askAgain(env, row);
  if (!v) { await P.send(env, row, "🎙 یک ویس بفرستید.", KB); return { ok: true }; }
  if (f.step === "busy" && now() - (f.at || 0) < BUSY_MS) { await P.send(env, row, "⏳ ویسِ قبلی هنوز در حالِ تبدیل است؛ چند لحظه صبر کنید."); return { ok: true }; }
  const secs = Number(v.duration) || 0;
  const no = (t) => P.send(env, row, t, KB).then(() => ({ ok: true }));
  if (secs > MAX_SECS) return no(`این ویس ${dur(secs)} است؛ هر ویس حداکثر ${fa(MAX_SECS / 60)} دقیقه. کوتاه‌ترش کنید یا چند تکه بفرستید.`);
  if (v.file_size > MAX_BYTES) return no("حجمِ این ویس بیش از ۲۰ مگابایت است (سقفِ دانلودِ فایل برای بات‌های تلگرام).");
  if ((f.used || 0) + secs > DAY_SECS) return no(`سقفِ امروز (${fa(DAY_SECS / 60)} دقیقه) پر شده؛ ${dur((f.used || 0))} تبدیل شده است.`);
  if (!T(env.ELEVENLABS_API_KEY)) return no("کلیدِ ElevenLabs روی سامانه ست نشده است.");
  const store = storage(env);
  if (!store || !store.signedUrl) return no("انبارِ فایل برای صوت آماده نیست.");

  /* پیش از کارِ طولانی: اگر تلگرام همین آپدیت را دوباره فرستاد، کنار می‌رود */
  P.setFlow(row, { ...f, step: "busy", vmid: msg.message_id, at: now() });
  await P.save(env, row);
  const api = P.spApi(env);
  const wait = await P.send(env, row, "⏳ در حالِ گوش دادن…").catch(() => null);
  const key = storageKey("voice", v.mime_type === "audio/mpeg" ? "voice.mp3" : "voice.ogg");
  let out = null, err = null;
  try {
    const file = await api.getFile(v.file_id);
    const src = await fetch(api.fileUrl(file.file_path));
    if (!src.ok || !src.body) throw new Error("دانلودِ ویس از تلگرام نشد.");
    await store.put(key, src.body, { contentType: v.mime_type || "audio/ogg", size: v.file_size || undefined });
    out = await transcribe(env, await store.signedUrl(key, 900));
  } catch (e) { err = e; }
  finally { await store.remove(key).catch(() => {}); }
  if (wait) await api.call("deleteMessage", { chat_id: row.chat, message_id: wait.message_id }).catch(() => {});

  const back = { step: "voice", day: f.day, used: f.used || 0, done: msg.message_id };
  if (err) { P.setFlow(row, back); return no(`⚠️ ${esc(err.message)}\nدوباره بفرستید.`); }
  if (!out.text) {
    if (out.id) await deleteTranscript(env, out.id).catch(() => {});
    P.setFlow(row, back);
    return no("چیزی شنیده نشد؛ دوباره و کمی واضح‌تر بفرستید.");
  }
  const s = Number(out.secs) || secs;
  const parts = chunks(out.text);
  const mids = [];
  for (let i = 0; i < parts.length; i++) {
    const head = i ? "" : `📝 <b>متنِ کامل</b> — ${fa(out.text.length)} نویسه، ${dur(s)}${parts.length > 1 ? ` · ${fa(parts.length)} پیام` : ""}\n\n`;
    const m = await P.send(env, row, `${head}${esc(parts[i])}`).catch(() => null);
    if (m) mids.push(m.message_id);
  }
  const ask = await P.send(env, row, "این متن ذخیره شود؟", ASK_KB).catch(() => null);
  /* متن فقط اگر ElevenLabs شناسه نداد در flow می‌ماند (تا «بله» بی آن ممکن باشد) و با پاسخ پاک می‌شود */
  P.setFlow(row, { step: "ask", day: f.day, used: (f.used || 0) + Math.round(s), done: msg.message_id, vmid: msg.message_id, uid: msg.from && msg.from.id,
    tid: out.id || null, ...(out.id ? {} : { text: out.text }), secs: s, chars: out.text.length, model: out.model || null, mids, ask: ask && ask.message_id });
  return { ok: true };
}

/** «بله» یا «نه» روی «ذخیره شود؟» */
export async function voiceCallback(env, row, choice, ack) {
  const f = P.flowOf(row) || {};
  if (f.step !== "ask") { await ack("این متن دیگر منتظرِ تصمیم نیست.", true); return { ok: true }; }
  const api = P.spApi(env);
  const next = { step: "voice", day: f.day, used: f.used || 0, done: f.done };
  if (choice === "y") {
    let text = f.text || "";
    if (!text) {
      try { text = await getTranscript(env, f.tid); }
      catch (e) { await ack(String(e.message).slice(0, 180), true); return { ok: true }; }
    }
    const r = await env.DB.prepare("INSERT INTO voice_notes (chat,tg_user,text,chars,secs,el_id,model,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind(String(row.chat), f.uid ? String(f.uid) : null, text, text.length, f.secs || null, f.tid || null, f.model || null, now()).run();
    await ack("ذخیره شد");
    if (f.ask) await api.editMessageText(row.chat, f.ask, `✅ ذخیره شد — شمارهٔ ${fa(r.meta.last_row_id)} (${fa(text.length)} نویسه).`, []).catch(() => {});
    P.setFlow(row, next);
    await P.send(env, row, "🎙 ویسِ بعدی را بفرستید.", KB);
    return { ok: true };
  }
  if (choice !== "n") { await ack(); return { ok: true }; }
  let why = "";
  if (f.tid) { try { await deleteTranscript(env, f.tid); } catch (e) { why = e.message; } }
  for (const id of [...(f.mids || []), f.ask, f.vmid].filter(Boolean)) await api.call("deleteMessage", { chat_id: row.chat, message_id: id }).catch(() => {});
  await ack("پاک شد");
  P.setFlow(row, next);
  await P.send(env, row, `${why ? `🗑 پیام‌ها پاک شد و چیزی ذخیره نشد؛ ولی ${esc(why)}` : f.tid ? "🗑 متن از ElevenLabs و از این گفت‌وگو پاک شد؛ هیچ‌جا ذخیره نشد."
    : "🗑 متن از این گفت‌وگو پاک شد و هیچ‌جا ذخیره نشد."}\n\n🎙 ویسِ بعدی را بفرستید.`, KB);
  return { ok: true };
}
