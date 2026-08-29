import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import {
  D6_MIN_QUALITY_CASES,
  D6_QUALITY_CORPUS_ID,
  D6_QUALITY_CORPUS_SHA256,
  D6_QUALITY_PROMPT_IDS,
  D6_QUALITY_SEEDS,
} from '../scripts/tiny-sd-d6-accelerated-admission.mjs';

const file = new URL('./fixtures/tiny-sd-d6-quality-corpus-v1.json', import.meta.url);
const bytes = fs.readFileSync(file);
const corpus = JSON.parse(bytes.toString('utf8'));

test('D6 quality corpus bytes and identity are immutable', () => {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), D6_QUALITY_CORPUS_SHA256);
  assert.equal(corpus.schemaVersion, 1);
  assert.equal(corpus.corpusId, D6_QUALITY_CORPUS_ID);
  assert.equal(corpus.authority, 'QUALITY_PROTOCOL_ONLY_NOT_APPROVAL');
  assert.equal(corpus.promptEncoding, 'UTF-8');
  assert.deepEqual(corpus.requiredSeeds, [...D6_QUALITY_SEEDS]);
});

test('quality matrix is exactly 12 prompts by two fixed seeds', () => {
  const ids = corpus.prompts.map(item => item.promptId);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, [...D6_QUALITY_PROMPT_IDS]);
  assert.equal(ids.length, 12);
  assert.equal(D6_MIN_QUALITY_CASES, 24);
});

test('corpus covers the required product-quality categories before results are seen', () => {
  const categories = new Set(corpus.prompts.map(item => item.category));
  for (const category of ['people', 'object', 'object-counting', 'spatial-relationship', 'indoor-scene', 'outdoor-scene', 'composition-depth', 'color-style', 'lighting', 'non-ascii-prompt']) {
    assert.ok(categories.has(category), `missing quality category: ${category}`);
  }
  assert.ok(corpus.prompts.filter(item => item.category === 'non-ascii-prompt').length >= 2);
  assert.ok(corpus.prompts.some(item => /[^\x00-\x7F]/.test(item.prompt)));
});

test('quality corpus contains only protocol inputs, never generated image evidence', () => {
  const source = bytes.toString('utf8');
  assert.doesNotMatch(source, /outputImageSha256/);
  assert.doesNotMatch(source, /generatedImage/);
  assert.doesNotMatch(source, /productionApproval/);
  for (const item of corpus.prompts) {
    assert.equal(typeof item.prompt, 'string');
    assert.ok(item.prompt.length > 20);
    assert.ok(Array.isArray(item.reviewFocus) && item.reviewFocus.length >= 3);
  }
});
