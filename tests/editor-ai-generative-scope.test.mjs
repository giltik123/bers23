import test from 'node:test';
import assert from 'node:assert/strict';
import { bindGenerativeScope } from '../src/application/editor/ai-first/bindGenerativeScope.js';

const base = {
  instruction: 'Замени небо на закат, не меняй человека',
  mode: 'MASKED', projectId: 'project-1', expectedProjectId: 'project-1', sourceArtifactId: 'source-1',
  expectedSourceArtifactId: 'source-1', expectedSelectedObjectId: 'object-1', expectedMaskArtifactId: 'mask-1',
  objects: [{ id: 'object-1', selected: true, mask_artifact_id: 'mask-1' }],
};

test('masked edit binds the exact selected Core object, source and mask', () => {
  const result = bindGenerativeScope(base);
  assert.equal(result.scope, 'MASKED');
  assert.deepEqual(result.selectedObjectIds, ['object-1']);
  assert.deepEqual(result.maskArtifactIds, ['mask-1']);
  assert.equal(result.sourceArtifactId, 'source-1');
  assert(Object.isFrozen(result.maskArtifactIds));
});

test('changing project invalidates a previously confirmed generation even with the same photo', () => {
  assert.throws(() => bindGenerativeScope({ ...base, projectId: 'project-2' }), /Проект изменился/);
});

test('changing selected object with the same mask invalidates confirmed generation', () => {
  assert.throws(() => bindGenerativeScope({
    ...base, objects: [{ id: 'object-2', selected: true, mask_artifact_id: 'mask-1' }],
  }), /Выбран другой объект/);
});

test('whole-frame requests may not silently inherit a confirmed selected-object identity', () => {
  assert.throws(() => bindGenerativeScope({
    ...base, mode: 'WHOLE_IMAGE', expectedMaskArtifactId: null,
    instruction: 'Измени цвета всего кадра',
  }), /не должна подтверждаться/);
});

test('stale source is rejected even with matching mask', () => {
  assert.throws(() => bindGenerativeScope({ ...base, sourceArtifactId: 'source-2' }), /фотография изменилась/);
});

test('stale mask is rejected even if the selected object has another valid mask', () => {
  assert.throws(() => bindGenerativeScope({ ...base, objects: [{id:'object-1', selected:true, mask_artifact_id:'mask-new'}] }), /Маска изменилась/);
});

test('missing, unselected or multiple masks fail closed', () => {
  for (const objects of [[], [{id:'object-1', selected:false, mask_artifact_id:'mask-1'}], [
    {id:'object-1', selected:true, mask_artifact_id:'mask-1'},
    {id:'object-2', selected:true, mask_artifact_id:'mask-2'},
  ], [{id:'object-1', selected:true, mask_artifact_id:null}]]) {
    assert.throws(() => bindGenerativeScope({...base,objects}));
  }
});

test('cannot silently convert a masked edit into whole-image generation', () => {
  assert.throws(() => bindGenerativeScope({...base,mode:'WHOLE_IMAGE'}), /не должна подтверждаться/);
});

test('whole-image mode requires explicit scope and rejects protected-object instruction', () => {
  assert.throws(() => bindGenerativeScope({...base,mode:'WHOLE_IMAGE',expectedSelectedObjectId:null,expectedMaskArtifactId:null}), /Выберите маску/);
  assert.throws(() => bindGenerativeScope({...base,mode:'WHOLE_IMAGE',expectedSelectedObjectId:null,expectedMaskArtifactId:null,instruction:'Change the background, preserve face'}), /Выберите маску/);
});

test('explicit full-image requests have empty object and mask lists', () => {
  const result = bindGenerativeScope({...base,mode:'WHOLE_IMAGE',expectedSelectedObjectId:null,expectedMaskArtifactId:null,instruction:'Сделай всю фотографию чёрно-белой'});
  assert.deepEqual(result.selectedObjectIds, []);
  assert.deepEqual(result.maskArtifactIds, []);
});

test('unknown scope, malformed artifact IDs and missing instructions fail', () => {
  assert.throws(() => bindGenerativeScope({...base, mode:'AUTO'}), /Неизвестный/);
  assert.throws(() => bindGenerativeScope({...base, projectId:' '}), /недоступны/);
  assert.throws(() => bindGenerativeScope({...base, instruction:''}), /отсутствует/);
  assert.throws(() => bindGenerativeScope({...base, expectedMaskArtifactId:'bad-mask'}), /Маска изменилась/);
});

test('whole-image requests cannot drop Russian non-change constraints', () => {
  assert.throws(() => bindGenerativeScope({
    ...base, mode: 'WHOLE_IMAGE', expectedSelectedObjectId: null, expectedMaskArtifactId: null,
    instruction: 'Сгенерируй портрет, не меняя лицо',
  }), /Выберите маску/);
});

test('AI Studio generation and retry preserve exact mask and source across UI wiring', async () => {
  const { readFile } = await import('node:fs/promises');
  const [editor, studio, compare] = await Promise.all([
    readFile('src/pages/Editor.jsx', 'utf8'),
    readFile('src/components/editor/ai/AICommandStudio.jsx', 'utf8'),
    readFile('src/components/editor/ResultCompare.jsx', 'utf8'),
  ]);
  assert.match(editor, /bindGenerativeScope\(/);
  assert.match(editor, /inputArtifactId: guardedScope\?\.sourceArtifactId/);
  assert.match(editor, /maskArtifactIds: guardedScope\s*\? guardedScope\.maskArtifactIds/);
  assert.match(editor, /aiScope: pending\.context\.aiScope/);
  assert.match(editor, /instructionOverride: pending\.instruction/);
  assert.match(studio, /expectedSourceArtifactId:project\.current_image_artifact_id/);
  assert.match(studio, /expectedProjectId:project\.id/);
  assert.match(studio, /expectedSelectedObjectId:generativeScope==='MASKED'\?selectedObject\?\.id:null/);
  assert.match(studio, /generativeScope==='MASKED'&&\(!maskId\|\|!maskConfirmed\)/);
  assert.match(compare, /scopedGeneration && !scopedReview/);
});
