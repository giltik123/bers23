import {
  proveHsmeFoundationQualityFrontierV1,
  hsmeFoundationQualityFrontierV1Digest,
  type HsmeFoundationQualityFrontierV1,
} from './HsmeFoundationQualityFrontierV1';
import {
  proveHsmeFoundationResourceEvidenceV1,
  hsmeFoundationResourceEvidenceV1Digest,
  type HsmeFoundationResourceEvidenceProofRecordV1,
} from './HsmeFoundationResourceEvidenceV1';
import type { HsmeFoundationBenchmarkRunHashPortV1 } from './HsmeFoundationBenchmarkRunEvidenceV1';

export const HSME_FOUNDATION_PARETO_EFFICIENCY_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_PARETO_EFFICIENCY_V1' as const;
export const HSME_FOUNDATION_PARETO_EFFICIENCY_DIGEST_DOMAIN =
  'bers:hsme:foundation-pareto-efficiency:v1\0' as const;

export type HsmeFoundationEfficiencyVectorV1=Readonly<{
  candidateId:string;
  mandatoryInstalledBytes:number;
  workingMemoryKind:'CUDA_PEAK_RESERVED_BYTES';
  peakWorkingMemoryBytes:number;
  coldEndToEndLatencyMicros:number;
  warmEndToEndLatencyMicros:number;
  acceptedOutputCostMicrousd:number;
  costKind:'MEASURED_METERED'|'PROVEN_UNMETERED_LOCAL';
  hardwareProfileSha256:string;
  measurementMethodSha256:string;
  measurementEvidenceSha256:string;
}>;

export type HsmeFoundationParetoSliceV1=Readonly<{
  sliceId:string;
  capability:'TEXT_TO_IMAGE'|'IMAGE_EDITING';
  state:'QUALITY_BLOCKED'|'PARETO_FRONTIER_READY';
  qualityPreferredCandidateIds:readonly string[];
  vectors:readonly HsmeFoundationEfficiencyVectorV1[];
  paretoNondominatedCandidateIds:readonly string[];
  dominatedCandidateIds:readonly string[];
  uniqueEfficiencyDominantCandidateId?:string;
}>;

export type HsmeFoundationParetoEfficiencyV1=Readonly<{
  schemaVersion:typeof HSME_FOUNDATION_PARETO_EFFICIENCY_V1_SCHEMA;
  campaignId:string;
  qualityFrontierSha256:string;
  resourceEvidenceSha256:string;
  policy:'QUALITY_GATED_PARETO_NO_WEIGHTS';
  dimensions:readonly [
    'mandatoryInstalledBytes',
    'peakWorkingMemoryBytes',
    'coldEndToEndLatencyMicros',
    'warmEndToEndLatencyMicros',
    'acceptedOutputCostMicrousd',
  ];
  direction:'LOWER_IS_BETTER';
  slices:readonly HsmeFoundationParetoSliceV1[];
  weightedAggregateScoreAllowed:false;
  lowerQualityCandidateAdmissionAllowed:false;
  deploymentTierAdmissionGranted:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
  durableModelFleetPromotionAllowed:false;
  trainingOrDistillationAllowed:false;
  winnerSelectionAllowed:false;
}>;

export class HsmeFoundationParetoEfficiencyV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeFoundationParetoEfficiencyV1Error';
    this.code=code;
  }
}

export async function proveHsmeFoundationParetoEfficiencyV1(
  rawCampaign:unknown,
  rawTrust:unknown,
  rawFixturePlan:unknown,
  rawFixturePackEvidence:unknown,
  rawQualityRubric:unknown,
  rawRunEvidence:unknown,
  rawAssessmentEvidence:unknown,
  rawResourceEvidence:unknown,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<HsmeFoundationParetoEfficiencyV1>{
  const frontier=await proveHsmeFoundationQualityFrontierV1(
    rawCampaign,rawTrust,rawFixturePlan,rawFixturePackEvidence,rawQualityRubric,
    rawRunEvidence,rawAssessmentEvidence,hash,
  );
  const resource=await proveHsmeFoundationResourceEvidenceV1(
    rawCampaign,rawTrust,rawFixturePlan,rawFixturePackEvidence,rawRunEvidence,
    rawResourceEvidence,hash,
  );
  const qualityFrontierSha256=await hsmeFoundationQualityFrontierV1Digest(frontier,hash);
  const resourceEvidenceSha256=await hsmeFoundationResourceEvidenceV1Digest(resource,hash);
  if(frontier.campaignId!==resource.campaignId){
    fail('hsme_pareto_campaign_mismatch','quality frontier and resource evidence campaign differ');
  }

  const slices:HsmeFoundationParetoSliceV1[]=frontier.slices.map(slice=>{
    if(!slice.efficiencyComparisonAllowed){
      return deepFreeze({
        sliceId:slice.sliceId,
        capability:slice.capability,
        state:'QUALITY_BLOCKED' as const,
        qualityPreferredCandidateIds:Object.freeze([...slice.qualityPreferredCandidateIds]),
        vectors:Object.freeze([]),
        paretoNondominatedCandidateIds:Object.freeze([]),
        dominatedCandidateIds:Object.freeze([]),
      });
    }

    const preferred=[...slice.efficiencyCandidateIds].sort(lexical);
    if(!sameStrings(preferred,[...slice.qualityPreferredCandidateIds].sort(lexical))){
      fail('hsme_pareto_frontier_candidate_set','efficiency candidate ids differ from frozen quality-preferred set');
    }
    const selectedResource=preferred.map(candidateId=>
      resource.records.find(record=>record.candidateId===candidateId&&record.capability===slice.capability)
    );
    if(selectedResource.some(value=>!value)){
      fail('hsme_pareto_resource_missing','quality-preferred candidate is missing exact resource evidence');
    }

    const vectors=Object.freeze(
      (selectedResource as HsmeFoundationResourceEvidenceProofRecordV1[])
        .map(toVector)
        .sort((a,b)=>lexical(a.candidateId,b.candidateId))
    );
    const nondominated=vectors.filter(candidate=>
      !vectors.some(other=>other.candidateId!==candidate.candidateId&&dominates(other,candidate))
    );
    const nondominatedIds=Object.freeze(nondominated.map(value=>value.candidateId).sort(lexical));
    const dominatedIds=Object.freeze(
      vectors.filter(value=>!nondominatedIds.includes(value.candidateId)).map(value=>value.candidateId).sort(lexical)
    );
    return deepFreeze({
      sliceId:slice.sliceId,
      capability:slice.capability,
      state:'PARETO_FRONTIER_READY' as const,
      qualityPreferredCandidateIds:Object.freeze(preferred),
      vectors,
      paretoNondominatedCandidateIds:nondominatedIds,
      dominatedCandidateIds:dominatedIds,
      ...(nondominatedIds.length===1?{uniqueEfficiencyDominantCandidateId:nondominatedIds[0]}:{}),
    });
  }).sort((a,b)=>lexical(a.sliceId,b.sliceId));

  return deepFreeze({
    schemaVersion:HSME_FOUNDATION_PARETO_EFFICIENCY_V1_SCHEMA,
    campaignId:frontier.campaignId,
    qualityFrontierSha256,
    resourceEvidenceSha256,
    policy:'QUALITY_GATED_PARETO_NO_WEIGHTS',
    dimensions:Object.freeze([
      'mandatoryInstalledBytes',
      'peakWorkingMemoryBytes',
      'coldEndToEndLatencyMicros',
      'warmEndToEndLatencyMicros',
      'acceptedOutputCostMicrousd',
    ]) as HsmeFoundationParetoEfficiencyV1['dimensions'],
    direction:'LOWER_IS_BETTER',
    slices:Object.freeze(slices),
    weightedAggregateScoreAllowed:false,
    lowerQualityCandidateAdmissionAllowed:false,
    deploymentTierAdmissionGranted:false,
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

export async function hsmeFoundationParetoEfficiencyV1Digest(
  raw:HsmeFoundationParetoEfficiencyV1,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<string>{
  const digest=await hash.sha256(new TextEncoder().encode(
    HSME_FOUNDATION_PARETO_EFFICIENCY_DIGEST_DOMAIN+JSON.stringify(raw),
  ));
  if(!/^[0-9a-f]{64}$/.test(digest))fail('hsme_pareto_hash_port','hash port must return lowercase SHA-256');
  return digest;
}

function toVector(record:HsmeFoundationResourceEvidenceProofRecordV1):HsmeFoundationEfficiencyVectorV1{
  return deepFreeze({
    candidateId:record.candidateId,
    mandatoryInstalledBytes:record.mandatoryInstalledBytes,
    workingMemoryKind:record.workingMemoryKind,
    peakWorkingMemoryBytes:record.peakWorkingMemoryBytes,
    coldEndToEndLatencyMicros:record.coldEndToEndLatencyMicros,
    warmEndToEndLatencyMicros:record.warmEndToEndLatencyMicros,
    acceptedOutputCostMicrousd:record.acceptedOutputCostMicrousd,
    costKind:record.costKind,
    hardwareProfileSha256:record.hardwareProfileSha256,
    measurementMethodSha256:record.measurementMethodSha256,
    measurementEvidenceSha256:record.measurementEvidenceSha256,
  });
}

export function hsmeFoundationEfficiencyVectorDominatesV1(
  left:HsmeFoundationEfficiencyVectorV1,
  right:HsmeFoundationEfficiencyVectorV1,
):boolean{
  return dominates(left,right);
}

function dominates(left:HsmeFoundationEfficiencyVectorV1,right:HsmeFoundationEfficiencyVectorV1):boolean{
  assertComparableContext(left,right);
  const pairs:[number,number][]=[
    [left.mandatoryInstalledBytes,right.mandatoryInstalledBytes],
    [left.peakWorkingMemoryBytes,right.peakWorkingMemoryBytes],
    [left.coldEndToEndLatencyMicros,right.coldEndToEndLatencyMicros],
    [left.warmEndToEndLatencyMicros,right.warmEndToEndLatencyMicros],
    [left.acceptedOutputCostMicrousd,right.acceptedOutputCostMicrousd],
  ];
  return pairs.every(([a,b])=>a<=b)&&pairs.some(([a,b])=>a<b);
}
function assertComparableContext(left:HsmeFoundationEfficiencyVectorV1,right:HsmeFoundationEfficiencyVectorV1):void{
  if(left.workingMemoryKind!==right.workingMemoryKind){
    fail('hsme_pareto_memory_domain_mismatch','resource vectors must use the same working-memory domain');
  }
  if(left.hardwareProfileSha256!==right.hardwareProfileSha256){
    fail('hsme_pareto_hardware_profile_mismatch','resource vectors must use the same hardware profile');
  }
  if(left.measurementMethodSha256!==right.measurementMethodSha256){
    fail('hsme_pareto_measurement_method_mismatch','resource vectors must use the same measurement method');
  }
  if(left.costKind!==right.costKind){
    fail('hsme_pareto_cost_kind_mismatch','resource vectors must use the same cost accounting kind');
  }
}
function sameStrings(left:readonly string[],right:readonly string[]):boolean{
  return left.length===right.length&&left.every((value,index)=>value===right[index]);
}
function lexical(left:string,right:string):number{return left<right?-1:left>right?1:0;}
function deepFreeze<T>(value:T):T{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const child of Object.values(value as Record<string,unknown>))deepFreeze(child);
  }
  return value;
}
function fail(code:string,message:string):never{throw new HsmeFoundationParetoEfficiencyV1Error(code,message);}
