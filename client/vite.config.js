import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor':   ['react', 'react-dom', 'react-hot-toast'],
          'supabase':       ['@supabase/supabase-js'],
          'dnd':            ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
          'emailjs':        ['@emailjs/browser'],
        },
      },
    },
  },
})
