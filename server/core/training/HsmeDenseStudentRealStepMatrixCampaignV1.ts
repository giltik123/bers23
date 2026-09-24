import {
  HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_CANDIDATE_ID,
  HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_STEP_COUNTS,
  HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_V1_SCHEMA,
  hsmeDenseStudentRealRepresentationRosterV1Digest,
  type HsmeDenseStudentRealRepresentationRosterEntryV1,
  type HsmeDenseStudentRealRepresentationRosterV1,
} from './HsmeDenseStudentRealRepresentationRosterV1.ts';
import {
  HSME_DENSE_STUDENT_REPRESENTATION_EVIDENCE_V1_SCHEMA,
  hsmeDenseStudentRepresentationEvidenceV1Digest,
  type HsmeDenseStudentRepresentationEvidenceV1,
} from './HsmeDenseStudentRepresentationV1.ts';
import {
  HSME_DENSE_STUDENT_STEP_MATRIX_EVIDENCE_V1_SCHEMA,
  hsmeDenseStudentStepMatrixEvidenceV1Digest,
  type HsmeDenseStudentStepMatrixEvidenceV1,
} from './HsmeDenseStudentStepMatrixV1.ts';
import type {
  HsmeDenseStudentTrainingHashPortV1,
} from './HsmeDenseStudentTrainingToolchainV1.ts';

export const HSME_DENSE_STUDENT_REAL_STEP_MATRIX_CAMPAIGN_V1_SCHEMA =
  'BERS_HSME_DENSE_STUDENT_REAL_STEP_MATRIX_CAMPAIGN_V1' as const;
export const HSME_DENSE_STUDENT_REAL_STEP_MATRIX_CAMPAIGN_DIGEST_DOMAIN =
  'bers:hsme:dense-student-real-step-matrix-campaign:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;

export interface HsmeDenseStudentRealRepresentationRosterOriginVerifierV1{
  verifyRealRepresentationRoster(
    roster:HsmeDenseStudentRealRepresentationRosterV1,
    expectedRosterEvidenceSha256:string,
  ):Promise<boolean>;
}

export interface HsmeDenseStudentRealCampaignRepresentationOriginVerifierV1{
  verifyRepresentationEvidence(
    representation:HsmeDenseStudentRepresentationEvidenceV1,
    expectedRepresentationEvidenceSha256:string,
  ):Promise<boolean>;
}

export interface HsmeDenseStudentRealStepMatrixOriginVerifierV1{
  verifyStepMatrixEvidence(
    matrix:HsmeDenseStudentStepMatrixEvidenceV1,
    expectedStepMatrixEvidenceSha256:string,
  ):Promise<boolean>;
}

export type HsmeDenseStudentRealStepMatrixCampaignInputV1=Readonly<{
  trainingTargetStepCount:2|4|6|8;
  representation:HsmeDenseStudentRepresentationEvidenceV1;
  expectedRepresentationEvidenceSha256:string;
  stepMatrix:HsmeDenseStudentStepMatrixEvidenceV1;
  expectedStepMatrixEvidenceSha256:string;
}>;

export type HsmeDenseStudentRealStepMatrixCampaignEntryV1=Readonly<{
  trainingTargetStepCount:2|4|6|8;
  representationAdmissionSha256:string;
  representationEvidenceSha256:string;
  representationArtifactSha256:string;
  representationBytes:number;
  stepMatrixEvidenceSha256:string;
  benchmarkBindingSha256:string;
  benchmarkResultSha256:string;
  benchmarkAttemptId:string;
}>;

export type HsmeDenseStudentRealStepMatrixCampaignV1=Readonly<{
  schemaVersion:typeof HSME_DENSE_STUDENT_REAL_STEP_MATRIX_CAMPAIGN_V1_SCHEMA;
  state:
    | 'REAL_STEP_MATRIX_CAMPAIGN_INVALID'
    | 'REAL_STEP_MATRIX_CAMPAIGN_BLOCKED'
    | 'REAL_STEP_MATRIX_CAMPAIGN_READY_NOT_SELECTED';
  blockers:readonly string[];
  rosterEvidenceSha256:string|'UNKNOWN';
  candidateId:
    typeof HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_CANDIDATE_ID
    |'UNKNOWN';
  architectureFamily:'COMPACT_DIT'|'UNKNOWN';
  trainingTargetStepCounts:readonly [2,4,6,8];
  benchmarkBindingSha256:string|'UNKNOWN';
  entries:readonly HsmeDenseStudentRealStepMatrixCampaignEntryV1[];
  evidenceSha256:string|'UNKNOWN';
  weightedAggregateScoreAllowed:false;
  efficiencyMayOverrideQualityFailure:false;
  scheduleSelectionAllowed:false;
  trainingVariantSelectionAllowed:false;
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

export class HsmeDenseStudentRealStepMatrixCampaignV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeDenseStudentRealStepMatrixCampaignV1Error';
    this.code=code;
  }
}

export async function assembleHsmeDenseStudentRealStepMatrixCampaignV1(
  roster:HsmeDenseStudentRealRepresentationRosterV1,
  expectedRosterEvidenceSha256:string,
  rosterOrigin:HsmeDenseStudentRealRepresentationRosterOriginVerifierV1,
  inputs:readonly HsmeDenseStudentRealStepMatrixCampaignInputV1[],
  representationOrigin:
    HsmeDenseStudentRealCampaignRepresentationOriginVerifierV1,
  matrixOrigin:HsmeDenseStudentRealStepMatrixOriginVerifierV1,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<HsmeDenseStudentRealStepMatrixCampaignV1>{
  if(!Array.isArray(inputs)||inputs.length>4){
    return invalid(['REAL_STEP_MATRIX_CAMPAIGN_INPUT_COUNT_INVALID']);
  }
  const declaredSteps=inputs.map(value=>value?.trainingTargetStepCount);
  if(new Set(declaredSteps).size!==declaredSteps.length){
    return invalid(['REAL_STEP_MATRIX_CAMPAIGN_DUPLICATE_TRAINING_STEP']);
  }
  if(declaredSteps.some(value=>!isRequiredStep(value))){
    return invalid(['REAL_STEP_MATRIX_CAMPAIGN_TRAINING_STEP_OUTSIDE_TARGET']);
  }

  if(
    !roster
    ||roster.schemaVersion!==
      HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_V1_SCHEMA
    ||roster.state!=='REAL_REPRESENTATION_ROSTER_READY_NOT_MEASURED'
    ||roster.blockers.length!==0
  ){
    return blocked(['REAL_STEP_MATRIX_CAMPAIGN_READY_ROSTER_REQUIRED']);
  }
  if(rosterAuthorityWidened(roster)){
    return invalid(['REAL_STEP_MATRIX_CAMPAIGN_ROSTER_AUTHORITY_WIDENING']);
  }
  if(
    roster.candidateId!==
      HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_CANDIDATE_ID
    ||roster.architectureFamily!=='COMPACT_DIT'
    ||roster.entries.length!==4
  ){
    return invalid(['REAL_STEP_MATRIX_CAMPAIGN_ROSTER_IDENTITY_INVALID']);
  }

  let rosterEvidenceSha256:string;
  try{
    rosterEvidenceSha256=
      await hsmeDenseStudentRealRepresentationRosterV1Digest(roster,hash);
  }catch{
    return invalid(['REAL_STEP_MATRIX_CAMPAIGN_ROSTER_REHASH_INVALID']);
  }
  if(
    !HEX64.test(expectedRosterEvidenceSha256)
    ||rosterEvidenceSha256!==expectedRosterEvidenceSha256
    ||rosterEvidenceSha256!==roster.evidenceSha256
  ){
    return invalid(
      ['REAL_STEP_MATRIX_CAMPAIGN_ROSTER_REHASH_MISMATCH'],
      {rosterEvidenceSha256},
    );
  }
  if(!await verify(
    ()=>rosterOrigin.verifyRealRepresentationRoster(
      roster,
      rosterEvidenceSha256,
    ),
  )){
    return invalid(
      ['REAL_STEP_MATRIX_CAMPAIGN_ROSTER_ORIGIN_UNVERIFIED'],
      {rosterEvidenceSha256},
    );
  }

  if(
    inputs.length!==4
    ||HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_STEP_COUNTS.some(
      step=>!declaredSteps.includes(step),
    )
  ){
    return blocked(
      ['REAL_STEP_MATRIX_CAMPAIGN_COMPLETE_FOUR_VARIANT_SET_REQUIRED'],
      {rosterEvidenceSha256},
    );
  }

  if(inputs.some(value=>
    value.representation.schemaVersion!==
      HSME_DENSE_STUDENT_REPRESENTATION_EVIDENCE_V1_SCHEMA
    ||value.representation.state!=='REPRESENTATION_READY_NOT_ADMITTED'
    ||value.representation.blockers.length!==0
    ||value.stepMatrix.schemaVersion!==
      HSME_DENSE_STUDENT_STEP_MATRIX_EVIDENCE_V1_SCHEMA
    ||value.stepMatrix.state!=='STEP_MATRIX_READY_NOT_SELECTED'
    ||value.stepMatrix.blockers.length!==0
  )){
    return blocked(
      ['REAL_STEP_MATRIX_CAMPAIGN_READY_REPRESENTATIONS_AND_MATRICES_REQUIRED'],
      {rosterEvidenceSha256},
    );
  }

  const blockers:string[]=[];
  const entries:HsmeDenseStudentRealStepMatrixCampaignEntryV1[]=[];
  let benchmarkBindingSha256:string|'UNKNOWN'='UNKNOWN';
  let referenceMeasurementContexts:
    ReadonlyMap<string,string>|null=null;

  for(const input of inputs){
    const step=input.trainingTargetStepCount;
    const rosterEntry=roster.entries.find(
      value=>value.targetStepCount===step,
    );
    if(!rosterEntry){
      blockers.push('REAL_STEP_MATRIX_CAMPAIGN_ROSTER_ENTRY_MISSING:'+step);
      continue;
    }
    if(
      representationAuthorityWidened(input.representation)
      ||matrixAuthorityWidened(input.stepMatrix)
    ){
      blockers.push('REAL_STEP_MATRIX_CAMPAIGN_AUTHORITY_WIDENING:'+step);
      continue;
    }

    let representationSha:string;
    try{
      representationSha=
        await hsmeDenseStudentRepresentationEvidenceV1Digest(
          input.representation,
          hash,
        );
    }catch{
      blockers.push('REAL_STEP_MATRIX_CAMPAIGN_REPRESENTATION_REHASH_INVALID:'+step);
      continue;
    }
    if(
      !HEX64.test(input.expectedRepresentationEvidenceSha256)
      ||representationSha!==input.expectedRepresentationEvidenceSha256
      ||representationSha!==input.representation.evidenceSha256
    ){
      blockers.push('REAL_STEP_MATRIX_CAMPAIGN_REPRESENTATION_REHASH_MISMATCH:'+step);
      continue;
    }
    if(!await verify(
      ()=>representationOrigin.verifyRepresentationEvidence(
        input.representation,
        representationSha,
      ),
    )){
      blockers.push('REAL_STEP_MATRIX_CAMPAIGN_REPRESENTATION_ORIGIN_UNVERIFIED:'+step);
      continue;
    }

    let matrixSha:string;
    try{
      matrixSha=await hsmeDenseStudentStepMatrixEvidenceV1Digest(
        input.stepMatrix,
        hash,
      );
    }catch{
      blockers.push('REAL_STEP_MATRIX_CAMPAIGN_MATRIX_REHASH_INVALID:'+step);
      continue;
    }
    if(
      !HEX64.test(input.expectedStepMatrixEvidenceSha256)
      ||matrixSha!==input.expectedStepMatrixEvidenceSha256
      ||matrixSha!==input.stepMatrix.evidenceSha256
    ){
      blockers.push('REAL_STEP_MATRIX_CAMPAIGN_MATRIX_REHASH_MISMATCH:'+step);
      continue;
    }
    if(!await verify(
      ()=>matrixOrigin.verifyStepMatrixEvidence(input.stepMatrix,matrixSha),
    )){
      blockers.push('REAL_STEP_MATRIX_CAMPAIGN_MATRIX_ORIGIN_UNVERIFIED:'+step);
      continue;
    }

    const pairBlockers=validatePair(
      step,
      rosterEntry,
      input.representation,
      representationSha,
      input.stepMatrix,
      matrixSha,
    );
    blockers.push(...pairBlockers);
    if(pairBlockers.length>0)continue;

    if(benchmarkBindingSha256==='UNKNOWN'){
      benchmarkBindingSha256=input.stepMatrix.benchmarkBindingSha256 as string;
    }else if(
      benchmarkBindingSha256!==input.stepMatrix.benchmarkBindingSha256
    ){
      blockers.push('REAL_STEP_MATRIX_CAMPAIGN_BENCHMARK_BINDING_DRIFT:'+step);
      continue;
    }

    const contexts=measurementContexts(input.stepMatrix);
    if(referenceMeasurementContexts===null){
      referenceMeasurementContexts=contexts;
    }else if(!sameContexts(referenceMeasurementContexts,contexts)){
      blockers.push('REAL_STEP_MATRIX_CAMPAIGN_MEASUREMENT_CONTEXT_DRIFT:'+step);
      continue;
    }

    entries.push(deepFreeze({
      trainingTargetStepCount:step,
      representationAdmissionSha256:rosterEntry.representationAdmissionSha256,
      representationEvidenceSha256:representationSha,
      representationArtifactSha256:
        input.representation.representationArtifactSha256 as string,
      representationBytes:input.representation.representationBytes as number,
      stepMatrixEvidenceSha256:matrixSha,
      benchmarkBindingSha256:input.stepMatrix.benchmarkBindingSha256 as string,
      benchmarkResultSha256:input.stepMatrix.benchmarkResultSha256 as string,
      benchmarkAttemptId:input.stepMatrix.benchmarkAttemptId as string,
    }));
  }

  if(blockers.length>0){
    return invalid(blockers,{
      rosterEvidenceSha256,
      benchmarkBindingSha256,
      entries,
    });
  }

  entries.sort(
    (left,right)=>left.trainingTargetStepCount-right.trainingTargetStepCount,
  );
  if(
    entries.length!==4
    ||entries.some(
      (entry,index)=>
        entry.trainingTargetStepCount!==
        HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_STEP_COUNTS[index],
    )
    ||benchmarkBindingSha256==='UNKNOWN'
  ){
    return invalid(
      ['REAL_STEP_MATRIX_CAMPAIGN_CANONICAL_ROSTER_INVALID'],
      {rosterEvidenceSha256,benchmarkBindingSha256,entries},
    );
  }

  const readyPayload={
    schemaVersion:HSME_DENSE_STUDENT_REAL_STEP_MATRIX_CAMPAIGN_V1_SCHEMA,
    state:'REAL_STEP_MATRIX_CAMPAIGN_READY_NOT_SELECTED' as const,
    blockers:Object.freeze([]) as readonly string[],
    rosterEvidenceSha256,
    candidateId:HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_CANDIDATE_ID,
    architectureFamily:'COMPACT_DIT' as const,
    trainingTargetStepCounts:
      HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_STEP_COUNTS,
    benchmarkBindingSha256,
    entries:Object.freeze(entries),
    ...authorityBoundary(),
  };
  const evidenceSha256=await digest(readyPayload,hash);
  return deepFreeze({...readyPayload,evidenceSha256});
}

export async function hsmeDenseStudentRealStepMatrixCampaignV1Digest(
  value:HsmeDenseStudentRealStepMatrixCampaignV1,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  if(
    value.schemaVersion!==HSME_DENSE_STUDENT_REAL_STEP_MATRIX_CAMPAIGN_V1_SCHEMA
    ||value.state!=='REAL_STEP_MATRIX_CAMPAIGN_READY_NOT_SELECTED'
    ||value.blockers.length!==0
    ||value.entries.length!==4
    ||value.rosterEvidenceSha256==='UNKNOWN'
    ||value.benchmarkBindingSha256==='UNKNOWN'
    ||value.evidenceSha256==='UNKNOWN'
  ){
    throw new HsmeDenseStudentRealStepMatrixCampaignV1Error(
      'hsme_real_step_matrix_campaign_digest_state',
      'only READY_NOT_SELECTED campaign evidence is digestible',
    );
  }
  const {evidenceSha256:_ignored,...payload}=value;
  return digest(payload,hash);
}

function validatePair(
  step:2|4|6|8,
  rosterEntry:HsmeDenseStudentRealRepresentationRosterEntryV1,
  representation:HsmeDenseStudentRepresentationEvidenceV1,
  representationSha:string,
  matrix:HsmeDenseStudentStepMatrixEvidenceV1,
  matrixSha:string,
):string[]{
  const blockers:string[]=[];
  if(
    representation.candidateId!==
      HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_CANDIDATE_ID
    ||representation.architectureFamily!=='COMPACT_DIT'
    ||representation.targetStepCount!==step
    ||matrix.candidateId!==
      HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_CANDIDATE_ID
  ){
    blockers.push('REAL_STEP_MATRIX_CAMPAIGN_TARGET_BINDING_MISMATCH:'+step);
  }
  if(
    rosterEntry.representationEvidenceSha256!==representationSha
    ||matrix.representationEvidenceSha256!==representationSha
  ){
    blockers.push('REAL_STEP_MATRIX_CAMPAIGN_REPRESENTATION_BINDING_MISMATCH:'+step);
  }
  if(
    representation.representationArtifactSha256==='UNKNOWN'
    ||representation.representationBytes==='UNKNOWN'
    ||rosterEntry.representationArtifactSha256!==
      representation.representationArtifactSha256
    ||rosterEntry.representationBytes!==representation.representationBytes
    ||matrix.representationArtifactSha256!==
      representation.representationArtifactSha256
    ||matrix.representationBytes!==representation.representationBytes
  ){
    blockers.push('REAL_STEP_MATRIX_CAMPAIGN_ARTIFACT_BINDING_MISMATCH:'+step);
  }
  if(
    matrix.rows.length!==8
    ||matrix.benchmarkBindingSha256==='UNKNOWN'
    ||matrix.benchmarkResultSha256==='UNKNOWN'
    ||matrix.benchmarkAttemptId==='UNKNOWN'
    ||matrixSha!==matrix.evidenceSha256
  ){
    blockers.push('REAL_STEP_MATRIX_CAMPAIGN_MATRIX_INCOMPLETE:'+step);
  }
  return blockers;
}

function measurementContexts(
  matrix:HsmeDenseStudentStepMatrixEvidenceV1,
):ReadonlyMap<string,string>{
  const entries=matrix.rows.map(row=>[
    row.capability+'\0'+row.stepCount,
    JSON.stringify({
      hardwareProfileSha256:row.hardwareProfileSha256,
      runtimeIdentity:row.runtimeIdentity,
      providerIdentity:row.providerIdentity,
      measurementMethodSha256:row.measurementMethodSha256,
    }),
  ] as const);
  return new Map(entries.sort((a,b)=>lexical(a[0],b[0])));
}

function sameContexts(
  left:ReadonlyMap<string,string>,
  right:ReadonlyMap<string,string>,
):boolean{
  if(left.size!==right.size)return false;
  for(const [key,value] of left){
    if(right.get(key)!==value)return false;
  }
  return true;
}

type PartialOutput=Partial<Pick<
  HsmeDenseStudentRealStepMatrixCampaignV1,
  'rosterEvidenceSha256'|'benchmarkBindingSha256'|'entries'
>>;

function invalid(
  blockers:readonly string[],
  input:PartialOutput={},
):HsmeDenseStudentRealStepMatrixCampaignV1{
  return deepFreeze({
    schemaVersion:HSME_DENSE_STUDENT_REAL_STEP_MATRIX_CAMPAIGN_V1_SCHEMA,
    state:'REAL_STEP_MATRIX_CAMPAIGN_INVALID',
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    rosterEvidenceSha256:input.rosterEvidenceSha256??'UNKNOWN',
    candidateId:'UNKNOWN',
    architectureFamily:'UNKNOWN',
    trainingTargetStepCounts:
      HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_STEP_COUNTS,
    benchmarkBindingSha256:input.benchmarkBindingSha256??'UNKNOWN',
    entries:Object.freeze([...(input.entries??[])].sort(
      (left,right)=>left.trainingTargetStepCount-right.trainingTargetStepCount,
    )),
    evidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

function blocked(
  blockers:readonly string[],
  input:PartialOutput={},
):HsmeDenseStudentRealStepMatrixCampaignV1{
  return deepFreeze({
    schemaVersion:HSME_DENSE_STUDENT_REAL_STEP_MATRIX_CAMPAIGN_V1_SCHEMA,
    state:'REAL_STEP_MATRIX_CAMPAIGN_BLOCKED',
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    rosterEvidenceSha256:input.rosterEvidenceSha256??'UNKNOWN',
    candidateId:'UNKNOWN',
    architectureFamily:'UNKNOWN',
    trainingTargetStepCounts:
      HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_STEP_COUNTS,
    benchmarkBindingSha256:input.benchmarkBindingSha256??'UNKNOWN',
    entries:Object.freeze([]),
    evidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

function rosterAuthorityWidened(
  value:HsmeDenseStudentRealRepresentationRosterV1,
):boolean{
  return value.stepMatrixExecutionGranted!==false
    ||value.scheduleSelectionAllowed!==false
    ||value.candidateSelectionAllowed!==false
    ||value.baselineSelectionAllowed!==false
    ||value.checkpointPromotionAllowed!==false
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

function matrixAuthorityWidened(
  value:HsmeDenseStudentStepMatrixEvidenceV1,
):boolean{
  return value.weightedAggregateScoreAllowed!==false
    ||value.efficiencyMayOverrideQualityFailure!==false
    ||value.scheduleSelectionAllowed!==false
    ||value.candidateSelectionAllowed!==false
    ||value.checkpointPromotionAllowed!==false
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
    weightedAggregateScoreAllowed:false as const,
    efficiencyMayOverrideQualityFailure:false as const,
    scheduleSelectionAllowed:false as const,
    trainingVariantSelectionAllowed:false as const,
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
    HSME_DENSE_STUDENT_REAL_STEP_MATRIX_CAMPAIGN_DIGEST_DOMAIN
    +JSON.stringify(value),
  ));
  if(!HEX64.test(result)){
    throw new HsmeDenseStudentRealStepMatrixCampaignV1Error(
      'hsme_real_step_matrix_campaign_hash_port',
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
