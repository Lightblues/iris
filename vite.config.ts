import { defineConfig, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json' with { type: 'json' }
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), crx({ manifest }) as unknown as PluginOption],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      input: {
        sidepanel: 'src/sidepanel/index.html',
      },
      output: {
        manualChunks: {
          // Split vendor libs into separate chunks
          'vendor-markdown': ['react-markdown', 'remark-gfm', 'remark-math', 'rehype-katex', 'katex'],
          'vendor-radix': ['@radix-ui/react-dialog', '@radix-ui/react-scroll-area', '@radix-ui/react-select', '@radix-ui/react-slot'],
          'vendor-ai': ['ai', '@ai-sdk/openai', '@ai-sdk/react'],
          'vendor-otel': ['@opentelemetry/sdk-trace-web', '@opentelemetry/exporter-trace-otlp-proto', '@arizeai/openinference-vercel'],
        },
      },
    },
  },
})
