/**
 * A replaced <img> can abort its previous signed Core result request while
 * React installs the next canonical Project image. This is expected only for
 * an image resource, the exact Core origin, the result-delivery route and the
 * browser's explicit ERR_ABORTED signal. The caller still verifies that the
 * replacement image loads and matches the canonical Core bytes.
 */
export function isExpectedReplacedProjectImageAbort(request, coreOrigin) {
  if (!request || request.resourceType !== 'image' || request.failure !== 'net::ERR_ABORTED') return false;
  try {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    return url.origin === coreOrigin
      && parts.length === 6
      && parts[1] === 'api'
      && parts[2] === 'core'
      && parts[3] === 'artifacts'
      && parts[4] === 'results'
      && parts[5].length > 0;
  } catch {
    return false;
  }
}
