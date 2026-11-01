const TRY_ON_CATEGORIES = new Set(['tops', 'bottoms', 'dresses']);

// The wardrobe is a Core-owned snapshot. Never turn a malformed or stale
// response into an eligible garment selection for a paid try-on request.
export function eligibleTryOnGarments(snapshot) {
  if (!Array.isArray(snapshot)) throw new TypeError('Некорректный ответ гардероба');
  return snapshot.filter(item => item && typeof item.garmentId === 'string' &&
    item.garmentId.length > 0 && item.status === 'ACTIVE' &&
    TRY_ON_CATEGORIES.has(item.categoryGroup));
}

export function canSubmitTryOn({ disabled, needsAccountSetup, loading, running, error, garments, garmentId, consent }) {
  return !disabled && !needsAccountSetup && !loading && !running && !error && consent === true &&
    typeof garmentId === 'string' && garmentId.length > 0 &&
    Array.isArray(garments) && garments.some(item => item && item.garmentId === garmentId &&
      item.status === 'ACTIVE' && TRY_ON_CATEGORIES.has(item.categoryGroup));
}
