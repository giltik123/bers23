import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('browser Project hook never writes canonical Draft/Editing lifecycle status', async () => {
  const source = await readFile('src/hooks/useProject.js', 'utf8');
  assert.match(source, /const saveObjects = \(objects\) => save\(\{ objects \}\);/);
  assert.match(source, /projectService\.acceptFinal\(projectId, finalArtifactId, instruction\)/);
  assert.doesNotMatch(source, /save\(\{[^}]*status\s*:/s);
  assert.doesNotMatch(source, /status\s*:\s*['"]editing['"]/);
  assert.doesNotMatch(source, /status\s*:\s*['"]draft['"]/);
});

test('Project status mutation remains absent from generic browser project service', async () => {
  const source = await readFile('src/lib/projectService.js', 'utf8');
  assert.doesNotMatch(source, /status\s*:/);
  assert.match(source, /acceptFinal/);
});
