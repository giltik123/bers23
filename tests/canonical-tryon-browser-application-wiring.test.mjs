import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../src/application/fashion/createCanonicalTryOnBrowserApplication.js', import.meta.url), 'utf8');
const application = fs.readFileSync(new URL('../src/application/fashion/canonicalTryOnApplication.js', import.meta.url), 'utf8');
const prepared = fs.readFileSync(new URL('../src/application/local-execution/CorePreparedFashionTryOn.ts', import.meta.url), 'utf8');
const client = fs.readFileSync(new URL('../src/api/coreClient.js', import.meta.url), 'utf8');

test('browser composition root wires only the canonical Fashion product client into accepted prepared executors', () => {
  for (const method of [
    'checkTryOnReadiness', 'prepareTryOn', 'continueTryOn', 'getTryOnResult', 'getTryOnPreview',
    'loadTryOnWarpInput', 'submitTryOnWarpCandidate', 'loadTryOnTextureInput', 'submitTryOnTextureCandidate',
  ]) {
    assert.ok(source.includes(method), `composition root must require ${method}`);
    assert.ok(client.includes(`${method}:`), `coreClient.fashion must expose ${method}`);
  }
  assert.match(source, /new CorePreparedGarmentMeshWarp/);
  assert.match(source, /new CorePreparedGarmentTextureComposite/);
  assert.match(source, /createCanonicalTryOnApplication/);
  assert.match(prepared, /garmentMeshWarpRgba8/);
  assert.match(prepared, /garmentTextureCompositeRgba8/);
});

test('UI-facing composition root does not expose a second execution, financial or Project mutation authority', () => {
  for (const forbidden of [
    'coreClient.localExecution', 'coreClient.entities', 'FASHN', 'provider', 'billing', 'credits',
    'pushEdit', 'acceptFinal', 'persistFinal', 'representationId', 'anchorSetId', 'destinationMesh',
    'fetch(', 'localStorage', 'sessionStorage',
  ]) {
    assert.equal(source.includes(forbidden), false, `composition root must not contain ${forbidden}`);
  }
  assert.match(application, /It never persists or exposes ticket/);
  assert.match(source, /Prepared Try-On execution escaped its bound Project/);
});

test('prepared candidate transport remains encapsulated behind opaque application calls', () => {
  assert.equal(source.includes('/fashion/try-on/warp/'), false);
  assert.equal(source.includes('/fashion/try-on/texture/'), false);
  assert.equal(source.includes('image/png'), false);
  assert.match(prepared, /submitPreparedGarmentMeshWarpCandidate/);
  assert.match(prepared, /submitPreparedGarmentTextureCompositeCandidate/);
});
