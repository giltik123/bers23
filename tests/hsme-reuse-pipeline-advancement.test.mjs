import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

import {
  HSME_REUSE_EVIDENCE_PIPELINE_MANIFEST_DIGEST_DOMAIN,
  HSME_REUSE_EVIDENCE_PIPELINE_MANIFEST_DIGEST_V1_SCHEMA,
  HSME_REUSE_EVIDENCE_PIPELINE_MANIFEST_V1_SCHEMA,
  canonicalFileBytes,
  domainDigest,
  sha256Bytes,
} from '../scripts/plan-hsme-reuse-evidence-pipeline.mjs';
import {
  HSME_REUSE_PIPELINE_STAGE_ARGV_DIGEST_DOMAIN,
  HSME_REUSE_PIPELINE_STAGE_DEFINITION_DIGEST_DOMAIN,
  HSME_REUSE_PIPELINE_STAGE_EXECUTION_RECEIPT_DIGEST_DOMAIN,
  HSME_REUSE_PIPELINE_STAGE_EXECUTION_RECEIPT_V1_SCHEMA,
} from '../scripts/run-hsme-reuse-pipeline-stage.mjs';
import {
  planHsmeReusePipelineAdvancement,
} from '../scripts/plan-hsme-reuse-pipeline-advancement.mjs';

const H=value=>createHash('sha256').update(value).digest('hex');

function authority(){
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

async function writeCanonical(path,value){
  await writeFile(path,canonicalFileBytes(value));
}

function stage({
  id='stage-a',
  inputPath,
  outputPath,
  status='READY',
  argvExtra=[],
}){
  return {
    stageId:id,
    kind:'QUALITY_PARETO',
    status,
    localStatus:status,
    dependencies:[],
    blockedDependencies:[],
    missingInputs:[],
    predecessorMissingInputs:[],
    originIndexSemanticSha256:null,
    expectedExternalPinSha256:null,
    env:{HSME_FOUNDATION_QUALITY_PARETO_COMPILER_CLI:'1'},
    argv:[
      'node',
      'scripts/compile-hsme-foundation-quality-pareto-evidence.mjs',
      '--campaign',inputPath,
      ...argvExtra,
      '--output-dir',join(outputPath,'..'),
    ],
    inputs:[inputPath],
    outputs:[outputPath],
    ...authority(),
  };
}

async function writeManifestPair({
  manifestPath,
  digestPath,
  inputPath,
  inputSha,
  outputPath,
  stageStatus='READY',
  argvExtra=[],
  includeBlockedStage=false,
  includePinStage=false,
}){
  const mainStage=stage({
    inputPath,
    outputPath,
    status:stageStatus,
    argvExtra,
  });
  const stages=[mainStage];
  if(includeBlockedStage){
    stages.push({
      ...stage({
        id:'stage-b',
        inputPath,
        outputPath:join(outputPath,'..','blocked-output.json'),
        status:'BLOCKED_BY_PREDECESSOR',
      }),
      localStatus:'READY',
      dependencies:['stage-a'],
      blockedDependencies:['stage-a'],
      missingInputs:[outputPath],
      predecessorMissingInputs:[{path:outputPath,producerStageId:'stage-a'}],
    });
  }
  if(includePinStage){
    stages.push({
      ...stage({
        id:'stage-pin',
        inputPath,
        outputPath:join(outputPath,'..','pin-output.json'),
        status:'EXTERNAL_PIN_REQUIRED',
      }),
      localStatus:'EXTERNAL_PIN_REQUIRED',
    });
  }

  const manifest={
    schemaVersion:HSME_REUSE_EVIDENCE_PIPELINE_MANIFEST_V1_SCHEMA,
    specFileSha256:H('spec'),
    pipelineState:stageStatus==='READY'?'READY':stageStatus,
    inputs:[{
      path:inputPath,
      state:'PRESENT',
      fileSha256:inputSha,
    }],
    stages,
    plannerExecutesStages:false,
    externalPinsAutoTrusted:false,
    ...authority(),
  };
  if(includeBlockedStage)manifest.pipelineState='BLOCKED_BY_PREDECESSOR';
  if(includePinStage)manifest.pipelineState='BLOCKED_EXTERNAL_PIN_REQUIRED';

  const bytes=canonicalFileBytes(manifest);
  const digest={
    schemaVersion:HSME_REUSE_EVIDENCE_PIPELINE_MANIFEST_DIGEST_V1_SCHEMA,
    specFileSha256:manifest.specFileSha256,
    manifestSha256:domainDigest(
      HSME_REUSE_EVIDENCE_PIPELINE_MANIFEST_DIGEST_DOMAIN,
      manifest,
    ),
    manifestFileSha256:sha256Bytes(bytes),
    pipelineState:manifest.pipelineState,
    externalPinsAutoTrusted:false,
    plannerExecutesStages:false,
    winnerSelectionAllowed:false,
    productionAuthorityGranted:false,
  };
  await writeFile(manifestPath,bytes);
  await writeCanonical(digestPath,digest);
  return {manifest,digest};
}

async function writeReceipt({
  receiptPath,
  inputPath,
  inputSha,
  outputPath,
  outputSha,
  outputBytes,
  argvExtra=[],
  priorManifestTag='prior-manifest',
}){
  const currentStage=stage({
    inputPath,
    outputPath,
    argvExtra,
  });
  const inputs=[{path:inputPath,fileSha256:inputSha}];
  const stageDefinitionSha256=domainDigest(
    HSME_REUSE_PIPELINE_STAGE_DEFINITION_DIGEST_DOMAIN,
    {
      stageId:currentStage.stageId,
      kind:currentStage.kind,
      env:currentStage.env,
      argv:currentStage.argv,
      inputs,
      outputs:currentStage.outputs,
    },
  );
  const argvSha256=domainDigest(
    HSME_REUSE_PIPELINE_STAGE_ARGV_DIGEST_DOMAIN,
    {
      stageId:currentStage.stageId,
      kind:currentStage.kind,
      env:currentStage.env,
      argv:currentStage.argv,
    },
  );
  const payload={
    schemaVersion:HSME_REUSE_PIPELINE_STAGE_EXECUTION_RECEIPT_V1_SCHEMA,
    manifestSha256:H(priorManifestTag),
    manifestFileSha256:H(priorManifestTag+'-file'),
    specFileSha256:H('spec'),
    stageId:currentStage.stageId,
    stageKind:currentStage.kind,
    argvSha256,
    stageDefinitionSha256,
    inputs,
    stdoutSha256:H(''),
    stderrSha256:H(''),
    stdoutBytes:0,
    stderrBytes:0,
    outputs:[{
      path:outputPath,
      fileSha256:outputSha,
      bytes:outputBytes,
    }],
    executionState:'SUCCEEDED',
    outputTrustState:'OBSERVED_NOT_PIN_AUTHORITY',
    externalPinCreated:false,
    semanticEvidenceAuthorityGranted:false,
    ...authority(),
  };
  const receipt={
    ...payload,
    receiptSha256:domainDigest(
      HSME_REUSE_PIPELINE_STAGE_EXECUTION_RECEIPT_DIGEST_DOMAIN,
      payload,
    ),
  };
  await writeCanonical(receiptPath,receipt);
  return receipt;
}

async function fixture({
  manifestInputShaOverride=null,
  stageStatus='READY',
  argvExtra=[],
  includeBlockedStage=false,
  includePinStage=false,
}={}){
  const root=await mkdtemp(join(tmpdir(),'hsme-advance-'));
  const inputPath=join(root,'input.json');
  const outputDir=join(root,'outputs');
  await mkdir(outputDir,{recursive:true});
  const outputPath=join(outputDir,'stage-a-output.json');
  const manifestPath=join(root,'manifest.json');
  const digestPath=join(root,'manifest-digest.json');
  const receiptPath=join(root,'receipt.json');

  const inputBytes=Buffer.from('{"input":"v1"}\n','utf8');
  const outputBytes=Buffer.from('{"output":"v1"}\n','utf8');
  await writeFile(inputPath,inputBytes);
  await writeFile(outputPath,outputBytes);
  const inputSha=sha256Bytes(inputBytes);
  const outputSha=sha256Bytes(outputBytes);

  const pair=await writeManifestPair({
    manifestPath,
    digestPath,
    inputPath,
    inputSha:manifestInputShaOverride??inputSha,
    outputPath,
    stageStatus,
    argvExtra,
    includeBlockedStage,
    includePinStage,
  });
  const receipt=await writeReceipt({
    receiptPath,
    inputPath,
    inputSha,
    outputPath,
    outputSha,
    outputBytes:outputBytes.length,
  });

  return {
    root,inputPath,outputPath,manifestPath,digestPath,receiptPath,
    inputSha,outputSha,pair,receipt,
  };
}

test('prior-manifest receipt is reusable after re-plan when stage-local inputs and definition are unchanged',async()=>{
  const fx=await fixture({includePinStage:true});
  const result=await planHsmeReusePipelineAdvancement({
    manifestPath:fx.manifestPath,
    digestPath:fx.digestPath,
    receiptPaths:[fx.receiptPath],
  });
  const stagePlan=result.plan.stages.find(value=>value.stageId==='stage-a');
  assert.equal(stagePlan.advancementState,'VERIFIED_COMPLETE');
  assert.equal(stagePlan.receiptReusable,true);
  assert.notEqual(stagePlan.receiptManifestSha256,result.plan.manifestSha256);
  assert.deepEqual(result.plan.verifiedCompleteStageIds,['stage-a']);
  assert.deepEqual(result.plan.externalPinRequiredStageIds,['stage-pin']);
  assert.equal(result.plan.advancementState,'WAITING_EXTERNAL_PIN');
});

test('one-byte stage input drift makes prior receipt stale',async()=>{
  const fx=await fixture({manifestInputShaOverride:H('input-v2')});
  const result=await planHsmeReusePipelineAdvancement({
    manifestPath:fx.manifestPath,
    digestPath:fx.digestPath,
    receiptPaths:[fx.receiptPath],
  });
  assert.equal(
    result.plan.stages[0].advancementState,
    'RECEIPT_STALE_INPUT_DRIFT',
  );
  assert.deepEqual(result.plan.staleReceiptStageIds,['stage-a']);
  assert.equal(result.plan.advancementState,'BLOCKED_RECEIPT_DRIFT');
});

test('output byte drift is detected and never silently reused',async()=>{
  const fx=await fixture();
  await writeFile(fx.outputPath,Buffer.from('{"output":"v2"}\n','utf8'));
  const result=await planHsmeReusePipelineAdvancement({
    manifestPath:fx.manifestPath,
    digestPath:fx.digestPath,
    receiptPaths:[fx.receiptPath],
  });
  assert.equal(
    result.plan.stages[0].advancementState,
    'RECEIPT_OUTPUT_DRIFT',
  );
});

test('argv or env definition drift makes receipt stale even with identical inputs',async()=>{
  const fx=await fixture({argvExtra:['--extra','value']});
  const result=await planHsmeReusePipelineAdvancement({
    manifestPath:fx.manifestPath,
    digestPath:fx.digestPath,
    receiptPaths:[fx.receiptPath],
  });
  assert.equal(
    result.plan.stages[0].advancementState,
    'RECEIPT_STAGE_DEFINITION_DRIFT',
  );
});

test('duplicate receipts for one stage fail closed',async()=>{
  const fx=await fixture();
  const duplicate=join(fx.root,'receipt-copy.json');
  await writeFile(duplicate,await readFile(fx.receiptPath));
  await assert.rejects(
    ()=>planHsmeReusePipelineAdvancement({
      manifestPath:fx.manifestPath,
      digestPath:fx.digestPath,
      receiptPaths:[fx.receiptPath,duplicate],
    }),
    error=>error.code==='hsme_reuse_advancement_receipt_duplicate',
  );
});

test('READY stage without receipt becomes RUN_REQUIRED',async()=>{
  const fx=await fixture();
  const result=await planHsmeReusePipelineAdvancement({
    manifestPath:fx.manifestPath,
    digestPath:fx.digestPath,
    receiptPaths:[],
  });
  assert.equal(result.plan.stages[0].advancementState,'RUN_REQUIRED');
  assert.deepEqual(result.plan.runRequiredStageIds,['stage-a']);
  assert.equal(result.plan.advancementState,'RUNNABLE');
});

test('non-READY stage mirrors current manifest external pin gate',async()=>{
  const fx=await fixture({stageStatus:'EXTERNAL_PIN_REQUIRED'});
  const result=await planHsmeReusePipelineAdvancement({
    manifestPath:fx.manifestPath,
    digestPath:fx.digestPath,
    receiptPaths:[],
  });
  assert.equal(
    result.plan.stages[0].advancementState,
    'EXTERNAL_PIN_REQUIRED',
  );
  assert.deepEqual(result.plan.externalPinRequiredStageIds,['stage-a']);
});

test('verified completion plus blocked successor requests manifest regeneration',async()=>{
  const fx=await fixture({includeBlockedStage:true});
  const result=await planHsmeReusePipelineAdvancement({
    manifestPath:fx.manifestPath,
    digestPath:fx.digestPath,
    receiptPaths:[fx.receiptPath],
  });
  assert.equal(result.plan.stages[0].advancementState,'VERIFIED_COMPLETE');
  assert.equal(result.plan.manifestRegenerationRequired,true);
});

test('advancement plan never executes stages or creates trust/selection authority',async()=>{
  const fx=await fixture();
  const result=await planHsmeReusePipelineAdvancement({
    manifestPath:fx.manifestPath,
    digestPath:fx.digestPath,
    receiptPaths:[fx.receiptPath],
  });
  for(const field of [
    'executesStages',
    'createsExternalPins',
    'receiptTrustAuthorityGranted',
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
    assert.equal(result.plan[field],false,field);
  }
});
