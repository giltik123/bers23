import { falDeepFreeze } from './immutable';
import type { FalApiConfiguration, FalCapability, ProviderRequest } from './types';

const DEFAULT_MODELS: Record<FalCapability, string> = {
  'image-edit': 'fal-ai/flux-pro/kontext', 'background-remove': 'fal-ai/birefnet', segmentation: 'fal-ai/sam-2/image',
  upscale: 'fal-ai/clarity-upscaler', inpaint: 'fal-ai/flux-pro/v1/fill', outpaint: 'fal-ai/flux-pro/v1/fill', 'try-on': 'fal-ai/fashn/tryon/v1.6',
};
const ALIASES: Record<string, FalCapability> = { image_edit: 'image-edit', edit: 'image-edit', background_remove: 'background-remove', 'remove-background': 'background-remove', segment: 'segmentation', upscaling: 'upscale', 'virtual-try-on': 'try-on', virtual_try_on: 'try-on' };

export class FalRequestMapper {
  capability(value: string): FalCapability | undefined { const normalized = value.trim().toLowerCase(); return (Object.hasOwn(DEFAULT_MODELS, normalized) ? normalized : ALIASES[normalized]) as FalCapability | undefined; }
  model(value: string, config: FalApiConfiguration): string { const capability = this.capability(value); if (!capability) throw new Error(`Unsupported Fal capability: ${value}`); return config.models?.[capability] ?? DEFAULT_MODELS[capability]; }
  map(request: ProviderRequest): Readonly<Record<string, unknown>> {
    const capability = this.capability(request.capability); if (!capability) throw new Error(`Unsupported Fal capability: ${request.capability}`);
    if (capability === 'try-on') {
      const source = request.inputs ?? {};
      const model = source.model_image; const garment = source.garment_image;
      if (typeof model !== 'string' || typeof garment !== 'string' || !model.startsWith('https://') || !garment.startsWith('https://')) throw new Error('Try-On requires model_image and garment_image HTTPS inputs');
      if (!['tops', 'bottoms', 'one-pieces'].includes(String(source.category))) throw new Error('Try-On category is unsupported');
      return falDeepFreeze({ model_image: model, garment_image: garment, category: source.category,
        garment_photo_type: 'auto', mode: 'quality', num_samples: 1, output_format: 'png', enable_safety_checker: true });
    }
    const input: Record<string, unknown> = { ...(request.inputs ?? {}) };
    if (request.prompt !== undefined) input.prompt = request.prompt;
    if (request.imageUrl !== undefined) input.image_url = request.imageUrl;
    if (request.maskUrl !== undefined) input.mask_url = request.maskUrl;
    if (capability === 'outpaint') input.expand = input.expand ?? true;
    return falDeepFreeze(input);
  }
}
