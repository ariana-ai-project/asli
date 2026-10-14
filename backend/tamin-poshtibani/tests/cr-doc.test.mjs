/* ============================================================
   «📘 سند راهبرد» (فاز ۳ طرح «پیام اول، استراتژی‌ها، پروفایل و گراف»؛ تصمیم‌های ۳، ۴ و ۶)

   با کلیدِ doc: سندِ هر نوع قلم را مدل (P1 بستهٔ «درخواست تغییر ۰۲») یک بار در Cron می‌نویسد ← حالت، شمار و گیرندگان از موتور روی
   خروجی؛ بسته‌ها فقط از گزینه‌های بهترِ کد؛ پاسخِ آمادهٔ افشاگر نشان‌دار ← «🚀 شروع» تا تأییدِ کارشناس معلق ← بازبینی (۱ تا ۳
   توضیح و جعبهٔ راهبرد)، تأیید، ویرایش یا سازندهٔ پارامتری ← نسخهٔ نهایی و عددهای درونیِ قلم در زمینهٔ مذاکره ← پیش‌ساختِ نوع
   قلم‌های پرهزینه. کلید خاموش ← رفتارِ امروز.
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
import * as SP from "../../../worker/sp-core.js";
import { supKey, crShard } from "../../../worker/cr-data.js";
import { packageOptions, docInput, crDocTick, docNumbers, docBlock, normalizeDoc, DOC_API_SCHEMA } from "../../../worker/strategy-doc.js";
import { KB, STATES } from "../../../worker/strategy/kb-data.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FX = JSON.parse(gunzipSync(readFileSync(resolve(HERE, "fixtures/cr02-parity.json.gz"))).toString("utf8"));
const TP0 = loadTP();
const XL = TP0.XLSX;
const book = (sheets) => { const wb = XL.utils.book_new(); for (const [n, aoa] of Object.entries(sheets)) XL.utils.book_append_sheet(wb, XL.utils.aoa_to_sheet(aoa), n); return wb; };
const ITEM_HEAD = ["کد قلم", "عنوان قلم", "نوع قلم", "واحد مرجع", "کد خوشه", "کد طبقهٔ اصناف", "باقیماندهٔ متن", "اندازه", "جنس", "ویژگی‌ها (JSON)"];
const H = ["شماره", "تاریخ سفارش", "وضعیت", "کارشناس خرید", "کد قلم خریدنی", "عنوان قلم خریدنی", "مقدار", "واحد سنجش", "مبلغ به ارز عملیاتی", "تامین کننده", "کد", "رده", "ماه", "فصل", "سال"];
let NO = 0;
const buy = (code, title, qty, supplier, grade, date = "1404/10/01") => { NO++; return [String(NO), date, "بسته شده", "ک", code, title, qty, "عدد", qty * 1000, supplier, grade ? 600 + NO : null, grade, +date.slice(5, 7), "زمستان", date.slice(0, 4)]; };
const books = () => ({
  items: book({ items: [ITEM_HEAD, ["1003", "پیچ M10", "پیچ", "عدد", "C04", "200", "", "M10", "", JSON.stringify({ "اندازه": "M10" })]],
    item_attributes: [["کد قلم", "نوع قلم", "نام لایهٔ ویژگی", "نام لایه (انگلیسی)", "مقدار لایه"], ["x", "x", "اندازه", "size", "x"]] }),
  indices: book({ class_index: [["کد سرگروه اصناف", "سرگروه اصناف", "کد طبقهٔ اصناف", "طبقهٔ اصناف", "کد شاخص"], ["20", "قطعات", "200", "اتصالات", "IDX_A"]],
    index_quarterly: [["کد شاخص", "دوره", "سال", "شمارهٔ فصل", "نام فصل", "شاخص (زمستان ۱۴۰۴ = ۱۰۰)"], ["IDX_A", "1404Q4", 1404, 4, "زمستان", 100]] }),
  units: book({ head_rates: [["نوع قلم", "واحد ثبت‌شده", "واحد مرجع", "نرخ تبدیل به واحد مرجع", "مبنای نرخ", "اطمینان"]],
    cluster_rates: [["کد خوشه", "نام خوشه", "نوع قلم", "واحد ثبت‌شده", "واحد مرجع", "نرخ تبدیل به واحد مرجع", "مبنای نرخ", "اطمینان"]],
    item_rates: [["کد قلم", "عنوان قلم", "نوع قلم", "واحد ثبت‌شده", "واحد مرجع", "نرخ تبدیل به واحد مرجع", "مبنای نرخ", "منشأ"]] }),
  history: book({ "حداکثر 500000 رکورد": [H, buy("1003", "پیچ M10", 90, "شرکت ج", "A"), buy("1003", "پیچ M10", 80, "شرکت د", "C")] }),
});

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = { DB, MANAGER_CODE: "1234", TG_BOT_TOKEN: "tok", TG_SP_BOT_TOKEN: "sptok", TG_WEBHOOK_SECRET: "sec", TG_API_BASE: "https://tg.test/bot",
  SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_KEY: "svc", ANTHROPIC_API_KEY: "k", ANTHROPIC_API_BASE: "https://ai.test", SITE_ORIGIN: "https://site.test", TG_IGNORE_HOURS: "1" };
const EX = { "X-Expert-Code": "7001" };
const R = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const usage = { input_tokens: 30000, output_tokens: 5000 };
const out = (o) => ({ model: "claude-opus-5-5", stop_reason: "end_turn", usage, content: [{ type: "text", text: JSON.stringify(o) }] });
/* سندِ مدل: یک بستهٔ بدتر و یک شناسهٔ ناشناخته که باید بیفتند؛ یک پاسخِ آمادهٔ افشاگر */
const DOC_OUT = {
  summary_fa: "بازارِ پیچ رقابتی است؛ استعلامِ استاندارد از پنج گیرنده؛ لنگرِ پنج درصد زیرِ مرجع با سه دور.",
  market_view: { key_facts: ["تأمین‌کنندگانِ زیاد در بازارِ امیرکبیر"] },
  rfq: { distribution_explained: ["از دو بازار"], anti_leak_measures: [], timing: "هم‌زمان", quote_fields: [], spec_clarification: [], why: ["بازارِ رقابتی"] },
  negotiation: { anchor_rule: "هدف = مرجع × (۱ − ۵٪)", reservation_rule: "حد = مرجع × (۱ + ۳٪)", parallel_with: 2,
    packages: [{ option_id: "pay2_half", description_fa: "پرداختِ دو ماهه با نیمِ نرخِ پنل" }, { option_id: "pay1_full", description_fa: "بدتر — باید بیفتد" }, { option_id: "x", description_fa: "ناشناخته" }],
    hard_constraints: ["گواهی کیفیت"] },
  anticipated_states: [{ state_id: "ST-N01", move: "M-PACKAGE", prepared_reply_fa: "اگر پرداخت دو ماهه باشد چه پیشنهادی دارید؟" },
    { state_id: "ST-N02", move: "M-COUNTER", prepared_reply_fa: "قیمت مرجع ما کمتر است؛ لطفاً تجدیدنظر کنید." },
    { state_id: "ST-X99", move: "M-ASK", prepared_reply_fa: "ناشناخته" }],
  runtime_states: [], risks: [{ risk: "هم‌پاساژی", control: "پخش در دو بازار" }], expert_questions: ["Q12", "بی‌ربط"], needs_approval: ["گیرندگان"], sources: ["MS-1"], notes_for_buyer: "",
};
const calls = [];
let negReply = () => out({ reply: "سلام؛ ممنون از پیشنهادتان.", actions: [], thread_status: "active", memo: "یادداشت.", note: "", ask_expert: "" });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.startsWith("https://tg.test/bot")) return R({ ok: true, result: u.endsWith("getMe") ? { id: 77, username: "AriaSupplierBot" } : { message_id: 1 } });
  if (u.startsWith("https://sb.test/")) return (init.method || "GET") === "GET" ? new Response("nf", { status: 404 }) : R({ Key: "x" });
  if (u.startsWith("https://ai.test/")) {
    const b = JSON.parse(init.body);
    const sys = (b.system || []).map((x) => x.text).join("");
    const isDoc = /برنامه‌ریز راهبرد استعلام و مذاکره/.test(sys);
    calls.push({ kind: isDoc ? "doc" : "neg", body: b });
    return R(isDoc ? out(DOC_OUT) : negReply(b));
  }
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
const head = encodeURIComponent("پیچ");
let SUP = {};
const REC = (() => {
  const base = FX.profiles.find((p) => p.item_head === "پیچ").rec;
  return { ...base, cluster_main: "C04", item_head: "پیچ",
    negotiation_defaults: { weights: { price: 0.45, payment: 0.2, delivery: 0.15, condition: 0.05, quality: 0.15 }, hard_constraints: ["گواهی کیفیت"],
      tradeable_issues: ["قیمت", "زمان پرداخت (نرخ ماهانهٔ پنل)", "زمان تحویل"], watch_states: ["ST-N03", "ST-Q05"] },
    kb_cards: ["S-04", "T-01", "K-06"], expert_review: { questions_first: ["Q12"] } };
})();

if (DB) {
  await ensureSchema(env);
  const o = TP0.TP.buildCatalog(books());
  W.resetCatalogCache();
  const beg = await W.catalogBegin(env, { fp: o.fp, meta: o.meta, stats: o.stats, filename: "test" });
  for (const [t, rows] of Object.entries(o.tables)) for (let i = 0; i < rows.length; i += 50) await W.catalogChunk(env, { import_id: beg.import_id, table: t, rows: JSON.parse(JSON.stringify(rows.slice(i, i + 50))) });
  await W.catalogFinish(env, { import_id: beg.import_id });
  const t = Date.now();
  DB.raw.exec("DELETE FROM experts");
  DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,telegram_chat,created_at) VALUES (1,'هوشمند','هوشمند','7001',1,1,'701',?)").run(t);
  DB.raw.prepare("INSERT INTO ai_agents (expert_id,mode,on_at,updated_at) VALUES (1,'on',?,?)").run(t - 60000, t);
  DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES ('R-D','1405/07/22','پروژهٔ سند')").run();
  DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,deadline_at,created_at) VALUES (1,'R-D',1,5,?,?,?)").run(t, t + 9e8, t);
  DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,code,title,qty,unit,state,assignment_id,norm_json) VALUES (61,'R-D','a',1,'1003','پیچ M10',30,'عدد','open',1,?)")
    .run(JSON.stringify({ v: 2, head: "پیچ", layers: { "اندازه": "M10" }, source: "catalog", code: "1003" }));
  const ins = DB.raw.prepare("INSERT INTO cr_heads (head,cluster,ms,rfq_mode,competition_mode,n_wave1,n_max,tier,workflow,spend_rank,rec,version,imported_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,'2.0',?)");
  ins.run("پیچ", "C04", REC.classification.ms, "STANDARD", "STANDARD", 5, 6, "A", "ترکیبی", 500, JSON.stringify(REC), t);
  ins.run("مهره", "C04", REC.classification.ms, "STANDARD", "STANDARD", 5, 6, "A", "ترکیبی", 3, JSON.stringify({ ...REC, item_head: "مهره" }), t);
  DB.raw.prepare("INSERT INTO sreg (sid,kind,name,name_n,hub,role,country,verification,phones,mobiles,data,version,imported_at) VALUES ('NEW-1','new','پیچ‌فروشی امیرکبیر',?,'امیرکبیر','عمده‌فروش','ایران',1,NULL,'09121110101','{}','2.0',?)")
    .run(supKey("پیچ‌فروشی امیرکبیر"), t);
  DB.raw.prepare("INSERT INTO cr_units (unit_key,head,cluster,cands,unit,imported_at) VALUES ('C04|پیچ','پیچ','C04',?,?,?)").run(JSON.stringify([["NEW-1", 1, 1, "رقیب", 2, 0.5]]), JSON.stringify({ codes: ["1003"] }), t);
  DB.raw.prepare("INSERT INTO cr_prices (shard,data) VALUES (?,?)").run(crShard("1003"), JSON.stringify({ "1003": [{ u: "عدد", m24: 50000, m: 48000, q: "خوب" }] }));
  SUP = { "X-Support-Token": (await call("/support/setup", { body: { pass: "9753" } })).data.token };
}

test("گزینه‌های معاوضه با قیمتِ مؤثر؛ طرح‌وارهٔ API فقط بخش‌های متنی (بی پایگاه داده)", () => {
  const p = packageOptions({ panel_rate: 0.03, vat_rate: 0.1 });
  const o = Object.fromEntries(p.options.map((x) => [x.option_id, x]));
  assert.equal(o.pay2_half.better, true, "پرداختِ دیرتر با نیمِ نرخ ارزان‌تر است");
  assert.equal(o.pay1_full.better, false, "با تمامِ نرخ برابر");
  assert.ok(!o.noinv_d5, "بی صورتحساب گزینهٔ معاوضه نیست");
  assert.equal(packageOptions({ panel_rate: null }).options.find((x) => x.option_id === "pay2_half").better, false, "بی نرخِ پنل، پرداختِ دیرتر سودی ندارد");
  assert.ok(!("n_wave1" in DOC_API_SCHEMA.properties.rfq.properties), "شمارِ گیرنده را مدل نمی‌نویسد");
  assert.ok(KB["S-04"] && STATES["ST-N01"]);
});

test("ورودیِ P1 از موتور: سیاست، گیرندگان، وضعیت‌ها و کارت‌ها؛ خروجیِ مدل با عددهای موتور یکی می‌شود", { skip: SKIP }, async () => {
  const di = await docInput(env, "پیچ", { itemCode: "1003" });
  assert.equal(di.head, "پیچ");
  assert.deepEqual(Object.keys(di.input), ["item_profile", "request", "settings", "engine", "states", "kb"]);
  assert.ok(["ST-N03", "ST-Q05", "ST-N01", "ST-N02", "ST-N06", "ST-N16"].every((s) => di.input.states[s]), "وضعیت‌های زیرِ نظر + همیشگی");
  assert.deepEqual(di.input.kb.slice(0, 3), ["S-04", "T-01", "K-06"]);
  assert.equal(di.input.engine.reference_price, null, "سندِ ثابت: عددِ ریالی نه");
  assert.equal((await docInput(env, "پیچ", { itemCode: "1003" })).sha, di.sha, "ورودیِ یکسان، اثرِ یکسان");
  const doc = normalizeDoc(DOC_OUT, di.input);
  assert.equal(doc.rfq.n_wave1, di.input.engine.rfq_policy.n_wave1);
  assert.deepEqual(doc.negotiation.packages.map((x) => x.option_id), [], "بی نرخِ پنل هیچ بستهٔ پرداختِ دیرتری بهتر نیست");
  assert.equal(doc.negotiation.internal_reservation, null);
  assert.deepEqual(doc.anticipated_states.map((s) => s.state_id), ["ST-N01", "ST-N02"]);
  assert.ok(doc.anticipated_states[1].blocked && doc.anticipated_states[1].blocked.some((v) => /قیمت مرجع/.test(v)), "پاسخِ افشاگر نشان‌دار");
  assert.deepEqual(doc.expert_questions, ["Q12"]);
});

test("کلیدِ doc: «🚀 شروع» تا تأییدِ سند معلق؛ Cron سند را می‌سازد؛ بازبینی با امتیاز و جعبه؛ بعد شروع", { skip: SKIP }, async () => {
  assert.equal((await call(`/cr/doc?head=${head}&code=1003`, { headers: EX })).status, 409, "کلید خاموش");
  assert.equal((await call("/support/cr/flags", { method: "PUT", headers: SUP, body: { doc: true } })).status, 200);
  assert.equal((await call("/support/cr/panel", { method: "PUT", headers: SUP, body: { panel_rate: 0.03, model: "claude-opus-5-5" } })).status, 200);
  const v0 = await call(`/cr/doc?head=${head}&code=1003`, { headers: EX });
  assert.deepEqual([v0.status, v0.data.available, v0.data.latest], [200, true, null]);
  assert.equal(v0.data.numbers.ref, 50000);
  assert.ok(v0.data.numbers.target < 50000 && v0.data.numbers.reservation > 50000 && v0.data.numbers.offers.length === v0.data.numbers.rounds);
  /* فهرستِ دعوت و «🚀 شروع» */
  assert.equal((await call("/items/61/picks", { headers: EX })).status, 200);
  assert.equal((await call("/items/61/picks", { method: "PUT", headers: EX, body: { add: [{ name: "پیچ‌سازان", src: "manual" }] } })).status, 200);
  assert.equal((await call("/sp/x/phones", { headers: EX, body: { supplier_name: "پیچ‌سازان", phone: "09120000901", label: "فروش", panel: true } })).status, 200);
  const s0 = await call("/items/61/ai-start", { headers: EX, body: {} });
  assert.equal(s0.status, 409);
  assert.deepEqual([s0.data.need_doc, s0.data.doc_state], [true, "queued"], "در صفِ ساخت");
  /* Cron: ساخت با مدل */
  const r = await crDocTick(env);
  assert.equal(r.state, "draft", JSON.stringify(r));
  assert.ok(r.cost > 0);
  const docCall = calls.find((c) => c.kind === "doc");
  assert.equal(docCall.body.model, "claude-opus-5-5");
  assert.match(docCall.body.messages[0].content[0].text, /<engine>[\s\S]*package_options[\s\S]*<kb>\n### S-04/);
  assert.ok(DB.raw.prepare("SELECT 1 AS x FROM ai_calls WHERE purpose='doc'").get());
  const v1 = await call(`/cr/doc?head=${head}&code=1003`, { headers: EX });
  assert.equal(v1.data.latest.state, "draft");
  assert.deepEqual(v1.data.latest.doc.negotiation.packages.map((x) => x.option_id), ["pay2_half"], "با نرخِ پنل: فقط بستهٔ بهتر");
  const id = v1.data.latest.id;
  assert.equal((await call("/items/61/ai-start", { headers: EX, body: {} })).data.doc_state, "draft");
  /* بازبینی: ۱ تا ۳ توضیح و جعبهٔ راهبرد */
  const b1 = await call(`/cr/doc/${id}/review`, { headers: EX, body: { action: "approve", score: 2 } });
  assert.equal(b1.status, 422);
  const b2 = await call(`/cr/doc/${id}/review`, { headers: EX, body: { action: "approve", score: 2, note: "بسته‌ها کم است" } });
  assert.equal(b2.data.need_boxes, true);
  const ok = await call(`/cr/doc/${id}/review`, { headers: EX, body: { action: "edit", score: 3, note: "بسته‌ها کم است", boxes: ["s_packages"],
    edit: { summary_fa: "خلاصهٔ ویرایش‌شدهٔ کارشناس.", replies: [{ state_id: "ST-N02", prepared_reply_fa: "ممنون؛ اگر امکانِ تخفیف هست بفرمایید." }] } } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.state, "approved");
  assert.equal(ok.data.final.summary_fa, "خلاصهٔ ویرایش‌شدهٔ کارشناس.");
  assert.ok(!ok.data.final.anticipated_states.find((s) => s.state_id === "ST-N02").blocked, "پاسخِ ویرایش‌شده پاک است");
  assert.equal(ok.data.doc.summary_fa, DOC_OUT.summary_fa, "نسخهٔ اولِ مدل می‌ماند");
  const fb = DB.raw.prepare("SELECT stars, boxes, outcome FROM ai_feedback WHERE kind='doc' AND ref=?").get(id);
  assert.deepEqual({ ...fb }, { stars: 3, boxes: '["s_packages"]', outcome: "no" });
  /* حالا «🚀 شروع» */
  const s1 = await call("/items/61/ai-start", { headers: EX, body: {} });
  assert.equal(s1.status, 200, JSON.stringify(s1.data));
});

test("زمینهٔ مذاکره: سندِ تأییدشده و عددهای درونیِ قلم در پروندهٔ مدل", { skip: SKIP }, async () => {
  const blk = await docBlock(env, [{ head: "پیچ", code: "1003", title: "پیچ M10" }]);
  assert.match(blk, /^<strategy_doc>/);
  assert.match(blk, /خلاصهٔ ویرایش‌شدهٔ کارشناس/);
  assert.match(blk, /\[درونی — هرگز به تأمین‌کننده نگو\] قیمت مرجع 50000، هدف \d+، حد \d+/);
  for (let i = 0; i < 8 && !DB.raw.prepare("SELECT 1 AS x FROM ai_threads").get(); i++) { DB.raw.prepare("UPDATE ai_runs SET next_at=0").run(); await aiTick(env); }
  const th = DB.raw.prepare("SELECT thread_id FROM ai_threads").get().thread_id;
  const ph = DB.raw.prepare("SELECT id FROM sp_phones WHERE phone='09120000901'").get();
  const H = { "X-SP-Session": await SP.newSession(env, ph.id, "web") };
  const before = calls.length;
  assert.equal((await call(`/sp/thread/${th}/msg`, { headers: H, body: { text: "سلام، قیمت پیچ M10 عددی ۵۲ هزار ریال." } })).status, 200);
  const neg = calls.slice(before).find((c) => c.kind === "neg");
  assert.ok(neg, "دورِ مذاکره");
  assert.match(neg.body.messages[0].content[0].text, /<strategy_doc>[\s\S]*خلاصهٔ ویرایش‌شدهٔ کارشناس[\s\S]*هدف \d+/);
});

test("سازندهٔ پارامتری: وزن‌ها با جمعِ ۱۰۰ و بازه‌ها؛ سندِ پارامتری تأییدشده — و پیش‌ساختِ پرهزینه‌ها در Cron", { skip: SKIP }, async () => {
  const v = await call(`/cr/doc?head=${encodeURIComponent("مهره")}`, { headers: EX });
  assert.equal(v.data.latest, null);
  const b = await call("/cr/doc/build", { headers: EX, body: { head: "مهره" } });
  assert.equal(b.data.queued, true);
  const id = b.data.doc.id;
  const params = { weights: { price: 40, payment: 25, delivery: 15, condition: 5, quality: 10 }, target_vs_ref: -0.04, rv_tol: 0.03, rounds: 3, max_pay_months: 2, pace: "patient", others: "better_only" };
  assert.equal((await call(`/cr/doc/${id}/review`, { headers: EX, body: { action: "builder", params } })).status, 422, "جمعِ وزن‌ها ۹۵");
  const ok = await call(`/cr/doc/${id}/review`, { headers: EX, body: { action: "builder", params: { ...params, weights: { ...params.weights, quality: 15 }, tradeables: ["زمان تحویل", "بی‌ربط"] } } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.deepEqual([ok.data.state, ok.data.source], ["approved", "builder"]);
  assert.equal(ok.data.final.negotiation.concession_c, 0.3, "آهنگِ شکیبا");
  assert.deepEqual(ok.data.final.builder.tradeables, ["زمان تحویل"]);
  assert.equal(await crDocTick(env).then((r) => r && r.idle), true, "پرهزینه‌ها (رتبهٔ ۳) سند دارند");
  /* پشتیبانی: وضعیتِ سند در فهرستِ نوع قلم‌ها و پیشرفتِ پیش‌ساخت */
  const hl = await call(`/support/strategy/heads?q=${encodeURIComponent("مهره")}`, { headers: SUP });
  assert.equal(hl.data.docs["مهره"].state, "approved");
  const pn = await call("/support/cr/panel", { headers: SUP });
  assert.deepEqual([pn.data.panel.panel_rate, pn.data.model, pn.data.progress.target], [0.03, "claude-opus-5-5", 1]);
});

test("Cron پیش‌ساخت: نوع قلمِ پرهزینهٔ بی سند ساخته می‌شود؛ کلید خاموش هیچ", { skip: SKIP }, async () => {
  assert.equal(JSON.parse(DB.raw.prepare("SELECT v FROM cr_cache WHERE k='docPregen'").get().v).done, true, "پیش‌ساخت تمام: Cron دیگر cr_heads را نمی‌خواند");
  DB.raw.prepare("DELETE FROM cr_docs WHERE head='مهره'").run();
  DB.raw.prepare("DELETE FROM cr_cache WHERE k='docPregen'").run();
  const r = await crDocTick(env);
  assert.equal(r.state, "draft", JSON.stringify(r));
  assert.equal(DB.raw.prepare("SELECT by FROM cr_docs WHERE head='مهره'").get().by, "پیش‌ساخت");
  assert.equal((await call("/support/cr/flags", { method: "PUT", headers: SUP, body: { doc: false } })).status, 200);
  assert.equal(await crDocTick(env), null);
  assert.equal(await docBlock(env, [{ head: "پیچ", code: "1003", title: "پیچ M10" }]), "", "کلید خاموش: پروندهٔ امروز");
  const nums = await docNumbers(env, "پیچ", "1003");
  assert.equal(nums.status, "OK");
});
