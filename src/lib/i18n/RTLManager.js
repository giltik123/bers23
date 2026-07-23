import { isRTL } from '@/lib/i18n/languages';

// Applies text direction at the document level. Layout mirroring is handled by
// CSS logical properties + [dir] rules; image editing surfaces are never mirrored.
export const rtlManager = {
  apply(code) {
    const rtl = isRTL(code);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('dir', rtl ? 'rtl' : 'ltr');
      document.documentElement.setAttribute('lang', code);
    }
    return rtl;
  },
  isRTL,
};