import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  HSME_FOUNDATION_QUALITY_ASSESSMENT_EVIDENCE_V1_SCHEMA,
  proveHsmeFoundationQualityFinalizationV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationQualityFinalizationV1.ts';
import {
  HSME_FOUNDATION_BENCHMARK_RUN_EVIDENCE_V1_SCHEMA,
  hsmeFoundationBenchmarkRunEvidenceV1Digest,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkRunEvidenceV1.ts';

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
async function prove(runEvidence,assessment){
  return proveHsmeFoundationQualityFinalizationV1(
    campaign,trust,fixturePlan,fixturePack,rubric,runEvidence,assessment,hashPort,
  );
}
async function expectReject(promise,code){
  await assert.rejects(promise,error=>error?.code===code);
}

test('partial-blocked run finalizes completed candidates and preserves SANA unresolved',async()=>{
  const runEvidence=makeRunEvidence();
  const assessment=await makeAssessment(runEvidence);
  const proof=await prove(runEvidence,assessment);
  assert.equal(proof.runEvidenceState,'PARTIAL_BLOCKED');
  assert.equal(proof.finalizationState,'PARTIAL_BLOCKED');
  const t2i=proof.slices.find(x=>x.capability==='TEXT_TO_IMAGE');
  assert.deepEqual(t2i.qualityFloorPassCandidateIds,[
    'flux2-klein-4b-distilled-v1',
    'flux2-klein-base-4b-v1',
  ]);
  assert.deepEqual(t2i.unresolvedCandidateIds,['sana-sprint-0.6b-split-v1']);
  assert.equal(proof.winnerSelectionAllowed,false);
  assert.equal(proof.efficiencyUsedInQualitySelection,false);
});

test('full complete run can freeze quality evidence without choosing a winner',async()=>{
  const runEvidence=makeRunEvidence({sanaComplete:true});
  const assessment=await makeAssessment(runEvidence);
  const proof=await prove(runEvidence,assessment);
  assert.equal(proof.runEvidenceState,'FULL_COMPLETE');
  assert.equal(proof.finalizationState,'FULL_FINALIZED');
  const t2i=proof.slices.find(x=>x.capability==='TEXT_TO_IMAGE');
  assert.deepEqual(t2i.qualityFloorPassCandidateIds,[
    'flux2-klein-4b-distilled-v1',
    'flux2-klein-base-4b-v1',
    'sana-sprint-0.6b-split-v1',
  ]);
  assert.equal(Object.hasOwn(proof,'preferredCandidateIds'),false);
  assert.equal(Object.hasOwn(proof,'selectedCandidateId'),false);
});

test('FAILED run evidence cannot become quality eligible',async()=>{
  const failedKey='flux2-klein-base-4b-v1\0IMAGE_EDITING';
  const runEvidence=makeRunEvidence({failedKey});
  const assessment=await makeAssessment(runEvidence);
  const proof=await prove(runEvidence,assessment);
  assert.equal(proof.finalizationState,'FAILED_EVIDENCE');
  const editing=proof.slices.find(x=>x.capability==='IMAGE_EDITING');
  assert.deepEqual(editing.failedEvidenceCandidateIds,['flux2-klein-base-4b-v1']);
  assert.equal(editing.qualityFloorPassCandidateIds.includes('flux2-klein-base-4b-v1'),false);
});

test('assessment roster is exact: missing or duplicate blind/dimension records fail closed',async()=>{
  const runEvidence=makeRunEvidence();
  const assessment=await makeAssessment(runEvidence);
  const missing=structuredClone(assessment);
  missing.records.pop();
  await expectReject(prove(runEvidence,missing),'hsme_quality_finalization_assessment_roster');
  const duplicate=structuredClone(assessment);
  duplicate.records.push(structuredClone(duplicate.records[0]));
  await expectReject(prove(runEvidence,duplicate),'hsme_quality_finalization_record_duplicate');
});

test('unknown blind ids and review-mode drift are rejected',async()=>{
  const runEvidence=makeRunEvidence();
  const assessment=await makeAssessment(runEvidence);
  const unknown=structuredClone(assessment);
  unknown.records[0].blindId='blind_'+'f'.repeat(24);
  await expectReject(prove(runEvidence,unknown),'hsme_quality_finalization_assessment_roster');
  const drift=structuredClone(assessment);
  drift.records[0].reviewMode=drift.records[0].reviewMode==='HYBRID'?'BLINDED_HUMAN':'HYBRID';
  await expectReject(prove(runEvidence,drift),'hsme_quality_finalization_review_mode_drift');
});

test('candidate identity and efficiency fields are structurally forbidden in blinded assessment records',async()=>{
  const runEvidence=makeRunEvidence();
  const identity=await makeAssessment(runEvidence);
  identity.records[0].candidateId='flux2-klein-4b-distilled-v1';
  await expectReject(prove(runEvidence,identity),'hsme_quality_finalization_field_unknown');

  const efficiency=await makeAssessment(runEvidence);
  efficiency.records[0].latencyMs=123;
  await expectReject(prove(runEvidence,efficiency),'hsme_quality_finalization_field_unknown');
});

test('critical failure is non-compensable even when measured loss is below threshold',async()=>{
  const runEvidence=makeRunEvidence();
  const assessment=await makeAssessment(runEvidence);
  const target=assessment.records.find(x=>
    x.capability==='TEXT_TO_IMAGE'
    && x.dimensionId==='semantic-adherence'
    && x.lossMicrounits===10_000
  );
  target.lossMicrounits=1;
  target.criticalFailure=true;
  const proof=await prove(runEvidence,assessment);
  const row=proof.rows.find(x=>x.candidateId==='flux2-klein-4b-distilled-v1'&&x.capability==='TEXT_TO_IMAGE');
  const dimension=row.dimensionResults.find(x=>x.dimensionId==='semantic-adherence');
  assert.equal(dimension.criticalFailureObserved,true);
  assert.equal(dimension.passesFloor,false);
  assert.equal(row.qualityState,'QUALITY_FLOOR_FAIL');
});

test('even-cardinality median uses arithmetic mean with integer half-up semantics',async()=>{
  const runEvidence=makeRunEvidence();
  const assessment=await makeAssessment(runEvidence);
  const records=assessment.records.filter(x=>
    x.capability==='TEXT_TO_IMAGE'
    && x.dimensionId==='semantic-adherence'
    && x.lossMicrounits===10_000
  ).slice(0,12);
  assert.equal(records.length,12);
  const values=[0,0,0,0,0,10_000,10_001,20_000,20_000,20_000,20_000,20_000];
  records.forEach((record,index)=>{record.lossMicrounits=values[index];});
  const proof=await prove(runEvidence,assessment);
  const row=proof.rows.find(x=>x.candidateId==='flux2-klein-4b-distilled-v1'&&x.capability==='TEXT_TO_IMAGE');
  const dimension=row.dimensionResults.find(x=>x.dimensionId==='semantic-adherence');
  assert.equal(dimension.lossMicrounits,10_001);
});

test('run evidence and rubric digests are immutable finalization bindings',async()=>{
  const runEvidence=makeRunEvidence();
  const wrongRun=await makeAssessment(runEvidence);
  wrongRun.runEvidenceSha256=H('0');
  await expectReject(prove(runEvidence,wrongRun),'hsme_quality_finalization_run_digest_mismatch');

  const wrongRubric=await makeAssessment(runEvidence);
  wrongRubric.blindedReviewRubricSha256=H('0');
  await expectReject(prove(runEvidence,wrongRubric),'hsme_quality_finalization_rubric_digest_mismatch');
});

test('top-level finalization authority and post-observation threshold mutation remain forbidden',async()=>{
  const runEvidence=makeRunEvidence();
  const assessment=await makeAssessment(runEvidence);
  assessment.winnerSelectionAllowed=true;
  await expectReject(prove(runEvidence,assessment),'hsme_quality_finalization_authority_or_blinding');

  const threshold=await makeAssessment(runEvidence);
  threshold.postObservationThresholdMutationAllowed=true;
  await expectReject(prove(runEvidence,threshold),'hsme_quality_finalization_authority_or_blinding');
});
