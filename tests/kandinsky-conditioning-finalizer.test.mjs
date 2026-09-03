import assert from 'node:assert/strict';
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

function evidence(candidateId, contractSha, bundleBytes) {
  return {
    schemaVersion: 1,
    stage: 'F5B1_D2C_CONDITIONING_BUILD',
    status: 'BUILT_NOT_ADMITTED',
    candidateId,
    conditioningContractSha256: contractSha,
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
        image_embeds: { dtype: 'F32', shape: [1, 1280] },
        negative_image_embeds: { dtype: 'F32', shape: [1, 1280] },
      },
      size: bundleBytes.length,
      sha256: sha256Bytes(bundleBytes),
    },
  };
}

function runFinalizer(candidateId, mutateEvidence = value => value, mutateBundle = value => value) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bers-kandinsky-d2c-'));
  const promptPath = path.join(tmp, 'prompt.json');
  const evidencePath = path.join(tmp, 'evidence.json');
  const bundlePath = path.join(tmp, 'conditioning.safetensors');
  const outputPath = path.join(tmp, 'manifest.json');
  const expected = conditioningPromptContract(candidateId);
  fs.writeFileSync(promptPath, JSON.stringify(expected.contract), 'utf8');
  const originalBundle = Buffer.from('synthetic-conditioning-bundle', 'utf8');
  const buildEvidence = mutateEvidence(evidence(candidateId, expected.sha256, originalBundle));
  fs.writeFileSync(evidencePath, JSON.stringify(buildEvidence), 'utf8');
  fs.writeFileSync(bundlePath, mutateBundle(originalBundle));
  const result = spawnSync(process.execPath, [finalizer, '--d1', d1Path, '--prompt', promptPath, '--evidence', evidencePath, '--bundle', bundlePath, '--output', outputPath], { encoding: 'utf8' });
  return { tmp, result, outputPath, expected };
}

test('F5b.1 D2c finalizer converts builder evidence into canonical D2a manifest without opening runtime authority', () => {
  const { tmp, result, outputPath, expected } = runFinalizer('B_REALISM_ZERO_NEGATIVE');
  try {
    assert.equal(result.status, 0, result.stderr);
    const bytes = fs.readFileSync(outputPath);
    const parsed = assertCanonicalManifestBytes(bytes, d1);
    assert.equal(parsed.conditioning.candidateId, 'B_REALISM_ZERO_NEGATIVE');
    assert.equal(parsed.conditioning.conditioningContractSha256, expected.sha256);
    assert.equal(parsed.conditioning.negativeMode, 'HISTORICAL_ZERO_IMAGE');
    assert.equal(parsed.productionExecutable, false);
    assert.equal(parsed.runtimeAuthorityGranted, false);
    assert.equal(parsed.priorRuntimeDependencyAllowed, false);
    assert.deepEqual(parsed.bundle.tensorOrder, ['image_embeds', 'negative_image_embeds']);
    const stdout = JSON.parse(result.stdout);
    assert.equal(stdout.manifestSha256, sha256Bytes(bytes));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('F5b.1 D2c finalizer rejects evidence rebound to a different conditioning contract', () => {
  const { tmp, result } = runFinalizer('C_PRESERVATION_EXPLICIT_NEGATIVE', value => ({ ...value, conditioningContractSha256: '0'.repeat(64) }));
  try {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /not bound to the accepted D2b prompt contract/i);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('F5b.1 D2c finalizer rejects actual bundle bytes that drift from builder evidence', () => {
  const { tmp, result } = runFinalizer('B_REALISM_ZERO_NEGATIVE', value => value, bytes => Buffer.concat([bytes, Buffer.from('drift')]));
  try {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /final bundle bytes do not match builder evidence identity/i);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('F5b.1 D2c finalizer rejects open builder evidence and untested toolchain claims', () => {
  const open = runFinalizer('A_NEUTRAL_ZERO_NEGATIVE', value => ({ ...value, unexpected: true }));
  try {
    assert.notEqual(open.result.status, 0);
    assert.match(open.result.stderr, /keys are open or incomplete/i);
  } finally { fs.rmSync(open.tmp, { recursive: true, force: true }); }

  const untested = runFinalizer('A_NEUTRAL_ZERO_NEGATIVE', value => ({ ...value, toolchain: { ...value.toolchain, status: 'PROPOSED' } }));
  try {
    assert.notEqual(untested.result.status, 0);
    assert.match(untested.result.stderr, /not tested\/exact/i);
  } finally { fs.rmSync(untested.tmp, { recursive: true, force: true }); }
});
