import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const inspector = await readFile(new URL('../scripts/inspect-modnet-checkpoint.py', import.meta.url), 'utf8');
const exporter = await readFile(new URL('../scripts/build-modnet-portrait-matting-release.py', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../src/platform/creative/local-ai/models/portrait-matting.manifest.json', import.meta.url), 'utf8'));
const CHECKPOINT_SHA = '7c22235f0925deba15d4d63e53afcb654c47055bbcd98f56e393ab2584007ed8';
const ONNX_SHA = '18d30ce06d8344549e09b02d14e7c1a8d5136c6ecd4c181d05bcd04abb884919';

test('checkpoint inspector verifies pinned digest before state_dict deserialization', () => {
  const digestCheck = inspector.indexOf('if sha256 != args.expected_sha256');
  const stateInspect = inspector.indexOf('inspect_state_dict(args.source, args.checkpoint)');
  const torchLoad = inspector.indexOf('torch.load(checkpoint, map_location=torch.device("cpu"))');
  assert.ok(digestCheck >= 0);
  assert.ok(stateInspect > digestCheck, 'state_dict inspection must occur after digest verification logic');
  assert.ok(torchLoad >= 0);
});

test('reproducible exporter checks checkpoint before torch.load and output against pinned ONNX identity', () => {
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
  assert.match(exporter, /MODNet ONNX size mismatch/);
  assert.match(exporter, /MODNet ONNX SHA-256 mismatch against pinned export identity/);
});

test('pinned checkpoint and export remain CANDIDATE-only before and after signed-pack publication', () => {
  assert.equal(manifest.status, 'CANDIDATE');
  assert.ok(['EXPORT_PINNED_RELEASE_REQUIRED', 'SIGNED_RELEASE'].includes(manifest.artifactState));
  assert.equal(manifest.upstream.checkpoint.identityState, 'PINNED');
  assert.equal(manifest.upstream.checkpoint.size, 26255603);
  assert.equal(manifest.upstream.checkpoint.sha256, CHECKPOINT_SHA);
  assert.equal(manifest.bersExport.state, 'PINNED');
  assert.equal(manifest.bersExport.onnxSize, 25961178);
  assert.equal(manifest.bersExport.onnxSha256, ONNX_SHA);
  assert.equal(manifest.productionApprovalEvidence, null);
  if (manifest.artifactState === 'EXPORT_PINNED_RELEASE_REQUIRED') {
    assert.equal(manifest.artifacts.model.url, null);
    assert.equal(manifest.verificationKeyId, null);
  } else {
    assert.equal(manifest.artifacts.model.size, 25961178);
    assert.equal(manifest.artifacts.model.sha256, ONNX_SHA);
    assert.equal(typeof manifest.artifacts.model.url, 'string');
    assert.equal(typeof manifest.artifacts.model.signatureUrl, 'string');
    assert.equal(typeof manifest.verificationKeyId, 'string');
  }
});
