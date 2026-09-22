import {
  hsmeFoundationReuseDecisionV1Digest,
  mayEscalateToFullHsmeStudentDistillationV1,
  normalizeHsmeFoundationReuseCandidateV1,
  normalizeHsmeFoundationReuseDecisionV1,
  type HsmeFoundationReuseCandidateV1,
  type HsmeFoundationReuseDecisionV1,
} from './HsmeFoundationReuseDecisionV1';
import {
  HSME_FOUNDATION_PENDING_REUSE_SOURCE_CANDIDATE_DIGEST_DOMAIN,
} from './HsmeFoundationPendingReuseRuntimeApplicationV1';
import {
  HSME_FOUNDATION_REUSE_ASSEMBLED_CANDIDATE_DIGEST_DOMAIN,
  HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_ASSEMBLY_V1_SCHEMA,
  type HsmeFoundationReuseCandidateEvidenceAssemblyV1,
} from './HsmeFoundationReuseCandidateEvidenceAssemblerV1';
import {
  HSME_FOUNDATION_PARETO_EFFICIENCY_V1_SCHEMA,
  hsmeFoundationParetoEfficiencyV1Digest,
  type HsmeFoundationParetoEfficiencyV1,
} from './HsmeFoundationParetoEfficiencyV1';
import type {HsmeFoundationBenchmarkRunHashPortV1} from './HsmeFoundationBenchmarkRunEvidenceV1';

export const HSME_FOUNDATION_REUSE_DECISION_FINALIZATION_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_REUSE_DECISION_FINALIZATION_V1' as const;
export const HSME_FOUNDATION_REUSE_ASSEMBLY_SET_DIGEST_DOMAIN =
  'bers:hsme:reuse-candidate-assembly-set:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;

export type HsmeFoundationReuseDecisionFinalizationStateV1=
  | 'FINALIZATION_INVALID'
  | 'FINALIZATION_PENDING_AMBIGUOUS'
  | 'DIRECT_FOUNDATION_ADVANCE_READY'
  | 'BOUNDED_ADAPTATION_ADVANCE_READY'
  | 'REUSE_PATH_INSUFFICIENT_READY';

export interface HsmeFoundationReuseAssemblyOriginVerifierV1{
  verifyAssembly(
    assembly:HsmeFoundationReuseCandidateEvidenceAssemblyV1,
    capabilityEvidenceSetSha256:string,
    assembledCandidateSha256:string,
  ):Promise<boolean>;
}

export interface HsmeFoundationParetoOriginVerifierV1{
  verifyParetoEvidence(
    pareto:HsmeFoundationParetoEfficiencyV1,
    paretoEvidenceSha256:string,
    campaignId:string,
    campaignSha256:string,
  ):Promise<boolean>;
}

export type HsmeFoundationReuseDecisionFinalizationV1=Readonly<{
  schemaVersion:typeof HSME_FOUNDATION_REUSE_DECISION_FINALIZATION_V1_SCHEMA;
  state:HsmeFoundationReuseDecisionFinalizationStateV1;
  blockers:readonly string[];
  sourceDecisionSha256:string|'UNKNOWN';
  campaignId:string|'UNKNOWN';
  campaignSha256:string|'UNKNOWN';
  paretoEvidenceSha256:string|'UNKNOWN';
  candidateAssemblySetSha256:string|'UNKNOWN';
  finalDecisionSha256:string|'UNKNOWN';
  selectedCandidateId?:string;
  finalDecision:HsmeFoundationReuseDecisionV1|null;
  reuseAdvanceAllowed:boolean;
  fullStudentEscalationAllowed:boolean;
  candidateSelectionAllowed:false;
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

type ValidatedAssembly=Readonly<{
  candidateId:string;
  state:'CANDIDATE_EVIDENCE_QUALIFIED'|'CANDIDATE_EVIDENCE_REJECTED';
  requiredCapabilities:readonly string[];
  campaignId:string;
  campaignSha256:string;
  sourceDecisionSha256:string;
  sourceCandidateSha256:string;
  capabilityEvidenceSetSha256:string;
  assembledCandidateSha256:string;
  assembledCandidate:HsmeFoundationReuseCandidateV1;
}>;

export async function finalizeHsmeFoundationReuseDecisionV1(
  rawSourceDecision:unknown,
  assemblies:readonly HsmeFoundationReuseCandidateEvidenceAssemblyV1[],
  assemblyOrigin:HsmeFoundationReuseAssemblyOriginVerifierV1,
  pareto:HsmeFoundationParetoEfficiencyV1|null,
  expectedParetoEvidenceSha256:string|'UNKNOWN',
  paretoOrigin:HsmeFoundationParetoOriginVerifierV1,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<HsmeFoundationReuseDecisionFinalizationV1>{
  const blockers:string[]=[];
  let sourceDecision:HsmeFoundationReuseDecisionV1;
  try{
    sourceDecision=normalizeHsmeFoundationReuseDecisionV1(rawSourceDecision);
  }catch{
    return invalid(['FINALIZER_SOURCE_DECISION_INVALID']);
  }
  if(sourceDecision.decisionStatus!=='EVALUATION_PENDING'
    ||sourceDecision.selectedCandidateId!==undefined){
    blockers.push('FINALIZER_SOURCE_DECISION_NOT_PENDING');
  }

  let sourceDecisionSha256:string|'UNKNOWN'='UNKNOWN';
  try{
    sourceDecisionSha256=await hsmeFoundationReuseDecisionV1Digest(sourceDecision,hash);
  }catch{
    blockers.push('FINALIZER_SOURCE_DECISION_HASH_INVALID');
  }

  const reuseCandidates=sourceDecision.candidates
    .filter(value=>value.strategy!=='CONTROL_BASELINE')
    .sort((a,b)=>lexical(a.candidateId,b.candidateId));
  const reuseIds=reuseCandidates.map(value=>value.candidateId);
  if(new Set(reuseIds).size!==reuseIds.length){
    blockers.push('FINALIZER_SOURCE_CANDIDATE_DUPLICATE');
  }
  if(assemblies.length!==reuseCandidates.length){
    blockers.push('FINALIZER_ASSEMBLY_COUNT_MISMATCH');
  }

  const assemblyByCandidate=new Map<string,HsmeFoundationReuseCandidateEvidenceAssemblyV1>();
  for(const assembly of assemblies){
    if(assemblyByCandidate.has(assembly.candidateId)){
      blockers.push('FINALIZER_ASSEMBLY_CANDIDATE_DUPLICATE');
      continue;
    }
    assemblyByCandidate.set(assembly.candidateId,assembly);
    if(!reuseIds.includes(assembly.candidateId)){
      blockers.push('FINALIZER_ASSEMBLY_EXTRA_CANDIDATE');
    }
  }
  for(const candidateId of reuseIds){
    if(!assemblyByCandidate.has(candidateId)){
      blockers.push('FINALIZER_ASSEMBLY_CANDIDATE_MISSING');
    }
  }

  if(!digestKnown(sourceDecisionSha256)){
    blockers.push('FINALIZER_SOURCE_DECISION_DIGEST_MISSING');
    return invalid(blockers,{sourceDecisionSha256});
  }

  const validated:ValidatedAssembly[]=[];
  for(const sourceCandidate of reuseCandidates){
    const assembly=assemblyByCandidate.get(sourceCandidate.candidateId);
    if(!assembly)continue;
    const value=await validateAssembly(
      assembly,sourceCandidate,sourceDecisionSha256,assemblyOrigin,hash,blockers,
    );
    if(value)validated.push(value);
  }

  if(blockers.length>0){
    return invalid(blockers,{sourceDecisionSha256});
  }

  const commonCampaignId=unique(validated.map(value=>value.campaignId));
  const commonCampaignSha256=unique(validated.map(value=>value.campaignSha256));
  const commonRequiredCapabilities=unique(
    validated.map(value=>JSON.stringify([...value.requiredCapabilities].sort(lexical))),
  );
  if(!commonCampaignId||!commonCampaignSha256||!commonRequiredCapabilities){
    return invalid(['FINALIZER_ASSEMBLY_LINEAGE_INCONSISTENT'],{sourceDecisionSha256});
  }
  const requiredCapabilities=JSON.parse(commonRequiredCapabilities) as string[];
  const campaignId=commonCampaignId;
  const campaignSha256=commonCampaignSha256;

  const candidateAssemblySetSha256=await digest(
    HSME_FOUNDATION_REUSE_ASSEMBLY_SET_DIGEST_DOMAIN,
    {
      schemaVersion:HSME_FOUNDATION_REUSE_DECISION_FINALIZATION_V1_SCHEMA,
      sourceDecisionSha256,
      campaignId,
      campaignSha256,
      requiredCapabilities,
      assemblies:validated.map(value=>({
        candidateId:value.candidateId,
        state:value.state,
        capabilityEvidenceSetSha256:value.capabilityEvidenceSetSha256,
        assembledCandidateSha256:value.assembledCandidateSha256,
      })).sort((a,b)=>lexical(a.candidateId,b.candidateId)),
      productionAuthorityGranted:false,
      winnerSelectionAllowed:false,
    },
    hash,
    'FINALIZER_ASSEMBLY_SET_HASH_INVALID',
  );

  const validatedByCandidate=new Map(validated.map(value=>[value.candidateId,value] as const));
  const qualified=validated.filter(value=>value.state==='CANDIDATE_EVIDENCE_QUALIFIED');

  if(qualified.length===0){
    if(rejected.length!==validated.length){
      return invalid(['FINALIZER_NONQUALIFIED_CANDIDATE_UNRESOLVED'],{
        sourceDecisionSha256,campaignId,campaignSha256,candidateAssemblySetSha256,
      });
    }
    const finalRaw={
      ...sourceDecision,
      decisionStatus:'REUSE_PATH_INSUFFICIENT' as const,
      candidates:sourceDecision.candidates.map(candidate=>{
        if(candidate.strategy==='CONTROL_BASELINE')return candidate;
        return validatedByCandidate.get(candidate.candidateId)!.assembledCandidate;
      }),
    };
    delete (finalRaw as {selectedCandidateId?:string}).selectedCandidateId;

    let finalDecision:HsmeFoundationReuseDecisionV1;
    try{
      finalDecision=normalizeHsmeFoundationReuseDecisionV1(finalRaw);
    }catch{
      return invalid(['FINALIZER_REUSE_INSUFFICIENT_NOT_CANONICAL'],{
        sourceDecisionSha256,campaignId,campaignSha256,candidateAssemblySetSha256,
      });
    }
    if(!mayEscalateToFullHsmeStudentDistillationV1(finalDecision)){
      return invalid(['FINALIZER_FULL_STUDENT_ESCALATION_NOT_PROVEN'],{
        sourceDecisionSha256,campaignId,campaignSha256,candidateAssemblySetSha256,
      });
    }
    const finalDecisionSha256=await hsmeFoundationReuseDecisionV1Digest(finalDecision,hash);
    return Object.freeze({
      schemaVersion:HSME_FOUNDATION_REUSE_DECISION_FINALIZATION_V1_SCHEMA,
      state:'REUSE_PATH_INSUFFICIENT_READY',
      blockers:Object.freeze([]),
      sourceDecisionSha256,
      campaignId,
      campaignSha256,
      paretoEvidenceSha256:'UNKNOWN',
      candidateAssemblySetSha256,
      finalDecisionSha256,
      finalDecision,
      reuseAdvanceAllowed:false,
      fullStudentEscalationAllowed:true,
      ...authorityBoundary(),
    });
  }

  if(pareto===null||!digestKnown(expectedParetoEvidenceSha256)){
    return pending(['FINALIZER_PARETO_EVIDENCE_REQUIRED'],{
      sourceDecisionSha256,campaignId,campaignSha256,candidateAssemblySetSha256,
    });
  }

  let paretoEvidenceSha256:string;
  try{
    paretoEvidenceSha256=await hsmeFoundationParetoEfficiencyV1Digest(pareto,hash);
  }catch{
    return invalid(['FINALIZER_PARETO_DIGEST_INVALID'],{
      sourceDecisionSha256,campaignId,campaignSha256,candidateAssemblySetSha256,
    });
  }
  if(paretoEvidenceSha256!==expectedParetoEvidenceSha256){
    return invalid(['FINALIZER_PARETO_DIGEST_DRIFT'],{
      sourceDecisionSha256,campaignId,campaignSha256,candidateAssemblySetSha256,
      paretoEvidenceSha256,
    });
  }
  if(pareto.schemaVersion!==HSME_FOUNDATION_PARETO_EFFICIENCY_V1_SCHEMA
    ||pareto.policy!=='QUALITY_GATED_PARETO_NO_WEIGHTS'
    ||pareto.direction!=='LOWER_IS_BETTER'
    ||pareto.campaignId!==campaignId
    ||pareto.weightedAggregateScoreAllowed!==false
    ||pareto.lowerQualityCandidateAdmissionAllowed!==false
    ||pareto.deploymentTierAdmissionGranted!==false
    ||pareto.productionAuthorityGranted!==false
    ||pareto.providerAuthorityGranted!==false
    ||pareto.billingAuthorityGranted!==false
    ||pareto.projectArtifactMutationAllowed!==false
    ||pareto.aeeExecutionAuthorityGranted!==false
    ||pareto.durableModelFleetPromotionAllowed!==false
    ||pareto.trainingOrDistillationAllowed!==false
    ||pareto.winnerSelectionAllowed!==false){
    return invalid(['FINALIZER_PARETO_POLICY_OR_AUTHORITY_INVALID'],{
      sourceDecisionSha256,campaignId,campaignSha256,candidateAssemblySetSha256,
      paretoEvidenceSha256,
    });
  }

  let paretoTrusted=false;
  try{
    paretoTrusted=await paretoOrigin.verifyParetoEvidence(
      pareto,paretoEvidenceSha256,campaignId,campaignSha256,
    );
  }catch{
    paretoTrusted=false;
  }
  if(!paretoTrusted){
    return invalid(['FINALIZER_PARETO_ORIGIN_UNVERIFIED'],{
      sourceDecisionSha256,campaignId,campaignSha256,candidateAssemblySetSha256,
      paretoEvidenceSha256,
    });
  }

  const dominantIds:string[]=[];
  for(const capability of requiredCapabilities){
    const slices=pareto.slices.filter(value=>value.capability===capability);
    if(slices.length!==1){
      return invalid([
        slices.length===0?'FINALIZER_PARETO_REQUIRED_SLICE_MISSING':'FINALIZER_PARETO_REQUIRED_SLICE_DUPLICATE',
      ],{
        sourceDecisionSha256,campaignId,campaignSha256,candidateAssemblySetSha256,
        paretoEvidenceSha256,
      });
    }
    const slice=slices[0];
    if(slice.state!=='PARETO_FRONTIER_READY'){
      return invalid(['FINALIZER_PARETO_REQUIRED_SLICE_BLOCKED'],{
        sourceDecisionSha256,campaignId,campaignSha256,candidateAssemblySetSha256,
        paretoEvidenceSha256,
      });
    }
    if(!slice.uniqueEfficiencyDominantCandidateId){
      return pending(['FINALIZER_PARETO_UNIQUE_DOMINANT_MISSING'],{
        sourceDecisionSha256,campaignId,campaignSha256,candidateAssemblySetSha256,
        paretoEvidenceSha256,
      });
    }
    dominantIds.push(slice.uniqueEfficiencyDominantCandidateId);
  }
  const selectedCandidateId=unique(dominantIds);
  if(!selectedCandidateId){
    return pending(['FINALIZER_PARETO_DOMINANT_DIFFERS_BY_CAPABILITY'],{
      sourceDecisionSha256,campaignId,campaignSha256,candidateAssemblySetSha256,
      paretoEvidenceSha256,
    });
  }
  const selectedAssembly=validated.find(value=>value.candidateId===selectedCandidateId);
  if(!selectedAssembly||selectedAssembly.state!=='CANDIDATE_EVIDENCE_QUALIFIED'){
    return invalid(['FINALIZER_PARETO_SELECTED_CANDIDATE_NOT_QUALIFIED'],{
      sourceDecisionSha256,campaignId,campaignSha256,candidateAssemblySetSha256,
      paretoEvidenceSha256,
    });
  }

  const selected=selectedAssembly.assembledCandidate;
  const decisionStatus=selected.strategy==='DIRECT_FOUNDATION'
    ?'DIRECT_FOUNDATION_ADVANCE'
    :selected.strategy==='FROZEN_FOUNDATION_ADAPTATION'
      ?'BOUNDED_ADAPTATION_ADVANCE'
      :null;
  if(decisionStatus===null){
    return invalid(['FINALIZER_SELECTED_STRATEGY_INVALID'],{
      sourceDecisionSha256,campaignId,campaignSha256,candidateAssemblySetSha256,
      paretoEvidenceSha256,
    });
  }

  const finalRaw={
    ...sourceDecision,
    decisionStatus,
    selectedCandidateId,
    candidates:sourceDecision.candidates.map(candidate=>{
      if(candidate.strategy==='CONTROL_BASELINE')return candidate;
      return validatedByCandidate.get(candidate.candidateId)!.assembledCandidate;
    }),
  };
  let finalDecision:HsmeFoundationReuseDecisionV1;
  try{
    finalDecision=normalizeHsmeFoundationReuseDecisionV1(finalRaw);
  }catch{
    return invalid(['FINALIZER_ADVANCE_DECISION_NOT_CANONICAL'],{
      sourceDecisionSha256,campaignId,campaignSha256,candidateAssemblySetSha256,
      paretoEvidenceSha256,
    });
  }
  if(finalDecision.selectedCandidateId!==selectedCandidateId
    ||finalDecision.decisionStatus!==decisionStatus){
    return invalid(['FINALIZER_ADVANCE_DECISION_DRIFT'],{
      sourceDecisionSha256,campaignId,campaignSha256,candidateAssemblySetSha256,
      paretoEvidenceSha256,
    });
  }

  const finalDecisionSha256=await hsmeFoundationReuseDecisionV1Digest(finalDecision,hash);
  return Object.freeze({
    schemaVersion:HSME_FOUNDATION_REUSE_DECISION_FINALIZATION_V1_SCHEMA,
    state:decisionStatus==='DIRECT_FOUNDATION_ADVANCE'
      ?'DIRECT_FOUNDATION_ADVANCE_READY'
      :'BOUNDED_ADAPTATION_ADVANCE_READY',
    blockers:Object.freeze([]),
    sourceDecisionSha256,
    campaignId,
    campaignSha256,
    paretoEvidenceSha256,
    candidateAssemblySetSha256,
    finalDecisionSha256,
    selectedCandidateId,
    finalDecision,
    reuseAdvanceAllowed:true,
    fullStudentEscalationAllowed:false,
    ...authorityBoundary(),
  });
}

async function validateAssembly(
  assembly:HsmeFoundationReuseCandidateEvidenceAssemblyV1,
  sourceCandidate:HsmeFoundationReuseCandidateV1,
  sourceDecisionSha256:string,
  origin:HsmeFoundationReuseAssemblyOriginVerifierV1,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
  blockers:string[],
):Promise<ValidatedAssembly|null>{
  if(assembly.schemaVersion!==HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_ASSEMBLY_V1_SCHEMA){
    blockers.push('FINALIZER_ASSEMBLY_SCHEMA_INVALID');
    return null;
  }
  if(assembly.state!=='CANDIDATE_EVIDENCE_QUALIFIED'
    &&assembly.state!=='CANDIDATE_EVIDENCE_REJECTED'){
    blockers.push('FINALIZER_ASSEMBLY_NOT_READY');
    return null;
  }
  if(assembly.structuralCoverageBlockers.length!==0){
    blockers.push('FINALIZER_STRUCTURAL_COVERAGE_ASSEMBLY_FORBIDDEN');
    return null;
  }
  if(assembly.blockers.length!==0||assembly.assembledCandidate===null){
    blockers.push('FINALIZER_ASSEMBLY_PAYLOAD_INVALID');
    return null;
  }
  if(assembly.candidateId!==sourceCandidate.candidateId
    ||assembly.sourceDecisionSha256!==sourceDecisionSha256){
    blockers.push('FINALIZER_ASSEMBLY_SOURCE_DECISION_DRIFT');
  }
  if(!digestKnown(assembly.sourceCandidateSha256)
    ||!digestKnown(assembly.capabilityEvidenceSetSha256)
    ||!digestKnown(assembly.assembledCandidateSha256)
    ||!digestKnown(assembly.campaignSha256)
    ||assembly.campaignId==='UNKNOWN'){
    blockers.push('FINALIZER_ASSEMBLY_DIGEST_INCOMPLETE');
    return null;
  }

  let sourceCandidateSha256:string;
  try{
    sourceCandidateSha256=await digest(
      HSME_FOUNDATION_PENDING_REUSE_SOURCE_CANDIDATE_DIGEST_DOMAIN,
      sourceCandidate,hash,'FINALIZER_SOURCE_CANDIDATE_HASH_INVALID',
    );
  }catch{
    blockers.push('FINALIZER_SOURCE_CANDIDATE_HASH_INVALID');
    return null;
  }
  if(sourceCandidateSha256!==assembly.sourceCandidateSha256){
    blockers.push('FINALIZER_ASSEMBLY_SOURCE_CANDIDATE_DRIFT');
  }

  let assembledCandidate:HsmeFoundationReuseCandidateV1;
  try{
    assembledCandidate=normalizeHsmeFoundationReuseCandidateV1(assembly.assembledCandidate);
  }catch{
    blockers.push('FINALIZER_ASSEMBLED_CANDIDATE_INVALID');
    return null;
  }
  if(assembledCandidate.candidateId!==sourceCandidate.candidateId
    ||assembledCandidate.strategy!==sourceCandidate.strategy
    ||assembledCandidate.targetTier!==sourceCandidate.targetTier
    ||JSON.stringify(assembledCandidate.source)!==JSON.stringify(sourceCandidate.source)){
    blockers.push('FINALIZER_ASSEMBLED_CANDIDATE_IDENTITY_DRIFT');
  }
  if(assembly.state==='CANDIDATE_EVIDENCE_QUALIFIED'
    &&assembledCandidate.evidenceState!=='QUALIFIED'){
    blockers.push('FINALIZER_QUALIFIED_ASSEMBLY_STATE_DRIFT');
  }
  if(assembly.state==='CANDIDATE_EVIDENCE_REJECTED'
    &&assembledCandidate.evidenceState!=='REJECTED'){
    blockers.push('FINALIZER_REJECTED_ASSEMBLY_STATE_DRIFT');
  }

  const assembledCandidateSha256=await digest(
    HSME_FOUNDATION_REUSE_ASSEMBLED_CANDIDATE_DIGEST_DOMAIN,
    assembledCandidate,hash,'FINALIZER_ASSEMBLED_CANDIDATE_HASH_INVALID',
  );
  if(assembledCandidateSha256!==assembly.assembledCandidateSha256){
    blockers.push('FINALIZER_ASSEMBLED_CANDIDATE_HASH_MISMATCH');
  }
  if(assemblyAuthorityWidened(assembly)){
    blockers.push('FINALIZER_ASSEMBLY_AUTHORITY_WIDENING');
  }

  let trusted=false;
  try{
    trusted=await origin.verifyAssembly(
      assembly,
      assembly.capabilityEvidenceSetSha256 as string,
      assembly.assembledCandidateSha256 as string,
    );
  }catch{
    trusted=false;
  }
  if(!trusted){
    blockers.push('FINALIZER_ASSEMBLY_ORIGIN_UNVERIFIED');
    return null;
  }
  if(blockers.length>0)return null;

  return Object.freeze({
    candidateId:assembly.candidateId,
    state:assembly.state,
    requiredCapabilities:Object.freeze([...assembly.requiredCapabilities].sort(lexical)),
    campaignId:assembly.campaignId as string,
    campaignSha256:assembly.campaignSha256 as string,
    sourceDecisionSha256:assembly.sourceDecisionSha256 as string,
    sourceCandidateSha256:assembly.sourceCandidateSha256 as string,
    capabilityEvidenceSetSha256:assembly.capabilityEvidenceSetSha256 as string,
    assembledCandidateSha256:assembly.assembledCandidateSha256 as string,
    assembledCandidate,
  });
}

function assemblyAuthorityWidened(
  assembly:HsmeFoundationReuseCandidateEvidenceAssemblyV1,
):boolean{
  return assembly.decisionMutationAllowed!==false
    ||assembly.candidateSelectionAllowed!==false
    ||assembly.selectedCandidateIdAllowed!==false
    ||assembly.reuseAdvanceAllowed!==false
    ||assembly.fullStudentEscalationAllowed!==false
    ||assembly.modelFleetPromotionAllowed!==false
    ||assembly.installOrDownloadAllowed!==false
    ||assembly.productionAuthorityGranted!==false
    ||assembly.providerAuthorityGranted!==false
    ||assembly.billingAuthorityGranted!==false
    ||assembly.projectArtifactMutationAllowed!==false
    ||assembly.aeeExecutionAuthorityGranted!==false
    ||assembly.durableModelFleetPromotionAllowed!==false
    ||assembly.trainingOrDistillationAllowed!==false
    ||assembly.winnerSelectionAllowed!==false;
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

function digestKnown(value:string|'UNKNOWN'):value is string{
  return value!=='UNKNOWN'&&HEX64.test(value);
}

function unique(values:readonly string[]):string|null{
  if(values.length<1)return null;
  const first=values[0];
  return values.every(value=>value===first)?first:null;
}

function lexical(a:string,b:string):number{return a<b?-1:a>b?1:0;}

function authorityBoundary(){
  return Object.freeze({
    candidateSelectionAllowed:false as const,
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

function invalid(
  blockers:readonly string[],
  values:Partial<Pick<
    HsmeFoundationReuseDecisionFinalizationV1,
    'sourceDecisionSha256'|'campaignId'|'campaignSha256'|'paretoEvidenceSha256'|
    'candidateAssemblySetSha256'
  >>={},
):HsmeFoundationReuseDecisionFinalizationV1{
  return Object.freeze({
    schemaVersion:HSME_FOUNDATION_REUSE_DECISION_FINALIZATION_V1_SCHEMA,
    state:'FINALIZATION_INVALID',
    blockers:Object.freeze([...new Set(blockers)]),
    sourceDecisionSha256:values.sourceDecisionSha256??'UNKNOWN',
    campaignId:values.campaignId??'UNKNOWN',
    campaignSha256:values.campaignSha256??'UNKNOWN',
    paretoEvidenceSha256:values.paretoEvidenceSha256??'UNKNOWN',
    candidateAssemblySetSha256:values.candidateAssemblySetSha256??'UNKNOWN',
    finalDecisionSha256:'UNKNOWN',
    finalDecision:null,
    reuseAdvanceAllowed:false,
    fullStudentEscalationAllowed:false,
    ...authorityBoundary(),
  });
}

function pending(
  blockers:readonly string[],
  values:Partial<Pick<
    HsmeFoundationReuseDecisionFinalizationV1,
    'sourceDecisionSha256'|'campaignId'|'campaignSha256'|'paretoEvidenceSha256'|
    'candidateAssemblySetSha256'
  >>={},
):HsmeFoundationReuseDecisionFinalizationV1{
  return Object.freeze({
    schemaVersion:HSME_FOUNDATION_REUSE_DECISION_FINALIZATION_V1_SCHEMA,
    state:'FINALIZATION_PENDING_AMBIGUOUS',
    blockers:Object.freeze([...new Set(blockers)]),
    sourceDecisionSha256:values.sourceDecisionSha256??'UNKNOWN',
    campaignId:values.campaignId??'UNKNOWN',
    campaignSha256:values.campaignSha256??'UNKNOWN',
    paretoEvidenceSha256:values.paretoEvidenceSha256??'UNKNOWN',
    candidateAssemblySetSha256:values.candidateAssemblySetSha256??'UNKNOWN',
    finalDecisionSha256:'UNKNOWN',
    finalDecision:null,
    reuseAdvanceAllowed:false,
    fullStudentEscalationAllowed:false,
    ...authorityBoundary(),
  });
}
