/* ============================================================
   ورود کارشناس و مدیر — POST /login

   دو باگِ هفتهٔ تحویل (مهر ۱۴۰۵):
   • کادر ورود کارشناس فقط ۶ رقم می‌گرفت، در حالی که کد ورود ۴ تا ۸ رقم است؛ کارشناسِ
     کد ۷ یا ۸ رقمی اصلاً نمی‌توانست کدش را بنویسد.
   • کد در جدول با رقم لاتین ذخیره می‌شود ولی ورود همان متنِ تایپ‌شده را می‌سنجید؛ کسی که
     با صفحه‌کلید فارسی «۱۱۴۰» می‌زد «کد معتبر نیست» می‌گرفت، و مدیر خطای داخلی (هدر HTTP
     نویسهٔ غیرلاتین نمی‌پذیرد).
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONT = resolve(HERE, "../../../frontend/tamin-poshtibani");

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = { DB, MANAGER_CODE: "4321" };
if (DB) {
  await ensureSchema(env);
  const t = Date.now();
  DB.raw.exec("DELETE FROM experts");
  const ex = DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,created_at) VALUES (?,?,?,?,?,1,?)");
  ex.run(1, "کارشناس چهاررقمی", "چهار", "1140", 1, t);
  ex.run(2, "کارشناس هشت‌رقمی", "هشت", "12345678", 1, t);
  ex.run(3, "کارشناس رفته", "رفته", "5555", 0, t);
}

const login = async (body) => {
  const res = await route(new Request("https://x/tamin-poshtibani/api/login", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }), env, { waitUntil() {} });
  return { status: res.status, data: await res.json() };
};

test("ورود کارشناس: رقم لاتین، فارسی و عربی؛ کد هشت‌رقمی؛ کد نادرست و کارشناس رفته", { skip: SKIP }, async () => {
  for (const code of ["1140", "۱۱۴۰", "١١٤٠", "  ۱۱۴۰ "]) {
    const r = await login({ code });
    assert.equal(r.status, 200, `کد «${code}»`);
    assert.equal(r.data.expert.id, 1);
    assert.equal(r.data.expert.code, "1140", "نشست با کد لاتین ساخته می‌شود تا هدرهای بعدی معتبر باشند");
  }
  for (const code of ["12345678", "۱۲۳۴۵۶۷۸"]) {
    const r = await login({ code });
    assert.equal(r.status, 200, `کد هشت‌رقمی «${code}»`);
    assert.equal(r.data.expert.id, 2);
  }
  assert.equal((await login({ code: "1141" })).status, 401);
  assert.equal((await login({ code: "۵۵۵۵" })).status, 401, "کارشناس غیرفعال وارد نمی‌شود");
});

test("ورود مدیر با رقم فارسی خطای داخلی نمی‌دهد", { skip: SKIP }, async () => {
  assert.deepEqual(await login({ role: "manager", code: "۴۳۲۱" }), { status: 200, data: { role: "manager" } });
  assert.deepEqual(await login({ role: "manager", code: "4321" }), { status: 200, data: { role: "manager" } });
  assert.equal((await login({ role: "manager", code: "۱۲۳۴" })).status, 401);
  assert.equal((await login({ role: "manager", code: "رمز" })).status, 401, "نویسهٔ غیرلاتین ۴۰۱ است نه ۵۰۰");
});

test("کادر ورود پنل‌ها: هشت رقم و تبدیل رقم فارسی پیش از ارسال", () => {
  const expert = readFileSync(resolve(FRONT, "expert.js"), "utf8");
  const manager = readFileSync(resolve(FRONT, "manager.js"), "utf8");
  const shared = readFileSync(resolve(FRONT, "shared.js"), "utf8");
  assert.match(expert, /<input id="code"[^>]*maxlength="8"/, "کد ورود تا ۸ رقم است");
  assert.match(expert, /TP\.digits\(G\("#code"\)\.value\)/);
  assert.match(manager, /TP\.digits\(G\("#mcode"\)\.value\)/);
  assert.match(shared, /TP\.digits = dig;/);
});
