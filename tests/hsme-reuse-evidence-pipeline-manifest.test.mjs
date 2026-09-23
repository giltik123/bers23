import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import test from 'node:test';

import {
  capabilityProofOriginIndexDigest,
  HSME_REUSE_CAPABILITY_PROOF_ORIGIN_INDEX_V1_SCHEMA,
} from '../scripts/compile-hsme-reuse-capability-proof.mjs';
import {
  candidateAssemblyOriginIndexDigest,
  HSME_REUSE_CANDIDATE_ASSEMBLY_ORIGIN_INDEX_V1_SCHEMA,
} from '../scripts/materialize-hsme-reuse-candidate-assembly.mjs';
import {
  hsmeReuseOutcomeOriginIndexV1Digest,
  HSME_REUSE_OUTCOME_ORIGIN_INDEX_V1_SCHEMA,
} from '../src/platform/creative/local-ai/hsme/HsmeReuseOutcomeOriginIndexV1.ts';
import {
  HSME_REUSE_EVIDENCE_PIPELINE_SPEC_V1_SCHEMA,
  planHsmeReuseEvidencePipeline,
  sha256Bytes,
} from '../scripts/plan-hsme-reuse-evidence-pipeline.mjs';

const H=value=>createHash('sha256').update(value).digest('hex');
const hashPort={sha256:async bytes=>createHash('sha256').update(bytes).digest('hex')};

async function writeJson(path,value){
  await mkdir(resolve(path,'..'),{recursive:true}).catch(()=>{});
  const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n','utf8');
  await writeFile(path,bytes);
  return sha256Bytes(bytes);
}

async function ensureDir(path){
  await mkdir(path,{recursive:true});
}

function noAuthority(){
  return {
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
}

async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'hsme-pipeline-'));
  const inputDir=join(root,'inputs');
  const qualityOut=join(root,'quality');
  const capabilityOut=join(root,'capability');
  const assemblyOut=join(root,'assembly');
  const outcomeFreezeOut=join(root,'outcome-freeze');
  const outcomeOut=join(root,'outcome');
  const manifestOut=join(root,'manifest');
  await Promise.all([
    ensureDir(inputDir),ensureDir(qualityOut),ensureDir(capabilityOut),
    ensureDir(assemblyOut),ensureDir(outcomeFreezeOut),ensureDir(outcomeOut),
    ensureDir(manifestOut),
  ]);

  const paths={
    sourceDecision:join(inputDir,'source-decision.json'),
    runtimeOverlay:join(inputDir,'runtime-overlay.json'),
    campaign:join(inputDir,'campaign.json'),
    trust:join(inputDir,'trust.json'),
    qualityFinalization:join(inputDir,'quality-finalization.json'),
    fixturePlan:join(inputDir,'fixture-plan.json'),
    fixturePack:join(inputDir,'fixture-pack.json'),
    qualityRubric:join(inputDir,'quality-rubric.json'),
    runEvidence:join(inputDir,'run-evidence.json'),
    assessmentEvidence:join(inputDir,'assessment-evidence.json'),
    resourceEvidence:join(inputDir,'resource-evidence.json'),
    capabilityOrigin:join(inputDir,'capability-origin-index.json'),
    assemblyOrigin:join(inputDir,'assembly-origin-index.json'),
  };

  const sha={};
  for(const [name,path] of Object.entries(paths)){
    if(name.endsWith('Origin'))continue;
    sha[name]=await writeJson(path,{kind:name,authority:false});
  }

  const capabilityProofPath=join(capabilityOut,'hsme-reuse-capability-proof.json');
  const capabilityMaterializationPath=join(
    capabilityOut,
    'hsme-reuse-capability-proof-materialization.json',
  );
  const proofEvidenceSetSha256=H('proof-evidence-set');
  await writeJson(capabilityProofPath,{
    schemaVersion:'BERS_HSME_FOUNDATION_REUSE_EVIDENCE_QUALIFICATION_V1',
    candidateId:'candidate-a',
    capability:'IMAGE_EDITING',
    state:'QUALIFICATION_EVIDENCE_READY',
    blockers:[],
    evidenceSetSha256:proofEvidenceSetSha256,
  });
  await writeJson(capabilityMaterializationPath,{state:'old-output'});

  const capabilityOrigin={
    schemaVersion:HSME_REUSE_CAPABILITY_PROOF_ORIGIN_INDEX_V1_SCHEMA,
    mode:'REJECTION',
    candidateId:'candidate-a',
    capability:'IMAGE_EDITING',
    sourceDecisionFileSha256:sha.sourceDecision,
    runtimeOverlayFileSha256:sha.runtimeOverlay,
    runtimeEvidenceSha256:H('runtime-evidence'),
    campaignFileSha256:sha.campaign,
    trustFileSha256:sha.trust,
    qualityFinalizationFileSha256:sha.qualityFinalization,
    qualityFinalizationSha256:H('quality-finalization-semantic'),
    trainingAttestationFileSha256:'NONE',
    ...noAuthority(),
  };
  delete capabilityOrigin.reuseAdvanceAllowed;
  delete capabilityOrigin.fullStudentEscalationAllowed;
  await writeJson(paths.capabilityOrigin,capabilityOrigin);
  const capabilityPin=capabilityProofOriginIndexDigest(capabilityOrigin);

  const assemblyProofFileSha256=sha256Bytes(await readFile(capabilityProofPath));
  const assemblyOrigin={
    schemaVersion:HSME_REUSE_CANDIDATE_ASSEMBLY_ORIGIN_INDEX_V1_SCHEMA,
    candidateId:'candidate-a',
    sourceDecisionFileSha256:sha.sourceDecision,
    campaignFileSha256:sha.campaign,
    proofs:[{
      kind:'QUALIFICATION',
      capability:'IMAGE_EDITING',
      fileSha256:assemblyProofFileSha256,
      evidenceSetSha256:proofEvidenceSetSha256,
    }],
    ...noAuthority(),
  };
  await writeJson(paths.assemblyOrigin,assemblyOrigin);
  const assemblyPin=candidateAssemblyOriginIndexDigest(assemblyOrigin);

  const assemblyPath=join(assemblyOut,'hsme-reuse-candidate-assembly.json');
  await writeJson(assemblyPath,{
    schemaVersion:'BERS_HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_ASSEMBLY_V1',
    candidateId:'candidate-a',
    state:'CANDIDATE_EVIDENCE_INCOMPLETE',
    candidateEvidenceSetSha256:'UNKNOWN',
  });
  await writeJson(
    join(assemblyOut,'hsme-reuse-candidate-assembly-materialization.json'),
    {state:'old-output'},
  );

  const frontierPath=join(qualityOut,'hsme-foundation-quality-frontier.json');
  const paretoPath=join(qualityOut,'hsme-foundation-pareto-efficiency.json');
  await writeJson(frontierPath,{schemaVersion:'frontier-placeholder'});
  await writeJson(paretoPath,{schemaVersion:'pareto-placeholder'});
  await writeJson(
    join(qualityOut,'hsme-foundation-resource-proof.json'),
    {schemaVersion:'resource-placeholder'},
  );
  await writeJson(
    join(qualityOut,'hsme-foundation-quality-pareto-materialization.json'),
    {schemaVersion:'materialization-placeholder'},
  );

  const outcomeOriginPath=join(outcomeFreezeOut,'reuse-outcome-origin-index.json');
  const outcomeOrigin={
    schemaVersion:HSME_REUSE_OUTCOME_ORIGIN_INDEX_V1_SCHEMA,
    sourceDecisionFileSha256:sha.sourceDecision,
    campaignFileSha256:sha.campaign,
    candidateAssemblies:[{
      candidateId:'candidate-a',
      fileSha256:sha256Bytes(await readFile(assemblyPath)),
      candidateEvidenceSetSha256:'UNKNOWN',
    }],
    qualityFrontier:{
      fileSha256:sha256Bytes(await readFile(frontierPath)),
      qualityFrontierSha256:H('frontier-semantic'),
    },
    paretoEfficiency:{
      fileSha256:sha256Bytes(await readFile(paretoPath)),
      paretoEvidenceSha256:H('pareto-semantic'),
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
  await writeJson(outcomeOriginPath,outcomeOrigin);
  await writeJson(
    join(outcomeFreezeOut,'reuse-outcome-origin-index-digest.json'),
    {trustState:'FREEZE_CANDIDATE'},
  );
  const outcomePin=await hsmeReuseOutcomeOriginIndexV1Digest(
    outcomeOrigin,
    hashPort,
  );

  const makeSpec=({
    capabilityExpected=capabilityPin,
    assemblyExpected=assemblyPin,
    outcomeExpected=outcomePin,
  }={})=>({
    schemaVersion:HSME_REUSE_EVIDENCE_PIPELINE_SPEC_V1_SCHEMA,
    qualityPareto:{
      campaign:paths.campaign,
      trust:paths.trust,
      fixturePlan:paths.fixturePlan,
      fixturePack:paths.fixturePack,
      qualityRubric:paths.qualityRubric,
      runEvidence:paths.runEvidence,
      assessmentEvidence:paths.assessmentEvidence,
      resourceEvidence:paths.resourceEvidence,
      outputDir:qualityOut,
    },
    capabilityProofs:[{
      stageId:'candidate-a-editing',
      sourceDecision:paths.sourceDecision,
      runtimeOverlay:paths.runtimeOverlay,
      campaign:paths.campaign,
      trust:paths.trust,
      qualityFinalization:paths.qualityFinalization,
      trainingAttestation:null,
      originIndex:paths.capabilityOrigin,
      expectedOriginIndexSha256:capabilityExpected,
      outputDir:capabilityOut,
    }],
    candidateAssemblies:[{
      stageId:'candidate-a',
      candidateId:'candidate-a',
      sourceDecision:paths.sourceDecision,
      campaign:paths.campaign,
      proofs:[capabilityProofPath],
      originIndex:paths.assemblyOrigin,
      expectedOriginIndexSha256:assemblyExpected,
      outputDir:assemblyOut,
    }],
    outcome:{
      sourceDecision:paths.sourceDecision,
      campaign:paths.campaign,
      assemblies:[assemblyPath],
      frontier:frontierPath,
      pareto:paretoPath,
      originFreezeOutputDir:outcomeFreezeOut,
      expectedOriginIndexSha256:outcomeExpected,
      materializationOutputDir:outcomeOut,
    },
  });

  const manifestPath=join(manifestOut,'hsme-reuse-evidence-pipeline-manifest.json');
  const digestPath=join(manifestOut,'hsme-reuse-evidence-pipeline-manifest-digest.json');

  return {
    root,paths,qualityOut,capabilityOut,assemblyOut,outcomeFreezeOut,outcomeOut,
    manifestPath,digestPath,makeSpec,capabilityPin,assemblyPin,outcomePin,
  };
}

async function plan(fx,spec){
  const specBytes=Buffer.from(JSON.stringify(spec,null,2)+'\n','utf8');
  return planHsmeReuseEvidencePipeline({
    spec,
    specFileSha256:sha256Bytes(specBytes),
    manifestPath:fx.manifestPath,
    digestPath:fx.digestPath,
  });
}

test('matching pins and present files produce a fully READY manifest',async()=>{
  const fx=await fixture();
  const result=await plan(fx,fx.makeSpec());
  assert.equal(result.manifest.pipelineState,'READY');
  assert.ok(result.manifest.stages.every(stage=>stage.status==='READY'));
  assert.ok(result.manifest.stages.every(stage=>Array.isArray(stage.argv)));
  assert.ok(result.manifest.stages.every(stage=>typeof stage.env==='object'));
  assert.equal(result.manifest.plannerExecutesStages,false);
  assert.equal(result.manifest.externalPinsAutoTrusted,false);
});

test('absent capability pin remains EXTERNAL_PIN_REQUIRED and blocks stale downstream outputs',async()=>{
  const fx=await fixture();
  const result=await plan(fx,fx.makeSpec({capabilityExpected:null}));
  const capability=result.manifest.stages.find(
    stage=>stage.kind==='CAPABILITY_PROOF',
  );
  const assembly=result.manifest.stages.find(
    stage=>stage.kind==='CANDIDATE_ASSEMBLY',
  );
  const freeze=result.manifest.stages.find(
    stage=>stage.kind==='OUTCOME_ORIGIN_FREEZE',
  );
  assert.equal(capability.status,'EXTERNAL_PIN_REQUIRED');
  assert.equal(assembly.status,'BLOCKED_BY_PREDECESSOR');
  assert.ok(assembly.blockedDependencies.includes(capability.stageId));
  assert.equal(freeze.status,'BLOCKED_BY_PREDECESSOR');
  assert.equal(result.manifest.pipelineState,'BLOCKED_EXTERNAL_PIN_REQUIRED');
  assert.ok(capability.argv.includes('<EXTERNAL_PIN_REQUIRED>'));
});

test('wrong external pin is PIN_MISMATCH and never degrades to READY',async()=>{
  const fx=await fixture();
  const result=await plan(
    fx,
    fx.makeSpec({capabilityExpected:H('wrong-capability-pin')}),
  );
  const capability=result.manifest.stages.find(
    stage=>stage.kind==='CAPABILITY_PROOF',
  );
  assert.equal(capability.status,'PIN_MISMATCH');
  assert.equal(result.manifest.pipelineState,'BLOCKED_PIN_MISMATCH');
});

test('same exact spec and files produce byte-identical manifest and digest',async()=>{
  const fx=await fixture();
  const spec=fx.makeSpec();
  const first=await plan(fx,spec);
  const second=await plan(fx,spec);
  assert.deepEqual(first.files.manifest,second.files.manifest);
  assert.deepEqual(first.files.digest,second.files.digest);
});

test('one-byte JSON input drift changes manifest digest while preserving spec digest',async()=>{
  const fx=await fixture();
  const spec=fx.makeSpec();
  const first=await plan(fx,spec);
  await writeFile(
    fx.paths.resourceEvidence,
    Buffer.from('{"kind":"resourceEvidence","authority":false} \n','utf8'),
  );
  const second=await plan(fx,spec);
  assert.equal(first.manifest.specFileSha256,second.manifest.specFileSha256);
  assert.notEqual(first.digest.manifestSha256,second.digest.manifestSha256);
});

test('missing produced output is BLOCKED_BY_PREDECESSOR rather than generic input failure',async()=>{
  const fx=await fixture();
  const missingProof=join(fx.capabilityOut,'hsme-reuse-capability-proof.json');
  await writeFile(missingProof+'.moved',await readFile(missingProof));
  const {rename}=await import('node:fs/promises');
  await rename(missingProof,missingProof+'.absent');
  const result=await plan(fx,fx.makeSpec());
  const assembly=result.manifest.stages.find(
    stage=>stage.kind==='CANDIDATE_ASSEMBLY',
  );
  assert.equal(assembly.status,'BLOCKED_BY_PREDECESSOR');
  assert.ok(assembly.missingInputs.includes(resolve(missingProof)));
});

test('stage input may not alias its own deterministic output',async()=>{
  const fx=await fixture();
  const spec=fx.makeSpec();
  spec.qualityPareto.campaign=join(
    fx.qualityOut,
    'hsme-foundation-quality-frontier.json',
  );
  await assert.rejects(
    ()=>plan(fx,spec),
    error=>error.code==='hsme_reuse_pipeline_stage_self_alias',
  );
});

test('manifest never grants execution, selection, reuse or production authority',async()=>{
  const fx=await fixture();
  const result=await plan(fx,fx.makeSpec());
  for(const field of [
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
  ]){
    assert.equal(result.manifest[field],false,field);
  }
});
