import {
  HSME_DENSE_STUDENT_REAL_STEP_MATRIX_CAMPAIGN_V1_SCHEMA,
  hsmeDenseStudentRealStepMatrixCampaignV1Digest,
  type HsmeDenseStudentRealStepMatrixCampaignV1,
} from './HsmeDenseStudentRealStepMatrixCampaignV1.ts';
import {
  HSME_DENSE_STUDENT_FIXED_CAPABILITIES_V1,
  HSME_DENSE_STUDENT_FIXED_STEP_COUNTS_V1,
  HSME_DENSE_STUDENT_STEP_MATRIX_EVIDENCE_V1_SCHEMA,
  hsmeDenseStudentStepMatrixEvidenceV1Digest,
  type HsmeDenseStudentStepMatrixEvidenceV1,
  type HsmeDenseStudentStepMeasurementRowV1,
} from './HsmeDenseStudentStepMatrixV1.ts';
import type {
  HsmeDenseStudentTrainingHashPortV1,
} from './HsmeDenseStudentTrainingToolchainV1.ts';

export const HSME_DENSE_STUDENT_QUALITY_FIRST_DISPOSITION_POLICY_V1_SCHEMA =
  'BERS_HSME_DENSE_STUDENT_QUALITY_FIRST_DISPOSITION_POLICY_V1' as const;
export const HSME_DENSE_STUDENT_QUALITY_FIRST_DISPOSITION_POLICY_DIGEST_DOMAIN =
  'bers:hsme:dense-student-quality-first-disposition-policy:v1\0' as const;
export const HSME_DENSE_STUDENT_QUALITY_FIRST_DISPOSITION_V1_SCHEMA =
  'BERS_HSME_DENSE_STUDENT_QUALITY_FIRST_DISPOSITION_V1' as const;
export const HSME_DENSE_STUDENT_QUALITY_FIRST_DISPOSITION_DIGEST_DOMAIN =
  'bers:hsme:dense-student-quality-first-disposition:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+/-]*$/;

type Capability=typeof HSME_DENSE_STUDENT_FIXED_CAPABILITIES_V1[number];
type StepCount=typeof HSME_DENSE_STUDENT_FIXED_STEP_COUNTS_V1[number];

export type HsmeDenseStudentQualityFloorDimensionV1=Readonly<{
  dimensionId:string;
  maxLossMicrounits:number;
}>;

export type HsmeDenseStudentQualityFloorCapabilityV1=Readonly<{
  capability:Capability;
  dimensions:readonly HsmeDenseStudentQualityFloorDimensionV1[];
}>;

export type HsmeDenseStudentQualityFirstDispositionPolicyV1=Readonly<{
  schemaVersion:
    typeof HSME_DENSE_STUDENT_QUALITY_FIRST_DISPOSITION_POLICY_V1_SCHEMA;
  policyId:string;
  benchmarkBindingSha256:string;
  trainingTargetStepCounts:readonly [2,4,6,8];
  capabilities:readonly HsmeDenseStudentQualityFloorCapabilityV1[];
  criticalFailureAllowed:false;
  efficiencyTieBreakPolicy:'QUALITY_PASS_THEN_PARETO_LOWER_IS_BETTER';
  postObservationMutationAllowed:false;
  weightedAggregateScoreAllowed:false;
  efficiencyMayOverrideQualityFailure:false;
  scheduleSelectionAllowed:false;
  trainingExecutionAllowed:false;
  baselineSelectionAllowed:false;
  canonicalDecisionPersistAllowed:false;
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

export interface HsmeDenseStudentQualityFirstCampaignOriginVerifierV1{
  verifyRealStepMatrixCampaign(
    campaign:HsmeDenseStudentRealStepMatrixCampaignV1,
    expectedCampaignEvidenceSha256:string,
  ):Promise<boolean>;
}

export interface HsmeDenseStudentQualityFirstPolicyOriginVerifierV1{
  verifyQualityFirstDispositionPolicy(
    policy:HsmeDenseStudentQualityFirstDispositionPolicyV1,
    expectedPolicyEvidenceSha256:string,
  ):Promise<boolean>;
}

export interface HsmeDenseStudentQualityFirstMatrixOriginVerifierV1{
  verifyStepMatrixEvidence(
    matrix:HsmeDenseStudentStepMatrixEvidenceV1,
    expectedStepMatrixEvidenceSha256:string,
  ):Promise<boolean>;
}

export type HsmeDenseStudentQualityFirstMatrixInputV1=Readonly<{
  trainingTargetStepCount:StepCount;
  stepMatrix:HsmeDenseStudentStepMatrixEvidenceV1;
}>;

export type HsmeDenseStudentQualityDispositionRowV1=Readonly<{
  trainingTargetStepCount:StepCount;
  representationEvidenceSha256:string;
  representationArtifactSha256:string;
  representationBytes:number;
  stepMatrixEvidenceSha256:string;
  qualityState:'QUALITY_FLOOR_PASS'|'QUALITY_FLOOR_FAIL';
  qualityBlockers:readonly string[];
}>;

export type HsmeDenseStudentQualityFirstParetoVectorV1=Readonly<{
  trainingTargetStepCount:StepCount;
  representationBytes:number;
  peakRamBytes:number;
  peakAcceleratorBytes:number;
  coldEndToEndLatencyMicros:number;
  warmEndToEndLatencyMicros:number;
  flashBytesMovedPerRun:number;
}>;

export type HsmeDenseStudentQualityFirstDerivationV1=Readonly<{
  state:
    | 'REAL_REPRESENTATION_QUALITY_REDESIGN_REQUIRED'
    | 'REAL_REPRESENTATION_DISPOSITION_AMBIGUOUS'
    | 'REAL_REPRESENTATION_SELECTED_READY_NOT_PROJECTED';
  perStepQuality:readonly HsmeDenseStudentQualityDispositionRowV1[];
  qualityPassTrainingTargetStepCounts:readonly StepCount[];
  paretoVectors:readonly HsmeDenseStudentQualityFirstParetoVectorV1[];
  paretoNondominatedTrainingTargetStepCounts:readonly StepCount[];
  selectedTrainingTargetStepCount?:StepCount;
}>;

export type HsmeDenseStudentQualityFirstDispositionV1=Readonly<{
  schemaVersion:typeof HSME_DENSE_STUDENT_QUALITY_FIRST_DISPOSITION_V1_SCHEMA;
  state:
    | 'REAL_REPRESENTATION_DISPOSITION_INVALID'
    | 'REAL_REPRESENTATION_DISPOSITION_BLOCKED'
    | 'REAL_REPRESENTATION_QUALITY_REDESIGN_REQUIRED'
    | 'REAL_REPRESENTATION_DISPOSITION_AMBIGUOUS'
    | 'REAL_REPRESENTATION_SELECTED_READY_NOT_PROJECTED';
  blockers:readonly string[];
  campaignEvidenceSha256:string|'UNKNOWN';
  policyEvidenceSha256:string|'UNKNOWN';
  benchmarkBindingSha256:string|'UNKNOWN';
  perStepQuality:readonly HsmeDenseStudentQualityDispositionRowV1[];
  qualityPassTrainingTargetStepCounts:readonly StepCount[];
  paretoVectors:readonly HsmeDenseStudentQualityFirstParetoVectorV1[];
  paretoNondominatedTrainingTargetStepCounts:readonly StepCount[];
  selectedTrainingTargetStepCount?:StepCount;
  selectedRepresentationEvidenceSha256?:string;
  selectedRepresentationArtifactSha256?:string;
  selectedRepresentationBytes?:number;
  selectedStepMatrixEvidenceSha256?:string;
  evidenceSha256:string|'UNKNOWN';
  weightedAggregateScoreAllowed:false;
  efficiencyMayOverrideQualityFailure:false;
  scheduleSelectionAllowed:false;
  trainingExecutionAllowed:false;
  candidateSelectionAllowed:false;
  baselineSelectionAllowed:false;
  canonicalDecisionPersistAllowed:false;
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

export class HsmeDenseStudentQualityFirstDispositionV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeDenseStudentQualityFirstDispositionV1Error';
    this.code=code;
  }
}

export function normalizeHsmeDenseStudentQualityFirstDispositionPolicyV1(
  raw:unknown,
):HsmeDenseStudentQualityFirstDispositionPolicyV1{
  const record=exactRecord(raw,[
    'schemaVersion',
    'policyId',
    'benchmarkBindingSha256',
    'trainingTargetStepCounts',
    'capabilities',
    'criticalFailureAllowed',
    'efficiencyTieBreakPolicy',
    'postObservationMutationAllowed',
    'weightedAggregateScoreAllowed',
    'efficiencyMayOverrideQualityFailure',
    'scheduleSelectionAllowed',
    'trainingExecutionAllowed',
    'baselineSelectionAllowed',
    'canonicalDecisionPersistAllowed',
    'checkpointPromotionAllowed',
    'modelInstallAllowed',
    'modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed',
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted',
    'winnerSelectionAllowed',
  ],'qualityFirstPolicy');
  if(
    record.schemaVersion!==
      HSME_DENSE_STUDENT_QUALITY_FIRST_DISPOSITION_POLICY_V1_SCHEMA
  ){
    fail('hsme_quality_first_policy_schema','quality-first policy schema invalid');
  }
  if(
    !Array.isArray(record.trainingTargetStepCounts)
    ||record.trainingTargetStepCounts.length!==4
    ||record.trainingTargetStepCounts.some(
      (value,index)=>value!==HSME_DENSE_STUDENT_FIXED_STEP_COUNTS_V1[index],
    )
  ){
    fail(
      'hsme_quality_first_policy_training_steps',
      'trainingTargetStepCounts must equal [2,4,6,8]',
    );
  }
  if(!Array.isArray(record.capabilities)||record.capabilities.length!==2){
    fail(
      'hsme_quality_first_policy_capabilities',
      'policy requires exactly two capabilities',
    );
  }

  const capabilities=record.capabilities.map((rawCapability,index)=>{
    const capabilityRecord=exactRecord(rawCapability,[
      'capability','dimensions',
    ],'qualityFirstPolicy.capabilities['+index+']');
    const capability=enumValue(
      capabilityRecord.capability,
      HSME_DENSE_STUDENT_FIXED_CAPABILITIES_V1,
      'qualityFirstPolicy.capabilities['+index+'].capability',
    );
    if(
      !Array.isArray(capabilityRecord.dimensions)
      ||capabilityRecord.dimensions.length<1
      ||capabilityRecord.dimensions.length>32
    ){
      fail(
        'hsme_quality_first_policy_dimensions',
        'each capability requires 1..32 quality dimensions',
      );
    }
    const dimensions=capabilityRecord.dimensions.map((rawDimension,dimensionIndex)=>{
      const dimension=exactRecord(rawDimension,[
        'dimensionId','maxLossMicrounits',
      ],'qualityFirstPolicy.capabilities['+index+'].dimensions['+dimensionIndex+']');
      return Object.freeze({
        dimensionId:identifier(
          dimension.dimensionId,
          'qualityFirstPolicy.capabilities['+index+'].dimensions['
            +dimensionIndex+'].dimensionId',
          120,
        ),
        maxLossMicrounits:safeInteger(
          dimension.maxLossMicrounits,
          'qualityFirstPolicy.capabilities['+index+'].dimensions['
            +dimensionIndex+'].maxLossMicrounits',
          0,
          Number.MAX_SAFE_INTEGER,
        ),
      });
    }).sort((a,b)=>lexical(a.dimensionId,b.dimensionId));
    if(new Set(dimensions.map(value=>value.dimensionId)).size!==dimensions.length){
      fail(
        'hsme_quality_first_policy_dimension_duplicate',
        'quality dimension ids must be unique within capability',
      );
    }
    return Object.freeze({capability,dimensions:Object.freeze(dimensions)});
  }).sort((a,b)=>lexical(a.capability,b.capability));

  if(
    capabilities.map(value=>value.capability).join('\0')!==
      [...HSME_DENSE_STUDENT_FIXED_CAPABILITIES_V1].sort(lexical).join('\0')
  ){
    fail(
      'hsme_quality_first_policy_capability_roster',
      'policy capability roster must exactly equal fixed capabilities',
    );
  }

  if(record.criticalFailureAllowed!==false){
    fail(
      'hsme_quality_first_policy_critical_failure',
      'criticalFailureAllowed must remain false',
    );
  }
  if(
    record.efficiencyTieBreakPolicy!==
      'QUALITY_PASS_THEN_PARETO_LOWER_IS_BETTER'
  ){
    fail(
      'hsme_quality_first_policy_tie_break',
      'only quality-pass then Pareto lower-is-better is allowed',
    );
  }
  for(const field of [
    'postObservationMutationAllowed',
    'weightedAggregateScoreAllowed',
    'efficiencyMayOverrideQualityFailure',
    'scheduleSelectionAllowed',
    'trainingExecutionAllowed',
    'baselineSelectionAllowed',
    'canonicalDecisionPersistAllowed',
    'checkpointPromotionAllowed',
    'modelInstallAllowed',
    'modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed',
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted',
    'winnerSelectionAllowed',
  ]){
    falseValue(record[field], 'qualityFirstPolicy.'+field);
  }

  return deepFreeze({
    schemaVersion:HSME_DENSE_STUDENT_QUALITY_FIRST_DISPOSITION_POLICY_V1_SCHEMA,
    policyId:identifier(record.policyId,'qualityFirstPolicy.policyId',160),
    benchmarkBindingSha256:sha256(
      record.benchmarkBindingSha256,
      'qualityFirstPolicy.benchmarkBindingSha256',
    ),
    trainingTargetStepCounts:HSME_DENSE_STUDENT_FIXED_STEP_COUNTS_V1,
    capabilities:Object.freeze(capabilities),
    criticalFailureAllowed:false,
    efficiencyTieBreakPolicy:'QUALITY_PASS_THEN_PARETO_LOWER_IS_BETTER',
    postObservationMutationAllowed:false,
    weightedAggregateScoreAllowed:false,
    efficiencyMayOverrideQualityFailure:false,
    scheduleSelectionAllowed:false,
    trainingExecutionAllowed:false,
    baselineSelectionAllowed:false,
    canonicalDecisionPersistAllowed:false,
    checkpointPromotionAllowed:false,
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    durableModelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  });
}

export async function hsmeDenseStudentQualityFirstDispositionPolicyV1Digest(
  raw:unknown,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  const policy=normalizeHsmeDenseStudentQualityFirstDispositionPolicyV1(raw);
  return domainDigest(
    HSME_DENSE_STUDENT_QUALITY_FIRST_DISPOSITION_POLICY_DIGEST_DOMAIN,
    policy,
    hash,
  );
}

export function deriveHsmeDenseStudentQualityFirstDispositionV1(
  campaign:HsmeDenseStudentRealStepMatrixCampaignV1,
  rawPolicy:unknown,
  inputs:readonly HsmeDenseStudentQualityFirstMatrixInputV1[],
):HsmeDenseStudentQualityFirstDerivationV1{
  const policy=normalizeHsmeDenseStudentQualityFirstDispositionPolicyV1(
    rawPolicy,
  );
  validateReadyCampaign(campaign);
  if(policy.benchmarkBindingSha256!==campaign.benchmarkBindingSha256){
    fail(
      'hsme_quality_first_policy_binding_mismatch',
      'policy benchmark binding differs from campaign',
    );
  }
  if(!Array.isArray(inputs)||inputs.length!==4){
    fail(
      'hsme_quality_first_matrix_input_count',
      'exactly four matrix inputs are required',
    );
  }
  const declared=inputs.map(value=>value?.trainingTargetStepCount);
  if(
    new Set(declared).size!==4
    ||HSME_DENSE_STUDENT_FIXED_STEP_COUNTS_V1.some(step=>!declared.includes(step))
  ){
    fail(
      'hsme_quality_first_matrix_input_roster',
      'matrix inputs must contain exactly training steps [2,4,6,8]',
    );
  }

  const qualityRows:HsmeDenseStudentQualityDispositionRowV1[]=[];
  const vectors:HsmeDenseStudentQualityFirstParetoVectorV1[]=[];
  let referenceContexts:ReadonlyMap<string,string>|null=null;

  for(const step of HSME_DENSE_STUDENT_FIXED_STEP_COUNTS_V1){
    const entry=campaign.entries.find(
      value=>value.trainingTargetStepCount===step,
    );
    const input=inputs.find(value=>value.trainingTargetStepCount===step);
    if(!entry||!input){
      fail(
        'hsme_quality_first_campaign_entry_missing',
        'campaign/matrix input missing for training step '+step,
      );
    }
    const matrix=input.stepMatrix;
    validateMatrixEnvelope(step,entry,campaign,matrix);
    const contexts=measurementContexts(matrix.rows);
    if(referenceContexts===null)referenceContexts=contexts;
    else if(!sameContexts(referenceContexts,contexts)){
      fail(
        'hsme_quality_first_measurement_context_drift',
        'matrix measurement context differs across training variants',
      );
    }

    const qualityBlockers:string[]=[];
    for(const row of matrix.rows){
      const capabilityPolicy=policy.capabilities.find(
        value=>value.capability===row.capability,
      );
      if(!capabilityPolicy){
        fail(
          'hsme_quality_first_policy_capability_missing',
          'quality policy missing capability '+row.capability,
        );
      }
      const expectedDimensionIds=capabilityPolicy.dimensions.map(
        value=>value.dimensionId,
      );
      const actualDimensionIds=row.qualityDimensions.map(
        value=>value.dimensionId,
      );
      if(!sameStrings(actualDimensionIds,expectedDimensionIds)){
        fail(
          'hsme_quality_first_dimension_roster_mismatch',
          'row quality dimensions differ from policy: '
            +row.capability+':'+row.stepCount,
        );
      }
      if(row.criticalFailureCount>0){
        qualityBlockers.push(
          'CRITICAL_FAILURE_COUNT:'+row.capability+':'+row.stepCount,
        );
      }
      for(const dimension of row.qualityDimensions){
        const rule=capabilityPolicy.dimensions.find(
          value=>value.dimensionId===dimension.dimensionId,
        );
        if(!rule){
          fail(
            'hsme_quality_first_dimension_policy_missing',
            'dimension policy missing: '+dimension.dimensionId,
          );
        }
        if(dimension.criticalFailureObserved){
          qualityBlockers.push(
            'CRITICAL_QUALITY_FAILURE:'
              +row.capability+':'+row.stepCount+':'+dimension.dimensionId,
          );
        }
        if(dimension.lossMicrounits>rule.maxLossMicrounits){
          qualityBlockers.push(
            'QUALITY_FLOOR_EXCEEDED:'
              +row.capability+':'+row.stepCount+':'+dimension.dimensionId,
          );
        }
      }
    }

    const qualityState=qualityBlockers.length===0
      ?'QUALITY_FLOOR_PASS' as const
      :'QUALITY_FLOOR_FAIL' as const;
    qualityRows.push(deepFreeze({
      trainingTargetStepCount:step,
      representationEvidenceSha256:entry.representationEvidenceSha256,
      representationArtifactSha256:entry.representationArtifactSha256,
      representationBytes:entry.representationBytes,
      stepMatrixEvidenceSha256:entry.stepMatrixEvidenceSha256,
      qualityState,
      qualityBlockers:Object.freeze([...new Set(qualityBlockers)].sort(lexical)),
    }));
    if(qualityState==='QUALITY_FLOOR_PASS'){
      vectors.push(vectorFor(step,entry.representationBytes,matrix.rows));
    }
  }

  const qualityPassSteps=Object.freeze(
    qualityRows
      .filter(value=>value.qualityState==='QUALITY_FLOOR_PASS')
      .map(value=>value.trainingTargetStepCount)
      .sort((a,b)=>a-b),
  );

  if(qualityPassSteps.length===0){
    return deepFreeze({
      state:'REAL_REPRESENTATION_QUALITY_REDESIGN_REQUIRED',
      perStepQuality:Object.freeze(qualityRows),
      qualityPassTrainingTargetStepCounts:qualityPassSteps,
      paretoVectors:Object.freeze([]),
      paretoNondominatedTrainingTargetStepCounts:Object.freeze([]),
    });
  }

  const sortedVectors=Object.freeze(
    [...vectors].sort(
      (a,b)=>a.trainingTargetStepCount-b.trainingTargetStepCount,
    ),
  );
  if(qualityPassSteps.length===1){
    return deepFreeze({
      state:'REAL_REPRESENTATION_SELECTED_READY_NOT_PROJECTED',
      perStepQuality:Object.freeze(qualityRows),
      qualityPassTrainingTargetStepCounts:qualityPassSteps,
      paretoVectors:sortedVectors,
      paretoNondominatedTrainingTargetStepCounts:qualityPassSteps,
      selectedTrainingTargetStepCount:qualityPassSteps[0],
    });
  }

  const nondominated=sortedVectors
    .filter(candidate=>
      !sortedVectors.some(other=>
        other.trainingTargetStepCount!==candidate.trainingTargetStepCount
        &&dominates(other,candidate)
      )
    )
    .map(value=>value.trainingTargetStepCount)
    .sort((a,b)=>a-b);

  if(nondominated.length===1){
    return deepFreeze({
      state:'REAL_REPRESENTATION_SELECTED_READY_NOT_PROJECTED',
      perStepQuality:Object.freeze(qualityRows),
      qualityPassTrainingTargetStepCounts:qualityPassSteps,
      paretoVectors:sortedVectors,
      paretoNondominatedTrainingTargetStepCounts:Object.freeze(nondominated),
      selectedTrainingTargetStepCount:nondominated[0],
    });
  }

  return deepFreeze({
    state:'REAL_REPRESENTATION_DISPOSITION_AMBIGUOUS',
    perStepQuality:Object.freeze(qualityRows),
    qualityPassTrainingTargetStepCounts:qualityPassSteps,
    paretoVectors:sortedVectors,
    paretoNondominatedTrainingTargetStepCounts:Object.freeze(nondominated),
  });
}

export async function proveHsmeDenseStudentQualityFirstDispositionV1(
  campaign:HsmeDenseStudentRealStepMatrixCampaignV1,
  expectedCampaignEvidenceSha256:string,
  campaignOrigin:HsmeDenseStudentQualityFirstCampaignOriginVerifierV1,
  rawPolicy:unknown,
  expectedPolicyEvidenceSha256:string,
  policyOrigin:HsmeDenseStudentQualityFirstPolicyOriginVerifierV1,
  inputs:readonly HsmeDenseStudentQualityFirstMatrixInputV1[],
  matrixOrigin:HsmeDenseStudentQualityFirstMatrixOriginVerifierV1,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<HsmeDenseStudentQualityFirstDispositionV1>{
  if(
    !campaign
    ||campaign.schemaVersion!==
      HSME_DENSE_STUDENT_REAL_STEP_MATRIX_CAMPAIGN_V1_SCHEMA
    ||campaign.state!=='REAL_STEP_MATRIX_CAMPAIGN_READY_NOT_SELECTED'
    ||campaign.blockers.length!==0
  ){
    return blocked(['QUALITY_FIRST_READY_CAMPAIGN_REQUIRED']);
  }
  if(campaignAuthorityWidened(campaign)){
    return invalid(['QUALITY_FIRST_CAMPAIGN_AUTHORITY_WIDENING']);
  }

  let campaignEvidenceSha256:string;
  try{
    campaignEvidenceSha256=
      await hsmeDenseStudentRealStepMatrixCampaignV1Digest(campaign,hash);
  }catch{
    return invalid(['QUALITY_FIRST_CAMPAIGN_REHASH_INVALID']);
  }
  if(
    !HEX64.test(expectedCampaignEvidenceSha256)
    ||campaignEvidenceSha256!==expectedCampaignEvidenceSha256
    ||campaignEvidenceSha256!==campaign.evidenceSha256
  ){
    return invalid(
      ['QUALITY_FIRST_CAMPAIGN_REHASH_MISMATCH'],
      {campaignEvidenceSha256},
    );
  }
  if(!await verify(
    ()=>campaignOrigin.verifyRealStepMatrixCampaign(
      campaign,
      campaignEvidenceSha256,
    ),
  )){
    return invalid(
      ['QUALITY_FIRST_CAMPAIGN_ORIGIN_UNVERIFIED'],
      {campaignEvidenceSha256},
    );
  }

  let policy:HsmeDenseStudentQualityFirstDispositionPolicyV1;
  let policyEvidenceSha256:string;
  try{
    policy=normalizeHsmeDenseStudentQualityFirstDispositionPolicyV1(rawPolicy);
    policyEvidenceSha256=
      await hsmeDenseStudentQualityFirstDispositionPolicyV1Digest(policy,hash);
  }catch{
    return invalid(
      ['QUALITY_FIRST_POLICY_INVALID'],
      {campaignEvidenceSha256},
    );
  }
  if(
    !HEX64.test(expectedPolicyEvidenceSha256)
    ||policyEvidenceSha256!==expectedPolicyEvidenceSha256
  ){
    return invalid(
      ['QUALITY_FIRST_POLICY_REHASH_MISMATCH'],
      {campaignEvidenceSha256,policyEvidenceSha256},
    );
  }
  if(!await verify(
    ()=>policyOrigin.verifyQualityFirstDispositionPolicy(
      policy,
      policyEvidenceSha256,
    ),
  )){
    return invalid(
      ['QUALITY_FIRST_POLICY_ORIGIN_UNVERIFIED'],
      {campaignEvidenceSha256,policyEvidenceSha256},
    );
  }
  if(policy.benchmarkBindingSha256!==campaign.benchmarkBindingSha256){
    return invalid(
      ['QUALITY_FIRST_POLICY_BINDING_MISMATCH'],
      {campaignEvidenceSha256,policyEvidenceSha256},
    );
  }

  if(!Array.isArray(inputs)||inputs.length!==4){
    return blocked(
      ['QUALITY_FIRST_COMPLETE_FOUR_MATRIX_SET_REQUIRED'],
      {campaignEvidenceSha256,policyEvidenceSha256},
    );
  }
  const declared=inputs.map(value=>value?.trainingTargetStepCount);
  if(
    new Set(declared).size!==4
    ||HSME_DENSE_STUDENT_FIXED_STEP_COUNTS_V1.some(step=>!declared.includes(step))
  ){
    return invalid(
      ['QUALITY_FIRST_MATRIX_INPUT_ROSTER_INVALID'],
      {campaignEvidenceSha256,policyEvidenceSha256},
    );
  }

  for(const step of HSME_DENSE_STUDENT_FIXED_STEP_COUNTS_V1){
    const entry=campaign.entries.find(
      value=>value.trainingTargetStepCount===step,
    );
    const input=inputs.find(value=>value.trainingTargetStepCount===step);
    if(!entry||!input){
      return invalid(
        ['QUALITY_FIRST_CAMPAIGN_MATRIX_ENTRY_MISSING:'+step],
        {campaignEvidenceSha256,policyEvidenceSha256},
      );
    }
    const matrix=input.stepMatrix;
    if(
      !matrix
      ||matrix.schemaVersion!==HSME_DENSE_STUDENT_STEP_MATRIX_EVIDENCE_V1_SCHEMA
      ||matrix.state!=='STEP_MATRIX_READY_NOT_SELECTED'
      ||matrix.blockers.length!==0
    ){
      return blocked(
        ['QUALITY_FIRST_READY_MATRIX_REQUIRED:'+step],
        {campaignEvidenceSha256,policyEvidenceSha256},
      );
    }
    if(matrixAuthorityWidened(matrix)){
      return invalid(
        ['QUALITY_FIRST_MATRIX_AUTHORITY_WIDENING:'+step],
        {campaignEvidenceSha256,policyEvidenceSha256},
      );
    }
    let matrixSha:string;
    try{
      matrixSha=await hsmeDenseStudentStepMatrixEvidenceV1Digest(matrix,hash);
    }catch{
      return invalid(
        ['QUALITY_FIRST_MATRIX_REHASH_INVALID:'+step],
        {campaignEvidenceSha256,policyEvidenceSha256},
      );
    }
    if(
      matrixSha!==matrix.evidenceSha256
      ||matrixSha!==entry.stepMatrixEvidenceSha256
    ){
      return invalid(
        ['QUALITY_FIRST_MATRIX_REHASH_MISMATCH:'+step],
        {campaignEvidenceSha256,policyEvidenceSha256},
      );
    }
    if(!await verify(
      ()=>matrixOrigin.verifyStepMatrixEvidence(matrix,matrixSha),
    )){
      return invalid(
        ['QUALITY_FIRST_MATRIX_ORIGIN_UNVERIFIED:'+step],
        {campaignEvidenceSha256,policyEvidenceSha256},
      );
    }
    if(
      matrix.candidateId!==campaign.candidateId
      ||matrix.representationEvidenceSha256!==entry.representationEvidenceSha256
      ||matrix.representationArtifactSha256!==entry.representationArtifactSha256
      ||matrix.representationBytes!==entry.representationBytes
      ||matrix.benchmarkBindingSha256!==campaign.benchmarkBindingSha256
    ){
      return invalid(
        ['QUALITY_FIRST_MATRIX_CAMPAIGN_BINDING_MISMATCH:'+step],
        {campaignEvidenceSha256,policyEvidenceSha256},
      );
    }
  }

  let derivation:HsmeDenseStudentQualityFirstDerivationV1;
  try{
    derivation=deriveHsmeDenseStudentQualityFirstDispositionV1(
      campaign,
      policy,
      inputs,
    );
  }catch(error){
    return invalid(
      ['QUALITY_FIRST_DERIVATION_INVALID'+errorCodeSuffix(error)],
      {campaignEvidenceSha256,policyEvidenceSha256},
    );
  }

  const selectedEntry=derivation.selectedTrainingTargetStepCount===undefined
    ?undefined
    :campaign.entries.find(
      value=>
        value.trainingTargetStepCount===derivation.selectedTrainingTargetStepCount,
    );
  if(
    derivation.state==='REAL_REPRESENTATION_SELECTED_READY_NOT_PROJECTED'
    &&!selectedEntry
  ){
    return invalid(
      ['QUALITY_FIRST_SELECTED_ENTRY_MISSING'],
      {campaignEvidenceSha256,policyEvidenceSha256},
    );
  }

  const readyPayload={
    schemaVersion:HSME_DENSE_STUDENT_QUALITY_FIRST_DISPOSITION_V1_SCHEMA,
    state:derivation.state,
    blockers:Object.freeze([]) as readonly string[],
    campaignEvidenceSha256,
    policyEvidenceSha256,
    benchmarkBindingSha256:campaign.benchmarkBindingSha256 as string,
    perStepQuality:derivation.perStepQuality,
    qualityPassTrainingTargetStepCounts:
      derivation.qualityPassTrainingTargetStepCounts,
    paretoVectors:derivation.paretoVectors,
    paretoNondominatedTrainingTargetStepCounts:
      derivation.paretoNondominatedTrainingTargetStepCounts,
    ...(selectedEntry?{
      selectedTrainingTargetStepCount:
        derivation.selectedTrainingTargetStepCount as StepCount,
      selectedRepresentationEvidenceSha256:
        selectedEntry.representationEvidenceSha256,
      selectedRepresentationArtifactSha256:
        selectedEntry.representationArtifactSha256,
      selectedRepresentationBytes:selectedEntry.representationBytes,
      selectedStepMatrixEvidenceSha256:selectedEntry.stepMatrixEvidenceSha256,
    }:{}),
    ...authorityBoundary(),
  };
  const evidenceSha256=await dispositionDigest(readyPayload,hash);
  return deepFreeze({...readyPayload,evidenceSha256});
}

export async function hsmeDenseStudentQualityFirstDispositionV1Digest(
  value:HsmeDenseStudentQualityFirstDispositionV1,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  if(
    ![
      'REAL_REPRESENTATION_QUALITY_REDESIGN_REQUIRED',
      'REAL_REPRESENTATION_DISPOSITION_AMBIGUOUS',
      'REAL_REPRESENTATION_SELECTED_READY_NOT_PROJECTED',
    ].includes(value.state)
    ||value.blockers.length!==0
    ||value.campaignEvidenceSha256==='UNKNOWN'
    ||value.policyEvidenceSha256==='UNKNOWN'
    ||value.benchmarkBindingSha256==='UNKNOWN'
    ||value.evidenceSha256==='UNKNOWN'
  ){
    fail(
      'hsme_quality_first_disposition_digest_state',
      'only valid terminal quality-first dispositions are digestible',
    );
  }
  const {evidenceSha256:_ignored,...payload}=value;
  return dispositionDigest(payload,hash);
}

function validateReadyCampaign(
  campaign:HsmeDenseStudentRealStepMatrixCampaignV1,
):void{
  if(
    campaign.schemaVersion!==HSME_DENSE_STUDENT_REAL_STEP_MATRIX_CAMPAIGN_V1_SCHEMA
    ||campaign.state!=='REAL_STEP_MATRIX_CAMPAIGN_READY_NOT_SELECTED'
    ||campaign.blockers.length!==0
    ||campaign.entries.length!==4
    ||campaign.benchmarkBindingSha256==='UNKNOWN'
    ||campaign.candidateId==='UNKNOWN'
  ){
    fail(
      'hsme_quality_first_campaign_not_ready',
      'quality-first derivation requires READY_NOT_SELECTED campaign',
    );
  }
  if(campaignAuthorityWidened(campaign)){
    fail(
      'hsme_quality_first_campaign_authority',
      'campaign authority must remain false',
    );
  }
  const steps=campaign.entries
    .map(value=>value.trainingTargetStepCount)
    .sort((a,b)=>a-b);
  if(!sameNumbers(steps,HSME_DENSE_STUDENT_FIXED_STEP_COUNTS_V1)){
    fail(
      'hsme_quality_first_campaign_roster',
      'campaign entries must exactly equal training steps [2,4,6,8]',
    );
  }
}

function validateMatrixEnvelope(
  step:StepCount,
  entry:HsmeDenseStudentRealStepMatrixCampaignV1['entries'][number],
  campaign:HsmeDenseStudentRealStepMatrixCampaignV1,
  matrix:HsmeDenseStudentStepMatrixEvidenceV1,
):void{
  if(
    matrix.schemaVersion!==HSME_DENSE_STUDENT_STEP_MATRIX_EVIDENCE_V1_SCHEMA
    ||matrix.state!=='STEP_MATRIX_READY_NOT_SELECTED'
    ||matrix.blockers.length!==0
    ||matrix.rows.length!==8
    ||matrix.evidenceSha256==='UNKNOWN'
    ||matrix.benchmarkBindingSha256==='UNKNOWN'
    ||matrix.representationEvidenceSha256==='UNKNOWN'
    ||matrix.representationArtifactSha256==='UNKNOWN'
    ||matrix.representationBytes==='UNKNOWN'
  ){
    fail(
      'hsme_quality_first_matrix_not_ready',
      'matrix is not complete READY_NOT_SELECTED: '+step,
    );
  }
  if(matrixAuthorityWidened(matrix)){
    fail(
      'hsme_quality_first_matrix_authority',
      'matrix authority widened: '+step,
    );
  }
  if(
    matrix.evidenceSha256!==entry.stepMatrixEvidenceSha256
    ||matrix.candidateId!==campaign.candidateId
    ||matrix.representationEvidenceSha256!==entry.representationEvidenceSha256
    ||matrix.representationArtifactSha256!==entry.representationArtifactSha256
    ||matrix.representationBytes!==entry.representationBytes
    ||matrix.benchmarkBindingSha256!==campaign.benchmarkBindingSha256
  ){
    fail(
      'hsme_quality_first_matrix_binding',
      'matrix differs from frozen campaign entry: '+step,
    );
  }

  const expectedKeys=HSME_DENSE_STUDENT_FIXED_CAPABILITIES_V1.flatMap(
    capability=>
      HSME_DENSE_STUDENT_FIXED_STEP_COUNTS_V1.map(
        inferenceStep=>capability+'\0'+inferenceStep,
      )
  ).sort(lexical);
  const actualKeys=matrix.rows.map(
    row=>row.capability+'\0'+row.stepCount,
  ).sort(lexical);
  if(!sameStrings(actualKeys,expectedKeys)){
    fail(
      'hsme_quality_first_matrix_row_roster',
      'matrix must contain exact capability x [2,4,6,8] rows: '+step,
    );
  }
  for(const row of matrix.rows)validateRowNumbers(row);
}

function validateRowNumbers(row:HsmeDenseStudentStepMeasurementRowV1):void{
  for(const [name,value] of [
    ['sampleCount',row.sampleCount],
    ['successCount',row.successCount],
    ['failureCount',row.failureCount],
    ['criticalFailureCount',row.criticalFailureCount],
    ['coldEndToEndLatencyMicros',row.coldEndToEndLatencyMicros],
    ['warmEndToEndLatencyMicros',row.warmEndToEndLatencyMicros],
    ['perStepLatencyMicros',row.perStepLatencyMicros],
    ['peakRamBytes',row.peakRamBytes],
    ['peakAcceleratorBytes',row.peakAcceleratorBytes],
    ['activeRepresentationBytes',row.activeRepresentationBytes],
    ['residentRepresentationBytes',row.residentRepresentationBytes],
    ['flashBytesMovedPerRun',row.flashBytesMovedPerRun],
  ] as const){
    if(!Number.isSafeInteger(value)||value<0){
      fail(
        'hsme_quality_first_matrix_numeric',
        row.capability+':'+row.stepCount+':'+name+' must be non-negative safe integer',
      );
    }
  }
  if(row.sampleCount<1||row.successCount+row.failureCount!==row.sampleCount){
    fail(
      'hsme_quality_first_matrix_sample_accounting',
      'row sample accounting invalid',
    );
  }
  if(
    !Array.isArray(row.qualityDimensions)
    ||row.qualityDimensions.length<1
    ||new Set(row.qualityDimensions.map(value=>value.dimensionId)).size!==
      row.qualityDimensions.length
  ){
    fail(
      'hsme_quality_first_matrix_dimensions',
      'row quality dimension roster invalid',
    );
  }
  for(const dimension of row.qualityDimensions){
    identifier(dimension.dimensionId,'row.dimensionId',120);
    if(
      !Number.isSafeInteger(dimension.lossMicrounits)
      ||dimension.lossMicrounits<0
      ||typeof dimension.criticalFailureObserved!=='boolean'
      ||!HEX64.test(dimension.evidenceSha256)
    ){
      fail(
        'hsme_quality_first_matrix_dimension_evidence',
        'row quality dimension evidence invalid',
      );
    }
  }
}

function measurementContexts(
  rows:readonly HsmeDenseStudentStepMeasurementRowV1[],
):ReadonlyMap<string,string>{
  const entries=rows.map(row=>[
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

function vectorFor(
  step:StepCount,
  representationBytes:number,
  rows:readonly HsmeDenseStudentStepMeasurementRowV1[],
):HsmeDenseStudentQualityFirstParetoVectorV1{
  if(!Number.isSafeInteger(representationBytes)||representationBytes<1){
    fail(
      'hsme_quality_first_representation_bytes',
      'representationBytes must be positive safe integer',
    );
  }
  return deepFreeze({
    trainingTargetStepCount:step,
    representationBytes,
    peakRamBytes:maxRows(rows,'peakRamBytes'),
    peakAcceleratorBytes:maxRows(rows,'peakAcceleratorBytes'),
    coldEndToEndLatencyMicros:maxRows(rows,'coldEndToEndLatencyMicros'),
    warmEndToEndLatencyMicros:maxRows(rows,'warmEndToEndLatencyMicros'),
    flashBytesMovedPerRun:maxRows(rows,'flashBytesMovedPerRun'),
  });
}

function maxRows(
  rows:readonly HsmeDenseStudentStepMeasurementRowV1[],
  field:
    |'peakRamBytes'
    |'peakAcceleratorBytes'
    |'coldEndToEndLatencyMicros'
    |'warmEndToEndLatencyMicros'
    |'flashBytesMovedPerRun',
):number{
  return Math.max(...rows.map(row=>row[field]));
}

export function hsmeDenseStudentQualityFirstParetoDominatesV1(
  left:HsmeDenseStudentQualityFirstParetoVectorV1,
  right:HsmeDenseStudentQualityFirstParetoVectorV1,
):boolean{
  return dominates(left,right);
}

function dominates(
  left:HsmeDenseStudentQualityFirstParetoVectorV1,
  right:HsmeDenseStudentQualityFirstParetoVectorV1,
):boolean{
  const pairs=[
    [left.representationBytes,right.representationBytes],
    [left.peakRamBytes,right.peakRamBytes],
    [left.peakAcceleratorBytes,right.peakAcceleratorBytes],
    [left.coldEndToEndLatencyMicros,right.coldEndToEndLatencyMicros],
    [left.warmEndToEndLatencyMicros,right.warmEndToEndLatencyMicros],
    [left.flashBytesMovedPerRun,right.flashBytesMovedPerRun],
  ];
  return pairs.every(([a,b])=>a<=b)&&pairs.some(([a,b])=>a<b);
}

function campaignAuthorityWidened(
  value:HsmeDenseStudentRealStepMatrixCampaignV1,
):boolean{
  return value.weightedAggregateScoreAllowed!==false
    ||value.efficiencyMayOverrideQualityFailure!==false
    ||value.scheduleSelectionAllowed!==false
    ||value.trainingVariantSelectionAllowed!==false
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
    trainingExecutionAllowed:false as const,
    candidateSelectionAllowed:false as const,
    baselineSelectionAllowed:false as const,
    canonicalDecisionPersistAllowed:false as const,
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

type PartialOutput=Partial<Pick<
  HsmeDenseStudentQualityFirstDispositionV1,
  'campaignEvidenceSha256'|'policyEvidenceSha256'|'benchmarkBindingSha256'
>>;

function invalid(
  blockers:readonly string[],
  input:PartialOutput={},
):HsmeDenseStudentQualityFirstDispositionV1{
  return terminal(
    'REAL_REPRESENTATION_DISPOSITION_INVALID',
    blockers,
    input,
  );
}

function blocked(
  blockers:readonly string[],
  input:PartialOutput={},
):HsmeDenseStudentQualityFirstDispositionV1{
  return terminal(
    'REAL_REPRESENTATION_DISPOSITION_BLOCKED',
    blockers,
    input,
  );
}

function terminal(
  state:
    |'REAL_REPRESENTATION_DISPOSITION_INVALID'
    |'REAL_REPRESENTATION_DISPOSITION_BLOCKED',
  blockers:readonly string[],
  input:PartialOutput,
):HsmeDenseStudentQualityFirstDispositionV1{
  return deepFreeze({
    schemaVersion:HSME_DENSE_STUDENT_QUALITY_FIRST_DISPOSITION_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    campaignEvidenceSha256:input.campaignEvidenceSha256??'UNKNOWN',
    policyEvidenceSha256:input.policyEvidenceSha256??'UNKNOWN',
    benchmarkBindingSha256:input.benchmarkBindingSha256??'UNKNOWN',
    perStepQuality:Object.freeze([]),
    qualityPassTrainingTargetStepCounts:Object.freeze([]),
    paretoVectors:Object.freeze([]),
    paretoNondominatedTrainingTargetStepCounts:Object.freeze([]),
    evidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

async function dispositionDigest(
  value:unknown,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  return domainDigest(
    HSME_DENSE_STUDENT_QUALITY_FIRST_DISPOSITION_DIGEST_DOMAIN,
    value,
    hash,
  );
}

async function domainDigest(
  domain:string,
  value:unknown,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  const digest=await hash.sha256(new TextEncoder().encode(
    domain+JSON.stringify(value),
  ));
  if(!HEX64.test(digest)){
    fail(
      'hsme_quality_first_hash_port',
      'hash port must return lowercase SHA-256',
    );
  }
  return digest;
}

function exactRecord(
  raw:unknown,
  allowed:readonly string[],
  path:string,
):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail('hsme_quality_first_exact_schema',path+' must be an object');
  }
  const record=raw as Record<string,unknown>;
  const keys=Object.keys(record);
  if(
    keys.length!==allowed.length
    ||keys.some(key=>!allowed.includes(key))
    ||allowed.some(key=>!Object.hasOwn(record,key))
  ){
    fail(
      'hsme_quality_first_exact_schema',
      path+' has unknown or missing fields',
    );
  }
  return record;
}

function enumValue<T extends readonly string[]>(
  raw:unknown,
  values:T,
  path:string,
):T[number]{
  if(typeof raw!=='string'||!(values as readonly string[]).includes(raw)){
    fail('hsme_quality_first_enum',path+' is unsupported');
  }
  return raw as T[number];
}

function identifier(raw:unknown,path:string,max:number):string{
  if(
    typeof raw!=='string'
    ||raw.length<1
    ||raw.length>max
    ||raw.trim()!==raw
    ||!IDENTIFIER.test(raw)
  ){
    fail('hsme_quality_first_identifier',path+' is invalid');
  }
  return raw;
}

function sha256(raw:unknown,path:string):string{
  if(typeof raw!=='string'||!HEX64.test(raw)){
    fail('hsme_quality_first_sha256',path+' must be lowercase SHA-256');
  }
  return raw;
}

function safeInteger(
  raw:unknown,
  path:string,
  min:number,
  max:number,
):number{
  if(
    typeof raw!=='number'
    ||!Number.isSafeInteger(raw)
    ||raw<min
    ||raw>max
  ){
    fail('hsme_quality_first_integer',path+' is outside safe bounds');
  }
  return raw;
}

function falseValue(raw:unknown,path:string):false{
  if(raw!==false){
    fail('hsme_quality_first_authority',path+' must remain false');
  }
  return false;
}

function sameStrings(left:readonly string[],right:readonly string[]):boolean{
  return left.length===right.length
    &&left.every((value,index)=>value===right[index]);
}

function sameNumbers(left:readonly number[],right:readonly number[]):boolean{
  return left.length===right.length
    &&left.every((value,index)=>value===right[index]);
}

function errorCodeSuffix(error:unknown):string{
  if(
    error
    &&typeof error==='object'
    &&'code' in error
    &&typeof (error as {code?:unknown}).code==='string'
  ){
    return ':'+(error as {code:string}).code;
  }
  return '';
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

function fail(code:string,message:string):never{
  throw new HsmeDenseStudentQualityFirstDispositionV1Error(code,message);
}
