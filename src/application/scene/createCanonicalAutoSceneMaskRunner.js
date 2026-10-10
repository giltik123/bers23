import { coreClient } from '../../api/coreClient.js';
import { projectService } from '../../lib/projectService.js';
import { createAutoSceneMaskCoordinator } from './createAutoSceneMaskCoordinator.js';

/**
 * Only Core-verified source-bound MASK ids may be placed on a Project.
 * The discovery model is supplied explicitly; never fall back to the old
 * preview-mask/detection facades or guess a category from box geometry.
 */
export function createCanonicalAutoSceneMaskRunner(provider) {
  if (!provider) {
    // Production analysis is server-owned: images and FAL credentials never
    // pass through a speculative browser model facade. Core persists masks
    // and atomically publishes the Project objects after exact source CAS.
    let sequence=0;
    return Object.freeze({
      cancel:()=>{sequence++;},
      start:async(source)=>{
        const ticket=++sequence;
        try{
          const capability=await coreClient.scene.capability();
          if(ticket!==sequence)return {status:'CANCELLED',objects:[]};
          if(capability?.supportsSemanticInstances!==true)
            return {status:'MODEL_UNAVAILABLE',objects:[],
              message:'Модель SAM3 не включена на Core; выдуманные маски не создаются.'};
          const result=await coreClient.scene.analyze({
            projectId:source.id,
            sourceArtifactId:source.current_image_artifact_id,
            expectedRevision:source.revision,
          });
          if(ticket!==sequence)return {status:'CANCELLED',objects:[]};
          if(!['COMPLETED','NO_OBJECTS'].includes(result?.status))
            throw new Error('Scene Core response is not an admitted result');
          return result;
        }catch(error){
          if(ticket!==sequence)return {status:'CANCELLED',objects:[]};
          if(error?.code==='project_source_conflict' ||
             error?.status===409)
            return {status:'STALE_SOURCE',objects:[],
              message:'Фотография или версия проекта изменилась.'};
          return {status:'FAILED',objects:[],
            message:error?.message||'Анализ SAM3 не выполнен.'};
        }
      },
    });
  }
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
