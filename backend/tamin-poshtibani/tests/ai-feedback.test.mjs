/* ============================================================
   🧠 بایگانیِ بازخوردِ کارشناسان به کارشناس هوشمند و صفحهٔ «⭐ ارزیابی ربات»ِ پشتیبانی (مهر ۱۴۰۵، درخواستِ مالک)

   • هر امتیاز (پیام، کلِ مکاتبه، نامه) و هر تصمیم روی پیشنهادِ «⏱ با مهلت» (فرستاد، رد با علت و پیامِ جایگزین، خودکار) یک ردیف
     در ai_feedback با عکسِ زمینه (پیام‌های پیشین، اقلام، تأمین‌کننده، کارشناس، مدل) — امتیازِ دوباره همان ردیف را به‌روز می‌کند
   • داده بعد از حذفِ گفت‌وگو هم می‌ماند (برای آموزشِ مدل)
   • پنل پشتیبانی: میانگین‌ها، پخشِ ستاره، روند، جدولِ کارشناسان، واژه‌های پرتکرارِ علت‌ها، فهرست با فیلتر، جزئیات با زمینه،
     خروجیِ JSONL و CSV، و «🤖 برایند» با مدل (هزینه در ai_calls)
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import { propsDue } from "../../../worker/ai-agent.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = { DB, MANAGER_CODE: "1234", TG_WEBHOOK_SECRET: "sec", ANTHROPIC_API_KEY: "k", ANTHROPIC_API_BASE: "https://ai.test" };
const EX = { "X-Expert-Code": "7001" };
const M = {};
let RUN = 0;
if (DB) {
  await ensureSchema(env);
  const t = Date.now();
  const run = (sql, ...a) => DB.raw.prepare(sql).run(...a);
  DB.raw.exec("DELETE FROM experts");
  run("INSERT INTO experts (id,name,label,code,active,speed,created_at) VALUES (1,'کارشناس','آقای کارشناس','7001',1,1,?)", t);
  run("INSERT INTO ai_agents (expert_id,mode,on_at,updated_at) VALUES (1,'on',?,?)", t - 60000, t);
  run(`UPDATE experts SET sup_json='{"mode":"timer","minutes":10}'`);
  run("INSERT INTO requests (id,date,party) VALUES ('R-FB','1405/07/20','پروژهٔ بازخورد')");
  run("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,deadline_at,created_at) VALUES (1,'R-FB',1,5,?,?,?)", t, t + 9e8, t);
  run("INSERT INTO items (id,request_id,item_key,line_no,title,qty,unit,state,assignment_id,commission_ok) VALUES (71,'R-FB','a',1,'کابل',10,'متر','open',1,1)");
  run("INSERT INTO sp_suppliers (id,name,name_n,demo,created_at) VALUES (5,'کابل‌سازان','کابل‌سازان',0,?)", t);
  run("INSERT INTO sp_phones (id,supplier_id,phone,label,k,created_at,panel) VALUES (9,5,'09120000998','فروش','fbfbfbfbfbfb',?,1)", t);
  run("INSERT INTO sp_threads (id,assignment_id,request_id,supplier_id,phone_id,last_at,created_at) VALUES (60,1,'R-FB',5,9,?,?)", t, t);
  run("INSERT INTO sp_lines (thread_id,item_id,title,req_qty,req_unit,qty,unit,price,state,no,created_at,updated_at) VALUES (60,71,'کابل',10,'متر',10,'متر',500000,'submitted',1,?,?)", t, t);
  RUN = Number(run("INSERT INTO ai_runs (assignment_id,expert_id,request_id,state,data_json,next_at,created_at,updated_at) VALUES (1,1,'R-FB','work','{\"flow\":2}',9e15,?,?)", t, t).lastInsertRowid);
  run("INSERT INTO ai_threads (thread_id,run_id,source,state,seen_msg,created_at,updated_at) VALUES (60,?,'history','active',0,?,?)", RUN, t, t);
  run("INSERT INTO ai_calls (run_id,thread_id,expert_id,purpose,model,status,at) VALUES (?,60,1,'negotiate','claude-opus-5-5','ok',?)", RUN, t - 5000);
  const msg = (who, body, meta, at) => Number(run("INSERT INTO sp_msgs (thread_id,who,kind,body,meta_json,at) VALUES (60,?,'text',?,?,?)", who, body, meta ? JSON.stringify(meta) : null, at).lastInsertRowid);
  M.s1 = msg("s", "قیمت متری ۵۰۰ هزار ریال است.", null, t - 4000);
  M.a1 = msg("e", "ممنون؛ امکانِ تخفیف هست؟", { ai: true }, t - 3000);
  M.s2 = msg("s", "نه، قیمت قطعی است.", null, t - 2000);
  M.a2 = msg("e", "باشه، ممنون از پاسخ‌تان.", { ai: true }, t - 1000);
  M.letter = Number(run(`INSERT INTO letters (assignment_id,expert_id,transcript,letter_json,state,meta_json,created_at,updated_at) VALUES (1,1,'گزارش',?,'written','{"channel":"ai"}',?,?)`,
    JSON.stringify({ to: "کمیسیون", subject: "گزارش خرید کابل", paragraphs: ["از کابل‌سازان خرید شود."] }), t, t).lastInsertRowid);
}

/* مدلِ بدلی برای «برایند» */
let modelBody = null;
globalThis.fetch = async (url, init = {}) => {
  if (String(url).startsWith("https://ai.test/")) {
    modelBody = JSON.parse(init.body);
    const out = { summary: "ربات زود تخفیف می‌خواهد و لحنش گاهی سرد است.", problems: [{ title: "تخفیف زودهنگام", detail: "پیش از قیمت نهایی", share: "۲ از ۳" }], strengths: ["پاسخِ سریع"], actions: ["تخفیف را بعد از قیمت نهایی بخواهد"] };
    return new Response(JSON.stringify({ model: "claude-haiku-4-5", stop_reason: "end_turn", usage: { input_tokens: 2000, output_tokens: 300 }, content: [{ type: "text", text: JSON.stringify(out) }] }), { status: 200, headers: { "content-type": "application/json" } });
  }
  throw new Error(`fetch بیرونیِ پیش‌بینی‌نشده: ${url}`);
};
async function call(path, { method, body, headers } = {}) {
  const h = { ...(headers || {}) };
  let b;
  if (body !== undefined) { b = JSON.stringify(body); h["Content-Type"] = "application/json"; }
  const res = await route(new Request(`https://site.test/tamin-poshtibani/api${path}`, { method: method || (b !== undefined ? "POST" : "GET"), headers: h, body: b }), env, { waitUntil() {} });
  const ct = res.headers.get("content-type") || "";
  return { status: res.status, ct, data: ct.includes("json") && !ct.includes("ndjson") ? await res.json() : await res.text() };
}
const fb = (kind, ref) => DB.raw.prepare("SELECT * FROM ai_feedback WHERE kind=? AND ref=?").get(kind, ref);
let SUP = {};

test("امتیازها با عکسِ زمینه در ai_feedback؛ امتیازِ دوباره همان ردیف", { skip: SKIP }, async () => {
  assert.equal((await call("/sp/x/rate", { headers: EX, body: { kind: "msg", msg_id: M.a1, stars: 2, note: "زود تخفیف خواست" } })).status, 200);
  const r = fb("msg", M.a1);
  assert.ok(r, "ردیفِ بازخورد");
  assert.deepEqual([r.stars, r.note, r.ai_text, r.supplier, r.request_id, r.expert_name, r.model], [2, "زود تخفیف خواست", "ممنون؛ امکانِ تخفیف هست؟", "کابل‌سازان", "R-FB", "آقای کارشناس", "claude-opus-5-5"]);
  const ctx = JSON.parse(r.context_json);
  assert.deepEqual(ctx.transcript.map((m) => [m.who, m.text]), [["supplier", "قیمت متری ۵۰۰ هزار ریال است."]], "فقط پیام‌های پیش از همان پیام");
  assert.deepEqual(JSON.parse(r.items).map((i) => [i.title, i.price]), [["کابل", 500000]]);
  assert.equal((await call("/sp/x/rate", { headers: EX, body: { kind: "msg", msg_id: M.a1, stars: 3 } })).status, 200);
  assert.deepEqual({ ...DB.raw.prepare("SELECT COUNT(*) AS n, MAX(stars) AS s FROM ai_feedback WHERE kind='msg' AND ref=?").get(M.a1) }, { n: 1, s: 3 });
  assert.equal((await call("/sp/x/rate", { headers: EX, body: { kind: "msg", msg_id: M.a2, stars: 1, note: "لحنش سرد و کوتاه بود" } })).status, 200);
  assert.equal((await call("/sp/x/rate", { headers: EX, body: { kind: "thread", thread_id: 60, stars: 3, note: "مذاکره کُند بود ولی مؤدب" } })).status, 200);
  assert.equal(JSON.parse(fb("thread", 60).context_json).transcript.length, 4, "کلِ گفت‌وگو");
  assert.equal((await call("/sp/x/rate", { headers: EX, body: { kind: "letter", letter_id: M.letter, stars: 4, note: "نامه کامل بود" } })).status, 200);
  assert.match(fb("letter", M.letter).ai_text, /موضوع: گزارش خرید کابل[\s\S]*از کابل‌سازان خرید شود/);
});

test("تصمیم‌های «⏱ با مهلت»: فرستاد، رد با علت و پیامِ جایگزین، خودکار — هر کدام یک ردیف", { skip: SKIP }, async () => {
  const t = Date.now();
  const prop = (body, due) => Number(DB.raw.prepare("INSERT INTO ai_props (run_id,thread_id,kind,body,seen_msg,state,created_at,due_at) VALUES (?,60,'reply',?,?,'pending',?,?)")
    .run(RUN, body, M.a2, t, due).lastInsertRowid);
  const p1 = prop("پیشنهادِ ارسالی.", t + 6e5), p2 = prop("پیشنهادِ ردی.", t + 6e5), p3 = prop("پیشنهادِ بی‌پاسخ.", t - 1000);
  assert.equal((await call(`/sp/x/prop/${p1}`, { headers: EX, body: { action: "ok" } })).status, 200);
  assert.equal((await call(`/sp/x/prop/${p2}`, { headers: EX, body: { action: "no", reason: "لحنش طلبکارانه است", text: "ممنون، لطفاً قیمت نهایی را بفرمایید." } })).status, 200);
  assert.equal(await propsDue(env), 1);
  assert.deepEqual([fb("prop", p1).outcome, fb("prop", p3).outcome], ["ok", "auto"]);
  const no = fb("prop", p2);
  assert.deepEqual([no.outcome, no.note, no.ai_text, no.human_text], ["no", "لحنش طلبکارانه است", "پیشنهادِ ردی.", "ممنون، لطفاً قیمت نهایی را بفرمایید."]);
  assert.ok(JSON.parse(no.context_json).transcript.length >= 4, "زمینه تا همان پیام");
});

test("داده بعد از حذفِ گفت‌وگو هم می‌ماند", { skip: SKIP }, async () => {
  const n = DB.raw.prepare("SELECT COUNT(*) AS n FROM ai_feedback").get().n;
  assert.ok(n >= 7);
  DB.raw.exec("DELETE FROM sp_msgs WHERE thread_id=999999");
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM ai_feedback").get().n, n);
});

test("پنل پشتیبانی: آمار، پخش، کارشناسان، واژه‌ها، فهرست با فیلتر و جزئیات", { skip: SKIP }, async () => {
  SUP = { "X-Support-Token": (await call("/support/setup", { body: { pass: "9753" } })).data.token };
  assert.equal((await call("/support/ai/feedback", { headers: EX })).status, 401, "فقط پشتیبانی");
  const s = (await call("/support/ai/feedback?win=30d", { headers: SUP })).data;
  assert.deepEqual([s.kinds.msg.n, s.kinds.msg.avg, s.kinds.msg.low], [2, 2, 1]);
  assert.deepEqual([s.kinds.prop.ok, s.kinds.prop.no, s.kinds.prop.auto], [1, 1, 1]);
  assert.deepEqual(s.dist.msg, [1, 0, 1, 0, 0]);
  assert.equal(s.experts[0].name, "آقای کارشناس");
  assert.equal(s.experts[0].msg.avg, 2);
  assert.equal(s.bucket, "day");
  assert.ok(s.trend.length >= 1);
  assert.ok(s.words.some((w) => w.w === "لحنش" && w.n === 2), JSON.stringify(s.words));
  assert.equal(s.total, s.items.length);
  const low = (await call("/support/ai/feedback?win=30d&low=1", { headers: SUP })).data;
  assert.ok(low.items.every((i) => (i.stars != null && i.stars < 3) || i.outcome === "no"));
  const q = (await call(`/support/ai/feedback?win=30d&kind=prop&q=${encodeURIComponent("طلبکارانه")}`, { headers: SUP })).data;
  assert.deepEqual(q.items.map((i) => i.outcome), ["no"]);
  const one = (await call(`/support/ai/feedback/${q.items[0].id}`, { headers: SUP })).data;
  assert.ok(Array.isArray(one.context.transcript));
  assert.equal(one.context_json, undefined);
});

test("خروجیِ آموزش (JSONL) و اکسل (CSV)", { skip: SKIP }, async () => {
  const j = await call("/support/ai/feedback/export?win=all&format=jsonl", { headers: SUP });
  assert.equal(j.status, 200);
  assert.match(j.ct, /ndjson/);
  const rows = j.data.trim().split("\n").map((l) => JSON.parse(l));
  assert.ok(rows.length >= 7);
  const pair = rows.find((r) => r.kind === "prop" && r.outcome === "no");
  assert.deepEqual([pair.ai_text, pair.human_text], ["پیشنهادِ ردی.", "ممنون، لطفاً قیمت نهایی را بفرمایید."], "جفتِ ردشده/برگزیده");
  assert.ok(Array.isArray(pair.context.transcript));
  const res = await route(new Request("https://site.test/tamin-poshtibani/api/support/ai/feedback/export?win=all&format=csv", { headers: SUP }), env, { waitUntil() {} });
  assert.match(res.headers.get("content-type"), /text\/csv/);
  const bytes = new Uint8Array(await res.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], "BOM تا اکسل فارسی را درست بخواند");
  assert.ok(new TextDecoder().decode(bytes).startsWith('"شناسه"'));
});

test("«🤖 برایند» با مدل: نظرها و علت‌ها، Haiku، هزینه در ai_calls", { skip: SKIP }, async () => {
  const r = await call("/support/ai/feedback/summary", { headers: SUP, body: { win: "30d" } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(modelBody.model, "claude-haiku-4-5");
  assert.match(modelBody.messages[0].content[0].text, /زود تخفیف خواست|لحنش طلبکارانه است/);
  assert.deepEqual([r.data.problems[0].title, r.data.actions.length], ["تخفیف زودهنگام", 1]);
  assert.ok(DB.raw.prepare("SELECT 1 AS x FROM ai_calls WHERE purpose='feedback'").get());
});
