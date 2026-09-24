import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile,
} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

import {
  buildHsmeFoundationProtectedArtifactProvenance,
  canonicalFileBytes,
  provenanceDigest,
} from '../scripts/build-hsme-foundation-protected-artifact-provenance.mjs';
import {
  intakeHsmeFoundationProtectedArtifacts,
} from '../scripts/intake-hsme-foundation-protected-artifacts.mjs';
import {
  outputDigest,
} from '../scripts/hsme-foundation-benchmark-executor-verify.mjs';

const H=value=>createHash('sha256').update(value).digest('hex');

async function writeJson(path,value){
  const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n','utf8');
  await writeFile(path,bytes);
  return H(bytes);
}

async function copyFileBytes(source,destination){
  await writeFile(destination,await readFile(source));
}

function resourceHardware(){
  return {
    schemaVersion:'BERS_HSME_FOUNDATION_RESOURCE_HARDWARE_PROFILE_V1',
    deviceIndex:0,
    gpuName:'Synthetic Protected GPU',
    computeCapabilityMajor:8,
    computeCapabilityMinor:0,
    totalMemoryBytes:12_000_000_000,
    nvidiaDriverVersion:'550.54.15',
    torchVersion:'2.0.1+cu118',
    torchCudaVersion:'11.8',
    workingMemoryKind:'CUDA_PEAK_RESERVED_BYTES',
  };
}

function resourceMethod(){
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

async function makeFixture(status='COMPLETE'){
  const root=await mkdtemp(join(tmpdir(),'hsme-protected-intake-'));
  const evidence=join(root,'evidence');
  const reviewDir=join(root,'review');
  const blindArtifact=join(root,'blind-artifact');
  const resourceArtifact=join(root,'resource-artifact');
  await mkdir(evidence);
  await mkdir(reviewDir);
  await mkdir(blindArtifact);
  if(status==='COMPLETE')await mkdir(resourceArtifact);

  const candidateId='tiny-sd-control-v1';
  const capability='TEXT_TO_IMAGE';
  const immutableRevision='a'.repeat(40);
  const modelContentSha256='1'.repeat(64);
  const executionProfileSha256='2'.repeat(64);
  const rightsEvidenceSha256='3'.repeat(64);
  const runtimeArtifact={
    sourceRoot:'hf://synthetic/tiny-sd',
    immutableRevision,
    relativePath:'model/file.bin',
    role:'DENOISER_BACKBONE',
    bytes:3,
    contentSha256:H('abc'),
  };

  const plan={
    schemaVersion:'BERS_HSME_FOUNDATION_BENCHMARK_EXECUTION_PLAN_V1',
    candidateSha:'a'.repeat(40),
    controllerMainSha:'b'.repeat(40),
    campaignId:'foundation-quality-v1',
    campaignDigest:'9'.repeat(64),
    fixturePlanDigest:'8'.repeat(64),
    fixtureSetSha256:'7'.repeat(64),
    outputSetContractSha256:'6'.repeat(64),
    candidateId,
    capability,
    disposition:'EXECUTE',
    immutableRevision,
    modelContentSha256,
    executionProfileSha256,
    rightsEvidenceSha256,
    runtimeLockId:'synthetic-lock-v1',
    runtimeLock:{python:'3.10.13',packages:{}},
    sourceSpec:{},
    executionProfile:{},
    runtimeArtifacts:[runtimeArtifact],
    fixtures:[{
      fixtureId:'fixture-001',
      capability,
      prompt:'synthetic prompt',
      instruction:null,
      references:[],
      promptOrInstructionSha256:H('synthetic prompt'),
    }],
    requiredSeeds:[1],
    sanaParity:null,
    substrateDigests:{},
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

  const inventory={
    schemaVersion:'BERS_HSME_FOUNDATION_RUNTIME_INVENTORY_V1',
    candidateId,
    immutableRevision,
    complete:status==='COMPLETE',
    artifacts:status==='COMPLETE'
      ?[{
        relativePath:runtimeArtifact.relativePath,
        bytes:runtimeArtifact.bytes,
        contentSha256:runtimeArtifact.contentSha256,
      }]
      :[],
  };

  const paths={
    root,evidence,reviewDir,blindArtifact,resourceArtifact,
    plan:join(evidence,'execution-plan.json'),
    run:join(evidence,'candidate-run.json'),
    inventory:join(evidence,'runtime-inventory.json'),
    review:join(evidence,'review-package.json'),
    failure:join(evidence,'failure-evidence.json'),
    resource:join(evidence,'resource-measurement.json'),
    hardware:join(evidence,'resource-hardware-profile.json'),
    method:join(evidence,'resource-measurement-method.json'),
    measurementEvidence:join(evidence,'resource-measurement-evidence.json'),
  };

  await writeJson(paths.plan,plan);
  const inventorySha=await writeJson(paths.inventory,inventory);

  let run;
  if(status==='COMPLETE'){
    const blindId='blind_'+'c'.repeat(24);
    const imageName=blindId+'.png';
    const imagePath=join(reviewDir,imageName);
    const imageBytes=Buffer.from('synthetic-png-payload','utf8');
    await writeFile(imagePath,imageBytes);
    const imageSha256=H(imageBytes);
    const outputs=[{
      fixtureId:'fixture-001',
      seed:1,
      blindId,
      imageSha256,
    }];
    const review={
      schemaVersion:'BERS_HSME_FOUNDATION_BLINDED_REVIEW_PACKAGE_V1',
      campaignId:plan.campaignId,
      capability,
      outputs:[{
        fixtureId:'fixture-001',
        seed:1,
        blindId,
        imageSha256,
        relativePath:imageName,
      }],
      candidateIdentityIncluded:false,
      latencyIncluded:false,
      sizeIncluded:false,
      costIncluded:false,
    };
    const reviewSha=await writeJson(paths.review,review);
    run={
      candidateId,
      capability,
      status:'COMPLETE',
      immutableRevision,
      modelContentSha256,
      executionProfileSha256,
      rightsEvidenceSha256,
      runtimeInventorySha256:inventorySha,
      outputSetSha256:outputDigest(outputs),
      reviewPackageSha256:reviewSha,
      failureEvidenceSha256:'UNKNOWN',
      outputs,
    };
    await writeJson(paths.run,run);

    const hardware=resourceHardware();
    const method=resourceMethod();
    const hardwareSha=await writeJson(paths.hardware,hardware);
    const methodSha=await writeJson(paths.method,method);
    const measurementEvidence={
      schemaVersion:'BERS_HSME_FOUNDATION_RESOURCE_MEASUREMENT_EVIDENCE_V1',
      candidateId,
      capability,
      runtimeInventorySha256:inventorySha,
      hardwareProfileSha256:hardwareSha,
      measurementMethodSha256:methodSha,
      workingMemoryKind:'CUDA_PEAK_RESERVED_BYTES',
      peakWorkingMemoryBytes:2_000_000,
      coldEndToEndLatencyMicros:5_000,
      warmEndToEndLatencyMicros:4_000,
      warmLatencySamplesMicros:[3_000,4_000,5_000],
      acceptedOutputCostMicrousd:0,
      costKind:'PROVEN_UNMETERED_LOCAL',
      costEvidenceSha256:'4'.repeat(64),
      productionAuthorityGranted:false,
      winnerSelectionAllowed:false,
    };
    const measurementEvidenceSha=await writeJson(
      paths.measurementEvidence,
      measurementEvidence,
    );
    const fragment={
      schemaVersion:'BERS_HSME_FOUNDATION_RESOURCE_MEASUREMENT_FRAGMENT_V1',
      campaignId:plan.campaignId,
      record:{
        candidateId,
        capability,
        immutableRevision,
        modelContentSha256,
        executionProfileSha256,
        runtimeInventory:inventory,
        hardwareProfileSha256:hardwareSha,
        measurementMethodSha256:methodSha,
        workingMemoryKind:'CUDA_PEAK_RESERVED_BYTES',
        peakWorkingMemoryBytes:measurementEvidence.peakWorkingMemoryBytes,
        coldEndToEndLatencyMicros:measurementEvidence.coldEndToEndLatencyMicros,
        warmEndToEndLatencyMicros:measurementEvidence.warmEndToEndLatencyMicros,
        acceptedOutputCostMicrousd:measurementEvidence.acceptedOutputCostMicrousd,
        costKind:measurementEvidence.costKind,
        costEvidenceSha256:measurementEvidence.costEvidenceSha256,
        measurementEvidenceSha256,
      },
      productionAuthorityGranted:false,
      winnerSelectionAllowed:false,
    };
    await writeJson(paths.resource,fragment);
  }else{
    const failure={
      schemaVersion:'BERS_HSME_FOUNDATION_BENCHMARK_FAILURE_EVIDENCE_V1',
      candidateId,
      capability,
      reasonCode:'SYNTHETIC_FAILURE',
      productionAuthorityGranted:false,
      winnerSelectionAllowed:false,
    };
    const failureSha=await writeJson(paths.failure,failure);
    run={
      candidateId,
      capability,
      status:'FAILED',
      immutableRevision,
      modelContentSha256,
      executionProfileSha256,
      rightsEvidenceSha256,
      runtimeInventorySha256:inventorySha,
      outputSetSha256:'UNKNOWN',
      reviewPackageSha256:'UNKNOWN',
      failureEvidenceSha256:failureSha,
      outputs:[],
    };
    await writeJson(paths.run,run);
  }

  const provenance=await buildHsmeFoundationProtectedArtifactProvenance({
    planPath:paths.plan,
    runPath:paths.run,
    inventoryPath:paths.inventory,
    reviewPath:status==='COMPLETE'?paths.review:null,
    reviewDir:status==='COMPLETE'?reviewDir:null,
    failurePath:status==='FAILED'?paths.failure:null,
    resourcePath:status==='COMPLETE'?paths.resource:null,
    hardwareProfilePath:status==='COMPLETE'?paths.hardware:null,
    measurementMethodPath:status==='COMPLETE'?paths.method:null,
    measurementEvidencePath:status==='COMPLETE'?paths.measurementEvidence:null,
    workflowRunId:'12345',
    workflowRunAttempt:'1',
    repository:'giltik123/bers23',
  });

  for(const source of [paths.plan,paths.run,paths.inventory]){
    await copyFileBytes(source,join(blindArtifact,source.split('/').at(-1)));
  }
  if(status==='COMPLETE'){
    await copyFileBytes(paths.review,join(blindArtifact,'review-package.json'));
    const review=JSON.parse(await readFile(paths.review,'utf8'));
    for(const output of review.outputs){
      await copyFileBytes(
        join(reviewDir,output.relativePath),
        join(blindArtifact,output.relativePath),
      );
    }
  }else{
    await copyFileBytes(paths.failure,join(blindArtifact,'failure-evidence.json'));
  }
  await writeFile(
    join(blindArtifact,'protected-artifact-provenance.json'),
    provenance.bytes,
  );

  if(status==='COMPLETE'){
    for(const source of [paths.plan,paths.run,paths.inventory]){
      await copyFileBytes(source,join(resourceArtifact,source.split('/').at(-1)));
    }
    for(const [source,name] of [
      [paths.resource,'resource-measurement.json'],
      [paths.hardware,'resource-hardware-profile.json'],
      [paths.method,'resource-measurement-method.json'],
      [paths.measurementEvidence,'resource-measurement-evidence.json'],
    ]){
      await copyFileBytes(source,join(resourceArtifact,name));
    }
    await writeFile(
      join(resourceArtifact,'protected-artifact-provenance.json'),
      provenance.bytes,
    );
  }

  return {
    status,paths,provenance,
    output:join(root,'intake'),
    output2:join(root,'intake-2'),
    cleanup:()=>rm(root,{recursive:true,force:true}),
  };
}

test('COMPLETE protected artifacts reverify and intake under an external provenance pin',async()=>{
  const fx=await makeFixture('COMPLETE');
  try{
    const result=await intakeHsmeFoundationProtectedArtifacts({
      blindRoot:fx.paths.blindArtifact,
      resourceRoot:fx.paths.resourceArtifact,
      expectedProvenanceSha256:fx.provenance.manifestSha256,
      outputDir:fx.output,
    });
    assert.equal(result.receipt.runStatus,'COMPLETE');
    assert.equal(result.receipt.provenancePinVerified,true);
    assert.equal(result.receipt.canonicalBenchmarkVerificationPassed,true);
    assert.equal(result.receipt.canonicalResourceVerificationPassed,true);
    assert.equal(result.receipt.benchmarkCollectorBundlePath,'benchmark-bundle');
    assert.equal(result.receipt.resourceCollectorBundlePath,'resource-bundle');
    assert.equal(result.receipt.productionAuthorityGranted,false);
    assert.match(result.receiptSha256,/^[0-9a-f]{64}$/);
    await readFile(join(fx.output,'benchmark-bundle','candidate-run.json'));
    await readFile(join(fx.output,'benchmark-bundle','review-package.json'));
    const review=JSON.parse(await readFile(fx.paths.review,'utf8'));
    await readFile(
      join(fx.output,'benchmark-bundle','blind-review',review.outputs[0].relativePath),
    );
    const resourceRoster=(await readdir(join(fx.output,'resource-bundle'))).sort();
    assert.deepEqual(resourceRoster,[
      'candidate-run.json',
      'execution-plan.json',
      'resource-hardware-profile.json',
      'resource-measurement-evidence.json',
      'resource-measurement-method.json',
      'resource-measurement.json',
      'runtime-inventory.json',
    ]);
    assert.deepEqual(
      await readFile(join(fx.output,'protected-artifact-provenance.json')),
      fx.provenance.bytes,
    );
  }finally{await fx.cleanup();}
});

test('FAILED protected artifact reverifies without resource evidence',async()=>{
  const fx=await makeFixture('FAILED');
  try{
    const result=await intakeHsmeFoundationProtectedArtifacts({
      blindRoot:fx.paths.blindArtifact,
      expectedProvenanceSha256:fx.provenance.manifestSha256,
      outputDir:fx.output,
    });
    assert.equal(result.receipt.runStatus,'FAILED');
    assert.equal(result.receipt.canonicalBenchmarkVerificationPassed,true);
    assert.equal(result.receipt.canonicalResourceVerificationPassed,false);
    assert.equal(result.receipt.benchmarkCollectorBundlePath,'benchmark-bundle');
    assert.equal(result.receipt.resourceCollectorBundlePath,null);
    await readFile(join(fx.output,'benchmark-bundle','failure-evidence.json'));
    await assert.rejects(readdir(join(fx.output,'resource-bundle')));
  }finally{await fx.cleanup();}
});

test('same exact protected evidence yields byte-identical provenance and intake receipt',async()=>{
  const fx=await makeFixture('COMPLETE');
  try{
    const first=await intakeHsmeFoundationProtectedArtifacts({
      blindRoot:fx.paths.blindArtifact,
      resourceRoot:fx.paths.resourceArtifact,
      expectedProvenanceSha256:fx.provenance.manifestSha256,
      outputDir:fx.output,
    });
    const second=await intakeHsmeFoundationProtectedArtifacts({
      blindRoot:fx.paths.blindArtifact,
      resourceRoot:fx.paths.resourceArtifact,
      expectedProvenanceSha256:fx.provenance.manifestSha256,
      outputDir:fx.output2,
    });
    assert.deepEqual(first.receipt,second.receipt);
    assert.equal(first.receiptSha256,second.receiptSha256);
    assert.deepEqual(
      await readFile(join(fx.output,'protected-artifact-intake-receipt.json')),
      await readFile(join(fx.output2,'protected-artifact-intake-receipt.json')),
    );
    assert.equal(
      provenanceDigest(fx.provenance.manifest),
      fx.provenance.manifestSha256,
    );
    assert.deepEqual(
      canonicalFileBytes(fx.provenance.manifest),
      fx.provenance.bytes,
    );
  }finally{await fx.cleanup();}
});

test('one-byte blinded image drift fails before destination creation',async()=>{
  const fx=await makeFixture('COMPLETE');
  try{
    const review=JSON.parse(await readFile(fx.paths.review,'utf8'));
    await writeFile(
      join(fx.paths.blindArtifact,review.outputs[0].relativePath),
      Buffer.from('one-byte-drift','utf8'),
    );
    await assert.rejects(
      ()=>intakeHsmeFoundationProtectedArtifacts({
        blindRoot:fx.paths.blindArtifact,
        resourceRoot:fx.paths.resourceArtifact,
        expectedProvenanceSha256:fx.provenance.manifestSha256,
        outputDir:fx.output,
      }),
      error=>error?.code==='hsme_protected_intake_file_digest_mismatch',
    );
  }finally{await fx.cleanup();}
});

test('wrong external provenance pin fails before copying evidence',async()=>{
  const fx=await makeFixture('COMPLETE');
  try{
    await assert.rejects(
      ()=>intakeHsmeFoundationProtectedArtifacts({
        blindRoot:fx.paths.blindArtifact,
        resourceRoot:fx.paths.resourceArtifact,
        expectedProvenanceSha256:H('wrong-provenance-pin'),
        outputDir:fx.output,
      }),
      error=>error?.code==='hsme_protected_intake_provenance_pin_mismatch',
    );
    await assert.rejects(readFile(join(fx.output,'protected-artifact-intake-receipt.json')));
  }finally{await fx.cleanup();}
});

test('unexpected file in extracted artifact fails closed',async()=>{
  const fx=await makeFixture('FAILED');
  try{
    await writeFile(join(fx.paths.blindArtifact,'surprise.json'),'{}\n');
    await assert.rejects(
      ()=>intakeHsmeFoundationProtectedArtifacts({
        blindRoot:fx.paths.blindArtifact,
        expectedProvenanceSha256:fx.provenance.manifestSha256,
        outputDir:fx.output,
      }),
      error=>error?.code==='hsme_protected_intake_unexpected_file',
    );
  }finally{await fx.cleanup();}
});

test('symlink in extracted artifact fails closed',async()=>{
  const fx=await makeFixture('FAILED');
  try{
    await symlink(
      join(fx.paths.blindArtifact,'candidate-run.json'),
      join(fx.paths.blindArtifact,'alias.json'),
    );
    await assert.rejects(
      ()=>intakeHsmeFoundationProtectedArtifacts({
        blindRoot:fx.paths.blindArtifact,
        expectedProvenanceSha256:fx.provenance.manifestSha256,
        outputDir:fx.output,
      }),
      error=>error?.code==='hsme_protected_intake_symlink_forbidden',
    );
  }finally{await fx.cleanup();}
});

test('existing intake destination cannot be overwritten',async()=>{
  const fx=await makeFixture('FAILED');
  try{
    await mkdir(fx.output);
    await assert.rejects(
      ()=>intakeHsmeFoundationProtectedArtifacts({
        blindRoot:fx.paths.blindArtifact,
        expectedProvenanceSha256:fx.provenance.manifestSha256,
        outputDir:fx.output,
      }),
      error=>error?.code==='hsme_protected_intake_output_exists',
    );
  }finally{await fx.cleanup();}
});

test('provenance authority widening is rejected before external pin trust',async()=>{
  const fx=await makeFixture('FAILED');
  try{
    const forged=structuredClone(fx.provenance.manifest);
    forged.winnerSelectionAllowed=true;
    await writeFile(
      join(fx.paths.blindArtifact,'protected-artifact-provenance.json'),
      canonicalFileBytes(forged),
    );
    await assert.rejects(
      ()=>intakeHsmeFoundationProtectedArtifacts({
        blindRoot:fx.paths.blindArtifact,
        expectedProvenanceSha256:H('unused-pin'),
        outputDir:fx.output,
      }),
      error=>error?.code==='hsme_protected_provenance_authority_widening',
    );
  }finally{await fx.cleanup();}
});
