#!/usr/bin/env python3
"""
پلِ پیامکِ سامانهٔ آریانا روی سرورِ شرکت (آبان ۱۴۰۵) — فقط کتابخانهٔ استانداردِ پایتون.

IPPanel از IPِ خارجی (و Cloudflare) جواب نمی‌دهد و سرورِ شرکت از بیرون فقط SSH دارد؛ پس این برنامه هر چند ثانیه خودش
POST {site}/tamin-poshtibani/api/relay/sync را می‌زند (worker/relay.js): نتیجهٔ پیامک‌های قبلی را می‌دهد، پیامک‌های تازهٔ صف را
می‌گیرد و هر کدام را با کلیدِ IPPanel (فقط همین‌جا، در config.json) می‌فرستد.

  • تاریخچهٔ کاملِ پیامک‌ها در sms-history.sqlite: متن (پیامکِ الگو هم با متنِ کاملش)، گیرنده، خط، الگو، شناسهٔ IPPanel، خطا و
    وضعیتِ تحویل
  • هر پیامک فقط یک بار: اول در تاریخچه ثبت می‌شود، بعد نتیجه به سامانه می‌رود؛ اگر برنامه وسطِ کار بیفتد، بعد از راه‌اندازیِ دوباره
    همان نتیجه گزارش می‌شود و پیامک دوباره فرستاده نمی‌شود
  • تپشِ دقیقه‌ای: اعتبارِ پنل (هر ۵ دقیقه)، نتیجهٔ آخرین پشتیبان‌گیری (backup-status.json از backup.py) و وضعیتِ الگوها
  • الگوها (worker/sms-patterns.js): تعریف‌ها از GET /relay/patterns؛ هر الگوی تازه (یا متنِ عوض‌شده) در IPPanel ساخته می‌شود
    (patterns.json) و وضعیتِ تأییدش پرسیده می‌شود — سامانه فقط الگوی «active» را به کار می‌برد
  • وضعیتِ تحویل: پیامک‌های ۴۸ ساعتِ اخیر هر ۲ دقیقه از گزارشِ IPPanel خوانده می‌شوند؛ نتیجهٔ نهایی («پایان یافته» یا «رد شده»)
    یک بار به سامانه می‌رود (deliveries) — «رد شده» آن‌جا «نرفت» و هشدار می‌شود

اجرا: Cronِ کاربر هر دقیقه با flock (فقط یک نسخه؛ اگر بیفتد حداکثر یک دقیقه بعد برمی‌گردد) — scripts/vps/README.md.
"""
import json
import logging
import logging.handlers
import os
import re
import signal
import sqlite3
import sys
import time
import urllib.error
import urllib.request

VER = "3"
HERE = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(HERE, "config.json"), encoding="utf-8"))
SITE = CFG.get("site", "https://arianaai.website").rstrip("/")
API = f"{SITE}/tamin-poshtibani/api/relay"
IP_BASE = CFG.get("ippanel_base", "https://edge.ippanel.com/v1").rstrip("/")
IP_KEY = CFG["ippanel_key"]
RELAY_KEY = CFG["relay_key"]
DB_PATH = os.path.join(HERE, "sms-history.sqlite")
BACKUP_STATUS = os.path.join(HERE, "backup-status.json")
PAT_FILE = os.path.join(HERE, "patterns.json")
UA = f"ariana-sms-relay/{VER}"

log = logging.getLogger("relay")
log.setLevel(logging.INFO)
_h = logging.handlers.RotatingFileHandler(os.path.join(HERE, "relay.log"), maxBytes=1_000_000, backupCount=5, encoding="utf-8")
_h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
log.addHandler(_h)

STOP = False


def _stop(*_):
    global STOP
    STOP = True


signal.signal(signal.SIGTERM, _stop)
signal.signal(signal.SIGINT, _stop)


def now_ms():
    return int(time.time() * 1000)


def db():
    c = sqlite3.connect(DB_PATH, timeout=30)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    c.execute("""CREATE TABLE IF NOT EXISTS sms (
        job_id INTEGER PRIMARY KEY, queued_at INTEGER, sent_at INTEGER, to_number TEXT, from_number TEXT, kind TEXT,
        message TEXT, pattern_code TEXT, params TEXT, ok INTEGER, ippanel_id TEXT, http_status INTEGER, code TEXT, error TEXT,
        response TEXT, reported INTEGER NOT NULL DEFAULT 0, delivery_state TEXT, delivery_status TEXT, delivery_at INTEGER, delivery_raw TEXT)""")
    cols = {r[1] for r in c.execute("PRAGMA table_info(sms)")}
    if "delivery_reported" not in cols:
        c.execute("ALTER TABLE sms ADD COLUMN delivery_final TEXT")
        c.execute("ALTER TABLE sms ADD COLUMN delivery_reported INTEGER NOT NULL DEFAULT 0")
        c.execute("UPDATE sms SET delivery_reported=1")  # پیامک‌های پیش از این نسخه دوباره گزارش نمی‌شوند
    if "pattern_key" not in cols:
        c.execute("ALTER TABLE sms ADD COLUMN pattern_key TEXT")
    c.execute("CREATE INDEX IF NOT EXISTS ix_sms_sent ON sms(sent_at)")
    c.execute("CREATE INDEX IF NOT EXISTS ix_sms_to ON sms(to_number, sent_at)")
    c.execute("CREATE INDEX IF NOT EXISTS ix_sms_unreported ON sms(reported) WHERE reported=0")
    c.commit()
    return c


def http(method, url, body=None, headers=None, timeout=25):
    """(status, json|None, text) — HTTPError هم پاسخ است؛ فقط خطای شبکه استثنا می‌دهد"""
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    h = {"Accept": "application/json", "User-Agent": UA, **(headers or {})}
    if data is not None:
        h["Content-Type"] = "application/json; charset=utf-8"
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            status, text = r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        status, text = e.code, e.read().decode("utf-8", "replace")
    try:
        js = json.loads(text) if text else None
    except ValueError:
        js = None
    return status, js, text


def data_of(js):
    d = (js or {}).get("data")
    return d if isinstance(d, dict) else None


NO_CREDIT = ("عدم اعتبار", "عدم موجودی", "کافی نیست", "ناکافی", "موجودی حساب", "شارژ", "insufficient", "not enough credit", "low credit", "balance")


def ip_error(status, js):
    """همان دسته‌بندیِ worker/sms.js: auth | quota | rejected | error"""
    meta = (js or {}).get("meta") or {}
    errs = meta.get("errors") or {}
    flat = [str(x) for v in (errs.values() if isinstance(errs, dict) else []) for x in (v if isinstance(v, list) else [v])]
    detail = str(meta.get("message") or (flat[0] if flat else "") or (js or {}).get("message") or "")
    text = f"{detail} {' '.join(flat)}"
    if status in (401, 403) or meta.get("message_code") == "400-1":
        code, why = "auth", "کلید IPPanel پذیرفته نشد"
    elif status in (402, 429) or any(k in text for k in NO_CREDIT):
        code, why = "quota", "اعتبار یا سقفِ ارسالِ پنل پیامک (IPPanel) کافی نیست"
    elif status >= 500:
        code, why = "error", "پیامک فرستاده نشد"
    else:
        code, why = "rejected", "IPPanel درخواست را نپذیرفت"
    return code, f"{why} ({detail[:120] or status})"


# ---------------------------------------------------------------- الگوها
_pat = {"at": 0, "defs": {}, "report": {}}


def load_state():
    try:
        return json.load(open(PAT_FILE, encoding="utf-8"))
    except Exception:
        return {}


def norm_status(d):
    s, fa = str(d.get("pattern_status") or "").lower(), str(d.get("pattern_status_fa") or "")
    if s == "active" or fa == "فعال":
        return "active"
    if "reject" in s or "رد" in fa:
        return "rejected"
    return "pending"


def patterns_tick():
    """تعریف‌ها از سامانه، ساختنِ الگوی تازه در IPPanel، پرسیدنِ وضعیت؛ تا وقتی الگویی منتظر است هر ۳ دقیقه، بعد هر ۳۰ دقیقه"""
    rep = _pat["report"]
    # تا الگویی «در انتظار» است هر ۳ دقیقه؛ وگرنه (همه فعال یا ردشده) هر ۳۰ دقیقه
    wait = 180 if not rep or any(v.get("status") == "pending" for v in rep.values()) else 1800
    if time.time() - _pat["at"] < wait:
        return
    _pat["at"] = time.time()
    try:
        status, js, _ = http("GET", f"{API}/patterns", None, {"x-relay-key": RELAY_KEY})
    except Exception as e:
        log.info("patterns fetch: %s", e)
        return
    defs = {d["key"]: d for d in ((js or {}).get("patterns") or []) if isinstance(d, dict) and d.get("key")} if status == 200 else {}
    if not defs:
        return
    _pat["defs"] = defs
    state = load_state()
    changed = False
    for key, d in defs.items():
        s = state.get(key) or {}
        if s.get("hash") == d["hash"] and (s.get("code") or time.time() - s.get("tried", 0) < 3600):
            continue
        body = {"title": f'{d["title"]}-{d["hash"]}', "description": d["description"], "is_share": False, "message": d["message"],
                "variable": [{"name": v, "type": (d.get("types") or {}).get(v, "string")} for v in d["vars"]], "website": SITE}
        try:
            st, j, txt = http("POST", f"{IP_BASE}/api/patterns/normal", body, {"Authorization": IP_KEY})
        except Exception as e:
            log.warning("pattern %s create: %s", key, e)
            continue
        dd = data_of(j)
        if 200 <= st < 300 and dd and dd.get("pattern_code"):
            state[key] = {"hash": d["hash"], "code": dd["pattern_code"], "tried": time.time()}
            log.info("pattern %s created: %s (%s)", key, dd["pattern_code"], dd.get("pattern_status"))
        else:
            state[key] = {"hash": d["hash"], "code": None, "tried": time.time(), "error": ip_error(st, j)[1]}
            log.warning("pattern %s create failed: HTTP %s %s", key, st, (txt or "")[:300])
        changed = True
    if changed:
        with open(PAT_FILE, "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False, indent=1)
    report = {}
    for key, d in defs.items():
        s = state.get(key) or {}
        if s.get("hash") != d["hash"]:
            continue
        if not s.get("code"):
            report[key] = {"code": None, "status": "error", "status_fa": "ساخته نشد", "reject": s.get("error"), "hash": d["hash"]}
            continue
        try:
            st, j, _ = http("GET", f"{IP_BASE}/api/patterns/{s['code']}", None, {"Authorization": IP_KEY}, timeout=15)
        except Exception as e:
            log.info("pattern %s status: %s", key, e)
            report[key] = (rep.get(key) or {"code": s["code"], "status": "pending", "hash": d["hash"]})
            continue
        dd = data_of(j)
        if dd:
            report[key] = {"code": s["code"], "status": norm_status(dd), "status_fa": dd.get("pattern_status_fa"),
                           "reject": dd.get("reject_text") or dd.get("admin_comment"), "hash": d["hash"]}
        else:
            report[key] = {"code": s["code"], "status": "pending", "hash": d["hash"]}
    if report != rep:
        log.info("patterns: %s", ", ".join(f"{k}={v.get('status')}" for k, v in report.items()))
    _pat["report"] = report


def render(key, params):
    d = _pat["defs"].get(key)
    if not d:
        return None
    return re.sub(r"%(\w+)%", lambda m: str((params or {}).get(m.group(1), "")), d["message"])


# ---------------------------------------------------------------- فرستادن
def send_one(c, job):
    """یک پیامک — اول در تاریخچه، بعد نتیجه. پیامکی که قبلاً ثبت شده دوباره فرستاده نمی‌شود."""
    jid = int(job["id"])
    if c.execute("SELECT 1 FROM sms WHERE job_id=?", (jid,)).fetchone():
        log.warning("job %s already in history; not sending again", jid)
        return
    b = dict(job.get("body") or {})
    fallback = b.pop("_text", None)  # متنِ کاملِ همان پیامک، اگر IPPanel الگو را نپذیرفت
    params = b.get("params") or {}
    kind = str(job.get("kind") or b.get("sending_type") or "")
    pkey = kind.split(":", 1)[1] if kind.startswith("pattern:") else None
    to = ",".join(b.get("recipients") or params.get("recipients") or [job.get("phone") or ""])
    message = b.get("message") or (render(pkey, params) if pkey else None) or fallback
    row = {"job_id": jid, "queued_at": job.get("at"), "to_number": to, "from_number": b.get("from_number"), "kind": b.get("sending_type"),
           "message": message, "pattern_code": b.get("code"), "pattern_key": pkey,
           "params": json.dumps(params if b.get("sending_type") == "pattern" else {}, ensure_ascii=False)}

    def attempt(body):
        status, js, text = http("POST", f"{IP_BASE}/api/send", body, {"Authorization": IP_KEY})
        meta = (js or {}).get("meta") or {}
        ids = (data_of(js) or {}).get("message_outbox_ids") or []
        if 200 <= status < 300 and meta.get("status") is not False and (meta.get("status") is True or ids):
            return dict(ok=1, ippanel_id=str(ids[0]) if ids else None, http_status=status, code=None, error=None, response=text[:2000])
        if 200 <= status < 300 and meta.get("status") is not False:
            return dict(ok=0, ippanel_id=None, http_status=status, code="error", error="پیامک فرستاده نشد (پاسخِ نامفهومِ IPPanel)", response=text[:2000])
        code, err = ip_error(status, js)
        return dict(ok=0, ippanel_id=None, http_status=status, code=code, error=err, response=text[:2000])

    try:
        res = attempt(b)
        # الگو هنگامِ فرستادن رد شد (نوعِ متغیر، الگوی غیرفعال…) و پیامک نرفته: همان پیامک با متنِ کامل
        if not res["ok"] and res["code"] == "rejected" and b.get("sending_type") == "pattern" and fallback:
            log.warning("job %s pattern %s refused (%s); sending full text", jid, pkey, res["error"])
            first = res["error"]
            res = attempt({"sending_type": "webservice", "from_number": b.get("from_number"), "message": fallback, "params": {"recipients": b.get("recipients") or []}})
            row.update(kind="webservice", message=fallback)
            if res["ok"]:
                res["error"] = None
            row["params"] = json.dumps({"pattern_refused": first}, ensure_ascii=False)
        row.update(res)
    except Exception as e:  # شبکه: دوباره نمی‌فرستیم (شاید رفته باشد) — شکست گزارش می‌شود
        row.update(ok=0, ippanel_id=None, http_status=0, code="network", error=f"درگاه پیامک در دسترس نبود: {str(e)[:120]}", response=None)
    row["sent_at"] = now_ms()
    cols = list(row)
    c.execute(f"INSERT INTO sms ({','.join(cols)}) VALUES ({','.join('?' * len(cols))})", [row[k] for k in cols])
    c.commit()
    log.info("job %s -> %s %s%s", jid, "sent" if row["ok"] else "FAILED", row.get("ippanel_id") or row.get("error"), f" [pattern {pkey}]" if pkey else "")


def unreported(c):
    rows = c.execute("SELECT job_id, ok, ippanel_id, error, code FROM sms WHERE reported=0 ORDER BY job_id LIMIT 100").fetchall()
    return [{"id": r["job_id"], "ok": bool(r["ok"]), "ref": r["ippanel_id"], "error": r["error"], "code": r["code"]} for r in rows]


def deliveries(c):
    rows = c.execute("SELECT job_id, delivery_final, delivery_status FROM sms WHERE delivery_final IS NOT NULL AND delivery_reported=0 ORDER BY job_id LIMIT 100").fetchall()
    return [{"id": r["job_id"], "state": r["delivery_final"], "status": r["delivery_status"]} for r in rows]


_credit = {"at": 0, "credit": None, "gift": 0, "credit_at": None, "credit_error": None}


def credit():
    if time.time() - _credit["at"] < 300:
        return _credit
    try:
        status, js, _ = http("GET", f"{IP_BASE}/api/payment/credit/mine", None, {"Authorization": IP_KEY}, timeout=15)
        d = data_of(js)
        if 200 <= status < 300 and d:
            _credit.update(credit=d.get("credit"), gift=d.get("gift") or 0, credit_at=d.get("updated_at"), credit_error=None)
        else:
            _credit.update(credit_error=ip_error(status, js)[1])
    except Exception as e:
        _credit.update(credit_error=f"درگاه پیامک در دسترس نبود: {str(e)[:100]}")
    _credit["at"] = time.time()
    return _credit


def beat():
    cr = credit()
    b = {"credit": cr["credit"], "gift": cr["gift"], "credit_at": cr["credit_at"], "credit_error": cr["credit_error"], "ver": VER}
    try:
        b["backup"] = json.load(open(BACKUP_STATUS, encoding="utf-8"))
    except Exception:
        pass
    if _pat["report"]:
        b["patterns"] = _pat["report"]
    return b


def final_of(d):
    """نتیجهٔ نهاییِ گزارشِ IPPanel: rejected («رد شده»، state_id ۳) | done («پایان یافته»، state_id ۶) | None (هنوز)"""
    fa, st, sid = str(d.get("status") or ""), str(d.get("state") or ""), str(d.get("state_id") or "")
    if "رد" in fa or sid == "3":
        return "rejected"
    if st == "finish" or sid == "6" or "پایان" in fa:
        return "done"
    return None


def delivery(c):
    """وضعیتِ تحویلِ پیامک‌های ۴۸ ساعتِ اخیر که هنوز نتیجهٔ نهایی ندارند"""
    since = now_ms() - 48 * 3600 * 1000
    rows = c.execute("SELECT job_id, ippanel_id FROM sms WHERE ok=1 AND ippanel_id IS NOT NULL AND sent_at>? AND delivery_final IS NULL LIMIT 50", (since,)).fetchall()
    for r in rows:
        try:
            status, js, _ = http("GET", f"{IP_BASE}/api/report/by_bulk?messages_outbox_id={r['ippanel_id']}", None, {"Authorization": IP_KEY}, timeout=15)
            d = data_of(js)
            if 200 <= status < 300 and d:
                fin = final_of(d)
                c.execute("UPDATE sms SET delivery_state=?, delivery_status=?, delivery_final=?, delivery_at=?, delivery_raw=? WHERE job_id=?",
                          (d.get("state"), d.get("status"), fin, now_ms(), json.dumps(d, ensure_ascii=False)[:2000], r["job_id"]))
                if fin == "rejected":
                    log.warning("job %s REJECTED by IPPanel review (%s)", r["job_id"], r["ippanel_id"])
        except Exception as e:
            log.info("delivery check %s: %s", r["ippanel_id"], e)
            break
    c.commit()


def night():
    """۰۰:۰۰ تا ۰۶:۰۰ تهران (UTC+۳:۳۰) — تماسِ کمتر"""
    m = (time.gmtime().tm_hour * 60 + time.gmtime().tm_min + 210) % 1440
    return m < 360


def main():
    c = db()
    log.info("relay %s start (site %s)", VER, SITE)
    last_beat, last_delivery, backoff = 0, 0, 5
    while not STOP:
        patterns_tick()
        results, dels = unreported(c), deliveries(c)
        b = None
        if time.time() - last_beat >= 60:
            b = beat()
        payload = {"results": results, **({"deliveries": dels} if dels else {}), **({"beat": b} if b else {})}
        try:
            status, js, text = http("POST", f"{API}/sync", payload, {"x-relay-key": RELAY_KEY})
        except Exception as e:
            log.warning("sync failed: %s", e)
            time.sleep(backoff)
            backoff = min(backoff * 2, 60)
            continue
        if status != 200 or not isinstance(js, dict) or not js.get("ok"):
            log.warning("sync HTTP %s: %s", status, (text or "")[:200])
            time.sleep(backoff)
            backoff = min(backoff * 2, 60)
            continue
        backoff = 5
        if b:
            last_beat = time.time()
        if results:
            c.executemany("UPDATE sms SET reported=1 WHERE job_id=?", [(x["id"],) for x in results])
        if dels:
            c.executemany("UPDATE sms SET delivery_reported=1 WHERE job_id=?", [(x["id"],) for x in dels])
        c.commit()
        jobs = js.get("jobs") or []
        for job in jobs:
            send_one(c, job)
        if jobs or len(results) == 100:
            continue  # نتیجه‌ها همان لحظه گزارش شوند
        if time.time() - last_delivery >= 120:
            last_delivery = time.time()
            delivery(c)
        poll = max(2, int(js.get("poll") or 5))
        time.sleep(poll * 3 if night() else poll)
    log.info("relay stop")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        log.exception("relay crashed")
        sys.exit(1)
