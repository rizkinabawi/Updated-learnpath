import { defineConfig } from 'vite';

export default defineConfig({
  css: {
    transformer: false, 
    minify: false,
  },
  build: {
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: undefined,
      }
    }
  }
});
