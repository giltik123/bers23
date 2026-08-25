import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import { build } from 'vite';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!key?.startsWith('--') || value === undefined) throw new Error(`invalid argument pair at ${key ?? '<missing>'}`);
  args.set(key.slice(2), value);
}
const required = name => {
  const value = args.get(name);
  if (!value) throw new Error(`--${name} is required`);
  return path.resolve(value);
};

const modelPath = required('model');
const inputPath = required('input');
const referencePath = required('reference');
const cpuEvidencePath = required('cpu-evidence');
const wasmEvidencePath = required('wasm-evidence');
const reportPath = required('report');
const outputDir = path.resolve('.test-cache/lama-browser-webgpu-dist');
const port = 4176;
const origin = `http://127.0.0.1:${port}`;
const OUTER_BROWSER_TIMEOUT_MS = 150_000;
const launchArgs = [
  '--enable-unsafe-webgpu',
  '--use-angle=swiftshader',
  '--enable-features=Vulkan',
  '--disable-vulkan-surface',
];

const hashFile = async file => new Promise((resolve, reject) => {
  const hash = createHash('sha256');
  const stream = createReadStream(file);
  stream.on('data', chunk => hash.update(chunk));
  stream.on('error', reject);
  stream.on('end', () => resolve(hash.digest('hex')));
});

const [cpuBytes, wasmBytes] = await Promise.all([fs.readFile(cpuEvidencePath), fs.readFile(wasmEvidencePath)]);
const cpuEvidence = JSON.parse(cpuBytes.toString('utf8'));
const wasmEvidence = JSON.parse(wasmBytes.toString('utf8'));
assert.equal(cpuEvidence.status, 'CANDIDATE');
assert.equal(cpuEvidence.runtimeAuthorityGranted, false);
assert.equal(cpuEvidence.productionDeviceApproval, false);
assert.equal(cpuEvidence.export.result, 'EXPORTED_STANDARD_DFT_CPU_ORT_MULTISHAPE_PASS');
assert.equal(cpuEvidence.cpuOrt.result, 'PASS');
assert.deepEqual(cpuEvidence.browserReference?.shape, [256, 256]);
assert.equal(cpuEvidence.browserReference?.referenceKind, 'PINNED_PYTORCH_GENERATOR_FLOAT32');
assert.equal(cpuEvidence.browserReference?.cpuOrtForSameShape, 'PASS');
assert.equal(wasmEvidence.status, 'CANDIDATE');
assert.equal(wasmEvidence.result, 'PASS');
assert.equal(wasmEvidence.provider, 'wasm');
assert.equal(wasmEvidence.modelSha256, cpuEvidence.export.sha256);
assert.equal(wasmEvidence.runtimeAuthorityGranted, false);
assert.equal(wasmEvidence.productionDeviceApproval, false);

const [modelStat, inputStat, referenceStat, modelSha] = await Promise.all([
  fs.stat(modelPath), fs.stat(inputPath), fs.stat(referencePath), hashFile(modelPath),
]);
assert.equal(modelStat.size, cpuEvidence.export.size, 'WebGPU model size differs from CPU-tested dynamic ONNX');
assert.equal(modelSha, cpuEvidence.export.sha256, 'WebGPU model SHA differs from CPU-tested dynamic ONNX');
assert.equal(inputStat.size, cpuEvidence.browserReference.inputFileBytes, 'WebGPU input file size mismatch');
assert.equal(referenceStat.size, cpuEvidence.browserReference.referenceFileBytes, 'WebGPU reference file size mismatch');

await build({
  root: path.resolve('.'),
  build: {
    outDir: outputDir,
    emptyOutDir: true,
    rollupOptions: { input: path.resolve('tests/lama-browser-webgpu-feasibility.html') },
  },
});

const specialFiles = new Map([
  ['/__lama/model.onnx', { file: modelPath, type: 'application/octet-stream' }],
  ['/__lama/input.f32', { file: inputPath, type: 'application/octet-stream' }],
  ['/__lama/reference.f32', { file: referencePath, type: 'application/octet-stream' }],
]);
const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'], ['.wasm', 'application/wasm'],
]);

const server = http.createServer(async (request, response) => {
  try {
    const requestPath = decodeURIComponent(new URL(request.url ?? '/', origin).pathname);
    const special = specialFiles.get(requestPath);
    if (special) {
      const stat = await fs.stat(special.file);
      response.statusCode = 200;
      response.setHeader('Content-Type', special.type);
      response.setHeader('Content-Length', String(stat.size));
      response.setHeader('Cache-Control', 'no-store');
      createReadStream(special.file).pipe(response);
      return;
    }
    const file = path.resolve(outputDir, `.${requestPath}`);
    if (file !== outputDir && !file.startsWith(`${outputDir}${path.sep}`)) throw new Error('path traversal');
    const body = await fs.readFile(file);
    response.statusCode = 200;
    response.setHeader('Content-Type', contentTypes.get(path.extname(file)) ?? 'application/octet-stream');
    response.setHeader('Cache-Control', 'no-store');
    response.end(body);
  } catch {
    response.statusCode = 404;
    response.end('Not found');
  }
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(port, '127.0.0.1', resolve);
});

let browser;
try {
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs });
  } catch (error) {
    throw new Error(`Mandatory system Google Chrome WebGPU launch failed: ${error instanceof Error ? error.message : error}`);
  }
  const browserProductVersion = browser.version();
  const page = await browser.newPage();
  const diagnostics = {
    pageErrors: [], consoleErrors: [], externalHttpRequests: [], failedRequests: [], failedResponses: [],
  };
  page.on('pageerror', error => diagnostics.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') diagnostics.consoleErrors.push(message.text()); });
  page.on('request', request => {
    const url = request.url();
    if (/^https?:/i.test(url) && new URL(url).origin !== origin) diagnostics.externalHttpRequests.push(url);
  });
  page.on('requestfailed', request => diagnostics.failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? 'unknown' }));
  page.on('response', response => {
    if (response.status() >= 400) diagnostics.failedResponses.push({ url: response.url(), status: response.status() });
  });

  await page.goto(`${origin}/tests/lama-browser-webgpu-feasibility.html`);
  try {
    await page.waitForFunction(() => typeof globalThis.runLamaBrowserWebGpuFeasibility === 'function', undefined, { timeout: 15_000 });
  } catch (error) {
    throw new Error(`LAMA_BROWSER_WEBGPU_BOOTSTRAP_FAILED\n${JSON.stringify(diagnostics, null, 2)}\n${error instanceof Error ? error.message : error}`);
  }

  let outerTimer;
  const browserEvaluation = page.evaluate(async input => globalThis.runLamaBrowserWebGpuFeasibility(input), {
    modelUrl: '/__lama/model.onnx', inputUrl: '/__lama/input.f32', referenceUrl: '/__lama/reference.f32',
    height: 256, width: 256,
  });
  const outerTimeout = new Promise(resolve => {
    outerTimer = setTimeout(() => resolve({
      schemaVersion: 1,
      status: 'CANDIDATE',
      result: 'WEBGPU_INFERENCE_BLOCKED',
      provider: 'webgpu',
      onnxruntimeWebVersion: '1.27.0',
      shape: [256, 256],
      modelBytes: modelStat.size,
      runtimeAuthorityGranted: false,
      productionDeviceApproval: false,
      browserExecutionIsProductionApproval: false,
      productionPromotionAllowed: false,
      hostedSoftwareFeasibilityOnly: true,
      providerFallbackAllowed: false,
      executionProviders: ['webgpu'],
      timeoutStage: 'OUTER_BROWSER_EVALUATION',
      outerBrowserTimeoutMs: OUTER_BROWSER_TIMEOUT_MS,
      error: `WebGPU browser evaluation exceeded ${OUTER_BROWSER_TIMEOUT_MS}ms`,
    }), OUTER_BROWSER_TIMEOUT_MS);
  });
  const runtimeReport = await Promise.race([browserEvaluation, outerTimeout]);
  clearTimeout(outerTimer);

  assert.equal(runtimeReport.status, 'CANDIDATE');
  assert.equal(runtimeReport.provider, 'webgpu');
  assert.equal(runtimeReport.onnxruntimeWebVersion, '1.27.0');
  assert.deepEqual(runtimeReport.shape, [256, 256]);
  assert.equal(runtimeReport.runtimeAuthorityGranted, false);
  assert.equal(runtimeReport.productionDeviceApproval, false);
  assert.equal(runtimeReport.browserExecutionIsProductionApproval, false);
  assert.equal(runtimeReport.productionPromotionAllowed, false);
  assert.equal(runtimeReport.hostedSoftwareFeasibilityOnly, true);
  assert.equal(runtimeReport.providerFallbackAllowed, false);
  assert.deepEqual(runtimeReport.executionProviders, ['webgpu']);
  assert.equal(runtimeReport.modelBytes, modelStat.size);
  assert.deepEqual(diagnostics.externalHttpRequests, [], `WebGPU browser attempted external HTTP(S): ${JSON.stringify(diagnostics.externalHttpRequests)}`);
  assert.deepEqual(diagnostics.pageErrors, [], `WebGPU browser page errors: ${JSON.stringify(diagnostics.pageErrors)}`);

  const allowed = new Set([
    'WEBGPU_API_UNAVAILABLE',
    'WEBGPU_ADAPTER_REQUEST_FAILED',
    'WEBGPU_ADAPTER_UNAVAILABLE',
    'WEBGPU_SESSION_BLOCKED',
    'WEBGPU_INFERENCE_BLOCKED',
    'WEBGPU_PARITY_FAILED',
    'PASS',
  ]);
  assert.ok(allowed.has(runtimeReport.result), `unexpected WebGPU result ${runtimeReport.result}`);
  if (runtimeReport.result === 'PASS') {
    assert.deepEqual(runtimeReport.outputTensorShape, [1, 3, 256, 256]);
    assert.equal(runtimeReport.referenceKind, 'PINNED_PYTORCH_GENERATOR_FLOAT32');
    assert.ok(runtimeReport.metrics.maxAbs <= 2e-4, `WebGPU maxAbs ${runtimeReport.metrics.maxAbs}`);
    assert.ok(runtimeReport.metrics.rmse <= 5e-5, `WebGPU RMSE ${runtimeReport.metrics.rmse}`);
    assert.ok(runtimeReport.outputRange[0] >= -1e-6 && runtimeReport.outputRange[1] <= 1 + 1e-6);
    assert.ok(runtimeReport.adapter, 'WebGPU PASS requires adapter evidence');
  }

  const finalReport = {
    schemaVersion: 1,
    ...runtimeReport,
    modelSha256: modelSha,
    cpuEvidenceSha256: createHash('sha256').update(cpuBytes).digest('hex'),
    wasmEvidenceSha256: createHash('sha256').update(wasmBytes).digest('hex'),
    cpuEvidenceResult: cpuEvidence.export.result,
    cpuOrtSameShapeResult: cpuEvidence.cpuOrt.shapeResults.find(item => item.shape[0] === 256 && item.shape[1] === 256)?.result ?? null,
    wasmSameShapeResult: wasmEvidence.result,
    browserProductVersion,
    launchArgs,
    networkDiagnostics: diagnostics,
    hostedRunner: true,
    realDeviceEvidence: false,
    browserExecutionIsProductionApproval: false,
    productionPromotionAllowed: false,
  };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(finalReport, null, 2)}\n`);
  console.log(`LAMA C7 BROWSER WEBGPU: ${finalReport.result}`);
  console.log(JSON.stringify(finalReport, null, 2));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
