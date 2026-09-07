// اپ روی همین دامنه سرو می‌شود: Cloudflare Pages Function در
// functions/tamin-poshtibani/panel/ درخواست‌ها را پشت پرده به سرور
// purchasing-support می‌فرستد. آدرس Render برای کاربر دیده نمی‌شود.
// تا وقتی خالی باشد، صفحات manager.html و expert.html پیام «به‌زودی» نشان می‌دهند.
window.TAMIN_POSHTIBANI_CONFIG = {
  managerUrl: "/tamin-poshtibani/panel/manager",
  expertUrl: "/tamin-poshtibani/panel/expert",
};
