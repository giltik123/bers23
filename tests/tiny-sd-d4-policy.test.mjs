import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const runtime = await readFile(new URL('../src/platform/creative/local-ai/runtimes/OnnxLocalRuntime.ts', import.meta.url), 'utf8');
const platform = await readFile(new URL('../src/platform/creative/local-ai/LocalAIPlatform.ts', import.meta.url), 'utf8');
const memoryStorage = await readFile(new URL('../src/platform/creative/local-ai/lifecycle/InMemoryFleetStorage.ts', import.meta.url), 'utf8');
const indexedStorage = await readFile(new URL('../src/platform/creative/local-ai/lifecycle/IndexedDbFleetStorage.ts', import.meta.url), 'utf8');
const factory = await readFile(new URL('../src/platform/creative/local-ai/browser/BrowserOnnxSessionFactory.ts', import.meta.url), 'utf8');
const prepare = await readFile(new URL('../scripts/prepare-tiny-sd-d4-ort.py', import.meta.url), 'utf8');
const browser = await readFile(new URL('../tests/tiny-sd-d4-browser-wasm.html', import.meta.url), 'utf8');
const runner = await readFile(new URL('../scripts/test-tiny-sd-d4-browser-wasm.mjs', import.meta.url), 'utf8');

test('D4 owned bytes remain an explicit capability while borrowed loads keep cloning', () => {
  assert.match(runtime, /load\(model: ModelManifest, bytes: Uint8Array\).*#load\(model, bytes, 'BORROWED_CLONED'\)/s);
  assert.match(runtime, /loadOwnedVerifiedArtifact\(model: ModelManifest, bytes: Uint8Array\).*#load\(model, bytes, 'OWNED_VERIFIED'\)/s);
  assert.match(runtime, /ownership === 'OWNED_VERIFIED' \? bytes : bytes\.slice\(\)/);
  assert.match(runtime, /if \(ownership === 'OWNED_VERIFIED'\) this\.#ownedModelBytes = bytes/);
  assert.match(runtime, /await this\.#session\?\.release\?\.\(\);[\s\S]*this\.#ownedModelBytes = undefined/);
  assert.match(platform, /const durableOwnedArtifact = Boolean\(this\.#fleet\)/);
  assert.match(platform, /if \(durableOwnedArtifact\) await runtime\.loadOwnedVerifiedArtifact\(model, bytes\)/);
  assert.match(platform, /else await runtime\.load\(model, bytes\)/);
  assert.match(platform, /bytes && bytes\.byteLength === record\.manifest\.sizeBytes \? await this\.verifyModel\(record\.manifest, bytes\)/);
  assert.match(platform, /Durable active model failed integrity revalidation/);
  assert.match(memoryStorage, /read\(hash: string\).*this\.backing\.blobs\.get\(hash\)\?\.slice\(\)/s);
  assert.match(indexedStorage, /read\(hash: string\).*store\.get\(hash\)/s);
});

test('D4 ORT converter is pinned, API-based, portable and independently fail-closed per component', () => {
  execFileSync('python', ['-m', 'py_compile', 'scripts/prepare-tiny-sd-d4-ort.py'], { stdio: 'pipe' });
  assert.match(prepare, /EXPECTED_ORT_VERSION = "1\.27\.0"/);
  assert.match(prepare, /from onnxruntime\.tools\.convert_onnx_models_to_ort import OptimizationStyle, convert_onnx_models_to_ort/);
  assert.match(prepare, /convert_onnx_models_to_ort\([\s\S]*optimization_styles=\[OptimizationStyle\.Fixed\]/);
  assert.match(prepare, /target_platform=None/);
  assert.match(prepare, /allow_conversion_failures=False/);
  assert.match(prepare, /enable_type_reduction=False/);
  assert.match(prepare, /ORT_CONVERT_ONNX_MODELS_TO_ORT_OPTIMIZATION_LEVEL/);
  assert.match(prepare, /optimization_level != "all"/);
  assert.match(prepare, /CONVERTER_DIAGNOSTIC_LIMIT = 4096/);
  assert.match(prepare, /converterOutputTail/);
  assert.doesNotMatch(prepare, /subprocess\.run/);
  assert.doesNotMatch(prepare, /["']-m["']\s*,\s*["']onnxruntime\.tools\.convert_onnx_models_to_ort/);
  assert.doesNotMatch(prepare, /--target_platform["']?,\s*["']amd64/);
  assert.match(prepare, /EXACT_FP16_STORAGE_FP32_COMPUTE/);
  assert.match(prepare, /D4_ORT_CONVERSION_BLOCKED/);
  assert.match(prepare, /D4_ORT_PARITY_FAILED/);
  assert.match(prepare, /D4_ORT_NATIVE_PASS/);
  assert.match(prepare, /D2_ACCEPTED_FP32_CPU_ORT_OUTPUT/);
  assert.match(prepare, /singleArtifactSharedByOrtRuntimeVariants/);
  assert.match(prepare, /ONE_ORT_ARTIFACT_TWO_RUNTIME_POLICIES_PLUS_ONNX_BASELINE/);
  assert.doesNotMatch(prepare, /maxAbsOverReferenceMaxAbs["']?\s*[:=]\s*0\.0[3-9]/);
  assert.doesNotMatch(prepare, /rmseOverReferenceRms["']?\s*[:=]\s*0\.0[2-9]/);
});

test('D4 browser ORT modes expose only the reviewed memory policy and keep worker-free security baseline', () => {
  assert.match(factory, /BrowserOrtFormatMemoryMode = 'DEFAULT' \| 'MEMORY_FIRST'/);
  assert.match(factory, /load_model_format: 'ORT'/);
  assert.match(factory, /use_ort_model_bytes_for_initializers: '1'/);
  assert.match(factory, /disable_prepacking: '1'/);
  assert.match(factory, /extra: \{ session: \{ \.\.\.sessionConfig \} \}/);
  assert.doesNotMatch(factory, /extra: \{ session: sessionConfig \}/);
  assert.match(factory, /ORT Web 1\.27 appends use_ort_model_bytes_directly/);
  assert.match(factory, /BROWSER_WASM_NUM_THREADS = 1/);
  assert.match(factory, /BROWSER_WASM_PROXY = false/);
  assert.match(factory, /DISABLED_PENDING_SEPARATE_SECURITY_REVIEW/);
  assert.match(factory, /node_modules\/onnxruntime-web\/dist\/ort-wasm-simd-threaded\.wasm\?url/);
  assert.match(factory, /node_modules\/onnxruntime-web\/dist\/ort-wasm-simd-threaded\.mjs\?url/);
  assert.doesNotMatch(factory, /https?:\/\//i);
  assert.doesNotMatch(factory, /from\s+['"]\/\//i);
  assert.doesNotMatch(factory, /new Worker\s*\(/);
  assert.doesNotMatch(factory, /trustedTypes\.createPolicy|createPolicy\s*\(/);
  assert.doesNotMatch(factory, /createOrtFormat\([^)]*sessionConfig/);
});

test('D4 real Chrome comparison is A/B/C, isolated, parity-bound and honest about observable memory', () => {
  assert.match(browser, /ONNX_BASELINE/);
  assert.match(browser, /ORT_DEFAULT/);
  assert.match(browser, /ORT_MEMORY_FIRST/);
  assert.match(browser, /factory\.create\(modelBytes, \{ executionProviders: \['wasm'\] \}\)/);
  assert.match(browser, /factory\.createOrtFormat\(modelBytes/);
  assert.match(browser, /performance\?\.memory/);
  assert.match(browser, /kind: 'JS_HEAP_ONLY'/);
  assert.match(browser, /reliableWasmNativePeakMemoryApi: false/);
  assert.match(browser, /reliableGpuPeakMemoryApi: false/);
  assert.match(browser, /D2_ACCEPTED_FP32_CPU_ORT_OUTPUT/);
  assert.match(browser, /providerFallbackAllowed: false/);
  assert.match(runner, /for \(const variant of VARIANTS\) components\[component\]\[variant\] = await runVariant\(component, variant\)/);
  assert.match(runner, /chromium\.launch\(\{ channel: 'chrome', headless: true/);
  assert.match(runner, /Cross-Origin-Opener-Policy/);
  assert.match(runner, /Cross-Origin-Embedder-Policy/);
  assert.match(runner, /externalHttpRequests/);
  assert.match(runner, /numThreads, 1/);
  assert.match(runner, /proxy, false/);
  assert.match(runner, /workerFree, true/);
  assert.doesNotMatch(browser, /executionProviders:\s*\[['"]wasm['"],\s*['"]webgpu['"]\]/);
});

test('D4 remains research-only and keeps model binaries out of evidence', () => {
  for (const source of [prepare, browser, runner]) {
    assert.match(source, /runtimeAuthorityGranted["']?\s*[:=]\s*False|runtimeAuthorityGranted:\s*false/);
    assert.match(source, /productionApproval["']?\s*[:=]\s*False|productionApproval:\s*false|productionDeviceApproval:\s*false/);
  }
  assert.match(prepare, /binaryArtifactsRunnerLocalOnly["']?: True/);
  assert.match(prepare, /releaseIdentityPinned["']?: False/);
  assert.doesNotMatch(prepare, /PRIVATE KEY/);
});
