import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanonicalTryOnApplication } from '../src/application/fashion/canonicalTryOnApplication.js';

const intent = Object.freeze({
  projectId: '11111111-1111-4111-8111-111111111111',
  sourceArtifactId: 'stored-final-source',
  garmentId: '22222222-2222-4222-8222-222222222222',
  clientRequestId: 'fashion-tryon:33333333-3333-4333-8333-333333333333',
});

const noop = async () => { throw new Error('unexpected execution'); };

test('recovery refuses FINAL_READY when the preview endpoint did not mint a delivery capability', async () => {
  const core = Object.freeze({
    checkTryOnReadiness: noop,
    prepareTryOn: noop,
    continueTryOn: noop,
    getTryOnResult: noop,
    getTryOnPreview: async () => ({
      status: 'FINAL_READY',
      projectId: intent.projectId,
      sourceArtifactId: intent.sourceArtifactId,
      garmentId: intent.garmentId,
      artifactId: 'canonical-final',
    }),
  });
  const app = createCanonicalTryOnApplication({ core, executeWarp: noop, executeTexture: noop });
  await assert.rejects(
    () => app.recover(intent),
    /preview endpoint returned FINAL_READY without preview delivery/,
  );
});
