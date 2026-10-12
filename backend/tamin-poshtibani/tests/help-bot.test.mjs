/* ============================================================
   «دستیار سامانه» در کشوی راهنما (worker/help-bot.js)
   • دانش همان راهنمای پنل‌هاست (help-knowledge.js ساخته از help-content.js — اگر راهنما عوض شد و دوباره ساخته نشد، شکست)
   • فقط کارکنان، هر کس با ورود نقش خودش؛ سابقهٔ هر نفر جدا؛ حافظه: پیام‌های قبلی همراه هر پرسش
   • درخواست به مدل: Haiku 4.5، قواعد + دانش در system با cache_control، نام و نقش کاربر بعد از بخش کش‌شده
   • سقف دقیقه‌ای، پاک کردن گفت‌وگو، خطای مدل ← هیچ چیز ذخیره نمی‌شود
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import { HELP_KNOWLEDGE } from "../../../worker/help-knowledge.js";
import { buildKnowledge } from "../tools/build-help-knowledge.mjs";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست";
const env = { DB, MANAGER_CODE: "4321", ANTHROPIC_API_KEY: "k-test", ANTHROPIC_API_BASE: "https://model.test" };
const SENT = []; let NEXT = null, DOWN = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith("https://model.test/")) {
    const body = JSON.parse(init.body); SENT.push({ body, headers: init.headers });
    if (DOWN > 0) { DOWN--; throw new TypeError("Network connection lost."); }
    if (NEXT) { const n = NEXT; NEXT = null; return n; }
    const name = /نام: ([^\n]+)/.exec(body.system[2].text);
    return new Response(JSON.stringify({ content: [{ type: "text", text: `سلام ${name ? name[1].split(" ")[0] : ""} جان! جوابِ «${body.messages.at(-1).content}»` }],
      usage: { input_tokens: 120, output_tokens: 40, cache_read_input_tokens: 20000 } }), { status: 200, headers: { "content-type": "application/json" } });
  }
  return realFetch(url, init);
};
const call = async (method, path, body, headers) => {
  const res = await route(new Request("https://x/tamin-poshtibani/api" + path, { method, headers: { "Content-Type": "application/json", ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined }), env, { waitUntil() {} });
  return { status: res.status, data: await res.json() };
};
const EX1 = { "X-Expert-Code": "1111" }, EX2 = { "X-Expert-Code": "2222" }, MG = { "X-Manager-Code": "4321" };
let SUP = null;
if (DB) {
  await ensureSchema(env);
  const t = Date.now();
  DB.raw.exec("DELETE FROM experts");
  DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,created_at) VALUES (1,'سید حمید رسولی طاهر','آقای رسولی','1111',1,1,?), (2,'زهرا خوانساری','خانم خوانساری','2222',1,1,?)").run(t, t);
  SUP = { "X-Support-Token": (await call("POST", "/support/setup", { pass: "9753" })).data.token };
}

test("دانش دستیار همان راهنمای فعلی پنل‌هاست (بعد از تغییر help-content.js دوباره بسازید)", () => {
  assert.equal(HELP_KNOWLEDGE, buildKnowledge(), "node backend/tamin-poshtibani/tools/build-help-knowledge.mjs");
  for (const w of ["میز ارجاع", "جدول کمیسیون", "مناقصه", "تأیید کمیسیون", "Add to Home Screen"]) assert.ok(HELP_KNOWLEDGE.includes(w), w);
});

test("فقط کارکنان با ورود نقش خودشان؛ تأمین‌کننده و بی‌ورود نه", { skip: SKIP }, async () => {
  assert.equal((await call("GET", "/help/chat?role=expert")).status, 401);
  assert.equal((await call("GET", "/help/chat?role=manager", null, { "X-Manager-Code": "0000" })).status, 401);
  assert.equal((await call("GET", "/help/chat?role=supplier", null, EX1)).status, 400);
  const e = await call("GET", "/help/chat?role=expert", null, EX1);
  assert.deepEqual([e.status, e.data.messages, e.data.ready], [200, [], true]);
  assert.equal(e.data.name, "سید حمید رسولی طاهر");
  assert.equal((await call("GET", "/help/chat?role=manager", null, MG)).status, 200);
  assert.equal((await call("GET", "/help/chat?role=support", null, SUP)).status, 200);
});

test("پرسش: Haiku، قواعد و دانش در کش، نام و نقش کاربر؛ پاسخ ذخیره و برگردانده می‌شود", { skip: SKIP }, async () => {
  SENT.length = 0;
  const r = await call("POST", "/help/chat", { role: "expert", text: "جدول کمیسیون را کجا بسازم؟", page: "expert.comm" }, EX1);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.messages.map((m) => m.who), ["u", "a"]);
  assert.match(r.data.messages[1].text, /جان/);
  const { body, headers } = SENT[0];
  assert.equal(body.model, "claude-haiku-4-5");
  assert.equal(headers["x-api-key"], "k-test");
  assert.ok(body.max_tokens > 0 && body.max_tokens <= 1200);
  assert.equal(body.system.length, 3);
  assert.match(body.system[0].text, /فقط در خصوص همین سامانه/);
  assert.match(body.system[0].text, /اسمِ کوچکش/);
  assert.deepEqual(body.system[1].cache_control, { type: "ephemeral" });
  assert.ok(body.system[1].text.includes(HELP_KNOWLEDGE));
  assert.equal(body.system[0].cache_control, undefined, "فقط یک نقطهٔ کش، بعد از دانش");
  assert.match(body.system[2].text, /نام: سید حمید رسولی طاهر/);
  assert.match(body.system[2].text, /کارشناس خرید/);
  assert.match(body.system[2].text, /expert\.comm/);
  assert.deepEqual(body.messages, [{ role: "user", content: "جدول کمیسیون را کجا بسازم؟" }]);
  const h = await call("GET", "/help/chat?role=expert", null, EX1);
  assert.equal(h.data.messages.length, 2);
});

test("حافظه: پرسش بعدی گفت‌وگوی قبلی را همراه دارد؛ سابقهٔ هر کاربر جدا", { skip: SKIP }, async () => {
  SENT.length = 0;
  await call("POST", "/help/chat", { role: "expert", text: "و بعدش؟" }, EX1);
  const msgs = SENT[0].body.messages;
  assert.deepEqual(msgs.map((m) => m.role), ["user", "assistant", "user"]);
  assert.equal(msgs[0].content, "جدول کمیسیون را کجا بسازم؟");
  assert.equal(msgs[2].content, "و بعدش؟");
  /* کارشناس دیگر: بی سابقهٔ نفر اول */
  SENT.length = 0;
  await call("POST", "/help/chat", { role: "expert", text: "سلام" }, EX2);
  assert.deepEqual(SENT[0].body.messages, [{ role: "user", content: "سلام" }]);
  assert.match(SENT[0].body.system[2].text, /نام: زهرا خوانساری/);
  assert.equal((await call("GET", "/help/chat?role=expert", null, EX2)).data.messages.length, 2);
  /* مدیر: نام ندارد، نقش «مدیر» */
  SENT.length = 0;
  await call("POST", "/help/chat", { role: "manager", text: "فایل روزانه؟" }, MG);
  assert.match(SENT[0].body.system[2].text, /مدیر خرید/);
  assert.match(SENT[0].body.system[2].text, /نام: معلوم نیست/);
});

test("خطای مدل: ۵۰۳ و هیچ پیامی ذخیره نمی‌شود؛ پیام خالی و بلند", { skip: SKIP }, async () => {
  const before = DB.raw.prepare("SELECT COUNT(*) AS n FROM help_msgs").get().n;
  NEXT = new Response(JSON.stringify({ error: { message: "bad" } }), { status: 400, headers: { "content-type": "application/json" } });
  const r = await call("POST", "/help/chat", { role: "expert", text: "x" }, EX1);
  assert.equal(r.status, 503);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM help_msgs").get().n, before);
  /* قطعیِ شبکه: یک بار دوباره، بعد پیامِ فارسی نه متنِ خام */
  DOWN = 2;
  const n = await call("POST", "/help/chat", { role: "expert", text: "x" }, EX1);
  assert.equal(n.status, 503);
  assert.match(n.data.error, /ارتباط با دستیار/);
  assert.doesNotMatch(JSON.stringify(n.data), /Network/);
  DOWN = 1;
  assert.equal((await call("POST", "/help/chat", { role: "expert", text: "y" }, EX1)).status, 200, "قطعیِ یک‌باره با تلاشِ دوم جبران می‌شود");
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM help_msgs").get().n, before + 2);
  assert.equal((await call("POST", "/help/chat", { role: "expert", text: "   " }, EX1)).status, 400);
  SENT.length = 0;
  await call("POST", "/help/chat", { role: "expert", text: "ب".repeat(5000) }, EX1);
  assert.equal(SENT[0].body.messages.at(-1).content.length, 1200, "حداکثر ۱۲۰۰ نویسه");
});

test("سقف دقیقه‌ای و پاک کردن گفت‌وگو", { skip: SKIP }, async () => {
  const t = Date.now();
  for (let i = 0; i < 8; i++) DB.raw.prepare("INSERT INTO help_msgs (role, uid, who, body, at) VALUES ('support', 0, 'u', 'q', ?)").run(t - 1000);
  const r = await call("POST", "/help/chat", { role: "support", text: "سؤال" }, SUP);
  assert.equal(r.status, 429);
  const c = await call("POST", "/help/chat/clear", { role: "support" }, SUP);
  assert.deepEqual([c.status, c.data.messages], [200, []]);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM help_msgs WHERE role='support'").get().n, 0);
  assert.equal((await call("POST", "/help/chat", { role: "support", text: "سؤال" }, SUP)).status, 200);
});

test.after(() => { globalThis.fetch = realFetch; });
