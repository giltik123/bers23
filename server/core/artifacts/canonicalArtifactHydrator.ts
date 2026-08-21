import sharp from 'sharp';
import type { CreativeArtifact } from '../../../src/platform/creative/canonical/contracts.ts';
import type { Scope } from '../../../src/platform/creative/workflow-engine/types.ts';
import type { ArtifactAuthority } from './artifactAuthority.ts';

/** Infrastructure boundary that turns authorized opaque references into canonical pixels. */
export class CanonicalArtifactHydrator {
  private readonly authority: ArtifactAuthority; private readonly fetcher: typeof fetch;
  constructor(authority: ArtifactAuthority, fetcher: typeof fetch = globalThis.fetch.bind(globalThis)) { this.authority = authority; this.fetcher = fetcher; }
  async hydrate(scope: Scope, originalId: string, maskIds: readonly string[]): Promise<readonly CreativeArtifact[]> {
    const originalClaim = this.authority.external.resolve(originalId, scope);
    const original = await decodeImage(await this.load(originalClaim.url));
    const artifacts: CreativeArtifact[] = [{ id: originalId, kind: 'image', value: original, producerOperationId: 'user-input', scope, state: 'AVAILABLE', role: 'ORIGINAL', image: imageMetadata(original) }];
    for (const id of maskIds) {
      const claim = this.authority.external.resolveStoredMask(id, scope); const stored = await this.authority.masks.load(claim.storageId, scope);
      if (!stored) throw new Error('Canonical MASK is unavailable');
      const decoded = await decodeMask(stored.png);
      if (decoded.width !== stored.width || decoded.height !== stored.height || decoded.width !== original.width || decoded.height !== original.height) throw new Error('Canonical MASK dimensions must match ORIGINAL');
      artifacts.push({ id, kind: 'mask', value: { width: decoded.width, height: decoded.height, alpha: decoded.alpha, source: 'USER', coordinateSpace: 'ORIGINAL' }, producerOperationId: 'user-input', scope, state: 'AVAILABLE', role: 'MASK', image: { width: decoded.width, height: decoded.height, format: 'ALPHA8', orientation: 1, colorSpace: 'gray', alpha: true } });
    }
    return artifacts;
  }
  private async load(url: string): Promise<Uint8Array> { const response = await this.fetcher(url); if (!response.ok) throw new Error(`Artifact hydration failed (${response.status})`); return new Uint8Array(await response.arrayBuffer()); }
}

async function decodeImage(bytes: Uint8Array) { const result = await sharp(bytes).ensureAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true }); return { width: result.info.width, height: result.info.height, data: new Uint8ClampedArray(result.data), format: 'RGBA8', orientation: 1 as const, colorSpace: 'srgb' }; }
async function decodeMask(bytes: Uint8Array) { const result = await sharp(bytes).toColourspace('b-w').raw().toBuffer({ resolveWithObject: true }); if (result.info.channels !== 1) throw new Error('Stored canonical MASK must decode as one grayscale channel'); return { width: result.info.width, height: result.info.height, alpha: new Uint8Array(result.data) }; }
function imageMetadata(image: Awaited<ReturnType<typeof decodeImage>>) { return { width: image.width, height: image.height, format: image.format, orientation: image.orientation, colorSpace: image.colorSpace, alpha: true }; }
