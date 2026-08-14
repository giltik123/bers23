import { FalProviderError } from './FalErrorMapper';
import { falDeepFreeze } from './immutable';
import type { ArtifactLoader, ProviderArtifact } from './types';

export class DefaultArtifactLoader implements ArtifactLoader {
  async load(url: string, options: { fetch: typeof fetch; maxBytes: number; allowedMimeTypes: readonly string[] }): Promise<ProviderArtifact> {
    const response = await options.fetch(url); if (!response.ok) throw new FalProviderError('provider unavailable', 'Fal artifact download failed', true, response.status);
    const mimeType = (response.headers.get('content-type') ?? '').split(';')[0].toLowerCase(); if (!options.allowedMimeTypes.includes(mimeType)) throw new FalProviderError('validation', `Unsupported artifact MIME: ${mimeType || 'missing'}`, false);
    const length = Number(response.headers.get('content-length') ?? 0); if (length > options.maxBytes) throw new FalProviderError('validation', 'Fal artifact exceeds size limit', false);
    const bytes = new Uint8Array(await response.arrayBuffer()); if (bytes.byteLength > options.maxBytes) throw new FalProviderError('validation', 'Fal artifact exceeds size limit', false);
    const digest = await crypto.subtle.digest('SHA-256', bytes); const hash = [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, '0')).join('');
    return falDeepFreeze({ url, mimeType, size: bytes.byteLength, hash, bytes });
  }
}
