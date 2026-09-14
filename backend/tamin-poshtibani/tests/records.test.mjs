/* ============================================================
   ثبت‌های پایگاه داده — worker/records.js

   کلید شماره باید برای یک شماره در هر نوشتاری یکی باشد: تیکی که یک کارشناس برای
   «۰۹۱۲ ۱۲۳ ۴۵۶۷» زد، باید برای کارشناس بعدی که «+98 912-123-4567» می‌بیند پیدا شود.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { phoneKey, withPhoneKeys, titleKey, itemKeys, PLATFORMS } from "../../../worker/records.js";

test("یک شماره در هر نوشتاری یک کلید دارد", () => {
  const k = "+989121234567";
  for (const raw of ["+98 912 123 4567", "+98-912-123-4567", "00989121234567", "۰۹۱۲۱۲۳۴۵۶۷", "0912 123 4567", "989121234567"]) {
    assert.equal(phoneKey(raw, "ایران"), k, raw);
  }
  assert.equal(phoneKey("+7 701 123 45 67", "قزاقستان"), "+77011234567");
  assert.equal(phoneKey("8 (0512) 34-56", ""), "80512 3456".replace(/\D/g, ""), "بازار نامعلوم: فقط رقم");
  assert.equal(phoneKey("", "ایران"), "");
});

test("هر تأمین‌کننده کلید شماره‌هایش را هم‌ردیف دارد، بی دست زدن به خود شماره‌ها", () => {
  const r = withPhoneKeys({ suppliers: [{ name: "الف", market: "ایران", phones: ["021 8846 9696", "+98 912 000 1111"] }, { name: "ب", market: "چین", phones: [] }, "خراب"] });
  assert.deepEqual(r.suppliers[0].phones, ["021 8846 9696", "+98 912 000 1111"]);
  assert.deepEqual(r.suppliers[0].phone_keys, ["+982188469696", "+989120001111"]);
  assert.deepEqual(r.suppliers[1].phone_keys, []);
  assert.equal(r.suppliers[2], "خراب");
});

test("کلید قلم: کد استاندارد، کد راهکاران و عنوان نرمال", () => {
  assert.equal(titleKey("  سيمان‌ فله  M400 "), "سیمان فله m400");
  assert.deepEqual(itemKeys({ title: "سیمان فله", code: "1010", hist_code: null }), { item_code: "1010", hist_code: null, title_n: "سیمان فله" });
  assert.deepEqual(PLATFORMS, ["telegram", "whatsapp", "bale", "rubika"]);
});
