import { createHash } from 'node:crypto';
import {
  GARMENT_TEXTURE_COMPOSITE_ALPHA_POLICY,
  GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
  GARMENT_TEXTURE_COMPOSITE_SCHEMA,
  GARMENT_TEXTURE_COMPOSITE_WRAP_MODE,
  normalizeGarmentTextureCompositeSpec,
  type GarmentTextureCompositeSpec,
  type GarmentTextureTransformQ16,
} from '../../../src/platform/creative/deterministic/GarmentTextureComposite.js';

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
 * Unknown or missing keys are rejected before the shared deterministic pixel-law normalizer
 * is consulted, so a future option cannot silently change the meaning of an old FINAL.
 */
export function normalizeGarmentTextureFinalLineageParameters(value: unknown): NormalizedGarmentTextureFinalLineageParameters {
  const root = requireRecord(value, 'Garment texture FINAL producer parameters');
  assertExactKeys(root, TOP_LEVEL_KEYS, 'Garment texture FINAL producer parameters');
  if (root.schema !== GARMENT_TEXTURE_COMPOSITE_SCHEMA) {
    throw new Error(`Garment texture FINAL schema must be ${GARMENT_TEXTURE_COMPOSITE_SCHEMA}`);
  }
  const transform = requireRecord(root.textureTransform, 'Garment texture FINAL textureTransform');
  assertExactKeys(transform, TRANSFORM_KEYS, 'Garment texture FINAL textureTransform');

  const normalized = normalizeGarmentTextureCompositeSpec({
    textureTransform: {
      scaleXQ16: transform.scaleXQ16 as number,
      scaleYQ16: transform.scaleYQ16 as number,
      offsetXQ16: transform.offsetXQ16 as number,
      offsetYQ16: transform.offsetYQ16 as number,
      wrapMode: transform.wrapMode as typeof GARMENT_TEXTURE_COMPOSITE_WRAP_MODE,
      alphaPolicy: transform.alphaPolicy as typeof GARMENT_TEXTURE_COMPOSITE_ALPHA_POLICY,
    },
    featherRadius: root.featherRadius as number,
    colorSpacePolicy: root.colorSpacePolicy as typeof GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
  } satisfies GarmentTextureCompositeSpec);

  const document = Object.freeze({
    schema: GARMENT_TEXTURE_COMPOSITE_SCHEMA,
    textureTransform: Object.freeze({
      scaleXQ16: normalized.textureTransform.scaleXQ16,
      scaleYQ16: normalized.textureTransform.scaleYQ16,
      offsetXQ16: normalized.textureTransform.offsetXQ16,
      offsetYQ16: normalized.textureTransform.offsetYQ16,
      wrapMode: normalized.textureTransform.wrapMode,
      alphaPolicy: normalized.textureTransform.alphaPolicy,
    }),
    featherRadius: normalized.featherRadius,
    colorSpacePolicy: normalized.colorSpacePolicy,
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
