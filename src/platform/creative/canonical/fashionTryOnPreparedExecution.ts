import {
  GARMENT_MESH_WARP_MAX_DIMENSION,
  GARMENT_MESH_WARP_MAX_OUTPUT_PIXELS,
  GARMENT_MESH_WARP_TOOL_ID,
  GARMENT_MESH_WARP_TOOL_VERSION,
} from '../deterministic/GarmentMeshWarpIdentity.js';
import {
  normalizeGarmentMeshWarpSpec,
  type GarmentMeshPointQ16,
  type GarmentMeshTriangle,
} from '../deterministic/GarmentMeshWarp.ts';
import {
  GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION,
  GARMENT_TEXTURE_COMPOSITE_MAX_PIXELS,
  GARMENT_TEXTURE_COMPOSITE_TOOL_ID,
  GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION,
} from '../deterministic/GarmentTextureCompositeIdentity.js';
import {
  normalizeGarmentTextureCompositeProducerParameters,
  type GarmentTextureCompositeProducerParametersV1,
} from '../deterministic/GarmentTextureCompositeParameters.ts';

export const FASHION_TRYON_PREPARED_EXECUTION_VERSION = '1';
export const FASHION_TRYON_MESH_PHASE = 'GARMENT_MESH_WARP';
export const FASHION_TRYON_TEXTURE_PHASE = 'GARMENT_TEXTURE_COMPOSITE';
export const FASHION_TRYON_EXECUTION_MIME = 'image/png';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DESCRIPTOR_KEYS = Object.freeze(['expiresAt','mimeType','outputHeight','outputWidth','phase','ticketId','toolId','toolVersion','version']);
const MESH_MAGIC = new TextEncoder().encode('BERSFTM1');
const TEXTURE_MAGIC = new TextEncoder().encode('BERSFTT1');
const HEADER_BYTES = 12;
const MAX_METADATA_BYTES = 512 * 1024;
const MESH_METADATA_KEYS = Object.freeze(['basisViewHeight','basisViewWidth','destinationPointsQ16','outputHeight','outputWidth','sourcePointsQ16','triangles']);
const TEXTURE_METADATA_KEYS = Object.freeze(['destinationPointsQ16','garmentSourceHeight','garmentSourceWidth','outputHeight','outputWidth','producerParameters','sourcePointsQ16','triangles']);

export type FashionTryOnExecutionPhase = typeof FASHION_TRYON_MESH_PHASE | typeof FASHION_TRYON_TEXTURE_PHASE;

/**
 * Non-authorizing product descriptor for one prepared deterministic phase.
 *
 * `ticketId` is only an opaque lookup handle. Every input/submit request must
 * still authenticate normally and Core must reload/revalidate the durable v2
 * ticket. This object intentionally carries no HMAC, evidence identity, storage
 * identity, managed Garment identity or result identity.
 */
export type FashionTryOnPreparedExecutionDescriptorV1 = Readonly<{
  version: typeof FASHION_TRYON_PREPARED_EXECUTION_VERSION;
  ticketId: string;
  phase: FashionTryOnExecutionPhase;
  toolId: typeof GARMENT_MESH_WARP_TOOL_ID | typeof GARMENT_TEXTURE_COMPOSITE_TOOL_ID;
  toolVersion: '1';
  outputWidth: number;
  outputHeight: number;
  mimeType: typeof FASHION_TRYON_EXECUTION_MIME;
  expiresAt: number;
}>;

export type FashionTryOnMeshExecutionEnvelopeV1 = Readonly<{
  basisViewRgba: Uint8Array;
  basisViewWidth: number;
  basisViewHeight: number;
  sourcePointsQ16: readonly GarmentMeshPointQ16[];
  destinationPointsQ16: readonly GarmentMeshPointQ16[];
  triangles: readonly GarmentMeshTriangle[];
  outputWidth: number;
  outputHeight: number;
}>;

export type FashionTryOnTextureExecutionEnvelopeV1 = Readonly<{
  projectRgba: Uint8Array;
  garmentSourceRgba: Uint8Array;
  garmentSourceWidth: number;
  garmentSourceHeight: number;
  sourcePointsQ16: readonly GarmentMeshPointQ16[];
  destinationPointsQ16: readonly GarmentMeshPointQ16[];
  triangles: readonly GarmentMeshTriangle[];
  outputWidth: number;
  outputHeight: number;
  producerParameters: GarmentTextureCompositeProducerParametersV1;
}>;

export function normalizeFashionTryOnPreparedExecutionDescriptor(value: unknown): FashionTryOnPreparedExecutionDescriptorV1 {
  const record = exactRecord(value, DESCRIPTOR_KEYS, 'Fashion Try-On prepared execution descriptor');
  if (record.version !== FASHION_TRYON_PREPARED_EXECUTION_VERSION) throw new Error('Fashion Try-On prepared execution descriptor version is invalid');
  const ticketId = requireUuid(record.ticketId, 'ticketId');
  const phase = requirePhase(record.phase);
  const expected = phase === FASHION_TRYON_MESH_PHASE
    ? Object.freeze({ toolId: GARMENT_MESH_WARP_TOOL_ID, toolVersion: GARMENT_MESH_WARP_TOOL_VERSION, maxDimension: GARMENT_MESH_WARP_MAX_DIMENSION, maxPixels: GARMENT_MESH_WARP_MAX_OUTPUT_PIXELS })
    : Object.freeze({ toolId: GARMENT_TEXTURE_COMPOSITE_TOOL_ID, toolVersion: GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION, maxDimension: GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION, maxPixels: GARMENT_TEXTURE_COMPOSITE_MAX_PIXELS });
  if (record.toolId !== expected.toolId || record.toolVersion !== expected.toolVersion) throw new Error('Fashion Try-On prepared execution descriptor tool binding is invalid');
  const outputWidth = requireDimension(record.outputWidth, expected.maxDimension, 'outputWidth');
  const outputHeight = requireDimension(record.outputHeight, expected.maxDimension, 'outputHeight');
  requirePixelBudget(outputWidth, outputHeight, expected.maxPixels, 'Fashion Try-On prepared execution descriptor');
  if (record.mimeType !== FASHION_TRYON_EXECUTION_MIME) throw new Error('Fashion Try-On prepared execution descriptor mimeType is invalid');
  if (!Number.isSafeInteger(record.expiresAt) || Number(record.expiresAt) < 1) throw new Error('Fashion Try-On prepared execution descriptor expiresAt is invalid');
  return Object.freeze({
    version: FASHION_TRYON_PREPARED_EXECUTION_VERSION,
    ticketId,
    phase,
    toolId: expected.toolId,
    toolVersion: expected.toolVersion,
    outputWidth,
    outputHeight,
    mimeType: FASHION_TRYON_EXECUTION_MIME,
    expiresAt: Number(record.expiresAt),
  });
}

export function requireUsableFashionTryOnPreparedExecutionDescriptor(
  value: unknown,
  expectedPhase: FashionTryOnExecutionPhase,
  now = Date.now(),
): FashionTryOnPreparedExecutionDescriptorV1 {
  const descriptor = normalizeFashionTryOnPreparedExecutionDescriptor(value);
  if (descriptor.phase !== expectedPhase) throw new Error('Fashion Try-On prepared execution descriptor phase is invalid for this executor');
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Fashion Try-On prepared execution clock is invalid');
  if (descriptor.expiresAt <= now) throw new Error('Fashion Try-On prepared execution descriptor is expired');
  return descriptor;
}

export function encodeFashionTryOnMeshExecutionEnvelope(input: FashionTryOnMeshExecutionEnvelopeV1): Uint8Array {
  const normalized = normalizeMeshEnvelope(input);
  const metadata = Object.freeze({
    basisViewHeight: normalized.basisViewHeight,
    basisViewWidth: normalized.basisViewWidth,
    destinationPointsQ16: normalized.destinationPointsQ16,
    outputHeight: normalized.outputHeight,
    outputWidth: normalized.outputWidth,
    sourcePointsQ16: normalized.sourcePointsQ16,
    triangles: normalized.triangles,
  });
  return encodeSinglePlane(MESH_MAGIC, metadata, normalized.basisViewRgba);
}

export function decodeFashionTryOnMeshExecutionEnvelope(bytes: Uint8Array): FashionTryOnMeshExecutionEnvelopeV1 {
  const decoded = decodeSinglePlane(MESH_MAGIC, bytes, 'Fashion Try-On mesh execution envelope');
  const record = exactRecord(decoded.metadata, MESH_METADATA_KEYS, 'Fashion Try-On mesh execution envelope metadata');
  return normalizeMeshEnvelope({ ...record, basisViewRgba: decoded.plane } as unknown as FashionTryOnMeshExecutionEnvelopeV1);
}

export function encodeFashionTryOnTextureExecutionEnvelope(input: FashionTryOnTextureExecutionEnvelopeV1): Uint8Array {
  const normalized = normalizeTextureEnvelope(input);
  const metadata = Object.freeze({
    destinationPointsQ16: normalized.destinationPointsQ16,
    garmentSourceHeight: normalized.garmentSourceHeight,
    garmentSourceWidth: normalized.garmentSourceWidth,
    outputHeight: normalized.outputHeight,
    outputWidth: normalized.outputWidth,
    producerParameters: normalized.producerParameters,
    sourcePointsQ16: normalized.sourcePointsQ16,
    triangles: normalized.triangles,
  });
  const metadataBytes = metadataJson(metadata, 'Fashion Try-On texture execution envelope');
  const output = new Uint8Array(
    HEADER_BYTES + metadataBytes.byteLength + normalized.projectRgba.byteLength + normalized.garmentSourceRgba.byteLength,
  );
  output.set(TEXTURE_MAGIC, 0);
  new DataView(output.buffer).setUint32(TEXTURE_MAGIC.byteLength, metadataBytes.byteLength, false);
  output.set(metadataBytes, HEADER_BYTES);
  let offset = HEADER_BYTES + metadataBytes.byteLength;
  output.set(normalized.projectRgba, offset);
  offset += normalized.projectRgba.byteLength;
  output.set(normalized.garmentSourceRgba, offset);
  return output;
}

export function decodeFashionTryOnTextureExecutionEnvelope(bytes: Uint8Array): FashionTryOnTextureExecutionEnvelopeV1 {
  const { metadata, payloadOffset } = decodeHeader(TEXTURE_MAGIC, bytes, 'Fashion Try-On texture execution envelope');
  const record = exactRecord(metadata, TEXTURE_METADATA_KEYS, 'Fashion Try-On texture execution envelope metadata');
  const outputWidth = requireDimension(record.outputWidth, GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION, 'outputWidth');
  const outputHeight = requireDimension(record.outputHeight, GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION, 'outputHeight');
  requirePixelBudget(outputWidth, outputHeight, GARMENT_TEXTURE_COMPOSITE_MAX_PIXELS, 'Fashion Try-On texture Project plane');
  const garmentSourceWidth = requireDimension(record.garmentSourceWidth, GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION, 'garmentSourceWidth');
  const garmentSourceHeight = requireDimension(record.garmentSourceHeight, GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION, 'garmentSourceHeight');
  requirePixelBudget(garmentSourceWidth, garmentSourceHeight, GARMENT_TEXTURE_COMPOSITE_MAX_PIXELS, 'Fashion Try-On texture garment plane');
  const projectBytes = outputWidth * outputHeight * 4;
  const garmentBytes = garmentSourceWidth * garmentSourceHeight * 4;
  if (bytes.byteLength !== payloadOffset + projectBytes + garmentBytes) throw new Error('Fashion Try-On texture execution envelope RGBA length is invalid');
  return normalizeTextureEnvelope({
    ...record,
    projectRgba: Uint8Array.from(bytes.subarray(payloadOffset, payloadOffset + projectBytes)),
    garmentSourceRgba: Uint8Array.from(bytes.subarray(payloadOffset + projectBytes)),
  } as unknown as FashionTryOnTextureExecutionEnvelopeV1);
}

function normalizeMeshEnvelope(value: FashionTryOnMeshExecutionEnvelopeV1): FashionTryOnMeshExecutionEnvelopeV1 {
  const basisViewWidth = requireDimension(value.basisViewWidth, GARMENT_MESH_WARP_MAX_DIMENSION, 'basisViewWidth');
  const basisViewHeight = requireDimension(value.basisViewHeight, GARMENT_MESH_WARP_MAX_DIMENSION, 'basisViewHeight');
  requirePixelBudget(basisViewWidth, basisViewHeight, GARMENT_MESH_WARP_MAX_OUTPUT_PIXELS, 'Fashion Try-On mesh basis plane');
  const spec = normalizeGarmentMeshWarpSpec({
    sourcePointsQ16: value.sourcePointsQ16,
    destinationPointsQ16: value.destinationPointsQ16,
    triangles: value.triangles,
    outputWidth: value.outputWidth,
    outputHeight: value.outputHeight,
  });
  const basisViewRgba = normalizeRgba(value.basisViewRgba, basisViewWidth, basisViewHeight, 'Fashion Try-On mesh basis plane');
  return Object.freeze({ basisViewRgba, basisViewWidth, basisViewHeight, ...spec });
}

function normalizeTextureEnvelope(value: FashionTryOnTextureExecutionEnvelopeV1): FashionTryOnTextureExecutionEnvelopeV1 {
  const outputWidth = requireDimension(value.outputWidth, GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION, 'outputWidth');
  const outputHeight = requireDimension(value.outputHeight, GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION, 'outputHeight');
  requirePixelBudget(outputWidth, outputHeight, GARMENT_TEXTURE_COMPOSITE_MAX_PIXELS, 'Fashion Try-On texture Project plane');
  const garmentSourceWidth = requireDimension(value.garmentSourceWidth, GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION, 'garmentSourceWidth');
  const garmentSourceHeight = requireDimension(value.garmentSourceHeight, GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION, 'garmentSourceHeight');
  requirePixelBudget(garmentSourceWidth, garmentSourceHeight, GARMENT_TEXTURE_COMPOSITE_MAX_PIXELS, 'Fashion Try-On texture garment plane');
  const spec = normalizeGarmentMeshWarpSpec({
    sourcePointsQ16: value.sourcePointsQ16,
    destinationPointsQ16: value.destinationPointsQ16,
    triangles: value.triangles,
    outputWidth,
    outputHeight,
  });
  const producerParameters = normalizeGarmentTextureCompositeProducerParameters(value.producerParameters).document;
  return Object.freeze({
    projectRgba: normalizeRgba(value.projectRgba, outputWidth, outputHeight, 'Fashion Try-On texture Project plane'),
    garmentSourceRgba: normalizeRgba(value.garmentSourceRgba, garmentSourceWidth, garmentSourceHeight, 'Fashion Try-On texture garment plane'),
    garmentSourceWidth,
    garmentSourceHeight,
    ...spec,
    producerParameters,
  });
}

function encodeSinglePlane(magic: Uint8Array, metadata: unknown, plane: Uint8Array): Uint8Array {
  const metadataBytes = metadataJson(metadata, 'Fashion Try-On execution envelope');
  const output = new Uint8Array(HEADER_BYTES + metadataBytes.byteLength + plane.byteLength);
  output.set(magic, 0);
  new DataView(output.buffer).setUint32(magic.byteLength, metadataBytes.byteLength, false);
  output.set(metadataBytes, HEADER_BYTES);
  output.set(plane, HEADER_BYTES + metadataBytes.byteLength);
  return output;
}
function decodeSinglePlane(magic: Uint8Array, bytes: Uint8Array, label: string): Readonly<{ metadata: unknown; plane: Uint8Array }> {
  const { metadata, payloadOffset } = decodeHeader(magic, bytes, label);
  return Object.freeze({ metadata, plane: Uint8Array.from(bytes.subarray(payloadOffset)) });
}
function decodeHeader(magic: Uint8Array, bytes: Uint8Array, label: string): Readonly<{ metadata: unknown; payloadOffset: number }> {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < HEADER_BYTES) throw new Error(`${label} is truncated`);
  for (let index = 0; index < magic.byteLength; index += 1) if (bytes[index] !== magic[index]) throw new Error(`${label} magic/version is invalid`);
  const metadataLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(magic.byteLength, false);
  if (metadataLength < 2 || metadataLength > MAX_METADATA_BYTES || HEADER_BYTES + metadataLength > bytes.byteLength) throw new Error(`${label} metadata length is invalid`);
  let metadata: unknown;
  try {
    metadata = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(HEADER_BYTES, HEADER_BYTES + metadataLength)));
  } catch {
    throw new Error(`${label} metadata is invalid UTF-8 JSON`);
  }
  return Object.freeze({ metadata, payloadOffset: HEADER_BYTES + metadataLength });
}
function metadataJson(value: unknown, label: string): Uint8Array {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  if (bytes.byteLength < 2 || bytes.byteLength > MAX_METADATA_BYTES) throw new Error(`${label} metadata exceeds the v1 limit`);
  return bytes;
}
function exactRecord(value: unknown, expectedKeys: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) throw new Error(`${label} has unknown or missing fields`);
  return record;
}
function requireUuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error(`Fashion Try-On prepared execution ${label} must be a canonical lowercase UUID`);
  return value;
}
function requirePhase(value: unknown): FashionTryOnExecutionPhase {
  if (value !== FASHION_TRYON_MESH_PHASE && value !== FASHION_TRYON_TEXTURE_PHASE) throw new Error('Fashion Try-On prepared execution phase is invalid');
  return value;
}
function requireDimension(value: unknown, max: number, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > max) throw new Error(`${label} is outside admitted Fashion Try-On execution geometry`);
  return Number(value);
}
function requirePixelBudget(width: number, height: number, maxPixels: number, label: string): void {
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > maxPixels) throw new Error(`${label} exceeds admitted Fashion Try-On pixel budget`);
}
function normalizeRgba(value: Uint8Array, width: number, height: number, label: string): Uint8Array {
  if (!(value instanceof Uint8Array) || value.byteLength !== width * height * 4) throw new Error(`${label} RGBA length is invalid`);
  return Uint8Array.from(value);
}
