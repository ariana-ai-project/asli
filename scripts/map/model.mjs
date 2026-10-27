/* ============================================================
   مدلِ نقشهٔ محصول = واقعیت‌های کد (scan.mjs) + طبقه‌بندی (product-map/taxonomy.mjs)
   • buildModel: صاحبِ هر فایل، قابلیتِ هر مسیر، فراخوان‌های پنل، جدول‌ها، تست‌ها، خطاها و هشدارها
   • render: خروجی‌های product-map/generated — فقط ساختار (بی شمارهٔ خط) تا با هر ویرایشِ کوچک عوض نشوند
   • check: خطاها + کهنه بودنِ خروجی‌ها (همان چیزی که تستِ product-map.test.mjs می‌سنجد)
   ============================================================ */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { scan, samePath, walk, ROOT } from "./scan.mjs";

export const OUT = "product-map/generated";
export const TEST_DIR = "backend/tamin-poshtibani/tests";
/* فایل‌هایی که تقریباً همهٔ تست‌ها import می‌کنند (برای route و پایگاه آزمایشی): از روی آن‌ها تستی به قابلیتی نسبت داده نمی‌شود */
export const HUB = new Set(["worker/api.js", `${TEST_DIR}/run.mjs`]);
const NOISE = new Set(["worker/http.js", "worker/time.js"]);

export async function loadTaxonomy() { return import(pathToFileURL(join(ROOT, "product-map/taxonomy.mjs")).href); }

export const globRe = (g) => new RegExp("^" + g.split(/(\*\*\/|\*\*|\*)/).map((p) => (p === "**/" ? "(?:.*/)?" : p === "**" ? ".*" : p === "*" ? "[^/]*" : p.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))).join("") + "$");
function scopeFiles(scope) {
  const all = [...walk("worker", /./), ...(existsSync(join(ROOT, "worker.js")) ? ["worker.js"] : []), ...walk("frontend/tamin-poshtibani", /./)];
  const res = scope.map(globRe);
  return [...new Set(all)].filter((f) => res.some((r) => r.test(f))).sort();
}
export function parseClaim(c) {
  const m = /^(?:([A-Z|]+)\s+)?(\S+)$/.exec(String(c).trim());
  if (!m) throw new Error(`الگوی مسیر نامعتبر: ${c}`);
  return { raw: String(c).trim(), methods: m[1] ? m[1].split("|") : null, path: m[2], prefix: m[2].endsWith("*") };
}
/* امتیازِ یک ادعا برای یک مسیر: -1 یعنی نمی‌خورد؛ دقیق‌ترین ادعا برنده است (برابرها مشترک) */
export function claimScore(cl, r) {
  if (cl.methods && r.method !== "*" && !r.method.split("|").some((x) => cl.methods.includes(x))) return -1;
  if (cl.prefix) { const p = cl.path.slice(0, -1); return r.path.startsWith(p) ? p.length : -1; }
  return samePath(cl.path, r.path) ? 1000 + cl.path.length : -1;
}
const tab = (s) => String(s).replace(/\|/g, "\\|");

export function buildModel(facts, tx) {
  const errors = [], warnings = [], help = facts.help;
  const feats = new Map();
  for (const f of tx.FEATURES) {
    if (feats.has(f.id)) errors.push(`شناسهٔ تکراری در taxonomy: ${f.id}`);
    feats.set(f.id, { id: f.id, area: f.area || f.id.split(".")[0], title: f.title, desc: f.desc, claims: (f.endpoints || []).map(parseClaim), globs: f.files || [] });
  }
  for (const k of Object.keys(help.topics)) if (!feats.has(k)) feats.set(k, { id: k, area: k.split(".")[0], claims: [], globs: [], auto: true });
  const areaIds = new Set(tx.AREAS.map((a) => a.id));
  for (const f of feats.values()) {
    const h = help.topics[f.id];
    Object.assign(f, { help: !!h, title: f.title || (h && h.title) || f.id, summary: (h && h.summary) || f.desc || "", related: ((h && h.related) || []).filter((x) => x !== f.id && !x.startsWith("gl.")),
      files: [], endpoints: [], callers: [], tests: new Set(), tables: { r: new Set(), w: new Set() }, modules: new Set(), helpSites: [] });
    if (!areaIds.has(f.area)) errors.push(`قابلیت ${f.id}: بخش «${f.area}» در AREAS نیست`);
    if (f.auto) warnings.push(`موضوع راهنمای «${f.id}» در taxonomy نیامده (قابلیت خودکار، بی فایل و مسیر)`);
  }

  /* صاحبِ هر فایل */
  const files = scopeFiles(tx.SCOPE), owner = {};
  const fg = [...feats.values()].map((f) => ({ f, res: f.globs.map(globRe) }));
  for (const g of fg) g.f.globs.forEach((p, i) => { if (!files.some((x) => g.res[i].test(x))) errors.push(`قابلیت ${g.f.id}: الگوی فایل «${p}» به هیچ فایلی نمی‌خورد`); });
  for (const file of files) {
    const os = fg.filter((g) => g.res.some((r) => r.test(file))).map((g) => g.f);
    if (!os.length) errors.push(`فایل بی‌صاحب: ${file} — در product-map/taxonomy.mjs به یک قابلیت بدهید`);
    else if (os.length > 1) errors.push(`فایل با چند صاحب: ${file} ← ${os.map((o) => o.id).join("، ")}`);
    if (os[0]) { owner[file] = os[0].id; os[0].files.push(file); }
  }

  /* قابلیتِ هر مسیر */
  const routes = facts.worker.flatMap((w) => w.routes).map((r) => ({ ...r, key: `${r.method} ${r.path}` }));
  for (const r of routes) {
    let best = -1, who = [];
    for (const f of feats.values()) for (const cl of f.claims) {
      const s = claimScore(cl, r);
      if (s > best) { best = s; who = [f]; } else if (s === best && s >= 0 && !who.includes(f)) who.push(f);
    }
    r.features = best >= 0 ? who.map((f) => f.id).sort() : [];
    if (!r.features.length) errors.push(`مسیر بی‌صاحب: ${r.key} (${r.file}:${r.line}) — در product-map/taxonomy.mjs به یک قابلیت بدهید`);
    for (const id of r.features) feats.get(id).endpoints.push(r);
  }
  for (const f of feats.values()) for (const cl of f.claims) if (!routes.some((r) => claimScore(cl, r) >= 0)) warnings.push(`قابلیت ${f.id}: الگوی «${cl.raw}» به هیچ مسیری نمی‌خورد`);

  /* جدول‌ها و ماژول‌های هر قابلیت (از بلوکِ مسیرها، تابع‌هایی که صدا می‌زنند و فایل‌های خودش) */
  const fnIndex = new Map();
  for (const w of facts.worker) for (const fn of w.functions) fnIndex.set(`${w.file}#${fn.name}`, { ...fn, file: w.file });
  const addT = (f, t) => { t.r.forEach((x) => f.tables.r.add(x)); t.w.forEach((x) => f.tables.w.add(x)); };
  for (const f of feats.values()) {
    for (const r of f.endpoints) {
      addT(f, r.tables); f.modules.add(r.file);
      for (const u of r.handler.uses) { const mod = u.split("#")[0]; if (mod.startsWith("worker") && !NOISE.has(mod)) f.modules.add(mod); const fn = fnIndex.get(u); if (fn) addT(f, fn.tables); }
      for (const c of r.handler.calls) { const fn = fnIndex.get(`${r.file}#${c}`); if (fn) addT(f, fn.tables); }
    }
    for (const file of f.files) { const w = facts.worker.find((x) => x.file === file); if (w) for (const fn of w.functions) addT(f, fn.tables); }
  }

  /* فراخوان‌های پنل → مسیرها */
  const supScripts = new Set((facts.pages.find((p) => p.file.endsWith("/support.html")) || { scripts: [] }).scripts);
  const known = new Map((tx.KNOWN_UNMATCHED || []).map((k) => [`${k.file} ${k.path}`, k.why]));
  const calls = [];
  for (const fr of facts.front) for (const c of fr.calls) {
    const alts = [c.path, ...(supScripts.has(fr.file) && !c.path.startsWith("/support") ? ["/support" + c.path] : [])];
    const hits = routes.filter((r) => alts.some((a) => samePath(r.path, a)));
    const call = { file: fr.file, fn: c.where, line: c.line, path: c.path, method: c.method, routes: [...new Set(hits.map((r) => r.key))].sort() };
    calls.push(call);
    if (!hits.length) {
      const why = known.get(`${fr.file} ${c.path}`);
      if (why) warnings.push(`فراخوانِ شناخته‌شدهٔ بی‌مسیر: ${fr.file}:${c.line} ${c.path} — ${why}`);
      else if (!c.partial) errors.push(`فراخوان پنل به هیچ مسیری نمی‌رسد: ${fr.file}:${c.line} ${c.path} — مسیر را بسازید/اصلاح کنید یا در KNOWN_UNMATCHED با دلیل بنویسید`);
    }
    for (const id of new Set(hits.flatMap((r) => r.features))) feats.get(id).callers.push(call);
  }
  for (const k of tx.KNOWN_UNMATCHED || []) if (!calls.some((c) => c.file === k.file && c.path === k.path && !c.routes.length)) warnings.push(`KNOWN_UNMATCHED کهنه است (اصلاح شده؟): ${k.file} ${k.path}`);

  /* جای TP.ui.help.set(key) */
  for (const fr of facts.front) for (const h of fr.help) {
    const ids = h.key.includes("{}") ? [...feats.keys()].filter((id) => samePath(h.key.replace(/\./g, "/"), id.replace(/\./g, "/"))) : [h.key];
    if (!ids.length || ids.some((id) => !feats.has(id))) { errors.push(`کلید راهنمای ناشناخته: ${h.key} (${fr.file}:${h.line})`); continue; }
    for (const id of ids) feats.get(id).helpSites.push({ file: fr.file, line: h.line, dynamic: h.key.includes("{}") });
  }

  /* تست‌ها */
  const tests = facts.tests.map((t) => {
    const fs = new Set();
    for (const p of t.paths) for (const r of routes) if (samePath(r.path, p)) r.features.forEach((id) => fs.add(id));
    for (const m of t.imports) if (owner[m] && !HUB.has(m)) fs.add(owner[m]);
    for (const fr of t.fronts) if (owner[fr]) fs.add(owner[fr]);
    for (const id of (tx.TEST_FEATURES || {})[t.file.split("/").pop()] || []) { if (feats.has(id)) fs.add(id); else errors.push(`TEST_FEATURES: قابلیت ناشناخته ${id}`); }
    for (const id of fs) feats.get(id).tests.add(t.file);
    if (!fs.size) warnings.push(`تستی که به هیچ قابلیتی نرسید: ${t.file}`);
    return { file: t.file, features: [...fs].sort(), imports: t.imports, names: t.names, paths: t.paths, fronts: t.fronts };
  });

  /* پوششِ تست: مسیری که هیچ تستی با مسیرش صدا نمی‌زند (ممکن است تابعش جدا تست شده باشد) */
  for (const r of routes) r.tested = facts.tests.some((t) => t.paths.some((p) => samePath(r.path, p)));

  /* ارجاع‌ها */
  for (const f of feats.values()) for (const x of f.related) if (!feats.has(x)) warnings.push(`قابلیت ${f.id}: مرتبطِ ناشناخته ${x}`);
  for (const wf of tx.WORKFLOWS) for (const s of wf.steps) for (const id of s.f) if (!feats.has(id)) errors.push(`جریان ${wf.id}: قابلیت ناشناخته ${id}`);

  return { feats, files, owner, routes, calls, tests, tables: facts.tables, pages: facts.pages, workflows: tx.WORKFLOWS, areas: tx.AREAS, errors, warnings, facts };
}

/* ---------------- خروجی‌ها (ساختار، بی شمارهٔ خط) ---------------- */
const list = (xs) => (xs.length ? xs.join("، ") : "—");
const short = (p) => p.replace(/^frontend\/tamin-poshtibani\//, "").replace(/^worker\//, "w/");
export function render(m) {
  const out = {}, F = [...m.feats.values()].sort((a, b) => a.id.localeCompare(b.id));
  const wfOf = (id) => m.workflows.flatMap((w) => w.steps.map((s, i) => (s.f.includes(id) ? `${w.id} (گام ${i + 1})` : null)).filter(Boolean));
  const pagesOf = (file) => m.pages.filter((p) => p.scripts.includes(file)).map((p) => p.file.split("/").pop());
  const writers = new Map();
  for (const f of F) for (const t of f.tables.w) { if (!writers.has(t)) writers.set(t, new Set()); writers.get(t).add(f.id); }
  const exportsOf = (file) => { const w = m.facts.worker.find((x) => x.file === file); return w ? w.exports : []; };
  const fnsOf = (file) => { const x = m.facts.worker.find((y) => y.file === file) || m.facts.front.find((y) => y.file === file); return x ? x.functions.map((f) => f.name) : []; };

  /* کارتِ هر قابلیت */
  for (const f of F) {
    const L = [`# ${f.id} — ${f.title}`, ""];
    L.push(`بخش: ${(m.areas.find((a) => a.id === f.area) || {}).title || f.area}${f.help ? ` | راهنما: help-content.js «${f.id}»` : ""}${wfOf(f.id).length ? ` | جریان کار: ${wfOf(f.id).join("، ")}` : ""}`);
    if (f.summary) L.push("", `> ${f.summary}`);
    L.push("", "## فایل‌های این قابلیت (صاحب)");
    if (!f.files.length) L.push("— (کدِ جدا ندارد؛ از راه مسیرها و فایل‌های مشترک)");
    for (const file of f.files) { const ex = exportsOf(file), fn = ex.length ? ex : fnsOf(file); L.push(`- \`${file}\`${fn.length ? ` — ${fn.slice(0, 18).join("، ")}${fn.length > 18 ? "، …" : ""}` : ""}`); }
    const eps = [...new Map(f.endpoints.map((r) => [`${r.key}|${r.file}|${r.fn}`, r])).values()].sort((a, b) => a.key.localeCompare(b.key));
    L.push("", `## مسیرهای سرور (${eps.length})`);
    if (eps.length) {
      L.push("| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |", "|---|---|---|---|");
      for (const r of eps) { const mods = [...new Set(r.handler.uses.filter((u) => u.startsWith("worker") && !NOISE.has(u.split("#")[0])).map((u) => short(u)))]; L.push(`| \`${tab(r.key)}\` | ${short(r.file)} › ${r.fn || "—"} | ${tab(list(mods.slice(0, 6)))}${mods.length > 6 ? "، …" : ""} | ${r.tested ? "✓" : "—"} |`); }
    } else L.push("—");
    const cs = [...new Set(f.callers.map((c) => `${c.file}|${c.fn || "—"}`))].sort();
    L.push("", `## فراخوان در پنل‌ها (${cs.length})`);
    for (const k of cs) { const [file, fn] = k.split("|"); const ps = [...new Set(f.callers.filter((c) => c.file === file && (c.fn || "—") === fn).flatMap((c) => c.routes))]; L.push(`- ${short(file)} › ${fn} → ${ps.filter((p) => f.endpoints.some((r) => r.key === p)).map((p) => `\`${p}\``).join("، ")}${pagesOf(file).length ? ` (صفحه: ${pagesOf(file).join("، ")})` : ""}`); }
    if (!cs.length) L.push("—");
    if (f.helpSites.length) L.push("", `جای راهنما: ${[...new Set(f.helpSites.map((h) => `${short(h.file)}${h.dynamic ? " (پویا)" : ""}`))].join("، ")}`);
    L.push("", "## جدول‌ها", `نوشتن: ${list([...f.tables.w].sort())}`, `خواندن: ${list([...f.tables.r].filter((t) => !f.tables.w.has(t)).sort())}`);
    /* جدول‌های عمومی (events، settings، ...) که بیش از ۶ قابلیت می‌نویسند هم‌نویس به حساب نمی‌آیند */
    const shared = [...new Set([...f.tables.w].filter((t) => (writers.get(t) || new Set()).size <= 6).flatMap((t) => [...writers.get(t)]).filter((x) => x !== f.id))].sort();
    if (shared.length) L.push(`هم‌نویس‌های همین جدول‌ها: ${shared.join("، ")}`);
    const ts = [...f.tests].sort();
    L.push("", `## تست‌ها (${ts.length})`);
    if (ts.length) L.push(...ts.map((t) => `- ${t.split("/").pop()}`), "", "```", `node --test ${ts.join(" ")}`, "```"); else L.push("— (تستِ مستقیم ندارد؛ پیش از استقرار همهٔ تست‌ها)");
    if (f.related.length) L.push("", `## مرتبط`, f.related.map((x) => `- ${x}${m.feats.has(x) ? ` — ${m.feats.get(x).title}` : ""}`).join("\n"));
    out[`${OUT}/features/${f.id}.md`] = L.join("\n") + "\n";
  }

  /* فهرست */
  const I = ["# نقشهٔ محصول — فهرست", "", "> خودکار است؛ دستی ویرایش نکنید. منبع: `product-map/taxonomy.mjs` + کد. بازسازی: `node scripts/map/build.mjs`.", "> اثرِ یک تغییر: `node scripts/map/impact.mjs <فایل|فایل#تابع|مسیر|جدول|قابلیت>` یا `--changed`. راهنمای کامل: `product-map/README.md`.", ""];
  const keys = [...new Set(m.routes.map((r) => r.key))], tested = new Set(m.routes.filter((r) => r.tested).map((r) => r.key));
  I.push(`آمار: ${F.length} قابلیت در ${m.areas.length} بخش | ${m.files.length} فایل | ${keys.length} مسیر (${tested.size} در تست صدا زده می‌شوند) | ${m.calls.length} فراخوان پنل | ${m.tables.length} جدول | ${m.tests.length} تست`, "");
  I.push("## جریان‌های کار", "");
  for (const w of m.workflows) { I.push(`### ${w.id} — ${w.title}`); w.steps.forEach((s, i) => I.push(`${i + 1}. ${s.t} → ${s.f.join("، ")}`)); I.push(""); }
  I.push("## قابلیت‌ها", "");
  for (const a of m.areas) {
    const fs = F.filter((f) => f.area === a.id); if (!fs.length) continue;
    I.push(`### ${a.title} (${a.id})`, "", "| شناسه | عنوان | فایل‌های صاحب | مسیر (بی‌تست) | تست |", "|---|---|---|---|---|");
    for (const f of fs) { const ek = [...new Set(f.endpoints.map((r) => r.key))], un = ek.filter((k) => !tested.has(k)).length; I.push(`| [${f.id}](features/${f.id}.md) | ${tab(f.title)} | ${tab(list(f.files.map(short).slice(0, 4)))}${f.files.length > 4 ? ` (+${f.files.length - 4})` : ""} | ${ek.length}${un ? ` (${un})` : ""} | ${f.tests.size} |`); }
    I.push("");
  }
  I.push("فهرست‌های دیگر: [FILES.md](FILES.md) فایل ← قابلیت | [ENDPOINTS.md](ENDPOINTS.md) مسیر ← قابلیت | [TABLES.md](TABLES.md) جدول ← قابلیت | graph.json همه برای ماشین", "");
  const warn = m.warnings.filter((w) => !w.startsWith("موضوع راهنمای"));
  if (warn.length) I.push("## هشدارها", "", ...warn.map((w) => `- ${w}`), "");
  out[`${OUT}/INDEX.md`] = I.join("\n");
  out[`${OUT}/FILES.md`] = ["# فایل ← قابلیت", "", "> خودکار. صاحبِ هر فایل از product-map/taxonomy.mjs؛ کارت: features/<قابلیت>.md", "", "| فایل | قابلیت |", "|---|---|", ...m.files.map((x) => `| ${x} | ${m.owner[x] || "—"} |`)].join("\n") + "\n";

  /* مسیر ← قابلیت */
  const E = ["# مسیرهای سرور ← قابلیت", "", "> خودکار. پیشوند همهٔ مسیرها /tamin-poshtibani/api است (جز legal:).", "", "| مسیر | قابلیت | پاسخ‌گو |", "|---|---|---|"];
  for (const r of [...m.routes].sort((a, b) => a.key.localeCompare(b.key) || a.file.localeCompare(b.file))) E.push(`| \`${tab(r.key)}\` | ${r.features.join("، ")} | ${short(r.file)} › ${r.fn || "—"} |`);
  out[`${OUT}/ENDPOINTS.md`] = [...new Set(E)].join("\n") + "\n";

  /* جدول ← قابلیت */
  const T = ["# جدول‌های D1 ← قابلیت", "", "> خودکار. «نوشتن» از INSERT/UPDATE/DELETE/ALTER و «خواندن» از FROM/JOIN در کدِ قابلیت.", "", "| جدول | می‌نویسند | می‌خوانند |", "|---|---|---|"];
  for (const t of m.tables) { const w = F.filter((f) => f.tables.w.has(t.name)).map((f) => f.id), r = F.filter((f) => f.tables.r.has(t.name) && !f.tables.w.has(t.name)).map((f) => f.id); T.push(`| ${t.name} | ${list(w)} | ${list(r)} |`); }
  out[`${OUT}/TABLES.md`] = T.join("\n") + "\n";

  /* گراف ماشین‌خوان */
  const graph = {
    note: "generated by scripts/map/build.mjs — structure only (no line numbers); line numbers come live from scripts/map/impact.mjs",
    areas: m.areas,
    features: F.map((f) => ({ id: f.id, area: f.area, title: f.title, help: f.help, files: f.files, endpoints: [...new Set(f.endpoints.map((r) => r.key))].sort(), tests: [...f.tests].sort(), tables: { w: [...f.tables.w].sort(), r: [...f.tables.r].sort() }, related: f.related })),
    workflows: m.workflows,
    files: m.owner,
    endpoints: [...new Map(m.routes.map((r) => [`${r.key}|${r.file}|${r.fn}`, { key: r.key, file: r.file, fn: r.fn, features: r.features, uses: r.handler.uses, tables: r.tables }])).values()].sort((a, b) => a.key.localeCompare(b.key) || a.file.localeCompare(b.file)),
    calls: [...new Map(m.calls.map((c) => [`${c.file}#${c.fn}|${c.path}`, { from: `${c.file}#${c.fn}`, path: c.path, routes: c.routes }])).values()].sort((a, b) => a.from.localeCompare(b.from) || a.path.localeCompare(b.path)),
    tests: m.tests.map((t) => ({ file: t.file, features: t.features, imports: t.imports })),
  };
  out[`${OUT}/graph.json`] = JSON.stringify(graph, null, 1) + "\n";
  return out;
}

const norm = (s) => s.replace(/\r\n/g, "\n");
export async function check() {
  const tx = await loadTaxonomy(), model = buildModel(scan(), tx), out = render(model);
  const stale = Object.entries(out).filter(([p, c]) => !existsSync(join(ROOT, p)) || norm(readFileSync(join(ROOT, p), "utf8")) !== c).map(([p]) => p);
  const dir = join(ROOT, OUT, "features");
  if (existsSync(dir)) for (const n of readdirSync(dir)) if (!out[`${OUT}/features/${n}`]) stale.push(`${OUT}/features/${n} (اضافه)`);
  return { model, out, errors: model.errors, warnings: model.warnings, stale };
}
