import assert from 'node:assert/strict';
import test from 'node:test';
import { experience, ExperienceManager } from '../src/application/experience/index.ts';

const createStartedSession = () => {
  const manager = new ExperienceManager();
  const session = manager.create({
    id: 'exp-1',
    commandId: 'cmd-1',
    userId: 'user-1',
    projectId: 'project-1',
    intent: 'fashion_catalog_image',
    request: { prompt: 'Сделай фото для каталога одежды', image: 'person.png' },
  });
  return { manager, session: manager.start(session.id, { workflowId: 'virtual-try-on', provider: 'FASHN' }) };
};

test('command → experience session', () => {
  const manager = new ExperienceManager();
  const session = manager.create({ commandId: 'cmd-1', userId: 'user-1', projectId: 'project-1', intent: 'fashion_catalog_image', request: { prompt: 'catalog' } });

  assert.equal(session.commandId, 'cmd-1');
  assert.equal(session.userId, 'user-1');
  assert.equal(session.projectId, 'project-1');
  assert.equal(session.state, 'CREATED');
  assert.equal(session.history[0].type, 'request');
});

test('progress updates expose human-readable steps', () => {
  const { manager, session } = createStartedSession();
  const updated = manager.updateProgress(session.id, { workflowId: 'virtual-try-on', completedSteps: [1, 2], currentStep: 3 });

  assert.deepEqual(updated.progress.map((step) => step.label), ['Анализ изображения', 'Подготовка одежды', 'Примерка одежды', 'Проверка качества', 'Финальная обработка']);
  assert.deepEqual(updated.progress.map((step) => step.status), ['DONE', 'DONE', 'ACTIVE', 'PENDING', 'PENDING']);
});

test('technical progress names are translated for users', () => {
  const { manager, session } = createStartedSession();
  const updated = manager.updateProgress(session.id, { workflowId: 'virtual-try-on', currentStep: 'SAM3 mask generation' });

  assert.equal(updated.progress[0].label, 'Анализирую объект на изображении');
  assert.equal(updated.progress[0].status, 'ACTIVE');
  assert.equal(updated.progress[0].technicalStep, 'SAM3 mask generation');
  assert.equal(updated.progress[1].label, 'Подготовка одежды');
  assert.equal(updated.progress[1].technicalStep, undefined);
});

test('waiting user confirmation', () => {
  const { manager, session } = createStartedSession();
  const waiting = manager.requestDecision(session.id, {
    id: 'decision-face-change',
    type: 'CONFIRMATION',
    message: 'Изменение лица обнаружено. Продолжить?',
    options: [{ id: 'yes', label: 'YES', value: true }, { id: 'no', label: 'NO', value: false }],
  });

  assert.equal(waiting.state, 'WAITING_USER');
  assert.equal(waiting.decisions[0].type, 'CONFIRMATION');
  assert.match(waiting.decisions[0].message, /Изменение лица/);
});

test('decision submit resumes execution', () => {
  const { manager, session } = createStartedSession();
  manager.requestDecision(session.id, { id: 'd1', type: 'CONFIRMATION', message: 'Продолжить?', options: [{ id: 'yes', label: 'YES', value: true }] });
  const submitted = manager.submitDecision(session.id, 'd1', true);

  assert.equal(submitted.state, 'EXECUTING');
  assert.equal(submitted.decisions[0].answer, true);
  assert.ok(submitted.decisions[0].submittedAt);
});

test('workflow explanation', () => {
  const { manager, session } = createStartedSession();

  assert.match(session.explanations.workflow ?? '', /Выбран Virtual Try-On/);
  assert.match(session.explanations.workflow ?? '', /обнаружена одежда/);
  assert.equal(manager.debug(session.id).workflow.explanation, session.explanations.workflow);
});

test('provider explanation', () => {
  const { session } = createStartedSession();

  assert.equal(session.explanations.provider, 'Используется FASHN: лучшее качество примерки одежды.');
});

test('cancel', () => {
  const { manager, session } = createStartedSession();
  const cancelled = manager.cancel(session.id, 'user cancelled');

  assert.equal(cancelled.state, 'CANCELLED');
  assert.deepEqual(cancelled.result, { reason: 'user cancelled' });
});

test('failure', () => {
  const { manager, session } = createStartedSession();
  const failed = manager.fail(session.id, 'provider unavailable');

  assert.equal(failed.state, 'FAILED');
  assert.deepEqual(failed.result, { error: 'provider unavailable' });
});

test('history stores request, decision, workflow, progress, result, and feedback', () => {
  const { manager, session } = createStartedSession();
  manager.updateProgress(session.id, { workflowId: 'virtual-try-on', currentStep: 1 });
  manager.requestDecision(session.id, { id: 'd1', type: 'CONFIRMATION', message: 'Продолжить?', options: [{ id: 'yes', label: 'YES', value: true }] });
  manager.submitDecision(session.id, 'd1', true);
  const completed = manager.complete(session.id, { imageUrl: 'final.png' }, { rating: 'GOOD', workflowId: 'virtual-try-on', executionId: 'exec-1' });

  const historyTypes = new Set(completed.history.map((entry) => entry.type));
  assert.ok(historyTypes.has('request'));
  assert.ok(historyTypes.has('workflow'));
  assert.ok(historyTypes.has('progress'));
  assert.ok(historyTypes.has('decision'));
  assert.ok(historyTypes.has('result'));
  assert.ok(historyTypes.has('feedback'));
  assert.equal(completed.feedback[0].rating, 'GOOD');
});

test('experience.debug(sessionId) returns Command ↓ Intent ↓ Workflow ↓ Progress ↓ Decision ↓ Result ↓ Feedback', () => {
  const created = experience.create({ id: 'exp-singleton', commandId: 'cmd-singleton', userId: 'user-1', projectId: 'project-1', intent: 'fashion_catalog_image' });
  experience.start(created.id, { workflowId: 'virtual-try-on', provider: 'FASHN' });
  assert.equal(experience.debug(created.id).workflow.value.id, 'virtual-try-on');
});

test('debug snapshot returns Command ↓ Intent ↓ Workflow ↓ Progress ↓ Decision ↓ Result ↓ Feedback', () => {
  const { manager, session } = createStartedSession();
  manager.updateProgress(session.id, { workflowId: 'virtual-try-on', completedSteps: [1, 2, 3, 4, 5] });
  manager.requestDecision(session.id, { id: 'd1', type: 'CONFIRMATION', message: 'Продолжить?', options: [{ id: 'yes', label: 'YES', value: true }] });
  manager.submitDecision(session.id, 'd1', true);
  manager.complete(session.id, { imageUrl: 'final.png' });
  manager.feedback(session.id, { rating: 'IMPROVE', comment: 'Больше реализма', workflowId: 'virtual-try-on', executionId: 'exec-1' });
  const debug = manager.debug(session.id);

  assert.deepEqual(debug.command, { id: 'cmd-1', userId: 'user-1', projectId: 'project-1' });
  assert.equal(debug.intent, 'fashion_catalog_image');
  assert.equal(debug.workflow.value.id, 'virtual-try-on');
  assert.equal(debug.progress.length, 5);
  assert.equal(debug.decision[0].answer, true);
  assert.equal(debug.result.imageUrl, 'final.png');
  assert.equal(debug.feedback[0].comment, 'Больше реализма');
});

test('immutable snapshots', () => {
  const { manager, session } = createStartedSession();
  const before = manager.inspect(session.id);
  assert.throws(() => { before.progress.push({ id: 'x', label: 'bad', status: 'DONE', updatedAt: 'now' }); }, TypeError);
  manager.updateProgress(session.id, { workflowId: 'virtual-try-on', currentStep: 1 });
  const after = manager.inspect(session.id);

  assert.equal(before.progress.length, 0);
  assert.equal(after.progress.length, 5);
  assert.notEqual(before, after);
});
