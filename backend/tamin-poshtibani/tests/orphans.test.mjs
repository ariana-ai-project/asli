/* ============================================================
   حذفِ درخواست و شناسه‌های دوباره‌استفاده‌شده (مهر ۱۴۰۵، گزارشِ مالک)

   درخواستی حذف شد و همان قلم با شمارهٔ تازه دوباره بارگذاری شد؛ SQLite شناسهٔ ارجاع و قلمِ حذف‌شده را دوباره داد و
   گفت‌وگوهای تأمین‌کنندهٔ قدیمی (که با حذف نمی‌رفتند) به درخواستِ تازه چسبیدند — مکاتباتِ قدیمی در فهرست، و قلمِ تازه
   «فرستاده‌شده و قفل» (پیامِ LOCK_MSG هنگامِ تأییدِ ساختار).
   • حذفِ درخواست گفت‌وگوها، خط‌ها، پیام‌ها، بسته‌ها و اجرای کارشناس هوشمند را هم پاک می‌کند
   • پاک‌سازیِ یک‌بارهٔ یتیم‌های قبلی (cleanOrphans): فقط گفت‌وگویی که ارجاعش نیست یا مالِ درخواستِ دیگری است
   • قفل و فهرستِ مکاتبات فقط گفت‌وگوی همان درخواست را می‌شمارند
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route, cleanOrphans } from "../../../worker/api.js";
import { itemLocks, expertThreads } from "../../../worker/sp-core.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = { DB, MANAGER_CODE: "4321" };
const T0 = Date.now();
const run = (sql, ...a) => DB.raw.prepare(sql).run(...a);
const n = (sql, ...a) => DB.raw.prepare(sql).get(...a).n;
function seedOld() {
  run("INSERT INTO requests (id,date,party) VALUES ('R-OLD','1405/06/30','پروژهٔ آزمایشی')");
  run("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,created_at) VALUES (1,'R-OLD',1,3,?,?)", T0, T0);
  run("INSERT INTO items (id,request_id,item_key,line_no,title,qty,unit,state,assignment_id) VALUES (1,'R-OLD','a',1,'دیسک ترمز',2,'عدد','open',1)");
  run("INSERT INTO sp_suppliers (id,name,name_n,demo,created_at) VALUES (1,'تأمین واقعی','تامین واقعی',0,?)", T0);
  run("INSERT INTO sp_threads (id,assignment_id,request_id,supplier_id,last_at,created_at) VALUES (1,1,'R-OLD',1,?,?)", T0, T0);
  run("INSERT INTO sp_lines (id,thread_id,item_id,title,head,layers_json,state,created_at,updated_at) VALUES (1,1,1,'دیسک ترمز','دیسک','[]','new',?,?)", T0, T0);
  run("INSERT INTO sp_msgs (thread_id,who,kind,body,at) VALUES (1,'e','text','سلام، استعلام دیسک',?)", T0);
  run("INSERT INTO sp_bundles (id,thread_id,line_ids,state,created_at) VALUES (1,1,'[1]','pending',?)", T0);
  run("INSERT INTO ai_runs (id,assignment_id,expert_id,request_id,state,next_at,created_at,updated_at) VALUES (1,1,1,'R-OLD','run',?,?,?)", T0, T0, T0);
  run("INSERT INTO ai_threads (thread_id,run_id,created_at,updated_at) VALUES (1,1,?,?)", T0, T0);
}
if (DB) {
  await ensureSchema(env);
  run("DELETE FROM experts");
  run("INSERT INTO experts (id,name,label,code,active,speed,created_at) VALUES (1,'کارشناس','کارشناس','7001',1,1,?)", T0);
}
const call = async (path, body) => {
  const res = await route(new Request("https://x/tamin-poshtibani/api" + path, { method: "POST", headers: { "Content-Type": "application/json", "X-Manager-Code": "4321" }, body: JSON.stringify(body) }), env, { waitUntil() {} });
  return { status: res.status, data: await res.json() };
};

test("حذفِ درخواست گفت‌وگوها و کارِ کارشناس هوشمند را هم می‌برد؛ درخواستِ تازه با همان شناسه‌ها چیزی به ارث نمی‌برد", { skip: SKIP }, async () => {
  seedOld();
  assert.ok((await itemLocks(env, [1])).has(1), "پیش از حذف: قلم فرستاده‌شده و قفل است");
  const del = await call("/requests/delete", { ids: ["R-OLD"] });
  assert.equal(del.status, 200, JSON.stringify(del.data));
  for (const tb of ["sp_threads", "sp_lines", "sp_msgs", "sp_bundles", "ai_runs", "ai_threads"]) assert.equal(n(`SELECT COUNT(*) AS n FROM ${tb}`), 0, `${tb} خالی شد`);
  assert.equal(n("SELECT COUNT(*) AS n FROM sp_suppliers"), 1, "خودِ تأمین‌کننده (دفترچه) می‌ماند");
  /* همان قلم با شمارهٔ تازه — SQLite همان شناسه‌ها را دوباره می‌دهد */
  run("INSERT INTO requests (id,date,party) VALUES ('R-NEW','1405/07/16','پروژهٔ آزمایشی')");
  run("INSERT INTO assignments (request_id,expert_id,days,dispatched_at,created_at) VALUES ('R-NEW',1,3,?,?)", T0, T0);
  run("INSERT INTO items (request_id,item_key,line_no,title,qty,unit,state,assignment_id) VALUES ('R-NEW','a',1,'دیسک ترمز',2,'عدد','open',1)");
  assert.equal(DB.raw.prepare("SELECT id FROM assignments WHERE request_id='R-NEW'").get().id, 1, "شناسهٔ ارجاع دوباره استفاده شد (شرایطِ همان باگ)");
  assert.equal(DB.raw.prepare("SELECT id FROM items WHERE request_id='R-NEW'").get().id, 1);
  assert.equal((await itemLocks(env, [1])).has(1), false, "قلمِ تازه قفل نیست");
  const th = await expertThreads(env, { id: 1 });
  assert.deepEqual(th.requests.flatMap((g) => g.threads), [], "مکاتباتِ قدیمی به درخواستِ تازه نچسبید");
});

test("پاک‌سازیِ یک‌باره: فقط گفت‌وگوی یتیم (ارجاعش نیست یا مالِ درخواستِ دیگری است) و یک بار", { skip: SKIP }, async () => {
  /* یتیمی که از پیش از این اصلاح مانده: ارجاعِ ۱ حالا مالِ R-NEW است ولی گفت‌وگو مالِ R-OLD */
  run("INSERT INTO sp_threads (id,assignment_id,request_id,supplier_id,last_at,created_at) VALUES (5,1,'R-OLD',1,?,?)", T0, T0);
  run("INSERT INTO sp_lines (id,thread_id,item_id,title,state,created_at,updated_at) VALUES (5,5,1,'دیسک ترمز','new',?,?)", T0, T0);
  run("INSERT INTO sp_msgs (thread_id,who,kind,body,at) VALUES (5,'s','text','قیمت قدیمی',?)", T0);
  /* گفت‌وگوی درستِ R-NEW (با تأمین‌کنندهٔ دیگر — (ارجاع، تأمین‌کننده) یکتاست؛ همین یکتایی بود که گفت‌وگوی یتیم را برای همان
     تأمین‌کننده دوباره به کار می‌برد) */
  run("INSERT INTO sp_suppliers (id,name,name_n,demo,created_at) VALUES (2,'تأمین دوم','تامین دوم',0,?)", T0);
  run("INSERT INTO sp_threads (id,assignment_id,request_id,supplier_id,last_at,created_at) VALUES (6,1,'R-NEW',2,?,?)", T0, T0);
  run("INSERT INTO sp_msgs (thread_id,who,kind,body,at) VALUES (6,'e','text','استعلام تازه',?)", T0);
  /* اجرای یتیم: ارجاعش نیست */
  run("INSERT INTO ai_runs (id,assignment_id,expert_id,request_id,state,next_at,created_at,updated_at) VALUES (9,99,1,'R-GONE','run',?,?,?)", T0, T0, T0);
  assert.ok((await itemLocks(env, [1])).size === 0, "حتی پیش از پاک‌سازی، قفل فقط گفت‌وگوی همان درخواست را می‌شمارد");
  const listed = (await expertThreads(env, { id: 1 })).requests.flatMap((g) => g.threads.map((t) => t.id));
  assert.deepEqual(listed, [6], "فهرستِ مکاتبات هم یتیم را نشان نمی‌دهد");
  run("DELETE FROM settings WHERE key='orphans1'");
  const r = await cleanOrphans(env);
  assert.deepEqual({ threads: r.threads, runs: r.runs }, { threads: 1, runs: 1 });
  assert.deepEqual(DB.raw.prepare("SELECT id FROM sp_threads ORDER BY id").all().map((x) => x.id), [6], "فقط یتیم رفت");
  assert.equal(n("SELECT COUNT(*) AS n FROM sp_msgs WHERE thread_id=6"), 1);
  assert.equal(n("SELECT COUNT(*) AS n FROM sp_msgs WHERE thread_id=5"), 0);
  assert.equal(n("SELECT COUNT(*) AS n FROM sp_lines WHERE thread_id=5"), 0);
  assert.equal(n("SELECT COUNT(*) AS n FROM ai_runs WHERE id=9"), 0);
  assert.equal(await cleanOrphans(env), null, "بار دوم کاری نمی‌کند");
});
