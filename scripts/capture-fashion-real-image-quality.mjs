import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import sharp from 'sharp';

import {
  GARMENT_TEXTURE_COMPOSITE_ALPHA_POLICY,
  GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
  GARMENT_TEXTURE_COMPOSITE_FIXED_POINT_ONE,
  GARMENT_TEXTURE_COMPOSITE_WRAP_MODE,
  garmentTextureCompositeRgba8,
} from '../src/platform/creative/deterministic/GarmentTextureComposite.ts';

const ONE = GARMENT_TEXTURE_COMPOSITE_FIXED_POINT_ONE;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

function parseArgs(argv) {
  const result = { manifest: 'config/v1-fashion-real-image-fixtures.json', out: '.test-cache/fashion-real-image-quality', candidate: process.env.EXPECTED_SHA || '' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--manifest') result.manifest = argv[++i];
    else if (arg === '--out') result.out = argv[++i];
    else if (arg === '--candidate') result.candidate = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!/^[0-9a-f]{40}$/.test(result.candidate)) throw new Error('Exact 40-hex candidate SHA is required');
  return result;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function q16(value) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('normalized Q16 coordinate must be within [0,1]');
  return Math.floor(value * ONE + 0.5);
}

function percentile(values, p) {
  if (!values.length) throw new Error('percentile requires values');
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(sorted.length - 1, rank - 1)];
}

async function downloadFixture(fixture) {
  let lastError;
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(fixture.sourceUrl, {
        redirect: 'follow',
        headers: {
          'user-agent': 'BERS-v1-real-image-quality-evidence/1.0 (github.com/giltik123/bers23)',
          accept: 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        const retryAfterSeconds = Number(response.headers.get('retry-after'));
        const error = new Error(`HTTP ${response.status} for ${fixture.id}`);
        error.retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? retryAfterSeconds * 1000
          : null;
        throw error;
      }
      const type = response.headers.get('content-type') || '';
      if (!/^image\//i.test(type)) throw new Error(`Non-image content type for ${fixture.id}: ${type}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length < 1 || buffer.length > MAX_SOURCE_BYTES) throw new Error(`Source byte size out of bounds for ${fixture.id}: ${buffer.length}`);
      return {
        bytes: buffer,
        contentType: type,
        resolvedUrl: response.url,
        sha256: sha256(buffer),
        sizeBytes: buffer.length,
      };
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        const fallbackMs = [2000, 8000, 20000][attempt - 1];
        const retryAfterMs = Number(error?.retryAfterMs);
        const delayMs = Math.max(fallbackMs, Number.isFinite(retryAfterMs) ? retryAfterMs : 0);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}

async function decodeProject(bytes, width, height) {
  const pipeline = sharp(bytes).rotate().resize(width, height, {
    fit: 'cover',
    position: 'centre',
    withoutEnlargement: false,
  }).removeAlpha().ensureAlpha();
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  if (info.width !== width || info.height !== height || info.channels !== 4) throw new Error('Project preprocess geometry mismatch');
  return { rgba: new Uint8ClampedArray(data), width: info.width, height: info.height };
}

async function decodeGarment(bytes, width, height) {
  const pipeline = sharp(bytes).rotate().resize(width, height, {
    fit: 'contain',
    position: 'centre',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
    withoutEnlargement: false,
  }).ensureAlpha();
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  if (info.width !== width || info.height !== height || info.channels !== 4) throw new Error('Garment preprocess geometry mismatch');
  return { rgba: new Uint8ClampedArray(data), width: info.width, height: info.height };
}

function warpSpec(project, torso) {
  if (!Array.isArray(torso) || torso.length !== 4) throw new Error('torsoQ16Normalized must contain four corners');
  const sourcePointsQ16 = [[0,0],[ONE,0],[ONE,ONE],[0,ONE]];
  const destinationPointsQ16 = torso.map(([x,y]) => [q16(x), q16(y)]);
  return {
    sourcePointsQ16,
    destinationPointsQ16,
    triangles: [[0,1,2],[0,2,3]],
    outputWidth: project.width,
    outputHeight: project.height,
  };
}

const textureSpec = Object.freeze({
  textureTransform: Object.freeze({
    scaleXQ16: ONE,
    scaleYQ16: ONE,
    offsetXQ16: 0,
    offsetYQ16: 0,
    wrapMode: GARMENT_TEXTURE_COMPOSITE_WRAP_MODE,
    alphaPolicy: GARMENT_TEXTURE_COMPOSITE_ALPHA_POLICY,
  }),
  featherRadius: 2,
  colorSpacePolicy: GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
});

async function pngFromRgba(rgba, width, height) {
  return sharp(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), {
    raw: { width, height, channels: 4 },
  }).png({ compressionLevel: 9 }).toBuffer();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(args.manifest, 'utf8'));
  if (manifest.kind !== 'BERS_V1_FASHION_REAL_IMAGE_FIXTURE_SET') throw new Error('Fixture manifest kind mismatch');
  if (!Array.isArray(manifest.projects) || manifest.projects.length < 3) throw new Error('At least three real project photographs are required');
  if (!Array.isArray(manifest.garments) || manifest.garments.length < 2) throw new Error('At least two garment fixtures are required');
  if (!manifest.projects.every(item => item.sourceKind === 'REAL_PHOTOGRAPH')) throw new Error('Every project fixture must be a real photograph');
  if (!manifest.garments.some(item => item.sourceKind === 'REAL_GARMENT_PHOTOGRAPH')) throw new Error('At least one real garment photograph is required');
  if (!manifest.garments.some(item => item.reviewFocus?.includes('LOGO_PRESERVATION'))) throw new Error('Logo preservation reference is required');
  if (!manifest.garments.some(item => item.reviewFocus?.includes('PATTERN_PRESERVATION'))) throw new Error('Pattern preservation reference is required');

  const outDir = path.resolve(args.out);
  await mkdir(outDir, { recursive: true });
  await mkdir(path.join(outDir, 'sources'), { recursive: true });
  await mkdir(path.join(outDir, 'outputs'), { recursive: true });

  const allFixtures = [...manifest.projects, ...manifest.garments];
  const downloaded = new Map();
  const sourceEvidence = [];
  for (const fixture of allFixtures) {
    const fetched = await downloadFixture(fixture);
    downloaded.set(fixture.id, fetched);
    sourceEvidence.push({
      id: fixture.id,
      sourceKind: fixture.sourceKind,
      sourceUrl: fixture.sourceUrl,
      resolvedUrl: fetched.resolvedUrl,
      licenseUrl: fixture.licenseUrl,
      license: fixture.license,
      sourceSha256: fetched.sha256,
      sourceSizeBytes: fetched.sizeBytes,
      contentType: fetched.contentType,
    });
  }

  const projectDecoded = new Map();
  for (const fixture of manifest.projects) {
    const decoded = await decodeProject(downloaded.get(fixture.id).bytes, manifest.preprocessing.project.width, manifest.preprocessing.project.height);
    projectDecoded.set(fixture.id, decoded);
    const preview = await pngFromRgba(decoded.rgba, decoded.width, decoded.height);
    await writeFile(path.join(outDir, 'sources', `${fixture.id}.png`), preview);
  }

  const garmentDecoded = new Map();
  for (const fixture of manifest.garments) {
    const decoded = await decodeGarment(downloaded.get(fixture.id).bytes, manifest.preprocessing.garment.width, manifest.preprocessing.garment.height);
    garmentDecoded.set(fixture.id, decoded);
    const preview = await pngFromRgba(decoded.rgba, decoded.width, decoded.height);
    await writeFile(path.join(outDir, 'sources', `${fixture.id}.png`), preview);
  }

  const repeats = Number(manifest.preprocessing.measuredRepeats);
  if (!Number.isSafeInteger(repeats) || repeats < 3 || repeats > 20) throw new Error('Measured repeats must be an integer from 3 to 20');

  const samples = [];
  const allLatencies = [];
  let peakMemoryBytes = Math.max(1, process.resourceUsage().maxRSS * 1024);

  for (const projectFixture of manifest.projects) {
    const project = projectDecoded.get(projectFixture.id);
    for (const garmentFixture of manifest.garments) {
      const garment = garmentDecoded.get(garmentFixture.id);
      const spec = warpSpec(project, projectFixture.torsoQ16Normalized);

      // Warm-up is intentionally excluded from latency statistics.
      garmentTextureCompositeRgba8(
        project.rgba, project.width, project.height,
        garment.rgba, garment.width, garment.height,
        spec, { ...textureSpec, featherRadius: manifest.preprocessing.featherRadius },
      );

      const latencies = [];
      let output;
      for (let repeat = 0; repeat < repeats; repeat += 1) {
        const start = performance.now();
        output = garmentTextureCompositeRgba8(
          project.rgba, project.width, project.height,
          garment.rgba, garment.width, garment.height,
          spec, { ...textureSpec, featherRadius: manifest.preprocessing.featherRadius },
        );
        const elapsed = performance.now() - start;
        latencies.push(elapsed);
        allLatencies.push(elapsed);
        peakMemoryBytes = Math.max(peakMemoryBytes, process.resourceUsage().maxRSS * 1024);
      }

      const outputPng = await pngFromRgba(output, project.width, project.height);
      const sampleId = `${projectFixture.id}__${garmentFixture.id}`;
      const outputPath = path.join(outDir, 'outputs', `${sampleId}.png`);
      await writeFile(outputPath, outputPng);
      samples.push({
        id: sampleId,
        projectId: projectFixture.id,
        garmentId: garmentFixture.id,
        outputSha256: sha256(outputPng),
        outputSizeBytes: outputPng.length,
        measuredLatencyMs: {
          p50: percentile(latencies, 50),
          p95: percentile(latencies, 95),
          repeats,
        },
        reviewFocus: garmentFixture.reviewFocus,
      });
    }
  }

  const fixtureIdentity = {
    schemaVersion: manifest.schemaVersion,
    sourceEvidence,
    preprocessing: manifest.preprocessing,
    pairings: samples.map(item => ({ id: item.id, projectId: item.projectId, garmentId: item.garmentId })),
  };
  const fixtureSetSha256 = sha256(Buffer.from(canonicalJson(fixtureIdentity)));

  const evidence = {
    schemaVersion: 1,
    kind: 'BERS_V1_FASHION_REAL_IMAGE_QUALITY_CAPTURE',
    candidateSha: args.candidate,
    fixtureSetSha256,
    sampleCount: samples.length,
    sourceEvidence,
    samples,
    measuredLatencyMs: {
      p50: percentile(allLatencies, 50),
      p95: percentile(allLatencies, 95),
      measuredRuns: allLatencies.length,
    },
    peakMemoryBytes,
    reviewedDimensionsRequired: ['GARMENT_PRESERVATION','LOGO_PATTERN_PRESERVATION','FAILURE_MODES'],
    decision: 'PENDING_HUMAN_REVIEW',
    productionAuthorityGrantedByEvidence: false,
    providerAuthorityGrantedByEvidence: false,
    billingAuthorityGrantedByEvidence: false,
  };

  const evidenceBytes = Buffer.from(JSON.stringify(evidence, null, 2) + '\n');
  await writeFile(path.join(outDir, 'machine-evidence.json'), evidenceBytes);
  await writeFile(path.join(outDir, 'machine-evidence.sha256'), sha256(evidenceBytes) + '\n');
  await writeFile(path.join(outDir, 'fixture-set-identity.json'), JSON.stringify(fixtureIdentity, null, 2) + '\n');

  console.log('BERS_V1_FASHION_REAL_IMAGE_CAPTURE_COMPLETE', JSON.stringify({
    candidateSha: evidence.candidateSha,
    fixtureSetSha256: evidence.fixtureSetSha256,
    sampleCount: evidence.sampleCount,
    measuredLatencyMs: evidence.measuredLatencyMs,
    peakMemoryBytes: evidence.peakMemoryBytes,
    decision: evidence.decision,
  }));
}

await main();
