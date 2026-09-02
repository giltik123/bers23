import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  assertCanonicalManifestBytes,
  assertKandinskyConditioningManifest,
  canonicalJsonBytes,
  sha256Bytes,
} from '../scripts/kandinsky-conditioning-bundle-contract.mjs';

const D1_PATH = 'src/platform/creative/local-ai/models/kandinsky-2-2-refinement-feasibility.manifest.json';
const d1 = JSON.parse(fs.readFileSync(D1_PATH, 'utf8'));

function validManifest(candidateId = 'A_NEUTRAL_ZERO_NEGATIVE') {
  return {
    schemaVersion: 1,
    stage: 'F5B1_D2_CONDITIONING_RESEARCH',
    status: 'RESEARCH_CANDIDATE',
    productionExecutable: false,
    runtimeAuthorityGranted: false,
    priorRuntimeDependencyAllowed: false,
    sourceTrust: {
      d1ManifestPath: D1_PATH,
      d1ModelId: d1.modelId,
      d1Version: d1.version,
      priorRepository: d1.offlinePrior.repository,
      priorRevision: d1.offlinePrior.revision,
      priorSafeWeights: structuredClone(d1.offlinePrior.safeWeights),
      priorConfigFiles: structuredClone(d1.offlinePrior.requiredConfigIdentity.files),
    },
    historicalPipeline: {
      diffusersRevision: '746215670a61af1034c470d0b6555be9c60cb7b6',
      pipelineClass: 'KandinskyV22PriorPipeline',
      numImagesPerPrompt: 1,
      numInferenceSteps: 25,
      guidanceScale: 4,
    },
    toolchain: {
      containerImageDigest: `sha256:${'d'.repeat(64)}`,
      pythonVersion: '3.11.9-fixture',
      torchVersion: '2.0.1+cpu-fixture',
      transformersVersion: '4.30.2-fixture',
      numpyVersion: '1.24.4-fixture',
      safetensorsVersion: '0.3.1-fixture',
      platformMachine: 'x86_64-fixture',
    },
    determinism: {
      device: 'cpu',
      outputDtype: 'float32',
      torchDeterministicAlgorithms: true,
      numThreads: 1,
      numInteropThreads: 1,
      ompNumThreads: 1,
      mklNumThreads: 1,
      seed: 20260706,
    },
    conditioning: {
      candidateId,
      conditioningContractSha256: 'c'.repeat(64),
      negativeMode: candidateId === 'C_PRESERVATION_EXPLICIT_NEGATIVE' ? 'EXPLICIT_NEGATIVE_PRIOR' : 'HISTORICAL_ZERO_IMAGE',
    },
    bundle: {
      format: 'safetensors',
      metadataPolicy: 'NONE',
      tensorOrder: ['image_embeds', 'negative_image_embeds'],
      tensors: {
        image_embeds: { dtype: 'F32', shape: [1, 1280] },
        negative_image_embeds: { dtype: 'F32', shape: [1, 1280] },
      },
      size: 10320,
      sha256: 'b'.repeat(64),
    },
  };
}

test('D2a accepts only the closed research manifest and all three negative-conditioning identities', () => {
  for (const candidate of [
    'A_NEUTRAL_ZERO_NEGATIVE',
    'B_REALISM_ZERO_NEGATIVE',
    'C_PRESERVATION_EXPLICIT_NEGATIVE',
  ]) assert.equal(assertKandinskyConditioningManifest(validManifest(candidate), d1).conditioning.candidateId, candidate);
});

test('D2a binds exact D1 prior weight and executable config identities', () => {
  const weightDrift = validManifest();
  weightDrift.sourceTrust.priorSafeWeights[0].sha256 = '0'.repeat(64);
  assert.throws(() => assertKandinskyConditioningManifest(weightDrift, d1), /priorSafeWeights\[0\]\.sha256 mismatch/);

  const configDrift = validManifest();
  configDrift.sourceTrust.priorConfigFiles[0].size += 1;
  assert.throws(() => assertKandinskyConditioningManifest(configDrift, d1), /priorConfigFiles\[0\]\.size mismatch/);

  const reordered = validManifest();
  [reordered.sourceTrust.priorConfigFiles[0], reordered.sourceTrust.priorConfigFiles[1]] = [reordered.sourceTrust.priorConfigFiles[1], reordered.sourceTrust.priorConfigFiles[0]];
  assert.throws(() => assertKandinskyConditioningManifest(reordered, d1), /priorConfigFiles\[0\]\.path mismatch/);
});

test('D2a freezes the historical executable prior knobs instead of trusting the stale docstring default', () => {
  for (const [field, value] of [['numImagesPerPrompt', 2], ['numInferenceSteps', 100], ['guidanceScale', 3.5]]) {
    const manifest = validManifest();
    manifest.historicalPipeline[field] = value;
    assert.throws(() => assertKandinskyConditioningManifest(manifest, d1), new RegExp(`historicalPipeline\\.${field} mismatch`));
  }
});

test('D2a requires CPU FP32 single-thread deterministic build identity and exact toolchain versions', () => {
  const mutations = [
    (m) => { m.determinism.device = 'cuda'; },
    (m) => { m.determinism.outputDtype = 'float16'; },
    (m) => { m.determinism.torchDeterministicAlgorithms = false; },
    (m) => { m.determinism.numThreads = 2; },
    (m) => { m.toolchain.torchVersion = '>=2.0'; },
    (m) => { m.toolchain.transformersVersion = 'latest'; },
    (m) => { m.toolchain.containerImageDigest = 'ubuntu:latest'; },
  ];
  for (const mutate of mutations) {
    const manifest = validManifest();
    mutate(manifest);
    assert.throws(() => assertKandinskyConditioningManifest(manifest, d1));
  }
});

test('D2a prevents zero-image and explicit-negative mechanisms from being relabeled', () => {
  const zeroAsExplicit = validManifest('A_NEUTRAL_ZERO_NEGATIVE');
  zeroAsExplicit.conditioning.negativeMode = 'EXPLICIT_NEGATIVE_PRIOR';
  assert.throws(() => assertKandinskyConditioningManifest(zeroAsExplicit, d1), /conditioning\.negativeMode mismatch/);

  const explicitAsZero = validManifest('C_PRESERVATION_EXPLICIT_NEGATIVE');
  explicitAsZero.conditioning.negativeMode = 'HISTORICAL_ZERO_IMAGE';
  assert.throws(() => assertKandinskyConditioningManifest(explicitAsZero, d1), /conditioning\.negativeMode mismatch/);
});

test('D2a closes tensor names order dtype shape and bundle identity', () => {
  const wrongOrder = validManifest();
  wrongOrder.bundle.tensorOrder.reverse();
  assert.throws(() => assertKandinskyConditioningManifest(wrongOrder, d1), /tensorOrder/);

  const wrongDtype = validManifest();
  wrongDtype.bundle.tensors.image_embeds.dtype = 'F16';
  assert.throws(() => assertKandinskyConditioningManifest(wrongDtype, d1), /image_embeds\.dtype mismatch/);

  const inferredShape = validManifest();
  inferredShape.bundle.tensors.negative_image_embeds.shape = [];
  assert.throws(() => assertKandinskyConditioningManifest(inferredShape, d1), /actual positive dimensions/);

  const uppercaseSha = validManifest();
  uppercaseSha.bundle.sha256 = 'B'.repeat(64);
  assert.throws(() => assertKandinskyConditioningManifest(uppercaseSha, d1), /lowercase SHA-256/);
});

test('D2a immutable identity rejects run/time/host/cache metadata at any depth', () => {
  for (const [path, value] of [
    ['runId', '123'],
    ['createdAt', '2026-09-02T00:00:00Z'],
    ['hostname', 'runner-1'],
    ['cachePath', '/home/runner/.cache'],
  ]) {
    const manifest = validManifest();
    manifest.bundle[path] = value;
    assert.throws(() => assertKandinskyConditioningManifest(manifest, d1), /forbidden from immutable conditioning identity|closed schema/);
  }
});

test('D2a canonical JSON is stable and noncanonical manifest bytes fail closed', () => {
  const manifest = validManifest();
  const canonical = canonicalJsonBytes(manifest);
  assert.deepEqual(assertCanonicalManifestBytes(canonical, d1), JSON.parse(canonical.toString('utf8')));
  assert.match(sha256Bytes(canonical), /^[0-9a-f]{64}$/);
  const pretty = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  assert.throws(() => assertCanonicalManifestBytes(pretty, d1), /not canonical JSON/);
});
