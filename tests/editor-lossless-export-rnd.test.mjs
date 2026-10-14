import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import sharp from 'sharp';

import { prepareEditorLosslessPngExportRND } from '../src/application/editor/EditorLosslessExportRND.ts';

const SHA='a'.repeat(64);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const frame=(width,height)=>({
  width,height,format:'RGBA8',orientation:1,colorSpace:'srgb',
  data:Uint8ClampedArray.from(Array.from({length:width*height*4},(_,i)=>{
    if(i%4===3)return [0,1,127,255][Math.floor(i/4)%4];
    return (i*71+17)%256;
  })),
});
const run=(image=frame(3,2),overrides={})=>prepareEditorLosslessPngExportRND({
  sourceArtifactId:'artifact_1',sourceArtifactSha256:SHA,
  baseFileName:'bers_export',image,...overrides,
});

test('lossless export retains exact hidden RGB, soft alpha, dimensions and verified PNG SHA',async()=>{
  for(const [width,height] of [[1,1],[3,2],[11,13],[128,64]]){
    const original=frame(width,height);
    const source=Buffer.from(original.data);
    const result=await run(original);
    assert.equal(result.mimeType,'image/png');
    assert.equal(result.fileName,'bers_export.png');
    assert.equal(result.outputByteLength,result.bytes.byteLength);
    assert.equal(result.pixelSha256,hash(source));
    assert.equal(result.outputPngSha256,hash(result.bytes));
    assert.equal(result.cloudProviderUsed,false);
    assert.equal(result.coreAuthorityGranted,false);
    assert.equal(result.verificationState,'PNG_ENCODED_INDEPENDENT_DECODE_PENDING');
    assert.equal(Object.isFrozen(result),true);
    const metadata=await sharp(Buffer.from(result.bytes)).metadata();
    assert.equal(metadata.format,'png');
    assert.equal(metadata.width,width);
    assert.equal(metadata.height,height);
    const decoded=await sharp(Buffer.from(result.bytes)).ensureAlpha().toColourspace('srgb')
      .raw().toBuffer({resolveWithObject:true});
    assert.equal(decoded.info.width,width);
    assert.equal(decoded.info.height,height);
    assert.equal(decoded.info.channels,4);
    assert.deepEqual(Buffer.from(decoded.data),source,'full RGBA decoder parity');
    assert.deepEqual(Buffer.from(original.data),source,'source image must remain unchanged');
  }
});

test('same canonical pixels produce exact same PNG output and digest in same runtime',async()=>{
  const image=frame(10,7);
  const a=await run(image);
  const b=await run(image);
  assert.deepEqual(Buffer.from(a.bytes),Buffer.from(b.bytes));
  assert.equal(a.pixelSha256,b.pixelSha256);
  assert.equal(a.outputPngSha256,b.outputPngSha256);
});

test('export snapshots image before first await and guards output bytes against caller mutation',async()=>{
  const image=frame(5,4);
  const before=Buffer.from(image.data);
  const pending=run(image);
  image.data.fill(201);
  const result=await pending;
  const decoded=await sharp(Buffer.from(result.bytes)).ensureAlpha().toColourspace('srgb').raw().toBuffer();
  assert.deepEqual(Buffer.from(decoded),before);
  const bytes=result.bytes;
  bytes.fill(0);
  assert.equal(hash(result.bytes),result.outputPngSha256,'read-only digest must be stable after mutation of returned copy');
});

test('malformed geometry, wrong byte encoding and filename traversal fail closed',async()=>{
  const invalid=[
    {baseFileName:'../stolen'},
    {baseFileName:'my photo'},
    {baseFileName:'.'},
    {sourceArtifactSha256:'invalid'},
    {sourceArtifactId:'../wrong'},
    {image:{...frame(2,2),data:new Uint8Array(16)}},
    {image:{...frame(2,2),data:new Uint8ClampedArray(15)}},
    {image:{...frame(2,2),width:0}},
    {image:{...frame(2,2),width:16385}},
    {image:{...frame(2,2),width:8192,height:8192}},
    {image:{...frame(2,2),orientation:6}},
    {image:{...frame(2,2),colorSpace:'display-p3'}},
    {image:{...frame(2,2),format:'RGB24'}},
  ];
  for(const entry of invalid)await assert.rejects(run(frame(2,2),entry));
});

test('export implementation is strictly local, no provider/upload/Project commit authority',async()=>{
  const code=await readFile('src/application/editor/EditorLosslessExportRND.ts','utf8');
  for(const banned of ['Core.UploadFile','fetch(','axios','coreClient','persistFinal','acceptFinal','createObjectURL','providerCalls','billing']) {
    assert.equal(code.includes(banned),false,`unreviewed export side effect ${banned}`);
  }
  assert.match(code,/encodeDeterministicRgbaPng\(snapshot\)/u);
  assert.match(code,/get bytes\(\): Uint8Array/u);
  assert.match(code,/coreAuthorityGranted:false/u);
});
