/** Browser-only view guard; Core remains authoritative for Project and Artifact ownership. */
export function invocationMatchesSelection(invocation, selected, projectId) {
  return Boolean(invocation && selected && projectId
    && invocation.projectId === projectId
    && invocation.automationId === selected.id);
}

export function canAcceptAutomationInvocation(invocation, selected, projectId) {
  return invocationMatchesSelection(invocation, selected, projectId)
    && invocation.state === 'SUCCESS'
    && typeof invocation.terminalArtifactId === 'string'
    && invocation.terminalArtifactId.length > 0;
}

/** Commit first; a subsequent list-refresh failure must never report the commit as failed. */
export async function acceptAutomationInvocation({ invocation, definitionName, acceptFinal, onCommitted, refresh, onRefreshError }) {
  await acceptFinal(invocation.projectId, invocation.terminalArtifactId, `Automation: ${definitionName || invocation.automationId}`);
  onCommitted();
  try {
    await refresh();
  } catch (cause) {
    onRefreshError(cause);
  }
}
