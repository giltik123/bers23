import { sceneMemory } from '@/lib/scene/sceneMemory';
import { styleAnalyzer } from '@/lib/scene/styleAnalyzer';
import { identityAnalyzer } from '@/lib/scene/identityAnalyzer';
import { lightingAnalyzer } from '@/lib/scene/lightingAnalyzer';
import { colorAnalyzer } from '@/lib/scene/colorAnalyzer';
import { cameraAnalyzer } from '@/lib/scene/cameraAnalyzer';
import { perspectiveAnalyzer } from '@/lib/scene/perspectiveAnalyzer';

// StyleLock — when enabled (default), every generation receives hidden preservation
// instructions built from Scene Memory. Never shown to the user.
const KEY = 'style_lock_disabled_v1'; // stores project ids where the lock is OFF

class StyleLock {
  readDisabled() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
  }

  isEnabled(projectId) { return !this.readDisabled().includes(projectId); }

  setEnabled(projectId, enabled) {
    const disabled = this.readDisabled().filter((id) => id !== projectId);
    if (!enabled) disabled.push(projectId);
    try { localStorage.setItem(KEY, JSON.stringify(disabled)); } catch { /* best-effort */ }
  }

  // Hidden directives for the active project's scene memory ('' when locked off or no memory).
  activeDirectives() {
    const { projectId, memory } = sceneMemory.state;
    if (!memory || !projectId || !this.isEnabled(projectId)) return '';
    const p = memory.profiles || {};
    return [
      lightingAnalyzer.directive(p.lighting),
      identityAnalyzer.directive(p.identity),
      cameraAnalyzer.directive(p.camera),
      perspectiveAnalyzer.directive(p.perspective),
      colorAnalyzer.directive(p.color),
      styleAnalyzer.directive(p.style),
    ].filter(Boolean).join(' ');
  }
}

export const styleLock = new StyleLock();