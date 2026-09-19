/* ============================================================
   منوی پایش تیم در بات کارشناس ارشد — worker/team.js

   چیزی که این‌جا سنجیده می‌شود، **قاعدهٔ مالکیت** است و بعد شکل صفحه‌ها.

   شناسهٔ کارشناس و ارجاع از `callback_data` می‌آید — یعنی از سمت کاربر، و هر کسی
   که بات را دارد می‌تواند عدد دلخواهش را بفرستد. پس هیچ کوئری‌ای نباید فقط با آن
   عدد بخواند؛ هر کدام باید `senior_id` همان کارشناس ارشدی را که گفت‌وگو به او گره
   خورده هم در WHERE داشته باشد. اگر روزی کسی این شرط را از یک کوئری بردارد،
   تستِ «هیچ کوئری بی‌قید مالکیت نیست» می‌افتد.

   دیتابیس بدلی است: هدف سنجیدنِ قاعده است نه SQLite.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { teamPageFor, teamMenuKb, seniorOfChat, handleTeamCallback } from "../../../worker/team.js";

/* ---------- دیتابیس بدلی ---------- */

const SENIOR = { id: 1, name: "کارشناس ارشد", label: "ارشد", alert_thresholds: null };

/* یک ارجاع ارسال‌شده و باز: «مشاهده» انجام شده، بقیه نه */
const DISPATCHED = Date.UTC(2026, 8, 14, 6);
const ASSIGN = {
  id: 91, request_id: "R-100", days: 3, dispatched_at: DISPATCHED, deadline_at: DISPATCHED + 3 * 86400000,
  viewed_at: DISPATCHED + 3600000, commission_at: null, thr_snapshot: null,
  expert_id: 5, expert_name: "کارشناس یک", expert_label: "یک", party: "پروژهٔ نمونه",
  open_count: 2, item_count: 2, hist: 0, smart: 0, quotes: 0, lines: 0, proformas: 0,
};

/**
 * `calls` هر کوئریِ اجراشده را با SQL و آرگومان‌هایش نگه می‌دارد تا تستِ مالکیت
 * بتواند رویشان قدم بزند.
 */
function fakeDb(data = {}) {
  const calls = [];
  const has = (sql, ...frags) => frags.every((f) => sql.includes(f));
  const stmt = (sql) => ({
    args: [],
    bind(...a) { this.args = a; return this; },
    async all() {
      calls.push({ sql, args: this.args });
      if (has(sql, "FROM settings")) return { results: [] };
      if (has(sql, "FROM experts e", "e.senior_id=?")) return { results: data.team || [] };
      if (has(sql, "FROM items", "assignment_id=?")) return { results: data.items || [] };
      if (has(sql, "FROM assignments a")) return { results: data.assigns || [] };
      return { results: [] };
    },
    async first() {
      calls.push({ sql, args: this.args });
      if (has(sql, "team_chat=?")) return data.senior === undefined ? SENIOR : data.senior;
      if (has(sql, "FROM experts WHERE id=?", "senior_id=?")) return data.expert === undefined ? null : data.expert;
      if (has(sql, "FROM assignments a", "a.id=?")) return data.assign === undefined ? null : data.assign;
      return null;
    },
    async run() { return { meta: {} }; },
  });
  return { calls, prepare: (sql) => stmt(sql), batch: async () => [] };
}

const env = (data) => { const DB = fakeDb(data); return { DB, _calls: DB.calls }; };
const cbs = (page) => page.keyboard.flat().map((b) => b.callback_data);

/* ---------- مالکیت ---------- */

test("مالکیت: هیچ کوئریِ صفحه‌ها بی قیدِ کارشناس ارشد نیست", async () => {
  /* هر سه صفحه با شناسه‌هایی که «مال این ارشد نیستند» صدا زده می‌شوند */
  for (const data of ["tq:t", "tq:e:777", "tq:a:888"]) {
    const e = env({ team: [], assigns: [] });
    await teamPageFor(e, SENIOR, data);
    const reads = e._calls.filter((c) => /FROM (experts|assignments)/.test(c.sql) && !c.sql.includes("FROM settings"));
    assert.ok(reads.length, `${data}: هیچ کوئری‌ای اجرا نشد`);
    for (const c of reads) {
      assert.match(c.sql, /senior_id=\?/, `${data}: کوئری بی قید مالکیت\n${c.sql}`);
      assert.ok(c.args.includes(SENIOR.id), `${data}: شناسهٔ ارشد bind نشده\n${c.sql}`);
    }
  }
});

test("شناسهٔ ناشناس چیزی لو نمی‌دهد — نه کارشناس، نه درخواست", async () => {
  const p1 = await teamPageFor(env({ expert: null }), SENIOR, "tq:e:777");
  assert.match(p1.text, /در تیم شما نیست/);
  assert.deepEqual(cbs(p1), ["tq:t"]);

  const p2 = await teamPageFor(env({ assign: null }), SENIOR, "tq:a:888");
  assert.match(p2.text, /در تیم شما نیست|وجود ندارد/);
  assert.deepEqual(cbs(p2), ["tq:t"]);
});

/* ---------- مسیریابی دکمه‌ها ---------- */

test("callback_data: فقط سه صفحهٔ شناخته‌شده؛ بقیه رد", async () => {
  const e = () => env({ team: [], assigns: [] });
  assert.ok(await teamPageFor(e(), SENIOR, "tq:t"));
  assert.ok(await teamPageFor(e(), SENIOR, "tq:e:5"));
  assert.ok(await teamPageFor(e(), SENIOR, "tq:a:91"));
  for (const bad of ["", null, "seen:a:5", "tq:", "tq:x:1", "tq:e:abc", "tq:e:5;DROP", "tq:a:-3"]) {
    assert.equal(await teamPageFor(e(), SENIOR, bad), null, `باید رد می‌شد: ${bad}`);
  }
  /* شناسهٔ صفر یا جاافتاده به فهرست تیم برمی‌گردد، نه خطا */
  assert.match((await teamPageFor(e(), SENIOR, "tq:e:0")).text, /تیم/);
});

/* ---------- صفحهٔ فهرست تیم ---------- */

test("فهرست تیم: هر کارشناس یک دکمه، با شمار درخواست باز", async () => {
  const p = await teamPageFor(env({
    team: [{ id: 5, name: "کارشناس یک", label: "یک", live: 1 }, { id: 6, name: "کارشناس دو", label: "دو", live: 0 }],
    assigns: [ASSIGN],
  }), SENIOR, "tq:t");

  assert.match(p.text, /یک/);
  assert.match(p.text, /دو/);
  assert.match(p.text, /۱ درخواست باز/);
  assert.match(p.text, /بدون درخواست باز/);
  assert.match(p.text, /مجموع ارجاع‌های باز: <b>۱<\/b>/);
  assert.deepEqual(cbs(p), ["tq:e:5", "tq:e:6", "tq:t"]);
});

test("تیم خالی: پیام روشن و بدون دکمهٔ کارشناس", async () => {
  const p = await teamPageFor(env({ team: [], assigns: [] }), SENIOR, "tq:t");
  assert.match(p.text, /هنوز هیچ کارشناسی زیر نظر شما/);
  assert.deepEqual(cbs(p), ["tq:t"]);
});

/* ---------- صفحهٔ یک کارشناس ---------- */

test("کارشناس: هر درخواست با نوار شش‌تایی و مرحله‌ای که رویش مانده", async () => {
  const p = await teamPageFor(env({
    expert: { id: 5, name: "کارشناس یک", label: "یک" },
    assigns: [ASSIGN],
  }), SENIOR, "tq:e:5");

  assert.match(p.text, /R-100/);
  assert.match(p.text, /پروژهٔ نمونه/);
  assert.match(p.text, /۲ قلم/);
  /* «مشاهده» انجام شده (viewed_at)، پس اولین باکس سبز است و کار روی «بررسی سوابق» مانده */
  assert.match(p.text, /🟢/);
  assert.match(p.text, /مانده روی: <b>بررسی سوابق<\/b>/);
  assert.deepEqual(cbs(p), ["tq:a:91", "tq:t", "tq:e:5"]);
});

test("درخواست‌های زیاد: شمارهٔ هر خطِ متن دکمه دارد، بقیه فقط شمرده می‌شوند", async () => {
  /* ۱۵ ارجاع، ولی سقف دکمه ۱۲ است — متن نباید ۱۳ تا ۱۵ را شماره‌گذاری کند */
  const many = Array.from({ length: 15 }, (_, k) => ({ ...ASSIGN, id: 100 + k, request_id: `R-${100 + k}` }));
  const p = await teamPageFor(env({ expert: { id: 5, name: "کارشناس یک", label: "یک" }, assigns: many }), SENIOR, "tq:e:5");

  const numbered = (p.text.match(/^۱?[۰-۹]\. <b>/gm) || []).length;
  const buttons = cbs(p).filter((d) => d.startsWith("tq:a:")).length;
  assert.equal(numbered, buttons, "هر خط شماره‌دار باید دکمه داشته باشد");
  assert.equal(buttons, 12);
  assert.match(p.text, /۱۵ درخواست باز/, "شمار کل باید کامل بماند");
  assert.match(p.text, /و ۳ درخواست دیگر/);
  assert.ok(!p.text.includes("R-112"), "ارجاع سیزدهم نباید در متن بیاید");
});

test("کارشناس بدون درخواست باز: پیام روشن، نه فهرست خالی", async () => {
  const p = await teamPageFor(env({ expert: { id: 5, name: "کارشناس یک", label: "یک" }, assigns: [] }), SENIOR, "tq:e:5");
  assert.match(p.text, /هیچ درخواست بازی ندارد/);
  assert.deepEqual(cbs(p), ["tq:t", "tq:e:5"]);
});

/* ---------- کارت یک درخواست ---------- */

test("کارت درخواست: همان کارت اعلان‌ها، با راه بازگشت به کارشناس و تیم", async () => {
  const p = await teamPageFor(env({
    assign: ASSIGN,
    items: [{ title: "پیچ آلن", qty: 10, unit: "عدد" }, { title: "واشر فنری", qty: 4, unit: "عدد" }],
  }), SENIOR, "tq:a:91");

  assert.match(p.text, /R-100/);
  assert.match(p.text, /پیچ آلن/);
  assert.match(p.text, /واشر فنری/);
  assert.match(p.text, /کارشناس: <b>یک<\/b>/);
  assert.match(p.text, /مانده روی: بررسی سوابق/);
  assert.deepEqual(cbs(p), ["tq:e:5", "tq:a:91", "tq:t"]);
});

/* ---------- ریزه‌کاری‌ها ---------- */

test("دکمهٔ منو به فهرست تیم می‌رود", () => {
  assert.deepEqual(teamMenuKb().flat().map((b) => b.callback_data), ["tq:t"]);
});

/* ---------- نقطهٔ ورودِ دکمه‌ها ---------- */

/** تلگرام بدلی — فقط ثبت می‌کند چه چیزی صدا زده شد */
function fakeApi() {
  const log = [];
  return {
    log,
    answerCallback: async (id, text, alert) => { log.push(["ack", text || "", !!alert]); },
    editMessageText: async (chat, mid, text, kb) => { log.push(["edit", text, kb]); },
    sendMessage: async (chat, text, kb) => { log.push(["send", text, kb]); },
  };
}
const CQ = (data) => ({ id: "cb1", data, message: { message_id: 7, chat: { id: 555 } } });

test("دکمه از گفت‌وگوی وصل‌نشده: هشدار، و هیچ داده‌ای فرستاده نمی‌شود", async () => {
  const api = fakeApi();
  await handleTeamCallback(env({ senior: null }), api, CQ("tq:t"));
  assert.deepEqual(api.log.map((l) => l[0]), ["ack"], "نباید چیزی جز پاسخ دکمه برود");
  assert.match(api.log[0][1], /وصل نیست/);
  assert.equal(api.log[0][2], true, "باید هشدار نمایشی باشد");
});

test("دکمهٔ معتبر: همان پیام ویرایش می‌شود، نه پیام تازه", async () => {
  const api = fakeApi();
  await handleTeamCallback(env({ team: [{ id: 5, name: "کارشناس یک", label: "یک", live: 1 }], assigns: [ASSIGN] }), api, CQ("tq:t"));
  assert.deepEqual(api.log.map((l) => l[0]), ["ack", "edit"]);
  assert.match(api.log[1][1], /تیم ارشد/);
  assert.deepEqual(api.log[1][2].flat().map((b) => b.callback_data), ["tq:e:5", "tq:t"]);
});

test("دکمهٔ بیگانه (مال بات کارشناسان): فقط ساعت شنی برداشته می‌شود", async () => {
  const api = fakeApi();
  await handleTeamCallback(env({}), api, CQ("seen:a:5"));
  assert.deepEqual(api.log.map((l) => l[0]), ["ack"]);
});

test("خطای دیتابیس گفت‌وگو را قفل نمی‌کند — دکمه باز هم پاسخ می‌گیرد", async () => {
  const api = fakeApi();
  const broken = { DB: { prepare: () => { throw new Error("D1 down"); } } };
  await handleTeamCallback(broken, api, CQ("tq:t"));
  assert.deepEqual(api.log.map((l) => l[0]), ["ack"]);
  assert.match(api.log[0][1], /خطا/);
});

test("گفت‌وگوی وصل‌نشده کارشناس ارشد ندارد", async () => {
  const e = env({ senior: null });
  assert.equal(await seniorOfChat(e, "999"), null);
  /* فقط بات تیمی، فقط ارشدِ فعال — چهار قید، هر چهار در همان کوئری */
  const sql = e._calls[0].sql;
  for (const cond of ["team_chat=?", "team_via='team'", "senior=1", "active=1"]) assert.ok(sql.includes(cond), cond);
});
