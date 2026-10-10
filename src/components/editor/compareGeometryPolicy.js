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
