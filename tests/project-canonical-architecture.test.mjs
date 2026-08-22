import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Project UI uses only the explicit canonical Project vertical', async () => {
  const [page, service, client, editor, hook] = await Promise.all([
    readFile(new URL('../src/pages/Projects.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/projectService.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/api/coreClient.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/Editor.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/hooks/useProject.js', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(page, /UploadFile|\/assets|entities\.Project/);
  assert.doesNotMatch(service, /entities\.Project|\/data\/Project|imageUrl/);
  assert.match(service, /coreClient\.projects\.createFromFile/);
  assert.match(client, /createFromFile:[\s\S]*\/projects\?/);
  assert.doesNotMatch(editor, /current_image_artifact_id\s*\|\|\s*project\.current_image_url/);
  assert.match(editor, /inputArtifactId:\s*project\.current_image_artifact_id/);

  // History/version identity and current-image transitions are server authority.
  assert.match(client, /acceptFinal:[\s\S]*accept-final/);
  assert.match(client, /undo:[\s\S]*\/undo/);
  assert.match(client, /redo:[\s\S]*\/redo/);
  assert.match(client, /restoreOriginal:[\s\S]*restore-original/);
  assert.match(client, /createVersion:[\s\S]*\/versions/);
  assert.match(client, /restoreVersion:[\s\S]*\/versions\//);
  assert.match(editor, /pushEdit\(result\.finalArtifactId/);
  assert.doesNotMatch(editor, /pushEdit\(result\.image_url/);
  assert.doesNotMatch(hook, /genId\(|crypto\.randomUUID|new Date\(\)\.toISOString/);
  assert.doesNotMatch(hook, /current_image_url\s*:/);
  assert.doesNotMatch(hook, /history\s*=\s*\[|versions\s*=\s*\[/);
  assert.match(hook, /projectService\.acceptFinal/);
  assert.match(hook, /projectService\.undo/);
  assert.match(hook, /projectService\.redo/);
  assert.match(hook, /projectService\.restoreOriginal/);
  assert.match(hook, /projectService\.createVersion/);
  assert.match(hook, /projectService\.restoreVersion/);
});
