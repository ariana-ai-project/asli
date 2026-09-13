/* جستجوی هوشمند v3: پرامپت پرشده، خروجی بی‌فیلتر، ابزارهای مستقیم، بی سقف هزینه، پاسخ جریانی */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPrompt, shapeResult, runDiscovery, runCost, LIMITS, MAX_MARKETS, DISCOVERY_PROMPT_VERSION } from "../../../worker/discovery.js";

const sup = (over = {}) => ({ name: "بازرگانی سیمان آریا", type: "wholesaler", market: "ایران", phones: ["+989121234567"], emails: ["sales@arya.example"], website: "https://arya.example", price: null, ...over });

/**
 * پاسخ جریانیِ ساختگی، با همان رویدادهای API. متن در چند تکه و ورودیِ server_tool_use با
 * input_json_delta فرستاده می‌شود، و تکه‌های شبکه نامنظم‌اند تا مرزِ رویدادها وسط تکه بیفتد.
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
const done = (suppliers) => sse({ blocks: [{ type: "text", text: `<result>${JSON.stringify({ suppliers })}</result>` }], stop: "end_turn", usage: { input_tokens: 200, cache_read_input_tokens: 30000, output_tokens: 1500 } });

test("نسخه و اهداف v3", () => {
  assert.equal(DISCOVERY_PROMPT_VERSION, "supplier-discovery/3.0");
  assert.equal(LIMITS.MIN_SUPPLIERS, 5);
  assert.equal(LIMITS.MAX_SUPPLIERS, 10);
  assert.equal(MAX_MARKETS, 3);
});

test("پرامپت با فیلدهای جستجو پر می‌شود: فقط بازارهای انتخابی، دست‌کم ۵ تا ۱۰، مراحل موازی، قالب JSON", () => {
  const { system, user } = buildPrompt({ item: "سیمان تیپ ۲", itemCode: "1010100001", markets: ["IR", "AM"], qty: 400, unit: "تن", brand: "سیمان تهران", specs: "استاندارد ۳۸۹", notes: "فقط تولیدکننده", deliveryHint: "کاجاران" });
  for (const x of ["name: سیمان تیپ ۲", "item code: 1010100001", "quantity: 400 تن", "brand preference: سیمان تهران", "technical specs: استاندارد ۳۸۹", "buyer notes: فقط تولیدکننده", "delivered to: کاجاران"]) {
    assert.ok(system.includes(x), x);
  }
  assert.match(system, /Iran \(ایران\)/);
  assert.match(system, /Armenia \(ارمنستان\)/);
  assert.match(system, /divar\.ir/);
  assert.doesNotMatch(system, /somon\.tj|1688\.com|sahibinden/);
  assert.match(system, /at least 5 different suppliers/);
  assert.match(system, /up to 10/);
  assert.match(system, /in parallel in a single step/);
  assert.match(system, /"suppliers":\[\{"name":"","type":"manufacturer","market":"ایران","phones"/);
  assert.doesNotMatch(system, /summary|score|rationale|excluded/i, "نه خلاصه، نه امتیاز");
  assert.doesNotMatch(system, /\{\{\w+\}\}/, "هیچ جای‌خالیِ پرنشده‌ای نماند");
  assert.ok(system.length < 6000, `پرامپت ${system.length} نویسه`);
  assert.match(user, /سیمان تیپ ۲/);
  assert.match(user, /at least 5 and up to 10/);
});

test("خروجی مدل بی‌کم‌وکاست منتقل می‌شود؛ فقط نوع فیلدها یکدست می‌شود", () => {
  const many = Array.from({ length: 12 }, (_, i) => sup({ name: `S${i}` }));
  many.push({ name: "", phones: "۰۹۱۲۱۲۳۴۵۶۷", emails: null, price: "۱۲۰ دلار", note: "فیلد اضافه" });
  many.push({ name: "با تلفن شیء", phones: [{ e164: "+982188000000" }, { verbatim: "٠٢١-٨٨" }], emails: [{ verbatim: "a@b.c" }], price: { text: "", unit: "تن" } });
  const r = shapeResult({ suppliers: many }, { item: "x", markets: ["ایران"], searches: 5, fetches: 4 });
  assert.equal(r.suppliers.length, 14, "بیش از ۱۰ هم باشد، همه می‌روند");
  const a = r.suppliers[12], b = r.suppliers[13];
  assert.equal(a.name, "");
  assert.deepEqual(a.phones, ["09121234567"]);
  assert.deepEqual(a.emails, []);
  assert.deepEqual(a.price, { text: "۱۲۰ دلار", unit: "" });
  assert.equal(a.note, "فیلد اضافه", "فیلدهای اضافهٔ مدل هم می‌مانند");
  assert.equal(a.type, "unknown");
  assert.deepEqual(b.phones, ["+982188000000", "021-88"]);
  assert.deepEqual(b.emails, ["a@b.c"]);
  assert.equal(b.price, null);
  assert.deepEqual(r.request.markets, ["ایران"]);
  assert.equal(r.request.searches_used, 5);
  assert.ok(!("summary_fa" in r) && !("excluded" in r));
});

test("نتیجهٔ ذخیره‌شدهٔ قدیمی (v1/v2) بی‌تغییر می‌گذرد", () => {
  const old = { name: "Old", location: { country: "Iran", city: "قم" }, phones: [{ e164: "+98912", type: "mobile" }], scores: { total: 70 } };
  const r = shapeResult({ request: { searches_used: 7 }, suppliers: [old] }, {});
  assert.deepEqual(r.suppliers[0], old);
  assert.equal(r.request.searches_used, 7);
});

test("درخواست: جستجوی مستقیم بدون فیلتر کد، بی سقف طول صفحه و هزینه؛ pause_turn عیناً ادامه می‌یابد", async () => {
  const bodies = [];
  const tool = { type: "server_tool_use", id: "srv_1", name: "web_search", input: { query: "سیمان فله تهران" } };
  const found = { type: "web_search_tool_result", tool_use_id: "srv_1", content: [{ type: "web_search_result", url: "https://arya.example", title: "آریا", encrypted_content: "x" }] };
  const six = Array.from({ length: 6 }, (_, i) => sup({ name: `تأمین‌کنندهٔ ${i + 1}` }));
  const out = await withFetch(() => runDiscovery(ENV, { item: "سیمان", markets: ["IR", "AM"] }), async (_url, init) => {
    const body = JSON.parse(init.body);
    bodies.push(body);
    if (bodies.length === 1) {
      return sse({ blocks: [tool, found], stop: "pause_turn",
        usage: { input_tokens: 1000, cache_creation_input_tokens: 60000, cache_read_input_tokens: 0, output_tokens: 500, server_tool_use: { web_search_requests: 5 } } });
    }
    return done(six);
  });
  assert.equal(bodies.length, 2);
  for (const b of bodies) {
    assert.equal(b.stream, true);
    assert.equal(b.max_tokens, 32000);
    assert.equal(b.tool_choice, undefined, "هیچ دوری بی‌ابزار نمی‌شود");
    assert.deepEqual(b.tools, [
      { type: "web_search_20250305", name: "web_search", max_uses: LIMITS.TOOL_BREAKER },
      { type: "web_fetch_20250910", name: "web_fetch", max_uses: LIMITS.TOOL_BREAKER },
    ]);
  }
  assert.deepEqual(bodies[1].messages[1], { role: "assistant", content: [tool, found] }, "پاسخ ناتمام عیناً برگشت");
  assert.equal(out.result.suppliers.length, 6);
  assert.deepEqual(out.result.request.markets, ["ایران", "ارمنستان"]);
  assert.deepEqual(out.usage, { input: 1200, output: 2000, cacheRead: 30000, cacheWrite: 60000, searches: 5, fetches: 0 });
  assert.equal(out.cost, runCost("claude-sonnet-5", out.usage));
});

test("SMART_SEARCH_FILTER=1: فیلتر پویا با نسخهٔ 20260318 و response_inclusion=excluded", async () => {
  let body;
  await withFetch(() => runDiscovery({ ...ENV, SMART_SEARCH_FILTER: "1" }, { item: "سیمان", markets: ["IR"] }), async (_u, init) => { body = JSON.parse(init.body); return done([sup()]); });
  assert.deepEqual(body.tools.map((t) => [t.type, t.response_inclusion]), [["web_search_20260318", "excluded"], ["web_fetch_20260318", "excluded"]]);
});

test("خطاها: میانهٔ جریان، قطع پیش از پایان، کلید نامعتبر، و پاسخ بی <result>", async () => {
  const run = (handler) => withFetch(() => runDiscovery(ENV, { item: "سیمان", markets: ["IR"] }), handler);
  const raw = (text) => async () => new Response(text, { status: 200, headers: { "content-type": "text/event-stream" } });
  await assert.rejects(run(raw(`event: error\ndata: ${JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } })}\n\n`)), /Overloaded/);
  await assert.rejects(run(raw(`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { usage: {} } })}\n\n`)), /پیش از پایان پاسخ قطع شد/);
  await assert.rejects(run(async () => new Response(JSON.stringify({ error: { message: "invalid x-api-key" } }), { status: 401 })), /invalid x-api-key/);
  await assert.rejects(run(async () => sse({ blocks: [{ type: "text", text: "no json" }], stop: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } })), /قالب <result> نداشت/);
  await assert.rejects(run(async () => sse({ blocks: [{ type: "text", text: "<result>{\"suppl" }], stop: "max_tokens", usage: { input_tokens: 1, output_tokens: 1 } })), /نیمه ماند/);
});
