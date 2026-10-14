/* ============================================================
   کارت‌های دانش، کارتِ وضعیت‌ها و پرامپت‌های P0 و P1 بستهٔ «درخواست تغییر ۰۲» ← worker/strategy/kb-data.js

     node backend/tamin-poshtibani/tools/build-cr02-kb.mjs --pkg "<…/02_procurement_strategy_v2>"

   «سند راهبرد» (worker/strategy-doc.js) این‌ها را در زمینهٔ فراخوانِ P1 می‌گذارد. در پرونده می‌مانند، نه در D1: هیچ نوشتنی
   در پایگاه داده لازم نیست و نسخه‌شان با کد عوض می‌شود. فقط پوشه‌هایی که پروفایل‌ها به آن‌ها ارجاع می‌دهند (S، T، C، K، MS و I)؛
   classification (یک مگابایت دادهٔ خوشه‌ها) در پروفایلِ هر نوع قلم هست و این‌جا نمی‌آید.
   ============================================================ */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PKG = arg("--pkg", process.env.CR02_ROOT);
if (!PKG) { console.error("--pkg لازم است"); process.exit(2); }
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../../../worker/strategy/kb-data.js");
const read = (...p) => readFileSync(join(PKG, ...p), "utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n");
const MAX_CARD = 9000;

/* کارت: front matter (id، title، summary) + متن؛ خط‌های خالیِ پیاپی یکی */
function card(text) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  const fm = {};
  if (m) for (const ln of m[1].split("\n")) { const k = /^(\w+):\s*(.*)$/.exec(ln); if (k) fm[k[1]] = k[2].replace(/^"|"$/g, ""); }
  let body = (m ? text.slice(m[0].length) : text).replace(/\n{3,}/g, "\n\n").trim();
  if (body.length > MAX_CARD) body = `${body.slice(0, MAX_CARD)}\n…`;
  return { id: fm.id || null, title: fm.title || null, summary: fm.summary || null, body };
}
const KB = {};
for (const dir of ["situations", "tactics", "concepts", "commercial", "market_structures", "indicators"]) {
  for (const f of readdirSync(join(PKG, "07_knowledge_base", dir)).filter((x) => x.endsWith(".md")).sort()) {
    const c = card(read("07_knowledge_base", dir, f));
    const id = c.id || f.replace(/_.*$/, "").replace(/\.md$/, "");
    KB[id] = { title: c.title, summary: c.summary, body: c.body };
  }
}
const cat = JSON.parse(read("02_catalogue", "negotiation_states.json"));
const STATES = {};
for (const s of cat.states) { const { name_en, ...rest } = s; STATES[s.id] = rest; }
const strip = (s) => s.replace(/<!--[\s\S]*?-->/g, "").replace(/\n{3,}/g, "\n\n").trim();
const P0 = strip(read("04_prompts", "P0_system_core.md"));
const P1 = strip(read("04_prompts", "P1_planner.md"));
const P3 = strip(read("04_prompts", "P3_state_classifier.md"));
const P4 = strip(read("04_prompts", "P4_negotiator.md"));
const CLASSIFIER_SCHEMA = JSON.parse(read("04_prompts", "schemas", "classifier.schema.json"));
const TURN_SCHEMA = JSON.parse(read("04_prompts", "schemas", "turn.schema.json"));
const PLAN_SCHEMA = JSON.parse(read("04_prompts", "schemas", "plan.schema.json"));
const MOVES = JSON.parse(read("02_catalogue", "moves.json"));
const pm = JSON.parse(read("03_data", "MANIFEST.json"));

/* نسخه فقط از آنچه سندِ راهبرد (P1) می‌خواند — افزودنِ P3 و P4 سندها را دوباره نمی‌سازد */
const payload = JSON.stringify({ KB, STATES, P0, P1, PLAN_SCHEMA, MOVES });
const sha = createHash("sha256").update(payload).digest("hex").slice(0, 16);
const out = `/* ساخته‌شده با backend/tamin-poshtibani/tools/build-cr02-kb.mjs از بستهٔ «درخواست تغییر ۰۲» — دستی ویرایش نشود.
   کارت‌های دانش (${Object.keys(KB).length})، کارتِ وضعیت‌ها (${Object.keys(STATES).length})، پرامپت‌های P0، P1، P3 و P4 و طرح‌واره‌های خروجیِ P1، P3 و P4. */
export const KB_VERSION = ${JSON.stringify(`${pm.version || ""}+${sha}`)};
export const KB = ${JSON.stringify(KB)};
export const STATES = ${JSON.stringify(STATES)};
export const MOVES = ${JSON.stringify(MOVES)};
export const P0 = ${JSON.stringify(P0)};
export const P1 = ${JSON.stringify(P1)};
export const PLAN_SCHEMA = ${JSON.stringify(PLAN_SCHEMA)};
export const P3 = ${JSON.stringify(P3)};
export const P4 = ${JSON.stringify(P4)};
export const CLASSIFIER_SCHEMA = ${JSON.stringify(CLASSIFIER_SCHEMA)};
export const TURN_SCHEMA = ${JSON.stringify(TURN_SCHEMA)};
`;
writeFileSync(OUT, out);
console.log(`kb-data.js: ${Object.keys(KB).length} کارت، ${Object.keys(STATES).length} وضعیت، ${Math.round(Buffer.byteLength(out) / 1024)} KB، نسخه ${pm.version || "?"}+${sha}`);
