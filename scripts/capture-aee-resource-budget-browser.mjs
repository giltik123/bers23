import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import { build } from 'vite';
import {
  ORTHOGONAL_TRANSFORM_TOOL_DEFINITION,
  RESIZE_TOOL_DEFINITION,
} from '../src/platform/creative/deterministic/DeterministicToolRegistry.ts';
import { estimateDeterministicExecutionResourcesV1 } from '../server/core/localExecution/DeterministicExecutionResourceModelV1.ts';

const outputDir = path.resolve('.test-cache/aee-resource-budget-browser-dist');
const reportPath = path.resolve(process.argv[2] ?? '.test-cache/aee-resource-budget-browser.json');
const port = 4197;
const origin = `http://127.0.0.1:${port}`;
const sampleIntervalMs = 2;

await build({
  root: path.resolve('.'),
  build: {
    outDir: outputDir,
    emptyOutDir: true,
    rollupOptions: { input: path.resolve('tests/aee-resource-budget-browser.html') },
  },
});

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
]);
const server = http.createServer(async (request, response) => {
  try {
    const requestPath = decodeURIComponent(new URL(request.url ?? '/', origin).pathname);
    const file = path.resolve(outputDir, `.${requestPath}`);
    if (file !== outputDir && !file.startsWith(`${outputDir}${path.sep}`)) throw new Error('path traversal');
    const bytes = await fs.readFile(file);
    response.statusCode = 200;
    response.setHeader('Content-Type', contentTypes.get(path.extname(file)) ?? 'application/octet-stream');
    response.setHeader('Cache-Control', 'no-store');
    response.end(bytes);
  } catch {
    response.statusCode = 404;
    response.end('Not found');
  }
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(port, '127.0.0.1', resolve);
});

const cases = Object.freeze([
  Object.freeze({
    id: 'orthogonal-1024x768-rotate90',
    browserInput: Object.freeze({ operation: 'ORTHOGONAL_TRANSFORM', sourceWidth: 1024, sourceHeight: 768, mode: 'ROTATE_90_CW' }),
    tool: ORTHOGONAL_TRANSFORM_TOOL_DEFINITION,
    source: Object.freeze({ width: 1024, height: 768 }),
    output: Object.freeze({ width: 768, height: 1024 }),
  }),
  Object.freeze({
    id: 'resize-512x384-to-1024x768',
    browserInput: Object.freeze({ operation: 'RESIZE', sourceWidth: 512, sourceHeight: 384, width: 1024, height: 768 }),
    tool: RESIZE_TOOL_DEFINITION,
    source: Object.freeze({ width: 512, height: 384 }),
    output: Object.freeze({ width: 1024, height: 768 }),
  }),
]);

let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const diagnostics = { pageErrors: [], consoleErrors: [], externalHttpRequests: [], failedRequests: [], failedResponses: [] };
  page.on('pageerror', error => diagnostics.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') diagnostics.consoleErrors.push(message.text()); });
  page.on('request', request => {
    const url = request.url();
    if (/^https?:/i.test(url) && new URL(url).origin !== origin) diagnostics.externalHttpRequests.push(url);
  });
  page.on('requestfailed', request => diagnostics.failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? 'unknown' }));
  page.on('response', response => { if (response.status() >= 400) diagnostics.failedResponses.push({ url: response.url(), status: response.status() }); });

  await page.goto(`${origin}/tests/aee-resource-budget-browser.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof globalThis.runAeeResourceBudgetCalibration === 'function', undefined, { timeout: 20_000 });
  const cdp = await context.newCDPSession(page);
  await cdp.send('HeapProfiler.enable');

  const evidence = [];
  for (const calibration of cases) {
    const estimate = estimateDeterministicExecutionResourcesV1(calibration.tool, calibration.source, calibration.output);
    evidence.push(await measureCase(page, cdp, calibration, estimate));
  }

  assert.deepEqual(diagnostics.externalHttpRequests, [], `resource calibration attempted external HTTP(S): ${JSON.stringify(diagnostics.externalHttpRequests)}`);
  assert.deepEqual(diagnostics.pageErrors, [], `resource calibration page errors: ${JSON.stringify(diagnostics.pageErrors)}`);
  assert.deepEqual(diagnostics.consoleErrors, [], `resource calibration console errors: ${JSON.stringify(diagnostics.consoleErrors)}`);
  assert.deepEqual(diagnostics.failedRequests, [], `resource calibration failed requests: ${JSON.stringify(diagnostics.failedRequests)}`);
  assert.deepEqual(diagnostics.failedResponses, [], `resource calibration failed responses: ${JSON.stringify(diagnostics.failedResponses)}`);

  const report = Object.freeze({
    schemaVersion: 'BERS_AEE_RESOURCE_BROWSER_CALIBRATION_V1',
    stage: 'AE_4_RESOURCE_BUDGET_BROWSER_CALIBRATION',
    status: 'PASS',
    evidenceOnly: true,
    admissionAuthority: false,
    browser: Object.freeze({ engine: 'chromium', channel: 'chrome', version: browser.version(), headless: true }),
    measurement: Object.freeze({
      source: 'Chrome DevTools Protocol Runtime.getHeapUsage',
      sampledFields: Object.freeze(['usedSize', 'embedderHeapUsedSize', 'backingStorageSize']),
      aggregation: 'SUM_THEN_BASELINE_DELTA_PEAK',
      sampleIntervalMs,
      garbageCollection: 'HeapProfiler.collectGarbage before each case',
    }),
    cases: Object.freeze(evidence),
  });
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
} finally {
  await browser?.close().catch(() => undefined);
  await new Promise(resolve => server.close(resolve));
}

async function measureCase(page, cdp, calibration, estimate) {
  await page.evaluate(() => globalThis.releaseAeeResourceBudgetCalibration?.());
  await cdp.send('HeapProfiler.collectGarbage');
  await page.waitForTimeout(30);
  const baseline = memorySample(await cdp.send('Runtime.getHeapUsage'));
  let peak = baseline.totalAccountedBytes;
  let settled = false;
  let operationError;
  let runtimeResult;
  const operation = page.evaluate(input => globalThis.runAeeResourceBudgetCalibration(input), calibration.browserInput)
    .then(value => { runtimeResult = value; })
    .catch(error => { operationError = error; })
    .finally(() => { settled = true; });

  while (!settled) {
    await delay(sampleIntervalMs);
    const sample = memorySample(await cdp.send('Runtime.getHeapUsage'));
    peak = Math.max(peak, sample.totalAccountedBytes);
  }
  await operation;
  if (operationError) throw operationError;
  const finalSample = memorySample(await cdp.send('Runtime.getHeapUsage'));
  peak = Math.max(peak, finalSample.totalAccountedBytes);
  const observedPeakDeltaBytes = Math.max(0, peak - baseline.totalAccountedBytes);

  assert.equal(runtimeResult.operation, calibration.browserInput.operation);
  assert.equal(runtimeResult.sourceWidth, calibration.source.width);
  assert.equal(runtimeResult.sourceHeight, calibration.source.height);
  assert.equal(runtimeResult.outputWidth, calibration.output.width);
  assert.equal(runtimeResult.outputHeight, calibration.output.height);
  assert.equal(runtimeResult.sourceRgbaBytes, calibration.source.width * calibration.source.height * 4);
  assert.equal(runtimeResult.outputRgbaBytes, calibration.output.width * calibration.output.height * 4);
  assert.ok(runtimeResult.pngBytes > 0);
  assert.ok(
    observedPeakDeltaBytes <= estimate.browserPeakBytes,
    `${calibration.id} observed Chrome memory delta ${observedPeakDeltaBytes} exceeds modeled browser peak ${estimate.browserPeakBytes}`,
  );

  return Object.freeze({
    id: calibration.id,
    executor: estimate.executor,
    source: calibration.source,
    output: calibration.output,
    model: Object.freeze({
      schemaVersion: estimate.schemaVersion,
      modelVersion: estimate.modelVersion,
      profileId: estimate.profileId,
      profileVersion: estimate.profileVersion,
      browserPeakBytes: estimate.browserPeakBytes,
      coreVerificationPeakBytes: estimate.coreVerificationPeakBytes,
      requiredPeakMemoryBytes: estimate.requiredPeakMemoryBytes,
    }),
    runtimeResult,
    observed: Object.freeze({
      baselineAccountedBytes: baseline.totalAccountedBytes,
      peakAccountedBytes: peak,
      observedPeakDeltaBytes,
      withinModeledBrowserPeak: true,
    }),
  });
}

function memorySample(raw) {
  const usedSize = finiteNonNegative(raw.usedSize, 'usedSize');
  const embedderHeapUsedSize = finiteNonNegative(raw.embedderHeapUsedSize, 'embedderHeapUsedSize');
  const backingStorageSize = finiteNonNegative(raw.backingStorageSize, 'backingStorageSize');
  return Object.freeze({
    usedSize,
    embedderHeapUsedSize,
    backingStorageSize,
    totalAccountedBytes: usedSize + embedderHeapUsedSize + backingStorageSize,
  });
}

function finiteNonNegative(value, name) {
  assert.equal(typeof value, 'number', `CDP Runtime.getHeapUsage omitted ${name}`);
  assert.ok(Number.isFinite(value) && value >= 0, `CDP Runtime.getHeapUsage returned invalid ${name}`);
  return value;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
