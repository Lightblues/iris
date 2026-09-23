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
        // Function form: CRXJS dev bundles with Rollup 2, which treats the
        // object form as extra entry points and cannot resolve bare package names.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/react-markdown|remark-gfm|remark-math|rehype-katex|[/\\]katex[/\\]/.test(id)) return 'vendor-markdown'
          if (id.includes('@radix-ui')) return 'vendor-radix'
          if (/[/\\]node_modules[/\\](ai|@ai-sdk[/\\])/.test(id)) return 'vendor-ai'
          if (id.includes('@opentelemetry') || id.includes('@arizeai')) return 'vendor-otel'
        },
      },
    },
  },
})
