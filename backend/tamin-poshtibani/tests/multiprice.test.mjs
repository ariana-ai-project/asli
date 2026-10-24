/* ============================================================
   «قیمتِ نقدی و اعتباری» (درخواست مالک، مهر ۱۴۰۵)

   وقتی کارشناس «اعتباری» را در «📋 شرایط خرید»ِ قلم می‌زند، تأمین‌کننده به‌جای یک قیمت، قیمتِ نقد (اگر «نقدی» هم خواسته شده) و
   قیمتِ اعتباریِ ۱ و ۲ ماهه را می‌دهد — خودِ قیمت یا درصدِ تعدیل نسبت به نقد. 🔒 یعنی همه الزامی، 🔓 یعنی دست‌کم یکی.
   روی SQLite واقعی: پنل ← خطِ استعلام (quotes.prices_json) ← کارت ربات، پیش‌فاکتورِ سامانه و جدول کمیسیون.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";

import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import * as SP from "../../../worker/sp-core.js";
import { lineCard } from "../../../worker/sp-push.js";
import { payModes, priceRows, pricesMissing, cleanLimits, limitsTxt } from "../../../worker/terms-locks.js";
import { proformaData, proformaHtml } from "../../../worker/pfdoc.js";
import { commissionData, commissionSheet } from "../../../worker/sheets.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = {
  DB, MANAGER_CODE: "1234", TG_BOT_TOKEN: "tok", TG_SP_BOT_TOKEN: "sptok", TG_WEBHOOK_SECRET: "sec", TG_API_BASE: "https://tg.test/bot",
  SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_KEY: "svc", ANTHROPIC_API_KEY: "k", ANTHROPIC_API_BASE: "https://ai.test", SITE_ORIGIN: "https://site.test",
};
const HU = { "X-Expert-Code": "7002" };
const norm = (head) => JSON.stringify({ v: 2, head, layers: {}, source: "catalog" });

if (DB) {
  await ensureSchema(env);
  const t = Date.now();
  DB.raw.exec("DELETE FROM experts");
  DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,telegram_chat,created_at) VALUES (2,'انسانی','انسانی','7002',1,1,'702',?)").run(t);
  DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES ('R-M','1405/07/27','پروژهٔ میلگرد')").run();
  DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,deadline_at,created_at) VALUES (1,'R-M',2,5,?,?,?)").run(t, t + 9e8, t);
  const ins = DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,title,qty,unit,state,assignment_id,norm_json) VALUES (?,?,?,?,?,?,?,'open',?,?)");
  ins.run(31, "R-M", "a", 1, "میلگرد ۱۲", 1000, "کیلوگرم", 1, norm("میلگرد"));
  ins.run(32, "R-M", "b", 2, "سیم آرماتوربندی", 50, "کیلوگرم", 1, norm("سیم"));
}

const R = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.startsWith("https://tg.test/bot")) return R({ ok: true, result: u.endsWith("getMe") ? { id: 77, username: "AriaSupplierBot" } : { message_id: 1 } });
  if (u.startsWith("https://sb.test/storage/v1/object/sign/")) return R({ signedURL: "/object/sign/proformas/x?token=abc" });
  if (u.startsWith("https://sb.test/")) return (init.method || "GET") === "GET" ? new Response("nf", { status: 404 }) : R({ Key: "x" });
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
async function supplierSession(phone) {
  const p = DB.raw.prepare("SELECT id FROM sp_phones WHERE phone=?").get(phone);
  return { "X-SP-Session": await SP.newSession(env, p.id, "web") };
}

test("قاعده (بی پایگاه داده): حالت‌ها، ردیف‌ها، 🔒 همه و 🔓 دست‌کم یکی؛ متنِ شرط", () => {
  assert.equal(payModes({ pay: { opts: ["نقدی"], lock: true } }), null, "بی «اعتباری» همان یک قیمت");
  const m = payModes(cleanLimits({ pay: { opts: ["اعتباری", "نقدی"], lock: true } }));
  assert.deepEqual(m, { cash: true, credit: [1, 2], lock: true });
  assert.deepEqual(priceRows(m), ["cash", "c1", "c2"]);
  assert.deepEqual(pricesMissing(m, { cash: 100 }), ["c1", "c2"], "🔒: همه الزامی");
  assert.deepEqual(pricesMissing({ ...m, lock: false }, { c2: 120 }), [], "🔓: یکی بس است");
  assert.deepEqual(pricesMissing({ ...m, lock: false }, null), ["cash"], "🔓 و هیچ: اولین ردیف");
  assert.deepEqual(priceRows(payModes({ pay: { opts: ["اعتباری"], lock: false } })), ["c1", "c2"], "فقط اعتباری: نقد ندارد");
  assert.match(limitsTxt(cleanLimits({ pay: { opts: ["نقدی", "اعتباری"], lock: false } })), /«نقدی» یا «اعتباری» \(۱ ماهه و ۲ ماهه\)/);
  /* خطِ قدیمی که فقط یک قیمت دارد: همان در ردیفِ اول */
  assert.deepEqual(SP.pricesEff({ price: 500 }, m), { cash: 500 });
  assert.deepEqual(SP.pricesEff({ price: 500 }, payModes({ pay: { opts: ["اعتباری"] } })), { c1: 500 });
  assert.equal(SP.pricesEff({ price: 500 }, null), null);
});

test("پنل: درصدِ تعدیل قیمت می‌سازد، 🔓 با یک قیمت آماده است، خطِ استعلام همهٔ ردیف‌ها را دارد و تسویه از قیمت‌هاست", { skip: SKIP }, async () => {
  assert.equal((await call("/items/31/terms", { method: "PUT", headers: HU, body: { pay: { opts: ["نقدی", "اعتباری"], lock: false } } })).status, 200);
  assert.equal((await call("/items/32/terms", { method: "PUT", headers: HU, body: { pay: { opts: ["نقدی", "اعتباری"], lock: true } } })).status, 200);
  const s = await call("/sp/x/send", { headers: HU, body: { assignment_id: 1, item_ids: [31, 32], supplier_name: "آهن‌آلات نمونه", phone: "09120000501", label: "فروش" } });
  assert.equal(s.status, 200, JSON.stringify(s.data));
  const th = DB.raw.prepare("SELECT id FROM sp_threads WHERE assignment_id=1").get().id;
  const H = await supplierSession("09120000501");
  const d = (await call(`/sp/thread/${th}`, { headers: H })).data;
  const L31 = d.lines.find((l) => l.item_id === 31), L32 = d.lines.find((l) => l.item_id === 32);
  assert.deepEqual(L31.limits.pay.credit, [1, 2], "پنل مدت‌ها را می‌داند");
  assert.equal((await call(`/sp/thread/${th}/terms`, { headers: H, body: { vat: "دارد", invoice: "رسمی", dtime: "7", valid_days: 5 } })).status, 200);
  /* میلگرد (🔓): نقد و درصدِ ۱ ماهه ← قیمتِ ۱ ماهه ساخته می‌شود */
  let r = await call(`/sp/line/${L31.id}`, { method: "PUT", headers: H, body: { qty: 1000, prices: { cash: 520000, r1: 3 } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.line.prices, { cash: 520000, c1: 535600, r1: 3 }, "۵۲۰٬۰۰۰ × ۱٫۰۳");
  const l31 = DB.raw.prepare("SELECT price, prices_json FROM sp_lines WHERE id=?").get(L31.id);
  assert.equal(l31.price, 520000, "قیمتِ اصلی همان نقد است");
  assert.equal((await call(`/sp/line/${L31.id}`, { method: "PUT", headers: H, body: { prices: { cash: -1 } } })).status, 422, "قیمتِ منفی نه");
  assert.equal((await call(`/sp/line/${L31.id}/ready`, { headers: H, body: { on: true } })).status, 200, "🔓: بی قیمتِ ۲ ماهه هم آماده است");
  /* سیم (🔒): هر سه لازم — اول فقط اعتباری‌ها، بعد نقد */
  assert.equal((await call(`/sp/line/${L32.id}`, { method: "PUT", headers: H, body: { qty: 50, prices: { c1: 610000, c2: 640000 } } })).status, 200);
  r = await call(`/sp/line/${L32.id}/ready`, { headers: H, body: { on: true } });
  assert.equal(r.status, 422);
  assert.deepEqual(r.data.missing, ["قیمت نقدی"], "نه «قیمت واحد»، نه «شرایط تسویه» — فقط ردیفِ خالی");
  r = await call(`/sp/line/${L32.id}`, { method: "PUT", headers: H, body: { prices: { cash: 600000 } } });
  assert.deepEqual([r.data.line.prices.r1, r.data.line.prices.r2], [1.7, 6.7], "درصدها از خودِ قیمت‌ها");
  assert.equal((await call(`/sp/line/${L32.id}/ready`, { headers: H, body: { on: true } })).status, 200);
  /* کارت ربات: ردیف‌ها با دکمهٔ هر کدام، بی «💰 قیمت واحد» و بی «💳 تسویه» */
  const l32 = DB.raw.prepare("SELECT * FROM sp_lines WHERE id=?").get(L32.id);
  const card = lineCard({ ...l32, state: "draft" }, [], 0, {}, { limits: L32.limits });
  assert.match(card.text, /💵 نقد ۶۰۰٬۰۰۰ · 💳 ۱ ماهه ۶۱۰٬۰۰۰ \(\+۱٫۷٪\) · 💳 ۲ ماهه ۶۴۰٬۰۰۰ \(\+۶٫۷٪\)/);
  assert.match(card.text, /🔒 همه الزامی/);
  const btns = card.kb.flat().map((b) => b.callback_data);
  assert.ok(btns.includes(`sv:${L32.id}:pc`) && btns.includes(`sv:${L32.id}:p1`) && btns.includes(`sv:${L32.id}:p2`));
  assert.ok(!btns.includes(`sv:${L32.id}:p`) && !btns.includes(`tk:${L32.id}:p`));
  /* ارسال: تسویهٔ بسته از قیمت‌ها («نقدی»)؛ تصمیمِ کارشناس ← خطِ استعلام با همهٔ ردیف‌ها */
  const sub = await call(`/sp/thread/${th}/submit`, { headers: H, body: {} });
  assert.equal(sub.status, 200, JSON.stringify(sub.data));
  assert.equal(JSON.parse(DB.raw.prepare("SELECT terms_json FROM sp_bundles WHERE id=?").get(sub.data.bundle_id).terms_json).pay, "نقدی");
  const fin = await call(`/sp/x/bundle/${sub.data.bundle_id}/decide`, { headers: HU, body: { action: "final" } });
  assert.equal(fin.status, 200, JSON.stringify(fin.data));
  const q = DB.raw.prepare("SELECT price, pay, prices_json, src_json FROM quotes WHERE assignment_id=1 AND item_id=32").get();
  assert.deepEqual(JSON.parse(q.prices_json), { cash: 600000, c1: 610000, c2: 640000, r1: 1.7, r2: 6.7 });
  assert.deepEqual([q.price, q.pay], [600000, "نقدی"]);
  assert.equal(JSON.parse(q.src_json).prices_json.s, "bundle", "منبعِ ردیف‌های قیمت هم ثبت است");
  /* تب استعلاماتِ کارشناس همان ردیف‌ها را می‌گیرد */
  const ad = (await call("/assignments/1", { headers: HU })).data;
  assert.ok(ad.quotes.find((x) => x.item_id === 32).prices_json);
});

test("آبان ۱۴۰۵: قلمِ «فقط اعتباری» با قیمتِ نقد و اعتباری از تأمین‌کننده گیر نمی‌کند — نقد کنار می‌رود و تسویه «اعتباری» است", { skip: SKIP }, async () => {
  DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,title,qty,unit,state,assignment_id,norm_json) VALUES (33,'R-M','c',3,'تیرآهن ۱۴',20,'شاخه','open',1,?)").run(norm("تیرآهن"));
  assert.equal((await call("/items/33/terms", { method: "PUT", headers: HU, body: { pay: { opts: ["اعتباری"], lock: true } } })).status, 200);
  const s = await call("/sp/x/send", { headers: HU, body: { assignment_id: 1, item_ids: [33], supplier_name: "فولاد ج", phone: "09120000502", label: "فروش" } });
  assert.equal(s.status, 200, JSON.stringify(s.data));
  const th = s.data.thread_id, H = await supplierSession("09120000502");
  const L = (await call(`/sp/thread/${th}`, { headers: H })).data.lines.find((l) => l.item_id === 33);
  assert.equal((await call(`/sp/thread/${th}/terms`, { headers: H, body: { vat: "دارد", invoice: "رسمی", dtime: "7", valid_days: 5 } })).status, 200);
  const r = await call(`/sp/line/${L.id}`, { method: "PUT", headers: H, body: { qty: 20, prices: { cash: 900000, c1: 930000, c2: 960000 } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.line.prices.cash, undefined, "نقدِ ناخواسته نگه داشته نمی‌شود");
  const ready = await call(`/sp/line/${L.id}/ready`, { headers: H, body: { on: true } });
  assert.equal(ready.status, 200, JSON.stringify(ready.data));
  const sub = await call(`/sp/thread/${th}/submit`, { headers: H, body: {} });
  assert.equal(sub.status, 200, JSON.stringify(sub.data));
  assert.equal(JSON.parse(DB.raw.prepare("SELECT terms_json FROM sp_bundles WHERE id=?").get(sub.data.bundle_id).terms_json).pay, "اعتباری");
});

test("پیش‌فاکتورِ سامانه و جدول کمیسیون: ردیف‌های قیمت، جمعِ اعتباری، درصد در «شرایط تسویه» و نامِ سبزِ پیش‌فاکتورِ رسمی", () => {
  const P = { cash: 600000, c1: 610000, c2: 640000, r1: 1.7, r2: 6.7 };
  const dt = proformaData({ lines: [{ title: "سیم", qty: 50, unit: "کیلوگرم", price: 600000, prices: P }], terms: { vat: "دارد" } });
  assert.equal(dt.sum, 30000000);
  assert.deepEqual(dt.credit.map((c) => [c.m, c.sum]), [[1, 30500000], [2, 32000000]]);
  assert.match(dt.lines[0].ptxt, /نقد: 600,000 · اعتباری 1 ماهه: 610,000 \(1\.7٪\+\)/);
  assert.match(proformaHtml({ lines: [{ title: "سیم", qty: 50, unit: "کیلوگرم", price: 600000, prices: P }], terms: {} }), /جمع کل با قیمتِ اعتباری ۲ ماهه/);
  /* نیمه‌کاره نه: یک ردیف بی قیمتِ ۲ ماهه ← جمعِ ۲ ماهه نمی‌آید */
  assert.deepEqual(proformaData({ lines: [{ qty: 1, price: 1, prices: { cash: 1, c2: 2 } }, { qty: 1, price: 1, prices: { cash: 1 } }], terms: {} }).credit, []);
  const quotes = [
    { supplier_name: "الف", item_id: 1, final: 1, saved: 1, price: 600000, qty: 50, pay: "نقدی", prices_json: JSON.stringify(P) },
    { supplier_name: "ب", item_id: 1, final: 1, saved: 1, price: 620000, qty: 50, pay: "نقدی" },
  ];
  const cd = commissionData({ items: [{ id: 1, title: "سیم", qty: 50, unit: "کیلوگرم" }], quotes, offpf: ["ب"] });
  assert.equal(cd.groups[0].payTxt, "نقدی؛ اعتباری ۱ ماهه +۱٫۷٪، ۲ ماهه +۶٫۷٪".replace(/٫/g, "."));
  assert.deepEqual(cd.groups.map((g) => g.offpf), [false, true]);
  const sh = commissionSheet({ items: [{ id: 1, title: "سیم", qty: 50, unit: "کیلوگرم" }], quotes, offpf: ["ب"], request: {} });
  const cells = [...sh.cells.values()].filter((c) => /^(الف|ب)/.test(String(c.v || "")));
  assert.ok(cells.some((c) => c.v === "ب ✓" && c.st && c.st.fill === "E2F0D9"), "نامِ دارندهٔ پیش‌فاکتورِ رسمیِ معتبر سبز است");
  assert.ok(cells.some((c) => c.v === "الف" && (!c.st || c.st.fill !== "E2F0D9")));
});
