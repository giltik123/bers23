import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreFashionForegroundRND } from '../src/platform/creative/pipeline/ProfessionalFashionOcclusionRND.js';
const image = (w,h,rgba)=>({ width:w,height:h,orientation:1,data:new Uint8ClampedArray(rgba) });

test('foreground hand/hair is restored over garment without affecting unselected garment pixels',()=>{
  const source=image(3,1,[225,172,140,255,190,145,120,255,90,70,55,255]);
  const garment=image(3,1,[25,65,195,255,28,75,190,255,40,90,170,255]);
  const output=restoreFashionForegroundRND({original:source,garmentComposite:garment,foregroundAlpha:new Uint8Array([255,0,128])});
  assert.deepEqual(Array.from(output.data.slice(0,4)),Array.from(source.data.slice(0,4)));
  assert.deepEqual(Array.from(output.data.slice(4,8)),Array.from(garment.data.slice(4,8)));
  assert.equal(output.data[11],255);
  assert(output.data[8]>40 && output.data[8]<90, 'hair feather boundary must interpolate the actual source and garment');
  assert.deepEqual(Array.from(source.data.slice(0,4)),[225,172,140,255]);
});

test('outside selected foreground matte all RGBA bytes, including hidden RGB, are untouched',()=>{
  const source=image(2,1,[1,2,3,4, 10,20,30,255]);
  const garment=image(2,1,[220,190,180,0, 30,40,50,255]);
  const output=restoreFashionForegroundRND({original:source,garmentComposite:garment,foregroundAlpha:new Uint8Array([0,255])});
  assert.deepEqual(Array.from(output.data),[220,190,180,0, 10,20,30,255]);
});

test('cannot apply a matte from another source or infer a missing matte',()=>{
  const source=image(2,1,[1,2,3,255,4,5,6,255]);
  const garment=image(2,1,[7,8,9,255,10,11,12,255]);
  assert.throws(()=>restoreFashionForegroundRND({original:source,garmentComposite:garment,foregroundAlpha:new Uint8Array([255])}),/geometry/);
  assert.throws(()=>restoreFashionForegroundRND({original:source,garmentComposite:garment,foregroundAlpha:new Uint8Array([0,0])}),/empty/);
  assert.throws(()=>restoreFashionForegroundRND({original:source,garmentComposite:{...garment,width:3},foregroundAlpha:new Uint8Array([255,0])}),/geometry/);
  assert.throws(()=>restoreFashionForegroundRND({original:{...source,orientation:6},garmentComposite:garment,foregroundAlpha:new Uint8Array([255,0])}),/geometry/);
});

test('does not mutate user source or garment composite arrays',()=>{
  const source=image(2,1,[1,2,3,255,4,5,6,255]);
  const garment=image(2,1,[7,8,9,255,10,11,12,255]);
  const expectedSource=Array.from(source.data),expectedGarment=Array.from(garment.data);
  const mask=new Uint8Array([128,255]);
  restoreFashionForegroundRND({original:source,garmentComposite:garment,foregroundAlpha:mask});
  assert.deepEqual(Array.from(source.data),expectedSource);
  assert.deepEqual(Array.from(garment.data),expectedGarment);
  assert.deepEqual(Array.from(mask),[128,255]);
});
