/* ============================================================
   تست API بخش حقوقی (worker/legal.js) — node:test، D1 روی node:sqlite، مدل بدلی

   اجرا:  node --test backend/hoghooghi/tests/

   مدل انتروپیک این‌جا یک fetch بدلی است که درخواست‌ها را نگه می‌دارد و پاسخ جریانی،
   Files API، شمارش توکن و «نگه‌دارندهٔ حافظه» را شبیه‌سازی می‌کند. حافظهٔ بدلی هر نوبت را
   با یک نشان «[نوبت N]» به حافظهٔ قبلی می‌افزاید تا گم‌نشدن نوبت‌ها سنجیده شود.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "../../tamin-poshtibani/tests/run.mjs";
import * as L from "../../../worker/legal.js";
import { CHAT_SYSTEM, REPORT_SCHEMA, DRAFT_SCHEMA, MEMORY_HARD } from "../../../worker/legal-prompts.js";

/* Workers ‌FixedLengthStream در Node نیست؛ برای تست یک TransformStream کافی است */
globalThis.FixedLengthStream = class {
  constructor(n) { const ts = new TransformStream(); this.readable = ts.readable; this.writable = ts.writable; this.expected = n; }
};

const WS = "0123456789abcdef0123456789abcdef";
const WS2 = "fedcba9876543210fedcba9876543210";
const HOST = "https://arianaai.website";

/* ------------------------------------------------------------------ */
/* مدل بدلی                                                             */
/* ------------------------------------------------------------------ */
const M = {
  calls: [],          /* همهٔ درخواست‌ها: {method, path, body, headers} */
  files: new Map(),   /* file_id → {bytes, mime} */
  deleted: [],
  nextFile: 1,
  answer: (req) => `پاسخ آزمایشی به: ${lastUserText(req)}`,
  memoryPad: 0,       /* نویسهٔ اضافه در حافظه، برای آزمون فشرده‌سازی */
  fail: null,         /* {status, body} برای درخواست بعدی پیام */
  usage: { input_tokens: 900, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 120 },
};

function lastUserText(req) {
  const u = [...req.messages].reverse().find((m) => m.role === "user");
  const texts = u.content.filter((c) => c.type === "text").map((c) => c.text);
  return texts[texts.length - 1];
}

const sse = (events) => new ReadableStream({
  start(c) {
    const enc = new TextEncoder();
    for (const e of events) c.enqueue(enc.encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`));
    c.close();
  },
});

async function mockFetch(url, init = {}) {
  const u = new URL(typeof url === "string" ? url : url.url);
  const method = (init.method || "GET").toUpperCase();
  const headers = Object.fromEntries(new Headers(init.headers || {}).entries());
  let body = null, raw = null;
  if (init.body != null) {
    raw = new Uint8Array(await new Response(init.body).arrayBuffer());
    if ((headers["content-type"] || "").includes("json")) body = JSON.parse(new TextDecoder().decode(raw));
  }
  M.calls.push({ method, path: u.pathname, body, headers, raw });
  assert.equal(u.origin, "http://mock.anthropic", "همهٔ درخواست‌ها باید به ANTHROPIC_API_BASE بروند");
  assert.equal(headers["x-api-key"], "test-key");
  assert.equal(headers["anthropic-version"], "2023-06-01");

  if (u.pathname === "/v1/files" && method === "POST") {
    const text = new TextDecoder("latin1").decode(raw);
    const m = /^--(\S+)\r\nContent-Disposition: form-data; name="file"; filename="([^"]+)"\r\nContent-Type: ([^\r]+)\r\n\r\n/.exec(text);
    assert.ok(m, "سرآغاز multipart");
    const boundary = headers["content-type"].split("boundary=")[1];
    assert.equal(m[1], boundary);
    const tail = `\r\n--${boundary}--\r\n`;
    assert.ok(text.endsWith(tail), "پایان multipart");
    const bytes = raw.slice(m[0].length, raw.length - tail.length);
    const id = `file_${M.nextFile++}`;
    M.files.set(id, { bytes, mime: m[3], filename: m[2] });
    return Response.json({ id, type: "file", mime_type: m[3], size_bytes: bytes.length });
  }
  if (u.pathname.startsWith("/v1/files/") && method === "DELETE") {
    M.deleted.push(decodeURIComponent(u.pathname.slice("/v1/files/".length)));
    return Response.json({ id: "x", type: "file_deleted" });
  }
  if (u.pathname === "/v1/messages/count_tokens") {
    return Response.json({ input_tokens: 1508 });
  }
  if (u.pathname === "/v1/models/claude-sonnet-5") {
    return Response.json({ id: "claude-sonnet-5", max_input_tokens: 1000000, max_tokens: 128000 });
  }
  if (u.pathname === "/v1/messages" && method === "POST") {
    if (M.fail) { const f = M.fail; M.fail = null; return Response.json(f.body, { status: f.status }); }
    if (body.stream) {
      const text = M.answer(body);
      const half = Math.ceil(text.length / 2);
      return new Response(sse([
        { type: "message_start", message: { id: "msg_1", usage: { ...M.usage, output_tokens: 1 } } },
        { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
        { type: "content_block_stop", index: 0 },
        { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: text.slice(0, half) } },
        { type: "ping" },
        { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: text.slice(half) } },
        { type: "content_block_stop", index: 1 },
        { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: M.usage.output_tokens } },
        { type: "message_stop" },
      ]), { headers: { "content-type": "text/event-stream" } });
    }
    const fmt = body.output_config && body.output_config.format;
    if (fmt && fmt.schema && fmt.schema.properties.title) {
      /* نگه‌دارندهٔ حافظه: حافظهٔ فعلی + یک سطر برای هر نوبت تازه */
      const blocks = body.messages[0].content;
      const cur = /حافظهٔ فعلی گفت‌وگو:\n([\s\S]*?)\n\nعنوان فعلی/.exec(blocks[0].text)[1];
      const base = cur.startsWith("(خالی") ? "## موضوع و هدف گفت‌وگو\nآزمون" : cur;
      const turns = blocks.filter((b) => b.type === "text" && /^──── نوبت (\d+)/.test(b.text)).map((b) => /^──── نوبت (\d+)/.exec(b.text)[1]);
      const files = blocks.filter((b) => b.type === "document" || b.type === "image").map((b) => b.source.file_id);
      const lines = turns.map((n) => `- [نوبت ${n}]${files.length ? ` فایل‌ها: ${files.join("،")}` : ""}`).join("\n");
      const memory = `${base}\n${lines}${M.memoryPad ? "\n" + "ز".repeat(M.memoryPad) : ""}`;
      return Response.json({ content: [{ type: "text", text: JSON.stringify({ title: `عنوان پس از نوبت ${turns[turns.length - 1]}`, memory }) }], stop_reason: "end_turn", usage: { input_tokens: 500, output_tokens: 200 } });
    }
    if (fmt && fmt.schema && fmt.schema.properties.memory) {
      const src = body.messages[0].content[0].text;
      const kept = src.split("\n").filter((l) => !/^ز+$/.test(l)).slice(1).join("\n").trim();
      return Response.json({ content: [{ type: "text", text: JSON.stringify({ memory: kept }) }], stop_reason: "end_turn", usage: { input_tokens: 300, output_tokens: 100 } });
    }
    throw new Error("درخواست پیش‌بینی‌نشده به مدل بدلی");
  }
  throw new Error(`مسیر ناشناخته در مدل بدلی: ${method} ${u.pathname}`);
}
globalThis.fetch = mockFetch;

/* ------------------------------------------------------------------ */
/* ابزار تست                                                            */
/* ------------------------------------------------------------------ */
let env;
async function freshEnv() {
  const DB = await sqliteD1();
  L.resetLegalSchemaFlag();
  env = { DB, ANTHROPIC_API_KEY: "test-key", ANTHROPIC_API_BASE: "http://mock.anthropic" };
  M.calls.length = 0; M.deleted.length = 0; M.memoryPad = 0; M.fail = null; M.nextFile = 1; M.files.clear();
  return env;
}

function req(method, path, { json, body, headers = {}, ws = WS, origin = HOST } = {}) {
  const h = { "X-Legal-Ws": ws, ...(origin ? { Origin: origin } : {}), ...headers };
  const init = { method, headers: h };
  if (json !== undefined) { init.body = JSON.stringify(json); h["content-type"] = "application/json"; }
  if (body !== undefined) { init.body = body; init.duplex = "half"; }
  return new Request(HOST + "/hoghooghi/api" + path, init);
}
const call = (r) => L.legalRoute(r, env);
const asJson = async (res) => ({ status: res.status, data: await res.json() });

/** جریان SSE پاسخ را مثل مرورگر می‌خواند */
async function readSse(res) {
  const text = await res.text();
  let out = "", stop = null, usage = null, complete = false;
  for (const chunk of text.split("\n\n")) {
    const line = chunk.split("\n").find((l) => l.startsWith("data:"));
    if (!line) continue;
    const d = JSON.parse(line.slice(5));
    if (d.type === "message_start") usage = d.message.usage;
    if (d.type === "content_block_delta" && d.delta.type === "text_delta") out += d.delta.text;
    if (d.type === "message_delta") { stop = d.delta.stop_reason; usage = { ...usage, ...d.usage }; }
    if (d.type === "message_stop") complete = true;
  }
  return { text: out, stop, usage, complete };
}

async function upload(name, mime, bytes, purpose = "chat", ws = WS) {
  const res = await call(req("POST", `/files?purpose=${purpose}&src=${name.split(".").pop()}`, {
    body: bytes, ws,
    headers: { "content-type": mime, "content-length": String(bytes.length), "X-File-Name": encodeURIComponent(name) },
  }));
  return asJson(res);
}

const lastModelCall = (pred = () => true) => [...M.calls].reverse().find((c) => c.path === "/v1/messages" && pred(c.body));
const stripCache = (x) => JSON.parse(JSON.stringify(x, (k, v) => (k === "cache_control" ? undefined : v)));

/** یک نوبت کامل گفت‌وگو مثل مرورگر: send ← خواندن جریان ← ذخیره ← حافظه */
async function turn(chatId, text, files = [], { memory = true } = {}) {
  const res = await call(req("POST", `/chats/${chatId}/send`, { json: { text, files } }));
  assert.equal(res.status, 200, "send");
  const id = res.headers.get("x-chat-id"), seq = Number(res.headers.get("x-turn")), callId = res.headers.get("x-call");
  const r = await readSse(res);
  assert.ok(r.complete);
  const saved = await asJson(await call(req("POST", `/chats/${id}/commit`, { json: { seq, text: r.text, stop: r.stop, usage: r.usage, call: Number(callId), memory: false } })));
  assert.equal(saved.data.state, "done");
  let mem = null;
  if (memory) mem = await asJson(await call(req("POST", `/chats/${id}/memory/refresh`, { json: {} })));
  return { id, seq, answer: r.text, mem: mem && mem.data };
}

/* ------------------------------------------------------------------ */
test("طرح، سلامت و دسترسی", async () => {
  await freshEnv();
  let r = await asJson(await call(new Request(HOST + "/hoghooghi/api/health")));
  assert.deepEqual([r.status, r.data.ok, r.data.model, r.data.key], [200, true, "claude-sonnet-5", true]);
  r = await asJson(await call(new Request(HOST + "/hoghooghi/api/health?deep=1")));
  assert.equal(r.data.deep.status, "ok");
  assert.equal(r.data.deep.max_tokens, 128000);

  r = await asJson(await call(req("GET", "/chats", { ws: "bad" })));
  assert.equal(r.status, 400);
  r = await asJson(await call(req("POST", "/chats/new/send", { json: { text: "x" }, origin: "https://evil.example" })));
  assert.equal(r.status, 403);
  r = await asJson(await call(req("GET", "/chats")));
  assert.deepEqual(r.data, { chats: [] });

  const noKey = { ...env, ANTHROPIC_API_KEY: "" };
  r = await asJson(await L.legalRoute(req("POST", "/chats/new/send", { json: { text: "سلام" } }), noKey));
  assert.equal(r.status, 503);
  assert.match(r.data.error, /ANTHROPIC_API_KEY/);
});

test("بارگذاری جریانی فایل به Files API", async () => {
  await freshEnv();
  const pdf = new TextEncoder().encode("%PDF-1.7\nقرارداد آزمایشی\n%%EOF");
  const r = await upload("قرارداد پیمان.pdf", "application/pdf", pdf, "analyze");
  assert.equal(r.status, 200);
  assert.equal(r.data.name, "قرارداد پیمان.pdf", "نام فارسی از هدر درصدرمزشده");
  assert.equal(r.data.mime, "application/pdf");
  assert.equal(r.data.tok, L.estFileTok("application/pdf", pdf.length), "برآورد توکن از حجم");
  assert.equal(L.estFileTok("text/plain", 3000), 1000);
  assert.equal(L.estFileTok("image/png", 4e6), 1600);
  const stored = M.files.get("file_1");
  assert.deepEqual([...stored.bytes], [...pdf], "بایت‌ها دست‌نخورده رسیدند");
  assert.equal(stored.filename, "upload.pdf", "نام ASCII در multipart");
  const row = await env.DB.prepare("SELECT * FROM legal_files WHERE id=?").bind(r.data.id).first();
  assert.equal(row.file_id, "file_1");
  assert.equal(row.purpose, "analyze");
  assert.ok(!M.calls.some((c) => c.path === "/v1/messages/count_tokens"), "count_tokens منبع فایل را نمی‌پذیرد؛ صدا زده نمی‌شود");

  let bad = await upload("a.zip", "application/zip", new Uint8Array([1, 2, 3]));
  assert.equal(bad.status, 415);
  bad = await upload("big.png", "image/png", new Uint8Array(5 * 1024 * 1024 + 1));
  assert.equal(bad.status, 413);
  bad = await asJson(await call(req("POST", "/files?purpose=nope", { body: pdf, headers: { "content-type": "application/pdf", "content-length": String(pdf.length) } })));
  assert.equal(bad.status, 400);
});

test("تحلیلگر آریانا: Sonnet 5، خروجی ساختاریافته، ۱۲۸ هزار توکن، جریان مستقیم", async () => {
  await freshEnv();
  const f = (await upload("سند.pdf", "application/pdf", new Uint8Array([37, 80, 68, 70]), "analyze")).data;
  const res = await call(req("POST", "/analyze", { json: { question: "ریسک‌ها را بگو", files: [f.id] } }));
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/event-stream/);
  assert.ok(Number(res.headers.get("x-call")) > 0);
  const out = await readSse(res);
  assert.ok(out.complete);
  const b = lastModelCall().body;
  assert.equal(b.model, "claude-sonnet-5");
  assert.equal(b.max_tokens, 128000);
  assert.equal(b.stream, true);
  assert.deepEqual(b.thinking, { type: "adaptive" });
  assert.equal(b.output_config.effort, "high");
  assert.deepEqual(b.output_config.format, { type: "json_schema", schema: REPORT_SCHEMA });
  const doc = b.messages[0].content[0];
  assert.deepEqual(doc.source, { type: "file", file_id: "file_1" });
  assert.equal(doc.title, "سند.pdf");
  assert.deepEqual(doc.cache_control, { type: "ephemeral" });
  assert.match(b.messages[0].content[1].text, /ریسک‌ها را بگو/);
  assert.ok(!("temperature" in b) && !("top_p" in b), "Sonnet 5 پارامتر نمونه‌گیری نمی‌پذیرد");

  /* فایل مال فضای دیگر پذیرفته نمی‌شود */
  const other = await asJson(await call(req("POST", "/analyze", { json: { files: [f.id] }, ws: WS2 })));
  assert.equal(other.status, 404);
  /* گزارش مصرف */
  await call(req("POST", "/usage", { json: { call: Number(res.headers.get("x-call")), usage: { input_tokens: 1000, output_tokens: 2000 } } }));
  const c = await env.DB.prepare("SELECT * FROM legal_calls WHERE id=?").bind(Number(res.headers.get("x-call"))).first();
  assert.equal(c.out_tokens, 2000);
  assert.ok(Math.abs(c.cost_usd - (1000 * 2 + 2000 * 10) / 1e6) < 1e-9);
});

test("پیش‌نویس: برچسب قراردادهای مرجع و پیش‌نویس", async () => {
  await freshEnv();
  const r1 = (await upload("مرجع اول.pdf", "application/pdf", new Uint8Array([1]), "draft")).data;
  const r2 = (await upload("مرجع دوم.txt", "text/plain", new TextEncoder().encode("ماده ۱"), "draft")).data;
  const d = (await upload("پیش‌نویس.pdf", "application/pdf", new Uint8Array([2]), "draft")).data;
  let bad = await asJson(await call(req("POST", "/draft", { json: { references: [r1.id, d.id], draft: d.id } })));
  assert.equal(bad.status, 400);
  bad = await asJson(await call(req("POST", "/draft", { json: { references: [r1.id], draft: "" } })));
  assert.equal(bad.status, 400);
  const res = await call(req("POST", "/draft", { json: { references: [r1.id, r2.id], draft: d.id, question: "تمرکز بر فسخ" } }));
  assert.equal(res.status, 200);
  await res.text();
  const b = lastModelCall().body;
  assert.deepEqual(b.output_config.format.schema, DRAFT_SCHEMA);
  const c = b.messages[0].content;
  assert.equal(c[0].text, "قرارداد مرجع شماره 1 (فایل: مرجع اول.pdf):");
  assert.equal(c[1].title, "قرارداد مرجع شماره 1 — مرجع اول.pdf");
  assert.equal(c[3].title, "قرارداد مرجع شماره 2 — مرجع دوم.txt");
  assert.equal(c[4].text, "قرارداد پیش‌نویس در حال بررسی (فایل: پیش‌نویس.pdf):");
  assert.deepEqual(c[5].cache_control, { type: "ephemeral" });
  assert.match(c[6].text, /تمرکز بر فسخ/);
});

test("گفت‌وگو: حافظهٔ هر گفت‌وگو، پیشوند ثابت برای کش، فایل در حافظه", async () => {
  await freshEnv();
  /* نوبت ۱ — گفت‌وگوی تازه */
  const t1 = await turn("new", "مهلت اعتراض به رأی بدوی چقدر است؟");
  assert.equal(t1.seq, 1);
  const req1 = lastModelCall((b) => b.stream).body;
  assert.equal(req1.model, "claude-sonnet-5");
  assert.equal(req1.max_tokens, 128000);
  assert.equal(req1.system[0].text, CHAT_SYSTEM);
  assert.deepEqual(req1.system[0].cache_control, { type: "ephemeral", ttl: "1h" });
  assert.equal(req1.messages.length, 1);
  assert.match(req1.messages[0].content[0].text, /^تاریخ امروز: /, "نوبت اول حافظه ندارد، فقط تاریخ");
  assert.equal(req1.messages[0].content[1].text, "مهلت اعتراض به رأی بدوی چقدر است؟");
  assert.match(t1.mem.title, /عنوان پس از نوبت 1/);
  let chat = await env.DB.prepare("SELECT * FROM legal_chats WHERE id=?").bind(t1.id).first();
  assert.equal(chat.memory_seq, 1);
  assert.match(chat.memory, /\[نوبت 1\]/);

  /* نوبت ۲ — با فایل */
  const f = (await upload("اخطاریه.pdf", "application/pdf", new Uint8Array([9, 9]), "chat")).data;
  const t2 = await turn(t1.id, "این اخطاریه را بررسی کن", [f.id]);
  assert.equal(t2.seq, 2);
  const req2 = lastModelCall((b) => b.stream).body;
  assert.equal(req2.messages.length, 3);
  assert.deepEqual(req2.messages[0].content.map((c) => c.type), ["text"], "نوبت تکراری بدون حافظه و تاریخ");
  assert.equal(req2.messages[0].content[0].text, "مهلت اعتراض به رأی بدوی چقدر است؟");
  assert.equal(req2.messages[1].role, "assistant");
  assert.equal(req2.messages[1].content[0].text, t1.answer);
  assert.deepEqual(req2.messages[1].content[0].cache_control, { type: "ephemeral", ttl: "1h" });
  const cur = req2.messages[2].content;
  assert.equal(cur[0].type, "document");
  assert.deepEqual(cur[0].cache_control, { type: "ephemeral", ttl: "1h" }, "فایل تازه کش می‌شود");
  assert.match(cur[1].text, /حافظهٔ گفت‌وگو/);
  assert.match(cur[1].text, /\[نوبت 1\]/, "حافظهٔ نوبت ۱ در پیام تازه");
  assert.equal(cur[2].text, "این اخطاریه را بررسی کن");
  /* حافظهٔ نوبت ۲ فایل را هم دید */
  const memReq = lastModelCall((b) => !b.stream && b.output_config.format.schema.properties.title).body;
  const mc = memReq.messages[0].content;
  assert.match(mc[0].text, /\[نوبت 1\]/, "حافظهٔ قبلی به مدل حافظه داده شد");
  assert.ok(mc.some((c) => c.type === "document" && c.source.file_id === "file_1"), "فایل در ورودی حافظه");
  assert.ok(mc.some((c) => c.type === "text" && /پاسخ دستیار در نوبت 2/.test(c.text)));
  assert.equal(memReq.output_config.effort, "low");
  chat = await env.DB.prepare("SELECT * FROM legal_chats WHERE id=?").bind(t1.id).first();
  assert.match(chat.memory, /\[نوبت 2\] فایل‌ها: file_1/);

  /* نوبت ۳ — پیشوند درخواست باید همان پیشوند نوبت ۲ باشد (فقط نشان کش جابه‌جا شود) */
  await turn(t1.id, "حالا پاسخ رسمی بنویس");
  const req3 = lastModelCall((b) => b.stream).body;
  assert.deepEqual(stripCache(req3.system), stripCache(req2.system));
  assert.deepEqual(stripCache(req3.messages.slice(0, 2)), stripCache(req2.messages.slice(0, 2)));
  /* پیام کاربرِ نوبت ۲ در تکرار: تا بلوک فایل همان است که نوبت پیش فرستاده شد */
  assert.deepEqual(stripCache(req3.messages[2].content[0]), stripCache(req2.messages[2].content[0]));
  assert.equal(req3.messages[2].content.length, 2, "در تکرار، حافظه و تاریخ نیست");
  const marks = JSON.stringify(req3).split('"cache_control"').length - 1;
  assert.ok(marks <= 4, "حداکثر چهار نقطهٔ کش");

  /* گفت‌وگوی دوم حافظهٔ جدای خودش را دارد */
  const other = await turn("new", "پرسش گفت‌وگوی دوم");
  const reqO = lastModelCall((b) => b.stream).body;
  assert.equal(reqO.messages.length, 1);
  assert.doesNotMatch(JSON.stringify(reqO), /نوبت 1\]|اخطاریه/, "هیچ اثری از گفت‌وگوی اول");
  const o = await env.DB.prepare("SELECT memory FROM legal_chats WHERE id=?").bind(other.id).first();
  assert.doesNotMatch(o.memory, /نوبت 2/);

  /* فهرست، خواندن، حافظه */
  const list = (await asJson(await call(req("GET", "/chats")))).data.chats;
  assert.equal(list.length, 2);
  const g = (await asJson(await call(req("GET", `/chats/${t1.id}`)))).data;
  assert.equal(g.turns.length, 3);
  assert.equal(g.turns[1].files[0].name, "اخطاریه.pdf");
  assert.ok(!("file_id" in g.turns[1].files[0]), "شناسهٔ فایل انتروپیک به مرورگر داده نمی‌شود");
  const mem = (await asJson(await call(req("GET", `/chats/${t1.id}/memory`)))).data;
  assert.equal(mem.memory_seq, 3);
  assert.equal(mem.done_seq, 3);
  assert.equal(mem.done_turns, 3);
  /* فضای کاری دیگر به این گفت‌وگو دسترسی ندارد */
  assert.equal((await call(req("GET", `/chats/${t1.id}`, { ws: WS2 }))).status, 404);
});

test("حافظه: نوبت عقب‌افتاده، به‌روزرسانی هم‌زمان و فشرده‌سازی", async () => {
  await freshEnv();
  const a = await turn("new", "نوبت یک", [], { memory: false });
  await turn(a.id, "نوبت دو", [], { memory: false });
  /* هنوز حافظه‌ای نیست؛ یک به‌روزرسانی هر دو نوبت را با هم می‌افزاید */
  let c = await env.DB.prepare("SELECT memory_seq FROM legal_chats WHERE id=?").bind(a.id).first();
  assert.equal(c.memory_seq, 0);
  await turn(a.id, "نوبت سه", [], { memory: false });
  /* دو به‌روزرسانی هم‌زمان: هیچ نوبتی گم نمی‌شود */
  const [x, y] = await Promise.all([
    call(req("POST", `/chats/${a.id}/memory/refresh`, { json: {} })),
    call(req("POST", `/chats/${a.id}/memory/refresh`, { json: {} })),
  ]);
  assert.equal(x.status, 200);
  assert.equal(y.status, 200);
  c = await env.DB.prepare("SELECT memory, memory_seq FROM legal_chats WHERE id=?").bind(a.id).first();
  assert.equal(c.memory_seq, 3);
  for (const n of [1, 2, 3]) assert.equal(c.memory.split(`[نوبت ${n}]`).length - 1, 1, `نوبت ${n} دقیقاً یک بار`);

  /* فشرده‌سازی: حافظهٔ بلندتر از سقف کوتاه می‌شود و نوبت‌ها می‌مانند */
  M.memoryPad = MEMORY_HARD + 500;
  const t4 = await turn(a.id, "نوبت چهار");
  assert.equal(t4.mem.compacted, true);
  c = await env.DB.prepare("SELECT memory, compactions FROM legal_chats WHERE id=?").bind(a.id).first();
  assert.equal(c.compactions, 1);
  assert.ok(c.memory.length < MEMORY_HARD);
  assert.match(c.memory, /\[نوبت 4\]/);
  M.memoryPad = 0;

  /* عنوانِ دستی را حافظه عوض نمی‌کند */
  await call(req("PATCH", `/chats/${a.id}`, { json: { title: "پروندهٔ سد" } }));
  await turn(a.id, "نوبت پنج");
  c = await env.DB.prepare("SELECT title FROM legal_chats WHERE id=?").bind(a.id).first();
  assert.equal(c.title, "پروندهٔ سد");
});

test("نوبت ناتمام کنار گذاشته می‌شود؛ خطای مدل روشن برمی‌گردد", async () => {
  await freshEnv();
  const a = await turn("new", "پرسش اول");
  /* پیام دوم فرستاده شد ولی مرورگر پاسخ را ذخیره نکرد (قطع شد) */
  const r = await call(req("POST", `/chats/${a.id}/send`, { json: { text: "پرسش ناتمام" } }));
  await r.text();
  await turn(a.id, "پرسش سوم");
  const b = lastModelCall((x) => x.stream).body;
  assert.doesNotMatch(JSON.stringify(b.messages), /پرسش ناتمام/, "نوبت ناتمام در درخواست نیست");
  assert.equal(b.messages.length, 3);
  const g = (await asJson(await call(req("GET", `/chats/${a.id}`)))).data;
  assert.deepEqual(g.turns.map((t) => t.state), ["done", "failed", "done"]);

  /* ذخیرهٔ متن خالی ← ناموفق */
  const r4 = await call(req("POST", `/chats/${a.id}/send`, { json: { text: "چهارم" } }));
  await r4.text();
  const empty = await asJson(await call(req("POST", `/chats/${a.id}/commit`, { json: { seq: 4, text: "  ", memory: false } })));
  assert.equal(empty.data.state, "failed");

  /* خطای اعتبار حساب */
  M.fail = { status: 400, body: { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } } };
  const e = await asJson(await call(req("POST", "/chats/new/send", { json: { text: "سلام" } })));
  assert.equal(e.status, 503);
  assert.equal(e.data.code, "credit");
  assert.ok(e.data.chat, "شناسهٔ گفت‌وگوی ساخته‌شده برمی‌گردد");
  const st = await env.DB.prepare("SELECT state FROM legal_turns WHERE chat_id=?").bind(e.data.chat).first();
  assert.equal(st.state, "failed");
  assert.equal(L.modelError(401, {}).extra.code, "key");
  assert.equal(L.modelError(529, {}).extra.code, "overloaded");
  assert.equal(L.modelError(400, { error: { message: "prompt is too long: 1200000 tokens > 1000000 maximum" } }).extra.code, "context");
});

test("تاشدگی: نوبت‌های قدیمی بیرون، فایل‌ها سنجاق، هرگز جلوتر از حافظه", () => {
  const f = (id, tok) => ({ id, file_id: `file_${id}`, name: `${id}.pdf`, mime: "application/pdf", tok });
  const turns = [
    { seq: 1, q: "a", a: "b", tok: 60000, files_json: JSON.stringify([f("p1", 50000)]) },
    { seq: 2, q: "c", a: "d", tok: 200000, files_json: JSON.stringify([f("p2", 190000)]) },
    { seq: 3, q: "e", a: "f", tok: 30000, files_json: "[]" },
    { seq: 4, q: "g", a: "h", tok: 30000, files_json: "[]" },
    { seq: 5, q: "i", a: "j", tok: 30000, files_json: JSON.stringify([f("p5", 20000)]) },
  ];
  assert.equal(L.planFold({ ctx_tokens: L.FOLD_AT - 1, memory_seq: 5, fold_seq: 0 }, turns), null, "زیر آستانه تا نمی‌شود");
  const p = L.planFold({ ctx_tokens: L.FOLD_AT + 1, memory_seq: 5, fold_seq: 0, pins_json: null }, turns);
  assert.equal(p.fold, 3, "سه نوبت آخر ۹۰ هزار توکن است (> ۸۰ هزار)، پس فقط ۴ و ۵ خام می‌مانند");
  assert.deepEqual(p.remaining.map((t) => t.seq), [4, 5]);
  assert.deepEqual(p.pins.map((x) => x.id), ["p1"], "p2 از سقف سنجاق بزرگ‌تر است");
  /* حافظه فقط تا نوبت ۱ است ← تاشدگی از ۱ جلوتر نمی‌رود */
  const q = L.planFold({ ctx_tokens: L.FOLD_AT + 1, memory_seq: 1, fold_seq: 0 }, turns);
  assert.equal(q.fold, 1);
  /* تک‌نوبت بزرگ: دست‌کم نوبت آخر می‌ماند */
  const big = [{ seq: 7, q: "x", a: "y", tok: 900000, files_json: "[]" }];
  assert.equal(L.planFold({ ctx_tokens: 950000, memory_seq: 7, fold_seq: 6 }, big), null);
});

test("تاشدگی در عمل: درخواست کوتاه می‌شود و سنجاق‌ها اول می‌آیند", async () => {
  await freshEnv();
  const f1 = (await upload("قرارداد اصلی.pdf", "application/pdf", new Uint8Array([1]), "chat")).data;
  const a = await turn("new", "قرارداد را ببین", [f1.id]);
  for (let i = 2; i <= 8; i++) await turn(a.id, `پرسش ${i}`);
  /* نوبت آخر ورودی بسیار بزرگی گزارش کرد */
  await env.DB.prepare("UPDATE legal_chats SET ctx_tokens=? WHERE id=?").bind(L.FOLD_AT + 10, a.id).run();
  await env.DB.prepare("UPDATE legal_turns SET tok=40000 WHERE chat_id=?").bind(a.id).run();
  await turn(a.id, "پرسش نهم");
  const c = await env.DB.prepare("SELECT fold_seq, pins_json, memory_seq FROM legal_chats WHERE id=?").bind(a.id).first();
  assert.equal(c.fold_seq, 6, "دو نوبت آخر (۸۰ هزار) خام می‌مانند");
  assert.deepEqual(JSON.parse(c.pins_json).map((x) => x.id), [f1.id]);
  const b = lastModelCall((x) => x.stream).body;
  assert.equal(b.messages.length, 5, "نوبت ۷ و ۸ + پیام تازه");
  const first = b.messages[0].content;
  assert.equal(first[0].type, "document");
  assert.equal(first[0].title, "قرارداد اصلی.pdf");
  assert.match(first[1].text, /در بخش‌های پیشینِ همین گفت‌وگو پیوست شده بودند/);
  assert.equal(first[2].text, "پرسش 7");
  assert.match(b.messages[4].content[0].text, /\[نوبت 8\]/, "حافظه همهٔ نوبت‌های تاشده را دارد");
  /* نوبت بعد: همان پیشوند (کش پس از تاشدگی دوباره می‌خورد) */
  await env.DB.prepare("UPDATE legal_chats SET ctx_tokens=1000 WHERE id=?").bind(a.id).run();
  await turn(a.id, "پرسش دهم");
  const b2 = lastModelCall((x) => x.stream).body;
  assert.equal(b2.messages.length, 7);
  assert.deepEqual(stripCache(b2.messages.slice(0, 4)), stripCache(b.messages.slice(0, 4)));
});

test("حذف گفت‌وگو فایل‌هایش را هم در انتروپیک پاک می‌کند؛ پاک‌سازی دوره‌ای", async () => {
  await freshEnv();
  const f = (await upload("سند.pdf", "application/pdf", new Uint8Array([1]), "chat")).data;
  const a = await turn("new", "با فایل", [f.id]);
  const r = await asJson(await call(req("DELETE", `/chats/${a.id}`)));
  assert.equal(r.data.ok, true);
  assert.deepEqual(M.deleted, ["file_1"]);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM legal_turns").first()).n, 0);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM legal_files").first()).n, 0);

  const old = (await upload("کهنه.pdf", "application/pdf", new Uint8Array([1]), "analyze")).data;
  const fresh = (await upload("تازه.pdf", "application/pdf", new Uint8Array([1]), "analyze")).data;
  await env.DB.prepare("UPDATE legal_files SET created_at=? WHERE id=?").bind(Date.now() - 25 * 3600000, old.id).run();
  const out = await L.legalCleanup(env);
  assert.equal(out.removed, 1);
  assert.ok(M.deleted.includes("file_2"));
  assert.ok(await env.DB.prepare("SELECT id FROM legal_files WHERE id=?").bind(fresh.id).first());
});

test("سقف مصرف هر فضای کاری", async () => {
  await freshEnv();
  const keep = L.LIMITS.wsHour;
  L.LIMITS.wsHour = 2;
  try {
    const a = await turn("new", "یک", [], { memory: false });
    await turn(a.id, "دو", [], { memory: false });
    const r = await asJson(await call(req("POST", `/chats/${a.id}/send`, { json: { text: "سه" } })));
    assert.equal(r.status, 429);
    const other = await call(req("POST", "/chats/new/send", { json: { text: "فضای دیگر" }, ws: WS2 }));
    assert.equal(other.status, 200, "فضای کاری دیگر سهم خودش را دارد");
    await other.text();
  } finally {
    L.LIMITS.wsHour = keep;
  }
});

test("تاریخ امروز شمسی به وقت تهران", () => {
  /* ۲۱:۰۰ UTC روز ۲۶ سپتامبر = ۰۰:۳۰ بامداد یکشنبه ۵ مهر ۱۴۰۵ در تهران */
  const line = L.todayLine(Date.UTC(2026, 8, 26, 21, 0));
  assert.equal(line, "تاریخ امروز: یکشنبه ۵ مهر ۱۴۰۵ (2026-09-27)");
});
