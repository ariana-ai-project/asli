/* جستجوی هوشمند، نسخهٔ کم‌هزینه: پرامپت فقط بازارهای انتخابی، خروجی کوتاه ← شکل پنل، سقف هزینه، پاسخ جریانی */
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

/**
 * پاسخ جریانیِ ساختگی، با همان رویدادهای API. `blocks` بلوک‌های کامل‌اند؛ متن در
 * چند تکه و ورودیِ server_tool_use با input_json_delta فرستاده می‌شود تا بازسازی سنجیده شود.
 */
function sse({ blocks, stop, usage }) {
  const ev = [];
  const send = (type, data) => ev.push(`event: ${type}\r\ndata: ${JSON.stringify({ type, ...data })}\r\n\r\n`);
  const { output_tokens, server_tool_use, ...inUsage } = usage;
  send("message_start", { message: { id: "m", type: "message", role: "assistant", content: [], usage: { ...inUsage, output_tokens: 1 } } });
  send("ping", {});
  blocks.forEach((b, index) => {
    if (b.type === "text") {
      send("content_block_start", { index, content_block: { type: "text", text: "" } });
      for (let i = 0; i < b.text.length; i += 7) send("content_block_delta", { index, delta: { type: "text_delta", text: b.text.slice(i, i + 7) } });
    } else if (b.type === "server_tool_use") {
      send("content_block_start", { index, content_block: { ...b, input: {} } });
      const j = JSON.stringify(b.input);
      send("content_block_delta", { index, delta: { type: "input_json_delta", partial_json: j.slice(0, 5) } });
      send("content_block_delta", { index, delta: { type: "input_json_delta", partial_json: j.slice(5) } });
    } else send("content_block_start", { index, content_block: b });
    send("content_block_stop", { index });
  });
  send("message_delta", { delta: { stop_reason: stop }, usage: { output_tokens, server_tool_use } });
  send("message_stop", {});
  /* تکه‌های نامنظم تا مرزِ رویدادها وسط تکه بیفتد */
  const all = ev.join("");
  return new Response(new ReadableStream({
    start(c) { for (let i = 0; i < all.length; i += 23) c.enqueue(new TextEncoder().encode(all.slice(i, i + 23))); c.close(); },
  }), { status: 200, headers: { "content-type": "text/event-stream" } });
}

async function withFetch(fn, handler) {
  const real = globalThis.fetch;
  globalThis.fetch = handler;
  try { return await fn(); } finally { globalThis.fetch = real; }
}
const ENV = { ANTHROPIC_API_KEY: "k", ANTHROPIC_API_BASE: "http://stub" };

test("نسخهٔ پرامپت و بودجه‌های کم‌هزینه", () => {
  assert.equal(DISCOVERY_PROMPT_VERSION, "supplier-discovery/2.0");
  assert.equal(LIMITS.MAX_CANDIDATES, 5);
  assert.equal(LIMITS.COST_CAP, 0.2);
  assert.equal(MAX_MARKETS, 3);
});

test("پرامپت با فیلدهای جستجو پر می‌شود و فقط یادداشتِ بازارهای انتخابی را دارد", () => {
  const { system, user } = buildPrompt({ item: "سیمان تیپ ۲", markets: ["IR", "AM"], qty: 400, unit: "تن", brand: "سیمان تهران", specs: "استاندارد ۳۸۹", notes: "فقط تولیدکننده", deliveryHint: "کاجاران" });
  assert.match(system, /<item_name>سیمان تیپ ۲<\/item_name>/);
  assert.match(system, /<brand_preference>سیمان تهران<\/brand_preference>/);
  assert.match(system, /<tech_specs>استاندارد ۳۸۹<\/tech_specs>/);
  assert.match(system, /<buyer_notes>فقط تولیدکننده<\/buyer_notes>/);
  assert.match(system, /<delivery_hint>کاجاران<\/delivery_hint>/);
  assert.match(system, /requested_quantity: 400 تن/);
  assert.match(system, /divar\.ir/);
  assert.match(system, /list\.am/);
  assert.doesNotMatch(system, /1688\.com|somon\.tj|sahibinden/);
  assert.match(system, /max_suppliers=5/);
  assert.match(system, /web_searches=5; page_fetches=3/);
  assert.match(system, /"scores":\[0,0,0,0,0,0,0\]/, "قالب JSON خروجی در پرامپت تعریف شده");
  assert.doesNotMatch(system, /\{\{\w+\}\}/, "هیچ جای‌خالیِ پرنشده‌ای نماند");
  assert.ok(system.length < 13000, `پرامپت ${system.length} نویسه`);
  assert.match(user, /سیمان تیپ ۲/);
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

test("پاسخ جریانی: بلوک‌ها عیناً بازسازی و در pause_turn برگردانده می‌شوند؛ سقف هزینه دور بعد را بی‌ابزار می‌کند", async () => {
  const bodies = [];
  const tool = { type: "server_tool_use", id: "srv_1", name: "web_search", input: { query: "سیمان فله تهران" } };
  const found = { type: "web_search_tool_result", tool_use_id: "srv_1", content: [{ type: "web_search_result", url: "https://arya.example", title: "آریا", encrypted_content: "x" }] };
  const out = await withFetch(() => runDiscovery(ENV, { item: "سیمان", markets: ["IR"] }), async (_url, init) => {
    const body = JSON.parse(init.body);
    bodies.push(body);
    if (bodies.length === 1) {
      /* ۶۰ هزار توکن نوشتن در کش + ۵ جستجو ≈ ۰٫۲۰ ⇒ به سقف رسیده */
      return sse({ blocks: [tool, found], stop: "pause_turn",
        usage: { input_tokens: 1000, cache_creation_input_tokens: 60000, cache_read_input_tokens: 0, output_tokens: 500, server_tool_use: { web_search_requests: 5 } } });
    }
    return sse({ blocks: [{ type: "text", text: `<result>${JSON.stringify({ suppliers: [lean()], summary_fa: "خلاصه" })}</result>` }], stop: "end_turn",
      usage: { input_tokens: 200, cache_read_input_tokens: 62000, output_tokens: 1500 } });
  });
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].stream, true);
  assert.equal(bodies[0].tool_choice, undefined);
  assert.deepEqual(bodies[1].tool_choice, { type: "none" });
  assert.deepEqual(bodies[1].messages[1], { role: "assistant", content: [tool, found] }, "پاسخ ناتمام عیناً برگشت");
  assert.equal(bodies[0].max_tokens, LIMITS.MAX_TOKENS);
  assert.equal(bodies[0].tools[0].max_uses, 5);
  assert.equal(bodies[0].tools[1].max_uses, 3);
  assert.equal(bodies[0].tools[1].max_content_tokens, 3000);
  assert.ok(bodies[0].tools.every((t) => !t.user_location));
  assert.deepEqual(out.usage, { input: 1200, output: 2000, cacheRead: 62000, cacheWrite: 60000, searches: 5, fetches: 0 });
  assert.equal(out.result.request.cost_capped, true);
  assert.equal(out.result.suppliers[0].name, "بازرگانی سیمان آریا");
  assert.equal(out.cost, runCost("claude-sonnet-5", out.usage));
});

test("پاسخ جریانی: خطای میانهٔ جریان و قطع پیش از پایان، پیام روشن می‌دهند", async () => {
  const broken = (text) => async () => new Response(text, { status: 200, headers: { "content-type": "text/event-stream" } });
  await assert.rejects(withFetch(() => runDiscovery(ENV, { item: "سیمان", markets: ["IR"] }),
    broken(`event: error\ndata: ${JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } })}\n\n`)), /Overloaded/);
  await assert.rejects(withFetch(() => runDiscovery(ENV, { item: "سیمان", markets: ["IR"] }),
    broken(`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { usage: {} } })}\n\n`)), /پیش از پایان پاسخ قطع شد/);
  await assert.rejects(withFetch(() => runDiscovery(ENV, { item: "سیمان", markets: ["IR"] }),
    async () => new Response(JSON.stringify({ error: { message: "invalid x-api-key" } }), { status: 401 })), /invalid x-api-key/);
});
