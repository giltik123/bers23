import {
  HSME_DENSE_STUDENT_FROZEN_RUN_REPRESENTATION_ADMISSION_V1_SCHEMA,
  hsmeDenseStudentFrozenRunRepresentationAdmissionV1Digest,
  type HsmeDenseStudentFrozenRunRepresentationAdmissionV1,
} from './HsmeDenseStudentFrozenRunRepresentationAdmissionV1.ts';
import {
  HSME_DENSE_STUDENT_REPRESENTATION_EVIDENCE_V1_SCHEMA,
  hsmeDenseStudentRepresentationEvidenceV1Digest,
  type HsmeDenseStudentRepresentationEvidenceV1,
} from './HsmeDenseStudentRepresentationV1.ts';
import {
  type HsmeDenseStudentTrainingHashPortV1,
} from './HsmeDenseStudentTrainingToolchainV1.ts';

export const HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_V1_SCHEMA =
  'BERS_HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_V1' as const;
export const HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_DIGEST_DOMAIN =
  'bers:hsme:dense-student-real-representation-roster:v1\0' as const;
export const HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_CANDIDATE_ID =
  'bers-dense-core-v1-training-target' as const;
export const HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_STEP_COUNTS =
  Object.freeze([2,4,6,8] as const);

const HEX64=/^[0-9a-f]{64}$/;

export interface HsmeDenseStudentRepresentationAdmissionOriginVerifierV1{
  verifyRepresentationAdmission(
    admission:HsmeDenseStudentFrozenRunRepresentationAdmissionV1,
    expectedAdmissionEvidenceSha256:string,
  ):Promise<boolean>;
}

export interface HsmeDenseStudentRepresentationEvidenceOriginVerifierV1{
  verifyRepresentationEvidence(
    representation:HsmeDenseStudentRepresentationEvidenceV1,
    expectedRepresentationEvidenceSha256:string,
  ):Promise<boolean>;
}

export type HsmeDenseStudentRealRepresentationRosterInputV1=Readonly<{
  admission:HsmeDenseStudentFrozenRunRepresentationAdmissionV1;
  expectedAdmissionEvidenceSha256:string;
  representation:HsmeDenseStudentRepresentationEvidenceV1;
  expectedRepresentationEvidenceSha256:string;
}>;

export type HsmeDenseStudentRealRepresentationRosterEntryV1=Readonly<{
  targetStepCount:2|4|6|8;
  frozenRunEvidenceSha256:string;
  trainingRunReceiptSha256:string;
  representationAdmissionSha256:string;
  representationEvidenceSha256:string;
  stagedCheckpointSha256:string;
  stagedCheckpointBytes:number;
  representationArtifactSha256:string;
  representationBytes:number;
  representationMetadataSha256:string;
  exportToolchainSha256:string;
  packDescriptorSha256:string|'UNKNOWN';
}>;

export type HsmeDenseStudentRealRepresentationRosterV1=Readonly<{
  schemaVersion:
    typeof HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_V1_SCHEMA;
  state:
    | 'REAL_REPRESENTATION_ROSTER_INVALID'
    | 'REAL_REPRESENTATION_ROSTER_BLOCKED'
    | 'REAL_REPRESENTATION_ROSTER_READY_NOT_MEASURED';
  blockers:readonly string[];
  candidateId:
    typeof HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_CANDIDATE_ID
    |'UNKNOWN';
  architectureFamily:'COMPACT_DIT'|'UNKNOWN';
  requiredStepCounts:readonly [2,4,6,8];
  entries:readonly HsmeDenseStudentRealRepresentationRosterEntryV1[];
  evidenceSha256:string|'UNKNOWN';
  stepMatrixExecutionGranted:false;
  scheduleSelectionAllowed:false;
  candidateSelectionAllowed:false;
  baselineSelectionAllowed:false;
  checkpointPromotionAllowed:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
  winnerSelectionAllowed:false;
}>;

export class HsmeDenseStudentRealRepresentationRosterV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeDenseStudentRealRepresentationRosterV1Error';
    this.code=code;
  }
}

export async function assembleHsmeDenseStudentRealRepresentationRosterV1(
  inputs:readonly HsmeDenseStudentRealRepresentationRosterInputV1[],
  admissionOrigin:HsmeDenseStudentRepresentationAdmissionOriginVerifierV1,
  representationOrigin:HsmeDenseStudentRepresentationEvidenceOriginVerifierV1,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<HsmeDenseStudentRealRepresentationRosterV1>{
  if(!Array.isArray(inputs)||inputs.length>4){
    return invalid(['REAL_REPRESENTATION_ROSTER_INPUT_COUNT_INVALID']);
  }

  const declaredSteps=inputs
    .map(value=>value?.admission?.targetStepCount)
    .filter((value):value is number=>typeof value==='number');

  if(new Set(declaredSteps).size!==declaredSteps.length){
    return invalid(['REAL_REPRESENTATION_ROSTER_DUPLICATE_STEP_COUNT']);
  }
  if(declaredSteps.some(value=>!isRequiredStep(value))){
    return invalid(['REAL_REPRESENTATION_ROSTER_STEP_COUNT_OUTSIDE_TARGET']);
  }

  if(
    inputs.length!==4
    ||inputs.some(value=>
      !value
      ||value.admission.schemaVersion!==
        HSME_DENSE_STUDENT_FROZEN_RUN_REPRESENTATION_ADMISSION_V1_SCHEMA
      ||value.admission.state!=='FROZEN_RUN_REPRESENTATION_READY_NOT_ADMITTED'
      ||value.admission.blockers.length!==0
      ||value.representation.schemaVersion!==
        HSME_DENSE_STUDENT_REPRESENTATION_EVIDENCE_V1_SCHEMA
      ||value.representation.state!=='REPRESENTATION_READY_NOT_ADMITTED'
      ||value.representation.blockers.length!==0
    )
  ){
    return blocked(['REAL_REPRESENTATION_ROSTER_COMPLETE_READY_SET_REQUIRED']);
  }

  if(
    declaredSteps.length!==4
    ||HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_STEP_COUNTS.some(
      value=>!declaredSteps.includes(value),
    )
  ){
    return invalid(['REAL_REPRESENTATION_ROSTER_STEP_ROSTER_INVALID']);
  }

  const blockers:string[]=[];
  const entries:HsmeDenseStudentRealRepresentationRosterEntryV1[]=[];

  for(const input of inputs){
    const admission=input.admission;
    const representation=input.representation;

    if(admissionAuthorityWidened(admission)){
      blockers.push(
        'REAL_REPRESENTATION_ROSTER_ADMISSION_AUTHORITY_WIDENING:'
        +String(admission.targetStepCount),
      );
      continue;
    }
    if(representationAuthorityWidened(representation)){
      blockers.push(
        'REAL_REPRESENTATION_ROSTER_REPRESENTATION_AUTHORITY_WIDENING:'
        +String(admission.targetStepCount),
      );
      continue;
    }

    let admissionSha:string;
    try{
      admissionSha=
        await hsmeDenseStudentFrozenRunRepresentationAdmissionV1Digest(
          admission,
          hash,
        );
    }catch{
      blockers.push(
        'REAL_REPRESENTATION_ROSTER_ADMISSION_REHASH_INVALID:'
        +String(admission.targetStepCount),
      );
      continue;
    }
    if(
      !HEX64.test(input.expectedAdmissionEvidenceSha256)
      ||admissionSha!==input.expectedAdmissionEvidenceSha256
      ||admissionSha!==admission.admissionEvidenceSha256
    ){
      blockers.push(
        'REAL_REPRESENTATION_ROSTER_ADMISSION_REHASH_MISMATCH:'
        +String(admission.targetStepCount),
      );
      continue;
    }
    if(!await verify(
      ()=>admissionOrigin.verifyRepresentationAdmission(
        admission,
        admissionSha,
      ),
    )){
      blockers.push(
        'REAL_REPRESENTATION_ROSTER_ADMISSION_ORIGIN_UNVERIFIED:'
        +String(admission.targetStepCount),
      );
      continue;
    }

    let representationSha:string;
    try{
      representationSha=
        await hsmeDenseStudentRepresentationEvidenceV1Digest(
          representation,
          hash,
        );
    }catch{
      blockers.push(
        'REAL_REPRESENTATION_ROSTER_REPRESENTATION_REHASH_INVALID:'
        +String(admission.targetStepCount),
      );
      continue;
    }
    if(
      !HEX64.test(input.expectedRepresentationEvidenceSha256)
      ||representationSha!==input.expectedRepresentationEvidenceSha256
      ||representationSha!==representation.evidenceSha256
    ){
      blockers.push(
        'REAL_REPRESENTATION_ROSTER_REPRESENTATION_REHASH_MISMATCH:'
        +String(admission.targetStepCount),
      );
      continue;
    }
    if(!await verify(
      ()=>representationOrigin.verifyRepresentationEvidence(
        representation,
        representationSha,
      ),
    )){
      blockers.push(
        'REAL_REPRESENTATION_ROSTER_REPRESENTATION_ORIGIN_UNVERIFIED:'
        +String(admission.targetStepCount),
      );
      continue;
    }

    const pairBlockers=validatePairBinding(
      admission,
      representation,
      admissionSha,
      representationSha,
    );
    blockers.push(...pairBlockers);
    if(pairBlockers.length>0)continue;

    entries.push(deepFreeze({
      targetStepCount:admission.targetStepCount as 2|4|6|8,
      frozenRunEvidenceSha256:admission.frozenRunEvidenceSha256 as string,
      trainingRunReceiptSha256:admission.trainingRunReceiptSha256 as string,
      representationAdmissionSha256:admissionSha,
      representationEvidenceSha256:representationSha,
      stagedCheckpointSha256:admission.stagedCheckpointSha256 as string,
      stagedCheckpointBytes:admission.stagedCheckpointBytes as number,
      representationArtifactSha256:
        admission.representationArtifactSha256 as string,
      representationBytes:admission.representationBytes as number,
      representationMetadataSha256:
        admission.representationMetadataSha256 as string,
      exportToolchainSha256:admission.exportToolchainSha256 as string,
      packDescriptorSha256:admission.packDescriptorSha256,
    }));
  }

  if(blockers.length>0){
    return invalid(blockers,entries);
  }

  entries.sort((left,right)=>left.targetStepCount-right.targetStepCount);
  if(
    entries.length!==4
    ||entries.some(
      (entry,index)=>
        entry.targetStepCount!==
        HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_STEP_COUNTS[index],
    )
  ){
    return invalid(['REAL_REPRESENTATION_ROSTER_CANONICAL_ORDER_INVALID'],entries);
  }

  const readyPayload={
    schemaVersion:HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_V1_SCHEMA,
    state:'REAL_REPRESENTATION_ROSTER_READY_NOT_MEASURED' as const,
    blockers:Object.freeze([]) as readonly string[],
    candidateId:HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_CANDIDATE_ID,
    architectureFamily:'COMPACT_DIT' as const,
    requiredStepCounts:
      HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_STEP_COUNTS,
    entries:Object.freeze(entries),
    ...authorityBoundary(),
  };
  const evidenceSha256=await digest(readyPayload,hash);
  return deepFreeze({...readyPayload,evidenceSha256});
}

export async function hsmeDenseStudentRealRepresentationRosterV1Digest(
  value:HsmeDenseStudentRealRepresentationRosterV1,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  if(
    value.schemaVersion!==HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_V1_SCHEMA
    ||value.state!=='REAL_REPRESENTATION_ROSTER_READY_NOT_MEASURED'
    ||value.blockers.length!==0
    ||value.entries.length!==4
    ||value.evidenceSha256==='UNKNOWN'
  ){
    throw new HsmeDenseStudentRealRepresentationRosterV1Error(
      'hsme_real_representation_roster_digest_state',
      'only READY_NOT_MEASURED rosters are digestible',
    );
  }
  const {evidenceSha256:_ignored,...payload}=value;
  return digest(payload,hash);
}

function validatePairBinding(
  admission:HsmeDenseStudentFrozenRunRepresentationAdmissionV1,
  representation:HsmeDenseStudentRepresentationEvidenceV1,
  admissionSha:string,
  representationSha:string,
):string[]{
  const step=String(admission.targetStepCount);
  const blockers:string[]=[];

  if(
    admission.candidateId!==
      HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_CANDIDATE_ID
    ||representation.candidateId!==
      HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_CANDIDATE_ID
    ||representation.architectureFamily!=='COMPACT_DIT'
  ){
    blockers.push('REAL_REPRESENTATION_ROSTER_TARGET_IDENTITY_MISMATCH:'+step);
  }
  if(
    admission.representationEvidenceSha256!==representationSha
    ||admission.representationEvidenceSha256!==representation.evidenceSha256
  ){
    blockers.push('REAL_REPRESENTATION_ROSTER_EVIDENCE_BINDING_MISMATCH:'+step);
  }
  if(
    admission.targetStepCount!==representation.targetStepCount
    ||!isRequiredStep(admission.targetStepCount)
  ){
    blockers.push('REAL_REPRESENTATION_ROSTER_STEP_BINDING_MISMATCH:'+step);
  }
  if(
    admission.frozenRunEvidenceSha256==='UNKNOWN'
    ||admission.trainingRunReceiptSha256==='UNKNOWN'
    ||admission.stagedCheckpointSha256==='UNKNOWN'
    ||admission.stagedCheckpointBytes==='UNKNOWN'
    ||admission.representationArtifactSha256==='UNKNOWN'
    ||admission.representationBytes==='UNKNOWN'
    ||admission.representationMetadataSha256==='UNKNOWN'
    ||admission.exportToolchainSha256==='UNKNOWN'
    ||admissionSha!==admission.admissionEvidenceSha256
  ){
    blockers.push('REAL_REPRESENTATION_ROSTER_ADMISSION_INCOMPLETE:'+step);
  }
  if(
    representation.stagedCheckpointSha256!==admission.stagedCheckpointSha256
    ||representation.stagedCheckpointBytes!==admission.stagedCheckpointBytes
    ||representation.representationArtifactSha256!==
      admission.representationArtifactSha256
    ||representation.representationBytes!==admission.representationBytes
    ||representation.representationMetadataSha256!==
      admission.representationMetadataSha256
    ||representation.exportToolchainSha256!==admission.exportToolchainSha256
    ||representation.packDescriptorSha256!==admission.packDescriptorSha256
  ){
    blockers.push('REAL_REPRESENTATION_ROSTER_REPRESENTATION_BINDING_MISMATCH:'+step);
  }

  return blockers;
}

function invalid(
  blockers:readonly string[],
  entries:readonly HsmeDenseStudentRealRepresentationRosterEntryV1[]=[],
):HsmeDenseStudentRealRepresentationRosterV1{
  return deepFreeze({
    schemaVersion:HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_V1_SCHEMA,
    state:'REAL_REPRESENTATION_ROSTER_INVALID',
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    candidateId:'UNKNOWN',
    architectureFamily:'UNKNOWN',
    requiredStepCounts:
      HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_STEP_COUNTS,
    entries:Object.freeze([...entries].sort(
      (left,right)=>left.targetStepCount-right.targetStepCount,
    )),
    evidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

function blocked(
  blockers:readonly string[],
):HsmeDenseStudentRealRepresentationRosterV1{
  return deepFreeze({
    schemaVersion:HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_V1_SCHEMA,
    state:'REAL_REPRESENTATION_ROSTER_BLOCKED',
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    candidateId:'UNKNOWN',
    architectureFamily:'UNKNOWN',
    requiredStepCounts:
      HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_STEP_COUNTS,
    entries:Object.freeze([]),
    evidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

function admissionAuthorityWidened(
  value:HsmeDenseStudentFrozenRunRepresentationAdmissionV1,
):boolean{
  return value.checkpointPromotionAllowed!==false
    ||value.modelInstallAllowed!==false
    ||value.modelFleetPromotionAllowed!==false
    ||value.durableModelFleetPromotionAllowed!==false
    ||value.productionAuthorityGranted!==false
    ||value.providerAuthorityGranted!==false
    ||value.billingAuthorityGranted!==false
    ||value.projectArtifactMutationAllowed!==false
    ||value.aeeExecutionAuthorityGranted!==false
    ||value.winnerSelectionAllowed!==false;
}

function representationAuthorityWidened(
  value:HsmeDenseStudentRepresentationEvidenceV1,
):boolean{
  return value.checkpointPromotionAllowed!==false
    ||value.modelInstallAllowed!==false
    ||value.modelFleetPromotionAllowed!==false
    ||value.durableModelFleetPromotionAllowed!==false
    ||value.productionAuthorityGranted!==false
    ||value.providerAuthorityGranted!==false
    ||value.billingAuthorityGranted!==false
    ||value.projectArtifactMutationAllowed!==false
    ||value.aeeExecutionAuthorityGranted!==false
    ||value.winnerSelectionAllowed!==false;
}

function authorityBoundary(){
  return Object.freeze({
    stepMatrixExecutionGranted:false as const,
    scheduleSelectionAllowed:false as const,
    candidateSelectionAllowed:false as const,
    baselineSelectionAllowed:false as const,
    checkpointPromotionAllowed:false as const,
    modelInstallAllowed:false as const,
    modelFleetPromotionAllowed:false as const,
    durableModelFleetPromotionAllowed:false as const,
    productionAuthorityGranted:false as const,
    providerAuthorityGranted:false as const,
    billingAuthorityGranted:false as const,
    projectArtifactMutationAllowed:false as const,
    aeeExecutionAuthorityGranted:false as const,
    winnerSelectionAllowed:false as const,
  });
}

async function digest(
  value:unknown,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  const result=await hash.sha256(new TextEncoder().encode(
    HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_DIGEST_DOMAIN
    +JSON.stringify(value),
  ));
  if(!HEX64.test(result)){
    throw new HsmeDenseStudentRealRepresentationRosterV1Error(
      'hsme_real_representation_roster_hash_port',
      'hash port must return lowercase SHA-256',
    );
  }
  return result;
}

function isRequiredStep(value:unknown):value is 2|4|6|8{
  return value===2||value===4||value===6||value===8;
}

async function verify(run:()=>Promise<boolean>):Promise<boolean>{
  try{return await run()===true;}catch{return false;}
}

function lexical(left:string,right:string):number{
  return left<right?-1:left>right?1:0;
}

function deepFreeze<T>(value:T):T{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const child of Object.values(value as Record<string,unknown>)){
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}
