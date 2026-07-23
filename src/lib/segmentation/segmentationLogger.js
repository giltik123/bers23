// SegmentationLogger — records every segmentation request (in-memory + console).

const MAX_LOGS = 100;
const logs = [];

// entry: { provider, durationMs, apiResponseMs, objectsDetected, masksDetected, cacheHit, error }
export function logSegmentation(entry) {
  const record = { timestamp: new Date().toISOString(), ...entry };
  logs.push(record);
  if (logs.length > MAX_LOGS) logs.shift();
  console.debug('[Segmentation]', record);
  return record;
}

export function getSegmentationLogs() {
  return [...logs];
}