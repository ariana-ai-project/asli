# manager.asg — ارجاع هوشمند

بخش: پنل مدیر | راهنما: help-content.js «manager.asg» | جریان کار: wf.request (گام 2)

> پیشنهاد برای همهٔ درخواست‌های بی‌کارشناس با هم ساخته می‌شود، با این فرض که مدیر همه را تأیید می‌کند: هر درخواستی که به کسی داده می‌شود، بار او را برای درخواست بعدی بیشتر می‌کند. هدف تعادل دقیق بار کاری است — با حساب تعداد درخواست، تعداد اقلام، سختی گروه‌های اصناف، ضریب پروژه و ظرفیت هر کارشناس — و در همان حال تخصص و سابقهٔ پروژه.

## فایل‌های این قابلیت (صاحب)
- `frontend/tamin-poshtibani/assign-rules.mjs` — speedOf، num، projectKey، guildKey، tables، effortOf، unitEffort، capOf، limitsOf، buildLoads، planAssign، pen، fits، fill، move، room، deadlineOf، f، …

## مسیرهای سرور (3)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `POST /assign/ai` | w/api.js › route | — | ✓ |
| `POST /assign/ai-req` | w/api.js › route | — | ✓ |
| `POST /dispatch` | w/api.js › route | — | ✓ |

## فراخوان در پنل‌ها (6)
- expert.js › loadTemplates → `POST /dispatch` (صفحه: expert.html)
- manager.js › doDispatch → `POST /dispatch` (صفحه: manager.html)
- manager.js › go → `POST /assign/ai` (صفحه: manager.html)
- manager.js › refresh → `POST /dispatch` (صفحه: manager.html)
- manager.js › wire → `POST /assign/ai-req` (صفحه: manager.html)
- support-panel.js › api → `POST /dispatch` (صفحه: support.html)

جای راهنما: manager.js (پویا)

## جدول‌ها
نوشتن: assignments، items، requests
خواندن: ai_agents، ai_runs، experts
هم‌نویس‌های همین جدول‌ها: expert.detail، infra.core، manager.desk، manager.import

## تست‌ها (4)
- ai-mode-live.test.mjs
- assign-plan.test.mjs
- execution-ready.test.mjs
- phase4b.test.mjs

```
node --test backend/tamin-poshtibani/tests/ai-mode-live.test.mjs backend/tamin-poshtibani/tests/assign-plan.test.mjs backend/tamin-poshtibani/tests/execution-ready.test.mjs backend/tamin-poshtibani/tests/phase4b.test.mjs
```

## مرتبط
- manager.dl — مهلت هوشمند
