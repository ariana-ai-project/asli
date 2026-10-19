/* ============================================================
   «🧭 استراتژی استعلام» در «🎯 فهرست دعوت» (سند طراحی، بخش ۴؛ تصمیم‌های ۲ و ۸)
   • شمارِ پیش‌تیکِ فهرستِ تازه از استراتژیِ نوع قلم (کلیدِ pretick) — با استثنای پشتیبانی
   • «استعلام محتاط را بچین»: تیک‌ها با برنامهٔ گیرندگان روی گراف؛ تازه‌ها با منبعِ «استراتژی استعلام» و شمارهٔ دفتر
   • پس از چیدن، هر تیکِ متفاوت با برنامه پیش از «🚀 شروع» علت می‌خواهد (جعبه، و برای «دیگر» متن)
   • دو گزینهٔ ثابتِ «چینش گسترده / محتاط» (مهر ۱۴۰۵): هر زدن از نو می‌چیند، گزینه در pick_json می‌ماند و برگشت آزاد است
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadTP, sqliteD1 } from "./run.mjs";
import * as W from "../../../worker/catalog.js";
import { ensureSchema, route } from "../../../worker/api.js";
import { aiTick } from "../../../worker/ai-agent.js";
import { fmCheck } from "../../../worker/first-msg.js";
import { supKey } from "../../../worker/cr-data.js";
import * as C from "../../../worker/strategy/config.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FX = JSON.parse(gunzipSync(readFileSync(resolve(HERE, "fixtures/cr02-parity.json.gz"))).toString("utf8"));
const TP0 = loadTP();
const XL = TP0.XLSX;
const book = (sheets) => { const wb = XL.utils.book_new(); for (const [n, aoa] of Object.entries(sheets)) XL.utils.book_append_sheet(wb, XL.utils.aoa_to_sheet(aoa), n); return wb; };
const ITEM_HEAD = ["کد قلم", "عنوان قلم", "نوع قلم", "واحد مرجع", "کد خوشه", "کد طبقهٔ اصناف", "باقیماندهٔ متن", "اندازه", "جنس", "ویژگی‌ها (JSON)"];
const item = (code, title, head, attrs) => [code, title, head, "عدد", "C04", "200", "", attrs["اندازه"] || "", attrs["جنس"] || "", JSON.stringify(attrs)];
const H = ["شماره", "تاریخ سفارش", "وضعیت", "کارشناس خرید", "کد قلم خریدنی", "عنوان قلم خریدنی", "مقدار", "واحد سنجش", "مبلغ به ارز عملیاتی", "تامین کننده", "کد", "رده", "ماه", "فصل", "سال"];
let NO = 0;
const buy = (code, title, qty, supplier, grade, date = "1404/10/01") => { NO++; return [String(NO), date, "بسته شده", "ک", code, title, qty, "عدد", qty * 1000, supplier, grade ? 600 + NO : null, grade, +date.slice(5, 7), "زمستان", date.slice(0, 4)]; };
const books = () => ({
  items: book({ items: [ITEM_HEAD, item("1003", "پیچ M10", "پیچ", { "اندازه": "M10" })],
    item_attributes: [["کد قلم", "نوع قلم", "نام لایهٔ ویژگی", "نام لایه (انگلیسی)", "مقدار لایه"], ["x", "x", "اندازه", "size", "x"]] }),
  indices: book({ class_index: [["کد سرگروه اصناف", "سرگروه اصناف", "کد طبقهٔ اصناف", "طبقهٔ اصناف", "کد شاخص"], ["20", "قطعات", "200", "اتصالات", "IDX_A"]],
    index_quarterly: [["کد شاخص", "دوره", "سال", "شمارهٔ فصل", "نام فصل", "شاخص (زمستان ۱۴۰۴ = ۱۰۰)"], ["IDX_A", "1404Q4", 1404, 4, "زمستان", 100]] }),
  units: book({ head_rates: [["نوع قلم", "واحد ثبت‌شده", "واحد مرجع", "نرخ تبدیل به واحد مرجع", "مبنای نرخ", "اطمینان"]],
    cluster_rates: [["کد خوشه", "نام خوشه", "نوع قلم", "واحد ثبت‌شده", "واحد مرجع", "نرخ تبدیل به واحد مرجع", "مبنای نرخ", "اطمینان"]],
    item_rates: [["کد قلم", "عنوان قلم", "نوع قلم", "واحد ثبت‌شده", "واحد مرجع", "نرخ تبدیل به واحد مرجع", "مبنای نرخ", "منشأ"]] }),
  history: book({ "حداکثر 500000 رکورد": [H,
    buy("1003", "پیچ M10", 90, "شرکت ج", "A"), buy("1003", "پیچ M10", 80, "شرکت ج", "A"), buy("1003", "پیچ M10", 60, "شرکت د", "C"),
    buy("1003", "پیچ M10", 50, "شرکت د", "C"), buy("1003", "پیچ M10", 20, "شرکت ه", null), buy("1003", "پیچ M10", 15, "شرکت و", null)] }),
});

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = { DB, MANAGER_CODE: "1234", TG_BOT_TOKEN: "tok", TG_SP_BOT_TOKEN: "sptok", TG_WEBHOOK_SECRET: "sec", TG_API_BASE: "https://tg.test/bot",
  SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_KEY: "svc", ANTHROPIC_API_KEY: "k", ANTHROPIC_API_BASE: "https://ai.test", SITE_ORIGIN: "https://site.test" };
const EX = { "X-Expert-Code": "7001" };
const R = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.startsWith("https://tg.test/bot")) return R({ ok: true, result: u.endsWith("getMe") ? { id: 77, username: "AriaSupplierBot" } : { message_id: 1 } });
  if (u.startsWith("https://ai.test/")) throw new Error("مدلی صدا زده نمی‌شود");
  return R({});
};
const pend = [];
const ctx = { waitUntil: (p) => pend.push(p) };
async function call(path, { method, body, headers } = {}) {
  const h = { ...(headers || {}) }; let b;
  if (body !== undefined) { b = JSON.stringify(body); h["Content-Type"] = "application/json"; }
  const res = await route(new Request(`https://site.test/tamin-poshtibani/api${path}`, { method: method || (b !== undefined ? "POST" : "GET"), headers: h, body: b }), env, ctx);
  while (pend.length) await Promise.all(pend.splice(0));
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch (_) { data = text; }
  return { status: res.status, data };
}
/** Cron تا جایی که شرط برقرار شود (هر بار یک گام؛ فقط کارِ همین ارجاع سررسیده) */
async function tickUntil(pred, max = 12, aid = 3) {
  for (let i = 0; i < max; i++) {
    DB.raw.prepare("UPDATE ai_runs SET next_at=CASE WHEN assignment_id=? THEN 0 ELSE ? END WHERE finished_at IS NULL AND state<>'paused'").run(aid, Date.now() + 9e8);
    await aiTick(env);
    if (pred()) return true;
  }
  return false;
}
const threadsOf = (aid) => DB.raw.prepare("SELECT t.id, s.name FROM sp_threads t JOIN sp_suppliers s ON s.id=t.supplier_id WHERE t.assignment_id=? ORDER BY t.id").all(aid);
let SUP = {};
if (DB) {
  await ensureSchema(env);
  const out = TP0.TP.buildCatalog(books());
  W.resetCatalogCache();
  const beg = await W.catalogBegin(env, { fp: out.fp, meta: out.meta, stats: out.stats, filename: "test" });
  for (const [t, rows] of Object.entries(out.tables)) for (let i = 0; i < rows.length; i += 50) await W.catalogChunk(env, { import_id: beg.import_id, table: t, rows: JSON.parse(JSON.stringify(rows.slice(i, i + 50))) });
  await W.catalogFinish(env, { import_id: beg.import_id });
  const t = Date.now();
  DB.raw.exec("DELETE FROM experts");
  DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,telegram_chat,created_at) VALUES (1,'هوشمند','هوشمند','7001',1,1,'701',?)").run(t);
  DB.raw.prepare("INSERT INTO ai_agents (expert_id,mode,on_at,updated_at) VALUES (1,'on',?,?)").run(t - 60000, t);
  DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES ('R-3','1405/07/15','پروژهٔ سه')").run();
  DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,deadline_at,created_at) VALUES (3,'R-3',1,5,?,?,?)").run(t, t + 9e8, t);
  DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,code,title,qty,unit,state,assignment_id,norm_json) VALUES (61,'R-3','a',1,'1003','پیچ M10',30,'عدد','open',3,?)")
    .run(JSON.stringify({ v: 2, head: "پیچ", layers: { "اندازه": "M10" }, source: "catalog", code: "1003" }));
  /* دادهٔ تحقیق: پروفایلِ «پیچ» (قرارداد چارچوب، ردهٔ A) و سه کشف‌شده در دو بازار و یک شهرِ دیگر */
  const rec = FX.profiles.find((p) => p.item_head === "پیچ").rec;
  DB.raw.prepare("INSERT INTO cr_heads (head,cluster,ms,rfq_mode,competition_mode,n_wave1,n_max,tier,workflow,rec,version,imported_at) VALUES ('پیچ','C04',?,'FRAMEWORK_CALLOFF','FRAMEWORK_CALLOFF',5,6,'A','ترکیبی',?,'2.0',?)")
    .run(rec.classification.ms, JSON.stringify({ ...rec, cluster_main: "C04" }), t);
  const sup = (sid, name, hub, mob) => DB.raw.prepare("INSERT INTO sreg (sid,kind,name,name_n,hub,role,country,verification,phones,mobiles,data,version,imported_at) VALUES (?,?,?,?,?,?,?,1,?,?,'{}','2.0',?)")
    .run(sid, "new", name, supKey(name), hub, "عمده‌فروش", "ایران", "021-55550000", mob, t);
  sup("NEW-0101", "پیچ‌فروشی امیرکبیر", "امیرکبیر و ناظم‌الاطبا", "09121110101");
  sup("NEW-0102", "پیچ و مهرهٔ لاله‌زار", "لاله‌زار و سعدی", "09121110102");
  sup("NEW-0103", "اتصالات قزوین", "شهر: قزوین", null);
  DB.raw.prepare("INSERT INTO cr_units (unit_key,head,cluster,cands,unit,imported_at) VALUES ('C04|پیچ','پیچ','C04',?,?,?)")
    .run(JSON.stringify([["NEW-0101", 1, 1, "رقیب (رتبهٔ ۱۱ تا ۴۰)", 2, 0.5], ["NEW-0102", 1, 2, "رقیب (رتبهٔ ۱۱ تا ۴۰)", 1.9, 0.4], ["NEW-0103", 0, 3, "رقیب (رتبهٔ ۱۱ تا ۴۰)", 1.5, 0.2]]),
      JSON.stringify({ codes: ["1003"] }), t);
  SUP = { "X-Support-Token": (await call("/support/setup", { body: { pass: "9753" } })).data.token };
}

test("کلیدِ «شمار پیش‌تیک از استراتژی»: فهرستِ تازه با استثنای پشتیبانی (۳) پیش‌تیک می‌خورد", { skip: SKIP }, async () => {
  assert.equal((await call("/support/cr/flags", { method: "PUT", headers: SUP, body: { pretick: true, strategy: true } })).status, 200);
  assert.equal((await call(`/support/strategy/heads/${encodeURIComponent("پیچ")}`, { method: "PUT", headers: SUP, body: { n: { n_wave1: 3, n_max: 4 }, reason: "بازارِ کوچکِ پیچ" } })).status, 200);
  const g = await call("/items/61/picks", { headers: EX });
  assert.equal(g.status, 200, JSON.stringify(g.data));
  assert.equal(g.data.top, 3);
  assert.deepEqual(g.data.list.map((e) => e.on), [true, true, true, false]);
  assert.equal(g.data.cr.family, "special");
  assert.equal(g.data.cr.mode, "FRAMEWORK_CALLOFF");
});

test("«استعلام محتاط را بچین»: یک تأمین‌کنندهٔ فعلی (معتمد) و دو تازه از دو بازار؛ تازه‌ها با شمارهٔ دفتر", { skip: SKIP }, async () => {
  const r = await call("/items/61/picks", { method: "PUT", headers: EX, body: { strategy: { cautious: true } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const on = r.data.list.filter((e) => e.on);
  assert.equal(on.length, 3);
  assert.equal(r.data.strategy.mode, "LIMITED_STAGED");
  assert.equal(r.data.strategy.cautious, true);
  assert.equal(on.filter((e) => e.incumbent).length, 1, "محدود: یک تأمین‌کنندهٔ فعلی");
  assert.equal(on.find((e) => e.incumbent).name, "شرکت ج", "ردهٔ A و خریدِ ۱۴۰۴");
  const fresh = on.filter((e) => e.src === "strategy");
  assert.equal(fresh.length, 2);
  assert.equal(new Set(fresh.map((e) => e.hub)).size, 2, "دو بازارِ جدا");
  assert.ok(fresh.some((e) => (e.found || []).includes("09121110101") || (e.ph || []).includes("09121110101")), "شمارهٔ همراهِ دفتر برای ثبتِ پنل");
  assert.deepEqual(r.data.deviations, []);
});

test("تیکِ متفاوت با برنامه پیش از «🚀 شروع» علت می‌خواهد؛ «دیگر» متن هم", { skip: SKIP }, async () => {
  const L = (await call("/items/61/picks", { headers: EX })).data.list;
  const off = L.find((e) => !e.on && e.src !== "strategy");
  let r = await call("/items/61/picks", { method: "PUT", headers: EX, body: { on: { [off.k]: true } } });
  assert.deepEqual(r.data.deviations, [off.k]);
  const s1 = await call("/items/61/ai-start", { headers: EX, body: {} });
  assert.equal(s1.status, 422);
  assert.deepEqual(s1.data.need_reason, [off.k]);
  assert.equal((await call("/items/61/picks", { method: "PUT", headers: EX, body: { whybox: { [off.k]: "بی‌ربط" } } })).status, 422, "جعبه از فهرست");
  r = await call("/items/61/picks", { method: "PUT", headers: EX, body: { whybox: { [off.k]: "دیگر" } } });
  assert.deepEqual(r.data.deviations, [off.k], "«دیگر» بی متن کافی نیست");
  r = await call("/items/61/picks", { method: "PUT", headers: EX, body: { why: { [off.k]: "تأمین‌کنندهٔ اصلیِ این پروژه است" } } });
  assert.deepEqual(r.data.deviations, []);
  assert.deepEqual(r.data.why_boxes.slice(0, 2), ["معتمد است", "شماره یا فعالیتش نامعتبر است"]);
});

test("دو گزینهٔ ثابتِ «چینش گسترده / محتاط»: هر زدن تیک‌ها را از نو می‌چیند، گزینه در pick_json می‌ماند و رفت‌وبرگشت آزاد است؛ cautious ِ قدیمی هم", { skip: SKIP }, async () => {
  const pj = () => JSON.parse(DB.raw.prepare("SELECT pick_json FROM items WHERE id=61").get().pick_json).strategy;
  const put = (strategy) => call("/items/61/picks", { method: "PUT", headers: EX, body: { strategy } });
  const on = (r) => r.data.list.filter((e) => e.on).map((e) => e.k).sort();
  /* «پیچ» قرارداد چارچوب (ویژه) است: پیشنهادِ سامانه «گسترده» = برنامهٔ پیش‌فرض (با استثنای شمارِ پشتیبانی، ۳) */
  let r = await put({ variant: "broad" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.cr.recommended, "broad");
  assert.deepEqual([r.data.strategy.variant, r.data.strategy.mode, r.data.strategy.cautious], ["broad", "FRAMEWORK_CALLOFF", false]);
  assert.equal(pj().variant, "broad", "گزینه در pick_json");
  assert.deepEqual(r.data.deviations, [], "تیکِ علت‌دارِ پیشین با چینشِ تازه کنار رفت");
  const onB = on(r);
  assert.equal(onB.length, 3);
  /* برگشت به محتاط و دوباره گسترده: هر بار از نو */
  r = await put({ variant: "cautious" });
  assert.deepEqual([r.data.strategy.variant, r.data.strategy.mode, r.data.strategy.cautious, pj().variant], ["cautious", "LIMITED_STAGED", true, "cautious"]);
  const onC = on(r);
  assert.notDeepEqual(onC, onB, "محتاط: یکی در هر بازار، یک تأمین‌کنندهٔ فعلی");
  assert.equal(r.data.list.filter((e) => e.on && e.incumbent).length, 1);
  r = await put({ variant: "broad" });
  assert.deepEqual(on(r), onB);
  assert.equal(pj().variant, "broad");
  assert.equal((await put({ variant: "wide" })).status, 422, "فقط دو گزینه");
  /* پرچمِ قدیمی: cautious: true همان «محتاط»؛ cautious: false برنامهٔ پیش‌فرض (پیشنهادِ سامانه) */
  r = await put({ cautious: true });
  assert.deepEqual([r.data.strategy.variant, r.data.strategy.mode, pj().variant], ["cautious", "LIMITED_STAGED", "cautious"]);
  r = await put({ cautious: false });
  assert.deepEqual([r.data.strategy.variant, r.data.strategy.mode], ["broad", "FRAMEWORK_CALLOFF"]);
  /* نوع قلمی که پیش‌فرضش محتاط است (پشتیبانی «پیچ» را محدود و مرحله‌ای کرده): «گسترده» برنامهٔ حداکثری با شمارِ ردهٔ خودش */
  const H = encodeURIComponent("پیچ");
  assert.equal((await call(`/support/strategy/heads/${H}`, { method: "PUT", headers: SUP, body: { mode: "LIMITED_STAGED", reason: "بازارِ پیچ متمرکز شد" } })).status, 200);
  const pl = (await call(`/cr/plan?head=${H}&code=1003&variant=broad`, { headers: EX })).data;
  assert.deepEqual([pl.policy.mode, pl.forced, pl.recommended], ["BROAD", true, "cautious"]);
  assert.deepEqual([pl.policy.n_wave1, pl.policy.n_max], C.RFQ_N.BROAD[pl.policy.tier], "شمارِ ردهٔ قلم، نه استثنای حالتِ پیش‌فرض");
  r = await put({ variant: "broad" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual([r.data.cr.recommended, r.data.strategy.variant, r.data.strategy.mode, r.data.strategy.family], ["cautious", "broad", "BROAD", "max"]);
  assert.equal(r.data.strategy.n_wave1, pl.policy.n_wave1);
  assert.equal(on(r).length, pl.plan.wave1.length);
  assert.ok(on(r).length > onC.length, "گسترده گیرندهٔ بیشتری از محتاط دارد");
  assert.match(r.data.strategy.why[0], /چینش گسترده/);
  r = await put({ variant: "cautious" });
  assert.deepEqual([r.data.strategy.variant, r.data.strategy.mode], ["cautious", "LIMITED_STAGED"]);
  assert.equal((await call(`/support/strategy/heads/${H}`, { method: "PUT", headers: SUP, body: { clear: ["mode"], reason: "برگشت به تحقیق" } })).status, 200);
  /* آزمون‌های بعد با همان چینشِ محتاطِ «استعلام محتاط را بچین» ادامه می‌دهند */
  r = await put({ variant: "cautious" });
  assert.deepEqual([r.data.strategy.mode, r.data.deviations], ["LIMITED_STAGED", []]);
  assert.deepEqual(on(r), onC);
});

test("«✉️ پیام اول»: پیش‌نمایشِ هر تیک‌خورده (محتاط، بی مقدار، گونه‌های متفاوت)؛ متنِ ممنوع ذخیره نمی‌شود؛ دعوتِ کارشناس هوشمند همان متن", { skip: SKIP }, async () => {
  assert.equal((await call("/items/61/first-msg", { headers: EX })).status, 409, "کلیدِ خاموش");
  await call("/support/cr/flags", { method: "PUT", headers: SUP, body: { firstmsg: true } });
  const g = await call("/items/61/first-msg", { headers: EX });
  assert.equal(g.status, 200, JSON.stringify(g.data));
  assert.equal(g.data.family, "cautious", "استراتژیِ محتاط روی قلم چیده شده");
  assert.equal(g.data.variation, true);
  const rows = g.data.rows;
  assert.ok(rows.length >= 2);
  assert.ok(rows.every((x) => /دستیار هوشمند/.test(x.text) && !/۳۰/.test(x.text)), "دستیارِ هوشمند گفته می‌شود و مقدارِ ۳۰ نه");
  assert.notEqual(rows[0].text, rows[1].text, "دو گیرندهٔ پیاپی متنِ یکسان نمی‌گیرند");
  assert.ok(rows.every((x) => !x.block.length));
  assert.ok(g.data.templates.some((t) => t.key === "std:max:1") && g.data.templates.some((t) => t.key === "std:cautious:2"));
  /* «📚 قالب‌های پیام»: آماده‌های همین خانواده (محتاط) فعال‌اند و بقیه خاموش؛ گونه‌های خودکارِ متن «فرق» نیستند — علتی لازم نیست */
  assert.ok(g.data.templates.filter((t) => t.family === "cautious").every((t) => t.active) && g.data.templates.filter((t) => t.std && t.family !== "cautious").every((t) => !t.active));
  assert.equal(g.data.def_eff, "std:cautious:1");
  assert.ok(rows.every((x) => !x.diff && x.eff === "std:cautious:1"), "همه همان پیش‌فرض‌اند، با گونه‌های متفاوت");
  assert.deepEqual(g.data.missing, []);
  /* متنِ دستیِ یک تأمین‌کننده با نامِ دیگری ← ۴۲۲ */
  const other = rows[1].name;
  const bad = await call("/items/61/first-msg", { method: "PUT", headers: EX, body: { per: { [rows[0].k]: { body: `سلام؛ ${other} هم قیمت داده است.` } } } });
  assert.equal(bad.status, 422);
  assert.ok(bad.data.block.some((x) => x.includes(other)));
  /* گونه‌های متن (تصمیم ۱): خاموش فقط با دلیل؛ بعد همه همان متن، و برگشت */
  assert.equal((await call("/items/61/first-msg", { method: "PUT", headers: EX, body: { variation: false } })).status, 422);
  const vo = await call("/items/61/first-msg", { method: "PUT", headers: EX, body: { variation: false, reason: "همه در یک بازار نیستند" } });
  assert.equal(vo.status, 200, JSON.stringify(vo.data));
  assert.equal(vo.data.var_off.reason, "همه در یک بازار نیستند");
  assert.equal(vo.data.rows[0].text, vo.data.rows[1].text, "متنِ یکسان");
  const von = await call("/items/61/first-msg", { method: "PUT", headers: EX, body: { variation: true } });
  assert.equal(von.data.var_off, null);
  assert.notEqual(von.data.rows[0].text, von.data.rows[1].text);
  /* متنِ دستیِ درست و قالبِ پیش‌فرضِ درخواست — آمادهٔ «گسترده» در درخواستِ محتاط خاموش است: اول روشن، بعد انتخاب‌شدنی */
  assert.equal((await call("/items/61/first-msg", { method: "PUT", headers: EX, body: { def: "std:max:2" } })).status, 422, "قالبِ خاموش انتخاب نمی‌شود");
  const okp = await call("/items/61/first-msg", { method: "PUT", headers: EX, body: { active: { "std:max:2": true }, def: "std:max:2", per: { [rows[0].k]: { body: "سلام؛ قیمتِ پیچ M10 را بفرمایید. پاسخ‌ها را دستیار هوشمند خرید ما می‌دهد." } } } });
  assert.equal(okp.status, 200, JSON.stringify(okp.data));
  assert.equal(okp.data.def, "std:max:2");
  assert.equal(okp.data.rows.find((x) => x.k === rows[0].k).custom, true);
  assert.match(okp.data.rows.find((x) => x.k === rows[0].k).text, /پیچ M10 را بفرمایید/);
  /* قاعدهٔ علت: ردیفِ اول (متنِ دستی) با پیش‌فرض فرق دارد و ردیفِ دوم با برگشت به پیش‌فرض با ردیفِ اول؛ بقیه همان ردیفِ بالایی‌اند */
  assert.deepEqual(okp.data.missing.map((x) => x.k), [rows[0].k, rows[1].k]);
  assert.deepEqual(okp.data.rows.map((x) => x.diff), okp.data.rows.map((_, i) => i < 2));
  /* «🚀 شروع»: کارشناس هوشمند به دو تیک‌خوردهٔ با شمارهٔ پنل همان متنِ پیش‌نمایش را می‌فرستد */
  const want = okp.data.rows.slice(0, 2);
  for (const [i, x] of want.entries()) assert.equal((await call("/sp/x/phones", { headers: EX, body: { supplier_name: x.name, phone: `0912000020${i}`, label: "فروش", panel: true } })).status, 200);
  const pv = await call("/items/61/invite-preview", { headers: EX });
  assert.deepEqual(pv.data.fm_missing.map((x) => x.k), [rows[0].k, rows[1].k], "کادرِ شروع پیش از تأیید می‌گوید");
  const s0 = await call("/items/61/ai-start", { headers: EX, body: {} });
  assert.equal(s0.status, 409, "بی علت سپرده نمی‌شود");
  assert.deepEqual(s0.data.need_fm_why.map((x) => x.k), [rows[0].k, rows[1].k]);
  const w = await call("/items/61/first-msg", { method: "PUT", headers: EX, body: { why: { [rows[0].k]: "تأمین‌کنندهٔ اصلی است و پیامِ کوتاه می‌خواهد", [rows[1].k]: "برگشت به پیام آماده" } } });
  assert.deepEqual(w.data.missing, []);
  assert.equal(w.data.rows[0].why, "تأمین‌کنندهٔ اصلی است و پیامِ کوتاه می‌خواهد");
  const s = await call("/items/61/ai-start", { headers: EX, body: {} });
  assert.equal(s.status, 200, JSON.stringify(s.data));
  assert.ok(await tickUntil(() => threadsOf(3).length >= 2), JSON.stringify(threadsOf(3)));
  for (const x of want) {
    const th = threadsOf(3).find((t) => t.name === x.name);
    assert.ok(th, x.name);
    const first = DB.raw.prepare("SELECT body FROM sp_msgs WHERE thread_id=? AND who='e' AND kind='text' ORDER BY id LIMIT 1").get(th.id);
    assert.equal(first.body, x.text, `متنِ رفته = پیش‌نمایش (${x.name})`);
  }
});

test("سنجشِ افشا: نامِ خودِ گیرنده، نامِ شرکت و عنوانِ قلم نامِ «دیگری» شمرده نمی‌شود — مگر بخشی از نامِ دیگری باشد", () => {
  const items = [{ title: "پیچ M10", qty: 30 }];
  assert.deepEqual(fmCheck("از تونل سد آریانا؛ قیمتِ پیچ M10 برای آهن الف", { otherNames: ["آریانا", "پیچ M10"], items, allow: ["آهن الف", "تونل سد آریانا"] }).block, []);
  assert.equal(fmCheck("آریانا هم قیمت داد", { otherNames: ["آریانا"], items, allow: ["تونل سد آریانا"] }).block.length, 1);
  assert.equal(fmCheck("سلام آهن الف بزرگ", { otherNames: ["آهن الف بزرگ"], items, allow: ["آهن الف"] }).block.length, 1, "نامِ خود بخشی از نامِ دیگری است؛ کنار نمی‌رود");
});
