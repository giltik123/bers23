import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const manifest=JSON.parse(await readFile('config/v1-fashion-real-image-fixtures.json','utf8'));
const capture=await readFile('scripts/capture-fashion-real-image-quality.mjs','utf8');
const workflow=await readFile('.github/workflows/fashion-real-image-quality-capture.yml','utf8');

test('fixture set contains representative real photographs plus logo/pattern garment references', () => {
  assert.equal(manifest.kind,'BERS_V1_FASHION_REAL_IMAGE_FIXTURE_SET');
  assert.equal(manifest.projects.length>=3,true);
  assert.equal(manifest.projects.every(item=>item.sourceKind==='REAL_PHOTOGRAPH'),true);
  assert.equal(manifest.garments.length>=2,true);
  assert.equal(manifest.garments.some(item=>item.sourceKind==='REAL_GARMENT_PHOTOGRAPH'),true);
  assert.equal(manifest.garments.some(item=>item.reviewFocus.includes('PATTERN_PRESERVATION')),true);
  assert.equal(manifest.garments.some(item=>item.reviewFocus.includes('LOGO_PRESERVATION')),true);
  for(const item of [...manifest.projects,...manifest.garments]){
    assert.match(item.sourceUrl,/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\//u);
    assert.match(item.licenseUrl,/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/u);
    assert.ok(['CC0-1.0','PUBLIC_DOMAIN'].includes(item.license));
  }
});

test('capture harness measures evidence but cannot approve release quality or production authority', () => {
  assert.match(capture,/PENDING_HUMAN_REVIEW/u);
  assert.match(capture,/productionAuthorityGrantedByEvidence:\s*false/u);
  assert.match(capture,/providerAuthorityGrantedByEvidence:\s*false/u);
  assert.match(capture,/billingAuthorityGrantedByEvidence:\s*false/u);
  assert.doesNotMatch(capture,/QUALITY_VALIDATED/u);
  assert.doesNotMatch(capture,/ACCEPT_FOR_V1_DETERMINISTIC_TRYON/u);
  assert.match(capture,/process\.resourceUsage\(\)\.maxRSS/u);
  assert.match(capture,/measuredLatencyMs/u);
  assert.match(capture,/fixtureSetSha256/u);
});

test('workflow binds capture to exact checked-out candidate and uploads reviewable PNG evidence', () => {
  assert.match(workflow,/github\.event\.pull_request\.head\.sha \|\| github\.sha/u);
  assert.match(workflow,/test "\$\(git rev-parse HEAD\)" = "\$EXPECTED_SHA"/u);
  assert.match(workflow,/capture-fashion-real-image-quality\.mjs/u);
  assert.match(workflow,/npx esbuild scripts\/capture-fashion-real-image-quality\.mjs/u);
  assert.match(workflow,/--external:sharp/u);
  assert.match(workflow,/fashion-real-image-quality-build\/capture\.mjs/u);
  assert.match(workflow,/fashion-real-image-quality-capture-contract\.test\.mjs/u);
  assert.match(workflow,/actions\/upload-artifact@v4/u);
  assert.match(workflow,/machine-evidence\.json/u);
  assert.match(workflow,/outputs/u);
});
