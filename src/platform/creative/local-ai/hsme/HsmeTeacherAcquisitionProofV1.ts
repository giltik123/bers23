import {
  hsmeTeacherArtifactManifestDigestV1,
  normalizeHsmeTeacherArtifactManifestV1,
  normalizeHsmeTeacherArtifactSourceV1,
  type HsmeTeacherArtifactManifestV1,
  type HsmeTeacherArtifactSourceV1,
} from './HsmeTeacherArtifactManifestV1';
import type {HsmeTrainingHashPortV1} from './HsmeTrainingProvenanceV1';

export const HSME_TEACHER_ACQUISITION_PROOF_V1_SCHEMA =
  'BERS_HSME_TEACHER_ACQUISITION_PROOF_V1' as const;
export const HSME_TEACHER_PIN_REQUEST_SET_V1_SCHEMA =
  'BERS_HSME_TEACHER_ACQUISITION_PIN_REQUEST_SET_V1' as const;
export const HSME_TEACHER_ACQUISITION_PLAN_V1_SCHEMA =
  'BERS_HSME_TEACHER_ACQUISITION_PLAN_V1' as const;
export const HSME_TEACHER_PLAN_EXPANSION_EVIDENCE_V1_SCHEMA =
  'BERS_HSME_TEACHER_ACQUISITION_PLAN_EXPANSION_EVIDENCE_V1' as const;
export const HSME_TEACHER_BYTE_ACQUISITION_EVIDENCE_V1_SCHEMA =
  'BERS_HSME_TEACHER_ACQUISITION_EVIDENCE_V1' as const;

export const HSME_TEACHER_PIN_REQUEST_SET_DIGEST_DOMAIN =
  'bers:hsme:teacher-acquisition-pin-request-set:v1\0' as const;
export const HSME_TEACHER_ACQUISITION_PLAN_DIGEST_DOMAIN =
  'bers:hsme:teacher-acquisition-plan:v1\0' as const;
export const HSME_TEACHER_PLAN_EXPANSION_EVIDENCE_DIGEST_DOMAIN =
  'bers:hsme:teacher-acquisition-plan-expansion-evidence:v1\0' as const;
export const HSME_TEACHER_BYTE_ACQUISITION_EVIDENCE_DIGEST_DOMAIN =
  'bers:hsme:teacher-acquisition-byte-evidence:v1\0' as const;
export const HSME_TEACHER_ACQUISITION_PROOF_DIGEST_DOMAIN =
  'bers:hsme:teacher-acquisition-proof:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[a-z0-9][a-z0-9._:@/-]*$/;
const CAPABILITIES=Object.freeze(['TEXT_TO_IMAGE','IMAGE_EDITING','MULTI_REFERENCE_EDITING'] as const);
const ROOT_KINDS=Object.freeze(['FILE','DIRECTORY'] as const);
const ROOT_ROLES=Object.freeze([
  'MODEL_CONFIG','SCHEDULER_ASSET','TEXT_ENCODER','TOKENIZER_ASSET',
  'PROCESSOR_ASSET','DENOISER','VAE',
] as const);
const PLAN_ROLES=Object.freeze([
  'DENOISER_WEIGHT','TEXT_ENCODER_WEIGHT','VAE_WEIGHT','MODEL_CONFIG',
  'TOKENIZER_ASSET','SCHEDULER_ASSET','RUNTIME_ASSET',
] as const);

type Capability=typeof CAPABILITIES[number];
type RootKind=typeof ROOT_KINDS[number];
type RootRole=typeof ROOT_ROLES[number];
type PlanRole=typeof PLAN_ROLES[number];

export type HsmeTeacherAcquisitionComponentRootV1=Readonly<{
  componentId:string;
  relativePath:string;
  kind:RootKind;
  role:RootRole;
}>;

export type HsmeTeacherAcquisitionPinRequestV1=Readonly<{
  teacherCandidateId:string;
  source:HsmeTeacherArtifactSourceV1;
  requestedCapabilities:readonly Capability[];
  componentRoots:readonly HsmeTeacherAcquisitionComponentRootV1[];
  publicMetadataLicenseId:string;
  rightsConclusion:'REVIEW_REQUIRED';
  distillationOutputUse:'REVIEW_REQUIRED';
  qualityGateStatus:'UNMEASURED';
  teacherAdmissionAllowed:false;
  trainingStartAllowed:false;
}>;

export type HsmeTeacherAcquisitionPinRequestSetV1=Readonly<{
  schemaVersion:typeof HSME_TEACHER_PIN_REQUEST_SET_V1_SCHEMA;
  requestSetId:string;
  requests:readonly HsmeTeacherAcquisitionPinRequestV1[];
  qualityPolicy:'QUALITY_FLOOR_BEFORE_EFFICIENCY';
  teacherAdmissionAllowed:false;
  trainingStartAllowed:false;
  productionAuthorityGranted:false;
}>;

export type HsmeTeacherAcquisitionPlanArtifactV1=Readonly<{
  logicalId:string;
  source:HsmeTeacherArtifactSourceV1;
  relativePath:string;
  role:PlanRole;
  runtimeRequired:true;
}>;

export type HsmeTeacherAcquisitionPlanV1=Readonly<{
  schemaVersion:typeof HSME_TEACHER_ACQUISITION_PLAN_V1_SCHEMA;
  teacherCandidateId:string;
  primarySource:HsmeTeacherArtifactSourceV1;
  sources:readonly Readonly<{
    source:HsmeTeacherArtifactSourceV1;
    materializedSubdir:string;
  }>[];
  artifacts:readonly HsmeTeacherAcquisitionPlanArtifactV1[];
}>;

export type HsmeTeacherPlanExpansionEvidenceV1=Readonly<{
  schemaVersion:typeof HSME_TEACHER_PLAN_EXPANSION_EVIDENCE_V1_SCHEMA;
  teacherCandidateId:string;
  source:HsmeTeacherArtifactSourceV1;
  pinRequestSetSha256:string;
  planSha256:string;
  artifactCount:number;
  componentRootCount:number;
  networkAccessPerformed:false;
  deserializationPerformed:false;
  teacherAdmissionAllowed:false;
  trainingStartAllowed:false;
  productionAuthorityGranted:false;
}>;

export type HsmeTeacherByteAcquisitionEvidenceV1=Readonly<{
  schemaVersion:typeof HSME_TEACHER_BYTE_ACQUISITION_EVIDENCE_V1_SCHEMA;
  teacherCandidateId:string;
  planDigest:string;
  manifestDigest:string;
  artifactCount:number;
  sourceCount:number;
  matchesExpectedManifest:boolean|null;
  hashBeforeDeserialization:true;
  deserializationPerformed:false;
  modelRepositoryRuntimeCodeExecuted:false;
  binaryPayloadPublished:false;
  runtimeAuthorityGranted:false;
}>;

export interface HsmeTeacherAcquisitionProofOriginVerifierV1{
  verifyPlanExpansionEvidence(
    evidence:HsmeTeacherPlanExpansionEvidenceV1,
    expectedSha256:string,
  ):Promise<boolean>;
  verifyByteAcquisitionEvidence(
    evidence:HsmeTeacherByteAcquisitionEvidenceV1,
    expectedSha256:string,
  ):Promise<boolean>;
}

export type HsmeTeacherAcquisitionProofStateV1=
  | 'ACQUISITION_EVIDENCE_INVALID'
  | 'ACQUISITION_EVIDENCE_READY';

export type HsmeTeacherAcquisitionProofV1=Readonly<{
  schemaVersion:typeof HSME_TEACHER_ACQUISITION_PROOF_V1_SCHEMA;
  state:HsmeTeacherAcquisitionProofStateV1;
  blockers:readonly string[];
  teacherCandidateId:string;
  source:HsmeTeacherArtifactSourceV1|null;
  pinRequestSetSha256:string|'UNKNOWN';
  planSha256:string|'UNKNOWN';
  planExpansionEvidenceSha256:string|'UNKNOWN';
  manifestSha256:string|'UNKNOWN';
  byteAcquisitionEvidenceSha256:string|'UNKNOWN';
  artifactCount:number|'UNKNOWN';
  sourceCount:number|'UNKNOWN';
  acquisitionProofSha256:string|'UNKNOWN';
  rightsConclusion:'REVIEW_REQUIRED';
  distillationOutputUse:'REVIEW_REQUIRED';
  qualityGateStatus:'UNMEASURED';
  teacherAdmissionAllowed:false;
  trainingStartAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
  modelFleetPromotionAllowed:false;
}>;

export async function proveHsmeTeacherAcquisitionV1(
  rawPinRequestSet:unknown,
  rawPlan:unknown,
  rawPlanExpansionEvidence:unknown,
  rawManifest:unknown,
  rawByteAcquisitionEvidence:unknown,
  origin:HsmeTeacherAcquisitionProofOriginVerifierV1,
  hash:HsmeTrainingHashPortV1,
):Promise<HsmeTeacherAcquisitionProofV1>{
  const blockers:string[]=[];

  let requestSet:HsmeTeacherAcquisitionPinRequestSetV1;
  let plan:HsmeTeacherAcquisitionPlanV1;
  let expansion:HsmeTeacherPlanExpansionEvidenceV1;
  let manifest:HsmeTeacherArtifactManifestV1;
  let acquisition:HsmeTeacherByteAcquisitionEvidenceV1;
  try{
    requestSet=normalizePinRequestSet(rawPinRequestSet);
    plan=normalizePlan(rawPlan);
    expansion=normalizeExpansionEvidence(rawPlanExpansionEvidence);
    manifest=normalizeHsmeTeacherArtifactManifestV1(rawManifest);
    acquisition=normalizeByteAcquisitionEvidence(rawByteAcquisitionEvidence);
  }catch{
    return invalid('UNKNOWN',['ACQUISITION_INPUT_NORMALIZATION_FAILED']);
  }

  const candidateId=plan.teacherCandidateId;
  const requests=requestSet.requests.filter(value=>value.teacherCandidateId===candidateId);
  if(requests.length!==1){
    blockers.push('ACQUISITION_PIN_REQUEST_LOOKUP_INVALID');
    return invalid(candidateId,blockers);
  }
  const request=requests[0];

  if(!sameSource(plan.primarySource,request.source)){
    blockers.push('ACQUISITION_PLAN_PRIMARY_SOURCE_DRIFT');
  }
  if(plan.sources.length!==1||!sameSource(plan.sources[0]?.source,request.source)){
    blockers.push('ACQUISITION_PLAN_SOURCE_SET_DRIFT');
  }
  if(expansion.teacherCandidateId!==candidateId||!sameSource(expansion.source,request.source)){
    blockers.push('ACQUISITION_EXPANSION_IDENTITY_DRIFT');
  }
  if(manifest.teacherCandidateId!==candidateId||!sameSource(manifest.primarySource,request.source)){
    blockers.push('ACQUISITION_MANIFEST_IDENTITY_DRIFT');
  }
  if(acquisition.teacherCandidateId!==candidateId){
    blockers.push('ACQUISITION_BYTE_EVIDENCE_IDENTITY_DRIFT');
  }

  validatePlanCoverage(request,plan,blockers);
  validateManifestMatchesPlan(plan,manifest,blockers);

  let pinRequestSetSha256:string|'UNKNOWN'='UNKNOWN';
  let planSha256:string|'UNKNOWN'='UNKNOWN';
  let expansionEvidenceSha256:string|'UNKNOWN'='UNKNOWN';
  let manifestSha256:string|'UNKNOWN'='UNKNOWN';
  let byteEvidenceSha256:string|'UNKNOWN'='UNKNOWN';

  try{
    pinRequestSetSha256=await domainDigest(
      HSME_TEACHER_PIN_REQUEST_SET_DIGEST_DOMAIN,requestSet,hash,
    );
    if(expansion.pinRequestSetSha256!==pinRequestSetSha256){
      blockers.push('ACQUISITION_PIN_REQUEST_DIGEST_DRIFT');
    }
  }catch{
    blockers.push('ACQUISITION_PIN_REQUEST_HASH_INVALID');
  }

  try{
    planSha256=await domainDigest(HSME_TEACHER_ACQUISITION_PLAN_DIGEST_DOMAIN,plan,hash);
    if(expansion.planSha256!==planSha256||acquisition.planDigest!==planSha256){
      blockers.push('ACQUISITION_PLAN_DIGEST_DRIFT');
    }
  }catch{
    blockers.push('ACQUISITION_PLAN_HASH_INVALID');
  }

  try{
    manifestSha256=await hsmeTeacherArtifactManifestDigestV1(manifest,hash);
    if(acquisition.manifestDigest!==manifestSha256){
      blockers.push('ACQUISITION_MANIFEST_DIGEST_DRIFT');
    }
  }catch{
    blockers.push('ACQUISITION_MANIFEST_HASH_INVALID');
  }

  if(expansion.artifactCount!==plan.artifacts.length
    ||acquisition.artifactCount!==plan.artifacts.length
    ||manifest.artifacts.length!==plan.artifacts.length){
    blockers.push('ACQUISITION_ARTIFACT_COUNT_DRIFT');
  }
  if(expansion.componentRootCount!==request.componentRoots.length){
    blockers.push('ACQUISITION_COMPONENT_ROOT_COUNT_DRIFT');
  }
  if(acquisition.sourceCount!==plan.sources.length){
    blockers.push('ACQUISITION_SOURCE_COUNT_DRIFT');
  }
  if(acquisition.matchesExpectedManifest===false){
    blockers.push('ACQUISITION_EXPECTED_MANIFEST_MISMATCH');
  }

  try{
    expansionEvidenceSha256=await domainDigest(
      HSME_TEACHER_PLAN_EXPANSION_EVIDENCE_DIGEST_DOMAIN,expansion,hash,
    );
    let trusted=false;
    try{
      trusted=await origin.verifyPlanExpansionEvidence(expansion,expansionEvidenceSha256);
    }catch{
      trusted=false;
    }
    if(!trusted)blockers.push('ACQUISITION_EXPANSION_ORIGIN_UNVERIFIED');
  }catch{
    blockers.push('ACQUISITION_EXPANSION_HASH_INVALID');
  }

  try{
    byteEvidenceSha256=await domainDigest(
      HSME_TEACHER_BYTE_ACQUISITION_EVIDENCE_DIGEST_DOMAIN,acquisition,hash,
    );
    let trusted=false;
    try{
      trusted=await origin.verifyByteAcquisitionEvidence(acquisition,byteEvidenceSha256);
    }catch{
      trusted=false;
    }
    if(!trusted)blockers.push('ACQUISITION_BYTE_ORIGIN_UNVERIFIED');
  }catch{
    blockers.push('ACQUISITION_BYTE_EVIDENCE_HASH_INVALID');
  }

  if(blockers.length>0){
    return invalid(candidateId,blockers,{
      source:request.source,
      pinRequestSetSha256,
      planSha256,
      planExpansionEvidenceSha256:expansionEvidenceSha256,
      manifestSha256,
      byteAcquisitionEvidenceSha256:byteEvidenceSha256,
      artifactCount:plan.artifacts.length,
      sourceCount:plan.sources.length,
    });
  }

  const acquisitionProofSha256=await domainDigest(
    HSME_TEACHER_ACQUISITION_PROOF_DIGEST_DOMAIN,
    {
      schemaVersion:HSME_TEACHER_ACQUISITION_PROOF_V1_SCHEMA,
      teacherCandidateId:candidateId,
      source:request.source,
      pinRequestSetSha256,
      planSha256,
      planExpansionEvidenceSha256:expansionEvidenceSha256,
      manifestSha256,
      byteAcquisitionEvidenceSha256:byteEvidenceSha256,
      artifactCount:plan.artifacts.length,
      sourceCount:plan.sources.length,
      rightsConclusion:'REVIEW_REQUIRED',
      distillationOutputUse:'REVIEW_REQUIRED',
      qualityGateStatus:'UNMEASURED',
      teacherAdmissionAllowed:false,
      trainingStartAllowed:false,
      productionAuthorityGranted:false,
    },
    hash,
  );

  return Object.freeze({
    schemaVersion:HSME_TEACHER_ACQUISITION_PROOF_V1_SCHEMA,
    state:'ACQUISITION_EVIDENCE_READY',
    blockers:Object.freeze([]),
    teacherCandidateId:candidateId,
    source:request.source,
    pinRequestSetSha256,
    planSha256,
    planExpansionEvidenceSha256:expansionEvidenceSha256,
    manifestSha256,
    byteAcquisitionEvidenceSha256:byteEvidenceSha256,
    artifactCount:plan.artifacts.length,
    sourceCount:plan.sources.length,
    acquisitionProofSha256,
    ...authorityBoundary(),
  });
}

function normalizePinRequestSet(raw:unknown):HsmeTeacherAcquisitionPinRequestSetV1{
  const record=exactRecord(raw,[
    'schemaVersion','requestSetId','requests','qualityPolicy',
    'teacherAdmissionAllowed','trainingStartAllowed','productionAuthorityGranted',
  ],'pinRequestSet');
  if(record.schemaVersion!==HSME_TEACHER_PIN_REQUEST_SET_V1_SCHEMA){
    fail('pin_request_schema');
  }
  if(record.qualityPolicy!=='QUALITY_FLOOR_BEFORE_EFFICIENCY'
    ||record.teacherAdmissionAllowed!==false
    ||record.trainingStartAllowed!==false
    ||record.productionAuthorityGranted!==false){
    fail('pin_request_authority');
  }
  if(!Array.isArray(record.requests)||record.requests.length<3||record.requests.length>12){
    fail('pin_request_count');
  }
  const requests=record.requests.map((value,index)=>normalizePinRequest(value,index));
  if(new Set(requests.map(value=>value.teacherCandidateId)).size!==requests.length){
    fail('pin_request_duplicate');
  }
  return deepFreeze({
    schemaVersion:HSME_TEACHER_PIN_REQUEST_SET_V1_SCHEMA,
    requestSetId:identifier(record.requestSetId,'requestSetId',160),
    requests:Object.freeze([...requests].sort((a,b)=>lexical(a.teacherCandidateId,b.teacherCandidateId))),
    qualityPolicy:'QUALITY_FLOOR_BEFORE_EFFICIENCY',
    teacherAdmissionAllowed:false,
    trainingStartAllowed:false,
    productionAuthorityGranted:false,
  });
}

function normalizePinRequest(raw:unknown,index:number):HsmeTeacherAcquisitionPinRequestV1{
  const path='requests['+index+']';
  const record=exactRecord(raw,[
    'teacherCandidateId','source','requestedCapabilities','componentRoots',
    'publicMetadataLicenseId','rightsConclusion','distillationOutputUse','qualityGateStatus',
    'teacherAdmissionAllowed','trainingStartAllowed',
  ],path);
  if(record.rightsConclusion!=='REVIEW_REQUIRED'
    ||record.distillationOutputUse!=='REVIEW_REQUIRED'
    ||record.qualityGateStatus!=='UNMEASURED'
    ||record.teacherAdmissionAllowed!==false
    ||record.trainingStartAllowed!==false){
    fail('pin_request_state');
  }
  if(!Array.isArray(record.requestedCapabilities)||record.requestedCapabilities.length<1){
    fail('pin_request_capabilities');
  }
  const requestedCapabilities=record.requestedCapabilities.map((value,i)=>
    enumValue(value,CAPABILITIES,path+'.requestedCapabilities['+i+']')
  );
  if(new Set(requestedCapabilities).size!==requestedCapabilities.length){
    fail('pin_request_capability_duplicate');
  }
  if(!Array.isArray(record.componentRoots)||record.componentRoots.length<1||record.componentRoots.length>32){
    fail('pin_request_roots');
  }
  const componentRoots=record.componentRoots.map((value,i)=>{
    const root=exactRecord(value,['componentId','relativePath','kind','role'],path+'.componentRoots['+i+']');
    return Object.freeze({
      componentId:identifier(root.componentId,path+'.componentId',120),
      relativePath:relativePath(root.relativePath,path+'.relativePath'),
      kind:enumValue(root.kind,ROOT_KINDS,path+'.kind'),
      role:enumValue(root.role,ROOT_ROLES,path+'.role'),
    });
  });
  if(new Set(componentRoots.map(value=>value.componentId)).size!==componentRoots.length
    ||new Set(componentRoots.map(value=>value.relativePath)).size!==componentRoots.length){
    fail('pin_request_root_duplicate');
  }
  return deepFreeze({
    teacherCandidateId:identifier(record.teacherCandidateId,path+'.teacherCandidateId',120),
    source:normalizeHsmeTeacherArtifactSourceV1(record.source,path+'.source'),
    requestedCapabilities:Object.freeze([...requestedCapabilities].sort(lexical)),
    componentRoots:Object.freeze([...componentRoots].sort((a,b)=>lexical(a.componentId,b.componentId))),
    publicMetadataLicenseId:text(record.publicMetadataLicenseId,path+'.publicMetadataLicenseId',120),
    rightsConclusion:'REVIEW_REQUIRED',
    distillationOutputUse:'REVIEW_REQUIRED',
    qualityGateStatus:'UNMEASURED',
    teacherAdmissionAllowed:false,
    trainingStartAllowed:false,
  });
}

function normalizePlan(raw:unknown):HsmeTeacherAcquisitionPlanV1{
  const record=exactRecord(raw,['schemaVersion','teacherCandidateId','primarySource','sources','artifacts'],'plan');
  if(record.schemaVersion!==HSME_TEACHER_ACQUISITION_PLAN_V1_SCHEMA)fail('plan_schema');
  if(!Array.isArray(record.sources)||record.sources.length<1||record.sources.length>32)fail('plan_sources');
  const sources=record.sources.map((value,index)=>{
    const item=exactRecord(value,['source','materializedSubdir'],'plan.sources['+index+']');
    return Object.freeze({
      source:normalizeHsmeTeacherArtifactSourceV1(item.source,'plan.sources['+index+'].source'),
      materializedSubdir:relativePath(item.materializedSubdir,'plan.sources['+index+'].materializedSubdir'),
    });
  });
  if(!Array.isArray(record.artifacts)||record.artifacts.length<1||record.artifacts.length>4096)fail('plan_artifacts');
  const artifacts=record.artifacts.map((value,index)=>{
    const item=exactRecord(value,['logicalId','source','relativePath','role','runtimeRequired'],'plan.artifacts['+index+']');
    if(item.runtimeRequired!==true)fail('plan_runtime_required');
    return Object.freeze({
      logicalId:identifier(item.logicalId,'plan.artifacts['+index+'].logicalId',160),
      source:normalizeHsmeTeacherArtifactSourceV1(item.source,'plan.artifacts['+index+'].source'),
      relativePath:relativePath(item.relativePath,'plan.artifacts['+index+'].relativePath'),
      role:enumValue(item.role,PLAN_ROLES,'plan.artifacts['+index+'].role'),
      runtimeRequired:true as const,
    });
  });
  if(new Set(artifacts.map(value=>value.logicalId)).size!==artifacts.length)fail('plan_logical_id_duplicate');
  return deepFreeze({
    schemaVersion:HSME_TEACHER_ACQUISITION_PLAN_V1_SCHEMA,
    teacherCandidateId:identifier(record.teacherCandidateId,'plan.teacherCandidateId',120),
    primarySource:normalizeHsmeTeacherArtifactSourceV1(record.primarySource,'plan.primarySource'),
    sources:Object.freeze([...sources].sort((a,b)=>lexical(sourceKey(a.source),sourceKey(b.source)))),
    artifacts:Object.freeze([...artifacts].sort((a,b)=>lexical(a.logicalId,b.logicalId))),
  });
}

function normalizeExpansionEvidence(raw:unknown):HsmeTeacherPlanExpansionEvidenceV1{
  const record=exactRecord(raw,[
    'schemaVersion','teacherCandidateId','source','pinRequestSetSha256','planSha256',
    'artifactCount','componentRootCount','networkAccessPerformed','deserializationPerformed',
    'teacherAdmissionAllowed','trainingStartAllowed','productionAuthorityGranted',
  ],'expansionEvidence');
  if(record.schemaVersion!==HSME_TEACHER_PLAN_EXPANSION_EVIDENCE_V1_SCHEMA)fail('expansion_schema');
  if(record.networkAccessPerformed!==false
    ||record.deserializationPerformed!==false
    ||record.teacherAdmissionAllowed!==false
    ||record.trainingStartAllowed!==false
    ||record.productionAuthorityGranted!==false)fail('expansion_authority');
  return deepFreeze({
    schemaVersion:HSME_TEACHER_PLAN_EXPANSION_EVIDENCE_V1_SCHEMA,
    teacherCandidateId:identifier(record.teacherCandidateId,'expansion.teacherCandidateId',120),
    source:normalizeHsmeTeacherArtifactSourceV1(record.source,'expansion.source'),
    pinRequestSetSha256:sha256(record.pinRequestSetSha256,'expansion.pinRequestSetSha256'),
    planSha256:sha256(record.planSha256,'expansion.planSha256'),
    artifactCount:integer(record.artifactCount,'expansion.artifactCount',1,4096),
    componentRootCount:integer(record.componentRootCount,'expansion.componentRootCount',1,32),
    networkAccessPerformed:false,
    deserializationPerformed:false,
    teacherAdmissionAllowed:false,
    trainingStartAllowed:false,
    productionAuthorityGranted:false,
  });
}

function normalizeByteAcquisitionEvidence(raw:unknown):HsmeTeacherByteAcquisitionEvidenceV1{
  const record=exactRecord(raw,[
    'schemaVersion','teacherCandidateId','planDigest','manifestDigest','artifactCount','sourceCount',
    'matchesExpectedManifest','hashBeforeDeserialization','deserializationPerformed',
    'modelRepositoryRuntimeCodeExecuted','binaryPayloadPublished','runtimeAuthorityGranted',
  ],'byteEvidence');
  if(record.schemaVersion!==HSME_TEACHER_BYTE_ACQUISITION_EVIDENCE_V1_SCHEMA)fail('byte_schema');
  if(record.hashBeforeDeserialization!==true
    ||record.deserializationPerformed!==false
    ||record.modelRepositoryRuntimeCodeExecuted!==false
    ||record.binaryPayloadPublished!==false
    ||record.runtimeAuthorityGranted!==false)fail('byte_authority');
  if(record.matchesExpectedManifest!==null&&typeof record.matchesExpectedManifest!=='boolean'){
    fail('byte_expected_manifest');
  }
  return deepFreeze({
    schemaVersion:HSME_TEACHER_BYTE_ACQUISITION_EVIDENCE_V1_SCHEMA,
    teacherCandidateId:identifier(record.teacherCandidateId,'byte.teacherCandidateId',120),
    planDigest:sha256(record.planDigest,'byte.planDigest'),
    manifestDigest:sha256(record.manifestDigest,'byte.manifestDigest'),
    artifactCount:integer(record.artifactCount,'byte.artifactCount',1,4096),
    sourceCount:integer(record.sourceCount,'byte.sourceCount',1,32),
    matchesExpectedManifest:record.matchesExpectedManifest as boolean|null,
    hashBeforeDeserialization:true,
    deserializationPerformed:false,
    modelRepositoryRuntimeCodeExecuted:false,
    binaryPayloadPublished:false,
    runtimeAuthorityGranted:false,
  });
}

function validatePlanCoverage(
  request:HsmeTeacherAcquisitionPinRequestV1,
  plan:HsmeTeacherAcquisitionPlanV1,
  blockers:string[],
):void{
  const rootUse=new Map(request.componentRoots.map(root=>[root.componentId,0]));
  for(const artifact of plan.artifacts){
    if(!sameSource(artifact.source,request.source)){
      blockers.push('ACQUISITION_ARTIFACT_SOURCE_DRIFT');
      continue;
    }
    const matches=request.componentRoots.filter(root=>
      root.kind==='FILE'
        ?artifact.relativePath===root.relativePath
        :artifact.relativePath.startsWith(root.relativePath+'/')
    );
    if(matches.length!==1){
      blockers.push('ACQUISITION_ARTIFACT_ROOT_BINDING_INVALID:'+artifact.logicalId);
      continue;
    }
    const root=matches[0];
    rootUse.set(root.componentId,(rootUse.get(root.componentId)??0)+1);
    if(!roleCompatible(root.role,artifact.role)){
      blockers.push('ACQUISITION_ARTIFACT_ROLE_DRIFT:'+artifact.logicalId);
    }
  }
  for(const [componentId,count] of rootUse){
    if(count<1)blockers.push('ACQUISITION_COMPONENT_ROOT_EMPTY:'+componentId);
  }
}

function validateManifestMatchesPlan(
  plan:HsmeTeacherAcquisitionPlanV1,
  manifest:HsmeTeacherArtifactManifestV1,
  blockers:string[],
):void{
  const byId=new Map(manifest.artifacts.map(value=>[value.logicalId,value]));
  if(byId.size!==manifest.artifacts.length){
    blockers.push('ACQUISITION_MANIFEST_LOGICAL_ID_DUPLICATE');
  }
  for(const artifact of plan.artifacts){
    const actual=byId.get(artifact.logicalId);
    if(!actual
      ||!sameSource(actual.source,artifact.source)
      ||actual.relativePath!==artifact.relativePath
      ||actual.role!==artifact.role
      ||actual.runtimeRequired!==true){
      blockers.push('ACQUISITION_MANIFEST_PLAN_BINDING_DRIFT:'+artifact.logicalId);
    }
  }
}

function roleCompatible(root:RootRole,role:PlanRole):boolean{
  if(root==='MODEL_CONFIG')return role==='MODEL_CONFIG';
  if(root==='DENOISER')return role==='DENOISER_WEIGHT'||role==='MODEL_CONFIG';
  if(root==='TEXT_ENCODER')return role==='TEXT_ENCODER_WEIGHT'||role==='MODEL_CONFIG';
  if(root==='VAE')return role==='VAE_WEIGHT'||role==='MODEL_CONFIG';
  if(root==='TOKENIZER_ASSET')return role==='TOKENIZER_ASSET';
  if(root==='SCHEDULER_ASSET')return role==='SCHEDULER_ASSET';
  if(root==='PROCESSOR_ASSET')return role==='RUNTIME_ASSET';
  return false;
}

async function domainDigest(
  domain:string,
  value:unknown,
  hash:HsmeTrainingHashPortV1,
):Promise<string>{
  const result=await hash.sha256(new TextEncoder().encode(domain+JSON.stringify(canonicalValue(value))));
  if(!HEX64.test(result))fail('hash_invalid');
  return result;
}

function authorityBoundary(){
  return Object.freeze({
    rightsConclusion:'REVIEW_REQUIRED' as const,
    distillationOutputUse:'REVIEW_REQUIRED' as const,
    qualityGateStatus:'UNMEASURED' as const,
    teacherAdmissionAllowed:false as const,
    trainingStartAllowed:false as const,
    productionAuthorityGranted:false as const,
    providerAuthorityGranted:false as const,
    billingAuthorityGranted:false as const,
    projectArtifactMutationAllowed:false as const,
    aeeExecutionAuthorityGranted:false as const,
    modelFleetPromotionAllowed:false as const,
  });
}

function invalid(
  teacherCandidateId:string,
  blockers:readonly string[],
  values:Partial<Pick<
    HsmeTeacherAcquisitionProofV1,
    'source'|'pinRequestSetSha256'|'planSha256'|'planExpansionEvidenceSha256'|
    'manifestSha256'|'byteAcquisitionEvidenceSha256'|'artifactCount'|'sourceCount'
  >>={},
):HsmeTeacherAcquisitionProofV1{
  return Object.freeze({
    schemaVersion:HSME_TEACHER_ACQUISITION_PROOF_V1_SCHEMA,
    state:'ACQUISITION_EVIDENCE_INVALID',
    blockers:Object.freeze([...new Set(blockers)]),
    teacherCandidateId,
    source:values.source??null,
    pinRequestSetSha256:values.pinRequestSetSha256??'UNKNOWN',
    planSha256:values.planSha256??'UNKNOWN',
    planExpansionEvidenceSha256:values.planExpansionEvidenceSha256??'UNKNOWN',
    manifestSha256:values.manifestSha256??'UNKNOWN',
    byteAcquisitionEvidenceSha256:values.byteAcquisitionEvidenceSha256??'UNKNOWN',
    artifactCount:values.artifactCount??'UNKNOWN',
    sourceCount:values.sourceCount??'UNKNOWN',
    acquisitionProofSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

function sameSource(left:HsmeTeacherArtifactSourceV1,right:HsmeTeacherArtifactSourceV1):boolean{
  return left.provider===right.provider
    &&left.sourceRoot===right.sourceRoot
    &&left.immutableRevision===right.immutableRevision;
}
function sourceKey(value:HsmeTeacherArtifactSourceV1):string{
  return value.provider+'\0'+value.sourceRoot+'\0'+value.immutableRevision;
}
function exactRecord(raw:unknown,keys:readonly string[],path:string):Record<string,unknown>{
  if(raw===null||typeof raw!=='object'||Array.isArray(raw))fail(path+'_record');
  const record=raw as Record<string,unknown>;
  const actual=Object.keys(record).sort();
  const expected=[...keys].sort();
  if(actual.length!==expected.length||!actual.every((value,index)=>value===expected[index])){
    fail(path+'_shape');
  }
  return record;
}
function identifier(value:unknown,path:string,max:number):string{
  const result=text(value,path,max);
  if(!IDENTIFIER.test(result))fail(path+'_identifier');
  return result;
}
function relativePath(value:unknown,path:string):string{
  const result=text(value,path,500);
  if(result.startsWith('/')||result.includes('\\'))fail(path+'_path');
  if(result.split('/').some(part=>part===''||part==='.'||part==='..'))fail(path+'_path');
  return result;
}
function text(value:unknown,path:string,max:number):string{
  if(typeof value!=='string'||value.length<1||value.length>max||value.trim()!==value||/[\u0000-\u001f\u007f]/.test(value)){
    fail(path+'_text');
  }
  return value;
}
function sha256(value:unknown,path:string):string{
  if(typeof value!=='string'||!HEX64.test(value))fail(path+'_sha256');
  return value;
}
function integer(value:unknown,path:string,min:number,max:number):number{
  if(!Number.isSafeInteger(value)||Number(value)<min||Number(value)>max)fail(path+'_integer');
  return Number(value);
}
function enumValue<const T extends readonly string[]>(value:unknown,values:T,path:string):T[number]{
  if(typeof value!=='string'||!(values as readonly string[]).includes(value))fail(path+'_enum');
  return value as T[number];
}
function canonicalValue(value:unknown):unknown{
  if(Array.isArray(value))return value.map(canonicalValue);
  if(value!==null&&typeof value==='object'){
    const input=value as Record<string,unknown>;
    return Object.fromEntries(Object.keys(input).sort().map(key=>[key,canonicalValue(input[key])]));
  }
  return value;
}
function deepFreeze<T>(value:T):T{
  if(value!==null&&typeof value==='object'){
    Object.freeze(value);
    for(const child of Object.values(value as Record<string,unknown>)){
      if(child!==null&&typeof child==='object'&&!Object.isFrozen(child))deepFreeze(child);
    }
  }
  return value;
}
function lexical(a:string,b:string):number{return a<b?-1:a>b?1:0;}
function fail(code:string):never{throw new Error(code);}
