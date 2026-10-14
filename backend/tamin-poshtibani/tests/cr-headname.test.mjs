/* ============================================================
   نامِ نوع قلم در دادهٔ تحقیق (worker/cr-engine.js researchHead)

   ساختارِ تأییدشدهٔ کارشناس نامِ استانداردِ کاتالوگ است («ورق آهنی») و دادهٔ تحقیق نامِ خامِ فایل («ورق»)؛ مقایسهٔ حرف‌به‌حرف این
   اقلام را بی‌صدا از استراتژی، سندِ راهبرد و مذاکرهٔ دوگامی بیرون می‌گذاشت. حالا: خودِ نام، نوع قلمِ کدِ قلم، نوع قلم‌های فایلِ
   کاتالوگ، نیم‌فاصله و صفتِ جنس.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./run.mjs";
import { ensureSchema } from "../../../worker/api.js";
import { headPolicy, researchHead } from "../../../worker/cr-engine.js";
import { crShard } from "../../../worker/cr-data.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = { DB };
const REC = (head) => ({ item_head: head, cluster_main: "C08", classification: { ms: "MS-3", labels: [], quadrant: "Q2" }, spend: {}, indicators: {}, confidence: {},
  negotiation_defaults: { watch_states: [] } });

if (DB) {
  await ensureSchema(env);
  const t = Date.now();
  const ins = DB.raw.prepare("INSERT INTO cr_heads (head,cluster,ms,rfq_mode,competition_mode,n_wave1,n_max,tier,workflow,spend_rank,rec,version,imported_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,'2.0',?)");
  for (const h of ["ورق", "لپ‌تاپ", "شیلنگ"]) ins.run(h, "C08", "MS-3", "STANDARD", "STANDARD", 5, 6, "A", "ترکیبی", 1, JSON.stringify(REC(h)), t);
  DB.raw.prepare("INSERT INTO cr_codes (shard,data) VALUES (?,?)").run(crShard("1020300096"), JSON.stringify({ "1020300096": { h: "ورق", c: "C08", u: "کیلو گرم" } }));
  DB.raw.prepare("INSERT INTO cat_heads (head,part,data) VALUES (?,?,?)").run("ورق آهنی", 0, JSON.stringify({ ref: "کیلو گرم", n: 3, src: ["ورق"] }));
}

test("نامِ استاندارد ← نامِ تحقیق: با کدِ قلم، با نوع قلم‌های فایلِ کاتالوگ، نیم‌فاصله و صفتِ جنس", { skip: SKIP }, async () => {
  assert.equal(await researchHead(env, "ورق", null), "ورق", "خودِ نام");
  assert.equal(await researchHead(env, "نامِ بی‌ربط", "1020300096"), "ورق", "نوع قلمِ همین کد در دادهٔ تحقیق");
  assert.equal(await researchHead(env, "ورق آهنی", null), "ورق", "نوع قلم‌های فایل در کاتالوگ (src)");
  assert.equal(await researchHead(env, "لپ تاپ", null), "لپ‌تاپ", "شکلِ نیم‌فاصله‌ای");
  assert.equal(await researchHead(env, "شیلنگ لاستیکی", null), "شیلنگ", "بی صفتِ جنس");
  assert.equal(await researchHead(env, "پیچ و مهره", null), null, "در دادهٔ تحقیق نیست");
  const hp = await headPolicy(env, "ورق آهنی", { itemCode: "1020300096" });
  assert.equal(hp && hp.head, "ورق", "سیاستِ استعلام با نامِ تحقیق");
});
