import type { ArtifactAuthority } from '../artifacts/artifactAuthority.ts';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';

const GROUP_BY_CATEGORY: Readonly<Record<string,string>>=Object.freeze({
  FACE:'FACE',CLOTHING_UPPER:'CLOTHING',CLOTHING_LOWER:'CLOTHING',
  OUTERWEAR:'CLOTHING',FOOTWEAR:'CLOTHING',DRESS:'CLOTHING',
  ACCESSORY:'ACCESSORY',BACKGROUND:'BACKGROUND',OTHER_OBJECT:'OTHER_OBJECT',
});
const denied=(reason:string)=>Object.assign(new Error(reason),{
  status:400,code:'invalid_auto_scene_objects',
});
const present=(value:unknown,max:number)=>typeof value==='string' && value.length>0 &&
  value.length<=max && value.trim()===value && !/[\u0000-\u001f\u007f]/u.test(value);

/**
 * Core receives no authority from a claimed semantic label. It does verify
 * every published AUTO scene object references a real, signed, source-bound
 * canonical MASK. A model-attestation service is a separate future gate.
 */
export async function assertCanonicalSceneObjectPublication(input: Readonly<{
  objects:unknown; sourceArtifactId:string; sourceStorageId:string;
  scope:AuthenticatedScope & {projectId:string}; artifacts:ArtifactAuthority;
}>): Promise<void> {
  if(!Array.isArray(input.objects)||input.objects.length<1||input.objects.length>256)
    throw denied('Scene Object list must be bounded');
  const modelObjects=input.objects.filter(
    object=>object && typeof object==='object' &&
      (object as any).metadata?.segmentation==='AUTO',
  );
  if(modelObjects.length<1||modelObjects.length>64)
    throw denied('Scene publication requires one to 64 model candidate objects');
  const seenIds=new Set<string>();
  const seenMasks=new Set<string>();
  const source=await input.artifacts.images.loadSource(input.sourceStorageId,input.scope);
  if(!source)throw denied('Canonical scene source is unavailable');
  for(const item of input.objects){
    const value=item as any;
    if(!present(value?.id,256)||seenIds.has(value.id))
      throw denied('Scene Object identity is missing or duplicated');
    seenIds.add(value.id);
  }
  for(const item of modelObjects){
    const obj=item as any,category=obj.category;
    if(!Object.hasOwn(GROUP_BY_CATEGORY,category) ||
       obj.group!==GROUP_BY_CATEGORY[category] ||
       !present(obj.label,120) ||
       !Number.isFinite(obj.confidence) || obj.confidence<0 || obj.confidence>1 ||
       !present(obj.mask_artifact_id,4096) ||
       seenMasks.has(obj.mask_artifact_id) ||
       obj.selected!==false || obj.mask_url ||
       obj.metadata?.maskState!=='CORE_PERSISTED_UNREVIEWED' ||
       obj.metadata?.sourceArtifactId!==input.sourceArtifactId ||
       !present(obj.metadata?.modelId,256) ||
       !present(obj.metadata?.modelVersion,256))
      throw denied('Scene Object lacks validated category, provenance or MASK');
    const box=obj.box;
    if(!box || ![box.x,box.y,box.w,box.h].every(Number.isFinite) ||
       box.x<0 || box.y<0 || box.w<=0 || box.h<=0 ||
       box.x+box.w>1.00000001 || box.y+box.h>1.00000001)
      throw denied('Scene Object bounding box is not in normalized image coordinates');
    let maskClaim;
    try {maskClaim=input.artifacts.external.resolveStoredMask(obj.mask_artifact_id,input.scope);}
    catch {throw denied('Scene Object MASK signature or scope is invalid');}
    const stored=await input.artifacts.masks.load(maskClaim.storageId,input.scope);
    if(!stored || stored.sourceImageStorageId!==input.sourceStorageId ||
       stored.producerOperation!=='LOCAL_SEGMENTATION' ||
       stored.width!==source.width || stored.height!==source.height)
      throw denied('Scene Object MASK is not bound to the exact canonical photo');
    seenMasks.add(obj.mask_artifact_id);
  }
}
