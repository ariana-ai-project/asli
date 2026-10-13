/* ============================================================
   فایلِ آزمونِ برابریِ موتور راهبرد با بستهٔ «درخواست تغییر ۰۲» (معیارهای E2 و E3 بسته)
     node backend/tamin-poshtibani/tools/build-cr02-fixtures.mjs "<ریشهٔ بسته: …/02_procurement_strategy_v2>"
   ← backend/tamin-poshtibani/tests/fixtures/cr02-parity.json.gz
   از هر پروفایلِ نوع قلم فقط فیلدهایی که profile.js می‌خواند به‌علاوهٔ سیاستِ ذخیره‌شده‌اش، ۴۰ سناریوی پذیرش و شناسهٔ
   وضعیت‌های فهرست. هر بار بسته عوض شد دوباره اجرا شود؛ آزمونِ strategy-parity.test.mjs همین را می‌خواند.
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = process.argv[2] || process.env.CR02_ROOT;
if (!ROOT) { console.error("ریشهٔ بسته را بدهید"); process.exit(2); }
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "tests", "fixtures", "cr02-parity.json.gz");
const lines = (f) => readFileSync(join(ROOT, f), "utf8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o && o[k] !== undefined).map((k) => [k, o[k]]));

const profiles = lines("03_data/item_strategy_profiles.jsonl").map((r) => ({
  item_head: r.item_head,
  rec: {
    cluster_main: r.cluster_main,
    spend: pick(r.spend, ["spend_bn_real", "impact_high"]),
    indicators: pick(r.indicators, ["n_sup_recent"]),
    classification: pick(r.classification, ["ms", "labels", "quadrant", "coordination_risk", "supply_power", "dependence", "class_source"]),
    confidence: { band: (r.confidence || {}).band, review: pick((r.confidence || {}).review, ["disputed", "rfq_caution", "rater2"]) },
  },
  rfq_policy: r.rfq_policy,
  watch_states: (r.negotiation_defaults || {}).watch_states || [],
}));
const scenarios = lines("08_tests/scenarios.jsonl");
const cat = JSON.parse(readFileSync(join(ROOT, "02_catalogue/negotiation_states.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(ROOT, "03_data/MANIFEST.json"), "utf8"));
const body = { built_from: { version: "2.0", profiles: profiles.length, scenarios: scenarios.length,
  profiles_sha256: createHash("sha256").update(readFileSync(join(ROOT, "03_data/item_strategy_profiles.jsonl"))).digest("hex") },
  manifest, state_ids: cat.states.map((s) => s.id), profiles, scenarios };
mkdirSync(dirname(OUT), { recursive: true });
const gz = gzipSync(Buffer.from(JSON.stringify(body)), { level: 9 });
writeFileSync(OUT, gz);
console.log(`${OUT}: ${profiles.length} profiles, ${scenarios.length} scenarios, ${body.state_ids.length} states, ${gz.length} bytes`);
