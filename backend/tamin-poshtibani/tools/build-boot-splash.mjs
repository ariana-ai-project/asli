/* ============================================================
   صفحهٔ «در حال بارگذاری» هنگامِ ورود به وب‌اپ روی گوشی (مهر ۱۴۰۵، درخواستِ مالک: «کاربر با ورود همون صفحهٔ
   در حال بارگیری رو ببینه با لوگوی آریانا و نوار چرخون تا صفحه لود بشه»):
     node backend/tamin-poshtibani/tools/build-boot-splash.mjs     ← تکهٔ یکسان را در همهٔ صفحه‌های ورود می‌نویسد
   همه‌چیز درون‌خطی است (CSS، لوگوی ۲۴۰ پیکسلیِ WebP به‌صورت data:، اسکریپتِ کوچک) تا با اولین نقاشیِ صفحه
   دیده شود و منتظرِ هیچ درخواستِ دیگری نماند. فقط گوشی (≤۷۲۰px یا گوشیِ افقی)؛ روی دسکتاپ همان لحظه حذف می‌شود.
   کِی کنار می‌رود (data-mode):
     home  صفحهٔ اول: وقتی اولین فریمِ لوگوموشن روی بوم کشیده شد (js/main.js ← window.__bootDone)
     load  صفحهٔ انتخابِ تدارکات: رویدادِ load
     app   پنل‌ها: وقتی لودینگِ اولیهٔ #app رفت و هیچ .ui-load دیگری (دادهٔ اولِ پنل) دیده نمی‌شود
   سقف: ۱۲ ثانیه (صفحهٔ اول ۲۰) تا هیچ‌وقت کاربر پشتِ آن گیر نیفتد؛ اگر بارگذاری زود تمام شود (کمتر از ۲۵۰ms
   پس از نقاشی) بی‌محو برداشته می‌شود و چیزی چشمک نمی‌زند. تست boot-splash.test.mjs هم‌خوانیِ صفحه‌ها را می‌سنجد.
   ============================================================ */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const FE = join(ROOT, "frontend");
export const LOGO = join(FE, "assets", "boot-logo.webp");

export const PAGES = [
  ["index.html", "home"],
  ["tamin-poshtibani/index.html", "load"],
  ["tamin-poshtibani/expert.html", "app"],
  ["tamin-poshtibani/manager.html", "app"],
  ["tamin-poshtibani/support.html", "app"],
  ["tamin-poshtibani/correspond.html", "app"],
  ["tamin-poshtibani/supplier.html", "app"],
  ["tamin-poshtibani/tender.html", "app"],
];

export const MQ = "(max-width: 720px), (pointer: coarse) and (max-height: 520px)";

export const CSS = `#boot{display:none}
@media ${MQ}{
#boot{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;padding:24px;box-sizing:border-box;
background:radial-gradient(120% 75% at 50% 40%,#0d2557 0%,#071433 46%,#030814 100%);color:#cfe0ff;text-align:center;
font-family:Vazirmatn,system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;touch-action:none;overscroll-behavior:contain;-webkit-user-select:none;user-select:none;
transition:opacity .35s ease,visibility .35s}
#boot.out{opacity:0;visibility:hidden}
#boot>*{animation:btIn .4s ease .25s both}
.bt-ring{--s:104px;--w:5px;position:relative;flex:none;width:var(--s);height:var(--s)}
.bt-ring img{position:absolute;inset:0;width:100%;height:100%;border-radius:50%;object-fit:cover;background:#fff;
box-shadow:0 0 0 1px rgba(255,255,255,.5),0 14px 36px -12px rgba(0,10,40,.85),0 0 48px -4px rgba(79,140,255,.55)}
.bt-ring:before,.bt-ring i{content:"";position:absolute;inset:calc(var(--s)*-.17);border-radius:50%}
.bt-ring:before{border:var(--w) solid rgba(79,140,255,.16)}
.bt-ring i{background:conic-gradient(from 0deg,transparent 0deg 90deg,#4f8cff 300deg,#b9d3ff 360deg);
-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - var(--w) - .5px),#000 calc(100% - var(--w)));
mask:radial-gradient(farthest-side,transparent calc(100% - var(--w) - .5px),#000 calc(100% - var(--w)));animation:btSpin 1s linear infinite}
.bt-ring i:after{content:"";position:absolute;top:0;left:50%;width:var(--w);height:var(--w);margin-left:calc(var(--w)/-2);border-radius:50%;background:#b9d3ff}
.bt-tx{display:flex;flex-direction:column;gap:6px;line-height:1.7}
.bt-tx b{font-size:1.2rem;font-weight:800;color:#eef4ff}
.bt-tx span{font-size:.86rem;color:rgba(207,224,255,.72);min-height:1.5em}
:root[data-theme=light] #boot{background:radial-gradient(120% 75% at 50% 40%,#fff 0%,#eaf1fc 55%,#dbe6f7 100%);color:#1c3c8c}
:root[data-theme=light] .bt-ring:before{border-color:rgba(47,111,228,.14)}
:root[data-theme=light] .bt-ring i{background:conic-gradient(from 0deg,transparent 0deg 90deg,#2f6fe4 300deg,#1c3c8c 360deg)}
:root[data-theme=light] .bt-ring i:after{background:#1c3c8c}
:root[data-theme=light] .bt-tx b{color:#0f2a66}
:root[data-theme=light] .bt-tx span{color:#3f5784}
@media (prefers-reduced-motion:reduce){#boot>*{animation:none}.bt-ring i{animation-duration:2.6s}}
}
@keyframes btSpin{to{transform:rotate(360deg)}}
@keyframes btIn{from{opacity:0;transform:translateY(6px)}}`;

/* ES5 و بی وابستگی: پیش از همهٔ اسکریپت‌های صفحه اجرا می‌شود */
export const JS = `(function(){var w=window,b=document.getElementById("boot"),m=b.getAttribute("data-mode"),off=0,now=function(){return w.performance?performance.now():Date.now()},t0=now();
w.__bootDone=function(){};
if(!w.matchMedia||!matchMedia(${JSON.stringify(MQ)}).matches){b.parentNode.removeChild(b);return}
function rm(){if(b.parentNode)b.parentNode.removeChild(b)}
function done(){if(off)return;off=1;if(now()-t0<250)return rm();b.className="out";setTimeout(rm,450)}
w.__bootDone=done;
setTimeout(function(){if(!off)b.querySelector(".bt-tx span").textContent="اینترنت کند است؛ چند لحظه صبر کنید…"},7000);
setTimeout(done,m==="home"?20000:12000);
if(m==="load")w.addEventListener("load",done);
else if(m==="app"){var ok=0;(function p(){if(off)return;var a=document.getElementById("app"),busy=!a||document.readyState==="loading";
if(!busy){var l=a.getElementsByClassName("ui-load");for(var i=0;i<l.length;i++)if(!/(^| )out( |$)/.test(l[i].className)&&l[i].getClientRects().length){busy=true;break}}
ok=busy?0:ok+1;if(ok>1)return done();setTimeout(p,80)})()}})();`;

export function html(mode) {
  const logo = readFileSync(LOGO).toString("base64");
  return `<div id="boot" data-mode="${mode}" role="status" aria-live="polite"><span class="bt-ring" aria-hidden="true"><i></i><img src="data:image/webp;base64,${logo}" alt="" width="104" height="104"></span><span class="bt-tx"><b>سامانه هوشمند آریانا</b><span>در حال بارگذاری…</span></span></div>
<script>${JS}</script>`;
}

export const CSS_OPEN = "<!-- boot:css (tools/build-boot-splash.mjs) -->", CSS_CLOSE = "<!-- /boot:css -->";
export const BODY_OPEN = "<!-- boot (tools/build-boot-splash.mjs) -->", BODY_CLOSE = "<!-- /boot -->";

/** متنِ صفحه با تکهٔ تازه (اگر نشانه‌ها نبود، CSS پیش از </head> و تکه درست بعد از <body…>) */
export function inject(src, mode) {
  const css = `${CSS_OPEN}\n  <style>${CSS}</style>\n  ${CSS_CLOSE}`;
  const body = `${BODY_OPEN}\n  ${html(mode)}\n  ${BODY_CLOSE}`;
  const swap = (s, open, close, block, fallback) => {
    const a = s.indexOf(open);
    if (a >= 0) { const z = s.indexOf(close, a); if (z < 0) throw new Error(`بی ${close}`); return s.slice(0, a) + block + s.slice(z + close.length); }
    return fallback(s, block);
  };
  let out = swap(src, CSS_OPEN, CSS_CLOSE, css, (s, block) => {
    const i = s.indexOf("</head>"); if (i < 0) throw new Error("بی </head>");
    return `${s.slice(0, i)}  ${block}\n${s.slice(i)}`;
  });
  out = swap(out, BODY_OPEN, BODY_CLOSE, body, (s, block) => {
    const m = /<body[^>]*>\r?\n?/.exec(s); if (!m) throw new Error("بی <body>");
    const i = m.index + m[0].length;
    return `${s.slice(0, i)}  ${block}\n${s.slice(i)}`;
  });
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const [rel, mode] of PAGES) {
    const p = join(FE, rel);
    const src = readFileSync(p, "utf8");
    const out = inject(src, mode);
    if (out !== src) writeFileSync(p, out);
    console.log(`${out === src ? "=" : "✓"} ${rel} (${mode}) ${Buffer.byteLength(out)}B`);
  }
}
