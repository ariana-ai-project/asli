/* صفحهٔ «در حال بارگذاری» گوشی (tools/build-boot-splash.mjs): همهٔ صفحه‌های ورود همان تکهٔ تازه را دارند،
   اسکریپتِ درون‌خطی سالم است، و صفحهٔ اول و سرویس‌ورکر به آن وصل‌اند. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PAGES, JS, CSS, inject, LOGO } from "../tools/build-boot-splash.mjs";

const FE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "frontend");
const read = (rel) => readFileSync(join(FE, rel), "utf8");

test("هر صفحهٔ ورود تکهٔ تازهٔ صفحهٔ بارگذاری را دارد (دوباره بسازید: node backend/tamin-poshtibani/tools/build-boot-splash.mjs)", () => {
  for (const [rel, mode] of PAGES) {
    const src = read(rel);
    assert.equal(inject(src, mode), src, `${rel} با ابزار نمی‌خواند`);
    assert.equal(src.split('id="boot"').length - 1, 1, `${rel}: یک #boot`);
    assert.ok(src.includes(`data-mode="${mode}"`), rel);
    /* CSS در head و تکه درست بعد از <body…>، پیش از هر اسکریپت دیگری */
    const head = src.slice(0, src.indexOf("</head>"));
    assert.ok(head.includes("#boot{display:none}"), `${rel}: CSS در head`);
    const afterBody = src.slice(src.search(/<body[^>]*>/));
    assert.ok(afterBody.indexOf('id="boot"') < afterBody.indexOf("<script"), `${rel}: پیش از اسکریپت‌ها`);
  }
});

test("اسکریپت درون‌خطی ES5 و بی خطای نحوی است؛ لوگو کوچک و درون‌خطی است", () => {
  assert.doesNotThrow(() => new Function(JS));
  assert.ok(!/=>|\blet\b|\bconst\b|`/.test(JS), "ES5");
  assert.ok(!JS.includes("</") && !CSS.includes("</"), "بی بستنِ زودهنگامِ تگ");
  const size = readFileSync(LOGO).length;
  assert.ok(size > 1000 && size < 12000, `boot-logo.webp ${size}B`);
});

test("صفحهٔ اول با اولین فریم کنارش می‌زند و نسخه‌ها با سرویس‌ورکر می‌خوانند", () => {
  const main = readFileSync(join(FE, "js", "main.js"), "utf8");
  assert.ok(main.includes("window.__bootDone()"), "main.js ← __bootDone");
  assert.ok(main.includes("setTimeout(startSW, 3000)") && main.includes('addEventListener("load", startSW)'));
  const idx = read("index.html"), sw = read("sw.js");
  const v = /js\/main\.js\?v=(\d+)/.exec(idx)[1];
  assert.ok(sw.includes(`"./js/main.js?v=${v}"`), "پیش‌کشِ sw همان main.js?v");
});
