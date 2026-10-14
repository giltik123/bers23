import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createMaskArtifactHttpAdapter } from '../server/core/http/maskArtifactHttpAdapter.ts';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9f7B5wAAAABJRU5ErkJggg==','base64');
const scope={tenantId:'tenant',userId:'user',projectId:'project'};
function harness(){
  const artifacts={
    external:{
      resolveStoredMask:(ref,s)=>{
        if(ref!=='canonical-mask' || s.projectId!=='project')throw Error('mask denied');
        return {storageId:'stored-mask'};
      },
      resolveStoredOriginalId:(ref,s)=>{
        if(ref!=='canonical-photo'||s.projectId!=='project')throw Error('source denied');
        return {storageId:'stored-photo'};
      },
      resolveStoredFinalId:()=>{throw Error('not final');},
    },
    masks:{
      load:async()=>({
        storageId:'stored-mask',sourceImageStorageId:'stored-photo',
        width:1,height:1,png:new Uint8Array(png),
      }),
    },
    images:{
      loadSource:async(storageId)=>{
        if(storageId!=='stored-photo')throw Error('wrong source');
        return {storageId,width:1,height:1};
      },
    },
  };
  const auth={verify:async auth=>{
    if(auth!=='Bearer valid')throw Object.assign(new Error('Auth denied'),{status:401});
    return {tenantId:'tenant',userId:'user'};
  }};
  const config={allowedWebOrigins:[],allowApiBearerAuth:true,
    nodeEnv:'test',authPublicOrigin:'http://localhost',
    authChallengeSecret:'test-only-secret',maskMaxDimension:10,maskUploadLimitBytes:100};
  return createMaskArtifactHttpAdapter({artifacts,auth,config});
}
async function withHttp(callback){
  const adapter=harness();
  const server=createServer((req,res)=>{void adapter(req,res).catch(error=>{
    if(!res.headersSent){res.statusCode=500;res.end(error.message);}
  });});
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  try{
    const addr=server.address();
    assert.ok(addr && typeof addr==='object');
    await callback(`http://127.0.0.1:${addr.port}`);
  }finally{await new Promise(resolve=>server.close(resolve));}
}
const url=(base,mask='canonical-mask',source='canonical-photo',project='project')=>
  `${base}/api/core/artifacts/masks/${encodeURIComponent(mask)}?${new URLSearchParams({projectId:project,sourceImageArtifactId:source})}`;

test('Core serves only real, lineage-matched MASK PNG with no-store semantics',async()=>{
  await withHttp(async base=>{
    const response=await fetch(url(base),{headers:{authorization:'Bearer valid'}});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('content-type'),'image/png');
    assert.match(response.headers.get('cache-control')||'',/no-store/);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);
  });
});

test('invalid MASK signature, source mismatch, cross-scope and bad auth never return PNG',async()=>{
  await withHttp(async base=>{
    for(const [target,headers,expected]of [
      [url(base,'bad-mask'),{authorization:'Bearer valid'},404],
      [url(base,'canonical-mask','bad-source'),{authorization:'Bearer valid'},409],
      [url(base,'canonical-mask','canonical-photo','other'),{authorization:'Bearer valid'},404],
      [url(base),{authorization:'Bearer wrong'},401],
    ]){
      const response=await fetch(target,{headers});
      assert.equal(response.status,expected);
      assert.notEqual(response.headers.get('content-type'),'image/png');
    }
  });
});
