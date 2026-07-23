// OutfitHistory — local activity log of outfit actions.
const KEY = 'outfit_history_v1';
const MAX = 100;

class OutfitHistory {
  read() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
  }

  record(entry) {
    try {
      const log = [{ ...entry, at: new Date().toISOString() }, ...this.read()].slice(0, MAX);
      localStorage.setItem(KEY, JSON.stringify(log));
    } catch { /* best-effort */ }
  }

  list(limit = 20) {
    return this.read().slice(0, limit);
  }
}

export const outfitHistory = new OutfitHistory();