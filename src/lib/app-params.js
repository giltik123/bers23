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
  const storage = window.localStorage;
  for (const key of ['core_access_token', 'core_token', 'token', 'core_from_url']) storage?.removeItem(key);

  const url = new URL(window.location.href);
  let changed = false;
  for (const name of ['access_token', 'clear_access_token']) {
    if (url.searchParams.has(name)) { url.searchParams.delete(name); changed = true; }
  }
  if (changed) window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}

scrubLegacyBrowserAuth();

// Kept as an inert compatibility export until remaining legacy imports, if any,
// are conclusively removed. It contains no credentials, URL values or storage.
export const appParams = Object.freeze({});
