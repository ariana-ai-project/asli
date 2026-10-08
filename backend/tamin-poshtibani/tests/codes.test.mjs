/* ============================================================
   کدهای ورود چهاررقمی و کد مدیر در دیتابیس (تصمیم مالک، مهر ۱۴۰۵)

   • کد مدیر از پنل پشتیبانی عوض می‌شود (کلید managerCode)؛ تا وقتی نیست، env.MANAGER_CODE
   • فقط پشتیبانی کد کارشناسان را می‌بیند و عوض می‌کند؛ مدیر نه می‌بیند نه می‌دهد؛ کارشناسِ تازه کد خودکار می‌گیرد
   • کدها فقط چهار رقم؛ تکراری با کارشناس فعال یا کد مدیر پذیرفته نمی‌شود
   • ارتقای یک‌بارهٔ دیتابیسِ موجود: کدهای بلندتر عوض می‌شوند (رخداد + پیام تلگرام) و کد مدیر «۱۴۰۲»
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route, migrateCodes4 } from "../../../worker/api.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = { DB, MANAGER_CODE: "4321", TG_BOT_TOKEN: "tok", TG_WEBHOOK_SECRET: "raz" };
const T0 = Date.now();
if (DB) {
  await ensureSchema(env);
  DB.raw.exec("DELETE FROM experts");
  const ex = DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,telegram_chat,created_at) VALUES (?,?,?,?,1,1,?,?)");
  ex.run(1, "کارشناس یک", "یک", "1111", "700", T0);
  ex.run(2, "کارشناس دو", "دو", "2222", null, T0);
}
async function call(method, path, { body, token, expert, manager } = {}) {
  const headers = {};
  if (token) headers["X-Support-Token"] = token;
  if (expert) headers["X-Expert-Code"] = expert;
  if (manager) headers["X-Manager-Code"] = manager;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await route(new Request("https://x/tamin-poshtibani/api" + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env, { waitUntil() {} });
  const ct = res.headers.get("content-type") || "";
  return { status: res.status, data: ct.includes("json") ? await res.json() : await res.text() };
}
const row = (sql, ...a) => DB.raw.prepare(sql).get(...a);
let TOKEN = null;

test("دیتابیس تازه: کد مدیر همان env است؛ پشتیبانی کدها را می‌بیند و کد مدیر را عوض می‌کند", { skip: SKIP }, async () => {
  assert.equal((await call("POST", "/login", { body: { role: "manager", code: "4321" } })).status, 200);
  TOKEN = (await call("POST", "/support/setup", { body: { pass: "pass-1234" } })).data.token;
  assert.ok(TOKEN, "رمز پشتیبانی گذاشته شد");
  const c = await call("GET", "/support/codes", { token: TOKEN });
  assert.equal(c.status, 200);
  assert.equal(c.data.manager, "4321");
  assert.deepEqual(c.data.experts.map((e) => [e.id, e.code, e.ok]).sort((a, b) => a[0] - b[0]), [[1, "1111", true], [2, "2222", true]]);
  /* کد مدیر: فقط چهار رقم، نه کد یک کارشناس */
  assert.equal((await call("PUT", "/support/codes", { token: TOKEN, body: { manager: "12345" } })).status, 400);
  assert.equal((await call("PUT", "/support/codes", { token: TOKEN, body: { manager: "1111" } })).status, 409);
  const ok = await call("PUT", "/support/codes", { token: TOKEN, body: { manager: "۱۴۰۲" } });
  assert.equal(ok.status, 200); assert.equal(ok.data.manager, "1402");
  assert.equal((await call("POST", "/login", { body: { role: "manager", code: "1402" } })).status, 200, "کد تازهٔ دیتابیس");
  assert.equal((await call("POST", "/login", { body: { role: "manager", code: "4321" } })).status, 401, "کد env دیگر کار نمی‌کند");
  assert.equal((await call("GET", "/settings", { manager: "1402" })).status, 200);
  assert.equal(JSON.stringify((await call("GET", "/settings", { manager: "1402" })).data).includes("1402"), false, "کد مدیر در تنظیماتِ پنل نمی‌آید");
});

test("کد کارشناس: فقط پشتیبانی عوض می‌کند، چهار رقم، نه تکراری؛ مدیر نه می‌بیند نه می‌دهد", { skip: SKIP }, async () => {
  assert.equal((await call("PUT", "/support/codes", { token: TOKEN, body: { expert_id: 2, code: "123" } })).status, 400);
  assert.equal((await call("PUT", "/support/codes", { token: TOKEN, body: { expert_id: 2, code: "1111" } })).status, 409, "کدِ کارشناس یک");
  assert.equal((await call("PUT", "/support/codes", { token: TOKEN, body: { expert_id: 2, code: "1402" } })).status, 409, "کد مدیر");
  const r = await call("PUT", "/support/codes", { token: TOKEN, body: { expert_id: 2, code: "2468" } });
  assert.equal(r.status, 200);
  assert.equal(r.data.experts.find((e) => e.id === 2).code, "2468");
  assert.equal((await call("POST", "/login", { body: { code: "2468" } })).data.expert.id, 2);
  /* مدیر */
  const list = await call("GET", "/experts", { manager: "1402" });
  assert.equal(list.status, 200);
  assert.ok(list.data.experts.length >= 2);
  assert.ok(list.data.experts.every((e) => !("code" in e) || e.code === undefined), "کد در فهرست مدیر نیست");
  assert.equal((await call("PUT", "/experts/2", { manager: "1402", body: { code: "3333" } })).status, 403);
  assert.equal((await call("PUT", "/experts/2", { manager: "1402", body: { label: "دو (ویرایش)" } })).status, 200, "بقیهٔ فیلدها هنوز مدیر");
  const add = await call("POST", "/experts", { manager: "1402", body: { name: "کارشناس سه", label: "سه", code: "9999" } });
  assert.equal(add.status, 200);
  assert.equal(add.data.code, undefined, "پاسخِ افزودن کد ندارد");
  const e3 = row("SELECT code FROM experts WHERE name=?", "کارشناس سه");
  assert.match(e3.code, /^\d{4}$/, "کد خودکارِ چهاررقمی");
  assert.notEqual(e3.code, "9999", "کدِ پیشنهادیِ مدیر نادیده گرفته می‌شود");
  assert.ok((await call("GET", "/support/codes", { token: TOKEN })).data.experts.some((e) => e.code === e3.code), "پشتیبانی کد تازه را می‌بیند");
  /* کارشناس خودش: چهار رقم */
  assert.equal((await call("PUT", "/me/code", { expert: "2468", body: { current: "2468", code: "24680" } })).status, 400);
  assert.equal((await call("PUT", "/me/code", { expert: "2468", body: { current: "2468", code: "2469" } })).status, 200);
});

test("ارتقای یک‌بارهٔ دیتابیسِ موجود: کدهای بلند عوض می‌شوند، رخداد و پیام تلگرام، کد مدیر ۱۴۰۲", { skip: SKIP }, async () => {
  DB.raw.exec("DELETE FROM settings WHERE key IN ('codes4','managerCode')");
  DB.raw.exec("DELETE FROM events WHERE kind='code_reset'");
  const ex = DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,telegram_chat,created_at) VALUES (?,?,?,?,?,1,?,?)");
  ex.run(11, "کد شش‌رقمی", "شش", "771177", 1, "7011", T0);
  ex.run(12, "کد هشت‌رقمی", "هشت", "12345678", 1, null, T0);
  ex.run(13, "رفته با کد بلند", "رفته", "999999", 0, null, T0);
  await migrateCodes4(env, true);
  const c11 = row("SELECT code FROM experts WHERE id=11").code, c12 = row("SELECT code FROM experts WHERE id=12").code;
  assert.match(c11, /^\d{4}$/); assert.match(c12, /^\d{4}$/); assert.notEqual(c11, c12);
  assert.equal(row("SELECT code FROM experts WHERE id=1").code, "1111", "کد چهاررقمی دست نمی‌خورد");
  assert.equal(row("SELECT code FROM experts WHERE id=13").code, "999999", "کارشناس غیرفعال دست نمی‌خورد");
  assert.equal(JSON.parse(row("SELECT value FROM settings WHERE key='managerCode'").value), "1402");
  assert.equal(row("SELECT COUNT(*) AS n FROM events WHERE kind='code_reset'").n, 2);
  const ob = row("SELECT payload_json FROM outbox WHERE idem='codes4:11'");
  assert.ok(ob && JSON.parse(ob.payload_json).text.includes(c11), "کد تازه برای کارشناسِ تلگرام‌دار در صف تلگرام");
  assert.equal(row("SELECT COUNT(*) AS n FROM outbox WHERE idem='codes4:12'").n, 0, "بی تلگرام، پیامی نیست");
  const flag = JSON.parse(row("SELECT value FROM settings WHERE key='codes4'").value);
  assert.equal(flag.changed, 2);
  /* بار دوم کاری نمی‌کند */
  await migrateCodes4(env, true);
  assert.equal(row("SELECT code FROM experts WHERE id=11").code, c11);
  assert.equal((await call("POST", "/login", { body: { role: "manager", code: "1402" } })).status, 200);
  assert.equal((await call("POST", "/login", { body: { code: c11 } })).data.expert.id, 11);
});
