/* ============================================================
   دموی پنل تأمین‌کننده — worker/sp-*.js (مهر ۱۴۰۵)

   کل مسیر روی SQLite واقعی (همان طرحِ ensureSchema)، تلگرامِ بدلی، انبارِ بدلی و مدلِ بدلی:
   «ارسال» کارشناس ← پیامکِ شبیه‌سازی‌شده با لینک و رمز ← ورود تأمین‌کننده ← لایه‌های قفل و لایهٔ تازه ←
   آمادهٔ ارسال و ارسال چند قلم با هم ← تأیید و درخواست پیش‌فاکتور ← پیش‌فاکتور ← خوانش هوشمند و جدول
   تطابق (✅/⚠️/❌) ← پذیرش مغایرت‌ها (پیش‌فاکتور ملاک) ← تأیید نهایی ← خط استعلام با مقدارهای پیش‌فاکتور؛
   کدِ افزایشیِ قلم در پنل هر تأمین‌کننده و در همهٔ پیام‌ها؛ بات مکاتبات در هر دو نقش (و هر دو در یک
   گفت‌وگو)، پیامکِ شبیه‌سازی‌شده فقط در بات مکاتبات، مینی‌اپ (initData هر دو بات)، «ارسال» از بات
   کارشناسان، رمز تازه، خروج و قفل بعد از پنج رمز اشتباه.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";

import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import { handleUpdate } from "../../../worker/bot.js";
import { handleSpUpdate } from "../../../worker/sp-bot.js";
import { verifyInitData } from "../../../worker/sp-api.js";
import { normPhone, toNum, DEMO } from "../../../worker/sp-core.js";
import { e164, isMobile } from "../../../worker/sms.js";
import { msgEntry } from "../../../worker/ai-md.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = {
  DB, TG_BOT_TOKEN: "tok", TG_SP_BOT_TOKEN: "sptok", TG_WEBHOOK_SECRET: "sec", TG_API_BASE: "https://tg.test/bot", TG_FILE_API_BASE: "https://tgfile.test/bot",
  SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_KEY: "svc", ANTHROPIC_API_KEY: "k", ANTHROPIC_API_BASE: "https://ai.test", SITE_ORIGIN: "https://site.test",
};
const EXPERT_CHAT = 555, EXPERT2_CHAT = 556;

if (DB) {
  await ensureSchema(env);
  const t = Date.now();
  DB.raw.exec("DELETE FROM experts");
  DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,telegram_chat,created_at) VALUES (1,'کارشناس یک','آقای یک','9001',1,1,?,?), (2,'کارشناس دو','آقای دو','9002',1,1,?,?)")
    .run(String(EXPERT_CHAT), t, String(EXPERT2_CHAT), t);
  DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES ('R-1','1405/07/01','پروژهٔ یک'), ('R-2','1405/07/02','پروژهٔ دو')").run();
  DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,dispatched_at,created_at) VALUES (1,'R-1',1,?,?), (2,'R-2',2,?,?)").run(t, t, t, t);
  const ins = DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,code,title,spec,qty,unit,state,assignment_id,norm_json) VALUES (?,?,?,?,?,?,?,?,?,'open',?,?)");
  ins.run(11, "R-1", "a", 1, null, "پیچ آلن M8 فولادی", null, 100, "عدد", 1, JSON.stringify({ v: 2, head: "پیچ", layers: { "اندازه": "M8", "جنس": { v: "فولاد", i: 1 } } }));
  ins.run(12, "R-1", "b", 2, null, "مهره M8", "گرید 8.8", 50, "عدد", 1, null);
  ins.run(21, "R-2", "a", 1, null, "واشر", null, 10, "عدد", 2, null);
  DB.raw.prepare("INSERT INTO templates (id,expert_id,title,body,created_at) VALUES (7,1,'رسمی','سلام {تامین‌کننده}؛ برای {عنوان قلم} به مقدار {مقدار} {واحد} قیمت بدهید.',?)").run(t);
  DB.raw.prepare("INSERT INTO smart_searches (id,item_id,assignment_id,expert_id,result_json,created_at) VALUES (50,11,1,1,?,?)")
    .run(JSON.stringify({ suppliers: [{ name: "آهن‌آلات نمونه", phones: [{ e164: "+989121112233" }] }] }), t);
}

/* ---------- دنیای بیرونِ بدلی ---------- */
const calls = [];
let nextMsg = 3000;
let aiReply = null;
let sttReply = { status: 200, body: { text: "" } };
let smsReply = { status: 200, body: { data: { success: true, message: "SMS added to queue for processing", smsBatchId: "batch-1", recipientCount: 1 } } };
const R = (o, status = 200) => ({ ok: status < 300, status, json: async () => o, text: async () => JSON.stringify(o), headers: new Headers({ "content-type": "application/json" }), body: null });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.startsWith("https://tg.test/bot")) {
    const rest = u.slice("https://tg.test/bot".length);
    const token = rest.split("/")[0], method = rest.split("/").pop();
    const body = typeof init.body === "string" ? JSON.parse(init.body) : {};
    calls.push({ bot: token === "sptok" ? "sp" : "main", method, body });
    if (method === "getMe") return R({ ok: true, result: { id: 77, username: token === "sptok" ? "AriaSupplierBot" : "ArianaSupplyBot" } });
    if (method === "getFile") return R({ ok: true, result: { file_path: "documents/pf.pdf" } });
    return R({ ok: true, result: method === "sendMessage" ? { message_id: ++nextMsg } : true });
  }
  if (u.startsWith("https://tgfile.test/")) return new Response("PDFDATA");
  /* ElevenLabs بدلی (پیاده کردنِ پیامِ صوتی) */
  if (u.startsWith("https://el.test/")) { const fd = init.body; calls.push({ bot: "stt", url: u, headers: init.headers, model: fd.get("model_id"), lang: fd.get("language_code"), size: fd.get("file").size }); return R(sttReply.body, sttReply.status); }
  if (u.startsWith("https://sb.test/storage/v1/object/sign/")) return R({ signedURL: "/object/sign/proformas/x?token=abc" });
  if (u.startsWith("https://sb.test/storage/v1/object/")) { calls.push({ bot: "store", method: init.method || "GET", url: u }); return R({ Key: "x" }); }
  if (u.startsWith("https://ai.test/")) { calls.push({ bot: "ai", body: JSON.parse(init.body) }); return R(aiReply); }
  /* درگاه پیامکِ بدلی (TextBee) */
  if (u.startsWith("https://sms.test/")) { calls.push({ bot: "sms", url: u, headers: init.headers, body: JSON.parse(init.body) }); return R(smsReply.body, smsReply.status); }
  throw new Error(`fetch بیرونیِ پیش‌بینی‌نشده: ${u}`);
};
const pend = [];
const ctx = { waitUntil: (p) => pend.push(p) };
async function call(path, { method, body, headers, raw } = {}) {
  const h = { ...(headers || {}) };
  let b;
  if (raw !== undefined) b = raw;
  else if (body !== undefined) { b = JSON.stringify(body); h["Content-Type"] = "application/json"; }
  const res = await route(new Request(`https://site.test/tamin-poshtibani/api${path}`, { method: method || (b !== undefined ? "POST" : "GET"), headers: h, body: b }), env, ctx);
  await Promise.all(pend.splice(0));
  const data = await res.json();
  return { status: res.status, data };
}
const EX = { "X-Expert-Code": "9001" };
const since = (n) => calls.slice(n);
const sent = (from, bot, chat) => since(from).filter((c) => c.bot === bot && c.method === "sendMessage" && (chat == null || String(c.body.chat_id) === String(chat)));
/** هر پیامی که به گفت‌وگو رسید — تازه یا ویرایشِ همان کارت */
const shown = (from, bot, chat) => since(from).filter((c) => c.bot === bot && (c.method === "sendMessage" || c.method === "editMessageText") && String(c.body.chat_id) === String(chat));
const btns = (m) => (m && m.body.reply_markup && m.body.reply_markup.inline_keyboard ? m.body.reply_markup.inline_keyboard.flat() : []);
const passOf = (sms) => /رمز ورود: (\d{6})/.exec(sms)[1];
const keyOf = (sms) => /#k=([0-9a-f]{12})/.exec(sms)[1];
const v = (value, sure = true) => ({ value, sure });
/** پاسخِ بدلیِ مدل (ابزار record_check) */
const aiOut = (input) => ({ model: "claude-haiku-4-5", usage: { input_tokens: 4000, output_tokens: 600 }, content: [{ type: "tool_use", name: "record_check", input }] });
const terms = (over = {}) => ({ delivery: v("۱۰ روز کاری"), pay: { value: "نقدی", text: "نقد", sure: true }, invoice: v(null), vat: v("دارد"), valid_days: v(7), ...over });
const S = {};

test("ابزارها: شماره و عدد", () => {
  assert.equal(normPhone("۰۹۱۲ ۱۲۳ ۴۵۶۷"), "09121234567");
  assert.equal(normPhone("+98 912-123-4567"), "09121234567");
  assert.equal(normPhone("9121234567"), "09121234567");
  assert.equal(normPhone("021 8888 1234"), "02188881234");
  assert.equal(normPhone("12345"), null);
  /* شمارهٔ کپی‌شده از دفترچهٔ تلفن، تلگرام یا واتس‌اپ جهت‌نماهای نامرئی دارد (گزارشِ کاربر، مهر ۱۴۰۵) */
  assert.equal(normPhone("+989220022560"), "09220022560");
  assert.equal(normPhone("‪+98 922 002 2560‬"), "09220022560", "LRE…PDF");
  assert.equal(normPhone("⁦+989220022560⁩"), "09220022560", "LRI…PDI");
  assert.equal(normPhone("‏+98‎9220022560﻿"), "09220022560", "RLM، LRM، BOM");
  assert.equal(normPhone("+98 (0) 922 002 2560"), "09220022560", "صفرِ اضافه بعد از +98");
  assert.equal(normPhone("0098 922 002 2560"), "09220022560");
  assert.equal(normPhone("+98 21 8888 1234"), "02188881234");
  assert.equal(normPhone("+14155550101"), "+14155550101", "شمارهٔ خارجی همان می‌ماند");
  assert.equal(normPhone("0912 123 4567 / 0935 111 2233"), null, "دو شماره در یک خانه نه");
  assert.equal(e164("‪+98 922 002 2560‬"), "+989220022560");
  assert.equal(e164("+98 0922 002 2560"), "+989220022560");
  assert.equal(isMobile("⁦۰۹۲۲۰۰۲۲۵۶۰⁩"), true);
  assert.equal(isMobile("02188881234"), false, "ثابت پیامک نمی‌گیرد");
  assert.equal(toNum("۱۲٬۵۰۰"), 12500);
  assert.ok(Number.isNaN(toNum("abc")));
  assert.equal(toNum(""), null);
});

test("ارسال به تأمین‌کنندهٔ فرضی: گفت‌وگو، خط با لایه‌های قفل و کدِ قلم، و متن پیامک با لینک و رمز", { skip: SKIP }, async () => {
  const r = await call("/sp/x/send", { headers: EX, body: { assignment_id: 1, item_ids: [11, 12], demo: true, text: "سلام، استعلام داریم." } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.added, 2);
  assert.equal(r.data.supplier.demo, true);
  assert.match(r.data.sms.text, /^سلام، استعلام داریم\./);
  assert.match(r.data.sms.text, /🔗 پنل تأمین‌کننده: https:\/\/site\.test\/tamin-poshtibani\/supplier\.html#k=[0-9a-f]{12}/);
  assert.match(r.data.sms.text, /🔑 رمز ورود: \d{6}/);
  S.demoK = keyOf(r.data.sms.text); S.demoPass = passOf(r.data.sms.text); S.th = r.data.thread_id;
  const sms = DB.raw.prepare("SELECT body FROM sp_sms ORDER BY id DESC LIMIT 1").get();
  assert.ok(!sms.body.includes(S.demoPass), "رمز خام در دیتابیس نمی‌ماند");
  const pp = DB.raw.prepare("SELECT hash FROM sp_passes WHERE phone_id=(SELECT id FROM sp_phones WHERE k=?)").all(S.demoK);
  assert.equal(pp.length, 1);
  assert.match(pp[0].hash, /^[0-9a-f]{16}:[0-9a-f]{64}$/, "نمک:هش، نه رمز خام");
  const lines = DB.raw.prepare("SELECT * FROM sp_lines WHERE thread_id=? ORDER BY item_id").all(S.th);
  assert.equal(lines[0].head, "پیچ");
  assert.deepEqual(JSON.parse(lines[0].layers_json), [{ k: "اندازه", v: "M8" }, { k: "جنس", v: "فولاد" }], "لایهٔ ضمنی هم بی علامت «ضمنی»");
  assert.deepEqual(JSON.parse(lines[1].layers_json), [{ k: "مشخصات فنی", v: "گرید 8.8" }], "قلم بی‌ساختار: مشخصات همان سطر");
  assert.equal(lines[0].qty, 100); assert.equal(lines[0].unit, "عدد");
  assert.deepEqual(lines.map((l) => l.no), [1, 2], "کدِ افزایشیِ قلم در پنل همین تأمین‌کننده");
  const ev = r.data.msgs.find((m) => m.kind === "event");
  assert.match(ev.body, /📦 استعلام ۲ قلم:\n▫️ کد ۱ — پیچ آلن M8 فولادی\n {4}۱۰۰ عدد\n {4}اندازه: M8 · جنس: فولاد\n▫️ کد ۲ — مهره M8\n {4}۵۰ عدد\n {4}مشخصات فنی: گرید 8\.8/, "پیامِ استعلام: کد و عنوان، زیرش مقدار و مشخصات اصلی");
  assert.deepEqual(ev.meta.items.map((x) => [x.no, x.title, x.qty, x.unit]), [[1, "پیچ آلن M8 فولادی", 100, "عدد"], [2, "مهره M8", 50, "عدد"]], "عکسِ اقلام برای کارتِ پیام");

  const again = await call("/sp/x/send", { headers: EX, body: { assignment_id: 1, item_ids: [11], demo: true } });
  assert.equal(again.data.added, 0, "قلمِ رفته دوباره ساخته نمی‌شود — یادآوری");
  assert.match(again.data.msgs.find((m) => m.kind === "event").body, /یادآوری استعلام:\n▫️ کد ۱ — پیچ آلن M8 فولادی\n {4}۱۰۰ عدد\n {4}اندازه: M8/, "یادآوری هم با همان کد و لایه‌ها");
  assert.notEqual(passOf(again.data.sms.text), S.demoPass, "هر ارسال رمز تازه");
  S.demoPass1 = S.demoPass;
  S.demoPass = passOf(again.data.sms.text);

  const other = await call("/sp/x/send", { headers: EX, body: { assignment_id: 2, item_ids: [21], demo: true } });
  assert.equal(other.status, 403, "درخواستِ کارشناس دیگر");
});

test("ورود تأمین‌کننده: رمز اشتباه، رمز درست، نشست و فهرست استعلام‌ها", { skip: SKIP }, async () => {
  const bad = await call("/sp/login", { body: { k: S.demoK, password: "000000" === S.demoPass ? "111111" : "000000" } });
  assert.equal(bad.status, 401);
  const ok = await call("/sp/login", { body: { k: S.demoK, password: S.demoPass.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]) } });
  assert.equal(ok.status, 200, "رقم فارسی هم پذیرفته است");
  S.sess = ok.data.session;
  const older = await call("/sp/login", { body: { k: S.demoK, password: S.demoPass1 } });
  assert.equal(older.status, 200, "رمزِ پیامکِ قبلی هم تا خروج یا انقضا معتبر است — پیامک تازه باطلش نمی‌کند");
  const me = await call("/sp/me", { headers: { "X-SP-Session": S.sess } });
  assert.equal(me.data.me.demo, true);
  assert.equal(me.data.threads.length, 1);
  assert.equal(me.data.threads[0].request_id, "R-1");
  const nope = await call("/sp/x/threads", { headers: { "X-SP-Session": S.sess } });
  assert.equal(nope.status, 404, "تأمین‌کننده به مسیرهای کارشناس راه ندارد");
});

test("مشخصات: لایهٔ قفل تغییر نمی‌کند، لایهٔ تازه و قیمت ذخیره می‌شود، آماده فقط با فیلدهای ضروری", { skip: SKIP }, async () => {
  const H = { "X-SP-Session": S.sess };
  const th = (await call(`/sp/thread/${S.th}`, { headers: H })).data;
  const [l1, l2] = th.lines;
  S.l1 = l1.id; S.l2 = l2.id;
  assert.deepEqual([l1.no, l2.no], [1, 2], "کد در خروجیِ پنل");
  assert.equal(th.thread.phone, "0900•••0000", "شماره برای تأمین‌کننده پوشیده");
  const locked = await call(`/sp/line/${l1.id}`, { method: "PUT", headers: H, body: { extra: [{ k: "جنس", v: "استیل" }] } });
  assert.equal(locked.status, 422);
  assert.match(locked.data.error, /قفل‌شده/);
  const saved = await call(`/sp/line/${l1.id}`, { method: "PUT", headers: H, body: { qty: "۱۰۰", price: "12,500", unit: "عدد", extra: [{ k: "برند", v: "فولاد البرز" }] } });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.line.total, 1250000);
  assert.equal(saved.data.line.state, "draft");
  const notReady = await call(`/sp/line/${l2.id}/ready`, { headers: H, body: { on: true } });
  assert.equal(notReady.status, 422);
  assert.deepEqual(notReady.data.missing, ["قیمت واحد", "زمان تحویل", "شرایط تسویه", "نوع فاکتور", "ارزش افزوده"], "شرایطِ اجباریِ فاکتور هم لازم است");
  /* کادر دومِ کارت‌ها: شرایطِ فاکتور برای همهٔ اقلامِ این استعلام */
  assert.equal((await call(`/sp/thread/${S.th}/terms`, { headers: H, body: { dtime: "فوری" } })).status, 422, "زمان تحویل: تاریخ شمسی یا شمار روز");
  assert.equal((await call(`/sp/thread/${S.th}/terms`, { headers: H, body: { pay: "چک" } })).status, 422, "فقط گزینه‌های تب استعلامات");
  assert.equal((await call(`/sp/thread/${S.th}/terms`, { headers: EX, body: { pay: "نقدی" } })).status, 404, "شرایط را فقط خودِ تأمین‌کننده اعلام می‌کند");
  const okT = await call(`/sp/thread/${S.th}/terms`, { headers: H, body: { dtime: "۱۰ روز کاری", pay: "نقدی", invoice: "رسمی", vat: "دارد", valid_days: "۷" } });
  assert.equal(okT.status, 200, JSON.stringify(okT.data));
  assert.deepEqual(okT.data.terms, { dtime: "10 روز کاری", pay: "نقدی", invoice: "رسمی", vat: "دارد", valid_days: 7 });
  assert.deepEqual(okT.data.missing, []);
  assert.deepEqual((await call(`/sp/thread/${S.th}`, { headers: EX })).data.thread.terms.pay, "نقدی", "کارشناس هم شرایطِ اعلامی را می‌بیند");
  await call(`/sp/line/${l2.id}`, { method: "PUT", headers: H, body: { price: 3000 } });
  for (const id of [l1.id, l2.id]) assert.equal((await call(`/sp/line/${id}/ready`, { headers: H, body: { on: true } })).status, 200);
  const up = await call(`/sp/line/${l1.id}/file?filename=cert.pdf&label=${encodeURIComponent("گواهی کیفیت")}&note=x`, { headers: { ...H, "Content-Type": "application/pdf" }, raw: "PDF" });
  assert.equal(up.status, 200, JSON.stringify(up.data));
  const noLabel = await call(`/sp/line/${l1.id}/file?filename=a.pdf`, { headers: H, raw: "PDF" });
  assert.equal(noLabel.status, 400, "پیوست بی برچسب نه");
});

test("ارسال چند قلم ← تأیید ← پیش‌فاکتور ← خوانش هوشمند و جدول تطابق ← پذیرش مغایرت ← تأیید نهایی ← تب استعلامات (فرضی هم)", { skip: SKIP }, async () => {
  const H = { "X-SP-Session": S.sess };
  const sub = await call(`/sp/thread/${S.th}/submit`, { headers: H, body: { line_ids: [S.l1, S.l2] } });
  assert.equal(sub.status, 200, JSON.stringify(sub.data));
  S.b = sub.data.bundle_id;
  const edit = await call(`/sp/line/${S.l1}`, { method: "PUT", headers: H, body: { price: 1 } });
  assert.equal(edit.status, 409, "فرستاده‌شده قابل ویرایش نیست");

  const desk = (await call("/sp/x/threads", { headers: EX })).data;
  const g = desk.requests.find((x) => x.request_id === "R-1");
  assert.equal(g.threads[0].waiting, 1);
  assert.ok(g.threads[0].unread >= 1, "رخدادِ ارسالِ تأمین‌کننده نخوانده است");
  const evs = () => (DB.raw.prepare("SELECT body FROM sp_msgs WHERE thread_id=? AND kind='event' ORDER BY id").all(S.th)).map((m) => m.body);
  assert.match(evs().pop(), /مشخصات ۲ قلم برای بررسی فرستاده شد:\n▫️ کد ۱ — پیچ آلن M8 فولادی\n {4}۱۰۰ عدد × ۱۲٬۵۰۰ ریال = ۱٬۲۵۰٬۰۰۰ ریال\n {4}اندازه: M8 · جنس: فولاد · برند: فولاد البرز\n▫️ کد ۲ — مهره M8[\s\S]*\nشرایط: زمان تحویل: ۱۰ روز کاری · شرایط تسویه: نقدی · نوع فاکتور: رسمی · ارزش افزوده: دارد · اعتبار پیش‌فاکتور: ۷ روز/);
  assert.deepEqual(JSON.parse(DB.raw.prepare("SELECT terms_json FROM sp_bundles WHERE id=?").get(S.b).terms_json), { dtime: "10 روز کاری", pay: "نقدی", invoice: "رسمی", vat: "دارد", valid_days: 7 }, "عکسِ شرایطِ همین لحظه روی بسته");
  const subMeta = JSON.parse(DB.raw.prepare("SELECT meta_json FROM sp_msgs WHERE thread_id=? AND kind='event' ORDER BY id DESC LIMIT 1").get(S.th).meta_json);
  assert.deepEqual([subMeta.ev, subMeta.bundle, subMeta.items.length, subMeta.items[0].price, subMeta.sum], ["submit", S.b, 2, 12500, 1400000], "کارتِ پیام: اقلام با قیمت، و کلیکش به همین بسته");

  assert.equal((await call(`/sp/x/bundle/${S.b}/decide`, { headers: EX, body: { action: "return" } })).status, 400, "برگشت بی توضیح نه");
  const ap = await call(`/sp/x/bundle/${S.b}/decide`, { headers: EX, body: { action: "approve" } });
  assert.equal(ap.data.state, "approved");
  assert.match(evs().pop(), /✅ مشخصات تأیید شد؛ لطفاً پیش‌فاکتورِ این اقلام را بارگذاری کنید:\n• کد ۱ — پیچ آلن M8 فولادی\n• کد ۲ — مهره M8/);
  const early = await call(`/sp/x/bundle/${S.b}/decide`, { headers: EX, body: { action: "final" } });
  assert.equal(early.status, 409, "بی پیش‌فاکتور تأیید نهایی نیست");

  const pf = await call(`/sp/bundle/${S.b}/proforma?filename=pf.pdf`, { headers: { ...H, "Content-Type": "application/pdf" }, raw: "PDF" });
  assert.equal(pf.status, 200, JSON.stringify(pf.data));
  assert.match(evs().pop(), /📄 پیش‌فاکتور «pf\.pdf» رسید برای:\n• کد ۱ — پیچ آلن M8 فولادی\n• کد ۲ — مهره M8/);
  const guard = await call(`/sp/x/bundle/${S.b}/decide`, { headers: EX, body: { action: "final" } });
  assert.equal(guard.status, 422);
  assert.match(guard.data.error, /خوانش هوشمند پیش‌فاکتور هنوز انجام نشده است/, "تأیید نهایی فقط با جدول تطابق");
  assert.equal((await call(`/sp/x/bundle/${S.b}/accept`, { headers: EX, body: { all: true } })).status, 409, "بی جدول، چیزی برای پذیرفتن نیست");

  const noConfirm = await call(`/sp/x/bundle/${S.b}/ai`, { headers: EX, body: {} });
  assert.equal(noConfirm.status, 428, "مدل فقط با تأیید صریح کارشناس");
  /* خوانش ۱: تومان؛ قلم اول همه ✅ (لایهٔ افزوده هم)، قلم دوم قیمت ۳۲۰ تومان = ۳٬۲۰۰ ریال ≠ ۳٬۰۰۰ ❌؛ ارزش افزوده نیامده ⚠️ */
  const lines1 = [
    { key: "L1", found: true, qty: v(100), unit: { value: "عدد", same: true, sure: true }, unit_price: v(1250),
      layers: [{ name: "اندازه", status: "explicit", seen: "M8", sure: true }, { name: "جنس", status: "explicit", seen: "فولادی", sure: true }, { name: "برند", status: "explicit", seen: "فولاد البرز", sure: true }] },
    { key: "L2", found: true, qty: v(50), unit: { value: "عدد", same: true, sure: true }, unit_price: v(320), layers: [{ name: "مشخصات فنی", status: "explicit", seen: "گرید 8.8", sure: true }] },
  ];
  aiReply = aiOut({ readable: true, currency: "تومان", vat_included: false, ...terms({ vat: v(null, false) }), lines: lines1 });
  const ai = await call(`/sp/x/bundle/${S.b}/ai`, { headers: EX, body: { confirm: true } });
  assert.equal(ai.status, 200, JSON.stringify(ai.data));
  assert.equal(ai.data.ai.ok, false);
  assert.equal(ai.data.ai.cost_usd, 0.007);
  const rowOf = (a, lineId, key) => (lineId ? a.lines.find((l) => l.line_id === lineId).rows : a.header).find((r) => r.key === key);
  assert.deepEqual(["L:اندازه", "L:جنس", "X:برند", "qty", "unit", "price"].map((k) => rowOf(ai.data.ai, S.l1, k).status), ["ok", "ok", "ok", "ok", "ok", "ok"]);
  assert.equal(rowOf(ai.data.ai, S.l1, "price").got, 12500, "تومان ← ریال");
  assert.deepEqual([rowOf(ai.data.ai, S.l2, "price").status, rowOf(ai.data.ai, S.l2, "price").got], ["bad", 3200]);
  assert.equal(rowOf(ai.data.ai, null, "vat").status, "warn");
  assert.equal(rowOf(ai.data.ai, null, "invoice").got, "رسمی", "نوع فاکتور: رسمی مگر سند خلافش را بگوید");
  const req = calls.filter((c) => c.bot === "ai").pop().body;
  assert.match(JSON.stringify(req.messages), /\[L1\] عنوانِ ثبت‌شده: «پیچ آلن M8 فولادی»\\n  نوع قلم: پیچ\\n  لایه‌های ویژگیِ قفل‌شدهٔ خریدار: اندازه = M8 · جنس = فولاد/, "قلم با نوع و لایه‌هایش به مدل می‌رود، نه عنوانِ خام");
  assert.match(JSON.stringify(req.messages), /شرایطِ اعلامیِ تأمین‌کننده برای کلِ بسته: زمان تحویل «10 روز کاری»/);
  assert.match(req.system, /از دریچهٔ همین لایه‌ها بخوان/, "پرامپت: سطرِ سند از دریچهٔ لایه‌ها");

  const xb = async () => (await call(`/sp/thread/${S.th}`, { headers: EX })).data.bundles.find((b) => b.id === S.b);
  let b = await xb();
  assert.equal(b.ready, false);
  assert.ok(b.problems.some((p) => /«مهره M8» \(کد ۲\): «قیمت واحد \(ریال، بی ارزش افزوده\)» با پیش‌فاکتور فرق دارد/.test(p)), b.problems.join(" | "));
  assert.ok(b.problems.some((p) => /«ارزش افزوده» خوانش مطمئن نیست/.test(p)));
  assert.equal((await call(`/sp/x/bundle/${S.b}/accept`, { headers: EX, body: { keys: [`${S.l1}|qty`] } })).status, 422, "ردیفِ ✅ تیک نمی‌خواهد");
  const vat = await call(`/sp/x/bundle/${S.b}/accept`, { headers: EX, body: { keys: ["h|vat"] } });
  assert.equal(vat.status, 200, "هر ردیفِ غیرسبز تیک می‌خورد — پیش‌فاکتور ملاک");
  assert.ok(vat.data.gaps.includes("«ارزش افزوده»"), "آنچه سند نگفته خالی می‌ماند، نه پر از اعلامِ تأمین‌کننده");
  assert.equal((await call(`/sp/x/bundle/${S.b}/accept`, { headers: EX, body: { keys: ["h|vat"], on: false } })).status, 200, "برداشتنِ تیک");
  const acc = await call(`/sp/x/bundle/${S.b}/accept`, { headers: EX, body: { keys: [`${S.l2}|price`] } });
  assert.equal(acc.status, 200, JSON.stringify(acc.data));
  assert.equal(acc.data.ready, false, "ارزش افزوده هنوز مانع است");
  const stillNo = await call(`/sp/x/bundle/${S.b}/decide`, { headers: EX, body: { action: "final" } });
  assert.equal(stillNo.status, 422);
  assert.match(stillNo.data.error, /ارزش افزوده/);

  /* خوانش ۲ (سند کامل‌تر): پذیرش‌های قبلی پاک می‌شوند — سند تازه، بررسی تازه */
  aiReply = aiOut({ readable: true, currency: "تومان", vat_included: false, ...terms(), lines: lines1 });
  assert.equal((await call(`/sp/x/bundle/${S.b}/ai`, { headers: EX, body: { confirm: true } })).status, 200);
  b = await xb();
  assert.deepEqual(b.accept, {}, "خوانش تازه، پذیرش‌ها از نو");
  assert.equal(b.problems.length, 1);
  const all = await call(`/sp/x/bundle/${S.b}/accept`, { headers: EX, body: { all: true } });
  assert.equal(all.data.ready, true, JSON.stringify(all.data));

  const fin = await call(`/sp/x/bundle/${S.b}/decide`, { headers: EX, body: { action: "final" } });
  assert.equal(fin.status, 200, JSON.stringify(fin.data));
  assert.equal(fin.data.quote_ids.length, 2, "تأمین‌کنندهٔ فرضی هم به تب استعلامات می‌رود");
  const q = (item) => DB.raw.prepare("SELECT * FROM quotes WHERE assignment_id=1 AND item_id=? AND supplier_name=?").get(item, DEMO.name);
  const q11 = q(11), q12 = q(12);
  assert.deepEqual([q11.price, q11.qty, q11.unit, q11.dtime, q11.pay, q11.invoice, q11.vat, q11.valid_days], [12500, 100, "عدد", "10 روز کاری", "نقدی", "رسمی", "دارد", "7"]);
  assert.equal(q11.spec, "نوع قلم: پیچ، اندازه: M8، جنس: فولاد، برند: فولاد البرز", "لایه‌های ✅ و لایهٔ افزوده‌ای که سند تأییدش کرد");
  assert.deepEqual([q11.saved, q11.final, q11.origin, q11.source], [1, 1, "supplier", "supplier"], "ثبت موقت (همهٔ اجباری‌ها پر) و تیک تأیید نهایی");
  assert.equal(q12.price, 3200, "مغایرتِ پذیرفته: قیمتِ پیش‌فاکتور، نه قیمتِ اعلامی");
  assert.equal(q12.spec, "مشخصات فنی: گرید 8.8");
  assert.equal(DB.raw.prepare("SELECT source FROM proformas WHERE assignment_id=1 AND supplier_name=?").get(DEMO.name).source, "supplier", "پیش‌فاکتور در تب استعلامات");
  assert.match(evs().pop(), /🏁 تأیید نهایی شد:\n• کد ۱ — پیچ آلن M8 فولادی\n• کد ۲ — مهره M8/);

  const sup = (await call(`/sp/thread/${S.th}`, { headers: H })).data;
  assert.ok(sup.msgs.every((m) => m.kind !== "note"), "یادداشتِ بررسی هوشمند را تأمین‌کننده نمی‌بیند");
  assert.ok(sup.bundles.every((x) => !("ai" in x) && !("accept" in x)), "جدول تطابق در خروجیِ تأمین‌کننده نیست");
  assert.deepEqual(sup.lines.map((l) => l.state), ["final", "final"]);
});

test("تأمین‌کنندهٔ واقعی: کد از ۱ در پنل خودش؛ خطِ استعلامِ موجود با مقدارهای پیش‌فاکتور به‌روز می‌شود (ارزش افزوده از قیمت کم)", { skip: SKIP }, async () => {
  const noLabel = await call("/sp/x/send", { headers: EX, body: { assignment_id: 1, item_ids: [11], supplier_name: "شرکت نمونه", phone: "09121234567" } });
  assert.equal(noLabel.status, 400, "شمارهٔ تازه بی برچسب نه");
  /* «انتخاب جهت استعلام» از پیش: خطی بی قیمت برای همین تأمین‌کننده و قلم */
  const pre = await call("/quotes", { headers: EX, body: { assignment_id: 1, item_ids: [11], supplier_name: "شرکت نمونه", origin: "history" } });
  assert.equal(pre.status, 200, JSON.stringify(pre.data));
  const r = await call("/sp/x/send", { headers: EX, body: { assignment_id: 1, item_ids: [11], supplier_name: "شرکت نمونه", phone: "۰۹۱۲۱۲۳۴۵۶۷", label: "فروش", text: "سلام" } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.phone.label, "فروش");
  const clash = await call("/sp/x/send", { headers: EX, body: { assignment_id: 1, item_ids: [11], supplier_name: "شرکت دیگر", phone: "09121234567", label: "x" } });
  assert.equal(clash.status, 409, "یک شماره مال یک تأمین‌کننده");
  const s = (await call("/sp/login", { body: { k: keyOf(r.data.sms.text), password: passOf(r.data.sms.text) } })).data.session;
  const H = { "X-SP-Session": s };
  const th = (await call(`/sp/thread/${r.data.thread_id}`, { headers: H })).data;
  const id = th.lines[0].id;
  assert.equal(th.lines[0].no, 1, "شمارشِ کد مالِ هر تأمین‌کننده است");
  await call(`/sp/thread/${r.data.thread_id}/terms`, { headers: H, body: { dtime: "1405/08/15", pay: "۵۰٪ پیش‌پرداخت", invoice: "رسمی", vat: "دارد" } });
  await call(`/sp/line/${id}`, { method: "PUT", headers: H, body: { qty: 100, price: 11000 } });
  await call(`/sp/line/${id}/ready`, { headers: H, body: { on: true } });
  const b = (await call(`/sp/thread/${r.data.thread_id}/submit`, { headers: H, body: {} })).data.bundle_id;
  await call(`/sp/x/bundle/${b}/decide`, { headers: EX, body: { action: "approve" } });
  await call(`/sp/bundle/${b}/proforma?filename=pf2.pdf`, { headers: { ...H, "Content-Type": "application/pdf" }, raw: "PDF" });
  const manual = await call(`/sp/x/bundle/${b}/decide`, { headers: EX, body: { action: "final", manual_ok: true } });
  assert.equal(manual.status, 422, "تیکِ «خودم بررسی کردم» دیگر راهِ تأیید نهایی نیست");
  /* سند ریالی با ارزش افزودهٔ داخل قیمت: ۱۲٬۱۰۰ ← ۱۱٬۰۰۰ بی ارزش افزوده = همان اعلامی ✅ */
  aiReply = aiOut({ readable: true, currency: "ریال", vat_included: true, vat_rate: 10, ...terms({ delivery: v("۱۴۰۵/۰۸/۱۵"), pay: { value: "۵۰٪ پیش‌پرداخت", sure: true }, invoice: v("رسمی") }),
    lines: [{ key: "L1", found: true, qty: v(100), unit: { value: "عدد", same: true, sure: true }, unit_price: v(12100),
      layers: [{ name: "اندازه", status: "explicit", seen: "M8", sure: true }, { name: "جنس", status: "explicit", seen: "فولاد", sure: true }] }] });
  const ai = await call(`/sp/x/bundle/${b}/ai`, { headers: EX, body: { confirm: true } });
  assert.equal(ai.data.ai.ok, true, JSON.stringify(ai.data.ai.lines));
  const fin = await call(`/sp/x/bundle/${b}/decide`, { headers: EX, body: { action: "final" } });
  assert.equal(fin.status, 200, JSON.stringify(fin.data));
  assert.deepEqual(fin.data.quote_ids, [pre.data.id], "همان خطِ «انتخاب جهت استعلام»، نه خط تازه");
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM quotes WHERE assignment_id=1 AND item_id=11 AND supplier_name='شرکت نمونه'").get().n, 1);
  const q = DB.raw.prepare("SELECT * FROM quotes WHERE id=?").get(pre.data.id);
  assert.deepEqual([q.price, q.qty, q.dtime, q.pay, q.invoice, q.vat, q.saved, q.final, q.origin], [11000, 100, "1405/08/15", "۵۰٪ پیش‌پرداخت", "رسمی", "دارد", 1, 1, "supplier"]);
  assert.match(q.spec, /نوع قلم: پیچ، اندازه: M8، جنس: فولاد/);
  const p = DB.raw.prepare("SELECT * FROM proformas WHERE assignment_id=1 AND supplier_name='شرکت نمونه'").get();
  assert.equal(p.source, "supplier");
  assert.equal(DB.raw.prepare("SELECT quote_id FROM sp_lines WHERE id=?").get(id).quote_id, q.id);
  S.realK = keyOf(r.data.sms.text); S.realSess = s; S.realTh = r.data.thread_id;
});

test("بات مکاتبات: اتصال کارشناس و تأمین‌کننده، پیامکِ شبیه‌سازی‌شده همان‌جا، پیام دوطرفه، هشدار و «رفتن به این گفت‌وگو»", { skip: SKIP }, async () => {
  const link = (await call("/sp/x/tglink", { headers: EX, body: {} })).data;
  assert.match(link.url, /^https:\/\/t\.me\/AriaSupplierBot\?start=e[0-9a-f]{24}$/, "نام بات از getMe");
  const token = link.url.split("start=")[1];
  const EC = 900, SC = 901;
  let n = calls.length;
  await handleSpUpdate(env, { update_id: 1, message: { message_id: 10, chat: { id: EC, type: "private" }, text: `/start ${token}` } });
  assert.equal(DB.raw.prepare("SELECT role, expert_id FROM sp_tg WHERE chat=?").get(String(EC)).role, "e");
  assert.ok(since(n).some((c) => c.bot === "sp" && c.method === "setChatMenuButton" && c.body.menu_button.web_app.url === "https://site.test/tamin-poshtibani/correspond.html?tg=1"));
  const kb = sent(n, "sp", EC)[0].body.reply_markup.keyboard;
  assert.deepEqual(kb[0].map((b) => b.text), ["📋 لیست درخواست‌ها", "🏷 لیست تأمین‌کنندگان"], "منوی ثابت پایین");
  n = calls.length;
  await handleSpUpdate(env, { update_id: 2, message: { message_id: 11, chat: { id: EC, type: "private" }, text: `/start ${token}` } });
  assert.match(sent(n, "sp", EC).pop().body.text, /معتبر نیست/, "لینک یک‌بارمصرف");

  /* «ارسال رمز به پیامک»: پیامکِ شبیه‌سازی‌شده در بات مکاتباتِ کارشناس — نه در بات کارشناسان */
  n = calls.length;
  const resend = await call("/sp/resend", { body: { k: S.realK } });
  assert.equal(resend.status, 200);
  assert.match(resend.data.note, /بات مکاتبات/);
  const simSms = sent(n, "sp", EC).find((c) => /پیامک شبیه‌سازی‌شده/.test(c.body.text));
  assert.ok(simSms, "دمو: رمز تازه در گفت‌وگوی کارشناس در بات مکاتبات");
  assert.ok(btns(simSms).some((b) => b.callback_data === `go:${S.realTh}:e`), "و دکمهٔ رفتن به همان گفت‌وگو");
  assert.equal(sent(n, "main").length, 0, "بات کارشناسان از مکاتبات چیزی نمی‌گیرد");
  const pass = /رمز ورود: (\d{6})/.exec(simSms.body.text)[1];
  await handleSpUpdate(env, { update_id: 3, message: { message_id: 20, chat: { id: SC, type: "private" }, text: `/start s${S.realK}` } });
  assert.equal(DB.raw.prepare("SELECT role FROM sp_tg WHERE chat=?").get(String(SC)).role, "p");
  n = calls.length;
  await handleSpUpdate(env, { update_id: 4, message: { message_id: 21, chat: { id: SC, type: "private" }, text: pass } });
  const row = DB.raw.prepare("SELECT * FROM sp_tg WHERE chat=?").get(String(SC));
  assert.equal(row.role, "s");
  assert.equal(row.focus, S.realTh, "تنها استعلام همان لحظه باز می‌شود");
  assert.ok(sent(n, "sp", SC).some((c) => /اقلام استعلام R-1/.test(c.body.text) && /کد ۱ · پیچ آلن M8 فولادی/.test(c.body.text)), "کارت اقلام با کد");

  /* پیام تأمین‌کننده ← کارشناس (گفت‌وگوی دیگری باز ندارد: هشدار با دکمهٔ رفتن) */
  n = calls.length;
  await handleSpUpdate(env, { update_id: 5, message: { message_id: 22, chat: { id: SC, type: "private" }, text: "قیمت با حمل است؟" } });
  const alert = sent(n, "sp", EC)[0];
  assert.match(alert.body.text, /🔔 <b>شرکت نمونه<\/b>/);
  assert.equal(alert.body.reply_markup.inline_keyboard[0][0].callback_data, `go:${S.realTh}:e`);
  assert.equal(sent(n, "main").length, 0, "پیامِ تأمین‌کننده در بات کارشناسان نمی‌آید");

  n = calls.length;
  await handleSpUpdate(env, { update_id: 6, callback_query: { id: "c1", data: `go:${S.realTh}:e`, message: { message_id: 1, chat: { id: EC } } } });
  const del = since(n).find((c) => c.bot === "sp" && c.method === "deleteMessages");
  assert.ok(del && del.body.message_ids.includes(10), "پیام‌های قبلیِ صفحه پاک می‌شوند");
  const text = sent(n, "sp", EC).map((c) => c.body.text).join("\n");
  assert.match(text, /💬 <b>شرکت نمونه<\/b>/);
  assert.match(text, /قیمت با حمل است؟/, "تاریخچهٔ کامل");
  assert.equal(DB.raw.prepare("SELECT focus FROM sp_tg WHERE chat=?").get(String(EC)).focus, S.realTh);

  /* پاسخ کارشناس ← تأمین‌کننده (همین گفت‌وگو جلوی چشم اوست: خودِ پیام) */
  n = calls.length;
  await handleSpUpdate(env, { update_id: 7, message: { message_id: 30, chat: { id: EC, type: "private" }, text: "بله، تا انبار." } });
  assert.match(sent(n, "sp", SC)[0].body.text, /کارشناس — آقای یک<\/b>.*\nبله، تا انبار\./s);
  const web = (await call(`/sp/thread/${S.realTh}`, { headers: { "X-SP-Session": S.realSess } })).data;
  assert.equal(web.msgs.filter((m) => m.kind === "text").pop().body, "بله، تا انبار.", "وب و بات یک وضعیت");
});

test("بات خالص، سراسر: پر کردن گام‌به‌گام، «آمادهٔ ارسال» ← فقط «ویرایش» و «ارسال»؛ جدول تطابق و پذیرش در بات کارشناس", { skip: SKIP }, async () => {
  const EC = 900, SC = 901;
  const sp = async (u) => { await handleSpUpdate(env, { update_id: 100 + calls.length, ...u }); };
  const cb = (chat, data) => sp({ callback_query: { id: `q${calls.length}`, data, message: { message_id: 1, chat: { id: chat } } } });
  const txt = (chat, text, extra) => sp({ message: { message_id: 500 + calls.length, chat: { id: chat, type: "private" }, text, ...(extra || {}) } });
  const lastTo = (n, chat) => shown(n, "sp", chat).pop();

  /* قلم دوم به همان تأمین‌کننده: همان گفت‌وگو (درخواست × تأمین‌کننده)، خطِ تازه با کدِ بعدی */
  const r = await call("/sp/x/send", { headers: EX, body: { assignment_id: 1, item_ids: [12], supplier_name: "شرکت نمونه", phone: "09121234567" } });
  assert.equal(r.data.thread_id, S.realTh);
  const line = DB.raw.prepare("SELECT id, no FROM sp_lines WHERE thread_id=? AND item_id=12").get(S.realTh);
  assert.equal(line.no, 2);

  let n = calls.length;
  await cb(SC, `si:${line.id}`);
  assert.match(lastTo(n, SC).body.text, /کد ۲ · مهره M8[\s\S]*📦 <b>مقدار، واحد و قیمت<\/b>[\s\S]*قیمت واحد \(ریال، بدون ارزش افزوده\)[\s\S]*🧾 <b>شرایط فاکتور<\/b>[\s\S]*🔒 <b>نوع قلم و لایه‌های ویژگی<\/b>\n• مشخصات فنی: گرید 8\.8/, "سه بخش: مقدار و قیمت، شرایط، نوع قلم و لایه‌ها");
  /* «🔢 مقدار» ← دکمهٔ «همان مقدار درخواست» ← بات خودش قیمت را می‌پرسد */
  n = calls.length;
  await cb(SC, `sv:${line.id}:q`);
  const ask = lastTo(n, SC);
  assert.ok(btns(ask).some((b) => b.callback_data === `sv:${line.id}:qd` && /همان مقدار درخواست \(۵۰ عدد\)/.test(b.text)));
  n = calls.length;
  await cb(SC, `sv:${line.id}:qd`);
  assert.match(lastTo(n, SC).body.text, /مقدار ثبت شد[\s\S]*ریال و بدون ارزش افزوده/, "گام بعد خودکار: قیمت واحد");
  n = calls.length;
  await txt(SC, "3,200");
  assert.match(lastTo(n, SC).body.text, /همه‌چیز پر است/);
  await cb(SC, `sv:${line.id}:l`); await txt(SC, "برند: نمونه‌سازان");
  let L = DB.raw.prepare("SELECT * FROM sp_lines WHERE id=?").get(line.id);
  assert.equal(L.qty, 50); assert.equal(L.price, 3200); assert.equal(L.unit, "عدد");
  assert.deepEqual(JSON.parse(L.extra_json), [{ k: "برند", v: "نمونه‌سازان" }]);
  await cb(SC, `sv:${line.id}:l`);
  n = calls.length;
  await txt(SC, "مشخصات فنی: گرید 10");
  assert.match(lastTo(n, SC).body.text, /قفل‌شدهٔ کارشناس/, "لایهٔ قفل از بات هم تغییر نمی‌کند");
  await cb(SC, "xc:0");

  /* پیوست با برچسب از فهرست، و کپشن = توضیح */
  await cb(SC, `sa:${line.id}`);
  await cb(SC, `sa:${line.id}:0`);
  await sp({ message: { message_id: 900, chat: { id: SC, type: "private" }, document: { file_id: "F1", file_size: 10, file_name: "cert.pdf", mime_type: "application/pdf" }, caption: "گواهی ۱۴۰۵" } });
  const f = DB.raw.prepare("SELECT * FROM sp_files WHERE line_id=?").get(line.id);
  assert.deepEqual([f.label, f.note, f.filename], ["گواهی کیفیت", "گواهی ۱۴۰۵", "cert.pdf"]);
  assert.ok(calls.some((c) => c.bot === "store" && c.method === "POST"), "فایل تلگرام جریانی به انبار رفت");

  /* «آمادهٔ ارسال» ← دو راه: «✏️ ویرایش» و «📤 ارسال» */
  n = calls.length;
  await cb(SC, `sr:${line.id}:1`);
  const ready = lastTo(n, SC);
  assert.match(ready.body.text, /این قلم آمادهٔ ارسال است/);
  assert.deepEqual(ready.body.reply_markup.inline_keyboard[0].map((b) => [b.text, b.callback_data]), [["✏️ ویرایش", `sr:${line.id}:0`], ["📤 ارسال", `ss:${S.realTh}`]]);
  assert.ok(!btns(ready).some((b) => /^sv:/.test(b.callback_data)), "قلمِ آماده دیگر دکمهٔ ویرایشِ تک‌فیلد ندارد");
  n = calls.length;
  await cb(SC, `sr:${line.id}:0`);
  assert.ok(btns(lastTo(n, SC)).some((b) => b.callback_data === `sv:${line.id}:p`), "«✏️ ویرایش»: دوباره پیش‌نویس");
  await cb(SC, `sr:${line.id}:1`);
  n = calls.length;
  await cb(SC, `ss:${S.realTh}`);
  const askPf = lastTo(n, SC);
  assert.match(askPf.body.text, /پیش‌فاکتورِ همین اقلام را هم دارید؟/);
  assert.deepEqual(btns(askPf).slice(0, 2).map((b) => b.callback_data), [`sq:${S.realTh}:pf`, `sq:${S.realTh}:go`], "با پیش‌فاکتور یا فقط مشخصات");
  n = calls.length;
  await cb(SC, `sq:${S.realTh}:go`);
  const bid = DB.raw.prepare("SELECT bundle_id FROM sp_lines WHERE id=?").get(line.id).bundle_id;
  assert.ok(bid);
  const toExpert = sent(n, "sp", EC);
  assert.ok(toExpert.some((m) => /مشخصات ۱ قلم برای بررسی فرستاده شد:\n▫️ کد ۲ — مهره M8\n {4}۵۰ عدد × ۳٬۲۰۰ ریال/.test(m.body.text)), "پیامِ ارسال: کد و عنوان، زیرش مقدار و قیمت");
  assert.ok(toExpert.some((m) => btns(m).some((b) => b.callback_data === `xd:${bid}:ok`)), "کارشناسِ همان گفت‌وگو کارت بسته را با دکمه‌های تصمیم می‌گیرد");

  n = calls.length;
  await cb(EC, `xd:${bid}:ok`);
  const toSup = sent(n, "sp", SC);
  assert.ok(toSup.some((m) => /مشخصات تأیید شد[\s\S]*کد ۲ — مهره M8/.test(m.body.text) && btns(m).some((b) => b.callback_data === `sp:${bid}`)), "تأمین‌کننده: نام و کد، و دکمهٔ «ارسال پیش‌فاکتور»");
  await cb(SC, `sp:${bid}`);
  n = calls.length;
  await sp({ message: { message_id: 901, chat: { id: SC, type: "private" }, document: { file_id: "F2", file_size: 10, file_name: "pf.pdf", mime_type: "application/pdf" } } });
  assert.equal(DB.raw.prepare("SELECT state FROM sp_bundles WHERE id=?").get(bid).state, "proforma");
  assert.ok(sent(n, "sp", EC).some((m) => /پیش‌فاکتور «pf\.pdf» رسید برای:\n• کد ۲ — مهره M8/.test(m.body.text)));
  assert.ok(sent(n, "sp", EC).some((m) => btns(m).some((b) => b.callback_data === `xd:${bid}:ai`)));

  n = calls.length;
  await cb(EC, `xd:${bid}:fn`);
  const warn = lastTo(n, EC);
  assert.match(warn.body.text, /تأیید نهایی هنوز ممکن نیست/);
  assert.ok(btns(warn).some((b) => b.callback_data === `xd:${bid}:rt`) && btns(warn).some((b) => b.callback_data === `xd:${bid}:card`), "راه‌ها: برگرداندن یا کارت و جدول");
  n = calls.length;
  await cb(EC, `xd:${bid}:ai`);
  const cost = lastTo(n, EC);
  assert.match(cost.body.text, /انجام شود؟/, "پیش از مدل تأیید می‌خواهد");
  assert.doesNotMatch(cost.body.text, /هزینه|دلار/, "هزینهٔ کار با مدل به کاربر گفته نمی‌شود");
  assert.ok(btns(cost).some((b) => b.callback_data === `xd:${bid}:ai2`));
  /* سند: قیمت ۳٬۳۰۰ ≠ ۳٬۲۰۰ ❌؛ برند «سازه‌گستر» ≠ «نمونه‌سازان» (ردیف اطلاعاتی) */
  /* شرایطِ سند همان شرایطِ اعلامیِ این گفت‌وگو (آزمون «تأمین‌کنندهٔ واقعی») */
  aiReply = aiOut({ readable: true, currency: "ریال", vat_included: false, ...terms({ delivery: v("۱۴۰۵/۰۸/۱۵"), pay: { value: "۵۰٪ پیش‌پرداخت", sure: true } }),
    lines: [{ key: "L1", found: true, qty: v(50), unit: { value: "عدد", same: true, sure: true }, unit_price: v(3300),
      layers: [{ name: "مشخصات فنی", status: "explicit", seen: "گرید 8.8", sure: true }, { name: "برند", status: "different", seen: "سازه‌گستر", sure: true }] }] });
  n = calls.length;
  await cb(EC, `xd:${bid}:ai2`);
  const card = lastTo(n, EC);
  assert.match(card.body.text, /جدول تطابق با پیش‌فاکتور/);
  assert.match(card.body.text, /✅ مشخصات فنی: گرید 8\.8/);
  assert.match(card.body.text, /❌ قیمت واحد \(ریال، بی ارزش افزوده\): ۳٬۲۰۰ ← سند: ۳٬۳۰۰/);
  assert.match(card.body.text, /❌ برند: نمونه‌سازان ← سند: سازه‌گستر <i>\(اطلاعاتی\)<\/i>/);
  assert.match(card.body.text, /✅ نوع فاکتور: رسمی <i>\(پیش‌فرضِ شرکت\)<\/i>/);
  const priceBtn = btns(card).find((b) => /^xa:/.test(b.callback_data) && /قیمت واحد/.test(b.text));
  assert.ok(priceBtn, "دکمهٔ پذیرشِ همان ردیف");
  assert.ok(btns(card).some((b) => b.callback_data === `xd:${bid}:aa`), "و «پذیرش همه»");
  n = calls.length;
  await cb(EC, priceBtn.callback_data);
  const accepted = lastTo(n, EC);
  assert.match(accepted.body.text, /❌☑️ قیمت واحد/, "نشانهٔ وضعیت می‌ماند و تیک کنارش");
  assert.doesNotMatch(accepted.body.text, /دلار/);
  assert.match(accepted.body.text, /همه‌چیز برای تأیید نهایی آماده است/);
  n = calls.length;
  await cb(EC, `xd:${bid}:fn`);
  assert.equal(DB.raw.prepare("SELECT state FROM sp_bundles WHERE id=?").get(bid).state, "final");
  L = DB.raw.prepare("SELECT * FROM sp_lines WHERE id=?").get(line.id);
  const q = DB.raw.prepare("SELECT * FROM quotes WHERE id=?").get(L.quote_id);
  assert.equal(q.price, 3300, "قیمتِ پیش‌فاکتور");
  assert.equal(q.spec, "مشخصات فنی: گرید 8.8", "لایهٔ افزوده‌ای که سند چیز دیگری گفت و پذیرفته نشد، وارد نمی‌شود");
  assert.ok(sent(n, "sp", SC).some((m) => /🏁 تأیید نهایی شد:\n• کد ۲ — مهره M8/.test(m.body.text)), "تأمین‌کننده: نام و کدِ قلمِ تأییدشده");

  /* فهرست درخواست‌های کارشناس در بات */
  n = calls.length;
  await cb(EC, "xl:r");
  const list = lastTo(n, EC);
  assert.match(list.body.text, /درخواست‌هایی که گفت‌وگو دارند/);
  assert.ok(btns(list).some((b) => b.callback_data === "xr:1"));
});

test("مذاکره: برگشت با توضیح ← اصلاح و ارسال دوباره ← رد با دلیلِ نوشتاری در بات", { skip: SKIP }, async () => {
  const EC = 900;
  const r = await call("/sp/x/send", { headers: EX, body: { assignment_id: 1, item_ids: [11], supplier_name: "شرکت سوم", phone: "09120000003", label: "همراه" } });
  const H = { "X-SP-Session": (await call("/sp/login", { body: { k: keyOf(r.data.sms.text), password: passOf(r.data.sms.text) } })).data.session };
  const id = (await call(`/sp/thread/${r.data.thread_id}`, { headers: H })).data.lines[0].id;
  await call(`/sp/thread/${r.data.thread_id}/terms`, { headers: H, body: { dtime: "20", pay: "نقدی", invoice: "رسمی", vat: "ندارد" } });
  await call(`/sp/line/${id}`, { method: "PUT", headers: H, body: { price: 99000 } });
  await call(`/sp/line/${id}/ready`, { headers: H, body: { on: true } });
  const b1 = (await call(`/sp/thread/${r.data.thread_id}/submit`, { headers: H, body: {} })).data.bundle_id;
  const ret = await call(`/sp/x/bundle/${b1}/decide`, { headers: EX, body: { action: "return", comment: "قیمت با حمل تا کارگاه باشد." } });
  assert.equal(ret.data.state, "returned");
  const th = (await call(`/sp/thread/${r.data.thread_id}`, { headers: H })).data;
  assert.equal(th.lines[0].state, "returned");
  assert.match(th.msgs.pop().body, /برای اصلاح برگشت خورد:\n• کد ۱ — پیچ آلن M8 فولادی\n💬 قیمت با حمل تا کارگاه باشد/);
  assert.equal((await call(`/sp/line/${id}`, { method: "PUT", headers: H, body: { price: 105000 } })).status, 200, "برگشت‌خورده دوباره قابل ویرایش");
  await call(`/sp/line/${id}/ready`, { headers: H, body: { on: true } });
  const b2 = (await call(`/sp/thread/${r.data.thread_id}/submit`, { headers: H, body: {} })).data.bundle_id;
  assert.notEqual(b2, b1);
  await handleSpUpdate(env, { update_id: 9001, callback_query: { id: "rj", data: `xd:${b2}:rj`, message: { message_id: 1, chat: { id: EC } } } });
  await handleSpUpdate(env, { update_id: 9002, message: { message_id: 9002, chat: { id: EC, type: "private" }, text: "قیمت از بازار بالاتر است." } });
  const b = DB.raw.prepare("SELECT state, comment FROM sp_bundles WHERE id=?").get(b2);
  assert.deepEqual({ ...b }, { state: "rejected", comment: "قیمت از بازار بالاتر است." });
  assert.equal(DB.raw.prepare("SELECT flow_json FROM sp_tg WHERE chat=?").get(String(EC)).flow_json, null, "پرسشِ دلیل بسته شد");
  assert.match(DB.raw.prepare("SELECT body FROM sp_msgs WHERE thread_id=? ORDER BY id DESC LIMIT 1").get(r.data.thread_id).body, /❌ رد شد:\n• کد ۱ — پیچ آلن M8 فولادی\n💬 قیمت از بازار بالاتر است\./);
});

/* initData امضاشده، همان‌طور که تلگرام می‌سازد */
const enc = (s) => new TextEncoder().encode(s);
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
async function initData(token, user, at = Math.floor(Date.now() / 1000)) {
  const p = new URLSearchParams({ auth_date: String(at), query_id: "q", user: JSON.stringify(user), signature: "sig" });
  const dcs = [...p.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => `${k}=${x}`).join("\n");
  const k1 = await crypto.subtle.importKey("raw", enc("WebAppData"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sec = await crypto.subtle.sign("HMAC", k1, enc(token));
  const k2 = await crypto.subtle.importKey("raw", sec, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  p.set("hash", hex(await crypto.subtle.sign("HMAC", k2, enc(dcs))));
  return p.toString();
}

test("مینی‌اپ: initData امضاشده با توکن همان بات؛ دستکاری‌شده یا کهنه پذیرفته نیست؛ پنل کارشناس داخل بات کارشناسان بی کد ورود", { skip: SKIP }, async () => {
  const good = await initData("sptok", { id: 901, first_name: "x" });
  assert.equal((await verifyInitData("sptok", good)).id, 901);
  assert.equal(await verifyInitData("other", good), null, "توکن دیگر");
  assert.equal(await verifyInitData("sptok", good.replace("901", "902")), null, "دستکاری");
  assert.equal(await verifyInitData("sptok", await initData("sptok", { id: 901 }, Math.floor(Date.now() / 1000) - 3 * 86400)), null, "کهنه");
  const me = await call("/sp/me", { headers: { "X-TG-Init": good } });
  assert.equal(me.status, 200, JSON.stringify(me.data));
  assert.equal(me.data.via, "telegram");
  assert.equal(me.data.me.name, "شرکت نمونه");
  const ex = await call("/sp/x/threads", { headers: { "X-TG-Init": await initData("sptok", { id: 900 }) } });
  assert.equal(ex.status, 200, "کارشناسِ وصل‌شده به بات مکاتبات");
  const stranger = await call("/sp/me", { headers: { "X-TG-Init": await initData("sptok", { id: 999 }) } });
  assert.equal(stranger.status, 401);

  /* مینی‌اپِ بات کارشناسان: کارشناسی که گفت‌وگویش به حسابش گره خورده — پنل کارشناس و صفحهٔ مکاتبات */
  const main = await initData("tok", { id: EXPERT_CHAT });
  const pm = await call("/me", { headers: { "X-TG-Init": main } });
  assert.equal(pm.status, 200, JSON.stringify(pm.data));
  assert.equal(pm.data.expert.id, 1);
  assert.equal(pm.data.expert.code, undefined, "کد ورود به مینی‌اپ برنمی‌گردد");
  assert.equal((await call("/tray?full=1", { headers: { "X-TG-Init": main } })).status, 200, "کارتابل پنل کارشناس");
  assert.equal((await call("/sp/x/threads", { headers: { "X-TG-Init": main } })).status, 200, "صفحهٔ مکاتبات از همان مینی‌اپ");
  assert.equal((await call("/me", { headers: { "X-TG-Init": await initData("tok", { id: 4242 }) } })).status, 401, "حسابِ وصل‌نشده");
  assert.equal((await call("/me", { headers: { "X-TG-Init": await initData("sptok", { id: EXPERT_CHAT }) } })).status, 401, "امضای بات دیگر برای همان شناسه");
});

test("«📨 ارسال» از «بررسی سوابق» برای همهٔ کارشناسان؛ پیامکِ شبیه‌سازی‌شده در بات مکاتبات، نه در بات کارشناسان", { skip: SKIP }, async () => {
  const isMenu = (c) => !!(c.body.reply_markup && c.body.reply_markup.keyboard);
  const press = async (data, mid = 700) => {
    const n = calls.length;
    await handleUpdate(env, { callback_query: { id: `m${n}`, data, message: { message_id: mid, chat: { id: EXPERT_CHAT } } } });
    const mine = since(n).filter((c) => c.bot === "main");
    const msgs = mine.filter((c) => (c.method === "sendMessage" || c.method === "editMessageText") && !isMenu(c));
    const last = msgs[msgs.length - 1];
    const ackCall = mine.find((c) => c.method === "answerCallbackQuery");
    return { n, text: last ? last.body.text : "", kb: last && last.body.reply_markup ? last.body.reply_markup.inline_keyboard : [], ack: ackCall ? ackCall.body : null };
  };
  const btn = (kb, t) => { const b = kb.flat().find((x) => x.text.includes(t)); return b && (b.callback_data || b.url || b.copy_text); };
  const flowOf = (kb) => /hx:(\d+):t:/.exec(JSON.stringify(kb))[1];

  /* از مهر ۱۴۰۵ برای همهٔ کارشناسان، بی /azmayesh */
  const sel0 = await press("hs:a:1");
  const card0 = await press(`hv:${flowOf(sel0.kb)}:11:h:0`);
  assert.match(card0.text, /سوابق «پیچ آلن M8 فولادی»/);
  assert.ok(btn(card0.kb, "ارسال به تأمین‌کننده"), "کارتِ قلمِ سوابق «📨 ارسال» دارد");

  const az = calls.length;
  await handleUpdate(env, { message: { message_id: 1, chat: { id: EXPERT_CHAT, type: "private" }, text: "/azmayesh" } });
  assert.match(sent(az, "main", EXPERT_CHAT).pop().body.text, /برای همهٔ کارشناسان روشن است/);
  const smart = await press("sg:50:t:0:7:11");
  assert.ok(btn(smart.kb, "کپی پیام"));
  assert.ok(!btn(smart.kb, "ارسال به تأمین‌کننده"), "جستجوی هوشمند دیگر «ارسال» ندارد");
  const legacy = await press("spx:50:0:7:11");
  assert.match(legacy.ack.text, /بررسی سوابق/, "دکمهٔ قدیمیِ جستجو راه تازه را نشان می‌دهد");

  const sel = await press("hs:a:1");
  const fid = flowOf(sel.kb);
  const card = await press(`hv:${fid}:11:h:0`);
  const hz = btn(card.kb, "ارسال به تأمین‌کننده");
  assert.equal(hz, `hz:${fid}:11:h`);
  const sup = await press(hz);
  assert.match(sup.text, /ارسال استعلام<\/b> — «پیچ آلن M8 فولادی»/);
  assert.equal(btn(sup.kb, "بازگشت به کارت قلم"), `hv:${fid}:11:h:0`);
  const tpl = await press(btn(sup.kb, "تأمین‌کنندهٔ فرضی"));
  assert.match(tpl.text, /کدام قالب؟/);
  const conf = await press(btn(tpl.kb, "رسمی"));
  assert.match(conf.text, /ارسال به تأمین‌کنندهٔ فرضی آریانا \(دمو\)[\s\S]*09000000000 \(دمو\)[\s\S]*سلام تأمین‌کنندهٔ فرضی آریانا \(دمو\)؛ برای پیچ آلن M8 فولادی به مقدار 100 عدد/);
  const done = await press(btn(conf.kb, "ارسال"));
  assert.match(done.text, /فرستاده شد<\/b> — استعلام «پیچ آلن M8 فولادی»/);
  assert.match(done.text, /همین الان در «بات مکاتبات» برایتان آمد/);
  assert.doesNotMatch(done.text, /رمز ورود/, "متنِ پیامک (با رمز) در بات کارشناسان نمی‌آید");
  assert.equal(btn(done.kb, "بات مکاتبات"), "https://t.me/AriaSupplierBot");
  assert.equal(btn(done.kb, "صفحهٔ مکاتبات"), "https://site.test/tamin-poshtibani/correspond.html");
  assert.equal(btn(done.kb, "بازگشت به کارت قلم"), `hv:${fid}:11:h:0`);
  const sms = sent(done.n, "sp", 900).find((c) => /پیامک شبیه‌سازی‌شده/.test(c.body.text));
  assert.ok(sms, "پیامکِ شبیه‌سازی‌شده در بات مکاتباتِ همین کارشناس");
  assert.match(btns(sms).find((b) => /پنل تأمین‌کننده/.test(b.text)).url, /^https:\/\/site\.test\/tamin-poshtibani\/supplier\.html#k=/);
  assert.match(btns(sms).find((b) => /بات تأمین‌کننده/.test(b.text)).url, /^https:\/\/t\.me\/AriaSupplierBot\?start=s/);
  const latest = /رمز ورود: (\d{6})/.exec(sms.body.text)[1];
  assert.equal((await call("/sp/login", { body: { k: S.demoK, password: latest } })).status, 200, "رمزِ همین پیامک");
  assert.equal((await call("/sp/login", { body: { k: S.demoK, password: S.demoPass } })).status, 200, "و رمزِ پیامک‌های قبلی هم هنوز");
  S.demoLatest = latest;
});

test("کارشناسی که بات مکاتبات را وصل نکرده: پیامک با لینکِ اتصال نگه داشته و بعد از اتصال همان‌جا نشان داده می‌شود", { skip: SKIP }, async () => {
  const EX2 = { "X-Expert-Code": "9002" };
  const r = await call("/sp/x/send", { headers: EX2, body: { assignment_id: 2, item_ids: [21], supplier_name: "شرکت چهارم", phone: "09120000004", label: "دفتر" } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  let n = calls.length;
  const rs = await call("/sp/resend", { body: { k: keyOf(r.data.sms.text) } });
  assert.match(rs.data.note, /بعد از اتصالِ کارشناس/);
  const pointer = sent(n, "main", EXPERT2_CHAT)[0];
  assert.ok(pointer, "بات کارشناسان فقط خبر می‌دهد");
  assert.doesNotMatch(pointer.body.text, /رمز ورود/, "بی متنِ پیامک");
  const url = btns(pointer).find((b) => /بات مکاتبات/.test(b.text)).url;
  const token = url.split("start=")[1];
  assert.ok(DB.raw.prepare("SELECT payload FROM sp_links WHERE token=?").get(token).payload, "پیامک منتظرِ اتصال");
  n = calls.length;
  await handleSpUpdate(env, { update_id: 7001, message: { message_id: 70, chat: { id: 902, type: "private" }, text: `/start ${token}` } });
  const got = sent(n, "sp", 902).find((c) => /پیامک شبیه‌سازی‌شده/.test(c.body.text));
  assert.ok(got && /رمز ورود: \d{6}/.test(got.body.text), "بعد از اتصال، پیامک همان‌جا");
  assert.equal(DB.raw.prepare("SELECT payload FROM sp_links WHERE token=?").get(token).payload, null, "و از جدول پاک شد");
});

test("یک گفت‌وگو، دو نقش: کارشناس همان حساب را تأمین‌کنندهٔ فرضی هم می‌کند؛ هشدارِ نقشِ دیگر، «🔁»، و خروجی که نقش کارشناس را نگه می‌دارد", { skip: SKIP }, async () => {
  const EC = 900;
  const txt = (text) => handleSpUpdate(env, { update_id: 8000 + calls.length, message: { message_id: 800 + calls.length, chat: { id: EC, type: "private" }, text } });
  const tg = () => DB.raw.prepare("SELECT role, expert_id, phone_id, focus FROM sp_tg WHERE chat=?").get(String(EC));
  const demoPhone = DB.raw.prepare("SELECT id FROM sp_phones WHERE k=?").get(S.demoK).id;

  await txt(`/start s${S.demoK}`);
  assert.deepEqual({ ...tg(), focus: undefined }, { role: "p", expert_id: 1, phone_id: null, focus: undefined }, "منتظر رمز؛ هویتِ کارشناس می‌ماند");
  let n = calls.length;
  await txt("📋 لیست درخواست‌ها");
  assert.equal(tg().role, "e", "دکمهٔ منوی کارشناس وسطِ ورود: برگشت به نقش کارشناس، نه «رمز اشتباه»");
  assert.ok(sent(n, "sp", EC).some((c) => /درخواست‌هایی که گفت‌وگو دارند/.test(c.body.text)));

  await txt(`/start s${S.demoK}`);
  n = calls.length;
  await txt(S.demoLatest);
  assert.deepEqual({ ...tg(), focus: undefined }, { role: "s", expert_id: 1, phone_id: demoPhone, focus: undefined });
  const menu = sent(n, "sp", EC).find((c) => c.body.reply_markup && c.body.reply_markup.keyboard);
  assert.ok(menu.body.reply_markup.keyboard.flat().some((b) => b.text === "🔁 نقش کارشناس"), "دکمهٔ عوض کردن نقش");

  /* پیامِ تأمین‌کنندهٔ فرضی (همین گفت‌وگو) ← هشدار برای نقشِ کارشناسِ همین گفت‌وگو */
  n = calls.length;
  await txt("سلام از طرف تأمین‌کننده");
  const alert = sent(n, "sp", EC).find((c) => /🔔/.test(c.body.text));
  assert.match(alert.body.text, /\(نقش کارشناس\)/);
  assert.equal(btns(alert)[0].callback_data, `go:${S.th}:e`);
  await handleSpUpdate(env, { update_id: 8500, callback_query: { id: "sw", data: `go:${S.th}:e`, message: { message_id: 1, chat: { id: EC } } } });
  assert.deepEqual([tg().role, tg().focus], ["e", S.th], "«رفتن به این گفت‌وگو» نقش را هم عوض کرد");
  await txt("🔁 نقش تأمین‌کننده");
  assert.equal(tg().role, "s");

  n = calls.length;
  await txt("🚪 خروج");
  assert.deepEqual({ ...tg(), focus: undefined }, { role: "e", expert_id: 1, phone_id: null, focus: undefined }, "خروجِ تأمین‌کننده؛ کارشناس می‌ماند");
  assert.ok(sent(n, "sp", EC).some((c) => c.body.reply_markup && c.body.reply_markup.keyboard && c.body.reply_markup.keyboard[0][0].text === "📋 لیست درخواست‌ها"), "منوی کارشناس برمی‌گردد");
  assert.equal((await call("/sp/login", { body: { k: S.demoK, password: S.demoLatest } })).status, 401, "رمزهای پیامک باطل شد");
});

test("تب استعلامات پنل کارشناس: ورود و ویرایش دستیِ خط استعلام بسته است؛ تیک «تأیید نهایی» و «ثبت موقت» می‌ماند", { skip: SKIP }, async () => {
  const q = DB.raw.prepare("SELECT id FROM quotes WHERE origin='supplier' ORDER BY id LIMIT 1").get();
  const price = await call(`/quotes/${q.id}`, { method: "PUT", headers: EX, body: { price: 1 } });
  assert.equal(price.status, 403);
  assert.deepEqual(price.data.locked, ["price"]);
  const many = await call(`/quotes/${q.id}`, { method: "PUT", headers: EX, body: { dtime: "10", pay: "نقدی", item_id: 12 } });
  assert.equal(many.status, 403);
  assert.deepEqual(many.data.locked.sort(), ["dtime", "item_id", "pay"]);
  assert.equal((await call(`/quotes/${q.id}`, { method: "PUT", headers: EX, body: { final: 1 } })).status, 200, "تیک تأیید نهایی");
  assert.equal((await call(`/quotes/${q.id}`, { method: "PUT", headers: EX, body: { save: true } })).status, 200, "خطِ آمده از پنل تأمین‌کننده کامل است: ثبت موقت");
  const created = await call("/quotes", { headers: EX, body: { assignment_id: 1, item_ids: [12], supplier_name: "تأمین‌کنندهٔ دستی", price: 999, qty: 7, spec: "دستی", unit: "تن" } });
  assert.equal(created.status, 200);
  const row = DB.raw.prepare("SELECT price, qty, unit, spec FROM quotes WHERE id=?").get(created.data.id);
  assert.deepEqual({ ...row }, { price: null, qty: 50, unit: "عدد", spec: null }, "خط تازه فقط نام دارد؛ واحد و مقدار همان خواستهٔ قلم");
  const save = await call(`/quotes/${created.data.id}`, { method: "PUT", headers: EX, body: { save: true } });
  assert.equal(save.status, 422, "ثبت موقت فقط با فیلدهای اجباریِ پر");
  assert.ok((save.data.missing || []).includes("price"));
});

test("خروج: رمز باطل؛ ورود دوباره فقط با رمز تازه؛ پنج رمز اشتباه ← قفل", { skip: SKIP }, async () => {
  const H = { "X-SP-Session": S.realSess };
  assert.equal((await call("/sp/logout", { headers: H, body: {} })).status, 200);
  assert.equal((await call("/sp/me", { headers: H })).status, 401, "نشست باطل");
  const r = await call("/sp/login", { body: { k: S.realK, password: "123456" } });
  assert.equal(r.status, 401);
  assert.match(r.data.error, /رمز فعالی/);
  for (let i = 0; i < 3; i++) await call("/sp/login", { body: { k: S.realK, password: "123456" } });
  const locked = await call("/sp/login", { body: { k: S.realK, password: "123456" } });
  assert.equal(locked.status, 429);
  const still = await call("/sp/login", { body: { k: S.realK, password: "123456" } });
  assert.equal(still.status, 429, "تا ۱۵ دقیقه بسته");
});

test("«📄 پیش‌فاکتور +» در پنل وب: مشخصات و پیش‌فاکتور با هم — بسته یک‌راست «پیش‌فاکتور رسید»؛ خوانش و تأیید نهایی بی مرحلهٔ تأیید", { skip: SKIP }, async () => {
  const r = await call("/sp/x/send", { headers: EX, body: { assignment_id: 1, item_ids: [12], supplier_name: "شرکت ششم", phone: "09120000006", label: "فروش" } });
  const H = { "X-SP-Session": (await call("/sp/login", { body: { k: keyOf(r.data.sms.text), password: passOf(r.data.sms.text) } })).data.session };
  const th = r.data.thread_id;
  const id = (await call(`/sp/thread/${th}`, { headers: H })).data.lines[0].id;
  await call(`/sp/line/${id}`, { method: "PUT", headers: H, body: { qty: 50, price: 2900 } });
  await call(`/sp/thread/${th}/terms`, { headers: H, body: { dtime: "5", pay: "نقدی", invoice: "رسمی", vat: "دارد" } });
  assert.equal((await call(`/sp/line/${id}/ready`, { headers: H, body: { on: true } })).status, 200);
  /* شرطی بعد از «آماده» پاک شد: ارسال نمی‌شود و فایلِ انبارشده برداشته می‌شود */
  await call(`/sp/thread/${th}/terms`, { headers: H, body: { vat: "" } });
  let n = calls.length;
  const no = await call(`/sp/thread/${th}/submit-pf?ids=${id}&filename=pf6.pdf`, { headers: { ...H, "Content-Type": "application/pdf" }, raw: "PDF" });
  assert.equal(no.status, 422);
  assert.match(no.data.error, /شرایط فاکتور کامل نیست: ارزش افزوده/);
  assert.ok(since(n).some((c) => c.bot === "store" && c.method === "DELETE"), "فایلِ بی‌صاحب در انبار نمی‌ماند");
  await call(`/sp/thread/${th}/terms`, { headers: H, body: { vat: "دارد" } });
  const sub = await call(`/sp/thread/${th}/submit-pf?ids=${id}&filename=pf6.pdf`, { headers: { ...H, "Content-Type": "application/pdf" }, raw: "PDF" });
  assert.equal(sub.status, 200, JSON.stringify(sub.data));
  assert.equal(sub.data.state, "proforma");
  const b = DB.raw.prepare("SELECT * FROM sp_bundles WHERE id=?").get(sub.data.bundle_id);
  assert.deepEqual([b.state, b.pf_name], ["proforma", "pf6.pdf"]);
  assert.equal(DB.raw.prepare("SELECT state FROM sp_lines WHERE id=?").get(id).state, "proforma");
  const ev = (await call(`/sp/thread/${th}`, { headers: EX })).data.msgs.filter((m) => m.kind === "event").pop();
  assert.match(ev.body, /مشخصات ۱ قلم برای بررسی فرستاده شد همراه با پیش‌فاکتور «pf6\.pdf»/);
  assert.equal(ev.meta.pf, "pf6.pdf");
  assert.equal((await call(`/sp/x/bundle/${b.id}/decide`, { headers: EX, body: { action: "approve" } })).status, 409, "مرحلهٔ «تأیید و درخواست پیش‌فاکتور» لازم نیست");
  aiReply = aiOut({ readable: true, currency: "ریال", vat_included: false, ...terms({ delivery: v("5") }),
    lines: [{ key: "L1", found: true, qty: v(50), unit: { value: "عدد", same: true, sure: true }, unit_price: v(2900), layers: [{ name: "مشخصات فنی", status: "explicit", seen: "گرید 8.8", sure: true }] }] });
  assert.equal((await call(`/sp/x/bundle/${b.id}/ai`, { headers: EX, body: { confirm: true } })).status, 200);
  const fin = await call(`/sp/x/bundle/${b.id}/decide`, { headers: EX, body: { action: "final" } });
  assert.equal(fin.status, 200, JSON.stringify(fin.data));
  const q = DB.raw.prepare("SELECT * FROM quotes WHERE id=?").get(fin.data.quote_ids[0]);
  assert.deepEqual([q.price, q.dtime, q.saved, q.final], [2900, "5", 1, 1]);
  assert.equal(DB.raw.prepare("SELECT source FROM proformas WHERE assignment_id=1 AND supplier_name='شرکت ششم'").get().source, "supplier");
});

test("تأیید نهایی با فیلدِ اجباریِ خالی (کارشناس «نیامده» را تیک زد): خط استعلام می‌آید ولی «ثبت موقت» و «تأیید نهایی» نمی‌خورد", { skip: SKIP }, async () => {
  const r = await call("/sp/x/send", { headers: EX, body: { assignment_id: 1, item_ids: [11], supplier_name: "شرکت هفتم", phone: "09120000007", label: "فروش" } });
  const H = { "X-SP-Session": (await call("/sp/login", { body: { k: keyOf(r.data.sms.text), password: passOf(r.data.sms.text) } })).data.session };
  const th = r.data.thread_id;
  const id = (await call(`/sp/thread/${th}`, { headers: H })).data.lines[0].id;
  await call(`/sp/thread/${th}/terms`, { headers: H, body: { dtime: "7", pay: "نقدی", invoice: "رسمی", vat: "دارد" } });
  await call(`/sp/line/${id}`, { method: "PUT", headers: H, body: { price: 12000 } });
  await call(`/sp/line/${id}/ready`, { headers: H, body: { on: true } });
  const bid = (await call(`/sp/thread/${th}/submit-pf?ids=${id}&filename=pf7.pdf`, { headers: { ...H, "Content-Type": "application/pdf" }, raw: "PDF" })).data.bundle_id;
  aiReply = aiOut({ readable: true, currency: "ریال", ...terms({ delivery: v(null, true) }),
    lines: [{ key: "L1", found: true, qty: v(100), unit: { value: "عدد", same: true, sure: true }, unit_price: v(12000),
      layers: [{ name: "اندازه", status: "explicit", sure: true }, { name: "جنس", status: "missing", sure: true }] }] });
  await call(`/sp/x/bundle/${bid}/ai`, { headers: EX, body: { confirm: true } });
  const bx = (await call(`/sp/thread/${th}`, { headers: EX })).data.bundles.find((x) => x.id === bid);
  assert.deepEqual(bx.ai.header.find((x) => x.key === "dtime").status, "none", "⚪ مطمئن است که زمان تحویل نیامده");
  assert.equal(bx.ai.lines[0].rows.find((x) => x.key === "L:جنس").status, "none");
  const all = await call(`/sp/x/bundle/${bid}/accept`, { headers: EX, body: { all: true } });
  assert.equal(all.data.ready, true);
  assert.deepEqual(all.data.gaps, ["«زمان تحویل»"]);
  const fin = await call(`/sp/x/bundle/${bid}/decide`, { headers: EX, body: { action: "final" } });
  assert.deepEqual(fin.data.gaps, ["«زمان تحویل»"]);
  const q = DB.raw.prepare("SELECT * FROM quotes WHERE id=?").get(fin.data.quote_ids[0]);
  assert.deepEqual([q.dtime, q.saved, q.final, q.price], [null, 0, 0, 12000], "زمانِ تحویلی که سند نگفت از اعلامِ تأمین‌کننده پر نمی‌شود");
  assert.equal(q.spec, "نوع قلم: پیچ، اندازه: M8", "«جنس» که سند نگفت در مشخصات نیست");
});

test("«🧹 پاک کردن گفت‌وگو»: پیام‌ها از صفحهٔ همان طرف می‌روند، در دیتابیس و پیش طرفِ دیگر می‌مانند؛ پیامِ تازه دوباره دیده می‌شود", { skip: SKIP }, async () => {
  const r = await call("/sp/x/send", { headers: EX, body: { assignment_id: 1, item_ids: [12], supplier_name: "شرکت هشتم", phone: "09120000008", label: "فروش", text: "سلام" } });
  const H = { "X-SP-Session": (await call("/sp/login", { body: { k: keyOf(r.data.sms.text), password: passOf(r.data.sms.text) } })).data.session };
  const th = r.data.thread_id;
  await call(`/sp/thread/${th}/msg`, { headers: H, body: { text: "پیامِ قدیمیِ تأمین‌کننده" } });
  const before = DB.raw.prepare("SELECT COUNT(*) AS c FROM sp_msgs WHERE thread_id=?").get(th).c;
  const c = await call(`/sp/thread/${th}/clear`, { headers: H, body: {} });
  assert.equal(c.status, 200);
  assert.equal((await call(`/sp/thread/${th}`, { headers: H })).data.msgs.length, 0, "صفحهٔ تأمین‌کننده خالی");
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS c FROM sp_msgs WHERE thread_id=?").get(th).c, before, "چیزی از دیتابیس پاک نشد");
  assert.equal((await call(`/sp/thread/${th}`, { headers: EX })).data.msgs.length, before, "کارشناس همه را می‌بیند");
  assert.equal((await call(`/sp/poll?t=${th}&since=0`, { headers: H })).data.msgs.length, 0, "نظرسنجی هم پاک‌شده‌ها را برنمی‌گرداند");
  await call(`/sp/thread/${th}/msg`, { headers: EX, body: { text: "پیامِ تازهٔ کارشناس" } });
  const after = (await call(`/sp/thread/${th}`, { headers: H })).data.msgs;
  assert.deepEqual(after.map((m) => m.body), ["پیامِ تازهٔ کارشناس"], "پیامِ بعد از پاک کردن دیده می‌شود");
  assert.equal((await call(`/sp/thread/${th}/clear`, { headers: EX, body: {} })).status, 200);
  assert.equal((await call(`/sp/thread/${th}`, { headers: EX })).data.msgs.length, 0, "کارشناس هم صفحهٔ خودش را پاک می‌کند");
  assert.equal((await call(`/sp/thread/${th}`, { headers: H })).data.msgs.length, 1, "و صفحهٔ تأمین‌کننده دست نمی‌خورد");
});

test("بات تأمین‌کننده: شرایط فاکتور گام‌به‌گام (نوشتن و دکمه)، «📤 ارسال» همراه با پیش‌فاکتور، و «🧹 پاک کردن گفت‌وگو»", { skip: SKIP }, async () => {
  const C9 = 909;
  const r = await call("/sp/x/send", { headers: EX, body: { assignment_id: 1, item_ids: [12], supplier_name: "شرکت نهم", phone: "09120000009", label: "فروش" } });
  const sp = async (u) => { await handleSpUpdate(env, { update_id: 20000 + calls.length, ...u }); };
  const cb = (data) => sp({ callback_query: { id: `n${calls.length}`, data, message: { message_id: 1, chat: { id: C9 } } } });
  const txt = (text, extra) => sp({ message: { message_id: 7000 + calls.length, chat: { id: C9, type: "private" }, text, ...(extra || {}) } });
  const lastTo = (n) => shown(n, "sp", C9).pop();
  await txt(`/start s${keyOf(r.data.sms.text)}`);
  await txt(passOf(r.data.sms.text));
  const th = r.data.thread_id;
  const line = DB.raw.prepare("SELECT id FROM sp_lines WHERE thread_id=?").get(th).id;
  let n = calls.length;
  await cb(`si:${line}`);
  const card = lastTo(n);
  assert.match(card.body.text, /📦 <b>مقدار، واحد و قیمت<\/b>[\s\S]*🧾 <b>شرایط فاکتور<\/b>[\s\S]*🔒 <b>نوع قلم و لایه‌های ویژگی<\/b>/, "کارت قلم در سه بخش");
  assert.doesNotMatch(card.body.text, /مشخصات کارشناس|برای مذاکره در گفت‌وگو/, "توضیحِ «مشخصات کارشناس — قفل» برداشته شد");
  assert.ok(btns(card).some((b) => b.callback_data === `tk:${line}:d`) && btns(card).some((b) => b.callback_data === `tk:${line}:p`));
  await cb(`sv:${line}:qd`);
  n = calls.length;
  await txt("2,900");
  assert.match(lastTo(n).body.text, /زمان تحویل<\/b> را بنویسید/, "بعد از قیمت، خودش شرطِ فاکتور را می‌پرسد");
  n = calls.length;
  await txt("فوری");
  assert.match(lastTo(n).body.text, /تاریخ شمسی/, "قالبِ نادرست");
  n = calls.length;
  await txt("۱۰");
  const payAsk = lastTo(n);
  assert.match(payAsk.body.text, /شرایط تسویه<\/b> را انتخاب کنید/);
  await cb(btns(payAsk).find((b) => b.text === "نقدی").callback_data);
  n = calls.length;
  await cb(`tv:${line}:i:0`);
  await cb(`tv:${line}:v:0`);
  assert.deepEqual(JSON.parse(DB.raw.prepare("SELECT terms_json FROM sp_threads WHERE id=?").get(th).terms_json), { dtime: "10", pay: "نقدی", invoice: "رسمی", vat: "دارد" });
  assert.match(lastTo(n).body.text, /همه‌چیز پر است/);
  await cb(`sr:${line}:1`);
  await cb(`ss:${th}`);
  n = calls.length;
  await cb(`sq:${th}:pf`);
  assert.match(lastTo(n).body.text, /فایل پیش‌فاکتور را بفرستید/);
  await sp({ message: { message_id: 7999, chat: { id: C9, type: "private" }, document: { file_id: "F9", file_size: 10, file_name: "pf9.pdf", mime_type: "application/pdf" } } });
  const b = DB.raw.prepare("SELECT * FROM sp_bundles WHERE thread_id=? ORDER BY id DESC LIMIT 1").get(th);
  assert.deepEqual([b.state, b.pf_name], ["proforma", "pf9.pdf"], "مشخصات و پیش‌فاکتور یک‌جا از بات");
  /* پاک کردن گفت‌وگو از بات: می‌پرسد، بعد فقط صفحهٔ همین طرف */
  n = calls.length;
  await cb(`cc:${th}`);
  assert.match(lastTo(n).body.text, /پاک شود؟/);
  n = calls.length;
  await cb(`cc:${th}:y`);
  assert.ok(DB.raw.prepare("SELECT s_clear FROM sp_threads WHERE id=?").get(th).s_clear > 0);
  assert.ok(since(n).some((c) => c.bot === "sp" && c.method === "deleteMessages"), "پیام‌های تلگرامِ صفحه پاک شد");
  assert.ok(sent(n, "sp", C9).some((c) => /هنوز پیامی نیست/.test(c.body.text)), "تاریخچهٔ همین طرف از این به بعد خالی");
});
test("پیامکِ واقعی با TextBee: استعلام و «ارسال رمز» به گوشیِ تأمین‌کننده، رمز پیش کارشناس نمی‌آید؛ فرضی هرگز؛ سقفِ پلن ← شبیه‌سازی؛ سقفِ روزانهٔ رمز", { skip: SKIP }, async () => {
  env.TEXTBEE_API_KEY = "tbk"; env.TEXTBEE_API_BASE = "https://sms.test";
  try {
    let n = calls.length;
    const r = await call("/sp/x/send", { headers: EX, body: { assignment_id: 1, item_ids: [12], supplier_name: "شرکت پیامکی", phone: "0935 111 2233", label: "همراه", text: "سلام، استعلام." } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const tb = since(n).filter((c) => c.bot === "sms");
    assert.equal(tb.length, 1, "یک پیامک");
    assert.match(tb[0].url, /\/api\/v1\/gateway\/send-sms$/);
    assert.equal(tb[0].headers["x-api-key"], "tbk");
    assert.deepEqual(tb[0].body.recipients, ["+989351112233"], "شماره به قالب بین‌المللی");
    assert.match(tb[0].body.message, /^سلام، استعلام\./);
    assert.match(tb[0].body.message, /supplier\.html#k=[0-9a-f]{12}/);
    assert.match(tb[0].body.message, /رمز ورود: \d{6}/);
    assert.equal(r.data.sms.sent, true);
    assert.equal(r.data.sms.text, undefined, "متنِ با رمز به پنل کارشناس برنمی‌گردد");
    assert.match(r.data.sms.note, /0935•••2233/);
    const row = DB.raw.prepare("SELECT * FROM sp_sms ORDER BY id DESC LIMIT 1").get();
    assert.deepEqual([row.via, row.status, row.ref, row.error], ["textbee", "queued", "batch-1", null]);
    assert.ok(!row.body.includes(passOf(tb[0].body.message)), "رمز خام در دیتابیس نمی‌ماند");
    const k = keyOf(tb[0].body.message);

    /* تأمین‌کنندهٔ فرضی: هرگز پیامکِ واقعی */
    n = calls.length;
    const demo = await call("/sp/x/send", { headers: EX, body: { assignment_id: 1, item_ids: [11], demo: true } });
    assert.equal(since(n).filter((c) => c.bot === "sms").length, 0);
    assert.equal(demo.data.sms.sent, false);
    assert.match(demo.data.sms.text, /رمز ورود: \d{6}/, "فرضی: متن برای دیدنِ سمت تأمین‌کننده");

    /* سقفِ پلن: هیچ پیامکی نرفت ← شبیه‌سازی، با دلیل */
    smsReply = { status: 429, body: { message: "Daily limit exceeded" } };
    const q = await call("/sp/x/send", { headers: EX, body: { assignment_id: 1, item_ids: [12], supplier_name: "شرکت سقف", phone: "09357778899", label: "دفتر" } });
    assert.equal(q.data.sms.sent, false);
    assert.match(q.data.sms.error, /سقف پیامک/);
    assert.match(q.data.sms.text, /رمز ورود: \d{6}/, "پیامک نرفت: کارشناس متن را خودش می‌رساند");
    assert.deepEqual(Object.values(DB.raw.prepare("SELECT via, status FROM sp_sms ORDER BY id DESC LIMIT 1").get()), ["sim", "failed"]);
    smsReply = { status: 200, body: { data: { success: true, smsBatchId: "batch-2" } } };

    /* «ارسال رمز»: پیامکِ واقعی به همان گوشی؛ متنِ پاسخ رمز ندارد */
    n = calls.length;
    const rs = await call("/sp/resend", { body: { k } });
    assert.equal(rs.status, 200, JSON.stringify(rs.data));
    assert.equal(rs.data.sent, true);
    const tb2 = since(n).filter((c) => c.bot === "sms");
    assert.equal(tb2.length, 1);
    assert.deepEqual(tb2[0].body.recipients, ["+989351112233"]);
    assert.match(tb2[0].body.message, /رمز ورود: \d{6}/);
    assert.ok(!JSON.stringify(rs.data).match(/\d{6}/), "پاسخِ صفحهٔ ورود رمز ندارد");
    const login = await call("/sp/login", { body: { k, password: passOf(tb2[0].body.message) } });
    assert.equal(login.status, 200, "رمزِ پیامک ورود می‌دهد");

    /* سقفِ روزانهٔ «ارسال رمز» برای هر شماره */
    const ph = DB.raw.prepare("SELECT id FROM sp_phones WHERE k=?").get(k);
    const t = Date.now();
    for (let i = 0; i < 5; i++) DB.raw.prepare("INSERT INTO sp_sms (phone_id,kind,body,at) VALUES (?,'pass','x',?)").run(ph.id, t - 1000);
    DB.raw.prepare("UPDATE sp_phones SET resend_at=NULL WHERE id=?").run(ph.id);
    const cap = await call("/sp/resend", { body: { k } });
    assert.equal(cap.status, 429);
    assert.match(cap.data.error, /امروز چند بار رمز/);
  } finally {
    delete env.TEXTBEE_API_KEY; delete env.TEXTBEE_API_BASE;
  }
});

test("بستهٔ قفل‌شده: بعد از اولین ارسال به تأمین‌کنندهٔ واقعی، عنوان و لایه‌ها قفل‌اند و هر تأمین‌کنندهٔ بعدی عینِ همان را می‌گیرد", { skip: SKIP }, async () => {
  DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,title,qty,unit,state,assignment_id,norm_json) VALUES (13,'R-1','c',3,'میلگرد ۱۲ آجدار',2,'تن','open',1,?)")
    .run(JSON.stringify({ v: 2, head: "میلگرد", layers: { "قطر": { v: "12", u: "میلی‌متر" }, "نوع": "آجدار" } }));
  /* تأمین‌کنندهٔ فرضی قفل نمی‌کند */
  const demo = await call("/sp/x/send", { headers: EX, body: { assignment_id: 1, item_ids: [13], demo: true } });
  assert.equal(demo.status, 200, JSON.stringify(demo.data));
  assert.equal((await call("/sp/x/items?aid=1", { headers: EX })).data.items.find((i) => i.id === 13).locked, false);
  assert.equal((await call("/assignments/1", { headers: EX })).data.items.find((i) => i.id === 13).sp_lock, undefined);

  /* اولین تأمین‌کنندهٔ واقعی ← قفل */
  const a = await call("/sp/x/send", { headers: EX, body: { assignment_id: 1, item_ids: [13], supplier_name: "فولاد الف", phone: "09120000071", label: "فروش" } });
  assert.equal(a.status, 200, JSON.stringify(a.data));
  const lineA = DB.raw.prepare("SELECT title, head, layers_json, req_qty, req_unit FROM sp_lines WHERE thread_id=? AND item_id=13").get(a.data.thread_id);
  assert.equal(lineA.head, "میلگرد");
  const lock = (await call("/assignments/1", { headers: EX })).data.items.find((i) => i.id === 13).sp_lock;
  assert.deepEqual([lock.title, lock.head, lock.qty, lock.unit], ["میلگرد ۱۲ آجدار", "میلگرد", 2, "تن"]);
  assert.equal((await call("/sp/x/items?aid=1", { headers: EX })).data.items.find((i) => i.id === 13).locked, true);

  /* ویرایشِ ساختار در سرور پذیرفته نیست */
  const del = await call("/items/13/norm", { method: "DELETE", headers: EX });
  assert.equal(del.status, 409);
  assert.match(del.data.error, /قفل است/);
  assert.equal((await call("/items/13/edit", { method: "DELETE", headers: EX })).status, 409);

  /* حتی اگر ساختار یا مقدار از راهِ دیگری عوض شود، تأمین‌کنندهٔ دوم عینِ بستهٔ اول را می‌گیرد */
  DB.raw.prepare("UPDATE items SET norm_json=?, qty=5, unit='کیلوگرم' WHERE id=13").run(JSON.stringify({ v: 2, head: "میلگرد", layers: { "قطر": { v: "14", u: "میلی‌متر" } } }));
  const b = await call("/sp/x/send", { headers: EX, body: { assignment_id: 1, item_ids: [13], supplier_name: "فولاد ب", phone: "09120000072", label: "فروش" } });
  assert.equal(b.status, 200, JSON.stringify(b.data));
  const lineB = DB.raw.prepare("SELECT title, head, layers_json, req_qty, req_unit FROM sp_lines WHERE thread_id=? AND item_id=13").get(b.data.thread_id);
  assert.deepEqual(lineB, lineA, "همان عنوان، لایه‌ها، مقدار و واحد");
  const ev = DB.raw.prepare("SELECT body FROM sp_msgs WHERE thread_id=? AND kind='event' ORDER BY id DESC LIMIT 1").get(b.data.thread_id).body;
  assert.match(ev, /میلگرد ۱۲ آجدار/);
  assert.doesNotMatch(ev, /14/, "کارتِ استعلام هم همان بسته را نشان می‌دهد");

  /* شمارهٔ تازه از کارتِ تأمین‌کنندهٔ سوابق (هر کارشناس) */
  const ph = await call("/sp/x/phones", { headers: EX, body: { supplier_name: "فولاد الف", phone: "‪+98 912 000 0073‬", label: "همراه مدیر", panel: true } });
  assert.equal(ph.status, 200, JSON.stringify(ph.data));
  assert.deepEqual([ph.data.phone.phone, ph.data.phone.panel], ["09120000073", true]);
  const list = (await call(`/sp/x/phones?name=${encodeURIComponent("فولاد الف")}`, { headers: EX })).data.phones;
  assert.deepEqual(list.map((x) => x.phone).sort(), ["09120000071", "09120000073"]);
});

test("اعلانِ گوشهٔ پنل کارشناس (/sp/x/inbox): فقط پیامِ تازه و نخواندهٔ تأمین‌کنندهٔ گفت‌وگوهای خودِ همان کارشناس", { skip: SKIP }, async () => {
  const start = (await call("/sp/x/inbox", { headers: EX })).data;
  assert.ok(start.last > 0, "نقطهٔ شروع: بالاترین شناسهٔ پیام");
  assert.deepEqual(start.msgs, [], "بی since فقط نقطهٔ شروع و شمارِ نخوانده");
  const at = Date.now();
  const add = (who, kind, body) => Number(DB.raw.prepare("INSERT INTO sp_msgs (thread_id, who, kind, body, at) VALUES (?,?,?,?,?)").run(S.th, who, kind, body, at).lastInsertRowid);
  const s1 = add("s", "text", "سلام، قیمت را ثبت کردم.");
  add("e", "text", "ممنون");
  add("e", "note", "یادداشت");
  const s2 = add("s", "event", "📤 مشخصات ۱ قلم برای بررسی فرستاده شد:\n▫️ کد ۱ — پیچ");
  const r = (await call(`/sp/x/inbox?since=${start.last}`, { headers: EX })).data;
  assert.deepEqual(r.msgs.map((m) => m.id), [s1, s2], "فقط پیامِ تأمین‌کننده، به ترتیب");
  assert.deepEqual([r.msgs[0].thread_id, r.msgs[0].assignment_id, r.msgs[0].request_id, r.msgs[0].supplier], [S.th, 1, "R-1", DEMO.name]);
  assert.equal(r.last, s2);
  assert.ok(r.unread >= 2);
  const other = (await call(`/sp/x/inbox?since=${start.last}`, { headers: { "X-Expert-Code": "9002" } })).data;
  assert.deepEqual(other.msgs, [], "کارشناسِ دیگر پیامِ گفت‌وگوی این کارشناس را نمی‌بیند");
  /* کارشناس گفت‌وگو را باز کرد: دیگر اعلان نمی‌شود */
  await call(`/sp/thread/${S.th}`, { headers: EX });
  const after = (await call(`/sp/x/inbox?since=${start.last}`, { headers: EX })).data;
  assert.deepEqual(after.msgs, [], "دیده‌شده اعلان نمی‌شود");
  assert.equal(after.unread, r.unread - 2);
  assert.equal((await call("/sp/x/inbox", { headers: { "X-SP-Session": "nope" } })).status, 401, "فقط کارشناس");
});
test("پیامِ صوتیِ تأمین‌کننده (وب و تلگرام): صدا در انبار، متنش با ElevenLabs فقط برای کارشناس و کارشناس هوشمند", { skip: SKIP }, async () => {
  env.ELEVENLABS_API_KEY = "el-key"; env.ELEVENLABS_API_BASE = "https://el.test";
  const raw = async (path, headers) => route(new Request(`https://site.test/tamin-poshtibani/api${path}`, { headers }), env, ctx);
  try {
    const r = await call("/sp/x/send", { headers: EX, body: { assignment_id: 1, item_ids: [12], supplier_name: "شرکت صدا", phone: "09120000019", label: "فروش", text: "سلام" } });
    const H = { "X-SP-Session": (await call("/sp/login", { body: { k: keyOf(r.data.sms.text), password: passOf(r.data.sms.text) } })).data.session };
    const th = r.data.thread_id;
    const said = "سلام، قیمت مهره رو هشت هزار ریال حساب کردم";
    sttReply = { status: 200, body: { text: said, language_code: "fas", audio_duration_secs: 4.2 } };
    let n = calls.length;
    const v = await call(`/sp/thread/${th}/voice?dur=4`, { headers: { ...H, "Content-Type": "audio/webm;codecs=opus" }, raw: "OPUSDATA" });
    assert.equal(v.status, 200, JSON.stringify(v.data));
    const m = v.data.msgs[0];
    assert.deepEqual([m.kind, m.who, m.body], ["voice", "s", ""], "تأمین‌کننده متنِ پیاده‌شده را نمی‌بیند");
    assert.equal(m.meta.voice.dur, 4);
    assert.equal(m.meta.voice.key, undefined, "کلیدِ انبار بیرون نمی‌رود");
    assert.equal(m.meta.stt, undefined);
    const stt = since(n).find((c) => c.bot === "stt");
    assert.ok(stt, "ElevenLabs صدا زده شد");
    assert.deepEqual([stt.url, stt.headers["xi-api-key"], stt.model, stt.lang, stt.size], ["https://el.test/v1/speech-to-text", "el-key", "scribe_v2", "fa", 8]);
    assert.ok(since(n).some((c) => c.bot === "store" && c.method === "POST" && /sp-voice\.webm$/.test(c.url)), "صدا در انبار");
    assert.equal((await call(`/sp/thread/${th}`, { headers: H })).data.msgs.find((x) => x.id === m.id).body, "", "در پنلِ تأمین‌کننده هم متن نیست");
    assert.equal((await call(`/sp/poll?t=${th}&since=${m.id - 1}`, { headers: H })).data.msgs[0].body, "");
    const ex = (await call(`/sp/thread/${th}`, { headers: EX })).data.msgs.find((x) => x.id === m.id);
    assert.deepEqual([ex.body, ex.meta.voice.dur, ex.meta.voice.key, ex.meta.stt.ok], [said, 4, undefined, true], "کارشناس متن را می‌بیند");
    assert.equal((await raw(`/sp/msg/${m.id}/voice`, H)).status, 200, "صدا برای خودِ تأمین‌کننده");
    assert.equal((await raw(`/sp/msg/${m.id}/voice`, EX)).status, 200, "و کارشناس");
    assert.equal((await raw(`/sp/msg/${m.id}/voice`, { "X-Expert-Code": "9002" })).status, 403, "نه کارشناسِ دیگر");
    /* کارشناس هوشمند: همین متن با برچسبِ پیامِ صوتی */
    const md = msgEntry({ ...ex, meta: { voice: { dur: 4 }, stt: { ok: true } } }, { request_id: "R-1", supplier: "شرکت صدا", lines: [] });
    assert.match(md, /تأمین‌کننده ← شرکت · پیام صوتی \(متنِ پیاده‌شده از صدا\)/);
    assert.match(md, new RegExp(`> ${said}`));
    assert.match(msgEntry({ ...ex, body: "", meta: { stt: { ok: false, error: "x" } } }, { request_id: "R-1", supplier: "s", lines: [] }), /\[پیام صوتی — متنش پیاده نشد: x\]/);

    /* تلگرام: ویسِ تأمین‌کننده ← همان راه؛ کارشناسِ همان گفت‌وگو متن و خودِ ویس را می‌گیرد، تأمین‌کننده چیزی نمی‌گیرد */
    const pid = DB.raw.prepare("SELECT id FROM sp_phones WHERE phone='09120000019'").get().id;
    DB.raw.prepare("INSERT OR REPLACE INTO sp_tg (chat, role, phone_id, focus, ids_json, updated_at) VALUES ('7701','s',?,?,'[]',?)").run(pid, th, Date.now());
    DB.raw.prepare("INSERT OR REPLACE INTO sp_tg (chat, role, expert_id, focus, ids_json, updated_at) VALUES ('7702','e',1,?,'[]',?)").run(th, Date.now());
    sttReply = { status: 200, body: { text: "پیش‌فاکتور رو فردا می‌فرستم", language_code: "fas" } };
    n = calls.length;
    await handleSpUpdate(env, { update_id: 99, message: { message_id: 501, chat: { id: 7701, type: "private" }, voice: { file_id: "VOICE1", duration: 3, mime_type: "audio/ogg", file_size: 1200 } } });
    await Promise.all(pend.splice(0));
    const tm = DB.raw.prepare("SELECT * FROM sp_msgs WHERE thread_id=? ORDER BY id DESC LIMIT 1").get(th);
    assert.deepEqual([tm.kind, tm.who, tm.body], ["voice", "s", "پیش‌فاکتور رو فردا می‌فرستم"]);
    assert.equal(JSON.parse(tm.meta_json).voice.tg, "VOICE1");
    assert.equal(since(n).filter((c) => c.bot === "sp" && String(c.body.chat_id) === "7701" && c.method !== "getFile").length, 0, "به تأمین‌کننده پاسخی (و متنی) نمی‌رود");
    const toEx = sent(n, "sp", 7702).map((c) => c.body.text).join("\n");
    assert.match(toEx, /🎤 <i>پیام صوتی ۰:۰۳<\/i>\n«پیش‌فاکتور رو فردا می‌فرستم»/);
    assert.ok(since(n).some((c) => c.bot === "sp" && c.method === "sendVoice" && c.body.voice === "VOICE1" && String(c.body.chat_id) === "7702"), "خودِ ویس هم برای کارشناس");

    /* اعلانِ گوشهٔ پنل کارشناس: «🎤» و متن */
    const inbox = (await call(`/sp/x/inbox?since=${m.id - 1}`, { headers: EX })).data;
    assert.ok(inbox.msgs.some((x) => x.body === `🎤 ${said}`) || inbox.msgs.length === 0);

    /* بی کلید: پیامِ صوتی ذخیره می‌شود، متنش خالی و دلیلش برای کارشناس */
    delete env.ELEVENLABS_API_KEY;
    const v2 = await call(`/sp/thread/${th}/voice`, { headers: { ...H, "Content-Type": "audio/mp4" }, raw: "M4A" });
    assert.equal(v2.status, 200);
    const ex2 = (await call(`/sp/thread/${th}`, { headers: EX })).data.msgs.find((x) => x.id === v2.data.msgs[0].id);
    assert.equal(ex2.body, "");
    assert.match(ex2.meta.stt.error, /ELEVENLABS_API_KEY/);
    assert.equal((await call(`/sp/thread/${th}/voice`, { headers: { ...EX, "Content-Type": "audio/webm" }, raw: "X" })).status, 404, "کارشناس پیامِ صوتی نمی‌فرستد");
  } finally { delete env.ELEVENLABS_API_KEY; delete env.ELEVENLABS_API_BASE; }
});

test("تأمین‌کننده هیچ‌جا «🤖» نمی‌بیند: پیامک، پیامِ کارشناس هوشمند در بات و پنل", { skip: SKIP }, async () => {
  const r = await call("/sp/x/send", { headers: EX, body: { assignment_id: 1, item_ids: [12], supplier_name: "شرکت بی‌ربات", phone: "09120000020", label: "فروش" } });
  assert.doesNotMatch(r.data.sms.text, /🤖/, "متنِ پیامک");
  const th = r.data.thread_id;
  const H = { "X-SP-Session": (await call("/sp/login", { body: { k: keyOf(r.data.sms.text), password: passOf(r.data.sms.text) } })).data.session };
  DB.raw.prepare("INSERT INTO sp_msgs (thread_id, who, kind, body, meta_json, at) VALUES (?,'e','text','قیمت‌تون رو دیدم، ممنون',?,?)").run(th, JSON.stringify({ ai: true }), Date.now());
  DB.raw.prepare("INSERT INTO sp_msgs (thread_id, who, kind, body, meta_json, at) VALUES (?,'e','note','🤖 یادداشتِ درونی',?,?)").run(th, JSON.stringify({ ai: true }), Date.now());
  const d = (await call(`/sp/thread/${th}`, { headers: H })).data;
  assert.ok(!d.msgs.some((m) => m.kind === "note"), "یادداشتِ درونی نه");
  assert.ok(!JSON.stringify(d.msgs.map((m) => m.body)).includes("🤖"));
  const pid = DB.raw.prepare("SELECT id FROM sp_phones WHERE phone='09120000020'").get().id;
  DB.raw.prepare("INSERT OR REPLACE INTO sp_tg (chat, role, phone_id, focus, ids_json, updated_at) VALUES ('7703','s',?,NULL,'[]',?)").run(pid, Date.now());
  const n = calls.length;
  await handleSpUpdate(env, { update_id: 100, callback_query: { id: "cq9", data: `st:${th}`, message: { message_id: 1, chat: { id: 7703, type: "private" } } } });
  const shownTxt = sent(n, "sp", 7703).map((c) => c.body.text + JSON.stringify(c.body.reply_markup || {})).join("\n");
  assert.match(shownTxt, /قیمت‌تون رو دیدم، ممنون/);
  assert.doesNotMatch(shownTxt, /🤖/, "تاریخچه و کارت‌ها در بات");
});