/* ============================================================
   باگ‌های بازبینیِ بات تلگرام (مهر ۱۴۰۵) — worker/bot.js روی SQLite واقعی و تلگرامِ بدلی

   تلگرامِ بدلی همان سقف‌های واقعی را اعمال می‌کند: متنِ بیش از ۴۰۹۶ نویسه و صفحه‌کلیدِ بیش از
   صد دکمه رد می‌شود — همان چیزی که در تولید پیام را بی‌صدا از بین می‌برد.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./run.mjs";
import { ensureSchema } from "../../../worker/api.js";
import { handleUpdate, parsePrice, extractSummary } from "../../../worker/bot.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = { DB, TG_BOT_TOKEN: "tok", TG_API_BASE: "https://tg.test/bot" };
const CHAT = 555, MGR = -100777;
if (DB) {
  await ensureSchema(env);
  const t = Date.now();
  DB.raw.exec("DELETE FROM experts; DELETE FROM templates;");
  DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,telegram_chat,created_at) VALUES (1,'کارشناس یک','یک','9001',1,1,?,?)").run(String(CHAT), t);
  DB.raw.exec("INSERT INTO requests (id,date,party) VALUES ('R-A','1405/07/01','پروژهٔ الف'), ('R-C','1405/07/01','پروژهٔ ج'), ('R-L','1405/07/01','پروژهٔ بلند')");
  const as = DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,created_at) VALUES (?,?,1,3,?,?)");
  as.run(1, "R-A", t, t); as.run(2, "R-C", t, t); as.run(3, "R-L", t, t);
  const it = DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,code,title,qty,unit,state,assignment_id) VALUES (?,?,?,?,?,?,1,'عدد','open',?)");
  /* یک قلم (کد ۱۰۰۱) در دو درخواست باز — جستجوی قبلی مالِ R-A است */
  it.run(11, "R-A", "a", 1, "1001", "پیچ آلن M8 فولادی", 1);
  it.run(21, "R-C", "a", 1, "1001", "پیچ آلن M8 فولادی", 2);
  /* تأمین‌کننده‌ای با سی قلم و دو شرطِ فاکتورِ نادرست */
  const q = DB.raw.prepare("INSERT INTO quotes (assignment_id,item_id,supplier_name,unit,qty,price,dtime,pay,invoice,vat,saved,final,created_at,updated_at) VALUES (3,?,?,'عدد',1,1000,'فوری','۳۰ روزه','رسمی','دارد',0,0,?,?)");
  for (let n = 1; n <= 30; n++) {
    it.run(300 + n, "R-L", `k${n}`, n, null, `قلم شمارهٔ ${n} با عنوانی نسبتاً بلند برای آزمون سقف پیام`, 3);
    q.run(300 + n, "تأمین بلند", t, t);
  }
  DB.raw.prepare("INSERT INTO smart_searches (id,item_id,assignment_id,expert_id,request_id,item_code,result_json,created_at) VALUES (900,11,1,1,'R-A','1001',?,?)")
    .run(JSON.stringify({ suppliers: [{ name: "تأمین یک" }] }), t);
  DB.raw.prepare("INSERT INTO templates (id,expert_id,title,body,created_at) VALUES (1,NULL,'مشترک','متن مشترک',?), (2,1,'خودم','متن خودم',?)").run(t, t);
  DB.raw.prepare("INSERT INTO decisions (id,assignment_id,expert_id,action,requested_at) VALUES (50,1,1,'hold',?)").run(t);
  DB.raw.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('managerChat',?,?)").run(JSON.stringify(String(MGR)), t);
}

/* ---------- تلگرامِ بدلی با سقف‌های واقعی ---------- */
const sent = [];
globalThis.fetch = async (url, init) => {
  const method = String(url).split("/").pop();
  const body = init && typeof init.body === "string" ? JSON.parse(init.body) : {};
  const buttons = body.reply_markup && body.reply_markup.inline_keyboard ? body.reply_markup.inline_keyboard.flat().length : 0;
  const bad = ((method === "sendMessage" || method === "editMessageText") && String(body.text || "").length > 4096) || buttons > 100;
  sent.push({ method, body, rejected: bad });
  if (bad) return { ok: false, status: 400, json: async () => ({ ok: false, error_code: 400, description: "Bad Request: message is too long" }) };
  return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 1000 + sent.length } }) };
};
let cbn = 0;
async function press(data, { chat = CHAT, chatType = "private" } = {}) {
  const from = sent.length;
  await handleUpdate(env, { callback_query: { id: `cb${++cbn}`, data, message: { message_id: 500, chat: { id: chat, type: chatType } } } }).catch((e) => sent.push({ method: "THROWN", body: { e: e.message } }));
  const mine = sent.slice(from);
  const msgs = mine.filter((c) => (c.method === "sendMessage" || c.method === "editMessageText") && !c.rejected);
  const last = msgs[msgs.length - 1] || null;
  return {
    mine, text: last ? last.body.text : "", kb: last && last.body.reply_markup ? last.body.reply_markup.inline_keyboard.flat() : [],
    ack: (mine.find((c) => c.method === "answerCallbackQuery") || {}).body || null,
  };
}

test("قیمت: «تومان» ده برابر می‌شود و ممیز فارسی پذیرفته است", () => {
  assert.equal(parsePrice("2500000"), 2500000);
  assert.equal(parsePrice("۲٬۵۰۰٬۰۰۰ ریال"), 2500000);
  assert.equal(parsePrice("۲۵۰٬۰۰۰ تومان"), 2500000, "پیش از این ۲۵۰۰۰۰ ریال ثبت می‌شد — ده برابر کمتر");
  assert.equal(parsePrice("250,000 toman"), 2500000);
  assert.equal(parsePrice("۲٫۵"), 2.5);
  assert.equal(parsePrice("۱٫۱ تومان"), 11);
  assert.equal(parsePrice("دو میلیون"), null);
  assert.equal(parsePrice("0"), null);
});

test("خلاصهٔ پیش‌فاکتور قیمتِ سطرِ فقط-مبلغ‌کل را همان‌طور نشان می‌دهد که ثبت می‌شود", () => {
  const titles = new Map([[1, "شیر فلکه"], [2, "لوله"]]);
  const s = extractSummary({ extractable: true, currency: "ریال", lines: [
    { matched_item_id: 1, qty: 4, total_price: 5000000, unit_price: null, confidence: "high" },
    { matched_item_id: 2, qty: 2, unit_price: 300000, confidence: "medium" },
  ] }, titles);
  assert.match(s, /۱٬۲۵۰٬۰۰۰ ریال <i>\(از جمع ÷ مقدار\)<\/i>/, "۵٬۰۰۰٬۰۰۰ ÷ ۴");
  assert.match(s, /۳۰۰٬۰۰۰ ریال ⚠️/);
  assert.doesNotMatch(s, /\n {3}۰ /, "دیگر «۰» نشان داده نمی‌شود");
});

test("قالب مشترک از بات حذف نمی‌شود؛ قالبِ خودِ کارشناس حذف می‌شود", { skip: SKIP }, async () => {
  const shared = await press("tp:v:1");
  assert.ok(!shared.kb.some((b) => b.callback_data === "tp:dl:1"), "دکمهٔ حذف برای قالب مشترک نیست");
  const tryDel = await press("tp:dk:1");
  assert.equal(tryDel.ack.show_alert, true);
  assert.match(tryDel.ack.text, /فقط مدیر/);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM templates WHERE id=1").get().n, 1, "قالب مشترک ماند");
  const own = await press("tp:v:2");
  assert.ok(own.kb.some((b) => b.callback_data === "tp:dl:2"));
  await press("tp:dk:2");
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM templates WHERE id=2").get().n, 0);
});

test("«بازگشت» از فهرست پیام‌ها همان قلمِ همین درخواست را نگه می‌دارد", { skip: SKIP }, async () => {
  const r = await press("sg:900:ch:21");
  const add = r.kb.find((b) => String(b.callback_data).startsWith("sq:900:open:"));
  assert.equal(add && add.callback_data, "sq:900:open:21", "افزودن به استعلام برای قلمِ R-C، نه قلمِ R-A که جستجو از آن‌جا آمده بود");
});

test("«ثبت موقت» ناموفقِ تأمین‌کنندهٔ سی‌قلمی پاسخ می‌گیرد و ایرادِ مشترک یک بار گفته می‌شود", { skip: SKIP }, async () => {
  const qid = DB.raw.prepare("SELECT id FROM quotes WHERE assignment_id=3 ORDER BY id LIMIT 1").get().id;
  const r = await press(`qs:${qid}:0`);
  assert.ok(!r.mine.some((c) => c.method === "THROWN"), "خطای پنهان نداشت");
  assert.ok(!r.mine.some((c) => c.rejected), "تلگرام پیامی را رد نکرد");
  assert.match(r.text, /ثبت موقت نشد/);
  assert.equal(r.text.split("زمان تحویل باید").length - 1, 1, "ایرادِ زمان تحویل یک بار");
  assert.equal(r.text.split("شرایط تسویه باید").length - 1, 1, "ایرادِ شرایط تسویه یک بار");
  assert.ok(r.text.length < 4096);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM quotes WHERE assignment_id=3 AND saved=1").get().n, 0);
});

test("رد تصمیم از کانال مدیر: دلیل آن‌جا خوانده نمی‌شود، پس به پنل راهنمایی می‌شود", { skip: SKIP }, async () => {
  const ch = await press("mdec:50:no", { chat: MGR, chatType: "channel" });
  assert.equal(ch.ack.show_alert, true);
  assert.match(ch.ack.text, /پنل مدیر/);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM settings WHERE key='mgrReject'").get().n, 0, "منتظرِ پاسخی نمی‌ماند که هرگز نمی‌رسد");
  await press("mdec:50:no", { chat: MGR, chatType: "supergroup" });
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM settings WHERE key='mgrReject'").get().n, 1, "در گروه همان روال قبلی: دلیل را بنویسید");
});
