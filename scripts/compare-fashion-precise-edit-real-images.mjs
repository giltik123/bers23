import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

import {
  composePreciseEditFeatheredRgba8,
  verifyPreciseEditPixelIntegrityRgba8,
} from '../src/platform/creative/deterministic/PreciseEditPixelLock.ts';

// Research comparison only. Never publish a QUALITY_VALIDATED decision here.
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const EXACT_SHA = /^[0-9a-f]{40}$/u;
const IDENTIFIER = /^[a-z0-9-]+(?:__[a-z0-9-]+)?$/u;

async function decodePng(bytes, expectedWidth, expectedHeight = null) {
  const image = sharp(bytes, { failOn: 'error' });
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.format !== 'raw' || info.width !== expectedWidth ||
      (expectedHeight !== null && info.height !== expectedHeight) ||
      info.channels !== 4 || info.height < 1 || info.width * info.height > 24_000_000) {
    throw new Error('Comparison source/candidate geometry mismatch');
  }
  return { data: new Uint8Array(data), width: info.width, height: info.height };
}

export function torsoBounds(corners, width, height) {
  if (!Array.isArray(corners) || corners.length !== 4 ||
      !corners.every(pair => Array.isArray(pair) && pair.length === 2 &&
        pair.every(value => Number.isFinite(value) && value >= 0 && value <= 1))) {
    throw new Error('Exact project torso geometry is required');
  }
  const margin = 3;
  return {
    left: Math.max(0, Math.floor(Math.min(...corners.map(pair => pair[0])) * (width-1))-margin),
    top: Math.max(0, Math.floor(Math.min(...corners.map(pair => pair[1])) * (height-1))-margin),
    right: Math.min(width-1,Math.ceil(Math.max(...corners.map(pair => pair[0])) * (width-1))+margin),
    bottom: Math.min(height-1,Math.ceil(Math.max(...corners.map(pair => pair[1])) * (height-1))+margin),
  };
}

export function maskAndCheckTorso(source, baseline, width, height, bounds) {
  const mask = new Uint8Array(width*height);
  let baselineChanged = 0;
  let outsideTorso = 0;
  for(let y=0;y<height;y+=1) {
    for(let x=0;x<width;x+=1) {
      const pixel=y*width+x, offset=pixel*4;
      const changed = source[offset] !== baseline[offset] ||
        source[offset+1] !== baseline[offset+1] ||
        source[offset+2] !== baseline[offset+2] ||
        source[offset+3] !== baseline[offset+3];
      if (!changed) continue;
      baselineChanged += 1;
      if (x<bounds.left || x>bounds.right || y<bounds.top || y>bounds.bottom) {
        outsideTorso += 1;
      } else {
        mask[pixel]=255;
      }
    }
  }
  return { mask, baselineChanged, outsideTorso };
}

async function main() {
  const captureDir = path.resolve(process.argv[2] ?? '.test-cache/fashion-real-image-quality');
  const fixturePath = path.resolve(process.argv[3] ?? 'config/v1-fashion-real-image-fixtures.json');
  const outputDir = path.resolve(process.argv[4] ?? '.test-cache/fashion-precise-edit-comparison');
  const [machine, fixtures] = await Promise.all([
    readFile(path.join(captureDir,'machine-evidence.json'),'utf8').then(JSON.parse),
    readFile(fixturePath,'utf8').then(JSON.parse),
  ]);
  if (machine.kind !== 'BERS_V1_FASHION_REAL_IMAGE_QUALITY_CAPTURE' ||
      !EXACT_SHA.test(machine.candidateSha) ||
      machine.decision !== 'PENDING_HUMAN_REVIEW' ||
      machine.productionAuthorityGrantedByEvidence !== false ||
      !Array.isArray(machine.samples) || machine.samples.length < 6) {
    throw new Error('Cannot compare untrusted or insufficient real-image capture');
  }
  const projects = new Map(fixtures.projects.map(x=>[x.id,x]));
  const records = [];
  await mkdir(outputDir,{recursive:true});
  for(const sample of machine.samples) {
    if (!IDENTIFIER.test(sample.id) || !IDENTIFIER.test(sample.projectId) ||
        !projects.has(sample.projectId)) throw new Error('Unrecognized research sample identity');
    const sourceBytes = await readFile(path.join(captureDir,'sources',`${sample.projectId}.png`));
    const candidateBytes = await readFile(path.join(captureDir,'outputs',`${sample.id}.png`));
    if (sha256(candidateBytes) !== sample.outputSha256) {
      throw new Error(`Baseline F4 output bytes drifted for ${sample.id}`);
    }
    const source = await decodePng(sourceBytes, fixtures.preprocessing.project.width);
    const candidate = await decodePng(candidateBytes, source.width, source.height);
    const bounds=torsoBounds(projects.get(sample.projectId).torsoQ16Normalized,source.width,source.height);
    const {mask,baselineChanged,outsideTorso}=maskAndCheckTorso(
      source.data,candidate.data,source.width,source.height,bounds,
    );
    if(outsideTorso !== 0 || baselineChanged === 0) {
      throw new Error(`Existing baseline changed ${outsideTorso} pixels beyond torso or made no edit: ${sample.id}`);
    }
    const began=performance.now();
    const refined=composePreciseEditFeatheredRgba8(source.data,candidate.data,mask,source.width,source.height,1);
    const elapsedMs=performance.now()-began;
    const audit=verifyPreciseEditPixelIntegrityRgba8(source.data,refined,mask,source.width,source.height);
    const refinedPng=await sharp(Buffer.from(refined),{
      raw:{width:source.width,height:source.height,channels:4},
    }).png({compressionLevel:9}).toBuffer();
    const sourcePng=await sharp(Buffer.from(source.data),{
      raw:{width:source.width,height:source.height,channels:4},
    }).png().toBuffer();
    const baselinePng=await sharp(Buffer.from(candidate.data),{
      raw:{width:source.width,height:source.height,channels:4},
    }).png().toBuffer();
    const visual=await sharp({
      create:{width:source.width*3,height:source.height,channels:4,
        background:{r:0,g:0,b:0,alpha:0}},
    }).composite([
      {input:sourcePng,left:0,top:0},
      {input:baselinePng,left:source.width,top:0},
      {input:refinedPng,left:source.width*2,top:0},
    ]).png({compressionLevel:9}).toBuffer();
    await Promise.all([
      writeFile(path.join(outputDir,`${sample.id}--comparison.png`),visual),
      writeFile(path.join(outputDir,`${sample.id}--refined.png`),refinedPng),
    ]);
    let differingFromBaseline=0;
    for(let i=0;i<refined.length;i+=4){
      if(refined[i]!==candidate.data[i] || refined[i+1]!==candidate.data[i+1] ||
         refined[i+2]!==candidate.data[i+2] || refined[i+3]!==candidate.data[i+3]) differingFromBaseline++;
    }
    records.push({
      id:sample.id, originalOutputSha256:sample.outputSha256,
      refinedOutputSha256:sha256(refinedPng), comparisonPngSha256:sha256(visual),
      baselineChangedPixelCount:baselineChanged, baselineChangedOutsideTorsoPixelCount:outsideTorso,
      refinedDifferentFromBaselinePixelCount:differingFromBaseline,
      protectedPixelCount:audit.protectedPixelCount,
      changedProtectedPixelCount:audit.changedProtectedPixelCount,
      allowedPixelCount:audit.allowedPixelCount,
      refinedLatencyMs:elapsedMs,
      sourceWidth:source.width, sourceHeight:source.height,
    });
  }
  const manifest={
    schemaVersion:1,kind:'BERS_FASHION_PRECISE_EDIT_REAL_IMAGE_COMPARISON_RND',
    candidateSha:machine.candidateSha, sourceFixtureSetSha256:machine.fixtureSetSha256,
    sampleCount:records.length, comparisonColumns:['SOURCE','BASELINE_F4','RND_INWARD_FEATHER'],
    seamRadius:1, matteDerivation:'DIFFERING_PIXELS_WITHIN_FIXED_TORSO_BOUNDS_RESEARCH_ONLY',
    reviewStatus:'PENDING_INDEPENDENT_VISUAL_REVIEW', productionAuthorityGranted:false,
    providerAuthorityGranted:false,billingAuthorityGranted:false,records,
  };
  await writeFile(path.join(outputDir,'comparison-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log('FASHION_PRECISE_EDIT_REAL_IMAGE_COMPARISON_RND',JSON.stringify({
    sampleCount:records.length,changedProtectedPixels:records.reduce((n,r)=>n+r.changedProtectedPixelCount,0),
    modifiedComparisons:records.filter(r=>r.refinedDifferentFromBaselinePixelCount>0).length,
    reviewStatus:manifest.reviewStatus,
  }));
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
