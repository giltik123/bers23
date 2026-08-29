import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import { build } from 'vite';
import {
  D6_D3_WEBGPU_PRECISION_EVIDENCE_SHA256,
  D6_ORT_WEB_VERSION,
  D6_REQUIRED_WEBGPU_FEATURES,
  D6_WEBGPU_COMPONENTS,
  D6_WEBGPU_PRECISION,
} from './tiny-sd-d6-accelerated-admission.mjs';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!key?.startsWith('--') || value === undefined) throw new Error(`invalid argument pair at ${key ?? '<missing>'}`);
  args.set(key.slice(2), value);
}
const requiredPath = name => {
  const value = args.get(name);
  if (!value) throw new Error(`--${name} is required`);
  return path.resolve(value);
};
const requiredText = name => {
  const value = args.get(name)?.trim();
  if (!value) throw new Error(`--${name} is required`);
  return value;
};

const modelDir = requiredPath('model-dir');
const fixtureDir = requiredPath('fixture-dir');
const precisionReportPath = requiredPath('precision-report');
const reportPath = requiredPath('report');
const platform = requiredText('platform');
const deviceClass = requiredText('device-class');
const deviceTier = requiredText('device-tier');
const coarseDeviceEvidenceKey = requiredText('coarse-device-evidence-key');
const browserMode = args.get('browser-mode')?.trim() || 'headed';
if (!['WINDOWS', 'MACOS', 'LINUX'].includes(platform)) throw new Error(`desktop collector does not support --platform: ${platform}`);
if (deviceClass !== 'DESKTOP') throw new Error(`desktop collector requires --device-class DESKTOP, got: ${deviceClass}`);
if (!['LOW', 'MEDIUM', 'HIGH', 'EXTREME'].includes(deviceTier)) throw new Error(`unsupported --device-tier: ${deviceTier}`);
if (!['headed', 'headless'].includes(browserMode)) throw new Error(`unsupported --browser-mode: ${browserMode}`);

const COMPONENTS = Object.keys(D6_WEBGPU_COMPONENTS);
const WARMUP_COUNT = 1;
const SAMPLE_COUNT = 5;
const OUTER_TIMEOUT_MS = 1_800_000;
const outputDir = path.resolve('.test-cache/tiny-sd-d6-device-dist');
const origin = 'http://127.0.0.1:4186';

const shaFile = async file => new Promise((resolve, reject) => {
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
assert.equal(precision.selectedWebGpuCandidatePrecision, D6_WEBGPU_PRECISION);
assert.equal(precision.releaseIdentityPinned, false);
assert.equal(precision.runtimeAuthorityGranted, false);
assert.equal(precision.productionApproval, false);
assert.equal(precision.realDeviceApproval, false);
assert.deepEqual(Object.keys(precision.components).sort(), [...COMPONENTS].sort());
assert.equal(createHash('sha256').update(precisionBytes).digest('hex'), D6_D3_WEBGPU_PRECISION_EVIDENCE_SHA256);

for (const component of COMPONENTS) {
  const expected = D6_WEBGPU_COMPONENTS[component];
  const record = precision.components[component];
  assert.equal(record.result, 'FP16_GRAPH_PASS');
  assert.equal(record.fp16.sha256, expected.sha256);
  assert.equal(record.fp16.size, expected.size);
  const modelPath = path.join(modelDir, `${component}.onnx`);
  assert.equal((await fs.stat(modelPath)).size, expected.size, `${component} model size mismatch`);
  assert.equal(await shaFile(modelPath), expected.sha256, `${component} model SHA mismatch`);
  for (const input of record.browserFixture.inputs) {
    const file = path.join(fixtureDir, component, input.path);
    assert.equal((await fs.stat(file)).size, input.bytes, `${component}/${input.name} fixture size mismatch`);
    assert.equal(await shaFile(file), input.sha256, `${component}/${input.name} fixture SHA mismatch`);
  }
  const reference = record.browserFixture.reference;
  const referencePath = path.join(fixtureDir, component, reference.path);
  assert.equal((await fs.stat(referencePath)).size, reference.bytes, `${component} reference size mismatch`);
  assert.equal(await shaFile(referencePath), reference.sha256, `${component} reference SHA mismatch`);
}

await build({
  root: path.resolve('.'),
  build: { outDir: outputDir, emptyOutDir: true, rollupOptions: { input: path.resolve('tests/tiny-sd-d6-browser-webgpu-device.html') } },
});

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.mjs', 'text/javascript; charset=utf-8'],
  ['.onnx', 'application/octet-stream'], ['.bin', 'application/octet-stream'], ['.f32', 'application/octet-stream'],
]);
const safeChild = (root, child) => {
  const resolved = path.resolve(root, child);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error('path traversal');
  return resolved;
};
const resolveSpecial = requestPath => {
  const model = requestPath.match(/^\/__tiny_sd_d6\/model\/(text_encoder|unet|vae_decoder)\.onnx$/);
  if (model) return path.join(modelDir, `${model[1]}.onnx`);
  const fixture = requestPath.match(/^\/__tiny_sd_d6\/fixture\/(text_encoder|unet|vae_decoder)\/([A-Za-z0-9_.-]+)$/);
  if (fixture) return safeChild(path.join(fixtureDir, fixture[1]), fixture[2]);
  return null;
};
const server = http.createServer(async (request, response) => {
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
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(4186, '127.0.0.1', resolve); });

const componentConfig = component => {
  const record = precision.components[component];
  const reference = record.browserFixture.reference;
  return {
    component,
    modelUrl: `/__tiny_sd_d6/model/${component}.onnx`,
    modelBytes: record.fp16.size,
    modelSha256: record.fp16.sha256,
    inputs: record.browserFixture.inputs.map(input => ({
      name: input.name,
      dtype: input.dtype,
      dims: input.shape,
      url: `/__tiny_sd_d6/fixture/${component}/${input.path}`,
    })),
    outputName: reference.name,
    outputDims: reference.shape,
    referenceUrl: `/__tiny_sd_d6/fixture/${component}/${reference.path}`,
    thresholds: {
      maxAbs: component === 'text_encoder' ? 5e-3 : component === 'unet' ? 1e-2 : 2e-2,
      rmse: component === 'text_encoder' ? 5e-4 : component === 'unet' ? 1e-3 : 2e-3,
    },
  };
};

const diagnostics = { pageErrors: [], consoleErrors: [], externalHttpRequests: [], failedRequests: [], failedResponses: [] };
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: browserMode === 'headless', args: ['--enable-precise-memory-info'] });
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
  await page.goto(`${origin}/tests/tiny-sd-d6-browser-webgpu-device.html`);
  await page.waitForFunction(() => typeof globalThis.runTinySdD6WebGpuDeviceCapture === 'function', undefined, { timeout: 30_000 });

  let timer;
  const evaluation = page.evaluate(input => globalThis.runTinySdD6WebGpuDeviceCapture(input), {
    components: Object.fromEntries(COMPONENTS.map(component => [component, componentConfig(component)])),
    benchmark: { warmupCount: WARMUP_COUNT, sampleCount: SAMPLE_COUNT },
  });
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`D6_DEVICE_CAPTURE_TIMEOUT_${OUTER_TIMEOUT_MS}`)), OUTER_TIMEOUT_MS);
  });
  let report;
  try { report = await Promise.race([evaluation, timeout]); } finally { clearTimeout(timer); }

  assert.equal(report.status, 'CANDIDATE');
  assert.equal(report.stage, 'D6_WEBGPU_UNATTESTED_DEVICE_CAPTURE');
  assert.equal(report.authority, 'UNATTESTED_DEVICE_CAPTURE_NOT_ADMISSION');
  assert.equal(report.evidenceKind, 'UNATTESTED_DEVICE_CAPTURE');
  assert.equal(report.provider, 'webgpu');
  assert.deepEqual(report.executionProviders, ['webgpu']);
  assert.equal(report.providerFallbackAllowed, false);
  assert.equal(report.precisionTier, D6_WEBGPU_PRECISION);
  assert.equal(report.onnxruntimeWebVersion, D6_ORT_WEB_VERSION);
  assert.deepEqual(report.requiredFeatures, D6_REQUIRED_WEBGPU_FEATURES);
  assert.equal(report.realDeviceEvidence, false);
  assert.equal(report.realDeviceAdmission, false);
  assert.equal(report.productionApproval, false);
  assert.equal(report.editorAuthorityGranted, false);
  assert.equal(report.releaseAuthorityGranted, false);
  assert.equal(report.cloudFallbackAllowed, false);
  assert.equal(report.billingAuthorityGranted, false);
  assert.deepEqual(diagnostics.externalHttpRequests, []);
  assert.deepEqual(diagnostics.pageErrors, []);

  report.captureMetadata = {
    platform,
    deviceClass,
    deviceTier,
    coarseDeviceEvidenceKey,
    browserMode,
    browserProductVersion,
    capturedAt: Date.now(),
    attestationStatus: 'UNVERIFIED_REQUIRES_EXTERNAL_TRUST_BOUNDARY',
  };
  report.precisionEvidenceSha256 = D6_D3_WEBGPU_PRECISION_EVIDENCE_SHA256;
  report.networkDiagnostics = diagnostics;
  report.modelIdentity = D6_WEBGPU_COMPONENTS;
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`TINY-SD D6 WEBGPU DEVICE CAPTURE: result=${report.result} pass=${report.passCount ?? 0}/3 attestation=UNVERIFIED`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
