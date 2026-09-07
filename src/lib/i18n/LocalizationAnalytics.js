// Tracks language usage intent and de-duplicates missing-key reports locally.
// Remote telemetry is disabled until a narrow production Core observability
// authority exists; opening the product must not probe a legacy generic route.
class LocalizationAnalytics {
  constructor() { this._reportedMissing = new Set(); this._events = []; }
  selectLanguage(code) { this._track('language_selected', { code }); }
  changeLanguage(from, to) { this._track('language_changed', { from, to }); }
  missingKey(key, code) {
    const id = `${code}:${key}`;
    if (this._reportedMissing.has(id)) return;
    this._reportedMissing.add(id);
    this._track('missing_translation', { key, code });
  }
  _track(eventName, properties) {
    this._events.push(Object.freeze({ eventName: `i18n_${eventName}`, properties: Object.freeze({ ...properties }) }));
    if (this._events.length > 100) this._events.shift();
  }
}
export const localizationAnalytics = new LocalizationAnalytics();