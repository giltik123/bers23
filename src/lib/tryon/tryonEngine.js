import { garmentSelector } from '@/lib/tryon/garmentSelector';
import { fitValidator } from '@/lib/tryon/fitValidator';
import { poseAnalyzer } from '@/lib/tryon/poseAnalyzer';
import { fashnProvider } from '@/lib/tryon/fashnProvider';
import { imagePipeline } from '@/lib/pipeline/imagePipeline';
import { qualityValidator } from '@/lib/editing/qualityValidator';
import { composer } from '@/lib/editing/composer';
import { resultManager } from '@/lib/editing/resultManager';
import { tryonEvents } from '@/lib/tryon/tryonEvents';

// TryOnEngine — orchestrates the Virtual Try-On chain:
// Outfit Builder → Garment Selector → Fit Validator → Pose Analyzer →
// Image Pipeline → FASHN Provider → Quality Validator → Composer → History.
// The result is NOT committed here — the Editor commits it to history on Accept.
class TryOnEngine {
  constructor() { this.cancelled = false; }

  cancel() {
    this.cancelled = true;
    fashnProvider.cancel();
    tryonEvents.emit({ status: 'cancelled', stage: null });
  }

  _check() {
    if (this.cancelled) throw Object.assign(new Error('Try-on cancelled'), { code: 'cancelled' });
  }

  async execute({ project, outfit, garments, objects = [], memory = null }) {
    this.cancelled = false;
    const runId = `tryon_${Date.now().toString(36)}`;
    const started = performance.now();
    const stage = (name, patch = {}) => { this._check(); tryonEvents.emit({ status: 'running', stage: name, error: null, ...patch }); };

    try {
      // 1. Garment Selector — which pieces can be tried on, in dressing order.
      stage('selecting', { label: 'Selecting garments', step: 0, totalSteps: 0 });
      const { selected, skipped } = garmentSelector.select(garments);

      // 2. Fit Validator — hard requirements + soft warnings.
      stage('validating_fit', { label: 'Checking fit' });
      const fit = fitValidator.validate({ outfit, selected, objects, memory });
      if (!fit.ok) throw new Error(fit.errors.join(' '));

      // 3. Pose Analyzer — framing/pose suitability.
      stage('analyzing_pose', { label: 'Analyzing pose' });
      const pose = poseAnalyzer.analyze({ objects, memory });
      const warnings = [...fit.warnings, ...pose.warnings, ...skipped.map((s) => s.reason)];

      // 4. Image Pipeline — providers never receive raw images.
      stage('preparing', { label: 'Preparing image' });
      const prepared = await imagePipeline.prepare({ imageUrl: project.current_image_url, objects: [] });

      // 5. FASHN Provider — sequential dressing, each result feeds the next garment.
      let currentUrl = prepared.processingImageUrl;
      let creditsUsed = 0;
      let generationTimeMs = 0;
      for (let i = 0; i < selected.length; i++) {
        const { garment, fashnCategory } = selected[i];
        stage('generating', { label: `Trying on "${garment.name}"`, step: i + 1, totalSteps: selected.length });
        const check = fashnProvider.validateRequest({ modelImageUrl: currentUrl, garmentImageUrl: garment.original_image_url });
        if (!check.valid) throw new Error(check.errors.join('. '));
        const generation = await fashnProvider.tryOn({
          modelImageUrl: currentUrl,
          garmentImageUrl: garment.original_image_url,
          category: fashnCategory,
        });
        this._check();

        // 6. Quality Validator — every intermediate generation is gated.
        stage('validating', { label: 'Validating result', step: i + 1, totalSteps: selected.length });
        const quality = await qualityValidator.validate(generation.image_url, prepared);
        if (!quality.valid) throw new Error(`Try-on rejected: ${quality.errors.join('. ')}`);

        currentUrl = generation.image_url;
        creditsUsed += generation.credits_used || 0;
        generationTimeMs += generation.generation_time_ms || 0;
      }

      // 7. Composer — whole-image try-on passes through; masked blends stay supported.
      stage('composing', { label: 'Composing' });
      const composed = await composer.compose({ originalUrl: prepared.processingImageUrl, generatedUrl: currentUrl, masks: [] });

      // 8. Restore metadata + package for History.
      stage('finalizing', { label: 'Finalizing' });
      const restored = await imagePipeline.restore(composed.image_url, prepared);
      const userPrompt = `Try on outfit "${outfit.name}" (${selected.length} garment${selected.length === 1 ? '' : 's'})`;
      const result = await resultManager.build({
        runId, composed,
        provider: 'fashn',
        creditsUsed, generationTimeMs,
        userPrompt, objects: [],
        metadata: restored.metadata,
      });

      tryonEvents.emit({ status: 'done', stage: null });
      return { result, used: selected.map((s) => s.garment), warnings, durationMs: Math.round(performance.now() - started) };
    } catch (error) {
      tryonEvents.emit({ status: error.code === 'cancelled' ? 'cancelled' : 'error', stage: null, error: error.message });
      throw error;
    }
  }
}

export const tryonEngine = new TryOnEngine();