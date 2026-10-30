import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const api = `http://127.0.0.1:${process.env.IRIS_DEV_API_PORT ?? 33030}`
const proxy = { '/auth': api, '/devices': api, '/call': api, '/health': api }
const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  define: { __IRIS_VERSION__: JSON.stringify(version) },
  server: { host: '127.0.0.1', port: 33031, strictPort: true, proxy },
})
