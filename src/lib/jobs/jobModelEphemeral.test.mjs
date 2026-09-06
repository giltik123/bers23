import assert from 'node:assert/strict';
import test from 'node:test';

import {
  JOB_EXECUTION_CLASSES,
  createJob,
  setJobStatus,
  updateJobProgress,
} from './jobModel.js';

const baseInput = () => ({
  type: 'segmentation',
  label: 'Detect objects',
  projectId: '11111111-1111-4111-8111-111111111111',
  run: async () => ({ status: 'completed' }),
});

test('createJob fails closed when executionClass is missing or unsupported', () => {
  assert.throws(() => createJob(baseInput()), /EPHEMERAL_CLIENT_TASK/);
  assert.throws(
    () => createJob({ ...baseInput(), executionClass: 'CANONICAL_SERVER_EXECUTION' }),
    /EPHEMERAL_CLIENT_TASK/,
  );
});

test('exact ephemeral execution class survives lifecycle and progress mutations', () => {
  const job = createJob({
    ...baseInput(),
    executionClass: JOB_EXECUTION_CLASSES.EPHEMERAL_CLIENT_TASK,
  });

  assert.equal(job.executionClass, JOB_EXECUTION_CLASSES.EPHEMERAL_CLIENT_TASK);
  updateJobProgress(job, 42, 'detecting');
  setJobStatus(job, 'running');
  setJobStatus(job, 'completed');

  assert.equal(job.executionClass, JOB_EXECUTION_CLASSES.EPHEMERAL_CLIENT_TASK);
  assert.equal(job.progress, 100);
  assert.equal(job.status, 'completed');
});