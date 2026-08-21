import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { build } from 'vite';

const revision = 'd6e401e212561c00f478ef4ee2758b46a2e23564';
const sources = [
  { category: 'person/clothing', file: 'zidane.jpg', url: `https://raw.githubusercontent.com/ultralytics/assets/${revision}/im/zidane.jpg`, sha256: '16d73869e3267a7d4ed00de8e860833bd1657c1b252e94c0c348277adc7b6edb' },
  { category: 'car/object', file: 'bus.jpg', url: `https://raw.githubusercontent.com/ultralytics/assets/${revision}/im/bus.jpg`, sha256: 'c02019c4979c191eb739ddd944445ef408dad5679acab6fd520ef9d434bfbc63' },
  { category: 'animal', file: 'dog.jpg', url: 'https://raw.githubusercontent.com/pytorch/hub/c7895df70c7767403e36f82786d6b611b7984557/images/dog.jpg', sha256: 'f3f87bb8ab3c26c7ecfd3ac60421d7f32b0503d1d6c5baf8bac42ed93d86351a' },
  { category: 'complex-background', file: 'airport.jpg', url: `https://raw.githubusercontent.com/ultralytics/assets/${revision}/im/airport.jpg`, sha256: '7daff53a4d82d2ee0637d2ad5af26ab05e729c2b51bbc6c9ad01116427f7c401' },
];
const cacheDir = path.resolve('.test-cache/mobilesam-images');
const outputDir = path.resolve('.test-cache/mobilesam-browser-dist');
await fs.mkdir(cacheDir, { recursive: true });
const fixtures = [];
for (const source of sources) {
  const original = new Uint8Array(await (await fetch(source.url)).arrayBuffer());
  assert.equal(createHash('sha256').update(original).digest('hex'), source.sha256, `${source.category} fixture SHA-256`);
  const output = path.join(cacheDir, source.file);
  await sharp(original).resize({ width: 512, height: 512, fit: 'inside' }).jpeg({ quality: 85 }).toFile(output);
  const metadata = await sharp(output).metadata();
  fixtures.push({ category: source.category, url: `/__fixtures/${source.file}`, artifactId: `artifact-${source.file}`, width: metadata.width, height: metadata.height, points: [{ x: metadata.width * .5, y: metadata.height * .5, label: 'POSITIVE' }, { x: metadata.width * .55, y: metadata.height * .55, label: 'POSITIVE' }, { x: 2, y: 2, label: 'NEGATIVE' }] });
}

// Build the real production imports. This deliberately avoids Vite's source-module
// server, so protected signing material is transformed into the bundle at build time.
await build({
  root: path.resolve('.'),
  build: {
    outDir: outputDir,
    emptyOutDir: true,
    rollupOptions: { input: path.resolve('tests/mobile-sam-browser-acceptance.html') },
  },
});
const fixtureOutput = path.join(outputDir, '__fixtures');
await fs.mkdir(fixtureOutput, { recursive: true });
await Promise.all(sources.map(source => fs.copyFile(path.join(cacheDir, source.file), path.join(fixtureOutput, source.file))));

const contentTypes = new Map([['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.mjs', 'text/javascript; charset=utf-8'], ['.wasm', 'application/wasm'], ['.jpg', 'image/jpeg']]);
const server = http.createServer(async (request, response) => {
  try {
    const requestPath = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    const file = path.resolve(outputDir, `.${requestPath}`);
    if (file !== outputDir && !file.startsWith(`${outputDir}${path.sep}`)) throw new Error('path traversal');
    const body = await fs.readFile(file);
    response.setHeader('Content-Type', contentTypes.get(path.extname(file)) ?? 'application/octet-stream');
    response.end(body);
  } catch {
    response.statusCode = 404;
    response.end('Not found');
  }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(4174, '127.0.0.1', resolve); });

let browser;
try {
  try { browser = await chromium.launch({ channel: 'chrome', headless: true }); } catch (error) { throw new Error(`Mandatory system Google Chrome launch failed: ${error instanceof Error ? error.message : error}`); }
  const version = browser.version();
  assert.match(version, /Chrome|Chromium|\d+\./);
  const page = await browser.newPage();
  const diagnostics = { pageErrors: [], consoleErrors: [], failedRequests: [], failedResponses: [] };
  const localAssetResponses = [];
  page.on('pageerror', error => diagnostics.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') diagnostics.consoleErrors.push(message.text()); });
  page.on('requestfailed', request => diagnostics.failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? 'unknown' }));
  page.on('response', response => {
    if (response.status() >= 400) diagnostics.failedResponses.push({ url: response.url(), status: response.status() });
    if (new URL(response.url()).origin === 'http://127.0.0.1:4174' && /ort-wasm.*\.(?:wasm|mjs)(?:$|\?)/.test(response.url())) localAssetResponses.push({ url: response.url(), status: response.status() });
  });
  await page.goto('http://127.0.0.1:4174/tests/mobile-sam-browser-acceptance.html');
  try {
    await page.waitForFunction(() => typeof globalThis.runMobileSamAcceptance === 'function', undefined, { timeout: 15_000 });
  } catch (error) {
    throw new Error(`MOBILESAM_ACCEPTANCE_BOOTSTRAP_FAILED\n${JSON.stringify(diagnostics, null, 2)}\n${error instanceof Error ? error.message : error}`);
  }
  const report = await page.evaluate(async input => globalThis.runMobileSamAcceptance(input), fixtures);
  assert.ok(localAssetResponses.some(item => item.url.includes('.wasm') && item.status === 200), `local ORT WASM asset did not load successfully: ${JSON.stringify({ localAssetResponses, diagnostics })}`);
  assert.ok(localAssetResponses.some(item => item.url.includes('.mjs') && item.status === 200), `local ORT module asset did not load successfully: ${JSON.stringify({ localAssetResponses, diagnostics })}`);
  report.browserProductVersion = version;
  report.ortLocalAssets = localAssetResponses;
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
