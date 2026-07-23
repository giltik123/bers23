// Locale-aware formatting via the Intl API — dates, time, numbers, currency,
// percentages, relative time and pluralization. Pure, no app state.
class FormattingService {
  constructor() { this.locale = 'en'; this._pluralCache = new Map(); }
  setLocale(code) { this.locale = code; this._pluralCache.clear(); }

  date(value, options = { dateStyle: 'medium' }) { return new Intl.DateTimeFormat(this.locale, options).format(new Date(value)); }
  time(value, options = { timeStyle: 'short' }) { return new Intl.DateTimeFormat(this.locale, options).format(new Date(value)); }
  number(value, options = {}) { return new Intl.NumberFormat(this.locale, options).format(value); }
  currency(value, currency = 'USD', options = {}) { return new Intl.NumberFormat(this.locale, { style: 'currency', currency, ...options }).format(value); }
  percent(value, options = {}) { return new Intl.NumberFormat(this.locale, { style: 'percent', maximumFractionDigits: 0, ...options }).format(value); }

  relativeTime(value) {
    const diff = new Date(value).getTime() - Date.now();
    const rtf = new Intl.RelativeTimeFormat(this.locale, { numeric: 'auto' });
    const units = [['year', 31536e6], ['month', 2592e6], ['day', 864e5], ['hour', 36e5], ['minute', 6e4], ['second', 1e3]];
    for (const [unit, ms] of units) { if (Math.abs(diff) >= ms || unit === 'second') return rtf.format(Math.round(diff / ms), unit); }
    return rtf.format(0, 'second');
  }

  plural(count) {
    if (!this._pluralCache.has(this.locale)) this._pluralCache.set(this.locale, new Intl.PluralRules(this.locale));
    return this._pluralCache.get(this.locale).select(count);
  }
}
export const formattingService = new FormattingService();