import { GARMENT_APPEARANCE_REFINEMENT_PROFILE } from '../../../src/platform/creative/deterministic/GarmentAppearanceRefinementIdentity.js';
import {
  normalizeGarmentAppearanceRefinementLineageParameters,
  type GarmentAppearanceRefinementProducerParametersV1,
} from './garmentAppearanceRefinementLineage.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const REQUIRED_KEYS = Object.freeze([
  'refinementParentSha256',
  'refinementParentStorageId',
  'refinementProducerParameters',
  'refinementProfile',
  'refinementSupportSha256',
] as const);

export type GarmentAppearanceRefinementFinalLineageV1 = Readonly<{
  refinementParentStorageId: string;
  refinementParentSha256: string;
  refinementProfile: typeof GARMENT_APPEARANCE_REFINEMENT_PROFILE;
  refinementSupportSha256: string;
  refinementProducerParameters: GarmentAppearanceRefinementProducerParametersV1;
}>;

export type NormalizedGarmentAppearanceRefinementFinalLineageV1 = GarmentAppearanceRefinementFinalLineageV1 & Readonly<{
  refinementProducerParametersSha256: string;
}>;

export function normalizeGarmentAppearanceRefinementFinalLineage(
  value: GarmentAppearanceRefinementFinalLineageV1,
): NormalizedGarmentAppearanceRefinementFinalLineageV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Canonical Fashion refinement FINAL lineage is required');
  }
  const keys = Object.keys(value).sort();
  if (keys.length !== REQUIRED_KEYS.length || keys.some((key, index) => key !== REQUIRED_KEYS[index])) {
    throw new Error('Canonical Fashion refinement FINAL lineage has unknown or missing fields');
  }
  const refinementParentStorageId = canonicalUuid(value.refinementParentStorageId, 'Canonical Fashion refinement parent storage id');
  const refinementParentSha256 = canonicalSha256(value.refinementParentSha256, 'Canonical Fashion refinement parent SHA-256');
  const refinementSupportSha256 = canonicalSha256(value.refinementSupportSha256, 'Canonical Fashion refinement support SHA-256');
  if (value.refinementProfile !== GARMENT_APPEARANCE_REFINEMENT_PROFILE) {
    throw new Error(`Canonical Fashion refinement profile must be ${GARMENT_APPEARANCE_REFINEMENT_PROFILE}`);
  }
  const producer = normalizeGarmentAppearanceRefinementLineageParameters(value.refinementProducerParameters);
  if (producer.document.profile !== value.refinementProfile) {
    throw new Error('Canonical Fashion refinement producer profile does not match FINAL lineage profile');
  }
  return Object.freeze({
    refinementParentStorageId,
    refinementParentSha256,
    refinementProfile: GARMENT_APPEARANCE_REFINEMENT_PROFILE,
    refinementSupportSha256,
    refinementProducerParameters: producer.document,
    refinementProducerParametersSha256: producer.sha256,
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
