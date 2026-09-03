import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  assertCanonicalManifestBytes,
  sha256Bytes,
} from '../scripts/kandinsky-conditioning-bundle-contract.mjs';
import { conditioningPromptContract } from '../scripts/kandinsky-conditioning-prompt-contract.mjs';

const root = path.resolve(import.meta.dirname, '..');
const d1Path = path.join(root, 'src/platform/creative/local-ai/models/kandinsky-2-2-refinement-feasibility.manifest.json');
const finalizer = path.join(root, 'scripts/kandinsky-conditioning-finalize-manifest.mjs');
const d1 = JSON.parse(fs.readFileSync(d1Path, 'utf8'));

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function floatBytes(values) {
  const bytes = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => bytes.writeFloatLE(value, index * 4));
  return bytes;
}

function safetensors(imageValues, negativeValues, shape = [1, 2]) {
  const imageBytes = floatBytes(imageValues);
  const negativeBytes = floatBytes(negativeValues);
  const headerObject = {
    image_embeds: { dtype: 'F32', shape, data_offsets: [0, imageBytes.length] },
    negative_image_embeds: { dtype: 'F32', shape, data_offsets: [imageBytes.length, imageBytes.length + negativeBytes.length] },
  };
  const rawHeader = Buffer.from(JSON.stringify(headerObject), 'utf8');
  const padding = (8 - (rawHeader.length % 8)) % 8;
  const header = Buffer.concat([rawHeader, Buffer.alloc(padding, 0x20)]);
  const prefix = Buffer.alloc(8);
  prefix.writeBigUInt64LE(BigInt(header.length));
  return {
    bytes: Buffer.concat([prefix, header, imageBytes, negativeBytes]),
    imageBytes,
    negativeBytes,
    shape,
  };
}

function evidence(candidateId, contractSha, bundle, positiveEmbeddingSource = null) {
  return {
    schemaVersion: 1,
    stage: 'F5B1_D2C_CONDITIONING_BUILD',
    status: 'BUILT_NOT_ADMITTED',
    candidateId,
    conditioningContractSha256: contractSha,
    positiveEmbeddingSource,
    sourceTrust: {
      d1ModelId: d1.modelId,
      d1Version: d1.version,
      priorRepository: d1.offlinePrior.repository,
      priorRevision: d1.offlinePrior.revision,
      priorPipelineGitBlobSha1: '3b9974a5dd70e8b775caa01efab6b637ff22d9e5',
    },
    toolchain: {
      schemaVersion: 1,
      status: 'TESTED_EXACT',
      containerImageDigest: `sha256:${'0'.repeat(64)}`,
      pythonVersion: '3.10.12',
      diffusersVersion: '0.18.0.dev0',
      torchVersion: '2.0.1+cpu',
      transformersVersion: '4.30.2',
      numpyVersion: '1.24.4',
      safetensorsVersion: '0.3.1',
      platformMachine: 'x86_64',
    },
    determinism: {
      device: 'cpu',
      outputDtype: 'float32',
      torchDeterministicAlgorithms: true,
      numThreads: 1,
      numInteropThreads: 1,
      ompNumThreads: 1,
      mklNumThreads: 1,
      seed: 123456,
      generatorPolicy: 'TORCH_CPU_GENERATOR_SINGLE_SEED',
      latentPolicy: 'NO_EXTERNAL_LATENTS_PIPELINE_RANDN',
      networkPolicy: 'CONTAINER_NETWORK_NONE_PLUS_LIBRARY_OFFLINE_GUARD',
    },
    bundle: {
      format: 'safetensors',
      metadataPolicy: 'NONE',
      tensorOrder: ['image_embeds', 'negative_image_embeds'],
      tensors: {
        image_embeds: { dtype: 'F32', shape: bundle.shape, sha256: sha256(bundle.imageBytes) },
        negative_image_embeds: { dtype: 'F32', shape: bundle.shape, sha256: sha256(bundle.negativeBytes) },
      },
      size: bundle.bytes.length,
      sha256: sha256(bundle.bytes),
    },
  };
}

function sourceEvidence(sourceRun) {
  const manifestBytes = fs.readFileSync(sourceRun.outputPath);
  return {
    candidateId: 'B_REALISM_ZERO_NEGATIVE',
    conditioningContractSha256: sourceRun.expected.sha256,
    manifestSha256: sha256(manifestBytes),
    bundleSize: sourceRun.bundle.bytes.length,
    bundleSha256: sha256(sourceRun.bundle.bytes),
    imageEmbedsSha256: sha256(sourceRun.bundle.imageBytes),
  };
}

function runFinalizer(candidateId, options = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bers-kandinsky-d2c-'));
  const promptPath = path.join(tmp, 'prompt.json');
  const evidencePath = path.join(tmp, 'evidence.json');
  const bundlePath = path.join(tmp, 'conditioning.safetensors');
  const outputPath = path.join(tmp, 'manifest.json');
  const expected = conditioningPromptContract(candidateId);
  const bundle = options.bundle ?? safetensors([1, 2], [3, 4]);
  const positiveSource = options.sourceRun ? sourceEvidence(options.sourceRun) : null;
  const buildEvidence = (options.mutateEvidence ?? (value => value))(evidence(candidateId, expected.sha256, bundle, positiveSource));

  fs.writeFileSync(promptPath, JSON.stringify(expected.contract), 'utf8');
  fs.writeFileSync(evidencePath, JSON.stringify(buildEvidence), 'utf8');
  fs.writeFileSync(bundlePath, bundle.bytes);

  const argv = [finalizer, '--d1', d1Path, '--prompt', promptPath, '--evidence', evidencePath, '--bundle', bundlePath, '--output', outputPath];
  if (options.sourceRun) {
    argv.push('--positive-source-manifest', options.sourceRun.outputPath, '--positive-source-bundle', options.sourceRun.bundlePath);
  }
  const result = spawnSync(process.execPath, argv, { encoding: 'utf8' });
  return { tmp, result, outputPath, bundlePath, bundle, expected };
}

function cleanup(...runs) {
  for (const run of runs) fs.rmSync(run.tmp, { recursive: true, force: true });
}

test('F5b.1 D2c B finalizer emits canonical D2a manifest without opening runtime authority', () => {
  const run = runFinalizer('B_REALISM_ZERO_NEGATIVE');
  try {
    assert.equal(run.result.status, 0, run.result.stderr);
    const bytes = fs.readFileSync(run.outputPath);
    const parsed = assertCanonicalManifestBytes(bytes, d1);
    assert.equal(parsed.conditioning.candidateId, 'B_REALISM_ZERO_NEGATIVE');
    assert.equal(parsed.conditioning.conditioningContractSha256, run.expected.sha256);
    assert.equal(parsed.productionExecutable, false);
    assert.equal(parsed.runtimeAuthorityGranted, false);
    assert.equal(parsed.priorRuntimeDependencyAllowed, false);
    assert.deepEqual(parsed.bundle.tensorOrder, ['image_embeds', 'negative_image_embeds']);
    assert.equal(parsed.bundle.sha256, sha256(run.bundle.bytes));
    const stdout = JSON.parse(run.result.stdout);
    assert.equal(stdout.manifestSha256, sha256Bytes(bytes));
  } finally { cleanup(run); }
});

test('F5b.1 D2c C finalizer proves byte-identical reuse of accepted B image_embeds', () => {
  const source = runFinalizer('B_REALISM_ZERO_NEGATIVE', { bundle: safetensors([11, 12], [13, 14]) });
  assert.equal(source.result.status, 0, source.result.stderr);
  const target = runFinalizer('C_PRESERVATION_EXPLICIT_NEGATIVE', {
    sourceRun: source,
    bundle: safetensors([11, 12], [91, 92]),
  });
  try {
    assert.equal(target.result.status, 0, target.result.stderr);
    const parsed = assertCanonicalManifestBytes(fs.readFileSync(target.outputPath), d1);
    assert.equal(parsed.conditioning.candidateId, 'C_PRESERVATION_EXPLICIT_NEGATIVE');
    assert.equal(parsed.conditioning.negativeMode, 'EXPLICIT_NEGATIVE_PRIOR');
  } finally { cleanup(target, source); }
});

test('F5b.1 D2c C finalizer rejects regenerated or substituted positive embedding bytes', () => {
  const source = runFinalizer('B_REALISM_ZERO_NEGATIVE', { bundle: safetensors([21, 22], [23, 24]) });
  assert.equal(source.result.status, 0, source.result.stderr);
  const target = runFinalizer('C_PRESERVATION_EXPLICIT_NEGATIVE', {
    sourceRun: source,
    bundle: safetensors([21, 99], [31, 32]),
  });
  try {
    assert.notEqual(target.result.status, 0);
    assert.match(target.result.stderr, /not byte-identical to accepted B image_embeds/i);
  } finally { cleanup(target, source); }
});

test('F5b.1 D2c C finalizer rejects B source from a different deterministic experiment', () => {
  const source = runFinalizer('B_REALISM_ZERO_NEGATIVE', { bundle: safetensors([51, 52], [53, 54]) });
  assert.equal(source.result.status, 0, source.result.stderr);
  const target = runFinalizer('C_PRESERVATION_EXPLICIT_NEGATIVE', {
    sourceRun: source,
    bundle: safetensors([51, 52], [61, 62]),
    mutateEvidence: value => ({ ...value, determinism: { ...value.determinism, seed: 654321 } }),
  });
  try {
    assert.notEqual(target.result.status, 0);
    assert.match(target.result.stderr, /positive source determinism differs from target C determinism\/seed/i);
  } finally { cleanup(target, source); }
});

test('F5b.1 D2c C finalizer requires accepted B source manifest and bundle', () => {
  const target = runFinalizer('C_PRESERVATION_EXPLICIT_NEGATIVE', { bundle: safetensors([41, 42], [43, 44]) });
  try {
    assert.notEqual(target.result.status, 0);
    assert.match(target.result.stderr, /requires B source manifest and bundle/i);
  } finally { cleanup(target); }
});

test('F5b.1 D2c finalizer rejects evidence rebound to another contract or raw bundle bytes', () => {
  const rebound = runFinalizer('B_REALISM_ZERO_NEGATIVE', {
    mutateEvidence: value => ({ ...value, conditioningContractSha256: '0'.repeat(64) }),
  });
  const wrongBundleSha = runFinalizer('A_NEUTRAL_ZERO_NEGATIVE', {
    mutateEvidence: value => ({ ...value, bundle: { ...value.bundle, sha256: 'f'.repeat(64) } }),
  });
  try {
    assert.notEqual(rebound.result.status, 0);
    assert.match(rebound.result.stderr, /not bound to the accepted D2b prompt contract/i);
    assert.notEqual(wrongBundleSha.result.status, 0);
    assert.match(wrongBundleSha.result.stderr, /bundle bytes mismatch/i);
  } finally { cleanup(rebound, wrongBundleSha); }
});

test('F5b.1 D2c finalizer rejects open evidence and untested toolchain claims', () => {
  const open = runFinalizer('A_NEUTRAL_ZERO_NEGATIVE', { mutateEvidence: value => ({ ...value, unexpected: true }) });
  const untested = runFinalizer('A_NEUTRAL_ZERO_NEGATIVE', {
    mutateEvidence: value => ({ ...value, toolchain: { ...value.toolchain, status: 'PROPOSED' } }),
  });
  try {
    assert.notEqual(open.result.status, 0);
    assert.match(open.result.stderr, /keys are open or incomplete/i);
    assert.notEqual(untested.result.status, 0);
    assert.match(untested.result.stderr, /not tested\/exact/i);
  } finally { cleanup(open, untested); }
});
