import {
  hsmeTeacherArtifactManifestDigestV1,
  normalizeHsmeTeacherArtifactManifestV1,
  type HsmeTeacherArtifactManifestV1,
} from './HsmeTeacherArtifactManifestV1';
import {
  HSME_TEACHER_QUALITY_BAKEOFF_ASSEMBLY_DIGEST_DOMAIN,
  HSME_TEACHER_QUALITY_BAKEOFF_ASSEMBLY_V1_SCHEMA,
  HSME_TEACHER_QUALITY_BAKEOFF_CONTENT_DIGEST_DOMAIN,
  type HsmeTeacherQualityBakeoffAssemblyV1,
} from './HsmeTeacherQualityBakeoffAssemblyV1';
import {
  normalizeHsmeTeacherQualityBakeoffV1,
  type HsmeTeacherQualityBakeoffV1,
} from './HsmeTeacherQualityEvidenceV1';
import {
  hsmeTrainingProvenanceDigestV1,
  normalizeHsmeTeacherDecisionV1,
  type HsmeTeacherDecisionV1,
  type HsmeTrainingHashPortV1,
} from './HsmeTrainingProvenanceV1';

export const HSME_TEACHER_ROSTER_METADATA_V1_SCHEMA =
  'BERS_HSME_TEACHER_ROSTER_METADATA_V1' as const;
export const HSME_TEACHER_ROSTER_REFRESH_V1_SCHEMA =
  'BERS_HSME_TEACHER_ROSTER_REFRESH_V1' as const;
export const HSME_TEACHER_ROSTER_METADATA_DIGEST_DOMAIN =
  'bers:hsme:teacher-roster-metadata:v1\0' as const;
export const HSME_TEACHER_ROSTER_REFRESH_DIGEST_DOMAIN =
  'bers:hsme:teacher-roster-refresh:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[a-z0-9][a-z0-9._:@/-]*$/;
const WEIGHT_ROLES=new Set(['DENOISER_WEIGHT','TEXT_ENCODER_WEIGHT','VAE_WEIGHT']);

export type HsmeTeacherRosterMetadataCandidateV1=Readonly<{
  teacherCandidateId:string;
  architectureFamily:string;
  declaredLicenseId:string;
  knownWeaknesses:readonly string[];
}>;

export type HsmeTeacherRosterMetadataV1=Readonly<{
  schemaVersion:typeof HSME_TEACHER_ROSTER_METADATA_V1_SCHEMA;
  rosterId:string;
  candidates:readonly HsmeTeacherRosterMetadataCandidateV1[];
  selectionDeferred:true;
  teacherAdmissionAllowed:false;
  trainingStartAllowed:false;
  productionAuthorityGranted:false;
}>;

export interface HsmeTeacherRosterRefreshOriginVerifierV1{
  verifyQualityAssembly(
    assembly:HsmeTeacherQualityBakeoffAssemblyV1,
    assemblySha256:string,
  ):Promise<boolean>;
  verifyManifest(
    manifest:HsmeTeacherArtifactManifestV1,
    manifestSha256:string,
  ):Promise<boolean>;
  verifyRosterMetadata(
    metadata:HsmeTeacherRosterMetadataV1,
    metadataSha256:string,
  ):Promise<boolean>;
}

export type HsmeTeacherDecisionRosterRefreshV1=Readonly<{
  schemaVersion:typeof HSME_TEACHER_ROSTER_REFRESH_V1_SCHEMA;
  state:'ROSTER_REFRESH_INVALID'|'ROSTER_REFRESH_READY';
  blockers:readonly string[];
  sourceDecisionSha256:string|'UNKNOWN';
  qualityBakeoffAssemblySha256:string|'UNKNOWN';
  rosterMetadataSha256:string|'UNKNOWN';
  refreshedDecisionSha256:string|'UNKNOWN';
  rosterRefreshSha256:string|'UNKNOWN';
  refreshedDecision:HsmeTeacherDecisionV1|null;
  teacherSelectionAllowed:false;
  teacherAdmissionAllowed:false;
  trainingStartAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
  durableModelFleetPromotionAllowed:false;
}>;

export async function refreshHsmeTeacherDecisionRosterV1(
  rawSourceDecision:unknown,
  rawQualityAssembly:HsmeTeacherQualityBakeoffAssemblyV1,
  rawManifests:readonly unknown[],
  rawMetadata:unknown,
  origin:HsmeTeacherRosterRefreshOriginVerifierV1,
  hash:HsmeTrainingHashPortV1,
):Promise<HsmeTeacherDecisionRosterRefreshV1>{
  const blockers:string[]=[];
  let sourceDecision:HsmeTeacherDecisionV1;
  try{
    sourceDecision=normalizeHsmeTeacherDecisionV1(rawSourceDecision);
  }catch{
    return invalid(['ROSTER_SOURCE_DECISION_INVALID']);
  }
  if(sourceDecision.decisionStatus!=='REDESIGN_REQUIRED'
    ||sourceDecision.selectedCandidateIds.length!==0){
    blockers.push('ROSTER_SOURCE_DECISION_NOT_REDESIGN');
  }

  let sourceDecisionSha256:string|'UNKNOWN'='UNKNOWN';
  try{
    sourceDecisionSha256=await hsmeTrainingProvenanceDigestV1(sourceDecision,hash);
  }catch{
    blockers.push('ROSTER_SOURCE_DECISION_HASH_INVALID');
  }

  let qualityAssembly:HsmeTeacherQualityBakeoffAssemblyV1;
  try{
    qualityAssembly=normalizeQualityAssembly(rawQualityAssembly);
  }catch{
    return invalid([...blockers,'ROSTER_QUALITY_ASSEMBLY_INVALID'],{sourceDecisionSha256});
  }
  let qualityBakeoffAssemblySha256:string|'UNKNOWN'='UNKNOWN';
  try{
    const bakeoffSha256=await digest(
      HSME_TEACHER_QUALITY_BAKEOFF_CONTENT_DIGEST_DOMAIN,
      qualityAssembly.bakeoff,
      hash,
    );
    if(bakeoffSha256!==qualityAssembly.bakeoffSha256){
      blockers.push('ROSTER_QUALITY_BAKEOFF_REHASH_MISMATCH');
    }
    qualityBakeoffAssemblySha256=await digest(
      HSME_TEACHER_QUALITY_BAKEOFF_ASSEMBLY_DIGEST_DOMAIN,
      qualityAssemblyPayload(qualityAssembly),
      hash,
    );
    if(qualityBakeoffAssemblySha256!==qualityAssembly.bakeoffAssemblySha256){
      blockers.push('ROSTER_QUALITY_ASSEMBLY_REHASH_MISMATCH');
    }else if(!await verifyOrigin(
      ()=>origin.verifyQualityAssembly(qualityAssembly,qualityBakeoffAssemblySha256 as string),
    )){
      blockers.push('ROSTER_QUALITY_ASSEMBLY_ORIGIN_UNVERIFIED');
    }
  }catch{
    blockers.push('ROSTER_QUALITY_ASSEMBLY_REHASH_INVALID');
  }

  let metadata:HsmeTeacherRosterMetadataV1;
  try{
    metadata=normalizeRosterMetadata(rawMetadata);
  }catch{
    return invalid([...blockers,'ROSTER_METADATA_INVALID'],{
      sourceDecisionSha256,qualityBakeoffAssemblySha256,
    });
  }
  let rosterMetadataSha256:string|'UNKNOWN'='UNKNOWN';
  try{
    rosterMetadataSha256=await digest(
      HSME_TEACHER_ROSTER_METADATA_DIGEST_DOMAIN,
      metadata,hash,
    );
    if(!await verifyOrigin(
      ()=>origin.verifyRosterMetadata(metadata,rosterMetadataSha256 as string),
    )){
      blockers.push('ROSTER_METADATA_ORIGIN_UNVERIFIED');
    }
  }catch{
    blockers.push('ROSTER_METADATA_REHASH_INVALID');
  }

  if(!Array.isArray(rawManifests)||rawManifests.length<3||rawManifests.length>12){
    return invalid([...blockers,'ROSTER_MANIFEST_COUNT_INVALID'],{
      sourceDecisionSha256,qualityBakeoffAssemblySha256,rosterMetadataSha256,
    });
  }

  const manifests:HsmeTeacherArtifactManifestV1[]=[];
  try{
    for(const raw of rawManifests)manifests.push(normalizeHsmeTeacherArtifactManifestV1(raw));
  }catch{
    return invalid([...blockers,'ROSTER_MANIFEST_INVALID'],{
      sourceDecisionSha256,qualityBakeoffAssemblySha256,rosterMetadataSha256,
    });
  }

  const manifestById=new Map<string,HsmeTeacherArtifactManifestV1>();
  const manifestShaById=new Map<string,string>();
  for(const manifest of manifests){
    if(manifestById.has(manifest.teacherCandidateId)){
      blockers.push('ROSTER_MANIFEST_DUPLICATE');
      continue;
    }
    if(manifest.artifacts.some(value=>value.role==='RUNTIME_CODE')){
      blockers.push('ROSTER_MANIFEST_RUNTIME_CODE_FORBIDDEN');
    }
    let manifestSha:string;
    try{
      manifestSha=await hsmeTeacherArtifactManifestDigestV1(manifest,hash);
    }catch{
      blockers.push('ROSTER_MANIFEST_HASH_INVALID');
      continue;
    }
    const ref=qualityAssembly.candidateManifestRefs.find(
      value=>value.teacherCandidateId===manifest.teacherCandidateId,
    );
    if(!ref
      ||ref.manifestSha256!==manifestSha
      ||ref.immutableRevision!==manifest.primarySource.immutableRevision){
      blockers.push('ROSTER_MANIFEST_QUALITY_BINDING_MISMATCH');
    }
    if(!await verifyOrigin(()=>origin.verifyManifest(manifest,manifestSha))){
      blockers.push('ROSTER_MANIFEST_ORIGIN_UNVERIFIED');
    }
    manifestById.set(manifest.teacherCandidateId,manifest);
    manifestShaById.set(manifest.teacherCandidateId,manifestSha);
  }

  const qualityIds=qualityAssembly.bakeoff.candidateResults
    .map(value=>value.teacherCandidateId).sort(lexical);
  const manifestIds=[...manifestById.keys()].sort(lexical);
  const metadataIds=metadata.candidates.map(value=>value.teacherCandidateId).sort(lexical);
  if(!sameStrings(qualityIds,manifestIds))blockers.push('ROSTER_MANIFEST_SET_MISMATCH');
  if(!sameStrings(qualityIds,metadataIds))blockers.push('ROSTER_METADATA_SET_MISMATCH');
  if(blockers.length>0){
    return invalid(blockers,{
      sourceDecisionSha256,qualityBakeoffAssemblySha256,rosterMetadataSha256,
    });
  }

  const candidates=[];
  try{
    for(const result of qualityAssembly.bakeoff.candidateResults){
      const manifest=manifestById.get(result.teacherCandidateId)!;
      const manifestSha=manifestShaById.get(result.teacherCandidateId)!;
      const meta=metadata.candidates.find(
        value=>value.teacherCandidateId===result.teacherCandidateId,
      )!;
      if(result.immutableRevision!==manifest.primarySource.immutableRevision
        ||result.modelContentSha256!==manifestSha){
        throw new Error('quality identity');
      }
      const checkpointBytes=sumSafe(
        manifest.artifacts
          .filter(value=>WEIGHT_ROLES.has(value.role))
          .map(value=>value.bytes),
      );
      const installedBytes=sumSafe(
        manifest.artifacts
          .filter(value=>value.runtimeRequired)
          .map(value=>value.bytes),
      );
      candidates.push({
        candidateId:result.teacherCandidateId,
        modelId:manifest.primarySource.sourceRoot,
        architectureFamily:meta.architectureFamily,
        immutableRevision:manifest.primarySource.immutableRevision,
        contentSha256:manifestSha,
        checkpointBytes,
        licenseId:meta.declaredLicenseId,
        licenseConclusion:'REVIEW_REQUIRED' as const,
        distillationOutputUse:'REVIEW_REQUIRED' as const,
        installedBytes,
        workingMemoryBytes:'UNKNOWN' as const,
        qualityDomain:[...result.capabilities],
        knownWeaknesses:meta.knownWeaknesses,
      });
    }
  }catch{
    return invalid(['ROSTER_CANDIDATE_MATERIALIZATION_INVALID'],{
      sourceDecisionSha256,qualityBakeoffAssemblySha256,rosterMetadataSha256,
    });
  }

  let refreshedDecision:HsmeTeacherDecisionV1;
  try{
    refreshedDecision=normalizeHsmeTeacherDecisionV1({
      schemaVersion:sourceDecision.schemaVersion,
      decisionStatus:'REDESIGN_REQUIRED',
      candidates,
      selectedCandidateIds:[],
      rationale:[
        'Teacher shortlist roster refreshed from content-addressed acquired manifests and quality-bakeoff candidate identity.',
        'License conclusions, distillation-output rights, working-memory evidence and teacher admission remain unresolved after roster refresh.',
        'QUALITY_FLOOR_BEFORE_EFFICIENCY remains mandatory and selection is explicitly deferred.',
      ],
    });
  }catch{
    return invalid(['ROSTER_REFRESHED_DECISION_INVALID'],{
      sourceDecisionSha256,qualityBakeoffAssemblySha256,rosterMetadataSha256,
    });
  }

  let refreshedDecisionSha256:string;
  let rosterRefreshSha256:string;
  try{
    refreshedDecisionSha256=await hsmeTrainingProvenanceDigestV1(refreshedDecision,hash);
    rosterRefreshSha256=await digest(
      HSME_TEACHER_ROSTER_REFRESH_DIGEST_DOMAIN,
      {
        schemaVersion:HSME_TEACHER_ROSTER_REFRESH_V1_SCHEMA,
        sourceDecisionSha256,
        qualityBakeoffAssemblySha256,
        rosterMetadataSha256,
        refreshedDecisionSha256,
        teacherSelectionAllowed:false,
        teacherAdmissionAllowed:false,
        trainingStartAllowed:false,
        productionAuthorityGranted:false,
      },
      hash,
    );
  }catch{
    return invalid(['ROSTER_REFRESH_HASH_INVALID'],{
      sourceDecisionSha256,qualityBakeoffAssemblySha256,rosterMetadataSha256,
    });
  }

  return Object.freeze({
    schemaVersion:HSME_TEACHER_ROSTER_REFRESH_V1_SCHEMA,
    state:'ROSTER_REFRESH_READY',
    blockers:Object.freeze([]),
    sourceDecisionSha256,
    qualityBakeoffAssemblySha256,
    rosterMetadataSha256,
    refreshedDecisionSha256,
    rosterRefreshSha256,
    refreshedDecision,
    ...authorityBoundary(),
  });
}

function normalizeRosterMetadata(raw:unknown):HsmeTeacherRosterMetadataV1{
  const record=exactRecord(raw,[
    'schemaVersion','rosterId','candidates','selectionDeferred',
    'teacherAdmissionAllowed','trainingStartAllowed','productionAuthorityGranted',
  ],'rosterMetadata');
  if(record.schemaVersion!==HSME_TEACHER_ROSTER_METADATA_V1_SCHEMA)throw new Error('schema');
  requireTrue(record.selectionDeferred,'selectionDeferred');
  requireFalse(record.teacherAdmissionAllowed,'teacherAdmissionAllowed');
  requireFalse(record.trainingStartAllowed,'trainingStartAllowed');
  requireFalse(record.productionAuthorityGranted,'productionAuthorityGranted');
  if(!Array.isArray(record.candidates)||record.candidates.length<3||record.candidates.length>12){
    throw new Error('candidate count');
  }
  const candidates=record.candidates.map((value,index)=>{
    const item=exactRecord(value,[
      'teacherCandidateId','architectureFamily','declaredLicenseId','knownWeaknesses',
    ],'candidate '+index);
    return Object.freeze({
      teacherCandidateId:identifier(item.teacherCandidateId,'teacherCandidateId',120),
      architectureFamily:text(item.architectureFamily,'architectureFamily',160),
      declaredLicenseId:text(item.declaredLicenseId,'declaredLicenseId',200),
      knownWeaknesses:stringSet(item.knownWeaknesses,'knownWeaknesses',1,12,500),
    });
  });
  if(new Set(candidates.map(value=>value.teacherCandidateId)).size!==candidates.length){
    throw new Error('duplicate candidate');
  }
  return Object.freeze({
    schemaVersion:HSME_TEACHER_ROSTER_METADATA_V1_SCHEMA,
    rosterId:identifier(record.rosterId,'rosterId',160),
    candidates:Object.freeze([...candidates].sort(
      (a,b)=>lexical(a.teacherCandidateId,b.teacherCandidateId),
    )),
    selectionDeferred:true,
    teacherAdmissionAllowed:false,
    trainingStartAllowed:false,
    productionAuthorityGranted:false,
  });
}

export function normalizeAssembledHsmeTeacherQualityBakeoffV1(
  raw:unknown,
):HsmeTeacherQualityBakeoffV1{
  if(raw===null||typeof raw!=='object'||Array.isArray(raw)){
    throw new Error('assembled quality bakeoff record invalid');
  }
  const record=raw as Record<string,unknown>;
  if(!Array.isArray(record.candidateResults)){
    throw new Error('assembled quality bakeoff candidateResults invalid');
  }
  const candidateResults=record.candidateResults.map((rawCandidate,index)=>{
    if(rawCandidate===null||typeof rawCandidate!=='object'||Array.isArray(rawCandidate)){
      throw new Error('assembled quality candidate invalid '+index);
    }
    const candidate=rawCandidate as Record<string,unknown>;
    const {
      qualityGatePassed:_derivedQualityGatePassed,
      ...candidatePrimary
    }=candidate;
    if(!Array.isArray(candidate.automatedChecks)){
      throw new Error('assembled quality automatedChecks invalid '+index);
    }
    const automatedChecks=candidate.automatedChecks.map((rawCheck,checkIndex)=>{
      if(rawCheck===null||typeof rawCheck!=='object'||Array.isArray(rawCheck)){
        throw new Error('assembled quality automated check invalid '+index+':'+checkIndex);
      }
      const {
        passed:_derivedPassed,
        ...checkPrimary
      }=rawCheck as Record<string,unknown>;
      return checkPrimary;
    });
    return {...candidatePrimary,automatedChecks};
  });
  return normalizeHsmeTeacherQualityBakeoffV1({
    ...record,
    candidateResults,
  });
}

function normalizeQualityAssembly(
  raw:HsmeTeacherQualityBakeoffAssemblyV1,
):HsmeTeacherQualityBakeoffAssemblyV1{
  if(!raw||typeof raw!=='object'
    ||raw.schemaVersion!==HSME_TEACHER_QUALITY_BAKEOFF_ASSEMBLY_V1_SCHEMA){
    throw new Error('schema');
  }
  for(const field of [
    'efficiencyUsedForQualitySelection','selectedTeacherIdsAllowed',
    'teacherAdmissionAllowed','trainingStartAllowed','providerAuthorityGranted',
    'billingAuthorityGranted','projectArtifactMutationAllowed','aeeExecutionAuthorityGranted',
    'durableModelFleetPromotionAllowed','winnerSelectionAllowed','productionAuthorityGranted',
  ] as const){
    if(raw[field]!==false)throw new Error('authority');
  }
  if(!HEX64.test(raw.benchmarkPolicySha256)
    ||!HEX64.test(raw.fixtureSetSha256)
    ||!HEX64.test(raw.bakeoffSha256)
    ||!HEX64.test(raw.bakeoffAssemblySha256)){
    throw new Error('digest');
  }
  if(!Array.isArray(raw.candidateManifestRefs)||raw.candidateManifestRefs.length<3){
    throw new Error('refs');
  }
  const bakeoff=normalizeAssembledHsmeTeacherQualityBakeoffV1(raw.bakeoff);
  return Object.freeze({...raw,bakeoff});
}

function qualityAssemblyPayload(value:HsmeTeacherQualityBakeoffAssemblyV1){
  return {
    schemaVersion:HSME_TEACHER_QUALITY_BAKEOFF_ASSEMBLY_V1_SCHEMA,
    benchmarkPolicySha256:value.benchmarkPolicySha256,
    fixtureSetSha256:value.fixtureSetSha256,
    candidateManifestRefs:value.candidateManifestRefs,
    bakeoffSha256:value.bakeoffSha256,
    efficiencyUsedForQualitySelection:false,
    selectedTeacherIdsAllowed:false,
    teacherAdmissionAllowed:false,
    trainingStartAllowed:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    durableModelFleetPromotionAllowed:false,
    winnerSelectionAllowed:false,
    productionAuthorityGranted:false,
  };
}

async function verifyOrigin(run:()=>Promise<boolean>):Promise<boolean>{
  try{return await run()===true;}catch{return false;}
}

async function digest(
  domain:string,
  value:unknown,
  hash:HsmeTrainingHashPortV1,
):Promise<string>{
  const result=await hash.sha256(
    new TextEncoder().encode(domain+JSON.stringify(value)),
  );
  if(!HEX64.test(result))throw new Error('invalid hash');
  return result;
}

function sumSafe(values:readonly number[]):number{
  let total=0;
  for(const value of values){
    if(!Number.isSafeInteger(value)||value<1)throw new Error('invalid bytes');
    total+=value;
    if(!Number.isSafeInteger(total))throw new Error('byte overflow');
  }
  if(total<1)throw new Error('empty bytes');
  return total;
}

function exactRecord(raw:unknown,allowed:readonly string[],path:string):Record<string,unknown>{
  if(raw===null||typeof raw!=='object'||Array.isArray(raw))throw new Error(path);
  const record=raw as Record<string,unknown>;
  for(const key of Object.keys(record))if(!allowed.includes(key))throw new Error(path);
  for(const key of allowed)if(!Object.hasOwn(record,key))throw new Error(path);
  return record;
}
function identifier(value:unknown,path:string,max:number):string{
  const result=text(value,path,max);
  if(!IDENTIFIER.test(result))throw new Error(path);
  return result;
}
function text(value:unknown,path:string,max:number):string{
  if(typeof value!=='string'||value.length<1||value.length>max
    ||value.trim()!==value||/[\u0000-\u001f\u007f]/.test(value))throw new Error(path);
  return value;
}
function stringSet(
  value:unknown,path:string,min:number,max:number,maxLen:number,
):readonly string[]{
  if(!Array.isArray(value)||value.length<min||value.length>max)throw new Error(path);
  const rows=value.map((entry,index)=>text(entry,path+'['+index+']',maxLen));
  if(new Set(rows).size!==rows.length)throw new Error(path);
  return Object.freeze([...rows].sort(lexical));
}
function requireFalse(value:unknown,path:string):void{
  if(value!==false)throw new Error(path);
}
function requireTrue(value:unknown,path:string):void{
  if(value!==true)throw new Error(path);
}
function sameStrings(a:readonly string[],b:readonly string[]):boolean{
  return a.length===b.length&&a.every((value,index)=>value===b[index]);
}
function lexical(a:string,b:string):number{return a<b?-1:a>b?1:0;}

function authorityBoundary(){
  return Object.freeze({
    teacherSelectionAllowed:false as const,
    teacherAdmissionAllowed:false as const,
    trainingStartAllowed:false as const,
    productionAuthorityGranted:false as const,
    providerAuthorityGranted:false as const,
    billingAuthorityGranted:false as const,
    projectArtifactMutationAllowed:false as const,
    aeeExecutionAuthorityGranted:false as const,
    durableModelFleetPromotionAllowed:false as const,
  });
}

function invalid(
  blockers:readonly string[],
  values:Partial<Pick<
    HsmeTeacherDecisionRosterRefreshV1,
    'sourceDecisionSha256'|'qualityBakeoffAssemblySha256'|'rosterMetadataSha256'
  >>={},
):HsmeTeacherDecisionRosterRefreshV1{
  return Object.freeze({
    schemaVersion:HSME_TEACHER_ROSTER_REFRESH_V1_SCHEMA,
    state:'ROSTER_REFRESH_INVALID',
    blockers:Object.freeze([...new Set(blockers)]),
    sourceDecisionSha256:values.sourceDecisionSha256??'UNKNOWN',
    qualityBakeoffAssemblySha256:values.qualityBakeoffAssemblySha256??'UNKNOWN',
    rosterMetadataSha256:values.rosterMetadataSha256??'UNKNOWN',
    refreshedDecisionSha256:'UNKNOWN',
    rosterRefreshSha256:'UNKNOWN',
    refreshedDecision:null,
    ...authorityBoundary(),
  });
}
