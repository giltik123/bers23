import {
  sceneSourceKey, validateSceneCandidates, sceneObjectFromCanonical,
} from './autoSceneMaskContract.js';

/**
 * Transactional publication of a model's semantic instance masks.
 * No scene model is bundled here; the provider must explicitly advertise the
 * semantic-instance capability. MobileSAM's point-prompt path is NOT sufficient.
 *
 * All instances are individually persisted via Core source-bound MASK endpoints;
 * Project publication uses a source/revision compare-and-swap in Core. Interrupted
 * runs can leave unreferenced MASK artifacts, but never publish a partial scene.
 */
export function createAutoSceneMaskCoordinator({
  provider, persistMask, getProject, commitObjects, nextObjectId,
}) {
  if(typeof persistMask!=='function'||typeof getProject!=='function'||
     typeof commitObjects!=='function'||typeof nextObjectId!=='function')
    throw new Error('Auto scene masks require canonical Core persistence and Project ports');
  let sequence=0;
  const cancel=()=>{sequence++;};
  const sourceIsCurrent=(source,current)=>sceneSourceKey(source)===sceneSourceKey(current);
  const assertCurrent=async(ticket,source)=>{
    if(ticket!==sequence)throw new Error('SCENE_ANALYSIS_CANCELLED');
    const now=await getProject(source.id);
    if(!sourceIsCurrent(source,now)||now.revision!==source.revision)
      throw new Error('SCENE_SOURCE_CHANGED');
  };
  const start=async source=>{
    cancel();
    const ticket=sequence;
    if(!sceneSourceKey(source)||!Number.isSafeInteger(source?.revision))
      return Object.freeze({status:'INVALID_SOURCE',objects:[],message:'Canonical source and revision are unavailable'});
    if(!provider || provider.supportsSemanticInstances!==true ||
       typeof provider.segmentScene!=='function')
      return Object.freeze({status:'MODEL_UNAVAILABLE',objects:[],
        message:'Semantic scene segmentation model is not connected. No masks were invented.'});
    try {
      const available=typeof provider.isAvailable==='function'
        ? await provider.isAvailable() : false;
      if(!available) return Object.freeze({status:'MODEL_UNAVAILABLE',objects:[],
        message:'Semantic scene segmentation model is unavailable or not admitted.'});
      await assertCurrent(ticket,source);
      const payload=await provider.segmentScene(Object.freeze({
        projectId:source.id,sourceArtifactId:source.current_image_artifact_id,
        imageUrl:source.current_image_url,width:source.width,height:source.height,
      }));
      await assertCurrent(ticket,source);
      const admitted=validateSceneCandidates(payload,source);
      if(admitted.instances.length===0)
        return Object.freeze({status:'NO_OBJECTS',objects:[],
          message:'Scene model returned no supported instance masks.'});
      const objects=[];
      for(const candidate of admitted.instances) {
        await assertCurrent(ticket,source);
        const persist=await persistMask({
          projectId:source.id,sourceImageArtifactId:source.current_image_artifact_id,
          width:source.width,height:source.height,alpha:candidate.alpha,
        });
        await assertCurrent(ticket,source);
        objects.push(sceneObjectFromCanonical(candidate,persist,source,nextObjectId()));
      }
      // One Project update, after all MASKs are real and source verified.
      // Keep user's manually edited objects; replace only prior AUTO objects.
      const retained=(Array.isArray(source.objects)?source.objects:[])
        .filter(obj=>obj?.metadata?.segmentation!=='AUTO');
      const merged=[...retained,...objects];
      await assertCurrent(ticket,source);
      await commitObjects(source,merged);
      return Object.freeze({status:'COMPLETED',objects:Object.freeze(objects),
        message:`Сегментация: ${objects.length} масок сохранены в Core.`});
    }catch(error){
      if(error?.message==='SCENE_ANALYSIS_CANCELLED')
        return Object.freeze({status:'CANCELLED',objects:[],message:'Scene analysis cancelled'});
      if(error?.message==='SCENE_SOURCE_CHANGED' ||
         error?.code==='project_source_conflict')
        return Object.freeze({status:'STALE_SOURCE',objects:[],
          message:'Photo, Project or Object list changed. Run scene analysis on the current version.'});
      return Object.freeze({status:'FAILED',objects:[],
        message:error?.message||'Scene segmentation failed'});
    }
  };
  return Object.freeze({start,cancel});
}
