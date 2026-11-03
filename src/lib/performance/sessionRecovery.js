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
          const hasMemory = Object.keys(this.memory).length > 0;
          const memorySavedAt = Number(this.memory.savedAt);
          const persistedSavedAt = Number(parsed.savedAt);
          const persistedIsNewer = Number.isFinite(persistedSavedAt)
            && (!Number.isFinite(memorySavedAt) || persistedSavedAt > memorySavedAt);
          if (!hasMemory || persistedIsNewer) {
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
