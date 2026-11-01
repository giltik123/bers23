// A UI-only fence for asynchronous bounded Agent completions.
// Core remains the authority for Project, Artifact and workflow outcomes.
// A ticket from a previous Project/source can never become current again.
const normalize = (value) => typeof value === 'string' ? value.trim() : '';

export function createBoundedAgentContextGate(projectId, sourceArtifactId) {
  let currentProjectId = normalize(projectId);
  let currentSourceId = normalize(sourceArtifactId);
  let revision = 0;

  return Object.freeze({
    sync(nextProjectId, nextSourceArtifactId) {
      const nextProject = normalize(nextProjectId);
      const nextSource = normalize(nextSourceArtifactId);
      if (nextProject !== currentProjectId || nextSource !== currentSourceId) {
        currentProjectId = nextProject;
        currentSourceId = nextSource;
        revision += 1;
      }
    },
    capture(requestProjectId, requestSourceArtifactId) {
      if (!currentProjectId || !currentSourceId ||
          normalize(requestProjectId) !== currentProjectId ||
          normalize(requestSourceArtifactId) !== currentSourceId) return null;
      return Object.freeze({
        projectId: currentProjectId,
        sourceArtifactId: currentSourceId,
        revision,
      });
    },
    isCurrent(ticket) {
      return ticket !== null && typeof ticket === 'object' &&
        ticket.projectId === currentProjectId &&
        ticket.sourceArtifactId === currentSourceId &&
        ticket.revision === revision;
    },
  });
}
