import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  canonicalJsonBytes,
} from '../scripts/kandinsky-conditioning-bundle-contract.mjs';
import { conditioningCandidateIdentity } from '../scripts/kandinsky-conditioning-candidate-registry.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const FINALIZER = path.join(ROOT, 'scripts/kandinsky-conditioning-reproduction-finalize.mjs');
const D1_PATH = path.join(ROOT, 'src/platform/creative/local-ai/models/kandinsky-2-2-refinement-feasibility.manifest.json');
const D1_BYTES = fs.readFileSync(D1_PATH);
const D1 = JSON.parse(D1_BYTES.toString('utf8'));
const D1_SHA = sha256(D1_BYTES);
const TOOLCHAIN = Object.freeze({
  containerImageDigest: `sha256:${'a'.repeat(64)}`,
  pythonVersion: '3.12.11',
  diffusersVersion: '0.18.0.dev0',
  torchVersion: '2.7.1+cpu',
  transformersVersion: '4.52.4',
  numpyVersion: '2.2.6',
  safetensorsVersion: '0.5.3',
  platformMachine: 'x86_64',
});
const DETERMINISM = Object.freeze({
  device: 'cpu', outputDtype: 'float32', torchDeterministicAlgorithms: true,
  numThreads: 1, numInteropThreads: 1, ompNumThreads: 1, mklNumThreads: 1,
  seed: 1729, generatorPolicy: 'TORCH_CPU_GENERATOR_SINGLE_SEED', latentPolicy: 'NO_EXTERNAL_LATENTS_PIPELINE_RANDN',
});

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function rawF32(values) {
  const bytes = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => bytes.writeFloatLE(value, index * 4));
  return bytes;
}

function makeBundle(imageValues, negativeValues) {
  const image = rawF32(imageValues);
  const negative = rawF32(negativeValues);
  const header = Buffer.from(JSON.stringify({
    image_embeds: { dtype: 'F32', shape: [1, imageValues.length], data_offsets: [0, image.length] },
    negative_image_embeds: { dtype: 'F32', shape: [1, negativeValues.length], data_offsets: [image.length, image.length + negative.length] },
  }), 'utf8');
  const prefix = Buffer.alloc(8);
  prefix.writeBigUInt64LE(BigInt(header.length));
  return Object.freeze({
    bytes: Buffer.concat([prefix, header, image, negative]),
    image,
    negative,
    shape: [1, imageValues.length],
  });
}

function makeManifest(candidateId, bundle) {
  const identity = conditioningCandidateIdentity(candidateId);
  return Object.freeze({
    schemaVersion: 1,
    stage: 'F5B1_D2_CONDITIONING_RESEARCH',
    status: 'RESEARCH_CANDIDATE',
    productionExecutable: false,
    runtimeAuthorityGranted: false,
    priorRuntimeDependencyAllowed: false,
    sourceTrust: Object.freeze({
      d1ManifestPath: 'src/platform/creative/local-ai/models/kandinsky-2-2-refinement-feasibility.manifest.json',
      d1ModelId: D1.modelId,
      d1Version: D1.version,
      priorRepository: D1.offlinePrior.repository,
      priorRevision: D1.offlinePrior.revision,
      priorSafeWeights: Object.freeze(D1.offlinePrior.safeWeights.map(({ path, size, sha256 }) => Object.freeze({ path, size, sha256 }))),
      priorConfigFiles: Object.freeze(D1.offlinePrior.requiredConfigIdentity.files.map(({ path, size, sha256 }) => Object.freeze({ path, size, sha256 }))),
    }),
    historicalPipeline: Object.freeze({
      diffusersRevision: '746215670a61af1034c470d0b6555be9c60cb7b6',
      pipelineClass: 'KandinskyV22PriorPipeline',
      numImagesPerPrompt: 1,
      numInferenceSteps: 25,
      guidanceScale: 4,
      outputType: 'pt',
    }),
    toolchain: TOOLCHAIN,
    determinism: DETERMINISM,
    conditioning: Object.freeze({
      candidateId,
      conditioningContractSha256: identity.conditioningContractSha256,
      negativeMode: identity.negativeMode,
    }),
    bundle: Object.freeze({
      format: 'safetensors',
      metadataPolicy: 'NONE',
      tensorOrder: Object.freeze(['image_embeds', 'negative_image_embeds']),
      tensors: Object.freeze({
        image_embeds: Object.freeze({ dtype: 'F32', shape: Object.freeze([...bundle.shape]) }),
        negative_image_embeds: Object.freeze({ dtype: 'F32', shape: Object.freeze([...bundle.shape]) }),
      }),
      size: bundle.bytes.length,
      sha256: sha256(bundle.bytes),
    }),
  });
}

function makeEvidence(candidateId, bundle, positiveEmbeddingSource = null, d1ManifestSha256 = D1_SHA) {
  const identity = conditioningCandidateIdentity(candidateId);
  return Object.freeze({
    schemaVersion: 1,
    stage: 'F5B1_D2C_CONDITIONING_BUILD',
    status: 'BUILT_NOT_ADMITTED',
    candidateId,
    conditioningContractSha256: identity.conditioningContractSha256,
    positiveEmbeddingSource,
    sourceTrust: Object.freeze({
      d1ManifestSha256,
      d1ModelId: D1.modelId,
      d1Version: D1.version,
      priorRepository: D1.offlinePrior.repository,
      priorRevision: D1.offlinePrior.revision,
      priorPipelineGitBlobSha1: '3b9974a5dd70e8b775caa01efab6b637ff22d9e5',
    }),
    toolchain: Object.freeze({ schemaVersion: 1, status: 'TESTED_EXACT', ...TOOLCHAIN }),
    determinism: Object.freeze({ ...DETERMINISM, networkPolicy: 'CONTAINER_NETWORK_NONE_PLUS_LIBRARY_OFFLINE_GUARD' }),
    bundle: Object.freeze({
      format: 'safetensors',
      metadataPolicy: 'NONE',
      tensorOrder: Object.freeze(['image_embeds', 'negative_image_embeds']),
      tensors: Object.freeze({
        image_embeds: Object.freeze({ dtype: 'F32', shape: Object.freeze([...bundle.shape]), sha256: sha256(bundle.image) }),
        negative_image_embeds: Object.freeze({ dtype: 'F32', shape: Object.freeze([...bundle.shape]), sha256: sha256(bundle.negative) }),
      }),
      size: bundle.bytes.length,
      sha256: sha256(bundle.bytes),
    }),
  });
}

function writeBuild(dir, prefix, manifest, bundle, evidence) {
  const manifestPath = path.join(dir, `${prefix}.manifest.json`);
  const bundlePath = path.join(dir, `${prefix}.safetensors`);
  const evidencePath = path.join(dir, `${prefix}.evidence.json`);
  fs.writeFileSync(manifestPath, canonicalJsonBytes(manifest));
  fs.writeFileSync(bundlePath, bundle.bytes);
  fs.writeFileSync(evidencePath, canonicalJsonBytes(evidence));
  return { manifestPath, bundlePath, evidencePath };
}

function runFinalizer(dir, first, second, extra = []) {
  const output = path.join(dir, 'reproduction.json');
  const result = spawnSync(process.execPath, [
    FINALIZER,
    '--d1', D1_PATH,
    '--first-manifest', first.manifestPath,
    '--first-bundle', first.bundlePath,
    '--first-evidence', first.evidencePath,
    '--second-manifest', second.manifestPath,
    '--second-bundle', second.bundlePath,
    '--second-evidence', second.evidencePath,
    ...extra,
    '--output', output,
  ], { cwd: ROOT, encoding: 'utf8' });
  return { ...result, output };
}

function withTemp(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bers-kandinsky-repro-'));
  try { return run(dir); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('F5b.1 reproduction record admits two distinct byte-identical B research builds', () => withTemp(dir => {
  const bundle = makeBundle([1, 2], [3, 4]);
  const manifest = makeManifest('B_REALISM_ZERO_NEGATIVE', bundle);
  const evidence = makeEvidence('B_REALISM_ZERO_NEGATIVE', bundle);
  const first = writeBuild(dir, 'build-1', manifest, bundle, evidence);
  const second = writeBuild(dir, 'build-2', manifest, bundle, evidence);
  const result = runFinalizer(dir, first, second);
  assert.equal(result.status, 0, result.stderr);
  const record = JSON.parse(fs.readFileSync(result.output, 'utf8'));
  assert.equal(record.status, 'TWO_BUILD_BYTE_IDENTICAL_RESEARCH_EVIDENCE');
  assert.equal(record.candidateId, 'B_REALISM_ZERO_NEGATIVE');
  assert.equal(record.buildCount, 2);
  assert.equal(record.d1ManifestSha256, D1_SHA);
  assert.equal(record.bundle.sha256, sha256(bundle.bytes));
  assert.equal(record.bundle.tensors.image_embeds.sha256, sha256(bundle.image));
  assert.equal(record.positiveEmbeddingSource, null);
  assert.equal(record.productionExecutable, false);
  assert.equal(record.runtimeAuthorityGranted, false);
}));

test('F5b.1 reproduction record rejects two individually valid but non-identical builds', () => withTemp(dir => {
  const firstBundle = makeBundle([1, 2], [3, 4]);
  const secondBundle = makeBundle([1, 2], [3, 5]);
  const first = writeBuild(dir, 'build-1', makeManifest('B_REALISM_ZERO_NEGATIVE', firstBundle), firstBundle, makeEvidence('B_REALISM_ZERO_NEGATIVE', firstBundle));
  const second = writeBuild(dir, 'build-2', makeManifest('B_REALISM_ZERO_NEGATIVE', secondBundle), secondBundle, makeEvidence('B_REALISM_ZERO_NEGATIVE', secondBundle));
  const result = runFinalizer(dir, first, second);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /conditioning manifests are not byte-identical|conditioning bundles are not byte-identical/);
}));

test('F5b.1 reproduction record rejects builder evidence rebound to another D1 byte identity', () => withTemp(dir => {
  const bundle = makeBundle([1, 2], [3, 4]);
  const manifest = makeManifest('B_REALISM_ZERO_NEGATIVE', bundle);
  const evidence = makeEvidence('B_REALISM_ZERO_NEGATIVE', bundle, null, 'f'.repeat(64));
  const first = writeBuild(dir, 'build-1', manifest, bundle, evidence);
  const second = writeBuild(dir, 'build-2', manifest, bundle, evidence);
  const result = runFinalizer(dir, first, second);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not bound to the exact D1 manifest bytes/);
}));

test('F5b.1 C reproduction preserves exact B positive-embedding provenance', () => withTemp(dir => {
  const sourceBundle = makeBundle([10, 20], [30, 40]);
  const sourceManifest = makeManifest('B_REALISM_ZERO_NEGATIVE', sourceBundle);
  const sourceManifestPath = path.join(dir, 'source-b.manifest.json');
  const sourceBundlePath = path.join(dir, 'source-b.safetensors');
  fs.writeFileSync(sourceManifestPath, canonicalJsonBytes(sourceManifest));
  fs.writeFileSync(sourceBundlePath, sourceBundle.bytes);
  const sourceEvidence = Object.freeze({
    candidateId: 'B_REALISM_ZERO_NEGATIVE',
    conditioningContractSha256: conditioningCandidateIdentity('B_REALISM_ZERO_NEGATIVE').conditioningContractSha256,
    manifestSha256: sha256(fs.readFileSync(sourceManifestPath)),
    bundleSize: sourceBundle.bytes.length,
    bundleSha256: sha256(sourceBundle.bytes),
    imageEmbedsSha256: sha256(sourceBundle.image),
  });

  const targetBundle = makeBundle([10, 20], [50, 60]);
  const targetManifest = makeManifest('C_PRESERVATION_EXPLICIT_NEGATIVE', targetBundle);
  const targetEvidence = makeEvidence('C_PRESERVATION_EXPLICIT_NEGATIVE', targetBundle, sourceEvidence);
  const first = writeBuild(dir, 'build-1', targetManifest, targetBundle, targetEvidence);
  const second = writeBuild(dir, 'build-2', targetManifest, targetBundle, targetEvidence);
  const result = runFinalizer(dir, first, second, ['--positive-source-manifest', sourceManifestPath, '--positive-source-bundle', sourceBundlePath]);
  assert.equal(result.status, 0, result.stderr);
  const record = JSON.parse(fs.readFileSync(result.output, 'utf8'));
  assert.deepEqual(record.positiveEmbeddingSource, sourceEvidence);
  assert.equal(record.bundle.tensors.image_embeds.sha256, sourceEvidence.imageEmbedsSha256);
}));

test('F5b.1 C reproduction rejects a claimed B source whose positive tensor differs from target C', () => withTemp(dir => {
  const sourceBundle = makeBundle([10, 21], [30, 40]);
  const sourceManifest = makeManifest('B_REALISM_ZERO_NEGATIVE', sourceBundle);
  const sourceManifestPath = path.join(dir, 'source-b.manifest.json');
  const sourceBundlePath = path.join(dir, 'source-b.safetensors');
  fs.writeFileSync(sourceManifestPath, canonicalJsonBytes(sourceManifest));
  fs.writeFileSync(sourceBundlePath, sourceBundle.bytes);
  const sourceEvidence = Object.freeze({
    candidateId: 'B_REALISM_ZERO_NEGATIVE',
    conditioningContractSha256: conditioningCandidateIdentity('B_REALISM_ZERO_NEGATIVE').conditioningContractSha256,
    manifestSha256: sha256(fs.readFileSync(sourceManifestPath)),
    bundleSize: sourceBundle.bytes.length,
    bundleSha256: sha256(sourceBundle.bytes),
    imageEmbedsSha256: sha256(sourceBundle.image),
  });
  const targetBundle = makeBundle([10, 20], [50, 60]);
  const targetManifest = makeManifest('C_PRESERVATION_EXPLICIT_NEGATIVE', targetBundle);
  const targetEvidence = makeEvidence('C_PRESERVATION_EXPLICIT_NEGATIVE', targetBundle, sourceEvidence);
  const first = writeBuild(dir, 'build-1', targetManifest, targetBundle, targetEvidence);
  const second = writeBuild(dir, 'build-2', targetManifest, targetBundle, targetEvidence);
  const result = runFinalizer(dir, first, second, ['--positive-source-manifest', sourceManifestPath, '--positive-source-bundle', sourceBundlePath]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /target image_embeds are not byte-identical to the accepted positive source/);
}));

test('F5b.1 zero-negative candidates reject positive-source arguments', () => withTemp(dir => {
  const bundle = makeBundle([1, 2], [3, 4]);
  const manifest = makeManifest('A_NEUTRAL_ZERO_NEGATIVE', bundle);
  const evidence = makeEvidence('A_NEUTRAL_ZERO_NEGATIVE', bundle);
  const first = writeBuild(dir, 'build-1', manifest, bundle, evidence);
  const second = writeBuild(dir, 'build-2', manifest, bundle, evidence);
  const sourceManifestPath = path.join(dir, 'unwanted.manifest.json');
  const sourceBundlePath = path.join(dir, 'unwanted.safetensors');
  fs.writeFileSync(sourceManifestPath, canonicalJsonBytes(manifest));
  fs.writeFileSync(sourceBundlePath, bundle.bytes);
  const result = runFinalizer(dir, first, second, ['--positive-source-manifest', sourceManifestPath, '--positive-source-bundle', sourceBundlePath]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /forbids positive-source inputs/);
}));
