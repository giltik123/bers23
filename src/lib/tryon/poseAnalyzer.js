// PoseAnalyzer — heuristic pose/coverage assessment from detected objects and
// Scene Memory. Estimates whether the person's framing suits garment try-on.
class PoseAnalyzer {
  analyze({ objects = [], memory = null }) {
    const warnings = [];
    const person = objects.find((o) => /person|woman|man/i.test(o.label || ''));

    let coverage = 'unknown';
    if (person?.box) {
      const h = person.box.h || 0;
      coverage = h >= 0.75 ? 'full_body' : h >= 0.45 ? 'half_body' : 'partial';
      if (coverage === 'partial') warnings.push('The person occupies a small part of the frame — try-on quality may suffer.');
    } else {
      warnings.push('Person framing unknown — bottoms try-on works best with a full-body shot.');
    }

    const camera = memory?.profiles?.camera;
    if (camera?.angle && /top|overhead|extreme/i.test(camera.angle)) {
      warnings.push(`Unusual camera angle (${camera.angle}) may distort the garment fit.`);
    }

    return { ok: true, coverage, warnings };
  }
}

export const poseAnalyzer = new PoseAnalyzer();