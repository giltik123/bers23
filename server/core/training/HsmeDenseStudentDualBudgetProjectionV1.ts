import {
  hsmeDenseStudentRepresentationEvidenceV1Digest,
  type HsmeDenseStudentRepresentationEvidenceV1,
} from './HsmeDenseStudentRepresentationV1.ts';
import {
  HSME_DENSE_STUDENT_FIXED_CAPABILITIES_V1,
  HSME_DENSE_STUDENT_FIXED_STEP_COUNTS_V1,
  hsmeDenseStudentStepMatrixEvidenceV1Digest,
  type HsmeDenseStudentStepMatrixEvidenceV1,
} from './HsmeDenseStudentStepMatrixV1.ts';
import type {
  HsmeDenseStudentTrainingHashPortV1,
} from './HsmeDenseStudentTrainingToolchainV1.ts';
import {
  normalizeHsmeDenseDualBudgetEvidenceV1,
  type HsmeDenseDualBudgetCandidateV1,
  type HsmeDenseDualBudgetEvidenceV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineDualBudgetEvidenceV1.ts';
import {
  hsmePackDescriptorV1Digest,
} from '../../../src/platform/creative/local-ai/hsme/HsmePackV1.ts';


export const HSME_DENSE_STUDENT_DUAL_BUDGET_PROJECTION_V1_SCHEMA =
  'BERS_HSME_DENSE_STUDENT_DUAL_BUDGET_PROJECTION_V1' as const;
export const HSME_DENSE_BASELINE_DUAL_BUDGET_TEMPLATE_DIGEST_DOMAIN =
  'bers:hsme:dense-baseline-dual-budget-template:v1\0' as const;
export const HSME_DENSE_BASELINE_DUAL_BUDGET_PROJECTED_DIGEST_DOMAIN =
  'bers:hsme:dense-baseline-dual-budget-projected:v1\0' as const;
export const HSME_DENSE_STUDENT_DUAL_BUDGET_PROJECTION_DIGEST_DOMAIN =
  'bers:hsme:dense-student-dual-budget-projection:v1\0' as const;

export const HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID =
  'bers-dense-core-v1-training-target' as const;

const HEX64=/^[0-9a-f]{64}$/;

export interface HsmeDenseStudentDualBudgetTemplateOriginVerifierV1{
  verifyDualBudgetTemplate(
    template:HsmeDenseDualBudgetEvidenceV1,
    expectedTemplateSha256:string,
  ):Promise<boolean>;
}

export type HsmeDenseStudentDualBudgetProjectionV1=Readonly<{
  schemaVersion:typeof HSME_DENSE_STUDENT_DUAL_BUDGET_PROJECTION_V1_SCHEMA;
  state:'DUAL_BUDGET_PROJECTION_READY_NOT_FROZEN';
  representationEvidenceSha256:string;
  stepMatrixEvidenceSha256:string;
  sourceTemplateSha256:string;
  projectedEvidenceSha256:string;
  changedCandidateIds:readonly [typeof HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID];
  projectedCandidate:HsmeDenseDualBudgetCandidateV1;
  projectedEvidence:HsmeDenseDualBudgetEvidenceV1;
  projectionEvidenceSha256:string;
  baselineSelectionAllowed:false;
  scheduleSelectionAllowed:false;
  candidateSelectionAllowed:false;
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

export class HsmeDenseStudentDualBudgetProjectionV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeDenseStudentDualBudgetProjectionV1Error';
    this.code=code;
  }
}

export async function projectHsmeDenseStudentDualBudgetV1(
  representation:HsmeDenseStudentRepresentationEvidenceV1,
  stepMatrix:HsmeDenseStudentStepMatrixEvidenceV1,
  rawTemplate:unknown,
  expectedTemplateSha256:string,
  templateOrigin:HsmeDenseStudentDualBudgetTemplateOriginVerifierV1,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<HsmeDenseStudentDualBudgetProjectionV1>{
  validateRepresentation(representation);
  validateStepMatrix(stepMatrix);

  const representationEvidenceSha256=
    await hsmeDenseStudentRepresentationEvidenceV1Digest(
      representation,
      hash,
    );
  if(representationEvidenceSha256!==representation.evidenceSha256){
    fail(
      'hsme_dense_projection_representation_rehash',
      'representation evidence digest mismatch',
    );
  }
  const stepMatrixEvidenceSha256=
    await hsmeDenseStudentStepMatrixEvidenceV1Digest(stepMatrix,hash);
  if(stepMatrixEvidenceSha256!==stepMatrix.evidenceSha256){
    fail(
      'hsme_dense_projection_matrix_rehash',
      'step-matrix evidence digest mismatch',
    );
  }
  if(
    stepMatrix.representationEvidenceSha256!==representationEvidenceSha256
    ||stepMatrix.representationArtifactSha256!==
      representation.representationArtifactSha256
    ||stepMatrix.representationBytes!==representation.representationBytes
    ||stepMatrix.candidateId!==representation.candidateId
  ){
    fail(
      'hsme_dense_projection_source_binding',
      'step matrix is not bound to exact representation evidence',
    );
  }

  await assertOneRootSelfContainedRepresentation(representation,hash);

  let template:HsmeDenseDualBudgetEvidenceV1;
  try{
    template=normalizeHsmeDenseDualBudgetEvidenceV1(rawTemplate);
  }catch(error){
    fail(
      'hsme_dense_projection_template_invalid',
      error instanceof Error?error.message:'dual-budget template invalid',
    );
  }
  if(!HEX64.test(expectedTemplateSha256)){
    fail(
      'hsme_dense_projection_expected_template_digest',
      'expected template digest must be lowercase SHA-256',
    );
  }
  const sourceTemplateSha256=await digest(
    HSME_DENSE_BASELINE_DUAL_BUDGET_TEMPLATE_DIGEST_DOMAIN,
    template,
    hash,
  );
  if(sourceTemplateSha256!==expectedTemplateSha256){
    fail(
      'hsme_dense_projection_template_rehash',
      'dual-budget template digest mismatch',
    );
  }
  if(!await verify(
    ()=>templateOrigin.verifyDualBudgetTemplate(template,sourceTemplateSha256),
  )){
    fail(
      'hsme_dense_projection_template_origin',
      'dual-budget template origin unverified',
    );
  }

  const targetRows=template.candidates.filter(
    value=>value.candidateId===HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID,
  );
  if(targetRows.length!==1){
    fail(
      'hsme_dense_projection_target_roster',
      'dual-budget template must contain target candidate exactly once',
    );
  }
  const sourceTarget=targetRows[0];
  assertTargetProjectionSource(sourceTarget);

  const installedBytes=representation.representationBytes;
  if(typeof installedBytes!=='number'){
    fail(
      'hsme_dense_projection_installed_unresolved',
      'representation bytes must be measured',
    );
  }
  const rows=stepMatrix.rows;
  validateMatrixCompleteness(rows);

  const projectedCandidate:HsmeDenseDualBudgetCandidateV1=deepFreeze({
    candidateId:HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID,
    installed:{
      mandatoryInstalledBytes:installedBytes,
      optionalInstalledBytes:0,
      firstUseDownloadBytes:installedBytes,
      knownInstalledLowerBoundBytes:installedBytes,
      duplicateRepresentationBytes:sourceTarget.installed.duplicateRepresentationBytes,
      cacheHighWaterBytes:sourceTarget.installed.cacheHighWaterBytes,
    },
    workingMemory:{
      activeWeightsBytes:max(rows.map(value=>value.activeRepresentationBytes)),
      peakRamBytes:max(rows.map(value=>value.peakRamBytes)),
      peakAcceleratorBytes:max(rows.map(value=>value.peakAcceleratorBytes)),
      flashBytesMovedPerRun:max(rows.map(value=>value.flashBytesMovedPerRun)),
    },
    qualityPerInstalledGbStatus:'MEASURED',
    mvmState:'NOT_EVALUATED',
    efficiencyDisposition:'R&D_ONLY',
    notes:sourceTarget.notes,
  });

  const projectedEvidence=normalizeHsmeDenseDualBudgetEvidenceV1({
    ...template,
    candidates:template.candidates.map(value=>
      value.candidateId===HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID
        ?projectedCandidate
        :value
    ),
  });
  assertOnlyTargetChanged(template,projectedEvidence);

  const projectedEvidenceSha256=await digest(
    HSME_DENSE_BASELINE_DUAL_BUDGET_PROJECTED_DIGEST_DOMAIN,
    projectedEvidence,
    hash,
  );
  const payload={
    schemaVersion:HSME_DENSE_STUDENT_DUAL_BUDGET_PROJECTION_V1_SCHEMA,
    state:'DUAL_BUDGET_PROJECTION_READY_NOT_FROZEN' as const,
    representationEvidenceSha256,
    stepMatrixEvidenceSha256,
    sourceTemplateSha256,
    projectedEvidenceSha256,
    changedCandidateIds:Object.freeze([
      HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID,
    ]) as readonly [typeof HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID],
    projectedCandidate,
    projectedEvidence,
    ...authorityBoundary(),
  };
  const projectionEvidenceSha256=await digest(
    HSME_DENSE_STUDENT_DUAL_BUDGET_PROJECTION_DIGEST_DOMAIN,
    payload,
    hash,
  );
  return deepFreeze({...payload,projectionEvidenceSha256});
}

export async function hsmeDenseBaselineDualBudgetTemplateV1Digest(
  rawTemplate:unknown,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  const template=normalizeHsmeDenseDualBudgetEvidenceV1(rawTemplate);
  return digest(
    HSME_DENSE_BASELINE_DUAL_BUDGET_TEMPLATE_DIGEST_DOMAIN,
    template,
    hash,
  );
}

function validateRepresentation(
  value:HsmeDenseStudentRepresentationEvidenceV1,
):void{
  if(
    value.state!=='REPRESENTATION_READY_NOT_ADMITTED'
    ||value.blockers.length!==0
    ||value.candidateId!==HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID
    ||value.architectureFamily!=='COMPACT_DIT'
    ||value.representationArtifactSha256==='UNKNOWN'
    ||value.representationBytes==='UNKNOWN'
    ||value.packCandidateState!=='PACK_CANDIDATE_READY_NOT_ADMITTED'
    ||value.packDescriptor===null
    ||value.packDescriptorSha256==='UNKNOWN'
  ){
    fail(
      'hsme_dense_projection_representation_state',
      'projection requires complete one-root READY representation',
    );
  }
  if(
    value.checkpointPromotionAllowed!==false
    ||value.modelInstallAllowed!==false
    ||value.modelFleetPromotionAllowed!==false
    ||value.durableModelFleetPromotionAllowed!==false
    ||value.productionAuthorityGranted!==false
    ||value.providerAuthorityGranted!==false
    ||value.billingAuthorityGranted!==false
    ||value.projectArtifactMutationAllowed!==false
    ||value.aeeExecutionAuthorityGranted!==false
    ||value.winnerSelectionAllowed!==false
  ){
    fail(
      'hsme_dense_projection_representation_authority',
      'representation authority widened',
    );
  }
}

function validateStepMatrix(value:HsmeDenseStudentStepMatrixEvidenceV1):void{
  if(
    value.state!=='STEP_MATRIX_READY_NOT_SELECTED'
    ||value.blockers.length!==0
    ||value.candidateId!==HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID
    ||value.rows.length!==8
  ){
    fail(
      'hsme_dense_projection_matrix_state',
      'projection requires complete READY_NOT_SELECTED matrix',
    );
  }
  if(
    value.weightedAggregateScoreAllowed!==false
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
    ||value.winnerSelectionAllowed!==false
  ){
    fail(
      'hsme_dense_projection_matrix_authority',
      'step-matrix authority widened',
    );
  }
}

async function assertOneRootSelfContainedRepresentation(
  value:HsmeDenseStudentRepresentationEvidenceV1,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<void>{
  const pack=value.packDescriptor;
  if(
    pack===null
    ||pack.roots.length!==1
    ||pack.roots[0].role!=='BASE'
    ||pack.roots[0].sha256!==value.representationArtifactSha256
    ||pack.routing.mode!=='SHARED_ONLY'
    ||pack.routing.maxActiveExperts!==0
    ||value.packDescriptorSha256==='UNKNOWN'
  ){
    fail(
      'hsme_dense_projection_one_root_required',
      'installed-byte projection requires exact one-BASE-root representation',
    );
  }
  const packDescriptorSha256=await hsmePackDescriptorV1Digest(pack,hash);
  if(packDescriptorSha256!==value.packDescriptorSha256){
    fail(
      'hsme_dense_projection_pack_rehash',
      'pack descriptor digest mismatch',
    );
  }
}

function assertTargetProjectionSource(
  sourceTarget:HsmeDenseDualBudgetCandidateV1,
):void{
  if(
    sourceTarget.efficiencyDisposition!=='R&D_ONLY'
    ||sourceTarget.mvmState!=='NOT_EVALUATED'
    ||sourceTarget.qualityPerInstalledGbStatus!=='PENDING'
  ){
    fail(
      'hsme_dense_projection_target_authority',
      'projection source target must remain pending R&D_ONLY and NOT_EVALUATED',
    );
  }
  const installed=sourceTarget.installed;
  const working=sourceTarget.workingMemory;
  if(
    installed.mandatoryInstalledBytes!=='UNKNOWN'
    ||installed.optionalInstalledBytes!=='UNKNOWN'
    ||installed.firstUseDownloadBytes!=='UNKNOWN'
    ||installed.knownInstalledLowerBoundBytes!=='UNKNOWN'
    ||working.activeWeightsBytes!=='UNKNOWN'
    ||working.peakRamBytes!=='UNKNOWN'
    ||working.peakAcceleratorBytes!=='UNKNOWN'
    ||working.flashBytesMovedPerRun!=='UNKNOWN'
  ){
    fail(
      'hsme_dense_projection_target_measurement_overwrite',
      'projection cannot overwrite independently measured target values',
    );
  }
}

function validateMatrixCompleteness(
  rows:HsmeDenseStudentStepMatrixEvidenceV1['rows'],
):void{
  const expectedKeys=HSME_DENSE_STUDENT_FIXED_CAPABILITIES_V1.flatMap(
    capability=>HSME_DENSE_STUDENT_FIXED_STEP_COUNTS_V1.map(
      stepCount=>capability+'\0'+stepCount,
    ),
  ).sort(lexical);
  const actualKeys=rows.map(
    row=>row.capability+'\0'+row.stepCount,
  ).sort(lexical);
  if(
    actualKeys.length!==expectedKeys.length
    ||actualKeys.some((value,index)=>value!==expectedKeys[index])
  ){
    fail(
      'hsme_dense_projection_matrix_incomplete',
      'projection requires exact capability x [2,4,6,8] matrix coverage',
    );
  }
  for(const row of rows){
    if(!Array.isArray(row.qualityDimensions)||row.qualityDimensions.length<1){
      fail(
        'hsme_dense_projection_quality_incomplete',
        'every matrix row requires measured non-compensable quality dimensions',
      );
    }
    const dimensionIds=row.qualityDimensions.map(value=>value.dimensionId);
    if(new Set(dimensionIds).size!==dimensionIds.length){
      fail(
        'hsme_dense_projection_quality_incomplete',
        'matrix row quality dimension ids must be unique',
      );
    }
    for(const dimension of row.qualityDimensions){
      if(
        !Number.isSafeInteger(dimension.lossMicrounits)
        ||dimension.lossMicrounits<0
        ||typeof dimension.criticalFailureObserved!=='boolean'
        ||!HEX64.test(dimension.evidenceSha256)
      ){
        fail(
          'hsme_dense_projection_quality_incomplete',
          'matrix quality dimensions must contain measured bounded evidence',
        );
      }
    }
    for(const [name,value,min] of [
      ['activeRepresentationBytes',row.activeRepresentationBytes,1],
      ['peakRamBytes',row.peakRamBytes,0],
      ['peakAcceleratorBytes',row.peakAcceleratorBytes,0],
      ['flashBytesMovedPerRun',row.flashBytesMovedPerRun,0],
    ] as const){
      if(!Number.isSafeInteger(value)||value<min){
        fail(
          'hsme_dense_projection_measurements',
          name+' must be a measured bounded safe integer',
        );
      }
    }
  }
}

function assertOnlyTargetChanged(
  source:HsmeDenseDualBudgetEvidenceV1,
  projected:HsmeDenseDualBudgetEvidenceV1,
):void{
  const sourceById=new Map(source.candidates.map(value=>[value.candidateId,value]));
  const projectedById=new Map(projected.candidates.map(value=>[value.candidateId,value]));
  if(sourceById.size!==projectedById.size){
    fail(
      'hsme_dense_projection_roster_drift',
      'projection cannot change dual-budget candidate roster',
    );
  }
  for(const [candidateId,sourceCandidate] of sourceById){
    const projectedCandidate=projectedById.get(candidateId);
    if(!projectedCandidate){
      fail(
        'hsme_dense_projection_roster_drift',
        'projection cannot remove candidates',
      );
    }
    if(
      candidateId!==HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID
      &&JSON.stringify(sourceCandidate)!==JSON.stringify(projectedCandidate)
    ){
      fail(
        'hsme_dense_projection_non_target_drift',
        'projection cannot change non-target candidate '+candidateId,
      );
    }
  }
}

function authorityBoundary(){
  return Object.freeze({
    baselineSelectionAllowed:false as const,
    scheduleSelectionAllowed:false as const,
    candidateSelectionAllowed:false as const,
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

function lexical(a:string,b:string):number{return a<b?-1:a>b?1:0;}

function max(values:readonly number[]):number{
  if(values.length<1){
    fail('hsme_dense_projection_measurements','measurement vector cannot be empty');
  }
  return Math.max(...values);
}

async function verify(run:()=>Promise<boolean>):Promise<boolean>{
  try{return await run()===true;}catch{return false;}
}

async function digest(
  domain:string,
  value:unknown,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  const result=await hash.sha256(
    new TextEncoder().encode(domain+JSON.stringify(value)),
  );
  if(!HEX64.test(result)){
    fail(
      'hsme_dense_projection_hash_port',
      'hash port must return lowercase SHA-256',
    );
  }
  return result;
}

function deepFreeze<T>(value:T):T{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const child of Object.values(value as Record<string,unknown>)){
      deepFreeze(child);
    }
  }
  return value;
}

function fail(code:string,message:string):never{
  throw new HsmeDenseStudentDualBudgetProjectionV1Error(code,message);
}
