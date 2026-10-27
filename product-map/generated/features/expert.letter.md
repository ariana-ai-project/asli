# expert.letter — نامهٔ کمیسیون

بخش: پنل کارشناس | راهنما: help-content.js «expert.letter» | جریان کار: wf.request (گام 8)

> گزارش خرید برای کمیسیون: توضیح بدهید در جریان این خرید چه اتفاقی افتاده — چه چالشی داشت، چرا این تأمین‌کننده، چه چیزی طول کشید — صدا به متن می‌شود و متن به نامهٔ رسمی (همان مسیر بات تلگرام).

## فایل‌های این قابلیت (صاحب)
- `worker/letter.js` — LETTER_PROMPT_VERSION، LETTER_SALUTATION، LETTER_THANKS، LETTER_TO، deleteTranscript، fillLetter، getTranscript، letterData، letterSubject، sttFields، transcribe، transcriptGone، writeLetter

## مسیرهای سرور (8)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `GET /assignments/{}/letter` | w/api.js › route | — | ✓ |
| `GET /assignments/{}/letter/file` | w/api.js › route | — | — |
| `GET /support/assignments/{}/letter/file` | w/api.js › route | — | — |
| `POST /assignments/{}/letter` | w/api.js › route | — | ✓ |
| `POST /assignments/{}/letter/cancel` | w/api.js › route | — | — |
| `POST /assignments/{}/letter/voice` | w/api.js › route | w/letter.js#transcribe، w/storage.js#MAX_BYTES، w/storage.js#storage، w/storage.js#storageKey | — |
| `POST /assignments/{}/letter/write` | w/api.js › route | w/bundle.js#bundleData، w/docx.js#renderLetter، w/letter.js#writeLetter، w/settings.js#getSettings، w/storage.js#storage، w/storage.js#storageKey | ✓ |
| `PUT /assignments/{}/letter/transcript` | w/api.js › route | — | ✓ |

## فراخوان در پنل‌ها (5)
- expert.js › letterCancel → `POST /assignments/{}/letter/cancel` (صفحه: expert.html)
- expert.js › letterStart → `GET /assignments/{}/letter`، `POST /assignments/{}/letter` (صفحه: expert.html)
- expert.js › letterTyped → `PUT /assignments/{}/letter/transcript` (صفحه: expert.html)
- expert.js › letterWrite → `PUT /assignments/{}/letter/transcript`، `POST /assignments/{}/letter/write` (صفحه: expert.html)
- expert.js › loadLetter → `GET /assignments/{}/letter`، `POST /assignments/{}/letter` (صفحه: expert.html)

## جدول‌ها
نوشتن: events، letters
خواندن: ai_rates، assignments، experts، final_call_sups، final_calls، items، quotes، requests، settings
هم‌نویس‌های همین جدول‌ها: bot.team، engine.ai، infra.core، manager.desk

## تست‌ها (6)
- ai-mode-live.test.mjs
- ai-phase2.test.mjs
- ai-phase3.test.mjs
- letter.test.mjs
- review-fixes.test.mjs
- voice-bot.test.mjs

```
node --test backend/tamin-poshtibani/tests/ai-mode-live.test.mjs backend/tamin-poshtibani/tests/ai-phase2.test.mjs backend/tamin-poshtibani/tests/ai-phase3.test.mjs backend/tamin-poshtibani/tests/letter.test.mjs backend/tamin-poshtibani/tests/review-fixes.test.mjs backend/tamin-poshtibani/tests/voice-bot.test.mjs
```

## مرتبط
- expert.comm — جدول کمیسیون
