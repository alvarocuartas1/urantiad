/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    host: true,
    port: 5173,
    // Docker on Windows does not forward file change events into the container, so the dev
    // server polls the files instead (set by docker-compose.yml only).
    watch: process.env.WATCH_POLLING === 'true' ? { usePolling: true, interval: 300 } : undefined,
  },
  test: {
    environment: 'jsdom',
    // Worker threads start much faster than child processes (forks) on Windows.
    pool: 'threads',
    // Starting many jsdom workers at once can exceed Vitest's fixed 60 s start-up timeout
    // on a busy machine; two at a time is also faster overall.
    maxWorkers: 2,
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
