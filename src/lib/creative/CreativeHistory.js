const KEY = 'creative_studio_history_v1';

// This cache is intentionally browser-local and non-authoritative. A failed read
// must not be mistaken for an empty history, otherwise the next write could
// overwrite data that was merely inaccessible or malformed.
function readSnapshot() {
  try {
    const storage = globalThis.localStorage;
    if (!storage || typeof storage.getItem !== 'function') return null;
    const raw = storage.getItem(KEY);
    if (raw == null) return { storage, entries: [] };
    const entries = JSON.parse(raw);
    if (!Array.isArray(entries) || entries.some((item) => (
      !item || typeof item !== 'object' || Array.isArray(item) || typeof item.id !== 'string' || !item.id
    ))) return null;
    return { storage, entries };
  } catch {
    return null;
  }
}

function writeSnapshot(snapshot, entries) {
  try {
    if (typeof snapshot?.storage?.setItem !== 'function') return false;
    snapshot.storage.setItem(KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

export const creativeHistory = {
  list() { return readSnapshot()?.entries ?? []; },
  save(strategy) {
    if (!strategy || typeof strategy.id !== 'string' || !strategy.id) return null;
    const current = readSnapshot();
    if (!current) return null;
    const entry = { ...strategy, savedAt: new Date().toISOString() };
    const next = [entry, ...current.entries.filter((item) => item.id !== strategy.id)].slice(0, 30);
    return writeSnapshot(current, next) ? next[0] : null;
  },
  favorite(strategy) {
    if (!strategy || typeof strategy.id !== 'string' || !strategy.id) return null;
    const current = readSnapshot();
    if (!current) return null;
    if (!current.entries.some((item) => item.id === strategy.id)) return null;
    const next = current.entries.map((item) => item.id === strategy.id ? { ...item, favorite: !item.favorite } : item);
    return writeSnapshot(current, next) ? next.find((item) => item.id === strategy.id) : null;
  },
};
