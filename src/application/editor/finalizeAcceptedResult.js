function defaultReportSideEffectError(label, error) {
  console.error(`[Editor] ${label}`, error);
}

function reportBestEffort(reportSideEffectError, label, error) {
  try {
    reportSideEffectError(label, error);
  } catch {
    // Reporting is non-authoritative and must never turn a committed Project
    // mutation into a browser-visible Accept failure.
  }
}

/**
 * Finalize browser state after canonical Project Accept has already succeeded.
 *
 * Cleanup always runs before optional notification/advisory work. Neither a
 * synchronous throw nor a rejected promise from those side effects may reject
 * or otherwise overwrite the already-successful canonical Accept outcome.
 */
export function finalizeAcceptedResult({
  cleanupAcceptedResult,
  sideEffects = [],
  reportSideEffectError = defaultReportSideEffectError,
}) {
  if (typeof cleanupAcceptedResult !== 'function') {
    reportBestEffort(reportSideEffectError, 'Accepted-result cleanup is unavailable', new TypeError('cleanupAcceptedResult must be a function'));
    return;
  }

  try {
    cleanupAcceptedResult();
  } catch (error) {
    reportBestEffort(reportSideEffectError, 'Failed to finalize accepted-result UI state', error);
  }

  if (!Array.isArray(sideEffects)) {
    reportBestEffort(reportSideEffectError, 'Accepted-result side effects are invalid', new TypeError('sideEffects must be an array'));
    return;
  }

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
