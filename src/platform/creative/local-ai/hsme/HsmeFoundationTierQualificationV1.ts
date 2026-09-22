import {
  normalizeHsmeFoundationBenchmarkCandidateTrustV1,
} from './HsmeFoundationBenchmarkCandidateTrustV1';
import {
  normalizeHsmeFoundationBenchmarkRunEvidenceV1,
  type HsmeFoundationBenchmarkRunHashPortV1,
} from './HsmeFoundationBenchmarkRunEvidenceV1';
import {
  hsmeFoundationQualityFrontierV1Digest,
  proveHsmeFoundationQualityFrontierV1,
} from './HsmeFoundationQualityFrontierV1';
import {
  hsmeFoundationResourceEvidenceV1Digest,
  hsmeFoundationRuntimeInventoryStableJsonV1,
  normalizeHsmeFoundationRuntimeInventoryV1,
  proveHsmeFoundationResourceEvidenceV1,
  type HsmeFoundationResourceEvidenceProofRecordV1,
} from './HsmeFoundationResourceEvidenceV1';
import {
  hsmeFoundationParetoEfficiencyV1Digest,
  proveHsmeFoundationParetoEfficiencyV1,
} from './HsmeFoundationParetoEfficiencyV1';

export const HSME_FOUNDATION_TIER_QUALIFICATION_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_TIER_QUALIFICATION_V1' as const;
export const HSME_FOUNDATION_TIER_QUALIFICATION_DIGEST_DOMAIN =
  'bers:hsme:foundation-tier-qualification:v1\0' as const;
export const HSME_FOUNDATION_TIER_BUDGET_POLICY_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_TIER_BUDGET_POLICY_V1' as const;
export const HSME_FOUNDATION_TARGET_TIER_EVIDENCE_SET_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_TARGET_TIER_EVIDENCE_SET_V1' as const;
export const HSME_FOUNDATION_TARGET_TIER_EVIDENCE_DIGEST_DOMAIN =
  'bers:hsme:foundation-target-tier-evidence:v1\0' as const;
export const HSME_FOUNDATION_TIER_BUDGET_POLICY_DIGEST_DOMAIN =
  'bers:hsme:foundation-tier-budget-policy:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const CAPABILITIES=Object.freeze(['TEXT_TO_IMAGE','IMAGE_EDITING'] as const);
const TARGET_TIERS=Object.freeze(['MOBILE_DEFAULT','DESKTOP_HIGH_END'] as const);
const TARGET_HARDWARE_CLASSES=Object.freeze(['MOBILE_TARGET_DEVICE','DESKTOP_HIGH_END_TARGET'] as const);
const REPRESENTATION_KINDS=Object.freeze(['IDENTICAL_REFERENCE_ARTIFACTS','TARGET_SPECIFIC_REPRESENTATION'] as const);

type Capability=typeof CAPABILITIES[number];
type TargetTier=typeof TARGET_TIERS[number];
type TargetHardwareClass=typeof TARGET_HARDWARE_CLASSES[number];
type RepresentationKind=typeof REPRESENTATION_KINDS[number];

export type HsmeFoundationTierBudgetPolicyV1=Readonly<{
  schemaVersion:typeof HSME_FOUNDATION_TIER_BUDGET_POLICY_V1_SCHEMA;
  policyId:string;
  targetTier:TargetTier;
  maxInstalledBytes:number;
  maxWorkingMemoryBytes:number;
  maxColdEndToEndLatencyMicros:number;
  maxWarmEndToEndLatencyMicros:number;
  productionAuthorityGranted:false;
  winnerSelectionAllowed:false;
}>;

export type HsmeFoundationTargetTierEvidenceV1=Readonly<{
  candidateId:string;
  capability:Capability;
  targetTier:TargetTier;
  sourceModelContentSha256:string;
  sourceExecutionProfileSha256:string;
  representationKind:RepresentationKind;
  representationContentSha256:string;
  representationEvidenceSha256:string;
  runtimeInventory:ReturnType<typeof normalizeHsmeFoundationRuntimeInventoryV1>;
  targetRuntimeProfileSha256:string;
  targetHardwareClass:TargetHardwareClass;
  workingMemoryKind:'TARGET_PEAK_WORKING_SET_BYTES';
  peakWorkingMemoryBytes:number;
  coldEndToEndLatencyMicros:number;
  warmEndToEndLatencyMicros:number;
  hardwareProfileSha256:string;
  measurementMethodSha256:string;
  measurementEvidenceSha256:string;
  budgetPolicySha256:string;
  productionAuthorityGranted:false;
  winnerSelectionAllowed:false;
}>;

export type HsmeFoundationTargetTierEvidenceSetV1=Readonly<{
  schemaVersion:typeof HSME_FOUNDATION_TARGET_TIER_EVIDENCE_SET_V1_SCHEMA;
  records:readonly HsmeFoundationTargetTierEvidenceV1[];
  productionAuthorityGranted:false;
  winnerSelectionAllowed:false;
}>;

export type HsmeFoundationTierCandidateQualificationV1=Readonly<{
  candidateId:string;
  referenceEvidenceState:'REFERENCE_EVIDENCE_READY';
  referenceHardwareBackendClass:string;
  referenceRuntimeInventorySha256:string;
  referenceMandatoryInstalledBytes:number;
  referenceWorkingMemoryKind:'CUDA_PEAK_RESERVED_BYTES';
  referencePeakWorkingMemoryBytes:number;
  targetQualificationState:
    | 'TARGET_POLICY_AND_EVIDENCE_REQUIRED'
    | 'TARGET_EVIDENCE_REQUIRED'
    | 'TARGET_BUDGET_EXCEEDED'
    | 'MOBILE_DEFAULT_EVIDENCE_READY'
    | 'DESKTOP_HIGH_END_EVIDENCE_READY';
  installedBytesSource:
    | 'NOT_PROVEN_FOR_TARGET'
    | 'REUSED_EXACT_REFERENCE_ARTIFACTS'
    | 'MEASURED_TARGET_ARTIFACTS';
  targetRuntimeInventorySha256:string|'UNKNOWN';
  targetMandatoryInstalledBytes:number|'UNKNOWN';
  targetWorkingMemoryBytes:number|'UNKNOWN';
  targetColdEndToEndLatencyMicros:number|'UNKNOWN';
  targetWarmEndToEndLatencyMicros:number|'UNKNOWN';
  targetEvidenceSha256:string|'UNKNOWN';
}>;

export type HsmeFoundationTierQualificationSliceV1=Readonly<{
  sliceId:string;
  capability:Capability;
  qualityState:'QUALITY_BLOCKED'|'QUALITY_READY';
  targetTier:TargetTier|'UNSPECIFIED';
  qualityPreferredCandidateIds:readonly string[];
  candidates:readonly HsmeFoundationTierCandidateQualificationV1[];
}>;

export type HsmeFoundationTierQualificationV1=Readonly<{
  schemaVersion:typeof HSME_FOUNDATION_TIER_QUALIFICATION_V1_SCHEMA;
  campaignId:string;
  qualityFrontierSha256:string;
  resourceEvidenceSha256:string;
  paretoEvidenceSha256:string;
  budgetPolicySha256:string|'UNKNOWN';
  qualityPolicy:'QUALITY_FLOOR_BEFORE_EFFICIENCY';
  slices:readonly HsmeFoundationTierQualificationSliceV1[];
  cudaReferenceEvidenceMaySatisfyMobileMemoryBudget:false;
  paretoMayGrantDeploymentTier:false;
  selectedCandidateIdAllowed:false;
  reuseAdvanceAllowed:false;
  fullStudentEscalationAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
  durableModelFleetPromotionAllowed:false;
  trainingOrDistillationAllowed:false;
  winnerSelectionAllowed:false;
}>;

export class HsmeFoundationTierQualificationV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeFoundationTierQualificationV1Error';
    this.code=code;
  }
}

export async function proveHsmeFoundationTierQualificationV1(
  rawCampaign:unknown,
  rawTrust:unknown,
  rawFixturePlan:unknown,
  rawFixturePackEvidence:unknown,
  rawQualityRubric:unknown,
  rawRunEvidence:unknown,
  rawAssessmentEvidence:unknown,
  rawResourceEvidence:unknown,
  rawBudgetPolicy:unknown|null,
  rawTargetEvidenceSet:unknown|null,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<HsmeFoundationTierQualificationV1>{
  const trust=normalizeHsmeFoundationBenchmarkCandidateTrustV1(rawTrust);
  const runEvidence=normalizeHsmeFoundationBenchmarkRunEvidenceV1(rawRunEvidence);
  const frontier=await proveHsmeFoundationQualityFrontierV1(
    rawCampaign,rawTrust,rawFixturePlan,rawFixturePackEvidence,rawQualityRubric,
    rawRunEvidence,rawAssessmentEvidence,hash,
  );
  const resource=await proveHsmeFoundationResourceEvidenceV1(
    rawCampaign,rawTrust,rawFixturePlan,rawFixturePackEvidence,rawRunEvidence,
    rawResourceEvidence,hash,
  );
  const pareto=await proveHsmeFoundationParetoEfficiencyV1(
    rawCampaign,rawTrust,rawFixturePlan,rawFixturePackEvidence,rawQualityRubric,
    rawRunEvidence,rawAssessmentEvidence,rawResourceEvidence,hash,
  );

  const qualityFrontierSha256=await hsmeFoundationQualityFrontierV1Digest(frontier,hash);
  const resourceEvidenceSha256=await hsmeFoundationResourceEvidenceV1Digest(resource,hash);
  const paretoEvidenceSha256=await hsmeFoundationParetoEfficiencyV1Digest(pareto,hash);

  if(frontier.campaignId!==resource.campaignId||frontier.campaignId!==pareto.campaignId||frontier.campaignId!==trust.campaignId){
    fail('hsme_tier_campaign_mismatch','quality/resource/Pareto/trust campaign mismatch');
  }
  if(pareto.deploymentTierAdmissionGranted!==false){
    fail('hsme_tier_pareto_authority','Pareto evidence cannot grant deployment tier');
  }

  const budget=rawBudgetPolicy===null?null:normalizeBudgetPolicy(rawBudgetPolicy);
  const budgetPolicySha256=budget
    ? await digestDomain(HSME_FOUNDATION_TIER_BUDGET_POLICY_DIGEST_DOMAIN,JSON.stringify(budget),hash)
    : 'UNKNOWN';
  const targetSet=rawTargetEvidenceSet===null
    ? deepFreeze({schemaVersion:HSME_FOUNDATION_TARGET_TIER_EVIDENCE_SET_V1_SCHEMA,records:Object.freeze([]),productionAuthorityGranted:false,winnerSelectionAllowed:false})
    : normalizeTargetEvidenceSet(rawTargetEvidenceSet);
  if(!budget&&targetSet.records.length>0){
    fail('hsme_tier_target_without_budget','target evidence requires an explicit budget policy');
  }

  const eligibleKeys=new Set<string>();
  for(const slice of frontier.slices){
    if(slice.state==='FULL_QUALITY_FRONTIER'){
      for(const candidateId of slice.qualityPreferredCandidateIds){
        eligibleKeys.add(key(candidateId,slice.capability));
      }
    }
  }
  for(const record of targetSet.records){
    const k=key(record.candidateId,record.capability);
    if(!eligibleKeys.has(k)){
      fail('hsme_tier_target_not_quality_preferred','target evidence may exist only for quality-preferred candidate/capability');
    }
    if(!budget||record.targetTier!==budget.targetTier){
      fail('hsme_tier_target_policy_tier','target evidence tier differs from budget policy');
    }
    if(record.budgetPolicySha256!==budgetPolicySha256){
      fail('hsme_tier_budget_digest','target evidence budget policy digest mismatch');
    }
  }

  const slices:HsmeFoundationTierQualificationSliceV1[]=[];
  for(const slice of frontier.slices){
    if(slice.state!=='FULL_QUALITY_FRONTIER'){
      if(targetSet.records.some(record=>record.capability===slice.capability)){
        fail('hsme_tier_target_quality_blocked','target evidence cannot bypass blocked quality slice');
      }
      slices.push(deepFreeze({
        sliceId:slice.sliceId,
        capability:slice.capability,
        qualityState:'QUALITY_BLOCKED' as const,
        targetTier:budget?.targetTier??'UNSPECIFIED',
        qualityPreferredCandidateIds:Object.freeze([]),
        candidates:Object.freeze([]),
      }));
      continue;
    }

    const preferred=[...slice.qualityPreferredCandidateIds].sort(lexical);
    const candidates:HsmeFoundationTierCandidateQualificationV1[]=[];
    for(const candidateId of preferred){
      const reference=findReferenceResource(resource.records,candidateId,slice.capability);
      const run=runEvidence.runs.find(value=>value.candidateId===candidateId&&value.capability===slice.capability);
      if(!run||run.status!=='COMPLETE'){
        fail('hsme_tier_run_missing','quality-preferred candidate lacks COMPLETE canonical run');
      }
      const trustCandidate=trust.candidates.find(value=>value.candidateId===candidateId);
      if(!trustCandidate){
        fail('hsme_tier_trust_missing','quality-preferred candidate lacks trust entry');
      }
      const hardwareBackendClass=trustCandidate.executionProfile.hardwareBackendClass;
      if(typeof hardwareBackendClass!=='string'||!hardwareBackendClass.startsWith('CUDA_')){
        fail('hsme_tier_reference_backend','current benchmark resource evidence must remain CUDA reference evidence');
      }
      if(reference.workingMemoryKind!=='CUDA_PEAK_RESERVED_BYTES'){
        fail('hsme_tier_reference_memory_kind','reference evidence must use CUDA_PEAK_RESERVED_BYTES');
      }

      const target=targetSet.records.find(value=>value.candidateId===candidateId&&value.capability===slice.capability);
      if(!budget){
        candidates.push(freezeQualification(candidateId,hardwareBackendClass,reference,{
          targetQualificationState:'TARGET_POLICY_AND_EVIDENCE_REQUIRED',
          installedBytesSource:'NOT_PROVEN_FOR_TARGET',
        }));
        continue;
      }
      if(!target){
        candidates.push(freezeQualification(candidateId,hardwareBackendClass,reference,{
          targetQualificationState:'TARGET_EVIDENCE_REQUIRED',
          installedBytesSource:'NOT_PROVEN_FOR_TARGET',
        }));
        continue;
      }

      if(target.sourceModelContentSha256!==run.modelContentSha256||target.sourceExecutionProfileSha256!==run.executionProfileSha256){
        fail('hsme_tier_target_source_identity','target evidence source model/profile differs from canonical run');
      }
      const requiredHardwareClass=budget.targetTier==='MOBILE_DEFAULT'?'MOBILE_TARGET_DEVICE':'DESKTOP_HIGH_END_TARGET';
      if(target.targetHardwareClass!==requiredHardwareClass){
        fail('hsme_tier_target_hardware_class','target hardware class differs from requested tier');
      }
      if(target.workingMemoryKind!=='TARGET_PEAK_WORKING_SET_BYTES'){
        fail('hsme_tier_target_memory_kind','target evidence cannot reuse CUDA working-memory semantics');
      }

      const inventory=normalizeHsmeFoundationRuntimeInventoryV1(target.runtimeInventory);
      if(inventory.candidateId!==candidateId){
        fail('hsme_tier_target_inventory_candidate','target runtime inventory candidate mismatch');
      }
      const targetRuntimeInventorySha256=await digestRaw(
        hsmeFoundationRuntimeInventoryStableJsonV1(inventory),
        hash,
      );
      const targetMandatoryInstalledBytes=sumSafe(inventory.artifacts.map(value=>value.bytes),'targetMandatoryInstalledBytes');

      let installedBytesSource:'REUSED_EXACT_REFERENCE_ARTIFACTS'|'MEASURED_TARGET_ARTIFACTS';
      if(target.representationKind==='IDENTICAL_REFERENCE_ARTIFACTS'){
        if(target.representationContentSha256!==run.modelContentSha256){
          fail('hsme_tier_representation_identity','identical representation must retain source model content digest');
        }
        if(targetRuntimeInventorySha256!==reference.runtimeInventorySha256){
          fail('hsme_tier_inventory_identity','identical representation must retain exact runtime inventory digest');
        }
        if(targetMandatoryInstalledBytes!==reference.mandatoryInstalledBytes){
          fail('hsme_tier_installed_identity','identical representation installed bytes drift');
        }
        installedBytesSource='REUSED_EXACT_REFERENCE_ARTIFACTS';
      }else{
        installedBytesSource='MEASURED_TARGET_ARTIFACTS';
      }

      const targetEvidenceSha256=await digestDomain(
        HSME_FOUNDATION_TARGET_TIER_EVIDENCE_DIGEST_DOMAIN,
        JSON.stringify(target),
        hash,
      );
      const withinBudget=
        targetMandatoryInstalledBytes<=budget.maxInstalledBytes
        && target.peakWorkingMemoryBytes<=budget.maxWorkingMemoryBytes
        && target.coldEndToEndLatencyMicros<=budget.maxColdEndToEndLatencyMicros
        && target.warmEndToEndLatencyMicros<=budget.maxWarmEndToEndLatencyMicros;
      const state=withinBudget
        ? (budget.targetTier==='MOBILE_DEFAULT'?'MOBILE_DEFAULT_EVIDENCE_READY':'DESKTOP_HIGH_END_EVIDENCE_READY')
        : 'TARGET_BUDGET_EXCEEDED';

      candidates.push(freezeQualification(candidateId,hardwareBackendClass,reference,{
        targetQualificationState:state,
        installedBytesSource,
        targetRuntimeInventorySha256,
        targetMandatoryInstalledBytes,
        targetWorkingMemoryBytes:target.peakWorkingMemoryBytes,
        targetColdEndToEndLatencyMicros:target.coldEndToEndLatencyMicros,
        targetWarmEndToEndLatencyMicros:target.warmEndToEndLatencyMicros,
        targetEvidenceSha256,
      }));
    }
    candidates.sort((a,b)=>lexical(a.candidateId,b.candidateId));
    slices.push(deepFreeze({
      sliceId:slice.sliceId,
      capability:slice.capability,
      qualityState:'QUALITY_READY' as const,
      targetTier:budget?.targetTier??'UNSPECIFIED',
      qualityPreferredCandidateIds:Object.freeze(preferred),
      candidates:Object.freeze(candidates),
    }));
  }
  slices.sort((a,b)=>lexical(a.sliceId,b.sliceId));

  return deepFreeze({
    schemaVersion:HSME_FOUNDATION_TIER_QUALIFICATION_V1_SCHEMA,
    campaignId:frontier.campaignId,
    qualityFrontierSha256,
    resourceEvidenceSha256,
    paretoEvidenceSha256,
    budgetPolicySha256,
    qualityPolicy:'QUALITY_FLOOR_BEFORE_EFFICIENCY',
    slices:Object.freeze(slices),
    cudaReferenceEvidenceMaySatisfyMobileMemoryBudget:false,
    paretoMayGrantDeploymentTier:false,
    selectedCandidateIdAllowed:false,
    reuseAdvanceAllowed:false,
    fullStudentEscalationAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    durableModelFleetPromotionAllowed:false,
    trainingOrDistillationAllowed:false,
    winnerSelectionAllowed:false,
  });
}

export async function hsmeFoundationTierQualificationV1Digest(
  raw:HsmeFoundationTierQualificationV1,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<string>{
  return digestDomain(HSME_FOUNDATION_TIER_QUALIFICATION_DIGEST_DOMAIN,JSON.stringify(raw),hash);
}

export async function hsmeFoundationTierBudgetPolicyV1Digest(
  raw:unknown,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<string>{
  return digestDomain(HSME_FOUNDATION_TIER_BUDGET_POLICY_DIGEST_DOMAIN,JSON.stringify(normalizeBudgetPolicy(raw)),hash);
}

export function normalizeHsmeFoundationTierBudgetPolicyV1(raw:unknown):HsmeFoundationTierBudgetPolicyV1{
  return normalizeBudgetPolicy(raw);
}

export function normalizeHsmeFoundationTargetTierEvidenceSetV1(raw:unknown):HsmeFoundationTargetTierEvidenceSetV1{
  return normalizeTargetEvidenceSet(raw);
}

function normalizeBudgetPolicy(raw:unknown):HsmeFoundationTierBudgetPolicyV1{
  const record=exactRecord(raw,[
    'schemaVersion','policyId','targetTier','maxInstalledBytes','maxWorkingMemoryBytes',
    'maxColdEndToEndLatencyMicros','maxWarmEndToEndLatencyMicros',
    'productionAuthorityGranted','winnerSelectionAllowed',
  ],'budgetPolicy');
  if(record.schemaVersion!==HSME_FOUNDATION_TIER_BUDGET_POLICY_V1_SCHEMA){
    fail('hsme_tier_budget_schema','budget policy schema mismatch');
  }
  if(record.productionAuthorityGranted!==false||record.winnerSelectionAllowed!==false){
    fail('hsme_tier_budget_authority','budget policy authority must remain false');
  }
  return deepFreeze({
    schemaVersion:HSME_FOUNDATION_TIER_BUDGET_POLICY_V1_SCHEMA,
    policyId:identifier(record.policyId,'budgetPolicy.policyId',160),
    targetTier:enumValue(record.targetTier,TARGET_TIERS,'budgetPolicy.targetTier'),
    maxInstalledBytes:safeInteger(record.maxInstalledBytes,'budgetPolicy.maxInstalledBytes',1,Number.MAX_SAFE_INTEGER),
    maxWorkingMemoryBytes:safeInteger(record.maxWorkingMemoryBytes,'budgetPolicy.maxWorkingMemoryBytes',1,Number.MAX_SAFE_INTEGER),
    maxColdEndToEndLatencyMicros:safeInteger(record.maxColdEndToEndLatencyMicros,'budgetPolicy.maxColdEndToEndLatencyMicros',1,Number.MAX_SAFE_INTEGER),
    maxWarmEndToEndLatencyMicros:safeInteger(record.maxWarmEndToEndLatencyMicros,'budgetPolicy.maxWarmEndToEndLatencyMicros',1,Number.MAX_SAFE_INTEGER),
    productionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  });
}

function normalizeTargetEvidenceSet(raw:unknown):HsmeFoundationTargetTierEvidenceSetV1{
  const set=exactRecord(raw,['schemaVersion','records','productionAuthorityGranted','winnerSelectionAllowed'],'targetEvidenceSet');
  if(set.schemaVersion!==HSME_FOUNDATION_TARGET_TIER_EVIDENCE_SET_V1_SCHEMA){
    fail('hsme_tier_target_schema','target evidence set schema mismatch');
  }
  if(set.productionAuthorityGranted!==false||set.winnerSelectionAllowed!==false){
    fail('hsme_tier_target_authority','target evidence set authority must remain false');
  }
  if(!Array.isArray(set.records)||set.records.length>16){
    fail('hsme_tier_target_records','target evidence set records invalid');
  }
  const records=set.records.map((value,index)=>normalizeTargetEvidence(value,'targetEvidenceSet.records['+index+']'));
  const keys=records.map(value=>key(value.candidateId,value.capability));
  if(new Set(keys).size!==keys.length)fail('hsme_tier_target_duplicate','target evidence candidate/capability must be unique');
  return deepFreeze({
    schemaVersion:HSME_FOUNDATION_TARGET_TIER_EVIDENCE_SET_V1_SCHEMA,
    records:Object.freeze(records.sort((a,b)=>lexical(key(a.candidateId,a.capability),key(b.candidateId,b.capability)))),
    productionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  });
}

function normalizeTargetEvidence(raw:unknown,path:string):HsmeFoundationTargetTierEvidenceV1{
  const record=exactRecord(raw,[
    'candidateId','capability','targetTier','sourceModelContentSha256','sourceExecutionProfileSha256',
    'representationKind','representationContentSha256','representationEvidenceSha256','runtimeInventory',
    'targetRuntimeProfileSha256','targetHardwareClass','workingMemoryKind','peakWorkingMemoryBytes',
    'coldEndToEndLatencyMicros','warmEndToEndLatencyMicros','hardwareProfileSha256','measurementMethodSha256',
    'measurementEvidenceSha256','budgetPolicySha256','productionAuthorityGranted','winnerSelectionAllowed',
  ],path);
  if(record.productionAuthorityGranted!==false||record.winnerSelectionAllowed!==false){
    fail('hsme_tier_target_record_authority',path+' authority must remain false');
  }
  return deepFreeze({
    candidateId:identifier(record.candidateId,path+'.candidateId',120),
    capability:enumValue(record.capability,CAPABILITIES,path+'.capability'),
    targetTier:enumValue(record.targetTier,TARGET_TIERS,path+'.targetTier'),
    sourceModelContentSha256:sha256(record.sourceModelContentSha256,path+'.sourceModelContentSha256'),
    sourceExecutionProfileSha256:sha256(record.sourceExecutionProfileSha256,path+'.sourceExecutionProfileSha256'),
    representationKind:enumValue(record.representationKind,REPRESENTATION_KINDS,path+'.representationKind'),
    representationContentSha256:sha256(record.representationContentSha256,path+'.representationContentSha256'),
    representationEvidenceSha256:sha256(record.representationEvidenceSha256,path+'.representationEvidenceSha256'),
    runtimeInventory:normalizeHsmeFoundationRuntimeInventoryV1(record.runtimeInventory),
    targetRuntimeProfileSha256:sha256(record.targetRuntimeProfileSha256,path+'.targetRuntimeProfileSha256'),
    targetHardwareClass:enumValue(record.targetHardwareClass,TARGET_HARDWARE_CLASSES,path+'.targetHardwareClass'),
    workingMemoryKind:literal(record.workingMemoryKind,'TARGET_PEAK_WORKING_SET_BYTES',path+'.workingMemoryKind'),
    peakWorkingMemoryBytes:safeInteger(record.peakWorkingMemoryBytes,path+'.peakWorkingMemoryBytes',1,Number.MAX_SAFE_INTEGER),
    coldEndToEndLatencyMicros:safeInteger(record.coldEndToEndLatencyMicros,path+'.coldEndToEndLatencyMicros',1,Number.MAX_SAFE_INTEGER),
    warmEndToEndLatencyMicros:safeInteger(record.warmEndToEndLatencyMicros,path+'.warmEndToEndLatencyMicros',1,Number.MAX_SAFE_INTEGER),
    hardwareProfileSha256:sha256(record.hardwareProfileSha256,path+'.hardwareProfileSha256'),
    measurementMethodSha256:sha256(record.measurementMethodSha256,path+'.measurementMethodSha256'),
    measurementEvidenceSha256:sha256(record.measurementEvidenceSha256,path+'.measurementEvidenceSha256'),
    budgetPolicySha256:sha256(record.budgetPolicySha256,path+'.budgetPolicySha256'),
    productionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  });
}

function findReferenceResource(
  records:readonly HsmeFoundationResourceEvidenceProofRecordV1[],
  candidateId:string,
  capability:Capability,
):HsmeFoundationResourceEvidenceProofRecordV1{
  const record=records.find(value=>value.candidateId===candidateId&&value.capability===capability);
  if(!record)fail('hsme_tier_reference_resource_missing','quality-preferred candidate lacks reference resource evidence');
  return record;
}

function freezeQualification(
  candidateId:string,
  hardwareBackendClass:string,
  reference:HsmeFoundationResourceEvidenceProofRecordV1,
  target:Partial<HsmeFoundationTierCandidateQualificationV1>&{
    targetQualificationState:HsmeFoundationTierCandidateQualificationV1['targetQualificationState'];
    installedBytesSource:HsmeFoundationTierCandidateQualificationV1['installedBytesSource'];
  },
):HsmeFoundationTierCandidateQualificationV1{
  return deepFreeze({
    candidateId,
    referenceEvidenceState:'REFERENCE_EVIDENCE_READY',
    referenceHardwareBackendClass:hardwareBackendClass,
    referenceRuntimeInventorySha256:reference.runtimeInventorySha256,
    referenceMandatoryInstalledBytes:reference.mandatoryInstalledBytes,
    referenceWorkingMemoryKind:'CUDA_PEAK_RESERVED_BYTES',
    referencePeakWorkingMemoryBytes:reference.peakWorkingMemoryBytes,
    targetQualificationState:target.targetQualificationState,
    installedBytesSource:target.installedBytesSource,
    targetRuntimeInventorySha256:target.targetRuntimeInventorySha256??'UNKNOWN',
    targetMandatoryInstalledBytes:target.targetMandatoryInstalledBytes??'UNKNOWN',
    targetWorkingMemoryBytes:target.targetWorkingMemoryBytes??'UNKNOWN',
    targetColdEndToEndLatencyMicros:target.targetColdEndToEndLatencyMicros??'UNKNOWN',
    targetWarmEndToEndLatencyMicros:target.targetWarmEndToEndLatencyMicros??'UNKNOWN',
    targetEvidenceSha256:target.targetEvidenceSha256??'UNKNOWN',
  });
}

async function digestRaw(
  payload:string,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<string>{
  const digest=await hash.sha256(new TextEncoder().encode(payload));
  if(!HEX64.test(digest))fail('hsme_tier_hash_port','hash port must return lowercase SHA-256');
  return digest;
}
async function digestDomain(
  domain:string,
  payload:string,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<string>{
  const digest=await hash.sha256(new TextEncoder().encode(domain+payload));
  if(!HEX64.test(digest))fail('hsme_tier_hash_port','hash port must return lowercase SHA-256');
  return digest;
}
function sumSafe(values:readonly number[],path:string):number{
  let total=0;
  for(const value of values){
    total+=value;
    if(!Number.isSafeInteger(total))fail('hsme_tier_integer_overflow',path+' overflow');
  }
  return total;
}
function exactRecord(raw:unknown,allowed:readonly string[],path:string):Record<string,any>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('hsme_tier_record',path+' must be object');
  const record=raw as Record<string,any>;
  for(const key of Object.keys(record))if(!allowed.includes(key))fail('hsme_tier_field_unknown',path+'.'+key+' is not allowed');
  for(const key of allowed)if(!Object.hasOwn(record,key))fail('hsme_tier_field_missing',path+'.'+key+' is required');
  return record;
}
function enumValue<T extends readonly string[]>(value:unknown,values:T,path:string):T[number]{
  if(typeof value!=='string'||!values.includes(value as T[number]))fail('hsme_tier_enum',path+' invalid');
  return value as T[number];
}
function literal<T extends string>(value:unknown,expected:T,path:string):T{
  if(value!==expected)fail('hsme_tier_literal',path+' must equal '+expected);
  return expected;
}
function identifier(value:unknown,path:string,max:number):string{
  if(typeof value!=='string'||value.length<1||value.length>max||!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value))fail('hsme_tier_identifier',path+' invalid');
  return value;
}
function safeInteger(value:unknown,path:string,min:number,max:number):number{
  if(!Number.isSafeInteger(value)||Number(value)<min||Number(value)>max)fail('hsme_tier_integer',path+' invalid');
  return Number(value);
}
function sha256(value:unknown,path:string):string{
  if(typeof value!=='string'||!HEX64.test(value))fail('hsme_tier_sha256',path+' invalid');
  return value;
}
function key(candidateId:string,capability:string):string{return candidateId+'\0'+capability;}
function lexical(left:string,right:string):number{return left<right?-1:left>right?1:0;}
function deepFreeze<T>(value:T):T{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const child of Object.values(value as Record<string,unknown>))deepFreeze(child);
  }
  return value;
}
function fail(code:string,message:string):never{throw new HsmeFoundationTierQualificationV1Error(code,message);}
