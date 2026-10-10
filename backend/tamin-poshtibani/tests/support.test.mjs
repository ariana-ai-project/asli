/* ============================================================
   پنل «پشتیبانی» (مهر ۱۴۰۵ — مرحلهٔ ۱) — مسیرهای Worker روی SQLite واقعی

   • ورود: اولین بازدیدکننده رمز می‌گذارد؛ پنج رمز غلط = قفل؛ مدیر با کد مدیر رمز تازه می‌گذارد و
     نشانه‌های قبلی باطل می‌شوند؛ خودِ رمز هیچ‌جا ذخیره یا به پنلی داده نمی‌شود
   • تیک «تأیید کمیسیون» از کارشناس گرفته شد و فقط پشتیبانی می‌زند؛ کارشناس خبردار می‌شود و «خاتمه»
     همان اقلام را می‌بندد
   • گزارش رخدادها: کار کارشناس از پنل/بات، مکاتبات و پشتیبانی، با فیلتر و صفحه‌بندی
   • مکاتبات فقط‌خواندنی: نگاه پشتیبانی پیامی را «خوانده‌شده» نمی‌کند
   • میز و فهرست کارشناسان کد ورود کارشناس را بیرون نمی‌دهند
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
/* بدون TG_BOT_TOKEN: پیام‌های تلگرام در صف می‌مانند و شبکه‌ای در کار نیست */
const env = { DB, MANAGER_CODE: "4321", TG_WEBHOOK_SECRET: "raz-e-server" };
const H = 3600000;
const T0 = Date.now() - 5 * H;
if (DB) {
  await ensureSchema(env);
  DB.raw.exec("DELETE FROM experts");
  const ex = DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,telegram_chat,created_at) VALUES (?,?,?,?,1,1,?,?)");
  ex.run(1, "کارشناس یک", "یک", "1111", "700", T0);
  ex.run(2, "کارشناس دو", "دو", "2222", null, T0);
  const rq = DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES (?,'1405/07/10',?)");
  rq.run("R-1", "پروژهٔ یک"); rq.run("R-2", "پروژهٔ دو");
  const as = DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,viewed_at,commission_no,commission_at,created_at) VALUES (?,?,?,3,?,?,?,?,?)");
  as.run(1, "R-1", 1, T0, T0 + 10 * 60000, 7, T0 + 3 * H, T0);
  as.run(2, "R-2", 2, T0, null, null, null, T0);
  const it = DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,title,qty,unit,state,assignment_id,hist_done_at) VALUES (?,?,?,?,?,2,'عدد','open',?,?)");
  it.run(11, "R-1", "a", 1, "شیر فلکه", 1, T0 + 20 * 60000);
  it.run(12, "R-1", "b", 2, "لولهٔ گالوانیزه", 1, null);
  it.run(21, "R-2", "a", 1, "سیمان", 2, null);
  const q = DB.raw.prepare(`INSERT INTO quotes (id,assignment_id,item_id,supplier_name,unit,qty,price,dtime,pay,invoice,vat,saved,final,final_at,source,origin,created_at,updated_at)
    VALUES (?,?,?,?,'عدد',2,?,'10','نقدی','رسمی','دارد',?,?,?,'panel','history',?,?)`);
  q.run(101, 1, 11, "بازرگانی الف", 500000, 1, 1, T0 + 2 * H, T0 + H, T0 + H);
  q.run(102, 1, 12, "بازرگانی الف", 900000, 0, 0, null, T0 + H + 1000, T0 + H + 1000);
}

async function call(method, path, { body, token, expert, manager } = {}) {
  const headers = {};
  if (token) headers["X-Support-Token"] = token;
  if (expert) headers["X-Expert-Code"] = expert;
  if (manager) headers["X-Manager-Code"] = manager;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await route(new Request("https://x/tamin-poshtibani/api" + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  }), env, { waitUntil() {} });
  const ct = res.headers.get("content-type") || "";
  return { status: res.status, data: ct.includes("json") ? await res.json() : await res.text() };
}
const row = (sql, ...a) => DB.raw.prepare(sql).get(...a);
let TOKEN = null;

test("ورود پشتیبانی: اولین بازدیدکننده رمز می‌گذارد و بعد فقط با همان رمز", { skip: SKIP }, async () => {
  assert.equal((await call("GET", "/support/status")).data.set, false);
  assert.equal((await call("POST", "/support/login", { body: { pass: "1234" } })).status, 409, "پیش از گذاشتنِ رمز ورود معنی ندارد");
  assert.equal((await call("POST", "/support/setup", { body: { pass: "12" } })).status, 400, "رمز کوتاه پذیرفته نمی‌شود");
  assert.equal((await call("POST", "/support/setup", { body: { pass: "12345" } })).status, 400, "بیش از ۴ رقم پذیرفته نمی‌شود");
  assert.equal((await call("POST", "/support/setup", { body: { pass: "ab12" } })).status, 400, "فقط رقم");
  assert.equal((await call("POST", "/support/setup", { body: { pass: "4321" } })).status, 400, "همان کد مدیر نه");
  const s = await call("POST", "/support/setup", { body: { pass: "۱۴۰۵" } });
  assert.equal(s.status, 200);
  assert.match(s.data.token, /^\d{13}\.[0-9a-f]{64}$/);
  TOKEN = s.data.token;
  const again = await call("POST", "/support/setup", { body: { pass: "9999" } });
  assert.equal(again.status, 409, "نفر دوم نمی‌تواند رمز را عوض کند");
  assert.equal((await call("GET", "/support/status")).data.set, true);

  /* رقم فارسی و لاتین یکی‌اند */
  assert.equal((await call("POST", "/support/login", { body: { pass: "1405" } })).status, 200);
  /* خودِ رمز ذخیره نمی‌شود و تنظیماتِ پنل‌ها آن را نمی‌دهند */
  const stored = row("SELECT value FROM settings WHERE key='supportPass'");
  assert.deepEqual(Object.keys(JSON.parse(stored.value)).sort(), ["at", "hash", "salt"], "فقط نمک و هش");
  const settings = await call("GET", "/settings", { manager: "4321" });
  assert.equal(settings.status, 200);
  assert.ok(!("supportPass" in settings.data) && !JSON.stringify(settings.data).includes(JSON.parse(stored.value).hash));
});

test("بی نشانه یا با نشانهٔ دست‌کاری‌شده، هیچ مسیری از پشتیبانی باز نمی‌شود", { skip: SKIP }, async () => {
  assert.equal((await call("GET", "/support/experts")).status, 401);
  const forged = TOKEN.replace(/.$/, (c) => (c === "0" ? "1" : "0"));
  assert.equal((await call("GET", "/support/experts", { token: forged })).status, 401);
  const longer = `${Date.now() + 99 * 86400000}.${TOKEN.split(".")[1]}`;
  assert.equal((await call("GET", "/support/experts", { token: longer })).status, 401, "تمدیدِ دستیِ مهلت امضا را می‌شکند");
  /* کد مدیر یا کارشناس جای نشانهٔ پشتیبانی را نمی‌گیرد */
  assert.equal((await call("GET", "/support/experts", { manager: "4321" })).status, 401);
  assert.equal((await call("GET", "/support/experts", { expert: "1111" })).status, 401);
});

test("فهرست کارشناسان و میز پشتیبانی کد ورود و گفت‌وگوی تلگرامِ کارشناسان را بیرون نمی‌دهند", { skip: SKIP }, async () => {
  const e = await call("GET", "/support/experts", { token: TOKEN });
  assert.equal(e.status, 200);
  const one = e.data.experts.find((x) => x.id === 1);
  assert.equal(one.open_asg, 1);
  assert.equal(one.open_items, 2);
  assert.equal(one.cm_wait, 2, "جدول کمیسیونش ساخته شده و هنوز تأیید نشده");
  assert.equal(one.tg, true);
  const d = await call("GET", "/support/desk?scope=all", { token: TOKEN });
  assert.equal(d.status, 200);
  assert.equal(d.data.requests.length, 2);
  const txt = JSON.stringify([e.data, d.data.experts]);
  assert.doesNotMatch(txt, /"code"|1111|2222|telegram_chat|"700"/);
  assert.ok(!d.data.scores && !d.data.decisions, "امتیازها و تصمیم‌های مدیر جای پشتیبانی نیست");

  const one2 = await call("GET", "/support/experts/1", { token: TOKEN });
  assert.equal(one2.status, 200);
  assert.equal(one2.data.assignments.length, 1);
  assert.equal(one2.data.assignments[0].hist_count, 1);
  assert.ok(one2.data.activity.some((r) => r.src === "view"), "آخرین رخدادهای همان کارشناس");
});

test("تیک تأیید کمیسیون: کارشناس نمی‌تواند؛ پشتیبانی می‌زند، کارشناس خبردار می‌شود و «خاتمه» همان را می‌بندد", { skip: SKIP }, async () => {
  const no = await call("POST", "/items/11/commission", { expert: "1111", body: { ok: true } });
  assert.equal(no.status, 403);
  assert.equal(row("SELECT commission_ok FROM items WHERE id=11").commission_ok, 0);
  /* بی تأیید پشتیبانی خاتمه‌ای نیست */
  const early = await call("POST", "/assignments/1/decision", { expert: "1111", body: { action: "end" } });
  assert.equal(early.status, 422);
  assert.match(early.data.error, /پشتیبانی/);

  const list = await call("GET", "/support/commission", { token: TOKEN });
  assert.equal(list.status, 200);
  assert.deepEqual(list.data.items.map((i) => i.id).sort(), [11, 12], "پیش‌فرض: اقلامی که جدول کمیسیونشان ساخته شده");
  const i11 = list.data.items.find((i) => i.id === 11);
  assert.equal(i11.finals, 1);
  assert.equal(i11.final_sup, "بازرگانی الف");
  assert.equal(i11.final_price, 500000);
  assert.equal((await call("GET", "/support/commission?scope=open", { token: TOKEN })).data.items.length, 3);

  const ok = await call("POST", "/support/commission", { token: TOKEN, body: { item_ids: [11], ok: true } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.changed, 1);
  assert.equal(ok.data.notified, 1);
  assert.equal(row("SELECT commission_ok FROM items WHERE id=11").commission_ok, 1);
  const ev = row("SELECT * FROM events WHERE kind='commission_ok'");
  assert.equal(ev.actor, "support");
  assert.equal(ev.request_id, "R-1");
  const msg = row("SELECT * FROM outbox WHERE idem LIKE 'sup-cm:1:%'");
  assert.equal(msg.target, "700");
  assert.match(JSON.parse(msg.payload_json).text, /پشتیبانی کمیسیون/);
  /* دوباره زدن چیزی را عوض نمی‌کند و پیام تازه‌ای نمی‌سازد */
  assert.equal((await call("POST", "/support/commission", { token: TOKEN, body: { item_ids: [11], ok: true } })).data.changed, 0);

  const end = await call("POST", "/assignments/1/decision", { expert: "1111", body: { action: "end" } });
  assert.equal(end.status, 200);
  assert.equal(end.data.closed, 1);
  assert.equal(row("SELECT state FROM items WHERE id=11").state, "closed");
  assert.equal(row("SELECT state FROM items WHERE id=12").state, "open", "قلمِ تأییدنشده باز می‌ماند");
  /* قلمِ بسته دیگر تیک نمی‌خورد */
  assert.equal((await call("POST", "/support/commission", { token: TOKEN, body: { item_ids: [11], ok: false } })).data.changed, 0);
});

test("گزارش رخدادها: کارِ کارشناس، مکاتبات و پشتیبانی با زمان دقیق، فیلتر و صفحه‌بندی", { skip: SKIP }, async () => {
  /* ثبت موقت از پنل حالا رخداد دارد (بات از قبل داشت) */
  const sv = await call("PUT", "/quotes/102", { expert: "1111", body: { save: true } });
  assert.equal(sv.status, 200);
  assert.ok(row("SELECT 1 AS x FROM events WHERE kind='quote_saved' AND actor='expert:1'"));
  /* یک گفت‌وگو با تأمین‌کننده */
  DB.raw.prepare("INSERT INTO sp_suppliers (id,name,name_n,demo,created_at) VALUES (5,'آهن‌آلات ب','آهن آلات ب',0,?)").run(T0);
  DB.raw.prepare("INSERT INTO sp_threads (id,assignment_id,request_id,supplier_id,last_at,created_at) VALUES (9,1,'R-1',5,?,?)").run(T0 + 4 * H, T0);
  DB.raw.prepare("INSERT INTO sp_msgs (thread_id,who,kind,body,meta_json,at) VALUES (9,'e','text','سلام، قیمت شیر فلکه؟',?,?)").run(JSON.stringify({ ai: true }), T0 + 4 * H - 1000);
  DB.raw.prepare("INSERT INTO sp_msgs (thread_id,who,kind,body,at) VALUES (9,'s','text','دانه‌ای ۴۸۰ هزار تومان',?)").run(T0 + 4 * H);

  const all = await call("GET", "/support/activity", { token: TOKEN });
  assert.equal(all.status, 200);
  const srcs = new Set(all.data.rows.map((r) => r.src));
  for (const s of ["view", "hist", "qadd", "qfin", "ev", "msg"]) assert.ok(srcs.has(s), `منبع ${s}`);
  const times = all.data.rows.map((r) => r.at);
  assert.deepEqual(times, [...times].sort((a, b) => b - a), "تازه‌ترین بالا");
  const ai = all.data.rows.find((r) => r.src === "msg" && r.by === "ai");
  assert.ok(ai && ai.thread_id === 9, "پیامِ کارشناس هوشمند جدا دیده می‌شود");
  assert.ok(all.data.rows.find((r) => r.src === "msg" && r.by === "supplier"));
  assert.ok(all.data.rows.some((r) => r.src === "ev" && r.by === "support" && r.kind === "commission_ok"));
  /* رخدادهای هم‌معنا دو بار نمی‌آیند: viewed از events نه، فقط از خودِ ارجاع */
  DB.raw.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)").run(T0 + 10 * 60000, "expert:1", "viewed", "R-1", JSON.stringify({ assignment_id: 1, channel: "telegram" }));
  const again = await call("GET", "/support/activity", { token: TOKEN });
  assert.equal(again.data.rows.filter((r) => r.kind === "viewed").length, 1);

  const ex2 = await call("GET", "/support/activity?expert=2", { token: TOKEN });
  assert.ok(ex2.data.rows.every((r) => r.expert_id === 2), JSON.stringify(ex2.data.rows.map((r) => [r.src, r.expert_id])));
  const r2 = await call("GET", "/support/activity?rid=R-2", { token: TOKEN });
  assert.ok(r2.data.rows.every((r) => r.request_id === "R-2"));
  const both = await call("GET", "/support/activity?rid=R-1&expert=1", { token: TOKEN });
  assert.ok(both.data.rows.length && both.data.rows.every((r) => r.request_id === "R-1"));
  const sup = await call("GET", "/support/activity?g=support", { token: TOKEN });
  assert.ok(sup.data.rows.length && sup.data.rows.every((r) => r.by === "support"));
  const chat = await call("GET", "/support/activity?g=chat", { token: TOKEN });
  assert.ok(chat.data.rows.length && chat.data.rows.every((r) => r.src === "msg" || r.src === "sms"));
  const win = await call("GET", `/support/activity?from=${T0 + 3.5 * H}&to=${T0 + 5 * H}`, { token: TOKEN });
  assert.ok(win.data.rows.every((r) => r.at >= T0 + 3.5 * H && r.at <= T0 + 5 * H));

  /* صفحه‌بندی: ۲۵ رخدادِ دیگر و صفحه‌های ۲۰تایی */
  const ins = DB.raw.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)");
  for (let k = 0; k < 25; k++) ins.run(T0 - (k + 1) * 60000, "manager", "dispatch", "R-2", JSON.stringify({ assignment_id: 2, expert_id: 2, days: 3 }));
  const p1 = await call("GET", "/support/activity?g=asg&limit=20", { token: TOKEN });
  assert.equal(p1.data.rows.length, 20);
  assert.equal(p1.data.more, true);
  const p2 = await call("GET", `/support/activity?g=asg&limit=20&before=${p1.data.next}`, { token: TOKEN });
  const keys = new Set(p1.data.rows.map((r) => r.key));
  const fresh = p2.data.rows.filter((r) => !keys.has(r.key));
  assert.equal(keys.size + fresh.length, 25, "هر رخداد یک بار، بی جاافتادگی");
});

test("مکاتبات فقط‌خواندنی: دیدنِ گفت‌وگو چیزی را «خوانده‌شده» نمی‌کند", { skip: SKIP }, async () => {
  const before = row("SELECT e_seen, s_seen, rev FROM sp_threads WHERE id=9");
  const list = await call("GET", "/support/threads", { token: TOKEN });
  assert.equal(list.status, 200);
  const t = list.data.threads.find((x) => x.id === 9);
  assert.equal(t.msgs, 2);
  assert.equal(t.ai_msgs, 1);
  assert.equal(t.last_who, "s");
  const one = await call("GET", "/support/threads/9", { token: TOKEN });
  assert.equal(one.status, 200);
  assert.equal(one.data.msgs.length, 2);
  assert.equal(one.data.thread.supplier, "آهن‌آلات ب");
  assert.deepEqual(row("SELECT e_seen, s_seen, rev FROM sp_threads WHERE id=9"), before);
  assert.equal((await call("GET", "/support/threads?expert=2", { token: TOKEN })).data.threads.length, 0);
});

test("جزئیات ارجاع و جدول کمیسیون برای پشتیبانی", { skip: SKIP }, async () => {
  const a = await call("GET", "/support/assignments/1", { token: TOKEN });
  assert.equal(a.status, 200);
  assert.equal(a.data.items.length, 2);
  assert.equal(a.data.quotes.length, 2);
  const html = await call("GET", "/support/assignments/1/sheet/commission?format=html", { token: TOKEN });
  assert.equal(html.status, 200);
  assert.ok(html.data.html && html.data.html.includes("بازرگانی الف"));
});

test("قفل بعد از پنج رمز غلط؛ مدیر رمز تازه می‌گذارد و همهٔ نشانه‌های قبلی باطل می‌شوند", { skip: SKIP }, async () => {
  for (let k = 0; k < 4; k++) assert.equal((await call("POST", "/support/login", { body: { pass: "غلط-غلط" } })).status, 401);
  const fifth = await call("POST", "/support/login", { body: { pass: "غلط-غلط" } });
  assert.equal(fifth.status, 429);
  assert.equal((await call("POST", "/support/login", { body: { pass: "1405" } })).status, 429, "در قفل، رمز درست هم نه");
  assert.ok((await call("GET", "/support/status")).data.locked_until > Date.now());

  assert.equal((await call("POST", "/support/reset", { body: { pass: "5678" } })).status, 401, "بی کد مدیر نه");
  assert.equal((await call("POST", "/support/reset", { manager: "0000", body: { pass: "5678" } })).status, 401);
  const rs = await call("POST", "/support/reset", { manager: "4321", body: { pass: "5678" } });
  assert.equal(rs.status, 200);
  assert.equal((await call("GET", "/support/experts", { token: TOKEN })).status, 401, "نشانهٔ رمزِ قبلی باطل شد");
  assert.equal((await call("GET", "/support/experts", { token: rs.data.token })).status, 200);
  assert.equal((await call("POST", "/support/login", { body: { pass: "5678" } })).status, 200, "قفل هم برداشته شد");

  /* تغییر رمز با رمز فعلی */
  assert.equal((await call("POST", "/support/pass", { token: rs.data.token, body: { current: "x", pass: "8765" } })).status, 403);
  const ch = await call("POST", "/support/pass", { token: rs.data.token, body: { current: "5678", pass: "8765" } });
  assert.equal(ch.status, 200);
  assert.equal((await call("GET", "/support/experts", { token: rs.data.token })).status, 401);
  assert.equal((await call("GET", "/support/experts", { token: ch.data.token })).status, 200);
  const kinds = DB.raw.prepare("SELECT json_extract(payload_json,'$.how') AS how FROM events WHERE kind='support_pass' ORDER BY id").all().map((r) => r.how);
  assert.deepEqual(kinds, ["setup", "reset", "change"]);
});
