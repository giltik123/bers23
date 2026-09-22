import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_FOUNDATION_PHYSICAL_TARGET_EVIDENCE_BINDING_DIGEST_DOMAIN,
  HSME_FOUNDATION_PHYSICAL_TARGET_EVIDENCE_BINDING_V1_SCHEMA,
  HSME_FOUNDATION_TARGET_DEVICE_ADAPTED_EVIDENCE_DIGEST_DOMAIN,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationPhysicalTargetEvidenceBindingV1.ts';
import {
  HSME_FOUNDATION_PHYSICAL_REUSE_COMPONENT_MAP_V1_SCHEMA,
  proveHsmeFoundationPhysicalReuseRuntimeOverlayV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationPhysicalReuseRuntimeOverlayV1.ts';

const H=value=>createHash('sha256').update(value).digest('hex');
const hashPort={sha256:async bytes=>createHash('sha256').update(bytes).digest('hex')};
const CANDIDATE='flux2-klein-4b-distilled-v1';
const CAPABILITY='IMAGE_EDITING';

function defaultArtifacts(){
  return [
    {relativePath:'runtime/a.bin',bytes:100,contentSha256:H('a')},
    {relativePath:'runtime/b.bin',bytes:20,contentSha256:H('b')},
    {relativePath:'runtime/c.bin',bytes:30,contentSha256:H('c')},
    {relativePath:'runtime/d.bin',bytes:10,contentSha256:H('d')},
    {relativePath:'runtime/e.bin',bytes:5,contentSha256:H('e')},
  ];
}

function inventory(artifacts=defaultArtifacts()){
  return {
    schemaVersion:'BERS_HSME_FOUNDATION_RUNTIME_INVENTORY_V1',
    candidateId:CANDIDATE,
    immutableRevision:'b'.repeat(40),
    complete:true,
    artifacts,
  };
}

function targetEvidence(artifacts=defaultArtifacts(),overrides={}){
  return {
    candidateId:CANDIDATE,
    capability:CAPABILITY,
    targetTier:'MOBILE_DEFAULT',
    sourceModelContentSha256:H('source-model'),
    sourceExecutionProfileSha256:H('source-execution-profile'),
    representationKind:'TARGET_SPECIFIC_REPRESENTATION',
    representationContentSha256:H('target-representation'),
    representationEvidenceSha256:H('representation-proof'),
    runtimeInventory:inventory(artifacts),
    targetRuntimeProfileSha256:H('target-runtime-profile'),
    targetHardwareClass:'MOBILE_TARGET_DEVICE',
    workingMemoryKind:'TARGET_PEAK_WORKING_SET_BYTES',
    peakWorkingMemoryBytes:300_000_000,
    coldEndToEndLatencyMicros:10_000,
    warmEndToEndLatencyMicros:5_000,
    hardwareProfileSha256:H('hardware-profile'),
    measurementMethodSha256:H('measurement-method'),
    measurementEvidenceSha256:H('measurement-evidence'),
    budgetPolicySha256:H('budget-policy'),
    productionAuthorityGranted:false,
    winnerSelectionAllowed:false,
    ...overrides,
  };
}

function binding({artifacts=defaultArtifacts(),targetOverrides={},bindingOverrides={}}={}){
  const target=targetEvidence(artifacts,targetOverrides);
  const targetEvidenceSha256=H(
    HSME_FOUNDATION_TARGET_DEVICE_ADAPTED_EVIDENCE_DIGEST_DOMAIN+
    JSON.stringify(target),
  );
  const values={
    schemaVersion:HSME_FOUNDATION_PHYSICAL_TARGET_EVIDENCE_BINDING_V1_SCHEMA,
    candidateId:CANDIDATE,
    capability:CAPABILITY,
    deviceCapabilityKey:H('device-capability'),
    benchmarkEvidenceKey:'device='+H('device-capability')+'|model=x@1|sha256='+H('model')+'|runtime=ONNX_RUNTIME|provider=wasm',
    measurementCaptureSha256:H('measurement-capture'),
    targetEvidenceSha256,
    physicalRunPayloadSha256:H('physical-run-payload'),
  };
  const physicalTargetBindingSha256=H(
    HSME_FOUNDATION_PHYSICAL_TARGET_EVIDENCE_BINDING_DIGEST_DOMAIN+
    JSON.stringify({
      schemaVersion:HSME_FOUNDATION_PHYSICAL_TARGET_EVIDENCE_BINDING_V1_SCHEMA,
      candidateId:values.candidateId,
      capability:values.capability,
      deviceCapabilityKey:values.deviceCapabilityKey,
      benchmarkEvidenceKey:values.benchmarkEvidenceKey,
      measurementCaptureSha256:values.measurementCaptureSha256,
      targetEvidenceSha256:values.targetEvidenceSha256,
      physicalRunPayloadSha256:values.physicalRunPayloadSha256,
      selectedCandidateIdAllowed:false,
      reuseAdvanceAllowed:false,
      fullStudentEscalationAllowed:false,
      productionAuthorityGranted:false,
      winnerSelectionAllowed:false,
    }),
  );
  return {
    ...values,
    state:'PHYSICAL_TARGET_EVIDENCE_READY',
    blockers:[],
    physicalTargetBindingSha256,
    targetEvidence:target,
    selectedCandidateIdAllowed:false,
    reuseAdvanceAllowed:false,
    fullStudentEscalationAllowed:false,
    modelFleetPromotionAllowed:false,
    installOrDownloadAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    durableModelFleetPromotionAllowed:false,
    trainingOrDistillationAllowed:false,
    winnerSelectionAllowed:false,
    ...bindingOverrides,
  };
}

function componentMap(artifacts=defaultArtifacts(),roles=[
  'BACKBONE','CONDITIONER','VAE','ADAPTER','OTHER_REQUIRED',
]){
  return {
    schemaVersion:HSME_FOUNDATION_PHYSICAL_REUSE_COMPONENT_MAP_V1_SCHEMA,
    candidateId:CANDIDATE,
    capability:CAPABILITY,
    entries:artifacts.map((artifact,index)=>({
      ...artifact,
      role:roles[index]??'OTHER_REQUIRED',
    })),
    productionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
}

async function prove(b,map=componentMap(b.targetEvidence.runtimeInventory.artifacts),expected=b.physicalTargetBindingSha256){
  return proveHsmeFoundationPhysicalReuseRuntimeOverlayV1(
    b,CANDIDATE,CAPABILITY,map,expected,hashPort,
  );
}

for(const label of ['ANDROID','IOS']){
  test(label+' trusted physical target proof produces resource-only MOBILE_DEFAULT overlay',async()=>{
    const b=binding();
    const result=await prove(b);
    assert.equal(result.state,'PHYSICAL_RUNTIME_EVIDENCE_READY');
    assert.deepEqual(result.blockers,[]);
    assert.equal(result.targetTier,'MOBILE_DEFAULT');
    assert.equal(result.backboneBytes,100);
    assert.equal(result.conditionerBytes,20);
    assert.equal(result.vaeBytes,30);
    assert.equal(result.adapterBytes,10);
    assert.equal(result.otherRequiredBytes,5);
    assert.equal(result.mandatoryInstalledBytes,165);
    assert.equal(result.workingMemoryBytes,300_000_000);
    assert.match(result.componentMapSha256,/^[0-9a-f]{64}$/);
    assert.match(result.runtimeEvidenceSha256,/^[0-9a-f]{64}$/);
    assert.equal(result.physicalTargetBindingSha256,b.physicalTargetBindingSha256);
    assert.equal(result.targetEvidenceSha256,b.targetEvidenceSha256);
    assert.equal(result.sourceExecutionProfileSha256,b.targetEvidence.sourceExecutionProfileSha256);
    for(const field of [
      'selectedCandidateIdAllowed','reuseAdvanceAllowed','fullStudentEscalationAllowed',
      'modelFleetPromotionAllowed','installOrDownloadAllowed','productionAuthorityGranted',
      'providerAuthorityGranted','billingAuthorityGranted','projectArtifactMutationAllowed',
      'aeeExecutionAuthorityGranted','durableModelFleetPromotionAllowed',
      'trainingOrDistillationAllowed','winnerSelectionAllowed','licenseMutationAllowed',
      'qualityMutationAllowed','trainingEvidenceMutationAllowed','decisionMutationAllowed',
    ]) assert.equal(result[field],false,field);
    for(const forbidden of [
      'licenseConclusion','licenseEvidenceSha256','quality','training','evidenceState',
      'selectedCandidateId','decisionStatus','strategy',
    ]) assert.equal(forbidden in result,false,forbidden);
  });
}

test('component roles come only from explicit map, never from misleading filenames',async()=>{
  const artifacts=[
    {relativePath:'runtime/00-looks-like-vae.safetensors',bytes:70,contentSha256:H('misleading-a')},
    {relativePath:'runtime/01-backbone-name.onnx',bytes:30,contentSha256:H('misleading-b')},
  ];
  const b=binding({artifacts});
  const map=componentMap(artifacts,['BACKBONE','VAE']);
  const result=await prove(b,map);
  assert.equal(result.state,'PHYSICAL_RUNTIME_EVIDENCE_READY');
  assert.equal(result.backboneBytes,70);
  assert.equal(result.vaeBytes,30);
  assert.equal(result.conditionerBytes,0);
  assert.equal(result.mandatoryInstalledBytes,100);
});

test('multiple entries may share a role and their bytes sum exactly',async()=>{
  const artifacts=[
    {relativePath:'runtime/a.bin',bytes:40,contentSha256:H('multi-a')},
    {relativePath:'runtime/b.bin',bytes:60,contentSha256:H('multi-b')},
    {relativePath:'runtime/c.bin',bytes:5,contentSha256:H('multi-c')},
  ];
  const b=binding({artifacts});
  const result=await prove(b,componentMap(artifacts,['BACKBONE','BACKBONE','OTHER_REQUIRED']));
  assert.equal(result.state,'PHYSICAL_RUNTIME_EVIDENCE_READY');
  assert.equal(result.backboneBytes,100);
  assert.equal(result.otherRequiredBytes,5);
  assert.equal(result.mandatoryInstalledBytes,105);
});

test('missing, duplicate and extra component-map entries fail closed',async()=>{
  const b=binding();

  const missing=structuredClone(componentMap());
  missing.entries.pop();
  let result=await prove(b,missing);
  assert.equal(result.state,'PHYSICAL_RUNTIME_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('COMPONENT_MAP_INVENTORY_COUNT_MISMATCH'));
  assert.ok(result.blockers.includes('COMPONENT_MAP_ARTIFACT_MISSING'));

  const duplicate=structuredClone(componentMap());
  duplicate.entries[1].relativePath=duplicate.entries[0].relativePath;
  result=await prove(b,duplicate);
  assert.equal(result.state,'PHYSICAL_RUNTIME_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('COMPONENT_MAP_DUPLICATE_PATH'));

  const extra=structuredClone(componentMap());
  extra.entries.push({
    relativePath:'runtime/z.bin',
    bytes:1,
    contentSha256:H('extra'),
    role:'OTHER_REQUIRED',
  });
  result=await prove(b,extra);
  assert.equal(result.state,'PHYSICAL_RUNTIME_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('COMPONENT_MAP_INVENTORY_COUNT_MISMATCH'));
  assert.ok(result.blockers.includes('COMPONENT_MAP_EXTRA_ARTIFACT'));
});

test('path, hash, byte and role drift all fail closed',async()=>{
  const b=binding();
  const cases=[
    ['COMPONENT_MAP_PATH_DRIFT',map=>{map.entries[1].relativePath='runtime/bb.bin';}],
    ['COMPONENT_MAP_HASH_DRIFT',map=>{map.entries[1].contentSha256=H('wrong-hash');}],
    ['COMPONENT_MAP_BYTES_DRIFT',map=>{map.entries[1].bytes+=1;}],
    ['COMPONENT_MAP_ROLE_INVALID',map=>{map.entries[1].role='INFERRED_FROM_FILENAME';}],
  ];
  for(const [blocker,mutate] of cases){
    const map=structuredClone(componentMap());
    mutate(map);
    const result=await prove(b,map);
    assert.equal(result.state,'PHYSICAL_RUNTIME_EVIDENCE_INVALID',blocker);
    assert.ok(result.blockers.includes(blocker),JSON.stringify(result.blockers));
  }
});

test('component map must preserve canonical runtime inventory order',async()=>{
  const b=binding();
  const map=structuredClone(componentMap());
  [map.entries[0],map.entries[1]]=[map.entries[1],map.entries[0]];
  const result=await prove(b,map);
  assert.equal(result.state,'PHYSICAL_RUNTIME_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('COMPONENT_MAP_ORDER_INVALID'));
});

test('zero-byte runtime artifacts cannot hide required content',async()=>{
  const artifacts=[
    {relativePath:'runtime/a.bin',bytes:0,contentSha256:H('zero-a')},
    {relativePath:'runtime/b.bin',bytes:1,contentSha256:H('zero-b')},
  ];
  const b=binding({artifacts});
  const result=await prove(b,componentMap(artifacts,['BACKBONE','OTHER_REQUIRED']));
  assert.equal(result.state,'PHYSICAL_RUNTIME_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('COMPONENT_MAP_BYTES_INVALID')
    ||result.blockers.includes('RUNTIME_INVENTORY_ZERO_BYTE_ARTIFACT')
    ||result.blockers.includes('RUNTIME_INVENTORY_BYTES_INVALID'));
});

test('safe-integer overflow in component or inventory totals fails closed',async()=>{
  const artifacts=[
    {relativePath:'runtime/a.bin',bytes:Number.MAX_SAFE_INTEGER,contentSha256:H('overflow-a')},
    {relativePath:'runtime/b.bin',bytes:Number.MAX_SAFE_INTEGER,contentSha256:H('overflow-b')},
  ];
  const b=binding({artifacts});
  const result=await prove(b,componentMap(artifacts,['BACKBONE','OTHER_REQUIRED']));
  assert.equal(result.state,'PHYSICAL_RUNTIME_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('COMPONENT_MAP_BYTE_SUM_OVERFLOW'));
  assert.ok(result.blockers.includes('RUNTIME_INVENTORY_BYTE_SUM_OVERFLOW'));
});

test('#647 proof state and externally pinned binding digest are both mandatory',async()=>{
  const ready=binding();
  const notReady={...ready,state:'PHYSICAL_TARGET_EVIDENCE_INVALID'};
  let result=await prove(notReady);
  assert.equal(result.state,'PHYSICAL_RUNTIME_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('PHYSICAL_TARGET_EVIDENCE_NOT_READY'));

  result=await prove(ready,componentMap(),H('other-binding'));
  assert.equal(result.state,'PHYSICAL_RUNTIME_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('PHYSICAL_TARGET_BINDING_DIGEST_DRIFT'));
});

test('physical binding is independently rehashed before overlay readiness',async()=>{
  const b=binding();
  const tampered={...b,measurementCaptureSha256:H('other-capture')};
  const result=await prove(tampered);
  assert.equal(result.state,'PHYSICAL_RUNTIME_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('PHYSICAL_TARGET_BINDING_REHASH_MISMATCH'));
});

test('target evidence is independently rehashed before role accounting is accepted',async()=>{
  const b=binding();
  const tampered=structuredClone(b);
  tampered.targetEvidence.peakWorkingMemoryBytes+=1;
  const result=await prove(tampered);
  assert.equal(result.state,'PHYSICAL_RUNTIME_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('TARGET_EVIDENCE_REHASH_MISMATCH'));
});

test('caller candidate and capability cannot fall back to another proof',async()=>{
  const b=binding();
  let result=await proveHsmeFoundationPhysicalReuseRuntimeOverlayV1(
    b,'other-candidate',CAPABILITY,componentMap(),b.physicalTargetBindingSha256,hashPort,
  );
  assert.equal(result.state,'PHYSICAL_RUNTIME_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('PHYSICAL_TARGET_CANDIDATE_DRIFT'));

  result=await proveHsmeFoundationPhysicalReuseRuntimeOverlayV1(
    b,CANDIDATE,'TEXT_TO_IMAGE',componentMap(),b.physicalTargetBindingSha256,hashPort,
  );
  assert.equal(result.state,'PHYSICAL_RUNTIME_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('PHYSICAL_TARGET_CAPABILITY_DRIFT'));
});

test('component role changes alter both component-map and runtime-evidence digests',async()=>{
  const b=binding();
  const first=await prove(b,componentMap());
  const second=await prove(b,componentMap(defaultArtifacts(),[
    'OTHER_REQUIRED','CONDITIONER','VAE','ADAPTER','BACKBONE',
  ]));
  assert.equal(first.state,'PHYSICAL_RUNTIME_EVIDENCE_READY');
  assert.equal(second.state,'PHYSICAL_RUNTIME_EVIDENCE_READY');
  assert.notEqual(first.componentMapSha256,second.componentMapSha256);
  assert.notEqual(first.runtimeEvidenceSha256,second.runtimeEvidenceSha256);
  assert.equal(first.mandatoryInstalledBytes,second.mandatoryInstalledBytes);
  assert.equal(first.workingMemoryBytes,second.workingMemoryBytes);
});
