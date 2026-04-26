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

    // 3. Create a basic Service Worker for offline caching
    const swContent = `
const CACHE_NAME = 'learningpath-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // In a real PWA you'd cache important assets here.
      // For now, we'll just cache the entry points.
      return cache.addAll([
        '/',
        '/index.html',
        '/manifest.json'
      ]);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Cache hit - return response
      if (response) {
        return response;
      }
      return fetch(event.request).catch(() => {
        // Fallback for offline if fetch fails
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
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
