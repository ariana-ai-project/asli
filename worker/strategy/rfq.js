/**
 * سیاست استعلام (A2) — برگردانِ procstrat/rfq.py: چند تأمین‌کننده، از چند بازار، در چند موج، با چه افشایی.
 *
 * rfqPolicy(profile) قطعی است و فقط به پروفایلِ نوع قلم (03_data/item_strategy_profiles.jsonl، از راه profile.js) و
 * واقعیت‌های زمانِ درخواست (فوریت، مقدار) بستگی دارد. selectRecipients(policy, candidates, edges) سیاست را روی گرافِ
 * تأمین‌کنندگان به فهرستِ گیرندگان تبدیل می‌کند. مدل زبانی هرگز پهنا را تعیین نمی‌کند؛ فقط متن می‌نویسد.
 * متن‌های «why» و یادداشت‌ها عیناً همان موتور مرجع‌اند (آزمونِ برابری با سیاست‌های ذخیره‌شدهٔ بسته).
 */
import * as C from "./config.js";

export const DISPERSED_HUBS = new Set(["تهران (سایر)", "نامعلوم", "", null, undefined]);
const LIMITED_MODES = new Set(["LIMITED_STAGED", "STAGED_BROADENING", "DIRECT_PLUS_MARKET_TEST"]);

/** A = درون ۹۰٪ هزینه (impact_high)؛ B = هزینهٔ واقعی ≥ ۵ میلیارد ریال یا یک درخواست ≥ ۵ میلیارد؛ C = بقیه */
export function spendTier(profile, runtime) {
  if (profile.impact_high) return "A";
  const bigRequest = (((runtime || {}).request_value_bn) || 0) >= C.TIER_B_SPEND_BN;
  return ((profile.spend_bn || 0) >= C.TIER_B_SPEND_BN || bigRequest) ? "B" : "C";
}

const has = (profile, label) => (profile.labels || []).includes(label);

/**
 * [حالت، دلیل‌ها]. ترتیب مهم است: نخستین قاعدهٔ منطبق برنده است (محافظه‌کارترین اول). پاسخ کارشناس به Q12
 * (expert_rfq با اطمینان زیاد یا متوسط) بر قاعده‌های داده برای پهنا مقدم است؛ اگر برای قلمِ کمیاب یا متمرکز استعلام
 * گسترده بخواهد، حالت از کارشناس پیروی می‌کند و هشدار می‌آید (R06).
 */
export function decideMode(profile, runtime) {
  /* افزودهٔ سامانه (نه موتور مرجع): پشتیبانی نوع قلم را به حالتِ دیگری برده است (cr_head_x، فیلد mode) — با دلیلِ خودش */
  if (profile.forced_mode && C.RFQ_MODES.includes(profile.forced_mode)) return [profile.forced_mode, [profile.forced_why || "به تصمیم پشتیبانی"]];
  const ms = profile.ms;
  const why = [];
  const tier = spendTier(profile, runtime);
  const expert = ["high", "medium"].includes(profile.expert_confidence) ? (profile.expert_rfq ?? null) : null;
  const rater = ["high", "medium"].includes(profile.rater_confidence) ? (profile.rater_rfq ?? null) : null;
  const pref = expert || rater;
  if (ms === "MS-6" || (has(profile, "L3") && (tier === "A" || tier === "B") && ms !== "MS-3")) {
    why.push("مشخصات یا شرح کار باید اول با مشورت تأمین‌کنندهٔ معتمد روشن شود (S-03، T-12، MS-6)؛ "
      + "برای ردهٔ C و کالای قیمت‌مرجع فقط روشن کردن مشخصات با درخواست‌کننده (spec_clarification)");
    return ["CONSULT_THEN_COMPETE", why];
  }
  if (String(profile.quadrant || "").startsWith("Q4") || has(profile, "L13") || pref === "DIRECT") {
    why.push("قلم راهبردی یا خرید سرمایه‌ای: مذاکرهٔ مستقیم با BATNA و استعلام آزمون بازار (S-16، S-17، T-19؛ SRC-02 ص ۲۰۹)"
      + (expert === "DIRECT" ? "؛ به نظر کارشناس" : ""));
    return ["DIRECT_PLUS_MARKET_TEST", why];
  }
  const scarce = ms === "MS-4" || has(profile, "L2");
  if (expert === "BROAD" || expert === "STANDARD") {
    if (scarce || ms === "MS-0" || profile.rfq_caution) {
      why.push("هشدار R06: داده کمیابی، تمرکز یا ابهام نشان می‌دهد ولی کارشناس استعلام گسترده خواسته است؛ "
        + "دلیل کارشناس ثبت شود");
    }
  } else {
    if (scarce || pref === "LIMITED") {
      why.push("کمیاب یا متمرکز: استعلام گسترده نیاز را فاش می‌کند و زمینهٔ هماهنگی می‌سازد؛ محدود، مرحله‌ای و "
        + "پراکنده در بازارها (گفتهٔ کاربر M2-16، M2-17، M2-44؛ S-02، T-02؛ SRC-06 ص ۱۷–۲۰؛ SRC-09 ص ۸۸)"
        + (expert === "LIMITED" ? "؛ به نظر کارشناس" : (rater === "LIMITED" && !scarce) ? "؛ به نظر ارزیاب دوم" : ""));
      return ["LIMITED_STAGED", why];
    }
    if (ms === "MS-0" || profile.rfq_caution) {
      why.push("ساختار بازار نامطمئن است: با ۳ گیرندهٔ جدا از هم شروع کن و فقط اگر نشانهٔ رقابت دیدی گسترش بده");
      return ["STAGED_BROADENING", why];
    }
  }
  if (ms === "MS-5") {
    why.push("قطعهٔ اصلی/وارداتی: چند گونه کانال، قیمت جدای اصلی و معادل، مبنای ارزی (S-11، MS-5)");
    return ["MULTICHANNEL", why];
  }
  if (ms === "MS-3") {
    why.push("کالای قیمت‌مرجع: پیشنهادهای هم‌زمان با اعتبار کوتاه و قیمت تفکیکی (S-09، T-07، MS-3)");
    return ["SIMULTANEOUS_INDEX", why];
  }
  if (has(profile, "L10") && tier === "A") {
    why.push("خرید تکراری پرهزینه: دور رقابتی دوره‌ای و قرارداد چارچوب با ۲ تا ۳ تأمین‌کننده (S-14، T-05)");
    return ["FRAMEWORK_CALLOFF", why];
  }
  if (ms === "MS-2" || expert === "STANDARD") {
    why.push(ms === "MS-2" ? "کیفیت‌متمایز: استعلام چندمعیاره درون یک سطح کیفیت (S-01، T-03، MS-2)"
      : "به نظر کارشناس: استعلام استاندارد با ۴ تا ۵ گیرنده");
    return ["STANDARD", why];
  }
  why.push("بازار رقابتی استاندارد: هر پیشنهاددهندهٔ اضافه قیمت را پایین می‌آورد تا حدود ۶ پیشنهاد "
    + "(Bulow و Klemperer ۱۹۹۶؛ Tas ۲۰۱۵؛ S-12، T-01، MS-1)");
  return ["BROAD", why];
}

/** سیاست کامل استعلام برای یک نوع قلم. runtime: {urgent, quantity_vs_typical, request_value_bn} */
export function rfqPolicy(profile, runtime) {
  runtime = runtime || {};
  const [mode, why] = decideMode(profile, runtime);
  const tier = spendTier(profile, runtime);
  let [n1, nmax] = C.RFQ_N[mode][tier];
  let baseMode = null;
  if (mode === "CONSULT_THEN_COMPETE") {
    /* رقابتِ پس از مشورت از قاعدهٔ بازارِ خود قلم پیروی می‌کند */
    const p2 = { ...profile, forced_mode: undefined, labels: (profile.labels || []).filter((l) => l !== "L3"), ms: profile.ms === "MS-6" ? "MS-2" : profile.ms };
    [baseMode] = decideMode(p2, runtime);
    if (baseMode === "CONSULT_THEN_COMPETE") baseMode = "STANDARD";
    [n1, nmax] = C.RFQ_N[baseMode][tier];
  }
  const eff = baseMode || mode;
  const l5 = has(profile, "L5");
  const collusion = ["زیاد", "متوسط"].includes(profile.coordination_risk) || has(profile, "L8") || ["high", "medium"].includes(profile.rater_collusion);
  const limited = LIMITED_MODES.has(eff);
  const scarce = profile.ms === "MS-4" || has(profile, "L2");
  const indexPriced = profile.ms === "MS-3" || has(profile, "L7");
  const specClarification = has(profile, "L3") && mode !== "CONSULT_THEN_COMPETE";

  let maxPerHub = C.MAX_PER_HUB[eff];
  if (eff === "BROAD" && l5) maxPerHub = 2;
  const w2 = C.WAVE2_AFTER_DAYS[eff] ?? null;
  const policy = {
    mode, competition_mode: eff, tier, why,
    n_wave1: n1, n_max: nmax,
    consult_first: mode === "CONSULT_THEN_COMPETE", consult_n: mode === "CONSULT_THEN_COMPETE" ? [...C.CONSULT_N] : null,
    waves: limited ? 2 : 1,
    wave2_after_days: w2,
    wave2_trigger: eff === "LIMITED_STAGED" ? "کمتر از ۲ پیشنهاد معتبر، یا پیشنهادها یکسان یا بالاتر از حد"
      : eff === "STAGED_BROADENING" ? "دست‌کم ۳ پیشنهاد معتبر با پراکندگی ≥ ۵٪ و بی پیشنهاد یکسان"
        : eff === "DIRECT_PLUS_MARKET_TEST" ? "آزمون بازار هیچ پیشنهاد معتبری نداد، یا پیشنهاد تأمین‌کنندهٔ اصلی بالاتر از حد ماند" : null,
    distribution: {
      max_per_hub: maxPerHub,
      max_share_one_hub: maxPerHub == null ? 0.5 : null,
      min_markets: C.MIN_MARKETS[eff],
      need_outsider: !!(l5 || limited),
      blocking_edges: [...((limited || l5 || collusion) ? C.BLOCKING_EDGES_STRICT : C.BLOCKING_EDGES_SAME_BUSINESS)],
      max_incumbents: C.MAX_INCUMBENTS[eff],
      min_new_suppliers: 1,
      role_mix: eff === "MULTICHANNEL" ? "دست‌کم یک نماینده/واردکننده و دو واردکنندهٔ مستقل یا فروشنده؛ برای ردهٔ A یک بازار خارجی"
        : eff === "SIMULTANEOUS_INDEX" ? "دست‌کم یک تولیدکننده یا عرضه‌کنندهٔ متصل به کارخانه/بورس" : null,
    },
    timing: (limited && indexPriced)
      ? `گیرندگان محدود ولی همه در یک روز و با ساعت اعتبار یکسان (قیمت پایه روزانه عوض می‌شود)؛ موج دوم پس از ${C.WAVE2_AFTER_DAYS[eff] ?? 2} روز`
      : limited ? `ارسال پخش در زمان: حداکثر ${C.MAX_SENDS_PER_DAY_LIMITED} گیرنده در روز، موج دوم پس از ${C.WAVE2_AFTER_DAYS[eff] ?? 2} روز`
        : eff === "SIMULTANEOUS_INDEX" ? "همه در یک روز با ساعت اعتبار یکسان" : "ارسال هم‌زمان با ضرب‌الاجل یکسان",
    disclosure: {
      quantity: limited ? "بازهٔ متعارف در موج اول؛ مقدار کامل فقط به نامزدهای نهایی" : "مقدار کامل",
      urgency: (scarce || limited || has(profile, "L12")) ? "هرگز" : "فقط تاریخ تحویل لازم، بی واژهٔ فوری",
      project_name: (scarce || limited) ? "نه" : "در صورت لزوم",
      budget_or_reference_price: "هرگز",
      other_bidders: "هرگز نام یا شمار",
      text_variation: !!limited,
    },
    spec_clarification: specClarification ? ["پیش از ارسال، مشخصات را با درخواست‌کننده روشن کن (لایه‌های ویژگی قلم ناقص است)",
      "در استعلام بخواه برند، رده و مشخصات دقیق کالای پیشنهادی نوشته شود"] : [],
    quote_must_include: quoteFields(profile, eff),
    anti_collusion: collusion,
    anti_collusion_steps: collusion ? ["گیرندگان را دوره به دوره بچرخان؛ همیشه همان گروه نه", "زمان و اندازهٔ استعلام قابل پیش‌بینی نباشد",
      "قیمت مرجع و هدف اعلام نشود", "همهٔ پیشنهادها، حتی بازنده، با زمان ثبت شود (T-15)",
      "افشای ارتباط با پیشنهاددهندگان دیگر خواسته شود"] : [],
    runtime: {},
    kb_cards: cards(profile, eff, mode),
  };
  if (runtime.urgent) {
    policy.runtime.urgent = (scarce || has(profile, "L12")) ? "فقط از فهرست پیش‌تأییدشده (T-17)؛ فوریت گفته نشود؛ سقف گرانی را کارشناس از پیش تعیین کند (S-10)"
      : "مهلت کوتاه ولی برابر برای همه؛ فوریت گفته نشود";
  }
  if ((runtime.quantity_vs_typical ?? 1) >= 3 && limited) policy.runtime.large_quantity = "مقدار را بخش‌بخش استعلام کن؛ کل مقدار نشانهٔ نیاز بزرگ است";
  return policy;
}

function quoteFields(profile, eff) {
  const f = ["قیمت واحد و مبنای قیمت (درب انبار یا تحویل در کارگاه)", "شرایط پرداخت پیشنهادی و قیمت نقد در برابر مدت‌دار",
    "زمان تحویل", "مدت اعتبار قیمت", "با یا بی صورتحساب رسمی و مالیات بر ارزش افزوده"];
  if (eff === "MULTICHANNEL" || has(profile, "L11")) f.push("ارز و نرخ مبنا", "اصلی یا معادل، با شمارهٔ فنی و برند", "کشور سازنده");
  if (eff === "SIMULTANEOUS_INDEX" || has(profile, "L7")) f.push("قیمت تفکیکی: پایه، حاشیه، حمل، برش/خدمات", "ارجاع به قیمت کارخانه یا بورس در صورت وجود");
  if (profile.ms === "MS-2" || has(profile, "L1")) f.push("برند، رده یا استاندارد", "نمونه یا گواهی در صورت لزوم");
  if (profile.ms === "MS-6") f.push("قیمت بر پایهٔ شرح کار، یا عیب‌یابی سپس برآورد", "ضمانت کار");
  if (has(profile, "L6")) f.push("پذیرش شرط تحویل و پرداخت قلم (بازرسی یا تأیید مکانیک پیش از پرداخت)");
  return f;
}

const uniq = (a) => [...new Set(a)];
function cards(profile, eff, mode) {
  const byMode = { BROAD: ["T-01", "S-12"], STANDARD: ["T-03", "S-01"], SIMULTANEOUS_INDEX: ["T-01", "T-07", "S-09"],
    MULTICHANNEL: ["T-03", "S-11"], LIMITED_STAGED: ["T-02", "S-02", "S-05"],
    CONSULT_THEN_COMPETE: ["T-12", "S-03"], DIRECT_PLUS_MARKET_TEST: ["T-19", "S-16", "S-17"],
    FRAMEWORK_CALLOFF: ["T-05", "S-14"], STAGED_BROADENING: ["T-02", "T-01"] };
  let out = uniq([...(byMode[mode] || []), ...(byMode[eff] || [])]);
  if (has(profile, "L8") || ["high", "medium"].includes(profile.rater_collusion)) out.push("T-14", "T-15", "S-08");
  if (has(profile, "L5")) out.push("S-05");
  return uniq(out);
}

/* ------------------------------------------------------------------ */
/* گزینشِ گیرندگان روی گرافِ تأمین‌کنندگان                              */
/* ------------------------------------------------------------------ */
export function buildAdjacency(edges, blockingTypes) {
  const adj = new Map();
  const add = (a, b) => { if (!adj.has(a)) adj.set(a, new Set()); adj.get(a).add(b); };
  for (const e of edges || []) {
    const t = e.type || "";
    if (blockingTypes.some((b) => t.startsWith(b))) { add(e.from_id, e.to_id); add(e.to_id, e.from_id); }
  }
  return adj;
}

/* بازار برای سقفِ هر بازار: پاساژ یا راستهٔ نام‌دار، یا برای فروشگاهِ پراکنده و مکانِ نامعلوم یک «ریزبازار» جدا */
const marketName = (c) => (DISPERSED_HUBS.has(c.hub) ? "dispersed" : c.hub);
const marketKey = (c) => (DISPERSED_HUBS.has(c.hub) ? `dispersed|${c.id}` : `hub|${c.hub}`);
/** مکانِ شناخته‌شده برای شمردنِ بازارها؛ null یعنی نامعلوم */
function locationKey(c) {
  const h = c.hub;
  if (h == null || h === "" || h === "نامعلوم") return null;
  if (DISPERSED_HUBS.has(h)) return `scattered|${c.id}`;
  return `hub|${h}`;
}
const ver = (c) => Math.trunc(Number(c.verification || 0));
const prio = (c) => (c.priority == null ? 1e9 : c.priority);
const cmpTuple = (a, b) => { for (let i = 0; i < a.length; i++) { if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; } return 0; };
const isInc = (c) => !!c.is_incumbent;

/**
 * گزینشِ حریصانه و پراکندهٔ گیرندگانِ موج اول، با فهرستِ ذخیرهٔ مرتب.
 *
 * candidates: {id, name, is_incumbent, priority (کمتر = بهتر), hub, role, verification (۲ همهٔ دروازه‌ها یا تأمین‌کنندهٔ فعلی،
 *   ۱ هویت قابل احراز، ۰ هنوز نه), trusted}
 * edges: {from_id, to_id, type}
 * recentlyAsked: Set شناسهٔ گیرندگانِ استعلامِ قبلیِ همین نوع قلم؛ غیرفعلی‌هایشان به ته صف می‌روند (چرخش؛ T-14، S-08).
 */
export function selectRecipients(policy, candidates, edges, recentlyAsked) {
  const dist = policy.distribution;
  const n1 = policy.n_wave1, nmax = policy.n_max;
  const limited = LIMITED_MODES.has(policy.competition_mode);
  const asked = recentlyAsked instanceof Set ? recentlyAsked : new Set(recentlyAsked || []);

  const sortKey = (c) => [(isInc(c) && c.trusted) ? 0 : 1, (!isInc(c) && asked.has(c.id)) ? 1 : 0, -ver(c), prio(c)];
  const cands = [...candidates].map((c, i) => [sortKey(c), i, c]).sort((x, y) => cmpTuple(x[0], y[0]) || x[1] - y[1]).map((x) => x[2]);
  const nNewAvail = candidates.filter((c) => !isInc(c)).length;
  let maxInc = dist.max_incumbents;
  const minNew = dist.min_new_suppliers ?? 1;
  if (nNewAvail >= minNew) maxInc = Math.min(maxInc, Math.max(0, n1 - minNew));
  /* بازارِ غالب: پرشمارترین بازارِ نام‌دار میان تازه‌ها (هم‌شمارها به ترتیبِ نخستین دیدن، مثل Counter.most_common) */
  const counts = new Map();
  for (const c of candidates) if (!isInc(c)) { const m = marketName(c); counts.set(m, (counts.get(m) || 0) + 1); }
  const ordered = [...counts.entries()].map((e, i) => [e, i]).sort((a, b) => b[0][1] - a[0][1] || a[1] - b[1]).map((x) => x[0][0]);
  const dominantHub = ordered.find((h) => h !== "dispersed") ?? null;

  const baseCap = dist.max_per_hub != null ? dist.max_per_hub : Math.max(1, Math.ceil(n1 / 2));

  const runOnce = (blockTypes, cap, minVerification) => {
    const adj = buildAdjacency(edges, blockTypes);
    const chosen = [], perHub = new Map();
    let inc = 0;
    for (const c of cands) {
      if (chosen.length >= n1) break;
      const ci = isInc(c);
      if (!ci && ver(c) < minVerification) continue;
      if (ci && inc >= maxInc) continue;
      const m = marketKey(c);
      if (!ci && (perHub.get(m) || 0) >= cap) continue;
      const nb = adj.get(c.id);
      if (nb && chosen.some((o) => nb.has(o.id))) continue;
      chosen.push(c);
      perHub.set(m, (perHub.get(m) || 0) + 1);
      inc += ci ? 1 : 0;
    }
    return [chosen, adj];
  };

  const relax = [];
  const attempts = [[dist.blocking_edges, baseCap, 1, null],
    [dist.blocking_edges, baseCap, 0, "نامزد با هویت هنوز احرازنشده هم مجاز شد؛ پیش از ارسال هویت و تماس بررسی شود (T-17)"],
    [C.BLOCKING_EDGES_SAME_BUSINESS, baseCap, 0, "هم‌پاساژها مجاز شدند؛ فقط یک کسب‌وکار دوبار شمرده نمی‌شود"],
    [C.BLOCKING_EDGES_SAME_BUSINESS, baseCap + 1, 0, "سقف هر بازار یکی بالا رفت"]];
  let chosen = [], adj = new Map();
  for (const [bt, mph, minv, note] of attempts) {
    [chosen, adj] = runOnce(bt, mph, minv);
    if (note) relax.push(note);
    if (chosen.length >= Math.min(n1, candidates.length)) break;
  }

  const notes = [];
  const linked = (c, list) => { const nb = adj.get(c.id); return !!nb && list.some((o) => nb.has(o.id)); };
  /* گیرندهٔ بیرونی: دست‌کم یک تازه بیرون از بازارِ غالب (بازار یا شهر دیگر) */
  if (dist.need_outsider && dominantHub && chosen.length && chosen.filter((c) => !isInc(c)).every((c) => marketName(c) === dominantHub)) {
    const outs = cands.filter((c) => !chosen.includes(c) && marketName(c) !== dominantHub && !isInc(c) && !linked(c, chosen));
    const drop = [...chosen].reverse().find((c) => !isInc(c)) || null;
    if (outs.length && drop) {
      chosen[chosen.indexOf(drop)] = outs[0];
      notes.push("یک گیرنده با نامزدی بیرون از بازار غالب جایگزین شد");
    } else if (!outs.length) notes.push("نامزدی بیرون از بازار غالب نبود؛ کارشناس یک تأمین‌کننده از شهر یا بازار دیگر بیفزاید");
  }

  const known = new Set(chosen.map(locationKey).filter((k) => k != null));
  const unknown = chosen.filter((c) => locationKey(c) == null).length;
  const markets = known.size;
  if (markets + unknown < dist.min_markets || (markets < dist.min_markets && unknown === 0)) {
    notes.push(`فقط ${markets} بازار شناخته‌شده؛ حداقل ${dist.min_markets} لازم است — کارشناس بازار دیگری بیفزاید`);
  } else if (markets < dist.min_markets) {
    notes.push(`مکان ${unknown} گیرنده نامعلوم است؛ کارشناس بررسی کند که همه در یک بازار نباشند`);
  }
  if (limited && chosen.some((c) => ver(c) < 2 && !isInc(c))) notes.push("پیش از ارسال: تماس و فعالیت اخیر گیرندگان تازه تأیید شود (دروازه‌های G3 و G6)");

  const chosenIds = new Set(chosen.map((c) => c.id));
  const used = new Set(chosen.map(marketKey));
  let reserve = cands.filter((c) => !chosenIds.has(c.id));
  if (limited) {
    /* موج دوم: اول بازارهای استفاده‌نشده و نامزدهای بی‌یال با موج اول */
    const rk = (c) => { const nb = adj.get(c.id); return [used.has(marketKey(c)) ? 1 : 0, (nb && [...chosenIds].some((o) => nb.has(o))) ? 1 : 0, -ver(c), prio(c)]; };
    reserve = reserve.map((c, i) => [rk(c), i, c]).sort((x, y) => cmpTuple(x[0], y[0]) || x[1] - y[1]).map((x) => x[2]);
  }
  reserve = reserve.slice(0, Math.max(0, nmax - chosen.length) + 3);
  return { wave1: chosen.map((c) => c.id), reserve: reserve.map((c) => c.id), relaxations: relax,
    markets_known: markets, unknown_location: unknown, dominant_hub: dominantHub,
    incumbents_in_wave1: chosen.filter(isInc).length, notes };
}
