import assert from 'node:assert/strict';
import test from 'node:test';
import manifest from '../src/platform/creative/local-ai/models/tiny-sd-generation.manifest.json' with { type: 'json' };
import { acquisitionCandidatesForPack } from '../src/platform/creative/local-ai/models/CandidateModelCatalog.ts';
import { productionLocalModelsByCapability } from '../server/core/localExecution/productionLocalModelPolicy.ts';
import { productionLocalExecutorsByCapability } from '../server/core/localExecution/productionLocalExecutorPolicy.ts';

const MODEL_ID = 'segmind-tiny-sd';
const REVISION = 'cad0bd7495fa6c4bcca01b19a723dc91627fe84f';
const RUNTIME_BYTES = 1_062_108_664;
const ARTIFACT_STATE = 'TRUST_ROOT_PINNED_RUNTIME_FEASIBILITY_REQUIRED';

test('Tiny-SD has a byte-pinned trust root but still no runtime or production authority', () => {
  assert.equal(manifest.modelId, MODEL_ID);
  assert.equal(manifest.version, '1.0.0-candidate.1');
  assert.equal(manifest.status, 'CANDIDATE');
  assert.equal(manifest.artifactState, ARTIFACT_STATE);
  assert.equal(manifest.licenseReview, 'REVIEWED_WITH_USE_AND_REDISTRIBUTION_OBLIGATIONS');
  assert.equal(manifest.licenseReviewEvidence.licenseIdentifier, 'creativeml-openrail-m');
  assert.equal(manifest.licenseReviewEvidence.productionApprovalGranted, false);
  assert.equal(manifest.upstream.revision, REVISION);
  assert.equal(manifest.upstream.license, 'creativeml-openrail-m');
  assert.equal(manifest.upstream.licenseState, 'REVIEWED_WITH_OBLIGATIONS');
  assert.equal(manifest.upstream.pipelineClass, 'StableDiffusionPipeline');
  assert.equal(manifest.upstream.snapshot.identityState, 'PINNED');
  assert.equal(manifest.upstream.snapshot.totalRuntimeBytes, RUNTIME_BYTES);
  assert.equal(manifest.upstream.snapshot.files.length, 12);
  assert.equal(manifest.tensorBridge.state, 'PINNED');
  assert.equal(manifest.tensorBridge.hashBeforeDeserializationRequired, true);
  assert.equal(manifest.tensorBridge.weightsOnlyRequired, true);
  assert.equal(manifest.tensorBridge.pickleFree, true);
  assert.equal(manifest.tensorBridge.ephemeral, true);
  assert.equal(manifest.tensorBridge.published, false);
  assert.equal(manifest.tensorBridge.components.length, 3);
  assert.equal(manifest.runtimeFeasibility.state, 'UNPROVEN');
  assert.equal(manifest.runtimeFeasibility.realDeviceEvidence, false);
  assert.equal(manifest.runtimeFeasibility.runtimeAuthorityGranted, false);
  assert.equal(manifest.productionApprovalEvidence, null);
});

test('Tiny-SD remains advisory GENERATION metadata and is absent from production execution catalogs', () => {
  const candidate = acquisitionCandidatesForPack('GENERATION').find(value => value.modelId === MODEL_ID);
  assert.ok(candidate);
  assert.equal(candidate!.status, 'CANDIDATE');
  assert.equal(candidate!.artifactState, ARTIFACT_STATE);
  assert.equal(candidate!.upstreamRevision, REVISION);
  assert.equal(candidate!.upstreamLicense, 'creativeml-openrail-m');
  assert.equal(candidate!.upstreamBytes, RUNTIME_BYTES);
  assert.equal(candidate!.productionExecutable, false);
  assert.equal('downloadUri' in candidate!, false);
  assert.equal('signature' in candidate!, false);
  assert.equal('runtime' in candidate!, false);

  for (const models of Object.values(productionLocalModelsByCapability)) {
    assert.equal(models.some(model => model.modelId === MODEL_ID), false);
  }
  for (const executors of Object.values(productionLocalExecutorsByCapability)) {
    assert.equal(executors.some(executor => executor.kind === 'MODEL' && executor.modelId === MODEL_ID), false);
  }
});

test('Tiny-SD pinned snapshot and tensor bridge remain exact and internally bound', () => {
  const expectedFiles = manifest.upstream.snapshot.expectedRuntimeFiles;
  const pinnedFiles = manifest.upstream.snapshot.files;
  assert.equal(expectedFiles.length, 12);
  assert.equal(new Set(expectedFiles).size, expectedFiles.length);
  assert.deepEqual(pinnedFiles.map(file => file.path), expectedFiles);
  assert.equal(pinnedFiles.reduce((sum, file) => sum + file.size, 0), RUNTIME_BYTES);
  assert.equal(pinnedFiles.every(file => file.size > 0 && /^[0-9a-f]{64}$/.test(file.sha256)), true);

  const weights = pinnedFiles.filter(file => file.kind === 'PICKLE_WEIGHT');
  assert.deepEqual(weights.map(file => file.path).sort(), [
    'text_encoder/pytorch_model.bin',
    'unet/diffusion_pytorch_model.bin',
    'vae/diffusion_pytorch_model.bin',
  ]);

  const bridgeBySource = new Map(manifest.tensorBridge.components.map(component => [component.sourcePath, component]));
  for (const weight of weights) {
    const component = bridgeBySource.get(weight.path);
    assert.ok(component);
    assert.equal(component!.sourceSize, weight.size);
    assert.equal(component!.sourceSha256, weight.sha256);
    assert.ok(component!.keyCount > 0);
    assert.ok(component!.tensorElements > 0);
    assert.ok(component!.bridgeSize > 0);
    assert.match(component!.bridgeSha256, /^[0-9a-f]{64}$/);
  }
});
