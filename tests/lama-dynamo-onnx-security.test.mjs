import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const probe = await readFile(new URL('../scripts/probe-lama-dynamo-onnx.py', import.meta.url), 'utf8');
const multi = await readFile(new URL('../scripts/probe-lama-dynamo-multishape.py', import.meta.url), 'utf8');
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
  assert.doesNotMatch(multi, /restricted_load\s*\(/);
  assert.doesNotMatch(multi, /torch\.load\s*\(/);
  assert.doesNotMatch(multi, /--checkpoint/);
});

test('C7 uses the PyTorch 2.13 modern-only Dynamo export API with no legacy fallback or Fourier rewrite', () => {
  assert.match(probe, /legacyFallbackParameterPresent/);
  assert.match(probe, /REMOVED_IN_PYTORCH_2_11/);
  assert.match(multi, /torch\.onnx\.export\(/);
  assert.match(multi, /dynamo=True/);
  assert.match(multi, /opset_version=18/);
  assert.match(multi, /external_data=False/);
  assert.match(multi, /standardDftNodeCount/);
  assert.match(multi, /EXPORTED_REJECTED_ATEN_NODES/);
  assert.match(multi, /EXPORTED_REJECTED_CUSTOM_DOMAIN_NODES/);
  assert.match(multi, /EXPORTED_REJECTED_NO_STANDARD_DFT/);
  assert.doesNotMatch(multi, /fallback\s*=/);
  assert.doesNotMatch(multi, /ONNX_ATEN_FALLBACK/);
  assert.doesNotMatch(multi, /operator_export_type/);
  assert.doesNotMatch(multi, /cosine|sine matrix|FourierUnitJIT/i);
});

test('dynamic export uses modulo-8 derived dimensions and proves all required square/non-square CPU shapes', () => {
  assert.match(multi, /TEST_SHAPES = \(\(64, 64\), \(256, 256\), \(256, 384\), \(512, 512\)\)/);
  assert.match(multi, /height_units = torch\.export\.Dim\("height_units", min=8, max=64\)/);
  assert.match(multi, /width_units = torch\.export\.Dim\("width_units", min=8, max=64\)/);
  assert.match(multi, /dynamic_shapes = \(\{2: 8 \* height_units, 3: 8 \* width_units\},\)/);
  assert.match(multi, /dynamic_shapes=dynamic_shapes/);
  assert.match(multi, /height % 8 or width % 8/);
  assert.match(multi, /EXPORTED_REJECTED_STATIC_SPATIAL_SHAPE/);
  assert.match(multi, /EXPORTED_STANDARD_DFT_CPU_ORT_MULTISHAPE_PASS/);
  assert.match(multi, /MAX_ABS_TOL = 2e-4/);
  assert.match(multi, /RMSE_TOL = 5e-5/);
  assert.match(multi, /providers=\["CPUExecutionProvider"\]/);
});

test('multi-shape evidence locks mask polarity, deterministic composite and known-region bit equality', () => {
  assert.match(multi, /image \* \(1\.0 - mask\)/);
  assert.match(multi, /maskOneMeansInpaint/);
  assert.match(multi, /maskChannelExact/);
  assert.match(multi, /maskedRgbZero/);
  assert.match(multi, /knownRgbPreservedInGeneratorInput/);
  assert.match(multi, /mask \* proposal \+ \(1\.0 - mask\) \* image/);
  assert.match(multi, /knownRegionBitExact/);
  assert.match(multi, /maskedRegionEqualsProposal/);
  assert.match(multi, /compositeParity/);
});

test('C7 environment is fully pinned and CPU ORT matches the repository browser runtime line', () => {
  assert.match(probe, /EXPECTED_TORCH_PREFIX = "2\.13\.0"/);
  assert.match(probe, /EXPECTED_ONNX = "1\.22\.0"/);
  assert.match(probe, /EXPECTED_ONNXSCRIPT = "0\.7\.1"/);
  assert.match(probe, /EXPECTED_ORT = "1\.27\.0"/);
  assert.match(probe, /MAX_ABS_TOL = 2e-4/);
  assert.match(probe, /RMSE_TOL = 5e-5/);
});

test('workflow physically removes legacy checkpoint before installing or running the PyTorch 2.13 exporter', () => {
  const bridgeRun = workflow.indexOf('bridge-lama-generator-safetensors.py');
  const checkpointRemove = workflow.indexOf('rm -f "${RUNNER_TEMP}/lama-c7/best.ckpt"');
  const modernInstall = workflow.indexOf('torch==2.13.0');
  const probeRun = workflow.indexOf('python scripts/probe-lama-dynamo-multishape.py');
  assert.ok(bridgeRun >= 0 && checkpointRemove >= 0 && modernInstall >= 0 && probeRun >= 0);
  assert.ok(bridgeRun < checkpointRemove);
  assert.ok(checkpointRemove < modernInstall);
  assert.ok(modernInstall < probeRun);
  assert.match(workflow, /torch==2\.6\.0 --index-url https:\/\/download\.pytorch\.org\/whl\/cpu/);
  assert.match(workflow, /safetensors==0\.8\.0/);
  assert.match(workflow, /--state "\$\{RUNNER_TEMP\}\/lama-c7\/generator\.safetensors"/);
  assert.match(workflow, /--bridge-report \.test-cache\/6\.42c7\/lama-generator-bridge\.json/);
  assert.match(workflow, /--browser-input-out "\$\{RUNNER_TEMP\}\/lama-c7\/browser-input-256\.f32"/);
  assert.match(workflow, /--browser-reference-out "\$\{RUNNER_TEMP\}\/lama-c7\/browser-reference-256\.f32"/);
  assert.match(workflow, /git ls-files '\*\.ckpt' '\*\.pth' '\*\.pt' '\*\.safetensors' '\*\.onnx'/);
});

test('C7 evidence remains candidate-only and browser reference files are runner-local', () => {
  assert.match(multi, /"runtimeAuthorityGranted": False/);
  assert.match(multi, /"productionPromotionAllowed"\] = False/);
  assert.match(multi, /modelRetainedOnlyAsCiEvidence/);
  assert.match(multi, /browserBinaryEvidenceRunnerLocal/);
  assert.match(multi, /PINNED_PYTORCH_GENERATOR_FLOAT32/);
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
