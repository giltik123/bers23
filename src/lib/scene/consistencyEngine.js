import { styleAnalyzer } from '@/lib/scene/styleAnalyzer';
import { identityAnalyzer } from '@/lib/scene/identityAnalyzer';
import { lightingAnalyzer } from '@/lib/scene/lightingAnalyzer';
import { colorAnalyzer } from '@/lib/scene/colorAnalyzer';
import { cameraAnalyzer } from '@/lib/scene/cameraAnalyzer';
import { perspectiveAnalyzer } from '@/lib/scene/perspectiveAnalyzer';
import { sceneLogger } from '@/lib/scene/sceneLogger';

// ConsistencyEngine — before generation, compares the requested edit against Scene
// Memory and reports drift risks (lighting, identity, perspective, color, style,
// background). Warnings above the threshold are surfaced to the user.
const DRIFT_THRESHOLD = 0.5;
export const CONSISTENCY_CATEGORIES = ['identity', 'lighting', 'color', 'camera', 'perspective', 'style', 'background'];

class ConsistencyEngine {
  constructor() {
    this.lastReport = null;
    this.listeners = new Set();
  }

  subscribe(fn) { this.listeners.add(fn); fn(this.lastReport); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach((fn) => fn(this.lastReport)); }

  // ({ instruction, memory }) → { warnings, exceedsThreshold, categories }
  assess({ instruction, memory }) {
    const text = (instruction || '').toLowerCase();
    const p = memory?.profiles || {};
    const warnings = [
      identityAnalyzer.drift(text, p.identity),
      lightingAnalyzer.drift(text, p.lighting),
      colorAnalyzer.drift(text, p.color),
      cameraAnalyzer.drift(text, p.camera),
      perspectiveAnalyzer.drift(text, p.perspective),
      styleAnalyzer.drift(text, p.style),
      /replace the background|new background|different scene|change the background/i.test(text)
        ? { category: 'background', severity: 0.5, message: 'Background change may reduce scene consistency.', correction: 'Match the new background to the original lighting, perspective and color grading of the scene.' }
        : null,
    ].filter(Boolean);

    const exceedsThreshold = warnings.some((w) => w.severity >= DRIFT_THRESHOLD);
    const categories = Object.fromEntries(
      CONSISTENCY_CATEGORIES.map((c) => [c, warnings.find((w) => w.category === c) ? 'drift' : 'consistent'])
    );

    this.lastReport = { warnings, exceedsThreshold, categories, checked_at: new Date().toISOString() };
    if (warnings.length) sceneLogger.log('drift_detected', { categories: warnings.map((w) => w.category) });
    this.emit();
    return this.lastReport;
  }

  clear() { this.lastReport = null; this.emit(); }
}

export const consistencyEngine = new ConsistencyEngine();