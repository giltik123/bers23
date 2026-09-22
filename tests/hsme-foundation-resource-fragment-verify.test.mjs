import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

import {verifyResourceFragment} from '../scripts/hsme-foundation-resource-fragment-verify.mjs';

const H=value=>createHash('sha256').update(value).digest('hex');
async function writeJson(path,value){
  const bytes=JSON.stringify(value,null,2)+'\n';
  await writeFile(path,bytes);
  return H(bytes);
}
function baseObjects(){
  const inventory={
    schemaVersion:'BERS_HSME_FOUNDATION_RUNTIME_INVENTORY_V1',
    candidateId:'tiny-sd-control-v1',
    immutableRevision:'a'.repeat(40),
    complete:true,
    artifacts:[{relativePath:'model/file.bin',bytes:3,contentSha256:H('abc')}],
  };
  const plan={
    campaignId:'campaign-v1',
    candidateId:'tiny-sd-control-v1',
    capability:'TEXT_TO_IMAGE',
    immutableRevision:'a'.repeat(40),
    modelContentSha256:'1'.repeat(64),
    executionProfileSha256:'2'.repeat(64),
  };
  const hardware={
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
  const method={
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
  return {inventory,plan,hardware,method};
}
async function fixture(mutator=()=>{}){
  const root=await mkdtemp(join(tmpdir(),'hsme-resource-verify-'));
  const {inventory,plan,hardware,method}=baseObjects();
  const paths={
    root,
    plan:join(root,'plan.json'),
    run:join(root,'run.json'),
    inventory:join(root,'inventory.json'),
    resource:join(root,'resource.json'),
    hardware:join(root,'hardware.json'),
    method:join(root,'method.json'),
    evidence:join(root,'evidence.json'),
  };
  const inventorySha=await writeJson(paths.inventory,inventory);
  const hardwareSha=await writeJson(paths.hardware,hardware);
  const methodSha=await writeJson(paths.method,method);
  const run={
    candidateId:plan.candidateId,
    capability:plan.capability,
    status:'COMPLETE',
    immutableRevision:plan.immutableRevision,
    modelContentSha256:plan.modelContentSha256,
    executionProfileSha256:plan.executionProfileSha256,
    rightsEvidenceSha256:'3'.repeat(64),
    runtimeInventorySha256:inventorySha,
    outputSetSha256:'4'.repeat(64),
    reviewPackageSha256:'5'.repeat(64),
    failureEvidenceSha256:'UNKNOWN',
    outputs:[{fixtureId:'fixture',seed:1,blindId:'blind_'+'a'.repeat(24),imageSha256:'6'.repeat(64)}],
  };
  const evidence={
    schemaVersion:'BERS_HSME_FOUNDATION_RESOURCE_MEASUREMENT_EVIDENCE_V1',
    candidateId:plan.candidateId,
    capability:plan.capability,
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
    costEvidenceSha256:'7'.repeat(64),
    productionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
  mutator({inventory,plan,hardware,method,run,evidence});
  await writeJson(paths.plan,plan);
  await writeJson(paths.run,run);
  if(JSON.stringify(inventory)!==JSON.stringify(JSON.parse(await readFile(paths.inventory,'utf8'))))await writeJson(paths.inventory,inventory);
  if(JSON.stringify(hardware)!==JSON.stringify(JSON.parse(await readFile(paths.hardware,'utf8'))))await writeJson(paths.hardware,hardware);
  if(JSON.stringify(method)!==JSON.stringify(JSON.parse(await readFile(paths.method,'utf8'))))await writeJson(paths.method,method);

  const currentInventorySha=H(await readFile(paths.inventory));
  const currentHardwareSha=H(await readFile(paths.hardware));
  const currentMethodSha=H(await readFile(paths.method));
  if(run.status==='COMPLETE'&&run.runtimeInventorySha256===inventorySha)run.runtimeInventorySha256=currentInventorySha;
  if(evidence.runtimeInventorySha256===inventorySha)evidence.runtimeInventorySha256=currentInventorySha;
  if(evidence.hardwareProfileSha256===hardwareSha)evidence.hardwareProfileSha256=currentHardwareSha;
  if(evidence.measurementMethodSha256===methodSha)evidence.measurementMethodSha256=currentMethodSha;
  const evidenceSha=await writeJson(paths.evidence,evidence);
  const fragment={
    schemaVersion:'BERS_HSME_FOUNDATION_RESOURCE_MEASUREMENT_FRAGMENT_V1',
    campaignId:plan.campaignId,
    record:{
      candidateId:plan.candidateId,
      capability:plan.capability,
      immutableRevision:plan.immutableRevision,
      modelContentSha256:plan.modelContentSha256,
      executionProfileSha256:plan.executionProfileSha256,
      runtimeInventory:inventory,
      hardwareProfileSha256:currentHardwareSha,
      measurementMethodSha256:currentMethodSha,
      workingMemoryKind:'CUDA_PEAK_RESERVED_BYTES',
      peakWorkingMemoryBytes:evidence.peakWorkingMemoryBytes,
      coldEndToEndLatencyMicros:evidence.coldEndToEndLatencyMicros,
      warmEndToEndLatencyMicros:evidence.warmEndToEndLatencyMicros,
      acceptedOutputCostMicrousd:evidence.acceptedOutputCostMicrousd,
      costKind:evidence.costKind,
      costEvidenceSha256:evidence.costEvidenceSha256,
      measurementEvidenceSha256:evidenceSha,
    },
    productionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
  if(mutator.fragment)mutator.fragment(fragment);
  await writeJson(paths.resource,fragment);
  return {paths,cleanup:()=>rm(root,{recursive:true,force:true})};
}
async function verify(paths){
  return verifyResourceFragment({
    planPath:paths.plan,
    runPath:paths.run,
    inventoryPath:paths.inventory,
    resourcePath:paths.resource,
    hardwareProfilePath:paths.hardware,
    measurementMethodPath:paths.method,
    measurementEvidencePath:paths.evidence,
  });
}

test('matching COMPLETE resource fragment verifies independently',async()=>{
  const x=await fixture();
  try{
    const proof=await verify(x.paths);
    assert.equal(proof.candidateId,'tiny-sd-control-v1');
    assert.equal(proof.productionAuthorityGranted,false);
    assert.equal(proof.winnerSelectionAllowed,false);
  }finally{await x.cleanup();}
});

test('FAILED candidate run cannot carry a resource fragment',async()=>{
  const x=await fixture(({run})=>{
    run.status='FAILED';
    run.outputSetSha256='UNKNOWN';
    run.reviewPackageSha256='UNKNOWN';
    run.failureEvidenceSha256='8'.repeat(64);
    run.outputs=[];
  });
  try{
    await assert.rejects(verify(x.paths),error=>error?.code==='hsme_resource_verify_run_status');
  }finally{await x.cleanup();}
});

test('runtime inventory byte drift is rejected',async()=>{
  const x=await fixture();
  try{
    const inventory=JSON.parse(await readFile(x.paths.inventory,'utf8'));
    inventory.artifacts[0].bytes=4;
    await writeJson(x.paths.inventory,inventory);
    await assert.rejects(verify(x.paths),error=>error?.code==='hsme_resource_verify_inventory_sha');
  }finally{await x.cleanup();}
});

test('cost evidence digest mismatch is rejected by independent verifier',async()=>{
  const x=await fixture();
  try{
    const fragment=JSON.parse(await readFile(x.paths.resource,'utf8'));
    fragment.record.costEvidenceSha256='8'.repeat(64);
    await writeJson(x.paths.resource,fragment);
    await assert.rejects(verify(x.paths),error=>error?.code==='hsme_resource_verify_evidence_binding');
  }finally{await x.cleanup();}
});

test('warm median cannot disagree with raw synchronized samples',async()=>{
  const x=await fixture();
  try{
    const evidence=JSON.parse(await readFile(x.paths.evidence,'utf8'));
    evidence.warmEndToEndLatencyMicros=9_999;
    await writeJson(x.paths.evidence,evidence);
    const fragment=JSON.parse(await readFile(x.paths.resource,'utf8'));
    fragment.record.warmEndToEndLatencyMicros=9_999;
    fragment.record.measurementEvidenceSha256=H(await readFile(x.paths.evidence));
    await writeJson(x.paths.resource,fragment);
    await assert.rejects(verify(x.paths),error=>error?.code==='hsme_resource_verify_warm_median');
  }finally{await x.cleanup();}
});

test('hardware driver identity is content-addressed and required',async()=>{
  const x=await fixture();
  try{
    const hardware=JSON.parse(await readFile(x.paths.hardware,'utf8'));
    delete hardware.nvidiaDriverVersion;
    await writeJson(x.paths.hardware,hardware);
    await assert.rejects(verify(x.paths),error=>error?.code==='hsme_resource_verify_shape');
  }finally{await x.cleanup();}
});

test('measurement method drift is rejected even if its digest is recomputed',async()=>{
  const x=await fixture();
  try{
    const method=JSON.parse(await readFile(x.paths.method,'utf8'));
    method.artifactAcquisitionIncludedInLatency=true;
    await writeJson(x.paths.method,method);
    const methodSha=H(await readFile(x.paths.method));
    const evidence=JSON.parse(await readFile(x.paths.evidence,'utf8'));
    evidence.measurementMethodSha256=methodSha;
    await writeJson(x.paths.evidence,evidence);
    const fragment=JSON.parse(await readFile(x.paths.resource,'utf8'));
    fragment.record.measurementMethodSha256=methodSha;
    fragment.record.measurementEvidenceSha256=H(await readFile(x.paths.evidence));
    await writeJson(x.paths.resource,fragment);
    await assert.rejects(verify(x.paths),error=>error?.code==='hsme_resource_verify_method');
  }finally{await x.cleanup();}
});
