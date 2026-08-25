import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const inspector = await readFile(new URL('../scripts/inspect-modnet-checkpoint.py', import.meta.url), 'utf8');
const exporter = await readFile(new URL('../scripts/build-modnet-portrait-matting-release.py', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../src/platform/creative/local-ai/models/portrait-matting.manifest.json', import.meta.url), 'utf8'));

test('checkpoint inspector verifies optional pinned digest before any state_dict deserialization', () => {
  const digestCheck = inspector.indexOf('if sha256 != args.expected_sha256');
  const stateInspect = inspector.indexOf('inspect_state_dict(args.source, args.checkpoint)');
  const torchLoad = inspector.indexOf('torch.load(checkpoint, map_location=torch.device("cpu"))');
  assert.ok(digestCheck >= 0);
  assert.ok(stateInspect > digestCheck, 'state_dict inspection must occur after digest verification logic');
  assert.ok(torchLoad >= 0);
});

test('reproducible exporter checks pinned size and SHA before torch.load', () => {
  const sizeCheck = exporter.indexOf('checkpoint.stat().st_size != expected["size"]');
  const shaCheck = exporter.indexOf('sha256(checkpoint) != expected["sha256"]');
  const deserialize = exporter.indexOf('torch.load(checkpoint, map_location=torch.device("cpu"))');
  assert.ok(sizeCheck >= 0 && shaCheck >= 0 && deserialize >= 0);
  assert.ok(sizeCheck < deserialize);
  assert.ok(shaCheck < deserialize);
  assert.match(exporter, /OPSET = 17/);
  assert.match(exporter, /PARITY_SHAPES = \(\(128, 160\), \(256, 320\), \(512, 512\)\)/);
  assert.match(exporter, /first_hash != second_hash/);
  assert.match(exporter, /onnx\.checker\.check_model\(model, full_check=True\)/);
});

test('bootstrap manifest cannot claim signed or production-approved MODNet', () => {
  assert.equal(manifest.status, 'CANDIDATE');
  assert.equal(manifest.artifactState, 'CHECKPOINT_ACQUISITION_REQUIRED');
  assert.equal(manifest.upstream.checkpoint.identityState, 'ACQUISITION_REQUIRED');
  assert.equal(manifest.bersExport.state, 'UNBUILT');
  assert.equal(manifest.productionApprovalEvidence, null);
  assert.equal(manifest.artifacts.model.url, null);
});
