/* ============================================================
   «بررسی سوابق» در بات تلگرام — worker/bot.js (تصمیم مدیر، مهر ۱۴۰۵)

   کارشناس حالت را خودش برمی‌گزیند: «نوع قلم» یا «عین قلم». کارتِ هر قلم ۵ تأمین‌کنندهٔ اول را
   با رتبه و رده نشان می‌دهد، «همهٔ تأمین‌کنندگان» را صفحه‌به‌صفحه، با یک دکمه به حالت دیگر
   می‌رود، «انتخاب جهت استعلام» دارد، و از هر کارت یک قدم به عقب برمی‌گردد.

   کل مسیر روی SQLite واقعی (همان طرحِ ensureSchema) و تلگرامِ بدلی: هر فراخوانیِ API تلگرام
   ثبت می‌شود و متن و دکمه‌هایش سنجیده می‌شوند.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";

import { loadTP, sqliteD1 } from "./run.mjs";
import * as W from "../../../worker/catalog.js";
import { ensureSchema } from "../../../worker/api.js";
import { handleUpdate } from "../../../worker/bot.js";

const TP0 = loadTP();
const XL = TP0.XLSX;
const book = (sheets) => {
  const wb = XL.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) XL.utils.book_append_sheet(wb, XL.utils.aoa_to_sheet(aoa), name);
  return wb;
};

/* ---------- فهرست و سوابقِ آزمایشی ----------
   پیچ: ۱۰۰۱ و ۱۰۰۲ هم‌لایه (M8)، ۱۰۰۳ (M10) نوعِ همان. «عین قلمِ» ۱۰۰۱ سه تأمین‌کننده دارد؛
   «نوع قلمِ» آن ۲۳ تأمین‌کنندهٔ دیگرِ ۱۰۰۳ را هم — تا «همه» دو صفحه شود. */
const ITEM_HEAD = ["کد قلم", "عنوان قلم", "نوع قلم", "واحد مرجع", "کد خوشه", "کد طبقهٔ اصناف", "باقیماندهٔ متن", "اندازه", "جنس", "ویژگی‌ها (JSON)"];
const item = (code, title, head, attrs) => [code, title, head, "عدد", "C04", "200", "", attrs["اندازه"] || "", attrs["جنس"] || "", JSON.stringify(attrs)];
const H = ["شماره", "تاریخ سفارش", "وضعیت", "کارشناس خرید", "کد قلم خریدنی", "عنوان قلم خریدنی", "مقدار", "واحد سنجش", "مبلغ به ارز عملیاتی", "تامین کننده", "کد", "رده", "ماه", "فصل", "سال"];
const buy = (no, code, title, qty, supplier, grade, date = "1404/10/01") => [String(no), date, "بسته شده", "ک", code, title, qty, "عدد", qty * 1000, supplier, grade ? 600 + no : null, grade, +date.slice(5, 7), "زمستان", date.slice(0, 4)];
const HISTORY = [
  /* عین قلم (۱۰۰۱، ۱۰۰۲): «الف» و «ب» هم‌امتیاز — ردهٔ A جلوتر */
  buy(1, "1001", "پیچ آلن M8 فولادی", 40, "شرکت ب", "B"),
  buy(2, "1002", "پیچ آلن M8 فولاد", 40, "شرکت الف", "A"),
  buy(3, "1001", "پیچ آلن M8 فولادی", 10, "شرکت ج", null),
  /* ۲۳ تأمین‌کنندهٔ ۱۰۰۳ — مقدارِ نزولی، پس ترتیبشان معلوم است */
  ...Array.from({ length: 23 }, (_, i) => buy(100 + i, "1003", "پیچ M10", 90 - i, `تأمین‌کنندهٔ ${String(i + 1).padStart(2, "0")}`, null)),
  buy(200, "2001", "مهره M8", 5, "مهره‌فروشی", "C"),
];
function books() {
  return {
    items: book({
      items: [ITEM_HEAD,
        item("1001", "پیچ آلن M8 فولادی", "پیچ", { "اندازه": "M8", "جنس": "فولاد" }),
        item("1002", "پیچ آلن M8 فولاد", "پیچ", { "اندازه": "M8", "جنس": "فولاد" }),
        item("1003", "پیچ M10", "پیچ", { "اندازه": "M10" }),
        item("2001", "مهره M8", "مهره", { "اندازه": "M8" })],
      item_attributes: [["کد قلم", "نوع قلم", "نام لایهٔ ویژگی", "نام لایه (انگلیسی)", "مقدار لایه"], ["x", "x", "اندازه", "size", "x"], ["x", "x", "جنس", "material", "x"]],
    }),
    indices: book({
      class_index: [["کد سرگروه اصناف", "سرگروه اصناف", "کد طبقهٔ اصناف", "طبقهٔ اصناف", "کد شاخص"], ["20", "قطعات", "200", "اتصالات", "IDX_A"]],
      index_quarterly: [["کد شاخص", "دوره", "سال", "شمارهٔ فصل", "نام فصل", "شاخص (زمستان ۱۴۰۴ = ۱۰۰)"], ["IDX_A", "1404Q4", 1404, 4, "زمستان", 100]],
    }),
    units: book({
      head_rates: [["نوع قلم", "واحد ثبت‌شده", "واحد مرجع", "نرخ تبدیل به واحد مرجع", "مبنای نرخ", "اطمینان"]],
      cluster_rates: [["کد خوشه", "نام خوشه", "نوع قلم", "واحد ثبت‌شده", "واحد مرجع", "نرخ تبدیل به واحد مرجع", "مبنای نرخ", "اطمینان"]],
      item_rates: [["کد قلم", "عنوان قلم", "نوع قلم", "واحد ثبت‌شده", "واحد مرجع", "نرخ تبدیل به واحد مرجع", "مبنای نرخ", "منشأ"]],
    }),
    history: book({ "حداکثر 500000 رکورد": [H, ...HISTORY] }),
  };
}

/* ---------- دیتابیس: همان طرحِ Worker، یک بار (ensureSchema فقط بار اول در هر فرایند اجرا می‌شود) ---------- */
const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = { DB, TG_BOT_TOKEN: "tok", TG_API_BASE: "https://tg.test/bot" };
const CHAT = 555, OTHER = 777;
if (DB) {
  await ensureSchema(env);
  const out = TP0.TP.buildCatalog(books());
  W.resetCatalogCache();
  const beg = await W.catalogBegin(env, { fp: out.fp, meta: out.meta, stats: out.stats, filename: "test" });
  for (const [t, rows] of Object.entries(out.tables)) {
    for (let i = 0; i < rows.length; i += 50) await W.catalogChunk(env, { import_id: beg.import_id, table: t, rows: JSON.parse(JSON.stringify(rows.slice(i, i + 50))) });
  }
  await W.catalogFinish(env, { import_id: beg.import_id });
  const t = Date.now();
  DB.raw.exec("DELETE FROM experts");
  DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,telegram_chat,created_at) VALUES (1,'کارشناس یک','یک','9001',1,1,?,?), (2,'کارشناس دو','دو','9002',1,1,?,?)").run(String(CHAT), t, String(OTHER), t);
  DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES ('R-1','1405/07/01','پروژهٔ یک'), ('R-2','1405/07/01','پروژهٔ دو')").run();
  DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,dispatched_at,created_at) VALUES (1,'R-1',1,?,?), (2,'R-2',1,?,?)").run(t, t, t, t);
  const ins = DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,code,title,qty,unit,state,assignment_id) VALUES (?,?,?,?,?,?,?,?,'open',?)");
  ins.run(11, "R-1", "a", 1, "1001", "پیچ آلن M8 فولادی", 10, "عدد", 1);
  ins.run(21, "R-2", "a", 1, "1001", "پیچ آلن M8 فولادی", 10, "عدد", 2);
  ins.run(22, "R-2", "b", 2, "2001", "مهره M8", 4, "عدد", 2);
}

/* ---------- تلگرامِ بدلی ---------- */
const sent = [];
let nextMsg = 1000;
globalThis.fetch = async (url, init) => {
  const method = String(url).split("/").pop();
  const body = JSON.parse((init && init.body) || "{}");
  sent.push({ method, body });
  return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: method === "sendMessage" ? ++nextMsg : body.message_id || 1 } }) };
};
let cbn = 0;
/** یک فشردنِ دکمه؛ خروجی: آخرین پیامِ فرستاده/ویرایش‌شده و پاسخِ دکمه */
async function press(data, { chat = CHAT, mid = 500 } = {}) {
  const from = sent.length;
  await handleUpdate(env, { callback_query: { id: `cb${++cbn}`, data, message: { message_id: mid, chat: { id: chat } } } });
  const mine = sent.slice(from);
  const msgs = mine.filter((c) => c.method === "sendMessage" || c.method === "editMessageText");
  const last = msgs[msgs.length - 1] || null;
  const ackCall = mine.find((c) => c.method === "answerCallbackQuery");
  return { all: msgs, last, text: last ? last.body.text : "", kb: last && last.body.reply_markup ? last.body.reply_markup.inline_keyboard : [], ack: ackCall ? ackCall.body : null };
}
const buttons = (kb) => kb.flat().map((b) => [b.text, b.callback_data]);
const cbOf = (kb, text) => { const b = kb.flat().find((x) => x.text.includes(text)); return b ? b.callback_data : null; };
const supplierLines = (text) => text.split("\n").filter((l) => /^[۰-۹]+\. /.test(l)).map((l) => l.replace(/<[^>]+>/g, ""));

test("یک قلم: اول انتخاب حالت، بعد «نوع قلم»: ۵ تأمین‌کنندهٔ اول با رتبه و رده، و «همه» صفحه‌به‌صفحه", { skip: SKIP }, async () => {
  const start = await press("hs:a:1");
  assert.match(start.text, /کدام را ببینم؟/);
  const hH = cbOf(start.kb, "نوع قلم"), hE = cbOf(start.kb, "عین قلم");
  assert.match(hH, /^hm:\d+:h$/); assert.match(hE, /^hm:\d+:e$/);
  assert.match(cbOf(start.kb, "بازگشت"), /^hx:\d+:back:0$/);

  const head = await press(hH);
  assert.match(head.text, /🔹 <b>نوع قلم<\/b> — پیچ/);
  assert.match(head.text, /۲۶ تأمین‌کننده/, "۳ تأمین‌کنندهٔ ۱۰۰۱/۱۰۰۲ و ۲۳ تأمین‌کنندهٔ ۱۰۰۳");
  const top = supplierLines(head.text);
  assert.equal(top.length, 5, "فقط ۵ تای اول");
  assert.match(top[0], /^۱\. تأمین‌کنندهٔ 01/, "بیشترین مقدار = بالاترین امتیاز گشتاوری (نامِ تأمین‌کننده همان‌طور که در فایل است)");
  assert.match(head.text, /و ۲۱ تأمین‌کنندهٔ دیگر/);
  const all1 = cbOf(head.kb, "همهٔ تأمین‌کنندگان (۲۶)");
  assert.match(all1, /^hv:\d+:11:h:1$/);
  assert.match(cbOf(head.kb, "عین قلم"), /^hv:\d+:11:e:0$/, "با یک دکمه به «عین قلم»");
  assert.match(cbOf(head.kb, "انتخاب جهت استعلام"), /^hq:\d+:11:h$/);
  assert.match(cbOf(head.kb, "بازگشت"), /^hx:\d+:mode:0$/, "یک قلم: بازگشت به انتخابِ حالت");
  const done = DB.raw.prepare("SELECT hist_done_at FROM items WHERE id=11").get();
  assert.ok(done.hist_done_at, "خواندنِ سوابق همان انجامِ مرحله است");

  const p1 = await press(all1);
  assert.match(p1.text, /همهٔ تأمین‌کنندگان<\/b> — صفحهٔ ۱ از ۲/);
  assert.equal(supplierLines(p1.text).length, 20);
  const next = cbOf(p1.kb, "صفحهٔ بعد");
  assert.match(next, /:h:2$/);
  assert.equal(cbOf(p1.kb, "صفحهٔ قبل"), null);
  assert.match(cbOf(p1.kb, "تأمین‌کنندهٔ اول"), /:h:0$/);
  const p2 = await press(next);
  assert.equal(supplierLines(p2.text).length, 6);
  assert.match(supplierLines(p2.text)[0], /^۲۱\. /, "شماره‌گذاری از صفحهٔ قبل ادامه دارد");
  assert.match(cbOf(p2.kb, "صفحهٔ قبل"), /:h:1$/);
  assert.equal(cbOf(p2.kb, "صفحهٔ بعد"), null);
});

test("«عین قلم» از همان کارت؛ در امتیاز برابر ردهٔ بالاتر جلوتر؛ انتخاب جهت استعلام و بازگشت به کارت", { skip: SKIP }, async () => {
  const start = await press("hs:a:1");
  const head = await press(cbOf(start.kb, "نوع قلم"));
  const exact = await press(cbOf(head.kb, "عین قلم"));
  assert.match(exact.text, /🎯 <b>عین قلم<\/b> — پیچ · اندازه: M8 · جنس: آهنی/);
  const lines = supplierLines(exact.text);
  assert.equal(lines.length, 3);
  assert.match(lines[0], /شرکت الف · رده A/, "امتیاز برابر با «شرکت ب»؛ ردهٔ A جلوتر از B");
  assert.match(lines[1], /شرکت ب · رده B/);
  assert.equal(cbOf(exact.kb, "همهٔ تأمین‌کنندگان"), null, "کمتر از ۵ تأمین‌کننده: «همه» لازم نیست");
  assert.match(cbOf(exact.kb, "نوع قلم"), /^hv:\d+:11:h:0$/, "و برگشت به «نوع قلم» با یک دکمه");

  const pick = await press(cbOf(exact.kb, "انتخاب جهت استعلام"));
  assert.match(pick.text, /تأمین‌کنندگانِ «پیچ آلن M8 فولادی»<\/b> — 🎯 عین قلم/);
  assert.deepEqual(pick.kb.slice(0, 3).map((r) => r[0].text.replace(/^☐ /, "")), ["شرکت الف", "شرکت ب", "شرکت ج"], "تأمین‌کنندگانِ همان حالت");
  const back = await press(cbOf(pick.kb, "بازگشت"));
  assert.match(back.text, /🎯 <b>عین قلم<\/b>/, "بازگشت به همان کارتِ قلم");

  const mode = await press(cbOf(back.kb, "بازگشت"));
  assert.match(mode.text, /کدام را ببینم؟/);
  const menu = await press(cbOf(mode.kb, "بازگشت"));
  assert.match(menu.text, /درخواست R-1/, "و یک قدم دیگر: منوی درخواست");
});

test("چند قلم: انتخاب اقلام ← حالت ← پیامِ خلاصه و انتخاب قلم؛ همین اقلام در حالت دیگر؛ بازگشت‌ها", { skip: SKIP }, async () => {
  const sel = await press("hs:a:2");
  assert.match(sel.text, /سوابق کدام اقلام را ببینم؟/);
  const mode = await press(cbOf(sel.kb, "همه اقلام"));
  assert.match(mode.text, /سوابق ۲ قلم/);
  const run = await press(cbOf(mode.kb, "عین قلم"));
  const summary = run.all.find((c) => c.method === "sendMessage" && /سوابق تأمین — درخواست R-2/.test(c.body.text));
  assert.ok(summary, "پیامِ خلاصه");
  assert.match(summary.body.text, /🎯 <b>عین قلم<\/b>/);
  assert.match(summary.body.text, /مهره‌فروشی<\/b> · رده C/);
  assert.match(summary.body.text, /شرکت الف<\/b> · رده A[^]*شرکت ب<\/b> · رده B/, "هم‌امتیاز: ردهٔ A پیش از B");
  const picker = run.last;
  assert.match(picker.body.text, /کارتِ کدام قلم را باز کنم؟/);
  const kb = picker.body.reply_markup.inline_keyboard;
  assert.deepEqual(buttons(kb).slice(0, 2).map(([t, c]) => [t.replace(/ · .*/, ""), c.replace(/^hv:\d+:/, "")]), [["پیچ آلن M8 فولادی", "21:e:0"], ["مهره M8", "22:e:0"]]);
  assert.match(cbOf(kb, "همین اقلام با «نوع قلم»"), /^hm:\d+:h$/);
  assert.match(cbOf(kb, "بازگشت"), /^hx:\d+:mode:0$/);

  const card = await press(cbOf(kb, "مهره M8"));
  assert.match(card.text, /سوابق «مهره M8»/);
  assert.match(cbOf(card.kb, "بازگشت"), /^hb:p\d+$/, "چند قلم: بازگشت به انتخاب قلم");
  const again = await press(cbOf(card.kb, "بازگشت"));
  assert.match(again.text, /کارتِ کدام قلم را باز کنم؟/);

  const head = await press(cbOf(again.kb, "همین اقلام با «نوع قلم»"));
  assert.ok(head.all.some((c) => /🔹 <b>نوع قلم<\/b>/.test(c.body.text)), "همین دو قلم این بار با «نوع قلم»");
  assert.match(cbOf(head.kb, "پیچ آلن M8 فولادی"), /:21:h:0$/);
  const backMode = await press(cbOf(head.kb, "بازگشت"));
  const backSel = await press(cbOf(backMode.kb, "بازگشت"));
  assert.match(backSel.text, /سوابق کدام اقلام را ببینم؟/, "تا انتخاب اقلام");
});

test("مالکیت: کارتِ سوابقِ یک کارشناس از گفت‌وگوی دیگری باز نمی‌شود", { skip: SKIP }, async () => {
  const start = await press("hs:a:1");
  const hv = cbOf((await press(cbOf(start.kb, "نوع قلم"))).kb, "عین قلم");
  const r = await press(hv, { chat: OTHER });
  assert.equal(r.last, null, "هیچ پیامی برای کارشناس دیگر");
  assert.ok(r.ack && r.ack.show_alert, "فقط هشدارِ دکمه");
});
