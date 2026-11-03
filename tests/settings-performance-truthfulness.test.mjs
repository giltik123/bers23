import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readPerformanceSnapshot, displayMetric, performancePolicyKey, pauseReasonKey } from '../src/components/settings/performanceSnapshot.js';
import en from '../src/lib/i18n/locales/en/settings.js';
import { modules as ru } from '../src/lib/i18n/locales/ru/index.js';

const sources = (disk) => ({
  deviceProfiler: { snapshot: () => ({ tier: 'balanced' }) },
  memoryManager: { snapshot: () => ({ usageMb: null }) },
  previewCache: { snapshot: () => ({ entries: 0 }) },
  resourceScheduler: { snapshot: () => ({ paused: true, reason: 'memory' }) },
  diskCache: { usage: disk },
});

test('optional browser storage rejection does not erase independent metrics', async () => {
  const result = await readPerformanceSnapshot(sources(async () => { throw new Error('storage blocked'); }));
  assert.equal(result.diskMb, null);
  assert.equal(result.cache.entries, 0);
  assert.equal(result.profile.tier, 'balanced');
  assert.equal(result.scheduler.reason, 'memory');
  assert.equal(displayMetric(result.diskMb), '—');
});

test('zero is measured, not an unknown metric; unsupported values remain unavailable', async () => {
  const result = await readPerformanceSnapshot(sources(async () => 0));
  assert.equal(displayMetric(result.diskMb), '0');
  for (const value of [null, undefined, NaN, Infinity, -1]) assert.equal(displayMetric(value), '—');
  assert.equal(displayMetric(0), '0');
  assert.equal(displayMetric(12), '12');
});

test('mode and pause labels fail closed to unknown/generic rather than fabricating a reason', () => {
  assert.equal(performancePolicyKey('balanced'), 'settings.performanceBalanced');
  assert.equal(performancePolicyKey('battery-saver'), 'settings.performanceBatterySaver');
  assert.equal(performancePolicyKey('unsupported'), 'settings.performanceUnknown');
  assert.equal(pauseReasonKey('battery'), 'settings.performancePausedBattery');
  assert.equal(pauseReasonKey('memory'), 'settings.performancePausedMemory');
  assert.equal(pauseReasonKey('unexpected'), 'settings.performancePausedOther');
});

test('Settings polls without overlapping snapshots and renders localized truthful labels', () => {
  const component = readFileSync(new URL('../src/components/settings/PerformanceSettings.jsx', import.meta.url), 'utf8');
  assert.match(component, /inFlight/);
  assert.match(component, /if \(!active \|\| inFlight/);
  assert.match(component, /setError\(false\)/);
  assert.match(component, /window\.clearInterval\(timer\)/);
  assert.doesNotMatch(component, /averageRenderMs|ramGb|\?\? 0|Queue cache:/);
  for (const key of [
    'performanceHeap', 'performanceStorage', 'performancePreviews', 'performancePolicy',
    'performanceBalanced', 'performanceBatterySaver', 'performanceUnknown',
    'performancePausedBattery', 'performancePausedMemory', 'performancePausedOther',
    'performanceUnavailable',
  ]) assert.ok(en[key] && ru.settings[key], `Missing Settings metric key: ${key}`);
});
