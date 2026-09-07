// اپ روی همین دامنه سرو می‌شود: Cloudflare Pages Function در
// functions/tamin-poshtibani/panel/ درخواست‌ها را پشت پرده به سرور
// purchasing-support می‌فرستد. آدرس Render برای کاربر دیده نمی‌شود.
// تا وقتی خالی باشد، صفحات manager.html و expert.html پیام «به‌زودی» نشان می‌دهند.
// وضعیت فعلی: آدرس مستقیم Render (کار می‌کند).
//
// مسیر هم‌دامنه /tamin-poshtibani/panel/* آماده است اما هنوز فعال نشده —
// Cloudflare پوشه functions را برنمی‌دارد و علتش در داشبورد Pages است
// (تنظیم Root directory). به‌محض حل شدن، فقط همین دو خط عوض می‌شود به:
//   managerUrl: "/tamin-poshtibani/panel/manager"
//   expertUrl:  "/tamin-poshtibani/panel/expert"
window.TAMIN_POSHTIBANI_CONFIG = {
  managerUrl: "https://purchasing-support-staging.onrender.com/manager",
  expertUrl: "https://purchasing-support-staging.onrender.com/expert",
};
