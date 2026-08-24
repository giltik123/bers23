import assert from 'node:assert/strict';
import test from 'node:test';
import { admitLocalExecutionInputs } from './LocalExecutionInputAdmission.ts';

const sha = 'a'.repeat(64);
const ticket = (binding = {}) => ({
  inputs: [{ artifactId: 'source-1', kind: 'image', role: 'ORIGINAL', sha256: sha, ...binding }],
});
const artifact = (overrides = {}) => ({
  id: 'source-1', kind: 'image', role: 'ORIGINAL', metadata: { sha256: sha }, ...overrides,
});

test('admits current canonical input only when id kind role and hash match the immutable ticket', () => {
  const decision = admitLocalExecutionInputs(ticket(), [artifact()]);
  assert.deepEqual(decision, { allowed: true, reasonCode: 'INPUTS_ADMITTED' });
  assert.equal(Object.isFrozen(decision), true);
});

test('fails closed when the canonical input disappeared', () => {
  assert.deepEqual(admitLocalExecutionInputs(ticket(), []), { allowed: false, reasonCode: 'INPUT_MISSING', artifactId: 'source-1' });
});

test('fails closed when canonical input kind or role changed', () => {
  assert.equal(admitLocalExecutionInputs(ticket(), [artifact({ kind: 'mask' })]).reasonCode, 'INPUT_KIND_MISMATCH');
  assert.equal(admitLocalExecutionInputs(ticket(), [artifact({ role: 'WORKING' })]).reasonCode, 'INPUT_ROLE_MISMATCH');
});

test('requires a server-issued input hash binding', () => {
  assert.equal(admitLocalExecutionInputs(ticket({ sha256: undefined }), [artifact()]).reasonCode, 'INPUT_HASH_MISSING');
});

test('rejects a changed canonical source hash before local result persistence', () => {
  assert.equal(admitLocalExecutionInputs(ticket(), [artifact({ metadata: { sha256: 'b'.repeat(64) } })]).reasonCode, 'INPUT_HASH_MISMATCH');
  assert.equal(admitLocalExecutionInputs(ticket(), [artifact({ metadata: {} })]).reasonCode, 'INPUT_HASH_MISMATCH');
});
