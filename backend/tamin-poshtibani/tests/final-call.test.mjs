/* ============================================================
   «📨 فراخوانِ پیش‌فاکتورِ رسمی» و «📦 بستهٔ کمیسیون» (درخواست مالک، ۲۷ مهر ۱۴۰۵) — worker/final-call.js

   روی SQLite واقعی، با تلگرام، انبار، پیامک و مدلِ بدلی:
   کارِ دستی: حداقلِ استعلام پر ← جدول کمیسیون ۴۰۹ تا فراخوان ← «📨 فراخوان» (لحظهٔ تصمیم، پیامک با شمارهٔ پیشنهاد و کمترین
   قیمت، هشدارِ «شماره ندارم» به کارشناس) ← پیش‌فاکتورِ رسمی: قیمتِ تازه «جایگزین شود؟» و ثبت (قیمت قفل)، اعتبارِ کم «پذیرفته
   نیست» ← شمارهٔ تازه از کارشناس ← سرِ مهلت «📦 بستهٔ کمیسیون» و جدول با نامِ سبز.
   «📤 ارسال» با «پیش‌فاکتورِ رسمی 🔒»؛ کارشناس هوشمند: فراخوان در گامِ پایانی و بستن سرِ مهلت؛ پنل پشتیبانی.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";

import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import { aiTick } from "../../../worker/ai-agent.js";
import { handleSpUpdate } from "../../../worker/sp-bot.js";
import * as SP from "../../../worker/sp-core.js";
import { validTo, verdictOf, callSmsText, resetFcCache, finalCallTick } from "../../../worker/final-call.js";
import { bundleData } from "../../../worker/bundle.js";
import { commissionSheet } from "../../../worker/sheets.js";
import { jStr, jStr2ms, DAY, HOUR } from "../../../worker/time.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = {
  DB, MANAGER_CODE: "1234", TG_BOT_TOKEN: "tok", TG_SP_BOT_TOKEN: "sptok", TG_WEBHOOK_SECRET: "sec", TG_API_BASE: "https://tg.test/bot", TG_FILE_API_BASE: "https://tgfile.test/bot",
  SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_KEY: "svc", ANTHROPIC_API_KEY: "k", ANTHROPIC_API_BASE: "https://ai.test", SITE_ORIGIN: "https://site.test",
  TEXTBEE_API_KEY: "tbk", TEXTBEE_API_BASE: "https://sms.test",
};
const HU = { "X-Expert-Code": "7002" }, AI = { "X-Expert-Code": "7001" };
const norm = (head) => JSON.stringify({ v: 2, head, layers: {}, source: "catalog" });

if (DB) {
  await ensureSchema(env);
  const t = Date.now();
  DB.raw.exec("DELETE FROM experts");
  DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,telegram_chat,created_at) VALUES (1,'هوشمند','هوشمند','7001',1,1,'701',?), (2,'انسانی','انسانی','7002',1,1,'702',?)").run(t, t);
  DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES ('R-F','1405/07/27','پروژهٔ برق'), ('R-L','1405/07/27','پروژهٔ قفل'), ('R-A','1405/07/27','پروژهٔ هوشمند')").run();
  DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,deadline_at,created_at) VALUES (1,'R-F',2,5,?,?,?), (2,'R-L',2,5,?,?,?), (3,'R-A',1,5,?,?,?)")
    .run(t, t + 9e8, t, t, t + 9e8, t, t, t + 9e8, t);
  const ins = DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,title,qty,unit,state,assignment_id,norm_json) VALUES (?,?,?,?,?,?,?,'open',?,?)");
  ins.run(11, "R-F", "a", 1, "کابل ۴ در ۲٫۵", 10, "متر", 1, norm("کابل"));
  ins.run(21, "R-L", "a", 1, "فیوز مینیاتوری", 5, "عدد", 2, norm("فیوز"));
  ins.run(31, "R-A", "a", 1, "پیچ M8", 20, "عدد", 3, norm("پیچ"));
}

/* ---------- دنیای بیرونِ بدلی ---------- */
const calls = [];
let model = () => { throw new Error("پاسخِ مدل برای این گام تعریف نشده"); };
const R = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.startsWith("https://tg.test/bot")) {
    const rest = u.slice("https://tg.test/bot".length), token = rest.split("/")[0], method = rest.split("/").pop();
    calls.push({ bot: token === "sptok" ? "sp" : "main", method, body: typeof init.body === "string" ? JSON.parse(init.body) : {} });
    if (method === "getMe") return R({ ok: true, result: { id: 77, username: token === "sptok" ? "AriaSupplierBot" : "ArianaSupplyBot" } });
    if (method === "getFile") return R({ ok: true, result: { file_path: "documents/rasmi.pdf" } });
    return R({ ok: true, result: method === "sendMessage" ? { message_id: calls.length } : true });
  }
  if (u.startsWith("https://tgfile.test/")) return new Response("PDFDATA");
  if (u.startsWith("https://sb.test/storage/v1/object/sign/")) return R({ signedURL: "/object/sign/proformas/x?token=abc" });
  if (u.startsWith("https://sb.test/")) { calls.push({ bot: "store", method: init.method || "GET", url: u }); return (init.method || "GET") === "GET" ? new Response("nf", { status: 404 }) : R({ Key: "x" }); }
  if (u.startsWith("https://ai.test/")) { const b = JSON.parse(init.body); calls.push({ bot: "ai", body: b }); return R(model(b)); }
  if (u.startsWith("https://sms.test/")) { const b = JSON.parse(init.body); calls.push({ bot: "sms", body: b }); return R({ data: { success: true, smsBatchId: `b${calls.length}` } }); }
  throw new Error(`fetch بیرونیِ پیش‌بینی‌نشده: ${u}`);
};
const pend = [];
const ctx = { waitUntil: (p) => pend.push(p) };
async function call(path, { method, body, headers, raw, type } = {}) {
  const h = { ...(headers || {}) };
  let b;
  if (raw !== undefined) { b = raw; h["Content-Type"] = type || "application/pdf"; h["Content-Length"] = String(raw.length); }
  else if (body !== undefined) { b = JSON.stringify(body); h["Content-Type"] = "application/json"; }
  const res = await route(new Request(`https://site.test/tamin-poshtibani/api${path}`, { method: method || (b !== undefined ? "POST" : "GET"), headers: h, body: b }), env, ctx);
  while (pend.length) await Promise.all(pend.splice(0));
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch (_) { data = text; }
  return { status: res.status, data };
}
async function supplierSession(phone) {
  const p = DB.raw.prepare("SELECT id FROM sp_phones WHERE phone=?").get(phone);
  return { "X-SP-Session": await SP.newSession(env, p.id, "web") };
}
const threadOf = (aid, name) => DB.raw.prepare("SELECT t.id FROM sp_threads t JOIN sp_suppliers s ON s.id=t.supplier_id WHERE t.assignment_id=? AND s.name=?").get(aid, name).id;
const PDF = new Uint8Array([37, 80, 68, 70, 45, 49]);
/** خروجیِ ابزارِ record_check: یک قلم، شرایط همان، و مشخصاتِ سند (صدور، اعتبار، مهر) */
const checkOut = (o = {}) => ({
  model: "claude-haiku-4-5", stop_reason: "tool_use", usage: { input_tokens: 900, output_tokens: 300 },
  content: [{ type: "tool_use", id: "t1", name: "record_check", input: {
    readable: true, currency: "ریال", vat_included: false,
    delivery: { value: o.dtime || "10", same: true, sure: true }, pay: { value: "نقدی", same: true, sure: true },
    invoice: { value: "رسمی", same: true, sure: true }, vat: { value: "دارد", same: true, sure: true },
    valid_days: { value: o.days ?? null, sure: true }, valid_hours: { value: o.hours ?? null, sure: true },
    issue_date: { value: o.issue ?? jStr(Date.now()), sure: true }, valid_until: { value: null, sure: true },
    stamped: { value: o.stamped ?? true, sure: true }, seller: o.seller || null,
    lines: [{ key: "L1", found: true, doc_title: "کابل", qty: { value: o.qty ?? 10, sure: true }, unit: { value: o.unit || "متر", same: true, sure: true },
      unit_price: { value: o.price, sure: true }, layers: [] }],
  } }],
});
const S = {};

test("قاعده (بی پایگاه داده): «معتبر تا» از سند، حکمِ 🔒/🔓 و متنِ پیامک", () => {
  const at = jStr2ms("1405/07/27") + 10 * HOUR;
  assert.equal(validTo({ until: "1405/07/30" }, at), jStr2ms("1405/07/30") + DAY - 1, "تا تاریخِ معین: پایانِ همان روز");
  assert.equal(validTo({ issue: "1405/07/27", days: 3 }, at), jStr2ms("1405/07/27") + 3 * DAY);
  assert.equal(validTo({ issue: "1405/07/27", hours: 48 }, at), at + 48 * HOUR, "صدورِ امروز و اعتبارِ ساعتی: از لحظهٔ رسیدن");
  assert.equal(validTo({ issue: "1405/07/20", hours: 48 }, at), jStr2ms("1405/07/20") + 48 * HOUR);
  assert.equal(validTo({ days: 2 }, at), at + 2 * DAY, "صدورِ نامعلوم: از لحظهٔ رسیدن");
  assert.equal(validTo({ issue: "1405/07/27" }, at), null, "اعتبار ننوشته");
  /* حکم: لایهٔ 🔒 مانع، قیمتِ برابرِ قیمتِ اعتباری «همان»، شرطِ 🔒ِ شرکت مانع، اعتبارِ کم و بی مهر مانع */
  const line = { id: 5, item_id: 9, layers_json: JSON.stringify([{ k: "جنس", v: "مس" }, { k: "رنگ", v: "قرمز" }]), locks_json: JSON.stringify({ title: true, qty: true, layers: { "رنگ": false } }),
    req_unit: "متر", prices_json: JSON.stringify({ cash: 100, c1: 103 }) };
  const ai = { readable: true, doc: { issue: "1405/07/27", days: 1, stamped: false, stamped_sure: true },
    lines: [{ line_id: 5, item_id: 9, title: "کابل", found: true, rows: [
      { key: "L:جنس", kind: "layer", label: "جنس", want: "مس", got: "آلومینیوم", val: "آلومینیوم", status: "bad", gate: true },
      { key: "L:رنگ", kind: "layer", label: "رنگ", want: "قرمز", got: "آبی", val: "آبی", status: "bad", gate: true },
      { key: "price", kind: "field", label: "قیمت واحد", want: 100, got: 103, val: 103, status: "bad", gate: true },
    ] }],
    header: [{ key: "pay", kind: "terms", label: "شرایط تسویه", want: "نقدی", got: "اعتباری", val: "اعتباری", status: "bad", gate: true }] };
  const lim = new Map([[9, { pay: { opts: ["نقدی"], lock: true } }]]);
  const v = verdictOf(ai, { lines: [line], lim, needUntil: jStr2ms("1405/07/29"), at });
  assert.deepEqual(v.block.map((x) => x.key).sort(), ["5|L:جنس", "h|pay", "stamp", "valid"].sort());
  assert.deepEqual(v.ask.map((x) => x.key), ["5|L:رنگ"], "لایهٔ 🔓 می‌پرسد");
  assert.match(v.info.map((x) => x.msg).join(" "), /همان قیمت اعتباری ۱ ماهه/);
  const txt = callSmsText({ company: "تونل سد آریانا", offer_no: "R-F-2", deadline_at: at + DAY, min_valid_h: 24, lowest: [{ title: "کابل", price: 450000, own: false }], sendLowest: true });
  assert.match(txt, /پیشنهاد شما با شمارهٔ R-F-۲ وارد کمیسیون معاملات شرکت تونل سد آریانا می‌شود؛ تا .* فرصت دارید پیش‌فاکتور رسمی با حداقل ۲۴ ساعت اعتبار ارسال کنید/);
  assert.match(txt, /کمترین قیمتِ رسیده: «کابل» ۴۵۰٬۰۰۰ ریال؛ می‌توانید قیمت نهایی‌تان را اعلام کنید/);
  assert.doesNotMatch(callSmsText({ company: "x", offer_no: "1", deadline_at: at, min_valid_h: 24, lowest: [{ title: "a", price: 1 }], sendLowest: false }), /کمترین/);
});

test("کارِ دستی: حداقلِ استعلام ← جدول ۴۰۹ ← «📨 فراخوان»: پیامک با شمارهٔ پیشنهاد و کمترین قیمت، «شماره ندارم» برای کارشناس", { skip: SKIP }, async () => {
  /* دو تأمین‌کنندهٔ پنل و یک تأمین‌کنندهٔ دستی (بی شماره) — هر سه تأیید نهایی */
  for (const [name, phone, price] of [["تأمین برق", "09120000601", 450000], ["برق دوم", "09120000602", 470000]]) {
    assert.equal((await call("/sp/x/send", { headers: HU, body: { assignment_id: 1, item_ids: [11], supplier_name: name, phone, label: "فروش" } })).status, 200);
    const th = threadOf(1, name), H = await supplierSession(phone);
    assert.equal((await call(`/sp/thread/${th}/terms`, { headers: H, body: { pay: "نقدی", vat: "دارد", invoice: "رسمی", dtime: "10", valid_days: 5 } })).status, 200);
    const d = (await call(`/sp/thread/${th}`, { headers: H })).data;
    assert.equal((await call(`/sp/line/${d.lines[0].id}`, { method: "PUT", headers: H, body: { qty: 10, price } })).status, 200);
    assert.equal((await call(`/sp/line/${d.lines[0].id}/ready`, { headers: H, body: { on: true } })).status, 200);
    const sub = await call(`/sp/thread/${th}/submit`, { headers: H, body: {} });
    assert.equal(sub.status, 200, JSON.stringify(sub.data));
    assert.equal((await call(`/sp/x/bundle/${sub.data.bundle_id}/decide`, { headers: HU, body: { action: "final" } })).status, 200);
  }
  const q3 = await call("/quotes", { headers: HU, body: { assignment_id: 1, item_id: 11, supplier_name: "فروشگاه تلفنی", unit: "متر", qty: 10, price: 430000, dtime: "7", pay: "نقدی", invoice: "رسمی", vat: "دارد", save: true } });
  assert.equal(q3.status, 200, JSON.stringify(q3.data));
  DB.raw.prepare("UPDATE quotes SET saved=1, final=1, final_at=? WHERE assignment_id=1").run(Date.now());
  const no = await call("/assignments/1/commission", { headers: HU, body: {} });
  assert.equal(no.status, 409, "جدول کمیسیون پیش از فراخوان نه");
  assert.equal(no.data.final_call, "none");
  const n0 = calls.length;
  const st = await call("/assignments/1/final-call", { headers: HU, body: {} });
  assert.equal(st.status, 200, JSON.stringify(st.data));
  assert.deepEqual([st.data.sent, st.data.no_phone], [2, 1]);
  const v = st.data.view;
  assert.equal(v.call.state, "open");
  assert.ok(Math.abs(v.call.deadline_at - v.call.at - 24 * HOUR) < 1000, "مهلت = لحظهٔ تصمیم + ۲۴ ساعت");
  assert.deepEqual(v.sups.map((s) => [s.offer_no, s.name, s.status, s.sms]), [["R-F-1", "تأمین برق", "need", "sent"], ["R-F-2", "برق دوم", "need", "sent"], ["R-F-3", "فروشگاه تلفنی", "need", "no_phone"]]);
  const sms = calls.slice(n0).filter((c) => c.bot === "sms");
  assert.equal(sms.length, 2, "دو پیامک به دو تأمین‌کنندهٔ پنل");
  assert.match(sms[0].body.message, /پیشنهاد شما با شمارهٔ R-F-۱ وارد کمیسیون معاملات شرکت/);
  assert.match(sms[0].body.message, /کمترین قیمتِ رسیده: «کابل ۴ در ۲٫۵» ۴۳۰٬۰۰۰ ریال/);
  assert.match(sms[0].body.message, /🔑 رمز ورود: \d{6}/, "لینک و رمزِ ورودِ پنل");
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM sp_sms WHERE kind='final'").get().n, 2, "هر پیامک ثبت است");
  assert.doesNotMatch(DB.raw.prepare("SELECT body FROM sp_sms WHERE kind='final' LIMIT 1").get().body, /رمز ورود: \d{6}/, "رمز در دیتابیس نیست");
  const tg = calls.slice(n0).filter((c) => c.bot === "main" && c.method === "sendMessage" && String(c.body.chat_id) === "702").map((c) => c.body.text).join("\n");
  assert.match(tg, /شمارهٔ «فروشگاه تلفنی» \(پیشنهادِ R-F-3\) را ندارم/);
  assert.match(tg, /فراخوانِ پیش‌فاکتورِ رسمی — درخواست R-F/);
  /* دوباره زدن: همان فراخوان، بی پیامکِ تازه */
  const again = await call("/assignments/1/final-call", { headers: HU, body: {} });
  assert.equal(again.data.existed, true);
  assert.equal(calls.slice(n0).filter((c) => c.bot === "sms").length, 2);
  /* هنوز باز */
  const open = await call("/assignments/1/commission", { headers: HU, body: {} });
  assert.equal(open.status, 409);
  assert.equal(open.data.final_call, "open");
  S.call = v.call;
});

test("پیش‌فاکتورِ رسمی: قیمتِ پایین‌تر ← «جایگزین شود؟» ← ثبت و قفل؛ اعتبارِ کم پذیرفته نیست؛ شمارهٔ تازه از کارشناس", { skip: SKIP }, async () => {
  const th = threadOf(1, "تأمین برق"), H = await supplierSession("09120000601");
  const d = (await call(`/sp/thread/${th}`, { headers: H })).data;
  assert.equal(d.final_call.offer_no, "R-F-1");
  assert.equal(d.final_call.can_upload, true);
  assert.deepEqual(d.final_call.lowest.map((x) => x.price), [430000]);
  model = () => checkOut({ price: 440000, days: 3 });
  const up = await call(`/sp/thread/${th}/offpf?filename=pf.pdf`, { headers: H, raw: PDF });
  assert.equal(up.status, 200, JSON.stringify(up.data));
  assert.equal(up.data.state, "ask");
  assert.deepEqual(up.data.ask.map((x) => x.field), ["price"]);
  assert.match(up.data.ask[0].msg, /۴۴۰٬۰۰۰ ریال است؛ پیشنهادِ قبلیِ شما ۴۵۰٬۰۰۰ ریال/);
  const aiCall = calls.filter((c) => c.bot === "ai").pop();
  assert.match(JSON.stringify(aiCall.body.tools[0].input_schema.properties), /issue_date/);
  const dec = await call(`/sp/offpf/${up.data.id}/decide`, { headers: H, body: { replace: true } });
  assert.equal(dec.status, 200, JSON.stringify(dec.data));
  assert.equal(dec.data.revised, true);
  const q = DB.raw.prepare("SELECT price, src_json FROM quotes WHERE assignment_id=1 AND supplier_name='تأمین برق'").get();
  assert.equal(q.price, 440000, "اصلاحِ نهایی");
  const src = JSON.parse(q.src_json).price;
  assert.deepEqual([src.s, src.prev.v, src.prev.s], ["pf_off", 450000, "bundle"]);
  assert.ok(DB.raw.prepare("SELECT 1 AS x FROM quote_edits WHERE channel='offpf'").get(), "ویرایش ثبت است");
  const s1 = DB.raw.prepare("SELECT status, revised, valid_to FROM final_call_sups WHERE supplier_name='تأمین برق'").get();
  assert.deepEqual([s1.status, s1.revised], ["valid", 1]);
  const d2 = (await call(`/sp/thread/${th}`, { headers: H })).data;
  assert.equal(d2.final_call.can_upload, false, "قیمت قفل است");
  assert.equal((await call(`/sp/thread/${th}/offpf?filename=pf2.pdf`, { headers: H, raw: PDF })).status, 409, "پیش‌فاکتورِ دوم نه");
  /* برق دوم: اعتبارِ ۱۰ ساعته — کمتر از «مهلت + ۲۴ ساعت» */
  const th2 = threadOf(1, "برق دوم"), H2 = await supplierSession("09120000602");
  model = () => checkOut({ price: 470000, hours: 10 });
  const b2 = await call(`/sp/thread/${th2}/offpf?filename=short.pdf`, { headers: H2, raw: PDF });
  assert.equal(b2.data.state, "blocked");
  assert.match(b2.data.block.map((x) => x.msg).join(" "), /اعتبارِ این پیش‌فاکتور تا .* است؛ باید دست‌کم تا/);
  assert.equal((await call(`/sp/offpf/${b2.data.id}/decide`, { headers: H2, body: { replace: true } })).status, 409);
  /* بی مهر */
  model = () => checkOut({ price: 470000, days: 5, stamped: false });
  const b3 = await call(`/sp/thread/${th2}/offpf?filename=nostamp.pdf`, { headers: H2, raw: PDF });
  assert.match(b3.data.block.map((x) => x.msg).join(" "), /مهر یا امضای فروشنده/);
  /* شمارهٔ تازه برای تأمین‌کنندهٔ تلفنی: گفت‌وگوی پنل ساخته می‌شود و پیامک می‌رود */
  const n0 = calls.length;
  const ph = await call("/assignments/1/final-call/phone", { headers: HU, body: { supplier_name: "فروشگاه تلفنی", phone: "09120000603" } });
  assert.equal(ph.status, 200, JSON.stringify(ph.data));
  assert.equal(ph.data.state, "sent");
  assert.equal(calls.slice(n0).filter((c) => c.bot === "sms").length, 1);
  const th3 = threadOf(1, "فروشگاه تلفنی");
  const H3 = await supplierSession("09120000603");
  const d3 = (await call(`/sp/thread/${th3}`, { headers: H3 })).data;
  assert.equal(d3.final_call.offer_no, "R-F-3");
  assert.equal(d3.final_call.items[0].price, 430000);
  /* کارشناس به‌جای «برق دوم» بارگذاری می‌کند (همان سنجش) */
  model = () => checkOut({ price: 470000, days: 5 });
  const ex = await call(`/assignments/1/final-call/offpf?supplier=${encodeURIComponent("برق دوم")}&filename=e.pdf`, { headers: HU, raw: PDF });
  assert.equal(ex.data.state, "ok", JSON.stringify(ex.data));
  const exd = await call(`/assignments/1/final-call/offpf/${ex.data.id}/decide`, { headers: HU, body: {} });
  assert.equal(exd.status, 200, JSON.stringify(exd.data));
  assert.deepEqual(exd.data.view.sups.map((s) => s.status), ["valid", "valid", "need"]);
});

test("سرِ مهلت: «📦 بستهٔ کمیسیون» بسته می‌شود، جدول کمیسیون ساخته می‌شود و نامِ دارندهٔ پیش‌فاکتورِ معتبر سبز است", { skip: SKIP }, async () => {
  DB.raw.prepare("UPDATE final_calls SET deadline_at=? WHERE assignment_id=1").run(Date.now() - 1000);
  /* Cron (bot.js:scheduled، دقیقه‌های غیرِ مضربِ ۵) همین را صدا می‌زند */
  const out = await finalCallTick(env);
  assert.equal(out.fcClosed, 1, JSON.stringify(out));
  const c = DB.raw.prepare("SELECT * FROM final_calls WHERE assignment_id=1").get();
  assert.deepEqual([c.state, c.close_why], ["closed", "deadline"]);
  const pk = JSON.parse(DB.raw.prepare("SELECT data_json FROM commission_packages WHERE id=?").get(c.package_id).data_json);
  /* اعتبار: «تأمین برق» ۳ روز از امروز ← هنگامِ ورود (حالا) بیش از ۲۴ ساعت مانده */
  assert.deepEqual(pk.suppliers.map((s) => [s.offer_no, s.final]), [["R-F-1", "ok"], ["R-F-2", "ok"], ["R-F-3", "none"]]);
  assert.equal(pk.suppliers[0].lines[0].price, 440000);
  assert.equal(pk.suppliers[0].sms.state, "sent");
  const ok = await call("/assignments/1/commission", { headers: HU, body: {} });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const d = await bundleData(env, 1, {}, "تونل سد آریانا");
  assert.deepEqual(d.offpf.sort(), ["برق دوم", "تأمین برق"].sort());
  const sh = commissionSheet({ ...d, notes: "" });
  const names = [...sh.cells.values()].filter((x) => /✓$/.test(String(x.v || "")));
  assert.equal(names.length, 2);
  assert.ok(names.every((x) => x.st.fill === "E2F0D9"));
  assert.equal((await call("/assignments/1/final-call/package", { headers: HU })).data.package.call_id, c.id);
});

test("«📤 ارسال» با «پیش‌فاکتورِ رسمی 🔒»: بی سند ۴۲۲، سند سنجیده و پیوستِ بسته", { skip: SKIP }, async () => {
  assert.equal((await call("/items/21/terms", { method: "PUT", headers: HU, body: { offpf: { on: true, lock: true } } })).status, 200);
  assert.equal((await call("/sp/x/send", { headers: HU, body: { assignment_id: 2, item_ids: [21], supplier_name: "فیوزساز", phone: "09120000701", label: "فروش" } })).status, 200);
  const th = threadOf(2, "فیوزساز"), H = await supplierSession("09120000701");
  const d = (await call(`/sp/thread/${th}`, { headers: H })).data;
  assert.match(d.lines[0].limits_txt, /پیش‌فاکتورِ رسمی 🔒 الزامی هنگامِ ارسال/);
  assert.equal((await call(`/sp/thread/${th}/terms`, { headers: H, body: { pay: "نقدی", vat: "دارد", invoice: "رسمی", dtime: "10", valid_days: 5 } })).status, 200);
  assert.equal((await call(`/sp/line/${d.lines[0].id}`, { method: "PUT", headers: H, body: { qty: 5, price: 90000 } })).status, 200);
  assert.equal((await call(`/sp/line/${d.lines[0].id}/ready`, { headers: H, body: { on: true } })).status, 200);
  const no = await call(`/sp/thread/${th}/submit`, { headers: H, body: {} });
  assert.equal(no.status, 422);
  assert.equal(no.data.offpf, "need");
  model = () => checkOut({ price: 90000, qty: 5, unit: "عدد", days: 7 });
  const up = await call(`/sp/thread/${th}/offpf?stage=submit&filename=off.pdf`, { headers: H, raw: PDF });
  assert.equal(up.data.state, "ok", JSON.stringify(up.data));
  const sub = await call(`/sp/thread/${th}/submit`, { headers: H, body: { offpf_id: up.data.id } });
  assert.equal(sub.status, 200, JSON.stringify(sub.data));
  const b = DB.raw.prepare("SELECT pf_key, pf_name FROM sp_bundles WHERE id=?").get(sub.data.bundle_id);
  assert.equal(b.pf_name, "off.pdf");
  assert.deepEqual({ ...DB.raw.prepare("SELECT state, bundle_id FROM offpf WHERE id=?").get(up.data.id) }, { state: "applied", bundle_id: sub.data.bundle_id });
});

test("کارشناس هوشمند: فراخوان در گامِ پایانی، منتظرِ مهلت، بعد بستن و ادامهٔ «شرح و نامه»؛ پنل پشتیبانی خاموش/روشن", { skip: SKIP }, async () => {
  const t = Date.now();
  DB.raw.prepare("INSERT INTO ai_agents (expert_id,mode,on_at,updated_at) VALUES (1,'on',?,?)").run(t - 60000, t);
  DB.raw.prepare("INSERT INTO quotes (assignment_id,item_id,supplier_name,unit,qty,price,dtime,pay,invoice,vat,saved,final,final_at,source,origin,created_at,updated_at) VALUES (3,31,'پیچ‌سازان','عدد',20,3500,'7','نقدی','رسمی','دارد',1,1,?,'supplier','supplier',?,?)").run(t, t, t);
  DB.raw.prepare("INSERT INTO ai_runs (id,assignment_id,expert_id,request_id,state,data_json,next_at,created_at,updated_at) VALUES (9,3,1,'R-A','closing',?,0,?,?)")
    .run(JSON.stringify({ flow: 2, items: [{ id: 31, title: "پیچ M8" }], closing: { step: "call", why: "test" } }), t, t);
  const r1 = await aiTick(env);
  assert.equal(r1.step, "close-call", JSON.stringify(r1));
  const c = DB.raw.prepare("SELECT * FROM final_calls WHERE assignment_id=3").get();
  assert.deepEqual([c.state, c.mode, c.by], ["open", "ai", "ai"]);
  assert.equal(DB.raw.prepare("SELECT sms_state FROM final_call_sups WHERE call_id=?").get(c.id).sms_state, "no_phone", "بی گفت‌وگوی پنل ← به کارشناس گفته شد");
  const run = DB.raw.prepare("SELECT data_json, next_at FROM ai_runs WHERE id=9").get();
  assert.equal(JSON.parse(run.data_json).closing.step, "call_wait");
  assert.ok(run.next_at > Date.now() + 20 * 60000, "تا مهلت (حداکثر نیم ساعت) صبر");
  /* کارشناسِ دستی نمی‌تواند فراخوانِ کارشناس هوشمند را زودتر ببندد */
  /* مهلت گذشت: گامِ بعد می‌بندد و به «شرح» می‌رود */
  DB.raw.prepare("UPDATE final_calls SET deadline_at=? WHERE id=?").run(Date.now() - 1000, c.id);
  DB.raw.prepare("UPDATE ai_runs SET next_at=0 WHERE id=9").run();
  const r2 = await aiTick(env);
  assert.equal(r2.step, "call-closed", JSON.stringify(r2));
  assert.equal(DB.raw.prepare("SELECT state FROM final_calls WHERE id=?").get(c.id).state, "closed");
  assert.equal(JSON.parse(DB.raw.prepare("SELECT data_json FROM ai_runs WHERE id=9").get().data_json).closing.step, "report");
  /* پنل پشتیبانی: تنظیمات و همراهِ کارشناس */
  const SUP = { "X-Support-Token": (await call("/support/setup", { body: { pass: "9753" } })).data.token };
  const g = await call("/support/ai/final-call", { headers: SUP });
  assert.equal(g.status, 200, JSON.stringify(g.data));
  assert.deepEqual([g.data.cfg.on, g.data.cfg.window_h, g.data.cfg.min_valid_h, g.data.cfg.send_lowest], [true, 24, 24, true]);
  assert.equal((await call("/support/ai/final-call", { method: "PUT", headers: SUP, body: { cfg: { window_h: 48 }, phones: [{ expert_id: 2, phone: "123" }] } })).status, 422, "شمارهٔ نادرست");
  const p = await call("/support/ai/final-call", { method: "PUT", headers: SUP, body: { cfg: { on: false, window_h: 48, min_valid_h: 12, send_lowest: false }, phones: [{ expert_id: 2, phone: "09121111111" }] } });
  assert.equal(p.status, 200, JSON.stringify(p.data));
  assert.deepEqual([p.data.cfg.on, p.data.cfg.window_h, p.data.cfg.min_valid_h, p.data.cfg.send_lowest], [false, 48, 12, false]);
  assert.equal(DB.raw.prepare("SELECT phone FROM experts WHERE id=2").get().phone, "09121111111");
  resetFcCache();
  assert.ok(DB.raw.prepare("SELECT 1 AS x FROM events WHERE kind='final_call_cfg'").get());
});

test("بات مکاتبات: فایل در پنجرهٔ فراخوان همان پیش‌فاکتورِ رسمی است — حکم با دکمهٔ «جایگزین شود و ثبت»", { skip: SKIP }, async () => {
  const t = Date.now();
  /* آزمونِ قبلی فراخوان را در پنل پشتیبانی خاموش کرد؛ دوباره روشن */
  DB.raw.prepare("UPDATE settings SET value=? WHERE key='finalCall'").run(JSON.stringify({ on: true, window_h: 24, min_valid_h: 24, send_lowest: true }));
  resetFcCache();
  DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES ('R-B','1405/07/27','پروژهٔ بات')").run();
  DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,deadline_at,created_at) VALUES (4,'R-B',2,5,?,?,?)").run(t, t + 9e8, t);
  DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,title,qty,unit,state,assignment_id,norm_json) VALUES (41,'R-B','a',1,'کابل ۴ در ۲٫۵',10,'متر','open',4,?)").run(norm("کابل"));
  assert.equal((await call("/sp/x/send", { headers: HU, body: { assignment_id: 4, item_ids: [41], supplier_name: "ربات‌فروش", phone: "09120000801", label: "فروش" } })).status, 200);
  const th = threadOf(4, "ربات‌فروش"), H = await supplierSession("09120000801");
  assert.equal((await call(`/sp/thread/${th}/terms`, { headers: H, body: { pay: "نقدی", vat: "دارد", invoice: "رسمی", dtime: "10", valid_days: 5 } })).status, 200);
  const d = (await call(`/sp/thread/${th}`, { headers: H })).data;
  assert.equal((await call(`/sp/line/${d.lines[0].id}`, { method: "PUT", headers: H, body: { qty: 10, price: 450000 } })).status, 200);
  assert.equal((await call(`/sp/line/${d.lines[0].id}/ready`, { headers: H, body: { on: true } })).status, 200);
  const sub = await call(`/sp/thread/${th}/submit`, { headers: H, body: {} });
  assert.equal((await call(`/sp/x/bundle/${sub.data.bundle_id}/decide`, { headers: HU, body: { action: "final" } })).status, 200);
  for (const n of ["تلفنی یک", "تلفنی دو"]) DB.raw.prepare("INSERT INTO quotes (assignment_id,item_id,supplier_name,unit,qty,price,dtime,pay,invoice,vat,saved,final,final_at,created_at,updated_at) VALUES (4,41,?,'متر',10,460000,'7','نقدی','رسمی','دارد',1,1,?,?,?)").run(n, t, t, t);
  assert.equal((await call("/assignments/4/final-call", { headers: HU, body: {} })).status, 200);
  const ph = DB.raw.prepare("SELECT id FROM sp_phones WHERE phone='09120000801'").get().id;
  DB.raw.prepare("INSERT INTO sp_tg (chat,role,phone_id,focus,updated_at) VALUES ('8801','s',?,?,?)").run(ph, th, t);
  model = () => checkOut({ price: 430000, days: 3 });
  const n0 = calls.length;
  await handleSpUpdate(env, { update_id: 50, message: { message_id: 60, chat: { id: 8801, type: "private" }, document: { file_id: "OF1", file_size: 10, file_name: "rasmi.pdf", mime_type: "application/pdf" } } });
  const msgs = calls.slice(n0).filter((c) => c.bot === "sp" && c.method === "sendMessage" && String(c.body.chat_id) === "8801");
  const last = msgs[msgs.length - 1];
  assert.match(last.body.text, /سند با پیشنهادِ قبلی‌تان فرق دارد — جایگزین شود؟/);
  const ok = last.body.reply_markup.inline_keyboard.flat().find((b) => /^oc:\d+:1$/.test(b.callback_data));
  assert.ok(ok, "دکمهٔ «جایگزین شود و ثبت»");
  await handleSpUpdate(env, { update_id: 51, callback_query: { id: "cq1", data: ok.callback_data, message: { message_id: 61, chat: { id: 8801 } } } });
  assert.equal(DB.raw.prepare("SELECT status FROM final_call_sups WHERE assignment_id=4 AND supplier_name='ربات‌فروش'").get().status, "valid");
  assert.equal(DB.raw.prepare("SELECT price FROM quotes WHERE assignment_id=4 AND supplier_name='ربات‌فروش'").get().price, 430000);
  const o = DB.raw.prepare("SELECT channel, state FROM offpf WHERE assignment_id=4").get();
  assert.deepEqual({ ...o }, { channel: "telegram", state: "applied" });
});