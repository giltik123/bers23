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
      const size = input.analysis.analysisWidth * input.analysis.analysisHeight;
      const alpha = Uint8Array.from({ length: size }, (_value, index) => index % 2 === 0 ? 255 : 0);
      return {
        target: 'LOCAL' as const,
        modelId: 'fixture-segmenter',
        modelVersion: '1',
        latencyMs: 1,
        canonicalArtifactId: 'core-admitted-mask',
        candidates: [{
          alpha,
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


test('grow and shrink persist new canonical MASK bytes with exact parent lineage and morphology source', async () => {
  {
    const { service, persisted, admitted } = fixture();
    await smart(service, 'canonical-source');
    service.grow(1);
    const result = await service.done();
    assert.equal(result.id, 'persisted-1');
    assert.equal(admitted.length, 0);
    assert.equal(persisted[0].metadata.sourceImageArtifactId, 'canonical-source');
    assert.equal(persisted[0].metadata.parentMaskArtifactId, 'core-admitted-mask');
    assert.equal(persisted[0].mask.source, 'OPERATION_EXPANDED');
    assert.equal(persisted[0].metadata.provenance.at(-1), 'OPERATION_EXPANDED');
  }
  {
    const { service, persisted, admitted } = fixture();
    await smart(service, 'canonical-source');
    service.grow(1);
    service.shrink(1);
    const result = await service.done();
    assert.equal(result.id, 'persisted-1');
    assert.equal(admitted.length, 0);
    assert.equal(persisted[0].metadata.sourceImageArtifactId, 'canonical-source');
    assert.equal(persisted[0].metadata.parentMaskArtifactId, 'core-admitted-mask');
    assert.equal(persisted[0].mask.source, 'OPERATION_CONTRACTED');
    assert.equal(persisted[0].metadata.provenance.at(-1), 'OPERATION_CONTRACTED');
  }
});


test('feather persists refined canonical MASK bytes with exact parent lineage', async () => {
  const { service, persisted, admitted, segmentationCalls } = fixture();
  await smart(service, 'canonical-source');
  service.feather(2);
  const result = await service.done();
  assert.equal(result.id, 'persisted-1');
  assert.equal(admitted.length, 0);
  assert.equal(segmentationCalls(), 1);
  assert.equal(persisted[0].metadata.sourceImageArtifactId, 'canonical-source');
  assert.equal(persisted[0].metadata.parentMaskArtifactId, 'core-admitted-mask');
  assert.equal(persisted[0].mask.source, 'OPERATION_FEATHERED');
  assert.equal(persisted[0].metadata.provenance.at(-1), 'OPERATION_FEATHERED');
});


test('polygon refinement preserves canonical source and admitted parent MASK lineage', async () => {
  const { service, persisted, admitted } = fixture();
  await smart(service, 'canonical-source');
  service.setMode('POLYGON');
  for (const point of [{x:1,y:1},{x:6,y:1},{x:6,y:6},{x:1,y:6}]) {
    service.polygonVertex({ displayPoint: point, view });
  }
  service.applyPolygon('ADD');
  const result = await service.done();
  assert.equal(result.id, 'persisted-1');
  assert.equal(admitted.length, 0);
  assert.equal(persisted[0].metadata.sourceImageArtifactId, 'canonical-source');
  assert.equal(persisted[0].metadata.parentMaskArtifactId, 'core-admitted-mask');
  assert.equal(persisted[0].mask.source, 'POLYGON_ADD');
  assert.equal(persisted[0].metadata.provenance.at(-1), 'POLYGON_ADD');
});


test('lasso refinement preserves canonical source and admitted parent MASK lineage', async () => {
  const { service, persisted, admitted } = fixture();
  await smart(service, 'canonical-source');
  service.setMode('LASSO');
  service.lassoStart({ displayPoint: { x: 1, y: 1 }, view });
  service.lassoVertex({ displayPoint: { x: 6, y: 1 }, view });
  service.lassoVertex({ displayPoint: { x: 6, y: 6 }, view });
  service.lassoVertex({ displayPoint: { x: 1, y: 6 }, view }, true);
  service.applyLasso('ADD');
  const result = await service.done();
  assert.equal(result.id, 'persisted-1');
  assert.equal(admitted.length, 0);
  assert.equal(persisted[0].metadata.sourceImageArtifactId, 'canonical-source');
  assert.equal(persisted[0].metadata.parentMaskArtifactId, 'core-admitted-mask');
  assert.equal(persisted[0].mask.source, 'LASSO_ADD');
  assert.equal(persisted[0].metadata.provenance.at(-1), 'LASSO_ADD');
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
