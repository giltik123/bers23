import assert from 'node:assert/strict';
import test from 'node:test';
import {
  KANDINSKY_D2B_CANDIDATES,
  CONDITIONING_CANDIDATE_IDS,
  KANDINSKY_HISTORICAL_DIFFUSERS_REVISION,
  KANDINSKY_INPAINT_PIPELINE_BLOB_SHA,
  KANDINSKY_PRIOR_PIPELINE_BLOB_SHA,
  assertKandinskyD2bCandidateMatrix,
  conditioningPromptContract,
} from '../scripts/kandinsky-conditioning-prompt-contract.mjs';
import { conditioningCandidateIdentity } from '../scripts/kandinsky-conditioning-candidate-registry.mjs';

const expectedHashes = Object.freeze({
  A_NEUTRAL_ZERO_NEGATIVE: '85bea25dc00c2e23c4c2cf9e41a2a0531e93a19059d4dc3fa0c9208c766217e4',
  B_REALISM_ZERO_NEGATIVE: 'd0dc3f97e84e7439c063f5fbcb1c3eae9b668c3d84dd8adfa1ed116837e3f175',
  C_PRESERVATION_EXPLICIT_NEGATIVE: '804544da31ad9765793d830225fcad7119058965b665349170f2123474541f30',
});

test('F5b.1 D2b pins a controlled A/B/C prompt-semantics matrix', () => {
  assert.equal(assertKandinskyD2bCandidateMatrix(), true);
  assert.deepEqual(CONDITIONING_CANDIDATE_IDS, [
    'A_NEUTRAL_ZERO_NEGATIVE',
    'B_REALISM_ZERO_NEGATIVE',
    'C_PRESERVATION_EXPLICIT_NEGATIVE',
  ]);
  assert.equal(KANDINSKY_D2B_CANDIDATES.B_REALISM_ZERO_NEGATIVE.positivePrompt, KANDINSKY_D2B_CANDIDATES.C_PRESERVATION_EXPLICIT_NEGATIVE.positivePrompt);
  assert.equal(KANDINSKY_D2B_CANDIDATES.A_NEUTRAL_ZERO_NEGATIVE.negativePrompt, null);
  assert.equal(KANDINSKY_D2B_CANDIDATES.B_REALISM_ZERO_NEGATIVE.negativePrompt, null);
  assert.match(KANDINSKY_D2B_CANDIDATES.C_PRESERVATION_EXPLICIT_NEGATIVE.negativePrompt, /changed silhouette/);
});

test('F5b.1 D2b conditioning identities are immutable, distinct and shared with D2a', () => {
  const observed = new Set();
  for (const id of CONDITIONING_CANDIDATE_IDS) {
    const { contract, sha256 } = conditioningPromptContract(id);
    const identity = conditioningCandidateIdentity(id);
    assert.equal(sha256, expectedHashes[id]);
    assert.equal(sha256, identity.conditioningContractSha256);
    assert.equal(contract.candidateId, id);
    assert.equal(contract.negativeMode, identity.negativeMode);
    assert.equal(contract.positiveEmbeddingSourceCandidateId, identity.positiveEmbeddingSourceCandidateId);
    assert.equal(contract.prior.diffusersRevision, KANDINSKY_HISTORICAL_DIFFUSERS_REVISION);
    assert.deepEqual(contract.decoder.embeddingOrder, ['negative_image_embeds', 'image_embeds']);
    observed.add(sha256);
  }
  assert.equal(observed.size, 3);
});

test('F5b.1 D2b C reuses B positive embedding so B/C differ only by negative conditioning', () => {
  const b = conditioningPromptContract('B_REALISM_ZERO_NEGATIVE').contract;
  const c = conditioningPromptContract('C_PRESERVATION_EXPLICIT_NEGATIVE').contract;
  assert.equal(c.positivePrompt, b.positivePrompt);
  assert.equal(b.positiveEmbeddingSourceCandidateId, null);
  assert.equal(c.positiveEmbeddingSourceCandidateId, 'B_REALISM_ZERO_NEGATIVE');
  assert.equal(b.negativeMode, 'HISTORICAL_ZERO_IMAGE');
  assert.equal(c.negativeMode, 'EXPLICIT_NEGATIVE_PRIOR');
  assert.equal(b.negativePrompt, null);
  assert.equal(typeof c.negativePrompt, 'string');
});

test('F5b.1 D2b pins the exact historical source blobs that define prior and decoder conditioning semantics', () => {
  assert.equal(KANDINSKY_PRIOR_PIPELINE_BLOB_SHA, '3b9974a5dd70e8b775caa01efab6b637ff22d9e5');
  assert.equal(KANDINSKY_INPAINT_PIPELINE_BLOB_SHA, '151312979f815d6354b9d5207cba999fe26e43a7');
});
