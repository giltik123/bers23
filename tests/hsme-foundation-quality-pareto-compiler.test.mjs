import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

import {
  HSME_FOUNDATION_BENCHMARK_OUTPUT_SET_DIGEST_DOMAIN,
  HSME_FOUNDATION_BENCHMARK_RUN_EVIDENCE_V1_SCHEMA,
  hsmeFoundationBenchmarkRunEvidenceV1Digest,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkRunEvidenceV1.ts';
import {
  HSME_FOUNDATION_QUALITY_ASSESSMENT_EVIDENCE_V1_SCHEMA,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationQualityFinalizationV1.ts';
import {
  HSME_FOUNDATION_RESOURCE_EVIDENCE_V1_SCHEMA,
  proveHsmeFoundationResourceEvidenceV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationResourceEvidenceV1.ts';
import {
  proveHsmeFoundationQualityFrontierV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationQualityFrontierV1.ts';
import {
  proveHsmeFoundationParetoEfficiencyV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationParetoEfficiencyV1.ts';
import {
  compileHsmeFoundationQualityParetoEvidence,
  hashPort,
  jsonFileBytes,
  sha256Bytes,
} from '../scripts/compile-hsme-foundation-quality-pareto-evidence.mjs';

async function loadRepoJson(path){
  const bytes=await readFile(path);
  return Object.freeze({
    fileSha256:sha256Bytes(bytes),
    value:JSON.parse(bytes.toString('utf8')),
  });
}

const campaignLoaded=await loadRepoJson(
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-campaign.v1.json',
);
const trustLoaded=await loadRepoJson(
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-candidate-trust.v1.json',
);
const fixturePlanLoaded=await loadRepoJson(
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-fixture-plan.v1.json',
);
const fixturePackLoaded=await loadRepoJson(
  'src/platform/creative/local-ai/hsme/hsme-foundation-fixture-pack-evidence.v1.json',
);
const rubricLoaded=await loadRepoJson(
  'src/platform/creative/local-ai/hsme/hsme-foundation-quality-rubric.v1.json',
);

const campaign=campaignLoaded.value;
const trust=trustLoaded.value;
const fixturePlan=fixturePlanLoaded.value;
const fixturePack=fixturePackLoaded.value;
const rubric=rubricLoaded.value;
const caps=['TEXT_TO_IMAGE','IMAGE_EDITING'];
const seeds=fixturePack.sources.outputSetContract.requiredSeeds;
const H=value=>createHash('sha256').update(value).digest('hex');
const lexical=(a,b)=>a<b?-1:a>b?1:0;

function candidateTrust(candidateId){
  const value=trust.candidates.find(x=>x.candidateId===candidateId);
  assert.ok(value);
  return value;
}

function fixtureIds(capability){
  return fixturePlan.assets
    .filter(x=>x.capability===capability)
    .map(x=>x.fixtureId)
    .sort(lexical);
}

function outputs(candidateId,capability){
  return fixtureIds(capability).flatMap(fixtureId=>seeds.map(seed=>({
    fixtureId,
    seed,
    blindId:'blind_'+H(
      'blind|'+candidateId+'|'+capability+'|'+fixtureId+'|'+seed,
    ).slice(0,24),
    imageSha256:H(
      'image|'+candidateId+'|'+capability+'|'+fixtureId+'|'+seed,
    ),
  }))).sort(
    (a,b)=>lexical(a.fixtureId,b.fixtureId)
      ||a.seed-b.seed
      ||lexical(a.blindId,b.blindId),
  );
}

function outputSetDigest(records){
  return createHash('sha256')
    .update(HSME_FOUNDATION_BENCHMARK_OUTPUT_SET_DIGEST_DOMAIN+JSON.stringify(records))
    .digest('hex');
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
      .map(x=>({
        relativePath:x.relativePath,
        bytes:x.bytes,
        contentSha256:x.contentSha256,
      }))
      .sort((a,b)=>lexical(a.relativePath,b.relativePath)),
  };
}

function inventoryDigest(inventory){
  return H(JSON.stringify(inventory,null,2)+'\n');
}

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
    runtimeInventorySha256:inventory
      ?inventoryDigest(inventory)
      :status==='FAILED'
        ?H('failed-inventory|'+candidate.candidateId+'|'+capability)
        :'UNKNOWN',
    outputSetSha256:out.length?outputSetDigest(out):'UNKNOWN',
    reviewPackageSha256:status==='COMPLETE'
      ?H('review|'+candidate.candidateId+'|'+capability)
      :'UNKNOWN',
    failureEvidenceSha256:status==='FAILED'
      ?H('failure|'+candidate.candidateId+'|'+capability)
      :'UNKNOWN',
    outputs:out,
  };
}

function makeRunEvidence(){
  const runs=[];
  for(const candidate of campaign.candidates){
    for(const capability of caps){
      const supported=candidate.capabilities.includes(capability);
      let status=supported?'COMPLETE':'NOT_APPLICABLE';
      if(
        candidate.candidateId==='sana-sprint-0.6b-split-v1'
        &&capability==='TEXT_TO_IMAGE'
      ){
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
  const runEvidenceSha256=await hsmeFoundationBenchmarkRunEvidenceV1Digest(
    runEvidence,
    hashPort,
  );
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
          evidenceSha256:H(
            'assessment|'+output.blindId+'|'+dimension.dimensionId,
          ),
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

async function makeResourceEvidence(runEvidence){
  const runEvidenceSha256=await hsmeFoundationBenchmarkRunEvidenceV1Digest(
    runEvidence,
    hashPort,
  );
  const records=runEvidence.runs
    .filter(x=>x.status==='COMPLETE')
    .map(run=>({
      candidateId:run.candidateId,
      capability:run.capability,
      immutableRevision:run.immutableRevision,
      modelContentSha256:run.modelContentSha256,
      executionProfileSha256:run.executionProfileSha256,
      runtimeInventory:runtimeInventory(run.candidateId),
      hardwareProfileSha256:H('hardware|shared'),
      measurementMethodSha256:H('method|shared'),
      workingMemoryKind:'CUDA_PEAK_RESERVED_BYTES',
      peakWorkingMemoryBytes:2_000_000_000,
      coldEndToEndLatencyMicros:5_000_000,
      warmEndToEndLatencyMicros:4_000_000,
      acceptedOutputCostMicrousd:0,
      costKind:'PROVEN_UNMETERED_LOCAL',
      costEvidenceSha256:H(
        'cost-evidence|'+run.candidateId+'|'+run.capability,
      ),
      measurementEvidenceSha256:H(
        'resource|'+run.candidateId+'|'+run.capability,
      ),
    }));
  return {
    schemaVersion:HSME_FOUNDATION_RESOURCE_EVIDENCE_V1_SCHEMA,
    campaignId:campaign.campaignId,
    campaignDigest:runEvidence.campaignDigest,
    runEvidenceSha256,
    records,
    qualityScoringAllowed:false,
    qualityOrderingMutationAllowed:false,
    aggregateEfficiencyScoreAllowed:false,
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

function loaded(value,{suffix=''}={}){
  const bytes=Buffer.concat([
    jsonFileBytes(value),
    Buffer.from(suffix,'utf8'),
  ]);
  return Object.freeze({
    fileSha256:sha256Bytes(bytes),
    value,
  });
}

async function fixture(){
  const runEvidence=makeRunEvidence();
  const assessmentEvidence=await makeAssessment(runEvidence);
  const resourceEvidence=await makeResourceEvidence(runEvidence);
  return {
    campaign:campaignLoaded,
    trust:trustLoaded,
    fixturePlan:fixturePlanLoaded,
    fixturePack:fixturePackLoaded,
    qualityRubric:rubricLoaded,
    runEvidence:loaded(runEvidence),
    assessmentEvidence:loaded(assessmentEvidence),
    resourceEvidence:loaded(resourceEvidence),
  };
}

async function direct(input){
  const qualityFrontier=await proveHsmeFoundationQualityFrontierV1(
    input.campaign.value,
    input.trust.value,
    input.fixturePlan.value,
    input.fixturePack.value,
    input.qualityRubric.value,
    input.runEvidence.value,
    input.assessmentEvidence.value,
    hashPort,
  );
  const resourceProof=await proveHsmeFoundationResourceEvidenceV1(
    input.campaign.value,
    input.trust.value,
    input.fixturePlan.value,
    input.fixturePack.value,
    input.runEvidence.value,
    input.resourceEvidence.value,
    hashPort,
  );
  const pareto=await proveHsmeFoundationParetoEfficiencyV1(
    input.campaign.value,
    input.trust.value,
    input.fixturePlan.value,
    input.fixturePack.value,
    input.qualityRubric.value,
    input.runEvidence.value,
    input.assessmentEvidence.value,
    input.resourceEvidence.value,
    hashPort,
  );
  return {qualityFrontier,resourceProof,pareto};
}

test('compiler output equals direct canonical quality/resource/Pareto proofs',async()=>{
  const input=await fixture();
  const compiled=await compileHsmeFoundationQualityParetoEvidence(input);
  const expected=await direct(input);

  assert.deepEqual(compiled.qualityFrontier,expected.qualityFrontier);
  assert.deepEqual(compiled.resourceProof,expected.resourceProof);
  assert.deepEqual(compiled.pareto,expected.pareto);
  assert.equal(
    compiled.pareto.qualityFrontierSha256,
    compiled.materialization.qualityFrontierSha256,
  );
  assert.equal(
    compiled.pareto.resourceEvidenceSha256,
    compiled.materialization.resourceEvidenceSha256,
  );
  assert.match(compiled.materialization.paretoEvidenceSha256,/^[0-9a-f]{64}$/);
});

test('same exact inputs produce byte-identical compiled files',async()=>{
  const input=await fixture();
  const first=await compileHsmeFoundationQualityParetoEvidence(input);
  const second=await compileHsmeFoundationQualityParetoEvidence(input);
  assert.deepEqual(first.files.qualityFrontier,second.files.qualityFrontier);
  assert.deepEqual(first.files.resourceProof,second.files.resourceProof);
  assert.deepEqual(first.files.pareto,second.files.pareto);
  assert.deepEqual(first.files.materialization,second.files.materialization);
});

test('raw input byte drift is preserved in materialization sidecar',async()=>{
  const input=await fixture();
  const first=await compileHsmeFoundationQualityParetoEvidence(input);
  const changed={
    ...input,
    runEvidence:loaded(input.runEvidence.value,{suffix:'\n'}),
  };
  const second=await compileHsmeFoundationQualityParetoEvidence(changed);
  assert.notEqual(
    first.materialization.inputFileSha256.runEvidence,
    second.materialization.inputFileSha256.runEvidence,
  );
  assert.deepEqual(first.qualityFrontier,second.qualityFrontier);
  assert.deepEqual(first.pareto,second.pareto);
});

test('forged resource to run-evidence binding fails canonical proof',async()=>{
  const input=await fixture();
  const forged=structuredClone(input.resourceEvidence.value);
  forged.runEvidenceSha256=H('forged-run-binding');
  await assert.rejects(
    ()=>compileHsmeFoundationQualityParetoEvidence({
      ...input,
      resourceEvidence:loaded(forged),
    }),
    error=>
      error.code==='hsme_quality_pareto_canonical_proof_failed'
      &&error.message.includes('hsme_resource_run_digest'),
  );
});

test('authority widening in raw evidence fails before canonical proof',async()=>{
  const input=await fixture();
  const forged=structuredClone(input.resourceEvidence.value);
  forged.productionAuthorityGranted=true;
  await assert.rejects(
    ()=>compileHsmeFoundationQualityParetoEvidence({
      ...input,
      resourceEvidence:loaded(forged),
    }),
    error=>error.code==='hsme_quality_pareto_input_authority_widening',
  );
});

test('compiled outputs never grant winner, deployment, training or production authority',async()=>{
  const compiled=await compileHsmeFoundationQualityParetoEvidence(await fixture());
  const m=compiled.materialization;
  for(const field of [
    'winnerSelectionAllowed',
    'deploymentTierAdmissionGranted',
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
    assert.equal(m[field],false,field);
  }
});
