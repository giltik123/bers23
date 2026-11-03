import { getSafeSessionStorage } from './safeSessionStorage.js';

const KEY = 'photo-editor-session';

class SessionRecovery {
  constructor() {
    this.memory = {};
  }

  save(patch) {
    const next = { ...this.restore(), ...patch, savedAt: Date.now() };
    this.memory = next;
    const storage = getSafeSessionStorage();
    try {
      storage?.setItem(KEY, JSON.stringify(next));
    } catch {
      // Session recovery is a best-effort UI cache, never a reason to block editing.
    }
  }

  restore() {
    const storage = getSafeSessionStorage();
    try {
      const raw = storage?.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          // This adapter is the only writer for KEY. Once this tab has a snapshot,
          // persisted data must not replace it; a fresh tab still hydrates from storage.
          if (Object.keys(this.memory).length === 0) {
            this.memory = parsed;
          }
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
