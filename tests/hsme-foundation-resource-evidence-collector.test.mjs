import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cp,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

import {
  HSME_FOUNDATION_BENCHMARK_OUTPUT_SET_DIGEST_DOMAIN,
  HSME_FOUNDATION_BENCHMARK_RUN_EVIDENCE_V1_SCHEMA,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkRunEvidenceV1.ts';
import {
  HSME_FOUNDATION_RESOURCE_COLLECTION_MANIFEST_V1_SCHEMA,
  collectFoundationResourceEvidence,
} from '../scripts/hsme-foundation-resource-evidence-collector.mjs';

const campaign=JSON.parse(await readFile('src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-campaign.v1.json','utf8'));
const trust=JSON.parse(await readFile('src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-candidate-trust.v1.json','utf8'));
const fixturePlan=JSON.parse(await readFile('src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-fixture-plan.v1.json','utf8'));
const fixturePack=JSON.parse(await readFile('src/platform/creative/local-ai/hsme/hsme-foundation-fixture-pack-evidence.v1.json','utf8'));
const seeds=fixturePack.sources.outputSetContract.requiredSeeds;
const caps=['TEXT_TO_IMAGE','IMAGE_EDITING'];
const H=value=>createHash('sha256').update(value).digest('hex');
const lexical=(a,b)=>a<b?-1:a>b?1:0;
async function writeJson(path,value){const bytes=JSON.stringify(value,null,2)+'\n';await writeFile(path,bytes);return H(bytes);}

function candidateTrust(candidateId){
  const value=trust.candidates.find(x=>x.candidateId===candidateId);
  assert.ok(value);
  return value;
}
function fixtureIds(capability){return fixturePlan.assets.filter(x=>x.capability===capability).map(x=>x.fixtureId).sort(lexical);}
function outputs(candidateId,capability){
  return fixtureIds(capability).flatMap(fixtureId=>seeds.map(seed=>({
    fixtureId,seed,
    blindId:'blind_'+H('blind|'+candidateId+'|'+capability+'|'+fixtureId+'|'+seed).slice(0,24),
    imageSha256:H('image|'+candidateId+'|'+capability+'|'+fixtureId+'|'+seed),
  }))).sort((a,b)=>lexical(a.fixtureId,b.fixtureId)||a.seed-b.seed||lexical(a.blindId,b.blindId));
}
function outputDigest(records){return H(HSME_FOUNDATION_BENCHMARK_OUTPUT_SET_DIGEST_DOMAIN+JSON.stringify(records));}
function runtimeInventory(candidateId){
  const t=candidateTrust(candidateId);
  return {
    schemaVersion:'BERS_HSME_FOUNDATION_RUNTIME_INVENTORY_V1',
    candidateId,
    immutableRevision:t.artifactManifest.primarySource.immutableRevision,
    complete:true,
    artifacts:t.artifactManifest.artifacts.filter(x=>x.runtimeRequired)
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
    outputSetSha256:out.length?outputDigest(out):'UNKNOWN',
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
      if(candidate.candidateId==='sana-sprint-0.6b-split-v1'&&capability==='TEXT_TO_IMAGE'&&!sanaComplete)status='BLOCKED_PARITY_PENDING';
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
function hardware(){
  return {
    schemaVersion:'BERS_HSME_FOUNDATION_RESOURCE_HARDWARE_PROFILE_V1',
    deviceIndex:0,gpuName:'Synthetic GPU',computeCapabilityMajor:8,computeCapabilityMinor:0,
    totalMemoryBytes:12_000_000_000,nvidiaDriverVersion:'550.54.15',
    torchVersion:'2.0.1+cu118',torchCudaVersion:'11.8',workingMemoryKind:'CUDA_PEAK_RESERVED_BYTES',
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
async function writeBundle(root,run,index){
  const name='bundle-'+String(index).padStart(2,'0');
  const dir=join(root,name);
  await mkdir(dir);
  const inventory=runtimeInventory(run.candidateId);
  const hardwareValue=hardware(),methodValue=method();
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
  const inventorySha=await writeJson(join(dir,'runtime-inventory.json'),inventory);
  assert.equal(inventorySha,run.runtimeInventorySha256);
  const hardwareSha=await writeJson(join(dir,'resource-hardware-profile.json'),hardwareValue);
  const methodSha=await writeJson(join(dir,'resource-measurement-method.json'),methodValue);
  const costEvidenceSha=H('cost|'+run.candidateId+'|'+run.capability);
  const evidence={
    schemaVersion:'BERS_HSME_FOUNDATION_RESOURCE_MEASUREMENT_EVIDENCE_V1',
    candidateId:run.candidateId,capability:run.capability,
    runtimeInventorySha256:inventorySha,
    hardwareProfileSha256:hardwareSha,
    measurementMethodSha256:methodSha,
    workingMemoryKind:'CUDA_PEAK_RESERVED_BYTES',
    peakWorkingMemoryBytes:1_000_000_000+index,
    coldEndToEndLatencyMicros:5_000_000+index,
    warmEndToEndLatencyMicros:4_000_000+index,
    warmLatencySamplesMicros:[3_000_000+index,4_000_000+index,5_000_000+index],
    acceptedOutputCostMicrousd:0,
    costKind:'PROVEN_UNMETERED_LOCAL',
    costEvidenceSha256:costEvidenceSha,
    productionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
  const evidenceSha=await writeJson(join(dir,'resource-measurement-evidence.json'),evidence);
  const fragment={
    schemaVersion:'BERS_HSME_FOUNDATION_RESOURCE_MEASUREMENT_FRAGMENT_V1',
    campaignId:campaign.campaignId,
    record:{
      candidateId:run.candidateId,capability:run.capability,
      immutableRevision:run.immutableRevision,
      modelContentSha256:run.modelContentSha256,
      executionProfileSha256:run.executionProfileSha256,
      runtimeInventory:inventory,
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
  return {name,run};
}
async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'hsme-resource-collector-'));
  const runEvidence=makeRunEvidence();
  const complete=runEvidence.runs.filter(x=>x.status==='COMPLETE');
  const rows=[];
  for(let i=0;i<complete.length;i++){
    const b=await writeBundle(root,complete[i],i);
    const workflowRunId=10_000+i;
    rows.push({
      candidateId:b.run.candidateId,
      capability:b.run.capability,
      workflowRunId,
      artifactId:20_000+i,
      artifactName:'hsme-foundation-resource-evidence-'+workflowRunId,
      bundlePath:b.name,
    });
  }
  const manifest={schemaVersion:HSME_FOUNDATION_RESOURCE_COLLECTION_MANIFEST_V1_SCHEMA,campaignId:campaign.campaignId,rows,productionAuthorityGranted:false,winnerSelectionAllowed:false};
  return {root,runEvidence,manifest,cleanup:()=>rm(root,{recursive:true,force:true})};
}

test('complete resource roster assembles a #626 proof-valid canonical envelope',async()=>{
  const x=await fixture();
  try{
    const result=await collectFoundationResourceEvidence(process.cwd(),x.root,x.runEvidence,x.manifest);
    assert.equal(result.report.state,'RESOURCE_EVIDENCE_COMPLETE');
    assert.ok(result.evidence);
    assert.ok(result.proof);
    assert.equal(result.evidence.records.length,x.runEvidence.runs.filter(r=>r.status==='COMPLETE').length);
    assert.match(result.report.collectionManifestSha256,/^[0-9a-f]{64}$/);
    assert.match(result.report.resourceEvidenceSha256,/^[0-9a-f]{64}$/);
    assert.ok(result.report.sources.every(source=>/^[0-9a-f]{64}$/.test(source.sourceSha256)));
    assert.ok(result.evidence.records.every(record=>/^[0-9a-f]{64}$/.test(record.costEvidenceSha256)));
    assert.equal(result.proof.winnerSelectionAllowed,false);
  }finally{await x.cleanup();}
});

test('partial roster emits report only and never fabricates canonical resource evidence',async()=>{
  const x=await fixture();
  try{
    x.manifest.rows.pop();
    const result=await collectFoundationResourceEvidence(process.cwd(),x.root,x.runEvidence,x.manifest);
    assert.equal(result.report.state,'RESOURCE_EVIDENCE_INCOMPLETE');
    assert.equal(result.report.missingKeys.length,1);
    assert.equal(result.evidence,null);
    assert.equal(result.proof,null);
    assert.equal(result.report.resourceEvidenceSha256,'UNKNOWN');
  }finally{await x.cleanup();}
});

test('duplicate manifest row becomes FAILED_EVIDENCE instead of infrastructure ambiguity',async()=>{
  const x=await fixture();
  try{
    x.manifest.rows.push({
      ...x.manifest.rows[0],
      workflowRunId:99_999,
      artifactId:199_999,
      artifactName:'hsme-foundation-resource-evidence-99999',
    });
    const result=await collectFoundationResourceEvidence(process.cwd(),x.root,x.runEvidence,x.manifest);
    assert.equal(result.report.state,'FAILED_EVIDENCE');
    assert.equal(result.evidence,null);
    assert.equal(result.report.rejected[0].code,'hsme_resource_collector_duplicate_key');
  }finally{await x.cleanup();}
});

test('tampered measurement evidence is rejected and cannot produce envelope',async()=>{
  const x=await fixture();
  try{
    const path=join(x.root,x.manifest.rows[0].bundlePath,'resource-measurement-evidence.json');
    const evidence=JSON.parse(await readFile(path,'utf8'));
    evidence.warmLatencySamplesMicros=[1,2,999999];
    await writeJson(path,evidence);
    const result=await collectFoundationResourceEvidence(process.cwd(),x.root,x.runEvidence,x.manifest);
    assert.equal(result.report.state,'FAILED_EVIDENCE');
    assert.equal(result.evidence,null);
    assert.equal(result.report.rejected.length,1);
  }finally{await x.cleanup();}
});

test('manifest identity cannot point at another valid resource bundle under unique provenance path',async()=>{
  const x=await fixture();
  try{
    assert.ok(x.manifest.rows.length>=2);
    const copied='bundle-wrong-identity';
    await cp(join(x.root,x.manifest.rows[1].bundlePath),join(x.root,copied),{recursive:true});
    x.manifest.rows[0].bundlePath=copied;
    const result=await collectFoundationResourceEvidence(process.cwd(),x.root,x.runEvidence,x.manifest);
    assert.equal(result.report.state,'FAILED_EVIDENCE');
    assert.equal(result.evidence,null);
    assert.ok(result.report.rejected.some(r=>r.code==='hsme_resource_collector_bundle_identity'));
  }finally{await x.cleanup();}
});

test('duplicate bundle path and duplicate artifact provenance fail before file parsing',async()=>{
  const x=await fixture();
  try{
    x.manifest.rows[1].bundlePath=x.manifest.rows[0].bundlePath;
    let result=await collectFoundationResourceEvidence(process.cwd(),x.root,x.runEvidence,x.manifest);
    assert.equal(result.report.state,'FAILED_EVIDENCE');
    assert.equal(result.report.rejected[0].code,'hsme_resource_collector_duplicate_bundle_path');

    const y=await fixture();
    try{
      y.manifest.rows[1].artifactId=y.manifest.rows[0].artifactId;
      result=await collectFoundationResourceEvidence(process.cwd(),y.root,y.runEvidence,y.manifest);
      assert.equal(result.report.state,'FAILED_EVIDENCE');
      assert.equal(result.report.rejected[0].code,'hsme_resource_collector_duplicate_artifact');
    }finally{await y.cleanup();}
  }finally{await x.cleanup();}
});

test('artifact name must bind the exact workflow run id',async()=>{
  const x=await fixture();
  try{
    x.manifest.rows[0].artifactName='hsme-foundation-resource-evidence-999999';
    const result=await collectFoundationResourceEvidence(process.cwd(),x.root,x.runEvidence,x.manifest);
    assert.equal(result.report.state,'FAILED_EVIDENCE');
    assert.equal(result.report.rejected[0].code,'hsme_resource_collector_artifact_name');
  }finally{await x.cleanup();}
});

test('extra review or image-like file is rejected by exact seven-file bundle roster',async()=>{
  const x=await fixture();
  try{
    await writeJson(join(x.root,x.manifest.rows[0].bundlePath,'review-package.json'),{forbidden:true});
    const result=await collectFoundationResourceEvidence(process.cwd(),x.root,x.runEvidence,x.manifest);
    assert.equal(result.report.state,'FAILED_EVIDENCE');
    assert.ok(result.report.rejected.some(r=>r.code==='hsme_resource_collector_bundle_roster'));
  }finally{await x.cleanup();}
});

test('manifest row order does not change canonical evidence or proof digest',async()=>{
  const x=await fixture();
  try{
    const first=await collectFoundationResourceEvidence(process.cwd(),x.root,x.runEvidence,x.manifest);
    x.manifest.rows.reverse();
    const second=await collectFoundationResourceEvidence(process.cwd(),x.root,x.runEvidence,x.manifest);
    assert.equal(first.report.state,'RESOURCE_EVIDENCE_COMPLETE');
    assert.equal(second.report.state,'RESOURCE_EVIDENCE_COMPLETE');
    assert.equal(first.report.resourceEvidenceSha256,second.report.resourceEvidenceSha256);
    assert.equal(first.report.collectionManifestSha256,second.report.collectionManifestSha256);
    assert.deepEqual(first.evidence,second.evidence);
    assert.deepEqual(first.proof,second.proof);
  }finally{await x.cleanup();}
});

test('blocked SANA is not expected until canonical run evidence marks it COMPLETE',async()=>{
  const x=await fixture();
  try{
    assert.equal(x.runEvidence.runs.find(r=>r.candidateId==='sana-sprint-0.6b-split-v1'&&r.capability==='TEXT_TO_IMAGE').status,'BLOCKED_PARITY_PENDING');
    assert.equal(x.manifest.rows.some(r=>r.candidateId==='sana-sprint-0.6b-split-v1'&&r.capability==='TEXT_TO_IMAGE'),false);
    x.manifest.rows.push({
      candidateId:'sana-sprint-0.6b-split-v1',
      capability:'TEXT_TO_IMAGE',
      workflowRunId:99_998,
      artifactId:199_998,
      artifactName:'hsme-foundation-resource-evidence-99998',
      bundlePath:'missing',
    });
    const result=await collectFoundationResourceEvidence(process.cwd(),x.root,x.runEvidence,x.manifest);
    assert.equal(result.report.state,'FAILED_EVIDENCE');
    assert.ok(result.report.rejected.some(r=>r.code==='hsme_resource_collector_unexpected_row'));
  }finally{await x.cleanup();}
});
