/* ============================================================
   ورودِ دادهٔ تحقیقِ «درخواست تغییر ۰۲» به D1 — ساختِ فایل‌های SQL (لایهٔ تحقیق؛ لایهٔ کارشناس دست نمی‌خورد)

     node backend/tamin-poshtibani/tools/cr02-import.mjs --pkg "<…/02_procurement_strategy_v2>" \
          --master "<…/6_supplier_master_for_system.xlsx>" --out "<پوشهٔ خروجی>" [--check]

   خروجی: ۰۱_heads.sql … ۰۷_alias.sql و manifest.json (شمار ردیف، شمارِ نوشتنِ برآوردی و sha256 هر ورودی).
   --check: همان SQL را در یک SQLite درون‌حافظه با طرحِ worker/cr-data.js اجرا می‌کند و شمارش‌ها را با فهرستِ بسته
   (MANIFEST.json) و فایل ۶ می‌سنجد (معیار E4). اجرای روی تولید با wrangler و تأییدِ مالک است:
     npx wrangler d1 execute tamin-poshtibani --remote --file "<پوشه>/01_heads.sql"   (یکی‌یکی، با شمارِ نوشتنِ manifest)
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { Xlsx } from "./xlsx-read.mjs";
import { CR02_DDL, CR_SHARDS, crShard, supKey, natureOfEvidence } from "../../../worker/cr-data.js";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PKG = arg("--pkg", process.env.CR02_ROOT);
const MASTER = arg("--master", process.env.CR02_MASTER);
const OUT = arg("--out", null);
const CHECK = process.argv.includes("--check");
if (!PKG || !MASTER || !OUT) { console.error("--pkg، --master و --out لازم است"); process.exit(2); }
mkdirSync(OUT, { recursive: true });
const NOW = Date.now();
const VERSION = "2.0";
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
const lines = (f) => readFileSync(f, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));

/** CSV با RFC 4180 (نقل‌قول‌های دوتایی، خطِ تازه درون نقل‌قول) ← آرایهٔ شیء با سرستون‌ها */
function csv(f) {
  const s = readFileSync(f, "utf8").replace(/^﻿/, "");
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && s[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift();
  return rows.filter((r) => r.length > 1 || r[0]).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}
const num = (v) => { if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const nz = (v) => (v == null || v === "" ? null : v);
const bool = (v) => v === true || v === "True" || v === "true" || v === "1";

/* ---------------- نوشتنِ SQL: چند ردیف در هر دستور، هر دستور کمتر از ۹۰ کیلوبایت (بایتِ UTF-8؛ سقفِ D1 صد کیلوبایت است و
   هر حرفِ فارسی دو بایت — شمردنِ نویسه دستورهای ۱۸۰ کیلوبایتی می‌ساخت و D1 با SQLITE_TOOBIG ردشان می‌کرد) ---------------- */
const lit = (v) => (v == null ? "NULL" : typeof v === "number" ? (Number.isFinite(v) ? String(v) : "NULL") : `'${String(v).replace(/'/g, "''")}'`);
const MAX_STMT = 90_000;
const bytes = (s) => Buffer.byteLength(s, "utf8");
const FILES = [];
function sqlFile(name, table, cols, rows, { writesPerRow = 1, mode = "INSERT OR REPLACE" } = {}) {
  const out = [];
  let cur = [], size = 0;
  const head = `${mode} INTO ${table} (${cols.join(",")}) VALUES\n`;
  const hb = bytes(head);
  const flush = () => { if (cur.length) out.push(head + cur.join(",\n") + ";"); cur = []; size = hb; };
  size = hb;
  for (const r of rows) {
    const t = `(${cols.map((c) => lit(r[c])).join(",")})`;
    const tb = bytes(t);
    if (tb + hb > MAX_STMT) throw new Error(`${table}: یک ردیف ${tb} بایت است`);
    if (size + tb + 2 > MAX_STMT) flush();
    cur.push(t); size += tb + 2;
  }
  flush();
  writeFileSync(join(OUT, name), out.join("\n") + "\n");
  FILES.push({ file: name, table, rows: rows.length, statements: out.length, writes_estimate: rows.length * writesPerRow });
  return out;
}

/* ---------------- ۱. نوع قلم‌ها ---------------- */
const profiles = lines(join(PKG, "03_data/item_strategy_profiles.jsonl"));
const flat = new Map(csv(join(PKG, "03_data/item_head_strategy.csv")).map((r) => [r.item_head, r]));
const heads = profiles.map((p) => {
  const f = flat.get(p.item_head) || {};
  const cl = p.classification || {}, rp = p.rfq_policy || {};
  return { head: p.item_head, cluster: nz(p.cluster_main), ms: nz(cl.ms), labels: (cl.labels || []).join(" "), quadrant: nz(cl.quadrant), tier: nz((p.spend || {}).tier || rp.tier),
    rfq_mode: nz(rp.mode), competition_mode: nz(rp.competition_mode), n_wave1: num(rp.n_wave1), n_max: num(rp.n_max), workflow: nz(f.workflow_class),
    priority: nz(f.expert_priority || ((p.expert_review || {}).priority)), confidence: nz((p.confidence || {}).band), review_status: nz(f.review_status),
    spend_bn: num((p.spend || {}).spend_bn_real), spend_rank: num(f.spend_rank), rec: JSON.stringify(p), version: nz(p.version), as_of: nz(p.as_of), imported_at: NOW };
});
sqlFile("01_heads.sql", "cr_heads", ["head", "cluster", "ms", "labels", "quadrant", "tier", "rfq_mode", "competition_mode", "n_wave1", "n_max", "workflow", "priority",
  "confidence", "review_status", "spend_bn", "spend_rank", "rec", "version", "as_of", "imported_at"], heads);

/* ---------------- ۲. کد قلم‌ها (۶۴ تکه) ---------------- */
const codeRows = csv(join(PKG, "03_data/item_code_index.csv"));
const codeShards = new Map();
for (const r of codeRows) {
  const sh = crShard(r.item_code);
  if (!codeShards.has(sh)) codeShards.set(sh, {});
  const o = { h: r.item_head, c: nz(r.cluster), u: nz(r.unit_key), r: nz(r.ref_unit), i: nz(r.index_code), n: num(r.purchase_rows) || 0 };
  if (nz(r.item_ms_override)) o.ms = r.item_ms_override;
  if (nz(r.item_labels_add)) o.la = r.item_labels_add;
  if (nz(r.item_exception_reason)) o.why = r.item_exception_reason;
  if (bool(r.has_recipient_plan)) o.p = 1;
  codeShards.get(sh)[String(r.item_code).trim()] = o;
}
sqlFile("02_codes.sql", "cr_codes", ["shard", "data"], [...codeShards].map(([shard, d]) => ({ shard, data: JSON.stringify(d) })));

/* ---------------- ۳. قیمت مرجع (۶۴ تکه) ---------------- */
const priceRows = csv(join(PKG, "03_data/item_price_reference.csv"));
const priceShards = new Map();
for (const r of priceRows) {
  const sh = crShard(r.item_code);
  if (!priceShards.has(sh)) priceShards.set(sh, {});
  const d = priceShards.get(sh), k = String(r.item_code).trim();
  (d[k] ||= []).push({ u: nz(r.ref_unit), n: num(r.n_all), n24: num(r.n_24m), s24: num(r.n_sup_24m), m24: num(r.median_real_24m), p25: num(r.p25_real_24m), p75: num(r.p75_real_24m),
    m: num(r.median_real_all), ld: nz(r.last_date), lr: num(r.last_price_real), ln: num(r.last_price_nominal), ls: nz(r.last_sup_id), q: nz(r.ref_quality), i: nz(r.index_code) });
}
sqlFile("03_prices.sql", "cr_prices", ["shard", "data"], [...priceShards].map(([shard, d]) => ({ shard, data: JSON.stringify(d) })));

/* ---------------- ۴ و ۵. فایل ۶: تأمین‌کنندگان و رتبه‌ها ---------------- */
const X = new Xlsx(MASTER);
const SH = Object.fromEntries(X.sheets().map((s) => [s.name, s.file]));
/* نام ماشینیِ ستون‌ها از برگهٔ «طرح‌واره»ی خودِ فایل (نه حدس) */
const schema = {};
await X.rows(SH["طرح‌واره"], (r, rn) => { if (rn > 1 && r.A && r.C && r.E) (schema[r.A] ||= {})[r.C] = r.E; });
const named = (sheet, r) => Object.fromEntries(Object.entries(r).map(([col, v]) => [schema[sheet][col] || col, v]));

const discovered = [];
await X.rows(SH["تأمین‌کنندگان"], (r, rn) => { if (rn > 1 && r.A) discovered.push(named("تأمین‌کنندگان", r)); });
const DROP = new Set(["رد در دروازه", "زیر کف امتیاز", "پایین‌تر از ۴۰"]);
const units = new Map();
let rankRows = 0, rankKept = 0;
await X.rows(SH["تأمین‌کننده × نوع قلم"], (r, rn) => {
  if (rn === 1) return;
  rankRows++;
  const o = named("تأمین‌کننده × نوع قلم", r);
  const rank = num(o.rank_in_unit);
  if (rank == null || rank > 40 || DROP.has(o.status)) return;
  rankKept++;
  if (!units.has(o.unit_key)) units.set(o.unit_key, []);
  /* پنج خانهٔ آخر (مهر ۱۴۰۵) برای «🗂 تأمین‌کنندگان کشف‌شده»ِ تب جستجوی هوشمند (worker/discovered.js): بازهٔ امتیاز، مبنای رتبه و شاهدِ تناسب */
  units.get(o.unit_key).push([o.supplier_id, o.fit === "اصلی" ? 1 : 0, rank, o.status, num(o.score), num(o.p_top10), num(o.score_low), num(o.score_high),
    nz(o.rank_basis), nz(o.fit_quote) ? String(o.fit_quote).slice(0, 300) : null, nz(o.fit_url)]);
});
const unitCov = new Map();
await X.rows(SH["انواع قلم"], (r, rn) => { if (rn > 1 && r.A) { const o = named("انواع قلم", r); unitCov.set(o.unit_key, o); } });
X.close();

const unitProf = new Map(lines(join(PKG, "03_data/unit_profiles.jsonl")).map((u) => [`${u.clu}|${u.head}`, u]));
/* کدهای قلمِ هر واحد — تأمین‌کنندگانِ فعلیِ واحد از سوابقِ همین کدها (worker/cr-engine.js) بی بازکردنِ تکه‌های کد */
const unitCodes = new Map();
for (const r of codeRows) if (nz(r.unit_key)) { if (!unitCodes.has(r.unit_key)) unitCodes.set(r.unit_key, []); unitCodes.get(r.unit_key).push(String(r.item_code).trim()); }
const unitKeys = new Set([...units.keys(), ...unitProf.keys(), ...unitCov.keys()]);
const unitRows = [...unitKeys].map((k) => {
  const [cluster, ...h] = k.split("|");
  const cands = (units.get(k) || []).sort((a, b) => a[2] - b[2]);
  const cov = unitCov.get(k) || {};
  const up = unitProf.get(k) || null;
  return { unit_key: k, head: h.join("|"), cluster, cands: JSON.stringify(cands),
    unit: JSON.stringify({ ...(up || {}), codes: unitCodes.get(k) || [], cluster_name: cov.cluster_name ?? null, route: cov.market_route ?? (up && up.route) ?? null, wave: cov.wave ?? null, segment: cov.segment ?? null,
      foreign_markets: cov.foreign_markets ?? null, n_found: num(cov.n_found), n_found_exact: num(cov.n_found_exact), n_confirmed: num(cov.n_confirmed), weight_source: cov.weight_source ?? null }),
    imported_at: NOW };
});
sqlFile("04_units.sql", "cr_units", ["unit_key", "head", "cluster", "cands", "unit", "imported_at"], unitRows);

/* دفتر: کشف‌شده‌ها (فایل ۶) و تأمین‌کنندگانِ سوابق (بسته) */
const KEEP_D = ["legal_name", "brand_name", "latin_name", "country_code", "supplier_type", "chain_role", "national_id", "registration_no", "registration_place", "established",
  "registry_status", "registered_capital", "manager", "address", "postal_code", "fax", "email", "website", "social", "verified_contacts", "branches_n", "branches", "brands",
  "products", "enamad", "certificates", "memberships", "gates_summary", "open_gates", "g4_review", "last_activity", "last_activity_date", "discovery_channel", "clusters",
  "n_units", "n_units_exact", "n_item_codes", "best_rank", "best_rank_unit", "n_top10", "n_top40", "top10_units", "completeness", "other", "todo", "sources", "checked"];
const sregRows = [];
for (const d of discovered) {
  const data = Object.fromEntries(KEEP_D.filter((k) => d[k] != null && d[k] !== "").map((k) => [k, d[k]]));
  sregRows.push({ sid: d.supplier_id, kind: "new", name: d.name || d.brand_name || d.legal_name || d.supplier_id, name_n: supKey(d.name || d.brand_name || d.legal_name || d.supplier_id),
    hub: nz(d.hub), province: nz(d.province), city: nz(d.city), role: nz(d.chain_role), country: nz(d.country), verification: num(d.verification),
    phones: nz(d.phones), mobiles: nz(d.mobiles), data: JSON.stringify(data), version: VERSION, imported_at: NOW });
}
const existing = lines(join(PKG, "03_data/supplier_profiles_existing.jsonl"));
for (const e of existing) {
  const { supplier_id, name, ...rest } = e;
  sregRows.push({ sid: String(supplier_id), kind: "old", name: name || String(supplier_id), name_n: supKey(name || String(supplier_id)), hub: null, province: null, city: null,
    role: nz(e.role_hint), country: "ایران", verification: 2, phones: null, mobiles: null, data: JSON.stringify(rest), version: VERSION, imported_at: NOW });
}
sqlFile("05_sreg.sql", "sreg", ["sid", "kind", "name", "name_n", "hub", "province", "city", "role", "country", "verification", "phones", "mobiles", "data", "version", "imported_at"], sregRows, { writesPerRow: 2 });

/* ---------------- ۶. یال‌ها ---------------- */
const edgeRows = csv(join(PKG, "03_data/supplier_edges.csv")).map((r) => ({ a: String(r.from_id), b: String(r.to_id), ev: nz(r.type), nature: natureOfEvidence(r.type), strength: nz(r.strength),
  directed: bool(r.directed) ? 1 : 0, evidence: nz(r.evidence), source: nz(r.source) || "تحقیق", status: nz(r.status) || "پیشنهادی", by_kind: "research", at: NOW }));
/* id ثابت (۱ تا n) تا ورودِ دوباره همان یال را جایگزین کند، نه دوتا */
edgeRows.forEach((r, i) => { r.id = i + 1; });
sqlFile("06_edges.sql", "sreg_edges", ["id", "a", "b", "ev", "nature", "strength", "directed", "evidence", "source", "status", "by_kind", "at"], edgeRows, { writesPerRow: 3 });

/* ---------------- ۷. «نام نزدیک» (G4): پیشنهادِ ادغامِ کشف‌شده با تأمین‌کنندهٔ سوابق ---------------- */
const oldByKey = new Map();
for (const e of existing) { const k = supKey(e.name); if (k && !oldByKey.has(k)) oldByKey.set(k, String(e.supplier_id)); }
const aliasRows = [];
let g4 = 0, g4found = 0;
for (const d of discovered) {
  const txt = d.g4_review || "";
  if (!txt) continue;
  g4++;
  const m = /«([^»]+)»/.exec(txt);
  const target = m ? oldByKey.get(supKey(m[1])) : null;
  if (target) g4found++;
  /* همهٔ «نام نزدیک»ها برای بازبینیِ پشتیبانی؛ sid خالی یعنی تأمین‌کنندهٔ سوابقِ هم‌نام را پشتیبان پیدا کند.
     تأیید ← ردیفِ «merge» (worker/sreg.js)؛ این ردیف فقط پیشنهاد است */
  aliasRows.push({ kind: "g4", alias: d.supplier_id, sid: target || "", status: "پیشنهادی", note: txt.slice(0, 400), by_kind: "research", by_name: "تحقیق (G4)", at: NOW });
}
sqlFile("07_alias.sql", "sreg_alias", ["kind", "alias", "sid", "status", "note", "by_kind", "by_name", "at"], aliasRows, { writesPerRow: 2 });

/* ---------------- گزارش ---------------- */
const manifest = { version: VERSION, built_at: new Date(NOW).toISOString(),
  inputs: { profiles: sha(join(PKG, "03_data/item_strategy_profiles.jsonl")), master: sha(MASTER) },
  counts: { heads: heads.length, codes: codeRows.length, code_shards: codeShards.size, prices: priceRows.length, price_shards: priceShards.size,
    units: unitRows.length, rank_rows: rankRows, rank_kept: rankKept, sreg_new: discovered.length, sreg_old: existing.length, edges: edgeRows.length, g4, g4_matched: g4found },
  files: FILES, writes_estimate: FILES.reduce((s, f) => s + f.writes_estimate, 0) };
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));
console.log(JSON.stringify(manifest.counts), "writes≈", manifest.writes_estimate);
for (const f of FILES) console.log(`${f.file}: ${f.rows} ردیف در ${f.statements} دستور، نوشتنِ برآوردی ${f.writes_estimate}`);

/* ---------------- --check: اجرا در SQLite و سنجش با فهرستِ بسته (E4) ---------------- */
if (CHECK) {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(":memory:");
  db.exec(CR02_DDL);
  for (const f of FILES) db.exec(readFileSync(join(OUT, f.file), "utf8"));
  const n = (t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
  const pm = JSON.parse(readFileSync(join(PKG, "03_data/MANIFEST.json"), "utf8")).files;
  const want = { cr_heads: pm["item_strategy_profiles.jsonl"].rows, sreg: pm["supplier_profiles_discovered.jsonl"].rows + pm["supplier_profiles_existing.jsonl"].rows,
    sreg_edges: pm["supplier_edges.csv"].rows };
  const got = { cr_heads: n("cr_heads"), sreg: n("sreg"), sreg_edges: n("sreg_edges"), cr_units: n("cr_units"), cr_codes: n("cr_codes"), cr_prices: n("cr_prices"), sreg_alias: n("sreg_alias") };
  const codesIn = Object.values(Object.fromEntries(db.prepare("SELECT shard, data FROM cr_codes").all().map((r) => [r.shard, Object.keys(JSON.parse(r.data)).length]))).reduce((s, x) => s + x, 0);
  const pricesIn = db.prepare("SELECT data FROM cr_prices").all().reduce((s, r) => s + Object.values(JSON.parse(r.data)).reduce((a, x) => a + x.length, 0), 0);
  const bad = [];
  for (const [t, w] of Object.entries(want)) if (got[t] !== w) bad.push(`${t}: ${got[t]} ≠ ${w}`);
  if (codesIn !== pm["item_code_index.csv"].rows) bad.push(`کد قلم: ${codesIn} ≠ ${pm["item_code_index.csv"].rows}`);
  if (pricesIn !== pm["item_price_reference.csv"].rows) bad.push(`قیمت مرجع: ${pricesIn} ≠ ${pm["item_price_reference.csv"].rows}`);
  if (manifest.inputs.profiles !== pm["item_strategy_profiles.jsonl"].sha256) bad.push("sha256 پروفایل‌ها با فهرست بسته نمی‌خواند");
  console.log("check:", JSON.stringify(got), bad.length ? `✖ ${bad.join(" | ")}` : "✔ با فهرست بسته می‌خواند");
  if (bad.length) process.exit(1);
}
