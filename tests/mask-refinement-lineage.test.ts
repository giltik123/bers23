import assert from 'node:assert/strict';
import test from 'node:test';
import { SelectionApplicationService } from '../src/application/selection/SelectionApplicationService.ts';
import type { InteractiveSegmentationPort } from '../src/application/selection/contracts.ts';

const view = Object.freeze({ displayWidth: 8, displayHeight: 8, originalWidth: 8, originalHeight: 8 });

function fixture() {
  let segmentationCalls = 0;
  const persisted: Array<{ mask: any; metadata: any }> = [];
  const admitted: Array<{ artifactId: string; metadata: any }> = [];
  const segmentation: InteractiveSegmentationPort = {
    cancel() {},
    async segment(input) {
      segmentationCalls++;
      return {
        target: 'LOCAL' as const,
        modelId: 'fixture-segmenter',
        modelVersion: '1',
        latencyMs: 1,
        canonicalArtifactId: 'core-admitted-mask',
        candidates: [{
          alpha: new Uint8Array(input.analysis.analysisWidth * input.analysis.analysisHeight).fill(255),
          width: input.analysis.analysisWidth,
          height: input.analysis.analysisHeight,
          coordinateSpace: 'ANALYSIS' as const,
          score: .95,
        }],
      };
    },
  };
  const artifacts: any = {
    async persist(mask: any, metadata: any) {
      persisted.push({ mask, metadata });
      return { id: `persisted-${persisted.length}`, kind: 'mask', role: 'MASK', state: 'AVAILABLE', producerOperationId: 'selection-confirm', value: mask, metadata };
    },
    admitted(artifactId: string, mask: any, metadata: any) {
      admitted.push({ artifactId, metadata });
      return { id: artifactId, kind: 'mask', role: 'MASK', state: 'AVAILABLE', producerOperationId: 'interactive-segmentation', value: mask, metadata };
    },
  };
  return { service: new SelectionApplicationService(segmentation, artifacts), persisted, admitted, segmentationCalls: () => segmentationCalls };
}

async function smart(service: SelectionApplicationService, imageArtifactId = 'source-image') {
  service.start({ imageArtifactId, width: 8, height: 8 });
  await service.smartPoint({ displayPoint: { x: 2, y: 2 }, view, privacyMode: 'LOCAL_ONLY' });
}

test('unchanged Core-admitted smart MASK is reused without duplicate manual persistence', async () => {
  const { service, persisted, admitted } = fixture();
  await smart(service, 'canonical-source');
  const result = await service.done();
  assert.equal(result.id, 'core-admitted-mask');
  assert.equal(persisted.length, 0);
  assert.equal(admitted.length, 1);
  assert.equal(admitted[0].metadata.sourceImageArtifactId, 'canonical-source');
  assert.equal(admitted[0].metadata.parentMaskArtifactId, 'core-admitted-mask');
});

test('manual brush refinement invalidates output identity but retains exact source and admitted parent lineage', async () => {
  const { service, persisted } = fixture();
  await smart(service, 'canonical-source');
  service.setMode('BRUSH_SUBTRACT');
  service.brush({ points: [{ x: 2, y: 2 }], radius: 1, hardness: 1, view });
  const result = await service.done();
  assert.equal(result.id, 'persisted-1');
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].metadata.sourceImageArtifactId, 'canonical-source');
  assert.equal(persisted[0].metadata.parentMaskArtifactId, 'core-admitted-mask');
});

test('invert, undo and redo keep the refinement parent while never restoring client output authority', async () => {
  for (const mutate of [
    (service: SelectionApplicationService) => service.invert(),
    (service: SelectionApplicationService) => { service.setMode('BRUSH_SUBTRACT'); service.brush({ points: [{ x: 2, y: 2 }], radius: 1, hardness: 1, view }); service.undo(); },
    (service: SelectionApplicationService) => { service.setMode('BRUSH_SUBTRACT'); service.brush({ points: [{ x: 2, y: 2 }], radius: 1, hardness: 1, view }); service.undo(); service.redo(); },
  ]) {
    const { service, persisted, admitted } = fixture();
    await smart(service, 'canonical-source');
    mutate(service);
    const result = await service.done();
    assert.equal(result.id, 'persisted-1');
    assert.equal(admitted.length, 0);
    assert.equal(persisted[0].metadata.sourceImageArtifactId, 'canonical-source');
    assert.equal(persisted[0].metadata.parentMaskArtifactId, 'core-admitted-mask');
  }
});

test('manual-only selection has source-image lineage, no parent MASK, and performs zero inference calls', async () => {
  const { service, persisted, segmentationCalls } = fixture();
  service.start({ imageArtifactId: 'manual-source', width: 8, height: 8 });
  service.setMode('BRUSH_ADD');
  service.brush({ points: [{ x: 4, y: 4 }], radius: 2, hardness: 1, view });
  const result = await service.done();
  assert.equal(result.id, 'persisted-1');
  assert.equal(segmentationCalls(), 0);
  assert.equal(persisted[0].metadata.sourceImageArtifactId, 'manual-source');
  assert.equal(persisted[0].metadata.parentMaskArtifactId, undefined);
});
