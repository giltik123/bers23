import {
  hsmeAdapterMoePrototypeRosterV1Digest,
  type HsmeAdapterMoePrototypeRosterV1,
  type HsmeAdapterMoePrototypeEntryV1,
} from './HsmeAdapterMoePrototypeRosterV1.ts';
import type {
  HsmeDenseBaselineHashPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

export const HSME_ADAPTIVE_RESIDENCY_DEVICE_PROFILE_V1_SCHEMA =
  'BERS_HSME_ADAPTIVE_RESIDENCY_DEVICE_PROFILE_V1' as const;
export const HSME_ADAPTIVE_RESIDENCY_DEVICE_PROFILE_DIGEST_DOMAIN =
  'bers:hsme:adaptive-residency-device-profile:v1\0' as const;
export const HSME_ADAPTIVE_RESIDENCY_POLICY_V1_SCHEMA =
  'BERS_HSME_ADAPTIVE_RESIDENCY_POLICY_V1' as const;
export const HSME_ADAPTIVE_RESIDENCY_POLICY_DIGEST_DOMAIN =
  'bers:hsme:adaptive-residency-policy:v1\0' as const;
export const HSME_ADAPTIVE_RESIDENCY_EXPERIMENT_PLAN_V1_SCHEMA =
  'BERS_HSME_ADAPTIVE_RESIDENCY_EXPERIMENT_PLAN_V1' as const;
export const HSME_ADAPTIVE_RESIDENCY_EXPERIMENT_PLAN_DIGEST_DOMAIN =
  'bers:hsme:adaptive-residency-experiment-plan:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+/-]*$/;

const TELEMETRY=Object.freeze([
  'FLASH_READ_BYTES',
  'FLASH_TO_RAM_BYTES',
  'RAM_TO_ACCELERATOR_BYTES',
  'ACCELERATOR_TO_RAM_BYTES',
  'FLASH_HIT_COUNT',
  'RAM_HIT_COUNT',
  'ACCELERATOR_HIT_COUNT',
  'CACHE_MISS_COUNT',
  'DETERMINISTIC_PREFETCH_BYTES',
  'PREDICTIVE_PREFETCH_BYTES',
  'USEFUL_PREFETCH_BYTES',
  'WASTED_PREFETCH_BYTES',
  'EVICTION_BYTES',
  'PEAK_RAM_RESIDENT_BYTES',
  'PEAK_ACCELERATOR_RESIDENT_BYTES',
  'FLASH_TO_RAM_TRANSFER_MS',
  'RAM_TO_ACCELERATOR_TRANSFER_MS',
  'ACCELERATOR_TO_RAM_TRANSFER_MS',
  'COLD_END_TO_END_LATENCY_MS',
  'WARM_END_TO_END_LATENCY_MS',
  'COMPUTE_STALL_MS_WAITING_FOR_WEIGHTS',
  'NETWORK_BYTES_DURING_EXECUTION',
] as const);

export type HsmeAdaptiveResidencyDeviceProfileV1=Readonly<{
  schemaVersion:typeof HSME_ADAPTIVE_RESIDENCY_DEVICE_PROFILE_V1_SCHEMA;
  profileId:string;
  hardwareClass:string;
  runtimeRepresentationSha256:string;
  measurementEnvironmentSha256:string;
  measuredFlashReadBytesPerSecond:number;
  measuredRamToAcceleratorBytesPerSecond:number;
  measuredAcceleratorToRamBytesPerSecond:number|'NONE';
  physicalRamBytes:number;
  physicalAcceleratorBytes:number;
  availableStorageBytes:number;
  thermalClass:string;
  batteryClass:string;
  realMeasuredEvidence:true;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  productionAuthorityGranted:false;
}>;

export type HsmeAdaptiveResidencyPolicyV1=Readonly<{
  schemaVersion:typeof HSME_ADAPTIVE_RESIDENCY_POLICY_V1_SCHEMA;
  prototypeRosterSha256:string;
  prototypeSha256:string;
  maxRamBudgetBytes:number;
  maxAcceleratorBudgetBytes:number;
  maxColdStorageCacheBytes:number;
  maxDeterministicPrefetchBytesPerStage:number;
  maxPredictivePrefetchBytesPerStage:number;
  maxPredictionLookaheadStages:number;
  maxConcurrentTransfers:number;
  evictionPolicy:'USAGE_AWARE_LRU_BOUNDED';
  deterministicPrefetchRequired:true;
  predictivePrefetchAllowed:boolean;
  doubleBufferingAllowed:boolean;
  networkDuringExecutionAllowed:false;
  maxWastedPrefetchRatioBps:number;
  movementExecutionAllowed:false;
  inferenceExecutionAllowed:false;
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

export interface HsmeAdaptiveResidencyPrototypeRosterOriginVerifierV1{
  verifyPrototypeRoster(
    roster:HsmeAdapterMoePrototypeRosterV1,
    expectedRosterSha256:string,
  ):Promise<boolean>;
}

export interface HsmeAdaptiveResidencyDeviceProfileOriginVerifierV1{
  verifyDeviceProfile(
    profile:HsmeAdaptiveResidencyDeviceProfileV1,
    expectedProfileSha256:string,
  ):Promise<boolean>;
}

export interface HsmeAdaptiveResidencyPolicyOriginVerifierV1{
  verifyResidencyPolicy(
    policy:HsmeAdaptiveResidencyPolicyV1,
    expectedPolicySha256:string,
  ):Promise<boolean>;
}

export type HsmeAdaptiveResidencyExperimentPlanV1=Readonly<{
  schemaVersion:typeof HSME_ADAPTIVE_RESIDENCY_EXPERIMENT_PLAN_V1_SCHEMA;
  state:
    |'ADAPTIVE_RESIDENCY_PLAN_INVALID'
    |'ADAPTIVE_RESIDENCY_PLAN_BLOCKED'
    |'ADAPTIVE_RESIDENCY_PLAN_FROZEN_NOT_EXECUTED';
  blockers:readonly string[];
  prototypeRosterSha256:string|'UNKNOWN';
  prototypeSha256:string|'UNKNOWN';
  prototypeVariant:string|'UNKNOWN';
  denseBaselineContentSha256:string|'UNKNOWN';
  routerContentSha256:string|'UNKNOWN';
  expertIds:readonly string[];
  expertContentSha256s:readonly string[];
  maxActiveExperts:1|2|'UNKNOWN';
  denseBaselinePackageBytes:number|'UNKNOWN';
  totalExpertArtifactBytes:number|'UNKNOWN';
  routerBytes:number|'UNKNOWN';
  prototypePackageBytes:number|'UNKNOWN';
  deviceProfileSha256:string|'UNKNOWN';
  policySha256:string|'UNKNOWN';
  hardwareClass:string|'UNKNOWN';
  runtimeRepresentationSha256:string|'UNKNOWN';
  measurementEnvironmentSha256:string|'UNKNOWN';
  measuredFlashReadBytesPerSecond:number|'UNKNOWN';
  measuredRamToAcceleratorBytesPerSecond:number|'UNKNOWN';
  measuredAcceleratorToRamBytesPerSecond:number|'NONE'|'UNKNOWN';
  physicalRamBytes:number|'UNKNOWN';
  physicalAcceleratorBytes:number|'UNKNOWN';
  availableStorageBytes:number|'UNKNOWN';
  maxRamBudgetBytes:number|'UNKNOWN';
  maxAcceleratorBudgetBytes:number|'UNKNOWN';
  maxColdStorageCacheBytes:number|'UNKNOWN';
  maxDeterministicPrefetchBytesPerStage:number|'UNKNOWN';
  maxPredictivePrefetchBytesPerStage:number|'UNKNOWN';
  maxPredictionLookaheadStages:number|'UNKNOWN';
  maxConcurrentTransfers:number|'UNKNOWN';
  deterministicPrefetchRequired:boolean;
  predictivePrefetchAllowed:boolean;
  doubleBufferingAllowed:boolean;
  maxWastedPrefetchRatioBps:number|'UNKNOWN';
  telemetryDimensions:readonly string[];
  planEvidenceSha256:string|'UNKNOWN';
  movementExecutionAllowed:false;
  inferenceExecutionAllowed:false;
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

export class HsmeAdaptiveResidencyExperimentPlanV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeAdaptiveResidencyExperimentPlanV1Error';
    this.code=code;
  }
}

export function normalizeHsmeAdaptiveResidencyDeviceProfileV1(
  raw:unknown,
):HsmeAdaptiveResidencyDeviceProfileV1{
  const r=exactRecord(raw,[
    'schemaVersion','profileId','hardwareClass','runtimeRepresentationSha256',
    'measurementEnvironmentSha256','measuredFlashReadBytesPerSecond',
    'measuredRamToAcceleratorBytesPerSecond',
    'measuredAcceleratorToRamBytesPerSecond','physicalRamBytes',
    'physicalAcceleratorBytes','availableStorageBytes','thermalClass',
    'batteryClass','realMeasuredEvidence','providerAuthorityGranted',
    'billingAuthorityGranted','productionAuthorityGranted',
  ],'profile');
  if(r.schemaVersion!==HSME_ADAPTIVE_RESIDENCY_DEVICE_PROFILE_V1_SCHEMA){
    fail('hsme_residency_profile_schema','device profile schema unsupported');
  }
  if(r.realMeasuredEvidence!==true){
    fail('hsme_residency_profile_real','realMeasuredEvidence must be true');
  }
  if(
    r.providerAuthorityGranted!==false
    ||r.billingAuthorityGranted!==false
    ||r.productionAuthorityGranted!==false
  ){
    fail('hsme_residency_profile_authority','device profile authority widening');
  }
  const acceleratorToRam=
    r.measuredAcceleratorToRamBytesPerSecond==='NONE'
      ?'NONE' as const
      :safeInteger(
        r.measuredAcceleratorToRamBytesPerSecond,
        'profile.measuredAcceleratorToRamBytesPerSecond',
        1,Number.MAX_SAFE_INTEGER,
      );
  return deepFreeze({
    schemaVersion:HSME_ADAPTIVE_RESIDENCY_DEVICE_PROFILE_V1_SCHEMA,
    profileId:identifier(r.profileId,'profile.profileId',160),
    hardwareClass:identifier(r.hardwareClass,'profile.hardwareClass',160),
    runtimeRepresentationSha256:sha256(
      r.runtimeRepresentationSha256,'profile.runtimeRepresentationSha256',
    ),
    measurementEnvironmentSha256:sha256(
      r.measurementEnvironmentSha256,'profile.measurementEnvironmentSha256',
    ),
    measuredFlashReadBytesPerSecond:safeInteger(
      r.measuredFlashReadBytesPerSecond,
      'profile.measuredFlashReadBytesPerSecond',1,Number.MAX_SAFE_INTEGER,
    ),
    measuredRamToAcceleratorBytesPerSecond:safeInteger(
      r.measuredRamToAcceleratorBytesPerSecond,
      'profile.measuredRamToAcceleratorBytesPerSecond',
      1,Number.MAX_SAFE_INTEGER,
    ),
    measuredAcceleratorToRamBytesPerSecond:acceleratorToRam,
    physicalRamBytes:safeInteger(
      r.physicalRamBytes,'profile.physicalRamBytes',1,Number.MAX_SAFE_INTEGER,
    ),
    physicalAcceleratorBytes:safeInteger(
      r.physicalAcceleratorBytes,
      'profile.physicalAcceleratorBytes',1,Number.MAX_SAFE_INTEGER,
    ),
    availableStorageBytes:safeInteger(
      r.availableStorageBytes,'profile.availableStorageBytes',
      1,Number.MAX_SAFE_INTEGER,
    ),
    thermalClass:identifier(r.thermalClass,'profile.thermalClass',80),
    batteryClass:identifier(r.batteryClass,'profile.batteryClass',80),
    realMeasuredEvidence:true,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    productionAuthorityGranted:false,
  });
}

export function normalizeHsmeAdaptiveResidencyPolicyV1(
  raw:unknown,
):HsmeAdaptiveResidencyPolicyV1{
  const r=exactRecord(raw,[
    'schemaVersion','prototypeRosterSha256','prototypeSha256',
    'maxRamBudgetBytes','maxAcceleratorBudgetBytes',
    'maxColdStorageCacheBytes','maxDeterministicPrefetchBytesPerStage',
    'maxPredictivePrefetchBytesPerStage','maxPredictionLookaheadStages',
    'maxConcurrentTransfers','evictionPolicy','deterministicPrefetchRequired',
    'predictivePrefetchAllowed','doubleBufferingAllowed',
    'networkDuringExecutionAllowed','maxWastedPrefetchRatioBps',
    'movementExecutionAllowed','inferenceExecutionAllowed',
    'modelInstallAllowed','modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed','productionAuthorityGranted',
    'providerAuthorityGranted','billingAuthorityGranted',
    'projectArtifactMutationAllowed','aeeExecutionAuthorityGranted',
    'winnerSelectionAllowed',
  ],'policy');
  if(r.schemaVersion!==HSME_ADAPTIVE_RESIDENCY_POLICY_V1_SCHEMA){
    fail('hsme_residency_policy_schema','residency policy schema unsupported');
  }
  if(
    r.evictionPolicy!=='USAGE_AWARE_LRU_BOUNDED'
    ||r.deterministicPrefetchRequired!==true
    ||r.networkDuringExecutionAllowed!==false
  ){
    fail('hsme_residency_policy_boundary','residency policy boundary invalid');
  }
  assertNoAuthority(r,'policy');
  const predictive=r.predictivePrefetchAllowed;
  if(typeof predictive!=='boolean'||typeof r.doubleBufferingAllowed!=='boolean'){
    fail('hsme_residency_policy_value','prefetch/buffering flags must be booleans');
  }
  const policy=deepFreeze({
    schemaVersion:HSME_ADAPTIVE_RESIDENCY_POLICY_V1_SCHEMA,
    prototypeRosterSha256:sha256(
      r.prototypeRosterSha256,'policy.prototypeRosterSha256',
    ),
    prototypeSha256:sha256(r.prototypeSha256,'policy.prototypeSha256'),
    maxRamBudgetBytes:safeInteger(
      r.maxRamBudgetBytes,'policy.maxRamBudgetBytes',1,Number.MAX_SAFE_INTEGER,
    ),
    maxAcceleratorBudgetBytes:safeInteger(
      r.maxAcceleratorBudgetBytes,'policy.maxAcceleratorBudgetBytes',
      1,Number.MAX_SAFE_INTEGER,
    ),
    maxColdStorageCacheBytes:safeInteger(
      r.maxColdStorageCacheBytes,'policy.maxColdStorageCacheBytes',
      1,Number.MAX_SAFE_INTEGER,
    ),
    maxDeterministicPrefetchBytesPerStage:safeInteger(
      r.maxDeterministicPrefetchBytesPerStage,
      'policy.maxDeterministicPrefetchBytesPerStage',
      0,Number.MAX_SAFE_INTEGER,
    ),
    maxPredictivePrefetchBytesPerStage:safeInteger(
      r.maxPredictivePrefetchBytesPerStage,
      'policy.maxPredictivePrefetchBytesPerStage',
      0,Number.MAX_SAFE_INTEGER,
    ),
    maxPredictionLookaheadStages:safeInteger(
      r.maxPredictionLookaheadStages,
      'policy.maxPredictionLookaheadStages',0,64,
    ),
    maxConcurrentTransfers:safeInteger(
      r.maxConcurrentTransfers,'policy.maxConcurrentTransfers',1,16,
    ),
    evictionPolicy:'USAGE_AWARE_LRU_BOUNDED' as const,
    deterministicPrefetchRequired:true as const,
    predictivePrefetchAllowed:predictive,
    doubleBufferingAllowed:r.doubleBufferingAllowed,
    networkDuringExecutionAllowed:false as const,
    maxWastedPrefetchRatioBps:safeInteger(
      r.maxWastedPrefetchRatioBps,'policy.maxWastedPrefetchRatioBps',0,10000,
    ),
    ...authorityBoundary(),
  });
  if(
    (!policy.predictivePrefetchAllowed
      &&(policy.maxPredictivePrefetchBytesPerStage!==0
        ||policy.maxPredictionLookaheadStages!==0))
    ||(policy.predictivePrefetchAllowed
      &&(policy.maxPredictivePrefetchBytesPerStage===0
        ||policy.maxPredictionLookaheadStages===0))
  ){
    fail('hsme_residency_policy_predictive','predictive caps inconsistent with enable flag');
  }
  if(
    policy.maxPredictivePrefetchBytesPerStage>
      policy.maxDeterministicPrefetchBytesPerStage
  ){
    fail(
      'hsme_residency_policy_predictive_cap',
      'predictive prefetch cap cannot exceed deterministic safety cap',
    );
  }
  return policy;
}

export async function hsmeAdaptiveResidencyDeviceProfileV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  return digest(
    HSME_ADAPTIVE_RESIDENCY_DEVICE_PROFILE_DIGEST_DOMAIN,
    normalizeHsmeAdaptiveResidencyDeviceProfileV1(raw),
    hash,
  );
}

export async function hsmeAdaptiveResidencyPolicyV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  return digest(
    HSME_ADAPTIVE_RESIDENCY_POLICY_DIGEST_DOMAIN,
    normalizeHsmeAdaptiveResidencyPolicyV1(raw),
    hash,
  );
}

export async function freezeHsmeAdaptiveResidencyExperimentPlanV1(
  roster:HsmeAdapterMoePrototypeRosterV1,
  expectedRosterSha256:string,
  rosterOrigin:HsmeAdaptiveResidencyPrototypeRosterOriginVerifierV1,
  selectedPrototypeSha256:string,
  rawProfile:unknown,
  expectedProfileSha256:string,
  profileOrigin:HsmeAdaptiveResidencyDeviceProfileOriginVerifierV1,
  rawPolicy:unknown,
  expectedPolicySha256:string,
  policyOrigin:HsmeAdaptiveResidencyPolicyOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeAdaptiveResidencyExperimentPlanV1>{
  if(
    roster.state!=='ADAPTER_MOE_PROTOTYPE_ROSTER_READY_NOT_EXECUTED'
    ||roster.rosterEvidenceSha256==='UNKNOWN'
  ){
    return blocked(['ADAPTIVE_RESIDENCY_READY_PROTOTYPE_ROSTER_REQUIRED']);
  }
  let rosterSha:string;
  try{
    rosterSha=await hsmeAdapterMoePrototypeRosterV1Digest(roster,hash);
  }catch{
    return invalid(['ADAPTIVE_RESIDENCY_ROSTER_REHASH_INVALID']);
  }
  if(
    !HEX64.test(expectedRosterSha256)
    ||rosterSha!==expectedRosterSha256
    ||rosterSha!==roster.rosterEvidenceSha256
  ){
    return invalid(['ADAPTIVE_RESIDENCY_ROSTER_REHASH_MISMATCH'],{prototypeRosterSha256:rosterSha});
  }
  if(!await verify(()=>rosterOrigin.verifyPrototypeRoster(roster,rosterSha))){
    return invalid(['ADAPTIVE_RESIDENCY_ROSTER_ORIGIN_UNVERIFIED'],{prototypeRosterSha256:rosterSha});
  }
  if(!HEX64.test(selectedPrototypeSha256)){
    return invalid(['ADAPTIVE_RESIDENCY_PROTOTYPE_SHA_INVALID'],{prototypeRosterSha256:rosterSha});
  }
  const prototype=roster.prototypes.find(
    value=>value.prototypeSha256===selectedPrototypeSha256,
  );
  if(prototype===undefined){
    return invalid(['ADAPTIVE_RESIDENCY_PROTOTYPE_NOT_IN_ROSTER'],{prototypeRosterSha256:rosterSha});
  }
  if(
    prototype.variant!=='SHARED_TOP1_ADAPTER'
    &&prototype.variant!=='SHARED_TOP2_ADAPTER'
  ){
    return invalid(['ADAPTIVE_RESIDENCY_PROTOTYPE_VARIANT_UNSUPPORTED'],{
      prototypeRosterSha256:rosterSha,
      prototypeSha256:selectedPrototypeSha256,
    });
  }

  let profile:HsmeAdaptiveResidencyDeviceProfileV1;
  let profileSha:string;
  try{
    profile=normalizeHsmeAdaptiveResidencyDeviceProfileV1(rawProfile);
    profileSha=await hsmeAdaptiveResidencyDeviceProfileV1Digest(profile,hash);
  }catch{
    return invalid(['ADAPTIVE_RESIDENCY_DEVICE_PROFILE_INVALID'],prototypeValues(rosterSha,prototype));
  }
  if(!HEX64.test(expectedProfileSha256)||profileSha!==expectedProfileSha256){
    return invalid(['ADAPTIVE_RESIDENCY_DEVICE_PROFILE_DIGEST_MISMATCH'],prototypeValues(rosterSha,prototype));
  }
  if(!await verify(()=>profileOrigin.verifyDeviceProfile(profile,profileSha))){
    return invalid(['ADAPTIVE_RESIDENCY_DEVICE_PROFILE_ORIGIN_UNVERIFIED'],prototypeValues(rosterSha,prototype));
  }

  let policy:HsmeAdaptiveResidencyPolicyV1;
  let policySha:string;
  try{
    policy=normalizeHsmeAdaptiveResidencyPolicyV1(rawPolicy);
    policySha=await hsmeAdaptiveResidencyPolicyV1Digest(policy,hash);
  }catch{
    return invalid(['ADAPTIVE_RESIDENCY_POLICY_INVALID'],{
      ...prototypeValues(rosterSha,prototype),
      deviceProfileSha256:profileSha,
    });
  }
  if(!HEX64.test(expectedPolicySha256)||policySha!==expectedPolicySha256){
    return invalid(['ADAPTIVE_RESIDENCY_POLICY_DIGEST_MISMATCH'],{
      ...prototypeValues(rosterSha,prototype),
      deviceProfileSha256:profileSha,
    });
  }
  if(!await verify(()=>policyOrigin.verifyResidencyPolicy(policy,policySha))){
    return invalid(['ADAPTIVE_RESIDENCY_POLICY_ORIGIN_UNVERIFIED'],{
      ...prototypeValues(rosterSha,prototype),
      deviceProfileSha256:profileSha,
      policySha256:policySha,
    });
  }
  if(
    policy.prototypeRosterSha256!==rosterSha
    ||policy.prototypeSha256!==prototype.prototypeSha256
  ){
    return invalid(['ADAPTIVE_RESIDENCY_POLICY_PROTOTYPE_BINDING_MISMATCH'],{
      ...prototypeValues(rosterSha,prototype),
      deviceProfileSha256:profileSha,
      policySha256:policySha,
    });
  }
  if(
    policy.maxRamBudgetBytes>profile.physicalRamBytes
    ||policy.maxAcceleratorBudgetBytes>profile.physicalAcceleratorBytes
    ||policy.maxColdStorageCacheBytes>profile.availableStorageBytes
  ){
    return invalid(['ADAPTIVE_RESIDENCY_POLICY_PHYSICAL_BUDGET_EXCEEDED'],{
      ...prototypeValues(rosterSha,prototype),
      deviceProfileSha256:profileSha,
      policySha256:policySha,
    });
  }

  const payload={
    schemaVersion:HSME_ADAPTIVE_RESIDENCY_EXPERIMENT_PLAN_V1_SCHEMA,
    state:'ADAPTIVE_RESIDENCY_PLAN_FROZEN_NOT_EXECUTED' as const,
    blockers:Object.freeze([] as string[]),
    prototypeRosterSha256:rosterSha,
    prototypeSha256:prototype.prototypeSha256,
    prototypeVariant:prototype.variant,
    denseBaselineContentSha256:roster.denseBaselineContentSha256,
    routerContentSha256:prototype.routerContentSha256,
    expertIds:prototype.expertIds,
    expertContentSha256s:prototype.expertContentSha256s,
    maxActiveExperts:prototype.maxActiveExperts,
    denseBaselinePackageBytes:prototype.denseBaselinePackageBytes,
    totalExpertArtifactBytes:prototype.totalExpertArtifactBytes,
    routerBytes:prototype.routerBytes,
    prototypePackageBytes:prototype.packageBytes,
    deviceProfileSha256:profileSha,
    policySha256:policySha,
    hardwareClass:profile.hardwareClass,
    runtimeRepresentationSha256:profile.runtimeRepresentationSha256,
    measurementEnvironmentSha256:profile.measurementEnvironmentSha256,
    measuredFlashReadBytesPerSecond:profile.measuredFlashReadBytesPerSecond,
    measuredRamToAcceleratorBytesPerSecond:
      profile.measuredRamToAcceleratorBytesPerSecond,
    measuredAcceleratorToRamBytesPerSecond:
      profile.measuredAcceleratorToRamBytesPerSecond,
    physicalRamBytes:profile.physicalRamBytes,
    physicalAcceleratorBytes:profile.physicalAcceleratorBytes,
    availableStorageBytes:profile.availableStorageBytes,
    maxRamBudgetBytes:policy.maxRamBudgetBytes,
    maxAcceleratorBudgetBytes:policy.maxAcceleratorBudgetBytes,
    maxColdStorageCacheBytes:policy.maxColdStorageCacheBytes,
    maxDeterministicPrefetchBytesPerStage:
      policy.maxDeterministicPrefetchBytesPerStage,
    maxPredictivePrefetchBytesPerStage:
      policy.maxPredictivePrefetchBytesPerStage,
    maxPredictionLookaheadStages:policy.maxPredictionLookaheadStages,
    maxConcurrentTransfers:policy.maxConcurrentTransfers,
    deterministicPrefetchRequired:true,
    predictivePrefetchAllowed:policy.predictivePrefetchAllowed,
    doubleBufferingAllowed:policy.doubleBufferingAllowed,
    maxWastedPrefetchRatioBps:policy.maxWastedPrefetchRatioBps,
    telemetryDimensions:TELEMETRY,
    ...authorityBoundary(),
  };
  const planEvidenceSha256=await digest(
    HSME_ADAPTIVE_RESIDENCY_EXPERIMENT_PLAN_DIGEST_DOMAIN,
    payload,
    hash,
  );
  return deepFreeze({...payload,planEvidenceSha256});
}

export async function hsmeAdaptiveResidencyExperimentPlanV1Digest(
  plan:HsmeAdaptiveResidencyExperimentPlanV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  if(
    plan.state!=='ADAPTIVE_RESIDENCY_PLAN_FROZEN_NOT_EXECUTED'
    ||plan.planEvidenceSha256==='UNKNOWN'
  ){
    fail('hsme_residency_plan_digest_state','only FROZEN_NOT_EXECUTED plan is digestible');
  }
  const {planEvidenceSha256:_ignored,...payload}=plan;
  return digest(HSME_ADAPTIVE_RESIDENCY_EXPERIMENT_PLAN_DIGEST_DOMAIN,payload,hash);
}

type PartialOutput=Partial<Pick<
  HsmeAdaptiveResidencyExperimentPlanV1,
  'prototypeRosterSha256'|'prototypeSha256'|'prototypeVariant'
  |'denseBaselinePackageBytes'|'totalExpertArtifactBytes'|'routerBytes'
  |'prototypePackageBytes'|'deviceProfileSha256'|'policySha256'
>>;

function prototypeValues(
  rosterSha:string,
  p:HsmeAdapterMoePrototypeEntryV1,
):PartialOutput{
  return {
    prototypeRosterSha256:rosterSha,
    prototypeSha256:p.prototypeSha256,
    prototypeVariant:p.variant,
    denseBaselinePackageBytes:p.denseBaselinePackageBytes,
    totalExpertArtifactBytes:p.totalExpertArtifactBytes,
    routerBytes:p.routerBytes,
    prototypePackageBytes:p.packageBytes,
  };
}

function invalid(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeAdaptiveResidencyExperimentPlanV1{
  return terminal('ADAPTIVE_RESIDENCY_PLAN_INVALID',blockers,values);
}
function blocked(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeAdaptiveResidencyExperimentPlanV1{
  return terminal('ADAPTIVE_RESIDENCY_PLAN_BLOCKED',blockers,values);
}
function terminal(
  state:'ADAPTIVE_RESIDENCY_PLAN_INVALID'|'ADAPTIVE_RESIDENCY_PLAN_BLOCKED',
  blockers:readonly string[],
  values:PartialOutput,
):HsmeAdaptiveResidencyExperimentPlanV1{
  return deepFreeze({
    schemaVersion:HSME_ADAPTIVE_RESIDENCY_EXPERIMENT_PLAN_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort()),
    prototypeRosterSha256:values.prototypeRosterSha256??'UNKNOWN',
    prototypeSha256:values.prototypeSha256??'UNKNOWN',
    prototypeVariant:values.prototypeVariant??'UNKNOWN',
    denseBaselineContentSha256:'UNKNOWN',
    routerContentSha256:'UNKNOWN',
    expertIds:Object.freeze([]),
    expertContentSha256s:Object.freeze([]),
    maxActiveExperts:'UNKNOWN',
    denseBaselinePackageBytes:values.denseBaselinePackageBytes??'UNKNOWN',
    totalExpertArtifactBytes:values.totalExpertArtifactBytes??'UNKNOWN',
    routerBytes:values.routerBytes??'UNKNOWN',
    prototypePackageBytes:values.prototypePackageBytes??'UNKNOWN',
    deviceProfileSha256:values.deviceProfileSha256??'UNKNOWN',
    policySha256:values.policySha256??'UNKNOWN',
    hardwareClass:'UNKNOWN',
    runtimeRepresentationSha256:'UNKNOWN',
    measurementEnvironmentSha256:'UNKNOWN',
    measuredFlashReadBytesPerSecond:'UNKNOWN',
    measuredRamToAcceleratorBytesPerSecond:'UNKNOWN',
    measuredAcceleratorToRamBytesPerSecond:'UNKNOWN',
    physicalRamBytes:'UNKNOWN',
    physicalAcceleratorBytes:'UNKNOWN',
    availableStorageBytes:'UNKNOWN',
    maxRamBudgetBytes:'UNKNOWN',
    maxAcceleratorBudgetBytes:'UNKNOWN',
    maxColdStorageCacheBytes:'UNKNOWN',
    maxDeterministicPrefetchBytesPerStage:'UNKNOWN',
    maxPredictivePrefetchBytesPerStage:'UNKNOWN',
    maxPredictionLookaheadStages:'UNKNOWN',
    maxConcurrentTransfers:'UNKNOWN',
    deterministicPrefetchRequired:false,
    predictivePrefetchAllowed:false,
    doubleBufferingAllowed:false,
    maxWastedPrefetchRatioBps:'UNKNOWN',
    telemetryDimensions:Object.freeze([]),
    planEvidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

function authorityBoundary(){
  return Object.freeze({
    movementExecutionAllowed:false as const,
    inferenceExecutionAllowed:false as const,
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

function assertNoAuthority(r:Record<string,unknown>,path:string):void{
  for(const key of Object.keys(authorityBoundary())){
    if(r[key]!==false){
      fail('hsme_residency_authority',path+'.'+key+' must remain false');
    }
  }
}
function exactRecord(raw:unknown,fields:readonly string[],path:string):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail('hsme_residency_schema',path+' must be an object');
  }
  const r=raw as Record<string,unknown>;
  const keys=Object.keys(r);
  if(keys.length!==fields.length||keys.some(k=>!fields.includes(k))||fields.some(k=>!Object.hasOwn(r,k))){
    fail('hsme_residency_schema',path+' contains unknown or missing fields');
  }
  return r;
}
function identifier(raw:unknown,path:string,max:number):string{
  const v=boundedString(raw,path,max);
  if(!IDENTIFIER.test(v)) fail('hsme_residency_value',path+' must be identifier');
  return v;
}
function sha256(raw:unknown,path:string):string{
  const v=boundedString(raw,path,64);
  if(!HEX64.test(v)) fail('hsme_residency_value',path+' must be lowercase SHA-256');
  return v;
}
function boundedString(raw:unknown,path:string,max:number):string{
  if(typeof raw!=='string') fail('hsme_residency_value',path+' must be string');
  const v=raw.trim();
  if(v.length<1||v.length>max||/[\u0000-\u001f\u007f]/.test(v)){
    fail('hsme_residency_value',path+' invalid');
  }
  return v;
}
function safeInteger(raw:unknown,path:string,min:number,max:number):number{
  if(!Number.isSafeInteger(raw)||(raw as number)<min||(raw as number)>max){
    fail('hsme_residency_value',path+' must be bounded safe integer');
  }
  return raw as number;
}
async function digest(domain:string,value:unknown,hash:HsmeDenseBaselineHashPortV1):Promise<string>{
  const d=await hash.sha256(new TextEncoder().encode(domain+JSON.stringify(value)));
  if(!HEX64.test(d)) fail('hsme_residency_hash','hash port must return lowercase SHA-256');
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
  throw new HsmeAdaptiveResidencyExperimentPlanV1Error(code,message);
}
