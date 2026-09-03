// @version 2026-07-12
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  Header,
  Footer,
  PageNumber,
  BorderStyle,
  ShadingType,
  LevelFormat,
  SectionType,
  VerticalAlign,
  PageBreak,
  TableOfContents,
  NumberFormat,
  convertInchesToTwip,
} from "npm:docx@9";
import { DOMParser } from "jsr:@b-fuze/deno-dom";
import { encodeBase64 } from "jsr:@std/encoding/base64";

// ═══════════════════════════════════════════════════════════════════════
// معماری کلی این فایل
// ═══════════════════════════════════════════════════════════════════════
// ۱. یک فایل (معمولاً PDF) از کاربر دریافت می‌شود (base64).
// ۲. فایل به همراه دستورالعمل تحلیلی «تیدا» + یک قرارداد خروجی فنی (JSON)
//    مستقیماً برای مدل claude-opus-4-8 ارسال می‌شود.
// ۳. مدل فقط یک شیء JSON برمی‌گرداند که شامل متادیتای گزارش + بدنهٔ گزارش
//    به صورت HTML ساختاریافته (فقط تگ‌های ساده) است.
// ۴. آن HTML با یک پارسر DOM واقعی (deno-dom) خوانده می‌شود و به عناصر
//    کتابخانه docx (Paragraph / Table / Heading و ...) تبدیل می‌گردد.
// ۵. یک فایل Word رسمی با صفحه جلد، فهرست مطالب (TOC واقعی Word)،
//    سربرگ، پاورقی با شماره صفحه، جدول‌بندی و فونت‌های فارسی B Titr / B Lotus
//    ساخته می‌شود.
//
// نکته مهم دربارهٔ نحوه ارسال پاسخ (Server-Sent Events):
// از آنجا که تحلیل توسط claude-opus-4-8 روی اسناد حقوقی می‌تواند از حد
// معمول (چند ده ثانیه تا چند دقیقه) طول بکشد و بسیاری از پلتفرم‌های
// میزبانی Edge Function در صورت عدم دریافت هیچ داده‌ای از سرور در یک بازه
// زمانی مشخص، اتصال را با خطا قطع می‌کنند، این تابع پاسخ را به‌صورت یک
// جریان متنی (ReadableStream با فرمت text/event-stream) برمی‌گرداند:
//   - در حین انتظار برای پاسخ Claude، هر چند ثانیه یک بستهٔ کوچک «ضربان
//     قلب» (heartbeat) به کلاینت فرستاده می‌شود تا اتصال زنده بماند.
//   - در پایان، یک بستهٔ نهایی حاوی فایل Word به‌صورت base64 و نام فایل
//     فرستاده می‌شود.
// فرانت‌اند این بسته‌های heartbeat را به کاربر نمایش نمی‌دهد؛ فقط منتظر
// می‌ماند تا بستهٔ نهایی حاوی فایل برسد.
//
// نکته مهم دربارهٔ فونت‌ها: کتابخانه docx فونت را «ارجاع» می‌دهد نه «جاسازی».
// یعنی فایل خروجی از فونت‌های B Titr و B Lotus استفاده می‌کند، اما این دو
// فونت باید روی سیستمی که فایل باز می‌شود نصب باشند تا دقیقاً همان‌طور که
// انتظار می‌رود نمایش داده شوند؛ در غیر این صورت Word با فونت جایگزین
// نمایش می‌دهد (محتوا و ساختار سالم می‌ماند).
//
// نکته مهم دربارهٔ فهرست مطالب: فهرست مطالب به صورت یک «فیلد واقعی Word»
// ساخته می‌شود (نه یک لیست ایستا). Word معمولاً هنگام باز شدن فایل آن را
// خودش محاسبه می‌کند (به دلیل فعال بودن گزینه updateFields)؛ اگر در برخی
// نسخه‌های Word/LibreOffice به‌صورت خودکار محاسبه نشد، کافی است کاربر
// Ctrl+A و سپس F9 را بزند — همین راهنما در بالای فهرست مطالب هم نوشته شده.
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
// تنظیمات و ثابت‌ها
// ═══════════════════════════════════════════════════════════════════════
const COMPANY_NAME = "شرکت تونل سد آریانا";
const COMPANY_SUBTITLE = "اداره حقوقی";
const MODEL_NAME = "claude-opus-4-8";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

// حداکثر توکن خروجی مدل. اگر گزارش‌های شما طولانی‌تر از حد معمول هستند و با
// خطای "max_tokens" مواجه می‌شوید، این عدد را افزایش دهید؛ اما پیش از آن
// در مستندات رسمی docs.claude.com سقف مجاز خروجی برای مدل claude-opus-4-8
// را بررسی کنید (این سقف بسته به نسخه مدل متفاوت است و ممکن است نیاز به
// هدر anthropic-beta جداگانه داشته باشد). همچنین توجه کنید Edge Function ها
// سقف زمانی اجرا دارند؛ اگر با تایم‌اوت پلتفرم Supabase مواجه شدید، این
// عدد را کاهش دهید یا معماری را به حالت صف/استریم تغییر دهید.
const MAX_OUTPUT_TOKENS = 16000;

// این تایم‌اوت دیگر مسئول اصلی جلوگیری از خطای تایم‌اوت پلتفرم نیست (آن
// نقش را heartbeat جریان SSE بر عهده دارد)؛ این فقط یک «شبکهٔ ایمنی» است
// تا اگر ارتباط با Claude به هر دلیلی برای همیشه معلق بماند، درخواست پس
// از این مدت با یک پیام خطای روشن به پایان برسد.
const CLAUDE_REQUEST_TIMEOUT_MS = 600_000; // ۱۰ دقیقه

// فاصلهٔ زمانی ارسال بستهٔ «ضربان قلب» به کلاینت در حین انتظار برای پاسخ
// Claude (میلی‌ثانیه). این عدد باید به‌وضوح کوتاه‌تر از سقف تایم‌اوت
// idle پلتفرم میزبانی شما باشد. عدد پیش‌فرض برای اغلب پلتفرم‌ها امن است.
const HEARTBEAT_INTERVAL_MS = 12_000;

// حداکثر حجم مجاز کل فایل‌های ارسالی (برای جلوگیری از خطای غیرضروری در
// سمت Anthropic API و جلوگیری از تایم‌اوت). عدد بر حسب مگابایت (تخمینی
// بر اساس طول رشته base64) است.
const MAX_TOTAL_FILE_SIZE_MB = 28;

const HEADING_FONT = "B Titr";
const BODY_FONT = "B Lotus";
const BODY_SIZE = 24;   // 12pt — واحد docx نصف‌پوینت است
const HEADING1_SIZE = 34; // 17pt
const HEADING2_SIZE = 28; // 14pt
const HEADING3_SIZE = 24; // 12pt bold

// ─── پالت رنگی برند آریانا ────────────────────────────────────────────
// Primary Brand Colors
const C_PRIMARY    = "1E388C"; // آبی اصلی لوگو
const C_PRIMARY_LT = "EAF0FB"; // پس‌زمینه آبی بسیار روشن
const C_PRIMARY_MD = "4F6FB2"; // آبی متوسط

// Table Colors
const C_BG_ALT    = "F7FAFE"; // ردیف‌های زوج
const C_BORDER    = "AFC4E6"; // حاشیه اصلی
const C_BORDER_LT = "DCE7F5"; // حاشیه داخلی

// Text
const C_TEXT       = "1F2937"; // متن اصلی
const C_TEXT_LIGHT = "6B7280"; // متن فرعی

// Risk Colors
const C_CRITICAL = "B91C1C";
const C_HIGH     = "DC2626";
const C_MEDIUM   = "D97706";
const C_LOW      = "15803D";
// ──────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIDENTIALITY =
  "این گزارش صرفاً جهت استفاده داخلی واحد حقوقی شرکت تونل سد آریانا تهیه شده است و افشا یا انتشار آن به اشخاص ثالث بدون مجوز کتبی ممنوع می‌باشد.";

// ═══════════════════════════════════════════════════════════════════════
// هدرهای CORS
// ═══════════════════════════════════════════════════════════════════════
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  // بدون این هدر، جاوااسکریپت سمت فرانت‌اند (fetch) اجازه خواندن
  // Content-Disposition را ندارد و نمی‌تواند نام فایل واقعی را استخراج کند.
  "Access-Control-Expose-Headers": "Content-Disposition",
};

// ═══════════════════════════════════════════════════════════════════════
// تایپ‌ها
// ═══════════════════════════════════════════════════════════════════════
interface FileContent {
  name: string;
  content: string; // داده base64 یا متن خام
  encoding: "base64" | "text";
  media_type: string; // مثلاً application/pdf یا text/plain
}

interface AnalysisRequest {
  question?: string;
  fileContents: FileContent[];
}

interface ReportData {
  reportTitle: string;
  documentType: string;
  subject: string;
  legalRegime: string;
  legalField: string;
  confidentiality: string;
  html: string;
}

// ═══════════════════════════════════════════════════════════════════════
// دستورالعمل تحلیلی «تیدا» (سیستم پرامپت اصلی مدل)
// ═══════════════════════════════════════════════════════════════════════
const TIDA_SYSTEM_PROMPT = `
شما «تیدا» (Tunnel Intelligent Document Analyzer)، دستیار هوشمند تحلیل حقوقی دپارتمان حقوقی شرکت تونل سد آریانا هستید.

وظیفه اصلی شما ارائه تحلیل حقوقی عمیق، دقیق، کاربردی و حرفه‌ای از اسناد بارگذاری‌شده است. هدف شما پاسخ به سؤال کاربر یا ارائه اطلاعات عمومی نیست، بلکه باید با نگاه یک مدیر حقوقی ارشد، وضعیت حقوقی موضوع را ارزیابی کرده و به تصمیم‌گیری آگاهانه و کاهش ریسک‌های شرکت کمک کنید.

در تمام تحلیل‌ها، همواره منافع مشروع شرکت تونل سد آریانا را به عنوان اصل راهبردی در نظر بگیرید و تحلیل را از منظر حفظ حقوق، منافع و کاهش ریسک‌های شرکت انجام دهید.

پیش از شروع تحلیل، ابتدا ماهیت سند را تشخیص دهید. مشخص کنید سند از چه نوعی است (مانند قرارداد، رأی دادگاه، دادخواست، لایحه، بیمه‌نامه، ضمانت‌نامه، مناقصه، مکاتبه رسمی، گزارش کارشناسی، سند مالی، سند فنی یا هر سند دیگر)، به چه زبانی تنظیم شده، تابع چه نظام حقوقی و چه حوزه قضایی است و هدف اصلی سند چیست.

در صورتی که سند متعلق به نظام حقوقی ایران باشد، تحلیل را مطابق قوانین جمهوری اسلامی ایران، اصول حقوقی، رویه قضایی و مقررات مرتبط انجام دهید. اگر سند متعلق به کشور دیگری باشد، تحلیل را بر اساس قوانین همان کشور و در صورت لزوم قواعد و اصول پذیرفته‌شده حقوق بین‌الملل انجام دهید.

اگر سند ماهیت حقوقی نداشته باشد، آن را از مناسب‌ترین منظر حقوقی، قراردادی، مالی، تجاری یا مدیریتی که برای شرکت مفیدتر است تحلیل کنید و آثار احتمالی آن را بر وضعیت حقوقی و منافع شرکت بررسی نمایید.

در تمام تحلیل‌ها صرفاً به ظاهر سند اکتفا نکنید. تلاش کنید هدف واقعی سند، روابط حقوقی میان طرفین، آثار احتمالی، تعهدات آشکار و پنهان، حقوق ایجادشده، محدودیت‌ها، مسئولیت‌ها و پیامدهای احتمالی آن را شناسایی و ارزیابی کنید.

ریسک‌های موجود را صرفاً فهرست نکنید، بلکه آن‌ها را تحلیل نمایید. برای هر ریسک، علت ایجاد، پیامدهای احتمالی، میزان اهمیت، احتمال وقوع و آثار حقوقی، مالی، قراردادی، اجرایی، اعتباری یا مدیریتی آن را بررسی کنید و در صورت امکان راهکار عملی برای کاهش یا کنترل ریسک ارائه دهید.

در تحلیل خود تنها به قوانین اکتفا نکنید. در صورت نیاز از اصول حقوقی، رویه قضایی، عرف تجاری، قواعد قراردادی، اصول حسن نیت، تفسیر قراردادها و سایر مبانی معتبر حقوقی نیز استفاده کنید.

در مواردی که سند دارای ابهام، نقص، تعارض، سکوت، تناقض یا خطر بالقوه باشد، آن موارد را به‌صورت شفاف مشخص کرده و آثار احتمالی هر یک را توضیح دهید.

اگر چند برداشت حقوقی معتبر از موضوع وجود داشته باشد، همه برداشت‌های مهم را مطرح کنید، نقاط قوت و ضعف هر دیدگاه را بیان نمایید و مشخص کنید کدام برداشت از نظر شما محتمل‌تر است و چرا.

هرگز قانون، رأی، ماده قانونی، مرجع، رویه قضایی یا واقعیتی را جعل نکنید. اگر نسبت به موضوعی اطمینان کافی ندارید، میزان عدم اطمینان را صادقانه اعلام کرده و توضیح دهید برای رسیدن به نتیجه قطعی چه اطلاعات یا مدارک دیگری مورد نیاز است.

از ارائه پاسخ‌های کلی، دانشگاهی، آموزشی یا صرفاً تئوریک خودداری کنید. تحلیل شما باید کاملاً کاربردی، حرفه‌ای، تصمیم‌محور و متناسب با نیاز مدیران و کارشناسان حقوقی شرکت باشد.

در صورت مشاهده نقاط قوت سند نیز آن‌ها را بیان کنید و صرفاً بر ریسک‌ها تمرکز نداشته باشید.

در تمام مراحل تحلیل، سعی کنید علاوه بر پاسخ به درخواست کاربر، نکات مهم، ریسک‌های پنهان، فرصت‌های حقوقی و موضوعاتی را که ممکن است مورد توجه کاربر قرار نگرفته باشند اما از نظر حقوقی اهمیت دارند نیز شناسایی و بررسی کنید.

در صورتی که کاربر موضوع یا زاویه خاصی برای تحلیل مشخص کرده باشد، تمرکز اصلی خود را بر همان موضوع قرار دهید، اما در صورت مشاهده ریسک‌های مهم خارج از درخواست کاربر نیز آن‌ها را به‌عنوان نکات تکمیلی مطرح کنید.

همیشه تحلیل خود را به گونه‌ای انجام دهید که نتیجه آن برای استفاده عملی در تصمیم‌گیری‌های حقوقی، قراردادی، تجاری و مدیریتی قابل اتکا باشد و ارزش افزوده‌ای فراتر از یک پاسخ معمولی هوش مصنوعی ایجاد کند.

هدف نهایی شما این است که مانند یک مدیر حقوقی ارشد با تجربه، اسناد را تحلیل کنید؛ نه مانند یک مدل زبانی که صرفاً متن تولید می‌کند.

 در تمام جدول‌های گزارش، محتوای هر سلول باید به‌صورت جمله یا پاراگراف کوتاه، روان و رسمی نوشته شود؛ نه به‌صورت عبارت اسمی، تیتر، کلیدواژه یا فهرست‌وار. هر ریسک، یافته، توضیح یا پیشنهاد باید به‌گونه‌ای نگارش شود که به‌تنهایی برای خواننده قابل فهم باشد و مفهوم را به‌طور کامل منتقل کند. از نوشتن عبارات ناقص یا تلگرافی مانند «بی‌اعتباری شرط فسخ»، «ابهام در تعهدات» یا «عدم تعیین مرجع صالح» خودداری کن و آن‌ها را به جملات کامل و حرفه‌ای تبدیل کن.
 
این گزارش را برای وکلای شرکت داری تنظیم میکنی پس مراجعه به وکیل و گرفتن مشاوره از وکیل رو پیشنهاد نده
`;

// ═══════════════════════════════════════════════════════════════════════
// قرارداد فنی خروجی (Output Contract)
// این بخش تعیین می‌کند مدل دقیقاً در چه قالبی پاسخ بدهد تا سامانه بتواند
// آن را بدون خطا به فایل Word تبدیل کند. این بخش هیچ تغییری در عمق یا
// رویکرد تحلیلی «تیدا» ایجاد نمی‌کند و فقط قالب خروجی را مشخص می‌کند.
// ═══════════════════════════════════════════════════════════════════════
const OUTPUT_FORMAT_INSTRUCTIONS = `
────────────────────────────────────────
دستورالعمل الزامی قالب خروجی فنی (Output Contract)
────────────────────────────────────────
در تمام جدول‌های گزارش، محتوای هر سلول باید به‌صورت جمله یا پاراگراف کوتاه، روان و رسمی نوشته شود؛ نه به‌صورت عبارت اسمی، تیتر، کلیدواژه یا فهرست‌وار. هر ریسک، یافته، توضیح یا پیشنهاد باید به‌گونه‌ای نگارش شود که به‌تنهایی برای خواننده قابل فهم باشد و مفهوم را به‌طور کامل منتقل کند. از نوشتن عبارات ناقص یا تلگرافی مانند «بی‌اعتباری شرط فسخ»، «ابهام در تعهدات» یا «عدم تعیین مرجع صالح» خودداری کن و آن‌ها را به جملات کامل و حرفه‌ای تبدیل کن.

خروجی نهایی شما مستقیماً توسط یک سامانه خودکار خوانده و به یک فایل Word رسمی تبدیل می‌شود. رعایت دقیق و بدون استثنای قواعد زیر الزامی است.

۱. خروجی شما باید فقط و فقط یک شیء JSON معتبر (valid JSON) باشد. هیچ متن، توضیح، مقدمه، موخره، یا بلوک کد (مثل \`\`\`json) نباید قبل یا بعد از آن قرار بگیرد. اولین کاراکتر خروجی باید { و آخرین کاراکتر باید } باشد.

۲. ساختار دقیق JSON باید دقیقاً به این شکل باشد (نام کلیدها دقیقاً همین‌ها):

{
  "reportTitle": "عنوان کامل و اختصاصی گزارش، متناسب با موضوع سند بررسی‌شده",
  "documentType": "نوع سند بررسی‌شده مطابق تشخیص شما",
  "subject": "موضوع گزارش در یک جمله کوتاه",
  "legalRegime": "نظام حقوقی حاکم بر سند",
  "legalField": "حوزه تخصصی حقوقی مرتبط",
  "confidentiality": "یک جمله کوتاه درباره محرمانگی گزارش",
  "html": "بدنه کامل گزارش، به صورت یک رشته HTML معتبر"
}

۳. مقدار فیلد "html" باید تمام بدنه گزارش حقوقی را طبق دستورالعمل تحلیلی بالا در بر بگیرد و فقط و فقط شامل این تگ‌ها باشد: h1, h2, h3, p, strong, em, ul, ol, li, table, thead, tbody, tr, th, td, br. هیچ style، class، id، تصویر یا هر تگ دیگری (مثل div یا span) استفاده نشود.

۴. برای عناوین سطح اول (h1) دقیقاً و فقط از عناوین زیر و فقط به همین ترتیب استفاده کن؛ هر بخشی که به پرونده مرتبط نیست را کامل حذف کن و هرگز بخش خالی نساز:

خلاصه مدیریتی
شرح موضوع
تحلیل حقوقی
ریسک‌ها
پیشنهادهای اصلاحی
گزینه‌های قابل تصمیم
نتیجه کارشناسی

۵. در صورت نیاز به زیرعنوان داخل «تحلیل حقوقی» یا سایر بخش‌ها، از h2 و در صورت لزوم از h3 استفاده کن.

۶. جدول «ریسک‌ها» در صورت وجود ریسک، باید حتماً با تگ table و دقیقاً با همین چهار ستون ساخته شود: ریسک | شدت | اثر | راهکار. مقدار ستون «شدت» باید دقیقاً و فقط یکی از این چهار کلمه باشد (بدون هیچ کلمه اضافه): کم، متوسط، زیاد، بحرانی.

۷. برای تأکید فقط از strong استفاده کن. از ایموجی، نویسه‌های تزیینی، خط‌های تزیینی (مثل ====) یا هر نشانه غیرمتنی خودداری کن.

۸. تمام محتوای متنی باید فارسی، رسمی، حقوقی و کاملاً مطابق عمق و رویکرد تحلیلی توصیف‌شده در دستورالعمل بالا باشد.

۹. اگر اطلاعات سند برای پاسخ‌گویی به بخشی از گزارش کافی نبود، این موضوع را صریحاً و در همان بخش (داخل html) اعلام کن؛ هرگز هیچ قانون، ماده، رأی یا واقعیتی را جعل نکن.
`;
const FULL_SYSTEM_PROMPT = `${TIDA_SYSTEM_PROMPT}\n${OUTPUT_FORMAT_INSTRUCTIONS}`;

// ═══════════════════════════════════════════════════════════════════════
// فراخوانی Claude API
// ═══════════════════════════════════════════════════════════════════════
function estimateTotalSizeMb(files: FileContent[]): number {
  let bytes = 0;
  for (const f of files) {
    bytes += f.encoding === "base64" ? f.content.length * 0.75 : f.content.length;
  }
  return bytes / (1024 * 1024);
}

function buildUserContentBlocks(question: string, files: FileContent[]) {
  // deno-lint-ignore no-explicit-any
  const blocks: any[] = [];

  for (const file of files) {
    if (file.encoding === "base64") {
      blocks.push({
        type: "document",
        source: {
          type: "base64",
          media_type: file.media_type || "application/pdf",
          data: file.content,
        },
        title: file.name?.slice(0, 200) || "سند پیوست",
      });
    } else {
      blocks.push({
        type: "text",
        text: `--- محتوای فایل: ${file.name} ---\n${file.content}`,
      });
    }
  }

  const instruction = question && question.trim().length > 0
    ? `سؤال یا درخواست مشخص کاربر:\n${question.trim()}\n\nسند(های) پیوست را بر اساس همین درخواست و طبق دستورالعمل تحلیلی سیستم بررسی کن و پاسخ را دقیقاً و فقط در قالب JSON خواسته‌شده در «دستورالعمل الزامی قالب خروجی فنی» ارائه بده.`
    : `کاربر سؤال یا زاویه خاصی مطرح نکرده است. سند(های) پیوست را به طور کامل شناسایی و مطابق دستورالعمل تحلیلی، یک تحلیل حقوقی جامع تهیه کن و پاسخ را دقیقاً و فقط در قالب JSON خواسته‌شده در «دستورالعمل الزامی قالب خروجی فنی» ارائه بده.`;

  blocks.push({ type: "text", text: instruction });
  return blocks;
}

async function callClaudeForAnalysis(
  apiKey: string,
  question: string,
  files: FileContent[],
): Promise<ReportData> {
  const contentBlocks = buildUserContentBlocks(question, files);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CLAUDE_REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: FULL_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: contentBlocks,
          },
        ],
      }),
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(
        `پاسخ سرویس هوش مصنوعی کلود بیش از ${Math.round(CLAUDE_REQUEST_TIMEOUT_MS / 60000)} دقیقه طول کشید و به‌عنوان اقدام ایمنی درخواست لغو شد. اگر این خطا مکرراً رخ می‌دهد، سند را کوتاه‌تر کنید یا CLAUDE_REQUEST_TIMEOUT_MS را افزایش دهید.`,
      );
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `خطا در ارتباط با سرویس هوش مصنوعی کلود (کد ${response.status}): ${errText}`,
    );
  }

  const data = await response.json();

  if (data?.stop_reason === "max_tokens") {
    throw new Error(
      "پاسخ مدل به دلیل طولانی بودن ناتمام ماند. مقدار MAX_OUTPUT_TOKENS را در کد افزایش دهید یا سؤال را دقیق‌تر/محدودتر مطرح کنید.",
    );
  }

  // deno-lint-ignore no-explicit-any
  const rawText: string = (data?.content ?? [])
    .filter((block: any) => block.type === "text")
    .map((block: any) => block.text as string)
    .join("\n")
    .trim();

  if (!rawText) {
    throw new Error("پاسخ خالی از مدل هوش مصنوعی دریافت شد.");
  }

  return parseReportJson(rawText);
}

function parseReportJson(raw: string): ReportData {
  let cleaned = raw.trim();
  // حذف احتمالی بلوک‌های کد مارک‌داون در صورتی که مدل با وجود دستورالعمل درج کرده باشد
  cleaned = cleaned.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("پاسخ مدل هوش مصنوعی در قالب JSON معتبر نبود.");
  }

  const jsonSlice = cleaned.slice(start, end + 1);
  // deno-lint-ignore no-explicit-any
  let parsed: any;
  try {
    parsed = JSON.parse(jsonSlice);
  } catch (e) {
    throw new Error(
      `خطا در تجزیه خروجی JSON مدل: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (!parsed.html || typeof parsed.html !== "string" || parsed.html.trim().length === 0) {
    throw new Error("خروجی مدل فاقد بدنه گزارش (فیلد html) بود.");
  }

  return {
    reportTitle: String(parsed.reportTitle || "گزارش حقوقی"),
    documentType: String(parsed.documentType || "نامشخص"),
    subject: String(parsed.subject || ""),
    legalRegime: String(parsed.legalRegime || ""),
    legalField: String(parsed.legalField || ""),
    confidentiality: String(parsed.confidentiality || DEFAULT_CONFIDENTIALITY),
    html: String(parsed.html),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// تبدیل HTML خروجی مدل به عناصر کتابخانه docx
// ═══════════════════════════════════════════════════════════════════════
function severityShadingFor(text: string): { fill: string; textColor: string } | undefined {
  switch (text.trim()) {
    case "بحرانی": return { fill: C_CRITICAL, textColor: "FFFFFF" };
    case "زیاد":   return { fill: C_HIGH,     textColor: "FFFFFF" };
    case "متوسط":  return { fill: C_MEDIUM,   textColor: "FFFFFF" };
    case "کم":     return { fill: C_LOW,      textColor: "FFFFFF" };
    default:       return undefined;
  }
}

// نویسه نامرئی «علامت راست‌به‌چپ» (RLM) — قبل و بعد از نویسه‌های خنثی مانند
// پرانتز و گیومه درج می‌شود تا موتور بایدی Word این نویسه‌ها را همیشه در
// جهت متن فارسی (راست‌به‌چپ) تفسیر کند، حتی وقتی این نویسه‌ها کنار اعداد
// یا واژه‌های لاتین قرار گرفته‌اند. بدون این اصلاح، پرانتزها و علائم گاهی
// در فایل Word خروجی برعکس (آینه‌ای) نمایش داده می‌شوند.
const RLM = "\u200F";
function fixRtlPunctuation(text: string): string {
  if (!text) return text;
  return text
    .replace(/\(/g, `${RLM}(`)
    .replace(/\)/g, `)${RLM}`)
    .replace(/«/g, `${RLM}«`)
    .replace(/»/g, `»${RLM}`)
    .replace(/[[\]]/g, (m) => `${RLM}${m}${RLM}`);
}

// deno-lint-ignore no-explicit-any
function textRunsFromInline(node: any, bold = false, italics = false, color?: string): TextRun[] {
  const runs: TextRun[] = [];
  const children = node?.childNodes ? Array.from(node.childNodes) : [];

  // deno-lint-ignore no-explicit-any
  for (const child of children as any[]) {
    if (child.nodeType === 3) {
      const text = fixRtlPunctuation(String(child.textContent || "").replace(/[\r\n\t]+/g, " "));
      if (text.length === 0) continue;
      if (text.trim().length === 0) {
        runs.push(new TextRun({ text: " ", font: BODY_FONT, size: BODY_SIZE, bold, italics, rightToLeft: true, ...(color ? { color } : {}) }));
        continue;
      }
      runs.push(new TextRun({ text, font: BODY_FONT, size: BODY_SIZE, bold, italics, rightToLeft: true, ...(color ? { color } : {}) }));
    } else if (child.nodeType === 1) {
      const tag = String(child.tagName || "").toLowerCase();
      if (tag === "br") {
        runs.push(new TextRun({ text: "", break: 1, rightToLeft: true }));
      } else if (tag === "strong" || tag === "b") {
        runs.push(...textRunsFromInline(child, true, italics, color));
      } else if (tag === "em" || tag === "i") {
        runs.push(...textRunsFromInline(child, bold, true, color));
      } else {
        runs.push(...textRunsFromInline(child, bold, italics, color));
      }
    }
  }
  return runs;
}

// deno-lint-ignore no-explicit-any
function buildList(listEl: any, ordered: boolean, level: number): Paragraph[] {
  const result: Paragraph[] = [];
  // deno-lint-ignore no-explicit-any
  const items = Array.from(listEl.children || []).filter(
    (c: any) => String(c.tagName || "").toLowerCase() === "li",
  );

  // deno-lint-ignore no-explicit-any
  for (const li of items as any[]) {
    const nestedLists: unknown[] = [];
    const directChildren: unknown[] = [];

    // deno-lint-ignore no-explicit-any
    for (const child of Array.from(li.childNodes || []) as any[]) {
      const tag = child.nodeType === 1 ? String(child.tagName || "").toLowerCase() : "";
      if (tag === "ul" || tag === "ol") {
        nestedLists.push(child);
      } else {
        directChildren.push(child);
      }
    }

    const runs: TextRun[] = [];
    // deno-lint-ignore no-explicit-any
    for (const dc of directChildren as any[]) {
      if (dc.nodeType === 3) {
        const text = fixRtlPunctuation(String(dc.textContent || "").replace(/[\r\n\t]+/g, " "));
        if (text.trim().length > 0) {
          runs.push(new TextRun({ text, font: BODY_FONT, size: BODY_SIZE, color: C_TEXT, rightToLeft: true }));
        }
      } else if (dc.nodeType === 1) {
        runs.push(...textRunsFromInline({ childNodes: [dc] }, false, false, C_TEXT));
      }
    }
    if (runs.length === 0) {
      runs.push(new TextRun({ text: "", font: BODY_FONT, size: BODY_SIZE, color: C_TEXT, rightToLeft: true }));
    }

    result.push(
      new Paragraph({
        numbering: { reference: ordered ? "ordered-list" : "bullet-list", level: Math.min(level, 1) },
        alignment: AlignmentType.START,
        bidirectional: true,
        children: runs,
      }),
    );

    // deno-lint-ignore no-explicit-any
    for (const nested of nestedLists as any[]) {
      const nestedOrdered = String(nested.tagName || "").toLowerCase() === "ol";
      result.push(...buildList(nested, nestedOrdered, level + 1));
    }
  }

  return result;
}

// deno-lint-ignore no-explicit-any
function buildTable(tableEl: any): Table {
  // deno-lint-ignore no-explicit-any
  const trs: any[] = Array.from(tableEl.querySelectorAll("tr"));
  const tableRows: TableRow[] = [];
  // شمارنده ردیف‌های داده (بدون هدر) برای رنگ‌بندی متناوب
  let dataRowIndex = 0;

  trs.forEach((tr, rowIndex) => {
    // deno-lint-ignore no-explicit-any
    const cellEls: any[] = Array.from(tr.children || []).filter((c: any) =>
      ["td", "th"].includes(String(c.tagName || "").toLowerCase())
    );
    if (cellEls.length === 0) return;

    const isHeaderRow = rowIndex === 0 &&
      cellEls.some((c) => String(c.tagName || "").toLowerCase() === "th");

    // رنگ پس‌زمینه ردیف زوج/فرد (فقط برای ردیف‌های داده)
    const isEvenDataRow = !isHeaderRow && dataRowIndex % 2 === 1;
    if (!isHeaderRow) dataRowIndex++;

    const cells = cellEls.map((cellEl) => {
      const cellText = String(cellEl.textContent || "").trim();
      const severity = !isHeaderRow ? severityShadingFor(cellText) : undefined;

      let fill: string | undefined;
      let textColor: string | undefined;

      if (isHeaderRow) {
        fill = C_PRIMARY;
        textColor = "FFFFFF";
      } else if (severity) {
        fill = severity.fill;
        textColor = severity.textColor;
      } else if (isEvenDataRow) {
        fill = C_BG_ALT;
        textColor = undefined;
      }

      let runs = textRunsFromInline(cellEl, isHeaderRow, false, textColor);
      if (runs.length === 0) {
        runs = [
          new TextRun({
            text: fixRtlPunctuation(cellText),
            font: BODY_FONT,
            size: BODY_SIZE,
            bold: isHeaderRow,
            rightToLeft: true,
            ...(textColor ? { color: textColor } : { color: C_TEXT }),
          }),
        ];
      }

      return new TableCell({
        width: { size: Math.floor(100 / Math.max(cellEls.length, 1)), type: WidthType.PERCENTAGE },
        shading: fill ? { type: ShadingType.CLEAR, fill, color: "auto" } : undefined,
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 110, bottom: 110, left: 150, right: 150 },
        children: [
          new Paragraph({
            alignment: AlignmentType.START,
            bidirectional: true,
            spacing: { line: 300 },
            children: runs,
          }),
        ],
      });
    });

    tableRows.push(new TableRow({ children: cells, tableHeader: isHeaderRow }));
  });

  if (tableRows.length === 0) {
    tableRows.push(
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: "بدون داده", font: BODY_FONT, size: BODY_SIZE, color: C_TEXT_LIGHT })],
              alignment: AlignmentType.START,
              bidirectional: true,
            })],
          }),
        ],
      }),
    );
  }

  return new Table({
    rows: tableRows,
    // چیدمان راست‌به‌چپ ستون‌ها: اولین ستون در سمت راست قرار می‌گیرد
    // (مطابق نگارش فارسی). بدون این تنظیم، ستون‌ها از چپ به راست می‌آیند.
    visuallyRightToLeft: true,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top:              { style: BorderStyle.SINGLE, size: 6, color: C_PRIMARY },
      bottom:           { style: BorderStyle.SINGLE, size: 6, color: C_PRIMARY },
      left:             { style: BorderStyle.SINGLE, size: 4, color: C_BORDER },
      right:            { style: BorderStyle.SINGLE, size: 4, color: C_BORDER },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: C_BORDER_LT },
      insideVertical:   { style: BorderStyle.SINGLE, size: 2, color: C_BORDER_LT },
    },
  });
}

// deno-lint-ignore no-explicit-any
function convertBlockNode(node: any): (Paragraph | Table)[] {
  if (!node) return [];

  if (node.nodeType === 3) {
    const text = fixRtlPunctuation(String(node.textContent || "").trim());
    if (!text) return [];
    return [
      new Paragraph({
        alignment: AlignmentType.START,
        bidirectional: true,
        spacing: { line: 340, after: 140 },
        children: [new TextRun({ text, font: BODY_FONT, size: BODY_SIZE, color: C_TEXT, rightToLeft: true })],
      }),
    ];
  }

  if (node.nodeType !== 1) return [];

  const tag = String(node.tagName || "").toLowerCase();

  switch (tag) {
    case "h1":
      return [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.START,
          bidirectional: true,
          children: textRunsFromInline(node, true, false, C_PRIMARY),
        }),
      ];
    case "h2":
      return [
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          alignment: AlignmentType.START,
          bidirectional: true,
          children: textRunsFromInline(node, true, false, C_PRIMARY_MD),
        }),
      ];
    case "h3":
    case "h4":
      return [
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          alignment: AlignmentType.START,
          bidirectional: true,
          children: textRunsFromInline(node, true, false, C_PRIMARY_MD),
        }),
      ];
    case "p": {
      const runs = textRunsFromInline(node, false, false, C_TEXT);
      if (runs.length === 0) return [];
      return [
        new Paragraph({
          alignment: AlignmentType.START,
          bidirectional: true,
          spacing: { line: 340, after: 180 },
          children: runs,
        }),
      ];
    }
    case "ul":
      return buildList(node, false, 0);
    case "ol":
      return buildList(node, true, 0);
    case "table":
      return [
        // فاصله قبل از جدول
        new Paragraph({ spacing: { before: 160, after: 0 }, children: [] }),
        buildTable(node),
        // فاصله بعد از جدول
        new Paragraph({ spacing: { before: 0, after: 200 }, children: [] }),
      ];
    case "hr":
      return [
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C_BORDER } },
          spacing: { before: 240, after: 240 },
          children: [],
        }),
      ];
    case "div":
    case "section":
    case "body":
    case "span": {
      const out: (Paragraph | Table)[] = [];
      // deno-lint-ignore no-explicit-any
      for (const child of Array.from(node.childNodes) as any[]) {
        out.push(...convertBlockNode(child));
      }
      return out;
    }
    default: {
      const runs = textRunsFromInline(node, false, false, C_TEXT);
      if (runs.length === 0) return [];
      return [new Paragraph({
        alignment: AlignmentType.START,
        bidirectional: true,
        spacing: { line: 340, after: 140 },
        children: runs,
      })];
    }
  }
}

function htmlToDocxElements(html: string): (Paragraph | Table)[] {
  const dom = new DOMParser().parseFromString(`<div id="tida-root">${html}</div>`, "text/html");
  const root = dom?.getElementById("tida-root");
  if (!root) {
    return [
      new Paragraph({
        alignment: AlignmentType.START,
        bidirectional: true,
        children: [new TextRun({ text: "خطا در پردازش محتوای گزارش دریافتی از مدل.", font: BODY_FONT, size: BODY_SIZE })],
      }),
    ];
  }

  const elements: (Paragraph | Table)[] = [];
  // deno-lint-ignore no-explicit-any
  for (const node of Array.from(root.childNodes) as any[]) {
    elements.push(...convertBlockNode(node));
  }

  if (elements.length === 0) {
    elements.push(
      new Paragraph({
        alignment: AlignmentType.START,
        bidirectional: true,
        children: [new TextRun({ text: "محتوایی از مدل هوش مصنوعی دریافت نشد.", font: BODY_FONT, size: BODY_SIZE })],
      }),
    );
  }

  return elements;
}

// ═══════════════════════════════════════════════════════════════════════
// ساخت صفحه جلد، فهرست مطالب، سربرگ و پاورقی
// ═══════════════════════════════════════════════════════════════════════
function buildCoverInfoTable(report: ReportData, dateStr: string): Table {
  const rows: [string, string][] = [
    ["نوع سند بررسی‌شده", report.documentType || "—"],
    ["موضوع", report.subject || "—"],
    ["نظام حقوقی حاکم", report.legalRegime || "—"],
    ["حوزه تخصصی حقوقی", report.legalField || "—"],
    ["تاریخ تهیه گزارش", dateStr],
  ];

  const tableRows = rows.map(([label, value], idx) =>
    new TableRow({
      children: [
        // ستون برچسب (راست)
        new TableCell({
          width: { size: 32, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, fill: C_PRIMARY_LT, color: "auto" },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 120, bottom: 120, left: 180, right: 180 },
          children: [
            new Paragraph({
              alignment: AlignmentType.START,
              bidirectional: true,
              children: [new TextRun({ text: fixRtlPunctuation(label), font: BODY_FONT, size: 22, bold: true, color: C_PRIMARY, rightToLeft: true })],
            }),
          ],
        }),
        // ستون مقدار (چپ)
        new TableCell({
          width: { size: 68, type: WidthType.PERCENTAGE },
          shading: idx % 2 === 0
            ? undefined
            : { type: ShadingType.CLEAR, fill: C_BG_ALT, color: "auto" },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 120, bottom: 120, left: 180, right: 180 },
          children: [
            new Paragraph({
              alignment: AlignmentType.START,
              bidirectional: true,
              children: [new TextRun({ text: fixRtlPunctuation(value), font: BODY_FONT, size: 22, color: C_TEXT, rightToLeft: true })],
            }),
          ],
        }),
      ],
    })
  );

  return new Table({
    rows: tableRows,
    // چیدمان راست‌به‌چپ ستون‌ها: ستون برچسب در سمت راست قرار می‌گیرد.
    visuallyRightToLeft: true,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top:              { style: BorderStyle.SINGLE, size: 6, color: C_PRIMARY },
      bottom:           { style: BorderStyle.SINGLE, size: 6, color: C_PRIMARY },
      left:             { style: BorderStyle.SINGLE, size: 4, color: C_BORDER },
      right:            { style: BorderStyle.SINGLE, size: 4, color: C_BORDER },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: C_BORDER_LT },
      insideVertical:   { style: BorderStyle.SINGLE, size: 2, color: C_BORDER_LT },
    },
  });
}

function buildCoverPage(report: ReportData): (Paragraph | Table)[] {
  const dateStr = new Date().toLocaleDateString("fa-IR", { year: "numeric", month: "long", day: "numeric" });

  return [
    // فاصله بالا
    new Paragraph({ spacing: { before: 800 }, children: [] }),

    // نام شرکت
    new Paragraph({
      alignment: AlignmentType.CENTER,
      bidirectional: true,
      children: [new TextRun({ text: COMPANY_NAME, font: HEADING_FONT, size: 36, bold: true, color: C_PRIMARY })],
    }),

    // زیرعنوان شرکت
    new Paragraph({
      alignment: AlignmentType.CENTER,
      bidirectional: true,
      spacing: { after: 160 },
      children: [new TextRun({ text: COMPANY_SUBTITLE, font: BODY_FONT, size: 22, color: C_TEXT_LIGHT })],
    }),

    // خط جداکننده
    new Paragraph({
      spacing: { after: 800 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: C_PRIMARY_MD, space: 1 } },
      children: [],
    }),

    // عنوان اصلی «گزارش حقوقی»
    new Paragraph({
      alignment: AlignmentType.CENTER,
      bidirectional: true,
      spacing: { before: 600, after: 240 },
      children: [new TextRun({ text: "گزارش حقوقی", font: HEADING_FONT, size: 60, bold: true, color: C_PRIMARY })],
    }),

    // عنوان گزارش
    new Paragraph({
      alignment: AlignmentType.CENTER,
      bidirectional: true,
      spacing: { after: 1000 },
      children: [new TextRun({ text: fixRtlPunctuation(report.reportTitle), font: HEADING_FONT, size: 28, bold: true, color: C_PRIMARY_MD, rightToLeft: true })],
    }),

    // جدول اطلاعات سند
    buildCoverInfoTable(report, dateStr),

    // خط پایین
    new Paragraph({
      spacing: { before: 1600 },
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: C_BORDER, space: 1 } },
      children: [],
    }),

    // متن محرمانگی
    new Paragraph({
      alignment: AlignmentType.CENTER,
      bidirectional: true,
      spacing: { before: 200 },
      children: [
        new TextRun({
          text: fixRtlPunctuation(report.confidentiality || DEFAULT_CONFIDENTIALITY),
          font: BODY_FONT,
          size: 18,
          italics: true,
          color: C_TEXT_LIGHT,
        }),
      ],
    }),
  ];
}

function buildTocIntro(): Array<Paragraph | TableOfContents> {
  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.START,
      bidirectional: true,
      children: [new TextRun({ text: "فهرست مطالب", font: HEADING_FONT, size: HEADING1_SIZE, bold: true, color: C_PRIMARY })],
    }),
    new Paragraph({
      alignment: AlignmentType.START,
      bidirectional: true,
      spacing: { after: 300 },
      children: [
        new TextRun({
          text: "برای مشاهده صحیح شماره صفحات، پس از باز کردن فایل، کلیدهای Ctrl+A و سپس F9 را فشار دهید تا فهرست به‌روزرسانی شود.",
          font: BODY_FONT,
          size: 18,
          italics: true,
          color: C_TEXT_LIGHT,
        }),
      ],
    }),
    new TableOfContents("فهرست مطالب", { hyperlink: true, headingStyleRange: "1-3" }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

function buildHeader(report: ReportData): Header {
  const shortTitle = fixRtlPunctuation(
    report.reportTitle.length > 60 ? report.reportTitle.slice(0, 60) + "…" : report.reportTitle,
  );
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.START,
        bidirectional: true,
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C_PRIMARY_MD, space: 4 } },
        children: [
          new TextRun({ text: `${COMPANY_NAME} — ${shortTitle}`, font: BODY_FONT, size: 16, color: C_TEXT_LIGHT, rightToLeft: true }),
        ],
      }),
    ],
  });
}

function buildFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        bidirectional: true,
        children: [
          new TextRun({
            font: BODY_FONT,
            size: 16,
            color: C_TEXT_LIGHT,
            children: ["صفحه ", PageNumber.CURRENT, " از ", PageNumber.TOTAL_PAGES],
          }),
        ],
      }),
    ],
  });
}

// ═══════════════════════════════════════════════════════════════════════
// پیکربندی شماره‌گذاری لیست‌ها (بولت / شماره‌دار)
// ═══════════════════════════════════════════════════════════════════════
const numberingConfig = {
  config: [
    {
      reference: "bullet-list",
      levels: [
        {
          level: 0,
          format: LevelFormat.BULLET,
          text: "\u2022",
          alignment: AlignmentType.START,
          style: { paragraph: { bidirectional: true, indent: { right: 720, hanging: 360 } } },
        },
        {
          level: 1,
          format: LevelFormat.BULLET,
          text: "\u25E6",
          alignment: AlignmentType.START,
          style: { paragraph: { bidirectional: true, indent: { right: 1080, hanging: 360 } } },
        },
      ],
    },
    {
      reference: "ordered-list",
      levels: [
        {
          level: 0,
          format: LevelFormat.DECIMAL,
          text: "%1.",
          alignment: AlignmentType.START,
          style: { paragraph: { bidirectional: true, indent: { right: 720, hanging: 360 } } },
        },
        {
          level: 1,
          format: LevelFormat.LOWER_LETTER,
          text: "%2.",
          alignment: AlignmentType.START,
          style: { paragraph: { bidirectional: true, indent: { right: 1080, hanging: 360 } } },
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════
// ساخت نهایی فایل Word
// ═══════════════════════════════════════════════════════════════════════
async function generateDocxReport(report: ReportData, bodyElements: (Paragraph | Table)[]): Promise<Uint8Array> {
  const margin = {
    top: convertInchesToTwip(1),
    bottom: convertInchesToTwip(1),
    left: convertInchesToTwip(1),
    right: convertInchesToTwip(1),
  };

  const doc = new Document({
    creator: COMPANY_NAME,
    title: report.reportTitle,
    description: report.subject,
    features: { updateFields: true },
    numbering: numberingConfig,
    styles: {
      default: {
        document: {
          run: { font: BODY_FONT, size: BODY_SIZE, color: C_TEXT },
          paragraph: { alignment: AlignmentType.START, bidirectional: true, spacing: { line: 360, after: 180 } },
        },
      },
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: HEADING_FONT, size: HEADING1_SIZE, bold: true, color: C_PRIMARY },
          paragraph: {
            alignment: AlignmentType.START,
            bidirectional: true,
            spacing: { before: 520, after: 260 },
            outlineLevel: 0,
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C_PRIMARY_MD, space: 4 } },
          },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: HEADING_FONT, size: HEADING2_SIZE, bold: true, color: C_PRIMARY_MD },
          paragraph: {
            alignment: AlignmentType.START,
            bidirectional: true,
            spacing: { before: 360, after: 180 },
            outlineLevel: 1,
          },
        },
        {
          id: "Heading3",
          name: "Heading 3",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: HEADING_FONT, size: HEADING3_SIZE, bold: true, color: C_PRIMARY_MD },
          paragraph: {
            alignment: AlignmentType.START,
            bidirectional: true,
            spacing: { before: 280, after: 140 },
            outlineLevel: 2,
          },
        },
      ],
    },
    sections: [
      {
        properties: { page: { margin } },
        children: buildCoverPage(report),
      },
      {
        properties: {
          type: SectionType.NEXT_PAGE,
          page: { margin, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } },
        },
        headers: { default: buildHeader(report) },
        footers: { default: buildFooter() },
        children: [...buildTocIntro(), ...bodyElements],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return new Uint8Array(buffer);
}

// ═══════════════════════════════════════════════════════════════════════
// توابع کمکی HTTP
// ═══════════════════════════════════════════════════════════════════════
function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "").trim().slice(0, 80) || "گزارش-حقوقی";
}

// ═══════════════════════════════════════════════════════════════════════
// نقطه ورود اصلی Edge Function
// ═══════════════════════════════════════════════════════════════════════
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonError("متد درخواست نامعتبر است. از POST استفاده کنید.", 405);
  }

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return jsonError("کلید ANTHROPIC_API_KEY در بخش Secrets پروژه تنظیم نشده است.", 500);
    }

    let body: AnalysisRequest;
    try {
      body = await req.json();
    } catch {
      return jsonError("بدنه درخواست JSON معتبر نیست.", 400);
    }

    if (!body.fileContents || !Array.isArray(body.fileContents) || body.fileContents.length === 0) {
      return jsonError("هیچ فایلی برای تحلیل ارسال نشده است.", 400);
    }

    const sizeMb = estimateTotalSizeMb(body.fileContents);
    if (sizeMb > MAX_TOTAL_FILE_SIZE_MB) {
      return jsonError(
        `حجم فایل(های) ارسالی (${sizeMb.toFixed(1)} مگابایت) بیش از حد مجاز (${MAX_TOTAL_FILE_SIZE_MB} مگابایت) است.`,
        400,
      );
    }

    // از این نقطه به بعد، اعتبارسنجی‌های اولیه (سریع) پشت سر گذاشته شده و
    // وارد مرحلهٔ کند (تماس با Claude) می‌شویم. پاسخ را به‌صورت یک جریان
    // SSE برمی‌گردانیم تا در حین انتظار، اتصال با ارسال بستهٔ heartbeat
    // زنده نگه داشته شود و پلتفرم میزبانی به دلیل «سکوت» اتصال را قطع نکند.
    const question = body.question ?? "";
    const fileContents = body.fileContents;

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false;
        const sendEvent = (payload: Record<string, unknown>) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          } catch {
            // اگر کلاینت اتصال را قطع کرده باشد، enqueue می‌تواند خطا بدهد؛
            // در این حالت فقط از ارسال‌های بعدی صرف‌نظر می‌کنیم.
            closed = true;
          }
        };

        // بستهٔ heartbeat اولیه — بلافاصله ارسال می‌شود تا کلاینت مطمئن شود
        // درخواست با موفقیت شروع شده است.
        sendEvent({ text: "" });

        const heartbeatId = setInterval(() => sendEvent({ text: "" }), HEARTBEAT_INTERVAL_MS);

        try {
          const report = await callClaudeForAnalysis(apiKey, question, fileContents);
          const bodyElements = htmlToDocxElements(report.html);
          const docxBytes = await generateDocxReport(report, bodyElements);
          const base64Docx = encodeBase64(docxBytes);
          const safeFileName = sanitizeFileName(report.reportTitle);

          sendEvent({ docx: base64Docx, filename: safeFileName });
        } catch (err) {
          console.error("خطا در پردازش درخواست تحلیل حقوقی:", err);
          sendEvent({
            error: `خطا در تولید گزارش: ${err instanceof Error ? err.message : String(err)}`,
          });
        } finally {
          clearInterval(heartbeatId);
          closed = true;
          try {
            controller.close();
          } catch {
            // stream ممکن است از قبل بسته شده باشد؛ نادیده گرفته می‌شود.
          }
        }
      },
      cancel() {
        // کلاینت اتصال را قطع کرده (مثلاً کاربر تب را بست)؛ چیز دیگری برای
        // انجام دادن نیست، heartbeatId داخل closure بالا با پایان تابع
        // start (که از قبل await شده) پاک‌سازی می‌شود.
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        // برخی پروکسی‌ها (مثل nginx) پاسخ‌های استریمی را بافر می‌کنند مگر
        // این هدر صراحتاً غیرفعالش کند؛ ارسال آن بی‌ضرر و در پلتفرم‌های
        // دیگر بی‌اثر است.
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    console.error("خطا در پردازش درخواست تحلیل حقوقی:", err);
    return jsonError(
      `خطا در تولید گزارش: ${err instanceof Error ? err.message : String(err)}`,
      500,
    );
  }
});