import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        // Required for SSE (Server-Sent Events) — disables response buffering
        // so event-stream chunks are flushed to the browser immediately.
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            // Tell the backend not to compress SSE responses
            proxyReq.setHeader('Accept-Encoding', 'identity')
          })
        },
      },
      // /space/public/* lives on the backend — proxy for local widget dev
      '/space': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      // Uploaded assets (chatbot logos, etc.) — served as static files by the backend
      '/uploads': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})

// Made with Bob
