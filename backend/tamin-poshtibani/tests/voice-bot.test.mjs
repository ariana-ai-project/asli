/* ============================================================
   بات ویس (worker/voice-bot.js، مهر ۱۴۰۵) — روی SQLite واقعی، با تلگرام، انبار و ElevenLabsِ بدلی

   • ورود با رمز (اول VOICE_PASS)، پیامِ رمز از گفت‌وگو پاک می‌شود، پنج رمزِ غلط = قفل؛ منوی ثابت «🔑 تغییر رمز» و «🚪 خروج»
   • هر ویس ← متنِ کامل در یک یا چند پیام ← سابقه‌اش در ElevenLabs بی‌درنگ پاک و سنجیده؛ ویس و متن در گفت‌وگو می‌مانند
     و هیچ متنی در پایگاهِ ما نیست
   • ویسِ بلند در صف و Cronِ ویس؛ سقفِ زمانی نیست، فقط ۲۰ مگابایتِ تلگرام
   • پاک نشدن از ElevenLabs ← Cron دوباره امتحان می‌کند
   • تغییرِ رمز از منو: رمزِ تازه جای قبلی؛ گفت‌وگوهای دیگرِ واردشده بیرون می‌روند؛ فراموشی با کد مدیر
   • وبهوک: راز، تکرارِ آپدیت، و ثبتِ خودکار بی نگه داشتنِ توکن
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import { handleVbUpdate, ensureVbWebhook, handler as vbHandler, MENU } from "../../../worker/voice-bot.js";
import { runVoiceJobs, chunks } from "../../../worker/voice-core.js";
import { sttFields } from "../../../worker/letter.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = {
  DB, TG_VB_BOT_TOKEN: "vbtok", TG_WEBHOOK_SECRET: "sec", TG_API_BASE: "https://tg.test/bot", TG_FILE_API_BASE: "https://tgfile.test/bot",
  SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_KEY: "svc", ELEVENLABS_API_KEY: "el", VOICE_PASS: "5308", SITE_ORIGIN: "https://site.test", MANAGER_CODE: "4321",
};
if (DB) await ensureSchema(env);

/* ---------- دنیای بیرونِ بدلی ---------- */
const calls = [];
let nextMsg = 5000;
let elStt = null;
let elDeleteFails = 0;               /* این‌قدر DELETEِ بعدی خطا می‌دهد */
const elStore = {};
const R = (o, status = 200) => ({ ok: status < 300, status, json: async () => o, text: async () => JSON.stringify(o), headers: new Headers({ "content-type": "application/json" }), body: null });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.startsWith("https://tg.test/bot")) {
    const rest = u.slice("https://tg.test/bot".length);
    const token = rest.split("/")[0], method = rest.split("/").pop();
    const body = typeof init.body === "string" ? JSON.parse(init.body) : {};
    calls.push({ bot: token === "vbtok" ? "vb" : token, method, body });
    if (method === "getMe") return R({ ok: true, result: { id: 88, username: "ArianaVoiceBot" } });
    if (method === "getFile") return R({ ok: true, result: { file_path: "voice/file_1.oga" } });
    return R({ ok: true, result: method === "sendMessage" ? { message_id: ++nextMsg } : true });
  }
  if (u.startsWith("https://tgfile.test/")) { calls.push({ bot: "tgfile", url: u }); return new Response("OGGDATA"); }
  if (u.startsWith("https://sb.test/storage/v1/object/sign/")) return R({ signedURL: "/object/sign/proformas/x?token=abc" });
  if (u.startsWith("https://sb.test/storage/v1/object/")) { calls.push({ bot: "store", method: init.method || "GET", url: u }); return R({ Key: "x" }); }
  if (u.startsWith("https://api.elevenlabs.io/")) {
    const method = init.method || "GET";
    calls.push({ bot: "el", url: u, method, form: init.body instanceof FormData ? Object.fromEntries(init.body.entries()) : null });
    const id = decodeURIComponent(u.split("/").pop());
    if (method === "POST") return R(elStt);
    if (method === "GET") return elStore[id] ? R({ text: elStore[id] }) : R({ detail: { message: "not found" } }, 404);
    if (method === "DELETE") {
      if (elDeleteFails > 0) { elDeleteFails--; return R({ detail: { message: "temporarily unavailable" } }, 503); }
      delete elStore[id]; return R({});
    }
  }
  throw new Error(`fetch بیرونیِ پیش‌بینی‌نشده: ${u}`);
};

let upd = 70000;
const vb = (u) => handleVbUpdate(env, { update_id: ++upd, ...u });
const txt = (chat, text, mid) => vb({ message: { message_id: mid || ++nextMsg, chat: { id: chat, type: "private" }, from: { id: chat }, text } });
const voice = (chat, mid, extra) => vb({ message: { message_id: mid, chat: { id: chat, type: "private" }, from: { id: chat }, voice: { file_id: `v${mid}`, duration: 40, mime_type: "audio/ogg", file_size: 90000, ...(extra || {}) } } });
const since = (n) => calls.slice(n);
const out = (n, chat) => since(n).filter((c) => c.bot === "vb" && String(c.body.chat_id) === String(chat));
const msgs = (n, chat) => out(n, chat).filter((c) => c.method === "sendMessage");
const last = (n, chat) => msgs(n, chat).pop();
const row = (chat) => DB.raw.prepare("SELECT * FROM vb_chats WHERE chat=?").get(String(chat));
const strip = (t) => t.replace(/^📝[^\n]*\n\n/, "").replace(/^<i>\([^)]*\)<\/i>\n/, "");
const menuOf = (m) => (m.body.reply_markup && m.body.reply_markup.keyboard ? m.body.reply_markup.keyboard.flat().map((b) => b.text) : []);

test("وبهوکِ بات ویس: ثبتِ خودکار با رازِ سایت، دستورها، و نشانِ توکن به‌جای خودِ توکن", { skip: SKIP }, async () => {
  let n = calls.length;
  const r = await ensureVbWebhook(env);
  assert.equal(r.ok, true);
  const hook = since(n).find((c) => c.method === "setWebhook");
  assert.deepEqual([hook.bot, hook.body.url, hook.body.secret_token], ["vb", "https://site.test/tamin-poshtibani/api/tg/vb-webhook", "sec"]);
  assert.ok(since(n).some((c) => c.method === "setMyCommands"));
  const saved = DB.raw.prepare("SELECT value FROM settings WHERE key='vbBot'").get().value;
  assert.equal(JSON.parse(saved).username, "ArianaVoiceBot");
  assert.doesNotMatch(saved, /vbtok/, "توکن در پایگاه نمی‌نشیند");
  n = calls.length;
  assert.equal((await ensureVbWebhook(env)).cached, true);
  assert.equal(since(n).length, 0, "بارِ دوم به تلگرام نمی‌رود");
  env.TG_VB_BOT_TOKEN = "vbtok2";
  try {
    n = calls.length;
    assert.ok(!(await ensureVbWebhook(env)).cached, "توکنِ تازه ← ثبتِ دوباره");
    assert.ok(since(n).some((c) => c.method === "setWebhook" && c.bot === "vbtok2"));
  } finally { env.TG_VB_BOT_TOKEN = "vbtok"; }
  await ensureVbWebhook(env, null, true);

  /* مسیرِ وبهوک: بی راز نه؛ تکرارِ یک آپدیت فقط یک بار */
  const post = (u, secret) => route(new Request("https://site.test/tamin-poshtibani/api/tg/vb-webhook", {
    method: "POST", headers: { "Content-Type": "application/json", ...(secret ? { "X-Telegram-Bot-Api-Secret-Token": secret } : {}) }, body: JSON.stringify(u),
  }), env, { waitUntil() {} });
  assert.equal((await post({ update_id: 1, message: { message_id: 1, chat: { id: 4000, type: "private" }, text: "/start" } })).status, 403);
  n = calls.length;
  const u = { update_id: 99001, message: { message_id: 2, chat: { id: 4000, type: "private" }, from: { id: 4000 }, text: "/start" } };
  assert.equal((await post(u, "sec")).status, 200);
  assert.equal((await (await post(u, "sec")).json()).duplicate, true);
  assert.equal(msgs(n, 4000).length, 1);
});

test("ورود: رمزِ اولیه (رقمِ فارسی هم)، پیامِ رمز پاک می‌شود، منوی ثابت؛ پنج رمزِ غلط = قفل", { skip: SKIP }, async () => {
  const A = 4101, B = 4102;
  let n = calls.length;
  await txt(A, "/start");
  assert.match(last(n, A).body.text, /رمزِ ورود را بفرستید/);
  n = calls.length;
  await voice(A, 300);
  assert.match(last(n, A).body.text, /رمزِ ورود را بفرستید/, "بی ورود ویس پذیرفته نمی‌شود");
  assert.equal(since(n).filter((c) => c.bot === "el").length, 0);
  n = calls.length;
  await txt(A, "1234", 301);
  assert.match(last(n, A).body.text, /رمز نادرست است. ۴ بار دیگر/);
  assert.ok(out(n, A).some((c) => c.method === "deleteMessage" && c.body.message_id === 301), "رمز در گفت‌وگو نمی‌ماند");
  n = calls.length;
  await txt(A, "۵۳۰۸", 302);
  const hi = last(n, A);
  assert.match(hi.body.text, /وارد شدید/);
  assert.deepEqual(menuOf(hi), [MENU.pw, MENU.out], "منوی ثابت");
  assert.equal(hi.body.reply_markup.is_persistent, true);
  assert.ok(out(n, A).some((c) => c.method === "deleteMessage" && c.body.message_id === 302));
  assert.equal(row(A).step, "voice");

  await txt(B, "/start");
  for (let k = 0; k < 4; k++) await txt(B, `000${k}`);
  n = calls.length;
  await txt(B, "0009");
  assert.match(last(n, B).body.text, /پانزده|۱۵/);
  assert.ok(row(B).lock_until > Date.now());
  n = calls.length;
  await txt(B, "5308");
  assert.match(last(n, B).body.text, /بسته است/, "در قفل، رمزِ درست هم نه");
  assert.equal(row(B).step, "pass");
});

test("هر ویس ← متنِ کامل در چند پیام ← سابقه‌اش در ElevenLabs پاک و سنجیده؛ ویس و متن در گفت‌وگو می‌مانند؛ هیچ متنی در پایگاه نیست", { skip: SKIP }, async () => {
  const A = 4101;
  const long = Array.from({ length: 1200 }, (_, i) => `کلمه${i}`).join(" ");
  elStt = { text: long, transcription_id: "vb-1", audio_duration_secs: 40 }; elStore["vb-1"] = long;
  let n = calls.length;
  await voice(A, 310);
  const el = since(n).filter((c) => c.bot === "el").map((c) => `${c.method} ${c.url.split("/").pop()}`);
  assert.deepEqual(el, ["POST speech-to-text", "DELETE vb-1", "GET vb-1"], "تبدیل، پاک کردن، سنجیدن");
  assert.equal(elStore["vb-1"], undefined);
  const parts = msgs(n, A).filter((c) => /کلمه/.test(c.body.text));
  assert.ok(parts.length >= 3, "متنِ بلند در چند پیام");
  assert.equal(parts.map((c) => strip(c.body.text)).join(" "), long, "تمامِ متن");
  assert.equal(parts[0].body.reply_parameters.message_id, 310);
  assert.match(last(n, A).body.text, /سابقهٔ این ویس در ElevenLabs پاک شد و تأیید شد/);
  assert.equal(out(n, A).filter((c) => /^deleteMessage/.test(c.method) && JSON.stringify(c.body).includes("310")).length, 0, "خودِ ویس در گفت‌وگو می‌ماند");
  assert.deepEqual(since(n).filter((c) => c.bot === "store").map((c) => c.method), ["POST", "DELETE"], "صوت فقط تا تبدیل در انبار");
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM voice_jobs").get().n, 0, "صف خالی");
  const dump = JSON.stringify([DB.raw.prepare("SELECT * FROM vb_chats").all(), DB.raw.prepare("SELECT * FROM voice_jobs").all(), DB.raw.prepare("SELECT * FROM settings").all()]);
  assert.doesNotMatch(dump, /کلمه/, "متن هیچ‌جا در پایگاه نیست");

  /* تکرارِ همان پیام: دوباره تبدیل نمی‌شود — تنها بعد از کار (ردیفِ صف رفته) تلگرام آپدیتِ تازه نمی‌فرستد؛ وبهوک با update_id کنارش می‌گذارد */
  n = calls.length;
  await txt(A, "سلام");
  assert.match(last(n, A).body.text, /یک ویس بفرستید/);

  /* بیش از ۲۰ مگابایت: تلگرام به هیچ باتی نمی‌دهد */
  n = calls.length;
  await voice(A, 311, { duration: 9000, file_size: 21 * 1024 * 1024 });
  assert.match(last(n, A).body.text, /۲۰ مگابایت/);
  assert.equal(since(n).filter((c) => c.bot === "el").length, 0);
});

test("ویسِ بلند (یک ساعت) در صف و Cronِ ویس؛ پاک نشدن از ElevenLabs ← دوباره با Cron", { skip: SKIP }, async () => {
  const A = 4101;
  const big = Array.from({ length: 5000 }, (_, i) => `جمله${i}`).join(" ");
  elStt = { text: big, transcription_id: "vb-2", audio_duration_secs: 3600 }; elStore["vb-2"] = big;
  let n = calls.length;
  await voice(A, 320, { duration: 3600, file_size: 15 * 1024 * 1024 });
  assert.equal(since(n).filter((c) => c.bot === "el").length, 0, "در وبهوک نه");
  assert.match(last(n, A).body.text, /۱ ساعت.*در صفِ تبدیل/s);
  const q = DB.raw.prepare("SELECT * FROM voice_jobs WHERE bot='vb'").get();
  assert.deepEqual([q.state, q.mid, q.secs], ["queued", 320, 3600]);

  /* اولین پاک کردن از ElevenLabs شکست می‌خورد */
  elDeleteFails = 1;
  n = calls.length;
  const t1 = await runVoiceJobs(env, { vb: vbHandler(env) });
  assert.equal(t1.voice, 1);
  const parts = msgs(n, A).filter((c) => /جمله/.test(c.body.text));
  assert.ok(parts.length >= 10);
  assert.equal(parts.map((c) => strip(c.body.text)).join(" "), big, "تمامِ متنِ یک ساعت");
  assert.match(last(n, A).body.text, /پاک کردنِ سابقه‌اش از ElevenLabs این بار نشد/);
  const w = DB.raw.prepare("SELECT * FROM voice_jobs WHERE bot='vb'").get();
  assert.deepEqual([w.state, w.el], ["wipe", "vb-2"]);
  assert.doesNotMatch(JSON.stringify(w), /جمله/);

  /* Cronِ بعدی (بعد از قفلِ ده‌دقیقه‌ای) دوباره امتحان می‌کند */
  DB.raw.prepare("UPDATE voice_jobs SET lock_until=? WHERE id=?").run(Date.now() - 1, w.id);
  n = calls.length;
  await runVoiceJobs(env, { vb: vbHandler(env) });
  assert.equal(elStore["vb-2"], undefined);
  assert.match(last(n, A).body.text, /هم از ElevenLabs پاک شد/);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM voice_jobs").get().n, 0);
});

test("تغییرِ رمز از منوی ثابت: دو بار، پیام‌های رمز پاک؛ رمزِ تازه جای قبلی، گفت‌وگوهای دیگر بیرون؛ فراموشی با کد مدیر؛ خروج", { skip: SKIP }, async () => {
  const A = 4101, C = 4103;
  await txt(C, "/start");
  await txt(C, "5308");
  assert.equal(row(C).step, "voice");

  let n = calls.length;
  await txt(A, MENU.pw);
  assert.match(last(n, A).body.text, /رمزِ تازه را بفرستید/);
  n = calls.length;
  await txt(A, "ab", 401);
  assert.match(last(n, A).body.text, /۴ تا ۳۲ نویسه/);
  await txt(A, "Seda-77", 402);
  n = calls.length;
  await txt(A, "Seda-78", 403);
  assert.match(last(n, A).body.text, /دو رمز یکی نبود/);
  await txt(A, "Seda-77", 404);
  n = calls.length;
  await txt(A, "Seda-77", 405);
  assert.match(last(n, A).body.text, /رمزِ ورود عوض شد/);
  const dels = calls.filter((c) => c.bot === "vb" && c.method === "deleteMessage" && String(c.body.chat_id) === String(A)).map((c) => c.body.message_id);
  for (const id of [401, 402, 403, 404, 405]) assert.ok(dels.includes(id), `پیامِ رمزِ ${id} پاک شد`);
  const rec = DB.raw.prepare("SELECT value FROM settings WHERE key='voicePass:vb'").get().value;
  assert.doesNotMatch(rec, /Seda/, "فقط نمک و هش");
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM settings WHERE key='voicePass:sp'").get().n, 0, "رمزِ حالتِ صوتِ بات مکاتبات جداست");
  assert.equal(row(A).step, "voice", "همین گفت‌وگو وارد می‌ماند");

  /* گفت‌وگوی دیگری که با رمزِ قبلی وارد شده بود باید دوباره وارد شود — و رمزِ قبلی دیگر کار نمی‌کند */
  n = calls.length;
  await voice(C, 410);
  assert.match(last(n, C).body.text, /رمزِ ورود عوض شده/);
  assert.equal(since(n).filter((c) => c.bot === "el").length, 0);
  n = calls.length;
  await txt(C, "5308");
  assert.match(last(n, C).body.text, /رمز نادرست/);
  await txt(C, "Seda-77");
  assert.equal(row(C).step, "voice");

  /* فراموشیِ رمز: فقط مدیر؛ برگشت به رمزِ اولیه */
  const reset = (h) => route(new Request("https://site.test/tamin-poshtibani/api/voice/reset", { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: JSON.stringify({ bot: "vb" }) }), env, { waitUntil() {} });
  assert.equal((await reset({})).status, 401);
  assert.equal((await reset({ "X-Manager-Code": "4321" })).status, 200);
  n = calls.length;
  await txt(A, "سلام");
  assert.match(last(n, A).body.text, /رمزِ ورود عوض شده/);
  await txt(A, "5308");
  assert.equal(row(A).step, "voice");

  /* خروج از منو */
  n = calls.length;
  await txt(A, MENU.out);
  assert.match(last(n, A).body.text, /بیرون آمدید/);
  assert.equal(last(n, A).body.reply_markup.remove_keyboard, true);
  assert.equal(row(A).step, "pass");
});

test("پاسخِ چندمگابایتیِ ElevenLabs (صوتِ بلند) بی JSON.parseِ کامل خوانده می‌شود؛ متن درست تکه می‌شود", () => {
  const words = Array.from({ length: 20000 }, (_, i) => ({ text: `w${i}`, start: i, end: i + 0.5, type: "word", speaker_id: "speaker_0", logprob: -0.1 }));
  const text = "سلام \"نقل‌قول\" و \\ بک‌اسلش\nو خطِ تازه — پایان";
  const raw = JSON.stringify({ language_code: "fa", language_probability: 0.99, text, words, transcription_id: "abc123", audio_duration_secs: 3600.5 });
  assert.ok(raw.length > 300000);
  const d = sttFields(raw);
  assert.deepEqual([d.text, d.transcription_id, d.audio_duration_secs, d.language_code], [text, "abc123", 3600.5, "fa"]);
  /* همان پاسخ با نویسه‌های فارسیِ \uXXXX (ensure_ascii) */
  const ascii = raw.replace(/[^ -~]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
  assert.equal(sttFields(ascii).text, text);
  /* ترتیبِ دیگر (words پیش از text): همان JSON.parseِ کامل */
  assert.equal(sttFields(JSON.stringify({ words, text, transcription_id: "x" })).text, text);
  /* پاسخِ کوچک همان JSON.parse */
  assert.deepEqual(sttFields(JSON.stringify({ text: "کوتاه", transcription_id: "y" })), { text: "کوتاه", transcription_id: "y" });

  const big = Array.from({ length: 4000 }, (_, i) => `واژهٔ${i}`).join(" ");
  const parts = chunks(big);
  assert.ok(parts.every((p) => p.length <= 3500));
  assert.equal(parts.join(" "), big, "تکه‌ها روی فاصله بریده می‌شوند و چیزی گم نمی‌شود");
});
