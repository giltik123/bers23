// Read-only browser diagnostics. None of these estimates are Core/Project/Billing authority.
export function displayMetric(value) {
  return Number.isFinite(value) && value >= 0 ? String(value) : '—';
}

export function performancePolicyKey(tier) {
  if (tier === 'balanced') return 'settings.performanceBalanced';
  if (tier === 'battery-saver') return 'settings.performanceBatterySaver';
  return 'settings.performanceUnknown';
}

export function pauseReasonKey(reason) {
  if (reason === 'battery') return 'settings.performancePausedBattery';
  if (reason === 'memory') return 'settings.performancePausedMemory';
  return 'settings.performancePausedOther';
}

export async function readPerformanceSnapshot({ deviceProfiler, memoryManager, previewCache, diskCache, resourceScheduler }) {
  // StorageManager.estimate() is optional and can reject (privacy/browser policy).
  // Keep other diagnostics visible rather than failing the whole panel.
  const snapshot = {
    profile: deviceProfiler.snapshot(),
    memory: memoryManager.snapshot(),
    cache: previewCache.snapshot(),
    scheduler: resourceScheduler.snapshot(),
    diskMb: null,
  };
  try {
    snapshot.diskMb = await diskCache.usage();
  } catch {
    // Unavailable is distinct from a measured zero.
  }
  return snapshot;
}
