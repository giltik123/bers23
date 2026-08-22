import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Project UI uses only the explicit canonical Project vertical', async () => {
  const [page, service, client, editor] = await Promise.all([
    readFile(new URL('../src/pages/Projects.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/projectService.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/api/coreClient.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/Editor.jsx', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(page, /UploadFile|\/assets|entities\.Project/);
  assert.doesNotMatch(service, /entities\.Project|\/data\/Project|imageUrl/);
  assert.match(service, /coreClient\.projects\.createFromFile/);
  assert.match(client, /createFromFile:[\s\S]*\/projects\?/);
  assert.doesNotMatch(editor, /current_image_artifact_id\s*\|\|\s*project\.current_image_url/);
  assert.match(editor, /inputArtifactId:\s*project\.current_image_artifact_id/);
});
