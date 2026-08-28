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

const onnxDir = required('onnx-dir');
const ortDir = required('ort-dir');
const fixtureDir = required('fixture-dir');
const preparationReportPath = required('preparation-report');
const reportPath = required('report');
const outputDir = path.resolve('.test-cache/tiny-sd-d4-wasm-dist');
const port = 4179;
const origin = `http://127.0.0.1:${port}`;
const OUTER_BROWSER_TIMEOUT_MS = 540_000;
const COMPONENTS = ['text_encoder', 'unet', 'vae_decoder'];
const VARIANTS = ['ONNX_BASELINE', 'ORT_DEFAULT', 'ORT_MEMORY_FIRST'];
const launchArgs = ['--enable-precise-memory-info'];

const hashFile = async file => new Promise((resolve, reject) => {
  const hash = createHash('sha256');
  const stream = createReadStream(file);
  stream.on('data', chunk => hash.update(chunk));
  stream.on('error', reject);
  stream.on('end', () => resolve(hash.digest('hex')));
});

const preparationBytes = await fs.readFile(preparationReportPath);
const preparation = JSON.parse(preparationBytes.toString('utf8'));
assert.equal(preparation.status, 'CANDIDATE');
assert.equal(preparation.stage, 'D4_ORT_PACKAGING_PREPARATION');
assert.equal(preparation.strategy, 'ONE_ORT_ARTIFACT_TWO_RUNTIME_POLICIES_PLUS_ONNX_BASELINE');
assert.equal(preparation.browserComparisonStillRequired, true);
assert.equal(preparation.workerFreeRuntimeRequired, true);
assert.equal(preparation.runtimeAuthorityGranted, false);
assert.equal(preparation.productionApproval, false);
assert.deepEqual(Object.keys(preparation.components).sort(), [...COMPONENTS].sort());

for (const component of COMPONENTS) {
  const record = preparation.components[component];
  const fixture = record.browserFixture;
  for (const input of fixture.inputs) {
    const fixturePath = path.join(fixtureDir, component, input.path);
    assert.equal((await fs.stat(fixturePath)).size, input.bytes, `${component}/${input.name} fixture size mismatch`);
    assert.equal(await hashFile(fixturePath), input.sha256, `${component}/${input.name} fixture SHA mismatch`);
  }
  const referencePath = path.join(fixtureDir, component, fixture.reference.path);
  assert.equal((await fs.stat(referencePath)).size, fixture.reference.bytes, `${component} reference size mismatch`);
  assert.equal(await hashFile(referencePath), fixture.reference.sha256, `${component} reference SHA mismatch`);
  assert.equal(fixture.reference.authority, 'D2_ACCEPTED_FP32_CPU_ORT_OUTPUT');

  const onnxPath = path.join(onnxDir, `${component}.onnx`);
  assert.equal((await fs.stat(onnxPath)).size, record.sourceD3Onnx.size, `${component} ONNX size mismatch`);
  assert.equal(await hashFile(onnxPath), record.sourceD3Onnx.sha256, `${component} ONNX SHA mismatch`);
  if (record.result === 'D4_ORT_NATIVE_PASS') {
    assert.equal(record.nativeOrtParity.passed, true);
    assert.ok(record.ortArtifact);
    const ortPath = path.join(ortDir, `${component}.ort`);
    assert.equal((await fs.stat(ortPath)).size, record.ortArtifact.size, `${component} ORT size mismatch`);
    assert.equal(await hashFile(ortPath), record.ortArtifact.sha256, `${component} ORT SHA mismatch`);
  }
}

await build({
  root: path.resolve('.'),
  build: {
    outDir: outputDir,
    emptyOutDir: true,
    rollupOptions: { input: path.resolve('tests/tiny-sd-d4-browser-wasm.html') },
  },
});

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.onnx', 'application/octet-stream'],
  ['.ort', 'application/octet-stream'],
  ['.bin', 'application/octet-stream'],
  ['.f32', 'application/octet-stream'],
]);

const setIsolationHeaders = response => {
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
};

const resolveSpecial = requestPath => {
  const modelMatch = requestPath.match(/^\/__tiny_sd_d4\/model\/(text_encoder|unet|vae_decoder)\/(onnx|ort)$/);
  if (modelMatch) return path.join(modelMatch[2] === 'onnx' ? onnxDir : ortDir, `${modelMatch[1]}.${modelMatch[2]}`);
  const fixtureMatch = requestPath.match(/^\/__tiny_sd_d4\/fixture\/(text_encoder|unet|vae_decoder)\/([A-Za-z0-9_.-]+)$/);
  if (fixtureMatch) return path.join(fixtureDir, fixtureMatch[1], fixtureMatch[2]);
  return null;
};

const server = http.createServer(async (request, response) => {
  setIsolationHeaders(response);
  try {
    const requestPath = decodeURIComponent(new URL(request.url ?? '/', origin).pathname);
    const special = resolveSpecial(requestPath);
    if (special) {
      const stat = await fs.stat(special);
      response.statusCode = 200;
      response.setHeader('Content-Type', contentTypes.get(path.extname(special)) ?? 'application/octet-stream');
      response.setHeader('Content-Length', String(stat.size));
      response.setHeader('Cache-Control', 'no-store');
      createReadStream(special).pipe(response);
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

const componentConfig = (component, variant) => {
  const record = preparation.components[component];
  const fixture = record.browserFixture;
  const format = variant === 'ONNX_BASELINE' ? 'onnx' : 'ort';
  const artifact = format === 'onnx' ? record.sourceD3Onnx : record.ortArtifact;
  return {
    component,
    variant,
    modelUrl: `/__tiny_sd_d4/model/${component}/${format}`,
    expectedModelBytes: artifact.size,
    inputs: fixture.inputs.map(input => ({
      name: input.name,
      dtype: input.dtype,
      dims: input.shape,
      url: `/__tiny_sd_d4/fixture/${component}/${input.path}`,
    })),
    outputName: fixture.reference.name,
    outputDims: fixture.reference.shape,
    referenceUrl: `/__tiny_sd_d4/fixture/${component}/${fixture.reference.path}`,
    thresholds: record.thresholds,
  };
};

const preBrowserBlocked = (component, variant) => ({
  schemaVersion: 1,
  status: 'CANDIDATE',
  stage: 'D4_BROWSER_WASM_ORT_COMPARISON',
  component,
  variant,
  result: 'D4_ORT_PRE_BROWSER_BLOCKED',
  sourceClassification: preparation.components[component].result,
  provider: 'wasm',
  productionFactory: 'BrowserOnnxSessionFactory',
  executionProviders: ['wasm'],
  providerFallbackAllowed: false,
  browserAttempted: false,
  runtimeAuthorityGranted: false,
  productionDeviceApproval: false,
  productionPromotionAllowed: false,
});

const runVariant = async (component, variant) => {
  const record = preparation.components[component];
  if (variant !== 'ONNX_BASELINE' && record.result !== 'D4_ORT_NATIVE_PASS') return preBrowserBlocked(component, variant);

  let browser;
  const diagnostics = { pageErrors: [], consoleErrors: [], externalHttpRequests: [], failedRequests: [], failedResponses: [] };
  try {
    try {
      browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs });
    } catch (error) {
      return {
        ...preBrowserBlocked(component, variant),
        result: 'D4_BROWSER_LAUNCH_BLOCKED',
        browserAttempted: true,
        error: String(error),
      };
    }
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

    await page.goto(`${origin}/tests/tiny-sd-d4-browser-wasm.html`);
    await page.waitForFunction(() => typeof globalThis.runTinySdD4WasmComparison === 'function', undefined, { timeout: 20_000 });

    let timer;
    const evaluation = page.evaluate(async input => globalThis.runTinySdD4WasmComparison(input), componentConfig(component, variant));
    const timeout = new Promise(resolve => {
      timer = setTimeout(() => resolve({
        ...preBrowserBlocked(component, variant),
        result: 'D4_BROWSER_PROCESS_BLOCKED',
        browserAttempted: true,
        timeoutStage: 'OUTER_BROWSER_EVALUATION',
        outerBrowserTimeoutMs: OUTER_BROWSER_TIMEOUT_MS,
        error: `browser evaluation exceeded ${OUTER_BROWSER_TIMEOUT_MS}ms`,
      }), OUTER_BROWSER_TIMEOUT_MS);
    });
    let runtimeReport;
    try {
      runtimeReport = await Promise.race([evaluation, timeout]);
    } catch (error) {
      runtimeReport = {
        ...preBrowserBlocked(component, variant),
        result: 'D4_BROWSER_PROCESS_BLOCKED',
        browserAttempted: true,
        error: String(error),
      };
    } finally {
      clearTimeout(timer);
    }

    assert.equal(runtimeReport.status, 'CANDIDATE');
    assert.equal(runtimeReport.component, component);
    assert.equal(runtimeReport.variant, variant);
    assert.equal(runtimeReport.provider, 'wasm');
    assert.equal(runtimeReport.productionFactory, 'BrowserOnnxSessionFactory');
    assert.deepEqual(runtimeReport.executionProviders, ['wasm']);
    assert.equal(runtimeReport.providerFallbackAllowed, false);
    assert.equal(runtimeReport.runtimeAuthorityGranted, false);
    assert.equal(runtimeReport.productionDeviceApproval, false);
    assert.equal(runtimeReport.productionPromotionAllowed, false);
    assert.deepEqual(diagnostics.externalHttpRequests, [], `${component}/${variant} attempted external HTTP(S)`);
    assert.deepEqual(diagnostics.pageErrors, [], `${component}/${variant} page errors: ${JSON.stringify(diagnostics.pageErrors)}`);

    const allowed = new Set([
      'D4_MODEL_FETCH_BLOCKED', 'D4_MODEL_SIZE_MISMATCH', 'D4_SESSION_BLOCKED', 'D4_INFERENCE_BLOCKED',
      'D4_BROWSER_EVALUATION_BLOCKED', 'D4_BROWSER_LAUNCH_BLOCKED', 'D4_BROWSER_PROCESS_BLOCKED',
      'D4_PARITY_FAILED', 'PASS',
    ]);
    assert.ok(allowed.has(runtimeReport.result), `unexpected ${component}/${variant} result: ${runtimeReport.result}`);
    if (!['D4_BROWSER_LAUNCH_BLOCKED', 'D4_BROWSER_PROCESS_BLOCKED'].includes(runtimeReport.result)) {
      assert.equal(runtimeReport.crossOriginIsolated, true, `${component}/${variant} was not cross-origin isolated`);
      assert.equal(runtimeReport.wasmRuntime.numThreads, 1);
      assert.equal(runtimeReport.wasmRuntime.proxy, false);
      assert.equal(runtimeReport.wasmRuntime.workerFree, true);
      assert.equal(runtimeReport.wasmRuntime.workerPolicy, 'DISABLED_PENDING_SEPARATE_SECURITY_REVIEW');
      assert.equal(runtimeReport.modelMaterializedInJs, true);
      assert.equal(runtimeReport.reliableWasmNativePeakMemoryApi, false);
      assert.equal(runtimeReport.reliableGpuPeakMemoryApi, false);
    }
    if (runtimeReport.result === 'PASS') {
      assert.equal(runtimeReport.parityPassed, true);
      assert.ok(runtimeReport.parity.normalized.maxAbsOverReferenceMaxAbs <= runtimeReport.thresholds.maxAbsOverReferenceMaxAbs);
      assert.ok(runtimeReport.parity.normalized.rmseOverReferenceRms <= runtimeReport.thresholds.rmseOverReferenceRms);
      if (variant === 'ORT_MEMORY_FIRST') {
        assert.equal(runtimeReport.runtimePolicy.directInitializerBytes, true);
        assert.equal(runtimeReport.runtimePolicy.disablePrepacking, true);
      }
    }
    const artifact = variant === 'ONNX_BASELINE' ? record.sourceD3Onnx : record.ortArtifact;
    return {
      ...runtimeReport,
      browserAttempted: true,
      browserProductVersion,
      launchArgs,
      networkDiagnostics: diagnostics,
      modelSha256: artifact.sha256,
      modelBytes: artifact.size,
    };
  } finally {
    await browser?.close();
  }
};

try {
  const components = {};
  for (const component of COMPONENTS) {
    components[component] = {};
    for (const variant of VARIANTS) components[component][variant] = await runVariant(component, variant);
  }
  const flattened = Object.values(components).flatMap(value => Object.values(value));
  const report = {
    schemaVersion: 1,
    status: 'CANDIDATE',
    stage: 'D4_BROWSER_WASM_ORT_COMPARISON',
    preparationEvidenceSha256: createHash('sha256').update(preparationBytes).digest('hex'),
    provider: 'wasm',
    productionFactory: 'BrowserOnnxSessionFactory',
    variants: VARIANTS,
    components,
    passCount: flattened.filter(value => value.result === 'PASS').length,
    browserAttemptCount: flattened.filter(value => value.browserAttempted !== false).length,
    blockedVariants: Object.fromEntries(flattened.filter(value => value.result !== 'PASS').map(value => [`${value.component}/${value.variant}`, value.result])),
    providerFallbackAllowed: false,
    workerFreeRuntimeRequired: true,
    reliableMemoryEvidence: 'JS_HEAP_ONLY',
    runtimeAuthorityGranted: false,
    productionDeviceApproval: false,
    productionApproval: false,
  };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`TINY-SD D4 BROWSER WASM: pass=${report.passCount}/9 attempted=${report.browserAttemptCount}/9 blocked=${JSON.stringify(report.blockedVariants)}`);
} finally {
  await new Promise(resolve => server.close(resolve));
}
