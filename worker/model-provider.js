const clone = (value) => JSON.parse(JSON.stringify(value));
const textOf = (response) => response.clone().text().catch(() => "");

function stripCache(value) {
  if (Array.isArray(value)) return value.map(stripCache);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) if (key !== "cache_control") out[key] = stripCache(item);
  return out;
}
function schemaPrompt(schema) {
  return `\n\nRespond with only valid JSON matching this JSON Schema. Do not wrap it in Markdown.\n${JSON.stringify(schema)}`;
}
function appendSystem(body, text) {
  if (Array.isArray(body.system)) body.system.push({ type: "text", text });
  else body.system = `${body.system || ""}${text}`;
}
function compatibleBody(body, full) {
  const out = stripCache(clone(body));
  delete out.thinking;
  delete out.fallbacks;
  if (out.output_config) {
    delete out.output_config.effort;
    if (full) {
      const schema = out.output_config.format && out.output_config.format.schema;
      if (schema) appendSystem(out, schemaPrompt(schema));
      delete out.output_config;
    }
  }
  if (full) {
    delete out.top_k;
    delete out.context_management;
  }
  return out;
}
function retryable(status, text) {
  return (status === 400 || status === 422) && /support|unknown|invalid|unrecognized|unexpected|extra|field|parameter|schema|thinking|cache|output_config/i.test(text);
}
function customHeaders(env, headers) {
  const out = new Headers(headers || {});
  if (env.AI_CUSTOM_PROVIDER === "1" && env.ANTHROPIC_API_KEY) {
    if (!out.has("authorization")) out.set("authorization", `Bearer ${env.ANTHROPIC_API_KEY}`);
    if (!out.has("x-api-key")) out.set("x-api-key", env.ANTHROPIC_API_KEY);
  }
  return out;
}

export function normalizeModelBase(value) {
  return String(value || "").trim().replace(/\/+$/, "").replace(/\/v1$/i, "");
}

export async function modelFetch(env, url, init = {}) {
  if (!/\/v1\/messages(?:\?|$)/.test(String(url)) || typeof init.body !== "string") return fetch(url, init);
  let original;
  try { original = JSON.parse(init.body); } catch (_) { return fetch(url, init); }
  if (env.AI_CUSTOM_PROVIDER !== "1") return fetch(url, init);
  if (env.AI_MODEL) original.model = env.AI_MODEL;
  const bodies = [original, compatibleBody(original, false), compatibleBody(original, true)];
  const headers = customHeaders(env, init.headers);
  for (let index = 0; index < bodies.length; index++) {
    const response = await fetch(url, { ...init, headers, body: JSON.stringify(bodies[index]) });
    if (index === bodies.length - 1 || !retryable(response.status, await textOf(response))) return response;
  }
}
