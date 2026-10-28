/* ============================================================
   مدلِ نقشهٔ محصول = واقعیت‌های کد (scan.mjs) + طبقه‌بندی (product-map/taxonomy.mjs)
   • buildModel: صاحبِ هر فایل، قابلیتِ هر مسیر، فراخوان‌های پنل، جدول‌ها، تست‌ها، محلِ هر قابلیت در پنل‌ها (PANELS)،
     دستورها و دکمه‌های بات‌ها، کارهای Cron، خطاها و هشدارها
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
      files: [], endpoints: [], callers: [], tests: new Set(), tables: { r: new Set(), w: new Set() }, modules: new Set(), helpSites: [], places: [], env: new Set() });
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
    /* روشِ فراخوان اگر معلوم باشد (method صریح، body ← POST، بی گزینه ← GET) مسیرهای همان روش؛ اگر هیچ‌کدام نخورد همهٔ روش‌ها */
    const byPath = routes.filter((r) => alts.some((a) => samePath(r.path, a)));
    const byM = c.method ? byPath.filter((r) => r.method === "*" || r.method.split("|").includes(c.method)) : byPath;
    const hits = byM.length ? byM : byPath;
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

  /* جای TP.ui.help.set(key) و TP.ui.info(key) */
  for (const fr of facts.front) for (const h of fr.help) {
    const ids = h.key.includes("{}") ? [...feats.keys()].filter((id) => samePath(h.key.replace(/\./g, "/"), id.replace(/\./g, "/"))) : [h.key];
    if (!ids.length || ids.some((id) => !feats.has(id))) { errors.push(`کلید راهنمای ناشناخته: ${h.key} (${fr.file}:${h.line})`); continue; }
    for (const id of ids) feats.get(id).helpSites.push({ file: fr.file, line: h.line, dynamic: h.key.includes("{}"), kind: h.kind, where: h.where });
  }

  /* پنل‌ها: درختِ بخش‌ها ← محلِ هر قابلیت در رابط */
  const srcOf = new Map();
  const pageText = (pg) => [pg.file, ...pg.scripts].filter((f) => existsSync(join(ROOT, f))).map((f) => { if (!srcOf.has(f)) srcOf.set(f, readFileSync(join(ROOT, f), "utf8")); return srcOf.get(f); }).join("\n");
  const panels = (tx.PANELS || []).map((p) => {
    const pg = p.page ? facts.pages.find((x) => x.file === p.page) : null;
    if (p.page && !pg) errors.push(`پنل ${p.id}: صفحهٔ ${p.page} پیدا نشد`);
    const text = pg ? pageText(pg) : "";
    const walkS = (secs, trail) => (secs || []).map((s) => {
      if (!feats.has(s.f)) errors.push(`پنل ${p.id} › ${s.title}: قابلیت ناشناخته ${s.f}`);
      if (s.key && pg && !text.includes(`"${s.key}"`)) errors.push(`پنل ${p.id} › ${s.title}: کلیدِ بخش "${s.key}" در اسکریپت‌های ${p.page} نیست — تب عوض شده؟ PANELSِ taxonomy.mjs را اصلاح کنید`);
      const path = [...trail, s.title];
      if (feats.has(s.f)) feats.get(s.f).places.push({ panel: p.id, path: [p.title, ...path], key: s.key || null });
      return { key: s.key || null, title: s.title, f: s.f, path, sections: walkS(s.sections, path) };
    });
    return { id: p.id, page: p.page, title: p.title, who: p.who, files: pg ? pg.scripts : [], sections: walkS(p.sections, []) };
  });
  if (panels.length) for (const f of feats.values()) if (f.help && !f.places.length) errors.push(`قابلیتِ رابطِ «${f.id}» در هیچ پنلی نیامده — جایش را در PANELSِ product-map/taxonomy.mjs بنویسید`);
  for (const f of feats.values()) for (const h of f.helpSites) if (!h.dynamic && f.places.length && !f.places.some((pl) => { const pn = panels.find((x) => x.id === pl.panel); return pn && (pn.page === h.file || pn.files.includes(h.file)); }))
    warnings.push(`راهنمای «${f.id}» در ${h.file} هست ولی در PANELS برای صفحهٔ آن فایل نیامده`);

  /* بات‌ها: دکمه (callback_data) ← پاسخ‌گو؛ دستورها */
  const bot = { buttons: [], handlers: [], commands: [] };
  for (const w of facts.worker) for (const k of ["buttons", "handlers", "commands"]) for (const x of w.bot[k]) bot[k].push({ ...x, file: w.file, feature: owner[w.file] || null });
  const produced = new Set(bot.buttons.map((b) => b.prefix));
  bot.handlers = bot.handlers.filter((h) => produced.has(h.prefix));
  const handled = new Set(bot.handlers.map((h) => h.prefix));
  const deadOk = new Map((tx.KNOWN_DEAD_BUTTONS || []).map((k) => [k.prefix, k.why]));
  for (const p of [...produced].sort()) if (!handled.has(p)) {
    const where = [...new Set(bot.buttons.filter((b) => b.prefix === p).map((b) => `${b.file}:${b.line}`))].join("، ");
    if (deadOk.has(p)) warnings.push(`دکمهٔ شناخته‌شدهٔ بی‌پاسخ‌گو «${p}:» — ${deadOk.get(p)}`);
    else errors.push(`دکمهٔ بات بی‌پاسخ‌گو: «${p}:» (${where}) — پاسخ‌گو بسازید (action === "${p}"، /^${p}:/ یا startsWith("${p}:")) یا در KNOWN_DEAD_BUTTONS با دلیل بنویسید`);
  }

  /* متغیرهای env که فایل‌های هر قابلیت می‌خوانند (فقط نام) */
  for (const w of facts.worker) if (owner[w.file]) for (const fn of w.functions) fn.env.forEach((e) => feats.get(owner[w.file]).env.add(e));

  /* Cron: scheduled در worker.js و هر فایلِ دیگر ← تابع‌هایی که صدا می‌زند */
  const cron = facts.worker.flatMap((w) => w.functions.filter((f) => f.name === "scheduled").map((f) => ({ entry: `${w.file}#scheduled`, feature: owner[w.file] || null,
    runs: [...f.uses.filter((u) => u.startsWith("worker")).map((u) => ({ ref: u, feature: owner[u.split("#")[0]] || null })), ...f.calls.map((c) => ({ ref: `${w.file}#${c}`, feature: owner[w.file] || null }))] })));

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

  return { feats, files, owner, routes, calls, tests, tables: facts.tables, pages: facts.pages, workflows: tx.WORKFLOWS, areas: tx.AREAS, panels, bot, cron, errors, warnings, facts };
}

/* ---------------- خروجی‌ها (ساختار، بی شمارهٔ خط) ---------------- */
const list = (xs) => (xs.length ? xs.join("، ") : "—");
const short = (p) => p.replace(/^frontend\/tamin-poshtibani\//, "").replace(/^worker\//, "w/");
const uniq = (xs) => [...new Set(xs)];
const fnList = (xs, n = 99) => { const u = uniq(xs.map((x) => `${short(x.file)} › ${x.fn || "—"}`)); return u.length ? u.slice(0, n).join("، ") + (u.length > n ? `، … (+${u.length - n})` : "") : "—"; };
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
    if (f.places.length) L.push("", "محل در رابط:", ...uniq(f.places.map((pl) => `- ${pl.path.join(" › ")}`)));
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
    if (f.helpSites.length) L.push("", `جای راهنما در کد: ${uniq(f.helpSites.map((h) => `${short(h.file)}${h.dynamic ? " (پویا)" : h.where ? ` › ${h.where}` : ""}`)).join("، ")}`);
    const bc = m.bot.commands.filter((c) => f.files.includes(c.file)), bp = uniq([...m.bot.handlers, ...m.bot.buttons].filter((x) => f.files.includes(x.file)).map((x) => x.prefix)).sort();
    if (bc.length || bp.length) {
      L.push("", "## در بات‌ها");
      if (bc.length) L.push(`دستورها: ${uniq(bc.map((c) => `/${c.cmd} (${short(c.file)} › ${c.fn || "—"})`)).join("، ")}`);
      if (bp.length) L.push("", "| دکمه | پاسخ‌گو | سازنده‌ها |", "|---|---|---|", ...bp.map((p) => `| \`${p}:\` | ${tab(fnList(m.bot.handlers.filter((h) => h.prefix === p)))} | ${tab(fnList(m.bot.buttons.filter((b) => b.prefix === p), 5))} |`));
    }
    if (f.env.size) L.push("", `متغیرهای Worker (نام): ${[...f.env].sort().join("، ")}`);
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
  I.push("نقشه‌های دیگر: [PANELS.md](PANELS.md) پنل ← تب ← قابلیت | [BOTS.md](BOTS.md) دستور و دکمهٔ بات‌ها، Cron | کارتِ هر جریان: workflows/<شناسه>.md", "");
  I.push("## جریان‌های کار", "");
  for (const w of m.workflows) { I.push(`### [${w.id}](workflows/${w.id}.md) — ${w.title}`); w.steps.forEach((s, i) => I.push(`${i + 1}. ${s.who ? `(${s.who}) ` : ""}${s.t} → ${s.f.join("، ")}`)); I.push(""); }
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

  /* پنل ← بخش ← قابلیت */
  const P = ["# پنل‌ها و بخش‌ها ← قابلیت", "", "> خودکار. منبع: PANELSِ product-map/taxonomy.mjs (درخت) + جای راهنمای هر قابلیت در کد (help.set / ui.info).", "> `key` همان مقدارِ بخش در کدِ پنل است (S.tab، S.screen، S.aiView، …).", ""];
  const secLine = (pn, s, depth) => {
    const f = m.feats.get(s.f), anchors = f ? uniq(f.helpSites.filter((h) => pn.page === h.file || pn.files.includes(h.file)).map((h) => `${short(h.file)}${h.where ? ` › ${h.where}` : ""}`)) : [];
    const eps = f ? new Set(f.endpoints.map((r) => r.key)).size : 0;
    P.push(`${"  ".repeat(depth)}- ${s.title}${s.key ? ` \`${s.key}\`` : ""} → [${s.f}](features/${s.f}.md) — ${eps} مسیر، ${f ? f.tests.size : 0} تست${anchors.length ? ` | کد: ${anchors.slice(0, 4).join("، ")}${anchors.length > 4 ? "، …" : ""}` : ""}`);
    for (const c of s.sections) secLine(pn, c, depth + 1);
  };
  for (const pn of m.panels) {
    P.push(`## ${pn.title} (${pn.id})`, "", `${pn.page ? `صفحه: \`${pn.page}\`` : "بخش‌های مشترکِ همهٔ صفحه‌ها"} | کاربر: ${pn.who || "—"}`, "");
    for (const s of pn.sections) secLine(pn, s, 0);
    P.push("");
  }
  out[`${OUT}/PANELS.md`] = P.join("\n");

  /* بات‌ها و Cron */
  const B = ["# بات‌ها: دستورها، دکمه‌ها و کارهای زمان‌بندی‌شده", "", "> خودکار. دکمه = پیشوندِ callback_data؛ پاسخ‌گو جایی است که همان پیشوند را می‌گیرد (action === \"x\"، /^x:/، startsWith(\"x:\")).", "> دکمه‌ای که پاسخ‌گو نداشته باشد خطای نقشه است.", ""];
  const byF = (xs) => uniq(xs.map((x) => x.feature || "—")).sort();
  B.push("## دستورها", "", "| دستور | پاسخ‌گو | قابلیت |", "|---|---|---|");
  for (const c of uniq(m.bot.commands.map((c) => c.cmd)).sort()) { const cs = m.bot.commands.filter((x) => x.cmd === c); B.push(`| /${c} | ${tab(fnList(cs))} | ${byF(cs).join("، ")} |`); }
  const prefixes = uniq(m.bot.buttons.map((b) => b.prefix)).sort();
  B.push("", `## دکمه‌ها (${prefixes.length})`, "", "| دکمه | پاسخ‌گو | قابلیتِ پاسخ‌گو | سازنده‌ها |", "|---|---|---|---|");
  for (const p of prefixes) { const hs = m.bot.handlers.filter((h) => h.prefix === p); B.push(`| \`${p}:\` | ${tab(fnList(hs))} | ${byF(hs).join("، ")} | ${tab(fnList(m.bot.buttons.filter((b) => b.prefix === p), 5))} |`); }
  B.push("", "## کارهای زمان‌بندی‌شده (Cron؛ wrangler.toml › [triggers])", "");
  for (const c of m.cron) { B.push(`### ${c.entry} (${c.feature || "—"})`, ""); for (const r of c.runs) B.push(`- ${short(r.ref.replace("#", " › "))}${r.feature ? ` — ${r.feature}` : ""}`); B.push(""); }
  out[`${OUT}/BOTS.md`] = B.join("\n");

  /* کارتِ هر جریان کار */
  for (const w of m.workflows) {
    const WL = [`# ${w.id} — ${w.title}`, "", "> خودکار. گام‌ها از WORKFLOWSِ product-map/taxonomy.mjs؛ محلِ هر گام از PANELS؛ مسیر و تست از کد.", ""];
    const all = new Set(), wt = new Set();
    w.steps.forEach((s, i) => {
      WL.push(`## گام ${i + 1} — ${s.t}`, "");
      if (s.who) WL.push(`کننده: ${s.who}`);
      const pl = uniq(s.f.flatMap((id) => (m.feats.get(id)?.places || []).map((x) => x.path.join(" › "))));
      if (pl.length) WL.push(`محل: ${pl.slice(0, 6).join(" | ")}${pl.length > 6 ? " | …" : ""}`);
      WL.push("", "| قابلیت | عنوان | مسیر | تست |", "|---|---|---|---|");
      for (const id of s.f) { const f = m.feats.get(id); if (!f) continue; f.tests.forEach((x) => all.add(x)); f.tables.w.forEach((x) => wt.add(x)); WL.push(`| [${id}](../features/${id}.md) | ${tab(f.title)} | ${new Set(f.endpoints.map((r) => r.key)).size} | ${f.tests.size} |`); }
      WL.push("");
    });
    WL.push("## جدول‌هایی که این جریان می‌نویسد", "", list([...wt].sort()), "", `## همهٔ تست‌های این جریان (${all.size})`, "", "```", `node --test ${[...all].sort().join(" ")}`, "```", "");
    out[`${OUT}/workflows/${w.id}.md`] = WL.join("\n");
  }

  /* گراف ماشین‌خوان */
  const graph = {
    note: "generated by scripts/map/build.mjs — structure only (no line numbers); line numbers come live from scripts/map/impact.mjs",
    areas: m.areas,
    features: F.map((f) => ({ id: f.id, area: f.area, title: f.title, help: f.help, places: uniq(f.places.map((pl) => pl.path.join(" › "))), files: f.files, endpoints: [...new Set(f.endpoints.map((r) => r.key))].sort(), tests: [...f.tests].sort(), tables: { w: [...f.tables.w].sort(), r: [...f.tables.r].sort() }, related: f.related })),
    workflows: m.workflows,
    panels: m.panels.map(function strip(p) { return p.sections ? { ...(p.id ? { id: p.id, page: p.page, title: p.title, who: p.who } : { key: p.key, title: p.title, f: p.f }), sections: p.sections.map(strip) } : p; }),
    bot: { commands: uniq(m.bot.commands.map((c) => `${c.cmd}|${c.file}#${c.fn}`)).sort(), buttons: uniq(m.bot.buttons.map((b) => b.prefix)).sort().map((p) => ({ prefix: p, handlers: uniq(m.bot.handlers.filter((h) => h.prefix === p).map((h) => `${h.file}#${h.fn}`)), producers: uniq(m.bot.buttons.filter((b) => b.prefix === p).map((b) => `${b.file}#${b.fn}`)) })) },
    cron: m.cron.map((c) => ({ entry: c.entry, runs: c.runs.map((r) => r.ref) })),
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
  for (const sub of ["features", "workflows"]) {
    const dir = join(ROOT, OUT, sub);
    if (existsSync(dir)) for (const n of readdirSync(dir)) if (!out[`${OUT}/${sub}/${n}`]) stale.push(`${OUT}/${sub}/${n} (اضافه)`);
  }
  return { model, out, errors: model.errors, warnings: model.warnings, stale };
}
