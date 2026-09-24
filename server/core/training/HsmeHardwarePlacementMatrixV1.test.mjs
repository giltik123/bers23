import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_HARDWARE_REPRESENTATION_QUALIFICATION_ROSTER_V1_SCHEMA,
  hsmeHardwareRepresentationQualificationRosterV1Digest,
} from './HsmeHardwareRepresentationQualificationRosterV1.ts';
import {
  CORE_HSME_HARDWARE_PLACEMENT_RESULT_V1_SCHEMA,
  HSME_HARDWARE_PLACEMENT_CAMPAIGN_POLICY_V1_SCHEMA,
  collectHsmeHardwarePlacementMatrixV1,
  coreHsmeHardwarePlacementResultV1Digest,
  hsmeHardwarePlacementCampaignPolicyV1Digest,
  hsmeHardwarePlacementMatrixV1Digest,
} from './HsmeHardwarePlacementMatrixV1.ts';

const hash={
  async sha256(bytes){
    return createHash('sha256').update(bytes).digest('hex');
  },
};

function h(ch){return ch.repeat(64);}

function rosterAuthority(){
  return {
    benchmarkExecutionAllowed:false,
    representationMutationAllowed:false,
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    durableModelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    fashionGeometryAuthorityGranted:false,
    aeeExecutionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
}

function authority(){
  return {
    selectionAllowed:false,
    benchmarkExecutionAllowed:false,
    representationMutationAllowed:false,
    inferenceExecutionAllowed:false,
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    durableModelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    fashionGeometryAuthorityGranted:false,
    artifactAuthorityGranted:false,
    aeeExecutionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
}

function candidate(
  candidateId,
  platformFamily,
  hardwareBackend,
  contentCh,
  placements,
){
  return {
    candidateId,
    logicalModelFamily:'bers-hsme-mobile-v1',
    sourceModelContentSha256:h('1'),
    fleetModelId:'bers-hsme-'+candidateId,
    fleetVersion:'1.0.0',
    representationContentSha256:h(contentCh),
    representationManifestSha256:h(
      contentCh==='a'?'c':'d',
    ),
    representationBytes:
      platformFamily==='APPLE'?750_000_000:780_000_000,
    runtimeIdentity:
      platformFamily==='APPLE'
        ?'coreml-metal-ane-v1'
        :'litert-vulkan-qnn-v1',
    formatIdentity:
      platformFamily==='APPLE'
        ?'coreml-mlpackage-v1'
        :'litert-tflite-v1',
    platformFamily,
    hardwareBackend,
    precisionTier:'MIXED',
    supportedDeviceClass:
      platformFamily==='APPLE'
        ?'apple-a17-pro-mobile'
        :'snapdragon-8-gen-3-mobile',
    admissibleBenchmarkPlacements:placements,
    runtimeCapabilityEvidenceSha256:h(
      contentCh==='a'?'e':'f',
    ),
    licenseProvenanceEvidenceSha256:h('2'),
    immutableFleetManifestEvidenceSha256:h(
      contentCh==='a'?'3':'4',
    ),
    representationReadyForBenchmark:true,
  };
}

async function roster(){
  const base={
    schemaVersion:
      HSME_HARDWARE_REPRESENTATION_QUALIFICATION_ROSTER_V1_SCHEMA,
    state:'HARDWARE_REPRESENTATION_ROSTER_FROZEN_NOT_EXECUTED',
    blockers:[],
    representationSetSha256:h('5'),
    candidates:[
      candidate(
        'android-gpu',
        'ANDROID',
        'GPU',
        'b',
        ['CPU','GPU'],
      ),
      candidate(
        'apple-npu',
        'APPLE',
        'NPU',
        'a',
        ['CPU','NPU'],
      ),
    ],
    rosterEvidenceSha256:h('0'),
    ...rosterAuthority(),
  };
  const rosterEvidenceSha256=
    await hsmeHardwareRepresentationQualificationRosterV1Digest(
      base,
      hash,
    );
  return {...base,rosterEvidenceSha256};
}

function rawPolicy(r,overrides={}){
  return {
    schemaVersion:
      HSME_HARDWARE_PLACEMENT_CAMPAIGN_POLICY_V1_SCHEMA,
    hardwareRepresentationRosterSha256:r.rosterEvidenceSha256,
    fixtureSetSha256:h('6'),
    evaluationContractSha256:h('7'),
    deterministicSeedContractSha256:h('8'),
    caseCount:20,
    qualityDimensions:[
      'SEMANTIC_ADHERENCE',
      'IDENTITY_PERSON',
      'GARMENT_LOGO_PATTERN',
      'NON_TARGET_PRESERVATION',
      'ANATOMY_ARTIFACT',
    ],
    hardPreservationDimensions:[
      'IDENTITY_PERSON',
      'GARMENT_LOGO_PATTERN',
      'NON_TARGET_PRESERVATION',
      'ANATOMY_ARTIFACT',
    ],
    maxColdLatencyUs:2_000_000,
    maxWarmLatencyUs:2_000_000,
    maxPeakHostMemoryBytes:2_000_000_000,
    maxPeakAcceleratorMemoryBytes:2_000_000_000,
    maxFlashBytesMoved:2_000_000_000,
    maxRamBytesMoved:2_000_000_000,
    maxAcceleratorBytesMoved:2_000_000_000,
    maxNetworkBytesDuringExecution:0,
    sameFixtureAcrossRows:true,
    sameSeedsAcrossRows:true,
    runtimeFallbackAllowed:false,
    reviewState:'HARDWARE_PLACEMENT_CAMPAIGN_REVIEWED',
    ...authority(),
    ...overrides,
  };
}

function quality(overrides={}){
  const values={
    ANATOMY_ARTIFACT:9800,
    GARMENT_LOGO_PATTERN:9700,
    IDENTITY_PERSON:9750,
    NON_TARGET_PRESERVATION:9650,
    SEMANTIC_ADHERENCE:9600,
    ...overrides,
  };
  return Object.keys(values).sort().map(dimension=>({
    dimension,
    valueBps:values[dimension],
  }));
}

function hard(overrides={}){
  const values={
    ANATOMY_ARTIFACT:0,
    GARMENT_LOGO_PATTERN:0,
    IDENTITY_PERSON:0,
    NON_TARGET_PRESERVATION:0,
    ...overrides,
  };
  return Object.keys(values).sort().map(dimension=>({
    dimension,
    failureCount:values[dimension],
  }));
}

function measurement(c,placement,patch={}){
  const isCpu=placement==='CPU';
  return {
    candidateId:c.candidateId,
    fleetModelId:c.fleetModelId,
    fleetVersion:c.fleetVersion,
    representationContentSha256:c.representationContentSha256,
    runtimeIdentity:c.runtimeIdentity,
    formatIdentity:c.formatIdentity,
    platformFamily:c.platformFamily,
    supportedDeviceClass:c.supportedDeviceClass,
    requestedPlacement:placement,
    actualPlacement:placement,
    runtimeFallbackUsed:false,
    qualityVector:quality(),
    hardPreservationFailureCounts:hard(),
    criticalFailureCount:0,
    coldLatencyUs:
      isCpu?1_300_000:900_000,
    warmLatencyUs:
      isCpu?1_100_000:700_000,
    activeRepresentationBytes:
      c.representationBytes-20_000_000,
    peakHostMemoryBytes:
      isCpu?1_200_000_000:900_000_000,
    peakAcceleratorMemoryBytes:
      isCpu?0:800_000_000,
    flashBytesMoved:600_000_000,
    ramBytesMoved:700_000_000,
    acceleratorBytesMoved:
      isCpu?0:650_000_000,
    networkBytesDuringExecution:0,
    measurementMethodSha256:h('9'),
    measurementEvidenceSha256:h(
      placement==='CPU'?'a':placement==='GPU'?'b':'c',
    ),
    realTargetDeviceMeasurement:true,
    ...patch,
  };
}

function fakeHost(mode='OK'){
  const calls=[];
  return {
    calls,
    async executeExactHardwarePlacementCampaign(request){
      calls.push(request);
      if(mode==='THROW'){
        throw new Error('synthetic protected placement failure');
      }
      const failed=mode==='FAILED';
      const rows=[];
      if(!failed){
        for(const c of request.roster.candidates){
          for(const placement of c.admissibleBenchmarkPlacements){
            let patch={};
            if(
              mode==='FALLBACK'
              &&c.candidateId==='apple-npu'
              &&placement==='NPU'
            ){
              patch={
                actualPlacement:'CPU',
                runtimeFallbackUsed:true,
              };
            }else if(
              mode==='IDENTITY_DRIFT'
              &&c.candidateId==='android-gpu'
              &&placement==='GPU'
            ){
              patch={representationContentSha256:h('f')};
            }else if(
              mode==='DIMENSION_DRIFT'
              &&c.candidateId==='android-gpu'
              &&placement==='GPU'
            ){
              patch={
                qualityVector:quality().filter(
                  value=>value.dimension!=='SEMANTIC_ADHERENCE',
                ),
              };
            }else if(
              mode==='ACTIVE_OVER'
              &&c.candidateId==='android-gpu'
              &&placement==='GPU'
            ){
              patch={
                activeRepresentationBytes:c.representationBytes+1,
              };
            }else if(
              mode==='RESOURCE_OVER'
              &&c.candidateId==='android-gpu'
              &&placement==='GPU'
            ){
              patch={coldLatencyUs:2_000_001};
            }
            rows.push(measurement(c,placement,patch));
          }
        }
        rows.reverse();
        if(mode==='MISSING_ROW')rows.pop();
      }

      const raw={
        schemaVersion:
          CORE_HSME_HARDWARE_PLACEMENT_RESULT_V1_SCHEMA,
        state:failed
          ?'HARDWARE_PLACEMENT_CAMPAIGN_FAILED'
          :'HARDWARE_PLACEMENT_CAMPAIGN_COMPLETED',
        hardwareRepresentationRosterSha256:
          request.hardwareRepresentationRosterSha256,
        campaignPolicySha256:request.campaignPolicySha256,
        executionAttemptId:'synthetic-placement-attempt-001',
        fixtureSetSha256:request.policy.fixtureSetSha256,
        evaluationContractSha256:
          request.policy.evaluationContractSha256,
        deterministicSeedContractSha256:
          request.policy.deterministicSeedContractSha256,
        caseCount:request.policy.caseCount,
        rows,
        processStarted:true,
        realTargetDeviceMeasurement:!failed,
        failureEvidenceSha256:failed?h('d'):'NONE',
        ...authority(),
        hostResultSha256:h('0'),
      };
      if(mode==='BAD_DIGEST'){
        return raw;
      }
      const hostResultSha256=
        await coreHsmeHardwarePlacementResultV1Digest(
          raw,
          hash,
        );
      return {...raw,hostResultSha256};
    },
  };
}

const trueRosterOrigin={
  async verifyHardwareRepresentationRoster(){return true;},
};
const falseRosterOrigin={
  async verifyHardwareRepresentationRoster(){return false;},
};
const truePolicyOrigin={
  async verifyHardwarePlacementCampaignPolicy(){return true;},
};
const falsePolicyOrigin={
  async verifyHardwarePlacementCampaignPolicy(){return false;},
};
const trueResultOrigin={
  async verifyHardwarePlacementResult(){return true;},
};
const falseResultOrigin={
  async verifyHardwarePlacementResult(){return false;},
};

async function fixture(){
  const r=await roster();
  const policy=rawPolicy(r);
  const policySha=
    await hsmeHardwarePlacementCampaignPolicyV1Digest(
      policy,
      hash,
    );
  return {r,policy,policySha};
}

async function collect(f,host=fakeHost(),overrides={}){
  const selectedRoster=overrides.roster??f.r;
  return collectHsmeHardwarePlacementMatrixV1(
    selectedRoster,
    overrides.rosterSha??selectedRoster.rosterEvidenceSha256,
    overrides.rosterOrigin??trueRosterOrigin,
    overrides.policy??f.policy,
    overrides.policySha??f.policySha,
    overrides.policyOrigin??truePolicyOrigin,
    host,
    overrides.resultOrigin??trueResultOrigin,
    hash,
  );
}

test('exact candidate-placement cartesian set yields canonical READY matrix',async()=>{
  const f=await fixture();
  const host=fakeHost();
  const matrix=await collect(f,host);

  assert.equal(
    matrix.state,
    'HARDWARE_PLACEMENT_MATRIX_READY_NOT_DISPOSED',
  );
  assert.deepEqual(matrix.blockers,[]);
  assert.deepEqual(
    matrix.rows.map(
      value=>value.candidateId+':'+value.requestedPlacement,
    ),
    [
      'android-gpu:CPU',
      'android-gpu:GPU',
      'apple-npu:CPU',
      'apple-npu:NPU',
    ],
  );
  assert.equal(
    matrix.rows.every(
      value=>
        value.actualPlacement===value.requestedPlacement
        &&value.runtimeFallbackUsed===false,
    ),
    true,
  );
  assert.equal(matrix.selectionAllowed,false);
  assert.equal(matrix.benchmarkExecutionAllowed,false);
  assert.equal(matrix.modelInstallAllowed,false);
  assert.equal(host.calls.length,1);
  assert.equal(Object.hasOwn(host.calls[0],'command'),false);
  assert.equal(Object.hasOwn(host.calls[0],'argv'),false);
  assert.equal(Object.hasOwn(host.calls[0],'providerId'),false);
  assert.equal(
    await hsmeHardwarePlacementMatrixV1Digest(matrix,hash),
    matrix.matrixEvidenceSha256,
  );
});

test('roster policy and host-result origins are independently mandatory',async()=>{
  const f=await fixture();

  const a=await collect(f,fakeHost(),{
    rosterOrigin:falseRosterOrigin,
  });
  assert.equal(a.state,'HARDWARE_PLACEMENT_MATRIX_INVALID');
  assert.ok(
    a.blockers.includes(
      'HARDWARE_PLACEMENT_ROSTER_ORIGIN_UNVERIFIED',
    ),
  );

  const b=await collect(f,fakeHost(),{
    policyOrigin:falsePolicyOrigin,
  });
  assert.equal(b.state,'HARDWARE_PLACEMENT_MATRIX_INVALID');
  assert.ok(
    b.blockers.includes(
      'HARDWARE_PLACEMENT_CAMPAIGN_POLICY_ORIGIN_UNVERIFIED',
    ),
  );

  const c=await collect(f,fakeHost(),{
    resultOrigin:falseResultOrigin,
  });
  assert.equal(c.state,'HARDWARE_PLACEMENT_MATRIX_INVALID');
  assert.ok(
    c.blockers.includes(
      'HARDWARE_PLACEMENT_HOST_RESULT_ORIGIN_UNVERIFIED',
    ),
  );
});

test('silent CPU fallback cannot satisfy an NPU placement row',async()=>{
  const f=await fixture();
  const result=await collect(f,fakeHost('FALLBACK'));

  assert.equal(result.state,'HARDWARE_PLACEMENT_MATRIX_INVALID');
  assert.ok(
    result.blockers.includes(
      'HARDWARE_PLACEMENT_RUNTIME_FALLBACK_INVALID',
    ),
  );
});

test('every placement row must bind the exact frozen fleet representation',async()=>{
  const f=await fixture();
  const result=await collect(f,fakeHost('IDENTITY_DRIFT'));

  assert.equal(result.state,'HARDWARE_PLACEMENT_MATRIX_INVALID');
  assert.ok(
    result.blockers.includes(
      'HARDWARE_PLACEMENT_REPRESENTATION_BINDING_MISMATCH',
    ),
  );
});

test('completed campaign requires the exact candidate-placement row set',async()=>{
  const f=await fixture();
  const result=await collect(f,fakeHost('MISSING_ROW'));

  assert.equal(result.state,'HARDWARE_PLACEMENT_MATRIX_INVALID');
  assert.ok(
    result.blockers.includes(
      'HARDWARE_PLACEMENT_ROW_SET_INVALID',
    ),
  );
});

test('quality and hard-preservation dimensions are exact',async()=>{
  const f=await fixture();
  const result=await collect(f,fakeHost('DIMENSION_DRIFT'));

  assert.equal(result.state,'HARDWARE_PLACEMENT_MATRIX_INVALID');
  assert.ok(
    result.blockers.includes(
      'HARDWARE_PLACEMENT_QUALITY_DIMENSION_MISMATCH',
    ),
  );
});

test('active representation bytes cannot exceed immutable representation bytes',async()=>{
  const f=await fixture();
  const result=await collect(f,fakeHost('ACTIVE_OVER'));

  assert.equal(result.state,'HARDWARE_PLACEMENT_MATRIX_INVALID');
  assert.ok(
    result.blockers.includes(
      'HARDWARE_PLACEMENT_ACTIVE_BYTES_EXCEED_REPRESENTATION',
    ),
  );
});

test('latency memory and bytes-moved ceilings fail before READY',async()=>{
  const f=await fixture();
  const result=await collect(f,fakeHost('RESOURCE_OVER'));

  assert.equal(result.state,'HARDWARE_PLACEMENT_MATRIX_INVALID');
  assert.ok(
    result.blockers.includes(
      'HARDWARE_PLACEMENT_RESOURCE_CEILING_EXCEEDED',
    ),
  );
});

test('failed protected campaign returns FAILED without matrix digest',async()=>{
  const f=await fixture();
  const result=await collect(f,fakeHost('FAILED'));

  assert.equal(result.state,'HARDWARE_PLACEMENT_MATRIX_FAILED');
  assert.equal(result.rows.length,0);
  assert.equal(result.matrixEvidenceSha256,'UNKNOWN');
});

test('host digest drift and thrown execution fail closed distinctly',async()=>{
  const f=await fixture();

  const bad=await collect(f,fakeHost('BAD_DIGEST'));
  assert.equal(bad.state,'HARDWARE_PLACEMENT_MATRIX_INVALID');
  assert.ok(
    bad.blockers.includes(
      'HARDWARE_PLACEMENT_HOST_RESULT_REHASH_MISMATCH',
    ),
  );

  const thrown=await collect(f,fakeHost('THROW'));
  assert.equal(thrown.state,'HARDWARE_PLACEMENT_MATRIX_FAILED');
  assert.ok(
    thrown.blockers.includes(
      'HARDWARE_PLACEMENT_HOST_EXECUTION_FAILED',
    ),
  );
});

test('campaign policy cannot enable fallback network authority or post-hoc fields',async()=>{
  const f=await fixture();

  for(const policy of [
    {...f.policy,runtimeFallbackAllowed:true},
    {...f.policy,maxNetworkBytesDuringExecution:1},
    {...f.policy,selectionAllowed:true},
    {...f.policy,weightedPlacementScore:{latency:0.5,quality:0.5}},
  ]){
    const result=await collect(f,fakeHost(),{
      policy,
      policySha:h('0'),
    });
    assert.equal(result.state,'HARDWARE_PLACEMENT_MATRIX_INVALID');
    assert.ok(
      result.blockers.includes(
        'HARDWARE_PLACEMENT_CAMPAIGN_POLICY_INVALID',
      ),
    );
  }
});
