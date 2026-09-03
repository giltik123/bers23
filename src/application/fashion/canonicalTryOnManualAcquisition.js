export const MANUAL_PARAMETRIC_SCHEMA_VERSION = 1;
export const MANUAL_PARAMETRIC_COORDINATE_SPACE = 'PRIMARY_VIEW_NORMALIZED';
export const MANUAL_PARAMETRIC_MAX_POINTS = 256;
export const BODY_ANCHOR_SCHEMA_VERSION = 1;
export const BODY_ANCHOR_COORDINATE_SPACE = 'PROJECT_IMAGE_NORMALIZED';
export const BODY_ANCHOR_NAMES = Object.freeze([
  'leftShoulder', 'rightShoulder',
  'leftWaist', 'rightWaist',
  'leftHip', 'rightHip',
  'leftAnkle', 'rightAnkle',
  'leftToe', 'rightToe',
]);

const BODY_ANCHOR_NAME_SET = new Set(BODY_ANCHOR_NAMES);
const SOURCE_ARTIFACT_MAX_LENGTH = 4096;
const CATEGORY_GROUP = Object.freeze({
  tshirts: 'tops', shirts: 'tops', jackets: 'tops', hoodies: 'tops', sweaters: 'tops',
  pants: 'bottoms', shorts: 'bottoms', jeans: 'bottoms', skirts: 'bottoms',
  dresses: 'dresses',
  shoes: 'footwear', boots: 'footwear', sneakers: 'footwear', sandals: 'footwear',
  hats: 'unsupported', glasses: 'unsupported', scarves: 'unsupported', bags: 'unsupported', belts: 'unsupported',
  jewelry: 'unsupported', gloves: 'unsupported', socks: 'unsupported', other: 'unsupported',
});
const REQUIRED_ANCHORS = Object.freeze({
  tops: Object.freeze(['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip']),
  bottoms: Object.freeze(['leftWaist', 'rightWaist', 'leftAnkle', 'rightAnkle']),
  dresses: Object.freeze(['leftShoulder', 'rightShoulder', 'leftAnkle', 'rightAnkle']),
  footwear: Object.freeze(['leftAnkle', 'rightAnkle', 'leftToe', 'rightToe']),
  unsupported: Object.freeze([]),
});

/**
 * Browser-side intent shaping only. Full polygon geometry, Q16 canonicalization,
 * representation admission, exact source binding and destination-mesh validation
 * remain in Core.
 */
export function buildManualParametricAdmissionIntent({ expectedRevision, points }) {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    throw new TypeError('expectedRevision must be a positive safe integer');
  }
  const contour = normalizedPointList(points, 3, MANUAL_PARAMETRIC_MAX_POINTS, 'Manual contour');
  return deepFreeze({
    expectedRevision,
    contour: {
      schemaVersion: MANUAL_PARAMETRIC_SCHEMA_VERSION,
      coordinateSpace: MANUAL_PARAMETRIC_COORDINATE_SPACE,
      contour,
    },
  });
}

/**
 * Body-anchor intent contains only current source identity and explicit user
 * points. No storage, SHA, anchor-set or destination-geometry identity exists.
 */
export function buildManualBodyAnchorAcquisitionIntent({ sourceArtifactId, anchors }) {
  const source = canonicalSourceArtifactId(sourceArtifactId);
  if (!anchors || typeof anchors !== 'object' || Array.isArray(anchors) || Object.getPrototypeOf(anchors) !== Object.prototype) {
    throw new TypeError('Body anchors must be a plain object');
  }
  const names = Object.keys(anchors);
  if (names.length < 4 || names.length > BODY_ANCHOR_NAMES.length || names.some((name) => !BODY_ANCHOR_NAME_SET.has(name))) {
    throw new TypeError(`Body anchors must contain 4 to ${BODY_ANCHOR_NAMES.length} known names`);
  }
  const normalized = {};
  for (const name of BODY_ANCHOR_NAMES) {
    if (!Object.hasOwn(anchors, name)) continue;
    normalized[name] = normalizedPoint(anchors[name], `Body anchor ${name}`);
  }
  return deepFreeze({
    sourceArtifactId: source,
    payload: {
      schemaVersion: BODY_ANCHOR_SCHEMA_VERSION,
      coordinateSpace: BODY_ANCHOR_COORDINATE_SPACE,
      anchors: normalized,
    },
  });
}

export function requiredBodyAnchorsForCategory(category) {
  const group = CATEGORY_GROUP[canonicalCategory(category)];
  return REQUIRED_ANCHORS[group];
}

export function missingRequiredBodyAnchors(category, anchors) {
  const required = requiredBodyAnchorsForCategory(category);
  if (required.length === 0) return required;
  const source = anchors && typeof anchors === 'object' && !Array.isArray(anchors) ? anchors : {};
  return Object.freeze(required.filter((name) => !Object.hasOwn(source, name)));
}

export function deterministicTryOnSupportedCategory(category) {
  return CATEGORY_GROUP[canonicalCategory(category)] !== 'unsupported';
}

/** Exact known Core geometry codes are surfaced as actionable copy. */
export function manualAcquisitionErrorMessage(error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  const messages = {
    manual_parametric_invalid_schema: 'Contour data is incomplete. Draw the garment outline again.',
    manual_parametric_invalid_contour: 'The garment outline needs at least three valid points.',
    manual_parametric_invalid_point: 'Every garment-outline point must stay inside the image.',
    manual_parametric_duplicate_point: 'Two outline points collapse to the same position. Move or remove one point.',
    manual_parametric_collinear_vertex: 'One outline point lies exactly on its neighboring edge. Move or remove it.',
    manual_parametric_self_intersection: 'The garment outline crosses itself. Adjust the crossing edges.',
    manual_parametric_zero_area: 'The garment outline has no usable area. Draw a closed area around the garment.',
    manual_parametric_triangulation_failed: 'The garment outline cannot form a stable mesh. Simplify the outline.',
    manual_parametric_geometry_overflow: 'The garment outline is too complex to validate safely.',
    invalid_body_anchor_schema: 'Body anchors are incomplete or outside the image.',
    body_anchor_required_anchor_missing: 'Add the highlighted body anchors required for this garment.',
    body_anchor_destination_geometry_invalid: 'The selected body anchors would invert or collapse the garment. Reposition them.',
    body_anchor_category_unsupported: 'This garment category is not supported by deterministic Try-On.',
  };
  if (code && messages[code]) return messages[code];
  if (typeof error?.message === 'string' && error.message.trim()) return error.message.trim();
  return code ? `Try-On acquisition failed (${code}).` : 'Try-On acquisition failed.';
}

function normalizedPointList(value, min, max, label) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new TypeError(`${label} must contain ${min} to ${max} points`);
  }
  const result = value.map((point, index) => normalizedPoint(point, `${label} point ${index + 1}`));
  const seen = new Set();
  for (const point of result) {
    const key = `${point[0]}:${point[1]}`;
    if (seen.has(key)) throw new TypeError(`${label} must not contain duplicate points`);
    seen.add(key);
  }
  return Object.freeze(result);
}

function normalizedPoint(value, label) {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite)) {
    throw new TypeError(`${label} must be a finite [x,y] point`);
  }
  const x = Number(value[0]);
  const y = Number(value[1]);
  if (x < 0 || x > 1 || y < 0 || y > 1) throw new TypeError(`${label} must stay inside normalized image coordinates`);
  return Object.freeze([x, y]);
}

function canonicalSourceArtifactId(value) {
  if (typeof value !== 'string') throw new TypeError('sourceArtifactId must be a string');
  const normalized = value.trim();
  if (!normalized || normalized.length > SOURCE_ARTIFACT_MAX_LENGTH || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new TypeError('sourceArtifactId is outside the accepted identifier contract');
  }
  return normalized;
}

function canonicalCategory(value) {
  if (typeof value !== 'string') throw new TypeError('garment category must be a string');
  const normalized = value.normalize('NFKC').trim().toLowerCase();
  if (!Object.hasOwn(CATEGORY_GROUP, normalized)) throw new TypeError('garment category is outside the canonical Wardrobe taxonomy');
  return normalized;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
