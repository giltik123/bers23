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

test('checkpoint inspector verifies exact bytes before restricted load and scans globals before deserialization', () => {
  const mainStart = checkpointInspector.indexOf('def main()');
  const sizeCheck = checkpointInspector.indexOf('args.checkpoint.stat().st_size != CHECKPOINT_SIZE', mainStart);
  const shaCheck = checkpointInspector.indexOf('sha256(args.checkpoint) != CHECKPOINT_SHA256', mainStart);
  const restrictedCall = checkpointInspector.indexOf('restricted_load(args.checkpoint)', mainStart);
  assert.ok(mainStart >= 0 && sizeCheck >= 0 && shaCheck >= 0 && restrictedCall >= 0);
  assert.ok(sizeCheck < restrictedCall);
  assert.ok(shaCheck < restrictedCall);

  const restrictedStart = checkpointInspector.indexOf('def restricted_load(');
  const unsafeScan = checkpointInspector.indexOf('scan(checkpoint)', restrictedStart);
  const deserialize = checkpointInspector.indexOf('torch.load(', restrictedStart);
  assert.ok(restrictedStart >= 0 && unsafeScan >= 0 && deserialize >= 0);
  assert.ok(unsafeScan < deserialize);

  assert.match(checkpointInspector, /get_unsafe_globals_in_checkpoint/);
  assert.match(checkpointInspector, /STANDARD_METADATA_GLOBALS/);
  assert.match(checkpointInspector, /INERT_METADATA_GLOBALS/);
  assert.match(checkpointInspector, /ALLOWED_METADATA_GLOBALS/);
  assert.match(checkpointInspector, /pytorch_lightning\.callbacks\.model_checkpoint\.ModelCheckpoint/);
  assert.match(checkpointInspector, /omegaconf\.dictconfig\.DictConfig/);
  assert.match(checkpointInspector, /collections\.defaultdict/);
  assert.match(checkpointInspector, /Unexpected checkpoint globals/);
  assert.match(checkpointInspector, /_InertSerializedMetadata/);
  assert.match(checkpointInspector, /safe_globals\(aliases\)/);
  assert.match(checkpointInspector, /weights_only=True/);
  assert.match(checkpointInspector, /generator\.load_state_dict\(generator_state, strict=True\)/);
  assert.doesNotMatch(checkpointInspector, /SAFE_METADATA_PREFIX/);
  assert.doesNotMatch(checkpointInspector, /startswith\(.*pytorch_lightning/);
  assert.doesNotMatch(checkpointInspector, /weights_only=False/);
  assert.doesNotMatch(checkpointInspector, /^\s*import\s+pytorch_lightning\b/m);
  assert.doesNotMatch(checkpointInspector, /^\s*import\s+omegaconf\b/m);
});

test('generator import uses only the pinned FFC source and a minimal get_shape shim', () => {
  assert.match(checkpointInspector, /def _pinned_get_shape\(value: Any\)/);
  assert.match(checkpointInspector, /module_name = "saicinpainting\.utils"/);
  assert.match(checkpointInspector, /sys\.modules\[module_name\] = shim/);
  assert.match(checkpointInspector, /shim\.get_shape = _pinned_get_shape/);
  assert.match(checkpointInspector, /importlib\.import_module\("saicinpainting\.training\.modules\.ffc"\)/);
  assert.match(checkpointInspector, /actual_ffc != expected_ffc/);
  assert.match(checkpointInspector, /from pytorch_lightning import seed_everything/);
  assert.match(checkpointInspector, /generatorImportPolicy/);
  assert.match(checkpointInspector, /PINNED_SOURCE_MINIMAL_GET_SHAPE_SHIM_NO_LIGHTNING_IMPORT/);
  assert.doesNotMatch(checkpointInspector, /pip install.*pytorch-lightning/);
});

test('legacy ONNX probe is exact, fail-closed and never grants runtime authority', () => {
  assert.match(checkpointInspector, /--legacy-onnx-probe-report/);
  assert.match(checkpointInspector, /torch\.onnx\.export\(/);
  assert.match(checkpointInspector, /opset_version=LEGACY_ONNX_OPSET/);
  assert.match(checkpointInspector, /LEGACY_ONNX_OPSET = 17/);
  assert.match(checkpointInspector, /dynamo=False/);
  assert.match(checkpointInspector, /do_constant_folding=False/);
  assert.match(checkpointInspector, /BLOCKED_UNSUPPORTED_ATEN_FFT_RFFTN/);
  assert.match(checkpointInspector, /BLOCKED_UNSUPPORTED_ATEN_FFT_IRFFTN/);
  assert.match(checkpointInspector, /EXPORTED_UNVALIDATED/);
  assert.match(checkpointInspector, /"runtimeAuthorityGranted": False/);
  assert.match(checkpointInspector, /"temporaryArtifactRetained": False/);
  assert.match(checkpointInspector, /"atenFallbackAllowed": False/);
  assert.doesNotMatch(checkpointInspector, /ONNX_ATEN_FALLBACK/);
});

test('hosted gate keeps Drive as authority and permits only a byte-pinned transport fallback', () => {
  assert.match(workflow, /786f5936b27fb3dacd2b1ad799e4de968ea697e7/);
  assert.match(workflow, /11RbsVSav3O-fReBsPHBE1nn8kcFIMnKp/);
  assert.match(workflow, /d7161bba4d68b438f9fa7f09dcb750a223804c300c68d214a5e0be16251fba8d/);
  assert.match(workflow, /05cb2be7f8dbe6ca7c6e78f4fc827a4b2baaa4a9/);
  assert.match(workflow, /f1b358ca24093b93a106183b98a3dea6e8ed09f3b43ea7251eb2c81e7b4575f6/);
  assert.match(workflow, /PINNED_HF_TRANSPORT_FALLBACK/);
  assert.match(workflow, /smartywu\/big-lama\/resolve\/\$\{LAMA_MIRROR_COMMIT\}\/big-lama\.zip/);
  assert.match(workflow, /SHA-256 mismatch against authoritative Drive identity/);
  assert.match(workflow, /fccb7adffd53ec0974ee5503c3731c2c2f1e7e07856fd9228cdcc0b46fd5d423/);
  assert.match(workflow, /4fdeed49926e13b101c4dd9e193acec9e58677dfdb4ba49dd6a3a8927964e2a7/);
  assert.match(workflow, /gdown==5\.2\.0/);
  assert.match(workflow, /torch==2\.6\.0 --index-url https:\/\/download\.pytorch\.org\/whl\/cpu/);
  assert.match(workflow, /kornia==0\.5\.0/);
  assert.match(workflow, /onnx==1\.17\.0/);
  assert.match(workflow, /--legacy-onnx-probe-report/);
  assert.match(workflow, /lama-direct-onnx-legacy\.json/);
  assert.match(workflow, /inspect-lama-authoritative-folder\.py/);
  assert.match(workflow, /inspect-lama-checkpoint\.py/);
  assert.doesNotMatch(workflow, /pytorch-lightning==/);
  assert.doesNotMatch(workflow, /omegaconf==/);
});

test('pinned checkpoint remains CANDIDATE-only after legacy blocker evidence and before runtime/artifact admission', () => {
  assert.equal(manifest.status, 'CANDIDATE');
  assert.equal(manifest.artifactState, 'CHECKPOINT_PINNED_RUNTIME_FEASIBILITY_REQUIRED');
  assert.equal(manifest.upstream.checkpoint.identityState, 'PINNED');
  assert.equal(manifest.runtimeFeasibility.state, 'BLOCKED_DIRECT_LEGACY_EXPORT_ALTERNATE_EXPORTER_REQUIRED');
  assert.equal(manifest.runtimeFeasibility.directExportEvidence.result, 'BLOCKED_UNSUPPORTED_ATEN_FFT_RFFTN');
  assert.equal(manifest.runtimeFeasibility.directExportEvidence.artifactProduced, false);
  assert.equal(manifest.runtimeFeasibility.directExportEvidence.runtimeAuthorityGranted, false);
  assert.equal(manifest.runtimeFeasibility.cpuOrt, 'UNPROVEN');
  assert.equal(manifest.runtimeFeasibility.browserWasm, 'UNPROVEN');
  assert.equal(manifest.bersArtifact.state, 'UNBUILT');
  assert.equal(manifest.productionApprovalEvidence, null);
  assert.equal(manifest.verificationKeyId, null);
  assert.equal(manifest.artifacts.model.url, null);
});
