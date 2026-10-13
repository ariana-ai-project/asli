/* ============================================================
   فاز ۱ و ۲ طرح «پیام اول، استراتژی‌ها، پروفایل و گراف»: دفتر تأمین‌کنندگان، نظرها، گراف و استراتژی استعلام روی D1
   داده: چند ردیفِ نمونه به شکلِ خروجیِ tools/cr02-import.mjs (پروفایل «ورق» و «داربست» از فایلِ برابریِ بسته)
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import { supKey, crShard } from "../../../worker/cr-data.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FX = JSON.parse(gunzipSync(readFileSync(resolve(HERE, "fixtures/cr02-parity.json.gz"))).toString("utf8"));
const REC = (h) => FX.profiles.find((p) => p.item_head === h).rec;
const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = { DB, MANAGER_CODE: "4321", COMPANY: "تونل سد آریانا", SITE_ORIGIN: "https://arianaai.website" };
const realFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, result: [] }), { status: 200, headers: { "content-type": "application/json" } });
test.after(() => { globalThis.fetch = realFetch; });
const run = (sql, ...a) => DB.raw.prepare(sql).run(...a);
const get = (sql, ...a) => DB.raw.prepare(sql).get(...a);
const call = async (method, path, body, headers) => {
  const res = await route(new Request("https://x/tamin-poshtibani/api" + path, { method, headers: { "Content-Type": "application/json", ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined }), env, { waitUntil(p) { return p && p.catch && p.catch(() => {}); } });
  let data = null; try { data = await res.json(); } catch (_) { /* غیر JSON */ }
  return { status: res.status, data };
};
const EX = { "X-Expert-Code": "1111" }, EX2 = { "X-Expert-Code": "2222" }, MG = { "X-Manager-Code": "4321" };
let SUP = null;
const T0 = Date.now();
const YM = (y, mo = 1) => y * 12 + mo;

if (DB) {
  await ensureSchema(env);
  run("DELETE FROM experts");
  run("INSERT INTO experts (id,name,label,code,active,speed,created_at) VALUES (1,'کارشناس یک','آقای یک','1111',1,1,?), (2,'کارشناس دو','خانم دو','2222',1,1,?)", T0, T0);
  SUP = { "X-Support-Token": (await call("POST", "/support/setup", { pass: "9753" })).data.token };
  /* دو نوع قلم: «ورق» (محدود و مرحله‌ای) و «داربست» (گسترده) */
  const head = (h, mode, cl, w1, wmax) => run("INSERT INTO cr_heads (head,cluster,ms,rfq_mode,competition_mode,n_wave1,n_max,tier,workflow,priority,spend_rank,rec,version,imported_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    h, cl, REC(h).classification.ms, mode, mode, w1, wmax, "A", "ترکیبی", "P2", 1, JSON.stringify(REC(h)), "2.0", T0);
  head("ورق", "LIMITED_STAGED", "C08", 3, 5);
  head("داربست", "BROAD", "C09", 6, 8);
  run("INSERT INTO cr_codes (shard,data) VALUES (?,?)", crShard("1080000001"), JSON.stringify({ "1080000001": { h: "ورق", c: "C08", u: "C08|ورق", r: "کیلوگرم" } }));
  /* کشف‌شده‌ها: سه در شادآباد (دو هم‌پاساژ)، یکی در لاله‌زار، یکی در شهر دیگر، یکی ردشده */
  const sup = (sid, name, hub, ver, kind = "new") => run("INSERT INTO sreg (sid,kind,name,name_n,hub,city,role,country,verification,phones,mobiles,data,version,imported_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    sid, kind, name, supKey(name), hub, hub && hub.startsWith("شهر:") ? hub.slice(5) : "تهران", "عمده‌فروش", "ایران", ver, "021-1", ver >= 2 ? "0912" : null,
    JSON.stringify({ address: `${name} — نشانی`, gates_summary: ver >= 2 ? "همه قبول" : "در انتظار" }), "2.0", T0);
  sup("NEW-0001", "آهن آلات الف", "بازار آهن شادآباد", 2);
  sup("NEW-0002", "آهن آلات ب", "بازار آهن شادآباد", 1);
  sup("NEW-0003", "آهن آلات پ", "بازار آهن شادآباد", 1);
  sup("NEW-0004", "فولاد ت", "لاله‌زار و سعدی", 1);
  sup("NEW-0005", "فولاد ث", "شهر: اصفهان", 1);
  sup("NEW-0006", "رد شده ج", "بازار آهن شادآباد", -1);
  sup("201734", "فولاد اکسین خوزستان", null, 2, "old");
  run("INSERT INTO cr_units (unit_key,head,cluster,cands,unit,imported_at) VALUES ('C08|ورق','ورق','C08',?,?,?)",
    JSON.stringify([["NEW-0001", 1, 1, "تأییدشده", 2.1, 1], ["NEW-0002", 1, 2, "رقیب (رتبهٔ ۱۱ تا ۴۰)", 1.9, 0.8], ["NEW-0003", 0, 3, "رقیب (رتبهٔ ۱۱ تا ۴۰)", 1.8, 0.7],
      ["NEW-0004", 1, 4, "رقیب (رتبهٔ ۱۱ تا ۴۰)", 1.7, 0.6], ["NEW-0005", 0, 5, "رقیب (رتبهٔ ۱۱ تا ۴۰)", 1.5, 0.5], ["NEW-0006", 1, 6, "در ده‌تای اول — منتظر تکمیل دروازه‌ها", 1.4, 0.5]]),
    JSON.stringify({ codes: ["1080000001"] }), T0);
  run("INSERT INTO sreg_edges (a,b,ev,nature,strength,directed,source,status,by_kind,at) VALUES ('NEW-0001','NEW-0002','هم‌پاساژ (هم‌مکانی؛ امکان خبررسانی)','same_market','متوسط',0,'تحقیق','پیشنهادی','research',?)", T0);
  /* سوابق: فولاد اکسین (ردهٔ A، ۱۴۰۴) و تأمین‌کنندهٔ بی‌کد */
  run("INSERT INTO supplier_grades (sn,name,code,grade) VALUES (?,?,?,?)", supKey("فولاد اکسین خوزستان"), "فولاد اکسین خوزستان", "201734", "A");
  const buy = (code, h, sup, ym, amt) => run("INSERT INTO purchases (head,item_code,h,order_date,ym,qty,unit,amount,amount_adj,supplier,supplier_n,expert,title) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
    h, code, `h${Math.random()}`, "1404/05/01", ym, 10, "کیلوگرم", amt, amt, sup, supKey(sup), "x", "ورق سیاه");
  buy("1080000001", "ورق", "فولاد اکسین خوزستان", YM(1404, 5), 9e9);
  buy("1080000001", "ورق", "فولاد اکسین خوزستان", YM(1403, 2), 5e9);
  buy("1080000001", "ورق", "آهن فروشی قدیمی", YM(1401, 2), 1e9);
}

/* ---------------- استراتژی استعلام ---------------- */
test("استراتژی: «ورق» محدود و مرحله‌ای با شمارِ بسته؛ «داربست» گسترده", { skip: SKIP }, async () => {
  const v = (await call("GET", `/cr/head?head=${encodeURIComponent("ورق")}`, null, EX)).data;
  assert.equal(v.found, true);
  assert.equal(v.mode, "LIMITED_STAGED");
  assert.equal(v.family, "cautious");
  assert.deepEqual([v.n_wave1, v.n_max], [3, 5]);
  assert.equal(v.disclosure.text_variation, true);
  const d = (await call("GET", `/cr/head?head=${encodeURIComponent("داربست")}`, null, EX)).data;
  assert.equal(d.mode, "BROAD");
  assert.equal(d.family, "max");
  assert.equal((await call("GET", `/cr/head?head=${encodeURIComponent("ناموجود")}`, null, EX)).data.found, false);
});

test("برنامهٔ گیرندگان: فعلیِ معتمد اول، یکی در هر بازار، بی دو سرِ یالِ هم‌پاساژ، ردشده نه", { skip: SKIP }, async () => {
  const r = await call("GET", `/cr/plan?head=${encodeURIComponent("ورق")}&code=1080000001`, null, EX);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const w = r.data.plan.wave1;
  assert.equal(w.length, 3);
  assert.equal(w[0].id, "201734", "فولاد اکسین: ردهٔ A و خرید ۱۴۰۴");
  assert.equal(w[0].incumbent, true);
  assert.ok(!w.some((x) => x.id === "NEW-0006"), "ردشده‌ها هرگز");
  const hubs = w.filter((x) => !x.incumbent).map((x) => x.hub);
  assert.equal(new Set(hubs).size, hubs.length, "یکی در هر بازار");
  assert.ok(!(w.some((x) => x.id === "NEW-0001") && w.some((x) => x.id === "NEW-0002")), "دو سرِ یالِ هم‌پاساژ با هم نه");
  assert.equal(r.data.plan.incumbents_in_wave1, 1, "محدود: حداکثر یک تأمین‌کنندهٔ فعلی");
  assert.ok(!JSON.stringify(r.data).includes("آهن فروشی قدیمی"), "خریدِ پیش از ۱۴۰۳ فعلی نیست");
});

test("محتاط برای قلمِ حداکثری، و تغییرِ پشتیبانی با دلیل", { skip: SKIP }, async () => {
  run("INSERT INTO cr_units (unit_key,head,cluster,cands,unit,imported_at) VALUES ('C09|داربست','داربست','C09','[]','{}',?)", T0);
  const c = (await call("GET", `/cr/plan?head=${encodeURIComponent("داربست")}&cautious=1`, null, EX)).data;
  assert.equal(c.policy.mode, "LIMITED_STAGED");
  assert.match(c.policy.why[0], /کمیاب یا متمرکز/);
  /* پشتیبانی «داربست» را به استاندارد می‌برد: بی دلیل نه */
  const H = encodeURIComponent("داربست");
  assert.equal((await call("PUT", `/support/strategy/heads/${H}`, { mode: "STANDARD" }, SUP)).status, 422);
  assert.equal((await call("PUT", `/support/strategy/heads/${H}`, { mode: "STANDARD", reason: "بازار دو سطح کیفیت دارد" }, SUP)).status, 200);
  const s = (await call("GET", `/cr/head?head=${H}`, null, EX)).data;
  assert.equal(s.mode, "STANDARD");
  assert.match(s.why[0], /پشتیبانی.*دو سطح کیفیت/);
  /* استثنای شمار و برداشتنِ تغییر */
  assert.equal((await call("PUT", `/support/strategy/heads/${H}`, { n: { n_wave1: 2, n_max: 3 }, reason: "بازار کوچک" }, SUP)).status, 200);
  assert.deepEqual([(await call("GET", `/cr/head?head=${H}`, null, EX)).data.n_wave1], [2]);
  assert.equal((await call("PUT", `/support/strategy/heads/${H}`, { clear: ["mode", "n"], reason: "برگشت به تحقیق" }, SUP)).status, 200);
  const b = (await call("GET", `/cr/head?head=${H}`, null, EX)).data;
  assert.equal(b.mode, "BROAD");
  assert.equal(b.n_wave1, 6);
  assert.equal(get("SELECT COUNT(*) AS n FROM cr_head_x WHERE head='داربست'").n, 2, "تاریخچه می‌ماند");
  /* فهرستِ پشتیبانی با شمارِ هر حالت */
  const L = (await call("GET", "/support/strategy/heads?family=cautious", null, SUP)).data;
  assert.equal(L.list.length, 1);
  assert.equal(L.list[0].head, "ورق");
  assert.equal(L.counts.BROAD, 1);
  /* جدولِ شمارِ پشتیبانی */
  assert.equal((await call("PUT", "/support/strategy/rfqn", { table: { BROAD: { A: [7, 9] } } }, SUP)).status, 200);
  assert.equal((await call("GET", `/cr/head?head=${H}`, null, EX)).data.n_wave1, 7);
  assert.equal((await call("PUT", "/support/strategy/rfqn", { table: { BROAD: { A: [9, 7] } } }, SUP)).status, 422);
  await call("PUT", "/support/strategy/rfqn", { table: {} }, SUP);
});

/* ---------------- پروفایل و نظرها ---------------- */
test("پروفایل با نام؛ نظر «از طرف خودم» و «از زبان دیگری»؛ فقط نویسنده ویرایش می‌کند؛ پنهان کردن با دلیل", { skip: SKIP }, async () => {
  const p = (await call("GET", `/sreg/profile?name=${encodeURIComponent("آهن‌آلات  الف")}`, null, EX)).data;
  assert.equal(p.sid, "NEW-0001", "نیم‌فاصله و فاصلهٔ اضافه فرقی نمی‌کند");
  assert.equal(p.market.hub, "بازار آهن شادآباد");
  assert.equal(p.contact.address, "آهن آلات الف — نشانی");
  assert.equal(p.edges.length, 1);
  assert.equal(p.edges[0].nature_fa, "هم‌بازار");
  const o1 = await call("POST", "/sreg/opinions", { sid: "NEW-0001", body: "تحویل‌ها همیشه دیر است", topic: "خوش‌قولی", conf: 4 }, EX);
  assert.equal(o1.status, 200, JSON.stringify(o1.data));
  assert.equal((await call("POST", "/sreg/opinions", { sid: "NEW-0001", voice: "other", body: "گرانفروش است" }, EX)).status, 422, "صاحب‌نظر لازم است");
  const o2 = await call("POST", "/sreg/opinions", { sid: "NEW-0001", voice: "other", holder: "تأمین‌کنندهٔ رقیب", body: "جنسش درجه‌دو است" }, EX2);
  assert.equal(o2.status, 200);
  assert.equal((await call("PUT", `/sreg/opinions/${o1.data.id}`, { body: "تغییرِ دیگری" }, EX2)).status, 403, "فقط نویسنده");
  assert.equal((await call("PUT", `/sreg/opinions/${o1.data.id}`, { body: "تحویل‌ها معمولاً دیر است" }, EX)).status, 200);
  assert.equal((await call("POST", `/sreg/opinions/${o2.data.id}/hide`, {}, EX2)).status, 422, "دلیل لازم است");
  assert.equal((await call("POST", `/sreg/opinions/${o2.data.id}/hide`, { note: "نادرست بود" }, EX2)).status, 200);
  const p2 = (await call("GET", "/sreg/profile?sid=NEW-0001", null, MG)).data;
  const mine = p2.opinions.find((x) => x.id === o1.data.id);
  assert.equal(mine.body, "تحویل‌ها معمولاً دیر است");
  assert.equal(mine.edited, true);
  assert.equal(mine.author, "آقای یک");
  assert.equal(p2.opinions.find((x) => x.id === o2.data.id).hidden, true, "مدیر پنهان‌شده را با دلیل می‌بیند");
  assert.ok(get("SELECT prev FROM sreg_ops WHERE id=?", o1.data.id).prev.includes("همیشه دیر"), "نسخهٔ قبلی می‌ماند");
  /* تأمین‌کننده‌ای که فقط در سامانه دیده شده: ردیف «L:» با اولین نظر */
  const o3 = await call("POST", "/sreg/opinions", { name: "فروشگاه تازه", body: "تلفن را جواب نمی‌دهد" }, EX);
  assert.equal(o3.data.sid, `L:${supKey("فروشگاه تازه")}`);
  assert.equal(get("SELECT kind FROM sreg WHERE sid=?", o3.data.sid).kind, "loc");
});

/* ---------------- پیوندها و گراف ---------------- */
test("«🔗 پیوند» و «🕸 کاوش گراف»: رنگِ هر نوع رابطه؛ ردِ یالِ پیشنهادی با دلیل و اثرش در گزینش", { skip: SKIP }, async () => {
  const l = await call("POST", "/sreg/links", { sid: "NEW-0004", to: [{ sid: "NEW-0005" }, { name: "فولاد اکسین خوزستان" }], nature: "rival", note: "رقیب‌اند" }, EX);
  assert.equal(l.status, 200, JSON.stringify(l.data));
  assert.equal(l.data.ids.length, 2);
  assert.equal((await call("POST", "/sreg/links", { sid: "NEW-0004", to: [{ sid: "NEW-0005" }], nature: "rival" }, EX)).data.ids[0], l.data.ids[0], "تکراری نه");
  assert.equal((await call("POST", "/sreg/links", { sid: "NEW-0004", to: [{ sid: "NEW-0005" }], nature: "دوستی" }, EX)).status, 422);
  const g = (await call("GET", "/sreg/graph?sid=NEW-0004&depth=2", null, EX)).data;
  assert.ok(g.nodes.some((n) => n.sid === "201734" && n.name === "فولاد اکسین خوزستان"));
  assert.equal(g.edges.find((e) => e.nature === "rival").color, "#2563eb");
  assert.ok(g.nodes.find((n) => n.root).sid === "NEW-0004");
  /* یالِ پیشنهادیِ هم‌پاساژ رد می‌شود ← در گزینشِ بعدی دیگر مانع نیست */
  const e = get("SELECT id FROM sreg_edges WHERE a='NEW-0001' AND b='NEW-0002'").id;
  assert.equal((await call("POST", `/sreg/edges/${e}/review`, { ok: false }, EX)).status, 422);
  assert.equal((await call("POST", `/sreg/edges/${e}/review`, { ok: false, note: "دو پاساژِ جدا هستند" }, EX)).data.status, "ردشده");
  assert.equal((await call("GET", "/sreg/profile?sid=NEW-0001", null, EX)).data.edges.length, 0);
  /* گرافِ کاملِ پشتیبانی با فیلترِ نوع قلم */
  const fg = (await call("GET", `/support/graph?head=${encodeURIComponent("ورق")}`, null, SUP)).data;
  assert.ok(fg.edges.length >= 1);
});

/* ---------------- «نام نزدیک» (G4) ---------------- */
test("G4: پشتیبانی یکی بودن را تأیید می‌کند ← نامِ کشف‌شده به تأمین‌کنندهٔ سوابق می‌رسد", { skip: SKIP }, async () => {
  run("INSERT INTO sreg_alias (kind,alias,sid,status,note,by_kind,by_name,at) VALUES ('g4','NEW-0003','', 'پیشنهادی','نام نزدیک به تأمین‌کنندهٔ فعلی «فولاد اکسین خوزستان» — بازبینی شما','research','تحقیق (G4)',?)", T0);
  const L = (await call("GET", "/support/sreg/g4", null, SUP)).data;
  assert.equal(L.list.length, 1);
  assert.equal(L.list[0].new_name, "آهن آلات پ");
  assert.equal((await call("POST", "/support/sreg/g4/NEW-0003", { same: true }, SUP)).status, 422, "هدف خالی است");
  assert.equal((await call("POST", "/support/sreg/g4/NEW-0003", { same: true, sid: "201734" }, SUP)).data.status, "تأییدشده");
  const p = (await call("GET", "/sreg/profile?sid=NEW-0003", null, EX)).data;
  assert.equal(p.sid, "201734", "پروفایلِ ادغام‌شده");
  assert.equal((await call("GET", "/support/sreg/g4", null, SUP)).data.list.length, 0);
  assert.equal((await call("GET", "/sreg/profile?sid=NEW-0003", null, {})).status, 401, "بی ورود نه");
});

test("کلیدها: پیش‌فرض خاموش؛ پشتیبانی روشن می‌کند", { skip: SKIP }, async () => {
  assert.deepEqual(Object.values((await call("GET", "/cr/flags", null, EX)).data.flags).filter(Boolean), []);
  assert.equal((await call("PUT", "/support/cr/flags", { registry: true, strategy: 1 }, SUP)).data.flags.registry, 1);
  const f = (await call("GET", "/cr/flags", null, EX)).data.flags;
  assert.equal(f.registry, 1); assert.equal(f.strategy, 1); assert.equal(f.turn, 0);
  const st = (await call("GET", "/support/cr/status", null, SUP)).data;
  assert.equal(st.heads, 2);
  assert.ok(st.suppliers >= 7);
});
