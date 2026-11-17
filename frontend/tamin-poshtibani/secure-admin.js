(function () {
  "use strict";
  const TP = window.TP || {}, esc = TP.esc || ((value) => String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])));
  let C = { api: null, render: () => {} }, root = null;
  const S = { data: null, draft: null, busy: false, err: "", msg: "" };
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const fa = (value) => TP.ui && TP.ui.fa ? TP.ui.fa(value) : String(value);

  function configure(options) { C = { ...C, ...options }; }
  function mount(element) {
    if (root === element) return;
    root = element;
    root.addEventListener("click", onClick);
  }
  function collect() {
    if (!root || !S.draft) return;
    S.draft.providers = S.draft.providers.map((provider, index) => {
      const card = root.querySelector(`[data-provider="${index}"]`);
      if (!card) return provider;
      return {
        ...provider,
        label: card.querySelector("[data-p-label]").value,
        base_url: card.querySelector("[data-p-base]").value,
        model: card.querySelector("[data-p-model]").value,
        api_key: card.querySelector("[data-p-key]").value,
        active: card.querySelector("[data-p-active]").checked,
      };
    });
    const elevenBase = root.querySelector("[data-eleven-base]"), elevenModel = root.querySelector("[data-eleven-model]");
    if (elevenBase) S.draft.eleven.base_url = elevenBase.value;
    if (elevenModel) S.draft.eleven.model = elevenModel.value;
  }
  function configBody() {
    collect();
    const secrets = {}, clear = [];
    root.querySelectorAll("[data-secret]").forEach((input) => { if (input.value) secrets[input.dataset.secret] = input.value; });
    root.querySelectorAll("[data-clear-key]:checked").forEach((input) => clear.push(input.dataset.clearKey));
    const active = S.draft.providers.find((provider) => provider.active);
    return {
      secrets, clear,
      providers: S.draft.providers.map((provider) => ({
        id: provider.id, label: provider.label, base_url: provider.base_url, model: provider.model, api_key: provider.api_key || "",
      })),
      active_provider: active ? active.id : "",
      eleven: { ...S.draft.eleven },
    };
  }
  async function refresh() {
    const data = await C.api("/access");
    S.data = data;
    S.draft = { providers: clone(data.providers || []), eleven: { ...(data.eleven || { base_url: "", model: "" }) } };
  }
  async function load(force) {
    if (S.busy) return;
    if (S.data && !force) return;
    S.busy = true; S.err = ""; C.render();
    try { await refresh(); } catch (error) { S.err = error.message; }
    S.busy = false; C.render();
  }
  async function saveConfig() {
    const body = configBody();
    S.busy = true; S.err = ""; S.msg = ""; C.render();
    try { S.data = await C.api("/access/save", { body }); S.draft = { providers: clone(S.data.providers), eleven: { ...S.data.eleven } }; S.msg = "تنظیمات رمزنگاری‌شده ذخیره شد."; }
    catch (error) { S.err = error.message; }
    S.busy = false; C.render();
  }
  async function saveUser(id, container) {
    collect();
    const body = {
      id: id || 0,
      username: container.querySelector("[data-u-name]").value,
      password: container.querySelector("[data-u-pass]").value,
      active: container.querySelector("[data-u-active]").checked,
    };
    S.busy = true; S.err = ""; S.msg = ""; C.render();
    try {
      const result = await C.api("/access/legal-user", { body });
      S.data.legal_users = result.legal_users;
      S.msg = "کاربر حقوقی ذخیره شد؛ رمز فقط به شکل هش نگه داشته می‌شود.";
    } catch (error) { S.err = error.message; }
    S.busy = false; C.render();
  }
  async function onClick(event) {
    const button = event.target.closest("[data-access-action]");
    if (!button) return;
    event.preventDefault();
    const action = button.dataset.accessAction;
    if (S.busy) return;
    if (action === "add-provider") {
      collect();
      S.draft.providers.push({ id: `local-${Date.now()}`, label: "سرویس‌دهندهٔ تازه", base_url: "", model: "claude-sonnet-5", api_key: "", key_configured: false, active: !S.draft.providers.length });
      return C.render();
    }
    if (action === "remove-provider") {
      collect(); S.draft.providers.splice(Number(button.dataset.index), 1);
      if (S.draft.providers.length && !S.draft.providers.some((provider) => provider.active)) S.draft.providers[0].active = true;
      return C.render();
    }
    if (action === "save-config") return saveConfig();
    if (action === "save-user") return saveUser(Number(button.dataset.id), button.closest("[data-user-row]"));
  }

  function providerCard(provider, index) {
    return `<div class="tp-card" data-provider="${index}" style="margin:10px 0"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <label class="chip ${provider.active ? "ok" : ""}"><input type="radio" name="access-active" data-p-active ${provider.active ? "checked" : ""}> سرویس فعال</label>
      <span class="spacer"></span><span class="chip ${provider.key_configured ? "ok" : "warn"}">${provider.key_configured ? "کلید ثبت شده" : "کلید ندارد"}</span>
      <button class="tp-btn sm danger" type="button" data-access-action="remove-provider" data-index="${index}">حذف</button></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:12px">
      <label>نام نمایشی<input class="tp-input" data-p-label value="${esc(provider.label)}" placeholder="مثلاً Anthropic"></label>
      <label>مدل<input class="tp-input" data-p-model dir="ltr" value="${esc(provider.model)}" placeholder="claude-sonnet-5"></label>
      <label style="grid-column:1/-1">نشانی API سازگار با Anthropic Messages<input class="tp-input" data-p-base dir="ltr" value="${esc(provider.base_url)}" placeholder="https://api.anthropic.com"></label>
      <label style="grid-column:1/-1">API Key<input class="tp-input" data-p-key dir="ltr" type="password" autocomplete="off" placeholder="${provider.key_configured ? "برای حفظ کلید فعلی خالی بگذارید" : "کلید را وارد کنید"}"></label>
      </div></div>`;
  }
  function secretField(field) {
    return `<div style="border-bottom:1px dashed var(--tp-line);padding:10px 0"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b>${esc(field.label)}</b>
      <span class="chip ${field.configured ? "ok" : "warn"}">${field.configured ? "تنظیم شده" : "تنظیم نشده"}</span>${field.source ? `<span class="dim">${field.source === "panel" ? "از پنل" : "از محیط سرور"}</span>` : ""}</div>
      <input class="tp-input" style="margin-top:7px" type="password" autocomplete="off" dir="ltr" data-secret="${esc(field.key)}" placeholder="${field.configured ? "برای حفظ مقدار فعلی خالی بگذارید" : "مقدار تازه"}">
      ${field.configured ? `<label class="dim" style="font-size:.82rem"><input type="checkbox" data-clear-key="${esc(field.key)}"> حذف مقدار ذخیره‌شده در پنل</label>` : ""}</div>`;
  }
  function userRow(user) {
    return `<div data-user-row style="display:grid;grid-template-columns:minmax(150px,1fr) minmax(180px,1fr) auto auto;gap:8px;align-items:center;padding:8px 0;border-bottom:1px dashed var(--tp-line)">
      <input class="tp-input" data-u-name dir="ltr" value="${esc(user.username)}" aria-label="نام کاربری">
      <input class="tp-input" data-u-pass dir="ltr" type="password" autocomplete="new-password" placeholder="رمز تازه (اختیاری)">
      <label class="chip ${user.active ? "ok" : "warn"}"><input type="checkbox" data-u-active ${user.active ? "checked" : ""}> فعال</label>
      <button class="tp-btn sm" type="button" data-access-action="save-user" data-id="${user.id}">ذخیره</button>
      <span class="dim" style="grid-column:1/-1;font-size:.8rem">آخرین ورود: ${user.last_login ? fa(new Date(user.last_login).toLocaleString("fa-IR")) : "—"}</span></div>`;
  }
  function mainView() {
    const d = S.data;
    if (!d) return `<div class="ui-load"><span>در حال بارگذاری تنظیمات امن…</span></div>`;
    return `<div style="display:grid;gap:12px"><div class="tp-card"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><h2 style="margin:0">🔐 دسترسی و API</h2></div>
      <p class="dim">کلیدهای تازه رمزنگاری می‌شوند و پس از ذخیره قابل مشاهده نیستند. سرویس‌دهنده‌ها باید با API نوع Anthropic Messages سازگار باشند.</p>
      ${!d.encryption_ready ? `<div class="tp-note warn">کلید اصلی رمزنگاری روی سرور تنظیم نشده؛ ذخیرهٔ API Key تا تنظیم آن غیرفعال است. مدیریت کاربران حقوقی فعال است.</div>` : ""}
      ${S.err ? `<div class="tp-note warn" role="alert">${esc(S.err)}</div>` : ""}${S.msg ? `<div class="tp-note ok">${esc(S.msg)}</div>` : ""}</div>
      <section><h3>مدل‌های هوش مصنوعی</h3>${S.draft.providers.map(providerCard).join("")}
      <button class="tp-btn" type="button" data-access-action="add-provider">افزودن سرویس‌دهنده</button></section>
      <section class="tp-card"><h3>ElevenLabs</h3><div style="display:grid;grid-template-columns:2fr 1fr;gap:10px">
      <label>نشانی API<input class="tp-input" dir="ltr" data-eleven-base value="${esc(d.eleven.base_url)}" placeholder="https://api.elevenlabs.io"></label>
      <label>مدل صدا به متن<input class="tp-input" dir="ltr" data-eleven-model value="${esc(d.eleven.model)}" placeholder="scribe_v2"></label></div></section>
      <section class="tp-card"><h3>کلیدهای سرویس‌ها</h3>${d.secrets.map(secretField).join("")}</section>
      <button class="tp-btn primary" type="button" data-access-action="save-config" ${S.busy || !d.encryption_ready ? "disabled" : ""}>${S.busy ? "در حال ذخیره…" : "ذخیرهٔ امن تنظیمات"}</button>
      <section class="tp-card"><h3>کاربران بخش حقوقی</h3><p class="dim">نام کاربری لاتین است و هر رمز دست‌کم ۸ نویسه دارد. برای تغییر نام یا فعال/غیرفعال کردن، رمز تازه لازم نیست.</p>
      ${(d.legal_users || []).map(userRow).join("")}
      <h4 style="margin-top:18px">افزودن کاربر</h4><div data-user-row style="display:grid;grid-template-columns:1fr 1fr auto auto;gap:8px;align-items:center">
      <input class="tp-input" data-u-name dir="ltr" placeholder="username" autocomplete="off"><input class="tp-input" data-u-pass dir="ltr" type="password" placeholder="رمز (دست‌کم ۸ نویسه)" autocomplete="new-password">
      <label class="chip ok"><input type="checkbox" data-u-active checked> فعال</label><button class="tp-btn sm primary" type="button" data-access-action="save-user" data-id="0">ایجاد کاربر</button></div></section></div>`;
  }
  function view() { return mainView(); }
  window.TP_SECURE = { configure, mount, load, view };
})();
