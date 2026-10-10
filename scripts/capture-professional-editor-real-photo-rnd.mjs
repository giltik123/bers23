/**
 * Three actual photo comparisons for the isolated professional local raster
 * candidate. Images are downloaded only from the frozen licensed fixture set.
 * Important: the output is not a reviewer-approved quality grade.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import sharp from 'sharp';

import { resizeProfessionalLanczos3Rgba8RND } from '../src/platform/creative/deterministic/ProfessionalResizeLanczosRND.ts';
import { composeLinearLightLayersRgba8RND } from '../src/platform/creative/deterministic/ProfessionalLinearLayersRND.ts';
import { highlightProtectedToneRgba8RND } from '../src/platform/creative/deterministic/HighlightProtectedToneRND.ts';
import { resizeRgba8 } from '../src/platform/creative/deterministic/Resize.ts';
import { maskedExposureRgba8 } from '../src/platform/creative/deterministic/MaskedExposure.ts';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const MAX_DOWNLOAD_BYTES = 25_000_000;
const BENCHMARK_STOPS=16; // +2 stops: intentionally demanding stress case
function validateUrl(raw) {
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.hostname!=='upload.wikimedia.org'||
     !url.pathname.startsWith('/wikipedia/commons/')||url.search||url.hash||
     url.username||url.password)throw new Error('Untrusted third-party photo URL');
  return url;
}
async function download(sourceUrl) {
  const response=await fetch(validateUrl(sourceUrl),{
    redirect:'error',signal:AbortSignal.timeout(45_000),
    headers:{accept:'image/jpeg,image/png,image/webp',
      'user-agent':'BERS-Professional-Editor-Quality/1.0 (github.com/giltik123/bers23)'},
  });
  if(!response.ok)throw new Error(`Photo source returned HTTP ${response.status}`);
  const size=Number(response.headers.get('content-length'));
  if(Number.isFinite(size)&&size>MAX_DOWNLOAD_BYTES)throw new Error('Downloaded photo too large');
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length===0||bytes.length>MAX_DOWNLOAD_BYTES)throw new Error('Downloaded photo is empty/oversized');
  return bytes;
}
async function normalize(bytes) {
  const original=await sharp(bytes,{failOn:'error',limitInputPixels:40_000_000}).metadata();
  const {data,info}=await sharp(bytes,{failOn:'error',limitInputPixels:40_000_000})
    .rotate().resize({width:512,withoutEnlargement:false})
    .toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if(info.width!==512||info.height<1||info.height>2048||info.channels!==4)throw new Error('Source normalization outside QA bound');
  return {
    width:info.width,height:info.height,rgba:new Uint8ClampedArray(data),
    sourceIcc:original.hasProfile===true,sourceOrientation:original.orientation??null,
  };
}
function ellipseMask(width,height) {
  const mask=new Uint8Array(width*height);
  const cx=(width-1)/2,cy=(height-1)/2;
  const radiusX=width*.36,radiusY=height*.38;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const dist=Math.hypot((x-cx)/radiusX,(y-cy)/radiusY);
    mask[y*width+x]=dist<=.95?255:dist>=1.05?0:Math.round(255*(1.05-dist)/.1);
  }
  return mask;
}
function clipped(source,mask) {
  let visible=0,channelClip=0,nearWhite=0;
  for(let i=0;i<mask.length;i++){
    const o=i*4;
    if(mask[i]===0||source[o+3]===0)continue;
    visible++;
    if(Math.max(source[o],source[o+1],source[o+2])>=250)channelClip++;
    if(Math.min(source[o],source[o+1],source[o+2])>=250)nearWhite++;
  }
  return {visible,channelClip,nearWhite};
}
function meanAbsRgb(a,b){
  assert.equal(a.length,b.length);
  let sum=0,maximum=0,over24=0;
  for(let i=0;i<a.length;i+=4){
    let big=false;
    for(let k=0;k<3;k++){
      const delta=Math.abs(a[i+k]-b[i+k]);
      sum+=delta;maximum=Math.max(maximum,delta);
      if(delta>24)big=true;
    }
    if(big)over24++;
  }
  return {meanAbsoluteRgb:sum/(a.length/4*3),maximumRgbDelta:maximum,
    pixelsOver24RgbDelta:over24};
}
async function png(rgba,w,h){
  return sharp(Buffer.from(rgba),{raw:{width:w,height:h,channels:4}})
    .png({compressionLevel:9}).toBuffer();
}
async function contact(rows,width,height){
  // Row outputs are image buffers of identical geometry.
  const strip=await sharp({create:{width:rows.length*width,height,
    channels:4,background:{r:32,g:32,b:32,alpha:1}}})
    .composite(rows.map((input,i)=>({input,left:i*width,top:0})))
    .png({compressionLevel:9}).toBuffer();
  return strip;
}
async function main(){
  const candidateSha=process.env.EXPECTED_SHA;
  if(!/^[0-9a-f]{40}$/.test(candidateSha||''))throw new Error('Exact GitHub candidate SHA required');
  const fixtureSet=JSON.parse(await readFile('config/v1-fashion-real-image-fixtures.json','utf8'));
  if(fixtureSet.kind!=='BERS_V1_FASHION_REAL_IMAGE_FIXTURE_SET'||
     !Array.isArray(fixtureSet.projects)||fixtureSet.projects.length!==3)
    throw new Error('Missing frozen set of 3 real licensed photo fixtures');
  const out=path.resolve(process.argv[2]||'.test-cache/editor-pro-pixel-real-photo');
  await mkdir(out,{recursive:true});
  const records=[];
  for(const fixture of fixtureSet.projects){
    if(!/^[a-z0-9-]+$/.test(fixture.id)||fixture.sourceKind!=='REAL_PHOTOGRAPH'||
       typeof fixture.licenseUrl!=='string'||!fixture.licenseUrl.startsWith('https://commons.wikimedia.org/'))
      throw new Error('Unreviewed source attribution or photo');
    const raw=await download(fixture.sourceUrl);
    const {rgba,width,height,sourceIcc,sourceOrientation}=await normalize(raw);
    const before=Buffer.from(rgba);
    const mask=ellipseMask(width,height);
    const target={width:224,height:Math.max(1,Math.round(height*224/width))};

    const t0=performance.now();
    const v1=resizeRgba8(rgba,width,height,target);
    const v1ElapsedMs=performance.now()-t0;
    const t1=performance.now();
    const candidate=resizeProfessionalLanczos3Rgba8RND(rgba,width,height,target);
    const v2ElapsedMs=performance.now()-t1;
    const reference=await sharp(Buffer.from(rgba),{raw:{width,height,channels:4}})
      .resize({width:target.width,height:target.height,fit:'fill',kernel:'lanczos3'})
      .toColourspace('srgb').ensureAlpha().raw().toBuffer();
    assert.equal(candidate.length,reference.length);
    const comparisonAgainstSharp={
      oldBilinear:meanAbsRgb(v1,reference),
      professionalLinear:meanAbsRgb(candidate,reference),
    };
    // Sharp's default gamma treatment differs from our explicit linear RGB;
    // lower MAE against Sharp does not automatically imply higher quality.
    const brightOld=maskedExposureRgba8(rgba,mask,width,height,BENCHMARK_STOPS);
    const t2=performance.now();
    const brightNew=highlightProtectedToneRgba8RND(rgba,mask,width,height,
      {eighthStops:BENCHMARK_STOPS});
    const toneElapsedMs=performance.now()-t2;
    const toneBefore=clipped(rgba,mask),toneOld=clipped(brightOld,mask),toneNew=clipped(brightNew,mask);
    const newClipped=Math.max(0,toneNew.channelClip-toneBefore.channelClip);
    const oldClipped=Math.max(0,toneOld.channelClip-toneBefore.channelClip);

    // White translucent studio overlay is a layer blending stress test, NOT a
    // segmentation, garment-fit or semantic photographic retouch algorithm.
    const layerPixels=new Uint8Array(rgba.length);
    for(let i=0;i<layerPixels.length;i+=4){
      layerPixels[i]=255;layerPixels[i+1]=255;layerPixels[i+2]=255;layerPixels[i+3]=255;
    }
    const t3=performance.now();
    const blended=composeLinearLightLayersRgba8RND(rgba,width,height,[{
      id:'white-studio-fill',pixels:layerPixels,mask,opacityQ8:80,visible:true,blendMode:'NORMAL',
    }]);
    const layerElapsedMs=performance.now()-t3;
    assert.deepEqual(Buffer.from(rgba),before,'the input photograph must be immutable');
    let protectedChanges=0,protectedToneChanges=0;
    for(let i=0;i<mask.length;i++){
      if(mask[i]!==0)continue;
      const o=i*4;
      for(let ch=0;ch<4;ch++){
        if(blended[o+ch]!==rgba[o+ch])protectedChanges++;
        if(brightNew[o+ch]!==rgba[o+ch])protectedToneChanges++;
      }
    }
    assert.equal(protectedChanges,0,'The layer touched protected RGBA');
    assert.equal(protectedToneChanges,0,'The tone adjustment touched protected RGBA');
    // Increasing >+1 stop on these photos should show fewer new clipped
    // positions than legacy channel-clamped exposure, but we preserve all
    // counts and let human review judge the tonal intent.
    assert.ok(toneNew.channelClip <= toneOld.channelClip,
      'Highlight-protected candidate should not clip more channels than v1 stress case');
    const folder=path.join(out,fixture.id);
    await mkdir(folder,{recursive:true});
    const [sourcePng,oldResizePng,newResizePng,referencePng,oldTonePng,newTonePng,layerPng]=await Promise.all([
      png(rgba,width,height),png(v1,target.width,target.height),png(candidate,target.width,target.height),
      png(reference,target.width,target.height),png(brightOld,width,height),png(brightNew,width,height),
      png(blended,width,height),
    ]);
    const [resizeContact,toneContact]=await Promise.all([
      contact([oldResizePng,newResizePng,referencePng],target.width,target.height),
      contact([sourcePng,oldTonePng,newTonePng,layerPng],width,height),
    ]);
    await Promise.all([
      writeFile(path.join(folder,'source.png'),sourcePng),
      writeFile(path.join(folder,'resize-v1-bilinear.png'),oldResizePng),
      writeFile(path.join(folder,'resize-professional-lanczos3.png'),newResizePng),
      writeFile(path.join(folder,'resize-sharp-reference.png'),referencePng),
      writeFile(path.join(folder,'resize-three-way.png'),resizeContact),
      writeFile(path.join(folder,'tone-v1-hard-clipped.png'),oldTonePng),
      writeFile(path.join(folder,'tone-highlight-protected.png'),newTonePng),
      writeFile(path.join(folder,'layer-linear-light.png'),layerPng),
      writeFile(path.join(folder,'tone-four-way.png'),toneContact),
    ]);
    records.push({
      id:fixture.id,license:fixture.license,licenseUrl:fixture.licenseUrl,
      downloadedPhotoSha256:hash(raw),normalizedRgbaSha256:hash(before),
      sourceIcc,sourceOrientation,
      originalGeometry:{width,height},resizeGeometry:target,
      exactSourcePixelsUnchanged:true,protectedLayerChannelsChanged:protectedChanges,
      protectedToneChannelsChanged:protectedToneChanges,
      strongToneAdjustmentEighthStops:BENCHMARK_STOPS,
      originallyClippedPixels:toneBefore.channelClip,
      previousV1ClippedPixels:toneOld.channelClip,
      newHighlightProtectedClippedPixels:toneNew.channelClip,
      v1NewChannelClipped:oldClipped,professionalNewChannelClipped:newClipped,
      comparisonAgainstSharp,
      v1ResizeElapsedMs,professionalResizeElapsedMs:v2ElapsedMs,
      highlightProtectedToneElapsedMs:toneElapsedMs,linearLayerElapsedMs:layerElapsedMs,
      sourcePngSha256:hash(sourcePng),professionalResizePngSha256:hash(newResizePng),
      protectedTonePngSha256:hash(newTonePng),linearLightPngSha256:hash(layerPng),
    });
    console.log('PRO_EDITOR_REAL_PHOTO',fixture.id,JSON.stringify({
      newClippingBefore:oldClipped,newClippingAfter:newClipped,
      professionalResizeElapsedMs:v2ElapsedMs,protectedChanged:protectedChanges,
    }));
  }
  const report={
    kind:'BERS_EDITOR_PROFESSIONAL_RASTER_REAL_PHOTO_RND',
    schemaVersion:1,candidateSha,sampleCount:records.length,
    qualityGrade:'PENDING_INDEPENDENT_PHOTOGRAPHIC_REVIEW',
    coreAuthorityGranted:false,productionToolEnabled:false,
    originalResolutionPreservedInCapture:false, // deliberate 512px normalization
    cloudProviderUsed:false,peakRssBytes:process.resourceUsage().maxRSS*1024,
    resizePolicy:'ANTIALIASED_LANCZOS3_LINEAR_PREMULTIPLIED_ANTIRING',
    tonePolicy:'LINEAR_MAX_CHANNEL_RATIONAL_SOFT_SHOULDER',
    records,
  };
  await writeFile(path.join(out,'professional-raster-quality-manifest.json'),
    JSON.stringify(report,null,2)+'\n');
  console.log('PRO_EDITOR_RND_REAL_IMAGES_CAPTURED',JSON.stringify({
    sha:candidateSha,images:records.length,visualReview:report.qualityGrade,
  }));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
