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

const modelDir = required('model-dir');
const fixtureDir = required('fixture-dir');
const quantReportPath = required('quant-report');
const reportPath = required('report');
const outputDir = path.resolve('.test-cache/tiny-sd-d3-wasm-dist');
const port = 4178;
const origin = `http://127.0.0.1:${port}`;
const OUTER_BROWSER_TIMEOUT_MS = 540_000;
const COMPONENTS = ['text_encoder', 'unet', 'vae_decoder'];
const launchArgs = ['--enable-precise-memory-info'];
const EXPECTED_WORKER_FREE_RUNTIME = Object.freeze({
  numThreads: 1,
  proxy: false,
  workerFree: true,
  workerPolicy: 'DISABLED_PENDING_SEPARATE_SECURITY_REVIEW',
});

const hashFile = async file => new Promise((resolve, reject) => {
  const hash = createHash('sha256');
  const stream = createReadStream(file);
  stream.on('data', chunk => hash.update(chunk));
  stream.on('error', reject);
  stream.on('end', () => resolve(hash.digest('hex')));
});

const quantBytes = await fs.readFile(quantReportPath);
const quant = JSON.parse(quantBytes.toString('utf8'));
assert.equal(quant.status, 'CANDIDATE');
assert.equal(quant.stage, 'D3_WASM_COMPACT_PREPARATION');
assert.equal(quant.fullInt8UniversalPackClaimed, false);
assert.equal(quant.browserWasmStillRequired, true);
assert.equal(quant.runtimeAuthorityGranted, false);
assert.equal(quant.productionApproval, false);
assert.deepEqual(Object.keys(quant.components).sort(), [...COMPONENTS].sort());

for (const component of COMPONENTS) {
  const record = quant.components[component];
  const fixture = record.browserFixture;
  assert.ok(fixture, `${component} independent D2 browser fixture missing`);
  for (const input of fixture.inputs) {
    const fixturePath = path.join(fixtureDir, component, input.path);
    assert.equal((await fs.stat(fixturePath)).size, input.bytes, `${component}/${input.name} fixture size mismatch`);
    assert.equal(await hashFile(fixturePath), input.sha256, `${component}/${input.name} fixture SHA mismatch`);
  }
  const referencePath = path.join(fixtureDir, component, fixture.reference.path);
  assert.equal((await fs.stat(referencePath)).size, fixture.reference.bytes, `${component} reference size mismatch`);
  assert.equal(await hashFile(referencePath), fixture.reference.sha256, `${component} reference SHA mismatch`);
  assert.equal(fixture.reference.authority, 'D2_ACCEPTED_FP32_CPU_ORT_OUTPUT');

  if (record.result !== 'WASM_COMPACT_NATIVE_PASS') continue;
  assert.ok(record.candidate);
  assert.equal(record.nativeOrtParity.passed, true);
  assert.equal(record.compactSizePassed, true);
  assert.deepEqual(record.candidate.graph.domains, ['ai.onnx']);
  assert.equal(record.candidate.graph.functionCount, 0);
  const modelPath = path.join(modelDir, `${component}.onnx`);
  const stat = await fs.stat(modelPath);
  assert.equal(stat.size, record.candidate.size, `${component} WASM model size mismatch`);
  assert.equal(await hashFile(modelPath), record.candidate.sha256, `${component} WASM model SHA mismatch`);
}

await build({
  root: path.resolve('.'),
  build: {
    outDir: outputDir,
    emptyOutDir: true,
    rollupOptions: { input: path.resolve('tests/tiny-sd-d3-browser-wasm.html') },
  },
});

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.onnx', 'application/octet-stream'],
  ['.bin', 'application/octet-stream'],
  ['.f32', 'application/octet-stream'],
]);

const setIsolationHeaders = response => {
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
};

const resolveSpecial = requestPath => {
  const modelMatch = requestPath.match(/^\/__tiny_sd_wasm\/model\/(text_encoder|unet|vae_decoder)\.onnx$/);
  if (modelMatch) return path.join(modelDir, `${modelMatch[1]}.onnx`);
  const fixtureMatch = requestPath.match(/^\/__tiny_sd_wasm\/fixture\/(text_encoder|unet|vae_decoder)\/([A-Za-z0-9_.-]+)$/);
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

const componentConfig = component => {
  const record = quant.components[component];
  const fixture = record.browserFixture;
  return {
    component,
    modelUrl: `/__tiny_sd_wasm/model/${component}.onnx`,
    expectedModelBytes: record.candidate.size,
    inputs: fixture.inputs.map(input => ({
      name: input.name,
      dtype: input.dtype,
      dims: input.shape,
      url: `/__tiny_sd_wasm/fixture/${component}/${input.path}`,
    })),
    outputName: fixture.reference.name,
    outputDims: fixture.reference.shape,
    referenceUrl: `/__tiny_sd_wasm/fixture/${component}/${fixture.reference.path}`,
    thresholds: record.nativeOrtParity.thresholds,
    quantizationScheme: record.transform.scheme,
  };
};

const preBrowserBlocked = component => ({
  schemaVersion: 1,
  status: 'CANDIDATE',
  stage: 'D3_BROWSER_WASM_COMPACT',
  component,
  result: 'WASM_COMPACT_PRE_BROWSER_BLOCKED',
  sourceClassification: quant.components[component].result,
  provider: 'wasm',
  productionFactory: 'BrowserOnnxSessionFactory',
  executionProviders: ['wasm'],
  providerFallbackAllowed: false,
  browserAttempted: false,
  runtimeAuthorityGranted: false,
  productionDeviceApproval: false,
  productionPromotionAllowed: false,
});

const runComponent = async component => {
  if (quant.components[component].result !== 'WASM_COMPACT_NATIVE_PASS') return preBrowserBlocked(component);

  let browser;
  const diagnostics = {
    pageErrors: [],
    consoleErrors: [],
    externalHttpRequests: [],
    failedRequests: [],
    failedResponses: [],
  };
  try {
    try {
      browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs });
    } catch (error) {
      return {
        schemaVersion: 1,
        status: 'CANDIDATE',
        stage: 'D3_BROWSER_WASM_COMPACT',
        component,
        result: 'WASM_BROWSER_LAUNCH_BLOCKED',
        provider: 'wasm',
        productionFactory: 'BrowserOnnxSessionFactory',
        executionProviders: ['wasm'],
        providerFallbackAllowed: false,
        browserAttempted: true,
        runtimeAuthorityGranted: false,
        productionDeviceApproval: false,
        productionPromotionAllowed: false,
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
    page.on('response', response => {
      if (response.status() >= 400) diagnostics.failedResponses.push({ url: response.url(), status: response.status() });
    });

    await page.goto(`${origin}/tests/tiny-sd-d3-browser-wasm.html`);
    await page.waitForFunction(() => typeof globalThis.runTinySdD3WasmFeasibility === 'function', undefined, { timeout: 20_000 });

    let timer;
    const evaluation = page.evaluate(
      async input => globalThis.runTinySdD3WasmFeasibility(input),
      componentConfig(component),
    );
    const timeout = new Promise(resolve => {
      timer = setTimeout(() => resolve({
        schemaVersion: 1,
        status: 'CANDIDATE',
        stage: 'D3_BROWSER_WASM_COMPACT',
        component,
        result: 'WASM_BROWSER_PROCESS_BLOCKED',
        provider: 'wasm',
        productionFactory: 'BrowserOnnxSessionFactory',
        executionProviders: ['wasm'],
        providerFallbackAllowed: false,
        browserAttempted: true,
        runtimeAuthorityGranted: false,
        productionDeviceApproval: false,
        productionPromotionAllowed: false,
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
        schemaVersion: 1,
        status: 'CANDIDATE',
        stage: 'D3_BROWSER_WASM_COMPACT',
        component,
        result: 'WASM_BROWSER_PROCESS_BLOCKED',
        provider: 'wasm',
        productionFactory: 'BrowserOnnxSessionFactory',
        executionProviders: ['wasm'],
        providerFallbackAllowed: false,
        browserAttempted: true,
        runtimeAuthorityGranted: false,
        productionDeviceApproval: false,
        productionPromotionAllowed: false,
        error: String(error),
      };
    } finally {
      clearTimeout(timer);
    }

    assert.equal(runtimeReport.status, 'CANDIDATE');
    assert.equal(runtimeReport.component, component);
    assert.equal(runtimeReport.provider, 'wasm');
    assert.equal(runtimeReport.productionFactory, 'BrowserOnnxSessionFactory');
    assert.deepEqual(runtimeReport.executionProviders, ['wasm']);
    assert.equal(runtimeReport.providerFallbackAllowed, false);
    assert.equal(runtimeReport.runtimeAuthorityGranted, false);
    assert.equal(runtimeReport.productionDeviceApproval, false);
    assert.equal(runtimeReport.productionPromotionAllowed, false);
    assert.deepEqual(diagnostics.externalHttpRequests, [], `${component} attempted external HTTP(S)`);
    assert.deepEqual(diagnostics.pageErrors, [], `${component} page errors: ${JSON.stringify(diagnostics.pageErrors)}`);

    const allowed = new Set([
      'WASM_MODEL_FETCH_BLOCKED',
      'WASM_MODEL_SIZE_MISMATCH',
      'WASM_SESSION_BLOCKED',
      'WASM_INFERENCE_BLOCKED',
      'WASM_BROWSER_EVALUATION_BLOCKED',
      'WASM_BROWSER_LAUNCH_BLOCKED',
      'WASM_BROWSER_PROCESS_BLOCKED',
      'WASM_PARITY_FAILED',
      'PASS',
    ]);
    assert.ok(allowed.has(runtimeReport.result), `unexpected ${component} WASM result: ${runtimeReport.result}`);
    if (!['WASM_BROWSER_LAUNCH_BLOCKED', 'WASM_BROWSER_PROCESS_BLOCKED'].includes(runtimeReport.result)) {
      assert.equal(runtimeReport.crossOriginIsolated, true, `${component} WASM run was not cross-origin isolated`);
      assert.deepEqual(runtimeReport.wasmRuntime, EXPECTED_WORKER_FREE_RUNTIME, `${component} WASM runtime escaped the worker-free Trusted Types baseline`);
    }
    if (runtimeReport.result === 'PASS') {
      assert.equal(runtimeReport.parityPassed, true);
      assert.ok(runtimeReport.parity.normalized.maxAbsOverReferenceMaxAbs <= runtimeReport.thresholds.maxAbsOverReferenceMaxAbs);
      assert.ok(runtimeReport.parity.normalized.rmseOverReferenceRms <= runtimeReport.thresholds.rmseOverReferenceRms);
    }
    return {
      ...runtimeReport,
      browserAttempted: true,
      browserProductVersion,
      launchArgs,
      networkDiagnostics: diagnostics,
      modelSha256: quant.components[component].candidate.sha256,
      modelBytes: quant.components[component].candidate.size,
    };
  } finally {
    await browser?.close();
  }
};

try {
  const components = {};
  for (const component of COMPONENTS) components[component] = await runComponent(component);
  const passCount = Object.values(components).filter(value => value.result === 'PASS').length;
  const browserAttemptCount = Object.values(components).filter(value => value.browserAttempted !== false).length;
  const report = {
    schemaVersion: 1,
    status: 'CANDIDATE',
    stage: 'D3_BROWSER_WASM_COMPACT',
    quantizationEvidenceSha256: createHash('sha256').update(quantBytes).digest('hex'),
    provider: 'wasm',
    productionFactory: 'BrowserOnnxSessionFactory',
    components,
    passCount,
    browserAttemptCount,
    blockedComponents: Object.fromEntries(
      Object.entries(components).filter(([, value]) => value.result !== 'PASS').map(([key, value]) => [key, value.result]),
    ),
    providerFallbackAllowed: false,
    workerFreeRuntimeRequired: true,
    runtimeAuthorityGranted: false,
    productionDeviceApproval: false,
    productionApproval: false,
  };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`TINY-SD D3 BROWSER WASM: pass=${passCount}/3 attempted=${browserAttemptCount}/3 blocked=${JSON.stringify(report.blockedComponents)}`);
} finally {
  await new Promise(resolve => server.close(resolve));
}
