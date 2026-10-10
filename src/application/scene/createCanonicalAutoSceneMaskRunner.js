import { coreClient } from '../../api/coreClient.js';
import { projectService } from '../../lib/projectService.js';
import { createAutoSceneMaskCoordinator } from './createAutoSceneMaskCoordinator.js';

/**
 * Only Core-verified source-bound MASK ids may be placed on a Project.
 * The discovery model is supplied explicitly; never fall back to the old
 * preview-mask/detection facades or guess a category from box geometry.
 */
export function createCanonicalAutoSceneMaskRunner(provider) {
  return createAutoSceneMaskCoordinator({
    provider,
    persistMask: input => coreClient.artifacts.persistMask(input),
    getProject: projectId => projectService.get(projectId),
    commitObjects: (source,objects) => coreClient.projects.update(source.id,{
      objects,
      expectedSourceArtifactId:source.current_image_artifact_id,
      expectedRevision:source.revision,
    }),
    nextObjectId: () => globalThis.crypto.randomUUID(),
  });
}
