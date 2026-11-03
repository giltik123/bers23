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

test('opening Editor restores browser-local Scene Memory without initiating or borrowing creative analysis', async () => {
  const memory = await readFile('src/lib/scene/sceneMemory.js', 'utf8');
  const ensureStart = memory.indexOf('async ensure(project)');
  const refreshStart = memory.indexOf('async refresh(project)');
  assert(ensureStart >= 0 && refreshStart > ensureStart);
  const ensure = memory.slice(ensureStart, refreshStart);
  assert.match(ensure, /memoryCache\.get\(project\.id, project\.original_image_url\)/);
  assert.match(ensure, /authority: 'BROWSER_ADVISORY'/);
  assert.match(ensure, /return null/);
  assert.doesNotMatch(ensure, /metadata\?\.scene_memory|InvokeLLM|creative|coreClient|projectService|refresh\(project\)/);
  const refresh = memory.slice(refreshStart);
  assert.match(refresh, /SCENE_MEMORY_ANALYSIS_NOT_WIRED/);
  assert.doesNotMatch(refresh, /InvokeLLM|creative\/execute|projectService\.update/);
});

test('baseline notifications do not probe the retired generic Notification entity surface', async () => {
  const notifications = await readFile('src/lib/notifications/notificationCenter.js', 'utf8');
  assert.doesNotMatch(notifications, /import\s+.*coreClient|coreClient\.|entities\.Notification/);
  assert.doesNotMatch(notifications, /(?:fetch|request)\s*\([^)]*\/data\/Notification/);
  assert.match(notifications, /session-local/);
});

test('startup localization diagnostics do not emit to an unowned remote observability route', async () => {
  const localization = await readFile('src/lib/i18n/LocalizationAnalytics.js', 'utf8');
  assert.doesNotMatch(localization, /coreClient\.analytics|observability\/events/);
  assert.match(localization, /_reportedMissing/);
});

test('R3a measures protected Projects -> Editor -> Recipes readiness and cold route-chunk transfer', async () => {
  const script = await readFile('scripts/test-release-r3a-browser-e2e.mjs', 'utf8');
  assert.match(script, /Network\.setCacheDisabled', \{ cacheDisabled: true \}/);
  assert.match(script, /performance\.clearResourceTimings\(\)/);
  assert.match(script, /performance\.getEntriesByType\('resource'\)/);
  assert.match(script, /projects-to-editor/);
  assert.match(script, /editor-to-recipes-first-open/);
  assert.match(script, /scriptTransferBytes/);
  assert.match(script, /R3A_BROWSER_ROUTE_PERFORMANCE/);
  assert.doesNotMatch(script, /page\.route\(|browserContext\.route\(|context\.route\(/);
});

test('R3a repeats cold-document route measurements and reports median plus range', async () => {
  const script = await readFile('scripts/test-release-r3a-browser-e2e.mjs', 'utf8');
  assert.match(script, /const PERFORMANCE_SAMPLE_COUNT = 3;/);
  assert.match(script, /sampleIndex < PERFORMANCE_SAMPLE_COUNT/);
  assert.match(script, /Network\.setCacheDisabled', \{ cacheDisabled: true \}/);
  assert.match(script, /sampleCount: performanceSamples\.length/);
  assert.match(script, /editor: summarizeBrowserRouteTiming\(performanceSamples\.map\(sample => sample\.editor\)\)/);
  assert.match(script, /recipes: summarizeBrowserRouteTiming\(performanceSamples\.map\(sample => sample\.recipes\)\)/);
  assert.match(script, /durationMs: summarizeBrowserValues/);
  assert.match(script, /scriptTransferBytes: summarizeBrowserValues/);
  assert.match(script, /median: Math\.round\(median \* 100\) \/ 100/);
  assert.match(script, /min: ordered\[0\]/);
  assert.match(script, /max: ordered\[ordered\.length - 1\]/);
});

test('R3a release workflow executes and captures the exact-head route performance measurement', async () => {
  const workflow = await readFile('.github/workflows/release-r3a-browser-e2e.yml', 'utf8');
  assert.match(workflow, /CANDIDATE_SHA/);
  assert.match(workflow, /scripts\/test-release-r3a-browser-e2e\.mjs/);
  assert.match(workflow, /node \.test-cache\/release-r3\/test-release-r3a-browser-e2e\.mjs/);
  assert.match(workflow, /R3A_BROWSER_RELEASE_E2E_ACCEPTED/);
  assert.match(workflow, /R3A_BROWSER_ROUTE_PERFORMANCE/);
});
