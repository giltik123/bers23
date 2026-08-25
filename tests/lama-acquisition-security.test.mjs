import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const inventoryInspector = await readFile(new URL('../scripts/inspect-lama-authoritative-folder.py', import.meta.url), 'utf8');
const checkpointInspector = await readFile(new URL('../scripts/inspect-lama-checkpoint.py', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../.github/workflows/sprint-6.42c6-lama-acquisition.yml', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../src/platform/creative/local-ai/models/lama-inpainting.manifest.json', import.meta.url), 'utf8'));

test('authoritative inventory hashes ZIP members without deserialization and rejects ambiguous member paths', () => {
  assert.doesNotMatch(inventoryInspector, /^\s*import\s+torch\b/m);
  assert.doesNotMatch(inventoryInspector, /torch\.load\s*\(/);
  assert.doesNotMatch(inventoryInspector, /pickle\.load\s*\(/);
  assert.match(inventoryInspector, /zipfile\.ZipFile/);
  assert.match(inventoryInspector, /sha256_stream/);
  assert.match(inventoryInspector, /safe_zip_member/);
  assert.match(inventoryInspector, /candidate\.is_absolute\(\)/);
  assert.match(inventoryInspector, /"\.\." in candidate\.parts/);
  assert.match(inventoryInspector, /Duplicate LaMa ZIP member path/);
});

test('checkpoint inspector verifies exact pinned bytes before weights-only deserialization', () => {
  const sizeCheck = checkpointInspector.indexOf('args.checkpoint.stat().st_size != CHECKPOINT_SIZE');
  const shaCheck = checkpointInspector.indexOf('sha256(args.checkpoint) != CHECKPOINT_SHA256');
  const deserialize = checkpointInspector.indexOf('torch.load(');
  assert.ok(sizeCheck >= 0 && shaCheck >= 0 && deserialize >= 0);
  assert.ok(sizeCheck < deserialize);
  assert.ok(shaCheck < deserialize);
  assert.match(checkpointInspector, /weights_only=True/);
  assert.match(checkpointInspector, /generator\.load_state_dict\(generator_state, strict=True\)/);
  assert.doesNotMatch(checkpointInspector, /weights_only=False/);
});

test('hosted gate uses only exact upstream source plus canonical official Drive archive as authority', () => {
  assert.match(workflow, /786f5936b27fb3dacd2b1ad799e4de968ea697e7/);
  assert.match(workflow, /11RbsVSav3O-fReBsPHBE1nn8kcFIMnKp/);
  assert.match(workflow, /d7161bba4d68b438f9fa7f09dcb750a223804c300c68d214a5e0be16251fba8d/);
  assert.match(workflow, /fccb7adffd53ec0974ee5503c3731c2c2f1e7e07856fd9228cdcc0b46fd5d423/);
  assert.match(workflow, /4fdeed49926e13b101c4dd9e193acec9e58677dfdb4ba49dd6a3a8927964e2a7/);
  assert.match(workflow, /gdown==5\.2\.0/);
  assert.match(workflow, /inspect-lama-authoritative-folder\.py/);
  assert.match(workflow, /inspect-lama-checkpoint\.py/);
  assert.doesNotMatch(workflow, /smartywu\/big-lama/);
});

test('pinned checkpoint remains CANDIDATE-only until runtime/artifact evidence exists', () => {
  assert.equal(manifest.status, 'CANDIDATE');
  assert.equal(manifest.artifactState, 'CHECKPOINT_PINNED_RUNTIME_FEASIBILITY_REQUIRED');
  assert.equal(manifest.upstream.checkpoint.identityState, 'PINNED');
  assert.equal(manifest.runtimeFeasibility.state, 'UNPROVEN');
  assert.equal(manifest.bersArtifact.state, 'UNBUILT');
  assert.equal(manifest.productionApprovalEvidence, null);
  assert.equal(manifest.verificationKeyId, null);
  assert.equal(manifest.artifacts.model.url, null);
});
