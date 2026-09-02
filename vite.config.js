import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import { productionBrowserCsp, productionBrowserMetaCsp } from './config/frontendSecurityPolicy.mjs'

export { productionBrowserCsp, productionBrowserMetaCsp }

function productionCspPlugin(csp) {
  return {
    name: 'bers-production-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'pre',
      handler() {
        return [{
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: csp },
          injectTo: 'head-prepend',
        }]
      },
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const csp = productionBrowserMetaCsp(env.VITE_CORE_API_URL)
  return {
    plugins: [productionCspPlugin(csp), react()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
  }
})
