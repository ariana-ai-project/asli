/* ============================================================
   ارجاع و مهلت هوشمند — منطق مشترک پنل مدیر و تست‌ها

   جدا از manager.js است تا بشود بی‌مرورگر آزمودش: پنل فقط جدول و فرم را
   می‌سازد و همهٔ حسابِ توزیع و مهلت این‌جاست.

   دو محور امتیاز (هر دو از دیتابیس می‌آیند، نه حدسِ پنل از روی متن):
     guild    گروه اصناف قلم — کد گروهِ فهرست اصناف (۱۶۰۰۰۰ …)، که بک‌اند برای هر
              قلم از کد قلمش در فهرست درمی‌آورد (worker/catalog.js:guildsOfItems)
     project  پروژهٔ درخواست — نام پروژهٔ گزارش، که بک‌اند از «طرف مقابل» و
              «مرکز درخواست کننده» درمی‌آورد (worker/reports.js:projectOf)
   هر دو فهرست ثابت‌اند، پس مدیر ماتریس‌ها را یک بار پر می‌کند و با هر بارگذاری
   روزانه ستون تازه‌ای سبز نمی‌شود.

   سقف بار (تصمیم مدیر، مهر ۱۴۰۵): امتیاز ۵ یعنی «اولویت با اوست»، نه «همه به او».
   هر کارشناس دو سقف دارد — درخواست باز و قلم باز — و کسی که پر است در چیدمان
   کنار گذاشته می‌شود؛ اگر همه پر باشند، کم‌بارترین با نشانِ «بیش از سقف».
   ============================================================ */

/** سربار خودِ درخواست در «زحمت»: یک واحد، جدا از اقلامش */
export const REQ_OVERHEAD = 1;
/** سقف‌های پیش‌فرض بار باز هر کارشناس */
export const DEFAULT_LIMITS = { maxReq: 12, maxItems: 60 };
/** گروه «متفرقه»ی فهرست اصناف — قلمی که در فهرست نیست این‌جا شمرده می‌شود */
export const MISC_GUILD = "300000";
/** درخواستی که به هیچ پروژه‌ای نخورد */
export const NO_PROJECT = "(بدون پروژه)";

export const speedOf = (e) => Math.max(0.1, Number(e && e.speed) || 1);
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
export const projectKey = (p) => String(p || "").trim() || NO_PROJECT;
export const guildKey = (g) => String(g || "").trim() || MISC_GUILD;

/** امتیاز ۱..۵ و ضریب‌ها از ردیف‌های دیتابیس؛ نبودِ ردیف یعنی پیش‌فرض (۳ و ۱) */
export function tables(scores, weights) {
  const sc = new Map(), wt = new Map();
  for (const s of scores || []) sc.set(`${s.expert_id}\u0001${s.kind}\u0001${s.key}`, Number(s.score));
  for (const w of weights || []) wt.set(`${w.kind}\u0001${w.key}`, Number(w.w));
  return {
    score(eid, kind, key) { const v = sc.get(`${eid}\u0001${kind}\u0001${key}`); return Number.isFinite(v) ? v : 3; },
    weight(kind, key) { const v = wt.get(`${kind}\u0001${key}`); return Number.isFinite(v) && v > 0 ? v : 1; },
  };
}

/** زحمت یک درخواست = ضریب پروژه × (سربار درخواست + جمع ضریب گروه اصناف اقلامش) */
export function effortOf(W, project, guilds) {
  return W.weight("project", projectKey(project)) * (REQ_OVERHEAD + (guilds || []).reduce((n, g) => n + W.weight("guild", guildKey(g)), 0));
}

/** زحمت یک درخواست میانگین — مبنای تبدیل «ظرفیت n درخواست» به واحد زحمت */
export function unitEffort(load, jobEfforts) {
  let sum = 0, n = 0;
  for (const x of (load || new Map()).values()) { sum += x.effort; n += x.reqs; }
  for (const e of jobEfforts || []) { sum += e; n++; }
  return n ? sum / n : REQ_OVERHEAD + 1;
}

/** ظرفیتِ زحمتِ هر کارشناس = ظرفیت تنظیمات × زحمت یک درخواست میانگین ÷ ضریب سرعت او */
export const capOf = (e, U, capacity) => Math.max(0.5, (num(capacity, 8) || 8) * U / speedOf(e));

/** سقف‌های بار از تنظیمات ارجاع هوشمند، با پیش‌فرض‌های معقول */
export function limitsOf(A) {
  const r = Math.round(num(A && A.maxReq, DEFAULT_LIMITS.maxReq));
  const i = Math.round(num(A && A.maxItems, DEFAULT_LIMITS.maxItems));
  return { maxReq: r >= 1 ? r : DEFAULT_LIMITS.maxReq, maxItems: i >= 1 ? i : DEFAULT_LIMITS.maxItems };
}

/** بار فعلی هر کارشناس از پاسخ /workload: {effort, reqs, items} */
export function buildLoads(experts, assignments, W) {
  const L = new Map((experts || []).map((e) => [e.id, { effort: 0, reqs: 0, items: 0 }]));
  for (const g of assignments || []) {
    const x = L.get(g.expert_id); if (!x) continue;
    const n = (g.guilds || g.titles || []).length;
    x.effort += effortOf(W, g.project, g.guilds || []); x.reqs++; x.items += n;
  }
  return L;
}

/**
 * برنامهٔ ارجاع برای همهٔ درخواست‌های بی‌کارشناس با هم.
 *
 * jobs:    [{ id, project, guilds: [کد گروه], items }]
 * experts: [{ id, speed }] — فعال‌ها
 * load:    Map شناسه → {effort, reqs, items} بار فعلی (buildLoads)
 * W:       جدول امتیاز و ضریب (tables)
 * A:       فرمول ارجاع هوشمند + ظرفیت: {a, b, c, op1, op2, capacity, maxReq, maxItems}
 *
 * امتیاز کل = Σ تخصص (گروه اصناف، پروژه) − Σ جریمهٔ بار؛ جریمه با مجذورِ درصدِ اشغال رشد
 * می‌کند. چیدمان حریصانه از بزرگ‌ترین درخواست، بعد جابه‌جایی و تعویض دوتایی تا وقتی امتیاز
 * کل بهتر شود — و در همهٔ این مرحله‌ها سقف درخواست و قلمِ باز رعایت می‌شود.
 */
export function planAssign({ jobs, experts, load, W, A }) {
  const E = (experts || []).slice(), L = limitsOf(A);
  const wa = num(A && A.a, 0) / 100, wb = num(A && A.b, 0) / 100, wc = num(A && A.c, 0) / 100;
  const sb = (A && A.op1) === "−" ? -1 : 1, sc = (A && A.op2) === "+" ? 1 : -1;
  const before = new Map(E.map((e) => [e.id, (load && load.get(e.id)) || { effort: 0, reqs: 0, items: 0 }]));
  const J = (jobs || []).map((j) => ({ ...j, guilds: (j.guilds || []).map(guildKey), effort: effortOf(W, j.project, j.guilds || []) }))
    .sort((x, y) => y.effort - x.effort || String(x.id).localeCompare(String(y.id)));
  const U = unitEffort(before, J.map((j) => j.effort));
  const cap = E.map((e) => capOf(e, U, A && A.capacity));
  const loads = E.map((e) => before.get(e.id).effort);
  const reqs = E.map((e) => before.get(e.id).reqs), items = E.map((e) => before.get(e.id).items);
  const pen = (k, eff) => { const p = 100 * eff / cap[k]; return p * p / 100; };
  /* تخصص: میانگینِ وزنیِ امتیاز گروه اصناف اقلام + امتیاز پروژه */
  const fit = J.map((j) => E.map((e) => {
    let ws = 0, ss = 0;
    for (const g of j.guilds) { const w = W.weight("guild", g); ws += w; ss += w * W.score(e.id, "guild", g); }
    const gsc = ws ? ss / ws : 3;
    return wa * (gsc / 5 * 100) + sb * wb * (W.score(e.id, "project", projectKey(j.project)) / 5 * 100);
  }));
  /* سقف: یک درخواست دیگر و اقلامش جا می‌شود؟ (کارشناسِ خالی، درخواستِ بزرگ‌تر از سقف را می‌گیرد) */
  const fits = (k, j) => reqs[k] + 1 <= L.maxReq && (items[k] + j.items <= L.maxItems || items[k] === 0);
  const fill = (k, j) => Math.max((reqs[k] + 1) / L.maxReq, (items[k] + j.items) / L.maxItems);
  const at = [], over = [];
  J.forEach((j, n) => {
    let best = -1, bestV = -Infinity;
    E.forEach((e, k) => {
      if (!fits(k, j)) return;
      const v = fit[n][k] + sc * wc * (pen(k, loads[k] + j.effort) - pen(k, loads[k]));
      if (v > bestV + 1e-9 || (Math.abs(v - bestV) <= 1e-9 && best >= 0 && loads[k] / cap[k] < loads[best] / cap[best])) { best = k; bestV = v; }
    });
    /* همه پر شده‌اند: کم‌بارترین، با نشان «بیش از سقف» تا مدیر ببیند */
    if (best < 0) { E.forEach((e, k) => { if (best < 0 || fill(k, j) < fill(best, j)) best = k; }); over[n] = true; }
    at[n] = best; loads[best] += j.effort; reqs[best]++; items[best] += j.items;
  });
  const move = (n, k1, k2) => { loads[k1] -= J[n].effort; loads[k2] += J[n].effort; reqs[k1]--; reqs[k2]++; items[k1] -= J[n].items; items[k2] += J[n].items; at[n] = k2; };
  const room = (k, j) => reqs[k] + 1 <= L.maxReq && items[k] + j.items <= L.maxItems;
  for (let pass = 0; pass < 40 && E.length > 1; pass++) {
    let moved = false;
    for (let n = 0; n < J.length; n++) {
      const k1 = at[n], ef = J[n].effort;
      let bk = -1, bd = -Infinity;
      for (let k2 = 0; k2 < E.length; k2++) {
        if (k2 === k1 || !room(k2, J[n])) continue;
        const d = fit[n][k2] - fit[n][k1] + sc * wc * (pen(k1, loads[k1] - ef) - pen(k1, loads[k1]) + pen(k2, loads[k2] + ef) - pen(k2, loads[k2]));
        if (d > bd) { bk = k2; bd = d; }
      }
      /* ارجاعی که از سقفِ کارشناسش گذشته، به بهترین کارشناسی که جا دارد می‌رود حتی اگر امتیازش کمتر باشد */
      if (bk >= 0 && (bd > 1e-6 || over[n])) { move(n, k1, bk); over[n] = false; moved = true; }
    }
    if (J.length <= 400) {
      for (let n = 0; n < J.length; n++) {
        for (let m = n + 1; m < J.length; m++) {
          const k1 = at[n], k2 = at[m]; if (k1 === k2) continue;
          const e1 = J[n].effort, e2 = J[m].effort;
          /* تعویض دوتایی هم باید در سقف بماند: شمار درخواست‌ها عوض نمی‌شود، اقلام چرا */
          if (items[k1] - J[n].items + J[m].items > L.maxItems || items[k2] - J[m].items + J[n].items > L.maxItems) continue;
          const d = fit[n][k2] + fit[m][k1] - fit[n][k1] - fit[m][k2]
            + sc * wc * (pen(k1, loads[k1] - e1 + e2) - pen(k1, loads[k1]) + pen(k2, loads[k2] - e2 + e1) - pen(k2, loads[k2]));
          if (d > 1e-6) {
            loads[k1] += e2 - e1; loads[k2] += e1 - e2;
            items[k1] += J[m].items - J[n].items; items[k2] += J[n].items - J[m].items;
            at[n] = k2; at[m] = k1; moved = true;
          }
        }
      }
    }
    if (!moved) break;
  }
  const plan = J.map((j, n) => ({ job: j, id: j.id, expert: E[at[n]], effort: j.effort, items: j.items, over: !!over[n] }));
  const after = new Map(E.map((e, k) => [e.id, { effort: loads[k], reqs: reqs[k], items: items[k] }]));
  return { plan, before, after, U, limits: L, cap: new Map(E.map((e, k) => [e.id, cap[k]])),
    full: E.filter((e, k) => reqs[k] >= L.maxReq || items[k] >= L.maxItems).map((e) => e.id), over: plan.filter((p) => p.over).length };
}

/* ------------------------------------------------------------------ */
/* مهلت هوشمند                                                          */
/* ------------------------------------------------------------------ */
const OPS = { "×": (x, y) => x * y, "÷": (x, y) => x / (y || 1), "+": (x, y) => x + y, "−": (x, y) => x - y };

/** مهلت یک ارجاع: فرمول مدیر (پایه، سرعت کارشناس، ضریب پروژه، میانگینِ ضریب گروه اصناف اقلام)
    × ریشهٔ دومِ تعداد اقلام × ضریب اشغالِ کارشناس (فقط وقتی از ظرفیتش پرتر است) */
export function deadlineOf({ D, W, project, guilds, expert, loadPct }) {
  const f = (x, op, y) => (OPS[op] || OPS["×"])(x, y);
  const G = (guilds || []).map(guildKey);
  const wi = G.length ? G.reduce((n, g) => n + W.weight("guild", g), 0) / G.length : 1;
  let v = f(num(D && D.base, 1) || 1, D && D.op1, speedOf(expert) * (num(D && D.we, 1) || 1));
  v = f(v, D && D.op2, W.weight("project", projectKey(project)) * (num(D && D.wp, 1) || 1));
  v = f(v, D && D.op3, wi * (num(D && D.wi, 1) || 1));
  const size = Math.sqrt(Math.max(1, G.length)), busy = Math.max(1, (loadPct || 0) / 100);
  return { days: Math.max(1, Math.round(v * size * busy)), base: v, size, busy };
}

/** مهلت همهٔ ارجاع‌های ارسال‌نشده، با اشغالِ هر کارشناس از بار بازش */
export function planDeadlines({ list, experts, load, W, D, capacity }) {
  const U = unitEffort(load, []);
  return (list || []).map((x) => {
    const e = (experts || []).find((y) => y.id === x.expert_id); if (!e) return null;
    const cur = (load && load.get(e.id)) || { effort: 0 };
    const pct = 100 * cur.effort / capOf(e, U, capacity);
    return { ...x, expert: e, pct, items: (x.guilds || []).length, ...deadlineOf({ D, W, project: x.project, guilds: x.guilds, expert: e, loadPct: pct }) };
  }).filter(Boolean);
}
