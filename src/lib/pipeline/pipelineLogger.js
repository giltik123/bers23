// PipelineLogger — structured logging for every pipeline run.
const MAX_ENTRIES = 50;

class PipelineLogger {
  constructor() { this.entries = []; }

  logRun({ runId, inputResolution, processingResolution, compressionRatio, cropSize, maskSize, outputResolution, durationMs, stages = [], error = null }) {
    const entry = {
      runId, timestamp: new Date().toISOString(),
      input_resolution: inputResolution, processing_resolution: processingResolution,
      compression_ratio: compressionRatio, crop_size: cropSize, mask_size: maskSize,
      output_resolution: outputResolution, processing_time_ms: durationMs, stages, error,
    };
    this.entries.unshift(entry);
    if (this.entries.length > MAX_ENTRIES) this.entries.pop();
    console.log('[ImagePipeline]', entry);
    return entry;
  }

  logStage(runId, stage, detail = {}) {
    console.log(`[ImagePipeline:${runId}] ${stage}`, detail);
  }

  getRecent(limit = 10) { return this.entries.slice(0, limit); }
}

export const pipelineLogger = new PipelineLogger();