import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import sharp from 'sharp';

import { composeEditorRasterLayersRgba8 } from '../src/platform/creative/deterministic/EditorRasterLayerStackRND.ts';
import { analyzeEditorTonalClippingRgba8 } from '../src/platform/creative/deterministic/EditorTonalClippingRND.ts';
import { inspectEditorColorDifferenceRgba8 } from '../src/platform/creative/deterministic/EditorColorDifferenceRND.ts';
import {
  analyzeEditorPixelQualityRgba8,
  requireEditorProtectedPixelsUnchanged,
} from '../src/platform/creative/deterministic/EditorQualityInspectorRND.ts';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const shaPattern=/^[0-9a-f]{40}$/u;
async function fetchPhoto(rawUrl) {
  const url=new URL(rawUrl);
  if(url.protocol!=='https:' || url.hostname!=='upload.wikimedia.org' ||
    !url.pathname.startsWith('/wikipedia/commons/') || url.search || url.hash ||
    url.username || url.password) throw new Error('Only fixed Wikimedia source photographs are admitted');
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(35_000),
    headers:{accept:'image/jpeg,image/png,image/webp','user-agent':'BERS-layer-quality-research/1.0 (github.com/giltik123/bers23)'}});
  if(!response.ok)throw new Error(`Real photo unavailable: HTTP ${response.status}`);
  const size=Number(response.headers.get('content-length'));
  if(Number.isFinite(size)&&size>25_000_000)throw new Error('Image download exceeds limit');
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length===0||bytes.length>25_000_000)throw new Error('Real photo input is empty/oversized');
  return bytes;
}
async function png(rgba,width,height){
  return sharp(Buffer.from(rgba),{raw:{width,height,channels:4}})
    .png({compressionLevel:9}).toBuffer();
}
async function normalize(bytes) {
  const {data,info}=await sharp(bytes,{failOn:'error',limitInputPixels:40_000_000})
    .rotate().resize({width:512,withoutEnlargement:false})
    .toColourspace('srgb').ensureAlpha().raw()
    .toBuffer({resolveWithObject:true});
  if(info.width!==512 || info.height<1 || info.height>2048 || info.channels!==4) {
    throw new Error('Invalid normalized source image geometry');
  }
  return {rgba:new Uint8ClampedArray(data),width:info.width,height:info.height};
}
function buildReviewLayer(width,height) {
  const pixels=new Uint8Array(width*height*4);
  const mask=new Uint8Array(width*height);
  const centerX=(width-1)/2,centerY=(height-1)/2;
  const radiusX=width*0.31,radiusY=height*0.35;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const pixel=y*width+x,o=pixel*4;
    const radius=Math.hypot((x-centerX)/radiusX,(y-centerY)/radiusY);
    // A carefully bounded transparent color-overlay test layer, NOT a real segmentation.
    mask[pixel]=radius<0.73?255:radius>=1?0:Math.round((1-radius)*255/0.27);
    pixels[o]=33;pixels[o+1]=130;pixels[o+2]=245;pixels[o+3]=175;
  }
  return {id:'manual-demo-blue',pixels,mask,visible:true,opacityQ8:165,blendMode:'NORMAL'};
}

async function main(){
  const expected=process.env.EXPECTED_SHA;
  if(typeof expected!=='string'||!shaPattern.test(expected))throw new Error('Exact branch SHA required');
  const out=path.resolve(process.argv[2]||'.test-cache/editor-layer-real-image-rnd');
  const fixtures=JSON.parse(await readFile('config/v1-fashion-real-image-fixtures.json','utf8'));
  if(fixtures.kind!=='BERS_V1_FASHION_REAL_IMAGE_FIXTURE_SET' ||
     !Array.isArray(fixtures.projects)||fixtures.projects.length!==3)throw new Error('Fixture set drift');
  await mkdir(out,{recursive:true});
  const reports=[];
  for(const [index,fixture] of fixtures.projects.entries()){
    if(!/^[a-z0-9-]+$/u.test(fixture.id) || fixture.sourceKind!=='REAL_PHOTOGRAPH' ||
       typeof fixture.licenseUrl!=='string' || !fixture.licenseUrl.startsWith('https://commons.wikimedia.org/')){
      throw new Error('Non-approved real-photo test identity');
    }
    const raw=await fetchPhoto(fixture.sourceUrl);
    const {rgba,width,height}=await normalize(raw);
    const layer=buildReviewLayer(width,height);
    const sourceBefore=Buffer.from(rgba);
    const maskBefore=Buffer.from(layer.mask);
    const stamp=performance.now();
    const output=composeEditorRasterLayersRgba8(rgba,width,height,[layer]);
    const runtimeMs=performance.now()-stamp;
    assert.deepEqual(Buffer.from(rgba),sourceBefore,'source pixels mutated');
    assert.deepEqual(Buffer.from(layer.mask),maskBefore,'mask mutated');
    const audit=analyzeEditorPixelQualityRgba8(rgba,output,width,height,layer.mask);
    const tonalDiagnostics=analyzeEditorTonalClippingRgba8(rgba,output,width,height,layer.mask);
    const colorDifference=inspectEditorColorDifferenceRgba8(rgba,output,width,height,layer.mask);
    assert.equal(colorDifference.qualityApproved,false);
    assert.ok(colorDifference.evaluatedOpaquePositions>0,'Color comparison lacked opaque pixels');
    requireEditorProtectedPixelsUnchanged(audit);
    assert.ok(audit.changedAuthorizedPixels>0,'layer did not produce real image edit');
    assert.ok(audit.protectedPixels>0,'mask must protect real original pixels');
    const sourcePng=await png(rgba,width,height);
    const resultPng=await png(output,width,height);
    const diff=new Uint8ClampedArray(output.length);
    for(let i=0;i<diff.length;i+=4){
      diff[i]=Math.abs(output[i]-rgba[i])*3;
      diff[i+1]=Math.abs(output[i+1]-rgba[i+1])*3;
      diff[i+2]=Math.abs(output[i+2]-rgba[i+2])*3;
      diff[i+3]=255;
    }
    const diffPng=await png(diff,width,height);
    // Source / R&D layer / amplified absolute RGB delta; separate PNGs preserve detail.
    const grid=await sharp({create:{width:width*3,height,channels:4,
      background:{r:20,g:20,b:20,alpha:1}}})
      .composite([
        {input:sourcePng,left:0,top:0},
        {input:resultPng,left:width,top:0},
        {input:diffPng,left:2*width,top:0},
      ]).png({compressionLevel:9}).toBuffer();
    const prefix=path.join(out,fixture.id);
    await mkdir(prefix,{recursive:true});
    await Promise.all([
      writeFile(path.join(prefix,'source.png'),sourcePng),
      writeFile(path.join(prefix,'layer-result.png'),resultPng),
      writeFile(path.join(prefix,'amplified-difference.png'),diffPng),
      writeFile(path.join(prefix,'comparison-grid.png'),grid),
    ]);
    reports.push({
      fixtureId:fixture.id,license:fixture.license,licenseUrl:fixture.licenseUrl,
      downloadedPhotoSha256:hash(raw),
      sourceRgbaSha256:hash(sourceBefore),
      sourcePngSha256:hash(sourcePng),
      resultPngSha256:hash(resultPng),
      comparisonGridSha256:hash(grid),
      layerR8MaskSha256:hash(maskBefore),
      geometry:{width,height},runtimeMs,audit,tonalDiagnostics,colorDifference,
      comparisonColumns:['SOURCE','RND_MASKED_SOURCE_OVER','ABSOLUTE_RGB_DIFFERENCE_X3'],
    });
    console.log('LAYER_PHOTO_RND',index+1,fixture.id,JSON.stringify({
      changedPixels:audit.changedPixels,protectedPixels:audit.protectedPixels,runtimeMs,
    }));
  }
  const report={
    schemaVersion:1,kind:'BERS_EDITOR_LAYER_REAL_IMAGE_REVIEW_RND',
    candidateSha:expected,sourceFixtureSet:'config/v1-fashion-real-image-fixtures.json',
    count:reports.length,sourceCodeClass:'RESEARCH_ONLY_NO_CORE_AUTHORITY',
    visualGrade:'PENDING_INDEPENDENT_HUMAN_REVIEW',
    productionEnabled:false,billingEnabled:false,cloudProviderUsed:false,
    peakRssBytes:process.resourceUsage().maxRSS*1024,reports,
  };
  await writeFile(path.join(out,'layer-photo-review-manifest.json'),JSON.stringify(report,null,2)+'\n');
  console.log('EDITOR_LAYER_REAL_IMAGE_REVIEW_CAPTURED',JSON.stringify({
    count:reports.length,candidateSha:expected,visualGrade:report.visualGrade,
    protectedPixelChanges:reports.reduce((sum,r)=>sum+r.audit.changedProtectedPixels,0),
  }));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
