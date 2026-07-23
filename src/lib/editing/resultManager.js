import { imageLoader } from '@/lib/pipeline/imageLoader';
import { previewGenerator } from '@/lib/pipeline/previewGenerator';

// ResultManager — packages a validated, composed generation into everything
// downstream consumers need: full resolution, preview, thumbnail, history entry.
class ResultManager {
  async build({ runId, composed, provider, creditsUsed, generationTimeMs, userPrompt, objects = [], metadata }) {
    const loaded = await imageLoader.load(composed.image_url);
    const [preview, thumbnail] = await Promise.all([
      previewGenerator.generate(loaded.bitmap, 'high'),
      previewGenerator.generate(loaded.bitmap, 'low'),
    ]);

    return {
      runId,
      image_url: composed.image_url,           // full resolution
      preview_url: preview.url,                // lightweight preview (object URL)
      thumbnail_url: thumbnail.url,
      width: loaded.width, height: loaded.height,
      provider,
      credits_used: creditsUsed,
      generation_time_ms: generationTimeMs,
      prompt: userPrompt,
      object_ids: objects.map((o) => o.id),
      object_labels: objects.map((o) => o.label),
      metadata,
      // Ready-made history entry for the Project Engine's pushEdit.
      historyEntry: {
        instruction: userPrompt,
        operation: objects.length ? `edit:${objects.map((o) => o.label).join(',')}` : 'edit:image',
        objectId: objects[0]?.id || null,
        provider,
        credits_used: creditsUsed,
      },
    };
  }
}

export const resultManager = new ResultManager();