import { createHash } from 'node:crypto';
import {
  normalizeGarmentTextureCompositeProducerParameters,
  type GarmentTextureCompositeProducerParametersV1,
  type GarmentTextureTransformQ16,
} from '../../../src/platform/creative/deterministic/GarmentTextureCompositeParameters.ts';

export type { GarmentTextureCompositeProducerParametersV1, GarmentTextureTransformQ16 };

export type NormalizedGarmentTextureFinalLineageParameters = Readonly<{
  document: GarmentTextureCompositeProducerParametersV1;
  canonicalJson: string;
  sha256: string;
}>;

/**
 * Core-owned durable lineage wrapper around the browser/Node-safe closed
 * producer-parameter normalization. SHA-256 authority stays server-side while
 * the exact canonical JSON law is shared with ticket and browser validation.
 */
export function normalizeGarmentTextureFinalLineageParameters(value: unknown): NormalizedGarmentTextureFinalLineageParameters {
  const normalized = normalizeGarmentTextureCompositeProducerParameters(value);
  const sha256 = createHash('sha256').update(normalized.canonicalJson, 'utf8').digest('hex');
  return Object.freeze({ ...normalized, sha256 });
}
