import {
  buildManualBodyAnchorAcquisitionIntent,
  buildManualParametricAdmissionIntent,
} from './canonicalTryOnManualAcquisition.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GARMENT_DELIVERY = /^\/api\/core\/garments\/delivery\/[^/?#]+$/;
const WARDROBE_CATEGORIES = new Set([
  'tshirts','shirts','jackets','hoodies','sweaters',
  'pants','shorts','jeans','skirts','dresses',
  'shoes','boots','sneakers','sandals',
  'hats','glasses','scarves','bags','belts','jewelry','gloves','socks','other',
]);

export class CanonicalTryOnManualContourReloadError extends Error {
  constructor(garmentId, expectedRevision, cause) {
    super('Garment contour was accepted, but the refreshed canonical Garment snapshot is unavailable. Reload before editing or submitting the contour again.');
    this.name = 'CanonicalTryOnManualContourReloadError';
    this.code = 'TRYON_MANUAL_CONTOUR_SAVED_RELOAD_PENDING';
    this.garmentId = garmentId;
    this.expectedRevision = expectedRevision;
    this.retryable = false;
    this.requiresReload = true;
    this.cause = cause;
  }
}

/**
 * Minimal manual-prerequisite application boundary for canonical Try-On UI.
 *
 * Managed Garment contains immutable view/storage/hash metadata needed by Core,
 * but the point editors need only the current primary-view delivery capability,
 * concurrency revision and Wardrobe category. This boundary reconciles the two
 * canonical aggregates and deliberately drops view IDs, SHA/storage provenance,
 * representation/anchor identity and admission responses before data reaches UI.
 */
export function createCanonicalTryOnManualPrerequisiteApplication({ garments, wardrobe, fashion }) {
  requireMethod(garments, 'get', 'Managed Garment client');
  requireMethod(wardrobe, 'get', 'Managed Wardrobe client');
  requireMethod(fashion, 'admitManualParametricRepresentation', 'Fashion Core client');
  requireMethod(fashion, 'acquireManualBodyAnchors', 'Fashion Core client');

  const loadGarmentSource = async (garmentId) => {
    const id = uuid(garmentId, 'garmentId');
    const [image, metadata] = await Promise.all([garments.get(id), wardrobe.get(id)]);
    return safeGarmentSource(image, metadata, id);
  };

  return Object.freeze({
    loadGarmentSource,

    async saveContour(value) {
      requirePlainObject(value, 'Manual contour save');
      requireExactKeys(value, ['expectedRevision', 'garmentId', 'points'], 'Manual contour save');
      const garmentId = uuid(value.garmentId, 'garmentId');
      const intent = buildManualParametricAdmissionIntent({
        expectedRevision: value.expectedRevision,
        points: value.points,
      });
      await fashion.admitManualParametricRepresentation(garmentId, intent);
      // Never return representation/admission evidence. Reload a fresh, minimized
      // canonical projection so the caller cannot assume the submitted revision won.
      try {
        return await loadGarmentSource(garmentId);
      } catch (cause) {
        // Admission has already succeeded. Make the uncertain UI boundary explicit
        // so callers reload/readiness-check rather than resubmitting the contour.
        throw new CanonicalTryOnManualContourReloadError(garmentId, intent.expectedRevision, cause);
      }
    },

    async saveBodyAnchors(value) {
      requirePlainObject(value, 'Manual body-anchor save');
      requireExactKeys(value, ['anchors', 'projectId', 'sourceArtifactId'], 'Manual body-anchor save');
      const projectId = uuid(value.projectId, 'projectId');
      const intent = buildManualBodyAnchorAcquisitionIntent({
        sourceArtifactId: value.sourceArtifactId,
        anchors: value.anchors,
      });
      await fashion.acquireManualBodyAnchors(projectId, intent);
      // Anchor-set/storage/SHA/destination-mesh response is intentionally discarded.
      // The product must rerun canonical readiness after this acknowledgement.
      return Object.freeze({ status: 'SAVED' });
    },
  });
}

function safeGarmentSource(image, metadata, expectedId) {
  requirePlainObject(image, 'Managed Garment snapshot');
  requirePlainObject(metadata, 'Managed Wardrobe snapshot');
  if (image.id !== expectedId || metadata.garmentId !== expectedId) {
    throw new Error('Manual Try-On garment snapshots do not match selected garment');
  }
  if (image.revision !== metadata.revision || image.name !== metadata.name || image.status !== metadata.status) {
    throw new Error('Manual Try-On garment snapshots do not describe one coherent revision');
  }
  if (image.status !== 'ACTIVE') throw new Error('Manual Try-On requires an active managed Garment');
  if (!Number.isSafeInteger(image.revision) || image.revision < 1) {
    throw new TypeError('Managed Garment revision is invalid');
  }
  if (typeof metadata.category !== 'string' || !WARDROBE_CATEGORIES.has(metadata.category)) {
    throw new TypeError('Managed Wardrobe category is outside the canonical taxonomy');
  }
  if (!Array.isArray(image.views)) throw new TypeError('Managed Garment views are unavailable');
  const primary = image.views.filter((view) => view?.id === image.primaryViewId);
  if (primary.length !== 1) throw new Error('Managed Garment primary view is ambiguous or unavailable');
  const view = primary[0];
  if (typeof view.deliveryUrl !== 'string' || !GARMENT_DELIVERY.test(view.deliveryUrl)) {
    throw new Error('Managed Garment primary-view delivery is outside the accepted capability contract');
  }
  if (!canonicalTimestamp(view.deliveryExpiresAt)) {
    throw new Error('Managed Garment primary-view expiry is invalid');
  }
  return Object.freeze({
    garmentId: expectedId,
    expectedRevision: image.revision,
    category: metadata.category,
    imageUrl: view.deliveryUrl,
    imageExpiresAt: view.deliveryExpiresAt,
  });
}

function canonicalTimestamp(value) {
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}
function uuid(value, label) {
  if (typeof value !== 'string' || !UUID.test(value)) throw new TypeError(`${label} must be a UUID`);
  return value.toLowerCase();
}
function requireMethod(value, method, label) {
  if (!value || typeof value !== 'object' || typeof value[method] !== 'function') {
    throw new TypeError(`Manual Try-On prerequisite application requires ${label}.${method}`);
  }
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
