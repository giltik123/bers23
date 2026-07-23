import { imageLoader } from '@/lib/pipeline/imageLoader';
import { imageValidator } from '@/lib/pipeline/imageValidator';
import { metadataManager } from '@/lib/pipeline/metadataManager';
import { imageOptimizer } from '@/lib/pipeline/imageOptimizer';
import { resolutionManager } from '@/lib/pipeline/resolutionManager';
import { colorManager } from '@/lib/pipeline/colorManager';
import { maskProcessor } from '@/lib/pipeline/maskProcessor';
import { cropManager } from '@/lib/pipeline/cropManager';
import { previewGenerator } from '@/lib/pipeline/previewGenerator';
import { exportManager } from '@/lib/pipeline/exportManager';
import { pipelineLogger } from '@/lib/pipeline/pipelineLogger';
import { pipelineEvents } from '@/lib/pipeline/pipelineEvents';
import { base44 } from '@/api/base44Client';

// ImagePipeline — the mandatory processing layer between Segmentation and every AI editing provider.
// Providers must ONLY receive the payload produced by prepare(), and results must go through restore().
class ImagePipeline {
  // prepare({ imageUrl, objects, maskOptions }) → provider-ready payload
  async prepare({ imageUrl, objects = [], maskOptions = {} }) {
    const runId = `run_${Date.now().toString(36)}`;
    const started = performance.now();
    const stages = [];
    const stage = (name, detail) => { stages.push(name); pipelineLogger.logStage(runId, name, detail); pipelineEvents.emit({ status: 'processing', stage: name }); };

    try {
      // 1. Load + Validate
      stage('validation');
      const loaded = await imageLoader.load(imageUrl);
      const validation = imageValidator.validate(loaded);
      if (!validation.valid) throw new Error(validation.errors.join('. '));

      // 2. Metadata read (before optimization strips it)
      stage('metadata');
      const metadata = await metadataManager.read(loaded.blob, loaded);
      const colorSnapshot = colorManager.snapshot(loaded.bitmap);

      // 3. Optimization
      stage('optimization');
      const optimized = await imageOptimizer.optimize(loaded);

      // 4. Resolution selection
      stage('resolution');
      const tier = resolutionManager.selectProcessingTier(optimized.width, optimized.height);
      const procDims = resolutionManager.dimensionsFor(tier, optimized.width, optimized.height);

      // 5. Mask processing (per selected object with a mask)
      stage('masks');
      const masked = objects.filter((o) => o.mask_url);
      const masks = await Promise.all(masked.map((o) =>
        maskProcessor.process(o.mask_url, { width: procDims.width, height: procDims.height, ...maskOptions })
          .then((m) => ({ objectId: o.id, ...m }))
      ));

      // 6. Crop generation
      stage('crop');
      const crop = cropManager.cropFor(objects);
      const cropPx = cropManager.toPixels(crop, procDims.width, procDims.height);

      // 7. Preview generation (non-blocking)
      stage('preview');
      const preview = await previewGenerator.generate(optimized.bitmap, 'medium');

      // Upload the processing-resolution image once so providers get a stable URL.
      const procCanvas = imageLoader.toCanvas(optimized.bitmap, procDims.width, procDims.height);
      const procBlob = await imageLoader.canvasToBlob(procCanvas, 'image/jpeg', 0.92);
      const { file_url: processingImageUrl } = await base44.integrations.Core.UploadFile({
        file: new File([procBlob], 'processing.jpg', { type: 'image/jpeg' }),
      });

      const durationMs = Math.round(performance.now() - started);
      pipelineLogger.logRun({
        runId,
        inputResolution: `${loaded.width}x${loaded.height}`,
        processingResolution: `${procDims.width}x${procDims.height}`,
        compressionRatio: optimized.compressionRatio,
        cropSize: `${cropPx.w}x${cropPx.h}`,
        maskSize: masks[0] ? `${masks[0].width}x${masks[0].height}` : null,
        outputResolution: `${loaded.width}x${loaded.height}`,
        durationMs, stages,
      });
      pipelineEvents.emit({ status: 'ready', stage: null, run: { runId, tier, procDims, original: { width: loaded.width, height: loaded.height }, durationMs } });

      return {
        runId, processingImageUrl, tier,
        processingResolution: procDims,
        originalResolution: { width: loaded.width, height: loaded.height },
        masks, crop, cropPx, preview, metadata, colorSnapshot,
      };
    } catch (error) {
      const durationMs = Math.round(performance.now() - started);
      pipelineLogger.logRun({ runId, durationMs, stages, error: error.message });
      pipelineEvents.emit({ status: 'error', stage: null, run: { runId, error: error.message, durationMs } });
      throw error;
    }
  }

  // restore(resultUrl, prepared) — upscale-verify the AI result back to original terms + reattach metadata.
  async restore(resultUrl, prepared) {
    pipelineEvents.emit({ status: 'processing', stage: 'restore' });
    const result = await imageLoader.load(resultUrl);
    const resultSnapshot = colorManager.snapshot(result.bitmap);
    const colorCheck = colorManager.verify(prepared.colorSnapshot, resultSnapshot);
    const restored = metadataManager.restore(
      { image_url: resultUrl, width: result.width, height: result.height, colorCheck },
      prepared.metadata,
    );
    pipelineEvents.emit({ status: 'ready', stage: null });
    return restored;
  }

  // exportResult — final export in the requested format/resolution.
  async exportResult(imageUrl, options) {
    pipelineEvents.emit({ status: 'processing', stage: 'export' });
    const out = await exportManager.exportImage(imageUrl, options);
    pipelineEvents.emit({ status: 'ready', stage: null });
    return out;
  }
}

export const imagePipeline = new ImagePipeline();