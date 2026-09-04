import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  annotateCanonicalTryOnError,
  appendCanonicalTryOnSupportId,
  canonicalTryOnErrorMessage,
  canonicalTryOnSupportId,
} from '../src/application/fashion/canonicalTryOnSupportDiagnostic.js';
import { manualAcquisitionErrorMessage } from '../src/application/fashion/canonicalTryOnManualAcquisition.js';

test('only short ASCII correlation identifiers cross the support projection', () => {
  assert.equal(canonicalTryOnSupportId({ correlationId: '4ab3c47a-1c88-4ef8-b6a8-05a174f9fc2b' }), '4ab3c47a-1c88-4ef8-b6a8-05a174f9fc2b');
  assert.equal(canonicalTryOnSupportId({ correlationId: ' fashion.tryon:abc_123 ' }), 'fashion.tryon:abc_123');
  assert.equal(canonicalTryOnSupportId({ correlationId: 'contains space' }), null);
  assert.equal(canonicalTryOnSupportId({ correlationId: 'bad\nheader' }), null);
  assert.equal(canonicalTryOnSupportId({ correlationId: 'тест' }), null);
  assert.equal(canonicalTryOnSupportId({ correlationId: `a${'b'.repeat(128)}` }), null);
  assert.equal(canonicalTryOnSupportId({ correlationId: '' }), null);
  assert.equal(canonicalTryOnSupportId(null), null);
});

test('one wrapped Core cause may supply the same strictly filtered support ID', () => {
  const outer = Object.assign(new Error('Reload failed after accepted contour'), {
    code: 'TRYON_MANUAL_CONTOUR_SAVED_RELOAD_PENDING',
    cause: Object.assign(new Error('Core reload failed'), { correlationId: 'reload-corr-42' }),
  });
  assert.equal(canonicalTryOnSupportId(outer), 'reload-corr-42');
  assert.equal(
    canonicalTryOnErrorMessage(outer),
    'Reload failed after accepted contour Support ID: reload-corr-42',
  );
  outer.cause.correlationId = 'bad correlation id';
  assert.equal(canonicalTryOnSupportId(outer), null);
});

test('support suffix is idempotent and never renders the Core response bag', () => {
  const error = Object.assign(new Error('Try-On request failed'), {
    correlationId: 'corr-123',
    data: {
      storageId: 'secret-storage',
      contentSha256: 'deadbeef',
      provider: 'hidden-provider',
    },
  });
  const once = canonicalTryOnErrorMessage(error);
  const twice = appendCanonicalTryOnSupportId(once, error);
  assert.equal(once, 'Try-On request failed Support ID: corr-123');
  assert.equal(twice, once);
  assert.equal(once.includes('secret-storage'), false);
  assert.equal(once.includes('deadbeef'), false);
  assert.equal(once.includes('hidden-provider'), false);
});

test('annotation preserves the original Error identity and semantic fields', () => {
  const error = Object.assign(new Error('Core rejected manual contour'), {
    code: 'manual_parametric_invalid_contour',
    retryable: false,
    correlationId: 'support-77',
  });
  const annotated = annotateCanonicalTryOnError(error);
  assert.equal(annotated, error);
  assert.equal(annotated.code, 'manual_parametric_invalid_contour');
  assert.equal(annotated.retryable, false);
  assert.equal(annotated.message, 'Core rejected manual contour Support ID: support-77');

  annotateCanonicalTryOnError(error);
  assert.equal(error.message, 'Core rejected manual contour Support ID: support-77');
});

test('frozen Error degrades to the original semantic error without replacement', () => {
  const error = Object.assign(new Error('Frozen failure'), { correlationId: 'corr-frozen' });
  Object.freeze(error);
  assert.equal(annotateCanonicalTryOnError(error), error);
  assert.equal(error.message, 'Frozen failure');
});

test('known manual geometry messages retain actionable copy plus support ID', () => {
  const error = Object.assign(new Error('raw Core detail'), {
    code: 'body_anchor_destination_geometry_invalid',
    correlationId: 'anchors-42',
  });
  assert.equal(
    manualAcquisitionErrorMessage(error),
    'The selected body anchors would invert or collapse the garment. Reposition them. Support ID: anchors-42',
  );
});

test('private hook decorates async Core failures without reading error.data', async () => {
  const hook = await readFile('src/components/editor/outfits/useCanonicalTryOnEditor.js', 'utf8');
  assert.match(hook, /annotateCanonicalTryOnError/);
  assert.match(hook, /async function withTryOnDiagnostic\(operation\)/);
  assert.match(hook, /withTryOnDiagnostic\(\(\) => operation\)/);
  assert.match(hook, /withTryOnDiagnostic\(\(\) => host\.retry\(\)\)/);
  assert.match(hook, /withTryOnDiagnostic\(\(\) => manual\.loadGarmentSource\(garmentId\)\)/);
  assert.match(hook, /withTryOnDiagnostic\(\(\) => manual\.saveContour\(value\)\)/);
  assert.match(hook, /withTryOnDiagnostic\(\(\) => manual\.saveBodyAnchors\(value\)\)/);
  assert.doesNotMatch(hook, /error\.data|\.data\?\./);
});

test('wrapped contour reload status uses the safe manual diagnostic projection', async () => {
  const component = await readFile('src/components/editor/outfits/CanonicalTryOnContourEditor.jsx', 'utf8');
  const sentinel = component.indexOf("cause?.code === 'TRYON_MANUAL_CONTOUR_SAVED_RELOAD_PENDING'");
  const projected = component.indexOf('setStatus(manualAcquisitionErrorMessage(cause))', sentinel);
  assert.ok(sentinel >= 0 && projected > sentinel);
});

test('Core transport and client retain one bounded correlation ID for support projection', async () => {
  const [client, product, readiness, contour, anchors] = await Promise.all([
    readFile('src/api/coreClient.js', 'utf8'),
    readFile('server/core/http/fashionTryOnProductHttpAdapter.ts', 'utf8'),
    readFile('server/core/http/fashionTryOnReadinessHttpAdapter.ts', 'utf8'),
    readFile('server/core/http/manualParametricGarmentAdmissionHttpAdapter.ts', 'utf8'),
    readFile('server/core/http/manualProjectBodyAnchorHttpAdapter.ts', 'utf8'),
  ]);

  assert.match(client, /error\.correlationId = data\?\.correlationId/);
  for (const adapter of [product, readiness, contour, anchors]) {
    assert.match(adapter, /'x-correlation-id'\)\?\.slice\(0, 128\)/);
    assert.match(adapter, /correlationId/);
  }
});

test('support projection itself cannot gain canonical evidence authority', async () => {
  const source = await readFile('src/application/fashion/canonicalTryOnSupportDiagnostic.js', 'utf8');
  for (const forbidden of [
    'storageId', 'contentSha256', 'representationId', 'anchorSetId',
    'destinationMesh', 'ticketId', 'clientRequestId', 'Billing', 'credits',
  ]) assert.equal(source.includes(forbidden), false, forbidden);
  assert.match(source, /Product UI must never inspect or render that bag/);
});
