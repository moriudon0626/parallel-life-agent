import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      usePolling: true, // Better file watching on Windows
    },
  },
  optimizeDeps: {
    force: true, // Always re-bundle dependencies
  },
})
