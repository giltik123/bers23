export const FINAL_SOURCE_CONFLICT_CODE = 'final_source_conflict';
export const FINAL_SOURCE_CONFLICT_MESSAGE = 'The prepared result was not accepted because the Project changed. Run the edit again from the current image.';

export function isFinalSourceConflict(error) {
  return error?.code === FINAL_SOURCE_CONFLICT_CODE;
}

/**
 * Recover from Core rejecting a source-bound FINAL after the canonical Project
 * cursor moved. The stale result remains behind the Editor commit lock while
 * the canonical Project is reloaded, then its browser preview is discarded.
 *
 * No execution callback is accepted here by design: recovery never reruns local
 * inference or a provider operation automatically.
 */
export async function recoverFinalSourceConflict({
  reloadCanonicalProject,
  disarmRetry,
  clearPendingResult,
  disposePendingPreview,
  showMessage,
}) {
  if (typeof reloadCanonicalProject !== 'function') throw new TypeError('reloadCanonicalProject must be a function');
  if (typeof disarmRetry !== 'function') throw new TypeError('disarmRetry must be a function');
  if (typeof clearPendingResult !== 'function') throw new TypeError('clearPendingResult must be a function');
  if (typeof disposePendingPreview !== 'function') throw new TypeError('disposePendingPreview must be a function');
  if (typeof showMessage !== 'function') throw new TypeError('showMessage must be a function');

  // ErrorBanner Retry may still point at the source-bound operation that made
  // this FINAL. Disarm it before any await so it can never reuse stale context.
  disarmRetry();

  try {
    await reloadCanonicalProject();
  } finally {
    // The pending result is cleared before ObjectURL disposal so even an
    // unexpected browser cleanup failure cannot intentionally retain it as an
    // acceptable/retryable Editor result.
    clearPendingResult();
    try {
      disposePendingPreview();
    } finally {
      showMessage(FINAL_SOURCE_CONFLICT_MESSAGE);
    }
  }
}
