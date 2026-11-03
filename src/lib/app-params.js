const isNode = typeof window === 'undefined';

/**
 * One-way cleanup for the retired browser bearer bootstrap.
 *
 * Deliberately does not persist URL/app parameters. In particular, storing the
 * current href before OAuth/reset fragments are scrubbed would recreate a
 * JS-readable secret in localStorage.
 */
function scrubLegacyBrowserAuth() {
  if (isNode) return;

  // Retired bearer keys are only being removed. Storage is optional and may
  // throw at the getter or per-key operation in privacy-restricted contexts.
  try {
    const storage = window.localStorage;
    for (const key of ['core_access_token', 'core_token', 'token', 'core_from_url']) {
      try { storage?.removeItem(key); } catch { /* continue scrubbing other retired keys */ }
    }
  } catch { /* denied Web Storage must not block URL sanitization or app startup */ }

  // URL cleanup is independent of storage availability: never leave the
  // retired bearer query parameters behind just because Web Storage is denied.
  try {
    const url = new URL(window.location.href);
    let changed = false;
    for (const name of ['access_token', 'clear_access_token']) {
      if (url.searchParams.has(name)) { url.searchParams.delete(name); changed = true; }
    }
    if (changed) {
      try {
        window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
      } catch { /* restricted history APIs must not abort module initialization */ }
    }
  } catch { /* best-effort bootstrap cleanup; never create a browser auth fallback */ }
}

scrubLegacyBrowserAuth();

// Kept as an inert compatibility export until remaining legacy imports, if any,
// are conclusively removed. It contains no credentials, URL values or storage.
export const appParams = Object.freeze({});
