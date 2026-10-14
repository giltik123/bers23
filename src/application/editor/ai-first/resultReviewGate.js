/**
 * Per-candidate preview acceptance. This is a browser interlock, NOT a substitute
 * for Core artifact lineage or independent photographic quality evaluation.
 */
export function reviewCandidateIdentity({
  beforeUrl, afterUrl, finalArtifactId, executionId, kind, scope,
}) {
  const ids = [beforeUrl, afterUrl, finalArtifactId, executionId, kind, scope]
    .map(value => typeof value === 'string' && value.trim() ? value : null);
  return JSON.stringify(ids);
}

/** Every acceptance must refer to the source/output pixels actually displayed. */
export function canAcceptReviewedCandidate({
  identity, acknowledgedIdentity, afterLoadedIdentity, beforeLoadedIdentity,
  afterErrorIdentity, beforeErrorIdentity, requiresBefore, requiresReview,
  reviewComplete, busy,
}) {
  return !busy && typeof identity === 'string'
    && acknowledgedIdentity === identity
    && afterLoadedIdentity === identity
    && afterErrorIdentity !== identity
    && (!requiresBefore || (
      beforeLoadedIdentity === identity && beforeErrorIdentity !== identity
    ))
    && (!requiresReview || reviewComplete === true);
}
