import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { fileURLToPath, URL } from 'node:url'

// The SPA is served by the DumpStation server in production. In development
// the API is proxied so the browser talks to a single origin.
const apiTarget = process.env.DUMPSTATION_API ?? 'http://localhost:8080'

// `vite build --mode demo` produces the public demo that ships with the
// landing site (site/public/demo): same UI, in-browser fake API, no server.
function demoHtml(): Plugin {
  return {
    name: 'dumpstation-demo-html',
    transformIndexHtml(html) {
      return html
        .replace('<html lang="en"', '<html lang="en" data-ds-demo')
        .replace(/\s*<script src="\/config\.js"><\/script>/, '')
        .replace('<title>DumpStation</title>', '<title>DumpStation demo</title>')
    },
  }
}

export default defineConfig(({ mode }) => {
  const demo = mode === 'demo'
  return {
    base: demo ? '/demo/' : '/',
    define: { __DEMO__: JSON.stringify(demo) },
    plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), ...(demo ? [demoHtml()] : [])],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/config.js': { target: apiTarget, changeOrigin: true },
      },
    },
    build: {
      target: 'es2022',
      sourcemap: false,
      chunkSizeWarningLimit: 1200,
      outDir: demo ? '../site/public/demo' : 'dist',
      emptyOutDir: true,
    },
  }
})
