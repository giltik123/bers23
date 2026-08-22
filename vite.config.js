import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath, URL } from 'node:url'

export function productionBrowserCsp(coreApiUrl) {
  const connectSource = resolveCoreConnectSource(coreApiUrl)
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "form-action 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https:",
    "font-src 'self' data:",
    `connect-src ${connectSource}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'self' blob: data:",
    "require-trusted-types-for 'script'",
    "trusted-types 'none'",
  ].join('; ')
}

function resolveCoreConnectSource(value) {
  const candidate = String(value || '/api/core').trim()
  if (!candidate || candidate.startsWith('/')) return "'self'"
  const url = new URL(candidate)
  const localHttp = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
  if (url.protocol !== 'https:' && !localHttp) throw new Error('VITE_CORE_API_URL must be relative or HTTPS outside localhost')
  if (url.username || url.password) throw new Error('VITE_CORE_API_URL must not contain credentials')
  return `'self' ${url.origin}`
}

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
  const csp = productionBrowserCsp(env.VITE_CORE_API_URL)
  return {
    plugins: [productionCspPlugin(csp), react()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
  }
})
