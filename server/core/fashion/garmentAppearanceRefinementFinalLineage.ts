import { GARMENT_APPEARANCE_REFINEMENT_PROFILE } from '../../../src/platform/creative/deterministic/GarmentAppearanceRefinementIdentity.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export type GarmentAppearanceRefinementFinalLineageV1 = Readonly<{
  refinementParentStorageId: string;
  refinementParentSha256: string;
  refinementProfile: typeof GARMENT_APPEARANCE_REFINEMENT_PROFILE;
  refinementSupportSha256: string;
}>;

/**
 * Closed server-owned durable lineage document for an F5 refinement FINAL.
 *
 * This contract normalizes already-resolved Core evidence only. It grants no
 * execution/model/provider authority and intentionally contains no prompt,
 * provider, model, mask or free-form generation parameters.
 */
export function normalizeGarmentAppearanceRefinementFinalLineage(
  value: GarmentAppearanceRefinementFinalLineageV1,
): GarmentAppearanceRefinementFinalLineageV1 {
  if (!value || typeof value !== 'object') throw new Error('Canonical Fashion refinement FINAL lineage is required');
  const refinementParentStorageId = canonicalUuid(value.refinementParentStorageId, 'Canonical Fashion refinement parent storage id');
  const refinementParentSha256 = canonicalSha256(value.refinementParentSha256, 'Canonical Fashion refinement parent SHA-256');
  const refinementSupportSha256 = canonicalSha256(value.refinementSupportSha256, 'Canonical Fashion refinement support SHA-256');
  if (value.refinementProfile !== GARMENT_APPEARANCE_REFINEMENT_PROFILE) {
    throw new Error(`Canonical Fashion refinement profile must be ${GARMENT_APPEARANCE_REFINEMENT_PROFILE}`);
  }
  return Object.freeze({
    refinementParentStorageId,
    refinementParentSha256,
    refinementProfile: GARMENT_APPEARANCE_REFINEMENT_PROFILE,
    refinementSupportSha256,
  });
}

function canonicalSha256(value: unknown, label: string): string {
  const hash = String(value ?? '').trim();
  if (!SHA256_PATTERN.test(hash)) throw new Error(`${label} must be canonical lowercase SHA-256`);
  return hash;
}

function canonicalUuid(value: unknown, label: string): string {
  const id = String(value ?? '').trim();
  if (!UUID_PATTERN.test(id)) throw new Error(`${label} must be a canonical lowercase UUID`);
  return id;
}
