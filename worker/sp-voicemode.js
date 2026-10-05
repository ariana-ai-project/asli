/**
 * «حالتِ صوت» در بات مکاتبات (درخواست کاربر، مهر ۱۴۰۵) — ابزارِ تبدیلِ ویس به متن، جدا از sp-voice.js (پیامِ صوتیِ
 * تأمین‌کننده در گفت‌وگو با کارشناس). هستهٔ تبدیل، صف و رمز در voice-core.js است (مشترک با بات ویس، voice-bot.js).
 *
 * ورود: در صفحهٔ ورودِ تأمین‌کننده (لینکِ پیامک ← «رمز ۶ رقمی را بفرستید») به‌جای رمزِ پیامک، رمزِ حالتِ صوت — اول همان
 * VOICE_PASS (رازِ Worker، نه در کد؛ مخزن عمومی است). گفت‌وگو هویتِ تأمین‌کننده نمی‌گیرد و «حالتِ صوت» می‌شود
 * (sp_tg.role = 'v'). رمزِ اشتباه همان رمزِ اشتباهِ تأمین‌کننده است (C.login: پنج بار ← قفلِ همان شماره).
 *
 *   هر ویس ← ElevenLabs ← متنِ کامل در یک یا چند پیام ← «پاک شود؟»
 *   بله ← سابقه‌اش از ElevenLabs پاک (و پاک شدنش سنجیده) می‌شود و پیام‌های متن و خودِ ویس از این گفت‌وگو هم.
 *   نه  ← همه‌چیز همان‌طور می‌ماند.
 * هیچ متنی در پایگاهِ ما ذخیره نمی‌شود؛ صف (voice_jobs) تا پاسخ فقط شناسهٔ ElevenLabs و شمارهٔ پیام‌ها را دارد.
 * سقفِ زمانی ندارد (فقط ۲۰ مگابایتِ تلگرام). «🔑 تغییر رمز» روی همهٔ پیام‌ها؛ رمزِ تازه جای قبلی را می‌گیرد و گفت‌وگوهای
 * دیگری که با رمزِ قبلی وارد شده بودند بیرون می‌روند.
 */
import * as P from "./sp-push.js";
import * as VC from "./voice-core.js";

const parse =(s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const { fa, dur } = VC;

export const VOICE_EXIT = "🚪 خروج از حالت صوت";
export const VOICE_PW = "🔑 تغییر رمز";
const KB = { keyboard: [[{ text: VOICE_PW }, { text: VOICE_EXIT }]], is_persistent: true, resize_keyboard: true };
const PW_BTN = [{ text: VOICE_PW, callback_data: "vo:pw" }];
/** دکمهٔ «تغییر رمز» روی هر پیامِ حالتِ صوت (خواستِ کاربر) */
const PWK = [PW_BTN];
const PW_CANCEL = [[{ text: "✖️ انصراف", callback_data: "vo:px" }], PW_BTN];
const askKb = (id) => [[{ text: "🗑 بله، پاک شود", callback_data: `vo:y:${id}` }, { text: "👌 نه، بماند", callback_data: `vo:n:${id}` }], PW_BTN];

/** رمزِ حالتِ صوت در صفحهٔ ورودِ تأمین‌کننده (sp-bot.js:pendingPass): نسخهٔ رمز اگر درست بود، وگرنه null */
export const voicePassVer = (env, text) => VC.checkPass(env, "sp", text);
const curVer = async (env) => VC.passVer(await VC.passRec(env, "sp"));

/** ورود به حالتِ صوت — ver: نسخهٔ رمزی که با آن وارد شد */
export async function enterVoice(env, row, ver) {
  row.role = "v"; row._dirty = true;
  P.setFlow(row, { step: "voice", pv: ver || 0 });
  await P.send(env, row, "🎙 <b>حالتِ صوت</b>\n\nیک ویس بفرستید؛ متنِ کاملش همین‌جا می‌آید (اگر بلند باشد در چند پیام) و بعد می‌پرسم پاک شود یا نه — "
    + "«بله» یعنی از همین گفت‌وگو و از سوابقِ ElevenLabs.\n"
    + "<i>سقفِ زمانی ندارد؛ فقط تلگرام فایلِ بیش از ۲۰ مگابایت را به بات نمی‌دهد. «🔑 تغییر رمز» رمزِ همین حالت را عوض می‌کند.</i>", KB);
  return { ok: true };
}

/**
 * هر پیام در حالتِ صوت (sp-bot.js). st: /start بود؛ exit(why): بیرون رفتن — نقشِ قبلی یا پاک کردنِ ردیف.
 * رمز که جای دیگری عوض شده باشد، این گفت‌وگو اول بیرون می‌رود.
 */
export async function voiceUpdate(env, row, msg, text, st, exit) {
  const f = { ...(P.flowOf(row) || {}) };
  if ((Number(f.pv) || 0) !== (await curVer(env))) return exit("🔒 رمزِ حالتِ صوت عوض شده است. برای ادامه، لینکِ ورود را دوباره باز کنید و رمزِ تازه را بفرستید.");
  if (st) return enterVoice(env, row, f.pv);
  if (text === VOICE_EXIT) return exit();
  const inPw = f.step === "pw1" || f.step === "pw2";
  if (/^\/cancel$|^انصراف$/.test(text)) return inPw ? pwCancel(env, row) : exit();
  if (text === VOICE_PW) return pwStart(env, row, f);
  const v = VC.voiceOf(msg);
  if (!v) {
    if (inPw) return pwStep(env, row, f, msg, text);
    await P.send(env, row, "🎙 یک ویس بفرستید.", PWK);
    return { ok: true };
  }
  /* ویس وسطِ تغییرِ رمز: همان ویس؛ تغییرِ رمز کنار می‌رود */
  if (inPw) P.setFlow(row, { step: "voice", pv: f.pv || 0 });
  return VC.takeVoice(env, "sp", row.chat, msg, v, handler(env));
}

/** تحویلِ متن در این بات — برای takeVoice (وبهوک) و Cronِ ویس */
export const handler = (env) => ({ api: P.spApi(env), kb: PWK, deliver });

async function deliver(env, job, out, api) {
  const head = `📝 <b>متنِ کاملِ ویس</b> — ${fa(out.text.length)} نویسه، ${dur(out.secs || job.secs)}`;
  const mids = await VC.sendText(api, job.chat, out.text, { head, kb: PWK, reply: job.mid });
  const ask = await VC.sendRetry(api, job.chat, "🗑 <b>این متن پاک شود؟</b>\n<i>«بله» یعنی از همین گفت‌وگو و از سوابقِ ElevenLabs؛ «نه» یعنی همه‌جا بماند.</i>", askKb(job.id)).catch(() => null);
  await env.DB.prepare("UPDATE voice_jobs SET state='ask', el=?, mids_json=?, file_id=NULL, lock_until=NULL, smid=NULL, updated_at=? WHERE id=?")
    .bind(out.id || null, JSON.stringify([...mids, ask && ask.message_id].filter(Boolean)), Date.now(), job.id).run();
}

/** «بله» یا «نه» روی «پاک شود؟» — به حالتِ صوت وابسته نیست (بعد از خروج هم پاسخ می‌گیرد) */
export async function askCallback(env, chat, choice, id, ack) {
  const api = P.spApi(env);
  const job = id ? await VC.jobOf(env, "sp", chat, id) : null;
  if (!job || job.state !== "ask") { await ack("این متن دیگر منتظرِ تصمیم نیست.", true); return { ok: true }; }
  const mids = parse(job.mids_json, []);
  const askMid = mids[mids.length - 1];
  if (choice === "n") {
    await VC.dropJob(env, job.id);
    await ack("می‌ماند");
    if (askMid) await api.editMessageText(chat, askMid, "👌 ماند — متن در همین گفت‌وگو و در سوابقِ ElevenLabs هست.", PWK).catch(() => {});
    return { ok: true };
  }
  if (choice !== "y") { await ack(); return { ok: true }; }
  let note = "";
  if (job.el) {
    const w = await VC.wipe(env, job.el);
    /* از ElevenLabs پاک نشد: چیزی از گفت‌وگو هم پاک نمی‌شود تا «بله» دوباره زده شود */
    if (!w.ok) { await ack(`از ElevenLabs پاک نشد: ${String(w.why).slice(0, 150)} — دوباره بزنید.`, true); return { ok: true }; }
    note = w.verified ? "از این گفت‌وگو و از ElevenLabs (و تأیید شد که آن‌جا دیگر نیست)" : "از این گفت‌وگو و از ElevenLabs";
  } else note = "از این گفت‌وگو (ElevenLabs برای این ویس شناسه‌ای نداده بود)";
  await VC.delMsgs(api, chat, [...mids, job.mid]);
  await VC.dropJob(env, job.id);
  await ack("پاک شد");
  await VC.sendRetry(api, chat, `🗑 پاک شد — ${note}.\n🎙 ویسِ بعدی را بفرستید.`, PWK).catch(() => {});
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* تغییرِ رمز                                                             */
/* ------------------------------------------------------------------ */
async function pwStart(env, row, f) {
  P.setFlow(row, { step: "pw1", pv: f.pv || 0 });
  await P.send(env, row, "🔑 <b>تغییر رمزِ حالتِ صوت</b>\n\nرمزِ تازه را بفرستید (۴ تا ۳۲ نویسه، بی فاصله). پیامِ رمز همان لحظه از گفت‌وگو پاک می‌شود.\n"
    + "<i>رمزِ تازه جای رمزِ فعلی را می‌گیرد؛ رمزِ فعلی دیگر کار نمی‌کند.</i>", PW_CANCEL);
  return { ok: true };
}
async function pwCancel(env, row) {
  const f = P.flowOf(row) || {};
  P.setFlow(row, { step: "voice", pv: f.pv || 0 });
  await P.send(env, row, "باشد، رمز همان قبلی ماند.\n🎙 ویس بفرستید.", PWK);
  return { ok: true };
}
async function pwStep(env, row, f, msg, text) {
  /* رمز در گفت‌وگو نمی‌ماند */
  await P.spApi(env).call("deleteMessage", { chat_id: row.chat, message_id: msg.message_id }).catch(() => {});
  if (f.step === "pw1") {
    const bad = VC.passError(text);
    if (bad) { await P.send(env, row, `${bad} دوباره بفرستید.`, PW_CANCEL); return { ok: true }; }
    P.setFlow(row, { step: "pw2", pv: f.pv || 0, pw: await VC.pwDraft(text) });
    await P.send(env, row, "یک بار دیگر همان رمزِ تازه را بفرستید.", PW_CANCEL);
    return { ok: true };
  }
  if (!(await VC.pwMatch(f.pw, text))) {
    P.setFlow(row, { step: "pw1", pv: f.pv || 0 });
    await P.send(env, row, "دو رمز یکی نبود. رمزِ تازه را از اول بفرستید.", PW_CANCEL);
    return { ok: true };
  }
  const ver = await VC.setPass(env, "sp", text);
  P.setFlow(row, { step: "voice", pv: ver });
  await P.send(env, row, "✅ <b>رمزِ حالتِ صوت عوض شد.</b>\nاز این به بعد فقط رمزِ تازه کار می‌کند؛ رمزِ قبلی دیگر نه.\n🎙 ویسِ بعدی را بفرستید.", PWK);
  return { ok: true };
}

/** دکمه‌های vo:* — pw/px به حالتِ صوت نیاز دارند؛ y/n:<ردیف> نه */
export async function voiceCallback(env, row, chat, parts, ack, exit) {
  const [, choice, id] = parts;
  if (choice === "y" || choice === "n") {
    if (!id) { await ack("این دکمه مالِ نسخهٔ قبلیِ حالتِ صوت است و دیگر کاری نمی‌کند.", true); return { ok: true }; }
    return askCallback(env, chat, choice, parseInt(id, 10) || 0, ack);
  }
  if (!row || row.role !== "v") { await ack("حالتِ صوت بسته است؛ اول با لینک و رمز وارد شوید.", true); return { ok: true }; }
  const f = P.flowOf(row) || {};
  if ((Number(f.pv) || 0) !== (await curVer(env))) { await ack(); return exit("🔒 رمزِ حالتِ صوت عوض شده است. برای ادامه، لینکِ ورود را دوباره باز کنید و رمزِ تازه را بفرستید."); }
  await ack();
  if (choice === "pw") return pwStart(env, row, f);
  if (choice === "px") return pwCancel(env, row);
  return { ok: true };
}
