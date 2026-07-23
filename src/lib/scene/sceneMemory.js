import { base44 } from '@/api/base44Client';
import { projectService } from '@/lib/projectService';
import { styleAnalyzer } from '@/lib/scene/styleAnalyzer';
import { identityAnalyzer } from '@/lib/scene/identityAnalyzer';
import { lightingAnalyzer } from '@/lib/scene/lightingAnalyzer';
import { colorAnalyzer } from '@/lib/scene/colorAnalyzer';
import { cameraAnalyzer } from '@/lib/scene/cameraAnalyzer';
import { perspectiveAnalyzer } from '@/lib/scene/perspectiveAnalyzer';
import { sceneFingerprint } from '@/lib/scene/sceneFingerprint';
import { memoryCache } from '@/lib/scene/memoryCache';
import { sceneLogger } from '@/lib/scene/sceneLogger';

// SceneMemory — analyzes the original image ONCE (vision LLM), stores visual-identity
// profiles inside the project, and exposes the active memory to Style Lock and the
// Consistency Engine. It NEVER edits images — it only analyzes, stores and guides.
class SceneMemory {
  constructor() {
    this.state = { status: 'idle', projectId: null, memory: null, error: null };
    this.listeners = new Set();
  }

  subscribe(fn) { this.listeners.add(fn); fn({ ...this.state }); return () => this.listeners.delete(fn); }
  emit() { const s = { ...this.state }; this.listeners.forEach((fn) => fn(s)); }
  setState(patch) { this.state = { ...this.state, ...patch }; this.emit(); }

  getActive() { return this.state.memory; }

  // Loads (or builds) scene memory for a project: active state → cache → project → fresh analysis.
  async ensure(project) {
    if (!project) return null;
    if (this.state.projectId === project.id && this.state.memory?.source_url === project.original_image_url) {
      return this.state.memory;
    }
    const stored = project.metadata?.scene_memory;
    const cached =
      memoryCache.get(project.id, project.original_image_url) ||
      (stored?.source_url === project.original_image_url ? stored : null);
    if (cached) {
      sceneLogger.log('memory_loaded', { projectId: project.id, fromCache: true });
      this.setState({ status: 'ready', projectId: project.id, memory: cached, error: null });
      return cached;
    }
    return this.refresh(project);
  }

  // Full scene analysis of the ORIGINAL image via a single vision call.
  async refresh(project) {
    this.setState({ status: 'analyzing', projectId: project.id, error: null });
    sceneLogger.log('analysis_started', { projectId: project.id });
    try {
      const raw = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze this photograph's visual identity for editing consistency. Describe: lighting (type, direction, quality, time of day, contrast, brightness), color (dominant palette as color names, white balance, saturation, grading style), camera (angle, lens look, depth of field, focal impression), perspective (horizon, vanishing, distortion), overall style (photograph/render/etc, realism, noise level, sharpness, dynamic range, mood), and — if a human is present — visual appearance descriptors ONLY (hair color, hair length, skin tone, general face proportions, eye color, rough age range, facial hair, accessories). Never output anything that could identify the person biometrically.`,
        file_urls: [project.original_image_url],
        response_json_schema: {
          type: 'object',
          properties: {
            lighting: { type: 'object', properties: { type: { type: 'string' }, direction: { type: 'string' }, quality: { type: 'string' }, time_of_day: { type: 'string' }, contrast: { type: 'string' }, brightness: { type: 'string' } } },
            color: { type: 'object', properties: { palette: { type: 'array', items: { type: 'string' } }, white_balance: { type: 'string' }, saturation: { type: 'string' }, grading_style: { type: 'string' } } },
            camera: { type: 'object', properties: { angle: { type: 'string' }, lens: { type: 'string' }, depth_of_field: { type: 'string' }, focal_impression: { type: 'string' } } },
            perspective: { type: 'object', properties: { horizon: { type: 'string' }, vanishing: { type: 'string' }, distortion: { type: 'string' } } },
            style: { type: 'object', properties: { overall_style: { type: 'string' }, realism: { type: 'string' }, noise: { type: 'string' }, sharpness: { type: 'string' }, dynamic_range: { type: 'string' }, mood: { type: 'string' } } },
            identity: { type: 'object', properties: { human_present: { type: 'boolean' }, descriptors: { type: 'object', properties: { hair_color: { type: 'string' }, hair_length: { type: 'string' }, skin_tone: { type: 'string' }, face_proportions: { type: 'string' }, eye_color: { type: 'string' }, age_estimate: { type: 'string' }, facial_hair: { type: 'string' }, accessories: { type: 'string' } } } } },
          },
        },
      });

      const profiles = {
        style: styleAnalyzer.extract(raw),
        lighting: lightingAnalyzer.extract(raw),
        color: colorAnalyzer.extract(raw),
        camera: cameraAnalyzer.extract(raw),
        perspective: perspectiveAnalyzer.extract(raw),
        identity: identityAnalyzer.extract(raw),
      };
      const memory = {
        source_url: project.original_image_url,
        analyzed_at: new Date().toISOString(),
        profiles,
        fingerprint: sceneFingerprint.build(profiles, 1),
      };

      memoryCache.set(project.id, memory);
      await this.persist(project, memory);
      sceneLogger.log('analysis_completed', { projectId: project.id, fingerprint: memory.fingerprint.hash });
      this.setState({ status: 'ready', memory, error: null });
      return memory;
    } catch (error) {
      sceneLogger.log('analysis_failed', { projectId: project.id, error: error.message });
      this.setState({ status: 'error', error: error.message });
      throw error;
    }
  }

  async persist(project, memory) {
    await projectService.update(project.id, { metadata: { ...(project.metadata || {}), scene_memory: memory } });
  }

  // The fingerprint version bumps ONLY after an accepted edit.
  async recordAcceptedEdit(project) {
    const memory = this.state.projectId === project.id ? this.state.memory : null;
    if (!memory) return;
    const updated = { ...memory, fingerprint: sceneFingerprint.bump(memory.fingerprint) };
    memoryCache.set(project.id, updated);
    this.setState({ memory: updated });
    sceneLogger.log('fingerprint_bumped', { projectId: project.id, version: updated.fingerprint.version });
    await this.persist(project, updated);
  }

  // Explicit user reset — the only other cache invalidation path besides an image change.
  async reset(project) {
    memoryCache.invalidate(project.id);
    await projectService.update(project.id, { metadata: { ...(project.metadata || {}), scene_memory: null } });
    sceneLogger.log('memory_reset', { projectId: project.id });
    this.setState({ status: 'idle', memory: null, error: null });
  }
}

export const sceneMemory = new SceneMemory();