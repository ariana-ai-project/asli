/* ============================================================
   ارجاع درخواست خرید به مناقصه (مهر ۱۴۰۵): مدیر از میز ارجاع یا پشتیبان از تب «درخواست‌ها»
   • فقط اقلامِ باز و هنوز ارسال‌نشده؛ قلمِ ارسال‌شده به کارشناس نمی‌رود
   • هر قلم یک ردیفِ پیش‌نویسِ مناقصه (گروه) با منبع (درخواست و قلم)؛ اقلام «در مناقصه» — بیرون از میز و کارتابل
   • ارجاعِ ارسال‌نشدهٔ بی‌قلم پاک می‌شود
   • شروع بی قیمت شروع نه؛ بعد از نوشتن قیمت بله
   • بازگشت به میز: اقلام دوباره باز، پیش‌نویس لغو؛ در جریان نه
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست";
const env = { DB, MANAGER_CODE: "4321", COMPANY: "تونل سد آریانا", SITE_ORIGIN: "https://arianaai.website" };
const run = (sql, ...a) => DB.raw.prepare(sql).run(...a);
const one = (sql, ...a) => DB.raw.prepare(sql).get(...a);
const all = (sql, ...a) => DB.raw.prepare(sql).all(...a);
const call = async (method, path, body, headers) => {
  const res = await route(new Request("https://x/tamin-poshtibani/api" + path, { method, headers: { "Content-Type": "application/json", ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined }), env, { waitUntil() {} });
  return { status: res.status, data: await res.json() };
};
const MG = { "X-Manager-Code": "4321" };
let SUP = null;
if (DB) {
  await ensureSchema(env);
  SUP = { "X-Support-Token": (await call("POST", "/support/setup", { pass: "9753" })).data.token };
  const t = Date.now();
  run("DELETE FROM experts");
  run("INSERT INTO experts (id,name,label,code,active,speed,created_at) VALUES (1,'کارشناس یک','یک','1111',1,1,?), (2,'کارشناس دو','دو','2222',1,1,?)", t, t);
  run("INSERT INTO requests (id,date,party) VALUES ('R-1','1405/07/20','پروژهٔ سد'), ('R-2','1405/07/20','پروژهٔ تونل')");
  /* R-1: قلم ۱ در ارجاعِ ارسال‌نشده، قلم ۲ بی‌کارشناس، قلم ۳ ارسال‌شده به کارشناس */
  run("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,created_at) VALUES (11,'R-1',1,3,NULL,?), (12,'R-1',2,3,?,?)", t, t, t);
  const it = DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,code,title,spec,qty,unit,state,assignment_id) VALUES (?,?,?,?,?,?,?,?,?,'open',?)");
  it.run(101, "R-1", "k1", 1, "1010100001", "سیمان فله M400", "تیپ ۲", 20, "تن", 11);
  it.run(102, "R-1", "k2", 2, "1010200017", "تیرآهن 16", null, 30, "شاخه", null);
  it.run(103, "R-1", "k3", 3, "3060200095", "پیچ خودکار", null, 500, "عدد", 12);
  it.run(201, "R-2", "k1", 1, "2020", "میلگرد 18", null, 10, "تن", null);
}

test("ارجاع به مناقصه فقط با کد مدیر یا ورود پشتیبان", { skip: SKIP }, async () => {
  assert.equal((await call("POST", "/tender-refer", { request_id: "R-1" })).status, 401);
  assert.equal((await call("POST", "/support/tender-refer", { request_id: "R-1" })).status, 401);
});

test("مدیر: اقلامِ باز و ارسال‌نشده ← پیش‌نویسِ گروهی با منبع؛ اقلام «در مناقصه»؛ ارجاعِ خالی پاک، ارسال‌شده دست‌نخورده", { skip: SKIP }, async () => {
  const r = await call("POST", "/tender-refer", { request_id: "R-1" }, MG);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.lots, 2);
  const T = all("SELECT * FROM tenders WHERE src_request='R-1' ORDER BY lot_no");
  assert.equal(T.length, 2);
  assert.ok(T[0].grp && T[0].grp === T[1].grp, "یک گروه");
  assert.deepEqual(T.map((x) => [x.title, x.qty, x.unit, x.item_code, x.state, x.start_price, x.src_by]),
    [["سیمان فله M400", 20, "تن", "1010100001", "draft", 0, "manager"], ["تیرآهن 16", 30, "شاخه", "1010200017", "draft", 0, "manager"]]);
  assert.deepEqual(T.map((x) => x.src_item), [101, 102]);
  assert.match(T[0].spec, /تیپ ۲/);
  assert.deepEqual(all("SELECT id, state, assignment_id FROM items WHERE request_id='R-1' ORDER BY id").map((x) => [x.id, x.state, x.assignment_id]),
    [[101, "tender", null], [102, "tender", null], [103, "open", 12]]);
  assert.equal(one("SELECT COUNT(*) AS n FROM assignments WHERE id=11").n, 0, "ارجاعِ ارسال‌نشدهٔ بی‌قلم پاک شد");
  assert.equal(one("SELECT COUNT(*) AS n FROM events WHERE kind='tender_refer' AND request_id='R-1'").n, 1);
  /* دوباره: چیزی برای ارجاع نمانده (قلم ۳ ارسال‌شده است) */
  const again = await call("POST", "/tender-refer", { request_id: "R-1" }, MG);
  assert.equal(again.status, 400);
  /* پنل پشتیبانی: پیش‌نویس با منبع در فهرست و جزئیات */
  const L = await call("GET", "/support/tenders", null, SUP);
  const x = L.data.tenders.find((y) => y.id === T[0].id);
  assert.deepEqual([x.state, x.src_request, x.src_by], ["draft", "R-1", "manager"]);
  /* میز: درخواست هنوز هست (قلم ۳ باز است) ولی اقلامِ مناقصه باز حساب نمی‌شوند؛ کارتابل کارشناس فقط قلم ۳ */
  const D = await call("GET", "/desk?limit=50", null, MG);
  const req = D.data.requests.find((y) => y.id === "R-1");
  assert.ok(req);
  assert.deepEqual(req.items.filter((i) => i.state === "tender").map((i) => i.id), [101, 102]);
});

test("شروع بی قیمت شروع نه؛ با قیمت (از قواعد) بله", { skip: SKIP }, async () => {
  const T = all("SELECT id FROM tenders WHERE src_request='R-1' ORDER BY lot_no");
  run("INSERT INTO tender_invites (tender_id,alias,name,phone,on_list) VALUES (?,1,'فولاد البرز','09121111111',1), (?,1,'فولاد البرز','09121111111',1)", T[0].id, T[1].id);
  const s1 = await call("POST", `/support/tenders/${T[0].id}/schedule`, { start_in_min: 30, duration_min: 30 }, SUP);
  assert.equal(s1.status, 400);
  assert.match(s1.data.error, /قیمت شروع/);
  assert.equal((await call("PUT", `/support/tenders/${T[0].id}`, { start_price: "12000000" }, SUP)).status, 200);
  const s2 = await call("POST", `/support/tenders/${T[0].id}/schedule`, { start_in_min: 30, duration_min: 30 }, SUP);
  assert.equal(s2.status, 400, "قلم دوم هنوز قیمت ندارد");
  assert.match(s2.data.error, /تیرآهن/);
  assert.equal((await call("PUT", `/support/tenders/${T[1].id}`, { start_price: "9000000" }, SUP)).status, 200);
  const s3 = await call("POST", `/support/tenders/${T[0].id}/schedule`, { start_in_min: 30, duration_min: 30 }, SUP);
  assert.equal(s3.status, 200, JSON.stringify(s3.data));
  assert.equal(s3.data.tender.state, "scheduled");
});

test("بازگشت به میز: پیش از شروع ← اقلام باز، مناقصه‌ها لغو؛ در جریان نه", { skip: SKIP }, async () => {
  const T = all("SELECT id FROM tenders WHERE src_request='R-1' ORDER BY lot_no");
  /* در جریان: نه */
  run("UPDATE tenders SET start_at=? WHERE id IN (?,?)", Date.now() - 1000, T[0].id, T[1].id);
  const busy = await call("POST", "/tender-unrefer", { request_id: "R-1" }, MG);
  assert.equal(busy.status, 400);
  assert.match(busy.data.error, /در جریان/);
  run("UPDATE tenders SET start_at=? WHERE id IN (?,?)", Date.now() + 30 * 60e3, T[0].id, T[1].id);
  const back = await call("POST", `/support/tenders/${T[0].id}/unrefer`, {}, SUP);
  assert.equal(back.status, 200, JSON.stringify(back.data));
  assert.deepEqual([back.data.items, back.data.cancelled, back.data.request_id], [2, 2, "R-1"]);
  assert.deepEqual(all("SELECT state FROM items WHERE id IN (101,102) ORDER BY id").map((x) => x.state), ["open", "open"]);
  assert.deepEqual(all("SELECT state, cancel_reason FROM tenders WHERE src_request='R-1'").map((x) => [x.state, x.cancel_reason]),
    [["cancelled", "بازگشت به میز ارجاع"], ["cancelled", "بازگشت به میز ارجاع"]]);
  /* دوباره به کارشناس ارجاع می‌شود (همان مسیر عادی) */
  assert.equal((await call("POST", "/assign", { request_id: "R-1", expert_id: 1, item_ids: [101, 102] }, MG)).status, 200);
  assert.equal(one("SELECT COUNT(*) AS n FROM items WHERE id IN (101,102) AND assignment_id IS NOT NULL").n, 2);
});

test("پشتیبان: ارجاعِ یک قلمِ مشخص از تب درخواست‌ها؛ اعلانِ پشتیبان فقط وقتی مدیر می‌فرستد", { skip: SKIP }, async () => {
  const r = await call("POST", "/support/tender-refer", { request_id: "R-2", item_ids: [201] }, SUP);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const t = one("SELECT * FROM tenders WHERE src_request='R-2'");
  assert.deepEqual([t.title, t.grp, t.src_by, t.src_item], ["میلگرد 18", null, "support", 201]);
  assert.equal(one("SELECT state FROM items WHERE id=201").state, "tender");
  /* قلمی که به این درخواست تعلق ندارد نادیده گرفته می‌شود */
  assert.equal((await call("POST", "/support/tender-refer", { request_id: "R-2", item_ids: [101] }, SUP)).status, 400);
});
