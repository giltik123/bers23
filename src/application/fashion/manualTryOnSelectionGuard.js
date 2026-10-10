/**
 * Fashion manual editor identity is not just a garment id: the same garment
 * may be used in multiple outfits and against different Project images.
 * This is a browser stale-response guard, never a Core authorization token.
 */
export function manualTryOnSelectionKey(selection) {
  if (!selection) return null;
  const matches = Array.isArray(selection.outfit?.entries)
    ? selection.outfit.entries.filter(entry => entry?.entryId === selection.entryId)
    : [];
  return JSON.stringify([
    selection.projectId ?? null,
    selection.sourceArtifactId ?? null,
    selection.outfit?.id ?? null,
    selection.outfit?.revision ?? null,
    selection.entryId ?? null,
    matches.length === 1 ? matches[0].garmentId ?? null : null,
    matches.length === 1 ? matches[0].garmentCategory ?? null : null,
    matches.length,
  ]);
}

/** Only the most recent request from the currently displayed identity may act. */
export function isFreshManualTryOnLoad(sequence, currentSequence, requestedKey, currentKey) {
  return Number.isSafeInteger(sequence) && sequence > 0
    && sequence === currentSequence
    && typeof requestedKey === 'string'
    && requestedKey === currentKey;
}
