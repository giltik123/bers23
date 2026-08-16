import { SegmentationProvider } from '@/lib/segmentation/segmentationProvider';
import { aiService } from '@/lib/aiService';
import { createObject } from '@/lib/segmentation/objectManager';

// DetectionProvider — wraps the app's existing object detection behind the
// provider interface. Interchangeable with a future SAM3 provider.
export class DetectionProvider extends SegmentationProvider {
  constructor() {
    super('legacy_platform-detection');
  }

  async segmentImage(imageUrl, projectId) {
    this.status = 'running';
    try {
      const { objects: found } = await aiService.detectObjects(projectId, imageUrl);
      const objects = (found || []).map((o) =>
        createObject({
          id: o.id,
          label: o.label,
          box: o.box,
          mask_url: o.mask_url || null,
          confidence: o.confidence ?? null,
        })
      );
      this.status = 'completed';
      return { objects, masks: [] };
    } catch (e) {
      this.status = 'failed';
      throw e;
    }
  }

  async healthCheck() {
    return { healthy: true, provider: this.name };
  }
}
