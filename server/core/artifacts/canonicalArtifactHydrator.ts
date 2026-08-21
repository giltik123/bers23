import sharp from 'sharp';
import type { CreativeArtifact } from '../../../src/platform/creative/canonical/contracts.ts';
import type { Scope } from '../../../src/platform/creative/workflow-engine/types.ts';
import type { SignedArtifactAuthority } from './signedArtifactAuthority.ts';

/** Infrastructure boundary that turns authorized opaque references into canonical pixels. */
export class CanonicalArtifactHydrator {
  constructor(private readonly authority: SignedArtifactAuthority, private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis)) {}
  async hydrate(scope: Scope, originalId: string, maskIds: readonly string[]): Promise<readonly CreativeArtifact[]> {
    const originalClaim = this.authority.resolve(originalId, scope);
    const original = await decodeImage(await this.load(originalClaim.url));
    const artifacts: CreativeArtifact[] = [{ id: originalId, kind: 'image', value: original, producerOperationId: 'user-input', scope, state: 'AVAILABLE', role: 'ORIGINAL', image: imageMetadata(original) }];
    for (const id of maskIds) {
      const claim = this.authority.resolve(id, scope); const decoded = await decodeImage(await this.load(claim.url));
      if (decoded.width !== original.width || decoded.height !== original.height) throw new Error('Canonical MASK dimensions must match ORIGINAL');
      const alpha = new Uint8Array(decoded.width * decoded.height);
      for (let pixel = 0; pixel < alpha.length; pixel += 1) alpha[pixel] = decoded.data[pixel * 4 + 3];
      artifacts.push({ id, kind: 'mask', value: { width: decoded.width, height: decoded.height, alpha, source: 'USER', coordinateSpace: 'ORIGINAL' }, producerOperationId: 'user-input', scope, state: 'AVAILABLE', role: 'MASK', image: imageMetadata(decoded) });
    }
    return artifacts;
  }
  private async load(url: string): Promise<Uint8Array> { const response = await this.fetcher(url); if (!response.ok) throw new Error(`Artifact hydration failed (${response.status})`); return new Uint8Array(await response.arrayBuffer()); }
}

async function decodeImage(bytes: Uint8Array) { const result = await sharp(bytes).ensureAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true }); return { width: result.info.width, height: result.info.height, data: new Uint8ClampedArray(result.data), format: 'RGBA8', orientation: 1 as const, colorSpace: 'srgb' }; }
function imageMetadata(image: Awaited<ReturnType<typeof decodeImage>>) { return { width: image.width, height: image.height, format: image.format, orientation: image.orientation, colorSpace: image.colorSpace, alpha: true }; }
