const PREFIX = '/garments';
const SERVER_DELIVERY_PREFIX = '/api/core/garments/delivery/';
const SERVER_DELIVERY_PATH = /^\/api\/core\/garments\/delivery\/[^/?#]+$/;
const EXPECTED_REVISION_HEADER = 'X-Expected-Garment-Revision';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const VIEW_KINDS = new Set(['UNSPECIFIED','FRONT','BACK','LEFT','RIGHT','DETAIL']);
const CARDINAL_VIEW_KINDS = Object.freeze(['FRONT','BACK','LEFT','RIGHT']);
const REPRESENTATION_TIERS = new Set(['BASIC','PARAMETRIC','FULL_3D']);
const STATUS = new Set(['ACTIVE','ARCHIVED']);
const TECHNICAL_STATUS = new Set(['NOT_ASSESSED','ADEQUATE','NEEDS_HIGHER_RESOLUTION']);
const CAPTURE_REASONS = new Set(['MISSING_CARDINAL_VIEW','LOW_RESOLUTION_CARDINAL_VIEW']);
const MIN_TECHNICAL_CAPTURE_SHORT_EDGE_PX = 512;
const IMAGE_MEDIA_TYPES = new Set(['image/png','image/jpeg','image/webp']);

/**
 * Browser adapter for the canonical Managed Garment image/view aggregate.
 * Image bytes go directly to the narrow Garment authority; this client never
 * stages a generic Asset, invents storage/hash evidence, or owns delivery tokens.
 */
export function createManagedGarmentClient(request) {
  if (typeof request !== 'function') throw new TypeError('Managed Garment client requires the canonical Core request transport');
  return Object.freeze({
    list: async () => normalizeList(await request(PREFIX)),
    get: async (garmentId) => normalizeGarment(await request(garmentPath(garmentId))),
    create: async ({ name, viewKind = 'UNSPECIFIED', image }) => {
      const normalizedImage = canonicalImage(image);
      const params = new URLSearchParams({
        name: canonicalName(name),
        view: canonicalViewKind(viewKind),
      });
      return normalizeGarment(await request(`${PREFIX}?${params}`, Object.freeze({
        method: 'POST',
        headers: Object.freeze({ 'Content-Type': normalizedImage.contentType }),
        body: normalizedImage.body,
      })));
    },
    appendView: async ({ garmentId, expectedRevision, viewKind, image }) => {
      const normalizedKind = canonicalViewKind(viewKind);
      if (normalizedKind === 'UNSPECIFIED') throw new TypeError('Additional garment views must identify a concrete view kind');
      const normalizedImage = canonicalImage(image);
      const params = new URLSearchParams({ view: normalizedKind });
      return normalizeGarment(await request(`${garmentPath(garmentId)}/views?${params}`, Object.freeze({
        method: 'POST',
        headers: Object.freeze({
          'Content-Type': normalizedImage.contentType,
          [EXPECTED_REVISION_HEADER]: String(positiveSafeInteger(expectedRevision, 'expectedRevision')),
        }),
        body: normalizedImage.body,
      })));
    },
  });
}

export function normalizeManagedGarmentDto(value) {
  return normalizeGarment(value);
}

function garmentPath(garmentId) {
  return `${PREFIX}/${encodeURIComponent(canonicalUuidIntent(garmentId, 'garmentId'))}`;
}

function normalizeList(value) {
  if (!Array.isArray(value)) throw new TypeError('Managed Garment list response must be an array');
  return Object.freeze(value.map(normalizeGarment));
}

function normalizeGarment(value) {
  assertPlainObject(value, 'Managed Garment response');
  assertExactKeys(value, [
    'id','name','representation_tier','status','revision','primary_view_id',
    'capture_assessment','views','created_at','updated_at',
  ], 'Managed Garment response');
  if (!Array.isArray(value.views) || value.views.length < 1) throw new TypeError('Managed Garment must contain at least one immutable view');
  const views = value.views.map((view, index) => normalizeView(view, index));
  if (views.some((view, index) => view.ordinal !== index)) throw new TypeError('Managed Garment views must have contiguous canonical ordinals');
  if (new Set(views.map(view => view.id)).size !== views.length) throw new TypeError('Managed Garment view IDs must be unique');
  const primaryViewId = canonicalUuidResponse(value.primary_view_id, 'primary_view_id');
  if (!views.some(view => view.id === primaryViewId)) throw new TypeError('Managed Garment primary_view_id must reference one returned immutable view');
  const captureAssessment = normalizeCaptureAssessment(value.capture_assessment);
  assertCaptureAssessmentMatchesViews(captureAssessment, views);
  return Object.freeze({
    id: canonicalUuidResponse(value.id, 'id'),
    name: canonicalResponseName(value.name),
    representationTier: exactEnum(value.representation_tier, REPRESENTATION_TIERS, 'representation_tier'),
    status: exactEnum(value.status, STATUS, 'status'),
    revision: positiveSafeInteger(value.revision, 'revision'),
    primaryViewId,
    captureAssessment,
    views: Object.freeze(views),
    createdAt: canonicalTimestamp(value.created_at, 'created_at'),
    updatedAt: canonicalTimestamp(value.updated_at, 'updated_at'),
  });
}

function normalizeView(value, index) {
  const label = `Managed Garment view ${index}`;
  assertPlainObject(value, label);
  assertExactKeys(value, [
    'id','ordinal','kind','width','height','encoding','content_type','content_sha256',
    'storage_provenance','delivery_url','delivery_expires_at','created_at',
  ], label);
  return Object.freeze({
    id: canonicalUuidResponse(value.id, `${label}.id`),
    ordinal: nonNegativeSafeInteger(value.ordinal, `${label}.ordinal`),
    kind: exactEnum(value.kind, VIEW_KINDS, `${label}.kind`),
    width: positiveSafeInteger(value.width, `${label}.width`),
    height: positiveSafeInteger(value.height, `${label}.height`),
    encoding: exactLiteral(value.encoding, 'PNG_RGBA8_LOSSLESS', `${label}.encoding`),
    contentType: exactLiteral(value.content_type, 'image/png', `${label}.content_type`),
    contentSha256: canonicalSha256(value.content_sha256, `${label}.content_sha256`),
    storageProvenance: exactLiteral(value.storage_provenance, 'POSTGRES_BYTEA_V1', `${label}.storage_provenance`),
    deliveryUrl: canonicalDeliveryUrl(value.delivery_url, `${label}.delivery_url`),
    deliveryExpiresAt: canonicalTimestamp(value.delivery_expires_at, `${label}.delivery_expires_at`),
    createdAt: canonicalTimestamp(value.created_at, `${label}.created_at`),
  });
}

function normalizeCaptureAssessment(value) {
  assertPlainObject(value, 'capture_assessment');
  assertExactKeys(value, [
    'cardinal_complete','cardinal_coverage_score','present_cardinal_view_kinds','missing_cardinal_view_kinds',
    'detail_view_count','unspecified_view_count','technical_resolution','semantic_quality','next_capture_requests',
  ], 'capture_assessment');
  const present = canonicalCardinalArray(value.present_cardinal_view_kinds, 'present_cardinal_view_kinds');
  const missing = canonicalCardinalArray(value.missing_cardinal_view_kinds, 'missing_cardinal_view_kinds');
  const technicalResolution = normalizeTechnicalResolution(value.technical_resolution);
  if (!Array.isArray(value.next_capture_requests)) throw new TypeError('next_capture_requests must be an array');
  const nextCaptureRequests = value.next_capture_requests.map((request, index) => {
    assertPlainObject(request, `next_capture_requests[${index}]`);
    assertExactKeys(request, ['view_kind','reason'], `next_capture_requests[${index}]`);
    return Object.freeze({
      viewKind: exactEnum(request.view_kind, new Set(CARDINAL_VIEW_KINDS), `next_capture_requests[${index}].view_kind`),
      reason: exactEnum(request.reason, CAPTURE_REASONS, `next_capture_requests[${index}].reason`),
    });
  });
  const coverage = finiteNumber(value.cardinal_coverage_score, 'cardinal_coverage_score');
  if (coverage < 0 || coverage > 1) throw new TypeError('cardinal_coverage_score must be between 0 and 1');
  return Object.freeze({
    cardinalComplete: booleanValue(value.cardinal_complete, 'cardinal_complete'),
    cardinalCoverageScore: coverage,
    presentCardinalViewKinds: present,
    missingCardinalViewKinds: missing,
    detailViewCount: nonNegativeSafeInteger(value.detail_view_count, 'detail_view_count'),
    unspecifiedViewCount: nonNegativeSafeInteger(value.unspecified_view_count, 'unspecified_view_count'),
    technicalResolution,
    semanticQuality: exactLiteral(value.semantic_quality, 'NOT_ASSESSED', 'semantic_quality'),
    nextCaptureRequests: Object.freeze(nextCaptureRequests),
  });
}

function normalizeTechnicalResolution(value) {
  assertPlainObject(value, 'technical_resolution');
  assertExactKeys(value, [
    'status','minimum_best_cardinal_short_edge_px','threshold_short_edge_px',
    'low_resolution_cardinal_view_kinds','low_resolution_view_ids',
  ], 'technical_resolution');
  const minimum = value.minimum_best_cardinal_short_edge_px === null
    ? null
    : positiveSafeInteger(value.minimum_best_cardinal_short_edge_px, 'minimum_best_cardinal_short_edge_px');
  if (!Array.isArray(value.low_resolution_view_ids)) throw new TypeError('low_resolution_view_ids must be an array');
  return Object.freeze({
    status: exactEnum(value.status, TECHNICAL_STATUS, 'technical_resolution.status'),
    minimumBestCardinalShortEdgePx: minimum,
    thresholdShortEdgePx: positiveSafeInteger(value.threshold_short_edge_px, 'threshold_short_edge_px'),
    lowResolutionCardinalViewKinds: canonicalCardinalArray(value.low_resolution_cardinal_view_kinds, 'low_resolution_cardinal_view_kinds'),
    lowResolutionViewIds: Object.freeze(value.low_resolution_view_ids.map((id, index) => canonicalUuidResponse(id, `low_resolution_view_ids[${index}]`))),
  });
}

function assertCaptureAssessmentMatchesViews(actual, views) {
  const bestByKind = new Map();
  for (const view of views) {
    if (!CARDINAL_VIEW_KINDS.includes(view.kind)) continue;
    const shortEdgePx = Math.min(view.width, view.height);
    const current = bestByKind.get(view.kind);
    if (!current || shortEdgePx > current.shortEdgePx) bestByKind.set(view.kind, { id: view.id, shortEdgePx });
  }
  const present = CARDINAL_VIEW_KINDS.filter(kind => bestByKind.has(kind));
  const missing = CARDINAL_VIEW_KINDS.filter(kind => !bestByKind.has(kind));
  const lowKinds = present.filter(kind => bestByKind.get(kind).shortEdgePx < MIN_TECHNICAL_CAPTURE_SHORT_EDGE_PX);
  const lowIds = lowKinds.map(kind => bestByKind.get(kind).id);
  const bestEdges = present.map(kind => bestByKind.get(kind).shortEdgePx);
  const minimumBest = bestEdges.length ? Math.min(...bestEdges) : null;
  const expectedStatus = present.length === 0 ? 'NOT_ASSESSED' : lowKinds.length === 0 ? 'ADEQUATE' : 'NEEDS_HIGHER_RESOLUTION';
  const expectedRequests = [
    ...missing.map(viewKind => ({ viewKind, reason: 'MISSING_CARDINAL_VIEW' })),
    ...lowKinds.map(viewKind => ({ viewKind, reason: 'LOW_RESOLUTION_CARDINAL_VIEW' })),
  ];

  if (actual.cardinalComplete !== (missing.length === 0)
    || actual.cardinalCoverageScore !== present.length / CARDINAL_VIEW_KINDS.length
    || !arrayEqual(actual.presentCardinalViewKinds, present)
    || !arrayEqual(actual.missingCardinalViewKinds, missing)
    || actual.detailViewCount !== views.filter(view => view.kind === 'DETAIL').length
    || actual.unspecifiedViewCount !== views.filter(view => view.kind === 'UNSPECIFIED').length
    || actual.technicalResolution.status !== expectedStatus
    || actual.technicalResolution.minimumBestCardinalShortEdgePx !== minimumBest
    || actual.technicalResolution.thresholdShortEdgePx !== MIN_TECHNICAL_CAPTURE_SHORT_EDGE_PX
    || !arrayEqual(actual.technicalResolution.lowResolutionCardinalViewKinds, lowKinds)
    || !arrayEqual(actual.technicalResolution.lowResolutionViewIds, lowIds)
    || !requestArrayEqual(actual.nextCaptureRequests, expectedRequests)) {
    throw new TypeError('Managed Garment capture_assessment does not match immutable view evidence');
  }
}

function canonicalImage(image) {
  if (typeof Blob === 'undefined' || !(image instanceof Blob)) throw new TypeError('image must be a Blob/File');
  if (image.size < 1) throw new TypeError('image must not be empty');
  const contentType = String(image.type || '').toLowerCase();
  if (!IMAGE_MEDIA_TYPES.has(contentType)) throw new TypeError('image must be PNG, JPEG or WebP');
  return Object.freeze({ body: image, contentType });
}

function canonicalName(value) {
  if (typeof value !== 'string') throw new TypeError('name must be a string');
  const normalized = value.trim();
  if (!normalized || normalized.length > 200) throw new TypeError('name must contain 1 to 200 characters');
  return normalized;
}

function canonicalResponseName(value) {
  if (typeof value !== 'string' || canonicalName(value) !== value) throw new TypeError('Managed Garment response name is not canonical');
  return value;
}

function canonicalViewKind(value) {
  if (typeof value !== 'string') throw new TypeError('viewKind must be a string');
  const normalized = value.trim().toUpperCase();
  if (!VIEW_KINDS.has(normalized)) throw new TypeError('viewKind is outside the accepted Managed Garment view set');
  return normalized;
}

function canonicalCardinalArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  const kinds = value.map((kind, index) => exactEnum(kind, new Set(CARDINAL_VIEW_KINDS), `${label}[${index}]`));
  if (new Set(kinds).size !== kinds.length) throw new TypeError(`${label} must not contain duplicates`);
  const canonical = CARDINAL_VIEW_KINDS.filter(kind => kinds.includes(kind));
  if (!arrayEqual(kinds, canonical)) throw new TypeError(`${label} must use canonical cardinal order`);
  return Object.freeze(kinds);
}

function canonicalDeliveryUrl(value, label) {
  if (typeof value !== 'string' || !value.startsWith(SERVER_DELIVERY_PREFIX) || !SERVER_DELIVERY_PATH.test(value)) {
    throw new TypeError(`${label} must be one narrow server-issued Managed Garment delivery path`);
  }
  return value;
}

function canonicalUuidIntent(value, label) {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a UUID string`);
  const normalized = value.trim().toLowerCase();
  if (!UUID.test(normalized)) throw new TypeError(`${label} must be a UUID`);
  return normalized;
}

function canonicalUuidResponse(value, label) {
  if (typeof value !== 'string' || !UUID.test(value) || value !== value.toLowerCase()) throw new TypeError(`${label} must be a canonical lowercase UUID`);
  return value;
}

function canonicalSha256(value, label) {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new TypeError(`${label} must be a lowercase SHA-256`);
  return value;
}

function canonicalTimestamp(value, label) {
  if (typeof value !== 'string') throw new TypeError(`${label} must be an ISO timestamp`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) throw new TypeError(`${label} must be a canonical ISO timestamp`);
  return value;
}

function positiveSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${label} must be a positive safe integer`);
  return value;
}

function nonNegativeSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative safe integer`);
  return value;
}

function finiteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${label} must be a finite number`);
  return value;
}

function booleanValue(value, label) {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be boolean`);
  return value;
}

function exactLiteral(value, expected, label) {
  if (value !== expected) throw new TypeError(`${label} must equal ${expected}`);
  return value;
}

function exactEnum(value, allowed, label) {
  if (typeof value !== 'string' || !allowed.has(value)) throw new TypeError(`${label} is outside the accepted enum`);
  return value;
}

function arrayEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function requestArrayEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value.viewKind === right[index].viewKind && value.reason === right[index].reason);
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError(`${label} must be a plain object`);
}

function assertExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || wanted.some((key, index) => actual[index] !== key)) throw new TypeError(`${label} has unexpected fields`);
}
