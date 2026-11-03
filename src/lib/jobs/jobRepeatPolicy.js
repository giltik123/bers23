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


// An explicit user confirmation is required before a browser-only task is
// re-dispatched. A repeat is a NEW operation, never a recovery of the old run.
export const JOB_REPEAT_ACTIONS = Object.freeze({
  RUN_AGAIN: 'RUN_AGAIN',
  DUPLICATE: 'DUPLICATE',
});

export function manualRepeatConsentMessage(job, action, language = 'en') {
  if (job?.executionClass !== JOB_EXECUTION_CLASSES.EPHEMERAL_CLIENT_TASK
    || typeof job.id !== 'string' || !job.id.trim()) return null;
  if (action === JOB_REPEAT_ACTIONS.RUN_AGAIN && job.status !== 'failed') return null;
  if (action === JOB_REPEAT_ACTIONS.DUPLICATE
    && !['completed', 'failed', 'cancelled'].includes(job.status)) return null;
  if (action !== JOB_REPEAT_ACTIONS.RUN_AGAIN && action !== JOB_REPEAT_ACTIONS.DUPLICATE) return null;
  return language === 'ru'
    ? 'Это запустит НОВУЮ операцию, а не восстановит прежнюю. При использовании платного провайдера могут списаться кредиты. Продолжить?'
    : 'This starts a NEW operation, not recovery of the previous one. A paid provider may consume credits. Continue?';
}
