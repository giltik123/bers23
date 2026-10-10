/**
 * Reproducible real-photo QA for source-bound Batch Studio R&D.
 *
 * Downloads exactly the existing three publicly licensed Fashion project
 * photographs. This measures the current deterministic Editor Crop/Resize/
 * Rotate operations, never a model or an automatic production bulk edit.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import sharp from 'sharp';

import {
  compileEditorBatchPlanRND,
  executeEditorBatchPlanRND,
} from '../src/platform/creative/deterministic/EditorBatchStudioRND.ts';
import { cropRgba8 } from '../src/platform/creative/deterministic/Crop.ts';
import { resizeRgba8 } from '../src/platform/creative/deterministic/Resize.ts';
import { orthogonalTransformRgba8 } from '../src/platform/creative/deterministic/OrthogonalTransform.ts';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const MAX_DOWNLOAD_BYTES = 25_000_000;

async function fetchFixtureImage(sourceUrl) {
  const url = new URL(sourceUrl);
  if (url.protocol !== 'https:' || url.hostname !== 'upload.wikimedia.org' ||
      !url.pathname.startsWith('/wikipedia/commons/') ||
      url.username || url.password || url.search || url.hash) {
    throw new Error('Unapproved external photo source for Batch Studio QA');
  }
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(45_000),
    headers: {
      accept: 'image/jpeg,image/png,image/webp',
      'user-agent': 'BERS-Batch-Studio-Quality/1.0 (github.com/giltik123/bers23)',
    },
  });
  if (!response.ok) throw new Error(`Fixture download HTTP ${response.status}`);
  const announced = Number(response.headers.get('content-length'));
  if (Number.isFinite(announced) && announced > MAX_DOWNLOAD_BYTES) {
    throw new Error('Fixture download exceeds allowed byte budget');
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_DOWNLOAD_BYTES) {
    throw new Error('Missing or oversized real-photo fixture');
  }
  return bytes;
}

async function inputFrame(input) {
  const meta = await sharp(input, {
    failOn: 'error', limitInputPixels: 40_000_000,
  }).metadata();
  const decoded = await sharp(input, {
    failOn: 'error', limitInputPixels: 40_000_000,
  }).rotate().resize({ width: 512, withoutEnlargement: false })
    .toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = decoded.info;
  if (width !== 512 || height < 1 || height > 2048 || channels !== 4) {
    throw new Error('Canonical QA photo geometry outside budget');
  }
  return {
    width, height, rgba: new Uint8ClampedArray(decoded.data),
    originalColorSpace: meta.space,
    originalOrientation: meta.orientation ?? null,
    originalHasIccProfile: meta.hasProfile === true,
  };
}

async function encodePng(rgba, width, height) {
  return sharp(Buffer.from(rgba), { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9 }).toBuffer();
}

function directReference(input, width, height, rect, target) {
  const cropped = cropRgba8(input, width, height, rect);
  const resized = resizeRgba8(cropped, rect.width, rect.height, target);
  return orthogonalTransformRgba8(resized, target.width, target.height, 'ROTATE_90_CW');
}

async function main() {
  const candidateSha = process.env.EXPECTED_SHA;
  if (!/^[0-9a-f]{40}$/.test(candidateSha || '')) {
    throw new Error('Exact PR candidate SHA must be supplied');
  }
  const fixtureSet = JSON.parse(await readFile('config/v1-fashion-real-image-fixtures.json', 'utf8'));
  if (fixtureSet.kind !== 'BERS_V1_FASHION_REAL_IMAGE_FIXTURE_SET' ||
      !Array.isArray(fixtureSet.projects) || fixtureSet.projects.length !== 3) {
    throw new Error('Three approved original photograph fixtures required');
  }
  const outDir = path.resolve(process.argv[2] || '.test-cache/editor-batch-real-photo');
  await mkdir(outDir, { recursive: true });
  const records = [];
  for (const photo of fixtureSet.projects) {
    if (!/^[a-z0-9-]+$/.test(photo.id) || photo.sourceKind !== 'REAL_PHOTOGRAPH' ||
        typeof photo.licenseUrl !== 'string' ||
        !photo.licenseUrl.startsWith('https://commons.wikimedia.org/')) {
      throw new Error('Unexpected/unlicensed image fixture');
    }
    const downloaded = await fetchFixtureImage(photo.sourceUrl);
    const frame = await inputFrame(downloaded);
    const rect = {
      x: Math.floor(frame.width / 10),
      y: Math.floor(frame.height / 10),
      width: Math.floor(frame.width * 0.8),
      height: Math.floor(frame.height * 0.8),
    };
    const target = { width: 320, height: Math.max(1, Math.round(rect.height * 320 / rect.width)) };
    const steps = [
      { kind: 'CROP', rect },
      { kind: 'RESIZE', target },
      { kind: 'ORTHOGONAL_TRANSFORM', mode: 'ROTATE_90_CW' },
    ];
    const decodedSha = sha256(Buffer.from(frame.rgba));
    const plan = compileEditorBatchPlanRND({
      sourceArtifactId: 'qa_' + photo.id,
      sourceSha256: decodedSha,
      width: frame.width,
      height: frame.height,
      steps,
    });
    const original = Buffer.from(frame.rgba);
    const started = performance.now();
    const result = await executeEditorBatchPlanRND(plan, frame.rgba);
    const elapsedMs = performance.now() - started;
    assert.equal(result.width, target.height);
    assert.equal(result.height, target.width);
    assert.deepEqual(Buffer.from(frame.rgba), original, 'Original pixels must remain unchanged');
    const expected = directReference(frame.rgba, frame.width, frame.height, rect, target);
    assert.deepEqual(Buffer.from(result.bytes), Buffer.from(expected),
      'Batch pixels must match direct canonical operations exactly');
    assert.equal(result.outputSha256, sha256(Buffer.from(expected)));
    assert.equal(result.sourceSha256, decodedSha);
    assert.equal(result.executedStepCount, 3);
    assert.equal(result.cloudProviderUsed, false);
    assert.equal(result.coreAuthorityGranted, false);

    const rerun = await executeEditorBatchPlanRND(plan, new Uint8ClampedArray(original));
    assert.equal(rerun.outputSha256, result.outputSha256, 'Repeated deterministic result differs');
    assert.deepEqual(Buffer.from(rerun.bytes), Buffer.from(result.bytes));
    // A one-byte source substitution must invalidate the declared source SHA.
    const tampered = new Uint8ClampedArray(original);
    tampered[0] ^= 1;
    await assert.rejects(executeEditorBatchPlanRND(plan, tampered), /source SHA mismatch/);

    const originalPng = await encodePng(frame.rgba, frame.width, frame.height);
    const resultPng = await encodePng(result.bytes, result.width, result.height);
    const referencePng = await encodePng(expected, result.width, result.height);
    const folder = path.join(outDir, photo.id);
    await mkdir(folder, { recursive: true });
    await Promise.all([
      writeFile(path.join(folder, 'original-normalized.png'), originalPng),
      writeFile(path.join(folder, 'batch-result.png'), resultPng),
      writeFile(path.join(folder, 'canonical-direct-reference.png'), referencePng),
    ]);

    records.push({
      id: photo.id,
      license: photo.license,
      licenseUrl: photo.licenseUrl,
      rawDownloadSha256: sha256(downloaded),
      decodedSourceSha256: decodedSha,
      originalColorSpace: frame.originalColorSpace,
      originalOrientation: frame.originalOrientation,
      originalHasIccProfile: frame.originalHasIccProfile,
      inputGeometry: { width: frame.width, height: frame.height },
      outputGeometry: { width: result.width, height: result.height },
      exactRgbaMatch: true,
      protectedSourceUnchanged: true,
      repeatedSourceShaCheckPassed: true,
      originalPngSha256: sha256(originalPng),
      batchPngSha256: sha256(resultPng),
      referencePngSha256: sha256(referencePng),
      outputPixelSha256: result.outputSha256,
      steps,
      planPixelVisitBudget: plan.estimatedPixelVisits,
      elapsedMs,
    });
    console.log('EDITOR_BATCH_REAL_PHOTO_CHECKED', JSON.stringify({
      id: photo.id, exactRgbaMatch: true, sourceSha: decodedSha,
      outputSha: result.outputSha256, elapsedMs,
    }));
  }
  const manifest = {
    kind: 'BERS_EDITOR_BATCH_REAL_PHOTO_QUALITY_RND',
    schemaVersion: 1,
    candidateSha,
    sampleCount: records.length,
    totalExecutedOperations: records.length * 3,
    byteExactVsCanonicalOperations: true,
    sourceIntegrity: 'SHA256_RECALCULATED_FROM_ACTUAL_RGBA',
    humanVisualGrade: 'PENDING_INDEPENDENT_REVIEW',
    productionAuthorityGranted: false,
    cloudProviderUsed: false,
    peakRssBytes: process.resourceUsage().maxRSS * 1024,
    records,
  };
  await writeFile(path.join(outDir, 'editor-batch-real-photo-manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n');
  console.log('EDITOR_BATCH_REAL_PHOTO_QUALITY_COMPLETE', JSON.stringify({
    sampleCount: manifest.sampleCount,
    exactRgbaMatch: manifest.byteExactVsCanonicalOperations,
    visualReview: manifest.humanVisualGrade,
  }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
