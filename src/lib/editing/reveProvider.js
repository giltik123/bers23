import { coreClient } from '@/api/coreClient';
import { EditingProvider } from '@/lib/editing/editingProvider';

// ReveProvider — first EditingProvider implementation. All Reve calls go through the
// server-side 'reveEdit' function; the API key never reaches the client.
export const REVE_CONFIG = {
  name: 'reve',
  label: 'Reve',
  backendFunction: 'reveEdit',   // server-side endpoint holding the API key
  timeoutMs: 90000,
  retries: 2,
  supportedImageTypes: ['image/jpeg', 'image/png', 'image/webp'],
  maxResolution: 2048,
  maxPromptLength: 2000,
  asyncGeneration: true,
};

const RETRYABLE = ['timeout', 'offline', 'rate_limit', 'generation_failed'];

class ReveProvider extends EditingProvider {
  constructor() { super(REVE_CONFIG); }

  validateRequest({ imageUrl, prompt, resolution }) {
    const errors = [];
    if (!imageUrl) errors.push('Prepared image is missing');
    if (!prompt?.trim()) errors.push('Prompt is empty');
    if (prompt && prompt.length > this.config.maxPromptLength) errors.push('Prompt is too long');
    if (resolution && Math.max(resolution.width, resolution.height) > this.config.maxResolution) errors.push('Image exceeds maximum resolution');
    return { valid: errors.length === 0, errors };
  }

  preparePayload({ projectId, imageUrl, prompt }) {
    return { operation_id: 'reve.edit', project_id: projectId, image_url: imageUrl, prompt: prompt.slice(0, this.config.maxPromptLength) };
  }

  parseResponse(data) {
    if (!data?.image_url) throw new Error(data?.error || 'Generation failed');
    return { image_url: data.image_url, provider: this.name, generation_time_ms: data.generation_time_ms, credits_used: data.credits_used ?? 1 };
  }

  async editImage(request) {
    this.resetCancel();
    const payload = this.preparePayload(request);
    let lastError;
    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      if (this.cancelled) throw Object.assign(new Error('Generation cancelled'), { code: 'cancelled' });
      try {
        const response = await coreClient.functions.invoke(this.config.backendFunction, payload);
        if (response.data?.error) throw Object.assign(new Error(response.data.error), { code: response.data.code });
        if (this.cancelled) throw Object.assign(new Error('Generation cancelled'), { code: 'cancelled' });
        return this.parseResponse(response.data);
      } catch (e) {
        const code = e.code || e.response?.data?.code;
        lastError = Object.assign(new Error(e.response?.data?.error || e.message), { code });
        if (code === 'cancelled' || !RETRYABLE.includes(code) || attempt === this.config.retries) throw lastError;
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
    }
    throw lastError;
  }

  async healthCheck() {
    const response = await coreClient.functions.invoke(this.config.backendFunction, { action: 'health' });
    return { ok: !!response.data?.ok, provider: this.name };
  }
}

export const reveProvider = new ReveProvider();
