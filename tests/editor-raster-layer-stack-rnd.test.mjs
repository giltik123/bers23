import assert from 'node:assert/strict';
import test from 'node:test';
import { composeEditorRasterLayersRgba8 } from '../src/platform/creative/deterministic/EditorRasterLayerStackRND.ts';

const layer=(id,pixels,overrides={})=>({id,pixels:Uint8Array.from(pixels),opacityQ8:255,visible:true,blendMode:'NORMAL',...overrides});
const img=pixels=>Uint8Array.from(pixels);

test('empty and invisible layers are byte-perfect no-ops including hidden RGB',()=>{
  const original=img([220,31,90,0,13,80,240,128,10,20,30,255]);
  const snapshot=img(original);
  assert.deepEqual([...composeEditorRasterLayersRgba8(original,3,1,[])],[...original]);
  const ignored=layer('invisible',[1,2,3,255,1,2,3,255,1,2,3,255],{visible:false});
  assert.deepEqual([...composeEditorRasterLayersRgba8(original,3,1,[ignored])],[...original]);
  assert.deepEqual([...composeEditorRasterLayersRgba8(original,3,1,[{...ignored,visible:true,opacityQ8:0}])],[...original]);
  assert.deepEqual([...original],[...snapshot]);
});

test('opaque source-over replaces exactly, R8 mask protects outside pixels',()=>{
  const source=img([10,20,30,255,40,50,60,1]);
  const paint=layer('paint',[100,110,120,255,200,210,220,255],{mask:img([255,0])});
  const out=composeEditorRasterLayersRgba8(source,2,1,[paint]);
  assert.deepEqual([...out],[100,110,120,255,40,50,60,1]);
  assert.deepEqual([...source],[10,20,30,255,40,50,60,1]);
});

test('source-over alpha and color are alpha-weighted with deterministic rounding',()=>{
  const original=img([0,0,0,255]);
  const paint=layer('foreground',[200,100,50,255],{opacityQ8:128});
  const result=composeEditorRasterLayersRgba8(original,1,1,[paint]);
  assert.deepEqual([...result],[100,50,25,255]);
  assert.deepEqual([...composeEditorRasterLayersRgba8(img([0,0,0,0]),1,1,[paint])],[200,100,50,128]);
});

test('two raster layers are independently toggleable and order-dependent',()=>{
  const source=img([20,20,20,255]);
  const red=layer('red',[255,0,0,255],{opacityQ8:128});
  const blue=layer('blue',[0,0,255,255],{opacityQ8:128});
  const both=composeEditorRasterLayersRgba8(source,1,1,[red,blue]);
  const reversed=composeEditorRasterLayersRgba8(source,1,1,[blue,red]);
  assert.notDeepEqual([...both],[...reversed]);
  const hidden=composeEditorRasterLayersRgba8(source,1,1,[red,{...blue,visible:false}]);
  assert.deepEqual([...hidden],[...composeEditorRasterLayersRgba8(source,1,1,[red])]);
  assert.deepEqual([...source],[20,20,20,255]);
});

test('layer preflight rejects duplicate IDs, unsupported blend, masks and geometry',()=>{
  const source=img([5,6,7,8]);
  const foreground=layer('one',[9,10,11,12]);
  const invalid=[
    [foreground,foreground],
    [{...foreground,blendMode:'MULTIPLY'}],
    [{...foreground,opacityQ8:256}],
    [{...foreground,opacityQ8:.5}],
    [{...foreground,mask:img([1,2])}],
    [{...foreground,pixels:img([1,2,3])}],
    [{...foreground,id:'../../a'}],
    [{...foreground,visible:'yes'}],
  ];
  for(const layers of invalid) assert.throws(()=>composeEditorRasterLayersRgba8(source,1,1,layers));
  assert.throws(()=>composeEditorRasterLayersRgba8(source,1,1,Array.from({length:33},(_,i)=>({...foreground,id:`layer_${i}`}))));
  assert.throws(()=>composeEditorRasterLayersRgba8(source,0,1,[]),/geometry/);
  assert.throws(()=>composeEditorRasterLayersRgba8(source,1,2,[]),/exact RGBA8/);
});

test('large photo with too many layers is rejected before multi-gigabyte allocation',()=>{
  const tinyLayer=layer('one',[1,2,3,4]);
  const oversizedLayers=Array.from({length:5},(_,i)=>({...tinyLayer,id:`layer_${i}`}));
  assert.throws(
    ()=>composeEditorRasterLayersRgba8(new Uint8Array(0),4096,4096,oversizedLayers),
    /bounded pixel-layer processing budget/u,
  );
});
