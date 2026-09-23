#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

import {
  hsmeFoundationQualityFrontierV1Digest,
  proveHsmeFoundationQualityFrontierV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationQualityFrontierV1.ts';
import {
  hsmeFoundationResourceEvidenceV1Digest,
  proveHsmeFoundationResourceEvidenceV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationResourceEvidenceV1.ts';
import {
  hsmeFoundationParetoEfficiencyV1Digest,
  proveHsmeFoundationParetoEfficiencyV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationParetoEfficiencyV1.ts';

export const HSME_FOUNDATION_QUALITY_PARETO_MATERIALIZATION_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_QUALITY_PARETO_MATERIALIZATION_V1';

export class HsmeFoundationQualityParetoCompilerError extends Error{
  constructor(code,message){
    super(message);
    this.name='HsmeFoundationQualityParetoCompilerError';
    this.code=code;
  }
}

function fail(code,message){
  throw new HsmeFoundationQualityParetoCompilerError(code,message);
}

export const hashPort=Object.freeze({
  async sha256(bytes){
    return createHash('sha256').update(bytes).digest('hex');
  },
});

export function jsonFileBytes(value){
  return Buffer.from(JSON.stringify(value,null,2)+'\n','utf8');
}

export function sha256Bytes(bytes){
  return createHash('sha256').update(bytes).digest('hex');
}

async function loadJsonFile(path,label){
  let bytes;
  try{
    bytes=await readFile(path);
  }catch(error){
    fail('hsme_quality_pareto_file_read_failed',label+': '+error.message);
  }
  let value;
  try{
    value=JSON.parse(bytes.toString('utf8'));
  }catch(error){
    fail('hsme_quality_pareto_json_invalid',label+': '+error.message);
  }
  return Object.freeze({
    path:resolve(path),
    fileSha256:sha256Bytes(bytes),
    value:deepFreeze(value),
  });
}

function requireNoAuthorityWidening(value,label){
  if(value===null||typeof value!=='object'||Array.isArray(value)){
    fail('hsme_quality_pareto_input_invalid',label+' must be an object');
  }
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
    'deploymentTierAdmissionGranted',
  ]){
    if(Object.hasOwn(value,field)&&value[field]!==false){
      fail(
        'hsme_quality_pareto_input_authority_widening',
        label+'.'+field+' must remain false',
      );
    }
  }
}

export async function compileHsmeFoundationQualityParetoEvidence({
  campaign,
  trust,
  fixturePlan,
  fixturePack,
  qualityRubric,
  runEvidence,
  assessmentEvidence,
  resourceEvidence,
}){
  for(const [label,loaded] of [
    ['campaign',campaign],
    ['trust',trust],
    ['fixture plan',fixturePlan],
    ['fixture pack',fixturePack],
    ['quality rubric',qualityRubric],
    ['run evidence',runEvidence],
    ['assessment evidence',assessmentEvidence],
    ['resource evidence',resourceEvidence],
  ]){
    requireNoAuthorityWidening(loaded.value,label);
  }

  let qualityFrontier;
  let resourceProof;
  let pareto;
  try{
    qualityFrontier=await proveHsmeFoundationQualityFrontierV1(
      campaign.value,
      trust.value,
      fixturePlan.value,
      fixturePack.value,
      qualityRubric.value,
      runEvidence.value,
      assessmentEvidence.value,
      hashPort,
    );
    resourceProof=await proveHsmeFoundationResourceEvidenceV1(
      campaign.value,
      trust.value,
      fixturePlan.value,
      fixturePack.value,
      runEvidence.value,
      resourceEvidence.value,
      hashPort,
    );
    pareto=await proveHsmeFoundationParetoEfficiencyV1(
      campaign.value,
      trust.value,
      fixturePlan.value,
      fixturePack.value,
      qualityRubric.value,
      runEvidence.value,
      assessmentEvidence.value,
      resourceEvidence.value,
      hashPort,
    );
  }catch(error){
    fail(
      'hsme_quality_pareto_canonical_proof_failed',
      (error?.code?error.code+': ':'')+(error?.message||String(error)),
    );
  }

  const qualityFrontierSha256=await hsmeFoundationQualityFrontierV1Digest(
    qualityFrontier,
    hashPort,
  );
  const resourceEvidenceSha256=await hsmeFoundationResourceEvidenceV1Digest(
    resourceProof,
    hashPort,
  );
  const paretoEvidenceSha256=await hsmeFoundationParetoEfficiencyV1Digest(
    pareto,
    hashPort,
  );

  if(pareto.qualityFrontierSha256!==qualityFrontierSha256){
    fail(
      'hsme_quality_pareto_frontier_digest_mismatch',
      'Pareto proof is not bound to separately materialized quality frontier',
    );
  }
  if(pareto.resourceEvidenceSha256!==resourceEvidenceSha256){
    fail(
      'hsme_quality_pareto_resource_digest_mismatch',
      'Pareto proof is not bound to separately materialized resource proof',
    );
  }

  if(
    qualityFrontier.productionAuthorityGranted!==false
    ||qualityFrontier.winnerSelectionAllowed!==false
    ||resourceProof.productionAuthorityGranted!==false
    ||resourceProof.winnerSelectionAllowed!==false
    ||pareto.productionAuthorityGranted!==false
    ||pareto.providerAuthorityGranted!==false
    ||pareto.billingAuthorityGranted!==false
    ||pareto.projectArtifactMutationAllowed!==false
    ||pareto.aeeExecutionAuthorityGranted!==false
    ||pareto.durableModelFleetPromotionAllowed!==false
    ||pareto.trainingOrDistillationAllowed!==false
    ||pareto.winnerSelectionAllowed!==false
    ||pareto.deploymentTierAdmissionGranted!==false
  ){
    fail(
      'hsme_quality_pareto_output_authority_widening',
      'canonical proof output widened authority',
    );
  }

  const qualityFrontierBytes=jsonFileBytes(qualityFrontier);
  const resourceProofBytes=jsonFileBytes(resourceProof);
  const paretoBytes=jsonFileBytes(pareto);

  const materialization=Object.freeze({
    schemaVersion:HSME_FOUNDATION_QUALITY_PARETO_MATERIALIZATION_V1_SCHEMA,
    inputFileSha256:Object.freeze({
      campaign:campaign.fileSha256,
      trust:trust.fileSha256,
      fixturePlan:fixturePlan.fileSha256,
      fixturePack:fixturePack.fileSha256,
      qualityRubric:qualityRubric.fileSha256,
      runEvidence:runEvidence.fileSha256,
      assessmentEvidence:assessmentEvidence.fileSha256,
      resourceEvidence:resourceEvidence.fileSha256,
    }),
    qualityFrontierSha256,
    qualityFrontierFileSha256:sha256Bytes(qualityFrontierBytes),
    resourceEvidenceSha256,
    resourceProofFileSha256:sha256Bytes(resourceProofBytes),
    paretoEvidenceSha256,
    paretoFileSha256:sha256Bytes(paretoBytes),
    winnerSelectionAllowed:false,
    deploymentTierAdmissionGranted:false,
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
  });

  return Object.freeze({
    qualityFrontier,
    resourceProof,
    pareto,
    materialization,
    files:Object.freeze({
      qualityFrontier:qualityFrontierBytes,
      resourceProof:resourceProofBytes,
      pareto:paretoBytes,
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
      fail('hsme_quality_pareto_cli_invalid','arguments must be --key value pairs');
    }
    if(args.has(key)){
      fail('hsme_quality_pareto_cli_invalid','duplicate argument '+key);
    }
    args.set(key,value);
  }
  for(const key of [
    '--campaign',
    '--trust',
    '--fixture-plan',
    '--fixture-pack',
    '--quality-rubric',
    '--run-evidence',
    '--assessment-evidence',
    '--resource-evidence',
    '--output-dir',
  ]){
    if(!args.has(key)){
      fail('hsme_quality_pareto_cli_invalid','missing '+key);
    }
  }
  return Object.freeze({
    campaign:args.get('--campaign'),
    trust:args.get('--trust'),
    fixturePlan:args.get('--fixture-plan'),
    fixturePack:args.get('--fixture-pack'),
    qualityRubric:args.get('--quality-rubric'),
    runEvidence:args.get('--run-evidence'),
    assessmentEvidence:args.get('--assessment-evidence'),
    resourceEvidence:args.get('--resource-evidence'),
    outputDir:args.get('--output-dir'),
  });
}

function requireOutputNotInput(outputDir,inputPaths){
  const outputPaths=[
    'hsme-foundation-quality-frontier.json',
    'hsme-foundation-resource-proof.json',
    'hsme-foundation-pareto-efficiency.json',
    'hsme-foundation-quality-pareto-materialization.json',
  ].map(name=>resolve(outputDir,name));
  const inputs=new Set(inputPaths.map(path=>resolve(path)));
  for(const output of outputPaths){
    if(inputs.has(output)){
      fail(
        'hsme_quality_pareto_output_collision',
        'output path collides with input: '+output,
      );
    }
  }
}

export async function runCli(argv=process.argv.slice(2)){
  const args=parseArgs(argv);
  const inputPaths=[
    args.campaign,
    args.trust,
    args.fixturePlan,
    args.fixturePack,
    args.qualityRubric,
    args.runEvidence,
    args.assessmentEvidence,
    args.resourceEvidence,
  ];
  requireOutputNotInput(args.outputDir,inputPaths);

  const [
    campaign,
    trust,
    fixturePlan,
    fixturePack,
    qualityRubric,
    runEvidence,
    assessmentEvidence,
    resourceEvidence,
  ]=await Promise.all([
    loadJsonFile(args.campaign,'campaign'),
    loadJsonFile(args.trust,'trust'),
    loadJsonFile(args.fixturePlan,'fixture plan'),
    loadJsonFile(args.fixturePack,'fixture pack'),
    loadJsonFile(args.qualityRubric,'quality rubric'),
    loadJsonFile(args.runEvidence,'run evidence'),
    loadJsonFile(args.assessmentEvidence,'assessment evidence'),
    loadJsonFile(args.resourceEvidence,'resource evidence'),
  ]);

  const result=await compileHsmeFoundationQualityParetoEvidence({
    campaign,
    trust,
    fixturePlan,
    fixturePack,
    qualityRubric,
    runEvidence,
    assessmentEvidence,
    resourceEvidence,
  });

  await mkdir(args.outputDir,{recursive:true});
  await Promise.all([
    writeFile(
      resolve(args.outputDir,'hsme-foundation-quality-frontier.json'),
      result.files.qualityFrontier,
    ),
    writeFile(
      resolve(args.outputDir,'hsme-foundation-resource-proof.json'),
      result.files.resourceProof,
    ),
    writeFile(
      resolve(args.outputDir,'hsme-foundation-pareto-efficiency.json'),
      result.files.pareto,
    ),
    writeFile(
      resolve(args.outputDir,'hsme-foundation-quality-pareto-materialization.json'),
      result.files.materialization,
    ),
  ]);

  process.stdout.write(JSON.stringify({
    schemaVersion:HSME_FOUNDATION_QUALITY_PARETO_MATERIALIZATION_V1_SCHEMA,
    qualityFrontierSha256:result.materialization.qualityFrontierSha256,
    resourceEvidenceSha256:result.materialization.resourceEvidenceSha256,
    paretoEvidenceSha256:result.materialization.paretoEvidenceSha256,
    winnerSelectionAllowed:false,
  })+'\n');
}

if(process.env.HSME_FOUNDATION_QUALITY_PARETO_COMPILER_CLI==='1'){
  runCli().catch(error=>{
    process.stderr.write(
      (error.code||'hsme_quality_pareto_compiler_failed')
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
