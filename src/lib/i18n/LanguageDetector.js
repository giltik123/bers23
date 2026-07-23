import { SUPPORTED_CODES, DEFAULT_LANGUAGE } from '@/lib/i18n/languages';
import { languageStorage } from '@/lib/i18n/LanguageStorage';

const match = (value) => {
  if (!value) return null;
  const lower = value.toLowerCase();
  return SUPPORTED_CODES.find((code) => lower === code || lower.startsWith(`${code}-`)) || null;
};

// Resolution order: saved preference → browser languages → device language → English.
export const languageDetector = {
  detect() {
    const saved = languageStorage.get();
    if (saved && SUPPORTED_CODES.includes(saved)) return saved;
    const candidates = [...(navigator.languages || []), navigator.language, navigator.userLanguage];
    for (const candidate of candidates) { const found = match(candidate); if (found) return found; }
    return DEFAULT_LANGUAGE;
  },
};