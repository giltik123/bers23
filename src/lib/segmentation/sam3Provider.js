import { coreClient } from '@/api/coreClient';
import { SegmentationProvider } from '@/lib/segmentation/segmentationProvider';
import { SAM3_CONFIG } from '@/lib/segmentation/sam3Config';
import { createObject } from '@/lib/segmentation/objectManager';
import { saveMask } from '@/lib/segmentation/maskManager';
import { publishSegmentationEvent } from '@/lib/segmentation/segmentationEvents';
import { logSegmentation } from '@/lib/segmentation/segmentationLogger';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NON_RETRYABLE = /invalid_api_key|unsupported|too large|cancelled/i;

// SAM3Provider — fal.ai SAM 3 behind the standard SegmentationProvider interface.
// Fully interchangeable with any future provider; raw API responses never leave this class.
export class SAM3Provider extends SegmentationProvider {
  constructor() {
    super(SAM3_CONFIG.providerName);
    this.cancelled = false;
  }

  emit(event) {
    publishSegmentationEvent({ provider: this.name, ...event });
  }

  throwIfCancelled() {
    if (this.cancelled) throw new Error('Segmentation cancelled');
  }

  cancel() {
    this.cancelled = true;
    this.status = 'cancelled';
    this.emit({ phase: 'cancelled' });
  }

  async healthCheck() {
    try {
      const res = await coreClient.functions.invoke('sam3Segment', { action: 'health' });
      SAM3_CONFIG.healthStatus = res.data?.healthy ? 'healthy' : 'unavailable';
      return { healthy: !!res.data?.healthy, provider: this.name };
    } catch {
      SAM3_CONFIG.healthStatus = 'unavailable';
      return { healthy: false, provider: this.name };
    }
  }

  // Validates format, mime type and file size before anything is sent.
  async validateImage(imageUrl) {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error('Image could not be loaded');
    const blob = await res.blob();
    if (!SAM3_CONFIG.supportedFormats.includes(blob.type)) {
      throw new Error(`Unsupported image format: ${blob.type || 'unknown'}`);
    }
    if (blob.size > SAM3_CONFIG.maxFileSizeBytes) {
      throw new Error('Image file is too large for segmentation');
    }
    return blob;
  }

  // Downscales oversized images (keeps aspect ratio, never upscales), re-uploads.
  async prepareRequest(imageUrl, blob) {
    const bitmap = await createImageBitmap(blob);
    const maxDim = Math.max(bitmap.width, bitmap.height);
    if (maxDim <= SAM3_CONFIG.maxImageDimension) return imageUrl;

    const scale = SAM3_CONFIG.maxImageDimension / maxDim;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const resized = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    const { file_url } = await coreClient.integrations.Core.UploadFile({
      file: new File([resized], 'segment-input.jpg', { type: 'image/jpeg' }),
    });
    return file_url;
  }

  withTimeout(promise) {
    return Promise.race([
      promise,
      sleep(SAM3_CONFIG.timeoutMs).then(() => { throw new Error('Segmentation timed out'); }),
    ]);
  }

  // Up to retryCount attempts with exponential backoff; non-retryable errors abort immediately.
  async invokeWithRetry(imageUrl, projectId) {
    let lastError;
    for (let attempt = 1; attempt <= SAM3_CONFIG.retryCount; attempt++) {
      this.throwIfCancelled();
      if (attempt > 1) {
        this.emit({ phase: 'retrying', attempt, message: `Retrying (attempt ${attempt})` });
        await sleep(1000 * 2 ** (attempt - 2));
        this.throwIfCancelled();
      }
      try {
        const res = await this.withTimeout(coreClient.functions.invoke('sam3Segment', {
          operation_id: 'sam3.segment', project_id: projectId, image_url: imageUrl,
        }));
        return res.data;
      } catch (e) {
        const message = e.response?.data?.error || e.message;
        if (NON_RETRYABLE.test(message)) throw new Error(message);
        lastError = new Error(message);
      }
    }
    throw lastError;
  }

  // Converts the backend response into the internal Object + Mask model.
  parseResponse(data) {
    const objects = (data.objects || []).map((o) => {
      const obj = createObject({
        label: o.label,
        box: o.box,
        confidence: o.confidence ?? null,
        mask_url: o.mask_url || null,
      });
      if (obj.mask_url) {
        const mask = saveMask({ objectId: obj.id, preview: obj.mask_url, status: 'ready' });
        obj.metadata = { ...obj.metadata, mask_id: mask.maskId };
      }
      return obj;
    });
    const masks = objects.filter((o) => o.metadata.mask_id).map((o) => o.metadata.mask_id);
    return { objects, masks };
  }

  async segmentImage(imageUrl, projectId) {
    this.cancelled = false;
    this.status = 'running';
    const started = Date.now();
    try {
      this.emit({ phase: 'validating', message: 'Validating image' });
      const blob = await this.validateImage(imageUrl);
      this.throwIfCancelled();

      this.emit({ phase: 'preparing', message: 'Optimizing image' });
      const preparedUrl = await this.prepareRequest(imageUrl, blob);
      this.throwIfCancelled();

      this.emit({ phase: 'segmenting', message: 'Detecting objects & masks' });
      const apiStart = Date.now();
      const data = await this.invokeWithRetry(preparedUrl, projectId);
      const apiResponseMs = Date.now() - apiStart;
      this.throwIfCancelled();

      this.emit({ phase: 'parsing', message: 'Processing results' });
      const result = this.parseResponse(data);

      logSegmentation({
        provider: this.name,
        durationMs: Date.now() - started,
        apiResponseMs,
        objectsDetected: result.objects.length,
        masksDetected: result.masks.length,
        cacheHit: false,
      });
      this.status = 'completed';
      SAM3_CONFIG.healthStatus = 'healthy';
      this.emit({ phase: 'done' });
      return result;
    } catch (e) {
      this.status = this.cancelled ? 'cancelled' : 'failed';
      logSegmentation({ provider: this.name, durationMs: Date.now() - started, error: e.message });
      this.emit({ phase: this.cancelled ? 'cancelled' : 'error', message: e.message });
      throw e;
    }
  }
}
