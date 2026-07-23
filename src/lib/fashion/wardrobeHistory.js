// WardrobeHistory — local activity log of wardrobe actions (create, rename, archive…).
const KEY = 'wardrobe_history_v1';
const MAX = 100;

class WardrobeHistory {
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

export const wardrobeHistory = new WardrobeHistory();