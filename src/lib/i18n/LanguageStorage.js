const KEY = 'app_language_v1';
// Persists the user's chosen language locally (survives reloads, per device).
export const languageStorage = {
  get() { try { return localStorage.getItem(KEY); } catch { return null; } },
  set(code) { try { localStorage.setItem(KEY, code); } catch { /* ignore */ } },
};