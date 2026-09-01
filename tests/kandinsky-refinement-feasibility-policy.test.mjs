import assert from 'node:assert/strict';
import test from 'node:test';
import manifest from '../src/platform/creative/local-ai/models/kandinsky-2-2-refinement-feasibility.manifest.json' with { type: 'json' };
import { parseSourcePointer, MAX_SOURCE_POINTER_BYTES } from '../scripts/kandinsky-source-trust-pointer.mjs';
import { productionLocalModelsByCapability } from '../server/core/localExecution/productionLocalModelPolicy.ts';
import { productionLocalExecutorsByCapability } from '../server/core/localExecution/productionLocalExecutorPolicy.ts';

const SHA = /^[0-9a-f]{64}$/;
const MAX_CONFIG_FILE_BYTES = 5 * 1024 * 1024;

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

function assertPinnedConfigIdentity(identity, expectedFiles) {
  assert.equal(identity.state, 'PINNED');
  assert.equal(identity.maxFileBytes, MAX_CONFIG_FILE_BYTES);
  assert.deepEqual(identity.files, expectedFiles, 'config path order/size/hash are part of the closed manifest identity');
  assert.equal(new Set(identity.files.map(file => file.path)).size, identity.files.length);
  for (const file of identity.files) {
    assert.ok(Number.isSafeInteger(file.size) && file.size > 0 && file.size <= MAX_CONFIG_FILE_BYTES);
    assert.match(file.sha256, SHA);
    assert.doesNotMatch(file.path, /\.safetensors$|\.bin$/);
  }
}

test('F5b.1 pins exact safe source weights and config bytes but grants no runtime authority', () => {
  assert.equal(manifest.modelId, 'kandinsky-2-2-decoder-inpaint-refinement');
  assert.equal(manifest.version, '0.1.0-feasibility.2');
  assert.equal(manifest.status, 'CANDIDATE');
  assert.equal(manifest.artifactState, 'SOURCE_WEIGHT_AND_CONFIG_TRUST_PINNED_CONDITIONING_AND_RUNTIME_UNPROVEN');
  assert.equal(manifest.semanticOperation, 'GARMENT_APPEARANCE_REFINEMENT');
  assert.equal(manifest.refinementProfile, 'REFINE_REALISM_V1');
  assert.equal(manifest.productionExecutable, false);
  assert.equal(manifest.runtimeAuthorityGranted, false);
  assert.equal(manifest.productionApprovalEvidence, null);
  assert.equal(manifest.licenseReview.identifier, 'apache-2.0');
  assert.equal(manifest.licenseReview.productionApprovalGranted, false);
});

test('F5b.1 decoder source-weight and executable-config trust roots are exact', () => {
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
  assertPinnedConfigIdentity(manifest.decoder.requiredConfigIdentity, [
    { path: 'model_index.json', size: 257, sha256: '6dfda60c9ec616ddd4f38cdf01a2adf3e1c6cf074e925f7bb77980d543aee8b1' },
    { path: 'unet/config.json', size: 1665, sha256: '35e05e11683958668f34f2d99fb63524c26863f5d21257fda3c4a684e9f3131d' },
    { path: 'movq/config.json', size: 660, sha256: 'b7448f3ea8aecf233629b20c1f606887e22244656edcee1be6a419079717a23e' },
    { path: 'scheduler/scheduler_config.json', size: 318, sha256: '801b60ec20835a36bf8c0cd2dab9f2c72d0b938ec87202a6b5b3eeb2714e1b97' },
  ]);
  assert.equal(manifest.decoder.configInventoryEvidence, 'docs/fashion-f5b1-config-inventory.md');
  assert.equal(manifest.decoder.fp16Package, null);
  assert.equal(manifest.decoder.nativeRuntimeEvidence, null);
});

test('F5b.1 prior is offline-only exact source/config trust evidence', () => {
  assert.equal(manifest.offlinePrior.repository, 'kandinsky-community/kandinsky-2-2-prior');
  assert.equal(manifest.offlinePrior.revision, '40cd65123bb828e5641b118b77b38be1aee69891');
  assert.equal(manifest.offlinePrior.purpose, 'BUILD_RESEARCH_ONLY_CONDITIONING_GENERATION');
  assert.equal(manifest.offlinePrior.runtimeDependencyAllowed, false);
  assert.equal(manifest.offlinePrior.safeWeightBytes, 10_573_556_608);
  assertSafeWeights(manifest.offlinePrior.safeWeights);
  assert.equal(manifest.offlinePrior.safeWeights.reduce((sum, file) => sum + file.size, 0), manifest.offlinePrior.safeWeightBytes);
  assertPinnedConfigIdentity(manifest.offlinePrior.requiredConfigIdentity, [
    { path: 'model_index.json', size: 501, sha256: '26cba76e560b6da612d65b8e7beac9be04442df8df2e1743b8466454988d1f5e' },
    { path: 'prior/config.json', size: 252, sha256: 'e36f9ae41677b87a8ca72853f1246704228c49c280adcfa8a8e100ef47d2ee5a' },
    { path: 'scheduler/scheduler_config.json', size: 229, sha256: '5ba056e705a3317f60d79a3756a3409b0a53f1129b76a6aa5097ce9f513d143e' },
    { path: 'image_encoder/config.json', size: 2013, sha256: '1d53c2b4b74c5f85171d313adda3e3b8771ff5c698ee66a29710d0ac822298e4' },
    { path: 'image_processor/preprocessor_config.json', size: 315, sha256: '0a70aaa5de2ccb5e222b0e7e3ea347a3da051c3588c763cdd23b4d80bbf96b65' },
    { path: 'text_encoder/config.json', size: 2017, sha256: '3dec84fa855c0b7f531eea433e805a1194086c38c5635baceda8cbed4f727f1b' },
    { path: 'tokenizer/tokenizer_config.json', size: 904, sha256: 'e19f34ef773563fb695f96cfcae1e4c7b112ab6ad532f6962061df5242d924f0' },
    { path: 'tokenizer/special_tokens_map.json', size: 389, sha256: 'f8c0d6c39aee3f8431078ef6646567b0aba7f2246e9c54b8b99d55c22b707cbf' },
    { path: 'tokenizer/vocab.json', size: 862328, sha256: '5047b556ce86ccaf6aa22b3ffccfc52d391ea4accdab9c2f2407da5b742d4363' },
    { path: 'tokenizer/merges.txt', size: 524619, sha256: '9fd691f7c8039210e0fced15865466c65820d09b63988b0174bfe25de299051a' },
  ]);
  assert.equal(manifest.offlinePrior.configInventoryEvidence, 'docs/fashion-f5b1-config-inventory.md');
});

test('F5b.1 closed conditioning and local runtime remain explicitly unproven after D1.2', () => {
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

test('F5b.1 source trust parser binds exact content SHA-256 and size, not Xet identity', () => {
  const sha = manifest.decoder.safeWeights[0].sha256;
  const size = manifest.decoder.safeWeights[0].size;
  const pointer = [
    'version https://git-lfs.github.com/spec/v1',
    `oid sha256:${sha.toUpperCase()}`,
    `size ${size}`,
    'xet-hash 0123456789abcdef',
    '',
  ].join('\n');
  assert.deepEqual(parseSourcePointer(pointer, 'fixture'), { sha256: sha, size });
  assert.throws(() => parseSourcePointer(`version https://git-lfs.github.com/spec/v1\nsize ${size}\n`, 'fixture'), /exactly one oid/i);
  assert.throws(() => parseSourcePointer(`version https://git-lfs.github.com/spec/v1\noid sha256:${sha}\noid sha256:${sha}\nsize ${size}\n`, 'fixture'), /exactly one oid/i);
  assert.throws(() => parseSourcePointer(`version https://git-lfs.github.com/spec/v1\noid sha256:${sha}\nsize 0\n`, 'fixture'), /positive size/i);
  assert.throws(() => parseSourcePointer('x'.repeat(MAX_SOURCE_POINTER_BYTES + 1), 'fixture'), /bounded pointer size/i);
  assert.throws(() => parseSourcePointer('<html>not a pointer</html>', 'fixture'), /not a Git LFS pointer/i);
});
