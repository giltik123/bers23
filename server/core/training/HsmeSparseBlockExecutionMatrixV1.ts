import {
  hsmeSelectiveSparseBlockPlanV1Digest,
  type HsmeSelectiveSparseBlockPlanV1,
} from './HsmeSelectiveSparseBlockPlanV1.ts';
import {
  hsmeSelectiveSparseBlockCandidateRosterV1Digest,
  type HsmeSelectiveSparseBlockCandidateRosterV1,
} from './HsmeSparseBlockCandidateRosterV1.ts';
import type {
  HsmeDenseBaselineHashPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

export const HSME_SPARSE_BLOCK_EXECUTION_CAMPAIGN_V1_SCHEMA =
  'BERS_HSME_SPARSE_BLOCK_EXECUTION_CAMPAIGN_V1' as const;
export const HSME_SPARSE_BLOCK_EXECUTION_CAMPAIGN_DIGEST_DOMAIN =
  'bers:hsme:sparse-block-execution-campaign:v1\0' as const;
export const CORE_HSME_SPARSE_BLOCK_EXECUTION_RESULT_V1_SCHEMA =
  'BERS_CORE_HSME_SPARSE_BLOCK_EXECUTION_RESULT_V1' as const;
export const CORE_HSME_SPARSE_BLOCK_EXECUTION_RESULT_DIGEST_DOMAIN =
  'bers:core:hsme:sparse-block-execution-result:v1\0' as const;
export const HSME_SPARSE_BLOCK_EXECUTION_MATRIX_V1_SCHEMA =
  'BERS_HSME_SPARSE_BLOCK_EXECUTION_MATRIX_V1' as const;
export const HSME_SPARSE_BLOCK_EXECUTION_MATRIX_DIGEST_DOMAIN =
  'bers:hsme:sparse-block-execution-matrix:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+/-]*$/;
const VARIANTS=Object.freeze([
  'DENSE_CONTROL',
  'SPARSE_CANDIDATE',
] as const);

export type HsmeSparseBlockExecutionVariantV1=typeof VARIANTS[number];

export type HsmeSparseBlockExecutionCampaignV1=Readonly<{
  schemaVersion:typeof HSME_SPARSE_BLOCK_EXECUTION_CAMPAIGN_V1_SCHEMA;
  sparseBlockPlanSha256:string;
  candidateRosterSha256:string;
  fixtureSha256:string;
  inputBatchSha256:string;
  caseCount:number;
  warmupIterations:number;
  measuredIterations:number;
  runtimeRepresentationSha256:string;
  hardwareClass:string;
  sameInputsAcrossVariants:true;
  sameRuntimeAcrossVariants:true;
  networkDuringExecutionAllowed:false;
  blockExecutionAllowed:false;
  selectionAllowed:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
}>;

export interface HsmeSparseBlockExecutionPlanOriginVerifierV1{
  verifySparseBlockPlan(
    plan:HsmeSelectiveSparseBlockPlanV1,
    expectedPlanSha256:string,
  ):Promise<boolean>;
}
export interface HsmeSparseBlockExecutionRosterOriginVerifierV1{
  verifyCandidateRoster(
    roster:HsmeSelectiveSparseBlockCandidateRosterV1,
    expectedRosterSha256:string,
  ):Promise<boolean>;
}
export interface HsmeSparseBlockExecutionCampaignOriginVerifierV1{
  verifyExecutionCampaign(
    campaign:HsmeSparseBlockExecutionCampaignV1,
    expectedCampaignSha256:string,
  ):Promise<boolean>;
}

export type HsmeSparseBlockExecutionMeasurementV1=Readonly<{
  blockId:string;
  variant:HsmeSparseBlockExecutionVariantV1;
  implementationSha256:string;
  inputOutputContractSha256:string;
  fixtureSha256:string;
  inputBatchSha256:string;
  runtimeRepresentationSha256:string;
  hardwareClass:string;
  caseCount:number;
  wallClockUs:number;
  weightsBytes:number;
  activeWeightsBytes:number;
  activationBytes:number;
  flashBytesMoved:number;
  ramBytesMoved:number;
  acceleratorBytesMoved:number;
  kernelDispatchCount:number;
  peakMemoryBytes:number;
  qualityPreservationContractSha256:string;
  qualityPreservationEvidenceSha256:string;
  deterministicReplayIdentitySha256:string;
  realMeasuredEvidence:true;
  networkBytesDuringExecution:0;
}>;

export type CoreHsmeSparseBlockExecutionRequestV1=Readonly<{
  sparseBlockPlanSha256:string;
  candidateRosterSha256:string;
  campaignSha256:string;
  fixtureSha256:string;
  inputBatchSha256:string;
  runtimeRepresentationSha256:string;
  hardwareClass:string;
  caseCount:number;
  warmupIterations:number;
  measuredIterations:number;
  candidateBlocks:readonly Readonly<{
    blockId:string;
    denseBlockContentSha256:string;
    sparseManifestSha256:string;
    inputOutputContractSha256:string;
  }>[];
  networkDuringExecutionAllowed:false;
}>;

export interface CoreHsmeSparseBlockExecutionPortV1{
  executeExactDenseSparseBlockCampaign(
    request:CoreHsmeSparseBlockExecutionRequestV1,
  ):Promise<unknown>;
}

export type CoreHsmeSparseBlockExecutionResultV1=Readonly<{
  schemaVersion:typeof CORE_HSME_SPARSE_BLOCK_EXECUTION_RESULT_V1_SCHEMA;
  state:'SPARSE_BLOCK_EXECUTION_CAMPAIGN_COMPLETED';
  sparseBlockPlanSha256:string;
  candidateRosterSha256:string;
  campaignSha256:string;
  executionAttemptId:string;
  rows:readonly HsmeSparseBlockExecutionMeasurementV1[];
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
  selectionAllowed:false;
  hostResultSha256:string;
}>;

export interface CoreHsmeSparseBlockExecutionResultOriginVerifierV1{
  verifyExecutionResult(
    result:CoreHsmeSparseBlockExecutionResultV1,
    expectedHostResultSha256:string,
  ):Promise<boolean>;
}

export type HsmeSparseBlockExecutionMatrixV1=Readonly<{
  schemaVersion:typeof HSME_SPARSE_BLOCK_EXECUTION_MATRIX_V1_SCHEMA;
  state:
    |'SPARSE_BLOCK_EXECUTION_MATRIX_INVALID'
    |'SPARSE_BLOCK_EXECUTION_MATRIX_BLOCKED'
    |'SPARSE_BLOCK_EXECUTION_MATRIX_READY_NOT_DISPOSED';
  blockers:readonly string[];
  sparseBlockPlanSha256:string|'UNKNOWN';
  candidateRosterSha256:string|'UNKNOWN';
  campaignSha256:string|'UNKNOWN';
  executionAttemptId:string|'UNKNOWN';
  rows:readonly HsmeSparseBlockExecutionMeasurementV1[];
  matrixEvidenceSha256:string|'UNKNOWN';
  furtherBlockExecutionAllowed:false;
  selectionAllowed:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
}>;

export class HsmeSparseBlockExecutionMatrixV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeSparseBlockExecutionMatrixV1Error';
    this.code=code;
  }
}

export function normalizeHsmeSparseBlockExecutionCampaignV1(
  raw:unknown,
):HsmeSparseBlockExecutionCampaignV1{
  const r=exactRecord(raw,[
    'schemaVersion','sparseBlockPlanSha256','candidateRosterSha256',
    'fixtureSha256','inputBatchSha256','caseCount','warmupIterations',
    'measuredIterations','runtimeRepresentationSha256','hardwareClass',
    'sameInputsAcrossVariants','sameRuntimeAcrossVariants',
    'networkDuringExecutionAllowed','blockExecutionAllowed','selectionAllowed',
    'modelInstallAllowed','modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed','productionAuthorityGranted',
    'providerAuthorityGranted','billingAuthorityGranted',
    'projectArtifactMutationAllowed','aeeExecutionAuthorityGranted',
  ],'campaign');
  if(r.schemaVersion!==HSME_SPARSE_BLOCK_EXECUTION_CAMPAIGN_V1_SCHEMA){
    fail('hsme_sparse_exec_campaign_schema','campaign schema unsupported');
  }
  if(
    r.sameInputsAcrossVariants!==true
    ||r.sameRuntimeAcrossVariants!==true
    ||r.networkDuringExecutionAllowed!==false
  ){
    fail('hsme_sparse_exec_campaign_boundary','campaign comparison boundary invalid');
  }
  assertNoAuthority(r,'campaign',true);
  return deepFreeze({
    schemaVersion:HSME_SPARSE_BLOCK_EXECUTION_CAMPAIGN_V1_SCHEMA,
    sparseBlockPlanSha256:sha256(
      r.sparseBlockPlanSha256,'campaign.sparseBlockPlanSha256',
    ),
    candidateRosterSha256:sha256(
      r.candidateRosterSha256,'campaign.candidateRosterSha256',
    ),
    fixtureSha256:sha256(r.fixtureSha256,'campaign.fixtureSha256'),
    inputBatchSha256:sha256(r.inputBatchSha256,'campaign.inputBatchSha256'),
    caseCount:safeInteger(r.caseCount,'campaign.caseCount',1,1_000_000),
    warmupIterations:safeInteger(
      r.warmupIterations,'campaign.warmupIterations',0,100_000,
    ),
    measuredIterations:safeInteger(
      r.measuredIterations,'campaign.measuredIterations',1,100_000,
    ),
    runtimeRepresentationSha256:sha256(
      r.runtimeRepresentationSha256,
      'campaign.runtimeRepresentationSha256',
    ),
    hardwareClass:identifier(r.hardwareClass,'campaign.hardwareClass',160),
    sameInputsAcrossVariants:true,
    sameRuntimeAcrossVariants:true,
    networkDuringExecutionAllowed:false,
    ...campaignAuthorityBoundary(),
  });
}

export async function hsmeSparseBlockExecutionCampaignV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  return digest(
    HSME_SPARSE_BLOCK_EXECUTION_CAMPAIGN_DIGEST_DOMAIN,
    normalizeHsmeSparseBlockExecutionCampaignV1(raw),
    hash,
  );
}

export async function executeHsmeSparseBlockComparisonMatrixV1(
  plan:HsmeSelectiveSparseBlockPlanV1,
  expectedPlanSha256:string,
  planOrigin:HsmeSparseBlockExecutionPlanOriginVerifierV1,
  roster:HsmeSelectiveSparseBlockCandidateRosterV1,
  expectedRosterSha256:string,
  rosterOrigin:HsmeSparseBlockExecutionRosterOriginVerifierV1,
  rawCampaign:unknown,
  expectedCampaignSha256:string,
  campaignOrigin:HsmeSparseBlockExecutionCampaignOriginVerifierV1,
  host:CoreHsmeSparseBlockExecutionPortV1,
  resultOrigin:CoreHsmeSparseBlockExecutionResultOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeSparseBlockExecutionMatrixV1>{
  if(
    plan.state!=='SELECTIVE_SPARSE_BLOCK_PLAN_FROZEN_NOT_EXECUTED'
    ||plan.planEvidenceSha256==='UNKNOWN'
    ||roster.state!==
      'SELECTIVE_SPARSE_BLOCK_CANDIDATE_ROSTER_READY_NOT_EXECUTED'
    ||roster.rosterEvidenceSha256==='UNKNOWN'
  ){
    return blocked(['SPARSE_BLOCK_EXECUTION_READY_INPUTS_REQUIRED']);
  }

  let planSha:string;
  let rosterSha:string;
  try{
    planSha=await hsmeSelectiveSparseBlockPlanV1Digest(plan,hash);
    rosterSha=await hsmeSelectiveSparseBlockCandidateRosterV1Digest(
      roster,hash,
    );
  }catch{
    return invalid(['SPARSE_BLOCK_EXECUTION_INPUT_REHASH_INVALID']);
  }
  const common={
    sparseBlockPlanSha256:planSha,
    candidateRosterSha256:rosterSha,
  };
  if(
    !exactDigest(expectedPlanSha256,planSha,plan.planEvidenceSha256)
    ||!exactDigest(expectedRosterSha256,rosterSha,roster.rosterEvidenceSha256)
  ){
    return invalid(['SPARSE_BLOCK_EXECUTION_INPUT_REHASH_MISMATCH'],common);
  }
  if(!await verify(()=>planOrigin.verifySparseBlockPlan(plan,planSha))){
    return invalid(['SPARSE_BLOCK_EXECUTION_PLAN_ORIGIN_UNVERIFIED'],common);
  }
  if(!await verify(()=>rosterOrigin.verifyCandidateRoster(roster,rosterSha))){
    return invalid(['SPARSE_BLOCK_EXECUTION_ROSTER_ORIGIN_UNVERIFIED'],common);
  }
  if(
    roster.sparseBlockPlanSha256!==planSha
    ||roster.denseBaselineContentSha256!==plan.denseBaselineContentSha256
    ||roster.runtimeRepresentationSha256!==plan.runtimeRepresentationSha256
    ||roster.hardwareClass!==plan.hardwareClass
    ||roster.candidates.length!==plan.candidateProfiles.length
  ){
    return invalid(['SPARSE_BLOCK_EXECUTION_ROSTER_BINDING_MISMATCH'],common);
  }

  let campaign:HsmeSparseBlockExecutionCampaignV1;
  let campaignSha:string;
  try{
    campaign=normalizeHsmeSparseBlockExecutionCampaignV1(rawCampaign);
    campaignSha=await hsmeSparseBlockExecutionCampaignV1Digest(campaign,hash);
  }catch{
    return invalid(['SPARSE_BLOCK_EXECUTION_CAMPAIGN_INVALID'],common);
  }
  const bound={...common,campaignSha256:campaignSha};
  if(!exactDigest(expectedCampaignSha256,campaignSha,campaignSha)){
    return invalid(['SPARSE_BLOCK_EXECUTION_CAMPAIGN_DIGEST_MISMATCH'],bound);
  }
  if(!await verify(
    ()=>campaignOrigin.verifyExecutionCampaign(campaign,campaignSha),
  )){
    return invalid(['SPARSE_BLOCK_EXECUTION_CAMPAIGN_ORIGIN_UNVERIFIED'],bound);
  }
  if(
    campaign.sparseBlockPlanSha256!==planSha
    ||campaign.candidateRosterSha256!==rosterSha
    ||campaign.runtimeRepresentationSha256!==plan.runtimeRepresentationSha256
    ||campaign.hardwareClass!==plan.hardwareClass
  ){
    return invalid(['SPARSE_BLOCK_EXECUTION_CAMPAIGN_BINDING_MISMATCH'],bound);
  }

  const candidateBlocks=plan.candidateProfiles.map(profile=>{
    const candidate=roster.candidates.find(
      value=>value.manifest.blockId===profile.blockId,
    );
    if(candidate===undefined){
      fail(
        'hsme_sparse_exec_roster_coverage',
        'candidate roster does not cover frozen plan',
      );
    }
    return deepFreeze({
      blockId:profile.blockId,
      denseBlockContentSha256:profile.denseBlockContentSha256,
      sparseManifestSha256:candidate.manifestSha256,
      inputOutputContractSha256:profile.inputOutputContractSha256,
    });
  }).sort((a,b)=>lexical(a.blockId,b.blockId));

  const request:CoreHsmeSparseBlockExecutionRequestV1=deepFreeze({
    sparseBlockPlanSha256:planSha,
    candidateRosterSha256:rosterSha,
    campaignSha256:campaignSha,
    fixtureSha256:campaign.fixtureSha256,
    inputBatchSha256:campaign.inputBatchSha256,
    runtimeRepresentationSha256:campaign.runtimeRepresentationSha256,
    hardwareClass:campaign.hardwareClass,
    caseCount:campaign.caseCount,
    warmupIterations:campaign.warmupIterations,
    measuredIterations:campaign.measuredIterations,
    candidateBlocks:Object.freeze(candidateBlocks),
    networkDuringExecutionAllowed:false,
  });

  let rawResult:unknown;
  try{
    rawResult=await host.executeExactDenseSparseBlockCampaign(request);
  }catch{
    return invalid(['SPARSE_BLOCK_EXECUTION_HOST_FAILED'],bound);
  }

  let result:CoreHsmeSparseBlockExecutionResultV1;
  let hostResultSha:string;
  try{
    result=normalizeCoreHsmeSparseBlockExecutionResultV1(rawResult);
    hostResultSha=await coreHsmeSparseBlockExecutionResultV1Digest(result,hash);
  }catch{
    return invalid(['SPARSE_BLOCK_EXECUTION_HOST_RESULT_INVALID'],bound);
  }
  if(hostResultSha!==result.hostResultSha256){
    return invalid(
      ['SPARSE_BLOCK_EXECUTION_HOST_RESULT_REHASH_MISMATCH'],
      bound,
    );
  }
  if(!await verify(
    ()=>resultOrigin.verifyExecutionResult(result,hostResultSha),
  )){
    return invalid(
      ['SPARSE_BLOCK_EXECUTION_HOST_RESULT_ORIGIN_UNVERIFIED'],
      bound,
    );
  }
  if(
    result.sparseBlockPlanSha256!==planSha
    ||result.candidateRosterSha256!==rosterSha
    ||result.campaignSha256!==campaignSha
    ||result.rows.length!==plan.candidateProfiles.length*2
  ){
    return invalid(['SPARSE_BLOCK_EXECUTION_HOST_BINDING_MISMATCH'],bound);
  }

  const rows=[...result.rows].sort(compareRows);
  for(const profile of plan.candidateProfiles){
    const candidate=roster.candidates.find(
      value=>value.manifest.blockId===profile.blockId,
    );
    if(candidate===undefined){
      return invalid(['SPARSE_BLOCK_EXECUTION_ROSTER_BINDING_MISMATCH'],bound);
    }
    const dense=rows.filter(
      row=>row.blockId===profile.blockId&&row.variant==='DENSE_CONTROL',
    );
    const sparse=rows.filter(
      row=>row.blockId===profile.blockId&&row.variant==='SPARSE_CANDIDATE',
    );
    if(dense.length!==1||sparse.length!==1){
      return invalid(['SPARSE_BLOCK_EXECUTION_ROW_CARDINALITY_INVALID'],bound);
    }
    const commonFailure=validateRowCommon(
      dense[0],profile.blockId,profile.inputOutputContractSha256,
      campaign,plan,
    )??validateRowCommon(
      sparse[0],profile.blockId,profile.inputOutputContractSha256,
      campaign,plan,
    );
    if(commonFailure!==null){
      return invalid([commonFailure],bound);
    }
    if(
      dense[0].implementationSha256!==profile.denseBlockContentSha256
      ||dense[0].weightsBytes!==profile.denseWeightsBytes
      ||dense[0].activeWeightsBytes!==profile.denseActiveWeightsBytes
      ||dense[0].activationBytes!==profile.denseActivationBytes
    ){
      return invalid(['SPARSE_BLOCK_EXECUTION_DENSE_IDENTITY_MISMATCH'],bound);
    }
    if(
      sparse[0].implementationSha256!==candidate.manifestSha256
      ||sparse[0].weightsBytes!==candidate.manifest.totalWeightsBytes
      ||sparse[0].activeWeightsBytes!==candidate.manifest.activeWeightsBytes
    ){
      return invalid(['SPARSE_BLOCK_EXECUTION_SPARSE_IDENTITY_MISMATCH'],bound);
    }
  }

  const payload={
    schemaVersion:HSME_SPARSE_BLOCK_EXECUTION_MATRIX_V1_SCHEMA,
    state:'SPARSE_BLOCK_EXECUTION_MATRIX_READY_NOT_DISPOSED' as const,
    blockers:Object.freeze([] as string[]),
    sparseBlockPlanSha256:planSha,
    candidateRosterSha256:rosterSha,
    campaignSha256:campaignSha,
    executionAttemptId:result.executionAttemptId,
    rows:Object.freeze(rows),
    ...matrixAuthorityBoundary(),
  };
  const matrixEvidenceSha256=await digest(
    HSME_SPARSE_BLOCK_EXECUTION_MATRIX_DIGEST_DOMAIN,
    payload,hash,
  );
  return deepFreeze({...payload,matrixEvidenceSha256});
}

export function normalizeCoreHsmeSparseBlockExecutionResultV1(
  raw:unknown,
):CoreHsmeSparseBlockExecutionResultV1{
  const r=exactRecord(raw,[
    'schemaVersion','state','sparseBlockPlanSha256',
    'candidateRosterSha256','campaignSha256','executionAttemptId','rows',
    'modelInstallAllowed','modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed','productionAuthorityGranted',
    'providerAuthorityGranted','billingAuthorityGranted',
    'projectArtifactMutationAllowed','aeeExecutionAuthorityGranted',
    'selectionAllowed','hostResultSha256',
  ],'result');
  if(
    r.schemaVersion!==CORE_HSME_SPARSE_BLOCK_EXECUTION_RESULT_V1_SCHEMA
    ||r.state!=='SPARSE_BLOCK_EXECUTION_CAMPAIGN_COMPLETED'
  ){
    fail('hsme_sparse_exec_result_schema','host result schema/state unsupported');
  }
  assertNoAuthority(r,'result',false);
  if(!Array.isArray(r.rows)||r.rows.length<2||r.rows.length>128){
    fail('hsme_sparse_exec_result_rows','host result rows invalid');
  }
  return deepFreeze({
    schemaVersion:CORE_HSME_SPARSE_BLOCK_EXECUTION_RESULT_V1_SCHEMA,
    state:'SPARSE_BLOCK_EXECUTION_CAMPAIGN_COMPLETED',
    sparseBlockPlanSha256:sha256(
      r.sparseBlockPlanSha256,'result.sparseBlockPlanSha256',
    ),
    candidateRosterSha256:sha256(
      r.candidateRosterSha256,'result.candidateRosterSha256',
    ),
    campaignSha256:sha256(r.campaignSha256,'result.campaignSha256'),
    executionAttemptId:identifier(
      r.executionAttemptId,'result.executionAttemptId',160,
    ),
    rows:Object.freeze(r.rows.map((value,index)=>
      normalizeMeasurement(value,'result.rows['+index+']')
    )),
    ...hostAuthorityBoundary(),
    hostResultSha256:sha256(r.hostResultSha256,'result.hostResultSha256'),
  });
}

export async function coreHsmeSparseBlockExecutionResultV1Digest(
  result:CoreHsmeSparseBlockExecutionResultV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  const normalized=normalizeCoreHsmeSparseBlockExecutionResultV1(result);
  const {hostResultSha256:_ignored,...payload}=normalized;
  return digest(
    CORE_HSME_SPARSE_BLOCK_EXECUTION_RESULT_DIGEST_DOMAIN,
    payload,hash,
  );
}

export async function hsmeSparseBlockExecutionMatrixV1Digest(
  matrix:HsmeSparseBlockExecutionMatrixV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  if(
    matrix.state!=='SPARSE_BLOCK_EXECUTION_MATRIX_READY_NOT_DISPOSED'
    ||matrix.matrixEvidenceSha256==='UNKNOWN'
  ){
    fail('hsme_sparse_exec_matrix_digest_state','only READY_NOT_DISPOSED matrix is digestible');
  }
  const {matrixEvidenceSha256:_ignored,...payload}=matrix;
  return digest(HSME_SPARSE_BLOCK_EXECUTION_MATRIX_DIGEST_DOMAIN,payload,hash);
}

function normalizeMeasurement(
  raw:unknown,path:string,
):HsmeSparseBlockExecutionMeasurementV1{
  const r=exactRecord(raw,[
    'blockId','variant','implementationSha256','inputOutputContractSha256',
    'fixtureSha256','inputBatchSha256','runtimeRepresentationSha256',
    'hardwareClass','caseCount','wallClockUs','weightsBytes',
    'activeWeightsBytes','activationBytes','flashBytesMoved','ramBytesMoved',
    'acceleratorBytesMoved','kernelDispatchCount','peakMemoryBytes',
    'qualityPreservationContractSha256','qualityPreservationEvidenceSha256',
    'deterministicReplayIdentitySha256','realMeasuredEvidence',
    'networkBytesDuringExecution',
  ],path);
  if(r.realMeasuredEvidence!==true||r.networkBytesDuringExecution!==0){
    fail('hsme_sparse_exec_measurement_boundary',path+' measurement boundary invalid');
  }
  const weightsBytes=safeInteger(r.weightsBytes,path+'.weightsBytes',1,Number.MAX_SAFE_INTEGER);
  const activeWeightsBytes=safeInteger(
    r.activeWeightsBytes,path+'.activeWeightsBytes',1,weightsBytes,
  );
  return deepFreeze({
    blockId:identifier(r.blockId,path+'.blockId',120),
    variant:enumValue(r.variant,VARIANTS,path+'.variant'),
    implementationSha256:sha256(r.implementationSha256,path+'.implementationSha256'),
    inputOutputContractSha256:sha256(
      r.inputOutputContractSha256,path+'.inputOutputContractSha256',
    ),
    fixtureSha256:sha256(r.fixtureSha256,path+'.fixtureSha256'),
    inputBatchSha256:sha256(r.inputBatchSha256,path+'.inputBatchSha256'),
    runtimeRepresentationSha256:sha256(
      r.runtimeRepresentationSha256,path+'.runtimeRepresentationSha256',
    ),
    hardwareClass:identifier(r.hardwareClass,path+'.hardwareClass',160),
    caseCount:safeInteger(r.caseCount,path+'.caseCount',1,1_000_000),
    wallClockUs:safeInteger(r.wallClockUs,path+'.wallClockUs',1,Number.MAX_SAFE_INTEGER),
    weightsBytes,
    activeWeightsBytes,
    activationBytes:safeInteger(
      r.activationBytes,path+'.activationBytes',0,Number.MAX_SAFE_INTEGER,
    ),
    flashBytesMoved:safeInteger(
      r.flashBytesMoved,path+'.flashBytesMoved',0,Number.MAX_SAFE_INTEGER,
    ),
    ramBytesMoved:safeInteger(
      r.ramBytesMoved,path+'.ramBytesMoved',0,Number.MAX_SAFE_INTEGER,
    ),
    acceleratorBytesMoved:safeInteger(
      r.acceleratorBytesMoved,path+'.acceleratorBytesMoved',0,Number.MAX_SAFE_INTEGER,
    ),
    kernelDispatchCount:safeInteger(
      r.kernelDispatchCount,path+'.kernelDispatchCount',1,Number.MAX_SAFE_INTEGER,
    ),
    peakMemoryBytes:safeInteger(
      r.peakMemoryBytes,path+'.peakMemoryBytes',1,Number.MAX_SAFE_INTEGER,
    ),
    qualityPreservationContractSha256:sha256(
      r.qualityPreservationContractSha256,
      path+'.qualityPreservationContractSha256',
    ),
    qualityPreservationEvidenceSha256:sha256(
      r.qualityPreservationEvidenceSha256,
      path+'.qualityPreservationEvidenceSha256',
    ),
    deterministicReplayIdentitySha256:sha256(
      r.deterministicReplayIdentitySha256,
      path+'.deterministicReplayIdentitySha256',
    ),
    realMeasuredEvidence:true,
    networkBytesDuringExecution:0,
  });
}

function validateRowCommon(
  row:HsmeSparseBlockExecutionMeasurementV1,
  blockId:string,
  ioSha:string,
  campaign:HsmeSparseBlockExecutionCampaignV1,
  plan:HsmeSelectiveSparseBlockPlanV1,
):string|null{
  if(
    row.blockId!==blockId
    ||row.inputOutputContractSha256!==ioSha
    ||row.fixtureSha256!==campaign.fixtureSha256
    ||row.inputBatchSha256!==campaign.inputBatchSha256
    ||row.runtimeRepresentationSha256!==campaign.runtimeRepresentationSha256
    ||row.hardwareClass!==campaign.hardwareClass
    ||row.caseCount!==campaign.caseCount
    ||row.qualityPreservationContractSha256!==
      plan.qualityPreservationContractSha256
  ){
    return 'SPARSE_BLOCK_EXECUTION_ROW_BINDING_MISMATCH';
  }
  return null;
}

function compareRows(
  left:HsmeSparseBlockExecutionMeasurementV1,
  right:HsmeSparseBlockExecutionMeasurementV1,
):number{
  const block=lexical(left.blockId,right.blockId);
  if(block!==0)return block;
  return VARIANTS.indexOf(left.variant)-VARIANTS.indexOf(right.variant);
}

type PartialOutput=Partial<Pick<
  HsmeSparseBlockExecutionMatrixV1,
  'sparseBlockPlanSha256'|'candidateRosterSha256'|'campaignSha256'
>>;

function blocked(
  blockers:readonly string[],values:PartialOutput={},
):HsmeSparseBlockExecutionMatrixV1{
  return terminal('SPARSE_BLOCK_EXECUTION_MATRIX_BLOCKED',blockers,values);
}
function invalid(
  blockers:readonly string[],values:PartialOutput={},
):HsmeSparseBlockExecutionMatrixV1{
  return terminal('SPARSE_BLOCK_EXECUTION_MATRIX_INVALID',blockers,values);
}
function terminal(
  state:'SPARSE_BLOCK_EXECUTION_MATRIX_INVALID'|'SPARSE_BLOCK_EXECUTION_MATRIX_BLOCKED',
  blockers:readonly string[],
  values:PartialOutput,
):HsmeSparseBlockExecutionMatrixV1{
  return deepFreeze({
    schemaVersion:HSME_SPARSE_BLOCK_EXECUTION_MATRIX_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    sparseBlockPlanSha256:values.sparseBlockPlanSha256??'UNKNOWN',
    candidateRosterSha256:values.candidateRosterSha256??'UNKNOWN',
    campaignSha256:values.campaignSha256??'UNKNOWN',
    executionAttemptId:'UNKNOWN',
    rows:Object.freeze([]),
    matrixEvidenceSha256:'UNKNOWN',
    ...matrixAuthorityBoundary(),
  });
}

function campaignAuthorityBoundary(){
  return Object.freeze({
    blockExecutionAllowed:false as const,
    selectionAllowed:false as const,
    modelInstallAllowed:false as const,
    modelFleetPromotionAllowed:false as const,
    durableModelFleetPromotionAllowed:false as const,
    productionAuthorityGranted:false as const,
    providerAuthorityGranted:false as const,
    billingAuthorityGranted:false as const,
    projectArtifactMutationAllowed:false as const,
    aeeExecutionAuthorityGranted:false as const,
  });
}
function hostAuthorityBoundary(){
  const {blockExecutionAllowed:_b,...rest}=campaignAuthorityBoundary();
  return rest;
}
function matrixAuthorityBoundary(){
  return Object.freeze({
    furtherBlockExecutionAllowed:false as const,
    ...hostAuthorityBoundary(),
  });
}
function assertNoAuthority(
  record:Record<string,unknown>,path:string,includeBlockExecution:boolean,
):void{
  const fields=includeBlockExecution
    ?Object.keys(campaignAuthorityBoundary())
    :Object.keys(hostAuthorityBoundary());
  for(const field of fields){
    if(record[field]!==false){
      fail('hsme_sparse_exec_authority',path+'.'+field+' must remain false');
    }
  }
}

function exactDigest(expected:string,actual:string,embedded:string):boolean{
  return HEX64.test(expected)&&expected===actual&&actual===embedded;
}
function exactRecord(
  raw:unknown,fields:readonly string[],path:string,
):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail('hsme_sparse_exec_schema',path+' must be an object');
  }
  const proto=Object.getPrototypeOf(raw);
  if(proto!==Object.prototype&&proto!==null){
    fail('hsme_sparse_exec_schema',path+' must be a plain object');
  }
  const r=raw as Record<string,unknown>;
  const keys=Object.keys(r);
  if(
    keys.length!==fields.length
    ||keys.some(key=>!fields.includes(key))
    ||fields.some(key=>!Object.hasOwn(r,key))
  ){
    fail('hsme_sparse_exec_schema',path+' contains unknown or missing fields');
  }
  return r;
}
function enumValue<T extends readonly string[]>(
  raw:unknown,values:T,path:string,
):T[number]{
  if(typeof raw!=='string'||!(values as readonly string[]).includes(raw)){
    fail('hsme_sparse_exec_value',path+' is unsupported');
  }
  return raw as T[number];
}
function identifier(raw:unknown,path:string,max:number):string{
  const value=boundedString(raw,path,max);
  if(!IDENTIFIER.test(value)){
    fail('hsme_sparse_exec_value',path+' must be an identifier');
  }
  return value;
}
function sha256(raw:unknown,path:string):string{
  const value=boundedString(raw,path,64);
  if(!HEX64.test(value)){
    fail('hsme_sparse_exec_value',path+' must be lowercase SHA-256');
  }
  return value;
}
function boundedString(raw:unknown,path:string,max:number):string{
  if(typeof raw!=='string'){
    fail('hsme_sparse_exec_value',path+' must be a string');
  }
  const value=raw.trim();
  if(value.length<1||value.length>max||/[\u0000-\u001f\u007f]/.test(value)){
    fail('hsme_sparse_exec_value',path+' is invalid');
  }
  return value;
}
function safeInteger(
  raw:unknown,path:string,min:number,max:number,
):number{
  if(!Number.isSafeInteger(raw)||(raw as number)<min||(raw as number)>max){
    fail('hsme_sparse_exec_value',path+' must be a bounded safe integer');
  }
  return raw as number;
}
async function digest(
  domain:string,value:unknown,hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  const result=await hash.sha256(
    new TextEncoder().encode(domain+JSON.stringify(value)),
  );
  if(!HEX64.test(result)){
    fail('hsme_sparse_exec_hash','hash port must return lowercase SHA-256');
  }
  return result;
}
async function verify(run:()=>Promise<boolean>):Promise<boolean>{
  try{return await run()===true;}catch{return false;}
}
function lexical(a:string,b:string):number{
  return a<b?-1:a>b?1:0;
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
  throw new HsmeSparseBlockExecutionMatrixV1Error(code,message);
}
