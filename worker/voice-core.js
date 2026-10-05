/**
 * ویس به متن — هستهٔ مشترکِ دو بات (درخواست کاربر، مهر ۱۴۰۵):
 *   «حالتِ صوتِ» بات مکاتبات (sp-voicemode.js) — بعد از متن می‌پرسد «پاک شود؟»؛ «بله» یعنی از همان گفت‌وگو و از ElevenLabs.
 *   بات ویس (voice-bot.js، TG_VB_BOT_TOKEN) — متن در گفت‌وگو می‌ماند و سابقهٔ ویس در ElevenLabs بی‌درنگ پاک می‌شود.
 *
 * هیچ متنی در پایگاهِ ما نمی‌ماند (جدولِ voice_notes حذف شد). مسیرِ هر ویس: تلگرام ← انبار (فقط تا ElevenLabs از لینکِ
 * امضاشده برش دارد؛ بعد پاک) ← ElevenLabs ← متنِ کامل در یک یا چند پیام (هر پیام تا ۳۵۰۰ نویسه).
 *
 * سقفِ زمانی یا روزانه نیست؛ تنها سقف، دانلودِ فایل برای بات‌های تلگرام است (۲۰ مگابایت). ویسِ کوتاه (تا INLINE_SECS) همان
 * لحظه در درخواستِ وبهوک تبدیل می‌شود؛ بلندتر به صفِ voice_jobs می‌رود و Cronِ جدای ویس (VOICE_CRON، تا ۱۵ دقیقه زمان)
 * تبدیلش می‌کند — درخواستِ وبهوک اگر تلگرام اتصال را ببندد نیمه‌کاره می‌ماند. ردیفِ صف فقط شناسهٔ فایلِ تلگرام، شمارهٔ
 * پیام‌ها و شناسهٔ ElevenLabs را دارد، نه صدا و نه متن؛ و بعد از کار پاک می‌شود (در حالتِ صوت تا پاسخِ «پاک شود؟»).
 *
 * رمزِ ورود: اول همان VOICE_PASS (رازِ Worker، نه در کد). کاربر عوضش کند، هشِ نمک‌دارِ رمزِ تازه در settings (کلیدِ جدا برای
 * هر بات) جایش را می‌گیرد؛ رمزِ قبلی دیگر کار نمی‌کند و هر گفت‌وگویی که با آن وارد شده بود بیرون می‌رود (passVer).
 */
import { esc } from "./telegram.js";
import { storage, storageKey, MAX_BYTES } from "./storage.js";
import { transcribe, deleteTranscript, transcriptGone } from "./letter.js";

const now = () => Date.now();
const T = (v) => String(v == null ? "" : v).trim();
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const FA = "۰۱۲۳۴۵۶۷۸۹", AR = "٠١٢٣٤٥٦٧٨٩";
export const latin = (s) => String(s == null ? "" : s).replace(/[۰-۹]/g, (d) => FA.indexOf(d)).replace(/[٠-٩]/g, (d) => AR.indexOf(d));
export const fa = (s) => String(s == null ? "" : s).replace(/\d/g, (d) => FA[+d]).replace(/,/g, "٬");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* طرحِ جدول‌ها — هر دستور یک سطر                                         */
/* ------------------------------------------------------------------ */
export const VOICE_DDL = `
CREATE TABLE IF NOT EXISTS voice_jobs (id INTEGER PRIMARY KEY, bot TEXT NOT NULL, chat TEXT NOT NULL, mid INTEGER NOT NULL, file_id TEXT, secs REAL, size INTEGER, mime TEXT, state TEXT NOT NULL, tries INTEGER NOT NULL DEFAULT 0, lock_until INTEGER, smid INTEGER, el TEXT, mids_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(bot, chat, mid));
CREATE INDEX IF NOT EXISTS ix_vjobs_state ON voice_jobs(state, id);
CREATE TABLE IF NOT EXISTS vb_chats (chat TEXT PRIMARY KEY, uid TEXT, step TEXT NOT NULL, pv INTEGER, tmp_json TEXT, fails INTEGER NOT NULL DEFAULT 0, lock_until INTEGER, updated_at INTEGER NOT NULL) WITHOUT ROWID;
`;

/** Cronِ جدای ویس (wrangler.toml) — اجرای جدا، با سقفِ CPUِ خودش، تا تبدیلِ بلند به چرخهٔ هشدارها و صفِ پیام نخورد */
export const VOICE_CRON = "*/2 * * * *";
/** ویس تا این‌قدر ثانیه همان لحظه تبدیل می‌شود؛ بلندتر در صف */
export const INLINE_SECS = 120;
export const MAX_FILE = MAX_BYTES;          /* ۲۰ مگابایت: سقفِ getFile برای همهٔ بات‌های تلگرام */
const INLINE_LOCK = 5 * 60000, CRON_LOCK = 14 * 60000;
export const MAX_TRIES = 3;
const WIPE_TRIES = 10;
const CHUNK = 3500;                         /* نویسهٔ هر پیام — تلگرام ۴۰۹۶ جا دارد و گریزِ HTML کمی بلندترش می‌کند */
const ASK_DAYS = 30;                        /* پرسشِ «پاک شود؟» بی‌پاسخ، بعد از این مدت از صف می‌رود (سابقه در ElevenLabs می‌ماند) */

/* ------------------------------------------------------------------ */
/* رمز                                                                   */
/* ------------------------------------------------------------------ */
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha = async (s) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
function same(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}
const PASS_KEY = (bot) => `voicePass:${bot}`;
/** رمزِ ذخیره‌شدهٔ یک بات — {salt, hash, at} — یا null (یعنی هنوز همان VOICE_PASS) */
export async function passRec(env, bot) {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(PASS_KEY(bot)).first();
  return r ? parse(r.value, null) : null;
}
/** نسخهٔ رمز: لحظهٔ آخرین تغییر (۰ = هنوز VOICE_PASS). گفت‌وگو نسخه‌ای را که با آن وارد شد نگه می‌دارد */
export const passVer = (rec) => (rec && rec.hash && Number(rec.at)) || 0;
export const cleanPass = (s) => latin(T(s));
/** رمز درست است؟ نسخهٔ رمز (عدد، شاید ۰) یا null */
export async function checkPass(env, bot, text) {
  const p = cleanPass(text);
  if (!p) return null;
  const rec = await passRec(env, bot);
  if (rec && rec.hash) return same(await sha(`${rec.salt}:${p}`), rec.hash) ? passVer(rec) : null;
  const base = cleanPass(env.VOICE_PASS);
  return base && same(p, base) ? 0 : null;
}
/** ایرادِ رمزِ تازه، یا null */
export function passError(text) {
  const p = cleanPass(text);
  if (p.length < 4 || p.length > 32) return "رمز باید ۴ تا ۳۲ نویسه باشد.";
  if (/\s/.test(p)) return "رمز فاصله نداشته باشد.";
  if (p.startsWith("/")) return "رمز با «/» شروع نشود.";
  return null;
}
/** رمزِ تازه جای قبلی؛ نسخهٔ تازه برمی‌گردد */
export async function setPass(env, bot, text) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  const rec = { salt, hash: await sha(`${salt}:${cleanPass(text)}`), at: now() };
  await env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
    .bind(PASS_KEY(bot), JSON.stringify(rec), rec.at).run();
  return rec.at;
}
/** فراموشیِ رمز (مدیر، /voice/reset): برگشت به VOICE_PASS؛ همهٔ گفت‌وگوهای واردشده بیرون می‌روند */
export async function resetPass(env, bot) {
  await env.DB.prepare("DELETE FROM settings WHERE key=?").bind(PASS_KEY(bot)).run();
}
/* رمزِ تازه دو بار پرسیده می‌شود؛ تا بارِ دوم فقط هشِ نمک‌دارِ بارِ اول در گفت‌وگو می‌ماند، نه خودش */
export async function pwDraft(text) { const s = hex(crypto.getRandomValues(new Uint8Array(8))); return { s, h: await sha(`${s}:${cleanPass(text)}`) }; }
export async function pwMatch(draft, text) { return !!(draft && draft.s) && same(await sha(`${draft.s}:${cleanPass(text)}`), draft.h); }

/* ------------------------------------------------------------------ */
/* ویس                                                                   */
/* ------------------------------------------------------------------ */
/** فایلِ صوتیِ پیام: ویس، فایلِ صوتی، ویدیوی گرد، یا سندِ صوتی */
export function voiceOf(msg) {
  const d = msg.document && /^audio\//.test(T(msg.document.mime_type)) ? msg.document : null;
  const v = msg.voice || msg.audio || msg.video_note || d;
  if (!v || !v.file_id) return null;
  return {
    file_id: v.file_id, secs: Number(v.duration) || 0, size: Number(v.file_size) || 0,
    mime: T(v.mime_type) || (msg.voice ? "audio/ogg" : msg.video_note ? "video/mp4" : "audio/mpeg"),
  };
}
const isLong = (v) => v.secs > INLINE_SECS || (!v.secs && v.size > 2 * 1024 * 1024);
export const dur = (s) => {
  const x = Math.round(Number(s) || 0);
  if (x < 60) return `${fa(x)} ثانیه`;
  const h = Math.floor(x / 3600), m = Math.floor((x % 3600) / 60), r = x % 60;
  return [h ? `${fa(h)} ساعت` : "", m ? `${fa(m)} دقیقه` : "", !h && r ? `${fa(r)} ثانیه` : ""].filter(Boolean).join(" و ");
};
export const TOO_BIG = "حجمِ این فایل بیش از ۲۰ مگابایت است؛ تلگرام فایلِ بزرگ‌تر از این را به هیچ باتی نمی‌دهد. چند تکه کنید و جدا بفرستید.";

/** متنِ بلند در چند تکه، بریده روی خطِ تازه یا فاصله */
export function chunks(s, n = CHUNK) {
  const out = [];
  let rest = T(s);
  while (rest.length > n) {
    let cut = rest.lastIndexOf("\n", n);
    if (cut < n * 0.6) cut = rest.lastIndexOf(" ", n);
    if (cut < n * 0.6) cut = n;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** فرستادن با یک بار صبر روی ۴۲۹ (تلگرام برای پیام‌های پشت‌سرهمِ زیاد retry_after می‌دهد) */
export async function sendRetry(api, chat, text, kb, extra) {
  for (let k = 0; ; k++) {
    try {
      return await api.call("sendMessage", {
        chat_id: chat, text, parse_mode: "HTML", link_preview_options: { is_disabled: true },
        ...(kb ? { reply_markup: Array.isArray(kb) ? { inline_keyboard: kb } : kb } : {}), ...(extra || {}),
      });
    } catch (e) {
      if (e && e.code === 429 && k < 4) { await sleep(Math.min(30, e.retryAfter || 1) * 1000 + 250); continue; }
      throw e;
    }
  }
}
/**
 * متنِ کامل در یک یا چند پیام: اولی سرتیتر دارد و به خودِ ویس پاسخ می‌دهد؛ هر تکه شمارهٔ خودش را دارد. kb روی همهٔ پیام‌ها.
 * شمارهٔ پیام‌های فرستاده برمی‌گردد.
 */
export async function sendText(api, chat, text, { head, kb, reply } = {}) {
  const parts = chunks(text);
  const mids = [];
  for (let i = 0; i < parts.length; i++) {
    const tag = parts.length > 1 ? `<i>(${fa(i + 1)} از ${fa(parts.length)})</i>\n` : "";
    const body = `${!i && head ? `${head}\n\n` : ""}${tag}${esc(parts[i])}`;
    const extra = !i && reply ? { reply_parameters: { message_id: reply, allow_sending_without_reply: true } } : null;
    const m = await sendRetry(api, chat, body, kb, extra);
    if (m) mids.push(m.message_id);
  }
  return mids;
}
export const delMsgs = (api, chat, ids) => {
  const list = [...new Set((ids || []).filter(Boolean))];
  return list.length ? api.call("deleteMessages", { chat_id: chat, message_ids: list.slice(0, 100) }).catch(() => {}) : Promise.resolve();
};

/** فایلِ تلگرام ← انبار (موقت) ← ElevenLabs با لینکِ امضاشده؛ فایلِ انبار در هر حال پاک می‌شود */
export async function transcribeTg(env, api, v) {
  const store = storage(env);
  if (!store || !store.signedUrl) throw new Error("انبارِ فایل برای صوت آماده نیست.");
  const ext = /mpeg|mp3/.test(v.mime || "") ? ".mp3" : /mp4|m4a|aac/.test(v.mime || "") ? ".m4a" : /wav/.test(v.mime || "") ? ".wav" : ".ogg";
  const key = storageKey("voice", `voice${ext}`);
  try {
    const file = await api.getFile(v.file_id);
    const src = await fetch(api.fileUrl(file.file_path));
    if (!src.ok || !src.body) throw new Error("دانلودِ ویس از تلگرام نشد.");
    await store.put(key, src.body, { contentType: v.mime || "audio/ogg", size: v.size || undefined });
    return await transcribe(env, await store.signedUrl(key, 3600));
  } finally {
    await store.remove(key).catch(() => {});
  }
}

/** پاک کردنِ سابقهٔ یک ویس در ElevenLabs و سنجیدنش (همان شناسه دیگر خوانده نشود) */
export async function wipe(env, id) {
  if (!id) return { ok: false, why: "ElevenLabs برای این ویس شناسه‌ای نداد." };
  try { await deleteTranscript(env, id); } catch (e) { return { ok: false, why: e.message }; }
  const gone = await transcriptGone(env, id).catch(() => null);
  if (gone === false) return { ok: false, why: "ElevenLabs پاک کردن را پذیرفت ولی متن هنوز خوانده می‌شود." };
  return { ok: true, verified: gone === true };
}

/** خطایی که تکرارش شاید درست شود: شبکه، ۴۲۹ و ۵xxِ ElevenLabs یا تلگرام */
const retryable = (e) => {
  const c = Number((e && (e.http || e.code)) || 0);
  return !c || c === 429 || c >= 500;
};

/* ------------------------------------------------------------------ */
/* صف                                                                     */
/* ------------------------------------------------------------------ */
/** ویسِ تازه در صف — یکتا برای هر پیام، تا تکرارِ آپدیت از تلگرام دوباره تبدیل نکند. شناسهٔ ردیف، یا null (تکراری) */
async function addJob(env, bot, chat, mid, v, inline) {
  const t = now();
  const r = await env.DB.prepare(`INSERT INTO voice_jobs (bot,chat,mid,file_id,secs,size,mime,state,tries,lock_until,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(bot,chat,mid) DO NOTHING`)
    .bind(bot, String(chat), mid, v.file_id, v.secs || null, v.size || null, v.mime || null, inline ? "work" : "queued", inline ? 1 : 0, inline ? t + INLINE_LOCK : null, t, t).run();
  return r.meta.changes ? r.meta.last_row_id : null;
}
export const dropJob = (env, id) => env.DB.prepare("DELETE FROM voice_jobs WHERE id=?").bind(id).run();
export const jobOf = (env, bot, chat, id) => env.DB.prepare("SELECT * FROM voice_jobs WHERE id=? AND bot=? AND chat=?").bind(id, bot, String(chat)).first();

/**
 * ویسِ تازه از یک بات: حجم، صف، و تبدیل — همین حالا اگر کوتاه است، وگرنه با Cron. h: {api, kb, deliver(env, job, out, api)}
 */
export async function takeVoice(env, bot, chat, msg, v, h) {
  const say = (t) => sendRetry(h.api, chat, t, h.kb).catch(() => null);
  if (v.size > MAX_FILE) { await say(`⚠️ ${TOO_BIG}`); return { ok: true }; }
  if (!T(env.ELEVENLABS_API_KEY)) { await say("⚠️ کلیدِ ElevenLabs روی سامانه ست نشده است."); return { ok: true }; }
  const store = storage(env);
  if (!store || !store.signedUrl) { await say("⚠️ انبارِ فایل برای صوت آماده نیست."); return { ok: true }; }
  const inline = !isLong(v);
  const id = await addJob(env, bot, chat, msg.message_id, v, inline);
  if (!id) return { ok: true, duplicate: true };
  if (!inline) {
    const m = await say(`⏳ این ویس ${v.secs ? dur(v.secs) : "بلند"} است؛ در صفِ تبدیل گذاشته شد و متنِ کاملش تا چند دقیقهٔ دیگر همین‌جا می‌آید. می‌توانید ویس‌های دیگر را هم بفرستید.`);
    if (m) await env.DB.prepare("UPDATE voice_jobs SET smid=? WHERE id=?").bind(m.message_id, id).run();
    return { ok: true, queued: id };
  }
  const wait = await say("⏳ در حالِ گوش دادن…");
  /* اگر این درخواست نیمه‌کاره بماند، Cron همین ردیف را بعد از قفلش برمی‌دارد و پیامِ «گوش دادن» را هم پاک می‌کند */
  if (wait) await env.DB.prepare("UPDATE voice_jobs SET smid=? WHERE id=?").bind(wait.message_id, id).run();
  await runJob(env, { id, bot, chat: String(chat), mid: msg.message_id, file_id: v.file_id, secs: v.secs, size: v.size, mime: v.mime, tries: 1, smid: wait && wait.message_id }, h);
  return { ok: true };
}

/** تبدیل و تحویلِ یک ردیفِ صف (وبهوک یا Cron) */
export async function runJob(env, job, h) {
  const say = (t) => sendRetry(h.api, job.chat, t, h.kb).catch(() => null);
  let out;
  try { out = await transcribeTg(env, h.api, job); }
  catch (e) {
    const again = retryable(e) && (job.tries || 0) < MAX_TRIES;
    if (again) {
      await env.DB.prepare("UPDATE voice_jobs SET state='queued', lock_until=NULL, updated_at=? WHERE id=?").bind(now(), job.id).run();
      if (job.tries === 1) await say(`⚠️ تبدیل این بار نشد (${esc(String(e.message).slice(0, 160))})؛ چند دقیقهٔ دیگر خودکار دوباره امتحان می‌شود.`);
    } else {
      await delMsgs(h.api, job.chat, [job.smid]);
      await dropJob(env, job.id);
      await say(`⚠️ تبدیل این ویس نشد: ${esc(String(e.message).slice(0, 200))}\nدوباره بفرستید.`);
    }
    return { ok: false };
  }
  await delMsgs(h.api, job.chat, [job.smid]);
  if (!out.text) {
    await wipe(env, out.id);
    await dropJob(env, job.id);
    await say("چیزی شنیده نشد؛ دوباره و کمی واضح‌تر بفرستید.");
    return { ok: true };
  }
  await h.deliver(env, job, out, h.api);
  return { ok: true };
}

/**
 * Cronِ ویس: ردیف‌هایی که از تلاش افتادند خبر داده و پاک می‌شوند، پرسش‌های خیلی کهنه کنار می‌روند، و یک ویس از صف
 * تبدیل می‌شود (هر اجرا یکی — سقفِ CPU). bots: {sp: h, vb: h} با همان شکلِ takeVoice، و برای «wipe» تابعِ wiped.
 */
export async function runVoiceJobs(env, bots) {
  const t = now();
  const dead = (await env.DB.prepare(`SELECT * FROM voice_jobs WHERE state IN ('queued','work') AND tries>=? AND (lock_until IS NULL OR lock_until<?) LIMIT 5`)
    .bind(MAX_TRIES, t).all()).results || [];
  for (const j of dead) {
    const h = bots[j.bot];
    if (h) { await delMsgs(h.api, j.chat, [j.smid]); await sendRetry(h.api, j.chat, "⚠️ تبدیل یکی از ویس‌ها بعد از چند بار تلاش نشد؛ آن را دوباره بفرستید.", h.kb, { reply_parameters: { message_id: j.mid, allow_sending_without_reply: true } }).catch(() => {}); }
    await dropJob(env, j.id);
  }
  await env.DB.prepare("DELETE FROM voice_jobs WHERE state='ask' AND updated_at<?").bind(t - ASK_DAYS * 86400000).run();
  /* پاک کردنِ ElevenLabsی که بارِ پیش نشد (بات ویس): هر نیم ساعت، تا ده بار */
  const w = await env.DB.prepare("SELECT * FROM voice_jobs WHERE state='wipe' AND (lock_until IS NULL OR lock_until<?) ORDER BY id LIMIT 1").bind(t).first();
  if (w && bots[w.bot] && bots[w.bot].wiped) {
    await env.DB.prepare("UPDATE voice_jobs SET lock_until=?, tries=tries+1, updated_at=? WHERE id=?").bind(t + 30 * 60000, t, w.id).run();
    const r = await wipe(env, w.el);
    await bots[w.bot].wiped(env, w, r, (w.tries || 0) + 1 >= WIPE_TRIES);
  }
  const job = await env.DB.prepare(`UPDATE voice_jobs SET state='work', tries=tries+1, lock_until=?1, updated_at=?2
    WHERE id=(SELECT id FROM voice_jobs WHERE (state='queued' OR (state='work' AND lock_until<?2)) AND tries<?3 ORDER BY id LIMIT 1) RETURNING *`)
    .bind(t + CRON_LOCK, t, MAX_TRIES).first();
  if (!job) return { voice: 0, dead: dead.length };
  const h = bots[job.bot];
  if (!h) { await dropJob(env, job.id); return { voice: 0 }; }
  const r = await runJob(env, job, h);
  return { voice: 1, ok: r.ok, dead: dead.length };
}
