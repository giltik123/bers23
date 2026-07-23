export const SCENE_PIPELINE_VERSION = '1.0';

// SceneFingerprint — a compact, versioned signature of the scene's visual identity.
// The version bumps ONLY after accepted edits; the hash identifies the profile set.
class SceneFingerprint {
  hash(profiles) {
    const str = JSON.stringify(profiles);
    let h = 0;
    for (let i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
    return Math.abs(h).toString(36);
  }

  build(profiles, version = 1) {
    return {
      version,
      hash: this.hash(profiles),
      pipeline_version: SCENE_PIPELINE_VERSION,
      style: profiles.style?.overall_style || null,
      lighting: profiles.lighting?.type || null,
      camera: profiles.camera?.angle || null,
      color: profiles.color?.grading_style || null,
      identity: profiles.identity?.human_present ? 'human' : 'none',
      perspective: profiles.perspective?.vanishing || null,
      created_at: new Date().toISOString(),
    };
  }

  bump(fingerprint) {
    return { ...fingerprint, version: (fingerprint?.version || 0) + 1, updated_at: new Date().toISOString() };
  }
}

export const sceneFingerprint = new SceneFingerprint();