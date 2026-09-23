#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';

import {
  capabilityProofOriginIndexDigest,
} from './compile-hsme-reuse-capability-proof.mjs';
import {
  candidateAssemblyOriginIndexDigest,
} from './materialize-hsme-reuse-candidate-assembly.mjs';
import {
  hsmeReuseOutcomeOriginIndexV1Digest,
} from '../src/platform/creative/local-ai/hsme/HsmeReuseOutcomeOriginIndexV1.ts';

export const HSME_REUSE_EVIDENCE_PIPELINE_SPEC_V1_SCHEMA =
  'BERS_HSME_REUSE_EVIDENCE_PIPELINE_SPEC_V1';
export const HSME_REUSE_EVIDENCE_PIPELINE_MANIFEST_V1_SCHEMA =
  'BERS_HSME_REUSE_EVIDENCE_PIPELINE_MANIFEST_V1';
export const HSME_REUSE_EVIDENCE_PIPELINE_MANIFEST_DIGEST_V1_SCHEMA =
  'BERS_HSME_REUSE_EVIDENCE_PIPELINE_MANIFEST_DIGEST_V1';
export const HSME_REUSE_EVIDENCE_PIPELINE_MANIFEST_DIGEST_DOMAIN =
  'bers:hsme:reuse-evidence-pipeline-manifest:v1\0';

const HEX64=/^[0-9a-f]{64}$/;
const STAGE_ID=/^[a-z0-9][a-z0-9._:-]{0,119}$/;

export class HsmeReuseEvidencePipelineManifestError extends Error{
  constructor(code,message){
    super(message);
    this.name='HsmeReuseEvidencePipelineManifestError';
    this.code=code;
  }
}

function fail(code,message){
  throw new HsmeReuseEvidencePipelineManifestError(code,message);
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

export function sha256Bytes(bytes){
  return createHash('sha256').update(bytes).digest('hex');
}

export function domainDigest(domain,value){
  return sha256Bytes(Buffer.concat([
    Buffer.from(domain,'utf8'),
    canonicalBytes(value),
  ]));
}

function record(value,path){
  if(value===null||typeof value!=='object'||Array.isArray(value)){
    fail('hsme_reuse_pipeline_spec_record_invalid',path+' must be an object');
  }
  return value;
}

function text(value,path,max=4096){
  if(
    typeof value!=='string'
    ||value.length<1
    ||value.length>max
    ||value.trim()!==value
    ||/[\u0000\r\n]/.test(value)
  ){
    fail('hsme_reuse_pipeline_spec_text_invalid',path+' is invalid');
  }
  return value;
}

function stageId(value,path){
  const result=text(value,path,120);
  if(!STAGE_ID.test(result)){
    fail('hsme_reuse_pipeline_stage_id_invalid',path+' is invalid');
  }
  return result;
}

function pathValue(value,path){
  return resolve(text(value,path,4096));
}

function optionalPin(value,path){
  if(value===null||value===undefined)return null;
  const result=text(value,path,64);
  if(!HEX64.test(result)){
    fail('hsme_reuse_pipeline_pin_invalid',path+' must be lowercase SHA-256 or null');
  }
  return result;
}

function stringArray(value,path,max=32){
  if(!Array.isArray(value)||value.length>max){
    fail('hsme_reuse_pipeline_array_invalid',path+' must be an array with at most '+max+' items');
  }
  return Object.freeze(value.map((entry,index)=>pathValue(entry,path+'['+index+']')));
}

function normalizeSpec(raw){
  const spec=record(raw,'spec');
  if(spec.schemaVersion!==HSME_REUSE_EVIDENCE_PIPELINE_SPEC_V1_SCHEMA){
    fail('hsme_reuse_pipeline_spec_schema_invalid','pipeline spec schema invalid');
  }
  const quality=record(spec.qualityPareto,'spec.qualityPareto');
  const capabilityRaw=spec.capabilityProofs;
  const assemblyRaw=spec.candidateAssemblies;
  const outcome=record(spec.outcome,'spec.outcome');
  if(!Array.isArray(capabilityRaw)||capabilityRaw.length>32){
    fail('hsme_reuse_pipeline_capability_count_invalid','capabilityProofs must contain 0..32 stages');
  }
  if(!Array.isArray(assemblyRaw)||assemblyRaw.length>16){
    fail('hsme_reuse_pipeline_assembly_count_invalid','candidateAssemblies must contain 0..16 stages');
  }

  const capabilityProofs=capabilityRaw.map((rawStage,index)=>{
    const value=record(rawStage,'spec.capabilityProofs['+index+']');
    return Object.freeze({
      stageId:stageId(value.stageId,'spec.capabilityProofs['+index+'].stageId'),
      sourceDecision:pathValue(value.sourceDecision,'capability.sourceDecision'),
      runtimeOverlay:pathValue(value.runtimeOverlay,'capability.runtimeOverlay'),
      campaign:pathValue(value.campaign,'capability.campaign'),
      trust:pathValue(value.trust,'capability.trust'),
      qualityFinalization:pathValue(value.qualityFinalization,'capability.qualityFinalization'),
      trainingAttestation:value.trainingAttestation===null||value.trainingAttestation===undefined
        ?null
        :pathValue(value.trainingAttestation,'capability.trainingAttestation'),
      originIndex:pathValue(value.originIndex,'capability.originIndex'),
      expectedOriginIndexSha256:optionalPin(
        value.expectedOriginIndexSha256,
        'capability.expectedOriginIndexSha256',
      ),
      outputDir:pathValue(value.outputDir,'capability.outputDir'),
    });
  }).sort((a,b)=>lexical(a.stageId,b.stageId));

  const candidateAssemblies=assemblyRaw.map((rawStage,index)=>{
    const value=record(rawStage,'spec.candidateAssemblies['+index+']');
    return Object.freeze({
      stageId:stageId(value.stageId,'spec.candidateAssemblies['+index+'].stageId'),
      candidateId:text(value.candidateId,'candidateAssembly.candidateId',120),
      sourceDecision:pathValue(value.sourceDecision,'candidateAssembly.sourceDecision'),
      campaign:pathValue(value.campaign,'candidateAssembly.campaign'),
      proofs:stringArray(value.proofs,'candidateAssembly.proofs',32),
      originIndex:pathValue(value.originIndex,'candidateAssembly.originIndex'),
      expectedOriginIndexSha256:optionalPin(
        value.expectedOriginIndexSha256,
        'candidateAssembly.expectedOriginIndexSha256',
      ),
      outputDir:pathValue(value.outputDir,'candidateAssembly.outputDir'),
    });
  }).sort((a,b)=>lexical(a.stageId,b.stageId));

  const normalized=Object.freeze({
    schemaVersion:HSME_REUSE_EVIDENCE_PIPELINE_SPEC_V1_SCHEMA,
    qualityPareto:Object.freeze({
      campaign:pathValue(quality.campaign,'qualityPareto.campaign'),
      trust:pathValue(quality.trust,'qualityPareto.trust'),
      fixturePlan:pathValue(quality.fixturePlan,'qualityPareto.fixturePlan'),
      fixturePack:pathValue(quality.fixturePack,'qualityPareto.fixturePack'),
      qualityRubric:pathValue(quality.qualityRubric,'qualityPareto.qualityRubric'),
      runEvidence:pathValue(quality.runEvidence,'qualityPareto.runEvidence'),
      assessmentEvidence:pathValue(quality.assessmentEvidence,'qualityPareto.assessmentEvidence'),
      resourceEvidence:pathValue(quality.resourceEvidence,'qualityPareto.resourceEvidence'),
      outputDir:pathValue(quality.outputDir,'qualityPareto.outputDir'),
    }),
    capabilityProofs:Object.freeze(capabilityProofs),
    candidateAssemblies:Object.freeze(candidateAssemblies),
    outcome:Object.freeze({
      sourceDecision:pathValue(outcome.sourceDecision,'outcome.sourceDecision'),
      campaign:pathValue(outcome.campaign,'outcome.campaign'),
      assemblies:stringArray(outcome.assemblies,'outcome.assemblies',16),
      frontier:pathValue(outcome.frontier,'outcome.frontier'),
      pareto:pathValue(outcome.pareto,'outcome.pareto'),
      originFreezeOutputDir:pathValue(
        outcome.originFreezeOutputDir,
        'outcome.originFreezeOutputDir',
      ),
      expectedOriginIndexSha256:optionalPin(
        outcome.expectedOriginIndexSha256,
        'outcome.expectedOriginIndexSha256',
      ),
      materializationOutputDir:pathValue(
        outcome.materializationOutputDir,
        'outcome.materializationOutputDir',
      ),
    }),
  });

  const ids=[
    'quality-pareto',
    ...normalized.capabilityProofs.map(value=>'capability:'+value.stageId),
    ...normalized.candidateAssemblies.map(value=>'assembly:'+value.stageId),
    'outcome-origin-freeze',
    'outcome-materialization',
  ];
  if(new Set(ids).size!==ids.length){
    fail('hsme_reuse_pipeline_stage_duplicate','pipeline stage ids must be unique');
  }
  return normalized;
}

async function loadOptionalJson(path){
  let bytes;
  try{
    bytes=await readFile(path);
  }catch(error){
    if(error?.code==='ENOENT'){
      return Object.freeze({path,exists:false,fileSha256:null,value:null});
    }
    fail('hsme_reuse_pipeline_file_read_failed',path+': '+error.message);
  }
  let value;
  try{
    value=JSON.parse(bytes.toString('utf8'));
  }catch(error){
    fail('hsme_reuse_pipeline_json_invalid',path+': '+error.message);
  }
  return Object.freeze({
    path,
    exists:true,
    fileSha256:sha256Bytes(bytes),
    value,
  });
}

function qualityOutputs(stage){
  return Object.freeze([
    resolve(stage.outputDir,'hsme-foundation-quality-frontier.json'),
    resolve(stage.outputDir,'hsme-foundation-resource-proof.json'),
    resolve(stage.outputDir,'hsme-foundation-pareto-efficiency.json'),
    resolve(stage.outputDir,'hsme-foundation-quality-pareto-materialization.json'),
  ]);
}

function capabilityOutputs(stage){
  return Object.freeze([
    resolve(stage.outputDir,'hsme-reuse-capability-proof.json'),
    resolve(stage.outputDir,'hsme-reuse-capability-proof-materialization.json'),
  ]);
}

function assemblyOutputs(stage){
  return Object.freeze([
    resolve(stage.outputDir,'hsme-reuse-candidate-assembly.json'),
    resolve(stage.outputDir,'hsme-reuse-candidate-assembly-materialization.json'),
  ]);
}

function outcomeFreezeOutputs(stage){
  return Object.freeze([
    resolve(stage.originFreezeOutputDir,'reuse-outcome-origin-index.json'),
    resolve(stage.originFreezeOutputDir,'reuse-outcome-origin-index-digest.json'),
  ]);
}

function outcomeMaterializationOutputs(stage){
  return Object.freeze([
    resolve(stage.materializationOutputDir,'reuse-decision-finalization.json'),
    resolve(stage.materializationOutputDir,'reuse-outcome-handoff.json'),
    resolve(stage.materializationOutputDir,'reuse-outcome-materialization-evidence.json'),
  ]);
}

function collectStageDefinitions(spec){
  const stages=[];
  const q=spec.qualityPareto;
  stages.push({
    id:'quality-pareto',
    kind:'QUALITY_PARETO',
    inputs:[
      q.campaign,q.trust,q.fixturePlan,q.fixturePack,q.qualityRubric,
      q.runEvidence,q.assessmentEvidence,q.resourceEvidence,
    ],
    outputs:qualityOutputs(q),
    originIndex:null,
    expectedPin:null,
    env:{HSME_FOUNDATION_QUALITY_PARETO_COMPILER_CLI:'1'},
    argv:[
      'node','scripts/compile-hsme-foundation-quality-pareto-evidence.mjs',
      '--campaign',q.campaign,
      '--trust',q.trust,
      '--fixture-plan',q.fixturePlan,
      '--fixture-pack',q.fixturePack,
      '--quality-rubric',q.qualityRubric,
      '--run-evidence',q.runEvidence,
      '--assessment-evidence',q.assessmentEvidence,
      '--resource-evidence',q.resourceEvidence,
      '--output-dir',q.outputDir,
    ],
  });

  for(const stage of spec.capabilityProofs){
    const inputs=[
      stage.sourceDecision,stage.runtimeOverlay,stage.campaign,stage.trust,
      stage.qualityFinalization,stage.originIndex,
      ...(stage.trainingAttestation?[stage.trainingAttestation]:[]),
    ];
    const argv=[
      'node','scripts/compile-hsme-reuse-capability-proof.mjs',
      '--source-decision',stage.sourceDecision,
      '--runtime-overlay',stage.runtimeOverlay,
      '--campaign',stage.campaign,
      '--trust',stage.trust,
      '--quality-finalization',stage.qualityFinalization,
      ...(stage.trainingAttestation
        ?['--training-attestation',stage.trainingAttestation]
        :[]),
      '--origin-index',stage.originIndex,
      '--expected-origin-index-sha256',stage.expectedOriginIndexSha256??'<EXTERNAL_PIN_REQUIRED>',
      '--output-dir',stage.outputDir,
    ];
    stages.push({
      id:'capability:'+stage.stageId,
      kind:'CAPABILITY_PROOF',
      inputs,
      outputs:capabilityOutputs(stage),
      originIndex:stage.originIndex,
      expectedPin:stage.expectedOriginIndexSha256,
      env:{HSME_REUSE_CAPABILITY_PROOF_COMPILER_CLI:'1'},
      argv,
    });
  }

  for(const stage of spec.candidateAssemblies){
    const argv=[
      'node','scripts/materialize-hsme-reuse-candidate-assembly.mjs',
      '--source-decision',stage.sourceDecision,
      '--campaign',stage.campaign,
      ...stage.proofs.flatMap(path=>['--proof',path]),
      '--origin-index',stage.originIndex,
      '--expected-origin-index-sha256',stage.expectedOriginIndexSha256??'<EXTERNAL_PIN_REQUIRED>',
      '--output-dir',stage.outputDir,
    ];
    stages.push({
      id:'assembly:'+stage.stageId,
      kind:'CANDIDATE_ASSEMBLY',
      inputs:[stage.sourceDecision,stage.campaign,...stage.proofs,stage.originIndex],
      outputs:assemblyOutputs(stage),
      originIndex:stage.originIndex,
      expectedPin:stage.expectedOriginIndexSha256,
      env:{HSME_REUSE_CANDIDATE_ASSEMBLY_MATERIALIZER_CLI:'1'},
      argv,
    });
  }

  const o=spec.outcome;
  stages.push({
    id:'outcome-origin-freeze',
    kind:'OUTCOME_ORIGIN_FREEZE',
    inputs:[o.sourceDecision,o.campaign,...o.assemblies,o.frontier,o.pareto],
    outputs:outcomeFreezeOutputs(o),
    originIndex:null,
    expectedPin:null,
    env:{HSME_REUSE_OUTCOME_ORIGIN_BUILDER_CLI:'1'},
    argv:[
      'node','scripts/build-hsme-reuse-outcome-origin-index.mjs',
      '--source-decision',o.sourceDecision,
      '--campaign',o.campaign,
      ...o.assemblies.flatMap(path=>['--assembly',path]),
      '--frontier',o.frontier,
      '--pareto',o.pareto,
      '--output-dir',o.originFreezeOutputDir,
    ],
  });

  const outcomeOrigin=resolve(o.originFreezeOutputDir,'reuse-outcome-origin-index.json');
  stages.push({
    id:'outcome-materialization',
    kind:'OUTCOME_MATERIALIZATION',
    inputs:[
      o.sourceDecision,o.campaign,...o.assemblies,o.frontier,o.pareto,outcomeOrigin,
    ],
    outputs:outcomeMaterializationOutputs(o),
    originIndex:outcomeOrigin,
    expectedPin:o.expectedOriginIndexSha256,
    env:{HSME_REUSE_OUTCOME_MATERIALIZER_CLI:'1'},
    argv:[
      'node','scripts/materialize-hsme-reuse-outcome-evidence.mjs',
      '--source-decision',o.sourceDecision,
      '--campaign',o.campaign,
      ...o.assemblies.flatMap(path=>['--assembly',path]),
      '--frontier',o.frontier,
      '--pareto',o.pareto,
      '--origin-index',outcomeOrigin,
      '--expected-origin-index-sha256',o.expectedOriginIndexSha256??'<EXTERNAL_PIN_REQUIRED>',
      '--output-dir',o.materializationOutputDir,
    ],
  });

  return Object.freeze(stages);
}

function validatePathGraph(stages,manifestOutputs){
  const producers=new Map();
  for(const stage of stages){
    for(const output of stage.outputs){
      if(producers.has(output)){
        fail(
          'hsme_reuse_pipeline_output_duplicate',
          'multiple stages produce '+output,
        );
      }
      producers.set(output,stage.id);
    }
  }
  for(const output of manifestOutputs){
    if(producers.has(output)){
      fail(
        'hsme_reuse_pipeline_manifest_output_collision',
        'manifest output collides with stage output '+output,
      );
    }
    producers.set(output,'pipeline-manifest');
  }

  const allOutputs=new Set(producers.keys());
  for(const stage of stages){
    for(const input of stage.inputs){
      if(stage.outputs.includes(input)){
        fail(
          'hsme_reuse_pipeline_stage_self_alias',
          stage.id+' input aliases its own output '+input,
        );
      }
    }
  }
  return producers;
}

async function originSemanticDigest(kind,loaded){
  if(!loaded?.exists)return null;
  try{
    if(kind==='CAPABILITY_PROOF'){
      return capabilityProofOriginIndexDigest(loaded.value);
    }
    if(kind==='CANDIDATE_ASSEMBLY'){
      return candidateAssemblyOriginIndexDigest(loaded.value);
    }
    if(kind==='OUTCOME_MATERIALIZATION'){
      return await hsmeReuseOutcomeOriginIndexV1Digest(loaded.value,hashPort);
    }
  }catch(error){
    fail(
      'hsme_reuse_pipeline_origin_index_invalid',
      kind+': '+(error?.code?error.code+': ':'')+(error?.message||String(error)),
    );
  }
  return null;
}

function localStageStatus({missing,predecessorMissing,semanticDigest,expectedPin,kind}){
  if(missing.length>0){
    return predecessorMissing.length>0?'BLOCKED_BY_PREDECESSOR':'INPUT_REQUIRED';
  }
  if(
    kind==='CAPABILITY_PROOF'
    ||kind==='CANDIDATE_ASSEMBLY'
    ||kind==='OUTCOME_MATERIALIZATION'
  ){
    if(expectedPin===null)return 'EXTERNAL_PIN_REQUIRED';
    if(semanticDigest!==expectedPin)return 'PIN_MISMATCH';
  }
  return 'READY';
}

function pipelineState(stages){
  const states=stages.map(value=>value.status);
  if(states.includes('PIN_MISMATCH'))return 'BLOCKED_PIN_MISMATCH';
  if(states.includes('INPUT_REQUIRED'))return 'BLOCKED_INPUT_REQUIRED';
  if(states.includes('EXTERNAL_PIN_REQUIRED'))return 'BLOCKED_EXTERNAL_PIN_REQUIRED';
  if(states.includes('BLOCKED_BY_PREDECESSOR'))return 'BLOCKED_BY_PREDECESSOR';
  return 'READY';
}

export async function planHsmeReuseEvidencePipeline({
  spec,
  specFileSha256,
  manifestPath,
  digestPath,
}){
  if(!HEX64.test(specFileSha256)){
    fail('hsme_reuse_pipeline_spec_digest_invalid','specFileSha256 must be lowercase SHA-256');
  }
  const normalized=normalizeSpec(spec);
  const definitions=collectStageDefinitions(normalized);
  const producers=validatePathGraph(definitions,[manifestPath,digestPath]);

  const inputPaths=[...new Set(definitions.flatMap(stage=>stage.inputs))].sort(lexical);
  const loadedEntries=await Promise.all(inputPaths.map(loadOptionalJson));
  const loadedByPath=new Map(loadedEntries.map(value=>[value.path,value]));

  const stages=[];
  const statusById=new Map();
  for(const definition of definitions){
    const missing=definition.inputs.filter(path=>!loadedByPath.get(path)?.exists);
    const predecessorMissing=missing
      .filter(path=>producers.has(path))
      .map(path=>Object.freeze({path,producerStageId:producers.get(path)}))
      .sort((a,b)=>lexical(a.path,b.path));
    const dependencies=[...new Set(definition.inputs
      .map(path=>producers.get(path))
      .filter(Boolean)
      .filter(value=>value!==definition.id))]
      .sort(lexical);
    const blockedDependencies=dependencies.filter(
      id=>statusById.get(id)!=='READY',
    );
    const originLoaded=definition.originIndex
      ?loadedByPath.get(definition.originIndex)
      :null;
    const semanticDigest=await originSemanticDigest(definition.kind,originLoaded);
    const localStatus=localStageStatus({
      missing,
      predecessorMissing,
      semanticDigest,
      expectedPin:definition.expectedPin,
      kind:definition.kind,
    });
    const status=localStatus==='PIN_MISMATCH'
      ?'PIN_MISMATCH'
      :blockedDependencies.length>0
        ?'BLOCKED_BY_PREDECESSOR'
        :localStatus;
    statusById.set(definition.id,status);
    stages.push(Object.freeze({
      stageId:definition.id,
      kind:definition.kind,
      status,
      localStatus,
      dependencies:Object.freeze(dependencies),
      blockedDependencies:Object.freeze(blockedDependencies),
      missingInputs:Object.freeze([...missing].sort(lexical)),
      predecessorMissingInputs:Object.freeze(predecessorMissing),
      originIndexSemanticSha256:semanticDigest,
      expectedExternalPinSha256:definition.expectedPin,
      env:Object.freeze({...definition.env}),
      argv:Object.freeze([...definition.argv]),
      inputs:Object.freeze([...definition.inputs]),
      outputs:Object.freeze([...definition.outputs]),
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
    }));
  }

  const inputs=Object.freeze(loadedEntries.map(value=>Object.freeze({
    path:value.path,
    state:value.exists?'PRESENT':'MISSING',
    fileSha256:value.fileSha256,
  })).sort((a,b)=>lexical(a.path,b.path)));

  const manifest=Object.freeze({
    schemaVersion:HSME_REUSE_EVIDENCE_PIPELINE_MANIFEST_V1_SCHEMA,
    specFileSha256,
    pipelineState:pipelineState(stages),
    inputs,
    stages:Object.freeze(stages),
    plannerExecutesStages:false,
    externalPinsAutoTrusted:false,
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
  });

  const manifestBytes=canonicalFileBytes(manifest);
  const manifestFileSha256=sha256Bytes(manifestBytes);
  const manifestSha256=domainDigest(
    HSME_REUSE_EVIDENCE_PIPELINE_MANIFEST_DIGEST_DOMAIN,
    manifest,
  );
  const digest=Object.freeze({
    schemaVersion:HSME_REUSE_EVIDENCE_PIPELINE_MANIFEST_DIGEST_V1_SCHEMA,
    specFileSha256,
    manifestSha256,
    manifestFileSha256,
    pipelineState:manifest.pipelineState,
    externalPinsAutoTrusted:false,
    plannerExecutesStages:false,
    winnerSelectionAllowed:false,
    productionAuthorityGranted:false,
  });

  return Object.freeze({
    manifest,
    digest,
    files:Object.freeze({
      manifest:manifestBytes,
      digest:canonicalFileBytes(digest),
    }),
  });
}

export async function runCli(argv=process.argv.slice(2)){
  const args=new Map();
  for(let index=0;index<argv.length;index+=2){
    const key=argv[index];
    const value=argv[index+1];
    if(!key?.startsWith('--')||value===undefined||args.has(key)){
      fail('hsme_reuse_pipeline_cli_invalid','arguments must be unique --key value pairs');
    }
    args.set(key,value);
  }
  for(const key of ['--spec','--output-dir']){
    if(!args.has(key))fail('hsme_reuse_pipeline_cli_invalid','missing '+key);
  }

  const specPath=resolve(args.get('--spec'));
  const outputDir=resolve(args.get('--output-dir'));
  const manifestPath=resolve(outputDir,'hsme-reuse-evidence-pipeline-manifest.json');
  const digestPath=resolve(outputDir,'hsme-reuse-evidence-pipeline-manifest-digest.json');
  if(specPath===manifestPath||specPath===digestPath){
    fail('hsme_reuse_pipeline_output_collision','pipeline spec cannot alias manifest output');
  }

  let bytes;
  try{
    bytes=await readFile(specPath);
  }catch(error){
    fail('hsme_reuse_pipeline_spec_read_failed',error.message);
  }
  let spec;
  try{
    spec=JSON.parse(bytes.toString('utf8'));
  }catch(error){
    fail('hsme_reuse_pipeline_spec_json_invalid',error.message);
  }

  const result=await planHsmeReuseEvidencePipeline({
    spec,
    specFileSha256:sha256Bytes(bytes),
    manifestPath,
    digestPath,
  });

  await mkdir(dirname(manifestPath),{recursive:true});
  await Promise.all([
    writeFile(manifestPath,result.files.manifest),
    writeFile(digestPath,result.files.digest),
  ]);

  process.stdout.write(JSON.stringify({
    schemaVersion:HSME_REUSE_EVIDENCE_PIPELINE_MANIFEST_DIGEST_V1_SCHEMA,
    pipelineState:result.manifest.pipelineState,
    manifestSha256:result.digest.manifestSha256,
    manifestFileSha256:result.digest.manifestFileSha256,
  })+'\n');
}

if(process.env.HSME_REUSE_EVIDENCE_PIPELINE_PLANNER_CLI==='1'){
  runCli().catch(error=>{
    process.stderr.write(
      (error.code||'hsme_reuse_pipeline_failed')+': '+error.message+'\n',
    );
    process.exitCode=1;
  });
}

function lexical(left,right){
  return left<right?-1:left>right?1:0;
}
