import assert from 'node:assert/strict';
import test from 'node:test';
import { FeedbackManager } from '../src/application/feedback/index.ts';

const scope = { userId: 'user-1', tenantId: 'tenant-1', projectId: 'project-1' };

const context = {
  ...scope,
  interactionId: 'interaction-1',
  experienceId: 'experience-1',
  workflowId: 'workflow-1',
  executionId: 'execution-1',
  userAction: 'change background to studio',
  executionResult: { imageUrl: 'result.png' },
};

const submitBackgroundCorrection = (manager, id) => manager.submit({
  id,
  context: { ...context, interactionId: `interaction-${id}`, executionId: `execution-${id}` },
  type: 'PREFERENCE_UPDATE',
  rating: 4,
  comment: 'Prefer studio background',
  corrections: { background: 'studio' },
});

test('submit feedback', () => {
  const manager = new FeedbackManager();
  const record = manager.submit({ id: 'feedback-1', context, type: 'SUCCESS', rating: 5, comment: 'Looks good' });

  assert.equal(record.id, 'feedback-1');
  assert.equal(record.userId, 'user-1');
  assert.equal(record.workflowId, 'workflow-1');
  assert.equal(record.type, 'SUCCESS');
  assert.equal(record.signals[0].key, 'workflow_success');
  assert.equal(manager.get('feedback-1', scope).id, 'feedback-1');
});

test('immutable records', () => {
  const manager = new FeedbackManager();
  const record = manager.submit({ id: 'feedback-1', context, type: 'QUALITY_ISSUE', rating: 2, comment: 'Blurry result' });

  assert.ok(Object.isFrozen(record));
  assert.ok(Object.isFrozen(record.signals));
  assert.throws(() => { (record as unknown as { comment: string }).comment = 'mutated'; }, /read only|Cannot assign/i);
});

test('tenant isolation', () => {
  const manager = new FeedbackManager();
  manager.submit({ id: 'feedback-1', context, type: 'SUCCESS', rating: 5 });

  assert.throws(() => manager.get('feedback-1', { ...scope, tenantId: 'tenant-2' }), /access denied/i);
  assert.throws(() => manager.inspect('feedback-1', { ...scope, projectId: 'project-2' }), /access denied/i);
  assert.deepEqual(manager.list({ ...scope, userId: 'user-2' }), []);
});

test('workflow quality analysis', () => {
  const manager = new FeedbackManager();
  manager.submit({ id: 'feedback-1', context, type: 'SUCCESS', rating: 5, comment: 'Good result' });
  manager.submit({ id: 'feedback-2', context: { ...context, executionId: 'execution-2' }, type: 'FAILURE', rating: 1, comment: 'Bad composition' });
  manager.submit({ id: 'feedback-3', context: { ...context, executionId: 'execution-3' }, type: 'QUALITY_ISSUE', rating: 2, comment: 'Blurry edges' });

  const analysis = manager.analyze(scope, 'workflow-1');

  assert.equal(analysis.total, 3);
  assert.equal(analysis.successes, 1);
  assert.equal(analysis.failures, 1);
  assert.equal(analysis.successRate, 1 / 3);
  assert.ok(analysis.qualityIssues.includes('Bad composition'));
  assert.ok(analysis.qualityIssues.includes('Blurry edges'));
});

test('preference extraction', () => {
  const manager = new FeedbackManager();
  submitBackgroundCorrection(manager, 'feedback-1');
  submitBackgroundCorrection(manager, 'feedback-2');
  submitBackgroundCorrection(manager, 'feedback-3');

  const analysis = manager.analyze(scope, 'workflow-1');
  const preference = analysis.repeatedCorrections.find((signal) => signal.key === 'preferred_background');

  assert.equal(preference?.value, 'studio');
  assert.equal(preference?.confidenceDelta, 0.12);
});

test('memory proposal generation', () => {
  const manager = new FeedbackManager();
  submitBackgroundCorrection(manager, 'feedback-1');
  submitBackgroundCorrection(manager, 'feedback-2');
  submitBackgroundCorrection(manager, 'feedback-3');

  const proposals = manager.memoryProposals(scope, 'workflow-1');

  assert.ok(proposals.some((proposal) => proposal.category === 'PREFERENCE_MEMORY'));
  assert.ok(proposals.some((proposal) => proposal.key === 'preferred_background'));
  assert.ok(proposals.every((proposal) => proposal.confidence > 0));
});

test('repeated correction detection', () => {
  const manager = new FeedbackManager();
  submitBackgroundCorrection(manager, 'feedback-1');
  submitBackgroundCorrection(manager, 'feedback-2');
  submitBackgroundCorrection(manager, 'feedback-3');

  const analysis = manager.analyze(scope);

  assert.ok(analysis.repeatedCorrections.length >= 1);
  assert.ok(analysis.dissatisfactionPatterns.includes('Repeated corrections indicate unmet user preferences.'));
});

test('debug snapshot', () => {
  const manager = new FeedbackManager();
  const record = submitBackgroundCorrection(manager, 'feedback-1');
  submitBackgroundCorrection(manager, 'feedback-2');
  submitBackgroundCorrection(manager, 'feedback-3');

  const debug = manager.debug(record.id, scope);

  assert.equal(debug.feedback.id, record.id);
  assert.equal(debug.userAction, 'Prefer studio background');
  assert.ok(debug.signals.some((signal) => signal.key === 'background'));
  assert.ok(debug.memoryProposals.some((proposal) => proposal.key === 'preferred_background'));
  assert.match(debug.recommendation, /memory proposals/i);
  assert.ok(Object.isFrozen(debug));
});

test('forbidden imports', async () => {
  const { readdir, readFile } = await import('node:fs/promises');
  const feedbackPath = `${process.cwd()}/src/application/feedback`;
  const files = (await readdir(feedbackPath)).filter((file) => file.endsWith('.ts'));

  for (const file of files) {
    const source = await readFile(`${feedbackPath}/${file}`, 'utf8');
    assert.doesNotMatch(
      source,
      /from ['"]\.\.\/\.\.\/(lib|platform)|from ['"]\.\.\/(agent|workflow|runtime|providers|memory|intelligence)|MemoryStore/,
    );
  }
});
