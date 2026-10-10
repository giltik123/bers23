/**
 * Automatic scene segmentation v1 — canonical candidate admission contract.
 * A semantic label or a bounding box is NOT a MASK. Only an original-space,
 * nonempty per-instance alpha raster may enter Core MASK persistence.
 *
 * No browser authority for model admission or Core FINAL; this function only
 * checks the shape of evidence before submitting to the server.
 */
export const SCENE_GROUPS = Object.freeze([
  'FACE', 'CLOTHING', 'ACCESSORY', 'BACKGROUND', 'OTHER_OBJECT',
]);
export const SCENE_CATEGORIES = Object.freeze({
  FACE: 'FACE',
  CLOTHING_UPPER: 'CLOTHING', CLOTHING_LOWER: 'CLOTHING',
  OUTERWEAR: 'CLOTHING', FOOTWEAR: 'CLOTHING', DRESS: 'CLOTHING',
  ACCESSORY: 'ACCESSORY', BACKGROUND: 'BACKGROUND',
  OTHER_OBJECT: 'OTHER_OBJECT',
});
export const SCENE_LABELS = Object.freeze({
  FACE:'Лицо', CLOTHING:'Одежда', ACCESSORY:'Аксессуары',
  BACKGROUND:'Фон', OTHER_OBJECT:'Прочие предметы',
});
const MAX_INSTANCES=64;
const MAX_PIXELS=24_000_000;
const MAX_TOTAL_MASK_BYTES=96_000_000;
const MAX_REF=4096;
const MAX_ID=256;

const safeIdentity = (s, max=MAX_ID) =>
  typeof s==='string' && s.length>0 && s.length<=max && s.trim()===s &&
  !/[\u0000-\u001f\u007f]/u.test(s);

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value>0;
}
export function sceneSourceKey(project) {
  return safeIdentity(project?.id) && safeIdentity(project?.current_image_artifact_id,MAX_REF)
    ? JSON.stringify([project.id,project.current_image_artifact_id,project.width,project.height])
    : null;
}

function boundsFromMask(alpha,width,height) {
  let x0=width,y0=height,x1=-1,y1=-1,coverage=0;
  for(let i=0;i<alpha.length;i++) {
    if(alpha[i]===0)continue;
    const x=i%width,y=Math.floor(i/width);
    if(x<x0)x0=x;if(y<y0)y0=y;
    if(x>x1)x1=x;if(y>y1)y1=y;coverage++;
  }
  if(coverage===0 || coverage===alpha.length) {
    throw new Error('Scene candidate mask is empty or covers the full frame');
  }
  return Object.freeze({
    box:Object.freeze({x:x0/width,y:y0/height,w:(x1+1-x0)/width,h:(y1+1-y0)/height}),
    coverage:coverage/alpha.length,
  });
}

export function validateSceneCandidates(payload, source) {
  if(!sceneSourceKey(source))throw new Error('A canonical Project image is required');
  const {width,height}=source;
  if(!positiveInteger(width)||!positiveInteger(height)||width*height>MAX_PIXELS)
    throw new Error('Scene source raster geometry is unavailable or too large');
  if(!payload||typeof payload!=='object' || payload.projectId!==source.id ||
     payload.sourceArtifactId!==source.current_image_artifact_id ||
     payload.width!==width||payload.height!==height)
    throw new Error('Scene model evidence is not bound to the canonical source');
  if(!safeIdentity(payload.modelId)||!safeIdentity(payload.modelVersion))
    throw new Error('Scene model identity is absent; masks cannot be trusted');
  if(!Array.isArray(payload.instances) || payload.instances.length>MAX_INSTANCES)
    throw new Error('Scene model must return a bounded list of instances');
  const accepted=[];
  const groups=new Set();
  let totalMaskBytes=0;
  for(const candidate of payload.instances) {
    if(!candidate || typeof candidate!=='object' ||
       !Object.hasOwn(SCENE_CATEGORIES,candidate.category) ||
       !safeIdentity(candidate.label,120) ||
       !(candidate.alpha instanceof Uint8Array) ||
       candidate.alpha.byteLength!==width*height ||
       !Number.isFinite(candidate.confidence) ||
       candidate.confidence<0||candidate.confidence>1)
      throw new Error('Scene instance has invalid category, confidence or alpha raster');
    totalMaskBytes+=candidate.alpha.byteLength;
    if(totalMaskBytes>MAX_TOTAL_MASK_BYTES)
      throw new Error('Scene candidate masks exceed the aggregate memory budget');
    const {box,coverage}=boundsFromMask(candidate.alpha,width,height);
    // Duplicate semantic object keys may represent multiple actual instances.
    // Distinguish instances at persistence via generated Object IDs.
    groups.add(SCENE_CATEGORIES[candidate.category]);
    accepted.push(Object.freeze({
      category:candidate.category,
      group:SCENE_CATEGORIES[candidate.category],
      label:candidate.label,
      confidence:candidate.confidence,
      alpha:new Uint8Array(candidate.alpha),
      box,coverage,
      modelId:payload.modelId,modelVersion:payload.modelVersion,
    }));
  }
  return Object.freeze({
    projectId:source.id,sourceArtifactId:source.current_image_artifact_id,
    width,height,instances:Object.freeze(accepted),discoveredGroups:Object.freeze([...groups]),
  });
}

/** Store only canonical references. No guessed masks or provider pixel blobs in Project JSON. */
export function sceneObjectFromCanonical(candidate, persisted, source, objectId) {
  if(!safeIdentity(objectId)||!safeIdentity(persisted?.artifactId,MAX_REF) ||
     persisted.role!=='MASK' || persisted.state!=='AVAILABLE' ||
     persisted.coordinateSpace!=='ORIGINAL' ||
     persisted.sourceImageArtifactId!==source.current_image_artifact_id)
    throw new Error('Core did not return a source-bound canonical MASK');
  return Object.freeze({
    id:objectId,type:'object',label:candidate.label,category:candidate.category,
    group:candidate.group,confidence:candidate.confidence,selected:false,
    editable:true,parent_object:null,children:[],box:candidate.box,
    mask_artifact_id:persisted.artifactId,mask_url:null,
    metadata:Object.freeze({
      segmentation:'AUTO',modelId:candidate.modelId,
      modelVersion:candidate.modelVersion,
      sourceArtifactId:source.current_image_artifact_id,
      maskState:'CORE_PERSISTED_UNREVIEWED',
    }),
  });
}
