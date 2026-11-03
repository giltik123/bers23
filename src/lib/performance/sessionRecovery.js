const KEY = 'photo-editor-session';

class SessionRecovery {
  constructor() {
    this.memory = {};
  }

  save(patch) {
    const next = { ...this.restore(), ...patch, savedAt: Date.now() };
    this.memory = next;
    try {
      sessionStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Session recovery is a best-effort UI cache, never a reason to block editing.
    }
  }

  restore() {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          this.memory = parsed;
        }
      }
    } catch {
      // Keep the last same-tab snapshot when browser storage is unavailable or corrupt.
    }
    return { ...this.memory };
  }

  saveEditor({ projectId, selectionId, historyIndex }) {
    this.save({ editor: { projectId, selectionId, historyIndex } });
  }

  saveRoute(route) {
    this.save({ route });
  }
}

export const sessionRecovery = new SessionRecovery();
