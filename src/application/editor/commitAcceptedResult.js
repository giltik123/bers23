function defaultReportSideEffectError(label, error) {
  console.error(`[Editor] ${label}`, error);
}

function reportBestEffort(reportSideEffectError, label, error) {
  try {
    reportSideEffectError(label, error);
  } catch {
    // Reporting is itself non-authoritative and must never turn an accepted
    // canonical Project mutation into a browser-visible commit failure.
  }
}

/**
 * Preserve the canonical Project Accept boundary in the presence of optional
 * browser-side effects.
 *
 * `commitCanonical` is the only authoritative/awaited mutation. Once it
 * succeeds, `cleanupAcceptedResult` runs before any notification/advisory work
 * so the accepted preview cannot remain actionable and be submitted twice.
 * Optional side effects are intentionally best-effort: both synchronous throws
 * and rejected promises are reported without rejecting this function.
 */
export async function commitAcceptedResult({
  commitCanonical,
  cleanupAcceptedResult,
  sideEffects = [],
  reportSideEffectError = defaultReportSideEffectError,
}) {
  if (typeof commitCanonical !== 'function') throw new TypeError('commitCanonical must be a function');
  if (typeof cleanupAcceptedResult !== 'function') throw new TypeError('cleanupAcceptedResult must be a function');
  if (!Array.isArray(sideEffects)) throw new TypeError('sideEffects must be an array');

  await commitCanonical();
  cleanupAcceptedResult();

  for (const sideEffect of sideEffects) {
    if (!sideEffect || typeof sideEffect.run !== 'function') continue;
    const label = sideEffect.label || 'Accepted-result side effect failed';
    try {
      Promise.resolve(sideEffect.run()).catch((error) => {
        reportBestEffort(reportSideEffectError, label, error);
      });
    } catch (error) {
      reportBestEffort(reportSideEffectError, label, error);
    }
  }
}
