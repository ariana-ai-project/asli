/* ============================================================
   پنل پشتیبانی — فاز ۲ (مهر ۱۴۰۵): کارشناس هوشمند از پنل پشتیبانی، قفل‌های کارشناس و «پرسش از کارشناس»

   • تیکِ «🤖 هوشمند / ✋ دستی» هر کارشناس در پنل پشتیبانی (/support/ai/*)؛ تبِ قدیمیِ پنل کارشناس (/ai/*) بسته است
   • «هوشمند»: بررسی سوابق، جستجوی هوشمند، ساختار قلم، جدول کمیسیون و نامه برای کارشناس قفل؛ خط‌های استعلامِ کارشناس
     هوشمند دست‌نخوردنی و خطِ دستیِ خودِ کارشناس آزاد؛ گفت‌وگوهای کارشناس هوشمند برای کارشناس بسته
   • «پرسش از کارشناس»: سؤالی که جوابش در پرونده نیست ← گفت‌وگو برای کارشناس باز، نشانِ 🚨 و پیامِ تلگرام ← کارشناس پاسخ
     می‌دهد ← دوباره بسته و کارشناس هوشمند ادامه می‌دهد (پاسخ را در پرونده‌اش می‌بیند)
   • «دستی» همهٔ قفل‌ها را برمی‌دارد
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import { aiTick } from "../../../worker/ai-agent.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = {
  DB, TG_BOT_TOKEN: "tok", TG_SP_BOT_TOKEN: "sptok", TG_WEBHOOK_SECRET: "sec", TG_API_BASE: "https://tg.test/bot", TG_FILE_API_BASE: "https://tgfile.test/bot",
  SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_KEY: "svc", ANTHROPIC_API_KEY: "k", ANTHROPIC_API_BASE: "https://ai.test", SITE_ORIGIN: "https://site.test",
};
const EX = { "X-Expert-Code": "8001" };
const AI_CHAT = 801;
if (DB) {
  await ensureSchema(env);
  const t = Date.now();
  DB.raw.exec("DELETE FROM experts");
  DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,telegram_chat,created_at) VALUES (1,'هوشمند','آقای هوشمند','8001',1,1,?,?), (2,'انسانی','خانم انسانی','8002',1,1,NULL,?)")
    .run(String(AI_CHAT), t, t);
  DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES ('R-P2','1405/07/14','پروژهٔ فاز دو')").run();
  DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,deadline_at,created_at) VALUES (1,'R-P2',1,5,?,?,?)").run(t, t + 5 * 86400000, t);
  DB.raw.prepare(`INSERT INTO items (id,request_id,item_key,line_no,title,spec,note,qty,unit,state,assignment_id,norm_json) VALUES (41,'R-P2','a',1,'میلگرد ۱۲ آجدار','A3 کارخانهٔ معتبر','تحویل در کارگاه',5,'تن','open',1,?)`)
    .run(JSON.stringify({ v: 2, head: "میلگرد", layers: { "قطر": "12" } }));
  DB.raw.prepare("INSERT INTO ai_agents (expert_id,mode,on_at,updated_at) VALUES (1,'on',?,?)").run(t - 60000, t);
  const run = DB.raw.prepare("INSERT INTO ai_runs (assignment_id,expert_id,request_id,state,data_json,next_at,created_at,updated_at) VALUES (1,1,'R-P2','work',?,0,?,?)")
    .run(JSON.stringify({ items: [{ id: 41, title: "میلگرد ۱۲ آجدار", qty: 5, unit: "تن", prep: 1, smart: { n: 0 } }], cands: [], how: "auto", invited_at: t }), t, t);
  const runId = Number(run.lastInsertRowid);
  DB.raw.prepare("INSERT INTO sp_suppliers (id,name,name_n,demo,created_at) VALUES (5,'آهن الف','آهن الف',0,?)").run(t);
  DB.raw.prepare("INSERT INTO sp_phones (id,supplier_id,phone,label,k,created_at,panel) VALUES (9,5,'09120000555','فروش','abcdefabcdef',?,1)").run(t);
  DB.raw.prepare("INSERT INTO sp_threads (id,assignment_id,request_id,supplier_id,phone_id,last_at,created_at) VALUES (50,1,'R-P2',5,9,?,?)").run(t, t);
  DB.raw.prepare(`INSERT INTO sp_lines (thread_id,item_id,title,head,layers_json,req_qty,req_unit,state,no,created_at,updated_at) VALUES (50,41,'میلگرد ۱۲ آجدار','میلگرد',?,5,'تن','new',1,?,?)`)
    .run(JSON.stringify([{ k: "قطر", v: "12" }]), t, t);
  DB.raw.prepare("INSERT INTO ai_threads (thread_id,run_id,source,state,seen_msg,created_at,updated_at) VALUES (50,?,'smart','active',0,?,?)").run(runId, t, t);
  /* خطِ استعلامِ کارشناس هوشمند (دعوت) و خطِ دستیِ خودِ کارشناس */
  const q = DB.raw.prepare(`INSERT INTO quotes (id,assignment_id,item_id,supplier_name,unit,qty,price,dtime,pay,invoice,vat,saved,final,source,origin,created_at,updated_at)
    VALUES (?,1,41,?,'تن',5,?,'10','نقدی','رسمی','دارد',1,0,?,?,?,?)`);
  q.run(101, "آهن الف", 410000000, "ai", "smart", t, t);
  q.run(102, "دستی ب", 405000000, "panel", "manual", t, t);
}

/* ---------- دنیای بیرونِ بدلی ---------- */
const calls = [];
let nextMsg = 7000;
let model = () => { throw new Error("پاسخِ مدل برای این گام تعریف نشده"); };
const R = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.startsWith("https://tg.test/bot")) {
    const rest = u.slice("https://tg.test/bot".length);
    const token = rest.split("/")[0], method = rest.split("/").pop();
    const body = typeof init.body === "string" ? JSON.parse(init.body) : {};
    calls.push({ bot: token === "sptok" ? "sp" : "main", method, body });
    if (method === "getMe") return R({ ok: true, result: { id: 77, username: "Bot" } });
    return R({ ok: true, result: method === "sendMessage" ? { message_id: ++nextMsg } : true });
  }
  if (u.startsWith("https://sb.test/")) return R({ Key: "x" });
  if (u.startsWith("https://ai.test/")) { const body = JSON.parse(init.body); calls.push({ bot: "ai", body }); return R(model(body)); }
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
if (DB) SUP = { "X-Support-Token": (await call("/support/setup", { body: { pass: "faz-do-123" } })).data.token };
const since = (n) => calls.slice(n);
const usage = { input_tokens: 5000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const jsonOut = (o) => ({ model: "claude-opus-5-5", stop_reason: "end_turn", usage, content: [{ type: "text", text: JSON.stringify(o) }] });
const turn = (o) => jsonOut({ reply: "", actions: [], thread_status: "active", memo: "", note: "", ask_expert: "", ...o });
const thState = () => DB.raw.prepare("SELECT state, ask_json FROM ai_threads WHERE thread_id=50").get();

test("تیکِ «هوشمند / دستی» از پنل پشتیبانی؛ تبِ قدیمیِ پنل کارشناس بسته است", { skip: SKIP }, async () => {
  assert.equal((await call("/ai/state", { headers: EX })).status, 403, "کارشناس خودش کارشناس هوشمند را اداره نمی‌کند");
  assert.equal((await call("/support/ai/experts")).status, 401);
  const L = (await call("/support/ai/experts", { headers: SUP })).data;
  assert.deepEqual(L.experts.map((e) => [e.id, e.on]), [[1, true], [2, false]], "هوشمندها اول");
  /* کارشناسی که هرگز هوشمند نبوده: اولین تیک ردیفش را می‌سازد */
  const st0 = (await call("/support/ai/2/state", { headers: SUP })).data;
  assert.deepEqual([st0.agent.on, st0.expert.label], [false, "خانم انسانی"]);
  assert.equal((await call("/support/ai/2/mode", { method: "PUT", headers: SUP, body: { on: true } })).status, 200);
  assert.equal(DB.raw.prepare("SELECT mode, updated_by FROM ai_agents WHERE expert_id=2").get().mode, "on");
  assert.equal((await call("/support/ai/2/mode", { method: "PUT", headers: SUP, body: { on: false } })).status, 200);
  assert.equal(DB.raw.prepare("SELECT mode FROM ai_agents WHERE expert_id=2").get().mode, "off");
  const evs = DB.raw.prepare("SELECT kind FROM events WHERE actor='support' AND kind LIKE 'ai_%' ORDER BY id").all().map((r) => r.kind);
  assert.deepEqual(evs, ["ai_on", "ai_off"], "در گزارش رخدادها");
  const feed = (await call("/support/activity?g=support", { headers: SUP })).data.rows;
  assert.ok(feed.some((r) => /هوشمند» شد/.test(r.text) && r.expert_id === 2));
});

test("کارشناسِ «هوشمند»: سوابق، جستجو، ساختار، کمیسیون و نامه قفل؛ خطِ کارشناس هوشمند دست‌نخوردنی، خطِ دستی آزاد", { skip: SKIP }, async () => {
  const lock = (r) => assert.equal(r.status, 423, JSON.stringify(r.data));
  lock(await call("/suppliers/history?item_id=41", { headers: EX }));
  lock(await call("/search/smart", { headers: EX, body: { item_id: 41 } }));
  lock(await call("/items/41/normalize", { headers: EX, body: {} }));
  lock(await call("/items/41/progress", { headers: EX, body: { stage: "hist" } }));
  lock(await call("/assignments/1/commission", { headers: EX, body: {} }));
  lock(await call("/assignments/1/letter", { headers: EX, body: {} }));
  lock(await call("/quotes/101", { method: "PUT", headers: EX, body: { final: 1 } }));
  lock(await call("/quotes/101", { method: "DELETE", headers: EX }));
  assert.ok(!calls.some((c) => c.bot === "ai"), "هیچ مدلی صدا زده نشد");
  /* خطِ دستیِ خودِ کارشناس: تیکِ تأیید نهایی و خطِ تازه */
  assert.equal((await call("/quotes/102", { method: "PUT", headers: EX, body: { final: 1 } })).status, 200);
  const add = await call("/quotes", { headers: EX, body: { assignment_id: 1, supplier_name: "دستی ج", item_ids: [41] } });
  assert.equal(add.status, 200, JSON.stringify(add.data));
  /* جزئیاتِ ارجاع: قفل و نشانِ خط‌ها */
  const d = (await call("/assignments/1", { headers: EX })).data;
  assert.deepEqual([d.ai.mode, d.ai.owned && d.ai.owned.state], [true, "work"]);
  assert.deepEqual(d.quotes.map((q) => [q.supplier_name, q.ai]).sort(), [["آهن الف", 1], ["دستی ب", 0], ["دستی ج", 0]]);
  /* کارتابل: نشانِ 🤖 */
  const tray = (await call("/tray?full=1", { headers: EX })).data;
  assert.equal(tray.assignments.find((a) => a.id === 1).ai, 1);
  /* مدیر و پشتیبانی قفل نیستند */
  assert.equal((await call("/support/assignments/1", { headers: SUP })).status, 200);
});

test("گفت‌وگوی کارشناس هوشمند برای کارشناس بسته است — نه دیدن، نه پیام، نه اعلان", { skip: SKIP }, async () => {
  DB.raw.prepare("INSERT INTO sp_msgs (thread_id,who,kind,body,at) VALUES (50,'s','text','سلام، قیمت را فردا می‌فرستیم.',?)").run(Date.now());
  assert.equal((await call("/sp/thread/50", { headers: EX })).status, 423);
  assert.equal((await call("/sp/thread/50/msg", { headers: EX, body: { text: "سلام" } })).status, 423);
  const list = (await call("/sp/x/threads", { headers: EX })).data;
  const t = list.requests.flatMap((g) => g.threads).find((x) => x.id === 50);
  assert.deepEqual([t.ai, t.unread, t.phone], ["locked", 0, null], "در فهرست قفل، بی شماره و بی نخوانده");
  const inbox = (await call("/sp/x/inbox?since=1", { headers: EX })).data;
  assert.deepEqual([inbox.msgs.length, inbox.unread, inbox.asks], [0, 0, 0]);
  /* پشتیبانی همه‌چیز را می‌بیند */
  assert.equal((await call("/support/threads/50", { headers: SUP })).status, 200);
});

test("«پرسش از کارشناس»: سؤالِ بیرون از پرونده ← باز برای کارشناس، 🚨 و تلگرام ← پاسخ ← دوباره بسته و کارشناس هوشمند ادامه می‌دهد", { skip: SKIP }, async () => {
  DB.raw.prepare("INSERT INTO sp_msgs (thread_id,who,kind,body,at) VALUES (50,'s','text','نقشهٔ خم‌کاری دارید؟ آرماتور را بریده و خم‌شده بفرستیم یا شاخه؟',?)").run(Date.now());
  let ctxText = "";
  model = (b) => { ctxText = b.messages[0].content[0].text; return turn({ reply: "سؤال خوبیه؛ با همکارمون چک می‌کنم و همین‌جا خبرتون می‌کنم 🙏", ask_expert: "تأمین‌کننده می‌پرسد میلگرد شاخه‌ای تحویل شود یا بریده و خم‌شده؛ نقشهٔ خم‌کاری داریم؟" }); };
  let n = calls.length;
  DB.raw.prepare("UPDATE ai_runs SET next_at=0").run();
  const r = await aiTick(env);
  assert.equal(r.step, "turn", JSON.stringify(r));
  assert.match(ctxText, /توضیحاتِ خودِ درخواست: A3 کارخانهٔ معتبر · تحویل در کارگاه/, "توضیحاتِ خودِ درخواست در پرونده");
  const st = thState();
  assert.equal(st.state, "ask");
  assert.match(JSON.parse(st.ask_json).q, /نقشهٔ خم‌کاری/);
  const note = DB.raw.prepare("SELECT * FROM sp_msgs WHERE thread_id=50 AND kind='note' ORDER BY id DESC LIMIT 1").get();
  assert.match(note.body, /^🚨 پرسش از کارشناس:/);
  const tg = since(n).find((c) => c.bot === "main" && c.method === "sendMessage" && String(c.body.chat_id) === String(AI_CHAT));
  assert.ok(tg, "پیامِ تلگرام به کارشناس");
  assert.match(tg.body.text, /سؤال دارد/);
  assert.match(tg.body.reply_markup.inline_keyboard[0][0].web_app.url, /correspond\.html\?tg=1$/);
  assert.ok(DB.raw.prepare("SELECT 1 AS x FROM events WHERE kind='ai_ask'").get(), "در گزارش رخدادها");

  /* حالا برای کارشناس باز است و نشانِ 🚨 دارد؛ صفحهٔ مکاتبات سؤال را بالای کادرِ پیام نشان می‌دهد */
  const open = await call("/sp/thread/50", { headers: EX });
  assert.equal(open.status, 200);
  assert.match(open.data.thread.ai.ask.q, /نقشهٔ خم‌کاری/);
  /* فقط پاسخ در گفت‌وگو — تصمیمِ بسته‌ها با کارشناس هوشمند است */
  const bid = Number(DB.raw.prepare("INSERT INTO sp_bundles (thread_id,line_ids,state,created_at) VALUES (50,'[]','pending',?)").run(Date.now()).lastInsertRowid);
  assert.equal((await call(`/sp/x/bundle/${bid}/decide`, { headers: EX, body: { action: "reject" } })).status, 423);
  assert.equal((await call(`/sp/x/bundle/${bid}/accept`, { headers: EX, body: { all: true } })).status, 423);
  assert.equal(DB.raw.prepare("SELECT state FROM sp_bundles WHERE id=?").get(bid).state, "pending");
  DB.raw.prepare("DELETE FROM sp_bundles WHERE id=?").run(bid);
  const inbox = (await call("/sp/x/inbox", { headers: EX })).data;
  assert.equal(inbox.asks, 1);
  assert.match(inbox.ask_list[0].q, /نقشهٔ خم‌کاری/);
  assert.equal((await call("/tray?full=1", { headers: EX })).data.asks, 1);
  const t = (await call("/sp/x/threads", { headers: EX })).data.requests.flatMap((g) => g.threads).find((x) => x.id === 50);
  assert.deepEqual([t.ai, t.ask.length > 0], ["ask", true]);
  const sup = (await call("/support/ai/experts", { headers: SUP })).data;
  assert.equal(sup.asks.length, 1);
  assert.equal(sup.experts.find((e) => e.id === 1).asks, 1);

  /* تا پاسخِ کارشناس، کارشناس هوشمند منتظر است — پیامِ تازهٔ تأمین‌کننده هم دورِ مدل نمی‌زند */
  DB.raw.prepare("INSERT INTO sp_msgs (thread_id,who,kind,body,at) VALUES (50,'s','text','منتظریم.',?)").run(Date.now());
  n = calls.length;
  DB.raw.prepare("UPDATE ai_runs SET next_at=0").run();
  await aiTick(env);
  assert.equal(since(n).filter((c) => c.bot === "ai").length, 0);

  /* پاسخِ کارشناس ← مستقیم برای تأمین‌کننده؛ گفت‌وگو دوباره بسته */
  const ans = await call("/sp/thread/50/msg", { headers: EX, body: { text: "سلام؛ بریده و خم‌شده طبقِ نقشه لازم داریم، نقشه را همین امروز می‌فرستیم." } });
  assert.equal(ans.status, 200, JSON.stringify(ans.data));
  assert.equal(thState().state, "active");
  assert.ok(JSON.parse(thState().ask_json).answered_at);
  assert.equal((await call("/sp/thread/50", { headers: EX })).status, 423, "دوباره بسته");
  assert.ok(DB.raw.prepare("SELECT 1 AS x FROM events WHERE kind='ai_answer'").get());

  /* کارشناس هوشمند ادامه می‌دهد: پاسخِ کارشناس و سؤالِ قبلی در پرونده‌اش */
  model = (b) => { ctxText = b.messages[0].content[0].text; return turn({ reply: "ممنون از صبرتون؛ لطفاً قیمتِ بریده و خم‌شده رو ثبت کنید." }); };
  n = calls.length;
  DB.raw.prepare("UPDATE ai_runs SET next_at=0").run();
  await aiTick(env);
  assert.equal(since(n).filter((c) => c.bot === "ai").length, 1);
  assert.match(ctxText, /<پرسش_از_کارشناس>[\s\S]*نقشهٔ خم‌کاری[\s\S]*پاسخش در گفت‌وگو آمده است/);
  assert.match(ctxText, /کارشناس → تأمین‌کننده[\s\S]*بریده و خم‌شده طبقِ نقشه/, "پاسخِ کارشناسِ انسانی با برچسبِ خودش");
});

test("«دستی»: همهٔ قفل‌ها برداشته می‌شود و کارشناس هوشمند می‌ایستد", { skip: SKIP }, async () => {
  assert.equal((await call("/support/ai/1/mode", { method: "PUT", headers: SUP, body: { on: false } })).status, 200);
  assert.equal((await call("/sp/thread/50", { headers: EX })).status, 200);
  assert.notEqual((await call("/items/41/progress", { headers: EX, body: { stage: "hist" } })).status, 423);
  assert.notEqual((await call("/quotes/101", { method: "PUT", headers: EX, body: { final: 1 } })).status, 423);
  const d = (await call("/assignments/1", { headers: EX })).data;
  assert.equal(d.ai.owned, null);
  assert.ok(d.quotes.every((q) => !q.ai));
  /* سؤالِ بی‌پاسخِ مانده از پیش: «دستی» که شد گفت‌وگو به‌هرحال باز است و 🚨 نمی‌خواهد */
  DB.raw.prepare("UPDATE ai_threads SET state='ask', ask_json=? WHERE thread_id=50").run(JSON.stringify({ q: "سؤالِ مانده", at: Date.now() }));
  assert.equal((await call("/sp/x/inbox", { headers: EX })).data.asks, 0);
  assert.equal((await call("/tray?full=1", { headers: EX })).data.asks, 0);
  assert.equal((await call("/assignments/1", { headers: EX })).data.ai.asks, 0);
  assert.equal((await call("/support/ai/experts", { headers: SUP })).data.asks.length, 0);
  const t = (await call("/sp/x/threads", { headers: EX })).data.requests.flatMap((g) => g.threads).find((x) => x.id === 50);
  assert.deepEqual([t.ai, t.ask], ["open", null]);
  DB.raw.prepare("UPDATE ai_threads SET state='active' WHERE thread_id=50").run();
  DB.raw.prepare("INSERT INTO sp_msgs (thread_id,who,kind,body,at) VALUES (50,'s','text','قیمت ثبت شد.',?)").run(Date.now());
  const n = calls.length;
  DB.raw.prepare("UPDATE ai_runs SET next_at=0").run();
  assert.deepEqual(await aiTick(env), { ai: 0 }, "هیچ گامی برداشته نمی‌شود");
  assert.equal(since(n).filter((c) => c.bot === "ai").length, 0);
});
