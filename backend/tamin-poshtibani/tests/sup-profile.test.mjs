/* ============================================================
   کشوی «👤 پروفایل تأمین‌کننده» (frontend/tamin-poshtibani/sup-profile.js) — تابع‌های خالصش در سندباکس (مهر ۱۴۰۵)
   • فرمِ «🔗 پیوند تازه»: فاصلهٔ آخرِ جست‌وجو با پاسخ و بازسازی نمی‌پرد («آهن آلات» ← «آهنآلات» بود)؛ پاسخِ کهنه دور ریخته می‌شود؛
     نوعِ رابطه و یادداشت با تیک می‌مانند (به «رقابت» برمی‌گشت)؛ «پیدا نشد» با «تأمین‌کنندهٔ تازه»؛ بدنه نامِ نمایشی را کنارِ sid دارد
   • گرافِ شعاعی: مرکز وسطِ قاب؛ حلقهٔ ۱ حداکثر ۱۲ (تأییدشده پیش از پیشنهادی) به تفکیکِ نوعِ رابطه؛ حلقهٔ ۲ درونِ بخشِ والد
     (۳ برای هر والد، ۲۴ روی هم)؛ برچسب‌ها بیرونِ گره، در قاب، بی هم‌پوشانی و دست‌کم ۱۱ پیکسل؛ لنگرِ start/end با direction=rtl
   • نمای کاملِ پشتیبانی (بی مرکز) کشو را روی «👤 پروفایل» باز می‌کند، نه گرافِ دوم روی گراف
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import vm from "node:vm";

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../frontend/tamin-poshtibani");
function load() {
  const sb = { console, Date, Math, JSON, Intl, setTimeout, clearTimeout };
  sb.window = sb; sb.self = sb; sb.globalThis = sb;
  sb.document = { getElementById: () => ({}), createElement: () => ({ style: {} }), head: { appendChild() {} }, body: { appendChild() {} }, addEventListener() {} };
  vm.createContext(sb);
  for (const f of ["shared.js", "sup-profile.js"]) vm.runInContext(readFileSync(resolve(FRONT, f), "utf8"), sb, { filename: f });
  return sb.TP.supProfile;
}
const P = load(), L = P.lib;
const plain = (x) => JSON.parse(JSON.stringify(x));
const NAT = [["rival", "رقابت", "#2563eb"], ["partner", "همکاری", "#ea580c"], ["same_market", "هم‌بازار", "#6b7280"], ["same_business", "یک کسب‌وکار", "#7c3aed"],
  ["chain", "زنجیرهٔ تأمین", "#16a34a"], ["collusion", "تبانی محتمل", "#dc2626"]].map(([key, fa, color]) => ({ key, fa, color }));
const HITS = [{ sid: "NEW-1", name: "آهن آلات الف", hub: "شادآباد", kind: "new" }, { sid: "NEW-2", name: "آهن آلات ب", kind: "new" }, { sid: null, name: "فروشگاه ستاره", kind: "loc", sys: 1 }];

/* ---------------- فرمِ «🔗 پیوند تازه» ---------------- */
test("فرمِ پیوند: فاصلهٔ آخرِ جست‌وجو با پاسخ و بازسازی می‌ماند و پاسخ فقط فهرست و دکمه را دوباره رسم می‌کند", () => {
  let s = L.lfReduce(L.lfInit(), { type: "q", value: "آهن " });
  s = L.lfReduce(s, { type: "ask" });
  s = L.lfReduce(s, { type: "hits", seq: s.seq, q: "آهن", list: HITS });
  assert.equal(s.q, "آهن ", "متنِ خامِ کادر trim نمی‌شود");
  assert.match(L.vLinkForm(s, NAT), /data-link-q value="آهن "/, "بازسازیِ کاملِ فرم همان متن را با فاصله برمی‌گرداند");
  const repaint = L.vLinkBox(s) + L.vLinkAct(s);
  assert.doesNotMatch(repaint, /data-link-q/, "کادرِ جست‌وجو هرگز دوباره ساخته نمی‌شود (فوکوس و صفحه‌کلیدِ گوشی)");
  assert.match(repaint, /آهن آلات الف/);
  s = L.lfReduce(s, { type: "q", value: "آهن آلات" });
  assert.equal(s.q, "آهن آلات");
});

test("فرمِ پیوند: پاسخِ کهنهٔ جست‌وجو دور ریخته می‌شود", () => {
  let s = L.lfReduce(L.lfInit(), { type: "ask" });
  const first = s.seq;
  s = L.lfReduce(s, { type: "ask" });
  s = L.lfReduce(s, { type: "hits", seq: first, q: "آه", list: HITS });
  assert.equal(s.hits, null, "پاسخِ پرسشِ قبلی");
  s = L.lfReduce(s, { type: "hits", seq: s.seq, q: "آهن", list: HITS.slice(0, 1) });
  assert.equal(s.hits.length, 1);
  s = L.lfReduce(s, { type: "clear" });
  assert.equal(s.hits, null);
});

test("فرمِ پیوند: نوعِ رابطه و یادداشت با تیک زدن و پاسخِ تازه می‌مانند؛ انتخاب‌ها با جست‌وجوی تازه نمی‌پرند", () => {
  let s = L.lfReduce(L.lfInit(), { type: "nature", value: "partner" });
  s = L.lfReduce(s, { type: "note", value: "هم‌پاساژ" });
  s = L.lfReduce(s, { type: "q", value: "آهن" });
  s = L.lfReduce(s, { type: "ask" });
  s = L.lfReduce(s, { type: "hits", seq: s.seq, q: "آهن", list: HITS });
  s = L.lfReduce(s, { type: "pick", hit: HITS[0], on: true });
  s = L.lfReduce(s, { type: "pick", hit: HITS[2], on: true });
  assert.deepEqual([s.nature, s.note], ["partner", "هم‌پاساژ"]);
  const html = L.vLinkForm(s, NAT);
  assert.match(html, /<option value="partner" selected>همکاری<\/option>/);
  assert.match(html, /data-link-note value="هم‌پاساژ"/);
  assert.match(html, /data-link-pick="NEW-1" checked/);
  /* جست‌وجوی دیگر: انتخاب‌ها می‌مانند و دکمه روشن است */
  s = L.lfReduce(s, { type: "ask" });
  s = L.lfReduce(s, { type: "hits", seq: s.seq, q: "فولاد", list: [] });
  assert.equal(s.picks.length, 2);
  assert.doesNotMatch(L.vLinkAct(s), /disabled/);
  assert.match(L.vLinkAct(s), /ثبت پیوند \(۲\)/);
  s = L.lfReduce(s, { type: "pick", hit: HITS[0], on: false });
  s = L.lfReduce(s, { type: "unpick", key: s.picks[0].key });
  assert.equal(s.picks.length, 0);
  assert.match(L.vLinkAct(s), /disabled/);
  assert.match(L.vLinkAct(s), /تیک بزنید/, "دکمهٔ خاموش بی توضیح نیست");
});

test("فرمِ پیوند: «پیدا نشد» با «تأمین‌کنندهٔ تازه»؛ بدنه نامِ خودش را کنارِ sid دارد و تازه و «در سامانه» فقط با نام", () => {
  let s = L.lfReduce(L.lfInit(), { type: "nature", value: "rival" });
  s = L.lfReduce(s, { type: "q", value: "پارسیان  غرب " });
  s = L.lfReduce(s, { type: "ask" });
  s = L.lfReduce(s, { type: "hits", seq: s.seq, q: "پارسیان غرب", list: [] });
  const box = L.vLinkBox(s);
  assert.match(box, /پیدا نشد/);
  assert.match(box, /data-link-free="پارسیان غرب"/);
  s = L.lfReduce(s, { type: "free", name: "پارسیان غرب" });
  s = L.lfReduce(s, { type: "free", name: "پارسیان‌ غرب" });
  assert.equal(s.picks.length, 1, "همان نام دو بار نه");
  assert.doesNotMatch(L.vLinkBox(s), /data-link-free/, "پس از افزودن دکمهٔ تازه نمی‌آید");
  s = L.lfReduce(s, { type: "pick", hit: HITS[1], on: true });
  s = L.lfReduce(s, { type: "pick", hit: HITS[2], on: true });
  const body = plain(L.linkBody(s, { sid: "L:آهن آلات نو 12", name: "آهن‌آلات نو ۱۲" }));
  assert.deepEqual(body, { sid: "L:آهن آلات نو 12", name: "آهن‌آلات نو ۱۲", nature: "rival", note: "",
    to: [{ name: "پارسیان غرب" }, { sid: "NEW-2", name: "آهن آلات ب" }, { name: "فروشگاه ستاره" }] });
  /* یافته‌ای عیناً همان متن: «تازه» پیشنهاد نمی‌شود */
  let t = L.lfReduce(L.lfInit(), { type: "q", value: "آهن آلات ب" });
  t = L.lfReduce(t, { type: "ask" });
  t = L.lfReduce(t, { type: "hits", seq: t.seq, q: "آهن آلات ب", list: HITS });
  assert.doesNotMatch(L.vLinkBox(t), /data-link-free/);
  /* پس از ثبت: همه پاک، نوعِ رابطه می‌ماند */
  s = L.lfReduce(s, { type: "saved" });
  assert.deepEqual([s.q, s.note, s.picks.length, s.hits, s.nature], ["", "", 0, null, "rival"]);
});

test("کوتاه کردنِ نام در مرزِ واژه با «…»", () => {
  assert.equal(L.cut("فولاد ت", 22), "فولاد ت");
  const name = "صنایع آرین فولاد سپاهان", c = L.cut(name, 16);
  assert.ok(c.endsWith("…") && c.length <= 16, c);
  const words = c.slice(0, -1).split(" ");
  assert.ok(name.split(" ").slice(0, words.length).join(" ") === words.join(" "), `واژهٔ نیمه نه: ${c}`);
  assert.ok(L.cut("آهن‌آلات‌پارسیان‌شرق‌وغرب", 10).length <= 10, "واژهٔ تنهای بلند هم بریده می‌شود");
  assert.equal(L.fitTo(name, 30, 12), "", "جایی که حتی چند نویسه نمی‌گیرد");
  const f = L.fitTo(name, 90, 12);
  assert.ok(f.endsWith("…") && L.estW(f, 12) <= 90, f);
  assert.equal(L.fitTo("فولاد ت", 90, 12), "فولاد ت");
});

/* ---------------- گرافِ شعاعی ---------------- */
const STATUS = ["تأییدشده", "پیشنهادی"], STR = ["قوی", "متوسط", "ضعیف", null], KINDS = ["old", "new", "loc"];
const NAMES = ["آهن‌آلات البرز", "فلزات کاوه", "بازرگانی نوین پارس", "پارسیان شرق", "نمایندگیِ ستاره", "صنایع آرین فولاد سپاهان", "گروه صنعتی میلگرد گستر", "فروشگاه آهن امیر",
  "فولاد مبارکه نمایندگی ۱۲", "تولیدی ورق گالوانیزه", "شرکت پروفیل سازان", "آهن فروشی برادران", "بازار آهن شادآباد حجره ۴۵", "لوله و اتصالات تهران", "توزیع فولاد ایرانیان"];
/** مرکز F با n1 همسایهٔ مستقیم (نوع، وضعیت و شدتِ گوناگون) و برای هر کدام kids(i) همسایهٔ دو قدمی */
function sample(n1, kids) {
  const nodes = [{ sid: "F", name: "فولاد پارسیان", kind: "old", root: true }], edges = [];
  const edge = (a, b, i) => { const n = NAT[i % NAT.length]; edges.push({ a, b, nature: n.key, color: n.color, fa: n.fa, status: STATUS[(i >> 1) % 2], strength: STR[i % 4] }); };
  for (let i = 0; i < n1; i++) {
    nodes.push({ sid: `N${i}`, name: NAMES[i % NAMES.length], kind: KINDS[i % 3], hub: "لاله‌زار" });
    edge("F", `N${i}`, i);
    for (let j = 0; j < kids(i); j++) { nodes.push({ sid: `C${i}_${j}`, name: `${NAMES[(i + j + 3) % NAMES.length]} شعبهٔ ${j + 1}`, kind: KINDS[(i + j) % 3] }); edge(`N${i}`, `C${i}_${j}`, i + j); }
  }
  edge("N0", "N3", 3);
  return { root: "F", nodes, edges, natures: NAT };
}
const over = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const angle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function checkLayout(Lt, msg) {
  const { W, H } = Lt;
  for (const n of Lt.nodes) {
    assert.ok(n.x - n.r >= 0 && n.x + n.r <= W && n.y - n.r >= 0 && n.y + n.r <= H, `${msg}: گرهِ ${n.name} بیرونِ قاب`);
    assert.ok(n.fs >= 11, `${msg}: قلمِ ${n.fs}`);
  }
  const vis = Lt.nodes.filter((n) => n.label && !n.label.hide);
  for (const n of vis) {
    const b = n.label.box, lb = n.label;
    assert.ok(b[0] >= 0 && b[1] >= 0 && b[2] <= W && b[3] <= H, `${msg}: برچسبِ ${n.name} بیرونِ قاب`);
    for (const m of Lt.nodes) assert.ok(!over(b, [m.x - m.r, m.y - m.r, m.x + m.r, m.y + m.r]), `${msg}: برچسبِ ${n.name} روی گرهِ ${m.name}`);
    /* لنگر با direction=rtl: «end» ← متن به راستِ x، «start» ← به چپِ x؛ هیچ‌کدام روی گرهِ خودش نیست */
    if (lb.anchor === "end") assert.ok(lb.x >= n.x + n.r && b[0] === lb.x, `${msg}: end`);
    else if (lb.anchor === "start") assert.ok(lb.x <= n.x - n.r && b[2] === lb.x, `${msg}: start`);
    else assert.ok(b[1] >= n.y + n.r || b[3] <= n.y - n.r, `${msg}: middle زیر یا بالای گره`);
    assert.ok(L.estW(lb.t, n.fs) <= b[2] - b[0] + 0.01, `${msg}: پهنای برچسب`);
  }
  for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) assert.ok(!over(vis[i].label.box, vis[j].label.box), `${msg}: ${vis[i].name} و ${vis[j].name} روی هم`);
  for (const c of Lt.chips) for (const n of vis) assert.ok(!over([c.x, c.y, c.x + c.w, c.y + c.h], n.label.box), `${msg}: نشانِ +k روی برچسبِ ${n.name}`);
  return vis.length;
}

test("گرافِ شعاعی: مرکز وسط؛ حلقهٔ ۱ حداکثر ۱۲ به تفکیکِ رابطه، تأییدشده پیش از پیشنهادی؛ حلقهٔ ۲ درونِ بخشِ والد", () => {
  for (const [W, H] of [[568, 488], [343, 429], [900, 640]]) {
    const g = sample(15, (i) => i % 5), Lt = L.radial(g, W, H, {});
    const F = Lt.nodes.find((n) => n.ring === 0), r1 = Lt.nodes.filter((n) => n.ring === 1), r2 = Lt.nodes.filter((n) => n.ring === 2);
    assert.deepEqual([F.sid, F.x, F.y], ["F", W / 2, H / 2], `${W}: مرکز`);
    assert.equal(r1.length, 12);
    assert.equal(Lt.more1, 3);
    const chip = Lt.chips.find((c) => c.sid === "");
    assert.equal(chip.k, 3, "+۳ در گوشه ← «🔗 روابط»");
    assert.equal(L.radial(g, W, H, { total1: 20 }).more1, 8, "شمارِ کل از پروفایل");
    /* تأییدشده پیش از پیشنهادی: اگر پیشنهادی‌ای دیده می‌شود، همهٔ تأییدشده‌ها دیده می‌شوند */
    const best = (sid) => g.edges.find((e) => (e.a === "F" && e.b === sid) || (e.b === "F" && e.a === sid));
    const shown = new Set(r1.map((n) => n.sid)), conf = g.nodes.filter((n) => n.sid.startsWith("N") && best(n.sid).status === "تأییدشده");
    if (r1.some((n) => best(n.sid).status === "پیشنهادی")) for (const n of conf) assert.ok(shown.has(n.sid), `تأییدشدهٔ ${n.name} جا ماند`);
    /* به تفکیکِ رابطه: هر نوع یک تکهٔ پیوسته از دایره */
    const ring = r1.slice().sort((a, b) => a.a - b.a).map((n) => best(n.sid).nature);   /* از بالا، به ترتیبِ چیدن */
    const runs = ring.filter((k, i) => i === 0 || k !== ring[i - 1]);
    assert.equal(runs.length, new Set(runs).size, `گروه‌ها پیوسته نیستند: ${ring.join(",")}`);
    /* حلقهٔ ۲: حداکثر ۳ برای هر والد و ۲۴ روی هم؛ هر فرزند درونِ بخشِ والدش؛ مازاد با +k کنارِ والد */
    assert.ok(r2.length <= 24 && r2.length > 0);
    for (const p of r1) {
      const kids = r2.filter((c) => c.via === p.sid), all = g.edges.filter((e) => e.a === p.sid && e.b.startsWith("C")).length;
      assert.ok(kids.length <= 3);
      for (const c of kids) assert.ok(Math.abs(angle(c.a - p.a)) < Lt.step / 2, `${c.name} بیرون از بخشِ ${p.name}`);
      const more = Lt.chips.find((c) => c.sid === p.sid);
      assert.equal(more ? more.k : 0, all - kids.length, `+k کنارِ ${p.name}`);
    }
    assert.ok(checkLayout(Lt, `${W}×${H}`) >= Lt.nodes.length * 0.6, "بیشترِ برچسب‌ها دیده می‌شوند");
    assert.equal(JSON.stringify(L.radial(g, W, H, {})), JSON.stringify(Lt), "قطعی");
  }
  /* بی حلقهٔ ۲ و چند گرهِ کم */
  for (const [n1, W, H] of [[1, 343, 343], [3, 568, 352], [5, 343, 429]]) {
    const Lt = L.radial(sample(n1, () => 0), W, H, {});
    assert.equal(Lt.nodes.filter((n) => n.ring === 2).length, 0);
    assert.equal(checkLayout(Lt, `${n1}@${W}`), Lt.nodes.length, "همهٔ برچسب‌ها دیده می‌شوند");
  }
  /* تنها: فقط مرکز */
  assert.equal(L.radial({ root: "F", nodes: [{ sid: "F", name: "تنها", root: true }], edges: [], natures: NAT }, 343, 300, {}).nodes.length, 1);
});

test("رسم در svg: به اندازهٔ ظرف (هر واحد یک پیکسل)، direction=rtl صریح، قلم ≥ ۱۱ و برچسبِ پنهان با کلاسِ hide", () => {
  const svg = { attrs: {}, style: {}, html: "", parentElement: { clientWidth: 343 }, setAttribute(k, v) { this.attrs[k] = v; }, set innerHTML(v) { this.html = v; }, querySelectorAll: () => [] };
  const Lt = P.graph(svg, sample(15, (i) => i % 4), { sel: "N0" });
  assert.equal(svg.attrs.viewBox, `0 0 343 ${Lt.H}`);
  assert.deepEqual([svg.attrs.width, svg.attrs.direction, svg.style.direction], ["343", "rtl", "rtl"]);
  const sizes = [...svg.html.matchAll(/font-size="([\d.]+)"/g)].map((m) => +m[1]);
  assert.ok(sizes.length > 10 && Math.min(...sizes) >= 11, `قلم: ${Math.min(...sizes)}`);
  assert.equal((svg.html.match(/class="gl hide"/g) || []).length, Lt.nodes.filter((n) => n.label && n.label.hide).length);
  assert.match(svg.html, /class="gn r1 sel" data-gnode="N0"/);
  assert.match(svg.html, /stroke-dasharray="6 4"/, "پیشنهادی خط‌چین");
  assert.match(svg.html, /data-gmore=""/, "+k ← «🔗 روابط»");
  assert.match(svg.html, /<title>آهن‌آلات البرز — لاله‌زار<\/title>/, "نامِ کامل در title");
  assert.equal(typeof svg.onclick, "function");
  /* راهنما: رنگِ رابطه‌های موجود و رنگِ گره‌ها */
  const lg = P.legend(sample(3, () => 0));
  for (const t of ["رقابت", "همکاری", "هم‌بازار", "پیشنهادی", "سوابق", "کشف‌شده", "سامانه"]) assert.match(lg, new RegExp(t));
  assert.doesNotMatch(lg, /تبانی/, "فقط رابطه‌های همین گراف");
});

test("نمای کاملِ پشتیبانی (بی مرکز): نیرویی در قابِ ظرف با همان برچسب‌گذاری؛ گره کشو را روی «👤 پروفایل» باز می‌کند", () => {
  const g = sample(12, (i) => i % 3);
  for (const n of g.nodes) n.root = false;
  const svg = { attrs: {}, style: {}, html: "", parentElement: { clientWidth: 900 }, setAttribute(k, v) { this.attrs[k] = v; }, set innerHTML(v) { this.html = v; }, querySelectorAll: () => [] };
  const Lt = P.graph(svg, g, {});
  assert.equal(Lt.focal, null);
  assert.equal(Lt.chips.length, 0);
  assert.ok(checkLayout(Lt, "full") >= Lt.nodes.length * 0.6);
  const src = readFileSync(resolve(FRONT, "cr-admin.js"), "utf8");
  assert.match(src, /supProfile\.open\(\{ sid, name, tab: "info" \}\)/);
  assert.doesNotMatch(src, /supProfile\.open\([^)]*tab: "graph"/, "گرافِ دوم از پشتِ پرده روی همین گراف («تو در تو») نه");
});
