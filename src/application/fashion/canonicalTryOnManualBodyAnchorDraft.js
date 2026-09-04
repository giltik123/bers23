import {
  BODY_ANCHOR_NAMES,
  deterministicTryOnSupportedCategory,
  missingRequiredBodyAnchors,
  requiredBodyAnchorsForCategory,
} from './canonicalTryOnManualAcquisition.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCE_ARTIFACT_MAX_LENGTH = 512;
const SOURCE_KEYS = Object.freeze(['category', 'imageUrl', 'projectId', 'sourceArtifactId']);
const BODY_ANCHOR_NAME_SET = new Set(BODY_ANCHOR_NAMES);

export function normalizeManualBodyAnchorEditorSource(value) {
  if (!isPlainObject(value)) throw new TypeError('Manual body-anchor editor source must be a plain object');
  requireExactKeys(value, SOURCE_KEYS, 'Manual body-anchor editor source');

  const projectId = uuid(value.projectId, 'projectId');
  const sourceArtifactId = canonicalSourceArtifactId(value.sourceArtifactId);
  const category = canonicalCategory(value.category);
  const imageUrl = safeDisplayImageUrl(value.imageUrl);
  const requiredAnchors = requiredBodyAnchorsForCategory(category);
  const supported = deterministicTryOnSupportedCategory(category);

  return Object.freeze({
    projectId,
    sourceArtifactId,
    category,
    imageUrl,
    supported,
    requiredAnchors,
  });
}

/**
 * Browser-side validation is intentionally limited to the accepted explicit
 * body-anchor intent contract. Core remains the final destination-geometry and
 * exact-source authority; this helper does not infer, mirror, interpolate,
 * snap, reorder or otherwise repair user points.
 */
export function validateManualBodyAnchorDraft(category, anchors) {
  let canonical;
  try {
    canonical = canonicalCategory(category);
  } catch {
    return feedback('unsupported_category', 'The garment category is unavailable for deterministic Try-On.');
  }

  if (!deterministicTryOnSupportedCategory(canonical)) {
    return feedback('unsupported_category', 'This garment category is not supported by deterministic Try-On.');
  }
  if (!isPlainObject(anchors)) {
    return feedback('invalid', 'Body anchors are unavailable.');
  }

  const names = Object.keys(anchors);
  if (names.length > BODY_ANCHOR_NAMES.length || names.some((name) => !BODY_ANCHOR_NAME_SET.has(name))) {
    return feedback('invalid_name', 'Body anchors contain an unknown point name.');
  }
  for (const name of names) {
    if (!validPoint(anchors[name])) {
      return feedback('invalid_point', `${bodyAnchorLabel(name)} must stay inside the project image.`);
    }
  }
  if (names.length < 4) {
    return feedback('too_few_anchors', 'Place at least four explicit body anchors.');
  }

  const missing = missingRequiredBodyAnchors(canonical, anchors);
  if (missing.length > 0) {
    return Object.freeze({
      canSave: false,
      code: 'required_anchor_missing',
      message: `Add the required ${missing.map(bodyAnchorLabel).join(', ')} anchor${missing.length === 1 ? '' : 's'}.`,
      missing,
    });
  }

  return Object.freeze({
    canSave: true,
    code: 'ready',
    message: 'Body anchors are ready for Core validation.',
    missing: Object.freeze([]),
  });
}

export function bodyAnchorLabel(name) {
  if (!BODY_ANCHOR_NAME_SET.has(name)) return 'body anchor';
  return name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

function feedback(code, message) {
  return Object.freeze({ canSave: false, code, message, missing: Object.freeze([]) });
}

function validPoint(value) {
  return Array.isArray(value)
    && value.length === 2
    && value.every(Number.isFinite)
    && value[0] >= 0 && value[0] <= 1
    && value[1] >= 0 && value[1] <= 1;
}

function canonicalCategory(value) {
  if (typeof value !== 'string') throw new TypeError('garment category must be a string');
  const normalized = value.normalize('NFKC').trim().toLowerCase();
  // These accepted helpers are the canonical Wardrobe taxonomy check.
  requiredBodyAnchorsForCategory(normalized);
  deterministicTryOnSupportedCategory(normalized);
  return normalized;
}

function canonicalSourceArtifactId(value) {
  if (typeof value !== 'string') throw new TypeError('sourceArtifactId must be a string');
  const normalized = value.trim();
  if (!normalized || normalized.length > SOURCE_ARTIFACT_MAX_LENGTH || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new TypeError('sourceArtifactId is outside the accepted identifier contract');
  }
  return normalized;
}

function safeDisplayImageUrl(value) {
  if (typeof value !== 'string') throw new TypeError('Project image URL must be a string');
  const normalized = value.trim();
  if (!normalized) throw new TypeError('Project image URL is unavailable');
  const sameOrigin = normalized.startsWith('/') && !normalized.startsWith('//');
  const secureRemote = normalized.startsWith('https://');
  if (!sameOrigin && !secureRemote) throw new TypeError('Project image URL is outside the accepted display contract');
  return normalized;
}

function uuid(value, label) {
  if (typeof value !== 'string' || !UUID.test(value)) throw new TypeError(`${label} must be a UUID`);
  return value.toLowerCase();
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function requireExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} has unknown or missing fields`);
  }
}
