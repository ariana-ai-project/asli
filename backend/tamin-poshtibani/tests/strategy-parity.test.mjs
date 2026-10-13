/* ============================================================
   برابریِ موتور راهبرد (worker/strategy) با بستهٔ «درخواست تغییر ۰۲» — همان بررسی‌های 08_tests/run_scenarios.py
     C1  هر ۲٬۴۵۷ پروفایل از راهِ engineProfile سیاستِ ذخیره‌شده‌اش را عیناً بازتولید می‌کند (معیار E2)
     C2–C4  سناریوهای استعلام، آشکارسازها و نوبت‌ها (معیار E3)
     C5  هر وضعیتی که پروفایل‌ها و سناریوها نام می‌برند در فهرست هست
   داده: tests/fixtures/cr02-parity.json.gz (tools/build-cr02-fixtures.mjs از روی بسته)
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { rfqPolicy } from "../../../worker/strategy/rfq.js";
import { engineProfile } from "../../../worker/strategy/profile.js";
import { quoteChecks } from "../../../worker/strategy/detectors.js";
import { accept } from "../../../worker/strategy/negotiation.js";
import { validateTurn } from "../../../worker/strategy/validator.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FX = JSON.parse(gunzipSync(readFileSync(resolve(HERE, "fixtures/cr02-parity.json.gz"))).toString("utf8"));
const PROFILES = new Map(FX.profiles.map((p) => [p.item_head, p]));
const STATE_IDS = new Set(FX.state_ids);

/** اولین اختلافِ دو مقدار، برای پیامِ خوانا */
function firstDiff(a, b, path = "") {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = firstDiff(a[k], b[k], `${path}.${k}`); if (d) return d; }
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    for (let i = 0; i < a.length; i++) { const d = firstDiff(a[i], b[i], `${path}[${i}]`); if (d) return d; }
  }
  return `${path}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`;
}

test("C1 — هر پروفایل سیاستِ ذخیره‌شده‌اش را بازتولید می‌کند", () => {
  assert.equal(FX.profiles.length, 2457);
  const bad = [];
  for (const p of FX.profiles) {
    const pol = rfqPolicy(engineProfile(p.rec));
    delete pol.runtime;
    const got = JSON.parse(JSON.stringify(pol));
    if (JSON.stringify(got) !== JSON.stringify(p.rfq_policy)) {
      /* ترتیبِ کلیدها مهم نیست؛ deepEqual داوری نهایی است */
      try { assert.deepStrictEqual(got, p.rfq_policy); } catch (_) { bad.push(`${p.item_head}: ${firstDiff(got, p.rfq_policy)}`); }
    }
  }
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} پروفایل نمی‌خواند`);
});

for (const s of FX.scenarios) {
  test(`${s.id} (${s.kind})`, () => {
    if (s.kind === "rfq") {
      const r = PROFILES.get(s.item_head);
      assert.ok(r, `نوع قلم ${s.item_head} در پروفایل‌ها نیست`);
      const pol = rfqPolicy(engineProfile(r.rec), s.runtime);
      const e = s.expect;
      assert.equal(pol.mode, e.mode);
      if (e.n) assert.deepEqual([pol.n_wave1, pol.n_max], e.n);
      if ("max_per_hub" in e) assert.equal(pol.distribution.max_per_hub, e.max_per_hub);
      if ("need_outsider" in e) assert.equal(pol.distribution.need_outsider, e.need_outsider);
      if ("timing_contains" in e) assert.ok(pol.timing.includes(e.timing_contains), pol.timing);
      if ("consult_first" in e) assert.equal(pol.consult_first, e.consult_first);
      if ("runtime_has" in e) assert.ok(e.runtime_has in pol.runtime);
      if ("disclose_urgency" in e) assert.equal(pol.disclosure.urgency, e.disclose_urgency);
    } else if (s.kind === "quotes") {
      const st = new Set(quoteChecks(s.quotes, s.ref_price, s.ms, ["x"]).map((o) => o.state));
      for (const x of s.expect_states) assert.ok(st.has(x), `${x} نیست (${[...st]})`);
      for (const x of s.expect_absent) assert.ok(!st.has(x), `${x} نباید باشد`);
    } else if (s.kind === "turn") {
      const e = s.expect;
      for (const x of e.states_any) assert.ok(STATE_IDS.has(x), `وضعیتِ ناشناختهٔ ${x}`);
      if (s.supplier_offer != null && e.accept != null) {
        const a = accept(s.plan, s.round, s.supplier_offer, s.best_seen ?? null);
        assert.equal(a.accept, e.accept, a.reason);
      }
      const ctx = { ...s.validator_ctx };
      const good = { message_fa: s.sample_good_reply, move: e.move_any[0], facts_used: s.good_facts || [], offer: s.good_offer ? { unit_price: s.good_offer } : null };
      const res = validateTurn(good, ctx);
      assert.ok(res.ok, `پاسخِ خوب رد شد: ${res.violations}`);
      if (s.sample_bad_reply) {
        const bad = { message_fa: s.sample_bad_reply, move: e.move_any[0], facts_used: [], offer: s.bad_offer ? { unit_price: s.bad_offer } : null };
        assert.equal(validateTurn(bad, ctx).ok, false, "پاسخِ بد پذیرفته شد");
      }
    }
  });
}

test("C5 — وضعیت‌های نام‌برده در فهرست هستند", () => {
  const missing = new Set();
  for (const p of FX.profiles) for (const x of p.watch_states) if (!STATE_IDS.has(x)) missing.add(x);
  assert.deepEqual([...missing], []);
  assert.equal(STATE_IDS.size, 96);
});
