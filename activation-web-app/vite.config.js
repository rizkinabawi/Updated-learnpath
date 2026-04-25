import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    minify: 'esbuild',
    cssMinify: 'esbuild',
    emptyOutDir: true,
    rollupOptions: {
      external: [
        'lucide',
        '@noble/ed25519',
        '@noble/hashes/sha512',
        '@noble/hashes/utils'
      ]
    }
  },
  server: {
    port: 3000
  }
});
