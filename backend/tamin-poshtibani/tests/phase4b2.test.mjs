/* ============================================================
   طرح «خرید هوشمند، کارشناس ناظر» — فاز ۴ب، گام ۲ (مهر ۱۴۰۵): «🎯 فهرست دعوت»ِ هر قلم و «🚀 شروع»ش

   روی SQLite واقعی (همان طرحِ ensureSchema) با فهرست اقلام و سوابق خریدِ واقعی‌نما، و تلگرامِ بدلی:
   بررسی سوابق کارِ خودِ کارشناس است ← فهرستِ هر قلم به ترتیبِ قاعدهٔ دعوت، پنج نفر اول تیک‌خورده ← «انتخاب کارشناس»: برداشتنِ
   پنج نفر اول بی توضیح شروع نمی‌شود، افزودن آزاد ← «🚀 شروع»: ساختار منجمد، کار ساخته، دعوت فقط تیک‌خورده‌های با شمارهٔ پنل ←
   «سپردن یا برگشت»: فهرست عوض نمی‌شود؛ قلمِ دوم به کارِ زنده می‌پیوندد و تأمین‌کنندهٔ مشترک در همان گفت‌وگو ← از «جستجوی
   هوشمند» فقط با انتخابِ کارشناس و «دعوت از انتخاب‌های تازه» ← «مستقیم» بی توضیح ← ▶️ شروعِ پشتیبانی فهرستِ پیش‌فرض را
   خودش می‌سازد ← روالِ پیشین دست نمی‌خورد.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";

import { loadTP, sqliteD1 } from "./run.mjs";
import * as W from "../../../worker/catalog.js";
import { ensureSchema, route } from "../../../worker/api.js";
import { aiTick } from "../../../worker/ai-agent.js";
import { resetModesCache } from "../../../worker/ai-modes.js";
import { defaultFrom, applyEdits, startCheck, pickCands, TOP } from "../../../worker/ai-picks.js";

const TP0 = loadTP();
const XL = TP0.XLSX;
const book = (sheets) => {
  const wb = XL.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) XL.utils.book_append_sheet(wb, XL.utils.aoa_to_sheet(aoa), name);
  return wb;
};
const ITEM_HEAD = ["کد قلم", "عنوان قلم", "نوع قلم", "واحد مرجع", "کد خوشه", "کد طبقهٔ اصناف", "باقیماندهٔ متن", "اندازه", "جنس", "ویژگی‌ها (JSON)"];
const item = (code, title, head, attrs) => [code, title, head, "عدد", "C04", "200", "", attrs["اندازه"] || "", attrs["جنس"] || "", JSON.stringify(attrs)];
const H = ["شماره", "تاریخ سفارش", "وضعیت", "کارشناس خرید", "کد قلم خریدنی", "عنوان قلم خریدنی", "مقدار", "واحد سنجش", "مبلغ به ارز عملیاتی", "تامین کننده", "کد", "رده", "ماه", "فصل", "سال"];
let NO = 0;
const buy = (code, title, qty, supplier, grade, date = "1404/10/01") => { NO++; return [String(NO), date, "بسته شده", "ک", code, title, qty, "عدد", qty * 1000, supplier, grade ? 600 + NO : null, grade, +date.slice(5, 7), "زمستان", date.slice(0, 4)]; };
const books = () => ({
  items: book({
    items: [ITEM_HEAD, item("1001", "پیچ آلن M8 فولادی", "پیچ", { "اندازه": "M8", "جنس": "فولاد" }), item("1003", "پیچ M10", "پیچ", { "اندازه": "M10" }), item("2001", "مهره M8", "مهره", { "اندازه": "M8" })],
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
  /* پیچ: هفت تأمین‌کننده؛ «شرکت الف» (ردهٔ A) و «شرکت ب» عینِ همان پیچ آلن را داده‌اند. مهره: «شرکت الف» و «مهره‌فروشی» */
  history: book({ "حداکثر 500000 رکورد": [H,
    buy("1001", "پیچ آلن M8 فولادی", 40, "شرکت الف", "A"), buy("1001", "پیچ آلن M8 فولادی", 30, "شرکت الف", "A"), buy("1001", "پیچ آلن M8 فولادی", 10, "شرکت ب", "B"),
    buy("1003", "پیچ M10", 90, "شرکت ج", "A"), buy("1003", "پیچ M10", 80, "شرکت ج", "A"), buy("1003", "پیچ M10", 70, "شرکت ج", "A"),
    buy("1003", "پیچ M10", 60, "شرکت د", "C"), buy("1003", "پیچ M10", 50, "شرکت د", "C"),
    buy("1003", "پیچ M10", 20, "شرکت ه", null), buy("1003", "پیچ M10", 15, "شرکت و", null), buy("1003", "پیچ M10", 12, "شرکت ز", null),
    buy("2001", "مهره M8", 25, "شرکت الف", "A"), buy("2001", "مهره M8", 30, "مهره‌فروشی", "C"), buy("2001", "مهره M8", 30, "مهره‌فروشی", "C"),
  ] }),
});

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = {
  DB, MANAGER_CODE: "1234", TG_BOT_TOKEN: "tok", TG_SP_BOT_TOKEN: "sptok", TG_WEBHOOK_SECRET: "sec", TG_API_BASE: "https://tg.test/bot",
  SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_KEY: "svc", ANTHROPIC_API_KEY: "k", ANTHROPIC_API_BASE: "https://ai.test", SITE_ORIGIN: "https://site.test",
};
const EX = { "X-Expert-Code": "7001" }, EX2 = { "X-Expert-Code": "7002" };
const catalog = (code, head, layers) => JSON.stringify({ v: 2, head, layers, source: "catalog", code });

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
  DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,telegram_chat,created_at) VALUES (1,'هوشمند','هوشمند','7001',1,1,'701',?), (2,'دستی','دستی','7002',1,1,'702',?)").run(t, t);
  DB.raw.prepare("INSERT INTO ai_agents (expert_id,mode,on_at,updated_at) VALUES (1,'on',?,?)").run(t - 60000, t);
  DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES ('R-1','1405/07/15','پروژهٔ یک'), ('R-2','1405/07/15','پروژهٔ دو'), ('R-3','1405/07/15','پروژهٔ سه'), ('R-4','1405/07/15','پروژهٔ چهار')").run();
  DB.raw.prepare(`INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,deadline_at,created_at) VALUES
    (1,'R-1',1,5,?,?,?), (2,'R-2',2,5,?,?,?), (3,'R-3',1,5,?,?,?), (4,'R-4',1,5,?,?,?)`).run(t, t + 9e8, t, t, t + 9e8, t, t, t + 9e8, t, t, t + 9e8, t);
  const ins = DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,code,title,qty,unit,state,assignment_id,norm_json) VALUES (?,?,?,?,?,?,?,?,'open',?,?)");
  ins.run(41, "R-1", "a", 1, "1001", "پیچ آلن M8 فولادی", 100, "عدد", 1, null);
  ins.run(42, "R-1", "b", 2, "2001", "مهره M8", 50, "عدد", 1, catalog("2001", "مهره", { "اندازه": "M8" }));
  ins.run(43, "R-1", "c", 3, null, "دستکش نخی", 20, "جفت", 1, JSON.stringify({ v: 2, head: "دستکش", layers: {}, source: "manual" }));
  ins.run(51, "R-2", "a", 1, "1001", "پیچ آلن M8 فولادی", 10, "عدد", 2, catalog("1001", "پیچ", { "اندازه": "M8", "جنس": "فولاد" }));
  ins.run(61, "R-3", "a", 1, "1003", "پیچ M10", 30, "عدد", 3, catalog("1003", "پیچ", { "اندازه": "M10" }));
  ins.run(71, "R-4", "a", 1, "1003", "پیچ M10", 30, "عدد", 4, catalog("1003", "پیچ", { "اندازه": "M10" }));
  /* روالِ پیشین: کارِ زنده‌ای که پیش از گام ۲ ساخته شده (بی flow) */
  DB.raw.prepare("INSERT INTO ai_runs (assignment_id,expert_id,request_id,state,data_json,next_at,created_at,updated_at) VALUES (4,1,'R-4','work',?,?,?,?)")
    .run(JSON.stringify({ items: [{ id: 71, title: "پیچ M10", qty: 30, unit: "عدد", prep: 1, smart: { n: 0 } }], cands: [] }), t + 9e8, t, t);
}

/* ---------- دنیای بیرونِ بدلی ---------- */
const calls = [];
const R = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.startsWith("https://tg.test/bot")) {
    const method = u.split("/").pop();
    calls.push({ bot: "tg", method, body: typeof init.body === "string" ? JSON.parse(init.body) : {} });
    if (method === "getMe") return R({ ok: true, result: { id: 77, username: "AriaSupplierBot" } });
    return R({ ok: true, result: method === "sendMessage" ? { message_id: calls.length } : true });
  }
  if (u.startsWith("https://sb.test/")) return R({ Key: "x" });
  if (u.startsWith("https://ai.test/")) throw new Error("در گام ۲ هیچ مدلی صدا زده نمی‌شود");
  throw new Error(`fetch بیرونیِ پیش‌بینی‌نشده: ${u}`);
};
const pend = [];
const ctx = { waitUntil: (p) => pend.push(p) };
async function call(path, { method, body, headers } = {}) {
  const h = { ...(headers || {}) };
  let b;
  if (body !== undefined) { b = JSON.stringify(body); h["Content-Type"] = "application/json"; }
  const res = await route(new Request(`https://site.test/tamin-poshtibani/api${path}`, { method: method || (b !== undefined ? "POST" : "GET"), headers: h, body: b }), env, ctx);
  while (pend.length) await Promise.all(pend.splice(0));
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch (_) { data = text; }
  return { status: res.status, data };
}
let SUP = {};
if (DB) SUP = { "X-Support-Token": (await call("/support/setup", { body: { pass: "9753" } })).data.token };
const picks = (id, headers = EX) => call(`/items/${id}/picks`, { headers });
const edit = (id, body) => call(`/items/${id}/picks`, { method: "PUT", headers: EX, body });
const start = (id) => call(`/items/${id}/ai-start`, { headers: EX, body: {} });
const phone = (name, num, panel) => call("/sp/x/phones", { headers: EX, body: { supplier_name: name, phone: num, label: "فروش", panel } });
const keyOf = (L, name) => L.find((e) => e.name === name).k;
/** Cron تا جایی که شرط برقرار شود (هر بار یک گام) */
async function tickUntil(pred, max = 12, aid = 1) {
  for (let i = 0; i < max; i++) {
    /* فقط کارِ همین ارجاع سررسیده؛ بقیه بعدتر — وگرنه کارِ کوچک‌ترین شناسه همیشه برداشته می‌شود */
    DB.raw.prepare("UPDATE ai_runs SET next_at=CASE WHEN assignment_id=? THEN 0 ELSE ? END WHERE finished_at IS NULL AND state<>'paused'").run(aid, Date.now() + 9e8);
    await aiTick(env);
    if (pred()) return true;
  }
  return false;
}
const threadsOf = (aid) => DB.raw.prepare(`SELECT t.id, s.name, (SELECT GROUP_CONCAT(l.item_id) FROM sp_lines l WHERE l.thread_id=t.id) AS lines, x.source, x.state
    FROM sp_threads t JOIN sp_suppliers s ON s.id=t.supplier_id LEFT JOIN ai_threads x ON x.thread_id=t.id WHERE t.assignment_id=? ORDER BY t.id`).all(aid);
const S = {};

test("فهرست از قاعدهٔ دعوت (بی پایگاه داده): پنج نفر اول، ردهٔ برگزیدهٔ عین قلم اول، بی تکرار؛ سنجشِ شروع", () => {
  const s = (name, rankF, grade) => ({ key: name, name, rankF, grade, n: 1 });
  const L = defaultFrom({ exact: [s("ب", 2, "B"), s("الف", 5, "A")], type: [s("ج", 1, "A"), s("الف", 5, "A"), s("د", 2), s("ه", 3), s("و", 4), s("ز", 6), s("ح", 7)] },
    { tier: { A: 5, B: 0, C: 0 }, then: "type" });
  assert.deepEqual(L.map((e) => [e.name, e.src, e.pos, e.top, e.on]), [
    ["الف", "grade", 1, true, true], ["ج", "type", 2, true, true], ["د", "type", 3, true, true], ["ه", "type", 4, true, true], ["و", "type", 5, true, true],
    ["ز", "type", 6, false, false], ["ح", "type", 7, false, false],
  ], "ردهٔ A عینِ قلم، جدا از رتبه، اول؛ بعد نوع قلم به ترتیبِ رتبهٔ نهایی");
  assert.equal(TOP, 5);
  const p = { list: L };
  applyEdits(p, { on: { [L[2].k]: false } }, { mode: "pick", by: "t" });
  assert.throws(() => startCheck(p, "pick", {}), (e) => e.status === 422 && e.extra.need_reason[0] === L[2].k, "برداشتنِ پنج نفر اول بی توضیح");
  applyEdits(p, { why: { [L[2].k]: "تأخیرِ تحویل در دو خریدِ آخر" } }, { mode: "pick", by: "t" });
  assert.equal(startCheck(p, "pick", {}).length, 4);
  assert.equal(startCheck({ list: L.map((e) => ({ ...e, on: e.top && e.pos !== 3 })) }, "direct", {}).length, 4, "«مستقیم» بی توضیح");
  assert.throws(() => applyEdits(p, { on: { [L[0].k]: false } }, { mode: "handoff", by: "t" }), (e) => e.status === 409, "«سپردن یا برگشت» عوض نمی‌شود");
  assert.throws(() => applyEdits(p, { on: { [L[5].k]: true, [L[6].k]: true } }, { mode: "pick", by: "t", cap: 5 }), (e) => e.status === 422, "سقفِ تیک");
  /* سپرده‌شده‌ها به نوبت میانِ اقلام */
  const go = (n, k) => ({ k, name: k, src: "type", on: true, go: 1, ph: [] });
  const c = pickCands([{ id: 1, pick_json: JSON.stringify({ list: [go(1, "x"), go(2, "y")] }) }, { id: 2, pick_json: JSON.stringify({ list: [go(1, "y"), go(2, "z"), { k: "w", on: true, go: null }] }) }]);
  assert.deepEqual(c.map((x) => [x.key, [...x.items].sort(), x.rank]), [["x", [1], 1], ["y", [1, 2], 2], ["z", [2], 3]], "فقط سپرده‌شده‌ها؛ نفرِ اولِ هر قلم، بعد دوم");
});

test("بررسی سوابق کارِ خودِ کارشناس است؛ فهرستِ دعوت فقط بر ساختارِ تأییدشده، پنج نفر اول تیک‌خورده", { skip: SKIP }, async () => {
  assert.notEqual((await call("/suppliers/history?item_id=41", { headers: EX })).status, 423, "گام ۲: سوابق برای کارشناسِ هوشمند باز است");
  const no = await picks(41);
  assert.equal(no.status, 409);
  assert.equal(no.data.need_norm, true, "اول ساختارِ قلم");
  const p41 = await call("/items/41/normalize", { headers: EX, body: {} });
  assert.equal((await call("/items/41/norm", { method: "PUT", headers: EX, body: { head: p41.data.head, layers: p41.data.layers, source: p41.data.source, code: "1001" } })).status, 200);
  const g = await picks(41);
  assert.equal(g.status, 200, JSON.stringify(g.data));
  S.L = g.data.list;
  assert.deepEqual([g.data.mode, g.data.started_at, g.data.top, g.data.cap], ["pick", null, 5, 10]);
  assert.equal(S.L.length, 7, "هفت تأمین‌کنندهٔ پیچ");
  assert.deepEqual([S.L[0].name, S.L[0].src], ["شرکت الف", "grade"], "ردهٔ A عینِ قلم اول");
  assert.deepEqual(S.L.map((e) => e.on), [true, true, true, true, true, false, false], "پنج نفر اول تیک‌خورده");
  assert.ok(S.L.every((e) => e.st === (e.on ? "draft" : "off")));
  const again = await picks(41);
  assert.equal(again.data.built_at, g.data.built_at, "همان فهرستی که کارشناس دید نگه داشته می‌شود");
  assert.equal((await picks(41, EX2)).status, 403, "قلمِ کارشناسِ دیگر نه");
  assert.equal((await picks(51, EX2)).status, 409, "درخواستِ کارشناسِ غیرهوشمند فهرستِ دعوت ندارد");
  const d = (await call("/assignments/1", { headers: EX })).data;
  assert.deepEqual(d.ai.items.find((i) => i.id === 41).pick, { n: 7, on: 5, go: 0 });
  assert.ok(!("pick_json" in d.items[0]), "جزئیاتِ ارجاع فهرست را نمی‌فرستد");
});

test("«انتخاب کارشناس»: برداشتنِ پنج نفر اول با توضیح، افزودن آزاد؛ «🚀 شروع» ← منجمد، کار ساخته، دعوت فقط تیک‌خورده‌های با شمارهٔ پنل", { skip: SKIP }, async () => {
  const third = S.L[2], c = keyOf(S.L, "شرکت ج");
  let r = await edit(41, { on: { [third.k]: false, [c]: true } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const no = await start(41);
  assert.equal(no.status, 422);
  assert.deepEqual(no.data.need_reason, [third.k], "بی توضیح شروع نمی‌شود");
  r = await edit(41, { why: { [third.k]: "دو تحویلِ آخرش دیر بود" }, add: [{ name: "تأمین‌کنندهٔ تازه", src: "manual" }] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.list.find((e) => e.name === "تأمین‌کنندهٔ تازه") && [r.data.list.find((e) => e.name === "تأمین‌کنندهٔ تازه").src, r.data.list.find((e) => e.name === "تأمین‌کنندهٔ تازه").on], ["manual", true]);
  /* شماره‌ها: «شرکت الف» و تازه با تیکِ پنل، «شرکت ج» بی تیک */
  for (const [n, p, on] of [["شرکت الف", "09120000101", true], ["شرکت ج", "09120000103", false], ["تأمین‌کنندهٔ تازه", "09120000109", true]]) assert.equal((await phone(n, p, on)).status, 200);
  const ok = await start(41);
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.started, true);
  const it = DB.raw.prepare("SELECT frozen_at, frozen_by, ai_start_at, ai_start_by FROM items WHERE id=41").get();
  assert.ok(it.frozen_at && it.ai_start_at);
  assert.deepEqual([it.frozen_by, it.ai_start_by], ["expert:1", "expert:1"]);
  assert.equal((await call("/items/41/norm", { method: "PUT", headers: EX, body: { head: "پیچ", layers: {} } })).status, 409, "ساختارِ سپرده‌شده منجمد");
  const ev = DB.raw.prepare("SELECT payload_json FROM events WHERE kind='ai_start' AND item_id=41").get();
  assert.deepEqual(JSON.parse(ev.payload_json).off_top, [{ name: third.name, why: "دو تحویلِ آخرش دیر بود" }], "علتِ برداشتن با رخداد");
  const run = DB.raw.prepare("SELECT id, state, data_json FROM ai_runs WHERE assignment_id=1").get();
  assert.ok(run, "کار ساخته شد");
  S.run = run.id;
  const data = JSON.parse(run.data_json);
  assert.deepEqual([data.flow, data.items.map((x) => x.id)], [2, [41]], "فقط همین قلم، روالِ تازه");
  assert.equal((await call("/assignments/1/decision", { headers: EX, body: { action: "manual", item_ids: [41], reason: "دیر شد" } })).status, 409, "قلمِ سپرده‌شده «انجام دستی» نمی‌شود");
  assert.notEqual((await call("/suppliers/history?item_id=41", { headers: EX })).status, 423, "سوابق بعد از شروع هم برای کارشناس باز");
  /* Cron: آماده‌سازی ← بی جستجو ← دعوت (یکی در هر گام) */
  assert.ok(await tickUntil(() => threadsOf(1).length >= 2), JSON.stringify(threadsOf(1)));
  await tickUntil(() => false, 3);
  const r2 = DB.raw.prepare("SELECT state, data_json FROM ai_runs WHERE id=?").get(S.run);
  assert.equal(r2.state, "work");
  assert.deepEqual(JSON.parse(r2.data_json).items[0].smart, { off: true }, "کارشناس هوشمند خودش جستجو نمی‌کند");
  assert.deepEqual(threadsOf(1).map((t) => t.name).sort(), ["تأمین‌کنندهٔ تازه", "شرکت الف"], "فقط تیک‌خورده‌های با شمارهٔ پنل");
  assert.deepEqual(threadsOf(1).map((t) => t.source).sort(), ["history", "manual"]);
  const v = (await picks(41)).data;
  const st = (n) => v.list.find((e) => e.name === n).st;
  assert.deepEqual([st("شرکت الف"), st("تأمین‌کنندهٔ تازه"), st("شرکت ج"), st(third.name)], ["sent", "sent", "nophone", "off"]);
  assert.ok(v.list.filter((e) => e.on && !["sent"].includes(e.st)).every((e) => e.st === "nophone"), "بقیهٔ تیک‌خورده‌ها منتظرِ شماره");
  assert.ok(!calls.some((x) => x.bot === "ai"), "هیچ مدلی صدا زده نشد");
  /* تیکِ سپرده‌شده برداشته نمی‌شود */
  assert.equal((await edit(41, { on: { [keyOf(v.list, "شرکت الف")]: false } })).status, 409);
});

test("«سپردن یا برگشت»: فهرست عوض نمی‌شود؛ قلمِ دوم به کارِ زنده می‌پیوندد و تأمین‌کنندهٔ مشترک در همان گفت‌وگو", { skip: SKIP }, async () => {
  assert.equal((await call("/support/ai/modes", { method: "PUT", headers: SUP, body: { heads: { "مهره": { mode: "handoff" }, "دستکش": { mode: "direct" } } } })).status, 200);
  resetModesCache();
  const g = await picks(42);
  assert.equal(g.status, 200, JSON.stringify(g.data));
  assert.equal(g.data.mode, "handoff");
  assert.deepEqual(g.data.list.map((e) => [e.name, e.on]), [["شرکت الف", true], ["مهره‌فروشی", true]]);
  const ch = await edit(42, { on: { [g.data.list[1].k]: false } });
  assert.equal(ch.status, 409);
  assert.match(ch.data.error, /سپردن یا برگشت/);
  assert.equal((await edit(42, { add: [{ name: "x", src: "manual" }] })).status, 409, "افزودن هم نه");
  const ok = await start(42);
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM ai_runs WHERE assignment_id=1").get().n, 1, "همان کار");
  const before = threadsOf(1).length;
  assert.ok(await tickUntil(() => (threadsOf(1).find((t) => t.name === "شرکت الف").lines || "").split(",").includes("42")), JSON.stringify(threadsOf(1)));
  const data = JSON.parse(DB.raw.prepare("SELECT data_json FROM ai_runs WHERE id=?").get(S.run).data_json);
  assert.deepEqual(data.items.map((x) => x.id), [41, 42], "قلمِ تازه به کار پیوست");
  assert.equal(threadsOf(1).length, before, "گفت‌وگوی تازه‌ای ساخته نشد");
  const th = threadsOf(1).find((t) => t.name === "شرکت الف");
  assert.deepEqual(th.lines.split(",").map(Number).sort(), [41, 42], "قلمِ دوم در همان گفت‌وگو");
  const last = DB.raw.prepare("SELECT body FROM sp_msgs WHERE thread_id=? AND who='e' AND kind='text' ORDER BY id DESC LIMIT 1").get(th.id);
  assert.match(last.body, /^برای همین درخواست یه قلم دیگه هم لازم داریم/, "پیامِ کوتاهِ قلمِ تازه، بی سلامِ دوباره");
  assert.ok(DB.raw.prepare("SELECT 1 AS x FROM quotes WHERE assignment_id=1 AND item_id=42 AND supplier_name='شرکت الف'").get(), "خطِ استعلامِ قلمِ تازه");
});

test("از «جستجوی هوشمند» فقط با انتخابِ کارشناس؛ «دعوت از انتخاب‌های تازه»", { skip: SKIP }, async () => {
  const t = Date.now();
  DB.raw.prepare("INSERT INTO smart_searches (id,item_id,assignment_id,expert_id,result_json,created_at) VALUES (90,41,1,1,?,?)")
    .run(JSON.stringify({ suppliers: [{ name: "روانکاران", phones: [{ e164: "+989120000177" }] }] }), t);
  await tickUntil(() => false, 3);
  assert.ok(!threadsOf(1).some((t2) => t2.name === "روانکاران"), "نتیجهٔ جستجو خودبه‌خود دعوت نمی‌شود");
  const r = await edit(41, { add: [{ name: "روانکاران", src: "smart", sid: 90, ph: ["+989120000177"] }] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const e = r.data.list.find((x) => x.name === "روانکاران");
  assert.deepEqual([e.src, e.on, e.go, e.st, e.found], ["smart", true, null, "draft", ["09120000177"]]);
  assert.equal(r.data.fresh, 1);
  assert.equal((await phone("روانکاران", "09120000177", true)).status, 200);
  await tickUntil(() => false, 3);
  assert.ok(!threadsOf(1).some((t2) => t2.name === "روانکاران"), "تا «دعوت» نزند، انتخابِ تازه سپرده نیست");
  const go = await start(41);
  assert.equal(go.status, 200, JSON.stringify(go.data));
  assert.deepEqual([go.data.more, go.data.released], [true, 1]);
  assert.ok(DB.raw.prepare("SELECT 1 AS x FROM events WHERE kind='ai_pick_more' AND item_id=41").get());
  assert.ok(await tickUntil(() => threadsOf(1).some((t2) => t2.name === "روانکاران")), "حالا دعوت شد");
  assert.equal(threadsOf(1).find((t2) => t2.name === "روانکاران").source, "smart");
  assert.equal((await start(41)).status, 409, "انتخابِ تازه‌ای نمانده");
  /* پنل پشتیبانی همین نامزدها را می‌بیند */
  const det = (await call(`/support/ai/1/runs/${S.run}`, { headers: SUP })).data;
  assert.equal(det.run.flow, 2);
  assert.ok(det.candidates.some((x) => x.name === "روانکاران" && x.invited));
  assert.equal(det.items.find((i) => i.id === 41).pick.off.length, 1, "برداشتنِ پنج نفر اول با علت در پنل پشتیبانی");
});

test("«مستقیم»: سپردن به انتخابِ کارشناس و بی توضیح؛ ▶️ شروعِ پشتیبانی فهرستِ پیش‌فرض را در آماده‌سازی می‌سازد", { skip: SKIP }, async () => {
  const g = await picks(43);
  assert.equal(g.status, 200, JSON.stringify(g.data));
  assert.deepEqual([g.data.mode, g.data.list.length], ["direct", 0], "دستکش سابقه ندارد");
  assert.equal((await start(43)).status, 422, "بی تیک نه");
  assert.equal((await edit(43, { add: [{ name: "فروشگاه دستکش", src: "manual" }] })).status, 200);
  assert.equal((await start(43)).status, 200);
  /* ▶️ شروعِ پشتیبانی برای ارجاعِ ۳: فهرستی نیست، Cron از سوابق می‌سازد و پنج نفر اول را می‌سپارد */
  const sr = await call("/support/ai/1/runs", { headers: SUP, body: { assignment_id: 3 } });
  assert.equal(sr.status, 200, JSON.stringify(sr.data));
  assert.ok(DB.raw.prepare("SELECT ai_start_at FROM items WHERE id=61").get().ai_start_at);
  assert.ok(await tickUntil(() => !!DB.raw.prepare("SELECT pick_json FROM items WHERE id=61").get().pick_json, 12, 3));
  const p = JSON.parse(DB.raw.prepare("SELECT pick_json FROM items WHERE id=61").get().pick_json);
  assert.equal(p.by, "ai");
  assert.ok(p.list.length >= 5);
  assert.deepEqual(p.list.map((e) => !!e.go), p.list.map((e) => e.top), "پنج نفر اول سپرده (همان «سپردن یا برگشت»)");
});

test("روالِ پیشین دست نمی‌خورد: کارِ زندهٔ قدیمی فهرستِ دعوت ندارد و سوابقش برای کارشناس قفل است", { skip: SKIP }, async () => {
  const r = await picks(71);
  assert.equal(r.status, 409);
  assert.match(r.data.error, /روالِ پیشین/);
  assert.equal((await call("/suppliers/history?item_id=71", { headers: EX })).status, 423);
  const d = (await call("/assignments/4", { headers: EX })).data;
  assert.equal(d.ai.owned.flow, 1);
});
