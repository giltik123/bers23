import { base44 } from '@/api/base44Client';

// FashnProvider — the ONLY module that talks to the FASHN try-on backend.
class FashnProvider {
  constructor() { this.name = 'fashn'; this.cancelled = false; }

  cancel() { this.cancelled = true; }

  validateRequest({ modelImageUrl, garmentImageUrl }) {
    const errors = [];
    if (!modelImageUrl) errors.push('Missing model image');
    if (!garmentImageUrl) errors.push('Missing garment image');
    return { valid: errors.length === 0, errors };
  }

  async tryOn({ modelImageUrl, garmentImageUrl, category }) {
    this.cancelled = false;
    const response = await base44.functions.invoke('fashnTryon', {
      model_image: modelImageUrl,
      garment_image: garmentImageUrl,
      category,
    });
    if (this.cancelled) throw Object.assign(new Error('Try-on cancelled'), { code: 'cancelled' });
    return response.data; // { image_url, provider, generation_time_ms, credits_used }
  }
}

export const fashnProvider = new FashnProvider();