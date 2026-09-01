import assert from 'node:assert/strict';
import test from 'node:test';
import { GARMENT_APPEARANCE_REFINEMENT_PROFILE } from '../src/platform/creative/deterministic/GarmentAppearanceRefinementIdentity.js';
import { normalizeGarmentAppearanceRefinementFinalLineage } from '../server/core/fashion/garmentAppearanceRefinementFinalLineage.ts';

const parent = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
const parentSha = 'a'.repeat(64);
const supportSha = 'b'.repeat(64);

function exactLineage() {
  return {
    refinementParentStorageId: parent,
    refinementParentSha256: parentSha,
    refinementProfile: GARMENT_APPEARANCE_REFINEMENT_PROFILE,
    refinementSupportSha256: supportSha,
  } as const;
}

test('F5a.2 normalizes only the closed deterministic-parent lineage document', () => {
  const result = normalizeGarmentAppearanceRefinementFinalLineage(exactLineage());
  assert.deepEqual(result, {
    refinementParentStorageId: parent,
    refinementParentSha256: parentSha,
    refinementProfile: 'REFINE_REALISM_V1',
    refinementSupportSha256: supportSha,
  });
  assert.equal(Object.isFrozen(result), true);
});

test('F5a.2 rejects noncanonical evidence, unknown profiles and extra generation authority', () => {
  assert.throws(() => normalizeGarmentAppearanceRefinementFinalLineage({
    ...exactLineage(),
    refinementParentStorageId: parent.toUpperCase(),
  }), /canonical lowercase UUID/i);

  assert.throws(() => normalizeGarmentAppearanceRefinementFinalLineage({
    ...exactLineage(),
    refinementParentSha256: parentSha.toUpperCase(),
  }), /canonical lowercase SHA-256/i);

  assert.throws(() => normalizeGarmentAppearanceRefinementFinalLineage({
    ...exactLineage(),
    refinementProfile: 'REFINE_OTHER' as typeof GARMENT_APPEARANCE_REFINEMENT_PROFILE,
  }), /profile must be REFINE_REALISM_V1/i);

  assert.throws(() => normalizeGarmentAppearanceRefinementFinalLineage({
    ...exactLineage(),
    refinementSupportSha256: '0'.repeat(63),
  }), /canonical lowercase SHA-256/i);

  assert.throws(() => normalizeGarmentAppearanceRefinementFinalLineage({
    ...exactLineage(),
    prompt: 'change garment',
  } as any), /unknown or missing fields/i);
});
