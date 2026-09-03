import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const application = fs.readFileSync(new URL('../src/application/fashion/canonicalTryOnApplication.js', import.meta.url), 'utf8');
const coreClient = fs.readFileSync(new URL('../src/api/coreClient.js', import.meta.url), 'utf8');
const readiness = fs.readFileSync(new URL('../server/core/fashion/FashionTryOnReadinessService.ts', import.meta.url), 'utf8');
const product = fs.readFileSync(new URL('../server/core/fashion/FashionTryOnProductService.ts', import.meta.url), 'utf8');
const result = fs.readFileSync(new URL('../server/core/fashion/FashionTryOnFinalResultService.ts', import.meta.url), 'utf8');
const prepared = fs.readFileSync(new URL('../src/application/local-execution/CorePreparedFashionTryOn.ts', import.meta.url), 'utf8');

test('application foundation is bound to existing product-only Core methods', () => {
  for (const method of ['checkTryOnReadiness', 'prepareTryOn', 'continueTryOn', 'getTryOnResult']) {
    assert.match(application, new RegExp(`core\\.${method}`));
    assert.match(coreClient, new RegExp(`\\b${method}\\b`));
  }
  for (const method of ['loadTryOnWarpInput', 'submitTryOnWarpCandidate', 'loadTryOnTextureInput', 'submitTryOnTextureCandidate']) {
    assert.match(coreClient, new RegExp(`\\b${method}\\b`));
  }
});

test('readiness and terminal states stay aligned with server-owned closed contracts', () => {
  for (const status of [
    'READY', 'SOURCE_UNAVAILABLE', 'STALE_SOURCE', 'GARMENT_UNAVAILABLE', 'GARMENT_UNSUPPORTED',
    'REPRESENTATION_REQUIRED', 'REPRESENTATION_AMBIGUOUS', 'BODY_ANCHORS_REQUIRED',
    'BODY_ANCHORS_AMBIGUOUS', 'EVIDENCE_INVALID',
  ]) {
    assert.ok(readiness.includes(`'${status}'`), `server readiness must retain ${status}`);
    assert.ok(application.includes(`'${status}'`), `application readiness must retain ${status}`);
  }
  for (const status of ['TEXTURE_NOT_PREPARED', 'TEXTURE_PENDING', 'TEXTURE_FAILED', 'TEXTURE_STALE', 'FINAL_READY']) {
    assert.ok(result.includes(`'${status}'`), `server result must retain ${status}`);
    assert.ok(application.includes(`'${status}'`), `application result must retain ${status}`);
  }
  assert.ok(product.includes("status: 'WARP_PREPARED'"));
  assert.ok(product.includes("status: 'TEXTURE_PREPARED'"));
  assert.ok(product.includes("'PREREQUISITE' | 'WARP_PENDING'"));
});

test('opaque prepared executors remain the only intended pixel bridge', () => {
  assert.match(prepared, /class CorePreparedGarmentMeshWarp/);
  assert.match(prepared, /class CorePreparedGarmentTextureComposite/);
  assert.match(prepared, /ticketId: descriptor\.ticketId/);
  assert.doesNotMatch(prepared, /representationId|anchorSetId|garmentWarpLayerId/);
  assert.match(application, /executeWarp/);
  assert.match(application, /executeTexture/);
});

test('application state never accepts browser evidence or financial/provider authority', () => {
  for (const forbidden of [
    'representationId', 'anchorSetId', 'garmentWarpLayerId', 'garmentWarpLayerSha256',
    'storageId', 'sha256', 'FASHN', 'provider', 'billing', 'credits', 'fetch(',
    'pushEdit', 'acceptFinal', 'persistFinal', 'onCommit', 'onRollback', 'localStorage',
  ]) {
    assert.equal(application.includes(forbidden), false, `application foundation must not contain ${forbidden}`);
  }
  assert.match(application, /requireExactKeys/);
  assert.match(application, /stable product intent/);
});

test('resume and recover source cannot silently re-run earlier phases', () => {
  const resume = application.slice(application.indexOf('async resume(value)'), application.indexOf('/** Read-only recovery'));
  const recover = application.slice(application.indexOf('const recover = async'), application.indexOf('const advance = async'));
  assert.doesNotMatch(resume, /prepareTryOn|executeWarp/);
  assert.doesNotMatch(recover, /prepareTryOn|continueTryOn|executeWarp|executeTexture/);
});
