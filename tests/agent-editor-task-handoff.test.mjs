import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { routeEditorAgentTask } from '../src/application/agent/routeEditorAgentTask.js';

test('Agent text task prepares the exact admitted bounded transform/resize workflow without executing', () => {
  const proposal = routeEditorAgentTask('Поверни фото вправо и затем сделай 1024 на 1024');
  assert.deepEqual(
    { kind: proposal.kind, mode: proposal.mode, width: proposal.width, height: proposal.height },
    { kind: 'LOCAL_WORKFLOW_DRAFT', mode: 'ROTATE_90_CW', width: 1024, height: 1024 },
  );
  assert.match(proposal.message, /Проверьте параметры/);
  assert.ok(Object.isFrozen(proposal));

  const counter = routeEditorAgentTask('Поверни изображение влево и затем сделай 1080 × 1920');
  assert.equal(counter.kind, 'LOCAL_WORKFLOW_DRAFT');
  assert.equal(counter.mode, 'ROTATE_270_CW');
  assert.deepEqual([counter.width, counter.height], [1080, 1920]);
});

test('invalid and destructive text cannot silently trigger actions or mutate Project', () => {
  for (const input of ['', 'a'.repeat(851), 'hello\u0000world', 'сделай 99999 на 99999']) {
    assert.equal(routeEditorAgentTask(input).kind, 'CLARIFY');
  }
  for (const input of ['поверни изображение на 90', 'удали проект', 'отмени', 'resize 200']) {
    assert.equal(routeEditorAgentTask(input).kind, 'CLARIFY');
  }
});

test('generative prompts become editable handoffs, never automatic paid provider calls', () => {
  for (const input of ['Замени фон на закат', 'Сделай мягкий свет на всей фотографии', 'Replace the background with a sunset']) {
    const plan = routeEditorAgentTask(input);
    assert.equal(plan.kind, 'AI_STUDIO_DRAFT');
    assert.equal(plan.instruction, input);
    assert.match(plan.message, /Ничего не отправляется автоматически/);
  }
});

test('garment and wardrobe commands route to Fashion instead of generic generation', () => {
  for (const input of ['Примерь синюю куртку', 'Надень другое платье', 'Покажи гардероб']) {
    assert.equal(routeEditorAgentTask(input).kind, 'FASHION_DRAFT');
  }
});

test('Agent text UI keeps Core execution, confirmation, and canonical boundaries', async () => {
  const [router, panel, editor, runner, parser] = await Promise.all([
    readFile('src/application/agent/routeEditorAgentTask.js', 'utf8'),
    readFile('src/components/editor/agent/AgentPanel.jsx', 'utf8'),
    readFile('src/pages/Editor.jsx', 'utf8'),
    readFile('src/application/agent/createBoundedAgentRunner.ts', 'utf8'),
    readFile('src/lib/agent/requestParser.js', 'utf8'),
  ]);
  assert.doesNotMatch(router, /coreClient|fetch\(|execute\(|startBounded|reserve\(|\.mutate\(/);
  assert.match(panel, /routeEditorAgentTask\(taskText\)/);
  assert.match(panel, /onClick=\{prepareTask\}/);
  assert.match(panel, /onOpenAIStudio\?\.\(taskDraft\.instruction\)/);
  assert.match(panel, /onClick=\{\(\) => invoke\(\(\) => onStart\?\.\(\{ mode, width, height \}\)\)\}/);
  assert.match(editor, /onOpenAIStudio=\{\(agentInstruction\) => \{/);
  assert.match(editor, /setInstruction\(agentInstruction\)/);
  assert.match(editor, /setEditTab\('ai'\)/);
  assert.match(editor, /onOpenFashion=\{\(\) => \{/);
  assert.match(runner, /ticket\.policy !== 'LOCAL_ONLY'/);
  assert.match(parser, /AGENT_INTENT_PARSING_NOT_WIRED/);
});

test('single-step local operations are reviewed in native canonical tools', () => {
  const resize = routeEditorAgentTask('Сделай 1600 на 900');
  assert.deepEqual({ kind: resize.kind, width: resize.width, height: resize.height },
    { kind: 'RESIZE_DRAFT', width: 1600, height: 900 });
  assert.match(resize.message, /отдельно запустите предпросмотр/);

  const rotate = routeEditorAgentTask('Поверни фото на 90 градусов вправо');
  assert.deepEqual({ kind: rotate.kind, mode: rotate.mode },
    { kind: 'TRANSFORM_DRAFT', mode: 'ROTATE_90_CW' });
  const flip = routeEditorAgentTask('Отрази фото по горизонтали');
  assert.deepEqual({ kind: flip.kind, mode: flip.mode },
    { kind: 'TRANSFORM_DRAFT', mode: 'FLIP_HORIZONTAL' });
  assert.match(rotate.message, /сохранение требует Accept/);
});

test('agent can draft strictly recognized compound rotations or flips and exact resize', () => {
  for (const [text, expectedMode, width, height] of [
    ['Поверни фото на 180 и затем сделай 1024x768', 'ROTATE_180', 1024, 768],
    ['Отрази фото по горизонтали и затем сделай 1200 на 800', 'FLIP_HORIZONTAL', 1200, 800],
    ['Поверни фотографию влево и затем сделай 1080 × 1920', 'ROTATE_270_CW', 1080, 1920],
  ]) {
    const draft = routeEditorAgentTask(text);
    assert.deepEqual(
      {kind: draft.kind, mode: draft.mode, width: draft.width, height: draft.height},
      {kind: 'LOCAL_WORKFLOW_DRAFT', mode: expectedMode, width, height},
    );
  }
});

test('malformed geometric goals and over-limit geometries fail closed, never cloud-route', () => {
  for (const input of [
    'Поверни фото на 180 и затем сделай 16384 на 16384',
    'Отрази фото по вертикали и затем сделай 0 на 0',
    'Поверни фото вправо и затем сделай 10000x10000',
    'поверни фото кое-как и затем сделай 200 на 200',
    'обрежь фотографию',
  ]) {
    assert.equal(routeEditorAgentTask(input).kind, 'CLARIFY', input);
  }
});

test('reviewed single-step Agent controls never execute without a user click', async () => {
  const [panel, editor] = await Promise.all([
    readFile('src/components/editor/agent/AgentPanel.jsx', 'utf8'),
    readFile('src/pages/Editor.jsx', 'utf8'),
  ]);
  assert.match(panel, /taskDraft.kind === 'RESIZE_DRAFT'/);
  assert.match(panel, /taskDraft.kind === 'TRANSFORM_DRAFT'/);
  assert.match(panel, /onOpenResize\?\.\(\{ width: taskDraft.width, height: taskDraft.height \}\)/);
  assert.match(panel, /onPreviewTransform\?\.\(taskDraft.mode\)/);
  assert.match(editor, /onOpenResize=\{\(target\) => \{/);
  assert.match(editor, /exactResizeTarget\(target\)/);
  assert.match(editor, /setResizeAspectLocked\(false\)/);
  assert.match(editor, /setResizeDraft\(normalized\)/);
  assert.match(editor, /onPreviewTransform=\{\(mode\) => \{/);
  assert.match(editor, /void applyOrthogonalTransform\(mode\)/);
});
