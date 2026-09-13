/* جستجوی هوشمند، نسخهٔ کم‌هزینه: پرامپت فقط بازارهای انتخابی، خروجی کوتاه ← شکل پنل، سقف هزینه */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPrompt, normalizeResult, runDiscovery, runCost, LIMITS, MAX_MARKETS, DISCOVERY_PROMPT_VERSION } from "../../../worker/discovery.js";

const lean = (over = {}) => ({
  name: "بازرگانی سیمان آریا", role: "wholesaler_importer", country: "Iran", city: "تهران", delivery_country_match: false, website: "https://arya.example",
  phones: [
    { verbatim: "۰۹۱۲۱۲۳۴۵۶۷", e164: "+989121234567", type: "mobile", verification: "verified", source_url: "https://arya.example/contact" },
    { verbatim: "021-88000000", e164: "+982188000000", type: "landline", verification: "verified", source_url: "https://arya.example/contact" },
  ],
  emails: [{ verbatim: "sales@arya.example", source_url: "https://arya.example/contact" }],
  messengers: [{ platform: "telegram", handle: "@arya" }],
  address: "تهران، خیابان آزادی", contact_gated: false, gating_note: null,
  legal_name: "شرکت بازرگانی سیمان آریا", registry_id: "10320000000", red_flags: [],
  scores: [4, 3, 2, 4, 4, 1, 3], rationale: "تماس کامل و هویت ثبتی روشن.",
  ...over,
});

test("نسخهٔ پرامپت و بودجه‌های کم‌هزینه", () => {
  assert.equal(DISCOVERY_PROMPT_VERSION, "supplier-discovery/2.0");
  assert.equal(LIMITS.MAX_CANDIDATES, 5);
  assert.equal(LIMITS.COST_CAP, 0.2);
  assert.equal(MAX_MARKETS, 3);
});

test("پرامپت فقط یادداشتِ بازارهای انتخابی را دارد و کوتاه است", () => {
  const { system } = buildPrompt({ item: "سیمان تیپ ۲", markets: ["IR", "AM"], qty: 400, unit: "تن" });
  assert.match(system, /divar\.ir/);
  assert.match(system, /list\.am/);
  assert.doesNotMatch(system, /1688\.com|somon\.tj|sahibinden/);
  assert.match(system, /max_suppliers=5/);
  assert.match(system, /web_searches=5; page_fetches=3/);
  assert.doesNotMatch(system, /\{\{\w+\}\}/, "هیچ جای‌خالیِ پرنشده‌ای نماند");
  assert.ok(system.length < 13000, `پرامپت ${system.length} نویسه`);
});

test("خروجی کوتاه ← شکل پنل و بات: امتیاز کل از هفت عدد، موبایل‌ها، هویت", () => {
  const r = normalizeResult({ item_restated: "سیمان", queries_run: ["سیمان فله"], suppliers: [lean()], excluded: [{ name: "X", reason: "G3" }], summary_fa: "خلاصه" },
    { item: "سیمان", markets: ["Iran"], searches: 4, fetches: 2 });
  const s = r.suppliers[0];
  /* 25·4/4 + 15·3/4 + 15·2/4 + 15·4/4 + 15·4/4 + 10·1/4 + 5·3/4 */
  assert.equal(s.scores.total, 25 + 11.25 + 7.5 + 15 + 15 + 2.5 + 3.75);
  assert.equal(s.scores.C4_reachability, 4);
  assert.deepEqual(s.mobile_numbers, ["+989121234567"]);
  assert.equal(s.location.city, "تهران");
  assert.equal(s.messengers[0].handle_or_link, "@arya");
  assert.equal(s.addresses[0].verbatim, "تهران، خیابان آزادی");
  assert.equal(s.credibility.legal_identity.registry_id, "10320000000");
  assert.equal(s.evidence.length, 1);
  assert.equal(r.request.searches_used, 4);
  assert.deepEqual(r.excluded, [{ name: "X", reason: "G3" }]);
});

test("ترتیب را بک‌اند می‌سازد و حداکثر ۵ تأمین‌کننده می‌ماند", () => {
  const sups = [
    lean({ name: "A", scores: [1, 1, 1, 1, 1, 1, 1] }),
    lean({ name: "B", scores: [4, 4, 4, 2, 2, 4, 4] }),
    lean({ name: "C", scores: [4, 4, 4, 4, 2, 2, 4] }),   /* هم‌امتیاز با B ولی دسترس‌پذیرتر */
    lean({ name: "D", scores: [9, -3, "x", 2, 2, 2, 2] }), /* عدد بیرون از بازه به ۰..۴ بسته می‌شود */
    lean({ name: "E" }), lean({ name: "F" }), lean({ name: "G", scores: [0, 0, 0, 0, 0, 0, 0] }),
  ];
  const r = normalizeResult({ suppliers: sups }, {});
  assert.equal(r.suppliers.length, 5);
  assert.deepEqual(r.suppliers.map((s) => s.name).slice(0, 2), ["C", "B"]);
  assert.deepEqual(r.suppliers.map((s) => s.rank), [1, 2, 3, 4, 5]);
  assert.ok(!r.suppliers.some((s) => s.name === "G"));
  assert.equal(r.suppliers.find((s) => s.name === "D").scores.C1_item_fit, 4);
});

test("خروجیِ شکل قدیم (v1) بی‌تغییر می‌گذرد", () => {
  const old = { name: "Old", location: { country: "Iran", city: "قم" }, phones: [], mobile_numbers: ["+98912"], scores: { total: 70, rationale: "r" } };
  const r = normalizeResult({ request: { searches_used: 7 }, suppliers: [old] }, {});
  assert.equal(r.suppliers[0].mobile_numbers[0], "+98912");
  assert.equal(r.suppliers[0].scores.total, 70);
  assert.equal(r.request.searches_used, 7);
});

test("سقف هزینه: وقتی هزینه به سقف منهای ذخیره رسید، دور بعد بی‌ابزار است", async () => {
  const bodies = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    bodies.push(body);
    const first = bodies.length === 1;
    const out = first
      /* ۶۰ هزار توکن نوشتن در کش + ۵ جستجو ≈ ۰٫۱۵ + ۰٫۰۵ = ۰٫۲۰ ⇒ به سقف رسیده */
      ? { stop_reason: "pause_turn", content: [{ type: "text", text: "…" }], usage: { input_tokens: 1000, output_tokens: 500, cache_creation_input_tokens: 60000, server_tool_use: { web_search_requests: 5 } } }
      : { stop_reason: "end_turn", content: [{ type: "text", text: `<result>${JSON.stringify({ suppliers: [lean()], summary_fa: "خلاصه" })}</result>` }], usage: { input_tokens: 200, output_tokens: 1500, cache_read_input_tokens: 62000 } };
    return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const out = await runDiscovery({ ANTHROPIC_API_KEY: "k", ANTHROPIC_API_BASE: "http://stub" }, { item: "سیمان", markets: ["IR"] });
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0].tool_choice, undefined);
    assert.deepEqual(bodies[1].tool_choice, { type: "none" });
    assert.equal(bodies[0].max_tokens, LIMITS.MAX_TOKENS);
    assert.equal(bodies[0].tools[0].max_uses, 5);
    assert.equal(bodies[0].tools[1].max_uses, 3);
    assert.equal(bodies[0].tools[1].max_content_tokens, 3000);
    assert.ok(bodies[0].tools.every((t) => !t.user_location));
    assert.equal(out.result.request.cost_capped, true);
    assert.equal(out.result.suppliers[0].scores.total > 0, true);
    assert.equal(out.cost, runCost("claude-sonnet-5", out.usage));
  } finally { globalThis.fetch = realFetch; }
});
