/* ============================================================
   موتور راهبرد خرید (worker/strategy) — برگردانِ ۷۳ آزمونِ موتور مرجع procstrat (06_reference_impl/tests)
   هر آزمون همان نامِ پایتونی را دارد تا با بسته جفت شود. معیار E1 بستهٔ «درخواست تغییر ۰۲».
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import * as C from "../../../worker/strategy/config.js";
import { spendTier, decideMode, rfqPolicy, selectRecipients } from "../../../worker/strategy/rfq.js";
import * as P from "../../../worker/strategy/pricing.js";
import * as N from "../../../worker/strategy/negotiation.js";
import * as D from "../../../worker/strategy/detectors.js";
import * as Q from "../../../worker/strategy/questionnaire.js";
import { validateTurn } from "../../../worker/strategy/validator.js";
import { engineProfile } from "../../../worker/strategy/profile.js";

const close = (a, b, msg, places = 7) => assert.ok(Math.abs(a - b) < 0.5 * 10 ** -places, `${msg || ""} ${a} ≉ ${b}`);
const prof = (kw = {}) => ({ ms: "MS-1", labels: [], quadrant: "Q1", impact_high: false, spend_bn: 1.0, ...kw });

/* ---------------- test_rfq.py: DecideModeTest ---------------- */
const check = (expected, kw) => {
  const [mode, why] = decideMode(prof(kw));
  assert.equal(mode, expected, JSON.stringify(kw));
  assert.ok(why.length && why.every((w) => typeof w === "string" && w));
};
test("rfq.DecideModeTest.test_precedence", () => {
  check("CONSULT_THEN_COMPETE", { ms: "MS-6" });
  check("CONSULT_THEN_COMPETE", { labels: ["L3", "L2"], impact_high: true });
  check("LIMITED_STAGED", { labels: ["L3", "L2"] });
  check("SIMULTANEOUS_INDEX", { labels: ["L3"], ms: "MS-3", impact_high: true });
  check("DIRECT_PLUS_MARKET_TEST", { quadrant: "Q4 مزیت مشترک", ms: "MS-4" });
  check("DIRECT_PLUS_MARKET_TEST", { labels: ["L13"] });
  check("LIMITED_STAGED", { ms: "MS-4" });
  check("LIMITED_STAGED", { labels: ["L2"], ms: "MS-1" });
  check("LIMITED_STAGED", { rater_rfq: "LIMITED", rater_confidence: "medium" });
  check("BROAD", { rater_rfq: "LIMITED", rater_confidence: "low" });
  check("STAGED_BROADENING", { ms: "MS-0" });
  check("STANDARD", { class_disputed: true, ms: "MS-2" });
  check("LIMITED_STAGED", { expert_rfq: "LIMITED", expert_confidence: "high" });
  check("BROAD", { expert_rfq: "BROAD", expert_confidence: "high", rater_rfq: "LIMITED", rater_confidence: "high" });
  check("DIRECT_PLUS_MARKET_TEST", { expert_rfq: "DIRECT", expert_confidence: "medium" });
  check("BROAD", { ms: "MS-4", expert_rfq: "BROAD", expert_confidence: "high" });
  check("STANDARD", { ms: "MS-1", expert_rfq: "STANDARD", expert_confidence: "high" });
  check("LIMITED_STAGED", { ms: "MS-4", expert_rfq: "BROAD", expert_confidence: "low" });
  check("STAGED_BROADENING", { rfq_caution: true, ms: "MS-2" });
  check("MULTICHANNEL", { ms: "MS-5" });
  check("SIMULTANEOUS_INDEX", { ms: "MS-3" });
  check("FRAMEWORK_CALLOFF", { labels: ["L10"], impact_high: true });
  check("BROAD", { labels: ["L10"], impact_high: false });
  check("STANDARD", { ms: "MS-2" });
  check("BROAD", { ms: "MS-1" });
});
test("rfq.DecideModeTest.test_expert_broad_on_scarce_warns", () => {
  const [, why] = decideMode(prof({ ms: "MS-4", expert_rfq: "BROAD", expert_confidence: "high" }));
  assert.ok(why.some((w) => w.includes("R06")));
});
test("rfq.DecideModeTest.test_l5_alone_does_not_limit_breadth", () => check("BROAD", { labels: ["L5"] }));
test("rfq.DecideModeTest.test_spend_tier", () => {
  assert.equal(spendTier(prof({ impact_high: true, spend_bn: 0.1 })), "A");
  assert.equal(spendTier(prof({ spend_bn: 5 })), "B");
  assert.equal(spendTier(prof({ spend_bn: 4.99 })), "C");
  assert.equal(spendTier(prof({ spend_bn: 0.1 }), { request_value_bn: 6 }), "B");
});

/* ---------------- test_rfq.py: PolicyTest ---------------- */
test("rfq.PolicyTest.test_limited_policy", () => {
  const p = rfqPolicy(prof({ ms: "MS-4", impact_high: true }), { urgent: true, quantity_vs_typical: 4 });
  assert.deepEqual([p.n_wave1, p.n_max], C.RFQ_N.LIMITED_STAGED.A);
  assert.equal(p.waves, 2);
  assert.equal(p.distribution.max_per_hub, 1);
  assert.ok(p.distribution.need_outsider);
  assert.ok(p.distribution.blocking_edges.includes("هم‌پاساژ"));
  assert.equal(p.disclosure.urgency, "هرگز");
  assert.equal(p.disclosure.budget_or_reference_price, "هرگز");
  assert.ok("urgent" in p.runtime);
  assert.ok("large_quantity" in p.runtime);
  assert.ok(p.disclosure.text_variation);
});
test("rfq.PolicyTest.test_broad_policy_and_l5", () => {
  const p = rfqPolicy(prof());
  assert.equal(p.mode, "BROAD");
  assert.equal(p.distribution.max_per_hub, null);
  assert.equal(p.distribution.max_share_one_hub, 0.5);
  assert.ok(!p.distribution.blocking_edges.includes("هم‌پاساژ"));
  const p5 = rfqPolicy(prof({ labels: ["L5"] }));
  assert.equal(p5.distribution.max_per_hub, 2);
  assert.ok(p5.distribution.need_outsider);
  assert.ok(p5.distribution.blocking_edges.includes("هم‌پاساژ"));
});
test("rfq.PolicyTest.test_consult_then_compete_inherits_competition", () => {
  const p = rfqPolicy(prof({ ms: "MS-6", impact_high: true }));
  assert.ok(p.consult_first);
  assert.deepEqual(p.consult_n, [...C.CONSULT_N]);
  assert.equal(p.competition_mode, "STANDARD");
  const p2 = rfqPolicy(prof({ ms: "MS-4", labels: ["L3"], spend_bn: 10 }));
  assert.equal(p2.competition_mode, "LIMITED_STAGED");
});
test("rfq.PolicyTest.test_spec_clarification_and_index_timing", () => {
  const p = rfqPolicy(prof({ labels: ["L3"] }));
  assert.notEqual(p.mode, "CONSULT_THEN_COMPETE");
  assert.ok(p.spec_clarification.length);
  const q = rfqPolicy(prof({ ms: "MS-3", labels: ["L7"], rater_rfq: "LIMITED", rater_confidence: "medium", impact_high: true }));
  assert.equal(q.mode, "LIMITED_STAGED");
  assert.ok(q.timing.includes("یک روز"));
});
test("rfq.PolicyTest.test_collusion_policy", () => {
  const p = rfqPolicy(prof({ labels: ["L8"], coordination_risk: "متوسط" }));
  assert.ok(p.anti_collusion);
  assert.ok(p.anti_collusion_steps.length);
  assert.ok(p.kb_cards.includes("T-14"));
});
test("rfq.PolicyTest.test_quote_fields", () => {
  const f = rfqPolicy(prof({ ms: "MS-5", labels: ["L11"] })).quote_must_include;
  assert.ok(f.some((x) => x.includes("اصلی یا معادل")));
  const f3 = rfqPolicy(prof({ ms: "MS-3", labels: ["L7"] })).quote_must_include;
  assert.ok(f3.some((x) => x.includes("قیمت تفکیکی")));
});

/* ---------------- test_rfq.py: SelectRecipientsTest ---------------- */
const cand = (i, hub, { inc = false, ver = 1, pr = null, trusted = false } = {}) => ({ id: i, name: i, hub, is_incumbent: inc, verification: ver,
  priority: pr != null ? pr : parseInt(i.slice(1), 10), trusted });
const POOL = () => [cand("s1", "بازار آهن شادآباد"), cand("s2", "بازار آهن شادآباد"), cand("s3", "بازار آهن شادآباد"),
  cand("s4", "شهر: اصفهان"), cand("s5", "خیابان قزوین"), cand("s6", "تهران (سایر)"),
  cand("s7", "تهران (سایر)"), cand("i1", null, { inc: true, ver: 2, pr: 0, trusted: true }),
  cand("i2", null, { inc: true, ver: 2, pr: 1 })];
const EDGES = [{ from_id: "s4", to_id: "s5", type: "مدیر هم‌نام" }, { from_id: "s1", to_id: "s2", type: "هم‌پاساژ (هم‌مکانی؛ امکان خبررسانی)" }];
test("rfq.SelectRecipientsTest.test_limited_one_per_hub_and_blocking", () => {
  const pool = POOL();
  const pol = rfqPolicy(prof({ ms: "MS-4", impact_high: true }));
  const r = selectRecipients(pol, pool, EDGES);
  const w = r.wave1;
  assert.equal(w.length, pol.n_wave1);
  assert.equal(r.incumbents_in_wave1, 1);
  assert.equal(w[0], "i1");
  const hubs = w.map((x) => pool.find((c) => c.id === x).hub);
  const named = hubs.filter((h) => h && h !== "تهران (سایر)");
  assert.equal(named.length, new Set(named).size);
  assert.ok(!(w.includes("s4") && w.includes("s5")));
  assert.ok(r.reserve.every((x) => !w.includes(x)));
});
test("rfq.SelectRecipientsTest.test_broad_half_cap", () => {
  const pool = [...Array.from({ length: 8 }, (_, k) => cand(`s${k + 1}`, "بازار آهن شادآباد")), cand("s20", "شهر: کرج"), cand("s21", "تهران (سایر)"),
    cand("s22", "شهر: قم"), cand("s23", "شهر: اصفهان")];
  const pol = rfqPolicy(prof({ impact_high: true }));
  const r = selectRecipients(pol, pool, []);
  const nDom = r.wave1.filter((x) => pool.find((c) => c.id === x).hub === "بازار آهن شادآباد").length;
  assert.equal(r.wave1.length, pol.n_wave1);
  assert.ok(nDom <= Math.ceil(pol.n_wave1 / 2));
  assert.deepEqual(r.relaxations, []);
});
test("rfq.SelectRecipientsTest.test_min_new_supplier", () => {
  const pol = rfqPolicy(prof({ labels: ["L13"] }));
  const pool = [cand("i1", null, { inc: true, ver: 2, pr: 0, trusted: true }), cand("i2", null, { inc: true, ver: 2, pr: 1 }), cand("s1", "شهر: قم")];
  assert.ok(selectRecipients(pol, pool, []).wave1.includes("s1"));
});
test("rfq.SelectRecipientsTest.test_relaxation_reported", () => {
  const pol = rfqPolicy(prof({ ms: "MS-4", impact_high: true }));
  const pool = [cand("s1", "بازار آهن شادآباد", { ver: 0 }), cand("s2", "بازار آهن شادآباد", { ver: 0 })];
  const r = selectRecipients(pol, pool, [{ from_id: "s1", to_id: "s2", type: "هم‌پاساژ" }]);
  assert.ok(r.relaxations.length);
  assert.ok(r.notes.length);
});
test("rfq.SelectRecipientsTest.test_broad_relaxation_raises_half_cap_by_one", () => {
  const pol = rfqPolicy(prof({ impact_high: true }));
  const pool = Array.from({ length: 8 }, (_, k) => cand(`s${k + 1}`, "بازار آهن شادآباد"));
  const r = selectRecipients(pol, pool, []);
  assert.equal(r.wave1.length, 4);
  assert.ok(r.relaxations.includes("سقف هر بازار یکی بالا رفت"));
});
test("rfq.SelectRecipientsTest.test_direct_has_wave2_rule", () => {
  const p = rfqPolicy(prof({ labels: ["L13"] }));
  assert.equal(p.waves, 2);
  assert.notEqual(p.wave2_after_days, null);
  assert.notEqual(p.wave2_trigger, null);
});
test("rfq.SelectRecipientsTest.test_rotation", () => {
  const pol = rfqPolicy(prof());
  const pool = Array.from({ length: 11 }, (_, k) => cand(`s${k + 1}`, `شهر: c${k + 1}`));
  const r = selectRecipients(pol, pool, [], new Set(["s1", "s2"]));
  assert.ok(!r.wave1.includes("s1"));
  assert.ok(!r.wave1.includes("s2"));
});
test("rfq.SelectRecipientsTest.test_outsider", () => {
  const pol = rfqPolicy(prof({ labels: ["L5"] }));
  const pool = [...Array.from({ length: 6 }, (_, k) => cand(`s${k + 1}`, "لاله‌زار و سعدی")), cand("s9", "شهر: تبریز", { pr: 99 })];
  assert.ok(selectRecipients(pol, pool, []).wave1.includes("s9"));
});

/* ---------------- test_pricing.py ---------------- */
const S = { vat_rate: 0.10, vat_creditable: false, panel_rate: 0.05, fx_growth: 0.03, basis: "max", no_invoice_premium: 0.02 };
const ep = (o = {}) => P.effectivePrice({ price: 100.0, qty: 1, has_official_invoice: true, vat_included: true, ...o }, {}, S);
test("pricing.EffectivePriceTest.test_cash_with_invoice_vat_included", () => { const r = ep(); close(r.effective_price, 100.0); assert.equal(r.monthly_rate, 0.05); });
test("pricing.EffectivePriceTest.test_vat_not_included_not_creditable", () => close(ep({ vat_included: false }).effective_price, 110.0));
test("pricing.EffectivePriceTest.test_vat_creditable_removed", () => {
  close(P.effectivePrice({ price: 110.0, has_official_invoice: true, vat_included: true }, {}, { ...S, vat_creditable: true }).effective_price, 100.0);
});
test("pricing.EffectivePriceTest.test_no_invoice_premium", () => close(ep({ has_official_invoice: false }).effective_price, 102.0));
test("pricing.EffectivePriceTest.test_later_payment_is_cheaper_today", () => close(ep({ pay_months: 2 }).effective_price, 100 / 1.05 ** 2));
test("pricing.EffectivePriceTest.test_prepayment_costs", () => close(ep({ prepay_share: 0.5 }).effective_price, 50 * 1.05 + 50));
test("pricing.EffectivePriceTest.test_condition_delay_logistics_quality", () => {
  const item = { needed_by_days: 10, delay_cost_per_day: 1.0, condition_risk: { p: 0.2, cost_share: 0.5 } };
  const offer = { price: 100.0, has_official_invoice: true, vat_included: true, condition_ok: false, delivery_days: 13, logistics_cost: 4.0, quality_coef: 0.9 };
  const r = P.effectivePrice(offer, item, S);
  close(r.effective_price, ((100 + 100 * 0.2 * 0.5) + 3 * 1.0 + 4.0) / 0.9);
  assert.ok(r.steps.length >= 5);
});
test("pricing.EffectivePriceTest.test_unit_price_and_inverse", () => {
  const item = { needed_by_days: 10, delay_cost_per_day: 1.0, condition_risk: { p: 0.2, cost_share: 0.5 } };
  const terms = { qty: 10, has_official_invoice: true, vat_included: false, pay_months: 2, condition_ok: false, delivery_days: 12, logistics_cost: 3.0, quality_coef: 0.95 };
  const r = P.effectivePrice({ ...terms, price: 100.0 }, item, S);
  close(r.effective_unit_price, r.effective_price / 10);
  close(P.nominalForEffective(r.effective_unit_price, terms, item, S), 100.0);
});
test("pricing.EffectivePriceTest.test_settings_for_item_rate", () => {
  assert.equal(P.settingsFor({ monthly_rate: 0.07 }, { panel_rate: 0.05 }).panel_rate, 0.07);
  assert.equal(P.settingsFor({}, { panel_rate: 0.05 }).panel_rate, 0.05);
});
test("pricing.EffectivePriceTest.test_discount_basis", () => {
  assert.equal(P.monthlyDiscountRate(0.05, 0.03, "panel"), 0.05);
  assert.equal(P.monthlyDiscountRate(0.05, 0.03, "fx"), 0.03);
  assert.equal(P.monthlyDiscountRate(0.02, 0.04, "max"), 0.04);
  assert.equal(P.monthlyDiscountRate(null, null, "max"), 0.0);
});
test("pricing.DependenceTest.test_params", () => {
  const d = P.dependenceParams({ labels: ["L4"], ms: "MS-1" });
  assert.ok(d.active);
  assert.equal(d.kind, "self_made");
  assert.equal(d.cap, C.DEP_CAP.self_made);
  close(d.max_premium, C.PI_BASE.self_made);
  const d2 = P.dependenceParams({ labels: ["L4", "L12", "L2"], ms: "MS-4", impact_high: true, supply_power: "زیاد" });
  assert.equal(d2.kind, "structural");
  close(d2.max_premium, C.PI_MAX);
  assert.ok(!P.dependenceParams({ labels: [], ms: "MS-1" }).active);
  const e = P.dependenceParams({ labels: [], ms: "MS-1", pi_override: 0.05 });
  assert.ok(e.active);
  close(e.max_premium, 0.05);
  assert.equal(e.premium_source, "کارشناس (Q11)");
});
test("pricing.DependenceTest.test_penalty_shape", () => {
  close(P.dependenceAdjusted(100, 0.6, 0.6, 0.05), 100);
  close(P.dependenceAdjusted(100, 1.0, 0.6, 0.05), 105);
  close(P.dependenceAdjusted(100, 0.8, 0.6, 0.05), 102.5);
});
test("pricing.DependenceTest.test_choice_flips_only_when_gap_is_small", () => {
  const dep = { active: true, cap: 0.6, max_premium: 0.05 };
  const shares = { A: 1.0, B: 0.0 };
  const small = [{ supplier_id: "A", effective_price: 100.0 }, { supplier_id: "B", effective_price: 103.0 }];
  const r = P.rankOffers(small, shares, dep);
  assert.equal(r[0].supplier_id, "B");
  assert.ok("note" in r[0]);
  const big = [{ supplier_id: "A", effective_price: 100.0 }, { supplier_id: "B", effective_price: 108.0 }];
  assert.equal(P.rankOffers(big, shares, dep)[0].supplier_id, "A");
  assert.equal(P.rankOffers(small, shares, { active: false })[0].supplier_id, "A");
});
test("pricing.DependenceTest.test_split_award", () => {
  const q = P.splitAward(500, 0.5, 1000, 0.6);
  close(q, 0.6 * 1500 - 500);
  assert.ok((0.5 * 1000 + q) / 1500 <= 0.6 + 1e-9);
  assert.equal(P.splitAward(100, 0.9, 1000, 0.6), 0.0);
});

/* ---------------- test_negotiation.py ---------------- */
test("negotiation.PlanTest.test_targets_and_limits", () => {
  const p = N.planNegotiation({ ms: "MS-1" }, 100.0, [104.0, 110.0]);
  assert.equal(p.status, "OK");
  close(p.target, 95.0);
  close(p.reservation, 103.0);
  assert.equal(p.rounds, C.ROUNDS["MS-1"]);
  assert.equal(p.disclose.reservation, false);
});
test("negotiation.PlanTest.test_reservation_never_above_best_alternative", () => {
  const p = N.planNegotiation({ ms: "MS-4" }, 100.0, [101.0]);
  close(p.reservation, 101.0);
  assert.ok(p.target <= 101.0);
});
test("negotiation.PlanTest.test_target_never_above_existing_offer", () => close(N.planNegotiation({ ms: "MS-1" }, 100.0, [90.0]).target, 90.0));
test("negotiation.PlanTest.test_scarce_is_boulware", () => assert.equal(N.planNegotiation({ ms: "MS-1", labels: ["L2"] }, 100.0, []).c, C.CONCESSION_C_SCARCE));
test("negotiation.PlanTest.test_urgent_and_expert_rv", () => {
  const p = N.planNegotiation({ ms: "MS-1" }, 100.0, [], true);
  close(p.reservation, 100 * (1 + C.RV_TOL["MS-1"] + C.URGENT_RV_EXTRA));
  assert.ok(p.urgent_extra_needs_expert);
  close(N.planNegotiation({ ms: "MS-1" }, 100.0, [], false, 120.0).reservation, 120.0);
});
test("negotiation.PlanTest.test_no_anchor", () => assert.equal(N.planNegotiation({ ms: "MS-1" }, null, []).status, "NO_ANCHOR"));
const PLAN = { target: 90.0, reservation: 100.0, c: 0.5, rounds: 4 };
test("negotiation.MovesTest.test_offers_rise_monotonically_to_reservation", () => {
  const offers = [0, 1, 2, 3, 4].map((t) => N.nextOffer(PLAN, t));
  close(offers[0], 90.0);
  close(offers[offers.length - 1], 100.0);
  assert.ok(offers.every((b, i) => i === 0 || b >= offers[i - 1]));
  assert.ok(N.nextOffer(PLAN, 2) < 95.0);
});
test("negotiation.MovesTest.test_accept_rules", () => {
  assert.equal(N.accept(PLAN, 1, 101.0).accept, false);
  assert.equal(N.accept(PLAN, 1, 90.5).accept, true);
  assert.equal(N.accept(PLAN, 1, 99.0).accept, false);
  assert.equal(N.accept(PLAN, 4, 99.0, 99.5).accept, true);
  assert.equal(N.accept(PLAN, 4, 99.0, 98.0).accept, false);
  assert.equal(N.accept(PLAN, 1, 90.0, null, false).accept, false);
});
test("negotiation.MovesTest.test_concessions", () => {
  assert.ok(N.concessionOk([], 90));
  assert.ok(!N.concessionOk([92], 91));
  assert.ok(N.concessionOk([90, 94], 99));
  assert.ok(!N.concessionOk([90.6], 96.0, PLAN, 2));
  assert.ok(N.concessionOk([90.6], 92.5, PLAN, 2));
});
test("negotiation.MovesTest.test_full_schedule_passes_for_every_class", () => {
  for (const c of [0.3, 0.5, 0.6]) {
    const plan = { target: 90.0, reservation: 100.0, c, rounds: 4 };
    const prev = [];
    for (let t = 1; t <= 4; t++) {
      const o = N.nextOffer(plan, t);
      assert.ok(N.concessionOk(prev, o, plan, t), JSON.stringify([c, t, prev, o]));
      prev.push(o);
    }
    close(prev[prev.length - 1], 100.0);
  }
});

/* ---------------- test_detectors.py ---------------- */
const states = (out) => out.map((o) => o.state);
test("detectors.QuoteChecksTest.test_identical_low_high_validity_missing", () => {
  const q = [{ supplier_id: "a", unit_price: 100.0, validity_hours: 72, fields: { x: 1 } },
    { supplier_id: "b", unit_price: 100.3, validity_hours: 12, fields: { x: 1 } },
    { supplier_id: "c", unit_price: 70.0, validity_hours: 72, fields: {} },
    { supplier_id: "d", unit_price: 115.0, validity_hours: 72, fields: { x: 1 } }];
  const s = states(D.quoteChecks(q, 100.0, "MS-1", ["x"]));
  for (const x of ["ST-Q05", "ST-Q06", "ST-Q08", "ST-Q03"]) assert.ok(s.includes(x), x);
  assert.ok(!s.includes("ST-Q07"));
  assert.deepEqual(D.aboveReference(q, 100.0, "MS-1"), ["d"]);
  assert.ok(!s.includes("ST-Q02"));
});
test("detectors.QuoteChecksTest.test_all_above_reference", () => {
  assert.ok(states(D.quoteChecks([{ supplier_id: "a", unit_price: 108.0 }, { supplier_id: "b", unit_price: 112.0 }], 100.0, "MS-1", [])).includes("ST-Q07"));
});
test("detectors.QuoteChecksTest.test_extreme_anchor", () => {
  assert.deepEqual(states(D.extremeAnchor(107.0, 100.0, "MS-1")), ["ST-N20"]);
  assert.deepEqual(D.extremeAnchor(105.0, 100.0, "MS-1"), []);
});
test("detectors.QuoteChecksTest.test_short_validity_normal_for_index_items", () => {
  const q = [{ supplier_id: "a", unit_price: 100.0, validity_hours: 6 }, { supplier_id: "b", unit_price: 104.0, validity_hours: 6 }];
  assert.ok(!states(D.quoteChecks(q, 100.0, "MS-3", [])).includes("ST-Q08"));
});
test("detectors.QuoteChecksTest.test_too_few", () => assert.ok(states(D.quoteChecks([{ supplier_id: "a", unit_price: 1.0 }], null, "MS-1", [])).includes("ST-Q02")));
test("detectors.SignalsTest.test_competitive_signal", () => {
  assert.equal(D.competitiveSignal([100, 108, 115]), true);
  assert.equal(D.competitiveSignal([100, 101, 102]), false);
  assert.equal(D.competitiveSignal([100, 100.2, 120]), false);
  assert.equal(D.competitiveSignal([100, 120]), false);
});
test("detectors.SignalsTest.test_dependence", () => {
  assert.deepEqual(states(D.dependenceCheck(0.8, 0.6, true)), ["ST-Q11"]);
  assert.deepEqual(D.dependenceCheck(0.8, 0.6, false), []);
});
test("detectors.SignalsTest.test_rotation", () => {
  assert.deepEqual(states(D.winnerRotation([..."ABABAB"].map((w) => ({ winner: w, bidders: ["A", "B"] })))), ["ST-Q10"]);
  assert.deepEqual(D.winnerRotation([..."ABABAB"].map((w) => ({ winner: w, bidders: ["A", "B", "C"] }))), []);
});
test("detectors.SignalsTest.test_low_variance_after_rise", () => {
  const prev = [100, 90, 110, 95, 105, 100], last = [130, 130.5, 129.5, 130, 130.2, 129.8];
  assert.deepEqual(states(D.lowVarianceAfterRise([...prev, ...last])), ["ST-Q10"]);
  assert.deepEqual(D.lowVarianceAfterRise([...prev, ...prev]), []);
});

/* ---------------- test_validator.py ---------------- */
const CTX = { reservation: 100.0, allowed_offers: [94.0], previous_offers: [92.0], other_supplier_names: ["آهن آلات حیدری"],
  project_names: ["تونل البرز"], disclose_project: false, valid_fact_ids: new Set(["F-3"]) };
test("validator.ValidatorTest.test_clean_message_passes", () => {
  const t = { message_fa: "ممنون. با ۹۴ میلیون ریال و پرداخت یک‌ماهه جمع‌بندی می‌کنیم.", move: "M-COUNTER", offer: { unit_price: 94.0 }, facts_used: [] };
  assert.deepEqual(validateTurn(t, CTX).violations, []);
});
test("validator.ValidatorTest.test_urgency_commitment_internal", () => {
  const v = validateTurn({ message_fa: "کار فوری است؛ سفارش قطعی است و سقف سهم ما پر شده (L4).", move: "M-COUNTER", offer: null, facts_used: [] }, CTX).violations;
  assert.ok(v.some((x) => x.startsWith("urgency")));
  assert.ok(v.some((x) => x.startsWith("commitment")));
  assert.ok(v.some((x) => x.startsWith("internal")));
});
test("validator.ValidatorTest.test_names_and_project", () => {
  const v = validateTurn({ message_fa: "آهن آلات حیدری ارزان‌تر داد؛ برای تونل البرز است.", move: "M-FACT", offer: null, facts_used: [] }, CTX).violations;
  assert.ok(v.some((x) => x.includes("نام تأمین‌کنندهٔ دیگر")));
  assert.ok(v.some((x) => x.includes("نام پروژه")));
});
test("validator.ValidatorTest.test_claim_needs_fact", () => {
  const t = { message_fa: "پیشنهاد ارزان‌تری داریم.", move: "M-FACT", offer: null, facts_used: [] };
  assert.equal(validateTurn(t, CTX).ok, false);
  t.facts_used = ["F-3"];
  assert.equal(validateTurn(t, CTX).ok, true);
  t.facts_used = ["F-9"];
  assert.equal(validateTurn(t, CTX).ok, false);
});
test("validator.ValidatorTest.test_numbers", () => {
  const v = validateTurn({ message_fa: "پیشنهاد ما ۱۰۲ است.", move: "M-COUNTER", offer: { unit_price: 102.0 }, facts_used: [] }, CTX).violations;
  assert.ok(v.some((x) => x.includes("بالاتر از حد")));
  const v2 = validateTurn({ message_fa: "پیشنهاد ما ۹۰ است.", move: "M-COUNTER", offer: { unit_price: 90.0 }, facts_used: [] }, CTX).violations;
  assert.ok(v2.some((x) => x.includes("next_offer")));
  assert.ok(v2.some((x) => x.includes("پس گرفته")));
});
test("validator.ValidatorTest.test_counts_and_effective_basis", () => {
  assert.equal(validateTurn({ message_fa: "از پنج فروشنده قیمت گرفتیم.", move: "M-FACT", offer: null, facts_used: [] }, CTX).ok, false);
  const t = { message_fa: "پیشنهاد ما ۹۵ با پرداخت یک‌ماهه است.", move: "M-COUNTER", offer: { unit_price: 95.0 }, facts_used: [] };
  assert.equal(validateTurn(t, { ...CTX, offer_effective_unit: 94.0 }).ok, true);
  assert.equal(validateTurn(t, CTX).ok, false);
});
test("validator.ValidatorTest.test_rules_copy_is_identical", async () => {
  /* در بسته: procstrat/data و 04_prompts یکی‌اند. این‌جا: نسخهٔ جاوااسکریپت با فایلِ بسته (اگر روی دیسک باشد) */
  const { VALIDATOR_RULES } = await import("../../../worker/strategy/validator-rules.js");
  const { existsSync, readFileSync } = await import("node:fs");
  const f = process.env.CR02_ROOT ? `${process.env.CR02_ROOT}/04_prompts/validator_rules.json` : null;
  if (f && existsSync(f)) assert.deepEqual(VALIDATOR_RULES, JSON.parse(readFileSync(f, "utf8")));
  else assert.equal(VALIDATOR_RULES.version, "2.0");
});
test("validator.ValidatorTest.test_close_needs_commission", () => {
  const t = { message_fa: "جمع‌بندی: ۹۴ میلیون، پرداخت یک‌ماهه.", move: "M-CLOSE", offer: null, facts_used: [] };
  assert.equal(validateTurn(t, CTX).ok, false);
  t.message_fa += " تصمیم نهایی پس از تأیید کمیسیون اعلام می‌شود.";
  assert.equal(validateTurn(t, CTX).ok, true);
});

/* ---------------- test_profile.py ---------------- */
const REC = { item_head: "سیم", cluster_main: "C07", spend: { spend_bn_real: 1069.3, impact_high: true }, indicators: { n_sup_recent: 12 },
  classification: { ms: "MS-3", labels: ["L6", "L7", "L10"], quadrant: "Q2", coordination_risk: "کم", supply_power: "متوسط", dependence: "کم", class_source: "قاعدهٔ داده" },
  confidence: { band: "زیاد", review: { disputed: false, rfq_caution: false, rater2: { ms: "MS-2", rfq: "STANDARD", collusion: "low", confidence: "medium" } } } };
test("profile.ProfileTest.test_basic", () => {
  const p = engineProfile(REC);
  assert.equal(p.ms, "MS-3");
  assert.equal(decideMode(p)[0], "SIMULTANEOUS_INDEX");
});
test("profile.ProfileTest.test_item_exception", () => {
  const p = engineProfile(REC, { item_ms_override: "MS-2", item_labels_add: "L1" });
  assert.equal(p.ms, "MS-2");
  assert.ok(p.labels.includes("L1"));
  assert.equal(decideMode(p)[0], "FRAMEWORK_CALLOFF");
});
test("profile.ProfileTest.test_expert_updates", () => {
  const p = engineProfile(REC, null, { ms: "MS-4", labels_set: { L2: true, L10: false }, rfq_mode_preference: "LIMITED" });
  assert.equal(p.ms, "MS-4");
  assert.ok(p.labels.includes("L2"));
  assert.ok(!p.labels.includes("L10"));
  assert.equal(decideMode(p)[0], "LIMITED_STAGED");
});
test("profile.ProfileTest.test_override_ignores_rater_rfq", () => {
  assert.equal(engineProfile({ ...REC, classification: { ...REC.classification, class_source: "داوری دوم" } }).rater_rfq, null);
});

/* ---------------- test_questionnaire.py ---------------- */
test("questionnaire.ClassTreeTest.test_tree", () => {
  assert.equal(Q.impliedClass({ Q00: "service" }), "MS-6");
  assert.equal(Q.impliedClass({ Q02: "locked", Q04: "importers" }), "MS-5");
  assert.equal(Q.impliedClass({ Q01: "2-3", Q02: "differs" }), "MS-4");
  assert.equal(Q.impliedClass({ Q01: "1" }), "MS-4");
  assert.equal(Q.impliedClass({ Q01: "2-3", Q02: "same" }), "MS-4");
  assert.equal(Q.impliedClass({ Q01: "2-3", Q02: "locked", Q04: "agent" }), "MS-5");
  assert.equal(Q.impliedClass({ Q05: "often", Q01: "7+" }), "MS-4");
  assert.equal(Q.impliedClass({ Q01: "7+", Q03: "upstream", Q02: "same" }), "MS-3");
  assert.equal(Q.impliedClass({ Q01: "4-6", Q02: "differs" }), "MS-2");
  assert.equal(Q.impliedClass({ Q01: "7+", Q02: "same" }), "MS-1");
  assert.equal(Q.impliedClass({ Q01: "unknown" }), null);
});
test("questionnaire.ClassTreeTest.test_labels", () => {
  const m = Q.impliedLabels({ Q06: "one_market", Q08: "machine_stops", Q11: "0.05", Q07: "unsure" });
  assert.equal(m.L5, true); assert.equal(m.L12, true); assert.equal(m.L4, true); assert.equal(m.L8, true);
  assert.equal(m.L1, null);
});
test("questionnaire.ClassTreeTest.test_swing", () => {
  const w = Q.swingWeights({ price: 100, payment: 50, delivery: 30, condition: 10, quality: 10 });
  close(Object.values(w).reduce((s, x) => s + x, 0), 1.0, "", 2);
  assert.equal(Object.entries(w).sort((a, b) => b[1] - a[1])[0][0], "price");
  assert.deepEqual(Q.swingWeights({}), {});
});
test("questionnaire.ApplyTest.test_high_confidence_overrides", () => {
  const r = Q.applyAnswers({ ms: "MS-1", class_confidence: "زیاد" }, { Q01: "1" }, "high");
  assert.equal(r.updates.ms, "MS-4");
  assert.equal(r.status, "UPDATED");
});
test("questionnaire.ApplyTest.test_medium_against_stable_is_disputed", () => {
  const r = Q.applyAnswers({ ms: "MS-1", class_confidence: "زیاد" }, { Q01: "1" }, "medium");
  assert.equal(r.status, "DISPUTED");
  assert.deepEqual(r.updates, {});
});
test("questionnaire.ApplyTest.test_low_only_recorded", () => {
  const r = Q.applyAnswers({ ms: "MS-1", class_confidence: "کم" }, { Q01: "1", Q11: "0.05", Q06: "one_market" }, "low");
  assert.deepEqual(r.updates, {});
  assert.equal(r.status, "RECORDED");
  assert.equal(r.proposed_class, "MS-4");
});
test("questionnaire.ApplyTest.test_two_or_three_sellers_is_scarce", () => {
  assert.equal(Q.impliedLabels({ Q01: "2-3" }).L2, true);
  assert.equal(Q.impliedLabels({ Q01: "7+", Q05: "never" }).L2, false);
});
test("questionnaire.ApplyTest.test_two_experts", () => {
  assert.equal(Q.applyAnswers({ ms: "MS-1" }, { Q01: "1" }, "high", { Q01: "7+", Q02: "same" }).status, "DELPHI_ROUND_2");
  assert.equal(Q.applyAnswers({ ms: "MS-1" }, { Q01: "1" }, "high", { Q01: "1" }).status, "CONFIRMED");
});
test("questionnaire.ApplyTest.test_parameters_and_warning", () => {
  const r = Q.applyAnswers({ ms: "MS-4" }, { Q11: "0.05", Q14: "0.07", Q12: "BROAD", Q10b: "hard", Q13: { price: 100, quality: 50 } }, "high");
  const u = r.updates;
  assert.equal(u.max_diversification_premium, 0.05);
  assert.equal(u.monthly_rate, 0.07);
  assert.ok("hard_constraints_add" in u);
  close(u.weights.price, 0.667, "", 3);
  assert.ok(r.audit.some((a) => a.includes("R06")));
  assert.equal(u.confidence, "high");
});
test("questionnaire.VoiTest.test_scarcity_questions_first_for_competitive_item", () => {
  const r = Q.decisionRelevantQuestions({ ms: "MS-1", labels: [], quadrant: "Q2", impact_high: true, spend_bn: 100 });
  assert.ok(r.slice(0, 3).map((x) => x.q).includes("Q01"));
  const q01 = r.find((x) => x.q === "Q01");
  assert.ok(q01.changes_mode_for.includes("1"));
  assert.equal(q01.modes["7+"], "BROAD");
  assert.deepEqual(r.find((x) => x.q === "Q06").changes_mode_for, []);
});
