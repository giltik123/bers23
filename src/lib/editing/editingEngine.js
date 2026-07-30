import { imagePipeline } from '@/lib/pipeline/imagePipeline';
import { reveProvider } from '@/lib/editing/reveProvider';
import { promptCompiler } from '@/lib/editing/promptCompiler';
import { qualityValidator } from '@/lib/editing/qualityValidator';
import { composer } from '@/lib/editing/composer';
import { generationCache } from '@/lib/editing/generationCache';
import { generationLogger } from '@/lib/editing/generationLogger';
import { resultManager } from '@/lib/editing/resultManager';
import { editingEvents } from '@/lib/editing/editingEvents';

// EditingEngine — the ONLY module allowed to execute AI image editing.
// Editor → Planner → Pipeline → Engine → Provider → Composer → History.
// Providers are pluggable via the EditingProvider interface; default is Reve.
class EditingEngine {
  constructor() { this.provider = reveProvider; this.cancelled = false; }

  setProvider(provider) { this.provider = provider; }

  cancel() { this.cancelled = true; this.provider.cancel(); editingEvents.emit({ status: 'cancelled', stage: null }); }

  // ({ project, plan, instruction, objects }) → result (NOT yet saved to history — the Editor
  // shows a before/after compare; on Accept it commits the result via the Project Engine).
  async execute({ project, plan, instruction, objects = [], bypassCache = false }) {
    this.cancelled = false;
    const runId = `gen_${Date.now().toString(36)}`;
    const started = performance.now();
    const stage = (name, extra = {}) => {
      if (this.cancelled) throw Object.assign(new Error('Generation cancelled'), { code: 'cancelled' });
      editingEvents.emit({ status: 'running', stage: name, provider: this.provider.name, error: null, ...extra });
    };

    try {
      // 1. Image Pipeline — the engine NEVER receives raw uploads.
      stage('preparing', { etaMs: 30000 });
      const prepared = await imagePipeline.prepare({
        imageUrl: project.current_image_url,
        objects,
        maskOptions: { feather: 3, expand: 2 },
      });

      // 2. Prompt compilation from the Planner's structured prompt.
      stage('compiling');
      const { prompt, userPrompt } = promptCompiler.compile({ instruction, plan, objects });

      // 3. Cache check — identical requests never hit the provider twice.
      const cacheKey = generationCache.key({
        projectId: project.id, prompt,
        objectIds: objects.map((o) => o.id),
        maskUrls: objects.map((o) => o.mask_url).filter(Boolean),
        resolution: prepared.processingResolution,
      });
      const cached = bypassCache ? null : generationCache.get(cacheKey);
      if (cached) {
        generationLogger.log({ runId, provider: this.provider.name, prompt, objects, resolution: prepared.processingResolution, credits: 0, durationMs: Math.round(performance.now() - started), cached: true });
        editingEvents.emit({ status: 'done', stage: null });
        return cached;
      }

      // 4. Provider call (validated first).
      stage('generating', { etaMs: 25000 });
      const check = this.provider.validateRequest({ imageUrl: prepared.processingImageUrl, prompt, resolution: prepared.processingResolution });
      if (!check.valid) throw new Error(check.errors.join('. '));
      const generation = await this.provider.editImage({ projectId: project.id, imageUrl: prepared.processingImageUrl, prompt });

      // 5. Quality validation — invalid generations are rejected.
      stage('validating');
      const quality = await qualityValidator.validate(generation.image_url, prepared);
      if (!quality.valid) throw new Error(`Generation rejected: ${quality.errors.join('. ')}`);

      // 6. Composition — untouched pixels come from the original.
      stage('composing');
      const composed = await composer.compose({
        originalUrl: prepared.processingImageUrl,
        generatedUrl: generation.image_url,
        masks: prepared.masks,
      });

      // 7. Restore metadata + package result.
      stage('finalizing');
      const restored = await imagePipeline.restore(composed.image_url, prepared);
      const result = await resultManager.build({
        runId, composed,
        provider: generation.provider,
        creditsUsed: generation.credits_used,
        generationTimeMs: generation.generation_time_ms,
        userPrompt, objects,
        metadata: restored.metadata,
      });

      generationCache.set(cacheKey, result);
      generationLogger.log({ runId, provider: generation.provider, prompt, objects, resolution: prepared.processingResolution, credits: generation.credits_used, durationMs: Math.round(performance.now() - started) });
      editingEvents.emit({ status: 'done', stage: null });
      return result;
    } catch (error) {
      generationLogger.log({ runId, provider: this.provider.name, objects, durationMs: Math.round(performance.now() - started), error: error.message });
      editingEvents.emit({ status: error.code === 'cancelled' ? 'cancelled' : 'error', stage: null, error: error.message });
      throw error;
    }
  }

  async healthCheck() { return this.provider.healthCheck(); }
}

export const editingEngine = new EditingEngine();
