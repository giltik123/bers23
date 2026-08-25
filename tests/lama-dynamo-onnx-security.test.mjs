import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const probe = await readFile(new URL('../scripts/probe-lama-dynamo-onnx.py', import.meta.url), 'utf8');
const bridge = await readFile(new URL('../scripts/bridge-lama-generator-safetensors.py', import.meta.url), 'utf8');
const c6 = await readFile(new URL('../scripts/inspect-lama-checkpoint.py', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../.github/workflows/sprint-6.42c7-lama-dynamo-onnx.yml', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../src/platform/creative/local-ai/models/lama-inpainting.manifest.json', import.meta.url), 'utf8'));

test('C7 bridge reuses exact C6 trust root and restricted loader under the proven PyTorch 2.6 environment', () => {
  assert.match(bridge, /CHECKPOINT_SHA256 = "fccb7adffd53ec0974ee5503c3731c2c2f1e7e07856fd9228cdcc0b46fd5d423"/);
  assert.match(bridge, /EXPECTED_TORCH_PREFIX = "2\.6\.0"/);
  assert.match(bridge, /EXPECTED_SAFETENSORS = "0\.8\.0"/);
  assert.match(bridge, /c6\.restricted_load\(checkpoint\)/);
  assert.match(bridge, /verifiedBeforeDeserialization/);
  assert.match(bridge, /"weightsOnly": True/);
  assert.match(bridge, /save_file\(/);
  assert.match(bridge, /tensor\.detach\(\)\.cpu\(\)\.contiguous\(\)\.clone\(\)/);
  assert.match(bridge, /"pickleFree": True/);
  assert.match(bridge, /"ephemeral": True/);
  assert.match(bridge, /"published": False/);
  assert.match(c6, /weights_only=True/);
  assert.doesNotMatch(bridge, /weights_only\s*=\s*False/);
  assert.doesNotMatch(bridge, /^\s*import\s+pytorch_lightning\b/m);
  assert.doesNotMatch(bridge, /^\s*import\s+omegaconf\b/m);
});

test('PyTorch 2.13 exporter process consumes only SHA-bound safetensors and never deserializes the legacy checkpoint', () => {
  assert.match(probe, /from safetensors\.torch import load_file/);
  assert.match(probe, /EXPECTED_SAFETENSORS = "0\.8\.0"/);
  assert.match(probe, /EXPECTED_GENERATOR_KEY_COUNT = 989/);
  assert.match(probe, /EXPECTED_GENERATOR_ELEMENTS = 51057179/);
  assert.match(probe, /bridge\.get\("sha256"\) != sha256\(state_path\)/);
  assert.match(probe, /load_file\(str\(state_path\), device="cpu"\)/);
  assert.match(probe, /c6\.build_generator\(source\)/);
  assert.match(probe, /generator\.load_state_dict\(generator_state, strict=True\)/);
  assert.match(probe, /legacyCheckpointDeserializedInExporterProcess/);
  assert.doesNotMatch(probe, /restricted_load\s*\(/);
  assert.doesNotMatch(probe, /torch\.load\s*\(/);
  assert.doesNotMatch(probe, /--checkpoint/);
});

test('C7 uses the PyTorch 2.13 modern-only Dynamo export API with no legacy fallback or Fourier rewrite', () => {
  assert.match(probe, /torch\.onnx\.export\(/);
  assert.match(probe, /dynamo=True/);
  assert.match(probe, /legacyFallbackParameterPresent/);
  assert.match(probe, /REMOVED_IN_PYTORCH_2_11/);
  assert.match(probe, /legacyFallbackAllowed/);
  assert.match(probe, /OPSET = 18/);
  assert.match(probe, /external_data=False/);
  assert.match(probe, /standardDftNodeCount/);
  assert.match(probe, /node\.op_type == "DFT"/);
  assert.match(probe, /EXPORTED_REJECTED_ATEN_NODES/);
  assert.match(probe, /EXPORTED_REJECTED_CUSTOM_DOMAIN_NODES/);
  assert.match(probe, /EXPORTED_REJECTED_NO_STANDARD_DFT/);
  assert.doesNotMatch(probe, /fallback\s*=/);
  assert.doesNotMatch(probe, /ONNX_ATEN_FALLBACK/);
  assert.doesNotMatch(probe, /operator_export_type/);
  assert.doesNotMatch(probe, /cosine|sine matrix|FourierUnitJIT/i);
});

test('C7 environment is fully pinned and CPU ORT matches the repository browser runtime line', () => {
  assert.match(probe, /EXPECTED_TORCH_PREFIX = "2\.13\.0"/);
  assert.match(probe, /EXPECTED_ONNX = "1\.22\.0"/);
  assert.match(probe, /EXPECTED_ONNXSCRIPT = "0\.7\.1"/);
  assert.match(probe, /EXPECTED_ORT = "1\.27\.0"/);
  assert.match(probe, /providers=\["CPUExecutionProvider"\]/);
  assert.match(probe, /MAX_ABS_TOL = 2e-4/);
  assert.match(probe, /RMSE_TOL = 5e-5/);
});

test('workflow physically removes legacy checkpoint before installing or running the PyTorch 2.13 exporter', () => {
  const bridgeRun = workflow.indexOf('bridge-lama-generator-safetensors.py');
  const checkpointRemove = workflow.indexOf('rm -f "${RUNNER_TEMP}/lama-c7/best.ckpt"');
  const modernInstall = workflow.indexOf('torch==2.13.0');
  const probeRun = workflow.indexOf('probe-lama-dynamo-onnx.py');
  assert.ok(bridgeRun >= 0 && checkpointRemove >= 0 && modernInstall >= 0 && probeRun >= 0);
  assert.ok(bridgeRun < checkpointRemove);
  assert.ok(checkpointRemove < modernInstall);
  assert.ok(modernInstall < probeRun);
  assert.match(workflow, /torch==2\.6\.0 --index-url https:\/\/download\.pytorch\.org\/whl\/cpu/);
  assert.match(workflow, /safetensors==0\.8\.0/);
  assert.match(workflow, /--state "\$\{RUNNER_TEMP\}\/lama-c7\/generator\.safetensors"/);
  assert.match(workflow, /--bridge-report \.test-cache\/6\.42c7\/lama-generator-bridge\.json/);
  assert.match(workflow, /git ls-files '\*\.ckpt' '\*\.pth' '\*\.pt' '\*\.safetensors' '\*\.onnx'/);
});

test('C7 semantic smoke uses upstream mask polarity and generated proposal remains non-authoritative', () => {
  assert.match(probe, /image \* \(1\.0 - mask\)/);
  assert.match(probe, /mask\[:, :, 16:48, 20:44\] = 1\.0/);
  assert.match(probe, /generatorInputFormula/);
  assert.match(probe, /"runtimeAuthorityGranted": False/);
  assert.match(probe, /"productionPromotionAllowed"\] = False/);
  assert.match(probe, /modelRetainedOnlyAsCiEvidence/);
});

test('C7 starts from the C6 fail-closed manifest and cannot silently promote LaMa', () => {
  assert.equal(manifest.status, 'CANDIDATE');
  assert.equal(manifest.artifactState, 'CHECKPOINT_PINNED_RUNTIME_FEASIBILITY_REQUIRED');
  assert.equal(manifest.runtimeFeasibility.state, 'BLOCKED_DIRECT_LEGACY_EXPORT_ALTERNATE_EXPORTER_REQUIRED');
  assert.equal(manifest.runtimeFeasibility.cpuOrt, 'UNPROVEN');
  assert.equal(manifest.runtimeFeasibility.browserWasm, 'UNPROVEN');
  assert.equal(manifest.bersArtifact.state, 'UNBUILT');
  assert.equal(manifest.productionApprovalEvidence, null);
});
