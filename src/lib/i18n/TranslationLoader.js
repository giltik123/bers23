import { DEFAULT_LANGUAGE } from '@/lib/i18n/languages';

// Lazy-loads a language pack (all modules) on demand and caches it in memory.
// Vite code-splits each locale folder so only the active language ships at runtime.
const loaders = import.meta.glob('./locales/*/index.js');

class TranslationLoader {
  constructor() { this.cache = new Map(); }
  isLoaded(code) { return this.cache.has(code); }
  get(code) { return this.cache.get(code) || null; }

  async load(code) {
    if (this.cache.has(code)) return this.cache.get(code);
    const loader = loaders[`./locales/${code}/index.js`] || loaders[`./locales/${DEFAULT_LANGUAGE}/index.js`];
    const module = await loader();
    const pack = module.default || module.pack || {};
    this.cache.set(code, pack);
    return pack;
  }
}
export const translationLoader = new TranslationLoader();