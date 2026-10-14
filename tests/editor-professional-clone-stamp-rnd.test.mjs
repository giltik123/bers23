import assert from 'node:assert/strict';
import test from 'node:test';
import { precisionCloneStampRgba8RND as stamp } from '../src/platform/creative/deterministic/ProfessionalCloneStampRND.ts';

const image=(width,height,get)=>Uint8Array.from(
  Array.from({length:width*height},(_,i)=>get(i%width,Math.floor(i/width))).flat());
const params={targetX:3,targetY:3,sampleX:1,sampleY:1,radius:1,
  hardnessQ8:255,opacityQ8:255};

test('hard clone transfers exactly the sampled RGB and preserves target alpha outside stamp',()=>{
  const source=image(5,5,(x,y)=>[x*40,y*40,(x+y)*20,(x+y)%2?128:255]);
  const before=new Uint8Array(source);
  const result=stamp(source,5,5,params);
  const from=(1*5+1)*4,to=(3*5+3)*4;
  assert.deepEqual([...result.slice(to,to+3)],[...source.slice(from,from+3)]);
  assert.equal(result[to+3],source[to+3]);
  for(let pixel=0;pixel<25;pixel++){
    if(pixel===3*5+3)continue;
    assert.deepEqual([...result.slice(pixel*4,pixel*4+4)],
      [...source.slice(pixel*4,pixel*4+4)],'no effect outside single stamp');
  }
  assert.deepEqual([...source],[...before],'clone must not mutate reference pixels');
});

test('soft Clone Stamp has true feathered falloff and does not create edge artifacts',()=>{
  const source=image(11,9,(x)=>x<5?[255,255,255,255]:[0,0,0,255]);
  const settings={targetX:8,targetY:4,sampleX:2,sampleY:4,radius:3,
    hardnessQ8:0,opacityQ8:255};
  const result=stamp(source,11,9,settings);
  const center=(4*11+8)*4;
  const edge=(4*11+6)*4;
  assert.equal(result[center],255);
  assert.ok(result[edge]>0&&result[edge]<255,
    `edge needs soft antialias coverage: ${result[edge]}`);
  assert.equal(result[(4*11+5)*4],0,'outside brush must be exact original');
  for(let i=3;i<result.length;i+=4)assert.equal(result[i],255);
});

test('zero matte protects every RGBA byte; partial matte makes a proportional linear edit',()=>{
  const source=image(5,5,(x)=>x<3?[255,0,0,255]:[0,0,0,255]);
  const opts={targetX:4,targetY:2,sampleX:1,sampleY:2,radius:2,
    hardnessQ8:255,opacityQ8:255};
  const matte=new Uint8Array(25);
  const untouched=stamp(source,5,5,opts,matte);
  assert.deepEqual([...untouched],[...source]);
  matte[2*5+4]=128;
  const mixed=stamp(source,5,5,opts,matte);
  const dest=(2*5+4)*4;
  assert.ok(mixed[dest]>180&&mixed[dest]<200,
    `linear half-matte red over black should be ~188, got ${mixed[dest]}`);
  assert.equal(mixed[dest+1],0);
  assert.equal(mixed[dest+3],255);
});

test('transparent clone source is ignored and hidden target/source RGB unchanged',()=>{
  const source=image(5,5,(x,y)=>[10*x,20*y,30,255]);
  source[(1*5+1)*4+3]=0;
  source[(3*5+3)*4+3]=128;
  const clone=stamp(source,5,5,params);
  assert.deepEqual([...clone],[...source]);
});

test('stamp identity, bad mask, invalid source and resource escapes reject before edits',()=>{
  const source=image(5,5,()=>[2,3,4,255]);
  assert.deepEqual([...stamp(source,5,5,{...params,opacityQ8:0})],[...source]);
  assert.throws(()=>stamp(source,0,5,params),/geometry/u);
  assert.throws(()=>stamp(source,5,5,{...params,radius:512}),/invalid/u);
  assert.throws(()=>stamp(source,5,5,{...params,opacityQ8:256}),/invalid/u);
  assert.throws(()=>stamp(source,5,5,{...params,targetX:-1}),/invalid/u);
  assert.throws(()=>stamp(source,5,5,{...params,sampleX:100}),/invalid/u);
  assert.throws(()=>stamp(source,5,5,{...params,hardnessQ8:NaN}),/invalid/u);
  assert.throws(()=>stamp(source,5,5,params,new Uint8Array(1)),/R8/u);
  assert.throws(()=>stamp(new Uint8Array(3),5,5,params),/RGBA8/u);
});
