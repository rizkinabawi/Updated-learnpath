import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, "dist");

async function injectPWA() {
  console.log("Injecting PWA functionality...");

  try {
    // 1. Create manifest.json
    const manifest = {
      name: "LearningPath",
      short_name: "LearningPath",
      description: "LearningPath Progressive Web App",
      start_url: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#000000",
      icons: [
        {
          src: "/favicon.svg",
          sizes: "any",
          type: "image/svg+xml"
        },
        {
          src: "/favicon.ico",
          sizes: "64x64",
          type: "image/x-icon"
        }
      ]
    };
    await fs.writeFile(
      path.join(distPath, "manifest.json"),
      JSON.stringify(manifest, null, 2)
    );
    console.log("Created manifest.json");

    // 2. Read public directory and copy files
    const publicPath = path.join(__dirname, "public");
    try {
      const publicFiles = await fs.readdir(publicPath);
      for (const file of publicFiles) {
        await fs.copyFile(
          path.join(publicPath, file),
          path.join(distPath, file)
        );
      }
      console.log("Copied public assets");
    } catch (e) {
      console.log("No public directory or error copying public assets:", e.message);
    }

    // 3. Create the Service Worker.
    //    Strategy:
    //      - Navigation/HTML: NETWORK-FIRST (always show the freshest shell after
    //        a deploy; fall back to cached index.html only when offline).
    //      - Hashed bundles in /_expo/static/*: CACHE-FIRST (filenames include
    //        a content hash, so any change ships under a new URL — safe forever).
    //      - Other same-origin GETs: STALE-WHILE-REVALIDATE.
    //    The cache name is bumped on every build so the activate handler purges
    //    everything from the previous deploy. This is the fix for the "PWA does
    //    not render after redeploy" bug — the previous cache-first SW served a
    //    stale index.html that still referenced the OLD bundle hash, and the
    //    new bundle URL would 404, leaving the user with a blank screen.
    const buildId = Date.now().toString(36);
    const swContent = `
const CACHE_VERSION = '${buildId}';
const CACHE_NAME = 'learningpath-' + CACHE_VERSION;
const PRECACHE_URLS = ['/manifest.json', '/favicon.svg', '/favicon.ico'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Use addAll-style but tolerant of individual failures.
      Promise.all(
        PRECACHE_URLS.map((u) =>
          fetch(u, { cache: 'no-cache' })
            .then((res) => (res.ok ? cache.put(u, res) : null))
            .catch(() => null)
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((n) => n !== CACHE_NAME)
          .map((n) => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function isNavigationRequest(req) {
  if (req.mode === 'navigate') return true;
  const accept = req.headers.get('accept') || '';
  return req.method === 'GET' && accept.includes('text/html');
}

function isHashedAsset(url) {
  return /\\/_expo\\/static\\//.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return;

  // 1) Navigation: network-first, fall back to cached shell when offline.
  if (isNavigationRequest(req)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Cache the latest shell so offline reloads still work.
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put('/index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match('/index.html').then((r) => r || caches.match('/') || new Response(
            '<h1>Offline</h1><p>Tidak ada koneksi dan halaman belum di-cache.</p>',
            { headers: { 'content-type': 'text/html; charset=utf-8' } }
          ))
        )
    );
    return;
  }

  // 2) Hashed bundles: cache-first (filename contains content hash).
  if (isHashedAsset(url)) {
    event.respondWith(
      caches.match(req).then((cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
      )
    );
    return;
  }

  // 3) Other same-origin GETs: stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkPromise = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || networkPromise;
    })
  );
});
`;
    await fs.writeFile(path.join(distPath, "sw.js"), swContent);
    console.log("Created sw.js");

    // 4. Inject into index.html
    const indexPath = path.join(distPath, "index.html");
    let indexHtml = await fs.readFile(indexPath, "utf8");

    // Add manifest link if not exists
    if (!indexHtml.includes('rel="manifest"')) {
      indexHtml = indexHtml.replace(
        '</head>',
        '  <link rel="manifest" href="/manifest.json" />\n  <meta name="theme-color" content="#000000" />\n</head>'
      );
    }

    // Add service worker registration
    if (!indexHtml.includes('serviceWorker')) {
      indexHtml = indexHtml.replace(
        '</body>',
        `  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(reg => {
          console.log('ServiceWorker registration successful');
        }).catch(err => {
          console.log('ServiceWorker registration failed: ', err);
        });
      });
    }
  </script>\n</body>`
      );
    }

    await fs.writeFile(indexPath, indexHtml);
    console.log("Injected PWA tags into index.html");

  } catch (error) {
    console.error("Failed to inject PWA:", error);
    process.exit(1);
  }
}

injectPWA();
