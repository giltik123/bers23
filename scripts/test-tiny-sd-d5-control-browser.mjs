import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import { build } from 'vite';
import { D5_CONTROL_AUTHORITY, D5_DPM_PARITY_LIMIT, D5_TRANSFORMERS_JS_VERSION } from './tiny-sd-d5-control-constants.mjs';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!key?.startsWith('--') || value === undefined) throw new Error(`invalid argument pair: ${key ?? '<missing>'}`);
  args.set(key.slice(2), value);
}
const required = name => {
  const value = args.get(name);
  if (!value) throw new Error(`--${name} is required`);
  return path.resolve(value);
};
const tokenizerDir = required('tokenizer-dir');
const referencePath = required('reference');
const preparationPath = required('preparation');
const reportPath = required('report');
const outputDir = path.resolve('.test-cache/tiny-sd-d5-control-browser-dist');
const port = 4181;
const origin = `http://127.0.0.1:${port}`;

const hashBytes = bytes => createHash('sha256').update(bytes).digest('hex');
const hashFile = async file => hashBytes(await fs.readFile(file));
const referenceBytes = await fs.readFile(referencePath);
const preparationBytes = await fs.readFile(preparationPath);
const reference = JSON.parse(referenceBytes.toString('utf8'));
const preparation = JSON.parse(preparationBytes.toString('utf8'));
assert.equal(reference.status, 'CANDIDATE');
assert.equal(reference.stage, 'D5_CONTROL_SEMANTICS_REFERENCE');
assert.equal(reference.authority, D5_CONTROL_AUTHORITY);
assert.equal(preparation.status, 'CANDIDATE');
assert.equal(preparation.stage, 'D5_BROWSER_TOKENIZER_PREPARATION');
assert.equal(preparation.authority, D5_CONTROL_AUTHORITY);
assert.equal(preparation.referenceLibrary, 'transformers==4.30.2');
assert.equal(preparation.modelMaxLength, 77);
assert.deepEqual(preparation.specialTokenIds, { bos: 49406, eos: 49407, pad: 49407 });
assert.equal(preparation.pinnedSourceAssetsPreservedByteExactly, true);
assert.equal(preparation.fastVsHistoricalReferenceExact, true);
assert.equal(reference.tokenizer.historicalPostProcessing.policy, 'BOS_PLUS_FIRST_75_CONTENT_PLUS_EOS_THEN_RIGHT_PAD');
assert.equal(reference.tokenizer.historicalPostProcessing.provedAgainstHistoricalTokenizer, true);
assert.equal(Object.keys(reference.tokenizer.cases).length, 5);

for (const [name, metadata] of Object.entries(preparation.files)) {
  const file = path.join(tokenizerDir, name);
  assert.equal((await fs.stat(file)).size, metadata.bytes, `browser tokenizer size drift: ${name}`);
  assert.equal(await hashFile(file), metadata.sha256, `browser tokenizer SHA drift: ${name}`);
}

await build({
  root: path.resolve('.'),
  build: {
    outDir: outputDir,
    emptyOutDir: true,
    rollupOptions: { input: path.resolve('tests/tiny-sd-d5-control-browser.html') },
  },
});

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
]);
const setIsolationHeaders = response => {
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
};
const localTokenizerPrefix = '/__tiny_sd_d5/models/tiny-sd-tokenizer/';
const resolveTokenizer = requestPath => {
  if (!requestPath.startsWith(localTokenizerPrefix)) return null;
  const name = requestPath.slice(localTokenizerPrefix.length);
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) throw new Error('invalid local tokenizer filename');
  return path.join(tokenizerDir, name);
};

const server = http.createServer(async (request, response) => {
  setIsolationHeaders(response);
  try {
    const requestPath = decodeURIComponent(new URL(request.url ?? '/', origin).pathname);
    const tokenizerFile = resolveTokenizer(requestPath);
    if (tokenizerFile) {
      const stat = await fs.stat(tokenizerFile);
      response.statusCode = 200;
      response.setHeader('Content-Type', contentTypes.get(path.extname(tokenizerFile)) ?? 'application/octet-stream');
      response.setHeader('Content-Length', String(stat.size));
      response.setHeader('Cache-Control', 'no-store');
      createReadStream(tokenizerFile).pipe(response);
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
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const browserProductVersion = browser.version();
  const page = await browser.newPage();
  const diagnostics = { pageErrors: [], consoleErrors: [], externalHttpRequests: [], failedRequests: [], failedResponses: [] };
  page.on('pageerror', error => diagnostics.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') diagnostics.consoleErrors.push(message.text()); });
  page.on('request', request => {
    const url = request.url();
    if (/^https?:/i.test(url) && new URL(url).origin !== origin) diagnostics.externalHttpRequests.push(url);
  });
  page.on('requestfailed', request => diagnostics.failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? 'unknown' }));
  page.on('response', response => { if (response.status() >= 400) diagnostics.failedResponses.push({ url: response.url(), status: response.status() }); });

  await page.goto(`${origin}/tests/tiny-sd-d5-control-browser.html`);
  await page.waitForFunction(() => typeof globalThis.runTinySdD5ControlBrowser === 'function', undefined, { timeout: 20_000 });
  const runtimeReport = await page.evaluate(input => globalThis.runTinySdD5ControlBrowser(input), { reference, preparation });

  assert.deepEqual(diagnostics.externalHttpRequests, [], `D5 browser tokenizer attempted external HTTP(S): ${JSON.stringify(diagnostics.externalHttpRequests)}`);
  assert.deepEqual(diagnostics.pageErrors, [], `D5 browser page errors: ${JSON.stringify(diagnostics.pageErrors)}`);
  assert.equal(runtimeReport.status, 'CANDIDATE');
  assert.equal(runtimeReport.stage, 'D5_BROWSER_CONTROL_SEMANTICS');
  assert.equal(runtimeReport.authority, D5_CONTROL_AUTHORITY);
  assert.equal(runtimeReport.transformersJsVersion, D5_TRANSFORMERS_JS_VERSION);
  assert.equal(runtimeReport.tokenizerCompatibilityPolicy, 'RAW_TRANSFORMERS_JS_BPE_PLUS_HISTORICAL_CLIP_POST_PROCESSING');
  assert.equal(runtimeReport.tokenizerRemoteModelsAllowed, false);
  assert.equal(runtimeReport.tokenizerLocalModelsAllowed, true);
  assert.equal(runtimeReport.browserAttempted, true);
  assert.equal(runtimeReport.runtimeAuthorityGranted, false);
  assert.equal(runtimeReport.productionApproval, false);
  assert.equal(runtimeReport.cloudFallbackAllowed, false);
  assert.deepEqual(Object.keys(runtimeReport.tokenizerCases).sort(), Object.keys(reference.tokenizer.cases).sort());
  assert.ok(Object.values(runtimeReport.tokenizerCases).every(value => value.exactRawContentIds && value.exactInputIds && value.exactAttentionMask));
  assert.ok(runtimeReport.scheduler.observed.maxAbs <= D5_DPM_PARITY_LIMIT.maxAbs);
  assert.ok(runtimeReport.scheduler.observed.rmse <= D5_DPM_PARITY_LIMIT.rmse);
  assert.equal(runtimeReport.scheduler.resetParity.maxAbs, 0);

  const report = {
    ...runtimeReport,
    browserProductVersion,
    referenceEvidenceSha256: hashBytes(referenceBytes),
    tokenizerPreparationEvidenceSha256: hashBytes(preparationBytes),
    tokenizerAssetManifest: preparation.files,
    networkDiagnostics: diagnostics,
    providerFallbackAllowed: false,
    externalRuntimeOrModelHttpAllowed: false,
    productionPromotionAllowed: false,
  };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`TINY-SD D5 BROWSER CONTROL: PASS tokenizer=${Object.keys(report.tokenizerCases).length}/5 rawBpe=5/5 dpmMaxAbs=${report.scheduler.observed.maxAbs}`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
