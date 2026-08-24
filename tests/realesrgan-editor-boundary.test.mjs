import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const editor = await readFile(new URL('../src/pages/Editor.jsx', import.meta.url), 'utf8');

test('Editor exposes local x4 only behind the same fail-closed production release predicate', () => {
  assert.match(editor, /import \{ createSuperResolution \} from '@\/application\/createSuperResolution';/);
  assert.match(editor, /import \{ SUPER_RESOLUTION_PRODUCTION_AVAILABLE \} from '@\/platform\/creative\/super-resolution\/SuperResolutionRelease';/);
  const functionStart = editor.indexOf('const upscaleImage = async');
  const gate = editor.indexOf('if (!SUPER_RESOLUTION_PRODUCTION_AVAILABLE)', functionStart);
  const composition = editor.indexOf('createSuperResolution({ projectId: project.id })', functionStart);
  assert.ok(functionStart >= 0 && gate > functionStart && composition > gate, 'release gate must fail before local model composition is created');
  assert.match(editor, /disabled=\{!SUPER_RESOLUTION_PRODUCTION_AVAILABLE[^}]*\}/);
  assert.match(editor, /Upscale x4 · Candidate/);
});

test('Editor keeps x4 output pending until the existing canonical explicit-accept boundary', () => {
  assert.match(editor, /kind: 'SUPER_RESOLUTION'/);
  assert.match(editor, /finalArtifactId: result\.canonicalArtifactId/);
  assert.match(editor, /beforeUrl: project\.current_image_url/);
  assert.match(editor, /await pushEdit\(result\.finalArtifactId, used\)/);
  const upscaleStart = editor.indexOf('const upscaleImage = async');
  const acceptStart = editor.indexOf('const acceptResult = async');
  const upscaleBody = editor.slice(upscaleStart, acceptStart);
  assert.equal(/pushEdit\(|acceptFinal\(|projects\.acceptFinal/.test(upscaleBody), false, 'super-resolution execution must not mutate Project before user Accept');
});

test('Editor disposes blob previews generically so C2 and C3 pending candidates do not leak URLs', () => {
  assert.match(editor, /const url = pending\?\.result\?\.preview_url;/);
  assert.match(editor, /url\.startsWith\('blob:'\)/);
  assert.equal(editor.includes("pending?.kind === 'BACKGROUND_ISOLATION' ? pending.result?.preview_url : null"), false);
});
