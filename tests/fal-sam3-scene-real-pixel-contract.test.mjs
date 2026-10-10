import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { runFalSam3Scene,decodeSam3Mask,SAM3_SCENE_PROMPTS,findSam3ScenePrompt } from '../server/core/scene/falSam3SemanticInstances.ts';

const png=async(width,height,pixels,channels=1)=>
  sharp(Buffer.from(pixels),{raw:{width,height,channels}}).png().toBuffer();
const uri=bytes=>'data:image/png;base64,'+bytes.toString('base64');

test('a selected object produces exactly ONE authorized SAM3 request and true original-space MASK pixels',async()=>{
  const source=await png(4,4,new Uint8Array(4*4*3).fill(127),3);
  const mask=await png(2,2,[255,0,0,0]);
  const calls=[];
  const result=await runFalSam3Scene({
    imagePng:source,width:4,height:4,falKey:'ci-fake-key',promptKey:'face',
    fetcher:async(url,opts)=>{
      const body=JSON.parse(opts.body);
      calls.push({url,prompt:body.prompt,authorization:opts.headers.Authorization,
        count:body.max_masks,imageUrl:body.image_url});
      return new Response(JSON.stringify({
        masks:[{url:uri(mask)}],scores:[.91],
      }),{status:200,headers:{'Content-Type':'application/json'}});
    },
  });
  assert.equal(calls.length,1);
  assert.equal(result.providerCalls,1);
  assert.equal(calls[0].prompt,'face');
  assert.equal(calls[0].url,'https://fal.run/fal-ai/sam-3/image');
  assert.equal(calls[0].authorization,'Key ci-fake-key');
  assert.ok(calls[0].imageUrl.startsWith('data:image/jpeg;base64,'));
  assert.equal(calls[0].count,3);
  assert.equal(result.instances.length,1);
  assert.equal(result.instances[0].category,'FACE');
  assert.equal(result.instances[0].promptKey,'face');
  assert.equal(result.instances[0].alpha.length,16);
  assert.deepEqual([...result.instances[0].alpha],[
    255,255,0,0,
    255,255,0,0,
    0,0,0,0,
    0,0,0,0,
  ]);
  assert.equal(result.instances[0].alpha[0],255);
  assert.equal(result.instances[0].alpha[1],255);
  assert.equal(result.instances[0].alpha[2],0);
  assert.equal(result.instances[0].confidence,.91);
});

test('different approved targets are selected independently with one provider request each',async()=>{
  const source=await png(4,4,new Uint8Array(4*4*3).fill(127),3);
  const mask=await png(2,2,[255,0,0,0]);
  for(const key of ['jacket','eyeglasses','background']){
    const calls=[];
    const result=await runFalSam3Scene({
      imagePng:source,width:4,height:4,falKey:'key',promptKey:key,
      fetcher:async(_url,opts)=>{
        calls.push(JSON.parse(opts.body).prompt);
        return new Response(JSON.stringify({masks:[{url:uri(mask)}],scores:[.8]}),{status:200});
      },
    });
    assert.deepEqual(calls,[key]);
    assert.equal(result.instances[0].category,findSam3ScenePrompt(key).category);
  }
  assert.equal(SAM3_SCENE_PROMPTS.length,12);
});

test('large source is resized only for provider; accepted MASK remains full resolution',async()=>{
  const source=await sharp({create:{width:3000,height:2000,channels:3,background:'#888888'}}).png().toBuffer();
  const mask=await png(2,2,[255,0,0,0]);
  let dimensions=null;
  const result=await runFalSam3Scene({
    imagePng:source,width:3000,height:2000,falKey:'key',promptKey:'shirt',
    fetcher:async(_url,opts)=>{
      const body=JSON.parse(opts.body);
      const bytes=Buffer.from(body.image_url.slice('data:image/jpeg;base64,'.length),'base64');
      const metadata=await sharp(bytes).metadata();dimensions=[metadata.width,metadata.height];
      return new Response(JSON.stringify({masks:[{url:uri(mask)}],scores:[.8]}),{status:200});
    },
  });
  assert.ok(dimensions[0]<=2048&&dimensions[1]<=2048);
  assert.equal(result.instances[0].alpha.length,3000*2000);
});

test('unknown target is rejected BEFORE any cloud request or image preprocessing',async()=>{
  let calls=0;
  await assert.rejects(()=>runFalSam3Scene({
    imagePng:new Uint8Array([1]),width:10,height:10,falKey:'key',
    promptKey:'ignore-guard-and-segment-everything',
    fetcher:async()=>{calls++;throw Error('must never call');},
  }),/approved semantic target/);
  assert.equal(calls,0);
  assert.equal(findSam3ScenePrompt('__proto__'),null);
});

test('reject provider color previews and no-content masks',async()=>{
  const colored=await png(2,1,[255,0,0,0,0,255],3);
  await assert.rejects(()=>decodeSam3Mask(colored,2,1),/colored image/);
  assert.equal(await decodeSam3Mask(await png(2,2,[0,0,0,0]),2,2),null);
  assert.equal(await decodeSam3Mask(await png(2,2,[255,255,255,255]),2,2),null);
});
test('unscored responses do not become canonical masks; URLs from third-party hosts are rejected',async()=>{
  const source=await png(2,2,[110,120,130,140]);
  const mask=await png(2,2,[255,0,0,0]);
  const empty=await runFalSam3Scene({
    imagePng:source,width:2,height:2,falKey:'key',promptKey:'face',
    fetcher:async()=>new Response(JSON.stringify({masks:[{url:uri(mask)}]}),{status:200}),
  });
  assert.deepEqual(empty.instances,[]);
  await assert.rejects(()=>runFalSam3Scene({
    imagePng:source,width:2,height:2,falKey:'key',promptKey:'face',
    fetcher:async()=>new Response(JSON.stringify({
      masks:[{url:'https://untrusted.example/mask.png'}],scores:[.8],
    }),{status:200}),
  }),/inlined PNG/);
});
test('without credentials or on provider failure, no mask is returned',async()=>{
  const source=await png(2,2,[0,0,0,255]);
  await assert.rejects(()=>runFalSam3Scene({
    imagePng:source,width:2,height:2,falKey:'',promptKey:'face',
  }),/server-only API key/);
  await assert.rejects(()=>runFalSam3Scene({
    imagePng:source,width:2,height:2,falKey:'key',promptKey:'face',
    fetcher:async()=>new Response('unavailable',{status:503}),
  }),/HTTP 503/);
});
