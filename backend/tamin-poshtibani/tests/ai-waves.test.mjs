/* ============================================================
   کارشناس هوشمند و ردهٔ اندازه (مهر ۱۴۰۵، درخواست مالک — فاز ۴؛ worker/ai-picks.js، ai-agent.js:aiWaves)

   • شمارِ پیش‌تیکِ «🎯 فهرست دعوت» = حداقلِ استعلامِ ردهٔ قلم (۳/۵/۵/۷)، نه پنجِ ثابت
   • موجِ دوم: هر waveAt٪ از پنجرهٔ مهلت، قلمی که کمتر از حداقل پیشنهادِ معتبر دارد، به شمارِ کمبود از نفراتِ بعدیِ فهرست دعوت
     می‌شود — نه آن‌که کارشناس صریحاً تیکش را برداشت؛ هر گام یک بار، با رخداد و سطرِ گزارش؛ کلیدِ خاموش و مهلتِ گذشته رعایت می‌شوند
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./run.mjs";
import { ensureSchema } from "../../../worker/api.js";
import { waveStep, waveNextDue, waveTargets, applyEdits } from "../../../worker/ai-picks.js";
import { aiWaves, preTickN } from "../../../worker/ai-agent.js";

const H = 3600000;
const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = { DB };
const T0 = Date.now();
const E = (k, o) => ({ k, name: `تأمین‌کنندهٔ ${k}`, src: "type", top: false, on: false, go: null, why: null, ...o });
const LIST = () => [E("a", { top: true, on: true, go: T0 - 5 * H }), E("b", { top: true, on: false, why: "دیر تحویل داد" }), E("c"), E("d", { off_at: T0 - H }), E("e"), E("f")];
if (DB) {
  await ensureSchema(env);
  DB.raw.exec("DELETE FROM experts");
  DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,created_at) VALUES (1,'هوشمند','آقای هوشمند','7001',1,1,?)").run(T0);
  DB.raw.prepare("INSERT INTO ai_agents (expert_id,mode,on_at,updated_at) VALUES (1,'on',?,?)").run(T0 - 20 * H, T0);
  DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES ('R-W','1405/07/26','پروژهٔ موج')").run();
  /* پنجره: ۱۰ ساعت پیش ← ۱۰ ساعتِ دیگر؛ ۵۰٪ گذشته ← گامِ ۲ با waveAt ۲۰ */
  DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,deadline_at,created_at) VALUES (1,'R-W',1,3,?,?,?)").run(T0 - 10 * H, T0 + 10 * H, T0 - 10 * H);
  DB.raw.prepare(`INSERT INTO items (id,request_id,item_key,line_no,title,qty,unit,state,assignment_id,ai_start_at,pick_json,wave_due) VALUES (61,'R-W','a',1,'لولهٔ موج',4,'شاخه','open',1,?,?,?)`)
    .run(T0 - 5 * H, JSON.stringify({ v: 1, list: LIST() }), T0 - 1000);
  DB.raw.prepare("INSERT INTO ai_runs (id,assignment_id,expert_id,request_id,state,data_json,next_at,created_at,updated_at) VALUES (9,1,1,'R-W','work','{}',?,?,?)").run(T0 + 99 * H, T0 - 5 * H, T0);
  DB.raw.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('sizeRules',?,?)").run(JSON.stringify({ th: [50e6, 200e6, 5e9], minQ: { s: 3, m: 5, l: 5, b: 7 }, waveAt: 20 }), T0);
}
const pick = () => JSON.parse(DB.raw.prepare("SELECT pick_json FROM items WHERE id=61").get().pick_json);
const due = () => DB.raw.prepare("SELECT wave_due FROM items WHERE id=61").get().wave_due;

test("گامِ موج: هر waveAt٪ از پنجرهٔ مهلت؛ بعد از مهلت null", () => {
  assert.equal(waveStep(0, 0, 100, 20), 0);
  assert.equal(waveStep(19, 0, 100, 20), 0);
  assert.equal(waveStep(20, 0, 100, 20), 1);
  assert.equal(waveStep(65, 0, 100, 20), 3);
  assert.equal(waveStep(100, 0, 100, 20), null);
  assert.equal(waveNextDue(1, 0, 100, 20), 40);
  assert.equal(waveNextDue(4, 0, 100, 20), 0, "گامِ بعد بعد از مهلت است");
});

test("نفراتِ موج: به ترتیبِ فهرست، فقط بی‌تیکِ پیش‌فرض و سپرده‌نشده؛ برداشتنِ صریح نه؛ به شمارِ کمبود", () => {
  const p = { list: LIST() };
  assert.deepEqual(waveTargets(p, 2).map((e) => e.k), ["c", "e"]);
  assert.deepEqual(waveTargets(p, 9).map((e) => e.k), ["c", "e", "f"]);
  assert.deepEqual(waveTargets(p, 0), []);
  /* کارشناس تیکی را برمی‌دارد ← off_at و دیگر در موج نیست */
  const q = { list: [E("x", { on: true }), E("y")] };
  applyEdits(q, { on: { x: false } }, { mode: "direct", by: "expert:1", at: 123 });
  assert.equal(q.list[0].off_at, 123);
  assert.deepEqual(waveTargets(q, 5).map((e) => e.k), ["y"]);
  applyEdits(q, { on: { x: true } }, { mode: "direct", by: "expert:1", at: 124 });
  assert.equal(q.list[0].off_at, null, "تیکِ دوباره ← برداشتنِ صریح پاک می‌شود");
});

test("شمارِ پیش‌تیک = حداقلِ استعلامِ ردهٔ قلم (از برآوردِ کل)", { skip: SKIP }, async () => {
  assert.equal(await preTickN(env, { it: { qty: 4 }, m: {} }), 3, "بی برآورد ← جزئی");
  assert.equal(await preTickN(env, { it: { qty: 10, est_unit_rial: 1e8 }, m: {} }), 5, "۱ میلیارد ریال = ۱۰۰ میلیون تومان ← متوسط");
  assert.equal(await preTickN(env, { it: { qty: 10, est_unit_rial: 6e9 }, m: {} }), 7, "۶ میلیارد تومان ← عمده");
});

test("موجِ دوم: کمبود ← نفراتِ بعدی دعوت؛ یک بار برای هر گام؛ رخداد و گزارش؛ خاموش و مهلتِ گذشته", { skip: SKIP }, async () => {
  const r = await aiWaves(env, T0);
  assert.deepEqual(r, { waves: 1 });
  const p = pick();
  assert.deepEqual(p.list.filter((e) => e.wave === 2).map((e) => e.k), ["c", "e", "f"], "حداقل ۳ و هیچ پیشنهادِ معتبر ← سه نفر (نه b و d)");
  assert.ok(p.list.filter((e) => e.wave).every((e) => e.on && e.go === T0), "تیک و سپرده — همان مسیرِ «دعوت از انتخاب‌های تازه»");
  assert.equal(p.list.find((e) => e.k === "b").on, false);
  assert.equal(p.list.find((e) => e.k === "d").on, false);
  assert.deepEqual([p.wave.step, p.wave.n, p.wave.need, p.wave.have], [2, 3, 3, 0]);
  assert.equal(due(), T0 - 10 * H + 3 * 4 * H, "گامِ بعد: ۶۰٪ مهلت");
  const ev = DB.raw.prepare("SELECT actor, payload_json FROM events WHERE kind='ai_wave'").get();
  assert.equal(ev.actor, "expert:1");
  assert.deepEqual(JSON.parse(ev.payload_json).names.length, 3);
  assert.match(DB.raw.prepare("SELECT body FROM ai_log WHERE run_id=9 ORDER BY id DESC").get().body, /موجِ ۳ دعوت \(۴۰٪ مهلت\)/);
  assert.equal(DB.raw.prepare("SELECT next_at FROM ai_runs WHERE id=9").get().next_at, T0, "کار همین حالا دعوت‌ها را می‌فرستد");
  /* هنوز سررسید نشده ← هیچ */
  assert.deepEqual(await aiWaves(env, T0 + 1000), { waves: 0 });
  /* همان گام دوباره ← هیچ (ایدمپوتنت) */
  DB.raw.prepare("UPDATE items SET wave_due=? WHERE id=61").run(T0);
  assert.deepEqual(await aiWaves(env, T0 + 1000), { waves: 0 });
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM events WHERE kind='ai_wave'").get().n, 1);
  /* کارشناس هوشمندِ خاموش ← بعداً */
  DB.raw.prepare("UPDATE ai_agents SET mode='off'").run();
  DB.raw.prepare("UPDATE items SET wave_due=? WHERE id=61").run(T0);
  await aiWaves(env, T0 + 3 * H);
  assert.equal(due(), T0 + 3 * H + 15 * 60000);
  /* مهلت گذشت ← پایانِ موج‌ها */
  DB.raw.prepare("UPDATE ai_agents SET mode='on'").run();
  DB.raw.prepare("UPDATE items SET wave_due=? WHERE id=61").run(T0);
  await aiWaves(env, T0 + 11 * H);
  assert.equal(due(), 0);
});
