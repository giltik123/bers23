import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Project service normalizes canonical delivery URLs through the configured Core origin', async () => {
  const service = await readFile('src/lib/projectService.js', 'utf8');
  assert.match(service, /normalizeProjectResourceUrls/);
  assert.match(service, /VITE_CORE_API_URL/);
  assert.match(service, /list:\s*async[\s\S]*normalizeProjects/);
  assert.match(service, /get:\s*async[\s\S]*normalizeProject/);
  assert.match(service, /acceptFinal:\s*async[\s\S]*normalizeProject/);
});

test('opening Editor restores Scene Memory without initiating fresh creative analysis', async () => {
  const memory = await readFile('src/lib/scene/sceneMemory.js', 'utf8');
  const ensureStart = memory.indexOf('async ensure(project)');
  const refreshStart = memory.indexOf('async refresh(project)');
  assert(ensureStart >= 0 && refreshStart > ensureStart);
  const ensure = memory.slice(ensureStart, refreshStart);
  assert.match(ensure, /memoryCache\.get/);
  assert.match(ensure, /metadata\?\.scene_memory/);
  assert.match(ensure, /return null/);
  assert.doesNotMatch(ensure, /InvokeLLM|creative|refresh\(project\)/);
  assert.match(memory.slice(refreshStart), /InvokeLLM/, 'explicit refresh remains the only vision-analysis path');
});

test('baseline notifications do not probe the retired generic Notification entity surface', async () => {
  const notifications = await readFile('src/lib/notifications/notificationCenter.js', 'utf8');
  assert.doesNotMatch(notifications, /coreClient|entities\.Notification|\/data\/Notification/);
  assert.match(notifications, /session-local/);
});

test('startup localization diagnostics do not emit to an unowned remote observability route', async () => {
  const localization = await readFile('src/lib/i18n/LocalizationAnalytics.js', 'utf8');
  assert.doesNotMatch(localization, /coreClient\.analytics|observability\/events/);
  assert.match(localization, /_reportedMissing/);
});
