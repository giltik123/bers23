import { createHash } from 'node:crypto';
import {
  normalizeGarmentAppearanceRefinementProducerParameters,
  type GarmentAppearanceRefinementProducerParametersV1,
} from '../../../src/platform/creative/deterministic/GarmentAppearanceRefinementParameters.ts';

export type { GarmentAppearanceRefinementProducerParametersV1 };

export type NormalizedGarmentAppearanceRefinementLineageParameters = Readonly<{
  document: GarmentAppearanceRefinementProducerParametersV1;
  canonicalJson: string;
  sha256: string;
}>;

/**
 * Core-owned durable-lineage hash wrapper for the closed F5 producer document.
 * Browser/Node code shares canonical JSON normalization; only Core mints the
 * authoritative SHA-256 that a later PostgreSQL lineage trigger will bind.
 */
export function normalizeGarmentAppearanceRefinementLineageParameters(
  value: unknown,
): NormalizedGarmentAppearanceRefinementLineageParameters {
  const normalized = normalizeGarmentAppearanceRefinementProducerParameters(value);
  const sha256 = createHash('sha256').update(normalized.canonicalJson, 'utf8').digest('hex');
  return Object.freeze({ ...normalized, sha256 });
}
