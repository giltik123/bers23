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
