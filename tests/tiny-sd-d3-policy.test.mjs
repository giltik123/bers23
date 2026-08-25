import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const manifest = JSON.parse(await readFile(new URL('../src/platform/creative/local-ai/models/tiny-sd-generation.manifest.json', import.meta.url), 'utf8'));
const prepare = await readFile(new URL('../scripts/prepare-tiny-sd-d3-fp16-webgpu.py', import.meta.url), 'utf8');
const browser = await readFile(new URL('../tests/tiny-sd-d3-browser-webgpu.html', import.meta.url), 'utf8');
const runner = await readFile(new URL('../scripts/test-tiny-sd-d3-browser-webgpu.mjs', import.meta.url), 'utf8');

test('D3 remains advisory and cannot grant Tiny-SD runtime or production authority', () => {
  assert.equal(manifest.status, 'CANDIDATE');
  assert.equal(manifest.artifactState, 'TRUST_ROOT_PINNED_RUNTIME_FEASIBILITY_REQUIRED');
  assert.equal(manifest.runtimeFeasibility.runtimeAuthorityGranted, false);
  assert.equal(manifest.productionApprovalEvidence, null);
  assert.equal('artifacts' in manifest, false);
  for (const source of [prepare, browser, runner]) {
    assert.match(source, /runtimeAuthorityGranted["']?\s*[:=]\s*False|runtimeAuthorityGranted:\s*false/);
    assert.match(source, /productionApproval["']?\s*[:=]\s*False|productionApproval:\s*false|productionDeviceApproval:\s*false/);
  }
});

test('D3 selects provider-specific precision instead of claiming universal FP16 CPU support', () => {
  assert.match(prepare, /providerSpecificPrecisionTiers/);
  assert.match(prepare, /FP16_INTERNAL_FP32_INT64_IO/);
  assert.match(prepare, /SEPARATE_UINT8_OR_FP32_FEASIBILITY_REQUIRED/);
  assert.match(prepare, /universalFp16CpuTierClaimed["']?: False/);
  assert.match(prepare, /keep_io_types=True/);
  assert.match(prepare, /keepIoTypes["']?: True/);
  assert.match(prepare, /onnxconverter_common\.float16\.convert_float_to_float16/);
  assert.match(prepare, /EXPECTED_CONVERTER = "1\.16\.0"/);
});

test('D3 FP16 preparation is bound to D2 3/3 identities and standard ONNX graphs', () => {
  assert.match(prepare, /passCount.*!= 3/);
  assert.match(prepare, /allComponentsPass/);
  assert.match(prepare, /blockedComponents/);
  assert.match(prepare, /sha256_file\(path\).*artifact\.get\("sha256"\)/s);
  assert.match(prepare, /D3 custom-domain nodes rejected/);
  assert.match(prepare, /D3 ATen-like nodes rejected/);
  assert.match(prepare, /D3 custom function domains rejected/);
  assert.match(prepare, /converted_contract != source_contract/);
  assert.match(prepare, /FP16 conversion produced no FLOAT16 initializer elements/);
  assert.match(prepare, /0\.45 <= ratio <= 0\.75/);
  assert.match(prepare, /releaseIdentityPinned["']?: False/);
  assert.match(prepare, /onnx\.checker\.check_model\(model, full_check=True\)/);
});

test('D3 repairs only the known converter Cast-to-FLOAT inconsistency and remains fail-closed', () => {
  assert.match(prepare, /repair_converter_internal_float_casts/);
  assert.match(prepare, /SOURCE_CAST_FLOAT_TO_CONVERTER_DECLARED_FP16_ONLY/);
  assert.match(prepare, /converted_types\.get\(output_name\) != TensorProto\.FLOAT16/);
  assert.match(prepare, /output_name in public_outputs/);
  assert.match(prepare, /source != \(\(output_name,\), TensorProto\.FLOAT\)/);
  assert.match(prepare, /attribute\.i = TensorProto\.FLOAT16/);
  assert.match(prepare, /NARROW_CONVERTER_COMPATIBILITY_REPAIR_ONLY/);
  assert.doesNotMatch(prepare, /value_info\.clear\(|ClearField\(["']value_info["']\)/);
  assert.doesNotMatch(prepare, /full_check=False/);
});

test('D3 browser WebGPU proof is capability-first, URL-backed and forbids WASM fallback', () => {
  assert.match(browser, /onnxruntime-web\/webgpu/);
  assert.match(browser, /executionProviders: \['webgpu'\]/);
  assert.match(browser, /providerFallbackAllowed: false/);
  assert.match(browser, /hostedSoftwareFeasibilityOnly: true/);
  assert.match(browser, /realDeviceEvidence: false/);
  assert.match(browser, /gpuPeakMemoryApi: 'UNAVAILABLE_STANDARD_BROWSER_API'/);
  assert.match(browser, /softwareAdapterLikely/);
  assert.match(browser, /features: Array\.from\(adapter\?\.features/);
  assert.match(browser, /maxBufferSize/);
  assert.match(browser, /maxStorageBufferBindingSize/);
  assert.match(browser, /REQUIRED_FP16_FEATURES = \['shader-f16'\]/);
  assert.match(browser, /missingRequiredFeatures/);
  assert.match(browser, /blockerClass: 'REQUIRED_FEATURE_UNAVAILABLE'/);
  assert.match(browser, /sessionAttempted: false/);
  assert.match(browser, /modelMaterializedInJs: false/);
  assert.match(browser, /InferenceSession\.create\(modelUrl, \{ executionProviders: \['webgpu'\] \}\)/);
  assert.doesNotMatch(browser, /fetchBytes\(modelUrl\)/);
  assert.match(browser, /D2_ACCEPTED_FP32_CPU_ORT_OUTPUT/);
  assert.match(runner, /modelBytes: record\.fp16\.size/);
  assert.match(runner, /--use-angle=swiftshader/);
  assert.match(runner, /externalHttpRequests/);
  assert.match(runner, /REQUIRED_FEATURE_UNAVAILABLE/);
  assert.match(runner, /WEBGPU_PARITY_FAILED/);
  assert.match(runner, /WEBGPU_BROWSER_PROCESS_BLOCKED/);
  assert.match(runner, /PASS/);
  assert.doesNotMatch(browser, /executionProviders:\s*\[['"]webgpu['"],\s*['"]wasm['"]\]/);
});

test('D3 precision and browser evidence keep binaries runner-local', () => {
  assert.match(prepare, /binaryArtifactsRunnerLocalOnly["']?: True/);
  assert.match(prepare, /releaseIdentityPinned["']?: False/);
  assert.doesNotMatch(prepare, /PRIVATE KEY/);
});
