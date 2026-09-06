import { JOB_EXECUTION_CLASSES } from './jobModel.js';

export const JOB_REPEAT_SEMANTICS = Object.freeze({
  NEW_OPERATION: 'NEW_OPERATION',
});

export function buildNewOperationRepeatMetadata(job) {
  if (!job || typeof job !== 'object') throw new TypeError('Source job is required');
  if (job.executionClass !== JOB_EXECUTION_CLASSES.EPHEMERAL_CLIENT_TASK) {
    throw new TypeError('Only EPHEMERAL_CLIENT_TASK may be repeated by JobManager');
  }
  if (typeof job.id !== 'string' || !job.id.trim()) throw new TypeError('Source job id is required');

  const {
    currentStage: _currentStage,
    historyEntry: _historyEntry,
    versionSnapshot: _versionSnapshot,
    repeatSemantics: priorRepeatSemantics,
    repeatOfJobId: _repeatOfJobId,
    repeatRootJobId: priorRepeatRootJobId,
    ...taskMetadata
  } = job.metadata ?? {};
  const inheritedRoot = priorRepeatSemantics === JOB_REPEAT_SEMANTICS.NEW_OPERATION
    && typeof priorRepeatRootJobId === 'string'
    && priorRepeatRootJobId.trim()
    ? priorRepeatRootJobId
    : job.id;

  return Object.freeze({
    ...taskMetadata,
    repeatSemantics: JOB_REPEAT_SEMANTICS.NEW_OPERATION,
    repeatOfJobId: job.id,
    repeatRootJobId: inheritedRoot,
  });
}
