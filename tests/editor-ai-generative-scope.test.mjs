import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { bindGenerativeScope } from '../src/application/editor/ai-first/bindGenerativeScope.js';
import { interpretPhotoCommand } from '../src/application/editor/ai-first/interpretPhotoCommand.js';

function extractLocaleObject(source, name) {
  const declaration = new RegExp('(?:^|\\n)\\s*' + name + ':\\s*\\{', 'u').exec(source);
  assert.ok(declaration, 'missing locale block: ' + name);
  const open = source.indexOf('{', declaration.index);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = open; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return runInNewContext('(' + source.slice(open, index + 1) + ')');
    }
  }
  throw new Error('unterminated locale block: ' + name);
}

const [englishSource, russianSource] = await Promise.all([
  readFile('src/lib/i18n/locales/en/index.js', 'utf8'),
  readFile('src/lib/i18n/locales/ru/index.js', 'utf8'),
]);
const english = { editorAi: extractLocaleObject(englishSource, 'editorAi') };
const russian = { editorAi: extractLocaleObject(russianSource, 'editorAi') };

const resolveTranslation = (pack, key) =>
  key.split('.').reduce((value, part) => value?.[part], pack);

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
  assert.match(studio, /expectedSelectedObjectId:scope==='MASKED'\?selectedObject\?\.id:null/);
  assert.match(studio, /scope==='MASKED'&&\(!maskId\|\|!maskConfirmed\)/);
  assert.match(studio, /expectedSelectedObjectId: selectedObject\?\.id/);
  assert.match(studio, /expectedMaskArtifactId: maskId/);
  const adjustment = editor.slice(editor.indexOf('const executeAIAdjustment ='), editor.indexOf('const acceptResult ='));
  assert.match(adjustment, /bindGenerativeScope\(/);
  assert.match(adjustment, /mode: 'MASKED'/);
  assert.match(adjustment, /maskArtifactId = adjustedScope\.maskArtifactIds\[0\]/);
  assert.match(compare, /canAcceptReviewedCandidate\(/);
  assert.match(compare, /reviewComplete: scopedGeneration \? scopedReview : allFashionAccepted/);
  assert.match(compare, /const reviewImagesReady = loaded\.before === identity && loaded\.after === identity/);
});


test('AI Command Studio intent explanations and controls resolve in English and Russian', async () => {
  const instructions = [
    '',
    'надень платье',
    'удали фон',
    'замени небо на закат',
    'осветли и сделай теплее',
    'сделай красиво',
    'слегка осветли одежду',
    'сделай теплее',
    'повышай контраст',
    'осветли лицо, не меняй лицо',
  ];
  const plans = instructions.map(interpretPhotoCommand);
  assert.deepEqual(plans.map(plan => plan.kind), [
    'CLARIFY', 'FASHION', 'ADJUSTMENT', 'GENERATIVE', 'CLARIFY',
    'CLARIFY', 'ADJUSTMENT', 'ADJUSTMENT', 'ADJUSTMENT', 'ADJUSTMENT',
  ]);

  for (const plan of plans) {
    assert.ok(plan.explanationKey, 'every interpreted branch exposes a stable explanation key');
    assert.ok(Array.isArray(plan.warningKeys), 'warning keys are locale-neutral metadata');
    for (const pack of [english, russian]) {
      assert.equal(typeof resolveTranslation(pack, plan.explanationKey), 'string');
      for (const key of plan.warningKeys) {
        assert.equal(typeof resolveTranslation(pack, key), 'string');
      }
    }
  }
  assert.deepEqual(plans.at(-1).warningKeys, [
    'editorAi.warnings.preservation',
    'editorAi.warnings.target',
  ]);

  const studio = await readFile('src/components/editor/ai/AICommandStudio.jsx', 'utf8');
  assert.match(studio, /useTranslation/);
  assert.match(studio, /plan\.explanationKey/);
  assert.match(studio, /plan\.warningKeys/);
  assert.doesNotMatch(studio, /\{plan\.explanation\}/);
  assert.doesNotMatch(studio, /plan\.warnings\.map/);
  assert.doesNotMatch(studio, /error\?\.message/);
  assert.doesNotMatch(studio, /[\u0400-\u04FF]/u, 'AI Command Studio must not ship hardcoded Russian-only UI copy');

  const referencedKeys = new Set(
    [...studio.matchAll(/['"](editorAi\.[A-Za-z0-9.]+)['"]/gu)].map(match => match[1]),
  );
  assert.ok(referencedKeys.size >= 25, 'the UI must use the dedicated editorAi locale catalog');
  for (const key of referencedKeys) {
    assert.equal(typeof resolveTranslation(english, key), 'string', 'missing English translation: ' + key);
    assert.equal(typeof resolveTranslation(russian, key), 'string', 'missing Russian translation: ' + key);
  }
});


test('Editor AI Studio handoff exposes safe RU/EN errors and keeps UNKNOWN non-retryable', async () => {
  const editor = await readFile('src/pages/Editor.jsx', 'utf8');
  const keys = [
    'invalidScope', 'planNotReady', 'styleConfirmation', 'busy', 'maskRequired',
    'unsupportedOperation', 'editFailed', 'providerPending',
  ];
  for (const key of keys) {
    const fullKey = `editorAi.errors.${key}`;
    assert.equal(typeof resolveTranslation(english, fullKey), 'string', `English ${fullKey}`);
    assert.equal(typeof resolveTranslation(russian, fullKey), 'string', `Russian ${fullKey}`);
    assert.ok(resolveTranslation(english, fullKey).trim());
    assert.ok(resolveTranslation(russian, fullKey).trim());
    assert.ok(editor.includes(`t('${fullKey}')`), `Editor uses ${fullKey}`);
  }
  assert.match(editor, /result\.status === 'UNKNOWN'[\s\S]*PROVIDER_OUTCOME_PENDING/);
  assert.match(editor, /retryable: false/);
  assert.match(editor, /const safeAiError = e\.code === 'PROVIDER_OUTCOME_PENDING'/);
  assert.match(editor, /if \(instructionOverride\)[\s\S]*throw new Error\(safeAiError\)/);
  assert.doesNotMatch(editor, /AI Studio: выберите допустимый запрос|Core Creative Edit: команда пока не проходит|Смена стиля требует дополнительного подтверждения|Закончите предыдущую операцию до нового AI-запроса|Сначала подтвердите выбранную область с Core-маской|Эта операция ещё не принята BERS Core/);
});
