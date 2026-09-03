// @version 2026-07-23-draft-table-only
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
  Footer,
  PageNumber,
  BorderStyle,
  ShadingType,
  VerticalAlign,
  NumberFormat,
  convertInchesToTwip,
} from "npm:docx@9";
import { encodeBase64 } from "jsr:@std/encoding/base64";

// ═══════════════════════════════════════════════════════════════════════
// معماری کلی این فایل — نسخه «فقط جدول»
// ═══════════════════════════════════════════════════════════════════════
// این نسخه نسبت به نسخه قبلی (که یک گزارش کامل با h1/h2/پاراگراف تولید
// می‌کرد) به‌طور کامل ساده‌سازی شده است:
//
// ۱. کاربر چند «قرارداد مرجع» (role=reference) و دقیقاً یک «قرارداد
//    پیش‌نویس» در حال بررسی (role=draft) آپلود می‌کند (base64).
// ۲. فایل‌ها به همراه دستورالعمل مقایسه‌ای برای claude-opus-4-8 ارسال
//    می‌شود.
// ۳. مدل دیگر HTML تولید نمی‌کند؛ فقط یک آرایه ساختاریافته از «مواد
//    مفقود» برمی‌گرداند: هر مورد شامل شماره قرارداد مرجع (referenceIndex)،
//    شماره/عنوان ماده (articleNumber) و متن دقیق ماده (articleText).
// ۴. سامانه به‌ازای هر قرارداد مرجع، نام فایل واقعی آن را (نه توسط مدل،
//    بلکه مستقیماً از روی ورودی خود کاربر) نگه می‌دارد تا در ستون اول
//    جدول نمایش داده شود.
// ۵. خروجی نهایی یک فایل Word بسیار ساده است:
//      - یک خط: قراردادهای مرجع بررسی‌شده (نام فایل‌ها) کدام‌اند.
//      - یک خط: قرارداد پیش‌نویس بررسی‌شده کدام فایل است.
//      - سپس یا:
//          الف) یک جدول سه‌ستونی (قرارداد مرجع | شماره ماده | متن ماده)
//               برای مواردی که در پیش‌نویس نیستند، یا
//          ب) در صورت نبود هیچ مورد مفقودی، یک پیام سبزرنگ که همه مواد
//             قراردادهای مرجع در پیش‌نویس موجود است.
//    هیچ صفحه جلد، فهرست مطالب، سربرگ یا قالب گزارشی دیگری تولید نمی‌شود.
//
// نکته مهم دربارهٔ نحوه ارسال پاسخ (Server-Sent Events): همان معماری
// heartbeat نسخه قبلی برای جلوگیری از قطع اتصال توسط پلتفرم میزبانی حفظ
// شده است، چون تحلیل توسط claude-opus-4-8 می‌تواند طولانی باشد.
//
// نکته مهم دربارهٔ راست‌به‌چپ بودن متن: تمام پاراگراف‌ها و سلول‌های جدول
// با alignment=RIGHT و bidirectional=true و rightToLeft=true روی هر
// TextRun ساخته می‌شوند، و علائم خنثی مثل پرانتز و گیومه با نویسه نامرئی
// RLM اصلاح می‌شوند تا در Word معکوس/آینه‌ای نمایش داده نشوند.
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
// تنظیمات و ثابت‌ها
// ═══════════════════════════════════════════════════════════════════════
const COMPANY_NAME = "شرکت تونل سد آریانا";
const COMPANY_SUBTITLE = "اداره حقوقی";
const MODEL_NAME = "claude-opus-4-8";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

// حداکثر توکن خروجی مدل. اگر با خطای "max_tokens" مواجه شدید افزایش دهید؛
// پیش از آن سقف مجاز خروجی claude-opus-4-8 را در docs.claude.com بررسی کنید.
const MAX_OUTPUT_TOKENS = 16000;

// شبکه ایمنی در برابر تعلیق دائمی درخواست به Claude.
const CLAUDE_REQUEST_TIMEOUT_MS = 600_000; // ۱۰ دقیقه

// فاصلهٔ ارسال بستهٔ heartbeat به کلاینت در حین انتظار برای پاسخ Claude.
const HEARTBEAT_INTERVAL_MS = 12_000;

// حداکثر حجم مجاز کل فایل‌های ارسالی (مگابایت، تخمینی بر اساس طول base64).
const MAX_TOTAL_FILE_SIZE_MB = 28;

const HEADING_FONT = "B Titr";
const BODY_FONT = "B Lotus";
const BODY_SIZE = 24;   // 12pt — واحد docx نصف‌پوینت است
const HEADING1_SIZE = 32; // 16pt

// ─── پالت رنگی برند آریانا ────────────────────────────────────────────
const C_PRIMARY    = "1E388C"; // آبی اصلی لوگو
const C_PRIMARY_MD = "4F6FB2"; // آبی متوسط
const C_BG_ALT     = "F7FAFE"; // ردیف‌های زوج جدول
const C_BORDER     = "AFC4E6"; // حاشیه اصلی
const C_BORDER_LT  = "DCE7F5"; // حاشیه داخلی
const C_TEXT       = "1F2937"; // متن اصلی
const C_TEXT_LIGHT = "6B7280"; // متن فرعی
const C_SUCCESS    = "15803D"; // سبز — برای پیام «همه مواد موجود است»
// ──────────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════
// هدرهای CORS
// ═══════════════════════════════════════════════════════════════════════
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  "Access-Control-Expose-Headers": "Content-Disposition",
};

// ═══════════════════════════════════════════════════════════════════════
// تایپ‌ها
// ═══════════════════════════════════════════════════════════════════════
interface FileContent {
  name: string;
  content: string; // داده base64 یا متن خام
  encoding: "base64" | "text";
  media_type: string;
  // «reference» = قرارداد مرجع، «draft» = قرارداد پیش‌نویس در حال بررسی
  role: "reference" | "draft";
}

interface AnalysisRequest {
  question?: string;
  fileContents: FileContent[];
}

// هر ردیف خروجی مدل: یک مادهٔ مفقود از یک قرارداد مرجع مشخص
interface ArticleFinding {
  referenceIndex: number; // مطابق شماره‌ای که هنگام ارسال به مدل به هر قرارداد مرجع داده شده (از ۱ شروع می‌شود)
  articleNumber: string;  // مثلاً «ماده ۷» یا در نبود شماره، عنوان کوتاه شرط
  articleText: string;    // متن دقیق ماده جهت الحاق به پیش‌نویس
}

interface ReportData {
  hasFindings: boolean;
  noFindingsMessage: string;
  findings: ArticleFinding[];
}

// ═══════════════════════════════════════════════════════════════════════
// دستورالعمل اصلی مدل (روش تشخیص مواد مفقود)
// ═══════════════════════════════════════════════════════════════════════
const DRAFT_SYSTEM_PROMPT = `
شما موتور «مقایسه و استخراج مواد قراردادی» سامانه تیدا هستید.

ماموریت شما این است که قرارداد پیش‌نویس کاربر را با مجموعه‌ای از قراردادهای مرجع مقایسه کنید و فقط و فقط موادی از قراردادهای مرجع را که در قرارداد پیش‌نویس وجود ندارند یا عملاً غایب هستند شناسایی و گزارش کنید.

هدف اصلی، تقویت قرارداد کاربر و افزایش حداکثری حمایت حقوقی از منافع شرکت تونل سد آریانا است.

همیشه تمامی قراردادهای مرجع را به طور کامل مطالعه کنید و هیچ قرارداد مرجعی را نادیده نگیرید. قراردادهای مرجع باید مستقل از یکدیگر بررسی شوند.

---------------------------------------
روش انجام تحلیل
---------------------------------------

مرحله اول: تمام قراردادهای مرجع را به‌طور کامل مطالعه کنید و مواد، بندها و شروط هرکدام را (به‌ویژه شروط حمایتی، تضمین، مسئولیت، فسخ، فورس‌ماژور، بیمه، محرمانگی، جبران خسارت، ضمانت اجرا، مالی، پرداخت، تاخیر، داوری، قانون حاکم، انتقال قرارداد، مالکیت، مالیاتی، تحویل، پذیرش، تغییرات قرارداد و سایر مواد حمایتی) استخراج کنید.

مرحله دوم: قرارداد پیش‌نویس کاربر را به‌طور کامل مطالعه کنید و ساختار، مواد و تعهدات آن را استخراج کنید.

مرحله سوم: هر ماده از هر قرارداد مرجع را با قرارداد پیش‌نویس مقایسه کنید. فقط موادی را علامت بزنید که:
   الف) در پیش‌نویس اصلاً وجود ندارند، یا
   ب) در پیش‌نویس هستند اما به‌قدری ناقص یا ضعیف‌اند که عملاً معادل نبودشان است (نه صرفاً تفاوت جزئی در نگارش).

---------------------------------------

قواعد سخت‌گیرانه:

- هرگز از خودتان ماده، بند یا پیشنهاد ابداعی که در متن قراردادهای مرجع وجود ندارد نسازید. متن هر ماده گزارش‌شده باید همان متن واقعی (یا برگردان بسیار نزدیک و بدون تحریف همان متن) موجود در قرارداد مرجع مربوطه باشد، صرفاً برای الحاق مستقیم به پیش‌نویس آماده‌سازی شده باشد.
- عبارات مشاوره‌ای مانند «بهتر است...»، «می‌توانید...» یا هرگونه توصیه از جانب خودتان ممنوع است؛ فقط متن ماده را بیاورید.
- اگر چند قرارداد مرجع ماده مشابهی دارند، فقط بهترین و کامل‌ترین نسخه واقعی را گزارش کنید (نه ترکیب ابداعی چند نسخه).
- اگر بین قراردادهای مرجع تعارض وجود دارد، نسخه‌ای که بیشترین حمایت حقوقی را برای شرکت تونل سد آریانا ایجاد می‌کند گزارش شود.
- اگر اطلاعات کافی برای تصمیم قطعی وجود ندارد، آن ماده را گزارش نکنید؛ حدس نزنید.
- هیچ ماده‌ای که ارتباطی با موضوع قرارداد ندارد گزارش نشود.
- این تحلیل مستقیماً برای وکلای داخلی شرکت است؛ نیازی به توصیه «مشورت با وکیل» نیست.
`;

// ═══════════════════════════════════════════════════════════════════════
// قرارداد فنی خروجی (Output Contract) — نسخه ساده‌شده «فقط جدول»
// ═══════════════════════════════════════════════════════════════════════
const OUTPUT_FORMAT_INSTRUCTIONS = `
────────────────────────────────────────
دستورالعمل الزامی قالب خروجی فنی (Output Contract)
────────────────────────────────────────
خروجی نهایی شما مستقیماً توسط یک سامانه خودکار خوانده می‌شود و باید دقیقاً یک شیء JSON معتبر (valid JSON) باشد. هیچ متن، توضیح، مقدمه، موخره یا بلوک کد (مثل \`\`\`json) نباید قبل یا بعد از آن باشد. اولین کاراکتر خروجی باید { و آخرین کاراکتر باید } باشد.

ساختار دقیق JSON باید دقیقاً به این شکل باشد (نام کلیدها دقیقاً همین‌ها):

{
  "hasFindings": true یا false — دقیقاً یک مقدار boolean، نه رشته،
  "noFindingsMessage": "این فیلد را فقط وقتی hasFindings=false است با یک جمله کوتاه فارسی پر کن؛ در غیر این صورت رشته خالی بگذار",
  "findings": [
    {
      "referenceIndex": شماره قرارداد مرجعی که این ماده از آن استخراج شده، دقیقاً همان عددی که در برچسب «قرارداد مرجع شماره N» که در ورودی به شما داده شده آمده است (یک عدد صحیح، نه رشته)،
      "articleNumber": "شماره یا عنوان کوتاه ماده، مثلاً «ماده ۷» یا در نبود شماره رسمی، یک عنوان کوتاه مثل «شرط فورس‌ماژور»",
      "articleText": "متن کامل و دقیق همان ماده از قرارداد مرجع، آماده جهت الحاق مستقیم به پیش‌نویس؛ هرگز محتوای جعلی یا ابداعی نباشد"
    }
  ]
}

قواعد:

۱. اگر حتی یک ماده در قراردادهای مرجع پیدا شود که در پیش‌نویس نیست یا عملاً معادل ندارد و به نفع شرکت تونل سد آریانا است → "hasFindings" را true بگذارید و تمام این موارد را در آرایه "findings" بیاورید. در این حالت "noFindingsMessage" باید رشته خالی "" باشد.

۲. اگر پس از بررسی کامل هیچ مادهٔ ارزش‌افزایی پیدا نشد (یعنی تمام مواد مهم قراردادهای مرجع در پیش‌نویس هم به همان اندازه یا بهتر وجود دارند) → "hasFindings" را false بگذارید، "findings" را آرایه خالی [] بگذارید، و در "noFindingsMessage" دقیقاً این جمله را بنویسید (یا بسیار نزدیک به آن): «تمام مواد قراردادهای مرجع در قرارداد پیش‌نویس موجود است و هیچ مادهٔ مفقودی شناسایی نشد.»

۳. هر عضو آرایه "findings" باید دقیقاً یک ماده باشد (نه چند ماده در یک ردیف ادغام‌شده). اگر چند ماده مستقل از یک قرارداد مرجع مفقود است، برای هرکدام یک عضو جداگانه در آرایه بسازید.

۴. مقدار "referenceIndex" باید دقیقاً با شماره‌ای که در برچسب سند ورودی («قرارداد مرجع شماره N») آمده مطابقت داشته باشد. این عدد را حدس نزنید؛ از همان شماره‌گذاری که در اسناد ورودی دیدید استفاده کنید.

۵. متن "articleText" باید کامل، دقیق و قابل الحاق مستقیم به قرارداد پیش‌نویس باشد؛ از خلاصه‌سازی بیش از حد یا حذف بخش‌های مهم ماده خودداری کنید.

۶. تمام محتوای متنی باید فارسی، رسمی و حقوقی باشد. از ایموجی، نویسه‌های تزیینی یا هر نشانه غیرمتنی استفاده نکنید.

۷. اگر اطلاعات سند برای تصمیم قطعی درباره یک ماده کافی نبود، آن را در خروجی نیاورید؛ هرگز چیزی را جعل نکنید.
`;
const FULL_SYSTEM_PROMPT = `${DRAFT_SYSTEM_PROMPT}\n${OUTPUT_FORMAT_INSTRUCTIONS}`;

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

// deno-lint-ignore no-explicit-any
function buildUserContentBlocks(question: string, referenceFiles: FileContent[], draftFile: FileContent): any[] {
  // deno-lint-ignore no-explicit-any
  const blocks: any[] = [];

  const pushFile = (file: FileContent, label: string) => {
    if (file.encoding === "base64") {
      blocks.push({
        type: "document",
        source: {
          type: "base64",
          media_type: file.media_type || "application/pdf",
          data: file.content,
        },
        title: `${label}: ${file.name?.slice(0, 180) || "سند پیوست"}`,
      });
    } else {
      blocks.push({
        type: "text",
        text: `--- ${label}: ${file.name} ---\n${file.content}`,
      });
    }
  };

  referenceFiles.forEach((file, idx) => {
    pushFile(file, `قرارداد مرجع شماره ${idx + 1}`);
  });
  pushFile(draftFile, `قرارداد پیش‌نویس در حال بررسی`);

  const instruction = question && question.trim().length > 0
    ? `دستورالعمل ویژه کاربر برای این بررسی:\n${question.trim()}\n\nقرارداد(های) مرجع بالا را با «قرارداد پیش‌نویس در حال بررسی» تطبیق بده، مواد مفقود را طبق دستورالعمل سیستم استخراج کن و پاسخ را دقیقاً و فقط در قالب JSON خواسته‌شده در «دستورالعمل الزامی قالب خروجی فنی» ارائه بده.`
    : `کاربر دستورالعمل ویژه‌ای مطرح نکرده است. قرارداد(های) مرجع بالا را با «قرارداد پیش‌نویس در حال بررسی» به‌طور کامل تطبیق بده، مواد مفقود را طبق دستورالعمل سیستم استخراج کن و پاسخ را دقیقاً و فقط در قالب JSON خواسته‌شده در «دستورالعمل الزامی قالب خروجی فنی» ارائه بده.`;

  blocks.push({ type: "text", text: instruction });
  return blocks;
}

async function callClaudeForAnalysis(
  apiKey: string,
  question: string,
  referenceFiles: FileContent[],
  draftFile: FileContent,
): Promise<ReportData> {
  const contentBlocks = buildUserContentBlocks(question, referenceFiles, draftFile);

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

  return parseReportJson(rawText, referenceFiles.length);
}

function parseReportJson(raw: string, referenceCount: number): ReportData {
  let cleaned = raw.trim();
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

  const hasFindings = parsed.hasFindings === true || parsed.hasFindings === "true";

  // deno-lint-ignore no-explicit-any
  const rawFindings: any[] = Array.isArray(parsed.findings) ? parsed.findings : [];

  const findings: ArticleFinding[] = rawFindings
    .map((f) => {
      const refIndex = Number(f?.referenceIndex);
      return {
        referenceIndex: Number.isFinite(refIndex) ? Math.round(refIndex) : 0,
        articleNumber: String(f?.articleNumber || "").trim(),
        articleText: String(f?.articleText || "").trim(),
      };
    })
    // ردیف‌های ناقص (بدون شماره ماده یا متن ماده) یا با شماره قرارداد نامعتبر حذف می‌شوند
    .filter((f) =>
      f.articleText.length > 0 &&
      f.referenceIndex >= 1 &&
      f.referenceIndex <= referenceCount
    );

  if (hasFindings && findings.length === 0) {
    throw new Error(
      "خروجی مدل اعلام کرده بود مواد مفقود پیدا شده (hasFindings=true) اما آرایه findings خالی یا نامعتبر بود.",
    );
  }

  return {
    hasFindings: hasFindings && findings.length > 0,
    noFindingsMessage: String(
      parsed.noFindingsMessage ||
        "تمام مواد قراردادهای مرجع در قرارداد پیش‌نویس موجود است و هیچ مادهٔ مفقودی شناسایی نشد.",
    ),
    findings,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// اصلاح جهت علائم خنثی (پرانتز، گیومه و ...) برای نمایش صحیح در متن فارسی
// ═══════════════════════════════════════════════════════════════════════
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

function cleanFileName(name: string): string {
  return (name || "").replace(/\.[^./\\]+$/, "").trim() || "بدون‌نام";
}

// ═══════════════════════════════════════════════════════════════════════
// ساخت فایل Word — نسخه ساده: دو خط توضیح + جدول یا پیام سبز
// ═══════════════════════════════════════════════════════════════════════
function buildIntroParagraphs(referenceFiles: FileContent[], draftFile: FileContent): Paragraph[] {
  const refNames = referenceFiles.map((f) => cleanFileName(f.name)).join("، ");
  const draftName = cleanFileName(draftFile.name);

  return [
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      bidirectional: true,
      spacing: { after: 60 },
      children: [new TextRun({ text: COMPANY_NAME, font: HEADING_FONT, size: 22, bold: true, color: C_PRIMARY })],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      bidirectional: true,
      spacing: { after: 220 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C_PRIMARY_MD, space: 4 } },
      children: [new TextRun({ text: COMPANY_SUBTITLE, font: BODY_FONT, size: 16, color: C_TEXT_LIGHT })],
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.RIGHT,
      bidirectional: true,
      spacing: { after: 220 },
      children: [new TextRun({ text: "مواد پیشنهادی جهت الحاق به پیش‌نویس قرارداد", font: HEADING_FONT, size: HEADING1_SIZE, bold: true, color: C_PRIMARY })],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      bidirectional: true,
      spacing: { after: 120 },
      children: [
        new TextRun({ text: "قراردادهای مرجع بررسی‌شده: ", font: BODY_FONT, size: BODY_SIZE, bold: true, color: C_TEXT, rightToLeft: true }),
        new TextRun({ text: fixRtlPunctuation(refNames), font: BODY_FONT, size: BODY_SIZE, color: C_TEXT, rightToLeft: true }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      bidirectional: true,
      spacing: { after: 300 },
      children: [
        new TextRun({ text: "قرارداد پیش‌نویس بررسی‌شده: ", font: BODY_FONT, size: BODY_SIZE, bold: true, color: C_TEXT, rightToLeft: true }),
        new TextRun({ text: fixRtlPunctuation(draftName), font: BODY_FONT, size: BODY_SIZE, color: C_TEXT, rightToLeft: true }),
      ],
    }),
  ];
}

function buildNoFindingsParagraph(message: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    bidirectional: true,
    spacing: { before: 200, after: 200 },
    shading: { type: ShadingType.CLEAR, fill: "E8F5E9", color: "auto" },
    border: {
      top: { style: BorderStyle.SINGLE, size: 6, color: C_SUCCESS },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: C_SUCCESS },
      left: { style: BorderStyle.SINGLE, size: 6, color: C_SUCCESS },
      right: { style: BorderStyle.SINGLE, size: 6, color: C_SUCCESS },
    },
    children: [
      new TextRun({
        text: fixRtlPunctuation(message),
        font: BODY_FONT,
        size: BODY_SIZE,
        bold: true,
        color: C_SUCCESS,
        rightToLeft: true,
      }),
    ],
  });
}

function buildFindingsTable(findings: ArticleFinding[], referenceFiles: FileContent[]): Table {
  const headerCell = (text: string) =>
    new TableCell({
      width: { size: 100 / 3, type: WidthType.PERCENTAGE },
      shading: { type: ShadingType.CLEAR, fill: C_PRIMARY, color: "auto" },
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 120, bottom: 120, left: 150, right: 150 },
      children: [
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          bidirectional: true,
          children: [new TextRun({ text, font: BODY_FONT, size: BODY_SIZE, bold: true, color: "FFFFFF", rightToLeft: true })],
        }),
      ],
    });

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      headerCell("شماره قرارداد مرجع"),
      headerCell("شماره ماده"),
      headerCell("متن ماده"),
    ],
  });

  const dataRows = findings.map((finding, idx) => {
    const isEven = idx % 2 === 1;
    const refFile = referenceFiles[finding.referenceIndex - 1];
    const refLabel = refFile
      ? `قرارداد مرجع ${finding.referenceIndex} (${cleanFileName(refFile.name)})`
      : `قرارداد مرجع ${finding.referenceIndex}`;

    const bodyCell = (text: string, bold = false) =>
      new TableCell({
        width: { size: 100 / 3, type: WidthType.PERCENTAGE },
        shading: isEven ? { type: ShadingType.CLEAR, fill: C_BG_ALT, color: "auto" } : undefined,
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 110, bottom: 110, left: 150, right: 150 },
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            bidirectional: true,
            spacing: { line: 300 },
            children: [new TextRun({ text: fixRtlPunctuation(text), font: BODY_FONT, size: BODY_SIZE, bold, color: C_TEXT, rightToLeft: true })],
          }),
        ],
      });

    return new TableRow({
      children: [
        bodyCell(refLabel),
        bodyCell(finding.articleNumber || "—", true),
        bodyCell(finding.articleText || "—"),
      ],
    });
  });

  return new Table({
    rows: [headerRow, ...dataRows],
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

async function generateDocxReport(
  report: ReportData,
  referenceFiles: FileContent[],
  draftFile: FileContent,
): Promise<Uint8Array> {
  const margin = {
    top: convertInchesToTwip(1),
    bottom: convertInchesToTwip(1),
    left: convertInchesToTwip(1),
    right: convertInchesToTwip(1),
  };

  const bodyElements: (Paragraph | Table)[] = [
    ...buildIntroParagraphs(referenceFiles, draftFile),
    report.hasFindings
      ? buildFindingsTable(report.findings, referenceFiles)
      : buildNoFindingsParagraph(report.noFindingsMessage),
  ];

  const doc = new Document({
    creator: COMPANY_NAME,
    title: "مواد پیشنهادی جهت الحاق به پیش‌نویس قرارداد",
    styles: {
      default: {
        document: {
          run: { font: BODY_FONT, size: BODY_SIZE, color: C_TEXT },
          paragraph: { alignment: AlignmentType.RIGHT, bidirectional: true, spacing: { line: 340, after: 160 } },
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
            alignment: AlignmentType.RIGHT,
            bidirectional: true,
            spacing: { before: 200, after: 220 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C_PRIMARY_MD, space: 4 } },
          },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: { margin, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } },
        },
        footers: { default: buildFooter() },
        children: bodyElements,
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
  return name.replace(/[\\/:*?"<>|]/g, "").trim().slice(0, 80) || "مواد-پیشنهادی-الحاق";
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
      return jsonError("هیچ فایلی برای بررسی ارسال نشده است.", 400);
    }

    const referenceFiles = body.fileContents.filter((f) => f.role !== "draft");
    const draftFiles = body.fileContents.filter((f) => f.role === "draft");

    if (referenceFiles.length === 0) {
      return jsonError("حداقل یک قرارداد مرجع باید بارگذاری شود.", 400);
    }
    if (draftFiles.length === 0) {
      return jsonError("قرارداد پیش‌نویس در حال بررسی بارگذاری نشده است.", 400);
    }
    if (draftFiles.length > 1) {
      return jsonError("فقط یک قرارداد پیش‌نویس در حال بررسی مجاز است.", 400);
    }
    const draftFile = draftFiles[0];

    const sizeMb = estimateTotalSizeMb(body.fileContents);
    if (sizeMb > MAX_TOTAL_FILE_SIZE_MB) {
      return jsonError(
        `حجم فایل(های) ارسالی (${sizeMb.toFixed(1)} مگابایت) بیش از حد مجاز (${MAX_TOTAL_FILE_SIZE_MB} مگابایت) است.`,
        400,
      );
    }

    const question = body.question ?? "";

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false;
        const sendEvent = (payload: Record<string, unknown>) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          } catch {
            closed = true;
          }
        };

        sendEvent({ text: "" });
        const heartbeatId = setInterval(() => sendEvent({ text: "" }), HEARTBEAT_INTERVAL_MS);

        try {
          const report = await callClaudeForAnalysis(apiKey, question, referenceFiles, draftFile);

          // در هر دو حالت (وجود یافته یا عدم وجود یافته) همیشه یک فایل Word
          // ساخته می‌شود؛ در حالت عدم وجود یافته، فایل شامل پیام سبزرنگ است.
          const docxBytes = await generateDocxReport(report, referenceFiles, draftFile);
          const base64Docx = encodeBase64(docxBytes);
          const safeFileName = sanitizeFileName(
            report.hasFindings ? "مواد-پیشنهادی-الحاق-به-پیش‌نویس" : "گزارش-تطابق-کامل-پیش‌نویس",
          );

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
        // کلاینت اتصال را قطع کرده؛ چیز دیگری برای انجام دادن نیست.
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
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