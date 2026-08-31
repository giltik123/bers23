import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const inspector = await readFile(new URL('../scripts/inspect-modnet-checkpoint.py', import.meta.url), 'utf8');
const exporter = await readFile(new URL('../scripts/build-modnet-portrait-matting-release.py', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../src/platform/creative/local-ai/models/portrait-matting.manifest.json', import.meta.url), 'utf8'));
const CHECKPOINT_SHA = '7c22235f0925deba15d4d63e53afcb654c47055bbcd98f56e393ab2584007ed8';
const ONNX_SHA = '223bdc36ba84f9728ab4a94a7985128161514019d8388c3e827402c15072c654';
const ONNX_SIZE = 26236047;

test('checkpoint inspector verifies pinned digest before weights-only state_dict deserialization', () => {
  const digestCheck = inspector.indexOf('if sha256 != args.expected_sha256');
  const stateInspect = inspector.indexOf('inspect_state_dict(args.source, args.checkpoint)');
  const torchLoad = inspector.indexOf('state = torch.load(');
  assert.ok(digestCheck >= 0);
  assert.ok(stateInspect > digestCheck, 'state_dict inspection must occur after digest verification logic');
  assert.ok(torchLoad >= 0);
  assert.match(inspector, /weights_only=True/);
  assert.doesNotMatch(inspector, /weights_only=False/);
});

test('reproducible exporter verifies checkpoint before weights-only load and byte-binds output identity', () => {
  const sizeCheck = exporter.indexOf('checkpoint.stat().st_size != expected["size"]');
  const shaCheck = exporter.indexOf('sha256(checkpoint) != expected["sha256"]');
  const deserialize = exporter.indexOf('state = torch.load(');
  assert.ok(sizeCheck >= 0 && shaCheck >= 0 && deserialize >= 0);
  assert.ok(sizeCheck < deserialize);
  assert.ok(shaCheck < deserialize);
  assert.match(exporter, /weights_only=True/);
  assert.doesNotMatch(exporter, /weights_only=False/);
  assert.match(exporter, /MODEL_VERSION = "1\.0\.0-candidate\.2"/);
  assert.match(exporter, /OPSET = 17/);
  assert.match(exporter, /CONSTANT_FOLDING = False/);
  assert.match(exporter, /do_constant_folding=CONSTANT_FOLDING/);
  assert.doesNotMatch(exporter, /--disable-constant-folding/);
  assert.match(exporter, /PARITY_SHAPES = \(\(128, 160\), \(256, 320\), \(512, 512\)\)/);
  assert.match(exporter, /onnx\.checker\.check_model\(model, full_check=True\)/);
  assert.match(exporter, /MODNet ONNX size mismatch/);
  assert.match(exporter, /MODNet ONNX SHA-256 mismatch against pinned export identity/);
});

test('MODNet export reproducibility is proven across independent fixed-hash-seed Python processes', () => {
  assert.match(exporter, /EXPORT_PYTHON_HASH_SEED = "0"/);
  assert.match(exporter, /env\["PYTHONHASHSEED"\] = EXPORT_PYTHON_HASH_SEED/);
  assert.match(exporter, /subprocess\.run\(/);
  assert.match(exporter, /"--single-export"/);
  assert.match(exporter, /run_export_child\(args\.source, args\.checkpoint, args\.manifest, first\)/);
  assert.match(exporter, /run_export_child\(args\.source, args\.checkpoint, args\.manifest, second\)/);
  assert.match(exporter, /first_hash != second_hash/);
  assert.match(exporter, /not byte-reproducible across independent fixed-hash-seed processes/);
  assert.match(exporter, /os\.environ\.get\("PYTHONHASHSEED"\) != EXPORT_PYTHON_HASH_SEED/);
  assert.match(exporter, /"crossProcessReproducible": True/);
  assert.match(exporter, /"independentExportProcesses": 2/);
  assert.match(exporter, /"exportPythonHashSeed": EXPORT_PYTHON_HASH_SEED/);
  assert.match(exporter, /"constantFolding": "DISABLED"/);
});

test('candidate.2 records stable cross-host no-folding evidence without granting production authority', () => {
  assert.equal(manifest.version, '1.0.0-candidate.2');
  assert.equal(manifest.status, 'CANDIDATE');
  assert.ok(['EXPORT_PINNED_RELEASE_REQUIRED', 'SIGNED_RELEASE'].includes(manifest.artifactState));
  assert.equal(manifest.upstream.checkpoint.identityState, 'PINNED');
  assert.equal(manifest.upstream.checkpoint.size, 26255603);
  assert.equal(manifest.upstream.checkpoint.sha256, CHECKPOINT_SHA);
  assert.equal(manifest.bersExport.state, 'PINNED');
  assert.equal(manifest.bersExport.constantFolding, false);
  assert.equal(manifest.bersExport.onnxSize, ONNX_SIZE);
  assert.equal(manifest.bersExport.onnxSha256, ONNX_SHA);
  assert.deepEqual(manifest.bersExport.referenceParity.maxAbsErrorByShape, {
    '128x160': 0,
    '256x320': 0,
    '512x512': 0,
  });
  assert.deepEqual(manifest.bersExport.crossHostReproducibility, {
    independentHostedRunners: 3,
    independentExportsPerRunner: 2,
    classification: 'BYTE_IDENTICAL',
    initializerDriftChangedCount: 0,
  });
  assert.equal('evidenceRunId' in manifest.bersExport.crossHostReproducibility, false);
  assert.equal(manifest.productionApprovalEvidence, null);
  if (manifest.artifactState === 'EXPORT_PINNED_RELEASE_REQUIRED') {
    assert.equal(manifest.artifacts.model.url, null);
    assert.equal(manifest.verificationKeyId, null);
  } else {
    assert.equal(manifest.artifacts.model.size, ONNX_SIZE);
    assert.equal(manifest.artifacts.model.sha256, ONNX_SHA);
    assert.equal(typeof manifest.artifacts.model.url, 'string');
    assert.equal(typeof manifest.artifacts.model.signatureUrl, 'string');
    assert.equal(typeof manifest.verificationKeyId, 'string');
  }
});
