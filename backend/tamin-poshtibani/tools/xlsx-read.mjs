/* ============================================================
   خوانندهٔ کوچکِ xlsx برای ابزارهای ورود (بی وابستگیِ بیرونی): zip را با zlib می‌گشاید، رشته‌های مشترک را می‌خواند و
   ردیف‌های هر برگه را جریانی (بی بارگذاریِ کلِ XML در حافظه) به صورت {ستون: مقدار} پس می‌دهد — برای برگهٔ ۲۲۴ مگابایتیِ
   «تأمین‌کننده × نوع قلم» در فایل ۶ لازم است.
   ============================================================ */
import { openSync, readSync, fstatSync, closeSync } from "node:fs";
import { inflateRawSync, createInflateRaw } from "node:zlib";

const dec = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, "&");

function readAt(fd, pos, len) { const b = Buffer.alloc(len); readSync(fd, b, 0, len, pos); return b; }

/** فهرستِ مرکزیِ zip ← Map(نام → {method, csize, usize, off}) */
function entries(fd, size) {
  const tail = readAt(fd, Math.max(0, size - 65557), Math.min(size, 65557));
  let e = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (e < 0) throw new Error("zip نیست");
  const n = tail.readUInt16LE(e + 10), cdSize = tail.readUInt32LE(e + 12), cdOff = tail.readUInt32LE(e + 16);
  const cd = readAt(fd, cdOff, cdSize);
  const out = new Map();
  let p = 0;
  for (let i = 0; i < n; i++) {
    const method = cd.readUInt16LE(p + 10), csize = cd.readUInt32LE(p + 20), usize = cd.readUInt32LE(p + 24);
    const nl = cd.readUInt16LE(p + 28), xl = cd.readUInt16LE(p + 30), cl = cd.readUInt16LE(p + 32), off = cd.readUInt32LE(p + 42);
    const name = cd.slice(p + 46, p + 46 + nl).toString("utf8");
    out.set(name, { method, csize, usize, off });
    p += 46 + nl + xl + cl;
  }
  return out;
}
function dataStart(fd, ent) {
  const h = readAt(fd, ent.off, 30);
  return ent.off + 30 + h.readUInt16LE(26) + h.readUInt16LE(28);
}

export class Xlsx {
  constructor(path) {
    this.fd = openSync(path, "r");
    this.size = fstatSync(this.fd).size;
    this.ents = entries(this.fd, this.size);
    this.ss = null;
  }
  close() { closeSync(this.fd); }
  text(name) {
    const ent = this.ents.get(name);
    if (!ent) return null;
    const raw = readAt(this.fd, dataStart(this.fd, ent), ent.csize);
    return (ent.method === 0 ? raw : inflateRawSync(raw)).toString("utf8");
  }
  sharedStrings() {
    if (this.ss) return this.ss;
    const x = this.text("xl/sharedStrings.xml") || "";
    this.ss = [];
    for (const m of x.matchAll(/<si>([\s\S]*?)<\/si>/g)) this.ss.push(dec([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
    return this.ss;
  }
  /** نامِ برگه‌ها به ترتیبِ workbook ← [{name, file}] */
  sheets() {
    const wb = this.text("xl/workbook.xml"), rels = this.text("xl/_rels/workbook.xml.rels") || "";
    const target = new Map([...rels.matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
    return [...wb.matchAll(/<sheet [^>]*?name="([^"]*)"[^>]*?r:id="([^"]+)"[^>]*\/>/g)].map((m) => {
      const t = (target.get(m[2]) || "").replace(/^\/?xl\//, "");
      return { name: dec(m[1]), file: `xl/${t}` };
    });
  }
  /** ردیف‌های یک برگه، جریانی: برای هر ردیف onRow({A: …, B: …}, شمارهٔ ردیف) — Promise تا پایان */
  rows(sheetFile, onRow) {
    const ss = this.sharedStrings();
    const ent = this.ents.get(sheetFile);
    if (!ent) throw new Error(`برگهٔ ${sheetFile} نیست`);
    const CELL = /<c r="([A-Z]+)[0-9]+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    const parse = (rowXml) => {
      const out = {};
      for (const m of rowXml.matchAll(CELL)) {
        const t = (/t="(\w+)"/.exec(m[2]) || [])[1];
        const body = m[3] || "";
        let v = (/<v>([\s\S]*?)<\/v>/.exec(body) || [])[1];
        if (t === "s" && v != null) v = ss[+v];
        else if (t === "inlineStr") v = dec([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(""));
        else if (v != null) v = dec(v);
        if (v != null && v !== "") out[m[1]] = v;
      }
      return out;
    };
    return new Promise((resolve, reject) => {
      const start = dataStart(this.fd, ent);
      let pos = start, end = start + ent.csize, buf = "";
      const inf = ent.method === 0 ? null : createInflateRaw();
      const handle = (chunk) => {
        buf += chunk.toString("utf8");
        let i;
        while ((i = buf.indexOf("</row>")) >= 0) {
          const row = buf.slice(0, i); buf = buf.slice(i + 6);
          const j = row.lastIndexOf("<row ");
          if (j < 0) continue;
          const rn = Number((/<row [^>]*r="([0-9]+)"/.exec(row.slice(j)) || [])[1]);
          onRow(parse(row.slice(j)), rn);
        }
      };
      if (!inf) { handle(readAt(this.fd, start, ent.csize)); resolve(); return; }
      inf.on("data", handle);
      inf.on("end", resolve);
      inf.on("error", reject);
      const pump = () => {
        while (pos < end) {
          const len = Math.min(1 << 20, end - pos);
          const ok = inf.write(readAt(this.fd, pos, len));
          pos += len;
          if (!ok) { inf.once("drain", pump); return; }
        }
        inf.end();
      };
      pump();
    });
  }
}
