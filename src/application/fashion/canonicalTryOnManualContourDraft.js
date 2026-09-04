import { MANUAL_PARAMETRIC_MAX_POINTS } from './canonicalTryOnManualAcquisition.js';

export const MANUAL_CONTOUR_MIN_POINTS = 3;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GARMENT_DELIVERY = /^\/api\/core\/garments\/delivery\/[^/?#]+$/;
const SOURCE_KEYS = Object.freeze(['category', 'expectedRevision', 'garmentId', 'imageExpiresAt', 'imageUrl']);

export function normalizeManualContourEditorSource(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError('Manual contour editor source must be a plain object');
  }
  const actual = Object.keys(value).sort();
  const expected = [...SOURCE_KEYS].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error('Manual contour editor source has unknown or missing fields');
  }
  if (typeof value.garmentId !== 'string' || !UUID.test(value.garmentId)) throw new TypeError('Manual contour garmentId must be a UUID');
  if (!Number.isSafeInteger(value.expectedRevision) || value.expectedRevision < 1) throw new TypeError('Manual contour expectedRevision must be positive');
  if (typeof value.category !== 'string' || !value.category.trim()) throw new TypeError('Manual contour category is unavailable');
  if (typeof value.imageUrl !== 'string' || !GARMENT_DELIVERY.test(value.imageUrl)) throw new TypeError('Manual contour image delivery is invalid');
  if (typeof value.imageExpiresAt !== 'string') throw new TypeError('Manual contour image expiry is invalid');
  const expiry = new Date(value.imageExpiresAt);
  if (!Number.isFinite(expiry.getTime()) || expiry.toISOString() !== value.imageExpiresAt) throw new TypeError('Manual contour image expiry is invalid');
  return Object.freeze({
    garmentId: value.garmentId.toLowerCase(),
    expectedRevision: value.expectedRevision,
    category: value.category,
    imageUrl: value.imageUrl,
    imageExpiresAt: value.imageExpiresAt,
  });
}

/**
 * Browser-side advisory validation for an explicit manual contour draft.
 * This intentionally does not quantize, repair, simplify, reorder or infer any
 * point. Core remains the final geometry/admission authority.
 */
export function validateManualContourDraft(points) {
  if (!Array.isArray(points)) return feedback('invalid', 'Contour points are unavailable.');
  if (points.length > MANUAL_PARAMETRIC_MAX_POINTS) {
    return feedback('too_complex', `Use at most ${MANUAL_PARAMETRIC_MAX_POINTS} explicit outline points.`);
  }

  for (const point of points) {
    if (!validPoint(point)) return feedback('invalid_point', 'Every outline point must stay inside the image.');
  }

  if (points.length < MANUAL_CONTOUR_MIN_POINTS) {
    return feedback('too_few_points', `Add at least ${MANUAL_CONTOUR_MIN_POINTS} outline points.`);
  }

  if (hasDuplicatePoint(points)) {
    return feedback('duplicate_point', 'Two outline points are identical. Move or remove one point.');
  }

  if (hasCollinearVertex(points)) {
    return feedback('degenerate', 'One outline point lies exactly on its neighboring edge. Move or remove it.');
  }

  if (selfIntersects(points)) {
    return feedback('self_intersection', 'The garment outline crosses itself. Adjust the crossing edges.');
  }

  if (signedDoubleArea(points) === 0) {
    return feedback('degenerate', 'The garment outline has no usable area.');
  }

  return Object.freeze({ canSave: true, code: 'ready', message: 'Contour is ready for Core validation.' });
}

function feedback(code, message) {
  return Object.freeze({ canSave: false, code, message });
}

function validPoint(value) {
  return Array.isArray(value)
    && value.length === 2
    && value.every(Number.isFinite)
    && value[0] >= 0 && value[0] <= 1
    && value[1] >= 0 && value[1] <= 1;
}

function hasDuplicatePoint(points) {
  const seen = new Set();
  for (const point of points) {
    const key = `${point[0]}:${point[1]}`;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

function hasCollinearVertex(points) {
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index + points.length - 1) % points.length];
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (cross(previous, current, next) === 0) return true;
  }
  return false;
}

function signedDoubleArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current[0] * next[1] - next[0] * current[1];
  }
  return area;
}

function selfIntersects(points) {
  for (let first = 0; first < points.length; first += 1) {
    const firstNext = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second += 1) {
      const secondNext = (second + 1) % points.length;
      if (first === second || firstNext === second || secondNext === first) continue;
      if (segmentsIntersect(points[first], points[firstNext], points[second], points[secondNext])) return true;
    }
  }
  return false;
}

function segmentsIntersect(a, b, c, d) {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);

  if (abC === 0 && onSegment(a, b, c)) return true;
  if (abD === 0 && onSegment(a, b, d)) return true;
  if (cdA === 0 && onSegment(c, d, a)) return true;
  if (cdB === 0 && onSegment(c, d, b)) return true;

  return ((abC > 0 && abD < 0) || (abC < 0 && abD > 0))
    && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0));
}

function onSegment(a, b, point) {
  return point[0] >= Math.min(a[0], b[0])
    && point[0] <= Math.max(a[0], b[0])
    && point[1] >= Math.min(a[1], b[1])
    && point[1] <= Math.max(a[1], b[1]);
}

function cross(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
