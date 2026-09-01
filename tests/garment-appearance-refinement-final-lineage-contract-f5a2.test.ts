import assert from 'node:assert/strict';
import test from 'node:test';
import { GARMENT_APPEARANCE_REFINEMENT_PROFILE } from '../src/platform/creative/deterministic/GarmentAppearanceRefinementIdentity.js';
import { normalizeGarmentAppearanceRefinementFinalLineage } from '../server/core/fashion/garmentAppearanceRefinementFinalLineage.ts';

const parent = '11111111-1111-4111-8111-111111111111';
const parentSha = 'a'.repeat(64);
const supportSha = 'b'.repeat(64);

test('F5a.2 normalizes only the closed deterministic-parent lineage document', () => {
  const result = normalizeGarmentAppearanceRefinementFinalLineage({
    refinementParentStorageId: parent,
    refinementParentSha256: parentSha,
    refinementProfile: GARMENT_APPEARANCE_REFINEMENT_PROFILE,
    refinementSupportSha256: supportSha,
  });
  assert.deepEqual(result, {
    refinementParentStorageId: parent,
    refinementParentSha256: parentSha,
    refinementProfile: 'REFINE_REALISM_V1',
    refinementSupportSha256: supportSha,
  });
  assert.equal(Object.isFrozen(result), true);
});

test('F5a.2 rejects noncanonical parent/support evidence and unknown profiles', () => {
  assert.throws(() => normalizeGarmentAppearanceRefinementFinalLineage({
    refinementParentStorageId: parent.toUpperCase(),
    refinementParentSha256: parentSha,
    refinementProfile: GARMENT_APPEARANCE_REFINEMENT_PROFILE,
    refinementSupportSha256: supportSha,
  }), /canonical lowercase UUID/i);

  assert.throws(() => normalizeGarmentAppearanceRefinementFinalLineage({
    refinementParentStorageId: parent,
    refinementParentSha256: parentSha.toUpperCase(),
    refinementProfile: GARMENT_APPEARANCE_REFINEMENT_PROFILE,
    refinementSupportSha256: supportSha,
  }), /canonical lowercase SHA-256/i);

  assert.throws(() => normalizeGarmentAppearanceRefinementFinalLineage({
    refinementParentStorageId: parent,
    refinementParentSha256: parentSha,
    refinementProfile: 'REFINE_OTHER' as typeof GARMENT_APPEARANCE_REFINEMENT_PROFILE,
    refinementSupportSha256: supportSha,
  }), /profile must be REFINE_REALISM_V1/i);

  assert.throws(() => normalizeGarmentAppearanceRefinementFinalLineage({
    refinementParentStorageId: parent,
    refinementParentSha256: parentSha,
    refinementProfile: GARMENT_APPEARANCE_REFINEMENT_PROFILE,
    refinementSupportSha256: '0'.repeat(63),
  }), /canonical lowercase SHA-256/i);
});
