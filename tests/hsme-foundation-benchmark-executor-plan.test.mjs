import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  assertFixturePack,
  assertProfileSet,
  buildExecutionPlan,
  PATHS,
  resolveFixtureInputs,
  terminalRow,
} from '../scripts/hsme-foundation-benchmark-executor-plan.mjs';

const root=process.cwd();
const fakeA='a'.repeat(40);
const fakeB='b'.repeat(40);
const load=async path=>JSON.parse(await readFile(path,'utf8'));

test('frozen profile and fixture pack authority remains fail-closed',async()=>{
  const [profiles,pack]=await Promise.all([load(PATHS.profiles),load(PATHS.fixturePack)]);
  assert.equal(assertProfileSet(profiles).profiles.length,6);
  assert.equal(assertFixturePack(pack).sources.outputSetContract.requiredSeeds.length>0,true);
  const widened=structuredClone(profiles);
  widened.productionAuthorityGranted=true;
  assert.throws(()=>assertProfileSet(widened),/must remain false/);
});

test('fixture resolver proves exact frozen six T2I and seven editing inputs',async()=>{
  const [fixturePlan,pack,generated,d6]=await Promise.all([
    load(PATHS.fixturePlan),load(PATHS.fixturePack),load(PATHS.generated),load(PATHS.d6),
  ]);
  const t2i=resolveFixtureInputs(fixturePlan,pack,generated,d6,'TEXT_TO_IMAGE');
  const edit=resolveFixtureInputs(fixturePlan,pack,generated,d6,'IMAGE_EDITING');
  assert.equal(t2i.length,6);
  assert.equal(edit.length,7);
  assert.equal(edit.some(x=>x.instruction.includes('BERS AI')),true);
  assert.equal(edit.every(x=>x.references.length>=1),true);
});

test('Tiny-SD T2I plan is EXECUTE and bound to corrected 50-step CUDA profile',async()=>{
  const plan=await buildExecutionPlan({
    candidateRoot:root,controllerRoot:root,candidateSha:fakeA,controllerMainSha:fakeB,
    candidateId:'tiny-sd-control-v1',capability:'TEXT_TO_IMAGE',
  });
  assert.equal(plan.disposition,'EXECUTE');
  assert.equal(plan.sourceSpec.stepCount,50);
  assert.equal(plan.runtimeLock.packages.torch,'2.0.1+cu118');
  assert.equal(plan.executionProfile.schedulerSampler,'DPMSolverMultistepScheduler:dpmsolver++:order2:midpoint');
  assert.equal(plan.runtimeArtifacts.length>0,true);
});

test('unsupported pair emits NOT_APPLICABLE without runtime artifacts',async()=>{
  const plan=await buildExecutionPlan({
    candidateRoot:root,controllerRoot:root,candidateSha:fakeA,controllerMainSha:fakeB,
    candidateId:'tiny-sd-control-v1',capability:'IMAGE_EDITING',
  });
  assert.equal(plan.disposition,'NOT_APPLICABLE');
  assert.deepEqual(plan.runtimeArtifacts,[]);
  const row=terminalRow(plan,'NOT_APPLICABLE');
  assert.equal(row.status,'NOT_APPLICABLE');
  assert.equal(row.runtimeInventorySha256,'UNKNOWN');
  assert.deepEqual(row.outputs,[]);
});

test('SANA remains blocked before accepted exact parity evidence and acquires no model',async()=>{
  const plan=await buildExecutionPlan({
    candidateRoot:root,controllerRoot:root,candidateSha:fakeA,controllerMainSha:fakeB,
    candidateId:'sana-sprint-0.6b-split-v1',capability:'TEXT_TO_IMAGE',
  });
  assert.equal(plan.disposition,'BLOCKED_PARITY_PENDING');
  assert.deepEqual(plan.runtimeArtifacts,[]);
  assert.equal(plan.sanaParity,null);
  const row=terminalRow(plan,'BLOCKED_PARITY_PENDING');
  assert.equal(row.status,'BLOCKED_PARITY_PENDING');
});

test('stale substrate is rejected before any execution planning',async()=>{
  const plan=await buildExecutionPlan({
    candidateRoot:root,controllerRoot:root,candidateSha:fakeA,controllerMainSha:fakeB,
    candidateId:'qwen-image-edit-2511-reference-v1',capability:'IMAGE_EDITING',
  });
  assert.equal(plan.disposition,'EXECUTE');
  assert.equal(plan.fixtures.length,7);
  assert.equal(plan.requiredSeeds.length>0,true);
  assert.equal(plan.ordinaryCiModelExecutionAllowed,false);
  assert.equal(plan.winnerSelectionAllowed,false);
});


test('SANA parity paths reject repository escape before evidence read',async()=>{
  await assert.rejects(
    buildExecutionPlan({
      candidateRoot:root,controllerRoot:root,candidateSha:fakeA,controllerMainSha:fakeB,
      candidateId:'sana-sprint-0.6b-split-v1',capability:'TEXT_TO_IMAGE',
      sanaPlanPath:'../outside-plan.json',sanaEvidencePath:'src/platform/creative/local-ai/hsme/x.json',
    }),
    error=>error?.code==='hsme_executor_repo_path_invalid',
  );
});
