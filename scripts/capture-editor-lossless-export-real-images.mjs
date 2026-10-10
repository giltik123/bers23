import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import sharp from 'sharp';

import { prepareEditorLosslessPngExportRND } from '../src/application/editor/EditorLosslessExportRND.ts';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const shaPattern=/^[0-9a-f]{40}$/u;
async function download(urlString) {
  const url = new URL(urlString);
  if (url.protocol !== 'https:' || url.hostname !== 'upload.wikimedia.org' ||
      !url.pathname.startsWith('/wikipedia/commons/') || url.username || url.password ||
      url.search || url.hash) {
    throw new Error('Only direct fixed Wikimedia fixture photographs are authorized');
  }
  const response=await fetch(url,{
    redirect:'error',signal:AbortSignal.timeout(35000),
    headers:{accept:'image/jpeg,image/png,image/webp','user-agent':'BERS-Editor-Lossless-QA/1.0 (github.com/giltik123/bers23)'},
  });
  if (!response.ok) throw new Error(`Real-photo source returned HTTP ${response.status}`);
  const announced=Number(response.headers.get('content-length'));
  if (Number.isFinite(announced)&&announced>25_000_000)throw new Error('Real-photo source content exceeds 25MB');
  const payload=Buffer.from(await response.arrayBuffer());
  if (!payload.length||payload.length>25_000_000)throw new Error('Real-photo source empty or too large');
  return payload;
}
async function decodeCanonical(bytes) {
  const original=sharp(bytes,{failOn:'error',limitInputPixels:40_000_000});
  const meta=await original.metadata();
  const {data,info}=await sharp(bytes,{failOn:'error',limitInputPixels:40_000_000})
    .rotate().resize({width:512,withoutEnlargement:false})
    .toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if(info.width!==512||info.height<1||info.height>2048||info.channels!==4)
    throw new Error('Real-photo normalization exceeded renderer resource budget');
  return {image:{width:info.width,height:info.height,
      format:'RGBA8',orientation:1,colorSpace:'srgb',data:new Uint8ClampedArray(data)},
    inputFormat:meta.format,hadIccProfile:meta.hasProfile===true,exifOrientation:meta.orientation??null};
}
async function main() {
  const expected=process.env.EXPECTED_SHA;
  if(!shaPattern.test(expected??''))throw new Error('Exact commit SHA required');
  const fixtures=JSON.parse(await readFile('config/v1-fashion-real-image-fixtures.json','utf8'));
  if(fixtures.kind!=='BERS_V1_FASHION_REAL_IMAGE_FIXTURE_SET' ||
      !Array.isArray(fixtures.projects)||fixtures.projects.length!==3) throw new Error('Unexpected real image set');
  const output=path.resolve(process.argv[2]||'.test-cache/editor-export-real-image-quality');
  await mkdir(output,{recursive:true});
  const records=[];
  for(const fixture of fixtures.projects) {
    if(!/^[a-z0-9-]+$/u.test(fixture.id) || fixture.sourceKind!=='REAL_PHOTOGRAPH' ||
       typeof fixture.licenseUrl!=='string' || !fixture.licenseUrl.startsWith('https://commons.wikimedia.org/')){
      throw new Error('Untrusted real-image license/fixture declaration');
    }
    const bytes=await download(fixture.sourceUrl);
    const {image,inputFormat,hadIccProfile,exifOrientation}=await decodeCanonical(bytes);
    const sourceBytes=Buffer.from(image.data);
    const inputDigest=hash(bytes);
    const t0=performance.now();
    const exportCandidate=await prepareEditorLosslessPngExportRND({
      sourceArtifactId:'research_fixture_'+fixture.id,
      sourceArtifactSha256:hash(sourceBytes),
      baseFileName:'bers_'+fixture.id,
      image,
    });
    const elapsed=performance.now()-t0;
    const png=Buffer.from(exportCandidate.bytes);
    if(hash(png)!==exportCandidate.outputPngSha256 ||
       hash(sourceBytes)!==exportCandidate.pixelSha256)throw new Error('Export SHA proof mismatch');
    const decoded=await sharp(png).ensureAlpha().toColourspace('srgb')
      .raw().toBuffer({resolveWithObject:true});
    if(decoded.info.width!==image.width||decoded.info.height!==image.height||decoded.info.channels!==4)
      throw new Error('Export decoded geometry changed');
    assert.deepEqual(Buffer.from(decoded.data),sourceBytes,'Real-photo RGBA decoding must remain exact');
    const second=await prepareEditorLosslessPngExportRND({
      sourceArtifactId:'research_fixture_'+fixture.id,
      sourceArtifactSha256:hash(sourceBytes),baseFileName:'bers_'+fixture.id,image,
    });
    assert.deepEqual(Buffer.from(second.bytes),png,'Real-photo PNG must be deterministic in this runner');
    await writeFile(path.join(output,fixture.id+'.png'),png);
    records.push({
      fixtureId:fixture.id,license:fixture.license,licenseUrl:fixture.licenseUrl,
      inputFormat,hadIccProfile,exifOrientation,originalPhotoSha256:inputDigest,
      canonicalSourcePixelSha256:hash(sourceBytes),
      exactLosslessDecodedPixelMatch:true,
      pngSha256:hash(png),pngByteLength:png.length,
      sourceWidth:image.width,sourceHeight:image.height,
      encodeAndHashMs:elapsed,authority:'NONE_RESEARCH_ONLY',
    });
  }
  const manifest={
    kind:'BERS_EDITOR_EXPORT_REAL_PHOTO_QUALITY_RND',schemaVersion:1,
    candidateSha:expected,sampleCount:records.length,
    exactDecodedRgbaParity:true,pngDeterministicOnOneRunner:true,
    status:'PENDING_INDEPENDENT_REVIEW',
    sourceNormalization:'ROTATE_EXIF_AND_SRGB_512W_BEFORE_EXPORT',
    outputSourceAuthorityGranted:false,productionEnabled:false,
    cloudProviderUsed:false,
    peakRssBytes:process.resourceUsage().maxRSS*1024,
    records,
  };
  await writeFile(path.join(output,'editor-export-quality-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log('BERS_EDITOR_REAL_IMAGE_PNG_PARITY',JSON.stringify({
    sha:expected,sampleCount:records.length,
    decodedRgbaMatch:manifest.exactDecodedRgbaParity,visualReview:manifest.status,
  }));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
