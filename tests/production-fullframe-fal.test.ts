import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { createFalWorkflowRuntime, type ProviderInputMaterializer } from '../server/core/providers/falWorkflowRuntime.ts';
import { productionWorkflowVerifier } from '../server/core/providers/productionWorkflowVerifier.ts';

const scope={tenantId:'tenant',userId:'user',projectId:'project'};
const resultUrl='https://fal.media/files/test/full-frame.png';

test('browser full-frame prompt edit goes through server fal and returns reviewable canonical FINAL pixels',async()=>{
  const resultBytes=await sharp({create:{width:2,height:2,channels:4,
    background:{r:120,g:40,b:200,alpha:1}}}).png().toBuffer();
  const calls=[];
  const fetcher=async(url,init)=>{
    if(String(url)===resultUrl)return new Response(resultBytes,{
      headers:{'content-type':'image/png'},
    });
    calls.push({url:String(url),body:JSON.parse(String(init?.body))});
    return Response.json({images:[{url:resultUrl}]});
  };
  const materializer:ProviderInputMaterializer={
    materialize:async input=>{
      assert.equal(input.purpose,'roi');
      assert.equal(input.mimeType,'image/png');
      assert.equal((await sharp(input.bytes).metadata()).width,2);
      return {url:'https://cdn.fal.test/trusted-input.png',
        width:2,height:2,byteSize:input.bytes.byteLength};
    },
  };
  const runtime=createFalWorkflowRuntime({apiKey:'server-only-secret',
    baseUrl:'https://queue.fal.test',timeoutMs:1000,
    artifacts:{resolve:()=>{throw Error('stored opaque tokens cannot be sent to fal');}} as never,
    fetcher:fetcher as typeof fetch,materializer});
  const source={width:2,height:2,data:new Uint8ClampedArray(16).fill(100),
    format:'RGBA8',orientation:1 as const,colorSpace:'srgb'};
  const operation={id:'edit',type:'image-edit',providerId:'fal' as const,
    executionRoute:'PROVIDER' as const,requiredArtifacts:['signed-image'],
    input:{prompt:'paint a purple landscape'}};
  const result=await runtime.execute({workflowId:'full-image-edit',scope,operation,
    artifacts:[{id:'signed-image',scope,kind:'image',value:source,
      producerStepId:'user-input',metadata:{artifactRole:'ORIGINAL'}}]});
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/fal-ai\\/flux-pro\\/kontext/);
  assert.deepEqual(calls[0].body,{prompt:'paint a purple landscape',
    image_url:'https://cdn.fal.test/trusted-input.png'});
  const artifact=result.artifacts[0];
  assert.equal(artifact.metadata?.producerOperation,'GLOBAL_EDIT');
  assert.equal(artifact.metadata?.lifecycle,'FINAL');
  assert.deepEqual(artifact.metadata?.parentArtifactIds,['signed-image']);
  assert.ok(artifact.value.data instanceof Uint8ClampedArray);
  assert.deepEqual([artifact.value.width,artifact.value.height],[2,2]);
  assert.equal('url' in artifact.value,false);
  const verified=await productionWorkflowVerifier.verify(operation,[
    {...artifact,producerStepId:'edit'},
  ]);
  assert.equal(verified.valid,true);
});

test('full-frame generator rejects a provider image with incompatible aspect ratio',async()=>{
  const resultBytes=await sharp({create:{width:4,height:1,channels:3,background:'#000'}})
    .png().toBuffer();
  const runtime=createFalWorkflowRuntime({apiKey:'secret',
    baseUrl:'https://queue.fal.test',timeoutMs:1000,
    artifacts:{} as never,
    materializer:{materialize:async()=>({url:'https://cdn.fal.test/input.png',
      width:2,height:2,byteSize:20})},
    fetcher:async(url)=>String(url)===resultUrl
      ? new Response(resultBytes,{headers:{'content-type':'image/png'}})
      : Response.json({images:[{url:resultUrl}]})});
  await assert.rejects(runtime.execute({workflowId:'invalid-ratio',scope,
    operation:{id:'edit',type:'image-edit',providerId:'fal',input:{prompt:'change'}},
    artifacts:[{id:'signed-image',scope,kind:'image',
      value:{width:2,height:2,data:new Uint8ClampedArray(16),
        format:'RGBA8',orientation:1 as const},
      producerStepId:'user-input'}]}),/aspect ratio/);
});
