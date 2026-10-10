// Geometry and viewport laws for the Editor quality inspector.
// These functions change only how two candidate images are displayed;
// neither may alter Project, FINAL Artifact, billing or pixel data.

export const INSPECTOR_ZOOM_LEVELS = Object.freeze([1, 2, 4]);

export function clampComparisonSplit(value) {
  if (!Number.isFinite(value)) throw new Error('Comparison split position must be finite');
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function isComparableGeometry(before, after) {
  return [before, after].every((size) =>
    size && Number.isSafeInteger(size.width) && Number.isSafeInteger(size.height) &&
    size.width > 0 && size.height > 0
  ) && before.width === after.width && before.height === after.height;
}

export function nextInspectorZoom(current, direction) {
  const index = INSPECTOR_ZOOM_LEVELS.indexOf(current);
  if (index === -1 || (direction !== 'in' && direction !== 'out')) {
    throw new Error('Unsupported quality inspector zoom');
  }
  return INSPECTOR_ZOOM_LEVELS[Math.max(0, Math.min(INSPECTOR_ZOOM_LEVELS.length - 1,
    index + (direction === 'in' ? 1 : -1)))];
}

export function clampInspectorPan(pan, zoom) {
  if (!pan || !Number.isFinite(pan.x) || !Number.isFinite(pan.y) ||
    !INSPECTOR_ZOOM_LEVELS.includes(zoom)) {
    throw new Error('Quality inspector pan or zoom is invalid');
  }
  // Translation is expressed in percentages of the *unscaled* viewport.
  // At 2x the maximum center translation is 50% of the viewport in either axis.
  const maximum = (zoom - 1) * 50;
  return Object.freeze({
    x: Math.max(-maximum, Math.min(maximum, pan.x)),
    y: Math.max(-maximum, Math.min(maximum, pan.y)),
  });
}

export function availableInspectorModes(before, after) {
  return Object.freeze(isComparableGeometry(before, after) ?
    ['before', 'after', 'split'] : ['before', 'after']);
}
