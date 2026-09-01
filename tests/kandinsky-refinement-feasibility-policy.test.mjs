import assert from 'node:assert/strict';
import test from 'node:test';
import manifest from '../src/platform/creative/local-ai/models/kandinsky-2-2-refinement-feasibility.manifest.json' with { type: 'json' };
import { productionLocalModelsByCapability } from '../server/core/localExecution/productionLocalModelPolicy.ts';
import { productionLocalExecutorsByCapability } from '../server/core/localExecution/productionLocalExecutorPolicy.ts';

const SHA = /^[0-9a-f]{64}$/;

function assertSafeWeights(files) {
  assert.ok(files.length > 0);
  assert.equal(new Set(files.map(file => file.path)).size, files.length);
  for (const file of files) {
    assert.match(file.path, /\.safetensors$/);
    assert.doesNotMatch(file.path, /\.bin$/);
    assert.ok(Number.isSafeInteger(file.size) && file.size > 0);
    assert.match(file.sha256, SHA);
  }
}

test('F5b.1 pins exact safe source weights but grants no runtime authority', () => {
  assert.equal(manifest.modelId, 'kandinsky-2-2-decoder-inpaint-refinement');
  assert.equal(manifest.status, 'CANDIDATE');
  assert.equal(manifest.artifactState, 'SOURCE_WEIGHT_TRUST_PINNED_CONFIG_AND_RUNTIME_UNPROVEN');
  assert.equal(manifest.semanticOperation, 'GARMENT_APPEARANCE_REFINEMENT');
  assert.equal(manifest.refinementProfile, 'REFINE_REALISM_V1');
  assert.equal(manifest.productionExecutable, false);
  assert.equal(manifest.runtimeAuthorityGranted, false);
  assert.equal(manifest.productionApprovalEvidence, null);
  assert.equal(manifest.licenseReview.identifier, 'apache-2.0');
  assert.equal(manifest.licenseReview.productionApprovalGranted, false);
});

test('F5b.1 decoder safetensors trust root is exact and still config-unproven', () => {
  assert.equal(manifest.decoder.repository, 'kandinsky-community/kandinsky-2-2-decoder-inpaint');
  assert.equal(manifest.decoder.revision, 'aad71de4002729023f7ecb6899dfad5246c02b44');
  assert.equal(manifest.decoder.pipelineClass, 'KandinskyV22InpaintPipeline');
  assert.equal(manifest.decoder.safeWeightBytes, 5_283_759_068);
  assertSafeWeights(manifest.decoder.safeWeights);
  assert.equal(manifest.decoder.safeWeights.reduce((sum, file) => sum + file.size, 0), manifest.decoder.safeWeightBytes);
  assert.deepEqual(manifest.decoder.safeWeights, [
    {
      path: 'unet/diffusion_pytorch_model.safetensors',
      size: 5_012_378_704,
      sha256: '098b846d2378b4b44a33e0bd47f89f2886b72a10200cbf9e96d5fae3c471543f',
    },
    {
      path: 'movq/diffusion_pytorch_model.safetensors',
      size: 271_380_364,
      sha256: '43a5860fea195a7116f2471396c5cc9535fade9b63c4857d8a192ffd924b7002',
    },
  ]);
  assert.equal(manifest.decoder.requiredConfigIdentity, 'UNPINNED');
  assert.equal(manifest.decoder.fp16Package, null);
  assert.equal(manifest.decoder.nativeRuntimeEvidence, null);
});

test('F5b.1 prior is offline-only pinned safetensors evidence', () => {
  assert.equal(manifest.offlinePrior.repository, 'kandinsky-community/kandinsky-2-2-prior');
  assert.equal(manifest.offlinePrior.revision, '40cd65123bb828e5641b118b77b38be1aee69891');
  assert.equal(manifest.offlinePrior.purpose, 'BUILD_RESEARCH_ONLY_CONDITIONING_GENERATION');
  assert.equal(manifest.offlinePrior.runtimeDependencyAllowed, false);
  assert.equal(manifest.offlinePrior.safeWeightBytes, 10_573_556_608);
  assertSafeWeights(manifest.offlinePrior.safeWeights);
  assert.equal(manifest.offlinePrior.safeWeights.reduce((sum, file) => sum + file.size, 0), manifest.offlinePrior.safeWeightBytes);
  assert.equal(manifest.offlinePrior.requiredConfigIdentity, 'UNPINNED');
});

test('F5b.1 closed conditioning and local runtime remain explicitly unproven', () => {
  assert.equal(manifest.securityPolicy.pickleWeightsAllowed, false);
  assert.equal(manifest.securityPolicy.safetensorsRequired, true);
  assert.equal(manifest.securityPolicy.hashBeforeUseRequired, true);
  assert.equal(manifest.securityPolicy.repositoryWeightsPublishedByBERS, false);
  assert.equal(manifest.conditioning.state, 'UNPROVEN');
  assert.equal(manifest.conditioning.runtimePromptAllowed, false);
  assert.equal(manifest.conditioning.runtimeNegativePromptAllowed, false);
  assert.equal(manifest.conditioning.runtimePriorAllowed, false);
  assert.equal(manifest.conditioning.bundle, null);
  assert.equal(manifest.conditioning.decoderOnlyParity, null);
  assert.equal(manifest.feasibility.primaryRuntimeTier, 'NATIVE_LOCAL');
  assert.equal(manifest.feasibility.browserDefaultCandidate, false);
  assert.equal(manifest.feasibility.realImageQualityEvidence, false);
  assert.equal(manifest.feasibility.decision, 'UNPROVEN');
});

test('F5b.1 candidate is absent from every production model/executor catalog', () => {
  for (const models of Object.values(productionLocalModelsByCapability)) {
    assert.equal(models.some(model => model.modelId === manifest.modelId), false);
  }
  for (const executors of Object.values(productionLocalExecutorsByCapability)) {
    assert.equal(executors.some(executor => executor.kind === 'MODEL' && executor.modelId === manifest.modelId), false);
  }
});
