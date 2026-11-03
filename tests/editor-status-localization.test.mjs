import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import english from '../src/lib/i18n/locales/en/editor.js';
import russian from '../src/lib/i18n/locales/ru/index.js';

const translationPairs = [
  'planStatus.ready',
  'planStatus.needsClarification',
  'planStatus.invalid',
  'planScope.wholeImage',
  'planScope.noObject',
  'statusBar.region',
  'statusBar.objects',
  'statusBar.selection',
  'statusBar.masks',
  'statusBar.segmentation',
  'statusBar.cache',
  'statusBar.selectionModes.single',
  'statusBar.segmentationStates.completed',
  'statusBar.segmentationStates.idle',
  'statusBar.cacheStates.empty',
  'statusBar.pipeline.region',
  'statusBar.pipeline.preview',
  'statusBar.pipeline.final',
  'statusBar.pipeline.processingTier',
  'statusBar.pipeline.status.processing',
  'statusBar.pipeline.status.error',
  'statusBar.pipeline.status.ready',
  'statusBar.pipeline.status.idle',
  'statusBar.pipeline.stages.validation',
  'statusBar.pipeline.stages.metadata',
  'statusBar.pipeline.stages.optimization',
  'statusBar.pipeline.stages.resolution',
  'statusBar.pipeline.stages.masks',
  'statusBar.pipeline.stages.crop',
  'statusBar.pipeline.stages.preview',
  'statusBar.pipeline.stages.restore',
  'statusBar.pipeline.stages.export',
  'statusBar.pipeline.tiers.preview',
  'statusBar.pipeline.tiers.standard',
  'statusBar.pipeline.tiers.hd',
  'statusBar.pipeline.tiers.original',
];

function readPath(value, path) {
  return path.split('.').reduce((current, key) => current?.[key], value);
}

function placeholders(value) {
  return [...value.matchAll(/\{([A-Za-z0-9_]+)\}/gu)].map((match) => match[1]).sort();
}

test('Editor plan and diagnostics labels have complete RU/EN parity', () => {
  for (const path of translationPairs) {
    const en = readPath(english, path);
    const ru = readPath(russian.editor, path);
    assert.equal(typeof en, 'string', 'English editor.' + path + ' is missing');
    assert.equal(typeof ru, 'string', 'Russian editor.' + path + ' is missing');
    assert.ok(en.trim(), 'English editor.' + path + ' must not be empty');
    assert.ok(ru.trim(), 'Russian editor.' + path + ' must not be empty');
    assert.notEqual(en, ru, 'editor.' + path + ' must be translated, not copied');
    assert.deepEqual(placeholders(ru), placeholders(en), 'editor.' + path + ' interpolation must match');
  }
});

test('PlanPreview announces localized readiness and source-scope labels', async () => {
  const source = await readFile('src/components/editor/PlanPreview.jsx', 'utf8');
  assert.match(source, /useTranslation/);
  for (const key of ['ready', 'needsClarification', 'invalid']) {
    assert.ok(source.includes("key: 'editor.planStatus." + key + "'"));
  }
  assert.ok(source.includes('editor.planScope.wholeImage'));
  assert.ok(source.includes('editor.planScope.noObject'));
  assert.ok(source.includes('role="status" aria-live="polite"'));
  assert.doesNotMatch(source, /'Ready'|'Needs clarification'|'Cannot run'|'Whole image'|'No object'/);
});

test('EditorStatusBar localizes counters and known runtime states in its accessible region', async () => {
  const source = await readFile('src/components/editor/EditorStatusBar.jsx', 'utf8');
  assert.match(source, /useTranslation/);
  for (const key of ['objects', 'selection', 'masks', 'segmentation', 'cache']) {
    assert.ok(source.includes('editor.statusBar.' + key), 'missing localized status key: ' + key);
  }
  assert.match(source, /selectionModes: \{/);
  assert.match(source, /segmentationStates: \{/);
  assert.match(source, /cacheStates: \{/);
  assert.ok(source.includes("aria-label={t('editor.statusBar.region')}"));
  assert.match(source, /role="status" aria-live="polite"/);
  assert.doesNotMatch(source, /'Objects:|'Selected:|'Masks:|'Segmentation:|'Cache:/);
});

test('PipelineStatusBar localizes pipeline states, stages, tiers and accessible status', async () => {
  const source = await readFile('src/components/editor/PipelineStatusBar.jsx', 'utf8');
  assert.match(source, /useTranslation/);
  for (const key of ['status', 'stages', 'tiers']) {
    assert.ok(source.includes('editor.statusBar.pipeline.' + key), 'missing localized pipeline ' + key);
  }
  assert.ok(source.includes("editor.statusBar.pipeline.preview"));
  assert.ok(source.includes("editor.statusBar.pipeline.final"));
  assert.match(source, /role="status" aria-live="polite" aria-label=\{t\('editor.statusBar.pipeline.region'\)\}/);
  assert.doesNotMatch(source, /Validating|Reading metadata|Optimizing|Selecting resolution|Processing masks|Computing crop|Generating preview|Restoring result|Pipeline error|Pipeline ready|Pipeline idle|Processing tier:/);
});
