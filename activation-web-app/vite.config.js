import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // Memastikan Noble tidak dianggap sebagai external saat build
      external: []
    }
  },
  resolve: {
    alias: {
      // Opsional: Memastikan path ke node_modules konsisten
    }
  }
})
