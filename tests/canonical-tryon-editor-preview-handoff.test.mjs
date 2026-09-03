import assert from 'node:assert/strict';
import test from 'node:test';
import { materializeCanonicalTryOnEditorPendingResult } from '../src/application/fashion/materializeCanonicalTryOnEditorPendingResult.js';

const GARMENT = '22222222-2222-4222-8222-222222222222';
const SOURCE = 'stored-final-source';
const BEFORE = '/api/core/artifacts/results/before_token.signature_token';
const RECOVERY = '/api/core/artifacts/results/preview_token.signature_token';

function localPreview() {
  return {
    width: 1,
    height: 1,
    data: new Uint8ClampedArray([1, 2, 3, 255]),
    format: 'RGBA8',
    orientation: 1,
    colorSpace: 'srgb',
  };
}

function base(result) {
  return {
    result,
    beforeUrl: BEFORE,
    garmentId: GARMENT,
    sourceArtifactId: SOURCE,
    garmentLabel: 'Black jacket',
  };
}

test('local FINAL materializes PixelImage once and returns only the existing Editor pending-result authority shape', async () => {
  const calls = [];
  const pending = await materializeCanonicalTryOnEditorPendingResult(
    base({ status: 'FINAL_READY', artifactId: 'canonical-final', preview: localPreview() }),
    {
      encodePng: async (pixels) => {
        calls.push(['encode', pixels]);
        return new Uint8Array([137, 80, 78, 71]);
      },
      createObjectUrl: (bytes) => {
        calls.push(['url', bytes]);
        return 'blob:try-on-preview';
      },
    },
  );

  assert.equal(calls.length, 2);
  assert.equal(pending.kind, 'FASHION_TRY_ON');
  assert.deepEqual(pending.result, {
    finalArtifactId: 'canonical-final',
    preview_url: 'blob:try-on-preview',
    image_url: 'blob:try-on-preview',
    provider: 'Local deterministic Try-On',
    credits_used: 0,
    generation_time_ms: 0,
  });
  assert.equal(pending.instruction, 'Try on Black jacket');
  assert.equal(pending.beforeUrl, BEFORE);
  assert.deepEqual(pending.context, { garmentId: GARMENT, sourceArtifactId: SOURCE });
  assert.equal(Object.hasOwn(pending.context, 'clientRequestId'), false, 'Retry must mint a fresh orchestration identity');
});

test('recovered FINAL preserves the short-lived Core delivery URL and never creates an owned blob URL', async () => {
  let encoded = 0;
  let created = 0;
  const pending = await materializeCanonicalTryOnEditorPendingResult(
    base({ status: 'FINAL_READY', artifactId: 'canonical-final', preview: RECOVERY, previewExpiresAt: 1_900_000_000_000 }),
    {
      encodePng: async () => { encoded += 1; return new Uint8Array([1]); },
      createObjectUrl: () => { created += 1; return 'blob:forbidden'; },
    },
  );
  assert.equal(encoded, 0);
  assert.equal(created, 0);
  assert.equal(pending.result.preview_url, RECOVERY);
  assert.equal(Object.hasOwn(pending.result, 'previewExpiresAt'), false, 'delivery capability metadata must not become Editor durable state');
});

test('handoff fails closed on non-FINAL state, missing preview, foreign recovery URL and malformed PixelImage', async () => {
  await assert.rejects(
    () => materializeCanonicalTryOnEditorPendingResult(base({ status: 'TEXTURE_PENDING' })),
    /FINAL_READY/,
  );
  await assert.rejects(
    () => materializeCanonicalTryOnEditorPendingResult(base({ status: 'FINAL_READY', artifactId: 'canonical-final' })),
    /plain object/,
  );
  await assert.rejects(
    () => materializeCanonicalTryOnEditorPendingResult(base({
      status: 'FINAL_READY', artifactId: 'canonical-final', preview: 'https://example.test/forbidden', previewExpiresAt: 1,
    })),
    /outside the Editor handoff contract/,
  );
  await assert.rejects(
    () => materializeCanonicalTryOnEditorPendingResult(base({
      status: 'FINAL_READY', artifactId: 'canonical-final', preview: { ...localPreview(), storageId: 'forbidden' },
    })),
    /unknown or missing fields/,
  );
});

test('handoff exposes no ticket, transport, provider-selection, billing or Project mutation authority', async () => {
  const pending = await materializeCanonicalTryOnEditorPendingResult(
    base({ status: 'FINAL_READY', artifactId: 'canonical-final', preview: localPreview() }),
    { encodePng: async () => new Uint8Array([1]), createObjectUrl: () => 'blob:preview' },
  );
  const serialized = JSON.stringify(pending);
  for (const forbidden of ['ticketId', 'preparedExecution', 'representationId', 'anchorSetId', 'destinationMesh', 'billing', 'creditsUsed', 'pushEdit', 'persistFinal']) {
    assert.equal(serialized.includes(forbidden), false, `pending handoff must not expose ${forbidden}`);
  }
});
