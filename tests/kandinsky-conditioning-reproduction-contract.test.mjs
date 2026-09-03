import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertCanonicalReproductionBytes,
  assertKandinskyConditioningReproductionRecord,
  canonicalReproductionJsonBytes,
} from '../scripts/kandinsky-conditioning-reproduction-contract.mjs';
import { conditioningCandidateIdentity } from '../scripts/kandinsky-conditioning-candidate-registry.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const VERIFY = path.join(ROOT, 'scripts/kandinsky-conditioning-reproduction-verify.mjs');
const sha = value => String(value).repeat(64).slice(0, 64);

function record(candidateId = 'B_REALISM_ZERO_NEGATIVE') {
  const identity = conditioningCandidateIdentity(candidateId);
  const sourceCandidateId = identity.positiveEmbeddingSourceCandidateId;
  return {
    schemaVersion: 1,
    stage: 'F5B1_D2_CONDITIONING_REPRODUCTION',
    status: 'TWO_BUILD_BYTE_IDENTICAL_RESEARCH_EVIDENCE',
    productionExecutable: false,
    runtimeAuthorityGranted: false,
    priorRuntimeDependencyAllowed: false,
    candidateId,
    conditioningContractSha256: identity.conditioningContractSha256,
    d1ManifestSha256: sha('1'),
    buildCount: 2,
    conditioningManifest: { size: 2048, sha256: sha('2') },
    builderEvidence: { size: 1024, sha256: sha('3') },
    bundle: {
      size: 4096,
      sha256: sha('4'),
      tensors: {
        image_embeds: { dtype: 'F32', shape: [1, 1280], sha256: sha('5') },
        negative_image_embeds: { dtype: 'F32', shape: [1, 1280], sha256: sha('6') },
      },
    },
    positiveEmbeddingSource: sourceCandidateId === null ? null : {
      candidateId: sourceCandidateId,
      conditioningContractSha256: conditioningCandidateIdentity(sourceCandidateId).conditioningContractSha256,
      manifestSha256: sha('7'),
      bundleSize: 4096,
      bundleSha256: sha('8'),
      imageEmbedsSha256: sha('5'),
    },
  };
}

test('F5b.1 reproduction contract accepts closed B and C research records', () => {
  for (const candidateId of ['B_REALISM_ZERO_NEGATIVE', 'C_PRESERVATION_EXPLICIT_NEGATIVE']) {
    const value = record(candidateId);
    assert.equal(assertKandinskyConditioningReproductionRecord(value), value);
    const bytes = canonicalReproductionJsonBytes(value);
    assert.deepEqual(assertCanonicalReproductionBytes(bytes), value);
  }
});

test('F5b.1 reproduction contract rejects dynamic CI identity and any production/runtime authority', () => {
  assert.throws(() => assertKandinskyConditioningReproductionRecord({ ...record(), runId: 123 }), /closed schema|forbidden/);
  assert.throws(() => assertKandinskyConditioningReproductionRecord({ ...record(), productionExecutable: true }), /productionExecutable mismatch/);
  assert.throws(() => assertKandinskyConditioningReproductionRecord({ ...record(), runtimeAuthorityGranted: true }), /runtimeAuthorityGranted mismatch/);
});

test('F5b.1 reproduction contract enforces candidate-specific B to C positive-source identity', () => {
  assert.throws(() => assertKandinskyConditioningReproductionRecord({ ...record('C_PRESERVATION_EXPLICIT_NEGATIVE'), positiveEmbeddingSource: null }), /positiveEmbeddingSource must be a plain object/);
  assert.throws(() => assertKandinskyConditioningReproductionRecord({ ...record('B_REALISM_ZERO_NEGATIVE'), positiveEmbeddingSource: record('C_PRESERVATION_EXPLICIT_NEGATIVE').positiveEmbeddingSource }), /positiveEmbeddingSource must be null/);
});

test('F5b.1 reproduction contract rejects malformed tensor identity and non-canonical bytes', () => {
  const malformed = record();
  malformed.bundle.tensors.negative_image_embeds.shape = [1, 1279];
  assert.throws(() => assertKandinskyConditioningReproductionRecord(malformed), /tensor shapes must match/);
  const valid = record();
  const pretty = Buffer.from(JSON.stringify(valid, null, 2), 'utf8');
  assert.throws(() => assertCanonicalReproductionBytes(pretty), /not canonical JSON/);
});

test('F5b.1 independent verifier accepts canonical record and rejects symlink input', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bers-kandinsky-repro-contract-'));
  try {
    const recordPath = path.join(dir, 'reproduction.json');
    fs.writeFileSync(recordPath, canonicalReproductionJsonBytes(record()));
    const accepted = spawnSync(process.execPath, [VERIFY, '--record', recordPath], { encoding: 'utf8', cwd: ROOT });
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.equal(JSON.parse(accepted.stdout).status, 'VERIFIED_RESEARCH_REPRODUCTION_EVIDENCE');

    const linkPath = path.join(dir, 'reproduction-link.json');
    fs.symlinkSync(recordPath, linkPath);
    const rejected = spawnSync(process.execPath, [VERIFY, '--record', linkPath], { encoding: 'utf8', cwd: ROOT });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /real regular file/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
