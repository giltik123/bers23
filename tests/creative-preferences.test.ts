import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { CreativePreferenceSignal, PreferenceAnalyzer, PreferenceDebugger, PreferenceSignalProcessor } from '../src/platform/creative/experience/preferences';

const signals = new CreativePreferenceSignal();
const createSignal = (overrides = {}) => signals.create({ id: `signal-${Math.random()}`, userId: 'user-a', tenantId: 'tenant-a', projectId: 'project-a', visibility: 'PRIVATE', category: 'STYLE', value: 'luxury', signalType: 'ACCEPTED', confidenceDelta: 0.12, evidenceSource: 'USER_ACTION', createdAt: 100, ...overrides });

test('Создание сигнала возвращает immutable CreativePreferenceSignal', () => {
  const signal = createSignal({ id: 'signal-1' });
  assert.equal(signal.id, 'signal-1');
  assert.equal(signal.category, 'STYLE');
  assert.equal(Object.isFrozen(signal), true);
  assert.equal(Object.isFrozen(signal.evidence), true);
});

test('Confidence accepted увеличивает, rejected уменьшает', () => {
  const processor = new PreferenceSignalProcessor();
  const accepted = processor.process(createSignal({ id: 'accepted', createdAt: 1 }));
  const rejected = processor.process(createSignal({ id: 'rejected', signalType: 'REJECTED', createdAt: 2 }));
  assert.equal(accepted.preferences[0].confidence, 0.62);
  assert.equal(rejected.preferences[0].confidence, 0.5);
});

test('Повторные действия повышают confidence с bonus +0.05', () => {
  const processor = new PreferenceSignalProcessor();
  let profile;
  for (let index = 0; index < 10; index += 1) profile = processor.process(createSignal({ id: `repeat-${index}`, signalType: 'REPEATED', confidenceDelta: 0.03, createdAt: index + 1 }));
  assert.ok(profile.preferences[0].confidence > 0.82);
  assert.equal(profile.preferences[0].evidenceCount, 10);
});

test('Isolation: User A не видит preference User B', () => {
  const processor = new PreferenceSignalProcessor();
  processor.process(createSignal({ id: 'a', userId: 'user-a', tenantId: 'tenant-a', value: 'luxury' }));
  processor.process(createSignal({ id: 'b', userId: 'user-b', tenantId: 'tenant-a', value: 'minimal' }));
  assert.equal(processor.getProfile('user-a', 'tenant-a')?.preferences[0].value, 'luxury');
  assert.equal(processor.getProfile('user-b', 'tenant-a')?.preferences[0].value, 'minimal');
  assert.equal(processor.getProfile('user-a', 'tenant-a')?.preferences.some((preference) => preference.value === 'minimal'), false);
});

test('Security: PROJECT и TENANT scopes проверяют tenantId/projectId', () => {
  const projectSignal = createSignal({ visibility: 'PROJECT' });
  const tenantSignal = createSignal({ visibility: 'TENANT' });
  assert.equal(signals.canAccess(projectSignal, { userId: 'other', tenantId: 'tenant-a', projectId: 'project-a' }), true);
  assert.equal(signals.canAccess(projectSignal, { userId: 'other', tenantId: 'tenant-a', projectId: 'other-project' }), false);
  assert.equal(signals.canAccess(tenantSignal, { userId: 'other', tenantId: 'tenant-a' }), true);
  assert.equal(signals.canAccess(tenantSignal, { userId: 'other', tenantId: 'tenant-b' }), false);
});

test('Immutable: profile.preferences нельзя изменять', () => {
  const profile = new PreferenceSignalProcessor().process(createSignal({ id: 'immutable' }));
  assert.throws(() => profile.preferences.push({ category: 'COLOR', value: 'warm', confidence: 0.5, evidenceCount: 1, firstSeen: 1, lastUpdated: 1 }), /object is not extensible|read only|Cannot add property/);
});

test('Analyzer возвращает topStyles и topColors', () => {
  const processor = new PreferenceSignalProcessor();
  const style = processor.process(createSignal({ id: 'style', category: 'STYLE', value: 'luxury', confidenceDelta: 0.2, createdAt: 1 }));
  const profile = processor.process(createSignal({ id: 'color', category: 'COLOR', value: 'warm', confidenceDelta: 0.18, createdAt: 2 }));
  const analysis = new PreferenceAnalyzer().analyze(profile);
  assert.equal(style.preferences[0].value, 'luxury');
  assert.equal(analysis.topStyles[0].value, 'luxury');
  assert.equal(analysis.topColors[0].value, 'warm');
  assert.ok(analysis.confidence > 0.6);
});

test('PreferenceDebugger показывает User, Categories, Confidence и Evidence', () => {
  const profile = new PreferenceSignalProcessor().process(createSignal({ id: 'debug', createdAt: 1 }));
  const debug = new PreferenceDebugger().debug(profile);
  assert.match(debug, /User:user-a/);
  assert.match(debug, /STYLE/);
  assert.match(debug, /confidence/);
  assert.match(debug, /evidence/);
});

test('Forbidden imports: preferences не зависят от Memory, Agent, Workflow, Runtime, Provider, UI', () => {
  const forbidden = [/src\/lib\//, /src\/application\//, /agent/i, /workflow/i, /runtime/i, /provider/i, /memory/i, /react/i, /base44/i];
  const directory = 'src/platform/creative/experience/preferences';
  for (const file of readdirSync(directory)) {
    if (!file.endsWith('.ts')) continue;
    const dependencyLines = readFileSync(join(directory, file), 'utf8').split('\n').filter((line) => /^import|^export .* from/.test(line)).join('\n');
    for (const pattern of forbidden) assert.equal(pattern.test(dependencyLines), false, `${file} contains forbidden import/dependency ${pattern}`);
  }
});
