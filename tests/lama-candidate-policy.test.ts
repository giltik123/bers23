import assert from 'node:assert/strict';
import test from 'node:test';
import manifest from '../src/platform/creative/local-ai/models/lama-inpainting.manifest.json' with { type: 'json' };
import { acquisitionCandidatesForPack } from '../src/platform/creative/local-ai/models/CandidateModelCatalog.ts';
import {
  isExecutableLaMaRelease,
  laMaReleaseState,
  LAMA_AUTHORITATIVE_CHECKPOINT_PINNED,
  LAMA_UPSTREAM_REVISION,
} from '../src/platform/creative/local-ai/models/LaMaRelease.ts';
import { productionLocalModelsByCapability } from '../server/core/localExecution/productionLocalModelPolicy.ts';
import { productionLocalExecutorsByCapability } from '../server/core/localExecution/productionLocalExecutorPolicy.ts';

const MODEL_ID = 'lama-big-places-inpainting';

test('Big-LaMa starts as a non-executable authoritative-acquisition CANDIDATE', () => {
  assert.equal(manifest.modelId, MODEL_ID);
  assert.equal(manifest.status, 'CANDIDATE');
  assert.equal(manifest.artifactState, 'CHECKPOINT_ACQUISITION_REQUIRED');
  assert.equal(manifest.upstream.revision, LAMA_UPSTREAM_REVISION);
  assert.equal(manifest.upstream.license, 'Apache-2.0');
  assert.equal(manifest.upstream.distribution.convenienceMirrorAuthority, false);
  assert.equal(manifest.upstream.checkpoint.identityState, 'ACQUISITION_REQUIRED');
  assert.equal(manifest.upstream.checkpoint.checkpointSha256, null);
  assert.equal(manifest.bersArtifact.state, 'UNBUILT');
  assert.equal(manifest.runtimeFeasibility.state, 'UNPROVEN');
  assert.equal(LAMA_AUTHORITATIVE_CHECKPOINT_PINNED, false);
  assert.equal(isExecutableLaMaRelease(manifest), false);
  assert.equal(laMaReleaseState.productionAvailable, false);
});

test('Big-LaMa semantic contract preserves upstream mask polarity and deterministic known-region composite', () => {
  assert.deepEqual(manifest.tensorContract.image.range, [0, 1]);
  assert.equal(manifest.tensorContract.image.channels, 3);
  assert.deepEqual(manifest.tensorContract.mask.range, [0, 1]);
  assert.equal(manifest.tensorContract.mask.channels, 1);
  assert.equal(manifest.tensorContract.mask.oneMeans, 'INPAINT_REGION');
  assert.equal(manifest.tensorContract.preprocess.padOutToModulo, 8);
  assert.equal(manifest.tensorContract.preprocess.generatorInputChannels, 4);
  assert.equal(manifest.tensorContract.preprocess.generatorInputFormula, 'concat(image * (1 - mask), mask)');
  assert.equal(manifest.tensorContract.rawOutput.semanticType, 'GENERATED_RGB_PROPOSAL');
  assert.equal(manifest.tensorContract.rawOutput.activation, 'SIGMOID');
  assert.equal(manifest.tensorContract.finalComposite.semanticType, 'DETERMINISTIC_MASK_COMPOSITE');
  assert.equal(manifest.tensorContract.finalComposite.formula, 'mask * predicted_image + (1 - mask) * original_image');
  assert.equal(manifest.tensorContract.finalComposite.knownRegionMustEqualOriginal, true);
});

test('Big-LaMa architecture and browser runtime risks are explicit instead of assumed', () => {
  const architecture = manifest.upstream.architecture;
  assert.equal(architecture.generatorKind, 'ffc_resnet');
  assert.equal(architecture.inputChannels, 4);
  assert.equal(architecture.outputChannels, 3);
  assert.equal(architecture.downsamplingStages, 3);
  assert.equal(architecture.residualBlocks, 18);
  assert.equal(architecture.globalFeatureRatio, 0.75);
  assert.equal(architecture.localFourierUnitEnabled, false);
  assert.equal(architecture.fourierForward, 'torch.fft.rfftn');
  assert.equal(architecture.fourierInverse, 'torch.fft.irfftn');
  assert.equal(manifest.runtimeFeasibility.directTorchOnnx, 'UNPROVEN_FFT_RISK');
  assert.equal(manifest.runtimeFeasibility.browserWasm, 'UNPROVEN');
  assert.equal(manifest.runtimeFeasibility.browserWebGpu, 'UNPROVEN_KNOWN_THIRD_PARTY_SHAPE_RISK');
  assert.equal(manifest.runtimeFeasibility.thirdPartyReferenceAuthority, false);
});

test('LaMa is advisory INPAINTING discovery only and absent from production executable catalogs', () => {
  const candidates = acquisitionCandidatesForPack('INPAINTING');
  const candidate = candidates.find(value => value.modelId === MODEL_ID);
  assert.ok(candidate);
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

test('forged signed/approved envelope remains impossible before authoritative checkpoint pin', () => {
  const forged = structuredClone(manifest) as any;
  forged.status = 'PRODUCTION_APPROVED';
  forged.artifactState = 'SIGNED_RELEASE';
  forged.verificationKeyId = 'forged';
  forged.productionApprovalEvidence = 'https://example.invalid/evidence';
  forged.upstream.checkpoint.identityState = 'PINNED';
  forged.upstream.checkpoint.checkpointSize = 1;
  forged.upstream.checkpoint.checkpointSha256 = 'a'.repeat(64);
  forged.upstream.checkpoint.configSize = 1;
  forged.upstream.checkpoint.configSha256 = 'b'.repeat(64);
  forged.bersArtifact = { state: 'PINNED', format: 'ONNX', size: 1, sha256: 'c'.repeat(64) };
  forged.runtimeFeasibility = { ...forged.runtimeFeasibility, state: 'VERIFIED', browserWasm: 'VERIFIED' };
  forged.artifacts.model = {
    url: 'https://example.invalid/lama.onnx',
    size: 1,
    sha256: 'c'.repeat(64),
    signatureUrl: 'https://example.invalid/lama.onnx.sig',
  };
  assert.equal(isExecutableLaMaRelease(forged), false);
});
