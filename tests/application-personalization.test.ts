import assert from 'node:assert/strict';
import test from 'node:test';
import { PersonalizationManager, PersonalizationSignalProcessor } from '../src/application/personalization/index.ts';

const scope = { userId: 'user-1', tenantId: 'tenant-1' };

const createManager = () => {
  const manager = new PersonalizationManager();
  const profile = manager.create({ ...scope, id: 'profile-1' });
  return { manager, profile };
};

const styleSignal = {
  id: 'signal-1',
  ...scope,
  source: 'feedback',
  category: 'STYLE',
  key: 'prefers_cinematic_lighting',
  value: true,
  confidenceDelta: 0.2,
  reason: 'User repeatedly prefers cinematic lighting',
  evidence: ['feedback-1'],
};

test('profile creation', () => {
  const { profile } = createManager();

  assert.equal(profile.id, 'profile-1');
  assert.equal(profile.userId, 'user-1');
  assert.equal(profile.tenantId, 'tenant-1');
  assert.deepEqual(profile.preferences, []);
  assert.equal(profile.confidence, 0);
});

test('preference update', () => {
  const { manager } = createManager();
  const updated = manager.applySignal('profile-1', styleSignal, scope);

  assert.equal(updated.preferences[0].category, 'STYLE');
  assert.equal(updated.preferences[0].key, 'prefers_cinematic_lighting');
  assert.equal(updated.styleProfile.prefers_cinematic_lighting, true);
});

test('confidence accumulation', () => {
  const { manager } = createManager();

  manager.applySignal('profile-1', styleSignal, scope);
  const updated = manager.applySignal('profile-1', { ...styleSignal, id: 'signal-2', confidenceDelta: 0.15, evidence: ['feedback-2'] }, scope);

  assert.equal(updated.preferences[0].confidence, 0.35);
  assert.equal(updated.confidence, 0.35);
  assert.deepEqual(updated.preferences[0].evidence, ['feedback-1', 'feedback-2']);
});

test('signal processing', () => {
  const processor = new PersonalizationSignalProcessor();
  const signals = processor.process({
    ...scope,
    feedbackSignals: [{ id: 'feedback-signal-1', key: 'background', value: 'studio', confidenceDelta: 0.15, reason: 'background wrong' }],
    memoryProposals: [{ id: 'proposal-1', category: 'QUALITY_MEMORY', key: 'prefers_high_resolution', value: true, confidence: 0.82, evidence: ['feedback-1'] }],
    workflowHistory: ['catalog', 'catalog', 'catalog'],
    interactionHistory: ['approve_fast', 'auto_continue'],
  });

  assert.ok(signals.some((signal) => signal.key === 'background_style_preference'));
  assert.ok(signals.some((signal) => signal.key === 'prefers_high_resolution'));
  assert.ok(signals.some((signal) => signal.key === 'preferred_workflow'));
  assert.ok(signals.some((signal) => signal.key === 'prefers_automatic_execution'));
});

test('feedback → preference flow', () => {
  const { manager } = createManager();
  const updated = manager.processContext('profile-1', {
    ...scope,
    feedbackSignals: [{ id: 'feedback-signal-1', key: 'background', value: 'studio', confidenceDelta: 0.15, reason: 'USER_REJECTED because background wrong' }],
  }, scope);

  const preference = updated.preferences.find((item) => item.key === 'background_style_preference');

  assert.equal(preference?.category, 'STYLE');
  assert.equal(preference?.value, 'studio');
  assert.equal(preference?.confidence, 0.15);
});

test('tenant isolation', () => {
  const { manager } = createManager();

  assert.throws(() => manager.get('profile-1', { ...scope, tenantId: 'tenant-2' }), /access denied/i);
  assert.throws(() => manager.applySignal('profile-1', { ...styleSignal, tenantId: 'tenant-2' }, scope), /access denied/i);
});

test('immutable profile', () => {
  const { manager } = createManager();
  const updated = manager.applySignal('profile-1', styleSignal, scope);

  assert.ok(Object.isFrozen(updated));
  assert.ok(Object.isFrozen(updated.preferences));
  assert.throws(() => { (updated as unknown as { confidence: number }).confidence = 1; }, /read only|Cannot assign/i);
});

test('recommendation generation', () => {
  const { manager } = createManager();

  manager.processContext('profile-1', {
    ...scope,
    memoryProposals: [
      { id: 'proposal-1', category: 'QUALITY_MEMORY', key: 'prefers_high_resolution', value: true, confidence: 0.82, evidence: ['feedback-1'] },
      { id: 'proposal-2', category: 'WORKFLOW_MEMORY', key: 'preferred_workflow', value: 'catalog', confidence: 0.7, evidence: ['workflow-history'] },
    ],
    interactionHistory: ['approve_fast', 'auto_continue'],
  }, scope);
  const recommendations = manager.recommend('profile-1', scope);

  assert.ok(recommendations.qualityHints.some((hint) => hint.includes('prefers_high_resolution')));
  assert.ok(recommendations.workflowHints.some((hint) => hint.includes('catalog')));
  assert.ok(recommendations.interactionHints.some((hint) => hint.includes('prefers_automatic_execution')));
  assert.ok(recommendations.confidence > 0);
});

test('debug snapshot', () => {
  const { manager } = createManager();

  manager.applySignal('profile-1', styleSignal, scope);
  const debug = manager.debug('profile-1', scope);

  assert.equal(debug.user.id, 'user-1');
  assert.equal(debug.signals[0].id, 'signal-1');
  assert.equal(debug.preferences[0].key, 'prefers_cinematic_lighting');
  assert.equal(debug.confidence, 0.2);
  assert.ok(debug.recommendations.styleHints.some((hint) => hint.includes('prefers_cinematic_lighting')));
  assert.ok(Object.isFrozen(debug));
});

test('forbidden imports', async () => {
  const { readdir, readFile } = await import('node:fs/promises');
  const personalizationPath = `${process.cwd()}/src/application/personalization`;
  const files = (await readdir(personalizationPath)).filter((file) => file.endsWith('.ts'));

  for (const file of files) {
    const source = await readFile(`${personalizationPath}/${file}`, 'utf8');
    assert.doesNotMatch(
      source,
      /from ['"]\.\.\/\.\.\/(lib|platform)|from ['"]\.\.\/(feedback|agent|workflow|runtime|providers|memory|intelligence)|MemoryStore/,
    );
  }
});
