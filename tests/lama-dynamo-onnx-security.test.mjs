import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const probe = await readFile(new URL('../scripts/probe-lama-dynamo-onnx.py', import.meta.url), 'utf8');
const multi = await readFile(new URL('../scripts/probe-lama-dynamo-multishape.py', import.meta.url), 'utf8');
const bridge = await readFile(new URL('../scripts/bridge-lama-generator-safetensors.py', import.meta.url), 'utf8');
const browserHarness = await readFile(new URL('../scripts/test-lama-browser-wasm-acceptance.mjs', import.meta.url), 'utf8');
const browserPage = await readFile(new URL('./lama-browser-wasm-acceptance.html', import.meta.url), 'utf8');
const browserFactory = await readFile(new URL('../src/platform/creative/local-ai/browser/BrowserOnnxSessionFactory.ts', import.meta.url), 'utf8');
const c6 = await readFile(new URL('../scripts/inspect-lama-checkpoint.py', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../.github/workflows/sprint-6.42c7-lama-dynamo-onnx.yml', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../src/platform/creative/local-ai/models/lama-inpainting.manifest.json', import.meta.url), 'utf8'));

const LAMA_ONNX_SIZE = 208593659;
const LAMA_ONNX_SHA256 = '8bf7891efa16ea07de31fc98c5f0c017b399956cba0182813ddf23d9072792c7';

test('C7 bridge preserves the exact C6 trust root and restricted PyTorch 2.6 loader', () => {
  assert.match(bridge, /CHECKPOINT_SHA256 = "fccb7adffd53ec0974ee5503c3731c2c2f1e7e07856fd9228cdcc0b46fd5d423"/);
  assert.match(bridge, /EXPECTED_TORCH_PREFIX = "2\.6\.0"/);
  assert.match(bridge, /EXPECTED_SAFETENSORS = "0\.8\.0"/);
  assert.match(bridge, /c6\.restricted_load\(checkpoint\)/);
  assert.match(c6, /weights_only=True/);
  assert.match(bridge, /save_file\(/);
  assert.match(bridge, /tensor\.detach\(\)\.cpu\(\)\.contiguous\(\)\.clone\(\)/);
  assert.match(bridge, /"pickleFree": True/);
  assert.match(bridge, /"ephemeral": True/);
  assert.match(bridge, /"published": False/);
  assert.doesNotMatch(bridge, /weights_only\s*=\s*False/);
  assert.doesNotMatch(bridge, /^\s*import\s+(?:pytorch_lightning|omegaconf)\b/m);
});

test('PyTorch 2.13 exporter sees only SHA-bound safetensors, never the legacy checkpoint', () => {
  assert.match(probe, /from safetensors\.torch import load_file/);
  assert.match(probe, /EXPECTED_GENERATOR_KEY_COUNT = 989/);
  assert.match(probe, /EXPECTED_GENERATOR_ELEMENTS = 51057179/);
  assert.match(probe, /bridge\.get\("sha256"\) != sha256\(state_path\)/);
  assert.match(probe, /load_file\(str\(state_path\), device="cpu"\)/);
  assert.match(probe, /generator\.load_state_dict\(generator_state, strict=True\)/);
  assert.match(probe, /legacyCheckpointDeserializedInExporterProcess/);
  for (const source of [probe, multi]) {
    assert.doesNotMatch(source, /restricted_load\s*\(/);
    assert.doesNotMatch(source, /torch\.load\s*\(/);
    assert.doesNotMatch(source, /--checkpoint/);
  }
});

test('modern export is native Dynamo standard ONNX with no fallback or Fourier rewrite', () => {
  assert.match(probe, /legacyFallbackParameterPresent/);
  assert.match(probe, /REMOVED_IN_PYTORCH_2_11/);
  assert.match(multi, /torch\.onnx\.export\(/);
  assert.match(multi, /dynamo=True/);
  assert.match(multi, /opset_version=18/);
  assert.match(multi, /external_data=False/);
  assert.match(multi, /standardDftNodeCount/);
  assert.match(multi, /EXPORTED_REJECTED_(?:ATEN_NODES|CUSTOM_DOMAIN_NODES|NO_STANDARD_DFT|STATIC_SPATIAL_SHAPE)/);
  assert.doesNotMatch(multi, /fallback\s*=/);
  assert.doesNotMatch(multi, /ONNX_ATEN_FALLBACK|operator_export_type|FourierUnitJIT|sine matrix|cosine/i);
});

test('dynamic export is modulo-8 and covers square plus non-square CPU parity', () => {
  assert.match(multi, /TEST_SHAPES = \(\(64, 64\), \(256, 256\), \(256, 384\), \(512, 512\)\)/);
  assert.match(multi, /torch\.export\.Dim\("height_units", min=8, max=64\)/);
  assert.match(multi, /torch\.export\.Dim\("width_units", min=8, max=64\)/);
  assert.match(multi, /dynamic_shapes = \(\{2: 8 \* height_units, 3: 8 \* width_units\},\)/);
  assert.match(multi, /dynamic_shapes=dynamic_shapes/);
  assert.match(multi, /height % 8 or width % 8/);
  assert.match(multi, /EXPORTED_STANDARD_DFT_CPU_ORT_MULTISHAPE_PASS/);
  assert.match(multi, /MAX_ABS_TOL = 2e-4/);
  assert.match(multi, /RMSE_TOL = 5e-5/);
  assert.match(multi, /providers=\["CPUExecutionProvider"\]/);
});

test('multi-shape evidence locks mask polarity and deterministic known-region composite', () => {
  assert.match(multi, /image \* \(1\.0 - mask\)/);
  assert.match(multi, /maskOneMeansInpaint|maskChannelExact|maskedRgbZero|knownRgbPreservedInGeneratorInput/);
  assert.match(multi, /mask \* proposal \+ \(1\.0 - mask\) \* image/);
  assert.match(multi, /knownRegionBitExact|maskedRegionEqualsProposal|compositeParity/);
});

test('browser gate reuses production local WASM runtime 1.27 and never uses CDN or WebGPU', () => {
  assert.match(browserFactory, /import \* as ort from 'onnxruntime-web\/wasm'/);
  assert.match(browserFactory, /ONNX_RUNTIME_WEB_VERSION = '1\.27\.0'/);
  assert.match(browserFactory, /executionProviders: \['wasm'\]/);
  assert.match(browserFactory, /Never fall back to ORT's CDN/);
  assert.match(browserPage, /BrowserOnnxSessionFactory/);
  assert.match(browserPage, /executionProviders: \['wasm'\]/);
  assert.match(browserPage, /PINNED_PYTORCH_GENERATOR_FLOAT32/);
  assert.match(browserPage, /parity\.maxAbs <= 2e-4/);
  assert.match(browserPage, /parity\.rmse <= 5e-5/);
  assert.doesNotMatch(browserPage, /onnxruntime-web\/webgpu|https?:\/\//);
});

test('browser harness SHA-binds the CPU-tested model and proves local Chrome assets/network boundary', () => {
  assert.match(browserHarness, /assert\.equal\(modelSha, cpuEvidence\.export\.sha256/);
  assert.match(browserHarness, /channel: 'chrome'/);
  assert.match(browserHarness, /externalHttpRequests/);
  assert.match(browserHarness, /ort-wasm/);
  assert.match(browserHarness, /\.wasm/);
  assert.match(browserHarness, /\.mjs/);
  assert.match(browserHarness, /LAMA C7 BROWSER WASM/);
  assert.match(browserHarness, /browserExecutionIsProductionApproval: false/);
  assert.match(browserHarness, /productionPromotionAllowed: false/);
  assert.doesNotMatch(browserHarness, /chromium\.launch\(\{\s*headless: true\s*\}\)/);
});

test('workflow orders trust bridge, CPU parity, browser and destroys binary evidence before JSON upload', () => {
  const bridgeRun = workflow.indexOf('bridge-lama-generator-safetensors.py');
  const checkpointRemove = workflow.indexOf('rm -f "${RUNNER_TEMP}/lama-c7/best.ckpt"');
  const modernInstall = workflow.indexOf('torch==2.13.0');
  const cpuRun = workflow.indexOf('python scripts/probe-lama-dynamo-multishape.py');
  const exactCpuGate = workflow.indexOf("assert export['result'] == 'EXPORTED_STANDARD_DFT_CPU_ORT_MULTISHAPE_PASS'");
  const browserRun = workflow.indexOf('node scripts/test-lama-browser-wasm-acceptance.mjs');
  const destroy = workflow.indexOf('Destroy ephemeral tensor/model/reference bytes before evidence upload');
  const upload = workflow.indexOf('uses: actions/upload-artifact@v4');
  assert.ok([bridgeRun, checkpointRemove, modernInstall, cpuRun, exactCpuGate, browserRun, destroy, upload].every(value => value >= 0));
  assert.ok(bridgeRun < checkpointRemove && checkpointRemove < modernInstall && modernInstall < cpuRun);
  assert.ok(cpuRun < exactCpuGate && exactCpuGate < browserRun && browserRun < destroy && destroy < upload);
  assert.match(workflow, /torch==2\.6\.0 --index-url https:\/\/download\.pytorch\.org\/whl\/cpu/);
  assert.match(workflow, /safetensors==0\.8\.0/);
  assert.match(workflow, /--browser-input-out "\$\{RUNNER_TEMP\}\/lama-c7\/browser-input-256\.f32"/);
  assert.match(workflow, /--browser-reference-out "\$\{RUNNER_TEMP\}\/lama-c7\/browser-reference-256\.f32"/);
  assert.match(workflow, /ONNX Runtime Web 1\.27\.0/);
  assert.match(workflow, /lama-browser-wasm\.json/);
  const uploadTail = workflow.slice(upload);
  assert.doesNotMatch(uploadTail, /lama-big-dynamo-dynamic\.onnx|browser-input-256\.f32|browser-reference-256\.f32|generator\.safetensors/);
});

test('C7 runtime evidence stays unchanged after C8 pins release bytes and production authority remains closed', () => {
  assert.match(multi, /"runtimeAuthorityGranted": False/);
  assert.match(multi, /"productionPromotionAllowed"\] = False/);
  assert.match(multi, /modelRetainedOnlyAsCiEvidence|browserBinaryEvidenceRunnerLocal/);
  assert.equal(manifest.status, 'CANDIDATE');
  assert.equal(manifest.artifactState, 'EXPORT_PINNED_RELEASE_REQUIRED');
  assert.equal(manifest.runtimeFeasibility.state, 'DYNAMO_ONNX_CPU_WASM_PROVEN_WEBGPU_REAL_DEVICE_REQUIRED');
  assert.equal(manifest.runtimeFeasibility.cpuOrt, 'PROVEN_HOSTED_ORT_1_27_MULTISHAPE');
  assert.equal(manifest.runtimeFeasibility.browserWasm, 'PROVEN_HOSTED_CHROME_ORT_WEB_1_27_256');
  assert.equal(manifest.runtimeFeasibility.browserWebGpu, 'HOSTED_SWIFTSHADER_INFERENCE_TIMEOUT_REAL_DEVICE_UNPROVEN');
  assert.equal(manifest.runtimeFeasibility.realDeviceWebGpu, 'UNPROVEN');
  const modern = manifest.runtimeFeasibility.modernDynamoOnnxEvidence;
  assert.equal(modern.standardDftNodeCount, 144);
  assert.equal(modern.customNodeCount, 0);
  assert.equal(modern.atenLikeNodeCount, 0);
  assert.equal(modern.cpuOrtResult, 'PASS_MULTISHAPE');
  assert.equal(modern.browserWasmResult, 'PASS');
  assert.equal(modern.hostedWebGpu.result, 'WEBGPU_INFERENCE_BLOCKED');
  assert.equal(modern.hostedWebGpu.timeoutStage, 'INFERENCE');
  assert.equal(modern.hostedWebGpu.realDeviceEvidence, false);
  assert.equal(modern.runtimeAuthorityGranted, false);
  assert.equal(modern.productionDeviceApproval, false);
  assert.equal(modern.releaseArtifactIdentityEstablished, true);
  assert.equal(manifest.bersArtifact.state, 'PINNED');
  assert.equal(manifest.bersArtifact.format, 'ONNX');
  assert.equal(manifest.bersArtifact.size, LAMA_ONNX_SIZE);
  assert.equal(manifest.bersArtifact.sha256, LAMA_ONNX_SHA256);
  assert.equal(manifest.bersArtifact.opset, 18);
  assert.equal(manifest.artifacts.model.url, null);
  assert.equal(manifest.artifacts.model.size, null);
  assert.equal(manifest.artifacts.model.sha256, null);
  assert.equal(manifest.artifacts.model.signatureUrl, null);
  assert.equal(manifest.verificationKeyId, null);
  assert.equal(manifest.productionApprovalEvidence, null);
});
