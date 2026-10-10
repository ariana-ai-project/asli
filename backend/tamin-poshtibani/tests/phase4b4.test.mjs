/* ============================================================
   طرح «خرید هوشمند، کارشناس ناظر» — فاز ۴ب، گام ۴ (مهر ۱۴۰۵): «👁 حالت تأیید»

   روی SQLite واقعی (همان طرحِ ensureSchema)، با تلگرام، انبار و مدلِ بدلی:
   پشتیبانی نوع قلمی را «مجازِ تأیید» می‌کند ← مدیر در ارجاع «👁» می‌زند (یا کارشناس پیش از «🚀 شروع» با توضیح می‌خواهد و مدیر
   تأیید می‌کند) ← کارشناس در «حساب من» می‌گوید کدام کار تأیید بخواهد ← در گفت‌وگوی «با تأیید» تأیید نهایی و پاسخِ مدل پیشنهاد
   می‌شوند و نمی‌روند ← کارشناس تأیید (بی توضیح) یا رد (با توضیح، بعد پیامِ خودش یا هیچ) می‌کند — در مکاتبات و بات ← پیامِ تازهٔ
   تأمین‌کننده پیشنهادِ پاسخِ معطل را کنار می‌گذارد ← خاموش کردنِ مدیر کار را بی تأیید ادامه می‌دهد.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";

import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import { aiTick } from "../../../worker/ai-agent.js";
import { handleUpdate } from "../../../worker/bot.js";
import * as SP from "../../../worker/sp-core.js";
import { resetModesCache } from "../../../worker/ai-modes.js";
import { supCfg, rejectBody, SUP_DEFAULT } from "../../../worker/ai-supervise.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = {
  DB, MANAGER_CODE: "1234", TG_BOT_TOKEN: "tok", TG_SP_BOT_TOKEN: "sptok", TG_WEBHOOK_SECRET: "sec", TG_API_BASE: "https://tg.test/bot",
  SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_KEY: "svc", ANTHROPIC_API_KEY: "k", ANTHROPIC_API_BASE: "https://ai.test", SITE_ORIGIN: "https://site.test", TG_IGNORE_HOURS: "1",
};
const EX = { "X-Expert-Code": "7001" }, MG = { "X-Manager-Code": "1234" };
const EXPERT_CHAT = "701";
const norm = (head) => JSON.stringify({ v: 2, head, layers: {}, source: "catalog" });

if (DB) {
  await ensureSchema(env);
  const t = Date.now();
  DB.raw.exec("DELETE FROM experts");
  DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,telegram_chat,created_at) VALUES (1,'هوشمند','هوشمند','7001',1,1,?,?)").run(EXPERT_CHAT, t);
  DB.raw.prepare("INSERT INTO ai_agents (expert_id,mode,on_at,updated_at) VALUES (1,'on',?,?)").run(t - 60000, t);
  DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES ('R-S','1405/07/15','پروژهٔ پیچ'), ('R-Q','1405/07/15','پروژهٔ مهره')").run();
  DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,deadline_at,created_at) VALUES (1,'R-S',1,5,?,?,?), (2,'R-Q',1,5,?,?,?)").run(t, t + 9e8, t, t, t + 9e8, t);
  const ins = DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,title,qty,unit,state,assignment_id,norm_json) VALUES (?,?,?,?,?,?,?,'open',?,?)");
  ins.run(31, "R-S", "a", 1, "پیچ M10", 400, "عدد", 1, norm("پیچ"));
  ins.run(32, "R-S", "b", 2, "مهره M10", 400, "عدد", 1, norm("مهره"));
  ins.run(41, "R-Q", "a", 1, "پیچ M12", 100, "عدد", 2, norm("پیچ"));
  ins.run(42, "R-Q", "b", 2, "مهره M12", 100, "عدد", 2, norm("مهره"));
}

/* ---------- دنیای بیرونِ بدلی ---------- */
const calls = [];
let model = () => { throw new Error("پاسخِ مدل برای این گام تعریف نشده"); };
const R = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.startsWith("https://tg.test/bot")) {
    const method = u.split("/").pop();
    calls.push({ bot: "tg", method, body: init.body ? JSON.parse(init.body) : null });
    if (method === "getMe") return R({ ok: true, result: { id: 77, username: "AriaSupplierBot" } });
    return R({ ok: true, result: method === "sendMessage" ? { message_id: calls.length } : true });
  }
  if (u.startsWith("https://sb.test/storage/v1/object/sign/")) return R({ signedURL: "/object/sign/proformas/x?token=abc" });
  if (u.startsWith("https://sb.test/")) return (init.method || "GET") === "GET" ? new Response("nf", { status: 404 }) : R({ Key: "x" });
  if (u.startsWith("https://ai.test/")) { const b = JSON.parse(init.body); calls.push({ bot: "ai", body: b }); return R(model(b)); }
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
const usage = { input_tokens: 1000, output_tokens: 100 };
const jsonOut = (o) => ({ model: "claude-opus-5-5", stop_reason: "end_turn", usage, content: [{ type: "text", text: JSON.stringify(o) }] });
const reply = (text) => jsonOut({ reply: text, actions: [], thread_status: "active", memo: "یادداشت.", note: "", ask_expert: "" });
async function supplierSession(phone) {
  const p = DB.raw.prepare("SELECT id FROM sp_phones WHERE phone=?").get(phone);
  return { "X-SP-Session": await SP.newSession(env, p.id, "web") };
}
const props = (th) => DB.raw.prepare("SELECT * FROM ai_props WHERE thread_id=? ORDER BY id").all(th);
const outbox = (re) => DB.raw.prepare("SELECT payload_json FROM outbox WHERE target=? ORDER BY id").all(EXPERT_CHAT).map((r) => JSON.parse(r.payload_json)).filter((p) => !re || re.test(p.text));
let cbn = 0;
const tg = (data) => handleUpdate(env, { callback_query: { id: `cb${++cbn}`, data, message: { message_id: 900 + cbn, chat: { id: EXPERT_CHAT }, text: "کارت" } } });
const tgText = (text) => handleUpdate(env, { message: { message_id: 5000 + ++cbn, chat: { id: EXPERT_CHAT, type: "private" }, text } });
const sentTexts = () => calls.filter((c) => c.bot === "tg" && c.method === "sendMessage").map((c) => c.body.text);
let SUPH = {};
if (DB) SUPH = { "X-Support-Token": (await call("/support/setup", { body: { pass: "9753" } })).data.token };
const S = {};

test("تنظیماتِ «👁 حالت تأیید» و بدنهٔ «رد» (بی پایگاه داده)", () => {
  assert.deepEqual(supCfg(null), SUP_DEFAULT, "پیش‌فرض: چت خودکار، تصمیمِ بسته با تأیید");
  assert.deepEqual(SUP_DEFAULT, { chat: false, bundle: true });
  assert.deepEqual(supCfg('{"chat":true}'), { chat: true, bundle: true });
  assert.throws(() => rejectBody({ kind: "reply" }, { reason: " " }), (e) => e.status === 422 && e.extra.need_reason);
  assert.deepEqual(rejectBody({ kind: "reply" }, { reason: "لحن تند است", text: "" }), { reason: "لحن تند است", text: "", bundle: null });
  assert.equal(rejectBody({ kind: "final" }, { reason: "گران", text: "لطفاً قیمت را اصلاح کنید" }).bundle, "return", "ردِ تأیید نهایی با پیام: برگشت");
  assert.equal(rejectBody({ kind: "final" }, { reason: "گران" }).bundle, "keep", "بی پیام: فعلاً می‌ماند");
  assert.throws(() => rejectBody({ kind: "final" }, { reason: "گران", bundle: "return" }), (e) => e.status === 422 && e.extra.need_text, "برگشت بی پیام نه");
});

test("تیکِ «👁»ِ مدیر: بی نوعِ مجاز ۴۰۹؛ با مجاز شدنِ «پیچ» روشن، میز و جزئیاتِ ارجاع نشانش می‌دهند", { skip: SKIP }, async () => {
  const no = await call("/assign/sup", { headers: MG, body: { assignment_id: 1, on: true } });
  assert.equal(no.status, 409);
  assert.match(no.data.error, /مجازِ حالت تأیید/);
  assert.equal((await call("/support/ai/modes", { method: "PUT", headers: SUPH, body: { heads: { "پیچ": { mode: "pick", supervise: true } } } })).status, 200);
  resetModesCache();
  assert.equal((await call("/assign/sup", { headers: EX, body: { assignment_id: 1, on: true } })).status, 401, "فقط مدیر");
  const ok = await call("/assign/sup", { headers: MG, body: { assignment_id: 1, on: true } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.deepEqual([ok.data.changed, ok.data.eligible], [true, 1], "فقط «پیچ» مجاز است");
  assert.equal((await call("/desk", { headers: MG })).data.sup_heads, 1);
  const d = (await call("/assignments/1", { headers: EX })).data;
  assert.equal(d.ai.sup.on, true);
  assert.deepEqual(d.ai.sup.cfg, { chat: false, bundle: true });
  const [i31, i32] = [31, 32].map((id) => d.ai.items.find((x) => x.id === id));
  assert.deepEqual([i31.supervise, i31.sup_on, i32.supervise], [true, false, false], "پیش از «شروع» هنوز روشن نیست");
  assert.ok(outbox(/با «حالت تأیید» است/).length, "خبر به کارشناس");
});

test("درخواستِ کارشناس پیش از «شروع»: بی توضیح ۴۲۲، نوعِ نامجاز ۴۰۹، مدیر تأیید می‌کند و قلم «با تأیید» می‌شود", { skip: SKIP }, async () => {
  const dec = (body) => call("/assignments/2/decision", { headers: EX, body: { action: "supervise", ...body } });
  assert.equal((await dec({ item_ids: [41], reason: "" })).status, 422);
  assert.equal((await dec({ item_ids: [42], reason: "حساس است" })).status, 409, "«مهره» مجازِ تأیید نیست");
  const r = await dec({ item_ids: [41], reason: "خریدِ حساس با تأمین‌کنندهٔ تازه" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.pending, true, "همیشه با تأییدِ مدیر");
  assert.equal((await dec({ item_ids: [41], reason: "دوباره" })).status, 409, "درخواستِ معطل تکرار نمی‌شود");
  const d = (await call("/assignments/2", { headers: EX })).data;
  assert.equal(d.ai.items.find((x) => x.id === 41).sup_wait, true);
  const ap = await call(`/decisions/${r.data.decision_id}/approve`, { headers: MG, body: {} });
  assert.equal(ap.status, 200, JSON.stringify(ap.data));
  assert.equal(ap.data.sup, 1);
  assert.equal(DB.raw.prepare("SELECT sup_on, sup_by FROM items WHERE id=41").get().sup_by, "expert");
  assert.ok(outbox(/مدیر حالت تأیید را تأیید کرد/).length, "نتیجه برای کارشناس");
  assert.ok(DB.raw.prepare("SELECT 1 AS x FROM events WHERE kind='ai_sup_item'").get());
});

test("گفت‌وگوی «با تأیید»: تأیید نهایی و پاسخِ مدل پیشنهاد می‌شوند و نمی‌روند؛ کارشناس می‌بیند ولی خودش نمی‌نویسد", { skip: SKIP }, async () => {
  assert.equal((await call("/me/supervise", { method: "PUT", headers: EX, body: { chat: true, bundle: true } })).status, 200);
  assert.deepEqual((await call("/me/supervise", { headers: EX })).data.cfg, { chat: true, bundle: true });
  assert.equal((await call("/items/31/picks", { headers: EX })).status, 200);
  assert.equal((await call("/items/31/picks", { method: "PUT", headers: EX, body: { add: [{ name: "پیچ‌سازان", src: "manual" }] } })).status, 200);
  assert.equal((await call("/sp/x/phones", { headers: EX, body: { supplier_name: "پیچ‌سازان", phone: "09120000501", label: "فروش", panel: true } })).status, 200);
  const st = await call("/items/31/ai-start", { headers: EX, body: {} });
  assert.equal(st.status, 200, JSON.stringify(st.data));
  assert.deepEqual({ ...DB.raw.prepare("SELECT sup_on, sup_by FROM items WHERE id=31").get() }, { sup_on: 1, sup_by: "manager" }, "تیکِ مدیر با «شروع» روی قلم نشست");
  for (let i = 0; i < 8 && !DB.raw.prepare("SELECT 1 AS x FROM ai_threads").get(); i++) { DB.raw.prepare("UPDATE ai_runs SET next_at=0").run(); await aiTick(env); }
  const th = S.th = DB.raw.prepare("SELECT thread_id FROM ai_threads").get().thread_id;
  const H = S.H = await supplierSession("09120000501");
  assert.equal((await call(`/sp/thread/${th}/terms`, { headers: H, body: { pay: "نقدی", vat: "دارد", invoice: "رسمی", dtime: "7", valid_days: 10 } })).status, 200);
  const d = (await call(`/sp/thread/${th}`, { headers: H })).data;
  S.line = d.lines[0].id;
  assert.equal((await call(`/sp/line/${S.line}`, { method: "PUT", headers: H, body: { qty: 400, price: 4200 } })).status, 200);
  assert.equal((await call(`/sp/line/${S.line}/ready`, { headers: H, body: { on: true } })).status, 200);
  model = () => reply("سلام 🌷 پیشنهادتون رسید؛ بررسی می‌کنیم و خبر می‌دیم.");
  const sub = await call(`/sp/thread/${th}/submit`, { headers: H, body: {} });
  assert.equal(sub.status, 200, JSON.stringify(sub.data));
  assert.equal(sub.data.state, "pending", "تأیید نهایی پیشنهاد شد، نه اجرا");
  S.bundle = sub.data.bundle_id;
  assert.equal(DB.raw.prepare("SELECT state FROM sp_bundles WHERE id=?").get(S.bundle).state, "pending");
  const P = props(th);
  assert.deepEqual(P.map((p) => [p.kind, p.state]), [["final", "pending"], ["reply", "pending"]]);
  assert.equal(P[0].bundle_id, S.bundle);
  assert.ok(!DB.raw.prepare("SELECT 1 AS x FROM sp_msgs WHERE thread_id=? AND who='e' AND body LIKE '%پیشنهادتون رسید%'").get(th), "پاسخِ مدل نرفت");
  /* کارتِ پیشنهاد در بات کارشناسان، با دکمه‌ها و لینکِ همان گفت‌وگو */
  const cards = outbox(/پیشنهادِ کارشناس هوشمند — منتظرِ تأییدِ شما/);
  assert.equal(cards.length, 2);
  assert.ok(cards.some((c) => /تأیید نهاییِ بستهٔ/.test(c.text) && /جمع: <b>/.test(c.text)), "خلاصهٔ بسته در کارت");
  assert.equal(cards[1].keyboard[0][0].callback_data, `prop:${P[1].id}:ok`);
  assert.match(cards[1].keyboard[1][0].web_app.url, new RegExp(`th=${th}$`));
  /* فهرست و گفت‌وگو برای کارشناس: باز، فقط‌خواندنی */
  const ls = (await call("/sp/x/threads", { headers: EX })).data;
  const t = ls.requests.find((g) => g.assignment_id === 1).threads.find((x) => x.id === th);
  assert.deepEqual([t.ai, t.props, ls.props], ["watch", 2, 2]);
  const v = await call(`/sp/thread/${th}`, { headers: EX });
  assert.equal(v.status, 200, "گفت‌وگوی «با تأیید» برای کارشناس بسته نیست");
  assert.equal(v.data.thread.ai.watch, true);
  assert.deepEqual(v.data.watch.pending.map((p) => p.kind), ["final", "reply"]);
  assert.deepEqual(v.data.watch.manual, []);
  const own = await call(`/sp/thread/${th}/msg`, { headers: EX, body: { text: "سلام از کارشناس" } });
  assert.equal(own.status, 423);
  assert.equal(own.data.ai_watch, true);
  assert.equal((await call(`/sp/x/bundle/${S.bundle}/decide`, { headers: EX, body: { action: "final" } })).status, 423, "تصمیمِ مستقیم نه");
  const pl = await call(`/sp/poll?t=${th}&since=0`, { headers: EX });
  assert.equal(pl.data.prop, `${P[1].id}:2`, "نشانِ پیشنهادها در نظرسنجی");
});

test("پیامِ تازهٔ تأمین‌کننده پیشنهادِ معطل را کنار می‌گذارد؛ ردِ پاسخ با پیامِ خودِ کارشناس و یادگرفتنِ مدل", { skip: SKIP }, async () => {
  const { th, H } = S;
  const old = props(th).find((p) => p.kind === "reply");
  let seen = null;
  model = (b) => { seen = b; return reply("ممنون؛ امکانِ تخفیف برای تسویهٔ نقدی هست؟"); };
  assert.equal((await call(`/sp/thread/${th}/msg`, { headers: H, body: { text: "قیمت با حمل است." } })).status, 200);
  const P = props(th);
  assert.equal(P.find((p) => p.id === old.id).state, "stale");
  const fresh = P.filter((p) => p.kind === "reply" && p.state === "pending");
  assert.equal(fresh.length, 1, "پاسخِ تازه");
  assert.ok(seen, "دورِ تازه با پیامِ تازه");
  const st = await call(`/sp/x/prop/${old.id}`, { headers: EX, body: { action: "ok" } });
  assert.equal(st.status, 409, "پیشنهادِ کنارگذاشته تأیید نمی‌شود");
  assert.equal(st.data.state, "stale");
  assert.equal((await call(`/sp/x/prop/${fresh[0].id}`, { headers: EX, body: { action: "no", reason: "" } })).status, 422, "رد بی توضیح نه");
  const no = await call(`/sp/x/prop/${fresh[0].id}`, { headers: EX, body: { action: "no", reason: "تخفیف را بعد از تأیید نهایی بخواه", text: "حمل با خودتان باشد، ممنون." } });
  assert.equal(no.status, 200, JSON.stringify(no.data));
  const m = DB.raw.prepare("SELECT who, meta_json FROM sp_msgs WHERE thread_id=? AND body='حمل با خودتان باشد، ممنون.'").get(th);
  assert.ok(m, "پیامِ خودِ کارشناس رفت");
  assert.equal(JSON.parse(m.meta_json).own, fresh[0].id);
  assert.ok(!JSON.parse(m.meta_json).ai, "پیامِ انسانی، نه کارشناس هوشمند");
  assert.deepEqual({ ...DB.raw.prepare("SELECT state, reason FROM ai_props WHERE id=?").get(fresh[0].id) }, { state: "no", reason: "تخفیف را بعد از تأیید نهایی بخواه" });
  assert.ok(DB.raw.prepare("SELECT 1 AS x FROM events WHERE kind='ai_prop_no'").get());
  /* دورِ بعد: توضیحِ رد در پرونده و «حالت تأیید» در سرِ پرونده */
  seen = null;
  model = (b) => { seen = b; return reply("چشم؛ حمل با ما."); };
  assert.equal((await call(`/sp/thread/${th}/msg`, { headers: H, body: { text: "باشه، حمل با ما." } })).status, 200);
  const ctxText = seen.messages[0].content[0].text;
  assert.match(ctxText, /👁 حالت تأیید: پاسخ‌هایت و تصمیم‌های بسته پیش از رفتن به تأییدِ کارشناسِ خرید/);
  assert.match(ctxText, /<نظر_کارشناس_بر_پیشنهادهایت>[\s\S]*❌ کارشناس رد کرد — توضیحش: «تخفیف را بعد از تأیید نهایی بخواه»؛ پیامِ خودِ کارشناس: «حمل با خودتان باشد، ممنون\.»/);
  assert.match(ctxText, /بستهٔ ارسالی با تأییدِ کارشناسِ خرید تأیید نهایی می‌شود/);
});

test("بات کارشناسان: «✅ تأیید»ِ پاسخ همان لحظه می‌رود؛ «❌ رد» علت و پیام می‌پرسد و «-» یعنی هیچ", { skip: SKIP }, async () => {
  const { th } = S;
  const p = props(th).find((x) => x.kind === "reply" && x.state === "pending");
  await tg(`prop:${p.id}:ok`);
  assert.equal(DB.raw.prepare("SELECT state FROM ai_props WHERE id=?").get(p.id).state, "ok");
  const m = DB.raw.prepare("SELECT meta_json FROM sp_msgs WHERE thread_id=? AND body='چشم؛ حمل با ما.'").get(th);
  assert.ok(m && JSON.parse(m.meta_json).ai, "پیامِ کارشناس هوشمند رفت");
  assert.ok(calls.some((c) => c.method === "editMessageText" && /تأیید شد و برای تأمین‌کننده رفت/.test(c.body.text)));
  /* پیشنهادِ تازه و ردش از بات */
  model = () => reply("پیشنهادِ تازه برای رد.");
  assert.equal((await call(`/sp/thread/${th}/msg`, { headers: S.H, body: { text: "خبری شد؟" } })).status, 200);
  const q = props(th).find((x) => x.kind === "reply" && x.state === "pending");
  await tg(`prop:${q.id}:no`);
  assert.match(sentTexts().pop(), /علتِ رد را بنویسید/);
  await tgText("هنوز زود است");
  assert.match(sentTexts().pop(), /پیامِ خودتان برای تأمین‌کننده را بنویسید/);
  await tgText("-");
  assert.deepEqual({ ...DB.raw.prepare("SELECT state, reason, own FROM ai_props WHERE id=?").get(q.id) }, { state: "no", reason: "هنوز زود است", own: null });
  assert.match(sentTexts().pop(), /پیشنهاد رد شد[\s\S]*هیچ پیامی نرفت/);
  assert.ok(!DB.raw.prepare("SELECT 1 AS x FROM sp_msgs WHERE thread_id=? AND body='پیشنهادِ تازه برای رد.'").get(th), "پیشنهادِ ردشده نرفت");
});

test("ردِ «🏁 تأیید نهایی» با برگشت: بسته با پیامِ کارشناس برمی‌گردد و تصمیمش با خودِ اوست؛ بستهٔ تازه با تأیید نهایی می‌شود", { skip: SKIP }, async () => {
  const { th, H } = S;
  const f = props(th).find((x) => x.kind === "final" && x.state === "pending");
  const r = await call(`/sp/x/prop/${f.id}`, { headers: EX, body: { action: "no", reason: "قیمت بالاتر از سوابق است", bundle: "return", text: "لطفاً قیمتِ واحد را بازبینی کنید." } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const b = { ...DB.raw.prepare("SELECT state, comment FROM sp_bundles WHERE id=?").get(S.bundle) };
  assert.deepEqual(b, { state: "returned", comment: "لطفاً قیمتِ واحد را بازبینی کنید." });
  assert.equal(JSON.parse(DB.raw.prepare("SELECT meta_json FROM ai_props WHERE id=?").get(f.id).meta_json).bundle_act, "return");
  const v = (await call(`/sp/thread/${th}`, { headers: EX })).data;
  assert.deepEqual(v.watch.manual, [S.bundle], "تصمیمِ همین بسته با کارشناس است");
  /* بستهٔ تازه: پیشنهادِ تأیید نهاییِ تازه، و تأییدش خطِ استعلام می‌سازد */
  model = () => reply("ممنون از بازبینی 🌷");
  assert.equal((await call(`/sp/line/${S.line}`, { method: "PUT", headers: H, body: { price: 3900 } })).status, 200);
  assert.equal((await call(`/sp/line/${S.line}/ready`, { headers: H, body: { on: true } })).status, 200);
  const sub = await call(`/sp/thread/${th}/submit`, { headers: H, body: {} });
  assert.equal(sub.data.state, "pending");
  const f2 = props(th).find((x) => x.kind === "final" && x.state === "pending");
  assert.equal(f2.bundle_id, sub.data.bundle_id);
  const ok = await call(`/sp/x/prop/${f2.id}`, { headers: EX, body: { action: "ok" } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(DB.raw.prepare("SELECT state FROM sp_bundles WHERE id=?").get(f2.bundle_id).state, "final");
  const q = DB.raw.prepare("SELECT price, saved, final FROM quotes WHERE assignment_id=1 AND item_id=31").get();
  assert.deepEqual([q.price, q.saved, q.final], [3900, 1, 1]);
  assert.ok(DB.raw.prepare("SELECT 1 AS x FROM ai_log WHERE kind='prop' AND body LIKE '✅ کارشناس پیشنهادِ%تأیید نهایی%'").get());
});

test("مدیر «👁» را برمی‌دارد: پیشنهادهای معطل کنار می‌روند، قلم بی تأیید و بستهٔ تازه همان لحظه تأیید نهایی", { skip: SKIP }, async () => {
  const { th, H } = S;
  model = () => reply("پیامِ معطل.");
  assert.equal((await call(`/sp/thread/${th}/msg`, { headers: H, body: { text: "سؤالی دارم" } })).status, 200);
  const p = props(th).find((x) => x.state === "pending");
  assert.ok(p, "یک پیشنهادِ معطل");
  const off = await call("/assign/sup", { headers: MG, body: { assignment_id: 1, on: false } });
  assert.equal(off.status, 200, JSON.stringify(off.data));
  assert.equal(DB.raw.prepare("SELECT state FROM ai_props WHERE id=?").get(p.id).state, "off");
  assert.equal(DB.raw.prepare("SELECT sup_on FROM items WHERE id=31").get().sup_on, 0);
  assert.ok(DB.raw.prepare("SELECT retry_at FROM ai_threads WHERE thread_id=?").get(th).retry_at, "همان دور دوباره، بی تأیید");
  const v = await call(`/sp/thread/${th}`, { headers: EX });
  assert.equal(v.status, 423, "گفت‌وگو دوباره دستِ کارشناس هوشمند و بسته");
  /* اصلاحِ پیشنهاد و ارسالِ تازه: همان لحظه تأیید نهایی، بی پیشنهاد */
  assert.equal((await call(`/sp/line/${S.line}/revise`, { headers: H, body: {} })).status, 200);
  assert.equal((await call(`/sp/line/${S.line}`, { method: "PUT", headers: H, body: { price: 3800 } })).status, 200);
  assert.equal((await call(`/sp/line/${S.line}/ready`, { headers: H, body: { on: true } })).status, 200);
  model = () => reply("ممنون 🌷");
  const sub = await call(`/sp/thread/${th}/submit`, { headers: H, body: {} });
  assert.equal(sub.data.state, "final");
  assert.equal(props(th).filter((x) => x.state === "pending").length, 0);
  assert.equal(DB.raw.prepare("SELECT price FROM quotes WHERE assignment_id=1 AND item_id=31").get().price, 3800);
});

test("درخواستِ تأییدشدهٔ کارشناس، و ردِ «🏁 تأیید نهایی» از بات با «❌ ردِ بسته» و بی پیام", { skip: SKIP }, async () => {
  /* قلمِ ۴۱ با درخواستِ کارشناس «با تأیید» است (آزمونِ سوم) — بی تیکِ مدیر در ارجاع */
  assert.equal(DB.raw.prepare("SELECT sup_on FROM assignments WHERE id=2").get().sup_on, null);
  assert.equal((await call("/items/41/picks", { headers: EX })).status, 200);
  assert.equal((await call("/items/41/picks", { method: "PUT", headers: EX, body: { add: [{ name: "پیچ‌گستر", src: "manual" }] } })).status, 200);
  assert.equal((await call("/sp/x/phones", { headers: EX, body: { supplier_name: "پیچ‌گستر", phone: "09120000601", label: "فروش", panel: true } })).status, 200);
  assert.equal((await call("/items/41/ai-start", { headers: EX, body: {} })).status, 200);
  const thOf = () => DB.raw.prepare("SELECT x.thread_id FROM ai_threads x JOIN sp_threads t ON t.id=x.thread_id WHERE t.assignment_id=2").get();
  /* Cron کمترین next_at را برمی‌دارد: فقط کارِ همین ارجاع سررسید است */
  for (let i = 0; i < 8 && !thOf(); i++) {
    DB.raw.prepare("UPDATE ai_runs SET next_at=CASE WHEN assignment_id=2 THEN 0 ELSE 9e15 END").run();
    await aiTick(env);
  }
  const th = thOf().thread_id;
  const H = await supplierSession("09120000601");
  assert.equal((await call(`/sp/thread/${th}/terms`, { headers: H, body: { pay: "نقدی", vat: "دارد", invoice: "رسمی", dtime: "5", valid_days: 10 } })).status, 200);
  const line = (await call(`/sp/thread/${th}`, { headers: H })).data.lines[0].id;
  assert.equal((await call(`/sp/line/${line}`, { method: "PUT", headers: H, body: { qty: 100, price: 9000 } })).status, 200);
  assert.equal((await call(`/sp/line/${line}/ready`, { headers: H, body: { on: true } })).status, 200);
  model = () => reply("رسید، ممنون.");
  const sub = await call(`/sp/thread/${th}/submit`, { headers: H, body: {} });
  assert.equal(sub.data.state, "pending");
  const f = props(th).find((x) => x.kind === "final" && x.state === "pending");
  assert.ok(f, "تأیید نهایی پیشنهاد شد");
  await tg(`prop:${f.id}:no`);
  await tgText("برند نامعتبر است");
  const flow = DB.raw.prepare("SELECT id, step FROM tg_flows WHERE kind='prop' ORDER BY id DESC LIMIT 1").get();
  assert.equal(flow.step, "need_bact", "سرنوشتِ بسته با دکمه");
  assert.ok(calls.filter((c) => c.method === "sendMessage").pop().body.reply_markup.inline_keyboard.flat().some((b) => b.callback_data === `pb:${flow.id}:x`));
  await tg(`pb:${flow.id}:x`);
  await tgText("-");
  assert.deepEqual({ ...DB.raw.prepare("SELECT state, reason, own FROM ai_props WHERE id=?").get(f.id) }, { state: "no", reason: "برند نامعتبر است", own: null });
  assert.equal(DB.raw.prepare("SELECT state FROM sp_bundles WHERE id=?").get(sub.data.bundle_id).state, "rejected", "بسته رد شد");
  assert.match(sentTexts().pop(), /پیشنهاد رد شد[\s\S]*بسته رد شد/);
  assert.ok(!DB.raw.prepare("SELECT 1 AS x FROM quotes WHERE assignment_id=2 AND item_id=41 AND final=1").get(), "پیشنهادی تأیید نهایی نشد");
});
