import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const manifest = JSON.parse(await readFile(new URL('../src/platform/creative/local-ai/models/tiny-sd-generation.manifest.json', import.meta.url), 'utf8'));
const prepare = await readFile(new URL('../scripts/prepare-tiny-sd-d3-fp16-webgpu.py', import.meta.url), 'utf8');
const browser = await readFile(new URL('../tests/tiny-sd-d3-browser-webgpu.html', import.meta.url), 'utf8');
const runner = await readFile(new URL('../scripts/test-tiny-sd-d3-browser-webgpu.mjs', import.meta.url), 'utf8');
const quantizeWasm = await readFile(new URL('../scripts/prepare-tiny-sd-d3-wasm-quantized.py', import.meta.url), 'utf8');
const matrixWasm = await readFile(new URL('../scripts/prepare-tiny-sd-d3-wasm-strategy-matrix.py', import.meta.url), 'utf8');
const browserWasm = await readFile(new URL('../tests/tiny-sd-d3-browser-wasm.html', import.meta.url), 'utf8');
const runnerWasm = await readFile(new URL('../scripts/test-tiny-sd-d3-browser-wasm.mjs', import.meta.url), 'utf8');

test('D3 remains advisory and cannot grant Tiny-SD runtime or production authority', () => {
  assert.equal(manifest.status, 'CANDIDATE');
  assert.equal(manifest.artifactState, 'TRUST_ROOT_PINNED_RUNTIME_FEASIBILITY_REQUIRED');
  assert.equal(manifest.runtimeFeasibility.runtimeAuthorityGranted, false);
  assert.equal(manifest.productionApprovalEvidence, null);
  assert.equal('artifacts' in manifest, false);
  for (const source of [prepare, browser, runner, quantizeWasm, matrixWasm, browserWasm, runnerWasm]) {
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

test('D3 WASM baseline is component-specific and fail-closed before browser execution', () => {
  assert.match(quantizeWasm, /DYNAMIC_U8_WEIGHT_MATMUL/);
  assert.match(quantizeWasm, /STATIC_QDQ_U8S8_CONV_MATMUL_GEMM/);
  assert.match(quantizeWasm, /fullInt8UniversalPackClaimed["']?: False/);
  assert.match(quantizeWasm, /CalibrationMethod\.MinMax/);
  assert.match(quantizeWasm, /QuantFormat\.QDQ/);
  assert.match(quantizeWasm, /activation_type=QuantType\.QUInt8/);
  assert.match(quantizeWasm, /weight_type=QuantType\.QInt8/);
  assert.match(quantizeWasm, /weight_type=QuantType\.QUInt8/);
  assert.match(quantizeWasm, /SYNTHETIC_DETERMINISTIC_RANGE_PROBE_NOT_DATASET_AUTHORITY/);
  assert.match(quantizeWasm, /productionQualityAuthority["']?: False/);
  assert.match(quantizeWasm, /onnx\.checker\.check_model\(model, full_check=True\)/);
  assert.match(quantizeWasm, /inventory\["domains"\] != \["ai\.onnx"\]/);
  assert.match(quantizeWasm, /inventory\["functionCount"\] != 0/);
  assert.match(quantizeWasm, /WASM_COMPACT_NUMERIC_RISK/);
  assert.match(quantizeWasm, /WASM_COMPACT_SIZE_BLOCKED/);
  assert.match(quantizeWasm, /WASM_COMPACT_TRANSFORM_BLOCKED/);
  assert.match(quantizeWasm, /maxAbsOverReferenceMaxAbs/);
  assert.match(quantizeWasm, /rmseOverReferenceRms/);
  assert.doesNotMatch(quantizeWasm, /strict=False/);
});

test('D3 WASM strategy matrix compares signed, unsigned and weight-only paths without weakening parity', () => {
  assert.match(quantizeWasm, /prepare-tiny-sd-d3-wasm-strategy-matrix\.py/);
  assert.match(quantizeWasm, /MULTI_STRATEGY_NATIVE_PARITY_SELECTION/);
  assert.match(quantizeWasm, /MIN_SIZE_AMONG_ORIGINAL_D3_NATIVE_PARITY_PASSING_CANDIDATES/);
  assert.match(quantizeWasm, /nativeOrtParity.*passed/s);
  assert.match(matrixWasm, /DYNAMIC_U8S8_WEIGHT_MATMUL/);
  assert.match(matrixWasm, /STATIC_QDQ_S8S8_CONV_MATMUL_GEMM/);
  assert.match(matrixWasm, /STATIC_QDQ_U8U8_CONV_MATMUL_GEMM/);
  assert.match(matrixWasm, /WEIGHT_ONLY_QDQ_S8_FP32_ACTIVATIONS/);
  assert.match(matrixWasm, /runtimeComputeClaimedInteger["']?: False/);
  assert.match(matrixWasm, /activationType["']?: "FLOAT"/);
  assert.match(matrixWasm, /onnx\.checker\.check_model\(model, full_check=True\)/);
  assert.match(matrixWasm, /inventory\["ioContract"\] != expected_io/);
  assert.match(matrixWasm, /inventory\["domains"\] != \["ai\.onnx"\]/);
  assert.match(matrixWasm, /inventory\["functionCount"\] != 0/);
  assert.match(matrixWasm, /ratio < 0\.80 and parity\["passed"\]/);
  assert.match(matrixWasm, /fullInt8UniversalPackClaimed["']?: False/);
  assert.doesNotMatch(matrixWasm, /strict=False|full_check=False/);
});

test('D3 WASM weight-only rewrite preserves FLOAT metadata instead of erasing type evidence', () => {
  execFileSync('python', ['-m', 'py_compile', 'scripts/prepare-tiny-sd-d3-wasm-strategy-matrix.py'], { stdio: 'pipe' });
  assert.match(matrixWasm, /quantized_name = f"\{weight_name\}__d3_weight_quantized"/);
  assert.match(matrixWasm, /numpy_helper\.from_array\(quantized, name=quantized_name\)/);
  assert.match(matrixWasm, /\[quantized_name, scale_name, zero_name\]/);
  assert.match(matrixWasm, /\[weight_name\]/);
  assert.match(matrixWasm, /sourceWeightNamePreservedAsFloatDequantizedValue["']?: True/);
  assert.match(matrixWasm, /quantizedInitializerNamesAreDisjointFromSourceFp32Names["']?: True/);
  assert.match(matrixWasm, /generated_names & reserved_tensor_names/);
  assert.doesNotMatch(matrixWasm, /numpy_helper\.from_array\(quantized, name=weight_name\)/);
  assert.doesNotMatch(matrixWasm, /value_info\.clear\(|ClearField\(["']value_info["']\)/);
});

test('D3 WASM fixtures are generated independently from the D2 FP32 root', () => {
  assert.match(quantizeWasm, /parser\.add_argument\("--fixture-dir"/);
  assert.match(quantizeWasm, /"browserFixture": browser_fixture\(/);
  assert.match(quantizeWasm, /D2_ACCEPTED_FP32_CPU_ORT_OUTPUT/);
  assert.match(quantizeWasm, /InferenceSession\(str\(fp32\), providers=\["CPUExecutionProvider"\]\)/);
  assert.match(runnerWasm, /const fixture = record\.browserFixture/);
  assert.doesNotMatch(runnerWasm, /fixture-report|fixtureReportPath|D3_WEBGPU_FP16_PREPARATION/);
});

test('D3 WASM browser proof uses the production factory, local runtime assets and no provider fallback', () => {
  assert.match(browserWasm, /BrowserOnnxSessionFactory/);
  assert.match(browserWasm, /factory\.create\(modelBytes, \{ executionProviders: \['wasm'\] \}\)/);
  assert.match(browserWasm, /providerFallbackAllowed: false/);
  assert.match(browserWasm, /crossOriginIsolated/);
  assert.match(browserWasm, /D2_ACCEPTED_FP32_CPU_ORT_OUTPUT/);
  assert.match(runnerWasm, /Cross-Origin-Opener-Policy/);
  assert.match(runnerWasm, /Cross-Origin-Embedder-Policy/);
  assert.match(runnerWasm, /externalHttpRequests/);
  assert.match(runnerWasm, /WASM_COMPACT_PRE_BROWSER_BLOCKED/);
  assert.match(runnerWasm, /productionFactory: 'BrowserOnnxSessionFactory'/);
  assert.match(runnerWasm, /PASS/);
  assert.doesNotMatch(browserWasm, /executionProviders:\s*\[['"]wasm['"],\s*['"]webgpu['"]\]/);
});

test('D3 precision and browser evidence keep binaries runner-local', () => {
  assert.match(prepare, /binaryArtifactsRunnerLocalOnly["']?: True/);
  assert.match(prepare, /releaseIdentityPinned["']?: False/);
  assert.match(quantizeWasm, /binaryArtifactsRunnerLocalOnly["']?: True/);
  assert.match(quantizeWasm, /releaseIdentityPinned["']?: False/);
  assert.match(matrixWasm, /binaryArtifactsRunnerLocalOnly["']?: True/);
  assert.match(matrixWasm, /releaseIdentityPinned["']?: False/);
  assert.doesNotMatch(prepare, /PRIVATE KEY/);
  assert.doesNotMatch(quantizeWasm, /PRIVATE KEY/);
  assert.doesNotMatch(matrixWasm, /PRIVATE KEY/);
});
