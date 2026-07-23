const KEY = 'photo-editor-session';
class SessionRecovery {
  save(patch) { const current = this.restore(); sessionStorage.setItem(KEY, JSON.stringify({ ...current, ...patch, savedAt: Date.now() })); }
  restore() { try { return JSON.parse(sessionStorage.getItem(KEY) || '{}'); } catch { return {}; } }
  saveEditor({ projectId, selectionId, historyIndex }) { this.save({ editor: { projectId, selectionId, historyIndex } }); }
  saveRoute(route) { this.save({ route }); }
}
export const sessionRecovery = new SessionRecovery();