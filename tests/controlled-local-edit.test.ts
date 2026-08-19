import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRoi, compositePatch, createOriginalMask, displayToOriginal, executeControlledLocalEdit, verifyControlledEdit, type PixelImage } from '../src/platform/creative/pipeline/ControlledLocalEdit.ts';
import { ArtifactRouter } from '../src/platform/creative/workflow-engine/ArtifactRouter.ts';

const image = (width: number, height: number, pixel = [10, 20, 30, 128]): PixelImage => ({ width, height, data: new Uint8ClampedArray(width * height * 4).map((_, i) => pixel[i % 4]), format: 'raw', orientation: 1 });
const mask = (width: number, height: number, points: readonly [number, number, number][]) => { const alpha = new Uint8Array(width * height); points.forEach(([x, y, value]) => alpha[y * width + x] = value); return createOriginalMask({ artifactId: 'mask', width, height, source: 'USER', alpha }); };

test('artifact authority never overwrites an immutable original id', () => { const router = new ArtifactRouter(), scope = { tenantId: 't', projectId: 'p', userId: 'u' }; router.put({ id: 'original', kind: 'image', value: 'bytes-a', producerStepId: 'upload', scope, metadata: { artifactRole: 'ORIGINAL' } }); assert.throws(() => router.put({ id: 'original', kind: 'image', value: 'bytes-b', producerStepId: 'edit', scope }), /immutable/); assert.equal(router.get('original', scope)?.value, 'bytes-a'); });

test('coordinate transform maps a 300x200 preview exactly onto 6000x4000 original', () => assert.deepEqual(displayToOriginal({ x: 150, y: 100 }, { displayWidth: 600, displayHeight: 400, devicePixelRatio: 2, originalWidth: 6000, originalHeight: 4000 }), { x: 3000, y: 2000 }));
test('coordinate transform handles letterbox, zoom and pan', () => assert.deepEqual(displayToOriginal({ x: 210, y: 145 }, { displayWidth: 400, displayHeight: 300, originalWidth: 1000, originalHeight: 500, zoom: 2, panX: 10, panY: -5 }), { x: 500, y: 250 }));

test('ROI clamps central, edge and corner masks and adds context halo', () => {
  assert.deepEqual(buildRoi(mask(10, 10, [[5, 5, 255]]), { width: 10, height: 10 }, { preserveMode: 'STRICT', haloPixels: 2 }).bounds, { x: 3, y: 3, width: 5, height: 5 });
  assert.deepEqual(buildRoi(mask(10, 10, [[0, 0, 255]]), { width: 10, height: 10 }, { preserveMode: 'STRICT', haloPixels: 3 }).bounds, { x: 0, y: 0, width: 4, height: 4 });
  assert.deepEqual(buildRoi(mask(10, 10, [[9, 9, 255]]), { width: 10, height: 10 }, { preserveMode: 'STRICT', haloPixels: 3 }).bounds, { x: 6, y: 6, width: 4, height: 4 });
});
test('ROI supports 1-pixel, full-image masks, ratio halo and minimum provider resolution', () => {
  const tiny = buildRoi(mask(10, 10, [[4, 4, 255]]), { width: 10, height: 10 }, { preserveMode: 'STRICT', minimumProviderSize: 512 }); assert.deepEqual([tiny.transform.providerWidth, tiny.transform.providerHeight], [512, 512]);
  const alpha = new Uint8Array(100).fill(255), full = createOriginalMask({ artifactId: 'full', width: 10, height: 10, source: 'SEGMENTATION', alpha }); assert.deepEqual(buildRoi(full, { width: 10, height: 10 }, { preserveMode: 'STRICT', haloRatio: .25 }).bounds, { x: 0, y: 0, width: 10, height: 10 });
});
test('empty, malformed, mismatched and dishonest masks are rejected', () => {
  assert.throws(() => createOriginalMask({ artifactId: 'x', width: 2, height: 2, source: 'USER', alpha: new Uint8Array(4) }), /empty/);
  assert.throws(() => createOriginalMask({ artifactId: 'x', width: 2, height: 2, source: 'USER', alpha: new Uint8Array(3) }), /Malformed/);
  assert.throws(() => buildRoi(mask(2, 2, [[0, 0, 255]]), { width: 3, height: 2 }, { preserveMode: 'STRICT' }), /mismatch/);
  assert.throws(() => createOriginalMask({ artifactId: 'x', width: 2, height: 2, source: 'USER', alpha: new Uint8Array([255, 0, 0, 0]), bounds: { x: 1, y: 1, width: 1, height: 1 } }), /bounds/);
});

test('lossless compositor preserves every protected pixel against malicious patch', () => {
  const original = image(3, 3), editMask = mask(3, 3, [[1, 1, 255]]), roi = buildRoi(editMask, original, { preserveMode: 'STRICT', haloPixels: 1 }); const malicious = image(3, 3, [255, 255, 255, 255]); const result = compositePatch(original, malicious, editMask, roi.transform);
  for (let i = 0; i < 9; i++) assert.deepEqual(Array.from(result.data.slice(i * 4, i * 4 + 4)), i === 4 ? [255, 255, 255, 255] : [10, 20, 30, 128]);
});
test('alpha feather band blends RGBA using mask alpha', () => { const original = image(1, 1, [0, 0, 0, 0]), patch = image(1, 1, [200, 100, 50, 200]), editMask = mask(1, 1, [[0, 0, 128]]), roi = buildRoi(editMask, original, { preserveMode: 'STRICT' }); assert.deepEqual(Array.from(compositePatch(original, patch, editMask, roi.transform).data), [100, 50, 25, 100]); });
test('strict verifier fails injected outside delta and detects an artificial boundary seam', () => {
  const original = image(3, 1), editMask = mask(3, 1, [[1, 0, 128]]), changed = image(3, 1); changed.data[0] = 255; let result = verifyControlledEdit(original, changed, editMask, { preserveMode: 'STRICT' }); assert.equal(result.valid, false); assert.ok(result.metrics.outsideChangedPixelRatio > 0);
  const seam = image(3, 1); seam.data.set([255, 255, 255, 255], 4); result = verifyControlledEdit(original, seam, editMask, { preserveMode: 'STRICT', outsideChangedPixelRatioLimit: 1, boundaryMeanDeltaLimit: .1 }); assert.equal(result.valid, false); assert.ok(result.metrics.boundaryDelta > .1);
});
test('controlled capability keeps full resolution, treats output as patch and emits safe telemetry', async () => {
  const original = image(6000, 4000), editMask = mask(6000, 4000, [[3000, 2000, 255]]); const result = await executeControlledLocalEdit({ executionId: 'exec', original, mask: editMask, maskArtifactId: 'mask', instruction: 'red pixel', policy: { preserveMode: 'STRICT', haloPixels: 1, minimumProviderSize: 8 }, provider: async request => image(request.roi.width, request.roi.height, [255, 0, 0, 255]) });
  assert.equal(result.candidatePatch.role, 'PATCH'); assert.equal(result.candidatePatch.sourceExecutionId, 'exec'); assert.equal(result.candidatePatch.maskArtifactId, 'mask'); assert.equal(result.composite.role, 'COMPOSITE'); assert.deepEqual([result.composite.image.width, result.composite.image.height], [6000, 4000]); assert.equal(result.verification.valid, true); assert.equal(result.metrics.verificationOutcome, 'PASS'); assert.ok(result.metrics.pixelReductionRatio > .99); assert.equal('data' in result.metrics, false);
});

await import('./canonical-controlled-edit.integration.test.ts');
