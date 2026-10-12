/* ============================================================
   نگهبانِ بودجهٔ خواندنِ D1 در اجرا (مهر ۱۴۰۵)
   سقفِ طرح رایگان روزی ۵ میلیون ردیف خواندن است. هر بار که پر شد، علت یک دستورِ پرتکرار بود که کلِ یک جدولِ بزرگ را
   می‌خواند (نظرسنجیِ پنل هر چند ثانیه). backend/tamin-poshtibani/tests/d1-budget.test.mjs پیش از انتشار جلویش را می‌گیرد؛
   این یکی در اجرا: هر دستوری که بیش از HEAVY ردیف بخواند و در ۱۰ دقیقه دست‌کم ۳ بار تکرار شود (الگوی نظرسنجی، نه یک
   گزارشِ دستی) یک هشدار «پایگاه داده» برای پشتیبان می‌سازد (نوار هشدار + اعلان گوشی؛ نه پیامک و نه مدیر) — هر امضا
   هر ۶ ساعت یک بار. هیچ رفتاری عوض نمی‌شود: فقط meta.rows_read ِ نتیجه خوانده می‌شود. خاموش: متغیر D1_GUARD=off.
   ============================================================ */
import { pushTo, SUPPORT } from "./push.js";

export const HEAVY = 10000;                 /* ردیفِ خوانده‌شده در یک دستور */
const WINDOW = 10 * 60e3, REPEAT = 3, QUIET = 6 * 3600e3;
const hits = new Map();                     /* امضا ← زمان‌های سنگین‌شدن (همین isolate) */
const told = new Map();                     /* امضا ← آخرین هشدار */
const RAW = new WeakMap();                  /* دستورِ پیچیده ← دستورِ اصلی (برای batch) */
const SQL = new WeakMap();                  /* دستورِ اصلی ← متن */
const DBS = new WeakMap();                  /* پایگاهِ اصلی ← پیچیده */
const ENVS = new WeakMap();                 /* env اصلی ← پیچیده */

const sigOf = (sql) => String(sql || "").replace(/\s+/g, " ").trim().slice(0, 160);

/** env با DBِ پیچیده؛ برای هر env همان یکی (کش‌هایی که به env بسته‌اند عوض نمی‌شوند)، تغییرهای بعدیِ env پیداست */
export function guardEnv(env) {
  if (!env || !env.DB || env.D1_GUARD === "off") return env;
  if (ENVS.has(env)) return ENVS.get(env);
  const p = new Proxy(env, { get(t, k) { return k === "DB" ? guardDB(t.DB, t) : t[k]; } });
  ENVS.set(env, p);
  return p;
}

function guardDB(db, env) {
  if (!db || typeof db.prepare !== "function") return db;
  if (DBS.has(db)) return DBS.get(db);
  const note = async (sql, meta) => {
    const rows = meta ? Number(meta.rows_read ?? meta.rowsRead) : NaN;
    if (!(rows > HEAVY)) return;
    const sig = sigOf(sql), t = Date.now();
    const list = (hits.get(sig) || []).filter((x) => t - x < WINDOW); list.push(t); hits.set(sig, list);
    console.warn("d1 heavy read", rows, sig);
    if (list.length < REPEAT || t - (told.get(sig) || 0) < QUIET) return;
    told.set(sig, t);
    await record(db, env, sig, rows, list.length).catch((e) => console.error("d1 guard alarm", e && e.message));
  };
  const wrap = (st, sql) => {
    if (!st || typeof st !== "object") return st;
    SQL.set(st, sql);
    const p = new Proxy(st, {
      get(t, k) {
        if (k === "bind") return (...a) => wrap(t.bind(...a), sql);
        if (k === "all" || k === "run") return async (...a) => { const r = await t[k](...a); if (r && r.meta) await note(sql, r.meta); return r; };
        const v = t[k];
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
    RAW.set(p, st);
    return p;
  };
  const p = new Proxy(db, {
    get(t, k) {
      if (k === "prepare") return (sql) => wrap(t.prepare(sql), sql);
      if (k === "batch") return async (list) => {
        const raw = (list || []).map((s) => RAW.get(s) || s);
        const out = await t.batch(raw);
        if (Array.isArray(out)) for (let i = 0; i < out.length; i++) if (out[i] && out[i].meta) await note(SQL.get(raw[i]), out[i].meta);
        return out;
      };
      const v = t[k];
      return typeof v === "function" ? v.bind(t) : v;
    },
  });
  DBS.set(db, p);
  return p;
}

/** هشدار برای پشتیبان (مدیر از پیش «دیده»)، با دوری از تکرار در پایگاه هم (چند isolate) */
async function record(db, env, sig, rows, n) {
  const t = Date.now(), payload = JSON.stringify({ sig, rows, n });
  const dup = await db.prepare("SELECT id FROM alarms WHERE at>? AND kind='db_heavy' AND payload_json LIKE ? LIMIT 1").bind(t - QUIET, `%${sig.slice(0, 60).replace(/[%_]/g, "")}%`).first();
  if (dup) return;
  const body = `${rows.toLocaleString("en-US")} ردیف در یک دستور، ${n} بار در ۱۰ دقیقه — سقف روزانه ۵ میلیون است. دستور: ${sig.slice(0, 120)}`;
  await db.prepare("INSERT INTO alarms (at,kind,title,body,payload_json,ack_m) VALUES (?,?,?,?,?,?)")
    .bind(t, "db_heavy", "پایگاه داده: خواندنِ سنگینِ تکراری", body, payload, t).run();
  /* env اصلی (نه پیچیده): پایگاهِ خام، بی دوباره‌پیچیدن */
  await pushTo(env, SUPPORT, { title: "⚠️ پایگاه داده: خواندن سنگین", body: "یک دستور مدام کلِ جدول را می‌خواند؛ جزئیات در نوار هشدارِ پنل پشتیبانی.", url: "support", tag: "dbheavy" });
}
