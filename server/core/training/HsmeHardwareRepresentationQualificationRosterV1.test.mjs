import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_HARDWARE_REPRESENTATION_SET_V1_SCHEMA,
  freezeHsmeHardwareRepresentationQualificationRosterV1,
  hsmeHardwareRepresentationQualificationRosterV1Digest,
  hsmeHardwareRepresentationSetV1Digest,
} from './HsmeHardwareRepresentationQualificationRosterV1.ts';

const hash={
  async sha256(bytes){
    return createHash('sha256').update(bytes).digest('hex');
  },
};

function h(ch){return ch.repeat(64);}

function authority(){
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

function candidate(
  id,
  platformFamily,
  hardwareBackend,
  ch,
  overrides={},
){
  return {
    candidateId:id,
    logicalModelFamily:'bers-hsme-mobile-v1',
    sourceModelContentSha256:h('1'),
    fleetModelId:'bers-hsme-'+id,
    fleetVersion:'1.0.0',
    representationContentSha256:h(ch),
    representationManifestSha256:h(
      ch==='a'?'c':'d',
    ),
    representationBytes:
      platformFamily==='APPLE'?750_000_000:780_000_000,
    runtimeIdentity:
      platformFamily==='APPLE'
        ?'coreml-metal-ane-v1'
        :'litert-qnn-hexagon-v1',
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
    admissibleBenchmarkPlacements:
      hardwareBackend==='NPU'
        ?['NPU','CPU']
        :['GPU','CPU'],
    runtimeCapabilityEvidenceSha256:h(
      ch==='a'?'e':'f',
    ),
    licenseProvenanceEvidenceSha256:h('2'),
    immutableFleetManifestEvidenceSha256:h(
      ch==='a'?'3':'4',
    ),
    representationReadyForBenchmark:true,
    ...overrides,
  };
}

function rawSet(overrides={}){
  return {
    schemaVersion:HSME_HARDWARE_REPRESENTATION_SET_V1_SCHEMA,
    candidates:[
      candidate('android-npu','ANDROID','NPU','b'),
      candidate('apple-npu','APPLE','NPU','a'),
    ],
    reviewedBeforeBenchmark:true,
    ...authority(),
    ...overrides,
  };
}

const trueOrigin={
  async verifyHardwareRepresentationSet(){return true;},
};
const falseOrigin={
  async verifyHardwareRepresentationSet(){return false;},
};

async function fixture(){
  const set=rawSet();
  const setSha=await hsmeHardwareRepresentationSetV1Digest(
    set,
    hash,
  );
  return {set,setSha};
}

async function freeze(f,overrides={}){
  return freezeHsmeHardwareRepresentationQualificationRosterV1(
    overrides.set??f.set,
    overrides.setSha??f.setSha,
    overrides.origin??trueOrigin,
    hash,
  );
}

test('reviewed mobile representations freeze deterministically in canonical order',async()=>{
  const f=await fixture();
  const first=await freeze(f);

  const reversed={
    ...f.set,
    candidates:[...f.set.candidates].reverse().map(value=>({
      ...value,
      admissibleBenchmarkPlacements:
        [...value.admissibleBenchmarkPlacements].reverse(),
    })),
  };
  const reversedSha=
    await hsmeHardwareRepresentationSetV1Digest(reversed,hash);
  const second=await freeze(f,{
    set:reversed,
    setSha:reversedSha,
  });

  assert.equal(
    first.state,
    'HARDWARE_REPRESENTATION_ROSTER_FROZEN_NOT_EXECUTED',
  );
  assert.deepEqual(first.blockers,[]);
  assert.deepEqual(
    first.candidates.map(value=>value.candidateId),
    ['android-npu','apple-npu'],
  );
  assert.deepEqual(
    first.candidates[0].admissibleBenchmarkPlacements,
    ['CPU','NPU'],
  );
  assert.deepEqual(
    first.candidates[1].admissibleBenchmarkPlacements,
    ['CPU','NPU'],
  );
  assert.equal(first.modelInstallAllowed,false);
  assert.equal(first.durableModelFleetPromotionAllowed,false);
  assert.equal(first.benchmarkExecutionAllowed,false);
  assert.deepEqual(first,second);
  assert.equal(
    await hsmeHardwareRepresentationQualificationRosterV1Digest(
      first,
      hash,
    ),
    first.rosterEvidenceSha256,
  );
});

test('reviewed representation-set origin is mandatory',async()=>{
  const f=await fixture();
  const result=await freeze(f,{origin:falseOrigin});

  assert.equal(
    result.state,
    'HARDWARE_REPRESENTATION_ROSTER_INVALID',
  );
  assert.ok(
    result.blockers.includes(
      'HARDWARE_REPRESENTATION_SET_ORIGIN_UNVERIFIED',
    ),
  );
});

test('one fleet modelId@version cannot represent multiple hardware binaries',async()=>{
  const f=await fixture();
  const set=rawSet({
    candidates:[
      candidate('apple-npu','APPLE','NPU','a'),
      candidate('android-npu','ANDROID','NPU','b',{
        fleetModelId:'bers-hsme-apple-npu',
        fleetVersion:'1.0.0',
      }),
    ],
  });
  const result=await freeze(f,{
    set,
    setSha:h('0'),
  });

  assert.equal(
    result.state,
    'HARDWARE_REPRESENTATION_ROSTER_INVALID',
  );
  assert.ok(
    result.blockers.includes('HARDWARE_REPRESENTATION_SET_INVALID'),
  );
});

test('same representation content hash cannot masquerade as conflicting fleet identities',async()=>{
  const f=await fixture();
  const set=rawSet({
    candidates:[
      candidate('apple-npu','APPLE','NPU','a'),
      candidate('android-npu','ANDROID','NPU','a',{
        fleetModelId:'bers-hsme-android-npu',
      }),
    ],
  });
  const result=await freeze(f,{
    set,
    setSha:h('0'),
  });

  assert.equal(
    result.state,
    'HARDWARE_REPRESENTATION_ROSTER_INVALID',
  );
  assert.ok(
    result.blockers.includes('HARDWARE_REPRESENTATION_SET_INVALID'),
  );
});

test('primary backend must be explicitly inside the reviewed benchmark placement scope',async()=>{
  const f=await fixture();
  const set=rawSet({
    candidates:[
      candidate('apple-npu','APPLE','NPU','a',{
        admissibleBenchmarkPlacements:['CPU','GPU'],
      }),
      candidate('android-npu','ANDROID','NPU','b'),
    ],
  });
  const result=await freeze(f,{
    set,
    setSha:h('0'),
  });

  assert.equal(
    result.state,
    'HARDWARE_REPRESENTATION_ROSTER_INVALID',
  );
  assert.ok(
    result.blockers.includes('HARDWARE_REPRESENTATION_SET_INVALID'),
  );
});

test('canonical qualification roster rejects non-mobile platform families',async()=>{
  const f=await fixture();
  const set=rawSet({
    candidates:[
      candidate('apple-npu','APPLE','NPU','a'),
      candidate('browser-gpu','ANDROID','GPU','b',{
        platformFamily:'BROWSER',
      }),
    ],
  });
  const result=await freeze(f,{
    set,
    setSha:h('0'),
  });

  assert.equal(
    result.state,
    'HARDWARE_REPRESENTATION_ROSTER_INVALID',
  );
  assert.ok(
    result.blockers.includes('HARDWARE_REPRESENTATION_SET_INVALID'),
  );
});

test('unsafe representation bytes fail exact numeric admission',async()=>{
  const f=await fixture();
  for(const representationBytes of [
    0,
    -1,
    Number.MAX_SAFE_INTEGER+1,
    1.25,
  ]){
    const set=rawSet({
      candidates:[
        candidate('apple-npu','APPLE','NPU','a',{
          representationBytes,
        }),
        candidate('android-npu','ANDROID','NPU','b'),
      ],
    });
    const result=await freeze(f,{
      set,
      setSha:h('0'),
    });
    assert.equal(
      result.state,
      'HARDWARE_REPRESENTATION_ROSTER_INVALID',
    );
    assert.ok(
      result.blockers.includes('HARDWARE_REPRESENTATION_SET_INVALID'),
    );
  }
});

test('mutable URI unknown fields and authority widening fail exact schema',async()=>{
  const f=await fixture();

  for(const set of [
    {...f.set,modelInstallAllowed:true},
    {...f.set,providerAuthorityGranted:true},
    {
      ...f.set,
      candidates:f.set.candidates.map((value,index)=>
        index===0
          ?{...value,downloadUri:'https://mutable.example/model.bin'}
          :value
      ),
    },
  ]){
    const result=await freeze(f,{
      set,
      setSha:h('0'),
    });
    assert.equal(
      result.state,
      'HARDWARE_REPRESENTATION_ROSTER_INVALID',
    );
    assert.ok(
      result.blockers.includes('HARDWARE_REPRESENTATION_SET_INVALID'),
    );
  }
});
