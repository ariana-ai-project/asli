/* ============================================================
   «مناقصه» — مزایدهٔ معکوس زنده (worker/tender.js و tender-core.js؛ مهر ۱۴۰۵، درخواست مالک)
   • قواعد ناب: گام کاهش، کف، پرش مجاز (ضد صفر جاافتاده)، تمدید لحظهٔ آخر، بهترین و رتبه، عدد به حروف
   • ساخت مناقصه با فهرست دعوت از سوابق، پیامک دعوت بی نام کالا، رمز تلفنی، ورود با شماره و رمز، قفل رمز نادرست
   • پیشنهاد اتمی، نام‌های پنهان («شما» و «تأمین‌کنندهٔ N»)، اصلاح و ابطال پشتیبان، پایان و برنده
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import { checkBid, bidRange, extendOnBid, bestOf, ranksOf, numWords, tenderState } from "../../../worker/tender-core.js";
import { inviteText, tenderTick } from "../../../worker/tender.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = { DB, MANAGER_CODE: "4321", COMPANY: "تونل سد آریانا", SITE_ORIGIN: "https://arianaai.website" };
const run = (sql, ...a) => DB.raw.prepare(sql).run(...a);
const get = (sql, ...a) => DB.raw.prepare(sql).get(...a);
const call = async (method, path, body, headers) => {
  const h = { "Content-Type": "application/json", ...(headers || {}) };
  const res = await route(new Request("https://x/tamin-poshtibani/api" + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env, { waitUntil() {} });
  return { status: res.status, data: await res.json() };
};
let SUP = null;
if (DB) {
  await ensureSchema(env);
  SUP = { "X-Support-Token": (await call("POST", "/support/setup", { pass: "9753" })).data.token };
  /* سوابق خرید: دو تأمین‌کنندهٔ «میلگرد ۱۶»؛ یکی شماره در پنل دارد و دیگری در دفترچه */
  const P = "INSERT INTO purchases (head,item_code,h,order_date,ym,qty,unit,amount,amount_adj,supplier,supplier_n,expert,title) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)";
  run(P, "میلگرد", "M16", "a1", "1404/05/01", 140405, 10, "تن", 9e9, 9e9, "فولاد البرز", "foulad alborz", "x", "میلگرد ۱۶");
  run(P, "میلگرد", "M16", "a2", "1404/09/01", 140409, 5, "تن", 5e9, 5e9, "فولاد البرز", "foulad alborz", "x", "میلگرد ۱۶");
  run(P, "میلگرد", "M16", "a3", "1404/10/01", 140410, 8, "تن", 8.4e9, 8.4e9, "آهن‌آلات پارس", "ahan pars", "x", "میلگرد ۱۶");
  run("INSERT INTO sp_suppliers (id,name,name_n,demo,created_at) VALUES (1,'فولاد البرز','فولاد البرز',0,1)");
  run("INSERT INTO sp_phones (id,supplier_id,phone,label,k,panel,created_at) VALUES (1,1,'09121111111','فروش','aaaa11',1,1)");
}

/* ---------------- قواعد ناب ---------------- */
test("قواعد: سقف، گام، کف، پرش مجاز و «خودت پیشتازی»", () => {
  const t = { state: "scheduled", start_at: 1, end_at: 1e15, start_price: 1_000_000, floor_pct: 30, jump_pct: 10, step_pct: 0.5, step_min: 0 };
  assert.equal(checkBid(t, 1_000_001, 1, 5).code, "high", "اولین پیشنهاد حداکثر قیمت شروع");
  assert.equal(checkBid(t, 1_000_000, 1, 5).ok, true);
  assert.equal(checkBid(t, 699_999, 1, 5).code, "floor");
  const b = { ...t, best_amount: 900_000, best_alias: 2 };
  assert.deepEqual(bidRange(b), { max: 895_500, min: 810_000, step: 4_500, floor: 700_000, mode: "open" });
  assert.equal(checkBid(b, 896_000, 1, 5).code, "high", "دست‌کم یک گام پایین‌تر");
  assert.equal(checkBid(b, 90_000, 1, 5).code, "floor", "صفر جاافتاده");
  assert.equal(checkBid(b, 800_000, 1, 5).code, "low", "بیش از ۱۰٪ پرش");
  assert.equal(checkBid(b, 850_000, 2, 5).code, "own");
  assert.equal(checkBid(b, 850_000, 1, 5).ok, true);
  assert.equal(checkBid({ ...b, end_at: 4 }, 850_000, 1, 5).code, "state");
  assert.equal(checkBid(b, 850_000.5, 1, 5).code, "nan");
  assert.equal(tenderState({ state: "scheduled", start_at: 10, end_at: 20 }, 5), "scheduled");
  assert.equal(tenderState({ state: "scheduled", start_at: 10, end_at: 20 }, 25), "ended");
});

test("تمدید لحظهٔ آخر: هر بار تا «اکنون + سه دقیقه»، با سقف دفعات", () => {
  const t = { end_at: 1_000_000, ext_window_s: 180, ext_s: 180, ext_max: 0, ext_count: 0 };
  assert.deepEqual(extendOnBid(t, 1_000_000 - 200_000), { end_at: 1_000_000, extended: false }, "بیرون از پنجره");
  assert.deepEqual(extendOnBid(t, 1_000_000 - 60_000), { end_at: 1_000_000 - 60_000 + 180_000, extended: true });
  assert.equal(extendOnBid({ ...t, ext_max: 2, ext_count: 2 }, 1_000_000 - 60_000).extended, false);
});

test("بهترین و رتبه: کمترین، هم‌قیمت‌ها زودتر؛ باطل‌شده حساب نمی‌شود", () => {
  const bids = [{ id: 1, alias: 3, amount: 900, at: 1 }, { id: 2, alias: 5, amount: 880, at: 2 }, { id: 3, alias: 3, amount: 880, at: 3 }, { id: 4, alias: 7, amount: 800, at: 4, state: "void" }];
  assert.equal(bestOf(bids).id, 2);
  const r = ranksOf(bids);
  assert.deepEqual([r.get(5).rank, r.get(3).rank, r.has(7)], [1, 2, false]);
  assert.equal(numWords(48_500_000), "چهل و هشت میلیون و پانصد هزار");
  assert.equal(numWords(1_250_000_000), "یک میلیارد و دویست و پنجاه میلیون");
});

/* ---------------- از ساخت تا برنده ---------------- */
let TID = null, CODE = null;
const alias = (name) => get("SELECT alias FROM tender_invites WHERE tender_id=? AND name=?", TID, name).alias;

test("پشتیبان: قلم از سوابق، تأمین‌کنندگانش با شماره، و ساخت مناقصه", { skip: SKIP }, async () => {
  const items = await call("GET", "/support/tender-items?q=" + encodeURIComponent("میلگرد"), null, SUP);
  assert.equal(items.data.items[0].item_code, "M16");
  assert.equal(items.data.items[0].sups, 2);
  const sups = await call("GET", "/support/tender-suppliers?code=M16", null, SUP);
  const fa = sups.data.suppliers.find((x) => x.name === "فولاد البرز");
  assert.equal(fa.n, 2);
  assert.equal(fa.phone, "09121111111", "شمارهٔ پنل");
  const pa = sups.data.suppliers.find((x) => x.name === "آهن‌آلات پارس");
  assert.equal(pa.phone, null, "بی شماره");
  const bad = await call("POST", "/support/tenders", { title: "میلگرد ۱۶", qty: 20, unit: "تن", start_price: "" }, SUP);
  assert.equal(bad.status, 400);
  const r = await call("POST", "/support/tenders", { title: "میلگرد ۱۶", item_code: "M16", qty: "۲۰", unit: "تن", start_price: "۱٬۰۰۰٬۰۰۰", spec: "A3 — شاخهٔ ۱۲ متری",
    invites: [{ name: "فولاد البرز", phone: "09121111111", source: "history" }, { name: "آهن‌آلات پارس", phone: "", source: "history" }, { name: "بازرگانی نو", phone: "۰۹۳۵۲۲۲۲۲۲۲", source: "manual" },
      { name: "فولاد البرز", phone: "09121111111" }] }, SUP);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  TID = r.data.tender.id; CODE = r.data.tender.code;
  assert.equal(r.data.tender.state, "draft");
  assert.equal(r.data.invites.length, 3, "تکراری یک بار");
  assert.deepEqual(r.data.invites.map((i) => i.alias).sort(), [1, 2, 3]);
  assert.equal(r.data.invites.find((i) => i.name === "بازرگانی نو").phone, "09352222222");
  assert.ok(get("SELECT 1 AS x FROM sp_phones WHERE phone='09352222222'"), "شمارهٔ تازه در دفترچه ماند");
  assert.equal(r.data.tender.start_price, 1_000_000);
  assert.equal(r.data.tender.qty, 20);
  /* پیش از شروع، صفحهٔ عمومی معتبر نیست (پیش‌نویس) */
  assert.equal((await call("GET", `/tender/${CODE}/info`)).status, 404);
});

test("شروع، پیامک دعوت بی نام کالا، و ورود با شماره و رمز", { skip: SKIP }, async () => {
  /* شمارهٔ نفر بی‌شماره را پشتیبان ثبت می‌کند */
  const set = await call("PUT", `/support/tenders/${TID}/invites/${alias("آهن‌آلات پارس")}`, { phone: "09133333333" }, SUP);
  assert.equal(set.status, 200);
  const st = await call("POST", `/support/tenders/${TID}/schedule`, { start_in_min: 0, duration_min: 30 }, SUP);
  assert.equal(st.data.tender.state, "live");
  const inv = await call("POST", `/support/tenders/${TID}/invite`, {}, SUP);
  assert.equal(inv.data.result.off, 3, "درگاه پیامک وصل نیست — ثبت می‌شود");
  assert.ok(!/میلگرد|۲۰|تن/.test(inv.data.text), "پیامک نام کالا و مقدار ندارد");
  assert.match(inv.data.text, new RegExp(`tender\\.html#t=${CODE}`));
  assert.equal(inviteText(env, { code: CODE, start_at: Date.now() - 1 }).includes("در جریان"), true);
  const pub = await call("GET", `/tender/${CODE}/info`);
  assert.equal(pub.data.state, "live");
  assert.equal(JSON.stringify(pub.data).includes("میلگرد"), false, "پیش از ورود نام کالا پیدا نیست");
  /* شمارهٔ دعوت‌نشده */
  assert.equal((await call("POST", `/tender/${CODE}/login`, { phone: "09120000000", pass: "123456" })).status, 403);
  /* درگاه خاموش: «ارسال رمز» راه را به رمز تلفنی نشان می‌دهد */
  assert.equal((await call("POST", `/tender/${CODE}/pass`, { phone: "09121111111" })).status, 503);
  const pp = await call("POST", `/support/tenders/${TID}/invites/${alias("فولاد البرز")}/pass`, {}, SUP);
  assert.match(pp.data.pass, /^\d{6}$/);
  assert.equal((await call("POST", `/tender/${CODE}/login`, { phone: "09121111111", pass: "000000" === pp.data.pass ? "111111" : "000000" })).status, 401);
  const ok = await call("POST", `/tender/${CODE}/login`, { phone: "+989121111111", pass: pp.data.pass.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]) });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  env.A = { "X-Tender-Token": ok.data.token };
  /* دومی و سومی */
  for (const [name, phone, key] of [["آهن‌آلات پارس", "09133333333", "B"], ["بازرگانی نو", "09352222222", "C"]]) {
    const p = await call("POST", `/support/tenders/${TID}/invites/${alias(name)}/pass`, {}, SUP);
    env[key] = { "X-Tender-Token": (await call("POST", `/tender/${CODE}/login`, { phone, pass: p.data.pass })).data.token };
  }
  assert.equal((await call("GET", `/tender/${CODE}/state`)).status, 401, "بی نشست نه");
});

test("قفل: پنج رمز نادرست ورود را پانزده دقیقه می‌بندد", { skip: SKIP }, async () => {
  const a = alias("بازرگانی نو");
  for (let i = 0; i < 5; i++) await call("POST", `/tender/${CODE}/login`, { phone: "09352222222", pass: "999999" });
  assert.ok(get("SELECT lock_until FROM tender_invites WHERE tender_id=? AND alias=?", TID, a).lock_until > Date.now());
  assert.equal((await call("POST", `/tender/${CODE}/login`, { phone: "09352222222", pass: "999999" })).status, 429);
  run("UPDATE tender_invites SET lock_until=NULL, fails=0 WHERE tender_id=? AND alias=?", TID, a);
});

test("پیشنهادها: سقف، پرش، پیشتاز، نام‌های پنهان و «شما»", { skip: SKIP }, async () => {
  const hi = await call("POST", `/tender/${CODE}/bid`, { amount: "1000001" }, env.A);
  assert.equal(hi.status, 409);
  assert.equal(hi.data.code, "high");
  const a1 = await call("POST", `/tender/${CODE}/bid`, { amount: "۱٬۰۰۰٬۰۰۰" }, env.A);
  assert.equal(a1.status, 200, JSON.stringify(a1.data));
  assert.equal(a1.data.view.me.lead, true);
  assert.equal((await call("POST", `/tender/${CODE}/bid`, { amount: 990000 }, env.A)).data.code, "own", "پیشتاز خودش را پایین نمی‌آورد");
  const typo = await call("POST", `/tender/${CODE}/bid`, { amount: 98000 }, env.B);
  assert.equal(typo.data.code, "floor", "صفر جاافتاده رد می‌شود");
  const b1 = await call("POST", `/tender/${CODE}/bid`, { amount: 950000 }, env.B);
  assert.equal(b1.status, 200);
  const v = (await call("GET", `/tender/${CODE}/state`, null, env.A)).data;
  assert.equal(v.me.lead, false);
  assert.equal(v.me.rank, 2);
  assert.equal(v.best.amount, 950000);
  assert.match(v.best.label, /^تأمین‌کنندهٔ /, "نام دیگران پنهان");
  assert.equal(v.bids.find((b) => b.mine).label, "شما");
  assert.equal(JSON.stringify(v).includes("آهن‌آلات پارس"), false);
  assert.equal(v.tender.spec, "A3 — شاخهٔ ۱۲ متری", "بعد از ورود مشخصات پیداست");
  assert.equal(v.bidders, 2);
  /* بی تغییر: پاسخ کوتاه */
  assert.equal((await call("GET", `/tender/${CODE}/state?rev=${v.tender.rev}`, null, env.A)).data.same, true);
  /* نام‌ها با تیک پشتیبان پیدا می‌شوند */
  await call("PUT", `/support/tenders/${TID}`, { show_names: true }, SUP);
  const v2 = (await call("GET", `/tender/${CODE}/state`, null, env.A)).data;
  assert.equal(v2.best.label, "آهن‌آلات پارس");
  await call("PUT", `/support/tenders/${TID}`, { show_names: false }, SUP);
});

test("تمدید: پیشنهاد در سه دقیقهٔ آخر پایان را جلو می‌برد", { skip: SKIP }, async () => {
  run("UPDATE tenders SET end_at=? WHERE id=?", Date.now() + 60_000, TID);
  const r = await call("POST", `/tender/${CODE}/bid`, { amount: 940000 }, env.C);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.extended, true);
  const t = get("SELECT end_at, ext_count FROM tenders WHERE id=?", TID);
  assert.ok(t.end_at >= Date.now() + 170_000, "تا حدود سه دقیقهٔ دیگر");
  assert.equal(t.ext_count, 1);
  assert.equal(get("SELECT ext FROM tender_bids WHERE tender_id=? ORDER BY id DESC LIMIT 1", TID).ext, 1);
});

test("پشتیبان: اصلاح و ابطال پیشنهاد اشتباه، بهترین دوباره حساب می‌شود", { skip: SKIP }, async () => {
  const d = (await call("GET", `/support/tenders/${TID}`, null, SUP)).data;
  assert.equal(d.tender.best_amount, 940000);
  assert.equal(d.bids.find((b) => b.amount === 940000).name, "بازرگانی نو", "پشتیبان نام‌ها را می‌بیند");
  const best = d.bids.find((b) => b.amount === 940000);
  assert.equal((await call("POST", `/support/tenders/${TID}/bids/${best.id}`, { void: true }, SUP)).status, 400, "علت لازم است");
  const v = await call("POST", `/support/tenders/${TID}/bids/${best.id}`, { void: true, reason: "تأمین‌کننده تلفنی گفت اشتباه زده" }, SUP);
  assert.equal(v.data.tender.best_amount, 950000);
  const pb = v.data.bids.find((b) => b.amount === 950000);
  const f = await call("POST", `/support/tenders/${TID}/bids/${pb.id}`, { amount: "945000", reason: "اصلاح رقم به درخواست خودش" }, SUP);
  assert.equal(f.data.tender.best_amount, 945000);
  assert.equal(f.data.bids.find((b) => b.id === pb.id).orig_amount, 950000);
  const fix = (await call("GET", `/tender/${CODE}/state`, null, env.B)).data.fixes;
  assert.equal(fix[0].reason, "اصلاح رقم به درخواست خودش", "تأمین‌کننده اصلاح را می‌بیند");
  assert.ok(get("SELECT 1 AS x FROM events WHERE kind='tender_fix'"));
  /* درخواست اصلاح از صفحهٔ تأمین‌کننده ← هشدار */
  assert.equal((await call("POST", `/tender/${CODE}/fixreq`, { note: "یک صفر کم گذاشتم" }, env.A)).status, 200);
  assert.ok(get("SELECT 1 AS x FROM alarms WHERE kind='tender_fix'"));
});

test("پایان: برنده ثبت می‌شود و پیشنهاد دیر پذیرفته نیست", { skip: SKIP }, async () => {
  run("UPDATE tenders SET end_at=? WHERE id=?", Date.now() - 1000, TID);
  assert.equal(await tenderTick(env), 1);
  const t = get("SELECT state, winner_alias, best_amount FROM tenders WHERE id=?", TID);
  assert.equal(t.state, "ended");
  assert.equal(t.winner_alias, alias("آهن‌آلات پارس"));
  const v = (await call("GET", `/tender/${CODE}/state`, null, env.B)).data;
  assert.equal(v.tender.state, "ended");
  assert.equal(v.tender.winner, "you");
  assert.equal((await call("POST", `/tender/${CODE}/bid`, { amount: 900000 }, env.A)).data.code, "state");
  assert.ok(get("SELECT 1 AS x FROM events WHERE kind='tender_end'"));
  const list = (await call("GET", "/support/tenders", null, SUP)).data.tenders;
  assert.equal(list[0].state, "ended");
  assert.equal(list[0].best_name, "آهن‌آلات پارس");
});
