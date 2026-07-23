import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { localizationManager } from '@/lib/i18n/LocalizationManager';
import { formattingService } from '@/lib/i18n/FormattingService';
import { isRTL } from '@/lib/i18n/languages';

const TranslationContext = createContext(null);

// Wraps the app: initializes localization, re-renders on language change, and
// exposes t / plural / format helpers. Interface-only — never localizes user prompts.
export function TranslationProvider({ children }) {
  const [language, setLanguage] = useState(localizationManager.language);
  const [ready, setReady] = useState(localizationManager.ready);

  useEffect(() => {
    const unsubscribe = localizationManager.subscribe(setLanguage);
    localizationManager.init().then(() => setReady(true));
    return unsubscribe;
  }, []);

  const t = useCallback((key, params) => localizationManager.t(key, params), [language]); // eslint-disable-line react-hooks/exhaustive-deps
  const plural = useCallback((key, count, params) => localizationManager.plural(key, count, params), [language]); // eslint-disable-line react-hooks/exhaustive-deps
  const changeLanguage = useCallback((code) => localizationManager.setLanguage(code), []);

  const value = { language, ready, t, plural, changeLanguage, rtl: isRTL(language), format: formattingService };
  return <TranslationContext.Provider value={value}>{children}</TranslationContext.Provider>;
}

export function useTranslation() {
  const context = useContext(TranslationContext);
  if (!context) throw new Error('useTranslation must be used within a TranslationProvider');
  return context;
}