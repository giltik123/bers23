import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const inspector = await readFile(new URL('../scripts/inspect-lama-authoritative-folder.py', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../.github/workflows/sprint-6.42c6-lama-acquisition.yml', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../src/platform/creative/local-ai/models/lama-inpainting.manifest.json', import.meta.url), 'utf8'));

test('authoritative folder inspector hashes checkpoint/config candidates without deserialization', () => {
  assert.doesNotMatch(inspector, /^\s*import\s+torch\b/m);
  assert.doesNotMatch(inspector, /torch\.load\s*\(/);
  assert.doesNotMatch(inspector, /pickle\.load\s*\(/);
  assert.match(inspector, /zipfile\.ZipFile/);
  assert.match(inspector, /sha256_stream/);
  assert.match(inspector, /big-lama/);
  assert.match(inspector, /best\.ckpt/);
  assert.match(inspector, /complete enumeration is not proven/);
});

test('hosted acquisition uses only pinned upstream source plus official Drive folder as authority', () => {
  assert.match(workflow, /786f5936b27fb3dacd2b1ad799e4de968ea697e7/);
  assert.match(workflow, /drive\.google\.com\/drive\/folders\/1B2x7eQDgecTL0oh3LSIBDGj0fTxs6Ips/);
  assert.match(workflow, /gdown==5\.2\.0/);
  assert.match(workflow, /inspect-lama-authoritative-folder\.py/);
  assert.doesNotMatch(workflow, /curl[^\n]*smartywu\/big-lama/);
  assert.doesNotMatch(workflow, /wget[^\n]*smartywu\/big-lama/);
  assert.doesNotMatch(workflow, /torch\.load/);
});

test('bootstrap CANDIDATE cannot claim checkpoint, runtime or release completion', () => {
  assert.equal(manifest.status, 'CANDIDATE');
  assert.equal(manifest.artifactState, 'CHECKPOINT_ACQUISITION_REQUIRED');
  assert.equal(manifest.upstream.checkpoint.identityState, 'ACQUISITION_REQUIRED');
  assert.equal(manifest.runtimeFeasibility.state, 'UNPROVEN');
  assert.equal(manifest.bersArtifact.state, 'UNBUILT');
  assert.equal(manifest.productionApprovalEvidence, null);
  assert.equal(manifest.verificationKeyId, null);
  assert.equal(manifest.artifacts.model.url, null);
});
