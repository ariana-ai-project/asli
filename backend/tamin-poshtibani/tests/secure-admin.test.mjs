import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import { withSecureConfig } from "../../../worker/secure-config.js";
import { legalRoute } from "../../../worker/legal.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست";
const env = {
  DB,
  MANAGER_CODE: "4321",
  TG_WEBHOOK_SECRET: "support-test-secret",
  CONFIG_ENCRYPTION_KEY: "11".repeat(32),
};
if (DB) await ensureSchema(env);

async function call(method, path, body, code = "4321") {
  const headers = {};
  if (code) headers["X-Site-Code"] = code;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await route(new Request(`https://example.test/tamin-poshtibani/api${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  }), env, { waitUntil() {} });
  return { status: response.status, data: await response.json() };
}
async function legal(method, path, { body, cookie, ws = "a".repeat(32) } = {}) {
  const headers = { "CF-Connecting-IP": "test-client" };
  if (body !== undefined) { headers["Content-Type"] = "application/json"; headers.Origin = "https://example.test"; }
  if (cookie) headers.Cookie = cookie;
  if (ws) headers["X-Legal-Ws"] = ws;
  const response = await legalRoute(new Request(`https://example.test/hoghooghi/api${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  }), env);
  return { status: response.status, data: await response.json(), cookie: response.headers.get("set-cookie") };
}

test("home admin configuration and legal username/password sessions", { skip: SKIP }, async () => {
  const initial = await call("GET", "/site/access");
  assert.equal(initial.status, 200);
  assert.equal(initial.data.encryption_ready, true);
  assert.equal(initial.data.legal_users.length, 0);
  assert.equal((await call("GET", "/site/access", undefined, "0000")).status, 401);

  const saved = await call("POST", "/site/access/save", {
    secrets: { ELEVENLABS_API_KEY: "eleven-private-test", TG_BOT_TOKEN: "telegram-private-test" },
    providers: [{ id: "main", label: "سرویس سازگار", base_url: "https://anthropic-compatible.example", model: "provider-model-x", api_key: "model-private-test" }],
    active_provider: "main",
    eleven: { base_url: "https://eleven-compatible.example", model: "scribe-custom" },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.providers[0].key_configured, true);
  assert.equal(saved.data.providers[0].active, true);
  assert.ok(!JSON.stringify(saved.data).includes("private-test"), "API keys never return to the browser");

  const encrypted = DB.raw.prepare("SELECT value FROM secure_configs WHERE key='runtime'").get().value;
  assert.ok(!encrypted.includes("model-private-test") && !encrypted.includes("eleven-private-test"));
  const merged = await withSecureConfig(env);
  assert.equal(merged.ANTHROPIC_API_KEY, "model-private-test");
  assert.equal(merged.ANTHROPIC_API_BASE, "https://anthropic-compatible.example");
  assert.equal(merged.LEGAL_MODEL, "provider-model-x");
  assert.equal(merged.ELEVENLABS_API_KEY, "eleven-private-test");
  assert.equal(merged.STT_MODEL, "scribe-custom");

  const user = await call("POST", "/site/access/legal-user", {
    username: "Legal.User", password: "legal-strong-password", active: true,
  });
  assert.equal(user.status, 200);
  assert.equal(user.data.legal_users[0].username, "legal.user");
  assert.ok(!JSON.stringify(user.data).includes("legal-strong-password"));
  const storedUser = DB.raw.prepare("SELECT * FROM legal_users").get();
  assert.notEqual(storedUser.password_hash, "legal-strong-password");
  assert.ok(!JSON.stringify(storedUser).includes("legal-strong-password"));

  assert.equal((await legal("GET", "/chats")).status, 401);
  const bad = await legal("POST", "/login", { body: { username: "legal.user", password: "wrong-password" } });
  assert.equal(bad.status, 401);
  const login = await legal("POST", "/login", { body: { username: "legal.user", password: "legal-strong-password" } });
  assert.equal(login.status, 200);
  assert.match(login.cookie, /HttpOnly/);
  assert.match(login.cookie, /Secure/);
  const cookie = login.cookie.split(";", 1)[0];

  const session = await legal("GET", "/session", { cookie });
  assert.equal(session.status, 200);
  assert.equal(session.data.user.username, "legal.user");
  const chats = await legal("GET", "/chats", { cookie });
  assert.equal(chats.status, 200);
  assert.deepEqual(chats.data.chats, []);
  const health = await legal("GET", "/health", { ws: null });
  assert.equal(health.data.model, "provider-model-x");

  assert.equal((await legal("POST", "/logout", { body: {}, cookie })).status, 200);
  assert.equal((await legal("GET", "/session", { cookie })).status, 401);
});
