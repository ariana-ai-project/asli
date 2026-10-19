/* ============================================================
   «🧭 مذاکرهٔ کارشناس هوشمند» در مکاتبات و «📘 سند راهبرد»ِ فقط‌خواندنی پس از «🚀 شروع» (مهر ۱۴۰۵، درخواست مالک: «نمایشِ استراتژی
   مذاکره و استراتژی استعلام چه شد؟»)

   روی SQLite واقعی (همان طرحِ ensureSchema) با مدلِ بدلیِ دو گامِ مذاکره (همان cr-turn): سندِ پارامتریِ تأییدشده ← «🚀 شروع» (doc_ro و
   GET /cr/doc بی ساختنِ نسخهٔ تازه) ← پیامِ تأمین‌کننده و مذاکرهٔ دوگامی ← کلیدِ neg در گفت‌وگوی کارشناس: دورِ n از ۵، آخرین حرکت و
   وضعیت‌ها، پیشنهادِ ما و تأمین‌کننده، هدف و حدِ همان برنامهٔ موتور (قاعده‌های سند و بهترین پیشنهادِ دیگران)، سند، یادداشت و
   واقعیت‌ها؛ امضای نظرسنجی و مسیرِ تازه‌سازی؛ تأمین‌کننده (گفت‌وگو، نظرسنجی، مسیرِ کارشناس، /cr/doc) هیچ‌کدام را نمی‌گیرد و
   کارشناسِ دیگر ۴۰۳؛ مذاکرهٔ همیشگی عددهای سند را نشان می‌دهد و با کلیدِ doc خاموش هیچ. کارتِ صفحه (strategy-view.js) در سندباکس.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import vm from "node:vm";
import { loadTP, sqliteD1 } from "./run.mjs";
import * as W from "../../../worker/catalog.js";
import { ensureSchema, route } from "../../../worker/api.js";
import { aiTick } from "../../../worker/ai-agent.js";
import * as SP from "../../../worker/sp-core.js";
import { supKey, crShard } from "../../../worker/cr-data.js";
import { negView, negSig, NEG_SIG_SQL, NEG_STATE_FA } from "../../../worker/neg-view.js";
import { applyRules, docBlock } from "../../../worker/strategy-doc.js";
import { planNegotiation } from "../../../worker/strategy/negotiation.js";
import { URGENT_RV_EXTRA } from "../../../worker/strategy/config.js";
import { STATES } from "../../../worker/strategy/kb-data.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONT = resolve(HERE, "../../../frontend/tamin-poshtibani");
const FX = JSON.parse(gunzipSync(readFileSync(resolve(HERE, "fixtures/cr02-parity.json.gz"))).toString("utf8"));
const TP0 = loadTP();
const XL = TP0.XLSX;
const book = (sheets) => { const wb = XL.utils.book_new(); for (const [n, aoa] of Object.entries(sheets)) XL.utils.book_append_sheet(wb, XL.utils.aoa_to_sheet(aoa), n); return wb; };
const ITEM_HEAD = ["کد قلم", "عنوان قلم", "نوع قلم", "واحد مرجع", "کد خوشه", "کد طبقهٔ اصناف", "باقیماندهٔ متن", "اندازه", "جنس", "ویژگی‌ها (JSON)"];
const H = ["شماره", "تاریخ سفارش", "وضعیت", "کارشناس خرید", "کد قلم خریدنی", "عنوان قلم خریدنی", "مقدار", "واحد سنجش", "مبلغ به ارز عملیاتی", "تامین کننده", "کد", "گرید", "ماه", "فصل", "سال"];
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

/* plans: نقشهٔ اجرای هر دستور (EXPLAIN QUERY PLAN) — کارت و امضای نظرسنجی هیچ جدولِ بزرگی را کامل نمی‌خوانند (d1-budget.test.mjs) */
const DB = await sqliteD1({ plans: true });
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = { DB, MANAGER_CODE: "1234", TG_BOT_TOKEN: "tok", TG_SP_BOT_TOKEN: "sptok", TG_WEBHOOK_SECRET: "sec", TG_API_BASE: "https://tg.test/bot",
  SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_KEY: "svc", ANTHROPIC_API_KEY: "k", ANTHROPIC_API_BASE: "https://ai.test", SITE_ORIGIN: "https://site.test", TG_IGNORE_HOURS: "1" };
const EX = { "X-Expert-Code": "7001" }, EX2 = { "X-Expert-Code": "7002" };
const R = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const usage = { input_tokens: 9000, output_tokens: 600 };
const out = (o, model) => ({ model, stop_reason: "end_turn", usage, content: [{ type: "text", text: JSON.stringify(o) }] });

/* خروجی‌های ساختگیِ دو گام — همان طرح‌وارهٔ بی null (cr-turn.test.mjs) */
const EX0 = { unit_price: 0, currency_as_stated: "نامعلوم", unit: "", qty: 0, vat_included: "نامعلوم", official_invoice: "نامعلوم", payment_method: "نامعلوم", pay_months: 0, prepay_share: 0,
  delivery_days: 0, delivery_place: "", validity_hours: 0, brand: "", origin_country: "", genuine_or_equivalent: "نامعلوم", condition_accepted: "نامعلوم", moq: 0, partial_qty: 0,
  mentions_others: false, threat: false, asks_commitment: false };
const cls = (states, ex = {}) => ({ states, extracted: { ...EX0, ...ex }, notes_for_buyer: "" });
const TURN0 = { state_ids: [], move: "M-COUNTER", offer: { unit_price: 0, pay_months: 0, payment_method: "", delivery_days: 0, qty: 0, other_terms: "", package_ref: "" },
  message_fa: "", facts_used: [], new_facts: [], needs_human: false, escalation_reason: "", notes_for_buyer: "" };
const turnOut = (o) => ({ ...TURN0, ...o, offer: { ...TURN0.offer, ...(o.offer || {}) } });
const userText = (b) => b.messages[0].content[0].text;
const block = (b, tag) => { const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(userText(b)); return m ? JSON.parse(m[1]) : null; };
const fmt = (n) => Number(n).toLocaleString("en-US");
const counter = (b) => { const e = block(b, "engine"); return turnOut({ move: "M-COUNTER", offer: { unit_price: e.next_offer_nominal },
  message_fa: `ممنون از پیشنهادتون. برای این قلم عددی ${fmt(e.next_offer_nominal)} ریال پیشنهاد می‌دیم؛ اگه موافقید در پنل ثبت کنید.`,
  new_facts: [{ type: "شرط پرداخت", value: "پیچ‌سازان فقط نقد می‌فروشد", usable_elsewhere: true }] }); };
let p3Out = () => cls([{ id: "ST-N04", confidence: 0.7, evidence: "نقد" }], { unit_price: 52000, currency_as_stated: "ریال", unit: "عدد", payment_method: "نقد" });
let p4Out = counter;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.startsWith("https://tg.test/bot")) return R({ ok: true, result: u.endsWith("getMe") ? { id: 77, username: "AriaSupplierBot" } : { message_id: 1 } });
  if (u.startsWith("https://sb.test/")) return (init.method || "GET") === "GET" ? new Response("nf", { status: 404 }) : R({ Key: "x" });
  if (u.startsWith("https://ai.test/")) {
    const b = JSON.parse(init.body);
    const sys = (b.system || []).map((x) => x.text).join("");
    if (/^# P3/.test(sys)) return R(out(p3Out(b), b.model));
    if (/# P4 — مذاکره‌گر/.test(sys)) return R(out(p4Out(b), b.model));
    return R(out({ reply: "سلام؛ ممنون از پیامتان.", actions: [], thread_status: "active", memo: "یادداشتِ مذاکرهٔ همیشگی.", note: "", ask_expert: "" }, "claude-opus-5-5"));
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
  return { status: res.status, data, text };
}
const REC = (() => {
  const base = FX.profiles.find((p) => p.item_head === "پیچ").rec;
  return { ...base, cluster_main: "C04", item_head: "پیچ",
    negotiation_defaults: { weights: { price: 0.45, payment: 0.2, delivery: 0.15, condition: 0.05, quality: 0.15 }, hard_constraints: ["گواهی کیفیت"],
      tradeable_issues: ["قیمت", "زمان پرداخت (نرخ ماهانهٔ پنل)", "زمان تحویل"], watch_states: ["ST-N03", "ST-Q05"] },
    kb_cards: ["S-04", "T-01", "K-06"] };
})();
let SUP = {};

if (DB) {
  await ensureSchema(env);
  const o = TP0.TP.buildCatalog(books());
  W.resetCatalogCache();
  const beg = await W.catalogBegin(env, { fp: o.fp, meta: o.meta, stats: o.stats, filename: "test" });
  for (const [t, rows] of Object.entries(o.tables)) for (let i = 0; i < rows.length; i += 50) await W.catalogChunk(env, { import_id: beg.import_id, table: t, rows: JSON.parse(JSON.stringify(rows.slice(i, i + 50))) });
  await W.catalogFinish(env, { import_id: beg.import_id });
  const t = Date.now();
  DB.raw.exec("DELETE FROM experts");
  const ex = DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,telegram_chat,created_at,sup_json) VALUES (?,?,?,?,1,1,?,?,?)");
  ex.run(1, "هوشمند", "هوشمند", "7001", "701", t, '{"mode":"auto"}');
  ex.run(2, "دیگری", "دیگری", "7002", null, t, null);
  DB.raw.prepare("INSERT INTO ai_agents (expert_id,mode,on_at,updated_at) VALUES (1,'on',?,?)").run(t - 60000, t);
  DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES ('R-N','1405/07/27','پروژهٔ تونل البرز')").run();
  DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,deadline_at,created_at) VALUES (1,'R-N',1,5,?,?,?)").run(t, t + 9e8, t);
  DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,code,title,qty,unit,state,assignment_id,norm_json) VALUES (61,'R-N','a',1,'1003','پیچ M10',30,'عدد','open',1,?)")
    .run(JSON.stringify({ v: 2, head: "پیچ", layers: { "اندازه": "M10" }, source: "catalog", code: "1003" }));
  DB.raw.prepare("INSERT INTO cr_heads (head,cluster,ms,rfq_mode,competition_mode,n_wave1,n_max,tier,workflow,spend_rank,rec,version,imported_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,'2.0',?)")
    .run("پیچ", "C04", REC.classification.ms, "STANDARD", "STANDARD", 5, 6, "A", "ترکیبی", 500, JSON.stringify(REC), t);
  DB.raw.prepare("INSERT INTO cr_prices (shard,data) VALUES (?,?)").run(crShard("1003"), JSON.stringify({ "1003": [{ u: "عدد", m24: 50000, m: 48000, q: "خوب" }] }));
  /* پیشنهادِ واقعیِ تأمین‌کنندهٔ دیگر در پنل (BATNA): ۴۹ هزار، رسمی، بی ارزش افزوده، نقد */
  DB.raw.prepare("INSERT INTO sp_suppliers (id,name,name_n,created_at) VALUES (900,'آهن‌آلات رقیب',?,?)").run(supKey("آهن‌آلات رقیب"), t);
  DB.raw.prepare("INSERT INTO sp_threads (id,assignment_id,request_id,supplier_id,last_at,created_at) VALUES (900,1,'R-N',900,?,?)").run(t, t);
  DB.raw.prepare("INSERT INTO sp_bundles (id,thread_id,line_ids,state,terms_json,created_at) VALUES (900,900,'[900]','pending',?,?)").run(JSON.stringify({ invoice: "رسمی", vat: "ندارد", pay: "نقدی" }), t);
  DB.raw.prepare("INSERT INTO sp_lines (id,thread_id,item_id,title,qty,unit,price,state,bundle_id,created_at,updated_at) VALUES (900,900,61,'پیچ M10',30,'عدد',49000,'submitted',900,?,?)").run(t, t);
  SUP = { "X-Support-Token": (await call("/support/setup", { body: { pass: "9753" } })).data.token };
}

/* صفحه: shared.js، help-content.js و strategy-view.js در سندباکس، با ui.js بدلی («؟» و «≡ جزئیات» با همهٔ زبانه‌ها باز) */
function loadSV() {
  const sb = { console, Date, Math, JSON, Intl, setTimeout, clearTimeout };
  sb.window = sb; sb.self = sb; sb.globalThis = sb;
  sb.document = { getElementById: () => null, createElement: () => ({ style: {} }), head: { appendChild() {} }, body: { appendChild() {} }, addEventListener() {} };
  vm.createContext(sb);
  for (const f of ["shared.js", "help-content.js"]) vm.runInContext(readFileSync(resolve(FRONT, f), "utf8"), sb, { filename: f });
  sb.TP.ui = { info: (k) => `<button data-help="${k}">؟</button>`,
    det: (o) => `<div data-det-key="${o.key}">${o.tabs.filter((x) => x && x.html).map((x) => `<div data-dpane="${x.k}">${x.html}</div>`).join("")}<!--/det--></div>` };
  vm.runInContext(readFileSync(resolve(FRONT, "strategy-view.js"), "utf8"), sb, { filename: "strategy-view.js" });
  return sb.TP.stratView;
}
const SV = loadSV();
const FA = (n) => Math.round(n).toLocaleString("en-US").replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[+d]).replace(/,/g, "٬");
/* محتوای یک زبانهٔ «≡ جزئیات»ِ بدلی */
const pane = (html, k) => { const m = new RegExp(`<div data-dpane="${k}">([\\s\\S]*?)</div>(?=<div data-dpane=|<!--/det-->)`).exec(html); return m ? m[1] : ""; };

/* ------------------------------------------------------------------ */
/* بی پایگاه داده                                                       */
/* ------------------------------------------------------------------ */
const NEG = { sig: "2:active:5", state: "active", state_fa: "در مذاکره", round: { used: 2, max: 5 }, engine: "turn", t: 1, items: 1,
  item: { id: 61, title: "پیچ M10", head: "پیچ", code: "1003", unit: "عدد" },
  last: { move: "M-COUNTER", move_fa: "پیشنهاد متقابل", states: [{ id: "ST-N04", name: "پرداخت فقط نقد", confidence: 0.7 }], held: false, rewritten: false, eff: 57200,
    accept: { accept: false, reason: "پیشنهاد متقابل بده" }, at: 1760000000000 },
  ours: [48026], our_last: 48026, our_nominal: 43660, theirs: [{ eff: 57200, text: "پیچ‌سازان: 52000 ریال برای هر عدد", at: 1760000000000 }], their_last: 57200, panel: null,
  plan: { src: "engine", ref: 50000, unit: "عدد", target: 48000, reservation: 49000, anchor: 50000, batna: 49000, c: 0.3, rounds: 3, offers: [48026, 48259, 49000], next: 48259, rules: true },
  doc: { id: 1, version: 1, head: "پیچ", code: "1003", source: "builder", ms: "MS-1", ms_fa: "رقابتی استاندارد", mode: "STANDARD", mode_fa: "استاندارد", c: 0.3, rounds: 3,
    anchor_rule: "هدف = قیمت مرجع × (۱ −۴٪)", reservation_rule: "حد = کمینهٔ مرجع × (۱ +۳٪) و بهترین جایگزین", hard: ["گواهی کیفیت"], packages: [], summary: "سندِ پارامتری.", newer: null },
  agreement: null, facts: [{ type: "شرط پرداخت", value: "پیچ‌سازان فقط نقد می‌فروشد", at: 1 }], memo: "• دور 1: ST-N04 ← M-COUNTER (پیشنهادِ مؤثرِ تأمین‌کننده 57200)", at: 1 };

test("قاعده‌های سند روی برنامه (applyRules): درصدهای هدف و حد، آهنگ و دور؛ نه بالاتر از BATNA؛ فوریت روی تحملِ سند", () => {
  const prof = { ms: "MS-1", labels: [] };
  const r = { target_vs_ref: -0.04, rv_tol: 0.03, concession_c: 0.3, rounds: 3 };
  const p = applyRules(planNegotiation(prof, 50000, [], false), r);
  assert.deepEqual([Math.round(p.target), Math.round(p.reservation), p.c, p.rounds], [48000, 51500, 0.3, 3]);
  const q = applyRules(planNegotiation(prof, 50000, [49000], false), r);
  assert.deepEqual([Math.round(q.target), Math.round(q.reservation)], [48000, 49000], "حد نه بالاتر از بهترین پیشنهادِ واقعی");
  const u = applyRules(planNegotiation(prof, 50000, [], true), r, { urgent: true });
  assert.equal(Math.round(u.reservation), Math.round(50000 * (1 + 0.03 + URGENT_RV_EXTRA)), "فوریت روی تحملِ سند");
  const d = planNegotiation(prof, 50000, [], false);
  assert.deepEqual(applyRules({ ...d }, null), { ...d }, "بی قاعده: همان پیش‌فرضِ کلاس");
  assert.equal(applyRules(planNegotiation(prof, null, [], false), r).status, "NO_ANCHOR");
});

test("امضای کارت و برچسبِ حالت‌ها (worker/neg-view.js)", () => {
  assert.equal(negSig({ turns: 2, state: "active", c: 1700 }), "2:active:1700");
  assert.equal(negSig({ turns: null, state: "ask", c: null }), "0:ask:0", "بی نوبتِ موتور");
  assert.equal(negSig(null), null);
  for (const s of ["invited", "active", "ask", "human", "final", "declined", "closed"]) assert.ok(NEG_STATE_FA[s], s);
});

test("کارتِ صفحه: تیترِ «دور · حرکت · پیشنهادِ ما / تأمین‌کننده · 🔒 هدف / حد» و جزئیات زیرِ «≡ جزئیات»", () => {
  /* آرایهٔ ساخته‌شده در vm از realmِ دیگری است؛ Array.from آن را در همین realm می‌سازد تا deepEqual فقط محتوا را بسنجد */
  const labels = (n) => Array.from(SV.lib.negHead(n), (x) => x[0]);
  assert.deepEqual(labels(NEG), ["دور", "آخرین حرکت", "پیشنهادِ ما / تأمین‌کننده", "🔒 هدف / حد"]);
  const h = SV.negCard(NEG, { key: "neg-1" });
  assert.match(h, /data-neg/);
  assert.match(h, /<i>دور<\/i><b>۲ از ۵<\/b>/);
  assert.match(h, /<i>آخرین حرکت<\/i><b>پیشنهادِ متقابل<button data-help="gl\.counter">/, "نامِ کوتاهِ حرکت با «؟»ِ واژه‌نامه");
  assert.ok(h.includes(`${FA(48026)} / ${FA(57200)}`), "پیشنهادِ ما / تأمین‌کننده");
  assert.match(h, /neg-k lock/);
  assert.ok(h.includes(`${FA(48000)} / ${FA(49000)}`), "هدف / حد");
  assert.match(h, /data-negdoc data-head="پیچ" data-code="1003"/);
  const plan = pane(h, "plan");
  assert.match(plan, /عددهای درونی — به تأمین‌کننده گفته نمی‌شود/);
  assert.ok(plan.includes(FA(50000)) && plan.includes("بهترین پیشنهادِ واقعیِ دیگران"), "مرجع و BATNA");
  assert.match(plan, /آهنگِ شکیبا/);
  assert.match(plan, /قاعده‌های سندِ تأییدشده/);
  assert.ok(plan.includes(`پیشنهادِ بعدیِ ما: <b>${FA(48259)}</b> (دورِ ۲ از ۳)`));
  const turns = pane(h, "turns");
  assert.match(turns, /مذاکرهٔ دوگامی/);
  assert.match(turns, /پرداخت فقط نقد <span class="dim" dir="ltr">ST-N04<\/span> \(۰٫۷\)/);
  assert.match(turns, /پیچ‌سازان: 52000 ریال/);
  assert.match(pane(h, "memo"), /دور 1: ST-N04[\s\S]*شرط پرداخت: پیچ‌سازان فقط نقد می‌فروشد/);
  assert.match(pane(h, "doc"), /نسخهٔ ۱ — سازندهٔ پارامتری[\s\S]*رقابتی استاندارد[\s\S]*📘 دیدنِ کاملِ سند/);
  /* ردِ اعتبارسنج، توافقِ موقت */
  const held = SV.negCard({ ...NEG, last: { ...NEG.last, held: true } });
  assert.match(held, /neg-k bad[^>]*><i>آخرین حرکت<\/i><b>پیشنهادِ متقابل ⛔/);
  assert.match(SV.negCard({ ...NEG, agreement: { price: 47000, eff: 51700, at: 1 } }), new RegExp(`🤝 توافقِ موقت روی ${FA(47000)} ریال \\(مؤثر ${FA(51700)}\\)`));
  /* مذاکرهٔ همیشگی بی دورِ موتور و بی برنامه: وضعیت و قیمتِ پنل */
  const classic = { ...NEG, engine: "classic", last: null, plan: null, ours: [], our_last: null, their_last: null, theirs: [], panel: { price: 52000, unit: "عدد" }, doc: null };
  assert.deepEqual(labels(classic), ["دور", "وضعیت", "قیمتِ پنلِ تأمین‌کننده"]);
  const c = SV.negCard(classic);
  assert.ok(c.includes(`<i>قیمتِ پنلِ تأمین‌کننده</i><b>${FA(52000)}</b>`));
  /* دورهای پیشینِ موتور در مذاکرهٔ همیشگی (stale): تیتر حرکتِ کهنه را نشان نمی‌دهد؛ جزئیات با برچسب */
  const stale = { ...NEG, engine: "classic", last: { ...NEG.last, stale: true } };
  assert.deepEqual(labels(stale), ["دور", "وضعیت", "🔒 هدف / حد"]);
  assert.match(pane(SV.negCard(stale), "turns"), /آخرین حرکتِ مذاکرهٔ دوگامی \(پیش از مذاکرهٔ همیشگی\): پیشنهادِ متقابل/);
  assert.match(c, /مذاکرهٔ همیشگی/);
  assert.match(pane(c, "plan"), /عددِ برنامه‌ای در زمینهٔ کارشناس هوشمند نیست/);
  assert.match(pane(c, "doc"), /سندِ راهبردِ تأییدشده‌ای در کار نیست/);
  assert.doesNotMatch(c, /data-negdoc/, "بی سند، دکمهٔ سند هم نیست");
  assert.equal(SV.negCard(null), "");
});

test("«📘 سند راهبرد»ِ فقط‌خواندنی: نسخهٔ تأییدشده، بی امتیاز و تأیید؛ نسخهٔ تازه‌تر فقط یک خط", () => {
  const fin = { summary_fa: "بازارِ پیچ رقابتی است. سندِ پارامتریِ کارشناس.", market_view: { ms: "MS-1", labels: [], confidence_band: "زیاد", key_facts: [] },
    rfq: { mode: "STANDARD", competition_mode: "STANDARD", n_wave1: 5, n_max: 6, waves: 1 },
    negotiation: { anchor_rule: "هدف −۴٪", reservation_rule: "حد +۳٪", concession_c: 0.3, rounds: 3, packages: [], hard_constraints: ["گواهی کیفیت"],
      rules_pct: { target_vs_ref: -0.04, rv_tol: 0.03, offers_by_round_vs_ref: [-0.039, -0.03, 0.03] } },
    anticipated_states: [{ state_id: "ST-N01", name: "قیمتِ بالا", move: "M-PACKAGE", prepared_reply_fa: "اگر پرداخت دو ماهه باشد چه پیشنهادی دارید؟" }],
    risks: [{ risk: "هم‌پاساژی", control: "پخش در دو بازار" }], needs_approval: [], builder: { weights: { price: 40 }, pace: "patient", others: "better_only", target_vs_ref: -0.04, rv_tol: 0.03, rounds: 3, max_pay_months: 2 } };
  const D = { available: true, head: "پیچ", numbers: { status: "OK", ref: 50000, unit: "عدد", target: 47500, reservation: 51500, rounds: 3, offers: [47600, 48500, 51500] },
    /* عددهای نسخهٔ تأییدشده (docView وقتی نسخهٔ تازه‌تری هست) — نمای فقط‌خواندنی همان نسخه را با عددهای خودش نشان می‌دهد */
    numbers_approved: { status: "OK", ref: 50000, unit: "عدد", target: 48000, reservation: 51500, rounds: 3, offers: [48050, 48700, 51500], rules: true },
    builder: { weights: { price: "قیمت" }, pace: { patient: "شکیبا" }, others: { better_only: "فقط «پیشنهادِ بهتری داریم»" } },
    approved: { id: 1, version: 1, state: "approved", state_fa: "✅ تأییدشده", source: "builder", final: fin, doc: null, review: null },
    latest: { id: 2, version: 2, state: "draft", state_fa: "منتظرِ بازبینیِ شما", source: "model", model: "claude-opus-5-5", doc: { ...fin, summary_fa: "نسخهٔ تازهٔ مدل." }, final: null } };
  const h = SV.lib.roHtml(D, { why: "قلم سپرده شده.", dk: "k" });
  assert.match(h, /🔒 فقط‌خواندنی/);
  assert.match(h, /نسخهٔ 1 · <span class="chip ok">✅ تأییدشده<\/span> · سازندهٔ پارامتری/, "نسخهٔ تأییدشده، نه آخرین پیش‌نویس");
  assert.match(h, /در یک نگاه:<\/b> بازارِ پیچ رقابتی است\./);
  assert.doesNotMatch(h, /نسخهٔ تازهٔ مدل/);
  assert.match(h, /نسخهٔ تازه‌ترِ 2 «منتظرِ بازبینیِ شما» است/);
  assert.match(h, /قلم سپرده شده\./);
  assert.match(h, /doc-tiles[\s\S]*رقابتی استاندارد[\s\S]*مرجع 50,000/);
  assert.match(h, /هدف 48,000[\s\S]*حد 51,500/, "عددهای همان نسخهٔ تأییدشده");
  assert.doesNotMatch(h, /47,500/, "نه عددهای پیش‌نویسِ تازه‌تر");
  assert.match(h, /لنگر −3.9٪/, "لنگر = پیشنهادِ دورِ اول نسبت به مرجع (۴۸٬۰۵۰ از ۵۰٬۰۰۰)");
  assert.match(h, /اگر پرداخت دو ماهه باشد/, "وضعیت‌های محتمل با پاسخِ آماده");
  for (const a of ["data-dok", "data-dscore", "data-dedit", "data-dbuild", "data-drebuild", "data-esave"]) assert.ok(!h.includes(a), `بی ${a}`);
  /* بی نسخهٔ تأییدشده: آخرین نسخه با هشدار */
  const d2 = SV.lib.roHtml({ ...D, approved: null });
  assert.match(d2, /نسخهٔ 2 · <span class="chip warn">/);
  assert.match(d2, /هنوز تأیید نشده؛ کارشناس هوشمند فقط سندِ تأییدشده را/);
  assert.match(SV.lib.roHtml({ ...D, approved: null, latest: null }), /هنوز سندی برای این نوع قلم نیست/);
});

test("صفحه‌ها strategy-view.js را پیش از اسکریپتِ خودشان بار می‌کنند و کارت و نمای فقط‌خواندنی را صدا می‌زنند", () => {
  for (const [html, js] of [["expert.html", "expert.js"], ["correspond.html", "correspond.js"]]) {
    const s = readFileSync(resolve(FRONT, html), "utf8");
    const a = s.indexOf('<script src="strategy-view.js"></script>'), b = s.indexOf(`<script src="${js}"></script>`);
    assert.ok(a > 0 && a < b, `${html}: strategy-view.js پیش از ${js}`);
  }
  const corr = readFileSync(resolve(FRONT, "correspond.js"), "utf8");
  assert.match(corr, /TP\.stratView\.negCard\(/);
  assert.match(corr, /\/sp\/x\/thread\/\$\{th\}\/neg/, "تازه‌سازیِ کارت با امضای نظرسنجی");
  assert.match(corr, /TP\.stratView\.openDoc\(/);
  const ex = readFileSync(resolve(FRONT, "expert.js"), "utf8");
  assert.match(ex, /P\.doc && P\.head \? `<button class="tp-btn sm" data-pkdoc/, "دکمهٔ «📘 سند راهبرد» پس از «🚀 شروع» هم");
  assert.match(ex, /if \(\(P\.doc_ro \|\| P\.started_at\) && !then\) return pkDocRoUI\(it\)/);
  assert.match(ex, /TP\.stratView\.docBody\(/, "بازبینی و فقط‌خواندنی یک نما");
});

/* ------------------------------------------------------------------ */
/* با پایگاه داده: یک گفت‌وگوی واقعی                                       */
/* ------------------------------------------------------------------ */
let TH = 0, SESS = null, NEG0 = null;
const say = async (text) => (await call(`/sp/thread/${TH}/msg`, { headers: SESS, body: { text } })).status;
const cron = async () => { DB.raw.prepare("UPDATE ai_runs SET next_at=0").run(); await aiTick(env); };
const head = encodeURIComponent("پیچ");

test("«📘 سند راهبرد» پس از «🚀 شروع»: doc_ro روشن و GET /cr/doc همان سندِ تأییدشده را می‌دهد — بی ساختنِ نسخهٔ تازه", { skip: SKIP }, async () => {
  assert.equal((await call("/support/cr/flags", { method: "PUT", headers: SUP, body: { doc: true, turn: true } })).status, 200);
  assert.equal((await call("/support/cr/panel", { method: "PUT", headers: SUP, body: { panel_rate: 0.03 } })).status, 200);
  const p0 = await call("/items/61/picks", { headers: EX });
  assert.equal(p0.status, 200, JSON.stringify(p0.data));
  assert.deepEqual([p0.data.doc, p0.data.doc_ro, p0.data.started_at], [true, false, null], "پیش از شروع: بازبینی، نه فقط‌خواندنی");
  assert.equal((await call("/items/61/picks", { method: "PUT", headers: EX, body: { add: [{ name: "پیچ‌سازان", src: "manual" }] } })).status, 200);
  assert.equal((await call("/sp/x/phones", { headers: EX, body: { supplier_name: "پیچ‌سازان", phone: "09120000911", label: "فروش", panel: true } })).status, 200);
  /* سندِ پارامتریِ کارشناس (بی مدل): هدف ۴٪ زیرِ مرجع، حد ۳٪ بالای آن، سه دورِ شکیبا */
  const b = await call("/cr/doc/build", { headers: EX, body: { head: "پیچ", code: "1003" } });
  assert.equal(b.data.queued, true);
  const params = { weights: { price: 40, payment: 25, delivery: 15, condition: 5, quality: 15 }, target_vs_ref: -0.04, rv_tol: 0.03, rounds: 3, max_pay_months: 2, pace: "patient", others: "better_only" };
  const ok = await call(`/cr/doc/${b.data.doc.id}/review`, { headers: EX, body: { action: "builder", params } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const s = await call("/items/61/ai-start", { headers: EX, body: {} });
  assert.equal(s.status, 200, JSON.stringify(s.data));
  assert.deepEqual([s.data.doc, s.data.doc_ro, !!s.data.started_at], [true, true, true], "پاسخِ شروع همان فهرست است، با doc_ro");
  const p1 = await call("/items/61/picks", { headers: EX });
  assert.deepEqual([p1.data.doc_ro, !!p1.data.started_at], [true, true]);
  const nDocs = DB.raw.prepare("SELECT COUNT(*) AS n FROM cr_docs").get().n;
  const v = await call(`/cr/doc?head=${head}&code=1003`, { headers: EX });
  assert.equal(v.status, 200, JSON.stringify(v.data));
  assert.equal(v.data.approved.state, "approved");
  const rp = v.data.approved.final.negotiation.rules_pct;
  assert.equal(rp.target_vs_ref, -0.04);
  /* عددهای درونیِ سند با درصدهای همین سندِ پارامتری (پیش‌تر پیش‌فرضِ کلاسِ بازار بود و با متنِ سند و موتورِ مذاکره نمی‌خواند) */
  const nm = v.data.numbers;
  assert.deepEqual([nm.ref, nm.target, nm.reservation, nm.c, nm.rounds, nm.rules, nm.offers.length], [50000, 48000, 51500, 0.3, 3, true, 3]);
  assert.ok(Math.abs(rp.offers_by_round_vs_ref[0] - (nm.offers[0] / 50000 - 1)) < 0.0002, "«لنگر»ِ سندِ پارامتری با پارامترهای خودش");
  assert.equal(v.data.numbers_approved, undefined, "نسخهٔ تأییدشده همان آخرین نسخه است");
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM cr_docs").get().n, nDocs, "دیدنِ فقط‌خواندنی نسخه نمی‌سازد");
  /* کاربرِ تأمین‌کننده (نشستِ پنل) راهی به سند ندارد */
  for (let i = 0; i < 8 && !DB.raw.prepare("SELECT 1 AS x FROM ai_threads").get(); i++) await cron();
  TH = DB.raw.prepare("SELECT thread_id FROM ai_threads").get().thread_id;
  const ph = DB.raw.prepare("SELECT id FROM sp_phones WHERE phone='09120000911'").get();
  SESS = { "X-SP-Session": await SP.newSession(env, ph.id, "web") };
  assert.equal((await call(`/cr/doc?head=${head}&code=1003`, { headers: SESS })).status, 401);
});

test("کارتِ neg برای کارشناس: دورِ ۱ از ۵، حرکت و وضعیت‌ها، پیشنهادِ ما و تأمین‌کننده، هدف و حدِ موتور، سند و یادداشت", { skip: SKIP }, async () => {
  const v0 = await call(`/sp/thread/${TH}`, { headers: EX });
  assert.equal(v0.status, 200);
  assert.equal(v0.data.neg.state, "invited", "پیش از پیامِ تأمین‌کننده: دعوت شد");
  assert.deepEqual([v0.data.neg.round.used, v0.data.neg.last, v0.data.neg.ours.length], [0, null, 0]);
  assert.equal(await say("سلام، پیچ M10 عددی ۵۲ هزار ریال، فقط نقد."), 200);
  const v = await call(`/sp/thread/${TH}`, { headers: EX });
  const n = NEG0 = v.data.neg;
  assert.ok(n, "کلیدِ neg");
  assert.deepEqual(v.data.thread.ai.turns, { used: 1, max: 5 }, "threadOut دورها را هم می‌دهد (دورِ n از ۵ در مکاتبات)");
  assert.deepEqual([n.engine, n.state, n.round.used, n.round.max, n.t, n.items], ["turn", "active", 1, 5, 1, 1]);
  assert.deepEqual(n.item, { id: 61, title: "پیچ M10", head: "پیچ", code: "1003", unit: "عدد" });
  assert.equal(n.last.move, "M-COUNTER");
  assert.ok(n.last.move_fa && n.last.move_fa !== "M-COUNTER");
  const st = n.last.states.find((s) => s.id === "ST-N04");
  assert.ok(st && st.name === STATES["ST-N04"].name && st.confidence === 0.7, JSON.stringify(n.last.states));
  assert.equal(n.last.held, false);
  assert.equal(n.last.accept.accept, false);
  assert.equal(n.ours.length, 1);
  assert.equal(n.our_last, n.ours[0]);
  assert.ok(n.our_nominal > 0);
  assert.equal(n.their_last, 57200, "۵۲ هزار + ارزش افزوده");
  assert.deepEqual([n.theirs.length, n.theirs[0].eff], [1, 57200]);
  assert.match(n.theirs[0].text, /پیچ‌سازان: 52000 ریال/);
  /* همان برنامهٔ موتور: مرجع ۵۰ هزار، هدف −۴٪ (سند)، حد +۳٪ سند ولی نه بالاتر از بهترین پیشنهادِ واقعیِ دیگران (۴۹ هزار) */
  const p = n.plan;
  assert.deepEqual([p.src, p.ref, p.target, p.reservation, p.anchor, p.batna, p.c, p.rounds, p.rules], ["engine", 50000, 48000, 49000, 50000, 49000, 0.3, 3, true]);
  assert.equal(p.offers.length, 3);
  assert.equal(p.next, p.offers[1], "پیشنهادِ دورِ دوم");
  assert.ok(Math.abs(n.ours[0] - p.offers[0]) <= 2, "پیشنهادی که رفت همان دورِ اولِ برنامه است");
  assert.deepEqual([n.doc.head, n.doc.code, n.doc.version, n.doc.source, n.doc.c, n.doc.rounds, n.doc.newer], ["پیچ", "1003", 1, "builder", 0.3, 3, null]);
  assert.ok(n.doc.ms_fa);
  assert.deepEqual(n.facts.map((f) => f.type), ["شرط پرداخت"]);
  assert.match(n.memo, /دور 1: .*ST-N04.* ← M-COUNTER/);
  assert.equal(n.agreement, null);
  /* امضای نظرسنجی و مسیرِ تازه‌سازی */
  const pl = await call(`/sp/poll?t=${TH}&since=0`, { headers: EX });
  assert.equal(pl.data.neg, n.sig);
  const r = await call(`/sp/x/thread/${TH}/neg`, { headers: EX });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.neg, n);
  /* کارتِ صفحه با همین پاسخِ واقعیِ سرور */
  const h = SV.negCard(n, { key: "k" });
  assert.match(h, /<i>دور<\/i><b>۱ از ۵<\/b>/);
  assert.ok(h.includes(`${FA(n.our_last)} / ${FA(57200)}`) && h.includes(`${FA(48000)} / ${FA(49000)}`), h.slice(0, 600));
});

test("تأمین‌کننده کارت و عددهای درونی را هرگز نمی‌گیرد؛ کارشناسِ دیگر ۴۰۳", { skip: SKIP }, async () => {
  const s = await call(`/sp/thread/${TH}`, { headers: SESS });
  assert.equal(s.status, 200);
  assert.ok(!("neg" in s.data), "گفت‌وگوی تأمین‌کننده بی کلیدِ neg");
  for (const k of ['"neg"', '"reservation"', '"batna"', '"plan"', '"memo"', '"turns"']) assert.ok(!s.text.includes(k), `پاسخِ تأمین‌کننده بی ${k}`);
  const pl = await call(`/sp/poll?t=${TH}&since=0`, { headers: SESS });
  assert.equal(pl.status, 200);
  assert.ok(!("neg" in pl.data), "نظرسنجیِ تأمین‌کننده بی امضای کارت");
  assert.equal((await call(`/sp/x/thread/${TH}/neg`, { headers: SESS })).status, 404, "مسیرِ کارشناس برای تأمین‌کننده نیست");
  assert.equal((await call(`/sp/x/thread/${TH}/neg`, { headers: EX2 })).status, 403, "گفت‌وگوی کارشناسِ دیگر");
  assert.equal((await call(`/sp/x/thread/${TH}/neg`)).status, 401);
});

test("امضای نظرسنجی با دورِ تازه عوض می‌شود و کارت دورِ ۲ را نشان می‌دهد", { skip: SKIP }, async () => {
  p3Out = () => cls([{ id: "ST-N00", confidence: 0.8, evidence: "۵۱" }], { unit_price: 51000, currency_as_stated: "ریال", unit: "عدد" });
  p4Out = counter;
  assert.equal(await say("کمتر از ۵۱ هزار نمی‌شه."), 200);
  const pl = await call(`/sp/poll?t=${TH}&since=0`, { headers: EX });
  assert.notEqual(pl.data.neg, NEG0.sig);
  const n = (await call(`/sp/x/thread/${TH}/neg`, { headers: EX })).data.neg;
  assert.equal(pl.data.neg, n.sig);
  assert.deepEqual([n.round.used, n.t, n.ours.length, n.their_last], [2, 2, 2, 56100]);
  assert.ok(n.ours[1] >= n.ours[0], "امتیاز پس گرفته نمی‌شود");
  assert.equal(n.plan.next, n.plan.offers[2], "پیشنهادِ دورِ سوم");
  assert.deepEqual(n.theirs.map((f) => f.eff), [57200, 56100]);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM cr_facts WHERE thread_id=? AND type='شرط پرداخت'").get(TH).n, 2, "مذاکره‌گر همان واقعیت را دوباره ثبت کرد");
  assert.deepEqual(n.facts.map((f) => f.type), ["شرط پرداخت"], "کارت هر واقعیت را یک بار نشان می‌دهد");
});

test("کارت و امضای نظرسنجی (هر ۵ ثانیه) فقط با کلیدِ اصلی و نمایه می‌خوانند — سقفِ روزانهٔ خواندنِ D1", { skip: SKIP }, async () => {
  const th = await SP.threadRow(env, TH);
  DB.planLog.clear();
  assert.ok(await negView(env, th));
  assert.ok(negSig(await DB.prepare(NEG_SIG_SQL).bind(TH).first()));
  /* همان روشِ d1-budget.test.mjs: نام مستعار ← جدول؛ هر SCAN روی جدولی که با کار بزرگ می‌شود شکست است */
  const BIG = new Set(["ai_threads", "cr_turns", "cr_facts", "sp_lines", "sp_bundles", "sp_threads", "sp_suppliers", "items", "cr_docs", "cr_heads", "cr_prices", "cr_codes", "cr_head_x"]);
  const scans = [];
  for (const [sql, rows] of DB.planLog) {
    const alias = new Map(), re = /\b(?:FROM|JOIN)\s+(\w+)(?:\s+(?:AS\s+)?(\w+))?/gi; let x;
    while ((x = re.exec(sql))) { alias.set(x[1], x[1]); if (x[2] && !/^(WHERE|ON|JOIN|LEFT|INNER|GROUP|ORDER|LIMIT|USING|SET|VALUES|AND|OR)$/i.test(x[2])) alias.set(x[2], x[1]); }
    for (const d of rows) { const m = /^SCAN (\w+)/.exec(d); if (m && BIG.has(alias.get(m[1]) || m[1])) scans.push(`${d} :: ${sql.replace(/\s+/g, " ").slice(0, 160)}`); }
  }
  assert.ok(DB.planLog.size >= 8, `دستورهای کارت: ${DB.planLog.size}`);
  assert.deepEqual(scans, []);
});

test("مذاکرهٔ همیشگی: عددهای درونیِ سند؛ نسخهٔ تازه‌تر؛ کلیدِ doc خاموش ← بی سند و بی عدد", { skip: SKIP }, async () => {
  assert.equal((await call("/support/cr/flags", { method: "PUT", headers: SUP, body: { turn: false } })).status, 200);
  const nums = (await call(`/cr/doc?head=${head}&code=1003`, { headers: EX })).data.numbers;
  const n = (await call(`/sp/x/thread/${TH}/neg`, { headers: EX })).data.neg;
  assert.equal(n.engine, "classic");
  assert.deepEqual([n.plan.src, n.plan.ref, n.plan.target, n.plan.reservation, n.plan.batna, n.plan.rules], ["doc", 50000, 48000, 51500, null, true]);
  assert.deepEqual([n.plan.target, n.plan.reservation, n.plan.offers], [nums.target, nums.reservation, nums.offers], "همان عددهای «📘 سند راهبرد»");
  const blk = await docBlock(env, [{ head: "پیچ", code: "1003", title: "پیچ M10" }]);
  assert.match(blk, /\[درونی — هرگز به تأمین‌کننده نگو\] قیمت مرجع 50000، هدف 48000، حد 51500، پیشنهادِ ما در دورهای ۱ تا 3: /, "زمینهٔ مدل همان عددها را دارد");
  assert.deepEqual([n.last.move, n.last.stale], ["M-COUNTER", true], "دورهای پیشینِ موتور می‌مانند، با نشانِ کهنه");
  /* نسخهٔ تازه‌ترِ سند (هنوز تأییدنشده): کارشناس هوشمند تا تأییدش با نسخهٔ ۱ است */
  assert.equal((await call("/cr/doc/build", { headers: EX, body: { head: "پیچ", code: "1003", force: true } })).data.queued, true);
  const n2 = (await call(`/sp/x/thread/${TH}/neg`, { headers: EX })).data.neg;
  assert.deepEqual([n2.doc.version, n2.doc.newer && n2.doc.newer.version, n2.doc.newer && n2.doc.newer.state], [1, 2, "queued"]);
  assert.equal((await call("/support/cr/flags", { method: "PUT", headers: SUP, body: { doc: false } })).status, 200);
  const n3 = (await call(`/sp/x/thread/${TH}/neg`, { headers: EX })).data.neg;
  assert.deepEqual([n3.doc, n3.plan], [null, null], "کلیدِ doc خاموش: کارشناس هوشمند هم سند و عددی در زمینه ندارد");
  assert.equal((await call("/items/61/picks", { headers: EX })).data.doc_ro, false);
  assert.equal((await call("/support/cr/flags", { method: "PUT", headers: SUP, body: { doc: true, turn: true } })).status, 200);
});
