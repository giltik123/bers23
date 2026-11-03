// Optional browser persistence for non-authoritative Recipe UI preferences and statistics.
// When Web Storage is unavailable, retain the same JSON values for this page session only.
const memoryValues = new Map();
const pendingPersistence = new Set();

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function fallbackValue(key, fallback) {
  return cloneJson(memoryValues.has(key) ? memoryValues.get(key) : fallback);
}

export function readRecipeStorage(key, fallback) {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return fallbackValue(key, fallback);

    // A session-local write that could not be persisted must not be replaced by
    // an older value when storage access becomes available again.
    if (pendingPersistence.has(key) && memoryValues.has(key)) {
      return fallbackValue(key, fallback);
    }

    const raw = storage.getItem(key);
    if (raw === null || raw === undefined) return fallbackValue(key, fallback);

    const value = JSON.parse(raw);
    memoryValues.set(key, cloneJson(value));
    return cloneJson(value);
  } catch {
    return fallbackValue(key, fallback);
  }
}

export function writeRecipeStorage(key, value) {
  let snapshot;
  try {
    snapshot = cloneJson(value);
  } catch {
    return false;
  }

  // Update memory first so a quota/security exception cannot lose this session's change.
  memoryValues.set(key, snapshot);
  try {
    const storage = globalThis.localStorage;
    if (!storage) {
      pendingPersistence.add(key);
      return false;
    }
    storage.setItem(key, JSON.stringify(snapshot));
    pendingPersistence.delete(key);
    return true;
  } catch {
    pendingPersistence.add(key);
    return false;
  }
}
