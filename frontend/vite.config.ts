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
  },
  test: {
    environment: 'jsdom',
    // Worker threads start much faster than child processes (forks) on Windows.
    pool: 'threads',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
