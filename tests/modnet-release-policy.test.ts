import assert from 'node:assert/strict';
import test from 'node:test';
import manifest from '../src/platform/creative/local-ai/models/portrait-matting.manifest.json' with { type: 'json' };
import { acquisitionCandidatesForPack } from '../src/platform/creative/local-ai/models/CandidateModelCatalog.ts';
import { isExecutableModNetRelease, modNetReleaseState } from '../src/platform/creative/local-ai/models/ModNetRelease.ts';
import { productionLocalModelsByCapability } from '../server/core/localExecution/productionLocalModelPolicy.ts';
import { productionLocalExecutorsByCapability } from '../server/core/localExecution/productionLocalExecutorPolicy.ts';

const MODEL_ID = 'modnet-photographic-portrait-matting';
const CHECKPOINT_SHA = '7c22235f0925deba15d4d63e53afcb654c47055bbcd98f56e393ab2584007ed8';

test('MODNet pins authoritative checkpoint identity while remaining a non-executable continuous-alpha CANDIDATE', () => {
  assert.equal(manifest.modelId, MODEL_ID);
  assert.equal(manifest.status, 'CANDIDATE');
  assert.equal(manifest.artifactState, 'CHECKPOINT_PINNED_EXPORT_REQUIRED');
  assert.equal(manifest.upstream.revision, '28165a451e4610c9d77cfdf925a94610bb2810fb');
  assert.equal(manifest.upstream.license, 'Apache-2.0');
  assert.equal(manifest.upstream.checkpoint.name, 'modnet_photographic_portrait_matting.ckpt');
  assert.equal(manifest.upstream.checkpoint.authoritativeDriveFileId, '1mcr7ALciuAsHCpLnrtG_eop5-EYhbCmz');
  assert.equal(manifest.upstream.checkpoint.identityState, 'PINNED');
  assert.equal(manifest.upstream.checkpoint.size, 26255603);
  assert.equal(manifest.upstream.checkpoint.sha256, CHECKPOINT_SHA);
  assert.equal(manifest.upstream.checkpoint.stateDictKeyCount, 751);
  assert.equal(manifest.upstream.checkpoint.parameterElementCount, 8780012);
  assert.equal(manifest.upstream.checkpoint.strictPinnedArchitectureLoad, true);
  assert.equal(manifest.tensorContract.output.semanticType, 'CONTINUOUS_ALPHA_MATTE');
  assert.equal(manifest.tensorContract.output.activation, 'SIGMOID');
  assert.equal(manifest.tensorContract.output.threshold, null);
  assert.deepEqual(manifest.tensorContract.output.range, [0, 1]);
  assert.equal(manifest.bersExport.state, 'UNBUILT');
  assert.equal(isExecutableModNetRelease(manifest), false);
  assert.equal(modNetReleaseState.productionAvailable, false);
});

test('MODNet is advisory MATTING discovery only and is absent from executable catalogs', () => {
  const [candidate] = acquisitionCandidatesForPack('MATTING');
  assert.equal(candidate.modelId, MODEL_ID);
  assert.equal(candidate.upstreamBytes, 26255603);
  assert.equal(candidate.productionExecutable, false);
  assert.equal('downloadUri' in candidate, false);
  assert.equal('signature' in candidate, false);
  assert.equal('runtime' in candidate, false);

  for (const models of Object.values(productionLocalModelsByCapability)) {
    assert.equal(models.some(model => model.modelId === MODEL_ID), false);
  }
  for (const executors of Object.values(productionLocalExecutorsByCapability)) {
    assert.equal(executors.some(executor => executor.kind === 'MODEL' && executor.modelId === MODEL_ID), false);
  }
});

test('status/signature envelope cannot promote MODNet before reproducible export identity is pinned', () => {
  const forged = structuredClone(manifest) as any;
  forged.status = 'PRODUCTION_APPROVED';
  forged.artifactState = 'SIGNED_RELEASE';
  forged.verificationKeyId = 'bers-portrait-matting-release-2026-08';
  forged.productionApprovalEvidence = 'https://github.com/giltik123/bers23/issues/999';
  forged.artifacts.model = {
    url: 'https://github.com/giltik123/bers23/releases/download/modnet-v1/model.onnx',
    size: 1,
    sha256: 'a'.repeat(64),
    signatureUrl: 'https://github.com/giltik123/bers23/releases/download/modnet-v1/model.onnx.sig',
  };
  assert.equal(isExecutableModNetRelease(forged), false, 'UNBUILT export must block promotion even with a signed envelope');

  forged.bersExport.state = 'PINNED';
  forged.bersExport.onnxSize = 1;
  forged.bersExport.onnxSha256 = 'a'.repeat(64);
  assert.equal(isExecutableModNetRelease(forged), true);

  forged.artifacts.model.sha256 = 'c'.repeat(64);
  assert.equal(isExecutableModNetRelease(forged), false, 'signed artifact must match pinned reproducible export identity');
});
