/**
 * Tiny static SPA server for the built PWA in `dist/`.
 * - Serves files in dist/ with sensible cache headers
 * - Falls back to index.html for unknown paths so Expo Router deep links work
 *   (e.g. /onboarding, /course/abc) when the user reloads the page
 * - sw.js + index.html are sent with no-cache so PWA updates ship immediately
 * - Hashed bundles in /_expo/static/* get a 1-year immutable cache
 */
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "dist");
const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || "0.0.0.0";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

function cacheHeadersFor(filePath) {
  const name = path.basename(filePath);
  if (name === "sw.js" || name === "index.html") {
    return "no-cache, no-store, must-revalidate";
  }
  if (filePath.includes(`${path.sep}_expo${path.sep}static${path.sep}`)) {
    return "public, max-age=31536000, immutable";
  }
  if (name === "manifest.json") {
    return "public, max-age=3600";
  }
  return "public, max-age=300";
}

async function readIfExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    if (stat.isFile()) return await fs.readFile(filePath);
  } catch {
    // not found
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/" || pathname.endsWith("/")) {
      pathname = path.posix.join(pathname, "index.html");
    }

    // Resolve and guard against path traversal
    const resolved = path.resolve(distDir, "." + pathname);
    if (!resolved.startsWith(distDir)) {
      res.writeHead(403, { "content-type": "text/plain" });
      return res.end("Forbidden");
    }

    let body = await readIfExists(resolved);
    let filePath = resolved;

    if (!body) {
      // SPA fallback: any unknown route returns index.html so the client
      // router can pick it up.
      filePath = path.join(distDir, "index.html");
      body = await readIfExists(filePath);
      if (!body) {
        res.writeHead(404, { "content-type": "text/plain" });
        return res.end("Not found and no SPA shell present.");
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "content-type": MIME[ext] || "application/octet-stream",
      "cache-control": cacheHeadersFor(filePath),
      ...(filePath.endsWith("sw.js") ? { "service-worker-allowed": "/" } : {}),
    });
    res.end(body);
  } catch (e) {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end(`Server error: ${(e && e.message) || e}`);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[serve] Static SPA server listening on http://${HOST}:${PORT}`);
  console.log(`[serve] Serving dist from ${distDir}`);
});
