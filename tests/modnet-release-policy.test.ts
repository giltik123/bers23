import assert from 'node:assert/strict';
import test from 'node:test';
import manifest from '../src/platform/creative/local-ai/models/portrait-matting.manifest.json' with { type: 'json' };
import { acquisitionCandidatesForPack } from '../src/platform/creative/local-ai/models/CandidateModelCatalog.ts';
import {
  isExecutableModNetRelease,
  modNetReleaseState,
  MODNET_ONNX_SHA256,
  MODNET_ONNX_SIZE,
} from '../src/platform/creative/local-ai/models/ModNetRelease.ts';
import { productionLocalModelsByCapability } from '../server/core/localExecution/productionLocalModelPolicy.ts';
import { productionLocalExecutorsByCapability } from '../server/core/localExecution/productionLocalExecutorPolicy.ts';

const MODEL_ID = 'modnet-photographic-portrait-matting';
const CHECKPOINT_SHA = '7c22235f0925deba15d4d63e53afcb654c47055bbcd98f56e393ab2584007ed8';

test('MODNet candidate.2 pins the no-folding cross-host reproducible ONNX while remaining non-executable', () => {
  assert.equal(manifest.modelId, MODEL_ID);
  assert.equal(manifest.version, '1.0.0-candidate.2');
  assert.equal(manifest.status, 'CANDIDATE');
  assert.ok(manifest.artifactState === 'EXPORT_PINNED_RELEASE_REQUIRED' || manifest.artifactState === 'SIGNED_RELEASE');
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
  assert.equal(manifest.upstream.onnx.authoritativeReference.size, 25888640);
  assert.equal(manifest.upstream.onnx.authoritativeReference.sha256, '07c308cf0fc7e6e8b2065a12ed7fc07e1de8febb7dc7839d7b7f15dd66584df9');
  assert.equal(manifest.upstream.onnx.authoritativeReference.opset, 11);
  assert.equal(manifest.tensorContract.output.semanticType, 'CONTINUOUS_ALPHA_MATTE');
  assert.equal(manifest.tensorContract.output.activation, 'SIGMOID');
  assert.equal(manifest.tensorContract.output.threshold, null);
  assert.deepEqual(manifest.tensorContract.output.range, [0, 1]);
  assert.equal(manifest.bersExport.state, 'PINNED');
  assert.equal(manifest.bersExport.constantFolding, false);
  assert.equal(manifest.bersExport.onnxSize, MODNET_ONNX_SIZE);
  assert.equal(manifest.bersExport.onnxSha256, MODNET_ONNX_SHA256);
  assert.equal(manifest.bersExport.opset, 17);
  assert.deepEqual(manifest.bersExport.crossHostReproducibility, {
    independentHostedRunners: 3,
    independentExportsPerRunner: 2,
    classification: 'BYTE_IDENTICAL',
    initializerDriftChangedCount: 0,
    evidenceRunId: 33344102365,
  });
  assert.equal(manifest.productionApprovalEvidence, null);

  if (manifest.artifactState === 'EXPORT_PINNED_RELEASE_REQUIRED') {
    assert.equal(manifest.artifacts.model.url, null);
    assert.equal(manifest.artifacts.model.signatureUrl, null);
    assert.equal(manifest.verificationKeyId, null);
  } else {
    assert.equal(manifest.artifacts.model.size, MODNET_ONNX_SIZE);
    assert.equal(manifest.artifacts.model.sha256, MODNET_ONNX_SHA256);
    assert.equal(typeof manifest.artifacts.model.url, 'string');
    assert.equal(typeof manifest.artifacts.model.signatureUrl, 'string');
    assert.equal(typeof manifest.verificationKeyId, 'string');
  }
  assert.equal(isExecutableModNetRelease(manifest), false, 'CANDIDATE cannot become production executable merely by publishing a signed pack');
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

test('future executable envelope is bound to candidate.2 bytes and the no-folding export strategy', () => {
  const approved = structuredClone(manifest) as any;
  approved.status = 'PRODUCTION_APPROVED';
  approved.artifactState = 'SIGNED_RELEASE';
  approved.verificationKeyId = 'bers-portrait-matting-release-2026-08';
  approved.productionApprovalEvidence = 'https://github.com/giltik123/bers23/issues/999';
  approved.artifacts.model = {
    url: 'https://github.com/giltik123/bers23/releases/download/modnet-v1/modnet-photographic-portrait-matting.onnx',
    size: MODNET_ONNX_SIZE,
    sha256: MODNET_ONNX_SHA256,
    signatureUrl: 'https://github.com/giltik123/bers23/releases/download/modnet-v1/modnet-photographic-portrait-matting.onnx.sig',
  };
  assert.equal(isExecutableModNetRelease(approved), true, 'complete future envelope is structurally executable only after separate approval evidence');

  const mutations = [
    (value: any) => { value.version = '1.0.0-candidate.1'; },
    (value: any) => { value.upstream.revision = '0'.repeat(40); },
    (value: any) => { value.upstream.checkpoint.sha256 = 'b'.repeat(64); },
    (value: any) => { value.upstream.checkpoint.size += 1; },
    (value: any) => { value.bersExport.constantFolding = true; },
    (value: any) => { value.bersExport.onnxSha256 = 'c'.repeat(64); },
    (value: any) => { value.bersExport.onnxSize += 1; },
    (value: any) => { value.artifacts.model.sha256 = 'd'.repeat(64); },
    (value: any) => { value.artifacts.model.size += 1; },
    (value: any) => { value.productionApprovalEvidence = null; },
  ];
  for (const mutate of mutations) {
    const invalid = structuredClone(approved);
    mutate(invalid);
    assert.equal(isExecutableModNetRelease(invalid), false);
  }
});
