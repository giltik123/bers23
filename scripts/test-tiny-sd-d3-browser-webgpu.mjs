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
const precisionReportPath = required('precision-report');
const reportPath = required('report');
const outputDir = path.resolve('.test-cache/tiny-sd-d3-webgpu-dist');
const port = 4177;
const origin = `http://127.0.0.1:${port}`;
const OUTER_BROWSER_TIMEOUT_MS = 240_000;
const COMPONENTS = ['text_encoder', 'unet', 'vae_decoder'];
const thresholds = {
  text_encoder: { maxAbs: 5e-3, rmse: 5e-4 },
  unet: { maxAbs: 1e-2, rmse: 1e-3 },
  vae_decoder: { maxAbs: 2e-2, rmse: 2e-3 },
};
const launchArgs = [
  '--enable-unsafe-webgpu',
  '--use-angle=swiftshader',
  '--enable-features=Vulkan',
  '--disable-vulkan-surface',
  '--enable-precise-memory-info',
];

const hashFile = async file => new Promise((resolve, reject) => {
  const hash = createHash('sha256');
  const stream = createReadStream(file);
  stream.on('data', chunk => hash.update(chunk));
  stream.on('error', reject);
  stream.on('end', () => resolve(hash.digest('hex')));
});

const precisionBytes = await fs.readFile(precisionReportPath);
const precision = JSON.parse(precisionBytes.toString('utf8'));
assert.equal(precision.status, 'CANDIDATE');
assert.equal(precision.stage, 'D3_WEBGPU_FP16_PREPARATION');
assert.equal(precision.providerSpecificPrecisionTiers, true);
assert.equal(precision.selectedWebGpuCandidatePrecision, 'FP16_INTERNAL_FP32_INT64_IO');
assert.equal(precision.releaseIdentityPinned, false);
assert.equal(precision.runtimeAuthorityGranted, false);
assert.equal(precision.productionApproval, false);
assert.equal(precision.realDeviceApproval, false);
assert.deepEqual(Object.keys(precision.components).sort(), [...COMPONENTS].sort());

for (const component of COMPONENTS) {
  const record = precision.components[component];
  assert.equal(record.result, 'FP16_GRAPH_PASS');
  assert.equal(record.transform.keepIoTypes, true);
  assert.equal(record.releaseIdentityPinned, false);
  assert.deepEqual(record.fp16.graph.domains, ['ai.onnx']);
  assert.equal(record.fp16.graph.functionCount, 0);
  const modelPath = path.join(modelDir, `${component}.onnx`);
  const stat = await fs.stat(modelPath);
  assert.equal(stat.size, record.fp16.size, `${component} FP16 model size mismatch`);
  assert.equal(await hashFile(modelPath), record.fp16.sha256, `${component} FP16 model SHA mismatch`);
  for (const input of record.browserFixture.inputs) {
    const fixturePath = path.join(fixtureDir, component, input.path);
    const fixtureStat = await fs.stat(fixturePath);
    assert.equal(fixtureStat.size, input.bytes, `${component}/${input.name} fixture size mismatch`);
    assert.equal(await hashFile(fixturePath), input.sha256, `${component}/${input.name} fixture SHA mismatch`);
  }
  const reference = record.browserFixture.reference;
  const referencePath = path.join(fixtureDir, component, reference.path);
  assert.equal((await fs.stat(referencePath)).size, reference.bytes, `${component} reference size mismatch`);
  assert.equal(await hashFile(referencePath), reference.sha256, `${component} reference SHA mismatch`);
  assert.equal(reference.authority, 'D2_ACCEPTED_FP32_CPU_ORT_OUTPUT');
}

await build({
  root: path.resolve('.'),
  build: {
    outDir: outputDir,
    emptyOutDir: true,
    rollupOptions: { input: path.resolve('tests/tiny-sd-d3-browser-webgpu.html') },
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

const resolveSpecial = requestPath => {
  const modelMatch = requestPath.match(/^\/__tiny_sd\/model\/(text_encoder|unet|vae_decoder)\.onnx$/);
  if (modelMatch) return path.join(modelDir, `${modelMatch[1]}.onnx`);
  const fixtureMatch = requestPath.match(/^\/__tiny_sd\/fixture\/(text_encoder|unet|vae_decoder)\/([A-Za-z0-9_.-]+)$/);
  if (fixtureMatch) return path.join(fixtureDir, fixtureMatch[1], fixtureMatch[2]);
  return null;
};

const server = http.createServer(async (request, response) => {
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
  const record = precision.components[component];
  const inputs = record.browserFixture.inputs.map(input => ({
    name: input.name,
    dtype: input.dtype,
    dims: input.shape,
    url: `/__tiny_sd/fixture/${component}/${input.path}`,
  }));
  const reference = record.browserFixture.reference;
  return {
    component,
    modelUrl: `/__tiny_sd/model/${component}.onnx`,
    inputs,
    outputName: reference.name,
    outputDims: reference.shape,
    referenceUrl: `/__tiny_sd/fixture/${component}/${reference.path}`,
    thresholds: thresholds[component],
  };
};

const runComponent = async component => {
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
        stage: 'D3_BROWSER_WEBGPU_FP16',
        component,
        result: 'WEBGPU_BROWSER_LAUNCH_BLOCKED',
        provider: 'webgpu',
        precisionTier: 'FP16_INTERNAL_FP32_INT64_IO',
        providerFallbackAllowed: false,
        executionProviders: ['webgpu'],
        hostedSoftwareFeasibilityOnly: true,
        realDeviceEvidence: false,
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

    await page.goto(`${origin}/tests/tiny-sd-d3-browser-webgpu.html`);
    await page.waitForFunction(() => typeof globalThis.runTinySdD3WebGpuFeasibility === 'function', undefined, { timeout: 20_000 });

    let timer;
    const evaluation = page.evaluate(
      async input => globalThis.runTinySdD3WebGpuFeasibility(input),
      componentConfig(component),
    );
    const timeout = new Promise(resolve => {
      timer = setTimeout(() => resolve({
        schemaVersion: 1,
        status: 'CANDIDATE',
        stage: 'D3_BROWSER_WEBGPU_FP16',
        component,
        result: 'WEBGPU_BROWSER_EVALUATION_BLOCKED',
        provider: 'webgpu',
        precisionTier: 'FP16_INTERNAL_FP32_INT64_IO',
        providerFallbackAllowed: false,
        executionProviders: ['webgpu'],
        hostedSoftwareFeasibilityOnly: true,
        realDeviceEvidence: false,
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
        stage: 'D3_BROWSER_WEBGPU_FP16',
        component,
        result: 'WEBGPU_BROWSER_PROCESS_BLOCKED',
        provider: 'webgpu',
        precisionTier: 'FP16_INTERNAL_FP32_INT64_IO',
        providerFallbackAllowed: false,
        executionProviders: ['webgpu'],
        hostedSoftwareFeasibilityOnly: true,
        realDeviceEvidence: false,
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
    assert.equal(runtimeReport.provider, 'webgpu');
    assert.equal(runtimeReport.precisionTier, 'FP16_INTERNAL_FP32_INT64_IO');
    assert.equal(runtimeReport.providerFallbackAllowed, false);
    assert.deepEqual(runtimeReport.executionProviders, ['webgpu']);
    assert.equal(runtimeReport.runtimeAuthorityGranted, false);
    assert.equal(runtimeReport.productionDeviceApproval, false);
    assert.equal(runtimeReport.productionPromotionAllowed, false);
    assert.deepEqual(diagnostics.externalHttpRequests, [], `${component} attempted external HTTP(S)`);
    assert.deepEqual(diagnostics.pageErrors, [], `${component} page errors: ${JSON.stringify(diagnostics.pageErrors)}`);

    const allowed = new Set([
      'WEBGPU_API_UNAVAILABLE',
      'WEBGPU_ADAPTER_REQUEST_FAILED',
      'WEBGPU_ADAPTER_UNAVAILABLE',
      'WEBGPU_BROWSER_LAUNCH_BLOCKED',
      'WEBGPU_SESSION_BLOCKED',
      'WEBGPU_INFERENCE_BLOCKED',
      'WEBGPU_BROWSER_EVALUATION_BLOCKED',
      'WEBGPU_BROWSER_PROCESS_BLOCKED',
      'WEBGPU_PARITY_FAILED',
      'PASS',
    ]);
    assert.ok(allowed.has(runtimeReport.result), `unexpected ${component} WebGPU result: ${runtimeReport.result}`);
    if (runtimeReport.result === 'PASS') {
      assert.equal(runtimeReport.parityPassed, true);
      assert.ok(runtimeReport.metrics.maxAbs <= thresholds[component].maxAbs);
      assert.ok(runtimeReport.metrics.rmse <= thresholds[component].rmse);
    }
    return {
      ...runtimeReport,
      browserProductVersion,
      launchArgs,
      networkDiagnostics: diagnostics,
      modelSha256: precision.components[component].fp16.sha256,
      modelBytes: precision.components[component].fp16.size,
      realDeviceEvidence: false,
    };
  } finally {
    await browser?.close();
  }
};

try {
  const components = {};
  for (const component of COMPONENTS) {
    components[component] = await runComponent(component);
  }
  const passCount = Object.values(components).filter(value => value.result === 'PASS').length;
  const report = {
    schemaVersion: 1,
    status: 'CANDIDATE',
    stage: 'D3_BROWSER_WEBGPU_FP16',
    precisionEvidenceSha256: createHash('sha256').update(precisionBytes).digest('hex'),
    provider: 'webgpu',
    precisionTier: 'FP16_INTERNAL_FP32_INT64_IO',
    components,
    passCount,
    blockedComponents: Object.fromEntries(
      Object.entries(components).filter(([, value]) => value.result !== 'PASS').map(([key, value]) => [key, value.result]),
    ),
    hostedSoftwareFeasibilityOnly: true,
    realDeviceEvidence: false,
    providerFallbackAllowed: false,
    runtimeAuthorityGranted: false,
    productionDeviceApproval: false,
    productionApproval: false,
  };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`TINY-SD D3 BROWSER WEBGPU: pass=${passCount}/3 blocked=${JSON.stringify(report.blockedComponents)}`);
} finally {
  await new Promise(resolve => server.close(resolve));
}
