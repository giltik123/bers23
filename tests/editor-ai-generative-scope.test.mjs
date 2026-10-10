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

test('real canonical HMAC-signed image and MASK references exceed 256 chars and remain selectable', async () => {
  const { createHmac } = await import('node:crypto');
  const id = '11111111-1111-4111-8111-111111111111';
  // Matches SignedArtifactAuthority sign() envelope shape. The test verifies
  // frontend length compatibility, not authenticity or scope admission.
  const signed = (location, role, lifecycle) => {
    const body = Buffer.from(JSON.stringify({
      v: 1, location, storageId: id, tenantId: id, userId: id,
      projectId: id, role, ...(lifecycle ? { lifecycle } : {}),
    })).toString('base64url');
    return body + '.' + createHmac('sha256', 'test-secret')
      .update(body).digest('base64url');
  };
  const original = signed('STORED_ORIGINAL_ID', 'ORIGINAL', 'IMMUTABLE');
  const mask = signed('STORED_MASK', 'MASK');
  assert.ok(original.length > 256);
  assert.ok(mask.length > 256);
  const command = {
    ...base, projectId: id, expectedProjectId: id,
    sourceArtifactId: original, expectedSourceArtifactId: original,
    expectedMaskArtifactId: mask,
    objects: [{ id: 'object-1', selected: true, mask_artifact_id: mask }],
  };
  assert.deepEqual(bindGenerativeScope(command).maskArtifactIds, [mask]);
  assert.deepEqual(bindGenerativeScope(command).selectedObjectIds, ['object-1']);
  assert.throws(
    () => bindGenerativeScope({ ...command, sourceArtifactId: original + 'x' }),
    /фотография изменилась/,
  );
  assert.throws(
    () => bindGenerativeScope({ ...command, expectedMaskArtifactId: 'x'.repeat(4097) }),
    /Маска изменилась/,
  );
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
