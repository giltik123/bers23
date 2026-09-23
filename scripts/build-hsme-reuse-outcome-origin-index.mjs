#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

import {
  normalizeHsmeFoundationReuseDecisionV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationReuseDecisionV1.ts';
import {
  normalizeHsmeFoundationBenchmarkCampaignV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkCampaignV1.ts';
import {
  HSME_FOUNDATION_QUALITY_FRONTIER_V1_SCHEMA,
  hsmeFoundationQualityFrontierV1Digest,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationQualityFrontierV1.ts';
import {
  HSME_FOUNDATION_PARETO_EFFICIENCY_V1_SCHEMA,
  hsmeFoundationParetoEfficiencyV1Digest,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationParetoEfficiencyV1.ts';
import {
  HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_ASSEMBLY_V1_SCHEMA,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationReuseCandidateEvidenceAssemblyV1.ts';
import {
  HSME_REUSE_OUTCOME_ORIGIN_INDEX_V1_SCHEMA,
  hsmeReuseOutcomeOriginIndexV1Digest,
  normalizeHsmeReuseOutcomeOriginIndexV1,
} from '../src/platform/creative/local-ai/hsme/HsmeReuseOutcomeOriginIndexV1.ts';

export const HSME_REUSE_OUTCOME_ORIGIN_INDEX_FREEZE_V1_SCHEMA =
  'BERS_HSME_REUSE_OUTCOME_ORIGIN_INDEX_FREEZE_V1';

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[a-z0-9][a-z0-9._:@/-]*$/;

export class HsmeReuseOutcomeOriginIndexBuilderError extends Error{
  constructor(code,message){
    super(message);
    this.name='HsmeReuseOutcomeOriginIndexBuilderError';
    this.code=code;
  }
}

function fail(code,message){
  throw new HsmeReuseOutcomeOriginIndexBuilderError(code,message);
}

export const hashPort=Object.freeze({
  async sha256(bytes){
    return createHash('sha256').update(bytes).digest('hex');
  },
});

export function canonicalValue(value){
  if(Array.isArray(value))return value.map(canonicalValue);
  if(value&&typeof value==='object'){
    return Object.fromEntries(
      Object.keys(value).sort(lexical).map(key=>[key,canonicalValue(value[key])]),
    );
  }
  return value;
}

export function canonicalFileBytes(value){
  return Buffer.from(JSON.stringify(canonicalValue(value))+'\n','utf8');
}

export function sha256Bytes(bytes){
  return createHash('sha256').update(bytes).digest('hex');
}

async function loadJsonFile(path,label){
  let bytes;
  try{
    bytes=await readFile(path);
  }catch(error){
    fail('hsme_reuse_origin_builder_file_read_failed',label+': '+error.message);
  }
  let value;
  try{
    value=JSON.parse(bytes.toString('utf8'));
  }catch(error){
    fail('hsme_reuse_origin_builder_json_invalid',label+': '+error.message);
  }
  return Object.freeze({
    path:resolve(path),
    bytes,
    fileSha256:sha256Bytes(bytes),
    value:deepFreeze(value),
  });
}

function object(value,label){
  if(value===null||typeof value!=='object'||Array.isArray(value)){
    fail('hsme_reuse_origin_builder_record_invalid',label+' must be an object');
  }
  return value;
}

function string(value,label,max=200){
  if(
    typeof value!=='string'
    ||value.length<1
    ||value.length>max
    ||value.trim()!==value
    ||/[\u0000-\u001f\u007f]/.test(value)
  ){
    fail('hsme_reuse_origin_builder_text_invalid',label+' is invalid');
  }
  return value;
}

function identifier(value,label,max=160){
  const result=string(value,label,max);
  if(!IDENTIFIER.test(result)){
    fail('hsme_reuse_origin_builder_identifier_invalid',label+' is invalid');
  }
  return result;
}

function digest(value,label,{allowUnknown=false}={}){
  if(allowUnknown&&value==='UNKNOWN')return value;
  const result=string(value,label,64);
  if(!HEX64.test(result)){
    fail('hsme_reuse_origin_builder_hash_invalid',label+' must be lowercase SHA-256');
  }
  return result;
}

function requireNoAuthorityWidening(value,label){
  const record=object(value,label);
  for(const field of [
    'trainingRunStartAllowed',
    'trainingOrDistillationAllowed',
    'modelInstallAllowed',
    'installOrDownloadAllowed',
    'modelFleetPromotionAllowed',
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted',
    'durableModelFleetPromotionAllowed',
    'winnerSelectionAllowed',
    'candidateSelectionAllowed',
    'selectedCandidateIdAllowed',
    'reuseAdvanceAllowed',
    'fullStudentEscalationAllowed',
  ]){
    if(Object.hasOwn(record,field)&&record[field]!==false){
      fail(
        'hsme_reuse_origin_builder_authority_widening',
        label+'.'+field+' must remain false',
      );
    }
  }
}

function validateFrontierEnvelope(raw,campaign){
  const record=object(raw,'quality frontier');
  if(record.schemaVersion!==HSME_FOUNDATION_QUALITY_FRONTIER_V1_SCHEMA){
    fail('hsme_reuse_origin_builder_frontier_schema','quality frontier schema invalid');
  }
  if(record.campaignId!==campaign.campaignId){
    fail('hsme_reuse_origin_builder_frontier_campaign','quality frontier campaign drift');
  }
  if(record.qualityPolicy!=='QUALITY_FLOOR_BEFORE_EFFICIENCY'){
    fail('hsme_reuse_origin_builder_frontier_policy','quality frontier policy drift');
  }
  if(!Array.isArray(record.slices)||record.slices.length<1){
    fail('hsme_reuse_origin_builder_frontier_slices','quality frontier slices missing');
  }
  digest(record.qualityFinalizationSha256,'qualityFrontier.qualityFinalizationSha256');
  requireNoAuthorityWidening(record,'quality frontier');
  return record;
}

function validateParetoEnvelope(raw,campaign,frontierSha){
  const record=object(raw,'Pareto efficiency');
  if(record.schemaVersion!==HSME_FOUNDATION_PARETO_EFFICIENCY_V1_SCHEMA){
    fail('hsme_reuse_origin_builder_pareto_schema','Pareto schema invalid');
  }
  if(record.campaignId!==campaign.campaignId){
    fail('hsme_reuse_origin_builder_pareto_campaign','Pareto campaign drift');
  }
  if(record.qualityFrontierSha256!==frontierSha){
    fail(
      'hsme_reuse_origin_builder_pareto_frontier_binding',
      'Pareto qualityFrontierSha256 differs from canonical frontier digest',
    );
  }
  if(record.policy!=='QUALITY_GATED_PARETO_NO_WEIGHTS'){
    fail('hsme_reuse_origin_builder_pareto_policy','Pareto policy drift');
  }
  if(!Array.isArray(record.slices)||record.slices.length<1){
    fail('hsme_reuse_origin_builder_pareto_slices','Pareto slices missing');
  }
  digest(record.resourceEvidenceSha256,'pareto.resourceEvidenceSha256');
  requireNoAuthorityWidening(record,'Pareto efficiency');
  return record;
}

function validateAssemblyEnvelope(raw,decision,campaign){
  const record=object(raw,'candidate assembly');
  if(record.schemaVersion!==HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_ASSEMBLY_V1_SCHEMA){
    fail('hsme_reuse_origin_builder_assembly_schema','candidate assembly schema invalid');
  }
  const candidateId=identifier(record.candidateId,'candidateAssembly.candidateId',120);
  if(!decision.candidates.some(value=>value.candidateId===candidateId)){
    fail(
      'hsme_reuse_origin_builder_assembly_decision_scope',
      'candidate assembly is absent from source decision: '+candidateId,
    );
  }
  if(!campaign.candidates.some(value=>value.candidateId===candidateId)){
    fail(
      'hsme_reuse_origin_builder_assembly_campaign_scope',
      'candidate assembly is absent from campaign: '+candidateId,
    );
  }
  const candidateEvidenceSetSha256=digest(
    record.candidateEvidenceSetSha256,
    'candidateAssembly.candidateEvidenceSetSha256',
    {allowUnknown:true},
  );
  requireNoAuthorityWidening(record,'candidate assembly '+candidateId);
  return {candidateId,candidateEvidenceSetSha256};
}

export async function buildHsmeReuseOutcomeOriginIndexCandidate({
  sourceDecision,
  campaign,
  assemblies,
  frontier,
  pareto,
}){
  let normalizedDecision;
  let normalizedCampaign;
  try{
    normalizedDecision=normalizeHsmeFoundationReuseDecisionV1(sourceDecision.value);
    normalizedCampaign=normalizeHsmeFoundationBenchmarkCampaignV1(campaign.value);
  }catch(error){
    fail(
      'hsme_reuse_origin_builder_source_invalid',
      error.code?error.code+': '+error.message:error.message,
    );
  }

  if(normalizedDecision.decisionStatus!=='EVALUATION_PENDING'
    ||normalizedDecision.selectedCandidateId!==undefined){
    fail(
      'hsme_reuse_origin_builder_source_not_pending',
      'source decision must remain EVALUATION_PENDING without selection',
    );
  }
  if(normalizedCampaign.status!=='FIXTURES_PINNED'){
    fail(
      'hsme_reuse_origin_builder_campaign_not_pinned',
      'benchmark campaign must be FIXTURES_PINNED',
    );
  }
  requireNoAuthorityWidening(normalizedDecision,'source decision');
  requireNoAuthorityWidening(normalizedCampaign,'campaign');

  const frontierValue=validateFrontierEnvelope(frontier.value,normalizedCampaign);
  const qualityFrontierSha256=await hsmeFoundationQualityFrontierV1Digest(
    frontierValue,
    hashPort,
  );
  digest(qualityFrontierSha256,'computed qualityFrontierSha256');

  const paretoValue=validateParetoEnvelope(
    pareto.value,
    normalizedCampaign,
    qualityFrontierSha256,
  );
  const paretoEvidenceSha256=await hsmeFoundationParetoEfficiencyV1Digest(
    paretoValue,
    hashPort,
  );
  digest(paretoEvidenceSha256,'computed paretoEvidenceSha256');

  const seen=new Set();
  const candidateAssemblies=[];
  for(const loaded of assemblies){
    const meta=validateAssemblyEnvelope(
      loaded.value,
      normalizedDecision,
      normalizedCampaign,
    );
    if(seen.has(meta.candidateId)){
      fail(
        'hsme_reuse_origin_builder_assembly_duplicate',
        'duplicate candidate assembly '+meta.candidateId,
      );
    }
    seen.add(meta.candidateId);
    candidateAssemblies.push(Object.freeze({
      candidateId:meta.candidateId,
      fileSha256:loaded.fileSha256,
      candidateEvidenceSetSha256:meta.candidateEvidenceSetSha256,
    }));
  }
  candidateAssemblies.sort((a,b)=>lexical(a.candidateId,b.candidateId));

  const rawIndex={
    schemaVersion:HSME_REUSE_OUTCOME_ORIGIN_INDEX_V1_SCHEMA,
    sourceDecisionFileSha256:sourceDecision.fileSha256,
    campaignFileSha256:campaign.fileSha256,
    candidateAssemblies,
    qualityFrontier:{
      fileSha256:frontier.fileSha256,
      qualityFrontierSha256,
    },
    paretoEfficiency:{
      fileSha256:pareto.fileSha256,
      paretoEvidenceSha256,
    },
    trainingRunStartAllowed:false,
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    durableModelFleetPromotionAllowed:false,
    winnerSelectionAllowed:false,
  };

  const originIndex=normalizeHsmeReuseOutcomeOriginIndexV1(rawIndex);
  const originIndexSha256=await hsmeReuseOutcomeOriginIndexV1Digest(
    originIndex,
    hashPort,
  );
  const originIndexBytes=canonicalFileBytes(originIndex);
  const originIndexFileSha256=sha256Bytes(originIndexBytes);

  const digestSidecar=Object.freeze({
    schemaVersion:HSME_REUSE_OUTCOME_ORIGIN_INDEX_FREEZE_V1_SCHEMA,
    trustState:'FREEZE_CANDIDATE',
    externalPinRequired:true,
    originIndexSha256,
    originIndexFileSha256,
    sourceDecisionFileSha256:sourceDecision.fileSha256,
    campaignFileSha256:campaign.fileSha256,
    candidateAssemblyCount:candidateAssemblies.length,
    qualityFrontierSha256,
    paretoEvidenceSha256,
    finalizationAllowed:false,
    handoffAllowed:false,
    trainingRunStartAllowed:false,
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    durableModelFleetPromotionAllowed:false,
    winnerSelectionAllowed:false,
  });

  return Object.freeze({
    originIndex,
    digestSidecar,
    files:Object.freeze({
      originIndex:originIndexBytes,
      digestSidecar:canonicalFileBytes(digestSidecar),
    }),
  });
}

function parseArgs(argv){
  const single=new Map();
  const assemblies=[];
  for(let index=0;index<argv.length;index+=1){
    const key=argv[index];
    if(!key.startsWith('--')){
      fail('hsme_reuse_origin_builder_cli_invalid','unexpected argument '+key);
    }
    if(index+1>=argv.length){
      fail('hsme_reuse_origin_builder_cli_invalid','missing value for '+key);
    }
    const value=argv[++index];
    if(key==='--assembly'){
      assemblies.push(value);
      continue;
    }
    if(single.has(key)){
      fail('hsme_reuse_origin_builder_cli_invalid','duplicate argument '+key);
    }
    single.set(key,value);
  }
  for(const key of [
    '--source-decision',
    '--campaign',
    '--frontier',
    '--pareto',
    '--output-dir',
  ]){
    if(!single.has(key)){
      fail('hsme_reuse_origin_builder_cli_invalid','missing '+key);
    }
  }
  return Object.freeze({
    sourceDecision:single.get('--source-decision'),
    campaign:single.get('--campaign'),
    assemblies:Object.freeze(assemblies),
    frontier:single.get('--frontier'),
    pareto:single.get('--pareto'),
    outputDir:single.get('--output-dir'),
  });
}

function requireOutputNotInput(outputDir,inputPaths){
  const outputs=[
    resolve(outputDir,'reuse-outcome-origin-index.json'),
    resolve(outputDir,'reuse-outcome-origin-index-digest.json'),
  ];
  const inputs=new Set(inputPaths.map(path=>resolve(path)));
  for(const output of outputs){
    if(inputs.has(output)){
      fail(
        'hsme_reuse_origin_builder_output_collision',
        'output path collides with trusted input: '+output,
      );
    }
  }
}

export async function runCli(argv=process.argv.slice(2)){
  const args=parseArgs(argv);
  requireOutputNotInput(args.outputDir,[
    args.sourceDecision,
    args.campaign,
    ...args.assemblies,
    args.frontier,
    args.pareto,
  ]);

  const [
    sourceDecision,
    campaign,
    frontier,
    pareto,
    ...assemblies
  ]=await Promise.all([
    loadJsonFile(args.sourceDecision,'source decision'),
    loadJsonFile(args.campaign,'campaign'),
    loadJsonFile(args.frontier,'quality frontier'),
    loadJsonFile(args.pareto,'Pareto efficiency'),
    ...args.assemblies.map((path,index)=>
      loadJsonFile(path,'candidate assembly '+index)
    ),
  ]);

  const result=await buildHsmeReuseOutcomeOriginIndexCandidate({
    sourceDecision,
    campaign,
    assemblies,
    frontier,
    pareto,
  });

  await mkdir(args.outputDir,{recursive:true});
  await Promise.all([
    writeFile(
      resolve(args.outputDir,'reuse-outcome-origin-index.json'),
      result.files.originIndex,
    ),
    writeFile(
      resolve(args.outputDir,'reuse-outcome-origin-index-digest.json'),
      result.files.digestSidecar,
    ),
  ]);

  process.stdout.write(JSON.stringify({
    schemaVersion:HSME_REUSE_OUTCOME_ORIGIN_INDEX_FREEZE_V1_SCHEMA,
    trustState:'FREEZE_CANDIDATE',
    externalPinRequired:true,
    originIndexSha256:result.digestSidecar.originIndexSha256,
    originIndexFileSha256:result.digestSidecar.originIndexFileSha256,
  })+'\n');
}

if(process.env.HSME_REUSE_OUTCOME_ORIGIN_BUILDER_CLI==='1'){
  runCli().catch(error=>{
    process.stderr.write(
      (error.code||'hsme_reuse_origin_builder_failed')
      +': '+error.message+'\n',
    );
    process.exitCode=1;
  });
}

function deepFreeze(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const child of Object.values(value))deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function lexical(left,right){
  return left<right?-1:left>right?1:0;
}
