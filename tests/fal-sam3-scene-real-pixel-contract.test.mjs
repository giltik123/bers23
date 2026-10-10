import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { runFalSam3Scene,decodeSam3Mask,SAM3_SCENE_PROMPTS } from '../server/core/scene/falSam3SemanticInstances.ts';

const png=async(width,height,pixels,channels=1)=>
  sharp(Buffer.from(pixels),{raw:{width,height,channels}}).png().toBuffer();
const uri=bytes=>'data:image/png;base64,'+bytes.toString('base64');

test('real SAM3 contract makes bounded authenticated prompt calls and decodes distinct alpha pixels',async()=>{
  const source=await png(4,4,new Uint8Array(4*4*3).fill(127),3);
  const mask=await png(2,2,[255,0,0,0]);
  const seen=[];
  const result=await runFalSam3Scene({
    imagePng:source,width:4,height:4,falKey:'ci-fake-key',
    fetcher:async(url,opts)=>{
      const body=JSON.parse(opts.body);
      seen.push({url,prompt:body.prompt,authorization:opts.headers.Authorization,
        include_scores:body.include_scores, sync_mode:body.sync_mode,apply_mask:body.apply_mask,
        imageUrl:body.image_url});
      return new Response(JSON.stringify({
        masks:[{url:uri(mask)}],scores:[0.91],
      }),{status:200,headers:{'Content-Type':'application/json'}});
    },
  });
  assert.equal(seen.length,SAM3_SCENE_PROMPTS.length);
  assert.ok(seen.every(x=>x.url==='https://fal.run/fal-ai/sam-3/image'
    &&x.authorization==='Key ci-fake-key'&&x.include_scores===true
    &&x.sync_mode===true&&x.apply_mask===false
    &&x.imageUrl.startsWith('data:image/jpeg;base64,')));
  assert.equal(result.instances.length,SAM3_SCENE_PROMPTS.length);
  assert.equal(result.instances[0].alpha.length,16);
  assert.equal(result.instances[0].alpha[0],255);
  assert.equal(result.instances[0].alpha[1],255);
  assert.equal(result.instances[0].alpha[2],0);
  assert.equal(result.instances[0].alpha[8],0);
  assert.equal(result.instances[0].confidence,0.91);
  assert.ok(new Set(result.instances.map(x=>x.group)).has('FACE'));
  assert.ok(new Set(result.instances.map(x=>x.group)).has('CLOTHING'));
  assert.ok(new Set(result.instances.map(x=>x.group)).has('ACCESSORY'));
  assert.ok(new Set(result.instances.map(x=>x.group)).has('BACKGROUND'));
  assert.ok(new Set(result.instances.map(x=>x.group)).has('OTHER_OBJECT'));
});

test('large canonical source is resized ONLY for provider, never for returned Core masks',async()=>{
  const source=await sharp({
    create:{width:3000,height:2000,channels:3,background:'#888888'},
  }).png().toBuffer();
  const mask=await png(2,2,[255,0,0,0]);
  let imageDimensions=null;
  const output=await runFalSam3Scene({
    imagePng:source,width:3000,height:2000,falKey:'fake',
    fetcher:async(_url,opts)=>{
      const body=JSON.parse(opts.body);
      const sourceImage=Buffer.from(body.image_url.slice('data:image/jpeg;base64,'.length),'base64');
      const metadata=await sharp(sourceImage).metadata();
      imageDimensions=[metadata.width,metadata.height];
      return new Response(JSON.stringify({
        masks:[{url:uri(mask)}],scores:[.88],
      }),{status:200});
    },
  });
  assert.ok(imageDimensions[0]<=2048&&imageDimensions[1]<=2048);
  assert.equal(output.instances[0].alpha.length,3000*2000);
});


test('provider fan-out is capped at three and results retain deterministic prompt order',async()=>{
  const source=await png(3,3,new Uint8Array(27).fill(123),3);
  const mask=await png(3,3,[255,0,0,0,0,0,0,0,0]);
  let active=0,peak=0;
  const result=await runFalSam3Scene({
    imagePng:source,width:3,height:3,falKey:'test-key',
    fetcher:async(_url,opts)=>{
      const {prompt}=JSON.parse(opts.body);
      active++;peak=Math.max(peak,active);
      await new Promise(resolve=>setTimeout(resolve,
        (SAM3_SCENE_PROMPTS.findIndex(x=>x.prompt===prompt)%3)*2+1));
      active--;
      return new Response(JSON.stringify({
        masks:[{url:uri(mask)}],metadata:[{score:.9}],
      }),{status:200});
    },
  });
  assert.equal(active,0);
  assert.equal(peak,3);
  assert.equal(result.instances.length,SAM3_SCENE_PROMPTS.length);
  assert.deepEqual(result.instances.map(x=>x.category),
    SAM3_SCENE_PROMPTS.map(x=>x.category));
});

test('reject colored provider preview instead of manufacturing a selection',async()=>{
  const colored=await png(2,1,[255,0,0, 0,0,255],3);
  await assert.rejects(()=>decodeSam3Mask(colored,2,1),/colored image/);
});

test('empty, all-selected, unscored, and unknown-provider output is never promoted to masks',async()=>{
  assert.equal(await decodeSam3Mask(await png(2,2,[0,0,0,0]),2,2),null);
  assert.equal(await decodeSam3Mask(await png(2,2,[255,255,255,255]),2,2),null);
  const source=await png(2,2,[110,120,130,140]);
  const mask=await png(2,2,[255,0,0,0]);
  const empty=await runFalSam3Scene({
    imagePng:source,width:2,height:2,falKey:'fake',
    fetcher:async()=>new Response(JSON.stringify({masks:[{url:uri(mask)}]}),{status:200}),
  });
  assert.deepEqual(empty.instances,[]);
  await assert.rejects(()=>runFalSam3Scene({
    imagePng:source,width:2,height:2,falKey:'fake',
    fetcher:async()=>new Response(JSON.stringify({
      masks:[{url:'https://evil.example/mask.png'}],scores:[.8],
    }),{status:200}),
  }),/inlined PNG/);
});

test('fail closed without server-side credentials or on provider HTTP errors',async()=>{
  const source=await png(2,2,[0,0,0,255]);
  await assert.rejects(()=>runFalSam3Scene({imagePng:source,width:2,height:2,falKey:''}),/server-only API key/);
  await assert.rejects(()=>runFalSam3Scene({
    imagePng:source,width:2,height:2,falKey:'fake',
    fetcher:async()=>new Response('upstream unavailable',{status:503}),
  }),/HTTP 503/);
});
