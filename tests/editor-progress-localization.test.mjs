import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

function extractObject(source, key) {
  const marker = new RegExp('(?:^|\\n)\\s*' + key + ':\\s*\\{', 'm');
  const match = marker.exec(source);
  assert.ok(match, 'Missing locale object: ' + key);
  const open = source.indexOf('{', match.index);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = open; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
    } else if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  throw new Error('Unclosed locale object: ' + key);
}

function readString(source, key) {
  const pattern = new RegExp('(?:^|\\n)\\s*' + key + ':\\s*([\'"])([^\'"]*)\\1\\s*,?', 'm');
  const match = pattern.exec(source);
  return match?.[2] ?? null;
}

function localeValue(source, path) {
  const parts = path.split('.');
  let block = extractObject(source, 'editorProgress');
  for (const part of parts.slice(0, -1)) block = extractObject(block, part);
  return readString(block, parts.at(-1));
}

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

test('Editor progress and cancellation copy is complete in English and Russian', async () => {
  const [english, russian] = await Promise.all([
    readFile('src/lib/i18n/locales/en/index.js', 'utf8'),
    readFile('src/lib/i18n/locales/ru/index.js', 'utf8'),
  ]);
  for (const path of required) {
    const en = localeValue(english, path);
    const ru = localeValue(russian, path);
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
    assert.match(source, /editorProgress\\./, name + ' must use the shared progress namespace');
    assert.doesNotMatch(source, /coreClient|projectService|financialAuthority/, name + ' must not gain a new authority');
  }
  assert.match(generation, /role="region" aria-label=/);
  assert.match(generation, /aria-live="polite" aria-atomic="true"/);
  assert.match(flow, /role="group" aria-label=/);
  assert.match(segmentation, /role="region" aria-label=/);
  assert.match(segmentation, /aria-live="polite" aria-atomic="true"/);
  assert.match(generation, /t\\('common\\.cancel'\\)/);
  assert.match(generation, /editingEngine\\.cancel\\(\\)/);
  assert.match(generation, /t\\('editorProgress\\.estimatedSeconds'/);
  assert.match(flow, /t\\(step\\.labelKey\\)/);
  assert.match(flow, /aria-current=\\{active \\? 'step' : undefined\\}/);
  assert.match(segmentation, /t\\('editorProgress\\.cancelSegmentation'\\)/);
  assert.match(segmentation, /cancelActiveSegmentation/);
  assert.doesNotMatch(segmentation, /event\\.message/, 'raw provider progress text must not bypass the locale');
});
