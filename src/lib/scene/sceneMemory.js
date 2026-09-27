import { sceneFingerprint } from '@/lib/scene/sceneFingerprint';
import { memoryCache } from '@/lib/scene/memoryCache';
import { sceneLogger } from '@/lib/scene/sceneLogger';

// SceneMemory — analyzes the original image only after an explicit user action,
// stores visual-identity profiles inside the project, and exposes the active
// memory to Style Lock and the Consistency Engine. It NEVER edits images.
class SceneMemory {
  constructor() {
    this.state = { status: 'idle', projectId: null, memory: null, error: null };
    this.listeners = new Set();
  }

  subscribe(fn) { this.listeners.add(fn); fn({ ...this.state }); return () => this.listeners.delete(fn); }
  emit() { const s = { ...this.state }; this.listeners.forEach((fn) => fn(s)); }
  setState(patch) { this.state = { ...this.state, ...patch }; this.emit(); }

  getActive() { return this.state.memory; }

  // Restore browser-local advisory memory only. This cache is never canonical
  // Project state and must not trigger Creative execution or Project writes.
  async ensure(project) {
    if (!project) return null;
    if (this.state.projectId === project.id && this.state.memory?.source_url === project.original_image_url) {
      return this.state.memory;
    }
    const cached = memoryCache.get(project.id, project.original_image_url);
    if (cached) {
      sceneLogger.log('memory_loaded', { projectId: project.id, fromCache: true, authority: 'BROWSER_ADVISORY' });
      this.setState({ status: 'ready', projectId: project.id, memory: cached, error: null });
      return cached;
    }
    this.setState({ status: 'unavailable', projectId: project.id, memory: null, error: null });
    return null;
  }

  async refresh(project) {
    const error = Object.assign(new Error('Server-owned Scene Memory analysis is not enabled.'), {
      code: 'SCENE_MEMORY_ANALYSIS_NOT_WIRED',
      retryable: false,
    });
    sceneLogger.log('analysis_unavailable', { projectId: project?.id, code: error.code });
    this.setState({ status: 'unavailable', projectId: project?.id ?? null, memory: null, error: error.message });
    throw error;
  }


  // The fingerprint version bumps ONLY after an accepted edit.
  async recordAcceptedEdit(project) {
    const memory = this.state.projectId === project.id ? this.state.memory : null;
    if (!memory) return;
    const updated = { ...memory, fingerprint: sceneFingerprint.bump(memory.fingerprint) };
    memoryCache.set(project.id, updated);
    this.setState({ memory: updated });
    sceneLogger.log('fingerprint_bumped', { projectId: project.id, version: updated.fingerprint.version });
  }

  // Reset is browser-local until a server-owned Scene Profile authority exists.
  async reset(project) {
    memoryCache.invalidate(project.id);
    sceneLogger.log('memory_reset', { projectId: project.id, authority: 'BROWSER_ADVISORY' });
    this.setState({ status: 'unavailable', projectId: project.id, memory: null, error: null });
  }
}

export const sceneMemory = new SceneMemory();