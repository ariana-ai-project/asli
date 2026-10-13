/* ============================================================
   فاز ۰ طرح «پیام اول، استراتژی‌ها، پروفایل و گراف» (مهر ۱۴۰۵): سه رخنهٔ امنیتی
   • کدِ پیش‌فرضِ مدیر در راهنمای عمومی و دانشِ دستیار سامانه نوشته نمی‌شود
   • «فقط رتبه» و دور سربسته: کمترین قیمت از هیچ فیلدی به تأمین‌کننده نمی‌رسد (tender.best_amount هم نه)
   • کدهای چهاررقمی: از هر شبکه در ۱۵ دقیقه ۲۰ کدِ نادرستِ متفاوت، بعد ۴۲۹ حتی با کد درست؛ تکرارِ یک کدِ نادرست یک بار
   • «حساب من»: کدِ مدیر و کدِ کارشناسِ دیگر یک پیام دارند و روزی ۵ بار
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import { LIMIT, CODE_DAY_LIMIT } from "../../../worker/auth-guard.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = { DB, MANAGER_CODE: "4321", COMPANY: "تونل سد آریانا", SITE_ORIGIN: "https://arianaai.website", TG_BOT_TOKEN: "t", TG_WEBHOOK_SECRET: "s" };
const realFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, result: [] }), { status: 200, headers: { "content-type": "application/json" } });
test.after(() => { globalThis.fetch = realFetch; });

const run = (sql, ...a) => DB.raw.prepare(sql).run(...a);
const get = (sql, ...a) => DB.raw.prepare(sql).get(...a);
const call = async (method, path, body, headers, ip = "10.0.0.1") => {
  const res = await route(new Request("https://x/tamin-poshtibani/api" + path, { method,
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip, ...(headers || {}) }, body: body ? JSON.stringify(body) : undefined }),
  env, { waitUntil(p) { return p && p.catch && p.catch(() => {}); } });
  let data = null; try { data = await res.json(); } catch (_) { /* غیر JSON */ }
  return { status: res.status, data };
};
if (DB) {
  await ensureSchema(env);
  const t = Date.now();
  run("DELETE FROM experts");
  run("INSERT INTO experts (id,name,label,code,active,speed,created_at) VALUES (1,'کارشناس یک','یک','1111',1,1,?), (2,'کارشناس دو','دو','2222',1,1,?)", t, t);
}

test("کدِ مدیر در راهنمای عمومی و دانشِ دستیار نیست", () => {
  for (const f of ["frontend/tamin-poshtibani/help-content.js", "worker/help-knowledge.js"]) {
    const s = readFileSync(resolve(ROOT, f), "utf8");
    assert.doesNotMatch(s, /کد مدیر\s*«[0-9۰-۹]{4}»/, f);
  }
});

test("کد کارشناس: ۲۰ کدِ نادرستِ متفاوت از یک شبکه ← ۴۲۹ حتی با کد درست؛ شبکهٔ دیگر آزاد", { skip: SKIP }, async () => {
  assert.equal((await call("GET", "/tray", null, { "X-Expert-Code": "1111" }, "1.1.1.1")).status, 200);
  /* زبانهٔ کهنه: یک کدِ نادرست بارها — یک بار شمرده می‌شود */
  for (let i = 0; i < 40; i++) assert.equal((await call("GET", "/tray", null, { "X-Expert-Code": "9999" }, "1.1.1.1")).status, 401);
  assert.equal((await call("GET", "/tray", null, { "X-Expert-Code": "1111" }, "1.1.1.1")).status, 200, "کد تکراری قفل نمی‌کند");
  for (let i = 0; i < LIMIT - 1; i++) await call("GET", "/tray", null, { "X-Expert-Code": String(5000 + i) }, "1.1.1.1");
  const shut = await call("GET", "/tray", null, { "X-Expert-Code": "1111" }, "1.1.1.1");
  assert.equal(shut.status, 429, JSON.stringify(shut.data));
  assert.equal((await call("GET", "/tray", null, { "X-Expert-Code": "1111" }, "2.2.2.2")).status, 200, "شبکهٔ دیگر");
  /* هشدار برای مدیر و پشتیبان، فقط یک بار */
  assert.equal(get("SELECT COUNT(*) AS n FROM alarms WHERE kind='auth_block'").n, 1);
  for (let i = 0; i < 5; i++) await call("GET", "/tray", null, { "X-Expert-Code": String(6000 + i) }, "1.1.1.1");
  assert.equal(get("SELECT COUNT(*) AS n FROM alarms WHERE kind='auth_block'").n, 1);
  /* کد خام ذخیره نمی‌شود */
  assert.equal(get("SELECT COUNT(*) AS n FROM auth_fails WHERE h IN ('9999','5000')").n, 0);
  /* بازهٔ بعد: دوباره باز */
  run("UPDATE auth_fails SET win=win-1");
  assert.equal((await call("GET", "/tray", null, { "X-Expert-Code": "1111" }, "1.1.1.1")).status, 200);
});

test("کد مدیر و رمز تب: همان سقف", { skip: SKIP }, async () => {
  assert.equal((await call("GET", "/experts", null, { "X-Manager-Code": "4321" }, "3.3.3.3")).status, 200);
  for (let i = 0; i < LIMIT; i++) assert.equal((await call("GET", "/experts", null, { "X-Manager-Code": String(7000 + i) }, "3.3.3.3")).status, 401);
  assert.equal((await call("GET", "/experts", null, { "X-Manager-Code": "4321" }, "3.3.3.3")).status, 429);
  /* رمز تب سایت (کد مدیر هم می‌پذیرد) */
  assert.equal((await call("POST", "/site/login", { code: "4321" }, null, "4.4.4.4")).status, 200);
  for (let i = 0; i < LIMIT; i++) assert.equal((await call("POST", "/site/login", { code: String(8000 + i) }, null, "4.4.4.4")).status, 401);
  assert.equal((await call("POST", "/site/login", { code: "4321" }, null, "4.4.4.4")).status, 429);
});

test("«حساب من»: کدِ مدیر و کدِ کارشناس دیگر یک پیام، و روزی ۵ بار", { skip: SKIP }, async () => {
  const EX = { "X-Expert-Code": "1111" };
  const a = await call("PUT", "/me/code", { current: "1111", code: "4321" }, EX, "5.5.5.5");
  const b = await call("PUT", "/me/code", { current: "1111", code: "2222" }, EX, "5.5.5.5");
  assert.equal(a.status, 409);
  assert.equal(b.status, 409);
  assert.equal(a.data.error, b.data.error, "دو پیامِ متفاوت کدِ مدیر را لو می‌داد");
  /* همان کدِ گرفته‌شده دوباره یک بار شمرده می‌شود؛ شمارش کدهای گرفته‌شدهٔ «متفاوت» است */
  assert.equal((await call("PUT", "/me/code", { current: "1111", code: "2222" }, EX, "5.5.5.5")).status, 409);
  const t = Date.now();
  for (let i = 2; i < CODE_DAY_LIMIT; i++) {
    const c = String(3000 + i * 111);
    run("INSERT INTO experts (id,name,label,code,active,speed,created_at) VALUES (?,?,?,?,1,1,?)", 10 + i, `کارشناس ${i}`, `${i}`, c, t);
    assert.equal((await call("PUT", "/me/code", { current: "1111", code: c }, EX, "5.5.5.5")).status, 409);
  }
  const shut = await call("PUT", "/me/code", { current: "1111", code: "3456" }, EX, "5.5.5.5");
  assert.equal(shut.status, 429, "پس از ۵ بار حتی کدِ آزاد هم تا فردا نه");
  assert.equal(get("SELECT code FROM experts WHERE id=1").code, "1111");
  /* کارشناسِ دیگر آزاد است */
  assert.equal((await call("PUT", "/me/code", { current: "2222", code: "3456" }, { "X-Expert-Code": "2222" }, "5.5.5.5")).status, 200);
});

test("مناقصه، «فقط رتبه» و سربسته: کمترین قیمت در tender هم به تأمین‌کننده نمی‌رسد", { skip: SKIP }, async () => {
  const SUP = { "X-Support-Token": (await call("POST", "/support/setup", { pass: "9753" })).data.token };
  const P = { A: "09121111111", B: "09122222222" };
  const fresh = async (extra, sched) => {
    const r = await call("POST", "/support/tenders", { title: "تیرآهن ۱۴", qty: 10, unit: "شاخه", start_price: 1_000_000,
      invites: [{ name: "الف", phone: P.A }, { name: "ب", phone: P.B }], ...(extra || {}) }, SUP);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const id = r.data.tender.id, code = r.data.tender.code;
    assert.equal((await call("POST", `/support/tenders/${id}/schedule`, { start_in_min: 0, duration_min: 30, ...(sched || {}) }, SUP)).status, 200);
    const H = {};
    for (const k of ["A", "B"]) {
      const al = get("SELECT alias FROM tender_invites WHERE tender_id=? AND phone=?", id, P[k]).alias;
      const p = (await call("POST", `/support/tenders/${id}/invites/${al}/pass`, {}, SUP)).data.pass;
      H[k] = { "X-Tender-Token": (await call("POST", `/tender/${code}/login`, { phone: P[k], pass: p })).data.token };
    }
    return { id, code, H };
  };
  /* فقط رتبه */
  const r1 = await fresh({ show_prices: false });
  assert.equal((await call("POST", `/tender/${r1.code}/bid`, { amount: 990_000 }, r1.H.A)).status, 200);
  const v1 = (await call("GET", `/tender/${r1.code}/state`, null, r1.H.B)).data;
  assert.equal(v1.best, null);
  assert.equal(v1.tender.best_amount, undefined, "tender.best_amount هم پنهان");
  assert.equal((await call("GET", `/support/tenders/${r1.id}`, null, SUP)).data.tender.best_amount, 990_000, "پشتیبان می‌بیند");
  /* سربسته */
  const r2 = await fresh({}, { sealed_min: 10 });
  assert.equal((await call("POST", `/tender/${r2.code}/bid`, { amount: 950_000 }, r2.H.A)).status, 200);
  const v2 = (await call("GET", `/tender/${r2.code}/state`, null, r2.H.B)).data;
  assert.equal(v2.tender.state, "sealed");
  assert.equal(v2.tender.best_amount, undefined);
  /* قیمت‌ها پیدا: همان قبلی */
  const r3 = await fresh();
  assert.equal((await call("POST", `/tender/${r3.code}/bid`, { amount: 980_000 }, r3.H.A)).status, 200);
  assert.equal((await call("GET", `/tender/${r3.code}/state`, null, r3.H.B)).data.tender.best_amount, 980_000);
});
