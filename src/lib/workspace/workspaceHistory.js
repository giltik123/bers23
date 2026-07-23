// WorkspaceHistory — learning layer: tracks per-workspace usage, success rate,
// editing time and manual selections (favorites). Stored locally.
const KEY = 'workspace_stats_v1';

class WorkspaceHistory {
  read() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
  }

  write(store) {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* best-effort */ }
  }

  entry(store, id) {
    if (!store[id]) store[id] = { uses: 0, successes: 0, failures: 0, totalTimeMs: 0, selections: 0 };
    return store[id];
  }

  recordEdit(workspaceId, { success, durationMs = 0 }) {
    if (!workspaceId) return;
    const store = this.read();
    const e = this.entry(store, workspaceId);
    e.uses += 1;
    if (success) e.successes += 1; else e.failures += 1;
    e.totalTimeMs += durationMs;
    this.write(store);
  }

  recordSelection(workspaceId) {
    const store = this.read();
    this.entry(store, workspaceId).selections += 1;
    this.write(store);
  }

  summary() {
    const store = this.read();
    const ids = Object.keys(store);
    const by = (fn) => ids.reduce((best, id) => (fn(store[id]) > (best ? fn(store[best]) : -1) ? id : best), null);
    const totalUses = ids.reduce((s, id) => s + store[id].uses, 0);
    const totalTime = ids.reduce((s, id) => s + store[id].totalTimeMs, 0);
    return {
      mostUsed: by((e) => e.uses),
      mostSuccessful: by((e) => (e.uses ? e.successes / e.uses : 0)),
      favorite: by((e) => e.selections),
      averageTimeMs: totalUses ? Math.round(totalTime / totalUses) : 0,
      stats: store,
    };
  }
}

export const workspaceHistory = new WorkspaceHistory();