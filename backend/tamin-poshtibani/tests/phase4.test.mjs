/* ============================================================
   طرح «خرید هوشمند، کارشناس ناظر» — فاز ۴ (مهر ۱۴۰۵): پنل تأمین‌کننده و پیش‌فاکتور تولیدی

   • پیش‌فاکتور از همان فیلدهای تأمین‌کننده ساخته می‌شود: جمع‌ها، ارزش افزودهٔ ۱۰٪، شرایط، Word و HTML
   • «خوانش هوشمند پیش‌فاکتور» خاموش (پیش‌فرض) — روی SQLite واقعی، با تلگرام، انبار، مدل و پیامکِ بدلی:
     🔒/🔓ِ نرمال‌سازی روی خطِ تأمین‌کننده (و همان عکس برای تأمین‌کنندهٔ دوم) ← فرم: مقدار 🔒 کلِ مقدار و 🔓 کمتر، واحد ثابت،
     عنوان و لایهٔ 🔓، لایهٔ کمّی با واحد ← اعتبار پیش‌فاکتور اجباری و تاریخ تحویل از تقویم ← پیش‌نمایش با خانه‌های خالی ←
     ارسال ← «تأیید» همان تأیید نهایی با مقدارهای خودِ تأمین‌کننده و Word تولیدی در پیش‌فاکتورها ← پیش‌فاکتورِ خودِ تأمین‌کننده
     فقط پیوست، پیش‌فاکتورِ کارشناس دست‌نخورده ← کارشناس هوشمند بی خوانش سند ← کلیدِ پنل پشتیبانی
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { proformaData, termRows, renderProformaDoc, proformaHtml } from "../../../worker/pfdoc.js";
import { unzip } from "../../../worker/docx.js";
import { inflateRawSync } from "node:zlib";

import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import { aiTick } from "../../../worker/ai-agent.js";
import { newSession, locksOfLine } from "../../../worker/sp-core.js";

const SAMPLE = {
  company: "شرکت تونل سد آریانا", supplier: "آهن الف", request: { id: "2182371", party: "پروژهٔ سد" }, date: "1405/07/14", no: 12,
  lines: [
    { no: 1, title: "میلگرد ۱۲ آجدار", layers: [{ k: "قطر", v: "12 میلی‌متر" }, { k: "رده", v: "A3" }], extras: [{ k: "برند", v: "ذوب آهن" }], qty: 5000, unit: "کیلوگرم", price: 410000, note: "تحویل از انبار" },
    { no: 2, title: "سیم آرماتوربندی", layers: [], extras: [], qty: 100, unit: "کیلوگرم", price: 950000, note: "" },
  ],
  terms: { valid_days: "3", dtime: "10", pay: "نقدی", invoice: "رسمی", vat: "دارد", place: "سایر", place_other: "کارگاه گتوند" },
  comment: "حمل با خریدار",
};

/** متنِ word/document.xml یک فایل Word */
async function docXml(bytes) {
  const files = await unzip(new Uint8Array(bytes));
  const e = files.find((x) => x.name === "word/document.xml");
  return new TextDecoder().decode(e.method === 8 ? inflateRawSync(e.raw) : e.raw);
}

test("پیش‌فاکتور تولیدی: جمع‌ها، ارزش افزوده و شرایط", () => {
  const d = proformaData(SAMPLE);
  assert.equal(d.lines[0].total, 2050000000);
  assert.equal(d.sum, 2050000000 + 95000000);
  assert.equal(d.vat, Math.round(d.sum * 0.1), "ارزش افزوده ۱۰٪، همان فرم کمیسیون");
  assert.equal(d.grand, d.sum + d.vat);
  assert.equal(d.lines[0].desc, "قطر: 12 میلی‌متر · رده: A3 · برند: ذوب آهن");
  assert.deepEqual(termRows(SAMPLE.terms).map(([k, v]) => `${k}=${v}`), ["اعتبار پیش‌فاکتور=3 روز", "زمان تحویل=10 روز پس از سفارش", "شرایط تسویه=نقدی",
    "نوع فاکتور=رسمی", "ارزش افزوده=دارد", "محل تحویل=کارگاه گتوند"]);
  assert.equal(termRows({ dtime: "1405/07/20" })[0][1], "تا تاریخ 1405/07/20");
  assert.equal(proformaData({ ...SAMPLE, terms: { ...SAMPLE.terms, vat: "ندارد" } }).vat, 0);
});

test("پیش‌فاکتور تولیدی: فایل Word و پیش‌نمایش با خانه‌های لازمِ خالی", async () => {
  const blob = await renderProformaDoc(SAMPLE);
  const doc = await docXml(await blob.arrayBuffer());
  assert.match(doc, /پیش‌فاکتور/);
  assert.match(doc, /آهن الف/);
  assert.match(doc, /۲۱۸۲۳۷۱/, "رقم فارسی، مثل بقیهٔ اسناد Word (docx.js:persianize)");
  assert.match(doc, /۲,۰۵۰,۰۰۰,۰۰۰/, "مبلغ کل ردیف");
  const html = proformaHtml({ ...SAMPLE, terms: { ...SAMPLE.terms, pay: "" } }, { missing: ["pay", "price:2"] });
  assert.match(html, /pf-miss/);
  assert.match(html, /شرایط تسویه<\/th><td>— لازم است/);
  assert.match(html, /<b>۲,۰۵۰,۰۰۰,۰۰۰<\/b>/, "قیمت‌ها درشت و با رقم فارسی");
});

/* ---------- مسیرِ خاموشِ «خوانش هوشمند» روی SQLite واقعی ---------- */
const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = {
  DB, TG_BOT_TOKEN: "tok", TG_SP_BOT_TOKEN: "sptok", TG_WEBHOOK_SECRET: "sec", TG_API_BASE: "https://tg.test/bot", TG_FILE_API_BASE: "https://tgfile.test/bot",
  SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_KEY: "svc", ANTHROPIC_API_KEY: "k", ANTHROPIC_API_BASE: "https://ai.test", SITE_ORIGIN: "https://site.test",
  TEXTBEE_API_KEY: "tbk", TEXTBEE_API_BASE: "https://sms.test",
};
const EX = { "X-Expert-Code": "9001" }, EXAI = { "X-Expert-Code": "7001" };
const norm = (head, layers, locks) => JSON.stringify({ v: 2, head, layers, locks, source: "catalog" });

if (DB) {
  await ensureSchema(env);
  /* بی ردیفِ aiSwitches: «خوانش هوشمند پیش‌فاکتور» خاموش — پیش‌فرضِ فاز ۴ */
  const t = Date.now();
  DB.raw.exec("DELETE FROM experts");
  DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,telegram_chat,created_at) VALUES (1,'کارشناس یک','آقای یک','9001',1,1,NULL,?), (2,'test','test','7001',1,1,'701',?)")
    .run(t, t);
  DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES ('R-4','1405/07/14','پروژهٔ فاز ۴'), ('R-AI','1405/07/14','پروژهٔ هوشمند')").run();
  DB.raw.prepare("INSERT INTO ai_agents (expert_id,mode,on_at,updated_at) VALUES (2,'on',?,?)").run(t - 1000, t);
  DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,deadline_at,created_at) VALUES (1,'R-4',1,5,?,?,?), (2,'R-AI',2,5,?,?,?)")
    .run(t, t + 5 * 86400000, t, t, t + 5 * 86400000, t);
  const ins = DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,title,spec,qty,unit,state,assignment_id,norm_json) VALUES (?,?,?,?,?,?,?,?,'open',?,?)");
  /* عنوان و مقدار 🔓؛ «اندازه» 🔒 و «جنس» 🔓 */
  ins.run(11, "R-4", "a", 1, "پیچ آلن M8 فولادی", null, 100, "عدد", 1, norm("پیچ", { "اندازه": "M8", "جنس": "فولاد" }, { title: false, qty: false, layers: { "اندازه": true, "جنس": false } }));
  /* بی قفلِ صریح: همه 🔒 (تصمیم ۲) */
  ins.run(12, "R-4", "b", 2, "مهره M8", null, 50, "عدد", 1, norm("مهره", { "اندازه": "M8" }, {}));
  /* مقدار 🔓 برای کارشناس هوشمند */
  ins.run(31, "R-AI", "a", 1, "گریس نسوز کیلویی", null, 200, "کیلوگرم", 2, norm("گریس", { "جنس": "نسوز" }, { qty: false }));
  /* جستجوی هوشمندِ اخیرِ همان قلم (بی نتیجه): کارشناس هوشمند دوباره خرجش نمی‌کند */
  DB.raw.prepare("INSERT INTO smart_searches (id,item_id,assignment_id,expert_id,result_json,created_at) VALUES (70,31,2,2,?,?)").run(JSON.stringify({ suppliers: [] }), t);
}

/* ---------- دنیای بیرونِ بدلی ---------- */
const calls = [];
let nextMsg = 5000;
let model = () => { throw new Error("پاسخِ مدل برای این گام تعریف نشده"); };
const R = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.startsWith("https://tg.test/bot")) {
    const rest = u.slice("https://tg.test/bot".length);
    const token = rest.split("/")[0], method = rest.split("/").pop();
    const body = typeof init.body === "string" ? JSON.parse(init.body) : {};
    calls.push({ bot: token === "sptok" ? "sp" : "main", method, body });
    if (method === "getMe") return R({ ok: true, result: { id: 77, username: token === "sptok" ? "AriaSupplierBot" : "ArianaSupplyBot" } });
    return R({ ok: true, result: ["sendMessage", "sendDocument"].includes(method) ? { message_id: ++nextMsg } : true });
  }
  if (u.startsWith("https://sb.test/storage/v1/object/sign/")) return R({ signedURL: "/object/sign/proformas/x?token=abc" });
  if (u.startsWith("https://sb.test/storage/v1/object/")) {
    const method = init.method || "GET";
    calls.push({ bot: "store", method, url: u });
    if (method === "GET") return new Response("not found", { status: 404 });
    return R({ Key: "x" });
  }
  if (u.startsWith("https://ai.test/")) { const body = JSON.parse(init.body); calls.push({ bot: "ai", body }); return R(model(body)); }
  if (u.startsWith("https://sms.test/")) { calls.push({ bot: "sms", body: JSON.parse(init.body) }); return R({ data: { success: true, smsBatchId: `b${calls.length}`, recipientCount: 1 } }); }
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
  while (pend.length) await Promise.all(pend.splice(0));
  const type = res.headers.get("content-type") || "";
  const buf = await res.arrayBuffer();
  let data = null;
  if (/json/.test(type)) { try { data = JSON.parse(new TextDecoder().decode(buf)); } catch (_) { data = null; } }
  return { status: res.status, data, type, buf };
}
const since = (n) => calls.slice(n);
let SUP = {};
if (DB) SUP = { "X-Support-Token": (await call("/support/setup", { body: { pass: "azmoon-123" } })).data.token };
const usage = { input_tokens: 6000, output_tokens: 700, cache_read_input_tokens: 3000, cache_creation_input_tokens: 0 };
const jsonOut = (o) => ({ model: "claude-opus-5-5", stop_reason: "end_turn", usage, content: [{ type: "thinking", thinking: "" }, { type: "text", text: JSON.stringify(o) }] });
const lineOf = (th, item) => DB.raw.prepare("SELECT * FROM sp_lines WHERE thread_id=? AND item_id=?").get(th, item);
const lastEvent = (th) => DB.raw.prepare("SELECT body, meta_json FROM sp_msgs WHERE thread_id=? AND kind='event' ORDER BY id DESC LIMIT 1").get(th);
const S = {};

test("قفل‌ها: 🔒/🔓ِ نرمال‌سازی روی خطِ تأمین‌کننده؛ تأمین‌کنندهٔ دوم عینِ همان را می‌گیرد", { skip: SKIP }, async () => {
  const r = await call("/sp/x/send", { headers: EX, body: { assignment_id: 1, item_ids: [11, 12], supplier_name: "آهن‌آلات الف", phone: "09121110001", label: "فروش", text: "سلام" } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  S.th = r.data.thread_id;
  assert.deepEqual(JSON.parse(lineOf(S.th, 11).locks_json), { title: false, qty: false, layers: { "اندازه": true, "جنس": false } });
  assert.deepEqual(JSON.parse(lineOf(S.th, 12).locks_json), { title: true, qty: true, layers: { "اندازه": true } }, "پیش‌فرض همه 🔒");
  /* ساختارِ قلم بعداً عوض شود هم، تأمین‌کنندهٔ دوم عکسِ اولین خط را می‌گیرد (itemLocks) */
  DB.raw.prepare("UPDATE items SET norm_json=? WHERE id=11").run(norm("پیچ", { "اندازه": "M8", "جنس": "فولاد" }, {}));
  const r2 = await call("/sp/x/send", { headers: EX, body: { assignment_id: 1, item_ids: [11, 12], supplier_name: "فولاد ب", phone: "09121110002", label: "فروش" } });
  assert.equal(r2.status, 200, JSON.stringify(r2.data));
  S.th2 = r2.data.thread_id;
  assert.deepEqual(JSON.parse(lineOf(S.th2, 11).locks_json), { title: false, qty: false, layers: { "اندازه": true, "جنس": false } });
  S.sess = await newSession(env, r.data.phone.id, "web");
  S.sess2 = await newSession(env, r2.data.phone.id, "web");
  const th = (await call(`/sp/thread/${S.th}`, { headers: { "X-SP-Session": S.sess } })).data;
  const l = th.lines.find((x) => x.item_id === 11);
  assert.deepEqual(l.locks, { title: false, qty: false, unit: true, legacy: false });
  assert.deepEqual(l.layers.map((x) => [x.k, x.lock]), [["اندازه", true], ["جنس", false]]);
  assert.equal(th.pf_read, false, "پیش‌فرضِ فاز ۴: خوانش هوشمند خاموش");
  const me = (await call("/sp/me", { headers: { "X-SP-Session": S.sess } })).data;
  assert.deepEqual([me.term_required, me.pf_read], [["dtime", "pay", "invoice", "vat", "valid_days"], false]);
  /* خطِ پیش از فاز ۴ (بی locks_json): عنوان و لایه‌ها 🔒، مقدار و واحد آزاد — همان رفتارِ پیشین */
  assert.deepEqual(locksOfLine({ layers_json: JSON.stringify([{ k: "اندازه", v: "M8" }]), req_unit: "عدد" }),
    { legacy: true, title: true, qty: false, unit: false, layers: { "اندازه": true } });
});

test("فرم تأمین‌کننده: مقدار 🔒 کلِ مقدار و 🔓 کمتر، واحد ثابت، عنوان و لایهٔ 🔓، لایهٔ کمّی با واحد", { skip: SKIP }, async () => {
  const H = { "X-SP-Session": S.sess };
  S.l11 = lineOf(S.th, 11).id; S.l12 = lineOf(S.th, 12).id;
  const put = (id, body) => call(`/sp/line/${id}`, { method: "PUT", headers: H, body });
  /* مقدارِ 🔓: بیشتر از صفر و حداکثر همان مقدارِ درخواست */
  let r = await put(S.l11, { qty: 120 });
  assert.equal(r.status, 422);
  assert.equal(r.data.field, "qty");
  assert.match(r.data.error, /حداکثر ۱۰۰ عدد/);
  assert.equal((await put(S.l11, { qty: 0 })).status, 422);
  assert.equal((await put(S.l11, { qty: "۶۰" })).status, 200, "کمتر از درخواست پذیرفته است");
  /* مقدارِ 🔒: کلِ همان مقدار */
  r = await put(S.l12, { qty: 40 });
  assert.equal(r.status, 422);
  assert.match(r.data.error, /مقدارِ این قلم 🔒 است/);
  assert.equal((await put(S.l12, { qty: 50 })).status, 200);
  /* واحد همان واحدِ درخواست است */
  r = await put(S.l12, { unit: "کیلوگرم" });
  assert.equal(r.status, 422);
  assert.equal(r.data.field, "unit");
  /* عنوان: 🔓 در قلم اول، 🔒 در قلم دوم */
  r = await put(S.l11, { title: "پیچ آلن M8 استیل" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.line.s_title, "پیچ آلن M8 استیل");
  assert.equal(r.data.line.title, "پیچ آلن M8 فولادی", "عنوانِ درخواست سرِ جایش");
  assert.equal((await put(S.l12, { title: "مهرهٔ دیگر" })).status, 422);
  /* لایه‌ها: 🔒 عوض نمی‌شود، 🔓 سرِ جای خودش؛ همان مقدارِ درخواست یعنی بی تغییر */
  r = await put(S.l11, { layers: { "اندازه": "M10" } });
  assert.equal(r.status, 422);
  assert.match(r.data.error, /«اندازه» لایهٔ قفل‌شدهٔ کارشناس/);
  assert.equal((await put(S.l11, { layers: { "رنگ": "مشکی" } })).status, 422, "لایهٔ تازه با «➕ لایهٔ تازه»، نه این‌جا");
  r = await put(S.l11, { layers: { "جنس": "استیل" } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.line.layers.map((x) => [x.k, x.v, x.s || null]), [["اندازه", "M8", null], ["جنس", "فولاد", "استیل"]]);
  assert.equal((await put(S.l11, { layers: { "اندازه": "M8" } })).status, 200, "همان مقدارِ 🔒 بی‌خطر است");
  /* لایهٔ افزوده: نامِ لایه‌های همین بسته نه؛ لایهٔ کمّی عدد است و واحد دارد */
  r = await put(S.l11, { extra: [{ k: "اندازه", v: "M10" }] });
  assert.equal(r.status, 422);
  assert.match(r.data.error, /قفل‌شده/);
  r = await put(S.l11, { extra: [{ k: "جنس", v: "استیل" }] });
  assert.equal(r.status, 422);
  assert.match(r.data.error, /سرِ جای خودش/);
  assert.equal((await put(S.l11, { extra: [{ k: "وزن", v: "زیاد", t: "num", u: "کیلوگرم" }] })).status, 422, "لایهٔ کمّی عدد می‌خواهد");
  r = await put(S.l11, { price: "12,500", note: "تحویل از انبار تهران", extra: [{ k: "برند", v: "البرز" }, { k: "وزن", v: "۵", t: "num", u: "کیلوگرم" }] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.line.extra, [{ k: "برند", v: "البرز" }, { k: "وزن", v: "5", t: "num", u: "کیلوگرم" }]);
  assert.equal(r.data.line.total, 60 * 12500);
  assert.equal((await put(S.l12, { price: 3000 })).status, 200);
});

test("شرایط و پیش‌نمایش: اعتبار پیش‌فاکتور اجباری، تاریخ تحویل از تقویم، خانه‌های لازمِ خالی", { skip: SKIP }, async () => {
  const H = { "X-SP-Session": S.sess };
  const terms = (body) => call(`/sp/thread/${S.th}/terms`, { headers: H, body });
  let r = await terms({ valid_days: "۰" });
  assert.equal(r.status, 422);
  assert.match(r.data.error, /دست‌کم ۱/);
  r = await terms({ dtime: "1405/07/31" });
  assert.equal(r.status, 422);
  assert.match(r.data.error, /در تقویم نیست/, "مهر سی روز است");
  r = await terms({ dtime: "۱۴۰۵/۸/۱", pay: "نقدی" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.terms.dtime, "1405/08/01", "تاریخ یکدست با دو رقم");
  /* پیش‌نمایش پیش از کامل شدن: خانه‌های لازمِ خالی قرمز */
  const pv = await call(`/sp/thread/${S.th}/preview`, { headers: H, body: {} });
  assert.equal(pv.status, 200, JSON.stringify(pv.data));
  assert.equal(pv.data.ready, false);
  assert.deepEqual(pv.data.missing, ["invoice", "vat", "valid_days"]);
  assert.match(pv.data.html, /pf-miss/);
  assert.match(pv.data.html, /آهن‌آلات الف/);
  assert.match(pv.data.html, /پیچ آلن M۸ استیل/, "عنوانِ 🔓ِ پیشنهادیِ تأمین‌کننده (رقم فارسی، مثل Word)");
  assert.ok(pv.data.css.length > 100);
  assert.deepEqual(pv.data.line_ids, [S.l11, S.l12], "بی «آمادهٔ ارسال»: همهٔ قلم‌های قابل ویرایش");
  r = await terms({ invoice: "رسمی", vat: "دارد", valid_days: "۷" });
  assert.deepEqual(r.data.missing, []);
  const one = await call(`/sp/thread/${S.th}/preview`, { headers: H, body: { line_ids: [S.l12] } });
  assert.deepEqual([one.data.ready, one.data.line_ids], [true, [S.l12]]);
  assert.doesNotMatch(one.data.html, /pf-miss/);
  /* همان پیش‌نمایش به‌شکل Word، پیش از ارسال */
  const w = await call(`/sp/thread/${S.th}/preview?format=docx`, { headers: H, body: { line_ids: [S.l12] } });
  assert.equal(w.status, 200);
  assert.match(w.type, /wordprocessingml/);
  assert.match(await docXml(w.buf), /مهره/);
});

test("ارسال ← «تأیید» همان تأیید نهایی با مقدارهای خودِ تأمین‌کننده و Word تولیدی در پیش‌فاکتورها", { skip: SKIP }, async () => {
  const H = { "X-SP-Session": S.sess };
  for (const id of [S.l11, S.l12]) assert.equal((await call(`/sp/line/${id}/ready`, { headers: H, body: { on: true } })).status, 200);
  const sub = await call(`/sp/thread/${S.th}/submit`, { headers: H, body: {} });
  assert.equal(sub.status, 200, JSON.stringify(sub.data));
  assert.equal(sub.data.state, "pending");
  S.b = sub.data.bundle_id;
  const ev = lastEvent(S.th);
  assert.match(ev.body, /^📤 پیشنهادِ ۲ قلم با پیش‌فاکتورِ سامانه برای بررسی فرستاده شد:/);
  assert.equal(JSON.parse(ev.meta_json).gen, true, "کارتِ پیام دکمهٔ «👁 پیش‌فاکتور» می‌گیرد");
  /* پیش‌فاکتورِ همین بسته: HTML برای دیدن و چاپ به PDF، و Word — هر دو طرف */
  const html = await call(`/sp/bundle/${S.b}/proforma`, { headers: H });
  assert.equal(html.status, 200);
  assert.match(html.data.html, /۷۵۰,۰۰۰/, "۶۰ × ۱۲٬۵۰۰");
  assert.match(html.data.name, /آهن‌آلات الف — درخواست R-4/);
  const doc = await call(`/sp/bundle/${S.b}/proforma?format=docx`, { headers: EX });
  assert.equal(doc.status, 200);
  assert.match(doc.type, /wordprocessingml/);
  assert.match(await docXml(doc.buf), /آهن‌آلات الف/);
  /* کارشناس: «آماده برای تأیید نهایی» از خودِ مقدارها، بی جدول تطابق */
  const xb = (await call(`/sp/thread/${S.th}`, { headers: EX })).data;
  assert.equal(xb.pf_read, false);
  const b = xb.bundles.find((x) => x.id === S.b);
  assert.deepEqual([b.state, b.ready, b.problems, b.gen], ["pending", true, [], true]);
  const n = calls.length;
  const fin = await call(`/sp/x/bundle/${S.b}/decide`, { headers: EX, body: { action: "approve" } });
  assert.equal(fin.status, 200, JSON.stringify(fin.data));
  assert.equal(fin.data.state, "final", "مرحلهٔ «تأیید و درخواست پیش‌فاکتور» نیست (تصمیم ۱۳)");
  assert.equal(fin.data.quote_ids.length, 2);
  assert.equal(fin.data.gen, true, "صفحهٔ مکاتبات می‌داند Word تولیدی نشست");
  const q = (item) => DB.raw.prepare("SELECT * FROM quotes WHERE assignment_id=1 AND item_id=? AND supplier_name='آهن‌آلات الف'").get(item);
  const q11 = q(11), q12 = q(12);
  assert.deepEqual([q11.qty, q11.unit, q11.price, q11.dtime, q11.pay, q11.invoice, q11.vat, q11.valid_days, q11.saved, q11.final, q11.origin],
    [60, "عدد", 12500, "1405/08/01", "نقدی", "رسمی", "دارد", "7", 1, 1, "supplier"]);
  assert.equal(q11.spec, "نوع قلم: پیچ، عنوان پیشنهادی: پیچ آلن M8 استیل، اندازه: M8، جنس: استیل، برند: البرز، وزن: 5 کیلوگرم، توضیح تأمین‌کننده: تحویل از انبار تهران",
    "عنوان و لایهٔ 🔓 با مقدارِ تأمین‌کننده، لایه‌های افزوده با واحد و توضیحِ زیرِ قلم");
  assert.deepEqual([q12.qty, q12.price, q12.spec], [50, 3000, "نوع قلم: مهره، اندازه: M8"]);
  const p = DB.raw.prepare("SELECT * FROM proformas WHERE assignment_id=1 AND supplier_name='آهن‌آلات الف'").get();
  assert.equal(p.source, "generated");
  assert.equal(p.filename, "پیش‌فاکتور آهن‌آلات الف — درخواست R-4.docx");
  assert.match(p.storage_key, new RegExp(`sp-gen-${S.b}`));
  assert.deepEqual(JSON.parse(p.item_ids), [11, 12]);
  assert.ok(since(n).some((c) => c.bot === "store" && c.method === "POST" && c.url.includes(`sp-gen-${S.b}`)), "Word در انبار");
  assert.match(lastEvent(S.th).body, /^🏁 تأیید نهایی شد — ممنون از همکاری‌تان؛ پیشنهادتان ثبت شد/);
  const sup = (await call(`/sp/thread/${S.th}`, { headers: H })).data;
  assert.deepEqual(sup.lines.map((l) => l.state), ["final", "final"]);
});

test("پیش‌فاکتورِ خودِ تأمین‌کننده فقط پیوست است، پیش‌فاکتورِ کارشناس دست نمی‌خورد و خوانش هوشمند خاموش است", { skip: SKIP }, async () => {
  const H = { "X-SP-Session": S.sess2 };
  const l11 = lineOf(S.th2, 11).id, l12 = lineOf(S.th2, 12).id;
  await call(`/sp/thread/${S.th2}/terms`, { headers: H, body: { dtime: "10", pay: "نقدی", invoice: "رسمی", vat: "دارد", valid_days: 5 } });
  await call(`/sp/line/${l11}`, { method: "PUT", headers: H, body: { price: 11000 } });
  await call(`/sp/line/${l12}`, { method: "PUT", headers: H, body: { price: 2800 } });
  for (const id of [l11, l12]) assert.equal((await call(`/sp/line/${id}/ready`, { headers: H, body: { on: true } })).status, 200);
  /* ارسال همراه با پیش‌فاکتورِ خودش: بسته «در انتظار بررسی» می‌ماند، نه «پیش‌فاکتور رسید» */
  const sub = await call(`/sp/thread/${S.th2}/submit-pf?ids=${l11}&filename=own.pdf`, { headers: { ...H, "Content-Type": "application/pdf" }, raw: "PDF" });
  assert.equal(sub.status, 200, JSON.stringify(sub.data));
  assert.equal(sub.data.state, "pending");
  const b1 = sub.data.bundle_id;
  assert.equal(lineOf(S.th2, 11).state, "submitted");
  assert.match(lastEvent(S.th2).body, /\(پیوست: پیش‌فاکتورِ خودِ تأمین‌کننده «own\.pdf»\)/);
  /* پیوستِ تازه روی بستهٔ باز: فقط پیوست عوض می‌شود */
  const att = await call(`/sp/bundle/${b1}/proforma?filename=own2.pdf`, { headers: { ...H, "Content-Type": "application/pdf" }, raw: "PDF2" });
  assert.equal(att.status, 200, JSON.stringify(att.data));
  assert.deepEqual(Object.values(DB.raw.prepare("SELECT state, pf_name FROM sp_bundles WHERE id=?").get(b1)), ["pending", "own2.pdf"]);
  assert.match(lastEvent(S.th2).body, /^📎 پیش‌فاکتورِ خودِ تأمین‌کننده «own2\.pdf» عوض شد/);
  const ai = await call(`/sp/x/bundle/${b1}/ai`, { headers: EX, body: { confirm: true } });
  assert.equal(ai.status, 409);
  assert.match(ai.data.error, /خاموش است/);
  /* برگشت با توضیح ← دوباره آماده ← ارسالِ هر دو قلم */
  const ret = await call(`/sp/x/bundle/${b1}/decide`, { headers: EX, body: { action: "return", comment: "قیمت را با حمل بنویسید." } });
  assert.equal(ret.data.state, "returned");
  assert.equal((await call(`/sp/line/${l11}/ready`, { headers: H, body: { on: true } })).status, 200);
  const sub2 = await call(`/sp/thread/${S.th2}/submit`, { headers: H, body: {} });
  const b2 = sub2.data.bundle_id;
  assert.equal((await call(`/sp/bundle/${b2}/proforma?filename=own3.pdf`, { headers: { ...H, "Content-Type": "application/pdf" }, raw: "PDF3" })).status, 200);
  /* پیش‌فاکتوری که کارشناس خودش برای همین تأمین‌کننده بارگذاری کرده (تب استعلامات) */
  DB.raw.prepare("INSERT INTO proformas (assignment_id,supplier_name,filename,storage_key,mime,source,uploaded_at) VALUES (1,'فولاد ب','expert.pdf','1/expert.pdf','application/pdf','panel',?)").run(Date.now());
  const n = calls.length;
  const fin = await call(`/sp/x/bundle/${b2}/decide`, { headers: EX, body: { action: "final" } });
  assert.equal(fin.status, 200, JSON.stringify(fin.data));
  assert.equal(fin.data.gen, false);
  const p = DB.raw.prepare("SELECT * FROM proformas WHERE assignment_id=1 AND supplier_name='فولاد ب'").get();
  assert.deepEqual([p.source, p.filename, p.storage_key], ["panel", "expert.pdf", "1/expert.pdf"], "نه Word تولیدی جایش می‌نشیند، نه پیوستِ تأمین‌کننده");
  assert.ok(!since(n).some((c) => c.bot === "store" && c.method === "POST"), "Word تازه ساخته نشد");
  assert.deepEqual([...new Set(DB.raw.prepare("SELECT final FROM quotes WHERE assignment_id=1 AND supplier_name='فولاد ب'").all().map((x) => x.final))], [1]);
});

test("کارشناس هوشمند بی خوانش پیش‌فاکتور: دعوتِ تازه، و بستهٔ pending یکراست تأیید نهایی با پیش‌فاکتورِ تولیدی", { skip: SKIP }, async () => {
  const ho = await call("/assignments/2/handoff", { headers: EXAI, body: {} });
  assert.equal(ho.status, 200, JSON.stringify(ho.data));
  const run = DB.raw.prepare("SELECT id FROM ai_runs WHERE assignment_id=2").get().id;
  const state = () => DB.raw.prepare("SELECT state FROM ai_runs WHERE id=?").get(run).state;
  for (let i = 0; i < 6 && state() !== "work"; i++) await aiTick(env);
  assert.equal(state(), "work");
  const add = await call(`/support/ai/2/runs/${run}/supplier`, { headers: SUP, body: { supplier_name: "روانکار ج", phone: "09121110003", label: "شمارهٔ من" } });
  assert.equal(add.status, 200, JSON.stringify(add.data));
  let n = calls.length;
  const r = await aiTick(env);
  assert.equal(r.step, "invite", JSON.stringify(r));
  const sms = since(n).find((c) => c.bot === "sms");
  assert.ok(sms, "پیامکِ دعوت");
  const thId = DB.raw.prepare("SELECT thread_id FROM ai_threads WHERE run_id=?").get(run).thread_id;
  assert.match(DB.raw.prepare("SELECT body FROM sp_msgs WHERE thread_id=? ORDER BY id LIMIT 1").get(thId).body, /پیش‌نمایش پیش‌فاکتور رو ببینید و «ارسال» رو بزنید/, "دعوتِ فاز ۴");
  const login = await call("/sp/login", { body: { k: /#k=([0-9a-f]{12})/.exec(sms.body.message)[1], password: /رمز ورود: (\d{6})/.exec(sms.body.message)[1] } });
  const H = { "X-SP-Session": login.data.session };
  const line = (await call(`/sp/thread/${thId}`, { headers: H })).data.lines[0];
  await call(`/sp/thread/${thId}/terms`, { headers: H, body: { dtime: "1405/08/20", pay: "نقدی", invoice: "رسمی", vat: "دارد", valid_days: 7 } });
  const saved = await call(`/sp/line/${line.id}`, { method: "PUT", headers: H, body: { qty: 150, price: 1250000, note: "بقیه تا دو هفته بعد" } });
  assert.equal(saved.status, 200, "مقدارِ 🔓: کمتر از درخواست");
  await call(`/sp/line/${line.id}/ready`, { headers: H, body: { on: true } });
  n = calls.length;
  const sub = await call(`/sp/thread/${thId}/submit`, { headers: H, body: {} });
  assert.equal(sub.status, 200, JSON.stringify(sub.data));
  assert.equal(since(n).filter((c) => c.bot === "ai").length, 0, "گامِ فوری تصمیمِ بسته را به Cron می‌سپارد");
  let seen = null;
  model = (b) => {
    seen = b;
    const bid = Number(/بستهٔ (\d+) — وضعیت: pending/.exec(b.messages[0].content[0].text)[1]);
    return jsonOut({ reply: "", actions: [{ type: "final", bundle_id: bid, comment: "", rows: [] }], thread_status: "done", memo: "تمام.", note: "کامل و منطبق؛ مقدارِ کمتر پذیرفتنی است.", ask_expert: "" });
  };
  const t = await aiTick(env);
  assert.equal(t.step, "turn", JSON.stringify(t));
  assert.match(seen.system[0].text, /پیش‌فاکتورِ جدا خواسته یا خوانده نمی‌شود/, "پرامپتِ مسیرِ خاموش");
  const ctxText = seen.messages[0].content[0].text;
  assert.match(ctxText, /عنوان: 🔒/);
  assert.match(ctxText, /لایه‌ها: 🔒 جنس = نسوز/);
  assert.match(ctxText, /\(مقدار 🔓: کمتر هم پذیرفتنی است\)/);
  assert.match(ctxText, /توضیحِ تأمین‌کننده زیرِ همین قلم: بقیه تا دو هفته بعد/);
  assert.match(ctxText, /تأیید نهایی ممکن است؟ بله/);
  assert.match(ctxText, /کارهای ممکن: final، return، reject/);
  assert.equal(DB.raw.prepare("SELECT state FROM sp_bundles WHERE id=?").get(sub.data.bundle_id).state, "final");
  const q = DB.raw.prepare("SELECT * FROM quotes WHERE assignment_id=2 AND supplier_name='روانکار ج'").get();
  assert.deepEqual([q.qty, q.price, q.saved, q.final], [150, 1250000, 1, 1]);
  assert.match(q.spec, /توضیح تأمین‌کننده: بقیه تا دو هفته بعد/);
  assert.equal(DB.raw.prepare("SELECT source FROM proformas WHERE assignment_id=2 AND supplier_name='روانکار ج'").get().source, "generated");
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM ai_calls WHERE purpose='proforma'").get().n, 0, "هیچ سندی خوانده نشد");
  assert.equal(DB.raw.prepare("SELECT state FROM ai_threads WHERE thread_id=?").get(thId).state, "final");
  assert.match(lastEvent(thId).body, /^🏁 تأیید نهایی شد — ممنون از همکاری‌تان/);
});

test("کلیدِ «خوانش هوشمند پیش‌فاکتور» در پنل پشتیبانی: پیش‌فرض خاموش، روشن و خاموش با رخداد", { skip: SKIP }, async () => {
  assert.equal((await call("/support/ai/switches")).status, 401, "فقط پشتیبانی");
  const g = await call("/support/ai/switches", { headers: SUP });
  assert.equal(g.status, 200, JSON.stringify(g.data));
  assert.equal(g.data.pfRead, false);
  assert.match(g.data.fa.pfRead, /خوانش هوشمند پیش‌فاکتور/);
  const on = await call("/support/ai/switches", { method: "PUT", headers: SUP, body: { pfRead: true } });
  assert.equal(on.data.pfRead, true);
  assert.equal((await call("/support/ai/switches", { headers: SUP })).data.pfRead, true);
  assert.equal((await call("/sp/me", { headers: { "X-SP-Session": S.sess } })).data.pf_read, true, "صفحه‌ها همان لحظه می‌فهمند");
  assert.ok(DB.raw.prepare("SELECT 1 AS x FROM events WHERE kind='ai_switches'").get(), "رخداد برای گزارشِ پشتیبانی");
  assert.equal((await call("/support/ai/switches", { method: "PUT", headers: SUP, body: { pfRead: false } })).data.pfRead, false);
  assert.equal((await call("/sp/me", { headers: { "X-SP-Session": S.sess } })).data.pf_read, false);
});
