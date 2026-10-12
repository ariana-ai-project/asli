/* ============================================================
   «🗺 نقشهٔ کار» (help-flows.js) — فلوچارتِ هر صفحه در کشوی راهنما (مهر ۱۴۰۵)
   • هر موضوعِ راهنما (help-content.js) نمودار دارد — مستقیم، با نامِ مستعار، یا بخشِ بالاتر — همان جست‌وجوی ui.js:flowOf
   • هر نمودار با «آغاز» شروع و با «پایان» تمام می‌شود و دست‌کم یک گامِ شماره‌دار دارد
   • هر «برو به گام n» به گامی هست اشاره می‌کند؛ هر شاخه پایان دارد؛ کننده‌ها در who هستند؛ متن‌ها بی HTML
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../frontend/tamin-poshtibani");
const load = (f) => { const ctx = { window: {} }; vm.runInNewContext(readFileSync(join(DIR, f), "utf8"), ctx); return ctx.window; };
const HELP = load("help-content.js").TP_HELP;
const FLOWS = load("help-flows.js").TP_FLOWS;

/* همان قاعدهٔ ui.js */
function flowOf(key) {
  const F = FLOWS.flows, A = FLOWS.alias || {}, p = String(key).split(".");
  while (p.length) { const k = p.join("."); if (F[k]) return k; if (A[k] && F[A[k]]) return A[k]; p.pop(); }
  return null;
}
const isStep = (n) => !n.k && !n.q;

test("هر موضوعِ راهنما نقشهٔ کار دارد", () => {
  const miss = Object.keys(HELP.topics).filter((k) => !flowOf(k));
  assert.deepEqual(miss, [], `بی نمودار: ${miss.join("، ")}`);
  for (const [a, k] of Object.entries(FLOWS.alias || {})) assert.ok(FLOWS.flows[k], `نامِ مستعارِ ${a} به ${k} که نیست`);
});

test("ساختارِ هر نمودار: آغاز، پایان، شماره‌ها و «برو به گام»", () => {
  for (const [key, f] of Object.entries(FLOWS.flows)) {
    assert.ok(f.t && typeof f.t === "string", `${key}: عنوان`);
    assert.ok(Array.isArray(f.s) && f.s.length >= 3, `${key}: گره‌ها`);
    assert.equal(f.s[0].k, "start", `${key}: آغاز`);
    assert.equal(f.s[f.s.length - 1].k, "end", `${key}: پایان`);
    const main = f.s.filter(isStep);
    assert.ok(main.length >= 1, `${key}: دست‌کم یک گامِ شماره‌دار`);
    const texts = [];
    const walk = (arr, where) => arr.forEach((n, i) => {
      const at = `${key} ${where}[${i}]`;
      if (n.k) { assert.ok(["start", "end"].includes(n.k), `${at}: k`); assert.ok(n.t, `${at}: متن`); texts.push(n.t, n.d); return; }
      if (n.q) {
        assert.ok(Array.isArray(n.b) && n.b.length >= 2 && n.b.length <= 4, `${at}: ۲ تا ۴ شاخه`);
        texts.push(n.q, n.d);
        n.b.forEach((b, j) => {
          assert.ok(b.l, `${at}.b${j}: برچسب`);
          assert.ok(b.go != null, `${at}.b${j} (${b.l}): شاخه بی پایان`);
          if (typeof b.go === "number") assert.ok(Number.isInteger(b.go) && b.go >= 1 && b.go <= main.length, `${at}.b${j}: گامِ ${b.go} نیست (${main.length} گام)`);
          else assert.ok(typeof b.go === "string" && b.go.trim(), `${at}.b${j}: go`);
          texts.push(b.l, typeof b.go === "string" ? b.go : "");
          walk(b.s || [], `${where}[${i}].b${j}`);
        });
        return;
      }
      assert.ok(n.t, `${at}: متنِ گام`);
      if (n.w) assert.ok(FLOWS.who[n.w], `${at}: کننده‌ی ناشناخته ${n.w}`);
      texts.push(n.t, n.d);
    });
    walk(f.s, "s");
    for (const t of texts.filter(Boolean)) assert.doesNotMatch(t, /[<>]/, `${key}: HTML در «${t}»`);
  }
});

test("کارتِ پیش‌نمایش و نمای بزرگ از یک سازنده‌اند (ui.js) و داده با اولین بازشدن بار می‌شود", () => {
  const ui = readFileSync(join(DIR, "ui.js"), "utf8");
  assert.match(ui, /sc\.src = "help-flows\.js\?v=\d+"/);
  assert.match(ui, /askCard\(\) \+ flowCard\(/, "کارت زیرِ کارتِ دستیار");
  for (const p of ["expert", "manager", "support", "correspond", "supplier", "tender"]) {
    assert.doesNotMatch(readFileSync(join(DIR, `${p}.html`), "utf8"), /help-flows\.js/, `${p}.html نباید از اول بارش کند`);
  }
});
