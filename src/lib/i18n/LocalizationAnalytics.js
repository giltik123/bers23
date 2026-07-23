import { base44 } from '@/api/base44Client';

// Tracks language usage and missing-key reports. Missing keys are de-duped so a
// re-render storm never floods analytics.
class LocalizationAnalytics {
  constructor() { this._reportedMissing = new Set(); }
  selectLanguage(code) { this._track('language_selected', { code }); }
  changeLanguage(from, to) { this._track('language_changed', { from, to }); }
  missingKey(key, code) {
    const id = `${code}:${key}`;
    if (this._reportedMissing.has(id)) return;
    this._reportedMissing.add(id);
    this._track('missing_translation', { key, code });
  }
  _track(eventName, properties) { try { base44.analytics.track({ eventName: `i18n_${eventName}`, properties }); } catch { /* ignore */ } }
}
export const localizationAnalytics = new LocalizationAnalytics();