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
  telegram_chat TEXT,                     -- زیرساخت اعلان تلگرام (بعداً)
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
  head_site       TEXT
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
  created_at    INTEGER NOT NULL,
  UNIQUE(request_id, expert_id)
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
  r2_key         TEXT,                    -- کلید فایل در R2 (بعداً)
  extracted_json TEXT,                    -- خروجی استخراج (بعداً)
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

-- ---------- قالب‌های پیام ----------
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
