/* ============================================================
   «مناقصه» — دور دوم (مهر ۱۴۰۵، درخواست مالک)
   • پیامک (و پیام بات تلگرام تأمین‌کنندگان) وقتی رتبهٔ کسی پایین آمد — با فاصلهٔ کمینه و «خبر نده» خودش
   • پیشنهاد خودکار (proxy)، دور سربسته، «فقط رتبه»، پذیرش شرایط، چندقلمی با یک ورود
   • ثبت نتیجه در درخواست (خط‌های استعلام، برنده «تأیید نهایی»)، تنظیمات پشتیبان و درگاه پیامک TextBee، گزارش CSV، پیام تشکر
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import { proxyRun, rankDrops, ranksOf, checkBid, bidRange, tenderState } from "../../../worker/tender-core.js";
import { tenderTick } from "../../../worker/tender.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = { DB, MANAGER_CODE: "4321", COMPANY: "تونل سد آریانا", SITE_ORIGIN: "https://arianaai.website",
  TEXTBEE_API_KEY: "tbk", TEXTBEE_API_BASE: "https://sms.test", TG_SP_BOT_TOKEN: "sptok", TG_API_BASE: "https://tg.test/bot" };
const SMS = [], TG = [];
const R = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.startsWith("https://sms.test/")) { const b = JSON.parse(init.body); SMS.push({ to: b.recipients[0], text: b.message, key: init.headers["x-api-key"] }); return R({ data: { success: true, smsBatchId: "x" } }); }
  if (u.startsWith("https://tg.test/bot")) { const body = JSON.parse(init.body || "{}"); TG.push({ method: u.split("/").pop(), body }); return R({ ok: true, result: { message_id: 1 } }); }
  return R({ error: "no" }, 404);
};
const run = (sql, ...a) => DB.raw.prepare(sql).run(...a);
const get = (sql, ...a) => DB.raw.prepare(sql).get(...a);
const call = async (method, path, body, headers) => {
  const h = { "Content-Type": "application/json", ...(headers || {}) };
  const res = await route(new Request("https://x/tamin-poshtibani/api" + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env, { waitUntil(p) { return p; } });
  const txt = await res.text();
  let data = null; try { data = JSON.parse(txt); } catch (_) { data = txt; }
  return { status: res.status, data, type: res.headers.get("content-type") };
};
const settle = () => new Promise((r) => setTimeout(r, 30));
let SUP = null;
const P = { A: "09121111111", B: "09122222222", C: "09123333333" };
if (DB) {
  await ensureSchema(env);
  SUP = { "X-Support-Token": (await call("POST", "/support/setup", { pass: "9753" })).data.token };
  /* «الف» بات تلگرام تأمین‌کنندگان را وصل کرده است */
  run("INSERT INTO sp_suppliers (id,name,name_n,demo,created_at) VALUES (1,'الف','الف',0,1)");
  run("INSERT INTO sp_phones (id,supplier_id,phone,label,k,panel,created_at) VALUES (1,1,?,'فروش','k1',1,1)", P.A);
  run("INSERT INTO sp_tg (chat,role,phone_id,updated_at) VALUES ('555','s',1,1)");
}
/** مناقصهٔ تازه، شروع‌شده، و ورود هر سه نفر؛ خروجی {id, code, H: {A,B,C}} */
async function fresh(extra, sched) {
  const r = await call("POST", "/support/tenders", { title: "تیرآهن ۱۴", qty: 10, unit: "شاخه", start_price: 1_000_000,
    invites: [{ name: "الف", phone: P.A }, { name: "ب", phone: P.B }, { name: "ج", phone: P.C }], ...(extra || {}) }, SUP);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const id = r.data.tender.id, code = r.data.tender.code;
  assert.equal((await call("POST", `/support/tenders/${id}/schedule`, { start_in_min: 0, duration_min: 30, ...(sched || {}) }, SUP)).status, 200);
  const H = {};
  for (const k of ["A", "B", "C"]) {
    const al = get("SELECT alias FROM tender_invites WHERE tender_id=? AND phone=?", id, P[k]).alias;
    const p = (await call("POST", `/support/tenders/${id}/invites/${al}/pass`, {}, SUP)).data.pass;
    H[k] = { "X-Tender-Token": (await call("POST", `/tender/${code}/login`, { phone: P[k], pass: p })).data.token };
  }
  return { id, code, H, r };
}
const smsTo = (p) => SMS.filter((x) => x.to === `+98${p.slice(1)}`);

/* ---------------- ناب ---------------- */
test("پیشنهاد خودکار: کمترین کف برنده، یک گام زیر کف رقیب", () => {
  const t = { start_price: 1_000_000, step_pct: 0.5, best_amount: 900_000, best_alias: 9 };
  assert.deepEqual(proxyRun(t, [{ alias: 1, min: 850_000, at: 1 }, { alias: 2, min: 870_000, at: 2 }]),
    [{ alias: 1, amount: 895_500 }, { alias: 2, amount: 870_000 }, { alias: 1, amount: 865_650 }]);
  assert.deepEqual(proxyRun({ start_price: 1_000_000, step_pct: 0.5 }, [{ alias: 3, min: 950_000 }]), [{ alias: 3, amount: 1_000_000 }]);
  assert.deepEqual(proxyRun(t, [{ alias: 1, min: 899_000 }]), [], "کف بالاتر از لازم");
  const d = rankDrops(ranksOf([{ alias: 1, amount: 900, at: 1 }, { alias: 2, amount: 950, at: 2 }]), ranksOf([{ alias: 1, amount: 900, at: 1 }, { alias: 2, amount: 950, at: 2 }, { alias: 3, amount: 890, at: 3 }]), new Set([3]));
  assert.deepEqual(d, [{ alias: 1, from: 1, to: 2 }, { alias: 2, from: 2, to: 3 }]);
});
test("دور سربسته و «فقط رتبه» در قواعد", () => {
  const t = { state: "scheduled", start_at: 1, sealed_end_at: 100, end_at: 1000, start_price: 1_000_000, floor_pct: 30, jump_pct: 10, step_pct: 0.5, best_amount: 800_000, best_alias: 2 };
  assert.equal(tenderState(t, 50), "sealed");
  assert.equal(checkBid(t, 990_000, 1, 50, null).ok, true, "سربسته: بالاتر از بهترین دیگران هم پذیرفته است");
  assert.equal(checkBid(t, 995_000, 1, 50, 990_000).code, "high", "سربسته: فقط پایین‌تر از پیشنهاد خودش");
  const r = { ...t, sealed_end_at: null, show_prices: 0 };
  assert.equal(bidRange(r, 950_000).mode, "own");
  assert.equal(checkBid(r, 940_000, 1, 50, 950_000).ok, true, "فقط رتبه: از پیشنهاد خودش پایین می‌آید");
});

/* ---------------- پیامک «رتبهٔ شما پایین آمد» ---------------- */
test("رتبه پایین آمد ← پیامک و پیام بات؛ دومی تا دو دقیقه نه؛ «خبر نده» خودش", { skip: SKIP }, async () => {
  const { code, H, id } = await fresh();
  SMS.length = 0; TG.length = 0;
  assert.equal((await call("POST", `/tender/${code}/bid`, { amount: 990_000 }, H.A)).status, 200);
  assert.equal((await call("POST", `/tender/${code}/bid`, { amount: 980_000 }, H.B)).status, 200);
  await settle();
  const a = smsTo(P.A);
  assert.equal(a.length, 1, JSON.stringify(SMS));
  assert.match(a[0].text, /دیگر پیشتاز مناقصه نیستید؛ رتبهٔ شما اکنون ۲ است/);
  assert.match(a[0].text, new RegExp(`tender#t=${code}`));
  assert.ok(!/تیرآهن/.test(a[0].text), "نام کالا در پیامک نیست");
  assert.equal(smsTo(P.B).length, 0, "خود پیشنهاددهنده نه");
  assert.ok(TG.some((x) => x.method === "sendMessage" && x.body.chat_id === "555" && /رتبهٔ شما/.test(x.body.text)), "بات تلگرام تأمین‌کننده هم");
  /* پایین آمدن دوباره در کمتر از دو دقیقه: پیامک تازه نه */
  assert.equal((await call("POST", `/tender/${code}/bid`, { amount: 970_000 }, H.C)).status, 200);
  await settle();
  assert.equal(smsTo(P.A).length, 1);
  assert.equal(smsTo(P.B).length, 1, "ب برای اولین بار عقب افتاد");
  /* «خبر نده» ب */
  assert.equal((await call("POST", `/tender/${code}/pref`, { notify: false }, H.B)).data.view.me.notify_off, true);
  run("UPDATE tender_invites SET outbid_at=NULL WHERE tender_id=?", id);
  assert.equal((await call("POST", `/tender/${code}/bid`, { amount: 960_000 }, H.A)).status, 200);
  await settle();
  assert.equal(smsTo(P.B).length, 1, "ب خاموش کرده است");
  assert.equal(smsTo(P.C).length, 1, "ج عقب افتاد");
  /* پشتیبان خاموشش کند: هیچ */
  await call("PUT", `/support/tenders/${id}`, { outbid_sms: false }, SUP);
  run("UPDATE tender_invites SET outbid_at=NULL WHERE tender_id=?", id);
  SMS.length = 0;
  assert.equal((await call("POST", `/tender/${code}/bid`, { amount: 950_000 }, H.C)).status, 200);
  await settle();
  assert.equal(SMS.length, 0);
});

/* ---------------- پیشنهاد خودکار ---------------- */
test("پیشنهاد خودکار: پیشنهاد دیگری بلافاصله پاسخ می‌گیرد و پیشتازی می‌ماند", { skip: SKIP }, async () => {
  const { code, H, id } = await fresh();
  const low = await call("POST", `/tender/${code}/proxy`, { min: 500_000 }, H.B);
  assert.equal(low.status, 400, "زیر کف نه");
  const p = await call("POST", `/tender/${code}/proxy`, { min: "۹۰۰٬۰۰۰" }, H.B);
  assert.equal(p.status, 200, JSON.stringify(p.data));
  assert.equal(p.data.view.me.lead, true, "بی پیشنهاد دیگری، با قیمت شروع پیشتاز شد");
  assert.equal(p.data.view.tender.best_amount, 1_000_000);
  const a = await call("POST", `/tender/${code}/bid`, { amount: 950_000 }, H.A);
  assert.equal(a.status, 200);
  assert.equal(a.data.auto, 1, "یک پیشنهاد خودکار در پاسخ");
  assert.equal(a.data.view.me.lead, false);
  const t = get("SELECT best_amount, best_alias FROM tenders WHERE id=?", id);
  assert.equal(t.best_amount, 950_000 - 4_750);
  assert.equal(t.best_alias, get("SELECT alias FROM tender_invites WHERE tender_id=? AND phone=?", id, P.B).alias);
  assert.equal(get("SELECT auto FROM tender_bids WHERE tender_id=? ORDER BY id DESC LIMIT 1", id).auto, 1);
  /* زیر کف خودکار: پیشتاز عوض می‌شود */
  const a2 = await call("POST", `/tender/${code}/bid`, { amount: 880_000 }, H.A);
  assert.equal(a2.data.auto, 0);
  assert.equal(a2.data.view.me.lead, true);
  /* پشتیبان خودکار را ببندد */
  await call("PUT", `/support/tenders/${id}`, { proxy_on: false }, SUP);
  assert.equal((await call("POST", `/tender/${code}/proxy`, { min: 870_000 }, H.C)).status, 403);
});

/* ---------------- دور سربسته ---------------- */
test("دور سربسته: قیمت‌ها پنهان، بعد دور زنده از کمترین همان‌ها و پیامک رتبه", { skip: SKIP }, async () => {
  const { code, H, id } = await fresh({}, { sealed_min: 10 });
  assert.equal((await call("GET", `/tender/${code}/state`, null, H.A)).data.tender.state, "sealed");
  assert.equal((await call("POST", `/tender/${code}/bid`, { amount: 950_000 }, H.A)).status, 200);
  const b = await call("POST", `/tender/${code}/bid`, { amount: 990_000 }, H.B);
  assert.equal(b.status, 200, "بالاتر از دیگری هم در سربسته");
  assert.equal(b.data.view.best, null, "کمترین پیدا نیست");
  assert.equal(b.data.view.bids.length, 1, "فقط پیشنهاد خودش");
  assert.equal(b.data.view.me.rank, null);
  SMS.length = 0;
  run("UPDATE tenders SET sealed_end_at=? WHERE id=?", Date.now() - 1000, id);
  await tenderTick(env);
  await settle();
  const v = (await call("GET", `/tender/${code}/state`, null, H.B)).data;
  assert.equal(v.tender.state, "live");
  assert.equal(v.best.amount, 950_000);
  assert.equal(v.me.rank, 2);
  assert.match(smsTo(P.B)[0].text, /دور سربستهٔ مناقصه تمام شد؛ رتبهٔ شما ۲/);
  assert.equal(get("SELECT sealed_done FROM tenders WHERE id=?", id).sealed_done, 1);
});

/* ---------------- فقط رتبه و پذیرش شرایط ---------------- */
test("«فقط رتبه» و پذیرش شرایط پیش از اولین پیشنهاد", { skip: SKIP }, async () => {
  const { code, H } = await fresh({ show_prices: false, require_accept: true, terms: "تحویل در کارگاه؛ پرداخت ۳۰ روزه" });
  const b0 = await call("POST", `/tender/${code}/bid`, { amount: 990_000 }, H.A);
  assert.equal(b0.status, 409);
  assert.equal(b0.data.code, "accept");
  const acc = await call("POST", `/tender/${code}/accept`, {}, H.A);
  assert.equal(acc.data.view.me.accepted, true);
  await call("POST", `/tender/${code}/accept`, {}, H.B);
  assert.equal((await call("POST", `/tender/${code}/bid`, { amount: 990_000 }, H.A)).status, 200);
  const b = await call("POST", `/tender/${code}/bid`, { amount: 995_000 }, H.B);
  assert.equal(b.status, 200, "بالاتر از دیگری هم، چون فقط از پیشنهاد خودش پایین می‌آید");
  assert.equal(b.data.view.best, null, "قیمت دیگران پیدا نیست");
  assert.equal(b.data.view.me.rank, 2);
  assert.equal(b.data.view.bids.every((x) => x.mine), true);
  assert.equal((await call("POST", `/tender/${code}/bid`, { amount: 995_000 }, H.B)).data.code, "high", "دوباره همان مبلغ نه");
});

/* ---------------- چندقلمی ---------------- */
test("چندقلمی: یک گروه، یک دعوت، یک ورود برای همهٔ قلم‌ها", { skip: SKIP }, async () => {
  const r = await call("POST", "/support/tenders", { lots: [{ title: "میلگرد ۱۶", qty: 20, unit: "تن", start_price: 480_000_000 }, { title: "میلگرد ۱۸", qty: 10, unit: "تن", start_price: 470_000_000 }],
    invites: [{ name: "الف", phone: P.A }, { name: "ب", phone: P.B }] }, SUP);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.lots.length, 2);
  const [l1, l2] = r.data.lots;
  const aliasA = (tid) => get("SELECT alias FROM tender_invites WHERE tender_id=? AND phone=?", tid, P.A).alias;
  assert.equal(aliasA(l1.id), aliasA(l2.id), "همان شمارهٔ ناشناس در همهٔ قلم‌ها");
  await call("POST", `/support/tenders/${l1.id}/schedule`, { start_in_min: 0, duration_min: 20 }, SUP);
  assert.equal(get("SELECT state FROM tenders WHERE id=?", l2.id).state, "scheduled", "شروع گروه با هم");
  SMS.length = 0;
  const inv = await call("POST", `/support/tenders/${l1.id}/invite`, {}, SUP);
  assert.equal(inv.data.result.sent, 2, "یک پیامک برای هر نفر، نه برای هر قلم");
  assert.equal(get("SELECT sms_state FROM tender_invites WHERE tender_id=? AND phone=?", l2.id, P.A).sms_state, "sent");
  const p = (await call("POST", `/support/tenders/${l1.id}/invites/${aliasA(l1.id)}/pass`, {}, SUP)).data.pass;
  const tok = { "X-Tender-Token": (await call("POST", `/tender/${l2.code}/login`, { phone: P.A, pass: p })).data.token };
  const v1 = (await call("GET", `/tender/${l1.code}/state`, null, tok)).data;
  assert.equal(v1.tender.title, "میلگرد ۱۶", "با ورود قلم دوم، قلم اول هم باز است");
  assert.equal(v1.lots.length, 2);
  assert.equal((await call("POST", `/tender/${l1.code}/bid`, { amount: 479_000_000 }, tok)).status, 200);
  /* پشتیبان قاعدهٔ گروه را یک‌جا عوض می‌کند */
  await call("PUT", `/support/tenders/${l1.id}`, { show_names: true }, SUP);
  assert.equal(get("SELECT show_names FROM tenders WHERE id=?", l2.id).show_names, 1);
});

/* ---------------- ثبت در درخواست، پیام تشکر، گزارش ---------------- */
test("پایان: پیام تشکر به بقیه، ثبت نتیجه در درخواست و گزارش CSV", { skip: SKIP }, async () => {
  const { code, H, id } = await fresh();
  await call("POST", `/tender/${code}/bid`, { amount: 990_000 }, H.A);
  await call("POST", `/tender/${code}/bid`, { amount: 970_000 }, H.B);
  SMS.length = 0;
  run("UPDATE tenders SET end_at=? WHERE id=?", Date.now() - 1000, id);
  await tenderTick(env);
  await settle();
  assert.match(smsTo(P.B)[0].text, /پیشنهاد شما کمترین قیمت بود/);
  assert.match(smsTo(P.A)[0].text, /سپاسگزاریم/);
  assert.equal(smsTo(P.C).length, 0, "بی پیشنهاد، بی پیام");
  /* درخواست و قلم باز */
  run("INSERT OR IGNORE INTO experts (id,name,label,code,active,speed,created_at) VALUES (77,'ک','کارشناس','7077',1,1,1)");
  run("INSERT INTO requests (id,date,party) VALUES ('R-77','1405/07/19','پروژه')");
  run("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,created_at) VALUES (70,'R-77',77,3,?,?)", Date.now(), Date.now());
  run("INSERT INTO items (id,request_id,item_key,line_no,title,qty,unit,state,assignment_id) VALUES (700,'R-77','k',1,'تیرآهن ۱۴',10,'شاخه','open',70)");
  const its = await call("GET", "/support/tender-req-items?rid=R-77", null, SUP);
  assert.equal(its.data.items[0].id, 700);
  const l = await call("POST", `/support/tenders/${id}/link`, { item_id: 700 }, SUP);
  assert.equal(l.status, 200, JSON.stringify(l.data));
  assert.equal(l.data.linked.lines, 2);
  const q = DB.raw.prepare("SELECT supplier_name, price, saved, final, origin FROM quotes WHERE item_id=700 ORDER BY price").all();
  assert.deepEqual(q.map((x) => [x.supplier_name, x.price, x.saved, x.final, x.origin]), [["ب", 970_000, 1, 1, "tender"], ["الف", 990_000, 1, 0, "tender"]]);
  await call("POST", `/support/tenders/${id}/link`, { item_id: 700 }, SUP);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM quotes WHERE item_id=700").get().n, 2, "دوباره زدن جای قبلی را می‌گیرد");
  const csv = await call("GET", `/support/tenders/${id}/csv`, null, SUP);
  assert.match(csv.type, /text\/csv/);
  assert.match(csv.data, /تیرآهن ۱۴/);
  assert.match(csv.data, /970000/);
});

/* ---------------- تنظیمات پشتیبان و درگاه پیامک ---------------- */
test("پیش‌فرض‌ها و درگاه پیامک مناقصه (همان TextBee، یا کلید جدا) و پیامک آزمایشی", { skip: SKIP }, async () => {
  const s0 = (await call("GET", "/support/tender-settings", null, SUP)).data;
  assert.equal(s0.sms.ready, true);
  assert.equal(s0.sms.shared, true, "همان کلید مکاتبات");
  const s1 = (await call("PUT", "/support/tender-settings", { defaults: { step_pct: 1, outbid_gap_s: 0, show_prices: false }, terms: "پرداخت نقدی", sms: { key: "tender-key-1234" } }, SUP)).data;
  assert.equal(s1.defaults.step_pct, 1);
  assert.equal(s1.sms.own_key, true);
  assert.equal(s1.sms.key_tail, "…1234");
  assert.equal(JSON.stringify(s1).includes("tender-key-1234"), false, "کلید برنمی‌گردد");
  const r = await call("POST", "/support/tenders", { title: "پیچ", qty: 1, unit: "عدد", start_price: 1000, invites: [] }, SUP);
  assert.equal(r.data.tender.step_pct, 1, "پیش‌فرض پشتیبان");
  assert.equal(r.data.tender.show_prices, false);
  assert.equal(r.data.tender.terms, "پرداخت نقدی");
  SMS.length = 0;
  assert.equal((await call("POST", "/support/tender-settings/test", { phone: "0912 444 4444" }, SUP)).status, 200);
  assert.equal(SMS[0].key, "tender-key-1234", "پیامک با کلید مناقصه");
  await call("PUT", "/support/tender-settings", { sms: { key: "" } }, SUP);
  SMS.length = 0;
  await call("POST", "/support/tender-settings/test", { phone: "09124444444" }, SUP);
  assert.equal(SMS[0].key, "tbk", "برگشت به همان درگاه مکاتبات");
  assert.equal((await call("POST", "/support/tender-settings/test", { phone: "021444" }, SUP)).status, 400);
});

/* ---------------- جستجوی هوشمند: همان موتور و ورودی‌های پنل کارشناس ---------------- */
test("جستجوی هوشمند مناقصه: همان مدل، کلید و ورودی‌های پنل کارشناس؛ نتیجه با هزینه و شماره‌ها", { skip: SKIP }, async () => {
  const { id } = await fresh({ item_code: "M14", spec: "IPE 14 — شاخهٔ ۱۲ متری" });
  /* بی کلید: نه */
  assert.equal((await call("POST", `/support/tenders/${id}/discover`, { query: "تیرآهن" }, SUP)).status, 400);
  env.ANTHROPIC_API_KEY = "k-test"; env.ANTHROPIC_API_BASE = "https://ai.test";
  assert.equal((await call("POST", `/support/tenders/${id}/discover`, { query: "تیرآهن ۱۴", markets: ["IR", "TR", "AE", "CN"] }, SUP)).status, 422, "حداکثر سه بازار");
  const q = await call("POST", `/support/tenders/${id}/discover`, { query: "تیرآهن ۱۴", markets: ["IR", "TR"], brand: "ذوب آهن", notes: "فقط عمده‌فروش" }, SUP);
  assert.equal(q.status, 200, JSON.stringify(q.data));
  assert.equal((await call("POST", `/support/tenders/${id}/discover`, { query: "x" }, SUP)).status, 400, "یکی در جریان");
  const cfg = (await call("GET", "/support/tender-settings", null, SUP)).data.ai;
  assert.equal(cfg.model, "claude-haiku-4-5-20251001", "همان مدل پیش‌فرض جستجوی هوشمند کارشناسان");
  assert.ok(cfg.markets.some((m) => m.key === "TR"));
  /* پاسخ جریانی مدل */
  const sent = [];
  const prev = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).startsWith("https://ai.test/")) {
      sent.push({ url: String(url), key: init.headers["x-api-key"], body: JSON.parse(init.body) });
      const result = { suppliers: [{ name: "آهن‌آلات تازه", type: "wholesaler", market: "ایران", phones: [{ e164: "+989125556677" }], emails: [], website: "ahan.example", price: { text: "۴۲ هزار تومان هر کیلو" } }] };
      const ev = (o) => `data: ${JSON.stringify(o)}\n\n`;
      const sse = ev({ type: "message_start", message: { usage: { input_tokens: 1000, output_tokens: 0 } } })
        + ev({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })
        + ev({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: `<result>${JSON.stringify(result)}</result>` } })
        + ev({ type: "content_block_stop", index: 0 })
        + ev({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 500, server_tool_use: { web_search_requests: 3, web_fetch_requests: 2 } } });
      return new Response(sse, { headers: { "content-type": "text/event-stream" } });
    }
    return prev(url, init);
  };
  try { assert.equal(await (await import("../../../worker/tender.js")).tenderDiscoverTick(env), true); }
  finally { globalThis.fetch = prev; delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_API_BASE; }
  assert.equal(sent.length, 1);
  assert.equal(sent[0].key, "k-test", "همان کلید ANTHROPIC_API_KEY");
  assert.equal(sent[0].body.model, "claude-haiku-4-5-20251001");
  assert.ok(sent[0].body.tools.some((t) => t.name === "web_search") && sent[0].body.tools.some((t) => t.name === "web_fetch"));
  const user = JSON.stringify([sent[0].body.system, sent[0].body.messages]);
  for (const w of ["تیرآهن ۱۴", "ذوب آهن", "فقط عمده‌فروش", "IPE 14", "ترکیه"]) assert.ok(user.includes(w), `ورودی «${w}» به مدل رفت`);
  const d = (await call("GET", `/support/tenders/${id}`, null, SUP)).data;
  const j = d.jobs[0];
  assert.equal(j.state, "done");
  assert.equal(j.model, "claude-haiku-4-5-20251001");
  assert.equal(j.searches, 3);
  assert.ok(j.cost > 0);
  assert.deepEqual(j.params.markets, ["IR", "TR"]);
  assert.equal(j.result.suppliers[0].phones[0], "09125556677");
  assert.equal(j.result.suppliers[0].market, "ایران");
  /* کار مانده از سقف زمان می‌گذرد ← «تمام نشد» و دوباره می‌شود زد */
  run("INSERT INTO tender_jobs (tender_id,query,state,at,started_at) VALUES (?,?,'running',?,?)", id, "x", Date.now() - 20 * 60000, Date.now() - 20 * 60000);
  await (await import("../../../worker/tender.js")).tenderDiscoverTick(env);
  assert.equal(get("SELECT state FROM tender_jobs WHERE tender_id=? ORDER BY id DESC LIMIT 1", id).state, "error");
});
