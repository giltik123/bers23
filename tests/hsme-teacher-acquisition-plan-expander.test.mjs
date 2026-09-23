import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,symlink,unlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

const expander=new URL('../scripts/expand-hsme-teacher-acquisition-plan.py',import.meta.url).pathname;
const inspector=new URL('../scripts/inspect-hsme-teacher-snapshot.py',import.meta.url).pathname;
const pinRequests=new URL(
  '../src/platform/creative/local-ai/hsme/hsme-teacher-acquisition-pin-requests.v1.json',
  import.meta.url,
).pathname;
const H=value=>createHash('sha256').update(value).digest('hex');

function runPython(script,args){
  return spawnSync('python3',[script,...args],{encoding:'utf8'});
}

async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'hsme-teacher-plan-expand-'));
  const materialized=join(root,'materialized');
  const snapshot=join(materialized,'qwen2512');
  for(const dir of ['scheduler','text_encoder','tokenizer','transformer','vae']){
    await mkdir(join(snapshot,dir),{recursive:true});
  }
  await writeFile(join(snapshot,'model_index.json'),'{"_class_name":"QwenImagePipeline"}\n');
  await writeFile(join(snapshot,'scheduler','scheduler_config.json'),'{"name":"fixture"}\n');
  await writeFile(join(snapshot,'text_encoder','config.json'),'{"hidden":1}\n');
  await writeFile(join(snapshot,'text_encoder','model-00001-of-00001.safetensors'),Buffer.from('text-weights'));
  await writeFile(join(snapshot,'tokenizer','tokenizer.json'),'{"tokenizer":"fixture"}\n');
  await writeFile(join(snapshot,'tokenizer','merges.txt'),'a b\n');
  await writeFile(join(snapshot,'transformer','config.json'),'{"layers":1}\n');
  await writeFile(join(snapshot,'transformer','diffusion_pytorch_model.safetensors'),Buffer.from('denoiser-weights'));
  await writeFile(join(snapshot,'vae','config.json'),'{"vae":1}\n');
  await writeFile(join(snapshot,'vae','diffusion_pytorch_model.safetensors'),Buffer.from('vae-weights'));
  return {
    root,materialized,snapshot,
    plan:join(root,'plan.json'),
    expansionEvidence:join(root,'expansion-evidence.json'),
    manifest:join(root,'manifest.json'),
    inspectionEvidence:join(root,'inspection-evidence.json'),
  };
}

async function expand(f,candidate='qwen-image-2512-quality-teacher'){
  return runPython(expander,[
    '--pin-requests',pinRequests,
    '--candidate-id',candidate,
    '--materialized-root',f.materialized,
    '--materialized-subdir','qwen2512',
    '--plan-output',f.plan,
    '--evidence-output',f.expansionEvidence,
  ]);
}

test('pinned materialized tree expands into exact inspector-compatible artifact plan',async()=>{
  const f=await fixture();
  let result=await expand(f);
  assert.equal(result.status,0,result.stderr);

  const plan=JSON.parse(await readFile(f.plan,'utf8'));
  const expansion=JSON.parse(await readFile(f.expansionEvidence,'utf8'));
  assert.equal(plan.schemaVersion,'BERS_HSME_TEACHER_ACQUISITION_PLAN_V1');
  assert.equal(plan.teacherCandidateId,'qwen-image-2512-quality-teacher');
  assert.equal(plan.primarySource.immutableRevision,'25468b98e3276ca6700de15c6628e51b7de54a26');
  assert.equal(plan.sources.length,1);
  assert.equal(plan.sources[0].materializedSubdir,'qwen2512');
  assert.equal(plan.artifacts.length,10);
  assert.equal(new Set(plan.artifacts.map(x=>x.logicalId)).size,plan.artifacts.length);
  assert.ok(plan.artifacts.every(x=>x.runtimeRequired===true));
  assert.ok(plan.artifacts.some(x=>x.role==='DENOISER_WEIGHT'));
  assert.ok(plan.artifacts.some(x=>x.role==='TEXT_ENCODER_WEIGHT'));
  assert.ok(plan.artifacts.some(x=>x.role==='VAE_WEIGHT'));
  assert.ok(plan.artifacts.some(x=>x.role==='TOKENIZER_ASSET'));
  assert.ok(plan.artifacts.some(x=>x.role==='SCHEDULER_ASSET'));
  assert.match(expansion.pinRequestSetSha256,/^[0-9a-f]{64}$/);
  assert.match(expansion.planSha256,/^[0-9a-f]{64}$/);
  assert.equal(expansion.networkAccessPerformed,false);
  assert.equal(expansion.deserializationPerformed,false);
  assert.equal(expansion.teacherAdmissionAllowed,false);
  assert.equal(expansion.trainingStartAllowed,false);
  assert.equal(expansion.productionAuthorityGranted,false);

  result=runPython(inspector,[
    '--plan',f.plan,
    '--materialized-root',f.materialized,
    '--manifest-output',f.manifest,
    '--evidence-output',f.inspectionEvidence,
  ]);
  assert.equal(result.status,0,result.stderr);
  const inspection=JSON.parse(await readFile(f.inspectionEvidence,'utf8'));
  assert.equal(inspection.planDigest,expansion.planSha256);
  assert.equal(inspection.artifactCount,plan.artifacts.length);
  assert.equal(inspection.hashBeforeDeserialization,true);
  assert.equal(inspection.deserializationPerformed,false);

  const manifest=JSON.parse(await readFile(f.manifest,'utf8'));
  const denoiser=manifest.artifacts.find(x=>x.role==='DENOISER_WEIGHT');
  assert.equal(denoiser.contentSha256,H('denoiser-weights'));
  assert.equal(denoiser.bytes,Buffer.byteLength('denoiser-weights'));
});

test('unexpected model-repository runtime code inside a declared component fails closed',async()=>{
  const f=await fixture();
  await writeFile(join(f.snapshot,'transformer','remote_model.py'),'print("unsafe")\n');
  const result=await expand(f);
  assert.equal(result.status,2);
  assert.match(result.stderr,/runtime-code payload rejected/);
});

test('symlinked files inside declared component roots fail before plan emission',async()=>{
  const f=await fixture();
  const path=join(f.snapshot,'vae','config.json');
  const real=join(f.snapshot,'vae','real-config.json');
  await writeFile(real,'{"real":true}\n');
  await unlink(path);
  await symlink(real,path);
  const result=await expand(f);
  assert.equal(result.status,2);
  assert.match(result.stderr,/must be a real regular file|symlink/i);
});

test('unknown candidate id cannot be expanded from another pinned source',async()=>{
  const f=await fixture();
  const result=await expand(f,'unknown-teacher');
  assert.equal(result.status,2);
  assert.match(result.stderr,/exactly one pin request/);
});

test('materialized subdir traversal is rejected before filesystem enumeration',async()=>{
  const f=await fixture();
  const result=runPython(expander,[
    '--pin-requests',pinRequests,
    '--candidate-id','qwen-image-2512-quality-teacher',
    '--materialized-root',f.materialized,
    '--materialized-subdir','../escape',
    '--plan-output',f.plan,
    '--evidence-output',f.expansionEvidence,
  ]);
  assert.equal(result.status,2);
  assert.match(result.stderr,/unsafe path segments/);
});

test('expander contains no downloader, model deserializer or admission path',async()=>{
  const source=await readFile(new URL('../scripts/expand-hsme-teacher-acquisition-plan.py',import.meta.url),'utf8');
  assert.doesNotMatch(source,/snapshot_download|hf_hub_download|from_pretrained|torch\.load|pickle\.load/);
  assert.doesNotMatch(source,/TEACHER_SET_ADMITTED|DISTILLATION_ALLOWED/);
  assert.match(source,/networkAccessPerformed.*False/);
  assert.match(source,/deserializationPerformed.*False/);
  assert.match(source,/teacherAdmissionAllowed.*False/);
  assert.match(source,/trainingStartAllowed.*False/);
});
