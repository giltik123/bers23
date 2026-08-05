import assert from 'node:assert/strict';
import test from 'node:test';
import { ContextBuilder, MemoryRetriever, MemoryStore } from '../src/platform/memory';

const alice = { tenantId: 'tenant-a', userId: 'alice', projectId: 'project-1' };
const bob = { tenantId: 'tenant-a', userId: 'bob', projectId: 'project-1' };
const outsider = { tenantId: 'tenant-b', userId: 'alice', projectId: 'project-1' };

test('stores immutable categorized memories with namespace, timestamp, and confidence', () => {
  const store = new MemoryStore();
  const record = store.save({ namespace: 'creative', category: 'USER_PREFERENCE', owner: alice, value: { style: 'natural', colors: ['warm'] }, tags: ['portrait', 'natural'], confidence: 0.95 });
  assert.equal(record.namespace, 'creative');
  assert.equal(record.category, 'USER_PREFERENCE');
  assert.equal(record.confidence, 0.95);
  assert.equal(Object.isFrozen(record), true);
  assert.equal(Object.isFrozen(record.value), true);
  assert.equal(Object.isFrozen(record.tags), true);
  assert.equal(store.get(record.id, alice), record);
});

test('retrieves relevant, recent, and high-confidence memories', () => {
  const store = new MemoryStore(); const retriever = new MemoryRetriever(store);
  store.save({ namespace: 'creative', category: 'STYLE_MEMORY', owner: alice, value: { description: 'cinematic warm portrait lighting' }, tags: ['portrait', 'warm'], confidence: 0.95 });
  store.save({ namespace: 'creative', category: 'WORKFLOW_MEMORY', owner: alice, value: { workflow: 'product background cleanup' }, tags: ['product'], confidence: 0.4 });
  assert.equal(retriever.relevant({ text: 'warm portrait', namespace: 'creative' }, alice)[0].category, 'STYLE_MEMORY');
  assert.equal(retriever.highConfidence(alice, 0.8).length, 1);
  assert.equal(retriever.recent(alice, 1).length, 1);
});

test('expiration, confidence decay, and manual deletion are enforced', () => {
  let now = new Date('2026-01-01T00:00:00.000Z'); const clock = () => now; const store = new MemoryStore(100, clock);
  const expiring = store.save({ namespace: 'project', category: 'PROJECT_CONTEXT', owner: alice, visibility: 'PROJECT', value: { scene: 'studio' }, confidence: 1, retention: { expiresAt: '2026-01-02T00:00:00.000Z', confidenceHalfLifeMs: 3600000 } });
  now = new Date('2026-01-01T01:00:00.000Z');
  assert.ok(Math.abs(store.confidence(expiring) - 0.5) < 0.0001);
  now = new Date('2026-01-03T00:00:00.000Z');
  assert.equal(store.get(expiring.id, alice), undefined);
  assert.equal(store.purgeExpired(), 1);
  const removable = store.save({ namespace: 'creative', category: 'STYLE_MEMORY', owner: alice, value: 'minimal', confidence: 1 });
  assert.equal(store.delete(removable.id, bob), false);
  assert.equal(store.delete(removable.id, alice), true);
});

test('context builder combines user, project, execution, workflow, and relevant memories', () => {
  const store = new MemoryStore(); const retriever = new MemoryRetriever(store); const builder = new ContextBuilder(retriever);
  store.save({ namespace: 'creative', category: 'USER_PREFERENCE', owner: alice, value: { intensity: 'natural' }, tags: ['portrait'], confidence: 1 });
  store.save({ namespace: 'creative', category: 'STYLE_MEMORY', owner: alice, value: { palette: 'warm' }, tags: ['warm'], confidence: 0.9 });
  store.save({ namespace: 'creative', category: 'PROJECT_CONTEXT', owner: alice, visibility: 'PROJECT', value: { subject: 'person' }, tags: ['portrait'], confidence: 1 });
  store.save({ namespace: 'creative', category: 'EXECUTION_PATTERN', owner: alice, value: { action: 'face enhancement', success: 20 }, tags: ['portrait'], confidence: 0.8 });
  store.save({ namespace: 'creative', category: 'WORKFLOW_MEMORY', owner: alice, value: { steps: ['lighting', 'retouch'] }, tags: ['portrait'], confidence: 0.85 });
  const context = builder.build({ ...alice, namespace: 'creative', request: 'warm portrait enhancement', executionHistory: [{ id: 'execution-1' }] });
  assert.equal(context.user.length, 2);
  assert.equal(context.preferences.length, 1);
  assert.equal(context.project.length, 1);
  assert.equal(context.execution.length, 1);
  assert.equal(context.workflows.length, 1);
  assert.ok(context.relevant.length >= 3);
  assert.equal(Object.isFrozen(context.executionHistory), true);
});

test('privacy boundaries isolate users and tenants while allowing explicit project sharing', () => {
  const store = new MemoryStore();
  const privateRecord = store.save({ namespace: 'creative', category: 'USER_PREFERENCE', owner: alice, value: { style: 'private' }, confidence: 1 });
  const projectRecord = store.save({ namespace: 'creative', category: 'PROJECT_CONTEXT', owner: alice, visibility: 'PROJECT', value: { scene: 'shared' }, confidence: 1 });
  const tenantRecord = store.save({ namespace: 'creative', category: 'EXECUTION_PATTERN', owner: alice, visibility: 'TENANT', value: { stable: true }, confidence: 1 });
  assert.equal(store.get(privateRecord.id, bob), undefined);
  assert.equal(store.get(privateRecord.id, outsider), undefined);
  assert.equal(store.get(projectRecord.id, bob), projectRecord);
  assert.equal(store.get(projectRecord.id, outsider), undefined);
  assert.equal(store.get(tenantRecord.id, bob), tenantRecord);
  assert.equal(store.get(tenantRecord.id, outsider), undefined);
  assert.equal(store.delete(projectRecord.id, bob), false);
});
