export const EXECUTION_RUN_LABEL_KEYS = Object.freeze({
  statuses: Object.freeze({
    QUEUED: 'queued', RUNNING: 'running', SUCCEEDED: 'succeeded',
    FAILED: 'failed', CANCELLED: 'cancelled', UNKNOWN: 'unknown',
  }),
  capabilities: Object.freeze({
    CREATIVE_EXECUTION: 'creative', LOCAL_EXECUTION: 'local',
    WORKFLOW_CONTINUATION: 'workflow', WORKFLOW_STEP: 'internalStep',
  }),
  localStates: Object.freeze({
    ACTIVE: 'active', EXPIRED: 'expired',
    FINALIZED_SUCCESS: 'finalizedSuccess',
    FINALIZED_FAILED: 'finalizedFailed',
    FINALIZED_UNKNOWN: 'finalizedUnknown',
  }),
});

export function executionRunLabel(t, group, value) {
  const key = EXECUTION_RUN_LABEL_KEYS[group]?.[value] || 'unknown';
  return t(`jobs.canonical.${group}.${key}`);
}
