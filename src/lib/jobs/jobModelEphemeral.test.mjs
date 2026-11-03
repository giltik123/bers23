import assert from 'node:assert/strict';
import test from 'node:test';

import {
  JOB_EXECUTION_CLASSES,
  canMoveSessionJobUp,
  sessionJobsForProject,
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
test('session Job Center displays only the active Project tasks', () => {
  const a = '11111111-1111-4111-8111-111111111111';
  const b = '22222222-2222-4222-8222-222222222222';
  const jobs = [
    { id: 'a1', projectId: a }, { id: 'b1', projectId: b },
    { id: 'a2', projectId: a.toUpperCase() }, { id: 'unscoped', projectId: null },
  ];
  assert.deepEqual(sessionJobsForProject(jobs, a).map((job) => job.id), ['a1', 'a2']);
  assert.deepEqual(sessionJobsForProject(jobs, b).map((job) => job.id), ['b1']);
  assert.deepEqual(sessionJobsForProject(jobs, null), []);
  assert.deepEqual(sessionJobsForProject(jobs, ' '), []);
  assert.deepEqual(sessionJobsForProject(null, a), []);
});

test('session queue move-up cannot cross Project boundaries', () => {
  const a = '11111111-1111-4111-8111-111111111111';
  const b = '22222222-2222-4222-8222-222222222222';
  const queue = [
    { id: 'a1', projectId: a }, { id: 'b1', projectId: b },
    { id: 'a2', projectId: a }, { id: 'a3', projectId: a },
    { id: 'unscoped', projectId: null },
  ];
  assert.equal(canMoveSessionJobUp(queue, 'a1', a), false);
  assert.equal(canMoveSessionJobUp(queue, 'a2', a), false);
  assert.equal(canMoveSessionJobUp(queue, 'a3', a), true);
  assert.equal(canMoveSessionJobUp(queue, 'b1', a), false);
  assert.equal(canMoveSessionJobUp(queue, 'unscoped', a), false);
  assert.equal(canMoveSessionJobUp(queue, 'a3', null), false);
  assert.equal(canMoveSessionJobUp([], 'a3', a), false);
});
