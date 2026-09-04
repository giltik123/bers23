import {
  normalizeCanonicalTryOnReadinessSummary,
  requireCanonicalTryOnSupportedCategoryGroup,
} from './canonicalTryOnReadinessContract.js';
import { deterministicTryOnSupportedCategory } from './canonicalTryOnManualAcquisition.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCE_ARTIFACT_MAX_LENGTH = 512;
const MANUAL_REPRESENTATION = new Set(['REPRESENTATION_REQUIRED', 'REPRESENTATION_AMBIGUOUS']);
const MANUAL_BODY = new Set(['BODY_ANCHORS_REQUIRED', 'BODY_ANCHORS_AMBIGUOUS']);

/**
 * Pure product policy for deciding whether a canonical readiness failure can be
 * remediated by the explicit manual editors.
 *
 * This policy never creates evidence and never turns a successful manual save
 * into READY. Save acknowledgement must be followed by a fresh canonical
 * readiness check; Run remains a separate explicit user action.
 */
export function canonicalTryOnManualRemediationPolicy({ selection, result }) {
  const stable = normalizeSelection(selection);
  const readiness = normalizeResult(result, stable.entryId, stable.garmentId);

  if (!readiness) return none('Check canonical readiness before opening manual prerequisite editors.');

  if (MANUAL_REPRESENTATION.has(readiness.status)) {
    const categoryGroup = requireManualCategoryGroup(readiness);
    return Object.freeze({
      mode: 'CONTOUR',
      canOpen: true,
      ambiguous: readiness.status === 'REPRESENTATION_AMBIGUOUS',
      requiresRecheckAfterSave: true,
      readiness,
      contourRequest: Object.freeze({ garmentId: stable.garmentId }),
      bodyAnchorSource: null,
      message: readiness.status === 'REPRESENTATION_AMBIGUOUS'
        ? 'Representation evidence is ambiguous. A new explicit contour may establish a newer canonical representation; readiness must be checked again afterward.'
        : 'A canonical parametric garment representation is required. Add an explicit garment contour, then check readiness again.',
      categoryGroup,
    });
  }

  if (MANUAL_BODY.has(readiness.status)) {
    const categoryGroup = requireManualCategoryGroup(readiness);
    if (!deterministicTryOnSupportedCategory(stable.category)) {
      throw new Error('Canonical Try-On body-anchor remediation received an unsupported Wardrobe category');
    }
    return Object.freeze({
      mode: 'BODY_ANCHORS',
      canOpen: true,
      ambiguous: readiness.status === 'BODY_ANCHORS_AMBIGUOUS',
      requiresRecheckAfterSave: true,
      readiness,
      contourRequest: null,
      bodyAnchorSource: Object.freeze({
        projectId: stable.projectId,
        sourceArtifactId: stable.sourceArtifactId,
        category: stable.category,
        imageUrl: stable.beforeUrl,
      }),
      message: readiness.status === 'BODY_ANCHORS_AMBIGUOUS'
        ? 'Body-anchor evidence is ambiguous. A new explicit anchor set may establish a newer canonical acquisition; readiness must be checked again afterward.'
        : 'Canonical body anchors are required for this exact project image. Add explicit anchors, then check readiness again.',
      categoryGroup,
    });
  }

  return none(messageForNonManual(readiness.status), readiness);
}

/**
 * Manual save is only an acknowledgement that new evidence was accepted. The
 * browser must clear the old readiness result and require an explicit recheck;
 * it may never synthesize READY from the save response.
 */
export function canonicalTryOnManualSaveTransition(previous) {
  if (!previous || typeof previous !== 'object' || previous.canOpen !== true
    || !['CONTOUR', 'BODY_ANCHORS'].includes(previous.mode)) {
    throw new Error('Manual Try-On save transition requires an open remediation state');
  }
  return Object.freeze({
    mode: 'RECHECK_REQUIRED',
    canOpen: false,
    ambiguous: false,
    requiresRecheckAfterSave: true,
    readiness: null,
    contourRequest: null,
    bodyAnchorSource: null,
    categoryGroup: null,
    message: 'Manual evidence was saved. Check canonical readiness again before Run or another manual submission.',
  });
}

function normalizeSelection(value) {
  requirePlainObject(value, 'Canonical Try-On remediation selection');
  requireExactKeys(
    value,
    ['beforeUrl', 'entryId', 'outfit', 'projectId', 'sourceArtifactId'],
    'Canonical Try-On remediation selection',
  );
  requirePlainObject(value.outfit, 'Canonical Try-On remediation Outfit');
  if (!Array.isArray(value.outfit.entries)) throw new TypeError('Canonical Try-On remediation Outfit entries are unavailable');

  const entryId = uuid(value.entryId, 'entryId');
  const projectId = uuid(value.projectId, 'projectId');
  const sourceArtifactId = sourceArtifact(value.sourceArtifactId);
  const beforeUrl = displayUrl(value.beforeUrl);
  const matches = value.outfit.entries.filter((entry) => entry?.entryId === entryId);
  if (matches.length !== 1) throw new Error('Canonical Try-On remediation selection does not resolve one Outfit entry');
  const entry = matches[0];
  const garmentId = uuid(entry.garmentId, 'garmentId');
  if (typeof entry.garmentCategory !== 'string' || !entry.garmentCategory.trim()) {
    throw new TypeError('Canonical Try-On remediation garment category is unavailable');
  }

  return Object.freeze({
    entryId,
    garmentId,
    category: entry.garmentCategory.normalize('NFKC').trim().toLowerCase(),
    projectId,
    sourceArtifactId,
    beforeUrl,
  });
}

function normalizeResult(value, entryId, garmentId) {
  if (value === null || value === undefined) return null;
  requirePlainObject(value, 'Canonical Try-On remediation result');
  if (!['READINESS', 'BLOCKED'].includes(value.status)) {
    return null;
  }
  requireExactKeys(value, ['readiness', 'status'], 'Canonical Try-On remediation result');
  requirePlainObject(value.readiness, 'Canonical Try-On remediation readiness');
  const allowed = value.readiness.categoryGroup === undefined
    ? ['entryId', 'garmentId', 'status']
    : ['categoryGroup', 'entryId', 'garmentId', 'status'];
  requireExactKeys(value.readiness, allowed, 'Canonical Try-On remediation readiness');
  const responseEntryId = uuid(value.readiness.entryId, 'readiness.entryId');
  const responseGarmentId = uuid(value.readiness.garmentId, 'readiness.garmentId');
  if (responseEntryId !== entryId || responseGarmentId !== garmentId) {
    throw new Error('Canonical Try-On remediation readiness does not match the selected Outfit entry');
  }

  const summary = normalizeCanonicalTryOnReadinessSummary(
    value.readiness.categoryGroup === undefined
      ? { status: value.readiness.status }
      : { status: value.readiness.status, categoryGroup: value.readiness.categoryGroup },
    'Canonical Try-On remediation readiness',
  );
  return Object.freeze({ entryId, garmentId, ...summary });
}

function requireManualCategoryGroup(readiness) {
  if (readiness.categoryGroup === undefined) {
    throw new Error('Manual Try-On remediation requires the canonical supported category group');
  }
  return requireCanonicalTryOnSupportedCategoryGroup(
    readiness.categoryGroup,
    'Manual Try-On remediation readiness',
  );
}

function none(message, readiness = null) {
  return Object.freeze({
    mode: 'NONE',
    canOpen: false,
    ambiguous: false,
    requiresRecheckAfterSave: false,
    readiness,
    contourRequest: null,
    bodyAnchorSource: null,
    categoryGroup: null,
    message,
  });
}

function messageForNonManual(status) {
  switch (status) {
    case 'READY': return 'Canonical Try-On is ready; no manual prerequisite editor is needed.';
    case 'SOURCE_UNAVAILABLE': return 'The canonical project source is unavailable. Reload or restore the project source before Try-On.';
    case 'STALE_SOURCE': return 'The project source changed. Recheck using the current canonical image.';
    case 'GARMENT_UNAVAILABLE': return 'The selected managed garment is unavailable.';
    case 'GARMENT_UNSUPPORTED': return 'The selected garment category is not supported by deterministic Try-On.';
    case 'EVIDENCE_INVALID': return 'Canonical evidence is invalid. Manual browser remediation is not authorized for this failure.';
    default: return 'This canonical readiness state cannot be remediated by the manual editors.';
  }
}

function sourceArtifact(value) {
  if (typeof value !== 'string') throw new TypeError('sourceArtifactId must be a string');
  const normalized = value.trim();
  if (!normalized || normalized.length > SOURCE_ARTIFACT_MAX_LENGTH || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new TypeError('sourceArtifactId is outside the accepted manual remediation contract');
  }
  return normalized;
}

function displayUrl(value) {
  if (typeof value !== 'string') throw new TypeError('beforeUrl must be a string');
  const normalized = value.trim();
  if (!normalized) throw new TypeError('beforeUrl is unavailable');
  const sameOrigin = normalized.startsWith('/') && !normalized.startsWith('//');
  const secureRemote = normalized.startsWith('https://');
  if (!sameOrigin && !secureRemote && !normalized.startsWith('blob:')) {
    throw new TypeError('beforeUrl is outside the accepted Editor display contract');
  }
  return normalized;
}

function uuid(value, label) {
  if (typeof value !== 'string' || !UUID.test(value)) throw new TypeError(`${label} must be a UUID`);
  return value.toLowerCase();
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
