/* ============================================================
   تیکِ «🤖 هوشمند / ✋ دستی»ِ پنل پشتیبانی — همان لحظه در پنل کارشناس (مهر ۱۴۰۵، درخواست مالک: «کارشناسی که درخواستش وقتِ
   ✋ دستی ارسال شده، هوشمند که می‌شود، روالِ پنلش هوشمند نمی‌شود؛ باید با انتخابِ پنل پشتیبانی همان لحظه عوض شود»)

   روی SQLite واقعی (همان طرحِ ensureSchema) با تلگرام، سرویسِ push و مدلِ بدلی:
   • درخواستِ رسیده در زمانِ «✋ دستی» با «🤖 هوشمند» همان لحظه دستِ کارشناس هوشمند است (بی قیدِ on_at): «🎯 فهرست دعوت»، 🤖ِ کارتابل،
     خبر در تلگرام و اعلانِ گوشی با شمارها، و نسخهٔ تازه در /sp/x/inbox — کاری ساخته نمی‌شود
   • تکلیفِ کارِ دستیِ پیشین: جدول کمیسیون یا نامه‌دار ← دستی (پشتیبانی)، قلمِ با استعلامِ دستی ← «انجام دستی»، گفت‌وگوی دستی دست‌نخورده
   • جدول و نامهٔ درخواستِ هوشمندی که همهٔ اقلامش دستی است قفل نیست (بن‌بستِ پیشین)
   • ✋ پیشنهادهای معطل را همان لحظه کنار می‌گذارد؛ 🤖ِ دوباره کار را ادامه می‌دهد جز گفت‌وگویی که کارشناس در این فاصله خودش پیش برد
   • تیکِ تکراری کاری نمی‌کند؛ «🔁 بازسنجی» برای کارشناسِ از پیش هوشمند، اول پیش‌نمایش
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { createECDH, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import { aiTick } from "../../../worker/ai-agent.js";
import { b64u, resetVapidCache } from "../../../worker/push.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = {
  DB, MANAGER_CODE: "1234", TG_BOT_TOKEN: "tok", TG_SP_BOT_TOKEN: "sptok", TG_WEBHOOK_SECRET: "sec", TG_API_BASE: "https://tg.test/bot", TG_IGNORE_HOURS: "1",
  ANTHROPIC_API_KEY: "k", ANTHROPIC_API_BASE: "https://ai.test", SITE_ORIGIN: "https://site.test",
};
const EX = { "X-Expert-Code": "7001" }, MGR = { "X-Manager-Code": "1234" };
const T0 = Date.now();
const run = (sql, ...a) => DB.raw.prepare(sql).run(...a);
const one = (sql, ...a) => DB.raw.prepare(sql).get(...a);
const all = (sql, ...a) => DB.raw.prepare(sql).all(...a);
const norm = (head) => JSON.stringify({ v: 2, head, layers: {}, source: "catalog" });

/* دستگاهِ کارشناس برای اعلانِ گوشی (همان روشِ push-hooks.test.mjs) */
const dev = () => { const k = createECDH("prime256v1"); k.generateKeys(); const auth = randomBytes(16);
  return { k, auth, sub: { endpoint: "https://fcm.googleapis.com/fcm/send/expert1", keys: { p256dh: b64u(k.getPublicKey()), auth: b64u(auth) } } }; };
function decrypt(body, d) {
  const salt = body.subarray(0, 16), idlen = body[20], asPub = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
  const ikm = Buffer.from(hkdfSync("sha256", d.k.computeSecret(asPub), d.auth, Buffer.concat([Buffer.from("WebPush: info\0"), d.k.getPublicKey(), asPub]), 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const dc = createDecipheriv("aes-128-gcm", cek, nonce); dc.setAuthTag(ct.subarray(ct.length - 16));
  const pt = Buffer.concat([dc.update(ct.subarray(0, ct.length - 16)), dc.final()]);
  return JSON.parse(pt.subarray(0, pt.length - 1).toString("utf8"));
}
const E1 = dev();

if (DB) {
  resetVapidCache();
  await ensureSchema(env);
  run("DELETE FROM experts");
  run("INSERT INTO experts (id,name,label,code,active,speed,telegram_chat,created_at) VALUES (1,'آزمون','آقای آزمون','7001',1,1,'901',?), (2,'پیشین','خانم پیشین','7002',1,1,NULL,?)", T0, T0);
  /* «🤖 خودکار»: پاسخِ کارشناس هوشمند بی پیشنهاد می‌رود (پیش‌فرض «⏱ با مهلت» است — worker/ai-supervise.js) */
  run(`UPDATE experts SET sup_json='{"mode":"auto","minutes":10}'`);
  /* کارشناس ۱ «✋ دستی» است؛ ردیفِ پیش از این قاعده: off_at ندارد */
  run("INSERT INTO ai_agents (expert_id,mode,on_at,updated_at,updated_by) VALUES (1,'off',?,?,'support')", T0 - 9 * 3600e3, T0 - 8 * 3600e3);
  run("INSERT INTO requests (id,date,party) VALUES ('R-1','1405/07/20','پروژهٔ یک'), ('R-2','1405/07/20','پروژهٔ دو'), ('R-3','1405/07/20','پروژهٔ سه'), ('R-4','1405/07/20','پروژهٔ چهار'), ('R-5','1405/07/20','پروژهٔ پنج')");
  /* همه در زمانِ «✋ دستی» ارسال شده‌اند (پیش از هر «🤖») */
  const asg = DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,deadline_at,created_at) VALUES (?,?,1,5,?,?,?)");
  for (const [id, rid] of [[1, "R-1"], [2, "R-2"], [3, "R-3"], [4, "R-4"], [5, "R-5"]]) asg.run(id, rid, T0 - 3600e3, T0 + 5 * 86400e3, T0 - 3600e3);
  const it = DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,title,qty,unit,state,assignment_id,norm_json) VALUES (?,?,?,?,?,?,?,'open',?,?)");
  it.run(11, "R-1", "a", 1, "پیچ آلن M8", 100, "عدد", 1, norm("پیچ"));
  it.run(12, "R-1", "b", 2, "مهره M8", 50, "عدد", 1, norm("مهره"));
  it.run(21, "R-2", "a", 1, "واشر", 10, "عدد", 2, norm("واشر"));
  it.run(31, "R-3", "a", 1, "میلگرد ۱۲", 5, "تن", 3, norm("میلگرد"));
  it.run(32, "R-3", "b", 2, "میلگرد ۱۴", 3, "تن", 3, norm("میلگرد"));
  it.run(41, "R-4", "a", 1, "سیمان", 20, "تن", 4, norm("سیمان"));
  it.run(51, "R-5", "a", 1, "گریس", 40, "کیلوگرم", 5, norm("گریس"));
  /* کارِ دستیِ پیشین: جدول کمیسیونِ R-2، نامهٔ R-5 و خطِ استعلامِ قیمت‌دارِ R-4 */
  run("UPDATE assignments SET commission_at=?, commission_no=7 WHERE id=2", T0 - 1000);
  run("INSERT INTO letters (assignment_id,expert_id,state,transcript,created_at,updated_at) VALUES (5,1,'transcribed','شرحِ خرید',?,?)", T0, T0);
  run(`INSERT INTO quotes (assignment_id,item_id,supplier_name,unit,qty,price,dtime,pay,invoice,vat,saved,final,source,origin,created_at,updated_at)
    VALUES (4,41,'سیمان‌فروش','تن',20,5000000,'5','نقدی','رسمی','دارد',1,1,'panel','manual',?,?)`, T0, T0);
  run("INSERT INTO push_subs (endpoint,role,uid,p256dh,auth,created_at) VALUES (?,'expert',1,?,?,?)", E1.sub.endpoint, E1.sub.keys.p256dh, E1.sub.keys.auth, T0);
}

/* ---------- دنیای بیرونِ بدلی ---------- */
const calls = [];
let nextMsg = 5000;
let model = () => { throw new Error("پاسخِ مدل برای این گام تعریف نشده"); };
const R = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.startsWith("https://tg.test/bot")) {
    const rest = u.slice("https://tg.test/bot".length), method = rest.split("/").pop();
    calls.push({ bot: rest.startsWith("sptok") ? "sp" : "main", method, body: typeof init.body === "string" ? JSON.parse(init.body) : {} });
    if (method === "getMe") return R({ ok: true, result: { id: 77, username: rest.startsWith("sptok") ? "AriaSupplierBot" : "ArianaSupplyBot" } });
    return R({ ok: true, result: method === "sendMessage" ? { message_id: ++nextMsg } : true });
  }
  if (u.startsWith("https://fcm.googleapis.com/")) { calls.push({ bot: "push", url: u, init }); return new Response(null, { status: 201 }); }
  if (u.startsWith("https://ai.test/")) { const body = JSON.parse(init.body); calls.push({ bot: "ai", body }); return R(model(body)); }
  throw new Error(`fetch بیرونیِ پیش‌بینی‌نشده: ${u}`);
};
test.after(() => { globalThis.fetch = realFetch; });
const pend = [];
const ctx = { waitUntil: (p) => pend.push(Promise.resolve(p).catch(() => {})) };
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
const since = (n) => calls.slice(n);
const mode = (id, on) => call(`/support/ai/${id}/mode`, { method: "PUT", headers: SUP, body: { on } });
const inbox = async () => (await call("/sp/x/inbox", { headers: EX })).data.ai;
const detail = async (aid) => (await call(`/assignments/${aid}`, { headers: EX })).data;
const trayAi = async (aid) => (await call("/tray", { headers: EX })).data.assignments.find((a) => a.id === aid).ai;
const tgTo = (n, chat) => since(n).filter((c) => c.bot === "main" && c.method === "sendMessage" && String(c.body.chat_id) === chat);
const pushes = (n) => since(n).filter((c) => c.bot === "push").map((c) => decrypt(Buffer.from(c.init.body), E1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const usage = { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const turn = (o) => ({ model: "claude-opus-5-5", stop_reason: "end_turn", usage, content: [{ type: "text", text: JSON.stringify({ reply: "", actions: [], thread_status: "active", memo: "", note: "", ask_expert: "", ...o }) }] });
const S = {};

test("ارسال در زمانِ ✋ و بعد 🤖: همان لحظه دستِ کارشناس هوشمند — «🎯»، 🤖ِ کارتابل، خبر با شمارها و نسخهٔ تازهٔ inbox؛ کاری ساخته نمی‌شود", { skip: SKIP }, async () => {
  const a0 = await inbox();
  assert.deepEqual(a0, { mode: "off", rev: 0 });
  assert.equal((await detail(1)).ai.owned, null, "✋: دستِ خودِ کارشناس");
  const no = await call("/items/11/picks", { headers: EX });
  assert.equal(no.status, 409);
  assert.equal(no.data.ai_mode, true, "۴۰۹ِ «دیگر هوشمند نیست» نشان دارد تا پنل دوباره بخواند");
  assert.equal(await trayAi(1), 0);
  /* کارِ دستیِ همین فاصله: استعلامِ دستیِ قلم ۳۱ از «آهن پارس» (صفحهٔ مکاتبات) */
  const rfq = await call("/sp/x/send", { headers: EX, body: { assignment_id: 3, item_ids: [31], supplier_name: "آهن پارس", phone: "09120000301", label: "فروش" } });
  assert.equal(rfq.status, 200, JSON.stringify(rfq.data));
  S.manualTh = rfq.data.thread_id;

  const n = calls.length;
  const on = await mode(1, true);
  assert.equal(on.status, 200, JSON.stringify(on.data));
  assert.equal(on.data.changed, true);
  assert.deepEqual(on.data.counts, { idle: 3, keep: 2, items: 2, live: 0, human: 0, props: 0 }, "R-1، R-3، R-4 هوشمند؛ R-2 و R-5 دستی؛ قلم‌های ۳۱ و ۴۱ «انجام دستی»");
  const g = one("SELECT mode, on_at, rev, off_at FROM ai_agents WHERE expert_id=1");
  assert.equal(g.mode, "on");
  assert.ok(g.on_at >= T0, "on_at فقط برای نمایش");
  const a1 = await inbox();
  assert.equal(a1.mode, "on");
  assert.ok(a1.rev > a0.rev, "نسخه جلو رفت — پنلِ باز همان لحظه تازه می‌شود");

  const d = await detail(1);
  assert.deepEqual([d.ai.owned && d.ai.owned.state, d.ai.owned && d.ai.owned.run_id, d.ai.owned && d.ai.owned.end], ["pending", null, true]);
  assert.deepEqual(d.ai.items.map((i) => [i.id, i.manual, i.started_at]), [[11, false, null], [12, false, null]], "هر دو «🎯 منتظرِ شروع»");
  const pk = await call("/items/11/picks", { headers: EX });
  assert.equal(pk.status, 200, JSON.stringify(pk.data));
  assert.equal(await trayAi(1), 1, "🤖 در کارتابل");
  assert.equal(one("SELECT COUNT(*) AS n FROM ai_runs").n, 0, "کاری ساخته نمی‌شود — «🚀 شروع»ِ کارشناس یا ▶️ پشتیبانی");

  /* خبر: تلگرام (صفِ همان batch، فرستاده با flush) و اعلانِ گوشی، با شمارها */
  const ob = all("SELECT target, payload_json FROM outbox WHERE idem LIKE 'aimode:1:%'");
  assert.equal(ob.length, 1);
  assert.equal(ob[0].target, "901");
  const txt = JSON.parse(ob[0].payload_json).text;
  assert.match(txt, /کارشناس هوشمندِ شما روشن شد[\s\S]*۳ درخواستِ باز در حالت هوشمند است[\s\S]*۲ درخواست[\s\S]*دستی ماند[\s\S]*۲ قلم[\s\S]*«انجام دستی» شد/);
  assert.equal(tgTo(n, "901").length, 1, "فرستاده شد");
  const p = pushes(n);
  assert.equal(p.length, 1, "اعلانِ گوشی");
  assert.match(p[0].t, /کارشناس هوشمندِ شما روشن شد/);
  assert.match(p[0].b, /۳ درخواستِ باز هوشمند شد/);
  /* رخدادها: تیک با شمارها، و تکلیفِ هر درخواست با کنشگرِ «پشتیبانی» */
  const ev = one("SELECT actor, payload_json FROM events WHERE kind='ai_on'");
  assert.equal(ev.actor, "support");
  assert.equal(JSON.parse(ev.payload_json).keep, 2);
  assert.deepEqual(all("SELECT request_id, actor FROM events WHERE kind='ai_tick' ORDER BY request_id").map((r) => [r.request_id, r.actor]), [["R-2", "support"], ["R-5", "support"]]);
  assert.deepEqual(all("SELECT request_id, payload_json FROM events WHERE kind='ai_manual' ORDER BY request_id").map((r) => [r.request_id, JSON.parse(r.payload_json).items]), [["R-3", [31]], ["R-4", [41]]]);
  const feed = (await call("/support/activity?g=asg", { headers: SUP })).data.rows;
  assert.ok(feed.some((r) => /تیکِ «🤖 هوشمند \/ ✋ دستی»ِ ارجاع — ✋ دستی — جدول کمیسیون یا نامه/.test(r.text) && r.by === "support"), JSON.stringify(feed.map((r) => r.text)));
});

test("نگهبان‌ها: درخواستِ جدول‌دار و نامه‌دار ✋ می‌ماند و کمیسیونش ۴۲۳ نیست؛ قلمِ با استعلامِ دستی «انجام دستی»، کنارش «🎯»؛ گفت‌وگوی دستی هرگز دعوت نمی‌شود", { skip: SKIP }, async () => {
  const a2 = one("SELECT ai_on, ai_set_by, ai_note FROM assignments WHERE id=2");
  assert.deepEqual([a2.ai_on, a2.ai_set_by], [0, "support"]);
  assert.match(a2.ai_note, /جدول کمیسیون یا نامه/);
  const d2 = await detail(2);
  assert.deepEqual([d2.ai.owned, d2.ai.on, d2.ai.set_by], [null, false, "support"], "نوارِ «✋ دستی ماند — پشتیبانی»");
  const cm = await call("/assignments/2/commission", { headers: EX, body: {} });
  assert.notEqual(cm.status, 423, JSON.stringify(cm.data));
  assert.equal((await call("/assignments/5/letter", { headers: EX, body: {} })).status, 200, "نامهٔ R-5 هم با خودِ کارشناس");
  assert.equal(await trayAi(2), 0);
  /* مدیر می‌تواند تیکش را بزند (و این هم نسخهٔ پنلِ کارشناس را جلو می‌برد) */
  const r0 = (await inbox()).rev;
  assert.equal((await call("/assign/ai", { headers: MGR, body: { assignment_id: 2, on: true } })).status, 200);
  assert.ok((await inbox()).rev > r0, "تیکِ مدیر ← پنلِ کارشناس تازه می‌شود");
  assert.equal((await call("/assign/ai", { headers: MGR, body: { assignment_id: 2, on: false, reason: "جدولش را خودش ساخته" } })).status, 200);

  /* R-3: قلمِ ۳۱ «انجام دستی»، قلمِ ۳۲ «🎯 منتظرِ شروع»؛ گفت‌وگوی دستی دست‌نخورده و باز */
  assert.deepEqual(all("SELECT id, ai_off FROM items WHERE assignment_id=3 ORDER BY id").map((r) => [r.id, r.ai_off]), [[31, 1], [32, null]]);
  const d3 = await detail(3);
  assert.deepEqual(d3.ai.items.map((i) => [i.id, i.manual, i.mode, i.started_at]), [[31, true, "pick", null], [32, false, "pick", null]]);
  assert.equal(d3.ai.owned.end, true, "قلمِ ۳۲ هنوز به کارشناس هوشمند می‌رسد");
  assert.ok(!one("SELECT 1 AS x FROM ai_threads WHERE thread_id=?", S.manualTh));
  const mt = await call(`/sp/thread/${S.manualTh}`, { headers: EX });
  assert.equal(mt.status, 200);
  assert.equal(!!(mt.data.thread.ai && mt.data.thread.ai.locked), false, "گفت‌وگوی دستی باز است");
  assert.equal((await call(`/sp/thread/${S.manualTh}/msg`, { headers: EX, body: { text: "سلام، قیمتِ میلگرد ۱۲ را لطفاً امروز بفرستید." } })).status, 200);

  /* «🚀 شروع»ِ قلمِ ۳۲ با «آهن پارس» (گفت‌وگوی دستی) و «فولاد نو» در فهرست، هر دو با شمارهٔ پنل: فقط «فولاد نو» دعوت می‌شود */
  run("UPDATE sp_phones SET panel=1");
  const fn = await call("/sp/x/phones", { headers: EX, body: { supplier_name: "فولاد نو", phone: "09120000302", label: "فروش", panel: true } });
  assert.equal(fn.status, 200, JSON.stringify(fn.data));
  const k = (name) => one("SELECT name_n FROM sp_suppliers WHERE name=?", name).name_n;
  const pick = { list: [{ k: k("آهن پارس"), name: "آهن پارس", src: "manual", pos: 1, top: false, on: true, go: T0, ph: [] },
    { k: k("فولاد نو"), name: "فولاد نو", src: "manual", pos: 2, top: false, on: true, go: T0, ph: [] }], at: T0, by: "expert:1" };
  run("UPDATE items SET pick_json=?, ai_start_at=?, ai_start_by='expert:1', frozen_at=? WHERE id=32", JSON.stringify(pick), T0, T0);
  run("INSERT INTO ai_runs (assignment_id,expert_id,request_id,state,data_json,next_at,created_at,updated_at) VALUES (3,1,'R-3','work',?,0,?,?)",
    JSON.stringify({ items: [{ id: 32, title: "میلگرد ۱۴", qty: 3, unit: "تن", prep: 1, smart: { off: true } }], cands: [], how: "pick", flow: 2 }), T0, T0);
  for (let i = 0; i < 3; i++) { run("UPDATE ai_runs SET next_at=0 WHERE assignment_id=3"); await aiTick(env); }
  const th = all(`SELECT t.id, s.name, x.thread_id AS ai, (SELECT GROUP_CONCAT(l.item_id) FROM sp_lines l WHERE l.thread_id=t.id) AS lines
    FROM sp_threads t JOIN sp_suppliers s ON s.id=t.supplier_id LEFT JOIN ai_threads x ON x.thread_id=t.id WHERE t.assignment_id=3 ORDER BY t.id`);
  assert.deepEqual(th.map((x) => [x.name, !!x.ai, x.lines]), [["آهن پارس", false, "31"], ["فولاد نو", true, "32"]], "گفت‌وگوی دستی نه دعوت شد و نه قلمِ تازه گرفت");
  assert.equal(all("SELECT id FROM sp_msgs WHERE thread_id=? AND COALESCE(json_extract(meta_json,'$.ai'),0)=1", S.manualTh).length, 0, "هیچ پیامِ کارشناس هوشمند در گفت‌وگوی دستی");
});

test("درخواستِ هوشمندی که همهٔ اقلامش دستی است: جدول و نامه با خودِ کارشناس (بن‌بستِ پیشین)؛ قلمِ هوشمند داشته باشد، قفل", { skip: SKIP }, async () => {
  assert.equal(one("SELECT ai_off FROM items WHERE id=41").ai_off, 1);
  const d4 = await detail(4);
  assert.deepEqual([d4.ai.owned && d4.ai.owned.state, d4.ai.owned && d4.ai.owned.end], ["pending", false], "دستِ کارشناس هوشمند ولی جدول و نامه آزاد");
  const cm = await call("/assignments/4/commission", { headers: EX, body: {} });
  assert.notEqual(cm.status, 423, JSON.stringify(cm.data));
  assert.ok(!(cm.data && cm.data.ai_locked));
  assert.equal((await call("/assignments/4/letter", { headers: EX, body: {} })).status, 200);
  /* «مستقیم» هم به کارشناس هوشمند نمی‌رسد (مگر تیکِ خودِ کارشناس): فقط قلمِ «مستقیم» ← آزاد */
  assert.equal((await call("/support/ai/modes", { method: "PUT", headers: SUP, body: { heads: { "مهره": { mode: "direct" }, "پیچ": { mode: "direct" } } } })).status, 200);
  const { resetModesCache } = await import("../../../worker/ai-modes.js");
  resetModesCache();
  assert.equal((await detail(1)).ai.owned.end, false, "R-1: هر دو قلم «مستقیم»");
  assert.notEqual((await call("/assignments/1/letter", { headers: EX, body: {} })).status, 423);
  assert.equal((await call("/support/ai/modes", { method: "PUT", headers: SUP, body: { heads: {} } })).status, 200);
  resetModesCache();
  /* R-1 با قلمِ هوشمند: جدول و نامه قفل‌اند */
  assert.equal((await detail(1)).ai.owned.end, true);
  const lk = await call("/assignments/1/commission", { headers: EX, body: {} });
  assert.equal(lk.status, 423);
  assert.equal(lk.data.ai_locked, true);
  assert.equal((await call("/assignments/1/letter/transcript", { method: "PUT", headers: EX, body: { letter_id: 1, transcript: "x".repeat(40) } })).status, 423);
});

test("🤖 ← ✋ ← 🤖: ✋ پیشنهادهای معطل را همان لحظه کنار می‌گذارد؛ درخواستِ بی کار هوشمند می‌ماند، کار ادامه می‌یابد و گفت‌وگویی که کارشناس پیش برد دستِ خودش", { skip: SKIP }, async () => {
  const t = Date.now();
  run("INSERT INTO requests (id,date,party) VALUES ('R-6','1405/07/20','پروژهٔ شش')");
  run("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,deadline_at,created_at) VALUES (6,'R-6',1,5,?,?,?)", t, t + 5 * 86400e3, t);
  run("INSERT INTO items (id,request_id,item_key,line_no,title,qty,unit,state,assignment_id,norm_json,ai_start_at,frozen_at) VALUES (61,'R-6','a',1,'لوله',30,'متر','open',6,?,?,?)", norm("لوله"), t, t);
  const rid = Number(run("INSERT INTO ai_runs (assignment_id,expert_id,request_id,state,data_json,next_at,created_at,updated_at) VALUES (6,1,'R-6','work',?,?,?,?)",
    JSON.stringify({ items: [{ id: 61, title: "لوله", qty: 30, unit: "متر", prep: 1, smart: { off: true } }], cands: [], how: "pick", flow: 2 }), t + 9e8, t, t).lastInsertRowid);
  S.run6 = rid;
  run("INSERT INTO sp_suppliers (id,name,name_n,demo,created_at) VALUES (61,'شرکت یک','شرکت یک',0,?), (62,'شرکت دو','شرکت دو',0,?)", t, t);
  run("INSERT INTO sp_threads (id,assignment_id,request_id,supplier_id,last_at,created_at) VALUES (601,6,'R-6',61,?,?), (602,6,'R-6',62,?,?)", t, t, t, t);
  for (const th of [601, 602]) {
    run("INSERT INTO sp_lines (thread_id,item_id,title,head,req_qty,req_unit,state,no,created_at,updated_at) VALUES (?,61,'لوله','لوله',30,'متر','new',1,?,?)", th, t, t);
    run("INSERT INTO sp_msgs (thread_id,who,kind,body,meta_json,at) VALUES (?,'e','text','سلام، برای لوله قیمت می‌خواستیم','{\"ai\":true}',?)", th, t);
    run("INSERT INTO sp_msgs (thread_id,who,kind,body,at) VALUES (?,'s','text','قیمت را تا عصر می‌فرستیم؛ تحویل کجاست؟',?)", th, t + 1);
  }
  const top = (th) => one("SELECT MAX(id) AS n FROM sp_msgs WHERE thread_id=?", th).n;
  run("INSERT INTO ai_threads (thread_id,run_id,source,state,seen_msg,created_at,updated_at) VALUES (601,?,'history','active',?,?,?), (602,?,'history','active',?,?,?)", rid, top(601), t, t, rid, top(602), t, t);
  /* پیشنهادِ معطلِ «⏱ با مهلت» در گفت‌وگوی ۶۰۱ — ده دقیقهٔ دیگر خودکار می‌رفت */
  run("INSERT INTO ai_props (run_id,thread_id,kind,body,seen_msg,state,created_at,due_at) VALUES (?,601,'reply','تحویل در کارگاهِ پروژه است.',?,'pending',?,?)", rid, top(601), t, t + 600e3);
  assert.equal((await detail(6)).ai.owned.run_id, rid);

  const r0 = (await inbox()).rev, n = calls.length;
  const off = await mode(1, false);
  assert.equal(off.status, 200, JSON.stringify(off.data));
  assert.equal(off.data.changed, true);
  assert.equal(off.data.counts.props, 1);
  assert.equal(off.data.counts.live, 2, "کارهای R-3 و R-6");
  const p = one("SELECT state, decided_by FROM ai_props WHERE thread_id=601");
  assert.deepEqual([p.state, p.decided_by], ["off", "support"], "همان لحظه کنار رفت — بی Cron و بی مهلت");
  const g = one("SELECT mode, off_at FROM ai_agents WHERE expert_id=1");
  assert.equal(g.mode, "off");
  assert.ok(g.off_at >= t, "لحظهٔ ✋ برای 🤖ِ بعدی");
  assert.ok(one("SELECT retry_at FROM ai_threads WHERE thread_id=601").retry_at, "با 🤖ِ بعدی از نو سنجیده می‌شود");
  assert.ok(one("SELECT 1 AS x FROM ai_log WHERE run_id=? AND kind='run' AND body LIKE '%«دستی» شد%'", rid), "در گزارشِ کار");
  const a = await inbox();
  assert.deepEqual([a.mode, a.rev > r0], ["off", true]);
  assert.equal((await detail(1)).ai.owned, null, "✋: درخواستِ بی کار دستِ خودِ کارشناس");
  assert.match(JSON.parse(one("SELECT payload_json FROM outbox WHERE idem LIKE 'aimode:1:%' ORDER BY id DESC LIMIT 1").payload_json).text,
    /پنل شما «دستی» شد[\s\S]*کارِ کارشناس هوشمند نگه داشته شد[\s\S]*۱ پیشنهادِ «⏱ با مهلت» کنار رفت/);
  assert.equal(pushes(n).length, 1);
  assert.match(pushes(n)[0].t, /دستی/);
  assert.deepEqual(await aiTick(env), { ai: 0 }, "کاری برداشته نمی‌شود");

  /* در زمانِ ✋ کارشناس خودش در گفت‌وگوی ۶۰۲ جواب داد */
  await sleep(5);
  assert.equal((await call("/sp/thread/602/msg", { headers: EX, body: { text: "تحویل در کارگاه؛ لطفاً قیمت را امروز بفرستید." } })).status, 200);
  run("INSERT INTO sp_msgs (thread_id,who,kind,body,at) VALUES (602,'s','text','چشم، تا عصر.',?)", Date.now());

  const on = await mode(1, true);
  assert.equal(on.status, 200, JSON.stringify(on.data));
  assert.deepEqual([on.data.counts.human, on.data.counts.live, on.data.counts.props], [1, 2, 0]);
  const x2 = one("SELECT state, ask_json FROM ai_threads WHERE thread_id=602");
  assert.equal(x2.state, "human", "گفت‌وگویی که کارشناس پیش برد دستِ خودش — همان «🚨 باز کردنِ اضطراری»");
  assert.equal(JSON.parse(x2.ask_json).takeover.by, "system");
  assert.equal(one("SELECT state FROM ai_threads WHERE thread_id=601").state, "active");
  assert.equal((await call("/sp/thread/602", { headers: EX })).data.thread.ai.human, true, "در مکاتبات «🤖 برگرداندن» دارد");
  assert.equal((await call("/sp/x/threads", { headers: EX })).data.requests.flatMap((r) => r.threads).find((x) => x.id === 602).ai, "human");
  const d1 = await detail(1);
  assert.deepEqual([d1.ai.owned && d1.ai.owned.state, one("SELECT ai_on FROM assignments WHERE id=1").ai_on], ["pending", null], "درخواستِ بی کار دوباره هوشمند — نه «دستیِ همیشگی»");
  assert.ok(one("SELECT next_at FROM ai_runs WHERE id=?", rid).next_at <= Date.now(), "کار همین حالا سررسید است");
  /* کار ادامه دارد: گفت‌وگوی ۶۰۱ (پیشنهادش کنار رفته بود) دورِ تازه می‌گیرد، ۶۰۲ نه */
  run("UPDATE ai_runs SET next_at=? WHERE id<>?", Date.now() + 9e8, rid);
  const asked = [];
  model = (b) => { asked.push(b.messages[0].content[0].text); return turn({ reply: "تحویل در کارگاهِ پروژه است؛ منتظرِ قیمتتان هستیم 🙏" }); };
  const r = await aiTick(env);
  assert.deepEqual([r.ai, r.step, r.thread], [1, "turn", 601], JSON.stringify(r));
  assert.ok(one("SELECT 1 AS x FROM sp_msgs WHERE thread_id=601 AND json_extract(meta_json,'$.ai')=1 AND body LIKE 'تحویل در کارگاهِ پروژه%'"), "پاسخِ تازهٔ کارشناس هوشمند");
  run("UPDATE ai_runs SET next_at=0 WHERE id=?", rid);
  await aiTick(env);
  assert.ok(!one("SELECT 1 AS x FROM sp_msgs WHERE thread_id=602 AND json_extract(meta_json,'$.ai')=1 AND at>?", t + 1), "در گفت‌وگوی دستِ کارشناس جواب نمی‌دهد");
  /* «🤖 برگرداندن» همان مسیرِ همیشگی */
  assert.equal((await call("/sp/x/thread/602/handback", { headers: EX, body: {} })).status, 200);
  assert.equal(one("SELECT state FROM ai_threads WHERE thread_id=602").state, "active");
});

test("تیکِ تکراری کاری نمی‌کند؛ «انجام دستی»ِ تأییدشده و ردِ تحویل هم پنل را تازه می‌کنند", { skip: SKIP }, async () => {
  const before = { rev: (await inbox()).rev, ev: one("SELECT COUNT(*) AS n FROM events WHERE kind IN ('ai_on','ai_off')").n, ob: one("SELECT COUNT(*) AS n FROM outbox WHERE idem LIKE 'aimode:%'").n };
  const again = await mode(1, true);
  assert.equal(again.status, 200);
  assert.deepEqual([again.data.changed, again.data.counts], [false, null]);
  assert.equal((await inbox()).rev, before.rev, "نسخه همان");
  assert.equal(one("SELECT COUNT(*) AS n FROM events WHERE kind IN ('ai_on','ai_off')").n, before.ev, "رخدادِ تازه‌ای نیست");
  assert.equal(one("SELECT COUNT(*) AS n FROM outbox WHERE idem LIKE 'aimode:%'").n, before.ob, "خبرِ تازه‌ای نیست");
  const rb = await call("/support/ai/1/rebase", { headers: SUP, body: { dry: false } });
  assert.equal(rb.status, 200, JSON.stringify(rb.data));
  assert.equal(rb.data.changed, false, "تکلیفِ همه روشن است");

  /* «انجام دستی»ِ قلم ۱۲ با تأییدِ مدیر */
  const q = await call("/assignments/1/decision", { headers: EX, body: { action: "manual", item_ids: [12], reason: "تأمین‌کنندهٔ ثابتِ خودمان" } });
  assert.equal(q.status, 200, JSON.stringify(q.data));
  const r1 = (await inbox()).rev;
  assert.equal((await call(`/decisions/${q.data.decision_id}/approve`, { headers: MGR, body: {} })).status, 200);
  assert.ok((await inbox()).rev > r1, "«انجام دستی»ِ تأییدشده ← پنل تازه");
  /* ردِ تحویلِ کارشناس هوشمند */
  run("UPDATE ai_runs SET review_json=? WHERE id=?", JSON.stringify({ state: "new" }), S.run6);
  const r2 = (await inbox()).rev;
  assert.equal((await call(`/support/ai/deliveries/${S.run6}/review`, { headers: SUP, body: { ok: false, reason: "پیشنهادِ سوم لازم است" } })).status, 200);
  assert.ok((await inbox()).rev > r2, "ردِ تحویل ← پنل تازه");
});

test("پنل: TP.inbox فقط با تغییرِ حالت یا نسخه onAi را صدا می‌زند (نه بارِ اول)، و ۴۲۳ِ ai_locked به قلابِ صفحه می‌رسد", async () => {
  /* shared.js واقعی در vm با زمان‌سنجِ دستی — همان نظرسنجیِ هر ۱۰ ثانیهٔ پنل کارشناس و مکاتبات */
  const queue = [], store = new Map();
  const sb = { console, Date, Math, JSON, Promise, setTimeout: (fn) => { queue.push(fn); return queue.length; }, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    document: { title: "پنل", hidden: false }, sessionStorage: { getItem: (k) => store.get(k) || null, setItem: (k, v) => store.set(k, v) },
    localStorage: { getItem: () => null, setItem: () => {} }, location: { href: "" } };
  sb.window = sb; sb.self = sb; sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(readFileSync(fileURLToPath(new URL("../../../frontend/tamin-poshtibani/shared.js", import.meta.url)), "utf8"), sb, { filename: "shared.js" });
  const seq = [{ mode: "off", rev: 0 }, { mode: "off", rev: 0 }, { mode: "on", rev: 1 }, { mode: "on", rev: 1 }, { mode: "on", rev: 2 }, { mode: "off", rev: 3 }];
  let i = 0;
  const fired = [];
  sb.TP.inbox.start({ summary: false, api: async () => ({ last: 1, unread: 0, msgs: [], asks: 0, ask_list: [], ai: seq[Math.min(i++, seq.length - 1)] }), onAi: (a) => fired.push(`${a.mode}:${a.rev}`) });
  for (let k = 0; k < seq.length; k++) await queue.shift()();
  assert.deepEqual(fired, ["on:1", "on:2", "off:3"]);
  let hooked = null;
  sb.TP.onApiError = (e) => { hooked = e; };
  sb.fetch = async () => ({ ok: false, status: 423, text: async () => JSON.stringify({ error: "قفل", ai_locked: true }) });
  await assert.rejects(sb.TP.api("/assignments/1/commission", { body: {} }), (e) => e.status === 423);
  assert.equal(hooked && hooked.data && hooked.data.ai_locked, true, "پنل کارشناس صفحه را همان لحظه دوباره می‌خواند");
});

test("«🔁 بازسنجی» برای کارشناسِ از پیش هوشمند: اول پیش‌نمایش بی نوشتن، بعد همان تکلیف، و دوباره‌زدنش هیچ؛ برای کارشناسِ دستی نه", { skip: SKIP }, async () => {
  const t = Date.now();
  /* کارشناس ۲ پیش از این قاعده هوشمند شده بود؛ درخواست‌هایش پیش از روشن شدن رسیده‌اند و حالا (بی قیدِ زمان) دستِ کارشناس هوشمندند */
  run("INSERT INTO ai_agents (expert_id,mode,on_at,updated_at,updated_by) VALUES (2,'on',?,?,'support')", t - 1000, t - 1000);
  run("INSERT INTO requests (id,date,party) VALUES ('R-B1','1405/07/10','پروژهٔ ب۱'), ('R-B2','1405/07/10','پروژهٔ ب۲')");
  run("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,deadline_at,commission_no,commission_at,created_at) VALUES (21,'R-B1',2,5,?,?,9,?,?)", t - 9e7, t + 9e7, t - 5e7, t - 9e7);
  run("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,deadline_at,created_at) VALUES (22,'R-B2',2,5,?,?,?)", t - 9e7, t + 9e7, t - 9e7);
  run("INSERT INTO items (id,request_id,item_key,line_no,title,qty,unit,state,assignment_id,norm_json) VALUES (211,'R-B1','a',1,'پیچ',5,'عدد','open',21,?), (221,'R-B2','a',1,'کابل',100,'متر','open',22,?), (222,'R-B2','b',2,'فیوز',4,'عدد','open',22,?)",
    norm("پیچ"), norm("کابل"), norm("فیوز"));
  run(`INSERT INTO quotes (assignment_id,item_id,supplier_name,unit,qty,price,saved,final,source,origin,created_at,updated_at) VALUES (22,221,'کابل‌فروش','متر',100,90000,1,0,'telegram','manual',?,?)`, t, t);
  const EX2 = { "X-Expert-Code": "7002" };
  assert.equal((await call("/assignments/21/commission", { headers: EX2, body: {} })).status, 423, "بی بازسنجی: جدولِ ساخته‌شدهٔ دستی هم قفل می‌شد");

  const evs = () => one("SELECT COUNT(*) AS n FROM events").n;
  const e0 = evs(), rev0 = one("SELECT rev FROM ai_agents WHERE expert_id=2").rev;
  const dry = await call("/support/ai/2/rebase", { headers: SUP, body: {} });
  assert.equal(dry.status, 200, JSON.stringify(dry.data));
  assert.deepEqual([dry.data.dry, dry.data.changed, dry.data.counts.keep, dry.data.counts.items, dry.data.counts.idle], [true, false, 1, 1, 1]);
  assert.deepEqual(dry.data.keep.map((x) => x.request_id), ["R-B1"]);
  assert.deepEqual(dry.data.items.map((x) => [x.request_id, x.title]), [["R-B2", "کابل"]]);
  assert.deepEqual([one("SELECT ai_on FROM assignments WHERE id=21").ai_on, one("SELECT ai_off FROM items WHERE id=221").ai_off, evs(), one("SELECT rev FROM ai_agents WHERE expert_id=2").rev],
    [null, null, e0, rev0], "پیش‌نمایش هیچ نمی‌نویسد");

  const go = await call("/support/ai/2/rebase", { headers: SUP, body: { dry: false } });
  assert.equal(go.status, 200, JSON.stringify(go.data));
  assert.deepEqual([go.data.dry, go.data.changed], [false, true]);
  assert.deepEqual(Object.values(one("SELECT ai_on, ai_set_by FROM assignments WHERE id=21")), [0, "support"]);
  assert.deepEqual(all("SELECT id, ai_off FROM items WHERE assignment_id=22 ORDER BY id").map((r) => [r.id, r.ai_off]), [[221, 1], [222, null]]);
  assert.ok(one("SELECT 1 AS x FROM events WHERE kind='ai_rebase'"));
  assert.ok(one("SELECT rev FROM ai_agents WHERE expert_id=2").rev > rev0, "پنلِ بازِ کارشناس تازه می‌شود");
  assert.notEqual((await call("/assignments/21/commission", { headers: EX2, body: {} })).status, 423, "حالا جدول با خودِ کارشناس");
  const d22 = (await call("/assignments/22", { headers: EX2 })).data;
  assert.deepEqual(d22.ai.items.map((i) => [i.id, i.manual]), [[221, true], [222, false]]);
  const e1 = evs();
  const twice = await call("/support/ai/2/rebase", { headers: SUP, body: { dry: false } });
  assert.deepEqual([twice.data.changed, evs()], [false, e1], "دوباره‌زدن کاری نمی‌کند");

  assert.equal((await mode(2, false)).status, 200);
  assert.equal((await call("/support/ai/2/rebase", { headers: SUP, body: {} })).status, 409, "برای کارشناسِ ✋ نه — با 🤖 کردنش خودش انجام می‌شود");
  assert.equal((await call("/support/ai/2/rebase", { headers: EX2, body: {} })).status, 401, "فقط پشتیبانی");
});
