import test from 'node:test';
import assert from 'node:assert/strict';
import { createTryOnEditorFinalHandoff } from '../src/application/fashion/createTryOnEditorFinalHandoff.js';

const SOURCE = 'source-artifact';
const GARMENT = 'aaaaaaaa-1111-4111-8111-111111111111';
const BEFORE = '/api/core/artifacts/results/before.token';

function pixel() {
  return Object.freeze({
    width: 1,
    height: 1,
    data: new Uint8ClampedArray([10, 20, 30, 255]),
    format: 'RGBA8',
    orientation: 1,
    colorSpace: 'srgb',
  });
}

function localFinal(extra = {}) {
  return Object.freeze({ status: 'FINAL_READY', artifactId: 'canonical-final', preview: pixel(), ...extra });
}

function recoveryFinal(extra = {}) {
  return Object.freeze({
    status: 'FINAL_READY',
    artifactId: 'canonical-final',
    preview: '/api/core/artifacts/results/preview.token',
    previewExpiresAt: 123456,
    ...extra,
  });
}

test('local FINAL becomes an Editor-owned zero-credit pending result without execution identities', async () => {
  const calls = [];
  const handoff = createTryOnEditorFinalHandoff({
    encodePreviewPng: async (preview) => {
      calls.push(['encode', preview]);
      return new Uint8Array([137, 80, 78, 71]);
    },
    createBlobUrl: async (bytes) => {
      calls.push(['blob', [...bytes]]);
      return 'blob:tryon-preview';
    },
  });

  const result = await handoff({
    final: localFinal(),
    garmentId: GARMENT.toUpperCase(),
    sourceArtifactId: `  ${SOURCE}  `,
    beforeUrl: BEFORE,
  });

  assert.equal(result.kind, 'FASHION_TRYON');
  assert.deepEqual(result.result, {
    finalArtifactId: 'canonical-final',
    preview_url: 'blob:tryon-preview',
    image_url: 'blob:tryon-preview',
    provider: 'Local deterministic',
    credits_used: 0,
  });
  assert.deepEqual(result.context, { garmentId: GARMENT, sourceArtifactId: SOURCE });
  assert.equal(result.instruction, 'Try on garment');
  assert.equal(result.beforeUrl, BEFORE);
  assert.equal(calls[0][0], 'encode');
  assert.deepEqual(calls[1], ['blob', [137, 80, 78, 71]]);
  assert.equal(JSON.stringify(result).includes('clientRequestId'), false);
  assert.equal(JSON.stringify(result).includes('ticketId'), false);
  assert.equal(JSON.stringify(result).includes('representationId'), false);
  assert.equal(JSON.stringify(result).includes('anchorSetId'), false);
});

test('recovered FINAL keeps only the accepted short-lived Core preview capability', async () => {
  let encoded = 0;
  let blobbed = 0;
  const handoff = createTryOnEditorFinalHandoff({
    encodePreviewPng: async () => { encoded += 1; return new Uint8Array([1]); },
    createBlobUrl: async () => { blobbed += 1; return 'blob:unexpected'; },
  });

  const result = await handoff({
    final: recoveryFinal(),
    garmentId: GARMENT,
    sourceArtifactId: SOURCE,
    beforeUrl: BEFORE,
  });

  assert.equal(result.result.preview_url, '/api/core/artifacts/results/preview.token');
  assert.equal(result.result.finalArtifactId, 'canonical-final');
  assert.equal(encoded, 0);
  assert.equal(blobbed, 0);
});

test('handoff fails closed on malformed stable intent and authority-shaped top-level fields', async () => {
  const handoff = createTryOnEditorFinalHandoff({
    encodePreviewPng: async () => new Uint8Array([1]),
    createBlobUrl: async () => 'blob:ok',
  });
  const base = { garmentId: GARMENT, sourceArtifactId: SOURCE, beforeUrl: BEFORE, final: localFinal() };

  await assert.rejects(() => handoff({ ...base, garmentId: 'not-a-uuid' }), /garmentId must be a UUID/);
  await assert.rejects(() => handoff({ ...base, sourceArtifactId: 'x'.repeat(513) }), /outside the accepted Try-On contract/);
  await assert.rejects(() => handoff({ ...base, clientRequestId: 'forbidden' }), /unknown or missing fields/);
});

test('handoff fails closed on missing preview, arbitrary URLs, malformed pixels and authority-shaped FINAL fields', async () => {
  const handoff = createTryOnEditorFinalHandoff({
    encodePreviewPng: async () => new Uint8Array([1]),
    createBlobUrl: async () => 'blob:ok',
  });
  const base = { garmentId: GARMENT, sourceArtifactId: SOURCE, beforeUrl: BEFORE };

  await assert.rejects(() => handoff({ ...base, final: { status: 'FINAL_READY', artifactId: 'x' } }), /unknown or missing fields/);
  await assert.rejects(() => handoff({ ...base, final: recoveryFinal({ preview: 'https://example.test/final.png' }) }), /outside the accepted Editor delivery contract/);
  await assert.rejects(() => handoff({ ...base, final: { ...localFinal(), ticketId: 'forbidden' } }), /unknown or missing fields/);
  await assert.rejects(() => handoff({ ...base, final: { ...localFinal(), preview: { ...pixel(), data: new Uint8ClampedArray(3) } } }), /RGBA bytes are invalid/);
});

test('handoff rejects PixelImage byte-count arithmetic outside safe integer range before encoder', async () => {
  const handoff = createTryOnEditorFinalHandoff({
    encodePreviewPng: async () => { throw new Error('encoder must not run'); },
    createBlobUrl: async () => { throw new Error('blob factory must not run'); },
  });
  const huge = {
    width: Number.MAX_SAFE_INTEGER,
    height: 2,
    data: new Uint8ClampedArray(0),
    format: 'RGBA8',
    orientation: 1,
    colorSpace: 'srgb',
  };
  await assert.rejects(
    () => handoff({ final: localFinal({ preview: huge }), garmentId: GARMENT, sourceArtifactId: SOURCE, beforeUrl: BEFORE }),
    /RGBA bytes are invalid/,
  );
});

test('local preview rejects invalid encoder bytes and non-owned URL output', async () => {
  const base = { final: localFinal(), garmentId: GARMENT, sourceArtifactId: SOURCE, beforeUrl: BEFORE };
  await assert.rejects(
    () => createTryOnEditorFinalHandoff({ encodePreviewPng: async () => new Uint8Array(), createBlobUrl: async () => 'blob:x' })(base),
    /invalid PNG bytes/,
  );
  await assert.rejects(
    () => createTryOnEditorFinalHandoff({ encodePreviewPng: async () => new Uint8Array([1]), createBlobUrl: async () => '/not-owned' })(base),
    /Editor-owned blob URL/,
  );
});
