export const CANONICAL_TRYON_READINESS_STATUSES = Object.freeze([
  'READY',
  'SOURCE_UNAVAILABLE',
  'STALE_SOURCE',
  'GARMENT_UNAVAILABLE',
  'GARMENT_UNSUPPORTED',
  'REPRESENTATION_REQUIRED',
  'REPRESENTATION_AMBIGUOUS',
  'BODY_ANCHORS_REQUIRED',
  'BODY_ANCHORS_AMBIGUOUS',
  'EVIDENCE_INVALID',
]);

export const CANONICAL_TRYON_CATEGORY_GROUPS = Object.freeze([
  'tops', 'bottoms', 'dresses', 'footwear', 'accessories', 'other',
]);

export const CANONICAL_TRYON_SUPPORTED_CATEGORY_GROUPS = Object.freeze([
  'tops', 'bottoms', 'dresses', 'footwear',
]);

const READINESS = new Set(CANONICAL_TRYON_READINESS_STATUSES);
const CATEGORY_GROUPS = new Set(CANONICAL_TRYON_CATEGORY_GROUPS);
const SUPPORTED_CATEGORY_GROUPS = new Set(CANONICAL_TRYON_SUPPORTED_CATEGORY_GROUPS);

export function requireCanonicalTryOnSupportedCategoryGroup(value, label = 'Try-On') {
  if (!SUPPORTED_CATEGORY_GROUPS.has(value)) {
    throw new Error(`${label} requires a supported category group`);
  }
  return value;
}

/**
 * Normalizes only the UI-safe readiness summary vocabulary.
 *
 * Core's canonical READY variant always carries one supported deterministic
 * garment category group. Treating READY without that evidence, or READY for
 * accessories/other, as usable would let a malformed/drifted response bypass
 * the server's GARMENT_UNSUPPORTED decision. Failure states may still carry any
 * known category group for diagnostic UI copy.
 */
export function normalizeCanonicalTryOnReadinessSummary(value, label = 'Try-On readiness') {
  requirePlainObject(value, label);
  const allowed = value.categoryGroup === undefined ? ['status'] : ['categoryGroup', 'status'];
  requireExactKeys(value, allowed, label);

  if (!READINESS.has(value.status)) throw new Error(`Unknown ${label} status`);
  if (value.categoryGroup !== undefined && !CATEGORY_GROUPS.has(value.categoryGroup)) {
    throw new Error(`Unknown ${label} category group`);
  }
  if (value.status === 'READY') {
    requireCanonicalTryOnSupportedCategoryGroup(value.categoryGroup, `${label} READY`);
  }

  return Object.freeze({
    status: value.status,
    ...(value.categoryGroup !== undefined ? { categoryGroup: value.categoryGroup } : {}),
  });
}

function requirePlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object`);
  }
}

function requireExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} has unknown or missing fields`);
  }
}
