import { DEFAULT_LANGUAGE, SUPPORTED_CODES } from '@/lib/i18n/languages';
import { languageDetector } from '@/lib/i18n/LanguageDetector';
import { languageStorage } from '@/lib/i18n/LanguageStorage';
import { translationLoader } from '@/lib/i18n/TranslationLoader';
import { rtlManager } from '@/lib/i18n/RTLManager';
import { formattingService } from '@/lib/i18n/FormattingService';
import { localizationAnalytics } from '@/lib/i18n/LocalizationAnalytics';

const resolve = (pack, key) => key.split('.').reduce((current, part) => (current == null ? current : current[part]), pack);
const interpolate = (template, params) => template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));

// Central runtime for localization. Owns the active language, the loaded pack
// (+ English fallback), and the translate function. Never touches business logic.
class LocalizationManager {
  constructor() {
    this.language = DEFAULT_LANGUAGE;
    this.pack = {};
    this.fallbackPack = {};
    this.usedKeys = new Set();
    this.listeners = new Set();
    this.ready = false;
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _notify() { this.listeners.forEach((fn) => fn(this.language)); }

  async init() {
    this.fallbackPack = await translationLoader.load(DEFAULT_LANGUAGE);
    await this.setLanguage(languageDetector.detect(), { silent: true });
    localizationAnalytics.selectLanguage(this.language);
    this.ready = true;
    return this.language;
  }

  async setLanguage(code, { silent = false } = {}) {
    if (!SUPPORTED_CODES.includes(code)) code = DEFAULT_LANGUAGE;
    const previous = this.language;
    this.pack = await translationLoader.load(code);
    this.language = code;
    languageStorage.set(code);
    rtlManager.apply(code);
    formattingService.setLocale(code);
    if (!silent) localizationAnalytics.changeLanguage(previous, code);
    this._notify();
    return code;
  }

  // t('module.key', { name }) — falls back to English, then the key itself.
  t(key, params = {}) {
    this.usedKeys.add(key);
    let value = resolve(this.pack, key);
    if (value == null) { value = resolve(this.fallbackPack, key); if (value != null) localizationAnalytics.missingKey(key, this.language); }
    if (value == null) { localizationAnalytics.missingKey(key, this.language); return key; }
    return typeof value === 'string' ? interpolate(value, params) : value;
  }

  // Pluralized lookup: expects sibling keys like items.one / items.other.
  plural(key, count, params = {}) {
    const category = formattingService.plural(count);
    const value = resolve(this.pack, `${key}.${category}`) ?? resolve(this.pack, `${key}.other`) ?? resolve(this.fallbackPack, `${key}.other`);
    return value == null ? key : interpolate(value, { count, ...params });
  }
}
export const localizationManager = new LocalizationManager();