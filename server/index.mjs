import http from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import worker from "../worker.js";
import { createAssets } from "./assets.mjs";
import { openSqliteD1 } from "./sqlite-d1.mjs";

const GENERAL_CRON = "* * * * *";
const VOICE_CRON = "*/2 * * * *";

function executionContext(onError = console.error) {
  const promises = new Set();
  return {
    promises,
    waitUntil(promise) {
      const tracked = Promise.resolve(promise).catch((error) => onError("waitUntil failed", error));
      promises.add(tracked);
      tracked.finally(() => promises.delete(tracked));
    },
  };
}

function nodeRequest(req) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const item of value) headers.append(name, item);
    else if (value !== undefined) headers.set(name, value);
  }
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  if (!headers.has("cf-connecting-ip")) headers.set("cf-connecting-ip", forwarded || req.socket.remoteAddress || "local");
  const protocol = String(req.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
  const host = req.headers.host || "localhost";
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : Readable.toWeb(req);
  return new Request(`${protocol}://${host}${req.url}`, { method: req.method, headers, body, duplex: "half" });
}

async function nodeResponse(response, req, res) {
  const headers = {};
  response.headers.forEach((value, name) => { headers[name] = value; });
  if (typeof response.headers.getSetCookie === "function") {
    const cookies = response.headers.getSetCookie();
    if (cookies.length) headers["set-cookie"] = cookies;
  }
  res.writeHead(response.status, headers);
  if (req.method === "HEAD" || !response.body) { res.end(); return; }
  const stream = Readable.fromWeb(response.body);
  stream.on("error", (error) => { console.error("response stream failed", error); res.destroy(error); });
  stream.pipe(res);
}

export function createNodeServer(options = {}) {
  const db = options.db || openSqliteD1(options.databasePath || process.env.DATABASE_PATH || resolve("data/asli.sqlite"));
  const assets = createAssets(options.assetsDirectory || process.env.ASSETS_DIRECTORY || resolve("frontend"));
  const env = { ...process.env, ...options.env, DB: db, ASSETS: assets };
  const pending = new Set();
  let timer = null;
  let schedulerRunning = false;
  let closed = false;

  async function handle(req, res) {
    const ctx = executionContext();
    try {
      const request = nodeRequest(req);
      const response = await assets.match(request) || await worker.fetch(request, env, ctx);
      await nodeResponse(response, req, res);
    } catch (error) {
      console.error("request failed", error);
      if (!res.headersSent) await nodeResponse(new Response("Internal Server Error", { status: 500 }), req, res);
      else res.destroy(error);
    } finally {
      for (const promise of ctx.promises) {
        pending.add(promise);
        promise.finally(() => pending.delete(promise));
      }
    }
  }

  const server = http.createServer((req, res) => { void handle(req, res); });

  async function runScheduled(cron, scheduledTime = Date.now()) {
    const ctx = executionContext();
    await worker.scheduled({ cron, scheduledTime }, env, ctx);
    await Promise.allSettled([...ctx.promises]);
  }

  function startScheduler() {
    if (timer || closed) return;
    const schedule = () => {
      timer = setTimeout(async () => {
        timer = null;
        if (closed) return;
        if (schedulerRunning) { schedule(); return; }
        schedulerRunning = true;
        const at = new Date();
        at.setSeconds(0, 0);
        try {
          await runScheduled(GENERAL_CRON, at.getTime());
          if (at.getMinutes() % 2 === 0) await runScheduled(VOICE_CRON, at.getTime());
        } catch (error) { console.error("scheduled run failed", error); }
        finally { schedulerRunning = false; if (!closed) schedule(); }
      }, 60_000 - (Date.now() % 60_000) + 100);
    };
    schedule();
  }

  async function close() {
    closed = true;
    if (timer) clearTimeout(timer);
    if (server.listening) await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
    await Promise.allSettled([...pending]);
    db.close();
  }

  return { server, env, db, runScheduled, startScheduler, close };
}

async function main() {
  const app = createNodeServer();
  const host = process.env.HOST || "127.0.0.1";
  const port = Number(process.env.PORT || 8787);
  if (process.env.SCHEDULER !== "off") app.startScheduler();
  await new Promise((resolveListen, reject) => {
    app.server.once("error", reject);
    app.server.listen(port, host, resolveListen);
  });
  console.log(`asli listening on http://${host}:${port}`);
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    try { await app.close(); process.exitCode = 0; }
    catch (error) { console.error("shutdown failed", error); process.exitCode = 1; }
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
