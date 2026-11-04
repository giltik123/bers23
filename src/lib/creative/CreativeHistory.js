const KEY = 'creative_studio_history_v1';
const isStrategyRecord = (value) => Boolean(
  value && typeof value === 'object' && !Array.isArray(value) &&
  typeof value.id === 'string' && value.id.trim().length > 0
);
const unavailable = (reason = 'STORAGE_UNAVAILABLE') => ({ ok: false, reason });

const read = () => {
  try {
    const storage = globalThis.localStorage;
    if (!storage || typeof storage.getItem !== 'function') return unavailable();
    const raw = storage.getItem(KEY);
    if (raw === null) return { ok: true, entries: [] };
    const entries = JSON.parse(raw);
    if (!Array.isArray(entries) || !entries.every(isStrategyRecord)) return unavailable();
    return { ok: true, entries };
  } catch {
    return unavailable();
  }
};

const write = (entries) => {
  try {
    const storage = globalThis.localStorage;
    if (!storage || typeof storage.setItem !== 'function') return false;
    storage.setItem(KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
};

export const creativeHistory = {
  // This is an advisory browser cache only. It never becomes Project authority.
  list() {
    const result = read();
    return result.ok ? result.entries : [];
  },
  save(strategy) {
    if (!isStrategyRecord(strategy)) return unavailable('INVALID_ENTRY');
    const current = read();
    if (!current.ok) return current;
    const next = [
      { ...strategy, savedAt: new Date().toISOString() },
      ...current.entries.filter((item) => item.id !== strategy.id),
    ].slice(0, 30);
    if (!write(next)) return unavailable();
    return { ok: true, entry: next[0] };
  },
  favorite(strategy) {
    if (!isStrategyRecord(strategy)) return unavailable('INVALID_ENTRY');
    const current = read();
    if (!current.ok) return current;
    if (!current.entries.some((item) => item.id === strategy.id)) return unavailable('ENTRY_NOT_FOUND');
    const next = current.entries.map((item) => item.id === strategy.id
      ? { ...item, favorite: !item.favorite }
      : item);
    const entry = next.find((item) => item.id === strategy.id);
    if (!write(next)) return unavailable();
    return { ok: true, entry };
  },
};
