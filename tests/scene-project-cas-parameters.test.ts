import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgresProjectStore } from '../server/core/projects/postgresProjectStore.ts';

const scope={tenantId:'tenant',userId:'user'};
function harness(rows:unknown[]=[{revision:1}]) {
  const calls:{sql:string;params:unknown[]}[]=[];
  const pool={query:async(sql:string,params:unknown[])=>{
    calls.push({sql,params});
    return {rows};
  }};
  return {store:new PostgresProjectStore(pool as never),calls};
}

test('canonical scene Project CAS actually binds objects and source/revision via PG placeholders',async()=>{
  const {store,calls}=harness();
  await store.update(scope,'project',{objects:[{id:'real-mask-1'}]},
    {expectedSourceStorageId:'image-storage',expectedRevision:0});
  assert.equal(calls.length,1);
  assert.match(calls[0].sql,/objects=\$4::jsonb/);
  assert.match(calls[0].sql,/current_image_storage_id=\$5 AND revision=\$6/);
  assert.deepEqual(calls[0].params,[
    'project','tenant','user',JSON.stringify([{id:'real-mask-1'}]),
    'image-storage',0,
  ]);
});

test('normal Project updates still use bound parameters without scene precondition',async()=>{
  const {store,calls}=harness();
  await store.update(scope,'project',{name:'A controlled name'});
  assert.match(calls[0].sql,/name=\$4/);
  assert.doesNotMatch(calls[0].sql,/current_image_storage_id=\$5/);
  assert.deepEqual(calls[0].params,['project','tenant','user','A controlled name']);
});

test('scene CAS rejects missing source and fails closed on stale version',async()=>{
  const one=harness([]);
  await assert.rejects(()=>one.store.update(scope,'project',{objects:[]},
    {expectedSourceStorageId:'source',expectedRevision:3}),
    (err:any)=>err?.code==='project_source_conflict'&&err?.status===409);
  const two=harness();
  await assert.rejects(()=>two.store.update(scope,'project',{objects:[]},
    {expectedSourceStorageId:'',expectedRevision:3}),
    (err:any)=>err?.code==='invalid_scene_precondition');
  assert.equal(two.calls.length,0);
});


test('PostgreSQL advisory lock prevents a second paid scene analysis for the same source',async()=>{
  let locked=false,releaseCalls=0,locks=0,unlocks=0;
  const query=async(sql:string,params:unknown[])=>{
    assert.match(sql,/pg_.*advisory_lock/);
    assert.equal(params[1],'image-storage');
    if(sql.includes('pg_try_advisory_lock')){
      locks++;
      if(locked)return {rows:[{acquired:false}]};
      locked=true;
      return {rows:[{acquired:true}]};
    }
    if(sql.includes('pg_advisory_unlock')){
      unlocks++;
      const was=locked;
      locked=false;
      return {rows:[{unlocked:was}]};
    }
    throw new Error('Unexpected SQL');
  };
  const pool={connect:async()=>({query,release:()=>{releaseCalls++;}})};
  const store=new PostgresProjectStore(pool as never);
  const first=await store.acquireSceneAnalysisLease(scope,'project','image-storage');
  assert.ok(first);
  const second=await store.acquireSceneAnalysisLease(scope,'project','image-storage');
  assert.equal(second,null);
  assert.equal(releaseCalls,1);
  await first!();
  await first!();
  assert.equal(unlocks,1);
  const third=await store.acquireSceneAnalysisLease(scope,'project','image-storage');
  assert.ok(third);
  await third!();
  assert.equal(locks,3);
  assert.equal(releaseCalls,3);
  assert.equal(locked,false);
});

test('advisory lease rejection or query failure releases PG connection without provider admission',async()=>{
  let releases=0;
  const store=new PostgresProjectStore({connect:async()=>({
    query:async()=>{throw new Error('PG failure');},
    release:()=>{releases++;},
  })} as never);
  await assert.rejects(()=>store.acquireSceneAnalysisLease(scope,'project','storage'),/PG failure/);
  assert.equal(releases,1);
});
