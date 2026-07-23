import { WORKSPACES } from '@/lib/workspace/workspaceProfiles';

// WorkspaceDetector — scores each workspace against the detected objects (Segmentation)
// and the Scene Memory profiles, and returns the best match. Purely analytical.
class WorkspaceDetector {
  detect({ objects = [], memory = null }) {
    const labels = objects.map((o) => (o.label || '').toLowerCase()).filter(Boolean);
    const p = memory?.profiles || {};
    const styleText = [p.style?.overall_style, p.style?.mood, p.color?.grading_style].filter(Boolean).join(' ').toLowerCase();
    const humanPresent = !!p.identity?.human_present || labels.some((l) => /person|face|woman|man/.test(l));

    let best = { id: 'universal', score: 0 };
    for (const ws of WORKSPACES) {
      if (ws.id === 'universal') continue;
      let score = 0;
      for (const hint of ws.detect.objects) {
        score += labels.filter((l) => l.includes(hint) || hint.includes(l)).length * 2;
      }
      for (const hint of ws.detect.style) {
        if (styleText.includes(hint)) score += 1;
      }
      if (ws.id === 'portrait' && humanPresent) score += 1;
      if (score > best.score) best = { id: ws.id, score };
    }
    return best.score >= 2 ? best.id : 'universal';
  }
}

export const workspaceDetector = new WorkspaceDetector();