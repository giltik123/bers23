import {
  hsmeAdaptiveResidencyExperimentPlanV1Digest,
  type HsmeAdaptiveResidencyExperimentPlanV1,
} from './HsmeAdaptiveResidencyExperimentPlanV1.ts';
import {
  hsmeAdaptiveResidencyMovementReceiptV1Digest,
  type HsmeAdaptiveResidencyMovementReceiptV1,
} from './HsmeAdaptiveResidencyMovementReceiptV1.ts';
import {
  hsmePredictivePrefetchComparisonV1Digest,
  type HsmePredictivePrefetchComparisonV1,
} from './HsmePredictivePrefetchComparisonV1.ts';
import {
  hsmeDoubleBufferComparisonV1Digest,
  type HsmeDoubleBufferComparisonV1,
} from './HsmeDoubleBufferComparisonV1.ts';
import type {
  HsmeDenseBaselineHashPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

export const HSME_RESIDENCY_QUALITY_PRESERVATION_ATTESTATION_V1_SCHEMA =
  'BERS_HSME_RESIDENCY_QUALITY_PRESERVATION_ATTESTATION_V1' as const;
export const HSME_RESIDENCY_QUALITY_PRESERVATION_ATTESTATION_DIGEST_DOMAIN =
  'bers:hsme:residency-quality-preservation-attestation:v1\0' as const;
export const HSME_ADAPTIVE_RESIDENCY_DISPOSITION_POLICY_V1_SCHEMA =
  'BERS_HSME_ADAPTIVE_RESIDENCY_DISPOSITION_POLICY_V1' as const;
export const HSME_ADAPTIVE_RESIDENCY_DISPOSITION_POLICY_DIGEST_DOMAIN =
  'bers:hsme:adaptive-residency-disposition-policy:v1\0' as const;
export const HSME_ADAPTIVE_RESIDENCY_DISPOSITION_V1_SCHEMA =
  'BERS_HSME_ADAPTIVE_RESIDENCY_DISPOSITION_V1' as const;
export const HSME_ADAPTIVE_RESIDENCY_DISPOSITION_DIGEST_DOMAIN =
  'bers:hsme:adaptive-residency-disposition:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;

export type HsmeResidencyQualityPreservationAttestationV1=Readonly<{
  schemaVersion:
    typeof HSME_RESIDENCY_QUALITY_PRESERVATION_ATTESTATION_V1_SCHEMA;
  prototypeSha256:string;
  qualityEvidenceSha256:string;
  preservationState:'PASS'|'FAIL';
  reviewState:'QUALITY_PRESERVATION_REVIEWED';
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

export type HsmeAdaptiveResidencyDispositionPolicyV1=Readonly<{
  schemaVersion:typeof HSME_ADAPTIVE_RESIDENCY_DISPOSITION_POLICY_V1_SCHEMA;
  residencyPlanSha256:string;
  movementReceiptSha256:string;
  predictiveComparisonSha256:string;
  doubleBufferComparisonSha256:string;
  minPredictiveFlashReadImprovementBps:number;
  minPredictiveStallImprovementBps:number;
  maxPredictiveFlashReadRegressionBps:number;
  maxPredictiveStallRegressionBps:number;
  minDoubleBufferLatencyImprovementBps:number;
  maxDoubleBufferStallRegressionBps:number;
  maxBufferBytes:number;
  reviewState:'QUALITY_WALL_CLOCK_RESOURCE_POLICY_REVIEWED';
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

export interface HsmeAdaptiveResidencyDispositionInputOriginVerifierV1{
  verifyResidencyPlan(
    plan:HsmeAdaptiveResidencyExperimentPlanV1,
    expectedSha256:string,
  ):Promise<boolean>;
  verifyMovementReceipt(
    receipt:HsmeAdaptiveResidencyMovementReceiptV1,
    expectedSha256:string,
  ):Promise<boolean>;
  verifyPredictiveComparison(
    comparison:HsmePredictivePrefetchComparisonV1,
    expectedSha256:string,
  ):Promise<boolean>;
  verifyDoubleBufferComparison(
    comparison:HsmeDoubleBufferComparisonV1,
    expectedSha256:string,
  ):Promise<boolean>;
}

export interface HsmeResidencyQualityPreservationOriginVerifierV1{
  verifyQualityPreservation(
    attestation:HsmeResidencyQualityPreservationAttestationV1,
    expectedSha256:string,
  ):Promise<boolean>;
}

export interface HsmeAdaptiveResidencyDispositionPolicyOriginVerifierV1{
  verifyDispositionPolicy(
    policy:HsmeAdaptiveResidencyDispositionPolicyV1,
    expectedSha256:string,
  ):Promise<boolean>;
}

export type HsmeAdaptiveResidencyMechanismV1=
  |'PREDICTIVE_PREFETCH'
  |'DOUBLE_BUFFERING';

export type HsmeAdaptiveResidencyMechanismDispositionV1=Readonly<{
  mechanism:HsmeAdaptiveResidencyMechanismV1;
  qualityGate:'PASS'|'FAIL';
  materialBenefit:boolean;
  resourceGate:'PASS'|'FAIL';
  advance:boolean;
  reasons:readonly string[];
}>;

export type HsmeAdaptiveResidencyDispositionV1=Readonly<{
  schemaVersion:typeof HSME_ADAPTIVE_RESIDENCY_DISPOSITION_V1_SCHEMA;
  state:
    |'ADAPTIVE_RESIDENCY_DISPOSITION_INVALID'
    |'ADAPTIVE_RESIDENCY_DISPOSITION_BLOCKED'
    |'ADAPTIVE_RESIDENCY_DISPOSITION_READY';
  blockers:readonly string[];
  disposition:'ADVANCE'|'REDESIGN'|'REJECT'|'NONE';
  residencyPlanSha256:string|'UNKNOWN';
  movementReceiptSha256:string|'UNKNOWN';
  predictiveComparisonSha256:string|'UNKNOWN';
  doubleBufferComparisonSha256:string|'UNKNOWN';
  qualityAttestationSha256:string|'UNKNOWN';
  dispositionPolicySha256:string|'UNKNOWN';
  prototypeSha256:string|'UNKNOWN';
  qualityEvidenceSha256:string|'UNKNOWN';
  predictiveFlashReadImprovementBps:number|'UNKNOWN';
  predictiveStallImprovementBps:number|'UNKNOWN';
  doubleBufferLatencyImprovementBps:number|'UNKNOWN';
  doubleBufferStallImprovementBps:number|'UNKNOWN';
  mechanismDispositions:readonly HsmeAdaptiveResidencyMechanismDispositionV1[];
  advancedMechanisms:readonly HsmeAdaptiveResidencyMechanismV1[];
  dispositionEvidenceSha256:string|'UNKNOWN';
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

export class HsmeAdaptiveResidencyDispositionV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeAdaptiveResidencyDispositionV1Error';
    this.code=code;
  }
}

export function normalizeHsmeResidencyQualityPreservationAttestationV1(
  raw:unknown,
):HsmeResidencyQualityPreservationAttestationV1{
  const r=exactRecord(raw,[
    'schemaVersion','prototypeSha256','qualityEvidenceSha256',
    'preservationState','reviewState','selectionAllowed','modelInstallAllowed',
    'modelFleetPromotionAllowed','durableModelFleetPromotionAllowed',
    'productionAuthorityGranted','providerAuthorityGranted',
    'billingAuthorityGranted','projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted',
  ],'qualityAttestation');
  if(
    r.schemaVersion!==
      HSME_RESIDENCY_QUALITY_PRESERVATION_ATTESTATION_V1_SCHEMA
    ||r.reviewState!=='QUALITY_PRESERVATION_REVIEWED'
    ||(r.preservationState!=='PASS'&&r.preservationState!=='FAIL')
  ){
    fail('hsme_residency_disposition_quality_schema','quality attestation invalid');
  }
  assertNoAuthority(r,'qualityAttestation');
  return deepFreeze({
    schemaVersion:
      HSME_RESIDENCY_QUALITY_PRESERVATION_ATTESTATION_V1_SCHEMA,
    prototypeSha256:sha256(
      r.prototypeSha256,'qualityAttestation.prototypeSha256',
    ),
    qualityEvidenceSha256:sha256(
      r.qualityEvidenceSha256,'qualityAttestation.qualityEvidenceSha256',
    ),
    preservationState:r.preservationState,
    reviewState:'QUALITY_PRESERVATION_REVIEWED',
    ...authorityBoundary(),
  });
}

export function normalizeHsmeAdaptiveResidencyDispositionPolicyV1(
  raw:unknown,
):HsmeAdaptiveResidencyDispositionPolicyV1{
  const r=exactRecord(raw,[
    'schemaVersion','residencyPlanSha256','movementReceiptSha256',
    'predictiveComparisonSha256','doubleBufferComparisonSha256',
    'minPredictiveFlashReadImprovementBps',
    'minPredictiveStallImprovementBps',
    'maxPredictiveFlashReadRegressionBps',
    'maxPredictiveStallRegressionBps',
    'minDoubleBufferLatencyImprovementBps',
    'maxDoubleBufferStallRegressionBps','maxBufferBytes','reviewState',
    'selectionAllowed','modelInstallAllowed','modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed','productionAuthorityGranted',
    'providerAuthorityGranted','billingAuthorityGranted',
    'projectArtifactMutationAllowed','aeeExecutionAuthorityGranted',
  ],'policy');
  if(
    r.schemaVersion!==HSME_ADAPTIVE_RESIDENCY_DISPOSITION_POLICY_V1_SCHEMA
    ||r.reviewState!=='QUALITY_WALL_CLOCK_RESOURCE_POLICY_REVIEWED'
  ){
    fail('hsme_residency_disposition_policy_schema','disposition policy invalid');
  }
  assertNoAuthority(r,'policy');
  return deepFreeze({
    schemaVersion:HSME_ADAPTIVE_RESIDENCY_DISPOSITION_POLICY_V1_SCHEMA,
    residencyPlanSha256:sha256(
      r.residencyPlanSha256,'policy.residencyPlanSha256',
    ),
    movementReceiptSha256:sha256(
      r.movementReceiptSha256,'policy.movementReceiptSha256',
    ),
    predictiveComparisonSha256:sha256(
      r.predictiveComparisonSha256,'policy.predictiveComparisonSha256',
    ),
    doubleBufferComparisonSha256:sha256(
      r.doubleBufferComparisonSha256,'policy.doubleBufferComparisonSha256',
    ),
    minPredictiveFlashReadImprovementBps:bps(
      r.minPredictiveFlashReadImprovementBps,
      'policy.minPredictiveFlashReadImprovementBps',
    ),
    minPredictiveStallImprovementBps:bps(
      r.minPredictiveStallImprovementBps,
      'policy.minPredictiveStallImprovementBps',
    ),
    maxPredictiveFlashReadRegressionBps:bps(
      r.maxPredictiveFlashReadRegressionBps,
      'policy.maxPredictiveFlashReadRegressionBps',
    ),
    maxPredictiveStallRegressionBps:bps(
      r.maxPredictiveStallRegressionBps,
      'policy.maxPredictiveStallRegressionBps',
    ),
    minDoubleBufferLatencyImprovementBps:bps(
      r.minDoubleBufferLatencyImprovementBps,
      'policy.minDoubleBufferLatencyImprovementBps',
    ),
    maxDoubleBufferStallRegressionBps:bps(
      r.maxDoubleBufferStallRegressionBps,
      'policy.maxDoubleBufferStallRegressionBps',
    ),
    maxBufferBytes:safeInteger(
      r.maxBufferBytes,'policy.maxBufferBytes',0,Number.MAX_SAFE_INTEGER,
    ),
    reviewState:'QUALITY_WALL_CLOCK_RESOURCE_POLICY_REVIEWED',
    ...authorityBoundary(),
  });
}

export async function hsmeResidencyQualityPreservationAttestationV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  return digest(
    HSME_RESIDENCY_QUALITY_PRESERVATION_ATTESTATION_DIGEST_DOMAIN,
    normalizeHsmeResidencyQualityPreservationAttestationV1(raw),
    hash,
  );
}

export async function hsmeAdaptiveResidencyDispositionPolicyV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  return digest(
    HSME_ADAPTIVE_RESIDENCY_DISPOSITION_POLICY_DIGEST_DOMAIN,
    normalizeHsmeAdaptiveResidencyDispositionPolicyV1(raw),
    hash,
  );
}

export async function disposeHsmeAdaptiveResidencyV1(
  plan:HsmeAdaptiveResidencyExperimentPlanV1,
  expectedPlanSha256:string,
  movement:HsmeAdaptiveResidencyMovementReceiptV1,
  expectedMovementSha256:string,
  predictive:HsmePredictivePrefetchComparisonV1,
  expectedPredictiveSha256:string,
  doubleBuffer:HsmeDoubleBufferComparisonV1,
  expectedDoubleBufferSha256:string,
  inputOrigin:HsmeAdaptiveResidencyDispositionInputOriginVerifierV1,
  rawQualityAttestation:unknown,
  expectedQualityAttestationSha256:string,
  qualityOrigin:HsmeResidencyQualityPreservationOriginVerifierV1,
  rawPolicy:unknown,
  expectedPolicySha256:string,
  policyOrigin:HsmeAdaptiveResidencyDispositionPolicyOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeAdaptiveResidencyDispositionV1>{
  if(
    plan.state!=='ADAPTIVE_RESIDENCY_PLAN_FROZEN_NOT_EXECUTED'
    ||movement.state!=='ADAPTIVE_RESIDENCY_MOVEMENT_READY_NOT_INFERRED'
    ||predictive.state!=='PREDICTIVE_PREFETCH_COMPARISON_READY_NOT_DISPOSED'
    ||doubleBuffer.state!=='DOUBLE_BUFFER_COMPARISON_READY_NOT_DISPOSED'
  ){
    return blocked(['ADAPTIVE_RESIDENCY_DISPOSITION_READY_INPUTS_REQUIRED']);
  }

  let planSha:string;
  let movementSha:string;
  let predictiveSha:string;
  let doubleSha:string;
  try{
    [planSha,movementSha,predictiveSha,doubleSha]=await Promise.all([
      hsmeAdaptiveResidencyExperimentPlanV1Digest(plan,hash),
      hsmeAdaptiveResidencyMovementReceiptV1Digest(movement,hash),
      hsmePredictivePrefetchComparisonV1Digest(predictive,hash),
      hsmeDoubleBufferComparisonV1Digest(doubleBuffer,hash),
    ]);
  }catch{
    return invalid(['ADAPTIVE_RESIDENCY_DISPOSITION_INPUT_REHASH_INVALID']);
  }
  const common={
    residencyPlanSha256:planSha,
    movementReceiptSha256:movementSha,
    predictiveComparisonSha256:predictiveSha,
    doubleBufferComparisonSha256:doubleSha,
    prototypeSha256:movement.prototypeSha256,
  };
  if(
    !exactDigest(expectedPlanSha256,planSha,plan.planEvidenceSha256)
    ||!exactDigest(
      expectedMovementSha256,movementSha,movement.receiptEvidenceSha256,
    )
    ||!exactDigest(
      expectedPredictiveSha256,
      predictiveSha,
      predictive.comparisonEvidenceSha256,
    )
    ||!exactDigest(
      expectedDoubleBufferSha256,
      doubleSha,
      doubleBuffer.comparisonEvidenceSha256,
    )
  ){
    return invalid(['ADAPTIVE_RESIDENCY_DISPOSITION_INPUT_REHASH_MISMATCH'],common);
  }

  const origins=await Promise.all([
    verify(()=>inputOrigin.verifyResidencyPlan(plan,planSha)),
    verify(()=>inputOrigin.verifyMovementReceipt(movement,movementSha)),
    verify(()=>inputOrigin.verifyPredictiveComparison(predictive,predictiveSha)),
    verify(()=>inputOrigin.verifyDoubleBufferComparison(doubleBuffer,doubleSha)),
  ]);
  if(origins.some(value=>!value)){
    return invalid(['ADAPTIVE_RESIDENCY_DISPOSITION_INPUT_ORIGIN_UNVERIFIED'],common);
  }

  if(
    movement.residencyPlanSha256!==planSha
    ||predictive.residencyPlanSha256!==planSha
    ||doubleBuffer.residencyPlanSha256!==planSha
    ||predictive.controlMovementReceiptSha256!==movementSha
    ||movement.prototypeSha256!==plan.prototypeSha256
  ){
    return invalid(['ADAPTIVE_RESIDENCY_DISPOSITION_INPUT_BINDING_MISMATCH'],common);
  }
  if(doubleBuffer.rows.length!==2){
    return invalid(['ADAPTIVE_RESIDENCY_DISPOSITION_DOUBLE_BUFFER_ROWS_INVALID'],common);
  }
  const serialized=doubleBuffer.rows.find(
    row=>row.mode==='SERIALIZED_CONTROL',
  );
  const buffered=doubleBuffer.rows.find(row=>row.mode==='DOUBLE_BUFFERED');
  if(serialized===undefined||buffered===undefined){
    return invalid(['ADAPTIVE_RESIDENCY_DISPOSITION_DOUBLE_BUFFER_ROWS_INVALID'],common);
  }
  if(
    serialized.prototypeSha256!==movement.prototypeSha256
    ||buffered.prototypeSha256!==movement.prototypeSha256
    ||serialized.qualityEvidenceSha256!==buffered.qualityEvidenceSha256
  ){
    return invalid(['ADAPTIVE_RESIDENCY_DISPOSITION_QUALITY_BINDING_INVALID'],common);
  }

  let quality:HsmeResidencyQualityPreservationAttestationV1;
  let qualitySha:string;
  try{
    quality=normalizeHsmeResidencyQualityPreservationAttestationV1(
      rawQualityAttestation,
    );
    qualitySha=await hsmeResidencyQualityPreservationAttestationV1Digest(
      quality,hash,
    );
  }catch{
    return invalid(['ADAPTIVE_RESIDENCY_DISPOSITION_QUALITY_ATTESTATION_INVALID'],common);
  }
  if(
    !exactDigest(expectedQualityAttestationSha256,qualitySha,qualitySha)
    ||quality.prototypeSha256!==movement.prototypeSha256
    ||quality.qualityEvidenceSha256!==serialized.qualityEvidenceSha256
  ){
    return invalid(['ADAPTIVE_RESIDENCY_DISPOSITION_QUALITY_BINDING_INVALID'],{
      ...common,qualityAttestationSha256:qualitySha,
    });
  }
  if(!await verify(
    ()=>qualityOrigin.verifyQualityPreservation(quality,qualitySha),
  )){
    return invalid(['ADAPTIVE_RESIDENCY_DISPOSITION_QUALITY_ORIGIN_UNVERIFIED'],{
      ...common,qualityAttestationSha256:qualitySha,
    });
  }

  let policy:HsmeAdaptiveResidencyDispositionPolicyV1;
  let policySha:string;
  try{
    policy=normalizeHsmeAdaptiveResidencyDispositionPolicyV1(rawPolicy);
    policySha=await hsmeAdaptiveResidencyDispositionPolicyV1Digest(policy,hash);
  }catch{
    return invalid(['ADAPTIVE_RESIDENCY_DISPOSITION_POLICY_INVALID'],{
      ...common,qualityAttestationSha256:qualitySha,
    });
  }
  if(
    !exactDigest(expectedPolicySha256,policySha,policySha)
    ||policy.residencyPlanSha256!==planSha
    ||policy.movementReceiptSha256!==movementSha
    ||policy.predictiveComparisonSha256!==predictiveSha
    ||policy.doubleBufferComparisonSha256!==doubleSha
  ){
    return invalid(['ADAPTIVE_RESIDENCY_DISPOSITION_POLICY_BINDING_INVALID'],{
      ...common,qualityAttestationSha256:qualitySha,
      dispositionPolicySha256:policySha,
    });
  }
  if(!await verify(()=>policyOrigin.verifyDispositionPolicy(policy,policySha))){
    return invalid(['ADAPTIVE_RESIDENCY_DISPOSITION_POLICY_ORIGIN_UNVERIFIED'],{
      ...common,qualityAttestationSha256:qualitySha,
      dispositionPolicySha256:policySha,
    });
  }

  const predictiveFlashBps=lowerIsBetterImprovementBps(
    numeric(movement.totalFlashReadBytes),
    numeric(predictive.predictiveFlashReadBytes),
  );
  const predictiveStallBps=lowerIsBetterImprovementBps(
    numeric(movement.totalComputeStallMsWaitingForWeights),
    numeric(predictive.predictiveComputeStallMs),
  );
  const doubleLatencyBps=lowerIsBetterImprovementBps(
    serialized.endToEndLatencyMs,
    buffered.endToEndLatencyMs,
  );
  const doubleStallBps=lowerIsBetterImprovementBps(
    serialized.computeStallMsWaitingForWeights,
    buffered.computeStallMsWaitingForWeights,
  );

  const qualityPass=quality.preservationState==='PASS';
  const mechanismDispositions:HsmeAdaptiveResidencyMechanismDispositionV1[]=[];

  const predictiveReasons:string[]=[];
  const predictiveMaterial=
    predictiveFlashBps>=policy.minPredictiveFlashReadImprovementBps
    ||predictiveStallBps>=policy.minPredictiveStallImprovementBps;
  if(!predictiveMaterial){
    predictiveReasons.push('NO_MATERIAL_FLASH_OR_STALL_IMPROVEMENT');
  }
  const predictiveResource=
    predictiveFlashBps>=-policy.maxPredictiveFlashReadRegressionBps
    &&predictiveStallBps>=-policy.maxPredictiveStallRegressionBps
    &&typeof plan.maxRamBudgetBytes==='number'
    &&typeof plan.maxAcceleratorBudgetBytes==='number'
    &&numeric(predictive.peakRamResidentBytes)<=plan.maxRamBudgetBytes
    &&numeric(predictive.peakAcceleratorResidentBytes)<=
      plan.maxAcceleratorBudgetBytes;
  if(!predictiveResource){
    predictiveReasons.push('PREDICTIVE_RESOURCE_REGRESSION_OR_BUDGET_FAILURE');
  }
  if(!qualityPass) predictiveReasons.push('QUALITY_PRESERVATION_FAILED');
  mechanismDispositions.push(deepFreeze({
    mechanism:'PREDICTIVE_PREFETCH',
    qualityGate:qualityPass?'PASS':'FAIL',
    materialBenefit:predictiveMaterial,
    resourceGate:predictiveResource?'PASS':'FAIL',
    advance:qualityPass&&predictiveMaterial&&predictiveResource,
    reasons:Object.freeze(predictiveReasons),
  }));

  const bufferReasons:string[]=[];
  const bufferMaterial=
    doubleLatencyBps>=policy.minDoubleBufferLatencyImprovementBps;
  if(!bufferMaterial) bufferReasons.push('NO_MATERIAL_END_TO_END_IMPROVEMENT');
  const bufferResource=
    doubleStallBps>=-policy.maxDoubleBufferStallRegressionBps
    &&buffered.bufferBytes<=policy.maxBufferBytes
    &&typeof plan.maxRamBudgetBytes==='number'
    &&typeof plan.maxAcceleratorBudgetBytes==='number'
    &&buffered.peakRamResidentBytes<=plan.maxRamBudgetBytes
    &&buffered.peakAcceleratorResidentBytes<=plan.maxAcceleratorBudgetBytes;
  if(!bufferResource){
    bufferReasons.push('DOUBLE_BUFFER_RESOURCE_REGRESSION_OR_BUDGET_FAILURE');
  }
  if(!qualityPass) bufferReasons.push('QUALITY_PRESERVATION_FAILED');
  mechanismDispositions.push(deepFreeze({
    mechanism:'DOUBLE_BUFFERING',
    qualityGate:qualityPass?'PASS':'FAIL',
    materialBenefit:bufferMaterial,
    resourceGate:bufferResource?'PASS':'FAIL',
    advance:qualityPass&&bufferMaterial&&bufferResource,
    reasons:Object.freeze(bufferReasons),
  }));

  const advancedMechanisms=mechanismDispositions
    .filter(value=>value.advance)
    .map(value=>value.mechanism);
  const disposition=qualityPass
    ?(advancedMechanisms.length>0?'ADVANCE' as const:'REDESIGN' as const)
    :'REJECT' as const;

  const payload={
    schemaVersion:HSME_ADAPTIVE_RESIDENCY_DISPOSITION_V1_SCHEMA,
    state:'ADAPTIVE_RESIDENCY_DISPOSITION_READY' as const,
    blockers:Object.freeze([] as string[]),
    disposition,
    ...common,
    qualityAttestationSha256:qualitySha,
    dispositionPolicySha256:policySha,
    qualityEvidenceSha256:quality.qualityEvidenceSha256,
    predictiveFlashReadImprovementBps:predictiveFlashBps,
    predictiveStallImprovementBps:predictiveStallBps,
    doubleBufferLatencyImprovementBps:doubleLatencyBps,
    doubleBufferStallImprovementBps:doubleStallBps,
    mechanismDispositions:Object.freeze(mechanismDispositions),
    advancedMechanisms:Object.freeze(advancedMechanisms),
    ...authorityBoundary(),
  };
  const dispositionEvidenceSha256=await digest(
    HSME_ADAPTIVE_RESIDENCY_DISPOSITION_DIGEST_DOMAIN,
    payload,hash,
  );
  return deepFreeze({...payload,dispositionEvidenceSha256});
}

export async function hsmeAdaptiveResidencyDispositionV1Digest(
  value:HsmeAdaptiveResidencyDispositionV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  if(
    value.state!=='ADAPTIVE_RESIDENCY_DISPOSITION_READY'
    ||value.dispositionEvidenceSha256==='UNKNOWN'
  ){
    fail('hsme_residency_disposition_digest_state','only READY disposition is digestible');
  }
  const {dispositionEvidenceSha256:_ignored,...payload}=value;
  return digest(HSME_ADAPTIVE_RESIDENCY_DISPOSITION_DIGEST_DOMAIN,payload,hash);
}

type PartialOutput=Partial<Pick<
  HsmeAdaptiveResidencyDispositionV1,
  'residencyPlanSha256'|'movementReceiptSha256'
  |'predictiveComparisonSha256'|'doubleBufferComparisonSha256'
  |'qualityAttestationSha256'|'dispositionPolicySha256'|'prototypeSha256'
>>;
function invalid(blockers:readonly string[],values:PartialOutput={}){
  return terminal('ADAPTIVE_RESIDENCY_DISPOSITION_INVALID',blockers,values);
}
function blocked(blockers:readonly string[],values:PartialOutput={}){
  return terminal('ADAPTIVE_RESIDENCY_DISPOSITION_BLOCKED',blockers,values);
}
function terminal(
  state:'ADAPTIVE_RESIDENCY_DISPOSITION_INVALID'|'ADAPTIVE_RESIDENCY_DISPOSITION_BLOCKED',
  blockers:readonly string[],values:PartialOutput,
):HsmeAdaptiveResidencyDispositionV1{
  return deepFreeze({
    schemaVersion:HSME_ADAPTIVE_RESIDENCY_DISPOSITION_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort()),
    disposition:'NONE',
    residencyPlanSha256:values.residencyPlanSha256??'UNKNOWN',
    movementReceiptSha256:values.movementReceiptSha256??'UNKNOWN',
    predictiveComparisonSha256:values.predictiveComparisonSha256??'UNKNOWN',
    doubleBufferComparisonSha256:values.doubleBufferComparisonSha256??'UNKNOWN',
    qualityAttestationSha256:values.qualityAttestationSha256??'UNKNOWN',
    dispositionPolicySha256:values.dispositionPolicySha256??'UNKNOWN',
    prototypeSha256:values.prototypeSha256??'UNKNOWN',
    qualityEvidenceSha256:'UNKNOWN',
    predictiveFlashReadImprovementBps:'UNKNOWN',
    predictiveStallImprovementBps:'UNKNOWN',
    doubleBufferLatencyImprovementBps:'UNKNOWN',
    doubleBufferStallImprovementBps:'UNKNOWN',
    mechanismDispositions:Object.freeze([]),
    advancedMechanisms:Object.freeze([]),
    dispositionEvidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}
function authorityBoundary(){
  return Object.freeze({
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
function assertNoAuthority(r:Record<string,unknown>,path:string):void{
  for(const key of Object.keys(authorityBoundary())){
    if(r[key]!==false){
      fail('hsme_residency_disposition_authority',path+'.'+key+' authority widening');
    }
  }
}
function exactDigest(expected:string,actual:string,embedded:string|'UNKNOWN'):boolean{
  return HEX64.test(expected)&&expected===actual&&embedded===actual;
}
function numeric(value:number|'UNKNOWN'):number{
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0){
    fail('hsme_residency_disposition_numeric','required measured value missing');
  }
  return value;
}
function lowerIsBetterImprovementBps(control:number,candidate:number):number{
  if(
    !Number.isSafeInteger(control)||control<0
    ||!Number.isSafeInteger(candidate)||candidate<0
  ){
    fail('hsme_residency_disposition_numeric','invalid comparison metric');
  }
  if(control===0) return candidate===0?0:-10000;
  return Math.trunc(((control-candidate)/control)*10000);
}
function bps(raw:unknown,path:string):number{
  return safeInteger(raw,path,0,10000);
}
function exactRecord(raw:unknown,fields:readonly string[],path:string):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail('hsme_residency_disposition_schema',path+' must be object');
  }
  const r=raw as Record<string,unknown>,keys=Object.keys(r);
  if(keys.length!==fields.length||keys.some(k=>!fields.includes(k))||fields.some(k=>!Object.hasOwn(r,k))){
    fail('hsme_residency_disposition_schema',path+' unknown or missing fields');
  }
  return r;
}
function sha256(raw:unknown,path:string):string{
  if(typeof raw!=='string'||!HEX64.test(raw)){
    fail('hsme_residency_disposition_value',path+' invalid SHA-256');
  }
  return raw;
}
function safeInteger(raw:unknown,path:string,min:number,max:number):number{
  if(!Number.isSafeInteger(raw)||(raw as number)<min||(raw as number)>max){
    fail('hsme_residency_disposition_value',path+' invalid integer');
  }
  return raw as number;
}
async function digest(domain:string,value:unknown,hash:HsmeDenseBaselineHashPortV1):Promise<string>{
  const d=await hash.sha256(new TextEncoder().encode(domain+JSON.stringify(value)));
  if(!HEX64.test(d)) fail('hsme_residency_disposition_hash','hash port invalid');
  return d;
}
async function verify(run:()=>Promise<boolean>):Promise<boolean>{
  try{return await run()===true;}catch{return false;}
}
function deepFreeze<T>(value:T):T{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const child of Object.values(value as Record<string,unknown>)) deepFreeze(child);
  }
  return value;
}
function fail(code:string,message:string):never{
  throw new HsmeAdaptiveResidencyDispositionV1Error(code,message);
}
