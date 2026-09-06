import assert from 'node:assert/strict';
import test from 'node:test';
import { JOB_EXECUTION_CLASSES } from './jobModel.js';
import { JOB_REPEAT_SEMANTICS, buildNewOperationRepeatMetadata } from './jobRepeatPolicy.js';

const source = Object.freeze({
  id: 'job-source-1',
  executionClass: JOB_EXECUTION_CLASSES.EPHEMERAL_CLIENT_TASK,
  metadata: Object.freeze({
    feature: 'AI_EDITING',
    currentStage: 'failed',
    historyEntry: Object.freeze({ id: 'history-source' }),
    versionSnapshot: Object.freeze({ version: 7 }),
  }),
});

test('manual repeat is explicitly a new operation and scrubs terminal lifecycle/history metadata', () => {
  const metadata = buildNewOperationRepeatMetadata(source);
  assert.deepEqual(metadata, {
    feature: 'AI_EDITING',
    repeatSemantics: JOB_REPEAT_SEMANTICS.NEW_OPERATION,
    repeatOfJobId: 'job-source-1',
    repeatRootJobId: 'job-source-1',
  });
  assert.deepEqual(source.metadata, {
    feature: 'AI_EDITING',
    currentStage: 'failed',
    historyEntry: { id: 'history-source' },
    versionSnapshot: { version: 7 },
  });
});

test('repeat of a repeated job preserves the original root and advances immediate lineage', () => {
  const repeated = Object.freeze({
    id: 'job-repeat-2',
    executionClass: JOB_EXECUTION_CLASSES.EPHEMERAL_CLIENT_TASK,
    metadata: buildNewOperationRepeatMetadata(source),
  });
  assert.deepEqual(buildNewOperationRepeatMetadata(repeated), {
    feature: 'AI_EDITING',
    repeatSemantics: 'NEW_OPERATION',
    repeatOfJobId: 'job-repeat-2',
    repeatRootJobId: 'job-source-1',
  });
});

test('caller-supplied repeat root is ignored unless source metadata is an exact prior NEW_OPERATION lineage', () => {
  const forged = Object.freeze({
    ...source,
    id: 'job-forged-source',
    metadata: Object.freeze({ feature: 'AI_EDITING', repeatRootJobId: 'attacker-root' }),
  });
  assert.equal(buildNewOperationRepeatMetadata(forged).repeatRootJobId, 'job-forged-source');

  const malformedPrior = Object.freeze({
    ...source,
    id: 'job-malformed-prior',
    metadata: Object.freeze({ feature: 'AI_EDITING', repeatSemantics: 'NEW_OPERATION', repeatRootJobId: '   ' }),
  });
  assert.equal(buildNewOperationRepeatMetadata(malformedPrior).repeatRootJobId, 'job-malformed-prior');
});

test('repeat policy fails closed for non-ephemeral or malformed source identities', () => {
  assert.throws(() => buildNewOperationRepeatMetadata(null), /Source job is required/);
  assert.throws(() => buildNewOperationRepeatMetadata({ ...source, id: '' }), /Source job id is required/);
  assert.throws(
    () => buildNewOperationRepeatMetadata({ ...source, executionClass: 'CREATIVE_EXECUTION' }),
    /Only EPHEMERAL_CLIENT_TASK may be repeated/,
  );
});
