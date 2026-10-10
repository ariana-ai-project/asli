/* ============================================================
   جلوه‌های پنل‌ها (مهر ۱۴۰۵): درخششِ دکمه‌های ناوبری و «روح» نوری — از پنل پشتیبانیِ صفحهٔ خانه
   • GET /site بی ورود fx را می‌دهد (پیش‌فرض هر دو روشن) تا همهٔ پنل‌ها بخوانند
   • PUT /site { fx } فقط با رمز تب (یا کد مدیر)؛ فقط کلیدهای glow و ghost، فقط بولی؛ وصله‌ای
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = { DB, MANAGER_CODE: "4321" };
if (DB) await ensureSchema(env);
async function call(method, body, code) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (code) headers["X-Site-Code"] = code;
  const res = await route(new Request("https://x/tamin-poshtibani/api/site", { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env, { waitUntil() {} });
  return { status: res.status, data: await res.json() };
}

test("جلوه‌ها: پیش‌فرض روشن، تغییر با رمز تب، وصله‌ای و فقط کلیدهای شناخته", { skip: SKIP }, async () => {
  const r0 = await call("GET");
  assert.equal(r0.status, 200);
  assert.deepEqual(r0.data.fx, { glow: true, ghost: true });
  assert.equal((await call("PUT", { fx: { ghost: false } })).status, 401, "بی رمز نه");
  const r1 = await call("PUT", { fx: { ghost: false } }, "4321");
  assert.equal(r1.status, 200);
  assert.deepEqual(r1.data.fx, { glow: true, ghost: false });
  const r2 = await call("PUT", { fx: { glow: false } }, "4321");
  assert.deepEqual(r2.data.fx, { glow: false, ghost: false }, "وصله: ghost همان خاموش می‌ماند");
  assert.equal((await call("PUT", { fx: { sparkle: true } }, "4321")).status, 400);
  assert.equal((await call("PUT", { fx: { glow: "yes" } }, "4321")).status, 400);
  assert.deepEqual((await call("GET")).data.fx, { glow: false, ghost: false }, "پنل‌ها همین را می‌خوانند");
  /* کارت‌ها دست نمی‌خورند */
  assert.deepEqual((await call("GET")).data.cards, {});
});
