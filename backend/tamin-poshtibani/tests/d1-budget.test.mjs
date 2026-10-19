/* ============================================================
   نگهبانِ سقف روزانهٔ خواندنِ D1 (۵ میلیون ردیف در روز، طرح رایگان) — مهر ۱۴۰۵
   هر بار که سقف پر شد، علت یک کوئریِ پرتکرار بود که کلِ یک جدولِ بزرگ را می‌خواند (مثلاً جزئیاتِ مناقصه هر ۳ ثانیه
   و purchases با item_code تنها). این تست همهٔ مسیرهای پرتکرار را اجرا می‌کند — نظرسنجی‌های پنل‌ها (کارتابل، میز،
   صندوق پیام، مناقصهٔ زنده، …) و Cronِ هر دقیقه — و نقشهٔ اجرای SQLite (EXPLAIN QUERY PLAN) هر دستور را می‌خواند.
   هر «SCAN» روی جدولی که با کار بزرگ می‌شود (نه جدول‌های کوچکِ تنظیمات و افراد) شکست است، مگر در فهرستِ
   مجازها با دلیل. اگر این تست شکست خورد: نمایه بسازید یا شرط را با کلید اصلی بنویسید — نه این‌که به فهرست اضافه کنید.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import worker from "../../../worker.js";
import { scheduled as botTick } from "../../../worker/bot.js";

const DB = await sqliteD1({ plans: true });
const SKIP = DB ? false : "node:sqlite در دسترس نیست";
const env = { DB, MANAGER_CODE: "4321", COMPANY: "تونل سد آریانا", SITE_ORIGIN: "https://arianaai.website", TG_BOT_TOKEN: "t", TG_WEBHOOK_SECRET: "s" };
/* هیچ درخواستِ بیرونی (تلگرام، پیامک، مدل) در این تست واقعاً نمی‌رود */
const realFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, result: [] }), { status: 200, headers: { "content-type": "application/json" } });
test.after(() => { globalThis.fetch = realFetch; });

const call = async (method, path, body, headers) => {
  const res = await route(new Request("https://x/tamin-poshtibani/api" + path, { method, headers: { "Content-Type": "application/json", ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined }), env, { waitUntil(p) { return p && p.catch && p.catch(() => {}); } });
  let data = null; try { data = await res.json(); } catch (_) { /* غیر JSON */ }
  return { status: res.status, data };
};
const run = (sql, ...a) => DB.raw.prepare(sql).run(...a);

/* جدول‌هایی که با تعداد آدم‌ها و تنظیمات محدودند (چند ده ردیف) — خواندنِ کاملشان بی‌خطر است */
const SMALL = new Set(["settings", "counters", "experts", "push_subs", "tg_nav", "guild_classes", "price_index", "tender_settings", "vb_chats",
  "sp_phones", "templates", "expert_scores", "axes", "alert_contacts", "ai_rules", "ai_modes", "ai_agents", "weights", "imports",
  /* روزی یک ردیف (حدود ۲٬۷۰۰، سالی ۳۶۵ تا) و فقط در نوبتِ روزانهٔ ۶:۰۳ */
  "usd_rates"]);

/* مسیرهای پرتکرار: هر نقشهٔ اجرایی که در این بخش جمع می‌شود بررسی می‌شود */
async function exercise() {
  const t = Date.now();
  run("DELETE FROM experts");
  run("INSERT INTO experts (id,name,label,code,active,speed,senior,created_at) VALUES (1,'کارشناس یک','یک','1111',1,1,1,?), (2,'کارشناس دو','دو','2222',1,1,0,?)", t, t);
  run("UPDATE experts SET senior_id=1 WHERE id=2");
  run("INSERT INTO requests (id,date,party) VALUES ('B-1','1405/07/20','پروژه')");
  run("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,created_at) VALUES (51,'B-1',1,3,?,?)", t - 3600e3, t);
  run("INSERT INTO items (id,request_id,item_key,line_no,code,title,qty,unit,state,assignment_id) VALUES (501,'B-1','k1',1,'1010100001','سیمان',10,'تن','open',51)");
  const EX = { "X-Expert-Code": "1111" }, MG = { "X-Manager-Code": "4321" };
  const SUP = { "X-Support-Token": (await call("POST", "/support/setup", { pass: "9753" })).data.token };
  const tnd = (await call("POST", "/support/tenders", { title: "پیچ", qty: 5, unit: "عدد", start_price: "50000", invites: [{ name: "فولاد", phone: "09121111111" }] }, SUP)).data.tender;
  await call("POST", `/support/tenders/${tnd.id}/schedule`, { start_in_min: 0, duration_min: 30 }, SUP);
  const D0 = (await call("GET", `/support/tenders/${tnd.id}`, null, SUP)).data;
  const pp = (await call("POST", `/support/tenders/${tnd.id}/invites/${D0.invites[0].alias}/pass`, {}, SUP)).data;
  const TK = { "X-Tender-Token": (await call("POST", `/tender/${tnd.code}/login`, { phone: "09121111111", pass: pp.pass })).data.token };

  DB.planLog.clear();   /* از این‌جا به بعد: فقط مسیرهای پرتکرار */
  const hot = [];
  const get = async (path, h) => { const r = await call("GET", path, null, h); hot.push([path, r.status]); return r; };
  /* کارشناس: کارتابل (هر دقیقه)، تیم، صندوقِ پیام (هر ۱۰ ثانیه)، فهرست گفت‌وگوها، جزئیات ارجاع */
  await get("/tray?full=1", EX); await get("/team", EX); await get("/sp/x/inbox", EX); await get(`/sp/x/inbox?since=${t - 60e3}`, EX);
  await get("/sp/x/threads", EX); await get("/assignments/51", EX); await get("/me/alerts", EX); await get("/site");
  /* مدیر: میز (هر دقیقه)، هشدارها، بار کاری */
  await get("/desk?from=1405%2F07%2F18&limit=300&offset=0&with=all", MG); await get("/workload", MG); await get("/alarms", MG); await get("/events", MG);
  /* پشتیبان: درخواست‌ها، هشدارها، گفت‌وگوها، مناقصه (فهرست و جزئیات هر ۳ ثانیه) */
  await get("/support/desk?limit=600", SUP); await get("/support/alarms", SUP); await get("/support/threads", SUP); await get("/support/status", SUP);
  const L = await get("/support/tenders", SUP); await get(`/support/tenders?fp=${encodeURIComponent(L.data.fp)}`, SUP);
  const D = await get(`/support/tenders/${tnd.id}`, SUP); await get(`/support/tenders/${tnd.id}?fp=${encodeURIComponent(D.data.fp)}`, SUP);
  /* تأمین‌کننده در مناقصهٔ زنده: هر ۲ ثانیه */
  const V = await get(`/tender/${tnd.code}/state`, TK); await get(`/tender/${tnd.code}/state?rev=${V.data.tender.rev}&st=live`, TK); await get(`/tender/${tnd.code}/info`);
  /* اعلان و دستیار */
  await get("/push/key"); await get("/help/chat?role=expert", EX);
  /* Cron: دقیقهٔ سنگین (مضرب ۵)، دقیقهٔ سبک، و Cronِ ویس */
  const ctx = { list: [], waitUntil(p) { this.list.push(Promise.resolve(p).catch(() => {})); } };
  for (const [cron, min] of [["* * * * *", 0], ["* * * * *", 1], ["*/2 * * * *", 2]]) {
    const at = new Date(); at.setUTCMinutes(min);
    await worker.scheduled({ cron, scheduledTime: at.getTime() }, env, ctx);
  }
  await Promise.all(ctx.list);
  /* Cronِ بات خودش با ساعتِ واقعی تصمیم می‌گیرد کدام نیمه (هر ۵ دقیقه: هشدار مهلت و پایشِ رنگ‌ها) — اجرای دستی هر دو را می‌زند */
  await botTick(env);
  return hot;
}

/* هر خواندنِ کاملِ جدولِ بزرگ: [جدول، متن کوئری] */
function scans() {
  const out = [];
  for (const [sql, rows] of DB.planLog) {
    /* نام مستعار ← جدول (FROM items i / JOIN sp_threads t) */
    const alias = new Map(); const re = /\b(?:FROM|JOIN)\s+(\w+)(?:\s+(?:AS\s+)?(\w+))?/gi; let x;
    /* نام‌های WITH جدول نیستند (نتیجهٔ میانیِ چند ردیفی) */
    const ctes = new Set(); const cre = /(?:\bWITH|,)\s+(\w+)\s+AS\s*\(/gi; let y; while ((y = cre.exec(sql))) ctes.add(y[1]);
    while ((x = re.exec(sql))) { alias.set(x[1], x[1]); if (x[2] && !/^(WHERE|ON|JOIN|LEFT|INNER|GROUP|ORDER|LIMIT|USING|SET|VALUES|AND|OR)$/i.test(x[2])) alias.set(x[2], x[1]); }
    for (const d of rows) {
      const m = /^SCAN (\w+)/.exec(d);
      if (!m || m[1] === "CONSTANT") continue;
      const table = alias.get(m[1]) || m[1];
      if (SMALL.has(table) || ctes.has(table)) continue;
      out.push({ table, detail: d, sql: sql.replace(/\s+/g, " ").trim().slice(0, 170) });
    }
  }
  return out;
}

/* مجازها: [جدول، تکه‌ای از کوئری، دلیل] — فقط وقتی جدول به‌راستی کوچک می‌ماند یا مسیر پرتکرار نیست */
const ALLOW = [
  /* نمایهٔ جزئی: فقط ردیف‌های باز را دارد، نه کلِ جدول */
  ["alarms", "USING INDEX ix_alarms_open_m", "فقط هشدارهای دیده‌نشدهٔ مدیر (چند ردیف)"],
  ["alarms", "USING INDEX ix_alarms_open_s", "فقط هشدارهای دیده‌نشدهٔ پشتیبان"],
  ["decisions", "USING INDEX ix_dec_open", "فقط تصمیم‌های در انتظار تأیید مدیر"],
  /* ترتیبِ نمایه با LIMIT: حداکثر همان چند صد ردیف */
  ["sp_threads", "USING INDEX ix_spth_last", "فهرست گفت‌وگوهای پشتیبان: ترتیب last_at با LIMIT 300"],
  /* جدولِ مجازی: همان فهرستِ چند شناسهٔ ارجاع که پارامتر است (ai-rules.js:itemNeeds — حداقلِ استعلامِ ردهٔ هر قلم)، نه جدولِ دیتابیس */
  ["json_each", "json_each(?)", "فهرستِ شناسه‌های پارامتر، چند عدد"],
];

test("مسیرهای پرتکرار و Cron هیچ جدولِ بزرگی را کامل نمی‌خوانند (سقف روزانهٔ D1)", { skip: SKIP }, async () => {
  await ensureSchema(env);
  const hot = await exercise();
  const bad = scans().filter((s) => !ALLOW.some(([t, frag]) => s.table === t && (s.sql.includes(frag) || s.detail.includes(frag))));
  const seen = new Set(); const uniq = bad.filter((s) => { const k = s.table + "|" + s.sql; if (seen.has(k)) return false; seen.add(k); return true; });
  if (uniq.length) console.log("SCANS\n" + uniq.map((s) => `  [${s.table}] ${s.detail} :: ${s.sql}`).join("\n"));
  console.log("HOT " + hot.map(([p, s]) => `${s} ${p}`).join(" | "));
  assert.equal(uniq.length, 0, `${uniq.length} خواندنِ کامل در مسیرهای پرتکرار`);
  /* «🤖 هوشمند / ✋ دستی»ِ کارشناس در صندوقِ پیام (هر ۱۰ ثانیه، worker/sp-core.js:expertInbox): فقط با کلیدِ اصلی — ai_agents کوچک است ولی
     این نظرسنجی پرتکرارترینِ پنل است */
  const ag = [...DB.planLog].find(([sql]) => /SELECT mode, rev FROM ai_agents WHERE expert_id=\?/.test(sql));
  assert.ok(ag, "صندوقِ پیام حالتِ کارشناس را می‌خواند");
  assert.ok(ag[1].every((d) => !/^SCAN/.test(d)) && ag[1].some((d) => /^SEARCH ai_agents USING INTEGER PRIMARY KEY/.test(d)), ag[1].join(" | "));
});

/* نگهبانِ اجرا (worker/d1-guard.js): خواندنِ سنگینِ تکراری ← یک هشدارِ پشتیبان؛ یک بارِ سنگین یا سبک ← هیچ */
test("نگهبانِ اجرا: دستورِ سنگینِ تکراری ← هشدارِ پشتیبان (مدیر نه)، یک بار؛ نتیجه‌ها دست‌نخورده", { skip: SKIP }, async () => {
  const { guardEnv, HEAVY } = await import("../../../worker/d1-guard.js");
  const base = DB;   /* همان پایگاهِ تستِ بالا (طرح ساخته شده) */
  base.raw.exec("DELETE FROM alarms WHERE kind='db_heavy'");
  /* شبیه D1: هر all/run اندازهٔ خواندن را در meta برمی‌گرداند */
  let rowsRead = 0;
  const fake = {
    prepare(sql) { const st = base.prepare(sql); return { ...st, bind(...a) { st.bind(...a); return this; },
      async all() { const r = await st.all(); return { ...r, meta: { rows_read: rowsRead } }; }, async run() { const r = await st.run(); return { ...r, meta: { ...r.meta, rows_read: rowsRead } }; },
      first: st.first, _run: st._run }; },
    batch: base.batch, exec: base.exec, raw: base.raw,
  };
  const raw = { DB: fake };
  const env2 = guardEnv(raw);
  assert.equal(guardEnv(raw), env2, "برای یک env همان پیچیده (کش‌های بسته به env عوض نمی‌شوند)");
  raw.LATER = "x"; assert.equal(env2.LATER, "x", "تغییرِ بعدیِ env پیداست");
  const count = () => base.raw.prepare("SELECT COUNT(*) AS n FROM alarms WHERE kind='db_heavy'").get().n;
  /* سبک: هیچ */
  rowsRead = 50;
  for (let i = 0; i < 5; i++) await env2.DB.prepare("SELECT * FROM settings").all();
  assert.equal(count(), 0);
  /* سنگین ولی یک بار (گزارش دستی): هیچ */
  rowsRead = HEAVY + 5000;
  const r = await env2.DB.prepare("SELECT key FROM settings WHERE 1=1").all();
  assert.ok(Array.isArray(r.results), "نتیجه همان است");
  assert.equal(count(), 0);
  /* سنگین و تکراری (الگوی نظرسنجی): یک هشدار؛ بارهای بعدی تا ۶ ساعت نه */
  for (let i = 0; i < 6; i++) await env2.DB.prepare("SELECT key FROM settings WHERE 2=2").all();
  assert.equal(count(), 1);
  const a = base.raw.prepare("SELECT * FROM alarms WHERE kind='db_heavy'").get();
  assert.ok(a.ack_m, "مدیر از پیش دیده — فقط پشتیبان");
  assert.equal(a.ack_s, null);
  assert.match(a.body, /ردیف در یک دستور/);
  /* batch از دستورهای پیچیده: اجرا می‌شود (پیچ باز می‌شود) */
  const out = await env2.DB.batch([env2.DB.prepare("SELECT 1 AS x"), env2.DB.prepare("SELECT 2 AS x")]);
  assert.equal(out.length, 2);
  /* خاموش‌کردن */
  const off = { DB: fake, D1_GUARD: "off" };
  assert.equal(guardEnv(off), off);
});
