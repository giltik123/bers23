import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import english from '../src/lib/i18n/locales/en/index.js';
import russian from '../src/lib/i18n/locales/ru/index.js';

const required = [
  'working', 'provider', 'unknownProvider', 'estimatedSeconds', 'attempt',
  'cancelSegmentation', 'flowLabel', 'generationRegion', 'segmentationRegion',
  'stages.preparing', 'stages.compiling', 'stages.generating',
  'stages.validating', 'stages.composing', 'stages.finalizing',
  'flow.prompt', 'flow.planner', 'flow.pipeline', 'flow.adapter',
  'flow.quality', 'flow.composer', 'flow.history',
  'segmentation.validating', 'segmentation.preparing',
  'segmentation.segmenting', 'segmentation.retrying', 'segmentation.parsing',
];
const get = (value, path) => path.split('.').reduce((current, key) => current?.[key], value);

test('Editor progress and cancellation copy is complete in English and Russian', () => {
  for (const path of required) {
    const en = get(english.editorProgress, path);
    const ru = get(russian.editorProgress, path);
    assert.equal(typeof en, 'string', 'English editorProgress.' + path);
    assert.equal(typeof ru, 'string', 'Russian editorProgress.' + path);
    assert.ok(en.trim(), 'English editorProgress.' + path + ' is not empty');
    assert.ok(ru.trim(), 'Russian editorProgress.' + path + ' is not empty');
    assert.notEqual(en, ru, 'Russian editorProgress.' + path + ' must not fall back to English');
  }
});

test('live Editor progress components use shared translations and retain existing cancel handlers', async () => {
  const [generation, flow, segmentation] = await Promise.all([
    readFile('src/components/editor/GenerationProgress.jsx', 'utf8'),
    readFile('src/components/editor/PipelineFlow.jsx', 'utf8'),
    readFile('src/components/editor/SegmentationProgress.jsx', 'utf8'),
  ]);
  for (const [name, source] of [['generation', generation], ['flow', flow], ['segmentation', segmentation]]) {
    assert.match(source, /useTranslation/, name + ' must use the shared locale context');
    assert.match(source, /editorProgress\./, name + ' must use the shared progress namespace');
    assert.match(source, /role="region" aria-label=/, name + ' must expose a named progress region');
    assert.doesNotMatch(source, /coreClient|projectService|financialAuthority/, name + ' must not gain a new authority');
  }
  assert.match(generation, /t\('common\.cancel'\)/);
  assert.match(generation, /editingEngine\.cancel\(\)/);
  assert.match(generation, /t\('editorProgress\.estimatedSeconds'/);
  assert.match(flow, /role="group" aria-label=/);
  assert.match(flow, /t\(step\.labelKey\)/);
  assert.match(flow, /aria-current=\{active \? 'step' : undefined\}/);
  assert.match(segmentation, /t\('editorProgress\.cancelSegmentation'\)/);
  assert.match(segmentation, /cancelActiveSegmentation/);
  assert.doesNotMatch(segmentation, /event\.message/, 'raw provider progress text must not bypass the locale');
});
