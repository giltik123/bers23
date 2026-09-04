const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const READINESS = new Set([
  'READY', 'SOURCE_UNAVAILABLE', 'STALE_SOURCE', 'GARMENT_UNAVAILABLE', 'GARMENT_UNSUPPORTED',
  'REPRESENTATION_REQUIRED', 'REPRESENTATION_AMBIGUOUS', 'BODY_ANCHORS_REQUIRED',
  'BODY_ANCHORS_AMBIGUOUS', 'EVIDENCE_INVALID',
]);

/**
 * UI-only selection/readiness boundary for the canonical Outfit surface.
 * It never prepares or executes Try-On and never creates request/ticket/evidence
 * identity. Canonical Try-On application/Core remain the readiness authority.
 */
export function createCanonicalTryOnReadinessSelection({ checkReadiness }) {
  if (typeof checkReadiness !== 'function') throw new TypeError('Try-On readiness selection requires checkReadiness');

  return Object.freeze({
    async inspect(value) {
      const selection = normalizeSelection(value);
      const readiness = await checkReadiness(Object.freeze({
        projectId: selection.projectId,
        sourceArtifactId: selection.sourceArtifactId,
        garmentId: selection.garmentId,
      }));
      return normalizeReadiness(readiness, selection);
    },
  });
}

function normalizeSelection(value) {
  requirePlainObject(value, 'Try-On selection');
  requireExactKeys(value, ['entryId', 'outfit', 'projectId', 'sourceArtifactId'], 'Try-On selection');
  const outfit = value.outfit;
  requirePlainObject(outfit, 'Try-On Outfit');
  if (outfit.status !== 'ACTIVE') throw new Error('Try-On requires an active canonical Outfit');
  if (!Array.isArray(outfit.entries)) throw new TypeError('Try-On Outfit entries must be an array');
  const entryId = uuid(value.entryId, 'entryId');
  const matches = outfit.entries.filter((entry) => entry?.entryId === entryId);
  if (matches.length !== 1) throw new Error('Try-On selection must resolve exactly one canonical Outfit entry');
  const entry = matches[0];
  requirePlainObject(entry, 'Try-On Outfit entry');
  if (entry.referenceReadiness !== 'READY') throw new Error('Try-On Outfit entry is not canonically ready');
  const garmentId = uuid(entry.garmentId, 'garmentId');
  return Object.freeze({
    entryId,
    garmentId,
    projectId: uuid(value.projectId, 'projectId'),
    sourceArtifactId: sourceArtifactId(value.sourceArtifactId),
  });
}

function normalizeReadiness(value, selection) {
  requirePlainObject(value, 'Try-On readiness');
  const allowed = value.categoryGroup === undefined ? ['status'] : ['categoryGroup', 'status'];
  requireExactKeys(value, allowed, 'Try-On readiness');
  if (!READINESS.has(value.status)) throw new Error('Unknown Try-On readiness status');
  if (value.categoryGroup !== undefined && !['tops', 'bottoms', 'dresses', 'footwear', 'accessories', 'other'].includes(value.categoryGroup)) {
    throw new Error('Unknown Try-On category group');
  }
  return Object.freeze({
    entryId: selection.entryId,
    garmentId: selection.garmentId,
    status: value.status,
    ...(value.categoryGroup !== undefined ? { categoryGroup: value.categoryGroup } : {}),
  });
}

function uuid(value, label) {
  if (typeof value !== 'string' || !UUID.test(value)) throw new TypeError(`${label} must be a UUID`);
  return value.toLowerCase();
}
function sourceArtifactId(value) {
  if (typeof value !== 'string') throw new TypeError('sourceArtifactId must be a string');
  const normalized = value.trim();
  if (!normalized || normalized.length > 512 || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new TypeError('sourceArtifactId is outside the accepted Try-On contract');
  }
  return normalized;
}
function requirePlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object`);
  }
}
function requireExactKeys(value, expected, label) {
  requirePlainObject(value, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} has unknown or missing fields`);
  }
}
