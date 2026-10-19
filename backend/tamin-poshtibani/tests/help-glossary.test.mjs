/* ============================================================
   واژه‌نامهٔ راهنما (help-content.js، کلیدهای gl.*) — «؟» کنارِ نامِ حالت‌ها، خانواده‌ها، حرکت‌ها و اصطلاح‌ها (مهر ۱۴۰۵، خواستهٔ مالک)
   • ۳۵ اصطلاح، هر کدام با خلاصه و دست‌کم یک پیوندِ https («بیشتر بخوانید»)؛ شش اصطلاحِ پرکاربرد توضیحِ یک‌صفحه‌ای دارند
   • هر کلیدِ واژه‌نامه که صفحه‌ها به کار می‌برند هست: نُه حالتِ استعلام، سه خانواده، ده حرکتِ مذاکره و کلیدهای expert.js
   • کشوی راهنما پیوند را در زبانهٔ تازه و بی دسترسی به پنجره باز می‌کند؛ دانشِ «دستیار سامانه» واژه‌نامه را دارد
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
import * as C from "../../../worker/strategy/config.js";
import { FAMILY } from "../../../worker/cr-engine.js";
import { MOVES } from "../../../worker/strategy/kb-data.js";
import { HELP_KNOWLEDGE } from "../../../worker/help-knowledge.js";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../frontend/tamin-poshtibani");
const load = (f) => { const ctx = { window: {} }; vm.runInNewContext(readFileSync(join(DIR, f), "utf8"), ctx); return ctx.window; };
const HELP = load("help-content.js").TP_HELP;
const GL = Object.entries(HELP.topics).filter(([k]) => k.startsWith("gl."));

test("هر اصطلاحِ واژه‌نامه خلاصه دارد و هر پیوندش https است", () => {
  assert.equal(GL.length, 35);
  assert.equal(HELP.area.gl, "واژه‌نامه");
  for (const [k, t] of GL) {
    assert.ok(t.title && t.title.trim(), `${k}: عنوان`);
    assert.ok(t.summary && t.summary.trim().length >= 80, `${k}: خلاصه`);
    assert.ok(t.grp && t.en, `${k}: زیرگروه و نامِ انگلیسی`);
    assert.ok(Array.isArray(t.links) && t.links.length >= 1, `${k}: دست‌کم یک منبع`);
    for (const l of t.links) {
      assert.ok(l.t && l.t.trim(), `${k}: عنوانِ پیوند`);
      assert.match(l.u, /^https:\/\/[^\s"'<>]+$/, `${k}: ${l.u}`);
      assert.ok(l.paid === undefined || l.paid === true || l.paid === "abs", `${k}: paid`);
    }
    assert.equal(new Set(t.links.map((l) => l.u)).size, t.links.length, `${k}: پیوندِ تکراری`);
    for (const r of t.related || []) assert.ok(HELP.topics[r], `${k}: مرتبطِ ناموجود ${r}`);
  }
});

test("شش اصطلاحِ پرکاربرد توضیحِ یک‌صفحه‌ای دارند: چیست، کِی به کار می‌آید، در سامانهٔ ما، هشدار", () => {
  const pages = GL.filter(([, t]) => (t.sections || []).length).map(([k]) => k).sort();
  assert.deepEqual(pages, ["gl.anchor", "gl.batna", "gl.family.cautious", "gl.kraljic", "gl.pace", "gl.package"]);
  for (const k of pages) {
    const S = HELP.topics[k].sections;
    /* آرایهٔ ساخته‌شده در vm از realmِ دیگری است؛ Array.from آن را در همین realm می‌سازد تا deepEqual فقط محتوا را بسنجد */
    assert.deepEqual(Array.from(S, (s) => s.h), ["چیست", "کِی به کار می‌آید", "در سامانهٔ ما یعنی…", "هشدار / خطای رایج"], k);
    assert.ok(S.every((s) => s.p || (s.li || []).length), `${k}: بخشِ خالی`);
    assert.ok(HELP.topics[k].links.length >= 2, `${k}: «بیشتر بخوانید»`);
  }
});

test("هر «؟»ِ صفحه‌ها به اصطلاحی می‌رسد که هست: حالت‌ها، خانواده‌ها، حرکت‌ها و کلیدهای expert.js", () => {
  for (const m of C.RFQ_MODES) assert.ok(HELP.topics[`gl.mode.${m}`], m);
  const fams = [...new Set(C.RFQ_MODES.map(FAMILY))].sort();
  assert.deepEqual(fams, ["cautious", "max", "special"]);
  for (const f of fams) assert.ok(HELP.topics[`gl.family.${f}`], f);
  const ex = readFileSync(join(DIR, "expert.js"), "utf8");
  const keys = [...new Set([...ex.matchAll(/"(gl\.[A-Za-z_.-]+)"/g)].map((x) => x[1]))];
  assert.ok(keys.length >= 15, `کلیدهای واژه‌نامه در expert.js: ${keys.length}`);
  for (const k of keys) assert.ok(HELP.topics[k], `expert.js: ${k}`);
  /* هر حرکتِ مذاکرهٔ بسته (kb-data.js) در GL_MOVE، و هر کلاسِ بازار در MS_FA */
  const gm = /const GL_MOVE = \{([^}]+)\}/.exec(ex)[1];
  for (const mv of MOVES) assert.ok(gm.includes(`"${mv.id}"`), mv.id);
  const ms = /const MS_FA = \{([^}]+)\}/.exec(ex)[1];
  for (const k of Object.keys(C.MS_NAMES)) assert.ok(ms.includes(`"${k}"`), k);
});

test("کشوی راهنما: «بیشتر بخوانید» فقط https، در زبانهٔ تازه با noopener؛ اصطلاحِ واژه‌نامه پیش از کارت‌ها", () => {
  const ui = readFileSync(join(DIR, "ui.js"), "utf8");
  assert.match(ui, /\/\^https:\\\/\\\/\/\.test\(String\(l\.u/, "فقط https");
  assert.match(ui, /target="_blank" rel="noopener noreferrer"/);
  assert.match(ui, /areaOf\(k\) === "gl" \? tx \+ top : top \+ tx/);
  assert.match(ui, /t\.links \|\| \[\]\)\.map\(\(l\) => l\.t\)/, "جست‌وجو در منبع‌ها");
});

test("دانشِ «دستیار سامانه» واژه‌نامه و منبع‌ها را دارد", () => {
  assert.ok(HELP_KNOWLEDGE.includes("## واژه‌نامه"));
  for (const k of ["(gl.batna)", "(gl.mode.LIMITED_STAGED)", "(gl.pace)"]) assert.ok(HELP_KNOWLEDGE.includes(k), k);
  assert.ok(HELP_KNOWLEDGE.includes("در سامانهٔ ما یعنی…"));
  assert.ok(HELP_KNOWLEDGE.includes("بیشتر بخوانید:\n- PON (Harvard)"));
  assert.ok(HELP_KNOWLEDGE.includes("https://www.oecd.org/"));
});
