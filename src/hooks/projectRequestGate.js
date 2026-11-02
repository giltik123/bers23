// A browser-only request fence: responses from a previous Project or older
// request must never replace the Editor's currently selected Project snapshot.
// This is not a Project authority; all reads and mutations still go through Core.
export function createProjectRequestGate(initialProjectId) {
  let projectId = initialProjectId;
  let generation = 0;

  return Object.freeze({
    sync(nextProjectId) {
      if (nextProjectId !== projectId) {
        projectId = nextProjectId;
        generation += 1;
      }
    },
    begin(requestProjectId) {
      if (requestProjectId !== projectId) return null;
      generation += 1;
      return generation;
    },
    isCurrent(requestProjectId, ticket) {
      return ticket !== null && requestProjectId === projectId && ticket === generation;
    },
    invalidate() {
      generation += 1;
    },
  });
}
