import {
  hsmeFoundationReuseDecisionV1Digest,
  mayEscalateToFullHsmeStudentDistillationV1,
  normalizeHsmeFoundationReuseDecisionV1,
  type HsmeFoundationReuseCandidateV1,
  type HsmeFoundationReuseDecisionV1,
} from './HsmeFoundationReuseDecisionV1';
import {
  HSME_FOUNDATION_PENDING_REUSE_SOURCE_CANDIDATE_DIGEST_DOMAIN,
} from './HsmeFoundationPendingReuseRuntimeApplicationV1';
import {
  hsmeFoundationBenchmarkCampaignV1Digest,
  normalizeHsmeFoundationBenchmarkCampaignV1,
} from './HsmeFoundationBenchmarkCampaignV1';
import {
  HSME_FOUNDATION_QUALITY_FRONTIER_V1_SCHEMA,
  hsmeFoundationQualityFrontierV1Digest,
  type HsmeFoundationQualityFrontierV1,
} from './HsmeFoundationQualityFrontierV1';
import {
  HSME_FOUNDATION_PARETO_EFFICIENCY_V1_SCHEMA,
  hsmeFoundationParetoEfficiencyV1Digest,
  type HsmeFoundationParetoEfficiencyV1,
} from './HsmeFoundationParetoEfficiencyV1';
import {
  HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_ASSEMBLY_V1_SCHEMA,
  HSME_FOUNDATION_REUSE_ASSEMBLED_CANDIDATE_DIGEST_DOMAIN,
  HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_SET_DIGEST_DOMAIN,
  type HsmeFoundationReuseCandidateEvidenceAssemblyV1,
  type HsmeFoundationReuseCandidateProofEvidenceRefV1,
} from './HsmeFoundationReuseCandidateEvidenceAssemblyV1';
import type {HsmeFoundationBenchmarkRunHashPortV1} from './HsmeFoundationBenchmarkRunEvidenceV1';

export const HSME_FOUNDATION_REUSE_DECISION_FINALIZATION_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_REUSE_DECISION_FINALIZATION_V1' as const;
export const HSME_FOUNDATION_REUSE_DECISION_FINALIZATION_DIGEST_DOMAIN =
  'bers:hsme:reuse-decision-finalization:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const SUPPORTED_CAPABILITIES=Object.freeze(['IMAGE_EDITING','TEXT_TO_IMAGE'] as const);
type Capability=typeof SUPPORTED_CAPABILITIES[number];

export type HsmeFoundationReuseDecisionFinalizationStateV1=
  | 'DECISION_EVIDENCE_INVALID'
  | 'DECISION_EVIDENCE_INCOMPLETE'
  | 'SELECTION_AMBIGUOUS'
  | 'DIRECT_FOUNDATION_ADVANCE_READY'
  | 'BOUNDED_ADAPTATION_ADVANCE_READY'
  | 'REUSE_PATH_INSUFFICIENT_READY';

export type HsmeFoundationReuseCandidateAssemblyRefV1=Readonly<{
  candidateId:string;
  state:'CANDIDATE_EVIDENCE_QUALIFIED'|'CANDIDATE_EVIDENCE_REJECTED';
  candidateEvidenceSetSha256:string;
  assembledCandidateSha256:string;
}>;

export interface HsmeFoundationReuseDecisionFinalizationOriginVerifierV1{
  verifyCandidateAssembly(
    assembly:HsmeFoundationReuseCandidateEvidenceAssemblyV1,
    expectedCandidateEvidenceSetSha256:string,
  ):Promise<boolean>;
  verifyQualityFrontier(
    frontier:HsmeFoundationQualityFrontierV1,
    expectedQualityFrontierSha256:string,
  ):Promise<boolean>;
  verifyParetoEfficiency(
    pareto:HsmeFoundationParetoEfficiencyV1,
    expectedParetoEvidenceSha256:string,
  ):Promise<boolean>;
}

export type HsmeFoundationReuseDecisionFinalizationV1=Readonly<{
  schemaVersion:typeof HSME_FOUNDATION_REUSE_DECISION_FINALIZATION_V1_SCHEMA;
  state:HsmeFoundationReuseDecisionFinalizationStateV1;
  blockers:readonly string[];
  sourceDecisionSha256:string|'UNKNOWN';
  campaignDigest:string|'UNKNOWN';
  qualityFrontierSha256:string|'UNKNOWN';
  paretoEvidenceSha256:string|'UNKNOWN';
  candidateAssemblyRefs:readonly HsmeFoundationReuseCandidateAssemblyRefV1[];
  eligibleCandidateIds:readonly string[];
  selectedCandidateId?:string;
  finalDecisionSha256:string|'UNKNOWN';
  finalizationEvidenceSha256:string|'UNKNOWN';
  finalDecision:HsmeFoundationReuseDecisionV1|null;
  reuseAdvanceAllowed:boolean;
  fullStudentEscalationAllowed:boolean;
  modelFleetPromotionAllowed:false;
  installOrDownloadAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
  durableModelFleetPromotionAllowed:false;
  trainingOrDistillationAllowed:false;
  winnerSelectionAllowed:false;
}>;

export async function finalizeHsmeFoundationReuseDecisionV1(
  rawSourceDecision:unknown,
  rawCampaign:unknown,
  assemblies:readonly HsmeFoundationReuseCandidateEvidenceAssemblyV1[],
  frontier:HsmeFoundationQualityFrontierV1,
  expectedQualityFrontierSha256:string,
  pareto:HsmeFoundationParetoEfficiencyV1,
  expectedParetoEvidenceSha256:string,
  origin:HsmeFoundationReuseDecisionFinalizationOriginVerifierV1,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<HsmeFoundationReuseDecisionFinalizationV1>{
  const blockers:string[]=[];
  if(!Array.isArray(assemblies)||assemblies.length>16){
    return invalid(['FINALIZATION_ASSEMBLY_COUNT_INVALID']);
  }
  if(!HEX64.test(expectedQualityFrontierSha256)){
    blockers.push('FINALIZATION_EXPECTED_FRONTIER_DIGEST_INVALID');
  }
  if(!HEX64.test(expectedParetoEvidenceSha256)){
    blockers.push('FINALIZATION_EXPECTED_PARETO_DIGEST_INVALID');
  }

  let sourceDecision:HsmeFoundationReuseDecisionV1;
  let campaign:ReturnType<typeof normalizeHsmeFoundationBenchmarkCampaignV1>;
  try{
    sourceDecision=normalizeHsmeFoundationReuseDecisionV1(rawSourceDecision);
    campaign=normalizeHsmeFoundationBenchmarkCampaignV1(rawCampaign);
  }catch{
    return invalid(['FINALIZATION_SOURCE_OR_CAMPAIGN_INVALID']);
  }
  if(sourceDecision.decisionStatus!=='EVALUATION_PENDING'||sourceDecision.selectedCandidateId!==undefined){
    blockers.push('FINALIZATION_SOURCE_DECISION_NOT_PENDING');
  }
  if(campaign.status!=='FIXTURES_PINNED'){
    blockers.push('FINALIZATION_CAMPAIGN_NOT_PINNED');
  }

  let sourceDecisionSha256:string|'UNKNOWN'='UNKNOWN';
  let campaignDigest:string|'UNKNOWN'='UNKNOWN';
  try{
    sourceDecisionSha256=await hsmeFoundationReuseDecisionV1Digest(sourceDecision,hash);
    campaignDigest=await hsmeFoundationBenchmarkCampaignV1Digest(campaign,hash);
  }catch{
    blockers.push('FINALIZATION_SOURCE_DIGEST_INVALID');
  }

  const globalRequiredCapabilities=deriveGlobalRequiredCapabilities(campaign,blockers);
  const sourceReuseCandidates=sourceDecision.candidates
    .filter(value=>value.strategy!=='CONTROL_BASELINE')
    .sort((a,b)=>lexical(a.candidateId,b.candidateId));
  const sourceReuseIds=sourceReuseCandidates.map(value=>value.candidateId);

  const assemblyByCandidate=new Map<string,HsmeFoundationReuseCandidateEvidenceAssemblyV1>();
  const readyAssemblyRefs:HsmeFoundationReuseCandidateAssemblyRefV1[]=[];
  for(const assembly of assemblies){
    if(assemblyByCandidate.has(assembly.candidateId)){
      blockers.push('FINALIZATION_ASSEMBLY_DUPLICATE:'+assembly.candidateId);
      continue;
    }
    assemblyByCandidate.set(assembly.candidateId,assembly);
    if(!sourceReuseIds.includes(assembly.candidateId)){
      blockers.push('FINALIZATION_ASSEMBLY_CANDIDATE_OUT_OF_SCOPE:'+assembly.candidateId);
      continue;
    }
    if(assembly.state==='CANDIDATE_EVIDENCE_INVALID'){
      blockers.push('FINALIZATION_ASSEMBLY_INVALID:'+assembly.candidateId);
      continue;
    }
    if(assembly.state==='CANDIDATE_EVIDENCE_INCOMPLETE'){
      continue;
    }
    await validateReadyAssembly(
      assembly,sourceDecision,campaign,sourceDecisionSha256,campaignDigest,origin,hash,blockers,
    );
    if(
      assembly.candidate!==null
      &&assembly.candidateEvidenceSetSha256!=='UNKNOWN'
      &&assembly.assembledCandidateSha256!=='UNKNOWN'
    ){
      readyAssemblyRefs.push(Object.freeze({
        candidateId:assembly.candidateId,
        state:assembly.state,
        candidateEvidenceSetSha256:assembly.candidateEvidenceSetSha256,
        assembledCandidateSha256:assembly.assembledCandidateSha256,
      }));
    }
  }
  readyAssemblyRefs.sort((a,b)=>lexical(a.candidateId,b.candidateId));

  const qualityFrontierSha256=await validateFrontier(
    campaign,frontier,expectedQualityFrontierSha256,origin,hash,blockers,
  );
  const paretoEvidenceSha256=await validatePareto(
    campaign,frontier,qualityFrontierSha256,pareto,expectedParetoEvidenceSha256,origin,hash,blockers,
  );

  if(blockers.length>0){
    return invalid(blockers,{
      sourceDecisionSha256,campaignDigest,qualityFrontierSha256,paretoEvidenceSha256,
      candidateAssemblyRefs:Object.freeze(readyAssemblyRefs),
    });
  }

  const allReuseRejected=sourceReuseCandidates.length>0&&sourceReuseCandidates.every(source=>{
    const assembly=assemblyByCandidate.get(source.candidateId);
    return assembly?.state==='CANDIDATE_EVIDENCE_REJECTED'&&assembly.candidate!==null;
  });
  if(allReuseRejected){
    return finalizeInsufficient(
      sourceDecision,campaignDigest,sourceDecisionSha256,qualityFrontierSha256,paretoEvidenceSha256,
      sourceReuseCandidates,assemblyByCandidate,Object.freeze(readyAssemblyRefs),hash,
    );
  }

  const selection=deriveSelectionSet(
    campaign,frontier,pareto,globalRequiredCapabilities,sourceReuseIds,blockers,
  );
  if(blockers.length>0){
    return invalid(blockers,{
      sourceDecisionSha256,campaignDigest,qualityFrontierSha256,paretoEvidenceSha256,
      candidateAssemblyRefs:Object.freeze(readyAssemblyRefs),
    });
  }

  const qualifiedGlobalCoverage=selection.filter(candidateId=>{
    const assembly=assemblyByCandidate.get(candidateId);
    return assembly?.state==='CANDIDATE_EVIDENCE_QUALIFIED'
      &&assembly.candidate!==null
      &&sameStrings(assembly.requiredCapabilities,globalRequiredCapabilities);
  }).sort(lexical);

  if(selection.length===0){
    return ambiguous({
      sourceDecisionSha256,campaignDigest,qualityFrontierSha256,paretoEvidenceSha256,
      candidateAssemblyRefs:Object.freeze(readyAssemblyRefs),
      eligibleCandidateIds:Object.freeze([]),
    });
  }

  const selectionMissingAssembly=selection.some(candidateId=>{
    const assembly=assemblyByCandidate.get(candidateId);
    return assembly?.state!=='CANDIDATE_EVIDENCE_QUALIFIED'
      ||assembly.candidate===null
      ||!sameStrings(assembly.requiredCapabilities,globalRequiredCapabilities);
  });
  if(selectionMissingAssembly){
    return incomplete({
      sourceDecisionSha256,campaignDigest,qualityFrontierSha256,paretoEvidenceSha256,
      candidateAssemblyRefs:Object.freeze(readyAssemblyRefs),
      eligibleCandidateIds:Object.freeze(qualifiedGlobalCoverage),
    });
  }

  if(qualifiedGlobalCoverage.length!==1){
    return ambiguous({
      sourceDecisionSha256,campaignDigest,qualityFrontierSha256,paretoEvidenceSha256,
      candidateAssemblyRefs:Object.freeze(readyAssemblyRefs),
      eligibleCandidateIds:Object.freeze(qualifiedGlobalCoverage),
    });
  }

  const selectedCandidateId=qualifiedGlobalCoverage[0];
  return finalizeAdvance(
    sourceDecision,campaignDigest,sourceDecisionSha256,qualityFrontierSha256,paretoEvidenceSha256,
    selectedCandidateId,assemblyByCandidate,Object.freeze(readyAssemblyRefs),hash,
  );
}

async function validateReadyAssembly(
  assembly:HsmeFoundationReuseCandidateEvidenceAssemblyV1,
  sourceDecision:HsmeFoundationReuseDecisionV1,
  campaign:ReturnType<typeof normalizeHsmeFoundationBenchmarkCampaignV1>,
  sourceDecisionSha256:string|'UNKNOWN',
  campaignDigest:string|'UNKNOWN',
  origin:HsmeFoundationReuseDecisionFinalizationOriginVerifierV1,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
  blockers:string[],
):Promise<void>{
  if(assembly.schemaVersion!==HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_ASSEMBLY_V1_SCHEMA){
    blockers.push('FINALIZATION_ASSEMBLY_SCHEMA_INVALID:'+assembly.candidateId);
    return;
  }
  if(assembly.state!=='CANDIDATE_EVIDENCE_QUALIFIED'&&assembly.state!=='CANDIDATE_EVIDENCE_REJECTED'){
    blockers.push('FINALIZATION_ASSEMBLY_NOT_READY:'+assembly.candidateId);
    return;
  }
  if(!Array.isArray(assembly.blockers)||assembly.blockers.length!==0){
    blockers.push('FINALIZATION_ASSEMBLY_BLOCKERS_PRESENT:'+assembly.candidateId);
  }
  if(assembly.sourceDecisionSha256!==sourceDecisionSha256){
    blockers.push('FINALIZATION_ASSEMBLY_SOURCE_DECISION_DRIFT:'+assembly.candidateId);
  }
  if(assembly.campaignDigest!==campaignDigest){
    blockers.push('FINALIZATION_ASSEMBLY_CAMPAIGN_DRIFT:'+assembly.candidateId);
  }
  if(!assemblyAuthorityFalse(assembly)){
    blockers.push('FINALIZATION_ASSEMBLY_AUTHORITY_WIDENING:'+assembly.candidateId);
  }
  if(assembly.candidate===null
    ||assembly.assembledCandidateSha256==='UNKNOWN'
    ||assembly.candidateEvidenceSetSha256==='UNKNOWN'){
    blockers.push('FINALIZATION_ASSEMBLY_PAYLOAD_MISSING:'+assembly.candidateId);
    return;
  }
  const sourceCandidate=sourceDecision.candidates.find(value=>value.candidateId===assembly.candidateId);
  if(!sourceCandidate){
    blockers.push('FINALIZATION_ASSEMBLY_SOURCE_CANDIDATE_MISSING:'+assembly.candidateId);
    return;
  }
  const campaignCandidate=campaign.candidates.find(value=>value.candidateId===assembly.candidateId);
  if(!campaignCandidate){
    blockers.push('FINALIZATION_ASSEMBLY_CAMPAIGN_CANDIDATE_MISSING:'+assembly.candidateId);
    return;
  }
  if(campaignCandidate.sourceRoot!==sourceCandidate.source.sourceRoot
    ||campaignCandidate.immutableRevision!==sourceCandidate.source.immutableRevision
    ||campaignCandidate.modelContentSha256!==sourceCandidate.source.contentSha256){
    blockers.push('FINALIZATION_ASSEMBLY_CAMPAIGN_SOURCE_DRIFT:'+assembly.candidateId);
  }
  const expectedCapabilities=deriveCandidateRequiredCapabilities(campaign,assembly.candidateId);
  if(!sameStrings(assembly.requiredCapabilities,expectedCapabilities)){
    blockers.push('FINALIZATION_ASSEMBLY_CAPABILITY_SCOPE_DRIFT:'+assembly.candidateId);
  }
  let expectedSourceCandidateSha:string|null=null;
  try{
    expectedSourceCandidateSha=await digest(
      HSME_FOUNDATION_PENDING_REUSE_SOURCE_CANDIDATE_DIGEST_DOMAIN,
      sourceCandidate,hash,'FINALIZATION_SOURCE_CANDIDATE_HASH_INVALID',
    );
  }catch{
    blockers.push('FINALIZATION_SOURCE_CANDIDATE_HASH_INVALID:'+assembly.candidateId);
  }
  if(expectedSourceCandidateSha!==null&&assembly.sourceCandidateSha256!==expectedSourceCandidateSha){
    blockers.push('FINALIZATION_ASSEMBLY_SOURCE_CANDIDATE_HASH_DRIFT:'+assembly.candidateId);
  }
  if(!candidateIdentityPreserved(sourceCandidate,assembly.candidate)){
    blockers.push('FINALIZATION_ASSEMBLY_CANDIDATE_IDENTITY_DRIFT:'+assembly.candidateId);
  }
  if(assembly.state==='CANDIDATE_EVIDENCE_QUALIFIED'&&assembly.candidate.evidenceState!=='QUALIFIED'){
    blockers.push('FINALIZATION_ASSEMBLY_QUALIFIED_STATE_DRIFT:'+assembly.candidateId);
  }
  if(assembly.state==='CANDIDATE_EVIDENCE_REJECTED'&&assembly.candidate.evidenceState!=='REJECTED'){
    blockers.push('FINALIZATION_ASSEMBLY_REJECTED_STATE_DRIFT:'+assembly.candidateId);
  }

  let candidateSha:string|null=null;
  try{
    candidateSha=await digest(
      HSME_FOUNDATION_REUSE_ASSEMBLED_CANDIDATE_DIGEST_DOMAIN,
      assembly.candidate,hash,'FINALIZATION_ASSEMBLED_CANDIDATE_HASH_INVALID',
    );
  }catch{
    blockers.push('FINALIZATION_ASSEMBLED_CANDIDATE_HASH_INVALID:'+assembly.candidateId);
  }
  if(candidateSha!==null&&candidateSha!==assembly.assembledCandidateSha256){
    blockers.push('FINALIZATION_ASSEMBLED_CANDIDATE_HASH_MISMATCH:'+assembly.candidateId);
  }

  if(!canonicalProofRefs(assembly.proofEvidenceRefs)){
    blockers.push('FINALIZATION_ASSEMBLY_PROOF_REFS_INVALID:'+assembly.candidateId);
  }
  let evidenceSetSha:string|null=null;
  try{
    evidenceSetSha=await digest(
      HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_SET_DIGEST_DOMAIN,
      assemblyEvidencePayload(assembly),
      hash,'FINALIZATION_ASSEMBLY_EVIDENCE_SET_HASH_INVALID',
    );
  }catch{
    blockers.push('FINALIZATION_ASSEMBLY_EVIDENCE_SET_HASH_INVALID:'+assembly.candidateId);
  }
  if(evidenceSetSha!==null&&evidenceSetSha!==assembly.candidateEvidenceSetSha256){
    blockers.push('FINALIZATION_ASSEMBLY_EVIDENCE_SET_HASH_MISMATCH:'+assembly.candidateId);
  }

  if(evidenceSetSha!==null&&evidenceSetSha===assembly.candidateEvidenceSetSha256){
    let verified=false;
    try{verified=await origin.verifyCandidateAssembly(assembly,evidenceSetSha);}catch{verified=false;}
    if(!verified)blockers.push('FINALIZATION_ASSEMBLY_ORIGIN_UNVERIFIED:'+assembly.candidateId);
  }
}

async function validateFrontier(
  campaign:ReturnType<typeof normalizeHsmeFoundationBenchmarkCampaignV1>,
  frontier:HsmeFoundationQualityFrontierV1,
  expectedSha:string,
  origin:HsmeFoundationReuseDecisionFinalizationOriginVerifierV1,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
  blockers:string[],
):Promise<string|'UNKNOWN'>{
  if(frontier.schemaVersion!==HSME_FOUNDATION_QUALITY_FRONTIER_V1_SCHEMA
    ||frontier.campaignId!==campaign.campaignId
    ||frontier.qualityPolicy!=='QUALITY_FLOOR_BEFORE_EFFICIENCY'
    ||frontier.qualityOrderingFrozen!==true
    ||frontier.efficiencyMayOnlyUseQualityPreferredSet!==true
    ||!frontierAuthorityFalse(frontier)){
    blockers.push('FINALIZATION_QUALITY_FRONTIER_INVALID');
  }
  let actual:string|'UNKNOWN'='UNKNOWN';
  try{
    actual=await hsmeFoundationQualityFrontierV1Digest(frontier,hash);
    if(actual!==expectedSha)blockers.push('FINALIZATION_QUALITY_FRONTIER_DIGEST_DRIFT');
  }catch{
    blockers.push('FINALIZATION_QUALITY_FRONTIER_DIGEST_INVALID');
  }
  if(actual!=='UNKNOWN'&&actual===expectedSha){
    let verified=false;
    try{verified=await origin.verifyQualityFrontier(frontier,actual);}catch{verified=false;}
    if(!verified)blockers.push('FINALIZATION_QUALITY_FRONTIER_ORIGIN_UNVERIFIED');
  }
  return actual;
}

async function validatePareto(
  campaign:ReturnType<typeof normalizeHsmeFoundationBenchmarkCampaignV1>,
  frontier:HsmeFoundationQualityFrontierV1,
  frontierSha:string|'UNKNOWN',
  pareto:HsmeFoundationParetoEfficiencyV1,
  expectedSha:string,
  origin:HsmeFoundationReuseDecisionFinalizationOriginVerifierV1,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
  blockers:string[],
):Promise<string|'UNKNOWN'>{
  if(pareto.schemaVersion!==HSME_FOUNDATION_PARETO_EFFICIENCY_V1_SCHEMA
    ||pareto.campaignId!==campaign.campaignId
    ||pareto.policy!=='QUALITY_GATED_PARETO_NO_WEIGHTS'
    ||pareto.direction!=='LOWER_IS_BETTER'
    ||pareto.weightedAggregateScoreAllowed!==false
    ||pareto.lowerQualityCandidateAdmissionAllowed!==false
    ||pareto.deploymentTierAdmissionGranted!==false
    ||!paretoAuthorityFalse(pareto)){
    blockers.push('FINALIZATION_PARETO_INVALID');
  }
  if(frontierSha==='UNKNOWN'||pareto.qualityFrontierSha256!==frontierSha){
    blockers.push('FINALIZATION_PARETO_FRONTIER_DIGEST_DRIFT');
  }
  let actual:string|'UNKNOWN'='UNKNOWN';
  try{
    actual=await hsmeFoundationParetoEfficiencyV1Digest(pareto,hash);
    if(actual!==expectedSha)blockers.push('FINALIZATION_PARETO_DIGEST_DRIFT');
  }catch{
    blockers.push('FINALIZATION_PARETO_DIGEST_INVALID');
  }
  if(actual!=='UNKNOWN'&&actual===expectedSha){
    let verified=false;
    try{verified=await origin.verifyParetoEfficiency(pareto,actual);}catch{verified=false;}
    if(!verified)blockers.push('FINALIZATION_PARETO_ORIGIN_UNVERIFIED');
  }

  for(const frontierSlice of frontier.slices){
    const matches=pareto.slices.filter(value=>
      value.sliceId===frontierSlice.sliceId&&value.capability===frontierSlice.capability
    );
    if(matches.length!==1){
      blockers.push('FINALIZATION_PARETO_SLICE_BINDING_INVALID:'+frontierSlice.capability);
      continue;
    }
    const paretoSlice=matches[0];
    if(!sameStrings(
      [...paretoSlice.qualityPreferredCandidateIds].sort(lexical),
      [...frontierSlice.qualityPreferredCandidateIds].sort(lexical),
    )){
      blockers.push('FINALIZATION_PARETO_QUALITY_SET_DRIFT:'+frontierSlice.capability);
    }
    const vectorIds=[...paretoSlice.vectors.map(value=>value.candidateId)].sort(lexical);
    if(paretoSlice.state==='PARETO_FRONTIER_READY'
      &&!sameStrings(vectorIds,[...paretoSlice.qualityPreferredCandidateIds].sort(lexical))){
      blockers.push('FINALIZATION_PARETO_VECTOR_SET_DRIFT:'+frontierSlice.capability);
    }
    const nondominated=[...paretoSlice.paretoNondominatedCandidateIds].sort(lexical);
    const dominated=[...paretoSlice.dominatedCandidateIds].sort(lexical);
    if(new Set([...nondominated,...dominated]).size!==nondominated.length+dominated.length
      ||!sameStrings([...new Set([...nondominated,...dominated])].sort(lexical),vectorIds)){
      blockers.push('FINALIZATION_PARETO_PARTITION_INVALID:'+frontierSlice.capability);
    }
    if(nondominated.some(id=>!paretoSlice.qualityPreferredCandidateIds.includes(id))
      ||dominated.some(id=>!paretoSlice.qualityPreferredCandidateIds.includes(id))){
      blockers.push('FINALIZATION_PARETO_LOWER_QUALITY_ADMISSION:'+frontierSlice.capability);
    }
  }
  return actual;
}

function deriveSelectionSet(
  campaign:ReturnType<typeof normalizeHsmeFoundationBenchmarkCampaignV1>,
  frontier:HsmeFoundationQualityFrontierV1,
  pareto:HsmeFoundationParetoEfficiencyV1,
  globalRequiredCapabilities:readonly Capability[],
  sourceReuseIds:readonly string[],
  blockers:string[],
):string[]{
  let intersection:Set<string>|null=null;
  for(const capability of globalRequiredCapabilities){
    const campaignSlices=campaign.slices.filter(value=>
      value.capability===capability&&campaign.requiredCapabilities.includes(value.capability)
    );
    if(campaignSlices.length!==1){
      blockers.push('FINALIZATION_REQUIRED_CAMPAIGN_SLICE_INVALID:'+capability);
      continue;
    }
    const sliceId=campaignSlices[0].sliceId;
    const frontierMatches=frontier.slices.filter(value=>
      value.sliceId===sliceId&&value.capability===capability
    );
    const paretoMatches=pareto.slices.filter(value=>
      value.sliceId===sliceId&&value.capability===capability
    );
    if(frontierMatches.length!==1||paretoMatches.length!==1){
      blockers.push('FINALIZATION_REQUIRED_EVIDENCE_SLICE_MISSING:'+capability);
      continue;
    }
    const frontierSlice=frontierMatches[0];
    const paretoSlice=paretoMatches[0];
    const campaignSelection=[...campaignSlices[0].selectionCandidateIds].sort(lexical);
    const campaignDimensions=campaignSlices[0].dimensions.map(value=>value.dimensionId);
    if(!sameStrings(frontierSlice.dimensionPriority,campaignDimensions)){
      blockers.push('FINALIZATION_QUALITY_DIMENSION_PRIORITY_DRIFT:'+capability);
      continue;
    }
    const frontierCandidates=[...frontierSlice.candidates.map(value=>value.candidateId)].sort(lexical);
    if(!sameStrings(campaignSelection,frontierCandidates)){
      blockers.push('FINALIZATION_QUALITY_FRONTIER_ROSTER_DRIFT:'+capability);
      continue;
    }
    if(frontierSlice.qualityPreferredCandidateIds.some(id=>!campaignSelection.includes(id))){
      blockers.push('FINALIZATION_QUALITY_PREFERRED_OUT_OF_SCOPE:'+capability);
      continue;
    }
    if(frontierSlice.state!=='FULL_QUALITY_FRONTIER'
      ||frontierSlice.efficiencyComparisonAllowed!==true
      ||frontierSlice.qualityPreferredCandidateIds.length<1){
      blockers.push('FINALIZATION_REQUIRED_QUALITY_SLICE_NOT_READY:'+capability);
      continue;
    }
    if(paretoSlice.state!=='PARETO_FRONTIER_READY'
      ||paretoSlice.paretoNondominatedCandidateIds.length<1){
      blockers.push('FINALIZATION_REQUIRED_PARETO_SLICE_NOT_READY:'+capability);
      continue;
    }
    if(!sameStrings(
      [...frontierSlice.qualityPreferredCandidateIds].sort(lexical),
      [...paretoSlice.qualityPreferredCandidateIds].sort(lexical),
    )){
      blockers.push('FINALIZATION_REQUIRED_PARETO_QUALITY_DRIFT:'+capability);
      continue;
    }
    const ids=paretoSlice.paretoNondominatedCandidateIds
      .filter(id=>sourceReuseIds.includes(id));
    const current=new Set(ids);
    intersection=intersection===null
      ?current
      :new Set([...intersection].filter(id=>current.has(id)));
  }
  return [...(intersection??new Set<string>())].sort(lexical);
}

async function finalizeAdvance(
  sourceDecision:HsmeFoundationReuseDecisionV1,
  campaignDigest:string|'UNKNOWN',
  sourceDecisionSha256:string|'UNKNOWN',
  qualityFrontierSha256:string|'UNKNOWN',
  paretoEvidenceSha256:string|'UNKNOWN',
  selectedCandidateId:string,
  assemblyByCandidate:ReadonlyMap<string,HsmeFoundationReuseCandidateEvidenceAssemblyV1>,
  assemblyRefs:readonly HsmeFoundationReuseCandidateAssemblyRefV1[],
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<HsmeFoundationReuseDecisionFinalizationV1>{
  const selectedAssembly=assemblyByCandidate.get(selectedCandidateId);
  if(!selectedAssembly||selectedAssembly.state!=='CANDIDATE_EVIDENCE_QUALIFIED'||!selectedAssembly.candidate){
    return invalid(['FINALIZATION_SELECTED_ASSEMBLY_NOT_QUALIFIED'],{
      sourceDecisionSha256,campaignDigest,qualityFrontierSha256,paretoEvidenceSha256,
      candidateAssemblyRefs:assemblyRefs,eligibleCandidateIds:Object.freeze([selectedCandidateId]),
    });
  }

  const replacements=new Map<string,HsmeFoundationReuseCandidateV1>();
  for(const [candidateId,assembly] of assemblyByCandidate){
    if(
      (assembly.state==='CANDIDATE_EVIDENCE_QUALIFIED'||assembly.state==='CANDIDATE_EVIDENCE_REJECTED')
      &&assembly.candidate
    ){
      replacements.set(candidateId,assembly.candidate);
    }
  }

  const status=selectedAssembly.candidate.strategy==='DIRECT_FOUNDATION'
    ?'DIRECT_FOUNDATION_ADVANCE' as const
    :selectedAssembly.candidate.strategy==='FROZEN_FOUNDATION_ADAPTATION'
      ?'BOUNDED_ADAPTATION_ADVANCE' as const
      :null;
  if(status===null){
    return invalid(['FINALIZATION_SELECTED_STRATEGY_INVALID'],{
      sourceDecisionSha256,campaignDigest,qualityFrontierSha256,paretoEvidenceSha256,
      candidateAssemblyRefs:assemblyRefs,eligibleCandidateIds:Object.freeze([selectedCandidateId]),
    });
  }

  let finalDecision:HsmeFoundationReuseDecisionV1;
  try{
    finalDecision=normalizeHsmeFoundationReuseDecisionV1({
      ...sourceDecision,
      decisionStatus:status,
      selectedCandidateId,
      candidates:sourceDecision.candidates.map(value=>replacements.get(value.candidateId)??value),
    });
  }catch{
    return invalid(['FINALIZATION_ADVANCE_DECISION_INVALID'],{
      sourceDecisionSha256,campaignDigest,qualityFrontierSha256,paretoEvidenceSha256,
      candidateAssemblyRefs:assemblyRefs,eligibleCandidateIds:Object.freeze([selectedCandidateId]),
    });
  }

  let finalDecisionSha256:string;
  try{finalDecisionSha256=await hsmeFoundationReuseDecisionV1Digest(finalDecision,hash);}
  catch{
    return invalid(['FINALIZATION_ADVANCE_DECISION_DIGEST_INVALID'],{
      sourceDecisionSha256,campaignDigest,qualityFrontierSha256,paretoEvidenceSha256,
      candidateAssemblyRefs:assemblyRefs,eligibleCandidateIds:Object.freeze([selectedCandidateId]),
    });
  }
  const state=status==='DIRECT_FOUNDATION_ADVANCE'
    ?'DIRECT_FOUNDATION_ADVANCE_READY' as const
    :'BOUNDED_ADAPTATION_ADVANCE_READY' as const;
  const finalizationEvidenceSha256=await digest(
    HSME_FOUNDATION_REUSE_DECISION_FINALIZATION_DIGEST_DOMAIN,
    finalizationPayload({
      state,sourceDecisionSha256,campaignDigest,qualityFrontierSha256,paretoEvidenceSha256,
      candidateAssemblyRefs:assemblyRefs,eligibleCandidateIds:[selectedCandidateId],
      selectedCandidateId,finalDecisionSha256,reuseAdvanceAllowed:true,fullStudentEscalationAllowed:false,
    }),
    hash,'FINALIZATION_EVIDENCE_HASH_INVALID',
  );
  return Object.freeze({
    schemaVersion:HSME_FOUNDATION_REUSE_DECISION_FINALIZATION_V1_SCHEMA,
    state,
    blockers:Object.freeze([]),
    sourceDecisionSha256,
    campaignDigest,
    qualityFrontierSha256,
    paretoEvidenceSha256,
    candidateAssemblyRefs:Object.freeze([...assemblyRefs]),
    eligibleCandidateIds:Object.freeze([selectedCandidateId]),
    selectedCandidateId,
    finalDecisionSha256,
    finalizationEvidenceSha256,
    finalDecision,
    reuseAdvanceAllowed:true,
    fullStudentEscalationAllowed:false,
    ...authorityBoundary(),
  });
}

async function finalizeInsufficient(
  sourceDecision:HsmeFoundationReuseDecisionV1,
  campaignDigest:string|'UNKNOWN',
  sourceDecisionSha256:string|'UNKNOWN',
  qualityFrontierSha256:string|'UNKNOWN',
  paretoEvidenceSha256:string|'UNKNOWN',
  sourceReuseCandidates:readonly HsmeFoundationReuseCandidateV1[],
  assemblyByCandidate:ReadonlyMap<string,HsmeFoundationReuseCandidateEvidenceAssemblyV1>,
  assemblyRefs:readonly HsmeFoundationReuseCandidateAssemblyRefV1[],
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<HsmeFoundationReuseDecisionFinalizationV1>{
  const rejected=new Map<string,HsmeFoundationReuseCandidateV1>();
  for(const source of sourceReuseCandidates){
    const assembly=assemblyByCandidate.get(source.candidateId);
    if(!assembly||assembly.state!=='CANDIDATE_EVIDENCE_REJECTED'||!assembly.candidate){
      return incomplete({
        sourceDecisionSha256,campaignDigest,qualityFrontierSha256,paretoEvidenceSha256,
        candidateAssemblyRefs:assemblyRefs,eligibleCandidateIds:Object.freeze([]),
      });
    }
    rejected.set(source.candidateId,assembly.candidate);
  }

  let finalDecision:HsmeFoundationReuseDecisionV1;
  try{
    finalDecision=normalizeHsmeFoundationReuseDecisionV1({
      ...sourceDecision,
      decisionStatus:'REUSE_PATH_INSUFFICIENT',
      candidates:sourceDecision.candidates.map(value=>rejected.get(value.candidateId)??value),
    });
  }catch{
    return invalid(['FINALIZATION_INSUFFICIENT_DECISION_INVALID'],{
      sourceDecisionSha256,campaignDigest,qualityFrontierSha256,paretoEvidenceSha256,
      candidateAssemblyRefs:assemblyRefs,
    });
  }
  if(!mayEscalateToFullHsmeStudentDistillationV1(finalDecision)){
    return invalid(['FINALIZATION_ESCALATION_PROOF_FALSE'],{
      sourceDecisionSha256,campaignDigest,qualityFrontierSha256,paretoEvidenceSha256,
      candidateAssemblyRefs:assemblyRefs,
    });
  }

  let finalDecisionSha256:string;
  try{finalDecisionSha256=await hsmeFoundationReuseDecisionV1Digest(finalDecision,hash);}
  catch{
    return invalid(['FINALIZATION_INSUFFICIENT_DECISION_DIGEST_INVALID'],{
      sourceDecisionSha256,campaignDigest,qualityFrontierSha256,paretoEvidenceSha256,
      candidateAssemblyRefs:assemblyRefs,
    });
  }
  const state='REUSE_PATH_INSUFFICIENT_READY' as const;
  const finalizationEvidenceSha256=await digest(
    HSME_FOUNDATION_REUSE_DECISION_FINALIZATION_DIGEST_DOMAIN,
    finalizationPayload({
      state,sourceDecisionSha256,campaignDigest,qualityFrontierSha256,paretoEvidenceSha256,
      candidateAssemblyRefs:assemblyRefs,eligibleCandidateIds:[],
      finalDecisionSha256,reuseAdvanceAllowed:false,fullStudentEscalationAllowed:true,
    }),
    hash,'FINALIZATION_EVIDENCE_HASH_INVALID',
  );
  return Object.freeze({
    schemaVersion:HSME_FOUNDATION_REUSE_DECISION_FINALIZATION_V1_SCHEMA,
    state,
    blockers:Object.freeze([]),
    sourceDecisionSha256,
    campaignDigest,
    qualityFrontierSha256,
    paretoEvidenceSha256,
    candidateAssemblyRefs:Object.freeze([...assemblyRefs]),
    eligibleCandidateIds:Object.freeze([]),
    finalDecisionSha256,
    finalizationEvidenceSha256,
    finalDecision,
    reuseAdvanceAllowed:false,
    fullStudentEscalationAllowed:true,
    ...authorityBoundary(),
  });
}

function assemblyEvidencePayload(assembly:HsmeFoundationReuseCandidateEvidenceAssemblyV1){
  const outcome=assembly.state==='CANDIDATE_EVIDENCE_QUALIFIED'?'QUALIFIED':'REJECTED';
  return {
    schemaVersion:HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_ASSEMBLY_V1_SCHEMA,
    outcome,
    candidateId:assembly.candidateId,
    campaignDigest:assembly.campaignDigest,
    sourceDecisionSha256:assembly.sourceDecisionSha256,
    sourceCandidateSha256:assembly.sourceCandidateSha256,
    requiredCapabilities:assembly.requiredCapabilities,
    proofRefs:assembly.proofEvidenceRefs,
    assembledCandidateSha256:assembly.assembledCandidateSha256,
    decisionMutationAllowed:false as const,
    candidateSelectionAllowed:false as const,
    reuseAdvanceAllowed:false as const,
    fullStudentEscalationAllowed:false as const,
    productionAuthorityGranted:false as const,
    trainingOrDistillationAllowed:false as const,
    winnerSelectionAllowed:false as const,
  };
}

function finalizationPayload(value:{
  state:
    |'DIRECT_FOUNDATION_ADVANCE_READY'
    |'BOUNDED_ADAPTATION_ADVANCE_READY'
    |'REUSE_PATH_INSUFFICIENT_READY';
  sourceDecisionSha256:string|'UNKNOWN';
  campaignDigest:string|'UNKNOWN';
  qualityFrontierSha256:string|'UNKNOWN';
  paretoEvidenceSha256:string|'UNKNOWN';
  candidateAssemblyRefs:readonly HsmeFoundationReuseCandidateAssemblyRefV1[];
  eligibleCandidateIds:readonly string[];
  selectedCandidateId?:string;
  finalDecisionSha256:string;
  reuseAdvanceAllowed:boolean;
  fullStudentEscalationAllowed:boolean;
}){
  return {
    schemaVersion:HSME_FOUNDATION_REUSE_DECISION_FINALIZATION_V1_SCHEMA,
    state:value.state,
    sourceDecisionSha256:value.sourceDecisionSha256,
    campaignDigest:value.campaignDigest,
    qualityFrontierSha256:value.qualityFrontierSha256,
    paretoEvidenceSha256:value.paretoEvidenceSha256,
    candidateAssemblyRefs:value.candidateAssemblyRefs,
    eligibleCandidateIds:value.eligibleCandidateIds,
    ...(value.selectedCandidateId?{selectedCandidateId:value.selectedCandidateId}:{}),
    finalDecisionSha256:value.finalDecisionSha256,
    reuseAdvanceAllowed:value.reuseAdvanceAllowed,
    fullStudentEscalationAllowed:value.fullStudentEscalationAllowed,
    productionAuthorityGranted:false as const,
    providerAuthorityGranted:false as const,
    billingAuthorityGranted:false as const,
    projectArtifactMutationAllowed:false as const,
    aeeExecutionAuthorityGranted:false as const,
    durableModelFleetPromotionAllowed:false as const,
    trainingOrDistillationAllowed:false as const,
    winnerSelectionAllowed:false as const,
  };
}

function deriveCandidateRequiredCapabilities(
  campaign:ReturnType<typeof normalizeHsmeFoundationBenchmarkCampaignV1>,
  candidateId:string,
):readonly Capability[]{
  const candidate=campaign.candidates.find(value=>value.candidateId===candidateId);
  if(!candidate)return Object.freeze([]);
  const values=campaign.slices
    .filter(slice=>
      campaign.requiredCapabilities.includes(slice.capability)
      &&slice.selectionCandidateIds.includes(candidateId)
      &&candidate.capabilities.includes(slice.capability)
      &&(SUPPORTED_CAPABILITIES as readonly string[]).includes(slice.capability)
    )
    .map(slice=>slice.capability as Capability);
  return Object.freeze([...new Set(values)].sort(lexical));
}

function deriveGlobalRequiredCapabilities(
  campaign:ReturnType<typeof normalizeHsmeFoundationBenchmarkCampaignV1>,
  blockers:string[],
):readonly Capability[]{
  const required=[...campaign.requiredCapabilities].sort(lexical);
  if(required.length<1)blockers.push('FINALIZATION_REQUIRED_CAPABILITY_SET_EMPTY');
  if(required.some(value=>!(SUPPORTED_CAPABILITIES as readonly string[]).includes(value))){
    blockers.push('FINALIZATION_REQUIRED_CAPABILITY_UNSUPPORTED');
  }
  if(new Set(required).size!==required.length){
    blockers.push('FINALIZATION_REQUIRED_CAPABILITY_DUPLICATE');
  }
  return Object.freeze(required.filter(
    (value):value is Capability=>(SUPPORTED_CAPABILITIES as readonly string[]).includes(value),
  ));
}

function candidateIdentityPreserved(
  source:HsmeFoundationReuseCandidateV1,
  assembled:HsmeFoundationReuseCandidateV1,
):boolean{
  return source.candidateId===assembled.candidateId
    &&source.strategy===assembled.strategy
    &&source.targetTier===assembled.targetTier
    &&JSON.stringify(source.source)===JSON.stringify(assembled.source);
}

function canonicalProofRefs(refs:readonly HsmeFoundationReuseCandidateProofEvidenceRefV1[]):boolean{
  if(!Array.isArray(refs)||refs.length<1||refs.length>32)return false;
  const keys=refs.map(value=>value.capability+'\0'+value.kind);
  if(new Set(keys).size!==keys.length)return false;
  if(refs.some(value=>
    (value.kind!=='QUALIFICATION'&&value.kind!=='REJECTION')
    ||!(SUPPORTED_CAPABILITIES as readonly string[]).includes(value.capability)
    ||!HEX64.test(value.evidenceSetSha256)
  ))return false;
  const sorted=[...refs].sort(compareProofRefs);
  return refs.every((value,index)=>
    value.kind===sorted[index].kind
    &&value.capability===sorted[index].capability
    &&value.evidenceSetSha256===sorted[index].evidenceSetSha256
  );
}

function assemblyAuthorityFalse(assembly:HsmeFoundationReuseCandidateEvidenceAssemblyV1):boolean{
  return assembly.decisionMutationAllowed===false
    &&assembly.candidateSelectionAllowed===false
    &&assembly.selectedCandidateIdAllowed===false
    &&assembly.reuseAdvanceAllowed===false
    &&assembly.fullStudentEscalationAllowed===false
    &&assembly.modelFleetPromotionAllowed===false
    &&assembly.installOrDownloadAllowed===false
    &&assembly.productionAuthorityGranted===false
    &&assembly.providerAuthorityGranted===false
    &&assembly.billingAuthorityGranted===false
    &&assembly.projectArtifactMutationAllowed===false
    &&assembly.aeeExecutionAuthorityGranted===false
    &&assembly.durableModelFleetPromotionAllowed===false
    &&assembly.trainingOrDistillationAllowed===false
    &&assembly.winnerSelectionAllowed===false;
}

function frontierAuthorityFalse(frontier:HsmeFoundationQualityFrontierV1):boolean{
  return frontier.productionAuthorityGranted===false
    &&frontier.providerAuthorityGranted===false
    &&frontier.billingAuthorityGranted===false
    &&frontier.projectArtifactMutationAllowed===false
    &&frontier.aeeExecutionAuthorityGranted===false
    &&frontier.durableModelFleetPromotionAllowed===false
    &&frontier.trainingOrDistillationAllowed===false
    &&frontier.winnerSelectionAllowed===false;
}

function paretoAuthorityFalse(pareto:HsmeFoundationParetoEfficiencyV1):boolean{
  return pareto.productionAuthorityGranted===false
    &&pareto.providerAuthorityGranted===false
    &&pareto.billingAuthorityGranted===false
    &&pareto.projectArtifactMutationAllowed===false
    &&pareto.aeeExecutionAuthorityGranted===false
    &&pareto.durableModelFleetPromotionAllowed===false
    &&pareto.trainingOrDistillationAllowed===false
    &&pareto.winnerSelectionAllowed===false;
}

function compareProofRefs(
  left:{kind:string;capability:string},
  right:{kind:string;capability:string},
):number{
  return lexical(left.capability,right.capability)||lexical(left.kind,right.kind);
}

function sameStrings(left:readonly string[],right:readonly string[]):boolean{
  return left.length===right.length&&left.every((value,index)=>value===right[index]);
}

async function digest(
  domain:string,
  value:unknown,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
  code:string,
):Promise<string>{
  try{
    const result=await hash.sha256(new TextEncoder().encode(domain+JSON.stringify(value)));
    if(!HEX64.test(result))throw new Error('invalid digest');
    return result;
  }catch{
    const error=new Error(code);
    (error as Error&{code?:string}).code=code;
    throw error;
  }
}

function lexical(left:string,right:string):number{return left<right?-1:left>right?1:0;}

function authorityBoundary(){
  return Object.freeze({
    modelFleetPromotionAllowed:false as const,
    installOrDownloadAllowed:false as const,
    productionAuthorityGranted:false as const,
    providerAuthorityGranted:false as const,
    billingAuthorityGranted:false as const,
    projectArtifactMutationAllowed:false as const,
    aeeExecutionAuthorityGranted:false as const,
    durableModelFleetPromotionAllowed:false as const,
    trainingOrDistillationAllowed:false as const,
    winnerSelectionAllowed:false as const,
  });
}

type BaseValues=Partial<Pick<
  HsmeFoundationReuseDecisionFinalizationV1,
  'sourceDecisionSha256'|'campaignDigest'|'qualityFrontierSha256'|'paretoEvidenceSha256'|
  'candidateAssemblyRefs'|'eligibleCandidateIds'
>>;

function invalid(
  blockers:readonly string[],
  values:BaseValues={},
):HsmeFoundationReuseDecisionFinalizationV1{
  return Object.freeze({
    schemaVersion:HSME_FOUNDATION_REUSE_DECISION_FINALIZATION_V1_SCHEMA,
    state:'DECISION_EVIDENCE_INVALID',
    blockers:Object.freeze([...new Set(blockers)]),
    sourceDecisionSha256:values.sourceDecisionSha256??'UNKNOWN',
    campaignDigest:values.campaignDigest??'UNKNOWN',
    qualityFrontierSha256:values.qualityFrontierSha256??'UNKNOWN',
    paretoEvidenceSha256:values.paretoEvidenceSha256??'UNKNOWN',
    candidateAssemblyRefs:Object.freeze([...(values.candidateAssemblyRefs??[])]),
    eligibleCandidateIds:Object.freeze([...(values.eligibleCandidateIds??[])]),
    finalDecisionSha256:'UNKNOWN',
    finalizationEvidenceSha256:'UNKNOWN',
    finalDecision:null,
    reuseAdvanceAllowed:false,
    fullStudentEscalationAllowed:false,
    ...authorityBoundary(),
  });
}

function incomplete(values:BaseValues):HsmeFoundationReuseDecisionFinalizationV1{
  return Object.freeze({
    schemaVersion:HSME_FOUNDATION_REUSE_DECISION_FINALIZATION_V1_SCHEMA,
    state:'DECISION_EVIDENCE_INCOMPLETE',
    blockers:Object.freeze([]),
    sourceDecisionSha256:values.sourceDecisionSha256??'UNKNOWN',
    campaignDigest:values.campaignDigest??'UNKNOWN',
    qualityFrontierSha256:values.qualityFrontierSha256??'UNKNOWN',
    paretoEvidenceSha256:values.paretoEvidenceSha256??'UNKNOWN',
    candidateAssemblyRefs:Object.freeze([...(values.candidateAssemblyRefs??[])]),
    eligibleCandidateIds:Object.freeze([...(values.eligibleCandidateIds??[])]),
    finalDecisionSha256:'UNKNOWN',
    finalizationEvidenceSha256:'UNKNOWN',
    finalDecision:null,
    reuseAdvanceAllowed:false,
    fullStudentEscalationAllowed:false,
    ...authorityBoundary(),
  });
}

function ambiguous(values:BaseValues):HsmeFoundationReuseDecisionFinalizationV1{
  return Object.freeze({
    schemaVersion:HSME_FOUNDATION_REUSE_DECISION_FINALIZATION_V1_SCHEMA,
    state:'SELECTION_AMBIGUOUS',
    blockers:Object.freeze([]),
    sourceDecisionSha256:values.sourceDecisionSha256??'UNKNOWN',
    campaignDigest:values.campaignDigest??'UNKNOWN',
    qualityFrontierSha256:values.qualityFrontierSha256??'UNKNOWN',
    paretoEvidenceSha256:values.paretoEvidenceSha256??'UNKNOWN',
    candidateAssemblyRefs:Object.freeze([...(values.candidateAssemblyRefs??[])]),
    eligibleCandidateIds:Object.freeze([...(values.eligibleCandidateIds??[])]),
    finalDecisionSha256:'UNKNOWN',
    finalizationEvidenceSha256:'UNKNOWN',
    finalDecision:null,
    reuseAdvanceAllowed:false,
    fullStudentEscalationAllowed:false,
    ...authorityBoundary(),
  });
}
