/**
 * Browser navigation can abort a document request when the browser commits a
 * newer navigation to the same expected Auth destination. Only the two exact
 * R3m logout/navigation requests are classified as expected; all other
 * requestfailed events remain release failures.
 */
export function isExpectedR3mAuthRequestAbort(entry, { frontendOrigin, coreOrigin }) {
  if (!entry || entry.failure !== 'net::ERR_ABORTED' || typeof entry.url !== 'string') return false;

  try {
    const url = new URL(entry.url);
    const frontend = new URL(frontendOrigin);
    const core = new URL(coreOrigin);

    if (url.origin === core.origin) {
      return url.pathname === '/api/core/auth/logout' && url.search === '' && url.hash === '';
    }

    return url.origin === frontend.origin
      && url.pathname === '/login'
      && url.search === '?return_to=%2F'
      && url.hash === '';
  } catch {
    return false;
  }
}
