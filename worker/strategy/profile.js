/**
 * پروفایلِ تختِ موتور از یک ردیفِ item_strategy_profiles (یا ردیف‌های پایگاه داده) — برگردانِ procstrat/profile.py
 * استثنای سطحِ قلم و پاسخ‌های کارشناس روی آن اعمال می‌شود، تا موتور دقیقاً همان را ببیند که تحقیق پیشنهاد داد به‌علاوهٔ آنچه
 * کارشناسان عوض کردند. backend به‌جای ساختنِ دوبارهٔ فیلدها همین را صدا بزند.
 */
export function engineProfile(rec, itemRow = null, expert = null) {
  const cl = rec.classification || {};
  const conf = rec.confidence || {};
  const rv = conf.review || {};
  const r2 = rv.rater2 || {};
  const overridden = cl.class_source === "داوری دوم";
  const ind = rec.indicators || {};
  const spend = rec.spend || {};
  const p = {
    ms: cl.ms || "MS-0",
    labels: [...(cl.labels || [])],
    quadrant: cl.quadrant || "Q1",
    impact_high: !!spend.impact_high,
    spend_bn: Number(spend.spend_bn_real || 0.0),
    coordination_risk: cl.coordination_risk ?? null,
    rater_rfq: overridden ? null : (r2.rfq ?? null),
    rater_confidence: r2.confidence ?? null,
    rater_collusion: r2.collusion ?? null,
    class_disputed: !!rv.disputed,
    rfq_caution: !!rv.rfq_caution,
    supply_power: cl.supply_power ?? null,
    dependence: cl.dependence ?? null,
    n_sup_recent: Math.trunc(Number(ind.n_sup_recent || 0)),
    class_confidence: conf.band ?? null,
    cluster: rec.cluster_main ?? null,
  };
  if (itemRow) {
    if (itemRow.item_ms_override) p.ms = itemRow.item_ms_override;
    for (const lab of String(itemRow.item_labels_add || "").split(/\s+/)) if (lab && !p.labels.includes(lab)) p.labels.push(lab);
  }
  if (expert) {
    if (expert.ms) p.ms = expert.ms;
    for (const [k, v] of Object.entries(expert.labels_set || {})) {
      if (v && !p.labels.includes(k)) p.labels.push(k);
      if (v === false && p.labels.includes(k)) p.labels = p.labels.filter((x) => x !== k);
    }
    if (expert.rfq_mode_preference) { p.expert_rfq = expert.rfq_mode_preference; p.expert_confidence = expert.confidence || "medium"; }
    if (expert.max_diversification_premium != null) p.pi_override = Number(expert.max_diversification_premium);   /* Q11 */
    if (expert.monthly_rate != null) p.monthly_rate = Number(expert.monthly_rate);                                 /* Q14 */
    if (expert.weights) p.weights = expert.weights;                                                                  /* Q13 */
    if (expert.hard_constraints_add) p.hard_constraints_add = [...expert.hard_constraints_add];                     /* Q10b */
  }
  p.labels = [...new Set(p.labels)].sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10));
  return p;
}
