/* ============================================================
   اعلانِ گوشی و مرورگر — از رویداد تا سرویس push (worker/push.js و قلاب‌هایش)
   • اشتراک با ورودِ همان نقش (کارشناس با کد، مدیر با کد مدیر، پشتیبان با نشانه)؛ /push/key و /push/test
   • رویدادِ صف‌دار (تعلیق مدیر) ← push_out در همان batch ← flush ← سرویس push؛ کارشناسِ بی‌تلگرام هم
   • بی اشتراک: هیچ ردیفی در صف (بی نوشتن)
   • هشدار (raiseAlarm) همان لحظه به مدیر و پشتیبان
   • لغوِ اشتراک در خروج
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { createECDH, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import { raiseAlarm } from "../../../worker/alarms.js";
import { b64u, resetVapidCache } from "../../../worker/push.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = { DB, MANAGER_CODE: "4321", TG_IGNORE_HOURS: "1", SITE_ORIGIN: "https://arianaai.website" };

/* سرویس push بدلی: هر درخواستِ fetch به fcm ثبت می‌شود (۲۰۱) */
const SENT = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith("https://fcm.googleapis.com/")) { SENT.push({ url: String(url), init }); return new Response(null, { status: 201 }); }
  return realFetch(url, init);
};
const dev = (name) => { const k = createECDH("prime256v1"); k.generateKeys(); const auth = randomBytes(16);
  return { k, auth, sub: { endpoint: `https://fcm.googleapis.com/fcm/send/${name}`, keys: { p256dh: b64u(k.getPublicKey()), auth: b64u(auth) } } }; };
function decrypt(body, d) {
  const salt = body.subarray(0, 16), idlen = body[20], asPub = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
  const ikm = Buffer.from(hkdfSync("sha256", d.k.computeSecret(asPub), d.auth, Buffer.concat([Buffer.from("WebPush: info\0"), d.k.getPublicKey(), asPub]), 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const dc = createDecipheriv("aes-128-gcm", cek, nonce); dc.setAuthTag(ct.subarray(ct.length - 16));
  const pt = Buffer.concat([dc.update(ct.subarray(0, ct.length - 16)), dc.final()]);
  return JSON.parse(pt.subarray(0, pt.length - 1).toString("utf8"));
}
const to = (d) => SENT.filter((s) => s.url === d.sub.endpoint).map((s) => decrypt(Buffer.from(s.init.body), d));

const jobs = [];
const ctx = { waitUntil(p) { jobs.push(p); } };
const settle = async () => { while (jobs.length) await Promise.all(jobs.splice(0)); };
const call = async (method, path, body, headers) => {
  const res = await route(new Request("https://x/tamin-poshtibani/api" + path, { method, headers: { "Content-Type": "application/json", ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined }), env, ctx);
  const data = await res.json(); await settle();
  return { status: res.status, data };
};

const E2 = dev("expert2"), MG = dev("manager"), SP = dev("support");
let SUP = null;
if (DB) {
  resetVapidCache();
  await ensureSchema(env);
  const t = Date.now();
  DB.raw.exec("DELETE FROM experts");
  DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,telegram_chat,created_at) VALUES (1,'کارشناس وصل','وصل','1111',1,1,'700',?), (2,'زهرا بی‌تلگرام','خانم بی‌تلگرام','2222',1,1,NULL,?)").run(t, t);
  DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES ('R-1','1405/07/01','پروژهٔ یک'), ('R-2','1405/07/01','پروژهٔ دو')").run();
  DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,created_at) VALUES (1,'R-1',1,3,?,?), (2,'R-2',2,3,?,?)").run(t, t, t, t);
  const it = DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,title,qty,unit,state,assignment_id) VALUES (?,?,?,?,?,1,'عدد','open',?)");
  it.run(11, "R-1", "k1", 1, "قلم یک", 1); it.run(21, "R-2", "k1", 1, "قلم یک", 2); it.run(22, "R-2", "k2", 2, "قلم دو", 2);
  SUP = { "X-Support-Token": (await call("POST", "/support/setup", { pass: "9753" })).data.token };
}

test("اشتراک با ورودِ همان نقش؛ کلید عمومی؛ اعلانِ آزمایشی رمزشده به همان دستگاه", { skip: SKIP }, async () => {
  const key = await call("GET", "/push/key");
  assert.equal(key.status, 200);
  assert.match(key.data.key, /^[A-Za-z0-9_-]{87}$/, "۶۵ بایت base64url");
  assert.equal((await call("POST", "/push/subscribe", { role: "expert", sub: E2.sub })).status, 401, "بی ورود");
  assert.equal((await call("POST", "/push/subscribe", { role: "manager", sub: MG.sub }, { "X-Manager-Code": "0000" })).status, 401);
  assert.equal((await call("POST", "/push/subscribe", { role: "expert", sub: E2.sub }, { "X-Expert-Code": "2222" })).status, 200);
  assert.equal((await call("POST", "/push/subscribe", { role: "manager", sub: MG.sub }, { "X-Manager-Code": "4321" })).status, 200);
  assert.equal((await call("POST", "/push/subscribe", { role: "support", sub: SP.sub }, SUP)).status, 200);
  assert.deepEqual(DB.raw.prepare("SELECT role, uid FROM push_subs ORDER BY role").all().map((r) => [r.role, r.uid]), [["expert", 2], ["manager", 0], ["support", 0]]);
  const r = await call("POST", "/push/test", { role: "expert" }, { "X-Expert-Code": "2222" });
  assert.equal(r.data.sent, 1);
  const [m] = to(E2);
  assert.match(m.t, /روشن است/);
  assert.match(m.b, /خانم بی‌تلگرام/);
  assert.equal(m.u, "expert");
});

test("تعلیقِ مدیر: کارشناسِ بی‌تلگرام اعلانِ گوشی می‌گیرد؛ کارشناسِ بی‌اشتراک هیچ ردیفی در صف ندارد", { skip: SKIP }, async () => {
  SENT.length = 0;
  const r = await call("POST", "/items/state", { assignment_id: 2, request_id: "R-2", state: "hold" }, { "X-Manager-Code": "4321" });
  assert.equal(r.status, 200);
  assert.equal(r.data.notified, 0, "تلگرامی نرفت (وصل نیست)");
  const got = to(E2);
  assert.equal(got.length, 1, JSON.stringify(SENT.map((s) => s.url)));
  assert.match(got[0].t, /تعلیق/);
  assert.match(got[0].t, /R-2/);
  assert.match(got[0].b, /پروژهٔ دو · ۲ قلم|پروژهٔ دو · 2 قلم/);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM push_out").get().n, 0, "صف بعد از ارسال خالی");
  /* کارشناس ۱ اشتراک ندارد: نه ردیفی در push_out، نه ارسالی (فقط تلگرام) */
  SENT.length = 0;
  const r1 = await call("POST", "/items/state", { assignment_id: 1, request_id: "R-1", state: "hold" }, { "X-Manager-Code": "4321" });
  assert.equal(r1.data.notified, 1);
  assert.equal(SENT.length, 0);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM push_out").get().n, 0);
});

test("هشدار همان لحظه به مدیر و پشتیبان", { skip: SKIP }, async () => {
  SENT.length = 0;
  await raiseAlarm(env, { kind: "ai_takeover", title: "باز کردنِ اضطراری", body: "کارشناس گفت‌وگوی کارشناس هوشمند را باز کرد", expert_id: 2 }, ctx);
  await settle();
  assert.deepEqual([to(MG).length, to(SP).length], [1, 1]);
  assert.equal(to(MG)[0].t, "🚨 باز کردنِ اضطراری");
  assert.equal(to(SP)[0].u, "support");
  assert.equal(to(MG)[0].u, "manager");
});

test("خروج: اشتراک از این کاربر جدا می‌شود و دیگر اعلانی نمی‌رسد", { skip: SKIP }, async () => {
  assert.equal((await call("POST", "/push/unsubscribe", { endpoint: E2.sub.endpoint })).status, 200);
  SENT.length = 0;
  await call("POST", "/items/state", { assignment_id: 2, request_id: "R-2", state: "open" }, { "X-Manager-Code": "4321" });
  assert.equal(to(E2).length, 0);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM push_subs WHERE role='expert'").get().n, 0);
});

test.after(() => { globalThis.fetch = realFetch; });
