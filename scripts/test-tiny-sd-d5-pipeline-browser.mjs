import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import { build } from 'vite';
import { evaluateComposedParity } from './evaluate-tiny-sd-d5-composed-parity.mjs';
import {
  D5_PIPELINE_AUTHORITY,
  D5_PIPELINE_COMPOSED_PARITY_POLICY,
  D5_PIPELINE_SELECTED_SCHEME,
  D5_PIPELINE_STEP_COUNT,
} from './tiny-sd-d5-pipeline-constants.mjs';

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

const modelDir = required('model-dir');
const tokenizerDir = required('tokenizer-dir');
const quantReportPath = required('quant-report');
const controlReferencePath = required('control-reference');
const nativeReferencePath = required('native-reference');
const fixtureDir = required('fixture-dir');
const reportPath = required('report');
const outputDir = path.resolve('.test-cache/tiny-sd-d5-pipeline-dist');
const port = 4182;
const origin = `http://127.0.0.1:${port}`;
const OUTER_TIMEOUT_MS = 900_000;
const BROWSER_RERUN_COUNT = 2;
const COMPONENTS = ['text_encoder', 'unet', 'vae_decoder'];

const shaFile = async file => new Promise((resolve, reject) => {
  const hash = createHash('sha256');
  const stream = createReadStream(file);
  stream.on('data', chunk => hash.update(chunk));
  stream.on('error', reject);
  stream.on('end', () => resolve(hash.digest('hex')));
});

const [quantBytes, controlBytes, nativeBytes] = await Promise.all([
  fs.readFile(quantReportPath), fs.readFile(controlReferencePath), fs.readFile(nativeReferencePath),
]);
const quant = JSON.parse(quantBytes.toString('utf8'));
const controlReference = JSON.parse(controlBytes.toString('utf8'));
const nativeReference = JSON.parse(nativeBytes.toString('utf8'));
assert.equal(controlReference.stage, 'D5_CONTROL_SEMANTICS_REFERENCE');
assert.equal(controlReference.authority, D5_PIPELINE_AUTHORITY);
assert.equal(nativeReference.stage, 'D5_NATIVE_SELECTED_PIPELINE_REFERENCE');
assert.equal(nativeReference.authority, D5_PIPELINE_AUTHORITY);
assert.equal(nativeReference.composedParityPolicy, D5_PIPELINE_COMPOSED_PARITY_POLICY);
assert.equal(nativeReference.stepCount, D5_PIPELINE_STEP_COUNT);
assert.equal(nativeReference.deterministicRerunExact, true);
assert.equal(nativeReference.runtime.package, 'onnxruntime-node');
assert.deepEqual(nativeReference.runtime.executionProviders, ['cpu']);
assert.equal(quant.stage, 'D3_WASM_COMPACT_PREPARATION');

for (const component of COMPONENTS) {
  const record = quant.components[component];
  const expected = nativeReference.modelEvidence[component];
  assert.equal(record.result, 'WASM_COMPACT_NATIVE_PASS');
  assert.equal(record.transform.scheme, D5_PIPELINE_SELECTED_SCHEME);
  assert.equal(expected.scheme, D5_PIPELINE_SELECTED_SCHEME);
  assert.equal(record.candidate.sha256, expected.sha256);
  assert.equal(record.candidate.size, expected.bytes);
  const file = path.join(modelDir, `${component}.onnx`);
  assert.equal((await fs.stat(file)).size, expected.bytes, `${component} model size mismatch`);
  assert.equal(await shaFile(file), expected.sha256, `${component} model SHA mismatch`);
}
for (const [name, record] of Object.entries(nativeReference.stageFiles)) {
  const file = path.join(fixtureDir, record.path);
  assert.equal((await fs.stat(file)).size, record.bytes, `${name} fixture size mismatch`);
  assert.equal(await shaFile(file), record.sha256, `${name} fixture SHA mismatch`);
}

await build({
  root: path.resolve('.'),
  build: { outDir: outputDir, emptyOutDir: true, rollupOptions: { input: path.resolve('tests/tiny-sd-d5-pipeline-browser.html') } },
});

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.mjs', 'text/javascript; charset=utf-8'],
  ['.wasm', 'application/wasm'], ['.onnx', 'application/octet-stream'], ['.f32', 'application/octet-stream'], ['.json', 'application/json; charset=utf-8'], ['.txt', 'text/plain; charset=utf-8'],
]);
const setIsolationHeaders = response => {
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
};
const safeChild = (root, child) => {
  const resolved = path.resolve(root, child);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error('path traversal');
  return resolved;
};
const resolveSpecial = requestPath => {
  const model = requestPath.match(/^\/__tiny_sd_d5\/model\/(text_encoder|unet|vae_decoder)\.onnx$/);
  if (model) return path.join(modelDir, `${model[1]}.onnx`);
  const reference = requestPath.match(/^\/__tiny_sd_d5\/reference\/([A-Za-z0-9_.-]+\.f32)$/);
  if (reference) return safeChild(fixtureDir, reference[1]);
  const tokenizer = requestPath.match(/^\/__tiny_sd_d5\/models\/tiny-sd-tokenizer\/([A-Za-z0-9_.-]+)$/);
  if (tokenizer) return safeChild(tokenizerDir, tokenizer[1]);
  return null;
};

const server = http.createServer(async (request, response) => {
  setIsolationHeaders(response);
  try {
    const requestPath = decodeURIComponent(new URL(request.url ?? '/', origin).pathname);
    const special = resolveSpecial(requestPath);
    const file = special ?? safeChild(outputDir, `.${requestPath}`);
    const stat = await fs.stat(file);
    response.statusCode = 200;
    response.setHeader('Content-Type', contentTypes.get(path.extname(file)) ?? 'application/octet-stream');
    response.setHeader('Content-Length', String(stat.size));
    response.setHeader('Cache-Control', 'no-store');
    createReadStream(file).pipe(response);
  } catch {
    response.statusCode = 404;
    response.end('Not found');
  }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });

const diagnostics = { pageErrors: [], consoleErrors: [], externalHttpRequests: [], failedRequests: [], failedResponses: [] };
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-precise-memory-info'] });
  const browserProductVersion = browser.version();
  const page = await browser.newPage();
  page.on('pageerror', error => diagnostics.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') diagnostics.consoleErrors.push(message.text()); });
  page.on('request', request => {
    const url = request.url();
    if (/^https?:/i.test(url) && new URL(url).origin !== origin) diagnostics.externalHttpRequests.push(url);
  });
  page.on('requestfailed', request => diagnostics.failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? 'unknown' }));
  page.on('response', response => { if (response.status() >= 400) diagnostics.failedResponses.push({ url: response.url(), status: response.status() }); });
  await page.goto(`${origin}/tests/tiny-sd-d5-pipeline-browser.html`);
  await page.waitForFunction(() => typeof globalThis.runTinySdD5Pipeline === 'function', undefined, { timeout: 30_000 });

  const modelConfig = Object.fromEntries(COMPONENTS.map(component => [component, {
    url: `/__tiny_sd_d5/model/${component}.onnx`,
    bytes: nativeReference.modelEvidence[component].bytes,
    sha256: nativeReference.modelEvidence[component].sha256,
    thresholds: nativeReference.modelEvidence[component].d3Thresholds,
  }]));
  const stageUrls = Object.fromEntries(Object.entries(nativeReference.stageFiles).map(([name, record]) => [name, `/__tiny_sd_d5/reference/${record.path}`]));
  const pipelineInput = { controlReference, nativeReference, modelConfig, stageUrls };

  const evaluatePass = async passIndex => {
    let timer;
    const evaluation = page.evaluate(
      input => globalThis.runTinySdD5Pipeline(input),
      pipelineInput,
    );
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`D5_BROWSER_PIPELINE_PASS_${passIndex}_TIMEOUT_${OUTER_TIMEOUT_MS}`)), OUTER_TIMEOUT_MS);
    });
    try {
      return await Promise.race([evaluation, timeout]);
    } finally {
      clearTimeout(timer);
    }
  };

  const report = await evaluatePass(1);
  const rerun = await evaluatePass(2);

  assert.equal(report.status, 'CANDIDATE');
  assert.equal(report.stage, 'D5_BROWSER_SELECTED_PIPELINE_MEASUREMENT');
  assert.equal(report.result, 'COMPOSED_PARITY_MEASURED_NOT_ADMITTED');
  assert.equal(report.authority, D5_PIPELINE_AUTHORITY);
  assert.equal(report.provider, 'wasm');
  assert.equal(report.productionFactory, 'BrowserOnnxSessionFactory');
  assert.deepEqual(report.executionProviders, ['wasm']);
  assert.equal(report.providerFallbackAllowed, false);
  assert.equal(report.wasmRuntime.numThreads, 1);
  assert.equal(report.wasmRuntime.proxy, false);
  assert.equal(report.wasmRuntime.workerFree, true);
  assert.equal(report.crossOriginIsolated, true);
  assert.equal(report.tokenizer.promptTextConsumed, true);
  assert.equal(report.tokenizer.exactPromptTokens, true);
  assert.equal(report.tokenizer.exactUnconditionalTokens, true);
  assert.ok(report.schedulerOrders.includes(1) && report.schedulerOrders.includes(2));
  assert.equal(report.componentIsolationAuthority, 'EXACT_HEAD_D3_WORKFLOW_SEPARATE_FROM_D5_COMPOSITION');
  assert.equal(report.composedParityAdmission, false);

  assert.equal(rerun.status, report.status);
  assert.equal(rerun.stage, report.stage);
  assert.equal(rerun.result, report.result);
  assert.equal(rerun.authority, report.authority);
  assert.deepEqual(rerun.timesteps, report.timesteps);
  assert.deepEqual(rerun.schedulerOrders, report.schedulerOrders);
  assert.deepEqual(rerun.browserStageHashes, report.browserStageHashes, 'real Chrome WASM deterministic rerun stage hashes differ');
  assert.deepEqual(rerun.compositionStageParity, report.compositionStageParity, 'real Chrome WASM deterministic rerun parity metrics differ');

  assert.deepEqual(diagnostics.externalHttpRequests, []);
  assert.deepEqual(diagnostics.pageErrors, []);
  report.browserProductVersion = browserProductVersion;
  report.networkDiagnostics = diagnostics;
  report.nativeReferenceSha256 = createHash('sha256').update(nativeBytes).digest('hex');
  report.quantizationEvidenceSha256 = createHash('sha256').update(quantBytes).digest('hex');
  report.controlReferenceSha256 = createHash('sha256').update(controlBytes).digest('hex');
  report.browserDeterministicRerunExact = true;
  report.browserDeterministicRerun = {
    passCount: BROWSER_RERUN_COUNT,
    exactStageHashes: true,
    exactCompositionMetrics: true,
    secondPassStageHashes: rerun.browserStageHashes,
    secondPassLatency: rerun.latency,
    secondPassHeap: rerun.heap,
  };
  report.compositionFeasibilityDecision = evaluateComposedParity({ browser: report, d3: quant });
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`TINY-SD D5 BROWSER PIPELINE: ${report.result} deterministic=2/2 exact admission=${report.compositionFeasibilityDecision.result} finalRMSE=${report.compositionStageParity.finalDecoded.rmse} finalNormRMSE=${report.compositionStageParity.finalDecoded.normalized.rmseOverReferenceRms}`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
