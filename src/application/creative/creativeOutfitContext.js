const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function projectReadyCreativeOutfits(values) {
  if (!Array.isArray(values)) {
    throw new TypeError('Canonical Outfit list must be an array');
  }

  const projected = [];
  for (const [index, outfit] of values.entries()) {
    if (!outfit || typeof outfit !== 'object' || Array.isArray(outfit)) {
      throw new TypeError('Canonical Outfit entry ' + index + ' must be an object');
    }
    if (outfit.status !== 'ACTIVE' || outfit.referenceReadiness !== 'REFERENCES_READY') continue;
    if (typeof outfit.id !== 'string' || !UUID.test(outfit.id) || outfit.id !== outfit.id.toLowerCase()) {
      throw new TypeError('Ready Outfit ID must be a canonical UUID');
    }
    if (typeof outfit.name !== 'string' || !outfit.name.trim()) {
      throw new TypeError('Ready Outfit name is required');
    }
    if (!Array.isArray(outfit.entries) || outfit.entries.length < 1 || outfit.entries.length > 32) {
      throw new TypeError('Ready Outfit entries must contain 1 to 32 canonical references');
    }
    for (const field of ['style', 'season', 'occasion']) {
      if (typeof outfit[field] !== 'string' || !outfit[field]) {
        throw new TypeError('Ready Outfit ' + field + ' is required');
      }
    }

    projected.push(Object.freeze({
      id: outfit.id,
      name: outfit.name,
      style: outfit.style,
      season: outfit.season,
      occasion: outfit.occasion,
      entryCount: outfit.entries.length,
    }));
  }

  return Object.freeze(projected);
}


const EMPTY_CREATIVE_OUTFITS = Object.freeze([]);

// A principal switch can render once before useEffect cleanup runs. Bind the
// cached projection to the identity that loaded it and fail closed synchronously.
export function creativeOutfitsForPrincipal({ outfits, status, loadedPrincipalKey, principalKey }) {
  if (status !== 'ready' || typeof principalKey !== 'string' || !principalKey || loadedPrincipalKey !== principalKey) {
    return EMPTY_CREATIVE_OUTFITS;
  }
  if (!Array.isArray(outfits)) {
    throw new TypeError('Ready Creative Outfit context must be an array');
  }
  return outfits;
}
