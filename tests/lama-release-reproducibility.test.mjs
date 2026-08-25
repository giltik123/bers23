import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const probe = await readFile(new URL('../scripts/probe-lama-cross-process-reproducibility.py', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../src/platform/creative/local-ai/models/lama-inpainting.manifest.json', import.meta.url), 'utf8'));
const LAMA_ONNX_SIZE = 208593659;
const LAMA_ONNX_SHA256 = '8bf7891efa16ea07de31fc98c5f0c017b399956cba0182813ddf23d9072792c7';

test('C8 uses two independent fixed-hash-seed Python exporters and the accepted C7 probe', () => {
  assert.match(probe, /EXPORT_PYTHON_HASH_SEED = "0"/);
  assert.match(probe, /EXPECTED_RESULT = "EXPORTED_STANDARD_DFT_CPU_ORT_MULTISHAPE_PASS"/);
  assert.match(probe, /probe-lama-dynamo-multishape\.py/);
  assert.match(probe, /env\["PYTHONHASHSEED"\] = EXPORT_PYTHON_HASH_SEED/);
  assert.match(probe, /subprocess\.run\(/);
  assert.match(probe, /label="first"/);
  assert.match(probe, /label="second"/);
  assert.match(probe, /"independentPythonProcesses": 2/);
  assert.match(probe, /"pythonHashSeed": EXPORT_PYTHON_HASH_SEED/);
});

test('C8 refuses graph/runtime drift before comparing release bytes', () => {
  assert.match(probe, /EXPECTED_CHECKPOINT_SHA256 = "fccb7adffd53ec0974ee5503c3731c2c2f1e7e07856fd9228cdcc0b46fd5d423"/);
  assert.match(probe, /export\.get\("result"\) != EXPECTED_RESULT/);
  assert.match(probe, /cpu\.get\("result"\) != "PASS"/);
  assert.match(probe, /standardDftNodeCount/);
  assert.match(probe, /graph\.get\("customNodes"\) != \[\]/);
  assert.match(probe, /graph\.get\("atenLikeNodes"\) != \[\]/);
  assert.match(probe, /dynamicHeight/);
  assert.match(probe, /dynamicWidth/);
  assert.match(probe, /child report is not byte-bound to its ONNX output/);
});

test('post-discovery C8 probe requires exact pinned bytes and a new version for any deterministic drift', () => {
  assert.match(probe, /EXPECTED_RELEASE_SIZE = 208_593_659/);
  assert.match(probe, /EXPECTED_RELEASE_SHA256 = "8bf7891efa16ea07de31fc98c5f0c017b399956cba0182813ddf23d9072792c7"/);
  assert.match(probe, /first\["size"\] != EXPECTED_RELEASE_SIZE/);
  assert.match(probe, /first\["sha256"\] != EXPECTED_RELEASE_SHA256/);
  assert.match(probe, /a new model version is required/);
  assert.match(probe, /"matchesPinnedReleaseIdentity": True/);
  assert.equal(manifest.bersArtifact.state, 'PINNED');
  assert.equal(manifest.bersArtifact.format, 'ONNX');
  assert.equal(manifest.bersArtifact.size, LAMA_ONNX_SIZE);
  assert.equal(manifest.bersArtifact.sha256, LAMA_ONNX_SHA256);
  assert.equal(manifest.bersArtifact.opset, 18);
  assert.equal(manifest.bersArtifact.reproducibility.independentPythonProcesses, 2);
  assert.equal(manifest.bersArtifact.reproducibility.pythonHashSeed, '0');
  assert.equal(manifest.bersArtifact.reproducibility.byteIdentical, true);
});

test('C8 cross-process mismatch fails closed and never grants release/production authority', () => {
  assert.match(probe, /not byte-reproducible across independent fixed-hash-seed processes/);
  assert.match(probe, /first\["size"\] != second\["size"\]/);
  assert.match(probe, /first\["sha256"\] != second\["sha256"\]/);
  assert.match(probe, /"runtimeAuthorityGranted": False/);
  assert.match(probe, /"productionDeviceApproval": False/);
  assert.match(probe, /"productionPromotionAllowed": False/);
  assert.match(probe, /"releasePublicationAllowed": False/);
  assert.match(probe, /"published": False/);
  assert.match(probe, /"signed": False/);
  assert.match(probe, /"gitTracked": False/);
  assert.equal(manifest.status, 'CANDIDATE');
  assert.equal(manifest.productionApprovalEvidence, null);
  assert.equal(manifest.runtimeFeasibility.realDeviceWebGpu, 'UNPROVEN');
});
