import type { GarmentMeshPointQ16, GarmentMeshTriangle } from '../deterministic/GarmentMeshWarp.ts';

const MAGIC = new TextEncoder().encode('BERSGMW1');
const HEADER_BYTES = MAGIC.byteLength + 4;
const MAX_METADATA_BYTES = 512 * 1024;
const SHA = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KEYS = Object.freeze([
  'anchorSetId','basisViewHeight','basisViewWidth','destinationMeshSha256','destinationPointsQ16','garmentId','outputHeight','outputWidth',
  'projectId','projectImageSha256','projectImageStorageId','representationId','sourcePointsQ16','ticketId','triangles','viewId',
] as const);

export type GarmentMeshWarpInputEnvelopeMetadata = Readonly<{
  ticketId: string;
  projectId: string;
  projectImageStorageId: string;
  projectImageSha256: string;
  outputWidth: number;
  outputHeight: number;
  garmentId: string;
  viewId: string;
  representationId: string;
  anchorSetId: string;
  basisViewWidth: number;
  basisViewHeight: number;
  destinationMeshSha256: string;
  sourcePointsQ16: readonly GarmentMeshPointQ16[];
  destinationPointsQ16: readonly GarmentMeshPointQ16[];
  triangles: readonly GarmentMeshTriangle[];
}>;

export type GarmentMeshWarpInputEnvelope = Readonly<{
  metadata: GarmentMeshWarpInputEnvelopeMetadata;
  basisViewRgba: Uint8Array;
}>;

/** One purpose-bound snapshot: metadata is canonical JSON, followed by exact raw RGBA8 bytes. */
export function encodeGarmentMeshWarpInputEnvelope(input: GarmentMeshWarpInputEnvelope): Uint8Array {
  const metadata = normalizeMetadata(input.metadata);
  const rgba = normalizeRgba(input.basisViewRgba, metadata.basisViewWidth, metadata.basisViewHeight);
  const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata));
  if (metadataBytes.byteLength > MAX_METADATA_BYTES) throw new Error('Garment mesh-warp envelope metadata exceeds the v1 limit');
  const output = new Uint8Array(HEADER_BYTES + metadataBytes.byteLength + rgba.byteLength);
  output.set(MAGIC, 0);
  new DataView(output.buffer).setUint32(MAGIC.byteLength, metadataBytes.byteLength, false);
  output.set(metadataBytes, HEADER_BYTES);
  output.set(rgba, HEADER_BYTES + metadataBytes.byteLength);
  return output;
}

export function decodeGarmentMeshWarpInputEnvelope(bytes: Uint8Array): GarmentMeshWarpInputEnvelope {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < HEADER_BYTES) throw new Error('Garment mesh-warp envelope is truncated');
  for (let index = 0; index < MAGIC.byteLength; index += 1) if (bytes[index] !== MAGIC[index]) throw new Error('Garment mesh-warp envelope magic/version is invalid');
  const metadataLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(MAGIC.byteLength, false);
  if (metadataLength < 2 || metadataLength > MAX_METADATA_BYTES || HEADER_BYTES + metadataLength > bytes.byteLength) throw new Error('Garment mesh-warp envelope metadata length is invalid');
  let rawMetadata: unknown;
  try { rawMetadata = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(HEADER_BYTES, HEADER_BYTES + metadataLength))); }
  catch { throw new Error('Garment mesh-warp envelope metadata is invalid UTF-8 JSON'); }
  const metadata = normalizeMetadata(rawMetadata);
  const rgba = normalizeRgba(bytes.subarray(HEADER_BYTES + metadataLength), metadata.basisViewWidth, metadata.basisViewHeight);
  return Object.freeze({ metadata, basisViewRgba: Uint8Array.from(rgba) });
}

function normalizeMetadata(value: unknown): GarmentMeshWarpInputEnvelopeMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Garment mesh-warp envelope metadata must be an object');
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== KEYS.length || KEYS.some((key, index) => keys[index] !== key)) throw new Error('Garment mesh-warp envelope metadata schema is invalid');
  const ticketId = text(record.ticketId, 'ticketId');
  const projectId = uuid(record.projectId, 'projectId');
  const projectImageStorageId = uuid(record.projectImageStorageId, 'projectImageStorageId');
  const projectImageSha256 = sha(record.projectImageSha256, 'projectImageSha256');
  const outputWidth = positive(record.outputWidth, 'outputWidth'); const outputHeight = positive(record.outputHeight, 'outputHeight');
  const garmentId = uuid(record.garmentId, 'garmentId'); const viewId = uuid(record.viewId, 'viewId');
  const representationId = uuid(record.representationId, 'representationId'); const anchorSetId = uuid(record.anchorSetId, 'anchorSetId');
  const basisViewWidth = positive(record.basisViewWidth, 'basisViewWidth'); const basisViewHeight = positive(record.basisViewHeight, 'basisViewHeight');
  const destinationMeshSha256 = sha(record.destinationMeshSha256, 'destinationMeshSha256');
  const sourcePointsQ16 = points(record.sourcePointsQ16, 'sourcePointsQ16');
  const destinationPointsQ16 = points(record.destinationPointsQ16, 'destinationPointsQ16');
  if (sourcePointsQ16.length !== destinationPointsQ16.length) throw new Error('Garment mesh-warp envelope point counts differ');
  const triangles = triangleList(record.triangles, sourcePointsQ16.length);
  return deepFreeze({ ticketId, projectId, projectImageStorageId, projectImageSha256, outputWidth, outputHeight, garmentId, viewId, representationId, anchorSetId, basisViewWidth, basisViewHeight, destinationMeshSha256, sourcePointsQ16, destinationPointsQ16, triangles });
}
function points(value: unknown, name: string): readonly GarmentMeshPointQ16[] {
  if (!Array.isArray(value) || value.length < 3 || value.length > 4096) throw new Error(`${name} is invalid`);
  return Object.freeze(value.map((point, index) => {
    if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isSafeInteger)) throw new Error(`${name}[${index}] is invalid`);
    const x = Number(point[0]); const y = Number(point[1]);
    if (x < 0 || x > 65536 || y < 0 || y > 65536) throw new Error(`${name}[${index}] escapes Q16 bounds`);
    return Object.freeze([x, y] as const);
  }));
}
function triangleList(value: unknown, pointCount: number): readonly GarmentMeshTriangle[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8192) throw new Error('triangles is invalid');
  return Object.freeze(value.map((triangle, index) => {
    if (!Array.isArray(triangle) || triangle.length !== 3 || !triangle.every(Number.isSafeInteger)) throw new Error(`triangles[${index}] is invalid`);
    const [a,b,c] = triangle.map(Number);
    if (a < 0 || b < 0 || c < 0 || a >= pointCount || b >= pointCount || c >= pointCount || a === b || b === c || a === c) throw new Error(`triangles[${index}] references invalid points`);
    return Object.freeze([a,b,c] as const);
  }));
}
function normalizeRgba(value: Uint8Array, width: number, height: number): Uint8Array {
  const expected = width * height * 4;
  if (!(value instanceof Uint8Array) || !Number.isSafeInteger(expected) || value.byteLength !== expected) throw new Error('Garment mesh-warp envelope RGBA length is invalid');
  return value;
}
function text(value: unknown, name: string): string { if (typeof value !== 'string') throw new Error(`${name} is invalid`); const normalized=value.normalize('NFKC').trim(); if (!normalized || [...normalized].length>512 || /[\u0000-\u001f\u007f]/u.test(normalized)) throw new Error(`${name} is invalid`); return normalized; }
function uuid(value: unknown, name: string): string { if (typeof value !== 'string' || !UUID.test(value)) throw new Error(`${name} must be a canonical lowercase UUID`); return value; }
function sha(value: unknown, name: string): string { if (typeof value !== 'string' || !SHA.test(value)) throw new Error(`${name} must be canonical lowercase SHA-256`); return value; }
function positive(value: unknown, name: string): number { if (!Number.isSafeInteger(value) || Number(value)<1 || Number(value)>16384) throw new Error(`${name} is invalid`); return Number(value); }
function deepFreeze<T>(value:T):T { if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value as Record<string,unknown>))deepFreeze(child);}return value; }
