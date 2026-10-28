/* ============================================================
   اسکنرِ نقشهٔ محصول — بی مدل و بی وابستگی؛ فقط خواندنِ متنِ کد
   از کد این‌ها را بیرون می‌کشد (همه با شمارهٔ خط):
     • مسیرهای سرور (worker): «path === "/x" && m === "GET"»، «/^\/x\/(\d+)$/.exec(path)» و زیرمسیرهای سوارشده (MOUNTS)
     • تابع‌های هر فایل، importها و ارجاع هر تابع به تابع‌های فایل‌های دیگر
     • جدول‌های D1 که هر تابع می‌خواند (FROM/JOIN) یا می‌نویسد (INSERT/UPDATE/DELETE) — فقط نام‌های شناخته‌شده
     • فراخوان‌های پنل‌ها: api("/x") و TP.api(`/x/${id}`) با صفحه و تابعِ صدازننده
     • کلیدهای راهنما (help-content.js) و جای TP.ui.help.set(key) / TP.ui.info(key) در پنل‌ها (محلِ هر قابلیت در رابط)
     • بات‌ها: دستورها (/start، …)، دکمه‌ها (callback_data) و پاسخ‌گوی هر پیشوندِ دکمه
     • تست‌ها: فایل‌هایی که import می‌کنند و مسیرهایی که صدا می‌زنند
   خروجی: یک شیء facts که build.mjs با taxonomy.mjs ترکیبش می‌کند.
   ============================================================ */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const rel = (p) => relative(ROOT, p).split("\\").join("/");
/* CRLF (کپیِ ویندوزی با autocrlf) و LF (لینوکس) یک خروجی بدهند */
const read = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");

/* زیرمسیرهایی که تابعشان مسیرِ بریده‌شده می‌گیرد (path.slice(prefix.length)): «sub === "/x"» یعنی prefix + "/x" */
export const MOUNTS = { "worker/ai-agent.js#aiAdmin": "/support/ai", "worker/usd.js#usdAdmin": "/support/usd" };
/* مسیرهای فایل‌هایی که زیرِ پایهٔ دیگری‌اند (نه /tamin-poshtibani/api) با برچسبِ پایه نوشته می‌شوند */
const BASES = { "worker/legal.js": "legal" };
/* بسته‌بندهای api در پنل‌ها که پیشوند می‌چسبانند (fn: نامِ صدازننده یا «*»؛ pre: پیشوند؛ map: [regex, جایگزین]).
   پنل پشتیبانی همهٔ مسیرها را با «/support» می‌فرستد و ماژول‌های تب‌هایش همان api را می‌گیرند (C.api). */
const SUP = { fn: "*", pre: "/support" };
const FRONT_PREFIX = {
  "frontend/tamin-poshtibani/tender.js": [{ fn: "api", pre: "/tender/{}" }],
  "frontend/tamin-poshtibani/support-panel.js": [{ fn: "api", pre: "/support" }],
  "frontend/tamin-poshtibani/cr-admin.js": [SUP], "frontend/tamin-poshtibani/fb-admin.js": [SUP],
  "frontend/tamin-poshtibani/tender-admin.js": [SUP], "frontend/tamin-poshtibani/cm-result.js": [SUP],
  "frontend/tamin-poshtibani/expert-ai.js": [{ fn: "*", map: [/^\/ai(?=\/|$)/, "/support/ai/{}"] }],
};
/* پوشه‌های اسکن */
const WORKER = ["worker.js", "worker"];
const FRONT = "frontend/tamin-poshtibani";
const TESTS = "backend/tamin-poshtibani/tests";
const SCHEMA = "backend/tamin-poshtibani/schema.sql";

export function walk(dir, re = /\.(m?js)$/) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  if (statSync(abs).isFile()) return re.test(dir) ? [dir] : [];
  const out = [];
  for (const n of readdirSync(abs).sort()) {
    if (n === "node_modules" || n.startsWith(".")) continue;
    const p = join(abs, n);
    if (statSync(p).isDirectory()) out.push(...walk(rel(p), re));
    else if (re.test(n)) out.push(rel(p));
  }
  return out;
}

/* توضیح‌هایی که از ابتدای خط شروع می‌شوند خالی می‌شوند (طول و شمارهٔ خط ثابت می‌ماند) تا متنِ راهنما با کد اشتباه نشود */
export function blankComments(text) {
  const blank = (s) => s.replace(/[^\n]/g, " ");
  return text.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, blank).replace(/^[ \t]*\/\/.*$/gm, blank);
}
const lineAt = (starts, off) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= off) lo = mid; else hi = mid - 1; } return lo + 1; };
const lineStarts = (t) => { const s = [0]; for (let i = 0; i < t.length; i++) if (t[i] === "\n") s.push(i + 1); return s; };

/* تابع‌ها: اعلان در تورفتگیِ حداکثر maxIndent؛ هر تابع تا پیش از اعلانِ بعدیِ هم‌سطح */
const DECL = /^([ \t]*)(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(|^([ \t]*)(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)|^([ \t]*)(?:export\s+)?class\s+([A-Za-z_$][\w$]*)|^([ \t]*)(async\s+)?(fetch|scheduled|queue)\s*\(/;
const BOUND = /^([ \t]*)(?:export\s+|import\s|(?:const|let|var|class|function|async\s+function)\s)/;
export function functions(lines, maxIndent) {
  const decls = [];
  lines.forEach((l, i) => {
    const m = DECL.exec(l);
    if (m) {
      const ind = (m[1] ?? m[3] ?? m[5] ?? m[7] ?? "").replace(/\t/g, "  ").length;
      /* fetch/scheduled/queue درونِ export default { … } (تورفتگیِ ۲) هم تابعِ ورودی است */
      if (ind <= maxIndent || (m[9] && ind <= 2)) decls.push({ name: m[2] || m[4] || m[6] || m[9], line: i + 1, ind, fn: true });
      return;
    }
    const b = BOUND.exec(l);
    if (b) { const ind = b[1].replace(/\t/g, "  ").length; if (ind <= maxIndent) decls.push({ line: i + 1, ind, fn: false }); }
  });
  const out = [];
  decls.forEach((d, k) => {
    if (!d.fn) return;
    let end = lines.length;
    for (let j = k + 1; j < decls.length; j++) if (decls[j].ind <= d.ind) { end = decls[j].line - 1; break; }
    while (end > d.line && !lines[end - 1].trim()) end--;
    out.push({ name: d.name, start: d.line, end });
  });
  return out;
}
const fnAt = (fns, line) => { let best = null; for (const f of fns) if (f.start <= line && line <= f.end && (!best || f.start >= best.start)) best = f; return best; };

/* importها: نامِ محلی → {mod, name}؛ mod نسبت به ریشهٔ مخزن */
export function imports(text, file) {
  const out = [], dir = dirname(file);
  const norm = (spec) => (spec.startsWith(".") ? rel(resolve(ROOT, dir, spec)) : spec);
  const re = /^[ \t]*(import|export)\s+(?:type\s+)?(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\}|\*\s*(?:as\s+([\w$]+))?)?\s*(?:from\s+)?["']([^"']+)["']/gm;
  let m;
  while ((m = re.exec(text))) {
    const mod = norm(m[5]), names = [];
    if (m[2] && m[1] === "import") names.push({ local: m[2], name: "default" });
    if (m[3]) for (const part of m[3].split(",")) { const p = part.trim(); if (!p) continue; const [a, b] = p.split(/\s+as\s+/); names.push({ local: (b || a).trim(), name: a.trim() }); }
    if (m[4]) names.push({ local: m[4], name: "*" });
    out.push({ mod, names, reexport: m[1] === "export", line: lineAt(lineStarts(text), m.index) });
  }
  const dyn = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
  while ((m = dyn.exec(text))) out.push({ mod: norm(m[1]), names: [], dynamic: true, line: lineAt(lineStarts(text), m.index) });
  return out;
}

/* regex مسیر → قالب‌ها با {} برای بخش‌های متغیر؛ گروه‌های «a|b|c» باز می‌شوند */
export function expandRegex(src) {
  let i = 0;
  const seq = () => {
    let outs = [""];
    while (i < src.length && src[i] !== ")" && src[i] !== "|") {
      let atom;
      const c = src[i];
      if (c === "\\") { const n = src[i + 1]; i += 2; atom = /[dwsDWS]/.test(n) ? ["{}"] : [n]; }
      else if (c === "[") { let j = i + 1; while (j < src.length && src[j] !== "]") { if (src[j] === "\\") j++; j++; } i = j + 1; atom = ["{}"]; }
      else if (c === "(") { i++; if (src.startsWith("?:", i)) i += 2; else if (src.startsWith("?<", i)) i = src.indexOf(">", i) + 1; atom = alt(); i++; }
      else if (c === ".") { i++; atom = ["{}"]; }
      else if (c === "^" || c === "$") { i++; continue; }
      else { i++; atom = [c]; }
      const q = src[i];
      if (q === "?") { i++; atom = [...atom, ""]; if (src[i] === "?") i++; }
      else if (q === "*" || q === "+") { i++; atom = [c === "." ? "{*}" : "{}"]; if (src[i] === "?") i++; }
      else if (q === "{") { i = src.indexOf("}", i) + 1; atom = ["{}"]; }
      const next = [];
      for (const o of outs) for (const a of atom) next.push(o + a);
      outs = next.slice(0, 80);
    }
    return outs;
  };
  const alt = () => { let all = seq(); while (src[i] === "|") { i++; all = all.concat(seq()); } return all; };
  return [...new Set(alt().map((s) => s.replace(/(\{\})+/g, "{}")))];
}

/* دو قالب مسیر یکی‌اند اگر بخش‌به‌بخش برابر باشند یا یکی {} داشته باشد */
export function samePath(a, b) {
  const A = a.split("/"), B = b.split("/");
  if (A.length !== B.length) return false;
  return A.every((x, k) => seg(x, B[k]) || seg(B[k], x));
}
/* «{}» درونِ یک بخش فقط همان‌جا متغیر است: «tenders{}» (از `/tenders${qs}`) با «tenders» می‌خورد، نه با هر بخشی */
const segRe = (s) => new RegExp("^" + s.split("{}").map((p) => p.replace(/[.*+?^$()|[\]\\]/g, "\\$&")).join("[^/]*") + "$");
const seg = (x, y) => x === y || (x.includes("{}") && segRe(x).test(y.replace(/\{\}/g, "")));
export function normCall(s) {
  return s.replace(/\$\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, "{}").replace(/[?#].*$/, "").replace(/(\{\})+/g, "{}").replace(/\/+$/, "") || "/";
}

/* جدول‌های شناخته‌شده: schema.sql و هر CREATE TABLE در کد */
function knownTables(files) {
  const t = new Map();
  const add = (name, file, line) => { if (!t.has(name)) t.set(name, { name, defs: [] }); t.get(name).defs.push(`${file}:${line}`); };
  for (const f of [SCHEMA, ...files]) {
    if (!existsSync(join(ROOT, f))) continue;
    const text = read(f), st = lineStarts(text), re = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+["`]?([a-z_][a-z0-9_]*)/g;
    let m;
    while ((m = re.exec(text))) add(m[1], f, lineAt(st, m.index));
  }
  return t;
}
function sqlTables(body, known) {
  const r = new Set(), w = new Set();
  const rr = /\b(?:FROM|JOIN)\s+["`]?([a-z_][a-z0-9_]*)/g, ww = /\b(?:INSERT(?:\s+OR\s+[A-Z]+)?\s+INTO|REPLACE\s+INTO|UPDATE|DELETE\s+FROM|ALTER\s+TABLE)\s+["`]?([a-z_][a-z0-9_]*)/g;
  let m;
  while ((m = rr.exec(body))) if (known.has(m[1])) r.add(m[1]);
  while ((m = ww.exec(body))) if (known.has(m[1])) w.add(m[1]);
  return { r: [...r].sort(), w: [...w].sort() };
}

/* ---------- سرور ---------- */
function scanWorker(file, known) {
  const raw = read(file), text = blankComments(raw), lines = text.split("\n");
  const fns = functions(lines, 0), imps = imports(text, file);
  const importedNames = new Map();
  for (const im of imps) for (const n of im.names) importedNames.set(n.local, { mod: im.mod, name: n.name });
  const importLines = new Set(imps.map((i) => i.line));
  const exports = [];
  for (const m of text.matchAll(/^export\s+(?:default\s+)?(?:async\s+)?(?:function\s*\*?\s*|const\s+|let\s+|class\s+)([A-Za-z_$][\w$]*)/gm)) exports.push(m[1]);
  for (const m of text.matchAll(/^export\s*\{([^}]*)\}/gm)) for (const p of m[1].split(",")) { const [a, b] = p.trim().split(/\s+as\s+/); if (a) exports.push((b || a).trim()); }
  const localNames = new Set(fns.map((f) => f.name));
  const refsIn = (from, to) => {
    const uses = new Set(), calls = new Set();
    for (let ln = from; ln <= to; ln++) {
      if (importLines.has(ln)) continue;
      const l = lines[ln - 1];
      for (const m of l.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)(?:\s*\.\s*([A-Za-z_$][\w$]*))?/g)) {
        const id = m[1];
        if (importedNames.has(id)) { const t = importedNames.get(id); uses.add(`${t.mod}#${t.name === "*" ? m[2] || "*" : t.name}`); }
        else if (localNames.has(id)) calls.add(id);
      }
    }
    return { uses, calls };
  };
  const fnInfo = fns.map((f) => {
    const body = lines.slice(f.start - 1, f.end).join("\n"), { uses, calls } = refsIn(f.start, f.end);
    calls.delete(f.name);
    const env = [...new Set([...body.matchAll(/\benv\.([A-Z][A-Z0-9_]{2,})/g)].map((m) => m[1]))].sort();
    return { ...f, uses: [...uses].sort(), calls: [...calls].sort(), tables: sqlTables(body, known), env };
  });
  /* مسیرها. پیشوندِ هر مسیر:
     • «path» در تابع‌های اصلی مطلق است؛ «sub» نسبت به MOUNTS؛
     • اگر متغیر از یک regexِ «پخش‌کننده» با دمِ (\/.*) پر شده باشد (const path = top[2]، const [, id, sub] = mm)،
       پیشوند همان قالبِ پخش‌کننده تا پیش از دمش است — مثلاً /support/ai/{}/state */
  const routes = [], mounts = [], routeLines = [], dispatch = [];
  const base = BASES[file] || "";
  const assignsFrom = (l, v) => { const m = new RegExp(`(?:^|[\\s,\\[{(;])${v}\\s*=(?!=)([^;]*)`).exec(l); return m ? m[1] : null; };
  const destructFrom = (l, v) => { const m = new RegExp(`\\[[^\\]]*\\b${v}\\b[^\\]]*\\]\\s*=\\s*([\\w$]+)`).exec(l); return m ? m[1] : null; };
  const prefixOf = (ln, v, f) => {
    if (!f) return v === "sub" ? null : "";
    for (let a = ln - 1; a > f.start; a--) {
      const l = lines[a - 1], rhs = destructFrom(l, v) ?? assignsFrom(l, v);
      if (rhs == null) continue;
      const d = [...dispatch].reverse().find((x) => x.line <= a && x.line >= f.start && new RegExp(`\\b${x.var}\\b`).test(rhs));
      if (d) { d.used = true; return d.prefix; }
    }
    return v === "sub" ? (MOUNTS[`${file}#${f.name}`] ?? null) : "";
  };
  lines.forEach((l, i) => {
    const ln = i + 1, methods = [...l.matchAll(/\bm\s*===\s*"([A-Z]+)"/g)].map((m) => m[1]), f = fnAt(fns, ln);
    const where = f ? f.name : null, found = [];
    for (const m of l.matchAll(/\b(path|sub)\s*===\s*"(\/[^"]*)"/g)) {
      const p = prefixOf(ln, m[1], f);
      found.push({ tpl: (p ?? "") + (m[2].replace(/\/$/, "") || (p ? "" : "/")), unmounted: p == null, raw: m[2] });
    }
    for (const m of l.matchAll(/(?:\b([\w$]+)\s*=\s*)?\/\^((?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^\/\\\n\[])*?)\$?\/[a-z]*\.exec\(\s*(path|sub)\s*\)/g)) {
      const p = prefixOf(ln, m[3], f), tpls = expandRegex(m[2]).map((t) => (p ?? "") + t.replace(/\/$/, ""));
      const tail = tpls.find((t) => t.includes("{*}")), shortest = tpls.filter((t) => !t.includes("{*}")).sort((a, b) => a.length - b.length)[0];
      if (m[1]) dispatch.push({ line: ln, var: m[1], prefix: tail ? tail.slice(0, tail.indexOf("{*}")).replace(/\/$/, "") : shortest, base: base ? `${base}:` : "" });
      for (const t of new Set(tpls.map((x) => x.replace(/\{\*\}/g, "{}")))) found.push({ tpl: t, unmounted: p == null, raw: `/^${m[2]}$/` });
    }
    for (const m of l.matchAll(/\b(path|sub)\.startsWith\(\s*"(\/[^"]*)"\s*\)/g)) mounts.push({ prefix: (prefixOf(ln, m[1], f) ?? "?") + m[2], file, line: ln, fn: where });
    if (found.length) routeLines.push(ln);
    for (const r of found) routes.push({ method: methods.length ? methods.join("|") : "*", path: (base ? `${base}:` : "") + r.tpl, file, line: ln, fn: where, raw: r.raw, unmounted: r.unmounted });
  });
  /* دمِ اختیاریِ پخش‌کننده‌ای که به sub/path رسیده خودش مسیر نیست (مثلاً /chats/{}/{} در کنار /chats/{}/send) */
  for (const d of dispatch.filter((x) => x.used)) for (let k = routes.length - 1; k >= 0; k--) {
    const r = routes[k];
    if (r.line === d.line && r.path.length > (d.base + d.prefix).length) routes.splice(k, 1);
  }
  /* بلوکِ هر مسیر: از خطش تا پیش از مسیرِ بعدی در همان تابع → تابع‌های صدازده‌شده و جدول‌ها */
  for (const r of routes) {
    const f = fnAt(fns, r.line), next = routeLines.find((x) => x > r.line && (!f || x <= f.end));
    const to = Math.min(next ? next - 1 : f ? f.end : r.line, r.line + 60);
    const { uses, calls } = refsIn(r.line, to);
    r.end = to;
    r.handler = { uses: [...uses].sort(), calls: [...calls].filter((c) => c !== r.fn).sort() };
    r.tables = sqlTables(lines.slice(r.line - 1, to).join("\n"), known);
  }
  return { file, lines: lines.length, functions: fnInfo, imports: imps.map(({ mod, names, dynamic, reexport }) => ({ mod, names: names.map((n) => n.name), dynamic: !!dynamic, reexport: !!reexport })), exports: [...new Set(exports)].sort(), routes, mounts, bot: scanBot(text, fns) };
}

/* ---------- بات‌ها ----------
   • دکمه: callback_data: "xd:…" یا `xd:${id}` ← پیشوندِ پیش از «:» (دکمه‌ای که با ${…} شروع شود پیشوندِ ثابت ندارد و شمرده نمی‌شود)
   • پاسخ‌گو: action === "xd" (یا a/act/cd/data)، /^xd:/ و startsWith("xd:")
   • دستور: /^\/start…/.test(text) یا text === "/kartabl" یا text.startsWith("/start") (متغیرِ text/gtext) */
function scanBot(text, fns) {
  const st = lineStarts(text), at = (i) => { const line = lineAt(st, i); return { line, fn: fnAt(fns, line)?.name || null }; };
  const buttons = [], handlers = [], commands = [];
  for (const m of text.matchAll(/callback_data\s*:\s*(["'`])([a-z][\w-]*)(?=[:"'`])/g)) buttons.push({ prefix: m[2], ...at(m.index) });
  for (const m of text.matchAll(/\b(?:action|a|act|cd|data)\s*===\s*"([a-z][\w-]*)(?::[^"]*)?"/g)) handlers.push({ prefix: m[1], ...at(m.index) });
  for (const m of text.matchAll(/\/\^\(?([a-z][\w-]*)(?:\\:|:)/g)) handlers.push({ prefix: m[1], ...at(m.index) });
  for (const m of text.matchAll(/startsWith\(\s*"([a-z][\w-]*):"\s*\)/g)) handlers.push({ prefix: m[1], ...at(m.index) });
  for (const m of text.matchAll(/\/\^\\\/([a-z]\w*)[^\n]*?\/[a-z]*\.(?:test|exec)\(\s*(?:text|gtext|t)\s*\)/g)) commands.push({ cmd: m[1], ...at(m.index) });
  for (const m of text.matchAll(/\b(?:text|gtext)\s*(?:===\s*"\/([a-z]\w*)"|\.startsWith\(\s*"\/([a-z]\w*)"\s*\))/g)) commands.push({ cmd: m[1] || m[2], ...at(m.index) });
  return { buttons, handlers, commands };
}

/* ---------- پنل‌ها ---------- */
function callSites(text, file) {
  const out = [], st = lineStarts(text), rules = FRONT_PREFIX[file] || [];
  const wrap = (fn, s) => { for (const r of rules) if (r.fn === "*" || r.fn === fn) return r.map ? s.replace(r.map[0], r.map[1]) : r.pre + s; return s; };
  const re = /(?<![\w$])(TP\.api|UI\.api|C\.api|api|API_CALL)\s*\(\s*(["'`])/g;
  let m;
  while ((m = re.exec(text))) {
    const q = m[2];
    let j = re.lastIndex, s = "", depth = 0;
    while (j < text.length) {
      const c = text[j];
      if (c === "\\") { s += text.slice(j, j + 2); j += 2; continue; }
      if (q === "`" && c === "$" && text[j + 1] === "{") { depth++; s += "${"; j += 2; continue; }
      if (depth && c === "}") { depth--; s += "}"; j++; continue; }
      if (!depth && c === q) break;
      if (c === "\n" && q !== "`") break;
      s += c; j++;
    }
    if (!s.startsWith("/") && !s.startsWith("${")) continue;
    const after = text.slice(j + 1, j + 400), concat = /^\s*\+/.test(after);
    /* روش: صریح (method: "PUT")، یا مثل TP.api: با body ← POST، بی گزینه ← GET؛ گزینهٔ متغیر ← نامعلوم */
    const first = after.split("\n")[0], mm = /^[^;]*?method\s*:\s*["']([A-Z]+)["']/.exec(first);
    const method = mm ? mm[1] : /^\s*\)/.test(after) ? "GET" : /^\s*,\s*\{[^;]*?\bbody\b/.test(first) ? "POST" : "";
    const path = normCall(m[1] === "TP.api" ? s + (concat ? "{}" : "") : wrap(m[1], s + (concat ? "{}" : "")));
    out.push({ fn: m[1], path, method, line: lineAt(st, m.index), partial: concat || s.startsWith("${") });
  }
  return out;
}
function scanFront(file) {
  const raw = read(file), text = blankComments(raw), lines = text.split("\n");
  const fns = functions(lines, 6);
  const calls = callSites(text, file).map((c) => ({ ...c, where: fnAt(fns, c.line)?.name || null }));
  /* نشانیِ راهنما: help.set (بخشی که الان روی صفحه است) و ui.info / help.open (دکمهٔ «؟» کنارِ یک قسمت) */
  const help = [], st = lineStarts(text);
  for (const m of text.matchAll(/\b(help\.set|ui\.info|help\.open)\(\s*(["'`])([^"'`]+)\2/g)) {
    const line = lineAt(st, m.index);
    help.push({ key: m[3].replace(/\$\{[^}]*\}/g, "{}"), line, kind: m[1] === "help.set" ? "set" : "info", where: fnAt(fns, line)?.name || null });
  }
  return { file, lines: lines.length, functions: fns.map(({ name, start, end }) => ({ name, start, end })), calls, help };
}
function scanPages() {
  return walk(FRONT, /\.html$/).map((file) => {
    const t = read(file);
    const scripts = [...t.matchAll(/<script[^>]*\bsrc="([^"?#]+)/g)].map((m) => rel(resolve(ROOT, dirname(file), m[1])));
    const modules = [...t.matchAll(/import\s+[^;]*?from\s+["'](\.[^"']+)["']/g)].map((m) => rel(resolve(ROOT, dirname(file), m[1])));
    const title = (/<title>([^<]*)<\/title>/.exec(t) || [])[1] || "";
    return { file, title: title.trim(), scripts: [...new Set([...scripts, ...modules])] };
  });
}
export function helpTopics() {
  const file = `${FRONT}/help-content.js`;
  if (!existsSync(join(ROOT, file))) return { areas: {}, topics: {} };
  const sb = { window: {} };
  vm.runInNewContext(read(file), sb);
  const H = sb.window.TP_HELP || { area: {}, topics: {} }, topics = {};
  const strip = (h) => String(h || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  for (const [k, v] of Object.entries(H.topics)) if (!k.startsWith("gl.")) topics[k] = { title: strip(v.title), summary: strip(v.summary), related: v.related || [] };
  return { areas: H.area || {}, topics };
}

/* ---------- تست‌ها ---------- */
function scanTest(file, frontFiles) {
  const text = blankComments(read(file));
  const imps = imports(text, file).filter((i) => !i.mod.startsWith("node:"));
  const paths = new Set();
  for (const m of text.matchAll(/(["'`])(\/[a-z][^"'`\s]*)\1/g)) paths.add(normCall(m[2]));
  for (const m of text.matchAll(/\/tamin-poshtibani\/api(\/[a-z][^"'`\s]*)/g)) paths.add(normCall(m[1]));
  const fronts = frontFiles.filter((f) => text.includes(`"${f.split("/").pop()}"`));
  const names = [...new Set(imps.flatMap((i) => i.names.map((n) => n.name).filter((n) => n !== "default" && n !== "*").map((n) => `${i.mod}#${n}`)))].sort();
  return { file, imports: [...new Set(imps.map((i) => i.mod))].sort(), names, paths: [...paths].sort(), fronts };
}

export function scan() {
  const workerFiles = WORKER.flatMap((d) => walk(d));
  const frontFiles = walk(FRONT, /\.(m?js)$/);
  const known = knownTables(workerFiles);
  const worker = workerFiles.map((f) => scanWorker(f, known));
  const front = frontFiles.map(scanFront);
  const tests = walk(TESTS, /\.test\.m?js$/).map((f) => scanTest(f, frontFiles));
  const testHelpers = walk(TESTS, /\.m?js$/).filter((f) => !/\.test\.m?js$/.test(f));
  return { worker, front, pages: scanPages(), tests, testHelpers, tables: [...known.values()].sort((a, b) => a.name.localeCompare(b.name)), help: helpTopics(), other: { scripts: walk("scripts"), tools: walk("backend/tamin-poshtibani/tools") } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const f = scan(), routes = f.worker.flatMap((w) => w.routes);
  console.log(`worker ${f.worker.length} files, ${f.worker.reduce((a, w) => a + w.functions.length, 0)} functions, ${routes.length} routes, ${f.worker.flatMap((w) => w.mounts).length} mounts`);
  console.log(`front ${f.front.length} files, ${f.front.reduce((a, x) => a + x.calls.length, 0)} api calls, pages ${f.pages.length}, help topics ${Object.keys(f.help.topics).length}`);
  console.log(`tests ${f.tests.length}, tables ${f.tables.length}`);
  if (process.argv.includes("--routes")) for (const r of routes) console.log(`${r.method.padEnd(6)} ${r.path}  ${r.file}:${r.line} ${r.fn || ""}${r.unmounted ? " ⚠unmounted" : ""}`);
  if (process.argv.includes("--tables")) console.log(f.tables.map((t) => t.name).join(" "));
}
