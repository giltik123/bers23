import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_DENSE_STUDENT_REAL_STEP_MATRIX_CAMPAIGN_V1_SCHEMA,
  hsmeDenseStudentRealStepMatrixCampaignV1Digest,
} from './HsmeDenseStudentRealStepMatrixCampaignV1.ts';
import {
  HSME_DENSE_STUDENT_STEP_MATRIX_EVIDENCE_V1_SCHEMA,
} from './HsmeDenseStudentStepMatrixV1.ts';
import {
  HSME_DENSE_STUDENT_QUALITY_FIRST_DISPOSITION_POLICY_V1_SCHEMA,
  deriveHsmeDenseStudentQualityFirstDispositionV1,
  hsmeDenseStudentQualityFirstDispositionPolicyV1Digest,
  hsmeDenseStudentQualityFirstParetoDominatesV1,
  proveHsmeDenseStudentQualityFirstDispositionV1,
} from './HsmeDenseStudentQualityFirstDispositionV1.ts';

const hashPort={
  sha256:async bytes=>createHash('sha256').update(bytes).digest('hex'),
};
const H=value=>createHash('sha256').update(value).digest('hex');
const STEPS=[2,4,6,8];

function authorities(){
  return {
    weightedAggregateScoreAllowed:false,
    efficiencyMayOverrideQualityFailure:false,
    scheduleSelectionAllowed:false,
    candidateSelectionAllowed:false,
    checkpointPromotionAllowed:false,
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    durableModelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
}

function campaignAuthorities(){
  return {
    weightedAggregateScoreAllowed:false,
    efficiencyMayOverrideQualityFailure:false,
    scheduleSelectionAllowed:false,
    trainingVariantSelectionAllowed:false,
    candidateSelectionAllowed:false,
    baselineSelectionAllowed:false,
    checkpointPromotionAllowed:false,
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    durableModelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
}

function policy({
  editingMax=100_000,
  t2iMax=100_000,
  benchmarkBindingSha256=H('quality-first-binding'),
}={}){
  return {
    schemaVersion:HSME_DENSE_STUDENT_QUALITY_FIRST_DISPOSITION_POLICY_V1_SCHEMA,
    policyId:'hsme-quality-first:synthetic-ci-v1',
    benchmarkBindingSha256,
    trainingTargetStepCounts:[2,4,6,8],
    capabilities:[
      {
        capability:'IMAGE_EDITING',
        dimensions:[
          {
            dimensionId:'identity-preservation',
            maxLossMicrounits:editingMax,
          },
        ],
      },
      {
        capability:'TEXT_TO_IMAGE',
        dimensions:[
          {
            dimensionId:'semantic-adherence',
            maxLossMicrounits:t2iMax,
          },
        ],
      },
    ],
    criticalFailureAllowed:false,
    efficiencyTieBreakPolicy:'QUALITY_PASS_THEN_PARETO_LOWER_IS_BETTER',
    postObservationMutationAllowed:false,
    weightedAggregateScoreAllowed:false,
    efficiencyMayOverrideQualityFailure:false,
    scheduleSelectionAllowed:false,
    trainingExecutionAllowed:false,
    baselineSelectionAllowed:false,
    canonicalDecisionPersistAllowed:false,
    checkpointPromotionAllowed:false,
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    durableModelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
}

function matrix({
  trainingStep,
  representationBytes,
  loss=10_000,
  critical=false,
  rowCriticalCount=0,
  resource=1_000_000,
  cold=2_000_000,
  warm=1_500_000,
  flash=500_000,
  contextTag='shared',
  benchmarkBindingSha256=H('quality-first-binding'),
}){
  const representationEvidenceSha256=H('representation-evidence|'+trainingStep);
  const representationArtifactSha256=H('representation-artifact|'+trainingStep);
  const evidenceSha256=H('step-matrix-evidence|'+trainingStep);

  const rows=['IMAGE_EDITING','TEXT_TO_IMAGE'].flatMap(capability=>
    STEPS.map(inferenceStep=>{
      const dimensionId=capability==='IMAGE_EDITING'
        ?'identity-preservation'
        :'semantic-adherence';
      return {
        stepCount:inferenceStep,
        capability,
        outputSetSha256:H(
          'output|'+trainingStep+'|'+capability+'|'+inferenceStep,
        ),
        sampleCount:8,
        successCount:8-rowCriticalCount,
        failureCount:rowCriticalCount,
        criticalFailureCount:rowCriticalCount,
        qualityDimensions:[{
          dimensionId,
          lossMicrounits:loss,
          criticalFailureObserved:critical,
          evidenceSha256:H(
            'quality|'+trainingStep+'|'+capability+'|'+inferenceStep,
          ),
        }],
        coldEndToEndLatencyMicros:cold,
        warmEndToEndLatencyMicros:warm,
        perStepLatencyMicros:Math.floor(warm/inferenceStep),
        peakRamBytes:resource,
        peakAcceleratorBytes:resource+100,
        activeRepresentationBytes:Math.min(representationBytes,resource),
        residentRepresentationBytes:representationBytes,
        flashBytesMovedPerRun:flash,
        hardwareProfileSha256:H('hardware|'+contextTag),
        runtimeIdentity:'runtime:'+contextTag,
        providerIdentity:'provider:'+contextTag,
        measurementMethodSha256:H('method|'+contextTag),
        measurementEvidenceSha256:H(
          'measurement|'+trainingStep+'|'+capability+'|'+inferenceStep,
        ),
      };
    })
  ).sort((a,b)=>
    a.capability.localeCompare(b.capability)||a.stepCount-b.stepCount
  );

  return {
    schemaVersion:HSME_DENSE_STUDENT_STEP_MATRIX_EVIDENCE_V1_SCHEMA,
    state:'STEP_MATRIX_READY_NOT_SELECTED',
    blockers:[],
    representationEvidenceSha256,
    candidateId:'bers-dense-core-v1-training-target',
    representationArtifactSha256,
    representationBytes,
    benchmarkBindingSha256,
    benchmarkResultSha256:H('benchmark-result|'+trainingStep),
    benchmarkAttemptId:'synthetic-matrix:'+trainingStep,
    rows,
    evidenceSha256,
    ...authorities(),
  };
}

function fixture({
  variant={},
  benchmarkBindingSha256=H('quality-first-binding'),
}={}){
  const defaults={
    2:{representationBytes:600,resource:900,cold:1600,warm:1200,flash:500,loss:10_000},
    4:{representationBytes:700,resource:1000,cold:1700,warm:1300,flash:600,loss:10_000},
    6:{representationBytes:800,resource:1100,cold:1800,warm:1400,flash:700,loss:10_000},
    8:{representationBytes:900,resource:1200,cold:1900,warm:1500,flash:800,loss:10_000},
  };
  const matrices=STEPS.map(step=>matrix({
    trainingStep:step,
    benchmarkBindingSha256,
    ...defaults[step],
    ...(variant[step]??{}),
  }));
  const entries=matrices.map((value,index)=>({
    trainingTargetStepCount:STEPS[index],
    representationAdmissionSha256:H('admission|'+STEPS[index]),
    representationEvidenceSha256:value.representationEvidenceSha256,
    representationArtifactSha256:value.representationArtifactSha256,
    representationBytes:value.representationBytes,
    stepMatrixEvidenceSha256:value.evidenceSha256,
    benchmarkBindingSha256,
    benchmarkResultSha256:value.benchmarkResultSha256,
    benchmarkAttemptId:value.benchmarkAttemptId,
  }));
  const campaign={
    schemaVersion:HSME_DENSE_STUDENT_REAL_STEP_MATRIX_CAMPAIGN_V1_SCHEMA,
    state:'REAL_STEP_MATRIX_CAMPAIGN_READY_NOT_SELECTED',
    blockers:[],
    rosterEvidenceSha256:H('real-roster'),
    candidateId:'bers-dense-core-v1-training-target',
    architectureFamily:'COMPACT_DIT',
    trainingTargetStepCounts:[2,4,6,8],
    benchmarkBindingSha256,
    entries,
    evidenceSha256:H('placeholder-campaign'),
    ...campaignAuthorities(),
  };
  const inputs=matrices.map((stepMatrix,index)=>({
    trainingTargetStepCount:STEPS[index],
    stepMatrix,
  }));
  return {campaign,matrices,inputs};
}

test('quality failure cannot be rescued by a smaller faster representation',()=>{
  const fx=fixture({
    variant:{
      2:{
        representationBytes:100,
        resource:100,
        cold:100,
        warm:100,
        flash:100,
        loss:200_000,
      },
      4:{loss:200_000},
      6:{loss:200_000},
      8:{
        representationBytes:900,
        resource:1200,
        cold:1900,
        warm:1500,
        flash:800,
        loss:10_000,
      },
    },
  });
  const result=deriveHsmeDenseStudentQualityFirstDispositionV1(
    fx.campaign,
    policy(),
    fx.inputs,
  );
  assert.equal(result.state,'REAL_REPRESENTATION_SELECTED_READY_NOT_PROJECTED');
  assert.deepEqual(result.qualityPassTrainingTargetStepCounts,[8]);
  assert.equal(result.selectedTrainingTargetStepCount,8);
  assert.equal(
    result.perStepQuality.find(value=>value.trainingTargetStepCount===2)
      .qualityState,
    'QUALITY_FLOOR_FAIL',
  );
});

test('zero quality-pass variants require redesign instead of efficiency selection',()=>{
  const fx=fixture({
    variant:{
      2:{loss:200_000},
      4:{loss:200_000},
      6:{critical:true},
      8:{rowCriticalCount:1},
    },
  });
  const result=deriveHsmeDenseStudentQualityFirstDispositionV1(
    fx.campaign,
    policy(),
    fx.inputs,
  );
  assert.equal(
    result.state,
    'REAL_REPRESENTATION_QUALITY_REDESIGN_REQUIRED',
  );
  assert.deepEqual(result.qualityPassTrainingTargetStepCounts,[]);
  assert.deepEqual(result.paretoVectors,[]);
});

test('unique lower-is-better Pareto variant is selected without a weighted score',()=>{
  const fx=fixture();
  const result=deriveHsmeDenseStudentQualityFirstDispositionV1(
    fx.campaign,
    policy(),
    fx.inputs,
  );
  assert.equal(result.state,'REAL_REPRESENTATION_SELECTED_READY_NOT_PROJECTED');
  assert.deepEqual(result.qualityPassTrainingTargetStepCounts,[2,4,6,8]);
  assert.deepEqual(result.paretoNondominatedTrainingTargetStepCounts,[2]);
  assert.equal(result.selectedTrainingTargetStepCount,2);
});

test('cross-metric tradeoff remains ambiguous rather than inventing a rank',()=>{
  const fx=fixture({
    variant:{
      2:{
        representationBytes:100,
        resource:2000,
        cold:2000,
        warm:2000,
        flash:2000,
      },
      4:{
        representationBytes:200,
        resource:1500,
        cold:1500,
        warm:1500,
        flash:1500,
      },
      6:{
        representationBytes:300,
        resource:1000,
        cold:1000,
        warm:1000,
        flash:1000,
      },
      8:{
        representationBytes:400,
        resource:500,
        cold:500,
        warm:500,
        flash:500,
      },
    },
  });
  const result=deriveHsmeDenseStudentQualityFirstDispositionV1(
    fx.campaign,
    policy(),
    fx.inputs,
  );
  assert.equal(result.state,'REAL_REPRESENTATION_DISPOSITION_AMBIGUOUS');
  assert.deepEqual(result.paretoNondominatedTrainingTargetStepCounts,[2,4,6,8]);
  assert.equal(Object.hasOwn(result,'selectedTrainingTargetStepCount'),false);
});

test('missing or extra quality dimension is INVALID derivation, never silent fail',()=>{
  const fx=fixture();
  fx.inputs[0].stepMatrix.rows[0].qualityDimensions.push({
    dimensionId:'unexpected-dimension',
    lossMicrounits:0,
    criticalFailureObserved:false,
    evidenceSha256:H('unexpected-dimension'),
  });
  assert.throws(
    ()=>deriveHsmeDenseStudentQualityFirstDispositionV1(
      fx.campaign,
      policy(),
      fx.inputs,
    ),
    error=>error?.code==='hsme_quality_first_dimension_roster_mismatch',
  );
});

test('cross-variant measurement-context drift fails closed',()=>{
  const fx=fixture({
    variant:{
      8:{contextTag:'different-hardware'},
    },
  });
  assert.throws(
    ()=>deriveHsmeDenseStudentQualityFirstDispositionV1(
      fx.campaign,
      policy(),
      fx.inputs,
    ),
    error=>error?.code==='hsme_quality_first_measurement_context_drift',
  );
});

test('same exact derivation inputs produce byte-identical disposition',()=>{
  const fx=fixture();
  const first=deriveHsmeDenseStudentQualityFirstDispositionV1(
    fx.campaign,
    policy(),
    fx.inputs,
  );
  const second=deriveHsmeDenseStudentQualityFirstDispositionV1(
    fx.campaign,
    policy(),
    fx.inputs,
  );
  assert.deepEqual(first,second);
  assert.equal(JSON.stringify(first),JSON.stringify(second));
});

test('Pareto dominance requires no-worse every dimension and improvement in one',()=>{
  const base={
    trainingTargetStepCount:2,
    representationBytes:100,
    peakRamBytes:200,
    peakAcceleratorBytes:300,
    coldEndToEndLatencyMicros:400,
    warmEndToEndLatencyMicros:350,
    flashBytesMovedPerRun:500,
  };
  assert.equal(
    hsmeDenseStudentQualityFirstParetoDominatesV1(
      base,
      {...base,trainingTargetStepCount:4},
    ),
    false,
  );
  assert.equal(
    hsmeDenseStudentQualityFirstParetoDominatesV1(
      base,
      {...base,trainingTargetStepCount:4,flashBytesMovedPerRun:501},
    ),
    true,
  );
});

test('policy authority widening is rejected before derivation',()=>{
  const fx=fixture();
  const forged=policy();
  forged.weightedAggregateScoreAllowed=true;
  assert.throws(
    ()=>deriveHsmeDenseStudentQualityFirstDispositionV1(
      fx.campaign,
      forged,
      fx.inputs,
    ),
    error=>error?.code==='hsme_quality_first_authority',
  );
});

test('ordinary PR synthetic campaign cannot pass trusted public origin boundary',async()=>{
  const fx=fixture();
  fx.campaign.evidenceSha256=
    await hsmeDenseStudentRealStepMatrixCampaignV1Digest(
      fx.campaign,
      hashPort,
    );
  const p=policy();
  const policySha=await hsmeDenseStudentQualityFirstDispositionPolicyV1Digest(
    p,
    hashPort,
  );
  const result=await proveHsmeDenseStudentQualityFirstDispositionV1(
    fx.campaign,
    fx.campaign.evidenceSha256,
    {async verifyRealStepMatrixCampaign(){return false;}},
    p,
    policySha,
    {async verifyQualityFirstDispositionPolicy(){return false;}},
    fx.inputs,
    {async verifyStepMatrixEvidence(){return false;}},
    hashPort,
  );
  assert.equal(result.state,'REAL_REPRESENTATION_DISPOSITION_INVALID');
  assert.deepEqual(result.blockers,['QUALITY_FIRST_CAMPAIGN_ORIGIN_UNVERIFIED']);
  assert.equal(result.evidenceSha256,'UNKNOWN');
});
