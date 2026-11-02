import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

function localeValue(source, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`"${escapedKey}"\\s*:\\s*"([^"]+)"`).exec(source);
  return match?.[1] ?? null;
}

test('ResultCompare review states have distinct English and Russian copy', async () => {
  const [english, russian] = await Promise.all([
    readFile('src/lib/i18n/locales/en/index.js', 'utf8'),
    readFile('src/lib/i18n/locales/ru/index.js', 'utf8'),
  ]);
  const required = [
    'localCorePreview', 'secondsAbbrev', 'reviewPendingAria', 'reviewImageLoadFailed',
    'reviewBothImagesBeforeAccept', 'scopedReviewLabel', 'scopedMaskedReview',
    'scopedWholeImageReview', 'manualReviewDisclaimer', 'fashionReviewAria',
    'fashionReviewRequired', 'fashionReviewFit', 'fashionReviewOcclusion',
    'fashionReviewTexture', 'fashionReviewIdentity',
  ];
  for (const key of required) {
    const en = localeValue(english, key);
    const ru = localeValue(russian, key);
    assert.ok(en?.trim(), 'Missing English editControls.' + key);
    assert.ok(ru?.trim(), 'Missing Russian editControls.' + key);
    assert.notEqual(en, ru, 'Russian copy must not fall back to English for ' + key);
  }
});

test('ResultCompare uses shared translations without weakening explicit review and Accept gates', async () => {
  const source = await readFile('src/components/editor/ResultCompare.jsx', 'utf8');
  const keys = [
    'localCorePreview', 'secondsAbbrev', 'reviewPendingAria', 'reviewImageLoadFailed',
    'reviewBothImagesBeforeAccept', 'scopedReviewLabel', 'scopedMaskedReview',
    'scopedWholeImageReview', 'manualReviewDisclaimer', 'fashionReviewAria',
    'fashionReviewRequired', 'fashionReviewFit', 'fashionReviewOcclusion',
    'fashionReviewTexture', 'fashionReviewIdentity',
  ];
  for (const key of keys) assert.ok(source.includes('editControls.' + key), 'ResultCompare must use editControls.' + key);
  assert.match(source, /FASHION_REVIEW\.map\(\(\[key,labelKey\]\)/);
  assert.match(source, /\{t\(labelKey\)\}/);
  assert.doesNotMatch(source, /[А-Яа-яЁё]/u, 'ResultCompare must not contain hard-coded Russian UI copy');
  assert.ok(source.includes("t('editControls.secondsAbbrev')"));
  assert.match(source, /canAcceptReviewedCandidate/);
  assert.match(source, /disabled=\{busy \|\| reviewBlocked\}/);
  assert.match(source, /onClick=\{onAccept\}/);
  assert.match(source, /onClick=\{onDiscard\}/);
  assert.match(source, /onClick=\{onRetry\}/);
  assert.match(source, /role="alert"/);
  assert.match(source, /role="status"/);
});
