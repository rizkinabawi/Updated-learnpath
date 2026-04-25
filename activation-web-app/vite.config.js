import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    minify: 'esbuild',
    cssMinify: 'esbuild',
    emptyOutDir: true,
  },
  server: {
    port: 3000
  }
});
