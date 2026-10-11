/* ============================================================
   اعلانِ گوشی و مرورگر (worker/push.js): رمزِ RFC 8291، امضای VAPID، ثبت/حذفِ اشتراک و فرستادن
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { createECDH, createDecipheriv, hkdfSync, randomBytes, createPublicKey, verify as nodeVerify } from "node:crypto";
import { sqliteD1 } from "./run.mjs";
import { encryptPayload, b64u, unb64u, validEndpoint, pushSubscribe, pushTo, vapidKeys, resetVapidCache, PUSH_DDL } from "../../../worker/push.js";

/* گیرندهٔ مستقل با node:crypto (نه WebCrypto): همان کاری که مرورگر می‌کند */
function decrypt(body, uaEcdh, auth) {
  const salt = body.subarray(0, 16), rs = body.readUInt32BE(16), idlen = body[20], asPub = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
  assert.equal(rs, 4096);
  const shared = uaEcdh.computeSecret(asPub);
  const info = Buffer.concat([Buffer.from("WebPush: info\0"), uaEcdh.getPublicKey(), asPub]);
  const ikm = Buffer.from(hkdfSync("sha256", shared, auth, info, 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const d = createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const pt = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  assert.equal(pt[pt.length - 1], 2, "جداکنندهٔ رکوردِ آخر");
  return pt.subarray(0, pt.length - 1).toString("utf8");
}

test("رمز RFC 8291: گیرندهٔ مستقل همان متن را باز می‌کند (فارسی هم)", async () => {
  const ua = createECDH("prime256v1"); ua.generateKeys();
  const auth = randomBytes(16);
  const msg = JSON.stringify({ t: "پیشنهاد بهتر آمد", b: "۲٬۴۵۰٬۰۰۰ ریال — رتبهٔ ۱", u: "support.html#td" });
  const body = Buffer.from(await encryptPayload(new TextEncoder().encode(msg), b64u(ua.getPublicKey()), b64u(auth)));
  assert.equal(decrypt(body, ua, auth), msg);
  /* هر بار کلید و نمکِ تازه */
  const again = Buffer.from(await encryptPayload(new TextEncoder().encode(msg), b64u(ua.getPublicKey()), b64u(auth)));
  assert.notDeepEqual(again.subarray(0, 16), body.subarray(0, 16));
});

test("رمز RFC 8291: نمونهٔ خودِ استاندارد (بخش ۵) بایت‌به‌بایت", async () => {
  const asPub = unb64u("BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8");
  const jwk = { kty: "EC", crv: "P-256", x: b64u(asPub.slice(1, 33)), y: b64u(asPub.slice(33)), d: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw", ext: true };
  const as = {
    privateKey: await crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]),
    publicKey: await crypto.subtle.importKey("raw", asPub, { name: "ECDH", namedCurve: "P-256" }, true, []),
  };
  const out = await encryptPayload(new TextEncoder().encode("When I grow up, I want to be a watermelon"),
    "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", "BTBZMqHH6r4Tts7J_aSIgg",
    { as, salt: unb64u("DGv6ra1nlYgDCS1FRnbzlw") });
  assert.equal(b64u(out), "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN");
});

test("فقط سرویس‌های push شناخته‌شده", () => {
  for (const ok of ["https://fcm.googleapis.com/fcm/send/abc", "https://web.push.apple.com/QGx", "https://updates.push.services.mozilla.com/wpush/v2/x", "https://wns2-db5p.notify.windows.com/w/?token=x"]) assert.ok(validEndpoint(ok), ok);
  for (const bad of ["http://fcm.googleapis.com/x", "https://evil.com/fcm.googleapis.com", "https://fcm.googleapis.com.evil.com/x", "https://127.0.0.1/x", "", null]) assert.ok(!validEndpoint(bad), String(bad));
});

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست";
const env = { DB, SITE_ORIGIN: "https://arianaai.website" };
if (DB) {
  await DB.exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)");
  await DB.exec(PUSH_DDL.trim());
}

test("کلید VAPID یک بار ساخته و نگه داشته می‌شود؛ امضای JWT با کلید عمومی درست است", { skip: SKIP }, async () => {
  resetVapidCache();
  const a = await vapidKeys(env);
  resetVapidCache();
  const b = await vapidKeys(env);
  assert.equal(a.pub, b.pub, "isolate تازه همان کلید را از settings می‌خواند");
  assert.equal(unb64u(a.pub).length, 65);
  /* یک ارسال با fetch بدلی: سرآیندها و امضا */
  const ua = createECDH("prime256v1"); ua.generateKeys(); const auth = randomBytes(16);
  await pushSubscribe(env, "expert", 7, { endpoint: "https://fcm.googleapis.com/fcm/send/dev1", keys: { p256dh: b64u(ua.getPublicKey()), auth: b64u(auth) } }, "test");
  const seen = [];
  const r = await pushTo(env, { role: "expert", uid: 7 }, { title: "ارجاع تازه", body: "درخواست ۱۰۰۱", url: "expert.html", tag: "a1" },
    { fetch: async (url, init) => { seen.push({ url, init }); return new Response(null, { status: 201 }); } });
  assert.deepEqual([r.sent, r.total], [1, 1]);
  const h = seen[0].init.headers;
  assert.equal(h["Content-Encoding"], "aes128gcm");
  assert.ok(Number(h.TTL) > 0);
  assert.equal(h.Topic, "a1");
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(h.Authorization);
  assert.ok(m, h.Authorization);
  assert.equal(m[2], a.pub);
  const [hd, bd, sg] = m[1].split(".");
  const claims = JSON.parse(Buffer.from(unb64u(bd)).toString());
  assert.equal(claims.aud, "https://fcm.googleapis.com");
  assert.equal(claims.sub, "https://arianaai.website");
  assert.ok(claims.exp > Date.now() / 1000 && claims.exp <= Date.now() / 1000 + 24 * 3600, "حداکثر ۲۴ ساعت");
  const pub = createPublicKey({ key: { kty: "EC", crv: "P-256", x: b64u(unb64u(a.pub).slice(1, 33)), y: b64u(unb64u(a.pub).slice(33)) }, format: "jwk" });
  assert.ok(nodeVerify("sha256", Buffer.from(`${hd}.${bd}`), { key: pub, dsaEncoding: "ieee-p1363" }, Buffer.from(unb64u(sg))), "امضای ES256");
  const got = JSON.parse(decrypt(Buffer.from(seen[0].init.body), ua, auth));
  assert.deepEqual(got, { t: "ارجاع تازه", b: "درخواست ۱۰۰۱", u: "expert.html", g: "a1" });
});

test("اشتراکِ مرده (۴۱۰) پاک می‌شود؛ همان دستگاه با کاربر دیگر ← به کاربر تازه", { skip: SKIP }, async () => {
  const ua = createECDH("prime256v1"); ua.generateKeys(); const auth = b64u(randomBytes(16));
  const sub = (e) => ({ endpoint: e, keys: { p256dh: b64u(ua.getPublicKey()), auth } });
  await pushSubscribe(env, "manager", 0, sub("https://fcm.googleapis.com/fcm/send/m1"), "x");
  await pushSubscribe(env, "manager", 0, sub("https://web.push.apple.com/m2"), "x");
  const f410 = { fetch: async (url) => new Response(null, { status: url.includes("apple") ? 410 : 201 }) };
  /* اشتراکِ تازه (زیر ده دقیقه): ۴۱۰ فقط شکست شمرده می‌شود — سرویس push گاهی اشتراکِ تازه را چند لحظه نمی‌شناسد */
  const fresh = await pushTo(env, { role: "manager", uid: 0 }, { title: "هشدار" }, f410);
  assert.deepEqual([fresh.sent, fresh.gone, fresh.failed], [1, 0, 1]);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM push_subs WHERE role='manager'").get().n, 2);
  DB.raw.prepare("UPDATE push_subs SET created_at=created_at-11*60000 WHERE role='manager'").run();
  const r = await pushTo(env, { role: "manager", uid: 0 }, { title: "هشدار" }, f410);
  assert.deepEqual([r.sent, r.gone], [1, 1]);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM push_subs WHERE role='manager'").get().n, 1);
  /* خروج کارشناس ۷ و ورود کارشناس ۸ روی همان مرورگر */
  await pushSubscribe(env, "expert", 8, { endpoint: "https://fcm.googleapis.com/fcm/send/dev1", keys: sub("").keys }, "x");
  const seen = [];
  await pushTo(env, { role: "expert", uid: 7 }, { title: "برای ۷" }, { fetch: async (u) => { seen.push(u); return new Response(null, { status: 201 }); } });
  assert.equal(seen.length, 0, "کارشناس ۷ دیگر روی این دستگاه نیست");
  await assert.rejects(pushSubscribe(env, "expert", 8, { endpoint: "https://evil.example/x", keys: sub("").keys }), /پذیرفته نیست/);
  await assert.rejects(pushSubscribe(env, "admin", 1, sub("https://fcm.googleapis.com/x")), /نقش/);
  /* خطای شبکه هرگز به کار اصلی نمی‌رسد */
  const bad = await pushTo(env, { role: "manager", uid: 0 }, { title: "x" }, { fetch: async () => { throw new Error("offline"); } });
  assert.equal(bad.sent, 0);
});
