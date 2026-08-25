import assert from 'node:assert/strict';
import test from 'node:test';
import { acquisitionCandidatesForPack, LOCAL_MODEL_ACQUISITION_CANDIDATES } from '../src/platform/creative/local-ai/models/CandidateModelCatalog';
import { modelPack } from '../src/platform/creative/local-ai/models/ModelPacks';

test('EfficientSAM is visible as an advisory segmentation acquisition candidate', () => {
  const candidates = acquisitionCandidatesForPack('SEGMENTATION');
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].modelId, 'efficient-sam-ti');
  assert.equal(candidates[0].version, '1.0.0-candidate.1');
  assert.equal(candidates[0].upstreamRevision, 'd525f622e6f640acf5a0fc37c7ca1f243da5bde0');
  assert.equal(candidates[0].upstreamLicense, 'Apache-2.0');
  assert.equal(candidates[0].upstreamBytes, 41_365_489);
  assert.equal(candidates[0].productionExecutable, false);
  assert.equal(modelPack('SEGMENTATION').family, 'MobileSAM/EfficientSAM ONNX');
});

test('acquisition candidate is not an installable ModelManifest or READY fleet authority', () => {
  const candidate = LOCAL_MODEL_ACQUISITION_CANDIDATES[0] as unknown as Record<string, unknown>;
  for (const forbidden of ['downloadUri', 'sha256', 'signature', 'runtime', 'supportedPlatforms', 'supportedAccelerators', 'requiredRam', 'requiredVram']) {
    assert.equal(Object.hasOwn(candidate, forbidden), false, `${forbidden} must not exist on acquisition metadata`);
  }
  assert.equal(candidate.status, 'CANDIDATE');
  assert.notEqual(candidate.status, 'READY');
  assert.equal(Object.isFrozen(LOCAL_MODEL_ACQUISITION_CANDIDATES), true);
  assert.equal(Object.isFrozen(acquisitionCandidatesForPack('SEGMENTATION')), true);
});
