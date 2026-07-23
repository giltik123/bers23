// CameraAnalyzer — extracts camera/lens characteristics and detects camera drift.
class CameraAnalyzer {
  extract(raw = {}) {
    const c = raw.camera || {};
    return {
      angle: c.angle || 'eye-level',
      lens: c.lens || 'standard',
      depth_of_field: c.depth_of_field || 'medium',
      focal_impression: c.focal_impression || 'normal',
    };
  }

  directive(p) {
    if (!p) return '';
    return `Preserve the camera characteristics: ${p.angle} angle, ${p.lens} lens look, ${p.depth_of_field} depth of field, ${p.focal_impression} focal impression.`;
  }

  drift(text, p) {
    if (!p) return null;
    if (/camera angle|zoom|wide angle|fisheye|telephoto|close.?up|aerial|top.?down|bird'?s eye|low angle/i.test(text)) {
      return {
        category: 'camera', severity: 0.6,
        message: 'The edit may change the camera characteristics of the photo.',
        correction: 'Keep the original camera angle, lens characteristics and depth of field unchanged.',
      };
    }
    return null;
  }
}

export const cameraAnalyzer = new CameraAnalyzer();