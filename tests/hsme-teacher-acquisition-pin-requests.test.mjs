import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

const validatorUrl=new URL('../scripts/validate-hsme-teacher-acquisition-pin-requests.py',import.meta.url);
const validatorPath=validatorUrl.pathname;
const requestUrl=new URL(
  '../src/platform/creative/local-ai/hsme/hsme-teacher-acquisition-pin-requests.v1.json',
  import.meta.url,
);
const requests=JSON.parse(await readFile(requestUrl,'utf8'));

function run(inputPath,evidencePath){
  return spawnSync('python3',[
    validatorPath,'--input',inputPath,'--evidence-output',evidencePath,
  ],{encoding:'utf8'});
}

async function mutate(mutator){
  const root=await mkdtemp(join(tmpdir(),'hsme-teacher-pin-requests-'));
  const input=join(root,'requests.json');
  const evidence=join(root,'evidence.json');
  const value=structuredClone(requests);
  mutator(value);
  await writeFile(input,JSON.stringify(value,null,2)+'\n');
  return {root,input,evidence,value,result:run(input,evidence)};
}

test('real shortlist pins three immutable public source heads but grants no admission',async()=>{
  const f=await mutate(()=>{});
  assert.equal(f.result.status,0,f.result.stderr);
  const evidence=JSON.parse(await readFile(f.evidence,'utf8'));
  assert.equal(evidence.requestCount,3);
  assert.equal(evidence.immutableRevisionCount,3);
  assert.match(evidence.requestSetSha256,/^[0-9a-f]{64}$/);
  assert.equal(evidence.rightsResolved,false);
  assert.equal(evidence.qualityMeasured,false);
  assert.equal(evidence.teacherAdmissionAllowed,false);
  assert.equal(evidence.trainingStartAllowed,false);
  assert.equal(evidence.productionAuthorityGranted,false);

  const byId=Object.fromEntries(
    requests.requests.map(value=>[value.teacherCandidateId,value]),
  );
  assert.equal(
    byId['qwen-image-2512-quality-teacher'].source.immutableRevision,
    '25468b98e3276ca6700de15c6628e51b7de54a26',
  );
  assert.equal(
    byId['qwen-image-edit-2511-quality-teacher'].source.immutableRevision,
    '6f3ccc0b56e431dc6a0c2b2039706d7d26f22cb9',
  );
  assert.equal(
    byId['flux2-klein-4b-comparator-teacher'].source.immutableRevision,
    'e7b7dc27f91deacad38e78976d1f2b499d76a294',
  );
  for(const request of requests.requests){
    assert.equal(request.rightsConclusion,'REVIEW_REQUIRED');
    assert.equal(request.distillationOutputUse,'REVIEW_REQUIRED');
    assert.equal(request.qualityGateStatus,'UNMEASURED');
    assert.equal(request.teacherAdmissionAllowed,false);
    assert.equal(request.trainingStartAllowed,false);
    assert.ok(request.componentRoots.some(value=>value.role==='DENOISER'));
    assert.ok(request.componentRoots.some(value=>value.role==='TEXT_ENCODER'));
    assert.ok(request.componentRoots.some(value=>value.role==='VAE'));
  }
});

test('mutable source refs cannot replace immutable repository revision identity',async()=>{
  const f=await mutate(value=>{
    value.requests[0].source.immutableRevision='main';
  });
  assert.equal(f.result.status,2);
  assert.match(f.result.stderr,/immutable 40\/64-hex revision/);
});

test('pin request cannot optimistically conclude output-training rights',async()=>{
  const f=await mutate(value=>{
    value.requests[0].distillationOutputUse='DISTILLATION_ALLOWED';
  });
  assert.equal(f.result.status,2);
  assert.match(f.result.stderr,/distillationOutputUse must remain REVIEW_REQUIRED/);
});

test('pin request cannot claim measured quality before bakeoff evidence exists',async()=>{
  const f=await mutate(value=>{
    value.requests[1].qualityGateStatus='PASS';
  });
  assert.equal(f.result.status,2);
  assert.match(f.result.stderr,/qualityGateStatus must remain UNMEASURED/);
});

test('pin request cannot admit a teacher or start training',async()=>{
  let f=await mutate(value=>{
    value.requests[2].teacherAdmissionAllowed=true;
  });
  assert.equal(f.result.status,2);
  assert.match(f.result.stderr,/teacherAdmissionAllowed must remain false/);

  f=await mutate(value=>{
    value.trainingStartAllowed=true;
  });
  assert.equal(f.result.status,2);
  assert.match(f.result.stderr,/trainingStartAllowed must remain false/);
});

test('component-root traversal and duplicate source identity fail closed',async()=>{
  let f=await mutate(value=>{
    value.requests[0].componentRoots[0].relativePath='../model_index.json';
  });
  assert.equal(f.result.status,2);
  assert.match(f.result.stderr,/unsafe path segments/);

  f=await mutate(value=>{
    value.requests[1].source=structuredClone(value.requests[0].source);
  });
  assert.equal(f.result.status,2);
  assert.match(f.result.stderr,/source identity must be unique/);
});

test('public metadata license string is informational and cannot widen rights state',async()=>{
  const f=await mutate(value=>{
    value.requests[0].publicMetadataLicenseId='Apache-2.0';
    value.requests[0].rightsConclusion='COMMERCIAL_ADMISSIBLE';
  });
  assert.equal(f.result.status,2);
  assert.match(f.result.stderr,/rightsConclusion must remain REVIEW_REQUIRED/);
});
