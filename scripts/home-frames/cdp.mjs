// کمکِ کوچک برای Chrome بی‌سر: باز کردن، فرمان CDP، اجرای اسکریپت و عکس
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function chrome() {
  const port = 9300 + Math.floor(Math.random() * 190);
  const proc = spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", ["--headless=new", `--remote-debugging-port=${port}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), "hm-"))}`, "--hide-scrollbars", "--no-first-run", "about:blank"], { stdio: "ignore" });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let t;
  for (let i = 0; i < 40; i++) { try { t = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (t.some((x) => x.type === "page")) break; } catch {} await sleep(250); }
  const ws = new WebSocket(t.find((x) => x.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0; const pend = new Map(); const errs = [];
  ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    else if (m.method === "Runtime.exceptionThrown") errs.push(m.params.exceptionDetails.exception?.description?.slice(0, 200) || m.params.exceptionDetails.text); });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
    return r.result.exceptionDetails ? { error: r.result.exceptionDetails.exception?.description?.slice(0, 300) } : r.result.result.value; };
  const shot = async (opts = {}) => Buffer.from((await send("Page.captureScreenshot", { format: "jpeg", quality: 85, ...opts })).result.data, "base64");
  await send("Page.enable"); await send("Runtime.enable");
  return { send, ev, shot, sleep, errs, close: () => { ws.close(); proc.kill(); } };
}
