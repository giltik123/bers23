import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  HSME_FOUNDATION_QUALITY_ASSESSMENT_EVIDENCE_V1_SCHEMA,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationQualityFinalizationV1.ts';
import {
  HSME_FOUNDATION_BENCHMARK_RUN_EVIDENCE_V1_SCHEMA,
  hsmeFoundationBenchmarkRunEvidenceV1Digest,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkRunEvidenceV1.ts';
import {
  proveHsmeFoundationQualityFrontierV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationQualityFrontierV1.ts';

const campaign=JSON.parse(await readFile('src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-campaign.v1.json','utf8'));
const trust=JSON.parse(await readFile('src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-candidate-trust.v1.json','utf8'));
const fixturePlan=JSON.parse(await readFile('src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-fixture-plan.v1.json','utf8'));
const fixturePack=JSON.parse(await readFile('src/platform/creative/local-ai/hsme/hsme-foundation-fixture-pack-evidence.v1.json','utf8'));
const rubric=JSON.parse(await readFile('src/platform/creative/local-ai/hsme/hsme-foundation-quality-rubric.v1.json','utf8'));

const hashPort={sha256:async bytes=>createHash('sha256').update(bytes).digest('hex')};
const H=ch=>ch.repeat(64);
const outputDomain='bers:hsme:foundation-benchmark-output-set:v1\0';
const caps=['TEXT_TO_IMAGE','IMAGE_EDITING'];

function blind(candidateId,capability,fixtureId,seed){
  return 'blind_'+createHash('sha256').update(candidateId+'\0'+capability+'\0'+fixtureId+'\0'+seed).digest('hex').slice(0,24);
}
function outputDigest(outputs){
  const normalized=[...outputs].sort((a,b)=>a.fixtureId.localeCompare(b.fixtureId)||a.seed-b.seed||a.blindId.localeCompare(b.blindId));
  return createHash('sha256').update(outputDomain+JSON.stringify(normalized)).digest('hex');
}
function runRow(candidate,capability,status){
  const outputs=status==='COMPLETE'
    ? fixturePlan.assets.filter(x=>x.capability===capability).flatMap(asset=>
        fixturePack.sources.outputSetContract.requiredSeeds.map(seed=>({
          fixtureId:asset.fixtureId,
          seed,
          blindId:blind(candidate.candidateId,capability,asset.fixtureId,seed),
          imageSha256:createHash('sha256').update('img:'+candidate.candidateId+':'+capability+':'+asset.fixtureId+':'+seed).digest('hex'),
        }))
      )
    : [];
  outputs.sort((a,b)=>a.fixtureId.localeCompare(b.fixtureId)||a.seed-b.seed);
  return {
    candidateId:candidate.candidateId,
    capability,
    status,
    immutableRevision:candidate.immutableRevision,
    modelContentSha256:candidate.modelContentSha256,
    executionProfileSha256:candidate.executionProfileSha256,
    rightsEvidenceSha256:candidate.rightsEvidenceSha256,
    runtimeInventorySha256:status==='COMPLETE'||status==='FAILED'?H('1'):'UNKNOWN',
    outputSetSha256:outputs.length?outputDigest(outputs):'UNKNOWN',
    reviewPackageSha256:status==='COMPLETE'?H('2'):'UNKNOWN',
    failureEvidenceSha256:status==='FAILED'?H('3'):'UNKNOWN',
    outputs,
  };
}
function makeRunEvidence({sanaComplete=false,failedKey=null}={}){
  const runs=[];
  for(const candidate of campaign.candidates){
    for(const capability of caps){
      const key=candidate.candidateId+'\0'+capability;
      const supported=candidate.capabilities.includes(capability);
      let status=supported?'COMPLETE':'NOT_APPLICABLE';
      if(candidate.candidateId==='sana-sprint-0.6b-split-v1'&&capability==='TEXT_TO_IMAGE'&&!sanaComplete)status='BLOCKED_PARITY_PENDING';
      if(failedKey===key)status='FAILED';
      runs.push(runRow(candidate,capability,status));
    }
  }
  return {
    schemaVersion:HSME_FOUNDATION_BENCHMARK_RUN_EVIDENCE_V1_SCHEMA,
    campaignId:campaign.campaignId,
    campaignDigest:trust.campaignDigest,
    fixtureSetSha256:campaign.fixturePack.fixtureSetSha256,
    outputSetContractSha256:campaign.fixturePack.outputSetContractSha256,
    requiredSeeds:[...fixturePack.sources.outputSetContract.requiredSeeds],
    candidateOutputsObserved:runs.some(x=>x.outputs.length>0),
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
async function makeAssessment(runEvidence){
  const runEvidenceSha256=await hsmeFoundationBenchmarkRunEvidenceV1Digest(runEvidence,hashPort);
  const records=[];
  for(const run of runEvidence.runs){
    if(run.status!=='COMPLETE')continue;
    const slice=campaign.slices.find(x=>x.capability===run.capability);
    const isReference=slice.qualityReferenceCandidateIds.includes(run.candidateId);
    for(const output of run.outputs){
      for(const dimension of slice.dimensions){
        records.push({
          blindId:output.blindId,
          capability:run.capability,
          dimensionId:dimension.dimensionId,
          reviewMode:dimension.reviewMode,
          lossMicrounits:isReference?0:10_000,
          criticalFailure:false,
          evidenceSha256:createHash('sha256').update('assessment:'+output.blindId+':'+dimension.dimensionId).digest('hex'),
        });
      }
    }
  }
  return {
    schemaVersion:HSME_FOUNDATION_QUALITY_ASSESSMENT_EVIDENCE_V1_SCHEMA,
    campaignId:campaign.campaignId,
    runEvidenceSha256,
    blindedReviewRubricSha256:campaign.fixturePack.blindedReviewRubricSha256,
    aggregationPolicy:'MAX_NONCOMPENSABLE_CRITICAL_THEN_MEDIAN',
    medianPolicy:'EVEN_ARITHMETIC_MEAN_HALF_UP',
    records,
    candidateIdentityIncluded:false,
    efficiencyMetadataIncluded:false,
    postObservationThresholdMutationAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
}
function candidateBlindIds(runEvidence,candidateId,capability){
  const run=runEvidence.runs.find(x=>x.candidateId===candidateId&&x.capability===capability);
  assert.ok(run);
  return new Set(run.outputs.map(x=>x.blindId));
}
function setLoss(assessment,runEvidence,candidateId,capability,dimensionId,loss){
  const ids=candidateBlindIds(runEvidence,candidateId,capability);
  let count=0;
  for(const record of assessment.records){
    if(ids.has(record.blindId)&&record.dimensionId===dimensionId){
      record.lossMicrounits=loss;
      count++;
    }
  }
  assert.ok(count>0);
}
function setAllLosses(assessment,runEvidence,candidateId,capability,loss){
  const slice=campaign.slices.find(x=>x.capability===capability);
  for(const dimension of slice.dimensions)setLoss(assessment,runEvidence,candidateId,capability,dimension.dimensionId,loss);
}
function setOneCritical(assessment,runEvidence,candidateId,capability,dimensionId,loss=1){
  const ids=candidateBlindIds(runEvidence,candidateId,capability);
  const record=assessment.records.find(x=>ids.has(x.blindId)&&x.dimensionId===dimensionId);
  assert.ok(record);
  record.lossMicrounits=loss;
  record.criticalFailure=true;
}
async function prove(runEvidence,assessment,rawCampaign=campaign){
  return proveHsmeFoundationQualityFrontierV1(
    rawCampaign,trust,fixturePlan,fixturePack,rubric,runEvidence,assessment,hashPort,
  );
}

test('partial SANA blocks T2I frontier and efficiency while editing can close independently',async()=>{
  const runEvidence=makeRunEvidence();
  const assessment=await makeAssessment(runEvidence);
  const proof=await prove(runEvidence,assessment);
  const t2i=proof.slices.find(x=>x.capability==='TEXT_TO_IMAGE');
  const editing=proof.slices.find(x=>x.capability==='IMAGE_EDITING');
  assert.equal(t2i.state,'PARTIAL_BLOCKED');
  assert.deepEqual(t2i.qualityPreferredCandidateIds,[]);
  assert.deepEqual(t2i.efficiencyCandidateIds,[]);
  assert.equal(t2i.efficiencyComparisonAllowed,false);
  assert.equal(editing.state,'FULL_QUALITY_FRONTIER');
  assert.deepEqual(editing.qualityPreferredCandidateIds,[
    'flux2-klein-4b-distilled-v1',
    'flux2-klein-base-4b-v1',
  ]);
  assert.deepEqual(editing.efficiencyCandidateIds,editing.qualityPreferredCandidateIds);
});

test('full T2I frontier chooses lower frozen lexicographic quality vector before any efficiency evidence',async()=>{
  const runEvidence=makeRunEvidence({sanaComplete:true});
  const assessment=await makeAssessment(runEvidence);
  setAllLosses(assessment,runEvidence,'flux2-klein-4b-distilled-v1','TEXT_TO_IMAGE',20_000);
  setAllLosses(assessment,runEvidence,'flux2-klein-base-4b-v1','TEXT_TO_IMAGE',0);
  setAllLosses(assessment,runEvidence,'sana-sprint-0.6b-split-v1','TEXT_TO_IMAGE',0);
  setLoss(assessment,runEvidence,'flux2-klein-4b-distilled-v1','TEXT_TO_IMAGE','semantic-adherence',5_000);
  setLoss(assessment,runEvidence,'flux2-klein-base-4b-v1','TEXT_TO_IMAGE','semantic-adherence',6_000);
  setLoss(assessment,runEvidence,'sana-sprint-0.6b-split-v1','TEXT_TO_IMAGE','semantic-adherence',7_000);
  const proof=await prove(runEvidence,assessment);
  const t2i=proof.slices.find(x=>x.capability==='TEXT_TO_IMAGE');
  assert.equal(t2i.state,'FULL_QUALITY_FRONTIER');
  assert.deepEqual(t2i.qualityPreferredCandidateIds,['flux2-klein-4b-distilled-v1']);
  assert.deepEqual(t2i.efficiencyCandidateIds,['flux2-klein-4b-distilled-v1']);
});

test('later-dimension improvement cannot compensate for worse earlier quality dimension',async()=>{
  const runEvidence=makeRunEvidence({sanaComplete:true});
  const assessment=await makeAssessment(runEvidence);
  setAllLosses(assessment,runEvidence,'flux2-klein-4b-distilled-v1','TEXT_TO_IMAGE',20_000);
  setAllLosses(assessment,runEvidence,'flux2-klein-base-4b-v1','TEXT_TO_IMAGE',0);
  setAllLosses(assessment,runEvidence,'sana-sprint-0.6b-split-v1','TEXT_TO_IMAGE',20_000);
  setLoss(assessment,runEvidence,'flux2-klein-4b-distilled-v1','TEXT_TO_IMAGE','semantic-adherence',4_000);
  setLoss(assessment,runEvidence,'flux2-klein-base-4b-v1','TEXT_TO_IMAGE','semantic-adherence',5_000);
  setLoss(assessment,runEvidence,'sana-sprint-0.6b-split-v1','TEXT_TO_IMAGE','semantic-adherence',6_000);
  const proof=await prove(runEvidence,assessment);
  const t2i=proof.slices.find(x=>x.capability==='TEXT_TO_IMAGE');
  assert.deepEqual(t2i.qualityPreferredCandidateIds,['flux2-klein-4b-distilled-v1']);
  assert.deepEqual(t2i.dimensionPriority,campaign.slices.find(x=>x.capability==='TEXT_TO_IMAGE').dimensions.map(x=>x.dimensionId));
});

test('exact quality-vector ties remain ties for later efficiency stage',async()=>{
  const runEvidence=makeRunEvidence({sanaComplete:true});
  const assessment=await makeAssessment(runEvidence);
  setAllLosses(assessment,runEvidence,'flux2-klein-4b-distilled-v1','TEXT_TO_IMAGE',9_000);
  setAllLosses(assessment,runEvidence,'flux2-klein-base-4b-v1','TEXT_TO_IMAGE',9_000);
  setAllLosses(assessment,runEvidence,'sana-sprint-0.6b-split-v1','TEXT_TO_IMAGE',10_000);
  const proof=await prove(runEvidence,assessment);
  const t2i=proof.slices.find(x=>x.capability==='TEXT_TO_IMAGE');
  assert.deepEqual(t2i.qualityPreferredCandidateIds,[
    'flux2-klein-4b-distilled-v1',
    'flux2-klein-base-4b-v1',
  ]);
  assert.deepEqual(t2i.efficiencyCandidateIds,t2i.qualityPreferredCandidateIds);
});

test('hard quality failure cannot enter frontier even with numerically tiny first-dimension loss',async()=>{
  const runEvidence=makeRunEvidence({sanaComplete:true});
  const assessment=await makeAssessment(runEvidence);
  setAllLosses(assessment,runEvidence,'flux2-klein-4b-distilled-v1','TEXT_TO_IMAGE',10_000);
  setAllLosses(assessment,runEvidence,'flux2-klein-base-4b-v1','TEXT_TO_IMAGE',10_000);
  setAllLosses(assessment,runEvidence,'sana-sprint-0.6b-split-v1','TEXT_TO_IMAGE',10_000);
  setOneCritical(assessment,runEvidence,'flux2-klein-base-4b-v1','TEXT_TO_IMAGE','semantic-adherence',1);
  const proof=await prove(runEvidence,assessment);
  const t2i=proof.slices.find(x=>x.capability==='TEXT_TO_IMAGE');
  const failed=t2i.candidates.find(x=>x.candidateId==='flux2-klein-base-4b-v1');
  assert.equal(failed.qualityState,'QUALITY_FLOOR_FAIL');
  assert.equal(t2i.efficiencyCandidateIds.includes('flux2-klein-base-4b-v1'),false);
});

test('FAILED selection evidence blocks a slice and prohibits efficiency handoff',async()=>{
  const runEvidence=makeRunEvidence({failedKey:'flux2-klein-base-4b-v1\0IMAGE_EDITING'});
  const assessment=await makeAssessment(runEvidence);
  const proof=await prove(runEvidence,assessment);
  const editing=proof.slices.find(x=>x.capability==='IMAGE_EDITING');
  assert.equal(editing.state,'FAILED_EVIDENCE');
  assert.deepEqual(editing.qualityPreferredCandidateIds,[]);
  assert.deepEqual(editing.efficiencyCandidateIds,[]);
  assert.equal(editing.efficiencyComparisonAllowed,false);
});

test('control and quality-reference candidates never enter selection frontier',async()=>{
  const runEvidence=makeRunEvidence({sanaComplete:true});
  const assessment=await makeAssessment(runEvidence);
  const proof=await prove(runEvidence,assessment);
  for(const slice of proof.slices){
    const ids=slice.candidates.map(x=>x.candidateId);
    assert.equal(ids.includes('tiny-sd-control-v1'),false);
    assert.equal(ids.includes('qwen-image-t2i-reference-v1'),false);
    assert.equal(ids.includes('qwen-image-edit-2511-reference-v1'),false);
  }
});

test('efficiency or aggregate-score leakage remains rejected before frontier proof',async()=>{
  const runEvidence=makeRunEvidence({sanaComplete:true});
  const efficiency=await makeAssessment(runEvidence);
  efficiency.records[0].workingMemoryBytes=1;
  await assert.rejects(
    prove(runEvidence,efficiency),
    error=>error?.code==='hsme_quality_finalization_field_unknown',
  );
  const aggregate=await makeAssessment(runEvidence);
  aggregate.aggregateScore=1;
  await assert.rejects(
    prove(runEvidence,aggregate),
    error=>error?.code==='hsme_quality_finalization_field_unknown',
  );
});

test('campaign dimension-order mutation is rejected by accepted campaign/trust binding before frontier changes',async()=>{
  const runEvidence=makeRunEvidence({sanaComplete:true});
  const assessment=await makeAssessment(runEvidence);
  const changed=structuredClone(campaign);
  const t2i=changed.slices.find(x=>x.capability==='TEXT_TO_IMAGE');
  [t2i.dimensions[0],t2i.dimensions[1]]=[t2i.dimensions[1],t2i.dimensions[0]];
  await assert.rejects(
    prove(runEvidence,assessment,changed),
    error=>String(error?.code||'').includes('campaign')||String(error?.code||'').includes('run'),
  );
});

test('frontier grants no final winner or production authority',async()=>{
  const runEvidence=makeRunEvidence({sanaComplete:true});
  const assessment=await makeAssessment(runEvidence);
  const proof=await prove(runEvidence,assessment);
  assert.equal(proof.winnerSelectionAllowed,false);
  assert.equal(proof.productionAuthorityGranted,false);
  assert.equal(proof.providerAuthorityGranted,false);
  assert.equal(proof.trainingOrDistillationAllowed,false);
  assert.equal(Object.hasOwn(proof,'selectedCandidateId'),false);
  assert.equal(Object.hasOwn(proof,'winnerCandidateId'),false);
});
