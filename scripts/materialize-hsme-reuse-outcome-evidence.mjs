#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

import {
  finalizeHsmeFoundationReuseDecisionV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationReuseDecisionFinalizationV1.ts';
import {
  proveHsmeReuseOutcomeHandoffV1,
} from '../src/platform/creative/local-ai/hsme/HsmeReuseOutcomeHandoffV1.ts';

export const HSME_REUSE_OUTCOME_ORIGIN_INDEX_V1_SCHEMA =
  'BERS_HSME_REUSE_OUTCOME_ORIGIN_INDEX_V1';
export const HSME_REUSE_OUTCOME_MATERIALIZATION_EVIDENCE_V1_SCHEMA =
  'BERS_HSME_REUSE_OUTCOME_MATERIALIZATION_EVIDENCE_V1';
export const HSME_REUSE_OUTCOME_ORIGIN_INDEX_DIGEST_DOMAIN =
  'bers:hsme:reuse-outcome-origin-index:v1\0';
export const HSME_REUSE_OUTCOME_MATERIALIZATION_DIGEST_DOMAIN =
  'bers:hsme:reuse-outcome-materialization:v1\0';

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[a-z0-9][a-z0-9._:@/-]*$/;

export class HsmeReuseOutcomeMaterializationError extends Error{
  constructor(code,message){
    super(message);
    this.name='HsmeReuseOutcomeMaterializationError';
    this.code=code;
  }
}

function fail(code,message){
  throw new HsmeReuseOutcomeMaterializationError(code,message);
}

export const hashPort=Object.freeze({
  async sha256(bytes){
    return createHash('sha256').update(bytes).digest('hex');
  },
});

export function canonicalValue(value){
  if(Array.isArray(value))return value.map(canonicalValue);
  if(value&&typeof value==='object'){
    const record=value;
    return Object.fromEntries(
      Object.keys(record).sort(lexical).map(key=>[key,canonicalValue(record[key])]),
    );
  }
  return value;
}

export function canonicalBytes(value){
  return Buffer.from(JSON.stringify(canonicalValue(value)),'utf8');
}

export function canonicalFileBytes(value){
  return Buffer.concat([canonicalBytes(value),Buffer.from('\n','utf8')]);
}

export function sha256Bytes(bytes){
  return createHash('sha256').update(bytes).digest('hex');
}

export function domainDigest(domain,value){
  return sha256Bytes(Buffer.concat([
    Buffer.from(domain,'utf8'),
    canonicalBytes(value),
  ]));
}

function exactRecord(raw,allowed,path){
  if(raw===null||typeof raw!=='object'||Array.isArray(raw)){
    fail('hsme_reuse_materialization_record_invalid',path+' must be an object');
  }
  for(const key of Object.keys(raw)){
    if(!allowed.includes(key)){
      fail('hsme_reuse_materialization_field_unknown',path+'.'+key+' is not allowed');
    }
  }
  for(const key of allowed){
    if(!Object.hasOwn(raw,key)){
      fail('hsme_reuse_materialization_field_missing',path+'.'+key+' is required');
    }
  }
  return raw;
}

function text(value,path,max){
  if(
    typeof value!=='string'
    ||value.length<1
    ||value.length>max
    ||value.trim()!==value
    ||/[\u0000-\u001f\u007f]/.test(value)
  ){
    fail('hsme_reuse_materialization_text_invalid',path+' is invalid');
  }
  return value;
}

function identifier(value,path,max=160){
  const result=text(value,path,max);
  if(!IDENTIFIER.test(result)){
    fail('hsme_reuse_materialization_identifier_invalid',path+' is invalid');
  }
  return result;
}

function sha256(value,path){
  const result=text(value,path,64);
  if(!HEX64.test(result)){
    fail('hsme_reuse_materialization_hash_invalid',path+' must be lowercase SHA-256');
  }
  return result;
}

function falseValue(value,path){
  if(value!==false){
    fail('hsme_reuse_materialization_authority_invalid',path+' must remain false');
  }
  return false;
}

function digestOrUnknown(value,path){
  if(value==='UNKNOWN')return value;
  return sha256(value,path);
}

export function normalizeOriginIndex(raw){
  const record=exactRecord(raw,[
    'schemaVersion',
    'sourceDecisionFileSha256',
    'campaignFileSha256',
    'candidateAssemblies',
    'qualityFrontier',
    'paretoEfficiency',
    'trainingRunStartAllowed',
    'modelInstallAllowed',
    'modelFleetPromotionAllowed',
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted',
    'durableModelFleetPromotionAllowed',
    'winnerSelectionAllowed',
  ],'originIndex');

  if(record.schemaVersion!==HSME_REUSE_OUTCOME_ORIGIN_INDEX_V1_SCHEMA){
    fail('hsme_reuse_materialization_origin_schema_invalid','origin index schema invalid');
  }
  if(!Array.isArray(record.candidateAssemblies)||record.candidateAssemblies.length>16){
    fail(
      'hsme_reuse_materialization_origin_assembly_count_invalid',
      'origin index candidateAssemblies must contain 0..16 entries',
    );
  }

  const candidateAssemblies=record.candidateAssemblies.map((rawEntry,index)=>{
    const entry=exactRecord(rawEntry,[
      'candidateId',
      'fileSha256',
      'candidateEvidenceSetSha256',
    ],'originIndex.candidateAssemblies['+index+']');
    return Object.freeze({
      candidateId:identifier(entry.candidateId,'candidateAssemblies['+index+'].candidateId',120),
      fileSha256:sha256(entry.fileSha256,'candidateAssemblies['+index+'].fileSha256'),
      candidateEvidenceSetSha256:digestOrUnknown(
        entry.candidateEvidenceSetSha256,
        'candidateAssemblies['+index+'].candidateEvidenceSetSha256',
      ),
    });
  }).sort((a,b)=>lexical(a.candidateId,b.candidateId));

  if(new Set(candidateAssemblies.map(value=>value.candidateId)).size!==candidateAssemblies.length){
    fail(
      'hsme_reuse_materialization_origin_assembly_duplicate',
      'origin index candidate ids must be unique',
    );
  }

  const frontierRecord=exactRecord(record.qualityFrontier,[
    'fileSha256','qualityFrontierSha256',
  ],'originIndex.qualityFrontier');
  const paretoRecord=exactRecord(record.paretoEfficiency,[
    'fileSha256','paretoEvidenceSha256',
  ],'originIndex.paretoEfficiency');

  return Object.freeze({
    schemaVersion:HSME_REUSE_OUTCOME_ORIGIN_INDEX_V1_SCHEMA,
    sourceDecisionFileSha256:sha256(
      record.sourceDecisionFileSha256,
      'originIndex.sourceDecisionFileSha256',
    ),
    campaignFileSha256:sha256(
      record.campaignFileSha256,
      'originIndex.campaignFileSha256',
    ),
    candidateAssemblies:Object.freeze(candidateAssemblies),
    qualityFrontier:Object.freeze({
      fileSha256:sha256(
        frontierRecord.fileSha256,
        'originIndex.qualityFrontier.fileSha256',
      ),
      qualityFrontierSha256:sha256(
        frontierRecord.qualityFrontierSha256,
        'originIndex.qualityFrontier.qualityFrontierSha256',
      ),
    }),
    paretoEfficiency:Object.freeze({
      fileSha256:sha256(
        paretoRecord.fileSha256,
        'originIndex.paretoEfficiency.fileSha256',
      ),
      paretoEvidenceSha256:sha256(
        paretoRecord.paretoEvidenceSha256,
        'originIndex.paretoEfficiency.paretoEvidenceSha256',
      ),
    }),
    trainingRunStartAllowed:falseValue(
      record.trainingRunStartAllowed,
      'originIndex.trainingRunStartAllowed',
    ),
    modelInstallAllowed:falseValue(
      record.modelInstallAllowed,
      'originIndex.modelInstallAllowed',
    ),
    modelFleetPromotionAllowed:falseValue(
      record.modelFleetPromotionAllowed,
      'originIndex.modelFleetPromotionAllowed',
    ),
    productionAuthorityGranted:falseValue(
      record.productionAuthorityGranted,
      'originIndex.productionAuthorityGranted',
    ),
    providerAuthorityGranted:falseValue(
      record.providerAuthorityGranted,
      'originIndex.providerAuthorityGranted',
    ),
    billingAuthorityGranted:falseValue(
      record.billingAuthorityGranted,
      'originIndex.billingAuthorityGranted',
    ),
    projectArtifactMutationAllowed:falseValue(
      record.projectArtifactMutationAllowed,
      'originIndex.projectArtifactMutationAllowed',
    ),
    aeeExecutionAuthorityGranted:falseValue(
      record.aeeExecutionAuthorityGranted,
      'originIndex.aeeExecutionAuthorityGranted',
    ),
    durableModelFleetPromotionAllowed:falseValue(
      record.durableModelFleetPromotionAllowed,
      'originIndex.durableModelFleetPromotionAllowed',
    ),
    winnerSelectionAllowed:falseValue(
      record.winnerSelectionAllowed,
      'originIndex.winnerSelectionAllowed',
    ),
  });
}

function deepFreeze(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const child of Object.values(value))deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

async function loadJsonFile(path,label){
  let bytes;
  try{
    bytes=await readFile(path);
  }catch(error){
    fail('hsme_reuse_materialization_file_read_failed',label+': '+error.message);
  }
  let value;
  try{
    value=JSON.parse(bytes.toString('utf8'));
  }catch(error){
    fail('hsme_reuse_materialization_json_invalid',label+': '+error.message);
  }
  return Object.freeze({
    path:resolve(path),
    bytes,
    fileSha256:sha256Bytes(bytes),
    value:deepFreeze(value),
  });
}

function requireFileDigest(loaded,expected,label){
  if(loaded.fileSha256!==expected){
    fail(
      'hsme_reuse_materialization_file_digest_mismatch',
      label+' raw file SHA-256 differs from trusted origin index',
    );
  }
}

function normalizeAssemblyInputs(loadedAssemblies,index){
  const indexed=new Map(index.candidateAssemblies.map(value=>[value.candidateId,value]));
  const loaded=new Map();
  for(const item of loadedAssemblies){
    const raw=item.value;
    if(raw===null||typeof raw!=='object'||Array.isArray(raw)){
      fail('hsme_reuse_materialization_assembly_invalid','assembly JSON must be an object');
    }
    const candidateId=identifier(raw.candidateId,'assembly.candidateId',120);
    if(loaded.has(candidateId)){
      fail(
        'hsme_reuse_materialization_assembly_duplicate',
        'duplicate assembly input for '+candidateId,
      );
    }
    const entry=indexed.get(candidateId);
    if(!entry){
      fail(
        'hsme_reuse_materialization_assembly_not_indexed',
        'assembly '+candidateId+' is absent from trusted origin index',
      );
    }
    requireFileDigest(item,entry.fileSha256,'assembly '+candidateId);
    if(raw.candidateEvidenceSetSha256!==entry.candidateEvidenceSetSha256){
      fail(
        'hsme_reuse_materialization_assembly_semantic_digest_mismatch',
        'assembly '+candidateId+' candidateEvidenceSetSha256 differs from origin index',
      );
    }
    loaded.set(candidateId,item);
  }

  if(loaded.size!==indexed.size){
    fail(
      'hsme_reuse_materialization_assembly_set_mismatch',
      'loaded assembly candidate set must exactly equal trusted origin index',
    );
  }
  return Object.freeze([...loaded.values()].sort(
    (a,b)=>lexical(a.value.candidateId,b.value.candidateId),
  ));
}

function inputAuthorityFalse(value){
  if(!value||typeof value!=='object')return true;
  for(const field of [
    'trainingRunStartAllowed',
    'modelInstallAllowed',
    'modelFleetPromotionAllowed',
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted',
    'durableModelFleetPromotionAllowed',
    'winnerSelectionAllowed',
  ]){
    if(Object.hasOwn(value,field)&&value[field]!==false)return false;
  }
  return true;
}

function requireNoAuthorityWidening(loaded,label){
  if(!inputAuthorityFalse(loaded.value)){
    fail(
      'hsme_reuse_materialization_input_authority_widening',
      label+' contains authority widening',
    );
  }
}

export async function materializeHsmeReuseOutcomeEvidence({
  sourceDecision,
  campaign,
  assemblies,
  frontier,
  pareto,
  originIndex,
  expectedOriginIndexSha256,
}){
  if(!HEX64.test(expectedOriginIndexSha256)){
    fail(
      'hsme_reuse_materialization_expected_origin_digest_invalid',
      'expected origin-index digest must be lowercase SHA-256',
    );
  }

  const normalizedIndex=normalizeOriginIndex(originIndex.value);
  const originIndexSha256=domainDigest(
    HSME_REUSE_OUTCOME_ORIGIN_INDEX_DIGEST_DOMAIN,
    normalizedIndex,
  );
  if(originIndexSha256!==expectedOriginIndexSha256){
    fail(
      'hsme_reuse_materialization_origin_digest_mismatch',
      'origin index digest differs from external expected digest',
    );
  }

  requireFileDigest(
    sourceDecision,
    normalizedIndex.sourceDecisionFileSha256,
    'source decision',
  );
  requireFileDigest(
    campaign,
    normalizedIndex.campaignFileSha256,
    'campaign',
  );
  requireFileDigest(
    frontier,
    normalizedIndex.qualityFrontier.fileSha256,
    'quality frontier',
  );
  requireFileDigest(
    pareto,
    normalizedIndex.paretoEfficiency.fileSha256,
    'Pareto efficiency',
  );

  requireNoAuthorityWidening(sourceDecision,'source decision');
  requireNoAuthorityWidening(campaign,'campaign');
  requireNoAuthorityWidening(frontier,'quality frontier');
  requireNoAuthorityWidening(pareto,'Pareto efficiency');

  const normalizedAssemblies=normalizeAssemblyInputs(assemblies,normalizedIndex);
  for(const item of normalizedAssemblies){
    requireNoAuthorityWidening(item,'candidate assembly');
  }

  const assemblyById=new Map(
    normalizedAssemblies.map(item=>[item.value.candidateId,item]),
  );
  let finalizerVerifierCallCount=0;
  const finalizerOrigin=Object.freeze({
    async verifyCandidateAssembly(assembly,expectedCandidateEvidenceSetSha256){
      finalizerVerifierCallCount+=1;
      const item=assemblyById.get(assembly?.candidateId);
      const entry=normalizedIndex.candidateAssemblies.find(
        value=>value.candidateId===assembly?.candidateId,
      );
      return Boolean(
        item
        &&entry
        &&assembly===item.value
        &&expectedCandidateEvidenceSetSha256===entry.candidateEvidenceSetSha256
        &&assembly.candidateEvidenceSetSha256===entry.candidateEvidenceSetSha256
      );
    },
    async verifyQualityFrontier(candidate,expectedQualityFrontierSha256){
      finalizerVerifierCallCount+=1;
      return candidate===frontier.value
        &&expectedQualityFrontierSha256===normalizedIndex.qualityFrontier.qualityFrontierSha256;
    },
    async verifyParetoEfficiency(candidate,expectedParetoEvidenceSha256){
      finalizerVerifierCallCount+=1;
      return candidate===pareto.value
        &&expectedParetoEvidenceSha256===normalizedIndex.paretoEfficiency.paretoEvidenceSha256;
    },
  });

  const finalization=await finalizeHsmeFoundationReuseDecisionV1(
    sourceDecision.value,
    campaign.value,
    normalizedAssemblies.map(item=>item.value),
    frontier.value,
    normalizedIndex.qualityFrontier.qualityFrontierSha256,
    pareto.value,
    normalizedIndex.paretoEfficiency.paretoEvidenceSha256,
    finalizerOrigin,
    hashPort,
  );

  const readyAssemblyCount=normalizedAssemblies.filter(item=>
    item.value.state==='CANDIDATE_EVIDENCE_QUALIFIED'
    ||item.value.state==='CANDIDATE_EVIDENCE_REJECTED'
  ).length;
  if(readyAssemblyCount>0&&finalizerVerifierCallCount<readyAssemblyCount){
    fail(
      'hsme_reuse_materialization_origin_verifier_not_exercised',
      'canonical finalizer did not origin-verify every ready candidate assembly',
    );
  }

  let handoffVerifierCallCount=0;
  const handoffOrigin=Object.freeze({
    async verifyFinalization(candidate,expectedFinalizationEvidenceSha256){
      handoffVerifierCallCount+=1;
      return candidate===finalization
        &&expectedFinalizationEvidenceSha256===finalization.finalizationEvidenceSha256
        &&originIndexSha256===expectedOriginIndexSha256;
    },
  });

  const handoff=await proveHsmeReuseOutcomeHandoffV1(
    finalization,
    handoffOrigin,
    hashPort,
  );

  const readyFinalization=
    finalization.state==='DIRECT_FOUNDATION_ADVANCE_READY'
    ||finalization.state==='BOUNDED_ADAPTATION_ADVANCE_READY'
    ||finalization.state==='REUSE_PATH_INSUFFICIENT_READY';
  if(readyFinalization&&handoffVerifierCallCount!==1){
    fail(
      'hsme_reuse_materialization_finalization_origin_not_verified',
      'ready finalization must be origin-verified exactly once by handoff proof',
    );
  }

  const finalizationFileBytes=canonicalFileBytes(finalization);
  const handoffFileBytes=canonicalFileBytes(handoff);
  const finalizationFileSha256=sha256Bytes(finalizationFileBytes);
  const handoffFileSha256=sha256Bytes(handoffFileBytes);

  const evidencePayload={
    schemaVersion:HSME_REUSE_OUTCOME_MATERIALIZATION_EVIDENCE_V1_SCHEMA,
    originIndexSha256,
    sourceDecisionFileSha256:sourceDecision.fileSha256,
    campaignFileSha256:campaign.fileSha256,
    candidateAssemblyFiles:normalizedAssemblies.map(item=>Object.freeze({
      candidateId:item.value.candidateId,
      fileSha256:item.fileSha256,
      candidateEvidenceSetSha256:item.value.candidateEvidenceSetSha256,
    })),
    qualityFrontierFileSha256:frontier.fileSha256,
    qualityFrontierSha256:normalizedIndex.qualityFrontier.qualityFrontierSha256,
    paretoFileSha256:pareto.fileSha256,
    paretoEvidenceSha256:normalizedIndex.paretoEfficiency.paretoEvidenceSha256,
    finalizationState:finalization.state,
    finalizationEvidenceSha256:digestOrUnknown(
      finalization.finalizationEvidenceSha256,
      'finalization.finalizationEvidenceSha256',
    ),
    finalizationFileSha256,
    handoffState:handoff.state,
    handoffEvidenceSha256:digestOrUnknown(
      handoff.handoffEvidenceSha256,
      'handoff.handoffEvidenceSha256',
    ),
    handoffFileSha256,
    finalizerOriginVerifierCallCount:finalizerVerifierCallCount,
    handoffOriginVerifierCallCount,
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
  const materializationEvidenceSha256=domainDigest(
    HSME_REUSE_OUTCOME_MATERIALIZATION_DIGEST_DOMAIN,
    evidencePayload,
  );
  const materializationEvidence=Object.freeze({
    ...evidencePayload,
    materializationEvidenceSha256,
  });

  return Object.freeze({
    originIndexSha256,
    finalization,
    handoff,
    materializationEvidence,
    files:Object.freeze({
      finalization:finalizationFileBytes,
      handoff:handoffFileBytes,
      materializationEvidence:canonicalFileBytes(materializationEvidence),
    }),
  });
}

function parseArgs(argv){
  const single=new Map();
  const assemblies=[];
  for(let index=0;index<argv.length;index+=1){
    const key=argv[index];
    if(!key.startsWith('--')){
      fail('hsme_reuse_materialization_cli_invalid','unexpected argument '+key);
    }
    if(index+1>=argv.length){
      fail('hsme_reuse_materialization_cli_invalid','missing value for '+key);
    }
    const value=argv[++index];
    if(key==='--assembly'){
      assemblies.push(value);
      continue;
    }
    if(single.has(key)){
      fail('hsme_reuse_materialization_cli_invalid','duplicate argument '+key);
    }
    single.set(key,value);
  }
  const required=[
    '--source-decision',
    '--campaign',
    '--frontier',
    '--pareto',
    '--origin-index',
    '--expected-origin-index-sha256',
    '--output-dir',
  ];
  for(const key of required){
    if(!single.has(key)){
      fail('hsme_reuse_materialization_cli_invalid','missing '+key);
    }
  }
  return Object.freeze({
    sourceDecision:single.get('--source-decision'),
    campaign:single.get('--campaign'),
    assemblies:Object.freeze(assemblies),
    frontier:single.get('--frontier'),
    pareto:single.get('--pareto'),
    originIndex:single.get('--origin-index'),
    expectedOriginIndexSha256:single.get('--expected-origin-index-sha256'),
    outputDir:single.get('--output-dir'),
  });
}

export async function runCli(argv=process.argv.slice(2)){
  const args=parseArgs(argv);
  const [
    sourceDecision,
    campaign,
    frontier,
    pareto,
    originIndex,
    ...assemblies
  ]=await Promise.all([
    loadJsonFile(args.sourceDecision,'source decision'),
    loadJsonFile(args.campaign,'campaign'),
    loadJsonFile(args.frontier,'quality frontier'),
    loadJsonFile(args.pareto,'Pareto efficiency'),
    loadJsonFile(args.originIndex,'origin index'),
    ...args.assemblies.map((path,index)=>
      loadJsonFile(path,'candidate assembly '+index)
    ),
  ]);

  const result=await materializeHsmeReuseOutcomeEvidence({
    sourceDecision,
    campaign,
    assemblies,
    frontier,
    pareto,
    originIndex,
    expectedOriginIndexSha256:args.expectedOriginIndexSha256,
  });

  await mkdir(args.outputDir,{recursive:true});
  await Promise.all([
    writeFile(
      resolve(args.outputDir,'reuse-decision-finalization.json'),
      result.files.finalization,
    ),
    writeFile(
      resolve(args.outputDir,'reuse-outcome-handoff.json'),
      result.files.handoff,
    ),
    writeFile(
      resolve(args.outputDir,'reuse-outcome-materialization-evidence.json'),
      result.files.materializationEvidence,
    ),
  ]);

  process.stdout.write(JSON.stringify({
    schemaVersion:HSME_REUSE_OUTCOME_MATERIALIZATION_EVIDENCE_V1_SCHEMA,
    originIndexSha256:result.originIndexSha256,
    finalizationState:result.finalization.state,
    handoffState:result.handoff.state,
    materializationEvidenceSha256:
      result.materializationEvidence.materializationEvidenceSha256,
  })+'\n');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  runCli().catch(error=>{
    process.stderr.write(
      (error.code||'hsme_reuse_outcome_materialization_failed')
      +': '+error.message+'\n',
    );
    process.exitCode=1;
  });
}

function lexical(a,b){
  return a<b?-1:a>b?1:0;
}
