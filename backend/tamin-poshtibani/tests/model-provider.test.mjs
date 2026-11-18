import test from "node:test";
import assert from "node:assert/strict";
import { modelFetch, normalizeModelBase } from "../../../worker/model-provider.js";

const env = { AI_MODEL: "gpt-test-model", AI_CUSTOM_PROVIDER: "1", ANTHROPIC_API_KEY: "private-model-test" };
const requestBody = () => ({
  model: "claude-original",
  max_tokens: 100,
  system: [{ type: "text", text: "ORIGINAL SYSTEM PROMPT", cache_control: { type: "ephemeral" } }],
  messages: [{ role: "user", content: "ORIGINAL USER MESSAGE" }],
  thinking: { type: "adaptive" },
  output_config: { effort: "high", format: { type: "json_schema", schema: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"] } } },
});

test("model provider normalizes AvalAI base URLs", () => {
  assert.equal(normalizeModelBase("https://api.avalai.ir/v1/"), "https://api.avalai.ir");
  assert.equal(normalizeModelBase("https://api.anthropic.com"), "https://api.anthropic.com");
});

test("model provider keeps prompts and retries optional Anthropic capabilities", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      if (calls.length < 3) return new Response(JSON.stringify({ error: { message: "unsupported output_config parameter" } }), { status: 400 });
      return new Response(JSON.stringify({ content: [{ type: "text", text: '{"answer":"ok"}' }] }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const response = await modelFetch(env, "https://api.avalai.ir/v1/messages", {
      method: "POST", headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY }, body: JSON.stringify(requestBody()),
    });
    assert.equal(response.status, 200);
    assert.equal(calls.length, 3);
    assert.equal(calls[0].body.model, "gpt-test-model");
    assert.equal(calls[0].body.system[0].text, "ORIGINAL SYSTEM PROMPT");
    assert.deepEqual(calls[2].body.messages, [{ role: "user", content: "ORIGINAL USER MESSAGE" }]);
    assert.equal(calls[2].body.system[0].text, "ORIGINAL SYSTEM PROMPT");
    assert.match(calls[2].body.system.at(-1).text, /JSON Schema/);
    assert.equal(calls[2].body.output_config, undefined);
    assert.equal(calls[2].body.thinking, undefined);
    assert.equal(calls[2].body.system[0].cache_control, undefined);
    assert.equal(calls[0].init.headers.get("authorization"), "Bearer private-model-test");
  } finally { globalThis.fetch = originalFetch; }
});
