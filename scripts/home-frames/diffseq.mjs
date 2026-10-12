// اختلافِ میانگینِ هر فریم با فریم بعدی (روی نسخهٔ کوچک) — جهشِ ناگهانی یعنی درز در حرکت
// node diffseq.mjs <dir> from to
import { readFileSync } from "node:fs";
import { chrome } from "./cdp.mjs";
const [DIR, A = "0", B = "148"] = process.argv.slice(2);
const c = await chrome();
const out = [];
let prev = null;
for (let i = +A; i <= +B; i++) {
  const s = readFileSync(`${DIR}/logo-${String(i).padStart(3, "0")}.webp`).toString("base64");
  const r = await c.ev(`
    const im = await new Promise((ok) => { const m = new Image(); m.onload = () => ok(m); m.src = "data:image/webp;base64,${s}"; });
    const x = new OffscreenCanvas(90, 160).getContext("2d"); x.drawImage(im, 0, 0, 90, 160);
    const d = x.getImageData(0, 0, 90, 160).data; const g = []; for (let k = 0; k < d.length; k += 4) g.push(Math.round(d[k] * 0.3 + d[k + 1] * 0.59 + d[k + 2] * 0.11)); return g;`);
  if (prev) { let e = 0; for (let k = 0; k < r.length; k++) e += Math.abs(r[k] - prev[k]); out.push(`${i - 1}→${i}:${(e / r.length).toFixed(1)}`); }
  prev = r;
}
console.log(out.join("  ")); c.close();
