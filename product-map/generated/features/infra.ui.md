# infra.ui — کیت رابط کاربری مشترک

بخش: زیرساخت

> TP.api، ui.js (کشوی راهنما، اعلان، ...)، ui-kit، حرکت‌ها و سبک‌های مشترک همهٔ پنل‌ها.

محل در رابط:
- در همهٔ پنل‌ها › نوار بالا، اعلان‌ها و کیت مشترک

## فایل‌های این قابلیت (صاحب)
- `frontend/tamin-poshtibani/config.js`
- `frontend/tamin-poshtibani/panel.css`
- `frontend/tamin-poshtibani/shared.js` — dv، jalCal، g2d، d2g، j2d، j2g، g2j، jLen، p2، win، at، ensureCss، themeLabel، commit، close، onDoc، paint، go، …
- `frontend/tamin-poshtibani/ui-kit.js` — clamp، reduced، emit، roundTo، nf، num، fx، apply، fetch، activeIn، ghost، mk، frame، success، reveal، end، switchEl، arcPath، …
- `frontend/tamin-poshtibani/ui-motion.js` — reduced، loadGsap، soon، activeOf، idOf، countOf، look، rel، slide، attach، release، finish، go، toLatin، parse، format، labelOf، inView، …
- `frontend/tamin-poshtibani/ui.css`
- `frontend/tamin-poshtibani/ui.js` — esc، fa، digits، $، $$، svg، themeBtn، mountBg، menuItems، run، menu، scrimOf، freeFixed، unfree، fitMenu، topbar، login، bindLogin، …

## مسیرهای سرور (0)
—

## فراخوان در پنل‌ها (0)
—

## جدول‌ها
نوشتن: —
خواندن: —

## تست‌ها (9)
- ai-mode-live.test.mjs
- boot-splash.test.mjs
- cr-registry.test.mjs
- help-flows.test.mjs
- help-glossary.test.mjs
- login.test.mjs
- neg-view.test.mjs
- sup-profile.test.mjs
- time.test.mjs

```
node --test backend/tamin-poshtibani/tests/ai-mode-live.test.mjs backend/tamin-poshtibani/tests/boot-splash.test.mjs backend/tamin-poshtibani/tests/cr-registry.test.mjs backend/tamin-poshtibani/tests/help-flows.test.mjs backend/tamin-poshtibani/tests/help-glossary.test.mjs backend/tamin-poshtibani/tests/login.test.mjs backend/tamin-poshtibani/tests/neg-view.test.mjs backend/tamin-poshtibani/tests/sup-profile.test.mjs backend/tamin-poshtibani/tests/time.test.mjs
```
