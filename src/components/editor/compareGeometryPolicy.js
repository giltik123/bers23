/**
 * Pixel-aligned split review is safe only if source and candidate natural
 * (not CSS-scaled) dimensions match exactly. A crop/rotate/result with
 * unknown geometry must never be shown as a registered pixel overlay.
 */
export function canComparePixelsAligned(before, after) {
  const valid = value => value && Number.isSafeInteger(value.width) &&
    Number.isSafeInteger(value.height) &&
    value.width > 0 && value.height > 0 &&
    value.width <= 16384 && value.height <= 16384 &&
    value.width * value.height <= 16_777_216;
  return Boolean(valid(before) && valid(after) &&
    before.width === after.width && before.height === after.height);
}

/**
 * Natural dimensions alone cannot prove co-registration. Only Editor operations
 * that preserve source-frame coordinates may opt into split inspection.
 * Unknown/AI/geometric operations stay in before/after mode even when square
 * rotations happen to have identical output dimensions.
 */
export function canCompareOperationAligned(operation) {
  return operation === 'MASKED_EXPOSURE' ||
    operation === 'MASKED_WHITE_BALANCE' ||
    operation === 'MASKED_LEVELS' ||
    operation === 'BACKGROUND_ISOLATION' ||
    operation === 'FASHION_TRYON';
}
