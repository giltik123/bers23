import type { GarmentMeshPointQ16, GarmentMeshTriangle } from '../deterministic/GarmentMeshWarp.ts';
import {
  normalizeGarmentTextureCompositeProducerParameters,
  type GarmentTextureCompositeProducerParametersV1,
} from '../deterministic/GarmentTextureCompositeParameters.js';

const MAGIC = new TextEncoder().encode('BERSGTC1');
const HEADER_BYTES = MAGIC.byteLength + 4;
const MAX_METADATA_BYTES = 768 * 1024;
const MAX_DIMENSION = 4096;
const MAX_PIXELS = 8_388_608;
const SHA = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const KEYS = Object.freeze([
  'anchorPayloadSha256','anchorSetId','destinationMeshSha256','destinationPointsQ16','garmentId','garmentSourceHeight','garmentSourceWidth',
  'garmentWarpLayerId','garmentWarpLayerSha256','outputHeight','outputWidth','producerParameters','producerParametersSha256','projectId',
  'projectImageSha256','projectImageStorageId','representationId','representationSha256','sourceArtifactId','sourcePointsQ16','ticketId','triangles','viewId','viewSha256',
] as const);

export type GarmentTextureCompositeInputEnvelopeMetadata = Readonly<{
  ticketId: string;
  projectId: string;
  sourceArtifactId: string;
  projectImageStorageId: string;
  projectImageSha256: string;
  garmentWarpLayerId: string;
  garmentWarpLayerSha256: string;
  garmentId: string;
  viewId: string;
  viewSha256: string;
  representationId: string;
  representationSha256: string;
  anchorSetId: string;
  anchorPayloadSha256: string;
  destinationMeshSha256: string;
  outputWidth: number;
  outputHeight: number;
  garmentSourceWidth: number;
  garmentSourceHeight: number;
  sourcePointsQ16: readonly GarmentMeshPointQ16[];
  destinationPointsQ16: readonly GarmentMeshPointQ16[];
  triangles: readonly GarmentMeshTriangle[];
  producerParameters: GarmentTextureCompositeProducerParametersV1;
  producerParametersSha256: string;
}>;

export type GarmentTextureCompositeInputEnvelope = Readonly<{
  metadata: GarmentTextureCompositeInputEnvelopeMetadata;
  projectRgba: Uint8Array;
  garmentSourceRgba: Uint8Array;
}>;

/**
 * Purpose-bound F4b.5b browser snapshot.
 *
 * Canonical JSON metadata is followed by exact raw Project RGBA8 and exact raw
 * Managed Garment source-view RGBA8. Payload lengths are derived only from the
 * closed dimensions in metadata, so there is no second length namespace for a
 * hostile envelope to disagree with.
 *
 * The producer-parameter SHA is an opaque Core lineage identity here. Browser
 * code validates the closed canonical document synchronously and later requires
 * this hash to equal the Core ticket hash; only Core computes durable SHA-256.
 */
export function encodeGarmentTextureCompositeInputEnvelope(input: GarmentTextureCompositeInputEnvelope): Uint8Array {
  const metadata = normalizeMetadata(input.metadata);
  const project = normalizeRgba(input.projectRgba, metadata.outputWidth, metadata.outputHeight, 'Project');
  const garment = normalizeRgba(input.garmentSourceRgba, metadata.garmentSourceWidth, metadata.garmentSourceHeight, 'Garment source');
  const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata));
  if (metadataBytes.byteLength > MAX_METADATA_BYTES) throw new Error('Garment texture-composite envelope metadata exceeds the v1 limit');
  const total = HEADER_BYTES + metadataBytes.byteLength + project.byteLength + garment.byteLength;
  if (!Number.isSafeInteger(total)) throw new Error('Garment texture-composite envelope size is invalid');
  const output = new Uint8Array(total);
  output.set(MAGIC, 0);
  new DataView(output.buffer).setUint32(MAGIC.byteLength, metadataBytes.byteLength, false);
  let offset = HEADER_BYTES;
  output.set(metadataBytes, offset); offset += metadataBytes.byteLength;
  output.set(project, offset); offset += project.byteLength;
  output.set(garment, offset);
  return output;
}

export function decodeGarmentTextureCompositeInputEnvelope(bytes: Uint8Array): GarmentTextureCompositeInputEnvelope {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < HEADER_BYTES) throw new Error('Garment texture-composite envelope is truncated');
  for (let index = 0; index < MAGIC.byteLength; index += 1) {
    if (bytes[index] !== MAGIC[index]) throw new Error('Garment texture-composite envelope magic/version is invalid');
  }
  const metadataLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(MAGIC.byteLength, false);
  if (metadataLength < 2 || metadataLength > MAX_METADATA_BYTES || HEADER_BYTES + metadataLength > bytes.byteLength) {
    throw new Error('Garment texture-composite envelope metadata length is invalid');
  }
  let rawMetadata: unknown;
  try {
    rawMetadata = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(HEADER_BYTES, HEADER_BYTES + metadataLength)));
  } catch {
    throw new Error('Garment texture-composite envelope metadata is invalid UTF-8 JSON');
  }
  const metadata = normalizeMetadata(rawMetadata);
  const projectLength = rgbaLength(metadata.outputWidth, metadata.outputHeight, 'Project');
  const garmentLength = rgbaLength(metadata.garmentSourceWidth, metadata.garmentSourceHeight, 'Garment source');
  const payloadOffset = HEADER_BYTES + metadataLength;
  const expectedTotal = payloadOffset + projectLength + garmentLength;
  if (bytes.byteLength !== expectedTotal) throw new Error('Garment texture-composite envelope payload length is invalid');
  const projectRgba = bytes.subarray(payloadOffset, payloadOffset + projectLength);
  const garmentSourceRgba = bytes.subarray(payloadOffset + projectLength);
  return Object.freeze({
    metadata,
    projectRgba: Uint8Array.from(projectRgba),
    garmentSourceRgba: Uint8Array.from(garmentSourceRgba),
  });
}

function normalizeMetadata(value: unknown): GarmentTextureCompositeInputEnvelopeMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Garment texture-composite envelope metadata must be an object');
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== KEYS.length || KEYS.some((key, index) => keys[index] !== key)) {
    throw new Error('Garment texture-composite envelope metadata schema is invalid');
  }
  const ticketId = text(record.ticketId, 'ticketId');
  const projectId = uuid(record.projectId, 'projectId');
  const sourceArtifactId = text(record.sourceArtifactId, 'sourceArtifactId');
  const projectImageStorageId = uuid(record.projectImageStorageId, 'projectImageStorageId');
  const projectImageSha256 = sha(record.projectImageSha256, 'projectImageSha256');
  const garmentWarpLayerId = uuid(record.garmentWarpLayerId, 'garmentWarpLayerId');
  const garmentWarpLayerSha256 = sha(record.garmentWarpLayerSha256, 'garmentWarpLayerSha256');
  const garmentId = uuid(record.garmentId, 'garmentId');
  const viewId = uuid(record.viewId, 'viewId');
  const viewSha256 = sha(record.viewSha256, 'viewSha256');
  const representationId = uuid(record.representationId, 'representationId');
  const representationSha256 = sha(record.representationSha256, 'representationSha256');
  const anchorSetId = uuid(record.anchorSetId, 'anchorSetId');
  const anchorPayloadSha256 = sha(record.anchorPayloadSha256, 'anchorPayloadSha256');
  const destinationMeshSha256 = sha(record.destinationMeshSha256, 'destinationMeshSha256');
  const outputWidth = dimension(record.outputWidth, 'outputWidth');
  const outputHeight = dimension(record.outputHeight, 'outputHeight');
  assertPixels(outputWidth, outputHeight, 'Project output');
  const garmentSourceWidth = dimension(record.garmentSourceWidth, 'garmentSourceWidth');
  const garmentSourceHeight = dimension(record.garmentSourceHeight, 'garmentSourceHeight');
  assertPixels(garmentSourceWidth, garmentSourceHeight, 'Garment source');
  const sourcePointsQ16 = points(record.sourcePointsQ16, 'sourcePointsQ16');
  const destinationPointsQ16 = points(record.destinationPointsQ16, 'destinationPointsQ16');
  if (sourcePointsQ16.length !== destinationPointsQ16.length) throw new Error('Garment texture-composite envelope point counts differ');
  const triangles = triangleList(record.triangles, sourcePointsQ16.length);
  const normalizedParameters = normalizeGarmentTextureCompositeProducerParameters(record.producerParameters);
  const producerParametersSha256 = sha(record.producerParametersSha256, 'producerParametersSha256');
  return deepFreeze({
    ticketId, projectId, sourceArtifactId, projectImageStorageId, projectImageSha256,
    garmentWarpLayerId, garmentWarpLayerSha256, garmentId, viewId, viewSha256,
    representationId, representationSha256, anchorSetId, anchorPayloadSha256,
    destinationMeshSha256, outputWidth, outputHeight, garmentSourceWidth,
    garmentSourceHeight, sourcePointsQ16, destinationPointsQ16, triangles,
    producerParameters: normalizedParameters.document, producerParametersSha256,
  });
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
    const [a, b, c] = triangle.map(Number);
    if (a < 0 || b < 0 || c < 0 || a >= pointCount || b >= pointCount || c >= pointCount || a === b || b === c || a === c) {
      throw new Error(`triangles[${index}] references invalid points`);
    }
    return Object.freeze([a, b, c] as const);
  }));
}

function normalizeRgba(value: Uint8Array, width: number, height: number, label: string): Uint8Array {
  const expected = rgbaLength(width, height, label);
  if (!(value instanceof Uint8Array) || value.byteLength !== expected) throw new Error(`${label} RGBA length is invalid`);
  return value;
}

function rgbaLength(width: number, height: number, label: string): number {
  assertPixels(width, height, label);
  const length = width * height * 4;
  if (!Number.isSafeInteger(length)) throw new Error(`${label} RGBA length is invalid`);
  return length;
}

function assertPixels(width: number, height: number, label: string): void {
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels < 1 || pixels > MAX_PIXELS) throw new Error(`${label} exceeds the v1 pixel budget`);
}
function text(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new Error(`${name} is invalid`);
  const normalized = value.normalize('NFKC').trim();
  if (!normalized || [...normalized].length > 512 || /[\u0000-\u001f\u007f]/u.test(normalized)) throw new Error(`${name} is invalid`);
  return normalized;
}
function uuid(value: unknown, name: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error(`${name} must be a canonical lowercase UUID`);
  return value;
}
function sha(value: unknown, name: string): string {
  if (typeof value !== 'string' || !SHA.test(value)) throw new Error(`${name} must be canonical lowercase SHA-256`);
  return value;
}
function dimension(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > MAX_DIMENSION) throw new Error(`${name} is invalid`);
  return Number(value);
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
