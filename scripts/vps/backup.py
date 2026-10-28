#!/usr/bin/env python3
"""
پشتیبان‌گیریِ شبانهٔ سامانهٔ آریانا روی سرورِ شرکت (آبان ۱۴۰۵) — فقط کتابخانهٔ استانداردِ پایتون.

  • پایگاه داده (D1): GET /relay/backup/schema و صفحه‌به‌صفحه GET /relay/backup/rows (worker/relay.js) ← یک فایلِ SQLite با همان
    جدول‌ها، rowidها و ایندکس‌ها ← integrity_check ← gzip در backups/db/asli-YYYY-MM-DD.sqlite.gz؛ ۳۰ نسخهٔ آخر می‌ماند.
  • کد: آینهٔ کاملِ مخزنِ گیت (عمومی) در backups/code.git با همهٔ تاریخچه.
  • نتیجه در backup-status.json — پلِ پیامک آن را در تپشش به سامانه می‌دهد («پشتیبان‌گیری» در «درگاه پیامک»ِ پنل پشتیبانی).

رازهای Worker (کلیدها) خواندنی نیستند و در نسخهٔ پشتیبان نمی‌آیند.
"""
import base64
import datetime
import glob
import gzip
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(HERE, "config.json"), encoding="utf-8"))
API = CFG.get("site", "https://arianaai.website").rstrip("/") + "/tamin-poshtibani/api/relay/backup"
REPO = CFG.get("repo", "https://github.com/ariana-ai-project/asli.git")
KEEP = int(CFG.get("keep", 30))
OUT = os.path.join(HERE, "backups")
STATUS = os.path.join(HERE, "backup-status.json")
LOG = os.path.join(HERE, "backup.log")


def utc():
    return datetime.datetime.now(datetime.timezone.utc)


def log(msg):
    line = f"{utc().strftime('%Y-%m-%dT%H:%M:%SZ')} {msg}"
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def get(path, tries=6):
    url = API + path
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"x-relay-key": CFG["relay_key"], "Accept": "application/json", "User-Agent": "ariana-backup/1"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code in (403, 404):
                raise RuntimeError(f"HTTP {e.code} {e.read().decode('utf-8', 'replace')[:200]}")
            err = f"HTTP {e.code}"
        except Exception as e:
            err = str(e)
        time.sleep(min(60, 3 * 2 ** i))
    raise RuntimeError(f"{path[:80]}: {err}")


def val(v):
    return base64.b64decode(v["$b64"]) if isinstance(v, dict) and "$b64" in v else v


def qid(n):
    return '"' + str(n).replace('"', '""') + '"'


def dump_db(path):
    schema = get("/schema")
    con = sqlite3.connect(path)
    con.execute("PRAGMA journal_mode=OFF")
    con.execute("PRAGMA synchronous=OFF")
    virtual = [t["name"] for t in schema["tables"] if t["sql"].upper().startswith("CREATE VIRTUAL TABLE")]
    shadow = lambda n: any(n != v and n.startswith(v + "_") for v in virtual)
    tables = [t for t in schema["tables"] if not shadow(t["name"])]
    for t in tables:
        con.execute(t["sql"])
    total = 0
    for t in tables:
        name, after, n = t["name"], None, 0
        while True:
            q = f"/rows?t={urllib.parse.quote(name)}&n=500" + (f"&after={urllib.parse.quote(after)}" if after else "")
            page = get(q)
            cols, rows = page["cols"], page["rows"]
            if rows:
                if cols and cols[0] == "__rowid":
                    names = ["rowid"] + cols[1:]
                else:
                    names = cols
                sql = f"INSERT INTO {qid(name)} ({','.join(qid(c) if c != 'rowid' else 'rowid' for c in names)}) VALUES ({','.join('?' * len(names))})"
                con.executemany(sql, [[val(v) for v in r] for r in rows])
                n += len(rows)
            after = page.get("next")
            if not after:
                break
            time.sleep(0.05)
        con.commit()
        total += n
    for ix in schema.get("indexes", []):
        if not shadow(ix["table"]):
            try:
                con.execute(ix["sql"])
            except sqlite3.Error as e:
                log(f"index {ix['name']}: {e}")
    con.commit()
    ok = con.execute("PRAGMA integrity_check").fetchone()[0]
    con.close()
    if ok != "ok":
        raise RuntimeError(f"integrity_check: {ok}")
    return len(tables), total


def code_mirror():
    dst = os.path.join(OUT, "code.git")
    if os.path.isdir(dst):
        subprocess.run(["git", "-C", dst, "remote", "update", "--prune"], check=True, capture_output=True, timeout=600)
    else:
        subprocess.run(["git", "clone", "--mirror", "--quiet", REPO, dst], check=True, capture_output=True, timeout=900)
    head = subprocess.run(["git", "-C", dst, "rev-parse", "--short", "main"], capture_output=True, text=True).stdout.strip()
    return head


def main():
    os.makedirs(os.path.join(OUT, "db"), exist_ok=True)
    t0 = time.time()
    st = {"at": int(t0 * 1000), "ok": False}
    day = utc().strftime("%Y-%m-%d")
    part = os.path.join(OUT, "db", f"asli-{day}.sqlite.part")
    try:
        if os.path.exists(part):
            os.remove(part)
        tables, rows = dump_db(part)
        gz = os.path.join(OUT, "db", f"asli-{day}.sqlite.gz")
        with open(part, "rb") as src, gzip.open(gz + ".part", "wb", compresslevel=6) as dst:
            shutil.copyfileobj(src, dst, 1 << 20)
        os.replace(gz + ".part", gz)
        os.remove(part)
        for old in sorted(glob.glob(os.path.join(OUT, "db", "asli-*.sqlite.gz")))[:-KEEP]:
            os.remove(old)
        st.update(ok=True, tables=tables, rows=rows, bytes=os.path.getsize(gz), file=os.path.basename(gz))
        try:
            st["code"] = code_mirror()
        except Exception as e:
            st["code_error"] = str(e)[:200]
    except Exception as e:
        st["error"] = str(e)[:200]
        if os.path.exists(part):
            os.remove(part)
    st["secs"] = int(time.time() - t0)
    json.dump(st, open(STATUS, "w", encoding="utf-8"), ensure_ascii=False)
    log(json.dumps(st, ensure_ascii=False))
    return 0 if st["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
