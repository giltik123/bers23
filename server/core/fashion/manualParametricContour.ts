import { GARMENT_MESH_WARP_FIXED_POINT_ONE } from '../../../src/platform/creative/deterministic/GarmentMeshWarp.ts';

export const MANUAL_PARAMETRIC_CONTOUR_SCHEMA_ID = 'BERS_MANUAL_PARAMETRIC_CONTOUR_Q16_V1';
export const MANUAL_PARAMETRIC_CONTOUR_PRODUCER_ID = 'bers.manual-parametric-contour';
export const MANUAL_PARAMETRIC_CONTOUR_PRODUCER_VERSION = '1';
export const MANUAL_PARAMETRIC_CONTOUR_MAX_POINTS = 256;

const INPUT_KEYS = Object.freeze(['contour', 'coordinateSpace', 'schemaVersion'] as const);
const COORDINATE_SPACE = 'PRIMARY_VIEW_NORMALIZED';
const FIXED_ONE = GARMENT_MESH_WARP_FIXED_POINT_ONE;

type PointQ16 = readonly [number, number];
type Triangle = readonly [number, number, number];

export type ManualParametricContourInput = Readonly<{
  schemaVersion: 1;
  coordinateSpace: typeof COORDINATE_SPACE;
  contour: readonly unknown[];
}>;

export type ManualParametricRepresentationV1 = Readonly<{
  schemaVersion: 1;
  coordinateSpace: typeof COORDINATE_SPACE;
  points: readonly (readonly [number, number])[];
  triangles: readonly Triangle[];
  outline: readonly number[];
}>;

/**
 * Convert an explicit user contour into the exact F4a BERS_PARAMETRIC_V1 shape.
 *
 * Authority law:
 * - the producer never invents points outside the submitted contour;
 * - input coordinates are quantized once into the same Q16 domain used by F4b;
 * - cyclic start and winding are canonicalized before triangulation;
 * - only simple, non-degenerate polygons are admitted;
 * - deterministic ear clipping always chooses the first valid ear in canonical
 *   vertex order, so equivalent cyclic/reversed contours produce identical bytes.
 *
 * The output remains representation input, not admission authority. Persistence,
 * source-view binding and Garment revision checks stay in the existing
 * PostgresGarmentRepresentationStore.
 */
export function produceManualParametricRepresentation(value: unknown): ManualParametricRepresentationV1 {
  const contour = normalizeInput(value);
  assertSimplePolygon(contour);
  const canonicalQ16 = canonicalizePolygon(contour);
  const triangles = triangulateCanonicalPolygon(canonicalQ16);
  const points = Object.freeze(canonicalQ16.map(([x, y]) => Object.freeze([
    x / FIXED_ONE,
    y / FIXED_ONE,
  ] as const)));
  const outline = Object.freeze(points.map((_point, index) => index));
  return deepFreeze({
    schemaVersion: 1 as const,
    coordinateSpace: COORDINATE_SPACE,
    points,
    triangles,
    outline,
  });
}

export function canonicalManualParametricRepresentationBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(produceManualParametricRepresentation(value)));
}

function normalizeInput(value: unknown): readonly PointQ16[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw contourError('manual_parametric_invalid_schema', 'Manual PARAMETRIC contour must be an object');
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== INPUT_KEYS.length || INPUT_KEYS.some((key, index) => key !== keys[index])) {
    throw contourError('manual_parametric_invalid_schema', 'Manual PARAMETRIC contour must use the closed v1 input schema');
  }
  if (record.schemaVersion !== 1 || record.coordinateSpace !== COORDINATE_SPACE) {
    throw contourError('manual_parametric_invalid_schema', 'Manual PARAMETRIC schema version or coordinate space is invalid');
  }
  if (!Array.isArray(record.contour) || record.contour.length < 3 || record.contour.length > MANUAL_PARAMETRIC_CONTOUR_MAX_POINTS) {
    throw contourError(
      'manual_parametric_invalid_contour',
      `Manual PARAMETRIC contour must contain 3 to ${MANUAL_PARAMETRIC_CONTOUR_MAX_POINTS} points`,
    );
  }

  const points = record.contour.map((candidate, index) => {
    if (!Array.isArray(candidate) || candidate.length !== 2 || !candidate.every(Number.isFinite)) {
      throw contourError('manual_parametric_invalid_point', `Manual PARAMETRIC contour point ${index} is invalid`);
    }
    const x = Number(candidate[0]);
    const y = Number(candidate[1]);
    if (x < 0 || x > 1 || y < 0 || y > 1) {
      throw contourError('manual_parametric_invalid_point', `Manual PARAMETRIC contour point ${index} escapes [0,1]`);
    }
    return Object.freeze([
      Math.floor(x * FIXED_ONE + 0.5),
      Math.floor(y * FIXED_ONE + 0.5),
    ] as const);
  });

  const seen = new Set<string>();
  for (const [index, point] of points.entries()) {
    const key = `${point[0]}:${point[1]}`;
    if (seen.has(key)) {
      throw contourError(
        'manual_parametric_duplicate_point',
        `Manual PARAMETRIC contour point ${index} duplicates another point after Q16 quantization`,
      );
    }
    seen.add(key);
  }

  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index + points.length - 1) % points.length];
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (orient(previous, current, next) === 0) {
      throw contourError(
        'manual_parametric_collinear_vertex',
        `Manual PARAMETRIC contour vertex ${index} is collinear after Q16 quantization`,
      );
    }
  }
  return Object.freeze(points);
}

function assertSimplePolygon(points: readonly PointQ16[]): void {
  for (let first = 0; first < points.length; first += 1) {
    const firstNext = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second += 1) {
      const secondNext = (second + 1) % points.length;
      if (first === second || firstNext === second || secondNext === first) continue;
      if (segmentsIntersect(points[first], points[firstNext], points[second], points[secondNext])) {
        throw contourError('manual_parametric_self_intersection', 'Manual PARAMETRIC contour must be a simple polygon');
      }
    }
  }
  const area2 = signedArea2(points);
  if (area2 === 0) throw contourError('manual_parametric_zero_area', 'Manual PARAMETRIC contour has zero area');
}

function canonicalizePolygon(points: readonly PointQ16[]): readonly PointQ16[] {
  let canonical = signedArea2(points) > 0 ? [...points] : [...points].reverse();
  let start = 0;
  for (let index = 1; index < canonical.length; index += 1) {
    if (comparePoint(canonical[index], canonical[start]) < 0) start = index;
  }
  canonical = [...canonical.slice(start), ...canonical.slice(0, start)];
  if (signedArea2(canonical) <= 0) throw new Error('Canonical manual PARAMETRIC contour winding invariant failed');
  return Object.freeze(canonical.map(point => Object.freeze([point[0], point[1]] as const)));
}

function triangulateCanonicalPolygon(points: readonly PointQ16[]): readonly Triangle[] {
  const vertices = points.map((_point, index) => index);
  const triangles: Triangle[] = [];
  let guard = 0;
  while (vertices.length > 3) {
    let clipped = false;
    for (let cursor = 0; cursor < vertices.length; cursor += 1) {
      const previous = vertices[(cursor + vertices.length - 1) % vertices.length];
      const current = vertices[cursor];
      const next = vertices[(cursor + 1) % vertices.length];
      if (orient(points[previous], points[current], points[next]) <= 0) continue;
      if (!diagonalIsClear(points, vertices, previous, next)) continue;
      let contains = false;
      for (const candidate of vertices) {
        if (candidate === previous || candidate === current || candidate === next) continue;
        if (pointInOrOnTriangle(points[candidate], points[previous], points[current], points[next])) {
          contains = true;
          break;
        }
      }
      if (contains) continue;
      triangles.push(Object.freeze([previous, current, next] as const));
      vertices.splice(cursor, 1);
      clipped = true;
      break;
    }
    guard += 1;
    if (!clipped || guard > points.length * points.length) {
      throw contourError('manual_parametric_triangulation_failed', 'Manual PARAMETRIC contour could not be triangulated deterministically');
    }
  }
  if (vertices.length !== 3 || orient(points[vertices[0]], points[vertices[1]], points[vertices[2]]) <= 0) {
    throw contourError('manual_parametric_triangulation_failed', 'Manual PARAMETRIC final triangle is invalid');
  }
  triangles.push(Object.freeze([vertices[0], vertices[1], vertices[2]] as const));
  if (triangles.length !== points.length - 2) throw new Error('Manual PARAMETRIC triangulation count invariant failed');
  return Object.freeze(triangles);
}

function diagonalIsClear(
  points: readonly PointQ16[],
  vertices: readonly number[],
  from: number,
  to: number,
): boolean {
  for (let cursor = 0; cursor < vertices.length; cursor += 1) {
    const edgeFrom = vertices[cursor];
    const edgeTo = vertices[(cursor + 1) % vertices.length];
    if (edgeFrom === from || edgeFrom === to || edgeTo === from || edgeTo === to) continue;
    if (segmentsIntersect(points[from], points[to], points[edgeFrom], points[edgeTo])) return false;
  }
  return true;
}

function pointInOrOnTriangle(point: PointQ16, a: PointQ16, b: PointQ16, c: PointQ16): boolean {
  return orient(a, b, point) >= 0 && orient(b, c, point) >= 0 && orient(c, a, point) >= 0;
}

function segmentsIntersect(a: PointQ16, b: PointQ16, c: PointQ16, d: PointQ16): boolean {
  const abC = orient(a, b, c);
  const abD = orient(a, b, d);
  const cdA = orient(c, d, a);
  const cdB = orient(c, d, b);
  if (abC === 0 && onSegment(a, b, c)) return true;
  if (abD === 0 && onSegment(a, b, d)) return true;
  if (cdA === 0 && onSegment(c, d, a)) return true;
  if (cdB === 0 && onSegment(c, d, b)) return true;
  return Math.sign(abC) !== Math.sign(abD) && Math.sign(cdA) !== Math.sign(cdB);
}

function onSegment(a: PointQ16, b: PointQ16, point: PointQ16): boolean {
  return point[0] >= Math.min(a[0], b[0])
    && point[0] <= Math.max(a[0], b[0])
    && point[1] >= Math.min(a[1], b[1])
    && point[1] <= Math.max(a[1], b[1]);
}

function signedArea2(points: readonly PointQ16[]): number {
  let area2 = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area2 += current[0] * next[1] - next[0] * current[1];
  }
  if (!Number.isSafeInteger(area2)) throw contourError('manual_parametric_geometry_overflow', 'Manual PARAMETRIC contour arithmetic exceeded the safe integer range');
  return area2;
}

function orient(a: PointQ16, b: PointQ16, c: PointQ16): number {
  const value = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (!Number.isSafeInteger(value)) throw contourError('manual_parametric_geometry_overflow', 'Manual PARAMETRIC contour arithmetic exceeded the safe integer range');
  return value;
}

function comparePoint(left: PointQ16, right: PointQ16): number {
  return left[0] - right[0] || left[1] - right[1];
}

function contourError(code: string, message: string): Error & { status: 400; code: string } {
  return Object.assign(new Error(message), { status: 400 as const, code });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
