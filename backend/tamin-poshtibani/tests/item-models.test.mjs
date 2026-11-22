import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import { newSession } from "../../../worker/sp-core.js";
import { migrateItemModelScope, migrateSpLineModels } from "../../../worker/item-models.js";
import { commissionData } from "../../../worker/sheets.js";
import { handleSpUpdate } from "../../../worker/sp-bot.js";
import { lineCard } from "../../../worker/sp-push.js";
import { commissionRecordStmts } from "../../../worker/records.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست";
const env = { DB, MANAGER_CODE: "1234", SITE_ORIGIN: "https://site.test", TG_SP_BOT_TOKEN: "model-test" };
globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, result: { message_id: 91 } }), { status: 200, headers: { "Content-Type": "application/json" } });
const EX = { "X-Expert-Code": "7002" };
const pending = [];
const ctx = { waitUntil: (p) => pending.push(p) };
const norm = JSON.stringify({ v: 2, head: "پمپ", layers: { برند: { t: "Calpeda" }, توان: { t: "۲", u: "کیلووات" }, کشور: { t: "ایتالیا" } }, locks: { layers: { توان: true, برند: false, کشور: false } }, source: "catalog" });

async function call(path, { method, body, headers } = {}) {
  const h = { ...(headers || {}) };
  const b = body === undefined ? undefined : JSON.stringify(body);
  if (b !== undefined) h["Content-Type"] = "application/json";
  const res = await route(new Request(`https://site.test/tamin-poshtibani/api${path}`, { method: method || (b === undefined ? "GET" : "POST"), headers: h, body: b }), env, ctx);
  while (pending.length) await Promise.all(pending.splice(0));
  const data = await res.json();
  return { status: res.status, data };
}

if (DB) {
  await ensureSchema(env);
  const t = Date.now();
  DB.raw.exec("DELETE FROM experts");
  DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,created_at) VALUES (2,'کارشناس','کارشناس','7002',1,1,?)").run(t);
  DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES ('R-MODEL','1405/08/01','پروژه')").run();
  DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,created_at) VALUES (1,'R-MODEL',2,5,?,?)").run(t, t);
  DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,title,qty,unit,state,assignment_id,norm_json) VALUES (1,'R-MODEL','p',1,'پمپ صنعتی',2,'دستگاه','open',1,?)").run(norm);
  DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES ('R-OTHER','1405/08/02','پروژهٔ دیگر')").run();
  DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,created_at) VALUES (2,'R-OTHER',2,5,?,?)").run(t, t);
  DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,title,qty,unit,state,assignment_id,norm_json) VALUES (2,'R-OTHER','p',1,'پمپ صنعتی',2,'دستگاه','open',2,?)").run(norm);
}

const modelBody = (brand = "Calpeda", country = "ایتالیا") => ({ head: "پمپ", layers: [{ k: "برند", v: brand }, { k: "توان", v: "۲", u: "کیلووات" }, { k: "کشور", v: country }], locks: { title: true, qty: true, layers: { برند: false, توان: true, کشور: false } } });

test("چند مدل از یک قلم در یک بسته، قیمت و شرایط مستقل، عدم تأمین و مدل تأمین‌کننده", { skip: SKIP }, async () => {
  const m1 = await call("/items/1/models", { headers: EX, body: modelBody() });
  assert.equal(m1.status, 200, JSON.stringify(m1.data));
  assert.equal(m1.data.model_no, 1);
  assert.equal((await call("/items/1/models", { headers: EX, body: modelBody() })).status, 409, "مدل تکراری ساخته نمی‌شود");
  const m2 = await call("/items/1/models", { headers: EX, body: modelBody("Lowara") });
  assert.equal(m2.data.model_no, 2);
  assert.equal((await call("/assignments/1", { headers: EX })).data.models.length, 2);
  assert.deepEqual([m1.data.request_id, m2.data.request_id], ["R-MODEL", "R-MODEL"]);
  const otherBefore = DB.raw.prepare("SELECT norm_json FROM items WHERE id=2").get().norm_json;
  assert.equal((await call("/assignments/2", { headers: EX })).data.models.length, 0, "مدل به درخواستِ هم‌کد و هم‌نام نشت نمی‌کند");
  const otherModel = await call("/items/2/models", { headers: EX, body: modelBody() });
  assert.equal(otherModel.status, 200, JSON.stringify(otherModel.data));
  assert.equal(otherModel.data.request_id, "R-OTHER");
  assert.equal((await call("/assignments/1", { headers: EX })).data.models.length, 2);
  assert.equal((await call("/assignments/2", { headers: EX })).data.models.length, 1);
  assert.equal(DB.raw.prepare("SELECT norm_json FROM items WHERE id=2").get().norm_json, otherBefore, "ساخت مدل، قلم درخواست دیگر را تغییر نمی‌دهد");
  DB.raw.prepare("UPDATE item_models SET request_id=NULL WHERE id=?").run(otherModel.data.id);
  assert.equal((await call("/assignments/2", { headers: EX })).data.models.length, 0, "مدلِ بی‌درخواست در هیچ صفحه‌ای نمایش داده نمی‌شود");
  await migrateItemModelScope(env);
  assert.equal((await call("/assignments/2", { headers: EX })).data.models.length, 1, "مهاجرت، درخواستِ مدل‌های قبلی را از خودِ قلم برمی‌گرداند");

  const sent = await call("/sp/x/send", { headers: EX, body: { assignment_id: 1, item_ids: [1], supplier_name: "تأمین نمونه", phone: "09120000601", label: "فروش" } });
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  assert.equal(sent.data.lines.length, 2);
  assert.match(sent.data.msgs[0].body, /برای هر مدل جداگانه «دارم\/ندارم»/, "چندمدلی‌بودن بسته در اعلان واضح است");
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM sp_lines WHERE thread_id=?").get(sent.data.thread_id).n, 2);
  await call("/sp/x/send", { headers: EX, body: { assignment_id: 1, item_ids: [1], supplier_name: "تأمین نمونه", phone: "09120000601", label: "فروش" } });
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM sp_lines WHERE thread_id=?").get(sent.data.thread_id).n, 2, "یادآوری مدل تکراری نمی‌سازد");
  assert.equal((await call(`/items/1/models/${m1.data.id}`, { method: "PUT", headers: EX, body: modelBody("Grundfos") })).status, 409, "مدل ارسال‌شده قفل است");

  const phone = DB.raw.prepare("SELECT id FROM sp_phones WHERE phone='09120000601'").get();
  const H = { "X-SP-Session": await newSession(env, phone.id, "web") };
  DB.raw.prepare("INSERT INTO sp_tg (chat,role,phone_id,focus,updated_at) VALUES ('7601','s',?,?,?)").run(phone.id, sent.data.thread_id, Date.now());
  let cq = 0;
  const bot = (data) => handleSpUpdate(env, { callback_query: { id: `model-${++cq}`, data, message: { message_id: 91, chat: { id: 7601 } } } });
  const full = await call(`/sp/thread/${sent.data.thread_id}`, { headers: H });
  const line1 = full.data.lines.find((l) => l.model_id === m1.data.id), line2 = full.data.lines.find((l) => l.model_id === m2.data.id);
  assert.equal((await call(`/sp/line/${line1.id}/model`, { headers: H, body: { layers: { توان: "۳" } } })).status, 422, "لایهٔ قفل تغییر نمی‌کند");
  const firstCard = lineCard(DB.raw.prepare("SELECT * FROM sp_lines WHERE id=?").get(line1.id), [], 1, {});
  assert.match(firstCard.text, /مدل ۱/);
  assert.ok(firstCard.kb.flat().some((b) => b.callback_data === `sm:${line1.id}`), "ساخت مدل در بات");
  assert.ok(firstCard.kb.flat().some((b) => b.callback_data === `av:${line1.id}:0`), "ندارم در بات");
  assert.equal((await call(`/sp/line/${line1.id}`, { method: "PUT", headers: H, body: { layers: { کشور: "چین" } } })).status, 200);
  await bot(`sm:${line1.id}`);
  const line3 = DB.raw.prepare("SELECT * FROM sp_lines WHERE thread_id=? AND model_no=3").get(sent.data.thread_id);
  assert.ok(line3, "مدل تأمین‌کننده از لایهٔ باز و دکمهٔ بات ساخته شد");
  assert.equal((await call(`/sp/line/${line1.id}/model`, { headers: H, body: { layers: { کشور: "چین" } } })).status, 409);

  let r = await call(`/sp/line/${line1.id}`, { method: "PUT", headers: H, body: { price: 1000, terms: { dtime: "10", invoice: "رسمی", vat: "دارد", valid_days: 7 } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  await bot(`tv:${line1.id}:p:0`);
  assert.equal(JSON.parse(DB.raw.prepare("SELECT terms_json FROM sp_lines WHERE id=?").get(line1.id).terms_json).pay, "نقدی", "شرایط بات فقط روی همان مدل ذخیره شد");
  assert.equal(r.data.line.terms.dtime, "10");
  assert.equal((await call(`/sp/line/${line1.id}/ready`, { headers: H, body: { on: true } })).status, 200);
  await bot(`av:${line2.id}:0`);
  const unavailable = DB.raw.prepare("SELECT * FROM sp_lines WHERE id=?").get(line2.id);
  assert.deepEqual([unavailable.state, unavailable.unavailable], ["ready", 1]);
  const noCard = lineCard(unavailable, [], 1, {});
  assert.match(noCard.text, /تأمین نمی‌کنم/);
  assert.ok(noCard.kb.flat().some((b) => b.callback_data === `av:${line2.id}:1`), "بازگشت به دارم در بات");
  r = await call(`/sp/line/${line3.id}`, { method: "PUT", headers: H, body: { price: 2000, terms: { dtime: "25", pay: "اعتباری", invoice: "رسمی", vat: "دارد", valid_days: 10 } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await call(`/sp/line/${line3.id}/ready`, { headers: H, body: { on: true } })).status, 200);

  const sub = await call(`/sp/thread/${sent.data.thread_id}/submit`, { headers: H, body: {} });
  assert.equal(sub.status, 200, JSON.stringify(sub.data));
  const bundle = DB.raw.prepare("SELECT * FROM sp_bundles WHERE id=?").get(sub.data.bundle_id);
  const snapshots = JSON.parse(bundle.line_terms_json);
  assert.equal(snapshots[line1.id].dtime, "10");
  assert.equal(snapshots[line3.id].dtime, "25");
  assert.ok(bundle.terms_json, "عکس شرایط بسته نیز ذخیره شده است");
  const fin = await call(`/sp/x/bundle/${sub.data.bundle_id}/decide`, { headers: EX, body: { action: "final" } });
  assert.equal(fin.status, 200, JSON.stringify(fin.data));
  const q1 = DB.raw.prepare("SELECT * FROM quotes WHERE model_id=?").get(m1.data.id), q2 = DB.raw.prepare("SELECT * FROM quotes WHERE model_id=?").get(m2.data.id), q3 = DB.raw.prepare("SELECT * FROM quotes WHERE model_id=?").get(line3.model_id);
  assert.deepEqual([q1.price, q1.dtime, q1.pay, q1.saved], [1000, "10", "نقدی", 1]);
  assert.deepEqual([q3.price, q3.dtime, q3.pay, q3.saved], [2000, "25", "اعتباری", 1]);
  assert.match(q3.spec, /کشور: چین/, "لایهٔ تغییرکردهٔ مدل تأمین‌کننده به استعلام می‌رسد");
  assert.doesNotMatch(q3.spec, /کشور: ایتالیا/);
  assert.deepEqual([q2.unavailable, q2.price, q2.saved], [1, null, 0]);
  assert.equal(fin.data.quote_ids.length, 3);
  const detail = await call("/assignments/1", { headers: EX });
  assert.equal(detail.data.models.length, 3, "مدل ارسال‌شدهٔ تأمین‌کننده برای کارشناس دیده می‌شود");
  const table = commissionData({ items: detail.data.items, quotes: detail.data.quotes, manual: false });
  assert.equal(table.items.length, 2, "فقط مدل‌های دارای پیشنهاد وارد جدول می‌شوند");
  assert.ok(table.groups[0].rows[`1:${m1.data.id}`] && table.groups[0].rows[`1:${line3.model_id}`], "هر مدل جای مستقل در جدول دارد");
  assert.deepEqual(table.items.map((i) => i.model_no), [1, 3]);

  for (const modelId of [m1.data.id, m2.data.id]) {
    const made = await call("/quotes", { headers: EX, body: { assignment_id: 1, item_id: 1, model_id: modelId, supplier_name: "رقیب", origin: "manual", spec: `مدل ${modelId}`, unit: "دستگاه", qty: 2, price: 3000, dtime: "15", valid_days: 20, invoice: "رسمی", pay: "نقدی", vat: "دارد" } });
    assert.equal((await call(`/quotes/${made.data.id}`, { method: "PUT", headers: EX, body: { save: true } })).status, 200);
  }
  const withRival = await call("/assignments/1", { headers: EX });
  const manualTable = commissionData({ items: withRival.data.items, quotes: withRival.data.quotes, manual: true });
  const rival = manualTable.groups.find((g) => g.name === "رقیب");
  assert.ok(rival.rows[`1:${m2.data.id}`], "تأییدنهاییِ مدلهای دیگر رقیبِ مدل ۲ را حذف نمی‌کند");
  assert.equal(rival.rows[`1:${m1.data.id}`], undefined, "قاعدهٔ قبلی درون همان مدل حفظ شد");
  const record = await commissionRecordStmts(env, 1, { no: 2, expertId: 2, channel: "test", manual: true });
  await env.DB.batch(record);
  const snapshot = JSON.parse(DB.raw.prepare("SELECT lines_json FROM commission_tables ORDER BY id DESC LIMIT 1").get().lines_json);
  assert.equal(snapshot.length, 3);
  assert.equal(snapshot.filter((x) => x.supplier_name === "رقیب").length, 1);
  assert.equal(snapshot.find((x) => x.supplier_name === "رقیب").model_id, m2.data.id);

  const disposable = await call("/items/1/models", { headers: EX, body: modelBody("Disposable") });
  assert.equal(disposable.data.model_no, 4);
  const removed = await call(`/items/1/models/${disposable.data.id}`, { method: "DELETE", headers: EX });
  assert.equal(removed.data.deleted, true);
  assert.equal(DB.raw.prepare("SELECT * FROM item_models WHERE id=?").get(disposable.data.id), undefined, "مدل پیش‌نویس حذف واقعی می‌شود");
  const archived = await call(`/items/1/models/${m2.data.id}`, { method: "DELETE", headers: EX });
  assert.equal(archived.data.archived, true);
  assert.equal(DB.raw.prepare("SELECT state FROM item_models WHERE id=?").get(m2.data.id).state, "archived");
  assert.ok(DB.raw.prepare("SELECT * FROM quotes WHERE model_id=?").get(m2.data.id), "بایگانی مدل، استعلام و سابقه را حذف نمی‌کند");
  const afterArchive = await call("/assignments/1", { headers: EX });
  assert.deepEqual(afterArchive.data.models.map((m) => m.id).sort((a, b) => a - b), [m1.data.id, line3.model_id].sort((a, b) => a - b));
  const resent = await call("/sp/x/send", { headers: EX, body: { assignment_id: 1, item_ids: [1], supplier_name: "تأمین بعد از بایگانی", phone: "09120000602", label: "فروش" } });
  assert.deepEqual(resent.data.lines.map((l) => l.model_id), [m1.data.id], "مدل بایگانی دوباره ارسال نمی‌شود");

  const deletedRequest = await call("/requests/delete", { headers: { "X-Manager-Code": "1234" }, body: { ids: ["R-OTHER"] } });
  assert.equal(deletedRequest.status, 200, JSON.stringify(deletedRequest.data));
  assert.equal(DB.raw.prepare("SELECT * FROM item_models WHERE id=?").get(otherModel.data.id), undefined, "حذف درخواست، مدل‌های همان درخواست را می‌برد");
  assert.ok(DB.raw.prepare("SELECT * FROM item_models WHERE id=?").get(m1.data.id), "مدل درخواست دیگر دست‌نخورده می‌ماند");
  const reusedAt = Date.now();
  DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES ('R-REUSED','1405/08/03','استفادهٔ مجدد از شناسه')").run();
  DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,created_at) VALUES (3,'R-REUSED',2,5,?,?)").run(reusedAt, reusedAt);
  DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,title,qty,unit,state,assignment_id,norm_json) VALUES (2,'R-REUSED','p',1,'پمپ صنعتی',2,'دستگاه','open',3,?)").run(norm);
  assert.equal((await call("/assignments/3", { headers: EX })).data.models.length, 0, "شناسهٔ استفاده‌مجددشده مدل قدیمی به ارث نمی‌برد");
});

test("مهاجرت sp_lines: شناسه و محتوای قدیمی حفظ می‌شود و یک قلم می‌تواند مدل دوم بگیرد", { skip: SKIP }, async () => {
  DB.raw.exec("ALTER TABLE sp_lines RENAME TO sp_lines_with_models");
  DB.raw.exec("CREATE TABLE sp_lines (id INTEGER PRIMARY KEY, thread_id INTEGER NOT NULL, item_id INTEGER NOT NULL, title TEXT NOT NULL, head TEXT, layers_json TEXT, extra_json TEXT, req_qty REAL, req_unit TEXT, qty REAL, unit TEXT, price REAL, note TEXT, state TEXT NOT NULL DEFAULT 'new', bundle_id INTEGER, quote_id INTEGER, no INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, locks_json TEXT, s_json TEXT, prices_json TEXT, UNIQUE(thread_id,item_id))");
  const t = Date.now();
  DB.raw.prepare("INSERT INTO sp_lines (id,thread_id,item_id,title,req_qty,req_unit,qty,unit,state,no,created_at,updated_at) VALUES (901,1,1,'قدیمی',2,'دستگاه',2,'دستگاه','new',901,?,?)").run(t, t);
  await migrateSpLineModels(env);
  const old = DB.raw.prepare("SELECT * FROM sp_lines WHERE id=901").get();
  assert.deepEqual([old.id, old.title, old.model_id, old.model_no], [901, "قدیمی", 0, 0]);
  DB.raw.prepare("INSERT INTO sp_lines (thread_id,item_id,title,state,created_at,updated_at,model_id,model_no) VALUES (1,1,'مدل دوم','new',?,?,1,1)").run(t, t);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM sp_lines WHERE thread_id=1 AND item_id=1").get().n, 2);
  DB.raw.exec("DROP TABLE sp_lines_with_models");

  DB.raw.exec("ALTER TABLE item_models RENAME TO item_models_scoped");
  DB.raw.exec("CREATE TABLE item_models (id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL, model_no INTEGER NOT NULL)");
  DB.raw.prepare("INSERT INTO item_models (id,item_id,model_no) VALUES (901,1,1)").run();
  await migrateItemModelScope(env);
  assert.equal(DB.raw.prepare("SELECT request_id FROM item_models WHERE id=901").get().request_id, "R-MODEL", "ستون درخواست روی جدول قدیمی ساخته و پر می‌شود");
  DB.raw.exec("DROP TABLE item_models");
  DB.raw.exec("ALTER TABLE item_models_scoped RENAME TO item_models");
});
