/* ============================================================
   گفت‌وگوهای کارشناس هوشمند برای کارشناس: «فقط دیدن» و «🚨 باز کردنِ اضطراری» (مهر ۱۴۰۵، درخواست مالک)
   • کارشناس گفت‌وگوی بسته را می‌خواند (و تازه‌هایش را)، ولی پیام نمی‌فرستد
   • باز کردنِ اضطراری علت می‌خواهد؛ گفت‌وگو دستِ کارشناس می‌شود و کارشناس هوشمند در آن جواب نمی‌دهد
   • هشدار در پنل مدیر و پشتیبان (جداگانه «دیدم») و در تلگرامِ مدیر و پشتیبان اگر وصل‌اند
   • «🤖 برگرداندن» گفت‌وگو را دوباره بسته و دستِ کارشناس هوشمند می‌کند
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = { DB, MANAGER_CODE: "4321" };
const T0 = Date.now();
const run = (sql, ...a) => DB.raw.prepare(sql).run(...a);
const EX = { "X-Expert-Code": "7001" }, MGR = { "X-Manager-Code": "4321" };
const call = async (method, path, body, headers) => {
  const h = { "Content-Type": "application/json", ...(headers || {}) };
  const res = await route(new Request("https://x/tamin-poshtibani/api" + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env, { waitUntil() {} });
  return { status: res.status, data: await res.json() };
};
let SUP = null;
if (DB) {
  await ensureSchema(env);
  run("DELETE FROM experts");
  run("INSERT INTO experts (id,name,label,code,active,speed,created_at) VALUES (1,'کارشناس','خانم کارشناس','7001',1,1,?)", T0);
  run("INSERT INTO requests (id,date,party) VALUES ('R-9','1405/07/19','پروژهٔ آزمایشی')");
  run("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,created_at) VALUES (1,'R-9',1,3,?,?)", T0, T0);
  run("INSERT INTO items (id,request_id,item_key,line_no,title,qty,unit,state,assignment_id) VALUES (1,'R-9','a',1,'دیسک',1,'عدد','open',1)");
  run("INSERT INTO sp_suppliers (id,name,name_n,demo,created_at) VALUES (1,'شرکت الف','شرکت الف',0,?)", T0);
  run("INSERT INTO sp_threads (id,assignment_id,request_id,supplier_id,last_at,created_at) VALUES (1,1,'R-9',1,?,?)", T0, T0);
  run("INSERT INTO sp_msgs (thread_id,who,kind,body,meta_json,at) VALUES (1,'e','text','سلام، برای دیسک قیمت می‌خواستیم','{\"ai\":true}',?)", T0);
  run("INSERT INTO sp_msgs (thread_id,who,kind,body,at) VALUES (1,'s','text','قیمت ۱۰۰ میلیون',?)", T0 + 1);
  run("INSERT INTO ai_agents (expert_id,mode,on_at,updated_at) VALUES (1,'on',?,?)", T0 - 60000, T0);
  run("INSERT INTO ai_runs (id,assignment_id,expert_id,request_id,state,next_at,created_at,updated_at) VALUES (1,1,1,'R-9','work',?,?,?)", T0 + 3600000, T0, T0);
  run("INSERT INTO ai_threads (thread_id,run_id,state,created_at,updated_at) VALUES (1,1,'active',?,?)", T0, T0);
  run("INSERT INTO settings (key,value,updated_at) VALUES ('managerChat','\"-100777\"',?)", T0);
  SUP = { "X-Support-Token": (await call("POST", "/support/setup", { pass: "9753" })).data.token };
}

test("فقط دیدن: گفت‌وگوی بسته خوانده می‌شود، پیام نه", { skip: SKIP }, async () => {
  const th = await call("GET", "/sp/thread/1", null, EX);
  assert.equal(th.status, 200, JSON.stringify(th.data));
  assert.equal(th.data.thread.ai.locked, true);
  assert.equal(th.data.msgs.length, 2, "پیام‌ها دیده می‌شوند");
  assert.equal((await call("GET", "/sp/poll?t=1&since=0", null, EX)).status, 200, "تازه‌ها");
  const w = await call("POST", "/sp/thread/1/msg", { text: "سلام" }, EX);
  assert.equal(w.status, 423, "نوشتن بسته است");
  const list = await call("GET", "/sp/x/threads", null, EX);
  const t = list.data.requests.flatMap((g) => g.threads).find((x) => x.id === 1);
  assert.equal(t.ai, "locked");
  assert.ok(t.last_msg, "پیش‌نمایشِ آخرین پیام هم هست");
});

test("باز کردنِ اضطراری: علت، هشدار، و گفت‌وگو دستِ کارشناس", { skip: SKIP }, async () => {
  assert.equal((await call("POST", "/sp/x/thread/1/takeover", { reason: "" }, EX)).status, 400, "بی علت نه");
  const r = await call("POST", "/sp/x/thread/1/takeover", { reason: "تأمین‌کننده تلفنی گفت فوری است" }, EX);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(DB.raw.prepare("SELECT state FROM ai_threads WHERE thread_id=1").get().state, "human");
  const th = await call("GET", "/sp/thread/1", null, EX);
  assert.equal(th.data.thread.ai.locked, false);
  assert.equal(th.data.thread.ai.human, true);
  const w = await call("POST", "/sp/thread/1/msg", { text: "سلام، خودم پیگیرم" }, EX);
  assert.equal(w.status, 200, "حالا پیام می‌رود");
  const list = await call("GET", "/sp/x/threads", null, EX);
  assert.equal(list.data.requests.flatMap((g) => g.threads).find((x) => x.id === 1).ai, "human");
  /* هشدار: پنل مدیر و پشتیبان، و صفِ تلگرامِ مدیر */
  const am = await call("GET", "/alarms", null, MGR);
  assert.equal(am.status, 200);
  assert.equal(am.data.alarms.length, 1);
  assert.match(am.data.alarms[0].title, /اضطراری/);
  assert.match(am.data.alarms[0].body, /تأمین‌کننده تلفنی گفت فوری است/);
  const as = await call("GET", "/support/alarms", null, SUP);
  assert.equal(as.data.alarms.length, 1);
  assert.ok(DB.raw.prepare("SELECT 1 AS x FROM outbox WHERE target='-100777' AND payload_json LIKE '%اضطراری%'").get(), "تلگرامِ مدیر در صف");
  assert.ok(DB.raw.prepare("SELECT 1 AS x FROM events WHERE kind='ai_takeover'").get());
  /* «دیدم» جداگانه */
  assert.equal((await call("POST", `/alarms/${am.data.alarms[0].id}/ack`, {}, MGR)).status, 200);
  assert.equal((await call("GET", "/alarms", null, MGR)).data.alarms.length, 0);
  assert.equal((await call("GET", "/support/alarms", null, SUP)).data.alarms.length, 1, "پشتیبان هنوز ندیده");
  /* دوباره باز کردن کاری نمی‌کند و هشدارِ تازه نمی‌سازد */
  const again = await call("POST", "/sp/x/thread/1/takeover", { reason: "دوباره" }, EX);
  assert.equal(again.data.already, true);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM alarms").get().n, 1);
});

test("برگرداندن به کارشناس هوشمند: دوباره بسته", { skip: SKIP }, async () => {
  const r = await call("POST", "/sp/x/thread/1/handback", {}, EX);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(DB.raw.prepare("SELECT state FROM ai_threads WHERE thread_id=1").get().state, "active");
  assert.equal((await call("POST", "/sp/thread/1/msg", { text: "x" }, EX)).status, 423);
});

test("شماره‌های پیامکِ هشدار در پنل پشتیبانی", { skip: SKIP }, async () => {
  const bad = await call("PUT", "/support/alert-contacts", { manager_phone: "123" }, SUP);
  assert.equal(bad.status, 400);
  const ok = await call("PUT", "/support/alert-contacts", { manager_phone: "۰۹۱۲۱۲۳۴۵۶۷", support_phone: "" }, SUP);
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.manager_phone, "09121234567");
  assert.equal(ok.data.manager_tg, true);
  assert.equal(ok.data.support_tg, false);
});
