import {
  HSME_HARDWARE_BACKENDS_V1,
  HSME_HARDWARE_REPRESENTATION_QUALIFICATION_ROSTER_V1_SCHEMA,
  hsmeHardwareRepresentationQualificationRosterV1Digest,
  type HsmeHardwareBackendV1,
  type HsmeHardwarePlatformFamilyV1,
  type HsmeHardwareRepresentationCandidateV1,
  type HsmeHardwareRepresentationQualificationRosterV1,
} from './HsmeHardwareRepresentationQualificationRosterV1.ts';
import type {
  HsmeDenseBaselineHashPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

export const HSME_HARDWARE_PLACEMENT_CAMPAIGN_POLICY_V1_SCHEMA =
  'BERS_HSME_HARDWARE_PLACEMENT_CAMPAIGN_POLICY_V1' as const;
export const HSME_HARDWARE_PLACEMENT_CAMPAIGN_POLICY_DIGEST_DOMAIN =
  'bers:hsme:hardware-placement-campaign-policy:v1\0' as const;
export const CORE_HSME_HARDWARE_PLACEMENT_RESULT_V1_SCHEMA =
  'BERS_CORE_HSME_HARDWARE_PLACEMENT_RESULT_V1' as const;
export const CORE_HSME_HARDWARE_PLACEMENT_RESULT_DIGEST_DOMAIN =
  'bers:core:hsme:hardware-placement-result:v1\0' as const;
export const HSME_HARDWARE_PLACEMENT_MATRIX_V1_SCHEMA =
  'BERS_HSME_HARDWARE_PLACEMENT_MATRIX_V1' as const;
export const HSME_HARDWARE_PLACEMENT_MATRIX_DIGEST_DOMAIN =
  'bers:hsme:hardware-placement-matrix:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+\-]*$/;
const VERSION=/^[A-Za-z0-9][A-Za-z0-9._+\-]*$/;

export const HSME_HARDWARE_REQUIRED_QUALITY_DIMENSIONS_V1=Object.freeze([
  'ANATOMY_ARTIFACT',
  'GARMENT_LOGO_PATTERN',
  'IDENTITY_PERSON',
  'NON_TARGET_PRESERVATION',
] as const);

export type HsmeHardwarePlacementQualityValueV1=Readonly<{
  dimension:string;
  valueBps:number;
}>;

export type HsmeHardwarePlacementHardFailureV1=Readonly<{
  dimension:string;
  failureCount:number;
}>;

export type HsmeHardwarePlacementCampaignPolicyV1=Readonly<{
  schemaVersion:typeof HSME_HARDWARE_PLACEMENT_CAMPAIGN_POLICY_V1_SCHEMA;
  hardwareRepresentationRosterSha256:string;
  fixtureSetSha256:string;
  evaluationContractSha256:string;
  deterministicSeedContractSha256:string;
  caseCount:number;
  qualityDimensions:readonly string[];
  hardPreservationDimensions:readonly string[];
  maxColdLatencyUs:number;
  maxWarmLatencyUs:number;
  maxPeakHostMemoryBytes:number;
  maxPeakAcceleratorMemoryBytes:number;
  maxFlashBytesMoved:number;
  maxRamBytesMoved:number;
  maxAcceleratorBytesMoved:number;
  maxNetworkBytesDuringExecution:0;
  sameFixtureAcrossRows:true;
  sameSeedsAcrossRows:true;
  runtimeFallbackAllowed:false;
  reviewState:'HARDWARE_PLACEMENT_CAMPAIGN_REVIEWED';
  selectionAllowed:false;
  benchmarkExecutionAllowed:false;
  representationMutationAllowed:false;
  inferenceExecutionAllowed:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  fashionGeometryAuthorityGranted:false;
  artifactAuthorityGranted:false;
  aeeExecutionAuthorityGranted:false;
  winnerSelectionAllowed:false;
}>;

export type CoreHsmeHardwarePlacementMeasurementV1=Readonly<{
  candidateId:string;
  fleetModelId:string;
  fleetVersion:string;
  representationContentSha256:string;
  runtimeIdentity:string;
  formatIdentity:string;
  platformFamily:HsmeHardwarePlatformFamilyV1;
  supportedDeviceClass:string;
  requestedPlacement:HsmeHardwareBackendV1;
  actualPlacement:HsmeHardwareBackendV1;
  runtimeFallbackUsed:boolean;
  qualityVector:readonly HsmeHardwarePlacementQualityValueV1[];
  hardPreservationFailureCounts:
    readonly HsmeHardwarePlacementHardFailureV1[];
  criticalFailureCount:number;
  coldLatencyUs:number;
  warmLatencyUs:number;
  activeRepresentationBytes:number;
  peakHostMemoryBytes:number;
  peakAcceleratorMemoryBytes:number;
  flashBytesMoved:number;
  ramBytesMoved:number;
  acceleratorBytesMoved:number;
  networkBytesDuringExecution:0;
  measurementMethodSha256:string;
  measurementEvidenceSha256:string;
  realTargetDeviceMeasurement:true;
}>;

export type CoreHsmeHardwarePlacementResultV1=Readonly<{
  schemaVersion:typeof CORE_HSME_HARDWARE_PLACEMENT_RESULT_V1_SCHEMA;
  state:
    |'HARDWARE_PLACEMENT_CAMPAIGN_COMPLETED'
    |'HARDWARE_PLACEMENT_CAMPAIGN_FAILED';
  hardwareRepresentationRosterSha256:string;
  campaignPolicySha256:string;
  executionAttemptId:string;
  fixtureSetSha256:string;
  evaluationContractSha256:string;
  deterministicSeedContractSha256:string;
  caseCount:number;
  rows:readonly CoreHsmeHardwarePlacementMeasurementV1[];
  processStarted:boolean;
  realTargetDeviceMeasurement:boolean;
  failureEvidenceSha256:string|'NONE';
  selectionAllowed:false;
  benchmarkExecutionAllowed:false;
  representationMutationAllowed:false;
  inferenceExecutionAllowed:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  fashionGeometryAuthorityGranted:false;
  artifactAuthorityGranted:false;
  aeeExecutionAuthorityGranted:false;
  winnerSelectionAllowed:false;
  hostResultSha256:string;
}>;

export type CoreHsmeHardwarePlacementRequestV1=Readonly<{
  roster:HsmeHardwareRepresentationQualificationRosterV1;
  hardwareRepresentationRosterSha256:string;
  policy:HsmeHardwarePlacementCampaignPolicyV1;
  campaignPolicySha256:string;
}>;

export interface CoreHsmeHardwarePlacementPortV1{
  executeExactHardwarePlacementCampaign(
    request:CoreHsmeHardwarePlacementRequestV1,
  ):Promise<unknown>;
}

export interface HsmeHardwarePlacementRosterOriginVerifierV1{
  verifyHardwareRepresentationRoster(
    roster:HsmeHardwareRepresentationQualificationRosterV1,
    expectedRosterSha256:string,
  ):Promise<boolean>;
}

export interface HsmeHardwarePlacementPolicyOriginVerifierV1{
  verifyHardwarePlacementCampaignPolicy(
    policy:HsmeHardwarePlacementCampaignPolicyV1,
    expectedPolicySha256:string,
  ):Promise<boolean>;
}

export interface CoreHsmeHardwarePlacementResultOriginVerifierV1{
  verifyHardwarePlacementResult(
    result:CoreHsmeHardwarePlacementResultV1,
    expectedHostResultSha256:string,
  ):Promise<boolean>;
}

export type HsmeHardwarePlacementMatrixV1=Readonly<{
  schemaVersion:typeof HSME_HARDWARE_PLACEMENT_MATRIX_V1_SCHEMA;
  state:
    |'HARDWARE_PLACEMENT_MATRIX_INVALID'
    |'HARDWARE_PLACEMENT_MATRIX_BLOCKED'
    |'HARDWARE_PLACEMENT_MATRIX_FAILED'
    |'HARDWARE_PLACEMENT_MATRIX_READY_NOT_DISPOSED';
  blockers:readonly string[];
  hardwareRepresentationRosterSha256:string|'UNKNOWN';
  campaignPolicySha256:string|'UNKNOWN';
  hostResultSha256:string|'UNKNOWN';
  executionAttemptId:string|'UNKNOWN';
  fixtureSetSha256:string|'UNKNOWN';
  evaluationContractSha256:string|'UNKNOWN';
  deterministicSeedContractSha256:string|'UNKNOWN';
  caseCount:number|'UNKNOWN';
  qualityDimensions:readonly string[];
  hardPreservationDimensions:readonly string[];
  rows:readonly CoreHsmeHardwarePlacementMeasurementV1[];
  matrixEvidenceSha256:string|'UNKNOWN';
  selectionAllowed:false;
  benchmarkExecutionAllowed:false;
  representationMutationAllowed:false;
  inferenceExecutionAllowed:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  fashionGeometryAuthorityGranted:false;
  artifactAuthorityGranted:false;
  aeeExecutionAuthorityGranted:false;
  winnerSelectionAllowed:false;
}>;

export class HsmeHardwarePlacementMatrixV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeHardwarePlacementMatrixV1Error';
    this.code=code;
  }
}

export function normalizeHsmeHardwarePlacementCampaignPolicyV1(
  raw:unknown,
):HsmeHardwarePlacementCampaignPolicyV1{
  const r=exactRecord(raw,[
    'schemaVersion',
    'hardwareRepresentationRosterSha256',
    'fixtureSetSha256',
    'evaluationContractSha256',
    'deterministicSeedContractSha256',
    'caseCount',
    'qualityDimensions',
    'hardPreservationDimensions',
    'maxColdLatencyUs',
    'maxWarmLatencyUs',
    'maxPeakHostMemoryBytes',
    'maxPeakAcceleratorMemoryBytes',
    'maxFlashBytesMoved',
    'maxRamBytesMoved',
    'maxAcceleratorBytesMoved',
    'maxNetworkBytesDuringExecution',
    'sameFixtureAcrossRows',
    'sameSeedsAcrossRows',
    'runtimeFallbackAllowed',
    'reviewState',
    'selectionAllowed',
    'benchmarkExecutionAllowed',
    'representationMutationAllowed',
    'inferenceExecutionAllowed',
    'modelInstallAllowed',
    'modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed',
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'fashionGeometryAuthorityGranted',
    'artifactAuthorityGranted',
    'aeeExecutionAuthorityGranted',
    'winnerSelectionAllowed',
  ],'policy');

  if(r.schemaVersion!==HSME_HARDWARE_PLACEMENT_CAMPAIGN_POLICY_V1_SCHEMA){
    fail(
      'hsme_hardware_placement_policy_schema',
      'hardware placement campaign policy schema unsupported',
    );
  }
  if(r.reviewState!=='HARDWARE_PLACEMENT_CAMPAIGN_REVIEWED'){
    fail(
      'hsme_hardware_placement_policy_review',
      'hardware placement campaign policy review state invalid',
    );
  }
  if(
    r.maxNetworkBytesDuringExecution!==0
    ||r.sameFixtureAcrossRows!==true
    ||r.sameSeedsAcrossRows!==true
    ||r.runtimeFallbackAllowed!==false
  ){
    fail(
      'hsme_hardware_placement_policy_boundary',
      'hardware placement comparison boundary invalid',
    );
  }
  assertNoAuthority(r,'policy');

  const qualityDimensions=identifierSet(
    r.qualityDimensions,
    'policy.qualityDimensions',
    4,
    32,
    100,
  );
  const hardPreservationDimensions=identifierSet(
    r.hardPreservationDimensions,
    'policy.hardPreservationDimensions',
    4,
    32,
    100,
  );
  for(const required of HSME_HARDWARE_REQUIRED_QUALITY_DIMENSIONS_V1){
    if(
      !qualityDimensions.includes(required)
      ||!hardPreservationDimensions.includes(required)
    ){
      fail(
        'hsme_hardware_placement_policy_dimensions',
        'required quality/hard-preservation dimension missing: '+required,
      );
    }
  }
  if(
    hardPreservationDimensions.some(
      dimension=>!qualityDimensions.includes(dimension),
    )
  ){
    fail(
      'hsme_hardware_placement_policy_dimensions',
      'hard preservation dimensions must be quality dimensions',
    );
  }

  return deepFreeze({
    schemaVersion:HSME_HARDWARE_PLACEMENT_CAMPAIGN_POLICY_V1_SCHEMA,
    hardwareRepresentationRosterSha256:sha256(
      r.hardwareRepresentationRosterSha256,
      'policy.hardwareRepresentationRosterSha256',
    ),
    fixtureSetSha256:sha256(
      r.fixtureSetSha256,
      'policy.fixtureSetSha256',
    ),
    evaluationContractSha256:sha256(
      r.evaluationContractSha256,
      'policy.evaluationContractSha256',
    ),
    deterministicSeedContractSha256:sha256(
      r.deterministicSeedContractSha256,
      'policy.deterministicSeedContractSha256',
    ),
    caseCount:safeInteger(
      r.caseCount,
      'policy.caseCount',
      1,
      1_000_000,
    ),
    qualityDimensions:Object.freeze(qualityDimensions),
    hardPreservationDimensions:Object.freeze(
      hardPreservationDimensions,
    ),
    maxColdLatencyUs:safeInteger(
      r.maxColdLatencyUs,
      'policy.maxColdLatencyUs',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    maxWarmLatencyUs:safeInteger(
      r.maxWarmLatencyUs,
      'policy.maxWarmLatencyUs',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    maxPeakHostMemoryBytes:safeInteger(
      r.maxPeakHostMemoryBytes,
      'policy.maxPeakHostMemoryBytes',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    maxPeakAcceleratorMemoryBytes:safeInteger(
      r.maxPeakAcceleratorMemoryBytes,
      'policy.maxPeakAcceleratorMemoryBytes',
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    maxFlashBytesMoved:safeInteger(
      r.maxFlashBytesMoved,
      'policy.maxFlashBytesMoved',
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    maxRamBytesMoved:safeInteger(
      r.maxRamBytesMoved,
      'policy.maxRamBytesMoved',
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    maxAcceleratorBytesMoved:safeInteger(
      r.maxAcceleratorBytesMoved,
      'policy.maxAcceleratorBytesMoved',
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    maxNetworkBytesDuringExecution:0,
    sameFixtureAcrossRows:true,
    sameSeedsAcrossRows:true,
    runtimeFallbackAllowed:false,
    reviewState:'HARDWARE_PLACEMENT_CAMPAIGN_REVIEWED',
    ...authorityBoundary(),
  });
}

export async function hsmeHardwarePlacementCampaignPolicyV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  return digest(
    HSME_HARDWARE_PLACEMENT_CAMPAIGN_POLICY_DIGEST_DOMAIN,
    normalizeHsmeHardwarePlacementCampaignPolicyV1(raw),
    hash,
  );
}

export function normalizeCoreHsmeHardwarePlacementResultV1(
  raw:unknown,
):CoreHsmeHardwarePlacementResultV1{
  const r=exactRecord(raw,[
    'schemaVersion',
    'state',
    'hardwareRepresentationRosterSha256',
    'campaignPolicySha256',
    'executionAttemptId',
    'fixtureSetSha256',
    'evaluationContractSha256',
    'deterministicSeedContractSha256',
    'caseCount',
    'rows',
    'processStarted',
    'realTargetDeviceMeasurement',
    'failureEvidenceSha256',
    'selectionAllowed',
    'benchmarkExecutionAllowed',
    'representationMutationAllowed',
    'inferenceExecutionAllowed',
    'modelInstallAllowed',
    'modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed',
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'fashionGeometryAuthorityGranted',
    'artifactAuthorityGranted',
    'aeeExecutionAuthorityGranted',
    'winnerSelectionAllowed',
    'hostResultSha256',
  ],'result');

  if(r.schemaVersion!==CORE_HSME_HARDWARE_PLACEMENT_RESULT_V1_SCHEMA){
    fail(
      'hsme_hardware_placement_result_schema',
      'hardware placement host result schema unsupported',
    );
  }
  const state=enumValue(
    r.state,
    [
      'HARDWARE_PLACEMENT_CAMPAIGN_COMPLETED',
      'HARDWARE_PLACEMENT_CAMPAIGN_FAILED',
    ] as const,
    'result.state',
  );
  assertNoAuthority(r,'result');

  if(
    typeof r.processStarted!=='boolean'
    ||typeof r.realTargetDeviceMeasurement!=='boolean'
    ||!Array.isArray(r.rows)
  ){
    fail(
      'hsme_hardware_placement_result_shape',
      'host execution flags/rows invalid',
    );
  }

  const rows=r.rows.map((value,index)=>
    normalizeMeasurement(
      value,
      'result.rows['+index+']',
    )
  );
  const failureEvidenceSha256=r.failureEvidenceSha256==='NONE'
    ?'NONE' as const
    :sha256(
      r.failureEvidenceSha256,
      'result.failureEvidenceSha256',
    );

  if(
    (
      state==='HARDWARE_PLACEMENT_CAMPAIGN_COMPLETED'
      &&(
        r.processStarted!==true
        ||r.realTargetDeviceMeasurement!==true
        ||rows.length<2
        ||rows.length>48
        ||failureEvidenceSha256!=='NONE'
      )
    )
    ||(
      state==='HARDWARE_PLACEMENT_CAMPAIGN_FAILED'
      &&(
        rows.length!==0
        ||r.realTargetDeviceMeasurement!==false
        ||failureEvidenceSha256==='NONE'
      )
    )
  ){
    fail(
      'hsme_hardware_placement_result_state',
      'host result state shape invalid',
    );
  }

  return deepFreeze({
    schemaVersion:CORE_HSME_HARDWARE_PLACEMENT_RESULT_V1_SCHEMA,
    state,
    hardwareRepresentationRosterSha256:sha256(
      r.hardwareRepresentationRosterSha256,
      'result.hardwareRepresentationRosterSha256',
    ),
    campaignPolicySha256:sha256(
      r.campaignPolicySha256,
      'result.campaignPolicySha256',
    ),
    executionAttemptId:identifier(
      r.executionAttemptId,
      'result.executionAttemptId',
      160,
    ),
    fixtureSetSha256:sha256(
      r.fixtureSetSha256,
      'result.fixtureSetSha256',
    ),
    evaluationContractSha256:sha256(
      r.evaluationContractSha256,
      'result.evaluationContractSha256',
    ),
    deterministicSeedContractSha256:sha256(
      r.deterministicSeedContractSha256,
      'result.deterministicSeedContractSha256',
    ),
    caseCount:safeInteger(
      r.caseCount,
      'result.caseCount',
      1,
      1_000_000,
    ),
    rows:Object.freeze(rows),
    processStarted:r.processStarted,
    realTargetDeviceMeasurement:r.realTargetDeviceMeasurement,
    failureEvidenceSha256,
    ...authorityBoundary(),
    hostResultSha256:sha256(
      r.hostResultSha256,
      'result.hostResultSha256',
    ),
  });
}

export async function coreHsmeHardwarePlacementResultV1Digest(
  raw:CoreHsmeHardwarePlacementResultV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  const result=normalizeCoreHsmeHardwarePlacementResultV1(raw);
  const {hostResultSha256:_ignored,...payload}=result;
  return digest(
    CORE_HSME_HARDWARE_PLACEMENT_RESULT_DIGEST_DOMAIN,
    payload,
    hash,
  );
}

export async function collectHsmeHardwarePlacementMatrixV1(
  roster:HsmeHardwareRepresentationQualificationRosterV1,
  expectedRosterSha256:string,
  rosterOrigin:HsmeHardwarePlacementRosterOriginVerifierV1,
  rawPolicy:unknown,
  expectedPolicySha256:string,
  policyOrigin:HsmeHardwarePlacementPolicyOriginVerifierV1,
  host:CoreHsmeHardwarePlacementPortV1,
  resultOrigin:CoreHsmeHardwarePlacementResultOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeHardwarePlacementMatrixV1>{
  if(!readyRoster(roster)){
    return blocked([
      'HARDWARE_PLACEMENT_FROZEN_ROSTER_REQUIRED',
    ]);
  }

  let rosterSha256:string;
  try{
    rosterSha256=
      await hsmeHardwareRepresentationQualificationRosterV1Digest(
        roster,
        hash,
      );
  }catch{
    return invalid([
      'HARDWARE_PLACEMENT_ROSTER_REHASH_INVALID',
    ]);
  }
  const common={
    hardwareRepresentationRosterSha256:rosterSha256,
  };

  if(
    !exactDigest(
      expectedRosterSha256,
      rosterSha256,
      roster.rosterEvidenceSha256 as string,
    )
  ){
    return invalid(
      ['HARDWARE_PLACEMENT_ROSTER_REHASH_MISMATCH'],
      common,
    );
  }
  if(!await verify(
    ()=>rosterOrigin.verifyHardwareRepresentationRoster(
      roster,
      rosterSha256,
    ),
  )){
    return invalid(
      ['HARDWARE_PLACEMENT_ROSTER_ORIGIN_UNVERIFIED'],
      common,
    );
  }

  let policy:HsmeHardwarePlacementCampaignPolicyV1;
  let policySha256:string;
  try{
    policy=normalizeHsmeHardwarePlacementCampaignPolicyV1(rawPolicy);
    policySha256=await hsmeHardwarePlacementCampaignPolicyV1Digest(
      policy,
      hash,
    );
  }catch{
    return invalid(
      ['HARDWARE_PLACEMENT_CAMPAIGN_POLICY_INVALID'],
      common,
    );
  }
  const bound={
    ...common,
    campaignPolicySha256:policySha256,
  };

  if(
    !exactDigest(
      expectedPolicySha256,
      policySha256,
      policySha256,
    )
  ){
    return invalid(
      ['HARDWARE_PLACEMENT_CAMPAIGN_POLICY_DIGEST_MISMATCH'],
      bound,
    );
  }
  if(!await verify(
    ()=>policyOrigin.verifyHardwarePlacementCampaignPolicy(
      policy,
      policySha256,
    ),
  )){
    return invalid(
      ['HARDWARE_PLACEMENT_CAMPAIGN_POLICY_ORIGIN_UNVERIFIED'],
      bound,
    );
  }
  if(
    policy.hardwareRepresentationRosterSha256!==rosterSha256
  ){
    return invalid(
      ['HARDWARE_PLACEMENT_CAMPAIGN_POLICY_BINDING_MISMATCH'],
      bound,
    );
  }

  let rawResult:unknown;
  try{
    rawResult=await host.executeExactHardwarePlacementCampaign(
      deepFreeze({
        roster,
        hardwareRepresentationRosterSha256:rosterSha256,
        policy,
        campaignPolicySha256:policySha256,
      }),
    );
  }catch{
    return failed(
      ['HARDWARE_PLACEMENT_HOST_EXECUTION_FAILED'],
      resolvedValues(
        rosterSha256,
        policy,
        policySha256,
      ),
    );
  }

  let result:CoreHsmeHardwarePlacementResultV1;
  let hostResultSha256:string;
  try{
    result=normalizeCoreHsmeHardwarePlacementResultV1(rawResult);
    hostResultSha256=await coreHsmeHardwarePlacementResultV1Digest(
      result,
      hash,
    );
  }catch{
    return invalid(
      ['HARDWARE_PLACEMENT_HOST_RESULT_INVALID'],
      resolvedValues(
        rosterSha256,
        policy,
        policySha256,
      ),
    );
  }

  const values={
    ...resolvedValues(
      rosterSha256,
      policy,
      policySha256,
    ),
    hostResultSha256,
    executionAttemptId:result.executionAttemptId,
  };

  if(hostResultSha256!==result.hostResultSha256){
    return invalid(
      ['HARDWARE_PLACEMENT_HOST_RESULT_REHASH_MISMATCH'],
      values,
    );
  }
  if(!await verify(
    ()=>resultOrigin.verifyHardwarePlacementResult(
      result,
      hostResultSha256,
    ),
  )){
    return invalid(
      ['HARDWARE_PLACEMENT_HOST_RESULT_ORIGIN_UNVERIFIED'],
      values,
    );
  }
  if(
    result.hardwareRepresentationRosterSha256!==rosterSha256
    ||result.campaignPolicySha256!==policySha256
    ||result.fixtureSetSha256!==policy.fixtureSetSha256
    ||result.evaluationContractSha256!==policy.evaluationContractSha256
    ||result.deterministicSeedContractSha256!==
      policy.deterministicSeedContractSha256
    ||result.caseCount!==policy.caseCount
  ){
    return invalid(
      ['HARDWARE_PLACEMENT_HOST_RESULT_BINDING_MISMATCH'],
      values,
    );
  }
  if(result.state==='HARDWARE_PLACEMENT_CAMPAIGN_FAILED'){
    return failed(
      ['HARDWARE_PLACEMENT_PROTECTED_CAMPAIGN_FAILED'],
      values,
    );
  }

  const rows=[...result.rows].sort(
    (a,b)=>compareRows(a,b,roster),
  );
  const expectedKeys=expectedRowKeys(roster);
  const actualKeys=rows.map(row=>rowKey(
    row.candidateId,
    row.requestedPlacement,
  ));
  if(
    actualKeys.length!==expectedKeys.length
    ||new Set(actualKeys).size!==actualKeys.length
    ||actualKeys.some(
      (value,index)=>value!==expectedKeys[index],
    )
  ){
    return invalid(
      ['HARDWARE_PLACEMENT_ROW_SET_INVALID'],
      values,
    );
  }

  for(const row of rows){
    const candidate=roster.candidates.find(
      value=>value.candidateId===row.candidateId,
    );
    if(candidate===undefined){
      return invalid(
        ['HARDWARE_PLACEMENT_CANDIDATE_MISSING'],
        values,
      );
    }
    const reason=validateMeasurement(
      row,
      candidate,
      policy,
    );
    if(reason!==null){
      return invalid([reason],values);
    }
  }

  const payload={
    schemaVersion:HSME_HARDWARE_PLACEMENT_MATRIX_V1_SCHEMA,
    state:'HARDWARE_PLACEMENT_MATRIX_READY_NOT_DISPOSED' as const,
    blockers:Object.freeze([] as string[]),
    hardwareRepresentationRosterSha256:rosterSha256,
    campaignPolicySha256:policySha256,
    hostResultSha256,
    executionAttemptId:result.executionAttemptId,
    fixtureSetSha256:policy.fixtureSetSha256,
    evaluationContractSha256:policy.evaluationContractSha256,
    deterministicSeedContractSha256:
      policy.deterministicSeedContractSha256,
    caseCount:policy.caseCount,
    qualityDimensions:policy.qualityDimensions,
    hardPreservationDimensions:policy.hardPreservationDimensions,
    rows:Object.freeze(rows),
    ...authorityBoundary(),
  };
  const matrixEvidenceSha256=await digest(
    HSME_HARDWARE_PLACEMENT_MATRIX_DIGEST_DOMAIN,
    payload,
    hash,
  );
  return deepFreeze({
    ...payload,
    matrixEvidenceSha256,
  });
}

export async function hsmeHardwarePlacementMatrixV1Digest(
  value:HsmeHardwarePlacementMatrixV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  if(
    value.state!=='HARDWARE_PLACEMENT_MATRIX_READY_NOT_DISPOSED'
    ||value.matrixEvidenceSha256==='UNKNOWN'
  ){
    fail(
      'hsme_hardware_placement_matrix_digest_state',
      'only READY_NOT_DISPOSED matrix is digestible',
    );
  }
  const {matrixEvidenceSha256:_ignored,...payload}=value;
  return digest(
    HSME_HARDWARE_PLACEMENT_MATRIX_DIGEST_DOMAIN,
    payload,
    hash,
  );
}

function normalizeMeasurement(
  raw:unknown,
  path:string,
):CoreHsmeHardwarePlacementMeasurementV1{
  const r=exactRecord(raw,[
    'candidateId',
    'fleetModelId',
    'fleetVersion',
    'representationContentSha256',
    'runtimeIdentity',
    'formatIdentity',
    'platformFamily',
    'supportedDeviceClass',
    'requestedPlacement',
    'actualPlacement',
    'runtimeFallbackUsed',
    'qualityVector',
    'hardPreservationFailureCounts',
    'criticalFailureCount',
    'coldLatencyUs',
    'warmLatencyUs',
    'activeRepresentationBytes',
    'peakHostMemoryBytes',
    'peakAcceleratorMemoryBytes',
    'flashBytesMoved',
    'ramBytesMoved',
    'acceleratorBytesMoved',
    'networkBytesDuringExecution',
    'measurementMethodSha256',
    'measurementEvidenceSha256',
    'realTargetDeviceMeasurement',
  ],path);

  if(
    r.networkBytesDuringExecution!==0
    ||r.realTargetDeviceMeasurement!==true
    ||typeof r.runtimeFallbackUsed!=='boolean'
  ){
    fail(
      'hsme_hardware_placement_measurement_boundary',
      path+' fallback/network/real-device boundary invalid',
    );
  }
  if(
    !Array.isArray(r.qualityVector)
    ||!Array.isArray(r.hardPreservationFailureCounts)
  ){
    fail(
      'hsme_hardware_placement_measurement_vectors',
      path+' quality/hard-preservation vectors must be arrays',
    );
  }

  const qualityVector=r.qualityVector.map((value,index)=>
    normalizeQualityValue(
      value,
      path+'.qualityVector['+index+']',
    )
  ).sort((a,b)=>lexical(a.dimension,b.dimension));
  const hardPreservationFailureCounts=
    r.hardPreservationFailureCounts.map((value,index)=>
      normalizeHardFailure(
        value,
        path+'.hardPreservationFailureCounts['+index+']',
      )
    ).sort((a,b)=>lexical(a.dimension,b.dimension));

  if(
    new Set(
      qualityVector.map(value=>value.dimension),
    ).size!==qualityVector.length
    ||new Set(
      hardPreservationFailureCounts.map(value=>value.dimension),
    ).size!==hardPreservationFailureCounts.length
  ){
    fail(
      'hsme_hardware_placement_measurement_dimensions',
      path+' contains duplicate dimensions',
    );
  }

  return deepFreeze({
    candidateId:identifier(
      r.candidateId,
      path+'.candidateId',
      160,
    ),
    fleetModelId:identifier(
      r.fleetModelId,
      path+'.fleetModelId',
      160,
    ),
    fleetVersion:version(
      r.fleetVersion,
      path+'.fleetVersion',
      100,
    ),
    representationContentSha256:sha256(
      r.representationContentSha256,
      path+'.representationContentSha256',
    ),
    runtimeIdentity:identifier(
      r.runtimeIdentity,
      path+'.runtimeIdentity',
      160,
    ),
    formatIdentity:identifier(
      r.formatIdentity,
      path+'.formatIdentity',
      160,
    ),
    platformFamily:enumValue(
      r.platformFamily,
      ['APPLE','ANDROID'] as const,
      path+'.platformFamily',
    ),
    supportedDeviceClass:identifier(
      r.supportedDeviceClass,
      path+'.supportedDeviceClass',
      160,
    ),
    requestedPlacement:enumValue(
      r.requestedPlacement,
      HSME_HARDWARE_BACKENDS_V1,
      path+'.requestedPlacement',
    ),
    actualPlacement:enumValue(
      r.actualPlacement,
      HSME_HARDWARE_BACKENDS_V1,
      path+'.actualPlacement',
    ),
    runtimeFallbackUsed:r.runtimeFallbackUsed,
    qualityVector:Object.freeze(qualityVector),
    hardPreservationFailureCounts:
      Object.freeze(hardPreservationFailureCounts),
    criticalFailureCount:safeInteger(
      r.criticalFailureCount,
      path+'.criticalFailureCount',
      0,
      1_000_000,
    ),
    coldLatencyUs:safeInteger(
      r.coldLatencyUs,
      path+'.coldLatencyUs',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    warmLatencyUs:safeInteger(
      r.warmLatencyUs,
      path+'.warmLatencyUs',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    activeRepresentationBytes:safeInteger(
      r.activeRepresentationBytes,
      path+'.activeRepresentationBytes',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    peakHostMemoryBytes:safeInteger(
      r.peakHostMemoryBytes,
      path+'.peakHostMemoryBytes',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    peakAcceleratorMemoryBytes:safeInteger(
      r.peakAcceleratorMemoryBytes,
      path+'.peakAcceleratorMemoryBytes',
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    flashBytesMoved:safeInteger(
      r.flashBytesMoved,
      path+'.flashBytesMoved',
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    ramBytesMoved:safeInteger(
      r.ramBytesMoved,
      path+'.ramBytesMoved',
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    acceleratorBytesMoved:safeInteger(
      r.acceleratorBytesMoved,
      path+'.acceleratorBytesMoved',
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    networkBytesDuringExecution:0,
    measurementMethodSha256:sha256(
      r.measurementMethodSha256,
      path+'.measurementMethodSha256',
    ),
    measurementEvidenceSha256:sha256(
      r.measurementEvidenceSha256,
      path+'.measurementEvidenceSha256',
    ),
    realTargetDeviceMeasurement:true,
  });
}

function normalizeQualityValue(
  raw:unknown,
  path:string,
):HsmeHardwarePlacementQualityValueV1{
  const r=exactRecord(
    raw,
    ['dimension','valueBps'],
    path,
  );
  return deepFreeze({
    dimension:identifier(
      r.dimension,
      path+'.dimension',
      100,
    ),
    valueBps:safeInteger(
      r.valueBps,
      path+'.valueBps',
      0,
      10_000,
    ),
  });
}

function normalizeHardFailure(
  raw:unknown,
  path:string,
):HsmeHardwarePlacementHardFailureV1{
  const r=exactRecord(
    raw,
    ['dimension','failureCount'],
    path,
  );
  return deepFreeze({
    dimension:identifier(
      r.dimension,
      path+'.dimension',
      100,
    ),
    failureCount:safeInteger(
      r.failureCount,
      path+'.failureCount',
      0,
      1_000_000,
    ),
  });
}

function validateMeasurement(
  row:CoreHsmeHardwarePlacementMeasurementV1,
  candidate:HsmeHardwareRepresentationCandidateV1,
  policy:HsmeHardwarePlacementCampaignPolicyV1,
):string|null{
  if(
    row.fleetModelId!==candidate.fleetModelId
    ||row.fleetVersion!==candidate.fleetVersion
    ||row.representationContentSha256!==
      candidate.representationContentSha256
    ||row.runtimeIdentity!==candidate.runtimeIdentity
    ||row.formatIdentity!==candidate.formatIdentity
    ||row.platformFamily!==candidate.platformFamily
    ||row.supportedDeviceClass!==candidate.supportedDeviceClass
  ){
    return 'HARDWARE_PLACEMENT_REPRESENTATION_BINDING_MISMATCH';
  }

  if(
    !candidate.admissibleBenchmarkPlacements.includes(
      row.requestedPlacement,
    )
  ){
    return 'HARDWARE_PLACEMENT_REQUESTED_PLACEMENT_NOT_ADMISSIBLE';
  }
  if(
    row.actualPlacement!==row.requestedPlacement
    ||row.runtimeFallbackUsed
  ){
    return 'HARDWARE_PLACEMENT_RUNTIME_FALLBACK_INVALID';
  }

  if(
    !sameStringSet(
      row.qualityVector.map(value=>value.dimension),
      policy.qualityDimensions,
    )
    ||!sameStringSet(
      row.hardPreservationFailureCounts.map(
        value=>value.dimension,
      ),
      policy.hardPreservationDimensions,
    )
  ){
    return 'HARDWARE_PLACEMENT_QUALITY_DIMENSION_MISMATCH';
  }

  if(
    row.criticalFailureCount>policy.caseCount
    ||row.hardPreservationFailureCounts.some(
      value=>value.failureCount>policy.caseCount,
    )
  ){
    return 'HARDWARE_PLACEMENT_FAILURE_COUNT_EXCEEDED';
  }

  if(
    row.activeRepresentationBytes>candidate.representationBytes
  ){
    return 'HARDWARE_PLACEMENT_ACTIVE_BYTES_EXCEED_REPRESENTATION';
  }

  if(
    row.coldLatencyUs>policy.maxColdLatencyUs
    ||row.warmLatencyUs>policy.maxWarmLatencyUs
    ||row.peakHostMemoryBytes>policy.maxPeakHostMemoryBytes
    ||row.peakAcceleratorMemoryBytes>
      policy.maxPeakAcceleratorMemoryBytes
    ||row.flashBytesMoved>policy.maxFlashBytesMoved
    ||row.ramBytesMoved>policy.maxRamBytesMoved
    ||row.acceleratorBytesMoved>
      policy.maxAcceleratorBytesMoved
  ){
    return 'HARDWARE_PLACEMENT_RESOURCE_CEILING_EXCEEDED';
  }

  return null;
}

function readyRoster(
  value:HsmeHardwareRepresentationQualificationRosterV1,
):boolean{
  return value.schemaVersion===
      HSME_HARDWARE_REPRESENTATION_QUALIFICATION_ROSTER_V1_SCHEMA
    &&value.state===
      'HARDWARE_REPRESENTATION_ROSTER_FROZEN_NOT_EXECUTED'
    &&value.blockers.length===0
    &&value.rosterEvidenceSha256!=='UNKNOWN'
    &&value.candidates.length>=2
    &&value.benchmarkExecutionAllowed===false
    &&value.representationMutationAllowed===false
    &&value.modelInstallAllowed===false
    &&value.modelFleetPromotionAllowed===false
    &&value.durableModelFleetPromotionAllowed===false
    &&value.productionAuthorityGranted===false
    &&value.providerAuthorityGranted===false
    &&value.billingAuthorityGranted===false;
}

function expectedRowKeys(
  roster:HsmeHardwareRepresentationQualificationRosterV1,
):string[]{
  const keys:string[]=[];
  for(const candidate of roster.candidates){
    for(const placement of candidate.admissibleBenchmarkPlacements){
      keys.push(rowKey(candidate.candidateId,placement));
    }
  }
  return keys;
}

function compareRows(
  a:CoreHsmeHardwarePlacementMeasurementV1,
  b:CoreHsmeHardwarePlacementMeasurementV1,
  roster:HsmeHardwareRepresentationQualificationRosterV1,
):number{
  const ai=roster.candidates.findIndex(
    value=>value.candidateId===a.candidateId,
  );
  const bi=roster.candidates.findIndex(
    value=>value.candidateId===b.candidateId,
  );
  if(ai!==bi)return ai-bi;
  return HSME_HARDWARE_BACKENDS_V1.indexOf(a.requestedPlacement)
    -HSME_HARDWARE_BACKENDS_V1.indexOf(b.requestedPlacement);
}

function rowKey(
  candidateId:string,
  placement:HsmeHardwareBackendV1,
):string{
  return candidateId+'\0'+placement;
}

type OutputKeys=
  |'hardwareRepresentationRosterSha256'
  |'campaignPolicySha256'
  |'hostResultSha256'
  |'executionAttemptId'
  |'fixtureSetSha256'
  |'evaluationContractSha256'
  |'deterministicSeedContractSha256'
  |'caseCount'
  |'qualityDimensions'
  |'hardPreservationDimensions';

type PartialOutput=Partial<Pick<
  HsmeHardwarePlacementMatrixV1,
  OutputKeys
>>;

function resolvedValues(
  rosterSha256:string,
  policy:HsmeHardwarePlacementCampaignPolicyV1,
  policySha256:string,
):PartialOutput{
  return {
    hardwareRepresentationRosterSha256:rosterSha256,
    campaignPolicySha256:policySha256,
    fixtureSetSha256:policy.fixtureSetSha256,
    evaluationContractSha256:policy.evaluationContractSha256,
    deterministicSeedContractSha256:
      policy.deterministicSeedContractSha256,
    caseCount:policy.caseCount,
    qualityDimensions:policy.qualityDimensions,
    hardPreservationDimensions:policy.hardPreservationDimensions,
  };
}

function blocked(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeHardwarePlacementMatrixV1{
  return terminal(
    'HARDWARE_PLACEMENT_MATRIX_BLOCKED',
    blockers,
    values,
  );
}

function invalid(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeHardwarePlacementMatrixV1{
  return terminal(
    'HARDWARE_PLACEMENT_MATRIX_INVALID',
    blockers,
    values,
  );
}

function failed(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeHardwarePlacementMatrixV1{
  return terminal(
    'HARDWARE_PLACEMENT_MATRIX_FAILED',
    blockers,
    values,
  );
}

function terminal(
  state:
    |'HARDWARE_PLACEMENT_MATRIX_INVALID'
    |'HARDWARE_PLACEMENT_MATRIX_BLOCKED'
    |'HARDWARE_PLACEMENT_MATRIX_FAILED',
  blockers:readonly string[],
  values:PartialOutput,
):HsmeHardwarePlacementMatrixV1{
  return deepFreeze({
    schemaVersion:HSME_HARDWARE_PLACEMENT_MATRIX_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    hardwareRepresentationRosterSha256:
      values.hardwareRepresentationRosterSha256??'UNKNOWN',
    campaignPolicySha256:
      values.campaignPolicySha256??'UNKNOWN',
    hostResultSha256:
      values.hostResultSha256??'UNKNOWN',
    executionAttemptId:
      values.executionAttemptId??'UNKNOWN',
    fixtureSetSha256:
      values.fixtureSetSha256??'UNKNOWN',
    evaluationContractSha256:
      values.evaluationContractSha256??'UNKNOWN',
    deterministicSeedContractSha256:
      values.deterministicSeedContractSha256??'UNKNOWN',
    caseCount:values.caseCount??'UNKNOWN',
    qualityDimensions:
      values.qualityDimensions??Object.freeze([]),
    hardPreservationDimensions:
      values.hardPreservationDimensions??Object.freeze([]),
    rows:Object.freeze([]),
    matrixEvidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

function authorityBoundary(){
  return Object.freeze({
    selectionAllowed:false as const,
    benchmarkExecutionAllowed:false as const,
    representationMutationAllowed:false as const,
    inferenceExecutionAllowed:false as const,
    modelInstallAllowed:false as const,
    modelFleetPromotionAllowed:false as const,
    durableModelFleetPromotionAllowed:false as const,
    productionAuthorityGranted:false as const,
    providerAuthorityGranted:false as const,
    billingAuthorityGranted:false as const,
    projectArtifactMutationAllowed:false as const,
    fashionGeometryAuthorityGranted:false as const,
    artifactAuthorityGranted:false as const,
    aeeExecutionAuthorityGranted:false as const,
    winnerSelectionAllowed:false as const,
  });
}

function assertNoAuthority(
  record:Record<string,unknown>,
  path:string,
):void{
  for(const field of Object.keys(authorityBoundary())){
    if(record[field]!==false){
      fail(
        'hsme_hardware_placement_authority',
        path+'.'+field+' must remain false',
      );
    }
  }
}

function sameStringSet(
  left:readonly string[],
  right:readonly string[],
):boolean{
  if(left.length!==right.length)return false;
  const a=[...left].sort(lexical);
  const b=[...right].sort(lexical);
  return a.every(
    (value,index)=>value===b[index],
  );
}

function identifierSet(
  raw:unknown,
  path:string,
  min:number,
  max:number,
  maxLength:number,
):string[]{
  if(!Array.isArray(raw)||raw.length<min||raw.length>max){
    fail(
      'hsme_hardware_placement_value',
      path+' cardinality invalid',
    );
  }
  const values=raw.map((value,index)=>
    identifier(
      value,
      path+'['+index+']',
      maxLength,
    )
  ).sort(lexical);
  if(new Set(values).size!==values.length){
    fail(
      'hsme_hardware_placement_value',
      path+' contains duplicates',
    );
  }
  return values;
}

function exactDigest(
  expected:string,
  actual:string,
  embedded:string,
):boolean{
  return HEX64.test(expected)
    &&expected===actual
    &&actual===embedded;
}

function exactRecord(
  raw:unknown,
  fields:readonly string[],
  path:string,
):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail(
      'hsme_hardware_placement_schema',
      path+' must be an object',
    );
  }
  const proto=Object.getPrototypeOf(raw);
  if(proto!==Object.prototype&&proto!==null){
    fail(
      'hsme_hardware_placement_schema',
      path+' must be a plain object',
    );
  }
  const r=raw as Record<string,unknown>;
  const keys=Object.keys(r);
  if(
    keys.length!==fields.length
    ||keys.some(key=>!fields.includes(key))
    ||fields.some(key=>!Object.hasOwn(r,key))
  ){
    fail(
      'hsme_hardware_placement_schema',
      path+' contains unknown or missing fields',
    );
  }
  return r;
}

function enumValue<T extends readonly string[]>(
  raw:unknown,
  values:T,
  path:string,
):T[number]{
  if(
    typeof raw!=='string'
    ||!(values as readonly string[]).includes(raw)
  ){
    fail(
      'hsme_hardware_placement_value',
      path+' is unsupported',
    );
  }
  return raw as T[number];
}

function identifier(
  raw:unknown,
  path:string,
  max:number,
):string{
  const value=boundedString(raw,path,max);
  if(!IDENTIFIER.test(value)){
    fail(
      'hsme_hardware_placement_value',
      path+' must be an identifier',
    );
  }
  return value;
}

function version(
  raw:unknown,
  path:string,
  max:number,
):string{
  const value=boundedString(raw,path,max);
  if(!VERSION.test(value)){
    fail(
      'hsme_hardware_placement_value',
      path+' must be a version identifier',
    );
  }
  return value;
}

function sha256(
  raw:unknown,
  path:string,
):string{
  const value=boundedString(raw,path,64);
  if(!HEX64.test(value)){
    fail(
      'hsme_hardware_placement_value',
      path+' must be lowercase SHA-256',
    );
  }
  return value;
}

function boundedString(
  raw:unknown,
  path:string,
  max:number,
):string{
  if(typeof raw!=='string'){
    fail(
      'hsme_hardware_placement_value',
      path+' must be a string',
    );
  }
  const value=raw.trim();
  if(
    value.length<1
    ||value.length>max
    ||/[\u0000-\u001f\u007f]/.test(value)
  ){
    fail(
      'hsme_hardware_placement_value',
      path+' is invalid',
    );
  }
  return value;
}

function safeInteger(
  raw:unknown,
  path:string,
  min:number,
  max:number,
):number{
  if(
    !Number.isSafeInteger(raw)
    ||(raw as number)<min
    ||(raw as number)>max
  ){
    fail(
      'hsme_hardware_placement_value',
      path+' must be a bounded safe integer',
    );
  }
  return raw as number;
}

async function digest(
  domain:string,
  value:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  const result=await hash.sha256(
    new TextEncoder().encode(
      domain+JSON.stringify(value),
    ),
  );
  if(!HEX64.test(result)){
    fail(
      'hsme_hardware_placement_hash',
      'hash port must return lowercase SHA-256',
    );
  }
  return result;
}

async function verify(
  run:()=>Promise<boolean>,
):Promise<boolean>{
  try{
    return await run()===true;
  }catch{
    return false;
  }
}

function lexical(a:string,b:string):number{
  return a<b?-1:a>b?1:0;
}

function deepFreeze<T>(value:T):T{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const child of Object.values(
      value as Record<string,unknown>,
    )){
      deepFreeze(child);
    }
  }
  return value;
}

function fail(
  code:string,
  message:string,
):never{
  throw new HsmeHardwarePlacementMatrixV1Error(
    code,
    message,
  );
}
