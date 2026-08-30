import { createHash } from 'node:crypto';
import {
  GARMENT_MESH_WARP_FIXED_POINT_ONE,
  GARMENT_MESH_WARP_MAX_POINTS,
  GARMENT_MESH_WARP_MAX_TRIANGLES,
  quantizeNormalizedGarmentMeshPoints,
  type GarmentMeshPointQ16,
  type GarmentMeshTriangle,
} from '../../../src/platform/creative/deterministic/GarmentMeshWarp.ts';
import { garmentCategoryGroup, type GarmentCategory } from './postgresGarmentWardrobeStore.ts';

export const BODY_ANCHOR_SCHEMA_ID = 'BERS_BODY_ANCHORS_V1';
export const BODY_ANCHOR_COORDINATE_SPACE = 'PROJECT_IMAGE_NORMALIZED';
export const GARMENT_DESTINATION_MESH_SCHEMA_ID = 'BERS_GARMENT_DESTINATION_MESH_Q16_V1';
export const GARMENT_DESTINATION_MESH_COORDINATE_SPACE = 'PROJECT_IMAGE_NORMALIZED_Q16';

export const BODY_ANCHOR_NAMES = Object.freeze([
  'leftShoulder', 'rightShoulder',
  'leftWaist', 'rightWaist',
  'leftHip', 'rightHip',
  'leftAnkle', 'rightAnkle',
  'leftToe', 'rightToe',
] as const);
export type BodyAnchorName = (typeof BODY_ANCHOR_NAMES)[number];
export type BodyAnchorPoint = readonly [number, number];
export type BodyAnchorPayload = Readonly<{
  schemaVersion: 1;
  coordinateSpace: typeof BODY_ANCHOR_COORDINATE_SPACE;
  anchors: Readonly<Partial<Record<BodyAnchorName, BodyAnchorPoint>>>;
}>;

export type GarmentDestinationMeshProvenance = Readonly<{
  anchorSetId: string;
  projectId: string;
  projectImageStorageId: string;
  projectImageSha256: string;
  projectImageWidth: number;
  projectImageHeight: number;
  anchorPayloadSha256: string;
  garmentId: string;
  representationId: string;
  representationContentSha256: string;
  garmentCategory: GarmentCategory;
}>;

export type GarmentDestinationMesh = Readonly<{
  schemaId: typeof GARMENT_DESTINATION_MESH_SCHEMA_ID;
  coordinateSpace: typeof GARMENT_DESTINATION_MESH_COORDINATE_SPACE;
  sourcePointsQ16: readonly GarmentMeshPointQ16[];
  destinationPointsQ16: readonly GarmentMeshPointQ16[];
  triangles: readonly GarmentMeshTriangle[];
  frameAnchors: readonly [BodyAnchorName, BodyAnchorName, BodyAnchorName, BodyAnchorName];
  provenance: GarmentDestinationMeshProvenance;
  meshSha256: string;
}>;

const BODY_ANCHOR_NAME_SET = new Set<string>(BODY_ANCHOR_NAMES);
const BODY_ANCHOR_TOP_LEVEL_KEYS = Object.freeze(['anchors', 'coordinateSpace', 'schemaVersion'] as const);

const FRAME_ANCHORS = Object.freeze({
  tops: Object.freeze(['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip'] as const),
  bottoms: Object.freeze(['leftWaist', 'rightWaist', 'leftAnkle', 'rightAnkle'] as const),
  dresses: Object.freeze(['leftShoulder', 'rightShoulder', 'leftAnkle', 'rightAnkle'] as const),
  footwear: Object.freeze(['leftAnkle', 'rightAnkle', 'leftToe', 'rightToe'] as const),
});

export class BodyAnchorGeometryError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'BodyAnchorGeometryError'; }
}

export function normalizeBodyAnchorPayload(value: unknown): BodyAnchorPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw geometryError('invalid_body_anchor_schema', 'Body anchor payload must be an object');
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== BODY_ANCHOR_TOP_LEVEL_KEYS.length || !BODY_ANCHOR_TOP_LEVEL_KEYS.every((key, index) => keys[index] === key)) {
    throw geometryError('invalid_body_anchor_schema', 'Body anchor payload must use the closed BERS_BODY_ANCHORS_V1 schema');
  }
  if (record.schemaVersion !== 1 || record.coordinateSpace !== BODY_ANCHOR_COORDINATE_SPACE) {
    throw geometryError('invalid_body_anchor_schema', 'Body anchor schema version or coordinate space is invalid');
  }
  if (!record.anchors || typeof record.anchors !== 'object' || Array.isArray(record.anchors)) {
    throw geometryError('invalid_body_anchor_schema', 'Body anchor map must be an object');
  }
  const rawAnchors = record.anchors as Record<string, unknown>;
  const names = Object.keys(rawAnchors);
  if (names.length < 4 || names.length > BODY_ANCHOR_NAMES.length || names.some(name => !BODY_ANCHOR_NAME_SET.has(name))) {
    throw geometryError('invalid_body_anchor_schema', `Body anchors must contain 4 to ${BODY_ANCHOR_NAMES.length} known anchor names`);
  }

  const anchors: Partial<Record<BodyAnchorName, BodyAnchorPoint>> = {};
  for (const name of BODY_ANCHOR_NAMES) {
    if (!Object.hasOwn(rawAnchors, name)) continue;
    const candidate = rawAnchors[name];
    if (!Array.isArray(candidate) || candidate.length !== 2 || !candidate.every(Number.isFinite)) {
      throw geometryError('invalid_body_anchor_schema', `Body anchor ${name} must be a finite normalized point`);
    }
    const x = Number(candidate[0]); const y = Number(candidate[1]);
    if (x < 0 || x > 1 || y < 0 || y > 1) throw geometryError('invalid_body_anchor_schema', `Body anchor ${name} escapes normalized coordinates`);
    anchors[name] = Object.freeze([x, y] as const);
  }
  return deepFreeze({ schemaVersion: 1 as const, coordinateSpace: BODY_ANCHOR_COORDINATE_SPACE, anchors });
}

export function canonicalBodyAnchorPayloadBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(normalizeBodyAnchorPayload(value)));
}

export function bodyAnchorPayloadSha256(value: unknown): string {
  return sha256(canonicalBodyAnchorPayloadBytes(value));
}

export function deriveDestinationGarmentMesh(input: Readonly<{
  anchorPayload: unknown;
  garmentCategory: GarmentCategory;
  sourcePoints: readonly unknown[];
  triangles: readonly unknown[];
  provenance: GarmentDestinationMeshProvenance;
}>): GarmentDestinationMesh {
  const anchorPayload = normalizeBodyAnchorPayload(input.anchorPayload);
  const frameAnchors = requiredFrameAnchors(input.garmentCategory);
  const missing = frameAnchors.filter(name => !Object.hasOwn(anchorPayload.anchors, name));
  if (missing.length) throw geometryError('body_anchor_required_anchor_missing', `Garment category ${input.garmentCategory} requires anchors: ${missing.join(', ')}`);

  const sourcePointsQ16 = quantizeNormalizedGarmentMeshPoints(input.sourcePoints);
  if (sourcePointsQ16.length > GARMENT_MESH_WARP_MAX_POINTS) throw geometryError('invalid_garment_parametric_topology', 'Garment source topology exceeds the point limit');
  const triangles = normalizeTriangles(input.triangles, sourcePointsQ16.length);
  const framePointsQ16 = quantizeNormalizedGarmentMeshPoints(frameAnchors.map(name => anchorPayload.anchors[name]!));
  const destinationPointsQ16 = Object.freeze(sourcePointsQ16.map(point => mapPointThroughFrame(point, framePointsQ16)));

  for (const [index, triangle] of triangles.entries()) {
    const sourceArea = orient(sourcePointsQ16[triangle[0]], sourcePointsQ16[triangle[1]], sourcePointsQ16[triangle[2]]);
    const destinationArea = orient(destinationPointsQ16[triangle[0]], destinationPointsQ16[triangle[1]], destinationPointsQ16[triangle[2]]);
    if (sourceArea === 0) throw geometryError('invalid_garment_parametric_topology', `Garment source triangle ${index} collapses in Q16 coordinates`);
    if (destinationArea === 0 || Math.sign(destinationArea) !== Math.sign(sourceArea)) {
      throw geometryError('body_anchor_destination_geometry_invalid', `Destination triangle ${index} is degenerate or inverted`);
    }
  }

  const provenance = deepFreeze({ ...input.provenance, garmentCategory: input.garmentCategory });
  const hashDocument: Omit<GarmentDestinationMesh, 'meshSha256'> = deepFreeze({
    schemaId: GARMENT_DESTINATION_MESH_SCHEMA_ID,
    coordinateSpace: GARMENT_DESTINATION_MESH_COORDINATE_SPACE,
    sourcePointsQ16,
    destinationPointsQ16,
    triangles,
    frameAnchors,
    provenance,
  });
  return deepFreeze({ ...hashDocument, meshSha256: sha256(new TextEncoder().encode(JSON.stringify(hashDocument))) });
}

function requiredFrameAnchors(category: GarmentCategory): readonly [BodyAnchorName, BodyAnchorName, BodyAnchorName, BodyAnchorName] {
  const group = garmentCategoryGroup(category);
  if (group === 'tops' || group === 'bottoms' || group === 'dresses' || group === 'footwear') return FRAME_ANCHORS[group];
  throw geometryError('body_anchor_category_unsupported', `Garment category ${category} has no admitted deterministic body-anchor frame`);
}

function normalizeTriangles(value: readonly unknown[], pointCount: number): readonly GarmentMeshTriangle[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > GARMENT_MESH_WARP_MAX_TRIANGLES) {
    throw geometryError('invalid_garment_parametric_topology', `Garment triangles must contain 1 to ${GARMENT_MESH_WARP_MAX_TRIANGLES} entries`);
  }
  return Object.freeze(value.map((candidate, index) => {
    if (!Array.isArray(candidate) || candidate.length !== 3 || !candidate.every(Number.isSafeInteger)) {
      throw geometryError('invalid_garment_parametric_topology', `Garment triangle ${index} is invalid`);
    }
    const [a, b, c] = candidate.map(Number);
    if (a < 0 || b < 0 || c < 0 || a >= pointCount || b >= pointCount || c >= pointCount || a === b || b === c || a === c) {
      throw geometryError('invalid_garment_parametric_topology', `Garment triangle ${index} has invalid point references`);
    }
    return Object.freeze([a, b, c] as const);
  }));
}

function mapPointThroughFrame(point: GarmentMeshPointQ16, frame: readonly GarmentMeshPointQ16[]): GarmentMeshPointQ16 {
  const [topLeft, topRight, bottomLeft, bottomRight] = frame;
  const u = point[0]; const v = point[1];
  const oneMinusU = GARMENT_MESH_WARP_FIXED_POINT_ONE - u;
  const oneMinusV = GARMENT_MESH_WARP_FIXED_POINT_ONE - v;
  const denominator = GARMENT_MESH_WARP_FIXED_POINT_ONE * GARMENT_MESH_WARP_FIXED_POINT_ONE;
  const mapCoordinate = (coordinate: 0 | 1) => roundHalfUpDiv(
    topLeft[coordinate] * oneMinusU * oneMinusV
      + topRight[coordinate] * u * oneMinusV
      + bottomLeft[coordinate] * oneMinusU * v
      + bottomRight[coordinate] * u * v,
    denominator,
  );
  const x = mapCoordinate(0); const y = mapCoordinate(1);
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x < 0 || x > GARMENT_MESH_WARP_FIXED_POINT_ONE || y < 0 || y > GARMENT_MESH_WARP_FIXED_POINT_ONE) {
    throw geometryError('body_anchor_destination_geometry_invalid', 'Destination mesh point escapes the admitted Q16 domain');
  }
  return Object.freeze([x, y] as const);
}

function orient(a: GarmentMeshPointQ16, b: GarmentMeshPointQ16, c: GarmentMeshPointQ16): number {
  const value = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (!Number.isSafeInteger(value)) throw geometryError('body_anchor_destination_geometry_invalid', 'Destination mesh edge math exceeded safe integer range');
  return value;
}

function roundHalfUpDiv(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || numerator < 0 || !Number.isSafeInteger(denominator) || denominator < 1) {
    throw geometryError('body_anchor_destination_geometry_invalid', 'Destination mesh fixed-point arithmetic is invalid');
  }
  return Math.floor((numerator + Math.floor(denominator / 2)) / denominator);
}

function sha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
function geometryError(code: string, message: string): BodyAnchorGeometryError { return new BodyAnchorGeometryError(code, message); }
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
