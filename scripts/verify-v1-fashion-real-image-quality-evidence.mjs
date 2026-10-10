import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

import sharp from 'sharp';

const EXACT_SHA_RE = /^[0-9a-f]{40}$/u;
const SHA256_RE = /^[0-9a-f]{64}$/u;
const RUN_URL_RE = /^https:\/\/github\.com\/giltik123\/bers23\/actions\/runs\/\d+$/u;
const MAX_JSON_BYTES = 1_048_576;
const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
const MAX_SAMPLES = 50;
const ALLOWED_IMAGE_FORMATS = new Set(['jpeg', 'png', 'webp']);

export async function verifyFashionRealImageQualityEvidence(input) {
  const expectedSha = requireExactSha(input?.expectedSha, 'Expected candidate SHA');
  const fixtureManifestUrl = requireHttpsPublicUrl(input?.fixtureManifestUrl, 'Fixture manifest URL').toString();
  const reviewArtifactUrl = requireHttpsPublicUrl(input?.reviewArtifactUrl, 'Review artifact URL').toString();
  const fetcher = input?.fetcher ?? globalThis.fetch;
  if (typeof fetcher !== 'function') throw new Error('Fashion quality verifier requires fetch');

  const fixtureBytes = await fetchBytes(fetcher, fixtureManifestUrl, MAX_JSON_BYTES, 'fixture manifest');
  const reviewBytes = await fetchBytes(fetcher, reviewArtifactUrl, MAX_JSON_BYTES, 'review artifact');
  const fixture = parseJsonObject(fixtureBytes, 'fixture manifest');
  const review = parseJsonObject(reviewBytes, 'review artifact');

  validateFixtureManifest(fixture, expectedSha);
  validateReviewArtifact(review, expectedSha);

  const fixtureSamples = fixture.samples;
  const reviewSamples = review.samples;
  if (fixtureSamples.length !== reviewSamples.length) throw new Error('Fashion quality fixture/review sample count mismatch');

  const reviewById = new Map(reviewSamples.map(sample => [sample.id, sample]));
  if (reviewById.size !== reviewSamples.length) throw new Error('Fashion quality review sample IDs must be unique');

  const latencies = [];
  let peakMemoryBytes = 0;

  for (const fixtureSample of fixtureSamples) {
    const reviewSample = reviewById.get(fixtureSample.id);
    if (!reviewSample) throw new Error(`Fashion quality review is missing sample ${fixtureSample.id}`);
    if (reviewSample.sourceClass !== 'REAL_PHOTO') {
      throw new Error(`Fashion quality sample ${fixtureSample.id} must be classified REAL_PHOTO`);
    }
    if (typeof reviewSample.fixtureRightsRef !== 'string' || !reviewSample.fixtureRightsRef.trim()) {
      throw new Error(`Fashion quality sample ${fixtureSample.id} requires fixtureRightsRef`);
    }
    if (!SHA256_RE.test(reviewSample.reviewedOutputSha256 ?? '') ||
        reviewSample.reviewedOutputSha256 !== fixtureSample.result.sha256) {
      throw new Error(`Fashion quality sample ${fixtureSample.id} owner-reviewed output SHA-256 does not match the exact fixture result`);
    }
    if (reviewSample.garmentPreservation !== 'PASS') {
      throw new Error(`Fashion quality sample ${fixtureSample.id} failed garment preservation review`);
    }
    if (!['PASS', 'NOT_APPLICABLE'].includes(reviewSample.logoPatternPreservation)) {
      throw new Error(`Fashion quality sample ${fixtureSample.id} failed logo/pattern preservation review`);
    }
    if (!Array.isArray(reviewSample.observedFailureModes) ||
        reviewSample.observedFailureModes.some(value => typeof value !== 'string' || !value.trim())) {
      throw new Error(`Fashion quality sample ${fixtureSample.id} observedFailureModes is invalid`);
    }
    const latencyMs = Number(reviewSample.latencyMs);
    if (!Number.isFinite(latencyMs) || latencyMs < 0) {
      throw new Error(`Fashion quality sample ${fixtureSample.id} latencyMs is invalid`);
    }
    if (!Number.isSafeInteger(reviewSample.peakMemoryBytes) || reviewSample.peakMemoryBytes <= 0) {
      throw new Error(`Fashion quality sample ${fixtureSample.id} peakMemoryBytes is invalid`);
    }

    for (const role of ['source', 'garment', 'result']) {
      await verifyImageReference(fetcher, fixtureSample[role], fixtureSample.id, role);
    }

    latencies.push(latencyMs);
    peakMemoryBytes = Math.max(peakMemoryBytes, reviewSample.peakMemoryBytes);
  }

  const fixtureIds = new Set(fixtureSamples.map(sample => sample.id));
  if (fixtureIds.size !== fixtureSamples.length) throw new Error('Fashion quality fixture sample IDs must be unique');
  if (reviewSamples.some(sample => !fixtureIds.has(sample.id))) throw new Error('Fashion quality review contains unknown sample IDs');

  const result = Object.freeze({
    schemaVersion: 1,
    kind: 'BERS_V1_FASHION_REAL_IMAGE_QUALITY_EVIDENCE',
    candidateSha: expectedSha,
    fixtureSetSha256: sha256(fixtureBytes),
    reviewArtifactSha256: sha256(reviewBytes),
    sampleCount: fixtureSamples.length,
    measuredLatencyMs: Object.freeze({
      p50: percentile(latencies, 0.50),
      p95: percentile(latencies, 0.95),
    }),
    peakMemoryBytes,
    reviewedDimensions: Object.freeze([
      'GARMENT_PRESERVATION',
      'LOGO_PATTERN_PRESERVATION',
      'FAILURE_MODES',
    ]),
    decision: 'ACCEPT_FOR_V1_DETERMINISTIC_TRYON',
    fixtureManifestUrl,
    reviewArtifactUrl,
    productionAuthorityGranted: false,
  });

  return Object.freeze({ result, fixtureBytes, reviewBytes });
}

function validateFixtureManifest(value, expectedSha) {
  if (value.schemaVersion !== 1) throw new Error('Fashion fixture manifest schemaVersion is invalid');
  if (value.kind !== 'BERS_V1_FASHION_REAL_IMAGE_FIXTURE_SET') throw new Error('Fashion fixture manifest kind mismatch');
  if (value.candidateSha !== expectedSha) throw new Error('Fashion fixture manifest candidateSha does not match exact candidate');
  if (value.representativeSetConfirmed !== true) throw new Error('Fashion fixture manifest must explicitly confirm a representative set');
  if (!Array.isArray(value.samples) || value.samples.length < 1 || value.samples.length > MAX_SAMPLES) {
    throw new Error('Fashion fixture manifest sample count is invalid');
  }
  for (const sample of value.samples) {
    if (!sample || typeof sample !== 'object' || Array.isArray(sample)) throw new Error('Fashion fixture sample must be an object');
    if (typeof sample.id !== 'string' || !sample.id.trim()) throw new Error('Fashion fixture sample id is required');
    for (const role of ['source', 'garment', 'result']) validateImageReferenceShape(sample[role], sample.id, role);
  }
}

function validateReviewArtifact(value, expectedSha) {
  if (value.schemaVersion !== 1) throw new Error('Fashion review artifact schemaVersion is invalid');
  if (value.kind !== 'BERS_V1_FASHION_REAL_IMAGE_REVIEW') throw new Error('Fashion review artifact kind mismatch');
  if (value.candidateSha !== expectedSha) throw new Error('Fashion review candidateSha does not match exact candidate');
  if (value.representativeSetConfirmed !== true) throw new Error('Fashion review must explicitly confirm a representative set');
  if (value.decision !== 'ACCEPT_FOR_V1_DETERMINISTIC_TRYON') {
    throw new Error('Fashion review decision is not accepted for v1 deterministic Try-On');
  }
  if (!Array.isArray(value.samples) || value.samples.length < 1 || value.samples.length > MAX_SAMPLES) {
    throw new Error('Fashion review sample count is invalid');
  }
  for (const sample of value.samples) {
    if (!sample || typeof sample !== 'object' || Array.isArray(sample)) throw new Error('Fashion review sample must be an object');
    if (typeof sample.id !== 'string' || !sample.id.trim()) throw new Error('Fashion review sample id is required');
  }
}

function validateImageReferenceShape(value, sampleId, role) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Fashion fixture ${sampleId} ${role} reference must be an object`);
  }
  requireHttpsPublicUrl(value.url, `Fashion fixture ${sampleId} ${role} URL`);
  if (!SHA256_RE.test(value.sha256 ?? '')) {
    throw new Error(`Fashion fixture ${sampleId} ${role} sha256 is invalid`);
  }
}

async function verifyImageReference(fetcher, value, sampleId, role) {
  validateImageReferenceShape(value, sampleId, role);
  const url = requireHttpsPublicUrl(value.url, `Fashion fixture ${sampleId} ${role} URL`).toString();
  const bytes = await fetchBytes(fetcher, url, MAX_IMAGE_BYTES, `${sampleId} ${role} image`);
  const actual = sha256(bytes);
  if (actual !== value.sha256) throw new Error(`Fashion fixture ${sampleId} ${role} sha256 mismatch`);
  let metadata;
  try { metadata = await sharp(bytes, { failOn: 'error' }).metadata(); }
  catch { throw new Error(`Fashion fixture ${sampleId} ${role} is not a decodable image`); }
  if (!ALLOWED_IMAGE_FORMATS.has(metadata.format ?? '') ||
      !Number.isSafeInteger(metadata.width) || !Number.isSafeInteger(metadata.height) ||
      metadata.width < 1 || metadata.height < 1) {
    throw new Error(`Fashion fixture ${sampleId} ${role} image metadata is invalid`);
  }
}

async function fetchBytes(fetcher, url, maxBytes, label) {
  const response = await fetcher(url, {
    method: 'GET',
    redirect: 'error',
    headers: { Accept: '*/*' },
  });
  if (!response || response.status < 200 || response.status >= 300) {
    throw new Error(`Fashion quality ${label} fetch requires direct 2xx response`);
  }
  if (response.url) requireHttpsPublicUrl(response.url, `Fashion quality ${label} response URL`);
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error(`Fashion quality ${label} exceeds size limit`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 1 || bytes.length > maxBytes) throw new Error(`Fashion quality ${label} size is invalid`);
  return bytes;
}

function parseJsonObject(bytes, label) {
  let value;
  try { value = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new Error(`Fashion quality ${label} is not valid JSON`); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Fashion quality ${label} must be an object`);
  return value;
}

function requireExactSha(value, label) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!EXACT_SHA_RE.test(normalized)) throw new Error(`${label} must be one exact Git SHA`);
  return normalized;
}

function requireHttpsPublicUrl(value, label) {
  let url;
  try { url = new URL(String(value ?? '').trim()); }
  catch { throw new Error(`${label} must be an absolute HTTPS URL`); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`${label} must be an absolute HTTPS URL without credentials`);
  const host = url.hostname.toLowerCase();
  if (
    host === 'localhost' || host === '::1' || host.endsWith('.local') ||
    /^127\./u.test(host) || /^10\./u.test(host) || /^192\.168\./u.test(host) ||
    /^169\.254\./u.test(host) || /^172\.(?:1[6-9]|2\d|3[01])\./u.test(host)
  ) throw new Error(`${label} must not target a local/private host`);
  return url;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function percentile(values, quantile) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const index = Math.ceil(quantile * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

export function buildHostedFashionQualityEvidence(result, provenance = {}) {
  const verifiedAt = provenance.verifiedAt ?? new Date().toISOString();
  if (typeof verifiedAt !== 'string' || !Number.isFinite(Date.parse(verifiedAt))) {
    throw new Error('Fashion quality evidence verifiedAt is invalid');
  }
  const workflowRunUrl = String(provenance.workflowRunUrl ?? '');
  const artifactName = String(provenance.artifactName ?? '');
  if (!RUN_URL_RE.test(workflowRunUrl)) throw new Error('Fashion quality evidence workflowRunUrl is invalid');
  if (artifactName !== `bers-v1-fashion-real-image-quality-${result.candidateSha}`) {
    throw new Error('Fashion quality evidence artifactName must bind candidateSha');
  }
  return Object.freeze({ ...result, verifiedAt, workflowRunUrl, artifactName });
}

async function main() {
  const expectedSha = process.env.VERIFIED_SHA || process.argv[2];
  const fixtureManifestUrl = process.env.FIXTURE_MANIFEST_URL || process.argv[3];
  const reviewArtifactUrl = process.env.REVIEW_ARTIFACT_URL || process.argv[4];
  const evidenceOut = process.env.EVIDENCE_OUT?.trim() || 'release-evidence/v1/fashion-tryon-quality.json';
  const { result, fixtureBytes, reviewBytes } = await verifyFashionRealImageQualityEvidence({
    expectedSha,
    fixtureManifestUrl,
    reviewArtifactUrl,
  });
  const evidence = buildHostedFashionQualityEvidence(result, {
    workflowRunUrl: process.env.WORKFLOW_RUN_URL,
    artifactName: process.env.ARTIFACT_NAME,
  });
  await mkdir(dirname(evidenceOut), { recursive: true });
  await Promise.all([
    writeFile(evidenceOut, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 }),
    writeFile(`${dirname(evidenceOut)}/fashion-fixture-manifest.json`, fixtureBytes, { mode: 0o600 }),
    writeFile(`${dirname(evidenceOut)}/fashion-review-artifact.json`, reviewBytes, { mode: 0o600 }),
  ]);
  console.log(JSON.stringify({
    status: 'PASS',
    candidateSha: evidence.candidateSha,
    sampleCount: evidence.sampleCount,
    p50LatencyMs: evidence.measuredLatencyMs.p50,
    p95LatencyMs: evidence.measuredLatencyMs.p95,
    peakMemoryBytes: evidence.peakMemoryBytes,
    artifactName: evidence.artifactName,
  }));
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (invokedPath === import.meta.url) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
