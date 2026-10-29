/* ============================================================
   لایهٔ درگاه پیامک — worker/sms.js (مهر ۱۴۰۵)

   SMS_PROVIDER درگاه را عوض می‌کند و بیرونِ sms.js همان sendSms / smsReady / SmsError است:
   • IPPanel (REST «Edge»): پیامکِ ساده (webservice) با خطِ فرستنده، الگوی رمز (pattern) برای «ارسال رمز» و رمزِ مناقصه،
     اعتبارِ حساب برای «تستِ درگاه» بی پیامک؛ کلید با Authorization و بی پیشوند؛ گیرنده و خط E.164
   • خطاها: کلید (۴۰۱ / «400-1»)، اعتبار و سقف (۴۰۲ یا متنِ پیام)، ردِ درخواست (۴۲۲ — «اعتبارسنجی» اعتبارِ حساب نیست)، شبکه،
     پاسخِ نامفهوم — و پیامکی که نرفت همان شبیه‌سازیِ قبلی می‌شود
   • پنل پشتیبانی: وضعیتِ فقط‌خواندنی (بی کلید) و «تستِ درگاه»؛ مناقصه: کلید و خطِ جدا، کلیدِ TextBeeِ قدیمی کنار می‌رود
   • TextBee پیش‌فرض می‌ماند؛ «تستِ درگاه»ش گوشی‌های حساب
   همهٔ درگاه‌ها بدلی‌اند (https://sms.test) — هیچ کلیدِ واقعی‌ای این‌جا نیست.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import { sendSms, smsReady, smsStatus, smsCheck, smsProvider, smsEnvWith, lineE164, viaSent, viaLabel } from "../../../worker/sms.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const IP = { SMS_PROVIDER: "ippanel", IPPANEL_API_KEY: "ip-test-key", IPPANEL_FROM: "3000505", IPPANEL_API_BASE: "https://sms.test/v1" };
const env = { DB, MANAGER_CODE: "4321", COMPANY: "تونل سد آریانا", SITE_ORIGIN: "https://site.test", ...IP };

/* ---------- درگاهِ بدلی ---------- */
const calls = [];
let reply = null;   /* (call) => Response — پاسخِ ویژهٔ آزمونِ بعدی؛ null یعنی پاسخِ موفقِ پیش‌فرض */
const R = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const META_OK = { status: true, message: "انجام شد", message_parameters: [], message_code: "200-1" };
const CREDIT = { credit: 6084722932.705052, yesterday_credit: 195251925510.55, gift: 0, gift_expires_at: null, updated_at: "2026-10-19 09:00:00" };
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (!u.startsWith("https://sms.test/")) throw new Error(`fetch بیرونیِ پیش‌بینی‌نشده: ${u}`);
  const c = { url: u, method: init.method || "GET", headers: init.headers || {}, body: init.body ? JSON.parse(init.body) : null };
  calls.push(c);
  if (reply) return reply(c);
  if (u === "https://sms.test/v1/api/send") return R({ data: { message_outbox_ids: [1123544000 + calls.length] }, meta: META_OK });
  if (u === "https://sms.test/v1/api/payment/credit/mine") return R({ data: CREDIT, meta: META_OK });
  if (u === "https://sms.test/api/v1/gateway/devices") return R({ data: [{ _id: "dev-1", enabled: true, brand: "Samsung", model: "A15", lastHeartbeat: "2026-10-19T08:00:00Z" }, { _id: "dev-2", enabled: false, brand: "Xiaomi", model: "Note" }] });
  if (u === "https://sms.test/api/v1/gateway/send-sms") return R({ data: { success: true, smsBatchId: "tb-1" } });
  return R({ error: "no" }, 404);
};
const since = (n) => calls.slice(n);
const sends = (n) => since(n).filter((c) => c.url.endsWith("/api/send"));
/** پاسخِ خطای IPPanel به شکلِ مستندِ Edge */
const ipErr = (status, message, code, errors) => () => R({ data: null, meta: { status: false, message, message_parameters: [], message_code: code, errors: errors || {} } }, status);

const pend = [];
const ctx = { waitUntil: (p) => pend.push(p) };
async function call(path, { method, body, headers } = {}) {
  const h = { ...(headers || {}) };
  let b;
  if (body !== undefined) { b = JSON.stringify(body); h["Content-Type"] = "application/json"; }
  const res = await route(new Request(`https://site.test/tamin-poshtibani/api${path}`, { method: method || (b !== undefined ? "POST" : "GET"), headers: h, body: b }), env, ctx);
  while (pend.length) await Promise.all(pend.splice(0));
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch (_) { data = text; }
  return { status: res.status, data };
}
const EX = { "X-Expert-Code": "9001" };
let SUP = {};
if (DB) {
  await ensureSchema(env);
  const t = Date.now();
  DB.raw.exec("DELETE FROM experts");
  DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,created_at) VALUES (1,'کارشناس یک','آقای یک','9001',1,1,?)").run(t);
  DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES ('R-1','1405/07/27','پروژهٔ یک')").run();
  DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,dispatched_at,created_at) VALUES (1,'R-1',1,?,?)").run(t, t);
  DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,title,qty,unit,state,assignment_id) VALUES (11,'R-1','a',1,'پیچ M8',100,'عدد','open',1)").run();
  SUP = { "X-Support-Token": (await call("/support/setup", { body: { pass: "9753" } })).data.token };
}

/* ---------------- لایهٔ درگاه، بی پایگاه داده ---------------- */
test("درگاهِ فعال و آمادگی: textbee پیش‌فرض؛ ippanel کلید و خطِ فرستنده می‌خواهد؛ نامِ ناشناخته هیچ پیامکی نمی‌فرستد؛ وضعیت بی کلید", () => {
  assert.equal(smsProvider({}), "textbee");
  assert.equal(smsReady({}), false);
  assert.equal(smsReady({ TEXTBEE_API_KEY: "tbk" }), true);
  assert.equal(smsProvider({ SMS_PROVIDER: " IPPanel " }), "ippanel", "کوچک‌حرف و بی فاصله");
  assert.equal(smsReady({ SMS_PROVIDER: "ippanel", TEXTBEE_API_KEY: "tbk" }), false, "کلیدِ TextBee برای IPPanel بس نیست");
  assert.equal(smsReady({ SMS_PROVIDER: "ippanel", IPPANEL_API_KEY: "k" }), false, "بی خطِ فرستنده نه");
  assert.equal(smsReady(IP), true);
  assert.equal(smsProvider({ SMS_PROVIDER: "faraz" }), null);
  assert.equal(smsReady({ SMS_PROVIDER: "faraz", TEXTBEE_API_KEY: "tbk", IPPANEL_API_KEY: "k", IPPANEL_FROM: "1" }), false);
  const st = smsStatus({ SMS_PROVIDER: "ippanel", IPPANEL_API_KEY: "secret-key-xyz" });
  assert.deepEqual([st.provider, st.label, st.ready, st.missing, st.dev_fa], ["ippanel", "IPPanel", false, ["IPPANEL_FROM"], "خط فرستنده"]);
  assert.ok(!JSON.stringify(st).includes("secret-key-xyz"), "کلید هیچ‌جا");
  const full = smsStatus({ ...IP, IPPANEL_PATTERN_OTP: "otp-1" });
  assert.deepEqual([full.ready, full.from, full.pattern, full.pattern_var], [true, "+983000505", "otp-1", "code"]);
  assert.deepEqual(full.others, [{ provider: "textbee", label: "TextBee", ready: false, set: false, missing: ["TEXTBEE_API_KEY"] }], "درگاه‌های غیرفعال، بی کلید");
  assert.deepEqual(smsStatus({ IPPANEL_API_KEY: "k" }).others, [{ provider: "ippanel", label: "IPPanel", ready: false, set: true, missing: ["IPPANEL_FROM"] }]);
  assert.match(smsStatus({ SMS_PROVIDER: "faraz" }).note, /شناخته نیست/);
  assert.deepEqual([lineE164("3000505"), lineE164("03000505"), lineE164("983000505"), lineE164("+983000505"), lineE164("۹۰۰۰۵۱۲۳"), lineE164("")],
    ["+983000505", "+983000505", "+983000505", "+983000505", "+9890005123", ""]);
  /* کلید و «دستگاه»ِ جدا (مناقصه) روی همان درگاهِ فعال */
  const e2 = smsEnvWith(IP, { key: "k2", device: "+985000123" });
  assert.deepEqual([e2.IPPANEL_API_KEY, e2.IPPANEL_FROM, e2.TEXTBEE_API_KEY], ["k2", "+985000123", undefined]);
  const e3 = smsEnvWith({ TEXTBEE_API_KEY: "a" }, { key: "b", device: "d" });
  assert.deepEqual([e3.TEXTBEE_API_KEY, e3.TEXTBEE_DEVICE_ID], ["b", "d"]);
  assert.deepEqual([viaSent("ippanel"), viaSent("textbee"), viaSent("sim"), viaSent("hold"), viaSent(null)], [true, true, false, false, false]);
  assert.deepEqual([viaLabel("ippanel"), viaLabel("textbee"), viaLabel("sim")], ["IPPanel", "TextBee", null]);
});

test("IPPanel: پیامکِ ساده — POST {پایه}/api/send با Authorization خامِ کلید؛ webservice، خطِ E.164، گیرندهٔ +98؛ شناسهٔ outbox", async () => {
  const n = calls.length;
  const r = await sendSms(IP, "0912 123 4567", "سلام، استعلام.");
  const [c] = since(n);
  assert.deepEqual([c.method, c.url], ["POST", "https://sms.test/v1/api/send"]);
  assert.equal(c.headers.Authorization, "ip-test-key", "خودِ کلید، بی Bearer و بی پیشوند");
  assert.equal(c.headers["Content-Type"], "application/json");
  assert.deepEqual(c.body, { sending_type: "webservice", from_number: "+983000505", message: "سلام، استعلام.", params: { recipients: ["+989121234567"] } });
  assert.deepEqual(r, { ok: true, provider: "ippanel", ref: String(1123544000 + calls.length), to: "+989121234567" });
  /* رمز بی الگو: همان متنِ کامل */
  const n2 = calls.length;
  await sendSms(IP, "09121234567", "رمز ورود: 123456", { otp: "123456" });
  assert.equal(since(n2)[0].body.sending_type, "webservice");
  /* شمارهٔ ثابت: هیچ درخواستی نمی‌رود */
  const n3 = calls.length;
  await assert.rejects(sendSms(IP, "02188881234", "x"), (e) => e.code === "bad_number");
  await assert.rejects(sendSms({ SMS_PROVIDER: "ippanel", IPPANEL_API_KEY: "k" }, "09121234567", "x"), (e) => e.code === "off");
  assert.equal(calls.length, n3);
});

test("IPPanel: الگوی رمز — sending_type pattern با code و params، فقط وقتی رمز (otp) است و الگو ست شده", async () => {
  const e = { ...IP, IPPANEL_PATTERN_OTP: "otp-pat-1", IPPANEL_PATTERN_VAR: "verification-code" };
  const n = calls.length;
  const r = await sendSms(e, "+98 912 000 0001", "رمز ورود: 654321\nلینک…", { otp: "654321" });
  assert.deepEqual(since(n)[0].body, { sending_type: "pattern", from_number: "+983000505", code: "otp-pat-1", recipients: ["+989120000001"], params: { "verification-code": "654321" } });
  assert.equal(r.pattern, true);
  const n2 = calls.length;
  await sendSms({ ...IP, IPPANEL_PATTERN_OTP: "otp-pat-1" }, "09120000001", "x", { otp: "111222" });
  assert.deepEqual(since(n2)[0].body.params, { code: "111222" }, "نامِ پیش‌فرضِ متغیر: code");
  const n3 = calls.length;
  await sendSms(e, "09120000001", "استعلام قیمت");
  assert.equal(since(n3)[0].body.sending_type, "webservice", "پیامکِ بی رمز همیشه ساده");
});

test("IPPanel: خطاها — کلید (۴۰۱، «400-1»)، اعتبار (متنِ پیام یا ۴۰۲)، ردِ درخواست (۴۲۲؛ «اعتبارسنجی» اعتبارِ حساب نیست)، پاسخِ نامفهوم و شبکه", async () => {
  const code = async (r) => { reply = r; try { await sendSms(IP, "09121234567", "x"); return "sent"; } catch (e) { return [e.code, e.message, e.status]; } finally { reply = null; } };
  const auth = await code(ipErr(401, "اطلاعات وارد شده صحیح نمی باشد", "400-1"));
  assert.equal(auth[0], "auth");
  assert.match(auth[1], /کلید IPPanel پذیرفته نشد \(اطلاعات وارد شده صحیح نمی باشد\)/);
  assert.equal((await code(ipErr(200, "اطلاعات وارد شده صحیح نمی باشد", "400-1")))[0], "auth", "۲۰۰ با status=false و «400-1»");
  const quota = await code(ipErr(422, "اعتبار شما برای ارسال کافی نیست", "400-5"));
  assert.equal(quota[0], "quota");
  assert.match(quota[1], /اعتبار یا سقفِ ارسالِ پنل پیامک \(IPPanel\) کافی نیست/);
  assert.equal((await code(ipErr(402, "Payment Required", "402")))[0], "quota");
  assert.equal((await code(ipErr(422, "insufficient balance", "400-9")))[0], "quota");
  const bad = await code(ipErr(422, "تکمیل فیلد پیام الزامی است", "400-2", { message: ["تکمیل فیلد پیام الزامی است"] }));
  assert.deepEqual([bad[0], bad[2]], ["rejected", 422]);
  assert.match(bad[1], /IPPanel درخواست را نپذیرفت \(تکمیل فیلد پیام الزامی است\)/);
  assert.equal((await code(ipErr(422, "خطای اعتبارسنجی داده‌ها", "400-2", { from_number: ["شماره فرستنده معتبر نیست"] })))[0], "rejected", "«اعتبارسنجی» یعنی فیلدِ نادرست");
  assert.equal((await code(() => R({ message: "Server Error" }, 500)))[0], "error");
  assert.match((await code(() => new Response("<html>gateway</html>", { status: 200 })))[1], /پاسخِ نامفهومِ IPPanel/, "۲۰۰ بی meta و بی شناسه رفته حساب نمی‌شود");
  const net = await code(() => { throw new TypeError("fetch failed"); });
  assert.deepEqual([net[0], /درگاه پیامک در دسترس نبود/.test(net[1])], ["network", true]);
});

test("«تستِ درگاه» بی پیامک: IPPanel اعتبارِ حساب (GET /api/payment/credit/mine)؛ کلیدِ نادرست و اعتبارِ صفر؛ TextBee گوشی‌های حساب", async () => {
  let n = calls.length;
  const ok = await smsCheck(IP);
  const [c] = since(n);
  assert.deepEqual([c.method, c.url, c.headers.Authorization], ["GET", "https://sms.test/v1/api/payment/credit/mine", "ip-test-key"]);
  assert.deepEqual([ok.ok, ok.provider, ok.label, ok.credit, ok.gift, ok.at], [true, "ippanel", "IPPanel", CREDIT.credit, 0, "2026-10-19 09:00:00"]);
  assert.ok(!since(n).some((x) => x.url.endsWith("/api/send")), "هیچ پیامکی نرفت");
  reply = ipErr(401, "اطلاعات وارد شده صحیح نمی باشد", "400-1");
  const bad = await smsCheck(IP);
  reply = () => R({ data: { ...CREDIT, credit: 0 }, meta: META_OK });
  const empty = await smsCheck(IP);
  reply = null;
  assert.deepEqual([bad.ok, bad.code], [false, "auth"]);
  assert.deepEqual([empty.ok, empty.credit], [false, 0]);
  assert.match(empty.error, /اعتبارِ پنل پیامک تمام شده/);
  const off = await smsCheck({ SMS_PROVIDER: "ippanel" });
  assert.deepEqual([off.ok, off.code], [false, "off"]);
  assert.match(off.error, /IPPANEL_API_KEY، IPPANEL_FROM/);
  /* کلیدِ IPPanel پیش از عوض کردنِ SMS_PROVIDER (درگاهِ فعال هنوز TextBee) */
  n = calls.length;
  const pre = await smsCheck({ TEXTBEE_API_KEY: "tbk", TEXTBEE_API_BASE: "https://sms.test", ...IP, SMS_PROVIDER: "textbee" }, "ippanel");
  assert.deepEqual([pre.ok, pre.provider, pre.credit, since(n)[0].url], [true, "ippanel", CREDIT.credit, "https://sms.test/v1/api/payment/credit/mine"]);
  assert.deepEqual([(await smsCheck(IP, "faraz")).ok, (await smsCheck(IP, "faraz")).code], [false, "off"]);
  /* TextBee: GET /devices با x-api-key */
  const TB = { TEXTBEE_API_KEY: "tbk", TEXTBEE_API_BASE: "https://sms.test" };
  n = calls.length;
  const tb = await smsCheck(TB);
  assert.deepEqual([since(n)[0].url, since(n)[0].headers["x-api-key"]], ["https://sms.test/api/v1/gateway/devices", "tbk"]);
  assert.deepEqual([tb.ok, tb.provider, tb.devices, tb.enabled], [true, "textbee", 2, 1]);
  const dev = await smsCheck({ ...TB, TEXTBEE_DEVICE_ID: "dev-1" });
  assert.deepEqual([dev.ok, dev.device], [true, "Samsung A15"]);
  assert.equal((await smsCheck({ ...TB, TEXTBEE_DEVICE_ID: "dev-2" })).ok, false, "گوشیِ خاموش");
  assert.match((await smsCheck({ ...TB, TEXTBEE_DEVICE_ID: "nope" })).error, /در این حساب نیست/);
  /* پیامکِ TextBee همان رفتارِ پیشین */
  n = calls.length;
  const s = await sendSms(TB, "09121234567", "سلام");
  assert.deepEqual([since(n)[0].url, since(n)[0].body], ["https://sms.test/api/v1/gateway/send-sms", { recipients: ["+989121234567"], message: "سلام" }]);
  assert.deepEqual(s, { ok: true, provider: "textbee", ref: "tb-1", to: "+989121234567" });
});

/* ---------------- سراسری: مکاتبات، رمز، پشتیبانی و مناقصه ---------------- */
const keyOf = (sms) => /#k=([0-9a-f]{12})/.exec(sms)[1];

test("مکاتبات با IPPanel: استعلام پیامکِ ساده؛ «ارسال رمز» با الگوی رمز و ورود با همان رمز؛ اعتبارِ تمام‌شده ← شبیه‌سازی با دلیل", { skip: SKIP }, async () => {
  let n = calls.length;
  const r = await call("/sp/x/send", { headers: EX, body: { assignment_id: 1, item_ids: [11], supplier_name: "شرکت پیامکی", phone: "0912 123 4567", label: "فروش", text: "سلام، استعلام." } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const [s1] = sends(n);
  assert.equal(s1.body.sending_type, "webservice");
  assert.deepEqual(s1.body.params.recipients, ["+989121234567"]);
  assert.match(s1.body.message, /^شرکت .+ درخواست خرید دارد\.[\s\S]*supplier#k=[0-9a-f]{12}[\s\S]*رمز ورود: \d{6}/);
  assert.deepEqual([r.data.sms.sent, r.data.sms.via, r.data.sms.text], [true, "ippanel", undefined], "رفت؛ متنِ با رمز به کارشناس برنمی‌گردد");
  const row = DB.raw.prepare("SELECT * FROM sp_sms ORDER BY id DESC LIMIT 1").get();
  assert.deepEqual([row.via, row.status, row.error], ["ippanel", "queued", null]);
  assert.match(row.ref, /^\d+$/, "شناسهٔ outbox");
  const k = keyOf(s1.body.message);

  /* «ارسال رمز»: الگوی رمز — فقط خودِ رمز در params؛ پاسخِ صفحهٔ ورود رمز ندارد و simulated=false */
  env.IPPANEL_PATTERN_OTP = "otp-pat-1";
  try {
    n = calls.length;
    const rs = await call("/sp/resend", { body: { k } });
    assert.equal(rs.status, 200, JSON.stringify(rs.data));
    assert.deepEqual([rs.data.sent, rs.data.simulated, rs.data.demo], [true, false, false], "simulated؛ demo نامِ قدیمیِ همان");
    const [p] = sends(n);
    assert.deepEqual({ ...p.body, params: undefined }, { sending_type: "pattern", from_number: "+983000505", code: "otp-pat-1", recipients: ["+989121234567"], params: undefined });
    assert.match(p.body.params.code, /^\d{6}$/);
    assert.ok(!JSON.stringify(rs.data).includes(p.body.params.code));
    assert.equal((await call("/sp/login", { body: { k, password: p.body.params.code } })).status, 200, "رمزِ الگو ورود می‌دهد");
    const pr = DB.raw.prepare("SELECT via, status, body FROM sp_sms WHERE kind='pass' ORDER BY id DESC LIMIT 1").get();
    assert.deepEqual([pr.via, pr.status], ["ippanel", "queued"]);
    assert.ok(!pr.body.includes(p.body.params.code), "رمز خام در دیتابیس نمی‌ماند");
  } finally { delete env.IPPANEL_PATTERN_OTP; }

  /* اعتبارِ پنل تمام شد: پیامک نرفت ← شبیه‌سازی (متن به کارشناس برمی‌گردد) با دلیلِ IPPanel */
  reply = ipErr(422, "اعتبار حساب کاربری کافی نمی باشد", "400-7");
  try {
    const q = await call("/sp/x/send", { headers: EX, body: { assignment_id: 1, item_ids: [11], supplier_name: "شرکت دوم", phone: "09120000002", label: "دفتر" } });
    assert.equal(q.status, 200, JSON.stringify(q.data));
    assert.equal(q.data.sms.sent, false);
    assert.match(q.data.sms.error, /اعتبار یا سقفِ ارسالِ پنل پیامک \(IPPanel\) کافی نیست/);
    assert.match(q.data.sms.text, /رمز ورود: \d{6}/, "کارشناس متن را خودش می‌رساند");
    assert.deepEqual({ ...DB.raw.prepare("SELECT via, status FROM sp_sms ORDER BY id DESC LIMIT 1").get() }, { via: "sim", status: "failed" });
  } finally { reply = null; }
});

test("پنل پشتیبانی: «درگاه پیامک» فقط‌خواندنی و بی کلید؛ «تستِ درگاه» اعتبار را می‌سنجد و پیامکی نمی‌فرستد", { skip: SKIP }, async () => {
  assert.equal((await call("/support/sms")).status, 401, "فقط پشتیبانی");
  const st = await call("/support/sms", { headers: SUP });
  assert.equal(st.status, 200);
  assert.deepEqual([st.data.provider, st.data.label, st.data.ready, st.data.missing, st.data.from, st.data.pattern], ["ippanel", "IPPanel", true, [], "+983000505", null]);
  assert.ok(!JSON.stringify(st.data).includes("ip-test-key"), "کلید به پنل نمی‌رود");
  const n = calls.length;
  const chk = await call("/support/sms/check", { headers: SUP, body: {} });
  assert.deepEqual([chk.status, chk.data.ok, chk.data.credit], [200, true, CREDIT.credit]);
  assert.equal(sends(n).length, 0, "بی پیامک");
  /* داشبوردِ کارشناس هوشمند: نامِ درگاه کنارِ «وصل است» */
  const ai = await call("/support/ai/experts", { headers: SUP });
  assert.deepEqual([ai.data.sms, ai.data.sms_label], [true, "IPPanel"]);
  /* درگاهِ غیرفعالی که کلیدش ست شده: در وضعیت می‌آید و جدا سنجیده می‌شود (کلیدِ تازه پیش از عوض کردنِ SMS_PROVIDER) */
  Object.assign(env, { TEXTBEE_API_KEY: "tbk", TEXTBEE_API_BASE: "https://sms.test" });
  try {
    assert.deepEqual((await call("/support/sms", { headers: SUP })).data.others, [{ provider: "textbee", label: "TextBee", ready: true, set: true, missing: [] }]);
    const tb = (await call("/support/sms/check", { headers: SUP, body: { provider: "textbee" } })).data;
    assert.deepEqual([tb.ok, tb.provider, tb.devices], [true, "textbee", 2]);
    assert.equal((await call("/support/sms/check", { headers: SUP, body: { provider: "nope" } })).data.code, "off");
  } finally { delete env.TEXTBEE_API_KEY; delete env.TEXTBEE_API_BASE; }
  /* درگاهِ ناقص: وضعیت می‌گوید چه چیزی ست نشده و تست پیامکی نمی‌زند */
  const from = env.IPPANEL_FROM;
  delete env.IPPANEL_FROM;
  try {
    const st2 = (await call("/support/sms", { headers: SUP })).data;
    assert.deepEqual([st2.ready, st2.missing], [false, ["IPPANEL_FROM"]]);
    const c2 = (await call("/support/sms/check", { headers: SUP, body: {} })).data;
    assert.deepEqual([c2.ok, c2.code], [false, "off"]);
  } finally { env.IPPANEL_FROM = from; }
});

test("مناقصه با IPPanel: رمزِ ورود با الگو؛ کلید و خطِ فرستندهٔ جدا («تستِ درگاه» هم با همان)؛ کلیدِ TextBeeِ قدیمی کنار می‌رود", { skip: SKIP }, async () => {
  const s0 = (await call("/support/tender-settings", { headers: SUP })).data.sms;
  assert.deepEqual([s0.ready, s0.provider, s0.dev_fa, s0.shared, s0.own_key, s0.stale], [true, "IPPanel", "خط فرستنده", true, false, null]);
  const t = await call("/support/tenders", { headers: SUP, body: { title: "پیچ", qty: 5, unit: "عدد", start_price: "50000", invites: [{ name: "فولاد", phone: "09121111111" }] } });
  assert.equal(t.status, 200, JSON.stringify(t.data));
  assert.equal((await call(`/support/tenders/${t.data.tender.id}/schedule`, { headers: SUP, body: { start_in_min: 0, duration_min: 30 } })).status, 200);
  const code = t.data.tender.code;
  /* رمزِ ورودِ مناقصه با الگوی رمز */
  env.IPPANEL_PATTERN_OTP = "otp-pat-1";
  try {
    const n = calls.length;
    const p = await call(`/tender/${code}/pass`, { body: { phone: "0912 111 1111" } });
    assert.equal(p.status, 200, JSON.stringify(p.data));
    const [pt] = sends(n).filter((c) => c.body.sending_type === "pattern");
    assert.deepEqual([pt.body.code, pt.body.recipients, pt.headers.Authorization], ["otp-pat-1", ["+989121111111"], "ip-test-key"]);
    assert.equal((await call(`/tender/${code}/login`, { body: { phone: "09121111111", pass: pt.body.params.code } })).status, 200, "همان رمز ورود می‌دهد");
  } finally { delete env.IPPANEL_PATTERN_OTP; }

  /* کلید و خطِ فرستندهٔ جدای مناقصه: «تستِ درگاه» و پیامک آزمایشی با همان */
  const s1 = (await call("/support/tender-settings", { method: "PUT", headers: SUP, body: { sms: { key: "tender-ip-key-9876", device: "5000123" } } })).data.sms;
  assert.deepEqual([s1.own_key, s1.key_tail, s1.device, s1.shared], [true, "…9876", "5000123", false]);
  let n = calls.length;
  const chk = await call("/support/tender-settings/test", { headers: SUP, body: { check: true } });
  assert.deepEqual([chk.status, chk.data.ok, chk.data.credit], [200, true, CREDIT.credit]);
  assert.deepEqual([since(n)[0].url, since(n)[0].headers.Authorization], ["https://sms.test/v1/api/payment/credit/mine", "tender-ip-key-9876"]);
  assert.equal(sends(n).length, 0, "«تستِ درگاه» پیامک نمی‌فرستد");
  n = calls.length;
  assert.equal((await call("/support/tender-settings/test", { headers: SUP, body: { phone: "09124444444" } })).status, 200);
  assert.deepEqual([sends(n)[0].headers.Authorization, sends(n)[0].body.from_number], ["tender-ip-key-9876", "+985000123"]);
  assert.equal(JSON.parse(DB.raw.prepare("SELECT value FROM settings WHERE key='tenderSms'").get().value).provider, "ippanel");

  /* کلیدِ جدای قدیمی (پیش از لایهٔ درگاه، یعنی TextBee): با IPPanel به کار نمی‌رود و پنل می‌گوید */
  DB.raw.prepare("UPDATE settings SET value=? WHERE key='tenderSms'").run(JSON.stringify({ key: "tb-old-key-1111", device: "old-phone" }));
  const s2 = (await call("/support/tender-settings", { headers: SUP })).data.sms;
  assert.deepEqual([s2.own_key, s2.key_tail, s2.device, s2.shared, s2.stale], [false, "", "", true, "TextBee"]);
  n = calls.length;
  await call("/support/tender-settings/test", { headers: SUP, body: { phone: "09124444444" } });
  assert.deepEqual([sends(n)[0].headers.Authorization, sends(n)[0].body.from_number], ["ip-test-key", "+983000505"], "همان درگاهِ مکاتبات");
  /* ذخیرهٔ تازه با IPPanel، کلیدِ قدیمیِ TextBee را با خودش نمی‌آورد */
  const s3 = (await call("/support/tender-settings", { method: "PUT", headers: SUP, body: { sms: { device: "" } } })).data.sms;
  assert.deepEqual([s3.own_key, s3.stale], [false, null]);
  assert.deepEqual(JSON.parse(DB.raw.prepare("SELECT value FROM settings WHERE key='tenderSms'").get().value), { device: "", provider: "ippanel" });
});
