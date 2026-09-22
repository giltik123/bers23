import {
  normalizeHsmeFoundationRuntimeInventoryV1,
} from './HsmeFoundationResourceEvidenceV1';
import {
  HSME_FOUNDATION_PHYSICAL_TARGET_EVIDENCE_BINDING_DIGEST_DOMAIN,
  HSME_FOUNDATION_PHYSICAL_TARGET_EVIDENCE_BINDING_V1_SCHEMA,
  HSME_FOUNDATION_TARGET_DEVICE_ADAPTED_EVIDENCE_DIGEST_DOMAIN,
  type HsmeFoundationPhysicalTargetEvidenceBindingV1,
} from './HsmeFoundationPhysicalTargetEvidenceBindingV1';
import type {HsmeFoundationBenchmarkRunHashPortV1} from './HsmeFoundationBenchmarkRunEvidenceV1';

export const HSME_FOUNDATION_PHYSICAL_REUSE_RUNTIME_OVERLAY_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_PHYSICAL_REUSE_RUNTIME_OVERLAY_V1' as const;
export const HSME_FOUNDATION_PHYSICAL_REUSE_COMPONENT_MAP_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_PHYSICAL_REUSE_COMPONENT_MAP_V1' as const;
export const HSME_FOUNDATION_PHYSICAL_REUSE_COMPONENT_MAP_DIGEST_DOMAIN =
  'bers:hsme:physical-reuse-component-map:v1\0' as const;
export const HSME_FOUNDATION_PHYSICAL_REUSE_RUNTIME_OVERLAY_DIGEST_DOMAIN =
  'bers:hsme:physical-reuse-runtime-overlay:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const CAPABILITIES=Object.freeze(['TEXT_TO_IMAGE','IMAGE_EDITING'] as const);
const ROLES=Object.freeze(['BACKBONE','CONDITIONER','VAE','ADAPTER','OTHER_REQUIRED'] as const);

type Capability=typeof CAPABILITIES[number];
type Role=typeof ROLES[number];

export type HsmeFoundationPhysicalReuseComponentMapEntryV1=Readonly<{
  relativePath:string;
  contentSha256:string;
  bytes:number;
  role:Role;
}>;

export type HsmeFoundationPhysicalReuseComponentMapV1=Readonly<{
  schemaVersion:typeof HSME_FOUNDATION_PHYSICAL_REUSE_COMPONENT_MAP_V1_SCHEMA;
  candidateId:string;
  capability:Capability;
  entries:readonly HsmeFoundationPhysicalReuseComponentMapEntryV1[];
  productionAuthorityGranted:false;
  winnerSelectionAllowed:false;
}>;

export type HsmeFoundationPhysicalReuseRuntimeOverlayStateV1=
  | 'PHYSICAL_RUNTIME_EVIDENCE_INVALID'
  | 'PHYSICAL_RUNTIME_EVIDENCE_READY';

export type HsmeFoundationPhysicalReuseRuntimeOverlayV1=Readonly<{
  schemaVersion:typeof HSME_FOUNDATION_PHYSICAL_REUSE_RUNTIME_OVERLAY_V1_SCHEMA;
  candidateId:string;
  capability:Capability;
  state:HsmeFoundationPhysicalReuseRuntimeOverlayStateV1;
  blockers:readonly string[];
  targetTier:'MOBILE_DEFAULT'|'UNKNOWN';
  backboneBytes:number|'UNKNOWN';
  conditionerBytes:number|'UNKNOWN';
  vaeBytes:number|'UNKNOWN';
  adapterBytes:number|'UNKNOWN';
  otherRequiredBytes:number|'UNKNOWN';
  mandatoryInstalledBytes:number|'UNKNOWN';
  workingMemoryBytes:number|'UNKNOWN';
  runtimeEvidenceSha256:string|'UNKNOWN';
  componentMapSha256:string|'UNKNOWN';
  physicalTargetBindingSha256:string|'UNKNOWN';
  targetEvidenceSha256:string|'UNKNOWN';
  sourceExecutionProfileSha256:string|'UNKNOWN';
  selectedCandidateIdAllowed:false;
  reuseAdvanceAllowed:false;
  fullStudentEscalationAllowed:false;
  modelFleetPromotionAllowed:false;
  installOrDownloadAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
  durableModelFleetPromotionAllowed:false;
  trainingOrDistillationAllowed:false;
  winnerSelectionAllowed:false;
  licenseMutationAllowed:false;
  qualityMutationAllowed:false;
  trainingEvidenceMutationAllowed:false;
  decisionMutationAllowed:false;
}>;

export async function proveHsmeFoundationPhysicalReuseRuntimeOverlayV1(
  physicalBinding:HsmeFoundationPhysicalTargetEvidenceBindingV1,
  candidateId:string,
  capability:Capability,
  rawComponentMap:unknown,
  expectedPhysicalTargetBindingSha256:string,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<HsmeFoundationPhysicalReuseRuntimeOverlayV1>{
  const blockers:string[]=[];
  if(!validIdentifier(candidateId,120))blockers.push('CANDIDATE_ID_INVALID');
  if(!CAPABILITIES.includes(capability))blockers.push('CAPABILITY_INVALID');
  if(!HEX64.test(expectedPhysicalTargetBindingSha256)){
    blockers.push('EXPECTED_PHYSICAL_TARGET_BINDING_DIGEST_INVALID');
  }

  if(physicalBinding.schemaVersion!==HSME_FOUNDATION_PHYSICAL_TARGET_EVIDENCE_BINDING_V1_SCHEMA){
    blockers.push('PHYSICAL_TARGET_BINDING_SCHEMA_INVALID');
  }
  if(physicalBinding.state!=='PHYSICAL_TARGET_EVIDENCE_READY'){
    blockers.push('PHYSICAL_TARGET_EVIDENCE_NOT_READY');
  }
  if(physicalBinding.candidateId!==candidateId)blockers.push('PHYSICAL_TARGET_CANDIDATE_DRIFT');
  if(physicalBinding.capability!==capability)blockers.push('PHYSICAL_TARGET_CAPABILITY_DRIFT');
  if(physicalBinding.physicalTargetBindingSha256==='UNKNOWN'
    ||!HEX64.test(physicalBinding.physicalTargetBindingSha256)){
    blockers.push('PHYSICAL_TARGET_BINDING_DIGEST_INVALID');
  }else if(physicalBinding.physicalTargetBindingSha256!==expectedPhysicalTargetBindingSha256){
    blockers.push('PHYSICAL_TARGET_BINDING_DIGEST_DRIFT');
  }
  if(physicalBinding.targetEvidenceSha256==='UNKNOWN'||!HEX64.test(physicalBinding.targetEvidenceSha256)){
    blockers.push('TARGET_EVIDENCE_DIGEST_INVALID');
  }
  if(physicalBinding.targetEvidence===null){
    blockers.push('TARGET_EVIDENCE_REQUIRED');
  }

  const recomputedBindingSha256=await rehashPhysicalBinding(physicalBinding,hash,blockers);
  if(recomputedBindingSha256!==null
    &&physicalBinding.physicalTargetBindingSha256!=='UNKNOWN'
    &&recomputedBindingSha256!==physicalBinding.physicalTargetBindingSha256){
    blockers.push('PHYSICAL_TARGET_BINDING_REHASH_MISMATCH');
  }

  const target=physicalBinding.targetEvidence;
  if(target===null){
    return invalid(candidateId,capability,blockers,{
      physicalTargetBindingSha256:valueOrUnknown(physicalBinding.physicalTargetBindingSha256),
      targetEvidenceSha256:valueOrUnknown(physicalBinding.targetEvidenceSha256),
    });
  }
  if(target.candidateId!==candidateId)blockers.push('TARGET_EVIDENCE_CANDIDATE_DRIFT');
  if(target.capability!==capability)blockers.push('TARGET_EVIDENCE_CAPABILITY_DRIFT');
  if(target.targetTier!=='MOBILE_DEFAULT')blockers.push('MOBILE_DEFAULT_TARGET_REQUIRED');
  if(target.workingMemoryKind!=='TARGET_PEAK_WORKING_SET_BYTES'){
    blockers.push('TARGET_WORKING_MEMORY_SEMANTIC_INVALID');
  }
  if(!Number.isSafeInteger(target.peakWorkingMemoryBytes)||target.peakWorkingMemoryBytes<1){
    blockers.push('TARGET_WORKING_MEMORY_INVALID');
  }
  if(!HEX64.test(target.sourceExecutionProfileSha256)){
    blockers.push('SOURCE_EXECUTION_PROFILE_DIGEST_INVALID');
  }

  const recomputedTargetEvidenceSha256=await digestValue(
    HSME_FOUNDATION_TARGET_DEVICE_ADAPTED_EVIDENCE_DIGEST_DOMAIN,
    target,
    hash,
    blockers,
    'TARGET_EVIDENCE_REHASH_INVALID',
  );
  if(recomputedTargetEvidenceSha256!==null
    &&physicalBinding.targetEvidenceSha256!=='UNKNOWN'
    &&recomputedTargetEvidenceSha256!==physicalBinding.targetEvidenceSha256){
    blockers.push('TARGET_EVIDENCE_REHASH_MISMATCH');
  }

  let inventory:ReturnType<typeof normalizeHsmeFoundationRuntimeInventoryV1>|null=null;
  try{
    inventory=normalizeHsmeFoundationRuntimeInventoryV1(target.runtimeInventory);
  }catch{
    blockers.push('TARGET_RUNTIME_INVENTORY_INVALID');
  }
  if(inventory===null){
    return invalid(candidateId,capability,blockers,{
      physicalTargetBindingSha256:valueOrUnknown(physicalBinding.physicalTargetBindingSha256),
      targetEvidenceSha256:valueOrUnknown(physicalBinding.targetEvidenceSha256),
      sourceExecutionProfileSha256:valueOrUnknown(target.sourceExecutionProfileSha256),
    });
  }
  if(inventory.candidateId!==candidateId)blockers.push('RUNTIME_INVENTORY_CANDIDATE_DRIFT');

  const componentMap=normalizeComponentMap(rawComponentMap,blockers);
  let componentMapSha256:string|null=null;
  if(componentMap!==null){
    if(componentMap.candidateId!==candidateId)blockers.push('COMPONENT_MAP_CANDIDATE_DRIFT');
    if(componentMap.capability!==capability)blockers.push('COMPONENT_MAP_CAPABILITY_DRIFT');
    validateMapAgainstInventory(componentMap,inventory,blockers);
    componentMapSha256=await digestValue(
      HSME_FOUNDATION_PHYSICAL_REUSE_COMPONENT_MAP_DIGEST_DOMAIN,
      componentMap,
      hash,
      blockers,
      'COMPONENT_MAP_HASH_INVALID',
    );
  }

  const totals=componentMap===null?null:sumRoles(componentMap.entries,blockers);
  const inventoryTotal=sumInventory(inventory.artifacts,blockers);
  if(totals!==null&&inventoryTotal!==null&&totals.mandatoryInstalledBytes!==inventoryTotal){
    blockers.push('MANDATORY_INSTALLED_TOTAL_DRIFT');
  }

  const physicalTargetBindingSha256=valueOrUnknown(physicalBinding.physicalTargetBindingSha256);
  const targetEvidenceSha256=valueOrUnknown(physicalBinding.targetEvidenceSha256);
  const sourceExecutionProfileSha256=valueOrUnknown(target.sourceExecutionProfileSha256);
  const workingMemoryBytes=Number.isSafeInteger(target.peakWorkingMemoryBytes)&&target.peakWorkingMemoryBytes>0
    ?target.peakWorkingMemoryBytes
    :'UNKNOWN';

  let runtimeEvidenceSha256:string|null=null;
  if(blockers.length===0
    &&componentMapSha256!==null
    &&totals!==null
    &&inventoryTotal!==null
    &&workingMemoryBytes!=='UNKNOWN'
    &&physicalTargetBindingSha256!=='UNKNOWN'
    &&targetEvidenceSha256!=='UNKNOWN'
    &&sourceExecutionProfileSha256!=='UNKNOWN'){
    runtimeEvidenceSha256=await digestValue(
      HSME_FOUNDATION_PHYSICAL_REUSE_RUNTIME_OVERLAY_DIGEST_DOMAIN,
      {
        schemaVersion:HSME_FOUNDATION_PHYSICAL_REUSE_RUNTIME_OVERLAY_V1_SCHEMA,
        candidateId,
        capability,
        targetTier:'MOBILE_DEFAULT',
        backboneBytes:totals.backboneBytes,
        conditionerBytes:totals.conditionerBytes,
        vaeBytes:totals.vaeBytes,
        adapterBytes:totals.adapterBytes,
        otherRequiredBytes:totals.otherRequiredBytes,
        mandatoryInstalledBytes:totals.mandatoryInstalledBytes,
        workingMemoryBytes,
        componentMapSha256,
        physicalTargetBindingSha256,
        targetEvidenceSha256,
        sourceExecutionProfileSha256,
        selectedCandidateIdAllowed:false,
        reuseAdvanceAllowed:false,
        fullStudentEscalationAllowed:false,
        productionAuthorityGranted:false,
        trainingOrDistillationAllowed:false,
        winnerSelectionAllowed:false,
      },
      hash,
      blockers,
      'RUNTIME_EVIDENCE_HASH_INVALID',
    );
  }

  if(blockers.length>0||runtimeEvidenceSha256===null||componentMapSha256===null||totals===null){
    return invalid(candidateId,capability,blockers,{
      targetTier:target.targetTier==='MOBILE_DEFAULT'?'MOBILE_DEFAULT':'UNKNOWN',
      ...(totals??{}),
      workingMemoryBytes,
      componentMapSha256:componentMapSha256??'UNKNOWN',
      physicalTargetBindingSha256,
      targetEvidenceSha256,
      sourceExecutionProfileSha256,
    });
  }

  return Object.freeze({
    schemaVersion:HSME_FOUNDATION_PHYSICAL_REUSE_RUNTIME_OVERLAY_V1_SCHEMA,
    candidateId,
    capability,
    state:'PHYSICAL_RUNTIME_EVIDENCE_READY',
    blockers:Object.freeze([]),
    targetTier:'MOBILE_DEFAULT',
    backboneBytes:totals.backboneBytes,
    conditionerBytes:totals.conditionerBytes,
    vaeBytes:totals.vaeBytes,
    adapterBytes:totals.adapterBytes,
    otherRequiredBytes:totals.otherRequiredBytes,
    mandatoryInstalledBytes:totals.mandatoryInstalledBytes,
    workingMemoryBytes,
    runtimeEvidenceSha256,
    componentMapSha256,
    physicalTargetBindingSha256,
    targetEvidenceSha256,
    sourceExecutionProfileSha256,
    ...authorityBoundary(),
  });
}

function normalizeComponentMap(
  raw:unknown,
  blockers:string[],
):HsmeFoundationPhysicalReuseComponentMapV1|null{
  if(raw===null||typeof raw!=='object'||Array.isArray(raw)){
    blockers.push('COMPONENT_MAP_INVALID');
    return null;
  }
  const record=raw as Record<string,unknown>;
  const keys=Object.keys(record).sort();
  const expected=['candidateId','capability','entries','productionAuthorityGranted','schemaVersion','winnerSelectionAllowed'].sort();
  if(keys.length!==expected.length||!keys.every((key,index)=>key===expected[index])){
    blockers.push('COMPONENT_MAP_SHAPE_INVALID');
    return null;
  }
  if(record.schemaVersion!==HSME_FOUNDATION_PHYSICAL_REUSE_COMPONENT_MAP_V1_SCHEMA){
    blockers.push('COMPONENT_MAP_SCHEMA_INVALID');
  }
  if(record.productionAuthorityGranted!==false||record.winnerSelectionAllowed!==false){
    blockers.push('COMPONENT_MAP_AUTHORITY_INVALID');
  }
  const candidate=typeof record.candidateId==='string'?record.candidateId:'';
  const capability=record.capability as Capability;
  if(!validIdentifier(candidate,120))blockers.push('COMPONENT_MAP_CANDIDATE_INVALID');
  if(!CAPABILITIES.includes(capability))blockers.push('COMPONENT_MAP_CAPABILITY_INVALID');
  if(!Array.isArray(record.entries)||record.entries.length<1||record.entries.length>4096){
    blockers.push('COMPONENT_MAP_ENTRY_COUNT_INVALID');
    return null;
  }

  const entries:HsmeFoundationPhysicalReuseComponentMapEntryV1[]=[];
  const seen=new Set<string>();
  let previousPath:string|null=null;
  for(let index=0;index<record.entries.length;index+=1){
    const value=record.entries[index];
    if(value===null||typeof value!=='object'||Array.isArray(value)){
      blockers.push('COMPONENT_MAP_ENTRY_INVALID');
      continue;
    }
    const item=value as Record<string,unknown>;
    const itemKeys=Object.keys(item).sort();
    const itemExpected=['bytes','contentSha256','relativePath','role'].sort();
    if(itemKeys.length!==itemExpected.length||!itemKeys.every((key,i)=>key===itemExpected[i])){
      blockers.push('COMPONENT_MAP_ENTRY_SHAPE_INVALID');
      continue;
    }
    const relativePath=typeof item.relativePath==='string'?item.relativePath:'';
    const contentSha256=typeof item.contentSha256==='string'?item.contentSha256:'';
    const bytes=item.bytes;
    const role=item.role as Role;
    if(!safeRelativePath(relativePath))blockers.push('COMPONENT_MAP_PATH_INVALID');
    if(!HEX64.test(contentSha256))blockers.push('COMPONENT_MAP_CONTENT_DIGEST_INVALID');
    if(!Number.isSafeInteger(bytes)||Number(bytes)<1)blockers.push('COMPONENT_MAP_BYTES_INVALID');
    if(!ROLES.includes(role))blockers.push('COMPONENT_MAP_ROLE_INVALID');
    if(seen.has(relativePath))blockers.push('COMPONENT_MAP_DUPLICATE_PATH');
    seen.add(relativePath);
    if(previousPath!==null&&relativePath.localeCompare(previousPath)<0){
      blockers.push('COMPONENT_MAP_ORDER_INVALID');
    }
    previousPath=relativePath;
    if(safeRelativePath(relativePath)
      &&HEX64.test(contentSha256)
      &&Number.isSafeInteger(bytes)
      &&Number(bytes)>=1
      &&ROLES.includes(role)){
      entries.push(Object.freeze({
        relativePath,
        contentSha256,
        bytes:Number(bytes),
        role,
      }));
    }
  }
  if(entries.length!==record.entries.length)return null;
  return Object.freeze({
    schemaVersion:HSME_FOUNDATION_PHYSICAL_REUSE_COMPONENT_MAP_V1_SCHEMA,
    candidateId:candidate,
    capability,
    entries:Object.freeze(entries),
    productionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  });
}

function validateMapAgainstInventory(
  componentMap:HsmeFoundationPhysicalReuseComponentMapV1,
  inventory:ReturnType<typeof normalizeHsmeFoundationRuntimeInventoryV1>,
  blockers:string[],
):void{
  if(componentMap.entries.length!==inventory.artifacts.length){
    blockers.push('COMPONENT_MAP_INVENTORY_COUNT_MISMATCH');
  }
  const max=Math.max(componentMap.entries.length,inventory.artifacts.length);
  for(let index=0;index<max;index+=1){
    const mapped=componentMap.entries[index];
    const artifact=inventory.artifacts[index];
    if(!mapped){
      blockers.push('COMPONENT_MAP_ARTIFACT_MISSING');
      continue;
    }
    if(!artifact){
      blockers.push('COMPONENT_MAP_EXTRA_ARTIFACT');
      continue;
    }
    if(artifact.bytes===0)blockers.push('RUNTIME_INVENTORY_ZERO_BYTE_ARTIFACT');
    if(mapped.relativePath!==artifact.relativePath)blockers.push('COMPONENT_MAP_PATH_DRIFT');
    if(mapped.contentSha256!==artifact.contentSha256)blockers.push('COMPONENT_MAP_HASH_DRIFT');
    if(mapped.bytes!==artifact.bytes)blockers.push('COMPONENT_MAP_BYTES_DRIFT');
  }
}

function sumRoles(
  entries:readonly HsmeFoundationPhysicalReuseComponentMapEntryV1[],
  blockers:string[],
):Readonly<{
  backboneBytes:number;
  conditionerBytes:number;
  vaeBytes:number;
  adapterBytes:number;
  otherRequiredBytes:number;
  mandatoryInstalledBytes:number;
}>|null{
  const totals:Record<Role,number>={
    BACKBONE:0,
    CONDITIONER:0,
    VAE:0,
    ADAPTER:0,
    OTHER_REQUIRED:0,
  };
  let mandatory=0;
  for(const entry of entries){
    const roleTotal=safeAdd(totals[entry.role],entry.bytes);
    const allTotal=safeAdd(mandatory,entry.bytes);
    if(roleTotal===null||allTotal===null){
      blockers.push('COMPONENT_MAP_BYTE_SUM_OVERFLOW');
      return null;
    }
    totals[entry.role]=roleTotal;
    mandatory=allTotal;
  }
  return Object.freeze({
    backboneBytes:totals.BACKBONE,
    conditionerBytes:totals.CONDITIONER,
    vaeBytes:totals.VAE,
    adapterBytes:totals.ADAPTER,
    otherRequiredBytes:totals.OTHER_REQUIRED,
    mandatoryInstalledBytes:mandatory,
  });
}

function sumInventory(
  artifacts:readonly Readonly<{bytes:number}>[],
  blockers:string[],
):number|null{
  let total=0;
  for(const artifact of artifacts){
    if(!Number.isSafeInteger(artifact.bytes)||artifact.bytes<1){
      blockers.push('RUNTIME_INVENTORY_BYTES_INVALID');
      return null;
    }
    const next=safeAdd(total,artifact.bytes);
    if(next===null){
      blockers.push('RUNTIME_INVENTORY_BYTE_SUM_OVERFLOW');
      return null;
    }
    total=next;
  }
  return total;
}

async function rehashPhysicalBinding(
  binding:HsmeFoundationPhysicalTargetEvidenceBindingV1,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
  blockers:string[],
):Promise<string|null>{
  if(binding.deviceCapabilityKey==='UNKNOWN'
    ||binding.benchmarkEvidenceKey==='UNKNOWN'
    ||binding.measurementCaptureSha256==='UNKNOWN'
    ||binding.targetEvidenceSha256==='UNKNOWN'
    ||binding.physicalRunPayloadSha256==='UNKNOWN'){
    blockers.push('PHYSICAL_TARGET_BINDING_INPUT_DIGEST_REQUIRED');
    return null;
  }
  return digestValue(
    HSME_FOUNDATION_PHYSICAL_TARGET_EVIDENCE_BINDING_DIGEST_DOMAIN,
    {
      schemaVersion:HSME_FOUNDATION_PHYSICAL_TARGET_EVIDENCE_BINDING_V1_SCHEMA,
      candidateId:binding.candidateId,
      capability:binding.capability,
      deviceCapabilityKey:binding.deviceCapabilityKey,
      benchmarkEvidenceKey:binding.benchmarkEvidenceKey,
      measurementCaptureSha256:binding.measurementCaptureSha256,
      targetEvidenceSha256:binding.targetEvidenceSha256,
      physicalRunPayloadSha256:binding.physicalRunPayloadSha256,
      selectedCandidateIdAllowed:false,
      reuseAdvanceAllowed:false,
      fullStudentEscalationAllowed:false,
      productionAuthorityGranted:false,
      winnerSelectionAllowed:false,
    },
    hash,
    blockers,
    'PHYSICAL_TARGET_BINDING_REHASH_INVALID',
  );
}

async function digestValue(
  domain:string,
  value:unknown,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
  blockers:string[],
  blocker:string,
):Promise<string|null>{
  try{
    const result=await hash.sha256(new TextEncoder().encode(domain+JSON.stringify(value)));
    if(!HEX64.test(result))throw new Error('hash invalid');
    return result;
  }catch{
    blockers.push(blocker);
    return null;
  }
}

function safeAdd(left:number,right:number):number|null{
  if(!Number.isSafeInteger(left)||!Number.isSafeInteger(right)||left<0||right<0)return null;
  if(right>Number.MAX_SAFE_INTEGER-left)return null;
  return left+right;
}

function safeRelativePath(value:string):boolean{
  if(value.length<1||value.length>512||value.startsWith('/')||value.includes('\\'))return false;
  const parts=value.split('/');
  return parts.every(part=>part.length>0&&part!=='.'&&part!=='..'&&!/[\u0000-\u001f\u007f]/.test(part));
}

function validIdentifier(value:string,max:number):boolean{
  return value.length>0&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value);
}

function valueOrUnknown(value:string):string|'UNKNOWN'{
  return HEX64.test(value)?value:'UNKNOWN';
}

function authorityBoundary(){
  return Object.freeze({
    selectedCandidateIdAllowed:false as const,
    reuseAdvanceAllowed:false as const,
    fullStudentEscalationAllowed:false as const,
    modelFleetPromotionAllowed:false as const,
    installOrDownloadAllowed:false as const,
    productionAuthorityGranted:false as const,
    providerAuthorityGranted:false as const,
    billingAuthorityGranted:false as const,
    projectArtifactMutationAllowed:false as const,
    aeeExecutionAuthorityGranted:false as const,
    durableModelFleetPromotionAllowed:false as const,
    trainingOrDistillationAllowed:false as const,
    winnerSelectionAllowed:false as const,
    licenseMutationAllowed:false as const,
    qualityMutationAllowed:false as const,
    trainingEvidenceMutationAllowed:false as const,
    decisionMutationAllowed:false as const,
  });
}

function invalid(
  candidateId:string,
  capability:Capability,
  blockers:readonly string[],
  values:Partial<Pick<
    HsmeFoundationPhysicalReuseRuntimeOverlayV1,
    'targetTier'|'backboneBytes'|'conditionerBytes'|'vaeBytes'|'adapterBytes'|'otherRequiredBytes'|
    'mandatoryInstalledBytes'|'workingMemoryBytes'|'componentMapSha256'|'physicalTargetBindingSha256'|
    'targetEvidenceSha256'|'sourceExecutionProfileSha256'
  >>={},
):HsmeFoundationPhysicalReuseRuntimeOverlayV1{
  return Object.freeze({
    schemaVersion:HSME_FOUNDATION_PHYSICAL_REUSE_RUNTIME_OVERLAY_V1_SCHEMA,
    candidateId,
    capability,
    state:'PHYSICAL_RUNTIME_EVIDENCE_INVALID',
    blockers:Object.freeze([...new Set(blockers)]),
    targetTier:values.targetTier??'UNKNOWN',
    backboneBytes:values.backboneBytes??'UNKNOWN',
    conditionerBytes:values.conditionerBytes??'UNKNOWN',
    vaeBytes:values.vaeBytes??'UNKNOWN',
    adapterBytes:values.adapterBytes??'UNKNOWN',
    otherRequiredBytes:values.otherRequiredBytes??'UNKNOWN',
    mandatoryInstalledBytes:values.mandatoryInstalledBytes??'UNKNOWN',
    workingMemoryBytes:values.workingMemoryBytes??'UNKNOWN',
    runtimeEvidenceSha256:'UNKNOWN',
    componentMapSha256:values.componentMapSha256??'UNKNOWN',
    physicalTargetBindingSha256:values.physicalTargetBindingSha256??'UNKNOWN',
    targetEvidenceSha256:values.targetEvidenceSha256??'UNKNOWN',
    sourceExecutionProfileSha256:values.sourceExecutionProfileSha256??'UNKNOWN',
    ...authorityBoundary(),
  });
}
