# legal.app — سامانهٔ حقوقی

بخش: سامانهٔ حقوقی (محصول جدا)

> تحلیل قرارداد، پیش‌نویس و گفت‌وگوی حقوقی؛ پایهٔ جدا (LEGAL_PREFIX) و فرانت جدا (frontend-legal).

## فایل‌های این قابلیت (صاحب)
- `worker/legal-prompts.js` — ANALYSIS_SYSTEM، CHAT_SYSTEM، COMPACT_SCHEMA، COMPACT_SYSTEM، DRAFT_SCHEMA، DRAFT_SYSTEM، MEMORY_SCHEMA، MEMORY_SOFT، MEMORY_SYSTEM، REPORT_SCHEMA، analysisInstruction، draftInstruction
- `worker/legal.js` — FOLD_AT، KEEP_TOK، KEEP_TURNS، LEGAL_MODEL، LEGAL_SCHEMA، LIMITS، MAX_FILE، MAX_OUT، PIN_TOK، PREFIX، analysisRequest، chatRequest، compactRequest، costOf، draftRequest، ensureLegalSchema، estFileTok، estTok، …

## مسیرهای سرور (12)
| مسیر | پاسخ‌گو | ماژول‌هایی که صدا می‌زند | در تست |
|---|---|---|---|
| `* legal:/chats/{}` | w/legal.js › legalRoute | — | — |
| `* legal:/files/{}` | w/legal.js › legalRoute | — | — |
| `GET legal:/chats` | w/legal.js › legalRoute | — | — |
| `GET legal:/chats/{}/memory` | w/legal.js › legalRoute | — | — |
| `GET legal:/health` | w/legal.js › legalRoute | — | — |
| `POST legal:/analyze` | w/legal.js › legalRoute | — | — |
| `POST legal:/chats/{}/commit` | w/legal.js › legalRoute | — | — |
| `POST legal:/chats/{}/memory/refresh` | w/legal.js › legalRoute | — | — |
| `POST legal:/chats/{}/send` | w/legal.js › legalRoute | — | — |
| `POST legal:/draft` | w/legal.js › legalRoute | — | — |
| `POST legal:/files` | w/legal.js › legalRoute | — | — |
| `POST legal:/usage` | w/legal.js › legalRoute | — | — |

## فراخوان در پنل‌ها (0)
—

## جدول‌ها
نوشتن: counters، legal_calls، legal_chats، legal_files، legal_turns
خواندن: —
هم‌نویس‌های همین جدول‌ها: engine.structure، expert.comm، infra.core، manager.import

## تست‌ها (0)
— (تستِ مستقیم ندارد؛ پیش از استقرار همهٔ تست‌ها)
