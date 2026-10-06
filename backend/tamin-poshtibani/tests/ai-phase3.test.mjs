/* ============================================================
   پنل پشتیبانی — فاز ۳ (مهر ۱۴۰۵): «حداقلِ استعلام»، واگذاری به کارشناس، و تحویل برای تأییدِ کمیسیون

   • قواعدِ پشتیبانی (/support/ai/rules): بازه‌های قیمت واحد، قیمت کل و مقدار ← حداقلِ پیشنهادِ تأییدنهایی از تأمین‌کنندگانِ
     مختلف برای هر قلم (حدِ پایه همان «حداقل تأمین‌کننده»ی مدیر) و مهلتِ رسیدن به حد
   • کارشناس هوشمند تا حد پر نشده نمی‌بندد؛ حد را در پروندهٔ مذاکره می‌بیند
   • مهلت گذشت ← آلارمِ تلگرام و واگذاری: سوابق و جستجو برای کارشناس باز، جدول و نامه قفل — یک بار
   • «پایان»ِ پشتیبانی با کمتر از حد هم می‌بندد (هر قلم دست‌کم یکی) و کمبود را می‌گوید
   • تحویل در پنل پشتیبانی: فهرست و جزئیات؛ رد (با دلیل) درخواست را کامل به کارشناس برمی‌گرداند، تأیید = تیکِ کمیسیون
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import { aiTick } from "../../../worker/ai-agent.js";
import { needFor, cleanRules, whyText } from "../../../worker/ai-rules.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = {
  DB, TG_BOT_TOKEN: "tok", TG_SP_BOT_TOKEN: "sptok", TG_WEBHOOK_SECRET: "sec", TG_API_BASE: "https://tg.test/bot", TG_FILE_API_BASE: "https://tgfile.test/bot",
  SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_KEY: "svc", ANTHROPIC_API_KEY: "k", ANTHROPIC_API_BASE: "https://ai.test", SITE_ORIGIN: "https://site.test",
};
const EX = { "X-Expert-Code": "9001" };
const AI_CHAT = 901;
const HOUR = 3600000;
let RUN = 0;
if (DB) {
  await ensureSchema(env);
  const t = Date.now();
  DB.raw.exec("DELETE FROM experts");
  DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,telegram_chat,created_at) VALUES (1,'هوشمند','آقای هوشمند','9001',1,1,?,?)").run(String(AI_CHAT), t);
  DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES ('R-P3','1405/07/14','پروژهٔ فاز سه')").run();
  DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,deadline_at,created_at) VALUES (1,'R-P3',1,5,?,?,?)").run(t - 40 * HOUR, t + 5 * 86400000, t - 40 * HOUR);
  DB.raw.prepare(`INSERT INTO items (id,request_id,item_key,line_no,title,spec,qty,unit,state,assignment_id,norm_json) VALUES (41,'R-P3','a',1,'میلگرد ۱۲ آجدار','A3',5,'تن','open',1,?)`)
    .run(JSON.stringify({ v: 2, head: "میلگرد", layers: { "قطر": "12" } }));
  DB.raw.prepare("INSERT INTO ai_agents (expert_id,mode,on_at,updated_at) VALUES (1,'on',?,?)").run(t - 50 * HOUR, t);
  RUN = Number(DB.raw.prepare("INSERT INTO ai_runs (assignment_id,expert_id,request_id,state,data_json,next_at,created_at,updated_at) VALUES (1,1,'R-P3','work',?,0,?,?)")
    .run(JSON.stringify({ items: [{ id: 41, title: "میلگرد ۱۲ آجدار", qty: 5, unit: "تن", prep: 1, smart: { n: 0 } }], cands: [], how: "auto", invited_at: t - 30 * HOUR }), t - 40 * HOUR, t).lastInsertRowid);
  DB.raw.prepare("INSERT INTO sp_suppliers (id,name,name_n,demo,created_at) VALUES (5,'آهن الف','آهن الف',0,?)").run(t);
  DB.raw.prepare("INSERT INTO sp_phones (id,supplier_id,phone,label,k,created_at,panel) VALUES (9,5,'09120000555','فروش','abcdefabcdef',?,1)").run(t);
  DB.raw.prepare("INSERT INTO sp_threads (id,assignment_id,request_id,supplier_id,phone_id,last_at,created_at) VALUES (50,1,'R-P3',5,9,?,?)").run(t, t);
  DB.raw.prepare(`INSERT INTO sp_lines (thread_id,item_id,title,head,layers_json,req_qty,req_unit,qty,unit,price,state,no,created_at,updated_at) VALUES (50,41,'میلگرد ۱۲ آجدار','میلگرد',?,5,'تن',5,'تن',410000000,'final',1,?,?)`)
    .run(JSON.stringify([{ k: "قطر", v: "12" }]), t, t);
  DB.raw.prepare("INSERT INTO ai_threads (thread_id,run_id,source,state,seen_msg,created_at,updated_at) VALUES (50,?,'smart','final',0,?,?)").run(RUN, t, t);
  /* یک پیشنهادِ تأییدنهایی (کارشناس هوشمند) — حد با قواعدِ این آزمون ۳ است */
  DB.raw.prepare(`INSERT INTO quotes (id,assignment_id,item_id,supplier_name,unit,qty,price,dtime,pay,invoice,vat,saved,final,source,origin,created_at,updated_at)
    VALUES (101,1,41,'آهن الف','تن',5,410000000,'10','نقدی','رسمی','دارد',1,1,'ai','smart',?,?)`).run(t, t);
}

/* ---------- دنیای بیرونِ بدلی ---------- */
const calls = [];
let nextMsg = 9000;
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
if (DB) SUP = { "X-Support-Token": (await call("/support/setup", { body: { pass: "faz-se-123" } })).data.token };
const since = (n) => calls.slice(n);
const usage = { input_tokens: 5000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const jsonOut = (o) => ({ model: "claude-opus-5-5", stop_reason: "end_turn", usage, content: [{ type: "text", text: JSON.stringify(o) }] });
const turn = (o) => jsonOut({ reply: "", actions: [], thread_status: "active", memo: "", note: "", ask_expert: "", ...o });
const kind = (b) => (b.tools && b.tools[0] && b.tools[0].name) || (b.output_config && b.output_config.format ? (/تمام شده است/.test(JSON.stringify(b.system)) ? "closing" : "negotiate") : "?");
const due = () => DB.raw.prepare("UPDATE ai_runs SET next_at=0").run();
const runRow = () => DB.raw.prepare("SELECT * FROM ai_runs WHERE id=?").get(RUN);

const RULES = {
  unit: [{ from: "۱۰٬۰۰۰٬۰۰۰", to: "100,000,000", min: 2 }, { from: "100000000", to: "", min: 3 }],
  total: [{ from: 0, to: 1000000000, min: 1 }, { from: 1000000000, to: null, min: 2 }],
  qty: [{ from: 100, to: null, min: 4 }],
  waitHours: 24,
};

test("needFor و cleanRules: بازه‌ها، رقم فارسی، حدِ پایه و خطاهای فرم", () => {
  const r = cleanRules(RULES);
  assert.deepEqual(r.unit, [{ from: 10000000, to: 100000000, min: 2 }, { from: 100000000, to: null, min: 3 }]);
  assert.equal(r.waitHours, 24);
  /* قیمت واحد ۴۱۰ میلیون ← ۳؛ قیمت کل ۲٬۰۵ میلیارد ← ۲؛ مقدار ۵ ← هیچ */
  const n = needFor(r, 1, { qty: 5, offers: [{ price: 410000000, qty: 5 }] });
  assert.equal(n.need, 3);
  assert.match(whyText(n), /قیمت واحد ۴۱۰٬۰۰۰٬۰۰۰ ریال .* ← ۳/);
  assert.equal(needFor(r, 1, { qty: 5, offers: [{ price: 5000000, qty: 5 }] }).need, 1, "زیرِ همهٔ بازه‌ها: حدِ پایه");
  assert.equal(needFor(r, 2, { qty: 5, offers: [] }).need, 2, "بی قیمت: حدِ پایه");
  assert.equal(needFor(r, 1, { qty: 150, offers: [] }).need, 4, "بازهٔ مقدار");
  assert.throws(() => cleanRules({ unit: [{ from: 5, to: 3, min: 2 }] }), /«تا» باید از «از» بزرگ‌تر/);
  assert.throws(() => cleanRules({ total: [{ from: 1, min: 0 }] }), /حداقلِ استعلام/);
  assert.throws(() => cleanRules({ waitHours: 1000 }), /مهلت/);
  assert.deepEqual(cleanRules({ qty: [{ from: "", to: "", min: "" }] }).qty, [], "ردیفِ خالی کنار می‌رود");
});

test("قواعد از پنل پشتیبانی: فقط با رمز پشتیبانی، با رخداد در گزارش", { skip: SKIP }, async () => {
  assert.equal((await call("/support/ai/rules")).status, 401);
  const g0 = (await call("/support/ai/rules", { headers: SUP })).data;
  assert.deepEqual([g0.rules.unit, g0.rules.waitHours, g0.base], [[], 24, 1]);
  const bad = await call("/support/ai/rules", { method: "PUT", headers: SUP, body: { unit: [{ from: 9, to: 3, min: 2 }] } });
  assert.equal(bad.status, 400);
  const ok = await call("/support/ai/rules", { method: "PUT", headers: SUP, body: RULES });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.rules.unit.length, 2);
  const g = (await call("/support/ai/rules", { headers: SUP })).data;
  assert.deepEqual(g.rules.total[1], { from: 1000000000, to: null, min: 2 });
  assert.ok(DB.raw.prepare("SELECT 1 AS x FROM events WHERE kind='ai_rules' AND actor='support'").get());
  const feed = (await call("/support/activity?g=support", { headers: SUP })).data.rows;
  assert.ok(feed.some((r) => /قواعدِ حداقلِ استعلام/.test(r.text)));
});

test("پروندهٔ مذاکره حداقلِ استعلامِ هر قلم را دارد و کارشناس هوشمند با کمتر از حد نمی‌بندد", { skip: SKIP }, async () => {
  DB.raw.prepare("UPDATE ai_threads SET state='active' WHERE thread_id=50").run();
  DB.raw.prepare("INSERT INTO sp_msgs (thread_id,who,kind,body,at) VALUES (50,'s','text','قیمت را ثبت کردیم.',?)").run(Date.now());
  let ctxText = "", sys = "";
  model = (b) => { ctxText = b.messages[0].content[0].text; sys = JSON.stringify(b.system); return turn({ reply: "ممنون 🙏" }); };
  due();
  const r = await aiTick(env);
  assert.equal(r.step, "turn", JSON.stringify(r));
  assert.match(ctxText, /حداقلِ استعلامِ این قلم: ۳ پیشنهادِ تأییدنهایی از تأمین‌کنندگانِ مختلف \(قیمت واحد ۴۱۰٬۰۰۰٬۰۰۰ ریال .*\) — تا حالا ۱/);
  assert.match(sys, /«حداقلِ استعلام»/, "قاعدهٔ تصمیم در پرامپت");
  /* سکوت هم که باشد، با یک پیشنهاد از سه، پایان نیست */
  DB.raw.prepare("UPDATE sp_msgs SET at=? WHERE thread_id=50").run(Date.now() - 2 * HOUR);
  DB.raw.prepare("UPDATE ai_runs SET data_json=json_set(data_json,'$.invited_at',?) WHERE id=?").run(Date.now() - 2 * HOUR, RUN);
  due();
  const w = await aiTick(env);
  assert.equal(w.step, "wait", JSON.stringify(w));
  assert.equal(runRow().state, "work");
  const d = (await call(`/support/ai/1/runs/${RUN}`, { headers: SUP })).data;
  assert.deepEqual([d.items[0].covered, d.items[0].need], [1, 3]);
});

test("مهلت گذشت: آلارمِ تلگرام و واگذاری — سوابق و جستجو باز، جدول و نامه قفل؛ فقط یک بار", { skip: SKIP }, async () => {
  DB.raw.prepare("UPDATE ai_runs SET data_json=json_set(data_json,'$.invited_at',?) WHERE id=?").run(Date.now() - 30 * HOUR, RUN);
  const n = calls.length;
  due();
  const r = await aiTick(env);
  assert.equal(r.step, "handover", JSON.stringify(r));
  assert.ok(runRow().handover_at);
  const tg = since(n).find((c) => c.bot === "main" && c.method === "sendMessage" && String(c.body.chat_id) === String(AI_CHAT));
  assert.ok(tg, "آلارم در بات کارشناسان");
  assert.match(tg.body.text, /به حداقلِ استعلامِ درخواست R-P3 نرسید/);
  assert.match(tg.body.text, /میلگرد ۱۲ آجدار — ۱ از ۳/);
  assert.match(tg.body.reply_markup.inline_keyboard[0][0].web_app.url, /expert\.html\?tg=1$/);
  assert.ok(DB.raw.prepare("SELECT 1 AS x FROM events WHERE kind='ai_handover'").get());
  /* سوابق و جستجو باز؛ جدول و نامه قفل */
  assert.equal((await call("/items/41/progress", { headers: EX, body: { stage: "hist" } })).status, 200);
  assert.notEqual((await call("/suppliers/history?item_id=41", { headers: EX })).status, 423);
  assert.equal((await call("/assignments/1/commission", { headers: EX, body: {} })).status, 423);
  assert.equal((await call("/assignments/1/letter", { headers: EX, body: {} })).status, 423);
  const det = (await call("/assignments/1", { headers: EX })).data;
  assert.ok(det.ai.owned.handover);
  assert.deepEqual(det.ai.cover.map((c) => [c.need, c.have]), [[3, 1]]);
  assert.equal((await call("/tray?full=1", { headers: EX })).data.assignments.find((a) => a.id === 1).ai, 2, "نشانِ واگذاری در کارتابل");
  const sup = (await call("/support/ai/experts", { headers: SUP })).data;
  assert.deepEqual(sup.handovers.map((h) => [h.request_id, h.items[0].need]), [["R-P3", 3]]);
  /* دورِ بعد: آلارمِ دوباره نیست */
  const n2 = calls.length;
  due();
  assert.equal((await aiTick(env)).step, "wait");
  assert.equal(since(n2).filter((c) => c.bot === "main" && c.method === "sendMessage").length, 0);
});

test("«پایان»ِ پشتیبانی با کمتر از حد ← جدول و نامه با کمبود؛ تحویل در پنل پشتیبانی", { skip: SKIP }, async () => {
  assert.equal((await call(`/support/ai/1/runs/${RUN}/act`, { headers: SUP, body: { action: "finish" } })).status, 200);
  let closingCtx = "";
  model = (b) => {
    if (kind(b) === "closing") {
      closingCtx = b.messages[0].content[0].text;
      return jsonOut({ narrative: "از آهن الف پیشنهادِ کامل رسید؛ دیگران پاسخ ندادند.", criteria: ["انطباق کامل"], challenges: ["کمتر از حداقلِ استعلام"],
        picks: [{ item: "میلگرد ۱۲ آجدار", supplier: "آهن الف", why: "تنها پیشنهادِ کامل" }], notes: "یک پیشنهاد از سه." });
    }
    assert.equal(kind(b), "write_letter");
    return { model: "claude-haiku-4-5", usage: { input_tokens: 2000, output_tokens: 300 }, content: [{ type: "tool_use", name: "write_letter",
      input: { paragraphs: ["احتراماً به استحضار می‌رساند از آهن الف استعلام اخذ گردید."], closing: "مراتب جهت استحضار ارائه می‌گردد.", uncertain: [] } }] };
  };
  due();
  const f = await aiTick(env);
  assert.deepEqual([f.step, f.short], ["finish", 1], JSON.stringify(f));
  assert.equal(runRow().state, "closing");
  due(); await aiTick(env);   /* شرح */
  assert.match(closingCtx, /<حداقل_استعلام>[\s\S]*میلگرد ۱۲ آجدار: لازم ۳ [\s\S]*رسید ۱ ⚠️ کمتر از حداقل/);
  assert.match(closingCtx, /کار برای استعلامِ بیشتر به کارشناسِ خرید هم واگذار شد/);
  due(); await aiTick(env);   /* نامه */
  const n = calls.length;
  due(); await aiTick(env);   /* جدول و تحویل */
  const sum = since(n).find((c) => c.bot === "main" && c.method === "sendMessage" && /تحویلِ درخواست R-P3/.test(c.body.text));
  assert.ok(sum);
  assert.match(sum.body.text, /کمتر از حداقلِ استعلام/);
  assert.match(sum.body.text, /پنل پشتیبانی/);
  assert.equal(JSON.parse(runRow().review_json).state, "new");
  assert.ok(DB.raw.prepare("SELECT 1 AS x FROM events WHERE kind='ai_delivery'").get());
  due(); await aiTick(env);   /* پیامِ پایانی */
  assert.equal(runRow().state, "done");

  /* پنل پشتیبانی: فهرست، نشانِ تازه و جزئیات */
  assert.equal((await call("/support/ai/deliveries")).status, 401);
  const L = (await call("/support/ai/deliveries?state=new", { headers: SUP })).data.deliveries;
  assert.equal(L.length, 1);
  assert.deepEqual([L[0].id, L[0].request_id, L[0].items, L[0].finals, L[0].short.length], [RUN, "R-P3", 1, 1, 1]);
  assert.equal((await call("/support/ai/experts", { headers: SUP })).data.deliveries.new, 1);
  const D = (await call(`/support/ai/deliveries/${RUN}`, { headers: SUP })).data;
  assert.match(D.report.narrative, /آهن الف/);
  assert.deepEqual(D.items.map((i) => [i.title, i.cover.need, i.cover.have, i.quotes.length]), [["میلگرد ۱۲ آجدار", 3, 1, 1]]);
  assert.match(D.letter.paragraphs[0], /آهن الف/);
  assert.ok(D.request.commission_no, "شمارهٔ فرم کمیسیون");
  assert.equal((await call("/support/assignments/1/sheet/commission?format=html", { headers: SUP })).status, 200, "پیش‌نمایشِ جدول");
  assert.equal((await call("/support/assignments/1/sheet/request?format=html", { headers: SUP })).status, 200, "پیش‌نمایشِ برگهٔ درخواست");
});

test("ردِ تحویل درخواست را کامل به کارشناس برمی‌گرداند؛ تأیید = تیکِ کمیسیون", { skip: SKIP }, async () => {
  assert.equal((await call("/sp/thread/50", { headers: EX })).status, 423, "پیش از رد: گفت‌وگوی کارشناس هوشمند بسته");
  assert.equal((await call("/quotes/101", { method: "PUT", headers: EX, body: { final: 0 } })).status, 423);
  const noReason = await call(`/support/ai/deliveries/${RUN}/review`, { headers: SUP, body: { ok: false } });
  assert.equal(noReason.status, 400);
  const rej = await call(`/support/ai/deliveries/${RUN}/review`, { headers: SUP, body: { ok: false, reason: "دو استعلامِ دیگر لازم است." } });
  assert.equal(rej.status, 200, JSON.stringify(rej.data));
  assert.equal(JSON.parse(runRow().review_json).state, "rejected");
  const q = DB.raw.prepare("SELECT payload_json FROM outbox WHERE target=? ORDER BY id DESC LIMIT 1").get(String(AI_CHAT));
  assert.match(JSON.parse(q.payload_json).text, /رد کرد[\s\S]*دو استعلامِ دیگر لازم است/);
  assert.ok(DB.raw.prepare("SELECT 1 AS x FROM events WHERE kind='ai_reject'").get());
  /* همه‌چیز آزاد: گفت‌وگو، خطِ کارشناس هوشمند، نشانِ خط‌ها */
  assert.equal((await call("/sp/thread/50", { headers: EX })).status, 200);
  assert.notEqual((await call("/quotes/101", { method: "PUT", headers: EX, body: { final: 1 } })).status, 423);
  const det = (await call("/assignments/1", { headers: EX })).data;
  assert.ok(det.quotes.every((x) => !x.ai));
  assert.equal(det.ai.review.state, "rejected");
  assert.equal((await call("/support/ai/deliveries?state=rejected", { headers: SUP })).data.deliveries.length, 1);
  /* تصمیم عوض می‌شود: تأیید ← تیکِ کمیسیون و پیامِ «🔒 خاتمه» */
  const ok = await call(`/support/ai/deliveries/${RUN}/review`, { headers: SUP, body: { ok: true } });
  assert.equal(ok.status, 200);
  assert.equal(DB.raw.prepare("SELECT commission_ok FROM items WHERE id=41").get().commission_ok, 1);
  assert.equal(JSON.parse(runRow().review_json).state, "ok");
  const last = DB.raw.prepare("SELECT payload_json FROM outbox WHERE target=? ORDER BY id DESC LIMIT 1").get(String(AI_CHAT));
  assert.match(last.payload_json, /خاتمه/);
  assert.equal((await call("/support/ai/experts", { headers: SUP })).data.deliveries.new, 0);
});
