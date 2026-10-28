/* ============================================================
   اثرِ تغییر — پیش و پس از هر ویرایش:
     node scripts/map/impact.mjs worker/discovered.js            ← فایل
     node scripts/map/impact.mjs worker/discovered.js#gateFor    ← تابع
     node scripts/map/impact.mjs worker/api.js:2887-2930          ← خط‌ها
     node scripts/map/impact.mjs "GET /search/smart"              ← مسیر
     node scripts/map/impact.mjs smart_searches                   ← جدول
     node scripts/map/impact.mjs expert.smart                     ← قابلیت
     node scripts/map/impact.mjs --changed [base]                 ← همهٔ تغییرهای کارِ جاری نسبت به HEAD (یا base)
   خروجی: قابلیت‌های درگیر و محلشان در رابط، تابع‌ها و خط‌هایی که باید خواند، مسیرها، فراخوان‌های پنل،
   دکمه‌های بات (سازنده ↔ پاسخ‌گو)، جدول‌ها، تست‌ها با دستورِ اجرا.
   شماره‌خط‌ها زنده از کد خوانده می‌شوند؛ نقشهٔ ثبت‌شده بی شماره‌خط است.
   ============================================================ */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { scan, samePath, ROOT } from "./scan.mjs";
import { buildModel, loadTaxonomy, HUB, TEST_DIR, OUT } from "./model.mjs";

const args = process.argv.slice(2).map((a) => a.replace(/\\/g, "/"));
if (!args.length) { console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 12).join("\n")); process.exit(0); }
const facts = scan(), tx = await loadTaxonomy(), m = buildModel(facts, tx);
const W = new Map(facts.worker.map((w) => [w.file, w])), FR = new Map(facts.front.map((f) => [f.file, f]));
const MAP_TEST = `${TEST_DIR}/product-map.test.mjs`;

/* ---------- نقطه‌های تغییر ---------- */
function touches() {
  const T = [];
  if (args[0] === "--changed") {
    const base = args[1] || "HEAD";
    const diff = execSync(`git diff -U0 ${base} --`, { cwd: ROOT, encoding: "utf8", maxBuffer: 256e6 });
    let cur = null;
    for (const l of diff.split("\n")) {
      if (l.startsWith("+++ ")) { cur = l === "+++ /dev/null" ? null : { file: l.slice(6), ranges: [] }; if (cur) T.push(cur); continue; }
      const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(l);
      if (h && cur) { const a = +h[1], n = h[2] === undefined ? 1 : +h[2]; cur.ranges.push([a, Math.max(a, a + n - 1)]); }
    }
    for (const u of execSync("git ls-files --others --exclude-standard", { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean)) T.push({ file: u, ranges: null });
    if (!T.length) { console.log("تغییری نسبت به " + base + " نیست."); process.exit(0); }
    return T;
  }
  for (const a of args) {
    let x;
    if (m.feats.has(a)) T.push({ feature: a });
    else if ((x = /^(.+?)#([\w$]+)$/.exec(a)) && existsSync(join(ROOT, x[1]))) T.push({ file: x[1], fns: [x[2]] });
    else if ((x = /^(.+?):(\d+)(?:-(\d+))?$/.exec(a)) && existsSync(join(ROOT, x[1]))) T.push({ file: x[1], ranges: [[+x[2], +(x[3] || x[2])]] });
    else if (existsSync(join(ROOT, a))) T.push({ file: a, ranges: null });
    else if ((x = /^(?:([A-Z|*]+)\s+)?(\/\S*|legal:\S*)$/.exec(a))) T.push({ route: { methods: x[1] ? x[1].split("|") : null, path: x[2] } });
    else if (m.tables.some((t) => t.name === a)) T.push({ table: a });
    else { console.error(`نشناختم: «${a}» — فایل، فایل#تابع، فایل:خط، مسیر، نام جدول یا شناسهٔ قابلیت بدهید.`); process.exit(2); }
  }
  return T;
}

/* ---------- انباشت نتیجه ---------- */
const R = { feats: new Map(), fns: new Map(), routes: new Map(), calls: new Map(), tables: { r: new Set(), w: new Set() }, tests: new Map(), pages: new Set(), notes: [], all: false, rebuild: false, direct: new Set() };
const why = (map, k, w) => { if (!map.has(k)) map.set(k, new Set()); map.get(k).add(w); };
const addF = (id, w) => { if (id) why(R.feats, id, w); };
const addT = (file, w) => why(R.tests, file, w);
/* direct: تابعی که خودش عوض شده (جدول‌هایش هم درگیرند)؛ ref: نامی که صدازننده به کار می‌برد → خط‌های همان ارجاع */
const texts = new Map(), linesOf = (file) => { if (!texts.has(file)) texts.set(file, readFileSync(join(ROOT, file), "utf8").split("\n")); return texts.get(file); };
const addFn = (file, fn, w, { direct = false, ref = null } = {}) => {
  const k = `${file}#${fn.name}`;
  if (!R.fns.has(k)) R.fns.set(k, { file, name: fn.name, start: fn.start, end: fn.end, why: new Set(), refs: new Set() });
  const e = R.fns.get(k); e.why.add(w);
  if (direct || w === "تغییرکرده") R.direct.add(k);
  if (ref) { const re = new RegExp(`\\b${ref}\\b`), ls = linesOf(file); for (let i = fn.start; i <= fn.end && e.refs.size < 6; i++) if (re.test(ls[i - 1] || "")) e.refs.add(i); }
  if (direct && fn.tables) { fn.tables.r.forEach((t) => R.tables.r.add(t)); fn.tables.w.forEach((t) => R.tables.w.add(t)); }
};
function addRoute(r, w) {
  const k = `${r.key}|${r.file}:${r.line}`;
  if (R.routes.has(k)) { R.routes.get(k).why.add(w); return; }
  R.routes.set(k, { ...r, why: new Set([w]) });
  r.features.forEach((id) => addF(id, `مسیر ${r.key}`));
  r.tables.r.forEach((t) => R.tables.r.add(t)); r.tables.w.forEach((t) => R.tables.w.add(t));
  for (const t of m.tests) if (t.paths.some((p) => samePath(r.path, p))) addT(t.file, `صدا می‌زند ${r.key}`);
  for (const c of m.calls) if (c.routes.includes(r.key)) { R.calls.set(`${c.file}:${c.line}`, c); for (const p of m.pages) if (p.scripts.includes(c.file)) R.pages.add(p.file); }
}
const usersOf = (key) => ({
  fns: facts.worker.flatMap((w) => w.functions.filter((f) => f.uses.includes(key)).map((f) => ({ file: w.file, fn: f }))),
  routes: m.routes.filter((r) => r.handler.uses.includes(key)),
});
const overlaps = (ranges, a, b) => ranges.some(([x, y]) => a <= y && x <= b);

function onWorker(t) {
  const w = W.get(t.file);
  addF(m.owner[t.file], "صاحبِ فایل");
  const byRange = t.ranges ? w.functions.filter((f) => overlaps(t.ranges, f.start, f.end)) : null;
  const direct = t.fns ? w.functions.filter((f) => t.fns.includes(f.name)) : byRange || w.functions;
  if (t.fns && !direct.length) R.notes.push(`${t.file}: تابعی به نام ${t.fns.join("، ")} پیدا نشد.`);
  if (t.ranges) {
    const out = t.ranges.filter(([a, b]) => !w.functions.some((f) => a <= f.end && f.start <= b));
    if (out.length) R.notes.push(`${t.file}: خطِ ${out.map(([a, b]) => (a === b ? a : `${a}-${b}`)).join("، ")} بیرون از تابع‌هاست (import یا ثابت) — کاربرانِ آن نام‌ها را هم ببینید.`);
  }
  /* مسیرهای خودِ فایل که خطشان عوض شده */
  const inFile = m.routes.filter((r) => r.file === t.file);
  const hit = !t.fns && !t.ranges ? inFile : inFile.filter((r) => (t.ranges && overlaps(t.ranges, r.line, r.end)) || (t.fns && t.fns.includes(r.fn)));
  for (const r of hit) addRoute(r, "خطِ همین مسیر");
  /* مسیریاب‌های بزرگ (api.js#route): فقط بلوکِ مسیرها، نه کل تابع */
  const routers = new Set(inFile.map((r) => r.fn));
  const touched = new Set(direct.filter((f) => !(routers.has(f.name) && (t.ranges || !t.fns))).map((f) => f.name));
  if (!t.fns && !t.ranges) return onWholeFile(t, w);
  for (const f of direct) if (!(routers.has(f.name) && t.ranges)) addFn(t.file, f, "تغییرکرده", { direct: true });
  /* صدازننده‌های همین فایل (تا سه لایه) و مسیرهای این فایل که از آن‌ها استفاده می‌کنند */
  let frontier = [...touched];
  for (let d = 0; d < 3 && frontier.length; d++) {
    const next = [];
    for (const f of w.functions) if (!touched.has(f.name) && f.calls.some((c) => frontier.includes(c))) {
      const via = f.calls.find((c) => frontier.includes(c));
      touched.add(f.name); next.push(f.name);
      if (!routers.has(f.name)) addFn(t.file, f, `صدا می‌زند ${via}`, { ref: via });
    }
    frontier = next;
  }
  for (const r of inFile) if (r.handler.calls.some((c) => touched.has(c))) addRoute(r, `از ${r.handler.calls.find((c) => touched.has(c))}`);
  /* کاربرانِ فایل‌های دیگر (دو لایه) */
  let layer = [...touched].filter((n) => w.exports.includes(n)).map((n) => `${t.file}#${n}`);
  const seen = new Set(layer);
  for (const k of layer) for (const tt of m.tests) if (tt.names.includes(k)) addT(tt.file, `import ${k.split("#")[1]}`);
  for (let d = 0; d < 2 && layer.length; d++) {
    const next = [];
    for (const k of layer) {
      const u = usersOf(k), nm = k.split("#")[1];
      for (const r of u.routes) addRoute(r, `از ${nm}`);
      for (const { file, fn } of u.fns) {
        const k2 = `${file}#${fn.name}`;
        if (seen.has(k2)) continue;
        seen.add(k2);
        const isRouter = m.routes.some((r) => r.file === file && r.fn === fn.name);
        if (isRouter) continue;
        addFn(file, fn, `صدا می‌زند ${nm}`, { ref: nm }); addF(m.owner[file], `صدا می‌زند ${nm}`); next.push(k2);
        for (const r of m.routes.filter((r) => r.file === file && r.handler.calls.includes(fn.name))) addRoute(r, `از ${fn.name}`);
        for (const tt of m.tests) if (tt.names.includes(k2)) addT(tt.file, `import ${fn.name}`);
      }
    }
    layer = next;
  }
}
function onWholeFile(t, w) {
  for (const fn of w.functions) R.direct.add(`${t.file}#${fn.name}`);
  for (const tt of m.tests) if (tt.imports.includes(t.file) && !HUB.has(t.file)) addT(tt.file, "import فایل");
  for (const n of w.exports) { const u = usersOf(`${t.file}#${n}`); for (const r of u.routes) addRoute(r, `از ${n}`); for (const { file } of u.fns) if (file !== t.file) addF(m.owner[file], `از ${n}`); }
  if (HUB.has(t.file)) { R.all = true; R.notes.push(`${t.file} مسیریابِ مرکزی است: برای تغییرِ نقطه‌ای، خط یا تابع بدهید (${t.file}:از-تا).`); }
}
function onFront(t) {
  addF(m.owner[t.file], "صاحبِ فایل");
  for (const p of m.pages) if (p.scripts.includes(t.file) || p.file === t.file) R.pages.add(p.file);
  for (const tt of m.tests) if (tt.fronts.includes(t.file)) addT(tt.file, "همین فایلِ پنل را اجرا می‌کند");
  const fr = FR.get(t.file);
  if (!fr) return;
  const fns = t.fns ? fr.functions.filter((f) => t.fns.includes(f.name)) : t.ranges ? fr.functions.filter((f) => overlaps(t.ranges, f.start, f.end)) : [];
  const inScope = (line) => (!t.fns && !t.ranges) || (t.ranges && overlaps(t.ranges, line, line)) || fns.some((f) => line >= f.start && line <= f.end);
  for (const f of fns) addFn(t.file, f, "تغییرکرده");
  for (const c of m.calls.filter((c) => c.file === t.file && inScope(c.line))) { R.calls.set(`${c.file}:${c.line}`, c); for (const key of c.routes) for (const r of m.routes.filter((r) => r.key === key)) addRoute(r, `فراخوان ${c.fn || ""}`); }
  for (const h of fr.help.filter((h) => inScope(h.line))) for (const [id, f] of m.feats) if (f.helpSites.some((s) => s.file === t.file && s.line === h.line)) addF(id, "کلید راهنمای همین بخش");
  if (m.owner[t.file] === "infra.ui") R.notes.push(`${t.file} در همهٔ پنل‌هاست: صفحه‌های ${[...R.pages].map((p) => p.split("/").pop()).join("، ")} را در مرورگر ببینید.`);
}

for (const t of touches()) {
  if (t.feature) {
    const f = m.feats.get(t.feature);
    addF(f.id, "خودِ قابلیت");
    for (const file of f.files) if (W.has(file)) for (const fn of W.get(file).functions) if (W.get(file).exports.includes(fn.name)) addFn(file, fn, "فایلِ قابلیت");
    for (const r of f.endpoints) addRoute(r, "مسیرِ قابلیت");
    for (const tt of f.tests) addT(tt, "تستِ قابلیت");
    continue;
  }
  if (t.route) {
    const rs = m.routes.filter((r) => (r.path === t.route.path || samePath(r.path, t.route.path)) && (!t.route.methods || r.method === "*" || r.method.split("|").some((x) => t.route.methods.includes(x))));
    if (!rs.length) R.notes.push(`مسیر ${t.route.path} در سرور نیست.`);
    for (const r of rs) { addRoute(r, "خودِ مسیر"); for (const u of r.handler.uses) { const [file, nm] = u.split("#"); const fn = W.get(file) && W.get(file).functions.find((f) => f.name === nm); if (fn) addFn(file, fn, `پاسخ‌گوی ${r.key}`); } }
    continue;
  }
  if (t.table) {
    for (const w of facts.worker) for (const fn of w.functions) if (fn.tables.w.includes(t.table) || fn.tables.r.includes(t.table)) { addFn(w.file, fn, fn.tables.w.includes(t.table) ? `می‌نویسد ${t.table}` : `می‌خواند ${t.table}`); addF(m.owner[w.file], `جدول ${t.table}`); }
    for (const r of m.routes) if (r.tables.w.includes(t.table) || r.tables.r.includes(t.table)) addRoute(r, `جدول ${t.table}`);
    for (const tt of m.tests) if (new RegExp(`\\b${t.table}\\b`).test(readFileSync(join(ROOT, tt.file), "utf8"))) addT(tt.file, `جدول ${t.table}`);
    const def = m.tables.find((x) => x.name === t.table);
    if (def) R.notes.push(`تعریفِ ${t.table}: ${def.defs.join("، ")} — تغییرِ ستون یعنی مهاجرت در COLUMN_MIGRATIONSِ api.js و احتیاط روی D1ِ واقعی.`);
    continue;
  }
  const f = t.file;
  if (f.startsWith("product-map/") || f.startsWith("scripts/map/")) { R.rebuild = true; addT(MAP_TEST, "خودِ نقشه"); continue; }
  if (f.startsWith(`${TEST_DIR}/`)) { if (/\.test\.m?js$/.test(f)) addT(f, "خودِ تست تغییر کرده"); else { R.all = true; R.notes.push(`${f} ابزارِ مشترکِ تست‌هاست.`); } continue; }
  if (W.has(f)) onWorker(t);
  else if (f.startsWith("frontend/tamin-poshtibani/")) onFront(t);
  else if (m.owner[f]) addF(m.owner[f], "صاحبِ فایل");
  else { R.outside = (R.outside || 0) + 1; continue; }
  if (!m.owner[f] && (W.has(f) || f.startsWith("frontend/tamin-poshtibani/"))) { R.rebuild = true; R.notes.push(`${f} صاحب ندارد: در product-map/taxonomy.mjs به یک قابلیت بدهید.`); }
}
/* دکمه‌های بات: تابعِ تغییرکرده‌ای که دکمه‌ای می‌سازد یا پاسخ می‌دهد ← طرفِ دیگرِ همان دکمه و تست‌هایی که پیشوندش را دارند */
const touchedBtn = new Set([...m.bot.buttons, ...m.bot.handlers].filter((x) => R.direct.has(`${x.file}#${x.fn}`)).map((x) => x.prefix));
if (touchedBtn.size) {
  const tt = new Map(m.tests.map((x) => [x.file, readFileSync(join(ROOT, x.file), "utf8")]));
  for (const p of touchedBtn) for (const [file, text] of tt) if (new RegExp(`["'\`]${p}:`).test(text)) addT(file, `دکمهٔ ${p}:`);
}
addT(MAP_TEST, "همیشه: نقشه با کد بخواند");

/* ---------- چاپ ---------- */
const cap = (xs, n, f) => [...xs.slice(0, n).map(f), ...(xs.length > n ? [`- … و ${xs.length - n} مورد دیگر`] : [])];
const short = (p) => p.replace(/^frontend\/tamin-poshtibani\//, "front/");
const L = [`# اثرِ تغییر: ${args.join(" ")}`, ""];
const feats = [...R.feats.keys()].filter((id) => m.feats.has(id)).sort();
L.push(`## قابلیت‌های درگیر (${feats.length})`);
L.push(...cap(feats, 30, (id) => `- ${id} — ${m.feats.get(id).title} — دلیل: ${[...R.feats.get(id)].slice(0, 3).join("؛ ")} — کارت: ${OUT}/features/${id}.md`));
const places = [...new Set(feats.flatMap((id) => m.feats.get(id).places.map((pl) => pl.path.join(" › "))))];
if (places.length) { L.push("", `## محل در رابط (برای دیدن در مرورگر)`); L.push(...cap(places, 15, (p) => `- ${p}`)); }
const fns = [...R.fns.values()].sort((a, b) => a.file.localeCompare(b.file) || a.start - b.start);
const blocks = [...R.routes.values()].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
L.push("", `## کدی که باید خواند (${fns.length} تابع، ${blocks.length} بلوکِ مسیر)`);
L.push(...cap(fns, 40, (f) => `- ${short(f.file)}:${f.start}-${f.end} › ${f.name} — ${[...f.why].slice(0, 2).join("؛ ")}${f.refs.size ? ` (خط ${[...f.refs].join("، ")})` : ""}`));
L.push(...cap(blocks, 40, (r) => `- ${short(r.file)}:${r.line}-${r.end} › \`${r.key}\` — ${[...r.why].slice(0, 2).join("؛ ")}`));
const calls = [...R.calls.values()].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
if (calls.length) { L.push("", `## فراخوان در پنل‌ها (${calls.length})`); L.push(...cap(calls, 30, (c) => `- ${short(c.file)}:${c.line} › ${c.fn || "—"} → ${c.routes.join("، ") || "بی‌مسیر!"}`)); }
if (R.pages.size) L.push("", `صفحه‌هایی که باید در مرورگر دید: ${[...R.pages].map((p) => short(p)).sort().join("، ")}`);
if (touchedBtn.size) {
  const at = (xs) => [...new Set(xs.map((x) => `${short(x.file)}:${x.line} › ${x.fn || "—"}`))].slice(0, 6).join("، ") || "— (بی‌پاسخ‌گو!)";
  L.push("", `## دکمه‌های بات درگیر (${touchedBtn.size})`);
  for (const p of [...touchedBtn].sort()) L.push(`- \`${p}:\` پاسخ‌گو: ${at(m.bot.handlers.filter((h) => h.prefix === p))} | سازنده‌ها: ${at(m.bot.buttons.filter((b) => b.prefix === p))}`);
}
if (R.tables.w.size || R.tables.r.size) L.push("", "## جدول‌ها", `نوشتن: ${[...R.tables.w].sort().join("، ") || "—"}`, `خواندن: ${[...R.tables.r].filter((x) => !R.tables.w.has(x)).sort().join("، ") || "—"}`);
const tests = [...R.tests.keys()].sort();
L.push("", R.all ? "## تست‌ها: همه (تغییرِ مشترک)" : `## تست‌ها (${tests.length})`);
if (R.all) L.push("```", `node --test "${TEST_DIR}/*.test.mjs"`, "```");
else { L.push(...cap(tests, 40, (t) => `- ${t.split("/").pop()} — ${[...R.tests.get(t)].slice(0, 2).join("؛ ")}`)); L.push("```", `node --test ${tests.join(" ")}`, "```"); }
const helps = feats.filter((id) => m.feats.get(id).help);
L.push("", "## پس از ویرایش");
if (helps.length) L.push(`- اگر رفتار یا متنِ رابط عوض شد، راهنما: help-content.js ← ${helps.join("، ")} (و node backend/tamin-poshtibani/tools/build-help-knowledge.mjs)`);
L.push(`- ${R.rebuild ? "نقشه را بازسازی کنید" : "اگر مسیر، فایل یا جدولِ تازه ساختید"}: product-map/taxonomy.mjs، سپس node scripts/map/build.mjs`);
for (const n of R.notes) L.push(`- ${n}`);
if (R.outside) L.push(`- ${R.outside} فایلِ تغییرکرده بیرون از محدودهٔ نقشه است (اسناد، تنظیمات، …) و در اثر حساب نشد.`);
console.log(L.join("\n"));
