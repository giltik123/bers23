import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildFashionReviewPublication } from '../scripts/publish-fashion-real-image-review-evidence.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test('review publication binds exact candidate, hashes output bytes and cannot mint accepted review', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'bers-fashion-review-'));
  const captureDir = path.join(root, 'capture');
  const outputsDir = path.join(captureDir, 'outputs');
  const outDir = path.join(root, 'publication');
  const fixturesPath = path.join(root, 'fixtures.json');
  await mkdir(outputsDir, { recursive: true });

  const candidateSha = 'a'.repeat(40);
  const evidenceBranch = `release-evidence-fashion-${candidateSha}`;
  const sampleId = 'project-one__garment-one';
  const outputBytes = Buffer.from('immutable-reviewed-output');
  const outputSha256 = sha256(outputBytes);

  await writeFile(path.join(outputsDir, `${sampleId}.png`), outputBytes);
  await writeFile(fixturesPath, JSON.stringify({
    projects: [{
      id: 'project-one',
      license: 'CC0-1.0',
      licenseUrl: 'https://example.test/project-license',
    }],
    garments: [{
      id: 'garment-one',
      license: 'PUBLIC_DOMAIN',
      licenseUrl: 'https://example.test/garment-license',
    }],
  }));

  await writeFile(path.join(captureDir, 'machine-evidence.json'), JSON.stringify({
    schemaVersion: 1,
    kind: 'BERS_V1_FASHION_REAL_IMAGE_QUALITY_CAPTURE',
    candidateSha,
    fixtureSetSha256: 'b'.repeat(64),
    sampleCount: 1,
    sourceEvidence: [
      {
        id: 'project-one',
        sourceUrl: 'https://example.test/project.jpg',
        resolvedUrl: 'https://example.test/project.jpg',
        sourceSha256: 'c'.repeat(64),
      },
      {
        id: 'garment-one',
        sourceUrl: 'https://example.test/garment.png',
        resolvedUrl: 'https://example.test/garment.png',
        sourceSha256: 'd'.repeat(64),
      },
    ],
    samples: [{
      id: sampleId,
      projectId: 'project-one',
      garmentId: 'garment-one',
      outputSha256,
      measuredLatencyMs: { p50: 12, p95: 18, repeats: 5 },
      reviewFocus: ['GARMENT_PRESERVATION', 'LOGO_PRESERVATION'],
    }],
    measuredLatencyMs: { p50: 12, p95: 18, measuredRuns: 5 },
    peakMemoryBytes: 123456789,
    decision: 'PENDING_HUMAN_REVIEW',
    productionAuthorityGrantedByEvidence: false,
    providerAuthorityGrantedByEvidence: false,
    billingAuthorityGrantedByEvidence: false,
  }));

  const result = await buildFashionReviewPublication({
    captureDir,
    fixtureConfigPath: fixturesPath,
    outputDir: outDir,
    candidateSha,
    evidenceBranch,
  });

  const publicationDir = path.join(outDir, 'release-evidence', 'v1', 'fashion', candidateSha);
  const manifest = JSON.parse(await readFile(path.join(publicationDir, 'fixture-manifest.json'), 'utf8'));
  const draft = JSON.parse(await readFile(path.join(publicationDir, 'review-draft.json'), 'utf8'));
  const metrics = JSON.parse(await readFile(path.join(publicationDir, 'capture-metrics.json'), 'utf8'));
  const publishedOutput = await readFile(path.join(publicationDir, 'outputs', `${sampleId}.png`));

  assert.equal(result.candidateSha, candidateSha);
  assert.equal(result.evidenceBranch, evidenceBranch);
  assert.equal(manifest.kind, 'BERS_V1_FASHION_REAL_IMAGE_FIXTURE_SET');
  assert.equal(manifest.candidateSha, candidateSha);
  assert.equal(manifest.samples[0].result.sha256, outputSha256);
  assert.match(manifest.samples[0].result.url, new RegExp(`raw\\.githubusercontent\\.com/giltik123/bers23/${evidenceBranch}/release-evidence/v1/fashion/${candidateSha}/outputs/`));
  assert.equal(sha256(publishedOutput), outputSha256);

  assert.equal(draft.kind, 'BERS_V1_FASHION_REAL_IMAGE_REVIEW_DRAFT');
  assert.equal(draft.decision, 'PENDING_OWNER_REVIEW');
  assert.equal(draft.productionAuthorityGranted, false);
  assert.equal(draft.samples[0].garmentPreservation, 'PENDING_OWNER_REVIEW');
  assert.equal(draft.samples[0].logoPatternPreservation, 'PENDING_OWNER_REVIEW');
  assert.deepEqual(draft.samples[0].observedFailureModes, [
    'FLAT_DETERMINISTIC_COMPOSITE_NO_SYNTHETIC_DRAPE',
    'LIMITED_OCCLUSION_AND_POSE_PERSPECTIVE_FIT',
  ]);
  assert.equal(metrics.productionAuthorityGranted, false);
  assert.equal(metrics.reviewedOutputSha256[sampleId], outputSha256);

  await assert.rejects(
    access(path.join(publicationDir, 'review.json')),
    /ENOENT/u,
  );
});

test('review publication rejects branch drift and altered output bytes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'bers-fashion-review-reject-'));
  const captureDir = path.join(root, 'capture');
  const outputsDir = path.join(captureDir, 'outputs');
  await mkdir(outputsDir, { recursive: true });
  const candidateSha = 'e'.repeat(40);
  await writeFile(path.join(outputsDir, 'p__g.png'), Buffer.from('changed'));
  await writeFile(path.join(root, 'fixtures.json'), JSON.stringify({
    projects:[{id:'p',license:'CC0',licenseUrl:'https://example.test/p'}],
    garments:[{id:'g',license:'CC0',licenseUrl:'https://example.test/g'}],
  }));
  await writeFile(path.join(captureDir, 'machine-evidence.json'), JSON.stringify({
    kind:'BERS_V1_FASHION_REAL_IMAGE_QUALITY_CAPTURE',
    candidateSha,
    fixtureSetSha256:'f'.repeat(64),
    sampleCount:1,
    sourceEvidence:[
      {id:'p',sourceUrl:'https://example.test/p.jpg',sourceSha256:'1'.repeat(64)},
      {id:'g',sourceUrl:'https://example.test/g.png',sourceSha256:'2'.repeat(64)},
    ],
    samples:[{id:'p__g',projectId:'p',garmentId:'g',outputSha256:'3'.repeat(64),measuredLatencyMs:{p95:1},reviewFocus:[]}],
    measuredLatencyMs:{p50:1,p95:1,measuredRuns:1},
    peakMemoryBytes:1,
    decision:'PENDING_HUMAN_REVIEW',
    productionAuthorityGrantedByEvidence:false,
    providerAuthorityGrantedByEvidence:false,
    billingAuthorityGrantedByEvidence:false,
  }));

  await assert.rejects(
    buildFashionReviewPublication({
      captureDir,
      fixtureConfigPath:path.join(root,'fixtures.json'),
      outputDir:path.join(root,'out'),
      candidateSha,
      evidenceBranch:'release-evidence-fashion-'+'0'.repeat(40),
    }),
    /Evidence branch must bind exact candidate SHA/u,
  );

  await assert.rejects(
    buildFashionReviewPublication({
      captureDir,
      fixtureConfigPath:path.join(root,'fixtures.json'),
      outputDir:path.join(root,'out'),
      candidateSha,
      evidenceBranch:`release-evidence-fashion-${candidateSha}`,
    }),
    /Output SHA mismatch/u,
  );
});

test('capture workflow publishes review draft only from accepted main push with isolated write permission', async () => {
  const workflow = await readFile('.github/workflows/fashion-real-image-quality-capture.yml', 'utf8');
  assert.match(workflow, /^permissions:\s*\n\s*contents:\s*read/mu);
  assert.match(workflow, /publish-review-evidence:/u);
  assert.match(workflow, /if:\s*github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/u);
  assert.match(workflow, /needs:\s*capture/u);
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*write/u);
  assert.match(workflow, /actions\/download-artifact@v4/u);
  assert.match(workflow, /release-evidence-fashion-\$\{\{ github\.sha \}\}/u);
  assert.match(workflow, /publish-fashion-real-image-review-evidence\.mjs/u);
  assert.match(workflow, /! test -e .*review\.json/u);
  assert.match(workflow, /git push origin "HEAD:refs\/heads\/\$EVIDENCE_BRANCH"/u);
});

test('publication helper only creates a pending review draft, never an accepted review kind', async () => {
  const source = await readFile('scripts/publish-fashion-real-image-review-evidence.mjs', 'utf8');
  assert.match(source, /BERS_V1_FASHION_REAL_IMAGE_REVIEW_DRAFT/u);
  assert.match(source, /PENDING_OWNER_REVIEW/u);
  assert.doesNotMatch(source, /kind:\s*['"]BERS_V1_FASHION_REAL_IMAGE_REVIEW['"]/u);
  assert.doesNotMatch(source, /decision:\s*['"]ACCEPT_FOR_V1_DETERMINISTIC_TRYON['"]/u);
});

test('owner-only Fashion evidence bridge requires exact-main accepted review and exact-SHA normalized artifact', async () => {
  const workflow = await readFile('.github/workflows/v1-fashion-real-image-quality-evidence-dispatch.yml', 'utf8');
  assert.match(workflow, /issues:\s*write/u);
  assert.match(workflow, /actions:\s*write/u);
  assert.match(workflow, /github\.event\.issue\.number == 230/u);
  assert.match(workflow, /github\.event\.comment\.user\.login == github\.repository_owner/u);
  assert.match(workflow, /github\.event\.comment\.author_association == 'OWNER'/u);
  assert.match(workflow, /github\.event\.comment\.body == '\/bers-v1-dispatch-fashion-evidence'/u);
  assert.match(workflow, /expectedSha = branch\.data\.commit\.sha/u);
  assert.match(workflow, /release-evidence-fashion-\$\{expectedSha\}/u);
  assert.match(workflow, /review\.kind !== 'BERS_V1_FASHION_REAL_IMAGE_REVIEW'/u);
  assert.match(workflow, /review\.candidateSha !== expectedSha/u);
  assert.match(workflow, /review\.decision !== 'ACCEPT_FOR_V1_DETERMINISTIC_TRYON'/u);
  assert.match(workflow, /raw\.githubusercontent\.com/u);
  assert.match(workflow, /createWorkflowDispatch/u);
  assert.match(workflow, /fixture_manifest_url, review_artifact_url/u);
  assert.match(workflow, /candidate\.head_sha === expectedSha/u);
  assert.match(workflow, /candidate\.event === 'workflow_dispatch'/u);
  assert.match(workflow, /bers-v1-fashion-real-image-quality-/u);
  assert.match(workflow, /listWorkflowRunArtifacts/u);
});
