#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

import {
  assembleHsmeFoundationReuseCandidateEvidenceV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationReuseCandidateEvidenceAssemblyV1.ts';

export const HSME_REUSE_CANDIDATE_ASSEMBLY_ORIGIN_INDEX_V1_SCHEMA =
  'BERS_HSME_REUSE_CANDIDATE_ASSEMBLY_ORIGIN_INDEX_V1';
export const HSME_REUSE_CANDIDATE_ASSEMBLY_ORIGIN_INDEX_DIGEST_DOMAIN =
  'bers:hsme:reuse-candidate-assembly-origin-index:v1\0';
export const HSME_REUSE_CANDIDATE_ASSEMBLY_MATERIALIZATION_V1_SCHEMA =
  'BERS_HSME_REUSE_CANDIDATE_ASSEMBLY_MATERIALIZATION_V1';
export const HSME_REUSE_CANDIDATE_ASSEMBLY_MATERIALIZATION_DIGEST_DOMAIN =
  'bers:hsme:reuse-candidate-assembly-materialization:v1\0';

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[a-z0-9][a-z0-9._:@/-]*$/;
const CAPABILITIES=new Set(['TEXT_TO_IMAGE','IMAGE_EDITING']);
const PROOF_KINDS=new Set(['QUALIFICATION','REJECTION']);

export class HsmeReuseCandidateAssemblyMaterializationError extends Error{
  constructor(code,message){
    super(message);
    this.name='HsmeReuseCandidateAssemblyMaterializationError';
    this.code=code;
  }
}

function fail(code,message){
  throw new HsmeReuseCandidateAssemblyMaterializationError(code,message);
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

export function canonicalBytes(value){
  return Buffer.from(JSON.stringify(canonicalValue(value)),'utf8');
}

export function canonicalFileBytes(value){
  return Buffer.concat([canonicalBytes(value),Buffer.from('\n','utf8')]);
}

export function jsonFileBytes(value){
  return Buffer.from(JSON.stringify(value,null,2)+'\n','utf8');
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
    fail('hsme_candidate_assembly_materialization_record_invalid',path+' must be an object');
  }
  for(const key of Object.keys(raw)){
    if(!allowed.includes(key)){
      fail(
        'hsme_candidate_assembly_materialization_field_unknown',
        path+'.'+key+' is not allowed',
      );
    }
  }
  for(const key of allowed){
    if(!Object.hasOwn(raw,key)){
      fail(
        'hsme_candidate_assembly_materialization_field_missing',
        path+'.'+key+' is required',
      );
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
    fail('hsme_candidate_assembly_materialization_text_invalid',path+' is invalid');
  }
  return value;
}

function identifier(value,path,max=160){
  const result=text(value,path,max);
  if(!IDENTIFIER.test(result)){
    fail('hsme_candidate_assembly_materialization_identifier_invalid',path+' is invalid');
  }
  return result;
}

function sha256(value,path){
  const result=text(value,path,64);
  if(!HEX64.test(result)){
    fail(
      'hsme_candidate_assembly_materialization_hash_invalid',
      path+' must be lowercase SHA-256',
    );
  }
  return result;
}

function falseValue(value,path){
  if(value!==false){
    fail(
      'hsme_candidate_assembly_materialization_authority_invalid',
      path+' must remain false',
    );
  }
  return false;
}

export function normalizeCandidateAssemblyOriginIndex(raw){
  const record=exactRecord(raw,[
    'schemaVersion',
    'candidateId',
    'sourceDecisionFileSha256',
    'campaignFileSha256',
    'proofs',
    'decisionMutationAllowed',
    'candidateSelectionAllowed',
    'winnerSelectionAllowed',
    'reuseAdvanceAllowed',
    'fullStudentEscalationAllowed',
    'trainingRunStartAllowed',
    'trainingOrDistillationAllowed',
    'modelInstallAllowed',
    'modelFleetPromotionAllowed',
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted',
    'durableModelFleetPromotionAllowed',
  ],'originIndex');

  if(record.schemaVersion!==HSME_REUSE_CANDIDATE_ASSEMBLY_ORIGIN_INDEX_V1_SCHEMA){
    fail(
      'hsme_candidate_assembly_materialization_origin_schema_invalid',
      'origin index schema invalid',
    );
  }
  if(!Array.isArray(record.proofs)||record.proofs.length>32){
    fail(
      'hsme_candidate_assembly_materialization_origin_proof_count_invalid',
      'origin index proofs must contain 0..32 entries',
    );
  }

  const candidateId=identifier(record.candidateId,'originIndex.candidateId',120);
  const proofs=record.proofs.map((rawProof,index)=>{
    const proof=exactRecord(rawProof,[
      'kind',
      'capability',
      'fileSha256',
      'evidenceSetSha256',
    ],'originIndex.proofs['+index+']');
    const kind=text(proof.kind,'originIndex.proofs['+index+'].kind',20);
    const capability=text(
      proof.capability,
      'originIndex.proofs['+index+'].capability',
      32,
    );
    if(!PROOF_KINDS.has(kind)){
      fail(
        'hsme_candidate_assembly_materialization_origin_proof_kind_invalid',
        'unsupported proof kind '+kind,
      );
    }
    if(!CAPABILITIES.has(capability)){
      fail(
        'hsme_candidate_assembly_materialization_origin_capability_invalid',
        'unsupported capability '+capability,
      );
    }
    return Object.freeze({
      kind,
      capability,
      fileSha256:sha256(
        proof.fileSha256,
        'originIndex.proofs['+index+'].fileSha256',
      ),
      evidenceSetSha256:sha256(
        proof.evidenceSetSha256,
        'originIndex.proofs['+index+'].evidenceSetSha256',
      ),
    });
  }).sort(compareProofIndexEntries);

  const keys=proofs.map(value=>value.kind+'\0'+value.capability);
  if(new Set(keys).size!==keys.length){
    fail(
      'hsme_candidate_assembly_materialization_origin_proof_duplicate',
      'origin index kind/capability proofs must be unique',
    );
  }

  return Object.freeze({
    schemaVersion:HSME_REUSE_CANDIDATE_ASSEMBLY_ORIGIN_INDEX_V1_SCHEMA,
    candidateId,
    sourceDecisionFileSha256:sha256(
      record.sourceDecisionFileSha256,
      'originIndex.sourceDecisionFileSha256',
    ),
    campaignFileSha256:sha256(
      record.campaignFileSha256,
      'originIndex.campaignFileSha256',
    ),
    proofs:Object.freeze(proofs),
    decisionMutationAllowed:falseValue(
      record.decisionMutationAllowed,
      'originIndex.decisionMutationAllowed',
    ),
    candidateSelectionAllowed:falseValue(
      record.candidateSelectionAllowed,
      'originIndex.candidateSelectionAllowed',
    ),
    winnerSelectionAllowed:falseValue(
      record.winnerSelectionAllowed,
      'originIndex.winnerSelectionAllowed',
    ),
    reuseAdvanceAllowed:falseValue(
      record.reuseAdvanceAllowed,
      'originIndex.reuseAdvanceAllowed',
    ),
    fullStudentEscalationAllowed:falseValue(
      record.fullStudentEscalationAllowed,
      'originIndex.fullStudentEscalationAllowed',
    ),
    trainingRunStartAllowed:falseValue(
      record.trainingRunStartAllowed,
      'originIndex.trainingRunStartAllowed',
    ),
    trainingOrDistillationAllowed:falseValue(
      record.trainingOrDistillationAllowed,
      'originIndex.trainingOrDistillationAllowed',
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
  });
}

export function candidateAssemblyOriginIndexDigest(raw){
  const normalized=normalizeCandidateAssemblyOriginIndex(raw);
  return domainDigest(
    HSME_REUSE_CANDIDATE_ASSEMBLY_ORIGIN_INDEX_DIGEST_DOMAIN,
    normalized,
  );
}

async function loadJsonFile(path,label){
  let bytes;
  try{
    bytes=await readFile(path);
  }catch(error){
    fail(
      'hsme_candidate_assembly_materialization_file_read_failed',
      label+': '+error.message,
    );
  }
  let value;
  try{
    value=JSON.parse(bytes.toString('utf8'));
  }catch(error){
    fail(
      'hsme_candidate_assembly_materialization_json_invalid',
      label+': '+error.message,
    );
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
      'hsme_candidate_assembly_materialization_file_digest_mismatch',
      label+' raw file SHA-256 differs from trusted origin index',
    );
  }
}

function requireNoAuthorityWidening(value,label){
  if(value===null||typeof value!=='object'||Array.isArray(value)){
    fail(
      'hsme_candidate_assembly_materialization_input_invalid',
      label+' must be an object',
    );
  }
  for(const field of [
    'decisionMutationAllowed',
    'candidateSelectionAllowed',
    'selectedCandidateIdAllowed',
    'winnerSelectionAllowed',
    'reuseAdvanceAllowed',
    'fullStudentEscalationAllowed',
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
  ]){
    if(Object.hasOwn(value,field)&&value[field]!==false){
      fail(
        'hsme_candidate_assembly_materialization_input_authority_widening',
        label+'.'+field+' must remain false',
      );
    }
  }
}

function proofMetadata(loaded,candidateId){
  const proof=loaded.value;
  if(proof===null||typeof proof!=='object'||Array.isArray(proof)){
    fail(
      'hsme_candidate_assembly_materialization_proof_invalid',
      'proof must be an object',
    );
  }
  const capability=text(proof.capability,'proof.capability',32);
  if(!CAPABILITIES.has(capability)){
    fail(
      'hsme_candidate_assembly_materialization_proof_capability_invalid',
      'unsupported proof capability '+capability,
    );
  }
  if(proof.candidateId!==candidateId){
    fail(
      'hsme_candidate_assembly_materialization_proof_candidate_drift',
      'proof candidateId differs from trusted candidate',
    );
  }

  let kind;
  if(
    proof.schemaVersion==='BERS_HSME_FOUNDATION_REUSE_EVIDENCE_QUALIFICATION_V1'
    &&proof.state==='QUALIFICATION_EVIDENCE_READY'
  ){
    kind='QUALIFICATION';
  }else if(
    proof.schemaVersion==='BERS_HSME_FOUNDATION_REUSE_EVIDENCE_REJECTION_V1'
    &&proof.state==='REJECTION_EVIDENCE_READY'
  ){
    kind='REJECTION';
  }else{
    fail(
      'hsme_candidate_assembly_materialization_proof_not_ready',
      'proof must be a READY qualification or rejection evidence object',
    );
  }
  if(!Array.isArray(proof.blockers)||proof.blockers.length!==0){
    fail(
      'hsme_candidate_assembly_materialization_proof_blockers_present',
      'ready proof cannot carry blockers',
    );
  }
  const evidenceSetSha256=sha256(
    proof.evidenceSetSha256,
    'proof.evidenceSetSha256',
  );
  requireNoAuthorityWidening(proof,kind+' proof '+capability);
  return Object.freeze({kind,capability,evidenceSetSha256});
}

function bindProofInputs(loadedProofs,index){
  const indexByKey=new Map(
    index.proofs.map(value=>[value.kind+'\0'+value.capability,value]),
  );
  const loadedByKey=new Map();

  for(const loaded of loadedProofs){
    const meta=proofMetadata(loaded,index.candidateId);
    const key=meta.kind+'\0'+meta.capability;
    if(loadedByKey.has(key)){
      fail(
        'hsme_candidate_assembly_materialization_proof_duplicate',
        'duplicate loaded proof '+key,
      );
    }
    const expected=indexByKey.get(key);
    if(!expected){
      fail(
        'hsme_candidate_assembly_materialization_proof_not_indexed',
        'proof '+key+' is absent from trusted origin index',
      );
    }
    requireFileDigest(loaded,expected.fileSha256,'proof '+key);
    if(meta.evidenceSetSha256!==expected.evidenceSetSha256){
      fail(
        'hsme_candidate_assembly_materialization_proof_semantic_digest_mismatch',
        'proof '+key+' evidenceSetSha256 differs from trusted origin index',
      );
    }
    loadedByKey.set(key,Object.freeze({loaded,meta,expected}));
  }

  if(loadedByKey.size!==indexByKey.size){
    fail(
      'hsme_candidate_assembly_materialization_proof_set_mismatch',
      'loaded proof set must exactly equal trusted origin index',
    );
  }

  return Object.freeze(
    [...loadedByKey.values()].sort(
      (a,b)=>compareProofIndexEntries(a.meta,b.meta),
    ),
  );
}

export async function materializeHsmeReuseCandidateAssembly({
  sourceDecision,
  campaign,
  proofs,
  originIndex,
  expectedOriginIndexSha256,
}){
  if(!HEX64.test(expectedOriginIndexSha256)){
    fail(
      'hsme_candidate_assembly_materialization_expected_origin_digest_invalid',
      'expected origin-index digest must be lowercase SHA-256',
    );
  }

  const index=normalizeCandidateAssemblyOriginIndex(originIndex.value);
  const originIndexSha256=candidateAssemblyOriginIndexDigest(index);
  if(originIndexSha256!==expectedOriginIndexSha256){
    fail(
      'hsme_candidate_assembly_materialization_origin_digest_mismatch',
      'origin index digest differs from external expected digest',
    );
  }

  requireFileDigest(
    sourceDecision,
    index.sourceDecisionFileSha256,
    'source decision',
  );
  requireFileDigest(
    campaign,
    index.campaignFileSha256,
    'campaign',
  );
  requireNoAuthorityWidening(sourceDecision.value,'source decision');
  requireNoAuthorityWidening(campaign.value,'campaign');

  const boundProofs=bindProofInputs(proofs,index);
  const qualificationProofs=boundProofs
    .filter(value=>value.meta.kind==='QUALIFICATION')
    .map(value=>value.loaded.value);
  const rejectionProofs=boundProofs
    .filter(value=>value.meta.kind==='REJECTION')
    .map(value=>value.loaded.value);

  const proofByObject=new Map(
    boundProofs.map(value=>[value.loaded.value,value]),
  );
  let verifierCallCount=0;
  const origin=Object.freeze({
    async verifyQualificationEvidence(proof,expectedEvidenceSetSha256){
      verifierCallCount+=1;
      const bound=proofByObject.get(proof);
      return Boolean(
        bound
        &&bound.meta.kind==='QUALIFICATION'
        &&bound.expected.evidenceSetSha256===expectedEvidenceSetSha256
        &&proof.evidenceSetSha256===expectedEvidenceSetSha256
      );
    },
    async verifyRejectionEvidence(proof,expectedEvidenceSetSha256){
      verifierCallCount+=1;
      const bound=proofByObject.get(proof);
      return Boolean(
        bound
        &&bound.meta.kind==='REJECTION'
        &&bound.expected.evidenceSetSha256===expectedEvidenceSetSha256
        &&proof.evidenceSetSha256===expectedEvidenceSetSha256
      );
    },
  });

  const assembly=await assembleHsmeFoundationReuseCandidateEvidenceV1(
    sourceDecision.value,
    campaign.value,
    index.candidateId,
    qualificationProofs,
    rejectionProofs,
    origin,
    hashPort,
  );

  if(
    assembly.decisionMutationAllowed!==false
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
    ||assembly.winnerSelectionAllowed!==false
  ){
    fail(
      'hsme_candidate_assembly_materialization_output_authority_widening',
      'canonical assembly widened authority',
    );
  }

  const assemblyBytes=jsonFileBytes(assembly);
  const assemblyFileSha256=sha256Bytes(assemblyBytes);
  const materializationPayload={
    schemaVersion:HSME_REUSE_CANDIDATE_ASSEMBLY_MATERIALIZATION_V1_SCHEMA,
    candidateId:index.candidateId,
    originIndexSha256,
    originIndexFileSha256:originIndex.fileSha256,
    sourceDecisionFileSha256:sourceDecision.fileSha256,
    campaignFileSha256:campaign.fileSha256,
    proofFiles:boundProofs.map(value=>Object.freeze({
      kind:value.meta.kind,
      capability:value.meta.capability,
      fileSha256:value.loaded.fileSha256,
      evidenceSetSha256:value.meta.evidenceSetSha256,
    })),
    assemblyState:assembly.state,
    assembledCandidateSha256:assembly.assembledCandidateSha256,
    candidateEvidenceSetSha256:assembly.candidateEvidenceSetSha256,
    assemblyFileSha256,
    originVerifierCallCount:verifierCallCount,
    decisionMutationAllowed:false,
    candidateSelectionAllowed:false,
    winnerSelectionAllowed:false,
    reuseAdvanceAllowed:false,
    fullStudentEscalationAllowed:false,
    trainingRunStartAllowed:false,
    trainingOrDistillationAllowed:false,
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    durableModelFleetPromotionAllowed:false,
  };
  const materializationEvidenceSha256=domainDigest(
    HSME_REUSE_CANDIDATE_ASSEMBLY_MATERIALIZATION_DIGEST_DOMAIN,
    materializationPayload,
  );
  const materialization=Object.freeze({
    ...materializationPayload,
    materializationEvidenceSha256,
  });

  return Object.freeze({
    assembly,
    materialization,
    files:Object.freeze({
      assembly:assemblyBytes,
      materialization:jsonFileBytes(materialization),
    }),
  });
}

function parseArgs(argv){
  const single=new Map();
  const proofs=[];
  for(let index=0;index<argv.length;index+=1){
    const key=argv[index];
    if(!key.startsWith('--')){
      fail(
        'hsme_candidate_assembly_materialization_cli_invalid',
        'unexpected argument '+key,
      );
    }
    if(index+1>=argv.length){
      fail(
        'hsme_candidate_assembly_materialization_cli_invalid',
        'missing value for '+key,
      );
    }
    const value=argv[++index];
    if(key==='--proof'){
      proofs.push(value);
      continue;
    }
    if(single.has(key)){
      fail(
        'hsme_candidate_assembly_materialization_cli_invalid',
        'duplicate argument '+key,
      );
    }
    single.set(key,value);
  }

  for(const key of [
    '--source-decision',
    '--campaign',
    '--origin-index',
    '--expected-origin-index-sha256',
    '--output-dir',
  ]){
    if(!single.has(key)){
      fail(
        'hsme_candidate_assembly_materialization_cli_invalid',
        'missing '+key,
      );
    }
  }

  return Object.freeze({
    sourceDecision:single.get('--source-decision'),
    campaign:single.get('--campaign'),
    proofs:Object.freeze(proofs),
    originIndex:single.get('--origin-index'),
    expectedOriginIndexSha256:single.get('--expected-origin-index-sha256'),
    outputDir:single.get('--output-dir'),
  });
}

function requireOutputNotInput(outputDir,inputPaths){
  const outputs=[
    resolve(outputDir,'hsme-reuse-candidate-assembly.json'),
    resolve(outputDir,'hsme-reuse-candidate-assembly-materialization.json'),
  ];
  const inputs=new Set(inputPaths.map(value=>resolve(value)));
  for(const output of outputs){
    if(inputs.has(output)){
      fail(
        'hsme_candidate_assembly_materialization_output_collision',
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
    ...args.proofs,
    args.originIndex,
  ]);

  const [
    sourceDecision,
    campaign,
    originIndex,
    ...proofs
  ]=await Promise.all([
    loadJsonFile(args.sourceDecision,'source decision'),
    loadJsonFile(args.campaign,'campaign'),
    loadJsonFile(args.originIndex,'origin index'),
    ...args.proofs.map((path,index)=>loadJsonFile(path,'proof '+index)),
  ]);

  const result=await materializeHsmeReuseCandidateAssembly({
    sourceDecision,
    campaign,
    proofs,
    originIndex,
    expectedOriginIndexSha256:args.expectedOriginIndexSha256,
  });

  await mkdir(args.outputDir,{recursive:true});
  await Promise.all([
    writeFile(
      resolve(args.outputDir,'hsme-reuse-candidate-assembly.json'),
      result.files.assembly,
    ),
    writeFile(
      resolve(args.outputDir,'hsme-reuse-candidate-assembly-materialization.json'),
      result.files.materialization,
    ),
  ]);

  process.stdout.write(JSON.stringify({
    schemaVersion:HSME_REUSE_CANDIDATE_ASSEMBLY_MATERIALIZATION_V1_SCHEMA,
    candidateId:result.materialization.candidateId,
    assemblyState:result.materialization.assemblyState,
    candidateEvidenceSetSha256:
      result.materialization.candidateEvidenceSetSha256,
    materializationEvidenceSha256:
      result.materialization.materializationEvidenceSha256,
  })+'\n');
}

if(process.env.HSME_REUSE_CANDIDATE_ASSEMBLY_MATERIALIZER_CLI==='1'){
  runCli().catch(error=>{
    process.stderr.write(
      (error.code||'hsme_candidate_assembly_materialization_failed')
      +': '+error.message+'\n',
    );
    process.exitCode=1;
  });
}

function compareProofIndexEntries(left,right){
  return lexical(left.kind,right.kind)||lexical(left.capability,right.capability);
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
