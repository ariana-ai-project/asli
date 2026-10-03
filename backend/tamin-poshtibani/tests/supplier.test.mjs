/* ============================================================
   دموی پنل تأمین‌کننده — worker/sp-*.js (مهر ۱۴۰۵)

   کل مسیر روی SQLite واقعی (همان طرحِ ensureSchema)، تلگرامِ بدلی، انبارِ بدلی و مدلِ بدلی:
   «ارسال» کارشناس ← پیامکِ شبیه‌سازی‌شده با لینک و رمز ← ورود تأمین‌کننده ← لایه‌های قفل و لایهٔ تازه ←
   آمادهٔ ارسال و ارسال چند قلم با هم ← تأیید و درخواست پیش‌فاکتور ← پیش‌فاکتور ← بررسی هوشمند ←
   تأیید نهایی (و خط استعلام موقت برای تأمین‌کنندهٔ واقعی)؛ بات مکاتبات در هر دو نقش، مینی‌اپ (initData)،
   «ارسال» از بات کارشناسان، رمز تازه، خروج و قفل بعد از پنج رمز اشتباه.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";

import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import { handleUpdate } from "../../../worker/bot.js";
import { handleSpUpdate } from "../../../worker/sp-bot.js";
import { verifyInitData } from "../../../worker/sp-api.js";
import { normPhone, toNum } from "../../../worker/sp-core.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = {
  DB, TG_BOT_TOKEN: "tok", TG_SP_BOT_TOKEN: "sptok", TG_WEBHOOK_SECRET: "sec", TG_API_BASE: "https://tg.test/bot", TG_FILE_API_BASE: "https://tgfile.test/bot",
  SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_KEY: "svc", ANTHROPIC_API_KEY: "k", ANTHROPIC_API_BASE: "https://ai.test", SITE_ORIGIN: "https://site.test",
};
const EXPERT_CHAT = 555;

if (DB) {
  await ensureSchema(env);
  const t = Date.now();
  DB.raw.exec("DELETE FROM experts");
  DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,telegram_chat,created_at) VALUES (1,'کارشناس یک','آقای یک','9001',1,1,?,?), (2,'کارشناس دو','آقای دو','9002',1,1,NULL,?)").run(String(EXPERT_CHAT), t, t);
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
  if (u.startsWith("https://tgfile.test/")) return { ok: true, status: 200, body: new Response("PDFDATA").body };
  if (u.startsWith("https://sb.test/storage/v1/object/sign/")) return R({ signedURL: "/object/sign/proformas/x?token=abc" });
  if (u.startsWith("https://sb.test/storage/v1/object/")) { calls.push({ bot: "store", method: init.method || "GET", url: u }); return R({ Key: "x" }); }
  if (u.startsWith("https://ai.test/")) { calls.push({ bot: "ai", body: JSON.parse(init.body) }); return R(aiReply); }
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
const passOf = (sms) => /رمز ورود: (\d{6})/.exec(sms)[1];
const keyOf = (sms) => /#k=([0-9a-f]{12})/.exec(sms)[1];
const S = {};

test("ابزارها: شماره و عدد", () => {
  assert.equal(normPhone("۰۹۱۲ ۱۲۳ ۴۵۶۷"), "09121234567");
  assert.equal(normPhone("+98 912-123-4567"), "09121234567");
  assert.equal(normPhone("9121234567"), "09121234567");
  assert.equal(normPhone("021 8888 1234"), "02188881234");
  assert.equal(normPhone("12345"), null);
  assert.equal(toNum("۱۲٬۵۰۰"), 12500);
  assert.ok(Number.isNaN(toNum("abc")));
  assert.equal(toNum(""), null);
});

test("ارسال به تأمین‌کنندهٔ فرضی: گفت‌وگو، خط با لایه‌های قفل، و متن پیامک با لینک و رمز", { skip: SKIP }, async () => {
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

  const again = await call("/sp/x/send", { headers: EX, body: { assignment_id: 1, item_ids: [11], demo: true } });
  assert.equal(again.data.added, 0, "قلمِ رفته دوباره ساخته نمی‌شود — یادآوری");
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
  assert.deepEqual(notReady.data.missing, ["قیمت واحد"]);
  await call(`/sp/line/${l2.id}`, { method: "PUT", headers: H, body: { price: 3000 } });
  for (const id of [l1.id, l2.id]) assert.equal((await call(`/sp/line/${id}/ready`, { headers: H, body: { on: true } })).status, 200);
  const up = await call(`/sp/line/${l1.id}/file?filename=cert.pdf&label=${encodeURIComponent("گواهی کیفیت")}&note=x`, { headers: { ...H, "Content-Type": "application/pdf" }, raw: "PDF" });
  assert.equal(up.status, 200, JSON.stringify(up.data));
  const noLabel = await call(`/sp/line/${l1.id}/file?filename=a.pdf`, { headers: H, raw: "PDF" });
  assert.equal(noLabel.status, 400, "پیوست بی برچسب نه");
});

test("ارسال چند قلم با هم ← تصمیم کارشناس ← پیش‌فاکتور ← بررسی هوشمند ← تأیید نهایی (فرضی: بی خط استعلام)", { skip: SKIP }, async () => {
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

  assert.equal((await call(`/sp/x/bundle/${S.b}/decide`, { headers: EX, body: { action: "return" } })).status, 400, "برگشت بی توضیح نه");
  const ap = await call(`/sp/x/bundle/${S.b}/decide`, { headers: EX, body: { action: "approve" } });
  assert.equal(ap.data.state, "approved");
  const early = await call(`/sp/x/bundle/${S.b}/decide`, { headers: EX, body: { action: "final" } });
  assert.equal(early.status, 409, "بی پیش‌فاکتور تأیید نهایی نیست");

  const pf = await call(`/sp/bundle/${S.b}/proforma?filename=pf.pdf`, { headers: { ...H, "Content-Type": "application/pdf" }, raw: "PDF" });
  assert.equal(pf.status, 200, JSON.stringify(pf.data));
  const guard = await call(`/sp/x/bundle/${S.b}/decide`, { headers: EX, body: { action: "final" } });
  assert.equal(guard.status, 422);
  assert.match(guard.data.error, /صراحتِ لایه‌ها/);

  const noConfirm = await call(`/sp/x/bundle/${S.b}/ai`, { headers: EX, body: {} });
  assert.equal(noConfirm.status, 428, "مدل فقط با تأیید صریح کارشناس");
  aiReply = { model: "claude-haiku-4-5", usage: { input_tokens: 4000, output_tokens: 600 }, content: [{ type: "tool_use", name: "record_check", input: {
    readable: true, currency: "تومان", delivery: "۱۰ روز کاری", pay_class: "نقدی", vat_status: "دارد",
    lines: [
      { line_id: S.l1, found: true, qty: 100, unit: "عدد", unit_price: 1250, layers: [{ name: "اندازه", status: "explicit" }, { name: "جنس", status: "explicit" }] },
      { line_id: S.l2, found: true, qty: 50, unit: "عدد", unit_price: 300, layers: [{ name: "مشخصات فنی", status: "explicit" }] },
    ] } }] };
  const ai = await call(`/sp/x/bundle/${S.b}/ai`, { headers: EX, body: { confirm: true } });
  assert.equal(ai.status, 200, JSON.stringify(ai.data));
  assert.equal(ai.data.ai.ok, true);
  assert.equal(ai.data.ai.lines[0].unit_price, 12500, "تومان ← ریال");
  assert.equal(ai.data.ai.lines[0].price_match, true);
  assert.equal(ai.data.ai.cost_usd, 0.007);
  const fin = await call(`/sp/x/bundle/${S.b}/decide`, { headers: EX, body: { action: "final" } });
  assert.equal(fin.status, 200, JSON.stringify(fin.data));
  assert.equal(fin.data.demo, true);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM quotes").get().n, 0, "تأمین‌کنندهٔ فرضی در داده‌های واقعی چیزی نمی‌سازد");

  const sup = (await call(`/sp/thread/${S.th}`, { headers: H })).data;
  assert.ok(sup.msgs.every((m) => m.kind !== "note"), "یادداشتِ بررسی هوشمند را تأمین‌کننده نمی‌بیند");
  assert.ok(sup.bundles.every((b) => !("ai" in b)), "نتیجهٔ مدل در خروجیِ تأمین‌کننده نیست");
  assert.deepEqual(sup.lines.map((l) => l.state), ["final", "final"]);
});

test("تأمین‌کنندهٔ واقعی: شمارهٔ برچسب‌دار، تأیید نهایی دستی ← خط استعلام موقت و پیش‌فاکتور در تب استعلامات", { skip: SKIP }, async () => {
  const noLabel = await call("/sp/x/send", { headers: EX, body: { assignment_id: 1, item_ids: [11], supplier_name: "شرکت نمونه", phone: "09121234567" } });
  assert.equal(noLabel.status, 400, "شمارهٔ تازه بی برچسب نه");
  const r = await call("/sp/x/send", { headers: EX, body: { assignment_id: 1, item_ids: [11], supplier_name: "شرکت نمونه", phone: "۰۹۱۲۱۲۳۴۵۶۷", label: "فروش", text: "سلام" } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.phone.label, "فروش");
  const clash = await call("/sp/x/send", { headers: EX, body: { assignment_id: 1, item_ids: [11], supplier_name: "شرکت دیگر", phone: "09121234567", label: "x" } });
  assert.equal(clash.status, 409, "یک شماره مال یک تأمین‌کننده");
  const s = (await call("/sp/login", { body: { k: keyOf(r.data.sms.text), password: passOf(r.data.sms.text) } })).data.session;
  const H = { "X-SP-Session": s };
  const th = (await call(`/sp/thread/${r.data.thread_id}`, { headers: H })).data;
  const id = th.lines[0].id;
  await call(`/sp/line/${id}`, { method: "PUT", headers: H, body: { qty: 100, price: 11000 } });
  await call(`/sp/line/${id}/ready`, { headers: H, body: { on: true } });
  const b = (await call(`/sp/thread/${r.data.thread_id}/submit`, { headers: H, body: {} })).data.bundle_id;
  await call(`/sp/x/bundle/${b}/decide`, { headers: EX, body: { action: "approve" } });
  await call(`/sp/bundle/${b}/proforma?filename=pf2.pdf`, { headers: { ...H, "Content-Type": "application/pdf" }, raw: "PDF" });
  const fin = await call(`/sp/x/bundle/${b}/decide`, { headers: EX, body: { action: "final", manual_ok: true } });
  assert.equal(fin.status, 200, JSON.stringify(fin.data));
  assert.equal(fin.data.quote_ids.length, 1);
  const q = DB.raw.prepare("SELECT * FROM quotes WHERE id=?").get(fin.data.quote_ids[0]);
  assert.equal(q.supplier_name, "شرکت نمونه");
  assert.equal(q.price, 11000); assert.equal(q.qty, 100); assert.equal(q.origin, "supplier");
  assert.match(q.spec, /نوع قلم: پیچ، اندازه: M8، جنس: فولاد/);
  assert.equal(q.saved, 0, "بی بررسی هوشمند شرایط فاکتور خالی است؛ کارشناس در تب استعلامات کاملش می‌کند");
  const p = DB.raw.prepare("SELECT * FROM proformas WHERE assignment_id=1 AND supplier_name='شرکت نمونه'").get();
  assert.equal(p.source, "supplier");
  assert.equal(DB.raw.prepare("SELECT quote_id FROM sp_lines WHERE id=?").get(id).quote_id, q.id);
  S.realK = keyOf(r.data.sms.text); S.realSess = s; S.realTh = r.data.thread_id;
});

test("بات مکاتبات: اتصال کارشناس و تأمین‌کننده، پیام دوطرفه، هشدار و «رفتن به این گفت‌وگو» با پاک‌کردن صفحه", { skip: SKIP }, async () => {
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

  /* تأمین‌کنندهٔ واقعی با لینک پیامک و رمزِ همان پیامک */
  const resend = await call("/sp/resend", { body: { k: S.realK } });
  assert.equal(resend.status, 200);
  const simSms = sent(0, "main", EXPERT_CHAT).filter((c) => /پیامک شبیه‌سازی‌شده/.test(c.body.text)).pop();
  assert.ok(simSms, "دمو: رمز تازه در گفت‌وگوی کارشناس در بات کارشناسان");
  const pass = /رمز ورود: (\d{6})/.exec(simSms.body.text)[1];
  await handleSpUpdate(env, { update_id: 3, message: { message_id: 20, chat: { id: SC, type: "private" }, text: `/start s${S.realK}` } });
  assert.equal(DB.raw.prepare("SELECT role FROM sp_tg WHERE chat=?").get(String(SC)).role, "p");
  n = calls.length;
  await handleSpUpdate(env, { update_id: 4, message: { message_id: 21, chat: { id: SC, type: "private" }, text: pass } });
  const row = DB.raw.prepare("SELECT * FROM sp_tg WHERE chat=?").get(String(SC));
  assert.equal(row.role, "s");
  assert.equal(row.focus, S.realTh, "تنها استعلام همان لحظه باز می‌شود");
  assert.ok(sent(n, "sp", SC).some((c) => /اقلام استعلام R-1/.test(c.body.text)), "کارت اقلام");

  /* پیام تأمین‌کننده ← کارشناس (گفت‌وگوی دیگری باز ندارد: هشدار با دکمهٔ رفتن) */
  n = calls.length;
  await handleSpUpdate(env, { update_id: 5, message: { message_id: 22, chat: { id: SC, type: "private" }, text: "قیمت با حمل است؟" } });
  const alert = sent(n, "sp", EC)[0];
  assert.match(alert.body.text, /🔔 <b>شرکت نمونه<\/b>/);
  assert.equal(alert.body.reply_markup.inline_keyboard[0][0].callback_data, `go:${S.realTh}`);

  n = calls.length;
  await handleSpUpdate(env, { update_id: 6, callback_query: { id: "c1", data: `go:${S.realTh}`, message: { message_id: alert ? 1 : 0, chat: { id: EC } } } });
  const del = since(n).find((c) => c.bot === "sp" && c.method === "deleteMessages");
  assert.ok(del && del.body.message_ids.includes(10), "پیام‌های قبلیِ صفحه پاک می‌شوند");
  const shown = sent(n, "sp", EC).map((c) => c.body.text).join("\n");
  assert.match(shown, /💬 <b>شرکت نمونه<\/b>/);
  assert.match(shown, /قیمت با حمل است؟/, "تاریخچهٔ کامل");
  assert.equal(DB.raw.prepare("SELECT focus FROM sp_tg WHERE chat=?").get(String(EC)).focus, S.realTh);

  /* پاسخ کارشناس ← تأمین‌کننده (همین گفت‌وگو جلوی چشم اوست: خودِ پیام) */
  n = calls.length;
  await handleSpUpdate(env, { update_id: 7, message: { message_id: 30, chat: { id: EC, type: "private" }, text: "بله، تا انبار." } });
  assert.match(sent(n, "sp", SC)[0].body.text, /کارشناس — آقای یک<\/b>.*\nبله، تا انبار\./s);
  const web = (await call(`/sp/thread/${S.realTh}`, { headers: { "X-SP-Session": S.realSess } })).data;
  assert.equal(web.msgs.filter((m) => m.kind === "text").pop().body, "بله، تا انبار.", "وب و بات یک وضعیت");
});

test("بات خالص، سراسر: تأمین‌کننده قلم را در بات پر می‌کند و پیوست و پیش‌فاکتور می‌فرستد؛ کارشناس با دکمه‌ها تصمیم می‌گیرد", { skip: SKIP }, async () => {
  const EC = 900, SC = 901;
  const sp = async (u) => { await handleSpUpdate(env, { update_id: 100 + calls.length, ...u }); };
  const cb = (chat, data) => sp({ callback_query: { id: `q${calls.length}`, data, message: { message_id: 1, chat: { id: chat } } } });
  const txt = (chat, text, extra) => sp({ message: { message_id: 500 + calls.length, chat: { id: chat, type: "private" }, text, ...(extra || {}) } });
  const lastTo = (n, chat) => sent(n, "sp", chat).pop();
  const btns = (m) => (m && m.body.reply_markup && m.body.reply_markup.inline_keyboard ? m.body.reply_markup.inline_keyboard.flat() : []);

  /* قلم دوم به همان تأمین‌کننده: همان گفت‌وگو (درخواست × تأمین‌کننده)، خطِ تازه */
  const r = await call("/sp/x/send", { headers: EX, body: { assignment_id: 1, item_ids: [12], supplier_name: "شرکت نمونه", phone: "09121234567" } });
  assert.equal(r.data.thread_id, S.realTh);
  const line = DB.raw.prepare("SELECT id FROM sp_lines WHERE thread_id=? AND item_id=12").get(S.realTh).id;

  let n = calls.length;
  await cb(SC, `si:${line}`);
  const card = since(n).filter((c) => c.bot === "sp" && (c.method === "editMessageText" || c.method === "sendMessage")).pop();
  assert.match(card.body.text, /مهره M8[\s\S]*🔒[\s\S]*مشخصات فنی: گرید 8\.8/);
  for (const [f, v] of [["q", "۵۰"], ["p", "3,200"], ["l", "برند: نمونه‌سازان"]]) { await cb(SC, `sv:${line}:${f}`); await txt(SC, v); }
  let L = DB.raw.prepare("SELECT * FROM sp_lines WHERE id=?").get(line);
  assert.equal(L.qty, 50); assert.equal(L.price, 3200);
  assert.deepEqual(JSON.parse(L.extra_json), [{ k: "برند", v: "نمونه‌سازان" }]);
  await cb(SC, `sv:${line}:l`);
  n = calls.length;
  await txt(SC, "مشخصات فنی: گرید 10");
  assert.match(lastTo(n, SC).body.text, /قفل‌شدهٔ کارشناس/, "لایهٔ قفل از بات هم تغییر نمی‌کند");
  await cb(SC, "xc:0");

  /* پیوست با برچسب از فهرست، و کپشن = توضیح */
  await cb(SC, `sa:${line}`);
  await cb(SC, `sa:${line}:0`);
  await sp({ message: { message_id: 900, chat: { id: SC, type: "private" }, document: { file_id: "F1", file_size: 10, file_name: "cert.pdf", mime_type: "application/pdf" }, caption: "گواهی ۱۴۰۵" } });
  const f = DB.raw.prepare("SELECT * FROM sp_files WHERE line_id=?").get(line);
  assert.deepEqual([f.label, f.note, f.filename], ["گواهی کیفیت", "گواهی ۱۴۰۵", "cert.pdf"]);
  assert.ok(calls.some((c) => c.bot === "store" && c.method === "POST"), "فایل تلگرام جریانی به انبار رفت");

  await cb(SC, `sr:${line}:1`);
  n = calls.length;
  await cb(SC, `ss:${S.realTh}`);
  const bid = DB.raw.prepare("SELECT bundle_id FROM sp_lines WHERE id=?").get(line).bundle_id;
  assert.ok(bid);
  const toExpert = sent(n, "sp", EC);
  assert.ok(toExpert.some((m) => btns(m).some((b) => b.callback_data === `xd:${bid}:ok`)), "کارشناسِ همان گفت‌وگو کارت بسته را با دکمه‌های تصمیم می‌گیرد");

  n = calls.length;
  await cb(EC, `xd:${bid}:ok`);
  assert.ok(sent(n, "sp", SC).some((m) => btns(m).some((b) => b.callback_data === `sp:${bid}`)), "تأمین‌کننده دکمهٔ «ارسال پیش‌فاکتور» می‌گیرد");
  await cb(SC, `sp:${bid}`);
  n = calls.length;
  await sp({ message: { message_id: 901, chat: { id: SC, type: "private" }, document: { file_id: "F2", file_size: 10, file_name: "pf.pdf", mime_type: "application/pdf" } } });
  assert.equal(DB.raw.prepare("SELECT state FROM sp_bundles WHERE id=?").get(bid).state, "proforma");
  assert.ok(sent(n, "sp", EC).some((m) => btns(m).some((b) => b.callback_data === `xd:${bid}:fn`)));

  n = calls.length;
  await cb(EC, `xd:${bid}:fn`);
  const warn = lastTo(n, EC);
  assert.match(warn.body.text, /تأیید نهایی هنوز ممکن نیست/);
  assert.ok(btns(warn).some((b) => b.callback_data === `xd:${bid}:fm`), "فقط تیکِ بررسیِ دستی مانده: دکمه‌اش پیشنهاد می‌شود");
  await cb(EC, `xd:${bid}:ai`);
  assert.match(lastTo(calls.length - 1, EC).body.text, /هزینهٔ تقریبی/, "پیش از مدل، هزینه پرسیده می‌شود");
  await cb(EC, `xd:${bid}:fm`);
  assert.equal(DB.raw.prepare("SELECT state FROM sp_bundles WHERE id=?").get(bid).state, "final");
  L = DB.raw.prepare("SELECT * FROM sp_lines WHERE id=?").get(line);
  assert.ok(L.quote_id, "خط استعلام موقت");

  /* فهرست درخواست‌های کارشناس در بات */
  n = calls.length;
  await cb(EC, "xl:r");
  const list = since(n).filter((c) => c.bot === "sp" && (c.method === "editMessageText" || c.method === "sendMessage")).pop();
  assert.match(list.body.text, /درخواست‌هایی که گفت‌وگو دارند/);
  assert.ok(btns(list).some((b) => b.callback_data === "xr:1"));
});

test("مذاکره: برگشت با توضیح ← اصلاح و ارسال دوباره ← رد با دلیلِ نوشتاری در بات", { skip: SKIP }, async () => {
  const EC = 900;
  const r = await call("/sp/x/send", { headers: EX, body: { assignment_id: 1, item_ids: [11], supplier_name: "شرکت سوم", phone: "09120000003", label: "همراه" } });
  const H = { "X-SP-Session": (await call("/sp/login", { body: { k: keyOf(r.data.sms.text), password: passOf(r.data.sms.text) } })).data.session };
  const id = (await call(`/sp/thread/${r.data.thread_id}`, { headers: H })).data.lines[0].id;
  await call(`/sp/line/${id}`, { method: "PUT", headers: H, body: { price: 99000 } });
  await call(`/sp/line/${id}/ready`, { headers: H, body: { on: true } });
  const b1 = (await call(`/sp/thread/${r.data.thread_id}/submit`, { headers: H, body: {} })).data.bundle_id;
  const ret = await call(`/sp/x/bundle/${b1}/decide`, { headers: EX, body: { action: "return", comment: "قیمت با حمل تا کارگاه باشد." } });
  assert.equal(ret.data.state, "returned");
  const th = (await call(`/sp/thread/${r.data.thread_id}`, { headers: H })).data;
  assert.equal(th.lines[0].state, "returned");
  assert.match(th.msgs.pop().body, /قیمت با حمل تا کارگاه باشد/);
  assert.equal((await call(`/sp/line/${id}`, { method: "PUT", headers: H, body: { price: 105000 } })).status, 200, "برگشت‌خورده دوباره قابل ویرایش");
  await call(`/sp/line/${id}/ready`, { headers: H, body: { on: true } });
  const b2 = (await call(`/sp/thread/${r.data.thread_id}/submit`, { headers: H, body: {} })).data.bundle_id;
  assert.notEqual(b2, b1);
  await handleSpUpdate(env, { update_id: 9001, callback_query: { id: "rj", data: `xd:${b2}:rj`, message: { message_id: 1, chat: { id: EC } } } });
  await handleSpUpdate(env, { update_id: 9002, message: { message_id: 9002, chat: { id: EC, type: "private" }, text: "قیمت از بازار بالاتر است." } });
  const b = DB.raw.prepare("SELECT state, comment FROM sp_bundles WHERE id=?").get(b2);
  assert.deepEqual({ ...b }, { state: "rejected", comment: "قیمت از بازار بالاتر است." });
  assert.equal(DB.raw.prepare("SELECT flow_json FROM sp_tg WHERE chat=?").get(String(EC)).flow_json, null, "پرسشِ دلیل بسته شد");
});

test("مینی‌اپ: initData امضاشده با توکن بات؛ دستکاری‌شده یا کهنه پذیرفته نیست", { skip: SKIP }, async () => {
  const enc = (s) => new TextEncoder().encode(s);
  const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
  async function initData(token, user, at = Math.floor(Date.now() / 1000)) {
    const p = new URLSearchParams({ auth_date: String(at), query_id: "q", user: JSON.stringify(user), signature: "sig" });
    const dcs = [...p.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join("\n");
    const k1 = await crypto.subtle.importKey("raw", enc("WebAppData"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sec = await crypto.subtle.sign("HMAC", k1, enc(token));
    const k2 = await crypto.subtle.importKey("raw", sec, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    p.set("hash", hex(await crypto.subtle.sign("HMAC", k2, enc(dcs))));
    return p.toString();
  }
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
});

test("«📨 ارسال» از «بررسی سوابق» (نه جستجوی هوشمند): فقط با /azmayesh؛ تأمین‌کنندهٔ فرضی ← قالب ← پیامکِ شبیه‌سازی‌شده", { skip: SKIP }, async () => {
  const press = async (data, mid = 700) => {
    const n = calls.length;
    await handleUpdate(env, { callback_query: { id: `m${n}`, data, message: { message_id: mid, chat: { id: EXPERT_CHAT } } } });
    const mine = since(n).filter((c) => c.bot === "main");
    const msgs = mine.filter((c) => c.method === "sendMessage" || c.method === "editMessageText");
    const last = msgs[msgs.length - 1];
    const ackCall = mine.find((c) => c.method === "answerCallbackQuery");
    return { text: last ? last.body.text : "", kb: last && last.body.reply_markup ? last.body.reply_markup.inline_keyboard : [], ack: ackCall ? ackCall.body : null };
  };
  const btn = (kb, t) => { const b = kb.flat().find((x) => x.text.includes(t)); return b && (b.callback_data || b.url || b.copy_text); };
  const flowOf = (kb) => /hx:(\d+):t:/.exec(JSON.stringify(kb))[1];

  /* بی /azmayesh: کارتِ قلمِ سوابق همان کارت قبلی است */
  const sel0 = await press("hs:a:1");
  const card0 = await press(`hv:${flowOf(sel0.kb)}:11:h:0`);
  assert.match(card0.text, /سوابق «پیچ آلن M8 فولادی»/);
  assert.ok(!btn(card0.kb, "ارسال به تأمین‌کننده"));

  await handleUpdate(env, { message: { message_id: 1, chat: { id: EXPERT_CHAT, type: "private" }, text: "/azmayesh" } });
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
  assert.match(done.text, /فرستاده شد/);
  assert.match(done.text, /پیامک شبیه‌سازی‌شده/);
  assert.match(done.text, /رمز ورود: \d{6}/);
  assert.match(btn(done.kb, "پنل تأمین‌کننده"), /^https:\/\/site\.test\/tamin-poshtibani\/supplier\.html#k=/);
  assert.match(btn(done.kb, "بات تأمین‌کننده"), /^https:\/\/t\.me\/AriaSupplierBot\?start=s/);
  assert.match(btn(done.kb, "بات مکاتبات"), /^https:\/\/t\.me\/AriaSupplierBot\?start=e/);
  assert.equal(btn(done.kb, "بازگشت به کارت قلم"), `hv:${fid}:11:h:0`);
  const latest = /رمز ورود: (\d{6})/.exec(done.text)[1];
  assert.equal((await call("/sp/login", { body: { k: S.demoK, password: latest } })).status, 200, "رمزِ همین پیامک");
  assert.equal((await call("/sp/login", { body: { k: S.demoK, password: S.demoPass } })).status, 200, "و رمزِ پیامک‌های قبلی هم هنوز");
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
  const save = await call(`/quotes/${q.id}`, { method: "PUT", headers: EX, body: { save: true } });
  assert.equal(save.status, 422, "ثبت موقت هنوز هست؛ فقط با فیلدهای اجباریِ پر");
  assert.ok((save.data.missing || []).includes("dtime"));
  const created = await call("/quotes", { headers: EX, body: { assignment_id: 1, item_ids: [12], supplier_name: "تأمین‌کنندهٔ دستی", price: 999, qty: 7, spec: "دستی", unit: "تن" } });
  assert.equal(created.status, 200);
  const row = DB.raw.prepare("SELECT price, qty, unit, spec FROM quotes WHERE id=?").get(created.data.id);
  assert.deepEqual({ ...row }, { price: null, qty: 50, unit: "عدد", spec: null }, "خط تازه فقط نام دارد؛ واحد و مقدار همان خواستهٔ قلم");
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
