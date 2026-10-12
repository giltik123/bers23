import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

import {
  HSME_TEACHER_ACQUISITION_PROOF_V1_SCHEMA,
  proveHsmeTeacherAcquisitionV1,
} from '../src/platform/creative/local-ai/hsme/HsmeTeacherAcquisitionProofV1.ts';

const expander=new URL('../scripts/expand-hsme-teacher-acquisition-plan.py',import.meta.url).pathname;
const inspector=new URL('../scripts/inspect-hsme-teacher-snapshot.py',import.meta.url).pathname;
const pinRequestsPath=new URL(
  '../src/platform/creative/local-ai/hsme/hsme-teacher-acquisition-pin-requests.v1.json',
  import.meta.url,
).pathname;
const hashPort={sha256:async bytes=>createHash('sha256').update(bytes).digest('hex')};

function run(script,args){
  const result=spawnSync('python3',[script,...args],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
}

async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'hsme-teacher-acquisition-proof-'));
  const materialized=join(root,'materialized');
  const snapshot=join(materialized,'qwen2512');
  for(const dir of ['scheduler','text_encoder','tokenizer','transformer','vae']){
    await mkdir(join(snapshot,dir),{recursive:true});
  }
  await writeFile(join(snapshot,'model_index.json'),'{"_class_name":"QwenImagePipeline"}\n');
  await writeFile(join(snapshot,'scheduler','scheduler_config.json'),'{"name":"fixture"}\n');
  await writeFile(join(snapshot,'text_encoder','config.json'),'{"hidden":1}\n');
  await writeFile(join(snapshot,'text_encoder','model.safetensors'),Buffer.from('text-weights'));
  await writeFile(join(snapshot,'tokenizer','tokenizer.json'),'{"tokenizer":"fixture"}\n');
  await writeFile(join(snapshot,'tokenizer','merges.txt'),'a b\n');
  await writeFile(join(snapshot,'transformer','config.json'),'{"layers":1}\n');
  await writeFile(join(snapshot,'transformer','diffusion_pytorch_model.safetensors'),Buffer.from('denoiser-weights'));
  await writeFile(join(snapshot,'vae','config.json'),'{"vae":1}\n');
  await writeFile(join(snapshot,'vae','diffusion_pytorch_model.safetensors'),Buffer.from('vae-weights'));

  const planPath=join(root,'plan.json');
  const expansionPath=join(root,'expansion.json');
  const manifestPath=join(root,'manifest.json');
  const acquisitionPath=join(root,'acquisition.json');

  run(expander,[
    '--pin-requests',pinRequestsPath,
    '--candidate-id','qwen-image-2512-quality-teacher',
    '--materialized-root',materialized,
    '--materialized-subdir','qwen2512',
    '--plan-output',planPath,
    '--evidence-output',expansionPath,
  ]);
  run(inspector,[
    '--plan',planPath,
    '--materialized-root',materialized,
    '--manifest-output',manifestPath,
    '--evidence-output',acquisitionPath,
  ]);

  return {
    pinRequests:JSON.parse(await readFile(pinRequestsPath,'utf8')),
    plan:JSON.parse(await readFile(planPath,'utf8')),
    expansion:JSON.parse(await readFile(expansionPath,'utf8')),
    manifest:JSON.parse(await readFile(manifestPath,'utf8')),
    acquisition:JSON.parse(await readFile(acquisitionPath,'utf8')),
  };
}

function origin({expansion=true,acquisition=true}={}){
  const calls=[];
  return {
    calls,
    async verifyPlanExpansionEvidence(value,digest){
      calls.push({kind:'expansion',value,digest});
      return expansion;
    },
    async verifyByteAcquisitionEvidence(value,digest){
      calls.push({kind:'acquisition',value,digest});
      return acquisition;
    },
  };
}

test('real expander+inspector outputs bind into one non-authoritative acquisition proof',async()=>{
  const f=await fixture();
  const verifier=origin();
  const proof=await proveHsmeTeacherAcquisitionV1(
    f.pinRequests,f.plan,f.expansion,f.manifest,f.acquisition,verifier,hashPort,
  );
  assert.equal(proof.schemaVersion,HSME_TEACHER_ACQUISITION_PROOF_V1_SCHEMA);
  assert.equal(proof.state,'ACQUISITION_EVIDENCE_READY');
  assert.deepEqual(proof.blockers,[]);
  assert.equal(proof.teacherCandidateId,'qwen-image-2512-quality-teacher');
  assert.equal(proof.source.immutableRevision,'25468b98e3276ca6700de15c6628e51b7de54a26');
  for(const field of [
    'pinRequestSetSha256','planSha256','planExpansionEvidenceSha256',
    'manifestSha256','byteAcquisitionEvidenceSha256','acquisitionProofSha256',
  ]) assert.match(proof[field],/^[0-9a-f]{64}$/,field);
  assert.equal(proof.artifactCount,f.plan.artifacts.length);
  assert.equal(proof.sourceCount,1);
  assert.equal(proof.rightsConclusion,'REVIEW_REQUIRED');
  assert.equal(proof.distillationOutputUse,'REVIEW_REQUIRED');
  assert.equal(proof.qualityGateStatus,'UNMEASURED');
  assert.equal(proof.teacherAdmissionAllowed,false);
  assert.equal(proof.trainingStartAllowed,false);
  assert.equal(proof.productionAuthorityGranted,false);
  assert.equal(proof.providerAuthorityGranted,false);
  assert.equal(proof.billingAuthorityGranted,false);
  assert.equal(proof.projectArtifactMutationAllowed,false);
  assert.equal(proof.aeeExecutionAuthorityGranted,false);
  assert.equal(proof.modelFleetPromotionAllowed,false);
  assert.equal(verifier.calls.length,2);
});

test('manifest bytes cannot drift after byte acquisition evidence was emitted',async()=>{
  const f=await fixture();
  const changed=structuredClone(f.manifest);
  changed.artifacts[0].contentSha256='f'.repeat(64);
  const proof=await proveHsmeTeacherAcquisitionV1(
    f.pinRequests,f.plan,f.expansion,changed,f.acquisition,origin(),hashPort,
  );
  assert.equal(proof.state,'ACQUISITION_EVIDENCE_INVALID');
  assert.ok(proof.blockers.includes('ACQUISITION_MANIFEST_DIGEST_DRIFT'));
});

test('plan path cannot be rebound outside declared component roots',async()=>{
  const f=await fixture();
  const changed=structuredClone(f.plan);
  changed.artifacts[0].relativePath='undeclared/model_index.json';
  const proof=await proveHsmeTeacherAcquisitionV1(
    f.pinRequests,changed,f.expansion,f.manifest,f.acquisition,origin(),hashPort,
  );
  assert.equal(proof.state,'ACQUISITION_EVIDENCE_INVALID');
  assert.ok(proof.blockers.some(value=>value.startsWith('ACQUISITION_ARTIFACT_ROOT_BINDING_INVALID')));
  assert.ok(proof.blockers.includes('ACQUISITION_PLAN_DIGEST_DRIFT'));
});

test('origin verification is required for both expansion and byte evidence',async()=>{
  const f=await fixture();
  let proof=await proveHsmeTeacherAcquisitionV1(
    f.pinRequests,f.plan,f.expansion,f.manifest,f.acquisition,
    origin({expansion:false}),hashPort,
  );
  assert.equal(proof.state,'ACQUISITION_EVIDENCE_INVALID');
  assert.ok(proof.blockers.includes('ACQUISITION_EXPANSION_ORIGIN_UNVERIFIED'));

  proof=await proveHsmeTeacherAcquisitionV1(
    f.pinRequests,f.plan,f.expansion,f.manifest,f.acquisition,
    origin({acquisition:false}),hashPort,
  );
  assert.equal(proof.state,'ACQUISITION_EVIDENCE_INVALID');
  assert.ok(proof.blockers.includes('ACQUISITION_BYTE_ORIGIN_UNVERIFIED'));
});

test('expected-manifest mismatch remains fail-closed',async()=>{
  const f=await fixture();
  const changed={...f.acquisition,matchesExpectedManifest:false};
  const proof=await proveHsmeTeacherAcquisitionV1(
    f.pinRequests,f.plan,f.expansion,f.manifest,changed,origin(),hashPort,
  );
  assert.equal(proof.state,'ACQUISITION_EVIDENCE_INVALID');
  assert.ok(proof.blockers.includes('ACQUISITION_EXPECTED_MANIFEST_MISMATCH'));
});

test('expansion authority widening is rejected during normalization',async()=>{
  const f=await fixture();
  const changed={...f.expansion,trainingStartAllowed:true};
  const proof=await proveHsmeTeacherAcquisitionV1(
    f.pinRequests,f.plan,changed,f.manifest,f.acquisition,origin(),hashPort,
  );
  assert.equal(proof.state,'ACQUISITION_EVIDENCE_INVALID');
  assert.ok(proof.blockers.includes('ACQUISITION_INPUT_NORMALIZATION_FAILED'));
});

test('removing all artifacts for a declared component root cannot produce READY proof',async()=>{
  const f=await fixture();
  const changedPlan=structuredClone(f.plan);
  changedPlan.artifacts=changedPlan.artifacts.filter(value=>!value.relativePath.startsWith('tokenizer/'));
  const changedManifest=structuredClone(f.manifest);
  changedManifest.artifacts=changedManifest.artifacts.filter(value=>!value.relativePath.startsWith('tokenizer/'));
  const changedExpansion={...f.expansion,artifactCount:changedPlan.artifacts.length};
  const changedAcquisition={...f.acquisition,artifactCount:changedPlan.artifacts.length};
  const proof=await proveHsmeTeacherAcquisitionV1(
    f.pinRequests,changedPlan,changedExpansion,changedManifest,changedAcquisition,origin(),hashPort,
  );
  assert.equal(proof.state,'ACQUISITION_EVIDENCE_INVALID');
  assert.ok(proof.blockers.some(value=>value.startsWith('ACQUISITION_COMPONENT_ROOT_EMPTY:')));
});
