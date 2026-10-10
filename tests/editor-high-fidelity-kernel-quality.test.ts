import assert from 'node:assert/strict';
import test from 'node:test';

import { cropRgba8 } from '../src/platform/creative/deterministic/Crop.ts';
import { resizeRgba8 } from '../src/platform/creative/deterministic/Resize.ts';
import {
  orthogonalTransformRgba8,
  orthogonalTransformOutputGeometry,
} from '../src/platform/creative/deterministic/OrthogonalTransform.ts';
import { maskedLevelsRgba8 } from '../src/platform/creative/deterministic/MaskedLevels.ts';
import { maskedExposureRgba8 } from '../src/platform/creative/deterministic/MaskedExposure.ts';
import { maskedWhiteBalanceRgba8 } from '../src/platform/creative/deterministic/MaskedWhiteBalance.ts';
import { isolateBackgroundRgba } from '../src/platform/creative/deterministic/BackgroundIsolation.ts';

function samplePixels(width: number, height: number): Uint8ClampedArray {
  const bytes = new Uint8ClampedArray(width * height * 4);
  let state = 0x72817419;
  for (let index = 0; index < bytes.length; index += 1) {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    bytes[index] = state & 255;
  }
  for (let pixel = 0; pixel < width * height; pixel += 7) {
    // Transparent pixels retain non-zero hidden RGB: an important regression case.
    bytes[pixel * 4 + 3] = 0;
  }
  return bytes;
}

function referenceCrop(bytes: Uint8ClampedArray, sourceWidth: number, rect: { x: number; y: number; width: number; height: number }): Uint8ClampedArray {
  const result = new Uint8ClampedArray(rect.width * rect.height * 4);
  for (let y = 0; y < rect.height; y += 1) {
    for (let x = 0; x < rect.width; x += 1) {
      for (let channel = 0; channel < 4; channel += 1) {
        result[(y * rect.width + x) * 4 + channel] =
          bytes[((rect.y + y) * sourceWidth + rect.x + x) * 4 + channel];
      }
    }
  }
  return result;
}

function referenceRotate(bytes: Uint8ClampedArray, width: number, height: number, mode: string): Uint8ClampedArray {
  const targetWidth = mode === 'ROTATE_90_CW' || mode === 'ROTATE_270_CW' ? height : width;
  const targetHeight = mode === 'ROTATE_90_CW' || mode === 'ROTATE_270_CW' ? width : height;
  const output = new Uint8ClampedArray(bytes.length);
  for (let sy = 0; sy < height; sy += 1) {
    for (let sx = 0; sx < width; sx += 1) {
      let x: number; let y: number;
      switch (mode) {
        case 'FLIP_HORIZONTAL': x = width - 1 - sx; y = sy; break;
        case 'FLIP_VERTICAL': x = sx; y = height - 1 - sy; break;
        case 'ROTATE_90_CW': x = height - 1 - sy; y = sx; break;
        case 'ROTATE_180': x = width - 1 - sx; y = height - 1 - sy; break;
        case 'ROTATE_270_CW': x = sy; y = width - 1 - sx; break;
        default: throw new Error('Unsupported reference orientation');
      }
      for (let channel = 0; channel < 4; channel += 1) {
        output[(y * targetWidth + x) * 4 + channel] =
          bytes[(sy * width + sx) * 4 + channel];
      }
    }
  }
  assert.equal(output.length, targetWidth * targetHeight * 4);
  return output;
}

test('Editor Crop exact reference oracle on varied geometry and transparent RGB', () => {
  for (const [width, height] of [[1,1],[2,9],[13,7],[64,33]]) {
    const pixels=samplePixels(width,height);
    const rects=[
      {x:0,y:0,width,height},
      {x:width-1,y:height-1,width:1,height:1},
      {x:Math.floor(width/4),y:Math.floor(height/4),width:Math.max(1,Math.floor(width/2)),height:Math.max(1,Math.floor(height/2))},
    ];
    const original=Uint8ClampedArray.from(pixels);
    for(const rect of rects) {
      assert.deepEqual([...cropRgba8(pixels,width,height,rect)],[...referenceCrop(pixels,width,rect)]);
    }
    assert.deepEqual([...pixels],[...original]);
  }
});

test('Editor Rotate/Flip independent destination-mapping oracle and lossless inverse', () => {
  for(const [width,height] of [[1,1],[1,19],[19,1],[17,11],[32,21]]) {
    const src=samplePixels(width,height);
    for(const mode of ['FLIP_HORIZONTAL','FLIP_VERTICAL','ROTATE_90_CW','ROTATE_180','ROTATE_270_CW'] as const) {
      const out=orthogonalTransformRgba8(src,width,height,mode);
      assert.deepEqual([...out],[...referenceRotate(src,width,height,mode)],mode);
      const geometry=orthogonalTransformOutputGeometry(width,height,mode);
      const inverseMode=mode==='ROTATE_90_CW'?'ROTATE_270_CW':mode==='ROTATE_270_CW'?'ROTATE_90_CW':mode;
      assert.deepEqual(
        [...orthogonalTransformRgba8(out,geometry.width,geometry.height,inverseMode)],
        [...src], `lossless ${mode} inverse on ${width}x${height}`,
      );
    }
  }
});

test('Editor Resize remains exact on unchanged dimensions, flat colors, and 1-pixel sources', () => {
  const original=samplePixels(16,9);
  const same=resizeRgba8(original,16,9,{width:16,height:9});
  assert.deepEqual([...same],[...original]);
  same[0]^=127;
  assert.notEqual(same[0],original[0]);
  const isolated=Uint8Array.from([12,240,73,171]);
  for(const [w,h] of [[1,1],[4,5],[71,63]]) {
    const output=resizeRgba8(isolated,1,1,{width:w,height:h});
    for(let i=0;i<w*h;i+=1) assert.deepEqual([...output.slice(i*4,i*4+4)],[...isolated]);
  }
  const solid=Uint8Array.from(Array.from({length:9},()=>[23,67,109,255]).flat());
  const scaled=resizeRgba8(solid,3,3,{width:17,height:11});
  for(let i=0;i<17*11;i+=1) assert.deepEqual([...scaled.slice(i*4,i*4+4)],[23,67,109,255]);
});

test('Editor Resize never leaks invisible RGB into opaque foreground during bilinear interpolation', () => {
  const pixels=Uint8Array.from([244,11,12,255, 4,250,249,0]);
  const output=resizeRgba8(pixels,2,1,{width:3,height:1});
  assert.deepEqual([...output.slice(4,8)],[244,11,12,128]);
  assert.deepEqual([...output.slice(0,4)],[244,11,12,255]);
  assert.deepEqual([...output.slice(8,12)],[4,250,249,0]);
});

const adjustments=[
  {name:'EXPOSURE',apply:(image:Uint8ClampedArray,mask:Uint8Array,w:number,h:number)=>
    maskedExposureRgba8(image,mask,w,h,4)},
  {name:'WHITE_BALANCE',apply:(image:Uint8ClampedArray,mask:Uint8Array,w:number,h:number)=>
    maskedWhiteBalanceRgba8(image,mask,w,h,48,-16)},
  {name:'LEVELS',apply:(image:Uint8ClampedArray,mask:Uint8Array,w:number,h:number)=>
    maskedLevelsRgba8(image,mask,w,h,15,128,238,5,249)},
];

test('Editor masked adjustments conserve every protected RGB+alpha byte and never mutate input', () => {
  for(const [width,height] of [[1,1],[12,8],[51,31]]) {
    const source=samplePixels(width,height);
    const backup=Uint8ClampedArray.from(source);
    const off=new Uint8Array(width*height);
    const on=Uint8Array.from({length:width*height},()=>255);
    const mixed=Uint8Array.from({length:width*height},(_,i)=>i%3===0?0:i%3===1?128:255);
    for(const {name,apply} of adjustments) {
      const none=apply(source,off,width,height);
      assert.deepEqual([...none],[...source],`${name}: all-zero matte`);
      const full=apply(source,on,width,height);
      const partial=apply(source,mixed,width,height);
      for(let pixel=0;pixel<width*height;pixel++) {
        const offset=pixel*4, mask=mixed[pixel];
        for(let channel=0;channel<3;channel++) {
          const expected=Math.floor((source[offset+channel]*(255-mask)+full[offset+channel]*mask+127)/255);
          assert.equal(partial[offset+channel],expected,`${name} pixel ${pixel} channel ${channel}`);
        }
        assert.equal(partial[offset+3],source[offset+3],`${name} alpha pixel ${pixel}`);
      }
      assert.deepEqual([...source],[...backup],`${name} source immutable`);
    }
  }
});

test('Editor Background Isolation retains RGB including hidden transparent colors', () => {
  const source=samplePixels(29,13);
  const mask=Uint8Array.from({length:29*13},(_,i)=>i%5===0?0:i%5===1?64:i%5===2?128:i%5===3?200:255);
  const output=isolateBackgroundRgba(source,mask,29,13);
  for(let pixel=0;pixel<29*13;pixel++) {
    const offset=pixel*4;
    assert.deepEqual([...output.slice(offset,offset+3)],[...source.slice(offset,offset+3)]);
    assert.equal(output[offset+3],Math.floor((source[offset+3]*mask[pixel]+127)/255));
  }
});

test('Editor geometry and masks reject malformed inputs instead of recovering with fabricated pixels', () => {
  const source=samplePixels(6,5);
  const bad=new Uint8Array(6*5-1);
  assert.throws(()=>cropRgba8(source,6,5,{x:0,y:0,width:7,height:1}),/bounds/);
  assert.throws(()=>resizeRgba8(source,6,5,{width:0,height:5}),/target width/);
  assert.throws(()=>orthogonalTransformRgba8(source,6,5,'ROTATE_45' as never),/unsupported/);
  for(const {apply} of adjustments) assert.throws(()=>apply(source,bad,6,5),/length/);
  assert.throws(()=>isolateBackgroundRgba(source,bad,6,5),/length/);
});
