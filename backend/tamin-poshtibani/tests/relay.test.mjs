/* ============================================================
   پلِ سرورِ شرکت — worker/relay.js (آبان ۱۴۰۵)

   IPPanel از IPِ خارجی جواب نمی‌دهد؛ با RELAY_KEY درگاهِ ippanel پیامک را در sms_outbox می‌گذارد و برنامهٔ پل روی سرورِ شرکت
   با POST /relay/sync نتیجهٔ قبلی‌ها را می‌دهد و تازه‌ها را می‌گیرد:
   • آمادگی بی IPPANEL_API_KEY؛ پلِ قطع یعنی خطا (شبیه‌سازی)، نه صفی که کسی برنمی‌دارد؛ هیچ fetchِ بیرونی
   • کلیدِ پل (۴۰۳/۴۰۴)، تپش و اعتبار، گرفتنِ یک‌باره، نتیجه روی sms_outbox و sp_sms، پاک شدنِ بدنه (رمزها در D1 نمی‌مانند)
   • Cron: انقضای صف، «نامعلوم»ِ بی‌نتیجه‌ها و یک هشدار برای قطعیِ پل
   • پشتیبان‌گیری: طرحِ جدول‌ها (کلیدِ اصلیِ WITHOUT ROWID) و صفحه‌به‌صفحه بی جاافتادن و بی تکرار
   • پنل پشتیبانی: وضعیتِ پل و «📨 پیامک آزمایشی»
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import { sendSms, smsReady, smsStatus, smsCheck, garbled } from "../../../worker/sms.js";
import { relayWatch, relayTestText, relayTestPattern, RELAY_EXPIRE_MS, RELAY_STALE_MS } from "../../../worker/relay.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const KEY = "relay-test-key-0123456789abcdef";
const env = { DB, MANAGER_CODE: "4321", COMPANY: "تونل سد آریانا", SITE_ORIGIN: "https://site.test", SMS_PROVIDER: "ippanel", IPPANEL_FROM: "3000505", RELAY_KEY: KEY };
/* با پل، Worker هرگز خودش IPPanel را صدا نمی‌زند */
globalThis.fetch = async (url) => { throw new Error(`fetch بیرونیِ پیش‌بینی‌نشده: ${url}`); };

const pend = [];
const ctx = { waitUntil: (p) => pend.push(p) };
async function call(path, { method, body, headers, e } = {}) {
  const h = { ...(headers || {}) };
  let b;
  if (body !== undefined) { b = JSON.stringify(body); h["Content-Type"] = "application/json"; }
  const res = await route(new Request(`https://site.test/tamin-poshtibani/api${path}`, { method: method || (b !== undefined ? "POST" : "GET"), headers: h, body: b }), e || env, ctx);
  while (pend.length) await Promise.all(pend.splice(0));
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch (_) { data = text; }
  return { status: res.status, data };
}
const RK = { "x-relay-key": KEY };
const sync = (body) => call("/relay/sync", { body: body || {}, headers: RK });
const row = (id) => DB.raw.prepare("SELECT * FROM sms_outbox WHERE id=?").get(id);
let SUP = {};
if (DB) {
  await ensureSchema(env);
  SUP = { "X-Support-Token": (await call("/support/setup", { body: { pass: "9753" } })).data.token };
}

test("آمادگی: با RELAY_KEY کلیدِ IPPanel در Worker لازم نیست؛ بی خطِ فرستنده نه؛ وضعیت می‌گوید پل است", () => {
  assert.equal(smsReady({ SMS_PROVIDER: "ippanel", IPPANEL_FROM: "3000505", RELAY_KEY: "k" }), true);
  assert.equal(smsReady({ SMS_PROVIDER: "ippanel", IPPANEL_FROM: "3000505" }), false, "بی پل همان کلید لازم است");
  assert.equal(smsReady({ SMS_PROVIDER: "ippanel", RELAY_KEY: "k" }), false);
  const st = smsStatus({ SMS_PROVIDER: "ippanel", IPPANEL_FROM: "3000505", RELAY_KEY: "secret-relay" });
  assert.deepEqual([st.ready, st.missing, st.relay, st.from], [true, [], true, "+983000505"]);
  assert.ok(!JSON.stringify(st).includes("secret-relay"), "کلیدِ پل هیچ‌جا");
  assert.deepEqual(smsStatus({ IPPANEL_FROM: "1", RELAY_KEY: "k" }).others.find((o) => o.provider === "ippanel"), { provider: "ippanel", label: "IPPanel", ready: true, set: true, missing: [] });
  assert.match(relayTestText(Date.UTC(2026, 9, 28, 12, 30)), /^پیامک آزمایشی سامانهٔ تأمین آریانا — ساعت ۱۶:۰۰$/);
});

test("کلیدِ پل: بی RELAY_KEY مسیرها نیستند (۴۰۴)؛ کلیدِ نادرست ۴۰۳", { skip: SKIP }, async () => {
  assert.equal((await call("/relay/sync", { body: {}, e: { ...env, RELAY_KEY: "" } })).status, 404);
  assert.equal((await call("/relay/sync", { body: {} })).status, 403);
  assert.equal((await call("/relay/sync", { body: {}, headers: { "x-relay-key": KEY + "x" } })).status, 403);
  assert.equal((await call("/relay/backup/schema", { headers: { "x-relay-key": "nope" } })).status, 403);
  assert.equal((await call("/relay/test", { body: { to: "09121234567" }, headers: { "x-relay-key": KEY.slice(1) } })).status, 403);
});

test("پیش از اولین تپش: پیامک خطای شبکه می‌دهد (صدازننده شبیه‌سازی می‌کند) و «تستِ درگاه» می‌گوید پل وصل نشده", { skip: SKIP }, async () => {
  await assert.rejects(sendSms(env, "09121234567", "x"), (e) => e.code === "network" && /هنوز وصل نشده/.test(e.message));
  const c = await smsCheck(env);
  assert.deepEqual([c.ok, c.code, c.provider], [false, "network", "ippanel"]);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM sms_outbox").get().n, 0, "چیزی در صف نماند");
});

test("تپش، صف، گرفتنِ یک‌باره و نتیجه — بدنهٔ همان /api/send بی کلید؛ بعد از نتیجه بدنه پاک می‌شود", { skip: SKIP }, async () => {
  const b = await sync({ beat: { credit: 3000000, gift: 0, credit_at: "2026-10-04 07:20:54", ver: "1" } });
  assert.deepEqual([b.status, b.data.ok, b.data.jobs, b.data.poll], [200, true, [], 5]);
  const c = await smsCheck(env);
  assert.deepEqual([c.ok, c.credit, c.relay.live], [true, 3000000, true]);

  const r = await sendSms(env, "0910 420 1638", "سلام، استعلام.");
  assert.deepEqual([r.ok, r.provider, r.relay, r.to], [true, "ippanel", true, "+989104201638"]);
  const id = Number(r.ref.slice(1));
  assert.equal(r.ref, `q${id}`);
  assert.equal(row(id).status, "queued");

  const s1 = await sync();
  assert.equal(s1.data.jobs.length, 1);
  assert.deepEqual(s1.data.jobs[0].body, { sending_type: "webservice", from_number: "+983000505", message: "سلام، استعلام.", params: { recipients: ["+989104201638"] } });
  assert.equal(row(id).status, "sending");
  assert.deepEqual((await sync()).data.jobs, [], "دوباره گرفته نمی‌شود");

  await sync({ results: [{ id, ok: true, ref: "1123544999" }] });
  const done = row(id);
  assert.deepEqual([done.status, done.ref, done.body, done.error], ["sent", "1123544999", null, null]);
  /* نتیجهٔ تکراری اثری ندارد */
  await sync({ results: [{ id, ok: false, error: "x" }] });
  assert.equal(row(id).status, "sent");
});

test("ردیفِ sp_sms: شکستِ دیرآمدهٔ پل روی همان ردیف می‌نشیند؛ موفق شناسهٔ IPPanel را می‌گیرد", { skip: SKIP }, async () => {
  const t = Date.now();
  const mk = () => DB.raw.prepare("INSERT INTO sp_sms (phone_id,kind,body,at,via,status,ref) VALUES (1,'rfq','x',?, 'ippanel','queued',NULL)").run(t).lastInsertRowid;
  const a = Number(mk()), b = Number(mk());
  const ra = await sendSms(env, "09121234567", "یک", { smsId: a });
  const rb = await sendSms(env, "09121234568", "دو", { smsId: b, otp: "123456" });
  DB.raw.prepare("UPDATE sp_sms SET ref=? WHERE id=?").run(ra.ref, a);
  const jobs = (await sync()).data.jobs;
  assert.deepEqual(jobs.map((j) => j.phone), ["+989121234567", "+989121234568"]);
  await sync({ results: [{ id: jobs[0].id, ok: false, error: "اعتبار یا سقفِ ارسال کافی نیست", code: "quota" }, { id: jobs[1].id, ok: true, ref: "777" }] });
  const sa = DB.raw.prepare("SELECT status, error, ref FROM sp_sms WHERE id=?").get(a), sb = DB.raw.prepare("SELECT status, ref FROM sp_sms WHERE id=?").get(b);
  assert.deepEqual([sa.status, sa.error, sa.ref], ["failed", "اعتبار یا سقفِ ارسال کافی نیست", ra.ref]);
  assert.deepEqual([sb.status, sb.ref], ["queued", "777"]);
  assert.equal(rb.relay, true);
});

test("Cron: صفِ کهنه منقضی، گرفته‌شدهٔ بی‌نتیجه «نامعلوم»، و قطعیِ پل فقط یک هشدار تا برگشتن", { skip: SKIP }, async () => {
  const t = Date.now();
  const old = Number(DB.raw.prepare("INSERT INTO sms_outbox (at,phone,body,kind) VALUES (?,?,?,?)").run(t - RELAY_EXPIRE_MS - 1000, "+989120000001", "{\"x\":1}", "webservice").lastInsertRowid);
  assert.deepEqual((await sync()).data.jobs, [], "پیامکِ کهنه گرفته نمی‌شود");
  const st = Number(DB.raw.prepare("INSERT INTO sms_outbox (at,phone,body,kind,status,claimed_at) VALUES (?,?,?,?,'sending',?)").run(t, "+989120000002", "{}", "webservice", t - RELAY_STALE_MS - 1000).lastInsertRowid);
  const alarms = [];
  const raise = async (e, a) => { alarms.push(a); return { id: alarms.length }; };
  let r = await relayWatch(env, raise);
  assert.deepEqual([r.expired, r.stale, r.down], [1, 1, false]);
  assert.deepEqual([row(old).status, row(old).body, row(st).status], ["failed", null, "unknown"]);
  /* پل ۱۰ دقیقه پیش آخرین بار آمد */
  const v = JSON.parse(DB.raw.prepare("SELECT value FROM settings WHERE key='smsRelay'").get().value);
  DB.raw.prepare("UPDATE settings SET value=? WHERE key='smsRelay'").run(JSON.stringify({ ...v, seen: t - 10 * 60e3 }));
  r = await relayWatch(env, raise);
  assert.equal(r.down, true);
  await relayWatch(env, raise);
  assert.equal(alarms.length, 1, "یک هشدار");
  assert.match(alarms[0].title, /پلِ پیامک قطع است/);
  await assert.rejects(sendSms(env, "09121234567", "x"), (e) => e.code === "network" && /دقیقه است وصل نشده/.test(e.message));
  /* برگشت: تپشِ تازه هشدار را دوباره مسلح می‌کند */
  await sync({ beat: { credit: 10 } });
  assert.equal(JSON.parse(DB.raw.prepare("SELECT value FROM settings WHERE key='smsRelay'").get().value).alarmed, undefined);
});

test("پشتیبان‌گیری: طرحِ جدول‌ها با کلیدِ اصلیِ WITHOUT ROWID؛ صفحه‌ها همهٔ ردیف‌ها را یک بار می‌دهند", { skip: SKIP }, async () => {
  const s = (await call("/relay/backup/schema", { headers: RK })).data;
  const ob = s.tables.find((x) => x.name === "sms_outbox"), usd = s.tables.find((x) => x.name === "usd_rates");
  assert.deepEqual([ob.rowid, usd.rowid, usd.pk], [true, false, ["jday"]]);
  assert.ok(!s.tables.some((x) => /^(sqlite_|_cf_)/.test(x.name)));
  assert.ok(s.indexes.some((x) => x.name === "ix_smsout_status"));

  DB.raw.exec("DELETE FROM usd_rates");
  for (let i = 1; i <= 7; i++) DB.raw.prepare("INSERT INTO usd_rates (jday,rate,src,at) VALUES (?,?,?,?)").run(`14050${i}01`, 1000 * i, "test", i);
  const pages = async (t, n) => {
    const got = []; let after = null, k = 0;
    do {
      const q = `/relay/backup/rows?t=${t}&n=${n}${after ? `&after=${encodeURIComponent(after)}` : ""}`;
      const p = (await call(q, { headers: RK })).data;
      got.push(...p.rows.map((r) => Object.fromEntries(p.cols.map((c, i) => [c, r[i]]))));
      after = p.next; k++;
    } while (after && k < 50);
    return got;
  };
  const u = await pages("usd_rates", 3);
  assert.deepEqual(u.map((x) => x.jday), ["14050101", "14050201", "14050301", "14050401", "14050501", "14050601", "14050701"]);
  const ids = DB.raw.prepare("SELECT id FROM sms_outbox ORDER BY id").all().map((x) => x.id);
  const o = await pages("sms_outbox", 2);
  assert.deepEqual(o.map((x) => x.id), ids);
  assert.deepEqual(o.map((x) => x.__rowid), ids, "rowid هم می‌آید");
  assert.equal((await call("/relay/backup/rows?t=nope", { headers: RK })).status, 404);
  assert.equal((await call(`/relay/backup/rows?t=${encodeURIComponent('sms_outbox"; DROP TABLE x; --')}`, { headers: RK })).status, 404);
});

test("تب «پشتیبانی» صفحهٔ اول: «📶 پیامک و پشتیبان‌گیری» با رمز تب (یا کد مدیر) و «📨 پیامک آزمایشی»؛ بی رمز ۴۰۱", { skip: SKIP }, async () => {
  await sync({ beat: { credit: 1800000, backup: { at: Date.now(), ok: true, tables: 114, rows: 142217, bytes: 1 } } });
  assert.equal((await call("/site/sms")).status, 401);
  assert.equal((await call("/site/sms", { headers: { "X-Site-Code": "0000" } })).status, 401);
  const s = await call("/site/sms", { headers: { "X-Site-Code": "4321" } });
  assert.deepEqual([s.status, s.data.provider, s.data.ready, s.data.from, s.data.relay.live, s.data.relay.credit, s.data.relay.backup.rows], [200, "ippanel", true, "+983000505", true, 1800000, 142217]);
  assert.ok(!JSON.stringify(s.data).includes(KEY));
  const n0 = DB.raw.prepare("SELECT COUNT(*) AS n FROM sms_outbox WHERE status='queued'").get().n;
  const t = await call("/site/sms/test", { body: { to: "09104201638" }, headers: { "X-Site-Code": "4321" } });
  assert.deepEqual([t.status, t.data.relay, t.data.to], [200, true, "+989104201638"]);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM sms_outbox WHERE status='queued'").get().n, n0 + 1);
  assert.equal((await call("/site/sms/test", { body: { to: "09104201638" } })).status, 401);
  assert.equal((await call("/site/sms/test", { body: { to: "021" }, headers: { "X-Site-Code": "4321" } })).status, 400);
  await sync();
});

test("متنِ خراب از رمزگذاری (UTF-8 خوانده‌شده با Windows-1252) هرگز به صف نمی‌رود؛ فارسی و لاتینِ درست می‌روند", { skip: SKIP }, async () => {
  const fa = "گزارش سامانه آریانا: سامانه سالم است. پشتیبان‌گیری شبانه هم سالم است.";
  const bad = new TextDecoder("windows-1252").decode(new TextEncoder().encode(fa));   /* همان «Ú¯Ø²Ø§Ø±Ø´…» که آبان ۱۴۰۵ رسید */
  assert.match(bad, /^Ú¯Ø²/);
  assert.deepEqual([garbled(bad), garbled(fa), garbled("Où est le café ? Très bien, merci."), garbled("Ø"), garbled(null)], [true, false, false, false, false]);
  await sync({ beat: { credit: 10 } });
  const n0 = DB.raw.prepare("SELECT COUNT(*) AS n FROM sms_outbox").get().n;
  await assert.rejects(sendSms(env, "09104201638", bad), (e) => e.code === "bad_text");
  const t = await call("/relay/test", { body: { to: "09104201638", text: bad }, headers: RK });
  assert.equal(t.status, 400);
  assert.match(t.data.error, /خراب/);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM sms_outbox").get().n, n0, "هیچ پیامکِ خرابی در صف ننشست");
  const ok = await call("/relay/test", { body: { to: "09104201638", text: fa }, headers: RK });
  assert.equal(ok.status, 200);
  const jobs = (await sync()).data.jobs;
  assert.equal(jobs[jobs.length - 1].body.message, fa, "همان حروفِ فارسی، بی‌تغییر");
});

test("الگوهای IPPanel: تعریف برای پل؛ فقط الگوی «active» با همان hash و همهٔ متغیرها؛ رمزِ ورود ← otp؛ متغیر حداکثر ۴۰ نویسه", { skip: SKIP }, async () => {
  assert.equal((await call("/relay/patterns", { headers: { "x-relay-key": "nope" } })).status, 403);
  const P = (await call("/relay/patterns", { headers: RK })).data.patterns;
  assert.deepEqual(P.map((p) => p.key), ["otp", "invite", "tender_invite", "tender_note", "thanks", "alarm", "test", "report"]);
  const def = (k) => P.find((p) => p.key === k);
  assert.deepEqual(def("invite").vars, ["k", "code"]);
  assert.equal(def("invite").message, "شرکت تونل سد آریانا درخواست خرید دارد.\nورود به پنل تأمین‌کنندگان: https://site.test/tamin-poshtibani/supplier#k=%k%\nرمز ورود: %code%");
  assert.ok(P.every((p) => /^[0-9a-z]+$/.test(p.hash) && p.description && p.title.startsWith("ariana-")));
  const last = async () => (await sync()).data.jobs.pop();
  const INV = { pattern: { key: "invite", params: { k: "abc123def456", code: "123456" } } };

  await sync({ beat: { credit: 10, patterns: { invite: { code: "pinv1", status: "pending", hash: def("invite").hash } } } });
  await sendSms(env, "09121234567", "متن کامل", INV);
  let j = await last();
  assert.deepEqual([j.body.sending_type, j.body.message, j.kind], ["webservice", "متن کامل", "webservice"], "در انتظار تأیید: همان متن");

  await sync({ beat: { credit: 10, patterns: { invite: { code: "pinv1", status: "active", hash: def("invite").hash }, test: { code: "ptest", status: "active", hash: "old" } } } });
  await sendSms(env, "09121234567", "متن کامل", INV);
  j = await last();
  assert.deepEqual([j.body.sending_type, j.body.code, j.body.params, j.body.recipients, j.kind], ["pattern", "pinv1", { k: "abc123def456", code: "123456" }, ["+989121234567"], "pattern:invite"]);
  assert.equal(j.body.message, undefined);
  await sendSms(env, "09121234567", relayTestText(), { pattern: relayTestPattern() });
  assert.equal((await last()).body.sending_type, "webservice", "hashِ کهنه: الگو به کار نمی‌رود");
  await sendSms(env, "09121234567", "x", { pattern: { key: "invite", params: { k: "abc" } } });
  assert.equal((await last()).body.sending_type, "webservice", "متغیرِ خالی: همان متن");

  await sync({ beat: { credit: 10, patterns: { otp: { code: "potp", status: "active", hash: def("otp").hash }, alarm: { code: "pal", status: "active", hash: def("alarm").hash } } } });
  await sendSms(env, "09121234567", "رمز ورود: 654321", { otp: "654321" });
  j = await last();
  assert.deepEqual([j.body.code, j.body.params], ["potp", { code: "654321" }]);
  await sendSms(env, "09121234567", "x", { pattern: { key: "alarm", params: { title: "ا".repeat(60) } } });
  j = await last();
  assert.equal(j.body.params.title.length, 40);
  assert.ok(j.body.params.title.endsWith("…"));
  const s = (await call("/support/sms", { headers: SUP })).data.relay.patterns;
  assert.deepEqual(["otp", "alarm", "invite"].map((k) => s.find((p) => p.key === k).status), ["active", "active", "none"], "هر تپش فهرستِ کامل است");
  await sync({ beat: { credit: 10, patterns: {} } });
});

test("نتیجهٔ نهاییِ IPPanel: «رد شده» ← پیامک «نرفت» (sp_sms) و یک هشدار در ساعت؛ «پایان یافته» ← delivered؛ تکرار اثری ندارد", { skip: SKIP }, async () => {
  DB.raw.exec("DELETE FROM settings WHERE key='smsRejectAlarm'");
  const sid = Number(DB.raw.prepare("INSERT INTO sp_sms (phone_id,kind,body,at,via,status) VALUES (1,'rfq','x',?, 'ippanel','queued')").run(Date.now()).lastInsertRowid);
  await sendSms(env, "09121234567", "یک", { smsId: sid });
  await sendSms(env, "09121234568", "دو");
  const [a, b] = (await sync()).data.jobs.slice(-2);
  await sync({ results: [{ id: a.id, ok: true, ref: "11" }, { id: b.id, ok: true, ref: "12" }] });
  const alarms = () => DB.raw.prepare("SELECT COUNT(*) AS n FROM alarms WHERE kind='sms_rejected'").get().n;
  const n0 = alarms();
  await sync({ deliveries: [{ id: a.id, state: "rejected", status: "رد شده" }, { id: b.id, state: "done", status: "پایان یافته" }] });
  assert.deepEqual([row(a.id).status, row(b.id).status], ["rejected", "delivered"]);
  const sp = DB.raw.prepare("SELECT status, error FROM sp_sms WHERE id=?").get(sid);
  assert.equal(sp.status, "failed");
  assert.match(sp.error, /IPPanel پیامک را رد کرد/);
  assert.equal(alarms(), n0 + 1);
  assert.match(DB.raw.prepare("SELECT body FROM alarms WHERE kind='sms_rejected' ORDER BY id DESC LIMIT 1").get().body, /0912…4567/);
  await sendSms(env, "09121234569", "سه");
  const c = (await sync()).data.jobs.pop();
  await sync({ results: [{ id: c.id, ok: true, ref: "13" }] });
  await sync({ deliveries: [{ id: c.id, state: "rejected" }] });
  assert.equal(row(c.id).status, "rejected");
  assert.equal(alarms(), n0 + 1, "ساعتی یک هشدار");
  await sync({ deliveries: [{ id: b.id, state: "rejected" }, { id: 999999, state: "rejected" }] });
  assert.equal(row(b.id).status, "delivered", "نتیجهٔ دوباره اثری ندارد");
});

test("پنل پشتیبانی: وضعیتِ پل در «درگاه پیامک» و «📨 پیامک آزمایشی»؛ /relay/test هم از همان راهِ سامانه", { skip: SKIP }, async () => {
  await sync({ beat: { credit: 2500000, backup: { at: Date.now(), ok: true, tables: 113, rows: 420000, bytes: 1 } } });
  const s = (await call("/support/sms", { headers: SUP })).data;
  assert.deepEqual([s.provider, s.ready, s.relay.live, s.relay.credit, s.relay.backup.tables], ["ippanel", true, true, 2500000, 113]);
  assert.ok(!JSON.stringify(s).includes(KEY));
  const n0 = DB.raw.prepare("SELECT COUNT(*) AS n FROM sms_outbox WHERE status='queued'").get().n;
  const t1 = await call("/support/sms/test", { body: { to: "09104201638" }, headers: SUP });
  assert.deepEqual([t1.status, t1.data.relay, t1.data.to], [200, true, "+989104201638"]);
  const t2 = await call("/relay/test", { body: { to: "09104201638" }, headers: RK });
  assert.equal(t2.status, 200);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM sms_outbox WHERE status='queued'").get().n, n0 + 2);
  const jobs = (await sync()).data.jobs;
  assert.match(jobs[jobs.length - 1].body.message, /^پیامک آزمایشی سامانهٔ تأمین آریانا — ساعت /);
  assert.equal((await call("/support/sms/test", { body: { to: "02188881234" }, headers: SUP })).status, 400, "شمارهٔ ثابت نه");
});
