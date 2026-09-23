#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

import {
  applyHsmeFoundationPhysicalReuseRuntimeOverlayV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationPendingReuseRuntimeApplicationV1.ts';
import {
  hsmeFoundationQualityFinalizationV1Digest,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationQualityFinalizationV1.ts';
import {
  qualifyHsmeFoundationReuseEvidenceV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationReuseEvidenceQualificationV1.ts';
import {
  proveHsmeFoundationReuseEvidenceRejectionV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationReuseEvidenceRejectionV1.ts';

export const HSME_REUSE_CAPABILITY_PROOF_ORIGIN_INDEX_V1_SCHEMA =
  'BERS_HSME_REUSE_CAPABILITY_PROOF_ORIGIN_INDEX_V1';
export const HSME_REUSE_CAPABILITY_PROOF_ORIGIN_INDEX_DIGEST_DOMAIN =
  'bers:hsme:reuse-capability-proof-origin-index:v1\0';
export const HSME_REUSE_CAPABILITY_PROOF_MATERIALIZATION_V1_SCHEMA =
  'BERS_HSME_REUSE_CAPABILITY_PROOF_MATERIALIZATION_V1';
export const HSME_REUSE_CAPABILITY_PROOF_MATERIALIZATION_DIGEST_DOMAIN =
  'bers:hsme:reuse-capability-proof-materialization:v1\0';

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[a-z0-9][a-z0-9._:@/-]*$/;
const MODES=new Set(['QUALIFICATION','REJECTION']);
const CAPABILITIES=new Set(['TEXT_TO_IMAGE','IMAGE_EDITING']);

export class HsmeReuseCapabilityProofCompilerError extends Error{
  constructor(code,message){
    super(message);
    this.name='HsmeReuseCapabilityProofCompilerError';
    this.code=code;
  }
}

function fail(code,message){
  throw new HsmeReuseCapabilityProofCompilerError(code,message);
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
    fail('hsme_capability_proof_compiler_record_invalid',path+' must be an object');
  }
  for(const key of Object.keys(raw)){
    if(!allowed.includes(key)){
      fail(
        'hsme_capability_proof_compiler_field_unknown',
        path+'.'+key+' is not allowed',
      );
    }
  }
  for(const key of allowed){
    if(!Object.hasOwn(raw,key)){
      fail(
        'hsme_capability_proof_compiler_field_missing',
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
    fail('hsme_capability_proof_compiler_text_invalid',path+' is invalid');
  }
  return value;
}

function identifier(value,path,max=160){
  const result=text(value,path,max);
  if(!IDENTIFIER.test(result)){
    fail('hsme_capability_proof_compiler_identifier_invalid',path+' is invalid');
  }
  return result;
}

function sha256(value,path){
  const result=text(value,path,64);
  if(!HEX64.test(result)){
    fail(
      'hsme_capability_proof_compiler_hash_invalid',
      path+' must be lowercase SHA-256',
    );
  }
  return result;
}

function falseValue(value,path){
  if(value!==false){
    fail(
      'hsme_capability_proof_compiler_authority_invalid',
      path+' must remain false',
    );
  }
  return false;
}

function fileShaOrNone(value,path){
  if(value==='NONE')return value;
  return sha256(value,path);
}

export function normalizeCapabilityProofOriginIndex(raw){
  const record=exactRecord(raw,[
    'schemaVersion',
    'mode',
    'candidateId',
    'capability',
    'sourceDecisionFileSha256',
    'runtimeOverlayFileSha256',
    'runtimeEvidenceSha256',
    'campaignFileSha256',
    'trustFileSha256',
    'qualityFinalizationFileSha256',
    'qualityFinalizationSha256',
    'trainingAttestationFileSha256',
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

  if(record.schemaVersion!==HSME_REUSE_CAPABILITY_PROOF_ORIGIN_INDEX_V1_SCHEMA){
    fail(
      'hsme_capability_proof_compiler_origin_schema_invalid',
      'origin index schema invalid',
    );
  }
  const mode=text(record.mode,'originIndex.mode',24);
  if(!MODES.has(mode)){
    fail('hsme_capability_proof_compiler_mode_invalid','unsupported mode '+mode);
  }
  const capability=text(record.capability,'originIndex.capability',32);
  if(!CAPABILITIES.has(capability)){
    fail(
      'hsme_capability_proof_compiler_capability_invalid',
      'unsupported capability '+capability,
    );
  }

  const trainingAttestationFileSha256=fileShaOrNone(
    record.trainingAttestationFileSha256,
    'originIndex.trainingAttestationFileSha256',
  );
  if(mode==='QUALIFICATION'&&trainingAttestationFileSha256==='NONE'){
    fail(
      'hsme_capability_proof_compiler_training_attestation_required',
      'QUALIFICATION requires indexed training attestation',
    );
  }
  if(mode==='REJECTION'&&trainingAttestationFileSha256!=='NONE'){
    fail(
      'hsme_capability_proof_compiler_rejection_training_forbidden',
      'REJECTION cannot index training attestation',
    );
  }

  return Object.freeze({
    schemaVersion:HSME_REUSE_CAPABILITY_PROOF_ORIGIN_INDEX_V1_SCHEMA,
    mode,
    candidateId:identifier(record.candidateId,'originIndex.candidateId',120),
    capability,
    sourceDecisionFileSha256:sha256(
      record.sourceDecisionFileSha256,
      'originIndex.sourceDecisionFileSha256',
    ),
    runtimeOverlayFileSha256:sha256(
      record.runtimeOverlayFileSha256,
      'originIndex.runtimeOverlayFileSha256',
    ),
    runtimeEvidenceSha256:sha256(
      record.runtimeEvidenceSha256,
      'originIndex.runtimeEvidenceSha256',
    ),
    campaignFileSha256:sha256(
      record.campaignFileSha256,
      'originIndex.campaignFileSha256',
    ),
    trustFileSha256:sha256(
      record.trustFileSha256,
      'originIndex.trustFileSha256',
    ),
    qualityFinalizationFileSha256:sha256(
      record.qualityFinalizationFileSha256,
      'originIndex.qualityFinalizationFileSha256',
    ),
    qualityFinalizationSha256:sha256(
      record.qualityFinalizationSha256,
      'originIndex.qualityFinalizationSha256',
    ),
    trainingAttestationFileSha256,
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

export function capabilityProofOriginIndexDigest(raw){
  return domainDigest(
    HSME_REUSE_CAPABILITY_PROOF_ORIGIN_INDEX_DIGEST_DOMAIN,
    normalizeCapabilityProofOriginIndex(raw),
  );
}

async function loadJsonFile(path,label){
  let bytes;
  try{
    bytes=await readFile(path);
  }catch(error){
    fail('hsme_capability_proof_compiler_file_read_failed',label+': '+error.message);
  }
  let value;
  try{
    value=JSON.parse(bytes.toString('utf8'));
  }catch(error){
    fail('hsme_capability_proof_compiler_json_invalid',label+': '+error.message);
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
      'hsme_capability_proof_compiler_file_digest_mismatch',
      label+' raw file SHA-256 differs from trusted origin index',
    );
  }
}

function requireNoAuthorityWidening(value,label){
  if(value===null||typeof value!=='object'||Array.isArray(value)){
    fail('hsme_capability_proof_compiler_input_invalid',label+' must be an object');
  }
  for(const field of [
    'decisionMutationAllowed',
    'candidateSelectionAllowed',
    'selectedCandidateIdAllowed',
    'winnerSelectionAllowed',
    'reuseAdvanceAllowed',
    'fullStudentEscalationAllowed',
    'trainingRunStartAllowed',
    'trainingAuthorityGranted',
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
        'hsme_capability_proof_compiler_input_authority_widening',
        label+'.'+field+' must remain false',
      );
    }
  }
}

export async function compileHsmeReuseCapabilityProof({
  sourceDecision,
  runtimeOverlay,
  campaign,
  trust,
  qualityFinalization,
  trainingAttestation,
  originIndex,
  expectedOriginIndexSha256,
}){
  if(!HEX64.test(expectedOriginIndexSha256)){
    fail(
      'hsme_capability_proof_compiler_expected_origin_digest_invalid',
      'expected origin-index digest must be lowercase SHA-256',
    );
  }

  const index=normalizeCapabilityProofOriginIndex(originIndex.value);
  const originIndexSha256=capabilityProofOriginIndexDigest(index);
  if(originIndexSha256!==expectedOriginIndexSha256){
    fail(
      'hsme_capability_proof_compiler_origin_digest_mismatch',
      'origin index digest differs from external expected digest',
    );
  }

  requireFileDigest(
    sourceDecision,
    index.sourceDecisionFileSha256,
    'source decision',
  );
  requireFileDigest(
    runtimeOverlay,
    index.runtimeOverlayFileSha256,
    'runtime overlay',
  );
  requireFileDigest(campaign,index.campaignFileSha256,'campaign');
  requireFileDigest(trust,index.trustFileSha256,'trust');
  requireFileDigest(
    qualityFinalization,
    index.qualityFinalizationFileSha256,
    'quality finalization',
  );

  if(runtimeOverlay.value?.candidateId!==index.candidateId){
    fail(
      'hsme_capability_proof_compiler_overlay_candidate_drift',
      'runtime overlay candidateId differs from trusted index',
    );
  }
  if(runtimeOverlay.value?.capability!==index.capability){
    fail(
      'hsme_capability_proof_compiler_overlay_capability_drift',
      'runtime overlay capability differs from trusted index',
    );
  }
  if(runtimeOverlay.value?.runtimeEvidenceSha256!==index.runtimeEvidenceSha256){
    fail(
      'hsme_capability_proof_compiler_runtime_digest_drift',
      'runtime overlay digest differs from trusted index',
    );
  }

  const actualQualityFinalizationSha256=
    await hsmeFoundationQualityFinalizationV1Digest(
      qualityFinalization.value,
      hashPort,
    );
  if(actualQualityFinalizationSha256!==index.qualityFinalizationSha256){
    fail(
      'hsme_capability_proof_compiler_quality_digest_drift',
      'quality finalization semantic digest differs from trusted index',
    );
  }

  if(index.mode==='QUALIFICATION'){
    if(!trainingAttestation){
      fail(
        'hsme_capability_proof_compiler_training_attestation_required',
        'QUALIFICATION requires training attestation input',
      );
    }
    requireFileDigest(
      trainingAttestation,
      index.trainingAttestationFileSha256,
      'training attestation',
    );
  }else if(trainingAttestation){
    fail(
      'hsme_capability_proof_compiler_rejection_training_forbidden',
      'REJECTION cannot receive training attestation input',
    );
  }

  for(const [label,loaded] of [
    ['source decision',sourceDecision],
    ['runtime overlay',runtimeOverlay],
    ['campaign',campaign],
    ['trust',trust],
    ['quality finalization',qualityFinalization],
    ...(trainingAttestation?[['training attestation',trainingAttestation]]:[]),
  ]){
    requireNoAuthorityWidening(loaded.value,label);
  }

  let application;
  try{
    application=await applyHsmeFoundationPhysicalReuseRuntimeOverlayV1(
      sourceDecision.value,
      index.candidateId,
      index.capability,
      runtimeOverlay.value,
      index.runtimeEvidenceSha256,
      hashPort,
    );
  }catch(error){
    fail(
      'hsme_capability_proof_compiler_runtime_application_failed',
      (error?.code?error.code+': ':'')+(error?.message||String(error)),
    );
  }

  let qualityOriginVerifierCallCount=0;
  const qualityOrigin=Object.freeze({
    async verifyQualityFinalization(candidate,expectedSha256){
      qualityOriginVerifierCallCount+=1;
      return candidate===qualityFinalization.value
        &&expectedSha256===index.qualityFinalizationSha256
        &&actualQualityFinalizationSha256===index.qualityFinalizationSha256;
    },
  });

  let proof;
  if(index.mode==='QUALIFICATION'){
    proof=await qualifyHsmeFoundationReuseEvidenceV1(
      application,
      runtimeOverlay.value,
      index.candidateId,
      index.capability,
      campaign.value,
      trust.value,
      qualityFinalization.value,
      index.qualityFinalizationSha256,
      qualityOrigin,
      trainingAttestation.value,
      hashPort,
    );
  }else{
    proof=await proveHsmeFoundationReuseEvidenceRejectionV1(
      application,
      runtimeOverlay.value,
      index.candidateId,
      index.capability,
      campaign.value,
      trust.value,
      qualityFinalization.value,
      index.qualityFinalizationSha256,
      qualityOrigin,
      hashPort,
    );
  }

  requireNoAuthorityWidening(proof,'canonical capability proof');

  const proofBytes=jsonFileBytes(proof);
  const materializationPayload={
    schemaVersion:HSME_REUSE_CAPABILITY_PROOF_MATERIALIZATION_V1_SCHEMA,
    mode:index.mode,
    candidateId:index.candidateId,
    capability:index.capability,
    originIndexSha256,
    originIndexFileSha256:originIndex.fileSha256,
    sourceDecisionFileSha256:sourceDecision.fileSha256,
    runtimeOverlayFileSha256:runtimeOverlay.fileSha256,
    runtimeEvidenceSha256:index.runtimeEvidenceSha256,
    campaignFileSha256:campaign.fileSha256,
    trustFileSha256:trust.fileSha256,
    qualityFinalizationFileSha256:qualityFinalization.fileSha256,
    qualityFinalizationSha256:index.qualityFinalizationSha256,
    trainingAttestationFileSha256:
      trainingAttestation?.fileSha256??'NONE',
    applicationState:application.state,
    proofState:proof.state,
    proofEvidenceSetSha256:
      HEX64.test(proof.evidenceSetSha256)
        ?proof.evidenceSetSha256
        :'UNKNOWN',
    proofFileSha256:sha256Bytes(proofBytes),
    qualityOriginVerifierCallCount,
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
    HSME_REUSE_CAPABILITY_PROOF_MATERIALIZATION_DIGEST_DOMAIN,
    materializationPayload,
  );
  const materialization=Object.freeze({
    ...materializationPayload,
    materializationEvidenceSha256,
  });

  return Object.freeze({
    application,
    proof,
    materialization,
    files:Object.freeze({
      proof:proofBytes,
      materialization:jsonFileBytes(materialization),
    }),
  });
}

function parseArgs(argv){
  const args=new Map();
  for(let index=0;index<argv.length;index+=2){
    const key=argv[index];
    const value=argv[index+1];
    if(!key?.startsWith('--')||value===undefined){
      fail(
        'hsme_capability_proof_compiler_cli_invalid',
        'arguments must be --key value pairs',
      );
    }
    if(args.has(key)){
      fail(
        'hsme_capability_proof_compiler_cli_invalid',
        'duplicate argument '+key,
      );
    }
    args.set(key,value);
  }
  for(const key of [
    '--source-decision',
    '--runtime-overlay',
    '--campaign',
    '--trust',
    '--quality-finalization',
    '--origin-index',
    '--expected-origin-index-sha256',
    '--output-dir',
  ]){
    if(!args.has(key)){
      fail('hsme_capability_proof_compiler_cli_invalid','missing '+key);
    }
  }
  return Object.freeze({
    sourceDecision:args.get('--source-decision'),
    runtimeOverlay:args.get('--runtime-overlay'),
    campaign:args.get('--campaign'),
    trust:args.get('--trust'),
    qualityFinalization:args.get('--quality-finalization'),
    trainingAttestation:args.get('--training-attestation')??null,
    originIndex:args.get('--origin-index'),
    expectedOriginIndexSha256:args.get('--expected-origin-index-sha256'),
    outputDir:args.get('--output-dir'),
  });
}

function requireOutputNotInput(outputDir,inputPaths){
  const outputs=[
    resolve(outputDir,'hsme-reuse-capability-proof.json'),
    resolve(outputDir,'hsme-reuse-capability-proof-materialization.json'),
  ];
  const inputs=new Set(inputPaths.filter(Boolean).map(value=>resolve(value)));
  for(const output of outputs){
    if(inputs.has(output)){
      fail(
        'hsme_capability_proof_compiler_output_collision',
        'output path collides with trusted input: '+output,
      );
    }
  }
}

export async function runCli(argv=process.argv.slice(2)){
  const args=parseArgs(argv);
  requireOutputNotInput(args.outputDir,[
    args.sourceDecision,
    args.runtimeOverlay,
    args.campaign,
    args.trust,
    args.qualityFinalization,
    args.trainingAttestation,
    args.originIndex,
  ]);

  const baseLoads=[
    loadJsonFile(args.sourceDecision,'source decision'),
    loadJsonFile(args.runtimeOverlay,'runtime overlay'),
    loadJsonFile(args.campaign,'campaign'),
    loadJsonFile(args.trust,'trust'),
    loadJsonFile(args.qualityFinalization,'quality finalization'),
    loadJsonFile(args.originIndex,'origin index'),
  ];
  const loaded=await Promise.all(
    args.trainingAttestation
      ?[...baseLoads,loadJsonFile(args.trainingAttestation,'training attestation')]
      :baseLoads,
  );
  const [
    sourceDecision,
    runtimeOverlay,
    campaign,
    trust,
    qualityFinalization,
    originIndex,
    trainingAttestation=null,
  ]=loaded;

  const result=await compileHsmeReuseCapabilityProof({
    sourceDecision,
    runtimeOverlay,
    campaign,
    trust,
    qualityFinalization,
    trainingAttestation,
    originIndex,
    expectedOriginIndexSha256:args.expectedOriginIndexSha256,
  });

  await mkdir(args.outputDir,{recursive:true});
  await Promise.all([
    writeFile(
      resolve(args.outputDir,'hsme-reuse-capability-proof.json'),
      result.files.proof,
    ),
    writeFile(
      resolve(args.outputDir,'hsme-reuse-capability-proof-materialization.json'),
      result.files.materialization,
    ),
  ]);

  process.stdout.write(JSON.stringify({
    schemaVersion:HSME_REUSE_CAPABILITY_PROOF_MATERIALIZATION_V1_SCHEMA,
    mode:result.materialization.mode,
    candidateId:result.materialization.candidateId,
    capability:result.materialization.capability,
    proofState:result.materialization.proofState,
    proofEvidenceSetSha256:result.materialization.proofEvidenceSetSha256,
    materializationEvidenceSha256:
      result.materialization.materializationEvidenceSha256,
  })+'\n');
}

if(process.env.HSME_REUSE_CAPABILITY_PROOF_COMPILER_CLI==='1'){
  runCli().catch(error=>{
    process.stderr.write(
      (error.code||'hsme_capability_proof_compiler_failed')
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
