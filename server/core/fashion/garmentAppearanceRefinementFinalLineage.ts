import {
  GARMENT_APPEARANCE_REFINEMENT_CONTRACT_VERSION,
  GARMENT_APPEARANCE_REFINEMENT_OPERATION,
  GARMENT_APPEARANCE_REFINEMENT_PROFILE,
} from '../../../src/platform/creative/deterministic/GarmentAppearanceRefinementIdentity.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export type GarmentAppearanceRefinementFinalLineageV1 = Readonly<{
  sourceImageStorageId: string;
  producerOperation: typeof GARMENT_APPEARANCE_REFINEMENT_OPERATION;
  refinementParentImageStorageId: string;
  refinementParentImageSha256: string;
  refinementProfile: typeof GARMENT_APPEARANCE_REFINEMENT_PROFILE;
  refinementContractVersion: typeof GARMENT_APPEARANCE_REFINEMENT_CONTRACT_VERSION;
}>;

/**
 * Closed server-owned F5 FINAL lineage. This normalizer grants no execution,
 * model, provider, persistence or Project mutation authority by itself.
 */
export function normalizeGarmentAppearanceRefinementFinalLineage(
  value: GarmentAppearanceRefinementFinalLineageV1,
): GarmentAppearanceRefinementFinalLineageV1 {
  if (!value || typeof value !== 'object') throw new Error('Canonical Garment Appearance Refinement FINAL lineage is required');
  const sourceImageStorageId = canonicalUuid(value.sourceImageStorageId, 'Canonical refinement Project source storage id');
  const refinementParentImageStorageId = canonicalUuid(
    value.refinementParentImageStorageId,
    'Canonical refinement deterministic parent storage id',
  );
  if (sourceImageStorageId === refinementParentImageStorageId) {
    throw new Error('Canonical refinement Project source and deterministic parent identities must differ');
  }
  const refinementParentImageSha256 = canonicalSha256(
    value.refinementParentImageSha256,
    'Canonical refinement deterministic parent SHA-256',
  );
  if (value.producerOperation !== GARMENT_APPEARANCE_REFINEMENT_OPERATION) {
    throw new Error(`Canonical refinement producerOperation must be ${GARMENT_APPEARANCE_REFINEMENT_OPERATION}`);
  }
  if (value.refinementProfile !== GARMENT_APPEARANCE_REFINEMENT_PROFILE) {
    throw new Error(`Canonical refinement profile must be ${GARMENT_APPEARANCE_REFINEMENT_PROFILE}`);
  }
  if (value.refinementContractVersion !== GARMENT_APPEARANCE_REFINEMENT_CONTRACT_VERSION) {
    throw new Error(`Canonical refinement contract version must be ${GARMENT_APPEARANCE_REFINEMENT_CONTRACT_VERSION}`);
  }
  return Object.freeze({
    sourceImageStorageId,
    producerOperation: GARMENT_APPEARANCE_REFINEMENT_OPERATION,
    refinementParentImageStorageId,
    refinementParentImageSha256,
    refinementProfile: GARMENT_APPEARANCE_REFINEMENT_PROFILE,
    refinementContractVersion: GARMENT_APPEARANCE_REFINEMENT_CONTRACT_VERSION,
  });
}

function canonicalUuid(value: unknown, label: string): string {
  const id = String(value ?? '').trim();
  if (!UUID_PATTERN.test(id)) throw new Error(`${label} must be a canonical lowercase UUID`);
  return id;
}

function canonicalSha256(value: unknown, label: string): string {
  const hash = String(value ?? '').trim();
  if (!SHA256_PATTERN.test(hash)) throw new Error(`${label} must be canonical lowercase SHA-256`);
  return hash;
}
