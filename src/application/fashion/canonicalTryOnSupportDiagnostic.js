const SUPPORT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/**
 * Project only the Core correlation identifier needed for support diagnostics.
 *
 * The Core client Error object may also retain the parsed response body in
 * `error.data`. Product UI must never inspect or render that bag because it is
 * not a stable product contract and may acquire storage/provider/evidence fields
 * over time. A capability boundary may wrap a Core error (for example after a
 * successful contour admission followed by a failed Garment reload), so one
 * direct `cause.correlationId` is also accepted through the same strict filter.
 */
export function canonicalTryOnSupportId(error) {
  if (!error || (typeof error !== 'object' && typeof error !== 'function')) return null;
  return normalizeSupportId(error.correlationId) || normalizeSupportId(error.cause?.correlationId);
}

export function appendCanonicalTryOnSupportId(message, error) {
  const text = nonEmptyMessage(message, 'Canonical deterministic Try-On failed.');
  const supportId = canonicalTryOnSupportId(error);
  if (!supportId) return text;
  const suffix = ` Support ID: ${supportId}`;
  return text.endsWith(suffix) ? text : `${text}${suffix}`;
}

export function canonicalTryOnErrorMessage(error, fallback = 'Canonical deterministic Try-On failed.') {
  const message = typeof error?.message === 'string' && error.message.trim()
    ? error.message.trim()
    : nonEmptyMessage(fallback, 'Canonical deterministic Try-On failed.');
  return appendCanonicalTryOnSupportId(message, error);
}

/**
 * Preserve the original Error instance and all accepted semantic fields such as
 * `code`, `retryable` and the contour reload sentinel. Only its human-readable
 * message is decorated; if a host freezes the Error, diagnostics degrade safely
 * to the original error instead of manufacturing a replacement authority bag.
 */
export function annotateCanonicalTryOnError(error, fallback) {
  if (!(error instanceof Error)) return error;
  const message = canonicalTryOnErrorMessage(error, fallback);
  if (message === error.message) return error;
  try {
    error.message = message;
  } catch {
    // Preserve the original semantic error rather than wrapping/copying fields.
  }
  return error;
}

function normalizeSupportId(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return SUPPORT_ID.test(normalized) ? normalized : null;
}

function nonEmptyMessage(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim();
  return normalized || fallback;
}
