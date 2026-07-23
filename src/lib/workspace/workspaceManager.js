import { workspaceDetector } from '@/lib/workspace/workspaceDetector';
import { getWorkspace } from '@/lib/workspace/workspaceProfiles';
import { workspaceHistory } from '@/lib/workspace/workspaceHistory';

// WorkspaceManager — holds the active workspace per project. Auto-detection uses
// detected objects + Scene Memory; the user can always override manually.
const KEY = 'workspace_manual_v1';

class WorkspaceManager {
  constructor() {
    this.state = { projectId: null, workspaceId: 'universal', mode: 'auto', detectedId: 'universal' };
    this.listeners = new Set();
  }

  subscribe(fn) { this.listeners.add(fn); fn({ ...this.state }); return () => this.listeners.delete(fn); }
  emit() { const s = { ...this.state }; this.listeners.forEach((fn) => fn(s)); }
  setState(patch) { this.state = { ...this.state, ...patch }; this.emit(); }

  readManual() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
  }

  writeManual(store) {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* best-effort */ }
  }

  active() { return getWorkspace(this.state.workspaceId); }
  activeId() { return this.state.workspaceId; }

  // Re-evaluates detection; a manual choice for this project always wins.
  autoDetect({ projectId, objects = [], memory = null }) {
    const detectedId = workspaceDetector.detect({ objects, memory });
    const manual = this.readManual()[projectId];
    this.setState({
      projectId,
      detectedId,
      workspaceId: manual || detectedId,
      mode: manual ? 'manual' : 'auto',
    });
  }

  // workspaceId = null → back to auto-detection.
  select(projectId, workspaceId) {
    const store = this.readManual();
    if (workspaceId) {
      store[projectId] = workspaceId;
      workspaceHistory.recordSelection(workspaceId);
    } else {
      delete store[projectId];
    }
    this.writeManual(store);
    this.setState({
      workspaceId: workspaceId || this.state.detectedId,
      mode: workspaceId ? 'manual' : 'auto',
    });
  }
}

export const workspaceManager = new WorkspaceManager();