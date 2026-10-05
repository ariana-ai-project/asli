/**
 * بات ویس (TG_VB_BOT_TOKEN — درخواست کاربر، مهر ۱۴۰۵): ویس به متن، و بس.
 *
 *   /start ← رمزِ ورود (اول همان VOICE_PASS) ← منوی ثابت: «🔑 تغییر رمز» و «🚪 خروج».
 *   هر ویس ← ElevenLabs ← متنِ کامل در همین گفت‌وگو (اگر بلند است در چند پیام) ← سابقهٔ همان ویس در ElevenLabs بی‌درنگ پاک
 *   و پاک شدنش سنجیده می‌شود؛ ویس و متن فقط در تلگرام می‌مانند ← منتظرِ ویسِ بعدی.
 *
 * سقفِ زمانی ندارد (فقط ۲۰ مگابایتِ تلگرام). هستهٔ تبدیل، صف و رمز در voice-core.js است — همان که حالتِ صوتِ بات مکاتبات
 * (sp-voicemode.js) دارد؛ رمزِ این بات جداست (عوض کردنِ یکی، دیگری را عوض نمی‌کند).
 * گفت‌وگوها در vb_chats: مرحله (pass ورود | voice | pw1 و pw2 تغییرِ رمز)، نسخهٔ رمزی که با آن وارد شد (pv) و قفلِ ورود
 * (پنج رمزِ غلط ← پانزده دقیقه). رمز که عوض شود، هر گفت‌وگوی دیگری که با رمزِ قبلی وارد شده بود باید دوباره وارد شود.
 */
import { telegram, esc } from "./telegram.js";
import { siteOrigin } from "./sp-core.js";
import * as VC from "./voice-core.js";

const now = () => Date.now();
const T = (v) => String(v == null ? "" : v).trim();
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const { fa, dur } = VC;

export const vbApi = (env) => telegram(env, "vb");
export const MENU = { pw: "🔑 تغییر رمز", out: "🚪 خروج" };
const KB = { keyboard: [[{ text: MENU.pw }, { text: MENU.out }]], is_persistent: true, resize_keyboard: true };
const NO_KB = { remove_keyboard: true };
const MAX_FAILS = 5, LOCK_MS = 15 * 60000;
const WELCOME = "🎙 <b>تبدیلِ ویس به متن</b>\n\nیک ویس بفرستید؛ متنِ کاملش همین‌جا می‌آید (اگر بلند باشد در چند پیام) و سابقه‌اش در ElevenLabs "
  + "همان لحظه پاک می‌شود — ویس و متن فقط در همین گفت‌وگو می‌مانند.\n<i>سقفِ زمانی ندارد؛ فقط تلگرام فایلِ بیش از ۲۰ مگابایت را به بات نمی‌دهد.</i>";

/* ------------------------------------------------------------------ */
/* وبهوک                                                                 */
/* ------------------------------------------------------------------ */
async function settingJson(env, key) {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(key).first();
  return r ? parse(r.value, null) : null;
}
/** نشانِ توکن (۱۲ نویسهٔ اولِ هشش، نه خودِ توکن) — توکنِ تازه (بعد از /revoke) یعنی ثبتِ دوبارهٔ وبهوک */
async function tokenMark(token) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(token)));
  return [...new Uint8Array(d)].slice(0, 6).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * وبهوکِ این بات روی دامنهٔ سایت؛ نشانی، نام کاربری و نشانِ توکن در settings.vbBot. خودکار از Cron (worker.js) — بعد از
 * ست شدنِ راز کار دستی لازم نیست — و `force` از /tg/setup مدیر.
 */
export async function ensureVbWebhook(env, origin, force) {
  if (!env.TG_VB_BOT_TOKEN || !env.TG_WEBHOOK_SECRET) return { ok: false, reason: "TG_VB_BOT_TOKEN یا TG_WEBHOOK_SECRET ست نشده است." };
  const want = `${siteOrigin(env, origin)}/tamin-poshtibani/api/tg/vb-webhook`;
  const mark = await tokenMark(env.TG_VB_BOT_TOKEN);
  const cur = await settingJson(env, "vbBot");
  if (!force && cur && cur.url === want && cur.mark === mark && cur.username) return { ok: true, cached: true, ...cur };
  const api = vbApi(env);
  await api.setWebhook(want, env.TG_WEBHOOK_SECRET);
  const me = await api.getMe();
  await api.call("setMyCommands", { commands: [{ command: "start", description: "شروع / ورود" }, { command: "cancel", description: "انصراف از تغییرِ رمز" }] }).catch(() => {});
  const v = { url: want, username: me.username, id: me.id, mark, at: now() };
  await env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('vbBot',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
    .bind(JSON.stringify(v), now()).run();
  return { ok: true, ...v };
}

/* ------------------------------------------------------------------ */
/* گفت‌وگو                                                                */
/* ------------------------------------------------------------------ */
const rowOf = (env, chat) => env.DB.prepare("SELECT * FROM vb_chats WHERE chat=?").bind(String(chat)).first();
/** وضعیتِ گفت‌وگو، روی آنچه بود */
async function save(env, chat, row, patch) {
  const r = {
    uid: row ? row.uid : null, step: row ? row.step : "pass", pv: row ? row.pv : null, tmp: row ? parse(row.tmp_json, null) : null,
    fails: row ? row.fails || 0 : 0, lock_until: row ? row.lock_until : null, ...patch,
  };
  await env.DB.prepare(`INSERT INTO vb_chats (chat,uid,step,pv,tmp_json,fails,lock_until,updated_at) VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(chat) DO UPDATE SET uid=excluded.uid, step=excluded.step, pv=excluded.pv, tmp_json=excluded.tmp_json, fails=excluded.fails,
      lock_until=excluded.lock_until, updated_at=excluded.updated_at`)
    .bind(String(chat), r.uid == null ? null : String(r.uid), r.step, r.pv == null ? null : r.pv, r.tmp ? JSON.stringify(r.tmp) : null, r.fails || 0, r.lock_until || null, now()).run();
  return r;
}
const say = (api, chat, text, kb, extra) => VC.sendRetry(api, chat, text, kb, extra).catch(() => null);
const del = (api, chat, mid) => api.call("deleteMessage", { chat_id: chat, message_id: mid }).catch(() => {});

export async function handleVbUpdate(env, u) {
  try {
    if (u.message) return await onMessage(env, u.message);
    if (u.callback_query) { await vbApi(env).answerCallback(u.callback_query.id).catch(() => {}); return { ok: true }; }
    const m = u.my_chat_member;
    if (m && m.chat && ["left", "kicked"].includes(m.new_chat_member && m.new_chat_member.status)) {
      await env.DB.prepare("DELETE FROM vb_chats WHERE chat=?").bind(String(m.chat.id)).run();
    }
  } catch (e) {
    console.error("vb update failed", e && e.message);
  }
  return { ok: true };
}

async function onMessage(env, msg) {
  const chat = msg.chat && msg.chat.id;
  if (!chat || msg.chat.type !== "private") return { ok: true };
  const api = vbApi(env);
  const text = T(msg.text);
  const st = /^\/start(?:\s|$)/.test(text);
  const row = await rowOf(env, chat);
  const ver = VC.passVer(await VC.passRec(env, "vb"));
  const authed = !!row && row.step !== "pass" && row.pv != null && Number(row.pv) === ver;

  if (!authed) {
    /* واردشده بود ولی رمز جای دیگری عوض شد */
    if (row && row.step !== "pass") {
      await save(env, chat, row, { step: "pass", pv: null, tmp: null });
      await say(api, chat, "🔒 رمزِ ورود عوض شده است؛ رمزِ تازه را بفرستید.", NO_KB);
      return { ok: true };
    }
    if (!row || st || !text || text.startsWith("/")) {
      if (!row) await save(env, chat, null, { step: "pass", uid: msg.from && msg.from.id });
      await say(api, chat, `${!row || st ? "🎙 <b>بات تبدیلِ ویس به متن</b>\n\n" : ""}🔐 رمزِ ورود را بفرستید.`, NO_KB);
      return { ok: true };
    }
    return login(env, api, chat, row, msg, text);
  }
  if (st) { await save(env, chat, row, { step: "voice", tmp: null }); await say(api, chat, WELCOME, KB); return { ok: true }; }
  if (text === MENU.out) {
    await save(env, chat, row, { step: "pass", pv: null, tmp: null });
    await say(api, chat, "🚪 بیرون آمدید. برای ورودِ دوباره رمز را بفرستید.", NO_KB);
    return { ok: true };
  }
  const inPw = row.step === "pw1" || row.step === "pw2";
  if (/^\/cancel$|^انصراف$/.test(text)) {
    if (inPw) await save(env, chat, row, { step: "voice", tmp: null });
    await say(api, chat, inPw ? "باشد، رمز همان قبلی ماند.\n🎙 ویس بفرستید." : "🎙 ویس بفرستید.", KB);
    return { ok: true };
  }
  if (text === MENU.pw) {
    await save(env, chat, row, { step: "pw1", tmp: null });
    await say(api, chat, "🔑 <b>تغییر رمزِ ورود</b>\n\nرمزِ تازه را بفرستید (۴ تا ۳۲ نویسه، بی فاصله). پیامِ رمز همان لحظه از گفت‌وگو پاک می‌شود.\n"
      + "<i>رمزِ تازه جای رمزِ فعلی را می‌گیرد؛ رمزِ فعلی دیگر کار نمی‌کند. انصراف: /cancel</i>", KB);
    return { ok: true };
  }
  const v = VC.voiceOf(msg);
  if (!v) {
    if (inPw) return pwStep(env, api, chat, row, msg, text);
    await say(api, chat, "🎙 یک ویس بفرستید.", KB);
    return { ok: true };
  }
  /* ویس وسطِ تغییرِ رمز: همان ویس؛ تغییرِ رمز کنار می‌رود */
  if (inPw) await save(env, chat, row, { step: "voice", tmp: null });
  return VC.takeVoice(env, "vb", chat, msg, v, handler(env));
}

async function login(env, api, chat, row, msg, text) {
  await del(api, chat, msg.message_id);              /* رمز در گفت‌وگو نمی‌ماند */
  if (row.lock_until && row.lock_until > now()) {
    await say(api, chat, `به خاطر رمزهای نادرستِ پشت‌سرهم، ورود تا ${fa(Math.ceil((row.lock_until - now()) / 60000))} دقیقهٔ دیگر بسته است.`, NO_KB);
    return { ok: true };
  }
  const ver = await VC.checkPass(env, "vb", text);
  if (ver === null) {
    const fails = (row.fails || 0) + 1;
    if (fails >= MAX_FAILS) {
      await save(env, chat, row, { fails: 0, lock_until: now() + LOCK_MS });
      await say(api, chat, `رمز نادرست است. ${fa(MAX_FAILS)} بار پشت‌سرهم اشتباه شد؛ ورود ${fa(LOCK_MS / 60000)} دقیقه بسته است.`, NO_KB);
    } else {
      await save(env, chat, row, { fails, lock_until: null });
      await say(api, chat, `رمز نادرست است. ${fa(MAX_FAILS - fails)} بار دیگر فرصت هست.`, NO_KB);
    }
    return { ok: true };
  }
  await save(env, chat, row, { step: "voice", pv: ver, fails: 0, lock_until: null, tmp: null, uid: msg.from ? msg.from.id : row.uid });
  await say(api, chat, `✅ وارد شدید.\n\n${WELCOME}`, KB);
  return { ok: true };
}

async function pwStep(env, api, chat, row, msg, text) {
  await del(api, chat, msg.message_id);              /* رمز در گفت‌وگو نمی‌ماند */
  if (row.step === "pw1") {
    const bad = VC.passError(text);
    if (bad) { await say(api, chat, `${bad} دوباره بفرستید. (انصراف: /cancel)`, KB); return { ok: true }; }
    await save(env, chat, row, { step: "pw2", tmp: await VC.pwDraft(text) });
    await say(api, chat, "یک بار دیگر همان رمزِ تازه را بفرستید.", KB);
    return { ok: true };
  }
  if (!(await VC.pwMatch(parse(row.tmp_json, null), text))) {
    await save(env, chat, row, { step: "pw1", tmp: null });
    await say(api, chat, "دو رمز یکی نبود. رمزِ تازه را از اول بفرستید. (انصراف: /cancel)", KB);
    return { ok: true };
  }
  const ver = await VC.setPass(env, "vb", text);
  await save(env, chat, row, { step: "voice", pv: ver, tmp: null });
  await say(api, chat, "✅ <b>رمزِ ورود عوض شد.</b>\nاز این به بعد فقط رمزِ تازه کار می‌کند؛ رمزِ قبلی دیگر نه.\n🎙 ویسِ بعدی را بفرستید.", KB);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* تحویلِ متن                                                             */
/* ------------------------------------------------------------------ */
/** برای takeVoice (وبهوک) و Cronِ ویس */
export const handler = (env) => ({ api: vbApi(env), kb: null, deliver, wiped });

async function deliver(env, job, out, api) {
  const head = `📝 <b>متنِ کاملِ ویس</b> — ${fa(out.text.length)} نویسه، ${dur(out.secs || job.secs)}`;
  await VC.sendText(api, job.chat, out.text, { head, reply: job.mid });
  if (!out.id) {
    await VC.dropJob(env, job.id);
    await say(api, job.chat, "⚠️ ElevenLabs برای این ویس شناسه‌ای نداد، پس پاک کردنش از آن‌جا ممکن نشد.\n🎙 ویسِ بعدی را بفرستید.");
    return;
  }
  const w = await VC.wipe(env, out.id);
  if (w.ok) {
    await VC.dropJob(env, job.id);
    await say(api, job.chat, `🧹 سابقهٔ این ویس در ElevenLabs پاک شد${w.verified ? " و تأیید شد که دیگر آن‌جا نیست" : ""}؛ ویس و متن فقط در همین گفت‌وگو می‌مانند.\n🎙 ویسِ بعدی را بفرستید.`);
    return;
  }
  /* پاک نشد: Cronِ ویس هر نیم ساعت دوباره امتحان می‌کند و نتیجه را همین‌جا می‌گوید */
  await env.DB.prepare("UPDATE voice_jobs SET state='wipe', el=?, tries=0, lock_until=?, file_id=NULL, smid=NULL, updated_at=? WHERE id=?")
    .bind(out.id, now() + 10 * 60000, now(), job.id).run();
  await say(api, job.chat, `⚠️ متن آمد، ولی پاک کردنِ سابقه‌اش از ElevenLabs این بار نشد (${esc(w.why)}). خودکار دوباره امتحان می‌شود و نتیجه همین‌جا می‌آید.`);
}

/** نتیجهٔ تلاشِ دوبارهٔ Cron برای پاک کردن — last: آخرین تلاش بود */
async function wiped(env, job, w, last) {
  const api = vbApi(env);
  const reply = { reply_parameters: { message_id: job.mid, allow_sending_without_reply: true } };
  if (w.ok) {
    await VC.dropJob(env, job.id);
    await say(api, job.chat, `🧹 سابقهٔ این ویس هم از ElevenLabs پاک شد${w.verified ? " (تأیید شد)" : ""}.`, null, reply);
  } else if (last) {
    await VC.dropJob(env, job.id);
    await say(api, job.chat, `⚠️ پاک کردنِ سابقهٔ این ویس از ElevenLabs بعد از چند بار تلاش نشد: ${esc(w.why)}`, null, reply);
  }
}
