/* ============================================================
   ارجاع و مهلت هوشمند — frontend/tamin-poshtibani/assign-rules.mjs
   و شناساییِ گروه اصناف هر قلم در بک‌اند (worker/catalog.js).

   پرسشِ اصلیِ این تست‌ها (تصمیم مدیر، مهر ۱۴۰۵): امتیاز ۵ نباید همهٔ
   درخواست‌ها را روی یک کارشناس بریزد — سقف بار باز باید جلویش را بگیرد.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import * as PL from "../../../frontend/tamin-poshtibani/assign-rules.mjs";
import { guildGroupOf, guildGroups, guildsOfItems, shardOf, resetCatalogCache, GUILD_MISC } from "../../../worker/catalog.js";
/* shardOf برای تکهٔ عنوان‌ها (cat_titles) لازم است — نگاشتِ گروه‌ها خودش تکه‌ای نیست */
import { statusData, parseRange } from "../../../worker/reports.js";
import { ensureSchema, route } from "../../../worker/api.js";
import { getSettings } from "../../../worker/settings.js";
import { sqliteD1 } from "./run.mjs";

const IRON = "160000", TOOLS = "110000";
const A0 = { a: 40, b: 30, c: 30, op1: "+", op2: "−", capacity: 8 };
const D0 = { base: 3, we: 1, wp: 1, wi: 1, op1: "×", op2: "×", op3: "×" };
const W0 = PL.tables([], []);                     /* امتیاز ۳ و ضریب ۱ برای همه */
const experts = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, speed: 1 }));
const jobs = (n, o = {}) => Array.from({ length: n }, (_, i) => ({ id: `R${i + 1}`, project: "راغون", guilds: [IRON], items: 2, ...o }));
const run = (J, E, A, W = W0, load) => PL.planAssign({ jobs: J, experts: E, load: load || PL.buildLoads(E, [], W), W, A });
const share = (E, P) => E.map((e) => P.plan.filter((p) => p.expert.id === e.id).length);

test("زحمت: ضریب پروژه × (سربار + ضریب گروه اصناف اقلام)؛ گروه ناشناخته «متفرقه» است", () => {
  assert.equal(PL.effortOf(W0, "راغون", [IRON, IRON]), 3, "۱ سربار + دو قلمِ ضریب ۱");
  const Wg = PL.tables([], [{ kind: "guild", key: IRON, w: 3 }]);
  assert.equal(PL.effortOf(Wg, "راغون", [IRON, IRON]), 7);
  const Wp = PL.tables([], [{ kind: "project", key: "راغون", w: 2 }]);
  assert.equal(PL.effortOf(Wp, "راغون", [IRON, IRON]), 6);
  const Wm = PL.tables([], [{ kind: "guild", key: PL.MISC_GUILD, w: 5 }]);
  assert.equal(PL.effortOf(Wm, "", [""]), 6, "قلمِ بیرون از فهرست اصناف با ضریب «متفرقه» شمرده می‌شود");
  assert.equal(PL.guildKey(null), PL.MISC_GUILD);
  assert.equal(PL.projectKey(""), PL.NO_PROJECT);
});

test("سقف بار: پیش‌فرض‌های معقول و ورودی خراب", () => {
  assert.deepEqual(PL.limitsOf({}), PL.DEFAULT_LIMITS);
  assert.deepEqual(PL.limitsOf({ maxReq: "", maxItems: "abc" }), PL.DEFAULT_LIMITS);
  assert.deepEqual(PL.limitsOf({ maxReq: 0, maxItems: -3 }), PL.DEFAULT_LIMITS);
  assert.deepEqual(PL.limitsOf({ maxReq: "4", maxItems: 9 }), { maxReq: 4, maxItems: 9 });
});

test("توزیع متوازن: با امتیاز و ضریب یکسان، کار بین کارشناسان نصف می‌شود", () => {
  const E = experts(2), P = run(jobs(4), E, A0);
  assert.deepEqual(share(E, P), [2, 2]);
  assert.equal(P.over, 0);
  assert.deepEqual([...P.after.values()].map((x) => x.items), [4, 4]);
});

test("امتیاز ۵ همهٔ کار را نمی‌گیرد: سقف درخواست باز جلویش را می‌گیرد", () => {
  const W = PL.tables([{ expert_id: 1, kind: "guild", key: IRON, score: 5 }, { expert_id: 2, kind: "guild", key: IRON, score: 1 }], []);
  const E = experts(2);
  /* فقط تخصص؛ بی جریمهٔ بار — بدترین حالت برای تعادل */
  const pure = { ...A0, a: 100, b: 0, c: 0, maxReq: 99, maxItems: 999 };
  assert.deepEqual(share(E, run(jobs(6), E, pure, W)), [6, 0], "بی سقف، همه به کارشناسِ ۵");
  const capped = run(jobs(6), E, { ...pure, maxReq: 4 }, W);
  assert.deepEqual(share(E, capped), [4, 2], "با سقف ۴ درخواست، بقیه به کارشناس بعدی");
  assert.equal(capped.over, 0);
  assert.deepEqual(capped.full, [1], "کارشناسِ پر در فهرست پرها می‌آید");
  /* سقفی که برای همهٔ درخواست‌ها جا ندارد: چیزی زمین نمی‌ماند ولی «بیش از سقف» نشان می‌خورد */
  const tight = run(jobs(6), E, { ...pure, maxReq: 2 }, W);
  assert.equal(tight.plan.length, 6);
  assert.equal(tight.over, 2, "۲ کارشناس × سقف ۲ = ۴ درخواست؛ دو تا بیرون می‌ماند");
});

test("سقف قلم باز هم جداگانه اثر دارد", () => {
  const E = experts(2);
  const P = run(jobs(2, { items: 6 }), E, { ...A0, maxReq: 99, maxItems: 10 });
  assert.deepEqual(share(E, P), [1, 1], "قلم دوم در همان کارشناس جا نمی‌شود (۶+۶ > ۱۰)");
  assert.equal(P.over, 0);
});

test("وقتی همه پر باشند، درخواست به کم‌بارترین می‌رود و «بیش از سقف» نشان می‌خورد", () => {
  const E = experts(2);
  const P = run(jobs(4, { items: 6 }), E, { ...A0, maxReq: 99, maxItems: 10 });
  assert.equal(P.over, 2, "دو درخواست از سقف همه گذشت");
  assert.deepEqual(share(E, P), [2, 2], "ولی باز هم متوازن پخش شد");
  assert.ok(P.plan.filter((p) => p.over).length === 2);
});

test("بار فعلیِ کارشناس در سقف حساب می‌شود، نه فقط پیشنهادهای تازه", () => {
  const E = experts(2);
  const busy = [{ expert_id: 1, project: "راغون", guilds: [IRON, IRON] }, { expert_id: 1, project: "راغون", guilds: [IRON] }];
  const load = PL.buildLoads(E, busy, W0);
  assert.deepEqual([...load.values()], [{ effort: 3 + 2, reqs: 2, items: 3 }, { effort: 0, reqs: 0, items: 0 }]);
  const P = run(jobs(2), E, { ...A0, a: 0, b: 0, c: 0, maxReq: 2 }, W0, load);
  assert.deepEqual(share(E, P), [0, 2], "کارشناس اول از قبل به سقف ۲ رسیده است");
});

test("سابقهٔ پروژه: با امتیاز پروژهٔ بالاتر، درخواستِ همان پروژه به او می‌رسد", () => {
  const W = PL.tables([{ expert_id: 2, kind: "project", key: "زرشوران", score: 5 }, { expert_id: 1, kind: "project", key: "زرشوران", score: 1 }], []);
  const E = experts(2);
  const P = run(jobs(2, { project: "زرشوران" }), E, { ...A0, a: 0, b: 100, c: 0, op1: "+", maxReq: 1 }, W);
  assert.equal(P.plan.find((p) => p.id === "R1").expert.id, 2);
});

test("مهلت: فرمول × √اقلام × ضریب اشغال (بالاتر از ظرفیت)", () => {
  const four = [IRON, IRON, IRON, IRON];
  assert.equal(PL.deadlineOf({ D: D0, W: W0, project: "راغون", guilds: four, expert: { speed: 1 }, loadPct: 0 }).days, 6, "۳ × √۴");
  assert.equal(PL.deadlineOf({ D: D0, W: W0, project: "راغون", guilds: four, expert: { speed: 1 }, loadPct: 150 }).days, 9, "اشغال ۱۵۰٪ ⇒ ۱٫۵ برابر");
  assert.equal(PL.deadlineOf({ D: D0, W: W0, project: "راغون", guilds: four, expert: { speed: 1 }, loadPct: 60 }).days, 6, "زیر ظرفیت، ضریب ۱");
  assert.equal(PL.deadlineOf({ D: D0, W: W0, project: "راغون", guilds: four, expert: { speed: 2 }, loadPct: 0 }).days, 12, "کارشناس کندتر، مهلت بلندتر");
  const Wg = PL.tables([], [{ kind: "guild", key: IRON, w: 2 }, { kind: "guild", key: TOOLS, w: 1 }]);
  assert.equal(PL.deadlineOf({ D: D0, W: Wg, project: "راغون", guilds: [IRON, TOOLS], expert: { speed: 1 }, loadPct: 0 }).days, 6,
    "میانگین ضریب گروه‌ها ۱٫۵ ⇒ ۴٫۵ × √۲ ≈ ۶");
  assert.equal(PL.deadlineOf({ D: D0, W: W0, project: "راغون", guilds: [], expert: { speed: 1 }, loadPct: 0 }).days, 3, "ارجاع بی‌قلم: حداقل همان پایه");
});

test("planDeadlines: اشغال هر کارشناس از بار بازش؛ ارجاعِ کارشناسِ ناشناخته کنار می‌رود", () => {
  const E = [{ id: 1, speed: 1 }, { id: 2, speed: 1 }];
  const busy = Array.from({ length: 20 }, () => ({ expert_id: 1, project: "راغون", guilds: [IRON] }));
  const load = PL.buildLoads(E, busy, W0);
  const list = [{ expert_id: 1, project: "راغون", guilds: [IRON] }, { expert_id: 2, project: "راغون", guilds: [IRON] }, { expert_id: 9, project: "راغون", guilds: [IRON] }];
  const out = PL.planDeadlines({ list, experts: E, load, W: W0, D: D0, capacity: 8 });
  assert.equal(out.length, 2);
  assert.ok(out[0].pct > 100 && out[0].busy > 1, "کارشناسِ پرتر از ظرفیت، مهلت بلندتر می‌گیرد");
  assert.equal(out[1].busy, 1);
  assert.ok(out[0].days > out[1].days);
});

/* ------------------------------------------------------------------ */
/* گروه اصناف هر قلم — از فهرست اقلام، در بک‌اند                        */
/* ------------------------------------------------------------------ */
test("کد گروه از کد طبقهٔ اصناف: دو رقم اول", () => {
  assert.equal(guildGroupOf("160141"), "160000");
  assert.equal(guildGroupOf("۲۹۰۰۰۲"), "290000");
  assert.equal(guildGroupOf(""), "");
});

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = { DB, MANAGER_CODE: "4321" };
if (DB) {
  await ensureSchema(env);
  DB.raw.exec("DELETE FROM experts");
  const t = Date.now();
  DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,senior,created_at) VALUES (1,'ابوذر بهمنی','آقای بهمنی','9101',1,1,0,?)").run(t);
  DB.raw.prepare("INSERT INTO guild_classes (code,name,group_code,group_name) VALUES ('160100','قطعات موتور','160000','قطعات یدکی ماشین آلات'),"
    + "('160141','بدنه','160000','قطعات یدکی ماشین آلات'),('110002','آچار','110000','ابزارآلات'),('300001','سایر','300000','متفرقه')").run();
  const ig = DB.raw.prepare("INSERT OR REPLACE INTO cat_guilds (code,g) VALUES (?,?)");
  for (const [code, g] of [["2010100733", "160000"], ["2020500056", "160000"], ["1010100001", "110000"]]) ig.run(code, g);
  /* عنوانِ عیناً همان، برای قلمی که کدش در فهرست نیست */
  const tk = "پیچ شش گوش م10";
  DB.raw.prepare("INSERT INTO cat_titles (shard,data) VALUES (?,?)").run(shardOf("title", tk), JSON.stringify({ [tk]: "2010100733" }));
  resetCatalogCache();
}

test("گروه اصناف: از کد قلم، وگرنه از عنوانِ عیناً همان، وگرنه «متفرقه»", { skip: SKIP }, async () => {
  const out = await guildsOfItems(env, [
    { code: "2010100733", title: "هر چیزی" },
    { code: "1010100001", title: "آچار" },
    { code: "", title: "پیچ شش گوش م10" },
    { code: "9999999999", title: "قلمی که در فهرست نیست" },
  ]);
  assert.deepEqual(out, ["160000", "110000", "160000", GUILD_MISC]);
  assert.deepEqual(await guildsOfItems(env, []), []);
});

test("فهرست گروه‌های اصناف: از دیتابیس، پرکارترین اول و «متفرقه» ته فهرست", { skip: SKIP }, async () => {
  const G = await guildGroups(env);
  assert.deepEqual(G.map((g) => [g.code, g.name, g.n]), [["160000", "قطعات یدکی ماشین آلات", 2], ["110000", "ابزارآلات", 1], ["300000", "متفرقه", 1]]);
});

test("/axes: محورهای ماتریس‌ها — گروه‌های اصناف و همهٔ پروژه‌های گزارش", { skip: SKIP }, async () => {
  const res = await route(new Request("https://x/tamin-poshtibani/api/axes", { headers: { "X-Manager-Code": "4321" } }), env, { waitUntil() {} });
  const b = await res.json();
  assert.equal(b.groups.length, 3);
  assert.ok(b.projects.length > 20, "همهٔ پروژه‌ها از اول در ماتریس هستند، نه فقط طرف‌های روی میز");
  assert.ok(b.projects.some((p) => p.name === "راغون" && p.city === "تاجیکستان"));
});

test("میز و بار کاری: پروژه و گروه اصناف هر قلم از بک‌اند می‌آیند", { skip: SKIP }, async () => {
  const t = Date.now();
  DB.raw.prepare("INSERT INTO requests (id,date,party,center) VALUES ('Q1','1405/06/02','مرکز هزینه سد راغون','پروژه‌های خارجی')").run();
  DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,created_at) VALUES (41,'Q1',1,?)").run(t);
  const it = DB.raw.prepare("INSERT INTO items (request_id,item_key,line_no,code,title,state,assignment_id) VALUES ('Q1',?,?,?,?,'open',41)");
  it.run("k1", 1, "2010100733", "بدنه");
  it.run("k2", 2, "9999999999", "قلم بی‌فهرست");
  const call = async (p) => (await route(new Request(`https://x/tamin-poshtibani/api${p}`, { headers: { "X-Manager-Code": "4321" } }), env, { waitUntil() {} })).json();
  const desk = await call("/desk?scope=all&limit=50");
  const r = desk.requests.find((x) => x.id === "Q1");
  assert.equal(r.project, "راغون", "پروژه از کلیدواژه‌های «طرف مقابل»");
  assert.deepEqual(r.items.map((i) => i.g), ["160000", GUILD_MISC]);
  const wl = await call("/workload");
  const g = wl.assignments.find((x) => x.aid === 41);
  assert.equal(g.project, "راغون");
  assert.deepEqual(g.guilds, ["160000", GUILD_MISC]);
  assert.equal(g.items, undefined, "ریزِ اقلام در پاسخ نمی‌ماند");
});

/* ------------------------------------------------------------------ */
/* «وضعیت درخواست ها» با بازهٔ تاریخ                                      */
/* ------------------------------------------------------------------ */
test("بازه: تاریخ شمسیِ صفرپَد؛ پایانِ خالی یعنی تاکنون؛ جابه‌جا یعنی مرتب‌شده", () => {
  assert.deepEqual(parseRange({ from: "1405/6/2" }), { from: "1405/06/02", to: "" });
  assert.deepEqual(parseRange({ from: "۱۴۰۵/۰۶/۰۲", to: "1405-06-31" }), { from: "1405/06/02", to: "1405/06/31" });
  assert.deepEqual(parseRange({ from: "1405/07/01", to: "1405/06/01" }), { from: "1405/06/01", to: "1405/07/01" });
  assert.deepEqual(parseRange({ from: "خراب", to: null }), { from: "", to: "" });
  assert.deepEqual(parseRange(), { from: "", to: "" });
});

test("وضعیت درخواست‌ها: بایگانی و میز با هم، در بازهٔ انتخابی مدیر", { skip: SKIP }, async () => {
  const H = (id, date, o = {}) => [id, date, "مرکز هزینه سد راغون", "", "", "", "", "", "", 1, 1, 0, 0, null, "بسته شده", "ابوذر بهمنی", null, `fp-${id}`, Date.now()];
  const ins = DB.raw.prepare("INSERT OR REPLACE INTO req_hist (id,date,party,center,party_type,requester,req_type,supply_unit,buy_type,n,nc,ns,nh,ost,anyst,sx,note,fp,updated_at)"
    + " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  ins.run(...H("Z1", "1405/05/10"));
  ins.run(...H("Z2", "1405/06/03"));
  ins.run(...H("Z3", "1405/07/20"));
  const settings = await getSettings(env);
  const ids = async (sel) => (await statusData(env, settings, sel)).general.map((r) => r[0]).sort();
  assert.deepEqual(await ids({ from: "1405/06/01" }), ["Q1", "Z2", "Z3"], "از تاریخ شروع تاکنون — هم بایگانی هم میز");
  assert.deepEqual(await ids({ from: "1405/06/01", to: "1405/06/30" }), ["Q1", "Z2"], "با تاریخ پایان");
  assert.deepEqual(await ids({}), ["Q1", "Z1", "Z2", "Z3"], "بی بازه یعنی همه");
  const D = await statusData(env, settings, { from: "1405/06/01" });
  assert.equal(D.general[0][2], "بسته شده", "وضعیتِ درخواستِ بایگانی");
  assert.equal(D.general.find((r) => r[0] === "Q1")[2], "ثبت شده", "درخواستِ بازِ میز");
  assert.equal(D.general.find((r) => r[0] === "Z2")[11], "بهمنی", "نام کوتاه کارشناس");
  assert.deepEqual(D.range, { from: "1405/06/01", to: "" });
  assert.equal(D.capped, false);
});
