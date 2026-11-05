import { getSafeSessionStorage } from '../../../lib/performance/safeSessionStorage.js';

const HINT_PREFIX = 'bers:bounded-agent:v1:';
const MATCH_ANY_EXECUTION = Symbol('match-any-execution');

function hintKey(projectId) {
  return `${HINT_PREFIX}${String(projectId || '').trim()}`;
}

export function readHint(projectId) {
  if (!projectId) return null;
  const storage = getSafeSessionStorage();
  if (!storage) return null;
  try {
    const value = JSON.parse(storage.getItem(hintKey(projectId)) || 'null');
    if (!value || typeof value !== 'object') return null;
    const width = Number(value.width);
    const height = Number(value.height);
    return Object.freeze({
      executionId: typeof value.executionId === 'string' && value.executionId ? value.executionId : null,
      sourceArtifactId: typeof value.sourceArtifactId === 'string' ? value.sourceArtifactId : '',
      mode: typeof value.mode === 'string' ? value.mode : '',
      width: Number.isSafeInteger(width) && width > 0 ? width : 0,
      height: Number.isSafeInteger(height) && height > 0 ? height : 0,
    });
  } catch {
    return null;
  }
}

export function writeHint(projectId, value) {
  if (!projectId) return;
  const storage = getSafeSessionStorage();
  if (!storage) return;
  try {
    storage.setItem(hintKey(projectId), JSON.stringify(value));
  } catch {
    // Agent recovery hints are non-authoritative.
  }
}

export function clearHint(projectId) {
  if (!projectId) return;
  const storage = getSafeSessionStorage();
  if (!storage) return;
  try {
    storage.removeItem(hintKey(projectId));
  } catch {
    // Agent recovery hints are non-authoritative.
  }
}

export function clearHintForSource(projectId, sourceArtifactId, executionId = MATCH_ANY_EXECUTION) {
  const expectedSource = typeof sourceArtifactId === 'string' ? sourceArtifactId.trim() : '';
  if (!projectId || !expectedSource) return false;
  const current = readHint(projectId);
  if (!current || current.sourceArtifactId !== expectedSource) return false;
  // An explicit null/ID is an exact compare-and-clear guard; only omission
  // opts into source-only cleanup for callers that own the whole start attempt.
  if (executionId !== MATCH_ANY_EXECUTION && current.executionId !== executionId) return false;
  clearHint(projectId);
  return true;
}
