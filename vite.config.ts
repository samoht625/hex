import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true
  },
  worker: {
    format: 'es'
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/healthz': 'http://localhost:3001',
      '/ws': { target: 'ws://localhost:3001', ws: true }
    }
  }
})
