import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import sharp from 'sharp';

import {
  buildHostedFashionQualityEvidence,
  verifyFashionRealImageQualityEvidence,
} from '../scripts/verify-v1-fashion-real-image-quality-evidence.mjs';

const SHA = 'a'.repeat(40);

async function fixture() {
  const source = await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 20, g: 40, b: 60, alpha: 1 } } }).png().toBuffer();
  const garment = await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 120, g: 30, b: 80, alpha: 1 } } }).png().toBuffer();
  const result = await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 70, g: 90, b: 100, alpha: 1 } } }).png().toBuffer();

  const urls = {
    fixture: 'https://evidence.example.test/fixture.json',
    review: 'https://evidence.example.test/review.json',
    source: 'https://evidence.example.test/source.png',
    garment: 'https://evidence.example.test/garment.png',
    result: 'https://evidence.example.test/result.png',
  };

  const manifest = {
    schemaVersion: 1,
    kind: 'BERS_V1_FASHION_REAL_IMAGE_FIXTURE_SET',
    candidateSha: SHA,
    representativeSetConfirmed: true,
    samples: [{
      id: 'sample-01',
      source: { url: urls.source, sha256: digest(source) },
      garment: { url: urls.garment, sha256: digest(garment) },
      result: { url: urls.result, sha256: digest(result) },
    }],
  };
  const review = {
    schemaVersion: 1,
    kind: 'BERS_V1_FASHION_REAL_IMAGE_REVIEW',
    candidateSha: SHA,
    representativeSetConfirmed: true,
    decision: 'ACCEPT_FOR_V1_DETERMINISTIC_TRYON',
    samples: [{
      id: 'sample-01',
      sourceClass: 'REAL_PHOTO',
      fixtureRightsRef: 'release-fixture-consent-01',
      garmentPreservation: 'PASS',
      logoPatternPreservation: 'PASS',
      reviewedOutputSha256: digest(result),
      observedFailureModes: ['minor edge aliasing noted and accepted'],
      latencyMs: 25.5,
      peakMemoryBytes: 64 * 1024 * 1024,
    }],
  };

  const bodies = new Map([
    [urls.fixture, Buffer.from(JSON.stringify(manifest))],
    [urls.review, Buffer.from(JSON.stringify(review))],
    [urls.source, source],
    [urls.garment, garment],
    [urls.result, result],
  ]);
  const fetcher = async url => {
    const body = bodies.get(String(url));
    if (!body) return new Response('not found', { status: 404 });
    return new Response(body, { status: 200, headers: { 'content-length': String(body.length) } });
  };
  return { urls, manifest, review, bodies, fetcher };
}

test('Fashion real-image verifier binds exact SHA, real image bytes, review and measured resources', async () => {
  const f = await fixture();
  const verified = await verifyFashionRealImageQualityEvidence({
    expectedSha: SHA,
    fixtureManifestUrl: f.urls.fixture,
    reviewArtifactUrl: f.urls.review,
    fetcher: f.fetcher,
  });
  assert.equal(verified.result.kind, 'BERS_V1_FASHION_REAL_IMAGE_QUALITY_EVIDENCE');
  assert.equal(verified.result.candidateSha, SHA);
  assert.equal(verified.result.sampleCount, 1);
  assert.deepEqual(verified.result.measuredLatencyMs, { p50: 25.5, p95: 25.5 });
  assert.equal(verified.result.peakMemoryBytes, 64 * 1024 * 1024);
  assert.equal(verified.result.productionAuthorityGranted, false);
  assert.deepEqual(verified.result.reviewedDimensions, [
    'GARMENT_PRESERVATION',
    'LOGO_PATTERN_PRESERVATION',
    'FAILURE_MODES',
  ]);
  assert.equal(verified.result.decision, 'ACCEPT_FOR_V1_DETERMINISTIC_TRYON');

  const hosted = buildHostedFashionQualityEvidence(verified.result, {
    verifiedAt: '2026-10-04T00:00:00.000Z',
    workflowRunUrl: 'https://github.com/giltik123/bers23/actions/runs/123456789',
    artifactName: `bers-v1-fashion-real-image-quality-${SHA}`,
  });
  assert.equal(hosted.artifactName, `bers-v1-fashion-real-image-quality-${SHA}`);
  assert.equal(hosted.productionAuthorityGranted, false);
});

test('Fashion real-image verifier rejects a review bound to another candidate SHA', async () => {
  const f = await fixture();
  f.review.candidateSha = 'b'.repeat(40);
  f.bodies.set(f.urls.review, Buffer.from(JSON.stringify(f.review)));
  await assert.rejects(
    verifyFashionRealImageQualityEvidence({
      expectedSha: SHA,
      fixtureManifestUrl: f.urls.fixture,
      reviewArtifactUrl: f.urls.review,
      fetcher: f.fetcher,
    }),
    /review candidateSha does not match exact candidate/u,
  );
});

test('Fashion real-image verifier rejects owner review without exact result hash', async () => {
  const f = await fixture();
  delete f.review.samples[0].reviewedOutputSha256;
  f.bodies.set(f.urls.review, Buffer.from(JSON.stringify(f.review)));
  await assert.rejects(
    verifyFashionRealImageQualityEvidence({
      expectedSha: SHA,
      fixtureManifestUrl: f.urls.fixture,
      reviewArtifactUrl: f.urls.review,
      fetcher: f.fetcher,
    }),
    /owner-reviewed output SHA-256 does not match/u,
  );
});

test('Fashion real-image verifier rejects substituted owner-reviewed result hash', async () => {
  const f = await fixture();
  f.review.samples[0].reviewedOutputSha256 = 'f'.repeat(64);
  f.bodies.set(f.urls.review, Buffer.from(JSON.stringify(f.review)));
  await assert.rejects(
    verifyFashionRealImageQualityEvidence({
      expectedSha: SHA,
      fixtureManifestUrl: f.urls.fixture,
      reviewArtifactUrl: f.urls.review,
      fetcher: f.fetcher,
    }),
    /owner-reviewed output SHA-256 does not match/u,
  );
});

test('Fashion real-image verifier rejects synthetic source classification', async () => {
  const f = await fixture();
  f.review.samples[0].sourceClass = 'SYNTHETIC';
  f.bodies.set(f.urls.review, Buffer.from(JSON.stringify(f.review)));
  await assert.rejects(
    verifyFashionRealImageQualityEvidence({
      expectedSha: SHA,
      fixtureManifestUrl: f.urls.fixture,
      reviewArtifactUrl: f.urls.review,
      fetcher: f.fetcher,
    }),
    /must be classified REAL_PHOTO/u,
  );
});

test('Fashion real-image verifier rejects image digest drift even when review repeats the corrupted hash', async () => {
  const f = await fixture();
  f.manifest.samples[0].result.sha256 = 'f'.repeat(64);
  f.review.samples[0].reviewedOutputSha256 = 'f'.repeat(64);
  f.bodies.set(f.urls.fixture, Buffer.from(JSON.stringify(f.manifest)));
  f.bodies.set(f.urls.review, Buffer.from(JSON.stringify(f.review)));
  await assert.rejects(
    verifyFashionRealImageQualityEvidence({
      expectedSha: SHA,
      fixtureManifestUrl: f.urls.fixture,
      reviewArtifactUrl: f.urls.review,
      fetcher: f.fetcher,
    }),
    /result sha256 mismatch/u,
  );
});

test('Fashion real-image verifier rejects failed garment/logo review', async () => {
  const f = await fixture();
  f.review.samples[0].garmentPreservation = 'FAIL';
  f.bodies.set(f.urls.review, Buffer.from(JSON.stringify(f.review)));
  await assert.rejects(
    verifyFashionRealImageQualityEvidence({
      expectedSha: SHA,
      fixtureManifestUrl: f.urls.fixture,
      reviewArtifactUrl: f.urls.review,
      fetcher: f.fetcher,
    }),
    /failed garment preservation review/u,
  );
});

test('Fashion real-image verifier rejects private/local evidence URLs', async () => {
  const f = await fixture();
  await assert.rejects(
    verifyFashionRealImageQualityEvidence({
      expectedSha: SHA,
      fixtureManifestUrl: 'https://127.0.0.1/fixture.json',
      reviewArtifactUrl: f.urls.review,
      fetcher: f.fetcher,
    }),
    /must not target a local\/private host/u,
  );
});

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}


test('Fashion evidence workflow keeps contract CI separate from real external evidence capture', async () => {
  const [workflow, docs] = await Promise.all([
    readFile('.github/workflows/v1-fashion-real-image-quality-evidence.yml', 'utf8'),
    readFile('docs/v1-fashion-real-image-quality-evidence.md', 'utf8'),
  ]);
  assert.match(workflow, /workflow_dispatch:/u);
  assert.match(workflow, /fixture_manifest_url:/u);
  assert.match(workflow, /review_artifact_url:/u);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch'/u);
  assert.match(workflow, /bers-v1-fashion-real-image-quality-\$\{\{ github\.sha \}\}/u);
  assert.match(workflow, /fashion-tryon-quality\.json/u);
  assert.doesNotMatch(workflow, /release-evidence\/v1\/.*\.(?:png|jpe?g|webp)/iu);
  assert.match(docs, /does not require a physical phone/u);
  assert.match(docs, /Do not use private end-user photos merely to satisfy the release gate/u);
  assert.match(docs, /does not edit release authority by itself/u);
});
