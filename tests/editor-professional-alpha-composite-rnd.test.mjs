import test from 'node:test';
import assert from 'node:assert/strict';
import { compositeMaskedLinearLightRND } from '../src/platform/creative/pipeline/ProfessionalMaskedCompositeRND.js';

function image(w, h, bytes) {
  return { width: w, height: h, orientation: 1, data: new Uint8ClampedArray(bytes) };
}
function fixture(original, patch, alpha) {
  const mask = { coordinateSpace: 'ORIGINAL', width: original.width, height: original.height, alpha: new Uint8Array(alpha) };
  const bounds = { x: 0, y: 0, width: original.width, height: original.height };
  const transform = { originalBounds: bounds, providerWidth: patch.width, providerHeight: patch.height, scaleX: patch.width / bounds.width, scaleY: patch.height / bounds.height };
  return compositeMaskedLinearLightRND(original, patch, mask, transform);
}

test('soft white-over-black uses linear-light transfer, not dark sRGB midpoint', () => {
  const output = fixture(image(1,1,[0,0,0,255]),image(1,1,[255,255,255,255]),[128]);
  assert.deepEqual(Array.from(output.data), [188,188,188,255]);
});

test('soft alpha from transparent source avoids dark RGB halo', () => {
  const output = fixture(image(1,1,[0,0,0,0]),image(1,1,[200,100,50,255]),[128]);
  assert.deepEqual(Array.from(output.data), [200,100,50,128]);
});

test('fully transparent generated patch does not create dark colored fringes', () => {
  const output = fixture(image(1,1,[80,120,160,255]),image(1,1,[255,0,0,0]),[128]);
  assert.deepEqual(Array.from(output.data), [80,120,160,127]);
});

test('mask-zero pixels preserve every byte including hidden transparent RGB', () => {
  const original=image(2,1,[130,40,70,0,15,60,100,77]);
  const output=fixture(original,image(2,1,[0,0,0,255,220,220,220,255]),[0,255]);
  assert.deepEqual(Array.from(output.data),[130,40,70,0,220,220,220,255]);
  assert.deepEqual(Array.from(original.data),[130,40,70,0,15,60,100,77]);
});

test('full selection copies patch exactly, including alpha', () => {
  const original=image(1,1,[30,44,200,56]);
  const patch=image(1,1,[250,99,64,17]);
  const output=fixture(original,patch,[255]);
  assert.deepEqual(Array.from(output.data),Array.from(patch.data));
});

test('malformed ROI, source size and alpha geometry fail closed', () => {
  const original=image(1,1,[1,2,3,4]),patch=image(1,1,[3,2,1,4]);
  const mask={coordinateSpace:'ORIGINAL',width:1,height:1,alpha:new Uint8Array([255])};
  const good={originalBounds:{x:0,y:0,width:1,height:1},providerWidth:1,providerHeight:1,scaleX:1,scaleY:1};
  assert.throws(()=>compositeMaskedLinearLightRND(original,patch,mask,{...good,scaleX:2}),/ROI/);
  assert.throws(()=>compositeMaskedLinearLightRND(original,patch,{...mask,width:2},good),/MASK/);
  assert.throws(()=>compositeMaskedLinearLightRND({...original,orientation:6},patch,mask,good),/oriented RGBA8/);
  assert.throws(()=>compositeMaskedLinearLightRND(image(1,1,[1]),patch,mask,good),/RGBA8/);
});
