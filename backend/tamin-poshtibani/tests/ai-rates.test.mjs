/* ============================================================
   ⭐ امتیازِ کارشناس به کارِ کارشناس هوشمند (مهر ۱۴۰۵، درخواستِ مالک)

   • هر پیامی که کارشناس هوشمند برای تأمین‌کننده نوشته ۱ تا ۵ ستاره می‌گیرد؛ کمتر از سه ستاره علت می‌خواهد. قالبِ ثابتِ دعوت،
     کارتِ رخداد، یادداشتِ درونی و پیامِ تأمین‌کننده امتیاز نمی‌گیرند.
   • کلِ مکاتبه بعد از بسته شدن (یا وقتی کار به کمیسیون رسیده) ستاره و نظرِ اجباری؛ نامهٔ کمیسیونِ کارشناس هوشمند هم.
   • «خاتمه»ِ کارشناس تا همهٔ امتیازها داده نشده معلق است (۴۰۹ با فهرستِ مانده‌ها) — تصمیمِ مالک.
   • امتیازهای کم با علتشان در پروندهٔ دورِ بعدِ مذاکره می‌آیند.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import { negotiationContext } from "../../../worker/ai-prompts.js";
import { ratesForModel, gapText } from "../../../worker/ai-rates.js";
import * as SP from "../../../worker/sp-core.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = { DB, MANAGER_CODE: "1234", TG_WEBHOOK_SECRET: "sec" };
const EX = { "X-Expert-Code": "7001" }, EX2 = { "X-Expert-Code": "7002" };
const M = {};
if (DB) {
  await ensureSchema(env);
  const t = Date.now();
  const run = (sql, ...a) => DB.raw.prepare(sql).run(...a);
  DB.raw.exec("DELETE FROM experts");
  run("INSERT INTO experts (id,name,label,code,active,speed,created_at) VALUES (1,'هوشمند','هوشمند','7001',1,1,?), (2,'دیگری','دیگری','7002',1,1,?)", t, t);
  run("INSERT INTO ai_agents (expert_id,mode,on_at,updated_at) VALUES (1,'on',?,?)", t - 60000, t);
  run(`UPDATE experts SET sup_json='{"mode":"auto","minutes":10}'`);
  run("INSERT INTO requests (id,date,party) VALUES ('R-RT','1405/07/20','پروژهٔ امتیاز')");
  run("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,deadline_at,created_at) VALUES (1,'R-RT',1,5,?,?,?)", t, t + 9e8, t);
  run("INSERT INTO items (id,request_id,item_key,line_no,title,qty,unit,state,assignment_id,commission_ok) VALUES (51,'R-RT','a',1,'کابل',10,'متر','open',1,1)");
  run("INSERT INTO sp_suppliers (id,name,name_n,demo,created_at) VALUES (5,'کابل‌سازان','کابل‌سازان',0,?)", t);
  run("INSERT INTO sp_phones (id,supplier_id,phone,label,k,created_at,panel) VALUES (9,5,'09120000999','فروش','rtrtrtrtrtrt',?,1)", t);
  run("INSERT INTO sp_threads (id,assignment_id,request_id,supplier_id,phone_id,last_at,created_at) VALUES (60,1,'R-RT',5,9,?,?)", t, t);
  const rid = Number(run("INSERT INTO ai_runs (assignment_id,expert_id,request_id,state,data_json,next_at,created_at,updated_at) VALUES (1,1,'R-RT','work','{\"flow\":2}',9e15,?,?)", t, t).lastInsertRowid);
  run("INSERT INTO ai_threads (thread_id,run_id,source,state,seen_msg,created_at,updated_at) VALUES (60,?,'history','active',0,?,?)", rid, t, t);
  const msg = (who, kind, body, meta) => Number(run("INSERT INTO sp_msgs (thread_id,who,kind,body,meta_json,at) VALUES (60,?,?,?,?,?)", who, kind, body, meta ? JSON.stringify(meta) : null, t).lastInsertRowid);
  M.invite = msg("e", "text", "سلام، دعوت به استعلام…", { ai: true, tpl: "invite" });
  M.rfq = msg("e", "event", "📦 استعلام ۱ قلم", { ev: "rfq", ai: true });
  M.sup = msg("s", "text", "قیمت ۵۰۰ هزار ریال است.", null);
  M.a1 = msg("e", "text", "ممنون؛ امکانِ تخفیف هست؟", { ai: true });
  M.note = msg("e", "note", "🤖 یادداشتِ درونی", { ai: true });
  M.a2 = msg("e", "text", "پس با همین قیمت جلو می‌رویم.", { ai: true, prop: 3, auto: true });
  M.human = msg("e", "text", "پیامِ خودِ کارشناس", { own: 3 });
  M.letter = Number(run("INSERT INTO letters (assignment_id,expert_id,transcript,state,meta_json,created_at,updated_at) VALUES (1,1,'متن','written','{\"channel\":\"ai\"}',?,?)", t, t).lastInsertRowid);
}

async function call(path, { method, body, headers } = {}) {
  const h = { ...(headers || {}) };
  let b;
  if (body !== undefined) { b = JSON.stringify(body); h["Content-Type"] = "application/json"; }
  const res = await route(new Request(`https://site.test/tamin-poshtibani/api${path}`, { method: method || (b !== undefined ? "POST" : "GET"), headers: h, body: b }), env, { waitUntil() {} });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch (_) { data = text; }
  return { status: res.status, data };
}
const rate = (body, headers = EX) => call("/sp/x/rate", { headers, body });

test("مانده‌ها: فقط پیام‌های نوشتهٔ کارشناس هوشمند، کلِ مکاتبه و نامه؛ «خاتمه» تا آن موقع معلق", { skip: SKIP }, async () => {
  const d = (await call("/assignments/1", { headers: EX })).data;
  assert.deepEqual([d.ai.rates.msgs, d.ai.rates.threads.map((x) => x.supplier), d.ai.rates.letter, d.ai.rates.total], [2, ["کابل‌سازان"], M.letter, 4]);
  assert.equal(gapText(d.ai.rates), "۲ پیامِ کارشناس هوشمند، ۱ مکاتبهٔ کامل (کابل‌سازان) و نامهٔ کمیسیون");
  const end = await call("/assignments/1/decision", { headers: EX, body: { action: "end" } });
  assert.equal(end.status, 409);
  assert.match(end.data.error, /پیش از «خاتمه» به کارِ کارشناس هوشمند امتیاز بدهید: ۲ پیامِ کارشناس هوشمند، ۱ مکاتبهٔ کامل \(کابل‌سازان\) و نامهٔ کمیسیون/);
  assert.equal(end.data.rate_gaps.total, 4);
  assert.equal(DB.raw.prepare("SELECT state FROM items WHERE id=51").get().state, "open");
});

test("امتیازِ پیام: ۱ تا ۵، کمتر از سه با علت؛ فقط پیامِ کارشناس هوشمند و فقط کارشناسِ خودش؛ عوض‌شدنی", { skip: SKIP }, async () => {
  assert.equal((await rate({ kind: "msg", msg_id: M.a1, stars: 0 })).status, 422);
  assert.equal((await rate({ kind: "msg", msg_id: M.a1, stars: 6 })).status, 422);
  const low = await rate({ kind: "msg", msg_id: M.a1, stars: 2 });
  assert.equal(low.status, 422);
  assert.equal(low.data.need_note, true);
  for (const id of [M.invite, M.rfq, M.sup, M.note, M.human]) assert.equal((await rate({ kind: "msg", msg_id: id, stars: 5 })).status, 409, `پیامِ ${id} امتیاز نمی‌گیرد`);
  assert.equal((await rate({ kind: "msg", msg_id: M.a1, stars: 4 }, EX2)).status, 403, "کارشناسِ دیگر نه");
  const ok = await rate({ kind: "msg", msg_id: M.a1, stars: "۲", note: "زود تخفیف خواست" });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.gaps.msgs, 1);
  const again = await rate({ kind: "msg", msg_id: M.a1, stars: 4 });
  assert.equal(again.status, 200);
  assert.deepEqual({ ...DB.raw.prepare("SELECT COUNT(*) AS n, MAX(stars) AS s FROM ai_rates WHERE kind='msg' AND ref=?").get(M.a1) }, { n: 1, s: 4 });
  assert.equal((await rate({ kind: "msg", msg_id: M.a2, stars: 1, note: "لحنش سرد بود" })).status, 200);
  assert.ok(DB.raw.prepare("SELECT 1 AS x FROM events WHERE kind='ai_rate'").get());
});

test("صفحهٔ مکاتبات: امتیازِ هر پیام و نیازِ گفت‌وگو برای کارشناس؛ تأمین‌کننده نمی‌بیند", { skip: SKIP }, async () => {
  const v = await call("/sp/thread/60", { headers: EX });
  assert.equal(v.status, 200, JSON.stringify(v.data));
  assert.deepEqual(v.data.rates.msgs[M.a2], { stars: 1, note: "لحنش سرد بود" });
  /* قلمِ ۵۱ تأیید کمیسیون دارد: کار به کمیسیون رسیده، پس امتیازِ کلِ مکاتبه هم خواسته می‌شود */
  assert.deepEqual([v.data.rates.rateable, v.data.rates.closed, v.data.rates.thread, v.data.rates.need], [2, true, null, 1]);
  const sup = await call("/sp/thread/60", { headers: { "X-SP-Session": await SP.newSession(env, 9, "web") } });
  assert.equal(sup.status, 200, JSON.stringify(sup.data));
  assert.equal(sup.data.rates, undefined, "تأمین‌کننده امتیازها را نمی‌بیند");
});

test("کلِ مکاتبه: بعد از بسته شدن (یا رسیدن به کمیسیون)، با نظرِ اجباری؛ نامه با نظرِ اجباری؛ بعد «خاتمه»", { skip: SKIP }, async () => {
  DB.raw.exec("UPDATE items SET commission_ok=0 WHERE id=51");
  assert.equal((await rate({ kind: "thread", thread_id: 60, stars: 4, note: "خوب بود" })).status, 409, "گفت‌وگوی باز نه");
  DB.raw.exec("UPDATE items SET commission_ok=1 WHERE id=51");
  assert.equal((await rate({ kind: "thread", thread_id: 60, stars: 5 })).status, 422, "نظر اجباری");
  DB.raw.exec("UPDATE ai_threads SET state='final' WHERE thread_id=60");
  assert.equal((await call("/sp/thread/60", { headers: EX })).data.rates.need, 1, "بسته شد: امتیازِ کل خواسته می‌شود");
  DB.raw.exec("UPDATE items SET commission_ok=0 WHERE id=51");
  assert.equal((await call("/sp/thread/60", { headers: EX })).data.rates.closed, true, "بسته بودنِ خودِ گفت‌وگو هم کافی است");
  DB.raw.exec("UPDATE items SET commission_ok=1 WHERE id=51");
  const th = await rate({ kind: "thread", thread_id: 60, stars: 4, note: "مذاکرهٔ خوبی بود ولی کمی کُند." });
  assert.equal(th.status, 200, JSON.stringify(th.data));
  assert.deepEqual([th.data.gaps.threads.length, th.data.gaps.letter], [0, M.letter]);
  assert.equal((await rate({ kind: "letter", letter_id: M.letter, stars: 3 })).status, 422, "نظر اجباری");
  assert.equal((await rate({ kind: "letter", letter_id: M.letter, stars: 3 }, EX2)).status, 403);
  const L = await rate({ kind: "letter", letter_id: M.letter, stars: 3, note: "نامه کامل بود؛ چالش‌ها کوتاه آمده." });
  assert.equal(L.status, 200, JSON.stringify(L.data));
  assert.equal(L.data.gaps.total, 0);
  const end = await call("/assignments/1/decision", { headers: EX, body: { action: "end" } });
  assert.equal(end.status, 200, JSON.stringify(end.data));
  assert.equal(DB.raw.prepare("SELECT state FROM items WHERE id=51").get().state, "closed");
});

test("پروندهٔ مذاکره: امتیازهای کم با علت اول", { skip: SKIP }, async () => {
  const r = await ratesForModel(env, 60);
  assert.deepEqual(r.map((x) => x.stars), [1, 4], "کم اول");
  const ctx = negotiationContext({ company: "شرکت", request: { id: "R-RT", party: "پ" }, now: "امروز", turn: 2, maxTurns: 8, supplier: { name: "کابل‌سازان", source: "—" },
    lines: [], terms: {}, rel: [], bundles: [], bench: [], memo: "", errors: [], ask: null, transcript: "", pfRead: false, chat: true, sup: null, props: [], rates: r });
  const s = typeof ctx === "string" ? ctx : JSON.stringify(ctx);
  assert.match(s, /<امتیاز_کارشناس_به_پیام‌هایت>/);
  assert.match(s, /★☆☆☆☆ \(۱ از ۵\) — پیامِ تو: «پس با همین قیمت جلو می‌رویم\.» — نظرِ کارشناس: «لحنش سرد بود»/);
});
