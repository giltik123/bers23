import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cp,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

import {
  HSME_FOUNDATION_BENCHMARK_OUTPUT_SET_DIGEST_DOMAIN,
  HSME_FOUNDATION_BENCHMARK_RUN_EVIDENCE_V1_SCHEMA,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkRunEvidenceV1.ts';
import {
  RESOURCE_BUNDLE_MANIFEST_SCHEMA,
  assembleHsmeFoundationResourceEvidenceV1,
} from '../scripts/hsme-foundation-resource-evidence-assembler.mjs';

const campaign=JSON.parse(await readFile('src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-campaign.v1.json','utf8'));
const trust=JSON.parse(await readFile('src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-candidate-trust.v1.json','utf8'));
const fixturePlan=JSON.parse(await readFile('src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-fixture-plan.v1.json','utf8'));
const fixturePack=JSON.parse(await readFile('src/platform/creative/local-ai/hsme/hsme-foundation-fixture-pack-evidence.v1.json','utf8'));

const H=value=>createHash('sha256').update(value).digest('hex');
const lexical=(a,b)=>a<b?-1:a>b?1:0;
const caps=['TEXT_TO_IMAGE','IMAGE_EDITING'];
const seeds=fixturePack.sources.outputSetContract.requiredSeeds;

function candidateTrust(candidateId){
  const value=trust.candidates.find(x=>x.candidateId===candidateId);
  assert.ok(value);
  return value;
}
function fixtureIds(capability){
  return fixturePlan.assets.filter(x=>x.capability===capability).map(x=>x.fixtureId).sort(lexical);
}
function outputs(candidateId,capability){
  return fixtureIds(capability).flatMap(fixtureId=>seeds.map(seed=>({
    fixtureId,
    seed,
    blindId:'blind_'+H('blind|'+candidateId+'|'+capability+'|'+fixtureId+'|'+seed).slice(0,24),
    imageSha256:H('image|'+candidateId+'|'+capability+'|'+fixtureId+'|'+seed),
  }))).sort((a,b)=>lexical(a.fixtureId,b.fixtureId)||a.seed-b.seed||lexical(a.blindId,b.blindId));
}
function outputSetDigest(records){
  return H(Buffer.concat([
    Buffer.from(HSME_FOUNDATION_BENCHMARK_OUTPUT_SET_DIGEST_DOMAIN,'utf8'),
    Buffer.from(JSON.stringify(records),'utf8'),
  ]));
}
function runtimeInventory(candidateId){
  const t=candidateTrust(candidateId);
  return {
    schemaVersion:'BERS_HSME_FOUNDATION_RUNTIME_INVENTORY_V1',
    candidateId,
    immutableRevision:t.artifactManifest.primarySource.immutableRevision,
    complete:true,
    artifacts:t.artifactManifest.artifacts
      .filter(x=>x.runtimeRequired)
      .map(x=>({relativePath:x.relativePath,bytes:x.bytes,contentSha256:x.contentSha256}))
      .sort((a,b)=>lexical(a.relativePath,b.relativePath)),
  };
}
function inventoryDigest(inventory){return H(JSON.stringify(inventory,null,2)+'\n');}
function runRow(candidate,capability,status){
  const out=status==='COMPLETE'?outputs(candidate.candidateId,capability):[];
  const inventory=status==='COMPLETE'?runtimeInventory(candidate.candidateId):null;
  return {
    candidateId:candidate.candidateId,
    capability,
    status,
    immutableRevision:candidate.immutableRevision,
    modelContentSha256:candidate.modelContentSha256,
    executionProfileSha256:candidate.executionProfileSha256,
    rightsEvidenceSha256:candidate.rightsEvidenceSha256,
    runtimeInventorySha256:inventory?inventoryDigest(inventory):status==='FAILED'?H('failed-inventory|'+candidate.candidateId+'|'+capability):'UNKNOWN',
    outputSetSha256:out.length?outputSetDigest(out):'UNKNOWN',
    reviewPackageSha256:status==='COMPLETE'?H('review|'+candidate.candidateId+'|'+capability):'UNKNOWN',
    failureEvidenceSha256:status==='FAILED'?H('failure|'+candidate.candidateId+'|'+capability):'UNKNOWN',
    outputs:out,
  };
}
function makeRunEvidence({sanaComplete=false}={}){
  const runs=[];
  for(const candidate of campaign.candidates){
    for(const capability of caps){
      const supported=candidate.capabilities.includes(capability);
      let status=supported?'COMPLETE':'NOT_APPLICABLE';
      if(candidate.candidateId==='sana-sprint-0.6b-split-v1'&&capability==='TEXT_TO_IMAGE'&&!sanaComplete){
        status='BLOCKED_PARITY_PENDING';
      }
      runs.push(runRow(candidate,capability,status));
    }
  }
  return {
    schemaVersion:HSME_FOUNDATION_BENCHMARK_RUN_EVIDENCE_V1_SCHEMA,
    campaignId:campaign.campaignId,
    campaignDigest:trust.campaignDigest,
    fixtureSetSha256:campaign.fixturePack.fixtureSetSha256,
    outputSetContractSha256:campaign.fixturePack.outputSetContractSha256,
    requiredSeeds:[...seeds],
    candidateOutputsObserved:true,
    runs,
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
async function writeJson(path,value){
  const bytes=JSON.stringify(value,null,2)+'\n';
  await writeFile(path,bytes,'utf8');
  return H(bytes);
}
function hardware(){
  return {
    schemaVersion:'BERS_HSME_FOUNDATION_RESOURCE_HARDWARE_PROFILE_V1',
    deviceIndex:0,
    gpuName:'Synthetic Common GPU',
    computeCapabilityMajor:8,
    computeCapabilityMinor:0,
    totalMemoryBytes:24_000_000_000,
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
async function buildBundle(root,index,run,{workflowRunId=1000+index,artifactId=2000+index}={}){
  const bundlePath='bundle-'+String(index).padStart(2,'0');
  const dir=join(root,bundlePath);
  await import('node:fs/promises').then(x=>x.mkdir(dir,{recursive:true}));

  const inventory=runtimeInventory(run.candidateId);
  const inventorySha=await writeJson(join(dir,'runtime-inventory.json'),inventory);
  assert.equal(inventorySha,run.runtimeInventorySha256);

  const plan={
    campaignId:campaign.campaignId,
    candidateId:run.candidateId,
    capability:run.capability,
    immutableRevision:run.immutableRevision,
    modelContentSha256:run.modelContentSha256,
    executionProfileSha256:run.executionProfileSha256,
  };
  await writeJson(join(dir,'execution-plan.json'),plan);
  await writeJson(join(dir,'candidate-run.json'),run);

  const hw=hardware();
  const meth=method();
  const hwSha=await writeJson(join(dir,'resource-hardware-profile.json'),hw);
  const methodSha=await writeJson(join(dir,'resource-measurement-method.json'),meth);
  const evidence={
    schemaVersion:'BERS_HSME_FOUNDATION_RESOURCE_MEASUREMENT_EVIDENCE_V1',
    candidateId:run.candidateId,
    capability:run.capability,
    runtimeInventorySha256:inventorySha,
    hardwareProfileSha256:hwSha,
    measurementMethodSha256:methodSha,
    workingMemoryKind:'CUDA_PEAK_RESERVED_BYTES',
    peakWorkingMemoryBytes:1_000_000_000+index,
    coldEndToEndLatencyMicros:5_000_000+index,
    warmEndToEndLatencyMicros:4_000_000+index,
    warmLatencySamplesMicros:[3_000_000+index,4_000_000+index,5_000_000+index],
    acceptedOutputCostMicrousd:0,
    costKind:'PROVEN_UNMETERED_LOCAL',
    costEvidenceSha256:H('cost-evidence|'+run.candidateId+'|'+run.capability),
    productionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
  const evidenceSha=await writeJson(join(dir,'resource-measurement-evidence.json'),evidence);
  const fragment={
    schemaVersion:'BERS_HSME_FOUNDATION_RESOURCE_MEASUREMENT_FRAGMENT_V1',
    campaignId:campaign.campaignId,
    record:{
      candidateId:run.candidateId,
      capability:run.capability,
      immutableRevision:run.immutableRevision,
      modelContentSha256:run.modelContentSha256,
      executionProfileSha256:run.executionProfileSha256,
      runtimeInventory:inventory,
      hardwareProfileSha256:hwSha,
      measurementMethodSha256:methodSha,
      workingMemoryKind:'CUDA_PEAK_RESERVED_BYTES',
      peakWorkingMemoryBytes:evidence.peakWorkingMemoryBytes,
      coldEndToEndLatencyMicros:evidence.coldEndToEndLatencyMicros,
      warmEndToEndLatencyMicros:evidence.warmEndToEndLatencyMicros,
      acceptedOutputCostMicrousd:0,
      costKind:'PROVEN_UNMETERED_LOCAL',
      measurementEvidenceSha256:evidenceSha,
    },
    productionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
  await writeJson(join(dir,'resource-measurement.json'),fragment);
  return {
    workflowRunId,
    artifactId,
    artifactName:'hsme-resource-'+String(index).padStart(2,'0'),
    bundlePath,
  };
}
async function setup({sanaComplete=false,includeBlockedSana=false}={}){
  const root=await mkdtemp(join(tmpdir(),'hsme-resource-assembler-'));
  const runEvidence=makeRunEvidence({sanaComplete});
  const runs=runEvidence.runs.filter(x=>x.status==='COMPLETE');
  if(includeBlockedSana&&!sanaComplete){
    const candidate=campaign.candidates.find(x=>x.candidateId==='sana-sprint-0.6b-split-v1');
    runs.push(runRow(candidate,'TEXT_TO_IMAGE','COMPLETE'));
  }
  const bundles=[];
  for(let i=0;i<runs.length;i++)bundles.push(await buildBundle(root,i,runs[i]));
  const manifest={
    schemaVersion:RESOURCE_BUNDLE_MANIFEST_SCHEMA,
    campaignId:campaign.campaignId,
    bundles,
    productionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
  return {root,runEvidence,manifest,cleanup:()=>rm(root,{recursive:true,force:true})};
}
async function assemble(x,manifest=x.manifest){
  return assembleHsmeFoundationResourceEvidenceV1({
    artifactRoot:x.root,
    rawManifest:manifest,
    rawCampaign:campaign,
    rawTrust:trust,
    rawFixturePlan:fixturePlan,
    rawFixturePackEvidence:fixturePack,
    rawRunEvidence:x.runEvidence,
  });
}

test('assembles exact COMPLETE-run roster while SANA parity-blocked row remains absent',async()=>{
  const x=await setup();
  try{
    const result=await assemble(x);
    const complete=x.runEvidence.runs.filter(r=>r.status==='COMPLETE');
    assert.equal(result.resourceEvidence.records.length,complete.length);
    assert.equal(result.resourceEvidence.records.some(r=>r.candidateId==='sana-sprint-0.6b-split-v1'),false);
    assert.equal(result.assemblyProof.imageBytesIncluded,false);
    assert.equal(result.assemblyProof.reviewArtifactsIncluded,false);
    assert.equal(result.assemblyProof.modelExecutionAllowed,false);
    assert.equal(result.assemblyProof.winnerSelectionAllowed,false);
    assert.match(result.assemblyProof.bundleManifestSha256,/^[0-9a-f]{64}$/);
    assert.match(result.assemblyProof.resourceEvidenceFileSha256,/^[0-9a-f]{64}$/);
    assert.match(result.assemblyProof.resourceEvidenceProofSha256,/^[0-9a-f]{64}$/);
  }finally{await x.cleanup();}
});

test('bundle input order does not affect canonical resource evidence digests',async()=>{
  const x=await setup();
  try{
    const first=await assemble(x);
    const reversed={...x.manifest,bundles:[...x.manifest.bundles].reverse()};
    const second=await assemble(x,reversed);
    assert.equal(first.assemblyProof.bundleManifestSha256,second.assemblyProof.bundleManifestSha256);
    assert.equal(first.assemblyProof.resourceEvidenceFileSha256,second.assemblyProof.resourceEvidenceFileSha256);
    assert.equal(first.assemblyProof.resourceEvidenceProofSha256,second.assemblyProof.resourceEvidenceProofSha256);
    assert.deepEqual(
      first.resourceEvidence.records.map(r=>r.candidateId+'\0'+r.capability),
      second.resourceEvidence.records.map(r=>r.candidateId+'\0'+r.capability),
    );
  }finally{await x.cleanup();}
});

test('missing resource bundle fails the COMPLETE-run roster',async()=>{
  const x=await setup();
  try{
    const manifest={...x.manifest,bundles:x.manifest.bundles.slice(0,-1)};
    await assert.rejects(assemble(x,manifest),error=>error?.code==='hsme_resource_assembler_roster');
  }finally{await x.cleanup();}
});

test('duplicate candidate/capability fragment fails closed even with unique artifact provenance',async()=>{
  const x=await setup();
  try{
    const first=x.manifest.bundles[0];
    const duplicatePath='bundle-duplicate-candidate';
    await cp(join(x.root,first.bundlePath),join(x.root,duplicatePath),{recursive:true});
    const duplicate={...first,workflowRunId:99_001,artifactId:99_002,bundlePath:duplicatePath};
    const manifest={...x.manifest,bundles:[...x.manifest.bundles,duplicate]};
    await assert.rejects(assemble(x,manifest),error=>error?.code==='hsme_resource_assembler_duplicate_record');
  }finally{await x.cleanup();}
});

test('extra resource bundle for parity-blocked SANA is rejected instead of scoring it',async()=>{
  const x=await setup({includeBlockedSana:true});
  try{
    await assert.rejects(assemble(x),error=>error?.code==='hsme_resource_assembler_roster');
  }finally{await x.cleanup();}
});

test('bundle containing PNG or any eighth file is rejected before parsing',async()=>{
  const x=await setup();
  try{
    await writeFile(join(x.root,x.manifest.bundles[0].bundlePath,'leak.png'),Buffer.from([1,2,3]));
    await assert.rejects(assemble(x),error=>error?.code==='hsme_resource_assembler_bundle_files');
  }finally{await x.cleanup();}
});

test('stale runtime inventory bytes are rejected by independent fragment verification',async()=>{
  const x=await setup();
  try{
    const path=join(x.root,x.manifest.bundles[0].bundlePath,'runtime-inventory.json');
    const inventory=JSON.parse(await readFile(path,'utf8'));
    inventory.artifacts[0].bytes+=1;
    await writeJson(path,inventory);
    await assert.rejects(assemble(x),error=>error?.code==='hsme_resource_verify_inventory_sha');
  }finally{await x.cleanup();}
});

test('measurement-method semantic drift is rejected even if method/evidence/fragment digests are recomputed',async()=>{
  const x=await setup();
  try{
    const dir=join(x.root,x.manifest.bundles[0].bundlePath);
    const methodPath=join(dir,'resource-measurement-method.json');
    const evidencePath=join(dir,'resource-measurement-evidence.json');
    const fragmentPath=join(dir,'resource-measurement.json');
    const meth=JSON.parse(await readFile(methodPath,'utf8'));
    meth.pngEncodingIncludedInLatency=true;
    const methodSha=await writeJson(methodPath,meth);
    const evidence=JSON.parse(await readFile(evidencePath,'utf8'));
    evidence.measurementMethodSha256=methodSha;
    const evidenceSha=await writeJson(evidencePath,evidence);
    const fragment=JSON.parse(await readFile(fragmentPath,'utf8'));
    fragment.record.measurementMethodSha256=methodSha;
    fragment.record.measurementEvidenceSha256=evidenceSha;
    await writeJson(fragmentPath,fragment);
    await assert.rejects(assemble(x),error=>error?.code==='hsme_resource_verify_method');
  }finally{await x.cleanup();}
});

test('assembly proof records content-addressed source provenance without image/review authority',async()=>{
  const x=await setup();
  try{
    const result=await assemble(x);
    for(const fragment of result.assemblyProof.fragments){
      assert.ok(Number.isSafeInteger(fragment.workflowRunId)&&fragment.workflowRunId>0);
      assert.ok(Number.isSafeInteger(fragment.artifactId)&&fragment.artifactId>0);
      assert.equal(fragment.files.length,7);
      for(const file of fragment.files){
        assert.match(file.sha256,/^[0-9a-f]{64}$/);
        assert.doesNotMatch(file.name,/png|review/i);
      }
    }
    assert.equal(result.assemblyProof.qualityScoringAllowed,false);
    assert.equal(result.assemblyProof.aggregateEfficiencyScoreAllowed,false);
    assert.equal(result.assemblyProof.productionAuthorityGranted,false);
  }finally{await x.cleanup();}
});
