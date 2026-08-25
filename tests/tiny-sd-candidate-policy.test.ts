import assert from 'node:assert/strict';
import test from 'node:test';
import manifest from '../src/platform/creative/local-ai/models/tiny-sd-generation.manifest.json' with { type: 'json' };
import { acquisitionCandidatesForPack } from '../src/platform/creative/local-ai/models/CandidateModelCatalog.ts';
import { productionLocalModelsByCapability } from '../server/core/localExecution/productionLocalModelPolicy.ts';
import { productionLocalExecutorsByCapability } from '../server/core/localExecution/productionLocalExecutorPolicy.ts';

const MODEL_ID = 'segmind-tiny-sd';
const REVISION = 'cad0bd7495fa6c4bcca01b19a723dc91627fe84f';

test('Tiny-SD starts as a license-review trust-root discovery candidate only', () => {
  assert.equal(manifest.modelId, MODEL_ID);
  assert.equal(manifest.version, '1.0.0-candidate.1');
  assert.equal(manifest.status, 'CANDIDATE');
  assert.equal(manifest.artifactState, 'TRUST_ROOT_DISCOVERY_REQUIRED');
  assert.equal(manifest.licenseReview, 'REQUIRED');
  assert.equal(manifest.upstream.revision, REVISION);
  assert.equal(manifest.upstream.license, 'creativeml-openrail-m');
  assert.equal(manifest.upstream.licenseState, 'LICENSE_REVIEW');
  assert.equal(manifest.upstream.pipelineClass, 'StableDiffusionPipeline');
  assert.equal(manifest.upstream.snapshot.identityState, 'DISCOVERY_REQUIRED');
  assert.equal(manifest.upstream.snapshot.files.length, 0);
  assert.equal(manifest.tensorBridge.state, 'REQUIRED');
  assert.equal(manifest.tensorBridge.hashBeforeDeserializationRequired, true);
  assert.equal(manifest.tensorBridge.weightsOnlyRequired, true);
  assert.equal(manifest.runtimeFeasibility.state, 'UNPROVEN');
  assert.equal(manifest.runtimeFeasibility.realDeviceEvidence, false);
  assert.equal(manifest.runtimeFeasibility.runtimeAuthorityGranted, false);
  assert.equal(manifest.productionApprovalEvidence, null);
});

test('Tiny-SD is advisory GENERATION discovery only and absent from production execution catalogs', () => {
  const candidate = acquisitionCandidatesForPack('GENERATION').find(value => value.modelId === MODEL_ID);
  assert.ok(candidate);
  assert.equal(candidate!.status, 'CANDIDATE');
  assert.equal(candidate!.artifactState, 'TRUST_ROOT_DISCOVERY_REQUIRED');
  assert.equal(candidate!.upstreamRevision, REVISION);
  assert.equal(candidate!.upstreamLicense, 'creativeml-openrail-m');
  assert.equal(candidate!.upstreamBytes, 'UNKNOWN');
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

test('Tiny-SD runtime snapshot contract is explicit and contains exactly three pickle-backed weights', () => {
  const files = manifest.upstream.snapshot.expectedRuntimeFiles;
  assert.equal(files.length, 12);
  assert.equal(new Set(files).size, files.length);
  const weights = files.filter(path => path.endsWith('.bin'));
  assert.deepEqual(weights.sort(), [
    'text_encoder/pytorch_model.bin',
    'unet/diffusion_pytorch_model.bin',
    'vae/diffusion_pytorch_model.bin',
  ]);
  assert.equal(files.includes('model_index.json'), true);
  assert.equal(files.includes('scheduler/scheduler_config.json'), true);
  assert.equal(files.includes('tokenizer/merges.txt'), true);
  assert.equal(files.includes('tokenizer/vocab.json'), true);
});
