import { createHash } from 'node:crypto';
import {
  GARMENT_TEXTURE_COMPOSITE_ALPHA_POLICY,
  GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
  GARMENT_TEXTURE_COMPOSITE_MAX_FEATHER_RADIUS,
  GARMENT_TEXTURE_COMPOSITE_MAX_OFFSET_ABS_Q16,
  GARMENT_TEXTURE_COMPOSITE_MAX_SCALE_Q16,
  GARMENT_TEXTURE_COMPOSITE_MIN_SCALE_Q16,
  GARMENT_TEXTURE_COMPOSITE_SCHEMA,
  GARMENT_TEXTURE_COMPOSITE_WRAP_MODE,
} from '../../../src/platform/creative/deterministic/GarmentTextureCompositeIdentity.js';

export type GarmentTextureTransformQ16 = Readonly<{
  scaleXQ16: number;
  scaleYQ16: number;
  offsetXQ16: number;
  offsetYQ16: number;
  wrapMode: typeof GARMENT_TEXTURE_COMPOSITE_WRAP_MODE;
  alphaPolicy: typeof GARMENT_TEXTURE_COMPOSITE_ALPHA_POLICY;
}>;

export type GarmentTextureCompositeProducerParametersV1 = Readonly<{
  schema: typeof GARMENT_TEXTURE_COMPOSITE_SCHEMA;
  textureTransform: GarmentTextureTransformQ16;
  featherRadius: number;
  colorSpacePolicy: typeof GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY;
}>;

export type NormalizedGarmentTextureFinalLineageParameters = Readonly<{
  document: GarmentTextureCompositeProducerParametersV1;
  canonicalJson: string;
  sha256: string;
}>;

const TOP_LEVEL_KEYS = Object.freeze(['colorSpacePolicy', 'featherRadius', 'schema', 'textureTransform']);
const TRANSFORM_KEYS = Object.freeze(['alphaPolicy', 'offsetXQ16', 'offsetYQ16', 'scaleXQ16', 'scaleYQ16', 'wrapMode']);

/**
 * Closed, byte-stable producer-parameter normalization for canonical Fashion FINAL lineage.
 *
 * This validator deliberately depends only on the immutable browser/Node-safe v1 identity,
 * not on the pixel-kernel TypeScript module. Canonical persisted lineage must remain readable
 * by Core and direct Node maintenance tools without requiring a browser bundler, and a future
 * pixel implementation change must not silently reinterpret an already-persisted v1 document.
 */
export function normalizeGarmentTextureFinalLineageParameters(value: unknown): NormalizedGarmentTextureFinalLineageParameters {
  const root = requireRecord(value, 'Garment texture FINAL producer parameters');
  assertExactKeys(root, TOP_LEVEL_KEYS, 'Garment texture FINAL producer parameters');
  if (root.schema !== GARMENT_TEXTURE_COMPOSITE_SCHEMA) {
    throw new Error(`Garment texture FINAL schema must be ${GARMENT_TEXTURE_COMPOSITE_SCHEMA}`);
  }
  if (root.colorSpacePolicy !== GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY) {
    throw new Error(`Garment texture FINAL colorSpacePolicy must be ${GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY}`);
  }
  assertFeatherRadius(root.featherRadius);

  const transform = requireRecord(root.textureTransform, 'Garment texture FINAL textureTransform');
  assertExactKeys(transform, TRANSFORM_KEYS, 'Garment texture FINAL textureTransform');
  assertScale(transform.scaleXQ16, 'Garment texture FINAL scaleXQ16');
  assertScale(transform.scaleYQ16, 'Garment texture FINAL scaleYQ16');
  assertOffset(transform.offsetXQ16, 'Garment texture FINAL offsetXQ16');
  assertOffset(transform.offsetYQ16, 'Garment texture FINAL offsetYQ16');
  if (transform.wrapMode !== GARMENT_TEXTURE_COMPOSITE_WRAP_MODE) {
    throw new Error(`Garment texture FINAL wrapMode must be ${GARMENT_TEXTURE_COMPOSITE_WRAP_MODE}`);
  }
  if (transform.alphaPolicy !== GARMENT_TEXTURE_COMPOSITE_ALPHA_POLICY) {
    throw new Error(`Garment texture FINAL alphaPolicy must be ${GARMENT_TEXTURE_COMPOSITE_ALPHA_POLICY}`);
  }

  const document = Object.freeze({
    schema: GARMENT_TEXTURE_COMPOSITE_SCHEMA,
    textureTransform: Object.freeze({
      scaleXQ16: transform.scaleXQ16 as number,
      scaleYQ16: transform.scaleYQ16 as number,
      offsetXQ16: transform.offsetXQ16 as number,
      offsetYQ16: transform.offsetYQ16 as number,
      wrapMode: GARMENT_TEXTURE_COMPOSITE_WRAP_MODE,
      alphaPolicy: GARMENT_TEXTURE_COMPOSITE_ALPHA_POLICY,
    }),
    featherRadius: root.featherRadius as number,
    colorSpacePolicy: GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
  } satisfies GarmentTextureCompositeProducerParametersV1);
  const canonicalJson = JSON.stringify(document);
  const sha256 = createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
  return Object.freeze({ document, canonicalJson, sha256 });
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has unknown or missing fields`);
  }
}

function assertScale(value: unknown, label: string): void {
  if (!Number.isSafeInteger(value) || (value as number) < GARMENT_TEXTURE_COMPOSITE_MIN_SCALE_Q16 || (value as number) > GARMENT_TEXTURE_COMPOSITE_MAX_SCALE_Q16) {
    throw new Error(`${label} must be an exact Q16 integer between ${GARMENT_TEXTURE_COMPOSITE_MIN_SCALE_Q16} and ${GARMENT_TEXTURE_COMPOSITE_MAX_SCALE_Q16}`);
  }
}

function assertOffset(value: unknown, label: string): void {
  if (!Number.isSafeInteger(value) || Math.abs(value as number) > GARMENT_TEXTURE_COMPOSITE_MAX_OFFSET_ABS_Q16) {
    throw new Error(`${label} must be an exact Q16 integer within +/-${GARMENT_TEXTURE_COMPOSITE_MAX_OFFSET_ABS_Q16}`);
  }
}

function assertFeatherRadius(value: unknown): void {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > GARMENT_TEXTURE_COMPOSITE_MAX_FEATHER_RADIUS) {
    throw new Error(`Garment texture FINAL featherRadius must be an exact integer between 0 and ${GARMENT_TEXTURE_COMPOSITE_MAX_FEATHER_RADIUS}`);
  }
}
