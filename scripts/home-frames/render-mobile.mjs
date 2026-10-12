// فریم‌های عمودیِ تازهٔ صفحهٔ اول گوشی: «دوربینِ مجازی» روی فریم‌های افقی (نشان و نامِ کامل، وسط)
// و از فریم HANDOFF به بعد همان فریم‌های عمودیِ قبلی (تحویلِ بی‌درز: دوربین در انتها دقیقاً همان قاب است).
// node scripts/home-frames/render-mobile.mjs <outRoot> [sizes=1080,720] [q=0.8] [only=0-148]
// منبع: frontend/assets/frames/2560 (افقی) و فریم‌های عمودیِ ۹:۱۶ قبلی (اینجا SRC_PORT؛ از ۷۴ به بعد و ترکیبِ ۷۰ تا ۷۴).
// خروجی را در frontend/assets/frames/p1080 و p720 بگذارید و نسخهٔ نشانی را بالا ببرید (main.js GROUPS.port.q، index.html، sw.js).
// کروم: C:\Program Files\Google\Chrome\Application\chrome.exe
// diffseq.mjs <dir> 0 80 — اختلافِ فریم‌های پیاپی؛ جهش یعنی درز در حرکت
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { chrome } from "./cdp.mjs";

const [OUT, SIZES = "1080,720", Q = "0.8", ONLY = ""] = process.argv.slice(2);
const SRC = new URL("../../frontend/assets/frames", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
/* فریم‌های عمودیِ اصلی (۹:۱۶ از ویدیوی عمودی): پس از ساخت، p1080/p720 از ۷۴ به بعد همان‌هاست؛ اصلِ ۰ تا ۷۳ در تاریخچهٔ git
   (frontend/assets/frames/1080 و 720 پیش از کامیتِ «صفحهٔ اول گوشی: نشان و نام کامل») — برای ساختِ دوباره همان‌ها را اینجا بگذارید */
const SRC_PORT = (W) => `${SRC}/p${W}`;
const FRAMES = 149;
/* مسیرِ دوربین: [فریم، مرکزِ افقی (نسبت به پهنای فریم افقی)، پهنای پنجره (نسبت به پهنای فریم افقی)] */
export const KEYS = [[0, 0.52, 0.74], [14, 0.52, 0.74], [26, 0.40, 0.64], [44, 0.53, 0.58], [52, 0.50, 0.57], [70, 0.397, 0.3162], [74, 0.397, 0.3162]];
/* از ۷۰ دوربین دقیقاً همان قابِ عمودی است؛ ۷۰ تا ۷۴ فقط تیزیِ فریم عمودی جای کشیدهٔ فریم افقی می‌نشیند (بی شبح) */
export const HANDOFF = 74, MIX_FROM = 70;

/* درون‌یابیِ مکعبیِ یکنوا (Fritsch–Carlson): نرم، بی بیش‌جهش */
function monotone(xs, ys) {
  const n = xs.length, d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}
const fx = KEYS.map((k) => k[0]);
const cxAt = monotone(fx, KEYS.map((k) => k[1]));
const lwAt = monotone(fx, KEYS.map((k) => Math.log(k[2])));   // بزرگ‌نمایی در مقیاسِ لگاریتمی یکنواخت‌تر حس می‌شود
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const camAt = (i) => ({ cx: cxAt(i), wf: Math.exp(lwAt(i)), cy: 0.5, mix: smooth((i - MIX_FROM) / (HANDOFF - MIX_FROM)) });

if (OUT) {
  const sizes = SIZES.split(",").map(Number);
  const [a, b] = ONLY ? ONLY.split("-").map(Number) : [0, FRAMES - 1];
  const lib = readFileSync(new URL("./compose-lib.js", import.meta.url), "utf8");
  const c = await chrome();
  /* پس‌زمینهٔ پژواک از فریم ۰ (بی نشان) — compose-lib.js makePlate */
  await c.ev(`${lib}; const im = await new Promise((ok) => { const m = new Image(); m.onload = () => ok(m); m.src = "data:image/webp;base64,${readFileSync(`${SRC}/2560/logo-000.webp`).toString("base64")}"; }); makePlate(im); return 1`);
  const b64 = (p) => readFileSync(p).toString("base64");
  for (const W of sizes) {
    const H = Math.round(W * 16 / 9), dir = `${OUT}/p${W}`; mkdirSync(dir, { recursive: true });
    let bytes = 0, made = 0;
    for (let i = a; i <= b; i++) {
      const n = String(i).padStart(3, "0");
      if (i >= HANDOFF) { if (`${SRC_PORT(W)}/logo-${n}.webp` !== `${dir}/logo-${n}.webp`) copyFileSync(`${SRC_PORT(W)}/logo-${n}.webp`, `${dir}/logo-${n}.webp`); continue; }
      const cam = camAt(i);
      const data = await c.ev(`
        const load = (s) => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = "data:image/webp;base64," + s; });
        const L = await load(${JSON.stringify(b64(`${SRC}/2560/logo-${n}.webp`))});
        const P = ${cam.mix > 0} ? await load(${JSON.stringify(cam.mix > 0 ? b64(`${SRC_PORT(W)}/logo-${n}.webp`) : "")}) : null;
        const out = document.createElement("canvas"); out.width = ${W}; out.height = ${H};
        composeFrame(out, L, P, ${JSON.stringify(cam)}, "echo");
        const blob = await new Promise((ok) => out.toBlob(ok, "image/webp", ${+Q}));
        const buf = new Uint8Array(await blob.arrayBuffer()); let s = ""; for (let k = 0; k < buf.length; k += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(k, k + 0x8000));
        return btoa(s);`);
      if (data && data.error) throw new Error(data.error);
      const buf = Buffer.from(data, "base64"); writeFileSync(`${dir}/logo-${n}.webp`, buf); bytes += buf.length; made++;
    }
    console.log(`p${W}: ${made} composed, avg ${Math.round(bytes / Math.max(1, made) / 1024)}KB`);
  }
  console.log("errors", JSON.stringify(c.errs)); c.close();
}
