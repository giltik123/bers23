import {
  hsmeAdaptiveResidencyExperimentPlanV1Digest,
  type HsmeAdaptiveResidencyExperimentPlanV1,
} from './HsmeAdaptiveResidencyExperimentPlanV1.ts';
import type {
  HsmeDenseBaselineHashPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

export const HSME_DENSE_BLOCK_PROFILE_ROSTER_V1_SCHEMA =
  'BERS_HSME_DENSE_BLOCK_PROFILE_ROSTER_V1' as const;
export const HSME_DENSE_BLOCK_PROFILE_ROSTER_DIGEST_DOMAIN =
  'bers:hsme:dense-block-profile-roster:v1\0' as const;
export const HSME_SELECTIVE_SPARSE_BLOCK_POLICY_V1_SCHEMA =
  'BERS_HSME_SELECTIVE_SPARSE_BLOCK_POLICY_V1' as const;
export const HSME_SELECTIVE_SPARSE_BLOCK_POLICY_DIGEST_DOMAIN =
  'bers:hsme:selective-sparse-block-policy:v1\0' as const;
export const HSME_SELECTIVE_SPARSE_BLOCK_PLAN_V1_SCHEMA =
  'BERS_HSME_SELECTIVE_SPARSE_BLOCK_PLAN_V1' as const;
export const HSME_SELECTIVE_SPARSE_BLOCK_PLAN_DIGEST_DOMAIN =
  'bers:hsme:selective-sparse-block-plan:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+/-]*$/;

export type HsmeDenseBlockProfileV1=Readonly<{
  blockId:string;
  denseBlockContentSha256:string;
  blockArchitectureSha256:string;
  inputOutputContractSha256:string;
  denseWeightsBytes:number;
  denseActiveWeightsBytes:number;
  denseActivationBytes:number;
  denseWallClockUs:number;
  denseFlashBytesMoved:number;
  denseRamBytesMoved:number;
  denseAcceleratorBytesMoved:number;
  denseKernelDispatchCount:number;
  densePeakMemoryBytes:number;
  qualitySensitivityEvidenceSha256:string;
  runtimeRepresentationSha256:string;
  hardwareClass:string;
}>;

export type HsmeDenseBlockProfileRosterV1=Readonly<{
  schemaVersion:typeof HSME_DENSE_BLOCK_PROFILE_ROSTER_V1_SCHEMA;
  residencyPlanSha256:string;
  denseBaselineContentSha256:string;
  runtimeRepresentationSha256:string;
  hardwareClass:string;
  totalDenseCoreWallClockUs:number;
  profiles:readonly HsmeDenseBlockProfileV1[];
  realMeasuredEvidence:true;
  conversionExecutionAllowed:false;
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

export type HsmeSelectiveSparseBlockPolicyV1=Readonly<{
  schemaVersion:typeof HSME_SELECTIVE_SPARSE_BLOCK_POLICY_V1_SCHEMA;
  residencyPlanSha256:string;
  blockProfileRosterSha256:string;
  candidateBlockIds:readonly string[];
  maxConvertedBlockCount:number;
  maxExpertsPerConvertedBlock:number;
  maxActiveExpertsPerBlock:number;
  maxRouterBytes:number;
  maxSparseBlockPackageBytes:number;
  qualityPreservationContractSha256:string;
  minDenseWallClockShareBps:number;
  fullBackboneExpertAllowed:false;
  conversionExecutionAllowed:false;
  blockExecutionAllowed:false;
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

export interface HsmeSelectiveSparseBlockResidencyPlanOriginVerifierV1{
  verifyResidencyPlan(
    plan:HsmeAdaptiveResidencyExperimentPlanV1,
    expectedSha256:string,
  ):Promise<boolean>;
}
export interface HsmeDenseBlockProfileRosterOriginVerifierV1{
  verifyBlockProfileRoster(
    roster:HsmeDenseBlockProfileRosterV1,
    expectedSha256:string,
  ):Promise<boolean>;
}
export interface HsmeSelectiveSparseBlockPolicyOriginVerifierV1{
  verifySparseBlockPolicy(
    policy:HsmeSelectiveSparseBlockPolicyV1,
    expectedSha256:string,
  ):Promise<boolean>;
}

export type HsmeSelectiveSparseBlockPlanV1=Readonly<{
  schemaVersion:typeof HSME_SELECTIVE_SPARSE_BLOCK_PLAN_V1_SCHEMA;
  state:
    |'SELECTIVE_SPARSE_BLOCK_PLAN_INVALID'
    |'SELECTIVE_SPARSE_BLOCK_PLAN_BLOCKED'
    |'SELECTIVE_SPARSE_BLOCK_PLAN_FROZEN_NOT_EXECUTED';
  blockers:readonly string[];
  residencyPlanSha256:string|'UNKNOWN';
  blockProfileRosterSha256:string|'UNKNOWN';
  sparseBlockPolicySha256:string|'UNKNOWN';
  denseBaselineContentSha256:string|'UNKNOWN';
  runtimeRepresentationSha256:string|'UNKNOWN';
  hardwareClass:string|'UNKNOWN';
  totalDenseCoreWallClockUs:number|'UNKNOWN';
  candidateProfiles:readonly HsmeDenseBlockProfileV1[];
  maxConvertedBlockCount:number|'UNKNOWN';
  maxExpertsPerConvertedBlock:number|'UNKNOWN';
  maxActiveExpertsPerBlock:number|'UNKNOWN';
  maxRouterBytes:number|'UNKNOWN';
  maxSparseBlockPackageBytes:number|'UNKNOWN';
  qualityPreservationContractSha256:string|'UNKNOWN';
  minDenseWallClockShareBps:number|'UNKNOWN';
  planEvidenceSha256:string|'UNKNOWN';
  conversionExecutionAllowed:false;
  blockExecutionAllowed:false;
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

export class HsmeSelectiveSparseBlockPlanV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeSelectiveSparseBlockPlanV1Error';
    this.code=code;
  }
}

export function normalizeHsmeDenseBlockProfileRosterV1(
  raw:unknown,
):HsmeDenseBlockProfileRosterV1{
  const r=exactRecord(raw,[
    'schemaVersion','residencyPlanSha256','denseBaselineContentSha256',
    'runtimeRepresentationSha256','hardwareClass','totalDenseCoreWallClockUs',
    'profiles','realMeasuredEvidence','conversionExecutionAllowed',
    'modelInstallAllowed','modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed','productionAuthorityGranted',
    'providerAuthorityGranted','billingAuthorityGranted',
    'projectArtifactMutationAllowed','aeeExecutionAuthorityGranted',
    'winnerSelectionAllowed',
  ],'roster');
  if(r.schemaVersion!==HSME_DENSE_BLOCK_PROFILE_ROSTER_V1_SCHEMA){
    fail('hsme_sparse_block_roster_schema','block profile roster schema unsupported');
  }
  if(r.realMeasuredEvidence!==true){
    fail('hsme_sparse_block_roster_real','realMeasuredEvidence must be true');
  }
  assertNoAuthority(r,'roster');
  if(!Array.isArray(r.profiles)||r.profiles.length<1||r.profiles.length>512){
    fail('hsme_sparse_block_roster_profiles','profile count invalid');
  }
  const runtimeRepresentationSha256=sha256(
    r.runtimeRepresentationSha256,'roster.runtimeRepresentationSha256',
  );
  const hardwareClass=identifier(r.hardwareClass,'roster.hardwareClass',160);
  const profiles=r.profiles.map((value,index)=>normalizeBlockProfile(
    value,
    'roster.profiles['+index+']',
    runtimeRepresentationSha256,
    hardwareClass,
  )).sort((a,b)=>lexical(a.blockId,b.blockId));
  const ids=profiles.map(value=>value.blockId);
  const digests=profiles.map(value=>value.denseBlockContentSha256);
  if(new Set(ids).size!==ids.length||new Set(digests).size!==digests.length){
    fail('hsme_sparse_block_roster_duplicate','block id/content identity must be unique');
  }
  const totalDenseCoreWallClockUs=safeInteger(
    r.totalDenseCoreWallClockUs,
    'roster.totalDenseCoreWallClockUs',
    1,Number.MAX_SAFE_INTEGER,
  );
  const profiledWallClock=profiles.reduce(
    (sum,value)=>checkedAdd(sum,value.denseWallClockUs),
    0,
  );
  if(profiledWallClock>totalDenseCoreWallClockUs){
    fail(
      'hsme_sparse_block_roster_wallclock',
      'profiled block wall-clock cannot exceed total dense-core wall-clock',
    );
  }
  return deepFreeze({
    schemaVersion:HSME_DENSE_BLOCK_PROFILE_ROSTER_V1_SCHEMA,
    residencyPlanSha256:sha256(
      r.residencyPlanSha256,'roster.residencyPlanSha256',
    ),
    denseBaselineContentSha256:sha256(
      r.denseBaselineContentSha256,'roster.denseBaselineContentSha256',
    ),
    runtimeRepresentationSha256,
    hardwareClass,
    totalDenseCoreWallClockUs,
    profiles:Object.freeze(profiles),
    realMeasuredEvidence:true,
    ...authorityBoundary(),
  });
}

export function normalizeHsmeSelectiveSparseBlockPolicyV1(
  raw:unknown,
):HsmeSelectiveSparseBlockPolicyV1{
  const r=exactRecord(raw,[
    'schemaVersion','residencyPlanSha256','blockProfileRosterSha256',
    'candidateBlockIds','maxConvertedBlockCount','maxExpertsPerConvertedBlock',
    'maxActiveExpertsPerBlock','maxRouterBytes','maxSparseBlockPackageBytes',
    'qualityPreservationContractSha256','minDenseWallClockShareBps',
    'fullBackboneExpertAllowed','conversionExecutionAllowed',
    'blockExecutionAllowed','modelInstallAllowed','modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed','productionAuthorityGranted',
    'providerAuthorityGranted','billingAuthorityGranted',
    'projectArtifactMutationAllowed','aeeExecutionAuthorityGranted',
    'winnerSelectionAllowed',
  ],'policy');
  if(r.schemaVersion!==HSME_SELECTIVE_SPARSE_BLOCK_POLICY_V1_SCHEMA){
    fail('hsme_sparse_block_policy_schema','sparse block policy schema unsupported');
  }
  if(r.fullBackboneExpertAllowed!==false){
    fail('hsme_sparse_block_policy_backbone','full backbone experts are forbidden');
  }
  assertNoAuthority(r,'policy');
  if(!Array.isArray(r.candidateBlockIds)||r.candidateBlockIds.length<1||r.candidateBlockIds.length>64){
    fail('hsme_sparse_block_policy_candidates','candidate block ids invalid');
  }
  const candidateBlockIds=r.candidateBlockIds.map(
    (value,index)=>identifier(value,'policy.candidateBlockIds['+index+']',120),
  ).sort(lexical);
  if(new Set(candidateBlockIds).size!==candidateBlockIds.length){
    fail('hsme_sparse_block_policy_candidates','duplicate candidate block id');
  }
  const maxConvertedBlockCount=safeInteger(
    r.maxConvertedBlockCount,'policy.maxConvertedBlockCount',1,64,
  );
  if(candidateBlockIds.length>maxConvertedBlockCount){
    fail('hsme_sparse_block_policy_candidates','candidate count exceeds frozen max');
  }
  const maxExpertsPerConvertedBlock=safeInteger(
    r.maxExpertsPerConvertedBlock,'policy.maxExpertsPerConvertedBlock',1,4,
  );
  const maxActiveExpertsPerBlock=safeInteger(
    r.maxActiveExpertsPerBlock,'policy.maxActiveExpertsPerBlock',1,2,
  );
  if(maxActiveExpertsPerBlock>maxExpertsPerConvertedBlock){
    fail('hsme_sparse_block_policy_topk','active experts cannot exceed total experts');
  }
  return deepFreeze({
    schemaVersion:HSME_SELECTIVE_SPARSE_BLOCK_POLICY_V1_SCHEMA,
    residencyPlanSha256:sha256(
      r.residencyPlanSha256,'policy.residencyPlanSha256',
    ),
    blockProfileRosterSha256:sha256(
      r.blockProfileRosterSha256,'policy.blockProfileRosterSha256',
    ),
    candidateBlockIds:Object.freeze(candidateBlockIds),
    maxConvertedBlockCount,
    maxExpertsPerConvertedBlock,
    maxActiveExpertsPerBlock,
    maxRouterBytes:safeInteger(
      r.maxRouterBytes,'policy.maxRouterBytes',1,Number.MAX_SAFE_INTEGER,
    ),
    maxSparseBlockPackageBytes:safeInteger(
      r.maxSparseBlockPackageBytes,
      'policy.maxSparseBlockPackageBytes',
      1,Number.MAX_SAFE_INTEGER,
    ),
    qualityPreservationContractSha256:sha256(
      r.qualityPreservationContractSha256,
      'policy.qualityPreservationContractSha256',
    ),
    minDenseWallClockShareBps:safeInteger(
      r.minDenseWallClockShareBps,
      'policy.minDenseWallClockShareBps',
      1,10000,
    ),
    fullBackboneExpertAllowed:false,
    ...policyAuthorityBoundary(),
  });
}

export async function hsmeDenseBlockProfileRosterV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  return digest(
    HSME_DENSE_BLOCK_PROFILE_ROSTER_DIGEST_DOMAIN,
    normalizeHsmeDenseBlockProfileRosterV1(raw),
    hash,
  );
}
export async function hsmeSelectiveSparseBlockPolicyV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  return digest(
    HSME_SELECTIVE_SPARSE_BLOCK_POLICY_DIGEST_DOMAIN,
    normalizeHsmeSelectiveSparseBlockPolicyV1(raw),
    hash,
  );
}

export async function freezeHsmeSelectiveSparseBlockPlanV1(
  residencyPlan:HsmeAdaptiveResidencyExperimentPlanV1,
  expectedResidencyPlanSha256:string,
  planOrigin:HsmeSelectiveSparseBlockResidencyPlanOriginVerifierV1,
  rawRoster:unknown,
  expectedRosterSha256:string,
  rosterOrigin:HsmeDenseBlockProfileRosterOriginVerifierV1,
  rawPolicy:unknown,
  expectedPolicySha256:string,
  policyOrigin:HsmeSelectiveSparseBlockPolicyOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeSelectiveSparseBlockPlanV1>{
  if(
    residencyPlan.state!=='ADAPTIVE_RESIDENCY_PLAN_FROZEN_NOT_EXECUTED'
    ||residencyPlan.planEvidenceSha256==='UNKNOWN'
    ||residencyPlan.denseBaselineContentSha256==='UNKNOWN'
    ||residencyPlan.runtimeRepresentationSha256==='UNKNOWN'
    ||residencyPlan.hardwareClass==='UNKNOWN'
  ){
    return blocked(['SELECTIVE_SPARSE_BLOCK_READY_RESIDENCY_PLAN_REQUIRED']);
  }
  let planSha:string;
  try{
    planSha=await hsmeAdaptiveResidencyExperimentPlanV1Digest(
      residencyPlan,hash,
    );
  }catch{
    return invalid(['SELECTIVE_SPARSE_BLOCK_RESIDENCY_PLAN_REHASH_INVALID']);
  }
  const common={residencyPlanSha256:planSha};
  if(
    !exactDigest(
      expectedResidencyPlanSha256,
      planSha,
      residencyPlan.planEvidenceSha256,
    )
  ){
    return invalid(['SELECTIVE_SPARSE_BLOCK_RESIDENCY_PLAN_REHASH_MISMATCH'],common);
  }
  if(!await verify(()=>planOrigin.verifyResidencyPlan(residencyPlan,planSha))){
    return invalid(['SELECTIVE_SPARSE_BLOCK_RESIDENCY_PLAN_ORIGIN_UNVERIFIED'],common);
  }

  let roster:HsmeDenseBlockProfileRosterV1;
  let rosterSha:string;
  try{
    roster=normalizeHsmeDenseBlockProfileRosterV1(rawRoster);
    rosterSha=await hsmeDenseBlockProfileRosterV1Digest(roster,hash);
  }catch{
    return invalid(['SELECTIVE_SPARSE_BLOCK_PROFILE_ROSTER_INVALID'],common);
  }
  if(!exactDigest(expectedRosterSha256,rosterSha,rosterSha)){
    return invalid(['SELECTIVE_SPARSE_BLOCK_PROFILE_ROSTER_DIGEST_MISMATCH'],common);
  }
  if(!await verify(()=>rosterOrigin.verifyBlockProfileRoster(roster,rosterSha))){
    return invalid(['SELECTIVE_SPARSE_BLOCK_PROFILE_ROSTER_ORIGIN_UNVERIFIED'],{
      ...common,blockProfileRosterSha256:rosterSha,
    });
  }
  if(
    roster.residencyPlanSha256!==planSha
    ||roster.denseBaselineContentSha256!==
      residencyPlan.denseBaselineContentSha256
    ||roster.runtimeRepresentationSha256!==
      residencyPlan.runtimeRepresentationSha256
    ||roster.hardwareClass!==residencyPlan.hardwareClass
  ){
    return invalid(['SELECTIVE_SPARSE_BLOCK_PROFILE_ROSTER_BINDING_MISMATCH'],{
      ...common,blockProfileRosterSha256:rosterSha,
    });
  }

  let policy:HsmeSelectiveSparseBlockPolicyV1;
  let policySha:string;
  try{
    policy=normalizeHsmeSelectiveSparseBlockPolicyV1(rawPolicy);
    policySha=await hsmeSelectiveSparseBlockPolicyV1Digest(policy,hash);
  }catch{
    return invalid(['SELECTIVE_SPARSE_BLOCK_POLICY_INVALID'],{
      ...common,blockProfileRosterSha256:rosterSha,
    });
  }
  if(!exactDigest(expectedPolicySha256,policySha,policySha)){
    return invalid(['SELECTIVE_SPARSE_BLOCK_POLICY_DIGEST_MISMATCH'],{
      ...common,blockProfileRosterSha256:rosterSha,
    });
  }
  if(!await verify(()=>policyOrigin.verifySparseBlockPolicy(policy,policySha))){
    return invalid(['SELECTIVE_SPARSE_BLOCK_POLICY_ORIGIN_UNVERIFIED'],{
      ...common,blockProfileRosterSha256:rosterSha,
      sparseBlockPolicySha256:policySha,
    });
  }
  if(
    policy.residencyPlanSha256!==planSha
    ||policy.blockProfileRosterSha256!==rosterSha
  ){
    return invalid(['SELECTIVE_SPARSE_BLOCK_POLICY_BINDING_MISMATCH'],{
      ...common,blockProfileRosterSha256:rosterSha,
      sparseBlockPolicySha256:policySha,
    });
  }

  const candidateProfiles:HsmeDenseBlockProfileV1[]=[];
  for(const blockId of policy.candidateBlockIds){
    const profile=roster.profiles.find(value=>value.blockId===blockId);
    if(profile===undefined){
      return invalid(['SELECTIVE_SPARSE_BLOCK_CANDIDATE_NOT_MEASURED'],{
        ...common,blockProfileRosterSha256:rosterSha,
        sparseBlockPolicySha256:policySha,
      });
    }
    const shareBps=Math.trunc(
      (profile.denseWallClockUs/roster.totalDenseCoreWallClockUs)*10000,
    );
    if(shareBps<policy.minDenseWallClockShareBps){
      return invalid(['SELECTIVE_SPARSE_BLOCK_CANDIDATE_SHARE_TOO_SMALL'],{
        ...common,blockProfileRosterSha256:rosterSha,
        sparseBlockPolicySha256:policySha,
      });
    }
    candidateProfiles.push(profile);
  }

  const payload={
    schemaVersion:HSME_SELECTIVE_SPARSE_BLOCK_PLAN_V1_SCHEMA,
    state:'SELECTIVE_SPARSE_BLOCK_PLAN_FROZEN_NOT_EXECUTED' as const,
    blockers:Object.freeze([] as string[]),
    residencyPlanSha256:planSha,
    blockProfileRosterSha256:rosterSha,
    sparseBlockPolicySha256:policySha,
    denseBaselineContentSha256:roster.denseBaselineContentSha256,
    runtimeRepresentationSha256:roster.runtimeRepresentationSha256,
    hardwareClass:roster.hardwareClass,
    totalDenseCoreWallClockUs:roster.totalDenseCoreWallClockUs,
    candidateProfiles:Object.freeze(
      [...candidateProfiles].sort((a,b)=>lexical(a.blockId,b.blockId)),
    ),
    maxConvertedBlockCount:policy.maxConvertedBlockCount,
    maxExpertsPerConvertedBlock:policy.maxExpertsPerConvertedBlock,
    maxActiveExpertsPerBlock:policy.maxActiveExpertsPerBlock,
    maxRouterBytes:policy.maxRouterBytes,
    maxSparseBlockPackageBytes:policy.maxSparseBlockPackageBytes,
    qualityPreservationContractSha256:
      policy.qualityPreservationContractSha256,
    minDenseWallClockShareBps:policy.minDenseWallClockShareBps,
    ...policyAuthorityBoundary(),
  };
  const planEvidenceSha256=await digest(
    HSME_SELECTIVE_SPARSE_BLOCK_PLAN_DIGEST_DOMAIN,
    payload,hash,
  );
  return deepFreeze({...payload,planEvidenceSha256});
}

export async function hsmeSelectiveSparseBlockPlanV1Digest(
  value:HsmeSelectiveSparseBlockPlanV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  if(
    value.state!=='SELECTIVE_SPARSE_BLOCK_PLAN_FROZEN_NOT_EXECUTED'
    ||value.planEvidenceSha256==='UNKNOWN'
  ){
    fail('hsme_sparse_block_plan_digest_state','only FROZEN_NOT_EXECUTED plan is digestible');
  }
  const {planEvidenceSha256:_ignored,...payload}=value;
  return digest(HSME_SELECTIVE_SPARSE_BLOCK_PLAN_DIGEST_DOMAIN,payload,hash);
}

function normalizeBlockProfile(
  raw:unknown,
  path:string,
  expectedRuntimeSha:string,
  expectedHardware:string,
):HsmeDenseBlockProfileV1{
  const r=exactRecord(raw,[
    'blockId','denseBlockContentSha256','blockArchitectureSha256',
    'inputOutputContractSha256','denseWeightsBytes','denseActiveWeightsBytes',
    'denseActivationBytes','denseWallClockUs','denseFlashBytesMoved',
    'denseRamBytesMoved','denseAcceleratorBytesMoved',
    'denseKernelDispatchCount','densePeakMemoryBytes',
    'qualitySensitivityEvidenceSha256','runtimeRepresentationSha256',
    'hardwareClass',
  ],path);
  const runtimeSha=sha256(
    r.runtimeRepresentationSha256,path+'.runtimeRepresentationSha256',
  );
  const hardware=identifier(r.hardwareClass,path+'.hardwareClass',160);
  if(runtimeSha!==expectedRuntimeSha||hardware!==expectedHardware){
    fail('hsme_sparse_block_profile_runtime','profile runtime/hardware drift');
  }
  const weights=safeInteger(
    r.denseWeightsBytes,path+'.denseWeightsBytes',1,Number.MAX_SAFE_INTEGER,
  );
  const active=safeInteger(
    r.denseActiveWeightsBytes,
    path+'.denseActiveWeightsBytes',1,Number.MAX_SAFE_INTEGER,
  );
  if(active>weights){
    fail('hsme_sparse_block_profile_weights','active weights exceed total weights');
  }
  return deepFreeze({
    blockId:identifier(r.blockId,path+'.blockId',120),
    denseBlockContentSha256:sha256(
      r.denseBlockContentSha256,path+'.denseBlockContentSha256',
    ),
    blockArchitectureSha256:sha256(
      r.blockArchitectureSha256,path+'.blockArchitectureSha256',
    ),
    inputOutputContractSha256:sha256(
      r.inputOutputContractSha256,path+'.inputOutputContractSha256',
    ),
    denseWeightsBytes:weights,
    denseActiveWeightsBytes:active,
    denseActivationBytes:safeInteger(
      r.denseActivationBytes,path+'.denseActivationBytes',0,Number.MAX_SAFE_INTEGER,
    ),
    denseWallClockUs:safeInteger(
      r.denseWallClockUs,path+'.denseWallClockUs',1,Number.MAX_SAFE_INTEGER,
    ),
    denseFlashBytesMoved:safeInteger(
      r.denseFlashBytesMoved,path+'.denseFlashBytesMoved',0,Number.MAX_SAFE_INTEGER,
    ),
    denseRamBytesMoved:safeInteger(
      r.denseRamBytesMoved,path+'.denseRamBytesMoved',0,Number.MAX_SAFE_INTEGER,
    ),
    denseAcceleratorBytesMoved:safeInteger(
      r.denseAcceleratorBytesMoved,
      path+'.denseAcceleratorBytesMoved',0,Number.MAX_SAFE_INTEGER,
    ),
    denseKernelDispatchCount:safeInteger(
      r.denseKernelDispatchCount,path+'.denseKernelDispatchCount',1,1_000_000,
    ),
    densePeakMemoryBytes:safeInteger(
      r.densePeakMemoryBytes,path+'.densePeakMemoryBytes',1,Number.MAX_SAFE_INTEGER,
    ),
    qualitySensitivityEvidenceSha256:sha256(
      r.qualitySensitivityEvidenceSha256,
      path+'.qualitySensitivityEvidenceSha256',
    ),
    runtimeRepresentationSha256:runtimeSha,
    hardwareClass:hardware,
  });
}

type PartialOutput=Partial<Pick<
  HsmeSelectiveSparseBlockPlanV1,
  'residencyPlanSha256'|'blockProfileRosterSha256'
  |'sparseBlockPolicySha256'
>>;
function invalid(blockers:readonly string[],values:PartialOutput={}){
  return terminal('SELECTIVE_SPARSE_BLOCK_PLAN_INVALID',blockers,values);
}
function blocked(blockers:readonly string[],values:PartialOutput={}){
  return terminal('SELECTIVE_SPARSE_BLOCK_PLAN_BLOCKED',blockers,values);
}
function terminal(
  state:'SELECTIVE_SPARSE_BLOCK_PLAN_INVALID'|'SELECTIVE_SPARSE_BLOCK_PLAN_BLOCKED',
  blockers:readonly string[],values:PartialOutput,
):HsmeSelectiveSparseBlockPlanV1{
  return deepFreeze({
    schemaVersion:HSME_SELECTIVE_SPARSE_BLOCK_PLAN_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    residencyPlanSha256:values.residencyPlanSha256??'UNKNOWN',
    blockProfileRosterSha256:values.blockProfileRosterSha256??'UNKNOWN',
    sparseBlockPolicySha256:values.sparseBlockPolicySha256??'UNKNOWN',
    denseBaselineContentSha256:'UNKNOWN',
    runtimeRepresentationSha256:'UNKNOWN',
    hardwareClass:'UNKNOWN',
    totalDenseCoreWallClockUs:'UNKNOWN',
    candidateProfiles:Object.freeze([]),
    maxConvertedBlockCount:'UNKNOWN',
    maxExpertsPerConvertedBlock:'UNKNOWN',
    maxActiveExpertsPerBlock:'UNKNOWN',
    maxRouterBytes:'UNKNOWN',
    maxSparseBlockPackageBytes:'UNKNOWN',
    qualityPreservationContractSha256:'UNKNOWN',
    minDenseWallClockShareBps:'UNKNOWN',
    planEvidenceSha256:'UNKNOWN',
    ...policyAuthorityBoundary(),
  });
}
function authorityBoundary(){
  return Object.freeze({
    conversionExecutionAllowed:false as const,
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
function policyAuthorityBoundary(){
  return Object.freeze({
    conversionExecutionAllowed:false as const,
    blockExecutionAllowed:false as const,
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
  const keys=Object.hasOwn(r,'blockExecutionAllowed')
    ?Object.keys(policyAuthorityBoundary())
    :Object.keys(authorityBoundary());
  for(const key of keys){
    if(r[key]!==false){
      fail('hsme_sparse_block_authority',path+'.'+key+' authority widening');
    }
  }
}
function exactDigest(expected:string,actual:string,embedded:string|'UNKNOWN'):boolean{
  return HEX64.test(expected)&&expected===actual&&embedded===actual;
}
function checkedAdd(a:number,b:number):number{
  const v=a+b;
  if(!Number.isSafeInteger(v)||v<0){
    fail('hsme_sparse_block_value','safe integer overflow');
  }
  return v;
}
function exactRecord(raw:unknown,fields:readonly string[],path:string):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail('hsme_sparse_block_schema',path+' must be object');
  }
  const r=raw as Record<string,unknown>,keys=Object.keys(r);
  if(keys.length!==fields.length||keys.some(k=>!fields.includes(k))||fields.some(k=>!Object.hasOwn(r,k))){
    fail('hsme_sparse_block_schema',path+' unknown or missing fields');
  }
  return r;
}
function identifier(raw:unknown,path:string,max:number):string{
  if(typeof raw!=='string'||raw.length<1||raw.length>max||!IDENTIFIER.test(raw)){
    fail('hsme_sparse_block_value',path+' invalid identifier');
  }
  return raw;
}
function sha256(raw:unknown,path:string):string{
  if(typeof raw!=='string'||!HEX64.test(raw)){
    fail('hsme_sparse_block_value',path+' invalid SHA-256');
  }
  return raw;
}
function safeInteger(raw:unknown,path:string,min:number,max:number):number{
  if(!Number.isSafeInteger(raw)||(raw as number)<min||(raw as number)>max){
    fail('hsme_sparse_block_value',path+' invalid integer');
  }
  return raw as number;
}
async function digest(domain:string,value:unknown,hash:HsmeDenseBaselineHashPortV1):Promise<string>{
  const d=await hash.sha256(new TextEncoder().encode(domain+JSON.stringify(value)));
  if(!HEX64.test(d)) fail('hsme_sparse_block_hash','hash port invalid');
  return d;
}
async function verify(run:()=>Promise<boolean>):Promise<boolean>{
  try{return await run()===true;}catch{return false;}
}
function lexical(a:string,b:string):number{return a<b?-1:a>b?1:0;}
function deepFreeze<T>(value:T):T{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const child of Object.values(value as Record<string,unknown>)) deepFreeze(child);
  }
  return value;
}
function fail(code:string,message:string):never{
  throw new HsmeSelectiveSparseBlockPlanV1Error(code,message);
}
