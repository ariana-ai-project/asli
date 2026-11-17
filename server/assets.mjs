import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { Readable } from "node:stream";

const MIME = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jfif": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".ogg": "audio/ogg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webm": "video/webm",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const info = async (path) => {
  try { return await stat(path); } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
    throw error;
  }
};

function rangeOf(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return false;
  let start, end;
  if (!match[1]) {
    const length = Number(match[2]);
    if (!length) return false;
    start = Math.max(0, size - length);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) return false;
  return { start, end };
}

export function createAssets(directory) {
  const root = resolve(directory);

  async function match(request) {
    if (request.method !== "GET" && request.method !== "HEAD") return null;
    const url = new URL(request.url);
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch (_) {
      return new Response("Bad Request", { status: 400 });
    }
    if (pathname.includes("\0") || pathname.includes("\\") || pathname.split("/").some((part) => part === ".assetsignore")) return null;
    let file = resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(root + sep)) return null;

    let stat0 = await info(file);
    if (stat0?.isDirectory()) {
      if (!url.pathname.endsWith("/")) {
        const index = await info(resolve(file, "index.html"));
        if (!index?.isFile()) return null;
        return Response.redirect(new URL(`${url.pathname}/${url.search}`, url.origin), 308);
      }
      file = resolve(file, "index.html");
      stat0 = await info(file);
    } else if (!stat0 && !extname(file)) {
      const html = `${file}.html`;
      const htmlStat = await info(html);
      if (htmlStat?.isFile()) { file = html; stat0 = htmlStat; }
    }
    if (!stat0?.isFile()) return null;

    const etag = `W/"${stat0.size.toString(16)}-${Math.floor(stat0.mtimeMs).toString(16)}"`;
    const headers = new Headers({
      "Accept-Ranges": "bytes",
      "Cache-Control": extname(file) === ".html" || file.endsWith(`${sep}sw.js`) ? "no-cache" : "public, max-age=3600",
      "Content-Type": MIME[extname(file).toLowerCase()] || "application/octet-stream",
      "ETag": etag,
      "Last-Modified": stat0.mtime.toUTCString(),
      "X-Content-Type-Options": "nosniff",
    });
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });

    const range = rangeOf(request.headers.get("range"), stat0.size);
    if (range === false) {
      headers.set("Content-Range", `bytes */${stat0.size}`);
      return new Response(null, { status: 416, headers });
    }
    const start = range?.start || 0;
    const end = range?.end ?? stat0.size - 1;
    headers.set("Content-Length", String(end - start + 1));
    if (range) headers.set("Content-Range", `bytes ${start}-${end}/${stat0.size}`);
    const body = request.method === "HEAD" ? null : Readable.toWeb(createReadStream(file, { start, end }));
    return new Response(body, { status: range ? 206 : 200, headers });
  }

  return {
    match,
    async fetch(request) { return await match(request) || new Response("Not Found", { status: 404 }); },
  };
}
