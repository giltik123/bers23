import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import sharp from 'sharp';

import { cropRgba8 } from '../src/platform/creative/deterministic/Crop.ts';
import { resizeRgba8 } from '../src/platform/creative/deterministic/Resize.ts';
import { orthogonalTransformRgba8 } from '../src/platform/creative/deterministic/OrthogonalTransform.ts';
import { maskedExposureRgba8 } from '../src/platform/creative/deterministic/MaskedExposure.ts';
import { maskedWhiteBalanceRgba8 } from '../src/platform/creative/deterministic/MaskedWhiteBalance.ts';
import { maskedLevelsRgba8 } from '../src/platform/creative/deterministic/MaskedLevels.ts';
import { isolateBackgroundRgba } from '../src/platform/creative/deterministic/BackgroundIsolation.ts';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_PREVIEW_PIXELS = 1024 * 1024;

async function downloadRealPhoto(sourceUrl) {
  const url=new URL(sourceUrl);
  if (url.protocol !== 'https:' || url.hostname !== 'upload.wikimedia.org' ||
      url.username || url.password || url.search || url.hash) {
    throw new Error('Editor quality fixture must use approved direct Wikimedia HTTPS source');
  }
  let error;
  for(let attempt=1;attempt<=3;attempt++){
    try{
      const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(35_000),headers:{accept:'image/jpeg,image/png,image/webp'}});
      if(!response.ok) throw new Error(`Fixture HTTP ${response.status}`);
      const declared=Number(response.headers.get('content-length'));
      if(Number.isFinite(declared)&&declared>MAX_SOURCE_BYTES) throw new Error('Fixture exceeds byte cap');
      const bytes=Buffer.from(await response.arrayBuffer());
      if(bytes.length===0||bytes.length>MAX_SOURCE_BYTES) throw new Error('Fixture bytes are missing or oversized');
      return bytes;
    } catch(err){
      error=err;
      if(attempt<3) await new Promise(resolve=>setTimeout(resolve,attempt*2500));
    }
  }
  throw error;
}

async function decodePhoto(bytes) {
  const decoded=await sharp(bytes,{failOn:'error',limitInputPixels:40_000_000})
    .rotate().resize({width:512,withoutEnlargement:false})
    .removeAlpha().ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(decoded.info.width,512);
  assert.equal(decoded.info.channels,4);
  assert.ok(decoded.info.height>=1&&decoded.info.height*512<=MAX_PREVIEW_PIXELS);
  return {width:decoded.info.width,height:decoded.info.height,rgba:new Uint8ClampedArray(decoded.data)};
}

async function pngFrom(image,width,height) {
  return sharp(Buffer.from(image),{raw:{width,height,channels:4}})
    .png({compressionLevel:9}).toBuffer();
}
function circularSelection(width,height) {
  const mask=new Uint8Array(width*height);
  const cx=(width-1)/2,cy=(height-1)/2;
  const rx=width*0.34,ry=height*0.37;
  for(let y=0;y<height;y++){
    for(let x=0;x<width;x++){
      const r=Math.sqrt(((x-cx)/rx)**2+((y-cy)/ry)**2);
      mask[y*width+x]=r<=0.82?255:r>=1?0:Math.floor((1-r)/0.18*255+0.5);
    }
  }
  return mask;
}
function assertProtectedAndAlpha(source,output,mask,operation) {
  assert.equal(source.byteLength,output.byteLength,`${operation} changed geometry`);
  let editable=0,protectedCount=0,changedEditable=0;
  for(let i=0;i<mask.length;i++){
    const o=i*4;
    assert.equal(output[o+3],source[o+3],`${operation} changed alpha at pixel ${i}`);
    if(mask[i]===0){
      protectedCount++;
      for(let c=0;c<4;c++) assert.equal(output[o+c],source[o+c],`${operation} leaked to protected pixel ${i}`);
    }else{
      editable++;
      if(output[o]!==source[o]||output[o+1]!==source[o+1]||output[o+2]!==source[o+2])changedEditable++;
    }
  }
  return {protectedPixels:protectedCount,editablePixels:editable,changedEditablePixels:changedEditable,changedProtectedPixels:0};
}
function assertExactPixelBytes(a,b,label) {
  assert.equal(a.length,b.length,`${label}: size mismatch`);
  assert.deepEqual(Buffer.from(a),Buffer.from(b),`${label}: RGBA bytes changed`);
}
function reverseRotate(source,width,height){
  let out=source;
  let w=width,h=height;
  for(let i=0;i<4;i++){
    out=orthogonalTransformRgba8(out,w,h,'ROTATE_90_CW');
    [w,h]=[h,w];
  }
  assert.equal(w,width); assert.equal(h,height);
  assertExactPixelBytes(out,source,'four exact 90-degree rotations');
}
function stats(values){
  const v=values.slice().sort((a,b)=>a-b);
  return {p50:v[Math.ceil(v.length*.5)-1],p95:v[Math.ceil(v.length*.95)-1]};
}
function capture(operation){
  operation();
  const timings=[];
  let result;
  for(let n=0;n<3;n++){
    const started=performance.now();
    result=operation();
    timings.push(performance.now()-started);
  }
  return {result,latencyMs:stats(timings)};
}

async function main(){
  const manifestPath=process.argv[2]||'config/v1-fashion-real-image-fixtures.json';
  const outDir=path.resolve(process.argv[3]||'.test-cache/editor-real-image-quality');
  const candidate=process.env.EXPECTED_SHA||'';
  if(!/^[a-f0-9]{40}$/.test(candidate))throw new Error('Exact candidate SHA required');
  const fixtures=JSON.parse(await readFile(manifestPath,'utf8'));
  if(fixtures.kind!=='BERS_V1_FASHION_REAL_IMAGE_FIXTURE_SET'||
      !Array.isArray(fixtures.projects)||fixtures.projects.length<3)throw new Error('Real image manifest invalid');
  await mkdir(outDir,{recursive:true});
  const records=[];
  const seen=new Set();
  for(const fixture of fixtures.projects) {
    if(typeof fixture.id!=='string'||!/^[a-z0-9-]+$/.test(fixture.id)||seen.has(fixture.id)||
        fixture.sourceKind!=='REAL_PHOTOGRAPH'||typeof fixture.licenseUrl!=='string'||!fixture.licenseUrl.startsWith('https://')) {
      throw new Error('Unlicensed or malformed editor quality fixture');
    }
    seen.add(fixture.id);
    const originalBytes=await downloadRealPhoto(fixture.sourceUrl);
    const {width,height,rgba}=await decodePhoto(originalBytes);
    const sourceBytes=Buffer.from(rgba);
    const dimensions={width,height};
    const selection=circularSelection(width,height);
    const crop={x:Math.floor(width*.18),y:Math.floor(height*.18),
      width:Math.max(1,Math.floor(width*.64)),height:Math.max(1,Math.floor(height*.64))};
    const operations=[
      {name:'crop',size:{width:crop.width,height:crop.height},
        execute:()=>cropRgba8(rgba,width,height,crop)},
      {name:'resize',size:{width:384,height:Math.max(1,Math.round(height*384/width))},
        execute:()=>resizeRgba8(rgba,width,height,{width:384,height:Math.max(1,Math.round(height*384/width))})},
      {name:'rotate_90',size:{width:height,height:width},
        execute:()=>orthogonalTransformRgba8(rgba,width,height,'ROTATE_90_CW')},
      {name:'masked_exposure',size:dimensions,
        execute:()=>maskedExposureRgba8(rgba,selection,width,height,4)},
      {name:'masked_white_balance',size:dimensions,
        execute:()=>maskedWhiteBalanceRgba8(rgba,selection,width,height,48,-16)},
      {name:'masked_levels',size:dimensions,
        execute:()=>maskedLevelsRgba8(rgba,selection,width,height,15,128,238,5,249)},
      {name:'background_isolation',size:dimensions,
        execute:()=>isolateBackgroundRgba(rgba,selection,width,height)},
    ];
    const originalPng=await pngFrom(rgba,width,height);
    const samples=[{name:'source',bytes:originalPng}];
    const operationResults=[];
    for(const item of operations){
      const before=Buffer.from(rgba);
      const {result,latencyMs}=capture(item.execute);
      assertExactPixelBytes(rgba,before,`${item.name} input`);
      assert.equal(result.length,item.size.width*item.size.height*4);
      let invariant={};
      if(item.name==='crop'){
        // Independent bottom-right pixel and row-region source mapping.
        for(let y=0;y<crop.height;y++) {
          const srcStart=((y+crop.y)*width+crop.x)*4;
          const dstStart=y*crop.width*4;
          assertExactPixelBytes(result.subarray(dstStart,dstStart+crop.width*4),rgba.subarray(srcStart,srcStart+crop.width*4),'crop row');
        }
        invariant={cropSourceExact:true};
      }else if(item.name==='rotate_90'){
        reverseRotate(rgba,width,height);
        invariant={fourRotationsByteExact:true};
      }else if(item.name==='resize'){
        assertExactPixelBytes(resizeRgba8(rgba,width,height,dimensions),rgba,'identity resize');
        invariant={identityResizeExact:true,alphaAwareInterpolation:true};
      }else if(item.name==='background_isolation'){
        for(let p=0;p<selection.length;p++){
          const o=p*4;
          for(let channel=0;channel<3;channel++)assert.equal(result[o+channel],rgba[o+channel]);
          assert.equal(result[o+3],Math.floor((rgba[o+3]*selection[p]+127)/255));
        }
        invariant={sourceRgbExact:true,alphaMaskFormulaExact:true};
      }else invariant=assertProtectedAndAlpha(rgba,result,selection,item.name);
      const png=await pngFrom(result,item.size.width,item.size.height);
      samples.push({name:item.name,bytes:png});
      operationResults.push({
        operation:item.name,outputSha256:sha256(png),
        outputWidth:item.size.width,outputHeight:item.size.height,
        latencyMs,invariant,
      });
    }

    const previewWidth=256,previewHeight=256;
    const tiles=await Promise.all(samples.map(async entry=>({
      input:await sharp(entry.bytes).resize(previewWidth,previewHeight,{
        fit:'contain',background:{r:40,g:40,b:40,alpha:1},
      }).png().toBuffer(),
      name:entry.name,
    })));
    const columns=4,rows=Math.ceil(tiles.length/columns);
    const sheet=await sharp({
      create:{width:columns*previewWidth,height:rows*previewHeight,channels:4,
        background:{r:24,g:24,b:24,alpha:1}},
    }).composite(tiles.map((tile,i)=>({
      input:tile.input,left:(i%columns)*previewWidth,
      top:Math.floor(i/columns)*previewHeight,
    }))).png({compressionLevel:9}).toBuffer();
    const samplePath=path.join(outDir,fixture.id);
    await mkdir(samplePath,{recursive:true});
    await Promise.all([
      ...samples.map(entry=>writeFile(path.join(samplePath,entry.name+'.png'),entry.bytes)),
      writeFile(path.join(samplePath,'comparison-grid.png'),sheet),
    ]);
    records.push({
      id:fixture.id,sourceKind:fixture.sourceKind,
      license:fixture.license,licenseUrl:fixture.licenseUrl,
      sourceUrl:fixture.sourceUrl,downloadSha256:sha256(originalBytes),
      decodedRgbaSha256:sha256(sourceBytes),comparisonGridSha256:sha256(sheet),
      geometry:dimensions,operationResults,
    });
  }
  const report={
    schemaVersion:1,kind:'BERS_EDITOR_REAL_IMAGE_FIDELITY_EVALUATION_RND',
    candidateSha:candidate,fixtures:records,
    sampleCount:records.length,perImageOperations:7,
    pixelInvariantStatus:'PASS',
    visualReviewStatus:'PENDING_INDEPENDENT_HUMAN_REVIEW',
    productionAuthorityGrantedByEvidence:false,releaseGateCleared:false,
    peakRssBytes:process.resourceUsage().maxRSS*1024,
    note:'Recorded photo quality has not been graded; processing outputs are not a substitute for Core browser/Project/Artifact acceptance.',
  };
  await writeFile(path.join(outDir,'editor-image-quality-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log('EDITOR_REAL_IMAGE_FIDELITY_CAPTURE_COMPLETE',JSON.stringify({
    candidateSha:candidate,photoCount:records.length,
    operations:records.length*7,
    invariants:report.pixelInvariantStatus,
    visualReview:report.visualReviewStatus,
    peakRssBytes:report.peakRssBytes,
  }));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
