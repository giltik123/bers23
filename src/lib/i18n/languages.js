// Supported languages registry. Add a new language here + a matching pack folder
// under src/lib/i18n/locales/<code>/ — no existing code needs to change.
export const LANGUAGES = [
  { code: 'en', name: 'English', native: 'English', rtl: false },
  { code: 'ru', name: 'Russian', native: 'Русский', rtl: false },
  { code: 'uk', name: 'Ukrainian', native: 'Українська', rtl: false },
  { code: 'de', name: 'German', native: 'Deutsch', rtl: false },
  { code: 'fr', name: 'French', native: 'Français', rtl: false },
  { code: 'es', name: 'Spanish', native: 'Español', rtl: false },
  { code: 'it', name: 'Italian', native: 'Italiano', rtl: false },
  { code: 'pt', name: 'Portuguese', native: 'Português', rtl: false },
  { code: 'pl', name: 'Polish', native: 'Polski', rtl: false },
  { code: 'tr', name: 'Turkish', native: 'Türkçe', rtl: false },
  { code: 'ar', name: 'Arabic', native: 'العربية', rtl: true },
  { code: 'ja', name: 'Japanese', native: '日本語', rtl: false },
  { code: 'zh', name: 'Chinese (Simplified)', native: '简体中文', rtl: false },
  { code: 'ko', name: 'Korean', native: '한국어', rtl: false },
];

export const DEFAULT_LANGUAGE = 'en';
export const SUPPORTED_CODES = LANGUAGES.map((l) => l.code);
export const getLanguage = (code) => LANGUAGES.find((l) => l.code === code) || null;
export const isRTL = (code) => Boolean(getLanguage(code)?.rtl);