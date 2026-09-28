/* ============================================================
   تعلیق / توقف / خاتمه / بازگشتِ مدیر — پیام تلگرام کارشناس (POST /items/state)

   تا مهر ۱۴۰۵ این مسیر فقط وضعیت اقلام را عوض می‌کرد و در رویداد notify: "telegram"
   می‌نوشت، بی‌آنکه پیامی برود. حالا کارشناسِ ارجاعِ ارسال‌شده، اگر تلگرامش وصل است،
   همان پیام را در صف می‌گیرد؛ و notify/notified رویداد همان چیزی است که واقعاً رفت.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import { stateText } from "../../../worker/assign.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
/* بدون TG_BOT_TOKEN: flush کاری نمی‌کند و شبکه‌ای در کار نیست؛ صف را مستقیم می‌خوانیم */
const env = { DB, MANAGER_CODE: "4321" };
if (DB) {
  await ensureSchema(env);
  const t = Date.now();
  DB.raw.exec("DELETE FROM experts");
  DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,telegram_chat,created_at) VALUES (1,'کارشناس وصل','وصل','1111',1,1,'700',?), (2,'کارشناس بی‌تلگرام','بی‌تلگرام','2222',1,1,NULL,?)").run(t, t);
  DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES ('R-1','1405/07/01','پروژهٔ <یک>'), ('R-2','1405/07/01','پروژهٔ دو'), ('R-3','1405/07/01','پروژهٔ سه')").run();
  /* ۱: ارسال‌شده، تلگرام وصل · ۲: ارسال‌شده، بی‌تلگرام · ۳: هنوز ارسال‌نشده */
  DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,created_at) VALUES (1,'R-1',1,3,?,?), (2,'R-2',2,3,?,?), (3,'R-3',1,3,NULL,?)").run(t, t, t, t, t);
  const it = DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,title,qty,unit,state,assignment_id) VALUES (?,?,?,?,?,1,'عدد','open',?)");
  it.run(11, "R-1", "k1", 1, "قلم یک", 1); it.run(12, "R-1", "k2", 2, "قلم دو", 1);
  it.run(21, "R-2", "k1", 1, "قلم یک", 2);
  it.run(31, "R-3", "k1", 1, "قلم یک", 3);
}

const setState = async (body, code = "4321") => {
  const res = await route(new Request("https://x/tamin-poshtibani/api/items/state", {
    method: "POST", headers: { "Content-Type": "application/json", "X-Manager-Code": code }, body: JSON.stringify(body),
  }), env, { waitUntil() {} });
  return { status: res.status, data: await res.json() };
};
const outbox = () => DB.raw.prepare("SELECT idem, target, payload_json FROM outbox ORDER BY id").all();
const lastText = () => JSON.parse(outbox().at(-1).payload_json).text;
const lastEvent = () => { const e = DB.raw.prepare("SELECT kind, request_id, payload_json FROM events ORDER BY id DESC LIMIT 1").get(); return { kind: e.kind, request_id: e.request_id, ...JSON.parse(e.payload_json) }; };
const states = (aid) => DB.raw.prepare("SELECT state FROM items WHERE assignment_id=? ORDER BY id").all(aid).map((r) => r.state);

test("تعلیقِ ارجاعِ ارسال‌شده: یک پیام به تلگرام کارشناس، و رویداد همان را می‌گوید", { skip: SKIP }, async () => {
  const r = await setState({ assignment_id: 1, request_id: "R-1", state: "hold" });
  assert.equal(r.status, 200);
  assert.deepEqual([r.data.changed, r.data.notified], [2, 1]);
  assert.deepEqual(states(1), ["hold", "hold"]);
  const q = outbox();
  assert.equal(q.length, 1);
  assert.equal(q[0].target, "700");
  assert.match(q[0].idem, /^state:1:hold:\d+$/);
  const text = lastText();
  assert.match(text, /تعلیق/);
  assert.match(text, /R-1/);
  assert.match(text, /۲ قلم/);
  assert.match(text, /&lt;یک&gt;/, "نام طرف مقابل در متن HTML تلگرام escape می‌شود");
  assert.deepEqual(lastEvent(), { kind: "hold", request_id: "R-1", assignment_id: 1, item_ids: null, notify: "telegram", notified: 1 });
});

test("همان وضعیتِ دوباره: قلمی عوض نمی‌شود، پیامی نمی‌رود و رویداد none است", { skip: SKIP }, async () => {
  const before = outbox().length;
  const r = await setState({ assignment_id: 1, request_id: "R-1", state: "hold" });
  assert.equal(r.data.notified, 0);
  assert.equal(outbox().length, before);
  assert.deepEqual([lastEvent().notify, lastEvent().notified], ["none", 0]);
});

test("بازگشت به جریان و توقفِ کل درخواست هم پیام می‌فرستند", { skip: SKIP }, async () => {
  let r = await setState({ assignment_id: 1, request_id: "R-1", state: "open" });
  assert.equal(r.data.notified, 1);
  assert.deepEqual(states(1), ["open", "open"]);
  assert.match(lastText(), /بازگشت به جریان/);
  r = await setState({ request_id: "R-1", state: "stop" });
  assert.equal(r.data.notified, 1);
  assert.match(lastText(), /توقف/);
  assert.equal(lastEvent().request_id, "R-1");
});

test("کارشناسِ بی‌تلگرام و ارجاعِ ارسال‌نشده پیامی نمی‌گیرند، ولی وضعیت عوض می‌شود", { skip: SKIP }, async () => {
  const before = outbox().length;
  let r = await setState({ assignment_id: 2, request_id: "R-2", state: "hold" });
  assert.deepEqual([r.data.changed, r.data.notified], [1, 0]);
  r = await setState({ assignment_id: 3, request_id: "R-3", state: "closed" });
  assert.deepEqual([r.data.changed, r.data.notified], [1, 0]);
  assert.deepEqual([states(2), states(3)], [["hold"], ["closed"]]);
  assert.equal(outbox().length, before);
  assert.deepEqual([lastEvent().notify, lastEvent().notified], ["none", 0]);
});

test("بی‌کد مدیر ۴۰۱ است و چیزی عوض نمی‌شود", { skip: SKIP }, async () => {
  const r = await setState({ assignment_id: 2, request_id: "R-2", state: "open" }, "0000");
  assert.equal(r.status, 401);
  assert.deepEqual(states(2), ["hold"]);
});

test("متن پیام برای هر چهار وضعیت", () => {
  for (const [st, word] of [["hold", "تعلیق"], ["stop", "توقف"], ["closed", "خاتمه"], ["open", "بازگشت به جریان"]]) {
    const s = stateText(st, { request_id: "R-9", party: "پروژه" }, 3);
    assert.match(s, new RegExp(word));
    assert.match(s, /R-9/);
    assert.match(s, /۳ قلم از این درخواست را مدیر/);
  }
});
