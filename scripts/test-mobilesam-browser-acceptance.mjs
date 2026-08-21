import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { createServer } from 'vite';

const revision = 'd6e401e212561c00f478ef4ee2758b46a2e23564';
const sources = [
  { category: 'person/clothing', file: 'zidane.jpg', url: `https://raw.githubusercontent.com/ultralytics/assets/${revision}/im/zidane.jpg`, sha256: '16d73869e3267a7d4ed00de8e860833bd1657c1b252e94c0c348277adc7b6edb' },
  { category: 'car/object', file: 'bus.jpg', url: `https://raw.githubusercontent.com/ultralytics/assets/${revision}/im/bus.jpg`, sha256: 'c02019c4979c191eb739ddd944445ef408dad5679acab6fd520ef9d434bfbc63' },
  { category: 'animal', file: 'dog.jpg', url: 'https://raw.githubusercontent.com/pytorch/hub/c7895df70c7767403e36f82786d6b611b7984557/images/dog.jpg', sha256: 'f3f87bb8ab3c26c7ecfd3ac60421d7f32b0503d1d6c5baf8bac42ed93d86351a' },
  { category: 'complex-background', file: 'airport.jpg', url: `https://raw.githubusercontent.com/ultralytics/assets/${revision}/im/airport.jpg`, sha256: '7daff53a4d82d2ee0637d2ad5af26ab05e729c2b51bbc6c9ad01116427f7c401' },
];
const cacheDir = path.resolve('.test-cache/mobilesam-images'); await fs.mkdir(cacheDir, { recursive: true });
const fixtures = [];
for (const source of sources) {
  const original = new Uint8Array(await (await fetch(source.url)).arrayBuffer());
  assert.equal(createHash('sha256').update(original).digest('hex'), source.sha256, `${source.category} fixture SHA-256`);
  const output = path.join(cacheDir, source.file); await sharp(original).resize({ width: 512, height: 512, fit: 'inside' }).jpeg({ quality: 85 }).toFile(output); const metadata = await sharp(output).metadata();
  fixtures.push({ category: source.category, url: `/__fixtures/${source.file}`, artifactId: `artifact-${source.file}`, width: metadata.width, height: metadata.height, points: [{ x: metadata.width * .5, y: metadata.height * .5, label: 'POSITIVE' }, { x: metadata.width * .55, y: metadata.height * .55, label: 'POSITIVE' }, { x: 2, y: 2, label: 'NEGATIVE' }] });
}
const server = await createServer({ server: { port: 4174 }, plugins: [{ name: 'acceptance-fixtures', configureServer(vite) { vite.middlewares.use('/__fixtures', async (request, response) => { try { response.setHeader('Content-Type', 'image/jpeg'); response.end(await fs.readFile(path.join(cacheDir, path.basename(request.url)))); } catch { response.statusCode = 404; response.end(); } }); } }] });
await server.listen(); let browser;
try {
  try { browser = await chromium.launch({ channel: 'chrome', headless: true }); } catch (error) { throw new Error(`Mandatory system Google Chrome launch failed: ${error instanceof Error ? error.message : error}`); }
  const version = browser.version(); assert.match(version, /Chrome|Chromium|\d+\./); const page = await browser.newPage(); await page.goto('http://localhost:4174/tests/mobile-sam-browser-acceptance.html');
  const report = await page.evaluate(async input => globalThis.runMobileSamAcceptance(input), fixtures); report.browserProductVersion = version; console.log(JSON.stringify(report, null, 2));
} finally { await browser?.close(); await server.close(); }
