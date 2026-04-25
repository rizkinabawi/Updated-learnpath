import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    minify: 'esbuild',
    cssMinify: 'esbuild',
    emptyOutDir: true,
    rollupOptions: {
      // Externalize all noble and lucide libraries so they are loaded via the browser's importmap
      external: [
        '@noble/ed25519',
        '@noble/hashes/sha512',
        '@noble/hashes/utils',
        'lucide'
      ]
    }
  },
  server: {
    port: 3000
  }
});
