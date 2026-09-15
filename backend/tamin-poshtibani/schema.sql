-- ============================================================
-- سامانهٔ پشتیبانی خرید — طرح پایگاه دادهٔ Cloudflare D1 (SQLite)
--
-- مدل: «درخواست» گروه‌بندی است؛ وضعیت و کارشناس روی «قلم» نگه داشته
-- می‌شود (تصمیم مدیر: درخواست تا وقتی حتی یک قلم باز دارد، باز است).
-- «ارجاع» = (درخواست، کارشناس) با یک مهلت و یک ساعت‌شمار؛ اقلام به ارجاع
-- وصل می‌شوند، پس یک درخواست می‌تواند بین دو کارشناس تقسیم شود
-- (در فایل راهکاران ۱۹۳ مورد چنین است).
--
-- زمان‌ها: INTEGER میلی‌ثانیهٔ یونیکس. تاریخ‌های راهکاران: TEXT شمسی yyyy/mm/dd.
--
-- این فایل نسخهٔ خوانا/مستند است. نسخهٔ اجرایی همان DDL در
-- worker/api.js (ثابت SCHEMA) است که
-- در اولین فراخوانی API خودکار روی D1 اعمال می‌شود؛ اجرای دستی لازم نیست.
-- (نسخهٔ اجرایی بدون REFERENCES نوشته شده؛ یکپارچگی در کد API رعایت می‌شود.)
-- ============================================================

PRAGMA foreign_keys = ON;

-- ---------- کارشناسان ----------
CREATE TABLE IF NOT EXISTS experts (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,     -- دقیقاً نام راهکاران (نرمال‌شده)
  label         TEXT,                     -- نام کوتاه واحد
  code          TEXT NOT NULL UNIQUE,     -- کد ورود
  active        INTEGER NOT NULL DEFAULT 1,
  speed         REAL    NOT NULL DEFAULT 1.0,   -- ضریب سرعت (مهلت هوشمند)
  telegram_chat TEXT,                     -- گفت‌وگوی خصوصی بات با کارشناس
  -- تیم کارشناسی (تصمیم مدیر، شهریور ۱۴۰۵؛ تب «کارشناسان» پنل مدیر)
  senior        INTEGER,                  -- ۱ = کارشناس ارشد (ستاره)
  senior_id     INTEGER,                  -- سرپرست این کارشناس (یک ارشد)
  notify_to     TEXT,                     -- manager | senior — اعلان‌های پایش این کارشناس برای مدیر بیاید یا فقط ارشدش
  team_chat     TEXT,                     -- گروه تلگرام تیمِ ارشد (اعلان زیرمجموعه‌ها)
  alert_stages  TEXT,                     -- JSON شش تیک: کدام مرحله‌ها به گروه تیم اعلام شود
  created_at    INTEGER NOT NULL
);

-- ---------- بارگذاری‌های اکسل ----------
CREATE TABLE IF NOT EXISTS imports (
  id            INTEGER PRIMARY KEY,
  filename      TEXT,
  imported_at   INTEGER NOT NULL,
  row_count     INTEGER,
  request_count INTEGER,
  stats_json    TEXT                      -- خلاصهٔ آمار و تعارض‌ها
);

-- ---------- درخواست‌ها (ستون‌های سطح درخواست از راهکاران) ----------
CREATE TABLE IF NOT EXISTS requests (
  id              TEXT PRIMARY KEY,       -- شماره درخواست
  date            TEXT NOT NULL,          -- تاریخ درخواست (شمسی)
  party           TEXT NOT NULL,          -- طرف مقابل
  party_type      TEXT,                   -- مرکز هزینه / پروژه / شخص‌شرکت
  center          TEXT,                   -- مرکز درخواست کننده
  requester       TEXT,                   -- درخواست کننده
  req_type        TEXT,                   -- نوع درخواست خرید
  buy_type        TEXT,                   -- نوع خرید
  buy_flow        TEXT,                   -- روند خرید
  urgency         TEXT,                   -- رمز فوریت
  first_import_id INTEGER REFERENCES imports(id),
  last_import_id  INTEGER REFERENCES imports(id),
  -- سرآیند فرم کمیسیون (قابل ویرایش کارشناس)
  head_req_type   TEXT DEFAULT 'عادی',
  head_deal_type  TEXT DEFAULT 'خرید',
  head_site       TEXT,
  -- ستون‌های خروجی تازهٔ راهکاران (شهریور ۱۴۰۵) — برگهٔ درخواست خرید از این‌ها پر می‌شود
  supply_unit     TEXT,                   -- واحد رمز/تامین
  item_type       TEXT,                   -- نوع قلم (کالا / خدمت)
  basis_type      TEXT, basis_no TEXT,    -- نوع مبنا / شماره مبنا
  contract_kind   TEXT, contract_no TEXT  -- نوع الگو سند قراردادی / شماره قرارداد
);
CREATE INDEX IF NOT EXISTS ix_requests_date  ON requests(date);
CREATE INDEX IF NOT EXISTS ix_requests_party ON requests(party);

-- ---------- ارجاع: (درخواست، کارشناس) ----------
CREATE TABLE IF NOT EXISTS assignments (
  id            INTEGER PRIMARY KEY,
  request_id    TEXT    NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  expert_id     INTEGER NOT NULL REFERENCES experts(id),
  days          INTEGER,                  -- مهلت (روز کاری)
  dispatched_at INTEGER,                  -- NULL = هنوز ارسال نشده
  viewed_at     INTEGER,                  -- مرحلهٔ «مشاهده»
  commission_at INTEGER,                  -- مرحلهٔ «جدول کمیسیون»
  commission_no INTEGER,                  -- شمارهٔ ترتیبی فرم (کد TSA-PS-FO-n)؛ یک بار، هنگام اولین تولید
  created_at    INTEGER NOT NULL,
  UNIQUE(request_id, expert_id)
);

-- شمارنده‌های سراسری (فعلاً فقط 'commission': آخرین شمارهٔ جدول کمیسیون)
CREATE TABLE IF NOT EXISTS counters (
  key   TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_assign_expert ON assignments(expert_id, dispatched_at);

-- ---------- اقلام ----------
CREATE TABLE IF NOT EXISTS items (
  id             INTEGER PRIMARY KEY,
  request_id     TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  item_key       TEXT NOT NULL,           -- عنوان نرمال‌شده (+ «#n» برای عنوان تکراری در همان درخواست)؛
                                          -- کلید یکتای قلم که در خروجی روزانه (بی‌کد) و کامل (با کد) یکی است
  line_no        INTEGER NOT NULL,        -- ترتیب در فایل (فقط نمایش)
  code           TEXT,                    -- کد قلم خریدنی — فقط در خروجی کامل راهکاران هست، در روزانه NULL
  title          TEXT NOT NULL,
  spec           TEXT,                    -- مشخصه فنی
  qty            REAL,
  unit           TEXT,
  need_date      TEXT,                    -- تاریخ نیاز (شمسی)
  consumer       TEXT,                    -- مصرف کننده
  note           TEXT,                    -- توضیحات
  src_status     TEXT,                    -- وضعیت خام راهکاران (برای نمایش)
  src_expert     TEXT,                    -- کارشناس خام راهکاران
  -- چرخهٔ عمر در سامانه: open | hold | stop | closed
  state          TEXT NOT NULL DEFAULT 'open',
  state_at       INTEGER,
  assignment_id  INTEGER REFERENCES assignments(id) ON DELETE SET NULL,
  hist_code      TEXT,                    -- کد استاندارد سوابق («نرمال‌سازی اقلام» — مرحلهٔ بعد)
  hist_done_at   INTEGER,                 -- مرحلهٔ «بررسی سوابق»
  smart_done_at  INTEGER,                 -- مرحلهٔ «جستجوی هوشمند»
  commission_ok  INTEGER NOT NULL DEFAULT 0,  -- تأیید کمیسیون این قلم
  quote_deadline TEXT,                    -- مهلت استعلام (ستون فایل راهکاران)
  currency       TEXT, fee REAL, amount REAL,  -- ارز / فی / مبلغ (بایگانی)
  UNIQUE(request_id, item_key)
);
CREATE INDEX IF NOT EXISTS ix_items_request ON items(request_id);
CREATE INDEX IF NOT EXISTS ix_items_assign  ON items(assignment_id);
CREATE INDEX IF NOT EXISTS ix_items_state   ON items(state);

-- ---------- استعلامات ----------
CREATE TABLE IF NOT EXISTS quotes (
  id             INTEGER PRIMARY KEY,
  assignment_id  INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  item_id        INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  supplier_name  TEXT NOT NULL,
  supplier_code  TEXT,
  spec           TEXT,                    -- جنس / مشخصات فنی
  unit           TEXT,
  qty            REAL,
  price          REAL,                    -- قیمت واحد (ریال)
  dtime          TEXT,                    -- زمان تحویل (شمسی)
  valid_days     TEXT,                    -- اعتبار پیش‌فاکتور (روز)
  ship           TEXT,                    -- روش حمل
  invoice        TEXT,                    -- رسمی / غیر رسمی
  pay            TEXT,                    -- شرایط تسویه
  deal           TEXT,                    -- محل معامله: کارگاه / دفتر مرکزی
  place          TEXT,                    -- محل تحویل
  place_other    TEXT,
  saved          INTEGER NOT NULL DEFAULT 0,   -- ثبت موقت
  final          INTEGER NOT NULL DEFAULT 0,   -- تأیید نهایی برای کمیسیون
  low_conf       INTEGER NOT NULL DEFAULT 0,   -- پرشده از استخراج کم‌اطمینان
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_quotes_assign ON quotes(assignment_id);

-- ---------- پیش‌فاکتورها (فایل در R2 — زیرساخت) ----------
CREATE TABLE IF NOT EXISTS proformas (
  id             INTEGER PRIMARY KEY,
  assignment_id  INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  supplier_name  TEXT NOT NULL,
  filename       TEXT,
  storage_key    TEXT,                    -- کلید فایل در انبار (پیش‌تر r2_key)
  mime           TEXT,
  size_bytes     INTEGER,
  source         TEXT,                    -- panel | telegram
  item_ids       TEXT,                    -- JSON: پیش‌فاکتور فقط برای همین اقلام (بات)؛ خالی = همهٔ اقلام
  extracted_json TEXT,                    -- خروجی خام استخراج مدل (INV-15)
  extract_state  TEXT,                    -- pending | ok | refused | failed
  extract_at     INTEGER,
  uploaded_at    INTEGER NOT NULL,
  UNIQUE(assignment_id, supplier_name)
);

-- ---------- تأمین‌کنندگان و کانال‌های تماس (زیرساخت سوابق/جستجو) ----------
CREATE TABLE IF NOT EXISTS suppliers (
  id        INTEGER PRIMARY KEY,
  code      TEXT UNIQUE,
  name      TEXT NOT NULL,
  founded   INTEGER,
  city      TEXT,
  site      TEXT,
  phone     TEXT,
  tel2      TEXT,
  email     TEXT,
  note      TEXT,                          -- توضیحات مدیر
  created_at INTEGER NOT NULL
);

-- علامت ✓/✗/— هر پلتفرم برای هر (تأمین‌کننده، قلم) — مشترک بین کارشناسان
CREATE TABLE IF NOT EXISTS supplier_channels (
  supplier_code TEXT NOT NULL,
  item_title    TEXT NOT NULL,
  platform      TEXT NOT NULL,            -- telegram | whatsapp | bale | rubika
  state         TEXT NOT NULL,            -- ok | no | unk
  updated_by    INTEGER REFERENCES experts(id),
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (supplier_code, item_title, platform)
);

-- ---------- سوابق خرید (فایل مرجع مدیر) ----------
-- هر بارگذاری تازه، purchase_history را DROP و از نو می‌سازد و ردیف قبلی این
-- جدول 'stale' می‌شود. DROP به‌جای DELETE، چون پاک‌کردن ۷۰ هزار ردیف در D1
-- ۷۰ هزار «سطر نوشته‌شده» حساب می‌شود.
CREATE TABLE IF NOT EXISTS hist_imports (
  id          INTEGER PRIMARY KEY,
  filename    TEXT,
  imported_at INTEGER NOT NULL,
  finished_at INTEGER,
  row_count   INTEGER,
  state       TEXT NOT NULL DEFAULT 'loading',  -- loading | ready | stale
  stats_json  TEXT                              -- بازهٔ ماه‌ها، شمار تأمین‌کننده/کد، ageMax
);

-- یک ردیف به ازای هر سطر فایل سوابق. مبنای همهٔ جمع‌ها amount_1404 است
-- (مبلغ به نرخ ۱۴۰۴)، نه مبلغ روزِ خرید.
CREATE TABLE IF NOT EXISTS purchase_history (
  id          INTEGER PRIMARY KEY,
  import_id   INTEGER NOT NULL,
  order_date  TEXT,                    -- تاریخ سفارش (شمسی)
  ym          INTEGER,                 -- سال×۱۲ + ماه — فاصلهٔ ماهانه تا اسفند ۱۴۰۴
  item_code   TEXT,                    -- کد قلم خریدنی راهکاران (همان items.code)
  code2       TEXT,                    -- کد قلم جدید (استاندارد) — کلید گروه‌بندی نگارش‌ها
  title       TEXT,
  title_n     TEXT,                    -- عنوان نرمال‌شده، برای تطبیق بی‌کد
  qty         REAL,
  unit        TEXT,
  unit_price  REAL,                    -- فی (روزِ خرید)
  amount      REAL,                    -- مبلغ به ارز عملیاتی (ریال، روزِ خرید)
  supplier    TEXT,
  supplier_n  TEXT,                    -- نام نرمال‌شده، کلید گروه‌بندی تأمین‌کننده
  idx_val     REAL,                    -- شاخص تعدیل
  amount_1404 REAL,                    -- قیمت کل (۱۴۰۴) = idx_val × amount ÷ ۱۰۰
  unit_1404   REAL,                    -- قیمت واحد (۱۴۰۴)
  lvl1 TEXT, lvl2 TEXT, lvl3 TEXT      -- سطح اول/دوم/سوم طبقه‌بندی
);
CREATE INDEX IF NOT EXISTS ix_ph_code2 ON purchase_history(code2);
CREATE INDEX IF NOT EXISTS ix_ph_item  ON purchase_history(item_code);
CREATE INDEX IF NOT EXISTS ix_ph_title ON purchase_history(title_n);
CREATE INDEX IF NOT EXISTS ix_ph_sup   ON purchase_history(supplier_n);

-- ============================================================
-- ثبت‌های سامانه (worker/records.js) — تصمیم مدیر، شهریور ۱۴۰۵:
-- تغییرات مهم با تاریخ و عامل می‌مانند، نه فقط آخرین وضعیت.
-- ============================================================

-- هر تأمین‌کنندهٔ هر جستجوی هوشمند، ردیف‌به‌ردیف (نتیجهٔ کامل همچنان در smart_searches.result_json)
CREATE TABLE IF NOT EXISTS search_suppliers (
  id            INTEGER PRIMARY KEY,
  search_id     INTEGER NOT NULL,          -- smart_searches.id
  idx           INTEGER NOT NULL,          -- ردیف در نتیجه
  item_id       INTEGER, assignment_id INTEGER, request_id TEXT, expert_id INTEGER,
  name          TEXT,
  name_n        TEXT,                      -- نام نرمال‌شده
  type          TEXT, market TEXT, website TEXT,
  emails_json   TEXT,
  price_text    TEXT, price_unit TEXT,
  created_at    INTEGER NOT NULL
);

-- هر شمارهٔ تلفنِ پیداشده، به تفکیک؛ phone کلید نرمال (+پیش‌شماره و رقم)
CREATE TABLE IF NOT EXISTS supplier_phones (
  id INTEGER PRIMARY KEY, search_id INTEGER NOT NULL, idx INTEGER NOT NULL,
  phone TEXT NOT NULL, phone_raw TEXT, supplier_name TEXT, market TEXT, created_at INTEGER NOT NULL
);

-- بررسی پیام‌رسان‌ها: یک ردیف برای هر شماره، یک ستون برای هر پیام‌رسان (ok | no | unk)،
-- مشترک بین همهٔ کارشناسان — هر کس همان شماره را ببیند، وضعیت پیش‌پر است.
-- (جایگزین supplier_channels که کلیدش تأمین‌کننده×قلم بود و هیچ‌وقت پر نشد)
CREATE TABLE IF NOT EXISTS phone_channels (
  phone TEXT PRIMARY KEY, telegram TEXT, whatsapp TEXT, bale TEXT, rubika TEXT,
  updated_by INTEGER, updated_at INTEGER NOT NULL
);
-- هر کلیک، با وضعیت قبلی
CREATE TABLE IF NOT EXISTS phone_channel_log (
  id INTEGER PRIMARY KEY, phone TEXT NOT NULL, platform TEXT NOT NULL, state TEXT NOT NULL,
  prev_state TEXT, expert_id INTEGER, at INTEGER NOT NULL
);

-- تاریخچهٔ ارجاع: assign | unassign | reassign | days | dispatch — با کارشناس، مهلت و منبع (manual | smart)
CREATE TABLE IF NOT EXISTS assignment_log (
  id INTEGER PRIMARY KEY, at INTEGER NOT NULL, action TEXT NOT NULL,
  request_id TEXT, assignment_id INTEGER, expert_id INTEGER, from_expert_id INTEGER,
  days INTEGER, deadline_at INTEGER, item_ids_json TEXT, source TEXT, actor TEXT
);

-- هر تغییرِ تنظیمات مدیر (آستانه‌ها، ضرایب ارجاع و مهلت هوشمند، …) با مقدار قبلی
CREATE TABLE IF NOT EXISTS settings_history (
  id INTEGER PRIMARY KEY, key TEXT NOT NULL, value_json TEXT, prev_json TEXT, at INTEGER NOT NULL, actor TEXT
);
-- هر تغییرِ امتیاز کارشناس (kind=score) یا ضریب گروه/پروژه (kind=weight) با مقدار قبلی
CREATE TABLE IF NOT EXISTS scores_history (
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL, expert_id INTEGER, score_kind TEXT, key TEXT,
  value REAL, prev REAL, at INTEGER NOT NULL, actor TEXT
);

-- خط‌های استعلامِ حذف‌شده: از quotes (و از تب و بات) کامل می‌روند، نسخهٔ کاملشان این‌جا
CREATE TABLE IF NOT EXISTS quotes_deleted (
  id INTEGER PRIMARY KEY, quote_id INTEGER NOT NULL, assignment_id INTEGER, request_id TEXT,
  item_id INTEGER, supplier_name TEXT, row_json TEXT NOT NULL,
  deleted_at INTEGER NOT NULL, deleted_by INTEGER, channel TEXT
);

-- هر جدول کمیسیونِ ساخته‌شده: شماره، زمان، کارشناس، خط‌های تأییدنهایی و توضیحات
CREATE TABLE IF NOT EXISTS commission_tables (
  id INTEGER PRIMARY KEY, assignment_id INTEGER NOT NULL, request_id TEXT, commission_no INTEGER,
  expert_id INTEGER, at INTEGER NOT NULL, channel TEXT, quote_ids_json TEXT, lines_json TEXT, notes TEXT
);

-- تصمیم‌های اعمال‌شده: end (خاتمه) | hold | stop — اقلام، تاریخ، تأییدکننده
CREATE TABLE IF NOT EXISTS closures (
  id INTEGER PRIMARY KEY, assignment_id INTEGER NOT NULL, request_id TEXT, expert_id INTEGER,
  action TEXT NOT NULL, item_ids_json TEXT, closed INTEGER, fully_closed INTEGER,
  actor TEXT, decision_id INTEGER, at INTEGER NOT NULL
);

-- ستون‌های افزوده (COLUMN_MIGRATIONS در api.js):
--   assignments.closed_at              همهٔ اقلام بسته شد
--   smart_searches.item_code/hist_code/title_n/request_id   کلید قلم برای جستجوهای قبلیِ همان قلم
--   quotes.origin (history|smart|manual|proforma), origin_ref (شناسهٔ جستجو), final_at, commission_at

-- ---------- جستجوهای هوشمند (کشف تأمین‌کننده با Claude + جستجوی وب) ----------
-- هر اجرا یک ردیف: قیدهای کارشناس (بازارها/برند/مشخصات/ملاحظات) و کل خروجی
-- JSON مدل. نتیجه در پنل و بات از همین‌جا خوانده می‌شود و رفرش چیزی را نمی‌پراند.
CREATE TABLE IF NOT EXISTS smart_searches (
  id             INTEGER PRIMARY KEY,
  item_id        INTEGER NOT NULL,
  assignment_id  INTEGER,
  expert_id      INTEGER,
  params_json    TEXT,                  -- {markets[], brand, specs, notes, deliveryHint}
  result_json    TEXT,                  -- خروجی <result> پرامپت supplier-discovery
  model          TEXT,
  prompt_version TEXT,
  in_tokens      INTEGER,
  out_tokens     INTEGER,
  cache_read     INTEGER,               -- توکن‌های خوانده از کش
  cache_write    INTEGER,
  searches       INTEGER,               -- تعداد جستجوی وب (هر ۱۰۰۰ تا ۱۰ دلار)
  fetches        INTEGER,
  cost_usd       REAL,                  -- هزینهٔ تقریبیِ همین اجرا
  created_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_smart_item ON smart_searches(item_id);

-- صف جستجوی هوشمندِ بات: جستجو چند دقیقه طول می‌کشد و waitUntil فقط ۳۰ ثانیه
-- فرصت می‌دهد؛ دکمهٔ «اجرا» کار را این‌جا می‌نشاند و Cron هر دقیقه یکی برمی‌دارد.
CREATE TABLE IF NOT EXISTS smart_jobs (
  id             INTEGER PRIMARY KEY,
  item_id        INTEGER NOT NULL,
  assignment_id  INTEGER,
  expert_id      INTEGER NOT NULL,
  chat_id        TEXT NOT NULL,
  params_json    TEXT NOT NULL,
  state          TEXT NOT NULL DEFAULT 'queued',   -- queued | running | done | failed
  search_id      INTEGER,
  error          TEXT,
  created_at     INTEGER NOT NULL,
  started_at     INTEGER,
  finished_at    INTEGER
);
CREATE INDEX IF NOT EXISTS ix_smart_jobs_state ON smart_jobs(state, id);

-- ---------- قالب‌های پیام (پنل و بات؛ worker/templates.js) ----------
CREATE TABLE IF NOT EXISTS templates (
  id         INTEGER PRIMARY KEY,
  expert_id  INTEGER REFERENCES experts(id),   -- NULL = مشترک
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- ---------- تنظیمات مدیر (کلید/مقدار JSON) ----------
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,               -- JSON
  updated_at INTEGER NOT NULL
);

-- ماتریس‌های ارجاع/مهلت هوشمند
CREATE TABLE IF NOT EXISTS expert_scores (
  expert_id INTEGER NOT NULL REFERENCES experts(id) ON DELETE CASCADE,
  kind      TEXT NOT NULL,                -- category | party
  key       TEXT NOT NULL,                -- نام گروه کالایی یا طرف مقابل
  score     INTEGER NOT NULL,             -- ۱ تا ۵
  PRIMARY KEY (expert_id, kind, key)
);
CREATE TABLE IF NOT EXISTS weights (
  kind  TEXT NOT NULL,                    -- category | party
  key   TEXT NOT NULL,
  w     REAL NOT NULL,                    -- ضریب زمان
  PRIMARY KEY (kind, key)
);

-- ---------- تصمیم‌های کارشناس نیازمند تأیید مدیر ----------
CREATE TABLE IF NOT EXISTS decisions (
  id            INTEGER PRIMARY KEY,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  expert_id     INTEGER NOT NULL REFERENCES experts(id),
  action        TEXT NOT NULL,            -- hold | stop | end
  payload_json  TEXT,                     -- مثلاً اقلام تأییدشده برای خاتمه
  requested_at  INTEGER NOT NULL,
  approved_at   INTEGER,
  rejected_at   INTEGER
);

-- ---------- رویدادها / صف اعلان (زیرساخت تلگرام و ممیزی) ----------
CREATE TABLE IF NOT EXISTS events (
  id           INTEGER PRIMARY KEY,
  at           INTEGER NOT NULL,
  actor        TEXT NOT NULL,             -- manager | expert:<id> | system
  kind         TEXT NOT NULL,             -- dispatch | reassign | hold | stop | close | import | notify ...
  request_id   TEXT,
  item_id      INTEGER,
  payload_json TEXT,
  delivered_at INTEGER                    -- برای اعلان‌ها: زمان ارسال واقعی (بعداً)
);
CREATE INDEX IF NOT EXISTS ix_events_at ON events(at);
