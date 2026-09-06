import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { creativeExecutionIdentity } from './creativeExecutionIdentity.ts';

const auth = Object.freeze({ tenantId: 'tenant-a', userId: 'user-a' });
const base = Object.freeze({
  projectId: '11111111-1111-4111-8111-111111111111',
  instruction: 'replace the sky',
  selectedObjectIds: Object.freeze(['object-a', 'object-b']),
  inputArtifactId: 'artifact-original',
  maskArtifactIds: Object.freeze(['mask-a', 'mask-b']),
  preserveMode: 'STRICT',
  clientRequestId: 'request-1',
});

function legacyExecutionId(command = base, scope = auth) {
  const key = `${scope.tenantId}:${scope.userId}:${command.projectId}:${command.clientRequestId}`;
  return `creative-${createHash('sha256').update(key).digest('hex').slice(0, 24)}`;
}

test('exact request identity is deterministic and preserves the accepted executionId formula', () => {
  const first = creativeExecutionIdentity(base, auth);
  const second = creativeExecutionIdentity(structuredClone(base), structuredClone(auth));
  assert.deepEqual(first, second);
  assert.equal(first.executionId, legacyExecutionId());
  assert.match(first.requestFingerprint, /^[0-9a-f]{64}$/);
  assert.match(first.runIdempotencyKey, /^creative-run-v1:[0-9a-f]{64}$/);
});

test('same clientRequestId with changed semantic payload preserves public executionId but changes replay identity', () => {
  for (const changed of [
    { ...base, instruction: 'replace the ground' },
    { ...base, inputArtifactId: 'artifact-other' },
    { ...base, selectedObjectIds: ['object-a'] },
    { ...base, selectedObjectIds: ['object-b', 'object-a'] },
    { ...base, maskArtifactIds: ['mask-a'] },
    { ...base, maskArtifactIds: ['mask-b', 'mask-a'] },
    { ...base, preserveMode: 'LOCKED' },
  ]) {
    const original = creativeExecutionIdentity(base, auth);
    const candidate = creativeExecutionIdentity(changed, auth);
    assert.equal(candidate.executionId, original.executionId);
    assert.notEqual(candidate.requestFingerprint, original.requestFingerprint);
    assert.notEqual(candidate.runIdempotencyKey, original.runIdempotencyKey);
  }
});

test('optional field presence and array order remain exact replay identity', () => {
  const absent = creativeExecutionIdentity({
    projectId: base.projectId,
    instruction: base.instruction,
    inputArtifactId: base.inputArtifactId,
    clientRequestId: base.clientRequestId,
  }, auth);
  const explicitEmpty = creativeExecutionIdentity({
    projectId: base.projectId,
    instruction: base.instruction,
    inputArtifactId: base.inputArtifactId,
    selectedObjectIds: [],
    maskArtifactIds: [],
    clientRequestId: base.clientRequestId,
  }, auth);
  assert.equal(absent.executionId, explicitEmpty.executionId);
  assert.notEqual(absent.requestFingerprint, explicitEmpty.requestFingerprint);
  assert.notEqual(absent.runIdempotencyKey, explicitEmpty.runIdempotencyKey);
});

test('scope, project and clientRequestId changes create distinct authority identity', () => {
  const original = creativeExecutionIdentity(base, auth);
  for (const [command, scope] of [
    [{ ...base, projectId: '22222222-2222-4222-8222-222222222222' }, auth],
    [{ ...base, clientRequestId: 'request-2' }, auth],
    [base, { ...auth, tenantId: 'tenant-b' }],
    [base, { ...auth, userId: 'user-b' }],
  ]) {
    const candidate = creativeExecutionIdentity(command, scope);
    assert.notEqual(candidate.executionId, original.executionId);
    assert.notEqual(candidate.requestFingerprint, original.requestFingerprint);
    assert.notEqual(candidate.runIdempotencyKey, original.runIdempotencyKey);
  }
});
