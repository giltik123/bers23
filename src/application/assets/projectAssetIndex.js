// Read-only projection of canonical Project/FINAL state for Asset Library.
// This module does not grant Artifact or Project mutation authority.
export function projectAsset(project) {
  const artifactId = project.current_image_artifact_id;
  return Object.freeze({
    id: `project:${project.id}:${artifactId}`,
    asset_key: `project:${project.id}:${artifactId}`,
    canonical_artifact_id: artifactId,
    project_id: project.id,
    type: 'project',
    name: project.name || 'Untitled project',
    thumbnail: project.thumbnail_url || project.current_image_url,
    preview: project.current_image_url,
    favorite: Boolean(project.favorite),
    tags: Object.freeze(['project', 'canonical artifact']),
    relations: Object.freeze([]),
  });
}

export function projectConfirmedFavorite(requestedAsset, updatedProject) {
  if (!requestedAsset?.project_id || updatedProject?.id !== requestedAsset.project_id) {
    throw new Error('Core Project favorite response does not match the requested Project');
  }
  if (!updatedProject.current_image_artifact_id) {
    throw new Error('Core Project favorite response has no current canonical Artifact');
  }
  return projectAsset(updatedProject);
}

export function selectionAfterFavorite(currentSelection, requestedAssetId, updatedAssetId) {
  return currentSelection === requestedAssetId ? updatedAssetId : currentSelection;
}

export function createLatestAssetLoadGate() {
  let generation = 0;
  return Object.freeze({
    start() { generation += 1; return generation; },
    isCurrent(token) { return token === generation; },
    invalidate() { generation += 1; },
  });
}
