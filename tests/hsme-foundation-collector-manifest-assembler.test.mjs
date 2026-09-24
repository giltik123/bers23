import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  mkdir, readFile, rm, writeFile,
} from 'node:fs/promises';
import {join} from 'node:path';
import test from 'node:test';

import {
  ACCEPTED_EXECUTOR_BASE_SHA,
} from '../scripts/hsme-foundation-benchmark-evidence-collector.mjs';
import {
  assembleHsmeFoundationCollectorManifests,
  HSME_FOUNDATION_MANUAL_DISPATCH_LEDGER_V1_SCHEMA,
} from '../scripts/assemble-hsme-foundation-collector-manifests.mjs';
import {
  intakeReceiptDigest,
  normalizeHsmeFoundationProtectedArtifactIntakeReceipt,
} from '../scripts/intake-hsme-foundation-protected-artifacts.mjs';
import {
  canonicalFileBytes,
} from '../scripts/build-hsme-foundation-protected-artifact-provenance.mjs';
import {
  hsmeFoundationFixturePlanDigestV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkFixturePlanV1.ts';

const root=process.cwd();
const cache='.test-cache/hsme-2a-3-3am';
const H=value=>createHash('sha256').update(value).digest('hex');
const stable=value=>JSON.stringify(value,null,2)+'\n';
const hashPort={sha256:async bytes=>H(bytes)};
const caps=['TEXT_TO_IMAGE','IMAGE_EDITING'];

const campaign=JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-campaign.v1.json',
  'utf8',
));
const trust=JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-candidate-trust.v1.json',
  'utf8',
));
const fixturePlan=JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-fixture-plan.v1.json',
  'utf8',
));
const fixturePack=JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-foundation-fixture-pack-evidence.v1.json',
  'utf8',
));
const matrix=JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-dispatch-matrix.v1.json',
  'utf8',
));
const fixturePlanDigest=await hsmeFoundationFixturePlanDigestV1(fixturePlan,hashPort);
const outputDomain='bers:hsme:foundation-benchmark-output-set:v1\0';
const substratePaths=[
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-campaign.v1.json',
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-candidate-trust.v1.json',
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-fixture-plan.v1.json',
  'src/platform/creative/local-ai/hsme/hsme-foundation-fixture-pack-evidence.v1.json',
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-execution-profiles.v1.json',
  'tests/fixtures/hsme-foundation-generated-editing-v1/fixture-manifest.json',
  'tests/fixtures/tiny-sd-d6-quality-corpus-v1.json',
];
const substrateDigests={};
for(const source of substratePaths)substrateDigests[source]=H(await readFile(source));

function lexical(a,b){return a<b?-1:a>b?1:0;}
function candidate(id){return campaign.candidates.find(value=>value.candidateId===id);}
async function writeJson(path,value){
  const bytes=Buffer.from(stable(value),'utf8');
  await writeFile(path,bytes);
  return H(bytes);
}
function outputDigest(outputs){
  const normalized=[...outputs]
    .map(value=>({
      fixtureId:value.fixtureId,
      seed:value.seed,
      blindId:value.blindId,
      imageSha256:value.imageSha256,
    }))
    .sort((a,b)=>
      lexical(a.fixtureId,b.fixtureId)
      ||a.seed-b.seed
      ||lexical(a.blindId,b.blindId)
    );
  return H(Buffer.from(outputDomain+JSON.stringify(normalized),'utf8'));
}

function basePlan(c,capability,disposition){
  return {
    schemaVersion:'BERS_HSME_FOUNDATION_BENCHMARK_EXECUTION_PLAN_V1',
    candidateSha:ACCEPTED_EXECUTOR_BASE_SHA,
    controllerMainSha:ACCEPTED_EXECUTOR_BASE_SHA,
    substrateDigests:{...substrateDigests},
    campaignId:campaign.campaignId,
    campaignDigest:trust.campaignDigest,
    fixturePlanDigest,
    fixtureSetSha256:campaign.fixturePack.fixtureSetSha256,
    outputSetContractSha256:campaign.fixturePack.outputSetContractSha256,
    candidateId:c.candidateId,
    capability,
    disposition,
    immutableRevision:c.immutableRevision,
    modelContentSha256:c.modelContentSha256,
    executionProfileSha256:c.executionProfileSha256,
    rightsEvidenceSha256:c.rightsEvidenceSha256,
    runtimeArtifacts:disposition==='EXECUTE'
      ?[{relativePath:'weights.bin',bytes:3,contentSha256:'a'.repeat(64)}]
      :[],
    ordinaryCiModelExecutionAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    durableModelFleetPromotionAllowed:false,
    trainingOrDistillationAllowed:false,
    winnerSelectionAllowed:false,
  };
}

function terminalRun(plan,status){
  return {
    candidateId:plan.candidateId,
    capability:plan.capability,
    status,
    immutableRevision:plan.immutableRevision,
    modelContentSha256:plan.modelContentSha256,
    executionProfileSha256:plan.executionProfileSha256,
    rightsEvidenceSha256:plan.rightsEvidenceSha256,
    runtimeInventorySha256:'UNKNOWN',
    outputSetSha256:'UNKNOWN',
    reviewPackageSha256:'UNKNOWN',
    failureEvidenceSha256:'UNKNOWN',
    outputs:[],
  };
}

async function writeTerminalWorkspace(workspace,plan,status){
  await mkdir(workspace,{recursive:true});
  await writeJson(join(workspace,'execution-plan.json'),plan);
  await writeJson(join(workspace,'terminal-row.json'),terminalRun(plan,status));
}

function inventory(plan,complete){
  return {
    schemaVersion:'BERS_HSME_FOUNDATION_RUNTIME_INVENTORY_V1',
    candidateId:plan.candidateId,
    immutableRevision:plan.immutableRevision,
    complete,
    artifacts:complete
      ?plan.runtimeArtifacts.map(value=>({
        relativePath:value.relativePath,
        bytes:value.bytes,
        contentSha256:value.contentSha256,
      }))
      :[],
  };
}

async function benchmarkFailedBundle(dir,plan){
  await mkdir(dir,{recursive:true});
  await writeJson(join(dir,'execution-plan.json'),plan);
  const inv=inventory(plan,false);
  const inventorySha=await writeJson(join(dir,'runtime-inventory.json'),inv);
  const failure={
    schemaVersion:'BERS_HSME_FOUNDATION_BENCHMARK_FAILURE_EVIDENCE_V1',
    candidateId:plan.candidateId,
    capability:plan.capability,
    errorType:'SyntheticFailure',
    errorMessage:'synthetic manual dispatch failure',
    tracebackSha256:'b'.repeat(64),
    productionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
  const failureSha=await writeJson(join(dir,'failure-evidence.json'),failure);
  const run={
    candidateId:plan.candidateId,
    capability:plan.capability,
    status:'FAILED',
    immutableRevision:plan.immutableRevision,
    modelContentSha256:plan.modelContentSha256,
    executionProfileSha256:plan.executionProfileSha256,
    rightsEvidenceSha256:plan.rightsEvidenceSha256,
    runtimeInventorySha256:inventorySha,
    outputSetSha256:'UNKNOWN',
    reviewPackageSha256:'UNKNOWN',
    failureEvidenceSha256:failureSha,
    outputs:[],
  };
  await writeJson(join(dir,'candidate-run.json'),run);
  return run;
}

function fixtureIds(capability){
  return fixturePlan.assets
    .filter(value=>value.capability===capability)
    .map(value=>value.fixtureId)
    .sort(lexical);
}

async function benchmarkCompleteBundle(dir,plan){
  await mkdir(join(dir,'blind-review'),{recursive:true});
  await writeJson(join(dir,'execution-plan.json'),plan);
  const inv=inventory(plan,true);
  const inventorySha=await writeJson(join(dir,'runtime-inventory.json'),inv);
  const outputs=[];
  const reviewOutputs=[];
  for(const fixtureId of fixtureIds(plan.capability)){
    for(const seed of fixturePack.sources.outputSetContract.requiredSeeds){
      const blindId='blind_'+H(
        plan.candidateId+'\0'+plan.capability+'\0'+fixtureId+'\0'+seed,
      ).slice(0,24);
      const bytes=Buffer.from(
        'synthetic-image:'+plan.candidateId+':'+plan.capability+':'+fixtureId+':'+seed,
      );
      const imageSha256=H(bytes);
      await writeFile(join(dir,'blind-review',blindId+'.png'),bytes);
      outputs.push({fixtureId,seed,blindId,imageSha256});
      reviewOutputs.push({
        fixtureId,seed,blindId,imageSha256,relativePath:blindId+'.png',
      });
    }
  }
  outputs.sort((a,b)=>
    lexical(a.fixtureId,b.fixtureId)||a.seed-b.seed||lexical(a.blindId,b.blindId)
  );
  reviewOutputs.sort((a,b)=>
    lexical(a.fixtureId,b.fixtureId)||a.seed-b.seed||lexical(a.blindId,b.blindId)
  );
  const review={
    schemaVersion:'BERS_HSME_FOUNDATION_BLINDED_REVIEW_PACKAGE_V1',
    campaignId:campaign.campaignId,
    capability:plan.capability,
    outputs:reviewOutputs,
    candidateIdentityIncluded:false,
    latencyIncluded:false,
    sizeIncluded:false,
    costIncluded:false,
  };
  const reviewSha=await writeJson(join(dir,'review-package.json'),review);
  const run={
    candidateId:plan.candidateId,
    capability:plan.capability,
    status:'COMPLETE',
    immutableRevision:plan.immutableRevision,
    modelContentSha256:plan.modelContentSha256,
    executionProfileSha256:plan.executionProfileSha256,
    rightsEvidenceSha256:plan.rightsEvidenceSha256,
    runtimeInventorySha256:inventorySha,
    outputSetSha256:outputDigest(outputs),
    reviewPackageSha256:reviewSha,
    failureEvidenceSha256:'UNKNOWN',
    outputs,
  };
  await writeJson(join(dir,'candidate-run.json'),run);
  return {run,inventory:inv};
}

function hardware(){
  return {
    schemaVersion:'BERS_HSME_FOUNDATION_RESOURCE_HARDWARE_PROFILE_V1',
    deviceIndex:0,
    gpuName:'Synthetic GPU',
    computeCapabilityMajor:8,
    computeCapabilityMinor:0,
    totalMemoryBytes:12_000_000_000,
    nvidiaDriverVersion:'550.54.15',
    torchVersion:'2.0.1+cu118',
    torchCudaVersion:'11.8',
    workingMemoryKind:'CUDA_PEAK_RESERVED_BYTES',
  };
}

function method(){
  return {
    schemaVersion:'BERS_HSME_FOUNDATION_RESOURCE_MEASUREMENT_METHOD_V1',
    clock:'PYTHON_TIME_PERF_COUNTER_NS',
    cudaSynchronization:'BEFORE_AND_AFTER_TIMED_INFERENCE',
    coldLatencyDefinition:'PIPELINE_LOAD_PLUS_FIRST_FROZEN_INFERENCE',
    warmLatencyDefinition:'FROZEN_INFERENCE_AFTER_PIPELINE_LOAD',
    warmAggregation:'MEDIAN_EVEN_ARITHMETIC_MEAN_HALF_UP',
    nanosecondsToMicroseconds:'POSITIVE_CEILING',
    workingMemoryKind:'CUDA_PEAK_RESERVED_BYTES',
    workingMemoryMetric:'TORCH_CUDA_MAX_MEMORY_RESERVED',
    artifactAcquisitionIncludedInLatency:false,
    pngEncodingIncludedInLatency:false,
    reviewPackageReceivesResourceMetadata:false,
  };
}

async function resourceBundle(dir,plan,run,inv){
  await mkdir(dir,{recursive:true});
  await writeJson(join(dir,'execution-plan.json'),plan);
  await writeJson(join(dir,'candidate-run.json'),run);
  const inventorySha=await writeJson(join(dir,'runtime-inventory.json'),inv);
  assert.equal(inventorySha,run.runtimeInventorySha256);
  const hardwareValue=hardware();
  const methodValue=method();
  const hardwareSha=await writeJson(
    join(dir,'resource-hardware-profile.json'),
    hardwareValue,
  );
  const methodSha=await writeJson(
    join(dir,'resource-measurement-method.json'),
    methodValue,
  );
  const costEvidenceSha=H('cost|'+run.candidateId+'|'+run.capability);
  const evidence={
    schemaVersion:'BERS_HSME_FOUNDATION_RESOURCE_MEASUREMENT_EVIDENCE_V1',
    candidateId:run.candidateId,
    capability:run.capability,
    runtimeInventorySha256:inventorySha,
    hardwareProfileSha256:hardwareSha,
    measurementMethodSha256:methodSha,
    workingMemoryKind:'CUDA_PEAK_RESERVED_BYTES',
    peakWorkingMemoryBytes:1_000_000_000,
    coldEndToEndLatencyMicros:5_000_000,
    warmEndToEndLatencyMicros:4_000_000,
    warmLatencySamplesMicros:[3_000_000,4_000_000,5_000_000],
    acceptedOutputCostMicrousd:0,
    costKind:'PROVEN_UNMETERED_LOCAL',
    costEvidenceSha256:costEvidenceSha,
    productionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
  const evidenceSha=await writeJson(
    join(dir,'resource-measurement-evidence.json'),
    evidence,
  );
  const fragment={
    schemaVersion:'BERS_HSME_FOUNDATION_RESOURCE_MEASUREMENT_FRAGMENT_V1',
    campaignId:campaign.campaignId,
    record:{
      candidateId:run.candidateId,
      capability:run.capability,
      immutableRevision:run.immutableRevision,
      modelContentSha256:run.modelContentSha256,
      executionProfileSha256:run.executionProfileSha256,
      runtimeInventory:inv,
      hardwareProfileSha256:hardwareSha,
      measurementMethodSha256:methodSha,
      workingMemoryKind:'CUDA_PEAK_RESERVED_BYTES',
      peakWorkingMemoryBytes:evidence.peakWorkingMemoryBytes,
      coldEndToEndLatencyMicros:evidence.coldEndToEndLatencyMicros,
      warmEndToEndLatencyMicros:evidence.warmEndToEndLatencyMicros,
      acceptedOutputCostMicrousd:0,
      costKind:'PROVEN_UNMETERED_LOCAL',
      costEvidenceSha256:costEvidenceSha,
      measurementEvidenceSha256:evidenceSha,
    },
    productionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
  await writeJson(join(dir,'resource-measurement.json'),fragment);
}

async function copiedRecord(role,rootPath,logicalPath,destinationPath){
  const bytes=await readFile(join(rootPath,...destinationPath.split('/')));
  return {
    role,
    logicalPath,
    destinationPath,
    fileSha256:H(bytes),
    bytes:bytes.length,
  };
}

async function writeIntakeReceipt(workspace,plan,workflowRunId,runStatus){
  const blindRoot=workspace;
  const copied=[];
  for(const name of ['execution-plan.json','candidate-run.json','runtime-inventory.json']){
    copied.push(await copiedRecord(
      'BLIND',blindRoot,name,'benchmark-bundle/'+name,
    ));
  }
  if(runStatus==='COMPLETE'){
    copied.push(await copiedRecord(
      'BLIND',blindRoot,'review-package.json','benchmark-bundle/review-package.json',
    ));
    const review=JSON.parse(await readFile(
      join(workspace,'benchmark-bundle','review-package.json'),
      'utf8',
    ));
    for(const item of review.outputs){
      copied.push(await copiedRecord(
        'BLIND',
        blindRoot,
        'review/'+item.relativePath,
        'benchmark-bundle/blind-review/'+item.relativePath,
      ));
    }
    for(const name of [
      'execution-plan.json','candidate-run.json','runtime-inventory.json',
      'resource-measurement.json','resource-hardware-profile.json',
      'resource-measurement-method.json','resource-measurement-evidence.json',
    ]){
      copied.push(await copiedRecord(
        'RESOURCE',blindRoot,name,'resource-bundle/'+name,
      ));
    }
  }else{
    copied.push(await copiedRecord(
      'BLIND',blindRoot,'failure-evidence.json','benchmark-bundle/failure-evidence.json',
    ));
  }

  const provenanceBytes=Buffer.from(
    JSON.stringify({
      schemaVersion:'SYNTHETIC_PINNED_PROVENANCE_TEST_ONLY',
      workflowRunId,
      candidateId:plan.candidateId,
      capability:plan.capability,
    })+'\n',
    'utf8',
  );
  await writeFile(
    join(workspace,'protected-artifact-provenance.json'),
    provenanceBytes,
  );
  const receipt=normalizeHsmeFoundationProtectedArtifactIntakeReceipt({
    schemaVersion:'BERS_HSME_FOUNDATION_PROTECTED_ARTIFACT_INTAKE_V1',
    provenanceSha256:H('semantic-provenance|'+workflowRunId),
    provenanceFileSha256:H(provenanceBytes),
    repository:'giltik123/bers23',
    workflowPath:'.github/workflows/hsme-2a-3-3b-protected-foundation-executor.yml',
    workflowRunId:String(workflowRunId),
    workflowRunAttempt:'1',
    candidateCommitSha:ACCEPTED_EXECUTOR_BASE_SHA,
    controllerCommitSha:ACCEPTED_EXECUTOR_BASE_SHA,
    campaignId:campaign.campaignId,
    candidateId:plan.candidateId,
    capability:plan.capability,
    runStatus,
    provenancePinVerified:true,
    canonicalBenchmarkVerificationPassed:true,
    canonicalResourceVerificationPassed:runStatus==='COMPLETE',
    benchmarkCollectorBundlePath:'benchmark-bundle',
    resourceCollectorBundlePath:runStatus==='COMPLETE'?'resource-bundle':null,
    copiedFiles:copied,
    qualityScoringAllowed:false,
    candidateQualificationAllowed:false,
    candidateRejectionAllowed:false,
    trainingOrDistillationAllowed:false,
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
  await writeFile(
    join(workspace,'protected-artifact-intake-receipt.json'),
    canonicalFileBytes(receipt),
  );
  return {receipt,receiptSha256:intakeReceiptDigest(receipt)};
}

async function fixture(name='mixed'){
  const base=join(cache,name);
  await rm(base,{recursive:true,force:true});
  await mkdir(base,{recursive:true});
  const rows=[];
  let workflowRunId=50_000;
  let completeAssigned=false;

  for(const matrixRow of matrix.rows){
    const c=candidate(matrixRow.candidateId);
    const plan=basePlan(
      c,
      matrixRow.capability,
      matrixRow.currentExpectedDisposition,
    );
    const workspaceRel=
      cache+'/'+name+'/'+matrixRow.candidateId+'--'+matrixRow.capability;
    const workspace=join(root,workspaceRel);
    const row={
      candidateId:matrixRow.candidateId,
      capability:matrixRow.capability,
      workflowRunId:workflowRunId++,
      workspacePath:workspaceRel,
      resourceArtifactId:null,
    };

    if(matrixRow.currentExpectedDisposition==='EXECUTE'){
      row.evidenceKind='PROTECTED_INTAKE';
      await mkdir(workspace,{recursive:true});
      const benchmarkDir=join(workspace,'benchmark-bundle');
      let runStatus='FAILED';
      let complete=null;
      if(!completeAssigned&&matrixRow.candidateId==='tiny-sd-control-v1'){
        completeAssigned=true;
        runStatus='COMPLETE';
        complete=await benchmarkCompleteBundle(benchmarkDir,plan);
        await resourceBundle(
          join(workspace,'resource-bundle'),
          plan,
          complete.run,
          complete.inventory,
        );
        row.resourceArtifactId=90_000+row.workflowRunId;
      }else{
        await benchmarkFailedBundle(benchmarkDir,plan);
      }
      const pinned=await writeIntakeReceipt(
        workspace,
        plan,
        row.workflowRunId,
        runStatus,
      );
      row.intakeReceiptSha256=pinned.receiptSha256;
    }else{
      row.evidenceKind='TERMINAL_PLAN';
      row.intakeReceiptSha256=null;
      const status=matrixRow.currentExpectedDisposition==='NOT_APPLICABLE'
        ?'NOT_APPLICABLE'
        :'BLOCKED_PARITY_PENDING';
      await writeTerminalWorkspace(workspace,plan,status);
    }
    rows.push(row);
  }
  assert.equal(rows.length,12);
  assert.equal(completeAssigned,true);

  const ledger={
    schemaVersion:HSME_FOUNDATION_MANUAL_DISPATCH_LEDGER_V1_SCHEMA,
    acceptedExecutorBaseSha:ACCEPTED_EXECUTOR_BASE_SHA,
    controllerCommitSha:ACCEPTED_EXECUTOR_BASE_SHA,
    campaignId:campaign.campaignId,
    rows,
    qualityScoringAllowed:false,
    candidateQualificationAllowed:false,
    candidateRejectionAllowed:false,
    trainingOrDistillationAllowed:false,
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
  return {base,ledger,cleanup:()=>rm(base,{recursive:true,force:true})};
}

test.after(async()=>{await rm(cache,{recursive:true,force:true});});

test('full 12-row verified ledger produces collector-accepted benchmark and resource manifests',async()=>{
  const fx=await fixture('full');
  try{
    const result=await assembleHsmeFoundationCollectorManifests({
      repoRoot:root,
      rawLedger:fx.ledger,
      ledgerFileSha256:H(stable(fx.ledger)),
    });
    assert.equal(result.benchmarkManifest.rows.length,12);
    assert.equal(result.benchmarkCollection.evidence.runs.length,12);
    assert.equal(result.benchmarkCollection.collectionProof.completeRunCount,1);
    assert.equal(result.benchmarkCollection.collectionProof.failedRunCount,6);
    assert.equal(result.benchmarkCollection.collectionProof.blockedRunCount,1);
    assert.equal(result.benchmarkCollection.collectionProof.notApplicableRunCount,4);
    assert.equal(result.resourceManifest.rows.length,1);
    assert.equal(
      result.resourceCollection.report.state,
      'RESOURCE_EVIDENCE_COMPLETE',
    );
    assert.ok(result.resourceCollection.evidence);
    assert.ok(result.resourceCollection.proof);
    assert.equal(result.packageReceipt.winnerSelectionAllowed,false);
    assert.equal(result.packageReceipt.qualityScoringAllowed,false);
    assert.match(result.packageReceipt.runEvidenceSha256,/^[0-9a-f]{64}$/);
    assert.match(result.packageReceipt.resourceEvidenceSha256,/^[0-9a-f]{64}$/);
    assert.match(result.packageReceipt.packageReceiptSha256,/^[0-9a-f]{64}$/);
  }finally{await fx.cleanup();}
});

test('same exact ledger and workspace produce byte-identical collection package outputs',async()=>{
  const fx=await fixture('deterministic');
  try{
    const args={
      repoRoot:root,
      rawLedger:fx.ledger,
      ledgerFileSha256:H(stable(fx.ledger)),
    };
    const first=await assembleHsmeFoundationCollectorManifests(args);
    const second=await assembleHsmeFoundationCollectorManifests(args);
    for(const key of [
      'benchmarkManifest','runEvidence','runCollectionProof','resourceManifest',
      'resourceReport','resourceEvidence','resourceProof','packageReceipt',
    ]){
      assert.deepEqual(first.files[key],second.files[key],key);
    }
  }finally{await fx.cleanup();}
});

test('intake receipt semantic pin drift fails before benchmark collection',async()=>{
  const fx=await fixture('receipt-pin');
  try{
    const row=fx.ledger.rows.find(value=>value.evidenceKind==='PROTECTED_INTAKE');
    row.intakeReceiptSha256=H('forged-intake-receipt-pin');
    await assert.rejects(
      ()=>assembleHsmeFoundationCollectorManifests({
        repoRoot:root,
        rawLedger:fx.ledger,
        ledgerFileSha256:H(stable(fx.ledger)),
      }),
      error=>error?.code==='hsme_collection_assembler_receipt_pin_mismatch',
    );
  }finally{await fx.cleanup();}
});

test('one-byte post-intake bundle drift fails against canonical receipt',async()=>{
  const fx=await fixture('bundle-drift');
  try{
    const row=fx.ledger.rows.find(value=>
      value.evidenceKind==='PROTECTED_INTAKE'
      &&value.resourceArtifactId===null
    );
    await writeFile(
      join(root,row.workspacePath,'benchmark-bundle','candidate-run.json'),
      '{}\n',
    );
    await assert.rejects(
      ()=>assembleHsmeFoundationCollectorManifests({
        repoRoot:root,
        rawLedger:fx.ledger,
        ledgerFileSha256:H(stable(fx.ledger)),
      }),
      error=>error?.code==='hsme_collection_assembler_receipt_file_drift',
    );
  }finally{await fx.cleanup();}
});

test('terminal disposition drift fails before canonical benchmark collector',async()=>{
  const fx=await fixture('terminal-drift');
  try{
    const row=fx.ledger.rows.find(value=>value.evidenceKind==='TERMINAL_PLAN');
    const planPath=join(root,row.workspacePath,'execution-plan.json');
    const plan=JSON.parse(await readFile(planPath,'utf8'));
    plan.disposition='EXECUTE';
    await writeJson(planPath,plan);
    await assert.rejects(
      ()=>assembleHsmeFoundationCollectorManifests({
        repoRoot:root,
        rawLedger:fx.ledger,
        ledgerFileSha256:H(stable(fx.ledger)),
      }),
      error=>error?.code==='hsme_collection_assembler_terminal_plan_identity',
    );
  }finally{await fx.cleanup();}
});

test('canonical COMPLETE row cannot omit resource artifact metadata',async()=>{
  const fx=await fixture('missing-resource-id');
  try{
    const row=fx.ledger.rows.find(value=>value.resourceArtifactId!==null);
    row.resourceArtifactId=null;
    await assert.rejects(
      ()=>assembleHsmeFoundationCollectorManifests({
        repoRoot:root,
        rawLedger:fx.ledger,
        ledgerFileSha256:H(stable(fx.ledger)),
      }),
      error=>error?.code==='hsme_collection_assembler_resource_artifact_missing',
    );
  }finally{await fx.cleanup();}
});

test('ledger cannot mix controller commits across frozen manual campaign',async()=>{
  const fx=await fixture('controller-drift');
  try{
    fx.ledger.controllerCommitSha='f'.repeat(40);
    await assert.rejects(
      ()=>assembleHsmeFoundationCollectorManifests({
        repoRoot:root,
        rawLedger:fx.ledger,
        ledgerFileSha256:H(stable(fx.ledger)),
      }),
      error=>error?.code==='hsme_collection_assembler_receipt_identity'
        ||error?.code==='hsme_collection_assembler_terminal_plan_identity',
    );
  }finally{await fx.cleanup();}
});
