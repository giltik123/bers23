import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GARMENT_APPEARANCE_REFINEMENT_CONTRACT_VERSION,
  GARMENT_APPEARANCE_REFINEMENT_OPERATION,
  GARMENT_APPEARANCE_REFINEMENT_PROFILE,
} from '../src/platform/creative/deterministic/GarmentAppearanceRefinementIdentity.js';
import {
  normalizeGarmentAppearanceRefinementFinalLineage,
} from '../server/core/fashion/garmentAppearanceRefinementFinalLineage.ts';

const SOURCE = 'aaaaaaaa-1111-4111-8111-111111111111';
const PARENT = 'bbbbbbbb-2222-4222-8222-222222222222';
const SHA = 'a'.repeat(64);

function valid() {
  return {
    sourceImageStorageId: SOURCE,
    producerOperation: GARMENT_APPEARANCE_REFINEMENT_OPERATION,
    refinementParentImageStorageId: PARENT,
    refinementParentImageSha256: SHA,
    refinementProfile: GARMENT_APPEARANCE_REFINEMENT_PROFILE,
    refinementContractVersion: GARMENT_APPEARANCE_REFINEMENT_CONTRACT_VERSION,
  } as const;
}

test('F5a.3 normalizes the exact dual-bound refinement lineage without adding F4 evidence', () => {
  const result = normalizeGarmentAppearanceRefinementFinalLineage(valid());
  assert.deepEqual(result, valid());
  assert.deepEqual(Object.keys(result).sort(), [
    'producerOperation',
    'refinementContractVersion',
    'refinementParentImageSha256',
    'refinementParentImageStorageId',
    'refinementProfile',
    'sourceImageStorageId',
  ].sort());
  assert.ok(Object.isFrozen(result));
});

test('F5a.3 rejects noncanonical source parent hash profile version and operation claims', () => {
  const cases: Array<readonly [Record<string, unknown>, RegExp]> = [
    [{ ...valid(), sourceImageStorageId: SOURCE.toUpperCase() }, /canonical lowercase UUID/i],
    [{ ...valid(), refinementParentImageStorageId: PARENT.toUpperCase() }, /canonical lowercase UUID/i],
    [{ ...valid(), refinementParentImageSha256: SHA.toUpperCase() }, /canonical lowercase SHA-256/i],
    [{ ...valid(), refinementParentImageSha256: 'a'.repeat(63) }, /canonical lowercase SHA-256/i],
    [{ ...valid(), refinementProfile: 'UNKNOWN' }, /profile must be REFINE_REALISM_V1/i],
    [{ ...valid(), refinementContractVersion: '2' }, /contract version must be 1/i],
    [{ ...valid(), producerOperation: 'GARMENT_TEXTURE_COMPOSITE' }, /producerOperation must be GARMENT_APPEARANCE_REFINEMENT/i],
    [{ ...valid(), refinementParentImageStorageId: SOURCE }, /source and deterministic parent identities must differ/i],
  ];
  for (const [input, pattern] of cases) {
    assert.throws(
      () => normalizeGarmentAppearanceRefinementFinalLineage(input as ReturnType<typeof valid>),
      pattern,
    );
  }
});
